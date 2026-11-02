// Orchestrator for the 067 pre-approval verification (temporary, test-only). Writes only the report and verification screenshots.
// ROUND 2 COPY (test-only infra update by the independent Tester, 2026-10-20): derived from the round 1 runner (digest ff2969b0...).
// Changes are limited to: externally supplied revision binding, the stale 868935-byte literal, new default output paths and an
// overwrite guard, a preservation manifest that covers earlier evidence, and the added r2 group (checks-r2.mjs). No assertion
// of the round 1 selection was removed, weakened, skipped, or re-thresholded.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverBrowser, diffManifests, launchBrowser, manifest, manifestDigest, sha256Bytes, sha256File, shutdownBrowser, sleep, evalFn, listProcesses } from './cdp.mjs';
import { makeCheckRegistry, makeEnv, VP } from './harness.mjs';
import * as P from './probes.mjs';
import * as O from './oracle.mjs';
import { listChecks } from './checks-list.mjs';
import { nowChecks } from './checks-now.mjs';
import { captureChecks } from './checks-capture.mjs';
import { appearanceChecks } from './checks-appearance.mjs';
import { observationChecks } from './checks-obs.mjs';
import { ADDED_CHECK_IDS, revisionBindingChecks, round2Checks } from './checks-r2.mjs';

// Externally supplied revision binding (round 2). The hashes come from the requester; the runtime length was read from the actual file.
const EXTERNAL = {
  html: '6eaf6bc8642e31d8e523a818ba9b9802ec63f2755a70cb48a92e10e07bc4cdc5',
  runtime: '27646058794769c0f2bd8be825939969d0e5323978ce48174aec783bfd3ec2e3',
  legal: '20c1596d99736bf8f9c18e6e056c97495c9362c406a9984c889361706f002758',
  runtimeBytes: 870043,
};
// The round 1 runner this copy was derived from (recorded in design/verification/report.json), for the runner-update record.
const BASE_RUNNER = {
  digest: 'ff2969b0f0f721d52e3384fccf146feabe07daec4ba0effe60d2b850c501ee60',
  dir: 'C:\\Users\\EG\\AppData\\Local\\Temp\\dude-067-verify-20261019-234257-829bf3',
  files: { 'cdp.mjs': 'a50d673e91cb5bc243c2316796a924fd740b46cd3f26cf24322bdcbaffa46d52', 'checks-appearance.mjs': '66bec4de750cbd30ac15bc2d233d798884d1f1f4e0cef9e633a38c9129c09787',
    'checks-capture.mjs': '1c5cf363a29fac6beaef460553d2fc139b03ca77cfad68d6321fd1f68ed065a3', 'checks-list.mjs': 'a45c339f1f5cabbf5aee98ee5794540acae774b3cf7e263e8100c020c1435507',
    'checks-now.mjs': 'c6ac0614b51bd4a3306c38df735bb660ad508f706cb325c1e3ce42b3d8c1983d', 'checks-obs.mjs': 'd26027e097085114a94c0257e00dc8683b0a2c4cc90cb72728378b6dbd6a69d6',
    'harness.mjs': '70755cdfe13b45d400e241abf2313c077e861061653e4b16bd8a8b75a5a5c31b', 'oracle.mjs': '18d38485bc25748e84f79d50a59fd1b3db7f4407e54692dd5aaa1c92326cf8c2',
    'probes.mjs': '1cd40b7259c38fb22848d9c1818da0fa3bd007c7784676a869255874bf2217c4', 'run.mjs': '555bd3f20d7c1d295661ee1c7e4a5b81187ac670909096bee5ded9ac862e7971' },
};

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : fallback; };
const flag = name => argv.includes(`--${name}`);
const repo = path.resolve(arg('repo') ?? process.cwd());
const packageDir = path.join(repo, '.dude', 'specs', '067-work-type-presentation');
const designDir = path.join(packageDir, 'design');
const outDir = path.resolve(arg('out') ?? path.join(designDir, 'verification', 'round-2-independent'));
const shotsDir = path.resolve(arg('shots') ?? path.join(designDir, 'screenshots', 'verification-round-2-independent'));
const only = (arg('only') ?? 'bind,list,now,capture,appearance,obs,r2').split(',');
const quick = flag('quick');
const startedAt = new Date();
const rel = file => path.relative(repo, file).split(path.sep).join('/');

