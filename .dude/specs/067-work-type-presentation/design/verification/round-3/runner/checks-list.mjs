// Round 3 list, details, progress, and copy-sweep checks (areas 3 to 5). Independent oracle: raw fixtures, the snapshot, the spec rules,
// and the coordinator handoff. The mock's own functions are never imported or called.
import { C, H, O, P, RE, VP, apos, axSnapshot, axStrings, clickSelector, evalFn, norm, pressKey, probeDetails, probeRowDetail, probeTexts, sleep, typeDraft } from './lib.mjs';
import { guarded, probeRowsLite } from './checks-capture.mjs';
import fs from 'node:fs';
import path from 'node:path';

const same = (a, b) => norm(apos(a)) === norm(apos(b));

const copyOf = texts => [...texts.copy, ...texts.labels, ...texts.titles, ...texts.placeholders].join(' | ');
const squash = value => apos(value).replace(/\s+/g, '').toLowerCase();
const OTHER_ALLOWED = /Other current requests|Other requests for this work item may be missing\./g;

async function openRecord(env, ideaPath) {
  await clickSelector(env.page, `[data-work-path="${ideaPath}"]`);
  await env.waitFor(() => Boolean(document.querySelector('[data-now]')), `Now for ${ideaPath}`, 5000);
  await sleep(60);
}
async function backToOverview(env) {
  // Back to Overview keeps the work selection (only that row shows); Clear returns to the full list for the next record.
  await clickSelector(env.page, 'button', { text: 'Clear work selection' });
  await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 1, 'overview rows after Clear', 5000);
}

