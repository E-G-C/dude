// Round 2 additions to the 067 verification (test-only, added by the independent Tester). Read-only against the repository and the mock.
//   R.*  acceptance items named for the round 2 revision that the round 1 selection did not target directly.
//   A.*  announcer channels (document.ariaNotify calls and DOM live regions) in the preserved round 1 variant and in the round 2 mock.
// Nothing here edits, removes, or loosens a round 1 check. Failures stay failures; observations are only used where the spec is silent.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { P, VP, chooseOption, clickSelector, sleep } from './harness.mjs';
import { sha256File, walkFiles } from './cdp.mjs';

const apos = text => (text ?? '').replace(/[’‘]/g, "'");
const posix = (root, file) => path.relative(root, file).split(path.sep).join('/');

/* ------------------------------------------------------------------ static bindings (no browser) */

export function revisionBindingChecks({ registry, repo, packageDir, designDir, ownPrefixes, digestBefore }) {
  const reportPath = path.join(designDir, 'verification', 'report.json');
  const manifestPath = path.join(designDir, 'verification', 'round-2-reviser-focused', 'package-manifest-before-revision.json');
  const variantDir = path.join(designDir, 'variants', 'round-1-initial');
  const round1 = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const pre = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const revisionStart = fs.statSync(manifestPath).mtimeMs; // the reviser wrote this list before any round 2 write
  const pkgPrefix = `${posix(repo, packageDir)}/`;
  const designPrefix = `${pkgPrefix}design/`;
  const sha = file => sha256File(file);

  {
    const c = registry.create('R.variant-preserved', 'bind', 'Round 1 mock preserved under design/variants/round-1-initial: every file equals the bytes the round 1 independent run recorded; the canonical set differs from round 1 only in the HTML, the runtime, and the mock source');
    const recorded = round1.subject;
    const pairs = [['work-type-presentation.html', recorded.html.sha256], ['work-type-presentation.js', recorded.runtime.sha256], ['work-type-presentation.js.LEGAL.txt', recorded.legal.sha256],
      ...Object.entries(recorded.sources).map(([name, entry]) => [`source/${name}`, entry.sha256])];
    for (const [name, expected] of pairs) {
      const file = path.join(variantDir, ...name.split('/'));
      c.ok(fs.existsSync(file), `variant ${name} exists`);
      if (fs.existsSync(file)) c.eq(sha(file), expected, `variant ${name} SHA-256 equals the hash recorded by the round 1 run`);
    }
    c.ok(fs.existsSync(path.join(variantDir, 'README.md')), 'variant README.md exists');
    c.matches(fs.readFileSync(path.join(variantDir, 'work-type-presentation.html'), 'utf8'), /<script src="\.\/work-type-presentation\.js"><\/script>/, 'variant HTML loads its sibling runtime');
    const same = [['work-type-presentation.js.LEGAL.txt', recorded.legal.sha256], ...['fixtures.json', 'repository-snapshot.json', 'styles.js', 'theme.js'].map(name => [`source/${name}`, recorded.sources[name].sha256])];
    for (const [name, expected] of same) c.eq(sha(path.join(designDir, ...name.split('/'))), expected, `canonical ${name} is unchanged from round 1`);
    const differs = [['work-type-presentation.html', recorded.html.sha256], ['work-type-presentation.js', recorded.runtime.sha256], ['source/work-type-presentation.jsx', recorded.sources['work-type-presentation.jsx'].sha256]];
    for (const [name, old] of differs) c.ok(sha(path.join(designDir, ...name.split('/'))) !== old, `canonical ${name} differs from round 1 (round 2 changed it)`);
    c.done();
  }

  {
    const c = registry.create('R.round1-evidence-preserved', 'bind', 'Earlier evidence preserved: the round 1 report and its screenshots were not rewritten after the run that produced them, and every pre-revision package file is byte-identical except the three files round 2 changed');
    const generated = Date.parse(round1.generatedAt), started = Date.parse(round1.startedAt);
    c.ok(Math.abs(fs.statSync(reportPath).mtimeMs - generated) < 5000, `round 1 report.json mtime ${new Date(fs.statSync(reportPath).mtimeMs).toISOString()} matches its generatedAt ${round1.generatedAt}`);
    const listed = [...new Set(round1.screenshots)];
    const shotDir = path.join(designDir, 'screenshots', 'verification-preapproval');
    const missingShots = listed.filter(name => !fs.existsSync(path.join(packageDir, ...name.split('/'))));
    c.eq(missingShots, [], `round 1 screenshots listed in its report that no longer exist (of ${listed.length})`);
    const late = listed.filter(name => fs.existsSync(path.join(packageDir, ...name.split('/')))
      && (fs.statSync(path.join(packageDir, ...name.split('/'))).mtimeMs > generated + 5000 || fs.statSync(path.join(packageDir, ...name.split('/'))).mtimeMs < started - 5000));
    c.eq(late, [], 'round 1 screenshots whose mtime is outside the round 1 run window (rewritten later)');
    c.eq(fs.readdirSync(shotDir).filter(name => !listed.includes(`design/screenshots/verification-preapproval/${name}`)), [], 'files in verification-preapproval that the round 1 report does not list (added later)');

    const allowedChanged = ['design/source/work-type-presentation.jsx', 'design/work-type-presentation.html', 'design/work-type-presentation.js'];
    const changed = [], missing = [];
    for (const entry of pre) {
      const file = path.join(packageDir, ...entry.rel.split('/'));
      if (!fs.existsSync(file)) { missing.push(entry.rel); continue; }
      if (sha(file) !== entry.sha) changed.push(entry.rel);
    }
    c.ok(pre.length >= 100, `pre-revision manifest lists ${pre.length} package files`);
    c.eq(missing, [], 'pre-revision files that no longer exist');
    c.eq(changed.sort(), allowedChanged, 'pre-revision files whose bytes changed (exactly the mock source, the HTML, and the runtime)');
    const before = Object.fromEntries(pre.map(entry => [entry.rel, entry.sha]));
    const r = round1.subject;
    c.eq([before['design/work-type-presentation.html'], before['design/work-type-presentation.js'], before['design/work-type-presentation.js.LEGAL.txt'], before['design/source/work-type-presentation.jsx']],
      [r.html.sha256, r.runtime.sha256, r.legal.sha256, r.sources['work-type-presentation.jsx'].sha256], 'the pre-revision manifest agrees with the hashes the round 1 run recorded independently');
    const known = new Set(pre.map(entry => entry.rel));
    const allowedNew = ['design/variants/round-1-initial/', 'design/verification/round-2-reviser-focused/', 'design/screenshots/verification-round-2-reviser-focused/'];
    const own = ownPrefixes.filter(prefix => prefix.startsWith(pkgPrefix)).map(prefix => prefix.slice(pkgPrefix.length));
    const unexpected = walkFiles(packageDir).map(file => posix(packageDir, file)).filter(file => !known.has(file) && ![...allowedNew, ...own].some(prefix => file.startsWith(prefix)));
    c.eq(unexpected, [], 'package files added outside the round 2 variant, the reviser folders, and this run\'s own output folders');
    c.note(`${pre.length - changed.length - missing.length} of ${pre.length} pre-revision package files are byte-identical now (including spec.md, plan.md, tasks.md, the round 1 report and its screenshots); changed: ${JSON.stringify(changed)}`);
    c.done();
  }

  {
    const c = registry.create('R.product-ledgers-unchanged', 'bind', 'The mock revision touched no product, workflow, script, or ledger file: the product UI and ledger digests equal the round 1 run, and nothing outside the package design folder is newer than the start of the revision');
    c.eq(digestBefore.product, round1.preservation.digestBefore.product, 'product UI manifest digest equals the digest recorded by the round 1 run (before the revision)');
    c.eq(digestBefore.ideas, round1.preservation.digestBefore.ideas, '.dude/ideas ledger manifest digest equals the digest recorded by the round 1 run (before the revision)');
    const newer = [];
    let scanned = 0;
    const scan = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.isFile()) { scanned += 1; if (fs.statSync(full).mtimeMs >= revisionStart && !posix(repo, full).startsWith(designPrefix)) newer.push(posix(repo, full)); }
      }
    };
    for (const root of ['.dude', '.github', 'docs', 'library', 'scripts', 'src']) if (fs.existsSync(path.join(repo, root))) scan(path.join(repo, root));
    for (const file of ['README.md', '.gitattributes', '.gitignore']) if (fs.existsSync(path.join(repo, file))) { scanned += 1; if (fs.statSync(path.join(repo, file)).mtimeMs >= revisionStart) newer.push(file); }
    c.eq(newer, [], `files outside ${designPrefix} modified at or after the start of the revision (${new Date(revisionStart).toISOString()}), of ${scanned} scanned`);
    const ledger = '.dude/ideas/067-work-type-presentation.md';
    c.ok(fs.statSync(path.join(repo, ledger)).mtimeMs < revisionStart, `${ledger} was last modified before the revision (${new Date(fs.statSync(path.join(repo, ledger)).mtimeMs).toISOString()})`);
    c.done();
  }
}

