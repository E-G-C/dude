// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import * as progressEngine from './work-progress.mjs';
import { parseTasks } from './tasks.mjs';

const { workStage, workProgress } = progressEngine;
const IDEA = '.dude/ideas/901-login-timeout-fix.md';
const SPEC = '.dude/specs/901-login-timeout-fix/spec.md';
const TASKS = '.dude/specs/901-login-timeout-fix/tasks.md';
const TRACKED_REASON = 'Tracked work is authoritative and this view does not read it.';
const REQUESTS = { state: 'unavailable', reason: 'This view cannot read current requests.', source: null };
const OPEN = '- [ ] T001@aaaaaaaa Keep the session\n';
const ACTIVE = '- [~] T001@aaaaaaaa Keep the session\n';
const DONE = '- [x] T001@aaaaaaaa Keep the session\n';
const PHASE = 'Phase 2: User Story 1 - Keep the session';

function fixture({ status = 'defined', tasks = OPEN, spec = '# Specification\n', fields = {}, classification = '' } = {}) {
  const parsed = parseTasks(tasks);
  const defined = status === 'defined';
  return {
    item: {
      ideaPath: IDEA, specPath: defined ? SPEC : null, ownerSpecPath: defined ? SPEC : null,
      number: '901', slug: 'login-timeout-fix', status,
      frontmatterAvailable: true, lifecycleAvailable: true,
      resolvedCandidate: status === 'resolved', resolved: status === 'resolved',
      tasksAvailable: defined, unavailableDetail: null,
      taskCounts: {
        total: parsed.tasks.length,
        active: parsed.tasks.filter((task) => task.state === 'in-progress').length,
        blocked: parsed.tasks.filter((task) => task.state === 'blocked').length,
        done: parsed.tasks.filter((task) => task.state === 'done').length,
      },
      ownBlocked: parsed.tasks.some((task) => task.state !== 'done' && (task.state === 'blocked' || task.blockedBy)),
      ...fields,
    },
    ideaBytes: `---\ntitle: Login timeout fix\nslug: login-timeout-fix\nstatus: ${status}\nspec_path: ${defined ? SPEC : ''}\n${classification}---\n\n## Open Questions\n\nAnswer:\n`,
    specBytes: defined ? spec : null,
    tasksBytes: defined ? tasks : null,
  };
}

const stageCases = [
  ['unavailable lifecycle precedes resolved, draft, and tracked', fixture({
    status: 'draft', fields: { lifecycleAvailable: false, resolved: true },
  }), true, null],
  ['unreadable metadata precedes resolved', fixture({
    status: 'resolved', fields: { frontmatterAvailable: false },
  }), false, null],
  ['an invalid resolved shape is unavailable', fixture({
    status: 'resolved', fields: { resolved: false },
  }), false, null],
  ['valid resolved precedes tracked and task availability', fixture({ status: 'resolved' }), true, 'Closed'],
  ['draft precedes tracked and package availability', fixture({ status: 'draft' }), true, 'Captured'],
  ['tracked precedes unavailable tasks and blockers', fixture({
    fields: { tasksAvailable: false, ownBlocked: true, unavailableDetail: 'The task file is unavailable.' },
  }), true, null],
  ['unavailable owner precedes blockers', fixture({
    fields: { ownerSpecPath: null, ownBlocked: true, unavailableDetail: 'The linked feature definition is unavailable or ambiguous.' },
  }), false, null],
  ['unavailable specification precedes tasks', fixture({
    fields: { unavailableDetail: 'The linked feature specification is unavailable.' },
  }), false, null],
  ['unavailable tasks precede completion', fixture({
    tasks: DONE, fields: { tasksAvailable: false, unavailableDetail: 'The task file is unavailable.' },
  }), false, null],
  ['a blocked unfinished task precedes done and active tasks', fixture({
    tasks: `${DONE}- [!] T002@bbbbbbbb Wait\n- [~] T003@cccccccc Work\n`,
  }), false, 'Blocked'],
  ['an unfinished task blocker reason establishes Blocked', fixture({
    tasks: `${OPEN}   blocked-by: external-dependency: waiting\n`,
  }), false, 'Blocked'],
  ['all done tasks establish Completed, ignoring historical blockers', fixture({
    tasks: `${DONE}   blocked-by: historical only\n`,
  }), false, 'Completed'],
  ['an active task establishes In progress', fixture({ tasks: ACTIVE }), false, 'In progress'],
  ['some done tasks establish In progress without live activity', fixture({
    tasks: `${DONE}- [ ] T002@bbbbbbbb Not started\n`,
  }), false, 'In progress'],
  ['only open and ready tasks establish Defined', fixture({
    tasks: `${OPEN}- [ ] T002@bbbbbbbb Ready\n   deps: T001@aaaaaaaa\n`,
  }), false, 'Defined'],
  ['zero tasks establish Defined', fixture({ tasks: '# Tasks\n' }), false, 'Defined'],
];

