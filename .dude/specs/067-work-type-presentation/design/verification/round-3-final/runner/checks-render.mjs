// Round 3 self-contained packaging, host-origin, detector-control, and appearance checks (areas 6 and 7).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { C, H, P, RE, THEMES, VP, axButton, axProp, axSnapshot, clickSelector, evalFn, norm, probeCaptureDetector, probeDetails, probeRowDetail, sleep, startReplica, typeDraft } from './lib.mjs';
import { guarded, probeRowsLite } from './checks-capture.mjs';

const T = Object.fromEntries(THEMES.map(theme => [theme.id, theme]));
const DRAFT = 'The export button is hidden on small screens.';
const withBase = async (env, base, body) => {
  const original = env.url;
  env.url = query => `${base}?${query}`;
  try { return await body(); } finally { env.url = original; }
};
const problemsOf = env => env.problems();

/** One predicate for "the capture form asks about classification", applied unchanged to round 2 and round 3. */
const violates = d => d.formFound && (d.choiceControls > 0 || d.otherInputs > 0 || d.labels.some(label => RE.classification.test(label)) || RE.classification.test(d.text));

export async function renderChecks(env, { part = 'all' } = {}) {
  const { page } = env;
  const expected = env.expected;
  const runPackage = part === 'package' || part === 'all', runAppearance = part === 'appearance' || part === 'all';

  /* ---------------------------------------------------------------- S1: self-contained, inline runtime executed (area 6) */
  if (runPackage) await guarded(env, 'S1.self-contained-inline-runtime-executed', 'package', 'One self-contained HTML file: package-inline --check passes; no external script, link, import, or URL; CSP allows only inline script with connect none (and blocks a connection attempt); the inline script the browser executed hashes to the actual runtime file', async c => {
    const bytes = fs.readFileSync(env.htmlFile);
    const text = bytes.toString('utf8');
    const open = '<script data-runtime="work-type-presentation.js">';
    const start = text.indexOf(open) + open.length, end = text.lastIndexOf('</script>');
    c.ok(text.indexOf(open) > 0 && text.indexOf(open) === text.lastIndexOf(open), 'exactly one runtime slot');
    const shell = (text.slice(0, start) + text.slice(end)).replace(/<!--[\s\S]*?-->/g, '');
    c.eq((shell.match(/<script\b[^>]*\bsrc\s*=/gi) ?? []).length, 0, 'script elements with src');
    c.eq((shell.match(/<link\b[^>]*\bhref\s*=\s*["'](?!data:)/gi) ?? []).length, 0, 'link elements pointing outside the file');
    c.eq((shell.match(/@import|url\(\s*["']?(?!data:)/gi) ?? []).length, 0, 'CSS @import or non-data url()');
    c.eq((shell.match(/\bhttps?:\/\//gi) ?? []).length, 0, 'http(s) URLs in the shell (outside comments and the runtime body)');
    const csp = text.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '';
    const directive = name => csp.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `))?.slice(name.length + 1) ?? null;
    c.eq([directive('default-src'), directive('script-src'), directive('connect-src')], ["'none'", "'unsafe-inline'", "'none'"], 'CSP: default none, script inline only, connect none');
    c.absent(csp, /https?:|file:|\*/, 'CSP names no external origin or wildcard');
    const inline = bytes.subarray(Buffer.byteLength(text.slice(0, start)), Buffer.byteLength(text.slice(0, end)));
    const runtime = fs.readFileSync(env.runtimeFile);
    c.ok(inline.equals(runtime), 'the inline slot equals the runtime file byte for byte');
    c.eq(C.sha256Bytes(inline), expected.runtime, 'the inline slot hashes to the supplied runtime hash');
    const check = env.stats.inlineCheck;
    c.eq([check.exit, check.report?.inlineMatchesRuntime, check.report?.runtimeSha256, check.report?.htmlSha256], [0, true, expected.runtime, expected.html], 'package-inline.mjs --check: exit 0, inline equals runtime, hashes bound');
    c.eq(check.report?.scriptSrc, "'unsafe-inline'", 'package-inline.mjs reports script-src inline only');

    await page.send('Debugger.enable');
    env.scriptsParsed.length = 0;
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const big = env.scriptsParsed.filter(script => script.length > 500000);
    c.eq(big.length, 1, 'scripts over 500 KB parsed by the browser');
    const { scriptSource } = await page.send('Debugger.getScriptSource', { scriptId: big[0].scriptId });
    c.eq(C.sha256Bytes(Buffer.from(scriptSource, 'utf8')), expected.runtime, 'the executed inline script hashes to the actual runtime file');
    c.eq(Buffer.byteLength(scriptSource), runtime.length, 'executed script byte length equals the runtime file');
    c.ok(!/work-type-presentation\.js$/.test(big[0].url), `the executed script is inline in the document, not a separate file (url ${big[0].url.slice(-60)})`);
    const dom = await env.ev(() => ({ srcScripts: [...document.scripts].filter(script => script.src).length, inlineScripts: document.scripts.length, rows: document.querySelectorAll('[data-work-path]').length,
      boot: Boolean(document.querySelector('.mock-boot')), csp: window.__csp }));
    c.eq([dom.srcScripts, dom.rows, dom.boot, dom.csp], [0, 13, false, []], 'no script with src, 13 rows rendered, the loading message replaced, zero CSP violations');
    c.eq(page.state.requests.map(request => request.type), ['Document'], 'the browser requested only the document (no script, style, image, or font request)');
    c.eq(problemsOf(env), [], 'no console error, warning, log entry, or exception');
    const control = await env.ev(async () => {
      const before = window.__csp.length;
      const outcome = await new Promise(resolve => { const xhr = new XMLHttpRequest(); xhr.onerror = () => resolve('error'); xhr.onload = () => resolve('load'); try { xhr.open('GET', 'http://127.0.0.1:9/x'); xhr.send(); } catch (error) { resolve(`throw ${error.name}`); } });
      await new Promise(resolve => setTimeout(resolve, 100));
      return { outcome, violations: window.__csp.slice(before).map(entry => entry.directive) };
    });
    c.eq([control.outcome, control.violations], ['error', ['connect-src']], 'control: an XHR attempt is refused by connect-src (connect is none in practice, not only on paper)');
    env.stats.controlXhr = (env.stats.controlXhr ?? 0) + 1;
    c.note(`executed runtime sha256 ${expected.runtime}; ${big[0].length} characters, ${runtime.length} bytes; ${dom.inlineScripts} script elements in the document`);
    await page.send('Debugger.disable');
  });

  /* ---------------------------------------------------------------- S2: file URL and app-preview hostname replica (area 6) */
  if (runPackage) await guarded(env, 'S2.file-url-and-app-origin-replica-render', 'package', 'The file URL and a replica of the app preview origin (http://browser-preview-local.localhost/<id>/) both render 13 rows and the capture form with zero CSP violations, console problems, or extra requests', async c => {
    const replica = await startReplica(fs.readFileSync(env.htmlFile));
    env.stats.replica = { origin: replica.origin, id: replica.id };
    const results = {};
    try {
      for (const [label, base] of [['file URL', pathToFileURL(env.htmlFile).href], ['app-origin replica', replica.page]]) {
        await withBase(env, base, async () => {
          await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
          const list = await env.ev(() => ({ rows: document.querySelectorAll('[data-work-path]').length, layout: document.querySelector('[data-work-layout]')?.getAttribute('data-work-layout'), boot: Boolean(document.querySelector('.mock-boot')), csp: window.__csp, origin: location.origin,
            words: [...document.querySelectorAll('[data-work-classification]')].length }));
          const requests1 = page.state.requests.map(request => request.type);
          const problems1 = problemsOf(env);
          await env.open('scenario=M12-default&tone=light', VP.w1440, 'light');
          const form = await env.ev(() => ({ form: Boolean(document.querySelector('[data-capture-form]')), strip: Boolean(document.querySelector('#mock-strip')), csp: window.__csp, text: document.querySelector('[data-capture-form]')?.innerText ?? '' }));
          c.eq([list.rows, list.layout, list.boot, list.words], [13, 'grid', false, 11], `${label}: 13 rows in the grid, loading message replaced, 11 rows with words`);
          c.eq([list.csp, form.csp], [[], []], `${label}: zero CSP violations`);
          c.eq([problems1, problemsOf(env)], [[], []], `${label}: zero console errors, warnings, log entries, exceptions`);
          c.eq([requests1, page.state.requests.map(request => request.type)], [['Document'], ['Document']], `${label}: only the document was requested`);
          c.ok(form.form && form.strip, `${label}: the capture form and the labeled fixture strip render`);
          results[label] = { origin: list.origin, rows: list.rows, formText: norm(form.text) };
        });
      }
      c.eq(results['file URL'].formText, results['app-origin replica'].formText, 'the capture form reads the same at both origins');
      c.ok(/^http:\/\/browser-preview-local\.localhost:\d+$/.test(results['app-origin replica'].origin), `replica origin ${results['app-origin replica'].origin}`);
      c.eq(replica.seen.length, 2, 'the replica server answered two requests');
      c.ok(replica.seen.every(entry => entry === `GET /${replica.id}/work-type-presentation.html -> 200`), `every replica request was the HTML itself (${JSON.stringify([...new Set(replica.seen)])})`);
      // with scripts blocked the page is not blank: the loading message explains it
      await page.send('Emulation.setScriptExecutionDisabled', { value: true });
      try {
        await page.send('Page.navigate', { url: pathToFileURL(env.htmlFile).href });
        await C.until(() => evalFn(page, () => document.readyState === 'complete' && Boolean(document.querySelector('#root'))), 'scripts-disabled load', 15000);
        const blocked = await env.ev(() => ({ boot: document.querySelector('.mock-boot')?.innerText ?? null, rows: document.querySelectorAll('[data-work-path]').length }));
        c.ok(Boolean(blocked.boot) && blocked.rows === 0 && /script did not run here/.test(blocked.boot), `with scripts disabled the page shows its loading message, not a blank page (observed "${(blocked.boot ?? '').slice(0, 80)}")`);
      } finally { await page.send('Emulation.setScriptExecutionDisabled', { value: false }); }
    } finally { await replica.close(); env.stats.replicaClosed = true; }
    c.note('replica = test-only loopback server answering as browser-preview-local.localhost; it is not the app, its WebView2, or its host policy');
  });

  /* ---------------------------------------------------------------- S3: the detector catches the original round 2 failure (area 6, control for C1 and L2) */
  if (runPackage) await guarded(env, 'S3.detector-catches-round2-classification-fields', 'package', 'Control: the same detectors flag the preserved round 2 mock (two classification dropdowns, Intent and Domain labels, Not set, a labeled facts list, a correction instruction, Unrecognized and Classification unavailable rows) and pass the round 3 mock', async c => {
    const oldHtml = path.join(env.designDir, 'variants', 'round-2-embedded', 'work-type-presentation.html');
    c.eq(C.sha256File(oldHtml), expected.round2Html, 'the preserved round 2 HTML is the supplied c5c3... file');
    await withBase(env, pathToFileURL(oldHtml).href, async () => {
      await env.open('scenario=M12-default&tone=light&controls=hide', VP.w1440, 'light');
      const old = await env.ev(probeCaptureDetector);
      c.ok(violates(old), 'round 2 capture form is flagged by the detector');
      c.ok(old.choiceControls >= 2, `round 2: choice controls found (${old.choiceControls})`);
      c.ok(old.labels.some(label => /Intent/.test(label)) && old.labels.some(label => /Domain/.test(label)), `round 2: Intent and Domain labels found (${JSON.stringify(old.labels)})`);
      c.matches(old.text, /Not set/, 'round 2: "Not set" is in the form');
      const nodes = await axSnapshot(page);
      const combos = nodes.filter(node => !node.ignored && node.role?.value === 'combobox' && /Intent|Domain/.test(String(node.name?.value)));
      c.ok(combos.length >= 2, `round 2: the accessibility tree exposes ${combos.length} Intent/Domain comboboxes`);
      await env.open('scenario=M5&tone=light&controls=hide', VP.w1440, 'light');
      const details = await env.ev(probeDetails);
      c.ok(details.factsLists >= 1 && details.corrections >= 1, `round 2 details: labeled facts list (${details.factsLists}) and correction instruction (${details.corrections}) are found`);
      await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
      const rows = await env.ev(probeRowDetail);
      const flagged = rows.filter(row => RE.classification.test(`${row.aria} ${row.text}`));
      c.ok(flagged.length >= 2, `round 2 list: ${flagged.length} rows carry classification placeholder or warning text (for example ${JSON.stringify(flagged[0]?.text.slice(0, 70))})`);
    });
    await env.open('scenario=M12-default&tone=light&controls=hide', VP.w1440, 'light');
    const now = await env.ev(probeCaptureDetector);
    c.eq([now.textareas, now.choiceControls, now.otherInputs, violates(now)], [1, 0, 0, false], 'round 3 capture form: one textarea, no choice control, not flagged by the same predicate');
    await env.open('scenario=M5&tone=light&controls=hide', VP.w1440, 'light');
    const details = await env.ev(probeDetails);
    c.eq([details.factsLists, details.corrections], [0, 0], 'round 3 details: no facts list, no correction instruction');
  });

  /* ---------------------------------------------------------------- A1: representative frames (area 7) */
  const frames = [
    { id: 'capture-text-only-filled', scenario: 'M12-default', vp: VP.w1440, theme: 'light', typed: true, shot: '01-capture-text-only-1440-light', capture: true },
    { id: 'capture-pending-question', scenario: 'M12-pending-question', vp: VP.w768, theme: 'app-dark', shot: '02-capture-pending-question-768-app-dark', capture: true },
    { id: 'capture-saved-submit', scenario: 'M12-saved-submit', vp: VP.w1440, theme: 'light', shot: '03-capture-saved-submit-1440-light', capture: true },
    { id: 'capture-saved-save', scenario: 'M12-saved-save', vp: VP.w600, theme: 'dark', shot: '04-capture-saved-save-600-dark', capture: true },
    { id: 'capture-uncertain', scenario: 'M12-uncertain', vp: VP.w1440, theme: 'dark', shot: '05-capture-uncertain-1440-dark', capture: true },
    { id: 'details-901-words-docked', scenario: 'M5', vp: VP.w1440, theme: 'light', shot: '06-details-901-words-1440-light' },
    { id: 'details-904-design-in-flow', scenario: 'M4', vp: VP.w768, theme: 'app-dark', shot: '07-details-904-design-768-app-dark' },
    { id: 'details-909-known-word-only', scenario: 'M1', vp: VP.w1440, theme: 'dark', open: '.dude/ideas/909-docs-site-navigation.md', shot: '08-details-909-design-only-1440-dark' },
    { id: 'details-912-unreadable', scenario: 'M1', vp: VP.w600, theme: 'dark', open: '.dude/ideas/912-export-history.md', shot: '09-details-912-unreadable-600-dark' },
    { id: 'list-wide', scenario: 'M1', vp: VP.w1440, theme: 'light', shot: '10-list-wide-1440-light', rows: 13 },
    { id: 'list-compact', scenario: 'M2', vp: VP.w600, theme: 'dark', shot: '11-list-compact-600-dark', rows: 13 },
    { id: 'z200-capture', scenario: 'M12-default', vp: VP.z200, theme: 'app-light', typed: true, shot: '12-capture-200pct-top-app-light', actions: '13-capture-200pct-actions-app-light', capture: true },
    { id: 'z200-list', scenario: 'M1', vp: VP.z200, theme: 'light', rows: 13 },
  ];
  if (runAppearance) await guarded(env, 'A1.representative-frames-overflow-names-contrast', 'appearance', 'Representative frames (1440 light, 768 app dark, 600 dark, emulated 200% app light): no overflow or clipped text, every control and row has an accessible name, the capture field and actions are reachable, and text and field-boundary contrast are measured from rendered pixels', async c => {
    for (const spec of frames) {
      const theme = T[spec.theme];
      await env.open(`scenario=${spec.scenario}&${theme.q}&controls=hide`, spec.vp, theme.scheme);
      if (spec.typed) await typeDraft(env, DRAFT);
      if (spec.open) {
        await clickSelector(page, `[data-work-path="${spec.open}"]`);
        await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now', 5000);
        await sleep(200);
      }
      const key = `${spec.id} ${spec.vp.id} ${spec.theme}`;
      const problems = problemsOf(env);
      const geometry = await env.ev(P.probeGeometry);
      const measure = await H.measureScrolled(env, { keepShot: Boolean(spec.shot) });
      const summary = H.summarizeContrast(measure);
      const audit = await H.axAudit(env);
      const hard = geometry.clipped.filter(entry => ['row', 'report', 'capture', 'now'].includes(entry.area));
      const hscroll = geometry.hscroll.filter(entry => ['row', 'report', 'capture', 'now', 'other'].includes(entry.area));
      env.frames.push({ id: key, scenario: spec.scenario, vp: spec.vp.id, theme: spec.theme, problems: problems.length, page: geometry.page, offscreen: geometry.offscreen.length, clipped: hard.length, hscroll: hscroll.length,
        textSamples: summary.textSamples, textMin: summary.textMin === null ? null : Number(summary.textMin.toFixed(2)), textFails: summary.textFailCount, fieldMin: summary.fieldMin === null ? null : Number(summary.fieldMin.toFixed(2)),
        disabledMin: summary.disabledMin === null ? null : Number(summary.disabledMin.toFixed(2)), passes: measure.passes,
        textMinAt: summary.textMinEntry ? `"${summary.textMinEntry.t}" ${summary.textMinEntry.fs}px fg${JSON.stringify(summary.textMinEntry.fg)} on bg${JSON.stringify(summary.textMinEntry.bg)}` : null });
      c.eq(problems, [], `${key}: console, log, and exception problems`);
      c.ok(geometry.page.sw <= geometry.page.cw + 1, `${key}: page-wide horizontal scroll (${geometry.page.sw} > ${geometry.page.cw})`);
      c.eq([geometry.offscreen, hard, hscroll], [[], [], []], `${key}: text beyond the viewport, clipped or ellipsized text, horizontally scrolling content regions`);
      c.ok(summary.textFailCount === 0, `${key}: ${summary.textFailCount} text samples below 4.5:1 (3:1 large); lowest ${JSON.stringify(summary.textFails.slice(0, 3).map(entry => [entry.t, Number(entry.ratio.toFixed(2)), entry.required, entry.fg, entry.bg]))}`);
      c.ok(summary.fieldFails.length === 0, `${key}: field boundaries below 3:1 ${JSON.stringify(summary.fieldFails.map(entry => [entry.name, Number(entry.best.toFixed(2))]))}`);
      c.eq([audit.unnamed.length, audit.focusableUnnamed.length], [0, 0], `${key}: interactive or focusable nodes without an accessible name`);
      if (spec.rows) c.eq(audit.rows.length, spec.rows, `${key}: rows exposed with an accessible name`);
      c.eq(geometry.small.filter(entry => entry.area === 'capture'), [], `${key}: capture controls under 24x24 CSS px`);
      if (spec.capture) {
        const nodes = await axSnapshot(page);
        const field = nodes.find(node => !node.ignored && node.role?.value === 'textbox');
        c.eq(norm(field?.name?.value), 'Describe the work', `${key}: the one text field is named Describe the work`);
        c.eq(['Submit', 'Save', 'Cancel'].map(name => Boolean(axButton(nodes, name))), [true, true, true], `${key}: Submit, Save, and Cancel are named buttons`);
        const reach = await env.ev(() => ['Submit', 'Save', 'Cancel'].map(text => {
          const button = [...document.querySelectorAll('[data-capture-form] button')].find(node => node.textContent.trim() === text);
          button.scrollIntoView({ block: 'center' });
          const box = button.getBoundingClientRect();
          const inside = box.top >= 0 && box.bottom <= innerHeight;
          if (button.disabled) return inside; // a disabled button is not clickable by design; it must still be fully in view
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return Boolean(hit && (hit === button || button.contains(hit)) && inside);
        }));
        c.eq(reach, [true, true, true], `${key}: Submit, Save, and Cancel can be scrolled fully into view and are not covered`);
      }
      if (measure.normalPng && spec.shot) {
        await env.saveShot(spec.shot, measure.normalPng);
        env.stats.shots.push({ file: `${spec.shot}.png`, scenario: spec.scenario, query: `scenario=${spec.scenario}&${theme.q}&controls=hide`, viewport: spec.vp.id, appearance: spec.theme, typed: Boolean(spec.typed), opened: spec.open ?? null });
      }
      if (spec.actions) {
        await env.ev(() => document.querySelector('[data-capture-form] button').scrollIntoView({ block: 'center' }));
        await sleep(200);
        await env.saveShot(spec.actions);
        env.stats.shots.push({ file: `${spec.actions}.png`, scenario: spec.scenario, query: `scenario=${spec.scenario}&${theme.q}&controls=hide`, viewport: spec.vp.id, appearance: spec.theme, typed: true, scrolledToActions: true });
      }
    }
    const textMins = env.frames.map(frame => frame.textMin).filter(value => typeof value === 'number');
    c.note(`${frames.length} frames; lowest enabled text contrast ${Math.min(...textMins).toFixed(2)}:1 (threshold 4.5:1; 3:1 large); disabled text is reported separately and is exempt`);
  });

  /* ---------------------------------------------------------------- A2: keyboard focus on the capture form (area 7) */
  if (runAppearance) await guarded(env, 'A2.capture-keyboard-focus', 'appearance', 'Keyboard: Tab order on the capture form is the field, Submit, Save, Cancel with a visible, unobscured focus indicator of at least 3:1; while Submit and Save are disabled the order skips to Cancel', async c => {
    const walks = [['enabled, 1440 light', 'M12-default', VP.w1440, 'light', 3, ['Describe the work', 'Submit', 'Save', 'Cancel']],
      ['enabled, 200% app light', 'M12-default', VP.z200, 'app-light', 3, ['Describe the work', 'Submit', 'Save', 'Cancel']],
      ['pending question, 768 app dark', 'M12-pending-question', VP.w768, 'app-dark', 1, ['Describe the work', 'Cancel']]];
    for (const [label, scenario, vp, themeId, stops, names] of walks) {
      const theme = T[themeId];
      await env.open(`scenario=${scenario}&${theme.q}&controls=hide`, vp, theme.scheme);
      const walk = await H.tabWalk(env, stops, { focusFirst: '[data-capture-form] textarea' });
      c.eq(walk.map(stop => stop.label), names, `${label}: focus order`);
      for (const stop of walk) {
        c.ok(stop.visibleFocus && stop.inViewport && !stop.obscured, `${label}: "${stop.label}" focus is visible (${stop.visibleFocus}), in view (${stop.inViewport}), unobscured (${!stop.obscured})`);
        c.ok(stop.indicatorRatio >= 3, `${label}: "${stop.label}" focus indicator ${Number(stop.indicatorRatio.toFixed(2))}:1 (needs 3:1)`);
        env.stats.focusStops = (env.stats.focusStops ?? 0) + 1;
      }
      if (stops === 1) {
        const form = await env.ev(() => [...document.querySelectorAll('[data-capture-form] button')].map(button => [button.textContent.trim(), button.disabled]));
        c.eq(form, [['Submit', true], ['Save', true], ['Cancel', false]], `${label}: Submit and Save are disabled, so they are not tab stops`);
      }
      c.note(`${label}: ${JSON.stringify(walk.map(stop => [stop.label, Number(stop.indicatorRatio.toFixed(1))]))}`);
    }
  });

  /* ---------------------------------------------------------------- A3: selected states contrast (area 7) */
  if (runAppearance) await guarded(env, 'A3.selected-states-contrast', 'appearance', 'Selected states keep readable text: the inspected task and selected filter (Now), the selected row (Overview, Working on), and the selected destination in the expanded rail, in light and dark', async c => {
    const lows = {};
    const need = (measure, labels, key) => {
      const entries = measure.text.filter(entry => entry.region === 'product' && !entry.disabled && labels.includes(entry.t));
      c.ok(entries.length >= labels.length, `${key}: measured ${entries.length} text samples for ${JSON.stringify(labels)}`);
      for (const entry of entries) c.ok(entry.ratio + 0.001 >= entry.required, `${key}: "${entry.t}" ${Number(entry.ratio.toFixed(2))}:1 (needs ${entry.required}:1)`);
      lows[key] = entries.length ? Number(Math.min(...entries.map(entry => entry.ratio)).toFixed(2)) : null;
    };
    for (const themeId of ['light', 'dark']) {
      const theme = T[themeId];
      await env.open(`scenario=M5&${theme.q}&controls=hide`, VP.w1440, theme.scheme);
      need(await H.measureScrolled(env), ['Inspecting', 'All'], `inspected task and selected filter (${themeId})`);
      // selected row in Overview: open 901, go Back to Overview (the row is then selected, aria-current)
      await env.open(`scenario=M1&${theme.q}&controls=hide`, VP.w1440, theme.scheme);
      await clickSelector(page, '[data-work-path*="/901-"]');
      await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now', 5000);
      await clickSelector(page, 'button', { text: 'Back to Overview' });
      await env.waitFor(() => document.querySelectorAll('[data-work-path]').length === 1, 'selected row', 5000);
      await sleep(250);
      const row = (await env.ev(probeRowDetail))[0];
      c.eq(await env.ev(() => document.querySelector('[data-work-path]').getAttribute('aria-current')), 'true', `selected row (${themeId}): aria-current marks the selection, not color alone`);
      const rowMeasure = await H.measureContrast(env);
      need(rowMeasure, ['901', 'Retry failed uploads', 'Fix · Code', 'In progress'], `selected Overview row (${themeId})`);
      c.eq(row.words, 'Fix \u00b7 Code', `selected row (${themeId}): the words stay visible`);
      // expanded rail
      await env.open(`scenario=M1&${theme.q}&controls=hide`, VP.w1440, theme.scheme);
      await clickSelector(page, 'button[aria-label="Expand navigation pane"]');
      await sleep(350);
      const rail = await env.ev(() => [...document.querySelectorAll('nav [role=tab]')].map(tab => ({ label: tab.getAttribute('aria-label'), selected: tab.getAttribute('aria-selected') })));
      c.eq(rail.filter(tab => tab.selected === 'true').map(tab => tab.label), ['Overview'], `rail (${themeId}): the selected destination is exposed as selected`);
      need(await H.measureContrast(env), ['Overview', 'Now', 'Needs you', 'New work item', 'Settings'], `expanded rail labels (${themeId})`);
    }
    c.note(`lowest measured ratios: ${JSON.stringify(lows)}; text contrast from rendered pixels, not icons or selection backgrounds`);
  });

  /* ---------------------------------------------------------------- A4: four appearances, one fast check (area 7) */
  if (runAppearance) await guarded(env, 'A4.four-appearances-fast', 'appearance', 'Light, dark, app-following light, and app-following dark: the saved capture form renders in each with distinct backgrounds, no overflow, no console problems, and text and field contrast above threshold', async c => {
    const seen = {};
    for (const theme of THEMES) {
      await env.open(`scenario=M12-saved-submit&${theme.q}&controls=hide`, VP.w1440, theme.scheme);
      const problems = problemsOf(env);
      const geometry = await env.ev(P.probeGeometry);
      const measure = await H.measureContrast(env, { keepShot: true });
      const summary = H.summarizeContrast(measure);
      const bg = await env.ev(P.pageBackground);
      seen[theme.id] = bg.body.join(',');
      c.eq(problems, [], `${theme.id}: console problems`);
      c.ok(geometry.page.sw <= geometry.page.cw + 1 && geometry.offscreen.length === 0 && geometry.clipped.filter(entry => ['capture', 'now'].includes(entry.area)).length === 0, `${theme.id}: no overflow or clipped capture text`);
      c.ok(summary.textFailCount === 0 && summary.fieldFails.length === 0, `${theme.id}: contrast (text lowest ${summary.textMin === null ? 'n/a' : summary.textMin.toFixed(2)}:1, ${summary.textFailCount} text and ${summary.fieldFails.length} field failures)`);
      c.eq(bg.tone, theme.scheme, `${theme.id}: tone follows the request`);
      if (theme.id.startsWith('app')) c.eq([bg.followAttr, bg.themeTone], ['true', theme.scheme], `${theme.id}: app-following attributes are set`);
      const name = `${{ light: '14', dark: '15', 'app-light': '16', 'app-dark': '17' }[theme.id]}-capture-saved-appearance-${theme.id}-1440`;
      await env.saveShot(name, measure.normalPng);
      env.stats.shots.push({ file: `${name}.png`, scenario: 'M12-saved-submit', query: `scenario=M12-saved-submit&${theme.q}&controls=hide`, viewport: VP.w1440.id, appearance: theme.id });
      env.frames.push({ id: `appearance ${theme.id}`, scenario: 'M12-saved-submit', vp: VP.w1440.id, theme: theme.id, problems: problems.length, page: geometry.page, textMin: summary.textMin === null ? null : Number(summary.textMin.toFixed(2)), textFails: summary.textFailCount, fieldMin: summary.fieldMin === null ? null : Number(summary.fieldMin.toFixed(2)) });
    }
    c.eq(new Set(Object.values(seen)).size, 4, `the four appearances paint four distinct page backgrounds ${JSON.stringify(seen)}`);
  });
}
