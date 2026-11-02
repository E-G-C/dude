// M1 / M2 list checks, keyboard open, search / Clear / Working on, repository snapshot, fixture identification.
import { P, VP, chooseOption, clickSelector, evalFn, pressKey, sleep, until } from './harness.mjs';
import * as O from './oracle.mjs';

const ariaTokens = exp => {
  const tokens = [`${exp.number}.`, exp.title, `Stage: ${exp.stageText}`, exp.progress, exp.ideaPath];
  return tokens;
};

function checkRow(c, row, exp, layout, label) {
  c.eq(row.number, exp.number, `${label} number`);
  c.eq(row.title, exp.title, `${label} title`);
  // classification (spec US1.2 / US1.3, FR-006, edge cases for unrecognized / unavailable)
  if (exp.cls.unavailable) {
    c.matches(row.classification ?? '', /unavailable/i, `${label} unreadable record shows classification as unavailable`);
    c.absent(row.classification ?? '', /not set/i, `${label} unreadable record is not shown as Not set`);
  } else if (exp.cls.unrecognized.length) {
    c.matches(row.classification ?? '', /unrecognized/i, `${label} unrecognized value is labeled unrecognized`);
    for (const part of exp.cls.parts) c.matches(row.classification ?? '', new RegExp(part), `${label} keeps the recognized value ${part}`);
  } else if (exp.cls.line) {
    c.eq(row.classification, exp.cls.line, `${label} classification line`);
  } else {
    c.eq(row.classification, null, `${label} Not set shows no classification text`);
    c.absent(row.lines.join(' | '), /not set|unrecognized|intent|domain/i, `${label} Not set row carries no classification words`);
  }
  // stage + note + progress, per layout
  if (layout === 'grid') {
    c.eq(row.stageLines[0], exp.stageText, `${label} stage`);
    c.eq(row.stageLines[1] ?? null, exp.note, `${label} note beside stage`);
    c.eq(row.cells[2]?.[0] ?? null, exp.progress, `${label} progress`);
    c.eq(row.cells.length, 3, `${label} has exactly three cells (no new column)`);
  } else {
    c.eq(row.stageLines[0], `${exp.stageText}${exp.note ? ` · ${exp.note}` : ''} · ${exp.progress}`, `${label} compact stage line`);
  }
  // accessible label: number, title, intent, domain, stage, progress, path
  const aria = row.aria ?? '';
  for (const token of ariaTokens(exp)) c.ok(aria.includes(token), `${label} accessible label includes ${JSON.stringify(token)}`);
  c.matches(aria, /intent/i, `${label} accessible label names intent`);
  c.matches(aria, /domain/i, `${label} accessible label names domain`);
  if (exp.cls.unavailable) c.matches(aria, /unavailable/i, `${label} accessible label says unavailable`);
  else {
    if (exp.intentState === 'set') c.ok(aria.includes(`Intent ${exp.cls.intentWord}`), `${label} aria names intent ${exp.cls.intentWord}`);
    if (exp.domainState === 'set') c.ok(aria.includes(exp.cls.domainWord), `${label} aria names domain ${exp.cls.domainWord}`);
    if (exp.intentState === 'not-set') c.matches(aria, /not set/i, `${label} aria names Not set`);
    if (exp.intentState === 'unrecognized' || exp.domainState === 'unrecognized') c.matches(aria, /unrecognized/i, `${label} aria names unrecognized`);
  }
}

