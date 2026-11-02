// Observations: continuity and wording points that are reported precisely but do not fail the artifact.
import fs from 'node:fs';
import path from 'node:path';
import { P, VP, clickSelector, pressKey } from './harness.mjs';

export async function observationChecks(env) {
  const { check, ev, page, repo, designDir } = env;
  const lineOf = (file, pattern) => {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const found = lines.map((line, index) => (pattern.test(line) ? index + 1 : 0)).filter(Boolean);
    return found;
  };
  const rel = file => path.relative(repo, file).split(path.sep).join('/');
  const productApp = path.join(repo, 'src', 'extensions', 'dude', 'frontend', 'app.jsx');
  const productNeeds = path.join(repo, 'src', 'extensions', 'dude', 'frontend', 'needs-you.jsx');
  const mockJsx = path.join(designDir, 'source', 'work-type-presentation.jsx');

  {
    const c = check('K.working-on-browsing', 'obs', 'Continuity: today\'s Canvas labels the selection "Browsing" (not "Working on") while a request for a different scope is open', { observation: true });
    await env.open('scenario=M4&tone=light&controls=hide', VP.w1440, 'light');
    await clickSelector(page, '#dude-tab-needs');
    await env.waitFor(() => Boolean(document.querySelector('[data-request-option]')), 'Needs you list', 5000);
    await clickSelector(page, '[data-request-option="rq-session-start"]');
    await env.waitFor(() => Boolean(document.querySelector('[data-request="rq-session-start"]')), 'session request', 5000);
    const commands = await ev(P.probeCommands);
    const scope = await ev(() => document.querySelector('[data-request] section[aria-label="Request scope"]')?.innerText ?? '');
    c.note(`product ${rel(productApp)} lines ${lineOf(productApp, /browsing \? 'Browsing' : 'Working on'/).join(', ')} and ${rel(productNeeds)} line ${lineOf(productNeeds, /You are browsing/).join(', ')}; mock source mentions "browsing" ${lineOf(mockJsx, /browsing/i).length} times`);
    c.note(`mock, selection 904 with the session request open: group label "${commands.workingOn?.label}"; scope panel says ${JSON.stringify(scope.replace(/\s+/g, ' ').slice(0, 140))}`);
    c.eq(commands.workingOn?.label, 'Browsing', 'group label while viewing a request for a different scope');
    c.matches(scope, /You are browsing/, 'Needs you request scope explains that the selection is only being browsed');
    await env.saveShot('k-working-on-vs-browsing-1440x900-light');
    c.shot('k-working-on-vs-browsing-1440x900-light');
    c.done();
  }
  {
    const c = check('K.requests-row-source', 'obs', 'SC-006: the partial / unavailable Requests row gives a reason but no "From <source>" line, unlike every other report part', { observation: true });
    await env.open('scenario=M11a&tone=light&controls=hide', VP.w1440, 'light');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now', 5000);
    const now = await ev(P.probeNow);
    const row = now.report.find(entry => entry.label === 'Requests');
    c.note(`Requests row detail lines: ${JSON.stringify(row?.rest)}`);
    c.ok(row?.rest.some(line => /^From /.test(line)), 'Requests row names its source');
    c.done();
  }
  {
    const c = check('K.copy-plural', 'obs', 'Wording: the Overview closing sentence reads "1 closed work items"', { observation: true });
    await env.open('scenario=M1&tone=light&controls=hide', VP.w1440, 'light');
    const text = (await ev(P.probeProductText)).texts.join(' | ');
    const sentence = text.match(/Closed includes [^|]*/)?.[0] ?? '';
    c.note(`observed: ${JSON.stringify(sentence)}`);
    c.absent(sentence, /\b1 (closed|completed) work items\b/, 'plural noun after a count of one');
    c.done();
  }
  {
    const c = check('K.finder-popup-covers-form', 'obs', 'Inherited 062 behavior: Tab from the command-bar search on a non-Overview tab opens the results popup, which stays open and can cover the New work item fields', { observation: true });
    await env.open('scenario=M12-chosen&tone=light&controls=hide', VP.w1440, 'light');
    await pressKey(page, 'Tab'); // the collapsed mock strip's "Show controls"
    await pressKey(page, 'Tab'); // the command-bar search field
    await new Promise(resolve => setTimeout(resolve, 400));
    const state = await ev(() => {
      const textarea = document.querySelector('[data-capture-form] textarea');
      const tr = textarea.getBoundingClientRect();
      const popupRows = [...document.querySelectorAll('[data-work-path]')].filter(node => node.getClientRects().length);
      const hit = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2);
      const coveredBy = popupRows.length ? popupRows[0].closest('[class]')?.getBoundingClientRect() : null;
      return { popupRows: popupRows.length, textareaRect: [tr.x, tr.y, tr.width, tr.height].map(Math.round), hit: hit ? `${hit.tagName}:${(hit.closest('[data-work-path]') ? 'inside results popup' : 'other')}` : null,
        popupFirstRow: popupRows[0] ? [popupRows[0].getBoundingClientRect().x, popupRows[0].getBoundingClientRect().y].map(Math.round) : null, covered: Boolean(hit && !textarea.contains(hit) && !hit.contains(textarea)) };
    });
    c.note(`search focused on the New work item tab: popup rows ${state.popupRows}, textarea at ${JSON.stringify(state.textareaRect)}, element at the textarea center: ${state.hit}`);
    c.note(`same rule in today's product: ${rel(productApp)}:L${lineOf(productApp, /const popupOpen = /).join(',')}; mock source L${lineOf(mockJsx, /const popupOpen = /).join(',')}. Not introduced by 067; it affects the new fields on this keyboard path.`);
    c.ok(!state.covered, 'the focused search field\'s popup does not cover the capture textarea');
    await env.saveShot('k-finder-popup-over-capture-1440x900-light');
    c.shot('k-finder-popup-over-capture-1440x900-light');
    c.done();
  }
  {
    const c = check('K.capture-announcements', 'obs', 'Capture status changes are exposed to assistive technology through a live region (observed with a MutationObserver during each real transition)', { observation: true });
    const live = env.stats.live ?? {};
    for (const [outcome, texts] of Object.entries(live)) {
      c.note(`${outcome}: product live-region text observed ${JSON.stringify(texts.map(text => text.slice(0, 60)))}`);
      c.ok(texts.some(text => /Responding|Awaiting capture delivery|saved|uncertain|Not sent/i.test(text)), `${outcome}: a live region (not the mock strip) announces the status`);
    }
    // Round 2 update: the round 1 note said the statuses had no live region and that the Notice was inherited; the round 2 mock wraps each status
    // in a polite, atomic role=status region. The note is now computed from the files and from what the observer saw, and the ariaNotify channel is named.
    const productImport = path.join(repo, 'src', 'extensions', 'dude', 'frontend', 'artifact-import.jsx');
    const productSources = path.join(repo, 'src', 'extensions', 'dude', 'frontend', 'pack-sources.jsx');
    const statusRegion = /role="status" aria-live="polite" aria-atomic="true"/;
    c.note(`DOM observer (this check) sees only DOM live regions. The mock's capture statuses sit in a polite, atomic role=status wrapper inside each MessageBar body (mock source lines ${lineOf(mockJsx, statusRegion).join(', ')}), the pattern of ${rel(productImport)} line ${lineOf(productImport, statusRegion).join(', ')} and ${rel(productSources)} line ${lineOf(productSources, statusRegion).join(', ')}; today's Needs you Notice (${rel(productNeeds)} lines ${lineOf(productNeeds, /export function Notice/).join(', ')}) has no such wrapper. Fluent's MessageBar also announces on mount through the AriaLiveAnnouncer, which uses document.ariaNotify when the browser provides it (see A.announce-channels for those calls and any text carried by both channels). WCAG 4.1.3 relevance is not asserted by the spec.`);
    if (Object.keys(live).length) c.done();
  }
  {
    const c = check('K.designer-log-binding', 'obs', 'Designer capture-log.json is bounded prior art: it carries no artifact hash and predates the final HTML bytes', { observation: true });
    const log = path.join(designDir, 'screenshots', 'capture-log.json');
    const html = path.join(designDir, 'work-type-presentation.html');
    const text = fs.readFileSync(log, 'utf8');
    const logTime = fs.statSync(log).mtimeMs, htmlTime = fs.statSync(html).mtimeMs;
    c.note(`capture-log.json ${new Date(logTime).toISOString()}, HTML ${new Date(htmlTime).toISOString()} (HTML is ${Math.round((htmlTime - logTime) / 1000)}s newer); hash strings in log: ${(text.match(/[0-9a-f]{64}/g) ?? []).length}`);
    c.ok((text.match(/[0-9a-f]{64}/g) ?? []).length > 0, 'the log binds the bytes it captured');
    c.ok(htmlTime <= logTime, 'the log is at least as new as the HTML');
    c.done();
  }
}