export async function listChecks(env) {
  const { page } = env;
  const h = env.handoff, fx = env.oracle.fixtures, snap = env.oracle.snapshot, words = h.fixtures.expectedWords;
  const wordsOf = number => (words[number] || '').split(' · ').filter(Boolean);
  const labelFor = (e, extra) => `${e.number}. ${e.title}. ${(extra ?? wordsOf(e.number)).length ? `${(extra ?? wordsOf(e.number)).join(', ')}. ` : ''}Stage: ${e.stageText}${e.note ? `, ${e.note}` : ''}. ${e.progress}. ${e.ideaPath}`;

  /* ---------------------------------------------------------------- L1: rows (area 4) */
  await guarded(env, 'L1.rows-words-columns', 'list', 'Wide and compact lists: 13 fixture rows in 3 columns; recorded words sit under the title as quiet text and nowhere else; rows with no recorded or an unrecognized word show nothing; accessible names carry the words; unavailable title, stage, and progress stay visible', async c => {
    c.eq(Object.keys(words).length, 13, 'the handoff maps 13 fixtures');
    for (const [mode, query, vp] of [['grid', 'scenario=M1', VP.w1440], ['compact', 'scenario=M2', VP.w600]]) {
      await env.open(`${query}&tone=light&controls=hide`, vp, 'light');
      c.eq((await env.ev(P.probeLayout)).layout, mode, `${mode}: layout`);
      const rows = await env.ev(probeRowDetail);
      c.eq(rows.length, 13, `${mode}: rows`);
      c.eq(rows.map(row => row.number), fx.map(entry => entry.number).sort(), `${mode}: rows keep capture order, oldest first (numbers 901 to 913)`);
      let withWords = 0;
      for (const e of fx) {
        const row = rows.find(entry => entry.path === e.ideaPath);
        if (!row) { c.fail(`${mode}: no row for ${e.number}`); continue; }
        const expectedWords = words[e.number] || null;
        withWords += expectedWords ? 1 : 0;
        c.ok(row.text.includes(e.stageText) && row.text.includes(e.progress), `${mode} ${e.number}: the row shows its stage "${e.stageText}" and progress "${e.progress}"`);
        c.eq(row.words, expectedWords, `${mode} ${e.number}: words under the title`);
        c.eq(row.order, expectedWords ? ['title', 'words', 'slug'] : ['title', 'slug'], `${mode} ${e.number}: order inside the Name cell`);
        c.eq(row.aria, labelFor(e), `${mode} ${e.number}: accessible name`);
        c.eq([row.number, row.title, row.stage], [e.number, e.title, e.stageText], `${mode} ${e.number}: number, title (or "Title unavailable"), stage`);
        c.eq(row.labelledFields, 0, `${mode} ${e.number}: no labeled field, definition list, select, or combobox in the row`);
        if (expectedWords) {
          c.ok(Number(row.wordsWeight) <= 400 && /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(row.wordsBg), `${mode} ${e.number}: words are plain quiet text (weight ${row.wordsWeight}, background ${row.wordsBg})`);
          if (row.wordsColor !== row.slugColor) c.note(`${mode} ${e.number}: words color ${row.wordsColor} differs from the slug color ${row.slugColor} (reported, not a spec violation)`);
        }
        if (e.number === '912') {
          c.matches(row.text, /Title unavailable/, '912: the unavailable title stays visible');
          c.matches(row.text, /Stage unavailable/, '912: the unavailable stage stays visible');
          c.matches(row.text, /Progress not established/, '912: the unavailable progress stays visible');
          c.absent(row.text, RE.classification, '912: says nothing about classification');
        }
        if (e.number === '909') c.absent(row.aria + row.text, /unrecogni|intent/i, '909: the unrecognized intent leaves no trace');
        if (e.number === '911') c.eq(row.words, 'Exploration', '911: shows only the recorded intent word');
      }
      c.eq(withWords, 11, `${mode}: 11 of 13 fixtures have words (908 and 912 have none)`);
      if (mode === 'grid') {
        const grid = await env.ev(() => ({ headers: [...document.querySelectorAll('[role=columnheader]')].map(node => node.textContent.trim()),
          sortable: document.querySelectorAll('[role=columnheader] button, [aria-sort]').length, controls: [...document.querySelectorAll('header button, header input, header [role=combobox]')].map(node => node.getAttribute('aria-label') || node.textContent.trim() || node.getAttribute('placeholder') || '') }));
        c.eq(grid.headers, ['Name', 'Status', 'Progress'], 'three columns; no Intent, Domain, or Type column');
        c.eq(rows.map(row => row.cells), Array(13).fill(3), 'every row has three cells');
        c.eq(grid.sortable, 0, 'no sortable header');
        c.absent(grid.controls.join(' | '), /intent|domain|type|kind|sort|filter|categor/i, 'command bar has no classification filter or sort');
      }
    }
  });

  /* ---------------------------------------------------------------- L2: details, hidden gaps, genuine unavailable (area 4) */
  await guarded(env, 'L2.details-words-and-gaps', 'list', 'Details: recorded words sit in the header with title and stage; no labeled Intent/Domain/Stage list or correction instruction; 908, 909 (unknown intent), 912 (unreadable), and the actual 087 draft show nothing for classification, no Not set, no warning; genuine unavailable stage and next step stay visible', async c => {
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const table = { '901': ['Fix \u00b7 Code', 'Fix, Code'], '906': ['Exploration', 'Exploration'], '908': [null, null], '909': ['Design', 'Design'], '911': ['Exploration', 'Exploration'], '912': [null, null] };
    for (const [number, [visual, speech]] of Object.entries(table)) {
      const e = fx.find(entry => entry.number === number);
      await openRecord(env, e.ideaPath);
      const d = await env.ev(probeDetails);
      const copy = copyOf(await env.ev(probeTexts));
      c.eq(d.path, e.ideaPath, `${number}: opens its own record`);
      c.eq([d.eyebrow, d.stage], ['Work item', e.stageText], `${number}: neutral eyebrow and the same stage as the list`);
      c.eq([d.words, d.speech], [visual, speech], `${number}: header words (visual, then spoken with commas)`);
      c.eq([d.factsLists, d.corrections], [0, 0], `${number}: no labeled Intent/Domain/Stage list and no correction instruction`);
      c.absent(copy, RE.classification, `${number}: no classification placeholder, warning, or instruction in product copy`);
      c.absent(d.text.replace(/Captured description[\s\S]*$/, ''), /\bNot set\b|\bUnrecognized\b|Classification unavailable/, `${number}: no Not set, Unrecognized, or Classification unavailable`);
      if (number !== '912') c.eq(d.messageBars, [], `${number}: no warning or error notice for a missing or unknown classification`);
      if (number === '908') {
        c.eq(d.unknown, ['No definition, phase, or required gate is recorded yet.'], '908: one summary sentence');
        c.eq(d.description, e.intentText, '908: the captured description is shown');
      }
      if (number === '912') {
        c.eq(d.stage, 'Stage unavailable', '912: the header says the stage is unavailable');
        c.eq(d.nextHeading, 'Next step unavailable', '912: the next step is unavailable, not hidden');
        c.eq(d.messageBars.length, 1, '912: exactly one notice, about the unreadable record');
        c.matches(d.messageBars[0], /couldn.t be read/i, '912: that notice says the record could not be read');
        c.matches(d.progressText, /Unavailable[\s\S]*couldn.t be read, so its stage is unknown/, '912: the report says the stage is unknown because the record could not be read');
        c.absent(d.messageBars.join(' ') + d.progressText, RE.classification, '912: says nothing about classification');
      }
      await backToOverview(env);
    }
    // the actual draft 087 (M3)
    await env.open('scenario=M3&tone=light&controls=hide', VP.w1440, 'light');
    const d = await env.ev(probeDetails);
    const copy = copyOf(await env.ev(probeTexts));
    c.eq([d.path, d.eyebrow, d.stage, d.words, d.factsLists, d.corrections], ['.dude/ideas/087-dude-canvas-routing-map.md', 'Work item', 'Captured', null, 0, 0], '087: eyebrow, title, stage Captured, no words, no facts list, no correction');
    c.eq(d.unknown, ['No definition, phase, or required gate is recorded yet.'], '087: exactly one summary sentence');
    c.ok(Boolean(d.description) && /routing/i.test(d.description), '087: the captured description is shown');
    c.eq(d.messageBars, [], '087: no notice');
    c.absent(copy, RE.classification, '087: no classification text, placeholder, or instruction');
    c.absent(copy, /\bmock(?:up)?\b|review design|preview request|review capability/i, '087: no mock or Review guidance');
    c.eq(d.guidance, false, '087: no Review entry text in the header');
  });

  /* ---------------------------------------------------------------- L6: an unreadable record must not claim absence (area 3 and 4: genuine unavailable stays honest) */
  await guarded(env, 'L6.unreadable-record-claims-no-absence', 'list', 'The unreadable record (912) keeps every progress-bearing section honest: Tasks and Activity say they are unavailable instead of claiming that no tasks or activity are recorded, and they agree with the notice that task progress and detail are withheld', async c => {
    const e = fx.find(entry => entry.number === '912');
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    await openRecord(env, e.ideaPath);
    const sections = await env.ev(() => {
      const norm = value => (value || '').replace(/\s+/g, ' ').trim();
      const now = document.querySelector('[data-now]');
      const find = title => [...now.querySelectorAll('section')].find(section => norm(section.querySelector('h2')?.textContent) === title);
      return { tasks: norm(find('Tasks')?.innerText), activity: norm(find('Activity')?.innerText), next: norm(now.querySelector('[data-now-next]')?.innerText) };
    });
    const UNAVAILABLE = /unavailable|couldn.t be read|could not be read|withheld|not exposed|exposed by this read/i;
    c.matches(sections.next, /Task progress and detail are withheld/, '912: the notice says task progress and detail are withheld');
    c.absent(sections.tasks, /No (?:canonical )?tasks are recorded/i, `912: the Tasks section claims no tasks are recorded for a record that could not be read (observed "${sections.tasks}")`);
    c.matches(sections.tasks, UNAVAILABLE, '912: the Tasks section says its content is unavailable');
    c.absent(sections.activity, /No dated activity is recorded/i, `912: the Activity section claims no activity is recorded for a record that could not be read (observed "${sections.activity}")`);
    c.matches(sections.activity, UNAVAILABLE, '912: the Activity section says its content is unavailable');
    c.note('comparison: today\'s Canvas shows "Task detail unavailable until the selected sources agree." and "No dated feature activity is exposed by this read." for the same state (src/extensions/dude/frontend/app.jsx, read only); the round 2 mock carried the same two absence claims (variants/round-2-embedded/source/work-type-presentation.jsx lines 871 and 878)');
  });

  /* ---------------------------------------------------------------- L3: search, Enter, Now, Clear (area 4) */
  await guarded(env, 'L3.search-enter-now-clear', 'list', 'Search matches only number, title, slug, and path (classification words are not searchable); a row opens its record in Now by click and by Enter; Working on, Back to Overview, and Clear behave as before', async c => {
    const search = async query => {
      await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
      await clickSelector(page, 'input[type=search]');
      await page.send('Input.insertText', { text: query });
      await sleep(220);
      return (await env.ev(probeRowsLite)).map(row => row.path).sort();
    };
    for (const query of ['upload', '909', 'docs', 'export', 'Fix', 'Writing', 'New', 'Exploration', 'Maintenance', 'zzz-no-match']) {
      c.eq(await search(query), [...O.searchMatches(fx, query)].sort(), `search "${query}" returns exactly the rows whose number, title, slug, or path contain it`);
    }
    c.eq((await env.ev(() => [...document.querySelectorAll('span')].some(span => span.textContent.trim() === 'No matching work'))), true, 'an empty result says "No matching work"');
    // click, Working on, Back, Enter, Clear
    await search('upload');
    await clickSelector(page, '[data-work-path]');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now after click', 5000);
    c.eq((await env.ev(P.probeNow)).path, '.dude/ideas/901-retry-failed-uploads.md', 'clicking the searched row opens 901 in Now');
    const commands = await env.ev(P.probeCommands);
    c.matches(commands.workingOn?.text ?? '', /901.*Retry failed uploads.*Clear/s, 'Working on names the number and title and offers Clear');
    await clickSelector(page, 'button', { text: 'Back to Overview' });
    await env.waitFor(() => document.querySelectorAll('[data-work-path]').length === 1, 'overview with the selection', 5000);
    await sleep(200);
    c.eq((await env.ev(P.activeDescriptor))?.path ?? null, '.dude/ideas/901-retry-failed-uploads.md', 'focus returns to the selected row');
    await pressKey(page, 'Enter');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now after Enter', 5000);
    c.eq((await env.ev(P.probeNow)).path, '.dude/ideas/901-retry-failed-uploads.md', 'Enter on the selected row opens Now');
    await clickSelector(page, 'button', { text: 'Clear work selection' });
    await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 1, 'overview after Clear', 5000);
    await sleep(250);
    const cleared = await env.ev(P.probeCommands);
    c.eq([(await env.ev(probeRowsLite)).length, cleared.searchValue, cleared.scopeText, cleared.searchFocused, cleared.workingOn], [13, '', 'All', true, null], 'Clear: 13 rows, empty search, Show = All, search focused, Working on gone');
    // keyboard Enter on three rows, wide and compact
    for (const [mode, query, vp] of [['grid', 'scenario=M1', VP.w1440], ['compact', 'scenario=M2', VP.w600]]) {
      for (const number of ['901', '909', '912']) {
        await env.open(`${query}&tone=light&controls=hide`, vp, 'light');
        const e = fx.find(entry => entry.number === number);
        await env.ev(path => { const row = document.querySelector(`[data-work-path="${path}"]`); row.scrollIntoView({ block: 'center' }); row.focus(); return true; }, e.ideaPath);
        await sleep(100);
        await pressKey(page, 'Enter');
        const opened = await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now', 4000).then(() => true, () => false);
        c.ok(opened, `${mode} ${number}: Enter opens Now`);
        if (opened) c.eq((await env.ev(P.probeNow)).path, e.ideaPath, `${mode} ${number}: Enter opens the matching record`);
      }
    }
  });

  /* ---------------------------------------------------------------- L4: repository records are not backfilled (area 4) */
  await guarded(env, 'L4.repository-not-backfilled', 'list', 'This repository: 91 rows show no classification words and match the independent stage rule; the snapshot is identical to the preserved round 2 snapshot apart from its purpose text; no ledger carries work_intent or work_domain', async c => {
    await env.open('scenario=S3&tone=light&controls=hide', VP.w1440, 'light');
    const rows = await env.ev(probeRowDetail);
    c.eq(rows.length, snap.length, 'rows equal the snapshot record count');
    c.eq(rows.filter(row => row.words !== null).length, 0, 'rows that show classification words');
    let mismatched = 0;
    for (const e of snap) {
      const row = rows.find(entry => entry.path === e.ideaPath);
      const expectedLabel = `${e.number}. ${e.title}. Stage: ${e.stageText}${e.note ? `, ${e.note}` : ''}. ${e.progress}. ${e.ideaPath}`;
      if (!row || row.aria !== expectedLabel || row.stage !== e.stageText) { mismatched += 1; if (mismatched <= 3) c.fail(`${e.number}: observed ${JSON.stringify(row?.aria)} stage ${row?.stage}; expected ${expectedLabel}`); }
    }
    c.eq(mismatched, 0, 'rows whose accessible name or stage differs from the independent expectation (no word is injected)');
    const load = p => JSON.parse(fs.readFileSync(path.join(env.designDir, p), 'utf8'));
    const before = load('variants/round-2-embedded/source/repository-snapshot.json'), after = load('source/repository-snapshot.json');
    const differing = [];
    const walk = (a, b, at) => {
      if (differing.length > 20) return;
      if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) { if (JSON.stringify(a) !== JSON.stringify(b)) differing.push(at); return; }
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], `${at}/${key}`);
    };
    walk(before, after, '');
    c.eq(differing, ['/purpose'], 'the only difference from the round 2 snapshot is its purpose text (no record, detail, or curated entry changed)');
    c.ok(!/work_intent|work_domain/.test(JSON.stringify(after.records)) && !/workIntent|workDomain/.test(JSON.stringify(after)), 'the snapshot holds no classification key');
    const dir = path.join(env.repo, '.dude', 'ideas');
    let withKeys = 0, scanned = 0;
    for (const name of fs.readdirSync(dir).filter(file => file.endsWith('.md'))) {
      scanned += 1;
      const head = fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/).slice(0, 40);
      const end = head.indexOf('---', 1);
      if (head[0] === '---' && head.slice(1, end < 0 ? 40 : end).some(line => /^\s*work_(intent|domain)\s*:/.test(line))) withKeys += 1;
    }
    c.eq(withKeys, 0, `ledgers (of ${scanned}, read only) whose front matter carries work_intent or work_domain`);
    c.eq(scanned, snap.length, 'ledger count equals the snapshot record count');
  });

  /* ---------------------------------------------------------------- L5: every record's details (US1) */
  await guarded(env, 'L5.every-record-details-neutral-and-consistent', 'list', 'Every fixture and repository record opens: details show the same stage as the list and the independent stage rule, no idea or feature kind wording, no Verified, no classification placeholder, words only for fixtures that have them, and mock or Review guidance only for design or preview-request records', async c => {
    const sweep = async (label, query, expected, expectedWords) => {
      await env.open(`${query}&tone=light&controls=hide`, VP.w1440, 'light');
      const listStages = new Map((await env.ev(probeRowDetail)).map(row => [row.path, row.stage]));
      const problems = [];
      let opened = 0, guidance = 0;
      for (const e of expected) {
        await openRecord(env, e.ideaPath);
        const d = await env.ev(probeDetails);
        // recorded titles and paths are data, not Canvas wording: remove them before judging the copy
        let copy = copyOf(await env.ev(probeTexts));
        for (const recorded of [e.title, e.slug, e.ideaPath, e.specPath, `${e.number} ${e.title}`].filter(Boolean)) copy = copy.split(recorded).join(' ');
        copy = copy.replace(/\.dude\/[^\s|]+/g, ' ');
        guidance += d.guidance ? 1 : 0;
        opened += 1;
        const wantGuidance = Boolean(e.design);
        const issues = [];
        if (d.path !== e.ideaPath) issues.push(`path ${d.path}`);
        if (d.stage !== e.stageText) issues.push(`details stage ${d.stage} != ${e.stageText}`);
        if (listStages.get(e.ideaPath) !== d.stage) issues.push(`list stage ${listStages.get(e.ideaPath)} != details ${d.stage}`);
        if (d.eyebrow !== 'Work item') issues.push(`eyebrow ${d.eyebrow}`);
        if ((d.words ?? null) !== expectedWords(e)) issues.push(`words ${d.words} != ${expectedWords(e)}`);
        if (d.factsLists || d.corrections) issues.push('facts list or correction instruction');
        if (RE.kind.test(copy)) issues.push(`kind wording: ${copy.match(RE.kind)[0]}`);
        if (RE.verified.test(copy)) issues.push('Verified');
        if (RE.classification.test(copy)) issues.push(`classification term: ${copy.match(RE.classification)[0]}`);
        if (d.guidance !== wantGuidance) issues.push(`Review guidance ${d.guidance} but design ${JSON.stringify(e.design)}`);
        if (e.stageText === 'Completed' && !/isn.t a verification, review, or release result/.test(d.progressText)) issues.push('Completed lacks the no-verification sentence');
        if (e.stageText === 'Closed' && !/Closing doesn.t mean the work was implemented/.test(d.progressText)) issues.push('Closed lacks the not-implemented sentence');
        if (RE.deliveredClaim.test(d.progressText)) issues.push(`delivery claim: ${d.progressText.match(RE.deliveredClaim)[0]}`);
        if (issues.length) problems.push(`${e.number} ${issues.join('; ')}`);
        await backToOverview(env);
      }
      c.eq(problems.slice(0, 8), [], `${label}: records whose details disagree with the list, the stage rule, or the wording rules (${problems.length} of ${expected.length})`);
      c.eq(opened, expected.length, `${label}: records opened`);
      c.note(`${label}: ${opened} records opened; ${guidance} show Review guidance (${expected.filter(e => e.design).length} have a design status)`);
    };
    await sweep('fixtures', 'scenario=M1', fx, e => (words[e.number] || null));
    await sweep('repository', 'scenario=S3', snap, () => null);
  });
}

