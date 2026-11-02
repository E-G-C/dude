// M3-M11 and M14 truth checks plus cross-cutting checks on every fixture and detailed repository record.
import fs from 'node:fs';
import path from 'node:path';
import { P, VP, clickSelector, evalFn, sleep } from './harness.mjs';
import * as O from './oracle.mjs';

const KIND_CLAIMS = [/\bDraft idea\b/i, /\bThis (feature|idea)\b/i, /still an idea/i, /Select a feature/i, /\bNew idea\b/i, /\bSave as idea\b/i,
  /resolved ideas?\b/i, /ideas and features/i, /Captured intent/i, /What you wanted to do/i, /Completed without a package/i, /Intent to retain/i,
  /Capture this intent/i];
const MOCK_GUIDANCE = /Review design|\bmock(up)?s?\b|preview request|review storage|canonical mock/i;
const LIVE_CLAIMS = [/\d+\s?%/, /\b(agents?|Dude)\s+(is|are)\s+(currently\s+)?(working|running|active)\b/i, /\bcurrently\s+(working|running)\b/i, /\bin flight\b/i];
const NONE_ALWAYS = [/\bNone\b/, /nothing is waiting/i, /no admitted request/i];
const NONE_WHEN_UNCERTAIN = [/no requests? (is|are) waiting/i, /no current[^.]*request[^.]*waiting/i, /no current requests/i];
const ALLOWED_ENTRY = /^(Respond to request|Choose request \(\d+\)|Review design|Review design requests)$/;
const apos = text => (text ?? '').replace(/[’‘]/g, "'");
// The mock states what the report is NOT (negated disclaimers). Remove those exact sentences before scanning for affirmative claims.
const DISCLAIMERS = [/In progress is recorded state, not evidence that an agent is working now\./g,
  /Counts are recorded task states\. They don't show live agent activity, verification, review, or release\./g,
  /Recorded states, not live-agent activity\./g, /It doesn't show live agent activity, verification, review, or release\./g,
  /Done is recorded state, not a verification or review result\./g, /Acceptance wording, Done, work item Activity, and design-review history are not task results\./g,
  /Verification and review results/g, /Not exposed by this source\./g];
const withoutDisclaimers = text => DISCLAIMERS.reduce((value, pattern) => value.replace(pattern, ''), apos(text));
// Header + report text with the mock's own negations removed, for scanning affirmative verification / release / delivery claims.
const claimsText = now => withoutDisclaimers([...now.headerText, ...now.reportLines].join(' | '))
  .replace(/isn't a verification, review, or release result/gi, '').replace(/doesn't mean the work was implemented/gi, '');

const labelsOf = now => now.report.map(row => row.label);

async function loadNowByScenario(env, query, vp = VP.w1440, scheme = 'light') {
  await env.open(query, vp, scheme);
  await env.waitFor(() => Boolean(document.querySelector('[data-now]')), `Now for ${query}`, 8000);
  const now = await env.ev(P.probeNow);
  const text = await env.ev(P.probeProductText);
  const strip = await env.ev(P.probeStrip);
  const footer = await env.ev(() => (document.querySelector('footer')?.innerText ?? '').replace(/\s+/g, ' ').trim());
  return { now, text, strip, footer };
}

async function loadNowByRow(env, exp, query = 'scenario=M1&tone=light&controls=hide', vp = VP.w1440) {
  await env.open(query, vp, 'light');
  await clickSelector(env.page, `[data-work-path="${exp.ideaPath}"]`);
  await env.waitFor(() => Boolean(document.querySelector('[data-now]')), `Now for ${exp.ideaPath}`, 8000);
  await sleep(150);
  return { now: await env.ev(P.probeNow), text: await env.ev(P.probeProductText), strip: await env.ev(P.probeStrip),
    footer: await env.ev(() => (document.querySelector('footer')?.innerText ?? '').replace(/\s+/g, ' ').trim()) };
}

