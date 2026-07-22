// @ts-check

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseSpecIdentity } from '../dude-engine/lib/feature-identity.mjs';
import { analyzeAppend } from '../dude-memory-ledger/memory.mjs';
import * as recoveryRuntime from './recovery.mjs';

import {
  approachHash,
  authorizeAttempt as authorizeRuntimeAttempt,
  BLOCKER_CODES,
  buildInspection,
  canonicalJson,
  canonicalTarget,
  classifyOutcomeReason,
  collectEvidence,
  completeAttempt,
  contentDescriptor,
  descriptor,
  evidenceHash,
  inspect,
  limits,
  mayContinueAutonomously,
  mayScheduleAfterStop,
  modelPacket,
  OUTCOME_REASON_CLASSES,
  parseInvocation,
  resultHash,
  sha256,
  scanObjectiveRegistry,
  targetHash,
  targetKey,
  validateAssessment,
  validateBlocker,
  validateEvaluationContract,
  validateEvidenceItem,
  validateInspection,
  validateObjectiveRegistry,
  validateRunState,
  validateTarget,
  acquireCheckpoint,
  buildGateSet,
  captureCandidate,
  createEvaluationSequence,
  deriveBindingIdentity,
  deriveCandidateIdentity,
  deriveCheckpointIdentity,
  deriveComparisonDecision,
  deriveSequenceIdentity,
  keepCheckpoint,
  normalizeAuthorizationGate,
  normalizeCheckpointGate,
  normalizeComparisonGate,
  normalizeHardConstraintsGate,
  normalizeIndependentReviewGate,
  qualifiesForKeep,
  releaseCheckpoint,
  restoreCheckpoint,
  settleCandidate,
  stateIdentity,
  validateCandidateWriteSet,
  validateCheckpointHost,
  validateCheckpointRecord,
  validateEvaluationSequences,
  validateEvaluatorJudgment,
  validateFileStateDescriptors,
  validateLearningReviewRefs,
  validateObjectiveObservation,
  writeSetIdentity,
  buildObjectiveComparisonEvent,
  validateObjectiveComparisonEvent,
  buildEvaluationSequenceClosedEvent,
  validateEvaluationSequenceClosedEvent,
  buildLearningReviewEvent,
  validateLearningReviewEvent,
  validateProjectionOwner,
  buildProjectionRecord,
  buildLaneEventLine,
  projectEvent,
  verifyProjection,
  reacquireProjection,
  admitComparisonReference,
  admitLearningReviewReference,
  resolveComparison,
  closeEvaluationSequence,
  settleTaskBoundary,
  renderAuditSummary,
} from './recovery.mjs';

const SPEC_PATH = '.dude/specs/004-pre-work-log-learning/spec.md';
const TASK_KEY = 'T001@8f31c2a7';
const SECOND_TASK_KEY = 'T002@d4a90e6b';
const THIRD_TASK_KEY = 'T003@6c1f8b42';
const OTHER_SPEC_PATH = '.dude/specs/005-other-feature/spec.md';
const IDEA_PATH = '.dude/ideas/owner.md';
const EMPTY_HASH = sha256('');
const TARGET = Object.freeze({ specPath: SPEC_PATH, lane: 'lightweight', taskKey: TASK_KEY });
const TRACKED = Object.freeze({ specPath: SPEC_PATH, lane: 'tracked', issueId: 'dude-42' });
const RECOVERY_SCRIPT = fileURLToPath(new URL('./recovery.mjs', import.meta.url));
const FIXED_RESOURCE_LIMITS = Object.freeze({
  cliRequestBytes: 6_291_456,
  sourceBodyBytes: 1_048_576,
  inspectionBodyBytes: 4_194_304,
  sourceEntries: 64,
  retainedDescriptors: 64,
  errorJsonBytes: 8_192,
});

/** @param {string} name */
function runtimeFunction(name) {
  const value = recoveryRuntime[name];
  assert.equal(typeof value, 'function', `recovery.mjs must export ${name}`);
  return /** @type {(...args: any[]) => any} */ (value);
}

/** @param {string} source @param {string} text @param {boolean} [required] @param {string} [status] */
function evidence(source, text, required = false, status = 'present') {
  return { source, required, status, ...contentDescriptor(text), text };
}

/** @param {string} source @param {boolean} [required] */
function missing(source, required = false) {
  return { source, required, status: 'missing', sha256: EMPTY_HASH, byteLength: 0, text: '' };
}

/** @param {string} [inspectionHash] */
function assessment(inspectionHash = '0'.repeat(64)) {
  return {
    evidenceHash: inspectionHash,
    intent: 'unchanged',
    action: 'retry-task',
    materialInputs: {
      targets: [TASK_KEY],
      operations: ['retry-task'],
      checks: ['verification'],
    },
    equivalence: 'distinct',
    retention: 'transient',
    summary: 'Retry with the inspected evidence.',
  };
}

/** @param {Record<string, unknown>} [policy] */
function emptyState(policy = {}) {
  return {
    policy: {
      overall: 3,
      recovery: 1,
      recover: false,
      untilBlocked: false,
      parallel: 1,
      mode: 'guarded',
      ...policy,
    },
    overallUsed: 0,
    recoveryUsed: [],
    pending: [],
    completed: [],
  };
}

/** @param {unknown} value */
function clone(value) {
  return structuredClone(value);
}

/** @param {(root:string) => void} run */
function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-recovery-'));
  try {
    fs.mkdirSync(path.join(root, '.dude/ideas'), { recursive: true });
    fs.mkdirSync(path.join(root, path.dirname(SPEC_PATH)), { recursive: true });
    fs.writeFileSync(path.join(root, SPEC_PATH), '# Spec\n');
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** @param {string} [specPath] @param {string} [log] */
function ideaBytes(specPath = SPEC_PATH, log = '- exact event\n') {
  return Buffer.from([
    '---',
    'title: Owner',
    'slug: owner',
    'status: defined',
    `spec_path: ${specPath}`,
    '---',
    '',
    '## Idea',
    '',
    'Intent.',
    '',
    '## Coordinator Log',
    '',
    log,
  ].join('\n'));
}

/** @param {string} [targetTask] */
function tasksBytes(targetTask = TASK_KEY) {
  return Buffer.from([
    '<!-- dude:board:start -->',
    '- [!] T999@ffffffff [US9] GENERATED ONLY',
    '<!-- dude:board:end -->',
    '',
    '# Tasks',
    '',
    `- [~] ${targetTask} [US1] Canonical task`,
    '    deps: T000@aaaaaaaa',
    '    blocked-by: waiting',
    '- [x] T000@aaaaaaaa [US1] Dependency',
    '',
    '## Discovered During Execution',
    '- [ ] T9001@bbbbbbbb [Shared] Discovered (Beads: dude-9)',
    '',
    '## Lightweight Execution History',
    '- retained history',
    '',
  ].join('\n'));
}

/** @param {Record<string, unknown>} [overrides] */
function rawInputs(overrides = {}) {
  return {
    directIdeas: [{ path: IDEA_PATH, bytes: ideaBytes() }],
    tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes: tasksBytes() },
    lane: { kind: 'lightweight' },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    ...overrides,
  };
}

/** @param {string} id @param {string | null} [taskKey] @param {Record<string, unknown>} [overrides] */
function trackedCapture(id, taskKey = null, overrides = {}) {
  const issue = {
    id,
    title: taskKey ? `${taskKey} ${id}` : `Discovered ${id}`,
    description: `spec: ${SPEC_PATH}\n${taskKey ? `Task: ${taskKey}` : 'Discovered work'}`,
    status: 'open',
    priority: 2,
    issue_type: 'task',
    ...overrides,
  };
  const detail = {
    ...issue,
    design: 'Observed design',
    acceptance_criteria: 'Observed acceptance',
    notes: 'Observed note',
    owner: 'tester',
    created_at: '2026-07-19T00:00:00Z',
    created_by: 'fixture',
    updated_at: '2026-07-19T00:02:00Z',
  };
  const taskKeyMatch = typeof issue.description === 'string'
    ? issue.description.match(/Task: (T\d+@[0-9a-f]{8})/)
    : null;
  const projectedIssue = {
    issueId: issue.id,
    status: issue.status,
    type: String(issue.issue_type).toLowerCase(),
    title: issue.title,
    description: issue.description,
    ...(taskKeyMatch ? { taskKey: taskKeyMatch[1] } : {}),
    detail: {
      design: detail.design,
      acceptance_criteria: detail.acceptance_criteria,
      notes: detail.notes,
      priority: detail.priority,
      owner: detail.owner,
      created_at: detail.created_at,
      created_by: detail.created_by,
      updated_at: detail.updated_at,
    },
  };
  return {
    issue,
    detailBytes: Buffer.from(canonicalJson([detail])),
    historyBytes: Buffer.from(canonicalJson([{
      CommitHash: `${id}-event`,
      Committer: 'tester',
      CommitDate: '2026-07-19T00:02:00Z',
      Issue: detail,
    }])),
    normalizedRecord: {
      ...projectedIssue,
      history: [{
        commitDate: '2026-07-19T00:02:00Z',
        issue: projectedIssue,
      }],
    },
  };
}

/**
 * @param {ReturnType<typeof trackedCapture>[]} captures
 * @param {Record<string, unknown>[]} [listed]
 */
function trackedRawInputs(captures, listed = captures.map((captureValue) => captureValue.issue)) {
  return rawInputs({
    lane: {
      kind: 'tracked',
      listBytes: Buffer.from(canonicalJson(listed)),
      issues: captures.map(({ detailBytes, historyBytes }) => ({ detailBytes, historyBytes })),
    },
  });
}

/** @param {Record<string, unknown>} target @param {ReturnType<typeof trackedCapture>[]} captures */
function trackedProjection(target, captures) {
  return {
    target: canonicalTarget(target),
    records: captures.map(({ normalizedRecord }) => normalizedRecord)
      .sort((left, right) => Buffer.compare(Buffer.from(String(left.issueId)), Buffer.from(String(right.issueId)))),
  };
}

/**
 * @param {object} target
 * @param {string} state
 * @param {unknown[]} [records]
 */
function capture(target, state, records = []) {
  const normalized = canonicalJson({ target: canonicalTarget(target), state, records });
  const body = canonicalJson({
    target,
    state,
    records: records.map((substantive) => ({ substantive })),
  });
  return { target, state, outcomeHash: sha256(normalized), bytes: Buffer.from(body) };
}

/**
 * @param {object} target
 * @param {string} state
 * @param {Record<string, unknown>} substantive
 * @param {Record<string, unknown>} presentation
 */
function wrappedCapture(target, state, substantive, presentation) {
  const normalized = canonicalJson({
    target: canonicalTarget(target),
    state,
    records: [substantive],
  });
  const body = canonicalJson({
    target: canonicalTarget(target),
    state,
    records: [{ substantive, presentation }],
  });
  return { target, state, outcomeHash: sha256(normalized), bytes: Buffer.from(body) };
}

/** @param {Buffer | string} value */
function byteEnvelope(value) {
  return { base64: Buffer.from(value).toString('base64') };
}

/** @param {Record<string, unknown>} input */
function cliInput(input) {
  const output = { ...input };
  const lane = /** @type {Record<string, unknown>} */ (input.lane);
  output.lane = lane.kind === 'tracked'
    ? {
      ...lane,
      listBytes: byteEnvelope(/** @type {ArrayBufferView} */ (lane.listBytes)),
      issues: /** @type {Record<string, unknown>[]} */ (lane.issues).map((issue) => ({
        detailBytes: byteEnvelope(/** @type {ArrayBufferView} */ (issue.detailBytes)),
        historyBytes: byteEnvelope(/** @type {ArrayBufferView} */ (issue.historyBytes)),
      })),
    }
    : { ...lane };
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(input, field)) continue;
    output[field] = /** @type {Record<string, unknown>[]} */ (input[field]).map((entry) => ({
      ...entry,
      bytes: byteEnvelope(/** @type {ArrayBufferView} */ (entry.bytes)),
    }));
  }
  if (Object.hasOwn(input, 'session')) {
    const session = /** @type {Record<string, unknown>} */ (input.session);
    output.session = Object.hasOwn(session, 'bytes')
      ? { ...session, bytes: byteEnvelope(/** @type {ArrayBufferView} */ (session.bytes)) }
      : { ...session };
  }
  return output;
}

/** @param {string} command @param {unknown} input */
function runRecoveryCli(command, input) {
  return spawnSync(process.execPath, [RECOVERY_SCRIPT, command], {
    encoding: 'utf8',
    input: typeof input === 'string' || Buffer.isBuffer(input) ? input : canonicalJson(input),
  });
}

/** @param {string} root @param {Record<string, unknown>} [target] @param {Record<string, unknown>} [overrides] */
function publicInspectionInput(root, target = TARGET, overrides = {}) {
  return {
    root,
    specPath: target.specPath,
    target,
    lane: { kind: target.lane },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    ...overrides,
  };
}

/** @param {Buffer} base @param {number} expectedBytes */
function sizedMarkdown(base, expectedBytes) {
  assert.ok(base.byteLength <= expectedBytes, 'Markdown fixture exceeds requested size');
  return Buffer.concat([base, Buffer.alloc(expectedBytes - base.byteLength, 0x78)]);
}

/**
 * @param {Record<string, unknown>} target
 * @param {string} state
 * @param {number} expectedBytes
 * @param {string} [id]
 */
function sizedCapture(target, state, expectedBytes, id = 'sized-capture') {
  let payloadLength = expectedBytes;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const substantive = { id, payload: 'x'.repeat(payloadLength) };
    const normalized = canonicalJson({ target: canonicalTarget(target), state, records: [substantive] });
    const body = canonicalJson({ target, state, records: [{ substantive }] });
    const actualBytes = Buffer.byteLength(body);
    if (actualBytes === expectedBytes) {
      return {
        target,
        state,
        outcomeHash: sha256(normalized),
        bytes: Buffer.from(body),
      };
    }
    payloadLength += expectedBytes - actualBytes;
    if (payloadLength < 0) break;
  }
  throw new Error(`could not construct ${expectedBytes}-byte captured JSON fixture`);
}

/** @param {number} total @param {number} count */
function splitBodyBytes(total, count) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0));
}

/** @param {unknown} value */
function reverseJsonObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseJsonObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).reverse().map(([key, entry]) => [key, reverseJsonObjectKeys(entry)]),
  );
}

/** @param {Record<string, unknown>} value */
function duplicateFirstKeyJson(value) {
  const keys = Object.keys(value).sort();
  assert.ok(keys.length > 0, 'duplicate-key fixture requires an object field');
  const key = keys[0];
  return `{${JSON.stringify(key)}:${canonicalJson(value[key])},${canonicalJson(value).slice(1)}`;
}

/** @param {Buffer} bytes @param {string} variant */
function noncanonicalJsonBytes(bytes, variant) {
  const text = bytes.toString('utf8');
  const parsed = JSON.parse(text);
  if (variant === 'whitespace') return Buffer.from(` ${text}`);
  if (variant === 'reordered keys') return Buffer.from(JSON.stringify(reverseJsonObjectKeys(parsed)));
  if (variant === 'duplicate keys') {
    if (Array.isArray(parsed)) {
      assert.ok(parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object');
      return Buffer.from(`[${duplicateFirstKeyJson(parsed[0])}${parsed.length > 1
        ? `,${parsed.slice(1).map((entry) => canonicalJson(entry)).join(',')}`
        : ''}]`);
    }
    return Buffer.from(duplicateFirstKeyJson(parsed));
  }
  if (variant === 'malformed UTF-8') return Buffer.from([0xff, 0x7b, 0x7d]);
  if (variant === 'alternate string escape') {
    const match = /"([^"\\]+)":/.exec(text);
    assert.ok(match && match[1].length > 0, 'string-escape fixture requires an object key');
    const first = match[1][0];
    const escaped = `\\u${first.charCodeAt(0).toString(16).padStart(4, '0')}${match[1].slice(1)}`;
    return Buffer.from(`${text.slice(0, match.index)}"${escaped}":${text.slice(match.index + match[0].length)}`);
  }
  if (variant === 'alternate number spelling') {
    const replaced = text.replace(/:(-?(?:0|[1-9][0-9]*))(?![0-9.eE])/, ':$1e0');
    assert.notEqual(replaced, text, 'number fixture requires a canonical integer');
    return Buffer.from(replaced);
  }
  throw new Error(`unknown noncanonical JSON fixture: ${variant}`);
}

/** @param {ReturnType<typeof runRecoveryCli>} result @param {string} label */
function assertCliRefusal(result, label) {
  assert.notEqual(result.status, 0, `${label}: expected CLI refusal`);
  assert.equal(result.stdout, '', `${label}: errors must not write stdout`);
}

/** @param {string} output @param {string} label */
function parseCanonicalErrorJson(output, label) {
  const byteLength = Buffer.byteLength(output);
  assert.ok(
    byteLength <= FIXED_RESOURCE_LIMITS.errorJsonBytes,
    `${label}: error JSON was ${byteLength} bytes`,
  );
  let payload;
  assert.doesNotThrow(() => { payload = JSON.parse(output); }, `${label}: error must be valid JSON`);
  assert.deepEqual(Object.keys(payload), ['error'], `${label}: error envelope must be fixed`);
  assert.ok(
    payload.error !== null && typeof payload.error === 'object' && !Array.isArray(payload.error),
    `${label}: error must have fixed {error:{code,message}} shape`,
  );
  assert.deepEqual(Object.keys(payload.error), ['code', 'message'], `${label}: error body must be fixed`);
  assert.match(payload.error.code, /^[a-z0-9-]{1,64}$/, `${label}: error code must be canonical`);
  assert.equal(typeof payload.error.message, 'string', `${label}: error message must be text`);
  assert.equal(canonicalJson(payload), output, `${label}: error output must itself be canonical JSON`);
  return { ...payload.error, byteLength };
}

/** @param {ReturnType<typeof runRecoveryCli>} result @param {string} label */
function parseCanonicalCliError(result, label) {
  assertCliRefusal(result, label);
  return parseCanonicalErrorJson(result.stderr, label);
}

/** @param {number} expectedBytes */
function sizedCanonicalCompleteRequest(expectedBytes) {
  const prefix = Buffer.from([
    '{"input":{"approachHash":"', '2'.repeat(64),
    '","evidenceHash":"', '1'.repeat(64),
    '","result":{},"target":{"lane":"lightweight","specPath":".dude/specs/004-',
  ].join(''));
  const suffix = Buffer.from([
    '/spec.md","taskKey":"T001@8f31c2a7"}},"state":{"completed":[],"overallUsed":0,"pending":[],',
    '"policy":{"mode":"guarded","overall":"unlimited","parallel":1,"recover":false,"recovery":1,"untilBlocked":false},',
    '"recoveryUsed":[]}}',
  ].join(''));
  const slugBytes = expectedBytes - prefix.byteLength - suffix.byteLength;
  assert.ok(slugBytes > 0, 'CLI fixture has no room for a canonical slug');
  const request = Buffer.concat([prefix, Buffer.alloc(slugBytes, 0x61), suffix]);
  assert.equal(request.byteLength, expectedBytes);
  return request;
}

/**
 * @param {{id:string,parallel?:boolean,glyph?:string,deps?:string[],blockedBy?:string}[]} tasks
 */
function transitionTasksBytes(tasks) {
  const lines = ['# Tasks', ''];
  tasks.forEach((task, index) => {
    const parallel = task.parallel === false ? '' : ' [P]';
    lines.push(`- [${task.glyph || ' '}] ${task.id}${parallel} [US1] Transition task ${index + 1}`);
    if (task.deps?.length) lines.push(`    deps: ${task.deps.join(', ')}`);
    if (task.blockedBy) lines.push(`    blocked-by: ${task.blockedBy}`);
  });
  lines.push('');
  return Buffer.from(lines.join('\n'));
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} [overrides] */
function transitionRaw(target, overrides = {}) {
  const specPath = /** @type {string} */ (target.specPath);
  const taskKey = typeof target.taskKey === 'string' ? target.taskKey : TASK_KEY;
  return {
    directIdeas: [{ path: IDEA_PATH, bytes: ideaBytes(specPath) }],
    tasks: {
      path: `${specPath.slice(0, -'spec.md'.length)}tasks.md`,
      bytes: transitionTasksBytes([{ id: taskKey }]),
    },
    lane: { kind: target.lane },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    ...overrides,
  };
}

/** @param {string} [specPath] @param {string} [ideaPath] */
function definitionTargets(specPath = SPEC_PATH, ideaPath = IDEA_PATH) {
  const packageRoot = specPath.slice(0, -'spec.md'.length);
  return [
    ideaPath,
    `${packageRoot}plan.md`,
    `${packageRoot}spec.md`,
    `${packageRoot}tasks.md`,
  ];
}

/**
 * @param {string} action
 * @param {{evidenceHash?:string,targets?:string[],checks?:string[],intent?:string,equivalence?:string,retention?:string,summary?:string}} [overrides]
 */
function transitionAssessment(action, overrides = {}) {
  const defaultChecks = {
    'execute-task': ['verification'],
    'retry-task': ['verification'],
    'address-test': ['lint', 'verification'],
    'address-review': ['review', 'verification'],
    'reconcile-derived-definition': ['lint', 'review', 'verification'],
    'retain-learning': ['lint'],
    none: [],
  }[action] || [];
  return {
    evidenceHash: overrides.evidenceHash || '0'.repeat(64),
    intent: overrides.intent || 'unchanged',
    action,
    materialInputs: {
      targets: [...(overrides.targets ?? [TASK_KEY])].sort(),
      operations: action === 'none' ? [] : [action],
      checks: [...(overrides.checks ?? defaultChecks)].sort(),
    },
    equivalence: overrides.equivalence || 'distinct',
    retention: overrides.retention || 'transient',
    summary: overrides.summary || `Use ${action}.`,
  };
}

/** A plan.md body with no active objective-registry region (scans as `none`). @param {string} specPath */
function noRegistryPlanBytes(specPath) {
  return Buffer.from([
    '# Plan',
    '',
    `Technical design for ${specPath}.`,
    '',
    'This plan keeps no active objective registry region.',
    '',
  ].join('\n'));
}

/** @param {Record<string, unknown>} target */
function defaultNoRegistryPlan(target) {
  const specPath = /** @type {string} */ (target.specPath);
  return { path: `${specPath.slice(0, -'spec.md'.length)}plan.md`, bytes: noRegistryPlanBytes(specPath) };
}

/** Inject the required autonomous no-registry plan when the policy is autonomous. @param {Record<string, unknown>} target @param {Record<string, unknown>} raw @param {string} policyMode */
function withPolicyPlan(target, raw, policyMode) {
  if (policyMode !== 'autonomous' || Object.hasOwn(raw, 'definitionPlan')) return raw;
  return { ...raw, definitionPlan: defaultNoRegistryPlan(target) };
}

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown>} candidate
 * @param {unknown} [dependencies]
 * @param {string} [policyMode]
 */
function bindAssessment(target, raw, candidate, dependencies, policyMode = 'guarded') {
  const inspection = buildInspection(target, collectEvidence(target, raw, dependencies, policyMode));
  return { ...candidate, evidenceHash: inspection.evidenceHash };
}

/** @param {Record<string, unknown>} candidate */
function assessmentApproach(candidate) {
  return approachHash(
    /** @type {string} */ (candidate.action),
    candidate.materialInputs,
  );
}

/**
 * @param {unknown} state
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown>} candidate
 * @param {unknown} mode
 * @param {unknown} [dependencies]
 */
function authorizeAttempt(state, target, raw, candidate, mode, dependencies) {
  const policyMode = /** @type {string} */ (
    /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (state ?? {}).policy ?? {}).mode ?? 'guarded'
  );
  const injectedRaw = withPolicyPlan(target, raw, policyMode);
  return authorizeRuntimeAttempt(
    state,
    target,
    injectedRaw,
    bindAssessment(target, injectedRaw, candidate, dependencies, policyMode),
    mode,
    dependencies,
  );
}

/** @param {Record<string, unknown>} pending */
function completionRoute(pending) {
  if (pending.action === 'execute-task' || pending.action === 'retry-task') {
    return `${/** @type {Record<string, unknown>} */ (pending.target).lane}-task`;
  }
  return {
    'address-test': 'test-repair',
    'address-review': 'review-remediation',
    'reconcile-derived-definition': 'definition-reconciliation',
    'retain-learning': 'retention',
  }[/** @type {string} */ (pending.action)];
}

/**
 * @param {Record<string, unknown>} pending
 * @param {Record<string, unknown>} [overrides]
 */
function completionResult(pending, overrides = {}) {
  const inputs = /** @type {Record<string, unknown>} */ (pending.materialInputs);
  const expectedChecks = /** @type {string[]} */ (inputs.checks);
  const outcome = /** @type {string} */ (overrides.outcome || 'succeeded');
  const interrupted = outcome === 'interrupted';
  const checks = {
    verification: !interrupted && expectedChecks.includes('verification') ? 'passed' : 'none',
    lint: !interrupted && expectedChecks.includes('lint') ? 'passed' : 'none',
    review: !interrupted && expectedChecks.includes('review') ? 'accepted' : 'none',
    .../** @type {Record<string, unknown>} */ (overrides.checks || {}),
  };
  return {
    target: clone(pending.target),
    route: completionRoute(pending),
    outcome,
    operations: [.../** @type {string[]} */ (inputs.operations)],
    changedTargets: outcome === 'succeeded' ? [.../** @type {string[]} */ (inputs.targets)] : [],
    checks,
    ...overrides,
    checks,
  };
}

/** @param {Record<string, unknown>} pending @param {Record<string, unknown>} [overrides] */
function completionInput(pending, overrides = {}) {
  return {
    target: clone(pending.target),
    evidenceHash: pending.evidenceHash,
    approachHash: pending.approachHash,
    result: completionResult(pending, overrides),
  };
}

/** @param {unknown} value @param {string} field */
function without(value, field) {
  const copy = /** @type {Record<string, unknown>} */ (clone(value));
  delete copy[field];
  return copy;
}

const ARRAY_ATTACKS = Object.freeze([
  'hole',
  'symbol property',
  'enumerable extra property',
  'non-enumerable extra property',
  'non-enumerable index',
  'indexed accessor',
  'noncanonical index',
  'out-of-range index',
  'length anomaly',
]);

/** @param {unknown[]} values @param {string} attack */
function adversarialArray(values, attack) {
  const array = [...values];
  let getterCalls = 0;
  if (attack === 'hole') {
    array.length += 1;
  } else if (attack === 'symbol property') {
    Object.defineProperty(array, Symbol('extra'), { value: true, enumerable: true });
  } else if (attack === 'enumerable extra property') {
    Object.defineProperty(array, 'extra', { value: true, enumerable: true });
  } else if (attack === 'non-enumerable extra property') {
    Object.defineProperty(array, 'extra', { value: true, enumerable: false });
  } else if (attack === 'non-enumerable index') {
    Object.defineProperty(array, '0', { enumerable: false });
  } else if (attack === 'indexed accessor') {
    const first = array[0];
    Object.defineProperty(array, '0', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return first;
      },
    });
  } else if (attack === 'noncanonical index') {
    Object.defineProperty(array, '01', { value: true, enumerable: true });
  } else if (attack === 'out-of-range index') {
    Object.defineProperty(array, '4294967295', { value: true, enumerable: true });
  } else if (attack === 'length anomaly') {
    return {
      value: new Proxy(array, {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          return key === 'length' && descriptor
            ? { ...descriptor, value: /** @type {number} */ (descriptor.value) + 1 }
            : descriptor;
        },
      }),
      getterCalls: () => getterCalls,
    };
  }
  return { value: array, getterCalls: () => getterCalls };
}

test('all six closed record validators reject unknown, missing, and forbidden fields', () => {
  const baseInspection = buildInspection(TARGET, [evidence('owner-log', 'owner')]);
  const hash = baseInspection.evidenceHash;
  const boundAssessment = assessment(hash);
  const blocker = { code: 'evidence-incomplete', subject: 'owner-log', evidenceHash: hash };
  const records = [
    [validateTarget, TARGET, 'lane'],
    [validateEvidenceItem, evidence('owner-log', 'owner'), 'source'],
    [validateInspection, baseInspection, 'target'],
    [(value) => validateAssessment(TARGET, baseInspection, value), boundAssessment, 'evidenceHash'],
    [validateBlocker, blocker, 'code'],
    [validateRunState, emptyState(), 'policy'],
  ];
  for (const [validate, value, required] of records) {
    assert.doesNotThrow(() => validate(value));
    assert.throws(() => validate({ .../** @type {object} */ (value), unknown: true }), /unknown field/);
    assert.throws(() => validate(without(value, /** @type {string} */ (required))), /missing field/);
  }

  assert.throws(() => validateTarget({ ...TARGET, issueId: 'issue-1' }), /forbidden/);
  assert.throws(() => validateEvidenceItem({
    source: 'session', required: false, status: 'overflow', ...contentDescriptor('x'), text: 'x',
  }), /forbidden/);
  assert.throws(() => validateInspection({ ...baseInspection, overflow: true }), /descriptor-only|overflow descriptor/);
  assert.throws(() => validateAssessment(TARGET, baseInspection, {
    ...boundAssessment, action: 'none', materialInputs: boundAssessment.materialInputs,
  }), /must be empty/);
  assert.throws(() => validateBlocker({ ...blocker, code: 'invented' }), /must be one of/);
  assert.throws(() => validateRunState({
    ...emptyState(), policy: { ...emptyState().policy, recover: true, untilBlocked: true },
  }), /cannot combine/);
  assert.doesNotThrow(() => validateRunState({
    ...emptyState(), policy: { ...emptyState().policy, mode: 'autonomous' },
  }));
  assert.throws(() => validateRunState({
    ...emptyState(), policy: { ...emptyState().policy, mode: 'auto' },
  }), /must be one of/);
  assert.throws(() => validateRunState({
    ...emptyState(), policy: without(emptyState().policy, 'mode'),
  }), /missing field/);
});

test('Target accepts feature, Lightweight task, tracked issue-only, and tracked optional mapping variants', () => {
  const valid = [
    { specPath: SPEC_PATH, lane: 'lightweight' },
    TARGET,
    { specPath: SPEC_PATH, lane: 'tracked' },
    TRACKED,
    { ...TRACKED, taskKey: TASK_KEY },
  ];
  valid.forEach((target) => assert.doesNotThrow(() => validateTarget(target)));

  const invalid = [
    { lane: 'lightweight', taskKey: TASK_KEY },
    { specPath: 'spec.md', lane: 'lightweight' },
    { specPath: SPEC_PATH, lane: 'other' },
    { specPath: SPEC_PATH, lane: 'lightweight', issueId: 'issue-1' },
    { specPath: SPEC_PATH, lane: 'tracked', taskKey: TASK_KEY },
    { specPath: SPEC_PATH, lane: 'tracked', issueId: '' },
    { specPath: SPEC_PATH, lane: 'tracked', issueId: 'x\n' },
    { specPath: SPEC_PATH, lane: 'lightweight', taskKey: 'T1@bad' },
  ];
  invalid.forEach((target) => assert.throws(() => validateTarget(target)));
  assert.deepEqual(canonicalTarget({ ...TRACKED, taskKey: TASK_KEY }), canonicalTarget(TRACKED));
});

test('optional unverified tracked task metadata cannot change packet or no-progress identity', () => {
  const mapped = { ...TRACKED, taskKey: TASK_KEY };
  const items = [evidence('owner-log', 'same complete evidence', true)];
  const issueOnlyInspection = buildInspection(TRACKED, items);
  const mappedInspection = buildInspection(mapped, items);

  assert.deepEqual(canonicalTarget(mapped), canonicalTarget(TRACKED));
  assert.equal(targetKey(mapped), targetKey(TRACKED));
  assert.equal(targetHash(mapped), targetHash(TRACKED));
  assert.deepEqual(modelPacket(mappedInspection), modelPacket(issueOnlyInspection));
  assert.equal(mappedInspection.evidenceHash, issueOnlyInspection.evidenceHash);
  assert.equal(evidenceHash(mapped, items), evidenceHash(TRACKED, items));
  assert.equal(
    `${mappedInspection.evidenceHash}:${approachHash(assessment())}`,
    `${issueOnlyInspection.evidenceHash}:${approachHash(assessment())}`,
  );
});

test('parseInvocation applies exact defaults, selector grammar, and sequential parallel compatibility', () => {
  assert.deepEqual(parseInvocation([]), {
    policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, parallel: 1, mode: 'guarded' },
  });
  assert.deepEqual(parseInvocation(['004-pre-work-log-learning']), {
    feature: '004-pre-work-log-learning',
    policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, parallel: 1, mode: 'guarded' },
  });
  assert.deepEqual(parseInvocation(['--until', 'blocked']), {
    policy: { overall: 25, recovery: 1, recover: false, untilBlocked: true, parallel: 1, mode: 'guarded' },
  });
  assert.deepEqual(parseInvocation(['--policy', 'guarded']), {
    policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, parallel: 1, mode: 'guarded' },
  });
  assert.deepEqual(parseInvocation(['feature', '--policy', 'autonomous']), {
    feature: 'feature',
    policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, parallel: 1, mode: 'autonomous' },
  });
  for (const parallel of ['1', '2', '9007199254740991']) {
    assert.deepEqual(parseInvocation(['feature', '--max', '7', '--parallel', parallel]), {
      feature: 'feature',
      policy: { overall: 7, recovery: 1, recover: false, untilBlocked: false, parallel: 1, mode: 'guarded' },
    }, parallel);
  }
  assert.deepEqual(parseInvocation([
    '--max', 'unlimited', '--recovery-cycles', 'unlimited', '--recover-on-block', '--parallel', '3',
  ]), {
    policy: {
      overall: 'unlimited', recovery: 'unlimited', recover: true, untilBlocked: false, parallel: 1, mode: 'guarded',
    },
  });
});

test('parseInvocation rejects every malformed option and positional combination', () => {
  const invalid = [
    ['one', 'two'],
    ['one', '--max', '2', 'two'],
    ['--max', '2', 'one'],
    ['--unknown'],
    ['--max'],
    ['--max', '--parallel', '2'],
    ['--max', '0'],
    ['--max', '+1'],
    ['--max', '１'],
    ['--max', '9007199254740992'],
    ['--parallel'],
    ['--parallel', '0'],
    ['--parallel', '+1'],
    ['--parallel', 'unlimited'],
    ['--parallel', '-1'],
    ['--parallel', '１'],
    ['--parallel', '9007199254740992'],
    ['--parallel', 'many'],
    ['--parallel', '1.5'],
    ['--parallel', '1', '--parallel', '2'],
    ['--until', 'done'],
    ['--until'],
    ['--max', '1', '--max', '2'],
    ['--recover-on-block', '--recover-on-block'],
    ['--recovery-cycles', '2'],
    ['--recover-on-block', '--until', 'blocked'],
    ['--policy', 'bogus'],
    ['--policy'],
    ['--policy', '--autonomous'],
    ['--policy', 'guarded', '--policy', 'autonomous'],
    ['--policy', 'guarded', 'feature'],
  ];
  invalid.forEach((argv) => assert.throws(() => parseInvocation(argv), undefined, argv.join(' ')));
});

test('A: runCommand inspects every Work trigger before authorization and preserves read-only stops', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const tasksPath = `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`;
    fs.writeFileSync(path.join(root, '.dude/ideas/owner.md'), ideaBytes());
    fs.writeFileSync(path.join(root, tasksPath), transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]));
    const inspectionInput = (target, overrides = {}) => ({
      root,
      specPath: target.specPath,
      target,
      lane: { kind: target.lane },
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
      ...overrides,
    });
    const cases = [
      ['start', emptyState(), transitionAssessment('execute-task'), 'ordinary', {}, true, 'authorized'],
      ['resume', emptyState(), transitionAssessment('execute-task'), 'ordinary', {}, true, 'authorized'],
      [
        'post-failure',
        emptyState({ recover: true }),
        transitionAssessment('retry-task'),
        'recovery',
        { currentRun: [capture(TARGET, 'failed', [{ outcome: 'failed' }])] },
        true,
        'authorized',
      ],
      [
        'post-block',
        emptyState(),
        transitionAssessment('retry-task'),
        'recovery',
        { currentRun: [capture(TARGET, 'blocked', [{ outcome: 'blocked' }])] },
        false,
        'recovery-disabled',
      ],
    ];

    for (const [trigger, state, assessmentValue, mode, overrides, authorized, reason] of cases) {
      const input = inspectionInput(TARGET, overrides);
      const inspectionHash = inspect(input).evidenceHash;
      const result = runCommand('authorize', {
        trigger,
        state,
        input,
        assessment: { ...assessmentValue, evidenceHash: inspectionHash },
        mode,
      });
      assert.deepEqual(Object.keys(result), ['inspection', 'authorization'], /** @type {string} */ (trigger));
      assert.ok(
        JSON.stringify(result).indexOf('"inspection"') < JSON.stringify(result).indexOf('"authorization"'),
        `${trigger}: inspection must precede authorization in the deterministic response`,
      );
      assert.equal(result.inspection.target.taskKey, TASK_KEY, /** @type {string} */ (trigger));
      assert.equal(result.authorization.authorized, authorized, /** @type {string} */ (trigger));
      assert.equal(result.authorization.reason, reason, /** @type {string} */ (trigger));
    }

    const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };
    const observedPaths = [SPEC_PATH, '.dude/ideas/owner.md', tasksPath];
    const beforeEntries = fs.readdirSync(root, { recursive: true }).sort();
    const beforeBytes = observedPaths.map((relativePath) => fs.readFileSync(path.join(root, relativePath)));
    const explicit = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: inspectionInput(featureTarget),
    });
    assert.deepEqual(Object.keys(explicit), ['inspection']);
    assert.equal(explicit.inspection.target.taskKey, undefined);
    assert.deepEqual(fs.readdirSync(root, { recursive: true }).sort(), beforeEntries);
    assert.deepEqual(
      observedPaths.map((relativePath) => fs.readFileSync(path.join(root, relativePath))),
      beforeBytes,
    );

    for (const trigger of ['start', 'resume', 'post-block', 'post-failure']) {
      assert.throws(
        () => runCommand('inspect', { trigger, input: inspectionInput(TARGET) }),
        /explicit-inspection/i,
        trigger,
      );
    }
    assert.throws(() => runCommand('authorize', {
      trigger: 'explicit-inspection',
      state: emptyState(),
      input: inspectionInput(TARGET),
      assessment: transitionAssessment('execute-task'),
      mode: 'ordinary',
    }), /explicit-inspection/i);
  });
});

test('A: runCommand closes command requests and responses', () => {
  const runCommand = runtimeFunction('runCommand');
  assert.throws(() => runCommand('unknown', {}), /unknown command/i);
  assert.throws(() => runCommand('inspect', {
    trigger: 'explicit-inspection',
    input: {},
    authority: true,
  }), /unknown field/i);
  assert.throws(() => runCommand('complete', {
    state: emptyState(),
    input: {},
    blockers: [],
  }), /unknown field/i);
});

test('A: recovery.mjs CLI decodes canonical byte envelopes for inspect, authorize, and complete', () => {
  withWorkspace((root) => {
    const tasksPath = `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`;
    fs.writeFileSync(path.join(root, '.dude/ideas/owner.md'), ideaBytes());
    fs.writeFileSync(path.join(root, tasksPath), transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]));
    const internalInput = {
      root,
      specPath: SPEC_PATH,
      target: TARGET,
      lane: { kind: 'lightweight' },
      currentRun: [capture(TARGET, 'failed', [{ detail: 'nonempty current run' }])],
      review: [],
      verification: [],
      lint: [],
    };
    const input = cliInput(internalInput);
    const inspectionHash = inspect(internalInput).evidenceHash;
    const requests = [
      ['inspect', { trigger: 'explicit-inspection', input }, ['inspection']],
      [
        'authorize',
        {
          trigger: 'start',
          state: emptyState(),
          input,
          assessment: transitionAssessment('execute-task', { evidenceHash: inspectionHash }),
          mode: 'ordinary',
        },
        ['inspection', 'authorization'],
      ],
      [
        'complete',
        {
          state: emptyState(),
          input: {
            target: TARGET,
            evidenceHash: '1'.repeat(64),
            approachHash: '2'.repeat(64),
            result: {},
          },
        },
        ['completion'],
      ],
    ];
    for (const [command, request, keys] of requests) {
      const result = runRecoveryCli(/** @type {string} */ (command), request);
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.equal(result.stderr, '', /** @type {string} */ (command));
      assert.notEqual(result.stdout, '', `${command}: expected one JSON response`);
      assert.deepEqual(Object.keys(JSON.parse(result.stdout)), keys, /** @type {string} */ (command));
    }

    const invalid = [
      ['unknown', '{}\n'],
      ['inspect', '{malformed\n'],
      ['inspect', `${JSON.stringify({ trigger: 'explicit-inspection', input, authority: true })}\n`],
    ];
    for (const [command, stdin] of invalid) {
      const result = runRecoveryCli(command, stdin);
      assert.notEqual(result.status, 0, `${command}:${stdin}`);
      assert.equal(result.stdout, '', `${command}:${stdin}`);
    }
  });
});

test('A: CLI byte envelopes preserve exact bytes and reject unknown or noncanonical encodings', () => {
  withWorkspace((root) => {
    const tasksPath = `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`;
    fs.writeFileSync(path.join(root, '.dude/ideas/owner.md'), ideaBytes());
    fs.writeFileSync(path.join(root, tasksPath), transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]));
    const baseInput = {
      root,
      specPath: SPEC_PATH,
      target: TARGET,
      lane: { kind: 'lightweight' },
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    };

    for (const sessionBytes of [Buffer.alloc(0), Buffer.from('a'), Buffer.from([0x00, 0xff, 0x80])]) {
      const input = cliInput({
        ...baseInput,
        session: { target: TARGET, availability: 'available', bytes: sessionBytes },
      });
      const result = runRecoveryCli('inspect', { trigger: 'explicit-inspection', input });
      assert.equal(result.status, 0, `${input.session.bytes.base64}: ${result.stderr}`);
      const inspection = JSON.parse(result.stdout).inspection;
      const session = inspection.items.find((item) => item.source === 'session');
      if (sessionBytes.equals(Buffer.from([0x00, 0xff, 0x80]))) {
        assert.equal(session.status, 'nontext');
        assert.equal(session.sha256, sha256(sessionBytes));
        assert.equal(session.byteLength, sessionBytes.length);
      } else {
        assert.equal(session.status, 'present');
        assert.equal(session.sha256, sha256(sessionBytes));
        assert.equal(session.byteLength, sessionBytes.length);
      }
    }

    const zeroHashBypass = cliInput({
      ...baseInput,
      currentRun: [{
        target: TARGET,
        state: 'failed',
        outcomeHash: '0'.repeat(64),
        bytes: Buffer.from([0xff, 0x80]),
      }],
    });
    const zeroHashResult = runRecoveryCli('inspect', {
      trigger: 'explicit-inspection',
      input: zeroHashBypass,
    });
    const zeroHashError = parseCanonicalCliError(zeroHashResult, 'zero-hash captured JSON bypass');
    assert.match(
      zeroHashError.message,
      /canonical JSON|strict UTF-8|captured JSON/i,
    );

    for (const [field, source, state] of [
      ['currentRun', 'current-run', 'failed'],
      ['review', 'review', 'rejected'],
      ['verification', 'verification', 'failed'],
      ['lint', 'lint', 'failed'],
    ]) {
      const input = cliInput({
        ...baseInput,
        [field]: [capture(TARGET, state, [{ field, payload: 'nonempty' }])],
      });
      assert.notEqual(input[field][0].bytes.base64, '', field);
      const result = runRecoveryCli('inspect', { trigger: 'explicit-inspection', input });
      assert.equal(result.status, 0, `${field}: ${result.stderr}`);
      assert.equal(
        JSON.parse(result.stdout).inspection.items.find((item) => item.source === source).status,
        'present',
        field,
      );
    }

    for (const [field, state] of [
      ['currentRun', 'failed'],
      ['review', 'rejected'],
      ['verification', 'failed'],
      ['lint', 'failed'],
    ]) {
      const input = cliInput({
        ...baseInput,
        [field]: [capture(TARGET, state, [{ field }])],
      });
      input[field][0].bytes = { base64: 'YR==' };
      const result = runRecoveryCli('inspect', { trigger: 'explicit-inspection', input });
      assert.notEqual(result.status, 0, field);
      assert.equal(result.stdout, '', field);
      assert.match(result.stderr, /base64|byte envelope|canonical/i, field);
    }

    const invalid = [
      { base64: '', extra: true },
      { base64: ' YQ==' },
      { base64: 'YQ==\n' },
      { base64: 'YQ' },
      { base64: 'YQ=' },
      { base64: 'YQ===' },
      { base64: 'YR==' },
      { base64: 'YWJ=' },
      { base64: 'YQ-_' },
      { base64: 1 },
      {},
    ];
    for (const envelope of invalid) {
      const result = runRecoveryCli('inspect', {
        trigger: 'explicit-inspection',
        input: {
          ...cliInput(baseInput),
          session: { target: TARGET, availability: 'available', bytes: envelope },
        },
      });
      assert.notEqual(result.status, 0, JSON.stringify(envelope));
      assert.equal(result.stdout, '', JSON.stringify(envelope));
      assert.match(result.stderr, /base64|byte envelope|canonical|unknown field/i, JSON.stringify(envelope));
    }

    const internal = collectEvidence(TARGET, {
      ...transitionRaw(TARGET),
      session: { target: TARGET, availability: 'available', bytes: Buffer.from('internal Buffer') },
    });
    assert.equal(internal.find((item) => item.source === 'session')?.status, 'present');
  });
});

test('T008 final-review regression: CLI byte envelopes preflight before workspace acquisition', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const ownerPath = path.join(root, IDEA_PATH);
    const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
    fs.writeFileSync(ownerPath, ideaBytes());
    fs.writeFileSync(tasksPath, tasksBytes());

    const decodedLength = FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1;
    const completeGroups = Math.floor(decodedLength / 3);
    const remainder = decodedLength % 3;
    const oversizedCanonicalBase64 = `${'AAAA'.repeat(completeGroups)}${remainder === 1 ? 'AA==' : 'AAA='}`;
    const baseCapture = capture(TARGET, 'failed', [{ outcome: 'transport-preflight' }]);
    const transportCapture = { ...baseCapture, bytes: byteEnvelope(baseCapture.bytes) };
    const cases = [
      {
        name: 'unknown envelope field',
        envelope: { base64: 'c2hhcGU=', extra: true },
        expected: /byte envelope|unknown field/i,
      },
      {
        name: 'noncanonical base64',
        envelope: { base64: 'YR==' },
        expected: /base64|canonical|RFC4648/i,
      },
      {
        name: 'oversized canonical base64',
        envelope: { base64: oversizedCanonicalBase64 },
        expected: /individual|source body|1[,_]?048[,_]?576|resource/i,
      },
    ];
    const observations = [];

    for (const fixture of cases) {
      const originalOpen = fs.openSync;
      const originalBufferFrom = Buffer.from;
      let directIdeaBodyOpens = 0;
      let tasksBodyOpens = 0;
      let bodyDecodes = 0;
      Reflect.set(fs, 'openSync', (file, ...args) => {
        if (typeof file !== 'number') {
          const absolutePath = path.resolve(String(file));
          if (absolutePath === ownerPath) directIdeaBodyOpens += 1;
          if (absolutePath === tasksPath) tasksBodyOpens += 1;
        }
        return originalOpen.call(fs, file, ...args);
      });
      Reflect.set(Buffer, 'from', (...args) => {
        if (args[0] === fixture.envelope.base64 && args[1] === 'base64') bodyDecodes += 1;
        return Reflect.apply(originalBufferFrom, Buffer, args);
      });

      let refusal;
      let returnedInspection = false;
      try {
        returnedInspection = Boolean(runCommand('inspect', {
          trigger: 'explicit-inspection',
          input: publicInspectionInput(root, TARGET, {
            currentRun: [{ ...transportCapture, bytes: fixture.envelope }],
          }),
        }).inspection);
      } catch (error) {
        refusal = error;
      } finally {
        Reflect.set(Buffer, 'from', originalBufferFrom);
        Reflect.set(fs, 'openSync', originalOpen);
      }

      observations.push({
        name: fixture.name,
        refused: refusal instanceof TypeError,
        correctRefusal: refusal instanceof Error && fixture.expected.test(refusal.message),
        returnedInspection,
        directIdeaBodyOpens,
        tasksBodyOpens,
        bodyDecodes,
      });
    }

    assert.deepEqual(observations, cases.map(({ name }) => ({
      name,
      refused: true,
      correctRefusal: true,
      returnedInspection: false,
      directIdeaBodyOpens: 0,
      tasksBodyOpens: 0,
      bodyDecodes: 0,
    })));
  });
});

test('A: tracked CLI stdin decodes nonempty list, detail, history, and current-run envelopes', () => {
  withWorkspace((root) => {
    const tasksPath = `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`;
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(path.join(root, tasksPath), transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]));
    const captured = trackedCapture(TRACKED.issueId, TASK_KEY);
    const input = cliInput({
      root,
      specPath: SPEC_PATH,
      target: TRACKED,
      lane: trackedRawInputs([captured]).lane,
      currentRun: [capture(TRACKED, 'failed', [{ phase: 'tracked-cli' }])],
      review: [],
      verification: [],
      lint: [],
    });
    assert.notEqual(input.lane.listBytes.base64, '');
    assert.notEqual(input.lane.issues[0].detailBytes.base64, '');
    assert.notEqual(input.lane.issues[0].historyBytes.base64, '');
    assert.notEqual(input.currentRun[0].bytes.base64, '');

    const result = runRecoveryCli('inspect', { trigger: 'explicit-inspection', input });
    assert.equal(result.status, 0, result.stderr);
    const inspection = JSON.parse(result.stdout).inspection;
    assert.equal(
      inspection.items.find((item) => item.source === 'lane-history').status,
      'missing',
      'decoded tracked bytes reach the internal collector, which has no Beads capability in core CLI',
    );
    assert.equal(
      inspection.items.find((item) => item.source === 'current-run').status,
      'present',
    );
  });
});

test('T008: complete CLI stdin accepts 6,291,456 canonical bytes and refuses encoded byte 6,291,457', () => {
  const accepted = runRecoveryCli(
    'complete',
    sizedCanonicalCompleteRequest(FIXED_RESOURCE_LIMITS.cliRequestBytes),
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).completion.reason, 'pending-not-found');

  const refused = runRecoveryCli(
    'complete',
    sizedCanonicalCompleteRequest(FIXED_RESOURCE_LIMITS.cliRequestBytes + 1),
  );
  const error = parseCanonicalCliError(refused, 'CLI request byte 6,291,457');
  assert.match(error.message, /request|stdin|6[,_]?291[,_]?456|resource/i);
});

test('T008: workspace and decoded capture bodies accept 1,048,576 bytes and refuse byte 1,048,577', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const tasksPath = `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`;
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(
      path.join(root, tasksPath),
      sizedMarkdown(tasksBytes(), FIXED_RESOURCE_LIMITS.sourceBodyBytes),
    );
    const input = publicInspectionInput(root);
    assert.doesNotThrow(() => inspect(input));

    fs.writeFileSync(path.join(root, tasksPath), tasksBytes());
    const exactCapture = sizedCapture(
      TARGET,
      'failed',
      FIXED_RESOURCE_LIMITS.sourceBodyBytes,
      'exact-capture-body',
    );
    assert.doesNotThrow(() => runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: cliInput(publicInspectionInput(root, TARGET, { currentRun: [exactCapture] })),
    }));

    const failures = [];
    fs.writeFileSync(
      path.join(root, tasksPath),
      sizedMarkdown(tasksBytes(), FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1),
    );
    try {
      assert.throws(
        () => inspect(input),
        /source body|workspace file|1[,_]?048[,_]?576|resource/i,
      );
    } catch (error) {
      failures.push(`workspace byte 1,048,577: ${error instanceof Error ? error.message : String(error)}`);
    }
    fs.writeFileSync(path.join(root, tasksPath), tasksBytes());

    const oversizedCapture = sizedCapture(
      TARGET,
      'failed',
      FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1,
      'oversized-capture-body',
    );
    try {
      assert.throws(
        () => runCommand('inspect', {
          trigger: 'explicit-inspection',
          input: cliInput(publicInspectionInput(root, TARGET, { currentRun: [oversizedCapture] })),
        }),
        /source body|captured body|1[,_]?048[,_]?576|resource/i,
      );
    } catch (error) {
      failures.push(`capture byte 1,048,577: ${error instanceof Error ? error.message : String(error)}`);
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });
});

test('T008 regression: workspace reads fail closed when files grow or change identity before open', (context) => {
  if (process.platform === 'win32') {
    context.skip('Windows fallback must compare pre-open and descriptor identity while bounding descriptor reads');
    return;
  }
  const cases = [
    {
      name: 'same-inode growth',
      mutate({ ownerPath }) {
        fs.truncateSync(ownerPath, FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1);
      },
    },
    {
      name: 'symlink replacement',
      mutate({ ownerPath, replacementPath }) {
        fs.unlinkSync(ownerPath);
        fs.symlinkSync(replacementPath, ownerPath);
      },
    },
    {
      name: 'changed-inode replacement',
      mutate({ ownerPath, replacementPath }) {
        fs.renameSync(replacementPath, ownerPath);
      },
    },
  ];
  const failures = [];
  for (const fixture of cases) {
    try {
      withWorkspace((root) => {
        const ownerPath = path.join(root, IDEA_PATH);
        const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
        const replacementPath = path.join(root, 'replacement-owner.md');
        fs.writeFileSync(ownerPath, ideaBytes());
        fs.writeFileSync(tasksPath, tasksBytes());
        fs.writeFileSync(replacementPath, ideaBytes(SPEC_PATH, '- replacement bytes must not be acquired\n'));

        const originalOpen = fs.openSync;
        const originalReadFile = fs.readFileSync;
        const originalRead = fs.readSync;
        const originalClose = fs.closeSync;
        const targetDescriptors = new Set();
        let armed = true;
        let fullFileReads = 0;
        let descriptorBytesRead = 0;
        const isOwnerPath = (file) => (
          typeof file !== 'number' && path.resolve(String(file)) === ownerPath
        );
        const mutateOnce = (file) => {
          if (!armed || !isOwnerPath(file)) return;
          armed = false;
          fixture.mutate({ ownerPath, replacementPath });
        };
        Reflect.set(fs, 'openSync', (file, ...args) => {
          mutateOnce(file);
          const descriptor = originalOpen.call(fs, file, ...args);
          if (isOwnerPath(file)) targetDescriptors.add(descriptor);
          return descriptor;
        });
        Reflect.set(fs, 'readFileSync', (file, ...args) => {
          mutateOnce(file);
          if (isOwnerPath(file)) fullFileReads += 1;
          return originalReadFile.call(fs, file, ...args);
        });
        Reflect.set(fs, 'readSync', (descriptor, ...args) => {
          const bytesRead = originalRead.call(fs, descriptor, ...args);
          if (targetDescriptors.has(descriptor)) descriptorBytesRead += bytesRead;
          return bytesRead;
        });
        Reflect.set(fs, 'closeSync', (descriptor) => {
          targetDescriptors.delete(descriptor);
          return originalClose.call(fs, descriptor);
        });

        let inspection;
        let thrown;
        try {
          inspection = inspect(publicInspectionInput(root));
        } catch (error) {
          thrown = error;
        } finally {
          Reflect.set(fs, 'closeSync', originalClose);
          Reflect.set(fs, 'readSync', originalRead);
          Reflect.set(fs, 'readFileSync', originalReadFile);
          Reflect.set(fs, 'openSync', originalOpen);
        }

        const rowFailures = [];
        const check = (label, assertion) => {
          try {
            assertion();
          } catch (error) {
            rowFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
        check('mutation boundary', () => assert.equal(
          armed,
          false,
          'fixture did not mutate at the validation/read boundary',
        ));
        check('bounded read', () => assert.equal(
          fullFileReads,
          0,
          'workspace acquisition used an unbounded whole-file read',
        ));
        check('bounded descriptor bytes', () => assert.ok(
          descriptorBytesRead <= FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1,
          `descriptor acquisition read ${descriptorBytesRead} bytes`,
        ));
        if (thrown) {
          check('fail-closed error', () => assert.match(
            thrown instanceof Error ? thrown.message : String(thrown),
            /workspace|source body|symbolic|identity|inode|changed|resource|unsafe/i,
          ));
        } else {
          const owner = inspection.items.find((item) => item.source === 'owner-log');
          check('changed bytes rejected', () => assert.notEqual(
            owner?.status,
            'present',
            'changed workspace bytes were accepted',
          ));
          check('blocking inspection', () => assert.ok(
            inspection.blockers.some((blocker) => blocker.subject === 'owner-log'),
            'changed workspace bytes did not produce a blocking inspection',
          ));
        }
        assert.deepEqual(rowFailures, [], rowFailures.join('; '));
      });
    } catch (error) {
      failures.push(`${fixture.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('T008 regression: FIFO replacement opens nonblocking and fails descriptor identity validation', (context) => {
  if (process.platform === 'win32') {
    context.skip('Windows named-pipe semantics do not provide the POSIX FIFO open race exercised here');
    return;
  }
  assert.equal(
    typeof fs.constants.O_NONBLOCK,
    'number',
    `${process.platform} must expose O_NONBLOCK for bounded FIFO descriptor acquisition`,
  );
  const nonblock = /** @type {number} */ (fs.constants.O_NONBLOCK);
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  let unavailableReason = '';

  withWorkspace((root) => {
    const ownerPath = path.join(root, IDEA_PATH);
    const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
    fs.writeFileSync(ownerPath, ideaBytes());
    fs.writeFileSync(tasksPath, tasksBytes());
    const regularStat = fs.lstatSync(ownerPath, { bigint: true });
    const originalOpen = fs.openSync;
    const originalFstat = fs.fstatSync;
    const originalRead = fs.readSync;
    let swapped = false;
    let refusedPotentiallyBlockingOpen = false;
    let observedFlags;
    let forwardedFlags;
    let fifoDescriptor;
    let descriptorWasFifo = false;
    let descriptorIdentityChanged = false;
    let descriptorValidated = false;
    let fifoReads = 0;
    const isOwnerPath = (file) => (
      typeof file !== 'number' && path.resolve(String(file)) === ownerPath
    );

    Reflect.set(fs, 'openSync', (file, flags, ...args) => {
      if (!swapped && isOwnerPath(file)) {
        swapped = true;
        observedFlags = flags;
        fs.unlinkSync(ownerPath);
        const created = spawnSync('mkfifo', [ownerPath], { encoding: 'utf8' });
        if (created.error || created.status !== 0) {
          unavailableReason = created.error?.message || created.stderr || `mkfifo exited ${created.status}`;
          throw new Error(`mkfifo unavailable: ${unavailableReason}`);
        }
        if (typeof flags !== 'number' || (flags & nonblock) !== nonblock) {
          refusedPotentiallyBlockingOpen = true;
          throw Object.assign(
            new Error('fixture refused a potentially blocking FIFO open without O_NONBLOCK'),
            { code: 'EWOULDBLOCK' },
          );
        }
        forwardedFlags = noFollow === 0 ? flags : flags & ~noFollow;
        fifoDescriptor = originalOpen.call(fs, file, forwardedFlags, ...args);
        return fifoDescriptor;
      }
      return originalOpen.call(fs, file, flags, ...args);
    });
    Reflect.set(fs, 'fstatSync', (descriptorValue, ...args) => {
      const stat = originalFstat.call(fs, descriptorValue, ...args);
      if (descriptorValue === fifoDescriptor) {
        descriptorValidated = true;
        descriptorWasFifo = stat.isFIFO();
        descriptorIdentityChanged = stat.dev !== regularStat.dev || stat.ino !== regularStat.ino;
      }
      return stat;
    });
    Reflect.set(fs, 'readSync', (descriptorValue, ...args) => {
      if (descriptorValue === fifoDescriptor) fifoReads += 1;
      return originalRead.call(fs, descriptorValue, ...args);
    });

    let inspection;
    let thrown;
    try {
      inspection = inspect(publicInspectionInput(root));
    } catch (error) {
      thrown = error;
    } finally {
      Reflect.set(fs, 'readSync', originalRead);
      Reflect.set(fs, 'fstatSync', originalFstat);
      Reflect.set(fs, 'openSync', originalOpen);
    }
    if (unavailableReason) return;

    assert.equal(swapped, true, 'fixture did not swap the regular file before open');
    assert.equal(typeof observedFlags, 'number');
    assert.equal(
      /** @type {number} */ (observedFlags) & nonblock,
      nonblock,
      'workspace descriptor open omitted O_NONBLOCK',
    );
    assert.equal(
      refusedPotentiallyBlockingOpen,
      false,
      'fixture had to prevent a blocking FIFO open',
    );
    assert.equal(
      noFollow === 0 ? true : (/** @type {number} */ (forwardedFlags) & noFollow) === 0,
      true,
      'fixture did not exercise descriptor validation without O_NOFOLLOW',
    );
    assert.equal(descriptorValidated, true, 'FIFO descriptor was not validated');
    assert.equal(descriptorWasFifo, true, 'replacement descriptor was not a FIFO');
    assert.equal(descriptorIdentityChanged, true, 'replacement descriptor retained regular-file identity');
    assert.equal(fifoReads, 0, 'FIFO body was read before descriptor type and identity rejection');
    assert.equal(thrown, undefined, 'bounded acquisition should return a blocking inspection');
    assert.notEqual(
      inspection?.items.find((item) => item.source === 'owner-log')?.status,
      'present',
    );
    assert.ok(
      inspection?.blockers.some((blocker) => blocker.subject === 'owner-log'),
      'changed owner did not produce a blocking inspection',
    );
  });

  if (unavailableReason) context.skip(`mkfifo unavailable: ${unavailableReason}`);
});

test('T008: aggregate body accounting is once, pre-parse, pre-dedupe, and gives individual overflow precedence', () => {
  withWorkspace((root) => {
    const owner = ideaBytes();
    const tasks = tasksBytes();
    fs.writeFileSync(path.join(root, IDEA_PATH), owner);
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasks);
    const workspaceBytes = owner.byteLength + tasks.byteLength;

    const exactCaptureBytes = FIXED_RESOURCE_LIMITS.inspectionBodyBytes - workspaceBytes;
    const exactCaptures = splitBodyBytes(exactCaptureBytes, 4).map((byteLength, index) => (
      sizedCapture(TARGET, 'failed', byteLength, `aggregate-exact-${index}`)
    ));
    assert.ok(exactCaptures.every((entry) => entry.bytes.byteLength <= FIXED_RESOURCE_LIMITS.sourceBodyBytes));
    assert.doesNotThrow(() => inspect(publicInspectionInput(root, TARGET, { currentRun: exactCaptures })));

    const duplicateTotal = FIXED_RESOURCE_LIMITS.inspectionBodyBytes + 1 - workspaceBytes;
    const duplicateBytes = Math.floor(duplicateTotal / 5);
    const duplicate = sizedCapture(TARGET, 'failed', duplicateBytes, 'aggregate-duplicate');
    const duplicateTail = sizedCapture(
      TARGET,
      'failed',
      duplicateTotal - (duplicateBytes * 4),
      'aggregate-tail',
    );
    const malformedBytes = 512;
    const parsePrefixBytes = FIXED_RESOURCE_LIMITS.inspectionBodyBytes + 1
      - workspaceBytes - malformedBytes;
    const parsePrefix = splitBodyBytes(parsePrefixBytes, 4).map((byteLength, index) => (
      sizedCapture(TARGET, 'failed', byteLength, `aggregate-before-parse-${index}`)
    ));
    const malformed = {
      target: TARGET,
      state: 'failed',
      outcomeHash: '0'.repeat(64),
      bytes: Buffer.alloc(malformedBytes, 0x78),
    };
    const individualPrefixBytes = FIXED_RESOURCE_LIMITS.inspectionBodyBytes
      - workspaceBytes - FIXED_RESOURCE_LIMITS.sourceBodyBytes;
    const individualPrefix = splitBodyBytes(individualPrefixBytes, 3).map((byteLength, index) => (
      sizedCapture(TARGET, 'failed', byteLength, `individual-precedence-${index}`)
    ));
    const crossesBoth = sizedCapture(
      TARGET,
      'failed',
      FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1,
      'individual-precedence-crossing-body',
    );
    const cases = [
      {
        name: 'duplicate bodies charged before dedupe',
        currentRun: [duplicate, duplicate, duplicate, duplicate, duplicateTail],
        expected: /aggregate|inspection bod|4[,_]?194[,_]?304|resource/i,
      },
      {
        name: 'aggregate refusal before parsing',
        currentRun: [...parsePrefix, malformed],
        expected: /aggregate|inspection bod|4[,_]?194[,_]?304|resource/i,
      },
      {
        name: 'individual-body precedence',
        currentRun: [...individualPrefix, crossesBoth],
        expected(error) {
          assert.match(error.message, /source body|captured body|1[,_]?048[,_]?576|individual/i);
          assert.doesNotMatch(error.message, /aggregate|4[,_]?194[,_]?304/i);
          return true;
        },
      },
    ];
    const failures = [];
    for (const fixture of cases) {
      try {
        assert.throws(
          () => inspect(publicInspectionInput(root, TARGET, { currentRun: fixture.currentRun })),
          fixture.expected,
        );
      } catch (error) {
        failures.push(`${fixture.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });
});

test('T008: source entry 64 is accepted and entry 65 refuses before body access, copy, or workspace reads', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasksBytes());
    const oneCapture = capture(TARGET, 'failed', [{ duplicate: true }]);
    const exactInput = cliInput(publicInspectionInput(root, TARGET, {
      currentRun: Array.from({ length: 61 }, () => oneCapture),
    }));
    const exact = runCommand('inspect', { trigger: 'explicit-inspection', input: exactInput });
    assert.ok(exact.inspection);

    const entry65 = capture(TARGET, 'failed', [{ sourceEntry: 65 }]);
    const entry65Bytes = entry65.bytes;
    let bodyAccesses = 0;
    let bodyCopies = 0;
    const observedEntry65 = new Proxy(entry65, {
      get(target, key, receiver) {
        if (key === 'bytes') bodyAccesses += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const overflowInput = publicInspectionInput(root, TARGET, {
      currentRun: [
        ...Array.from({ length: 61 }, () => oneCapture),
        observedEntry65,
      ],
    });
    const originalRead = fs.readFileSync;
    const originalBufferFrom = Buffer.from;
    let bodyReads = 0;
    Reflect.set(fs, 'readFileSync', (...args) => {
      bodyReads += 1;
      return originalRead(...args);
    });
    Reflect.set(Buffer, 'from', (...args) => {
      const value = args[0];
      if (args.length === 1
        && ArrayBuffer.isView(value)
        && value.buffer === entry65Bytes.buffer
        && value.byteOffset === entry65Bytes.byteOffset
        && value.byteLength === entry65Bytes.byteLength) {
        bodyCopies += 1;
      }
      return Reflect.apply(originalBufferFrom, Buffer, args);
    });
    try {
      assert.throws(
        () => runCommand('inspect', { trigger: 'explicit-inspection', input: overflowInput }),
        (error) => {
          assert.match(error.message, /source entr|64|resource/i);
          return true;
        },
      );
    } finally {
      Reflect.set(Buffer, 'from', originalBufferFrom);
      Reflect.set(fs, 'readFileSync', originalRead);
    }
    assert.equal(bodyAccesses, 0, 'entry 65 body must not be accessed');
    assert.equal(bodyCopies, 0, 'entry 65 body must not be copied');
    assert.equal(bodyReads, 0, 'entry 65 must refuse before workspace body acquisition');
  });
});

test('T008 regression: direct-ledger entry 65 stops the directory stream before later names or bodies', () => {
  withWorkspace((root) => {
    const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
    fs.writeFileSync(tasksPath, tasksBytes());
    const ideasRoot = path.join(root, '.dude/ideas');
    const sourceEntryTail = 2;
    const crossingIndex = FIXED_RESOURCE_LIMITS.sourceEntries - sourceEntryTail;
    const exactNames = Array.from(
      { length: crossingIndex },
      (_, index) => `idea-${String(index + 1).padStart(3, '0')}.md`,
    );
    const exactIdeaPath = `.dude/ideas/${exactNames[0]}`;
    for (const [index, name] of exactNames.entries()) {
      const bytes = index === 0
        ? ideaBytes()
        : Buffer.from([
          '---',
          `title: Draft ${index}`,
          `slug: draft-${index}`,
          'status: draft',
          '---',
          '',
          '## Idea',
          '',
          'Unrelated draft.',
          '',
        ].join('\n'));
      fs.writeFileSync(path.join(ideasRoot, name), bytes);
    }

    const exact = inspect(publicInspectionInput(root));
    const exactOwner = exact.items.find((item) => item.source === 'owner-log');
    assert.equal(exactOwner?.status, 'present');
    assert.equal(JSON.parse(exactOwner?.text || '{}').ideaPath, exactIdeaPath);

    let exactNameAccesses = 0;
    const exactEntries = exactNames.map((name) => ({
      get name() {
        exactNameAccesses += 1;
        return name;
      },
    }));
    let crossingNameAccesses = 0;
    const crossingEntry = {
      get name() {
        crossingNameAccesses += 1;
        throw new Error('source-entry crossing had its name accessed');
      },
    };
    let laterNameAccesses = 0;
    const laterNameTrap = {
      get name() {
        laterNameAccesses += 1;
        throw new Error('entry after the source-entry crossing had its name accessed');
      },
    };
    let directoryOpens = 0;
    let readSyncCalls = 0;
    let laterReadSyncCalls = 0;
    let closeSyncCalls = 0;
    const fakeDirectory = {
      readSync() {
        const index = readSyncCalls;
        readSyncCalls += 1;
        if (index < exactEntries.length) return exactEntries[index];
        if (index === exactEntries.length) return crossingEntry;
        laterReadSyncCalls += 1;
        if (index === exactEntries.length + 1) return laterNameTrap;
        throw new Error('directory stream was read after the guarded later entry');
      },
      closeSync() {
        closeSyncCalls += 1;
      },
    };
    const originalOpendir = fs.opendirSync;
    const originalLstat = fs.lstatSync;
    const originalOpen = fs.openSync;
    let ledgerLstatCalls = 0;
    let ledgerOpenCalls = 0;
    const isLedgerPath = (file) => {
      if (typeof file === 'number') return '';
      const absolute = path.resolve(String(file));
      return path.dirname(absolute) === ideasRoot;
    };
    Reflect.set(fs, 'opendirSync', (directory, ...args) => {
      if (path.resolve(String(directory)) === ideasRoot) {
        directoryOpens += 1;
        return fakeDirectory;
      }
      return originalOpendir.call(fs, directory, ...args);
    });
    Reflect.set(fs, 'lstatSync', (file, ...args) => {
      if (isLedgerPath(file)) ledgerLstatCalls += 1;
      return originalLstat.call(fs, file, ...args);
    });
    Reflect.set(fs, 'openSync', (file, ...args) => {
      if (isLedgerPath(file)) ledgerOpenCalls += 1;
      return originalOpen.call(fs, file, ...args);
    });

    let refusal;
    try {
      inspect(publicInspectionInput(root));
    } catch (error) {
      refusal = error;
    } finally {
      Reflect.set(fs, 'openSync', originalOpen);
      Reflect.set(fs, 'lstatSync', originalLstat);
      Reflect.set(fs, 'opendirSync', originalOpendir);
    }

    assert.deepEqual(
      {
        refused: refusal instanceof Error,
        resourceRefusal: refusal instanceof Error && /source entr|64|resource/i.test(refusal.message),
        directoryOpens,
        readSyncCalls,
        exactNameAccesses,
        crossingNameAccesses,
        laterReadSyncCalls,
        laterNameAccesses,
        ledgerLstatCalls,
        ledgerOpenCalls,
        closeSyncCalls,
      },
      {
        refused: true,
        resourceRefusal: true,
        directoryOpens: 1,
        readSyncCalls: crossingIndex + 1,
        exactNameAccesses: crossingIndex,
        crossingNameAccesses: 0,
        laterReadSyncCalls: 0,
        laterNameAccesses: 0,
        ledgerLstatCalls: 0,
        ledgerOpenCalls: 0,
        closeSyncCalls: 1,
      },
      'direct-ledger overflow must stop and close at the first source-entry crossing',
    );
  });
});

for (const fixture of [
  {
    name: 'mixed direct-ledger children share the total source-entry ceiling',
    child(index) {
      const suffix = String(index + 1).padStart(3, '0');
      if (index % 3 === 0) return { kind: 'markdown', name: `idea-${suffix}.md` };
      if (index % 3 === 1) return { kind: 'file', name: `note-${suffix}.txt` };
      return { kind: 'directory', name: `folder-${suffix}` };
    },
    expectedMarkdown: true,
  },
  {
    name: 'unsupported-only direct-ledger children share the total source-entry ceiling',
    child(index) {
      const suffix = String(index + 1).padStart(3, '0');
      return index % 2 === 0
        ? { kind: 'file', name: `note-${suffix}.txt` }
        : { kind: 'directory', name: `folder-${suffix}` };
    },
    expectedMarkdown: false,
  },
]) {
  test(`T008 regression: ${fixture.name}`, () => {
    withWorkspace((root) => {
      const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
      fs.writeFileSync(tasksPath, tasksBytes());
      const ideasRoot = path.join(root, '.dude/ideas');
      const sourceEntryTail = 2;
      const allowedCount = FIXED_RESOURCE_LIMITS.sourceEntries - sourceEntryTail;
      const allowedChildren = Array.from({ length: allowedCount }, (_, index) => fixture.child(index));
      const crossingChild = { kind: 'directory', name: 'crossing-folder' };
      const laterChild = { kind: 'file', name: 'later-note.txt' };
      const allChildren = [...allowedChildren, crossingChild, laterChild];
      assert.equal(
        allowedChildren.some(({ kind }) => kind === 'markdown'),
        fixture.expectedMarkdown,
      );
      assert.ok(allowedChildren.some(({ kind }) => kind === 'file'));
      assert.ok(allowedChildren.some(({ kind }) => kind === 'directory'));
      for (const [index, child] of allChildren.entries()) {
        const childPath = path.join(ideasRoot, child.name);
        if (child.kind === 'directory') {
          fs.mkdirSync(childPath);
        } else if (child.kind === 'markdown') {
          const bytes = index === 0
            ? ideaBytes()
            : Buffer.from([
              '---',
              `title: Draft ${index}`,
              `slug: draft-${index}`,
              'status: draft',
              '---',
              '',
              '## Idea',
              '',
              'Unrelated draft.',
              '',
            ].join('\n'));
          fs.writeFileSync(childPath, bytes);
        } else {
          fs.writeFileSync(childPath, 'unsupported\n');
        }
      }

      let observedNameAccesses = 0;
      const allowedEntries = allowedChildren.map(({ name }) => ({
        get name() {
          observedNameAccesses += 1;
          return name;
        },
      }));
      let crossingNameAccesses = 0;
      const crossingEntry = {
        get name() {
          crossingNameAccesses += 1;
          throw new Error('source-entry crossing had its name accessed');
        },
      };
      let laterNameAccesses = 0;
      const laterEntry = {
        get name() {
          laterNameAccesses += 1;
          return laterChild.name;
        },
      };
      let directoryOpens = 0;
      let readSyncCalls = 0;
      let postCrossingReadSyncCalls = 0;
      let closeSyncCalls = 0;
      const fakeDirectory = {
        readSync() {
          const index = readSyncCalls;
          readSyncCalls += 1;
          if (index < allowedEntries.length) return allowedEntries[index];
          if (index === allowedEntries.length) return crossingEntry;
          postCrossingReadSyncCalls += 1;
          if (index === allowedEntries.length + 1) return laterEntry;
          return null;
        },
        closeSync() {
          closeSyncCalls += 1;
        },
      };
      const originalOpendir = fs.opendirSync;
      const originalLstat = fs.lstatSync;
      const originalOpen = fs.openSync;
      const originalEndsWith = String.prototype.endsWith;
      const originalArrayPush = Array.prototype.push;
      const directChildNames = new Set(allChildren.map(({ name }) => name));
      const directChildPaths = new Set(allChildren.map(({ name }) => `.dude/ideas/${name}`));
      let directChildClassifications = 0;
      let directChildDiagnosticRetentions = 0;
      let directChildLstatCalls = 0;
      let directChildOpenCalls = 0;
      const isDirectIdeaChild = (file) => {
        if (typeof file === 'number') return false;
        return path.dirname(path.resolve(String(file))) === ideasRoot;
      };
      Reflect.set(fs, 'opendirSync', (directory, ...args) => {
        if (path.resolve(String(directory)) === ideasRoot) {
          directoryOpens += 1;
          return fakeDirectory;
        }
        return originalOpendir.call(fs, directory, ...args);
      });
      Reflect.set(fs, 'lstatSync', (file, ...args) => {
        if (isDirectIdeaChild(file)) directChildLstatCalls += 1;
        return originalLstat.call(fs, file, ...args);
      });
      Reflect.set(fs, 'openSync', (file, ...args) => {
        if (isDirectIdeaChild(file)) directChildOpenCalls += 1;
        return originalOpen.call(fs, file, ...args);
      });
      Reflect.set(String.prototype, 'endsWith', function (...args) {
        if (directChildNames.has(String(this))) directChildClassifications += 1;
        return Reflect.apply(originalEndsWith, this, args);
      });
      Reflect.set(Array.prototype, 'push', function (...values) {
        for (const value of values) {
          if (closeSyncCalls === 0
            && value !== null
            && typeof value === 'object'
            && directChildPaths.has(String(/** @type {{path?:unknown}} */ (value).path || ''))
            && String(/** @type {{code?:unknown}} */ (value).code || '').startsWith('FEATURE_IDEA_')) {
            directChildDiagnosticRetentions += 1;
          }
        }
        return Reflect.apply(originalArrayPush, this, values);
      });

      let refusal;
      try {
        inspect(publicInspectionInput(root));
      } catch (error) {
        refusal = error;
      } finally {
        Reflect.set(Array.prototype, 'push', originalArrayPush);
        Reflect.set(String.prototype, 'endsWith', originalEndsWith);
        Reflect.set(fs, 'openSync', originalOpen);
        Reflect.set(fs, 'lstatSync', originalLstat);
        Reflect.set(fs, 'opendirSync', originalOpendir);
      }

      assert.deepEqual(
        {
          refused: refusal instanceof Error,
          resourceRefusal: refusal instanceof Error && /source entr|64|resource/i.test(refusal.message),
          directoryOpens,
          readSyncCalls,
          observedNameAccesses,
          crossingNameAccesses,
          postCrossingReadSyncCalls,
          laterNameAccesses,
          directChildClassifications,
          directChildDiagnosticRetentions,
          directChildLstatCalls,
          directChildOpenCalls,
          closeSyncCalls,
        },
        {
          refused: true,
          resourceRefusal: true,
          directoryOpens: 1,
          readSyncCalls: allowedCount + 1,
          observedNameAccesses: allowedCount,
          crossingNameAccesses: 0,
          postCrossingReadSyncCalls: 0,
          laterNameAccesses: 0,
          directChildClassifications: 0,
          directChildDiagnosticRetentions: 0,
          directChildLstatCalls: 0,
          directChildOpenCalls: 0,
          closeSyncCalls: 1,
        },
        `${fixture.name} must refuse at the first crossing before classification or later reads`,
      );
    });
  });
}

test('T008 regression: source-entry refusal survives a directory close failure', () => {
  withWorkspace((root) => {
    const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
    fs.writeFileSync(tasksPath, tasksBytes());
    const ideasRoot = path.join(root, '.dude/ideas');
    const sourceEntryTail = 3;
    const allowedCount = FIXED_RESOURCE_LIMITS.sourceEntries - sourceEntryTail;
    const allowedEntries = Array.from(
      { length: allowedCount },
      (_, index) => ({ name: `idea-${String(index + 1).padStart(3, '0')}.md` }),
    );
    const crossingEntry = { name: 'crossing.md' };
    const baseCapture = capture(TARGET, 'failed', [{ outcome: 'failed' }]);
    let capturedBodyAccesses = 0;
    const guardedCapture = {
      ...baseCapture,
      get bytes() {
        capturedBodyAccesses += 1;
        return baseCapture.bytes;
      },
    };

    const closeFailure = new Error('injected directory close failure');
    let readSyncCalls = 0;
    let closeSyncCalls = 0;
    const fakeDirectory = {
      readSync() {
        const index = readSyncCalls;
        readSyncCalls += 1;
        if (index < allowedEntries.length) return allowedEntries[index];
        if (index === allowedEntries.length) return crossingEntry;
        throw new Error('directory stream was read after the source-entry crossing');
      },
      closeSync() {
        closeSyncCalls += 1;
        throw closeFailure;
      },
    };
    const originalOpendir = fs.opendirSync;
    const originalOpen = fs.openSync;
    let tasksBodyOpenCalls = 0;
    Reflect.set(fs, 'opendirSync', (directory, ...args) => {
      if (path.resolve(String(directory)) === ideasRoot) return fakeDirectory;
      return originalOpendir.call(fs, directory, ...args);
    });
    Reflect.set(fs, 'openSync', (file, ...args) => {
      if (typeof file !== 'number' && path.resolve(String(file)) === tasksPath) {
        tasksBodyOpenCalls += 1;
      }
      return originalOpen.call(fs, file, ...args);
    });

    let refusal;
    try {
      inspect(publicInspectionInput(root, TARGET, { currentRun: [guardedCapture] }));
    } catch (error) {
      refusal = error;
    } finally {
      Reflect.set(fs, 'openSync', originalOpen);
      Reflect.set(fs, 'opendirSync', originalOpendir);
    }

    assert.deepEqual(
      {
        refused: refusal instanceof Error,
        resourceRefusal: refusal instanceof Error && /source entr|64|resource/i.test(refusal.message),
        closeFailureEscaped: refusal === closeFailure,
        readSyncCalls,
        closeSyncCalls,
        tasksBodyOpenCalls,
        capturedBodyAccesses,
      },
      {
        refused: true,
        resourceRefusal: true,
        closeFailureEscaped: false,
        readSyncCalls: allowedCount + 1,
        closeSyncCalls: 1,
        tasksBodyOpenCalls: 0,
        capturedBodyAccesses: 0,
      },
      'the crossing resource refusal must remain terminal when directory cleanup fails',
    );
  });
});

test('T008 final-review regression: workspace resource refusals survive descriptor close failures', () => {
  const runCommand = runtimeFunction('runCommand');
  const cases = [
    {
      name: 'individual owner body',
      expected: /workspace file.*individual source body|individual source body.*workspace file/i,
      arrange(root) {
        const ownerPath = path.join(root, IDEA_PATH);
        fs.writeFileSync(ownerPath, ideaBytes());
        fs.truncateSync(ownerPath, FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1);
        fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasksBytes());
        return ownerPath;
      },
    },
    {
      name: 'aggregate task body',
      expected: /workspace file source body.*aggregate inspection body/i,
      arrange(root) {
        const directIdeas = [
          [IDEA_PATH, ideaBytes()],
          ['.dude/ideas/draft-001.md', Buffer.from('---\ntitle: Draft 1\nslug: draft-1\nstatus: draft\n---\n\n## Idea\n\nDraft.\n')],
          ['.dude/ideas/draft-002.md', Buffer.from('---\ntitle: Draft 2\nslug: draft-2\nstatus: draft\n---\n\n## Idea\n\nDraft.\n')],
          ['.dude/ideas/draft-003.md', Buffer.from('---\ntitle: Draft 3\nslug: draft-3\nstatus: draft\n---\n\n## Idea\n\nDraft.\n')],
        ];
        for (const [relativePath, bytes] of directIdeas) {
          fs.writeFileSync(
            path.join(root, relativePath),
            sizedMarkdown(bytes, FIXED_RESOURCE_LIMITS.sourceBodyBytes),
          );
        }
        const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
        fs.writeFileSync(tasksPath, tasksBytes());
        return tasksPath;
      },
    },
  ];
  const observations = [];

  for (const fixture of cases) {
    withWorkspace((root) => {
      const targetPath = fixture.arrange(root);
      const closeFailure = new Error(`injected ${fixture.name} close failure`);
      const sessionEnvelope = { base64: '' };
      let laterCapturedBodyAccesses = 0;
      let closeAttempts = 0;
      const session = new Proxy(
        { target: TARGET, availability: 'available', bytes: sessionEnvelope },
        {
          get(target, key, receiver) {
            if (key === 'bytes' && closeAttempts > 0) laterCapturedBodyAccesses += 1;
            return Reflect.get(target, key, receiver);
          },
        },
      );
      const originalOpen = fs.openSync;
      const originalClose = fs.closeSync;
      const originalBufferFrom = Buffer.from;
      const targetDescriptors = new Set();
      let laterCapturedBodyDecodes = 0;
      Reflect.set(fs, 'openSync', (file, ...args) => {
        const descriptor = originalOpen.call(fs, file, ...args);
        if (typeof file !== 'number' && path.resolve(String(file)) === targetPath) {
          targetDescriptors.add(descriptor);
        }
        return descriptor;
      });
      Reflect.set(fs, 'closeSync', (descriptor, ...args) => {
        if (targetDescriptors.delete(descriptor)) {
          closeAttempts += 1;
          originalClose.call(fs, descriptor, ...args);
          throw closeFailure;
        }
        return originalClose.call(fs, descriptor, ...args);
      });
      Reflect.set(Buffer, 'from', (...args) => {
        if (closeAttempts > 0 && args[0] === '' && args[1] === 'base64') {
          laterCapturedBodyDecodes += 1;
        }
        return Reflect.apply(originalBufferFrom, Buffer, args);
      });

      let refusal;
      let returnedInspection = false;
      try {
        returnedInspection = Boolean(runCommand('inspect', {
          trigger: 'explicit-inspection',
          input: publicInspectionInput(root, TARGET, { session }),
        }).inspection);
      } catch (error) {
        refusal = error;
      } finally {
        Reflect.set(Buffer, 'from', originalBufferFrom);
        Reflect.set(fs, 'closeSync', originalClose);
        Reflect.set(fs, 'openSync', originalOpen);
      }

      observations.push({
        name: fixture.name,
        resourceRefusal: refusal instanceof TypeError
          && fixture.expected.test(refusal.message),
        closeFailureEscaped: refusal === closeFailure,
        returnedInspection,
        closeAttempts,
        laterCapturedBodyAccesses,
        laterCapturedBodyDecodes,
      });
    });
  }

  assert.deepEqual(observations, cases.map(({ name }) => ({
    name,
    resourceRefusal: true,
    closeFailureEscaped: false,
    returnedInspection: false,
    closeAttempts: 1,
    laterCapturedBodyAccesses: 0,
    laterCapturedBodyDecodes: 0,
  })));
});

test('T008 regression: programmatic Buffer and typed-array bodies are charged before copying', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const owner = ideaBytes();
    const tasks = tasksBytes();
    fs.writeFileSync(path.join(root, IDEA_PATH), owner);
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasks);

    const aggregateCaptureBytes = FIXED_RESOURCE_LIMITS.inspectionBodyBytes + 1
      - owner.byteLength - tasks.byteLength;
    const aggregateCaptures = splitBodyBytes(aggregateCaptureBytes, 4).map((byteLength, index) => (
      sizedCapture(TARGET, 'failed', byteLength, `copy-order-aggregate-${index}`)
    ));
    const aggregateTail = aggregateCaptures.at(-1);
    assert.ok(aggregateTail);
    aggregateCaptures[aggregateCaptures.length - 1] = {
      ...aggregateTail,
      bytes: new Uint8Array(
        aggregateTail.bytes.buffer,
        aggregateTail.bytes.byteOffset,
        aggregateTail.bytes.byteLength,
      ),
    };

    const oversizedBuffer = Buffer.alloc(FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1, 0x78);
    const oversizedTypedArray = new Uint8Array(FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1);
    const baseCapture = capture(TARGET, 'failed', [{ limit: 'copy-order' }]);
    const cases = [
      {
        name: 'individual Buffer',
        sentinel: oversizedBuffer,
        currentRun: [{ ...baseCapture, bytes: oversizedBuffer }],
        expected: /individual|source body|1[,_]?048[,_]?576|resource/i,
      },
      {
        name: 'individual typed array',
        sentinel: oversizedTypedArray,
        currentRun: [{ ...baseCapture, bytes: oversizedTypedArray }],
        expected: /individual|source body|1[,_]?048[,_]?576|resource/i,
      },
      {
        name: 'aggregate typed array tail',
        sentinel: aggregateCaptures.at(-1).bytes,
        currentRun: aggregateCaptures,
        expected: /aggregate|inspection bod|4[,_]?194[,_]?304|resource/i,
      },
    ];
    const failures = [];
    for (const fixture of cases) {
      const originalBufferFrom = Buffer.from;
      let bodyCopies = 0;
      let thrown;
      Reflect.set(Buffer, 'from', (...args) => {
        const value = args[0];
        if (args.length === 1
          && ArrayBuffer.isView(value)
          && value.buffer === fixture.sentinel.buffer
          && value.byteOffset === fixture.sentinel.byteOffset
          && value.byteLength === fixture.sentinel.byteLength) {
          bodyCopies += 1;
        }
        return Reflect.apply(originalBufferFrom, Buffer, args);
      });
      try {
        runCommand('inspect', {
          trigger: 'explicit-inspection',
          input: publicInspectionInput(root, TARGET, { currentRun: fixture.currentRun }),
        });
      } catch (error) {
        thrown = error;
      } finally {
        Reflect.set(Buffer, 'from', originalBufferFrom);
      }
      try {
        assert.ok(thrown instanceof Error, 'expected a resource-limit refusal');
        assert.match(thrown.message, fixture.expected);
        assert.equal(bodyCopies, 0, 'sentinel body was copied before refusal');
      } catch (error) {
        failures.push(`${fixture.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });
});

test('T008: descriptor 64 is retained before separate packet overflow and descriptor 65 refuses before append', () => {
  assert.deepEqual(limits, { items: 16, bytes: 65_536 });
  const exactRaw = rawInputs({
    currentRun: Array.from({ length: 57 }, (_, index) => (
      capture(TARGET, 'succeeded', [{ descriptor: index }])
    )),
  });
  const exactItems = collectEvidence(TARGET, exactRaw);
  assert.equal(exactItems.length, FIXED_RESOURCE_LIMITS.retainedDescriptors);
  const exact = buildInspection(TARGET, exactItems);
  assert.equal(exact.items.length, FIXED_RESOURCE_LIMITS.retainedDescriptors);
  assert.equal(exact.overflow, true, 'the unchanged 16-item packet limit remains separate');
  assert.equal(modelPacket(exact), null);

  const candidates = Array.from(
    { length: FIXED_RESOURCE_LIMITS.retainedDescriptors },
    (_, index) => evidence('current-run', `descriptor-${index}`),
  );
  const descriptor65 = evidence('current-run', 'descriptor-65');
  let descriptorCountSinceOwnKeys = 0;
  let copiedForRetention = false;
  const observedDescriptor65 = new Proxy(descriptor65, {
    ownKeys(target) {
      descriptorCountSinceOwnKeys = 0;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      descriptorCountSinceOwnKeys += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(target, key, receiver) {
      if (typeof key === 'string'
        && key !== 'length'
        && descriptorCountSinceOwnKeys > 0
        && descriptorCountSinceOwnKeys < Reflect.ownKeys(target).length) {
        copiedForRetention = true;
      }
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(
    () => buildInspection(TARGET, [...candidates, observedDescriptor65]),
    /retained descriptor|descriptor 65|64|resource/i,
  );
  assert.equal(copiedForRetention, false, 'descriptor 65 was copied into retained output before refusal');
});

test('T008 regression: CLI errors never echo caller command or input fields', () => {
  const commandSecret = 'CALLER_COMMAND_SECRET_6c9f6be0';
  const inputSecret = 'CALLER_INPUT_SECRET_82f644b1';
  const failures = [];
  for (const [name, result, secret] of [
    ['unknown command', runRecoveryCli(commandSecret, {}), commandSecret],
    [
      'other input error',
      runRecoveryCli('inspect', { trigger: 'explicit-inspection', input: {}, [inputSecret]: true }),
      inputSecret,
    ],
  ]) {
    try {
      const error = parseCanonicalCliError(result, /** @type {string} */ (name));
      assert.doesNotMatch(error.message, new RegExp(/** @type {string} */ (secret)));
      assert.doesNotMatch(result.stderr, new RegExp(/** @type {string} */ (secret)));
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('T008 regression: pure error serialization is bounded, canonical, and scalar-safe', () => {
  const boundedErrorJson = runtimeFunction('boundedErrorJson');
  const ascii = parseCanonicalErrorJson(
    boundedErrorJson(new Error('x'.repeat(9_000))),
    'exact 8,192-byte ASCII error',
  );
  assert.equal(ascii.byteLength, FIXED_RESOURCE_LIMITS.errorJsonBytes);
  assert.match(ascii.message, /\.\.\.$/);

  const unicode = parseCanonicalErrorJson(
    boundedErrorJson(new Error('😀'.repeat(3_000))),
    'Unicode scalar truncation',
  );
  assert.ok(unicode.byteLength <= FIXED_RESOURCE_LIMITS.errorJsonBytes);
  assert.notEqual(unicode.byteLength, FIXED_RESOURCE_LIMITS.errorJsonBytes + 1);
  assert.match(unicode.message, /\.\.\.$/);
  assert.doesNotMatch(unicode.message, /\uFFFD/);
  for (let index = 0; index < unicode.message.length; index += 1) {
    const code = unicode.message.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = unicode.message.charCodeAt(index + 1);
      assert.ok(next >= 0xdc00 && next <= 0xdfff, 'truncation split a surrogate pair');
      index += 1;
    } else {
      assert.ok(code < 0xdc00 || code > 0xdfff, 'truncation retained an unpaired surrogate');
    }
  }
});

test('T008: complete CLI wire rejects every noncanonical JSON representation', () => {
  withWorkspace((root) => {
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasksBytes());
    const inspectRequest = {
      trigger: 'explicit-inspection',
      input: cliInput(publicInspectionInput(root)),
    };
    const canonicalInspect = canonicalJson(inspectRequest);
    const completeRequest = canonicalJson({
      state: emptyState(),
      input: {
        target: TARGET,
        evidenceHash: '1'.repeat(64),
        approachHash: '2'.repeat(64),
        result: {},
      },
    });
    const duplicate = duplicateFirstKeyJson(JSON.parse(canonicalInspect));
    const alternateString = canonicalInspect.replace('"explicit-inspection"', '"explicit-\\u0069nspection"');
    const alternateNumber = completeRequest.replace('"overall":3', '"overall":3e0');
    const cases = [
      ['whitespace', 'inspect', `${canonicalInspect}\n`],
      ['reordered keys', 'inspect', JSON.stringify(inspectRequest)],
      ['duplicate keys', 'inspect', duplicate],
      [
        'malformed UTF-8',
        'inspect',
        Buffer.concat([Buffer.from(canonicalInspect.slice(0, -1)), Buffer.from([0xff, 0x7d])]),
      ],
      ['alternate string escape', 'inspect', alternateString],
      ['alternate number spelling', 'complete', alternateNumber],
    ];
    const failures = [];
    for (const [name, command, stdin] of cases) {
      try {
        assertCliRefusal(
          runRecoveryCli(/** @type {string} */ (command), stdin),
          `wire ${name}`,
        );
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });
});

test('T008: every declared JSON capture rejects noncanonical bytes while Markdown and session bytes remain arbitrary', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const markdownJson = '{"z":1, "z":2}';
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes(SPEC_PATH, `- ${markdownJson}\n`));
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), Buffer.concat([
      tasksBytes(),
      Buffer.from(`${markdownJson}\n`),
    ]));
    const tracked = trackedCapture(TRACKED.issueId, TASK_KEY);
    const trackedRaw = trackedRawInputs([tracked]);
    const streamBodies = {
      currentRun: capture(TARGET, 'failed', [{ count: 1 }]),
      review: capture(TARGET, 'rejected', [{ count: 1 }]),
      verification: capture(TARGET, 'failed', [{ count: 1 }]),
      lint: capture(TARGET, 'failed', [{ count: 1 }]),
    };
    const boundaries = [
      ['tracked list', trackedRaw.lane.listBytes, (bytes) => ({
        target: TRACKED,
        lane: { ...trackedRaw.lane, listBytes: bytes },
      })],
      ['tracked detail', tracked.detailBytes, (bytes) => ({
        target: TRACKED,
        lane: {
          ...trackedRaw.lane,
          issues: [{ detailBytes: bytes, historyBytes: tracked.historyBytes }],
        },
      })],
      ['tracked history', tracked.historyBytes, (bytes) => ({
        target: TRACKED,
        lane: {
          ...trackedRaw.lane,
          issues: [{ detailBytes: tracked.detailBytes, historyBytes: bytes }],
        },
      })],
      ...Object.entries(streamBodies).map(([field, entry]) => [
        field === 'currentRun' ? 'current-run' : field,
        entry.bytes,
        (bytes) => ({ [field]: [{ ...entry, bytes }] }),
      ]),
    ];
    const variants = [
      'whitespace',
      'reordered keys',
      'duplicate keys',
      'malformed UTF-8',
      'alternate string escape',
      'alternate number spelling',
    ];
    const failures = [];
    for (const [boundary, canonicalBytes, apply] of boundaries) {
      for (const variant of variants) {
        try {
          const overrides = apply(noncanonicalJsonBytes(canonicalBytes, variant));
          const target = overrides.target || TARGET;
          const input = publicInspectionInput(root, target, overrides);
          assert.throws(
            () => runCommand('inspect', {
              trigger: 'explicit-inspection',
              input: cliInput(input),
            }),
            /canonical JSON|duplicate|UTF-8|JSON representation|captured JSON/i,
          );
        } catch (error) {
          failures.push(`${boundary}/${variant}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const arbitrarySession = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: cliInput(publicInspectionInput(root, TARGET, {
        session: {
          target: TARGET,
          availability: 'available',
          bytes: Buffer.from(markdownJson),
        },
      })),
    }).inspection;
    assert.equal(arbitrarySession.items.find((item) => item.source === 'owner-log').status, 'present');
    assert.equal(arbitrarySession.items.find((item) => item.source === 'task-history').status, 'present');
    assert.equal(arbitrarySession.items.find((item) => item.source === 'session').text, markdownJson);

    const nontextSession = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: cliInput(publicInspectionInput(root, TARGET, {
        session: {
          target: TARGET,
          availability: 'available',
          bytes: Buffer.from([0xff, 0x80]),
        },
      })),
    }).inspection;
    assert.equal(nontextSession.items.find((item) => item.source === 'session').status, 'nontext');
    assert.deepEqual(failures, [], failures.join('\n'));
  });
});

test('T008 regression: every declared programmatic JSON source rejects duplicate-key and whitespace bytes', () => {
  const tracked = trackedCapture(TRACKED.issueId, TASK_KEY);
  const trackedRaw = trackedRawInputs([tracked]);
  const streamBodies = {
    currentRun: capture(TARGET, 'failed', [{ source: 'current-run' }]),
    review: capture(TARGET, 'rejected', [{ source: 'review' }]),
    verification: capture(TARGET, 'failed', [{ source: 'verification' }]),
    lint: capture(TARGET, 'failed', [{ source: 'lint' }]),
  };
  const cases = [
    {
      name: 'tracked list',
      target: TRACKED,
      raw: {
        ...trackedRaw,
        lane: {
          ...trackedRaw.lane,
          listBytes: noncanonicalJsonBytes(trackedRaw.lane.listBytes, 'duplicate keys'),
        },
      },
    },
    {
      name: 'tracked detail',
      target: TRACKED,
      raw: {
        ...trackedRaw,
        lane: {
          ...trackedRaw.lane,
          issues: [{
            detailBytes: noncanonicalJsonBytes(tracked.detailBytes, 'duplicate keys'),
            historyBytes: tracked.historyBytes,
          }],
        },
      },
    },
    {
      name: 'tracked history',
      target: TRACKED,
      raw: {
        ...trackedRaw,
        lane: {
          ...trackedRaw.lane,
          issues: [{
            detailBytes: tracked.detailBytes,
            historyBytes: noncanonicalJsonBytes(tracked.historyBytes, 'duplicate keys'),
          }],
        },
      },
    },
    ...Object.entries(streamBodies).map(([field, entry]) => ({
      name: field === 'currentRun' ? 'current-run' : field,
      target: TARGET,
      raw: rawInputs({
        [field]: [{
          ...entry,
          bytes: noncanonicalJsonBytes(entry.bytes, 'duplicate keys'),
        }],
      }),
    })),
  ];
  const variants = ['duplicate keys', 'whitespace'];
  const failures = [];
  for (const fixture of cases) {
    for (const variant of variants) {
      let trackedNormalizerCalls = 0;
      const raw = clone(fixture.raw);
      if (fixture.name === 'tracked list') {
        raw.lane.listBytes = noncanonicalJsonBytes(trackedRaw.lane.listBytes, variant);
      } else if (fixture.name === 'tracked detail') {
        raw.lane.issues[0].detailBytes = noncanonicalJsonBytes(tracked.detailBytes, variant);
      } else if (fixture.name === 'tracked history') {
        raw.lane.issues[0].historyBytes = noncanonicalJsonBytes(tracked.historyBytes, variant);
      } else {
        const field = fixture.name === 'current-run' ? 'currentRun' : fixture.name;
        raw[field][0].bytes = noncanonicalJsonBytes(streamBodies[field].bytes, variant);
      }
      try {
        assert.throws(
          () => collectEvidence(fixture.target, raw, {
            normalizeTrackedEvidence() {
              trackedNormalizerCalls += 1;
              return trackedProjection(TRACKED, [tracked]);
            },
          }),
          /canonical JSON|duplicate|JSON representation|captured JSON/i,
        );
        assert.equal(trackedNormalizerCalls, 0, 'invalid tracked bytes reached source normalization');
      } catch (error) {
        failures.push(`${fixture.name}/${variant}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('T008 regression: collect, inspect, authorize, and sealed host paths share canonical capture refusal', () => {
  const canonical = capture(TARGET, 'failed', [{ phase: 'programmatic-boundary' }]);
  const duplicateKeyCapture = {
    ...canonical,
    bytes: noncanonicalJsonBytes(canonical.bytes, 'duplicate keys'),
  };
  const raw = transitionRaw(TARGET, { currentRun: [duplicateKeyCapture] });
  const failures = [];
  const checkRefusal = (name, invoke) => {
    try {
      assert.throws(invoke, /canonical JSON|duplicate|JSON representation|captured JSON/i);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  checkRefusal('collectEvidence', () => collectEvidence(TARGET, raw));
  checkRefusal('authorizeAttempt', () => authorizeRuntimeAttempt(
    emptyState({ recover: true }),
    TARGET,
    raw,
    transitionAssessment('retry-task'),
    'recovery',
  ));

  withWorkspace((root) => {
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasksBytes());
    const input = publicInspectionInput(root, TARGET, { currentRun: [duplicateKeyCapture] });
    checkRefusal('inspect', () => inspect(input));

    const runCommand = runtimeFunction('runCommand');
    const zeroHashCapture = { ...duplicateKeyCapture, outcomeHash: '0'.repeat(64) };
    checkRefusal('sealed runCommand', () => runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: publicInspectionInput(root, TARGET, { currentRun: [zeroHashCapture] }),
    }));
  });

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('A: runCommand authorize reuses one fresh Inspection with one bounded workspace acquisition', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const ideaPath = path.join(root, '.dude/ideas/owner.md');
    const tasksPath = path.join(root, SPEC_PATH.slice(0, -'spec.md'.length), 'tasks.md');
    const ownerBytes = ideaBytes();
    const taskBytes = transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]);
    fs.writeFileSync(ideaPath, ownerBytes);
    fs.writeFileSync(tasksPath, taskBytes);
    const input = {
      root,
      specPath: SPEC_PATH,
      target: TARGET,
      lane: { kind: 'lightweight' },
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    };
    const inspected = inspect(input);
    const originalOpen = fs.openSync;
    const originalReadFile = fs.readFileSync;
    const originalRead = fs.readSync;
    const originalClose = fs.closeSync;
    const opens = new Map([[ideaPath, 0], [tasksPath, 0]]);
    const fullFileReads = new Map([[ideaPath, 0], [tasksPath, 0]]);
    const descriptorBytes = new Map([[ideaPath, 0], [tasksPath, 0]]);
    const descriptorPaths = new Map();
    Reflect.set(fs, 'openSync', (file, ...args) => {
      const descriptor = originalOpen.call(fs, file, ...args);
      const absolute = path.resolve(String(file));
      if (opens.has(absolute)) {
        opens.set(absolute, /** @type {number} */ (opens.get(absolute)) + 1);
        descriptorPaths.set(descriptor, absolute);
      }
      return descriptor;
    });
    Reflect.set(fs, 'readFileSync', (file, ...args) => {
      const absolute = path.resolve(String(file));
      if (fullFileReads.has(absolute)) {
        fullFileReads.set(absolute, /** @type {number} */ (fullFileReads.get(absolute)) + 1);
      }
      return originalReadFile.call(fs, file, ...args);
    });
    Reflect.set(fs, 'readSync', (descriptor, ...args) => {
      const bytesRead = originalRead.call(fs, descriptor, ...args);
      const absolute = descriptorPaths.get(descriptor);
      if (absolute) {
        descriptorBytes.set(absolute, /** @type {number} */ (descriptorBytes.get(absolute)) + bytesRead);
      }
      return bytesRead;
    });
    Reflect.set(fs, 'closeSync', (descriptor) => {
      descriptorPaths.delete(descriptor);
      return originalClose.call(fs, descriptor);
    });
    try {
      const result = runCommand('authorize', {
        trigger: 'start',
        state: emptyState(),
        input,
        assessment: transitionAssessment('execute-task', { evidenceHash: inspected.evidenceHash }),
        mode: 'ordinary',
      });
      assert.equal(result.authorization.authorized, true);
      for (const source of ['owner-log', 'task-history']) {
        assert.equal(
          result.inspection.items.filter((item) => item.source === source).length,
          1,
          `${source} evidence was duplicated`,
        );
      }
    } finally {
      Reflect.set(fs, 'closeSync', originalClose);
      Reflect.set(fs, 'readSync', originalRead);
      Reflect.set(fs, 'readFileSync', originalReadFile);
      Reflect.set(fs, 'openSync', originalOpen);
    }
    assert.deepEqual(Object.fromEntries(fullFileReads), { [ideaPath]: 0, [tasksPath]: 0 });
    assert.deepEqual(Object.fromEntries(opens), { [ideaPath]: 1, [tasksPath]: 1 });
    assert.deepEqual(Object.fromEntries(descriptorBytes), {
      [ideaPath]: Buffer.byteLength(ownerBytes),
      [tasksPath]: Buffer.byteLength(taskBytes),
    });

    const captured = trackedCapture(TRACKED.issueId, TASK_KEY);
    const trackedInput = {
      ...input,
      target: TRACKED,
      lane: trackedRawInputs([captured]).lane,
    };
    let normalizeCalls = 0;
    const dependencies = {
      normalizeTrackedEvidence() {
        normalizeCalls += 1;
        return trackedProjection(TRACKED, [captured]);
      },
    };
    const trackedInspection = inspect(trackedInput, dependencies);
    normalizeCalls = 0;
    const tracked = runCommand('authorize', {
      trigger: 'resume',
      state: emptyState({ recover: true }),
      input: trackedInput,
      assessment: transitionAssessment('retry-task', {
        evidenceHash: trackedInspection.evidenceHash,
        targets: ['tracked-target'],
      }),
      mode: 'recovery',
    }, dependencies);
    assert.equal(tracked.authorization.authorized, true);
    assert.equal(normalizeCalls, 1, 'the sealed tracked capture is acquired once per command');
  });
});

test('canonical JSON and projection hashes ignore object key insertion order and reject non-JSON values', () => {
  const left = { z: 1, nested: { b: true, a: ['x', null] } };
  const right = { nested: { a: ['x', null], b: true }, z: 1 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(sha256(canonicalJson(left)), sha256(canonicalJson(right)));
  assert.equal(canonicalJson(-1), '-1');
  assert.equal(canonicalJson(Number.MIN_SAFE_INTEGER), '-9007199254740991');

  const firstAssessment = assessment();
  const secondAssessment = {
    evidenceHash: 'f'.repeat(64),
    summary: firstAssessment.summary,
    retention: firstAssessment.retention,
    equivalence: firstAssessment.equivalence,
    materialInputs: {
      checks: firstAssessment.materialInputs.checks,
      operations: firstAssessment.materialInputs.operations,
      targets: firstAssessment.materialInputs.targets,
    },
    action: firstAssessment.action,
    intent: firstAssessment.intent,
  };
  assert.equal(approachHash(firstAssessment), approachHash(secondAssessment));
  assert.equal(
    resultHash({
      outcome: 'succeeded', changedTargets: [TASK_KEY], blockers: [], summary: 'one', wrapperId: 'event-1',
    }),
    resultHash({
      blockers: [], changedTargets: [TASK_KEY], outcome: 'succeeded', summary: 'two', wrapperId: 'event-2',
    }),
  );

  assert.throws(() => canonicalJson({ value: undefined }));
  assert.throws(() => canonicalJson([, 'sparse']));
  assert.throws(() => canonicalJson({ value: Number.NaN }));
  assert.throws(() => canonicalJson({ value: -0 }));
  assert.throws(() => canonicalJson(Number.MIN_SAFE_INTEGER - 1));
  assert.throws(() => canonicalJson({ value: '\ud800' }));
  assert.throws(() => validateEvidenceItem({ ...evidence('owner-log', 'owner'), byteLength: -1 }));
  assert.throws(() => validateRunState({ ...emptyState(), overallUsed: -1 }));
});

test('canonical JSON arrays reject non-data indexes and every property except length and dense indexes', () => {
  assert.equal(canonicalJson([1, 'two', false]), '[1,"two",false]');

  const sparse = new Array(2);
  sparse[1] = 'present';
  assert.throws(() => canonicalJson(sparse), /sparse array/);

  const nonEnumerable = ['hidden'];
  Object.defineProperty(nonEnumerable, '0', { enumerable: false });
  assert.throws(() => canonicalJson(nonEnumerable), /enumerable data property/);

  let indexedGetterCalls = 0;
  const indexedAccessor = ['value'];
  Object.defineProperty(indexedAccessor, '0', {
    enumerable: true,
    get() {
      indexedGetterCalls += 1;
      return 'value';
    },
  });
  assert.throws(() => canonicalJson(indexedAccessor), /enumerable data property/);
  assert.equal(indexedGetterCalls, 0);

  let extraGetterCalls = 0;
  const extraProperty = ['value'];
  Object.defineProperty(extraProperty, 'extra', {
    enumerable: true,
    get() {
      extraGetterCalls += 1;
      return 'ignored';
    },
  });
  assert.throws(() => canonicalJson(extraProperty), /extra property/);
  assert.equal(extraGetterCalls, 0);

  const symbolProperty = ['value'];
  Object.defineProperty(symbolProperty, Symbol('extra'), { value: 'ignored', enumerable: true });
  assert.throws(() => canonicalJson(symbolProperty), /symbol properties/);
});

test('exported boundaries reject malformed caller arrays without invoking indexed getters', () => {
  const blockedInspection = buildInspection(TARGET, [missing('owner-log', true)]);
  const validAssessment = assessment();
  const validBlocker = {
    code: 'evidence-incomplete',
    subject: 'owner-log',
    evidenceHash: blockedInspection.evidenceHash,
  };
  const pendingApproach = assessmentApproach(validAssessment);
  const validState = {
    policy: { overall: 'unlimited', recovery: 1, recover: true, untilBlocked: false, parallel: 1, mode: 'guarded' },
    overallUsed: 2,
    recoveryUsed: [{ targetKey: targetKey(TARGET), targetHash: targetHash(TARGET), count: 1 }],
    pending: [{
      target: TARGET,
      evidenceHash: blockedInspection.evidenceHash,
      approachHash: pendingApproach,
      action: validAssessment.action,
      materialInputs: validAssessment.materialInputs,
      mode: 'recovery',
    }],
    completed: [{
      evidenceHash: blockedInspection.evidenceHash,
      approachHash: pendingApproach,
      resultHash: '1'.repeat(64),
    }],
  };
  const materialBoundary = (field, value, validate = validateAssessment) => validate({
    ...validAssessment,
    materialInputs: { ...validAssessment.materialInputs, [field]: value },
  });
  const inspectionBoundary = (field, value, validate = validateInspection) => validate({
    ...blockedInspection,
    [field]: value,
  });
  const stateBoundary = (field, value) => validateRunState({ ...validState, [field]: value });
  const boundaries = [
    ['canonicalJson array', ['value'], (value) => canonicalJson(value)],
    ['parseInvocation argv', ['feature'], (value) => parseInvocation(value)],
    ['buildInspection items', [evidence('owner-log', 'owner')], (value) => buildInspection(TARGET, value)],
    ['evidenceHash items', [evidence('owner-log', 'owner')], (value) => evidenceHash(TARGET, value)],
    ['Assessment targets', validAssessment.materialInputs.targets, (value) => materialBoundary('targets', value)],
    ['Assessment operations', validAssessment.materialInputs.operations, (value) => materialBoundary('operations', value)],
    ['Assessment checks', validAssessment.materialInputs.checks, (value) => materialBoundary('checks', value)],
    ['approachHash material arrays', validAssessment.materialInputs.targets, (value) => approachHash({
      action: validAssessment.action,
      materialInputs: { ...validAssessment.materialInputs, targets: value },
    })],
    ['Inspection items', blockedInspection.items, (value) => inspectionBoundary('items', value)],
    ['Inspection blockers', blockedInspection.blockers, (value) => inspectionBoundary('blockers', value)],
    ['modelPacket Inspection items', blockedInspection.items, (value) => inspectionBoundary('items', value, modelPacket)],
    ['modelPacket Inspection blockers', blockedInspection.blockers, (value) => inspectionBoundary('blockers', value, modelPacket)],
    ['result changedTargets', [TASK_KEY], (value) => resultHash({
      outcome: 'blocked', changedTargets: value, blockers: [validBlocker],
    })],
    ['result blockers', [validBlocker], (value) => resultHash({
      outcome: 'blocked', changedTargets: [TASK_KEY], blockers: value,
    })],
    ['RunState recoveryUsed', validState.recoveryUsed, (value) => stateBoundary('recoveryUsed', value)],
    ['RunState pending', validState.pending, (value) => stateBoundary('pending', value)],
    ['RunState completed', validState.completed, (value) => stateBoundary('completed', value)],
    ['RunState evaluationSequences', [], (value) => stateBoundary('evaluationSequences', value)],
    ['RunState learningReviewRefs', [], (value) => stateBoundary('learningReviewRefs', value)],
    ['collectEvidence directIdeas', rawInputs().directIdeas, (value) => collectEvidence(TARGET, {
      ...rawInputs(), directIdeas: value,
    })],
    ['collectEvidence currentRun', rawInputs().currentRun, (value) => collectEvidence(TARGET, {
      ...rawInputs(), currentRun: value,
    })],
    ['collectEvidence review', rawInputs().review, (value) => collectEvidence(TARGET, {
      ...rawInputs(), review: value,
    })],
    ['collectEvidence verification', rawInputs().verification, (value) => collectEvidence(TARGET, {
      ...rawInputs(), verification: value,
    })],
    ['collectEvidence lint', rawInputs().lint, (value) => collectEvidence(TARGET, {
      ...rawInputs(), lint: value,
    })],
  ];

  for (const [boundary, validArray, invoke] of boundaries) {
    for (const attack of ARRAY_ATTACKS) {
      const adversarial = adversarialArray(/** @type {unknown[]} */ (validArray), attack);
      assert.throws(
        () => /** @type {(value: unknown[]) => unknown} */ (invoke)(adversarial.value),
        TypeError,
        `${boundary}: ${attack}`,
      );
      assert.equal(adversarial.getterCalls(), 0, `${boundary}: ${attack}`);
    }
  }
});

test('source ordering is stable, exact duplicates collapse, and descriptors bind complete bytes', () => {
  const first = evidence('review', 'same');
  const duplicate = clone(first);
  const otherSource = evidence('verification', 'same');
  const owner = evidence('owner-log', 'owner');
  const inspection = buildInspection(TARGET, [first, otherSource, duplicate, owner]);
  assert.deepEqual(inspection.items.map((item) => item.source), ['owner-log', 'review', 'verification']);
  assert.notDeepEqual(descriptor(first), descriptor(evidence('review', 'different')));
  assert.notEqual(contentDescriptor(Buffer.from('oversized-a')).sha256, contentDescriptor(Buffer.from('oversized-b')).sha256);
});

test('evidenceHash distinguishes complete bodies and canonical projection fields', () => {
  const body = evidence('owner-log', 'complete-body-a', true);
  const variants = [
    evidenceHash(TARGET, [body]),
    evidenceHash(TARGET, [evidence('owner-log', 'complete-body-b', true)]),
    evidenceHash(TARGET, [evidence('owner-log', 'different-length-complete-body', true)]),
    evidenceHash(TARGET, [{ ...body, source: 'review' }]),
    evidenceHash(TARGET, [{ ...body, required: false }]),
    evidenceHash(TARGET, [{ ...body, status: 'stale' }]),
    evidenceHash({ ...TARGET, specPath: '.dude/specs/005-other-feature/spec.md' }, [body]),
    evidenceHash(TARGET, [body], true),
  ];
  assert.equal(new Set(variants).size, variants.length);
});

/** @param {unknown} target @param {ReturnType<typeof evidence>[]} items */
function packetBytes(target, items) {
  return Buffer.byteLength(canonicalJson({
    target: canonicalTarget(target),
    items: items.map((item) => ({ source: item.source, descriptor: descriptor(item), text: item.text })),
  }));
}

/** @param {number} expectedBytes @param {ReturnType<typeof evidence>[]} prefix @param {string} source */
function sizedFinalItem(expectedBytes, prefix, source) {
  let length = Math.max(0, expectedBytes - packetBytes(TARGET, [...prefix, evidence(source, '')]));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = evidence(source, 'x'.repeat(length));
    const actual = packetBytes(TARGET, [...prefix, candidate]);
    if (actual === expectedBytes) return candidate;
    length += expectedBytes - actual;
  }
  throw new Error(`could not construct ${expectedBytes}-byte packet fixture`);
}

test('exactly 16 items and exactly 65,536 canonical packet bytes are admitted together', () => {
  const sixteen = Array.from({ length: limits.items }, (_, index) => evidence('current-run', `item-${index}`));
  const countInspection = buildInspection(TARGET, sixteen);
  assert.equal(countInspection.overflow, false);
  assert.equal(modelPacket(countInspection)?.items.length, 16);

  const prefix = Array.from({ length: limits.items - 1 }, (_, index) => evidence('current-run', `item-${index}`));
  const boundaryItem = sizedFinalItem(limits.bytes, prefix, 'session');
  const byteInspection = buildInspection(TARGET, [...prefix, boundaryItem]);
  const packet = modelPacket(byteInspection);
  assert.ok(packet);
  assert.equal(packet.items.length, 16);
  assert.equal(Buffer.byteLength(canonicalJson(packet)), 65_536);
  assert.equal(byteInspection.overflow, false);
});

test('item 17 and byte 65,537 return descriptor-only refusal without truncation or a packet', () => {
  const seventeen = Array.from({ length: limits.items + 1 }, (_, index) => evidence('current-run', `item-${index}`));
  const countInspection = buildInspection(TARGET, seventeen);
  assert.equal(countInspection.overflow, true);
  assert.equal(countInspection.items.length, 17);
  assert.equal(countInspection.items[16].status, 'overflow');
  assert.ok(countInspection.items.every((item) => !Object.hasOwn(item, 'text')));
  assert.equal(modelPacket(countInspection), null);
  assert.ok(countInspection.blockers.some((blocker) => blocker.code === 'evidence-incomplete'));

  const oversized = sizedFinalItem(limits.bytes + 1, [], 'owner-log');
  const byteInspection = buildInspection(TARGET, [oversized]);
  assert.equal(byteInspection.overflow, true);
  assert.equal(byteInspection.items[0].status, 'overflow');
  assert.equal(byteInspection.items[0].byteLength, oversized.byteLength);
  assert.equal(byteInspection.items[0].sha256, oversized.sha256);
  assert.equal(modelPacket(byteInspection), null);
});

test('an exact-bound available session that crosses the packet boundary refuses the whole packet', () => {
  const prefix = [evidence('owner-log', 'owner'), evidence('lint', 'clean')];
  const session = sizedFinalItem(limits.bytes + 1, prefix, 'session');
  const inspection = buildInspection(TARGET, [...prefix, session]);
  assert.equal(inspection.overflow, true);
  assert.equal(inspection.items.at(-1)?.source, 'session');
  assert.equal(inspection.items.at(-1)?.status, 'overflow');
  assert.equal(inspection.items.at(-1)?.sha256, session.sha256);
  assert.equal(modelPacket(inspection), null);
});

test('an unavailable optional session is represented but does not itself block', () => {
  const inspection = buildInspection(TARGET, [evidence('owner-log', 'owner'), missing('session')]);
  assert.equal(inspection.overflow, false);
  assert.deepEqual(inspection.blockers, []);
  assert.deepEqual(modelPacket(inspection)?.items.map((item) => item.source), ['owner-log']);
});

test('Assessment, Blocker, Inspection, and minimal RunState invariants are exact', () => {
  const inspection = buildInspection(TARGET, [missing('owner-log', true)]);
  assert.equal(inspection.blockers.length, 1);
  assert.equal(inspection.blockers[0].subject, 'owner-log');
  assert.doesNotThrow(() => validateInspection(inspection));
  assert.throws(() => validateInspection({
    ...inspection,
    blockers: [
      { code: 'approval-required', subject: 'owner-log', evidenceHash: inspection.evidenceHash },
      ...inspection.blockers,
    ],
  }), /exactly match/);
  const boundAssessment = assessment(inspection.evidenceHash);
  assert.doesNotThrow(() => validateAssessment(TARGET, inspection, boundAssessment));
  assert.throws(() => validateAssessment(TARGET, inspection, {
    ...boundAssessment, intent: 'changed', action: 'reconcile-derived-definition',
  }), /must be unchanged/);

  const pendingAssessment = boundAssessment;
  const pendingApproach = assessmentApproach(pendingAssessment);
  const state = {
    policy: { overall: 'unlimited', recovery: 1, recover: true, untilBlocked: false, parallel: 1, mode: 'guarded' },
    overallUsed: 1,
    recoveryUsed: [{ targetKey: targetKey(TARGET), targetHash: targetHash(TARGET), count: 1 }],
    pending: [{
      target: TARGET,
      evidenceHash: inspection.evidenceHash,
      approachHash: pendingApproach,
      action: pendingAssessment.action,
      materialInputs: pendingAssessment.materialInputs,
      mode: 'recovery',
    }],
    completed: [],
  };
  assert.doesNotThrow(() => validateRunState(state));
  assert.throws(() => validateRunState({
    ...state,
    pending: [{ ...state.pending[0], approachHash: '0'.repeat(64) }],
  }), /does not match/);
  assert.throws(() => validateRunState({
    ...state,
    pending: [{
      ...state.pending[0],
      action: 'address-review',
      approachHash: approachHash('address-review', state.pending[0].materialInputs),
    }],
  }), /does not match its stored action/);
  assert.throws(() => validateRunState({
    ...state,
    pending: [{ ...state.pending[0], mode: 'ordinary' }],
  }), /incompatible with its mode/);
  assert.throws(() => validateRunState({
    ...state,
    policy: { ...state.policy, recover: false },
  }), /requires recovery policy opt-in/);
  assert.throws(() => validateRunState({ ...state, overallUsed: 2 }), /pending plus completed/);
  assert.throws(() => validateRunState({
    ...state,
    recoveryUsed: [],
  }), /canonical recovery counter/);
  assert.throws(() => validateRunState({
    ...state,
    completed: [{
      evidenceHash: inspection.evidenceHash,
      approachHash: pendingApproach,
      resultHash: '1'.repeat(64),
      target: TARGET,
    }],
  }), /unknown field/);
});

test('Assessment requires evidenceHash and stale advice returns evidence-drift with identical state', () => {
  const raw = transitionRaw(TARGET);
  const inspection = buildInspection(TARGET, collectEvidence(TARGET, raw));
  const bound = transitionAssessment('retry-task', { evidenceHash: inspection.evidenceHash });
  assert.doesNotThrow(() => validateAssessment(TARGET, inspection, bound));
  assert.throws(
    () => validateAssessment(TARGET, inspection, without(bound, 'evidenceHash')),
    /missing field 'evidenceHash'/,
  );
  for (const invalidHash of ['not-a-hash', 'A'.repeat(64), '0'.repeat(63)]) {
    assert.throws(
      () => validateAssessment(TARGET, inspection, { ...bound, evidenceHash: invalidHash }),
      /evidenceHash|hash/i,
      invalidHash,
    );
  }

  const state = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
  const matched = authorizeRuntimeAttempt(state, TARGET, raw, bound, 'recovery');
  assert.equal(matched.authorized, true);
  assert.equal(matched.state.overallUsed, 1);
  assert.deepEqual(matched.state.recoveryUsed, [{
    targetKey: targetKey(TARGET),
    targetHash: targetHash(TARGET),
    count: 1,
  }]);
  assert.equal(matched.state.pending.length, 1);

  const staleRaw = transitionRaw(TARGET, {
    currentRun: [capture(TARGET, 'failed', [{ changed: true }])],
  });
  const before = canonicalJson(state);
  const refused = authorizeRuntimeAttempt(state, TARGET, staleRaw, bound, 'recovery');
  assert.deepEqual(refused, { authorized: false, reason: 'evidence-drift', state });
  assert.strictEqual(refused.state, state);
  assert.equal(canonicalJson(state), before);
  assert.equal(refused.state.overallUsed, 0);
  assert.deepEqual(refused.state.recoveryUsed, []);
  assert.deepEqual(refused.state.pending, []);
  assert.deepEqual(refused.state.completed, []);

  const newlyBlocked = transitionRaw(TARGET, {
    currentRun: [capture(TARGET, 'approval-required', [{ changed: true }])],
  });
  const blockedDrift = authorizeRuntimeAttempt(state, TARGET, newlyBlocked, bound, 'recovery');
  assert.deepEqual(blockedDrift, { authorized: false, reason: 'evidence-drift', state });
  assert.strictEqual(blockedDrift.state, state);

  assert.doesNotMatch(fs.readFileSync(RECOVERY_SCRIPT, 'utf8'), /expectedEvidenceHash/);
  const runCommand = runtimeFunction('runCommand');
  assert.throws(() => runCommand('authorize', {
    trigger: 'start',
    state,
    input: {},
    assessment: bound,
    mode: 'recovery',
    expectedEvidenceHash: inspection.evidenceHash,
  }), /unknown field 'expectedEvidenceHash'/i);
});

test('material targets reject empty and relative segments without excluding canonical identifiers', () => {
  const inspection = buildInspection(TARGET, [evidence('owner-log', 'owner')]);
  const invalidTargets = ['', '.', '..', '/src', 'src/', 'src//file.mjs', 'src/./file.mjs', 'src/../file.mjs'];
  for (const materialTarget of invalidTargets) {
    assert.throws(
      () => validateAssessment(TARGET, inspection, transitionAssessment('retry-task', {
        evidenceHash: inspection.evidenceHash,
        targets: [materialTarget],
      })),
      /nonempty canonical identifier|empty, dot, or dot-dot path segments/,
      materialTarget,
    );
  }
  for (const materialTarget of [TASK_KEY, 'retry-task', 'src/recovery.mjs']) {
    assert.doesNotThrow(
      () => validateAssessment(TARGET, inspection, transitionAssessment('retry-task', {
        evidenceHash: inspection.evidenceHash,
        targets: [materialTarget],
      })),
      materialTarget,
    );
  }

  const secondTarget = { ...TARGET, taskKey: SECOND_TASK_KEY };
  const bytes = transitionTasksBytes([
    { id: TASK_KEY, glyph: '~' },
    { id: SECOND_TASK_KEY },
  ]);
  const first = authorizeAttempt(
    emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
    TARGET,
    transitionRaw(TARGET, {
      tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
    }),
    transitionAssessment('retry-task', { targets: ['src/first.mjs'] }),
    'recovery',
  );
  assert.equal(first.authorized, true);
  const before = clone(first.state);
  for (const materialTarget of ['.', '..']) {
    assert.throws(() => authorizeAttempt(
      first.state,
      secondTarget,
      transitionRaw(secondTarget, {
        tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
      }),
      transitionAssessment('retry-task', { targets: [materialTarget] }),
      'recovery',
    ), /dot/);
    assert.deepEqual(first.state, before);
  }
});

test('B: RunState rejects every state with more than one pending authorization', () => {
  const secondTarget = { ...TARGET, taskKey: SECOND_TASK_KEY };
  const otherFeatureTarget = { specPath: OTHER_SPEC_PATH, lane: 'lightweight', taskKey: THIRD_TASK_KEY };
  const secondTracked = { ...TRACKED, issueId: 'dude-43' };
  const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };

  const pendingEntry = (target, targets, action = 'execute-task', mode = 'ordinary') => {
    const candidate = transitionAssessment(action, { targets });
    return {
      target,
      evidenceHash: '1'.repeat(64),
      approachHash: assessmentApproach(candidate),
      action,
      materialInputs: candidate.materialInputs,
      mode,
    };
  };
  const pendingState = (entries) => {
    const pending = [...entries].sort((left, right) => (
      Buffer.compare(Buffer.from(targetKey(left.target)), Buffer.from(targetKey(right.target)))
      || Buffer.compare(Buffer.from(left.evidenceHash), Buffer.from(right.evidenceHash))
      || Buffer.compare(Buffer.from(left.approachHash), Buffer.from(right.approachHash))
    ));
    const recoveryUsed = pending
      .filter((entry) => entry.mode === 'recovery')
      .map((entry) => ({
        targetKey: targetKey(entry.target),
        targetHash: targetHash(entry.target),
        count: 1,
      }))
      .sort((left, right) => Buffer.compare(Buffer.from(left.targetKey), Buffer.from(right.targetKey)));
    return {
      policy: {
        overall: 'unlimited',
        recovery: 'unlimited',
        recover: recoveryUsed.length > 0,
        untilBlocked: false,
        parallel: 1,
        mode: 'guarded',
      },
      overallUsed: pending.length,
      recoveryUsed,
      pending,
      completed: [],
    };
  };

  const disjointButUnauthoritative = pendingState([
    pendingEntry(TARGET, ['src/first.mjs']),
    pendingEntry(secondTarget, ['src/second.mjs']),
  ]);
  const validSequential = pendingState([pendingEntry(TARGET, [])]);
  assert.doesNotThrow(() => validateRunState(validSequential));
  assert.throws(() => validateRunState(disjointButUnauthoritative), /more than one pending|sequential/i);
  for (const parallel of [0, 2, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () => validateRunState({
        ...validSequential,
        policy: { ...validSequential.policy, parallel },
      }),
      /parallel.*(?:positive safe integer|literal.*1|must.*1)/i,
      String(parallel),
    );
  }

  const featureRecovery = {
    ...emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
    overallUsed: 1,
    recoveryUsed: [{
      targetKey: targetKey(featureTarget),
      targetHash: targetHash(featureTarget),
      count: 1,
    }],
    completed: [{
      evidenceHash: '1'.repeat(64),
      approachHash: '2'.repeat(64),
      resultHash: '3'.repeat(64),
    }],
  };
  const impossible = [
    ['feature-only recovery counter', featureRecovery, /must identify a task target/],
    ['feature-only pending target', pendingState([
      pendingEntry(featureTarget, ['src/feature.mjs']),
    ]), /must identify a task target/],
    ['tracked definition reconciliation', pendingState([
      pendingEntry(TRACKED, definitionTargets(), 'reconcile-derived-definition', 'recovery'),
    ]), /does not support tracked definition recovery/],
    ['cross-feature peers', pendingState([
      pendingEntry(TARGET, ['src/first.mjs']),
      pendingEntry(otherFeatureTarget, ['src/other.mjs']),
    ]), /more than one pending|sequential/i],
    ['tracked peers', pendingState([
      pendingEntry(TRACKED, ['src/first.mjs']),
      pendingEntry(secondTracked, ['src/second.mjs']),
    ]), /more than one pending|sequential/i],
    ['empty peer targets', pendingState([
      pendingEntry(TARGET, []),
      pendingEntry(secondTarget, ['src/second.mjs']),
    ]), /more than one pending|sequential/i],
    ['equal peer targets', pendingState([
      pendingEntry(TARGET, ['src/shared.mjs']),
      pendingEntry(secondTarget, ['src/shared.mjs']),
    ]), /more than one pending|sequential/i],
    ['ancestor peer targets', pendingState([
      pendingEntry(TARGET, ['src']),
      pendingEntry(secondTarget, ['src/second.mjs']),
    ]), /more than one pending|sequential/i],
  ];

  for (const [name, state, expected] of impossible) {
    assert.throws(
      () => validateRunState(state),
      /** @type {RegExp} */ (expected),
      /** @type {string} */ (name),
    );
    const before = clone(state);
    let resultGetterCalls = 0;
    const pending = /** @type {Record<string, unknown>[]} */ (state.pending)[0];
    const input = {
      target: clone(pending?.target || TARGET),
      evidenceHash: pending?.evidenceHash || '1'.repeat(64),
      approachHash: pending?.approachHash || '2'.repeat(64),
      result: new Proxy({}, {
        getPrototypeOf() {
          resultGetterCalls += 1;
          return Object.prototype;
        },
      }),
    };
    assert.throws(
      () => completeAttempt(state, input),
      /** @type {RegExp} */ (expected),
      /** @type {string} */ (name),
    );
    assert.deepEqual(state, before, /** @type {string} */ (name));
    assert.equal(resultGetterCalls, 0, /** @type {string} */ (name));
  }
});

test('inspect acquires one exact owner and canonical task while ignoring generated board bytes', () => {
  withWorkspace((root) => {
    const ownerPath = path.join(root, '.dude/ideas/owner.md');
    const tasksPath = path.join(root, path.dirname(SPEC_PATH), 'tasks.md');
    fs.writeFileSync(ownerPath, [
      '---',
      'title: Owner',
      'slug: owner',
      'status: defined',
      `spec_path: ${SPEC_PATH}`,
      '---',
      '',
      '## Idea',
      '',
      'Intent.',
      '',
      '## Coordinator Log',
      '',
      '- exact event',
      '',
    ].join('\n'));
    fs.writeFileSync(tasksPath, [
      '<!-- dude:board:start -->',
      '- [!] T999@ffffffff [US9] GENERATED ONLY',
      '<!-- dude:board:end -->',
      '',
      '# Tasks',
      '',
      `- [~] ${TASK_KEY} [US1] Canonical task`,
      '    deps: T000@aaaaaaaa',
      '    blocked-by: waiting',
      '- [x] T000@aaaaaaaa [US1] Dependency',
      '',
      '## Lightweight Execution History',
      '- retained history',
      '',
    ].join('\n'));
    const beforeEntries = fs.readdirSync(root, { recursive: true }).sort();
    const beforeBytes = [SPEC_PATH, '.dude/ideas/owner.md', `${path.dirname(SPEC_PATH)}/tasks.md`]
      .map((relativePath) => fs.readFileSync(path.join(root, relativePath)));

    const inspection = inspect({
      root,
      specPath: SPEC_PATH,
      target: TARGET,
      lane: { kind: 'lightweight' },
      currentRun: [],
      review: [],
      verification: [],
      lint: [],
    });
    assert.equal(inspection.blockers.length, 0);
    const owner = inspection.items.find((item) => item.source === 'owner-log');
    const tasks = inspection.items.find((item) => item.source === 'task-history');
    assert.equal(
      JSON.parse(owner?.text || '{}').coordinatorLog,
      '## Coordinator Log\n\n- exact event\n',
    );
    assert.match(tasks?.text || '', new RegExp(TASK_KEY.replace('@', '\\@')));
    assert.match(tasks?.text || '', /waiting/);
    assert.match(tasks?.text || '', /retained history/);
    assert.doesNotMatch(tasks?.text || '', /GENERATED ONLY/);
    assert.deepEqual(fs.readdirSync(root, { recursive: true }).sort(), beforeEntries);
    assert.deepEqual(
      [SPEC_PATH, '.dude/ideas/owner.md', `${path.dirname(SPEC_PATH)}/tasks.md`]
        .map((relativePath) => fs.readFileSync(path.join(root, relativePath))),
      beforeBytes,
    );
  });
});

test('owner acquisition fails closed for zero, multiple, and malformed direct owners', () => {
  const cases = [
    {
      name: 'zero',
      directIdeas: [],
      status: 'missing',
      blocker: 'evidence-incomplete',
    },
    {
      name: 'multiple',
      directIdeas: [
        { path: '.dude/ideas/a.md', bytes: ideaBytes() },
        { path: '.dude/ideas/b.md', bytes: ideaBytes() },
      ],
      status: 'conflict',
      blocker: 'ambiguous-state',
    },
    {
      name: 'malformed',
      directIdeas: [{ path: '.dude/ideas/bad.md', bytes: Buffer.from('not frontmatter') }],
      status: 'malformed',
      blocker: 'evidence-incomplete',
    },
  ];
  for (const fixture of cases) {
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
      directIdeas: fixture.directIdeas,
    })));
    const owner = inspection.items.find((item) => item.source === 'owner-log');
    assert.equal(owner?.status, fixture.status, fixture.name);
    assert.ok(
      inspection.blockers.some((blocker) => blocker.code === fixture.blocker && blocker.subject === 'owner-log'),
      fixture.name,
    );
  }
});

test('T008: public inspect APIs acquire the exact owner beside an unrelated valid defined ledger', () => {
  const runCommand = runtimeFunction('runCommand');
  withWorkspace((root) => {
    const unrelatedSpecPath = '.dude/specs/x/spec.md';
    const targetOwner = { path: IDEA_PATH, bytes: ideaBytes() };
    const unrelatedOwner = {
      path: '.dude/ideas/unrelated.md',
      bytes: ideaBytes(unrelatedSpecPath, '- unrelated event\n'),
    };
    fs.mkdirSync(path.join(root, path.dirname(unrelatedSpecPath)), { recursive: true });
    fs.writeFileSync(path.join(root, unrelatedSpecPath), '# Unrelated Spec\n');
    fs.writeFileSync(path.join(root, targetOwner.path), targetOwner.bytes);
    fs.writeFileSync(path.join(root, unrelatedOwner.path), unrelatedOwner.bytes);
    fs.writeFileSync(path.join(root, path.dirname(SPEC_PATH), 'tasks.md'), tasksBytes());

    assert.equal(parseSpecIdentity(unrelatedSpecPath)?.path, unrelatedSpecPath);
    assert.deepEqual(resolveFeatureOwner({ root, specPath: SPEC_PATH }), {
      owner: { ideaPath: IDEA_PATH, specPath: SPEC_PATH },
      diagnostics: [],
    });

    const input = publicInspectionInput(root);
    const inspections = [
      inspect(input),
      runCommand('inspect', {
        trigger: 'explicit-inspection',
        input: cliInput(input),
      }).inspection,
    ];
    for (const inspection of inspections) {
      const owner = inspection.items.find((item) => item.source === 'owner-log');
      assert.equal(owner?.status, 'present');
      assert.equal(JSON.parse(owner?.text || '{}').ideaPath, IDEA_PATH);
      assert.equal(inspection.blockers.some((blocker) => blocker.subject === 'owner-log'), false);
    }
  });
});

test('Coordinator Log extraction matches lint fence semantics across logical line endings', () => {
  for (const separator of ['\n', '\r\n', '\r']) {
    const ownerBytes = Buffer.from([
      '---',
      'title: Owner',
      'slug: owner',
      'status: defined',
      `spec_path: ${SPEC_PATH}`,
      '---',
      '',
      '## Idea',
      '',
      'Intent.',
      '',
      '```~~~md',
      '## Coordinator Log',
      '```',
      '',
      '~~~```md',
      '## Coordinator Log',
      '~~~',
      '',
      '## Coordinator Log',
      '',
      '- exact event',
      '',
      '```~~~md',
      '## fenced subsection',
      '```',
      '',
      '~~~```md',
      '# fenced title',
      '~~~',
      '',
      '## After Log',
      '- excluded',
    ].join(separator));
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
      directIdeas: [{ path: '.dude/ideas/owner.md', bytes: ownerBytes }],
    })));
    const owner = inspection.items.find((item) => item.source === 'owner-log');
    const coordinatorLog = JSON.parse(owner?.text || '{}').coordinatorLog || '';
    assert.equal(owner?.status, 'present', JSON.stringify(separator));
    assert.ok(coordinatorLog.startsWith(['## Coordinator Log', '', '- exact event'].join(separator)));
    assert.ok(coordinatorLog.includes('## fenced subsection'));
    assert.ok(coordinatorLog.includes('# fenced title'));
    assert.equal(coordinatorLog.includes('## After Log'), false);
    assert.equal(coordinatorLog.includes('- excluded'), false);
  }
});

test('Coordinator Log extraction rejects missing and duplicate real headings', () => {
  const fixtures = [
    {
      name: 'missing real heading',
      body: ['```md', '## Coordinator Log', '```', '~~~md', '## Coordinator Log', '~~~'],
    },
    {
      name: 'duplicate real heading',
      body: ['## Coordinator Log', '', '- first', '', '## Coordinator Log', '', '- second'],
    },
  ];
  for (const fixture of fixtures) {
    const ownerBytes = Buffer.from([
      '---',
      'title: Owner',
      'slug: owner',
      'status: defined',
      `spec_path: ${SPEC_PATH}`,
      '---',
      '',
      '## Idea',
      '',
      'Intent.',
      '',
      ...fixture.body,
      '',
    ].join('\n'));
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
      directIdeas: [{ path: '.dude/ideas/owner.md', bytes: ownerBytes }],
    })));
    const owner = inspection.items.find((item) => item.source === 'owner-log');
    assert.equal(owner?.status, 'malformed', fixture.name);
    assert.ok(
      inspection.blockers.some((blocker) => blocker.subject === 'owner-log'),
      fixture.name,
    );
  }
});

test('task history retains target state, deps, blocker, discovered work, and history but not the board', () => {
  const taskInspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs()));
  const taskItem = taskInspection.items.find((item) => item.source === 'task-history');
  const taskBody = JSON.parse(taskItem?.text || '{}');
  assert.deepEqual(taskBody.canonicalTasks.map((task) => task.id), [TASK_KEY]);
  assert.equal(taskBody.canonicalTasks[0].state, 'in-progress');
  assert.deepEqual(taskBody.canonicalTasks[0].deps, ['T000@aaaaaaaa']);
  assert.equal(taskBody.canonicalTasks[0].blockedBy, 'waiting');
  assert.deepEqual(taskBody.dependencies.map((task) => task.id), ['T000@aaaaaaaa']);
  assert.match(taskBody.discovered, /T9001@bbbbbbbb/);
  assert.match(taskBody.history, /retained history/);
  assert.doesNotMatch(taskItem?.text || '', /GENERATED ONLY/);

  const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };
  const featureInspection = buildInspection(
    featureTarget,
    collectEvidence(featureTarget, rawInputs()),
  );
  const featureTaskItem = featureInspection.items.find((item) => item.source === 'task-history');
  const featureLaneItem = featureInspection.items.find((item) => item.source === 'lane-history');
  const featureTaskBody = JSON.parse(featureTaskItem?.text || '{}');
  const featureLaneBody = JSON.parse(featureLaneItem?.text || '{}');
  assert.deepEqual(
    featureTaskBody.canonicalTasks.map((task) => task.id),
    [TASK_KEY, 'T000@aaaaaaaa', 'T9001@bbbbbbbb'],
  );
  assert.deepEqual(
    featureLaneBody.canonicalTasks.map((task) => task.id),
    [TASK_KEY, 'T000@aaaaaaaa', 'T9001@bbbbbbbb'],
  );
  assert.equal(featureInspection.target.taskKey, undefined);
  assert.equal(featureInspection.blockers.length, 0);
});

test('discovered work uses only active pre-history content outside the generated board', () => {
  const bytes = Buffer.from([
    '<!-- dude:board:start -->',
    '## Lightweight Execution History',
    '## Discovered During Execution',
    '- [ ] T9100@aaaaaaaa [Shared] BOARD MISLEADING',
    '<!-- dude:board:end -->',
    '',
    '# Tasks',
    '',
    `- [~] ${TASK_KEY} [US1] Canonical task`,
    '',
    '## Discovered During Execution',
    '- [ ] T9200@bbbbbbbb [Shared] LIVE DISCOVERED',
    '',
    '## Lightweight Execution History',
    '- retained history',
    '',
    '## Discovered During Execution',
    '- [ ] T9300@cccccccc [Shared] ARCHIVED MISLEADING',
    '',
  ].join('\n'));
  const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
    tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
  })));
  const taskItem = inspection.items.find((item) => item.source === 'task-history');
  const taskBody = JSON.parse(taskItem?.text || '{}');
  assert.equal(taskItem?.status, 'present');
  assert.match(taskBody.discovered, /LIVE DISCOVERED/);
  assert.doesNotMatch(taskBody.discovered, /BOARD MISLEADING/);
  assert.doesNotMatch(taskBody.discovered, /ARCHIVED MISLEADING/);
  assert.match(taskBody.history, /ARCHIVED MISLEADING/);
});

test('all current-run states normalize and only authority or intent stops become blockers', () => {
  const states = [
    'clarification-required',
    'approval-required',
    'external-dependency',
    'safety-or-authority',
    'blocked',
    'failed',
    'succeeded',
    'interrupted',
  ];
  const blockingStates = new Set(states.slice(0, 4));
  for (const state of states) {
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
      currentRun: [capture(TARGET, state, [{ outcome: state }])],
    })));
    const run = inspection.items.find((item) => item.source === 'current-run');
    assert.equal(run?.status, 'present', state);
    assert.equal(JSON.parse(run?.text || '{}').state, state);
    assert.equal(
      inspection.blockers.some((blocker) => blocker.code === state),
      blockingStates.has(state),
      state,
    );
  }
});

test('current-run rejects wrong-target, stale-only, state mismatch, and normalized hash mismatch captures', () => {
  const otherTarget = {
    specPath: '.dude/specs/005-other-feature/spec.md',
    lane: 'lightweight',
    taskKey: TASK_KEY,
  };
  const valid = capture(TARGET, 'succeeded', [{ changed: true }]);
  const wrongTarget = capture(otherTarget, 'succeeded');
  const wrongBodyTarget = {
    ...valid,
    bytes: capture(otherTarget, 'succeeded', [{ changed: true }]).bytes,
  };
  const stateMismatch = { ...valid, state: 'failed' };
  const hashMismatch = { ...valid, outcomeHash: '0'.repeat(64) };
  const cases = [
    ['wrong-target', [wrongTarget], 'stale'],
    ['stale-only', [wrongTarget, capture(otherTarget, 'failed')], 'stale'],
    ['body target mismatch', [wrongBodyTarget], 'conflict'],
    ['state mismatch', [stateMismatch], 'conflict'],
    ['hash mismatch', [hashMismatch], 'conflict'],
  ];
  for (const [name, currentRun, expectedStatus] of cases) {
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({ currentRun })));
    const run = inspection.items.find((item) => item.source === 'current-run');
    assert.equal(run?.status, expectedStatus, /** @type {string} */ (name));
    assert.ok(
      inspection.blockers.some((blocker) => (
        blocker.code === 'evidence-incomplete' && blocker.subject === 'current-run'
      )),
      /** @type {string} */ (name),
    );
  }
});

test('explicit empty required streams are present while omitted streams are missing and blocking', () => {
  const present = buildInspection(TARGET, collectEvidence(TARGET, rawInputs()));
  for (const source of ['current-run', 'review', 'verification', 'lint']) {
    const item = present.items.find((candidate) => candidate.source === source);
    assert.equal(item?.status, 'present', source);
    assert.equal(item?.text, '[]', source);
    assert.equal(present.blockers.some((blocker) => blocker.subject === source), false, source);
  }

  const omittedRaw = rawInputs();
  delete omittedRaw.currentRun;
  delete omittedRaw.review;
  delete omittedRaw.verification;
  delete omittedRaw.lint;
  const omitted = buildInspection(TARGET, collectEvidence(TARGET, omittedRaw));
  for (const source of ['current-run', 'review', 'verification', 'lint']) {
    const item = omitted.items.find((candidate) => candidate.source === source);
    assert.equal(item?.status, 'missing', source);
    assert.ok(
      omitted.blockers.some((blocker) => (
        blocker.code === 'evidence-incomplete' && blocker.subject === source
      )),
      source,
    );
  }
});

test('review, verification, and lint outcomes remain recoverable evidence without failure blockers', () => {
  const matrices = [
    ['review', ['none', 'accepted', 'rejected']],
    ['verification', ['none', 'passed', 'failed']],
    ['lint', ['none', 'passed', 'failed']],
  ];
  for (const [field, states] of matrices) {
    for (const state of /** @type {string[]} */ (states)) {
      const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
        [field]: [capture(TARGET, state, [{ check: field, outcome: state }])],
      })));
      const item = inspection.items.find((candidate) => candidate.source === field);
      assert.equal(item?.status, 'present', `${field}:${state}`);
      assert.equal(JSON.parse(item?.text || '{}').state, state, `${field}:${state}`);
      assert.equal(
        inspection.blockers.some((blocker) => (
          blocker.code === 'review-rejected' || blocker.code === 'verification-failed'
        )),
        false,
        `${field}:${state}`,
      );
    }
  }
});

for (const [field, source, state] of [
  ['currentRun', 'current-run', 'failed'],
  ['review', 'review', 'rejected'],
  ['verification', 'verification', 'failed'],
  ['lint', 'lint', 'failed'],
]) {
  test(`D: ${source} presentation envelopes do not change item or evidence hashes`, () => {
  const presentationId = source === 'current-run'
    ? 'eventId'
    : source === 'review'
      ? 'reviewId'
      : 'runId';
  const firstPresentation = {
    [presentationId]: 'event-a',
    timestamp: '2026-07-19T00:00:00Z',
    summary: 'First presentation.',
    rationale: 'First rationale.',
  };
  const secondPresentation = {
    [presentationId]: 'event-b',
    timestamp: '2026-07-19T01:00:00Z',
    summary: 'Second presentation.',
    rationale: 'Second rationale.',
  };
    const substantive = {
      check: source,
      outcome: state,
      detail: { id: 'nested-a', summary: 'same material result' },
    };
    const inspectCapture = (record, presentation) => buildInspection(
      TARGET,
      collectEvidence(TARGET, transitionRaw(TARGET, {
        [field]: [wrappedCapture(TARGET, state, record, presentation)],
      })),
    );
    const first = inspectCapture(substantive, firstPresentation);
    const second = inspectCapture(substantive, secondPresentation);
    const changedId = inspectCapture(
      { ...substantive, detail: { ...substantive.detail, id: 'nested-b' } },
      secondPresentation,
    );
    const changedSummary = inspectCapture(
      { ...substantive, detail: { ...substantive.detail, summary: 'materially changed result' } },
      secondPresentation,
    );
    const firstItem = first.items.find((item) => item.source === source);
    const secondItem = second.items.find((item) => item.source === source);
    const changedIdItem = changedId.items.find((item) => item.source === source);
    const changedSummaryItem = changedSummary.items.find((item) => item.source === source);
    assert.equal(firstItem?.status, 'present', /** @type {string} */ (field));
    assert.equal(secondItem?.status, 'present', /** @type {string} */ (field));
    assert.equal(changedIdItem?.status, 'present', /** @type {string} */ (field));
    assert.equal(changedSummaryItem?.status, 'present', /** @type {string} */ (field));
    assert.equal(firstItem?.sha256, secondItem?.sha256, /** @type {string} */ (field));
    assert.equal(first.evidenceHash, second.evidenceHash, /** @type {string} */ (field));
    assert.notEqual(firstItem?.sha256, changedIdItem?.sha256, /** @type {string} */ (field));
    assert.notEqual(first.evidenceHash, changedId.evidenceHash, /** @type {string} */ (field));
    assert.notEqual(firstItem?.sha256, changedSummaryItem?.sha256, /** @type {string} */ (field));
    assert.notEqual(first.evidenceHash, changedSummary.evidenceHash, /** @type {string} */ (field));
  });
}

for (const [field, source, state] of [
  ['currentRun', 'current-run', 'failed'],
  ['review', 'review', 'rejected'],
  ['verification', 'verification', 'failed'],
  ['lint', 'lint', 'failed'],
]) {
  test(`D: ${source} rejects unknown authority fields`, () => {
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, transitionRaw(TARGET, {
      [field]: [wrappedCapture(
        TARGET,
        state,
        { check: source, outcome: state },
        { authority: 'caller', summary: 'Not authority.' },
      )],
    })));
    assert.equal(
      inspection.items.find((item) => item.source === source)?.status,
      'malformed',
      /** @type {string} */ (field),
    );
    assert.ok(
      inspection.blockers.some((blocker) => blocker.subject === source),
      /** @type {string} */ (field),
    );
  });
}

test('D: source records reject flattened wrappers, unknown envelope fields, and source-invalid presentation', () => {
  const cases = [
    ['currentRun', 'current-run', 'failed', 'reviewId'],
    ['review', 'review', 'rejected', 'eventId'],
    ['verification', 'verification', 'failed', 'reviewId'],
    ['lint', 'lint', 'failed', 'eventId'],
  ];
  for (const [field, source, state, invalidPresentationField] of cases) {
    const valid = capture(TARGET, state, [{ nested: { id: 'kept', summary: 'kept' } }]);
    const body = JSON.parse(valid.bytes.toString('utf8'));
    const validPresentationField = source === 'current-run'
      ? 'eventId'
      : source === 'review'
        ? 'reviewId'
        : 'runId';
    const invalidRecords = [
      { nested: { id: 'flattened', summary: 'flattened' } },
      { ...body.records[0], unknown: true },
      {
        ...body.records[0],
        presentation: { [invalidPresentationField]: 'wrong-source-wrapper' },
      },
      {
        ...body.records[0],
        presentation: { [validPresentationField]: 1 },
      },
    ];
    for (const [recordIndex, record] of invalidRecords.entries()) {
      const malformed = {
        ...valid,
        bytes: Buffer.from(canonicalJson({ ...body, records: [record] })),
      };
      const inspection = buildInspection(TARGET, collectEvidence(TARGET, transitionRaw(TARGET, {
        [field]: [malformed],
      })));
      assert.equal(
        inspection.items.find((item) => item.source === source)?.status,
        'malformed',
        `${field}:invalid-record-${recordIndex}`,
      );
    }
    const unicodePlaceholder = 'invalid-unicode-placeholder';
    const invalidUnicodeBody = canonicalJson({
      ...body,
      records: [{
        ...body.records[0],
        presentation: { summary: unicodePlaceholder },
      }],
    }).replace(`"${unicodePlaceholder}"`, '"\\ud800"');
    assert.throws(
      () => collectEvidence(TARGET, transitionRaw(TARGET, {
        [field]: [{ ...valid, bytes: Buffer.from(invalidUnicodeBody) }],
      })),
      /unpaired surrogate|canonical JSON|JSON representation/i,
      `${field}:invalid-presentation-unicode`,
    );
  }
});

test('session acquisition includes only exact-bound available text and treats other absence as nonblocking', () => {
  const otherTarget = {
    specPath: '.dude/specs/005-other-feature/spec.md',
    lane: 'lightweight',
    taskKey: TASK_KEY,
  };
  const cases = [
    ['omitted', undefined],
    ['unavailable', { target: TARGET, availability: 'unavailable' }],
    ['wrong-target', { target: otherTarget, availability: 'available', bytes: Buffer.from('unrelated') }],
    ['missing bytes', { target: TARGET, availability: 'available' }],
    ['invalid bytes', { target: TARGET, availability: 'available', bytes: 'not-bytes' }],
    ['malformed availability', { target: TARGET, availability: 'malformed', bytes: Buffer.from('ignored') }],
    ['stale availability', { target: TARGET, availability: 'stale', bytes: Buffer.from('ignored') }],
    ['conflict availability', { target: TARGET, availability: 'conflict', bytes: Buffer.from('ignored') }],
    ['unknown field', { target: TARGET, availability: 'available', bytes: Buffer.from('ignored'), status: 'present' }],
  ];
  for (const [name, session] of cases) {
    const overrides = session === undefined ? {} : { session };
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs(overrides)));
    const item = inspection.items.find((candidate) => candidate.source === 'session');
    assert.equal(item?.status, 'missing', /** @type {string} */ (name));
    assert.equal(item?.required, false, /** @type {string} */ (name));
    assert.equal(Object.hasOwn(item || {}, 'text'), false, /** @type {string} */ (name));
    assert.equal(modelPacket(inspection)?.items.some((candidate) => candidate.source === 'session'), false);
    assert.equal(inspection.blockers.some((blocker) => blocker.subject === 'session'), false, /** @type {string} */ (name));
  }

  const exact = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
    session: { target: TARGET, availability: 'available', bytes: Buffer.from('exact session body') },
  })));
  const exactItem = exact.items.find((candidate) => candidate.source === 'session');
  assert.equal(exactItem?.status, 'present');
  assert.equal(exactItem?.text, 'exact session body');
  assert.ok(modelPacket(exact)?.items.some((item) => item.source === 'session'));

  const nontextBytes = Buffer.from([0x00, 0xff, 0x80]);
  const nontext = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
    session: { target: TARGET, availability: 'available', bytes: nontextBytes },
  })));
  const nontextItem = nontext.items.find((candidate) => candidate.source === 'session');
  assert.equal(nontextItem?.status, 'nontext');
  assert.equal(nontextItem?.required, false);
  assert.equal(nontextItem?.sha256, sha256(nontextBytes));
  assert.equal(nontextItem?.byteLength, nontextBytes.length);
  assert.equal(Object.hasOwn(nontextItem || {}, 'text'), false);
  assert.equal(nontext.blockers.some((blocker) => blocker.subject === 'session'), false);
  assert.equal(modelPacket(nontext)?.items.some((item) => item.source === 'session'), false);
});

test('malformed and unbound sessions cannot become item 17 or cross the byte boundary', () => {
  const otherTarget = {
    specPath: '.dude/specs/005-other-feature/spec.md',
    lane: 'lightweight',
    taskKey: TASK_KEY,
  };
  const sessions = [
    ['malformed', { target: TARGET, availability: 'stale', bytes: Buffer.alloc(limits.bytes) }],
    ['unbound', { target: otherTarget, availability: 'available', bytes: Buffer.alloc(limits.bytes) }],
  ];
  for (const [name, session] of sessions) {
    const sessionItem = collectEvidence(TARGET, rawInputs({ session }))
      .find((item) => item.source === 'session');
    assert.equal(sessionItem?.status, 'missing', /** @type {string} */ (name));
    assert.equal(Object.hasOwn(sessionItem || {}, 'text'), false, /** @type {string} */ (name));

    const sixteen = Array.from(
      { length: limits.items },
      (_, index) => evidence('current-run', `item-${index}`),
    );
    const countInspection = buildInspection(TARGET, [...sixteen, sessionItem]);
    assert.equal(countInspection.items.length, limits.items + 1, /** @type {string} */ (name));
    assert.equal(countInspection.overflow, false, /** @type {string} */ (name));
    assert.equal(modelPacket(countInspection)?.items.length, limits.items, /** @type {string} */ (name));

    const prefix = Array.from(
      { length: limits.items - 1 },
      (_, index) => evidence('current-run', `byte-item-${index}`),
    );
    const boundaryItem = sizedFinalItem(limits.bytes, prefix, 'lint');
    const byteInspection = buildInspection(TARGET, [...prefix, boundaryItem, sessionItem]);
    const packet = modelPacket(byteInspection);
    assert.equal(byteInspection.overflow, false, /** @type {string} */ (name));
    assert.equal(Buffer.byteLength(canonicalJson(packet)), limits.bytes, /** @type {string} */ (name));
    assert.equal(packet?.items.some((item) => item.source === 'session'), false, /** @type {string} */ (name));
  }
});

test('collected exact session and record count overflow produce one descriptor-only refusal', () => {
  const largeSession = 's'.repeat(limits.bytes);
  const byteInspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({
    session: { target: TARGET, availability: 'available', bytes: Buffer.from(largeSession) },
  })));
  assert.equal(byteInspection.overflow, true);
  assert.equal(modelPacket(byteInspection), null);
  assert.ok(byteInspection.items.every((item) => !Object.hasOwn(item, 'text')));
  assert.equal(byteInspection.items.find((item) => item.source === 'session')?.status, 'overflow');

  const runs = Array.from({ length: 11 }, (_, index) => (
    capture(TARGET, 'succeeded', [{ index }])
  ));
  const countInspection = buildInspection(TARGET, collectEvidence(TARGET, rawInputs({ currentRun: runs })));
  assert.equal(countInspection.items.length, 18);
  assert.equal(countInspection.overflow, true);
  assert.equal(modelPacket(countInspection), null);
  assert.ok(countInspection.blockers.some((blocker) => blocker.subject === 'model-packet'));
});

test('tracked acquisition invokes one synchronous capability with the exact closed envelope', () => {
  const captureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const raw = trackedRawInputs([captureValue]);
  const calls = [];
  const items = collectEvidence({ ...TRACKED, taskKey: TASK_KEY }, raw, {
    normalizeTrackedEvidence(input) {
      calls.push(input);
      return trackedProjection(TRACKED, [captureValue]);
    },
  });

  assert.deepEqual(calls, [{
    kind: 'tracked',
    listBytes: raw.lane.listBytes,
    issues: raw.lane.issues,
    target: { ...TRACKED, taskKey: TASK_KEY },
  }]);
  const lane = items.find((item) => item.source === 'lane-history');
  assert.equal(lane?.required, true);
  assert.equal(lane?.status, 'present');
  assert.deepEqual(JSON.parse(lane?.text || '{}'), {
    kind: 'tracked',
    records: trackedProjection(TRACKED, [captureValue]).records,
  });
});

test('tracked issue-only and verified taskKey acquisition have identical lane text and identity', () => {
  const mappedTarget = { ...TRACKED, taskKey: TASK_KEY };
  const captureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const raw = trackedRawInputs([captureValue]);
  Object.assign(raw, {
    currentRun: [capture(mappedTarget, 'failed', [{ phase: 'implementation' }])],
    review: [capture(mappedTarget, 'rejected', [{ finding: 'revise' }])],
    verification: [capture(mappedTarget, 'failed', [{ command: 'node --test' }])],
    lint: [capture(mappedTarget, 'passed', [{ command: 'node --check' }])],
    session: {
      target: mappedTarget,
      availability: 'available',
      bytes: Buffer.from('complete session evidence'),
    },
  });
  const dependencies = {
    normalizeTrackedEvidence(input) {
      return trackedProjection(/** @type {Record<string, unknown>} */ (input.target), [captureValue]);
    },
  };
  const issueItems = collectEvidence(TRACKED, raw, dependencies);
  const mappedItems = collectEvidence(mappedTarget, raw, dependencies);
  assert.deepEqual(mappedItems, issueItems);
  assert.deepEqual(
    JSON.parse(issueItems.find((item) => item.source === 'task-history')?.text || '{}')
      .canonicalTasks.map((task) => task.id),
    [TASK_KEY, 'T000@aaaaaaaa', 'T9001@bbbbbbbb'],
  );
  for (const source of [
    'owner-log',
    'task-history',
    'lane-history',
    'current-run',
    'review',
    'verification',
    'lint',
    'session',
  ]) {
    assert.deepEqual(
      mappedItems.filter((item) => item.source === source),
      issueItems.filter((item) => item.source === source),
      source,
    );
  }

  const issueInspection = buildInspection(TRACKED, issueItems);
  const mappedInspection = buildInspection(mappedTarget, mappedItems);
  assert.deepEqual(mappedInspection, issueInspection);
  assert.deepEqual(mappedInspection.target, TRACKED);
  assert.equal(mappedInspection.evidenceHash, issueInspection.evidenceHash);
  assert.deepEqual(modelPacket(mappedInspection), modelPacket(issueInspection));
  assert.equal(
    mappedItems.find((item) => item.source === 'lane-history')?.text,
    issueItems.find((item) => item.source === 'lane-history')?.text,
  );
  assert.equal(mappedInspection.blockers.length, 0);
});

test('tracked capability failures become lane evidence and cannot consume authorization', () => {
  const captureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const raw = trackedRawInputs([captureValue]);
  const malformed = [
    ['missing capability', {}, 'missing', 'evidence-incomplete'],
    ['throwing capability', { normalizeTrackedEvidence() { throw new Error('capture rejected'); } }, 'malformed', 'evidence-incomplete'],
    ['thenable projection', { normalizeTrackedEvidence() { return Promise.resolve(trackedProjection(TRACKED, [captureValue])); } }, 'malformed', 'evidence-incomplete'],
    ['malformed projection', { normalizeTrackedEvidence() { return { target: TRACKED, records: {}, authority: true }; } }, 'malformed', 'evidence-incomplete'],
    ['mismatched target', { normalizeTrackedEvidence() { return trackedProjection({ ...TRACKED, issueId: 'dude-other' }, [captureValue]); } }, 'conflict', 'ambiguous-state'],
  ];

  for (const [name, dependencies, status, reason] of malformed) {
    const items = collectEvidence(TRACKED, raw, dependencies);
    const lane = items.find((item) => item.source === 'lane-history');
    assert.equal(lane?.status, status, /** @type {string} */ (name));
    const state = emptyState({ recover: true });
    const result = authorizeAttempt(
      state,
      TRACKED,
      raw,
      transitionAssessment('retry-task'),
      'recovery',
      dependencies,
    );
    assert.equal(result.authorized, false, /** @type {string} */ (name));
    assert.equal(result.reason, reason, /** @type {string} */ (name));
    assert.strictEqual(result.state, state, /** @type {string} */ (name));
    assert.equal(result.state.overallUsed, 0, /** @type {string} */ (name));
    assert.deepEqual(result.state.recoveryUsed, [], /** @type {string} */ (name));
  }

  const otherCapture = trackedCapture('dude-other', SECOND_TASK_KEY);
  const captureFailures = [
    ['partial captures', trackedRawInputs([], [captureValue.issue])],
    ['mismapped captures', trackedRawInputs([otherCapture], [captureValue.issue])],
  ];
  for (const [name, captureRaw] of captureFailures) {
    const calls = [];
    const dependencies = {
      normalizeTrackedEvidence(input) {
        calls.push(input);
        throw new Error('incomplete or mismapped capture set');
      },
    };
    const items = collectEvidence(TRACKED, captureRaw, dependencies);
    assert.deepEqual(calls[0], {
      kind: 'tracked',
      listBytes: captureRaw.lane.listBytes,
      issues: captureRaw.lane.issues,
      target: TRACKED,
    }, /** @type {string} */ (name));
    assert.equal(
      items.find((item) => item.source === 'lane-history')?.status,
      'malformed',
      /** @type {string} */ (name),
    );

    const state = emptyState({ recover: true });
    const result = authorizeAttempt(
      state,
      TRACKED,
      captureRaw,
      transitionAssessment('retry-task'),
      'recovery',
      dependencies,
    );
    assert.equal(result.reason, 'evidence-incomplete', /** @type {string} */ (name));
    assert.strictEqual(result.state, state, /** @type {string} */ (name));
    assert.equal(result.state.overallUsed, 0, /** @type {string} */ (name));
    assert.deepEqual(result.state.recoveryUsed, [], /** @type {string} */ (name));
  }
});

for (const fixture of [
  {
    name: 'missing tracked normalizer',
    dependencies: undefined,
  },
  {
    name: 'malformed tracked capture',
    dependencies: {
      normalizeTrackedEvidence() {
        throw new Error('malformed tracked capture');
      },
    },
  },
]) {
  test(`E: tracked definition recovery reports ${fixture.name} before unsupported`, () => {
    const captureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
    const state = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
    const result = authorizeAttempt(
      state,
      TRACKED,
      trackedRawInputs([captureValue]),
      transitionAssessment('reconcile-derived-definition', {
        targets: definitionTargets(),
        checks: ['lint', 'review', 'verification'],
      }),
      'recovery',
      fixture.dependencies,
    );
    assert.equal(result.authorized, false);
    assert.equal(result.reason, 'evidence-incomplete');
    assert.equal(result.blocker.code, 'evidence-incomplete');
    assert.equal(result.blocker.subject, 'lane-history');
    assert.strictEqual(result.state, state);
    assert.equal(state.overallUsed, 0);
    assert.deepEqual(state.recoveryUsed, []);
    assert.deepEqual(state.pending, []);
  });
}

test('E: valid tracked definition evidence returns unsupported bound to the real inspection hash', () => {
  const captureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const raw = trackedRawInputs([captureValue]);
  const dependencies = {
    normalizeTrackedEvidence() {
      return trackedProjection(TRACKED, [captureValue]);
    },
  };
  const inspection = buildInspection(TRACKED, collectEvidence(TRACKED, raw, dependencies));
  assert.equal(inspection.blockers.length, 0);
  const state = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
  const result = authorizeAttempt(
    state,
    TRACKED,
    raw,
    transitionAssessment('reconcile-derived-definition', {
      targets: definitionTargets(),
      checks: ['lint', 'review', 'verification'],
    }),
    'recovery',
    dependencies,
  );
  assert.equal(result.authorized, false);
  assert.equal(result.reason, 'tracked-definition-recovery-unsupported');
  assert.deepEqual(result.blocker, {
    code: 'tracked-definition-recovery-unsupported',
    subject: targetKey(TRACKED),
    evidenceHash: inspection.evidenceHash,
  });
  assert.strictEqual(result.state, state);
  assert.equal(state.overallUsed, 0);
  assert.deepEqual(state.recoveryUsed, []);
  assert.deepEqual(state.pending, []);

  const stale = authorizeRuntimeAttempt(
    state,
    TRACKED,
    raw,
    transitionAssessment('reconcile-derived-definition', {
      evidenceHash: 'f'.repeat(64),
      targets: definitionTargets(),
      checks: ['lint', 'review', 'verification'],
    }),
    'recovery',
    dependencies,
  );
  assert.deepEqual(stale, { authorized: false, reason: 'evidence-drift', state });
  assert.strictEqual(stale.state, state);
});

test('tracked raw lane and capability dependencies are closed data-only objects', () => {
  const captureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const raw = trackedRawInputs([captureValue]);
  const normalizeTrackedEvidence = () => trackedProjection(TRACKED, [captureValue]);
  for (const field of [
    'normalized',
    'normalizeTrackedEvidence',
    'authority',
    'required',
    'status',
    'blocker',
    'blockers',
  ]) {
    assert.throws(
      () => collectEvidence(TRACKED, {
        ...raw,
        lane: {
          kind: 'tracked',
          [field]: true,
          listBytes: raw.lane.listBytes,
          issues: raw.lane.issues,
        },
      }, { normalizeTrackedEvidence }),
      new RegExp(`rawInputs\\.lane contains unknown field '${field}'`),
      field,
    );
  }

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'normalizeTrackedEvidence', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return normalizeTrackedEvidence;
    },
  });
  const extraAccessor = { normalizeTrackedEvidence };
  Object.defineProperty(extraAccessor, 'extra', {
    enumerable: false,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  const withSymbol = { normalizeTrackedEvidence };
  Object.defineProperty(withSymbol, Symbol('extra'), { value: true, enumerable: true });
  for (const dependencies of [
    { normalizeTrackedEvidence, extra: true },
    accessor,
    extraAccessor,
    withSymbol,
  ]) {
    assert.throws(
      () => collectEvidence(TARGET, rawInputs(), dependencies),
      /dependencies|normalizeTrackedEvidence/,
    );
  }
  assert.equal(getterCalls, 0);

  let normalizeCalls = 0;
  assert.doesNotThrow(() => collectEvidence(TARGET, rawInputs(), {
    normalizeTrackedEvidence() {
      normalizeCalls += 1;
      return trackedProjection(TRACKED, [captureValue]);
    },
  }));
  assert.equal(normalizeCalls, 0);
});

test('feature-only tracked acquisition covers every exact-feature non-epic issue and stays read-only', () => {
  const featureTarget = { specPath: SPEC_PATH, lane: 'tracked' };
  const first = trackedCapture('dude-a');
  const second = trackedCapture('dude-b', SECOND_TASK_KEY);
  const epic = trackedCapture('dude-epic', null, { issue_type: 'epic', status: 'deferred' });
  const unrelated = trackedCapture('dude-other', null, {
    description: `spec: ${OTHER_SPEC_PATH}\nDiscovered work`,
  });
  const raw = trackedRawInputs(
    [second, first],
    [unrelated.issue, epic.issue, second.issue, first.issue],
  );
  const calls = [];
  const dependencies = {
    normalizeTrackedEvidence(input) {
      calls.push(input);
      return trackedProjection(featureTarget, [first, second]);
    },
  };
  const items = collectEvidence(featureTarget, raw, dependencies);
  assert.deepEqual(calls[0], {
    kind: 'tracked',
    listBytes: raw.lane.listBytes,
    issues: raw.lane.issues,
    target: featureTarget,
  });
  const lane = items.find((item) => item.source === 'lane-history');
  assert.equal(lane?.status, 'present');
  assert.deepEqual(
    JSON.parse(lane?.text || '{}').records.map((record) => record.issueId),
    ['dude-a', 'dude-b'],
  );

  const state = emptyState({ recover: true });
  const result = authorizeAttempt(
    state,
    featureTarget,
    raw,
    transitionAssessment('retry-task'),
    'recovery',
    dependencies,
  );
  assert.deepEqual(result, { authorized: false, reason: 'feature-only', state });
  assert.strictEqual(result.state, state);
  assert.equal(result.state.overallUsed, 0);
  assert.deepEqual(result.state.recoveryUsed, []);
});

test('acquisition rejects submitted authority fields and recomputes them from concrete source rules', () => {
  for (const field of ['source', 'required', 'status', 'blockers']) {
    assert.throws(
      () => collectEvidence(TARGET, { ...rawInputs(), [field]: 'submitted' }),
      /unknown field/,
      `rawInputs.${field}`,
    );
    assert.throws(
      () => collectEvidence(TARGET, rawInputs({
        currentRun: [{ ...capture(TARGET, 'failed'), [field]: 'submitted' }],
      })),
      /unknown field/,
      `currentRun.${field}`,
    );
  }

  const injectedRecords = [{
    source: 'session',
    required: false,
    status: 'missing',
    blockers: ['invented'],
  }];
  const items = collectEvidence(TARGET, rawInputs({
    currentRun: [capture(TARGET, 'failed', injectedRecords)],
  }));
  const run = items.find((item) => item.source === 'current-run');
  assert.equal(run?.source, 'current-run');
  assert.equal(run?.required, true);
  assert.equal(run?.status, 'present');
  assert.equal(Object.hasOwn(run || {}, 'blockers'), false);
  const inspection = buildInspection(TARGET, items);
  assert.equal(inspection.blockers.length, 0);
});

test('authorizeAttempt applies ordinary, recovery, feature-only, mode, and action rules without mutation', () => {
  const ordinaryState = emptyState();
  const ordinaryRaw = transitionRaw(TARGET);
  const ordinaryAssessment = transitionAssessment('execute-task');
  const before = JSON.stringify({ ordinaryState, ordinaryRaw, ordinaryAssessment, target: TARGET });
  const ordinary = authorizeAttempt(
    ordinaryState,
    TARGET,
    ordinaryRaw,
    ordinaryAssessment,
    'ordinary',
  );
  assert.equal(ordinary.authorized, true);
  assert.equal(ordinary.reason, 'authorized');
  assert.equal(ordinary.state.overallUsed, 1);
  assert.deepEqual(ordinary.state.recoveryUsed, []);
  assert.deepEqual(ordinary.state.completed, []);
  assert.deepEqual(ordinary.state.pending[0], {
    target: TARGET,
    evidenceHash: buildInspection(TARGET, collectEvidence(TARGET, ordinaryRaw)).evidenceHash,
    approachHash: assessmentApproach(ordinaryAssessment),
    action: 'execute-task',
    materialInputs: ordinaryAssessment.materialInputs,
    mode: 'ordinary',
  });
  assert.equal(JSON.stringify({ ordinaryState, ordinaryRaw, ordinaryAssessment, target: TARGET }), before);

  const recoveryState = emptyState({ recover: true });
  const recovery = authorizeAttempt(
    recoveryState,
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(recovery.authorized, true);
  assert.equal(recovery.state.overallUsed, 1);
  assert.deepEqual(recovery.state.recoveryUsed, [{
    targetKey: targetKey(TARGET),
    targetHash: targetHash(TARGET),
    count: 1,
  }]);

  const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };
  const featureState = emptyState({ recover: true });
  const feature = authorizeAttempt(
    featureState,
    featureTarget,
    transitionRaw(featureTarget),
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.deepEqual(feature, { authorized: false, reason: 'feature-only', state: featureState });
  assert.strictEqual(feature.state, featureState);

  const invalidCases = [
    ['invalid mode', emptyState(), 'execute-task', 'other', 'invalid-mode'],
    ['ordinary repair', emptyState(), 'retry-task', 'ordinary', 'invalid-action'],
    ['recovery execution', emptyState({ recover: true }), 'execute-task', 'recovery', 'invalid-action'],
    ['disabled recovery', emptyState(), 'retry-task', 'recovery', 'recovery-disabled'],
    ['no action', emptyState(), 'none', 'ordinary', 'no-action'],
  ];
  for (const [name, state, action, mode, reason] of invalidCases) {
    const candidate = authorizeAttempt(
      state,
      TARGET,
      transitionRaw(TARGET),
      transitionAssessment(/** @type {string} */ (action), { targets: action === 'none' ? [] : undefined }),
      mode,
    );
    assert.equal(candidate.authorized, false, /** @type {string} */ (name));
    assert.equal(candidate.reason, reason, /** @type {string} */ (name));
    assert.strictEqual(candidate.state, state, /** @type {string} */ (name));
  }
});

test('ordinary attempts complete or stop on block, and only explicit recovery authorizes a retry', () => {
  const policy = { overall: 'unlimited', recovery: 'unlimited', recover: true };
  const ordinary = authorizeAttempt(
    emptyState(policy),
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('execute-task', { targets: ['src/ordinary.mjs'] }),
    'ordinary',
  );
  const success = completeAttempt(ordinary.state, completionInput(ordinary.state.pending[0]));
  assert.equal(success.completed, true);
  assert.equal(success.reason, 'completed');
  assert.equal(success.result.outcome, 'succeeded');
  assert.equal(success.state.overallUsed, 1);
  assert.deepEqual(success.state.recoveryUsed, []);

  const blockedAuthorization = authorizeAttempt(
    emptyState(policy),
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('execute-task', { targets: ['src/ordinary.mjs'] }),
    'ordinary',
  );
  const blocked = completeAttempt(
    blockedAuthorization.state,
    completionInput(blockedAuthorization.state.pending[0], {
      outcome: 'blocked',
      checks: { verification: 'none', lint: 'none', review: 'none' },
    }),
  );
  assert.equal(blocked.completed, false);
  assert.equal(blocked.reason, 'blocked');
  assert.equal(blocked.result.outcome, 'blocked');
  assert.equal(blocked.state.pending.length, 0);
  assert.equal(blocked.state.completed.length, 1);

  const postBlockRaw = transitionRaw(TARGET, {
    currentRun: [capture(TARGET, 'blocked', [blocked.result])],
  });
  const ordinaryRetry = authorizeAttempt(
    blocked.state,
    TARGET,
    postBlockRaw,
    transitionAssessment('retry-task', { targets: ['src/ordinary.mjs'] }),
    'ordinary',
  );
  assert.equal(ordinaryRetry.reason, 'invalid-action');
  assert.strictEqual(ordinaryRetry.state, blocked.state);
  const recovery = authorizeAttempt(
    blocked.state,
    TARGET,
    postBlockRaw,
    transitionAssessment('retry-task', { targets: ['src/ordinary.mjs'] }),
    'recovery',
  );
  assert.equal(recovery.authorized, true);
  assert.equal(recovery.state.overallUsed, 2);
  assert.equal(recovery.state.recoveryUsed[0].count, 1);
});

test('authorizeAttempt reports concrete blockers before budgets and permits matching historical repairs', () => {
  const unlimited = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
  const blockedRaw = transitionRaw(TARGET, {
    currentRun: [capture(TARGET, 'approval-required', [{ reason: 'human approval' }])],
  });
  const blocked = authorizeAttempt(
    unlimited,
    TARGET,
    blockedRaw,
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(blocked.authorized, false);
  assert.equal(blocked.reason, 'approval-required');
  assert.deepEqual(blocked.blocker, {
    code: 'approval-required',
    subject: 'current-run:approval-required',
    evidenceHash: buildInspection(TARGET, collectEvidence(TARGET, blockedRaw)).evidenceHash,
  });
  assert.strictEqual(blocked.state, unlimited);

  const changedIntent = authorizeAttempt(
    unlimited,
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retry-task', { intent: 'ambiguous' }),
    'recovery',
  );
  assert.equal(changedIntent.reason, 'clarification-required');
  assert.equal(changedIntent.blocker.code, 'clarification-required');

  const exhausted = {
    ...emptyState({ overall: 1, recovery: 1, recover: true }),
    overallUsed: 1,
    recoveryUsed: [{ targetKey: targetKey(TARGET), targetHash: targetHash(TARGET), count: 1 }],
    completed: [{
      evidenceHash: '1'.repeat(64), approachHash: '2'.repeat(64), resultHash: '3'.repeat(64),
    }],
  };
  const blockerBeforeBudgets = authorizeAttempt(
    exhausted,
    TARGET,
    blockedRaw,
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(blockerBeforeBudgets.reason, 'approval-required');

  const repairCases = [
    ['address-test', 'verification', 'failed', ['lint', 'verification']],
    ['address-test', 'lint', 'failed', ['lint', 'verification']],
    ['address-review', 'review', 'rejected', ['review', 'verification']],
  ];
  for (const [action, field, state, checks] of repairCases) {
    const raw = transitionRaw(TARGET, {
      [field]: [capture(TARGET, /** @type {string} */ (state), [{ historical: field }])],
    });
    const result = authorizeAttempt(
      unlimited,
      TARGET,
      raw,
      transitionAssessment(/** @type {string} */ (action), { checks: /** @type {string[]} */ (checks) }),
      'recovery',
    );
    assert.equal(result.authorized, true, `${action}:${field}`);
  }

  const trackedCaptureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const trackedDefinition = authorizeAttempt(
    unlimited,
    TRACKED,
    trackedRawInputs([trackedCaptureValue]),
    transitionAssessment('reconcile-derived-definition', {
      targets: definitionTargets(),
      checks: ['lint', 'review', 'verification'],
    }),
    'recovery',
    {
      normalizeTrackedEvidence() {
        return trackedProjection(TRACKED, [trackedCaptureValue]);
      },
    },
  );
  assert.equal(trackedDefinition.reason, 'tracked-definition-recovery-unsupported');
  assert.equal(trackedDefinition.blocker.code, 'tracked-definition-recovery-unsupported');
  assert.strictEqual(trackedDefinition.state, unlimited);
});

test('every hard authorization blocker wins with both numeric budgets unlimited', () => {
  const unlimited = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
  const currentRunBlockers = [
    'clarification-required',
    'approval-required',
    'external-dependency',
    'safety-or-authority',
  ];
  for (const blockerCode of currentRunBlockers) {
    const raw = transitionRaw(TARGET, {
      currentRun: [capture(TARGET, blockerCode, [{ blockerCode }])],
    });
    const blocked = authorizeAttempt(
      unlimited,
      TARGET,
      raw,
      transitionAssessment('retry-task'),
      'recovery',
    );
    assert.equal(blocked.authorized, false, blockerCode);
    assert.equal(blocked.reason, blockerCode, blockerCode);
    assert.equal(blocked.blocker.code, blockerCode, blockerCode);
    assert.strictEqual(blocked.state, unlimited, blockerCode);
  }

  const incompleteRaw = transitionRaw(TARGET);
  delete incompleteRaw.verification;
  const incomplete = authorizeAttempt(
    unlimited,
    TARGET,
    incompleteRaw,
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(incomplete.reason, 'evidence-incomplete');
  assert.equal(incomplete.blocker.subject, 'verification');

  const ambiguousRaw = transitionRaw(TARGET, {
    directIdeas: [
      { path: '.dude/ideas/owner-a.md', bytes: ideaBytes() },
      { path: '.dude/ideas/owner-b.md', bytes: ideaBytes() },
    ],
  });
  const ambiguous = authorizeAttempt(
    unlimited,
    TARGET,
    ambiguousRaw,
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(ambiguous.reason, 'ambiguous-state');
  assert.equal(ambiguous.blocker.subject, 'owner-log');

  const trackedCaptureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  const tracked = authorizeAttempt(
    unlimited,
    TRACKED,
    trackedRawInputs([trackedCaptureValue]),
    transitionAssessment('reconcile-derived-definition', {
      targets: definitionTargets(),
      checks: ['lint', 'review', 'verification'],
    }),
    'recovery',
    {
      normalizeTrackedEvidence() {
        return trackedProjection(TRACKED, [trackedCaptureValue]);
      },
    },
  );
  assert.equal(tracked.reason, 'tracked-definition-recovery-unsupported');
  assert.equal(tracked.blocker.code, 'tracked-definition-recovery-unsupported');
});

test('authorization budgets are independent, finite or unlimited, and never double-count', () => {
  const finiteOverall = { ...emptyState({ overall: 1 }), overallUsed: 1 };
  finiteOverall.completed = [{
    evidenceHash: '1'.repeat(64), approachHash: '2'.repeat(64), resultHash: '3'.repeat(64),
  }];
  const overallStop = authorizeAttempt(
    finiteOverall,
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('execute-task'),
    'ordinary',
  );
  assert.equal(overallStop.reason, 'overall-exhausted');
  assert.strictEqual(overallStop.state, finiteOverall);

  const finiteRecovery = {
    ...emptyState({ overall: 'unlimited', recovery: 1, recover: true }),
    overallUsed: 1,
    recoveryUsed: [{ targetKey: targetKey(TARGET), targetHash: targetHash(TARGET), count: 1 }],
    completed: [{
      evidenceHash: '1'.repeat(64), approachHash: '2'.repeat(64), resultHash: '3'.repeat(64),
    }],
  };
  const recoveryStop = authorizeAttempt(
    finiteRecovery,
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(recoveryStop.reason, 'recovery-exhausted');
  assert.strictEqual(recoveryStop.state, finiteRecovery);

  const simultaneous = {
    ...emptyState({ overall: 1, recovery: 1, recover: true }),
    overallUsed: 1,
    recoveryUsed: [{ targetKey: targetKey(TARGET), targetHash: targetHash(TARGET), count: 1 }],
    completed: [{
      evidenceHash: '1'.repeat(64), approachHash: '2'.repeat(64), resultHash: '3'.repeat(64),
    }],
  };
  assert.equal(authorizeAttempt(
    simultaneous,
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retry-task'),
    'recovery',
  ).reason, 'overall-exhausted');

  let unlimited = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
  for (const event of ['first', 'second']) {
    const raw = transitionRaw(TARGET, {
      currentRun: [capture(TARGET, 'failed', [{ event }])],
    });
    const authorized = authorizeAttempt(
      unlimited,
      TARGET,
      raw,
      transitionAssessment('retry-task'),
      'recovery',
    );
    assert.equal(authorized.authorized, true, event);
    const pending = authorized.state.pending[0];
    const completed = completeAttempt(authorized.state, completionInput(pending));
    assert.equal(completed.completed, true, event);
    unlimited = completed.state;
  }
  assert.equal(unlimited.overallUsed, 2);
  assert.equal(unlimited.recoveryUsed[0].count, 2);
  assert.equal(unlimited.completed.length, 2);
});

test('recovery counters use full canonical target identity across features and tracked mappings', () => {
  const otherTarget = { specPath: OTHER_SPEC_PATH, lane: 'lightweight', taskKey: TASK_KEY };
  let state = emptyState({ overall: 'unlimited', recovery: 1, recover: true });
  const first = authorizeAttempt(
    state,
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retry-task'),
    'recovery',
  );
  state = completeAttempt(first.state, completionInput(first.state.pending[0])).state;
  const other = authorizeAttempt(
    state,
    otherTarget,
    transitionRaw(otherTarget),
    transitionAssessment('retry-task'),
    'recovery',
  );
  assert.equal(other.authorized, true);
  assert.equal(other.state.overallUsed, 2);
  assert.deepEqual(other.state.recoveryUsed.map((row) => [row.targetKey, row.count]), [
    [targetKey(TARGET), 1],
    [targetKey(otherTarget), 1],
  ].sort((left, right) => Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0]))));

  const mapped = { ...TRACKED, taskKey: TASK_KEY };
  assert.equal(targetKey(mapped), targetKey(TRACKED));
  assert.equal(targetHash(mapped), targetHash(TRACKED));
  const trackedCounterState = {
    ...emptyState({ recover: true }),
    overallUsed: 1,
    recoveryUsed: [{ targetKey: targetKey(mapped), targetHash: targetHash(mapped), count: 1 }],
    completed: [{
      evidenceHash: '1'.repeat(64), approachHash: '2'.repeat(64), resultHash: '3'.repeat(64),
    }],
  };
  assert.doesNotThrow(() => validateRunState(trackedCounterState));
  assert.equal(trackedCounterState.recoveryUsed[0].targetKey, targetKey(TRACKED));
  assert.throws(() => validateRunState({
    ...trackedCounterState,
    recoveryUsed: [
      ...trackedCounterState.recoveryUsed,
      { targetKey: targetKey(TRACKED), targetHash: targetHash(TRACKED), count: 1 },
    ],
  }), /target-unique/);
});

test('B: a second pending authorization is never dispatchable without authoritative task write sets', () => {
  const secondTarget = { ...TARGET, taskKey: SECOND_TASK_KEY };
  const baseTasks = transitionTasksBytes([
    { id: TASK_KEY, glyph: '~' },
    { id: SECOND_TASK_KEY },
  ]);
  const baseRaw = transitionRaw(TARGET, {
    tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes: baseTasks },
  });
  const secondRaw = transitionRaw(secondTarget, {
    tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes: baseTasks },
  });
  const first = authorizeAttempt(
    emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
    TARGET,
    baseRaw,
    transitionAssessment('retry-task', { targets: ['src/first.mjs'] }),
    'recovery',
  );
  assert.equal(first.authorized, true);

  const duplicate = authorizeAttempt(
    first.state,
    TARGET,
    baseRaw,
    transitionAssessment('retry-task', { targets: ['src/other.mjs'] }),
    'recovery',
  );
  assert.equal(duplicate.reason, 'not-dispatchable');
  assert.strictEqual(duplicate.state, first.state);

  const capacityFirst = authorizeAttempt(
    emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true, parallel: 1 }),
    TARGET,
    baseRaw,
    transitionAssessment('retry-task', { targets: ['src/first.mjs'] }),
    'recovery',
  );
  const capacity = authorizeAttempt(
    capacityFirst.state,
    secondTarget,
    secondRaw,
    transitionAssessment('retry-task', { targets: ['src/second.mjs'] }),
    'recovery',
  );
  assert.equal(capacity.reason, 'not-dispatchable');
  assert.strictEqual(capacity.state, capacityFirst.state);

  const relationCases = [
    ['dependency', [
      { id: TASK_KEY, glyph: '~' },
      { id: SECOND_TASK_KEY, deps: [TASK_KEY] },
    ]],
    ['reverse dependency', [
      { id: TASK_KEY, glyph: '~', deps: [SECOND_TASK_KEY] },
      { id: SECOND_TASK_KEY },
    ]],
    ['transitive dependency', [
      { id: TASK_KEY, glyph: '~' },
      { id: SECOND_TASK_KEY, deps: [THIRD_TASK_KEY] },
      { id: THIRD_TASK_KEY, glyph: 'x', deps: [TASK_KEY] },
    ]],
    ['blocked-by', [
      { id: TASK_KEY, glyph: '~' },
      { id: SECOND_TASK_KEY, blockedBy: 'external-dependency: waiting' },
    ]],
    ['blocked state', [
      { id: TASK_KEY, glyph: '~' },
      { id: SECOND_TASK_KEY, glyph: '!' },
    ]],
    ['not parallel', [
      { id: TASK_KEY, glyph: '~' },
      { id: SECOND_TASK_KEY, parallel: false },
    ]],
  ];
  for (const [name, tasks] of relationCases) {
    const bytes = transitionTasksBytes(/** @type {Parameters<typeof transitionTasksBytes>[0]} */ (tasks));
    const relationFirst = authorizeAttempt(
      emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
      TARGET,
      transitionRaw(TARGET, {
        tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
      }),
      transitionAssessment('retry-task', { targets: ['src/first.mjs'] }),
      'recovery',
    );
    assert.equal(relationFirst.authorized, true, /** @type {string} */ (name));
    const refused = authorizeAttempt(
      relationFirst.state,
      secondTarget,
      transitionRaw(secondTarget, {
        tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
      }),
      transitionAssessment('retry-task', { targets: ['src/second.mjs'] }),
      'recovery',
    );
    assert.equal(refused.reason, 'not-dispatchable', /** @type {string} */ (name));
    assert.strictEqual(refused.state, relationFirst.state, /** @type {string} */ (name));
  }

  const overlap = authorizeAttempt(
    first.state,
    secondTarget,
    secondRaw,
    transitionAssessment('retry-task', { targets: ['src/first.mjs'] }),
    'recovery',
  );
  assert.equal(overlap.reason, 'not-dispatchable');
  const ancestorOverlap = authorizeAttempt(
    first.state,
    secondTarget,
    secondRaw,
    transitionAssessment('retry-task', { targets: ['src'] }),
    'recovery',
  );
  assert.equal(ancestorOverlap.reason, 'not-dispatchable');
  const unknown = authorizeAttempt(
    first.state,
    secondTarget,
    secondRaw,
    transitionAssessment('retry-task', { targets: [] }),
    'recovery',
  );
  assert.equal(unknown.reason, 'not-dispatchable');

  const unknownFirst = authorizeAttempt(
    emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
    TARGET,
    baseRaw,
    transitionAssessment('retry-task', { targets: [] }),
    'recovery',
  );
  assert.equal(unknownFirst.authorized, true);
  const unknownPending = authorizeAttempt(
    unknownFirst.state,
    secondTarget,
    secondRaw,
    transitionAssessment('retry-task', { targets: ['src/second.mjs'] }),
    'recovery',
  );
  assert.equal(unknownPending.reason, 'not-dispatchable');
  assert.strictEqual(unknownPending.state, unknownFirst.state);

  const capped = authorizeAttempt(
    { ...first.state, policy: { ...first.state.policy, overall: 1 } },
    secondTarget,
    secondRaw,
    transitionAssessment('retry-task', { targets: ['src/second.mjs'] }),
    'recovery',
  );
  assert.equal(capped.reason, 'not-dispatchable');
});

test('B: sequential state and model-declared disjoint targets do not grant dispatch authority', () => {
  const secondTarget = { ...TARGET, taskKey: SECOND_TASK_KEY };
  const bytes = transitionTasksBytes([
    { id: TASK_KEY, glyph: '~' },
    { id: SECOND_TASK_KEY, glyph: '~' },
  ]);
  const state = emptyState({ overall: 2, recovery: 'unlimited', recover: true });
  const first = authorizeAttempt(
    state,
    TARGET,
    transitionRaw(TARGET, {
      tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
    }),
    transitionAssessment('retry-task', { targets: ['src/first.mjs'] }),
    'recovery',
  );
  const second = authorizeAttempt(
    first.state,
    secondTarget,
    transitionRaw(secondTarget, {
      tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
    }),
    transitionAssessment('retry-task', { targets: ['src/second.mjs'] }),
    'recovery',
  );
  assert.equal(second.authorized, false);
  assert.equal(second.reason, 'not-dispatchable');
  assert.strictEqual(second.state, first.state);
  assert.equal(second.state.pending.length, 1);
  assert.equal(second.state.overallUsed, 1);

  const completedFirst = completeAttempt(first.state, completionInput(first.state.pending[0]));
  const sequentialSecond = authorizeAttempt(
    completedFirst.state,
    secondTarget,
    transitionRaw(secondTarget, {
      tasks: { path: `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`, bytes },
    }),
    transitionAssessment('retry-task', { targets: ['src/second.mjs'] }),
    'recovery',
  );
  assert.equal(sequentialSecond.authorized, true);
  assert.equal(sequentialSecond.state.pending.length, 1);
  assert.equal(sequentialSecond.state.overallUsed, 2);
});

test('completeAttempt binds exact pending action, route, operations, targets, and checks', () => {
  const authorized = authorizeAttempt(
    emptyState({ recover: true }),
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retry-task', { targets: ['src/target.mjs'] }),
    'recovery',
  );
  const pending = authorized.state.pending[0];
  const before = JSON.stringify(authorized.state);
  const mismatches = [
    ['route', { route: 'test-repair' }],
    ['operation', { operations: ['address-test'] }],
    ['target', { changedTargets: ['src/other.mjs'] }],
    ['check', { checks: { verification: 'passed', lint: 'passed', review: 'none' } }],
  ];
  for (const [name, overrides] of mismatches) {
    const result = completeAttempt(authorized.state, completionInput(
      pending,
      /** @type {Record<string, unknown>} */ (overrides),
    ));
    assert.equal(result.completed, false, /** @type {string} */ (name));
    assert.equal(result.reason, 'action-mismatch', /** @type {string} */ (name));
    assert.strictEqual(result.state, authorized.state, /** @type {string} */ (name));
    assert.equal(JSON.stringify(authorized.state), before, /** @type {string} */ (name));
  }

  const wrongPending = completeAttempt(authorized.state, {
    ...completionInput(pending),
    approachHash: '0'.repeat(64),
  });
  assert.equal(wrongPending.reason, 'pending-not-found');
  assert.strictEqual(wrongPending.state, authorized.state);

  assert.throws(() => completeAttempt(authorized.state, {
    ...completionInput(pending),
    action: 'retry-task',
  }), /unknown field 'action'/);
  assert.throws(() => completeAttempt(authorized.state, {
    ...completionInput(pending),
    result: { ...completionResult(pending), blockers: [] },
  }), /unknown field 'blockers'/);
  assert.equal(JSON.stringify(authorized.state), before);
});

test('stored actions select their hardcoded completion route and material contract', () => {
  const cases = [
    ['execute-task', 'ordinary', [TASK_KEY], ['verification'], 'lightweight-task'],
    ['retry-task', 'recovery', [TASK_KEY], ['verification'], 'lightweight-task'],
    ['address-test', 'recovery', ['src/test.mjs'], ['lint', 'verification'], 'test-repair'],
    ['address-review', 'recovery', ['src/review.mjs'], ['review', 'verification'], 'review-remediation'],
    [
      'reconcile-derived-definition',
      'recovery',
      definitionTargets(),
      ['lint', 'review', 'verification'],
      'definition-reconciliation',
    ],
    ['retain-learning', 'recovery', [], ['lint'], 'retention'],
  ];
  for (const [action, mode, targets, checks, route] of cases) {
    const state = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
    const authorized = authorizeAttempt(
      state,
      TARGET,
      transitionRaw(TARGET),
      transitionAssessment(/** @type {string} */ (action), {
        targets: /** @type {string[]} */ (targets),
        checks: /** @type {string[]} */ (checks),
      }),
      mode,
    );
    assert.equal(authorized.authorized, true, /** @type {string} */ (action));
    const pending = authorized.state.pending[0];
    assert.equal(completionRoute(pending), route, /** @type {string} */ (action));
    const completed = completeAttempt(authorized.state, completionInput(pending));
    assert.equal(completed.completed, true, /** @type {string} */ (action));
    assert.equal(completed.reason, 'completed', /** @type {string} */ (action));
    assert.equal(completed.state.pending.length, 0, /** @type {string} */ (action));
    assert.equal(completed.state.completed.length, 1, /** @type {string} */ (action));
  }
});

test('T008: tracked pending identity completes and interrupts through issue-only targetKey selection', () => {
  const tracked = trackedCapture(TRACKED.issueId, TASK_KEY);
  const dependencies = {
    normalizeTrackedEvidence(input) {
      return trackedProjection(/** @type {Record<string, unknown>} */ (input.target), [tracked]);
    },
  };
  const authorizeTracked = (target) => authorizeAttempt(
    emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
    target,
    trackedRawInputs([tracked]),
    transitionAssessment('retry-task', { targets: ['tracked-target'] }),
    'recovery',
    dependencies,
  );
  const issueOnlyInput = (pending, overrides = {}) => {
    const input = completionInput(pending, overrides);
    input.target = { ...TRACKED };
    input.result.target = { ...TRACKED };
    return input;
  };

  const cases = [
    ['mapped pending completion', { ...TRACKED, taskKey: TASK_KEY }, {}],
    ['mapped pending interruption', { ...TRACKED, taskKey: TASK_KEY }, { outcome: 'interrupted' }],
    ['issue-only pending completion', TRACKED, {}],
  ];
  const failures = [];
  for (const [name, authorizationTarget, overrides] of cases) {
    try {
      const authorized = authorizeTracked(authorizationTarget);
      assert.equal(authorized.authorized, true, /** @type {string} */ (name));
      const beforeCounters = {
        overallUsed: authorized.state.overallUsed,
        recoveryUsed: clone(authorized.state.recoveryUsed),
      };
      const completion = completeAttempt(
        authorized.state,
        issueOnlyInput(authorized.state.pending[0], overrides),
      );
      const rowFailures = [];
      const check = (label, assertion) => {
        try {
          assertion();
        } catch (error) {
          rowFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      check('reason', () => assert.equal(
        completion.reason,
        overrides.outcome === 'interrupted' ? 'interrupted' : 'completed',
      ));
      check('completion flag', () => assert.equal(completion.completed, overrides.outcome !== 'interrupted'));
      check('pending cleared', () => assert.equal(completion.state.pending.length, 0));
      check('one tuple appended', () => assert.equal(completion.state.completed.length, 1));
      check('tuple shape', () => assert.deepEqual(
        Object.keys(completion.state.completed[0] || {}),
        ['evidenceHash', 'approachHash', 'resultHash'],
      ));
      check('charged counters retained', () => assert.deepEqual({
        overallUsed: completion.state.overallUsed,
        recoveryUsed: completion.state.recoveryUsed,
      }, beforeCounters));
      if (rowFailures.length > 0) failures.push(`${name}: ${rowFailures.join('; ')}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('T008: every tracked completion taskKey is forbidden before selection, normalization, or mapping calls', () => {
  const runCommand = runtimeFunction('runCommand');
  const tracked = trackedCapture(TRACKED.issueId, TASK_KEY);
  const dependencies = {
    normalizeTrackedEvidence(input) {
      return trackedProjection(/** @type {Record<string, unknown>} */ (input.target), [tracked]);
    },
  };
  const failures = [];
  for (const pendingTarget of [{ ...TRACKED, taskKey: TASK_KEY }, TRACKED]) {
    const authorized = authorizeAttempt(
      emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
      pendingTarget,
      trackedRawInputs([tracked]),
      transitionAssessment('retry-task', { targets: ['tracked-target'] }),
      'recovery',
      dependencies,
    );
    assert.equal(authorized.authorized, true);
    for (const suppliedTaskKey of [TASK_KEY, SECOND_TASK_KEY]) {
      try {
        let resultReads = 0;
        const input = completionInput(authorized.state.pending[0]);
        input.target = { ...TRACKED, taskKey: suppliedTaskKey };
        input.result = new Proxy(input.result, {
          getPrototypeOf() {
            resultReads += 1;
            return Object.prototype;
          },
        });
        const before = canonicalJson(authorized.state);
        let mappingCalls = 0;
        let result;
        let thrown;
        try {
          result = runCommand('complete', { state: authorized.state, input }, {
            normalizeTrackedEvidence() {
              mappingCalls += 1;
              throw new Error('completion must not acquire tracked mapping evidence');
            },
          }).completion;
        } catch (error) {
          thrown = error;
        }
        const message = thrown instanceof Error ? thrown.message : result?.reason || '';
        const rowFailures = [];
        const check = (label, assertion) => {
          try {
            assertion();
          } catch (error) {
            rowFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
        check('pre-normalization refusal', () => assert.equal(resultReads, 0));
        check('conditional taskKey refusal', () => assert.match(
          message,
          /taskKey|task key|forbidden|completion target/i,
        ));
        check('no mapping call', () => assert.equal(mappingCalls, 0));
        check('input state unchanged', () => assert.equal(canonicalJson(authorized.state), before));
        if (result) check('returned state unchanged', () => assert.strictEqual(result.state, authorized.state));
        if (rowFailures.length > 0) {
          failures.push(`${Object.hasOwn(pendingTarget, 'taskKey') ? 'mapped' : 'issue-only'} pending / ${suppliedTaskKey}: ${rowFailures.join('; ')}`);
        }
      } catch (error) {
        failures.push(`${Object.hasOwn(pendingTarget, 'taskKey') ? 'mapped' : 'issue-only'} pending / ${suppliedTaskKey}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const base = completionInput(authorized.state.pending[0]);
    for (const field of ['mappingWitness', 'dependencies', 'tracker']) {
      assert.throws(
        () => completeAttempt(authorized.state, { ...base, [field]: true }),
        /unknown field/,
        field,
      );
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('T008 regression: nested tracked result taskKey rejects before result normalization with unchanged state', () => {
  const tracked = trackedCapture(TRACKED.issueId, TASK_KEY);
  const dependencies = {
    normalizeTrackedEvidence(input) {
      return trackedProjection(/** @type {Record<string, unknown>} */ (input.target), [tracked]);
    },
  };
  const failures = [];
  for (const pendingTarget of [{ ...TRACKED, taskKey: TASK_KEY }, TRACKED]) {
    try {
      const authorized = authorizeAttempt(
        emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
        pendingTarget,
        trackedRawInputs([tracked]),
        transitionAssessment('retry-task', { targets: ['tracked-target'] }),
        'recovery',
        dependencies,
      );
      assert.equal(authorized.authorized, true);
      const pending = authorized.state.pending[0];
      const input = completionInput(pending);
      input.target = { ...TRACKED };
      const nested = completionResult(pending);
      nested.target = { ...TRACKED, taskKey: TASK_KEY };
      let routeReads = 0;
      input.result = new Proxy(nested, {
        get(target, key, receiver) {
          if (key === 'route') routeReads += 1;
          return Reflect.get(target, key, receiver);
        },
      });
      const before = canonicalJson(authorized.state);
      let result;
      let thrown;
      try {
        result = completeAttempt(authorized.state, input);
      } catch (error) {
        thrown = error;
      }
      const message = thrown instanceof Error ? thrown.message : result?.reason || '';
      const rowFailures = [];
      const check = (label, assertion) => {
        try {
          assertion();
        } catch (error) {
          rowFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      check('conditional taskKey refusal', () => assert.match(
        message,
        /taskKey|task key|forbidden|completion result target/i,
      ));
      check('pre-normalization refusal', () => assert.equal(routeReads, 0));
      check('input state unchanged', () => assert.equal(canonicalJson(authorized.state), before));
      if (result) check('returned state unchanged', () => assert.strictEqual(result.state, authorized.state));
      if (rowFailures.length > 0) {
        failures.push(`${Object.hasOwn(pendingTarget, 'taskKey') ? 'mapped' : 'issue-only'} pending: ${rowFailures.join('; ')}`);
      }
    } catch (error) {
      failures.push(`${Object.hasOwn(pendingTarget, 'taskKey') ? 'mapped' : 'issue-only'} pending: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('T008: exact interruption for every action consumes one tuple without completing or changing counters', () => {
  const cases = [
    ['execute-task', 'ordinary', ['src/task.mjs']],
    ['retry-task', 'recovery', ['src/task.mjs']],
    ['address-test', 'recovery', ['src/test.mjs']],
    ['address-review', 'recovery', ['src/review.mjs']],
    ['reconcile-derived-definition', 'recovery', definitionTargets()],
    ['retain-learning', 'recovery', []],
  ];
  for (const [action, mode, targets] of cases) {
    const authorized = authorizeAttempt(
      emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
      TARGET,
      transitionRaw(TARGET),
      transitionAssessment(/** @type {string} */ (action), { targets: /** @type {string[]} */ (targets) }),
      mode,
    );
    assert.equal(authorized.authorized, true, /** @type {string} */ (action));
    const counters = {
      overallUsed: authorized.state.overallUsed,
      recoveryUsed: clone(authorized.state.recoveryUsed),
    };
    const interrupted = completeAttempt(
      authorized.state,
      completionInput(authorized.state.pending[0], { outcome: 'interrupted' }),
    );
    assert.equal(interrupted.completed, false, /** @type {string} */ (action));
    assert.equal(interrupted.reason, 'interrupted', /** @type {string} */ (action));
    assert.equal(interrupted.result.outcome, 'interrupted', /** @type {string} */ (action));
    assert.deepEqual(interrupted.result.changedTargets, [], /** @type {string} */ (action));
    assert.equal(interrupted.state.pending.length, 0, /** @type {string} */ (action));
    assert.equal(interrupted.state.completed.length, 1, /** @type {string} */ (action));
    assert.deepEqual(Object.keys(interrupted.state.completed[0]), [
      'evidenceHash',
      'approachHash',
      'resultHash',
    ], /** @type {string} */ (action));
    assert.deepEqual({
      overallUsed: interrupted.state.overallUsed,
      recoveryUsed: interrupted.state.recoveryUsed,
    }, counters, /** @type {string} */ (action));
  }
});

test('T008: Lightweight completion still requires its exact taskKey', () => {
  const authorized = authorizeAttempt(
    emptyState(),
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('execute-task'),
    'ordinary',
  );
  assert.equal(authorized.authorized, true);
  const pending = authorized.state.pending[0];
  for (const target of [
    { specPath: SPEC_PATH, lane: 'lightweight' },
    { ...TARGET, taskKey: SECOND_TASK_KEY },
  ]) {
    const input = completionInput(pending);
    input.target = target;
    input.result.target = target;
    const before = canonicalJson(authorized.state);
    const refused = completeAttempt(authorized.state, input);
    assert.equal(refused.completed, false);
    assert.equal(canonicalJson(refused.state), before);
    assert.strictEqual(refused.state, authorized.state);
  }
  assert.equal(completeAttempt(authorized.state, completionInput(pending)).completed, true);
});

for (const fixture of [
  {
    action: 'address-test',
    targets: ['src/test.mjs'],
    requiredChecks: ['lint', 'verification'],
  },
  {
    action: 'address-review',
    targets: ['src/review.mjs'],
    requiredChecks: ['review', 'verification'],
  },
  {
    action: 'reconcile-derived-definition',
    targets: definitionTargets(),
    requiredChecks: ['lint', 'review', 'verification'],
  },
  {
    action: 'retain-learning',
    targets: [],
    requiredChecks: ['lint'],
  },
]) {
  test(`C: ${fixture.action} requires exactly ${fixture.requiredChecks.join('+')}`, () => {
    const state = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
    const full = authorizeAttempt(
      state,
      TARGET,
      transitionRaw(TARGET),
      transitionAssessment(fixture.action, {
        targets: fixture.targets,
        checks: fixture.requiredChecks,
      }),
      'recovery',
    );
    assert.equal(full.authorized, true, 'the exact hardcoded check set authorizes');
    assert.deepEqual(full.state.pending[0].materialInputs.checks, fixture.requiredChecks);
    const completed = completeAttempt(full.state, completionInput(full.state.pending[0]));
    assert.equal(completed.completed, true, 'the exact hardcoded check set completes');

    const invalidCheckSets = [
      ...fixture.requiredChecks.map((omitted) => ({
        name: `missing ${omitted}`,
        checks: fixture.requiredChecks.filter((check) => check !== omitted),
      })),
      {
        name: 'additional caller check',
        checks: [...fixture.requiredChecks, 'extra-check'].sort(),
      },
    ];
    for (const invalid of invalidCheckSets) {
      const refused = authorizeAttempt(
        state,
        TARGET,
        transitionRaw(TARGET),
        transitionAssessment(fixture.action, {
          targets: fixture.targets,
          checks: invalid.checks,
        }),
        'recovery',
      );
      assert.equal(refused.authorized, false, invalid.name);
      assert.equal(refused.reason, 'invalid-action', invalid.name);
      assert.strictEqual(refused.state, state, invalid.name);
    }
  });
}

test('fresh verification, lint, and review failures stop success, record the attempt, and remain later evidence', () => {
  const cases = [
    {
      name: 'verification',
      action: 'address-test',
      expectedChecks: ['lint', 'verification'],
      failedChecks: { verification: 'failed' },
      reason: 'verification-failed',
      outcome: 'failed',
      currentState: 'failed',
    },
    {
      name: 'lint',
      action: 'address-test',
      expectedChecks: ['lint', 'verification'],
      failedChecks: { lint: 'failed' },
      reason: 'verification-failed',
      outcome: 'failed',
      currentState: 'failed',
    },
    {
      name: 'review',
      action: 'address-review',
      expectedChecks: ['review', 'verification'],
      failedChecks: { review: 'rejected' },
      reason: 'review-rejected',
      outcome: 'blocked',
      currentState: 'blocked',
    },
  ];
  for (const fixture of cases) {
    const materialTarget = `src/${fixture.name}.mjs`;
    const historicalState = fixture.name === 'review' ? 'rejected' : 'failed';
    const raw = transitionRaw(TARGET, {
      [fixture.name]: [capture(TARGET, historicalState, [{ historical: true }])],
    });
    const authorized = authorizeAttempt(
      emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
      TARGET,
      raw,
      transitionAssessment(fixture.action, {
        targets: [materialTarget],
        checks: fixture.expectedChecks,
      }),
      'recovery',
    );
    assert.equal(authorized.authorized, true, fixture.name);
    const pending = authorized.state.pending[0];
    const failed = completeAttempt(authorized.state, completionInput(pending, {
      checks: fixture.failedChecks,
    }));
    assert.equal(failed.completed, false, fixture.name);
    assert.equal(failed.reason, fixture.reason, fixture.name);
    assert.equal(failed.result.outcome, fixture.outcome, fixture.name);
    assert.equal(failed.result.checks[fixture.name], Object.values(fixture.failedChecks)[0], fixture.name);
    assert.deepEqual(failed.result.blockers.map((blocker) => blocker.code), [fixture.reason], fixture.name);
    assert.equal(failed.state.pending.length, 0, fixture.name);
    assert.equal(failed.state.completed.length, 1, fixture.name);
    assert.deepEqual(Object.keys(failed.state.completed[0]).sort(), [
      'approachHash', 'evidenceHash', 'resultHash',
    ], fixture.name);
    assert.equal(failed.state.overallUsed, 1, fixture.name);
    assert.equal(failed.state.recoveryUsed[0].count, 1, fixture.name);

    const laterRaw = transitionRaw(TARGET, {
      currentRun: [capture(TARGET, fixture.currentState, [failed.result])],
      [fixture.name]: [capture(TARGET, historicalState, [{ normalized: failed.result }])],
    });
    const later = authorizeAttempt(
      failed.state,
      TARGET,
      laterRaw,
      transitionAssessment(fixture.action, {
        targets: [materialTarget],
        checks: fixture.expectedChecks,
      }),
      'recovery',
    );
    assert.equal(later.authorized, true, fixture.name);
    assert.equal(later.state.overallUsed, 2, fixture.name);
    assert.equal(later.state.recoveryUsed[0].count, 2, fixture.name);
  }
});

test('authorization rejects repeated evidence and approach plus semantic same or equivalent before budgets', () => {
  const raw = transitionRaw(TARGET);
  const firstAssessment = transitionAssessment('retry-task', { targets: ['src/no-progress.mjs'] });
  const first = authorizeAttempt(
    emptyState({ overall: 1, recovery: 'unlimited', recover: true }),
    TARGET,
    raw,
    firstAssessment,
    'recovery',
  );
  const completed = completeAttempt(first.state, completionInput(first.state.pending[0]));
  const proseVariant = transitionAssessment('retry-task', {
    targets: ['src/no-progress.mjs'],
    retention: 'skill',
    summary: 'Different wrapper prose cannot change the material approach.',
  });
  assert.equal(approachHash(firstAssessment), approachHash(proseVariant));
  const repeated = authorizeAttempt(completed.state, TARGET, raw, proseVariant, 'recovery');
  assert.equal(repeated.authorized, false);
  assert.equal(repeated.reason, 'no-progress');
  assert.strictEqual(repeated.state, completed.state);

  for (const equivalence of ['same', 'equivalent']) {
    const semantic = authorizeAttempt(
      completed.state,
      TARGET,
      raw,
      transitionAssessment('retry-task', {
        targets: [`src/${equivalence}.mjs`],
        equivalence,
      }),
      'recovery',
    );
    assert.equal(semantic.reason, 'no-progress', equivalence);
    assert.equal(semantic.state.overallUsed, 1, equivalence);
  }
});

test('repeated evidence and normalized result appends three fields, then blocks later authorization', () => {
  const raw = transitionRaw(TARGET);
  let state = emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true });
  const first = authorizeAttempt(
    state,
    TARGET,
    raw,
    transitionAssessment('retry-task', {
      targets: ['src/result.mjs'],
      checks: ['verification'],
    }),
    'recovery',
  );
  const firstCompletion = completeAttempt(first.state, completionInput(first.state.pending[0]));
  assert.equal(firstCompletion.completed, true);
  state = firstCompletion.state;

  const second = authorizeAttempt(
    state,
    TARGET,
    raw,
    transitionAssessment('retry-task', {
      targets: ['src/result-support.mjs', 'src/result.mjs'],
      checks: ['verification'],
      summary: 'A materially different target set.',
    }),
    'recovery',
  );
  assert.equal(second.authorized, true);
  assert.notEqual(second.state.pending[0].approachHash, state.completed[0].approachHash);
  const secondCompletion = completeAttempt(second.state, completionInput(second.state.pending[0], {
    changedTargets: ['src/result.mjs'],
  }));
  assert.equal(secondCompletion.completed, false);
  assert.equal(secondCompletion.reason, 'no-progress');
  assert.equal(secondCompletion.state.pending.length, 0);
  assert.equal(secondCompletion.state.completed.length, 2);
  assert.equal(
    secondCompletion.state.completed[0].resultHash,
    secondCompletion.state.completed[1].resultHash,
  );
  secondCompletion.state.completed.forEach((entry) => assert.deepEqual(
    Object.keys(entry).sort(),
    ['approachHash', 'evidenceHash', 'resultHash'],
  ));

  const third = authorizeAttempt(
    secondCompletion.state,
    TARGET,
    raw,
    transitionAssessment('retry-task', {
      targets: ['src/later-result.mjs'],
      checks: ['verification'],
    }),
    'recovery',
  );
  assert.equal(third.authorized, false);
  assert.equal(third.reason, 'prior-no-progress');
  assert.strictEqual(third.state, secondCompletion.state);
});

test('G: transient and none retention have no owner or artifact', () => {
  const retentionRoute = runtimeFunction('retentionRoute');
  let ownerCalls = 0;
  const dependencies = {
    analyzeMemory() {
      ownerCalls += 1;
      return { overlaps: [], maxScore: 0 };
    },
    inspectSkill() {
      ownerCalls += 1;
      return { destinationExists: false, overlaps: [] };
    },
  };
  for (const retention of ['transient', 'none']) {
    assert.deepEqual(
      retentionRoute({ retention, finding: 'Current-attempt detail.' }, dependencies),
      { retention, owner: null, artifact: null, refused: false },
      retention,
    );
  }
  assert.equal(ownerCalls, 0);
});

test('G: memory retention routes to the memory owner and real duplicate analysis refuses', () => {
  const retentionRoute = runtimeFunction('retentionRoute');
  const artifact = '.dude/memory/lessons.md';
  const finding = 'Canonical recovery evidence must be inspected before refusal.';
  let ownerContent = '# Lessons\n\n- Keep unrelated context concise.\n';
  let ownerCalls = 0;
  const dependencies = {
    analyzeMemory(proposalContent, proposedFinding) {
      ownerCalls += 1;
      assert.equal(proposalContent, `- ${finding}`);
      assert.equal(proposedFinding, finding);
      return analyzeAppend(ownerContent, proposedFinding);
    },
  };
  const unique = retentionRoute({
    retention: 'memory',
    finding,
    artifact,
    content: `- ${finding}`,
  }, dependencies);
  assert.equal(unique.retention, 'memory');
  assert.equal(unique.owner, 'dude-memory-ledger');
  assert.equal(unique.artifact, artifact);
  assert.equal(unique.refused, false);

  ownerContent = `# Lessons\n\n- ${finding}\n`;
  const duplicate = retentionRoute({
    retention: 'memory',
    finding,
    artifact,
    content: `- ${finding}`,
  }, dependencies);
  assert.equal(duplicate.owner, 'dude-memory-ledger');
  assert.equal(duplicate.artifact, artifact);
  assert.equal(duplicate.refused, true);
  assert.match(duplicate.reason, /duplicate|overlap/i);
  assert.equal(ownerCalls, 2);
});

test('G: skill retention crosses promotion and skill-authoring boundaries and refuses collisions', () => {
  const retentionRoute = runtimeFunction('retentionRoute');
  const base = {
    retention: 'skill',
    finding: 'Reusable recovery boundary.',
    slug: 'recovery-boundary',
  };
  let inspectedCollision = { destinationExists: false, overlaps: [] };
  let ownerCalls = 0;
  const inspectSkill = (proposal) => {
    ownerCalls += 1;
    assert.deepEqual(proposal, { finding: base.finding, slug: base.slug });
    return inspectedCollision;
  };
  const route = retentionRoute(base, { inspectSkill });
  assert.equal(route.owner, 'dude-learning-promotion');
  assert.equal(route.boundary, 'dude-skill-authoring');
  assert.equal(route.artifact, '.github/skills/dude-local-recovery-boundary/SKILL.md');
  assert.equal(route.refused, false);

  const authorized = authorizeAttempt(
    emptyState({ overall: 'unlimited', recovery: 'unlimited', recover: true }),
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('retain-learning', {
      targets: [route.artifact],
      checks: ['lint'],
    }),
    'recovery',
  );
  assert.equal(authorized.authorized, true);
  const completed = completeAttempt(authorized.state, completionInput(authorized.state.pending[0], {
    changedTargets: [route.artifact],
    checks: { verification: 'none', lint: 'passed', review: 'none' },
  }));
  assert.equal(completed.completed, true);
  assert.equal(completed.reason, 'completed');

  for (const collision of [
    { destinationExists: true, overlaps: [] },
    { destinationExists: false, overlaps: ['dude-local-existing'] },
  ]) {
    inspectedCollision = collision;
    const refused = retentionRoute(base, { inspectSkill });
    assert.equal(refused.refused, true, JSON.stringify(collision));
    assert.match(refused.reason, /destination|overlap/i, JSON.stringify(collision));
  }
  assert.equal(ownerCalls, 3);
});

test('G: retention rejects caller claims about owner, destination, overlap, and authoritative content', () => {
  const retentionRoute = runtimeFunction('retentionRoute');
  const base = {
    retention: 'skill',
    finding: 'Reusable recovery boundary.',
    slug: 'recovery-boundary',
  };
  let ownerCalls = 0;
  for (const claim of [
    { destinationExists: false, overlaps: [] },
    { destinationAvailable: true },
    { collisionFree: true },
    { authority: 'caller' },
    { absent: true },
    { owner: 'caller' },
    { ownerState: { inspected: true } },
    { currentContent: '# caller-claimed authoritative state' },
  ]) {
    assert.throws(
      () => retentionRoute({ ...base, ...claim }, {
        inspectSkill() {
          ownerCalls += 1;
          return { destinationExists: false, overlaps: [] };
        },
      }),
      /unknown field/i,
      JSON.stringify(claim),
    );
  }
  assert.equal(ownerCalls, 0, 'caller ownership claims reject before owner inspection');
});

test('lost or malformed state and strict transition arrays fail before mutation or getter access', () => {
  const raw = transitionRaw(TARGET);
  const candidateAssessment = transitionAssessment('retry-task');
  assert.throws(
    () => authorizeAttempt(undefined, TARGET, raw, candidateAssessment, 'recovery'),
    /RunState must be an object/,
  );
  assert.throws(
    () => authorizeAttempt({ ...emptyState(), completed: null }, TARGET, raw, candidateAssessment, 'recovery'),
    /RunState\.completed must be an array/,
  );
  assert.throws(
    () => completeAttempt(undefined, {}),
    /RunState must be an object/,
  );

  const authorized = authorizeAttempt(
    emptyState({ recover: true }),
    TARGET,
    raw,
    candidateAssessment,
    'recovery',
  );
  const pending = authorized.state.pending[0];
  for (const attack of ARRAY_ATTACKS) {
    const operations = adversarialArray(
      /** @type {string[]} */ (pending.materialInputs.operations),
      attack,
    );
    const input = completionInput(pending, { operations: operations.value });
    assert.throws(() => completeAttempt(authorized.state, input), TypeError, attack);
    assert.equal(operations.getterCalls(), 0, attack);
  }

  const stateBefore = clone(authorized.state);
  const input = completionInput(pending);
  const inputBefore = clone(input);
  const finished = completeAttempt(authorized.state, input);
  assert.equal(finished.completed, true);
  assert.deepEqual(authorized.state, stateBefore);
  assert.deepEqual(input, inputBefore);
});

test('the recovery runtime may host JSON commands but has no write, spawn, model, tracker, or owner import surface', () => {
  const modulePath = fileURLToPath(new URL('./recovery.mjs', import.meta.url));
  const source = fs.readFileSync(modulePath, 'utf8');
  assert.equal(typeof authorizeAttempt, 'function');
  assert.equal(typeof completeAttempt, 'function');
  assert.doesNotMatch(source, /node:child_process|\bspawn\s*\(|\bexecFile\s*\(|fs\.(?:write|append|rename|rm|unlink|mkdir)|\bbd\s|modelCall/);
  assert.doesNotMatch(source, /dude-pack-beads|library\/packs\/beads|normalizeRecoveryEvidence/);
  assert.doesNotMatch(source, /normalizeCapturedBeads/);
  assert.doesNotMatch(source, /dude-memory-ledger|dude-learning-promotion|dude-skill-authoring|scaffold-skill/);
});

// --- T002: policy.mode autonomous continuation license -----------------------

/** @param {Record<string, unknown>} [overrides] */
function autonomousState(overrides = {}) {
  return emptyState({ mode: 'autonomous', recover: true, overall: 'unlimited', recovery: 'unlimited', ...overrides });
}

/** @param {Record<string, unknown>} [overrides] */
function guardedContinuationState(overrides = {}) {
  return emptyState({ mode: 'guarded', recover: true, overall: 'unlimited', recovery: 'unlimited', ...overrides });
}

/** @param {Record<string, unknown>} state @param {string} mode */
function withMode(state, mode) {
  const policy = /** @type {Record<string, unknown>} */ (state.policy);
  return { ...state, policy: { ...policy, mode } };
}

/** Clone a RunState with every pending entry's evidenceHash stripped, for structural comparison. @param {Record<string, unknown>} state */
function stateModuloPendingEvidence(state) {
  const copy = /** @type {Record<string, unknown>} */ (clone(state));
  for (const entry of /** @type {Record<string, unknown>[]} */ (copy.pending)) delete entry.evidenceHash;
  return copy;
}

const TASKS_PATH = `${SPEC_PATH.slice(0, -'spec.md'.length)}tasks.md`;

const AUTHORIZATION_ONLY_REASONS = Object.freeze([
  'invalid-action',
  'evidence-drift',
  'feature-only',
  'invalid-mode',
  'no-action',
  'recovery-disabled',
  'no-progress',
  'prior-no-progress',
  'not-dispatchable',
  'overall-exhausted',
  'recovery-exhausted',
]);

const EXPECTED_OUTCOME_CATEGORIES = Object.freeze({
  authorized: 'authorized',
  'approval-required': 'hard-stop',
  'safety-or-authority': 'hard-stop',
  'external-dependency': 'hard-stop',
  'clarification-required': 'hard-stop',
  'ambiguous-state': 'hard-stop',
  'tracked-definition-recovery-unsupported': 'hard-stop',
  'evidence-incomplete': 'hard-stop',
  'objective-source-conflict': 'hard-stop',
  'verification-failed': 'recoverable-checkpoint',
  'review-rejected': 'recoverable-checkpoint',
  'overall-exhausted': 'budget-stop',
  'recovery-exhausted': 'budget-stop',
  'no-progress': 'learning-stop',
  'prior-no-progress': 'learning-stop',
  'evidence-drift': 'guard-stop',
  'feature-only': 'guard-stop',
  'invalid-mode': 'guard-stop',
  'no-action': 'guard-stop',
  'invalid-action': 'guard-stop',
  'recovery-disabled': 'guard-stop',
  'not-dispatchable': 'guard-stop',
});

const EXHAUSTED_COMPLETION = Object.freeze({
  evidenceHash: '1'.repeat(64),
  approachHash: '2'.repeat(64),
  resultHash: '3'.repeat(64),
});

test('T002 A: guarded outcomes never license autonomous continuation and add no field', () => {
  const guarded = guardedContinuationState();

  const ordinary = authorizeAttempt(guarded, TARGET, transitionRaw(TARGET), transitionAssessment('execute-task'), 'ordinary');
  assert.equal(ordinary.authorized, true);
  assert.equal(mayContinueAutonomously(ordinary), false);

  const recovery = authorizeAttempt(guarded, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task'), 'recovery');
  assert.equal(recovery.authorized, true);
  assert.equal(recovery.reason, 'authorized');
  assert.equal(recovery.state.pending[0].mode, 'recovery');
  assert.equal(mayContinueAutonomously(recovery), false);
  assert.deepEqual(Object.keys(recovery), ['authorized', 'reason', 'state']);

  const hardStop = authorizeAttempt(guarded, TARGET, transitionRaw(TARGET, {
    currentRun: [capture(TARGET, 'approval-required', [{ reason: 'human approval' }])],
  }), transitionAssessment('retry-task'), 'recovery');
  assert.equal(hardStop.reason, 'approval-required');
  assert.equal(classifyOutcomeReason(hardStop.reason), 'hard-stop');
  assert.equal(mayContinueAutonomously(hardStop), false);
  assert.deepEqual(Object.keys(hardStop), ['authorized', 'reason', 'blocker', 'state']);

  const budgetStop = authorizeAttempt(
    { ...guardedContinuationState({ overall: 1 }), overallUsed: 1, completed: [{ ...EXHAUSTED_COMPLETION }] },
    TARGET,
    transitionRaw(TARGET),
    transitionAssessment('execute-task'),
    'ordinary',
  );
  assert.equal(budgetStop.reason, 'overall-exhausted');
  assert.equal(classifyOutcomeReason(budgetStop.reason), 'budget-stop');
  assert.equal(mayContinueAutonomously(budgetStop), false);

  const learnFirst = authorizeAttempt(guarded, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task', { targets: ['src/learn.mjs'] }), 'recovery');
  const learnDone = completeAttempt(learnFirst.state, completionInput(learnFirst.state.pending[0]));
  const learningStop = authorizeAttempt(learnDone.state, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task', { targets: ['src/learn.mjs'] }), 'recovery');
  assert.equal(learningStop.reason, 'no-progress');
  assert.equal(classifyOutcomeReason(learningStop.reason), 'learning-stop');
  assert.equal(mayContinueAutonomously(learningStop), false);

  const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };
  const guardStop = authorizeAttempt(guarded, featureTarget, transitionRaw(featureTarget), transitionAssessment('retry-task'), 'recovery');
  assert.equal(guardStop.reason, 'feature-only');
  assert.equal(classifyOutcomeReason(guardStop.reason), 'guard-stop');
  assert.equal(mayContinueAutonomously(guardStop), false);

  const rcAuth = authorizeAttempt(guarded, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task'), 'recovery');
  const rcFailed = completeAttempt(rcAuth.state, completionInput(rcAuth.state.pending[0], { checks: { verification: 'failed' } }));
  assert.equal(rcFailed.completed, false);
  assert.equal(rcFailed.reason, 'verification-failed');
  assert.equal(classifyOutcomeReason(rcFailed.reason), 'recoverable-checkpoint');
  assert.equal(mayContinueAutonomously(rcFailed), false);
});

test('T002 B: autonomous licenses only authorized recovery continuation while guarded stays identical', () => {
  const recoveries = [
    ['address-test', { verification: [capture(TARGET, 'failed', [{ historical: true }])] }, { targets: ['src/test.mjs'], checks: ['lint', 'verification'] }],
    ['address-review', { review: [capture(TARGET, 'rejected', [{ historical: true }])] }, { targets: ['src/review.mjs'], checks: ['review', 'verification'] }],
    ['reconcile-derived-definition', { currentRun: [capture(TARGET, 'blocked', [{ historical: true }])] }, { targets: definitionTargets(), checks: ['lint', 'review', 'verification'] }],
  ];
  for (const [action, rawOverrides, assessmentOverrides] of recoveries) {
    const raw = transitionRaw(TARGET, /** @type {Record<string, unknown>} */ (rawOverrides));
    const candidate = transitionAssessment(/** @type {string} */ (action), /** @type {Record<string, unknown>} */ (assessmentOverrides));
    const auto = authorizeAttempt(autonomousState(), TARGET, raw, candidate, 'recovery');
    assert.equal(auto.authorized, true, /** @type {string} */ (action));
    assert.equal(auto.reason, 'authorized', /** @type {string} */ (action));
    assert.equal(auto.state.pending[0].mode, 'recovery', /** @type {string} */ (action));
    assert.equal(mayContinueAutonomously(auto), true, /** @type {string} */ (action));

    const guarded = authorizeAttempt(guardedContinuationState(), TARGET, raw, candidate, 'recovery');
    assert.equal(guarded.authorized, true, /** @type {string} */ (action));
    assert.equal(guarded.reason, auto.reason, /** @type {string} */ (action));
    assert.equal(mayContinueAutonomously(guarded), false, /** @type {string} */ (action));
    assert.deepEqual(Object.keys(auto), ['authorized', 'reason', 'state'], /** @type {string} */ (action));
    // The autonomous definition-plan participates in evidence, so the sole differing field is the pending evidence hash.
    assert.notEqual(
      guarded.state.pending[0].evidenceHash,
      auto.state.pending[0].evidenceHash,
      /** @type {string} */ (action),
    );
    assert.deepEqual(
      stateModuloPendingEvidence(withMode(guarded.state, 'autonomous')),
      stateModuloPendingEvidence(auto.state),
      /** @type {string} */ (action),
    );
  }

  const ordinary = authorizeAttempt(autonomousState(), TARGET, transitionRaw(TARGET), transitionAssessment('execute-task'), 'ordinary');
  assert.equal(ordinary.authorized, true);
  assert.equal(ordinary.state.pending[0].mode, 'ordinary');
  assert.equal(mayContinueAutonomously(ordinary), false);
});

test('T002 C: every hard stop still stops under autonomous with a byte-identical refusal', () => {
  const trackedCaptureValue = trackedCapture(TRACKED.issueId, TASK_KEY);
  /** @param {string | null} issueId */
  const trackedProject = (issueId) => ({
    normalizeTrackedEvidence() {
      return trackedProjection(issueId ? { ...TRACKED, issueId } : TRACKED, [trackedCaptureValue]);
    },
  });
  const incompleteRaw = transitionRaw(TARGET);
  delete incompleteRaw.verification;
  const cases = [
    { name: 'approval-required', target: TARGET, raw: transitionRaw(TARGET, { currentRun: [capture(TARGET, 'approval-required', [{ i: 1 }])] }), assessment: transitionAssessment('retry-task'), reason: 'approval-required' },
    { name: 'safety-or-authority', target: TARGET, raw: transitionRaw(TARGET, { currentRun: [capture(TARGET, 'safety-or-authority', [{ i: 1 }])] }), assessment: transitionAssessment('retry-task'), reason: 'safety-or-authority' },
    { name: 'external-dependency', target: TARGET, raw: transitionRaw(TARGET, { currentRun: [capture(TARGET, 'external-dependency', [{ i: 1 }])] }), assessment: transitionAssessment('retry-task'), reason: 'external-dependency' },
    { name: 'clarification-required', target: TARGET, raw: transitionRaw(TARGET), assessment: transitionAssessment('retry-task', { intent: 'ambiguous' }), reason: 'clarification-required' },
    { name: 'ambiguous-state', target: TRACKED, raw: trackedRawInputs([trackedCaptureValue]), assessment: transitionAssessment('retry-task'), dependencies: trackedProject('dude-other'), reason: 'ambiguous-state' },
    { name: 'tracked-definition-recovery-unsupported', target: TRACKED, raw: trackedRawInputs([trackedCaptureValue]), assessment: transitionAssessment('reconcile-derived-definition', { targets: definitionTargets(), checks: ['lint', 'review', 'verification'] }), dependencies: trackedProject(null), reason: 'tracked-definition-recovery-unsupported' },
    { name: 'evidence-incomplete', target: TARGET, raw: incompleteRaw, assessment: transitionAssessment('retry-task'), reason: 'evidence-incomplete' },
  ];
  for (const fixture of cases) {
    const auto = autonomousState();
    const autoResult = authorizeAttempt(auto, fixture.target, fixture.raw, fixture.assessment, 'recovery', fixture.dependencies);
    assert.equal(autoResult.authorized, false, fixture.name);
    assert.equal(autoResult.reason, fixture.reason, fixture.name);
    assert.equal(classifyOutcomeReason(autoResult.reason), 'hard-stop', fixture.name);
    assert.equal(mayContinueAutonomously(autoResult), false, fixture.name);
    assert.strictEqual(autoResult.state, auto, fixture.name);

    const guarded = guardedContinuationState();
    const guardedResult = authorizeAttempt(guarded, fixture.target, fixture.raw, fixture.assessment, 'recovery', fixture.dependencies);
    assert.equal(guardedResult.authorized, false, fixture.name);
    assert.equal(guardedResult.reason, autoResult.reason, fixture.name);
    // The plan shifts the evidence hash, so blockers agree on code and subject rather than byte-for-byte.
    assert.equal(guardedResult.blocker?.code, autoResult.blocker?.code, fixture.name);
    assert.equal(guardedResult.blocker?.subject, autoResult.blocker?.subject, fixture.name);
    assert.strictEqual(guardedResult.state, guarded, fixture.name);
    assert.equal(mayContinueAutonomously(guardedResult), false, fixture.name);
  }
});

test('T002 D: autonomous never crosses budget, learning, or guard stops', () => {
  const overallState = { ...autonomousState({ overall: 1 }), overallUsed: 1, completed: [{ ...EXHAUSTED_COMPLETION }] };
  const overallExhausted = authorizeAttempt(overallState, TARGET, transitionRaw(TARGET), transitionAssessment('execute-task'), 'ordinary');

  const recoveryState = {
    ...autonomousState({ recovery: 1 }),
    overallUsed: 1,
    recoveryUsed: [{ targetKey: targetKey(TARGET), targetHash: targetHash(TARGET), count: 1 }],
    completed: [{ ...EXHAUSTED_COMPLETION }],
  };
  const recoveryExhausted = authorizeAttempt(recoveryState, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task'), 'recovery');

  const npRaw = transitionRaw(TARGET);
  const npFirst = authorizeAttempt(autonomousState(), TARGET, npRaw, transitionAssessment('retry-task', { targets: ['src/np.mjs'] }), 'recovery');
  const npState = completeAttempt(npFirst.state, completionInput(npFirst.state.pending[0])).state;
  const noProgress = authorizeAttempt(npState, TARGET, npRaw, transitionAssessment('retry-task', { targets: ['src/np.mjs'] }), 'recovery');

  const priorRaw = transitionRaw(TARGET);
  const priorFirst = authorizeAttempt(autonomousState(), TARGET, priorRaw, transitionAssessment('retry-task', { targets: ['src/result.mjs'], checks: ['verification'] }), 'recovery');
  const priorState = completeAttempt(priorFirst.state, completionInput(priorFirst.state.pending[0])).state;
  const priorSecond = authorizeAttempt(priorState, TARGET, priorRaw, transitionAssessment('retry-task', {
    targets: ['src/result-support.mjs', 'src/result.mjs'],
    checks: ['verification'],
    summary: 'A materially different target set.',
  }), 'recovery');
  const priorRepeated = completeAttempt(priorSecond.state, completionInput(priorSecond.state.pending[0], { changedTargets: ['src/result.mjs'] }));
  assert.equal(priorRepeated.reason, 'no-progress');
  const priorNoProgress = authorizeAttempt(priorRepeated.state, TARGET, priorRaw, transitionAssessment('retry-task', { targets: ['src/later.mjs'], checks: ['verification'] }), 'recovery');

  const disabledState = emptyState({ mode: 'autonomous', overall: 'unlimited', recovery: 'unlimited' });
  const recoveryDisabled = authorizeAttempt(disabledState, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task'), 'recovery');

  const driftRaw = transitionRaw(TARGET);
  const driftInspection = buildInspection(TARGET, collectEvidence(TARGET, driftRaw));
  const staleAssessment = transitionAssessment('retry-task', { evidenceHash: driftInspection.evidenceHash });
  const staleRaw = { ...transitionRaw(TARGET, { currentRun: [capture(TARGET, 'failed', [{ changed: true }])] }), definitionPlan: defaultNoRegistryPlan(TARGET) };
  const evidenceDrift = authorizeRuntimeAttempt(autonomousState(), TARGET, staleRaw, staleAssessment, 'recovery');

  const secondTarget = { ...TARGET, taskKey: SECOND_TASK_KEY };
  const pairBytes = transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }, { id: SECOND_TASK_KEY }]);
  const firstRaw = transitionRaw(TARGET, { tasks: { path: TASKS_PATH, bytes: pairBytes } });
  const secondRaw = transitionRaw(secondTarget, { tasks: { path: TASKS_PATH, bytes: pairBytes } });
  const ndFirst = authorizeAttempt(autonomousState(), TARGET, firstRaw, transitionAssessment('retry-task', { targets: ['src/first.mjs'] }), 'recovery');
  const notDispatchable = authorizeAttempt(ndFirst.state, secondTarget, secondRaw, transitionAssessment('retry-task', { targets: ['src/second.mjs'] }), 'recovery');

  const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };
  const featureOnly = authorizeAttempt(autonomousState(), featureTarget, transitionRaw(featureTarget), transitionAssessment('retry-task'), 'recovery');

  const stops = [
    ['overall-exhausted', 'budget-stop', overallExhausted],
    ['recovery-exhausted', 'budget-stop', recoveryExhausted],
    ['no-progress', 'learning-stop', noProgress],
    ['prior-no-progress', 'learning-stop', priorNoProgress],
    ['recovery-disabled', 'guard-stop', recoveryDisabled],
    ['evidence-drift', 'guard-stop', evidenceDrift],
    ['not-dispatchable', 'guard-stop', notDispatchable],
    ['feature-only', 'guard-stop', featureOnly],
  ];
  for (const [reason, category, result] of stops) {
    assert.equal(result.authorized, false, /** @type {string} */ (reason));
    assert.equal(result.reason, reason, /** @type {string} */ (reason));
    assert.equal(classifyOutcomeReason(result.reason), category, /** @type {string} */ (reason));
    assert.equal(mayContinueAutonomously(result), false, /** @type {string} */ (reason));
  }
});

test('T002 E: classifyOutcomeReason totally and exactly classifies the real reason domain', () => {
  const domain = [...BLOCKER_CODES, ...AUTHORIZATION_ONLY_REASONS, 'authorized'];
  assert.equal(new Set(domain).size, domain.length, 'the real reason domain has no duplicate reasons');
  assert.deepEqual(new Set(domain), new Set(Object.keys(OUTCOME_REASON_CLASSES)));
  assert.deepEqual(new Set(domain), new Set(Object.keys(EXPECTED_OUTCOME_CATEGORIES)));
  for (const reason of domain) {
    assert.equal(classifyOutcomeReason(reason), EXPECTED_OUTCOME_CATEGORIES[reason], reason);
    assert.equal(OUTCOME_REASON_CLASSES[reason], EXPECTED_OUTCOME_CATEGORIES[reason], reason);
  }
  assert.throws(() => classifyOutcomeReason('nope'), TypeError);
  assert.equal(classifyOutcomeReason('objective-source-conflict'), 'hard-stop');
});

test('T002 E: mayContinueAutonomously is fail-closed, non-throwing, and off the authorized-recovery path', () => {
  const ordinary = authorizeAttempt(autonomousState(), TARGET, transitionRaw(TARGET), transitionAssessment('execute-task'), 'ordinary');
  const robustnessCases = [
    undefined,
    null,
    0,
    '',
    'x',
    {},
    { authorized: false },
    { authorized: true },
    { authorized: true, state: { not: 'a valid run state' } },
    ordinary,
  ];
  for (const input of robustnessCases) {
    assert.doesNotThrow(() => mayContinueAutonomously(input));
    assert.equal(mayContinueAutonomously(input), false, canonicalJson(input ?? null));
  }
});

test('T002 F: an autonomous authorized recovery still cannot complete on a failed verification', () => {
  for (const mode of ['autonomous', 'guarded']) {
    const state = emptyState({ mode, recover: true, overall: 'unlimited', recovery: 'unlimited' });
    const authorized = authorizeAttempt(state, TARGET, transitionRaw(TARGET), transitionAssessment('retry-task'), 'recovery');
    assert.equal(authorized.authorized, true, mode);
    assert.equal(mayContinueAutonomously(authorized), mode === 'autonomous', mode);
    const completed = completeAttempt(authorized.state, completionInput(authorized.state.pending[0], { checks: { verification: 'failed' } }));
    assert.equal(completed.completed, false, mode);
    assert.equal(completed.reason, 'verification-failed', mode);
    assert.equal(mayContinueAutonomously(completed), false, mode);
  }
});

// --- T003: sequential post-stop scheduling license ---------------------------

const SECOND_TARGET = Object.freeze({ ...TARGET, taskKey: SECOND_TASK_KEY });
const THIRD_TARGET = Object.freeze({ ...TARGET, taskKey: THIRD_TASK_KEY });

/**
 * Build a real autonomous hard stop (approval-required) with an empty pending
 * queue, so the current authorized bounded attempt has already finished.
 */
function autonomousHardStop() {
  const outcome = authorizeAttempt(autonomousState(), TARGET, transitionRaw(TARGET, {
    currentRun: [capture(TARGET, 'approval-required', [{ i: 1 }])],
  }), transitionAssessment('retry-task'), 'recovery');
  assert.equal(outcome.authorized, false);
  assert.equal(outcome.reason, 'approval-required');
  assert.equal(classifyOutcomeReason(outcome.reason), 'hard-stop');
  assert.equal(outcome.state.pending.length, 0);
  return outcome;
}

test('T003 A: a hard stop with one pending authorization stays sequential and mutates nothing', () => {
  const pending1 = authorizeAttempt(autonomousState(), TARGET, transitionRaw(TARGET), transitionAssessment('execute-task'), 'ordinary');
  assert.equal(pending1.authorized, true);
  assert.equal(pending1.state.pending.length, 1);

  const stopped = {
    outcome: { authorized: false, reason: 'approval-required', state: pending1.state },
    target: TARGET,
    changeSet: ['src/a.mjs'],
  };
  const candidate = { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [] };
  const stateSnapshot = clone(pending1.state);

  assert.equal(mayScheduleAfterStop(stopped, candidate), false);
  assert.deepEqual(pending1.state, stateSnapshot);
});

test('T003 B: an autonomous hard stop licenses one disjoint dependency-free candidate', () => {
  const outcome = autonomousHardStop();
  const stopped = { outcome, target: TARGET, changeSet: ['src/a.mjs'] };
  const candidate = { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [] };

  assert.equal(mayScheduleAfterStop(stopped, candidate), true);
  assert.equal(typeof mayScheduleAfterStop(stopped, candidate), 'boolean');
  assert.equal(outcome.state.pending.length, 0);
});

test('T003 C: overlapping change sets refuse scheduling', () => {
  const outcome = autonomousHardStop();

  assert.equal(mayScheduleAfterStop(
    { outcome, target: TARGET, changeSet: ['src/shared.mjs'] },
    { target: SECOND_TARGET, changeSet: ['src/shared.mjs'], deps: [] },
  ), false);

  assert.equal(mayScheduleAfterStop(
    { outcome, target: TARGET, changeSet: ['src/a.mjs', 'src/shared.mjs'] },
    { target: SECOND_TARGET, changeSet: ['src/b.mjs', 'src/shared.mjs'], deps: [] },
  ), false);
});

test('T003 D: a candidate that directly depends on the stopped target refuses scheduling', () => {
  const outcome = autonomousHardStop();

  assert.equal(mayScheduleAfterStop(
    { outcome, target: TARGET, changeSet: ['src/a.mjs'] },
    { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [TASK_KEY] },
  ), false);

  // an unrelated dependency does not block an otherwise independent candidate
  assert.equal(mayScheduleAfterStop(
    { outcome, target: TARGET, changeSet: ['src/a.mjs'] },
    { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [THIRD_TASK_KEY] },
  ), true);
});

test('T003 E: only autonomous policy licenses scheduling; guarded refuses the same scenario', () => {
  const outcome = autonomousHardStop();
  const stopped = { outcome, target: TARGET, changeSet: ['src/a.mjs'] };
  const candidate = { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [] };

  assert.equal(mayScheduleAfterStop(stopped, candidate), true);

  const guardedStopped = { ...stopped, outcome: { ...outcome, state: withMode(outcome.state, 'guarded') } };
  assert.equal(mayScheduleAfterStop(guardedStopped, candidate), false);

  // mode is the only differing input: flipping it back recovers the identical state
  assert.deepEqual(withMode(guardedStopped.outcome.state, 'autonomous'), outcome.state);
});

test('T003 F: revisiting the stopped task needs new evidence or a different approach, never scheduling', () => {
  const revisitRaw = transitionRaw(TARGET);
  const revisitFirst = authorizeAttempt(autonomousState(), TARGET, revisitRaw, transitionAssessment('retry-task', { targets: ['src/revisit.mjs'] }), 'recovery');
  const revisitState = completeAttempt(revisitFirst.state, completionInput(revisitFirst.state.pending[0])).state;

  // (i) same evidence and same approach ⇒ no-progress
  const sameEvidenceApproach = authorizeAttempt(revisitState, TARGET, revisitRaw, transitionAssessment('retry-task', { targets: ['src/revisit.mjs'] }), 'recovery');
  assert.equal(sameEvidenceApproach.authorized, false);
  assert.equal(sameEvidenceApproach.reason, 'no-progress');

  // (i) a repeated completed result under the same evidence ⇒ prior-no-progress
  const priorRaw = transitionRaw(TARGET);
  const priorFirst = authorizeAttempt(autonomousState(), TARGET, priorRaw, transitionAssessment('retry-task', { targets: ['src/prior.mjs'], checks: ['verification'] }), 'recovery');
  const priorState = completeAttempt(priorFirst.state, completionInput(priorFirst.state.pending[0])).state;
  const priorSecond = authorizeAttempt(priorState, TARGET, priorRaw, transitionAssessment('retry-task', {
    targets: ['src/prior-support.mjs', 'src/prior.mjs'],
    checks: ['verification'],
    summary: 'A materially different target set.',
  }), 'recovery');
  const priorRepeated = completeAttempt(priorSecond.state, completionInput(priorSecond.state.pending[0], { changedTargets: ['src/prior.mjs'] }));
  assert.equal(priorRepeated.reason, 'no-progress');
  const priorNoProgress = authorizeAttempt(priorRepeated.state, TARGET, priorRaw, transitionAssessment('retry-task', { targets: ['src/prior-later.mjs'], checks: ['verification'] }), 'recovery');
  assert.equal(priorNoProgress.authorized, false);
  assert.equal(priorNoProgress.reason, 'prior-no-progress');

  // (ii) stale evidence ⇒ evidence-drift
  const driftInspection = buildInspection(TARGET, collectEvidence(TARGET, transitionRaw(TARGET)));
  const staleAssessment = transitionAssessment('retry-task', { evidenceHash: driftInspection.evidenceHash });
  const staleRaw = { ...transitionRaw(TARGET, { currentRun: [capture(TARGET, 'failed', [{ changed: true }])] }), definitionPlan: defaultNoRegistryPlan(TARGET) };
  const evidenceDrift = authorizeRuntimeAttempt(autonomousState(), TARGET, staleRaw, staleAssessment, 'recovery');
  assert.equal(evidenceDrift.authorized, false);
  assert.equal(evidenceDrift.reason, 'evidence-drift');

  // (iii) fresh evidence and a materially different approach ⇒ authorized
  const freshRaw = transitionRaw(TARGET, { currentRun: [capture(TARGET, 'failed', [{ attempt: 'second' }])] });
  const freshRevisit = authorizeAttempt(revisitState, TARGET, freshRaw, transitionAssessment('retry-task', { targets: ['src/revisit-different.mjs'] }), 'recovery');
  assert.equal(freshRevisit.authorized, true);
  assert.equal(freshRevisit.reason, 'authorized');

  // scheduling never revisits the stopped task itself, even with disjoint work
  const outcome = autonomousHardStop();
  assert.equal(mayScheduleAfterStop(
    { outcome, target: TARGET, changeSet: ['src/a.mjs'] },
    { target: clone(TARGET), changeSet: ['src/b.mjs'], deps: [] },
  ), false);
});

test('T003 G: scheduling authorizes nothing; sequential dispatch still stops at one pending', () => {
  const outcome = autonomousHardStop();
  const stopped = { outcome, target: TARGET, changeSet: ['src/a.mjs'] };
  const candidate = { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [] };

  assert.equal(mayScheduleAfterStop(stopped, candidate), true);
  assert.equal(outcome.state.pending.length, 0);

  // dispatch still flows through authorizeAttempt, which takes the one pending slot
  const dispatched = authorizeAttempt(outcome.state, SECOND_TARGET, transitionRaw(SECOND_TARGET), transitionAssessment('retry-task', { targets: ['src/b.mjs'] }), 'recovery');
  assert.equal(dispatched.authorized, true);
  assert.equal(dispatched.state.pending.length, 1);

  // a third target cannot be dispatched concurrently
  const third = authorizeAttempt(dispatched.state, THIRD_TARGET, transitionRaw(THIRD_TARGET), transitionAssessment('retry-task', { targets: ['src/c.mjs'] }), 'recovery');
  assert.equal(third.authorized, false);
  assert.equal(third.reason, 'not-dispatchable');

  // the predicate itself mutated no state
  assert.equal(outcome.state.pending.length, 0);
});

test('T003 H: mayScheduleAfterStop is fail-closed and non-throwing on every malformed input', () => {
  const outcome = autonomousHardStop();
  const validStopped = { outcome, target: TARGET, changeSet: ['src/a.mjs'] };
  const validCandidate = { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [] };
  const okState = outcome.state;
  assert.equal(mayScheduleAfterStop(validStopped, validCandidate), true);

  /** @type {Array<[string, unknown, unknown]>} */
  const cases = [
    ['stopped undefined', undefined, validCandidate],
    ['stopped null', null, validCandidate],
    ['stopped 0', 0, validCandidate],
    ["stopped ''", '', validCandidate],
    ['stopped {}', {}, validCandidate],
    ['stopped []', [], validCandidate],
    ['candidate undefined', validStopped, undefined],
    ['candidate null', validStopped, null],
    ['candidate 0', validStopped, 0],
    ["candidate ''", validStopped, ''],
    ['candidate {}', validStopped, {}],
    ['candidate []', validStopped, []],
    ['stopped missing outcome', { target: TARGET, changeSet: ['src/a.mjs'] }, validCandidate],
    ['stopped missing target', { outcome, changeSet: ['src/a.mjs'] }, validCandidate],
    ['stopped missing changeSet', { outcome, target: TARGET }, validCandidate],
    ['stopped extra field', { ...validStopped, extra: 1 }, validCandidate],
    ['candidate missing target', validStopped, { changeSet: ['src/b.mjs'], deps: [] }],
    ['candidate missing changeSet', validStopped, { target: SECOND_TARGET, deps: [] }],
    ['candidate missing deps', validStopped, { target: SECOND_TARGET, changeSet: ['src/b.mjs'] }],
    ['candidate extra field', validStopped, { ...validCandidate, extra: 1 }],
    ['outcome string', { ...validStopped, outcome: 'x' }, validCandidate],
    ['outcome number', { ...validStopped, outcome: 0 }, validCandidate],
    ['outcome null', { ...validStopped, outcome: null }, validCandidate],
    ['outcome array', { ...validStopped, outcome: [] }, validCandidate],
    ['outcome missing reason', { ...validStopped, outcome: { authorized: false, state: okState } }, validCandidate],
    ['outcome missing state', { ...validStopped, outcome: { authorized: false, reason: 'approval-required' } }, validCandidate],
    ['outcome non-string reason', { ...validStopped, outcome: { reason: 5, state: okState } }, validCandidate],
    ['invalid run state', { ...validStopped, outcome: { reason: 'approval-required', state: { not: 'valid' } } }, validCandidate],
    ['guarded run state', { ...validStopped, outcome: { reason: 'approval-required', state: withMode(okState, 'guarded') } }, validCandidate],
    ['reason authorized', { ...validStopped, outcome: { reason: 'authorized', state: okState } }, validCandidate],
    ['reason verification-failed', { ...validStopped, outcome: { reason: 'verification-failed', state: okState } }, validCandidate],
    ['reason no-progress', { ...validStopped, outcome: { reason: 'no-progress', state: okState } }, validCandidate],
    ['reason not-dispatchable', { ...validStopped, outcome: { reason: 'not-dispatchable', state: okState } }, validCandidate],
    ['reason unknown', { ...validStopped, outcome: { reason: 'nope', state: okState } }, validCandidate],
    ['stopped feature target', { ...validStopped, target: { specPath: SPEC_PATH, lane: 'lightweight' } }, validCandidate],
    ['candidate feature target', validStopped, { ...validCandidate, target: { specPath: SPEC_PATH, lane: 'lightweight' } }],
    ['stopped changeSet unsorted', { ...validStopped, changeSet: ['src/b.mjs', 'src/a.mjs'] }, validCandidate],
    ['stopped changeSet duplicate', { ...validStopped, changeSet: ['src/a.mjs', 'src/a.mjs'] }, validCandidate],
    ['stopped changeSet non-material', { ...validStopped, changeSet: ['../escape.mjs'] }, validCandidate],
    ['stopped changeSet empty entry', { ...validStopped, changeSet: [''] }, validCandidate],
    ['stopped changeSet not array', { ...validStopped, changeSet: 'src/a.mjs' }, validCandidate],
    ['candidate changeSet unsorted', validStopped, { ...validCandidate, changeSet: ['src/z.mjs', 'src/b.mjs'] }],
    ['candidate changeSet non-material', validStopped, { ...validCandidate, changeSet: ['a\\b.mjs'] }],
    ['candidate deps not array', validStopped, { ...validCandidate, deps: 'T001@8f31c2a7' }],
    ['candidate deps non-string', validStopped, { ...validCandidate, deps: [5] }],
    ['candidate deps object', validStopped, { ...validCandidate, deps: {} }],
    ['candidate deps sparse', validStopped, { ...validCandidate, deps: Array(2) }],
  ];
  for (const [label, s, c] of cases) {
    assert.doesNotThrow(() => mayScheduleAfterStop(s, c), label);
    assert.equal(mayScheduleAfterStop(s, c), false, label);
  }
});

test('T003 I: gate 9 resolves a tracked stopped target durable id from its canonical issueId', () => {
  const outcome = autonomousHardStop();
  // A non-canonical tracked stopped target carrying BOTH taskKey and issueId;
  // canonicalization drops the taskKey, so the durable id is the issueId.
  const trackedStopped = { ...TRACKED, taskKey: TASK_KEY };
  assert.deepEqual(canonicalTarget(trackedStopped), canonicalTarget(TRACKED));

  // a candidate that depends on the stopped target's canonical issueId refuses scheduling
  assert.equal(mayScheduleAfterStop(
    { outcome, target: trackedStopped, changeSet: ['src/a.mjs'] },
    { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [TRACKED.issueId] },
  ), false);

  // the dropped non-canonical taskKey is not the tracked target's durable id, so
  // a dependency on it does not block an otherwise independent candidate
  assert.equal(mayScheduleAfterStop(
    { outcome, target: trackedStopped, changeSet: ['src/a.mjs'] },
    { target: SECOND_TARGET, changeSet: ['src/b.mjs'], deps: [TASK_KEY] },
  ), true);
});

// --- T004: definition-plan objective source ----------------------------------

const REGISTRY_START = '<' + '!-- dude:objective-registry:start --' + '>';
const REGISTRY_END = '<' + '!-- dude:objective-registry:end --' + '>';
const PLAN_PATH = `${SPEC_PATH.slice(0, -'spec.md'.length)}plan.md`;

/** @param {Record<string, unknown>} [overrides] */
function numericContract(overrides = {}) {
  return {
    id: 'obj-latency',
    subject: 'Reduce p95 latency',
    kind: 'numeric',
    evaluators: [{ id: 'bench', version: 'v1' }],
    inputs: [{ id: 'corpus', kind: 'file', path: 'src/a.mjs', sha256: '0'.repeat(64) }],
    environment: [{ id: 'node', valueHash: '1'.repeat(64) }],
    conditions: ['cold-start'],
    budget: { comparisons: 8, durationMs: 1000, tokens: 0, costMicrounits: 0 },
    hardConstraints: [{ kind: 'verification', id: 'unit', target: 'src/a.test.mjs' }],
    tieRule: { mode: 'discard' },
    comparator: {
      mode: 'numeric', unit: 'ms', direction: 'minimize',
      sampleCount: 5, aggregation: 'median', tolerance: '0.5', meaningfulThreshold: '1.5',
    },
    ...overrides,
  };
}

/**
 * @param {string} [taskKey]
 * @param {Record<string, unknown>} [contract]
 * @param {Record<string, unknown>} [provenance]
 */
function registryEntry(taskKey = TASK_KEY, contract = numericContract(), provenance = {
  kind: 'spec',
  refs: [{ path: SPEC_PATH, section: 'success-criteria' }],
}) {
  return { taskKey, provenance, contract };
}

/** @param {Record<string, unknown>[]} [entries] @param {Record<string, unknown>} [owner] */
function objectiveRegistry(entries = [registryEntry()], owner = { ideaPath: IDEA_PATH, specPath: SPEC_PATH }) {
  return { version: 1, owner, entries };
}

/** @param {string} bodyLine */
function planBytesWithBody(bodyLine) {
  return Buffer.from(['# Plan', '', REGISTRY_START, bodyLine, REGISTRY_END, ''].join('\n'));
}

/** @param {Record<string, unknown>} registry */
function planWithRegistry(registry) {
  return planBytesWithBody(canonicalJson(registry));
}

/** @param {Record<string, unknown>} raw @param {Record<string, unknown>} plan */
function withDefinitionPlan(raw, plan) {
  return { ...raw, definitionPlan: plan };
}

/** @param {unknown[]} items */
function definitionPlanItem(items) {
  return /** @type {Record<string, unknown>} */ (
    items.find((item) => /** @type {Record<string, unknown>} */ (item).source === 'definition-plan')
  );
}

test('T004: scanObjectiveRegistry classifies none, present, and every malformed marker layout', () => {
  assert.deepEqual(scanObjectiveRegistry('# Plan\n\nNo registry region here.\n'), { status: 'none' });

  const registry = objectiveRegistry();
  const registryText = canonicalJson(registry);
  const present = scanObjectiveRegistry(planWithRegistry(registry).toString('utf8'));
  assert.equal(present.status, 'present');
  assert.equal(present.registryText, registryText);
  assert.deepEqual(present.registry, registry);

  const malformed = [
    ['lone start', ['# Plan', REGISTRY_START, ''].join('\n')],
    ['lone end', ['# Plan', REGISTRY_END, ''].join('\n')],
    ['duplicate start', ['# Plan', REGISTRY_START, registryText, REGISTRY_START, REGISTRY_END].join('\n')],
    ['reversed order', ['# Plan', REGISTRY_END, registryText, REGISTRY_START].join('\n')],
    ['extra body line', ['# Plan', REGISTRY_START, registryText, registryText, REGISTRY_END].join('\n')],
    ['zero body lines', ['# Plan', REGISTRY_START, REGISTRY_END].join('\n')],
    ['empty body line', ['# Plan', REGISTRY_START, '', REGISTRY_END].join('\n')],
    ['noncanonical body', ['# Plan', REGISTRY_START, ` ${registryText}`, REGISTRY_END].join('\n')],
    ['non-json body', ['# Plan', REGISTRY_START, 'not json', REGISTRY_END].join('\n')],
    ['invalid registry', planBytesWithBody(canonicalJson({ ...registry, version: 2 })).toString('utf8')],
  ];
  for (const [label, text] of malformed) {
    assert.equal(scanObjectiveRegistry(text).status, 'malformed', label);
  }

  // Markers inside a fenced code block are inert.
  const fenced = ['# Plan', '```text', REGISTRY_START, registryText, REGISTRY_END, '```', ''].join('\n');
  assert.deepEqual(scanObjectiveRegistry(fenced), { status: 'none' });
});

test('T004: validateEvaluationContract accepts each valid variant and rejects every bound', () => {
  assert.doesNotThrow(() => validateEvaluationContract(numericContract()));
  assert.doesNotThrow(() => validateEvaluationContract(numericContract({
    kind: 'ordinal',
    comparator: { mode: 'ordinal-levels', levels: ['bad', 'ok', 'good'], meaningfulSteps: 1 },
  })));
  assert.doesNotThrow(() => validateEvaluationContract(numericContract({
    kind: 'ordinal',
    evaluators: [{ id: 'a', version: 'v1' }, { id: 'b', version: 'v1' }],
    comparator: { mode: 'ordinal-pairwise', rubric: { id: 'r', criteria: [{ id: 'c1', text: 'clarity' }] } },
  })));
  assert.doesNotThrow(() => validateEvaluationContract(numericContract({
    kind: 'subjective',
    evaluators: [{ id: 'a', version: 'v1' }, { id: 'b', version: 'v1' }],
    comparator: { mode: 'subjective', rubric: { id: 'r', criteria: [{ id: 'c1', text: 'clarity' }] } },
  })));
  assert.doesNotThrow(() => validateEvaluationContract(numericContract({
    tieRule: { mode: 'independent-review', purpose: 'risk', rubric: { id: 'r', criteria: [{ id: 'c1', text: 'safest' }] } },
  })));

  /** @type {[string, Record<string, unknown>][]} */
  const rejects = [
    ['unknown field', numericContract({ extra: 1 })],
    ['bad kind', numericContract({ kind: 'binary' })],
    ['numeric needs one evaluator', numericContract({ evaluators: [{ id: 'a', version: 'v1' }, { id: 'b', version: 'v1' }] })],
    ['evaluator id', numericContract({ evaluators: [{ id: 'BAD', version: 'v1' }] })],
    ['zero inputs', numericContract({ inputs: [] })],
    ['17 inputs', numericContract({ inputs: Array.from({ length: 17 }, (_, i) => ({ id: `in-${String(i).padStart(2, '0')}`, kind: 'value', valueHash: '1'.repeat(64) })) })],
    ['unsorted inputs', numericContract({ inputs: [{ id: 'z', kind: 'value', valueHash: '1'.repeat(64) }, { id: 'a', kind: 'value', valueHash: '1'.repeat(64) }] })],
    ['input escape path', numericContract({ inputs: [{ id: 'in', kind: 'file', path: '../escape.mjs', sha256: '0'.repeat(64) }] })],
    ['zero environment', numericContract({ environment: [] })],
    ['zero conditions', numericContract({ conditions: [] })],
    ['unsorted conditions', numericContract({ conditions: ['b', 'a'] })],
    ['budget comparisons 0', numericContract({ budget: { comparisons: 0, durationMs: 0, tokens: 0, costMicrounits: 0 } })],
    ['budget comparisons 65', numericContract({ budget: { comparisons: 65, durationMs: 0, tokens: 0, costMicrounits: 0 } })],
    ['budget negative', numericContract({ budget: { comparisons: 1, durationMs: -1, tokens: 0, costMicrounits: 0 } })],
    ['17 hard constraints', numericContract({ hardConstraints: Array.from({ length: 17 }, (_, i) => ({ kind: 'lint', id: `c-${String(i).padStart(2, '0')}`, target: 't' })) })],
    ['reserved constraint id', numericContract({ hardConstraints: [{ kind: 'verification', id: 'candidate-bound-completion', target: 't' }] })],
    ['unsorted hard constraints', numericContract({ hardConstraints: [{ kind: 'verification', id: 'b', target: 't' }, { kind: 'lint', id: 'a', target: 't' }] })],
    ['bad tie purpose', numericContract({ tieRule: { mode: 'independent-review', purpose: 'speed', rubric: { id: 'r', criteria: [{ id: 'c', text: 'x' }] } } })],
    ['numeric even sampleCount', numericContract({ comparator: { mode: 'numeric', unit: 'ms', direction: 'minimize', sampleCount: 4, aggregation: 'median', tolerance: '0.5', meaningfulThreshold: '1.5' } })],
    ['numeric sampleCount 17', numericContract({ comparator: { mode: 'numeric', unit: 'ms', direction: 'minimize', sampleCount: 17, aggregation: 'median', tolerance: '0.5', meaningfulThreshold: '1.5' } })],
    ['numeric threshold not greater than tolerance', numericContract({ comparator: { mode: 'numeric', unit: 'ms', direction: 'minimize', sampleCount: 5, aggregation: 'median', tolerance: '1.5', meaningfulThreshold: '1.5' } })],
    ['numeric negative tolerance', numericContract({ comparator: { mode: 'numeric', unit: 'ms', direction: 'minimize', sampleCount: 5, aggregation: 'median', tolerance: '-0.5', meaningfulThreshold: '1.5' } })],
    ['numeric noncanonical decimal', numericContract({ comparator: { mode: 'numeric', unit: 'ms', direction: 'minimize', sampleCount: 5, aggregation: 'median', tolerance: '0.50', meaningfulThreshold: '1.5' } })],
    ['comparator kind mismatch', numericContract({ kind: 'ordinal', comparator: { mode: 'numeric', unit: 'ms', direction: 'minimize', sampleCount: 5, aggregation: 'median', tolerance: '0.5', meaningfulThreshold: '1.5' } })],
    ['ordinal-levels one level', numericContract({ kind: 'ordinal', comparator: { mode: 'ordinal-levels', levels: ['only'], meaningfulSteps: 1 } })],
    ['ordinal-levels 33 levels', numericContract({ kind: 'ordinal', comparator: { mode: 'ordinal-levels', levels: Array.from({ length: 33 }, (_, i) => `l${i}`), meaningfulSteps: 1 } })],
    ['ordinal-levels steps not less than count', numericContract({ kind: 'ordinal', comparator: { mode: 'ordinal-levels', levels: ['a', 'b'], meaningfulSteps: 2 } })],
    ['pairwise needs two evaluators', numericContract({ kind: 'ordinal', comparator: { mode: 'ordinal-pairwise', rubric: { id: 'r', criteria: [{ id: 'c', text: 'x' }] } } })],
    ['rubric 17 criteria', numericContract({ kind: 'subjective', evaluators: [{ id: 'a', version: 'v1' }, { id: 'b', version: 'v1' }], comparator: { mode: 'subjective', rubric: { id: 'r', criteria: Array.from({ length: 17 }, (_, i) => ({ id: `c${i}`, text: 'x' })) } } })],
  ];
  for (const [label, contract] of rejects) {
    assert.throws(() => validateEvaluationContract(contract), TypeError, label);
  }
});

test('T004: validateObjectiveRegistry enforces root, entry, and provenance bounds', () => {
  assert.doesNotThrow(() => validateObjectiveRegistry(objectiveRegistry()));
  assert.doesNotThrow(() => validateObjectiveRegistry(objectiveRegistry([
    registryEntry(TASK_KEY, numericContract({ id: 'a' })),
    registryEntry(SECOND_TASK_KEY, numericContract({ id: 'b' })),
  ])));

  /** @type {[string, unknown][]} */
  const rejects = [
    ['version', { ...objectiveRegistry(), version: 2 }],
    ['owner idea path', objectiveRegistry([registryEntry()], { ideaPath: 'ideas/x.md', specPath: SPEC_PATH })],
    ['owner spec path', objectiveRegistry([registryEntry()], { ideaPath: IDEA_PATH, specPath: 'spec.md' })],
    ['zero entries', objectiveRegistry([])],
    ['unsorted entries', objectiveRegistry([registryEntry(SECOND_TASK_KEY, numericContract({ id: 'b' })), registryEntry(TASK_KEY, numericContract({ id: 'a' }))])],
    ['duplicate task key', objectiveRegistry([registryEntry(TASK_KEY, numericContract({ id: 'a' })), registryEntry(TASK_KEY, numericContract({ id: 'b' }))])],
    ['duplicate contract id', objectiveRegistry([registryEntry(TASK_KEY, numericContract({ id: 'dup' })), registryEntry(SECOND_TASK_KEY, numericContract({ id: 'dup' }))])],
    ['provenance kind', objectiveRegistry([registryEntry(TASK_KEY, numericContract(), { kind: 'other', refs: [{ path: SPEC_PATH, section: 's' }] })])],
    ['provenance foreign ref', objectiveRegistry([registryEntry(TASK_KEY, numericContract(), { kind: 'spec', refs: [{ path: 'src/x.mjs', section: 's' }] })])],
    ['65 entries', objectiveRegistry(Array.from({ length: 65 }, (_, i) => registryEntry(`T${String(i + 100).padStart(3, '0')}@abcdef12`, numericContract({ id: `c-${i}` }))))],
  ];
  for (const [label, registry] of rejects) {
    assert.throws(() => validateObjectiveRegistry(registry), TypeError, label);
  }
});

test('T004: definition-plan present body carries exact hashes and the selected entry', () => {
  const registry = objectiveRegistry([registryEntry(TASK_KEY)]);
  const planBytes = planWithRegistry(registry);
  const items = collectEvidence(TARGET, withDefinitionPlan(rawInputs(), { path: PLAN_PATH, bytes: planBytes }), undefined, 'autonomous');
  assert.equal(items[2].source, 'definition-plan', 'definition-plan is at source position 3');
  const item = definitionPlanItem(items);
  assert.equal(item.status, 'present');
  const body = JSON.parse(/** @type {string} */ (item.text));
  assert.deepEqual(
    Object.keys(body).sort(),
    ['contractHash', 'ownerBindingHash', 'path', 'planDescriptor', 'registryHash', 'selectedEntry'],
  );
  assert.equal(body.path, PLAN_PATH);
  assert.deepEqual(body.planDescriptor, contentDescriptor(planBytes));
  assert.equal(body.ownerBindingHash, sha256(canonicalJson({ ideaPath: IDEA_PATH, specPath: SPEC_PATH, planPath: PLAN_PATH })));
  assert.equal(body.registryHash, sha256(canonicalJson(registry)));
  assert.deepEqual(body.selectedEntry, registryEntry(TASK_KEY));
  assert.equal(body.contractHash, sha256(canonicalJson(registryEntry(TASK_KEY).contract)));

  // A no-registry plan is present with a null registry hash and no selection.
  const noRegistry = definitionPlanItem(collectEvidence(
    TARGET,
    withDefinitionPlan(rawInputs(), { path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) }),
    undefined,
    'autonomous',
  ));
  const noRegistryBody = JSON.parse(/** @type {string} */ (noRegistry.text));
  assert.equal(noRegistryBody.registryHash, null);
  assert.ok(!Object.hasOwn(noRegistryBody, 'selectedEntry'));
  assert.ok(!Object.hasOwn(noRegistryBody, 'contractHash'));
});

test('T004: selection covers lightweight match/no-match, feature-only, and tracked mapped/unmapped', () => {
  const registry = objectiveRegistry([registryEntry(TASK_KEY, numericContract({ id: 'obj-a' }))]);
  const plan = { path: PLAN_PATH, bytes: planWithRegistry(registry) };

  const matched = definitionPlanItem(collectEvidence(TARGET, withDefinitionPlan(rawInputs(), plan), undefined, 'autonomous'));
  assert.ok(Object.hasOwn(JSON.parse(/** @type {string} */ (matched.text)), 'selectedEntry'));

  const secondTarget = { specPath: SPEC_PATH, lane: 'lightweight', taskKey: SECOND_TASK_KEY };
  const noMatch = definitionPlanItem(collectEvidence(secondTarget, withDefinitionPlan(transitionRaw(secondTarget), plan), undefined, 'autonomous'));
  const noMatchBody = JSON.parse(/** @type {string} */ (noMatch.text));
  assert.equal(noMatch.status, 'present');
  assert.equal(noMatchBody.registryHash, sha256(canonicalJson(registry)));
  assert.ok(!Object.hasOwn(noMatchBody, 'selectedEntry'));

  const featureTarget = { specPath: SPEC_PATH, lane: 'lightweight' };
  const featureItem = definitionPlanItem(collectEvidence(featureTarget, withDefinitionPlan(transitionRaw(featureTarget), plan), undefined, 'autonomous'));
  assert.equal(featureItem.status, 'present');
  assert.ok(!Object.hasOwn(JSON.parse(/** @type {string} */ (featureItem.text)), 'selectedEntry'));

  const mappedCapture = trackedCapture(TRACKED.issueId, TASK_KEY);
  const mappedDeps = { normalizeTrackedEvidence: () => trackedProjection(TRACKED, [mappedCapture]) };
  const mappedItem = definitionPlanItem(collectEvidence(TRACKED, withDefinitionPlan(trackedRawInputs([mappedCapture]), plan), mappedDeps, 'autonomous'));
  assert.equal(mappedItem.status, 'present');
  assert.ok(Object.hasOwn(JSON.parse(/** @type {string} */ (mappedItem.text)), 'selectedEntry'), 'tracked mapped selects');

  const unmappedCapture = trackedCapture(TRACKED.issueId, null);
  const unmappedDeps = { normalizeTrackedEvidence: () => trackedProjection(TRACKED, [unmappedCapture]) };
  const unmappedItem = definitionPlanItem(collectEvidence(TRACKED, withDefinitionPlan(trackedRawInputs([unmappedCapture]), plan), unmappedDeps, 'autonomous'));
  assert.equal(unmappedItem.status, 'present');
  assert.ok(!Object.hasOwn(JSON.parse(/** @type {string} */ (unmappedItem.text)), 'selectedEntry'), 'tracked unmapped has no selection');
});

test('T004: plan status maps to the exact blocker code', () => {
  const registry = objectiveRegistry([registryEntry(TASK_KEY)]);
  const otherOwner = objectiveRegistry([registryEntry(TASK_KEY)], { ideaPath: IDEA_PATH, specPath: OTHER_SPEC_PATH });
  /** @param {Record<string, unknown>} plan */
  const blockerFor = (plan) => {
    const inspection = buildInspection(TARGET, collectEvidence(TARGET, withDefinitionPlan(rawInputs(), plan), undefined, 'autonomous'));
    return /** @type {Record<string, unknown> | undefined} */ (
      inspection.blockers.find((blocker) => /** @type {Record<string, unknown>} */ (blocker).subject === 'definition-plan')
    )?.code ?? null;
  };
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: planWithRegistry(registry) }), null);
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) }), null);
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: null }), 'evidence-incomplete');
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: Buffer.alloc(FIXED_RESOURCE_LIMITS.sourceBodyBytes + 1, 0x78) }), 'evidence-incomplete');
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: Buffer.from([0xff, 0x00]) }), 'evidence-incomplete');
  assert.equal(blockerFor({ path: `${SPEC_PATH.slice(0, -'spec.md'.length)}other.md`, bytes: planWithRegistry(registry) }), 'objective-source-conflict');
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: Buffer.from(['# Plan', REGISTRY_START, ''].join('\n')) }), 'objective-source-conflict');
  assert.equal(blockerFor({ path: PLAN_PATH, bytes: planWithRegistry(otherOwner) }), 'objective-source-conflict');
});

test('T004: a stale definition-plan fails closed as an evidence-incomplete blocker', () => {
  // The `stale` plan status is emitted only by the workspace plan reader when the
  // file changes identity or size mid-read, so it never reaches the in-memory
  // collectEvidence path the sibling status-mapping test exercises. Assert the
  // blocker mapping directly: a required definition-plan item whose status is
  // `stale` must block as evidence-incomplete — the same fail-closed code as
  // missing, nontext, and overflow — and must never be misrouted to the
  // objective-source-conflict code reserved for the malformed and conflict statuses.
  const inspection = buildInspection(TARGET, [
    evidence('owner-log', 'owner', true),
    evidence('definition-plan', canonicalJson({ path: PLAN_PATH }), true, 'stale'),
  ]);
  const blocker = inspection.blockers.find((entry) => entry.subject === 'definition-plan');
  assert.equal(blocker?.code, 'evidence-incomplete');
});

test('T004: guarded mode is byte-identical to feature-004 and never carries a definition plan', () => {
  const raw = rawInputs();
  const guardedItems = collectEvidence(TARGET, raw);
  assert.deepEqual(collectEvidence(TARGET, raw, undefined, 'guarded'), guardedItems);
  assert.ok(!guardedItems.some((item) => item.source === 'definition-plan'));

  assert.throws(
    () => collectEvidence(TARGET, withDefinitionPlan(raw, { path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) })),
    /forbidden under the guarded policy/,
  );
  assert.throws(() => collectEvidence(TARGET, raw, undefined, 'autonomous'), /required under the autonomous policy/);

  const autoItems = collectEvidence(TARGET, withDefinitionPlan(raw, { path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) }), undefined, 'autonomous');
  assert.equal(autoItems[2].source, 'definition-plan');
  assert.equal(autoItems.length, guardedItems.length + 1);

  const guardedInspection = buildInspection(TARGET, guardedItems);
  const autoInspection = buildInspection(TARGET, autoItems);
  assert.notEqual(guardedInspection.evidenceHash, autoInspection.evidenceHash);
  // The guarded projection is the exact feature-004 baseline, independent of the plan.
  assert.equal(guardedInspection.evidenceHash, buildInspection(TARGET, collectEvidence(TARGET, raw)).evidenceHash);
  assert.deepEqual(guardedInspection.blockers, buildInspection(TARGET, collectEvidence(TARGET, raw)).blockers);
});

test('T004: autonomous source-entry accounting counts the definition plan (64 ok, 65 refused)', () => {
  const plan = { path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) };
  const captures60 = Array.from({ length: 60 }, (_, index) => capture(TARGET, 'failed', [{ index }]));
  assert.doesNotThrow(() => collectEvidence(TARGET, withDefinitionPlan(rawInputs({ currentRun: captures60 }), plan), undefined, 'autonomous'));
  const captures61 = Array.from({ length: 61 }, (_, index) => capture(TARGET, 'failed', [{ index }]));
  assert.throws(
    () => collectEvidence(TARGET, withDefinitionPlan(rawInputs({ currentRun: captures61 }), plan), undefined, 'autonomous'),
    /64 total source entries/,
  );
  // Guarded (no plan) still admits one more source: 61 captures + owner + tasks + lane = 64.
  assert.doesNotThrow(() => collectEvidence(TARGET, rawInputs({ currentRun: captures61 }), undefined, 'guarded'));
});

test('T004: the definition-plan body boundary is charged at 1,048,576 and overflows at 1,048,577', () => {
  const registry = objectiveRegistry([registryEntry(TASK_KEY)]);
  const exact = sizedMarkdown(planWithRegistry(registry), FIXED_RESOURCE_LIMITS.sourceBodyBytes);
  const exactItem = definitionPlanItem(collectEvidence(TARGET, withDefinitionPlan(rawInputs(), { path: PLAN_PATH, bytes: exact }), undefined, 'autonomous'));
  assert.equal(exactItem.status, 'present');
  assert.equal(JSON.parse(/** @type {string} */ (exactItem.text)).planDescriptor.byteLength, FIXED_RESOURCE_LIMITS.sourceBodyBytes);

  const over = Buffer.concat([exact, Buffer.from('x')]);
  const overItem = definitionPlanItem(collectEvidence(TARGET, withDefinitionPlan(rawInputs(), { path: PLAN_PATH, bytes: over }), undefined, 'autonomous'));
  assert.equal(overItem.status, 'overflow');
  assert.ok(!Object.hasOwn(overItem, 'text'));
});

test('T004: the definition-plan body charges against the shared aggregate budget', () => {
  const raw = {
    directIdeas: [
      { path: IDEA_PATH, bytes: sizedMarkdown(ideaBytes(), FIXED_RESOURCE_LIMITS.sourceBodyBytes) },
      { path: '.dude/ideas/filler-1.md', bytes: sizedMarkdown(ideaBytes(), FIXED_RESOURCE_LIMITS.sourceBodyBytes) },
      { path: '.dude/ideas/filler-2.md', bytes: sizedMarkdown(ideaBytes(), FIXED_RESOURCE_LIMITS.sourceBodyBytes) },
    ],
    tasks: { path: TASKS_PATH, bytes: sizedMarkdown(tasksBytes(), FIXED_RESOURCE_LIMITS.sourceBodyBytes) },
    lane: { kind: 'lightweight' },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    definitionPlan: { path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) },
  };
  assert.throws(() => collectEvidence(TARGET, raw, undefined, 'autonomous'), /aggregate inspection body/);
});

test('T004: the definition-plan participates in packet item and byte accounting at position 3', () => {
  const plan = { path: PLAN_PATH, bytes: noRegistryPlanBytes(SPEC_PATH) };
  const ordered = collectEvidence(TARGET, withDefinitionPlan(rawInputs(), plan), undefined, 'autonomous');
  const inspection = buildInspection(TARGET, ordered);
  assert.equal(inspection.items[2].source, 'definition-plan');
  assert.ok(modelPacket(inspection)?.items.some((item) => item.source === 'definition-plan'));

  const planItem = evidence('definition-plan', canonicalJson({ path: PLAN_PATH, present: true }), true);
  const fifteen = Array.from({ length: 15 }, (_, index) => evidence('current-run', `c-${index}`));
  const admitted = buildInspection(TARGET, [planItem, ...fifteen]);
  assert.equal(admitted.overflow, false);
  assert.equal(modelPacket(admitted)?.items.length, 16);
  assert.ok(modelPacket(admitted)?.items.some((item) => item.source === 'definition-plan'));

  const sixteen = Array.from({ length: 16 }, (_, index) => evidence('current-run', `c-${index}`));
  assert.equal(buildInspection(TARGET, [planItem, ...sixteen]).overflow, true);

  const prefix = [evidence('owner-log', 'owner')];
  const boundaryPlan = sizedFinalItem(limits.bytes, prefix, 'definition-plan');
  const atBoundary = buildInspection(TARGET, [...prefix, boundaryPlan]);
  assert.equal(atBoundary.overflow, false);
  assert.equal(Buffer.byteLength(canonicalJson(modelPacket(atBoundary))), 65_536);
  const overPlan = sizedFinalItem(limits.bytes + 1, prefix, 'definition-plan');
  assert.equal(buildInspection(TARGET, [...prefix, overPlan]).overflow, true);
});

/** @param {Buffer} planContent @param {(root: string) => void} run */
function withAutonomousWorkspace(planContent, run) {
  withWorkspace((root) => {
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(path.join(root, TASKS_PATH), transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]));
    fs.writeFileSync(path.join(root, PLAN_PATH), planContent);
    run(root);
  });
}

/** @param {string} root @param {Record<string, unknown>} [overrides] */
function autonomousInspectInput(root, overrides = {}) {
  return {
    root,
    specPath: SPEC_PATH,
    target: TARGET,
    lane: { kind: 'lightweight' },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    policyMode: 'autonomous',
    ...overrides,
  };
}

/** Record every path opened through fs.openSync during run. @param {() => void} run @returns {string[]} */
function recordOpenSync(run) {
  const original = fs.openSync;
  /** @type {string[]} */
  const opened = [];
  // @ts-expect-error test instrumentation of the shared fs singleton
  fs.openSync = (target, ...rest) => {
    opened.push(String(target));
    return original(target, ...rest);
  };
  try {
    run();
  } finally {
    fs.openSync = original;
  }
  return opened;
}

test('T004: guarded acquisition opens no plan.md while autonomous reads it exactly once', () => {
  const runCommand = runtimeFunction('runCommand');
  withAutonomousWorkspace(noRegistryPlanBytes(SPEC_PATH), (root) => {
    const planAbs = path.join(root, PLAN_PATH);

    /** @type {Record<string, unknown>} */
    let guardedInspection = {};
    const guardedOpens = recordOpenSync(() => {
      guardedInspection = inspect(publicInspectionInput(root));
    });
    assert.equal(guardedOpens.filter((opened) => opened === planAbs).length, 0, 'guarded opens no plan.md');
    assert.ok(!(/** @type {Record<string, unknown>[]} */ (guardedInspection.items)).some((item) => item.source === 'definition-plan'));

    /** @type {Record<string, unknown>} */
    let autoInspection = {};
    const autoOpens = recordOpenSync(() => {
      autoInspection = inspect(autonomousInspectInput(root));
    });
    assert.equal(autoOpens.filter((opened) => opened === planAbs).length, 1, 'autonomous reads plan.md once');
    const items = /** @type {Record<string, unknown>[]} */ (autoInspection.items);
    assert.equal(items[2].source, 'definition-plan');
    assert.equal(items.find((item) => item.source === 'definition-plan')?.status, 'present');

    // Authorization reacquires through the same reader: one plan open under autonomous.
    const assessment = { ...transitionAssessment('retry-task'), evidenceHash: autoInspection.evidenceHash };
    const authorizeOpens = recordOpenSync(() => {
      runCommand('authorize', { trigger: 'post-failure', state: autonomousState(), input: autonomousInspectInput(root), assessment, mode: 'recovery' });
    });
    assert.equal(authorizeOpens.filter((opened) => opened === planAbs).length, 1);

    // Guarded evidence is byte-identical whether or not a plan.md exists (feature-004 invariance).
    const withPlan = inspect(publicInspectionInput(root)).evidenceHash;
    fs.rmSync(planAbs);
    const withoutPlan = inspect(publicInspectionInput(root)).evidenceHash;
    assert.equal(withPlan, withoutPlan);
  });
});

test('T004: autonomous acquisition surfaces a missing plan as evidence-incomplete', () => {
  withWorkspace((root) => {
    fs.writeFileSync(path.join(root, IDEA_PATH), ideaBytes());
    fs.writeFileSync(path.join(root, TASKS_PATH), transitionTasksBytes([{ id: TASK_KEY, glyph: '~' }]));
    const inspection = inspect(autonomousInspectInput(root));
    const planItem = /** @type {Record<string, unknown>[]} */ (inspection.items).find((item) => item.source === 'definition-plan');
    assert.equal(planItem?.status, 'missing');
    assert.ok(inspection.blockers.some((blocker) => /** @type {Record<string, unknown>} */ (blocker).subject === 'definition-plan'
      && /** @type {Record<string, unknown>} */ (blocker).code === 'evidence-incomplete'));
  });
});

test('T004: authorize enforces the policy mode and reacquires the plan on every attempt', () => {
  const runCommand = runtimeFunction('runCommand');
  withAutonomousWorkspace(planWithRegistry(objectiveRegistry([registryEntry(TASK_KEY)])), (root) => {
    const state = autonomousState();

    // A present plan authorizes cleanly.
    const inspection = inspect(autonomousInspectInput(root));
    const assessment = { ...transitionAssessment('retry-task'), evidenceHash: inspection.evidenceHash };
    const authorized = runCommand('authorize', { trigger: 'post-failure', state, input: autonomousInspectInput(root), assessment, mode: 'recovery' });
    assert.equal(authorized.authorization.authorized, true);

    // A policy-mode mismatch between the run state and the supplied input rejects.
    assert.throws(
      () => runCommand('authorize', { trigger: 'post-failure', state, input: autonomousInspectInput(root, { policyMode: 'guarded' }), assessment, mode: 'recovery' }),
      /must match the authorizing policy mode/,
    );

    // A changed plan drives fresh evidence drift and leaves the state untouched.
    fs.writeFileSync(path.join(root, PLAN_PATH), planWithRegistry(objectiveRegistry([registryEntry(TASK_KEY, numericContract({ id: 'changed' }))])));
    const drift = runCommand('authorize', { trigger: 'post-failure', state, input: autonomousInspectInput(root), assessment, mode: 'recovery' });
    assert.equal(drift.authorization.authorized, false);
    assert.equal(drift.authorization.reason, 'evidence-drift');
    assert.deepEqual(drift.authorization.state, state);

    // A freshly malformed registry is an objective-source-conflict hard stop.
    fs.writeFileSync(path.join(root, PLAN_PATH), Buffer.from(['# Plan', REGISTRY_START, ''].join('\n')));
    const malformedInspection = inspect(autonomousInspectInput(root));
    const malformedAssessment = { ...transitionAssessment('retry-task'), evidenceHash: malformedInspection.evidenceHash };
    const conflict = runCommand('authorize', { trigger: 'post-failure', state, input: autonomousInspectInput(root), assessment: malformedAssessment, mode: 'recovery' });
    assert.equal(conflict.authorization.authorized, false);
    assert.equal(conflict.authorization.reason, 'objective-source-conflict');
    assert.deepEqual(conflict.authorization.state, state);
  });
});

test('T004: acquisition rejects an invalid policyMode enum value', () => {
  withAutonomousWorkspace(noRegistryPlanBytes(SPEC_PATH), (root) => {
    assert.throws(() => inspect(autonomousInspectInput(root, { policyMode: 'bogus' })), /must be one of/);
  });
});

test('T004: feature 005 plan.md keeps zero active objective-registry regions', () => {
  const planPath = fileURLToPath(new URL('../../../.dude/specs/005-autonomous-work-modes/plan.md', import.meta.url));
  assert.deepEqual(scanObjectiveRegistry(fs.readFileSync(planPath, 'utf8')), { status: 'none' });
});

// --- T005: bounded objective evaluation machinery ----------------------------

/** @param {Record<string, unknown>} [overrides] */
function candidateWriteSet(overrides = {}) {
  return { candidatePaths: ['src/a.mjs'], protectedPaths: ['src/a.test.mjs'], ...overrides };
}

/** @param {Record<string, string|null>} states */
function fileDescriptors(states) {
  return Object.entries(states)
    .map(([path, content]) => (content === null
      ? { path, state: 'missing' }
      : { path, state: 'file', ...contentDescriptor(Buffer.from(content)) }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
}

/** @param {Record<string, unknown>} [contract] @param {string} [taskKey] */
function objectivePlanBody(contract = numericContract(), taskKey = TASK_KEY) {
  const registry = objectiveRegistry([registryEntry(taskKey, contract)]);
  return {
    path: PLAN_PATH,
    planDescriptor: contentDescriptor(planWithRegistry(registry)),
    ownerBindingHash: sha256(canonicalJson({ ideaPath: IDEA_PATH, specPath: SPEC_PATH, planPath: PLAN_PATH })),
    registryHash: sha256(canonicalJson(registry)),
    selectedEntry: registryEntry(taskKey, contract),
    contractHash: sha256(canonicalJson(contract)),
  };
}

/**
 * In-memory checkpoint host over `Map<path, {state}|{state,bytes}>` with fault
 * injection (classify/failCapture/failRestore/failRelease) and the shared
 * 1,048,576-byte per-file and 4,194,304-byte aggregate caps. It exercises
 * preflight/capture/restore/release entirely without touching the filesystem.
 * @param {Record<string, string|null>} [initialFiles]
 * @param {Record<string, unknown>} [faults]
 */
function checkpointHostFake(initialFiles = {}, faults = {}) {
  /** @type {Map<string, {state:'missing'}|{state:'file',bytes:Buffer}>} */
  const files = new Map();
  for (const [path, content] of Object.entries(initialFiles)) {
    files.set(path, content === null ? { state: 'missing' } : { state: 'file', bytes: Buffer.from(content) });
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  /** @type {Record<string, unknown>|null} */
  let pending = null;
  const union = (writeSet) => [...writeSet.candidatePaths, ...writeSet.protectedPaths]
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const readCapture = (writeSet) => {
    let aggregate = 0;
    const descriptors = [];
    const bytesByPath = new Map();
    for (const path of union(writeSet)) {
      const entry = files.get(path) || { state: 'missing' };
      if (entry.state === 'missing') {
        descriptors.push({ path, state: 'missing' });
      } else {
        if (entry.bytes.byteLength > 1_048_576) throw new Error('file exceeds 1,048,576 bytes');
        aggregate += entry.bytes.byteLength;
        if (aggregate > 4_194_304) throw new Error('capture exceeds 4,194,304 aggregate bytes');
        descriptors.push({ path, state: 'file', sha256: sha256(entry.bytes), byteLength: entry.bytes.byteLength });
        bytesByPath.set(path, Buffer.from(entry.bytes));
      }
    }
    return { descriptors, bytesByPath };
  };
  return {
    preflight(writeSet) {
      for (const path of union(writeSet)) {
        const classification = typeof faults.classify === 'function' ? faults.classify(path) : null;
        if (classification) throw new TypeError(`checkpoint preflight refuses ${classification} path ${path}`);
      }
    },
    open(writeSet) {
      if (faults.failCapture) throw new Error('prestate capture failed');
      const captured = readCapture(writeSet);
      pending = { ...captured, writeSet };
      return captured.descriptors;
    },
    probe(id) {
      if (faults.failCapture) throw new Error('probe capture failed');
      const context = map.get(id);
      if (!context) throw new Error('probe requires an open context');
      return readCapture(context.writeSet).descriptors;
    },
    get(id) {
      const context = map.get(id);
      if (!context) return undefined;
      const view = { phase: context.phase, prestate: context.prestate.descriptors };
      if (Object.hasOwn(context, 'poststateIdentity')) view.poststateIdentity = context.poststateIdentity;
      if (Object.hasOwn(context, 'candidateIdentity')) view.candidateIdentity = context.candidateIdentity;
      return view;
    },
    setPhase(id, phase) {
      const context = map.get(id);
      if (context) { context.phase = phase; return; }
      if (!pending) throw new Error('setPhase requires an open capture to commit');
      map.set(id, { phase, prestate: pending, writeSet: pending.writeSet });
      pending = null;
    },
    markPoststate(id, poststateIdentity, candidateIdentity) {
      const context = map.get(id);
      if (!context) throw new Error('markPoststate requires a context');
      context.poststateIdentity = poststateIdentity;
      context.candidateIdentity = candidateIdentity;
    },
    restore(id) {
      if (faults.failRestore) throw new Error('restore failed');
      const context = map.get(id);
      if (!context) throw new Error('restore requires a context');
      for (const descriptor of context.prestate.descriptors) {
        if (descriptor.state === 'missing') files.set(descriptor.path, { state: 'missing' });
        else files.set(descriptor.path, { state: 'file', bytes: Buffer.from(context.prestate.bytesByPath.get(descriptor.path)) });
      }
    },
    release(id) {
      if (faults.failRelease) throw new Error('release failed');
      map.delete(id);
    },
    _setFile(path, content) {
      files.set(path, content === null ? { state: 'missing' } : { state: 'file', bytes: Buffer.from(content) });
    },
    _files: files,
    _map: map,
    faults,
  };
}

/**
 * Run a full acquire→mutate→capture cycle and return the captured, candidate,
 * and host artifacts for downstream assertions.
 * @param {Record<string, unknown>} [options]
 */
function acquiredCandidate(options = {}) {
  const writeSet = options.writeSet || candidateWriteSet();
  const sequenceIdentity = options.sequenceIdentity || '1'.repeat(64);
  const contractHash = options.contractHash || '2'.repeat(64);
  const host = options.host || checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' });
  const captured = acquireCheckpoint(host, { target: TARGET, sequenceIdentity, contractHash, candidateWriteSet: writeSet });
  host._setFile('src/a.mjs', options.candidateContent || 'poststate');
  const candidate = captureCandidate(host, captured, writeSet);
  return { host, writeSet, captured, candidate, sequenceIdentity, contractHash };
}

test('T005a: identity derivations are deterministic and acyclically ordered', () => {
  const writeSet = candidateWriteSet();
  const wsId = writeSetIdentity(writeSet);
  assert.equal(wsId, writeSetIdentity(candidateWriteSet()));

  const initial = fileDescriptors({ 'src/a.mjs': 'v1', 'src/a.test.mjs': 't' });
  const bootstrap = stateIdentity(wsId, initial);
  assert.equal(bootstrap, stateIdentity(wsId, fileDescriptors({ 'src/a.mjs': 'v1', 'src/a.test.mjs': 't' })));
  assert.equal(bootstrap, sha256(canonicalJson({ writeSetIdentity: wsId, files: initial })));

  const contract = numericContract();
  const contractHash = sha256(canonicalJson(contract));
  const body = objectivePlanBody(contract);
  const bindingIdentity = deriveBindingIdentity({
    ownerBindingHash: body.ownerBindingHash, planDescriptor: body.planDescriptor, registryHash: body.registryHash, contract,
  });
  const sequenceArgs = {
    target: TARGET, taskKey: TASK_KEY, ownerBindingHash: body.ownerBindingHash, planDescriptor: body.planDescriptor,
    registryHash: body.registryHash, contractHash, bindingIdentity, baselineCandidateIdentity: bootstrap,
  };
  const sequenceIdentity = deriveSequenceIdentity(sequenceArgs);
  assert.equal(sequenceIdentity, deriveSequenceIdentity(sequenceArgs));

  const checkpointIdentity = deriveCheckpointIdentity({
    target: TARGET, sequenceIdentity, contractHash, writeSetIdentity: wsId, prestateIdentity: bootstrap,
  });
  assert.equal(checkpointIdentity, deriveCheckpointIdentity({
    target: TARGET, sequenceIdentity, contractHash, writeSetIdentity: wsId, prestateIdentity: bootstrap,
  }));

  const post1 = stateIdentity(wsId, fileDescriptors({ 'src/a.mjs': 'v2', 'src/a.test.mjs': 't' }));
  const post2 = stateIdentity(wsId, fileDescriptors({ 'src/a.mjs': 'v3', 'src/a.test.mjs': 't' }));
  const candidate1 = deriveCandidateIdentity(checkpointIdentity, post1);
  const candidate2 = deriveCandidateIdentity(checkpointIdentity, post2);
  assert.notEqual(candidate1, candidate2);
  assert.equal(candidate1, sha256(canonicalJson({ checkpointIdentity, poststateIdentity: post1 })));
  // Distinct candidate poststates never perturb the earlier checkpoint or sequence identity.
  assert.equal(deriveCheckpointIdentity({ target: TARGET, sequenceIdentity, contractHash, writeSetIdentity: wsId, prestateIdentity: bootstrap }), checkpointIdentity);
  assert.equal(deriveSequenceIdentity(sequenceArgs), sequenceIdentity);
});

test('T005a: rubricHash follows A1 for rubric-bearing and rubric-free contracts', () => {
  const numericBinding = deriveBindingIdentity({
    ownerBindingHash: '3'.repeat(64), planDescriptor: contentDescriptor('plan'), registryHash: '4'.repeat(64), contract: numericContract(),
  });
  // A rubric on the tie rule must change the derived binding identity.
  const tieRubric = numericContract({
    tieRule: { mode: 'independent-review', purpose: 'simplicity', rubric: { id: 'r', criteria: [{ id: 'c1', text: 'simpler' }] } },
  });
  const tieBinding = deriveBindingIdentity({
    ownerBindingHash: '3'.repeat(64), planDescriptor: contentDescriptor('plan'), registryHash: '4'.repeat(64), contract: tieRubric,
  });
  assert.notEqual(numericBinding, tieBinding);
  assert.equal(numericBinding, deriveBindingIdentity({
    ownerBindingHash: '3'.repeat(64), planDescriptor: contentDescriptor('plan'), registryHash: '4'.repeat(64), contract: numericContract(),
  }));
});

test('T005a: validateCandidateWriteSet enforces disjoint sorted-unique bounded paths', () => {
  assert.doesNotThrow(() => validateCandidateWriteSet(candidateWriteSet()));
  assert.doesNotThrow(() => validateCandidateWriteSet({ candidatePaths: ['src/a.mjs'], protectedPaths: [] }));
  assert.throws(() => validateCandidateWriteSet({ candidatePaths: [], protectedPaths: [] }), /at least one path/);
  assert.throws(() => validateCandidateWriteSet({ candidatePaths: ['src/a.mjs'], protectedPaths: ['src/a.mjs'] }), /disjoint/);
  assert.throws(() => validateCandidateWriteSet({ candidatePaths: ['src/b.mjs', 'src/a.mjs'], protectedPaths: [] }), /sorted/);
  assert.throws(() => validateCandidateWriteSet({ candidatePaths: ['../escape.mjs'], protectedPaths: [] }), /dot-dot/);
  assert.throws(() => validateCandidateWriteSet({ candidatePaths: ['src/a.mjs'], protectedPaths: [], extra: 1 }), /unknown field/);
  const overSized = Array.from({ length: 65 }, (_, index) => `src/f${String(index).padStart(3, '0')}.mjs`);
  assert.throws(() => validateCandidateWriteSet({ candidatePaths: overSized, protectedPaths: [] }), /at most 64/);
});

test('T005a: validateFileStateDescriptors covers the union exactly with bounded bytes', () => {
  const writeSet = candidateWriteSet();
  assert.doesNotThrow(() => validateFileStateDescriptors(fileDescriptors({ 'src/a.mjs': 'x', 'src/a.test.mjs': 'y' }), writeSet));
  assert.doesNotThrow(() => validateFileStateDescriptors(fileDescriptors({ 'src/a.mjs': null, 'src/a.test.mjs': 'y' }), writeSet));
  assert.throws(() => validateFileStateDescriptors(fileDescriptors({ 'src/a.mjs': 'x' }), writeSet), /cover the complete write-set union/);
  assert.throws(() => validateFileStateDescriptors(fileDescriptors({ 'src/a.mjs': 'x', 'src/a.test.mjs': 'y', 'src/z.mjs': 'z' }), writeSet), /write-set union/);
  assert.throws(() => validateFileStateDescriptors([
    { path: 'src/a.test.mjs', state: 'file', ...contentDescriptor(Buffer.from('y')) },
    { path: 'src/a.mjs', state: 'file', ...contentDescriptor(Buffer.from('x')) },
  ], writeSet), /sorted by path/);
  assert.throws(() => validateFileStateDescriptors([
    { path: 'src/a.mjs', state: 'file', sha256: '0'.repeat(64), byteLength: 1_048_577 },
    { path: 'src/a.test.mjs', state: 'file', ...contentDescriptor(Buffer.from('y')) },
  ], writeSet), /at most 1048576/);
  assert.throws(() => validateFileStateDescriptors([
    { path: 'src/a.mjs', state: 'missing', sha256: '0'.repeat(64) },
    { path: 'src/a.test.mjs', state: 'missing' },
  ], writeSet), /unknown field/);
  const bigWriteSet = { candidatePaths: ['src/f0.mjs', 'src/f1.mjs', 'src/f2.mjs', 'src/f3.mjs', 'src/f4.mjs'], protectedPaths: [] };
  const bigDescriptors = bigWriteSet.candidatePaths
    .map((path) => ({ path, state: 'file', sha256: '0'.repeat(64), byteLength: 1_048_576 }));
  assert.throws(() => validateFileStateDescriptors(bigDescriptors, bigWriteSet), /aggregate/);
});

test('T005b: createEvaluationSequence opens a self-consistent baseline row', () => {
  const writeSet = candidateWriteSet();
  const contract = numericContract();
  const initial = fileDescriptors({ 'src/a.mjs': 'v1', 'src/a.test.mjs': 't' });
  const row = createEvaluationSequence(TARGET, objectivePlanBody(contract), contract, writeSet, initial);
  assert.equal(row.state, 'open');
  assert.deepEqual(row.recentComparisons, []);
  assert.equal(row.baselineCandidateIdentity, row.incumbentCandidateIdentity);
  assert.equal(row.baselineCandidateIdentity, stateIdentity(writeSetIdentity(writeSet), initial));
  assert.ok(!Object.hasOwn(row, 'activeCheckpointIdentity'));
  assert.ok(!Object.hasOwn(row, 'activeCandidateIdentity'));
  assert.doesNotThrow(() => validateEvaluationSequences([row]));
  assert.doesNotThrow(() => validateRunState({ ...emptyState(), evaluationSequences: [row] }));
  // A different contract yields a distinct sequence and binding but the same
  // fixed evaluated-state bootstrap baseline (baseline is state-derived, not
  // contract-derived, and references no prior sequence).
  const otherContract = numericContract({ id: 'obj-other' });
  const otherRow = createEvaluationSequence(TARGET, objectivePlanBody(otherContract), otherContract, writeSet, initial);
  assert.notEqual(otherRow.sequenceIdentity, row.sequenceIdentity);
  assert.notEqual(otherRow.contractHash, row.contractHash);
  assert.equal(otherRow.baselineCandidateIdentity, row.baselineCandidateIdentity);
  // The body must carry a selected entry whose contract matches the frozen one.
  assert.throws(() => createEvaluationSequence(TARGET, { path: PLAN_PATH, planDescriptor: contentDescriptor('p'), ownerBindingHash: '1'.repeat(64), registryHash: '2'.repeat(64) }, contract, writeSet, initial), /selected entry and contract hash/);
});

test('T005b: validateEvaluationSequences enforces bounds, sorting, and self-consistency', () => {
  const writeSet = candidateWriteSet();
  const contract = numericContract();
  const initial = fileDescriptors({ 'src/a.mjs': 'v1', 'src/a.test.mjs': 't' });
  const row = createEvaluationSequence(TARGET, objectivePlanBody(contract), contract, writeSet, initial);
  assert.doesNotThrow(() => validateEvaluationSequences([row]));
  // Absent optional arrays resolve to empty.
  assert.doesNotThrow(() => validateRunState(emptyState()));
  assert.throws(() => validateEvaluationSequences([{ ...row, sequenceIdentity: '0'.repeat(64) }]), /recomputed sequence identity/);
  assert.throws(() => validateEvaluationSequences([row, row]), /sorted and unique/);
  assert.throws(() => validateEvaluationSequences(Array.from({ length: 17 }, () => row)), /at most 16 rows/);
  assert.throws(() => validateEvaluationSequences([{ ...row, unknown: true }]), /unknown field/);
  // Active checkpoint/candidate identities: both-or-neither, closing forbids, unsettled requires.
  assert.throws(() => validateEvaluationSequences([{ ...row, activeCheckpointIdentity: '5'.repeat(64) }]), /both be absent or both present/);
  assert.throws(() => validateEvaluationSequences([{ ...row, state: 'closing', activeCheckpointIdentity: '5'.repeat(64), activeCandidateIdentity: '6'.repeat(64) }]), /closing sequence forbids/);
  assert.throws(() => validateEvaluationSequences([{ ...row, state: 'unsettled' }]), /unsettled sequence requires/);
  assert.doesNotThrow(() => validateEvaluationSequences([{ ...row, state: 'unsettled', activeCheckpointIdentity: '5'.repeat(64), activeCandidateIdentity: '6'.repeat(64) }]));
});

test('T005b: recentComparisons ordinals strictly increase and totals stay bounded', () => {
  const writeSet = candidateWriteSet();
  const contract = numericContract();
  const initial = fileDescriptors({ 'src/a.mjs': 'v1', 'src/a.test.mjs': 't' });
  const base = createEvaluationSequence(TARGET, objectivePlanBody(contract), contract, writeSet, initial);
  const projRef = (ordinal) => ({
    ordinal,
    comparisonIdentity: sha256(`c${ordinal}`),
    eventHash: sha256(`e${ordinal}`),
    currentRunProjectionIdentity: sha256(`r${ordinal}`),
    laneProjectionIdentity: sha256(`l${ordinal}`),
  });
  assert.doesNotThrow(() => validateEvaluationSequences([{ ...base, recentComparisons: [projRef(1), projRef(2)] }]));
  assert.throws(() => validateEvaluationSequences([{ ...base, recentComparisons: [projRef(2), projRef(2)] }]), /strictly increase/);
  assert.throws(() => validateEvaluationSequences([{ ...base, recentComparisons: Array.from({ length: 9 }, (_, index) => projRef(index + 1)) }]), /at most 8 rows/);
  // Nine sequences of eight refs each exceed the 64 total-comparison budget.
  const overBudget = Array.from({ length: 9 }, (_, index) => {
    const contractN = numericContract({ id: `obj-${index}` });
    const sequence = createEvaluationSequence(TARGET, objectivePlanBody(contractN), contractN, writeSet, initial);
    return { ...sequence, recentComparisons: Array.from({ length: 8 }, (_, refIndex) => projRef(refIndex + 1)) };
  }).sort((left, right) => Buffer.compare(Buffer.from(left.sequenceIdentity), Buffer.from(right.sequenceIdentity)));
  assert.throws(() => validateEvaluationSequences(overBudget), /at most 64 comparison references/);
});

test('T005b: validateLearningReviewRefs enforces bounds, sorting, and canonical targets', () => {
  const ref = {
    reviewIdentity: '1'.repeat(64),
    target: canonicalTarget(TARGET),
    eventHash: '2'.repeat(64),
    currentRunProjectionIdentity: '3'.repeat(64),
    laneProjectionIdentity: '4'.repeat(64),
  };
  assert.doesNotThrow(() => validateLearningReviewRefs([ref]));
  assert.doesNotThrow(() => validateRunState({ ...emptyState(), learningReviewRefs: [ref] }));
  assert.throws(() => validateLearningReviewRefs([ref, ref]), /sorted and unique/);
  assert.throws(() => validateLearningReviewRefs(Array.from({ length: 17 }, () => ref)), /at most 16 rows/);
  assert.throws(() => validateLearningReviewRefs([{ ...ref, extra: 1 }]), /unknown field/);
  assert.throws(() => validateLearningReviewRefs([{ ...ref, target: { ...canonicalTarget(TARGET), lane: 'tracked' } }]), /Target|canonical target identity/);
});

test('T005c: validateCheckpointHost requires every host method to be a function', () => {
  const host = checkpointHostFake();
  assert.doesNotThrow(() => validateCheckpointHost(host));
  for (const method of ['preflight', 'open', 'probe', 'get', 'setPhase', 'markPoststate', 'restore', 'release']) {
    assert.throws(() => validateCheckpointHost({ ...host, [method]: 'nope' }), new RegExp(`${method} must be a function`));
  }
});

test('T005c: acquireCheckpoint refuses unsupported effects before any capture or mutation', () => {
  const host = checkpointHostFake(
    { 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' },
    { classify: (path) => (path === 'src/a.mjs' ? 'directory' : null) },
  );
  assert.throws(
    () => acquireCheckpoint(host, { target: TARGET, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), candidateWriteSet: candidateWriteSet() }),
    /preflight refuses directory/,
  );
  assert.equal(host._map.size, 0);
  assert.equal(host._files.get('src/a.mjs').bytes.toString(), 'prestate');
});

test('T005c: a prestate capture failure inserts no complete context', () => {
  const host = checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' }, { failCapture: true });
  assert.throws(
    () => acquireCheckpoint(host, { target: TARGET, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), candidateWriteSet: candidateWriteSet() }),
    /prestate capture failed/,
  );
  assert.equal(host._map.size, 0);
});

test('T005c: acquire and capture derive captured then candidate records', () => {
  const { host, captured, candidate, sequenceIdentity, contractHash, writeSet } = acquiredCandidate();
  const wsId = writeSetIdentity(writeSet);
  assert.equal(captured.phase, 'captured');
  assert.equal(captured.writeSetIdentity, wsId);
  assert.equal(captured.sequenceIdentity, sequenceIdentity);
  assert.equal(captured.contractHash, contractHash);
  assert.equal(captured.checkpointIdentity, deriveCheckpointIdentity({ target: TARGET, sequenceIdentity, contractHash, writeSetIdentity: wsId, prestateIdentity: captured.prestateIdentity }));
  assert.ok(!Object.hasOwn(captured, 'poststateIdentity'));
  assert.equal(host.get(captured.checkpointIdentity).phase, 'candidate');
  assert.equal(candidate.phase, 'candidate');
  assert.equal(candidate.candidateIdentity, deriveCandidateIdentity(captured.checkpointIdentity, candidate.poststateIdentity));
  assert.notEqual(candidate.poststateIdentity, captured.prestateIdentity);
});

test('T005c: validateCheckpointRecord binds value identities to the phase', () => {
  const { captured, candidate } = acquiredCandidate();
  assert.doesNotThrow(() => validateCheckpointRecord(captured));
  assert.doesNotThrow(() => validateCheckpointRecord(candidate));
  assert.throws(() => validateCheckpointRecord({ ...captured, poststateIdentity: '9'.repeat(64), candidateIdentity: '8'.repeat(64) }), /unknown field/);
  assert.throws(() => validateCheckpointRecord({ ...candidate, poststateIdentity: undefined }), /poststateIdentity/);
  assert.throws(() => validateCheckpointRecord({ ...captured, phase: 'bogus' }), /phase must be one of/);
});

test('T005d: releaseCheckpoint is gated on the host phase', () => {
  const writeSet = candidateWriteSet();
  {
    const host = checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' });
    const captured = acquireCheckpoint(host, { target: TARGET, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), candidateWriteSet: writeSet });
    assert.equal(releaseCheckpoint(host, captured, writeSet).phase, 'captured');
    assert.equal(host._map.size, 0);
  }
  {
    const host = checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' });
    const captured = acquireCheckpoint(host, { target: TARGET, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), candidateWriteSet: writeSet });
    host._setFile('src/a.mjs', 'changed');
    assert.throws(() => releaseCheckpoint(host, captured, writeSet), /must be restored before release/);
    assert.equal(host._map.size, 1);
  }
  {
    const { host, candidate, writeSet: ws } = acquiredCandidate();
    assert.throws(() => releaseCheckpoint(host, candidate, ws), /pending or unsettled context is never released/);
  }
  {
    const { host, candidate, writeSet: ws } = acquiredCandidate();
    host.setPhase(candidate.checkpointIdentity, 'restoring');
    assert.throws(() => releaseCheckpoint(host, candidate, ws), /pending or unsettled context is never released/);
  }
  {
    const { host, candidate, writeSet: ws } = acquiredCandidate();
    const kept = keepCheckpoint(host, candidate, ws);
    assert.equal(kept.phase, 'kept');
    assert.equal(releaseCheckpoint(host, kept, ws).phase, 'kept');
    assert.equal(host._map.size, 0);
  }
  {
    const { host, candidate, writeSet: ws } = acquiredCandidate();
    const restored = restoreCheckpoint(host, candidate, ws);
    assert.equal(restored.phase, 'restored');
    assert.equal(releaseCheckpoint(host, restored, ws).phase, 'restored');
    assert.equal(host._map.size, 0);
  }
});

test('T005d: restoreCheckpoint proves the exact prestate and marks restored', () => {
  const { host, candidate, writeSet } = acquiredCandidate();
  assert.equal(host._files.get('src/a.mjs').bytes.toString(), 'poststate');
  const restored = restoreCheckpoint(host, candidate, writeSet);
  assert.equal(restored.phase, 'restored');
  assert.equal(host._files.get('src/a.mjs').bytes.toString(), 'prestate');
  assert.ok(!Object.hasOwn(restored, 'poststateIdentity'));
  assert.equal(host.get(candidate.checkpointIdentity).phase, 'restored');
});

test('T005d: restore, keep, and release faults retain the context as unsettled', () => {
  {
    const { host, candidate, writeSet } = acquiredCandidate();
    host.faults.failRestore = true;
    const settled = restoreCheckpoint(host, candidate, writeSet);
    assert.equal(settled.phase, 'unsettled');
    assert.equal(host.get(candidate.checkpointIdentity).phase, 'unsettled');
    assert.equal(host._map.size, 1);
  }
  {
    const { host, candidate, writeSet } = acquiredCandidate();
    host._setFile('src/a.mjs', 'drifted');
    const settled = keepCheckpoint(host, candidate, writeSet);
    assert.equal(settled.phase, 'unsettled');
    assert.equal(host.get(candidate.checkpointIdentity).phase, 'unsettled');
  }
  {
    const { host, candidate, writeSet } = acquiredCandidate();
    const kept = keepCheckpoint(host, candidate, writeSet);
    host.faults.failRelease = true;
    assert.throws(() => releaseCheckpoint(host, kept, writeSet), /retained as unsettled/);
    assert.equal(host.get(kept.checkpointIdentity).phase, 'unsettled');
    assert.equal(host._map.size, 1);
  }
});

/** @param {string} role @param {string[]} samples @param {Record<string, unknown>} [overrides] */
function numericObservation(role, samples, overrides = {}) {
  const merged = {
    role,
    target: canonicalTarget(TARGET),
    candidateIdentity: sha256(`cand-${role}`),
    contractHash: sha256(canonicalJson(numericContract())),
    kind: 'numeric',
    status: 'ok',
    evaluatorIdentity: '1'.repeat(64),
    inputIdentity: '2'.repeat(64),
    environmentIdentity: '3'.repeat(64),
    conditionIdentity: '4'.repeat(64),
    rubricHash: '5'.repeat(64),
    budgetIdentity: '6'.repeat(64),
    value: { mode: 'numeric', samples },
    ...overrides,
  };
  if (merged.status !== 'ok') delete merged.value;
  return merged;
}

test('T005e: numeric comparator derives threshold relations with exact scaled integers', () => {
  const contract = numericContract();
  const seqId = '1'.repeat(64);
  const cpId = '2'.repeat(64);
  const binding = '7'.repeat(64);
  const decide = (incumbentSamples, candidateSamples, overrides = {}) => deriveComparisonDecision({
    observations: [
      numericObservation('baseline', incumbentSamples),
      numericObservation('incumbent', incumbentSamples),
      numericObservation('candidate', candidateSamples, overrides.candidate),
    ],
    contract,
    sequenceIdentity: seqId,
    checkpointIdentity: cpId,
    activeBindingIdentity: binding,
    freshBindingIdentity: overrides.fresh || binding,
  });
  // minimize: a lower candidate median is better.
  assert.equal(decide(['10', '10', '10', '10', '10'], ['8', '8', '8', '8', '8']).relation, 'better');
  assert.equal(decide(['10', '10', '10', '10', '10'], ['12', '12', '12', '12', '12']).relation, 'worse');
  assert.equal(decide(['10', '10', '10', '10', '10'], ['10.3', '10.3', '10.3', '10.3', '10.3']).relation, 'equivalent');
  assert.equal(decide(['10', '10', '10', '10', '10'], ['9.2', '9.2', '9.2', '9.2', '9.2']).relation, 'incomparable');
  // boundaries: exactly tolerance ⇒ equivalent; exactly meaningfulThreshold ⇒ better.
  assert.equal(decide(['10', '10', '10', '10', '10'], ['9.5', '9.5', '9.5', '9.5', '9.5']).relation, 'equivalent');
  assert.equal(decide(['10', '10', '10', '10', '10'], ['8.5', '8.5', '8.5', '8.5', '8.5']).relation, 'better');
  // 18-fractional-digit precision beyond IEEE-754 safety stays exact.
  const precise = decide(
    Array(5).fill('1.000000000000000002'),
    Array(5).fill('1.000000000000000001'),
  );
  assert.equal(precise.relation, 'equivalent');
  assert.equal(precise.reason, 'numeric-threshold');
  assert.deepEqual(precise.judgmentIdentities, []);
  // median is the middle of the sorted samples, ignoring an outlier.
  assert.equal(decide(['10', '10', '10', '10', '10'], ['20', '8', '8', '8', '8']).relation, 'better');
  // maximize: a higher candidate median is better.
  const maximize = numericContract({ comparator: { mode: 'numeric', unit: 'ms', direction: 'maximize', sampleCount: 5, aggregation: 'median', tolerance: '0.5', meaningfulThreshold: '1.5' } });
  const maxHash = sha256(canonicalJson(maximize));
  const maxObs = (role, samples) => ({ ...numericObservation(role, samples), contractHash: maxHash });
  assert.equal(deriveComparisonDecision({
    observations: [maxObs('baseline', ['10', '10', '10', '10', '10']), maxObs('incumbent', ['10', '10', '10', '10', '10']), maxObs('candidate', ['12', '12', '12', '12', '12'])],
    contract: maximize, sequenceIdentity: seqId, checkpointIdentity: cpId, activeBindingIdentity: binding, freshBindingIdentity: binding,
  }).relation, 'better');
});

test('T005e: comparison is incomparable for a not-ok observation or binding drift', () => {
  const contract = numericContract();
  const binding = '7'.repeat(64);
  const base = (overrides) => deriveComparisonDecision({
    observations: [
      numericObservation('baseline', ['10', '10', '10', '10', '10']),
      numericObservation('incumbent', ['10', '10', '10', '10', '10']),
      numericObservation('candidate', ['8', '8', '8', '8', '8'], overrides.candidate),
    ],
    contract,
    sequenceIdentity: '1'.repeat(64),
    checkpointIdentity: '2'.repeat(64),
    activeBindingIdentity: binding,
    freshBindingIdentity: overrides.fresh || binding,
  });
  const notOk = base({ candidate: { status: 'crash' } });
  assert.equal(notOk.relation, 'incomparable');
  assert.equal(notOk.reason, 'observation-not-ok');
  const drift = base({ fresh: '9'.repeat(64) });
  assert.equal(drift.relation, 'incomparable');
  assert.equal(drift.reason, 'binding-drift');
  const componentDrift = base({ candidate: { evaluatorIdentity: 'a'.repeat(64) } });
  assert.equal(componentDrift.reason, 'binding-drift');
});

test('T005e: ordinal-levels comparator derives relations from index moves', () => {
  const contract = numericContract({ kind: 'ordinal', comparator: { mode: 'ordinal-levels', levels: ['bad', 'ok', 'good', 'great'], meaningfulSteps: 2 } });
  const contractHash = sha256(canonicalJson(contract));
  const ordinalObservation = (role, level) => ({
    role, target: canonicalTarget(TARGET), candidateIdentity: sha256(`o-${role}`), contractHash,
    kind: 'ordinal', status: 'ok', evaluatorIdentity: '1'.repeat(64), inputIdentity: '2'.repeat(64),
    environmentIdentity: '3'.repeat(64), conditionIdentity: '4'.repeat(64), rubricHash: '5'.repeat(64),
    budgetIdentity: '6'.repeat(64), value: { mode: 'ordinal-level', level },
  });
  const decide = (incLevel, candLevel) => deriveComparisonDecision({
    observations: [ordinalObservation('baseline', incLevel), ordinalObservation('incumbent', incLevel), ordinalObservation('candidate', candLevel)],
    contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: '7'.repeat(64), freshBindingIdentity: '7'.repeat(64),
  });
  assert.equal(decide('ok', 'great').relation, 'better');
  assert.equal(decide('great', 'ok').relation, 'worse');
  assert.equal(decide('ok', 'ok').relation, 'equivalent');
  assert.equal(decide('ok', 'good').relation, 'incomparable');
  assert.equal(decide('ok', 'great').reason, 'ordinal-levels');
});

test('T005e: pairwise and subjective comparators require unanimous sorted judgments', () => {
  const contract = numericContract({
    kind: 'subjective',
    evaluators: [{ id: 'ann', version: 'v1' }, { id: 'bob', version: 'v1' }],
    comparator: { mode: 'subjective', rubric: { id: 'r', criteria: [{ id: 'c1', text: 'clarity' }] } },
  });
  const contractHash = sha256(canonicalJson(contract));
  const artifactObs = (role) => ({
    role, target: canonicalTarget(TARGET), candidateIdentity: sha256(`s-${role}`), contractHash,
    kind: 'subjective', status: 'ok', evaluatorIdentity: '1'.repeat(64), inputIdentity: '2'.repeat(64),
    environmentIdentity: '3'.repeat(64), conditionIdentity: '4'.repeat(64), rubricHash: '5'.repeat(64),
    budgetIdentity: '6'.repeat(64), value: { mode: 'artifact', artifactHash: sha256(`art-${role}`) },
  });
  const judgment = (id, relation) => ({
    evaluator: { id, version: 'v1' }, target: canonicalTarget(TARGET), contractHash,
    baselineObservationIdentity: '1'.repeat(64), incumbentObservationIdentity: '2'.repeat(64),
    candidateObservationIdentity: '3'.repeat(64), relation,
  });
  const decide = (relAnn, relBob) => deriveComparisonDecision({
    observations: [artifactObs('baseline'), artifactObs('incumbent'), artifactObs('candidate')],
    contract,
    judgments: [judgment('ann', relAnn), judgment('bob', relBob)]
      .sort((left, right) => Buffer.compare(Buffer.from(sha256(canonicalJson(left.evaluator))), Buffer.from(sha256(canonicalJson(right.evaluator))))),
    sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: '7'.repeat(64), freshBindingIdentity: '7'.repeat(64),
  });
  assert.equal(decide('better', 'better').relation, 'better');
  assert.equal(decide('better', 'better').reason, 'unanimous-rubric');
  assert.equal(decide('better', 'worse').relation, 'incomparable');
  assert.equal(decide('better', 'worse').reason, 'evaluator-disagreement');
  assert.equal(decide('equivalent', 'incomparable').relation, 'incomparable');
  assert.equal(decide('better', 'better').judgmentIdentities.length, 2);
});

test('T005e: observation and judgment validators bind values and evaluators to the contract', () => {
  const contract = numericContract();
  assert.doesNotThrow(() => validateObjectiveObservation(numericObservation('candidate', ['1', '1', '1', '1', '1']), contract));
  const okNoValue = numericObservation('candidate', ['1', '1', '1', '1', '1']);
  delete okNoValue.value;
  assert.throws(() => validateObjectiveObservation(okNoValue, contract), /value is required/);
  assert.throws(() => validateObjectiveObservation(numericObservation('candidate', ['1', '1', '1']), contract), /frozen sample count/);
  assert.throws(() => validateObjectiveObservation({ ...numericObservation('candidate', ['1', '1', '1', '1', '1']), kind: 'ordinal' }, contract), /match the contract kind/);
  const notOkWithValue = { ...numericObservation('candidate', ['1', '1', '1', '1', '1']), status: 'crash' };
  assert.throws(() => validateObjectiveObservation(notOkWithValue, contract), /forbidden unless status is ok/);
  const pairwise = numericContract({
    kind: 'ordinal',
    evaluators: [{ id: 'ann', version: 'v1' }, { id: 'bob', version: 'v1' }],
    comparator: { mode: 'ordinal-pairwise', rubric: { id: 'r', criteria: [{ id: 'c1', text: 'clarity' }] } },
  });
  const goodJudgment = {
    evaluator: { id: 'ann', version: 'v1' }, target: canonicalTarget(TARGET), contractHash: sha256(canonicalJson(pairwise)),
    baselineObservationIdentity: '1'.repeat(64), incumbentObservationIdentity: '2'.repeat(64), candidateObservationIdentity: '3'.repeat(64), relation: 'better',
  };
  assert.doesNotThrow(() => validateEvaluatorJudgment(goodJudgment, pairwise));
  assert.throws(() => validateEvaluatorJudgment({ ...goodJudgment, evaluator: { id: 'zed', version: 'v1' } }, pairwise), /frozen contract evaluator/);
});

/** @param {Record<string, unknown>} [overrides] */
function authorizationRecord(overrides = {}) {
  return {
    kind: 'authorization', target: canonicalTarget(TARGET), policyMode: 'autonomous',
    evidenceHash: '1'.repeat(64), ownerBindingHash: '2'.repeat(64), planDescriptor: contentDescriptor('plan'),
    registryHash: '3'.repeat(64), contractHash: '4'.repeat(64), authorityIdentity: '5'.repeat(64),
    ...overrides,
  };
}

/** @param {Record<string, unknown>} candidate */
function checkpointGateRecord(candidate) {
  return {
    kind: 'checkpoint', target: candidate.target, checkpointIdentity: candidate.checkpointIdentity,
    candidateIdentity: candidate.candidateIdentity, writeSetIdentity: candidate.writeSetIdentity,
    prestateIdentity: candidate.prestateIdentity, poststateIdentity: candidate.poststateIdentity,
  };
}

test('T005f: normalizeAuthorizationGate wraps the authorize path and never accepts caller status', () => {
  const record = authorizationRecord();
  assert.equal(normalizeAuthorizationGate({ record, authorization: { authorized: true, reason: 'authorized' } }).result, 'pass');
  assert.equal(normalizeAuthorizationGate({ record, authorization: { authorized: false, reason: 'overall-exhausted' } }).result, 'fail');
  for (const injected of [{ result: 'pass' }, { status: 'pass' }, { name: 'authorization' }, { outcome: 'authorized' }]) {
    assert.throws(() => normalizeAuthorizationGate({ record: { ...record, ...injected }, authorization: { authorized: true } }), /unknown field/);
  }
  assert.throws(() => normalizeAuthorizationGate({ record: { ...record, policyMode: 'guarded' }, authorization: { authorized: true } }), /must be autonomous/);
  assert.equal(
    normalizeAuthorizationGate({ record, authorization: { authorized: true } }).evidenceIdentity,
    normalizeAuthorizationGate({ record, authorization: { authorized: true } }).evidenceIdentity,
  );
});

test('T005f: normalizeCheckpointGate derives readiness from the host, not the caller', () => {
  const { host, candidate, writeSet } = acquiredCandidate();
  const record = checkpointGateRecord(candidate);
  assert.equal(normalizeCheckpointGate({ record, host, candidateWriteSet: writeSet }).result, 'pass');
  host._setFile('src/a.mjs', 'drifted');
  assert.equal(normalizeCheckpointGate({ record, host, candidateWriteSet: writeSet }).result, 'incomplete');
  host._setFile('src/a.mjs', 'poststate');
  host.setPhase(candidate.checkpointIdentity, 'unsettled');
  assert.equal(normalizeCheckpointGate({ record, host, candidateWriteSet: writeSet }).result, 'fail');
  assert.throws(() => normalizeCheckpointGate({ record: { ...record, outcome: 'ready' }, host, candidateWriteSet: writeSet }), /unknown field/);
});

test('T005f: normalizeHardConstraintsGate always requires the mandatory candidate-bound check', () => {
  const contract = numericContract();
  const contractHash = sha256(canonicalJson(contract));
  const checkpointIdentity = '2'.repeat(64);
  const candidateIdentity = '3'.repeat(64);
  const args = { contract, target: TARGET, checkpointIdentity, candidateIdentity, contractHash };
  const mandatory = { kind: 'hard-constraint', constraintKind: 'verification', checkId: 'candidate-bound-completion', target: targetKey(canonicalTarget(TARGET)), checkpointIdentity, candidateIdentity, contractHash, evidenceHash: '5'.repeat(64), outcome: 'passed' };
  const declared = { kind: 'hard-constraint', constraintKind: 'verification', checkId: 'unit', target: 'src/a.test.mjs', checkpointIdentity, candidateIdentity, contractHash, evidenceHash: '6'.repeat(64), outcome: 'passed' };
  assert.equal(normalizeHardConstraintsGate({ ...args, records: [mandatory, declared] }).result, 'pass');
  assert.equal(normalizeHardConstraintsGate({ ...args, records: [declared] }).result, 'incomplete');
  assert.equal(normalizeHardConstraintsGate({ ...args, records: [mandatory, { ...declared, outcome: 'failed' }] }).result, 'fail');
  // A declared record cannot reuse the reserved id (duplicate of the mandatory key).
  assert.equal(normalizeHardConstraintsGate({ ...args, records: [mandatory, { ...declared, checkId: 'candidate-bound-completion', target: targetKey(canonicalTarget(TARGET)) }] }).result, 'incomplete');
  // Zero declared constraints: mandatory still required.
  const noConstraintContract = numericContract({ hardConstraints: [] });
  const noHash = sha256(canonicalJson(noConstraintContract));
  assert.equal(normalizeHardConstraintsGate({ contract: noConstraintContract, target: TARGET, checkpointIdentity, candidateIdentity, contractHash: noHash, records: [{ ...mandatory, contractHash: noHash }] }).result, 'pass');
  assert.equal(normalizeHardConstraintsGate({ contract: noConstraintContract, target: TARGET, checkpointIdentity, candidateIdentity, contractHash: noHash, records: [] }).result, 'incomplete');
  // A bound mismatch (wrong checkpoint) is never complete.
  assert.equal(normalizeHardConstraintsGate({ ...args, records: [{ ...mandatory, checkpointIdentity: 'f'.repeat(64) }, declared] }).result, 'incomplete');
});

test('T005f: normalizeComparisonGate passes for a valid decision regardless of relation', () => {
  const contract = numericContract();
  const binding = '7'.repeat(64);
  const okObservations = [numericObservation('baseline', ['10', '10', '10', '10', '10']), numericObservation('incumbent', ['10', '10', '10', '10', '10']), numericObservation('candidate', ['8', '8', '8', '8', '8'])];
  const decision = deriveComparisonDecision({ observations: okObservations, contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: binding, freshBindingIdentity: binding });
  assert.equal(decision.relation, 'better');
  assert.equal(normalizeComparisonGate({ decision, observations: okObservations, contract }).result, 'pass');
  const inBetweenObservations = [numericObservation('baseline', ['10', '10', '10', '10', '10']), numericObservation('incumbent', ['10', '10', '10', '10', '10']), numericObservation('candidate', ['9.2', '9.2', '9.2', '9.2', '9.2'])];
  const inBetween = deriveComparisonDecision({ observations: inBetweenObservations, contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: binding, freshBindingIdentity: binding });
  assert.equal(inBetween.relation, 'incomparable');
  assert.equal(normalizeComparisonGate({ decision: inBetween, observations: inBetweenObservations, contract }).result, 'pass');
  // Genuine derived decisions carry the reasons; the gate cross-checks their identities.
  const notOkObservations = [numericObservation('baseline', ['10', '10', '10', '10', '10']), numericObservation('incumbent', ['10', '10', '10', '10', '10']), numericObservation('candidate', ['8', '8', '8', '8', '8'], { status: 'crash' })];
  const notOk = deriveComparisonDecision({ observations: notOkObservations, contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: binding, freshBindingIdentity: binding });
  assert.equal(notOk.reason, 'observation-not-ok');
  assert.equal(normalizeComparisonGate({ decision: notOk, observations: notOkObservations, contract }).result, 'incomplete');
  const driftDecision = deriveComparisonDecision({ observations: okObservations, contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: binding, freshBindingIdentity: '9'.repeat(64) });
  assert.equal(driftDecision.reason, 'binding-drift');
  assert.equal(normalizeComparisonGate({ decision: driftDecision, observations: okObservations, contract }).result, 'fail');
  // A decision whose observation identities do not match the supplied observations is rejected.
  assert.throws(() => normalizeComparisonGate({ decision: { ...decision, baselineObservationIdentity: 'a'.repeat(64) }, observations: okObservations, contract }), /must match the supplied observations/);
  assert.throws(() => normalizeComparisonGate({ decision: { ...decision, reason: 'binding-drift' }, observations: okObservations, contract }), /must match the supplied observations/);
  assert.throws(() => normalizeComparisonGate({ decision: { ...decision, result: 'pass' }, observations: okObservations, contract }), /unknown field/);
});

test('T005f: normalizeIndependentReviewGate requires readiness and an optional candidate tie', () => {
  const readiness = (outcome) => ({ kind: 'readiness-review', reviewIdentity: '1'.repeat(64), target: canonicalTarget(TARGET), checkpointIdentity: '2'.repeat(64), candidateIdentity: '3'.repeat(64), contractHash: '4'.repeat(64), evidenceHash: '5'.repeat(64), outcome });
  const tie = (outcome) => ({ kind: 'tie-review', reviewIdentity: '9'.repeat(64), purpose: 'simplicity', rubricHash: '8'.repeat(64), target: canonicalTarget(TARGET), checkpointIdentity: '2'.repeat(64), incumbentCandidateIdentity: '7'.repeat(64), candidateIdentity: '3'.repeat(64), contractHash: '4'.repeat(64), evidenceHash: '6'.repeat(64), outcome });
  assert.equal(normalizeIndependentReviewGate({ readinessReview: readiness('accepted') }).result, 'pass');
  assert.equal(normalizeIndependentReviewGate({ readinessReview: readiness('rejected') }).result, 'fail');
  assert.equal(normalizeIndependentReviewGate({ readinessReview: readiness('timeout') }).result, 'incomplete');
  assert.equal(normalizeIndependentReviewGate({ readinessReview: readiness('accepted'), tieReview: tie('candidate') }).result, 'pass');
  assert.equal(normalizeIndependentReviewGate({ readinessReview: readiness('accepted'), tieReview: tie('incumbent') }).result, 'fail');
  assert.throws(() => normalizeIndependentReviewGate({ readinessReview: readiness('accepted'), tieReview: { ...tie('candidate'), reviewIdentity: '1'.repeat(64) } }), /distinct from the readiness review/);
});

test('T005f: buildGateSet enforces the exact five-gate order and derives its identity', () => {
  const gates = [
    { name: 'authorization', evidenceIdentity: '1'.repeat(64), result: 'pass' },
    { name: 'checkpoint', evidenceIdentity: '2'.repeat(64), result: 'pass' },
    { name: 'hard-constraints', evidenceIdentity: '3'.repeat(64), result: 'pass' },
    { name: 'comparison', evidenceIdentity: '4'.repeat(64), result: 'pass' },
    { name: 'independent-review', evidenceIdentity: '5'.repeat(64), result: 'pass' },
  ];
  const args = { target: TARGET, checkpointIdentity: '6'.repeat(64), candidateIdentity: '7'.repeat(64), contractHash: '8'.repeat(64) };
  const gateSet = buildGateSet({ ...args, gates });
  assert.equal(gateSet.gates.length, 5);
  assert.equal(gateSet.gateSetIdentity, sha256(canonicalJson({ target: canonicalTarget(TARGET), checkpointIdentity: '6'.repeat(64), candidateIdentity: '7'.repeat(64), contractHash: '8'.repeat(64), gates })));
  assert.throws(() => buildGateSet({ ...args, gates: [gates[1], gates[0], gates[2], gates[3], gates[4]] }), /must be authorization/);
  assert.throws(() => buildGateSet({ ...args, gates: gates.slice(0, 4) }), /exactly five gate results/);
  assert.throws(() => buildGateSet({ ...args, gates: [...gates, { name: 'authorization', evidenceIdentity: '9'.repeat(64), result: 'pass' }] }), /exactly five gate results/);
  assert.throws(() => buildGateSet({ ...args, gates: [{ ...gates[0], verdict: 'pass' }, gates[1], gates[2], gates[3], gates[4]] }), /unknown field/);
});

test('T005g: qualifiesForKeep requires all gates pass and a qualifying relation', () => {
  const passing = [
    { name: 'authorization', evidenceIdentity: '1'.repeat(64), result: 'pass' },
    { name: 'checkpoint', evidenceIdentity: '2'.repeat(64), result: 'pass' },
    { name: 'hard-constraints', evidenceIdentity: '3'.repeat(64), result: 'pass' },
    { name: 'comparison', evidenceIdentity: '4'.repeat(64), result: 'pass' },
    { name: 'independent-review', evidenceIdentity: '5'.repeat(64), result: 'pass' },
  ];
  const args = { target: TARGET, checkpointIdentity: '6'.repeat(64), candidateIdentity: '7'.repeat(64), contractHash: '8'.repeat(64) };
  const passingSet = buildGateSet({ ...args, gates: passing });
  assert.equal(qualifiesForKeep(passingSet, 'better'), true);
  assert.equal(qualifiesForKeep(passingSet, 'equivalent'), false);
  assert.equal(qualifiesForKeep(passingSet, 'equivalent', 'candidate'), true);
  assert.equal(qualifiesForKeep(passingSet, 'equivalent', 'incumbent'), false);
  assert.equal(qualifiesForKeep(passingSet, 'worse'), false);
  assert.equal(qualifiesForKeep(passingSet, 'incomparable'), false);
  const failingSet = buildGateSet({ ...args, gates: [{ ...passing[0], result: 'fail' }, ...passing.slice(1)] });
  assert.equal(qualifiesForKeep(failingSet, 'better'), false);
});

test('T005g: settleCandidate drives keep or restore without releasing or advancing', () => {
  {
    const { host, candidate, writeSet } = acquiredCandidate();
    const settled = settleCandidate(host, candidate, writeSet, { keep: true });
    assert.equal(settled.phase, 'kept');
    assert.equal(host._map.size, 1);
    assert.equal(host._files.get('src/a.mjs').bytes.toString(), 'poststate');
  }
  {
    const { host, candidate, writeSet } = acquiredCandidate();
    const settled = settleCandidate(host, candidate, writeSet, { keep: false });
    assert.equal(settled.phase, 'restored');
    assert.equal(host._map.size, 1);
    assert.equal(host._files.get('src/a.mjs').bytes.toString(), 'prestate');
  }
  const { host, candidate, writeSet } = acquiredCandidate();
  assert.throws(() => settleCandidate(host, candidate, writeSet, { keep: 'yes' }), /must be a boolean/);
});

/** @param {Record<string, string>} [overrides] */
function passingGateRows(overrides = {}) {
  return ['authorization', 'checkpoint', 'hard-constraints', 'comparison', 'independent-review']
    .map((name, index) => ({ name, evidenceIdentity: String(index + 1).repeat(64), result: overrides[name] || 'pass' }));
}

test('T005h: an incomparable relation settles as a restore-first non-keep', () => {
  const { host, candidate, writeSet } = acquiredCandidate();
  const gateSet = buildGateSet({
    target: TARGET, checkpointIdentity: candidate.checkpointIdentity, candidateIdentity: candidate.candidateIdentity,
    contractHash: candidate.contractHash, gates: passingGateRows(),
  });
  const keep = qualifiesForKeep(gateSet, 'incomparable');
  assert.equal(keep, false);
  const settled = settleCandidate(host, candidate, writeSet, { keep });
  assert.equal(settled.phase, 'restored');
  assert.equal(host._files.get('src/a.mjs').bytes.toString(), 'prestate');
});

test('T005h: a cross-contract comparison refuses as binding drift', () => {
  const contract = numericContract();
  const otherHash = sha256(canonicalJson(numericContract({ id: 'obj-other' })));
  const binding = '7'.repeat(64);
  const decision = deriveComparisonDecision({
    observations: [
      numericObservation('baseline', ['10', '10', '10', '10', '10']),
      numericObservation('incumbent', ['10', '10', '10', '10', '10']),
      { ...numericObservation('candidate', ['8', '8', '8', '8', '8']), contractHash: otherHash },
    ],
    contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: binding, freshBindingIdentity: binding,
  });
  assert.equal(decision.relation, 'incomparable');
  assert.equal(decision.reason, 'binding-drift');
});

test('T005h: a rebaseline sequence derives an independent baseline under a new contract', () => {
  const writeSet = candidateWriteSet();
  const originalContract = numericContract();
  const initial = fileDescriptors({ 'src/a.mjs': 'v1', 'src/a.test.mjs': 't' });
  const original = createEvaluationSequence(TARGET, objectivePlanBody(originalContract), originalContract, writeSet, initial);
  const newContract = numericContract({ id: 'obj-rebaseline', subject: 'New objective' });
  const retained = fileDescriptors({ 'src/a.mjs': 'kept-incumbent', 'src/a.test.mjs': 't' });
  const rebaseline = createEvaluationSequence(TARGET, objectivePlanBody(newContract), newContract, writeSet, retained);
  assert.notEqual(rebaseline.sequenceIdentity, original.sequenceIdentity);
  assert.notEqual(rebaseline.baselineCandidateIdentity, original.baselineCandidateIdentity);
  assert.equal(rebaseline.baselineCandidateIdentity, stateIdentity(writeSetIdentity(writeSet), retained));
  assert.equal(rebaseline.baselineCandidateIdentity, rebaseline.incumbentCandidateIdentity);
});

test('T005h: the checkpoint host is never threaded through dependencies', () => {
  const host = checkpointHostFake();
  assert.throws(
    () => authorizeRuntimeAttempt(emptyState({ recover: true }), TARGET, transitionRaw(TARGET), transitionAssessment('retry-task'), 'recovery', { checkpointHost: host }),
    /unknown field/,
  );
  // The evidence path itself needs no host and admits only the tracked normalizer.
  assert.doesNotThrow(() => collectEvidence(TARGET, transitionRaw(TARGET), {}, 'guarded'));
});

test('T005h: the guarded no-objective authorize and complete path is byte-invariant', () => {
  const state = emptyState({ recover: true });
  const raw = transitionRaw(TARGET);
  const guardedEvidence = collectEvidence(TARGET, raw, {}, 'guarded');
  // Guarded evidence acquires no definition-plan or objective source.
  assert.ok(!guardedEvidence.some((item) => item.source === 'definition-plan'));
  const inspection = buildInspection(TARGET, guardedEvidence);
  const boundAssessment = transitionAssessment('retry-task', { evidenceHash: inspection.evidenceHash });
  const authorized = authorizeRuntimeAttempt(state, TARGET, raw, boundAssessment, 'recovery');
  assert.equal(authorized.authorized, true);
  assert.equal(authorized.state.pending.length, 1);
  assert.equal(authorized.state.overallUsed, 1);
  assert.deepEqual(authorized.state.policy, state.policy);
  assert.ok(!Object.hasOwn(authorized.state, 'evaluationSequences'));
  assert.ok(!Object.hasOwn(authorized.state, 'learningReviewRefs'));
  const finished = completeAttempt(authorized.state, completionInput(authorized.state.pending[0]));
  assert.equal(finished.completed, true);
  assert.equal(finished.state.pending.length, 0);
  assert.equal(finished.state.completed.length, 1);
  assert.ok(!Object.hasOwn(finished.state, 'evaluationSequences'));
  assert.ok(!Object.hasOwn(finished.state, 'learningReviewRefs'));
});

// --- T006: bounded events, dual projection, references, and audit ------------

const OTHER_TARGET = Object.freeze({ specPath: SPEC_PATH, lane: 'lightweight', taskKey: SECOND_TASK_KEY });

/**
 * In-memory projection owner over a current-run record array and a lane line
 * array, with live fault toggles applied at acquire time: `missing` drops every
 * event, `duplicate` returns each twice, `mutate` adds a tamper field (breaking
 * the recomputed hash), and `wrongTarget` retargets each event.
 * @param {Record<string, unknown>} [faults]
 */
function projectionOwnerFake(faults = {}) {
  /** @type {Record<string, unknown>[]} */
  const currentRun = [];
  /** @type {string[]} */
  const lane = [];
  const transformEvent = (event) => {
    if (faults.mutate) return { ...event, __tampered: true };
    if (faults.wrongTarget) return { ...event, target: canonicalTarget(OTHER_TARGET) };
    return event;
  };
  const laneEvent = (line) => JSON.parse(line.slice('- dude-run-event: '.length)).event;
  const needsTransform = () => Boolean(faults.mutate || faults.wrongTarget);
  return {
    appendCurrentRunRecord(record) { currentRun.push(structuredClone(record)); },
    acquireCurrentRunRecords() {
      if (faults.missing) return [];
      const base = needsTransform()
        ? currentRun.map((record) => ({ substantive: { event: transformEvent(structuredClone(record).substantive.event) } }))
        : currentRun.map((record) => structuredClone(record));
      return faults.duplicate ? [...base, ...base.map((entry) => structuredClone(entry))] : base;
    },
    appendLaneEventLine(line) { lane.push(line); },
    acquireLaneEventLines() {
      if (faults.missing) return [];
      const base = needsTransform()
        ? lane.map((line) => `- dude-run-event: ${canonicalJson({ event: transformEvent(laneEvent(line)) })}`)
        : [...lane];
      return faults.duplicate ? [...base, ...base] : base;
    },
    _currentRun: currentRun,
    _lane: lane,
    _faults: faults,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function comparisonEventInput(overrides = {}) {
  return {
    target: TARGET,
    taskKey: TASK_KEY,
    sequenceIdentity: '1'.repeat(64),
    comparisonIdentity: '2'.repeat(64),
    checkpointIdentity: '3'.repeat(64),
    contractHash: '4'.repeat(64),
    baselineCandidateIdentity: '5'.repeat(64),
    incumbentBeforeIdentity: '6'.repeat(64),
    candidateIdentity: '7'.repeat(64),
    observationIdentities: { baseline: 'a'.repeat(64), incumbent: 'b'.repeat(64), candidate: 'c'.repeat(64) },
    relation: 'better',
    gateSetIdentity: '8'.repeat(64),
    gateResults: passingGateRows(),
    decision: 'keep',
    ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function closedEventInput(overrides = {}) {
  return {
    target: TARGET,
    taskKey: TASK_KEY,
    sequenceIdentity: '1'.repeat(64),
    contractHash: '2'.repeat(64),
    baselineCandidateIdentity: '3'.repeat(64),
    finalIncumbentIdentity: '4'.repeat(64),
    reason: 'task-completed',
    comparisonEventHashes: [],
    learningReviewEventHashes: [],
    ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function learningEventInput(overrides = {}) {
  return {
    target: TARGET,
    evidenceHash: '1'.repeat(64),
    repeatedEvidenceHash: '2'.repeat(64),
    repeatedApproachHash: '3'.repeat(64),
    findings: ['A repeated equivalent approach was observed.'],
    alternatives: [],
    outcome: 'no-progress',
    ...overrides,
  };
}

/**
 * Build a self-consistent open sequence in a RunState plus a live candidate
 * checkpoint context, ready to settle. Faults are forwarded to the host fake.
 * @param {Record<string, unknown>} [options]
 */
function objectiveSequenceFixture(options = {}) {
  const writeSet = candidateWriteSet();
  const contract = numericContract();
  const contractHash = sha256(canonicalJson(contract));
  const initial = fileDescriptors({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' });
  const sequence = createEvaluationSequence(TARGET, objectivePlanBody(contract), contract, writeSet, initial);
  const host = checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' }, options.faults || {});
  const captured = acquireCheckpoint(host, { target: TARGET, sequenceIdentity: sequence.sequenceIdentity, contractHash, candidateWriteSet: writeSet });
  host._setFile('src/a.mjs', options.candidateContent || 'poststate');
  const candidate = captureCandidate(host, captured, writeSet);
  const state = { ...emptyState(), evaluationSequences: [sequence] };
  return { writeSet, contract, contractHash, sequence, host, captured, candidate, state };
}

/** @param {ReturnType<typeof objectiveSequenceFixture>} fixture @param {string[]} candidateSamples */
function fixtureDecision(fixture, candidateSamples, overrides = {}) {
  return deriveComparisonDecision({
    observations: [
      numericObservation('baseline', ['10', '10', '10', '10', '10']),
      numericObservation('incumbent', ['10', '10', '10', '10', '10']),
      numericObservation('candidate', candidateSamples),
    ],
    contract: fixture.contract,
    sequenceIdentity: fixture.sequence.sequenceIdentity,
    checkpointIdentity: fixture.candidate.checkpointIdentity,
    activeBindingIdentity: '7'.repeat(64),
    freshBindingIdentity: overrides.fresh || '7'.repeat(64),
  });
}

/** @param {ReturnType<typeof objectiveSequenceFixture>} fixture @param {Record<string, string>} [gateOverrides] */
function fixtureGateSet(fixture, gateOverrides = {}) {
  return buildGateSet({
    target: TARGET,
    checkpointIdentity: fixture.candidate.checkpointIdentity,
    candidateIdentity: fixture.candidate.candidateIdentity,
    contractHash: fixture.contractHash,
    gates: passingGateRows(gateOverrides),
  });
}

/** @param {Record<string, unknown>} state @param {string} sequenceIdentity @param {ReturnType<typeof projectionOwnerFake>} owner @param {number} seed */
function projectComparisonRef(state, sequenceIdentity, owner, seed) {
  const event = buildObjectiveComparisonEvent(comparisonEventInput({
    sequenceIdentity,
    comparisonIdentity: sha256(`cmp-${seed}`),
    candidateIdentity: sha256(`cand-${seed}`),
  }));
  const projection = projectEvent(owner, event);
  const next = admitComparisonReference(state, sequenceIdentity, {
    comparisonIdentity: event.comparisonIdentity,
    eventHash: event.eventHash,
    currentRunProjectionIdentity: projection.currentRunProjectionIdentity,
    laneProjectionIdentity: projection.laneProjectionIdentity,
  }, owner);
  return { state: next, event };
}

/** @param {Record<string, unknown>} state @param {ReturnType<typeof projectionOwnerFake>} owner @param {number} seed */
function projectLearningRef(state, owner, seed) {
  const event = buildLearningReviewEvent(learningEventInput({
    evidenceHash: sha256(`ev-${seed}`),
    repeatedEvidenceHash: sha256(`rev-${seed}`),
    repeatedApproachHash: sha256(`rap-${seed}`),
  }));
  const projection = projectEvent(owner, event);
  const next = admitLearningReviewReference(state, {
    reviewIdentity: event.reviewIdentity,
    target: TARGET,
    eventHash: event.eventHash,
    currentRunProjectionIdentity: projection.currentRunProjectionIdentity,
    laneProjectionIdentity: projection.laneProjectionIdentity,
  }, owner);
  return { state: next, event };
}

test('T006a: restoreCheckpoint hard stops on a captured-context restoration fault', () => {
  const writeSet = candidateWriteSet();
  const host = checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' }, { failRestore: true });
  const captured = acquireCheckpoint(host, { target: TARGET, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), candidateWriteSet: writeSet });
  assert.throws(() => restoreCheckpoint(host, captured, writeSet), /captured context restoration could not be proven/);
  assert.equal(host.get(captured.checkpointIdentity).phase, 'unsettled');
  assert.equal(host._map.size, 1);
  // A candidate-context restore fault still RETURNS an unsettled record (T005d parity).
  const { host: host2, candidate, writeSet: ws2 } = acquiredCandidate();
  host2.faults.failRestore = true;
  assert.equal(restoreCheckpoint(host2, candidate, ws2).phase, 'unsettled');
});

test('T006a: normalizeCheckpointGate forbids ready when a protected path changed during the candidate', () => {
  const writeSet = candidateWriteSet();
  const host = checkpointHostFake({ 'src/a.mjs': 'prestate', 'src/a.test.mjs': 'guard' });
  const captured = acquireCheckpoint(host, { target: TARGET, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), candidateWriteSet: writeSet });
  host._setFile('src/a.mjs', 'poststate');
  host._setFile('src/a.test.mjs', 'guard-tampered'); // protected path mutated during the candidate
  const candidate = captureCandidate(host, captured, writeSet);
  const record = {
    kind: 'checkpoint', target: candidate.target, checkpointIdentity: candidate.checkpointIdentity,
    candidateIdentity: candidate.candidateIdentity, writeSetIdentity: candidate.writeSetIdentity,
    prestateIdentity: candidate.prestateIdentity, poststateIdentity: candidate.poststateIdentity,
  };
  // Poststate and candidate identities match, but the protected subset differs from the prestate.
  assert.equal(normalizeCheckpointGate({ record, host, candidateWriteSet: writeSet }).result, 'incomplete');
});

test('T006a: normalizeComparisonGate rejects a decision that does not match the observations', () => {
  const contract = numericContract();
  const binding = '7'.repeat(64);
  const observations = [numericObservation('baseline', ['10', '10', '10', '10', '10']), numericObservation('incumbent', ['10', '10', '10', '10', '10']), numericObservation('candidate', ['8', '8', '8', '8', '8'])];
  const decision = deriveComparisonDecision({ observations, contract, sequenceIdentity: '1'.repeat(64), checkpointIdentity: '2'.repeat(64), activeBindingIdentity: binding, freshBindingIdentity: binding });
  assert.equal(normalizeComparisonGate({ decision, observations, contract }).result, 'pass');
  assert.throws(() => normalizeComparisonGate({ decision: { ...decision, candidateObservationIdentity: '0'.repeat(64) }, observations, contract }), /must match the supplied observations/);
});

test('T006b: ObjectiveComparisonEvent builder and validator enforce the decision field rules', () => {
  const keep = buildObjectiveComparisonEvent(comparisonEventInput());
  assert.equal(keep.type, 'objective-comparison');
  assert.equal(keep.version, 1);
  assert.equal(keep.decision, 'keep');
  assert.equal(keep.incumbentAfterIdentity, keep.candidateIdentity);
  assert.ok(!Object.hasOwn(keep, 'restorationIdentity'));
  assert.equal(keep.eventHash, sha256(canonicalJson(without(keep, 'eventHash'))));
  assert.doesNotThrow(() => validateObjectiveComparisonEvent(keep));
  assert.throws(() => buildObjectiveComparisonEvent(comparisonEventInput({ restorationIdentity: 'd'.repeat(64) })), /forbidden for a keep/);

  const discard = buildObjectiveComparisonEvent(comparisonEventInput({ decision: 'discard', relation: 'worse', restorationIdentity: 'd'.repeat(64) }));
  assert.equal(discard.incumbentAfterIdentity, discard.incumbentBeforeIdentity);
  assert.equal(discard.restorationIdentity, 'd'.repeat(64));
  assert.doesNotThrow(() => validateObjectiveComparisonEvent(discard));
  assert.throws(() => buildObjectiveComparisonEvent(comparisonEventInput({ decision: 'discard', relation: 'worse' })), /restorationIdentity/);

  const stop = buildObjectiveComparisonEvent(comparisonEventInput({ decision: 'stop-unsettled', relation: 'incomparable' }));
  assert.equal(stop.incumbentAfterIdentity, null);
  assert.doesNotThrow(() => validateObjectiveComparisonEvent(stop));
  assert.throws(() => buildObjectiveComparisonEvent(comparisonEventInput({ decision: 'stop-unsettled', restorationIdentity: 'd'.repeat(64) })), /forbidden for a stop-unsettled/);

  assert.throws(() => validateObjectiveComparisonEvent({ ...keep, relation: 'worse' }), /recomputed event hash/);
  assert.throws(() => validateObjectiveComparisonEvent({ ...keep, incumbentAfterIdentity: '0'.repeat(64) }), /must equal the candidate identity/);
  assert.throws(() => validateObjectiveComparisonEvent({ ...discard, incumbentAfterIdentity: '0'.repeat(64) }), /must equal the prior incumbent/);
  assert.throws(() => validateObjectiveComparisonEvent({ ...stop, incumbentAfterIdentity: '0'.repeat(64) }), /must be null/);
  assert.throws(() => validateObjectiveComparisonEvent({ ...keep, extra: 1 }), /unknown field/);
});

test('T006b: EvaluationSequenceClosedEvent enforces reason, hash bounds, and settled incumbent', () => {
  const closed = buildEvaluationSequenceClosedEvent(closedEventInput());
  assert.equal(closed.type, 'evaluation-sequence-closed');
  assert.doesNotThrow(() => validateEvaluationSequenceClosedEvent(closed));
  assert.equal(closed.eventHash, sha256(canonicalJson(without(closed, 'eventHash'))));
  for (const reason of ['rebaseline', 'drift', 'task-completed', 'task-blocked', 'no-progress', 'hard-stop', 'controlled-end']) {
    assert.doesNotThrow(() => buildEvaluationSequenceClosedEvent(closedEventInput({ reason })));
  }
  assert.throws(() => buildEvaluationSequenceClosedEvent(closedEventInput({ reason: 'nope' })), /must be one of/);
  assert.throws(() => buildEvaluationSequenceClosedEvent(closedEventInput({ comparisonEventHashes: Array.from({ length: 65 }, () => '1'.repeat(64)) })), /at most 64 hashes/);
  assert.throws(() => buildEvaluationSequenceClosedEvent(closedEventInput({ learningReviewEventHashes: Array.from({ length: 17 }, () => '1'.repeat(64)) })), /at most 16 hashes/);
  assert.throws(() => buildEvaluationSequenceClosedEvent(closedEventInput({ finalIncumbentIdentity: 'not-a-hash' })), /lowercase SHA-256/);
  assert.throws(() => validateEvaluationSequenceClosedEvent({ ...closed, reason: 'drift' }), /recomputed event hash/);
  assert.throws(() => validateEvaluationSequenceClosedEvent({ ...closed, extra: 1 }), /unknown field/);
});

test('T006b: LearningReviewEvent enforces findings, alternatives, outcomes, and identities', () => {
  const noProgress = buildLearningReviewEvent(learningEventInput());
  assert.equal(noProgress.outcome, 'no-progress');
  assert.equal(noProgress.reviewIdentity, sha256(canonicalJson({ target: canonicalTarget(TARGET), evidenceHash: '1'.repeat(64), repeatedEvidenceHash: '2'.repeat(64), repeatedApproachHash: '3'.repeat(64) })));
  assert.doesNotThrow(() => validateLearningReviewEvent(noProgress));
  assert.ok(!Object.hasOwn(noProgress, 'selectedApproachHash'));
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ selectedApproachHash: '9'.repeat(64) })), /no-progress forbids/);

  const authorized = buildLearningReviewEvent(learningEventInput({
    sequenceIdentity: '4'.repeat(64),
    outcome: 'authorized-alternative',
    alternatives: [{ approachHash: '9'.repeat(64), discriminatingCheckId: 'unit' }],
    selectedApproachHash: '9'.repeat(64),
    discriminatingCheckId: 'unit',
  }));
  assert.equal(authorized.outcome, 'authorized-alternative');
  assert.equal(authorized.reviewIdentity, sha256(canonicalJson({ target: canonicalTarget(TARGET), sequenceIdentity: '4'.repeat(64), evidenceHash: '1'.repeat(64), repeatedEvidenceHash: '2'.repeat(64), repeatedApproachHash: '3'.repeat(64) })));
  assert.doesNotThrow(() => validateLearningReviewEvent(authorized));
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ outcome: 'authorized-alternative', alternatives: [{ approachHash: '3'.repeat(64), discriminatingCheckId: 'unit' }], selectedApproachHash: '3'.repeat(64), discriminatingCheckId: 'unit' })), /differ from the repeated/);
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ outcome: 'authorized-alternative', alternatives: [{ approachHash: '9'.repeat(64), discriminatingCheckId: 'unit' }], selectedApproachHash: 'a'.repeat(64), discriminatingCheckId: 'unit' })), /match an alternatives row/);
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ findings: [] })), /1 through 16 findings/);
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ findings: ['x'.repeat(513)] })), /1 through 512 UTF-8 bytes/);
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ findings: Array.from({ length: 17 }, () => 'finding') })), /1 through 16 findings/);
  assert.throws(() => buildLearningReviewEvent(learningEventInput({ alternatives: [{ approachHash: 'b'.repeat(64), discriminatingCheckId: 'x' }, { approachHash: 'a'.repeat(64), discriminatingCheckId: 'y' }] })), /sorted and unique/);
  assert.throws(() => validateLearningReviewEvent({ ...noProgress, repeatedApproachHash: '9'.repeat(64) }), /review identity/);
  assert.throws(() => validateLearningReviewEvent({ ...noProgress, extra: 1 }), /unknown field/);
});

test('T006b: a maximal learning event still serializes within the 16,384-byte bound', () => {
  const alternatives = Array.from({ length: 8 }, (_, index) => ({ approachHash: sha256(`alt-${index}`), discriminatingCheckId: `check-${index}` }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.approachHash), Buffer.from(right.approachHash)));
  const maximal = buildLearningReviewEvent(learningEventInput({
    findings: Array.from({ length: 16 }, (_, index) => `${String(index).padStart(3, '0')}-${'f'.repeat(506)}`),
    alternatives,
  }));
  assert.doesNotThrow(() => validateLearningReviewEvent(maximal));
  assert.ok(Buffer.byteLength(canonicalJson(maximal)) <= 16384);
});

test('T006c: projection record and lane line carry the exact {event} payload', () => {
  const event = buildObjectiveComparisonEvent(comparisonEventInput());
  assert.deepEqual(buildProjectionRecord(event), { substantive: { event } });
  assert.equal(buildLaneEventLine(event), `- dude-run-event: ${canonicalJson({ event })}`);
});

test('T006c: validateProjectionOwner requires the four surface functions', () => {
  const owner = projectionOwnerFake();
  assert.doesNotThrow(() => validateProjectionOwner(owner));
  for (const method of ['appendCurrentRunRecord', 'acquireCurrentRunRecords', 'appendLaneEventLine', 'acquireLaneEventLines']) {
    assert.throws(() => validateProjectionOwner({ ...owner, [method]: 'nope' }), new RegExp(`${method} must be a function`));
  }
});

test('T006c: projectEvent appends both surfaces and verifies exactly one byte-equivalent event', () => {
  const owner = projectionOwnerFake();
  const event = buildObjectiveComparisonEvent(comparisonEventInput());
  const projection = projectEvent(owner, event);
  assert.equal(owner._currentRun.length, 1);
  assert.equal(owner._lane.length, 1);
  assert.equal(projection.currentRunProjectionIdentity, sha256(canonicalJson({ surface: 'current-run', target: canonicalTarget(TARGET), eventHash: event.eventHash, recordHash: sha256(canonicalJson({ event })) })));
  assert.equal(projection.laneProjectionIdentity, sha256(canonicalJson({ surface: 'lane-history', target: canonicalTarget(TARGET), eventHash: event.eventHash, recordHash: sha256(Buffer.from(buildLaneEventLine(event), 'utf8')) })));
  assert.deepEqual(reacquireProjection(owner, event.eventHash, TARGET).event, event);
  assert.deepEqual(verifyProjection(owner, event).event, event);
});

test('T006c: every projection tamper blocks reacquisition and verification', () => {
  const event = buildObjectiveComparisonEvent(comparisonEventInput());
  const project = (faults) => () => projectEvent(projectionOwnerFake(faults), event);
  assert.throws(project({ missing: true }), /projection is missing/);
  assert.throws(project({ duplicate: true }), /duplicate-conflicting/);
  assert.throws(project({ mutate: true }), /hash mismatch/);
  assert.throws(project({ wrongTarget: true }), /wrong target/);

  const clean = projectionOwnerFake();
  projectEvent(clean, event);
  assert.throws(() => reacquireProjection(clean, event.eventHash, OTHER_TARGET), /wrong target/);

  const malformed = projectionOwnerFake();
  projectEvent(malformed, event);
  malformed._lane.push('- dude-run-event: {not json');
  assert.throws(() => reacquireProjection(malformed, event.eventHash, TARGET), /malformed/);
});

test('T006d: admitComparisonReference assigns increasing ordinals and evicts the oldest verified ref under pressure', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const seqId = /** @type {string} */ (fixture.sequence.sequenceIdentity);
  let state = { ...emptyState(), evaluationSequences: [fixture.sequence] };
  for (let seed = 1; seed <= 8; seed += 1) state = projectComparisonRef(state, seqId, owner, seed).state;
  const row = state.evaluationSequences[0];
  assert.equal(row.recentComparisons.length, 8);
  assert.deepEqual(row.recentComparisons.map((entry) => entry.ordinal), [1, 2, 3, 4, 5, 6, 7, 8]);

  const ninth = projectComparisonRef(state, seqId, owner, 9);
  const row9 = ninth.state.evaluationSequences[0];
  assert.equal(row9.recentComparisons.length, 8);
  assert.deepEqual(row9.recentComparisons.map((entry) => entry.ordinal), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.doesNotThrow(() => validateRunState(ninth.state));
});

test('T006d: a tampered projection blocks eviction and never drops an unprojected ref', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const seqId = /** @type {string} */ (fixture.sequence.sequenceIdentity);
  let state = { ...emptyState(), evaluationSequences: [fixture.sequence] };
  for (let seed = 1; seed <= 8; seed += 1) state = projectComparisonRef(state, seqId, owner, seed).state;
  owner._faults.mutate = true; // the oldest ref can no longer re-verify
  assert.throws(() => admitComparisonReference(state, seqId, {
    comparisonIdentity: sha256('cmp-9'),
    eventHash: sha256('evt-9'),
    currentRunProjectionIdentity: sha256('cr-9'),
    laneProjectionIdentity: sha256('lane-9'),
  }, owner), /hash mismatch/);
});

test('T006d: admitLearningReviewReference stays sorted, bounded at 16, and evicts the lowest verified identity', () => {
  const owner = projectionOwnerFake();
  let state = emptyState();
  for (let seed = 1; seed <= 16; seed += 1) state = projectLearningRef(state, owner, seed).state;
  assert.equal(state.learningReviewRefs.length, 16);
  const sorted = [...state.learningReviewRefs].sort((left, right) => Buffer.compare(Buffer.from(left.reviewIdentity), Buffer.from(right.reviewIdentity)));
  assert.deepEqual(state.learningReviewRefs, sorted);
  const lowest = sorted[0].reviewIdentity;

  const seventeenth = projectLearningRef(state, owner, 17);
  assert.equal(seventeenth.state.learningReviewRefs.length, 16);
  assert.ok(!seventeenth.state.learningReviewRefs.some((entry) => entry.reviewIdentity === lowest));
  assert.doesNotThrow(() => validateRunState(seventeenth.state));
  // Duplicate review identities are rejected.
  const first = state.learningReviewRefs[0];
  assert.throws(() => admitLearningReviewReference(state, { ...first }, owner), /must not duplicate/);
});

test('T006e: resolveComparison keeps a better candidate, advances the incumbent, and releases', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const decision = fixtureDecision(fixture, ['8', '8', '8', '8', '8']);
  assert.equal(decision.relation, 'better');
  const result = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision, gateSet: fixtureGateSet(fixture),
    candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  assert.equal(result.outcome, 'keep');
  assert.equal(result.stopped, false);
  assert.equal(result.event.decision, 'keep');
  assert.equal(result.event.incumbentAfterIdentity, fixture.candidate.candidateIdentity);
  const row = result.state.evaluationSequences[0];
  assert.equal(row.incumbentCandidateIdentity, fixture.candidate.candidateIdentity);
  assert.equal(row.state, 'open');
  assert.ok(!Object.hasOwn(row, 'activeCheckpointIdentity'));
  assert.equal(row.recentComparisons.length, 1);
  assert.equal(fixture.host._map.size, 0); // released
  assert.equal(fixture.host._files.get('src/a.mjs').bytes.toString(), 'poststate');
  assert.doesNotThrow(() => reacquireProjection(owner, result.event.eventHash, TARGET));
  // Objective evidence never completes a task: no completed tuple was recorded.
  assert.equal(result.state.completed.length, 0);
  assert.equal(result.state.pending.length, 0);
});

test('T006e: resolveComparison discards a worse candidate, restores, and leaves the incumbent', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const decision = fixtureDecision(fixture, ['12', '12', '12', '12', '12']);
  assert.equal(decision.relation, 'worse');
  const result = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision, gateSet: fixtureGateSet(fixture),
    candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  assert.equal(result.outcome, 'discard');
  assert.equal(result.event.decision, 'discard');
  assert.equal(result.event.incumbentAfterIdentity, fixture.sequence.incumbentCandidateIdentity);
  assert.ok(Object.hasOwn(result.event, 'restorationIdentity'));
  const row = result.state.evaluationSequences[0];
  assert.equal(row.incumbentCandidateIdentity, fixture.sequence.incumbentCandidateIdentity);
  assert.equal(row.state, 'open');
  assert.equal(fixture.host._files.get('src/a.mjs').bytes.toString(), 'prestate'); // restored
  assert.equal(fixture.host._map.size, 0);
});

test('T006e: a restore fault records stop-unsettled, retains the context, and stops without release', () => {
  const fixture = objectiveSequenceFixture({ faults: { failRestore: true } });
  const owner = projectionOwnerFake();
  const decision = fixtureDecision(fixture, ['12', '12', '12', '12', '12']);
  const result = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision, gateSet: fixtureGateSet(fixture),
    candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  assert.equal(result.outcome, 'stop-unsettled');
  assert.equal(result.stopped, true);
  assert.equal(result.event.decision, 'stop-unsettled');
  assert.equal(result.event.incumbentAfterIdentity, null);
  const row = result.state.evaluationSequences[0];
  assert.equal(row.state, 'unsettled');
  assert.equal(row.activeCheckpointIdentity, fixture.candidate.checkpointIdentity);
  assert.equal(row.activeCandidateIdentity, fixture.candidate.candidateIdentity);
  assert.equal(fixture.host._map.size, 1); // context retained, not released
  assert.doesNotThrow(() => reacquireProjection(owner, result.event.eventHash, TARGET));
});

test('T006e: an equivalent candidate keeps only under a passing predeclared tie review', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const decision = fixtureDecision(fixture, ['10.3', '10.3', '10.3', '10.3', '10.3']);
  assert.equal(decision.relation, 'equivalent');
  const discard = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision, gateSet: fixtureGateSet(fixture),
    candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  assert.equal(discard.outcome, 'discard'); // no tie review ⇒ non-keep

  const fixture2 = objectiveSequenceFixture();
  const owner2 = projectionOwnerFake();
  const decision2 = fixtureDecision(fixture2, ['10.3', '10.3', '10.3', '10.3', '10.3']);
  const keep = resolveComparison(fixture2.state, fixture2.sequence, {
    host: fixture2.host, owner: owner2, decision: decision2, gateSet: fixtureGateSet(fixture2),
    candidateIdentity: fixture2.candidate.candidateIdentity, candidateWriteSet: fixture2.writeSet,
    tieReviewOutcome: 'candidate',
  });
  assert.equal(keep.outcome, 'keep');
});

test('T006f: closeEvaluationSequence projects a settled close and removes the row', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const kept = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision: fixtureDecision(fixture, ['8', '8', '8', '8', '8']),
    gateSet: fixtureGateSet(fixture), candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  const closed = closeEvaluationSequence(kept.state, /** @type {string} */ (fixture.sequence.sequenceIdentity), {
    owner, reason: 'task-completed', comparisonEventHashes: [kept.event.eventHash], learningReviewEventHashes: [],
  });
  assert.equal(closed.event.type, 'evaluation-sequence-closed');
  assert.equal(closed.event.reason, 'task-completed');
  assert.equal(closed.event.finalIncumbentIdentity, fixture.candidate.candidateIdentity);
  assert.equal(closed.state.evaluationSequences.length, 0);
  assert.doesNotThrow(() => reacquireProjection(owner, closed.event.eventHash, TARGET));
});

test('T006f: an unsettled restoration blocks sequence close', () => {
  const fixture = objectiveSequenceFixture({ faults: { failRestore: true } });
  const owner = projectionOwnerFake();
  const stopped = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision: fixtureDecision(fixture, ['12', '12', '12', '12', '12']),
    gateSet: fixtureGateSet(fixture), candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  assert.throws(() => closeEvaluationSequence(stopped.state, /** @type {string} */ (fixture.sequence.sequenceIdentity), {
    owner, reason: 'task-completed', comparisonEventHashes: [], learningReviewEventHashes: [],
  }), /unsettled restoration blocks/);
});

test('T006f: drift restores then closes, and rebaseline opens an independent baseline', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const drift = fixtureDecision(fixture, ['8', '8', '8', '8', '8'], { fresh: '9'.repeat(64) });
  assert.equal(drift.reason, 'binding-drift');
  assert.equal(drift.relation, 'incomparable');
  const settled = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision: drift, gateSet: fixtureGateSet(fixture),
    candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  assert.equal(settled.outcome, 'discard'); // incomparable ⇒ restore first
  assert.equal(fixture.host._files.get('src/a.mjs').bytes.toString(), 'prestate');
  const closedDrift = closeEvaluationSequence(settled.state, /** @type {string} */ (fixture.sequence.sequenceIdentity), {
    owner, reason: 'drift', comparisonEventHashes: [settled.event.eventHash], learningReviewEventHashes: [],
  });
  assert.equal(closedDrift.event.reason, 'drift');

  // Rebaseline: close with reason rebaseline then open a fresh baseline over the retained incumbent.
  const fixture2 = objectiveSequenceFixture();
  const owner2 = projectionOwnerFake();
  const kept = resolveComparison(fixture2.state, fixture2.sequence, {
    host: fixture2.host, owner: owner2, decision: fixtureDecision(fixture2, ['8', '8', '8', '8', '8']),
    gateSet: fixtureGateSet(fixture2), candidateIdentity: fixture2.candidate.candidateIdentity, candidateWriteSet: fixture2.writeSet,
  });
  const closedRebaseline = closeEvaluationSequence(kept.state, /** @type {string} */ (fixture2.sequence.sequenceIdentity), {
    owner: owner2, reason: 'rebaseline', comparisonEventHashes: [kept.event.eventHash], learningReviewEventHashes: [],
  });
  assert.equal(closedRebaseline.event.reason, 'rebaseline');
  assert.equal(closedRebaseline.state.evaluationSequences.length, 0);
  const newContract = numericContract({ id: 'obj-rebaseline', subject: 'New objective' });
  const retained = fileDescriptors({ 'src/a.mjs': 'poststate', 'src/a.test.mjs': 'guard' });
  const rebaseline = createEvaluationSequence(TARGET, objectivePlanBody(newContract), newContract, candidateWriteSet(), retained);
  assert.notEqual(rebaseline.sequenceIdentity, fixture2.sequence.sequenceIdentity);
  assert.equal(rebaseline.baselineCandidateIdentity, stateIdentity(writeSetIdentity(candidateWriteSet()), retained));
});

test('T006g: settleTaskBoundary closes a settled sequence and readies the lane without mutating it', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const kept = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision: fixtureDecision(fixture, ['8', '8', '8', '8', '8']),
    gateSet: fixtureGateSet(fixture), candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  const boundary = settleTaskBoundary(kept.state, {
    host: fixture.host, owner, target: TARGET, taskKey: TASK_KEY, reason: 'task-completed',
    comparisonEventHashes: [kept.event.eventHash], learningReviewEventHashes: [],
  });
  assert.equal(boundary.readyForLaneTransition, true);
  assert.equal(boundary.stopped, false);
  assert.equal(boundary.close.event.reason, 'task-completed');
  assert.equal(boundary.state.evaluationSequences.length, 0); // row removed — no post-task optimization
  assert.equal(boundary.state.completed.length, 0); // no lane transition or task completion invoked
  assert.equal(boundary.state.pending.length, 0);
});

test('T006g: settleTaskBoundary settles a live candidate before closing on a block', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const boundary = settleTaskBoundary(fixture.state, {
    host: fixture.host, owner, target: TARGET, taskKey: TASK_KEY, reason: 'task-blocked',
    comparisonEventHashes: [], learningReviewEventHashes: [],
    settle: {
      decision: fixtureDecision(fixture, ['12', '12', '12', '12', '12']),
      gateSet: fixtureGateSet(fixture),
      candidateIdentity: fixture.candidate.candidateIdentity,
      candidateWriteSet: fixture.writeSet,
    },
  });
  assert.equal(boundary.readyForLaneTransition, true);
  assert.equal(boundary.comparison.outcome, 'discard');
  assert.equal(boundary.close.event.reason, 'task-blocked');
  assert.equal(boundary.state.evaluationSequences.length, 0);
  assert.equal(fixture.host._files.get('src/a.mjs').bytes.toString(), 'prestate');
  assert.equal(fixture.host._map.size, 0);
});

test('T006h: renderAuditSummary emits the exact shape and reads cycle reasons from the surface', () => {
  const fixture = objectiveSequenceFixture();
  const owner = projectionOwnerFake();
  const kept = resolveComparison(fixture.state, fixture.sequence, {
    host: fixture.host, owner, decision: fixtureDecision(fixture, ['8', '8', '8', '8', '8']),
    gateSet: fixtureGateSet(fixture), candidateIdentity: fixture.candidate.candidateIdentity, candidateWriteSet: fixture.writeSet,
  });
  const closed = closeEvaluationSequence(kept.state, /** @type {string} */ (fixture.sequence.sequenceIdentity), {
    owner, reason: 'task-completed', comparisonEventHashes: [kept.event.eventHash], learningReviewEventHashes: [],
  });
  const history = { currentRunRecords: owner.acquireCurrentRunRecords(), laneEventLines: owner.acquireLaneEventLines() };
  const summary = renderAuditSummary(closed.state, history, {
    tasksAttempted: [SECOND_TASK_KEY, TASK_KEY],
    tasksCompleted: [TASK_KEY],
    tasksSkipped: [],
    tasksBlocked: [],
    cycles: [
      { target: canonicalTarget(TARGET), kind: 'objective', eventHash: kept.event.eventHash },
      { target: canonicalTarget(TARGET), kind: 'objective', eventHash: closed.event.eventHash },
      { target: canonicalTarget(TARGET), kind: 'recovery', reason: 'Recovered after a failed attempt.' },
    ],
    objectiveSequences: [
      { target: canonicalTarget(TARGET), taskKey: TASK_KEY, sequenceIdentity: fixture.sequence.sequenceIdentity, contractHash: fixture.contractHash, outcome: 'kept', closeEventHash: closed.event.eventHash },
    ],
    filesChanged: ['src/a.mjs'],
    verificationOutcomes: ['candidate-bound-completion passed'],
    autonomousDecisions: ['Kept a materially better candidate.'],
    remainingRisks: [],
  });
  assert.deepEqual(Object.keys(summary).sort(), [
    'autonomousDecisions', 'cycles', 'filesChanged', 'objectiveSequences', 'remainingRisks',
    'tasksAttempted', 'tasksBlocked', 'tasksCompleted', 'tasksSkipped', 'verificationOutcomes',
  ]);
  assert.deepEqual(summary.tasksAttempted, [TASK_KEY, SECOND_TASK_KEY].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
  assert.equal(summary.cycles.find((cycle) => cycle.eventHash === kept.event.eventHash).reason, 'keep');
  assert.equal(summary.cycles.find((cycle) => cycle.eventHash === closed.event.eventHash).reason, 'task-completed');
  const recoveryCycle = summary.cycles.find((cycle) => cycle.kind === 'recovery');
  assert.ok(!Object.hasOwn(recoveryCycle, 'eventHash'));
  assert.equal(summary.objectiveSequences[0].outcome, 'kept');
  assert.equal(summary.objectiveSequences[0].closeEventHash, closed.event.eventHash);
});

test('T006h: audit enforces cycle eventHash rules and a guarded empty objectiveSequences array', () => {
  const base = {
    tasksAttempted: [], tasksCompleted: [], tasksSkipped: [], tasksBlocked: [],
    cycles: [], objectiveSequences: [], filesChanged: [], verificationOutcomes: [], autonomousDecisions: [], remainingRisks: [],
  };
  const empty = { currentRunRecords: [], laneEventLines: [] };
  const summary = renderAuditSummary(emptyState(), empty, base);
  assert.deepEqual(summary.objectiveSequences, []);
  assert.deepEqual(summary.cycles, []);
  // A recovery cycle cannot carry an eventHash.
  assert.throws(() => renderAuditSummary(emptyState(), empty, { ...base, cycles: [{ target: canonicalTarget(TARGET), kind: 'recovery', reason: 'x', eventHash: '1'.repeat(64) }] }), /unknown field/);
  // An objective cycle requires an eventHash present on the surface.
  assert.throws(() => renderAuditSummary(emptyState(), empty, { ...base, cycles: [{ target: canonicalTarget(TARGET), kind: 'objective', reason: 'x' }] }), /unknown field|missing field/);
  assert.throws(() => renderAuditSummary(emptyState(), empty, { ...base, cycles: [{ target: canonicalTarget(TARGET), kind: 'objective', eventHash: '1'.repeat(64) }] }), /must match a freshly reacquired/);
  // The reserved no-objective outcome is not admitted.
  assert.throws(() => renderAuditSummary(emptyState(), empty, { ...base, objectiveSequences: [{ target: canonicalTarget(TARGET), taskKey: TASK_KEY, sequenceIdentity: '1'.repeat(64), contractHash: '2'.repeat(64), outcome: 'no-objective' }] }), /must be one of/);
});

test('T006i: authorize carries objective arrays forward unchanged and leaves guarded output absent', () => {
  const fixture = objectiveSequenceFixture();
  const seqState = { ...emptyState({ recover: true }), evaluationSequences: [fixture.sequence] };
  const raw = transitionRaw(TARGET);
  const inspection = buildInspection(TARGET, collectEvidence(TARGET, raw, {}, 'guarded'));
  const assessment = transitionAssessment('retry-task', { evidenceHash: inspection.evidenceHash });
  const authorized = authorizeRuntimeAttempt(seqState, TARGET, raw, assessment, 'recovery');
  assert.equal(authorized.authorized, true);
  assert.deepEqual(authorized.state.evaluationSequences, [fixture.sequence]);
  assert.ok(!Object.hasOwn(authorized.state, 'learningReviewRefs'));

  // Guarded no-objective input stays byte-identical: both optional arrays absent, no sequence/event/projection.
  const bare = authorizeRuntimeAttempt(emptyState({ recover: true }), TARGET, raw, assessment, 'recovery');
  assert.ok(!Object.hasOwn(bare.state, 'evaluationSequences'));
  assert.ok(!Object.hasOwn(bare.state, 'learningReviewRefs'));
});


