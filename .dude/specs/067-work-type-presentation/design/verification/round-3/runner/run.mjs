// Round 3 focused independent verification of the revised 067 mock (test-only; the independent Tester).
// Reuses the round 2 CDP client, harness, probes, and oracle unchanged. Writes only its own report, handoff copy, and screenshots.
//   node run.mjs --repo <repo> --handoff <mock-handoff.json>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, H, O, P, WATCH_SOURCE, VP } from './lib.mjs';
import { captureChecks } from './checks-capture.mjs';
import { listChecks, progressChecks, detectorSelfTest } from './checks-list.mjs';
import { renderChecks } from './checks-render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : fallback; };
const repo = path.resolve(arg('repo') ?? process.cwd());
const packageDir = path.join(repo, '.dude', 'specs', '067-work-type-presentation');
const designDir = path.join(packageDir, 'design');
const outDir = path.resolve(arg('out') ?? path.join(designDir, 'verification', 'round-3'));
const shotsDir = path.resolve(arg('shots') ?? path.join(designDir, 'screenshots', 'round-3-independent'));
const handoffSource = path.resolve(arg('handoff') ?? path.join(outDir, 'handoff-input.json'));
const only = (arg('only') ?? 'bind,package,capture,list,progress,appearance').split(',');
const startedAt = new Date();
const rel = file => path.relative(repo, file).split(path.sep).join('/');

// The supplied revision binding (requester input) and the preserved round 2 identity.
const EXPECTED = {
  html: 'abad36e29cdc30453d020a484f1a671cdec1d7d87fee9316815e56917c77a11b',
  runtime: '66084dc6887b9aa2c7d1942ef8e0af7cbe54cfa64c7af6b53b8ab2c2b20c6bba',
  round2Html: 'c5c35834d4394a34d25ad99c6c853e97d4b75e5ef11bb6a7597ce194e0406529',
};