for (const [name, input, tracked, expected] of stageCases) {
  test(`067 Work type: stage rule ${name}`, () => {
    const before = structuredClone(input);
    assert.equal(workStage(input.item, { tracked }), expected);
    assert.deepEqual(input, before);
  });
}

test('067 Work type: the pure module exports only its two called functions and imports engine siblings', () => {
  assert.deepEqual(Object.keys(progressEngine).sort(), ['workProgress', 'workStage']);
  const source = fs.readFileSync(new URL('./work-progress.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import .+ from '(.+)';$/gm)].map((match) => match[1]), [
    './feature.mjs', './feature-identity.mjs', './tasks.mjs',
  ]);
  assert.doesNotMatch(source, /\b(?:process|Date|fetch|readFileSync|writeFileSync)\b|node:|dude-pack-|canvas/i);
});

for (const [name, input, stage, phases] of [
  ['draft', fixture({ status: 'draft' }), 'Captured', []],
  ['defined without started work', fixture(), 'Defined', []],
  ['one current phase', fixture({ tasks: `# Tasks\n\n## ${PHASE}\n${ACTIVE}` }), 'In progress', [PHASE]],
  ['two concurrent current phases', fixture({
    tasks: `## ${PHASE}\n${ACTIVE}\n### Editing\n- [!] T002@bbbbbbbb Wait\n`,
  }), 'Blocked', [PHASE, 'Editing']],
  ['an active task under no heading', fixture({ tasks: ACTIVE }), 'In progress', []],
  ['blocked', fixture({ tasks: '## Review\n- [!] T001@aaaaaaaa Wait\n' }), 'Blocked', ['Review']],
  ['completed', fixture({ tasks: `## Delivery\n${DONE}` }), 'Completed', []],
  ['closed', fixture({ status: 'resolved' }), 'Closed', []],
]) {
  test(`067 Work type: report for ${name} contains only recorded parts and sources`, () => {
    const before = structuredClone(input);
    const report = workProgress(input);
    const taskBased = input.item.status === 'defined';
    assert.deepEqual(report, {
      subject: { ideaPath: IDEA, specPath: taskBased ? SPEC : null, number: '901', slug: 'login-timeout-fix' },
      words: [],
      stage: { value: stage, reason: null, source: taskBased ? TASKS : IDEA },
      phases: { state: phases.length ? 'current' : 'none', reason: null, source: taskBased ? TASKS : null, items: phases },
      design: null,
      checkpoints: [],
      gates: [],
      requests: REQUESTS,
      unknown: [...(phases.length ? [] : ['phases']), 'design', 'gates'],
    });
    assert.deepEqual(input, before);
  });
}

test('067 Work type: current phases ignore the generated board and terminal history and retain recorded headings', () => {
  const input = fixture({ tasks: [
    '# Tasks',
    '- [~] T001@aaaaaaaa Unphased work',
    '<!-- dude:board:start -->',
    '## Generated heading',
    '- [~] T999@zzzzzzzz Derived task',
    '<!-- dude:board:end -->',
    '## Recorded delivery',
    '- [~] T002@bbbbbbbb Work',
    '- [!] T003@cccccccc Same phase',
    '### Recorded review',
    '- [!] T004@dddddddd Wait',
    '## Lightweight Execution History',
    '## Archived heading',
    '- [~] T005@eeeeeeee Historical task',
    '',
  ].join('\n') });
  const report = workProgress(input);
  assert.deepEqual(report.phases, {
    state: 'current', reason: null, source: TASKS, items: ['Recorded delivery', 'Recorded review'],
  });
  assert.deepEqual(report.requests, REQUESTS);
});

for (const status of ['exploring', 'proposed', 'approved', 'other', '']) {
  test(`067 Work type: design ${status || 'missing'} uses default frontmatter parsing and only recorded checkpoints`, () => {
    const input = fixture({
      tasks: `## ${PHASE}\n${ACTIVE}`,
      spec: `---\nwork_type: design\ndesign_status: ${status}\npreview:\n  path: opaque\n---\n# Design\n`,
    });
    const report = workProgress(input);
    const expected = status === 'other' || !status ? 'unrecognized' : status;
    assert.deepEqual(report.design, { status: expected, reason: null, source: SPEC });
    assert.deepEqual(report.checkpoints, ['proposed', 'approved'].includes(status)
      ? [{ kind: `design-${status}`, source: SPEC }] : []);
    assert.deepEqual(report.gates, status === 'approved' ? [] : [{ kind: 'design-approval', source: SPEC }]);
    assert.deepEqual(report.unknown, status === 'approved' ? ['gates'] : []);
    assert.deepEqual(report.requests, REQUESTS);
  });
}

