// M12 capture states, real local submit transitions, uncertainty without replay, Cancel, Save as work item, blank workspace.
import { P, VP, chooseOption, clickSelector, evalFn, pressKey, sleep, until } from './harness.mjs';
import * as O from './oracle.mjs';

const apos = text => (text ?? '').replace(/[’‘]/g, "'");
const KIND = [/\bNew idea\b/i, /\bSave as idea\b/i, /Intent to retain/i, /Capture this intent/i, /\bidea\b/i, /\bfeature\b/i];
const label = (word, map) => (word === 'not-set' ? 'Not set' : map[word]);

const COPY = {
  meaning: 'Submit captures it and continues brainstorming. Save captures it for later, without further discussion, definition, or execution.',
  cancel: 'Cancel returns to Needs you and keeps your text and choices in this tab. It does not undo a submission. Reloading clears the local draft.',
  optional: 'Leave either one Not set if you’re unsure. Dude saves only what you choose here. To set or change it later, ask Dude in chat.',
};

async function sampleStates(env, stopWhen, limit = 3600) {
  const started = Date.now();
  const sequence = [];
  while (Date.now() - started < limit) {
    const state = await env.ev(P.probeCapture);
    const titles = state.notices.map(notice => notice.title).join(' | ');
    const buttons = state.actions.map(action => `${action.text}:${action.disabled ? 'off' : 'on'}`).join(',');
    const key = `${titles}#${buttons}#${state.text}#${state.intent.text}#${state.domain.text}`;
    if (!sequence.length || sequence.at(-1).key !== key) sequence.push({ key, t: Date.now() - started, titles, buttons, state });
    if (stopWhen(state)) { await sleep(450); sequence.push({ key: 'final', t: Date.now() - started, titles, buttons, state: await env.ev(P.probeCapture) }); break; }
    await sleep(40);
  }
  return sequence;
}

async function startCapture(env, outcome, { strip = false, text, intent, domain }) {
  await env.open(`scenario=M12-default&tone=light&next=${outcome}${strip ? '' : '&controls=hide'}`, VP.w1440, 'light');
  await clickSelector(env.page, '[data-capture-form] textarea');
  await env.page.send('Input.insertText', { text });
  if (intent) await chooseOption(env, 'intent', intent);
  if (domain) await chooseOption(env, 'domain', domain);
  return env.ev(P.probeCapture);
}