if (fs.existsSync(path.join(outDir, 'report.json')) || (fs.existsSync(shotsDir) && fs.readdirSync(shotsDir).length > 0)) {
  console.error(`Refusing to run: ${outDir} already holds report.json or ${shotsDir} already holds files. Earlier evidence is never overwritten.`);
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

// Preservation: everything outside this run's own two output roots must be byte-identical afterwards.
const PRODUCT_ROOTS = ['src/extensions/dude', '.github/extensions/dude', 'scripts/dude-canvas-ui'];
const WIDE_ROOTS = ['.dude', '.github', 'docs', 'library', 'scripts', 'src', 'README.md', '.gitattributes', '.gitignore'];
const ownPrefixes = [outDir, shotsDir].map(dir => `${rel(dir)}/`);
const isOwn = relative => ownPrefixes.some(prefix => relative.startsWith(prefix));
const snapshotTrees = () => ({ product: C.manifest(repo, PRODUCT_ROOTS), ideas: C.manifest(repo, ['.dude/ideas']), pkg: C.manifest(repo, ['.dude/specs/067-work-type-presentation'], isOwn), wide: C.manifest(repo, WIDE_ROOTS, isOwn) });
const before = snapshotTrees();
const digest = trees => Object.fromEntries(Object.entries(trees).map(([key, map]) => [key, C.manifestDigest(map)]));
const digestBefore = digest(before);

// Coordinator handoff: the independent oracle for copy, words, and states. A copy is kept beside the report for reproducibility.
if (!fs.existsSync(handoffSource)) { console.error(`handoff not found: ${handoffSource}`); process.exit(2); }
const handoffBytes = fs.readFileSync(handoffSource);
const handoff = JSON.parse(handoffBytes.toString('utf8'));
const handoffCopy = path.join(outDir, 'handoff-input.json');
if (path.resolve(handoffSource) !== path.resolve(handoffCopy)) fs.writeFileSync(handoffCopy, handoffBytes);

const htmlFile = path.join(designDir, 'work-type-presentation.html');
const runtimeFile = path.join(designDir, 'work-type-presentation.js');
const hashFile = file => ({ path: rel(file), sha256: C.sha256File(file), bytes: fs.statSync(file).size });
const subject = { html: hashFile(htmlFile), runtime: hashFile(runtimeFile), legal: hashFile(`${runtimeFile}.LEGAL.txt`),
  sources: Object.fromEntries(['fixtures.json', 'repository-snapshot.json', 'work-type-presentation.jsx', 'styles.js', 'theme.js'].map(name => [name, hashFile(path.join(designDir, 'source', name))])) };
const runnerFiles = fs.readdirSync(here).filter(name => name.endsWith('.mjs')).sort().map(name => ({ name, sha256: C.sha256File(path.join(here, name)) }));
const runnerDigest = C.sha256Bytes(Buffer.from(runnerFiles.map(file => `${file.name}\0${file.sha256}`).join('\n')));

const registry = H.makeCheckRegistry();
const data = O.loadData(packageDir);
const oracle = { data, fixtures: O.fixtureExpectations(data.fixtures), snapshot: O.snapshotExpectations(data.snapshot) };
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-067-r3-'));
const net = { fetch: 0, fetchRejected: 0, fetchResolved: 0, xhr: 0, beacon: 0, websocket: 0, eventsource: 0, urls: [] };
const NET_KEYS = Object.keys(net).filter(key => key !== 'urls');
let ctx = null, env = null, cleanup = null, fatal = null;
const inlineRun = spawnSync(process.execPath, [path.join(designDir, 'verification', 'embedded-preview', 'package-inline.mjs'), '--html', htmlFile, '--runtime', runtimeFile, '--check'], { encoding: 'utf8' });
let inlineReport = null;
try { inlineReport = JSON.parse(inlineRun.stdout.trim().split(/\r?\n/).at(-1)); } catch { /* reported below */ }

function bindingChecks() {
  const b = registry.create('B1.subject-binding', 'bind', 'Subject binding: the HTML and runtime bytes on disk equal the supplied hashes, the preserved round 2 files are intact, the copied styles and theme equal the product files, and the package is still exploring');
  b.eq(subject.html.sha256, EXPECTED.html, 'raw HTML SHA-256 equals the supplied hash');
  b.eq(subject.runtime.sha256, EXPECTED.runtime, 'runtime SHA-256 equals the supplied hash');
  b.eq(C.sha256File(path.join(designDir, 'variants', 'round-2-embedded', 'work-type-presentation.html')), EXPECTED.round2Html, 'preserved round 2 HTML equals c5c3...');
  b.eq(C.sha256File(path.join(designDir, 'variants', 'round-2-embedded', 'work-type-presentation.js')), handoff.currentCanonical.runtimeSha256, 'preserved round 2 runtime equals the handoff runtime hash');
  b.ok(fs.existsSync(path.join(designDir, 'variants', 'round-1-initial', 'work-type-presentation.html')) && fs.existsSync(path.join(designDir, 'variants', 'round-2-before-embedded-fix', 'work-type-presentation.html')), 'round 1 and pre-packaging-fix variants are present');
  const product = name => C.sha256File(path.join(repo, 'src', 'extensions', 'dude', 'frontend', name));
  b.eq(subject.sources['styles.js'].sha256, product('styles.js'), 'design styles.js equals the product styles.js');
  b.eq(subject.sources['theme.js'].sha256, product('theme.js'), 'design theme.js equals the product theme.js');
  b.ok(subject.legal.bytes > 1000, 'legal sidecar present');
  const spec = fs.readFileSync(path.join(packageDir, 'spec.md'), 'utf8');
  b.matches(spec, /^design_status: exploring$/m, 'spec design_status is exploring (nothing here approves the mock)');
  const html = fs.readFileSync(htmlFile, 'utf8');
  b.matches(html, /067 round 3, exploring/, 'the HTML title says round 3, exploring');
  const designerLog = path.join(designDir, 'screenshots', 'round-3', 'capture-log.json');
  if (fs.existsSync(designerLog)) b.note(`designer capture-log.json (sha256 ${C.sha256File(designerLog)}) was read as an input only; it is not evidence in this run`);
  b.done();
}

try {
  if (only.includes('bind')) { bindingChecks(); detectorSelfTest({ registry, handoff }); }
  ctx = await C.launchBrowser(C.discoverBrowser(), tempRoot);
  const { page } = ctx;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: P.NET_PROBE_SOURCE });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_SOURCE });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  env = H.makeEnv({ repo, packageDir, outDir, shotsDir, page, registry, oracle, data });
  env.handoff = handoff;
  env.expected = EXPECTED;
  env.htmlFile = htmlFile;
  env.runtimeFile = runtimeFile;
  env.browser = ctx.version.Browser;
  env.scriptsParsed = [];
  env.stats = { shots: [], inlineCheck: { exit: inlineRun.status, report: inlineReport, stderr: inlineRun.stderr.slice(0, 300) } };
  page.cdp.on('Debugger.scriptParsed', params => env.scriptsParsed.push({ scriptId: params.scriptId, url: params.url, length: params.length }));
  const baseOpen = env.open.bind(env);
  env.open = async (...args) => {
    const previous = await C.evalFn(page, P.netCounters).catch(() => null);
    if (previous) { for (const key of NET_KEYS) net[key] += previous[key]; net.urls.push(...previous.urls); }
    return baseOpen(...args);
  };
  if (only.includes('package')) await renderChecks(env, { part: 'package' });
  if (only.includes('capture')) await captureChecks(env);
  if (only.includes('list')) await listChecks(env);
  if (only.includes('progress')) await progressChecks(env);
  if (only.includes('appearance')) await renderChecks(env, { part: 'appearance' });
  const last = await C.evalFn(page, P.netCounters).catch(() => null);
  if (last) { for (const key of NET_KEYS) net[key] += last[key]; net.urls.push(...last.urls); }

  const n = registry.create('X.nothing-left-the-page', 'bind', 'Across the whole run nothing left the page: no request beyond the document at file or the replica origin, no socket, no XHR (except the one deliberate CSP control), beacon, or EventSource, and no capture or response sent');
  const origin = env.stats.replica?.origin ?? 'http://browser-preview-local.localhost:0';
  const requests = page.state.allRequests.filter(entry => !(/^(file|data|about|blob):/.test(entry.url)));
  const unexpected = requests.filter(entry => !(entry.url.startsWith(origin) && entry.type === 'Document') && entry.url !== 'http://127.0.0.1:9/x');
  n.eq(unexpected, [], 'requests other than file, data, about, blob, the replica document, and the CSP control');
  n.eq(page.state.allSockets, [], 'WebSocket connections');
  n.eq({ xhr: net.xhr - (env.stats.controlXhr ?? 0), beacon: net.beacon, websocket: net.websocket, eventsource: net.eventsource }, { xhr: 0, beacon: 0, websocket: 0, eventsource: 0 }, 'page-side XHR (minus the control), beacon, WebSocket, EventSource calls');
  n.eq({ resolved: net.fetchResolved }, { resolved: 0 }, 'fetch calls that resolved');
  n.ok(net.urls.every(url => url === '/api/canvas-preferences' || url === 'http://127.0.0.1:9/x'), `every attempted fetch or XHR was the unchanged theme preference route or the CSP control (${JSON.stringify([...new Set(net.urls)])})`);
  n.note(`${page.state.allRequests.length} browser requests observed in total; fetch attempts ${net.fetch} (all rejected by the mock's own stub before a request existed)`);
  n.done();
} catch (error) {
  fatal = error;
  registry.checks.push({ id: 'X.runner', group: 'bind', title: 'Runner completed without an internal error', assertions: 1, failures: [String(error.stack ?? error).slice(0, 700)], notes: [], evidence: [], status: 'fail' });
} finally {
  if (ctx) cleanup = await C.shutdownBrowser(ctx);
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* checked below */ }
}