/* ------------------------------------------------------------------ detector controls (string level) */

/** Every "absent" assertion in this run rests on a pattern. This proves each pattern flags known-bad copy and accepts known-good copy. */
export function detectorSelfTest({ registry, handoff }) {
  const c = registry.create('X.detectors-flag-known-bad-copy', 'bind', 'Control for the wording detectors: each pattern flags known-bad copy (round 2 wording, joined agent, idea or feature kind, Verified, None, promises) and accepts the handoff copy and the genuine unavailable wording');
  const flags = (name, pattern, bad, good) => {
    for (const text of bad) c.ok(pattern.test(text), `${name} flags "${text}"`);
    for (const text of good) c.ok(!pattern.test(text), `${name} accepts "${text}"`);
  };
  const blocks = Object.values(handoff.capture.cannotSendNow).filter(Array.isArray).map(([title, body]) => `${title} ${body}`);
  const statuses = Object.values(handoff.capture.statuses).filter(Array.isArray).map(([title, body]) => `${title} ${body}`);
  flags('classification', RE.classification, ['Intent (optional)', 'Domain (optional)', 'Not set', 'Unrecognized intent', 'Classification unavailable', 'Choose a category', 'Optional intent and domain'],
    ['Describe the work', 'Fix \u00b7 Code', 'Stage unavailable', 'Title unavailable', 'Progress not established', 'The record couldn\u2019t be read, so its stage is unknown.', ...blocks, ...statuses]);
  flags('classification confirmation', RE.classificationConfirm, ['Please confirm the classification.', 'Confirm the intent below', 'Is this a fix? Confirm the type'],
    ['Nothing is confirmed yet, and your draft stays here.', 'Canvas couldn\u2019t confirm delivery, so it won\u2019t send this again.', 'Submit and Save turn back on once Dude confirms it.']);
  flags('internal terms', RE.internal, ['Waiting for the joined agent', 'This unfiled draft', 'Reconcile the capture', 'Request scope', 'The owner will save it', 'metadata is kept', 'a receipt'], [...blocks, ...statuses]);
  flags('kind wording', RE.kind, ['This feature is still an idea.', 'This idea has no task definitions.', 'Draft idea', 'Select a feature'],
    ['This work item is captured but not defined yet.', 'No tasks are recorded for this work item.', 'From the idea ledger']);
  flags('Verified', RE.verified, ['Verified', 'This work is verified.'], ['That isn\u2019t a verification, review, or release result.', 'Completed']);
  flags('delivery claim', RE.deliveredClaim, ['Delivered', 'The work was released.', 'Shipped'], ['Closing doesn\u2019t mean the work was implemented.', 'Closed']);
  flags('over-promise', RE.overpromise, ['Dude has your text and will save it.', 'It will be sent automatically.', 'We will retry for you.', 'Your text was saved.'],
    [handoff.capture.statuses.uncertain.join(' '), handoff.capture.statuses.notSent.join(' '), ...blocks]);
  flags('None or nothing waiting', RE.noneClaim, ['Requests: None', 'No request is waiting for you.', 'Nothing is waiting for you.', 'No current owner-qualified preview request is waiting for this record.'],
    ['Status partial', 'Canvas can\u2019t tell whether anything is waiting for you.', 'Waiting for you']);
  flags('Other', /\bOther\b/, ['Other', 'Domain: Other'], ['Another request']);
  c.done();
}