export async function captureChecks(env) {
  const { oracle, ev, check, page } = env;
  const presets = oracle.data.fixtures.capture.presets;

  /* ------------------------------------------------ entry points */
  {
    const c = check('M12.entry', 'M12', 'Entry points: the Overview "New work item" button and the rail destination open the form with focus in the description field');
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(page, '[role=tabpanel]:not([hidden]) button', { text: 'New work item' });
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form after Overview button', 4000);
    await sleep(200);
    c.eq(await ev(() => document.activeElement?.tagName), 'TEXTAREA', 'focus lands in the description field after the Overview button');
    c.eq(await ev(() => document.querySelector('[data-capture-form] h1')?.textContent), 'New work item', 'the form heading is neutral');
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(page, '#dude-tab-new');
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form after rail destination', 4000);
    await sleep(200);
    c.eq(await ev(() => document.activeElement?.tagName), 'TEXTAREA', 'focus lands in the description field after the rail destination');
    c.done();
  }

  /* ------------------------------------------------ nine states, static */
  {
    const c = check('M12.states', 'M12', 'M12 nine capture states render truthfully (default, chosen, sending, uncertain, saved, kept, missing, invalid, waiting)');
    const expected = {
      default: { notices: [], enabled: true }, chosen: { notices: [], enabled: true },
      sending: { notices: ['Awaiting capture delivery'], enabled: false }, uncertain: { notices: ['Delivery uncertain'], enabled: false },
      saved: { notices: ['Work item saved'], enabled: false }, kept: { notices: ['Work item saved', 'Existing intent kept'], enabled: false },
      missing: { notices: ['Work item saved', 'Domain not recorded'], enabled: false }, invalid: { notices: ['Not sent'], enabled: true },
      waiting: { notices: ['Waiting for the joined agent'], enabled: false },
    };
    for (const [key, preset] of Object.entries(presets)) {
      await env.open(`scenario=M12-${key}&tone=light&controls=hide`, VP.w1440, 'light');
      const cap = await ev(P.probeCapture);
      const want = expected[key];
      c.eq(cap.text, preset.text, `${key}: draft text`);
      c.eq(cap.intent.text, label(preset.intent, O.INTENT_WORD), `${key}: Intent choice`);
      c.eq(cap.domain.text, label(preset.domain, O.DOMAIN_WORD), `${key}: Domain choice`);
      c.eq(cap.actions.map(action => action.text), ['Submit', 'Save', 'Cancel'], `${key}: actions`);
      c.eq(cap.actions.slice(0, 2).every(action => action.disabled === !want.enabled), true, `${key}: Submit and Save ${want.enabled ? 'enabled' : 'disabled'}`);
      c.eq(cap.actions[2].disabled, false, `${key}: Cancel stays enabled`);
      c.eq(cap.notices.map(notice => notice.title), want.notices, `${key}: status notices`);
      c.ok(cap.copy.includes(COPY.meaning), `${key}: Submit and Save meanings are stated`);
      c.ok(cap.copy.includes(COPY.cancel), `${key}: Cancel behavior is stated`);
      c.ok(cap.copy.includes(COPY.optional), `${key}: optional / chat-correction hint is stated`);
      for (const claim of KIND) c.absent(cap.copy, claim, `${key}: idea/feature wording ${claim}`);
      c.absent(cap.copy, /Intent to retain|Capture this intent/, `${key}: old Needs you capture wording`);
      const text = cap.notices.map(notice => `${notice.title} ${apos(notice.text)}`).join(' | ');
      if (key === 'sending') c.matches(text, /No saved result is confirmed yet\. Your text and choices stay here\./, 'sending: says nothing is saved yet and keeps text and choices');
      if (key === 'uncertain') c.matches(text, /won't send this again\. Your text and choices stay here until the owner reconciles the capture\./, 'uncertain: no resend, text and choices kept');
      if (key === 'saved') {
        c.matches(text, /read the saved work item back/, 'saved: reports Saved only after read-back');
        c.ok(cap.savedLines.includes('Recorded: Intent Fix · Domain Code'), 'saved: shows the values the saved record holds');
        c.ok(cap.savedLines.some(line => /^\.dude\/ideas\/914-the-export-button-is-hidden-on-small-screens\.md$/.test(line)), 'saved: names the saved record');
      }
      if (key === 'kept') {
        c.ok(cap.savedLines.includes('It matched an existing work item: 901 Retry failed uploads.'), 'kept: says it matched an existing work item');
        c.ok(cap.savedLines.includes('Recorded: Intent Fix · Domain Code'), 'kept: shows the existing (kept) values');
        c.eq(apos(cap.notices[1].text), "901 already had the intent Fix, so Dude kept it instead of Maintain. To change it, ask Dude in chat.", 'kept: explains what was kept and how to change it');
      }
      if (key === 'missing') {
        c.ok(cap.savedLines.includes('Recorded: Intent Fix · Domain Not set'), 'missing: shows the domain was not recorded');
        c.eq(apos(cap.notices[1].text), "You chose Code, but the saved work item has no domain. To set it, ask Dude in chat.", 'missing: warns that the chosen domain was not recorded');
      }
      if (key === 'invalid') c.matches(apos(text), /nothing was captured\. Your text and choices are still here\./, 'invalid: refused before capture and the draft stays');
      if (key === 'waiting') c.matches(apos(text), /Another request is waiting\. Respond in Needs you first/, 'waiting: explains why capture is not available');
      if (!['saved', 'kept', 'missing'].includes(key)) c.absent(text, /read the saved work item back/, `${key}: claims a read-back that did not happen`);
      await env.saveShot(`m12-${key}-1440x900-light`);
    }
    c.done();
  }

  /* ------------------------------------------------ accessibility names and field wiring */
  {
    const c = check('M12.a11y-names', 'M12', 'M12 field and control accessibility names: Describe the work, Intent (optional), Domain (optional), Submit, Save, Cancel');
    await env.open('scenario=M12-chosen&tone=light&controls=hide', VP.w1440, 'light');
    const { nodes } = await page.send('Accessibility.getFullAXTree');
    const rows = nodes.filter(node => !node.ignored).map(node => ({ role: node.role?.value, name: String(node.name?.value ?? '').trim(),
      value: node.value?.value ?? null, description: String(node.description?.value ?? '') }));
    const find = (role, name) => rows.find(row => row.role === role && row.name === name);
    c.ok(Boolean(find('textbox', 'Describe the work')), 'textbox named "Describe the work"');
    const intent = find('combobox', 'Intent (optional)'), domain = find('combobox', 'Domain (optional)');
    c.ok(Boolean(intent), 'combobox named "Intent (optional)"');
    c.ok(Boolean(domain), 'combobox named "Domain (optional)"');
    c.matches(`${intent?.value ?? ''} ${intent?.name}`, /Fix/, 'Intent combobox exposes its chosen value Fix');
    c.matches(`${domain?.value ?? ''}`, /Code/, 'Domain combobox exposes its chosen value Code');
    c.ok(apos(intent?.description).includes('What the work is trying to do.'), 'Intent hint is the accessible description');
    c.ok(apos(domain?.description).includes('The kind of result you\'ll accept. Other covers the rest.'), 'Domain hint is the accessible description');
    for (const name of ['Submit', 'Save', 'Cancel']) c.ok(Boolean(find('button', name)), `button named "${name}"`);
    c.ok(rows.some(row => row.role === 'group' && row.name === 'Optional intent and domain'), 'group named "Optional intent and domain"');
    // option lists
    await clickSelector(page, '[data-capture-choice="intent"]');
    await env.waitFor(P.hasListbox, 'intent options', 4000);
    c.eq((await ev(P.listboxOptions)).map(option => option.text), ['Not set', 'Create', 'Fix', 'Maintain', 'Explore'], 'Intent options (spec FR-005 + Not set)');
    await pressKey(page, 'Escape'); await sleep(200);
    await clickSelector(page, '[data-capture-choice="domain"]');
    await env.waitFor(P.hasListbox, 'domain options', 4000);
    c.eq((await ev(P.listboxOptions)).map(option => option.text), ['Not set', 'Code', 'Design', 'Writing', 'Video', 'Other'], 'Domain options (spec FR-006 + Not set)');
    await env.saveShot('m12-domain-options-1440x900-light');
    await pressKey(page, 'Escape'); await sleep(200);
    // keyboard selection works too
    await ev(() => document.querySelector('[data-capture-choice="intent"]').focus());
    await pressKey(page, 'ArrowDown'); await sleep(250);
    const opened = await ev(P.listboxOptions);
    c.ok(opened.length === 5, `ArrowDown opens the Intent list by keyboard (${opened.length} options)`);
    await pressKey(page, 'Escape');
    // fixtures start at Not set and an empty draft needs text
    await env.open('scenario=M12-default&tone=light&controls=hide', VP.w1440, 'light');
    const initial = await ev(P.probeCapture);
    c.eq([initial.intent.text, initial.domain.text], ['Not set', 'Not set'], 'new form starts with both choices at Not set');
    await clickSelector(page, 'button', { text: 'Submit' });
    await sleep(250);
    const empty = await ev(P.probeCapture);
    c.matches(empty.validation, /Describe the work before submitting or saving\./, 'empty submit asks for text and sends nothing');
    c.eq(empty.notices.length, 0, 'empty submit starts no capture');
    c.done();
  }

  /* ------------------------------------------------ real local submit transitions, one per declared outcome */
  const outcomes = [
    { outcome: 'saved', button: 'Submit', text: 'The export button is hidden on small screens.', intent: 'Fix', domain: 'Code', final: ['Work item saved'], line: 'Recorded: Intent Fix · Domain Code' },
    { outcome: 'kept', button: 'Save', text: 'Uploads still stall on slow connections.', intent: 'Maintain', domain: 'Code', final: ['Work item saved', 'Existing intent kept'], line: 'Recorded: Intent Fix · Domain Code' },
    { outcome: 'missing', button: 'Submit', text: 'The export button is hidden on small screens.', intent: 'Fix', domain: 'Code', final: ['Work item saved', 'Domain not recorded'], line: 'Recorded: Intent Fix · Domain Not set' },
    { outcome: 'uncertain', button: 'Submit', text: 'The export button is hidden on small screens.', intent: 'Fix', domain: 'Code', final: ['Delivery uncertain'], line: null },
    { outcome: 'refused', button: 'Save', text: 'The export button is hidden on small screens.', intent: 'Explore', domain: 'Video', final: ['Not sent'], line: null },
  ];
  for (const spec of outcomes) {
    const c = check(`M12.submit-${spec.outcome}`, 'M12', `M12 real ${spec.button} with the ${spec.outcome} outcome: Responding -> Awaiting capture delivery -> result; draft and choices retained`);
    const before = await startCapture(env, spec.outcome, spec);
    c.eq([before.text, before.intent.text, before.domain.text], [spec.text, spec.intent, spec.domain], 'typed text and chosen values are in the form');
    c.ok(before.actions.slice(0, 2).every(action => !action.disabled), 'Submit and Save are enabled before sending');
    await ev(() => {
      window.__live = [];
      const seen = () => { for (const node of document.querySelectorAll('[aria-live], [role=status], [role=alert]')) {
        if (node.closest('#mock-strip')) continue; // the mock strip's own log is mock chrome, not a product status
        const text = node.textContent.replace(/\s+/g, ' ').trim(); if (text && !window.__live.includes(text)) window.__live.push(text); } };
      new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, characterData: true });
      seen();
      return true;
    });
    await clickSelector(page, '[data-capture-form] button', { text: spec.button });
    env.stats.transitions = (env.stats.transitions ?? 0) + 1;
    const finalTitles = spec.final.join(' | ');
    const sequence = await sampleStates(env, state => state.notices.map(notice => notice.title).join(' | ') === finalTitles);
    env.stats.live ??= {};
    env.stats.live[spec.outcome] = await ev(() => window.__live);
    const titles = sequence.map(entry => entry.titles).filter((title, index, all) => title && all.indexOf(title) === index);
    c.eq(titles, ['Responding', 'Awaiting capture delivery', finalTitles], 'status sequence');
    const responding = sequence.find(entry => entry.titles === 'Responding');
    c.ok(Boolean(responding) && responding.buttons.includes('Submit:off') && responding.buttons.includes('Save:off'), 'Submit and Save are disabled while Responding');
    c.ok(responding && /Don't submit it again/.test(apos(responding.state.notices[0]?.text)), 'Responding tells the user not to submit again');
    const delay = sequence.find(entry => entry.titles === finalTitles)?.t ?? null;
    c.ok(delay !== null && delay >= 1500 && delay <= 3500, `result arrives after the simulated delay (observed ${delay}ms)`);
    const end = sequence.at(-1).state;
    c.eq(end.notices.map(notice => notice.title), spec.final, 'final notices');
    c.eq([end.text, end.intent.text, end.domain.text], [spec.text, spec.intent, spec.domain], 'draft text and choices are retained after the result');
    const locked = spec.outcome !== 'refused';
    c.eq(end.actions.slice(0, 2).every(action => action.disabled === locked), true, `Submit and Save ${locked ? 'stay disabled (no second capture of the same text)' : 'are enabled for a user-initiated retry'}`);
    if (spec.line) c.ok(end.savedLines?.includes(spec.line), `read-back line "${spec.line}"`);
    if (spec.outcome === 'kept') {
      c.eq(apos(end.notices[1].text), '901 already had the intent Fix, so Dude kept it instead of Maintain. To change it, ask Dude in chat.', 'old record kept: states what was kept and how to change it');
      c.ok(end.savedLines.includes('It matched an existing work item: 901 Retry failed uploads.'), 'names the existing item it matched');
      c.ok(!end.notices.some(notice => /overwr/i.test(notice.text)), 'nothing is described as overwritten');
    }
    if (spec.outcome === 'missing') c.eq(apos(end.notices[1].text), "You chose Code, but the saved work item has no domain. To set it, ask Dude in chat.", 'missing value: warning with how to set it');
    if (spec.outcome === 'uncertain') {
      c.matches(apos(end.notices[0].text), /won't send this again\./, 'uncertain: says it will not send again');
      // no replay: Submit/Save cannot be used, even after editing the text and choices
      await clickSelector(page, '[data-capture-form] textarea');
      await page.send('Input.insertText', { text: ' Edited after the uncertain delivery.' });
      await chooseOption(env, 'intent', 'Create');
      const edited = await ev(P.probeCapture);
      c.ok(edited.actions.slice(0, 2).every(action => action.disabled), 'editing the text and choices does not re-enable Submit or Save');
      for (const name of ['Submit', 'Save']) {
        const box = await ev(name => { const button = [...document.querySelectorAll('[data-capture-form] button')].find(node => node.textContent.trim() === name);
          const rect = button.getBoundingClientRect(); return [rect.left + rect.width / 2, rect.top + rect.height / 2]; }, name);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box[0], y: box[1] });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box[0], y: box[1], button: 'left', clickCount: 1 });
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box[0], y: box[1], button: 'left', clickCount: 1 });
      }
      const after = await sampleStates(env, () => false, 2800);
      const seen = [...new Set(after.map(entry => entry.titles))];
      c.eq(seen, ['Delivery uncertain'], 'a 2.8s observation after clicking the disabled Submit and Save shows no new Responding / Awaiting / Saved state');
      c.ok(after.every(entry => entry.state.text.includes('Edited after the uncertain delivery.') && entry.state.intent.text === 'Create'), 'the edited draft and choices stay in the form');
      await env.saveShot('m12-uncertain-no-replay-1440x900-light'); c.shot('m12-uncertain-no-replay-1440x900-light');
    }
    if (spec.outcome === 'refused') {
      c.matches(apos(end.notices[0].text), /nothing was captured\./, 'refused: nothing was captured');
      const idleSeen = await sampleStates(env, () => false, 2600);
      c.eq([...new Set(idleSeen.map(entry => entry.titles))], ['Not sent'], 'a refused capture is not retried automatically');
      // user-initiated retry with a different choice, then a saved result (fixture control sets the next result)
      await chooseOption(env, 'intent', 'Not set');
      await chooseOption(env, 'domain', 'Not set');
      await clickSelector(page, '[data-capture-form] button', { text: 'Submit' });
      const retry = await sampleStates(env, () => false, 2600);
      c.ok(retry.some(entry => entry.titles.includes('Responding')), 'a user action starts the retry with a new Responding state');
      await env.saveShot('m12-refused-retry-1440x900-light');
    }
    if (spec.outcome === 'saved') {
      await env.saveShot('m12-submit-saved-1440x900-light'); c.shot('m12-submit-saved-1440x900-light');
      // the saved item is listed locally with the values the read-back reported, and a reload clears it
      await clickSelector(page, '#dude-tab-overview');
      await env.waitFor(() => document.querySelectorAll('[data-work-path]').length > 0, 'overview rows', 5000);
      await ev(() => { const box = document.querySelector('[data-work-scroll]'); box.scrollTop = box.scrollHeight; return true; });
      await sleep(150);
      const rows = await ev(P.probeRows);
      const added = rows.find(row => row.number === '914');
      c.ok(Boolean(added), 'the saved work item appears as 914 in the local fixture list');
      c.eq(added?.classification, 'Fix · Code', '914 shows the read-back classification');
      c.eq(added?.stageLines?.[0], 'Captured', '914 is Captured');
      await ev(P.mark);
      await page.send('Page.reload');
      await until(() => evalFn(page, P.probeReady), 'reload', 10000).catch(() => {});
      await sleep(600);
      const reloaded = await ev(() => document.querySelectorAll('[data-work-path]').length);
      c.ok(reloaded <= 13, `reloading discards the local result (rows after reload: ${reloaded})`);
    }
    c.done();
  }

  /* ------------------------------------------------ strip log, fixture control, and fixture state selector outside product chrome */
  {
    const c = check('M12.fixture-controls', 'M12', 'Fixture controls sit outside product chrome and are labeled; they change fixture state without sending anything');
    await env.open('scenario=M12-default&tone=light&next=missing', VP.w1440, 'light');
    const outside = await ev(() => { const strip = document.querySelector('#mock-strip'); const main = document.querySelector('main'); const header = document.querySelector('header');
      return { stripExists: Boolean(strip), label: strip?.getAttribute('aria-label'), stripContainsProduct: strip.contains(main) || strip.contains(header), productContainsStrip: main.contains(strip),
        selects: [...strip.querySelectorAll('select')].map(select => select.getAttribute('data-mock-control')) }; });
    c.ok(outside.stripExists && !outside.stripContainsProduct && !outside.productContainsStrip, 'the strip is a separate region from product chrome');
    c.eq(outside.label, 'Mock controls, not part of Canvas', 'strip accessible name says it is not part of Canvas');
    c.eq(outside.selects, ['scenario', 'data', 'feed', 'capture', 'next', 'appearance', 'tone'], 'strip controls');
    await clickSelector(page, '[data-capture-form] textarea');
    await page.send('Input.insertText', { text: 'A fixture-control check.' });
    await clickSelector(page, '[data-capture-form] button', { text: 'Submit' });
    await sleep(300);
    const strip = await ev(P.probeStrip);
    c.matches(strip.log, /Fixture transition: Submit handed this draft to a simulated owner\. Next result: Saved, domain not recorded\. Nothing left this page\./, 'the strip labels the transition as a fixture transition and says nothing left this page');
    // switching the capture state through the fixture control
    await ev(() => { const select = document.querySelector('[data-mock-control="capture"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(select, 'uncertain'); select.dispatchEvent(new Event('change', { bubbles: true })); return select.value; });
    await sleep(400);
    const cap = await ev(P.probeCapture);
    c.eq(cap.notices.map(notice => notice.title), ['Delivery uncertain'], 'the Capture state control shows the uncertain state');
    await env.saveShot('m12-fixture-controls-1440x900-light');
    c.done();
  }

  /* ------------------------------------------------ Cancel keeps text and choices */
  {
    const c = check('M12.cancel', 'M12', 'Cancel returns to Needs you and preserves text, choices, and status when the form is reopened');
    await env.open('scenario=M12-default&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(page, '[data-capture-form] textarea');
    await page.send('Input.insertText', { text: 'Keep this draft when I cancel.' });
    await chooseOption(env, 'intent', 'Explore');
    await chooseOption(env, 'domain', 'Video');
    await clickSelector(page, '[data-capture-form] button', { text: 'Cancel' });
    await env.waitFor(() => !document.querySelector('[data-capture-form]'), 'form hidden after Cancel', 4000);
    const needs = await ev(() => ({ h1: document.querySelector('[role=tabpanel]:not([hidden]) h1')?.textContent, selected: document.querySelector('[role=tab][aria-selected=true]')?.getAttribute('aria-label') }));
    c.eq(needs.h1, 'Needs you', 'Cancel goes to Needs you');
    await clickSelector(page, '#dude-tab-new');
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form reopened', 4000);
    const back = await ev(P.probeCapture);
    c.eq([back.text, back.intent.text, back.domain.text], ['Keep this draft when I cancel.', 'Explore', 'Video'], 'text and both choices survive Cancel');
    // an uncertain attempt also survives Cancel
    await env.open('scenario=M12-uncertain&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(page, '[data-capture-form] button', { text: 'Cancel' });
    await clickSelector(page, '#dude-tab-new');
    await env.waitFor(() => Boolean(document.querySelector('[data-capture-form]')), 'form reopened (uncertain)', 4000);
    const uncertain = await ev(P.probeCapture);
    c.eq(uncertain.notices.map(notice => notice.title), ['Delivery uncertain'], 'an uncertain attempt is still uncertain after Cancel and return (not reset, not resent)');
    c.eq([uncertain.text, uncertain.intent.text, uncertain.domain.text], [presets.uncertain.text, 'Fix', 'Code'], 'draft and choices kept while uncertain');
    c.ok(uncertain.actions.slice(0, 2).every(action => action.disabled), 'Submit and Save remain disabled');
    c.done();
  }

  /* ------------------------------------------------ Save as work item (Needs you) and blank workspace */
  {
    const c = check('S2.save-as-work-item', 'M12', 'Needs you "Save as work item": neutral labels, sends no intent or domain, truthful statuses');
    await env.open('scenario=S2&tone=light&controls=hide', VP.w1440, 'light');
    const first = await ev(() => ({ text: document.querySelector('[data-request]')?.innerText ?? '', buttons: [...document.querySelectorAll('[data-request] button')].map(button => button.textContent.trim()) }));
    c.ok(first.buttons.includes('Save as work item'), 'the action is labeled "Save as work item"');
    c.absent(first.text, /Save as idea|Intent to retain|Capture this intent/, 'old capture labels');
    const alreadyOpen = await ev(() => Boolean(document.querySelector('[data-request] textarea')));
    c.ok(alreadyOpen, 'scenario S2 shows the Save as work item form already open');
    // the disclosure button toggles: close, then open again
    await clickSelector(page, '[data-request] button', { text: 'Save as work item' });
    await sleep(200);
    c.eq(await ev(() => Boolean(document.querySelector('[data-request] textarea'))), false, 'Save as work item toggles the form closed');
    await clickSelector(page, '[data-request] button', { text: 'Save as work item' });
    await sleep(250);
    const form = await ev(() => ({ label: [...document.querySelectorAll('[data-request] label')].map(label => label.textContent.trim()), buttons: [...document.querySelectorAll('[data-request] button')].map(button => button.textContent.trim()),
      notice: document.querySelector('[data-request] .fui-MessageBar')?.innerText ?? '' }));
    c.ok(form.label.includes('Text to save'), 'field is labeled "Text to save"');
    c.ok(form.buttons.includes('Save this text'), 'button is labeled "Save this text"');
    c.matches(apos(form.notice), /No intent or domain is sent; you can set them later in chat\./, 'states that no intent or domain is sent');
    await clickSelector(page, '[data-request] textarea');
    await page.send('Input.insertText', { text: 'Remember to review the nightly job.' });
    await clickSelector(page, '[data-request] button', { text: 'Save this text' });
    const seen = [];
    for (let index = 0; index < 70; index += 1) {
      const titles = await ev(() => [...document.querySelectorAll('[data-request] .fui-MessageBarTitle')].map(node => node.textContent).join(' | '));
      if (!seen.length || seen.at(-1) !== titles) seen.push(titles);
      if (/Work item saved/.test(titles)) break;
      await sleep(40);
    }
    c.ok(seen.some(title => /Responding/.test(title)) && seen.some(title => /Awaiting capture delivery/.test(title)) && seen.some(title => /Work item saved/.test(title)), `Responding -> Awaiting capture delivery -> Work item saved observed (${JSON.stringify(seen)})`);
    const saved = await ev(() => document.querySelector('[data-request] [data-capture-saved]')?.innerText ?? '');
    c.matches(saved, /Recorded: Intent Not set · Domain Not set/, 'the read-back shows Not set for both values');
    await env.saveShot('s2-save-as-work-item-1440x900-light'); c.shot('s2-save-as-work-item-1440x900-light');
    c.done();
  }
  {
    const c = check('S1.blank-workspace', 'M12', 'Blank-workspace prompt and navigation use neutral work-item wording; destinations and order are unchanged');
    await env.open('scenario=S1&tone=light&controls=hide', VP.w1440, 'light');
    const blank = await ev(() => document.querySelector('[data-blank-workspace]')?.innerText ?? null);
    c.matches(blank ?? '', /Welcome to Dude/, 'blank prompt renders');
    c.matches(apos(blank), /capture it as a work item for later/, 'blank prompt says work item');
    c.ok(/New work item/.test(blank ?? ''), 'blank prompt action is "New work item"');
    const text = await ev(P.probeProductText);
    for (const claim of KIND) c.absent([...text.texts, ...text.labels].join(' | '), claim, `blank workspace wording ${claim}`);
    const tabs = await ev(() => [...document.querySelectorAll('[role=tab]')].map(tab => tab.getAttribute('aria-label')));
    c.eq(tabs, ['Overview', 'Now', 'Needs you', 'New work item', 'Settings'], 'navigation destinations and order');
    await clickSelector(page, '[aria-label="Expand navigation pane"]');
    await sleep(250);
    const expanded = await ev(() => [...document.querySelectorAll('[role=tab]')].map(tab => tab.innerText.trim()));
    c.eq(expanded, ['Overview', 'Now', 'Needs you', 'New work item', 'Settings'], 'expanded rail labels');
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const overview = await ev(P.probeProductText);
    for (const claim of KIND) c.absent([...overview.texts, ...overview.labels].join(' | '), claim, `Overview wording ${claim}`);
    c.ok(overview.texts.some(text => /^13 of 13 work items · capture order, oldest first$/.test(text)), 'Overview summary says work items, in capture order');
    const needs = await env.open('scenario=M1&tone=light&controls=hide&view=needs', VP.w1440, 'light');
    const needsText = await ev(P.probeProductText);
    for (const claim of KIND) c.absent([...needsText.texts, ...needsText.labels].join(' | '), claim, `Needs you wording ${claim}`);
    c.done();
  }
}