/* ------------------------------------------------------------------ after-run bindings, screenshots log, report */
const after = snapshotTrees();
const digestAfter = digest(after);
const diffs = Object.fromEntries(Object.keys(before).map(key => [key, C.diffManifests(before[key], after[key])]));
const subjectAfter = { html: C.sha256File(htmlFile), runtime: C.sha256File(runtimeFile) };
const pres = registry.create('Z1.old-inputs-untouched', 'bind', 'Every pre-existing file in the repository (earlier variants, reports, screenshots, spec, plan, tasks, idea, product source, scripts, .github) is byte-identical before and after the run; only this run\'s own output roots changed');
pres.eq(digestAfter.product, digestBefore.product, 'product UI manifest digest');
pres.eq(digestAfter.ideas, digestBefore.ideas, '.dude/ideas ledger manifest digest');
pres.eq(digestAfter.pkg, digestBefore.pkg, '067 package manifest digest (everything but this run\'s outputs, including every earlier report and screenshot)');
pres.eq(digestAfter.wide, digestBefore.wide, 'whole-repository manifest digest (.git and node_modules excluded)');
pres.eq([subjectAfter.html, subjectAfter.runtime], [subject.html.sha256, subject.runtime.sha256], 'HTML and runtime hashes before and after');
pres.eq(Object.values(diffs).flatMap(diff => [...diff.changed, ...diff.removed, ...diff.added]), [], 'changed, removed, or added files outside this run\'s own outputs');
pres.note(`files hashed: product ${before.product.size}, ideas ${before.ideas.size}, package ${before.pkg.size}, whole repository ${before.wide.size}`);
pres.done();
const cl = registry.create('Z2.own-processes-cleaned', 'bind', 'The headless Edge process tree, its temporary profile, and the temporary runner folder are gone');
if (cleanup) {
  cl.eq(cleanup.survivorsAfter, [], 'owned processes still alive after shutdown');
  cl.ok(cleanup.profileRemoved, 'temporary browser profile removed');
} else cl.fail('no browser was started');
cl.ok(!fs.existsSync(tempRoot), 'temporary folder removed');
cl.done();