// Round 2 guard: never write into a location that already holds evidence (earlier reports and screenshots are history).
if (fs.existsSync(path.join(outDir, 'report.json')) || (fs.existsSync(shotsDir) && fs.readdirSync(shotsDir).length > 0)) {
  console.error(`Refusing to run: ${outDir} already holds a report or ${shotsDir} already holds files. Earlier evidence is never overwritten.`);
  process.exit(2);
}

const PRODUCT_ROOTS = ['src/extensions/dude', '.github/extensions/dude', 'scripts/dude-canvas-ui'];
const WIDE_ROOTS = ['.dude', '.github', 'docs', 'library', 'scripts', 'src', 'README.md', '.gitattributes', '.gitignore']; // every tracked tree except .git and node_modules
const PACKAGE_PREFIX = '.dude/specs/067-work-type-presentation/';
// Round 2: only this run's own output roots are exempt, so earlier reports and screenshots are inside the preservation manifest.
const ownPrefixes = [outDir, shotsDir].map(dir => `${rel(dir)}/`);
const isOwnOutput = relative => ownPrefixes.some(prefix => relative.startsWith(prefix));

const before = {
  product: manifest(repo, PRODUCT_ROOTS),
  ideas: manifest(repo, ['.dude/ideas']),
  pkg: manifest(repo, ['.dude/specs/067-work-type-presentation'], isOwnOutput),
  wide: manifest(repo, WIDE_ROOTS, isOwnOutput),
};
const digestBefore = { product: manifestDigest(before.product), ideas: manifestDigest(before.ideas), pkg: manifestDigest(before.pkg), wide: manifestDigest(before.wide) };

const registry = makeCheckRegistry();
const data = O.loadData(packageDir);
const oracle = { data, fixtures: O.fixtureExpectations(data.fixtures), snapshot: O.snapshotExpectations(data.snapshot) };

const subject = {};
const hashFile = file => ({ path: rel(file), sha256: sha256File(file), bytes: fs.statSync(file).size });
subject.html = hashFile(path.join(designDir, 'work-type-presentation.html'));
subject.runtime = hashFile(path.join(designDir, 'work-type-presentation.js'));
subject.legal = hashFile(path.join(designDir, 'work-type-presentation.js.LEGAL.txt'));
subject.sources = Object.fromEntries(['fixtures.json', 'repository-snapshot.json', 'work-type-presentation.jsx', 'styles.js', 'theme.js']
  .map(name => [name, hashFile(path.join(designDir, 'source', name))]));
const runnerFiles = fs.readdirSync(here).filter(name => name.endsWith('.mjs') && !['smoke.mjs', 'explore.mjs', 'drive.mjs'].includes(name) && !name.startsWith('x-')).sort();
const runner = { dir: here, files: runnerFiles.map(name => ({ name, sha256: sha256File(path.join(here, name)) })) };
runner.digest = sha256Bytes(Buffer.from(runner.files.map(file => `${file.name}\0${file.sha256}`).join('\n')));

const net = { fetch: 0, fetchRejected: 0, fetchResolved: 0, xhr: 0, beacon: 0, websocket: 0, eventsource: 0, urls: [] };
const NET_KEYS = ['fetch', 'fetchRejected', 'fetchResolved', 'xhr', 'beacon', 'websocket', 'eventsource'];
let ctx = null, env = null, cleanup = null, fatal = null, bodyHash = null;