export async function listChecks(env) {
  const { oracle, ev, check, open, page } = env;
  const fx = oracle.fixtures;
  const byPath = new Map(fx.map(entry => [entry.ideaPath, entry]));
  const sorted = [...fx].sort((a, b) => Number(a.number) - Number(b.number));

  /* ------------------------------------------------ M1 grid */
  {
    const c = check('M1.grid', 'M1', 'M1 wide list: 13 fixture rows, every stage and classification state, no new column');
    await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const layout = await ev(P.probeLayout);
    const rows = await ev(P.probeRows);
    const commands = await ev(P.probeCommands);
    c.eq(layout.layout, 'grid', 'layout at 1440x900');
    c.ok(layout.contentWidth >= 620, `list content width ${layout.contentWidth} is at least 620`);
    c.eq(rows.length, 13, 'row count');
    c.eq(rows.map(row => row.number), sorted.map(entry => entry.number), 'numbers ascend in capture order 901..913');
    for (const row of rows) {
      const exp = byPath.get(row.path);
      if (!exp) { c.fail(`unexpected row ${row.path}`); continue; }
      checkRow(c, row, exp, 'grid', `row ${exp.number}`);
    }
    const stages = new Set(rows.map(row => row.stageLines[0]));
    c.eq([...O.STAGES, 'Stage unavailable'].filter(stage => !stages.has(stage)), [], 'all six stages plus unavailable appear in the list');
    c.eq(commands.columnHeaders, ['Name', 'Status', 'Progress'], 'column headers are unchanged (no type/domain/intent column)');
    const classifiedHeights = rows.filter(row => row.classification).map(row => row.height);
    const plainHeights = rows.filter(row => !row.classification).map(row => row.height);
    c.note(`row height classified ${Math.min(...classifiedHeights)}-${Math.max(...classifiedHeights)}px, unclassified ${Math.min(...plainHeights)}-${Math.max(...plainHeights)}px`);
    await env.saveShot('m1-grid-1440x900-light');
    c.shot('m1-grid-1440x900-light');
    c.done();
  }

  /* ------------------------------------------------ no filter / sort / new control (M1) */
  {
    const c = check('M1.no-filter', 'M1', 'No type, intent, or domain filter, sort, or column; Show keeps Open / Closed / All; search ignores classification');
    await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const commands = await ev(P.probeCommands);
    const names = commands.controls.map(control => control.name);
    c.absent(names.join(' | '), /intent|domain|type|kind|sort|filter/i, 'command-bar controls');
    c.eq(commands.controls.filter(control => control.type === 'search').length, 1, 'exactly one search input');
    const sortable = await ev(() => document.querySelectorAll('[role=columnheader] button, [aria-sort]').length);
    c.eq(sortable, 0, 'no sortable column headers');
    await clickSelector(page, '[role=combobox]');
    await env.waitFor(P.hasListbox, 'Show options', 4000);
    const options = await ev(P.listboxOptions);
    c.eq(options.map(option => option.text), ['Open', 'Closed', 'All'], 'Show options');
    await pressKey(page, 'Escape');
    await sleep(150);
    // search matches today's fields only: classification text is not searchable
    for (const query of ['Fix', 'writing', 'Create', 'Not set', 'Unrecognized', 'In progress']) {
      const expected = O.searchMatches(fx, query);
      await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
      await clickSelector(page, 'input[type=search]');
      await page.send('Input.insertText', { text: query });
      await sleep(200);
      const rows = await ev(P.probeRows);
      c.eq(rows.map(row => row.path).sort(), [...expected].sort(), `search "${query}" returns only rows whose number/title/slug/path match`);
    }
    c.done();
  }

  /* ------------------------------------------------ search, Show, Working on, Clear, Back */
  {
    const c = check('L.search-clear-working', 'M1', 'Search, Show, Working on, Clear, and Back to Overview stay usable');
    for (const query of ['upload', '909', 'docs', 'export', 'zzz-no-match']) {
      await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
      await clickSelector(page, 'input[type=search]');
      await page.send('Input.insertText', { text: query });
      await sleep(200);
      const rows = await ev(P.probeRows);
      const commands = await ev(P.probeCommands);
      c.eq(rows.map(row => row.path).sort(), [...O.searchMatches(fx, query)].sort(), `search "${query}" result set`);
      if (query === 'zzz-no-match') c.ok(commands.noMatch, 'an empty result says No matching work');
    }
    await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(page, 'input[type=search]');
    await page.send('Input.insertText', { text: 'upload' });
    await sleep(200);
    await clickSelector(page, '[data-work-path]');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now after row click', 5000);
    const now = await ev(P.probeNow);
    c.eq(now.path, '.dude/ideas/901-retry-failed-uploads.md', 'clicking the searched row opens 901 in Now');
    const commands = await ev(P.probeCommands);
    c.eq(commands.workingOn?.label, 'Working on', 'Working on group is shown');
    c.matches(commands.workingOn?.text ?? '', /901.*Retry failed uploads.*Clear/s, 'Working on names number and title and offers Clear');
    // Back to Overview: selected row shown, focus on it, Enter returns to Now
    await clickSelector(page, 'button', { text: 'Back to Overview' });
    await env.waitFor(() => Boolean(document.querySelector('[data-work-path]')), 'overview after Back', 5000);
    await sleep(250);
    const rowsAfterBack = await ev(P.probeRows);
    c.eq(rowsAfterBack.map(row => row.path), ['.dude/ideas/901-retry-failed-uploads.md'], 'Back to Overview shows only the working-on row');
    c.eq(rowsAfterBack[0]?.current, 'true', 'the selected row is aria-current');
    const active = await ev(P.activeDescriptor);
    c.eq(active?.path ?? null, '.dude/ideas/901-retry-failed-uploads.md', 'focus returns to the selected row');
    await pressKey(page, 'Enter');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now after Enter on selected row', 5000);
    c.eq((await ev(P.probeNow)).path, '.dude/ideas/901-retry-failed-uploads.md', 'Enter on the selected row returns to Now');
    // Clear
    await clickSelector(page, 'button', { text: 'Clear work selection' });
    await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 1, 'overview after Clear', 5000);
    await sleep(250);
    const cleared = await ev(P.probeCommands);
    const clearedRows = await ev(P.probeRows);
    c.eq(clearedRows.length, 13, 'Clear returns all 13 records');
    c.eq(cleared.searchValue, '', 'Clear empties the search');
    c.eq(cleared.scopeText, 'All', 'Clear sets Show to All');
    c.ok(cleared.searchFocused, 'Clear focuses the search field');
    c.eq(cleared.workingOn, null, 'Working on is gone after Clear');
    c.done();
  }

  /* ------------------------------------------------ M2 compact */
  {
    const c = check('M2.compact', 'M2', 'M2 compact list below 620px content width keeps number, title, classification, stage, progress');
    await open('scenario=M2&tone=light&controls=hide', VP.w600, 'light');
    const layout = await ev(P.probeLayout);
    const rows = await ev(P.probeRows);
    c.eq(layout.layout, 'compact', 'layout at 600x900');
    c.ok(layout.contentWidth < 620, `list content width ${layout.contentWidth} is below 620`);
    c.eq(rows.length, 13, 'compact item count');
    c.eq(rows.map(row => row.number), sorted.map(entry => entry.number), 'numbers ascend');
    for (const row of rows) {
      const exp = byPath.get(row.path);
      if (!exp) { c.fail(`unexpected item ${row.path}`); continue; }
      checkRow(c, row, exp, 'compact', `item ${exp.number}`);
    }
    c.eq(await ev(() => document.querySelectorAll('[role=columnheader]').length), 0, 'no column headers in the compact list');
    c.ok(layout.page[0] <= layout.page[1], `no page-wide horizontal scroll (${layout.page.join('/')})`);
    await env.saveShot('m2-compact-600x900-light');
    c.shot('m2-compact-600x900-light');
    c.done();
  }

  /* ------------------------------------------------ threshold is list CONTENT width */
  {
    const c = check('M2.threshold', 'M2', 'Layout switches on list content width (620px), not viewport width');
    await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const sweep = [];
    const widths = [1440, 1200, 1080, 900, 800, 768, 720, 700, 690, 680, 676, 675, 674, 673, 672, 671, 670, 669, 668, 667, 666, 665, 664, 660, 650, 640, 620, 600, 560, 520, 480, 420, 390];
    for (const width of widths) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(140);
      await ev(P.settle);
      const layout = await ev(P.probeLayout);
      sweep.push({ width, layout: layout.layout, content: layout.contentWidth, page: layout.page });
      c.eq(layout.layout, layout.contentWidth < 620 ? 'compact' : 'grid', `viewport ${width}: content ${layout.contentWidth}`);
      c.ok(layout.page[0] <= layout.page[1], `viewport ${width}: no page-wide horizontal scroll (${layout.page.join('/')})`);
    }
    const lastGrid = sweep.filter(entry => entry.layout === 'grid').at(-1);
    const firstCompact = sweep.filter(entry => entry.layout === 'compact')[0];
    c.note(`narrowest grid: viewport ${lastGrid?.width} (content ${lastGrid?.content}); widest compact: viewport ${firstCompact?.width} (content ${firstCompact?.content})`);
    // fresh loads near the threshold (initial layout comes from a media query before the observer corrects it)
    for (const width of [700, 690, 669, 668, 667, 640]) {
      await open('scenario=M1&tone=light&controls=hide', { id: `${width}x900`, w: width, h: 900, dpr: 1 }, 'light');
      const layout = await ev(P.probeLayout);
      c.eq(layout.layout, layout.contentWidth < 620 ? 'compact' : 'grid', `fresh load at ${width}: content ${layout.contentWidth}`);
    }
    c.done();
  }

  /* ------------------------------------------------ keyboard Enter opens the matching Now record */
  for (const [mode, query, vp] of [['grid', 'scenario=M1&tone=light&controls=hide', VP.w1440], ['compact', 'scenario=M2&tone=light&controls=hide', VP.w600]]) {
    const c = check(`L.enter-${mode}`, 'M1', `Row focus + Enter opens the matching Now record, ${mode} layout, all 13 rows`);
    for (const exp of sorted) {
      await open(query, vp, 'light');
      const focused = await ev(path => { const el = document.querySelector(`[data-work-path="${path}"]`); el.scrollIntoView({ block: 'center' }); el.focus(); return document.activeElement === el; }, exp.ideaPath);
      c.ok(focused, `${exp.number} row accepts focus`);
      await pressKey(page, 'Enter');
      const opened = await env.waitFor(() => Boolean(document.querySelector('[data-now]')), `Now for ${exp.number}`, 6000).catch(() => false);
      env.stats.enterOpens = (env.stats.enterOpens ?? 0) + 1;
      if (!opened) { c.fail(`${exp.number}: Enter did not open Now`); continue; }
      const now = await ev(P.probeNow);
      c.eq(now.path, exp.ideaPath, `${exp.number} Enter opens the matching record`);
      c.matches(now.title, new RegExp(`^${exp.number} `), `${exp.number} Now heading starts with the number`);
      c.ok(now.title.includes(exp.title), `${exp.number} Now heading keeps the title`);
      // same stage and progress in list and details (SC-001)
      c.eq(now.facts.Stage, exp.stage ?? 'Unavailable', `${exp.number} details header stage`);
      const stageRow = now.report.find(row => row.label === 'Stage');
      c.eq(stageRow?.value, exp.stage ?? 'Unavailable', `${exp.number} progress report stage`);
      c.ok(now.aside.some(line => line === `${exp.stageText} · ${exp.progress}`), `${exp.number} Selected record keeps stage and progress`);
      c.eq(now.facts.Intent, exp.cls.unavailable ? 'Unavailable' : exp.intentState === 'set' ? exp.cls.intentWord : exp.intentState === 'not-set' ? 'Not set' : 'Unrecognized', `${exp.number} Intent`);
      c.eq(now.facts.Domain, exp.cls.unavailable ? 'Unavailable' : exp.domainState === 'set' ? exp.cls.domainWord : exp.domainState === 'not-set' ? 'Not set' : 'Unrecognized', `${exp.number} Domain`);
    }
    c.done();
  }

  /* ------------------------------------------------ arrow keys from search reach rows; Enter opens */
  for (const [mode, query, vp] of [['grid', 'scenario=M1&tone=light&controls=hide', VP.w1440], ['compact', 'scenario=M2&tone=light&controls=hide', VP.w600]]) {
    const c = check(`L.arrows-${mode}`, 'M1', `Keyboard only: search -> ArrowDown reaches rows -> Enter opens (${mode})`);
    await open(query, vp, 'light');
    await clickSelector(page, 'input[type=search]');
    await pressKey(page, 'ArrowDown');
    await sleep(200);
    const first = await ev(P.activeDescriptor);
    c.eq(first?.path ?? null, sorted[0].ideaPath, 'ArrowDown from the search field focuses the first row');
    await pressKey(page, 'ArrowDown'); await sleep(120);
    await pressKey(page, 'ArrowDown'); await sleep(120);
    const third = await ev(P.activeDescriptor);
    c.eq(third?.path ?? null, sorted[2].ideaPath, 'two more ArrowDown moves reach the third row');
    await pressKey(page, 'Enter');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now after keyboard-only open', 6000).catch(() => false);
    c.eq((await ev(P.probeNow))?.path ?? null, sorted[2].ideaPath, 'Enter opens the third row in Now');
    c.done();
  }

  /* ------------------------------------------------ S3: repository snapshot, every actual record Not set */
  {
    const c = check('S3.repository', 'M1', 'Repository snapshot: 91 actual records, every record Not set, stages follow the shared rule');
    const expectations = oracle.snapshot;
    await open('scenario=S3&tone=light&controls=hide', VP.w1440, 'light');
    const rows = await ev(P.probeRows);
    const byPathSnap = new Map(expectations.map(entry => [entry.ideaPath, entry]));
    c.eq(rows.length, 91, 'row count equals the 91 snapshot records');
    c.eq(rows.filter(row => row.classification !== null).length, 0, 'rows with a classification line');
    c.eq(rows.filter(row => !/Intent and domain not set/.test(row.aria ?? '')).length, 0, 'rows whose accessible label lacks "Intent and domain not set"');
    c.eq(rows.filter(row => /\b9\d\d\./.test(row.aria ?? '')).length, 0, 'no fixture number (9xx) leaks into the repository view');
    let wrong = 0;
    for (const row of rows) {
      const exp = byPathSnap.get(row.path);
      if (!exp) { wrong += 1; continue; }
      const ok = row.number === exp.number && row.title === exp.title && row.stageLines[0] === exp.stageText && (row.stageLines[1] ?? null) === exp.note
        && row.cells[2]?.[0] === exp.progress;
      if (!ok) { wrong += 1; if (wrong <= 5) c.fail(`row ${row.number}: observed ${JSON.stringify([row.title, row.stageLines, row.cells[2]])} vs ${JSON.stringify([exp.title, exp.stageText, exp.note, exp.progress])}`); }
    }
    c.eq(wrong, 0, 'rows whose number/title/stage/note/progress differ from the shared-rule oracle');
    const stageCounts = {};
    for (const row of rows) stageCounts[row.stageLines[0]] = (stageCounts[row.stageLines[0]] ?? 0) + 1;
    c.note(`repository stage counts: ${JSON.stringify(stageCounts)}`);
    await env.saveShot('s3-repository-1440x900-light');
    c.shot('s3-repository-1440x900-light');
    c.done();
  }

  /* ------------------------------------------------ fixtures are visibly identified as fixtures */
  {
    const c = check('R.fixture-identification', 'M1', 'Fixtures 901-913 are visibly identified as fixtures, not as real records');
    await open('scenario=M1&tone=light', VP.w1440, 'light');
    const strip = await ev(P.probeStrip);
    c.matches(strip.text, /13 acceptance fixtures numbered 901 to 913/, 'expanded strip names the 13 fixtures 901 to 913');
    c.matches(strip.text, /None is a record of this repository/, 'expanded strip says none is a record of this repository');
    c.matches(strip.text, /Not part of Canvas/, 'strip says it is not part of Canvas');
    c.ok(strip.rect[1] >= 0 && strip.rect[1] + strip.rect[3] <= 900 && strip.rect[2] <= 1440, `strip is fully inside the viewport (${strip.rect.map(Math.round)})`);
    await env.saveShot('m1-strip-expanded-1440x900-light');
    c.shot('m1-strip-expanded-1440x900-light');
    await open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const hidden = await ev(P.probeStrip);
    c.matches(hidden.text, /Acceptance fixtures \(901 to 913\)/, 'collapsed strip still names Acceptance fixtures (901 to 913)');
    await open('scenario=S3&tone=light', VP.w1440, 'light');
    const repo = await ev(P.probeStrip);
    c.matches(repo.text, /This repository: 91 records/, 'repository view is labeled as the repository snapshot');
    c.matches(repo.text, /No ledger records an intent or domain/, 'repository view says no ledger records an intent or domain');
    c.done();
  }
}