const shots = (env?.stats.shots ?? []).filter(entry => fs.existsSync(path.join(shotsDir, entry.file))).map(entry => { const file = path.join(shotsDir, entry.file); return { ...entry, path: rel(file), bytes: fs.statSync(file).size, sha256: C.sha256File(file) }; });
const captureLog = { schema: 'dude-067-round-3-independent-capture-log/1', generatedAt: new Date().toISOString(), role: 'Independent Tester; fresh PNGs from this run only. The designer\'s screenshots/round-3 files are inputs, not evidence.',
  subject: { html: { sha256: subject.html.sha256, bytes: subject.html.bytes }, runtime: { sha256: subject.runtime.sha256, bytes: subject.runtime.bytes }, round2Html: EXPECTED.round2Html },
  browser: ctx?.version?.Browser ?? null, method: 'Headless Edge over CDP; file URL; Emulation.setDeviceMetricsOverride per frame; PNG bytes are the CDP screenshot as written (sha256 is of the raw file)', shots };
fs.writeFileSync(path.join(shotsDir, 'capture-log.json'), `${JSON.stringify(captureLog, null, 1)}\n`);

const checks = registry.checks;
const byStatus = status => checks.filter(entry => entry.status === status);
const failed = byStatus('fail');
const frames = env?.frames ?? [];
const textMins = frames.map(frame => frame.textMin).filter(value => typeof value === 'number');
const report = {
  schema: 'dude-067-round-3-independent-verification/1',
  verdict: failed.length || fatal ? 'FAIL' : 'PASS',
  verdictRule: 'FAIL when any check fails or the runner errors. Observations are not used in this run; every check is pass or fail.',
  generatedAt: new Date().toISOString(), startedAt: startedAt.toISOString(), durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
  role: 'Tester: independent, test-only verification of the revised 067 mock (round 3). Not UI approval, not implementation verification, not release approval. Authored no production, mock, spec, plan, or task change.',
  command: `node "${process.argv[1]}" ${argv.map(value => (/\s/.test(value) ? `"${value}"` : value)).join(' ')}`,
  runner: { dir: here, digest: runnerDigest, files: runnerFiles, reused: 'design/verification/round-2-independent/runner/{cdp,harness,probes,oracle}.mjs imported unchanged; the round 2 check modules were not run because they pin the removed controls' },
  environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, browser: ctx?.version?.Browser ?? null, userAgent: ctx?.version?.['User-Agent'] ?? null,
    method: 'Headless Edge over CDP; trusted Input.* events; file URL plus a test-only loopback replica of http://browser-preview-local.localhost:<port>/<id>/' },
  subject: { html: subject.html, runtime: subject.runtime, legal: subject.legal, sources: subject.sources, expected: EXPECTED, preservedRound2Html: EXPECTED.round2Html },
  inputs: { handoff: { source: handoffSource, sha256: C.sha256Bytes(handoffBytes), copy: rel(handoffCopy) }, packageInlineCheck: env?.stats.inlineCheck ?? null,
    designerCaptureLog: 'design/screenshots/round-3/capture-log.json was not used as evidence' },
  counts: { checks: checks.length, passed: byStatus('pass').length, failed: failed.length, assertions: registry.assertions, screenshots: shots.length, frames: frames.length,
    byGroup: Object.fromEntries([...new Set(checks.map(entry => entry.group))].map(group => [group, { checks: checks.filter(entry => entry.group === group).length, passed: checks.filter(entry => entry.group === group && entry.status === 'pass').length, failed: checks.filter(entry => entry.group === group && entry.status === 'fail').length }])) },
  measurements: { frames, lowestEnabledTextContrast: textMins.length ? Math.min(...textMins) : null, focusStops: env?.stats.focusStops ?? 0, replica: env?.stats.replica ?? null },
  checks: checks.map(entry => ({ id: entry.id, group: entry.group, status: entry.status, assertions: entry.assertions, title: entry.title,
    ...(entry.failures.length ? { failureCount: entry.failures.length, failures: entry.failures.slice(0, 10) } : {}), ...(entry.notes.length ? { notes: entry.notes.slice(0, 12) } : {}) })),
  findings: failed.map(entry => ({ id: entry.id, title: entry.title, failureCount: entry.failures.length, failures: entry.failures.slice(0, 6) })),
  screenshots: shots.map(entry => ({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 })),
  preservation: { digestBefore, digestAfter, changed: diffs, ownOutputRoots: [rel(outDir), rel(shotsDir)] },
  cleanup: cleanup ? { ownedProcessesObserved: cleanup.ownedBefore.length, closedGracefully: cleanup.closedGracefully, killedPids: cleanup.killed, survivors: cleanup.survivorsAfter, profileRemoved: cleanup.profileRemoved, tempFolderRemoved: !fs.existsSync(tempRoot), replicaServerClosed: env?.stats.replicaClosed ?? null } : null,
  fatal: fatal ? String(fatal.stack ?? fatal).slice(0, 800) : null,
  limits: [
    'Headless Microsoft Edge (Chromium) only, driven over CDP on Windows. No other engine, no screen reader, and no actual GitHub Copilot app host or its WebView2 was used or observed; the app was not touched, restarted, or reconfigured. The replica is a test-only loopback server that mimics the preview hostname, not the app\'s in-process host or its response headers.',
    'Not a WCAG 2.2 AA conformance claim. Measured: text contrast from rendered pixels, field-boundary contrast, focus-indicator pixel difference, overflow and clipping geometry, accessible names and descriptions from the Chromium accessibility tree. Not measured: icons, hover, forced colors, text spacing, reduced motion, announcement wording as spoken.',
    'The 200% frames are emulated (720x450 CSS px at device scale 2), not browser zoom.',
    'Owner outcomes (clear classified, vague unclassified, matched existing 901 as row 914 or 901) are fixture outputs selected in the mock strip. They show how the mock displays an outcome; they do not test any classifier. Nothing in this run shows what the real Dude records, asks, or sends.',
    'The reason order beyond two observable pairs (pending over busy, not connected over busy) is evidenced by the executed runtime text, because the fixture feeds cannot combine every pair.',
    'Announcements were observed as document.ariaNotify calls and DOM live-region changes in headless Edge; whether any assistive technology speaks them once, twice, or not at all was not tested.',
    'Captured text, statuses, and rows are local mock state; nothing was sent, saved, or recorded outside the page.',
  ],
};
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify({ verdict: report.verdict, counts: report.counts, failed: failed.map(entry => ({ id: entry.id, n: entry.failures.length, failures: entry.failures.slice(0, 4) })),
  lowestEnabledTextContrast: report.measurements.lowestEnabledTextContrast, cleanup: report.cleanup, preservation: { before: digestBefore, after: digestAfter, changed: Object.values(diffs).flatMap(diff => [...diff.changed, ...diff.removed, ...diff.added]) } }, null, 1));
process.exit(failed.length || fatal ? 1 : 0);