async function bindingChecks() {
  const b = registry.create('B.binding', 'bind', 'Artifact binding: runtime hash stated in the HTML matches the file; copied styles/theme equal the product files; stated product hashes match');
  const htmlText = fs.readFileSync(path.join(designDir, 'work-type-presentation.html'), 'utf8');
  const stated = name => htmlText.match(new RegExp(`${name.replace('.', '\\.')}\\s+([0-9a-f]{64})`))?.[1] ?? null;
  const runtimeStated = htmlText.match(/work-type-presentation\.js\s+\(\d+ bytes, SHA256 ([0-9a-f]{64})\)/)?.[1] ?? null;
  const runtimeStatedBytes = htmlText.match(/work-type-presentation\.js\s+\((\d+) bytes, SHA256 [0-9a-f]{64}\)/)?.[1] ?? null;
  b.eq(runtimeStated, subject.runtime.sha256, 'HTML-stated runtime SHA-256 equals the runtime file');
  // Round 2 update: round 1 compared against the literal 868935; the length is now read from the HTML and from the externally supplied value.
  b.eq(subject.runtime.bytes, runtimeStatedBytes === null ? null : Number(runtimeStatedBytes), 'runtime byte length equals the length stated in the HTML');
  b.eq(subject.runtime.bytes, EXTERNAL.runtimeBytes, 'runtime byte length equals the externally supplied length');
  b.eq(subject.html.sha256, EXTERNAL.html, 'HTML SHA-256 equals the externally supplied revision hash');
  b.eq(subject.runtime.sha256, EXTERNAL.runtime, 'runtime SHA-256 equals the externally supplied revision hash');
  b.eq(subject.legal.sha256, EXTERNAL.legal, 'legal sidecar SHA-256 equals the externally supplied revision hash (unchanged)');
  const product = name => sha256File(path.join(repo, 'src', 'extensions', 'dude', 'frontend', name));
  b.eq(stated('styles.js'), subject.sources['styles.js'].sha256, 'HTML-stated styles.js hash equals the design copy');
  b.eq(subject.sources['styles.js'].sha256, product('styles.js'), 'design styles.js equals the product styles.js byte for byte');
  b.eq(stated('theme.js'), subject.sources['theme.js'].sha256, 'HTML-stated theme.js hash equals the design copy');
  b.eq(subject.sources['theme.js'].sha256, product('theme.js'), 'design theme.js equals the product theme.js byte for byte');
  b.eq(stated('app.jsx'), product('app.jsx'), 'HTML-stated app.jsx hash equals the current product app.jsx (the mock was composed from these bytes)');
  b.eq(stated('needs-you.jsx'), product('needs-you.jsx'), 'HTML-stated needs-you.jsx hash equals the current product needs-you.jsx');
  b.matches(htmlText, /connect-src 'none'/, 'HTML carries a Content-Security-Policy with connect-src none');
  b.matches(htmlText, /<script src="\.\/work-type-presentation\.js"><\/script>/, 'HTML loads exactly the one sibling runtime');
  const legal = fs.readFileSync(path.join(designDir, 'work-type-presentation.js.LEGAL.txt'), 'utf8');
  b.ok(legal.length > 1000 && /react/i.test(legal) && /fluentui/i.test(legal), 'legal sidecar exists and names React and Fluent UI');
  b.note(`legal sidecar ${legal.length} chars`);
  b.done();

  const s = registry.create('B.state', 'bind', 'Package state matches the pre-approval hold: design exploring, no approval, tasks header-only, no ledger carries work_intent / work_domain, fixtures do not collide with real numbers');
  const spec = fs.readFileSync(path.join(packageDir, 'spec.md'), 'utf8');
  s.matches(spec, /^design_status: exploring$/m, 'spec design_status is exploring');
  s.matches(spec, /^approved_direction:\s*$/m, 'spec approved_direction is empty');
  const tasks = fs.readFileSync(path.join(packageDir, 'tasks.md'), 'utf8');
  s.eq((tasks.match(/^\s*-?\s*\[[ ~!x]\]/gm) ?? []).length + (tasks.match(/T\d{3}@[0-9a-f]{8}/g) ?? []).length, 0, 'tasks.md carries no task unit');
  const ideas = fs.readdirSync(path.join(repo, '.dude', 'ideas')).filter(name => name.endsWith('.md'));
  let withKeys = 0;
  for (const name of ideas) {
    const head = fs.readFileSync(path.join(repo, '.dude', 'ideas', name), 'utf8').split(/\r?\n/).slice(0, 40);
    const end = head.indexOf('---', 1);
    if (head[0] === '---' && head.slice(1, end < 0 ? 40 : end).some(line => /^\s*work_(intent|domain)\s*:/.test(line))) withKeys += 1;
  }
  s.eq(withKeys, 0, 'ledgers whose frontmatter carries work_intent or work_domain');
  s.eq(ideas.length, data.snapshot.records.length, 'ledger count equals the snapshot record count');
  s.eq(ideas.filter(name => /^9\d\d-/.test(name)).length, 0, 'real ledgers numbered 9xx (fixtures 901-913 collide with none)');
  s.note(`${ideas.length} ledgers scanned read-only`);
  s.done();

  const k = registry.create('K.contract-notes', 'bind', 'Plan progress contract vs mock report: the recorded design status ("Exploring") has no progress field in the plan', { observation: true });
  const plan = fs.readFileSync(path.join(packageDir, 'plan.md'), 'utf8').split(/\r?\n/);
  const jsx = fs.readFileSync(path.join(designDir, 'source', 'work-type-presentation.jsx'), 'utf8').split(/\r?\n/);
  const line = (lines, pattern) => lines.findIndex(entry => pattern.test(entry)) + 1;
  const contractLines = plan.filter(entry => /^progress\.(subject|stage|phases|checkpoints|gates|requests|unknown)\b/.test(entry)).map(entry => entry.split(/\s+/)[0]);
  const planHasDesignField = plan.some(entry => /^progress\.design\b/.test(entry));
  const mockDesignLine = line(jsx, /report\.design = /);
  k.eq(contractLines, ['progress.subject', 'progress.stage', 'progress.phases', 'progress.checkpoints', 'progress.gates', 'progress.requests', 'progress.unknown'], 'plan Contracts list these progress fields');
  k.ok(mockDesignLine > 0, 'mock progressReport adds report.design');
  k.ok(planHasDesignField, 'plan Contracts list a progress.design (recorded design status) field to match the mock');
  k.note(`plan.md:L${line(plan, /^progress\.checkpoints/)} lists checkpoints only (design-proposed | design-approved) and L${line(plan, /^progress\.unknown/)} names "design" among unknown parts; the mock's progressReport adds report.design {status, source} at work-type-presentation.jsx:L${mockDesignLine} so Exploring can be shown (spec US3.1 and Edge Cases; FR-027 limits checkpoints to Proposed and Approved). Additive, so not a failure of the mock; the plan contract needs the field, or the mock needs to derive it from projection.design, before settle.`);
  k.done();
}

