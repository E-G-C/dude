// Round 3 focused verification helpers (test-only, independent Tester). Nothing here is product code.
// The round 2 CDP client, harness, probes, and oracle are imported UNCHANGED from ../../round-2-independent/runner/.
// Only helpers that the round 2 modules do not have live here. Every `probe*` export is serialized with toString()
// and evaluated in the page, so it must not reference module scope.
import fs from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import * as C from '../../round-2-independent/runner/cdp.mjs';
import * as H from '../../round-2-independent/runner/harness.mjs';
import * as P from '../../round-2-independent/runner/probes.mjs';
import * as O from '../../round-2-independent/runner/oracle.mjs';

export { C, H, P, O };
export const { sleep, until, evalFn, clickSelector, pressKey, typeText, screenshot } = C;
export const { VP, THEMES } = H;

export const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
export const apos = value => String(value ?? '').replace(/[\u2018\u2019]/g, "'");
export const sameCopy = (a, b) => norm(apos(a)) === norm(apos(b));

/* ------------------------------------------------------------------ patterns (independent of the mock's own strings) */

export const RE = {
  // A classification field, choice, placeholder, warning, or instruction would need at least one of these words.
  classification: /\b(intents?|domains?)\b|classif|categor|\bnot set\b|unrecogni[sz]ed|unrecorded|work_(?:intent|domain)/i,
  // "confirm" is legitimate for delivery ("Nothing is confirmed yet"); a classification confirmation pairs it with a category word.
  classificationConfirm: /confirm\w*[^.?!]{0,80}\b(?:classif\w*|intents?|domains?|categor\w*|types?|kinds?)\b|\b(?:classif\w*|intents?|domains?|categor\w*|types?|kinds?)\b[^.?!]{0,80}confirm/i,
  // VSC-005 internal terms the capture form's own messages must avoid, plus the coordinator's "scope binding" chore.
  internal: /joined agent|unfiled|reconcil|metadata|\breceipt\b|\bbinding\b|\bscope\b|\bowners?\b/i,
  // Idea or feature named as the item's kind (FR-002). Paths and the existing "Idea" source label are not kind naming.
  kind: /\b(?:draft idea|this idea|this feature|an idea|a feature|idea or feature|select a feature|still an idea)\b/i,
  verified: /\bverified\b/i,
  deliveredClaim: /\b(?:delivered|released|shipped|deployed)\b/i,
  // Request coverage that is partial or unavailable must never read as "None" or "nothing is waiting".
  noneClaim: /\bNone\b|no (?:current |preview )?requests? (?:is|are) waiting|nothing is waiting|no request|No current owner-qualified preview request is waiting/i,
  // After uncertain delivery or while blocked, copy must not promise the owner has or will act on the text.
  overpromise: /has your text|\b(?:was|been|is) saved\b|\breceived (?:it|your)\b|\bgot it\b|\bautomatically\b|\bwill (?:be )?(?:send|sent|resend|resent|retry|retried|submit|submitted|save|saved)\b/i,
  wordsToken: /\b(?:Fix|New|Maintenance|Exploration|Code|Design|Writing|Video)\b/,
};

/* ------------------------------------------------------------------ in-page sources installed at document start */

export const WATCH_SOURCE = `(() => {
  // CSP violations: every securitypolicyviolation event the page sees.
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', event => window.__csp.push({ directive: event.violatedDirective, blocked: String(event.blockedURI).slice(0, 120), sample: String(event.sample || '').slice(0, 60) }));
  // Announcements: document.ariaNotify calls (call-through) and DOM live-region changes. Adapted from the round 2 A.announce-channels probe.
  const log = window.__announce = { supported: typeof document.ariaNotify === 'function', t0: performance.now(), events: [] };
  const push = event => log.events.push({ t: Math.round(performance.now() - log.t0), ...event });
  if (log.supported) {
    const original = document.ariaNotify;
    document.ariaNotify = function (message, options) { push({ channel: 'ariaNotify', message: String(message), options: options ? { ...options } : null }); return original.apply(this, arguments); };
  }
  const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
  const squash = text => (text || '').replace(/\\s+/g, ' ').trim();
  const last = new WeakMap();
  const observe = () => new MutationObserver(records => {
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
      const text = squash(region.textContent);
      const known = last.has(region);
      if (known && last.get(region) === text) continue;
      last.set(region, text);
      if (text) push({ channel: 'dom-live', kind: known ? 'update' : 'insert', text, mockChrome: Boolean(region.closest('#mock-strip')) });
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  observe();
})();`;

