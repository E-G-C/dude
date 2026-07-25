// @ts-check
/**
 * Integration test for the beads pack script. Because beads.mjs imports the core
 * engine at `../dude-engine/lib/...` (a path that only resolves once installed
 * under `.github/skills/`), this test STAGES the installed layout in a temp dir
 * and spawns the script — exactly how it runs after `@dude add pack beads`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJson, sha256 } from '../../../../../src/skills/dude-work/recovery.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');
const engineSrc = path.join(repo, '.github', 'skills', 'dude-engine');
const recoverySrc = path.join(repo, 'src', 'skills', 'dude-work', 'recovery.mjs');
const beadsSrc = path.join(here, 'beads.mjs');
const SPEC_PATH = '.dude/specs/x/spec.md';
const RECOVERY_SPEC_PATH = '.dude/specs/004-pre-work-log-learning/spec.md';
const IDEA_PATH = '.dude/ideas/x.md';
const POSIX_SKIP = process.platform === 'win32'
  ? 'requires POSIX symbolic-link and FIFO semantics'
  : false;

const FIXTURE = `## Setup
- [x] T001@aaaaaaaa Setup

## Foundational
- [ ] T002@bbbbbbbb [US1] Schema
   deps: T001@aaaaaaaa

## User Story 1
- [~] T003@cccccccc [US1] Build the "core"
- [!] T004@dddddddd [US1] Blocked bit
   blocked-by: waiting
`;

function ideaLedger(specPath = SPEC_PATH, status = 'defined', idea = 'Test idea.') {
  const specLine = specPath === null ? '' : `spec_path: ${specPath}\n`;
  return `---\nstatus: ${status}\n${specLine}---\n\n## Idea\n\n${idea}\n\n## Coordinator Log\n\n- Existing log entry.\n`;
}

/** @param {string} src @param {string} dest */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