try {
  if (only.includes('bind')) {
    await bindingChecks();
    revisionBindingChecks({ registry, repo, packageDir, designDir, ownPrefixes, digestBefore });
  }
  const browserPath = discoverBrowser();
  ctx = await launchBrowser(browserPath, here);
  const { page } = ctx;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: P.NET_PROBE_SOURCE });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  env = makeEnv({ repo, packageDir, outDir, shotsDir, page, registry, oracle, data });
  const baseOpen = env.open.bind(env);
  env.open = async (...args) => {
    const previous = await evalFn(page, P.netCounters).catch(() => null);
    if (previous) { for (const key of NET_KEYS) net[key] += previous[key]; net.urls.push(...previous.urls); }
    return baseOpen(...args);
  };
  // bind the executed runtime bytes to the file (first navigation only)
  await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
  const scriptRequest = page.state.scriptIds.find(entry => /work-type-presentation\.js$/.test(entry.url));
  try {
    const body = await page.send('Network.getResponseBody', { requestId: scriptRequest.id });
    bodyHash = sha256Bytes(Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8'));
  } catch (error) { bodyHash = `unavailable: ${error.message}`; }
  const c = registry.create('B.runtime-loaded', 'bind', 'The browser executed the exact runtime file named by the HTML');
  const docInfo = await evalFn(page, () => ({ href: location.href, scripts: [...document.scripts].map(script => script.src).filter(Boolean) }));
  c.ok(docInfo.href.startsWith('file:///') && docInfo.href.includes('/.dude/specs/067-work-type-presentation/design/work-type-presentation.html'), `page URL ${docInfo.href.slice(0, 120)}`);
  c.eq(docInfo.scripts.map(src => src.split('/').at(-1)), ['work-type-presentation.js'], 'the page executes exactly one external script');
  c.ok(bodyHash === subject.runtime.sha256 || String(bodyHash).startsWith('unavailable'), `network body SHA-256 ${bodyHash} equals the file hash ${subject.runtime.sha256}`);
  // Round 2 addition: the claim "the browser executed the externally bound bytes" needs the body itself, so an unavailable body is not accepted here.
  c.ok(/^[0-9a-f]{64}$/.test(String(bodyHash)) && bodyHash === EXTERNAL.runtime, `the browser's network response body SHA-256 (${bodyHash}) equals the externally supplied runtime hash`);
  c.note(`network response body hash: ${bodyHash}`);
  c.done();

  if (only.includes('list')) await listChecks(env);
  if (only.includes('now')) await nowChecks(env);
  if (only.includes('capture')) await captureChecks(env);
  if (only.includes('appearance')) await appearanceChecks(env, { quick });
  if (only.includes('obs')) await observationChecks(env);
  if (only.includes('r2')) await round2Checks(env);
  const final = await evalFn(page, P.netCounters).catch(() => null);
  if (final) { for (const key of NET_KEYS) net[key] += final[key]; net.urls.push(...final.urls); }

  const n = registry.create('X.no-network', 'M12', 'No network call, live provider, or ledger mutation: nothing left the page (CDP saw only file:// document and script loads); any fetch the unchanged theme hook attempted was refused by the mock before a request existed');
  const requests = page.state.allRequests;
  const nonLocal = requests.filter(entry => !/^(file|data|about|blob):/.test(entry.url));
  n.eq(nonLocal, [], 'requests whose scheme is not file/data/about/blob');
  n.eq(page.state.allSockets, [], 'WebSocket connections');
  n.eq({ xhr: net.xhr, beacon: net.beacon, websocket: net.websocket, eventsource: net.eventsource }, { xhr: 0, beacon: 0, websocket: 0, eventsource: 0 }, 'page-side XHR / beacon / WebSocket / EventSource calls');
  n.eq({ resolved: net.fetchResolved, refusedOfAttempted: net.fetch - net.fetchRejected }, { resolved: 0, refusedOfAttempted: 0 }, 'fetch attempts that were not refused by the mock stub');
  n.ok(net.urls.every(url => url === '/api/canvas-preferences'), `every attempted fetch targeted the product theme hook's preference route (${JSON.stringify([...new Set(net.urls)])})`);
  n.note(`${requests.length} browser requests observed across the run; types ${JSON.stringify([...new Set(requests.map(entry => entry.type))])}; schemes ${JSON.stringify([...new Set(requests.map(entry => entry.url.split(':')[0]))])}`);
  n.note(`attempted-and-refused fetch calls: ${net.fetch} (the unchanged theme.js re-reads /api/canvas-preferences on window focus; the mock's fetch stub rejected every one and CDP recorded no resulting request)`);
  net.summary = { attempted: net.fetch, refused: net.fetchRejected, resolved: net.fetchResolved };
  n.done();
} catch (error) {
  fatal = error;
  registry.checks.push({ id: 'X.runner', group: 'bind', title: 'Runner completed without an internal error', assertions: 1, failures: [String(error.stack ?? error).slice(0, 600)], notes: [], evidence: [], status: 'fail' });
} finally {
  if (ctx) cleanup = await shutdownBrowser(ctx);
}