/** Records every distinct set of status titles shown by the given root, in order, with timestamps. */
export const startTitleLog = selector => {
  window.__titleLog = [];
  const read = () => [...document.querySelectorAll(`${selector} .fui-MessageBarTitle`)].map(node => node.textContent.trim()).join(' | ');
  let last = read();
  window.__titleLog.push({ t: Math.round(performance.now()), titles: last });
  new MutationObserver(() => {
    const now = read();
    if (now !== last) { last = now; window.__titleLog.push({ t: Math.round(performance.now()), titles: now }); }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  return true;
};
export const readTitleLog = () => window.__titleLog ?? [];

/* ------------------------------------------------------------------ probes */

export const probeForm = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const form = document.querySelector('[data-capture-form]');
  if (!form) return null;
  const visible = element => element.getClientRects().length > 0;
  const selector = 'input, textarea, select, button, a[href], [role=combobox], [role=listbox], [role=option], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [contenteditable=true], [tabindex]:not([tabindex="-1"])';
  const controls = [...form.querySelectorAll(selector)].filter(visible).map(element => ({
    tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), role: element.getAttribute('role'),
    name: element.getAttribute('aria-label') || norm(element.textContent), disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
  }));
  const header = form.querySelector('header');
  const textarea = form.querySelector('textarea');
  return {
    h1: norm(form.querySelector('h1')?.textContent), paragraphs: [...(header?.querySelectorAll('p') ?? [])].map(node => norm(node.textContent)),
    labels: [...form.querySelectorAll('label')].map(node => norm(node.textContent)), textareas: form.querySelectorAll('textarea').length, controls,
    described: [...form.querySelectorAll('button[aria-describedby]')].map(button => ({ name: norm(button.textContent), disabled: button.disabled,
      text: norm(document.getElementById(button.getAttribute('aria-describedby'))?.textContent) })),
    footnote: norm([...form.children].at(-1)?.textContent), text: norm(form.innerText), value: textarea ? textarea.value : null,
    placeholder: textarea?.getAttribute('placeholder') ?? null, dialogs: document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]').length,
    validation: norm(form.querySelector('[role=alert], .fui-Field__validationMessage')?.textContent),
  };
};

export const probeNoticesIn = selector => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const root = document.querySelector(selector);
  if (!root) return null;
  return [...root.querySelectorAll('.fui-MessageBar')].map(entry => {
    const title = norm(entry.querySelector('.fui-MessageBarTitle')?.textContent);
    const body = norm(entry.querySelector('.fui-MessageBarBody')?.textContent);
    const status = entry.querySelector('[role=status]');
    const lines = entry.querySelector('[data-capture-saved]') ? [...entry.querySelector('[data-capture-saved]').children].map(child => norm(child.textContent)) : null;
    return { title, text: body.startsWith(title) ? body.slice(title.length).trim() : body, lines, live: status ? status.getAttribute('aria-live') : null };
  });
};

export const probeRowDetail = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('[data-work-path]')].map(row => {
    const number = row.querySelector('[data-work-number]');
    const kids = number?.nextElementSibling ? [...number.nextElementSibling.children] : [];
    const words = row.querySelector('[data-work-classification]');
    const slug = kids.at(-1);
    const wordsStyle = words ? getComputedStyle(words) : null;
    const slugStyle = slug ? getComputedStyle(slug) : null;
    const stage = row.querySelector('[data-work-stage]');
    return {
      path: row.getAttribute('data-work-path'), aria: row.getAttribute('aria-label'), number: norm(number?.textContent), title: norm(kids[0]?.textContent),
      words: words ? norm(words.textContent) : null, order: kids.map(kid => (kid === words ? 'words' : kid === slug ? 'slug' : kid === kids[0] ? 'title' : 'other')),
      wordsColor: wordsStyle?.color ?? null, slugColor: slugStyle?.color ?? null, wordsWeight: wordsStyle?.fontWeight ?? null, wordsBg: wordsStyle?.backgroundColor ?? null,
      stage: stage?.getAttribute('data-work-stage') ?? null, cells: row.querySelectorAll('[role=gridcell]').length,
      labelledFields: row.querySelectorAll('dt, label, [data-classification], select, [role=combobox]').length, text: norm(row.innerText),
    };
  });
};