export async function progressChecks(env) {
  const fx = env.oracle.fixtures, snap = env.oracle.snapshot, raw = env.oracle.data.fixtures;
  const byNumber = number => fx.find(entry => entry.number === number) ?? snap.find(entry => entry.number === number);
  const pending = (number, feed) => raw.requests.filter(request => request.phase === 'pending' && request.request.scope.ideaPath?.includes(`/${number}-`)
    && (raw.feeds[feed].fixtureRequests ?? []).includes(request.id));
  const CLASS = { fact: 'Clarification', preview: 'Design review' };

  await guarded(env, 'G1.progress-states-regression', 'progress', 'Progress report, representative M4 to M11 and M14 states: one or several current phases, tracked phase not exposed, partial or unavailable request coverage never reads None or no request waiting, a current request is never a gate, design approval is the only gate, Completed is not Verified, Closed is not delivered', async c => {
    const cases = [
      { id: 'M4', number: '904', feed: 'requests', gate: true, design: 'Proposed', wait: 1, buttons: ['Respond to request', 'Review design'] },
      { id: 'M5', number: '901', feed: 'requests', phases: ['Retry and regression test'], wait: 0, dock: true },
      { id: 'M6', number: '902', feed: 'requests', phases: ['Draft', 'Fact check'], wait: 0 },
      { id: 'M7', number: '903', feed: 'requests', phases: ['Storyboard'], wait: 0, blocker: /Plan gap[\s\S]*the plan does not say who records the voice-over/ },
      { id: 'M8', number: '066', feed: 'idle', wait: 0, completed: true },
      { id: 'M9', number: '078', feed: 'idle', wait: 0, closed: true },
      { id: 'M10', number: '907', feed: 'requests', tracked: true, wait: 0 },
      { id: 'M11a', number: '910', feed: 'partial', phases: ['Answers'], wait: 1, coverage: 'partial', buttons: ['Respond to request'] },
      { id: 'M11b', number: '067', feed: 'unavailable', gate: true, design: 'Exploring', wait: 0, coverage: 'unavailable' },
      { id: 'M14a', number: '910', feed: 'requests', phases: ['Answers'], wait: 1, buttons: ['Respond to request'] },
      { id: 'M14b', number: '911', feed: 'requests', wait: 1, buttons: ['Respond to request'] },
    ];
    for (const spec of cases) {
      await env.open(`scenario=${spec.id}&tone=light&controls=hide`, VP.w1440, 'light');
      const e = byNumber(spec.number);
      const d = await env.ev(probeDetails);
      const label = `${spec.id} (${spec.number})`;
      c.eq(d.path, e.ideaPath, `${label}: record`);
      const row = name => d.rows.filter(entry => entry.label === name);
      c.eq(row('Stage').map(entry => entry.value), [e.stageText], `${label}: Stage row equals the independent stage rule`);
      c.eq(d.stage, e.stageText, `${label}: header stage equals the report stage`);
      const gates = row('Required gate');
      c.eq(gates.map(entry => entry.value), spec.gate ? ['Design approval'] : [], `${label}: required gates (design approval only, and only for a design definition that is not approved)`);
      if (spec.design) c.eq(row('Design status').map(entry => entry.value), [spec.design], `${label}: recorded design status`);
      else c.eq(row('Design status').length, 0, `${label}: no design status row without a design definition`);
      // phases
      const names = spec.phases ?? [];
      if (spec.tracked) {
        c.eq(row('Phase').map(entry => entry.value), ['Not exposed'], `${label}: tracked work shows phase as not exposed`);
        c.eq(row('Current phase').length + row('Current phases').length, 0, `${label}: no phase is filled in for tracked work`);
        c.matches(row('Phase')[0].text, /tracked board/, `${label}: phase row names the tracked board as its source`);
      } else if (names.length > 1) {
        c.eq(row('Current phases')[0]?.items, names, `${label}: every current phase is named`);
        c.eq(O.phaseNames(raw.fixtureWorkspace.records.find(record => record.ideaPath === e.ideaPath).tasks), names, `${label}: oracle agrees on the current phases`);
      } else if (names.length === 1) {
        c.eq(row('Current phase').map(entry => entry.value), names, `${label}: the one current phase`);
      } else c.eq(row('Current phase').length + row('Current phases').length, 0, `${label}: no current phase when none is recorded`);
      // requests
      const waiting = row('Waiting for you');
      const expectedWaiting = spec.feed === 'unavailable' ? [] : pending(spec.number, spec.feed).map(request => `${CLASS[request.request.class] ?? request.request.class} from ${request.request.owner}`);
      c.eq(waiting.map(entry => entry.value), expectedWaiting, `${label}: Waiting for you rows equal the current requests for exactly this item`);
      for (const entry of waiting) c.matches(entry.text, /A current request\. It adds no gate and doesn.t change the stage\./, `${label}: a current request is supporting detail, not a gate or blocker`);
      c.eq(waiting.length, spec.wait, `${label}: ${spec.wait} current request(s)`);
      const requestsRow = row('Requests');
      if (spec.coverage) {
        c.eq(requestsRow.map(entry => entry.value), [spec.coverage === 'partial' ? 'Status partial' : 'Status unavailable'], `${label}: request status says ${spec.coverage}`);
        c.matches(requestsRow[0]?.text ?? '', spec.coverage === 'partial' ? /may be missing/ : /can.t tell whether anything is waiting for you/, `${label}: says what is not known`);
        c.matches(requestsRow[0]?.text ?? '', /From Needs you request coverage/, `${label}: names its source`);
        c.absent(d.progressText, RE.noneClaim, `${label}: never says None or that no request is waiting`);
        c.absent(d.headerText, RE.noneClaim, `${label}: the header never says no preview request is waiting`);
      } else c.eq(requestsRow.length, 0, `${label}: no request-status row while coverage is current`);
      c.eq(d.buttons, spec.buttons ?? [], `${label}: header actions (Respond and Review only where a current request exists)`);
      if (spec.id === 'M14a' || spec.id === 'M14b') {
        c.eq(gates.length, 0, `${label}: a ${spec.id === 'M14a' ? 'blocking' : 'advisory'} request adds no required gate`);
        c.absent(d.progressText + d.blockers.join(' '), /blocker/i, `${label}: a request adds no recorded blocker`);
      }
      // claims
      c.absent(d.progressText, RE.verified, `${label}: nothing says Verified`);
      c.absent(d.progressText, RE.deliveredClaim, `${label}: no delivery, release, or ship claim`);
      c.absent(d.progressText, /\d+\s?%/, `${label}: no percentage`);
      if (spec.completed) {
        c.eq(d.stage, 'Completed', `${label}: Completed`);
        c.matches(d.progressText, /Every recorded task is done\. That isn.t a verification, review, or release result\./, `${label}: says Completed is not a verification, review, or release`);
      }
      if (spec.closed) {
        c.eq(d.stage, 'Closed', `${label}: Closed`);
        c.matches(d.progressText, /Closed without a definition package\. Closing doesn.t mean the work was implemented\./, `${label}: says Closed is not implemented`);
      }
      if (spec.blocker) c.matches(d.blockers.join(' '), spec.blocker, `${label}: the blocker class and reason are shown`);
      if (spec.dock) c.eq(d.docked, true, `${label}: the task detail is docked at 1440`);
      if (spec.id === 'M4') c.matches(row('Design status')[0].text, /Checkpoint reached: design proposed\./, `${label}: checkpoint is the recorded design status, not a task count`);
    }
  });

  /* ---------------------------------------------------------------- N1: copy sweep over every in-scope surface */
  await guarded(env, 'N1.no-internal-terms-anywhere', 'progress', 'Sweep of product copy, attributes, and (for fixtures) the accessibility tree over every in-scope surface: no classification field, placeholder, warning, instruction, or question; no idea or feature kind; no internal capture terms', async c => {
    const GLOBAL_INTERNAL = /joined agent|unfiled|reconcil|metadata|\breceipt\b|scope binding/i;
    const scenarios = [['M1', VP.w1440], ['M2', VP.w600], ['M3', VP.w1440], ['M4', VP.w1440], ['M5', VP.w1440], ['M6', VP.w1440], ['M7', VP.w1440], ['M10', VP.w1440],
      ['M11a', VP.w1440], ['M11b', VP.w1440], ['M14a', VP.w1440], ['M14b', VP.w1440], ['S1', VP.w1440], ['S2', VP.w1440], ['S3', VP.w1440], ['M8', VP.w1440], ['M9', VP.w1440]];
    let surfaces = 0;
    for (const [id, vp] of scenarios) {
      await env.open(`scenario=${id}&tone=light&controls=hide`, vp, 'light');
      const texts = await env.ev(probeTexts);
      const copy = copyOf(texts).replace(OTHER_ALLOWED, '');
      const label = `${id}`;
      surfaces += 1;
      c.absent(copy, RE.classification, `${label}: classification terms in copy or attributes`);
      c.absent(copy, RE.classificationConfirm, `${label}: classification confirmation`);
      c.absent(copy, RE.kind, `${label}: idea or feature as the item's kind`);
      c.absent(copy, GLOBAL_INTERNAL, `${label}: internal capture terms`);
      c.absent(copy, /\bOther\b/, `${label}: "Other"`);
      for (const question of env.handoff.clarificationExample.neverAsk) c.ok(!squash(copy).includes(squash(question)), `${label}: never asks "${question}"`);
      c.eq(await env.ev(() => document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]').length), 0, `${label}: no dialog`);
      if (!['M3', 'S3', 'M8', 'M9', 'M11b'].includes(id)) {
        const ax = axStrings(await axSnapshot(env.page)).join(' | ').replace(OTHER_ALLOWED, '');
        c.absent(ax, RE.classification, `${label}: classification terms in the accessibility tree (fixture surface)`);
        c.absent(ax, RE.kind, `${label}: idea or feature kind in the accessibility tree`);
      }
    }
    // the Needs you list reached through the capture form's Cancel
    await env.open('scenario=M12-pending-question&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(env.page, '[data-capture-form] button', { text: 'Cancel' });
    await env.waitFor(() => !document.querySelector('[data-capture-form]'), 'Needs you', 4000);
    const needs = copyOf(await env.ev(probeTexts)).replace(OTHER_ALLOWED, '');
    c.absent(needs, RE.classification, 'Needs you list: classification terms');
    c.note(`${surfaces + 1} surfaces swept`);
  });
}