/* ------------------------------------------------------------------ after-run bindings and report */
const after = {
  product: manifest(repo, PRODUCT_ROOTS),
  ideas: manifest(repo, ['.dude/ideas']),
  pkg: manifest(repo, ['.dude/specs/067-work-type-presentation'], isOwnOutput),
  wide: manifest(repo, WIDE_ROOTS, isOwnOutput),
};
const digestAfter = { product: manifestDigest(after.product), ideas: manifestDigest(after.ideas), pkg: manifestDigest(after.pkg), wide: manifestDigest(after.wide) };
const diffs = Object.fromEntries(Object.keys(before).map(key => [key, diffManifests(before[key], after[key])]));
const ownOutputs = [];
for (const root of [outDir, shotsDir]) { if (fs.existsSync(root)) for (const entry of fs.readdirSync(root, { withFileTypes: true })) ownOutputs.push(rel(path.join(root, entry.name))); }
const subjectAfter = { html: sha256File(path.join(designDir, 'work-type-presentation.html')), runtime: sha256File(path.join(designDir, 'work-type-presentation.js')) };
const pres = registry.create('P.preservation', 'bind', 'Product UI source, ledgers, and every pre-existing package file are byte-identical before and after the run');
pres.eq(digestAfter.product, digestBefore.product, 'product UI manifest digest (src/extensions/dude, .github/extensions/dude, scripts/dude-canvas-ui without node_modules)');
pres.eq(digestAfter.ideas, digestBefore.ideas, '.dude/ideas ledger manifest digest');
pres.eq(digestAfter.pkg, digestBefore.pkg, 'pre-existing 067 package manifest digest (round 2: includes every earlier report and screenshot; only this run\'s own output roots are exempt)');
pres.eq(digestAfter.wide, digestBefore.wide, 'whole-repository manifest digest (.dude, .github, docs, library, scripts, src and root files; .git and node_modules excluded; this run\'s own outputs excluded)');
pres.eq([subjectAfter.html, subjectAfter.runtime], [subject.html.sha256, subject.runtime.sha256], 'HTML and runtime hashes before and after');
pres.eq(Object.values(diffs).flatMap(diff => [...diff.changed, ...diff.removed, ...diff.added]), [], 'changed, removed, or added files in the guarded trees');
pres.done();
const cl = registry.create('P.cleanup', 'bind', 'Owned browser processes and the temporary browser profile are gone');
if (cleanup) {
  cl.eq(cleanup.survivorsAfter, [], 'owned processes still alive after shutdown');
  cl.ok(cleanup.profileRemoved, 'temporary browser profile removed');
} else cl.fail('no browser was started');
cl.done();