/** Detector for "a classification ask in the capture form": controls, labels, and copy. Runs unchanged on round 2 and round 3. */
export const probeCaptureDetector = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const form = document.querySelector('[data-capture-form]');
  if (!form) return { formFound: false };
  const visible = element => element.getClientRects().length > 0;
  const inputs = [...form.querySelectorAll('input, textarea, select, [role=combobox], [role=listbox], [role=radio], [role=checkbox], [role=switch], [contenteditable=true]')].filter(visible);
  const kind = element => element.matches('textarea') ? 'textarea' : element.matches('select, [role=combobox], .fui-Dropdown, [role=listbox]') ? 'choice'
    : element.matches('[role=radio], [role=checkbox], [role=switch], input[type=radio], input[type=checkbox]') ? 'choice' : 'other-input';
  const classes = inputs.map(kind);
  const dropdowns = form.querySelectorAll('.fui-Dropdown, [role=combobox]').length;
  return { formFound: true, textareas: classes.filter(item => item === 'textarea').length, choiceControls: Math.max(classes.filter(item => item === 'choice').length, dropdowns),
    otherInputs: classes.filter(item => item === 'other-input').length, labels: [...form.querySelectorAll('label')].map(label => norm(label.textContent)),
    buttons: [...form.querySelectorAll('button')].filter(button => !button.matches('.fui-Dropdown__button, .fui-Dropdown__clearButton')).map(button => norm(button.textContent)),
    text: norm(form.innerText) };
};

/** Everything the Now details show that these checks need, read in one pass. */
export const probeDetails = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const now = document.querySelector('[data-now]');
  if (!now) return null;
  const header = now.querySelector('header');
  const cls = header?.querySelector('[data-classification]');
  const kids = cls ? [...cls.children] : [];
  const visual = kids.find(kid => kid.getAttribute('aria-hidden') === 'true');
  const speech = kids.find(kid => kid !== visual);
  const stage = header?.querySelector('[data-work-stage]');
  const rows = [...now.querySelectorAll('[data-report-row]')].map(row => ({ label: row.getAttribute('data-report-row'),
    items: [...row.querySelectorAll('li')].map(item => norm(item.textContent)), value: norm(row.querySelector('dd > span, dd > ul')?.textContent), text: norm(row.innerText) }));
  return {
    path: now.getAttribute('data-now'), eyebrow: norm(header?.querySelector('span')?.textContent), title: norm(now.querySelector('h1')?.textContent),
    stage: stage?.getAttribute('data-work-stage') ?? null, words: visual ? norm(visual.textContent) : null, speech: speech ? norm(speech.textContent) : null,
    factsLists: now.querySelectorAll('dl[data-classification]').length, corrections: now.querySelectorAll('[data-correction]').length,
    messageBars: [...now.querySelectorAll('.fui-MessageBar')].map(bar => norm(bar.textContent)), headerText: norm(header?.innerText),
    nextHeading: norm(now.querySelector('[data-now-next] h2')?.textContent), rows, unknown: [...now.querySelectorAll('[data-report-unknown]')].map(node => norm(node.textContent)),
    progressText: norm(now.querySelector('[data-progress-report]')?.innerText),
    blockers: [...now.querySelectorAll('section')].filter(section => norm(section.querySelector('h2')?.textContent) === 'Recorded blockers').map(section => norm(section.innerText)),
    description: [...now.querySelectorAll('aside details')].find(node => node.querySelector('summary')?.textContent.trim() === 'Captured description')?.querySelector('p')?.textContent ?? null,
    buttons: [...now.querySelectorAll('header button')].map(button => norm(button.textContent)),
    guidance: /preview request|Review design|Review capability/i.test(header?.innerText ?? ''), docked: Boolean(now.querySelector('aside [data-task-detail]')),
    text: norm(now.innerText),
  };
};

