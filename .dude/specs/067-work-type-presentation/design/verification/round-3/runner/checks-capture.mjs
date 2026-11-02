// Round 3 capture checks (areas 1 to 3): text-only form, copy, Submit and Save, Cancel, validation, uncertainty, retry, reasons.
import { C, H, P, RE, VP, apos, axButton, axProp, axSnapshot, axStrings, clickSelector, evalFn, norm, pressKey, probeCaptureDetector, probeDetails, probeForm, probeNoticesIn,
  probeTexts, readTitleLog, setMockSelect, sleep, startTitleLog, titleSequence, typeDraft, typeText, waitTitle } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const squash = value => apos(value).replace(/\s+/g, '').toLowerCase();
// Copy comparison tolerates only whitespace and the apostrophe style (straight or typographic).
const same = (a, b) => norm(apos(a)) === norm(apos(b));
const FORM = '[data-capture-form]';
const clickIn = (page, scope, text) => clickSelector(page, `${scope} button`, { text });
const DRAFT = 'The export button is hidden on small screens.';

export async function guarded(env, id, group, title, body) {
  const c = env.check(id, group, title);
  try { await body(c); } catch (error) {
    c.fail(`the check did not complete (runner error, not a mock result): ${String(error.stack ?? error).slice(0, 500)}`);
  }
  c.done();
}

/** Opens a capture scenario. The strip stays visible (fixture controls are used) unless `hide` is true. */
export const openCapture = (env, query, { hide = false, vp = VP.w1440, scheme = 'light', tone = 'tone=light' } = {}) =>
  env.open(`${query}&${tone}${hide ? '&controls=hide' : ''}`, vp, scheme);

async function productScan(env) {
  const { page } = env;
  const texts = await env.ev(probeTexts);
  const ax = axStrings(await axSnapshot(page));
  return { copy: [...texts.copy, ...texts.labels, ...texts.titles, ...texts.placeholders].join(' | '), ax: ax.join(' | ') };
}