const checks = registry.checks;
const byStatus = status => checks.filter(entry => entry.status === status);
const failed = byStatus('fail');
const frames = env?.frames ?? [];
const measurements = (() => {
  const numbers = key => frames.map(frame => frame[key]).filter(value => typeof value === 'number');
  const lowest = key => { const list = frames.filter(frame => typeof frame[key] === 'number'); return list.length ? list.reduce((a, b) => (b[key] < a[key] ? b : a)) : null; };
  const textLow = lowest('textMin'), fieldLow = lowest('fieldMin'), stripLow = lowest('stripMin');
  const by = key => Object.fromEntries([...new Set(frames.map(frame => frame[key]))].map(value => [value, frames.filter(frame => frame[key] === value).length]));
  const minBy = (groupKey, valueKey) => Object.fromEntries([...new Set(frames.map(frame => frame[groupKey]))].map(group => {
    const values = frames.filter(frame => frame[groupKey] === group && typeof frame[valueKey] === 'number').map(frame => frame[valueKey]);
    return [group, values.length ? Math.min(...values) : null];
  }));
  return { frames: frames.length, byTheme: by('theme'), byViewport: by('vp'), byScenario: by('scenario'),
    textSamples: numbers('textSamples').reduce((a, b) => a + b, 0), scrollPasses: numbers('passes').reduce((a, b) => a + b, 0),
    textMin: textLow ? { ratio: textLow.textMin, frame: textLow.id, sample: textLow.textMinAt } : null, textMinByTheme: minBy('theme', 'textMin'), textMinByViewport: minBy('vp', 'textMin'),
    fieldBoundarySamples: numbers('fieldCount').reduce((a, b) => a + b, 0), fieldBoundaryMin: fieldLow ? { ratio: fieldLow.fieldMin, frame: fieldLow.id } : null,
    mockStripTextMin: stripLow ? { ratio: stripLow.stripMin, frame: stripLow.id } : null,
    focusStops: env?.stats.focusStops ?? 0, focusWeakestIndicator: env?.stats.focusWeakest ?? null, axFrames: env?.stats.axFrames ?? 0,
    optionListTextSamples: env?.stats.optionListSamples ?? 0, optionListLowest: env?.stats.optionListLowest ?? null,
    disabledTextMin: (() => { const list = frames.map(frame => frame.disabledMin).filter(value => typeof value === 'number'); return list.length ? Number(Math.min(...list).toFixed(2)) : null; })(),
    framesWithFailures: frames.filter(frame => frame.problems || frame.textFails || frame.clipped || frame.offscreen || frame.hscroll || frame.page?.sw > frame.page?.cw + 1).map(frame => frame.id) };
})();
const byGroup = Object.fromEntries([...new Set(checks.map(entry => entry.group))].map(group => [group, {
  checks: checks.filter(entry => entry.group === group).length, passed: checks.filter(entry => entry.group === group && entry.status === 'pass').length,
  failed: checks.filter(entry => entry.group === group && entry.status === 'fail').length, observations: checks.filter(entry => entry.group === group && entry.status === 'observation').length }]));