/** @param {string} root @param {string} relPath @param {string} content */
function writeFixture(root, relPath, content) {
  const absolutePath = path.join(root, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

/** Stage the installed .github/skills layout + a tasks.md fixture. */
function stage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-beads-'));
  const skills = path.join(root, '.github', 'skills');
  copyDir(engineSrc, path.join(skills, 'dude-engine'));
  fs.mkdirSync(path.join(skills, 'dude-work'), { recursive: true });
  fs.copyFileSync(recoverySrc, path.join(skills, 'dude-work', 'recovery.mjs'));
  fs.mkdirSync(path.join(skills, 'dude-pack-beads-workflow'), { recursive: true });
  fs.copyFileSync(beadsSrc, path.join(skills, 'dude-pack-beads-workflow', 'beads.mjs'));
  const file = path.join(root, '.dude', 'specs', 'x', 'tasks.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, FIXTURE);
  fs.writeFileSync(path.join(path.dirname(file), 'spec.md'), '# Spec X\n');
  const idea = path.join(root, ...IDEA_PATH.split('/'));
  fs.mkdirSync(path.dirname(idea), { recursive: true });
  fs.writeFileSync(idea, ideaLedger());
  const emptyBd = path.join(root, 'empty-bd-list.json');
  fs.writeFileSync(emptyBd, '[]\n');
  return { root, script: path.join(skills, 'dude-pack-beads-workflow', 'beads.mjs'), file, idea, emptyBd };
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** @param {ReturnType<typeof stage>} fixture */
async function importStagedBeads(fixture) {
  return import(pathToFileURL(fixture.script).href);
}

function recoveryIssue(id, taskKey, overrides = {}) {
  return {
    id,
    title: taskKey ? `${taskKey} ${id}` : `Discovered ${id}`,
    description: `spec: ${RECOVERY_SPEC_PATH}\n${taskKey ? `Task: ${taskKey}` : 'Discovered work'}`,
    status: 'open', priority: 2, issue_type: 'task',
    ...overrides,
  };
}

function recoveryDetail(issue, overrides = {}) {
  return JSON.stringify([{
    ...issue,
    design: 'Observed design', acceptance_criteria: 'Observed acceptance',
    notes: 'Observed note', owner: 'tester',
    created_at: '2026-07-19T00:00:00Z', created_by: 'fixture',
    updated_at: '2026-07-19T00:02:00Z',
    metadata: { team: 'recovery' }, labels: ['recovery'],
    ...overrides,
  }]);
}

function recoveryHistoryEvents(issue) {
  const current = JSON.parse(recoveryDetail(issue))[0];
  return [
    { CommitHash: `${issue.id}-new`, Committer: 'tester', CommitDate: '2026-07-19T00:02:00Z', Issue: current },
    { CommitHash: `${issue.id}-old`, Committer: 'tester', CommitDate: '2026-07-19T00:00:00Z',
      Issue: { ...current, status: 'open', updated_at: '2026-07-19T00:00:00Z' } },
  ];
}

const recoveryHistory = (issue) => JSON.stringify(recoveryHistoryEvents(issue));

/** @param {Buffer | string} value */
function byteEnvelope(value) {
  return { base64: Buffer.from(value).toString('base64') };
}

/** @param {Record<string, unknown>} target */
function recoveryCommandCapture(target) {
  const substantive = {
    phase: 'tracked-command',
    result: { id: 'run-1', summary: 'Captured tracked recovery evidence.' },
  };
  const normalizedTarget = {
    specPath: target.specPath,
    lane: target.lane,
    issueId: target.issueId,
  };
  const normalized = canonicalJson({
    target: normalizedTarget,
    state: 'failed',
    records: [substantive],
  });
  const body = canonicalJson({
    target,
    state: 'failed',
    records: [{
      substantive,
      presentation: {
        eventId: 'event-1',
        timestamp: '2026-07-20T00:00:00Z',
        summary: 'Presentation-only summary.',
        rationale: 'Presentation-only rationale.',
      },
    }],
  });
  return {
    target,
    state: 'failed',
    outcomeHash: sha256(normalized),
    bytes: byteEnvelope(body),
  };
}

function recoveryInput(issue, overrides = {}) {
  return {
    listBytes: JSON.stringify([issue]), detailBytesById: [{ id: issue.id, bytes: recoveryDetail(issue) }],
    historyBytesById: [{ id: issue.id, bytes: recoveryHistory(issue) }],
    target: { specPath: RECOVERY_SPEC_PATH, lane: 'tracked', issueId: issue.id },
    ...overrides,
  };
}

test('normalizeRecoveryEvidence projects actual captures deterministically and preserves history order', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const keyed = recoveryIssue('dude-b', 'T003@6c1f8b42', {
      description: `spec: ${RECOVERY_SPEC_PATH}\nTask: T003@6c1f8b42\nspec: inert/later`,
      authority: 'source-only',
      required: true,
    });
    const discovered = recoveryIssue('dude-a', null, {
      status: 'blocked', blocker: 'source-only', blockers: ['source-only'],
    });
    const unrelated = recoveryIssue('dude-other', 'T999@aaaaaaaa', {
      description: 'spec: .dude/specs/999-other/spec.md\nTask: T999@aaaaaaaa',
    });
    const epic = recoveryIssue('dude-epic', null, { issue_type: 'epic', status: 'deferred' });
    const list = [unrelated, keyed, epic, discovered];
    const details = [keyed, discovered].map((issue) => ({ id: issue.id, bytes: recoveryDetail(issue) }));
    const histories = [discovered, keyed].map((issue) => ({ id: issue.id, bytes: recoveryHistory(issue) }));
    const target = { specPath: RECOVERY_SPEC_PATH, lane: 'tracked' };
    const normalized = normalizeRecoveryEvidence({ listBytes: JSON.stringify(list), detailBytesById: details, historyBytesById: histories, target });
    const reordered = normalizeRecoveryEvidence({ listBytes: JSON.stringify([...list].reverse()), detailBytesById: [...details].reverse(), historyBytesById: [...histories].reverse(), target });
    assert.deepEqual(normalized, reordered);
    assert.deepEqual(Object.keys(normalized), ['target', 'records']);
    assert.deepEqual(normalized.records.map((record) => record.issueId), ['dude-a', 'dude-b']);
    assert.equal(normalized.records[0].taskKey, undefined);
    assert.equal(normalized.records[1].taskKey, 'T003@6c1f8b42');
    assert.deepEqual(Object.keys(normalized.records[1].history[0]), ['commitDate', 'issue']);
    assert.equal(JSON.stringify(normalized).includes('CommitHash'), false);
    for (const field of ['authority', 'required', 'blocker', 'blockers']) {
      assert.equal(JSON.stringify(normalized).includes(`"${field}"`), false);
    }
    assert.match(normalized.records[1].description, /spec: inert\/later/);

    const issueOnly = normalizeRecoveryEvidence(recoveryInput(keyed)); const verified = normalizeRecoveryEvidence(recoveryInput(keyed, {
      target: { ...recoveryInput(keyed).target, taskKey: 'T003@6c1f8b42' },
    }));
    assert.deepEqual(issueOnly, verified);
    const reversedHistory = normalizeRecoveryEvidence(recoveryInput(keyed, {
      historyBytesById: [{ id: keyed.id, bytes: JSON.stringify(recoveryHistoryEvents(keyed).reverse()) }],
    }));
    assert.notDeepEqual(issueOnly, reversedHistory);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence accepts the schema tracked-capture envelope', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const selected = recoveryIssue('dude-selected', 'T003@6c1f8b42');
    const internal = recoveryInput(selected);
    const schema = {
      kind: 'tracked',
      listBytes: Buffer.from(internal.listBytes),
      issues: [{
        detailBytes: Buffer.from(internal.detailBytesById[0].bytes),
        historyBytes: Buffer.from(internal.historyBytesById[0].bytes),
      }],
      target: internal.target,
    };
    assert.deepEqual(normalizeRecoveryEvidence(schema), normalizeRecoveryEvidence(internal));

    assert.throws(
      () => normalizeRecoveryEvidence({
        ...schema,
        issues: [],
      }),
      /missing|detail|history|capture/i,
    );
    const mismappedHistory = recoveryHistoryEvents(selected);
    mismappedHistory[0].Issue = { ...mismappedHistory[0].Issue, id: 'dude-other' };
    assert.throws(
      () => normalizeRecoveryEvidence({
        ...schema,
        issues: [{
          detailBytes: schema.issues[0].detailBytes,
          historyBytes: Buffer.from(JSON.stringify(mismappedHistory)),
        }],
      }),
      /wrong Issue id|capture/i,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('installed recovery wrappers bind Beads normalization and preserve UTF-8 issue order', async () => {
  const fixture = stage();
  try {
    const {
      authorizeRecoveryAttempt,
      collectRecoveryEvidence,
      inspectRecovery,
      normalizeRecoveryEvidence,
    } = await importStagedBeads(fixture);
    assert.deepEqual(
      [collectRecoveryEvidence.length, inspectRecovery.length, authorizeRecoveryAttempt.length],
      [2, 1, 5],
    );

    const utf8First = recoveryIssue('dude-\uE000', null);
    const utf8Second = recoveryIssue('dude-\u{10000}', null);
    assert.ok(utf8Second.id < utf8First.id);
    assert.ok(Buffer.compare(Buffer.from(utf8First.id), Buffer.from(utf8Second.id)) < 0);
    const target = { specPath: RECOVERY_SPEC_PATH, lane: 'tracked' };
    const lane = {
      kind: 'tracked',
      listBytes: Buffer.from(canonicalJson([utf8Second, utf8First])),
      issues: [utf8Second, utf8First].map((issue) => ({
        detailBytes: Buffer.from(canonicalJson(JSON.parse(recoveryDetail(issue)))),
        historyBytes: Buffer.from(canonicalJson(JSON.parse(recoveryHistory(issue)))),
      })),
    };
    const expectedIds = [utf8First.id, utf8Second.id];
    assert.deepEqual(
      normalizeRecoveryEvidence({ ...lane, target }).records.map((record) => record.issueId),
      expectedIds,
    );

    const tasksPath = RECOVERY_SPEC_PATH.replace(/spec\.md$/, 'tasks.md');
    const ideaPath = '.dude/ideas/recovery.md';
    const rawInputs = {
      directIdeas: [{ path: ideaPath, bytes: Buffer.from(ideaLedger(RECOVERY_SPEC_PATH)) }],
      tasks: { path: tasksPath, bytes: Buffer.from('# Tasks\n') },
      lane,
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    };
    const collected = collectRecoveryEvidence(target, rawInputs);
    assert.deepEqual(
      JSON.parse(collected.find((item) => item.source === 'lane-history').text).records
        .map((record) => record.issueId),
      expectedIds,
    );

    fs.rmSync(fixture.idea);
    writeFixture(fixture.root, RECOVERY_SPEC_PATH, '# Recovery spec\n');
    writeFixture(fixture.root, tasksPath, '# Tasks\n');
    writeFixture(fixture.root, ideaPath, ideaLedger(RECOVERY_SPEC_PATH));
    const inspection = inspectRecovery({
      root: fixture.root,
      specPath: RECOVERY_SPEC_PATH,
      target,
      lane,
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    });
    assert.equal(inspection.blockers.length, 0);
    assert.deepEqual(
      JSON.parse(inspection.items.find((item) => item.source === 'lane-history').text).records
        .map((record) => record.issueId),
      expectedIds,
    );

    const state = {
      policy: { overall: 3, recovery: 1, recover: true, untilBlocked: false, parallel: 1, mode: 'guarded' },
      overallUsed: 0,
      recoveryUsed: [],
      pending: [],
      completed: [],
    };
    const assessment = {
      evidenceHash: inspection.evidenceHash,
      intent: 'unchanged',
      action: 'retry-task',
      materialInputs: {
        targets: ['tracked-feature'],
        operations: ['retry-task'],
        checks: ['verification'],
      },
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Retry from exact tracked evidence.',
    };
    const authorization = authorizeRecoveryAttempt(
      state,
      target,
      rawInputs,
      assessment,
      'recovery',
    );
    assert.deepEqual(authorization, { authorized: false, reason: 'feature-only', state });
    assert.strictEqual(authorization.state, state);
    assert.equal(authorization.state.overallUsed, 0);
    assert.deepEqual(authorization.state.recoveryUsed, []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('A: runRecoveryCommand seals the Beads normalizer for tracked command requests', async () => {
  const fixture = stage();
  try {
    const installed = await importStagedBeads(fixture);
    assert.equal(typeof installed.runRecoveryCommand, 'function');
    assert.equal(installed.runRecoveryCommand.length, 2);

    const selected = recoveryIssue('dude-selected', 'T003@6c1f8b42');
    const internal = recoveryInput(selected);
    const lane = {
      kind: 'tracked',
      listBytes: byteEnvelope(canonicalJson(JSON.parse(internal.listBytes))),
      issues: [{
        detailBytes: byteEnvelope(canonicalJson(JSON.parse(internal.detailBytesById[0].bytes))),
        historyBytes: byteEnvelope(canonicalJson(JSON.parse(internal.historyBytesById[0].bytes))),
      }],
    };
    const tasksPath = RECOVERY_SPEC_PATH.replace(/spec\.md$/, 'tasks.md');
    const ideaPath = '.dude/ideas/recovery.md';
    fs.rmSync(fixture.idea);
    writeFixture(fixture.root, RECOVERY_SPEC_PATH, '# Recovery spec\n');
    writeFixture(fixture.root, tasksPath, '# Tasks\n');
    writeFixture(fixture.root, ideaPath, ideaLedger(RECOVERY_SPEC_PATH));
    const request = {
      trigger: 'explicit-inspection',
      input: {
        root: fixture.root,
        specPath: RECOVERY_SPEC_PATH,
        target: internal.target,
        lane,
        currentRun: [recoveryCommandCapture(internal.target)],
        review: [],
        verification: [],
        lint: [],
      },
    };

    const response = installed.runRecoveryCommand('inspect', request);
    assert.deepEqual(Object.keys(response), ['inspection']);
    assert.equal(response.inspection.blockers.length, 0);
    assert.deepEqual(
      JSON.parse(response.inspection.items.find((item) => item.source === 'lane-history').text)
        .records.map((record) => record.issueId),
      [selected.id],
    );
    const currentRun = response.inspection.items.find((item) => item.source === 'current-run');
    assert.equal(currentRun.status, 'present');
    assert.match(currentRun.text, /tracked-command/);

    for (const field of ['dependencies', 'normalizeTrackedEvidence', 'authority']) {
      assert.throws(
        () => installed.runRecoveryCommand('inspect', { ...request, [field]: true }),
        /unknown field/i,
        field,
      );
    }

    for (const malformedLane of [
      { ...lane, listBytes: { base64: lane.listBytes.base64, extra: true } },
      { ...lane, listBytes: { base64: `${lane.listBytes.base64}\n` } },
      { ...lane, listBytes: { base64: '____' } },
      { ...lane, issues: [{ ...lane.issues[0], detailBytes: { base64: 'W10' } }] },
      { ...lane, issues: [{ ...lane.issues[0], historyBytes: { base64: '***=' } }] },
    ]) {
      assert.throws(
        () => installed.runRecoveryCommand('inspect', {
          ...request,
          input: { ...request.input, lane: malformedLane },
        }),
        /base64|byte envelope|canonical|unknown field/i,
      );
    }

    const internalLane = {
      kind: 'tracked',
      listBytes: Buffer.from(canonicalJson(JSON.parse(internal.listBytes))),
      issues: [{
        detailBytes: Buffer.from(canonicalJson(JSON.parse(internal.detailBytesById[0].bytes))),
        historyBytes: Buffer.from(canonicalJson(JSON.parse(internal.historyBytesById[0].bytes))),
      }],
    };
    const internalEvidence = installed.collectRecoveryEvidence(internal.target, {
      directIdeas: [{ path: ideaPath, bytes: Buffer.from(ideaLedger(RECOVERY_SPEC_PATH)) }],
      tasks: { path: tasksPath, bytes: Buffer.from('# Tasks\n') },
      lane: internalLane,
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    });
    assert.equal(internalEvidence.find((item) => item.source === 'lane-history').status, 'present');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence does not map discovered or malformed task-key supersets', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const tokens = [null, 'XT003@6c1f8b42', 'T003@6c1f8b42x', 'T003@6c1f8b420'];
    const issues = tokens.map((token, index) => recoveryIssue(`dude-${index}`, null, token ? {
      description: `spec: ${RECOVERY_SPEC_PATH}\nTask: ${token}`,
    } : {}));
    const normalized = normalizeRecoveryEvidence({
      listBytes: JSON.stringify(issues),
      detailBytesById: issues.map((issue) => ({ id: issue.id, bytes: recoveryDetail(issue) })),
      historyBytesById: issues.map((issue) => ({ id: issue.id, bytes: recoveryHistory(issue) })),
      target: { specPath: RECOVERY_SPEC_PATH, lane: 'tracked' },
    });
    assert.equal(normalized.records.every((record) => record.taskKey === undefined), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence rejects duplicate target task-key owners from the complete list', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const taskKey = 'T003@6c1f8b42';
    const issues = [recoveryIssue('dude-z', taskKey), recoveryIssue('dude-a', taskKey)];
    for (const issueId of issues.map((issue) => issue.id)) {
      assert.throws(() => normalizeRecoveryEvidence({
        listBytes: JSON.stringify(issues), detailBytesById: [], historyBytesById: [],
        target: { specPath: RECOVERY_SPEC_PATH, lane: 'tracked', issueId, taskKey },
      }), /duplicate\/ambiguous mapping across issues: dude-a, dude-z/);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence validates target issue ID Unicode and UTF-8 byte boundaries', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const input = (issueId) => ({
      listBytes: '[]', detailBytesById: [], historyBytesById: [],
      target: { specPath: RECOVERY_SPEC_PATH, lane: 'tracked', issueId },
    });
    for (const issueId of ['a', 'a'.repeat(256), 'ok-😀']) {
      assert.throws(() => normalizeRecoveryEvidence(input(issueId)), /not in the exact-feature issue set/);
    }
    for (const issueId of ['', 'a'.repeat(257), `${'é'.repeat(128)}a`, '\u0000', '\u001f', '\u007f', '\u0080', '\u009f', '\ud800', '\udc00']) {
      assert.throws(() => normalizeRecoveryEvidence(input(issueId)), /target\.issueId/);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence requires exact capture sets and rejects overlapping show drift', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const selected = recoveryIssue('dude-selected', 'T003@6c1f8b42');
    const base = recoveryInput(selected);
    const detail = base.detailBytesById[0];
    const history = base.historyBytesById[0];
    const scenarios = [
      ['missing detail', { ...base, detailBytesById: [] }, /missing detail/],
      ['missing history', { ...base, historyBytesById: [] }, /missing history/],
      ['duplicate detail', { ...base, detailBytesById: [detail, detail] }, /duplicate issue ID/],
      ['duplicate history', { ...base, historyBytesById: [history, history] }, /duplicate issue ID/],
      ['extra detail', { ...base, detailBytesById: [detail, { id: 'extra', bytes: '[]' }] }, /extra issue ID 'extra'/],
      ['extra history', { ...base, historyBytesById: [history, { id: 'extra', bytes: '[]' }] }, /extra issue ID 'extra'/],
      ['priority drift', { ...base, detailBytesById: [{ id: selected.id, bytes: recoveryDetail(selected, { priority: 1 }) }] }, /conflicting priority/],
      ['title drift', { ...base, detailBytesById: [{ id: selected.id, bytes: recoveryDetail(selected, { title: 'changed' }) }] }, /conflicting title/],
      ['status drift', { ...base, detailBytesById: [{ id: selected.id, bytes: recoveryDetail(selected, { status: 'blocked' }) }] }, /conflicting status/],
    ];

    for (const [name, input, expected] of scenarios) {
      assert.throws(() => normalizeRecoveryEvidence(input), expected, name);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence enforces first-line identity, status, task target, and epic rules', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const statuses = new Map([
      ['open', 'open'], ['in_progress', 'in_progress'], ['in-progress', 'in_progress'],
      ['inprogress', 'in_progress'], ['blocked', 'blocked'], ['closed', 'closed'], ['done', 'closed'],
    ]);
    for (const [status, expected] of statuses) {
      const issue = recoveryIssue(`dude-${status}`, null, { status });
      assert.equal(normalizeRecoveryEvidence(recoveryInput(issue)).records[0].status, expected);
    }
    const selected = recoveryIssue('dude-selected', 'T003@6c1f8b42');
    const wrongFirst = recoveryIssue('dude-wrong', null,
      { description: `spec: .dude/specs/999-other/spec.md\nspec: ${RECOVERY_SPEC_PATH}` });
    assert.throws(() => normalizeRecoveryEvidence(recoveryInput(wrongFirst)), /not in the exact-feature/);
    assert.throws(() => normalizeRecoveryEvidence(recoveryInput({ ...selected, status: 'deferred' })), /unsupported executable/);
    assert.throws(() => normalizeRecoveryEvidence(recoveryInput(selected, {
      target: { ...recoveryInput(selected).target, taskKey: 'T004@a7e25d19' },
    })), /no durable issue mapping/);
    const discovered = recoveryIssue('dude-discovered', null);
    assert.throws(() => normalizeRecoveryEvidence(recoveryInput(discovered, {
      target: { ...recoveryInput(discovered).target, taskKey: 'T003@6c1f8b42' },
    })), /no durable issue mapping/);

    const epic = recoveryIssue('dude-epic', null, { issue_type: 'epic', status: 'deferred' });
    const feature = normalizeRecoveryEvidence(recoveryInput(selected, {
      listBytes: JSON.stringify([epic, selected]),
      target: { specPath: RECOVERY_SPEC_PATH, lane: 'tracked' },
    }));
    assert.deepEqual(feature.records.map((record) => record.issueId), [selected.id]);
    assert.throws(() => normalizeRecoveryEvidence(recoveryInput(epic)), /non-executable grouping epic/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeRecoveryEvidence rejects malformed actual captures and has no I/O or mutation path', async () => {
  const fixture = stage();
  try {
    const { normalizeRecoveryEvidence } = await importStagedBeads(fixture);
    const selected = recoveryIssue('dude-selected', 'T003@6c1f8b42');
    const base = recoveryInput(selected);
    const wrongId = recoveryHistoryEvents(selected);
    wrongId[0].Issue = { ...wrongId[0].Issue, id: 'other' };
    const wrongSpec = recoveryHistoryEvents(selected);
    wrongSpec[0].Issue = { ...wrongSpec[0].Issue, description: 'spec: .dude/specs/999-other/spec.md' };
    const sparse = Array(1);
    const scenarios = [
      ['malformed list array', { ...base, listBytes: '[null]' }, /malformed issue/],
      ['malformed show array', { ...base, detailBytesById: [{ id: selected.id, bytes: '[null]' }] }, /malformed issue/],
      ['multiple show issues', { ...base, detailBytesById: [{ id: selected.id, bytes: JSON.stringify([selected, selected]) }] }, /exactly one issue/],
      ['history envelope', { ...base, historyBytesById: [{ id: selected.id, bytes: '{"events":[]}' }] }, /must be an array/],
      ['malformed history event', { ...base, historyBytesById: [{ id: selected.id, bytes: '[null]' }] }, /malformed event/],
      ['wrong history Issue id', { ...base, historyBytesById: [{ id: selected.id, bytes: JSON.stringify(wrongId) }] }, /wrong Issue id/],
      ['wrong history Issue spec', { ...base, historyBytesById: [{ id: selected.id, bytes: JSON.stringify(wrongSpec) }] }, /wrong target spec/],
      ['Map captures', { ...base, detailBytesById: new Map() }, /dense array/],
      ['sparse captures', { ...base, detailBytesById: sparse }, /dense array/],
      ['inexact capture entry', { ...base, detailBytesById: [{ ...base.detailBytesById[0], extra: true }] }, /exact \{id,bytes\}/],
    ];
    for (const [name, input, expected] of scenarios) {
      assert.throws(() => normalizeRecoveryEvidence(input), expected, name);
    }

    const source = fs.readFileSync(beadsSrc, 'utf8');
    const pureStart = source.indexOf('function isPlainObject');
    const pureEnd = source.indexOf('/** @param {any} issue', pureStart);
    const pureSource = source.slice(pureStart, pureEnd);
    assert.doesNotMatch(pureSource, /\bfs\.|\bspawnSync\b|\bprocess\.|\bfetch\s*\(|\bmodel\b/);
    const before = structuredClone(base);
    normalizeRecoveryEvidence(base);
    assert.deepEqual(base, before);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * @param {{ inventory: string, tasks?: string, write?: boolean, spec?: string | null }} options
 */
function runMirrorFixture({ inventory, tasks = FIXTURE, write = false, spec = SPEC_PATH }) {
  const fixture = stage();
  try {
    fs.writeFileSync(fixture.file, tasks);
    const bdFile = path.join(fixture.root, 'bd.json');
    fs.writeFileSync(bdFile, inventory);
    const tasksBefore = fs.readFileSync(fixture.file);
    const ideaBefore = fs.readFileSync(fixture.idea);
    const args = ['mirror', fixture.file, '--from', bdFile, '--root', fixture.root];
    if (spec !== null) args.push('--spec', spec);
    if (write) args.push('--write');

    const result = runNode(fixture.script, args);
    return {
      ...result,
      write,
      tasksBefore,
      tasksAfter: fs.readFileSync(fixture.file),
      ideaBefore,
      ideaAfter: fs.readFileSync(fixture.idea),
    };
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

/** @param {ReturnType<typeof runMirrorFixture>} result @param {RegExp} diagnostic */
function rejectionObservation(result, diagnostic) {
  return {
    code: result.code,
    diagnostic: diagnostic.test(result.out),
    claimsSuccess: /\[OK\]|state\(s\) would change/i.test(result.out),
    tasksUnchanged: result.tasksAfter.equals(result.tasksBefore),
    ideaUnchanged: result.ideaAfter.equals(result.ideaBefore),
  };
}

const EXPECTED_REJECTION = {
  code: 2,
  diagnostic: true,
  claimsSuccess: false,
  tasksUnchanged: true,
  ideaUnchanged: true,
};

/** @param {string} root */
function stageFakeBd(root) {
  const script = path.join(root, 'fake-bd.mjs');
  const argsFile = path.join(root, 'fake-bd-args.json');
  const outputFile = path.join(root, 'fake-bd-output.txt');
  fs.writeFileSync(
    script,
    `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst output = '[]\\n';\nfs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\nfs.writeFileSync(${JSON.stringify(outputFile)}, output);\nprocess.stdout.write(output);\n`,
  );
  fs.chmodSync(script, 0o755);
  return { script, argsFile, outputFile };
}

/**
 * @param {{ argsFile: string, outputFile: string }} fakeBd
 * @param {{ out: string }} result
 * @param {string} label
 */
function assertBdNotQueried(fakeBd, result, label) {
  assert.equal(fs.existsSync(fakeBd.argsFile), false, `${label}: fake bd recorded query arguments`);
  assert.equal(fs.existsSync(fakeBd.outputFile), false, `${label}: fake bd produced its output sentinel`);
  assert.doesNotMatch(result.out, /bd create/, `${label}: create command was emitted`);
}

test('beads.mjs resolves the core engine post-install and plans an import', () => {
  const { root, script, file, emptyBd } = stage();
  try {
    const r = runNode(script, ['plan-import', file, '--spec', '.dude/specs/x/spec.md', '--root', root, '--from', emptyBd, '--json']);
    assert.equal(r.code, 0, r.out);
    const plan = JSON.parse(r.out);
    assert.equal(plan.idea_path, '.dude/ideas/x.md');
    assert.deepEqual(plan.discovery, { represented: false, matching_issue_ids: [] });
    // T001 is done -> skipped; T002 + T003 + T004 open
    assert.deepEqual(plan.skipped_done, ['T001@aaaaaaaa']);
    assert.deepEqual(plan.issues.map((i) => i.key).sort(), ['T002@bbbbbbbb', 'T003@cccccccc', 'T004@dddddddd']);
    // dep among open tasks: US1 depends on Foundational; explicit T002->T001
    // edge dropped because T001 is done.
    assert.ok(plan.deps.some((e) => e.from === 'T003@cccccccc' && e.to === 'T002@bbbbbbbb'));
    assert.ok(!plan.deps.some((e) => e.to === 'T001@aaaaaaaa'));
    assert.ok(plan.issues.every((i) => i.description.startsWith('spec: .dude/specs/x/spec.md')));
    assert.ok(plan.epic.status === 'deferred');
    assert.ok(plan.commands.some((c) => c.startsWith('bd create') && c.includes('-t epic')));
    // finding 3: [~]/[!] carry status on create
    assert.ok(plan.commands.some((c) => c.includes('T003@cccccccc') && c.includes('--status=in_progress')));
    assert.ok(plan.commands.some((c) => c.includes('T004@dddddddd') && c.includes('--status=blocked')));
    // finding 2: POSIX single-quoting leaves inner double quotes literal (no \\")
    assert.ok(plan.commands.some((c) => c.includes('Build the "core"')));
    assert.ok(!plan.commands.some((c) => c.includes('Build the \\"core')));
    // finding 1: deps are post-create notes, never broken `bd dep <key>` commands
    assert.ok(!plan.commands.some((c) => c.startsWith('bd dep')));
    assert.ok(plan.commands.some((c) => c.startsWith('# dependencies')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs uses the installed feature library when the core feature CLI is absent', () => {
  const { root, script, file, emptyBd } = stage();
  try {
    fs.rmSync(path.join(root, '.github/skills/dude-engine/feature.mjs'));

    const result = runNode(script, [
      'plan-import',
      file,
      '--spec',
      SPEC_PATH,
      '--root',
      root,
      '--from',
      emptyBd,
      '--json',
    ]);

    assert.equal(result.code, 0, result.out);
    assert.equal(JSON.parse(result.out).idea_path, IDEA_PATH);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan-import queries all statuses without a cap before emitting creates', () => {
  const { root, script, file } = stage();
  try {
    const specPath = '.dude/specs/x/spec.md';
    const issues = Array.from({ length: 75 }, (_, index) => ({
      id: `dude-${index}`,
      type: 'task',
      status: 'open',
      description: `spec: .dude/specs/other/spec.md\nTask: T${String(index + 100).padStart(3, '0')}@aaaaaaaa`,
    }));
    issues[60] = {
      id: 'dude-closed-exact',
      type: 'task',
      status: 'closed',
      description: `${`spec: ${specPath}`}\nTask: T700@bbbbbbbb`,
    };
    issues[74] = {
      id: 'dude-deferred-epic',
      type: 'epic',
      status: 'deferred',
      description: `${`spec: ${specPath}`}\nEpic: Existing feature`,
    };
    const argsFile = path.join(root, 'bd-args.json');
    const fakeBd = path.join(root, 'fake-bd.mjs');
    fs.writeFileSync(
      fakeBd,
      `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst args = process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(args));\nlet issues = ${JSON.stringify(issues)};\nif (!args.includes('--all')) issues = issues.filter((issue) => !['closed', 'deferred'].includes(issue.status));\nconst limitAt = args.indexOf('--limit');\nif (limitAt < 0 || args[limitAt + 1] !== '0') issues = issues.slice(0, 50);\nprocess.stdout.write(JSON.stringify(issues));\n`,
    );
    fs.chmodSync(fakeBd, 0o755);

    const result = runNode(script, [
      'plan-import',
      file,
      '--spec',
      specPath,
      '--root',
      root,
      '--bd',
      fakeBd,
      '--json',
    ]);

    assert.equal(result.code, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(argsFile, 'utf8')), ['list', '--all', '--limit', '0', '--json']);
    assert.match(result.out, /already represented/);
    assert.match(result.out, /dude-closed-exact/);
    assert.match(result.out, /dude-deferred-epic/);
    assert.doesNotMatch(result.out, /bd create/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan-import compares the first spec line exactly and ignores prefix collisions', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'prefix-collision.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      {
        id: 'dude-prefix',
        type: 'task',
        status: 'closed',
        description: 'spec: .dude/specs/x/spec.md-collision\nTask: T002@bbbbbbbb',
      },
    ]));

    const result = runNode(script, [
      'plan-import',
      file,
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
      '--from',
      bdFile,
      '--json',
    ]);

    assert.equal(result.code, 0, result.out);
    const plan = JSON.parse(result.out);
    assert.equal(plan.discovery.represented, false);
    assert.ok(plan.commands.some((command) => command.startsWith('bd create')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan-import rejects duplicate durable task keys in existing Beads issues', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'duplicate-task-keys.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      { id: 'dude-a', type: 'task', description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb first' },
      { id: 'dude-b', type: 'task', description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb second' },
    ]));

    const result = runNode(script, [
      'plan-import', file,
      '--spec', '.dude/specs/x/spec.md',
      '--root', root,
      '--from', bdFile,
    ]);

    assert.equal(result.code, 2);
    assert.match(result.out, /duplicate durable task key T002@bbbbbbbb.*dude-a, dude-b/);
    assert.doesNotMatch(result.out, /bd create/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan-import rejects duplicate feature epic identities', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'duplicate-feature-identities.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      { id: 'dude-epic-a', type: 'epic', description: 'spec: .dude/specs/x/spec.md\nEpic: A' },
      { id: 'dude-epic-b', issue_type: 'epic', description: 'spec: .dude/specs/x/spec.md\nEpic: B' },
    ]));

    const result = runNode(script, [
      'plan-import', file,
      '--spec', '.dude/specs/x/spec.md',
      '--root', root,
      '--from', bdFile,
    ]);

    assert.equal(result.code, 2);
    assert.match(result.out, /duplicate feature identity.*dude-epic-a, dude-epic-b/);
    assert.doesNotMatch(result.out, /bd create/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan-import rejects duplicate defined-idea feature identities', () => {
  const { root, script, file } = stage();
  try {
    const fakeBd = stageFakeBd(root);
    fs.writeFileSync(
      path.join(root, '.dude/ideas/duplicate.md'),
      ideaLedger(SPEC_PATH, 'defined', 'Duplicate.'),
    );

    const result = runNode(script, [
      'plan-import', file,
      '--spec', SPEC_PATH,
      '--root', root,
      '--bd', fakeBd.script,
    ]);

    assert.equal(result.code, 2);
    assert.match(result.out, /duplicate defined idea owners.*\.dude\/ideas\/duplicate\.md, \.dude\/ideas\/x\.md.*FEATURE_OWNER_DUPLICATE/s);
    assertBdNotQueried(fakeBd, result, 'duplicate owner');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plan-import rejects missing or invalid defined idea owners before querying Beads', () => {
  const scenarios = [
    {
      name: 'missing ideas root',
      mutate: ({ root }) => fs.rmSync(path.join(root, '.dude/ideas'), { recursive: true }),
      expected: /FEATURE_IDEAS_ROOT_MISSING/,
    },
    {
      name: 'empty ideas root with no owner',
      mutate: ({ idea }) => fs.rmSync(idea),
      expected: /FEATURE_OWNER_NOT_FOUND/,
    },
    {
      name: 'malformed frontmatter',
      mutate: ({ idea }) => fs.writeFileSync(idea, `---\nstatus: defined\nspec_path: ${SPEC_PATH}\n\n## Idea\n\nBroken.\n`),
      expected: /\.dude\/ideas\/x\.md.*closing delimiter.*FEATURE_FRONTMATTER_MALFORMED/s,
    },
    {
      name: 'defined idea without spec_path',
      mutate: ({ idea }) => fs.writeFileSync(idea, ideaLedger(null)),
      expected: /FEATURE_SPEC_PATH_MISSING/,
    },
    {
      name: 'noncanonical spec_path',
      mutate: ({ idea }) => fs.writeFileSync(idea, ideaLedger('specs/x/spec.md')),
      expected: /FEATURE_SPEC_PATH_INVALID/,
    },
    {
      name: 'dangling spec_path',
      mutate: ({ idea }) => fs.writeFileSync(idea, ideaLedger('.dude/specs/missing/spec.md')),
      expected: /FEATURE_SPEC_PATH_DANGLING/,
    },
    {
      name: 'mismatched defined owner',
      mutate: ({ root, idea }) => {
        writeFixture(root, '.dude/specs/other/spec.md', '# Other\n');
        fs.writeFileSync(idea, ideaLedger('.dude/specs/other/spec.md'));
      },
      expected: /FEATURE_OWNER_NOT_FOUND/,
    },
    // FR-029 (T034): strict owner-metadata violations. These stage the engine
    // from .github, so they stay RED (the stale engine resolves an owner and
    // Beads is queried) until the Coder regenerates .github with the strict
    // grammar and the FEATURE_DRAFT_SPEC_PATH diagnostic.
    {
      name: 'quoted canonical key',
      mutate: ({ idea }) => fs.writeFileSync(
        idea,
        ideaLedger().replace('---\nstatus: defined', '---\n"title": Example\nstatus: defined'),
      ),
      expected: /FEATURE_FRONTMATTER_MALFORMED/,
    },
    {
      name: 'draft owner with resolvable spec_path',
      mutate: ({ root }) => {
        writeFixture(root, '.dude/specs/draftish/spec.md', '# Draftish\n');
        writeFixture(root, '.dude/ideas/draftish.md', ideaLedger('.dude/specs/draftish/spec.md', 'draft', 'Draftish.'));
      },
      expected: /FEATURE_DRAFT_SPEC_PATH/,
    },
    {
      name: 'unsupported top-level data',
      mutate: ({ idea }) => fs.writeFileSync(
        idea,
        ideaLedger().replace('\n---\n\n## Idea', '\n- orphan\n---\n\n## Idea'),
      ),
      expected: /FEATURE_FRONTMATTER_MALFORMED/,
    },
  ];

  for (const scenario of scenarios) {
    const fixture = stage();
    try {
      const fakeBd = stageFakeBd(fixture.root);
      const tasksBefore = fs.readFileSync(fixture.file);
      scenario.mutate(fixture);

      const result = runNode(fixture.script, [
        'plan-import', fixture.file,
        '--spec', SPEC_PATH,
        '--root', fixture.root,
        '--bd', fakeBd.script,
        '--json',
      ]);

      assert.equal(result.code, 2, `${scenario.name}: ${result.out}`);
      assert.match(result.out, scenario.expected, scenario.name);
      assertBdNotQueried(fakeBd, result, scenario.name);
      assert.deepEqual(fs.readFileSync(fixture.file), tasksBefore, scenario.name);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('plan-import requires canonical ideas to be direct Markdown file children', () => {
  const scenarios = [
    {
      name: 'empty nested idea directory',
      mutate: ({ root }) => fs.mkdirSync(path.join(root, '.dude/ideas/nested'), { recursive: true }),
      expected: /\.dude\/ideas\/nested.*FEATURE_IDEA_ENTRY_UNSUPPORTED/s,
    },
    {
      name: 'non-Markdown idea entry',
      mutate: ({ root }) => writeFixture(root, '.dude/ideas/notes.txt', 'not an idea\n'),
      expected: /\.dude\/ideas\/notes\.txt.*FEATURE_IDEA_ENTRY_UNSUPPORTED/s,
    },
  ];

  for (const scenario of scenarios) {
    const fixture = stage();
    try {
      const fakeBd = stageFakeBd(fixture.root);
      scenario.mutate(fixture);
      const result = runNode(fixture.script, [
        'plan-import', fixture.file,
        '--spec', SPEC_PATH,
        '--root', fixture.root,
        '--bd', fakeBd.script,
      ]);

      assert.equal(result.code, 2, `${scenario.name}: ${result.out}`);
      assert.match(result.out, scenario.expected, scenario.name);
      assertBdNotQueried(fakeBd, result, scenario.name);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('plan-import rejects symbolic-link idea entries before querying Beads', { skip: POSIX_SKIP }, () => {
  const fixture = stage();
  try {
    const fakeBd = stageFakeBd(fixture.root);
    const outside = writeFixture(fixture.root, 'outside.md', ideaLedger());
    fs.symlinkSync(outside, path.join(fixture.root, '.dude/ideas/link.md'));

    const result = runNode(fixture.script, [
      'plan-import', fixture.file,
      '--spec', SPEC_PATH,
      '--root', fixture.root,
      '--bd', fakeBd.script,
    ]);

    assert.equal(result.code, 2, result.out);
    assert.match(result.out, /\.dude\/ideas\/link\.md.*FEATURE_IDEA_ENTRY_UNSUPPORTED/s);
    assertBdNotQueried(fakeBd, result, 'symbolic-link idea entry');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('plan-import rejects FIFO idea entries before querying Beads', { skip: POSIX_SKIP }, (context) => {
  const fixture = stage();
  try {
    const fakeBd = stageFakeBd(fixture.root);
    const fifo = path.join(fixture.root, '.dude/ideas/pipe.md');
    const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    if (created.error || created.status !== 0) {
      return context.skip(`mkfifo unavailable: ${created.error?.message || created.stderr || created.status}`);
    }

    const result = runNode(fixture.script, [
      'plan-import', fixture.file,
      '--spec', SPEC_PATH,
      '--root', fixture.root,
      '--bd', fakeBd.script,
    ]);

    assert.equal(result.code, 2, result.out);
  assert.match(result.out, /\.dude\/ideas\/pipe\.md.*FEATURE_IDEA_ENTRY_UNSUPPORTED/s);
    assertBdNotQueried(fakeBd, result, 'FIFO idea entry');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('plan-import ignores unrelated noncanonical directories and queries the complete inventory', () => {
  const fixture = stage();
  try {
    writeFixture(fixture.root, 'notes/archive/readme.md', '# Unrelated\n');
    writeFixture(fixture.root, '.cache/tool/state.json', '{}\n');
    const fakeBd = stageFakeBd(fixture.root);

    const result = runNode(fixture.script, [
      'plan-import', fixture.file,
      '--spec', SPEC_PATH,
      '--root', fixture.root,
      '--bd', fakeBd.script,
      '--json',
    ]);

    assert.equal(result.code, 0, result.out);
    assert.equal(JSON.parse(result.out).idea_path, IDEA_PATH);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(fakeBd.argsFile, 'utf8')),
      ['list', '--all', '--limit', '0', '--json'],
    );
    assert.equal(fs.readFileSync(fakeBd.outputFile, 'utf8'), '[]\n');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('plan-import rejects unrelated resolver errors before querying Beads', () => {
  const fixture = stage();
  try {
    const fakeBd = stageFakeBd(fixture.root);
    writeFixture(fixture.root, '.dude/ideas/unrelated.md', 'not frontmatter\n');

    const result = runNode(fixture.script, [
      'plan-import',
      fixture.file,
      '--spec',
      SPEC_PATH,
      '--root',
      fixture.root,
      '--bd',
      fakeBd.script,
      '--json',
    ]);

    assert.equal(result.code, 2, result.out);
    assert.match(result.out, /\.dude\/ideas\/unrelated\.md.*FEATURE_FRONTMATTER_MALFORMED/s);
    assertBdNotQueried(fakeBd, result, 'unrelated resolver error');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('plan-import rejects symlinked workspace and canonical feature targets before querying Beads', { skip: POSIX_SKIP }, () => {
  const scenarios = [
    {
      name: 'workspace root',
      mutate: (fixture) => {
        const linkedRoot = `${fixture.root}-link`;
        fs.symlinkSync(fixture.root, linkedRoot, 'dir');
        return {
          root: linkedRoot,
          file: path.join(linkedRoot, '.dude/specs/x/tasks.md'),
          cleanup: () => fs.unlinkSync(linkedRoot),
        };
      },
      expected: /workspace root must not be a symbolic link/,
    },
    {
      name: 'canonical tasks.md',
      mutate: (fixture) => {
        const outside = writeFixture(fixture.root, 'outside-tasks.md', FIXTURE);
        fs.rmSync(fixture.file);
        fs.symlinkSync(outside, fixture.file);
        return { root: fixture.root, file: fixture.file, cleanup: () => {} };
      },
      expected: /unsafe mutation target.*tasks\.md.*contains symbolic link/,
    },
    {
      name: 'canonical spec.md',
      mutate: (fixture) => {
        const spec = path.join(fixture.root, ...SPEC_PATH.split('/'));
        const outside = writeFixture(fixture.root, 'outside-spec.md', '# Outside\n');
        fs.rmSync(spec);
        fs.symlinkSync(outside, spec);
        return { root: fixture.root, file: fixture.file, cleanup: () => {} };
      },
      expected: /unsafe mutation target.*spec\.md.*contains symbolic link/,
    },
  ];

  for (const scenario of scenarios) {
    const fixture = stage();
    let cleanup = () => {};
    try {
      const fakeBd = stageFakeBd(fixture.root);
      const invocation = scenario.mutate(fixture);
      cleanup = invocation.cleanup;
      const result = runNode(fixture.script, [
        'plan-import', invocation.file,
        '--spec', SPEC_PATH,
        '--root', invocation.root,
        '--bd', fakeBd.script,
      ]);

      assert.equal(result.code, 2, `${scenario.name}: ${result.out}`);
      assert.match(result.out, scenario.expected, scenario.name);
      assertBdNotQueried(fakeBd, result, scenario.name);
    } finally {
      cleanup();
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('plan-import rejects malformed or unrecognized Beads list JSON', () => {
  const { root, script, file } = stage();
  try {
    for (const [name, content, expected] of [
      ['malformed.json', '{', /malformed JSON/],
      ['unexpected.json', '{"items":[]}', /unrecognized JSON shape/],
    ]) {
      const bdFile = path.join(root, name);
      fs.writeFileSync(bdFile, content);
      const result = runNode(script, [
        'plan-import', file,
        '--spec', '.dude/specs/x/spec.md',
        '--root', root,
        '--from', bdFile,
      ]);
      assert.equal(result.code, 2);
      assert.match(result.out, expected);
      assert.doesNotMatch(result.out, /bd create/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs plan-import refuses a malformed tasks.md', () => {
  const { root, script, file } = stage();
  try {
    fs.writeFileSync(file, '## Setup\n- [ ] T001@aaaaaaaa ok\n- [z] T002@bbbbbbbb bad glyph\n');
    const r = runNode(script, ['plan-import', file, '--spec', '.dude/specs/x/spec.md', '--root', root]);
    assert.equal(r.code, 2);
    assert.match(r.out, /structural issues|malformed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs plan-import rejects a spec from a different canonical feature directory', () => {
  const { root, script, file } = stage();
  try {
    const otherSpec = path.join(root, '.dude/specs/other/spec.md');
    fs.mkdirSync(path.dirname(otherSpec), { recursive: true });
    fs.writeFileSync(otherSpec, '# Other\n');

    const result = runNode(script, [
      'plan-import',
      file,
      '--spec',
      '.dude/specs/other/spec.md',
      '--root',
      root,
    ]);

    assert.equal(result.code, 2);
    assert.match(result.out, /same canonical feature directory|feature identity/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs plan-import rejects a missing canonical spec file', () => {
  const { root, script, file } = stage();
  try {
    fs.rmSync(path.join(root, '.dude/specs/x/spec.md'));
    const result = runNode(script, [
      'plan-import',
      file,
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
    ]);
    assert.equal(result.code, 2);
    assert.match(result.out, /spec.*not found|missing.*spec/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror applies bd statuses back into tasks.md', () => {
  const { root, script, file, idea } = stage();
  try {
    const bd = [
      { title: 'T002@bbbbbbbb Schema', description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'closed' },
      { title: 'x', description: 'spec: .dude/specs/x/spec.md\nTask: T003@cccccccc build', status: 'in_progress' },
      { title: 'unrelated', description: 'spec: .dude/specs/x/spec.md\nTask: T999@zzzzzzzz ghost', status: 'open' },
    ];
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify(bd));
    const tasksBefore = fs.readFileSync(file, 'utf8');
    const ideaBefore = fs.readFileSync(idea);
    const r = runNode(script, [
      'mirror',
      file,
      '--from',
      bdFile,
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
      '--write',
    ]);
    assert.equal(r.code, 0, r.out);
    const out = fs.readFileSync(file, 'utf8');
    assert.equal(out, tasksBefore.replace('- [ ] T002@bbbbbbbb [US1] Schema', '- [x] T002@bbbbbbbb [US1] Schema'));
    assert.match(r.out, /\[INFO\] idea_path: \.dude\/ideas\/x\.md/);
    assert.deepEqual(fs.readFileSync(idea), ideaBefore);
    assert.match(r.out, /bd issue key not in tasks.md: T999@zzzzzzzz/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror --spec ignores issues from other features (finding 4)', () => {
  const { root, script, file } = stage();
  try {
    const bd = [
      { description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'closed' },
      // same task key but a DIFFERENT feature's spec — must be ignored
      { description: 'spec: .dude/specs/other/spec.md\nTask: T003@cccccccc', status: 'closed' },
    ];
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify(bd));
    const r = runNode(script, ['mirror', file, '--from', bdFile, '--spec', '.dude/specs/x/spec.md', '--root', root, '--write']);
    assert.equal(r.code, 0, r.out);
    const out = fs.readFileSync(file, 'utf8');
    assert.ok(out.includes('- [x] T002@bbbbbbbb [US1] Schema'), 'ours applied');
    assert.ok(out.includes('- [~] T003@cccccccc'), 'other feature not applied');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror --write requires --spec and leaves tasks.md unchanged', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      { description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'closed' },
    ]));
    const before = fs.readFileSync(file);

    const result = runNode(script, ['mirror', file, '--from', bdFile, '--root', root, '--write']);

    assert.equal(result.code, 2);
    assert.match(result.out, /--spec/);
    assert.deepEqual(fs.readFileSync(file), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror inspection without --spec is owner-independent and non-mutating', () => {
  const { root, script, file } = stage();
  try {
    fs.rmSync(path.join(root, '.dude/ideas'), { recursive: true });
    const unrelated = writeFixture(root, 'notes/inspection.md', '# Unrelated inspection input\n');
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      { description: `spec: ${SPEC_PATH}\nTask: T002@bbbbbbbb`, status: 'closed' },
    ]));
    const tasksBefore = fs.readFileSync(file);
    const unrelatedBefore = fs.readFileSync(unrelated);

    const result = runNode(script, ['mirror', file, '--from', bdFile, '--root', root]);

    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /1 state\(s\) would change \(dry run; pass --write\)/);
    assert.doesNotMatch(result.out, /idea_path/);
    assert.deepEqual(fs.readFileSync(file), tasksBefore);
    assert.deepEqual(fs.readFileSync(unrelated), unrelatedBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror compares the first spec line exactly, not by prefix', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      {
        description: 'spec: .dude/specs/x/spec.md-collision\nTask: T002@bbbbbbbb',
        status: 'closed',
      },
    ]));

    const result = runNode(script, [
      'mirror',
      file,
      '--from',
      bdFile,
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
      '--write',
    ]);

    assert.equal(result.code, 0, result.out);
    assert.ok(fs.readFileSync(file, 'utf8').includes('- [ ] T002@bbbbbbbb [US1] Schema'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror rejects duplicate conflicting mappings without writing', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      { id: 'dude-a', description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'open' },
      { id: 'dude-b', description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'closed' },
    ]));
    const before = fs.readFileSync(file);

    const result = runNode(script, [
      'mirror',
      file,
      '--from',
      bdFile,
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
      '--write',
    ]);

    assert.equal(result.code, 2);
    assert.match(result.out, /duplicate|conflicting.*T002@bbbbbbbb/i);
    assert.deepEqual(fs.readFileSync(file), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('regression: mirror ignores exact-feature epics with task keys at every status', () => {
  const result = runMirrorFixture({
    inventory: JSON.stringify([
      {
        id: 'dude-epic-deferred',
        type: 'epic',
        status: 'deferred',
        description: `spec: ${SPEC_PATH}\nTask: T002@bbbbbbbb`,
      },
      {
        id: 'dude-epic-closed',
        issue_type: 'epic',
        status: 'closed',
        description: `spec: ${SPEC_PATH}\nTask: T003@cccccccc`,
      },
    ]),
    write: true,
  });

  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /mirrored 0 state\(s\)/);
  assert.deepEqual(result.tasksAfter, result.tasksBefore, result.out);
  assert.deepEqual(result.ideaAfter, result.ideaBefore, result.out);
});

test('regression: mirror rejects deferred executable issues in write and inspection modes', () => {
  const inventory = JSON.stringify([
    {
      id: 'dude-deferred-task',
      type: 'task',
      status: 'deferred',
      description: `spec: ${SPEC_PATH}\nTask: T002@bbbbbbbb`,
    },
  ]);
  const results = [false, true].map((write) => runMirrorFixture({ inventory, write }));
  const actual = results.map((result) => ({
    mode: result.write ? '--write' : 'dry-run',
    code: result.code,
    unsupported: /unsupported/i.test(result.out),
    issueId: /dude-deferred-task/.test(result.out),
    taskKey: /T002@bbbbbbbb/.test(result.out),
    status: /deferred/i.test(result.out),
    claimsSuccess: /\[OK\]|state\(s\) would change/i.test(result.out),
    tasksUnchanged: result.tasksAfter.equals(result.tasksBefore),
    ideaUnchanged: result.ideaAfter.equals(result.ideaBefore),
  }));
  const expected = ['dry-run', '--write'].map((mode) => ({
    mode,
    code: 2,
    unsupported: true,
    issueId: true,
    taskKey: true,
    status: true,
    claimsSuccess: false,
    tasksUnchanged: true,
    ideaUnchanged: true,
  }));

  assert.deepEqual(
    actual,
    expected,
    results.map((result) => `${result.write ? '--write' : 'dry-run'}: ${result.out.trim()}`).join('\n'),
  );
});

test('regression: mirror treats missing and unknown issue types as executable', () => {
  const result = runMirrorFixture({
    inventory: JSON.stringify([
      {
        id: 'dude-missing-type',
        status: 'closed',
        description: `spec: ${SPEC_PATH}\nTask: T002@bbbbbbbb`,
      },
      {
        id: 'dude-unknown-type',
        issue_type: 'custom-work-item',
        status: 'in_progress',
        description: `spec: ${SPEC_PATH}\nTask: T004@dddddddd`,
      },
    ]),
  });

  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /2 state\(s\) would change/);
  assert.deepEqual(result.tasksAfter, result.tasksBefore);
  assert.deepEqual(result.ideaAfter, result.ideaBefore);
});

// FR-032 / plan §18: every exact-feature, non-epic, keyed executable issue whose
// normalized status has no canonical glyph — i.e. anything that is not one of
// open, in_progress/in-progress/inprogress, blocked, closed, done, and that is
// not the deferred case already covered above — must be REJECTED before
// mirrorMap builds its map, reported with issue id, task key, and normalized
// status, in BOTH dry-run and write modes, leaving tasks.md and the owner idea
// ledger byte-for-byte unchanged with no partial application of the rest of the
// batch. On the pre-fix code these statuses have `glyph === undefined` and are
// SILENTLY DROPPED (neither mirrored nor reported), so mirror instead succeeds
// and (in --write) partially applies the supported siblings — each row below is
// RED until the executable-status guard lands.
const UNSUPPORTED_MIRROR_STATUS_SCENARIOS = [
  // #1: paused — a plausible near-term Beads status.
  { name: 'paused', id: 'dude-paused-task', status: 'paused', statusShown: /status=paused(?=\s|$)/ },
  // #2: future/unknown statuses.
  { name: 'future-archived', id: 'dude-archived-task', status: 'archived', statusShown: /status=archived(?=\s|$)/ },
  { name: 'future-wontfix', id: 'dude-wontfix-task', status: 'wontfix', statusShown: /status=wontfix(?=\s|$)/ },
  // #2: missing/empty status — the issue carries neither `status` nor `state`,
  // so the normalized status is the empty string and is shown as a bare
  // `status=` (immediately followed by the newline before the guidance line).
  { name: 'missing', id: 'dude-missing-status-task', status: undefined, statusShown: /status=(?=\s|$)/ },
];

for (const scenario of UNSUPPORTED_MIRROR_STATUS_SCENARIOS) {
  test(`regression: mirror rejects a ${scenario.name} executable status in dry-run and write modes`, () => {
    /** @type {{ id: string, type: string, status?: string, description: string }} */
    const rejected = {
      id: scenario.id,
      type: 'task',
      description: `spec: ${SPEC_PATH}\nTask: T002@bbbbbbbb`,
    };
    if (scenario.status !== undefined) rejected.status = scenario.status;
    const inventory = JSON.stringify([
      rejected,
      // A SUPPORTED sibling in the same batch (T003 is [~] in the fixture;
      // closed -> [x]). It must never be partially applied when the batch is
      // rejected, so its presence turns any silent-drop-then-mirror into a real
      // byte change under --write.
      {
        id: 'dude-supported-sibling',
        type: 'task',
        status: 'closed',
        description: `spec: ${SPEC_PATH}\nTask: T003@cccccccc`,
      },
    ]);
    const results = [false, true].map((write) => runMirrorFixture({ inventory, write }));
    const actual = results.map((result) => ({
      mode: result.write ? '--write' : 'dry-run',
      code: result.code,
      unsupported: /unsupported executable Beads issue/i.test(result.out),
      issueId: new RegExp(scenario.id).test(result.out),
      taskKey: /T002@bbbbbbbb/.test(result.out),
      status: scenario.statusShown.test(result.out),
      claimsSuccess: /\[OK\]|state\(s\) would change/i.test(result.out),
      siblingUnapplied: !/- \[x\] T003@cccccccc/.test(result.tasksAfter.toString()),
      tasksUnchanged: result.tasksAfter.equals(result.tasksBefore),
      ideaUnchanged: result.ideaAfter.equals(result.ideaBefore),
    }));
    const expected = ['dry-run', '--write'].map((mode) => ({
      mode,
      code: 2,
      unsupported: true,
      issueId: true,
      taskKey: true,
      status: true,
      claimsSuccess: false,
      siblingUnapplied: true,
      tasksUnchanged: true,
      ideaUnchanged: true,
    }));

    assert.deepEqual(
      actual,
      expected,
      results.map((result) => `${result.write ? '--write' : 'dry-run'}: ${result.out.trim()}`).join('\n'),
    );
  });
}

test('regression: mirror applies every supported status spelling and skips the deferred feature epic', () => {
  // Guard (stays GREEN before and after the fix): every canonical glyph spelling
  // still mirrors, and a deferred EPIC that carries a task key is skipped as the
  // feature epic — never rejected as an unsupported executable issue.
  const tasks = [
    '## Statuses',
    '- [~] T010@aaaaaaa1 open target',
    '- [ ] T011@aaaaaaa2 in_progress underscore',
    '- [ ] T012@aaaaaaa3 in-progress hyphen',
    '- [ ] T013@aaaaaaa4 inprogress joined',
    '- [ ] T014@aaaaaaa5 blocked target',
    '- [ ] T015@aaaaaaa6 closed target',
    '- [ ] T016@aaaaaaa7 done target',
    '- [!] T017@aaaaaaa8 epic-only target',
    '',
  ].join('\n');
  const inventory = JSON.stringify([
    { id: 'i-open', type: 'task', status: 'open', description: `spec: ${SPEC_PATH}\nTask: T010@aaaaaaa1` },
    { id: 'i-underscore', type: 'task', status: 'in_progress', description: `spec: ${SPEC_PATH}\nTask: T011@aaaaaaa2` },
    { id: 'i-hyphen', type: 'task', status: 'in-progress', description: `spec: ${SPEC_PATH}\nTask: T012@aaaaaaa3` },
    { id: 'i-joined', type: 'task', status: 'inprogress', description: `spec: ${SPEC_PATH}\nTask: T013@aaaaaaa4` },
    { id: 'i-blocked', type: 'task', status: 'blocked', description: `spec: ${SPEC_PATH}\nTask: T014@aaaaaaa5` },
    { id: 'i-closed', type: 'task', status: 'closed', description: `spec: ${SPEC_PATH}\nTask: T015@aaaaaaa6` },
    { id: 'i-done', type: 'task', status: 'done', description: `spec: ${SPEC_PATH}\nTask: T016@aaaaaaa7` },
    // deferred EPIC with a task key -> skipped as the feature epic, not rejected.
    { id: 'i-epic', type: 'epic', status: 'deferred', description: `spec: ${SPEC_PATH}\nTask: T017@aaaaaaa8` },
  ]);

  const result = runMirrorFixture({ inventory, tasks, write: true });

  assert.equal(result.code, 0, result.out);
  assert.doesNotMatch(result.out, /unsupported executable Beads issue/i, result.out);
  assert.match(result.out, /mirrored 7 state\(s\)/, result.out);
  const after = result.tasksAfter.toString();
  assert.match(after, /- \[ \] T010@aaaaaaa1 /, after); // open
  assert.match(after, /- \[~\] T011@aaaaaaa2 /, after); // in_progress
  assert.match(after, /- \[~\] T012@aaaaaaa3 /, after); // in-progress
  assert.match(after, /- \[~\] T013@aaaaaaa4 /, after); // inprogress
  assert.match(after, /- \[!\] T014@aaaaaaa5 /, after); // blocked
  assert.match(after, /- \[x\] T015@aaaaaaa6 /, after); // closed
  assert.match(after, /- \[x\] T016@aaaaaaa7 /, after); // done
  // deferred epic skipped: its keyed line is untouched (stays blocked).
  assert.match(after, /- \[!\] T017@aaaaaaa8 /, after);
  assert.deepEqual(result.ideaAfter, result.ideaBefore);
});

const STRUCTURAL_MIRROR_SCENARIOS = [
  {
    name: 'duplicate canonical task ids with exact one-header mapping',
    tasks: FIXTURE.replace(
      '- [ ] T002@bbbbbbbb [US1] Schema\n',
      '- [ ] T002@bbbbbbbb [US1] Schema\n- [~] T002@bbbbbbbb Duplicate canonical header\n',
    ),
    taskKey: 'T002@bbbbbbbb',
    expected: /duplicate task id T002@bbbbbbbb|duplicate canonical task/i,
  },
  {
    name: 'malformed task header glyph',
    tasks: FIXTURE.replace('- [ ] T002@bbbbbbbb', '- [z] T002@bbbbbbbb'),
    expected: /malformed task line|malformed task header|structural issues/i,
  },
  {
    name: 'dangling task dependency',
    tasks: FIXTURE.replace('deps: T001@aaaaaaaa', 'deps: T999@eeeeeeee'),
    expected: /depends on unknown id T999@eeeeeeee|dangling dependency|structural issues/i,
  },
  {
    name: 'unbalanced board start fence',
    tasks: `<!-- dude:board:start -->\n${FIXTURE}`,
    expected: /board fence|unbalanced/i,
  },
  {
    name: 'unbalanced board end fence',
    tasks: `<!-- dude:board:end -->\n${FIXTURE}`,
    expected: /board fence|unbalanced/i,
  },
  {
    name: 'duplicate board fence pair',
    tasks: `<!-- dude:board:start -->\n<!-- dude:board:end -->\n<!-- dude:board:start -->\n<!-- dude:board:end -->\n${FIXTURE}`,
    expected: /board fence|duplicate.*fence/i,
  },
  {
    name: 'nested board fence pair',
    tasks: `<!-- dude:board:start -->\n<!-- dude:board:start -->\n<!-- dude:board:end -->\n<!-- dude:board:end -->\n${FIXTURE}`,
    expected: /board fence|nested/i,
  },
];

for (const scenario of STRUCTURAL_MIRROR_SCENARIOS) {
  test(`regression: mirror rejects ${scenario.name} before changing bytes`, () => {
    const inventory = JSON.stringify([
      {
        id: 'dude-structural-update',
        type: 'task',
        status: 'closed',
        description: `spec: ${SPEC_PATH}\nTask: ${scenario.taskKey || 'T003@cccccccc'}`,
      },
    ]);
    const results = [false, true].map((write) => runMirrorFixture({
      inventory,
      tasks: scenario.tasks,
      write,
    }));
    const actual = results.map((result) => rejectionObservation(result, scenario.expected));

    assert.deepEqual(
      actual,
      [EXPECTED_REJECTION, EXPECTED_REJECTION],
      results.map((result) => `${result.write ? '--write' : 'dry-run'}: ${result.out.trim()}`).join('\n'),
    );
  });
}

const INVALID_MIRROR_INVENTORIES = [
  { name: 'malformed JSON', inventory: '{', expected: /malformed JSON/i },
  { name: 'unknown envelope', inventory: '{"items":[]}', expected: /unrecognized JSON shape/i },
  { name: 'non-array issues property', inventory: '{"issues":{}}', expected: /unrecognized JSON shape/i },
  { name: 'non-object issue', inventory: '[null]', expected: /malformed issue at index 0/i },
  {
    name: 'issue without string description',
    inventory: '[{"id":"dude-no-description","type":"task","status":"closed"}]',
    expected: /issue at index 0 is missing a string description/i,
  },
];

for (const scenario of INVALID_MIRROR_INVENTORIES) {
  test(`regression: mirror strictly rejects ${scenario.name} inventory`, () => {
    const results = [false, true].map((write) => runMirrorFixture({
      inventory: scenario.inventory,
      write,
    }));
    const actual = results.map((result) => rejectionObservation(result, scenario.expected));

    assert.deepEqual(
      actual,
      [EXPECTED_REJECTION, EXPECTED_REJECTION],
      results.map((result) => `${result.write ? '--write' : 'dry-run'}: ${result.out.trim()}`).join('\n'),
    );
  });
}

test('regression: mirror accepts strict array and issues-envelope inventories', () => {
  const issue = {
    id: 'dude-valid-task',
    type: 'task',
    status: 'closed',
    description: `spec: ${SPEC_PATH}\nTask: T002@bbbbbbbb`,
  };
  const inventories = [
    ['JSON array', JSON.stringify([issue])],
    ['issues envelope', JSON.stringify({ issues: [issue] })],
  ];
  const expectedTasks = Buffer.from(
    FIXTURE.replace('- [ ] T002@bbbbbbbb [US1] Schema', '- [x] T002@bbbbbbbb [US1] Schema'),
  );

  for (const [name, inventory] of inventories) {
    const dryRun = runMirrorFixture({ inventory });
    assert.equal(dryRun.code, 0, `${name}: ${dryRun.out}`);
    assert.match(dryRun.out, /1 state\(s\) would change/, name);
    assert.deepEqual(dryRun.tasksAfter, dryRun.tasksBefore, name);
    assert.deepEqual(dryRun.ideaAfter, dryRun.ideaBefore, name);

    const write = runMirrorFixture({ inventory, write: true });
    assert.equal(write.code, 0, `${name}: ${write.out}`);
    assert.match(write.out, /mirrored 1 state\(s\)/, name);
    assert.deepEqual(write.tasksAfter, expectedTasks, name);
    assert.deepEqual(write.ideaAfter, write.ideaBefore, name);
  }
});

test('beads.mjs mirror --write blocks invalid owners before inventory read or task write', () => {
  const scenarios = [
    {
      name: 'missing ideas root',
      mutate: ({ root }) => fs.rmSync(path.join(root, '.dude/ideas'), { recursive: true }),
      expected: /FEATURE_IDEAS_ROOT_MISSING/,
    },
    {
      name: 'missing defined owner',
      mutate: ({ idea }) => fs.rmSync(idea),
      expected: /FEATURE_OWNER_NOT_FOUND/,
    },
    {
      name: 'duplicate defined owners',
      mutate: ({ root }) => writeFixture(root, '.dude/ideas/duplicate.md', ideaLedger(SPEC_PATH, 'defined', 'Duplicate.')),
      expected: /FEATURE_OWNER_DUPLICATE/,
    },
    {
      name: 'mismatched defined owner',
      mutate: ({ root, idea }) => {
        writeFixture(root, '.dude/specs/other/spec.md', '# Other\n');
        fs.writeFileSync(idea, ideaLedger('.dude/specs/other/spec.md'));
      },
      expected: /FEATURE_OWNER_NOT_FOUND/,
    },
    // FR-029 (T034): strict owner-metadata violations, staged from .github, so
    // they stay RED (the stale engine resolves an owner and mirror proceeds to
    // the inventory read) until the Coder regenerates .github with the strict
    // grammar and the FEATURE_DRAFT_SPEC_PATH diagnostic.
    {
      name: 'quoted canonical key',
      mutate: ({ idea }) => fs.writeFileSync(
        idea,
        ideaLedger().replace('---\nstatus: defined', '---\n"title": Example\nstatus: defined'),
      ),
      expected: /FEATURE_FRONTMATTER_MALFORMED/,
    },
    {
      name: 'draft owner with resolvable spec_path',
      mutate: ({ root }) => {
        writeFixture(root, '.dude/specs/draftish/spec.md', '# Draftish\n');
        writeFixture(root, '.dude/ideas/draftish.md', ideaLedger('.dude/specs/draftish/spec.md', 'draft', 'Draftish.'));
      },
      expected: /FEATURE_DRAFT_SPEC_PATH/,
    },
    {
      name: 'unsupported top-level data',
      mutate: ({ idea }) => fs.writeFileSync(
        idea,
        ideaLedger().replace('\n---\n\n## Idea', '\n- orphan\n---\n\n## Idea'),
      ),
      expected: /FEATURE_FRONTMATTER_MALFORMED/,
    },
  ];

  for (const scenario of scenarios) {
    const fixture = stage();
    try {
      const tasksBefore = fs.readFileSync(fixture.file);
      scenario.mutate(fixture);
      const unreadInventory = path.join(fixture.root, 'must-not-be-read.json');

      const result = runNode(fixture.script, [
        'mirror', fixture.file,
        '--from', unreadInventory,
        '--spec', SPEC_PATH,
        '--root', fixture.root,
        '--write',
      ]);

      assert.equal(result.code, 2, `${scenario.name}: ${result.out}`);
      assert.match(result.out, scenario.expected, scenario.name);
      assert.doesNotMatch(result.out, /must-not-be-read/, scenario.name);
      assert.deepEqual(fs.readFileSync(fixture.file), tasksBefore, scenario.name);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('beads.mjs mirror --write rejects unrelated resolver errors before inventory read or mutation', () => {
  const fixture = stage();
  try {
    const tasksBefore = fs.readFileSync(fixture.file);
    writeFixture(fixture.root, '.dude/ideas/unrelated.md', 'not frontmatter\n');
    const unreadInventory = path.join(fixture.root, 'must-not-be-read.json');

    const result = runNode(fixture.script, [
      'mirror',
      fixture.file,
      '--from',
      unreadInventory,
      '--spec',
      SPEC_PATH,
      '--root',
      fixture.root,
      '--write',
    ]);

    assert.equal(result.code, 2, result.out);
    assert.match(result.out, /\.dude\/ideas\/unrelated\.md.*FEATURE_FRONTMATTER_MALFORMED/s);
    assert.doesNotMatch(result.out, /must-not-be-read/);
    assert.deepEqual(fs.readFileSync(fixture.file), tasksBefore);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('beads.mjs imports only the feature library and exposes no compatibility validator', () => {
  const source = fs.readFileSync(beadsSrc, 'utf8');
  assert.match(
    source,
    /import \{ resolveFeatureOwner \} from '\.\.\/dude-engine\/lib\/feature\.mjs';/,
  );
  assert.doesNotMatch(source, /dude-engine\/feature\.mjs|feature-identity\.mjs/);
  assert.doesNotMatch(source, /validateDefinedIdeaIdentity/);

  const coreSource = fs.readFileSync(path.join(repo, 'src/skills/dude-engine/lib/feature.mjs'), 'utf8');
  assert.doesNotMatch(coreSource, /dude-pack-beads|beads\.mjs|library\/packs\/beads/);
});

test('beads.mjs mirror --write succeeds despite unrelated directories', () => {
  const { root, script, file } = stage();
  try {
    const bdFile = path.join(root, 'bd.json');
    fs.writeFileSync(bdFile, JSON.stringify([
      { description: 'spec: .dude/specs/x/spec.md\nTask: T002@bbbbbbbb', status: 'closed' },
    ]));
    writeFixture(root, 'notes/archive/readme.md', '# Unrelated\n');

    const result = runNode(script, [
      'mirror',
      file,
      '--from',
      bdFile,
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
      '--write',
    ]);

    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /mirrored 1 state\(s\)/);
    assert.match(fs.readFileSync(file, 'utf8'), /- \[x\] T002@bbbbbbbb/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs refuses a noncanonical feature identity without migration advice', () => {
  const { root, script, file } = stage();
  try {
    const result = runNode(script, [
      'plan-import',
      file,
      '--spec',
      'specs/x/spec.md',
      '--root',
      root,
    ]);
    assert.equal(result.code, 2);
    assert.match(result.out, /feature identity requires canonical \.dude\/specs\/<feature>\/\{spec\.md,tasks\.md\} paths/);
    assert.doesNotMatch(result.out, /migrat/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('beads.mjs mirror --write rejects symlinked canonical targets before inventory read or task write', { skip: POSIX_SKIP }, () => {
  for (const target of ['tasks.md', 'spec.md']) {
    const fixture = stage();
    try {
      const targetPath = path.join(fixture.root, '.dude/specs/x', target);
      const outside = writeFixture(fixture.root, `outside-${target}`, target === 'tasks.md' ? FIXTURE : '# Outside\n');
      const tasksBefore = fs.readFileSync(fixture.file);
      fs.rmSync(targetPath);
      fs.symlinkSync(outside, targetPath);
      const result = runNode(fixture.script, [
        'mirror', fixture.file,
        '--from', path.join(fixture.root, 'must-not-be-read.json'),
        '--spec', SPEC_PATH,
        '--root', fixture.root,
        '--write',
      ]);

      assert.equal(result.code, 2, `${target}: ${result.out}`);
      assert.match(result.out, /unsafe mutation target.*contains symbolic link/, target);
      assert.doesNotMatch(result.out, /must-not-be-read/, target);
      if (target === 'tasks.md') assert.deepEqual(fs.readFileSync(outside), tasksBefore, target);
      else assert.deepEqual(fs.readFileSync(fixture.file), tasksBefore, target);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

// --- T006 tracked lane trust boundary ----------------------------------------
//
// The closed `work-project`, `work-transition`, `work-prove-poststate`, and
// `work-reconcile-owner` integration matrix. Every refusal case asserts an
// undispatched, byte-unchanged authority AND that the returned evidence hash
// equals an independently recomputed fresh observation.

const TRACKED_SPEC = '.dude/specs/009-tracked/spec.md';
const TRACKED_IDEA = '.dude/ideas/tracked.md';
const TRACKED_ISSUE_ID = 'bd-101';
const TRACKED_TASK_KEY = 'T001@74726b64';
const TRACKED_TARGET = { specPath: TRACKED_SPEC, lane: 'tracked', issueId: TRACKED_ISSUE_ID };
const TRACKED_RUN_STATE = {
  policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, parallel: 1, mode: 'autonomous' },
  overallUsed: 0,
  recoveryUsed: [],
  pending: [],
  completed: [],
};

/** @param {Buffer|string} value */
function trackedCapture(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return { base64: bytes.toString('base64'), sha256: sha256(bytes), byteLength: bytes.byteLength };
}

/** @param {Buffer|string} value */
function trackedDescriptor(value) {
  const captured = trackedCapture(value);
  return { sha256: captured.sha256, byteLength: captured.byteLength };
}

function trackedIssueFixture(overrides = {}) {
  return {
    id: TRACKED_ISSUE_ID,
    title: `${TRACKED_TASK_KEY} Tracked unit`,
    description: `spec: ${TRACKED_SPEC}\nTask: ${TRACKED_TASK_KEY} Tracked unit`,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    notes: '',
    updated_at: '2026-07-25T00:00:00Z',
    ...overrides,
  };
}

function trackedOtherIssue() {
  return {
    id: 'bd-102',
    title: 'T002@6f746865 Other unit',
    description: `spec: ${TRACKED_SPEC}\nTask: T002@6f746865 Other unit`,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    notes: '',
    updated_at: '2026-07-25T00:00:00Z',
  };
}

/** @param {string} hash @param {Record<string, unknown>} issue */
function trackedHistoryEvent(hash, issue) {
  return { CommitHash: hash, Committer: 'fixture', CommitDate: '2026-07-25T00:00:00Z', Issue: { ...issue } };
}

/** Mirror the projector's authorized description effect from outside. */
function trackedDescriptionWith(description, blocker) {
  if (blocker.kind === 'unchanged') return description;
  const lines = description.split('\n');
  const index = lines.findIndex((line) => /^Blocked-by: /.test(line));
  if (blocker.kind === 'add') return `${description}\nBlocked-by: ${blocker.after}`;
  if (blocker.kind === 'remove') return lines.filter((_, position) => position !== index).join('\n');
  lines[index] = `Blocked-by: ${blocker.after}`;
  return lines.join('\n');
}

/** Mirror the projector's authorized notes effect from outside. */
function trackedNotesWith(notes, eventLines) {
  if (eventLines.kind !== 'append-exact') return notes;
  const current = typeof notes === 'string' ? notes : '';
  let next = current === '' || current.endsWith('\n') ? current : `${current}\n`;
  for (const line of eventLines.lines) {
    if (!current.split('\n').includes(line.exactLine)) next += `${line.exactLine}\n`;
  }
  return next;
}

/** An in-memory Beads authority the wrapper drives through its injected port. */
function trackedStore(options = {}) {
  const store = {
    issue: trackedIssueFixture(options.issue),
    others: [trackedOtherIssue()],
    history: /** @type {any[]} */ ([]),
    dispatches: 0,
    driftAfterDispatch: options.driftAfterDispatch ?? null,
    externalDrift: options.externalDrift ?? null,
  };
  store.history = [trackedHistoryEvent('c0', store.issue)];
  store.capture = (kind) => {
    if (kind === 'list') return JSON.stringify([...store.others, store.issue]);
    if (kind === 'detail') return JSON.stringify([store.issue]);
    return JSON.stringify(store.history);
  };
  store.dispatch = (target, mutation) => {
    store.dispatches += 1;
    const next = {
      ...store.issue,
      status: mutation.toStatus,
      description: trackedDescriptionWith(store.issue.description, mutation.blocker),
      notes: trackedNotesWith(store.issue.notes, mutation.eventLines),
      updated_at: '2026-07-25T06:00:00Z',
    };
    const result = JSON.stringify([next]);
    store.issue = store.driftAfterDispatch ? { ...next, ...store.driftAfterDispatch } : next;
    store.history = [trackedHistoryEvent('c1', store.issue), ...store.history];
    return result;
  };
  store.ports = { capture: (kind) => store.capture(kind), dispatch: (t, m) => store.dispatch(t, m) };
  return store;
}

/** @param {string} root @param {any} store */
function trackedObservation(root, store) {
  const ownerAbsolute = path.join(root, ...TRACKED_IDEA.split('/'));
  return sha256(canonicalJson({
    detail: trackedDescriptor(store.capture('detail')),
    history: trackedDescriptor(store.capture('history')),
    list: trackedDescriptor(store.capture('list')),
    owner: fs.existsSync(ownerAbsolute) ? trackedDescriptor(fs.readFileSync(ownerAbsolute)) : null,
  }));
}

/** @param {string} seed */
function trackedEvent(seed) {
  const body = { type: 'tracked-boundary-probe', version: 1, seed };
  return { ...body, eventHash: sha256(canonicalJson(body)) };
}

/** @param {Record<string, unknown>} event */
function trackedEventLine(event) {
  return { eventHash: event.eventHash, exactLine: `- dude-run-event: ${canonicalJson(event)}`, terminator: 'LF' };
}

/** @param {Record<string, unknown>[]} events */
function trackedEventEffect(events) {
  return { kind: 'append-exact', lines: events.map(trackedEventLine), appendIfAbsent: true };
}

/** @param {string} root @param {string[]} lines */
function trackedOwnerAppend(root, lines) {
  return {
    kind: 'append-exact',
    ownerPath: TRACKED_IDEA,
    expectedOwnerHash: sha256(fs.readFileSync(path.join(root, ...TRACKED_IDEA.split('/')))),
    exactLines: lines,
    terminator: 'LF',
    appendIfAbsent: true,
  };
}

/** @param {Record<string, unknown>} overrides */
function trackedMutation(overrides = {}) {
  return {
    version: 1,
    lane: 'tracked',
    kind: 'claim',
    reason: 'initial-claim',
    target: TRACKED_TARGET,
    fromStatus: 'open',
    toStatus: 'in_progress',
    blocker: { kind: 'unchanged', before: null, after: null },
    eventLines: trackedEventEffect([trackedEvent('claim')]),
    ownerLog: { kind: 'none' },
    ...overrides,
  };
}

/** @param {Record<string, unknown>} overrides */
function trackedProjectionMutation(overrides = {}) {
  return trackedMutation({
    kind: 'append-event',
    reason: 'event-projection',
    fromStatus: 'open',
    toStatus: 'open',
    eventLines: trackedEventEffect([trackedEvent('tracked-projection')]),
    ...overrides,
  });
}

/**
 * Build one complete valid tracked request from the CURRENT authority state.
 * @param {string} root @param {any} store
 * @param {{operation?:string,mutation?:any,state?:any,originalCaptures?:any,lanePrestateHash?:string,ownerBytes?:Buffer,extra?:Record<string,unknown>}} [options]
 */
function trackedRequest(root, store, options = {}) {
  const operation = options.operation ?? 'work-transition';
  const mutation = options.mutation ?? trackedMutation();
  const state = options.state ?? TRACKED_RUN_STATE;
  const ownerBytes = options.ownerBytes ?? fs.readFileSync(path.join(root, ...TRACKED_IDEA.split('/')));
  const ownerCapture = trackedCapture(ownerBytes);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: TRACKED_IDEA,
    specPath: TRACKED_SPEC,
    ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  }));
  const live = {
    list: store.capture('list'),
    detail: store.capture('detail'),
    history: store.capture('history'),
  };
  const descriptors = options.originalCaptures ?? {
    list: trackedDescriptor(live.list),
    detail: trackedDescriptor(live.detail),
    history: trackedDescriptor(live.history),
  };
  const mapping = {
    version: 1,
    lane: 'tracked',
    target: TRACKED_TARGET,
    ownerBindingHash,
    taskKey: TRACKED_TASK_KEY,
    listDescriptor: descriptors.list,
    detailDescriptor: descriptors.detail,
    historyDescriptor: descriptors.history,
  };
  const prestate = {
    version: 1,
    lane: 'tracked',
    target: TRACKED_TARGET,
    taskKey: TRACKED_TASK_KEY,
    status: JSON.parse(live.detail)[0].status,
    blocker: (/^Blocked-by: (.*)$/m.exec(JSON.parse(live.detail)[0].description) || [null, null])[1],
    listDescriptor: descriptors.list,
    detailDescriptor: descriptors.detail,
    historyDescriptor: descriptors.history,
    ownerDescriptor: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  };
  const bound = {
    target: TRACKED_TARGET,
    subjectRunStateHash: sha256(canonicalJson(state)),
    targetMappingHash: sha256(canonicalJson(mapping)),
    lanePrestateHash: options.lanePrestateHash ?? sha256(canonicalJson(prestate)),
    mutationIdentity: sha256(canonicalJson(mutation)),
  };
  const permitBody = operation === 'work-project'
    ? {
      version: 1,
      kind: 'lane-projection',
      origin: 'dude-work',
      lane: 'tracked',
      ...bound,
      batchIdentity: sha256('tracked-batch'),
      eventHash: mutation.eventLines.lines[0].eventHash,
    }
    : {
      version: 1,
      kind: 'lane-mutation',
      origin: 'dude-work',
      lane: 'tracked',
      operation: 'work-transition',
      ...bound,
      governanceIdentity: null,
      governancePhase: null,
      attemptIdentity: null,
    };
  const request = {
    version: 1,
    operation,
    root,
    owner: { ideaPath: TRACKED_IDEA, specPath: TRACKED_SPEC, ownerCapture, ownerBindingHash },
    target: TRACKED_TARGET,
    state,
    permit: { ...permitBody, permitHash: sha256(canonicalJson(permitBody)) },
    mapping,
  };
  if (operation === 'work-project' || operation === 'work-transition') {
    Object.assign(request, {
      expected: {
        list: trackedCapture(live.list),
        detail: trackedCapture(live.detail),
        history: trackedCapture(live.history),
      },
      mutation,
    });
  }
  return { ...request, ...(options.extra ?? {}) };
}

/** Stage the installed layout plus a tracked feature owner under a canonical root. */
function stageTracked(ideaOverrides = {}) {
  const fixture = stage();
  writeFixture(fixture.root, TRACKED_SPEC, '# Spec Tracked\n');
  writeFixture(
    fixture.root,
    TRACKED_IDEA,
    `---\nstatus: defined\nspec_path: ${ideaOverrides.specPath ?? TRACKED_SPEC}\n---\n\n## Idea\n\nTracked lane.\n\n## Coordinator Log\n\n- Existing entry.\n`,
  );
  return { ...fixture, root: fs.realpathSync(fixture.root) };
}

/** The sentinel the boundary reports when no capture was acquired. */
const TRACKED_UNOBSERVED_HASH = sha256(canonicalJson({ detail: null, history: null, list: null, owner: null }));

/**
 * @param {any} beads @param {string} root @param {any} store @param {unknown} request
 * @param {string} reason @param {string} label @param {{observable?:boolean}} [options]
 */
function assertTrackedRefusal(beads, root, store, request, reason, label, options = {}) {
  const before = { list: store.capture('list'), detail: store.capture('detail'), history: store.capture('history') };
  const dispatchesBefore = store.dispatches;
  const ownerBefore = fs.readFileSync(path.join(root, ...TRACKED_IDEA.split('/')));
  const result = beads.applyTrackedWorkRequest(request, store.ports);
  assert.equal(result.ok, false, `${label}: must refuse`);
  assert.equal(result.phase, 'refused', `${label}: phase`);
  assert.equal(result.reason, reason, `${label}: reason`);
  assert.deepEqual(
    Object.keys(result).sort(),
    ['ok', 'phase', 'reason', 'unchangedPrestateHash'],
    `${label}: closed shape`,
  );
  assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, `${label}: evidence hash shape`);
  assert.equal(
    result.unchangedPrestateHash,
    options.observable === false ? TRACKED_UNOBSERVED_HASH : trackedObservation(root, store),
    `${label}: fresh unchanged evidence`,
  );
  assert.equal(store.dispatches, dispatchesBefore, `${label}: must not dispatch`);
  for (const kind of ['list', 'detail', 'history']) {
    assert.equal(store.capture(kind), before[kind], `${label}: tracked ${kind} authority unchanged`);
  }
  assert.ok(
    fs.readFileSync(path.join(root, ...TRACKED_IDEA.split('/'))).equals(ownerBefore),
    `${label}: owner bytes unchanged`,
  );
  return result;
}

test('T006 tracked work-transition commits a lane-plus-owner composite receipt after fresh poststate proof', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const mutation = trackedMutation({
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
    });
    const request = trackedRequest(fixture.root, store, { mutation });
    const result = beads.applyTrackedWorkRequest(request, store.ports);

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.phase, 'committed');
    assert.equal(store.dispatches, 1, 'exactly one dispatch');
    assert.deepEqual(Object.keys(result.receipt).sort(), [
      'lane', 'laneReceiptHash', 'mutationIdentity', 'ownerLogReceiptHash', 'receiptHash', 'version',
    ], 'only a composite receipt is success');
    const { receiptHash, ...body } = result.receipt;
    assert.equal(receiptHash, sha256(canonicalJson(body)), 'composite receipt hash binds its body');
    assert.equal(result.receipt.mutationIdentity, request.permit.mutationIdentity);
    assert.equal(JSON.parse(store.capture('detail'))[0].status, 'in_progress', 'authorized status applied');
    assert.ok(
      JSON.parse(store.capture('detail'))[0].notes.includes(mutation.eventLines.lines[0].exactLine),
      'exact LF event record on the tracked lane surface',
    );
    const ownerText = fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')), 'utf8');
    assert.ok(ownerText.endsWith('- 2026-07-25T12:00:00Z - tracked claim\n'), 'owner line appended');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked work-project appends exactly one permitted event and refuses its replay', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const mutation = trackedProjectionMutation();
    const result = beads.applyTrackedWorkRequest(
      trackedRequest(fixture.root, store, { operation: 'work-project', mutation }),
      store.ports,
    );

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(JSON.parse(store.capture('detail'))[0].status, 'open', 'projection never changes status');
    assert.equal(
      JSON.parse(store.capture('detail'))[0].notes,
      `${mutation.eventLines.lines[0].exactLine}\n`,
      'exactly one appended LF record',
    );

    const replay = trackedRequest(fixture.root, store, { operation: 'work-project', mutation });
    assertTrackedRefusal(beads, fixture.root, store, replay, 'permit-replayed', 'replayed tracked projection');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked boundary rejects unknown, omitted, and caller-authored fields before dispatch', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const base = () => trackedRequest(fixture.root, store);
    assertTrackedRefusal(beads, fixture.root, store, { ...base(), command: 'bd update bd-101 --status closed' },
      'unknown-field', 'caller command string', { observable: false });
    assertTrackedRefusal(beads, fixture.root, store, { ...base(), autoResolve: true },
      'unknown-field', 'free-form governance flag', { observable: false });
    const missing = base();
    delete missing.expected;
    assertTrackedRefusal(beads, fixture.root, store, missing, 'invalid-request-shape', 'omitted expected captures', { observable: false });
    assertTrackedRefusal(beads, fixture.root, store, { ...base(), version: 2 }, 'invalid-request-shape', 'wrong version', { observable: false });
    const extraMutationField = base();
    extraMutationField.mutation = { ...extraMutationField.mutation, snapshotUpdatedAt: '2026-07-25T12:00:00Z' };
    assertTrackedRefusal(beads, fixture.root, store, extraMutationField, 'unknown-field', 'Lightweight-only mutation field');
    for (const garbage of [null, 'work-transition', 42, [], { operation: 'work-transition' }]) {
      const result = beads.applyTrackedWorkRequest(garbage, store.ports);
      assert.equal(result.ok, false);
      assert.equal(result.phase, 'refused');
      assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, 'closed fail response for garbage input');
    }
    assert.equal(store.dispatches, 0, 'no dispatch from any malformed envelope');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked boundary rejects stale captures, forged descriptors, and mismapped issues', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();

    const stale = trackedRequest(fixture.root, store);
    stale.expected = { ...stale.expected, detail: trackedCapture('[]') };
    assertTrackedRefusal(beads, fixture.root, store, stale, 'expected-capture-mismatch', 'stale expected detail');

    const forgedMapping = trackedRequest(fixture.root, store);
    forgedMapping.mapping = { ...forgedMapping.mapping, historyDescriptor: trackedDescriptor('[]') };
    assertTrackedRefusal(beads, fixture.root, store, forgedMapping, 'mapping-mismatch',
      'mapping descriptor detached from the real capture');

    // D-4: a mapping whose permit was rebuilt over the forged descriptors is
    // internally consistent, so only comparison against the freshly reacquired
    // captures can reject it.
    assertTrackedRefusal(beads, fixture.root, store, trackedRequest(fixture.root, store, {
      originalCaptures: {
        list: trackedDescriptor('[]'),
        detail: trackedDescriptor('[]'),
        history: trackedDescriptor('[]'),
      },
    }), 'mapping-mismatch', 'self-consistent mapping and permit over a caller-chosen targetMappingHash');

    const forgedTaskKey = trackedRequest(fixture.root, store);
    forgedTaskKey.mapping = { ...forgedTaskKey.mapping, taskKey: 'T999@6f746865' };
    assertTrackedRefusal(beads, fixture.root, store, forgedTaskKey, 'mapping-mismatch', 'durable key that is not the issue mapping');

    // D-4: rebuilding the permit over the forged durable key makes the whole
    // envelope self-consistent, so only the key re-derived from the fresh
    // exact-feature inventory can reject it.
    const selfConsistentKey = trackedRequest(fixture.root, store);
    selfConsistentKey.mapping = { ...selfConsistentKey.mapping, taskKey: 'T999@6f746865' };
    const keyPermitBody = { ...selfConsistentKey.permit };
    delete keyPermitBody.permitHash;
    keyPermitBody.targetMappingHash = sha256(canonicalJson(selfConsistentKey.mapping));
    selfConsistentKey.permit = { ...keyPermitBody, permitHash: sha256(canonicalJson(keyPermitBody)) };
    assertTrackedRefusal(beads, fixture.root, store, selfConsistentKey, 'mapping-mismatch',
      'self-consistent mapping and permit over a caller-chosen durable task key');

    const forgedOwner = trackedRequest(fixture.root, store);
    forgedOwner.owner = { ...forgedOwner.owner, ownerBindingHash: sha256('forged binding') };
    assertTrackedRefusal(beads, fixture.root, store, forgedOwner, 'owner-resolution-failed', 'forged owner binding hash', { observable: false });

    const ambiguous = trackedStore();
    ambiguous.others = [{ ...trackedOtherIssue(), id: 'bd-103', title: `${TRACKED_TASK_KEY} duplicate`, description: `spec: ${TRACKED_SPEC}\nTask: ${TRACKED_TASK_KEY} duplicate` }];
    assertTrackedRefusal(beads, fixture.root, ambiguous, trackedRequest(fixture.root, ambiguous),
      'mapping-ambiguous', 'two issues claiming one durable task key');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked boundary rejects hand-built, transferred, and mismatched permits before dispatch', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();

    const forgedPrestate = trackedRequest(fixture.root, store, { lanePrestateHash: sha256('chosen prestate') });
    assertTrackedRefusal(beads, fixture.root, store, forgedPrestate, 'lane-prestate-mismatch',
      'hand-built permit over a caller-chosen prestate');

    const tampered = trackedRequest(fixture.root, store);
    tampered.permit = { ...tampered.permit, permitHash: sha256('nope') };
    assertTrackedRefusal(beads, fixture.root, store, tampered, 'permit-hash-mismatch', 'permit hash that does not bind its body');

    const transferred = trackedRequest(fixture.root, store);
    const transferredBody = { ...transferred.permit };
    delete transferredBody.permitHash;
    transferredBody.target = { specPath: TRACKED_SPEC, lane: 'tracked', issueId: 'bd-102' };
    transferred.permit = { ...transferredBody, permitHash: sha256(canonicalJson(transferredBody)) };
    assertTrackedRefusal(beads, fixture.root, store, transferred, 'target-mismatch', 'permit transferred from another issue');

    const wrongLane = trackedRequest(fixture.root, store);
    const wrongLaneBody = { ...wrongLane.permit };
    delete wrongLaneBody.permitHash;
    wrongLaneBody.kind = 'lane-projection';
    wrongLane.permit = { ...wrongLaneBody, permitHash: sha256(canonicalJson(wrongLaneBody)) };
    assertTrackedRefusal(beads, fixture.root, store, wrongLane, 'permit-hash-mismatch',
      'work-transition carrying a projection permit');

    // A complete, well-formed permit for the OTHER lane is still transferred:
    // the lane binding is checked before target, state, or mapping.
    const crossLane = trackedRequest(fixture.root, store);
    const crossLaneBody = { ...crossLane.permit };
    delete crossLaneBody.permitHash;
    crossLaneBody.lane = 'lightweight';
    crossLaneBody.operation = 'work-set';
    crossLaneBody.target = { specPath: TRACKED_SPEC, lane: 'lightweight', taskKey: TRACKED_TASK_KEY };
    crossLane.permit = { ...crossLaneBody, permitHash: sha256(canonicalJson(crossLaneBody)) };
    assertTrackedRefusal(beads, fixture.root, store, crossLane, 'permit-operation-mismatch',
      'permit transferred from the Lightweight lane');

    const projectionWithMutationPermit = trackedRequest(fixture.root, store, {
      operation: 'work-project',
      mutation: trackedProjectionMutation(),
    });
    projectionWithMutationPermit.permit = trackedRequest(fixture.root, store).permit;
    assertTrackedRefusal(beads, fixture.root, store, projectionWithMutationPermit, 'permit-operation-mismatch',
      'work-project carrying a lane-mutation permit');

    const staleRunState = trackedRequest(fixture.root, store);
    staleRunState.state = { ...TRACKED_RUN_STATE, policy: { ...TRACKED_RUN_STATE.policy, overall: 4 } };
    assertTrackedRefusal(beads, fixture.root, store, staleRunState, 'run-state-mismatch',
      'run state that is not the permit subject');

    const wrongIdentity = trackedRequest(fixture.root, store);
    wrongIdentity.mutation = { ...wrongIdentity.mutation, reason: 'resume-claim' };
    assertTrackedRefusal(beads, fixture.root, store, wrongIdentity, 'mutation-identity-mismatch',
      'mutation that is not the permitted object');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked boundary rejects disallowed transitions, prestate drift, and unhashed event lines', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();

    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, { mutation: trackedMutation({ toStatus: 'closed' }) }),
      'transition-not-allowed', 'claim straight to closed');

    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, { mutation: trackedMutation({ reason: 'task-completed' }) }),
      'mutation-schema-mismatch', 'reason that does not match its kind');

    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, {
        mutation: trackedMutation({
          fromStatus: 'blocked',
          blocker: { kind: 'remove', before: 'waiting', after: null },
        }),
      }),
      'lane-prestate-mismatch', 'fromStatus that contradicts the fresh authority');

    const event = trackedEvent('claim');
    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, {
        mutation: trackedMutation({
          eventLines: {
            kind: 'append-exact',
            lines: [{ eventHash: event.eventHash, exactLine: `- dude-run-event: ${canonicalJson({ event })}`, terminator: 'LF' }],
            appendIfAbsent: true,
          },
        }),
      }),
      'event-line-mismatch', 'legacy CJ({event}) wrapper');

    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, {
        mutation: trackedMutation({
          eventLines: {
            kind: 'append-exact',
            lines: [{ eventHash: event.eventHash, exactLine: `- dude-run-event: ${canonicalJson(event)}`, terminator: 'CRLF' }],
            appendIfAbsent: true,
          },
        }),
      }),
      'event-line-mismatch', 'non-LF terminator');

    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, {
        mutation: trackedMutation({ ownerLog: { ...trackedOwnerAppend(fixture.root, ['- stale']), expectedOwnerHash: sha256('stale') } }),
      }),
      'owner-prestate-mismatch', 'stale expected owner hash');

    // Transferred effects: the permit is rebuilt over each mutation, so only
    // the boundary's own target and owner comparisons can reject them.
    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, {
        mutation: trackedMutation({ target: { specPath: TRACKED_SPEC, lane: 'tracked', issueId: 'bd-102' } }),
      }),
      'target-mismatch', 'mutation carrying another issue target');

    assertTrackedRefusal(beads, fixture.root, store,
      trackedRequest(fixture.root, store, {
        mutation: trackedMutation({
          ownerLog: {
            ...trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
            ownerPath: '.dude/ideas/other.md',
          },
        }),
      }),
      'owner-log-conflict', 'owner log naming another owner');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked dispatch reports a pending poststate proof on unrelated drift without redispatch', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore({ driftAfterDispatch: { priority: 9 } });
    const mutation = trackedMutation({
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
    });
    const ownerBefore = fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')));
    const result = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, { mutation }), store.ports);

    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.phase, 'tracked-operation-dispatched');
    assert.equal(result.reason, 'tracked-poststate-proof-pending');
    assert.equal(store.dispatches, 1, 'exactly one dispatch and no redispatch');
    assert.equal(result.receipt, undefined, 'a dispatched result carries no lane receipt');
    assert.match(result.recoveryIdentity, /^[0-9a-f]{64}$/);
    assert.equal(result.recoveryIdentity, sha256(canonicalJson({
      version: 1,
      stage: 'tracked-operation-dispatched',
      operationEvidenceIdentity: result.operationEvidence.operationEvidenceIdentity,
      payloadIdentity: result.recoveryPayload.payloadIdentity,
      mutationIdentity: result.operationEvidence.mutationIdentity,
      target: TRACKED_TARGET,
      expectedNextOperation: 'work-prove-poststate',
    })), 'stage-bound recovery identity');
    assert.ok(
      fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/'))).equals(ownerBefore),
      'owner is untouched while the lane proof is pending',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked dispatch withholds the composite receipt when the owner stage fails', async (context) => {
  if (process.platform === 'win32') return context.skip('POSIX permission semantics differ on Windows');
  if (process.getuid?.() === 0) return context.skip('root ignores write permissions');
  const fixture = stageTracked();
  const ownerAbsolute = path.join(fixture.root, ...TRACKED_IDEA.split('/'));
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const mutation = trackedMutation({
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
    });
    const request = trackedRequest(fixture.root, store, { mutation });
    const ownerBefore = fs.readFileSync(ownerAbsolute);

    fs.chmodSync(ownerAbsolute, 0o444);
    const result = beads.applyTrackedWorkRequest(request, store.ports);
    fs.chmodSync(ownerAbsolute, 0o644);

    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.phase, 'tracked-lane-committed');
    assert.equal(result.reason, 'owner-log-receipt-pending');
    assert.equal(result.receipt, undefined, 'no composite receipt without an owner-log receipt');
    assert.equal(store.dispatches, 1, 'exactly one dispatch and no redispatch');
    assert.ok(fs.readFileSync(ownerAbsolute).equals(ownerBefore), 'owner bytes unchanged');
    assert.equal(result.recoveryIdentity, sha256(canonicalJson({
      version: 1,
      stage: 'tracked-lane-committed',
      laneReceiptHash: result.laneReceipt.receiptHash,
      operationEvidenceIdentity: result.operationEvidence.operationEvidenceIdentity,
      payloadIdentity: result.recoveryPayload.payloadIdentity,
      mutationIdentity: result.operationEvidence.mutationIdentity,
      target: TRACKED_TARGET,
      expectedNextOperation: 'work-reconcile-owner',
    })), 'stage-bound owner recovery identity');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked recovery proves the poststate and idempotently reconciles the owner without redispatch', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore({ driftAfterDispatch: { priority: 9 } });
    const mutation = trackedMutation({
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
    });
    const ownerPreimage = fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')));
    const dispatched = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, { mutation }), store.ports);
    assert.equal(dispatched.phase, 'tracked-operation-dispatched');

    // The unrelated drift is corrected outside Work; the proof must now succeed.
    store.issue = { ...store.issue, priority: 2 };
    store.history = [trackedHistoryEvent('c1', store.issue), store.history[store.history.length - 1]];
    const originalCaptures = dispatched.operationEvidence.originalCaptures;
    const live = {
      list: store.capture('list'),
      detail: store.capture('detail'),
      history: store.capture('history'),
    };
    const proofRequest = trackedRequest(fixture.root, store, {
      operation: 'work-prove-poststate',
      mutation,
      originalCaptures,
      lanePrestateHash: dispatched.operationEvidence.lanePrestateHash,
      extra: {
        operationEvidence: dispatched.operationEvidence,
        recoveryPayload: dispatched.recoveryPayload,
        recoveryIdentity: dispatched.recoveryIdentity,
        observed: {
          list: trackedCapture(live.list),
          detail: trackedCapture(live.detail),
          history: trackedCapture(live.history),
        },
      },
    });
    const proven = beads.applyTrackedWorkRequest(proofRequest, store.ports);
    assert.equal(proven.phase, 'tracked-lane-committed', JSON.stringify(proven));
    assert.equal(proven.reason, 'owner-log-receipt-pending');
    assert.equal(store.dispatches, 1, 'poststate proof never redispatches');
    assert.equal(proven.laneReceipt.lanePoststateHash, sha256(canonicalJson(proven.laneReceipt.poststateCaptures)));
    assert.deepEqual(
      proven.laneReceipt.eventLineRecordHashes,
      [sha256(`${mutation.eventLines.lines[0].exactLine}\n`)],
      'exact LF record hashes',
    );

    const ownerRequest = () => trackedRequest(fixture.root, store, {
      operation: 'work-reconcile-owner',
      mutation,
      originalCaptures,
      ownerBytes: ownerPreimage,
      lanePrestateHash: dispatched.operationEvidence.lanePrestateHash,
      extra: {
        operationEvidence: proven.operationEvidence,
        recoveryPayload: proven.recoveryPayload,
        laneReceipt: proven.laneReceipt,
        recoveryIdentity: proven.recoveryIdentity,
        observed: {
          list: trackedCapture(store.capture('list')),
          detail: trackedCapture(store.capture('detail')),
          history: trackedCapture(store.capture('history')),
          owner: trackedCapture(fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')))),
        },
      },
    });
    const reconciled = beads.applyTrackedWorkRequest(ownerRequest(), store.ports);
    assert.equal(reconciled.ok, true, JSON.stringify(reconciled));
    assert.equal(reconciled.phase, 'committed');
    assert.equal(reconciled.ownerReceipt.effect, 'append-exact');
    assert.equal(reconciled.receipt.laneReceiptHash, proven.laneReceipt.receiptHash);
    const ownerAfterFirst = fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')));
    assert.ok(ownerAfterFirst.toString('utf8').endsWith('- 2026-07-25T12:00:00Z - tracked claim\n'));

    const again = beads.applyTrackedWorkRequest(ownerRequest(), store.ports);
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/'))),
      ownerAfterFirst,
      'owner reconciliation is exactly idempotent',
    );
    assert.equal(store.dispatches, 1, 'owner reconciliation never dispatches');

    // The lane must still prove at reconciliation time. A tracked authority
    // that drifted after the lane receipt yields no composite receipt.
    const provenIssue = store.issue;
    store.issue = { ...store.issue, status: 'closed' };
    const driftedLane = beads.applyTrackedWorkRequest(ownerRequest(), store.ports);
    assert.equal(driftedLane.ok, false, JSON.stringify(driftedLane));
    assert.equal(driftedLane.phase, 'indeterminate');
    assert.equal(driftedLane.reason, 'owner-log-outcome-ambiguous');
    assert.equal(driftedLane.receipt, undefined, 'a drifted lane yields no composite receipt');
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/'))),
      ownerAfterFirst,
      'a drifted lane leaves the owner byte-unchanged',
    );
    store.issue = provenIssue;

    // An owner that is neither the exact preimage nor the deterministic
    // single-append postimage is unrecoverably ambiguous, never reconciled.
    fs.appendFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')), '- unrelated external edit\n');
    const diverged = fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')));
    const ambiguous = beads.applyTrackedWorkRequest(ownerRequest(), store.ports);
    assert.equal(ambiguous.ok, false, JSON.stringify(ambiguous));
    assert.equal(ambiguous.phase, 'indeterminate');
    assert.equal(ambiguous.reason, 'owner-log-outcome-ambiguous');
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/'))),
      diverged,
      'an ambiguous owner is left byte-unchanged',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked recovery operations never return refused', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    for (const [operation, reason] of [
      ['work-prove-poststate', 'tracked-lane-outcome-ambiguous'],
      ['work-reconcile-owner', 'owner-log-outcome-ambiguous'],
    ]) {
      for (const request of [
        { version: 1, operation },
        { version: 1, operation, root: fixture.root, bogus: true },
        { ...trackedRequest(fixture.root, store), operation },
      ]) {
        const result = beads.applyTrackedWorkRequest(request, store.ports);
        assert.equal(result.ok, false, operation);
        assert.equal(result.phase, 'indeterminate', `${operation}: no refusal is permitted after possible mutation`);
        assert.equal(result.reason, reason, operation);
        assert.match(result.observedEvidenceHash, /^[0-9a-f]{64}$/, operation);
      }
    }
    assert.equal(store.dispatches, 0, 'recovery operations never dispatch');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// Every boundary read must happen inside the boundary's own `try`. A request
// object with a throwing accessor is the cheapest proof: before the fix the
// `operation` read escaped as a raw Error instead of a closed refusal.
test('T006 tracked boundary returns a closed refusal for a throwing request accessor', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const probes = [
      ['throwing own accessor', Object.defineProperty({ version: 1 }, 'operation', {
        get() { throw new Error('operation accessor'); },
        enumerable: true,
        configurable: true,
      })],
      ['throwing proxy get trap', new Proxy({ version: 1, operation: 'work-transition' }, {
        get() { throw new Error('proxy get'); },
      })],
      ['throwing proxy prototype trap', new Proxy({ version: 1 }, {
        getPrototypeOf() { throw new Error('proxy getPrototypeOf'); },
      })],
    ];
    for (const [label, probe] of probes) {
      /** @type {any} */
      let result;
      assert.doesNotThrow(
        () => { result = beads.applyTrackedWorkRequest(probe, store.ports); },
        `${label}: no open throw may escape the boundary`,
      );
      assert.equal(result.ok, false, label);
      assert.equal(result.phase, 'refused', `${label}: a throwing envelope is refused, never indeterminate`);
      assert.equal(result.reason, 'invalid-request-shape', label);
      assert.deepEqual(
        Object.keys(result).sort(),
        ['ok', 'phase', 'reason', 'unchangedPrestateHash'],
        `${label}: closed shape`,
      );
      assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, `${label}: evidence hash shape`);
    }
    assert.equal(store.dispatches, 0, 'a throwing envelope never dispatches');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// `controlled-end` is a contract-named kind: the tracked status is deliberately
// unchanged, so only the event surface (and any owner log) may move.
test('T006 tracked controlled-end records the end without changing the tracked status', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const mutation = trackedMutation({
      kind: 'controlled-end',
      reason: 'controlled-unresolved-end',
      fromStatus: 'open',
      toStatus: 'open',
      eventLines: trackedEventEffect([trackedEvent('tracked-controlled-end')]),
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - controlled unresolved end']),
    });
    const result = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, { mutation }), store.ports);

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.phase, 'committed');
    assert.equal(store.dispatches, 1, 'exactly one dispatch');
    assert.equal(JSON.parse(store.capture('detail'))[0].status, 'open', 'a controlled end never changes status');
    assert.ok(
      JSON.parse(store.capture('detail'))[0].notes.includes(mutation.eventLines.lines[0].exactLine),
      'the controlled end is recorded on the tracked lane surface',
    );
    assert.ok(
      fs.readFileSync(path.join(fixture.root, ...TRACKED_IDEA.split('/')), 'utf8')
        .endsWith('- 2026-07-25T12:00:00Z - controlled unresolved end\n'),
      'the owner log still records the end',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('T006 tracked controlled-end refuses a closed issue and any status change', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const controlledEnd = (overrides) => trackedMutation({
      kind: 'controlled-end',
      reason: 'controlled-unresolved-end',
      fromStatus: 'open',
      toStatus: 'open',
      eventLines: trackedEventEffect([trackedEvent('tracked-controlled-end')]),
      ...overrides,
    });
    assertTrackedRefusal(
      beads,
      fixture.root,
      store,
      trackedRequest(fixture.root, store, { mutation: controlledEnd({ fromStatus: 'closed', toStatus: 'closed' }) }),
      'transition-not-allowed',
      'controlled end over a closed issue',
    );
    assertTrackedRefusal(
      beads,
      fixture.root,
      store,
      trackedRequest(fixture.root, store, { mutation: controlledEnd({ toStatus: 'in_progress' }) }),
      'transition-not-allowed',
      'controlled end that moves the status',
    );
    assertTrackedRefusal(
      beads,
      fixture.root,
      store,
      trackedRequest(fixture.root, store, { mutation: controlledEnd({ reason: 'task-blocked' }) }),
      'mutation-schema-mismatch',
      'controlled end with a reason from another kind',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// The injected authority port is the only tracked I/O path, so every way it can
// fail has to land on one closed reason. A failure BEFORE `ports.dispatch` is
// invoked refuses; a failure once it has been invoked can no longer claim an
// unchanged authority, so it is indeterminate.
test('T006 tracked boundary refuses every authority port failure', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    const request = () => trackedRequest(fixture.root, store);
    const healthy = (kind) => store.capture(kind);
    /** @type {[string, any, string][]} */
    const ports = [
      ['no capture port', {}, 'refused'],
      ['capture throws', { capture: () => { throw new Error('bd unavailable'); } }, 'refused'],
      ['capture returns a non-buffer', { capture: () => 42 }, 'refused'],
      ['capture returns unparseable JSON', { capture: () => 'not json' }, 'refused'],
      ['detail capture is not exactly one issue', {
        capture: (kind) => (kind === 'detail' ? JSON.stringify([]) : healthy(kind)),
      }, 'refused'],
      ['history capture is not an array', {
        capture: (kind) => (kind === 'history' ? JSON.stringify({}) : healthy(kind)),
      }, 'refused'],
      ['history event carries an unexpected shape', {
        capture: (kind) => (kind === 'history' ? JSON.stringify([{ CommitHash: 'c0' }]) : healthy(kind)),
      }, 'refused'],
      ['history event names another issue', {
        capture: (kind) => (kind === 'history'
          ? JSON.stringify([trackedHistoryEvent('c0', trackedOtherIssue())])
          : healthy(kind)),
      }, 'refused'],
      ['no dispatch port', { capture: healthy }, 'refused'],
      ['dispatch throws', { capture: healthy, dispatch: () => { throw new Error('bd write failed'); } }, 'indeterminate'],
      ['dispatch returns a non-buffer', { capture: healthy, dispatch: () => 42 }, 'indeterminate'],
    ];
    for (const [label, port, phase] of ports) {
      const before = { list: healthy('list'), detail: healthy('detail'), history: healthy('history') };
      const result = beads.applyTrackedWorkRequest(request(), port);
      assert.equal(result.ok, false, label);
      assert.equal(result.phase, phase, label);
      if (phase === 'refused') {
        assert.equal(result.reason, 'tracked-operation-failed', label);
        assert.deepEqual(
          Object.keys(result).sort(),
          ['ok', 'phase', 'reason', 'unchangedPrestateHash'],
          `${label}: closed shape`,
        );
      } else {
        assert.equal(result.reason, 'tracked-lane-outcome-ambiguous', label);
        assert.deepEqual(
          Object.keys(result).sort(),
          ['observedEvidenceHash', 'ok', 'phase', 'reason'],
          `${label}: closed shape`,
        );
      }
      assert.equal(store.dispatches, 0, `${label}: no authorized dispatch`);
      for (const kind of ['list', 'detail', 'history']) {
        assert.equal(healthy(kind), before[kind], `${label}: tracked ${kind} authority unchanged`);
      }
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// A stub port that replaces `store.dispatch` cannot prove this: it never
// mutates, so every surface is trivially unchanged. The window in which a
// refusal becomes a lie opens when `ports.dispatch` is INVOKED, not when it
// returns. These ports genuinely apply the authoritative write and then fail,
// so a `refused` here would hand the host the prestate hash as proof that
// nothing happened and invite a redispatch over an already-applied write.
test('T006 tracked dispatch that applied the write and then failed is indeterminate, never refused', async () => {
  /** @type {[string, (store: any) => any][]} */
  const variants = [
    ['applied then threw', (store) => ({
      capture: (kind) => store.capture(kind),
      dispatch: (target, mutation) => {
        store.dispatch(target, mutation);
        throw new Error('bd applied the write and then failed');
      },
    })],
    ['applied then returned a non-buffer', (store) => ({
      capture: (kind) => store.capture(kind),
      dispatch: (target, mutation) => {
        store.dispatch(target, mutation);
        return 42;
      },
    })],
  ];
  for (const [label, buildPort] of variants) {
    const fixture = stageTracked();
    try {
      const beads = await importStagedBeads(fixture);
      const store = trackedStore();
      const request = trackedRequest(fixture.root, store);
      const before = JSON.parse(store.capture('detail'))[0];
      const result = beads.applyTrackedWorkRequest(request, buildPort(store));

      assert.equal(result.ok, false, label);
      assert.equal(result.phase, 'indeterminate', `${label}: a dispatched write may never be reported refused`);
      assert.equal(result.reason, 'tracked-lane-outcome-ambiguous', label);
      assert.equal(result.unchangedPrestateHash, undefined, `${label}: no unchanged-prestate claim`);
      assert.deepEqual(
        Object.keys(result).sort(),
        ['observedEvidenceHash', 'ok', 'phase', 'reason'],
        `${label}: closed shape`,
      );
      assert.match(result.observedEvidenceHash, /^[0-9a-f]{64}$/, label);

      // The authority really moved, so the refusal would have been a lie.
      assert.equal(store.dispatches, 1, `${label}: the authority port applied exactly one write`);
      assert.equal(before.status, 'open', `${label}: prestate`);
      const after = JSON.parse(store.capture('detail'))[0];
      assert.equal(after.status, 'in_progress', `${label}: tracked detail reflects the applied mutation`);
      assert.ok(
        after.notes.includes(request.mutation.eventLines.lines[0].exactLine),
        `${label}: tracked notes reflect the applied event line`,
      );
      assert.equal(
        JSON.parse(store.capture('history')).length,
        2,
        `${label}: tracked history recorded the applied write`,
      );
      assert.ok(
        JSON.parse(store.capture('list')).some((issue) => issue.id === TRACKED_TARGET.issueId && issue.status === 'in_progress'),
        `${label}: tracked list reflects the applied mutation`,
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('T006 tracked boundary refuses unsafe roots, absent mappings, and noncanonical values', async () => {
  const fixture = stageTracked();
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore();
    assertTrackedRefusal(beads, fixture.root, store, { ...trackedRequest(fixture.root, store), root: path.join(fixture.root, 'missing') },
      'unsafe-root-or-path', 'missing root', { observable: false });
    assertTrackedRefusal(beads, fixture.root, store, { ...trackedRequest(fixture.root, store), root: `${fixture.root}/` },
      'unsafe-root-or-path', 'noncanonical root', { observable: false });

    const badOwnerPath = trackedRequest(fixture.root, store);
    badOwnerPath.owner = { ...badOwnerPath.owner, ideaPath: 'ideas/tracked.md' };
    assertTrackedRefusal(beads, fixture.root, store, badOwnerPath, 'invalid-canonical-value',
      'owner path outside .dude/ideas', { observable: false });

    const badTaskKey = trackedRequest(fixture.root, store);
    badTaskKey.mapping = { ...badTaskKey.mapping, taskKey: 'T001' };
    assertTrackedRefusal(beads, fixture.root, store, badTaskKey, 'invalid-canonical-value',
      'mapping task key that is not a durable key');

    const event = trackedEvent('duplicate');
    assertTrackedRefusal(
      beads,
      fixture.root,
      store,
      trackedRequest(fixture.root, store, { mutation: trackedMutation({ eventLines: trackedEventEffect([event, event]) }) }),
      'event-conflict',
      'same event hash twice in one effect',
    );

    // The target issue is absent from the complete exact-feature inventory.
    const absent = trackedStore();
    absent.capture = (kind) => {
      if (kind === 'list') return JSON.stringify(absent.others);
      if (kind === 'detail') return JSON.stringify([absent.issue]);
      return JSON.stringify(absent.history);
    };
    assertTrackedRefusal(beads, fixture.root, absent, trackedRequest(fixture.root, absent), 'mapping-missing',
      'target issue absent from the feature inventory');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// Regression: both post-dispatch surface calls (`acquireTrackedSurfaces` and
// the normalization inside `trackedPoststateProven`) can refuse. After the
// authority write, a refusal would claim an unchanged prestate that no longer
// holds AND would strip the recovery payload, leaving the Work host with no
// `work-prove-poststate` path. Only the pending phase is correct.
test('T006 tracked dispatch reports a pending poststate proof when post-dispatch capture or mapping fails', async () => {
  const fixture = stageTracked();
  const ownerAbsolute = path.join(fixture.root, ...TRACKED_IDEA.split('/'));
  try {
    const beads = await importStagedBeads(fixture);
    /** @type {[string, (store:any)=>any][]} */
    const scenarios = [
      ['post-dispatch capture throws', (store) => ({
        capture: (kind) => {
          if (store.dispatches >= 1) throw new Error('bd unavailable after the write');
          return store.capture(kind);
        },
        dispatch: (target, mutation) => store.dispatch(target, mutation),
      })],
      ['post-dispatch inventory no longer resolves the issue', (store) => ({
        capture: (kind) => (store.dispatches >= 1 && kind === 'list'
          ? JSON.stringify(store.others)
          : store.capture(kind)),
        dispatch: (target, mutation) => store.dispatch(target, mutation),
      })],
    ];
    for (const [label, portsFor] of scenarios) {
      const store = trackedStore();
      const mutation = trackedMutation({
        ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
      });
      const request = trackedRequest(fixture.root, store, { mutation });
      const ownerBefore = fs.readFileSync(ownerAbsolute);
      const result = beads.applyTrackedWorkRequest(request, portsFor(store));

      assert.equal(result.ok, false, `${label}: ${JSON.stringify(result)}`);
      assert.notEqual(result.phase, 'refused', `${label}: no refusal may follow an authoritative dispatch`);
      assert.equal(result.phase, 'tracked-operation-dispatched', label);
      assert.equal(result.reason, 'tracked-poststate-proof-pending', label);
      assert.equal(result.unchangedPrestateHash, undefined, `${label}: no unchanged-prestate claim`);
      assert.equal(store.dispatches, 1, `${label}: exactly one dispatch and no redispatch`);
      assert.equal(result.receipt, undefined, `${label}: a dispatched result carries no receipt`);
      assert.match(result.operationEvidence.operationEvidenceIdentity, /^[0-9a-f]{64}$/, label);
      assert.match(result.recoveryPayload.payloadIdentity, /^[0-9a-f]{64}$/, label);
      assert.equal(result.recoveryIdentity, sha256(canonicalJson({
        version: 1,
        stage: 'tracked-operation-dispatched',
        operationEvidenceIdentity: result.operationEvidence.operationEvidenceIdentity,
        payloadIdentity: result.recoveryPayload.payloadIdentity,
        mutationIdentity: result.operationEvidence.mutationIdentity,
        target: TRACKED_TARGET,
        expectedNextOperation: 'work-prove-poststate',
      })), `${label}: stage-bound recovery identity survives the post-dispatch failure`);
      assert.ok(
        fs.readFileSync(ownerAbsolute).equals(ownerBefore),
        `${label}: owner untouched while the lane proof is pending`,
      );
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// Regression: `work-reconcile-owner` is the final trust gate and its
// `laneReceipt` is a caller-supplied record. A self-consistent hash proves only
// that the caller hashed its own claim, so every field is re-derived from the
// values already bound at this boundary before it is embedded in the only
// success artifact the feature produces.
test('T006 tracked owner reconciliation re-derives every field of the caller-supplied lane receipt', async () => {
  const fixture = stageTracked();
  const ownerAbsolute = path.join(fixture.root, ...TRACKED_IDEA.split('/'));
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore({ driftAfterDispatch: { priority: 9 } });
    const mutation = trackedMutation({
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
    });
    const ownerPreimage = fs.readFileSync(ownerAbsolute);
    const dispatched = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, { mutation }), store.ports);
    assert.equal(dispatched.phase, 'tracked-operation-dispatched', JSON.stringify(dispatched));

    store.issue = { ...store.issue, priority: 2 };
    store.history = [trackedHistoryEvent('c1', store.issue), store.history[store.history.length - 1]];
    const originalCaptures = dispatched.operationEvidence.originalCaptures;
    const lanePrestateHash = dispatched.operationEvidence.lanePrestateHash;
    const observedNow = (withOwner) => {
      const captures = {
        list: trackedCapture(store.capture('list')),
        detail: trackedCapture(store.capture('detail')),
        history: trackedCapture(store.capture('history')),
      };
      return withOwner ? { ...captures, owner: trackedCapture(fs.readFileSync(ownerAbsolute)) } : captures;
    };
    const proven = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, {
      operation: 'work-prove-poststate',
      mutation,
      originalCaptures,
      lanePrestateHash,
      extra: {
        operationEvidence: dispatched.operationEvidence,
        recoveryPayload: dispatched.recoveryPayload,
        recoveryIdentity: dispatched.recoveryIdentity,
        observed: observedNow(false),
      },
    }), store.ports);
    assert.equal(proven.phase, 'tracked-lane-committed', JSON.stringify(proven));

    /** Forge lane receipt fields, rehash the receipt, and rebind its stage identity. */
    const forged = (overrides) => {
      const body = { ...proven.laneReceipt, ...overrides };
      delete body.receiptHash;
      const laneReceipt = { ...body, receiptHash: sha256(canonicalJson(body)) };
      return trackedRequest(fixture.root, store, {
        operation: 'work-reconcile-owner',
        mutation,
        originalCaptures,
        ownerBytes: ownerPreimage,
        lanePrestateHash,
        extra: {
          operationEvidence: proven.operationEvidence,
          recoveryPayload: proven.recoveryPayload,
          laneReceipt,
          recoveryIdentity: sha256(canonicalJson({
            version: 1,
            stage: 'tracked-lane-committed',
            laneReceiptHash: laneReceipt.receiptHash,
            operationEvidenceIdentity: proven.operationEvidence.operationEvidenceIdentity,
            payloadIdentity: proven.recoveryPayload.payloadIdentity,
            mutationIdentity: proven.operationEvidence.mutationIdentity,
            target: TRACKED_TARGET,
            expectedNextOperation: 'work-reconcile-owner',
          })),
          observed: observedNow(true),
        },
      });
    };

    const brokenCaptures = {
      list: trackedDescriptor('forged list'),
      detail: trackedDescriptor('forged detail'),
      history: { sha256: 'not-a-hash', byteLength: 3 },
    };
    /** @type {[string, Record<string, unknown>][]} */
    const cases = [
      ['forged version', { version: 2 }],
      ['forged lane', { lane: 'lightweight' }],
      ['forged permitHash', { permitHash: sha256('another permit') }],
      ['forged target', { target: { ...TRACKED_TARGET, issueId: 'bd-999' } }],
      ['forged targetMappingHash', { targetMappingHash: sha256('another mapping') }],
      ['forged lanePrestateHash', { lanePrestateHash: sha256('another prestate') }],
      ['lanePoststateHash inconsistent with its own captures', { lanePoststateHash: sha256('another poststate') }],
      ['poststateCaptures that are not descriptors', {
        poststateCaptures: brokenCaptures,
        lanePoststateHash: sha256(canonicalJson(brokenCaptures)),
      }],
      ['fabricated eventLineRecordHashes', { eventLineRecordHashes: [sha256('- dude-run-event: fabricated\n')] }],
    ];
    for (const [label, overrides] of cases) {
      const ownerBefore = fs.readFileSync(ownerAbsolute);
      const result = beads.applyTrackedWorkRequest(forged(overrides), store.ports);
      assert.equal(result.ok, false, `${label}: a forged lane receipt must not commit (${JSON.stringify(result)})`);
      assert.equal(result.phase, 'indeterminate', label);
      assert.equal(result.reason, 'owner-log-outcome-ambiguous', label);
      assert.equal(result.receipt, undefined, `${label}: no composite receipt launders a forged lane receipt`);
      assert.equal(store.dispatches, 1, `${label}: no redispatch`);
      assert.ok(fs.readFileSync(ownerAbsolute).equals(ownerBefore), `${label}: owner bytes unchanged`);
    }

    // The unforged receipt still commits, so the matrix above is not vacuous.
    const honest = beads.applyTrackedWorkRequest(forged({}), store.ports);
    assert.equal(honest.ok, true, JSON.stringify(honest));
    assert.equal(honest.receipt.laneReceiptHash, proven.laneReceipt.receiptHash);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// Regression: `ownerLog.kind:"append-exact"` requires a matching owner path AND
// a matching expected owner hash. The reconciliation path reached the owner
// append with only the path bound, so an internally inconsistent envelope could
// produce an owner receipt whose `ownerPrestateHash` contradicted its own
// mutation. The dispatching path keeps its pre-dispatch refusal.
test('T006 tracked owner reconciliation refuses an owner-log envelope that names other owner bytes', async () => {
  const fixture = stageTracked();
  const ownerAbsolute = path.join(fixture.root, ...TRACKED_IDEA.split('/'));
  try {
    const beads = await importStagedBeads(fixture);
    const store = trackedStore({ driftAfterDispatch: { priority: 9 } });
    const mutation = trackedMutation({
      ownerLog: trackedOwnerAppend(fixture.root, ['- 2026-07-25T12:00:00Z - tracked claim']),
    });
    const ownerPreimage = fs.readFileSync(ownerAbsolute);
    const dispatched = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, { mutation }), store.ports);
    assert.equal(dispatched.phase, 'tracked-operation-dispatched', JSON.stringify(dispatched));

    store.issue = { ...store.issue, priority: 2 };
    store.history = [trackedHistoryEvent('c1', store.issue), store.history[store.history.length - 1]];
    const originalCaptures = dispatched.operationEvidence.originalCaptures;
    const lanePrestateHash = dispatched.operationEvidence.lanePrestateHash;
    const proven = beads.applyTrackedWorkRequest(trackedRequest(fixture.root, store, {
      operation: 'work-prove-poststate',
      mutation,
      originalCaptures,
      lanePrestateHash,
      extra: {
        operationEvidence: dispatched.operationEvidence,
        recoveryPayload: dispatched.recoveryPayload,
        recoveryIdentity: dispatched.recoveryIdentity,
        observed: {
          list: trackedCapture(store.capture('list')),
          detail: trackedCapture(store.capture('detail')),
          history: trackedCapture(store.capture('history')),
        },
      },
    }), store.ports);
    assert.equal(proven.phase, 'tracked-lane-committed', JSON.stringify(proven));

    // The same mutation with an owner-log envelope naming bytes that are not the
    // declared preimage. Every downstream identity is rebuilt so this envelope
    // is the ONLY inconsistency left in the request.
    const skewed = {
      ...mutation,
      ownerLog: { ...mutation.ownerLog, expectedOwnerHash: sha256('bytes that are not this owner') },
    };
    const request = trackedRequest(fixture.root, store, {
      operation: 'work-reconcile-owner',
      mutation: skewed,
      originalCaptures,
      ownerBytes: ownerPreimage,
      lanePrestateHash,
    });
    const evidenceBody = { ...proven.operationEvidence };
    delete evidenceBody.operationEvidenceIdentity;
    evidenceBody.permitHash = request.permit.permitHash;
    evidenceBody.mutationIdentity = sha256(canonicalJson(skewed));
    const evidence = {
      ...evidenceBody,
      operationEvidenceIdentity: sha256(canonicalJson(evidenceBody)),
    };
    const payloadBody = {
      version: 1,
      operationEvidenceIdentity: evidence.operationEvidenceIdentity,
      original: proven.recoveryPayload.original,
      dispatchResult: proven.recoveryPayload.dispatchResult,
      mutation: skewed,
    };
    const recoveryPayload = { ...payloadBody, payloadIdentity: sha256(canonicalJson(payloadBody)) };
    const receiptBody = { ...proven.laneReceipt };
    delete receiptBody.receiptHash;
    receiptBody.operationEvidenceIdentity = evidence.operationEvidenceIdentity;
    receiptBody.permitHash = request.permit.permitHash;
    receiptBody.mutationIdentity = evidence.mutationIdentity;
    const laneReceipt = { ...receiptBody, receiptHash: sha256(canonicalJson(receiptBody)) };
    Object.assign(request, {
      operationEvidence: evidence,
      recoveryPayload,
      laneReceipt,
      recoveryIdentity: sha256(canonicalJson({
        version: 1,
        stage: 'tracked-lane-committed',
        laneReceiptHash: laneReceipt.receiptHash,
        operationEvidenceIdentity: evidence.operationEvidenceIdentity,
        payloadIdentity: recoveryPayload.payloadIdentity,
        mutationIdentity: evidence.mutationIdentity,
        target: TRACKED_TARGET,
        expectedNextOperation: 'work-reconcile-owner',
      })),
      observed: {
        list: trackedCapture(store.capture('list')),
        detail: trackedCapture(store.capture('detail')),
        history: trackedCapture(store.capture('history')),
        owner: trackedCapture(fs.readFileSync(ownerAbsolute)),
      },
    });

    const ownerBefore = fs.readFileSync(ownerAbsolute);
    const result = beads.applyTrackedWorkRequest(request, store.ports);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.phase, 'indeterminate');
    assert.equal(result.reason, 'owner-log-outcome-ambiguous');
    assert.equal(result.receipt, undefined, 'a skewed owner envelope yields no composite receipt');
    assert.equal(result.ownerReceipt, undefined, 'and no owner-log receipt');
    assert.equal(store.dispatches, 1, 'owner reconciliation never dispatches');
    assert.ok(fs.readFileSync(ownerAbsolute).equals(ownerBefore), 'owner bytes unchanged');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