/** Cross-cutting assertions that must hold for every Now view. */
function cross(env, acc, label, { now, text }, exp) {
  env.stats.nowViews = (env.stats.nowViews ?? 0) + 1;
  const withLabels = [...text.texts, ...text.labels, ...text.titles].join(' | ');
  // neutral work-item wording (FR-001, FR-002)
  for (const claim of KIND_CLAIMS) acc.neutral.absent(withLabels, claim, `${label} kind claim ${claim}`);
  acc.neutral.eq(now.eyebrow, 'Work item', `${label} eyebrow is neutral`);
  // no live-activity claims, no percentages (FR-031)
  const joined = withoutDisclaimers(text.texts.join(' | '));
  for (const claim of LIVE_CLAIMS) acc.claims.absent(joined, claim, `${label} live/percentage claim ${claim}`);
  // no verification / release claims in the report or header (FR-022, FR-031); negations are allowed
  const reportText = [...now.headerText, ...now.reportLines].join(' | ');
  const cleaned = claimsText(now);
  acc.claims.absent(cleaned, /\b(verified|released|shipped|delivered|reviewed|implemented|approved by)\b/i, `${label} verification/review/release/delivery claim in header or report`);
  // never "None" for requests (FR-029): absolute None-claims always; "no request is waiting" claims whenever coverage is partial or unavailable
  const uncertain = now.report.some(row => row.label === 'Requests');
  for (const claim of NONE_ALWAYS) acc.none.absent(reportText, claim, `${label} None-style claim in header or report`);
  if (uncertain) for (const claim of NONE_WHEN_UNCERTAIN) acc.none.absent(reportText, claim, `${label} says no request is waiting while request coverage is not current`);
  // no dead Change control (FR-017)
  acc.controls.eq(now.editables, 0, `${label} editable controls inside Now`);
  for (const control of now.interactive) {
    acc.controls.ok(ALLOWED_ENTRY.test(control.name), `${label} unexpected header control ${JSON.stringify(control.name)}`);
    acc.controls.absent(control.name, /change|edit|\bset\b|update|classif/i, `${label} control name ${JSON.stringify(control.name)}`);
  }
  if (exp.readable === false) {
    // an unreadable record has nothing to correct: the details say it is unavailable (not Not set) and offer Refresh
    acc.controls.matches(apos(now.correction), /couldn't be read, so its intent, domain, and stage are unavailable rather than Not set/, `${label} unavailable explanation`);
  } else {
    acc.controls.matches(now.correction, /Ask Dude in chat to set or change the intent or domain/, `${label} chat correction instruction`);
    acc.controls.matches(apos(now.correction), /doesn't change the stage or start any work/, `${label} correction promises no stage change`);
  }
  // gates (FR-028): design approval is the only gate, only while design is not approved
  const gates = now.report.filter(row => row.label === 'Required gate');
  const wantGate = exp.design && exp.design.status !== 'approved' ? 1 : 0;
  acc.gates.eq(gates.length, wantGate, `${label} required-gate rows`);
  for (const gate of gates) acc.gates.eq(gate.value, 'Design approval', `${label} gate is design approval`);
  // unknowns: one readable sentence, no empty rows (FR-030)
  acc.unknown.ok(now.unknown.length <= 1, `${label} unknown sentences: ${now.unknown.length}`);
  for (const row of now.report) {
    acc.unknown.ok(!row.empty && row.value, `${label} report row ${row.label} is empty`);
    acc.unknown.absent(row.value, /^(None|N\/A|—|-|Unknown)$/i, `${label} report row ${row.label} value`);
  }
  if (now.unknown[0]) {
    acc.unknown.eq(O.sentenceCount(now.unknown[0]), 1, `${label} unknown summary is one sentence`);
    acc.unknown.matches(now.unknown[0], /\.$/, `${label} unknown summary ends as a sentence`);
  }
  if (exp.readable !== false && exp.stage !== 'Captured') {
    const wantPhase = !exp.tracked && exp.phases.length === 0;
    const wantDesign = !exp.design;
    const wantGateWord = wantGate === 0;
    const sentence = now.unknown[0] ?? '';
    acc.unknown.eq(Boolean(sentence), wantPhase || wantDesign || wantGateWord, `${label} summary present exactly when a part lacks evidence`);
    if (sentence) {
      acc.unknown.eq(/phase/i.test(sentence), wantPhase, `${label} summary mentions phase iff no phase is recorded`);
      acc.unknown.eq(/design status/i.test(sentence), wantDesign, `${label} summary mentions design status iff none is recorded`);
      acc.unknown.eq(/gate/i.test(sentence), wantGateWord, `${label} summary mentions gate iff none is required`);
    }
  }
  // each evidenced part names its source (FR-025, SC-006)
  for (const row of now.report) {
    if (row.label === 'Stage' && row.value === 'Unavailable') continue; // nothing was read, so there is no source to name
    if (['Stage', 'Current phase', 'Current phases', 'Phase', 'Design status', 'Required gate', 'Waiting for you'].includes(row.label)) {
      acc.sources.ok(row.rest.some(line => /^From /.test(line)), `${label} report row ${row.label} names its source (${JSON.stringify(row.rest)})`);
    }
  }
  // mock / Review guidance only for design workflow or a current preview request (FR-003)
  const hasPreview = now.reviewEntry !== null;
  if (!exp.design && !hasPreview) acc.guidance.absent([...now.headerText, ...now.reportLines].join(' | '), MOCK_GUIDANCE, `${label} mock/Review guidance on a non-design record`);
}

export async function nowChecks(env) {
  const { oracle, ev, check, page } = env;
  const fx = new Map(oracle.fixtures.map(entry => [entry.ideaPath, entry]));
  const acc = {
    neutral: check('N.X-neutral', 'M3-M14', 'Neutral work-item wording: no record is called an idea or feature; Now eyebrow is "Work item" (every fixture and detailed repository record)'),
    claims: check('N.X-claims', 'M3-M14', 'No live-agent, percentage, verification, review, release, or delivery claims in header or report'),
    none: check('N.X-none', 'M3-M14', 'Request status is never rendered as None / nothing waiting in header or report'),
    controls: check('N.X-controls', 'M3-M14', 'Correction is an Ask-in-chat instruction; no Change/Edit control or editable field exists in Now'),
    gates: check('N.X-gates', 'M3-M14', 'Design approval is the only required gate, and only while design is not approved'),
    unknown: check('N.X-unknown', 'M3-M14', 'Parts without evidence collapse into exactly one readable sentence; no empty rows'),
    sources: check('N.X-sources', 'M3-M14', 'Every evidenced report part names its source'),
    guidance: check('N.X-guidance', 'M3-M14', 'Mock / Review guidance appears only for design-workflow records or a current preview request'),
  };

  /* ---------------- every fixture, opened by clicking its row (feed: requests) */
  const loaded = new Map();
  for (const exp of oracle.fixtures) {
    const result = await loadNowByRow(env, exp);
    loaded.set(exp.ideaPath, result);
    cross(env, acc, `fixture ${exp.number}`, result, exp);
    acc.provenance ??= check('N.X-provenance', 'M1', 'Fixture identification stays visible in every fixture Now view: collapsed strip names the fixture set; expanded strip names the exact fixture and says every value is fixture data');
    acc.provenance.matches(result.strip.text, /Acceptance fixtures \(901 to 913\)/, `fixture ${exp.number} collapsed strip names the fixture set`);
    const expanded = await loadNowByRow(env, exp, 'scenario=M1&tone=light');
    acc.provenance.matches(expanded.strip.text, new RegExp(`Showing fixture ${exp.id} \\(${exp.number}\\)`), `fixture ${exp.number} expanded strip names the fixture`);
    acc.provenance.matches(expanded.strip.text, /Every value on this record is fixture data/, `fixture ${exp.number} expanded strip says every value is fixture data`);
    acc.provenance.ok(expanded.strip.rect[1] >= 0 && expanded.strip.rect[1] + expanded.strip.rect[3] <= 900, `fixture ${exp.number} expanded strip is inside the viewport`);
  }

  /* ---------------- scenarios M3 .. M14 */
  const snap = new Map(oracle.snapshot.map(entry => [entry.ideaPath, entry]));
  const repoExp = path => {
    const entry = snap.get(path);
    return { ...entry, readable: true, tracked: entry.lane === 'tracked', phases: [], design: entry.design };
  };

  // M3: captured draft, Not set, repository 087
  {
    const c = check('N.M3', 'M3', 'M3 captured draft (repository 087): neutral eyebrow, Not set, one summary sentence, chat instruction, no mock guidance');
    const r = await loadNowByScenario(env, 'scenario=M3&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M3', r, repoExp('.dude/ideas/087-dude-canvas-routing-map.md'));
    c.eq(now.path, '.dude/ideas/087-dude-canvas-routing-map.md', 'selected record');
    c.eq(now.facts, { Intent: 'Not set', Domain: 'Not set', Stage: 'Captured' }, 'Intent / Domain / Stage');
    c.eq(now.unknown.length, 1, 'one summary sentence');
    c.matches(now.unknown[0] ?? '', /No definition, phase, or required gate is recorded yet\./, 'captured-draft summary says no definition, phase, or gate is recorded yet');
    c.eq(labelsOf(now), ['Stage'], 'only the evidenced Stage row is shown (no empty rows)');
    c.eq(now.reviewEntry, null, 'no Review entry');
    c.eq(now.interactive.length, 0, 'no header actions on a captured draft');
    c.absent([...now.headerText, ...now.reportLines, ...now.nextText].join(' | '), MOCK_GUIDANCE, 'mock / Review guidance text');
    c.absent(r.text.texts.join(' | '), /Define this draft explicitly|canonical mock|review storage/i, 'old Review guidance for drafts');
    c.matches(r.now.correction, /Ask Dude in chat to set or change the intent or domain\./, 'chat correction instruction');
    c.matches(r.now.reportLines.join(' '), /Recorded lifecycle state only\./, 'records lifecycle state only');
    await env.saveShot('m3-now-087-1440x900-light'); c.shot('m3-now-087-1440x900-light');
    c.done();
  }

  // M4: design definition with a live approval request
  {
    const c = check('N.M4', 'M4', 'M4 design definition (fixture 904): design status, the design approval gate, Waiting for you, Respond to request');
    const r = await loadNowByScenario(env, 'scenario=M4&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M4', r, fx.get('.dude/ideas/904-settings-page-redesign.md'));
    c.eq(now.facts, { Intent: 'Create', Domain: 'Design', Stage: 'Defined' }, 'Intent / Domain / Stage');
    c.eq(labelsOf(now), ['Stage', 'Design status', 'Required gate', 'Waiting for you'], 'report rows in order');
    const design = now.report.find(row => row.label === 'Design status');
    c.eq(design?.value, 'Proposed', 'recorded design status');
    c.ok(apos(design?.rest.join(' ')).includes('Checkpoint reached: design proposed.'), 'Proposed is shown as a reached checkpoint');
    c.eq(now.report.filter(row => row.label === 'Required gate').length, 1, 'exactly one required gate');
    c.eq(now.report.find(row => row.label === 'Required gate')?.value, 'Design approval', 'the gate is design approval');
    const waiting = now.report.find(row => row.label === 'Waiting for you');
    c.eq(waiting?.value, 'Design review from dude', 'Waiting for you names the request kind and owner');
    c.ok(apos(waiting?.rest.join(' ')).includes("A current request. It adds no gate and doesn't change the stage."), 'Waiting for you adds no gate and keeps the stage');
    c.eq(now.requestEntry, 'rq-904-design-review', 'Respond to request targets the exact request');
    c.eq(now.reviewEntry, 'rq-904-design-review', 'Review design is offered for the design definition with a preview request');
    c.eq(now.interactive.map(control => control.name), ['Respond to request', 'Review design'], 'header actions');
    await env.saveShot('m4-now-904-1440x900-light'); c.shot('m4-now-904-1440x900-light');
    // Review design is an existing, unchanged entry: in this mock it reports a mock action and opens nothing
    const expanded = await loadNowByScenario(env, 'scenario=M4&tone=light');
    await clickSelector(page, '[data-review-entry]');
    await sleep(200);
    const logged = await ev(P.probeStrip);
    c.matches(apos(logged.log), /Mock action: Review design opens the existing Review workspace for rq-904-design-review\. Review is unchanged by 067 and isn't part of this mock, so nothing opened\./, 'Review design reports a labeled mock action');
    c.ok(await ev(() => Boolean(document.querySelector('[data-now]'))), 'Review design leaves the user on Now (nothing opened)');
    await env.open('scenario=M4&tone=light&controls=hide', VP.w1440, 'light');
    await env.waitFor(() => Boolean(document.querySelector('[data-now]')), 'Now again', 5000);
    // Respond opens Needs you on that request; Review design reports a mock action only
    await clickSelector(page, '[data-request-entry]');
    await env.waitFor(() => Boolean(document.querySelector('[data-request]')), 'Needs you request', 5000);
    const opened = await ev(() => ({ handle: document.querySelector('[data-request]')?.getAttribute('data-request'), h1: document.querySelector('[data-request] h1')?.textContent,
      lead: document.querySelector('[data-request] p')?.textContent, badge: document.querySelector('[data-request] .fui-Badge')?.textContent }));
    c.eq(opened.handle, 'rq-904-design-review', 'Respond to request opens the matching request in Needs you');
    c.eq(opened.badge, 'Design review', 'request kind label');
    // idle feed: design record without a request keeps FR-003 guidance and no Waiting row
    const idle = await loadNowByScenario(env, 'scenario=M4&tone=light&controls=hide&feed=idle');
    c.eq(labelsOf(idle.now), ['Stage', 'Design status', 'Required gate'], 'idle feed: no Waiting for you row');
    c.ok(idle.now.headerText.some(line => /No current owner-qualified preview request is waiting for this record\./.test(line)), 'idle feed: design record explains no preview request is waiting (coverage is current)');
    c.eq(idle.now.reviewEntry, null, 'idle feed: no Review button');
    c.done();
  }

  // M5: one current phase, docked task detail at 1080px and wider
  {
    const c = check('N.M5', 'M5', 'M5 one current phase (fixture 901): phase from its recorded heading; docked task detail at >=1080px, in-flow below');
    const exp = fx.get('.dude/ideas/901-retry-failed-uploads.md');
    for (const [vp, docked] of [[VP.w1440, true], [VP.w1280, true], [VP.w1080, true], [VP.w1079, false], [VP.w768, false]]) {
      const r = await loadNowByScenario(env, 'scenario=M5&tone=light&controls=hide', vp);
      const { now } = r;
      if (vp === VP.w1440) {
        cross(env, acc, 'M5', r, exp);
        c.eq(now.facts, { Intent: 'Fix', Domain: 'Code', Stage: 'In progress' }, 'Intent / Domain / Stage');
        c.eq(labelsOf(now).filter(label => /phase/i.test(label)), ['Current phase'], 'one current phase row');
        c.eq(now.report.find(row => row.label === 'Current phase')?.value, 'Retry and regression test', 'phase name comes from the recorded heading "Phase 2: Retry and regression test"');
        c.eq(now.taskPhases.map(phase => phase.heading), ['Phase 1: Reproduce', 'Phase 2: Retry and regression test', 'Phase 3: Polish'], 'recorded phase headings are shown unchanged in Tasks');
        c.ok(now.reportLines.some(line => /^2 pending · 1 in progress · 0 blocked · 2 done$/.test(line)), 'counts are shown as counts only');
        c.matches(apos(now.reportLines.join(' ')), /Counts are recorded task states\. They don't show live agent activity, verification, review, or release\./, 'phase/counts carry the not-live-activity disclaimer');
        c.matches(apos(now.taskDetail?.text.join(' ')), /In progress is recorded state, not evidence that an agent is working now\./, 'task detail says in progress is not evidence of agent activity');
        await env.saveShot('m5-now-901-docked-1440x900-light'); c.shot('m5-now-901-docked-1440x900-light');
      }
      c.eq(now.taskDetail?.key, 'T003@9010f003', `${vp.id}: task detail is open`);
      c.eq(now.taskDetail?.docked, docked, `${vp.id}: task detail docked=${docked}`);
      c.eq(now.taskDetail?.inFlow, !docked, `${vp.id}: task detail in-flow=${!docked}`);
    }
    c.done();
  }

  // M6: two current phases
  {
    const c = check('N.M6', 'M6', 'M6 two current phases (fixture 902): both phases named; blank answer slot shows no waiting indicator');
    const r = await loadNowByScenario(env, 'scenario=M6&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M6', r, fx.get('.dude/ideas/902-onboarding-guide-rewrite.md'));
    const row = now.report.find(entry => entry.label === 'Current phases');
    c.ok(Boolean(row), 'plural "Current phases" row exists');
    c.eq(row?.items, ['Draft', 'Fact check'], 'both current phases are named');
    c.eq(now.report.filter(entry => /Current phase/.test(entry.label)).length, 1, 'phases appear in one row');
    c.ok(!now.report.some(entry => entry.label === 'Waiting for you'), 'no Waiting for you row while an unanswered question exists');
    c.matches(now.aside.join(' '), /Open questions: 1\. These are not current requests\./, 'unanswered question is explained as not a current request');
    await env.saveShot('m6-now-902-1440x900-light'); c.shot('m6-now-902-1440x900-light');
    c.done();
  }

  // M7: blocked, plan gap
  {
    const c = check('N.M7', 'M7', 'M7 blocked work (fixture 903): Blocked, blocker class and reason, the blocked phase is current');
    const r = await loadNowByScenario(env, 'scenario=M7&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M7', r, fx.get('.dude/ideas/903-launch-video-storyboard.md'));
    c.eq(now.facts.Stage, 'Blocked', 'stage');
    c.ok(now.blockers?.includes('Plan gap'), `blocker class "Plan gap" shown (${JSON.stringify(now.blockers)})`);
    c.ok(now.blockers?.some(line => line === 'the plan does not say who records the voice-over or when'), 'blocker reason shown');
    c.ok(now.blockers?.some(line => /tasks\.md · T002@9030f002/.test(line)), 'blocker names its source task');
    c.eq(now.report.find(row => row.label === 'Current phase')?.value, 'Storyboard', 'the phase holding the blocked task is current');
    c.ok(!now.report.some(row => row.label === 'Waiting for you' || row.label === 'Required gate'), 'a blocker is neither a waiting request nor a gate');
    await env.saveShot('m7-now-903-1440x900-light'); c.shot('m7-now-903-1440x900-light');
    c.done();
  }

  // M8: all tasks done (repository 066)
  {
    const c = check('N.M8', 'M8', 'M8 all tasks done (repository 066): Completed, no verification / review / release claim');
    const r = await loadNowByScenario(env, 'scenario=M8&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M8', r, repoExp('.dude/ideas/066-canvas-without-beads.md'));
    c.eq(now.facts, { Intent: 'Not set', Domain: 'Not set', Stage: 'Completed' }, 'Intent / Domain / Stage');
    c.ok(now.reportParagraphs.some(text => apos(text) === "Every recorded task is done. That isn't a verification, review, or release result."), 'Completed states it is not a verification, review, or release result');
    c.absent(r.text.texts.join(' | '), /\bVerified\b|Completed without a package/, 'old Verified / Completed-without-a-package wording');
    c.absent(claimsText(now), /\b(release[sd]?|shipped|delivered|merged)\b/i, 'release wording in header or report (negations removed)');
    c.done();
  }

  // M9: resolved without a package (repository 078)
  {
    const c = check('N.M9', 'M9', 'M9 closed without a package (repository 078): Closed, closing does not mean implemented, no delivery claim');
    const r = await loadNowByScenario(env, 'scenario=M9&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M9', r, repoExp('.dude/ideas/078-dude-canvas-pack-sources.md'));
    c.eq(now.facts.Stage, 'Closed', 'stage');
    c.ok(now.reportParagraphs.some(text => apos(text) === "Closed without a definition package. Closing doesn't mean the work was implemented."), 'Closed explains that closing does not mean implemented');
    c.eq(now.report.find(row => row.label === 'Stage')?.value, 'Closed', 'progress report stage');
    c.absent(r.text.texts.join(' | '), /\bCompleted\b/, 'Completed wording on a closed record');
    c.ok(now.taskPhases.length === 0, 'no task groups are invented for a record with no package');
    c.done();
  }

  // M10: tracked work, phase not exposed
  {
    const c = check('N.M10', 'M10', 'M10 tracked work (fixture 907): Phase is explicitly "Not exposed", never back-filled from Markdown');
    const exp = fx.get('.dude/ideas/907-style-guide-refresh.md');
    const r = await loadNowByScenario(env, 'scenario=M10&tone=light&controls=hide');
    const { now } = r;
    cross(env, acc, 'M10', r, exp);
    const phase = now.report.find(row => row.label === 'Phase');
    c.eq(phase?.value, 'Not exposed', 'Phase value');
    c.ok(apos(phase?.rest.join(' ')).includes("The tracked board records no phases, and Canvas doesn't fill them in from tasks.md."), 'explains that Canvas does not back-fill phases from tasks.md');
    c.ok(phase?.rest.some(line => /tracked board/.test(line)), 'names the tracked board as the source');
    c.ok(!now.report.some(row => /^Current phase/.test(row.label)), 'no Current phase row for tracked work');
    c.eq(now.taskPhases.map(group => group.heading), ['Phase not exposed'], 'tasks stay under "Phase not exposed" and show no Markdown phase headings');
    c.eq(now.facts.Stage, 'In progress', 'stage is derived from tracked task states');
    c.ok(!(r.text.texts.join(' | ')).match(/Phase \d+:/), 'no "Phase N:" heading appears anywhere');
    await env.saveShot('m10-now-907-1440x900-light'); c.shot('m10-now-907-1440x900-light');
    c.done();
  }

  // M11a: partial request source
  {
    const c = check('N.M11a', 'M11', 'M11 partial request source (fixture 910): Status partial with its reason, never None');
    const r = await loadNowByScenario(env, 'scenario=M11a&tone=light&controls=hide');
    const { now, footer } = r;
    cross(env, acc, 'M11a', r, fx.get('.dude/ideas/910-customer-faq-refresh.md'));
    const requests = now.report.find(row => row.label === 'Requests');
    c.eq(requests?.value, 'Status partial', 'Requests value');
    c.ok(apos(requests?.rest.join(' ')).includes('Requests from one owner could not be read.'), 'states why the feed is partial');
    c.ok(apos(requests?.rest.join(' ')).includes('Other requests for this work item may be missing.'), 'says other requests may be missing');
    c.ok(now.report.some(row => row.label === 'Waiting for you'), 'the request that was read is still shown as Waiting for you');
    c.matches(footer, /Current request coverage: partial/, 'footer reports partial coverage');
    await env.saveShot('m11a-now-910-partial-1440x900-light'); c.shot('m11a-now-910-partial-1440x900-light');
    c.done();
  }

  // M11b: unavailable request source (repository 067, design record)
  {
    const c = check('N.M11b', 'M11', 'M11 unavailable request source (repository 067): Status unavailable, never None; design record keeps its design gate');
    const r = await loadNowByScenario(env, 'scenario=M11b&tone=light&controls=hide');
    const { now, footer } = r;
    cross(env, acc, 'M11b', r, repoExp('.dude/ideas/067-work-type-presentation.md'));
    const requests = now.report.find(row => row.label === 'Requests');
    c.eq(requests?.value, 'Status unavailable', 'Requests value');
    let cause = null; // round 2 update: this explanation is attached only when the absence claim is actually observed (it was attached unconditionally in round 1)
    {
      const lines = (file, pattern) => fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line, index) => (pattern.test(line) ? index + 1 : 0)).filter(Boolean);
      const mockFile = path.join(env.designDir, 'source', 'work-type-presentation.jsx');
      const productFile = path.join(env.repo, 'src', 'extensions', 'dude', 'frontend', 'needs-you.jsx');
      cause = `cause: mock ${path.relative(env.repo, mockFile).split(path.sep).join('/')}:L${lines(mockFile, /No current owner-qualified preview request is waiting/).join(',')} ReviewEntry returns that sentence for every non-matching feed, including coverage unavailable (L${lines(mockFile, /feed\.coverage\.state === 'unavailable' \? \[\]/).join(',')}); today's product src/extensions/dude/frontend/needs-you.jsx:L${lines(productFile, /preview owner or Review capability is unavailable/).join(',')} says "The current preview owner or Review capability is unavailable." in that case and keeps the "No current owner-qualified..." sentence (L${lines(productFile, /No current owner-qualified preview request/).join(',')}) for current coverage only.`;
    }
    c.ok(apos(requests?.rest.join(' ')).includes('Current requests require a live owner handoff.'), 'states why requests are unavailable');
    c.ok(apos(requests?.rest.join(' ')).includes("Canvas can't tell whether anything is waiting for you."), 'says Canvas cannot tell whether anything is waiting');
    c.ok(!now.report.some(row => row.label === 'Waiting for you'), 'no Waiting for you row without request evidence');
    c.eq(now.requestEntry, null, 'no Respond to request entry');
    c.matches(footer, /Current request coverage unavailable/, 'footer reports unavailable coverage');
    c.eq(now.report.find(row => row.label === 'Design status')?.value, 'Exploring', 'recorded design status Exploring is shown');
    c.eq(now.report.find(row => row.label === 'Required gate')?.value, 'Design approval', 'design approval is the required gate');
    c.matches(now.aside.join(' '), /Open questions: 8\. These are not current requests\./, 'eight blank answer slots are not shown as waiting');
    // The contradiction: unavailable coverage must not be contradicted by a "no preview request is waiting" statement.
    const claim = apos([...now.headerText, ...now.reportLines].join(' | ')).match(/No current owner-qualified preview request is waiting for this record\./);
    c.ok(!claim, 'with request coverage unavailable, the page must not also state that no preview request is waiting for this record'
      + (claim ? ' (header says: "No current owner-qualified preview request is waiting for this record." while the Requests row says Status unavailable)' : ''));
    await env.saveShot('m11b-now-067-unavailable-1440x900-light'); c.shot('m11b-now-067-unavailable-1440x900-light');
    const partial = await loadNowByScenario(env, 'scenario=M11b&tone=light&controls=hide&feed=partial');
    const pReq = partial.now.report.find(row => row.label === 'Requests');
    c.eq(pReq?.value, 'Status partial', 'repository 067 with the partial feed: Requests value');
    const pClaim = apos(partial.now.headerText.join(' | ')).match(/No current owner-qualified preview request is waiting for this record\./);
    c.ok(!pClaim, 'with request coverage partial, the page must not state that no preview request is waiting for this record'
      + (pClaim ? ' (observed with ?feed=partial)' : ''));
    if (claim || pClaim) c.note(cause);
    await env.saveShot('m11b-now-067-partial-feed-1440x900-light'); c.shot('m11b-now-067-partial-feed-1440x900-light');
    c.done();
  }

  // M14a / M14b: current blocking / advisory request without the design workflow
  for (const [scenario, path, handle, owner, stage, note] of [
    ['M14a', '.dude/ideas/910-customer-faq-refresh.md', 'rq-910-clarification', 'dude-spec-lead', 'In progress', null],
    ['M14b', '.dude/ideas/911-evaluate-hosting-providers.md', 'rq-911-clarification', 'dude', 'Defined', 'Recorded for later'],
  ]) {
    const c = check(`N.${scenario}`, 'M14', `${scenario} current ${scenario === 'M14a' ? 'blocking' : 'advisory'} request, no design workflow: Waiting for you as supporting detail, no gate, no blocker`);
    const r = await loadNowByScenario(env, `scenario=${scenario}&tone=light&controls=hide`);
    const { now } = r;
    cross(env, acc, scenario, r, fx.get(path));
    const waiting = now.report.filter(row => row.label === 'Waiting for you');
    c.eq(waiting.length, 1, 'exactly one Waiting for you row (only this record\'s request)');
    c.eq(waiting[0]?.value, `Clarification from ${owner}`, 'request kind and owner');
    c.ok(apos(waiting[0]?.rest.join(' ')).includes("A current request. It adds no gate and doesn't change the stage."), 'supporting detail adds no gate');
    c.ok(waiting[0]?.rest.some(line => line.includes(handle)), 'request source names the request handle');
    c.ok(!now.report.some(row => row.label === 'Required gate'), 'no required gate');
    c.eq(now.blockers, null, 'no recorded blocker section');
    c.eq(now.facts.Stage, stage, 'stage is unchanged by the request');
    if (note) c.ok(now.report.find(row => row.label === 'Stage')?.rest.includes(note), 'order note stays beside the stage');
    c.eq(now.requestEntry, handle, 'Respond to request targets the exact request');
    c.eq(now.reviewEntry, null, 'no Review entry for a non-preview request');
    await clickSelector(page, '[data-request-entry]');
    await env.waitFor(() => Boolean(document.querySelector('[data-request]')), 'Needs you request', 5000);
    c.eq(await ev(() => document.querySelector('[data-request]')?.getAttribute('data-request')), handle, 'Respond to request opens the request in Needs you');
    await env.saveShot(`${scenario.toLowerCase()}-now-${path.match(/\/(\d{3})-/)[1]}-1440x900-light`.replace('.md', '')); 
    c.done();
  }

  // blank answer slots and non-requests (draft with questions), unreadable, unrecognized, intent-only
  {
    const c = check('N.records', 'M3-M14', 'Edge-case records: unrecognized, unreadable, intent-only, draft with open questions, unmet dependency, all-done, closed');
    const get = number => loaded.get([...fx.keys()].find(key => key.includes(`/${number}-`)));
    const r909 = get('909').now;
    c.eq(r909.facts, { Intent: 'Unrecognized', Domain: 'Design', Stage: 'Defined' }, '909 unrecognized intent is record-local and Domain still reads Design');
    c.matches(apos(r909.correction), /The saved intent isn't a value Dude recognizes\./, '909 correction explains the unrecognized value');
    c.eq(r909.reviewEntry, null, '909 Design domain without the design workflow shows no Review entry');
    c.ok(!r909.headerText.join(' ').match(MOCK_GUIDANCE), '909 shows no mock guidance');
    const r912 = get('912').now;
    c.eq(r912.facts, { Intent: 'Unavailable', Domain: 'Unavailable', Stage: 'Unavailable' }, '912 unreadable record is Unavailable, not Not set');
    c.matches(apos(r912.correction), /couldn't be read, so its intent, domain, and stage are unavailable rather than Not set/, '912 correction explains unavailability');
    const r906 = get('906').now;
    c.eq(r906.facts, { Intent: 'Explore', Domain: 'Not set', Stage: 'Closed' }, '906 intent-only record');
    c.ok(r906.reportParagraphs.some(text => /Closing doesn.t mean the work was implemented/.test(text)), '906 closed record explains closing');
    const r908 = get('908').now;
    c.eq(r908.facts, { Intent: 'Not set', Domain: 'Not set', Stage: 'Captured' }, '908 captured draft');
    c.ok(!r908.report.some(row => row.label === 'Waiting for you'), '908 with two unanswered questions shows no Waiting for you');
    c.matches(r908.aside.join(' '), /Open questions: 2\. These are not current requests\./, '908 explains open questions are not requests');
    const r913 = get('913').now;
    c.eq(r913.facts.Stage, 'Defined', '913 with an unmet declared dependency stays Defined');
    c.ok(r913.report.find(row => row.label === 'Stage')?.rest.includes('Waiting on a declared dependency'), '913 dependency note stays beside the stage');
    const r909b = get('909').now;
    c.eq(r909b.report.find(row => row.label === 'Stage')?.value, 'Defined', '909 open/ready tasks alone never establish In progress');
    const r905 = get('905').now;
    c.eq(r905.facts.Stage, 'Completed', '905 all tasks done is Completed');
    c.done();
  }

  // detailed repository records through the repository list (085 too)
  {
    const c = check('N.repo-not-set', 'M1', 'Actual repository records read Not set in details (066, 067, 078, 085, 087)');
    for (const path of ['.dude/ideas/066-canvas-without-beads.md', '.dude/ideas/067-work-type-presentation.md', '.dude/ideas/078-dude-canvas-pack-sources.md',
      '.dude/ideas/085-dude-canvas-app-theme.md', '.dude/ideas/087-dude-canvas-routing-map.md']) {
      const exp = repoExp(path);
      const result = await loadNowByRow(env, exp, 'scenario=S3&tone=light&controls=hide');
      cross(env, acc, `repository ${exp.number}`, result, exp);
      c.eq([result.now.facts.Intent, result.now.facts.Domain], ['Not set', 'Not set'], `${exp.number} Intent and Domain`);
      c.eq(result.now.facts.Stage, exp.stage ?? 'Unavailable', `${exp.number} stage equals the shared rule applied to the snapshot`);
      c.matches(result.strip.text, /This repository \(read-only snapshot\)/, `${exp.number} collapsed strip says this is the read-only repository snapshot`);
      const expanded = await loadNowByRow(env, exp, 'scenario=S3&tone=light');
      c.matches(expanded.strip.text, /Showing repository record .* No ledger records an intent or domain, so both read Not set\./, `${exp.number} expanded strip labels the record as a repository record read Not set`);
    }
    c.done();
  }

  for (const entry of Object.values(acc)) entry.done();
}