const addedChecks = checks.filter(entry => ADDED_CHECK_IDS.includes(entry.id) || entry.id.startsWith('X.r2-aborted.'));
const originalChecks = checks.filter(entry => !addedChecks.includes(entry));
const tally = list => ({ checks: list.length, passed: list.filter(entry => entry.status === 'pass').length, failed: list.filter(entry => entry.status === 'fail').length,
  observations: list.filter(entry => entry.status === 'observation').length, assertions: list.reduce((sum, entry) => sum + entry.assertions, 0) });
const report = {
  schema: 'dude-067-preapproval-verification/1',
  verdict: failed.length || fatal ? 'FAIL' : 'PASS',
  verdictRule: 'FAIL when any check fails or the runner errors. Observations are reported with their evidence and do not change the verdict.',
  generatedAt: new Date().toISOString(), startedAt: startedAt.toISOString(), durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
  role: 'Tester: independent, test-only, round 2 final verification of the revised mock (preapproval, no implementation). The designer capture-log.json and the reviser\'s README and probe outputs are bounded prior art and are not used as evidence here.',
  command: `node "${process.argv[1]}" ${argv.map(value => (/\s/.test(value) ? `"${value}"` : value)).join(' ')}`,
  runner: { dir: here, digest: runner.digest, files: runner.files },
  runnerUpdate: { kind: 'test-only infra update (round 2 revision)', baseRunner: BASE_RUNNER, thisRunner: { dir: here, digest: runner.digest },
    changedFiles: runner.files.map(file => ({ name: file.name, baseSha256: BASE_RUNNER.files[file.name] ?? null, sha256: file.sha256, status: BASE_RUNNER.files[file.name] === undefined ? 'added' : BASE_RUNNER.files[file.name] === file.sha256 ? 'unchanged' : 'modified' })),
    externalBinding: EXTERNAL,
    rule: 'No assertion of the round 1 selection was removed, weakened, skipped, or re-thresholded. Changes: external revision binding and the stale 868935 literal (run.mjs), new default output paths plus an overwrite guard (run.mjs), a preservation manifest that includes earlier reports and screenshots plus a whole-repository manifest (run.mjs), a strict network-body hash assertion (run.mjs), stale explanatory notes recomputed from observed behavior (checks-now.mjs N.M11b cause note; checks-obs.mjs K.capture-announcements note), and the added R.* / A.* checks (checks-r2.mjs).' },
  environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, browser: ctx?.version?.Browser ?? null, userAgent: ctx?.version?.['User-Agent'] ?? null,
    browserPath: ctx ? discoverBrowser() : null, method: 'Headless Edge driven over CDP/WebSocket; file:// URL of the canonical HTML; Emulation.setDeviceMetricsOverride per frame; trusted Input.* mouse and key events' },
  subject: { html: subject.html, runtime: subject.runtime, legal: subject.legal, sources: subject.sources, networkBodySha256: bodyHash, externalBinding: EXTERNAL },
  preservation: { digestBefore, digestAfter, filesHashed: { productUi: before.product.size, ideas: before.ideas.size, package: before.pkg.size, wholeRepository: before.wide.size },
    changed: Object.fromEntries(Object.entries(diffs).map(([key, diff]) => [key, diff])), ownOutputFiles: ownOutputs.length,
    ownOutputRoots: [rel(outDir), rel(shotsDir)] },
  counts: { checks: checks.length, passed: byStatus('pass').length, failed: failed.length, observations: byStatus('observation').length, assertions: registry.assertions,
    screenshotsSaved: env?.savedShots.length ?? 0, frames: measurements.frames, byGroup,
    roundOneSelectionTally: tally(originalChecks), addedInRound2: tally(addedChecks),
    detail: { fixtureRowsGrid: 13, fixtureRowsCompact: 13, repositoryRows: 91, rowEnterOpens: env?.stats.enterOpens ?? 0, nowViewsCrossChecked: env?.stats.nowViews ?? 0,
      captureStatesStatic: 9, captureSubmitTransitions: env?.stats.transitions ?? 0, thresholdViewportWidthsSwept: 33, appearances: 4, viewports: 6 } },
  measurements,
  announcer: env?.stats.announcer ?? null,
  checks: checks.map(entry => ({ id: entry.id, group: entry.group, status: entry.status, assertions: entry.assertions, title: entry.title,
    ...(entry.failures.length ? { failureCount: entry.failures.length, failures: entry.failures.slice(0, 8) } : {}), ...(entry.notes.length ? { notes: entry.notes.slice(0, 6) } : {}), ...(entry.evidence.length ? { evidence: entry.evidence } : {}) })),
  cleanup: cleanup ? { ownedProcessesObserved: cleanup.ownedBefore.length, ownedPids: cleanup.ownedBefore.map(proc => proc.pid), closedGracefully: cleanup.closedGracefully, killedPids: cleanup.killed,
    survivors: cleanup.survivorsAfter, profileRemoved: cleanup.profileRemoved } : null,
  fatal: fatal ? String(fatal.stack ?? fatal).slice(0, 800) : null,
  findings: failed.map(entry => ({ id: entry.id, title: entry.title, failureCount: entry.failures.length, failures: entry.failures.slice(0, 6), screenshot: entry.evidence ?? [] })),
  observations: byStatus('observation').map(entry => ({ id: entry.id, title: entry.title, observed: entry.notes.slice(0, 4), unmet: entry.failures.slice(0, 3), screenshot: entry.evidence })),
  limitations: [
    '200% reflow is emulated: Emulation.setDeviceMetricsOverride 720x450 CSS px at device scale factor 2 (the 1440x900 window at 200%). Edge browser-zoom UI and text-only zoom were not exercised.',
    'Text contrast = computed text color (alpha composited) over the background pixels actually rendered behind the text with the text hidden, per visible text node; large text uses 3:1, other text 4.5:1; disabled controls and the dashed mock strip are reported separately. Field/dropdown boundary contrast = best edge pixel versus the pixel outside, from the screenshot. Focus indicator = pixel difference between a no-focus baseline and the focused frame, versus surrounding and inner background. Not measured: icons, glyphs, progress-bar fill, hover, pressed, selected, forced-colors, text-spacing. No WCAG 2.2 AA conformance claim is made beyond these measurements.',
    'Target size measures only whether the element box is at least 24x24 CSS px (WCAG 2.5.8 spacing and inline exceptions not evaluated).',
    'No screen reader was run. Names, roles, and descriptions come from the Chromium accessibility tree; live-region exposure was observed with a MutationObserver during real transitions, and document.ariaNotify calls were recorded by a call-through wrapper (round 2, A.announce-channels). Whether any assistive technology speaks a status twice, once, or not at all was not tested.',
    'One engine only: headless Microsoft Edge (Chromium) on Windows over CDP, driven against the mock under file://. No Firefox or WebKit, no embedded Copilot host, no real Canvas provider, no tracked (Beads) data; fixtures and the repository snapshot are mock data.',
    'Keyboard coverage: Tab walks of the first stops on Overview, Now, and the capture form in all four appearances; grid arrow-key navigation exercised for the first three rows; real Enter exercised on every fixture row in both layouts.',
    'Contrast and clipping are measured over the first screen plus scroll passes of the largest scrolling region (at most 8 passes); secondary scroll regions such as the docked aside were not scrolled. Overlap between adjacent elements is not measured outside screenshots.',
    'The unrecognized-domain display is not exercised by any fixture (only an unrecognized intent, record 909). Capture timing relies on the mock timers (700 ms and 1700 ms).',
    'This is pre-approval verification only: it is not UI approval, not implementation verification, and not release approval. The designer capture-log.json was read as bounded prior art and is not used as evidence.',
  ],
  scope: { acceptance: ['M1', 'M2', 'M3-M11', 'M12', 'M13', 'M14'], notRun: ['product build or product unit/browser suites (none exist for this mock)', 'host observation', 'any workflow, task, Git, Beads, or implementation step'] },
  screenshots: env?.savedShots ?? [],
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify({ verdict: report.verdict, counts: report.counts, failedChecks: failed.map(entry => ({ id: entry.id, failures: entry.failures.slice(0, 3) })),
  observations: byStatus('observation').map(entry => ({ id: entry.id, failures: entry.failures.slice(0, 2), notes: entry.notes.slice(0, 3) })), cleanup: report.cleanup,
  preservation: { before: digestBefore, after: digestAfter } }, null, 1));
process.exit(failed.length || fatal ? 1 : 0);