export async function captureChecks(env) {
  const { page } = env;
  const h = env.handoff, st = h.capture.statuses, blocks = h.capture.cannotSendNow;
  const BLOCK_FEEDS = { notConnected: 'unavailable', importInProgress: 'import', pendingQuestion: 'requests', earlierCaptureUnconfirmed: 'unconfirmed', busy: 'busy' };

  /* ---------------------------------------------------------------- C1: text-only form in every state (area 1) */
  await guarded(env, 'C1.text-only-form', 'capture', 'Capture form is text-only in every state: exactly one description textarea, Submit, Save, Cancel; no Intent, Domain, category, Not set, Other, or classification confirmation in visible copy, attributes, or the accessibility tree (mock fixture strip excluded)', async c => {
    const states = [['empty', 'scenario=M12-default'], ['sending', 'scenario=M12-sending'], ['awaiting-save', 'scenario=M12-awaiting'], ['uncertain', 'scenario=M12-uncertain'],
      ['saved-submit', 'scenario=M12-saved-submit'], ['saved-save', 'scenario=M12-saved-save'], ['saved-existing', 'scenario=M12-saved-existing'], ['not-sent', 'scenario=M12-not-sent'],
      ['pending-question', 'scenario=M12-pending-question'], ['busy', 'scenario=M12-busy'], ['not-connected', 'scenario=M12-not-connected'],
      ['import-in-progress', 'scenario=M12-default&feed=import'], ['earlier-capture-unconfirmed', 'scenario=M12-default&feed=unconfirmed']];
    for (const [id, query] of states) {
      await openCapture(env, query, { hide: true });
      const form = await env.ev(probeForm);
      c.ok(Boolean(form), `${id}: the capture form renders`);
      if (!form) continue;
      c.eq(form.textareas, 1, `${id}: description textareas`);
      c.eq(form.controls.filter(control => !['button', 'textarea'].includes(control.tag)).length, 0, `${id}: inputs, selects, comboboxes, radios, checkboxes, or links in the form`);
      c.eq(form.controls.filter(control => control.tag === 'button').map(control => control.name), ['Submit', 'Save', 'Cancel'], `${id}: buttons`);
      c.eq(form.labels, ['Describe the work'], `${id}: field labels`);
      c.eq(form.placeholder, null, `${id}: textarea placeholder`);
      c.eq(form.dialogs, 0, `${id}: dialogs`);
      c.absent(form.text, RE.classification, `${id}: classification words in the form`);
      c.absent(form.text, RE.classificationConfirm, `${id}: classification confirmation in the form`);
      c.absent(form.text, /\bOther\b/, `${id}: "Other" in the form`);
      const scan = await productScan(env);
      c.absent(scan.copy, RE.classification, `${id}: classification words in product copy, labels, titles, placeholders`);
      c.absent(scan.ax, RE.classification, `${id}: classification words in the accessibility tree`);
      c.absent(scan.ax, /\bOther\b/, `${id}: "Other" in the accessibility tree`);
      c.absent(scan.ax, RE.classificationConfirm, `${id}: classification confirmation in the accessibility tree`);
    }
    // filled: real typing into the empty state, then re-read
    await openCapture(env, 'scenario=M12-default', { hide: true });
    await typeDraft(env, DRAFT);
    const filled = await env.ev(probeForm);
    c.eq([filled.textareas, filled.controls.filter(control => !['button', 'textarea'].includes(control.tag)).length, filled.value], [1, 0, DRAFT], 'filled: one textarea, no other controls, typed text kept');
    c.absent((await productScan(env)).ax, RE.classification, 'filled: classification words in the accessibility tree');
    c.note(`${states.length} preset and feed states plus a typed state read; strip excluded by aria-hidden during AX reads and by region in copy scans`);
  });

  /* ---------------------------------------------------------------- C2: exact plain copy for every status and reason (areas 2 and 3) */
  await guarded(env, 'C2.status-and-reason-copy', 'capture', 'Every status and every cannot-send reason shows the coordinator handoff copy exactly: a plain reason plus next step, no internal terms, no promise of what the owner did or will do after uncertain delivery', async c => {
    const read = async query => { await openCapture(env, query, { hide: true }); return { form: await env.ev(probeForm), notices: await env.ev(probeNoticesIn, FORM) }; };
    const pair = async (label, query, expected) => {
      const { notices } = await read(query);
      c.eq(notices.length, 1, `${label}: one status notice`);
      const [notice] = notices;
      c.ok(same(notice?.title, expected[0]), `${label}: title "${notice?.title}" equals handoff "${expected[0]}"`);
      c.ok(same(notice?.text, expected[1]), `${label}: text "${notice?.text}" equals handoff "${expected[1]}"`);
      return notice;
    };
    const heading = await read('scenario=M12-default');
    c.eq(heading.form.h1, h.capture.tabAndHeading, 'form heading');
    c.ok(same(heading.form.paragraphs[0], h.capture.lead) && same(heading.form.paragraphs[1], h.capture.intro) && heading.form.paragraphs.length === 2, `lead and intro paragraphs equal the handoff (observed ${JSON.stringify(heading.form.paragraphs)})`);
    c.eq(heading.form.labels, [h.capture.fieldLabel], 'field label');
    c.ok(same(heading.form.footnote, h.capture.footnote), `footnote under the actions equals the handoff (observed "${heading.form.footnote}")`);
    const sending = await pair('sending', 'scenario=M12-sending', st.sending);
    const awaiting = await pair('awaiting save', 'scenario=M12-awaiting', st.awaitingSave);
    const uncertain = await pair('uncertain', 'scenario=M12-uncertain', st.uncertain);
    const notSent = await pair('not sent', 'scenario=M12-not-sent', st.notSent);
    // Saved: title, body with the file number, any owner note exactly as received, then the path (savedDetail)
    const saved = async (label, query, body, ownerNote, pathPattern) => {
      const { notices } = await read(query);
      const [notice] = notices;
      c.eq(notices.length, 1, `${label}: one status notice`);
      c.eq(notice?.title, 'Saved', `${label}: title`);
      const lines = notice?.lines ?? [];
      c.eq(lines.length, ownerNote ? 3 : 2, `${label}: lines are body${ownerNote ? ', owner note' : ''}, path`);
      c.ok(same(lines[0], body), `${label}: body "${lines[0]}" equals "${body}"`);
      if (ownerNote) c.ok(lines[1] === ownerNote, `${label}: owner note exactly as received: "${lines[1]}"`);
      c.matches(lines.at(-1), pathPattern, `${label}: saved path is the last line`);
      const fileNumber = lines.at(-1)?.match(/\/(\d{3})-/)?.[1];
      c.eq(lines[0]?.match(/work item (\d{3})/)?.[1], fileNumber, `${label}: the number in the message is the number in the saved file name`);
      c.absent(lines.slice(0, ownerNote ? 2 : 1).join(' '), RE.wordsToken, `${label}: no classification word in the saved message or note`);
      c.absent(lines.join(' '), RE.classification, `${label}: no classification term in the saved lines`);
      return notice;
    };
    await saved('saved after Submit', 'scenario=M12-saved-submit', st.savedSubmit[1].replace('{number}', '914'), null, /^\.dude\/ideas\/914-[a-z0-9-]+\.md$/);
    await saved('saved after Save', 'scenario=M12-saved-save', st.savedSave[1].replace('{number}', '914'), null, /^\.dude\/ideas\/914-[a-z0-9-]+\.md$/);
    await saved('saved to existing 901', 'scenario=M12-saved-existing', st.savedSave[1].replace('{number}', '901'), h.fixtures.capture.existing.ownerNote, /^\.dude\/ideas\/901-retry-failed-uploads\.md$/);
    const blockNotices = {};
    for (const [key, feed] of Object.entries(BLOCK_FEEDS)) {
      blockNotices[key] = await pair(`cannot send: ${key}`, `scenario=M12-default&feed=${feed}`, blocks[key]);
    }
    // plain language: no internal terms in any capture copy; reason plus next step; no promises
    const everything = [sending, awaiting, uncertain, notSent, ...Object.values(blockNotices)];
    for (const notice of everything) {
      c.absent(`${notice.title} ${notice.text}`, RE.internal, `"${notice.title}": internal terms (joined agent, owner, receipt, unfiled, reconcile, metadata, scope, binding)`);
      c.absent(`${notice.title} ${notice.text}`, RE.classification, `"${notice.title}": classification terms`);
    }
    for (const [key, notice] of Object.entries(blockNotices)) {
      c.ok(notice.text.split(/(?<=[.!?])\s+/).filter(Boolean).length >= 2, `${key}: reason and next step are separate sentences`);
      c.matches(notice.text, /Your draft is kept\./, `${key}: says the draft is kept`);
      c.matches(notice.text, /turn back on|Finish the pending question|describe the work in chat|check the chat/i, `${key}: names a next step`);
      c.absent(notice.text, RE.overpromise, `${key}: promises no automatic action`);
    }
    c.absent(`${uncertain.title} ${uncertain.text}`, RE.overpromise, 'uncertain: does not claim Dude has, saved, or will act on the text');
    c.matches(uncertain.text, /won't send this again/i, 'uncertain: says it will not send again');
    c.matches(notSent.text, /nothing was sent or saved/i, 'not sent: says nothing was sent or saved');
    c.matches(notSent.text, /Try again when Dude is free/, 'not sent: names the retry step');
    // existing labels
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const labels = await env.ev(() => ({ tab: document.querySelector('#dude-tab-new')?.getAttribute('aria-label'), action: [...document.querySelectorAll('button:not([role=tab])')].map(button => button.textContent.trim()).filter(text => /work item/i.test(text)) }));
    c.eq(labels.tab, 'New work item', 'rail destination label');
    c.eq(labels.action, ['New work item'], 'Overview action label');
    await env.open('scenario=S1&tone=light&controls=hide', VP.w1440, 'light');
    const blank = await env.ev(() => document.querySelector('[data-blank-workspace]')?.innerText ?? '');
    c.matches(blank, /Describe the work you want done\./, 'blank-workspace prompt asks only to describe the work');
    c.absent(blank, RE.classification, 'blank-workspace prompt carries no classification term');
  });

  /* ---------------------------------------------------------------- C3: disabled-action description, announcement, and reason order (area 3) */
  await guarded(env, 'C3.disabled-reasons-accessible-and-ordered', 'capture', 'While Submit and Save are disabled, both name the reason through aria-describedby and the accessibility tree, the reason is announced when it appears, and the first applicable condition wins in the planned order', async c => {
    const channels = {};
    for (const [key, feed] of Object.entries(BLOCK_FEEDS)) {
      const [title, body] = blocks[key];
      await openCapture(env, 'scenario=M12-default');
      await typeDraft(env, DRAFT);
      const before = await env.ev(() => window.__announce.events.length);
      c.eq(await env.ev(probeForm).then(form => form.described.length), 0, `${key}: enabled actions carry no reason before the condition applies`);
      await setMockSelect(page, 'feed', feed);
      await waitTitle(env, title);
      await sleep(200);
      const form = await env.ev(probeForm);
      c.eq(form.controls.filter(control => control.tag === 'button').map(control => [control.name, control.disabled]), [['Submit', true], ['Save', true], ['Cancel', false]], `${key}: Submit and Save disabled, Cancel enabled`);
      c.eq(form.described.map(entry => entry.name), ['Submit', 'Save'], `${key}: both disabled actions carry aria-describedby`);
      for (const entry of form.described) c.eq(squash(entry.text), squash(`${title}${body}`), `${key}: ${entry.name} describedby text is the reason title and body`);
      c.eq(form.value, DRAFT, `${key}: the draft is kept`);
      const nodes = await axSnapshot(page);
      for (const name of ['Submit', 'Save']) {
        const node = axButton(nodes, name);
        c.ok(Boolean(node), `${key}: ${name} is in the accessibility tree`);
        if (!node) continue;
        c.eq(axProp(node, 'disabled'), true, `${key}: ${name} is exposed as disabled`);
        c.ok(squash(node.description?.value).includes(squash(title)) && squash(node.description?.value).includes(squash(body)),
          `${key}: ${name} accessible description carries the reason (observed "${norm(node.description?.value).slice(0, 90)}")`);
      }
      const events = (await env.ev(() => window.__announce.events)).slice(before).filter(event => !event.mockChrome);
      const hits = events.filter(event => squash(event.channel === 'ariaNotify' ? event.message : event.text).includes(squash(title)));
      channels[key] = [...new Set(hits.map(event => event.channel))];
      c.ok(hits.length > 0, `${key}: the reason is announced when it appears (ariaNotify or a live region); observed ${JSON.stringify(events.map(event => [event.channel, (event.message ?? event.text).slice(0, 50)]))}`);
    }
    c.note(`announcement channels per reason: ${JSON.stringify(channels)} (headless Edge ${env.browser}; no screen reader run)`);
    // observed order for combined conditions: the busy flag is also true in these feeds, and the earlier condition still wins
    const combined = [['requests', 'pendingQuestion', 'pending question and busy'], ['unavailable', 'notConnected', 'not connected and busy'], ['partial', 'pendingQuestion', 'pending question and partial coverage']];
    for (const [feed, expected, label] of combined) {
      await openCapture(env, `scenario=M12-default&feed=${feed}`, { hide: true });
      const notices = await env.ev(probeNoticesIn, FORM);
      c.eq(notices.map(notice => notice.title), [blocks[expected][0]], `${label}: shows ${expected}, not busy`);
    }
    // genuine unavailability stays honest: the reason, the footer, and the coverage line agree
    await openCapture(env, 'scenario=M12-not-connected', { hide: true });
    const footer = await env.ev(() => document.querySelector('footer')?.innerText ?? '');
    c.matches(footer, /Current request coverage unavailable/, 'not connected: the footer says request coverage is unavailable');
    c.matches(footer, /Not connected/, 'not connected: the footer says Not connected');
    // the full planned order, read from the bytes that ran (the executed runtime), because presets cannot combine every pair
    const runtime = fs.readFileSync(env.runtimeFile, 'latin1');
    const order = runtime.match(/"notConnected"[\s\S]{0,260}"importInProgress"[\s\S]{0,260}"pendingQuestion"[\s\S]{0,260}"earlierCaptureUnconfirmed"[\s\S]{0,260}"busy"/);
    c.ok(Boolean(order), 'the runtime decides the reason in the order notConnected, importInProgress, pendingQuestion, earlierCaptureUnconfirmed, busy');
    c.eq(h.capture.cannotSendNow.order, ['notConnected', 'importInProgress', 'pendingQuestion', 'earlierCaptureUnconfirmed', 'busy'], 'handoff order is the one this check expects');
    c.note('static order evidence is the executed runtime text; only two pairwise orders (pending over busy, not connected over busy) are reachable with the fixture feeds');
  });

  /* ---------------------------------------------------------------- C4: real Submit and Save (area 2) */
  await guarded(env, 'C4.submit-and-save-keep-literal-text', 'capture', 'Real Submit and Save: statuses run Sending, Waiting for Dude to save it, Saved; Submit continues in chat and Save starts nothing else; the typed text is kept byte for byte and shown as the saved description; no classification in the saved message; nothing leaves the page', async c => {
    const LITERAL = '  The export button is hidden on small screens.\n\nSteps: open the table & click "Export" <b>twice</b> \u2014 it doesn\u2019t respond (\u00e9 \ud83d\ude00). Fix the code? domain: design  ';
    const results = {};
    for (const [label, button, copy, logVerb] of [['Submit', 'Submit', st.savedSubmit[1], 'Submit'], ['Save', 'Save', st.savedSave[1], 'Save']]) {
      await openCapture(env, 'scenario=M12-default');
      await env.ev(startTitleLog, FORM);
      await typeDraft(env, LITERAL);
      const net0 = await env.ev(P.netCounters);
      await clickIn(page, FORM, button);
      await sleep(80);
      const during = await env.ev(probeForm);
      c.eq(during.controls.filter(control => control.tag === 'button').map(control => [control.name, control.disabled]), [['Submit', true], ['Save', true], ['Cancel', false]], `${label}: Submit and Save lock while sending`);
      await waitTitle(env, 'Saved', { timeout: 6000 });
      c.eq(await titleSequence(env), [st.sending[0], st.awaitingSave[0], 'Saved'], `${label}: status sequence`);
      const form = await env.ev(probeForm);
      const notice = (await env.ev(probeNoticesIn, FORM))[0];
      c.eq(form.value, LITERAL, `${label}: the textarea still holds the typed text exactly`);
      c.ok(same(notice.lines[0], copy.replace('{number}', '914')), `${label}: saved message "${notice.lines[0]}"`);
      c.eq(notice.live, 'polite', `${label}: saved status sits in one polite live region`);
      c.absent(notice.lines.slice(0, 1).join(' '), RE.wordsToken, `${label}: saved message names no classification`);
      const log = await env.ev(P.probeStrip);
      c.matches(log.log, new RegExp(`Fixture transition: ${logVerb} handed this draft to a simulated owner\\. Next result: Saved: clear description \\(fixture\\)\\. Nothing left this page\\.`), `${label}: the strip labels the transition as a fixture and says nothing left the page`);
      c.eq(form.controls.filter(control => control.tag === 'button').map(control => [control.name, control.disabled]), [['Submit', true], ['Save', true], ['Cancel', false]], `${label}: unchanged text stays locked after Saved (no second send of the same text)`);
      const net1 = await env.ev(P.netCounters);
      results[label] = { message: notice.lines[0], fetchDelta: net1.fetch - net0.fetch, xhr: net1.xhr, beacon: net1.beacon, ws: net1.websocket };
      c.eq([net1.xhr, net1.beacon, net1.websocket, net1.eventsource], [0, 0, 0, 0], `${label}: no XHR, beacon, WebSocket, or EventSource`);
      c.ok(net1.urls.every(url => url === '/api/canvas-preferences'), `${label}: any fetch attempt was the unchanged theme preference route (${JSON.stringify([...new Set(net1.urls)])}), none carried the capture`);
      c.eq(page.state.requests.filter(request => request.type !== 'Document').length, 0, `${label}: the browser made no request besides the document`);
      if (label === 'Submit') {
        // the new work item: row 914 and its details show the literal description unchanged
        await clickSelector(page, '#dude-tab-overview');
        await env.waitFor(() => Boolean(document.querySelector('[data-work-path*="/914-"]')), 'row 914', 4000);
        const row = (await env.ev(probeRowsLite)).find(entry => entry.path.includes('/914-'));
        c.eq([row?.words, row?.stage], ['Fix \u00b7 Code', 'Captured'], 'Submit (clear fixture): row 914 shows the words Dude recorded in the fixture and the stage Captured');
        await clickSelector(page, '[data-work-path*="/914-"]');
        await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now 914', 4000);
        const description = await env.ev(() => [...document.querySelectorAll('[data-now] aside details')].find(node => node.querySelector('summary')?.textContent.trim() === 'Captured description')?.querySelector('p')?.textContent ?? null);
        c.eq(description, LITERAL, 'details "Captured description" is the typed text, byte for byte (spacing, markup characters, emoji, trailing space)');
        const d914 = await env.ev(probeDetails);
        c.eq([d914.eyebrow, d914.stage, d914.words, d914.speech, d914.factsLists, d914.corrections], ['Work item', 'Captured', 'Fix \u00b7 Code', 'Fix, Code', 0, 0], 'new work item 914 details: neutral eyebrow, stage Captured, the words the fixture recorded, no labeled facts list or correction instruction');
        c.eq(d914.unknown, ['No definition, phase, or required gate is recorded yet.'], 'new work item 914 details: one summary sentence for the new draft');
      }
    }
    c.ok(results.Submit.message !== results.Save.message && /brainstorming/.test(results.Submit.message) && /Nothing else was started/.test(results.Save.message), 'Submit and Save report different continuations (brainstorm in chat versus saved for later with nothing else started)');
    // what is saved is the text as sent: an edit made while the save is in flight is not written into the saved item
    await openCapture(env, 'scenario=M12-default');
    await typeDraft(env, DRAFT);
    await clickIn(page, FORM, 'Submit');
    await waitTitle(env, st.sending[0], { timeout: 3000 });
    await clickSelector(page, `${FORM} textarea`);
    await typeText(page, ' EDITED AFTER SENDING');
    await waitTitle(env, 'Saved', { timeout: 6000 });
    await clickSelector(page, '#dude-tab-overview');
    await env.waitFor(() => Boolean(document.querySelector('[data-work-path*="/914-"]')), 'row 914', 4000);
    await clickSelector(page, '[data-work-path*="/914-"]');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now 914', 4000);
    c.eq(await env.ev(() => [...document.querySelectorAll('[data-now] aside details')].find(node => node.querySelector('summary')?.textContent.trim() === 'Captured description')?.querySelector('p')?.textContent ?? null),
      DRAFT, 'text edited while the save was in flight is not saved: the saved description is the text as sent');
    // a second capture in the same tab: the mock allocates the same fixture number 914 again (reported as a mock limitation, not judged)
    await clickSelector(page, '#dude-tab-new');
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form', 4000);
    await typeDraft(env, 'A second description in the same tab.');
    await clickIn(page, FORM, 'Save');
    await waitTitle(env, 'Saved', { timeout: 6000 });
    const second = (await env.ev(probeNoticesIn, FORM))[0].lines[0];
    await clickSelector(page, 'button', { text: 'Clear work selection' });
    await clickSelector(page, '#dude-tab-overview');
    await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 1, 'overview', 4000);
    const rows914 = (await env.ev(probeRowsLite)).filter(entry => entry.path.includes('/914-')).length;
    c.note(`second capture in one tab: "${second}"; Overview then holds ${rows914} row numbered 914 (the mock has one fixture number for new captures, so the first saved item is replaced in the list; not a Canvas behavior claim)`);
  });

  /* ---------------------------------------------------------------- C5: owner outcomes are fixtures, and unknown metadata needs no question */
  await guarded(env, 'C5.outcomes-are-fixtures-no-question', 'capture', 'Classified, unclassified, and matched-existing outcomes follow the selected owner fixture, not the typed words; an item with no recorded classification is captured with no question; a match leaves work item 901 unchanged', async c => {
    const run = async ({ next, button, text }) => {
      await openCapture(env, `scenario=M12-default&next=${next}`);
      await env.ev(startTitleLog, FORM);
      await typeDraft(env, text);
      await clickIn(page, FORM, button);
      await waitTitle(env, 'Saved', { timeout: 6000 });
      const form = await env.ev(probeForm);
      const notice = (await env.ev(probeNoticesIn, FORM))[0];
      c.eq(await titleSequence(env), ['Sending', 'Waiting for Dude to save it', 'Saved'], `${next}/${button}: statuses`);
      c.absent(notice.lines.join(' ') + ' ' + notice.text, /\?/, `${next}/${button}: no question in the saved status`);
      c.eq([form.dialogs, form.controls.filter(control => !['button', 'textarea'].includes(control.tag)).length], [0, 0], `${next}/${button}: no dialog, prompt, or extra field appeared`);
      return notice;
    };
    const listRow = async number => {
      await clickSelector(page, '#dude-tab-overview');
      await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 0, 'overview rows', 4000);
      return (await env.ev(probeRowsLite)).find(entry => entry.path.includes(`/${number}-`)) ?? null;
    };
    // vague fixture, words that look like Fix, Code, and Design: nothing is recorded
    const T1 = 'Fix the broken export code and redesign the design tokens.';
    await run({ next: 'vague', button: 'Save', text: T1 });
    let row = await listRow('914');
    c.eq([row?.words, row?.stage], [null, 'Captured'], 'vague fixture + Save: row 914 shows no classification line even though the typed words name a fix, code, and design; stage Captured');
    // clear fixture, text with no such words: the fixture still supplies the words, so they are not derived from the text
    const T2 = 'Make onboarding feel less overwhelming.';
    await run({ next: 'clear', button: 'Submit', text: T2 });
    row = await listRow('914');
    c.eq([row?.words, row?.stage], ['Fix \u00b7 Code', 'Captured'], 'clear fixture + Submit: row 914 shows Fix \u00b7 Code for unrelated text, so the words come from the fixture, not from a classifier reading the text');
    // matched existing item
    const T3 = h.fixtures.capture.existing.text;
    const notice = await run({ next: 'existing', button: 'Save', text: T3 });
    c.eq(notice.lines, [st.savedSave[1].replace('{number}', '901'), h.fixtures.capture.existing.ownerNote, '.dude/ideas/901-retry-failed-uploads.md'], 'existing fixture: Saved names work item 901, shows the owner note exactly, then its path');
    await clickSelector(page, '#dude-tab-overview');
    await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 0, 'overview rows', 4000);
    const rows = await env.ev(probeRowsLite);
    c.eq(rows.some(entry => entry.path.includes('/914-')), false, 'existing fixture: no new row 914 was created');
    const r901 = rows.find(entry => entry.path.includes('/901-'));
    c.eq([r901?.words, r901?.stage], ['Fix \u00b7 Code', 'In progress'], 'existing fixture: work item 901 keeps its recorded words and stage');
    await clickSelector(page, '[data-work-path*="/901-"]');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now 901', 4000);
    const description = await env.ev(() => [...document.querySelectorAll('[data-now] aside details')].find(node => node.querySelector('summary')?.textContent.trim() === 'Captured description')?.querySelector('p')?.textContent ?? null);
    const expected901 = env.oracle.data.fixtures.fixtureWorkspace.records.find(record => record.id === 'F01').intentText;
    c.eq(description, expected901, 'existing fixture: the captured description of 901 is unchanged (the new text was not written into it)');
    // Save as well as Submit with the vague fixture: captured without a question
    await run({ next: 'vague', button: 'Submit', text: T1 });
    row = await listRow('914');
    c.eq([row?.words, row?.stage], [null, 'Captured'], 'vague fixture + Submit: row 914 shows no classification line; stage Captured');
    c.note('Submit versus Save changes only the saved message; no extra step or question appears for an item with no recorded classification');
  });

  /* ---------------------------------------------------------------- C6: Cancel, reload, validation, length (area 2) */
  await guarded(env, 'C6.cancel-reload-validation', 'capture', 'Cancel keeps the draft and sends nothing; reload clears it as the footnote says; empty and too-long input is refused with the exact message, the draft kept untruncated, no status started; Save as work item refuses the same input', async c => {
    // Cancel
    await openCapture(env, 'scenario=M12-default');
    await typeDraft(env, 'Keep this draft when I cancel.');
    const requests0 = page.state.requests.length;
    await clickIn(page, FORM, 'Cancel');
    await env.waitFor(() => !document.querySelector('[data-capture-form]'), 'form hidden after Cancel', 4000);
    c.eq(await env.ev(() => document.querySelector('[role=tabpanel]:not([hidden]) h1')?.textContent), 'Needs you', 'Cancel returns to Needs you');
    c.eq((await env.ev(P.probeStrip)).log, '', 'Cancel makes no fixture transition and no call');
    await clickSelector(page, '#dude-tab-new');
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form reopened', 4000);
    c.eq((await env.ev(probeForm)).value, 'Keep this draft when I cancel.', 'the draft survives Cancel and return');
    c.eq(page.state.requests.length, requests0, 'Cancel made no network request');
    // reload clears (footnote claim)
    await env.ev(P.mark);
    await page.send('Page.reload');
    await C.until(() => evalFn(page, P.probeReady), 'reload', 15000);
    c.eq((await env.ev(probeForm))?.value ?? 'form missing', '', 'reloading clears the draft, as the footnote says');
    // validation: empty and whitespace-only
    await openCapture(env, 'scenario=M12-default');
    for (const [label, text] of [['empty', ''], ['whitespace only', '  \n  ']]) {
      for (const button of ['Submit', 'Save']) {
        await typeDraft(env, 'x'); // a change clears any earlier validation message, so each click is judged alone
        await typeDraft(env, text);
        await clickIn(page, FORM, button);
        await sleep(150);
        const form = await env.ev(probeForm);
        c.eq(form.validation, h.capture.validation.empty, `${label}/${button}: validation message`);
        c.eq((await env.ev(probeNoticesIn, FORM)).length, 0, `${label}/${button}: no status started`);
        c.eq(form.value, text, `${label}/${button}: the draft is kept as typed`);
        c.eq(form.controls.filter(control => control.tag === 'button').map(control => control.disabled), [false, false, false], `${label}/${button}: actions stay enabled`);
      }
    }
    const a11y = await env.ev(() => { const area = document.querySelector('[data-capture-form] textarea'); const ids = (area.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      return { invalid: area.getAttribute('aria-invalid'), described: ids.map(id => document.getElementById(id)?.textContent.trim()).filter(Boolean) }; });
    c.ok(a11y.described.some(text => same(text, h.capture.validation.empty)), `the validation message is attached to the textarea by aria-describedby (observed ${JSON.stringify(a11y.described)})`);
    c.note(`textarea aria-invalid while the message shows: ${a11y.invalid}`);
    // length: the product limit is in bytes; refusal must not truncate or start a status
    const limit = env.oracle.data.fixtures.capture.textByteLimit;
    c.eq(limit, 32768, 'fixture byte limit equals the product limit (32 KiB)');
    const attempt = async (label, text, button) => {
      await typeDraft(env, text);
      await clickIn(page, FORM, button);
      await sleep(250);
      return { label, form: await env.ev(probeForm), notices: await env.ev(probeNoticesIn, FORM), length: text.length };
    };
    for (const [label, text] of [['32,769 ASCII bytes', 'a'.repeat(limit + 1)], ['10,923 euro signs (32,769 bytes, 10,923 characters)', '\u20ac'.repeat(10923)]]) {
      for (const button of ['Submit', 'Save']) {
        await typeDraft(env, 'x');
        const result = await attempt(label, text, button);
        c.ok(same(result.form.validation, h.capture.validation.tooLong), `${label}/${button}: too-long message (observed "${result.form.validation}")`);
        c.eq(result.form.value.length, result.length, `${label}/${button}: nothing was cut (textarea holds all ${result.length} characters)`);
        c.eq(result.notices.length, 0, `${label}/${button}: nothing was sent (no status started)`);
      }
    }
    await typeDraft(env, 'x');
    const ok = await attempt('32,768 ASCII bytes', 'a'.repeat(limit), 'Save');
    c.eq(ok.form.validation, '', 'exactly 32,768 bytes is accepted (no validation message)');
    await waitTitle(env, 'Saved', { timeout: 6000 }).catch(() => {});
    c.eq((await env.ev(probeNoticesIn, FORM)).map(notice => notice.title), ['Saved'], 'the 32,768-byte text is saved');
    // Save as work item (Needs you) refuses the same input
    await env.open('scenario=S2&tone=light', VP.w1440, 'light');
    for (const [label, text, message] of [['empty', '', h.capture.saveAsWorkItem.empty], ['whitespace only', '   ', h.capture.saveAsWorkItem.empty], ['too long', 'b'.repeat(limit + 1), h.capture.validation.tooLong]]) {
      await H.typeInto(env, '[data-request] textarea', 'x', { clear: true });
      await H.typeInto(env, '[data-request] textarea', text, { clear: true });
      await clickIn(page, '[data-request]', h.capture.saveAsWorkItem.button);
      await sleep(200);
      const out = await env.ev(() => ({ message: document.querySelector('[data-request] .fui-Field__validationMessage, [data-request] [role=alert]')?.textContent.trim() ?? '', value: document.querySelector('[data-request] textarea').value.length, notices: document.querySelectorAll('[data-request] [role=status]').length }));
      c.ok(same(out.message, message), `Save as work item ${label}: message "${out.message}" equals "${message}"`);
      c.eq([out.value, out.notices], [text.length, 0], `Save as work item ${label}: draft kept in full, nothing started`);
    }
  });

  /* ---------------------------------------------------------------- C7: uncertain delivery is never resent (area 2) */
  await guarded(env, 'C7.uncertain-delivery-never-resent', 'capture', 'After a real Submit ends uncertain, Submit and Save stay disabled even after editing and after leaving and returning; nothing is sent again, no status restarts, the draft stays', async c => {
    await openCapture(env, 'scenario=M12-default&next=uncertain');
    await env.ev(startTitleLog, FORM);
    await typeDraft(env, DRAFT);
    await clickIn(page, FORM, 'Submit');
    await waitTitle(env, st.uncertain[0], { timeout: 6000 });
    c.eq(await titleSequence(env), [st.sending[0], st.awaitingSave[0], st.uncertain[0]], 'statuses: Sending, Waiting for Dude to save it, then Not sure it reached Dude');
    const locked = async label => {
      const form = await env.ev(probeForm);
      c.eq(form.controls.filter(control => control.tag === 'button').map(control => [control.name, control.disabled]), [['Submit', true], ['Save', true], ['Cancel', false]], `${label}: Submit and Save disabled`);
      return form;
    };
    await locked('right after uncertain');
    await typeDraft(env, `${DRAFT} More detail.`);
    await locked('after editing the text');
    await clickIn(page, FORM, 'Submit').catch(() => {});
    await clickIn(page, FORM, 'Save').catch(() => {});
    await sleep(2600);
    const seq = await titleSequence(env);
    c.eq(seq.at(-1), st.uncertain[0], 'still uncertain 2.6 s after clicking the disabled actions');
    c.eq(seq.filter(entry => entry === st.sending[0]).length, 1, 'the Sending status appeared exactly once (no resend)');
    c.eq((await env.ev(probeForm)).value, `${DRAFT} More detail.`, 'the draft is kept');
    await clickIn(page, FORM, 'Cancel');
    await clickSelector(page, '#dude-tab-new');
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form reopened', 4000);
    await locked('after Cancel and return');
    c.eq((await env.ev(probeNoticesIn, FORM)).map(notice => notice.title), [st.uncertain[0]], 'the uncertain status is still shown, not reset or resent');
    c.eq((await env.ev(() => window.__announce.events)).filter(event => event.channel === 'ariaNotify' && /Saved/.test(event.message) && !/Not sure/.test(event.message)).length, 0, 'nothing announced Saved');
  });

  /* ---------------------------------------------------------------- C8: known-unsent retry only on the user's action; no automatic send when a block clears (area 2 and 3) */
  await guarded(env, 'C8.retry-and-no-autosend', 'capture', 'A known-unsent refusal stays retryable (edit allowed) only on the user\'s click and is never retried alone; when each blocking reason clears, nothing is sent until the user acts', async c => {
    await openCapture(env, 'scenario=M12-default&next=not-sent');
    await env.ev(startTitleLog, FORM);
    await typeDraft(env, DRAFT);
    await clickIn(page, FORM, 'Submit');
    await waitTitle(env, st.notSent[0], { timeout: 6000 });
    const form = await env.ev(probeForm);
    c.eq(form.controls.filter(control => control.tag === 'button').map(control => control.disabled), [false, false, false], 'Not sent: Submit and Save are enabled again (retryable)');
    await sleep(2600);
    c.eq(await titleSequence(env), [st.sending[0], st.notSent[0]], 'two seconds later nothing retried on its own');
    await typeDraft(env, `${DRAFT} Please include the date.`);
    await setMockSelect(page, 'next', 'clear');
    await clickIn(page, FORM, 'Submit');
    await waitTitle(env, 'Saved', { timeout: 6000 });
    c.eq(await titleSequence(env), [st.sending[0], st.notSent[0], st.sending[0], st.awaitingSave[0], 'Saved'], 'the retry ran only after the click and the edit, then saved');
    await clickSelector(page, '#dude-tab-overview');
    await env.waitFor(() => Boolean(document.querySelector('[data-work-path*="/914-"]')), 'row 914', 4000);
    await clickSelector(page, '[data-work-path*="/914-"]');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now 914', 4000);
    c.eq(await env.ev(() => [...document.querySelectorAll('[data-now] aside details')].find(node => node.querySelector('summary')?.textContent.trim() === 'Captured description')?.querySelector('p')?.textContent ?? null),
      `${DRAFT} Please include the date.`, 'the saved description is the edited text that the user retried with');
    // preset, both actions
    await openCapture(env, 'scenario=M12-not-sent', { hide: true });
    c.eq((await env.ev(probeForm)).controls.filter(control => control.tag === 'button').map(control => control.disabled), [false, false, false], 'preset Not sent: all three actions enabled');
    // no automatic send when a condition clears
    for (const [key, feed] of Object.entries(BLOCK_FEEDS)) {
      await openCapture(env, `scenario=M12-default&feed=${feed}`);
      await env.ev(startTitleLog, FORM);
      await typeDraft(env, DRAFT);
      c.eq((await env.ev(probeForm)).controls.filter(control => control.tag === 'button').map(control => control.disabled), [true, true, false], `${key}: blocked before`);
      await setMockSelect(page, 'feed', 'idle');
      await sleep(2300);
      const after = await env.ev(probeForm);
      c.eq(after.controls.filter(control => control.tag === 'button').map(control => control.disabled), [false, false, false], `${key}: Submit and Save turn back on when the condition clears`);
      const statusTitles = new Set([st.sending[0], st.awaitingSave[0], 'Saved', st.uncertain[0], st.notSent[0]]);
      const shown = (await titleSequence(env)).flatMap(entry => entry.split(' | ')).filter(title => statusTitles.has(title));
      c.eq(shown, [], `${key}: no capture status (Sending, Waiting, Saved, Not sure, Not sent) appeared, so nothing was sent or saved on its own`);
      c.eq([after.value, (await env.ev(P.probeStrip)).log], [DRAFT, ''], `${key}: draft kept and no fixture transition ran`);
    }
  });

  /* ---------------------------------------------------------------- C9: Save as work item (Needs you) */
  await guarded(env, 'C9.save-as-work-item', 'capture', 'Needs you "Save as work item": plain notice that it saves only the text, labels Text to save and Save this text, no unfiled or classification wording, statuses reuse the capture statuses and end Saved for later', async c => {
    const sw = h.capture.saveAsWorkItem;
    await env.open('scenario=S2&tone=light', VP.w1440, 'light');
    const section = await env.ev(() => {
      const norm = value => (value || '').replace(/\s+/g, ' ').trim();
      const button = [...document.querySelectorAll('[data-request] button')].find(node => node.textContent.trim() === 'Save as work item');
      const box = button?.closest('section');
      return { action: button?.textContent.trim() ?? null, text: norm(box?.innerText), labels: [...(box?.querySelectorAll('label') ?? [])].map(node => norm(node.textContent)),
        buttons: [...(box?.querySelectorAll('button') ?? [])].map(node => norm(node.textContent)), notice: norm(box?.querySelector('.fui-MessageBar')?.textContent),
        controls: box ? box.querySelectorAll('input, select, [role=combobox], [role=checkbox], [role=radio]').length : null };
    });
    c.eq(section.action, sw.action, 'action label');
    c.eq(section.labels, [sw.fieldLabel], 'field label');
    c.eq(section.buttons, [sw.action, sw.button], 'buttons');
    c.ok(squash(section.notice) === squash(`${sw.notice[0]}${sw.notice[1]}`), `notice equals the handoff copy (observed "${section.notice}")`);
    c.eq(section.controls, 0, 'no select, combobox, checkbox, radio, or input beside the one text field');
    c.absent(section.text, RE.classification, 'no classification term in the section');
    c.absent(section.text, /unfiled|through this|no intent|set them later|Intent to retain|Capture this intent|Save as idea/i, 'no round 2 wording (unfiled request, intent or domain sentence, old labels)');
    c.absent(`${sw.notice[0]} ${sw.notice[1]}`, RE.internal, 'notice avoids internal terms');
    // real save
    await env.ev(startTitleLog, '[data-request]');
    await H.typeInto(env, '[data-request] textarea', 'Remember to check the retired Basic plan page.', { clear: true });
    await clickIn(page, '[data-request]', sw.button);
    await waitTitle(env, 'Saved', { selector: '[data-request]', timeout: 6000 });
    const sequence = (await titleSequence(env)).map(entry => entry.replace(/^Saves only this text(?: \| )?/, '')).filter(Boolean);
    c.eq(sequence, [st.sending[0], st.awaitingSave[0], 'Saved'], 'statuses reuse the capture statuses');
    const notice = (await env.ev(probeNoticesIn, '[data-request]')).find(entry => entry.title === 'Saved');
    c.eq(notice.lines[0], st.savedSave[1].replace('{number}', '914'), 'ends "Saved as work item 914 for later. Nothing else was started."');
    c.eq(await env.ev(() => document.querySelector('[data-request] textarea').value), 'Remember to check the retired Basic plan page.', 'the text stays as typed');
    await clickSelector(page, '#dude-tab-overview');
    await env.waitFor(() => Boolean(document.querySelector('[data-work-path*="/914-"]')), 'row 914', 4000);
    const row = (await env.ev(probeRowsLite)).find(entry => entry.path.includes('/914-'));
    c.eq([row?.words, row?.stage], [null, 'Captured'], 'the saved item appears as 914 with no classification line and the stage Captured');
    await clickSelector(page, '[data-work-path*="/914-"]');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now 914', 4000);
    c.eq((await env.ev(probeDetails)).description, 'Remember to check the retired Basic plan page.', 'its captured description is the text as typed in Needs you');
  });
}

/** Row facts that do not depend on the layout: path, words line, stage. */
export const probeRowsLite = () => [...document.querySelectorAll('[data-work-path]')].map(row => ({
  path: row.getAttribute('data-work-path'), words: row.querySelector('[data-work-classification]')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  stage: row.querySelector('[data-work-stage]')?.getAttribute('data-work-stage') ?? null }));