/* ------------------------------------------------------------------ browser checks */

async function openVariant(env, query, vp = VP.w1440, scheme = 'light') {
  const variantUrl = pathToFileURL(path.join(env.designDir, 'variants', 'round-1-initial', 'work-type-presentation.html')).href;
  const original = env.url;
  env.url = value => `${variantUrl}?${value}`; // env.open (including its network accounting) builds the URL through env.url
  try { return await env.open(query, vp, scheme); } finally { env.url = original; }
}

async function guarded(env, id, group, title, body, options = {}) {
  const c = env.check(id, group, title, options);
  try { await body(c); } catch (error) {
    c.fail(`the check did not complete: ${String(error.message ?? error).slice(0, 240)}`);
    c.done();
    const aborted = env.check(`X.r2-aborted.${id}`, group, `${id} could not complete (runner error, not a mock result)`);
    aborted.fail(String(error.stack ?? error).slice(0, 600));
    aborted.done();
    return;
  }
  c.done();
}

const ANNOUNCE_PROBE_SOURCE = `(() => {
  const log = window.__announce = { supported: typeof document.ariaNotify === 'function', t0: performance.now(), events: [] };
  const push = event => log.events.push({ t: Math.round(performance.now() - log.t0), ...event });
  if (log.supported) {
    const original = document.ariaNotify;
    document.ariaNotify = function (message, options) { // call-through: behavior is unchanged, calls are recorded
      push({ channel: 'ariaNotify', message: String(message), options: options ? { ...options } : null });
      return original.apply(this, arguments);
    };
  }
  const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
  const norm = text => (text || '').replace(/\\s+/g, ' ').trim();
  const lastText = new WeakMap();
  const describe = region => ({ role: region.getAttribute('role'), ariaLive: region.getAttribute('aria-live'), atomic: region.getAttribute('aria-atomic'),
    mockChrome: Boolean(region.closest('#mock-strip')), inMessageBar: Boolean(region.closest('.fui-MessageBar')) });
  new MutationObserver(records => {
    const touched = new Set();
    for (const record of records) {
      const target = record.type === 'characterData' ? record.target.parentElement : record.target;
      const owner = target && target.closest ? target.closest(LIVE) : null;
      if (owner) touched.add(owner);
      for (const node of record.addedNodes || []) {
        if (node.nodeType !== 1) continue;
        if (node.matches(LIVE)) touched.add(node);
        for (const region of node.querySelectorAll(LIVE)) touched.add(region);
      }
    }
    for (const region of touched) {
      const text = norm(region.textContent);
      const known = lastText.has(region);
      if (known && lastText.get(region) === text) continue;
      const previous = known ? lastText.get(region) : null;
      lastText.set(region, text);
      if (text) push({ channel: 'dom-live', kind: known ? 'update' : 'insert', text, previous, region: describe(region) });
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

const squash = text => apos(text).replace(/\s+/g, '').toLowerCase();

// Ids registered by this module (the round 1 selection has other ids that start with R. or A.), used for the added-checks tally.
export const ADDED_CHECK_IDS = ['R.variant-preserved', 'R.round1-evidence-preserved', 'R.product-ledgers-unchanged', 'R.m11b-no-absence-claim', 'R.requests-row-provenance',
  'R.browsing-working-on', 'R.work-item-grammar', 'R.capture-status-regions', 'R.controls-round1-variant', 'A.announce-channels'];

export async function round2Checks(env) {
  const { page } = env, ev = env.ev;
  const waitNow = () => env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now', 5000);
  const NEGATIVE = /No current owner-qualified preview request is waiting/i;
  const frontend = file => path.join(env.repo, 'src', 'extensions', 'dude', 'frontend', file);
  const productReason = fs.readFileSync(frontend('needs-you.jsx'), 'utf8').match(/reason: '(The current preview owner or Review capability is unavailable\.)'/)?.[1] ?? null;
  const lineOf = (file, pattern) => fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line, index) => (pattern.test(line) ? index + 1 : 0)).filter(Boolean);

  /* ---------------------------------------------- M11b: no absence claim while coverage is unavailable or partial */
  await guarded(env, 'R.m11b-no-absence-claim', 'r2', 'M11b: with request coverage unavailable or partial, no surface (rendered text, attribute text, accessibility tree) says no preview request is waiting, and the page gives a truthful fallback; the same detector finds the claim in the preserved round 1 variant and in a current-coverage feed (controls)', async c => {
    const surfaces = async () => {
      const dom = await ev(() => ({
        rendered: document.body.innerText,
        attributes: [...document.querySelectorAll('[aria-label],[title],[alt],[aria-description],[placeholder]')]
          .flatMap(element => ['aria-label', 'title', 'alt', 'aria-description', 'placeholder'].map(name => element.getAttribute(name)).filter(Boolean)).join(' | '),
      }));
      const { nodes } = await page.send('Accessibility.getFullAXTree');
      const ax = nodes.filter(node => !node.ignored).map(node => [node.name?.value, node.description?.value, node.value?.value].filter(Boolean).join(' ')).join(' | ');
      return { ...dom, ax };
    };
    const cases = [
      { id: 'unavailable', query: 'scenario=M11b&tone=light&controls=hide', row: 'Status unavailable' },
      { id: 'partial', query: 'scenario=M11b&tone=light&controls=hide&feed=partial', row: 'Status partial' },
    ];
    c.ok(Boolean(productReason), 'the product wording for unavailable coverage was read from src/extensions/dude/frontend/needs-you.jsx');
    for (const spec of cases) {
      await env.open(spec.query, VP.w1440, 'light');
      await waitNow();
      const now = await ev(P.probeNow);
      const found = await surfaces();
      for (const [name, text] of [['rendered text', found.rendered], ['attribute text (aria-label, title, alt, description)', found.attributes], ['accessibility tree names and descriptions', found.ax]]) {
        c.absent(apos(text), NEGATIVE, `${spec.id}: ${name} must not say that no preview request is waiting`);
      }
      c.eq(now.report.find(row => row.label === 'Requests')?.value, spec.row, `${spec.id}: Requests row value`);
      const header = apos(now.headerText.join(' | '));
      if (spec.id === 'unavailable') c.ok(Boolean(productReason) && header.includes(productReason), `unavailable: the header gives today's product wording for this case ("${productReason}")`);
      else c.matches(header, /(unavailable|partial)[^|]*can't (confirm|tell) whether[^|]*waiting/i, 'partial: the header says coverage is incomplete and that Canvas cannot confirm whether a request is waiting');
      c.note(`${spec.id}: header lines ${JSON.stringify(now.headerText.slice(-3))}; Requests row ${JSON.stringify(now.report.find(row => row.label === 'Requests')?.rest)}`);
      const shot = `r2-m11b-${spec.id}-1440x900-light`;
      await env.saveShot(shot); c.shot(shot);
    }
    for (const spec of cases) {
      await openVariant(env, spec.query);
      await waitNow();
      c.matches(apos((await surfaces()).rendered), NEGATIVE, `control: the preserved round 1 variant (${spec.id}) shows the claim, so the detector above can see it`);
    }
    await env.open('scenario=M4&tone=light&controls=hide&feed=idle', VP.w1440, 'light');
    await waitNow();
    c.matches(apos((await surfaces()).rendered), NEGATIVE, 'control: with current coverage and no request (idle feed) round 2 still shows the sentence, where it is true');
  });

  /* ---------------------------------------------- Requests row names its source */
  await guarded(env, 'R.requests-row-provenance', 'r2', 'SC-006: the unavailable and partial Requests row names its source ("From ...") in M11a, M11b unavailable, and M11b partial', async c => {
    for (const spec of [{ id: 'M11a', query: 'scenario=M11a&tone=light&controls=hide' }, { id: 'M11b unavailable', query: 'scenario=M11b&tone=light&controls=hide' },
      { id: 'M11b partial', query: 'scenario=M11b&tone=light&controls=hide&feed=partial' }]) {
      await env.open(spec.query, VP.w1440, 'light');
      await waitNow();
      const row = (await ev(P.probeNow)).report.find(entry => entry.label === 'Requests');
      c.ok(Boolean(row), `${spec.id}: the Requests row is present`);
      const from = row?.rest.find(line => /^From /.test(line)) ?? null;
      c.ok(Boolean(from) && from.length > 8, `${spec.id}: the Requests row carries a source line (${JSON.stringify(from)})`);
      c.note(`${spec.id}: Requests value ${JSON.stringify(row?.value)}; lines ${JSON.stringify(row?.rest)}`);
    }
  });

  /* ---------------------------------------------- Browsing vs Working on follows today's rule */
  await guarded(env, 'R.browsing-working-on', 'r2', 'The selection group reads "Working on" unless a displayed request is for a different scope, then "Browsing" (today\'s app.jsx rule); both directions, same selection (904), each case opened fresh', async c => {
    const group = () => ev(P.probeCommands).then(commands => commands.workingOn);
    const scopeText = () => ev(() => document.querySelector('[data-request] section[aria-label="Request scope"]')?.innerText ?? '');
    c.note(`product rule: src/extensions/dude/frontend/app.jsx line ${lineOf(frontend('app.jsx'), /const browsing = Boolean\(selection && displayedScope && !matchesRequestScope/).join(', ')}; label line ${lineOf(frontend('app.jsx'), /browsing \? 'Browsing' : 'Working on'/).join(', ')}`);
    let options = null;
    const openRequest = async handle => {
      await env.open('scenario=M4&tone=light&controls=hide', VP.w1440, 'light');
      await waitNow();
      await clickSelector(page, '#dude-tab-needs');
      await env.waitFor(() => Boolean(document.querySelector('[data-request-option]')), 'Needs you list', 5000);
      options = await ev(() => [...document.querySelectorAll('[data-request-option]')].map(node => node.getAttribute('data-request-option')));
      await clickSelector(page, `[data-request-option="${handle}"]`);
      await env.waitFor(handle => document.querySelector('[data-request]')?.getAttribute('data-request') === handle, `request ${handle}`, 5000, handle);
    };
    await env.open('scenario=M4&tone=light&controls=hide', VP.w1440, 'light');
    await waitNow();
    let state = await group();
    c.eq([state?.label, /^Working on/.test(state?.text ?? '')], ['Working on', true], 'Now, selection 904, no request displayed: Working on');
    await openRequest('rq-904-design-review');
    c.note(`request options in the Needs you list for this feed: ${JSON.stringify(options)}`);
    state = await group();
    c.eq([state?.label, /^Working on/.test(state?.text ?? '')], ['Working on', true], 'the displayed request is for the selected record 904 (matching scope): Working on');
    c.absent(await scopeText(), /You are browsing/, 'a matching-scope request does not say the selection is only being browsed');
    for (const [handle, what] of [['rq-session-start', 'a session request with no canonical idea'], ['rq-910-clarification', "another record's request (910)"]]) {
      await openRequest(handle);
      state = await group();
      c.eq([state?.label, /^Browsing/.test(state?.text ?? '')], ['Browsing', true], `the displayed request is ${what} (different scope): Browsing`);
      c.matches(await scopeText(), /You are browsing/, `${handle}: the request scope panel explains that the selection is only being browsed`);
      if (handle === 'rq-session-start') { await env.saveShot('r2-browsing-1440x900-light'); c.shot('r2-browsing-1440x900-light'); }
    }
  });

  /* ---------------------------------------------- singular / plural work item grammar */
  await guarded(env, 'R.work-item-grammar', 'r2', 'Overview closing sentence agrees in number ("1 closed work item", "N closed work items"), with both forms exercised', async c => {
    let sawSingular = 0, sawPlural = 0;
    for (const spec of [{ id: 'M1 (13 fixtures)', query: 'scenario=M1&tone=light&controls=hide' }, { id: 'S3 (91 repository rows)', query: 'scenario=S3&tone=light&controls=hide' }]) {
      await env.open(spec.query, VP.w1440, 'light');
      // the browser's rendered text (innerText), not the harness's text-node probe, which drops whitespace-only nodes such as the {' '} before "1 closed work item"
      const sentence = (await ev(() => document.body.innerText.replace(/\s+/g, ' '))).match(/Closed includes .*?implemented\./)?.[0] ?? '';
      c.ok(sentence.length > 0, `${spec.id}: the closing sentence is present`);
      const counts = [...apos(sentence).matchAll(/\b(\d+) (completed|closed) work items?\b/g)];
      c.eq(counts.length, 2, `${spec.id}: the sentence counts completed and closed work items`);
      for (const match of counts) {
        const plural = match[0].endsWith('items');
        c.eq(plural, Number(match[1]) !== 1, `${spec.id}: "${match[0]}" agrees in number`);
        if (plural) sawPlural += 1; else sawSingular += 1;
      }
      c.note(`${spec.id}: ${JSON.stringify(sentence)}`);
    }
    c.ok(sawSingular > 0, 'a count of one is exercised (singular form observed)');
    c.ok(sawPlural > 0, 'a count above one is exercised (plural form observed)');
  });

  /* ---------------------------------------------- capture status regions */
  await guarded(env, 'R.capture-status-regions', 'r2', 'Each capture status (sending, uncertain, saved, kept, missing, not sent) sits in one polite, atomic role=status region inside its MessageBar body, exposed as such in the accessibility tree', async c => {
    for (const key of ['sending', 'uncertain', 'saved', 'kept', 'missing', 'invalid']) {
      await env.open(`scenario=M12-${key}&tone=light&controls=hide`, VP.w1440, 'light');
      const bars = await ev(() => [...document.querySelectorAll('[data-capture-form] .fui-MessageBar')].map(bar => {
        const norm = value => (value || '').replace(/\s+/g, ' ').trim();
        const body = bar.querySelector('.fui-MessageBarBody'), region = body?.querySelector('[role=status]');
        return { title: norm(bar.querySelector('.fui-MessageBarTitle')?.textContent), regionInBody: Boolean(region), live: region?.getAttribute('aria-live') ?? null,
          atomic: region?.getAttribute('aria-atomic') ?? null, regionText: norm(region?.textContent), bodyText: norm(body?.textContent),
          liveInBar: bar.querySelectorAll('[role=status], [role=alert], [aria-live]').length };
      }));
      c.ok(bars.length > 0, `${key}: at least one status notice is shown`);
      for (const bar of bars) {
        c.eq([bar.regionInBody, bar.live, bar.atomic], [true, 'polite', 'true'], `${key}: "${bar.title}" has a polite, atomic role=status region inside the MessageBar body`);
        c.eq(bar.regionText, bar.bodyText, `${key}: "${bar.title}" region carries the whole title and text`);
        c.eq(bar.liveInBar, 1, `${key}: "${bar.title}" has exactly one live region`);
      }
      const { root } = await page.send('DOM.getDocument', { depth: 0 });
      const { nodeIds } = await page.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-capture-form] .fui-MessageBarBody [role=status]' });
      c.eq(nodeIds.length, bars.length, `${key}: one live region per notice in the DOM`);
      for (const nodeId of nodeIds) {
        const { nodes } = await page.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
        const self = nodes[0], prop = name => self?.properties?.find(entry => entry.name === name)?.value?.value;
        c.eq([Boolean(self) && !self.ignored, self?.role?.value, prop('live'), prop('atomic')], [true, 'status', 'polite', true], `${key}: the region is exposed in the accessibility tree as status, live=polite, atomic=true`);
      }
    }
    await env.open('scenario=M12-waiting&tone=light&controls=hide', VP.w1440, 'light');
    c.note(`waiting state notice (a standing condition, not a capture status) has live regions: ${await ev(() => document.querySelectorAll('[data-capture-form] .fui-MessageBar [role=status], [data-capture-form] .fui-MessageBar [aria-live]').length)}`);
  });

  /* ---------------------------------------------- controls: the round 1 defects reproduce in the preserved variant */
  await guarded(env, 'R.controls-round1-variant', 'r2', 'Controls: the preserved round 1 variant still shows each defect the round 2 fixes target (plural grammar, no Browsing label, no Requests source line, no status region), so the detectors above are not blind', async c => {
    await openVariant(env, 'scenario=M1&tone=light&controls=hide');
    c.matches(await ev(() => document.body.innerText.replace(/\s+/g, ' ')), /\b1 (completed|closed) work items\b/, 'round 1 variant (M1): "1 ... work items" reproduces');
    await openVariant(env, 'scenario=M4&tone=light&controls=hide');
    await waitNow();
    await clickSelector(page, '#dude-tab-needs');
    await env.waitFor(() => Boolean(document.querySelector('[data-request-option]')), 'Needs you list', 5000);
    await clickSelector(page, '[data-request-option="rq-session-start"]');
    await env.waitFor(() => document.querySelector('[data-request]')?.getAttribute('data-request') === 'rq-session-start', 'session request', 5000);
    c.eq((await ev(P.probeCommands)).workingOn?.label, 'Working on', 'round 1 variant (M4, session request open): the selection group reads Working on, never Browsing');
    await openVariant(env, 'scenario=M11a&tone=light&controls=hide');
    await waitNow();
    const row = (await ev(P.probeNow)).report.find(entry => entry.label === 'Requests');
    c.ok(Boolean(row) && !row.rest.some(line => /^From /.test(line)), 'round 1 variant (M11a): the Requests row has no source line');
    await openVariant(env, 'scenario=M12-sending&tone=light&controls=hide');
    c.eq(await ev(() => document.querySelectorAll('[data-capture-form] .fui-MessageBarBody [role=status], [data-capture-form] .fui-MessageBar [aria-live]').length), 0, 'round 1 variant (M12 sending): the capture status has no live region');
  });

  /* ---------------------------------------------- announcer channels */
  await guarded(env, 'A.announce-channels', 'r2', 'Announcer channels for the capture statuses (observed in headless Edge, real Submit and Save outcomes): document.ariaNotify calls and DOM live-region updates in the preserved round 1 variant and the round 2 mock; text carried by both channels is reported', async c => {
    const library = (() => {
      const fluent = path.join(env.repo, 'scripts', 'dude-canvas-ui', 'node_modules', '@fluentui');
      const read = (...parts) => fs.readFileSync(path.join(fluent, ...parts), 'utf8');
      const live = read('react-aria', 'lib', 'AriaLiveAnnouncer', 'useAriaLiveAnnouncer.js');
      const notify = read('react-aria', 'lib', 'AriaLiveAnnouncer', 'useAriaNotifyAnnounce.js');
      const bar = read('react-message-bar', 'lib', 'components', 'MessageBar', 'useMessageBar.js');
      const at = bar.indexOf('announce(message');
      const effectDeps = at >= 0 ? bar.slice(bar.indexOf('}, [', at) + 4, bar.indexOf(']);', at)).replace(/\s+/g, ' ').trim() : null;
      const runtime = fs.readFileSync(path.join(env.designDir, 'work-type-presentation.js'), 'utf8');
      return {
        versions: { reactAria: JSON.parse(read('react-aria', 'package.json')).version, reactMessageBar: JSON.parse(read('react-message-bar', 'package.json')).version },
        announcerPrefersAriaNotifyWhenAvailable: /supportsAriaNotify \? ariaNotifyAnnounce : domAnnounce/.test(live),
        ariaNotifyAnnouncerCallsDocumentAriaNotify: /targetDocument\.ariaNotify\(message, ariaNotifyOptions\)/.test(notify),
        messageBarAnnouncesTextContentFromAnEffect: /\.textContent/.test(bar.slice(0, at)) && /polite: computedPoliteness === 'polite'/.test(bar.slice(at, at + 200)),
        messageBarEffectDependencies: effectDeps,
        bundledRuntime: {
          ariaNotifyOccurrences: (runtime.match(/ariaNotify/g) ?? []).length,
          selectsAriaNotifyWhenFunction: /typeof \w+\?\.ariaNotify=="function"\?\w+:\w+/.test(runtime),
          messageBarEffectDependencies: runtime.match(/\.join\(","\);\w+\(\w+,\{polite:\w+==="polite",alert:\w+==="assertive"\}\)\},\[([^\]]*)\]\)/)?.[1] ?? null,
        },
        productWrapsAppInAriaLiveAnnouncer: lineOf(frontend('app.jsx'), /<AriaLiveAnnouncer>/).length > 0,
        productStatusWrapperLines: { 'artifact-import.jsx': lineOf(frontend('artifact-import.jsx'), /role="status" aria-live="polite" aria-atomic="true"/), 'pack-sources.jsx': lineOf(frontend('pack-sources.jsx'), /role="status" aria-live="polite" aria-atomic="true"/) },
        productNeedsYouNoticeLines: lineOf(frontend('needs-you.jsx'), /export function Notice/),
      };
    })();
    c.note(`library facts: ${JSON.stringify(library)}`);
    c.ok(library.announcerPrefersAriaNotifyWhenAvailable && library.ariaNotifyAnnouncerCallsDocumentAriaNotify, 'the installed Fluent AriaLiveAnnouncer routes announcements through document.ariaNotify when the browser provides it');
    c.ok(library.bundledRuntime.selectsAriaNotifyWhenFunction, 'the bundled runtime contains the same announcer selection');

    const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: ANNOUNCE_PROBE_SOURCE });
    const outcomes = [
      { outcome: 'saved', button: 'Submit', text: 'The export button is hidden on small screens.', intent: 'Fix', domain: 'Code', final: ['Work item saved'] },
      { outcome: 'kept', button: 'Save', text: 'Uploads still stall on slow connections.', intent: 'Maintain', domain: 'Code', final: ['Work item saved', 'Existing intent kept'] },
      { outcome: 'missing', button: 'Submit', text: 'The export button is hidden on small screens.', intent: 'Fix', domain: 'Code', final: ['Work item saved', 'Domain not recorded'] },
      { outcome: 'uncertain', button: 'Submit', text: 'The export button is hidden on small screens.', intent: 'Fix', domain: 'Code', final: ['Delivery uncertain'] },
      { outcome: 'refused', button: 'Save', text: 'The export button is hidden on small screens.', intent: 'Explore', domain: 'Video', final: ['Not sent'] },
    ];
    const rounds = { 'round-1': (query, vp) => openVariant(env, query, vp), 'round-2': (query, vp) => env.open(query, vp, 'light') };
    const result = { ariaNotifySupported: null, library, rounds: {} };
    try {
      for (const [round, open] of Object.entries(rounds)) {
        result.rounds[round] = {};
        for (const spec of outcomes) {
          await open(`scenario=M12-default&tone=light&next=${spec.outcome}&controls=hide`, VP.w1440);
          await clickSelector(page, '[data-capture-form] textarea');
          await page.send('Input.insertText', { text: spec.text });
          await chooseOption(env, 'intent', spec.intent);
          await chooseOption(env, 'domain', spec.domain);
          await ev(() => { window.__announce.events.length = 0; window.__announce.t0 = performance.now(); return true; });
          await clickSelector(page, '[data-capture-form] button', { text: spec.button });
          const started = Date.now(), seen = [], finalTitles = spec.final.join(' | ');
          while (Date.now() - started < 7000) {
            const titles = (await ev(P.probeCapture)).notices.map(notice => notice.title).join(' | ');
            if (titles && seen.at(-1) !== titles) seen.push(titles);
            if (titles === finalTitles) { await sleep(900); break; }
            await sleep(40);
          }
          const recorded = await ev(() => ({ supported: window.__announce.supported, events: window.__announce.events }));
          result.ariaNotifySupported = recorded.supported;
          const events = recorded.events.filter(event => !(event.channel === 'dom-live' && event.region.mockChrome));
          const titles = [...new Set(seen.flatMap(entry => entry.split(' | ')))];
          const statuses = titles.map(title => {
            const hits = events.filter(event => squash(event.channel === 'ariaNotify' ? event.message : event.text).includes(squash(title)));
            const aria = hits.filter(event => event.channel === 'ariaNotify'), domInsert = hits.filter(event => event.channel === 'dom-live' && event.kind === 'insert'), domUpdate = hits.filter(event => event.channel === 'dom-live' && event.kind === 'update');
            const sameText = aria.some(a => hits.some(h => h.channel === 'dom-live' && squash(h.text) === squash(a.message)));
            return { title, ariaNotify: aria.map(event => ({ t: event.t, priority: event.options?.priority ?? null, message: event.message })),
              domInsert: domInsert.map(event => ({ t: event.t, text: event.text })), domUpdate: domUpdate.map(event => ({ t: event.t, text: event.text, previous: event.previous })),
              channels: [aria.length ? 'ariaNotify' : null, domInsert.length || domUpdate.length ? 'dom-live' : null].filter(Boolean), identicalTextOnBothChannels: sameText };
          });
          result.rounds[round][spec.outcome] = { statusSequence: seen, statuses, eventCount: events.length, events };
        }
      }
    } finally {
      await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
    }
    const summarize = round => {
      const rows = Object.entries(result.rounds[round]).flatMap(([outcome, entry]) => entry.statuses.map(status => ({ outcome, title: status.title, channels: status.channels, identical: status.identicalTextOnBothChannels,
        domKinds: [...new Set([...status.domInsert.map(() => 'insert'), ...status.domUpdate.map(() => 'update')])] })));
      return { statuses: rows.length, ariaNotifyOnly: rows.filter(row => row.channels.join() === 'ariaNotify').length, domOnly: rows.filter(row => row.channels.join() === 'dom-live').length,
        bothChannels: rows.filter(row => row.channels.length === 2).length, neither: rows.filter(row => row.channels.length === 0).length, rows };
    };
    result.summary = { 'round-1': summarize('round-1'), 'round-2': summarize('round-2') };
    env.stats.announcer = result;
    for (const round of ['round-1', 'round-2']) {
      const s = result.summary[round];
      c.note(`${round}: ${s.statuses} status texts shown; announced by ariaNotify only ${s.ariaNotifyOnly}, DOM live region only ${s.domOnly}, both channels ${s.bothChannels}, neither ${s.neither}`);
      for (const row of s.rows.filter(entry => entry.channels.length !== 1)) c.note(`${round} ${row.outcome} "${row.title}": ${row.channels.join(' + ') || 'no channel'}${row.identical ? ' (identical text)' : ''}${row.domKinds.length ? ` [DOM ${row.domKinds.join('/')}]` : ''}`);
    }
    c.ok(result.ariaNotifySupported === true, 'document.ariaNotify is provided by this browser, so Fluent speaks MessageBars through it (not through a DOM region)');
    const round2 = result.summary['round-2'];
    c.eq(round2.neither, 0, 'round 2: every capture status text reaches at least one channel');
    c.eq(round2.rows.filter(row => row.channels.length === 2).map(row => `${row.outcome}: ${row.title}`), [], 'round 2: no status text is delivered through both ariaNotify and a DOM live region (a screen reader that honors both could speak it twice)');
  }, { observation: true });
}