export const probeTexts = () => {
  const norm = value => (value || '').replace(/\s+/g, ' ').trim();
  const root = document.querySelector('header').parentElement;
  const recorded = '[data-task-key], [data-task-detail], [data-now-next], [data-task-instruction], [data-now] h1, [data-work-path], details p, [data-mock-note]';
  const isRecorded = element => Boolean(element.closest(recorded))
    || Boolean(element.closest('p') && ['Activity', 'Recorded blockers'].includes(element.closest('section')?.querySelector('h2')?.textContent));
  const byParent = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const element = node.parentElement;
    if (!element || !node.nodeValue.trim() || element.closest('script, style, noscript')) continue;
    byParent.set(element, (byParent.get(element) ?? '') + node.nodeValue);
  }
  const copy = [], data = [];
  for (const [element, value] of byParent) {
    const text = norm(value);
    if (text) (isRecorded(element) ? data : copy).push(text);
  }
  const attrs = name => [...root.querySelectorAll(`[${name}]`)].filter(element => !isRecorded(element)).map(element => element.getAttribute(name)).filter(Boolean);
  return { copy, data, labels: attrs('aria-label'), titles: attrs('title'), placeholders: attrs('placeholder') };
};

/* ------------------------------------------------------------------ accessibility tree */

export async function axSnapshot(page) {
  await evalFn(page, () => { document.querySelector('#mock-strip')?.setAttribute('aria-hidden', 'true'); return true; });
  try { return (await page.send('Accessibility.getFullAXTree')).nodes; }
  finally { await evalFn(page, () => { document.querySelector('#mock-strip')?.removeAttribute('aria-hidden'); return true; }); }
}
export const axProp = (node, key) => node.properties?.find(property => property.name === key)?.value?.value;
export const axStrings = nodes => nodes.filter(node => !node.ignored).flatMap(node => [node.name?.value, node.description?.value, node.value?.value]).filter(Boolean).map(String);
export const axButton = (nodes, name) => nodes.find(node => !node.ignored && node.role?.value === 'button' && norm(node.name?.value) === name) ?? null;

/* ------------------------------------------------------------------ mock controls and typing */

export async function setMockSelect(page, name, value) {
  return evalFn(page, (name, value) => {
    const select = document.querySelector(`[data-mock-control="${name}"]`);
    if (!select) return null;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  }, name, value);
}

/** Real mouse focus, select all, delete, then Input.insertText (the trusted text path) into the capture textarea. */
export async function typeDraft(env, text, selector = '[data-capture-form] textarea') {
  await H.typeInto(env, selector, text, { clear: true });
  await sleep(60);
}

export async function waitTitle(env, title, { selector = '[data-capture-form]', timeout = 6000 } = {}) {
  return env.waitFor((selector, title) => [...document.querySelectorAll(`${selector} .fui-MessageBarTitle`)].some(node => node.textContent.trim() === title),
    `status "${title}"`, timeout, selector, title);
}

/** The sequence of distinct status-title sets observed since startTitleLog, as plain strings with duplicates removed. */
export async function titleSequence(env) {
  const log = await env.ev(readTitleLog);
  const out = [];
  for (const entry of log) if (out.at(-1) !== entry.titles) out.push(entry.titles);
  return out.filter(Boolean);
}

/* ------------------------------------------------------------------ replica of the app's local preview origin */

/** A test-only loopback server answering as http://browser-preview-local.localhost:<port>/<id>/work-type-presentation.html. */
export async function startReplica(htmlBytes) {
  const id = randomUUID();
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push(`${request.method} ${request.url.split('?')[0]} -> ${request.url.split('?')[0] === `/${id}/work-type-presentation.html` ? 200 : 404}`);
    if (request.url.split('?')[0] === `/${id}/work-type-presentation.html`) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(htmlBytes);
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { id, port, seen, origin: `http://browser-preview-local.localhost:${port}`, page: `http://browser-preview-local.localhost:${port}/${id}/work-type-presentation.html`,
    close: () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); }) };
}

export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