for (const [name, tasksBytes, reason] of [
  ['unreadable task file', null, 'The task file is unavailable.'],
  ['ambiguous task file', `${DONE}${DONE}`, 'Task state is unavailable because the tasks file is incomplete or ambiguous.'],
]) {
  test(`067 Work type: design proposed survives an ${name}`, () => {
    const input = fixture({
      spec: '---\nwork_type: design\ndesign_status: proposed\n---\n',
      fields: { tasksAvailable: false, unavailableDetail: reason },
    });
    input.tasksBytes = tasksBytes;
    const report = workProgress(input);
    assert.deepEqual(report.stage, { value: null, reason, source: null });
    assert.deepEqual(report.phases, { state: 'unavailable', reason, source: null, items: [] });
    assert.deepEqual(report.design, { status: 'proposed', reason: null, source: SPEC });
    assert.deepEqual(report.checkpoints, [{ kind: 'design-proposed', source: SPEC }]);
    assert.deepEqual(report.gates, [{ kind: 'design-approval', source: SPEC }]);
    assert.deepEqual(report.unknown, []);
    assert.deepEqual(report.requests, REQUESTS);
  });
}

for (const [name, fields, reason] of [
  ['lifecycle', { lifecycleAvailable: false }, 'Lifecycle details are unavailable because idea metadata is ambiguous.'],
  ['owner', { ownerSpecPath: null, specPath: null }, 'The linked feature definition is unavailable or ambiguous.'],
  ['specification', {}, 'The linked feature specification is unavailable.'],
]) {
  test(`067 Work type: unreadable ${name} makes design unavailable, never null or unknown`, () => {
    const input = fixture({ fields: { ...fields, unavailableDetail: reason } });
    input.specBytes = null;
    const report = workProgress(input);
    assert.deepEqual(report.stage, { value: null, reason, source: null });
    assert.deepEqual(report.phases, { state: 'unavailable', reason, source: null, items: [] });
    assert.deepEqual(report.design, { status: 'unavailable', reason, source: null });
    assert.deepEqual(report.checkpoints, []);
    assert.deepEqual(report.gates, []);
    assert.deepEqual(report.unknown, []);
    assert.deepEqual(report.requests, REQUESTS);
  });
}

test('067 Work type: newly unreadable or ambiguous task bytes cannot supply a stage or phase', () => {
  for (const tasksBytes of [null, `${DONE}${DONE}`, '<!-- dude:board:start -->\n']) {
    const report = workProgress({ ...fixture(), tasksBytes });
    assert.equal(report.stage.value, null);
    assert.equal(report.phases.state, 'unavailable');
    assert.equal(report.design, null);
    assert.deepEqual(report.unknown, ['design', 'gates']);
    assert.deepEqual(report.requests, REQUESTS);
  }
});

test('067 Work type: tracked work exposes no mirrored stage or phase but keeps readable design evidence', () => {
  const input = fixture({ tasks: `## Mirror\n${ACTIVE}`, spec: '---\nwork_type: design\ndesign_status: proposed\n---\n' });
  const report = workProgress({ ...input, tracked: true, tasksBytes: null });
  assert.deepEqual(report.stage, { value: null, reason: TRACKED_REASON, source: null });
  assert.deepEqual(report.phases, { state: 'not-exposed', reason: TRACKED_REASON, source: null, items: [] });
  assert.deepEqual(report.design, { status: 'proposed', reason: null, source: SPEC });
  assert.deepEqual(report.checkpoints, [{ kind: 'design-proposed', source: SPEC }]);
  assert.deepEqual(report.gates, [{ kind: 'design-approval', source: SPEC }]);
  assert.deepEqual(report.requests, REQUESTS);
  assert.deepEqual(report.unknown, []);
  for (const status of ['draft', 'resolved']) {
    const untrackedLifecycle = workProgress({ ...fixture({ status }), tracked: true });
    assert.equal(untrackedLifecycle.stage.value, status === 'draft' ? 'Captured' : 'Closed');
    assert.equal(untrackedLifecycle.phases.state, 'none');
    assert.deepEqual(untrackedLifecycle.requests, REQUESTS);
  }
});

for (const [classification, words, name] of [
  ['work_intent: fix\n', ['Fix'], 'fix alone'],
  ['work_intent: create\n', ['New'], 'create alone'],
  ['work_intent: maintain\n', ['Maintenance'], 'maintain alone'],
  ['work_intent: explore\n', ['Exploration'], 'explore alone'],
  ['work_domain: code\n', ['Code'], 'code alone'],
  ['work_domain: design\n', ['Design'], 'design alone'],
  ['work_domain: writing\n', ['Writing'], 'writing alone'],
  ['work_domain: video\n', ['Video'], 'video alone'],
  ['work_domain: code\nwork_intent: fix\n', ['Fix', 'Code'], 'intent before domain'],
  ['', [], 'neither recorded'],
  ['work_intent:\nwork_domain: unknown\n', [], 'empty and unrecognized values'],
  ['work_intent: unknown\nwork_domain: design\n', ['Design'], 'an unrecognized intent with a recognized domain'],
  ['work_intent: fix\nwork_domain: unknown\n', ['Fix'], 'a recognized intent with an unrecognized domain'],
]) {
  test(`067 Work type: classification words show ${name} without placeholders`, () => {
    const report = workProgress(fixture({ classification }));
    assert.deepEqual(report.words, words);
    assert.deepEqual(report.requests, REQUESTS);
  });
}
