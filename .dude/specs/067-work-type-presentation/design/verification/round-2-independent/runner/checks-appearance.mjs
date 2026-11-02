// M13: appearance, size, focus, accessibility names, contrast, geometry. Every measurement is taken from the rendered page.
import { P, THEMES, VP, axAudit, clickSelector, evalFn, measureContrast, measureScrolled, pressKey, sleep, summarizeContrast, tabWalk, until } from './harness.mjs';

const SAVE = new Set([
  'M1|light|1440x900', 'M1|dark|1440x900', 'M1|app-dark|1440x900', 'M1|app-light|1440x900', 'M1|light|768x900', 'M2|light|600x900', 'M2|dark|600x900', 'M2|app-light|600x900',
  'M1|light|720x450@2 (200% emulated)', 'M1|app-dark|720x450@2 (200% emulated)', 'M4|dark|1440x900', 'M4|app-light|1440x900', 'M4|dark|768x900',
  'M4|light|720x450@2 (200% emulated)', 'M5|light|1280x900', 'M5|dark|1280x900', 'M5|app-dark|1280x900', 'M5|light|768x900', 'M5|light|720x450@2 (200% emulated)',
  'M12-kept|dark|1440x900', 'M12-kept|light|600x900', 'M12-kept|app-light|720x450@2 (200% emulated)', 'M11b|dark|1440x900', 'M11b|app-dark|1440x900',
  'M6|app-dark|1440x900', 'M7|dark|1440x900', 'M10|app-light|1440x900', 'M14a|dark|1440x900', 'M12-uncertain|dark|1440x900', 'M12-invalid|app-dark|1440x900',
]);
const slug = value => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export async function appearanceChecks(env, { quick = false } = {}) {
  const { check, page } = env;
  const g = {
    console: check('A.console', 'M13', 'No console errors, warnings, or uncaught exceptions while rendering any measured frame'),
    overflow: check('A.overflow-clipping', 'M13', 'No page-wide horizontal scroll, off-screen text, or clipped / ellipsized text in rows, report, capture form, or details at any measured size'),
    text: check('A.text-contrast', 'M13', 'Enabled product text meets WCAG 1.4.3 (4.5:1; 3:1 large) measured as computed text color over the actually rendered background'),
    fields: check('A.control-contrast', 'M13', 'Search, Show, Intent, Domain, and Describe-the-work boundaries reach 3:1 against their surroundings (best edge, from rendered pixels)'),
    targets: check('A.target-size', 'M13', 'New and essential controls are at least 24x24 CSS px (WCAG 2.5.8 measure; exceptions not evaluated)'),
    strip: check('A.mock-strip-legible', 'M13', 'Mock-strip text (the fixture identification) is legible: contrast and inside the viewport'),
  };
  const frames = env.frames;
  const smallByFrame = [];

  /* ---- positive and negative controls for the detectors (known-bad content must be flagged, known-good accepted) */
  {
    const t = check('X.probe-selftest', 'bind', 'Measuring probes are live: injected clipped text, low-contrast text, a faint field boundary, and a focus ring that is removed are all flagged; good controls are accepted');
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    await evalFn(page, () => {
      const root = document.querySelector('header').parentElement;
      const box = document.createElement('div');
      box.id = '__t_box';
      box.style.cssText = 'position:fixed;z-index:99999;left:300px;top:200px;width:700px;height:420px;background:#fafafa;border:0';
      root.append(box);
      const make = (tag, id, css, text) => { const node = document.createElement(tag); node.id = id; node.style.cssText = `position:absolute;${css}`; if (text) node.textContent = text; box.append(node); return node; };
      make('div', '__t_clip', 'left:20px;top:20px;width:40px;overflow:hidden;white-space:nowrap;background:#fff;color:#000;font:14px sans-serif', 'This line is much longer than its box');
      make('p', '__t_low', 'left:20px;top:60px;margin:0;padding:4px;background:#777;color:#808080;font:14px sans-serif', 'Low contrast sample text');
      make('p', '__t_good', 'left:20px;top:100px;margin:0;padding:4px;background:#fff;color:#000;font:14px sans-serif', 'High contrast sample text');
      make('input', '__t_field', 'left:20px;top:150px;width:200px;height:30px;border:1px solid #e6e6e6;background:#fff', null);
      make('button', '__t_ring', 'left:320px;top:20px;background:#fff;color:#000;border:1px solid #000', 'Ring');
      make('button', '__t_noring', 'left:320px;top:80px;background:#fff;color:#000;border:1px solid #fafafa', 'No ring');
      const style = document.createElement('style');
      style.textContent = '#__t_ring:focus{outline:3px solid #000;outline-offset:2px}#__t_noring,#__t_noring:focus{outline:none;box-shadow:none}';
      document.head.append(style);
      return true;
    });
    const geometry = await evalFn(page, P.probeGeometry);
    t.ok(geometry.clipped.some(entry => entry.el.includes('This line is much longer')), 'geometry probe flags the injected clipped text');
    const measure = await measureContrast(env);
    const low = measure.text.find(entry => entry.t.startsWith('Low contrast')), good = measure.text.find(entry => entry.t.startsWith('High contrast'));
    t.ok(Boolean(low) && low.ratio < 1.6, `low-contrast sample measured ${low?.ratio.toFixed(2)} (expected about 1.2)`);
    t.ok(Boolean(good) && good.ratio > 15, `high-contrast sample measured ${good?.ratio.toFixed(2)} (expected 21)`);
    const summary = summarizeContrast(measure);
    t.ok(summary.textFailCount >= 1, 'text summary counts the injected low-contrast sample as a failure');
    t.ok(summary.fieldFails.some(entry => entry.name === 'INPUT'), 'field-boundary summary flags the injected faint border');
    t.ok(measure.boundaries.some(entry => ['field', 'dropdown'].includes(entry.kind) && entry.name !== 'INPUT' && entry.best >= 3),
      'a real product field (search or Show) measures at 3:1 or better, so the detector discriminates');
    const ring = (await tabWalk(env, 0, { focusFirst: '#__t_ring' }))[0];
    const noRing = (await tabWalk(env, 0, { focusFirst: '#__t_noring' }))[0];
    t.ok(ring && ring.changed >= 6 && ring.indicatorRatio >= 3, `focus ring with outline is detected (${ring?.changed} px, ${ring?.indicatorRatio.toFixed(1)}:1)`);
    t.ok(noRing && noRing.changed < 6, `focus without any outline is detected as no indicator (${noRing?.changed} px)`);
    t.done();
  }
  const record = async (scenario, themeEntry, vp) => {
    const key = `${scenario}|${themeEntry.id}|${vp.id}`;
    await env.open(`scenario=${scenario}&${themeEntry.q}&controls=hide`, vp, themeEntry.scheme);
    const problems = env.problems();
    const geometry = await evalFn(page, P.probeGeometry);
    const measure = await measureScrolled(env, { keepShot: SAVE.has(key) });
    const png = measure.normalPng;
    const summary = summarizeContrast(measure);
    const hard = geometry.clipped.filter(entry => ['row', 'report', 'capture', 'now'].includes(entry.area));
    const hscrollHard = geometry.hscroll.filter(entry => ['row', 'report', 'capture', 'now', 'other'].includes(entry.area));
    const frame = { id: key, vp: vp.id, theme: themeEntry.id, scenario, problems: problems.length, page: geometry.page, offscreen: geometry.offscreen.length,
      clipped: hard.length, hscroll: hscrollHard.length, scanned: geometry.scanned, textSamples: summary.textSamples, textMin: summary.textMin === null ? null : Number(summary.textMin.toFixed(2)),
      fieldMin: summary.fieldMin === null ? null : Number(summary.fieldMin.toFixed(2)), fieldCount: summary.fieldBoundaries, textFails: summary.textFailCount,
      stripMin: summary.stripMin === null ? null : Number(summary.stripMin.toFixed(2)), small: geometry.small.length, disabledSamples: summary.disabledSamples,
      disabledMin: summary.disabledMin === null ? null : Number(summary.disabledMin.toFixed(2)),
      passes: measure.passes, skippedControls: measure.skippedControls,
      textMinAt: summary.textMinEntry ? `"${summary.textMinEntry.t}" ${summary.textMinEntry.fs}px fg${JSON.stringify(summary.textMinEntry.fg)} on bg${JSON.stringify(summary.textMinEntry.bg)}` : null };
    frames.push(frame);
    g.console.ok(problems.length === 0, `${key}: console/log problems ${JSON.stringify(problems.slice(0, 3))}`);
    g.overflow.ok(geometry.page.sw <= geometry.page.cw + 1, `${key}: page-wide horizontal scroll (${geometry.page.sw} > ${geometry.page.cw})`);
    g.overflow.eq(geometry.offscreen, [], `${key}: text beyond the viewport edge`);
    g.overflow.eq(hard, [], `${key}: clipped or ellipsized text`);
    g.overflow.eq(hscrollHard, [], `${key}: horizontally scrolling regions in content`);
    g.text.ok(summary.textFailCount === 0, `${key}: ${summary.textFailCount} text samples below their threshold; lowest ${JSON.stringify(summary.textFails.slice(0, 3).map(entry => [entry.t, Number(entry.ratio.toFixed(2)), entry.required, entry.fg, entry.bg]))}`);
    g.fields.ok(summary.fieldFails.length === 0, `${key}: field boundaries below 3:1 ${JSON.stringify(summary.fieldFails.map(entry => [entry.name, Number(entry.best.toFixed(2))]))}`);
    g.strip.ok(summary.stripFailCount === 0, `${key}: mock-strip text below threshold ${JSON.stringify(summary.stripFails.map(entry => [entry.t, Number(entry.ratio.toFixed(2))]))}`);
    for (const entry of geometry.small) smallByFrame.push({ key, ...entry });
    if (png) await env.saveShot(`m13-${slug(scenario)}-${slug(themeEntry.id)}-${slug(vp.id)}`, png);
    return { frame, geometry, summary };
  };

  const themes = quick ? THEMES.slice(0, 2) : THEMES;

  /* ---- size matrix: four themes x scenarios x sizes */
  for (const themeEntry of themes) {
    for (const vp of [VP.w1440, VP.w768, VP.w600, VP.z200]) {
      await record(vp === VP.w600 ? 'M2' : 'M1', themeEntry, vp);
      await record('M4', themeEntry, vp);
      await record('M5', themeEntry, vp);
      await record('M12-kept', themeEntry, vp);
    }
    await record('M5', themeEntry, VP.w1280);
    await record('M5', themeEntry, VP.w1080);
  }
  /* ---- breadth at 1440x900 for every remaining scenario in every variant */
  const breadth = ['M3', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11a', 'M11b', 'M14a', 'M14b', 'M12-default', 'M12-chosen', 'M12-sending', 'M12-uncertain', 'M12-saved', 'M12-missing',
    'M12-invalid', 'M12-waiting', 'S1', 'S2', 'S3'];
  for (const themeEntry of themes) for (const scenario of breadth) await record(scenario, themeEntry, VP.w1440);

  /* ---- target size, reported from every frame */
  {
    const newControls = smallByFrame.filter(entry => entry.area === 'capture' || (entry.area === 'now' && /Respond|Review|Back|Choose/.test(entry.el)) || entry.area === 'row');
    g.targets.eq(newControls, [], 'new or essential controls under 24x24 CSS px');
    const others = [...new Map(smallByFrame.filter(entry => !newControls.includes(entry)).map(entry => [`${entry.area}:${entry.el}:${entry.w}x${entry.h}`, entry])).values()];
    g.targets.note(`other targets under 24px (listed for information; WCAG 2.5.8 spacing/inline exceptions not evaluated): ${JSON.stringify(others.slice(0, 12).map(entry => `${entry.area}:${entry.el} ${entry.w}x${entry.h}`))}`);
  }

  /* ---- the new Intent and Domain option lists, opened, in every appearance and at 1440x900 and 200% */
  {
    const d = check('A.option-lists', 'M13', 'Intent and Domain option lists (new UI): opened lists stay inside the viewport, show the selected option by a mark as well as color, and their text meets contrast');
    let samples = 0, lowest = null;
    for (const themeEntry of themes) {
      for (const vp of [VP.w1440, VP.z200]) {
        for (const field of ['intent', 'domain']) {
          await env.open(`scenario=M12-chosen&${themeEntry.q}&controls=hide`, vp, themeEntry.scheme);
          await clickSelector(page, `[data-capture-choice="${field}"]`);
          await env.waitFor(P.hasListbox, `${field} options`, 4000);
          await sleep(250);
          const list = await evalFn(page, P.listboxProbe);
          const tag = `${field}/${themeEntry.id}/${vp.id}`;
          d.ok(list.inViewport, `${tag}: option list rect ${JSON.stringify(list.rect)} lies inside the viewport`);
          d.eq(list.options.length, field === 'intent' ? 5 : 6, `${tag}: option count`);
          const selected = list.options.filter(option => option.selected);
          d.eq(selected.map(option => option.text), [field === 'intent' ? 'Fix' : 'Code'], `${tag}: the chosen option is exposed as selected`);
          d.ok(selected.every(option => option.icon), `${tag}: the selected option carries a visible mark, not color alone`);
          const measure = await measureContrast(env);
          const popup = measure.text.filter(entry => entry.region === 'popup' && !entry.disabled);
          samples += popup.length;
          const worst = popup.reduce((low, entry) => (!low || entry.ratio < low.ratio ? entry : low), null);
          if (worst && (!lowest || worst.ratio < lowest.ratio)) lowest = { ratio: Number(worst.ratio.toFixed(2)), at: tag, text: worst.t };
          d.ok(popup.length >= list.options.length, `${tag}: ${popup.length} option-text samples measured`);
          d.ok(popup.every(entry => entry.ratio + 0.001 >= entry.required), `${tag}: option text below threshold ${JSON.stringify(popup.filter(entry => entry.ratio < entry.required).slice(0, 3).map(entry => [entry.t, Number(entry.ratio.toFixed(2))]))}`);
          if (themeEntry.id === 'dark' && vp === VP.w1440 && field === 'intent') await env.saveShot('m13-option-list-intent-dark-1440x900');
        }
      }
    }
    d.note(`option-text samples ${samples}; lowest ${JSON.stringify(lowest)}`);
    env.stats.optionListSamples = samples; env.stats.optionListLowest = lowest;
    d.done();
  }

  /* ---- keyboard focus */
  {
    const f = check('A.focus', 'M13', 'Keyboard: Tab reaches the expected controls in order; each product stop shows a painted focus indicator (>= 3:1), stays in view, and is not obscured');
    const walks = [
      { id: 'overview', scenario: 'M1', vp: VP.w1440, stops: 12, expect: ['Search work', 'Show', 'Refresh', 'Expand navigation pane', 'New work item'], rows: true },
      { id: 'now', scenario: 'M4', vp: VP.w1440, stops: 12, expect: ['Clear work selection', 'Refresh', 'Back to Overview', 'Respond to request', 'Review design'] },
      { id: 'capture', scenario: 'M12-chosen', vp: VP.w1440, stops: 5, focusFirst: '[data-capture-form] textarea', expect: ['Describe the work', 'Intent (optional)', 'Domain (optional)', 'Submit', 'Save', 'Cancel'],
        order: ['Describe the work', 'Intent (optional)', 'Domain (optional)', 'Submit', 'Save', 'Cancel'] },
    ];
    let stopsMeasured = 0, baselineInvalid = 0;
    const weakest = [], methods = {}, unmeasurable = [];
    for (const themeEntry of themes) {
      for (const walk of walks) {
        await env.open(`scenario=${walk.scenario}&${themeEntry.q}&controls=hide`, walk.vp, themeEntry.scheme);
        const stops = await tabWalk(env, walk.stops, { focusFirst: walk.focusFirst ?? null });
        const product = stops.filter(stop => !stop.none && !stop.mock);
        const labels = product.map(stop => stop.label);
        for (const wanted of walk.expect) f.ok(labels.some(label => label.includes(wanted)), `${walk.id}/${themeEntry.id}: Tab reaches "${wanted}" (${JSON.stringify(labels.slice(0, 10))})`);
        if (walk.rows) f.ok(product.some(stop => stop.path), `${walk.id}/${themeEntry.id}: Tab reaches a work row`);
        if (walk.order) {
          const positions = walk.order.map(name => labels.findIndex(label => label === name));
          f.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])), `${walk.id}/${themeEntry.id}: form focus order ${JSON.stringify(labels)}`);
        }
        for (const stop of product) {
          stopsMeasured += 1;
          methods[stop.method] = (methods[stop.method] ?? 0) + 1;
          f.ok(stop.inViewport, `${walk.id}/${themeEntry.id}: ${stop.label} is in view`);
          f.ok(!stop.obscured, `${walk.id}/${themeEntry.id}: ${stop.label} is not covered by another element`);
          f.ok(stop.visibleFocus, `${walk.id}/${themeEntry.id}: ${stop.label} matches :focus-visible`);
          if (!stop.baselineValid) { baselineInvalid += 1; unmeasurable.push(`${walk.id}/${themeEntry.id}/${stop.label.slice(0, 24)} out=${stop.outsideChanged}`); continue; }
          f.ok(stop.changed >= 6, `${walk.id}/${themeEntry.id}: ${stop.label} paints a focus indicator (${stop.changed} changed px)`);
          f.ok(stop.indicatorRatio >= 3, `${walk.id}/${themeEntry.id}: ${stop.label} focus indicator contrast ${stop.indicatorRatio.toFixed(2)} < 3`);
          weakest.push([stop.indicatorRatio, `${walk.id}/${themeEntry.id}/${stop.label}`]);
        }
      }
    }
    weakest.sort((a, b) => a[0] - b[0]);
    f.note(`stops measured ${stopsMeasured} (${JSON.stringify(methods)}); indicator unmeasurable ${baselineInvalid} ${JSON.stringify(unmeasurable.slice(0, 8))}; weakest indicators ${JSON.stringify(weakest.slice(0, 4).map(([ratio, label]) => [Number(ratio.toFixed(2)), label]))}`);
    env.stats.focusStops = stopsMeasured; env.stats.focusWeakest = weakest[0] ? { ratio: Number(weakest[0][0].toFixed(2)), stop: weakest[0][1] } : null;
    f.done();
  }

  /* ---- accessibility tree names */
  {
    const n = check('A.names', 'M13', 'Accessibility tree: every interactive node has a name; row names carry number, title, intent, domain, stage, progress, path');
    const scenes = [['M1', VP.w1440], ['M2', VP.w600], ['M3', VP.w1440], ['M4', VP.w1440], ['M5', VP.w1440], ['M6', VP.w1440], ['M7', VP.w1440], ['M10', VP.w1440], ['M11a', VP.w1440], ['M11b', VP.w1440],
      ['M12-chosen', VP.w1440], ['M12-kept', VP.w1440], ['M12-uncertain', VP.w1440], ['S1', VP.w1440], ['S2', VP.w1440], ['S3', VP.w1440], ['M4', VP.z200], ['M1', VP.z200]];
    let interactive = 0;
    for (const [scenario, vp] of scenes) {
      await env.open(`scenario=${scenario}&tone=light&controls=hide`, vp, 'light');
      const ax = await axAudit(env);
      interactive += ax.namedInteractive + ax.unnamed.length;
      const levels = await evalFn(page, () => [...document.querySelectorAll('main h1, main h2, main h3, main h4')].filter(node => node.checkVisibility()).map(node => Number(node.tagName[1])));
      n.ok(levels[0] === 1 && levels.every((level, index) => index === 0 || level - levels[index - 1] <= 1), `${scenario}@${vp.id}: heading levels ${levels.join('')} start at h1 and never skip a level`);
      n.eq(ax.unnamed, [], `${scenario}@${vp.id}: interactive AX nodes without a name`);
      n.eq(ax.focusableUnnamed.length, 0, `${scenario}@${vp.id}: focusable AX nodes without a name ${JSON.stringify(ax.focusableUnnamed.slice(0, 3))}`);
      if (['M1', 'M2', 'S3'].includes(scenario)) {
        const dom = (await evalFn(page, P.probeRows)).map(row => row.aria);
        n.eq(ax.rows.map(row => row.name).sort(), [...dom].sort(), `${scenario}: AX row names equal the rows' accessible labels (${ax.rows.length} rows)`);
        for (const row of ax.rows.slice(0, scenario === 'S3' ? 91 : 13)) {
          n.matches(row.name, /^\d{3}\. .+\. (Intent .+, domain .+|Intent and domain (not set|unavailable))\. Stage: .+\. (\d+ of \d+ tasks|Progress not established)\. \.dude\/ideas\/.+\.md$/, `${scenario}: row name shape for ${row.name.slice(0, 40)}`);
        }
      }
    }
    n.note(`AX frames audited ${scenes.length}; interactive nodes seen ${interactive}`);
    env.stats.axFrames = scenes.length; env.stats.axInteractive = interactive;
    n.done();
  }

  /* ---- theme variants and device preference */
  {
    const t = check('A.theme', 'M13', 'Ordinary and app-following light / dark variants apply; the device preference (prefers-color-scheme) is honored without ?tone');
    const hosts = env.data.fixtures.hostAppearance;
    const hex = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
    for (const themeEntry of THEMES) {
      await env.open(`scenario=M1&${themeEntry.q}&controls=hide`, VP.w1440, themeEntry.scheme);
      const bg = await evalFn(page, P.pageBackground);
      const app = themeEntry.id.startsWith('app');
      t.eq(bg.followAttr, app ? 'true' : 'false', `${themeEntry.id}: data-dude-follow-app-theme`);
      t.eq(bg.tone, themeEntry.scheme, `${themeEntry.id}: tone`);
      const want = app ? hex(hosts[themeEntry.id === 'app-light' ? 'app-light' : 'app-dark']['--background-color-default']) : themeEntry.scheme === 'light' ? [245, 245, 245] : [20, 20, 20];
      t.eq(bg.body.slice(0, 3), want, `${themeEntry.id}: body background (from ${app ? 'the observed host variable' : 'the product document base'})`);
    }
    for (const scheme of ['dark', 'light']) {
      await env.open('scenario=M1&controls=hide', VP.w1440, scheme);
      const bg = await evalFn(page, P.pageBackground);
      t.eq([bg.scheme, bg.tone, bg.body.slice(0, 3)], [scheme, scheme, scheme === 'dark' ? [20, 20, 20] : [245, 245, 245]], `device preference ${scheme} without ?tone`);
    }
    t.done();
  }

  for (const entry of Object.values(g)) entry.done();
  return { smallByFrame };
}
