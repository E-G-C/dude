// @ts-check

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, test as nodeTest } from 'node:test';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { applyLightweightWorkRequest } from '../dude-lightweight-execution/board.mjs';
import { parseVisibleTasks } from '../dude-engine/lib/tasks.mjs';
import { buildLightweightWorkPostimages } from '../dude-engine/lib/lightweight-work-postimage.mjs';
import {
  approachHash,
  buildApproachOccurrenceEventV1,
  captureCompletionV2,
  canonicalJson,
  canonicalTarget,
  capacityDiagnostic,
  capturedBytesV1,
  classifyOutcomeReason,
  commitLaneReceiptV2,
  contentDescriptor,
  currentRunCapture,
  deriveEarliestRepeatRelationshipV1,
  deriveFailedApproachSetV1,
  deriveSequenceIdentity,
  describeUnattendedHalt,
  inspect,
  inspectRetainedOccurrencesV2,
  modelPacket,
  normalizeIndependentReviewEnvelopeV2,
  normalizeVerificationEnvelopeV2,
  OUTCOME_REASON_CLASSES,
  prepareProjectionV2,
  requiredChecksForAction,
  resumeGovernanceV2,
  runCommand,
  sha256,
  targetHash,
  targetKey,
  validateAssessment,
  validateRecoveryRuntimeResultV1,
  validateRunState,
} from './recovery.mjs';
import { buildSpecialistAttestation } from './specialist-attestation.mjs';
import * as hostAdapterModule from './host-adapter.mjs';
import { runHostAdapter } from './host-adapter-runner.mjs';
import {
  acquisitionMetrics,
  appendRetentionPair,
  buildRetentionPair,
  cloneCanonical,
  currentRunRecords,
  expandModelPacket,
  mandatoryCompletionHeadroom,
  measurePrivateModelView,
  measurePrivatePreflight,
  originalAvailableProjection,
  publishCurrentRun,
  rawSourceCount,
  readRetentionEpisodeFixture,
  renderPrivateModelProjection,
  withHistoryIncidentWorkspace,
  withReferenceWorkspace,
} from '../../../scripts/fixtures/064-work-receipt-overflow-handling/model-view-test-helpers.mjs';

// Let completed test reports and child I/O drain before another CPU-heavy fixture.
beforeEach(() => yieldToEventLoop());

const {
  createHostAdapter: createAuthorizedHostAdapter,
  createTemporaryCheckpointStore,
  handoffHostWorker,
  prepareSpecialistResult,
  resumeHostAdapter,
  validateHostAdapterRequest,
  validateHostAdapterResult,
  validateHostAdapterSession,
} = hostAdapterModule;

const TARGET = Object.freeze({
  specPath: '.dude/specs/018-autonomous-runstate-continuity/spec.md',
  lane: 'lightweight',
  taskKey: 'T001@61646170',
});
const BACKLOG_CLI = fileURLToPath(new URL('../dude-lightweight-execution/backlog.mjs', import.meta.url));
const SECOND_TARGET = Object.freeze({
  specPath: TARGET.specPath,
  lane: 'lightweight',
  taskKey: 'T002@63686b70',
});
const MATERIAL_INPUTS = Object.freeze({
  targets: ['src/skills/dude-work/host-adapter.mjs'],
  operations: ['execute-task'],
  checks: ['verification'],
});
// Four sorted, unique material targets, so index 3 is the exact slot a trailing
// slash occupies in the motivating Assessment rejection.
const SORTED_MATERIAL_TARGETS = Object.freeze([
  TARGET.specPath,
  'src/skills/dude-work/host-adapter-runner.mjs',
  'src/skills/dude-work/host-adapter.mjs',
  'src/skills/dude-work/recovery.mjs',
]);

/** @param {unknown} value */
function clone(value) {
  return JSON.parse(canonicalJson(value));
}

/** @param {'guarded'|'autonomous'} [mode] */
function pendingState(mode = 'guarded') {
  const pending = {
    target: clone(TARGET),
    evidenceHash: sha256('authorization-evidence'),
    approachHash: approachHash({ action: 'execute-task', materialInputs: MATERIAL_INPUTS }),
    action: 'execute-task',
    materialInputs: clone(MATERIAL_INPUTS),
    mode: 'ordinary',
  };
  const state = {
    policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, mode },
    overallUsed: 1,
    recoveryUsed: [],
    pending: [pending],
    completed: [],
  };
  validateRunState(state);
  return state;
}

function guardedResult(overrides = {}) {
  return {
    outcome: 'succeeded',
    operations: ['execute-task'],
    changedTargets: ['src/skills/dude-work/host-adapter.mjs'],
    checks: { verification: 'passed', lint: 'none', review: 'none' },
    ...overrides,
  };
}

/**
 * The sole structured Tester and Reviewer results an ordinary autonomous request
 * carries. It names no identity, dispatch fact, capture, or route.
 * @param {string} label @param {'accepted'|'rejected'} [verdict]
 */
function specialistResult(label, verdict = 'rejected') {
  const definition = `focused check:${label}`;
  return {
    outcome: verdict === 'accepted' ? 'succeeded' : 'blocked',
    operations: ['execute-task'],
    changedTargets: [],
    verification: {
      checks: [{ definition, outcome: 'passed', evidence: `check evidence:${label}` }],
    },
    review: {
      verdict,
      findings: verdict === 'accepted' ? [] : [{
        basis: {
          expectation: { kind: 'governing-rule', reference: `governing rule:${label}` },
          subjects: [TARGET.taskKey],
          failureClass: 'review-rejection',
          checkDefinition: definition,
        },
        observation: { kind: 'observed-evidence', evidence: `observed evidence:${label}` },
      }],
    },
  };
}

/** @param {Record<string, unknown>} [overrides] */
function sealedInitial(overrides = {}) {
  return {
    state: pendingState(),
    target: clone(TARGET),
    inspectionIdentity: sha256('sealed-inspection'),
    ...overrides,
  };
}

/** @param {Record<string, unknown>} request @param {Record<string, unknown>} body */
function admissionIdentity(request, body) {
  return sha256(canonicalJson({ request, response: body }));
}

let supervisorPortOrdinal = 0;

/** @param {{admit?:(request:Record<string, unknown>,identity:string)=>unknown,identity?:string}} [overrides] */
function sealedSupervisorSession(overrides = {}) {
  const portOrdinal = supervisorPortOrdinal += 1;
  const identity = overrides.identity || sha256(`sealed-supervisor-session:${portOrdinal}`);
  let ordinal = 0;
  return {
    identity,
    admit(request) {
      ordinal += 1;
      if (overrides.admit) return overrides.admit(request, identity);
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        invocationIdentity: request.mode === 'replacement'
          ? request.invocationIdentity
          : sha256(`sealed-supervisor-invocation:${portOrdinal}:${ordinal}`),
        workerToken: sha256(`sealed-supervisor-worker:${portOrdinal}:${ordinal}`),
        workerGeneration: request.mode === 'replacement' ? request.priorWorkerGeneration + 1 : ordinal,
        supervisorAuthorityIdentity: identity,
      };
      return { ...body, admissionIdentity: admissionIdentity(request, body) };
    },
  };
}

/** @param {Record<string, unknown>} request @param {Record<string, unknown>} capture @param {Record<string, unknown>} [overrides] */
function sealedNoEffectResult(request, capture, overrides = {}) {
  const body = {
    version: 1,
    probeIdentity: request.probeIdentity,
    operationIdentity: request.operationIdentity,
    authorityIdentity: capture.authorityIdentity,
    incidentIdentity: request.incidentIdentity,
    classification: 'no-effect',
    authoritativePreIdentity: capture.authoritativePreIdentity,
    authoritativePostIdentity: capture.authoritativePreIdentity,
    effectIdentity: null,
    ...overrides,
  };
  return { ...body, resultIdentity: sha256(canonicalJson({ request, response: body })) };
}

/** @param {{capture?:(request:Record<string, unknown>)=>unknown,classify?:(request:Record<string, unknown>,capture:Record<string, unknown>,captures:Map<string,Record<string, unknown>>)=>unknown,identity?:string}} [overrides] */
function sealedNoEffectAuthority(overrides = {}) {
  const identity = overrides.identity || sha256('sealed-no-effect-authority');
  const captures = new Map();
  return {
    identity,
    capture(request) {
      if (overrides.capture) return overrides.capture(request);
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        operationIdentity: request.operationIdentity,
        authorityIdentity: identity,
        authoritativePreIdentity: sha256(`pre:${request.operationIdentity}`),
      };
      const result = {
        ...body,
        probeIdentity: sha256(canonicalJson({ request, response: body })),
      };
      captures.set(result.probeIdentity, result);
      return result;
    },
    classify(request) {
      const capture = captures.get(request.probeIdentity);
      if (overrides.classify) return overrides.classify(request, capture, captures);
      return sealedNoEffectResult(request, capture);
    },
  };
}

/** @param {unknown} initial @param {unknown} [dependencies] */
function createHostAdapter(initial, dependencies = {}) {
  return createAuthorizedHostAdapter(initial, {
    supervisorSession: sealedSupervisorSession(),
    noEffectAuthority: sealedNoEffectAuthority(),
    .../** @type {Record<string, unknown>} */ (dependencies),
  });
}

/** @param {'guarded'|'autonomous'} [mode] */
function emptyState(mode = 'guarded') {
  const state = {
    policy: { overall: 3, recovery: 1, recover: true, untilBlocked: false, mode },
    overallUsed: 0,
    recoveryUsed: [],
    pending: [],
    completed: [],
  };
  validateRunState(state);
  return state;
}

/** @param {ReturnType<typeof createHostAdapter>} adapter @param {string} operation @param {Record<string, unknown>} payload @param {Record<string, unknown>} [overrides] */
function sealedRequest(adapter, operation, payload, overrides = {}) {
  const current = adapter.snapshot();
  return {
    version: 1,
    operation,
    expectedSessionIdentity: current.sessionIdentity,
    expectedAcceptedRevision: current.acceptedRevision,
    expectedHostRevision: current.hostRevision,
    ...payload,
    ...overrides,
  };
}

/** @param {ReturnType<typeof createHostAdapter>} adapter @param {Record<string, unknown>} [result] */
function sealedResultRequest(adapter, result = guardedResult()) {
  return sealedRequest(adapter, 'record-attempt-result', {
    attemptResult: { input: { captured: true }, result },
  });
}

/** @param {unknown} output */
function sealedPorts(output) {
  return {
    runtime: {
      identity: sha256('sealed-runtime'),
      invoke(command, lowLevelRequest) {
        return typeof output === 'function' ? output(command, lowLevelRequest) : clone(output);
      },
    },
  };
}

nodeTest('sealed public API removes caller-authored incidents and low-level route selection', () => {
  const adapter = createHostAdapter(sealedInitial());
  const valid = sealedResultRequest(adapter);
  assert.equal(validateHostAdapterRequest(valid).operation, 'record-attempt-result');
  for (const reserved of ['route', 'mode', 'command', 'transition']) {
    assert.throws(
      () => validateHostAdapterRequest({ ...valid, [reserved]: 'complete' }),
      new RegExp(`must not select the low-level '${reserved}'`),
    );
  }
  assert.throws(() => validateHostAdapterRequest({ ...valid, operation: 'report-host-incident' }), /must be one of/);
  // Every low-level route, transition mode, and the exceptional internal
  // incident-correction path stays unreachable as an ordinary operation.
  for (const lowLevel of [
    'complete', 'complete.capture', 'complete.finalize', 'learn', 'authorize', 'inspect',
    'transition', 'audit', 'verify-projection', 'prepare-projection', 'issue-attempt-permit',
    'issue-lane-permit', 'incident-correction',
  ]) {
    assert.throws(
      () => validateHostAdapterRequest({ ...valid, operation: lowLevel }),
      /HostAdapterRequest.operation must be one of/,
      lowLevel,
    );
  }
  assert.deepEqual(Object.keys(hostAdapterModule).sort(), [
    'createHostAdapter',
    'createTemporaryCheckpointStore',
    'handoffHostWorker',
    'prepareSpecialistResult',
    'resumeHostAdapter',
    'validateHostAdapterRequest',
    'validateHostAdapterResult',
    'validateHostAdapterSession',
  ]);
  assert.deepEqual(Object.keys(adapter).sort(), ['end', 'ownership', 'run', 'snapshot']);
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession: sealedSupervisorSession(),
      noEffectAuthority: sealedNoEffectAuthority(),
      termination: { terminateWork() {}, terminateShell() {}, terminateWorker() {} },
    }),
    /unknown field 'termination'/,
  );
});

nodeTest('the closed semantic operation set composes every ordinary runtime route', () => {
  const source = fs.readFileSync(new URL('./host-adapter.mjs', import.meta.url), 'utf8');
  const adapter = createHostAdapter(sealedInitial({ state: pendingState('autonomous') }));
  const operations = [
    ['fresh-inspection', { input: { captured: true } }],
    ['authorize-attempt', {
      authorization: {
        input: {},
        assessment: {
          evidenceHash: sha256('closed-operation-evidence'),
          intent: 'unchanged',
          action: 'execute-task',
          materialInputs: clone(MATERIAL_INPUTS),
          equivalence: 'distinct',
          retention: 'transient',
          summary: 'Execute the inspected task.',
        },
      },
    }],
    ['record-attempt-result', { attemptResult: { input: {}, result: specialistResult('closed-operations') } }],
    ['settle-effect', { input: {} }],
    ['advance-governance', { governance: { action: 'controlled-end', input: {} } }],
    ['prepare-authoritative-projection', { projection: { input: {} } }],
    ['authorize-lane-effect', { laneEffect: { input: {}, mutation: {}, lanePrestate: {}, targetMapping: {} } }],
    ['apply-lane-effect', {
      laneApplication: { root: '/tmp/x', owner: {}, permit: {}, mapping: {}, expected: {}, mutation: {} },
    }],
    ['commit-lane-receipt', { laneReceipt: { input: {}, permit: {}, receipt: {} } }],
    ['audit-run', { audit: { input: {} } }],
  ];
  for (const [operation, payload] of operations) {
    const request = sealedRequest(adapter, operation, /** @type {Record<string, unknown>} */ (payload));
    assert.equal(
      validateHostAdapterRequest(request, adapter.snapshot().acceptedState).operation,
      operation,
    );
    // No operation accepts a foreign payload, so no route can be smuggled in.
    assert.throws(
      () => validateHostAdapterRequest({ ...request, projectionBatch: {} }, adapter.snapshot().acceptedState),
      /contains unknown field 'projectionBatch'/,
      operation,
    );
  }
  // The lane owner is the board module boundary, never a command line or edit.
  assert.match(source, /import \{ applyLightweightWorkRequest \} from '\.\.\/dude-lightweight-execution\/board\.mjs'/);
  for (const forbidden of ['child_process', 'execFileSync', 'spawnSync', 'board.mjs set']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

nodeTest('trusted supervisor admission accepts fresh empty and legitimate non-empty RunState', () => {
  for (const state of [emptyState(), pendingState()]) {
    let admissionRequest;
    const initial = sealedInitial({ state });
    const adapter = createHostAdapter(initial, {
      supervisorSession: sealedSupervisorSession({
        admit(request, identity) {
          admissionRequest = request;
          assert.equal(Object.isFrozen(request), true);
          assert.equal(Object.isFrozen(request.target), true);
          const body = {
            version: 1,
            requestIdentity: request.requestIdentity,
            invocationIdentity: sha256(`explicit-invocation:${request.acceptedStateHash}`),
            workerToken: sha256(`explicit-worker:${request.acceptedStateHash}`),
            workerGeneration: 1,
            supervisorAuthorityIdentity: identity,
          };
          return { ...body, admissionIdentity: admissionIdentity(request, body) };
        },
      }),
    });
    initial.target.taskKey = 'T999@ffffffff';
    const snapshot = adapter.snapshot();
    assert.equal(snapshot.acceptedStateBytes, canonicalJson(state));
    assert.equal(snapshot.acceptedRevision, 0);
    assert.equal(snapshot.hostRevision, 0);
    assert.equal(snapshot.status, 'active');
    assert.deepEqual(Object.keys(admissionRequest).sort(), [
      'acceptedRevision',
      'acceptedStateBytes',
      'acceptedStateHash',
      'hostRevision',
      'inspectionIdentity',
      'mode',
      'requestIdentity',
      'runtimeAuthorityIdentity',
      'target',
      'version',
    ]);
    assert.equal(admissionRequest.mode, 'initial');
    assert.equal(admissionRequest.acceptedStateBytes, canonicalJson(state));
    assert.equal(admissionRequest.acceptedStateHash, sha256(canonicalJson(state)));
    assert.equal(admissionRequest.acceptedRevision, 0);
    assert.equal(admissionRequest.hostRevision, 0);
    assert.equal(admissionRequest.inspectionIdentity, sha256('sealed-inspection'));
    assert.deepEqual(admissionRequest.target, TARGET);
  }
});

nodeTest('supervisor admission is required, exact, one-shot, and snapshot authority is data-only', () => {
  const noEffectAuthority = sealedNoEffectAuthority();
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), { noEffectAuthority }),
    /supervisorSession/,
  );
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession: {},
      noEffectAuthority,
    }),
    /supervisorSession/,
  );
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession: sealedSupervisorSession(),
    }),
    /noEffectAuthority/,
  );
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession: sealedSupervisorSession(),
      noEffectAuthority: { identity: sha256('fake-no-effect-authority') },
    }),
    /noEffectAuthority/,
  );

  const supervisorSession = sealedSupervisorSession();
  const adapter = createAuthorizedHostAdapter(sealedInitial(), {
    supervisorSession,
    noEffectAuthority,
  });
  const snapshot = adapter.snapshot();
  assert.equal(canonicalJson(snapshot).includes('admit'), false);
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession,
      noEffectAuthority: sealedNoEffectAuthority(),
    }),
    /one unused trusted port identity/,
  );
  assert.throws(
    () => createAuthorizedHostAdapter({
      state: snapshot.acceptedState,
      target: snapshot.target,
      inspectionIdentity: snapshot.inspectionIdentity,
    }, { noEffectAuthority: sealedNoEffectAuthority() }),
    /supervisorSession/,
  );
});

nodeTest('supervisor admission consumes semantic authority identity across distinct wrappers', () => {
  const identity = sha256('replayed-supervisor-authority');
  let replayCalls = 0;
  const first = createAuthorizedHostAdapter(sealedInitial(), {
    supervisorSession: sealedSupervisorSession({ identity }),
    noEffectAuthority: sealedNoEffectAuthority(),
  });
  assert.equal(first.snapshot().authorities.supervisorAuthorityIdentity, identity);

  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession: sealedSupervisorSession({
        identity,
        admit() {
          replayCalls += 1;
          throw new Error('replayed authority must not be invoked');
        },
      }),
      noEffectAuthority: sealedNoEffectAuthority(),
    }),
    /unused trusted .*identity/,
  );
  assert.equal(replayCalls, 0);
});

nodeTest('supervisor admission consumes the admitted invocation identity across distinct ports', () => {
  const first = createHostAdapter(sealedInitial());
  const invocationIdentity = first.snapshot().invocationIdentity;
  assert.throws(
    () => createAuthorizedHostAdapter(sealedInitial(), {
      supervisorSession: sealedSupervisorSession({
        admit(request, identity) {
          const body = {
            version: 1,
            requestIdentity: request.requestIdentity,
            invocationIdentity,
            workerToken: sha256('replayed-worker'),
            workerGeneration: 1,
            supervisorAuthorityIdentity: identity,
          };
          return { ...body, admissionIdentity: admissionIdentity(request, body) };
        },
      }),
      noEffectAuthority: sealedNoEffectAuthority(),
    }),
    /invocationIdentity must not replay a prior admitted invocation identity/,
  );
  const unchanged = first.snapshot();
  assert.equal(unchanged.invocationIdentity, invocationIdentity);
  assert.equal(unchanged.status, 'active');
  assert.equal(unchanged.acceptedRevision, 0);
  assert.equal(unchanged.hostRevision, 0);

  const fresh = createHostAdapter(sealedInitial());
  assert.notEqual(fresh.snapshot().invocationIdentity, invocationIdentity);
  assert.equal(fresh.snapshot().status, 'active');
});

nodeTest('supervisor admission rejects malformed and mismatched closed results', () => {
  for (const [label, admit] of [
    ['malformed', () => ({ admitted: true })],
    ['request mismatch', (request, identity) => {
      const body = {
        version: 1,
        requestIdentity: sha256('wrong-request'),
        invocationIdentity: sha256('mismatched-invocation'),
        workerGeneration: 1,
        supervisorAuthorityIdentity: identity,
      };
      return { ...body, admissionIdentity: admissionIdentity(request, body) };
    }],
    ['identity mismatch', (request) => {
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        invocationIdentity: sha256('mismatched-identity'),
        workerGeneration: 1,
        supervisorAuthorityIdentity: sha256('wrong-supervisor'),
      };
      return { ...body, admissionIdentity: admissionIdentity(request, body) };
    }],
    ['admission mismatch', (request, identity) => {
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        invocationIdentity: sha256('mismatched-admission'),
        workerGeneration: 1,
        supervisorAuthorityIdentity: identity,
      };
      return { ...body, admissionIdentity: sha256('wrong-admission') };
    }],
  ]) {
    assert.throws(
      () => createAuthorizedHostAdapter(sealedInitial(), {
        supervisorSession: sealedSupervisorSession({ admit }),
        noEffectAuthority: sealedNoEffectAuthority(),
      }),
      /supervisor admission/,
      label,
    );
  }
});

nodeTest('deterministic construction validation does not consume supervisor admission', () => {
  const supervisorSession = sealedSupervisorSession();
  assert.throws(
    () => createAuthorizedHostAdapter({ ...sealedInitial(), inspectionIdentity: 'invalid' }, {
      supervisorSession,
      noEffectAuthority: sealedNoEffectAuthority(),
    }),
    /inspectionIdentity must be a lowercase SHA-256 hash/,
  );
  const adapter = createAuthorizedHostAdapter(sealedInitial(), {
    supervisorSession,
    noEffectAuthority: sealedNoEffectAuthority(),
  });
  assert.equal(adapter.snapshot().status, 'active');
});

nodeTest('adapter construction takes no process-global target lock without a checkpoint store', () => {
  const first = createHostAdapter(sealedInitial());
  const second = createHostAdapter(sealedInitial());
  assert.notEqual(first.snapshot().invocationIdentity, second.snapshot().invocationIdentity);
  assert.equal(first.snapshot().acceptedStateHash, second.snapshot().acceptedStateHash);
  assert.deepEqual(Object.keys(first).sort(), ['end', 'ownership', 'run', 'snapshot']);
  assert.deepEqual(Object.keys(second).sort(), ['end', 'ownership', 'run', 'snapshot']);
  assert.equal(first.ownership(), null);
});

nodeTest('sealed current authority rejects stale session and host revisions before runtime invocation', () => {
  let calls = 0;
  const adapter = createHostAdapter(sealedInitial(), sealedPorts(() => {
    calls += 1;
    return { status: 'empty' };
  }, { verify: true }));
  const stale = sealedResultRequest(adapter);
  const first = adapter.run({ ...stale, route: 'forbidden' });
  assert.equal(first.outcome, 'closed-refusal');
  assert.equal(calls, 0);
  const replay = adapter.run(stale);
  assert.equal(replay.outcome, 'hard-stop');
  assert.equal(replay.reason, 'adapter-session-mismatch');
  assert.equal(calls, 0);
});

const RUNTIME_ANOMALIES = Object.freeze([
  ['malformed', { nonsense: true }, 'runtime-output-malformed'],
  ['empty', { status: 'empty' }, 'runtime-output-empty'],
  ['nonzero', { status: 'nonzero', code: 2 }, 'runtime-nonzero'],
  ['non-authoritative returned', { status: 'returned', value: { malformed: true } }, 'runtime-result-not-authoritative'],
  ['empty returned value', { status: 'returned', value: '' }, 'runtime-output-empty'],
  ['malformed nonzero', { status: 'nonzero', code: -1 }, 'runtime-output-malformed'],
  ['throw', () => { throw new Error('runtime died'); }, 'runtime-threw'],
]);

/** The accepted authority that a no-effect refusal is forbidden to charge. @param {Record<string, unknown>} session */
function acceptedAuthorityTuple(session) {
  const accepted = /** @type {Record<string, unknown>} */ (session.acceptedState);
  return {
    acceptedStateBytes: session.acceptedStateBytes,
    acceptedStateHash: session.acceptedStateHash,
    acceptedRevision: session.acceptedRevision,
    overallUsed: accepted.overallUsed,
    recoveryUsed: clone(accepted.recoveryUsed),
    pending: clone(accepted.pending),
    completed: clone(accepted.completed),
  };
}

nodeTest('runtime anomalies with fresh exact no-effect proof close without state or attempt charge', () => {
  for (const [label, anomaly, reason] of RUNTIME_ANOMALIES) {
    withSealedWorkspace((root) => {
      const input = sealedInspectionInput(root);
      const initialInspection = inspect(input);
      const inspectionIdentity = sha256(canonicalJson(initialInspection));
      let calls = 0;
      const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }), sealedPorts((command, request) => {
        calls += 1;
        if (calls <= 2) return typeof anomaly === 'function' ? anomaly(command, request) : anomaly;
        return { status: 'returned', value: runCommand(command, request) };
      }));
      const predecessor = adapter.snapshot();
      const acceptedPredecessor = acceptedAuthorityTuple(predecessor);
      const first = adapter.run(sealedResultRequest(adapter));
      assert.equal(first.outcome, 'closed-refusal', label);
      assert.equal(first.reason, reason, label);
      assert.equal(first.nonterminal, true, label);
      assert.equal(first.next.kind, 'correction', label);
      assert.deepEqual(acceptedAuthorityTuple(first.session), acceptedPredecessor, label);
      assert.equal(first.session.hostRevision, predecessor.hostRevision + 1, label);

      const correction = sealedResultRequest(adapter);
      correction.correctionIdentity = first.next.correctionIdentity;
      const corrected = adapter.run(correction);
      assert.equal(corrected.outcome, 'closed-refusal', label);
      assert.equal(corrected.nonterminal, true, label);
      assert.equal(corrected.next.kind, 'inspect', label);
      assert.equal(corrected.session.correction.consumed, true, label);
      assert.deepEqual(acceptedAuthorityTuple(corrected.session), acceptedPredecessor, label);
      assert.ok(corrected.session.hostRevision > first.session.hostRevision, label);

      // The second capture is a new occurrence over exactly unchanged authority:
      // content identity remains stable while occurrence identity must advance.
      const unchangedRecapture = inspect(input);
      assert.equal(unchangedRecapture.evidenceHash, initialInspection.evidenceHash, label);
      const refreshed = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
      assert.equal(refreshed.outcome, 'accepted', label);
      assert.equal(refreshed.reason, 'inspection-refreshed', label);
      assert.equal(refreshed.session.correction, null, label);
      assert.notEqual(refreshed.session.inspectionIdentity, inspectionIdentity, label);
      assert.equal(refreshed.session.status, 'active', label);
      assert.deepEqual(acceptedAuthorityTuple(refreshed.session), acceptedPredecessor, label);
      assert.equal(calls, 3, label);
    });
  }
});

/** @param {string} mode */
function refusingNoEffectAuthority(mode) {
  let replayedResult;
  return sealedNoEffectAuthority({
    classify(request, capture) {
      if (mode === 'missing') throw new Error('authority unavailable');
      if (mode === 'malformed') return { classification: 'no-effect' };
      if (mode === 'stale') {
        return sealedNoEffectResult(request, capture, {
          authoritativePreIdentity: sha256('stale-pre-identity'),
          authoritativePostIdentity: sha256('stale-pre-identity'),
        });
      }
      if (mode === 'replayed') {
        if (replayedResult) return replayedResult;
        replayedResult = sealedNoEffectResult(request, capture);
        return replayedResult;
      }
      if (mode === 'mismatched') {
        return sealedNoEffectResult(request, capture, {
          operationIdentity: sha256('wrong-operation'),
        });
      }
      if (mode === 'effect-observed') {
        return sealedNoEffectResult(request, capture, {
          classification: 'effect-observed',
          authoritativePostIdentity: sha256('post-effect'),
          effectIdentity: sha256('observed-effect'),
        });
      }
      return sealedNoEffectResult(request, capture, {
        classification: 'indeterminate',
        authoritativePostIdentity: sha256('indeterminate-post'),
      });
    },
  });
}

nodeTest('runtime anomalies without fresh exact no-effect proof hard-stop on the accepted predecessor', () => {
  const modes = ['missing', 'malformed', 'stale', 'mismatched', 'effect-observed', 'indeterminate'];
  for (const [label, anomaly] of RUNTIME_ANOMALIES) {
    for (const mode of modes) {
      const predecessor = pendingState();
      const adapter = createHostAdapter(sealedInitial({ state: predecessor }), {
        ...sealedPorts(anomaly),
        noEffectAuthority: refusingNoEffectAuthority(mode),
      });
      const stopped = adapter.run(sealedResultRequest(adapter));
      assert.equal(stopped.outcome, 'hard-stop', `${label}:${mode}`);
      assert.equal(stopped.session.acceptedStateBytes, canonicalJson(predecessor), `${label}:${mode}`);
      assert.equal(stopped.session.acceptedRevision, 0, `${label}:${mode}`);
    }
  }
});

nodeTest('replayed no-effect classification cannot authorize any later anomaly', () => {
  for (const [label, anomaly] of RUNTIME_ANOMALIES) {
    const authority = refusingNoEffectAuthority('replayed');
    const first = createHostAdapter(sealedInitial(), {
      ...sealedPorts(anomaly),
      noEffectAuthority: authority,
    });
    assert.equal(first.run(sealedResultRequest(first)).outcome, 'closed-refusal', label);
    const second = createHostAdapter(sealedInitial(), {
      ...sealedPorts(anomaly),
      noEffectAuthority: authority,
    });
    const stopped = second.run(sealedResultRequest(second));
    assert.equal(stopped.outcome, 'hard-stop', label);
    assert.equal(stopped.session.acceptedRevision, 0, label);
  }
});

nodeTest('action mismatch consumes one correction without a termination capability', () => {
  let calls = 0;
  const adapter = createHostAdapter(sealedInitial(), sealedPorts((command, lowLevelRequest) => {
    calls += 1;
    return { status: 'returned', value: runCommand(command, lowLevelRequest) };
  }));
  const mismatchResult = guardedResult({ operations: ['wrong-action'] });
  const mismatch = adapter.run(sealedResultRequest(adapter, mismatchResult));
  assert.equal(mismatch.outcome, 'closed-refusal');
  assert.equal(mismatch.reason, 'action-mismatch');
  assert.equal(calls, 1);

  const correctionRequest = sealedResultRequest(adapter, mismatchResult);
  correctionRequest.correctionIdentity = mismatch.next.correctionIdentity;
  const corrected = adapter.run(correctionRequest);
  assert.equal(corrected.outcome, 'closed-refusal');
  assert.equal(corrected.next.kind, 'inspect');
  assert.equal(corrected.session.correction.consumed, true);
  assert.notEqual(corrected.session.correction.identity, mismatch.session.correction.identity);
  assert.equal(calls, 2);

  const replay = adapter.run(correctionRequest);
  assert.equal(replay.outcome, 'hard-stop');
  assert.equal(calls, 2);
});

nodeTest('mandatory Inspection invalidates older unconsumed correction authority', () => {
  let calls = 0;
  const adapter = createHostAdapter(sealedInitial(), sealedPorts((command, lowLevelRequest) => {
    calls += 1;
    return { status: 'returned', value: runCommand(command, lowLevelRequest) };
  }));
  const first = adapter.run({ ...sealedResultRequest(adapter), route: 'forbidden' });
  assert.equal(first.outcome, 'closed-refusal');
  assert.equal(first.next.kind, 'correction');
  const oldCorrectionIdentity = first.next.correctionIdentity;

  const differentIncident = adapter.run({
    ...sealedRequest(adapter, 'authorize-attempt', {}),
    route: 'forbidden',
  });
  assert.equal(differentIncident.outcome, 'reinspect-required');
  assert.equal(differentIncident.next.kind, 'inspect');
  assert.equal(differentIncident.session.correction.consumed, true);
  assert.notEqual(differentIncident.session.correction.identity, oldCorrectionIdentity);

  const ordinary = adapter.run(sealedResultRequest(adapter));
  assert.equal(ordinary.outcome, 'reinspect-required');
  assert.equal(ordinary.next.kind, 'inspect');
  assert.equal(calls, 0);

  const bypass = sealedResultRequest(adapter);
  bypass.correctionIdentity = oldCorrectionIdentity;
  const refused = adapter.run(bypass);
  assert.notEqual(refused.outcome, 'accepted');
  assert.equal(calls, 0);
});

nodeTest('repeated malformed request consumes its correction cap and requires fresh Inspection', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const inspectionIdentity = sha256(canonicalJson(inspect(input)));
    let runtimeCalls = 0;
    let captureCalls = 0;
    let classifyCalls = 0;
    const authority = sealedNoEffectAuthority();
    const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }), {
      ...sealedPorts((command, lowLevelRequest) => {
        runtimeCalls += 1;
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      }),
      noEffectAuthority: {
        identity: authority.identity,
        capture(request) {
          captureCalls += 1;
          return authority.capture(request);
        },
        classify(request) {
          classifyCalls += 1;
          return authority.classify(request);
        },
      },
    });

    const first = adapter.run({ ...sealedResultRequest(adapter), route: 'forbidden' });
    assert.equal(first.outcome, 'closed-refusal');
    assert.equal(first.next.kind, 'correction');
    const oldCorrectionIdentity = first.next.correctionIdentity;

    const repeated = adapter.run({ ...sealedResultRequest(adapter), route: 'forbidden' });
    assert.equal(repeated.outcome, 'reinspect-required');
    assert.equal(repeated.next.kind, 'inspect');
    assert.equal(repeated.session.correction.consumed, true);
    assert.notEqual(repeated.session.correction.identity, oldCorrectionIdentity);
    assert.equal(runtimeCalls, 0);
    assert.equal(captureCalls, 0);
    assert.equal(classifyCalls, 0);

    const replay = adapter.run({
      ...sealedResultRequest(adapter),
      route: 'forbidden',
      correctionIdentity: oldCorrectionIdentity,
    });
    assert.equal(replay.outcome, 'reinspect-required');
    assert.equal(replay.next.kind, 'inspect');
    assert.equal(runtimeCalls, 0);
    assert.equal(captureCalls, 0);
    assert.equal(classifyCalls, 0);

    fs.appendFileSync(path.join(root, `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`), '\n- fresh authoritative evidence\n');
    const refreshed = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
    assert.equal(refreshed.outcome, 'accepted');
    assert.equal(refreshed.reason, 'inspection-refreshed');
    assert.equal(refreshed.session.correction, null);

    const continued = adapter.run(sealedResultRequest(adapter));
    assert.equal(continued.outcome, 'accepted');
    assert.equal(runtimeCalls, 2);
    assert.equal(captureCalls, 2);
    assert.equal(classifyCalls, 0);
  });
});

nodeTest('an identical-authority recapture creates a new occurrence without resetting a consumed correction', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const initialInspection = inspect(input);
    const inspectionIdentity = sha256(canonicalJson(initialInspection));
    const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }));
    const mismatchResult = guardedResult({ operations: ['wrong-action'] });
    const first = adapter.run(sealedResultRequest(adapter, mismatchResult));
    assert.equal(first.outcome, 'closed-refusal');
    const acceptedPredecessor = acceptedAuthorityTuple(first.session);
    const correctionIdentity = first.next.correctionIdentity;
    const correction = sealedResultRequest(adapter, mismatchResult);
    correction.correctionIdentity = correctionIdentity;
    const consumed = adapter.run(correction);
    assert.equal(consumed.outcome, 'closed-refusal');
    assert.equal(consumed.next.kind, 'inspect');
    assert.equal(consumed.session.correction.consumed, true);
    assert.deepEqual(acceptedAuthorityTuple(consumed.session), acceptedPredecessor);

    // A correction is spent for its exact occurrence even if its caller learns
    // the current consumed identity from a session snapshot.
    const sameOccurrenceReplayRequest = sealedResultRequest(adapter, mismatchResult);
    sameOccurrenceReplayRequest.correctionIdentity = consumed.session.correction.identity;
    const sameOccurrenceReplay = adapter.run(sameOccurrenceReplayRequest);
    assert.equal(sameOccurrenceReplay.outcome, 'reinspect-required');
    assert.equal(sameOccurrenceReplay.reason, 'correction-consumed');
    assert.equal(sameOccurrenceReplay.session.correction.consumed, true);
    assert.equal(sameOccurrenceReplay.session.correction.inspectionIdentity, inspectionIdentity);
    assert.deepEqual(acceptedAuthorityTuple(sameOccurrenceReplay.session), acceptedPredecessor);

    // Act: this is a genuinely new capture, not a replay. Its authority content
    // has not changed, so evidence identity stays equal while occurrence identity
    // must change.
    const recaptured = inspect(input);
    assert.equal(recaptured.evidenceHash, initialInspection.evidenceHash);
    const refreshed = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
    assert.equal(refreshed.outcome, 'accepted');
    assert.equal(refreshed.reason, 'inspection-refreshed');
    assert.equal(refreshed.session.correction, null);
    assert.notEqual(refreshed.session.inspectionIdentity, inspectionIdentity);
    assert.deepEqual(acceptedAuthorityTuple(refreshed.session), acceptedPredecessor);
  });
});

nodeTest('an identical-authority recapture clears only its old correction and rejects stale or foreign identities', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const initialInspection = inspect(input);
    const inspectionIdentity = sha256(canonicalJson(initialInspection));
    const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }));
    const mismatchResult = guardedResult({ operations: ['wrong-action'] });
    const earned = adapter.run(sealedResultRequest(adapter, mismatchResult));
    assert.equal(earned.outcome, 'closed-refusal');
    assert.equal(earned.session.correction.consumed, false);
    const correctionIdentity = earned.next.correctionIdentity;
    const acceptedPredecessor = acceptedAuthorityTuple(earned.session);

    // A new capture may clear the unconsumed correction from the older
    // occurrence, but it must not reuse that correction for the new occurrence.
    assert.equal(inspect(input).evidenceHash, initialInspection.evidenceHash);
    const refreshed = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
    assert.equal(refreshed.outcome, 'accepted');
    assert.equal(refreshed.session.correction, null);
    assert.notEqual(refreshed.session.inspectionIdentity, inspectionIdentity);
    assert.deepEqual(acceptedAuthorityTuple(refreshed.session), acceptedPredecessor);

    const rearmed = adapter.run(sealedResultRequest(adapter, mismatchResult));
    assert.equal(rearmed.outcome, 'closed-refusal');
    assert.notEqual(rearmed.next.correctionIdentity, correctionIdentity);
    assert.equal(
      rearmed.session.correction.inspectionIdentity,
      refreshed.session.inspectionIdentity,
      'the new correction binds only the new capture occurrence',
    );
    const staleRequest = sealedResultRequest(adapter, mismatchResult);
    staleRequest.correctionIdentity = correctionIdentity;
    const stale = adapter.run(staleRequest);
    assert.equal(stale.outcome, 'hard-stop');
    assert.equal(stale.reason, 'correction-identity-mismatch');

    // A guessed identity cannot substitute for the currently bound correction.
    const foreignAdapter = createHostAdapter(sealedInitial({ inspectionIdentity }));
    const foreignEarned = foreignAdapter.run(sealedResultRequest(foreignAdapter, mismatchResult));
    assert.equal(foreignEarned.outcome, 'closed-refusal');
    const foreignRequest = sealedResultRequest(foreignAdapter, mismatchResult);
    foreignRequest.correctionIdentity = sha256('foreign-correction-identity');
    const foreign = foreignAdapter.run(foreignRequest);
    assert.equal(foreign.outcome, 'hard-stop');
    assert.equal(foreign.reason, 'correction-identity-mismatch');
  });
});

const LANE_MUTATION = Object.freeze({
  version: 1,
  lane: 'lightweight',
  kind: 'task-completed',
  reason: 'task-completed',
  target: canonicalTarget(TARGET),
  fromGlyph: '~',
  toGlyph: 'x',
  blocker: { kind: 'unchanged', before: null, after: null },
  eventLines: { kind: 'none' },
  ownerLog: { kind: 'none' },
  snapshotUpdatedAt: '2026-01-01T00:00:00Z',
});

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} [overrides] */
function laneMutationPermit(state, overrides = {}) {
  const body = {
    version: 1,
    kind: 'lane-mutation',
    origin: 'dude-work',
    lane: 'lightweight',
    operation: 'work-set',
    target: canonicalTarget(TARGET),
    subjectRunStateHash: sha256(canonicalJson(state)),
    governanceIdentity: null,
    governancePhase: null,
    attemptIdentity: sha256('sealed-accepted-attempt'),
    targetMappingHash: sha256('sealed-target-mapping'),
    lanePrestateHash: sha256('sealed-lane-prestate'),
    mutationIdentity: sha256(canonicalJson(LANE_MUTATION)),
    ...overrides,
  };
  return { ...body, permitHash: sha256(canonicalJson(body)) };
}

/** @param {Record<string, unknown>} permit @param {Record<string, unknown>} [overrides] */
function sealedLaneApplication(permit, overrides = {}) {
  return {
    root: '/tmp/sealed-lane-root',
    owner: {
      ideaPath: '.dude/ideas/018-autonomous-runstate-continuity.md',
      specPath: TARGET.specPath,
      ownerCapture: { base64: '', sha256: sha256(''), byteLength: 0 },
      ownerBindingHash: sha256('sealed-owner-binding'),
    },
    permit: clone(permit),
    mapping: { version: 1 },
    expected: { tasksPath: `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md` },
    mutation: clone(LANE_MUTATION),
    ...overrides,
  };
}

nodeTest('the one-shot recovery notice survives intermediate effects and is consumed exactly once', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const inspectionIdentity = sha256(canonicalJson(inspect(input)));
    const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }));
    const mismatchResult = guardedResult({ operations: ['wrong-action'] });
    const tasksPath = path.join(root, `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`);

    // No incident, no notice.
    const mismatch = adapter.run(sealedResultRequest(adapter, mismatchResult));
    assert.equal(mismatch.outcome, 'closed-refusal');
    assert.equal(Object.hasOwn(mismatch, 'recoveryNotice'), false);
    assert.equal(mismatch.session.recoveryNotice, null);

    // Authorizing the one permitted correction opens the pending notice, and a
    // second closed refusal preserves rather than exposes it.
    const correction = sealedResultRequest(adapter, mismatchResult);
    correction.correctionIdentity = mismatch.next.correctionIdentity;
    const corrected = adapter.run(correction);
    assert.equal(corrected.outcome, 'closed-refusal');
    assert.equal(Object.hasOwn(corrected, 'recoveryNotice'), false);
    assert.deepEqual(corrected.session.recoveryNotice, {
      incidentClassification: 'action-mismatch',
      statePreserved: true,
      resumedAction: 'record-attempt-result',
    });

    // The first successful accepted outcome returns and atomically consumes it.
    fs.appendFileSync(tasksPath, '\n- fresh authoritative evidence\n');
    const resumed = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
    assert.equal(resumed.outcome, 'accepted');
    assert.deepEqual(resumed.recoveryNotice, {
      incidentClassification: 'action-mismatch',
      statePreserved: true,
      resumedAction: 'record-attempt-result',
    });
    assert.equal(resumed.session.recoveryNotice, null);

    // Every later outcome omits it forever.
    const continued = adapter.run(sealedResultRequest(adapter));
    assert.equal(continued.outcome, 'accepted');
    assert.equal(Object.hasOwn(continued, 'recoveryNotice'), false);
    assert.equal(continued.session.recoveryNotice, null);
    fs.appendFileSync(tasksPath, '\n- later authoritative evidence\n');
    const later = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
    assert.equal(later.outcome, 'accepted');
    assert.equal(Object.hasOwn(later, 'recoveryNotice'), false);
  });
});

nodeTest('the recovery notice is a closed typed value that no other outcome may carry', () => {
  const notice = { incidentClassification: 'action-mismatch', statePreserved: true, resumedAction: 'record-attempt-result' };
  const adapter = createHostAdapter(sealedInitial());
  const session = adapter.snapshot();
  assert.equal(session.recoveryNotice, null);
  // Even a well-formed notice cannot be grafted onto a session after the fact.
  assert.throws(
    () => validateHostAdapterSession({ ...session, recoveryNotice: notice }),
    /sessionIdentity must bind the complete session/,
  );
  for (const [label, candidate] of [
    ['missing statePreserved', { incidentClassification: 'action-mismatch', resumedAction: 'fresh-inspection' }],
    ['false statePreserved', { ...notice, statePreserved: false }],
    ['unknown incident class', { ...notice, incidentClassification: 'task-failed' }],
    ['unknown resumed action', { ...notice, resumedAction: 'issue-lane-permit' }],
    ['extra field', { ...notice, renderedAt: 'now' }],
    ['legacy incidentClass field name', { incidentClass: 'action-mismatch', statePreserved: true, resumedAction: 'fresh-inspection' }],
  ]) {
    assert.throws(
      () => validateHostAdapterSession({ ...session, recoveryNotice: candidate }),
      TypeError,
      /** @type {string} */ (label),
    );
  }
});

/** Re-seal a hand-shaped session so its identity binds the altered fields. @param {Record<string, unknown>} session */
function resealedSession(session) {
  const { sessionIdentity: _identity, ...fields } = session;
  return { ...fields, sessionIdentity: sha256(canonicalJson(fields)) };
}

nodeTest('the one-shot notice is structurally inadmissible on every outcome but accepted', () => {
  const notice = { incidentClassification: 'host-process-recovered', statePreserved: true, resumedAction: 'fresh-inspection' };
  const adapter = createHostAdapter(sealedInitial());
  const active = adapter.snapshot();
  const accepted = {
    version: 1,
    outcome: 'accepted',
    reason: 'inspection-refreshed',
    recoveryNotice: clone(notice),
    session: clone(active),
  };
  // The only admissible pairing validates, so no case below passes vacuously.
  assert.equal(validateHostAdapterResult(accepted).outcome, 'accepted');

  const terminal = resealedSession({ ...clone(active), status: 'ended', disposition: 'work-complete' });
  const stopped = resealedSession({ ...clone(active), status: 'hard-stop', disposition: 'request-not-authorized' });
  for (const [label, candidate] of [
    ['closed-refusal', {
      version: 1,
      outcome: 'closed-refusal',
      reason: 'action-mismatch',
      incidentClass: 'action-mismatch',
      nonterminal: true,
      next: { kind: 'inspect' },
      recoveryNotice: clone(notice),
      session: clone(active),
    }],
    ['reinspect-required', {
      version: 1,
      outcome: 'reinspect-required',
      reason: 'correction-consumed',
      nonterminal: true,
      next: { kind: 'inspect' },
      recoveryNotice: clone(notice),
      session: clone(active),
    }],
    ['hard-stop', {
      version: 1,
      outcome: 'hard-stop',
      reason: 'request-not-authorized',
      recoveryNotice: clone(notice),
      session: stopped,
    }],
    ['ended', {
      version: 1,
      outcome: 'ended',
      reason: 'work-complete',
      recoveryNotice: clone(notice),
      session: terminal,
    }],
    ['effect-required', {
      version: 1,
      outcome: 'effect-required',
      reason: 'occurrence-retention-required',
      effect: { kind: 'completion-retention', purpose: 'occurrence-retention', effectIdentity: sha256('effect'), projectionBatch: {} },
      recoveryNotice: clone(notice),
      session: clone(active),
    }],
  ]) {
    assert.throws(
      () => validateHostAdapterResult(candidate),
      /HostAdapterResult contains unknown field 'recoveryNotice'/,
      /** @type {string} */ (label),
    );
  }

  // A terminal session may not even hold the notice pending, so no terminal
  // outcome can be built from one.
  for (const [label, candidate] of [
    ['ended session', { ...clone(active), status: 'ended', disposition: 'work-complete', recoveryNotice: clone(notice) }],
    ['hard-stop session', { ...clone(active), status: 'hard-stop', disposition: 'request-not-authorized', recoveryNotice: clone(notice) }],
  ]) {
    assert.throws(
      () => validateHostAdapterSession(resealedSession(candidate)),
      /must be null once the session is terminal/,
      /** @type {string} */ (label),
    );
  }
});

nodeTest('the primary notice path renders once on the first corrected non-inspection acceptance', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const inspectionIdentity = sha256(canonicalJson(inspect(input)));
    const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }));
    const tasksPath = path.join(root, `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`);

    const mismatch = adapter.run(sealedResultRequest(adapter, guardedResult({ operations: ['wrong-action'] })));
    assert.equal(mismatch.outcome, 'closed-refusal');
    assert.equal(mismatch.incidentClass, 'action-mismatch');

    // The corrected attempt succeeds through record-attempt-result, not through
    // fresh-inspection: this is the FR-025 primary path.
    const corrected = sealedResultRequest(adapter, guardedResult());
    corrected.correctionIdentity = mismatch.next.correctionIdentity;
    const accepted = adapter.run(corrected);
    assert.equal(accepted.outcome, 'accepted');
    assert.equal(accepted.reason, 'completed');
    assert.deepEqual(accepted.recoveryNotice, {
      incidentClassification: 'action-mismatch',
      statePreserved: true,
      resumedAction: 'record-attempt-result',
    });
    assert.equal(accepted.session.recoveryNotice, null);

    // Single render: the next accepted outcome carries nothing.
    fs.appendFileSync(tasksPath, '\n- fresh authoritative evidence\n');
    const later = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));
    assert.equal(later.outcome, 'accepted');
    assert.equal(Object.hasOwn(later, 'recoveryNotice'), false);
    assert.equal(later.session.recoveryNotice, null);
  });
});

nodeTest('no caller-supplied permit or receipt carries lane, close, or settlement authority', () => {
  const state = pendingState('autonomous');
  const permit = laneMutationPermit(state);
  const applications = [];
  const laneOwner = {
    identity: sha256('sealed-lane-owner'),
    apply(request) {
      applications.push(clone(request));
      return { ok: true, phase: 'committed' };
    },
  };

  // A self-consistent permit this worker never issued applies nothing.
  const apply = createHostAdapter(sealedInitial({ state }), { laneOwner });
  const unauthorized = apply.run(sealedRequest(apply, 'apply-lane-effect', {
    laneApplication: sealedLaneApplication(permit),
  }));
  assert.equal(unauthorized.outcome, 'hard-stop');
  assert.equal(unauthorized.reason, 'lane-permit-not-authorized');
  assert.deepEqual(applications, []);

  // The same permit settles nothing, and a malformed permit never becomes generic.
  for (const [label, candidate] of [
    ['unissued permit', permit],
    ['null fallback permit', null],
    ['forged permit hash', { ...permit, permitHash: sha256('forged') }],
  ]) {
    const settle = createHostAdapter(sealedInitial({ state }), { laneOwner });
    const refused = settle.run(sealedRequest(settle, 'commit-lane-receipt', {
      laneReceipt: { input: {}, permit: candidate, receipt: {} },
    }));
    assert.equal(refused.outcome, 'hard-stop', /** @type {string} */ (label));
    assert.equal(refused.reason, 'lane-permit-not-authorized', /** @type {string} */ (label));
    assert.equal(canonicalJson(refused.session.acceptedState), canonicalJson(state), /** @type {string} */ (label));
  }
  assert.deepEqual(applications, []);
});

const TRACKED_TARGET = Object.freeze({
  specPath: TARGET.specPath,
  lane: 'tracked',
  issueId: 'dude-618',
});

nodeTest('a tracked session never reaches the Lightweight-only lane owner', () => {
  const state = emptyState('autonomous');
  const applications = [];
  const laneOwner = {
    identity: sha256('tracked-lane-owner'),
    apply(request) {
      applications.push(clone(request));
      return { ok: true, phase: 'committed' };
    },
  };
  const adapter = createHostAdapter(
    { state, target: clone(TRACKED_TARGET), inspectionIdentity: sha256('tracked-inspection') },
    { laneOwner },
  );
  const permit = laneMutationPermit(state, {
    lane: 'tracked',
    operation: 'work-transition',
    target: canonicalTarget(TRACKED_TARGET),
  });
  const result = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
    laneApplication: sealedLaneApplication(permit),
  }));

  // The gate is the target lane, not the permit ledger: a tracked target stops
  // before any permit lookup could produce a different refusal.
  assert.equal(result.outcome, 'hard-stop');
  assert.equal(result.reason, 'lane-owner-unavailable');
  assert.deepEqual(applications, []);
  assert.equal(canonicalJson(result.session.acceptedState), canonicalJson(state));
});

nodeTest('the lane and audit routes require autonomous policy and one settled effect', () => {
  const guardedPayloads = [
    ['authorize-lane-effect', { laneEffect: { input: {}, mutation: clone(LANE_MUTATION), lanePrestate: {}, targetMapping: {} } }],
    ['apply-lane-effect', { laneApplication: sealedLaneApplication(laneMutationPermit(pendingState('autonomous'))) }],
    ['commit-lane-receipt', { laneReceipt: { input: {}, permit: {}, receipt: {} } }],
    ['audit-run', { audit: { input: {} } }],
    ['prepare-authoritative-projection', { projection: { input: {} } }],
  ];
  for (const [operation, payload] of guardedPayloads) {
    let calls = 0;
    const adapter = createHostAdapter(sealedInitial({ state: pendingState() }), sealedPorts(() => {
      calls += 1;
      return { status: 'empty' };
    }));
    const result = adapter.run(sealedRequest(
      adapter,
      /** @type {string} */ (operation),
      /** @type {Record<string, unknown>} */ (payload),
    ));
    assert.equal(result.outcome, 'hard-stop', /** @type {string} */ (operation));
    assert.equal(result.reason, 'autonomous-policy-required', /** @type {string} */ (operation));
    assert.equal(calls, 0, /** @type {string} */ (operation));
  }

  // Preparation has nothing to derive without one retained projection effect.
  const autonomous = createHostAdapter(sealedInitial({ state: pendingState('autonomous') }));
  const unprepared = autonomous.run(sealedRequest(autonomous, 'prepare-authoritative-projection', {
    projection: { input: {} },
  }));
  assert.equal(unprepared.outcome, 'hard-stop');
  assert.equal(unprepared.reason, 'pending-effect-missing');
});

nodeTest('hard-stop disposition is terminal for inspection and every later operation', () => {
  let calls = 0;
  const adapter = createHostAdapter(sealedInitial(), {
    ...sealedPorts(() => {
      calls += 1;
      return { status: 'empty' };
    }),
    noEffectAuthority: refusingNoEffectAuthority('indeterminate'),
  });
  const stopped = adapter.run(sealedResultRequest(adapter));
  assert.equal(stopped.outcome, 'hard-stop');
  assert.equal(calls, 1);
  const terminalIdentity = stopped.session.sessionIdentity;
  for (const later of [
    sealedRequest(adapter, 'fresh-inspection', { input: {} }),
    sealedResultRequest(adapter),
  ]) {
    const terminal = adapter.run(later);
    assert.equal(terminal.outcome, 'hard-stop');
    assert.equal(terminal.reason, stopped.reason);
    assert.equal(terminal.session.sessionIdentity, terminalIdentity);
    assert.equal(calls, 1);
  }
});

nodeTest('proxy, accessor, cycle, sparse, exotic, depth, byte, and entry inputs refuse before runtime', () => {
  const fixtures = [
    ['operation proxy', (adapter) => new Proxy(sealedResultRequest(adapter), {
      get(target, key, receiver) {
        return key === 'operation' ? 'fresh-inspection' : Reflect.get(target, key, receiver);
      },
    })],
    ['nested proxy', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input = new Proxy({}, {});
      return value;
    }],
    ['accessor', (adapter) => {
      const value = sealedResultRequest(adapter);
      Object.defineProperty(value.attemptResult.input, 'secret', {
        enumerable: true,
        get: () => true,
      });
      return value;
    }],
    ['cycle', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input.self = value.attemptResult.input;
      return value;
    }],
    ['sparse array', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input.rows = new Array(2);
      return value;
    }],
    ['exotic prototype', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input.when = new Date();
      return value;
    }],
    ['symbol field', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input[Symbol('hidden')] = true;
      return value;
    }],
    ['depth', (adapter) => {
      const value = sealedResultRequest(adapter);
      let cursor = value.attemptResult.input;
      for (let index = 0; index < 40; index += 1) cursor = cursor.next = {};
      return value;
    }],
    ['bytes', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input.body = 'x'.repeat(6_291_457);
      return value;
    }],
    ['entries', (adapter) => {
      const value = sealedResultRequest(adapter);
      value.attemptResult.input.rows = Array.from({ length: 4097 }, () => null);
      return value;
    }],
  ];
  for (const [label, build] of fixtures) {
    let calls = 0;
    const adapter = createHostAdapter(sealedInitial(), sealedPorts(() => {
      calls += 1;
      return { status: 'empty' };
    }));
    const result = adapter.run(build(adapter));
    assert.equal(result.outcome, 'hard-stop', label);
    assert.equal(result.reason, 'request-not-authorized', label);
    assert.equal(calls, 0, label);
  }
});

nodeTest('adapter detaches and freezes caller data before semantic use or retention', () => {
  const seed = sealedInitial();
  let sawFrozenRequest = false;
  const adapter = createHostAdapter(seed, sealedPorts((command, lowLevelRequest) => {
    sawFrozenRequest = Object.isFrozen(lowLevelRequest)
      && Object.isFrozen(lowLevelRequest.input)
      && Object.isFrozen(lowLevelRequest.input.result);
    return { status: 'returned', value: runCommand(command, lowLevelRequest) };
  }));
  seed.state.policy.overall = 99;
  assert.equal(adapter.snapshot().acceptedState.policy.overall, 3);
  assert.throws(() => { adapter.snapshot().acceptedState.policy.overall = 99; }, TypeError);
  adapter.run(sealedResultRequest(adapter));
  assert.equal(sawFrozenRequest, true);
});

/** @param {Record<string, unknown>} correction */
function reidentifyCorrection(correction) {
  const { identity, ...body } = correction;
  return { ...body, identity: sha256(canonicalJson(body)) };
}

/** @param {Record<string, unknown>} sessionValue */
function reidentifySession(sessionValue) {
  const copy = clone(sessionValue);
  const { sessionIdentity, ...body } = copy;
  copy.sessionIdentity = sha256(canonicalJson(body));
  return copy;
}

nodeTest('consumed flip, correction clear, older session, and self-consistent rehash cannot become latest', () => {
  for (const mutation of ['flip-consumed', 'clear-correction', 'older-session', 'rehash-host-revision']) {
    let calls = 0;
    const adapter = createHostAdapter(sealedInitial(), sealedPorts(() => {
      calls += 1;
      return { status: 'empty' };
    }));
    const older = adapter.snapshot();
    const refusal = adapter.run({ ...sealedResultRequest(adapter), route: 'forbidden' });
    assert.equal(refusal.outcome, 'closed-refusal', mutation);
    let forged = clone(refusal.session);
    if (mutation === 'flip-consumed') {
      forged.correction.consumed = true;
      forged.correction = reidentifyCorrection(forged.correction);
    } else if (mutation === 'clear-correction') {
      forged.correction = null;
    } else if (mutation === 'older-session') {
      forged = older;
    } else {
      forged.hostRevision += 1;
    }
    forged = reidentifySession(forged);
    assert.equal(validateHostAdapterSession(forged).sessionIdentity, forged.sessionIdentity, mutation);
    const candidate = sealedResultRequest(adapter);
    candidate.expectedSessionIdentity = forged.sessionIdentity;
    candidate.expectedHostRevision = forged.hostRevision;
    const stopped = adapter.run(candidate);
    assert.equal(stopped.outcome, 'hard-stop', mutation);
    assert.match(stopped.reason, /adapter-(session|revision)-mismatch/, mutation);
    assert.equal(calls, 0, mutation);
  }
});

nodeTest('guarded completion accepts exact charged failures and rejects contradictory successors', () => {
  for (const [label, checks, reason, outcome] of [
    ['verification failure', { verification: 'failed', lint: 'none', review: 'none' }, 'verification-failed', 'failed'],
    ['review rejection', { verification: 'passed', lint: 'none', review: 'rejected' }, 'review-rejected', 'blocked'],
  ]) {
    const state = pendingState();
    state.pending[0].action = reason === 'review-rejected' ? 'address-review' : 'execute-task';
    state.pending[0].materialInputs.operations = reason === 'review-rejected' ? ['address-review'] : ['execute-task'];
    state.pending[0].materialInputs.checks = reason === 'review-rejected'
      ? ['review', 'verification']
      : ['verification'];
    state.pending[0].approachHash = approachHash({
      action: state.pending[0].action,
      materialInputs: state.pending[0].materialInputs,
    });
    state.pending[0].mode = reason === 'review-rejected' ? 'recovery' : 'ordinary';
    if (reason === 'review-rejected') {
      state.policy.recover = true;
      state.recoveryUsed = [{
        targetKey: canonicalJson(TARGET),
        targetHash: sha256(canonicalJson(TARGET)),
        count: 1,
      }];
    }
    validateRunState(state);
    const result = guardedResult({
      outcome,
      operations: clone(state.pending[0].materialInputs.operations),
      checks,
    });
    const adapter = createHostAdapter(sealedInitial({ state }));
    const accepted = adapter.run(sealedResultRequest(adapter, result));
    assert.equal(accepted.outcome, 'accepted', label);
    assert.equal(accepted.reason, reason, label);
    assert.equal(accepted.session.status, 'active', label);
    assert.equal(accepted.session.acceptedState.pending.length, 0, label);
    assert.equal(accepted.session.acceptedState.completed.length, 1, label);
    assert.equal(accepted.session.acceptedState.completed[0].evidenceHash, state.pending[0].evidenceHash, label);
  }

  const cases = [
    ['completed false changed state', (lowLevelRequest) => {
      const response = runCommand('complete', lowLevelRequest);
      response.completion.state.policy.overall += 1;
      return response;
    }],
    ['completed true unchanged state', (lowLevelRequest) => ({
      completion: {
        completed: true,
        reason: 'completed',
        state: clone(lowLevelRequest.state),
      },
    })],
    ['wrong completed result identity', (lowLevelRequest) => {
      const response = runCommand('complete', lowLevelRequest);
      response.completion.state.completed[0].resultHash = sha256('wrong-result');
      return response;
    }],
  ];
  for (const [label, makeResponse] of cases) {
    const adapter = createHostAdapter(sealedInitial(), sealedPorts((command, lowLevelRequest) => ({
      status: 'returned',
      value: makeResponse(lowLevelRequest),
    })));
    const before = adapter.snapshot().acceptedStateBytes;
    const result = adapter.run(sealedResultRequest(adapter));
    assert.equal(result.outcome, 'closed-refusal', label);
    assert.equal(result.incidentClass, 'malformed-output', label);
    assert.equal(result.session.acceptedStateBytes, before, label);
    assert.equal(result.reason, 'runtime-result-not-authoritative', label);
  }
});

/** @param {Record<string, unknown>} target @param {string} state @param {unknown[]} [records] */
function sealedCapture(target, state, records = []) {
  const normalized = canonicalJson({ target, state, records });
  const body = canonicalJson({ target, state, records: records.map((substantive) => ({ substantive })) });
  return { target: clone(target), state, outcomeHash: sha256(normalized), bytes: Buffer.from(body) };
}

/** @param {Record<string, unknown>} input */
function sealedTransportInput(input) {
  const output = { ...input, lane: clone(input.lane) };
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(input, field)) continue;
    output[field] = input[field].map((entry) => ({
      ...entry,
      target: clone(entry.target),
      bytes: { base64: Buffer.from(entry.bytes).toString('base64') },
    }));
  }
  return output;
}

/** @param {string} root @param {Record<string, unknown>} [overrides] */
function sealedInspectionInput(root, overrides = {}) {
  return {
    root,
    specPath: TARGET.specPath,
    target: clone(TARGET),
    lane: { kind: 'lightweight' },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    ...overrides,
  };
}

/**
 * The ordinary autonomous completion input. It names no trusted capture stream:
 * host integration injects the ones its builder produced.
 * @param {string} root @param {Record<string, unknown>} [overrides]
 */
function sealedRecordInput(root, overrides = {}) {
  const { verification, review, lint, ...rest } = sealedInspectionInput(root, {
    policyMode: 'autonomous',
    ...overrides,
  });
  return sealedTransportInput(rest);
}

/** @param {(root:string)=>unknown} run */
function withSealedWorkspace(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-host-adapter-')));
  const ideaPath = '.dude/ideas/018-autonomous-runstate-continuity.md';
  const tasksPath = `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const planPath = `${TARGET.specPath.slice(0, -'spec.md'.length)}plan.md`;
  try {
    fs.mkdirSync(path.join(root, path.dirname(ideaPath)), { recursive: true });
    fs.mkdirSync(path.join(root, path.dirname(TARGET.specPath)), { recursive: true });
    fs.writeFileSync(path.join(root, ideaPath), [
      '---',
      'title: Autonomous RunState Continuity',
      'slug: autonomous-runstate-continuity',
      'status: defined',
      `spec_path: ${TARGET.specPath}`,
      '---',
      '',
      '## Idea',
      '',
      'Keep accepted state authoritative.',
      '',
      '## Coordinator Log',
      '',
      '- 2026-08-10 exact owner event',
    ].join('\n'));
    fs.writeFileSync(path.join(root, TARGET.specPath), '# Feature Specification\n');
    fs.writeFileSync(path.join(root, planPath), '# Plan\n\nNo active objective registry.\n');
    fs.writeFileSync(path.join(root, tasksPath), [
      '# Tasks',
      '',
      `- [~] ${TARGET.taskKey} [Shared] Adapter core`,
      '',
      '## Lightweight Execution History',
      '',
    ].join('\n'));
    const result = run(root);
    if (result instanceof Promise) {
      return result.finally(() => fs.rmSync(root, { recursive: true, force: true }));
    }
    fs.rmSync(root, { recursive: true, force: true });
    return result;
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

nodeTest('authorize-attempt uses real recovery authorization and closes drift and route injection', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const inspection = inspect(input);
    const assessment = {
      evidenceHash: inspection.evidenceHash,
      intent: 'unchanged',
      action: 'execute-task',
      materialInputs: clone(MATERIAL_INPUTS),
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Execute the inspected task.',
    };
    const adapter = createHostAdapter(sealedInitial({ state: emptyState() }));
    const accepted = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
      authorization: { input, assessment },
    }));
    assert.equal(accepted.outcome, 'accepted');
    assert.equal(accepted.reason, 'authorized');
    assert.equal(accepted.session.acceptedState.pending[0].action, 'execute-task');
    assert.equal(accepted.session.acceptedState.pending[0].evidenceHash, inspection.evidenceHash);

    const routeAdapter = createHostAdapter(sealedInitial({ state: emptyState() }));
    const injected = sealedRequest(routeAdapter, 'authorize-attempt', {
      authorization: { input, assessment },
    });
    injected.command = 'authorize';
    const routeRefusal = routeAdapter.run(injected);
    assert.equal(routeRefusal.outcome, 'closed-refusal');
    assert.equal(routeRefusal.incidentClass, 'malformed-request');

    fs.appendFileSync(path.join(root, `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`), '- drift\n');
    const driftAdapter = createHostAdapter(sealedInitial({ state: emptyState() }));
    const drift = driftAdapter.run(sealedRequest(driftAdapter, 'authorize-attempt', {
      authorization: { input, assessment },
    }));
    assert.equal(drift.outcome, 'closed-refusal');
    assert.equal(drift.reason, 'evidence-drift');
    assert.equal(drift.session.acceptedRevision, 0);
  });
});

nodeTest('authorize-attempt refuses wrong target and action without accepting a successor', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const inspection = inspect(input);
    const assessment = {
      evidenceHash: inspection.evidenceHash,
      intent: 'unchanged',
      action: 'execute-task',
      materialInputs: clone(MATERIAL_INPUTS),
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Execute the exact target and action.',
    };

    const wrongTarget = createHostAdapter(sealedInitial({ state: emptyState() }));
    const foreignInput = clone(input);
    foreignInput.target.taskKey = 'T999@ffffffff';
    const targetRefusal = wrongTarget.run(sealedRequest(wrongTarget, 'authorize-attempt', {
      authorization: { input: foreignInput, assessment },
    }));
    assert.equal(targetRefusal.outcome, 'hard-stop');
    assert.equal(targetRefusal.session.acceptedRevision, 0);
    assert.deepEqual(targetRefusal.session.acceptedState.pending, []);

    let calls = 0;
    const wrongAction = createHostAdapter(sealedInitial({ state: emptyState() }), sealedPorts((command, lowLevelRequest) => {
      calls += 1;
      const retryAssessment = clone(lowLevelRequest.assessment);
      retryAssessment.action = 'retry-task';
      retryAssessment.materialInputs.operations = ['retry-task'];
      const response = runCommand(command, {
        ...lowLevelRequest,
        assessment: retryAssessment,
        mode: 'recovery',
      });
      return { status: 'returned', value: response };
    }));
    const actionRefusal = wrongAction.run(sealedRequest(wrongAction, 'authorize-attempt', {
      authorization: { input, assessment },
    }));
    assert.equal(actionRefusal.outcome, 'closed-refusal');
    assert.equal(actionRefusal.incidentClass, 'malformed-output');
    assert.equal(actionRefusal.reason, 'runtime-result-not-authoritative');
    assert.equal(actionRefusal.session.acceptedRevision, 0);
    assert.equal(calls, 1);
  });
});

nodeTest('authorize-attempt deterministically issues and consumes the real autonomous permit route', () => {
  withSealedWorkspace((root) => {
    const state = emptyState('autonomous');
    const input = sealedInspectionInput(root, { policyMode: 'autonomous' });
    const inspection = inspect(input);
    const tasksPath = `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`;
    const ideaPath = '.dude/ideas/018-autonomous-runstate-continuity.md';
    const tasks = fs.readFileSync(path.join(root, tasksPath));
    const owner = fs.readFileSync(path.join(root, ideaPath));
    const taskState = Buffer.from(canonicalJson({ version: 1, tasks: [] }));
    const ownerCapture = capturedBytesV1(owner);
    const mapping = {
      version: 1,
      lane: 'lightweight',
      target: clone(TARGET),
      ownerBindingHash: sha256(canonicalJson({
        ideaPath,
        specPath: TARGET.specPath,
        ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
      })),
      tasksPath,
      tasksDescriptor: contentDescriptor(tasks),
      taskStatePath: '.dude/state/task-state.json',
      taskStateDescriptor: contentDescriptor(taskState),
      taskKey: TARGET.taskKey,
    };
    const lanePrestate = {
      version: 1,
      lane: 'lightweight',
      target: clone(TARGET),
      glyph: '~',
      blockedBy: null,
      tasksDescriptor: clone(mapping.tasksDescriptor),
      taskStateDescriptor: clone(mapping.taskStateDescriptor),
      ownerDescriptor: contentDescriptor(owner),
    };
    const assessment = {
      evidenceHash: inspection.evidenceHash,
      intent: 'unchanged',
      action: 'execute-task',
      materialInputs: clone(MATERIAL_INPUTS),
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Execute through the autonomous permit route.',
    };
    const commands = [];
    const adapter = createHostAdapter(sealedInitial({ state }), {
      runtime: {
        identity: sha256('counting-real-runtime'),
        invoke(command, lowLevelRequest) {
          commands.push(`${command}:${lowLevelRequest.mode || 'ordinary'}`);
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
    });
    const result = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
      authorization: {
        input,
        assessment,
        permit: { lanePrestate, targetMapping: mapping },
      },
    }));
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.reason, 'authorized');
    assert.deepEqual(commands, ['transition:issue-attempt-permit', 'authorize:ordinary']);
  });
});

/**
 * Reproduce the exact captures host integration derives and injects, so later
 * inspections carry the same trusted source stream the adapter already produced.
 * @param {Record<string, unknown>} state @param {string} label @param {'accepted'|'rejected'} [verdict]
 * @param {Record<string, unknown>[]} [findings]
 */
function sealedTrustedFixture(state, label, verdict = 'rejected', findings) {
  const semantic = specialistResult(label, verdict);
  if (findings) semantic.review.findings = clone(findings);
  const pending = /** @type {Record<string, unknown>[]} */ (state.pending)[0];
  const target = clone(pending.target);
  const attemptOrdinal = state.overallUsed;
  const inspectedEvidenceHash = pending.evidenceHash;
  const context = {
    target,
    attempt: {
      ordinal: attemptOrdinal,
      authorizationEvidenceHash: inspectedEvidenceHash,
      approachBasis: {
        version: 1,
        target: clone(target),
        action: pending.action,
        materialInputs: clone(pending.materialInputs),
        mechanismIdentities: [],
        assumptionIdentities: [],
        evidenceAcquisitionIdentities: [],
        validationPlanIdentities: [],
      },
    },
    sourceRevision: inspectedEvidenceHash,
    inspectedEvidenceHash,
    resultMaterial: canonicalJson({
      version: 1,
      target,
      attemptOrdinal,
      authorizationEvidenceHash: inspectedEvidenceHash,
      outcome: semantic.outcome,
      operations: semantic.operations,
      changedTargets: semantic.changedTargets,
    }),
  };
  const binding = {
    target: clone(target),
    attemptOrdinal,
    sourceRevision: context.sourceRevision,
    inspectedEvidenceHash,
    resultMaterial: context.resultMaterial,
  };
  const testerDispatch = { role: 'Tester', occurrence: 1 };
  const reviewerDispatch = { role: 'Reviewer', occurrence: 1 };
  const verificationCapture = buildSpecialistAttestation({
    kind: 'verification',
    context: { ...clone(context), dispatch: { ...testerDispatch } },
    result: { ...clone(binding), dispatch: { ...testerDispatch }, checks: clone(semantic.verification.checks) },
  });
  const reviewCapture = buildSpecialistAttestation({
    kind: 'independent-review',
    context: {
      ...clone(context),
      dispatch: { ...reviewerDispatch },
      reviewOrdinal: 1,
      verification: { capture: clone(verificationCapture), dispatch: { ...testerDispatch } },
    },
    result: {
      ...clone(binding),
      reviewOrdinal: 1,
      dispatch: { ...reviewerDispatch },
      verdict: semantic.review.verdict,
      findings: clone(semantic.review.findings),
    },
  });
  const verification = normalizeVerificationEnvelopeV2(verificationCapture);
  const review = normalizeIndependentReviewEnvelopeV2(reviewCapture, verification);
  return {
    semantic,
    verification,
    review,
    identities: {
      attemptIdentity: verification.attemptIdentity,
      resultIdentity: verification.resultIdentity,
      verificationEnvelopeIdentity: verification.envelopeIdentity,
      reviewEnvelopeIdentity: review.envelopeIdentity,
      findingIdentities: review.findings.map((/** @type {Record<string, unknown>} */ finding) => finding.findingIdentity),
    },
    streams: {
      verification: [sealedCapture(target, 'passed', [verificationCapture])],
      review: [sealedCapture(target, verdict, [reviewCapture])],
    },
  };
}

/** @param {string} root @param {Record<string, unknown>[]} currentEvents @param {Record<string, unknown>[]} laneEvents @param {Record<string, unknown>} streams */
function sealedRetentionInput(root, currentEvents, laneEvents, streams) {
  const tasksPath = `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`;
  fs.writeFileSync(path.join(root, tasksPath), [
    '# Tasks',
    '',
    `- [~] ${TARGET.taskKey} [Shared] Adapter core`,
    '',
    '## Lightweight Execution History',
    '',
    ...laneEvents.map((event) => `- dude-run-event: ${canonicalJson(event)}`),
    '',
  ].join('\n'));
  return sealedTransportInput(sealedInspectionInput(root, {
    policyMode: 'autonomous',
    currentRun: currentEvents.length === 0
      ? []
      : [sealedCapture(TARGET, 'failed', currentEvents.map((event) => ({ event })))],
    ...streams,
  }));
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} fixture @param {string} root */
function captureAdapter(state, fixture, root) {
  const adapter = createHostAdapter(sealedInitial({ state }));
  const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
    attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
  }));
  return { adapter, captured };
}

nodeTest('real recovery trusted review rejection capture binds predecessor and exact trusted identities', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'capture');
    const { captured } = captureAdapter(state, fixture, root);
    assert.equal(captured.outcome, 'effect-required');
    assert.equal(captured.effect.kind, 'completion-retention');
    assert.equal(captured.session.acceptedStateBytes, canonicalJson(state));
    assert.equal(captured.session.acceptedRevision, 0);
    assert.equal(
      captured.session.pendingEffect.provisionalState.pendingCompletion.resultIdentity,
      fixture.identities.resultIdentity,
    );
    assert.equal(
      captured.session.pendingEffect.provisionalState.pendingCompletion.reviewEnvelopeIdentity,
      fixture.identities.reviewEnvelopeIdentity,
    );
  });
});

nodeTest('trusted multi-finding capture compares identity sets without reordering occurrence events', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const label = 'multi-finding-order';
    const definition = `focused check:${label}`;
    const findings = ['amber', 'birch', 'cobalt', 'dune', 'elm'].map((marker) => ({
      basis: {
        expectation: { kind: 'governing-rule', reference: `governing rule:${marker}` },
        subjects: [TARGET.taskKey],
        failureClass: 'review-rejection',
        checkDefinition: definition,
      },
      observation: { kind: 'observed-evidence', evidence: `observed evidence:${marker}` },
    }));
    const fixture = sealedTrustedFixture(state, label, 'rejected', findings);
    const { captured } = captureAdapter(state, fixture, root);

    assert.equal(captured.outcome, 'effect-required');
    assert.equal(captured.reason, 'occurrence-retention-required');
    assert.notEqual(captured.reason, 'effect-contract-mismatch');

    const events = captured.effect.projectionBatch.events;
    assert.equal(events[0].type, 'approach-occurrence');
    assert.deepEqual(
      events.slice(1).map((/** @type {Record<string, unknown>} */ event) => event.type),
      Array(findings.length).fill('finding-occurrence'),
    );
    const occurrenceIdentities = events.slice(1)
      .map((/** @type {Record<string, unknown>} */ event) => event.occurrenceIdentity);
    assert.deepEqual(
      occurrenceIdentities,
      [...occurrenceIdentities].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
      'finding events retain occurrenceIdentity ordering',
    );

    const projectedFindingIdentities = events.slice(1).map((
      /** @type {Record<string, unknown>} */ event,
    ) => /** @type {Record<string, unknown>} */ (event.occurrence).findingIdentity);
    assert.notDeepEqual(
      projectedFindingIdentities,
      fixture.identities.findingIdentities,
      'the regression requires occurrenceIdentity and findingIdentity to induce different orders',
    );
    assert.deepEqual(
      [...projectedFindingIdentities].sort((left, right) => (
        Buffer.compare(Buffer.from(left), Buffer.from(right))
      )),
      fixture.identities.findingIdentities,
      'mapped findingIdentity sets compare after UTF-8 sorting',
    );
  });
});

nodeTest('real recovery capture and finalize reject wrong result identity and projection batch before acceptance', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'binding');
    for (const tamper of ['resultIdentity', 'projectionBatch']) {
      let captureResponse;
      const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
        const response = runCommand(command, lowLevelRequest);
        if (lowLevelRequest.mode === 'capture') {
          captureResponse = clone(response);
          if (tamper === 'resultIdentity') {
            captureResponse.completion.state.pendingCompletion.resultIdentity = sha256('wrong-result');
          } else {
            captureResponse.completion.projectionBatch.batchIdentity = sha256('wrong-batch');
          }
          return { status: 'returned', value: captureResponse };
        }
        return { status: 'returned', value: response };
      }));
      const input = sealedRecordInput(root);
      const result = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input, result: fixture.semantic },
      }));
      assert.equal(result.outcome, 'closed-refusal', tamper);
      assert.equal(result.incidentClass, 'malformed-output', tamper);
      assert.equal(result.reason, 'runtime-result-not-authoritative', tamper);
      assert.equal(result.session.acceptedStateBytes, canonicalJson(state), tamper);
    }
  });
});

nodeTest('authoritative projection preparation derives the retained plan without advancing state', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'finalize');
    const { adapter, captured } = captureAdapter(state, fixture, root);
    assert.equal(captured.outcome, 'effect-required');
    const events = captured.effect.projectionBatch.events;
    const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
      projection: {
        input: sealedTransportInput(sealedInspectionInput(root, {
          policyMode: 'autonomous',
          ...fixture.streams,
        })),
      },
    }));

    assert.equal(prepared.outcome, 'effect-required');
    assert.equal(prepared.reason, 'projection-prepared');
    assert.equal(prepared.product.kind, 'projection-plan');
    assert.equal(prepared.product.plan.batchIdentity, captured.effect.projectionBatch.batchIdentity);
    assert.deepEqual(
      prepared.product.plan.items.map((/** @type {Record<string, unknown>} */ item) => item.eventHash),
      events.map((/** @type {Record<string, unknown>} */ event) => event.eventHash),
    );
    // Preparation derives only: the predecessor and its pending effect survive.
    assert.equal(prepared.session.acceptedStateBytes, canonicalJson(state));
    assert.equal(prepared.session.acceptedRevision, 0);
    assert.equal(prepared.effect.effectIdentity, captured.effect.effectIdentity);

    // Settlement is still its own route with its own fresh evidence.
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
      input: sealedRetentionInput(root, events, events, fixture.streams),
    }));
    assert.equal(settled.outcome, 'accepted');
    assert.equal(settled.session.acceptedRevision, 1);
    assert.equal(Object.hasOwn(settled, 'product'), false);
  });
});

nodeTest('real recovery review rejection finalizes only with exact result identity and retained projection', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'finalize');
    const { adapter, captured } = captureAdapter(state, fixture, root);
    const events = captured.effect.projectionBatch.events;
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
      input: sealedRetentionInput(root, events, events, fixture.streams),
    }));
    assert.equal(settled.outcome, 'accepted');
    assert.equal(settled.reason, 'review-rejected');
    assert.equal(settled.session.acceptedRevision, 1);
    assert.equal(settled.session.acceptedState.completed.at(-1).resultHash, fixture.identities.resultIdentity);

    for (const contradiction of ['result-identity', 'arbitrary-state', 'completed-flag']) {
      const contradictory = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
        const response = runCommand(command, lowLevelRequest);
        if (lowLevelRequest.mode === 'finalize') {
          if (contradiction === 'result-identity') {
            response.completion.resultIdentity = sha256('wrong-final-result');
          } else if (contradiction === 'arbitrary-state') {
            response.completion.state.policy.overall += 1;
          } else {
            response.completion.completed = true;
          }
        }
        return { status: 'returned', value: response };
      }));
      const contradictionCapture = contradictory.run(sealedRequest(contradictory, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
      }));
      const wrong = contradictory.run(sealedRequest(contradictory, 'settle-effect', {
        input: sealedRetentionInput(
          root,
          contradictionCapture.effect.projectionBatch.events,
          contradictionCapture.effect.projectionBatch.events,
          fixture.streams,
        ),
      }));
      assert.equal(wrong.outcome, 'closed-refusal', contradiction);
      assert.equal(wrong.incidentClass, 'malformed-output', contradiction);
      assert.equal(wrong.reason, 'runtime-result-not-authoritative', contradiction);
    }
  });
});

/** @param {Record<string, unknown>} acceptedState */
function secondPendingState(acceptedState) {
  const state = clone(acceptedState);
  state.overallUsed += 1;
  state.pending = clone(pendingState('autonomous').pending);
  validateRunState(state);
  return state;
}

/** @param {Record<string, unknown>[]} left @param {Record<string, unknown>[]} right */
function mergeCaptureStreams(left, right) {
  return {
    verification: [...left.verification, ...right.verification],
    review: [...left.review, ...right.review],
  };
}

/** @param {string} root @param {(command:string, request:Record<string, unknown>, response:Record<string, unknown>)=>void} [mutate] */
function repeatedReviewProjectionFlow(root, mutate) {
  const firstState = pendingState('autonomous');
  const firstFixture = sealedTrustedFixture(firstState, 'repeat');
  const firstFlow = captureAdapter(firstState, firstFixture, root);
  const firstEvents = firstFlow.captured.effect.projectionBatch.events;
  const firstSettled = firstFlow.adapter.run(sealedRequest(firstFlow.adapter, 'settle-effect', {
    input: sealedRetentionInput(root, firstEvents, firstEvents, firstFixture.streams),
  }));
  assert.equal(firstSettled.outcome, 'accepted');

  const secondState = secondPendingState(firstSettled.session.acceptedState);
  const secondFixture = sealedTrustedFixture(secondState, 'repeat');
  const streams = mergeCaptureStreams(firstFixture.streams, secondFixture.streams);
  const adapter = createHostAdapter(sealedInitial({ state: secondState }), {
    runtime: {
      identity: sha256(`projection-runtime:${mutate ? 'mutated' : 'exact'}`),
      invoke(command, lowLevelRequest) {
        const response = runCommand(command, lowLevelRequest);
        if (mutate) mutate(command, lowLevelRequest, response);
        return { status: 'returned', value: response };
      },
    },
  });
  const captureInput = sealedRecordInput(root);
  const secondCaptured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
    attemptResult: { input: captureInput, result: secondFixture.semantic },
  }));
  assert.equal(secondCaptured.outcome, 'effect-required');
  const secondEvents = secondCaptured.effect.projectionBatch.events;
  const allEvents = [...firstEvents, ...secondEvents];
  const governance = adapter.run(sealedRequest(adapter, 'settle-effect', {
    input: sealedRetentionInput(root, allEvents, allEvents, streams),
  }));
  assert.equal(governance.outcome, 'effect-required');
  assert.equal(governance.effect.kind, 'projection');
  assert.equal(governance.effect.purpose, 'governance-required');
  const governanceEvents = governance.effect.projectionBatch.events;
  const projectionInput = sealedRetentionInput(
    root,
    [...allEvents, ...governanceEvents],
    [...allEvents, ...governanceEvents],
    streams,
  );
  return {
    adapter,
    governance,
    projectionInput,
    allEvents,
    governanceEvents,
    streams,
  };
}

nodeTest('real governance projection accepts only the exact recovery-owned projection receipt and successor', () => {
  withSealedWorkspace((root) => {
    const exact = repeatedReviewProjectionFlow(root);
    const accepted = exact.adapter.run(sealedRequest(exact.adapter, 'settle-effect', {
      input: exact.projectionInput,
    }));
    assert.equal(accepted.outcome, 'accepted');
    assert.equal(accepted.reason, 'projection-verified');
    assert.equal(accepted.session.acceptedState.learningGovernance.phase, 'required');
    assert.equal(Object.hasOwn(accepted.session.acceptedState.learningGovernance, 'projectionCommitment'), false);
  });

  for (const mutation of ['projectionRef', 'batchIdentity', 'successor']) {
    withSealedWorkspace((root) => {
      const flow = repeatedReviewProjectionFlow(root, (command, lowLevelRequest, response) => {
        if (command !== 'transition' || lowLevelRequest.mode !== 'verify-projection') return;
        if (mutation === 'projectionRef') {
          response.transition.projectionRef.currentRunProjectionIdentity = sha256('wrong-projection-ref');
        } else if (mutation === 'batchIdentity') {
          response.transition.projectionRef.batchIdentity = sha256('wrong-batch-identity');
        } else {
          response.transition.state = clone(lowLevelRequest.state);
        }
      });
      const stopped = flow.adapter.run(sealedRequest(flow.adapter, 'settle-effect', {
        input: flow.projectionInput,
      }));
      assert.equal(stopped.outcome, 'closed-refusal', mutation);
      assert.equal(stopped.incidentClass, 'malformed-output', mutation);
      assert.equal(stopped.reason, 'runtime-result-not-authoritative', mutation);
    });
  }
});

/** @param {string} label */
function governanceHash(label) {
  return sha256(`host-adapter-governance:${label}`);
}

/** @param {string[]} failedBases @param {string} setIdentity @param {string} label */
function credibleGovernanceAlternative(failedBases, setIdentity, label) {
  const approachBasis = {
    version: 1,
    target: clone(TARGET),
    action: 'retry-task',
    materialInputs: {
      targets: [`src/${label}.mjs`],
      operations: ['retry-task'],
      checks: ['verification'],
    },
    mechanismIdentities: [governanceHash(`mechanism:${label}`)],
    assumptionIdentities: [],
    evidenceAcquisitionIdentities: [],
    validationPlanIdentities: [],
  };
  const approachBasisIdentity = sha256(canonicalJson(approachBasis));
  const materialDifferences = failedBases.map((failedApproachBasisIdentity) => ({
    failedApproachBasisIdentity,
    changedDimensions: ['material-input', 'mechanism'],
    evidenceIdentities: [governanceHash(`difference:${label}:${failedApproachBasisIdentity}`)],
  }));
  const checkBody = {
    definitionIdentity: governanceHash(`check-definition:${label}`),
    evidenceIdentities: [governanceHash(`check-evidence:${label}`)],
  };
  const discriminatingCheck = { identity: sha256(canonicalJson(checkBody)), ...checkBody };
  const semanticAssessmentIdentity = governanceHash(`assessment:${label}`);
  const identityBody = {
    version: 2,
    disposition: 'credible-material',
    approachBasisIdentity,
    failedApproachSetIdentity: setIdentity,
    materialDifferences,
    discriminatingCheck,
    semanticAssessmentIdentity,
  };
  return {
    version: 2,
    alternativeIdentity: sha256(canonicalJson(identityBody)),
    disposition: 'credible-material',
    approachBasis,
    approachBasisIdentity,
    failedApproachSetIdentity: setIdentity,
    materialDifferences,
    discriminatingCheck,
    semanticAssessmentIdentity,
  };
}

/** @param {string[]} failedBases @param {string} setIdentity @param {string} label */
function rejectedGovernanceAlternative(failedBases, setIdentity, label) {
  const approachBasis = {
    version: 1,
    target: clone(TARGET),
    action: 'retry-task',
    materialInputs: {
      targets: [`src/${label}.mjs`],
      operations: ['retry-task'],
      checks: ['verification'],
    },
    mechanismIdentities: [governanceHash(`mechanism:${label}`)],
    assumptionIdentities: [],
    evidenceAcquisitionIdentities: [],
    validationPlanIdentities: [],
  };
  const approachBasisIdentity = sha256(canonicalJson(approachBasis));
  const comparisons = failedBases.map((failedApproachBasisIdentity, index) => ({
    failedApproachBasisIdentity,
    outcome: index === 0 ? 'same' : 'different',
    ...(index === 0 ? {} : { changedDimensions: ['mechanism'] }),
    evidenceIdentities: [governanceHash(`comparison:${label}:${failedApproachBasisIdentity}`)],
  }));
  const semanticAssessmentIdentity = governanceHash(`assessment:${label}`);
  const reason = 'disguised-repetition';
  const identityBody = {
    version: 2,
    disposition: 'not-materially-different',
    approachBasisIdentity,
    failedApproachSetIdentity: setIdentity,
    comparisons,
    semanticAssessmentIdentity,
    reason,
  };
  return {
    version: 2,
    alternativeIdentity: sha256(canonicalJson(identityBody)),
    disposition: 'not-materially-different',
    approachBasis,
    approachBasisIdentity,
    failedApproachSetIdentity: setIdentity,
    comparisons,
    semanticAssessmentIdentity,
    reason,
  };
}

/** @param {Record<string, unknown>} state @param {'selected-alternative'|'no-progress'} outcome */
function governanceReview(state, outcome) {
  const failedSet = state.learningGovernance.failedApproachSet;
  const credible = credibleGovernanceAlternative(
    failedSet.approachBasisIdentities,
    failedSet.setIdentity,
    'selected-alternative',
  );
  const rejected = rejectedGovernanceAlternative(
    failedSet.approachBasisIdentities,
    failedSet.setIdentity,
    `rejected-${outcome}`,
  );
  const alternatives = outcome === 'selected-alternative' ? [credible, rejected] : [rejected];
  alternatives.sort((left, right) => Buffer.compare(
    Buffer.from(left.alternativeIdentity),
    Buffer.from(right.alternativeIdentity),
  ));
  const findingBody = {
    version: 1,
    statement: `Exercise the ${outcome} governance branch.`,
    evidenceIdentities: [governanceHash(`finding:${outcome}`)],
    assumptionIdentities: [],
  };
  const review = {
    version: 2,
    target: clone(TARGET),
    assumptionIdentities: [governanceHash(`assumption:${outcome}`)],
    findings: [{ ...findingBody, findingIdentity: sha256(canonicalJson(findingBody)) }],
    alternatives,
    outcome,
    ...(outcome === 'selected-alternative'
      ? { selectedAlternativeIdentity: credible.alternativeIdentity }
      : {}),
  };
  return { review, credible };
}

/** @param {string} root */
function requiredGovernanceFixture(root) {
  const flow = repeatedReviewProjectionFlow(root);
  const accepted = flow.adapter.run(sealedRequest(flow.adapter, 'settle-effect', {
    input: flow.projectionInput,
  }));
  assert.equal(accepted.outcome, 'accepted');
  const governedEvents = [...flow.allEvents, ...flow.governanceEvents];
  return {
    state: accepted.session.acceptedState,
    unprojectedState: clone(flow.governance.session.pendingEffect.provisionalState),
    governedEvents,
    streams: flow.streams,
  };
}

/** @param {string} root @param {ReturnType<typeof requiredGovernanceFixture>} required @param {'selected-alternative'|'no-progress'} outcome */
function projectedGovernanceBranch(root, required, outcome) {
  const { review, credible } = governanceReview(required.state, outcome);
  const adapter = createHostAdapter(sealedInitial({ state: required.state }));
  const reviewed = adapter.run(sealedRequest(adapter, 'advance-governance', {
    governance: {
      action: 'review-learning',
      input: sealedRetentionInput(
        root,
        required.governedEvents,
        required.governedEvents,
        required.streams,
      ),
      review,
    },
  }));
  assert.equal(reviewed.outcome, 'effect-required');
  const learnedEvents = [...required.governedEvents, ...reviewed.effect.projectionBatch.events];
  const projected = adapter.run(sealedRequest(adapter, 'settle-effect', {
    input: sealedRetentionInput(root, learnedEvents, learnedEvents, required.streams),
  }));
  assert.equal(projected.outcome, 'accepted');
  assert.equal(projected.session.acceptedState.learningGovernance.phase, 'projected');
  return { state: projected.session.acceptedState, learnedEvents, review, credible };
}

/** @param {string} root @param {ReturnType<typeof projectedGovernanceBranch>} branch @param {ReturnType<typeof requiredGovernanceFixture>} required */
function inspectedGovernanceBranch(root, branch, required) {
  const adapter = createHostAdapter(sealedInitial({ state: branch.state }));
  const bound = adapter.run(sealedRequest(adapter, 'advance-governance', {
    governance: {
      action: 'bind-alternative',
      input: sealedRetentionInput(root, branch.learnedEvents, branch.learnedEvents, required.streams),
    },
  }));
  assert.equal(bound.outcome, 'accepted');
  assert.equal(bound.session.acceptedState.learningGovernance.phase, 'alternative-inspected');
  return bound.session.acceptedState;
}

nodeTest('every governance intent uses real recovery routes and rejects changed state or auxiliary bodies', () => {
  withSealedWorkspace((root) => {
    const required = requiredGovernanceFixture(root);
    const selected = projectedGovernanceBranch(root, required, 'selected-alternative');
    const noProgress = projectedGovernanceBranch(root, required, 'no-progress');
    const inspected = inspectedGovernanceBranch(root, selected, required);
    const rows = [
      {
        name: 'review-learning',
        state: required.state,
        expected: 'effect-required',
        governance: () => ({
          action: 'review-learning',
          input: sealedRetentionInput(root, required.governedEvents, required.governedEvents, required.streams),
          review: selected.review,
        }),
        auxiliary(body) { body.reviewEvent.reviewIdentity = governanceHash('wrong-review'); },
      },
      {
        name: 'bind-alternative',
        state: selected.state,
        expected: 'accepted',
        governance: () => ({
          action: 'bind-alternative',
          input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
        }),
        auxiliary(body) { body.binding.branchIdentity = governanceHash('wrong-binding'); },
      },
      {
        name: 'verify-no-progress',
        state: noProgress.state,
        expected: 'accepted',
        governance: () => ({
          action: 'verify-no-progress',
          input: sealedRetentionInput(root, noProgress.learnedEvents, noProgress.learnedEvents, required.streams),
        }),
        auxiliary(body) { body.verification.verificationIdentity = governanceHash('wrong-verification'); },
      },
      {
        name: 'controlled-end',
        state: inspected,
        expected: 'ended',
        governance: () => ({
          action: 'controlled-end',
          input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
        }),
        auxiliary(body) { body.controlledEnd.endIdentity = governanceHash('wrong-end'); },
      },
      {
        name: 'resume-learning',
        state: required.state,
        expected: 'accepted',
        governance: () => ({
          action: 'resume-learning',
          input: sealedRetentionInput(root, required.governedEvents, required.governedEvents, required.streams),
        }),
        auxiliary(body) { body.governanceIdentity = governanceHash('wrong-governance'); },
      },
    ];

    for (const row of rows) {
      const honest = createHostAdapter(sealedInitial({ state: row.state }));
      const accepted = honest.run(sealedRequest(honest, 'advance-governance', {
        governance: row.governance(),
      }));
      assert.equal(accepted.outcome, row.expected, row.name);
      if (row.reason) assert.equal(accepted.reason, row.reason, row.name);

      for (const attack of ['changed-policy', 'wrong-auxiliary']) {
        const attacked = createHostAdapter(sealedInitial({ state: row.state }), sealedPorts((command, request) => {
          const response = clone(runCommand(command, request));
          const key = command === 'learn' ? 'learning' : 'transition';
          const body = response[key];
          if (attack === 'changed-policy') {
            body.state.policy.overall = body.state.policy.overall === 'unlimited'
              ? 25
              : body.state.policy.overall + 1;
            validateRunState(body.state);
          } else {
            row.auxiliary(body);
          }
          return { status: 'returned', value: response };
        }));
        const stopped = attacked.run(sealedRequest(attacked, 'advance-governance', {
          governance: row.governance(),
        }));
        assert.equal(stopped.outcome, 'closed-refusal', `${row.name}:${attack}`);
        assert.equal(stopped.incidentClass, 'malformed-output', `${row.name}:${attack}`);
        assert.equal(stopped.reason, 'runtime-result-not-authoritative', `${row.name}:${attack}`);
        assert.equal(stopped.session.acceptedStateBytes, canonicalJson(row.state), `${row.name}:${attack}`);
      }
    }
  });
});

nodeTest('ended governance session is terminal and never invokes recovery again', () => {
  withSealedWorkspace((root) => {
    const required = requiredGovernanceFixture(root);
    const selected = projectedGovernanceBranch(root, required, 'selected-alternative');
    const inspected = inspectedGovernanceBranch(root, selected, required);
    let calls = 0;
    const adapter = createHostAdapter(sealedInitial({ state: inspected }), sealedPorts((command, request) => {
      calls += 1;
      return { status: 'returned', value: runCommand(command, request) };
    }));
    const ended = adapter.run(sealedRequest(adapter, 'advance-governance', {
      governance: {
        action: 'controlled-end',
        input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
      },
    }));
    assert.equal(ended.outcome, 'ended');
    assert.equal(calls, 1);
    const later = adapter.run(sealedRequest(adapter, 'fresh-inspection', {
      input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
    }));
    assert.equal(later.outcome, 'ended');
    assert.equal(later.reason, ended.reason);
    assert.equal(later.session.sessionIdentity, ended.session.sessionIdentity);
    assert.equal(calls, 1);
  });
});

const ARTIFACT_DIRECTORY = 'dude-work-host-adapter-v1';
const WORKSPACE = Object.freeze({
  workspaceIdentity: sha256('sealed-real-workspace'),
  ownerIdentity: sha256('sealed-defined-owner'),
  taskPrestateIdentity: sha256('sealed-task-prestate'),
  lanePrestateIdentity: sha256('sealed-lane-prestate'),
});
const MODULE_URL = new URL('./host-adapter.mjs', import.meta.url).href;
const RECOVERY_URL = new URL('./recovery.mjs', import.meta.url).href;

/** @param {(root:string)=>void} run */
function withTemporaryRoot(run) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dude-host-adapter-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** @param {Record<string, unknown>} [target] @param {string} [workspaceIdentity] */
function derivedCheckpointKey(target = TARGET, workspaceIdentity = WORKSPACE.workspaceIdentity) {
  return sha256(canonicalJson({ version: 1, workspaceIdentity, target: canonicalTarget(clone(target)) }));
}

/** @param {string} root */
function artifactDirectory(root) {
  return path.join(root, ARTIFACT_DIRECTORY);
}

/** @param {string} root @param {string} key @param {'claim'|'checkpoint'} kind */
function artifactPath(root, key, kind) {
  return path.join(artifactDirectory(root), `${key}.${kind}`);
}

/** @param {string} root @param {string} key */
function readCheckpointRecord(root, key) {
  return JSON.parse(fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8'));
}

/** @param {string} root @param {string} key @param {(record:Record<string, unknown>)=>void} mutate */
function rewriteCheckpointRecord(root, key, mutate) {
  const record = readCheckpointRecord(root, key);
  delete record.recordHash;
  mutate(record);
  const next = { ...record, recordHash: sha256(canonicalJson(record)) };
  fs.writeFileSync(artifactPath(root, key, 'checkpoint'), canonicalJson(next), 'utf8');
  return next;
}

/** @param {string} root @param {string} key @param {(claim:Record<string, unknown>)=>void} mutate */
function rewriteCheckpointClaim(root, key, mutate) {
  const claim = JSON.parse(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'));
  delete claim.claimHash;
  mutate(claim);
  const next = { ...claim, claimHash: sha256(canonicalJson(claim)) };
  fs.writeFileSync(artifactPath(root, key, 'claim'), canonicalJson(next), 'utf8');
  return next;
}

/** @param {Record<string, unknown>} [overrides] */
function checkpointInitial(overrides = {}) {
  return { ...sealedInitial(overrides), workspace: { ...WORKSPACE } };
}

/** @param {string} root @param {Record<string, unknown>} [dependencies] @param {Record<string, unknown>} [overrides] */
function checkpointAdapter(root, dependencies = {}, overrides = {}) {
  return createHostAdapter(checkpointInitial(overrides), {
    checkpoint: createTemporaryCheckpointStore({ root }),
    .../** @type {Record<string, unknown>} */ (dependencies),
  });
}

/** @param {Record<string, unknown>} checkpoint */
function checkpointClaim(checkpoint) {
  const body = {
    version: 1,
    checkpointKey: checkpoint.checkpointKey,
    invocationIdentity: checkpoint.invocationIdentity,
    workerToken: checkpoint.workerToken,
    workerGeneration: checkpoint.workerGeneration,
    createdAt: checkpoint.createdAt,
  };
  return { ...body, claimHash: sha256(canonicalJson(body)) };
}

/** @param {string} root @param {string} key */
function retainedCheckpointExpectation(root, key) {
  const claim = JSON.parse(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'));
  const checkpoint = readCheckpointRecord(root, key);
  return {
    claimHash: claim.claimHash,
    recordHash: checkpoint.recordHash,
    acceptedRevision: checkpoint.acceptedRevision,
    hostRevision: checkpoint.hostRevision,
  };
}

let memoryStoreOrdinal = 0;

/**
 * In-memory implementation of the same closed five-operation interface, with an
 * optional deliberate fault so storage failures are visible and fail closed.
 * @param {{fault?:(operation:string)=>boolean}} [overrides]
 */
function memoryCheckpointStore(overrides = {}) {
  const identity = sha256(`memory-checkpoint-store:${memoryStoreOrdinal += 1}`);
  const pair = { claim: null, checkpoint: null };
  const calls = [];
  /** @param {Record<string, unknown>} binding */
  const keyOf = (binding) => sha256(canonicalJson({
    version: 1,
    workspaceIdentity: binding.workspaceIdentity,
    target: clone(binding.target),
  }));
  /** @param {string} key @param {string} detail */
  const diagnostic = (key, detail) => ({
    version: 1,
    checkpointKey: key,
    claimPresent: pair.claim !== null,
    checkpointPresent: pair.checkpoint !== null,
    createdAt: pair.checkpoint?.createdAt ?? pair.claim?.createdAt ?? null,
    updatedAt: pair.checkpoint?.updatedAt ?? null,
    detail,
  });
  /** @param {string} operation @param {string} key */
  const faulted = (operation, key) => {
    calls.push(operation);
    return overrides.fault?.(operation)
      ? { version: 1, status: 'failed', checkpointKey: key, reason: `${operation}-fault` }
      : null;
  };
  /** @param {Record<string, unknown>} worker @param {Record<string, unknown>} expected @param {string} key */
  const ownershipFailure = (worker, expected, key) => {
    assert.deepEqual(Object.keys(expected).sort(), ['acceptedRevision', 'claimHash', 'hostRevision', 'recordHash']);
    assert.match(expected.claimHash, /^[0-9a-f]{64}$/);
    assert.match(expected.recordHash, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(expected.acceptedRevision) && expected.acceptedRevision >= 0);
    assert.ok(Number.isSafeInteger(expected.hostRevision) && expected.hostRevision >= 0);
    if (pair.claim === null || pair.checkpoint === null) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'partial-artifacts') };
    }
    const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
    if (current.invocationIdentity !== worker.invocationIdentity
      || pair.claim.invocationIdentity !== worker.invocationIdentity
      || current.checkpointKey !== key || pair.claim.checkpointKey !== key
      || current.workerToken !== worker.workerToken
      || current.workerGeneration !== worker.workerGeneration) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'worker-not-active') };
    }
    if (current.acceptedRevision !== expected.acceptedRevision || current.hostRevision !== expected.hostRevision) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'revision-mismatch') };
    }
    if (current.recordHash !== expected.recordHash || pair.claim.claimHash !== expected.claimHash) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'artifact-hash-mismatch') };
    }
    return null;
  };
  const port = {
    identity,
    claim(binding, next) {
      const key = keyOf(binding);
      const fault = faulted('claim', key);
      if (fault) return fault;
      if (pair.claim !== null || pair.checkpoint !== null) {
        return { version: 1, status: 'occupied', checkpointKey: key, diagnostic: diagnostic(key, 'ownership-claim-active') };
      }
      pair.claim = checkpointClaim(next);
      pair.checkpoint = clone(next);
      return { version: 1, status: 'claimed', checkpointKey: key, record: clone(next), claimHash: pair.claim.claimHash };
    },
    load(binding) {
      const key = keyOf(binding);
      const fault = faulted('load', key);
      if (fault) return fault;
      if (pair.claim === null && pair.checkpoint === null) {
        return { version: 1, status: 'absent', checkpointKey: key, diagnostic: diagnostic(key, 'artifacts-absent') };
      }
      if (pair.claim === null || pair.checkpoint === null) {
        return { version: 1, status: 'corrupt', checkpointKey: key, diagnostic: diagnostic(key, 'partial-artifacts') };
      }
      return { version: 1, status: 'loaded', checkpointKey: key, record: clone(pair.checkpoint), claimHash: pair.claim.claimHash };
    },
    update(binding, worker, expected, next) {
      const key = keyOf(binding);
      const fault = faulted('update', key);
      if (fault) return fault;
      const stale = ownershipFailure(worker, expected, key);
      if (stale) return stale;
      pair.checkpoint = clone(next);
      return { version: 1, status: 'updated', checkpointKey: key, record: clone(next), claimHash: pair.claim.claimHash };
    },
    handoff(binding, prior, replacement, expected, next) {
      const key = keyOf(binding);
      const fault = faulted('handoff', key);
      if (fault) return fault;
      const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
      const stale = ownershipFailure({
        invocationIdentity: current?.invocationIdentity,
        workerToken: prior.workerToken,
        workerGeneration: prior.workerGeneration,
      }, expected, key);
      if (stale) return stale;
      if (replacement.workerGeneration !== prior.workerGeneration + 1
        || replacement.workerToken === prior.workerToken) {
        return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'replacement-not-fresh') };
      }
      pair.checkpoint = clone(next);
      return { version: 1, status: 'handed-off', checkpointKey: key, record: clone(next), claimHash: pair.claim.claimHash };
    },
    clear(binding, worker, expected, reason) {
      const key = keyOf(binding);
      const fault = faulted('clear', key);
      if (fault) return fault;
      if (ownershipFailure(worker, expected, key)) {
        return { version: 1, status: 'failed', checkpointKey: key, reason: `clear-not-active:${reason}` };
      }
      pair.claim = null;
      pair.checkpoint = null;
      return { version: 1, status: 'cleared', checkpointKey: key };
    },
  };
  return { port, pair, calls };
}

/** @param {string} invocationIdentity @param {Record<string, unknown>} prior @param {Record<string, unknown>} [overrides] */
function handoffInput(invocationIdentity, prior, overrides = {}) {
  return {
    workspaceIdentity: WORKSPACE.workspaceIdentity,
    target: clone(TARGET),
    ownerIdentity: WORKSPACE.ownerIdentity,
    invocationIdentity,
    priorWorker: { workerToken: prior.workerToken, workerGeneration: prior.workerGeneration },
    observedExit: {
      workerToken: prior.workerToken,
      workerGeneration: prior.workerGeneration,
      exitCode: 9,
    },
    ...overrides,
  };
}

/** @param {Record<string, unknown>} receipt @param {Record<string, unknown>} [overrides] */
function resumeInput(receipt, overrides = {}) {
  return {
    workspaceIdentity: WORKSPACE.workspaceIdentity,
    target: clone(TARGET),
    ownerIdentity: WORKSPACE.ownerIdentity,
    prestate: {
      taskPrestateIdentity: WORKSPACE.taskPrestateIdentity,
      lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
    },
    invocationIdentity: receipt.invocationIdentity,
    worker: { workerToken: receipt.workerToken, workerGeneration: receipt.workerGeneration },
    handoffReceipt: clone(receipt),
    ...overrides,
  };
}

/** @param {unknown} store @param {Record<string, unknown>} [overrides] */
function resumePorts(store, overrides = {}) {
  return { checkpoint: store, noEffectAuthority: sealedNoEffectAuthority(), ...overrides };
}

/** @param {unknown} store */
function supervisorPorts(store) {
  return {
    checkpoint: store,
    supervisorSession: sealedSupervisorSession(),
    noEffectAuthority: sealedNoEffectAuthority(),
  };
}

nodeTest('exclusive claim writes one bounded host record and clears both artifacts at a named end', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const adapter = checkpointAdapter(root);
    assert.equal(adapter.snapshot().status, 'active');
    assert.equal(adapter.ownership(), null);
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)).sort(), [`${key}.checkpoint`, `${key}.claim`]);

    const stored = readCheckpointRecord(root, key);
    assert.deepEqual(Object.keys(stored).sort(), [
      'acceptedRevision', 'acceptedStateBytes', 'acceptedStateHash', 'checkpointKey', 'correction',
      'createdAt', 'hostRevision', 'inFlight', 'inspectionIdentity', 'invocationIdentity', 'lane',
      'lanePrestateIdentity', 'ownerIdentity', 'recordHash', 'target', 'taskPrestateIdentity',
      'updatedAt', 'version', 'workerGeneration', 'workerToken', 'workspaceIdentity',
    ]);
    assert.equal(stored.checkpointKey, key);
    assert.equal(stored.acceptedStateBytes, canonicalJson(pendingState()));
    assert.equal(stored.acceptedRevision, 0);
    assert.equal(stored.hostRevision, 0);
    assert.equal(stored.workerGeneration, 1);
    assert.equal(stored.invocationIdentity, adapter.snapshot().invocationIdentity);
    assert.equal(stored.lane, TARGET.lane);

    const ended = adapter.end('natural-end');
    assert.equal(ended.outcome, 'ended');
    assert.equal(ended.reason, 'natural-end');
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
    assert.equal(adapter.end('natural-end').outcome, 'ended');
  });
});

nodeTest('the derived per-target key ignores caller text and separates distinct targets', () => {
  withTemporaryRoot((root) => {
    const first = checkpointAdapter(root);
    const second = createHostAdapter(
      { ...sealedInitial({ state: emptyState(), target: clone(SECOND_TARGET) }), workspace: { ...WORKSPACE } },
      { checkpoint: createTemporaryCheckpointStore({ root }) },
    );
    assert.equal(first.snapshot().status, 'active');
    assert.equal(second.snapshot().status, 'active');
    const names = fs.readdirSync(artifactDirectory(root)).sort();
    assert.deepEqual(names, [
      `${derivedCheckpointKey()}.checkpoint`,
      `${derivedCheckpointKey()}.claim`,
      `${derivedCheckpointKey(SECOND_TARGET)}.checkpoint`,
      `${derivedCheckpointKey(SECOND_TARGET)}.claim`,
    ].sort());
    for (const name of names) {
      assert.match(name, /^[0-9a-f]{64}\.(claim|checkpoint)$/);
      assert.equal(name.includes(TARGET.specPath), false);
    }
    first.end('controlled-end');
    second.end('cancelled');
  });
});

nodeTest('a live claim refuses a second worker with a safe bounded-pair diagnostic', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const first = checkpointAdapter(root);
    const second = checkpointAdapter(root);
    assert.equal(second.snapshot().status, 'hard-stop');
    assert.equal(second.snapshot().disposition, 'checkpoint-ownership-unavailable');
    const ownership = second.ownership();
    assert.deepEqual(Object.keys(ownership).sort(), [
      'ageIsDiagnosticOnly', 'artifacts', 'checkpointKey', 'checkpointPresent', 'claimPresent',
      'createdAt', 'detail', 'nextAction', 'reason', 'updatedAt', 'version',
    ]);
    assert.equal(ownership.checkpointKey, key);
    assert.deepEqual(ownership.artifacts, ['ownership-claim', 'checkpoint']);
    assert.equal(ownership.claimPresent, true);
    assert.equal(ownership.checkpointPresent, true);
    assert.equal(ownership.ageIsDiagnosticOnly, true);
    assert.equal(ownership.nextAction, 'manual-cleanup-of-this-bounded-pair-after-confirmed-no-invocation');
    assert.equal(canonicalJson(ownership).includes(root), false);
    assert.equal(canonicalJson(ownership).includes(TARGET.specPath), false);
    assert.equal(second.run(sealedResultRequest(second)).outcome, 'hard-stop');
    assert.equal(first.snapshot().status, 'active');
    first.end('natural-end');
  });
});

nodeTest('a stale orphan never expires, and manual cleanup of only the bounded pair unblocks a fresh claim', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    checkpointAdapter(root).snapshot();
    rewriteCheckpointRecord(root, key, (stored) => {
      stored.createdAt = '1970-01-01T00:00:00.000Z';
      stored.updatedAt = '1970-01-01T00:00:00.000Z';
    });
    for (const attempt of [1, 2]) {
      const blocked = checkpointAdapter(root);
      assert.equal(blocked.snapshot().disposition, 'checkpoint-ownership-unavailable', `attempt ${attempt}`);
      assert.equal(blocked.ownership().createdAt, '1970-01-01T00:00:00.000Z', `attempt ${attempt}`);
      assert.equal(blocked.ownership().ageIsDiagnosticOnly, true, `attempt ${attempt}`);
    }

    fs.rmSync(artifactPath(root, key, 'claim'));
    const partial = checkpointAdapter(root);
    assert.equal(partial.snapshot().disposition, 'checkpoint-stale-orphan');
    assert.equal(partial.ownership().claimPresent, false);
    assert.equal(partial.ownership().checkpointPresent, true);
    assert.equal(partial.ownership().detail, 'partial-artifacts');

    fs.rmSync(artifactPath(root, key, 'checkpoint'));
    const fresh = checkpointAdapter(root);
    assert.equal(fresh.snapshot().status, 'active');
    assert.notEqual(fresh.snapshot().invocationIdentity, null);
    fresh.end('natural-end');
  });
});

nodeTest('post-clean preflight refuses unproven absence and a reappeared artifact', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const backing = createTemporaryCheckpointStore({ root });
    const unproven = createHostAdapter(checkpointInitial(), {
      checkpoint: {
        ...backing,
        load(binding) {
          const loaded = backing.load(binding);
          return { ...loaded, diagnostic: { ...loaded.diagnostic, claimPresent: true } };
        },
      },
    });
    assert.equal(unproven.snapshot().disposition, 'checkpoint-absence-unproven');
    assert.equal(unproven.ownership().checkpointKey, key);
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);

    const occupier = checkpointAdapter(root);
    const reappeared = createHostAdapter(checkpointInitial(), {
      checkpoint: {
        ...backing,
        load(binding) {
          const derived = backing.load(binding).checkpointKey;
          return {
            version: 1,
            status: 'absent',
            checkpointKey: derived,
            diagnostic: {
              version: 1,
              checkpointKey: derived,
              claimPresent: false,
              checkpointPresent: false,
              createdAt: null,
              updatedAt: null,
              detail: 'artifacts-absent',
            },
          };
        },
      },
    });
    assert.equal(reappeared.snapshot().disposition, 'checkpoint-ownership-unavailable');
    assert.equal(reappeared.ownership().claimPresent, true);
    occupier.end('natural-end');
  });
});

nodeTest('exact prior-worker exit hands one replacement the same accepted bytes and identity', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), { checkpoint: store });
    const before = worker.snapshot();

    const handed = handoffHostWorker(handoffInput(before.invocationIdentity, before), supervisorPorts(store));
    assert.equal(handed.outcome, 'handed-off');
    assert.equal(handed.receipt.invocationIdentity, before.invocationIdentity);
    assert.equal(handed.receipt.priorWorkerGeneration, before.workerGeneration);
    assert.equal(handed.receipt.workerGeneration, before.workerGeneration + 1);
    assert.notEqual(handed.receipt.workerToken, before.workerToken);
    assert.equal(handed.receipt.acceptedStateHash, before.acceptedStateHash);
    assert.equal(handed.receipt.acceptedRevision, before.acceptedRevision);
    assert.equal(readCheckpointRecord(root, key).workerGeneration, before.workerGeneration + 1);

    const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(store));
    assert.equal(resumed.outcome, 'resumed');
    const after = resumed.adapter.snapshot();
    assert.equal(after.acceptedStateBytes, before.acceptedStateBytes);
    assert.equal(after.acceptedStateHash, before.acceptedStateHash);
    assert.equal(after.acceptedRevision, before.acceptedRevision);
    assert.equal(after.invocationIdentity, before.invocationIdentity);
    assert.equal(after.workerToken, handed.receipt.workerToken);
    assert.equal(after.workerGeneration, before.workerGeneration + 1);
    assert.ok(after.hostRevision > handed.receipt.hostRevision);

    const stale = worker.run(sealedResultRequest(worker));
    assert.equal(stale.outcome, 'hard-stop');
    assert.equal(stale.reason, 'checkpoint-drift');
    resumed.adapter.end('task-settled');
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
  });
});

nodeTest('handoff refuses missing exit proof, stale workers, and replayed prior generations', () => {
  withTemporaryRoot((root) => {
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), { checkpoint: store });
    const active = worker.snapshot();
    const cases = [
      ['inexact exit token', handoffInput(active.invocationIdentity, active, {
        observedExit: { workerToken: sha256('other-worker'), workerGeneration: 1, exitCode: 9 },
      }), 'prior-worker-exit-unproven'],
      ['inexact exit generation', handoffInput(active.invocationIdentity, active, {
        observedExit: { workerToken: active.workerToken, workerGeneration: 2, exitCode: 9 },
      }), 'prior-worker-exit-unproven'],
      ['stale generation', handoffInput(active.invocationIdentity, {
        workerToken: active.workerToken,
        workerGeneration: 4,
      }), 'stale-worker'],
      ['stale token', handoffInput(active.invocationIdentity, {
        workerToken: sha256('retired-worker'),
        workerGeneration: 1,
      }), 'stale-worker'],
      ['lost invocation identity', handoffInput(sha256('forgotten-invocation'), active), 'invocation-identity-mismatch'],
    ];
    for (const [label, input, reason] of cases) {
      const refused = handoffHostWorker(input, supervisorPorts(store));
      assert.equal(refused.outcome, 'hard-stop', label);
      assert.equal(refused.reason, reason, label);
      assert.equal(refused.receipt, null, label);
      assert.equal(refused.ownership.ageIsDiagnosticOnly, true, label);
    }
    assert.equal(readCheckpointRecord(root, derivedCheckpointKey()).workerGeneration, 1);

    const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store));
    assert.equal(handed.outcome, 'handed-off');
    const replayed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store));
    assert.equal(replayed.outcome, 'hard-stop');
    assert.equal(replayed.reason, 'stale-worker');
  });
});

nodeTest('an authorized handoff reuses the invocation identity while unauthorized reuse stays refused', () => {
  withTemporaryRoot((root) => {
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), { checkpoint: store });
    const active = worker.snapshot();

    const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store));
    assert.equal(handed.outcome, 'handed-off');
    assert.equal(handed.receipt.invocationIdentity, active.invocationIdentity);
    const second = handoffHostWorker(handoffInput(active.invocationIdentity, {
      workerToken: handed.receipt.workerToken,
      workerGeneration: handed.receipt.workerGeneration,
    }), supervisorPorts(store));
    assert.equal(second.outcome, 'handed-off');
    assert.equal(second.receipt.invocationIdentity, active.invocationIdentity);
    assert.equal(second.receipt.workerGeneration, 3);

    assert.throws(
      () => createAuthorizedHostAdapter(sealedInitial(), {
        supervisorSession: sealedSupervisorSession({
          admit(request, identity) {
            const body = {
              version: 1,
              requestIdentity: request.requestIdentity,
              invocationIdentity: active.invocationIdentity,
              workerToken: sha256('unauthorized-worker'),
              workerGeneration: 1,
              supervisorAuthorityIdentity: identity,
            };
            return { ...body, admissionIdentity: admissionIdentity(request, body) };
          },
        }),
        noEffectAuthority: sealedNoEffectAuthority(),
      }),
      /invocationIdentity must not replay a prior admitted invocation identity/,
    );

    const forged = handoffHostWorker(handoffInput(active.invocationIdentity, {
      workerToken: second.receipt.workerToken,
      workerGeneration: second.receipt.workerGeneration,
    }), {
      checkpoint: store,
      noEffectAuthority: sealedNoEffectAuthority(),
      supervisorSession: sealedSupervisorSession({
        admit(request, identity) {
          const body = {
            version: 1,
            requestIdentity: request.requestIdentity,
            invocationIdentity: sha256('substituted-invocation'),
            workerToken: sha256('substituted-worker'),
            workerGeneration: request.priorWorkerGeneration + 1,
            supervisorAuthorityIdentity: identity,
          };
          return { ...body, admissionIdentity: admissionIdentity(request, body) };
        },
      }),
    });
    assert.equal(forged.outcome, 'hard-stop');
    assert.equal(forged.reason, 'replacement-admission-refused');
    assert.equal(readCheckpointRecord(root, derivedCheckpointKey()).workerGeneration, 3);
  });
});

nodeTest('resume hard-stops on lost supervisor context, missing identity, and forged receipts', () => {
  withTemporaryRoot((root) => {
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), { checkpoint: store });
    const active = worker.snapshot();
    const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store));
    const receipt = handed.receipt;
    const stored = readCheckpointRecord(root, derivedCheckpointKey());

    for (const [label, input, reason] of [
      ['no supplied identity', (() => {
        const value = resumeInput(receipt);
        delete value.invocationIdentity;
        return value;
      })(), 'supervisor-identity-missing'],
      ['no worker', (() => {
        const value = resumeInput(receipt);
        delete value.worker;
        return value;
      })(), 'supervisor-identity-missing'],
      ['checkpoint contents instead of a receipt', (() => {
        const value = resumeInput(receipt);
        delete value.handoffReceipt;
        value.invocationIdentity = stored.invocationIdentity;
        value.worker = { workerToken: stored.workerToken, workerGeneration: stored.workerGeneration };
        return value;
      })(), 'supervisor-identity-missing'],
      ['forged receipt hash', resumeInput({ ...receipt, receiptHash: sha256('forged') }), 'resume-input-not-authorized'],
      ['substituted identity', resumeInput(receipt, { invocationIdentity: sha256('other-invocation') }), 'supervisor-identity-mismatch'],
      ['substituted worker', resumeInput(receipt, {
        worker: { workerToken: sha256('other-worker'), workerGeneration: receipt.workerGeneration },
      }), 'supervisor-identity-mismatch'],
    ]) {
      const stopped = resumeHostAdapter(input, resumePorts(store));
      assert.equal(stopped.outcome, 'hard-stop', label);
      assert.equal(stopped.reason, reason, label);
      assert.equal(stopped.adapter, null, label);
    }
    assert.equal(readCheckpointRecord(root, derivedCheckpointKey()).hostRevision, stored.hostRevision);
  });
});

nodeTest('resume compares owner, lane, prestate, target, and revision classes before any route runs', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), { checkpoint: store });
    const active = worker.snapshot();
    const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store));
    const receipt = handed.receipt;

    for (const [label, overrides, reason] of [
      ['owner drift', { ownerIdentity: sha256('other-owner') }, 'owner-drift'],
      ['task prestate drift', {
        prestate: {
          taskPrestateIdentity: sha256('other-task-prestate'),
          lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
        },
      }, 'lane-prestate-drift'],
      ['lane prestate drift', {
        prestate: {
          taskPrestateIdentity: WORKSPACE.taskPrestateIdentity,
          lanePrestateIdentity: sha256('other-lane-prestate'),
        },
      }, 'lane-prestate-drift'],
      ['target drift', { target: clone(SECOND_TARGET) }, 'checkpoint-absent'],
      ['workspace drift', { workspaceIdentity: sha256('other-workspace') }, 'checkpoint-absent'],
    ]) {
      const stopped = resumeHostAdapter(resumeInput(receipt, overrides), resumePorts(store));
      assert.equal(stopped.outcome, 'hard-stop', label);
      assert.equal(stopped.reason, reason, label);
    }

    rewriteCheckpointRecord(root, key, (stored) => {
      stored.hostRevision += 1;
    });
    const conflict = resumeHostAdapter(resumeInput(receipt), resumePorts(store));
    assert.equal(conflict.outcome, 'hard-stop');
    assert.equal(conflict.reason, 'checkpoint-revision-conflict');

    fs.writeFileSync(artifactPath(root, key, 'checkpoint'), '{"version":1', 'utf8');
    const corrupt = resumeHostAdapter(resumeInput(receipt), resumePorts(store));
    assert.equal(corrupt.outcome, 'hard-stop');
    assert.equal(corrupt.reason, 'checkpoint-stale-orphan');
  });
});

nodeTest('worker death around a provisional effect resumes only on an exact receipt and poststate', () => {
  const provisional = pendingState('autonomous');
  const provisionalHash = sha256(canonicalJson(provisional));
  const effectIdentity = sha256('outstanding-projection-effect');
  const receiptIdentity = sha256('outstanding-projection-receipt');
  const foreignReceiptIdentity = sha256('second-outstanding-projection-receipt');
  const zeroedReceiptIdentity = '0'.repeat(64);
  /** @param {string} root @param {Record<string, unknown>} [inFlight] */
  const stagedHandoff = (root, inFlight = {}) => {
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), { checkpoint: store });
    const active = worker.snapshot();
    rewriteCheckpointRecord(root, derivedCheckpointKey(), (stored) => {
      stored.inFlight = {
        semanticOperation: 'record-attempt-result',
        expectedEffectIdentity: effectIdentity,
        expectedReceiptIdentity: receiptIdentity,
        provisionalStateHash: provisionalHash,
        ...inFlight,
      };
    });
    return {
      store,
      receipt: handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store)).receipt,
    };
  };
  /** @param {Record<string, unknown>} [overrides] */
  const establishedEffect = (overrides = {}) => ({
    status: 'established',
    effectIdentity,
    receiptIdentity,
    provisionalState: clone(provisional),
    ...overrides,
  });

  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const staged = stagedHandoff(root);
    const unverified = resumeHostAdapter(resumeInput(staged.receipt), resumePorts(staged.store));
    assert.equal(unverified.reason, 'effect-unverified');
    for (const [label, effect, reason] of [
      ['unknown effect identity', establishedEffect({ effectIdentity: sha256('other-effect') }), 'unknown-effect'],
      ['unknown effect status', { status: 'assumed' }, 'unknown-effect'],
      ['arbitrary receipt', establishedEffect({ receiptIdentity: sha256('receipt') }), 'unknown-effect'],
      ['zeroed receipt', establishedEffect({ receiptIdentity: zeroedReceiptIdentity }), 'unknown-effect'],
      ['another effect receipt', establishedEffect({ receiptIdentity: foreignReceiptIdentity }), 'unknown-effect'],
      ['effect identity replayed as its own receipt', establishedEffect({ receiptIdentity: effectIdentity }), 'unknown-effect'],
      ['provisional state hash replayed as a receipt', establishedEffect({ receiptIdentity: provisionalHash }), 'unknown-effect'],
      ['poststate mismatch', establishedEffect({ provisionalState: emptyState() }), 'effect-poststate-mismatch'],
      // Resume already forced the supplied prestate to equal the checkpoint's, so an
      // unchanged-prestate attestation only restates the caller's own input. It can never
      // vouch for a bound effect, whichever identities it carries.
      ['unchanged prestate drift', {
        status: 'unchanged-prestate',
        taskPrestateIdentity: sha256('other-task-prestate'),
        lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
      }, 'effect-unverified'],
      ['unchanged prestate replayed against a bound expectation', {
        status: 'unchanged-prestate',
        taskPrestateIdentity: WORKSPACE.taskPrestateIdentity,
        lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
      }, 'effect-unverified'],
    ]) {
      const stopped = resumeHostAdapter(resumeInput(staged.receipt, { effect }), resumePorts(staged.store));
      assert.equal(stopped.outcome, 'hard-stop', label);
      assert.equal(stopped.reason, reason, label);
      const held = readCheckpointRecord(root, key);
      assert.equal(held.acceptedStateBytes, canonicalJson(pendingState()), label);
      assert.equal(held.acceptedRevision, 0, label);
      assert.equal(held.inFlight.expectedEffectIdentity, effectIdentity, label);
    }
  });

  withTemporaryRoot((root) => {
    // Nothing was in flight, so there is no effect for the attestation to vouch for and the
    // prestate comparison is the only thing left to check.
    const staged = stagedHandoff(root, {
      expectedEffectIdentity: null,
      expectedReceiptIdentity: null,
      provisionalStateHash: null,
    });
    const drifted = resumeHostAdapter(resumeInput(staged.receipt, {
      effect: {
        status: 'unchanged-prestate',
        taskPrestateIdentity: sha256('other-task-prestate'),
        lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
      },
    }), resumePorts(staged.store));
    assert.equal(drifted.outcome, 'hard-stop');
    assert.equal(drifted.reason, 'lane-prestate-drift');
    assert.equal(readCheckpointRecord(root, derivedCheckpointKey()).acceptedRevision, 0);

    const predecessor = resumeHostAdapter(resumeInput(staged.receipt, {
      effect: {
        status: 'unchanged-prestate',
        taskPrestateIdentity: WORKSPACE.taskPrestateIdentity,
        lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
      },
    }), resumePorts(staged.store));
    assert.equal(predecessor.outcome, 'resumed');
    assert.equal(predecessor.adapter.snapshot().acceptedStateBytes, canonicalJson(pendingState()));
    assert.equal(predecessor.adapter.snapshot().acceptedRevision, 0);
    predecessor.adapter.end('cancelled');
  });

  withTemporaryRoot((root) => {
    const staged = stagedHandoff(root, { expectedReceiptIdentity: null });
    const underivable = resumeHostAdapter(
      resumeInput(staged.receipt, { effect: establishedEffect() }),
      resumePorts(staged.store),
    );
    assert.equal(underivable.outcome, 'hard-stop');
    assert.equal(underivable.reason, 'effect-unverified');
    const held = readCheckpointRecord(root, derivedCheckpointKey());
    assert.equal(held.acceptedStateBytes, canonicalJson(pendingState()));
    assert.equal(held.acceptedRevision, 0);
  });

  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const staged = stagedHandoff(root);
    const settled = resumeHostAdapter(
      resumeInput(staged.receipt, { effect: establishedEffect() }),
      resumePorts(staged.store),
    );
    assert.equal(settled.outcome, 'resumed');
    const snapshot = settled.adapter.snapshot();
    assert.equal(snapshot.acceptedStateBytes, canonicalJson(provisional));
    assert.equal(snapshot.acceptedRevision, 1);
    assert.equal(readCheckpointRecord(root, key).inFlight, null);

    // The one promotion clears the expectation, so replaying the same receipt cannot promote twice.
    const replayed = handoffHostWorker(handoffInput(snapshot.invocationIdentity, snapshot), supervisorPorts(staged.store));
    const reuse = resumeHostAdapter(
      resumeInput(replayed.receipt, { effect: establishedEffect() }),
      resumePorts(staged.store),
    );
    assert.equal(reuse.outcome, 'hard-stop');
    assert.equal(reuse.reason, 'unknown-effect');
    assert.equal(readCheckpointRecord(root, key).acceptedRevision, 1);
  });
});

nodeTest('an outstanding real projection effect cannot promote from its derived receipt alone', () => {
  withSealedWorkspace((root) => {
    const key = derivedCheckpointKey();
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'receipt-derivation');
    const store = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial({ state }), { checkpoint: store });
    const captured = worker.run(sealedRequest(worker, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
    }));
    assert.equal(captured.outcome, 'effect-required');
    assert.equal(captured.effect.kind, 'completion-retention');

    const pending = captured.session.pendingEffect;
    const stored = readCheckpointRecord(root, key);
    assert.equal(stored.inFlight.expectedEffectIdentity, pending.effectIdentity);
    assert.equal(stored.inFlight.expectedReceiptIdentity, fixture.identities.resultIdentity);
    assert.equal(stored.acceptedStateBytes, canonicalJson(state));
    assert.equal(stored.acceptedRevision, 0);

    const active = worker.snapshot();
    const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(store));
    /** @param {string} receiptIdentity */
    const resumeWithReceipt = (receiptIdentity) => resumeHostAdapter(resumeInput(handed.receipt, {
      effect: {
        status: 'established',
        effectIdentity: pending.effectIdentity,
        receiptIdentity,
        provisionalState: clone(pending.provisionalState),
      },
    }), resumePorts(store));

    for (const [label, receiptIdentity] of [
      ['arbitrary receipt', sha256('receipt')],
      ['zeroed receipt', '0'.repeat(64)],
      ['another effect receipt', sha256('trusted-result:capture')],
      ['effect identity replayed as its own receipt', pending.effectIdentity],
    ]) {
      const stopped = resumeWithReceipt(receiptIdentity);
      assert.equal(stopped.outcome, 'hard-stop', label);
      assert.equal(stopped.reason, 'unknown-effect', label);
      const held = readCheckpointRecord(root, key);
      assert.equal(held.acceptedStateBytes, canonicalJson(state), label);
      assert.equal(held.acceptedRevision, 0, label);
    }

    const unverified = resumeWithReceipt(fixture.identities.resultIdentity);
    assert.equal(unverified.outcome, 'hard-stop');
    assert.equal(unverified.reason, 'effect-unverified');
    const held = readCheckpointRecord(root, key);
    assert.equal(held.acceptedStateBytes, canonicalJson(state));
    assert.equal(held.acceptedRevision, 0);
    assert.deepEqual(held.inFlight, stored.inFlight);
  });
});

nodeTest('a checkpoint-backed closed refusal preserves bytes, counters, and correction across handoff', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    let calls = 0;
    const worker = createHostAdapter(checkpointInitial(), {
      checkpoint: store,
      ...sealedPorts((command, lowLevelRequest) => {
        calls += 1;
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      }),
    });
    const predecessor = worker.snapshot();
    const mismatch = worker.run(sealedResultRequest(worker, guardedResult({ operations: ['wrong-action'] })));
    assert.equal(mismatch.outcome, 'closed-refusal');
    assert.equal(mismatch.reason, 'action-mismatch');
    assert.equal(calls, 1);

    const recorded = readCheckpointRecord(root, key);
    assert.equal(recorded.acceptedStateBytes, predecessor.acceptedStateBytes);
    assert.equal(recorded.acceptedStateHash, predecessor.acceptedStateHash);
    assert.equal(recorded.acceptedRevision, predecessor.acceptedRevision);
    assert.ok(recorded.hostRevision > predecessor.hostRevision);
    assert.equal(recorded.correction.identity, mismatch.session.correction.identity);
    assert.equal(recorded.correction.consumed, false);
    assert.equal(recorded.correction.incidentClass, 'action-mismatch');
    assert.equal(recorded.correction.workerGeneration, 1);
    assert.equal(JSON.parse(recorded.acceptedStateBytes).overallUsed, predecessor.acceptedState.overallUsed);
    assert.equal(canonicalJson(recorded).includes('wrong-action'), false);

    const handed = handoffHostWorker(handoffInput(predecessor.invocationIdentity, predecessor), supervisorPorts(store));
    const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(store, sealedPorts((command, lowLevelRequest) => {
      calls += 1;
      return { status: 'returned', value: runCommand(command, lowLevelRequest) };
    })));
    assert.equal(resumed.outcome, 'resumed');
    const replacement = resumed.adapter;
    const carried = replacement.snapshot();
    assert.equal(carried.correction.identity, mismatch.session.correction.identity);
    assert.equal(carried.correction.consumed, false);
    assert.equal(carried.correction.workerGeneration, 1);
    assert.equal(carried.workerGeneration, 2);
    assert.equal(carried.acceptedStateBytes, predecessor.acceptedStateBytes);

    const correction = sealedResultRequest(replacement, guardedResult({ operations: ['wrong-action'] }));
    correction.correctionIdentity = carried.correction.identity;
    const corrected = replacement.run(correction);
    assert.equal(corrected.outcome, 'closed-refusal');
    assert.equal(corrected.next.kind, 'inspect');
    assert.equal(corrected.session.correction.consumed, true);
    assert.equal(readCheckpointRecord(root, key).correction.consumed, true);

    const repeated = replacement.run(sealedResultRequest(replacement, guardedResult({ operations: ['wrong-action'] })));
    assert.equal(repeated.outcome, 'reinspect-required');
    assert.equal(repeated.next.kind, 'inspect');
    assert.equal(readCheckpointRecord(root, key).acceptedStateBytes, predecessor.acceptedStateBytes);
    assert.equal(readCheckpointRecord(root, key).acceptedRevision, 0);
  });
});

nodeTest('host incidents advance only the host revision and never pollute the accepted record', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    for (const [label, anomaly, reason] of RUNTIME_ANOMALIES) {
      fs.rmSync(artifactDirectory(root), { recursive: true, force: true });
      const worker = checkpointAdapter(root, sealedPorts(anomaly));
      const predecessor = worker.snapshot();
      const refused = worker.run(sealedResultRequest(worker));
      assert.equal(refused.outcome, 'closed-refusal', label);
      assert.equal(refused.reason, reason, label);
      const recorded = readCheckpointRecord(root, key);
      assert.equal(recorded.acceptedStateBytes, predecessor.acceptedStateBytes, label);
      assert.equal(recorded.acceptedRevision, 0, label);
      assert.equal(JSON.parse(recorded.acceptedStateBytes).overallUsed, 1, label);
      assert.deepEqual(JSON.parse(recorded.acceptedStateBytes).recoveryUsed, [], label);
      assert.deepEqual(JSON.parse(recorded.acceptedStateBytes).completed, [], label);
      assert.ok(recorded.hostRevision >= 2, label);
      assert.equal(canonicalJson(recorded).includes(reason), false, label);
      worker.end('hard-stop-recorded');
    }
  });
});

nodeTest('every allowed terminal boundary clears the bounded pair exactly once', () => {
  for (const reason of ['task-settled', 'natural-end', 'controlled-end', 'cancelled', 'hard-stop-recorded']) {
    withTemporaryRoot((root) => {
      const worker = checkpointAdapter(root, sealedPorts({ status: 'empty' }));
      if (reason === 'hard-stop-recorded') {
        const stale = worker.run({ ...sealedResultRequest(worker), expectedHostRevision: 99 });
        assert.equal(stale.outcome, 'hard-stop', reason);
      }
      const ended = worker.end(reason);
      assert.equal(ended.outcome, 'ended', reason);
      assert.equal(ended.reason, reason, reason);
      assert.deepEqual(fs.readdirSync(artifactDirectory(root)), [], reason);
    });
  }
  withTemporaryRoot((root) => {
    const worker = checkpointAdapter(root);
    assert.throws(() => worker.end('expired'), /must be one of/);
    assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
    worker.end('natural-end');
  });
});

for (const kind of ['claim', 'checkpoint']) {
  nodeTest(`056 owner finalization refuses an independently rehashed ${kind} before deletion`, (context) => {
    withTemporaryRoot((root) => {
      const key = derivedCheckpointKey();
      const store = createTemporaryCheckpointStore({ root });
      const worker = checkpointAdapter(root, { checkpoint: store });
      const before = worker.snapshot();
      const originalClaim = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
      const originalCheckpoint = readCheckpointRecord(root, key);
      if (kind === 'claim') {
        rewriteCheckpointClaim(root, key, (claim) => { claim.createdAt = '2000-01-01T00:00:00.000Z'; });
      } else {
        rewriteCheckpointRecord(root, key, (checkpoint) => {
          checkpoint.inspectionIdentity = sha256('056 changed checkpoint inspection');
        });
      }
      const claimBytes = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
      const checkpointBytes = fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8');
      const { claimHash, ...claimBody } = JSON.parse(claimBytes);
      const { recordHash, ...checkpointBody } = JSON.parse(checkpointBytes);
      assert.equal(claimHash, sha256(canonicalJson(claimBody)));
      assert.equal(recordHash, sha256(canonicalJson(checkpointBody)));
      assert.equal(checkpointBody.acceptedRevision, originalCheckpoint.acceptedRevision);
      assert.equal(checkpointBody.hostRevision, originalCheckpoint.hostRevision);
      assert.equal(claimBody.invocationIdentity, before.invocationIdentity);
      assert.equal(checkpointBody.invocationIdentity, before.invocationIdentity);
      assert.equal(claimBody.workerToken, before.workerToken);
      assert.equal(checkpointBody.workerToken, before.workerToken);
      assert.equal(claimBody.workerGeneration, before.workerGeneration);
      assert.equal(checkpointBody.workerGeneration, before.workerGeneration);
      assert.equal(
        kind === 'claim' ? checkpointBytes : claimBytes,
        kind === 'claim' ? canonicalJson(originalCheckpoint) : originalClaim,
        'the companion artifact remains valid and unchanged',
      );
      assert.equal(store.load({
        version: 1,
        workspaceIdentity: WORKSPACE.workspaceIdentity,
        target: clone(TARGET),
        ownerIdentity: WORKSPACE.ownerIdentity,
      }).status, 'loaded', 'both canonical artifacts pass parsing before the retained-version check');

      const removals = [];
      const remove = fs.rmSync;
      const mocked = context.mock.method(fs, 'rmSync', (target, options) => {
        removals.push(target);
        return remove(target, options);
      });
      try {
        const stopped = worker.end('hard-stop-recorded');
        assert.equal(stopped.outcome, 'hard-stop');
        assert.equal(stopped.reason, 'checkpoint-cleanup-failed');
        assert.deepEqual(removals, []);
        assert.deepEqual(acceptedAuthorityTuple(stopped.session), acceptedAuthorityTuple(before));
        assert.equal(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'), claimBytes);
        assert.equal(fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8'), checkpointBytes);
      } finally {
        mocked.mock.restore();
      }
    });
  });
}

for (const kind of ['claim', 'checkpoint']) {
  for (const fault of ['missing', 'corrupt', 'noncanonical', 'oversize', 'directory']) {
    nodeTest(`056 owner finalization refuses ${fault} ${kind} artifacts without removing the companion`, (context) => {
      withTemporaryRoot((root) => {
        const key = derivedCheckpointKey();
        const worker = checkpointAdapter(root);
        const target = artifactPath(root, key, kind);
        const companion = artifactPath(root, key, kind === 'claim' ? 'checkpoint' : 'claim');
        const companionBytes = fs.readFileSync(companion, 'utf8');
        if (fault === 'missing' || fault === 'directory') fs.rmSync(target);
        if (fault === 'directory') fs.mkdirSync(target);
        if (fault === 'corrupt') fs.writeFileSync(target, '{', 'utf8');
        if (fault === 'noncanonical') fs.appendFileSync(target, ' ', 'utf8');
        if (fault === 'oversize') fs.writeFileSync(target, 'x'.repeat(65_537), 'utf8');
        const remove = context.mock.method(fs, 'rmSync', () => assert.fail('initial refusal must remove neither artifact'));
        try {
          const stopped = worker.end('hard-stop-recorded');
          assert.equal(stopped.outcome, 'hard-stop');
          assert.equal(stopped.reason, 'checkpoint-cleanup-failed');
          assert.equal(remove.mock.callCount(), 0);
          assert.equal(fs.readFileSync(companion, 'utf8'), companionBytes);
          assert.equal(fs.existsSync(target), fault !== 'missing');
        } finally {
          remove.mock.restore();
        }
      });
    });
  }
}

for (const [label, mutate, detail] of [
  ['foreign invocation', (_binding, worker) => { worker.invocationIdentity = sha256('056 foreign invocation'); }, 'worker-not-active'],
  ['wrong worker token', (_binding, worker) => { worker.workerToken = sha256('056 wrong worker'); }, 'worker-not-active'],
  ['wrong worker generation', (_binding, worker) => { worker.workerGeneration += 1; }, 'worker-not-active'],
  ['wrong accepted revision', (_binding, _worker, expected) => { expected.acceptedRevision += 1; }, 'revision-mismatch'],
  ['wrong host revision', (_binding, _worker, expected) => { expected.hostRevision += 1; }, 'revision-mismatch'],
  ['missing claim hash', (_binding, _worker, expected) => { delete expected.claimHash; }, 'claimHash'],
  ['missing record hash', (_binding, _worker, expected) => { delete expected.recordHash; }, 'recordHash'],
  ['malformed claim hash', (_binding, _worker, expected) => { expected.claimHash = 'bad'; }, 'claimHash'],
  ['malformed record hash', (_binding, _worker, expected) => { expected.recordHash = 'bad'; }, 'recordHash'],
  ['foreign claim hash', (_binding, _worker, expected) => { expected.claimHash = sha256('056 foreign claim'); }, 'artifact-hash-mismatch'],
  ['foreign record hash', (_binding, _worker, expected) => { expected.recordHash = sha256('056 foreign record'); }, 'artifact-hash-mismatch'],
  ['wrong owner', (binding) => { binding.ownerIdentity = sha256('056 wrong owner'); }, 'artifact-binding-mismatch'],
  ['wrong workspace', (binding) => { binding.workspaceIdentity = sha256('056 wrong workspace'); }, 'artifacts-absent'],
  ['wrong target', (binding) => { binding.target = clone(SECOND_TARGET); }, 'artifacts-absent'],
]) {
  nodeTest(`056 owner finalization refuses ${label} with an otherwise valid pair`, (context) => {
    withTemporaryRoot((root) => {
      const key = derivedCheckpointKey();
      const store = createTemporaryCheckpointStore({ root });
      let clearCalls = 0;
      let checkedRefusal = false;
      const worker = checkpointAdapter(root, {
        checkpoint: {
          ...store,
          clear(binding, active, expected, reason) {
            clearCalls += 1;
            assert.deepEqual(expected, retainedCheckpointExpectation(root, key));
            const suppliedBinding = clone(binding);
            mutate(suppliedBinding, active, expected);
            const result = store.clear(suppliedBinding, active, expected, reason);
            assert.equal(result.status, 'failed');
            assert.match(result.reason, new RegExp(detail));
            checkedRefusal = true;
            return result;
          },
        },
      });
      const before = retainedCheckpointExpectation(root, key);
      const remove = context.mock.method(fs, 'rmSync', () => assert.fail('invalid authority must remove neither artifact'));
      try {
        const stopped = worker.end('hard-stop-recorded');
        assert.equal(stopped.reason, 'checkpoint-cleanup-failed');
        assert.equal(stopped.outcome, 'hard-stop');
        assert.equal(checkedRefusal, true, 'the intended store guard, not a port assertion, refused');
        assert.deepEqual(retainedCheckpointExpectation(root, key), before);
        assert.equal(worker.end('hard-stop-recorded').outcome, 'hard-stop');
        assert.equal(worker.end('natural-end').outcome, 'hard-stop');
        assert.equal(clearCalls, 1, 'a failed cleanup is never retried');
        assert.equal(remove.mock.callCount(), 0);
      } finally {
        remove.mock.restore();
      }
    });
  });
}

for (const operation of ['claim', 'load', 'update', 'handoff']) {
  for (const fault of ['missing', 'malformed', 'changed']) {
    nodeTest(`056 owner finalization rejects a ${fault} claim hash in the ${operation} result`, () => {
      withTemporaryRoot((root) => {
        const key = derivedCheckpointKey();
        const store = createTemporaryCheckpointStore({ root });
        let corruptResult = operation === 'claim';
        let corruptions = 0;
        let clearExpectation;
        const port = {
          ...store,
          [operation](...args) {
            const result = store[operation](...args);
            if (corruptResult && result.record) {
              corruptions += 1;
              if (fault === 'missing') delete result.claimHash;
              else result.claimHash = fault === 'malformed' ? 'bad' : sha256('056 substituted claim hash');
            }
            return result;
          },
          clear(binding, worker, expected, reason) {
            clearExpectation = clone(expected);
            return store.clear(binding, worker, expected, reason);
          },
        };
        const worker = checkpointAdapter(root, { checkpoint: port });
        const initialExpectation = retainedCheckpointExpectation(root, key);
        const claimBytes = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
        let stopped;
        corruptResult = true;
        if (operation === 'claim') {
          stopped = { outcome: worker.snapshot().status, reason: worker.snapshot().disposition };
        } else if (operation === 'handoff') {
          const before = worker.snapshot();
          stopped = handoffHostWorker(handoffInput(before.invocationIdentity, before), supervisorPorts(port));
          assert.equal(stopped.receipt, null);
        } else {
          stopped = worker.run(sealedResultRequest(worker));
        }
        assert.equal(stopped.outcome, 'hard-stop');
        assert.equal(stopped.reason, operation === 'load'
          ? fault === 'changed' ? 'checkpoint-drift' : 'checkpoint-corrupt'
          : `checkpoint-${operation}-failed`);
        assert.equal(corruptions, 1, 'the intended successful result reached the closed-result validator');
        assert.equal(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'), claimBytes);
        if (operation === 'update') {
          // The store wrote the next checkpoint, but its invalid response must
          // not advance either of the host's retained expectations.
          assert.notEqual(readCheckpointRecord(root, key).recordHash, initialExpectation.recordHash);
          assert.equal(worker.end('hard-stop-recorded').reason, 'checkpoint-cleanup-failed');
          assert.deepEqual(clearExpectation, initialExpectation);
          assert.equal(fs.existsSync(artifactPath(root, key, 'checkpoint')), true);
        }
      });
    });
  }
}

for (const operation of ['update', 'handoff']) {
  for (const kind of ['claim', 'checkpoint']) {
    nodeTest(`056 owner finalization refuses rehashed ${kind} drift at the ${operation} port`, () => {
      withTemporaryRoot((root) => {
        const key = derivedCheckpointKey();
        const store = createTemporaryCheckpointStore({ root });
        let changedBytes;
        let driftChecks = 0;
        const port = {
          ...store,
          [operation](...args) {
            if (kind === 'claim') {
              rewriteCheckpointClaim(root, key, (claim) => { claim.createdAt = '2000-01-01T00:00:00.000Z'; });
            } else {
              rewriteCheckpointRecord(root, key, (checkpoint) => {
                checkpoint.inspectionIdentity = sha256('056 drift at checkpoint port');
              });
            }
            changedBytes = fs.readFileSync(artifactPath(root, key, kind), 'utf8');
            const refused = store[operation](...args);
            assert.equal(refused.status, 'stale');
            assert.equal(refused.diagnostic.detail, 'artifact-hash-mismatch');
            driftChecks += 1;
            return refused;
          },
        };
        const worker = checkpointAdapter(root, { checkpoint: port });
        const before = worker.snapshot();
        const stopped = operation === 'handoff'
          ? handoffHostWorker(handoffInput(before.invocationIdentity, before), supervisorPorts(port))
          : worker.run(sealedResultRequest(worker));
        assert.equal(stopped.outcome, 'hard-stop');
        assert.equal(driftChecks, 1);
        assert.equal(fs.readFileSync(artifactPath(root, key, kind), 'utf8'), changedBytes);
        assert.equal(readCheckpointRecord(root, key).hostRevision, before.hostRevision);
        assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
      });
    });
  }
}

for (const kind of ['claim', 'checkpoint']) {
  nodeTest(`056 owner finalization refuses rehashed ${kind} drift between handoff and resume`, () => {
    withTemporaryRoot((root) => {
      const key = derivedCheckpointKey();
      const store = createTemporaryCheckpointStore({ root });
      const calls = [];
      const port = { ...store };
      for (const operation of ['claim', 'load', 'update', 'handoff', 'clear']) {
        port[operation] = (...args) => {
          calls.push(operation);
          return store[operation](...args);
        };
      }
      const worker = checkpointAdapter(root, { checkpoint: port }, { state: emptyState('autonomous') });
      const active = worker.snapshot();
      const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(port));
      assert.equal(handed.outcome, 'handed-off');
      const originalClaim = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
      const originalCheckpoint = fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8');
      assert.equal(JSON.parse(originalCheckpoint).inFlight, null, 'handoff is settled before the drift');

      if (kind === 'claim') {
        rewriteCheckpointClaim(root, key, (claim) => { claim.createdAt = '2000-01-01T00:00:00.000Z'; });
      } else {
        rewriteCheckpointRecord(root, key, (checkpoint) => {
          checkpoint.inspectionIdentity = sha256('056 changed inspection after settled handoff');
        });
      }
      const claimBytes = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
      const checkpointBytes = fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8');
      const { claimHash, ...claimBody } = JSON.parse(claimBytes);
      const { recordHash, ...checkpointBody } = JSON.parse(checkpointBytes);
      const { claimHash: originalClaimHash, ...originalClaimBody } = JSON.parse(originalClaim);
      const { recordHash: originalRecordHash, ...originalCheckpointBody } = JSON.parse(originalCheckpoint);
      assert.equal(claimHash, sha256(canonicalJson(claimBody)));
      assert.equal(recordHash, sha256(canonicalJson(checkpointBody)));
      assert.deepEqual(claimBody, kind === 'claim'
        ? { ...originalClaimBody, createdAt: '2000-01-01T00:00:00.000Z' }
        : originalClaimBody);
      assert.deepEqual(checkpointBody, kind === 'checkpoint'
        ? { ...originalCheckpointBody, inspectionIdentity: sha256('056 changed inspection after settled handoff') }
        : originalCheckpointBody);
      assert.notEqual(kind === 'claim' ? claimHash : recordHash, kind === 'claim' ? originalClaimHash : originalRecordHash);
      assert.equal(kind === 'claim' ? checkpointBytes : claimBytes, kind === 'claim' ? originalCheckpoint : originalClaim);
      assert.equal(store.load({
        version: 1,
        workspaceIdentity: WORKSPACE.workspaceIdentity,
        target: clone(TARGET),
        ownerIdentity: WORKSPACE.ownerIdentity,
      }).status, 'loaded', 'valid timestamps, canonical hashes, and pair bindings reach the version guard');

      calls.length = 0;
      const stopped = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(port));
      assert.equal(stopped.outcome, 'hard-stop');
      assert.equal(stopped.reason, 'checkpoint-drift');
      assert.equal(stopped.adapter, null);
      assert.deepEqual(calls, ['load'], 'resume must not write or remove either changed artifact');
      assert.equal(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'), claimBytes);
      assert.equal(fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8'), checkpointBytes);
    });
  });
}

nodeTest('056 owner finalization requires complete artifact expectations in a handoff receipt', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    const calls = [];
    const port = { ...store };
    for (const operation of ['claim', 'load', 'update', 'handoff', 'clear']) {
      port[operation] = (...args) => {
        calls.push(operation);
        return store[operation](...args);
      };
    }
    const worker = checkpointAdapter(root, { checkpoint: port });
    const active = worker.snapshot();
    const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(port));
    assert.equal(handed.outcome, 'handed-off');
    const claimBytes = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
    const checkpointBytes = fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8');
    for (const field of ['claimHash', 'recordHash']) {
      for (const fault of ['missing', 'malformed', 'unbound', 'changed']) {
        const receipt = clone(handed.receipt);
        if (fault === 'missing') delete receipt[field];
        else receipt[field] = fault === 'malformed' ? 'bad' : sha256(`056 changed receipt ${field}`);
        if (fault !== 'unbound') {
          const { receiptHash: _receiptHash, ...body } = receipt;
          receipt.receiptHash = sha256(canonicalJson(body));
        }
        calls.length = 0;
        const stopped = resumeHostAdapter(resumeInput(receipt), resumePorts(port));
        const label = `${fault} ${field}`;
        assert.equal(stopped.outcome, 'hard-stop', label);
        assert.equal(stopped.reason, fault === 'changed' ? 'checkpoint-drift' : 'resume-input-not-authorized', label);
        assert.equal(stopped.adapter, null, label);
        assert.deepEqual(calls, fault === 'changed' ? ['load'] : [], label);
        assert.equal(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'), claimBytes, label);
        assert.equal(fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8'), checkpointBytes, label);
      }
    }
  });
});

nodeTest('056 owner finalization preserves the immutable claim through update, handoff, resume, and clear', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    const expectations = [];
    const port = { ...store };
    for (const operation of ['update', 'handoff', 'clear']) {
      port[operation] = (...args) => {
        const expected = args[operation === 'handoff' ? 3 : 2];
        assert.deepEqual(expected, retainedCheckpointExpectation(root, key), operation);
        expectations.push({ operation, expected: clone(expected) });
        const result = store[operation](...args);
        if (result.record) {
          assert.equal(result.claimHash, expected.claimHash);
          assert.deepEqual(Object.keys(result).sort(), ['checkpointKey', 'claimHash', 'record', 'status', 'version']);
        }
        return result;
      };
    }
    const worker = checkpointAdapter(root, { checkpoint: port });
    const initial = worker.snapshot();
    const claimBytes = fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8');
    assert.deepEqual(JSON.parse(claimBytes), checkpointClaim(readCheckpointRecord(root, key)));
    const accepted = worker.run(sealedResultRequest(worker));
    assert.equal(accepted.outcome, 'accepted');
    assert.equal(accepted.session.acceptedRevision, initial.acceptedRevision + 1);
    const current = worker.snapshot();
    const handed = handoffHostWorker(handoffInput(current.invocationIdentity, current), supervisorPorts(port));
    assert.equal(handed.outcome, 'handed-off');
    assert.equal(handed.receipt.claimHash, JSON.parse(claimBytes).claimHash);
    assert.equal(handed.receipt.recordHash, readCheckpointRecord(root, key).recordHash);
    const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(port));
    assert.equal(resumed.outcome, 'resumed');
    assert.deepEqual(acceptedAuthorityTuple(resumed.adapter.snapshot()), acceptedAuthorityTuple(current));
    assert.equal(fs.readFileSync(artifactPath(root, key, 'claim'), 'utf8'), claimBytes);
    assert.equal(resumed.adapter.end('task-settled').outcome, 'ended');
    assert.equal(resumed.adapter.end('hard-stop-recorded').outcome, 'ended');
    assert.deepEqual(expectations.map(entry => entry.operation), ['update', 'update', 'handoff', 'update', 'clear']);
    assert.equal(new Set(expectations.map(entry => entry.expected.claimHash)).size, 1);
    assert.equal(new Set(expectations.map(entry => entry.expected.recordHash)).size, expectations.length);
    assert.equal(canonicalJson(resumed.adapter.snapshot()).includes('claimHash'), false);
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
  });
});

for (const [label, boundary, fault, expectedRemovals, remaining] of [
  ['checkpoint removal failure', 'remove-checkpoint', 'fail', ['checkpoint'], ['checkpoint', 'claim']],
  ['claim removal failure', 'remove-claim', 'fail', ['checkpoint', 'claim'], ['claim']],
  ['checkpoint removal without effect', 'remove-checkpoint', 'no-removal', ['checkpoint'], ['checkpoint', 'claim']],
  ['claim removal without effect', 'remove-claim', 'no-removal', ['checkpoint', 'claim'], ['claim']],
  ['checkpoint absence failure', 'checkpoint-absence', 'fail', ['checkpoint'], ['claim']],
  ['pre-claim absence failure', 'pre-claim-absence', 'fail', ['checkpoint'], ['claim']],
  ['final checkpoint absence failure', 'final-checkpoint-absence', 'fail', ['checkpoint', 'claim'], []],
  ['final claim absence failure', 'final-claim-absence', 'fail', ['checkpoint', 'claim'], []],
  ['checkpoint revalidation failure', 'checkpoint-revalidation', 'fail', [], ['checkpoint', 'claim']],
  ['claim revalidation failure', 'claim-revalidation', 'fail', ['checkpoint'], ['claim']],
  ['checkpoint drift before removal', 'checkpoint-revalidation', 'replace-checkpoint', [], ['checkpoint', 'claim']],
  ['checkpoint disappearance before removal', 'checkpoint-revalidation', 'delete-checkpoint', [], ['claim']],
  ['claim drift after checkpoint removal', 'checkpoint-removed', 'replace-claim', ['checkpoint'], ['claim']],
  ['claim drift at revalidation', 'claim-revalidation', 'replace-claim', ['checkpoint'], ['claim']],
  ['claim disappearance at revalidation', 'claim-revalidation', 'delete-claim', ['checkpoint'], []],
  ['checkpoint reappearance after removal', 'checkpoint-removed', 'replace-checkpoint', ['checkpoint'], ['checkpoint', 'claim']],
  ['checkpoint reappearance during claim revalidation', 'claim-revalidation', 'replace-checkpoint', ['checkpoint'], ['checkpoint', 'claim']],
  ['checkpoint reappearance after claim removal', 'claim-removed', 'replace-checkpoint', ['checkpoint', 'claim'], ['checkpoint']],
  ['claim reappearance after removal', 'claim-removed', 'replace-claim', ['checkpoint', 'claim'], ['claim']],
]) {
  nodeTest(`056 owner finalization stops on ${label} without retry or replacement deletion`, (context) => {
    withTemporaryRoot((root) => {
      const key = derivedCheckpointKey();
      const paths = {
        checkpoint: artifactPath(root, key, 'checkpoint'),
        claim: artifactPath(root, key, 'claim'),
      };
      const store = createTemporaryCheckpointStore({ root });
      let clearCalls = 0;
      const worker = checkpointAdapter(root, {
        checkpoint: {
          ...store,
          clear(...args) {
            clearCalls += 1;
            return store.clear(...args);
          },
        },
      });
      const before = worker.snapshot();
      const originalBytes = {
        checkpoint: fs.readFileSync(paths.checkpoint, 'utf8'),
        claim: fs.readFileSync(paths.claim, 'utf8'),
      };
      const replacements = {};
      const removals = [];
      const completedRemovals = new Set();
      const reads = { checkpoint: 0, claim: 0 };
      let checkpointAbsences = 0;
      let injected = false;
      const original = { read: fs.readFileSync, stat: fs.lstatSync, remove: fs.rmSync };
      const inject = (at) => {
        if (injected || boundary !== at) return false;
        injected = true;
        if (fault === 'fail') {
          const error = new Error('056 injected storage failure');
          throw Object.assign(error, { code: 'EACCES', syscall: at });
        }
        if (fault === 'no-removal') return true;
        const kind = fault.endsWith('checkpoint') ? 'checkpoint' : 'claim';
        if (fault.startsWith('delete-')) {
          original.remove(paths[kind]);
          return false;
        }
        const body = JSON.parse(originalBytes[kind]);
        const hashField = kind === 'checkpoint' ? 'recordHash' : 'claimHash';
        delete body[hashField];
        if (kind === 'checkpoint') body.inspectionIdentity = sha256('056 replacement checkpoint');
        else body.createdAt = '2000-01-01T00:00:00.000Z';
        replacements[kind] = canonicalJson({ ...body, [hashField]: sha256(canonicalJson(body)) });
        fs.writeFileSync(paths[kind], replacements[kind], 'utf8');
        return false;
      };
      const mocks = [
        context.mock.method(fs, 'readFileSync', (target, options) => {
          for (const kind of ['checkpoint', 'claim']) {
            if (target === paths[kind] && ++reads[kind] === 2) inject(`${kind}-revalidation`);
          }
          return original.read(target, options);
        }),
        context.mock.method(fs, 'lstatSync', (target, options) => {
          if (target === paths.checkpoint && completedRemovals.has('checkpoint')) {
            if (completedRemovals.has('claim')) inject('final-checkpoint-absence');
            else inject(++checkpointAbsences === 1 ? 'checkpoint-absence' : 'pre-claim-absence');
          }
          if (target === paths.claim && completedRemovals.has('claim')) inject('final-claim-absence');
          return original.stat(target, options);
        }),
        context.mock.method(fs, 'rmSync', (target, options) => {
          const kind = target === paths.checkpoint ? 'checkpoint' : target === paths.claim ? 'claim' : 'foreign';
          removals.push(kind);
          assert.notEqual(kind, 'foreign', 'only the two fixture-derived paths may be removed');
          assert.equal(options?.force, undefined, 'a disappeared artifact is a failure, not forced success');
          if (inject(`remove-${kind}`)) {
            completedRemovals.add(kind);
            return;
          }
          original.remove(target, options);
          completedRemovals.add(kind);
          inject(`${kind}-removed`);
        }),
      ];
      try {
        const stopped = worker.end('hard-stop-recorded');
        assert.equal(injected, true, `the ${boundary} boundary was reached`);
        assert.equal(stopped.outcome, 'hard-stop');
        assert.equal(stopped.reason, 'checkpoint-cleanup-failed');
        assert.deepEqual(acceptedAuthorityTuple(stopped.session), acceptedAuthorityTuple(before));
        assert.equal(worker.end('hard-stop-recorded').outcome, 'hard-stop');
        assert.equal(worker.end('natural-end').outcome, 'hard-stop');
        assert.equal(worker.run(sealedResultRequest(worker)).outcome, 'hard-stop');
        assert.equal(clearCalls, 1);
        assert.deepEqual(removals, expectedRemovals);
      } finally {
        for (const mocked of mocks.reverse()) mocked.mock.restore();
      }
      for (const kind of ['checkpoint', 'claim']) {
        assert.equal(fs.existsSync(paths[kind]), remaining.includes(kind), kind);
        if (remaining.includes(kind)) {
          assert.equal(fs.readFileSync(paths[kind], 'utf8'), replacements[kind] ?? originalBytes[kind], kind);
        }
      }
      if (remaining.length > 0) {
        const collision = checkpointAdapter(root);
        assert.equal(collision.snapshot().status, 'hard-stop', 'remaining artifacts still block fresh admission');
        assert.equal(collision.snapshot().disposition,
          remaining.length === 2 ? 'checkpoint-ownership-unavailable' : 'checkpoint-stale-orphan');
      }
    });
  });
}

nodeTest('056 owner finalization refuses an already absent pair instead of treating cleanup as idempotent', (context) => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const worker = checkpointAdapter(root);
    fs.rmSync(artifactPath(root, key, 'checkpoint'));
    fs.rmSync(artifactPath(root, key, 'claim'));
    const remove = context.mock.method(fs, 'rmSync', () => assert.fail('absent pair must not be removed again'));
    try {
      assert.equal(worker.end('hard-stop-recorded').reason, 'checkpoint-cleanup-failed');
      assert.equal(worker.end('hard-stop-recorded').outcome, 'hard-stop');
      assert.equal(remove.mock.callCount(), 0);
    } finally {
      remove.mock.restore();
    }
  });
});

nodeTest('a failed clear reports a cleanup hard stop and keeps blocking replacement work', () => {
  withTemporaryRoot((root) => {
    const backing = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), {
      checkpoint: {
        ...backing,
        clear(binding, activeWorker, expected, reason) {
          return {
            version: 1,
            status: 'failed',
            checkpointKey: backing.load(binding).checkpointKey,
            reason: `clear-refused:${reason}`,
          };
        },
      },
    });
    const stopped = worker.end('natural-end');
    assert.equal(stopped.outcome, 'hard-stop');
    assert.equal(stopped.reason, 'checkpoint-cleanup-failed');
    assert.equal(worker.snapshot().status, 'hard-stop');
    assert.equal(worker.ownership().reason, 'checkpoint-cleanup-failed');
    assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
    const blocked = checkpointAdapter(root);
    assert.equal(blocked.snapshot().disposition, 'checkpoint-ownership-unavailable');
  });
});

nodeTest('the in-memory store drives the whole closed lifecycle and faults fail closed', () => {
  const memory = memoryCheckpointStore();
  const worker = createHostAdapter(checkpointInitial(), {
    checkpoint: memory.port,
    ...sealedPorts({ status: 'empty' }),
  });
  const active = worker.snapshot();
  assert.equal(memory.pair.checkpoint.hostRevision, 0);
  const refused = worker.run(sealedResultRequest(worker));
  assert.equal(refused.outcome, 'closed-refusal');
  assert.equal(memory.pair.checkpoint.hostRevision, refused.session.hostRevision);
  assert.equal(memory.pair.checkpoint.acceptedStateBytes, active.acceptedStateBytes);

  const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(memory.port));
  assert.equal(handed.outcome, 'handed-off');
  const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(memory.port));
  assert.equal(resumed.outcome, 'resumed');
  assert.equal(resumed.adapter.end('task-settled').outcome, 'ended');
  assert.equal(memory.pair.claim, null);
  assert.equal(memory.pair.checkpoint, null);
  assert.deepEqual([...new Set(memory.calls)].sort(), ['claim', 'clear', 'handoff', 'load', 'update']);

  for (const [operation, expected] of [
    ['claim', 'checkpoint-claim-failed'],
    ['load', 'checkpoint-load-failed'],
  ]) {
    const faulting = memoryCheckpointStore({ fault: (call) => call === operation });
    const stopped = createHostAdapter(checkpointInitial(), { checkpoint: faulting.port });
    assert.equal(stopped.snapshot().disposition, expected, operation);
    assert.equal(faulting.pair.checkpoint, null, operation);
  }

  let updateFaults = false;
  const flaky = memoryCheckpointStore({ fault: (call) => updateFaults && call === 'update' });
  const flakyWorker = createHostAdapter(checkpointInitial(), {
    checkpoint: flaky.port,
    ...sealedPorts({ status: 'empty' }),
  });
  const predecessor = flakyWorker.snapshot();
  updateFaults = true;
  const stopped = flakyWorker.run(sealedResultRequest(flakyWorker));
  assert.equal(stopped.outcome, 'hard-stop');
  assert.equal(stopped.reason, 'checkpoint-update-failed');
  assert.equal(flaky.pair.checkpoint.acceptedStateBytes, predecessor.acceptedStateBytes);
  assert.equal(flaky.pair.checkpoint.hostRevision, predecessor.hostRevision);
});

nodeTest('the temporary backend contains hashed paths and refuses unsafe or non-canonical artifacts', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const directory = artifactDirectory(root);
    const first = checkpointAdapter(root, sealedPorts({ status: 'empty' }));
    first.run(sealedResultRequest(first));
    assert.deepEqual(fs.readdirSync(directory).sort(), [`${key}.checkpoint`, `${key}.claim`]);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
      assert.equal(fs.statSync(artifactPath(root, key, 'checkpoint')).mode & 0o777, 0o600);
      assert.equal(fs.statSync(artifactPath(root, key, 'claim')).mode & 0o777, 0o600);
    }
    const canonical = fs.readFileSync(artifactPath(root, key, 'checkpoint'), 'utf8');

    for (const [label, bytes] of [
      ['trailing data', `${canonical} `],
      ['unknown field', canonicalJson({ ...JSON.parse(canonical), surprise: true })],
      ['truncated', canonical.slice(0, 40)],
      ['non-canonical order', JSON.stringify(JSON.parse(canonical), Object.keys(JSON.parse(canonical)).reverse())],
      ['oversize', `${'x'.repeat(70_000)}`],
    ]) {
      fs.writeFileSync(artifactPath(root, key, 'checkpoint'), bytes, 'utf8');
      const blocked = checkpointAdapter(root);
      assert.equal(blocked.snapshot().disposition, 'checkpoint-stale-orphan', label);
    }
    fs.writeFileSync(artifactPath(root, key, 'checkpoint'), Buffer.from([0x7b, 0xff, 0x7d]));
    assert.equal(checkpointAdapter(root).snapshot().disposition, 'checkpoint-stale-orphan');

    fs.rmSync(artifactPath(root, key, 'checkpoint'));
    fs.writeFileSync(path.join(root, 'outside.checkpoint'), canonical, 'utf8');
    fs.symlinkSync(path.join(root, 'outside.checkpoint'), artifactPath(root, key, 'checkpoint'));
    assert.equal(checkpointAdapter(root).snapshot().disposition, 'checkpoint-stale-orphan');
    fs.rmSync(artifactPath(root, key, 'checkpoint'));
    fs.rmSync(artifactPath(root, key, 'claim'));

    const reclaimed = checkpointAdapter(root, sealedPorts({ status: 'empty' }));
    reclaimed.run(sealedResultRequest(reclaimed));
    assert.equal(fs.readdirSync(directory).filter((name) => name.endsWith('.tmp')).length, 0);
    reclaimed.end('natural-end');
    assert.deepEqual(fs.readdirSync(directory), []);
  });
});

nodeTest('a killed adapter worker is replaced under the supervisor-retained invocation identity', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    // The supervisor creates and retains identity before any worker launches.
    const invocationIdentity = sha256(`supervisor-retained-invocation:${Date.now()}`);
    const workerToken = sha256('supervisor-retained-worker:1');
    const supervisorAuthorityIdentity = sha256('child-supervisor-authority');
    const payload = {
      root,
      state: pendingState(),
      target: clone(TARGET),
      inspectionIdentity: sha256('sealed-inspection'),
      workspace: { ...WORKSPACE },
      invocationIdentity,
      workerToken,
      supervisorAuthorityIdentity,
      noEffectAuthorityIdentity: sha256('child-no-effect-authority'),
      exitCode: 9,
    };
    const script = `
import { createHostAdapter, createTemporaryCheckpointStore } from ${JSON.stringify(MODULE_URL)};
import { canonicalJson, sha256 } from ${JSON.stringify(RECOVERY_URL)};
const supplied = JSON.parse(process.env.DUDE_HOST_ADAPTER_FIXTURE);
const adapter = createHostAdapter({
  state: supplied.state,
  target: supplied.target,
  inspectionIdentity: supplied.inspectionIdentity,
  workspace: supplied.workspace,
}, {
  supervisorSession: {
    identity: supplied.supervisorAuthorityIdentity,
    admit(request) {
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        invocationIdentity: supplied.invocationIdentity,
        workerToken: supplied.workerToken,
        workerGeneration: 1,
        supervisorAuthorityIdentity: supplied.supervisorAuthorityIdentity,
      };
      return { ...body, admissionIdentity: sha256(canonicalJson({ request, response: body })) };
    },
  },
  noEffectAuthority: {
    identity: supplied.noEffectAuthorityIdentity,
    capture() { throw new Error('unused'); },
    classify() { throw new Error('unused'); },
  },
  checkpoint: createTemporaryCheckpointStore({ root: supplied.root }),
});
process.stdout.write(JSON.stringify(adapter.snapshot().status));
process.exit(supplied.exitCode);
`;
    let observedExitCode = 0;
    let childStdout = '';
    try {
      childStdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, DUDE_HOST_ADAPTER_FIXTURE: JSON.stringify(payload) },
      });
    } catch (error) {
      observedExitCode = /** @type {{status:number, stdout:string}} */ (error).status;
      childStdout = /** @type {{status:number, stdout:string}} */ (error).stdout;
    }
    assert.equal(childStdout, '"active"');
    assert.equal(observedExitCode, 9);
    assert.equal(readCheckpointRecord(root, key).invocationIdentity, invocationIdentity);

    const store = createTemporaryCheckpointStore({ root });
    const handed = handoffHostWorker({
      workspaceIdentity: WORKSPACE.workspaceIdentity,
      target: clone(TARGET),
      ownerIdentity: WORKSPACE.ownerIdentity,
      invocationIdentity,
      priorWorker: { workerToken, workerGeneration: 1 },
      observedExit: { workerToken, workerGeneration: 1, exitCode: observedExitCode },
    }, supervisorPorts(store));
    assert.equal(handed.outcome, 'handed-off');
    assert.equal(handed.receipt.invocationIdentity, invocationIdentity);

    const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(store));
    assert.equal(resumed.outcome, 'resumed');
    assert.equal(resumed.adapter.snapshot().acceptedStateBytes, canonicalJson(pendingState()));
    assert.equal(resumed.adapter.snapshot().workerGeneration, 2);
    resumed.adapter.end('controlled-end');
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
  });
});

nodeTest('checkpoint dependencies and the workspace binding are required together', () => {
  withTemporaryRoot((root) => {
    assert.throws(
      () => createHostAdapter(checkpointInitial()),
      /workspace must accompany exactly one injected checkpoint store/,
    );
    assert.throws(
      () => createHostAdapter(sealedInitial(), { checkpoint: createTemporaryCheckpointStore({ root }) }),
      /workspace must accompany exactly one injected checkpoint store/,
    );
    assert.throws(
      () => createHostAdapter(checkpointInitial({ }), {
        checkpoint: { identity: sha256('partial-store'), claim() {}, load() {} },
      }),
      /checkpoint/,
    );
    assert.throws(
      () => handoffHostWorker(handoffInput(sha256('identity'), { workerToken: sha256('token'), workerGeneration: 1 }), {
        supervisorSession: sealedSupervisorSession(),
        noEffectAuthority: sealedNoEffectAuthority(),
      }),
      /checkpoint must be supplied for worker handoff/,
    );
    assert.throws(
      () => resumeHostAdapter({}, { noEffectAuthority: sealedNoEffectAuthority() }),
      /checkpoint/,
    );
    assert.equal(fs.existsSync(artifactDirectory(root)), false);
  });
});

const TASKS_PATH = `${TARGET.specPath.slice(0, -'spec.md'.length)}tasks.md`;
const IDEA_PATH = '.dude/ideas/018-autonomous-runstate-continuity.md';
const TASK_STATE_PATH = '.dude/state/task-state.json';

/** @param {string} root */
function writeSealedTaskState(root) {
  fs.mkdirSync(path.join(root, path.dirname(TASK_STATE_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, TASK_STATE_PATH), `${JSON.stringify({
    [TASKS_PATH]: { glyphs: { [TARGET.taskKey]: '~' }, updated_at: '2025-12-31T00:00:00.000Z' },
  }, null, 2)}\n`);
}

/** Bind the fresh lane surfaces the permit, the lane owner, and the receipt all have to agree on. @param {string} root */
function sealedLaneBinding(root) {
  const tasks = fs.readFileSync(path.join(root, TASKS_PATH));
  const owner = fs.readFileSync(path.join(root, IDEA_PATH));
  const taskState = fs.readFileSync(path.join(root, TASK_STATE_PATH));
  const ownerCapture = capturedBytesV1(owner);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: IDEA_PATH,
    specPath: TARGET.specPath,
    ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  }));
  const targetMapping = {
    version: 1,
    lane: 'lightweight',
    target: clone(TARGET),
    ownerBindingHash,
    tasksPath: TASKS_PATH,
    tasksDescriptor: contentDescriptor(tasks),
    taskStatePath: TASK_STATE_PATH,
    taskStateDescriptor: contentDescriptor(taskState),
    taskKey: TARGET.taskKey,
  };
  return {
    targetMapping,
    lanePrestate: {
      version: 1,
      lane: 'lightweight',
      target: clone(TARGET),
      glyph: '~',
      blockedBy: null,
      tasksDescriptor: clone(targetMapping.tasksDescriptor),
      taskStateDescriptor: clone(targetMapping.taskStateDescriptor),
      ownerDescriptor: contentDescriptor(owner),
    },
    application: {
      root: fs.realpathSync(root),
      owner: { ideaPath: IDEA_PATH, specPath: TARGET.specPath, ownerCapture, ownerBindingHash },
      mapping: clone(targetMapping),
      expected: {
        tasksPath: TASKS_PATH,
        tasks: capturedBytesV1(tasks),
        taskStatePath: TASK_STATE_PATH,
        taskState: capturedBytesV1(taskState),
      },
      mutation: clone(LANE_MUTATION),
    },
  };
}

/**
 * Drive one accepted Lightweight completion to the settled accepted RunState the lane routes need.
 * @param {string} root @param {(initial:Record<string, unknown>)=>ReturnType<typeof createHostAdapter>} make
 */
function sealedAcceptedCompletion(root, make) {
  const state = pendingState('autonomous');
  const fixture = sealedTrustedFixture(state, 'lane-close', 'accepted');
  const adapter = make(sealedInitial({ state }));
  const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
    attemptResult: {
      input: sealedRecordInput(root),
      result: fixture.semantic,
    },
  }));
  assert.equal(captured.outcome, 'effect-required');
  const events = captured.effect.projectionBatch.events;
  const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
    input: sealedRetentionInput(root, events, events, fixture.streams),
  }));
  assert.equal(settled.outcome, 'accepted');
  const laneInput = () => sealedTransportInput(sealedInspectionInput(root, {
    policyMode: 'autonomous',
    currentRun: [sealedCapture(TARGET, 'failed', events.map((event) => ({ event })))],
    ...fixture.streams,
  }));
  return { adapter, settled, laneInput };
}

nodeTest('the closed lane routes carry one Lightweight completion from permit through applied receipt to settlement', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial));
    const adapter = closure.adapter;
    const acceptedState = closure.settled.session.acceptedState;
    const binding = sealedLaneBinding(root);

    const audited = adapter.run(sealedRequest(adapter, 'audit-run', { audit: { input: closure.laneInput() } }));
    assert.equal(audited.outcome, 'accepted');
    assert.equal(audited.reason, 'run-audited');
    assert.equal(audited.product.kind, 'run-audit');

    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: closure.laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    assert.equal(issued.reason, 'lane-permit-issued');
    assert.equal(issued.product.kind, 'lane-permit');
    const permit = issued.product.permit;
    assert.equal(permit.subjectRunStateHash, sha256(canonicalJson(acceptedState)));
    assert.equal(permit.mutationIdentity, sha256(canonicalJson(LANE_MUTATION)));

    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }));
    assert.equal(applied.outcome, 'accepted', applied.reason);
    assert.equal(applied.reason, 'lane-mutation-applied');
    assert.equal(applied.product.kind, 'lane-receipt');
    const receipt = applied.product.receipt;
    assert.equal(receipt.permitHash, permit.permitHash);
    assert.equal(receipt.targetStateChanged, true);
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));

    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: { input: closure.laneInput(), permit: clone(permit), receipt: clone(receipt) },
    }));
    assert.equal(committed.outcome, 'accepted', committed.reason);
    assert.equal(committed.reason, 'lane-receipt-committed');
    assert.equal(committed.product.kind, 'lane-settlement');
    assert.equal(committed.product.terminalEvidenceIdentity, receipt.receiptHash);
    assert.equal(canonicalJson(committed.session.acceptedState), canonicalJson(acceptedState));
  });
});

/** @param {Record<string, unknown>} entry */
function sealedStreamCapture(entry) {
  return JSON.parse(Buffer.from(entry.bytes).toString('utf8')).records[0].substantive;
}

nodeTest('one autonomous close runs from actual specialist results through the production builder', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    // The request carries only what the dispatched Tester and Reviewer returned.
    const result = specialistResult('production-close', 'accepted');
    /** @type {Record<string, unknown>|null} */
    let injected = null;
    const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
      if (lowLevelRequest.mode === 'capture') {
        injected = {
          verification: lowLevelRequest.input.verification
            .map((/** @type {Record<string, unknown>} */ entry) => ({
              ...clone(entry),
              bytes: Buffer.from(entry.bytes.base64, 'base64'),
            })),
          review: lowLevelRequest.input.review.map((/** @type {Record<string, unknown>} */ entry) => ({
            ...clone(entry),
            bytes: Buffer.from(entry.bytes.base64, 'base64'),
          })),
        };
      }
      return { status: 'returned', value: runCommand(command, lowLevelRequest) };
    }));
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result },
    }));
    assert.equal(captured.outcome, 'effect-required', captured.reason);
    assert.ok(injected, 'host integration supplied its own trusted capture stream');

    // Every trusted identity the flow consumed is the builder's own output, and
    // review is bound to the exact verification capture the builder returned.
    const verification = normalizeVerificationEnvelopeV2(sealedStreamCapture(injected.verification[0]));
    const review = normalizeIndependentReviewEnvelopeV2(
      sealedStreamCapture(injected.review[0]),
      verification,
    );
    const pendingCompletion = captured.session.pendingEffect.provisionalState.pendingCompletion;
    assert.equal(review.verificationEnvelopeIdentity, verification.envelopeIdentity);
    assert.equal(pendingCompletion.verificationEnvelopeIdentity, verification.envelopeIdentity);
    assert.equal(pendingCompletion.reviewEnvelopeIdentity, review.envelopeIdentity);
    assert.equal(pendingCompletion.attemptIdentity, verification.attemptIdentity);
    assert.equal(pendingCompletion.resultIdentity, verification.resultIdentity);
    assert.equal(review.verdict, 'accepted');
    assert.deepEqual(review.findings, []);
    assert.equal(verification.checks.length, 1);
    assert.equal(verification.checks[0].outcome, 'passed');
    assert.equal(verification.inspectedEvidenceHash, state.pending[0].evidenceHash);
    assert.equal(review.attemptOrdinal, state.overallUsed);

    const events = captured.effect.projectionBatch.events;
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
      input: sealedRetentionInput(root, events, events, injected),
    }));
    assert.equal(settled.outcome, 'accepted', settled.reason);
    assert.equal(settled.reason, 'completed');
    const acceptedState = settled.session.acceptedState;
    assert.equal(acceptedState.completed.at(-1).resultHash, verification.resultIdentity);

    const binding = sealedLaneBinding(root);
    const laneInput = () => sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: [sealedCapture(TARGET, 'failed', events.map((/** @type {Record<string, unknown>} */ event) => ({ event })))],
      .../** @type {Record<string, unknown>} */ (injected),
    }));
    const audited = adapter.run(sealedRequest(adapter, 'audit-run', { audit: { input: laneInput() } }));
    assert.equal(audited.outcome, 'accepted', audited.reason);
    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(issued.product.permit) },
    }));
    assert.equal(applied.outcome, 'accepted', applied.reason);
    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: {
        input: laneInput(),
        permit: clone(issued.product.permit),
        receipt: clone(applied.product.receipt),
      },
    }));
    assert.equal(committed.outcome, 'accepted', committed.reason);
    assert.equal(committed.reason, 'lane-receipt-committed');
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
  });
});

nodeTest('an ordinary autonomous request cannot select, author, or override the trusted attestation', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'no-caller-authority', 'accepted');
    const semantic = /** @type {Record<string, unknown>} */ (fixture.semantic);
    const verification = /** @type {Record<string, unknown>} */ (semantic.verification);
    const review = /** @type {Record<string, unknown>} */ (semantic.review);
    /** @param {Record<string, unknown>[]} entries */
    const transportStream = (entries) => entries.map((entry) => ({
      target: clone(entry.target),
      state: entry.state,
      outcomeHash: entry.outcomeHash,
      bytes: { base64: Buffer.from(/** @type {Buffer} */ (entry.bytes)).toString('base64') },
    }));

    /** @type {[string, Record<string, unknown>, RegExp][]} */
    const refusals = [
      // No verification-capture choice: neither trusted stream is an admitted request field.
      ['selects a verification capture', {
        input: { ...sealedRecordInput(root), verification: transportStream(fixture.streams.verification) },
        result: semantic,
      }, /must not select the 'verification' trusted capture/],
      ['selects a review capture', {
        input: { ...sealedRecordInput(root), review: transportStream(fixture.streams.review) },
        result: semantic,
      }, /must not select the 'review' trusted capture/],
      ['selects a lint capture', {
        input: { ...sealedRecordInput(root), lint: transportStream(fixture.streams.verification) },
        result: semantic,
      }, /must not select the 'lint' trusted capture/],
      // No caller-precomputed trusted identity.
      ['authors an attempt identity', {
        input: sealedRecordInput(root),
        result: { ...semantic, attemptIdentity: fixture.identities.attemptIdentity },
      }, /contains unknown field 'attemptIdentity'/],
      ['authors a result identity', {
        input: sealedRecordInput(root),
        result: { ...semantic, resultIdentity: fixture.identities.resultIdentity },
      }, /contains unknown field 'resultIdentity'/],
      ['authors a verification envelope identity', {
        input: sealedRecordInput(root),
        result: { ...semantic, verificationEnvelopeIdentity: fixture.identities.verificationEnvelopeIdentity },
      }, /contains unknown field 'verificationEnvelopeIdentity'/],
      ['authors a review envelope identity', {
        input: sealedRecordInput(root),
        result: { ...semantic, reviewEnvelopeIdentity: fixture.identities.reviewEnvelopeIdentity },
      }, /contains unknown field 'reviewEnvelopeIdentity'/],
      ['authors finding identities', {
        input: sealedRecordInput(root),
        result: { ...semantic, findingIdentities: [] },
      }, /contains unknown field 'findingIdentities'/],
      // No caller-supplied dispatch, chronology, or source-revision context.
      ['authors Tester dispatch context', {
        input: sealedRecordInput(root),
        result: { ...semantic, verification: { ...verification, dispatch: { role: 'Tester', occurrence: 1 } } },
      }, /contains unknown field 'dispatch'/],
      ['authors a source revision', {
        input: sealedRecordInput(root),
        result: { ...semantic, verification: { ...verification, sourceRevision: 'git:forged' } },
      }, /contains unknown field 'sourceRevision'/],
      ['authors a review ordinal', {
        input: sealedRecordInput(root),
        result: { ...semantic, review: { ...review, reviewOrdinal: 1 } },
      }, /contains unknown field 'reviewOrdinal'/],
      // No separate semantic override beside the sole specialist result.
      ['overrides the verification outcome', {
        input: sealedRecordInput(root),
        result: { ...semantic, checks: { verification: 'passed', lint: 'none', review: 'none' } },
      }, /contains unknown field 'verification'/],
    ];

    for (const [label, attemptResult, message] of refusals) {
      let runtimeInvocations = 0;
      const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
        runtimeInvocations += 1;
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      }));
      const request = sealedRequest(adapter, 'record-attempt-result', { attemptResult });
      assert.throws(() => validateHostAdapterRequest(request, state), message, label);
      const refused = adapter.run(request);
      assert.equal(refused.outcome, 'closed-refusal', label);
      assert.equal(refused.incidentClass, 'malformed-request', label);
      assert.equal(refused.session.acceptedStateBytes, canonicalJson(state), label);
      assert.equal(refused.session.acceptedRevision, 0, label);
      // No trusted capture, completion, or effect was authorized.
      assert.equal(refused.session.pendingEffect, null, label);
      assert.equal(runtimeInvocations, 0, label);
    }
  });
});

nodeTest('an ordinary autonomous request cannot choose a low-level capture or finalize route', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    /** @param {ReturnType<typeof createHostAdapter>} adapter */
    const ordinaryRequest = (adapter) => sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: specialistResult('no-low-level-route') },
    });
    for (const reserved of ['route', 'mode', 'command', 'transition']) {
      const adapter = createHostAdapter(sealedInitial({ state }));
      const request = { ...ordinaryRequest(adapter), [reserved]: 'capture' };
      assert.throws(
        () => validateHostAdapterRequest(request, state),
        new RegExp(`must not select the low-level '${reserved}'`),
      );
      const refused = adapter.run(request);
      assert.equal(refused.outcome, 'closed-refusal', reserved);
      assert.equal(refused.incidentClass, 'malformed-request', reserved);
      assert.equal(refused.session.acceptedStateBytes, canonicalJson(state), reserved);
    }
    const adapter = createHostAdapter(sealedInitial({ state }));
    for (const lowLevel of ['complete', 'complete.capture', 'complete.finalize']) {
      assert.throws(
        () => validateHostAdapterRequest({ ...ordinaryRequest(adapter), operation: lowLevel }, state),
        /HostAdapterRequest.operation must be one of/,
        lowLevel,
      );
    }
  });
});

nodeTest('a sole specialist result the builder refuses offers only local no-effect correction before capture', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const base = specialistResult('builder-refusal', 'accepted');
    const definition = 'focused check:builder-refusal';
    /** @param {Record<string, unknown>} row */
    const finding = (checkDefinition, observation) => ({
      basis: {
        expectation: { kind: 'governing-rule', reference: 'governing rule:builder-refusal' },
        subjects: [TARGET.taskKey],
        failureClass: 'review-rejection',
        checkDefinition,
      },
      observation,
    });
    const passing = { definition, outcome: 'passed', evidence: 'check evidence:builder-refusal' };

    /** @type {[string, Record<string, unknown>][]} */
    const refusals = [
      ['byte-identical duplicate checks', { ...base, verification: { checks: [passing, { ...passing }] } }],
      ['conflicting duplicate checks', { ...base, verification: { checks: [passing, { ...passing, outcome: 'failed' }] } }],
      ['malformed check outcome', { ...base, verification: { checks: [{ ...passing, outcome: 'maybe' }] } }],
      ['incomplete check set', { ...base, verification: { checks: [] } }],
      ['accepted verdict carrying findings', {
        ...base,
        review: { verdict: 'accepted', findings: [finding(definition, { kind: 'observed-evidence', evidence: 'o' })] },
      }],
      ['rejected verdict without findings', { ...base, review: { verdict: 'rejected', findings: [] } }],
      ['finding bound to an absent check', {
        ...base,
        review: { verdict: 'rejected', findings: [finding('absent check', { kind: 'check-result' })] },
      }],
    ];

    for (const [label, result] of refusals) {
      let runtimeInvocations = 0;
      const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
        runtimeInvocations += 1;
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      }));
      const refused = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result },
      }));
      assert.equal(refused.outcome, 'closed-refusal', label);
      assert.equal(refused.reason, 'malformed-request', label);
      assert.equal(refused.next.kind, 'correction', label);
      // The refusal precedes the low-level route, so no capture, completion,
      // effect, permit, receipt, or close authority can exist.
      assert.equal(runtimeInvocations, 0, label);
      assert.equal(refused.session.pendingEffect, null, label);
      assert.equal(refused.session.acceptedStateBytes, canonicalJson(state), label);
      assert.equal(refused.session.acceptedRevision, 0, label);
    }
  });
});

nodeTest('a pending definition reconciliation refuses autonomous attestation with its own truthful reason', () => {
  withSealedWorkspace((root) => {
    const packageRoot = TARGET.specPath.slice(0, -'spec.md'.length);
    const canonicalKey = canonicalJson(canonicalTarget(TARGET));
    const state = {
      policy: { overall: 3, recovery: 1, recover: true, untilBlocked: false, mode: 'autonomous' },
      overallUsed: 1,
      recoveryUsed: [{ targetKey: canonicalKey, targetHash: sha256(canonicalKey), count: 1 }],
      pending: [{
        target: clone(TARGET),
        evidenceHash: sha256('authorization-evidence'),
        // The proposal-bound approach this action authorizes against.
        approachHash: sha256('definition-revision-proposal'),
        action: 'reconcile-derived-definition',
        materialInputs: {
          targets: [
            '.dude/ideas/018-autonomous-runstate-continuity.md',
            `${packageRoot}plan.md`,
            `${packageRoot}spec.md`,
            `${packageRoot}tasks.md`,
          ],
          operations: ['reconcile-derived-definition'],
          checks: ['lint', 'review', 'verification'],
        },
        mode: 'recovery',
      }],
      completed: [],
    };
    validateRunState(state);

    let runtimeInvocations = 0;
    const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
      runtimeInvocations += 1;
      return { status: 'returned', value: runCommand(command, lowLevelRequest) };
    }));
    const refused = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: {
        input: sealedRecordInput(root),
        result: specialistResult('definition-reconciliation', 'accepted'),
      },
    }));

    assert.equal(refused.outcome, 'hard-stop');
    // The reason names the actual condition, not a learning governance conflict.
    assert.equal(refused.reason, 'definition-reconciliation-attestation-unsupported');
    assert.equal(refused.session.disposition, 'definition-reconciliation-attestation-unsupported');
    assert.equal(runtimeInvocations, 0);
    assert.equal(refused.session.pendingEffect, null);
    assert.equal(refused.session.acceptedStateBytes, canonicalJson(state));
    assert.equal(refused.session.acceptedRevision, 0);
  });
});

/**
 * Build one valid pending autonomous state from the existing action/check
 * authority. Definition reconciliation remains proposal-bound and is used only
 * to prove that its refusal precedes capture.
 * @param {string} action @param {string[]} checks
 */
function pendingActionState(action, checks) {
  const state = pendingState('autonomous');
  const pending = state.pending[0];
  const packageRoot = TARGET.specPath.slice(0, -'spec.md'.length);
  const targets = action === 'reconcile-derived-definition'
      ? [
        '.dude/ideas/018-autonomous-runstate-continuity.md',
        `${packageRoot}plan.md`,
        `${packageRoot}spec.md`,
        `${packageRoot}tasks.md`,
      ].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      : clone(MATERIAL_INPUTS.targets);
  pending.action = action;
  pending.materialInputs = { targets, operations: [action], checks: [...checks] };
  pending.mode = action === 'execute-task' ? 'ordinary' : 'recovery';
  pending.approachHash = action === 'reconcile-derived-definition'
    ? sha256('lint-matrix-definition-proposal')
    : approachHash({ action, materialInputs: pending.materialInputs });
  if (pending.mode === 'recovery') {
    state.policy.recover = true;
    const key = canonicalJson(canonicalTarget(TARGET));
    state.recoveryUsed = [{ targetKey: key, targetHash: sha256(key), count: 1 }];
  }
  validateRunState(state);
  return state;
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} semantic @param {string} root */
function capturedSpecialistInput(state, semantic, root) {
  let input = null;
  let runtimeInvocations = 0;
  const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
    runtimeInvocations += 1;
    if (command === 'complete' && lowLevelRequest.mode === 'capture') {
      input = clone(lowLevelRequest.input);
    }
    return { status: 'returned', value: runCommand(command, lowLevelRequest) };
  }));
  const result = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
    attemptResult: { input: sealedRecordInput(root), result: semantic },
  }));
  return { input, result, runtimeInvocations };
}

nodeTest('Tester lint reuse follows the exact current six-action matrix', () => {
  const matrix = [
    ['execute-task', ['verification'], false],
    ['retry-task', ['verification'], false],
    ['address-test', ['lint', 'verification'], true],
    ['address-review', ['review', 'verification'], false],
    ['reconcile-derived-definition', ['lint', 'review', 'verification'], 'refused'],
    ['retain-learning', ['lint'], true],
  ];
  withSealedWorkspace((root) => {
    for (const [action, checks, lintExpected] of matrix) {
      const state = pendingActionState(
        /** @type {string} */ (action),
        /** @type {string[]} */ (checks),
      );
      const semantic = specialistResult(`lint-matrix:${action}`, 'accepted');
      semantic.operations = [action];
      const captured = capturedSpecialistInput(state, semantic, root);
      if (lintExpected === 'refused') {
        assert.equal(captured.result.outcome, 'hard-stop', action);
        assert.equal(captured.result.reason, 'definition-reconciliation-attestation-unsupported', action);
        assert.equal(captured.input, null, action);
        assert.equal(captured.runtimeInvocations, 0, action);
        continue;
      }
      assert.equal(captured.result.outcome, 'effect-required', `${action}:${captured.result.reason}`);
      assert.ok(captured.input, `${action}: capture input`);
      assert.equal(captured.input.verification.length, 1, action);
      assert.equal(captured.input.review.length, 1, action);
      assert.equal(captured.input.lint.length, lintExpected === true ? 1 : 0, action);
    }
  });
});

nodeTest('lint and verification reuse one conservative Tester capture with identical identity, body, and state', () => {
  const cases = [
    ['address-test', ['lint', 'verification']],
    ['retain-learning', ['lint']],
  ];
  withSealedWorkspace((root) => {
    for (const [action, requiredChecks] of cases) {
      for (const failed of [false, true]) {
        const label = `${action}:${failed ? 'one-failed' : 'all-passed'}`;
        const semantic = specialistResult(label, 'accepted');
        semantic.operations = [action];
        semantic.outcome = failed ? 'failed' : 'succeeded';
        semantic.verification.checks = [
          {
            definition: `focused check:${label}:a`,
            outcome: 'passed',
            evidence: `check evidence:${label}:a`,
          },
          {
            definition: `focused check:${label}:b`,
            outcome: failed ? 'failed' : 'passed',
            evidence: `check evidence:${label}:b`,
          },
        ];
        const captured = capturedSpecialistInput(
          pendingActionState(action, requiredChecks),
          semantic,
          root,
        );
        assert.equal(captured.result.outcome, 'effect-required', `${label}:${captured.result.reason}`);
        const verificationRow = captured.input.verification[0];
        const lintRow = captured.input.lint[0];
        assert.deepEqual(lintRow, verificationRow, `${label}: exact stream row`);
        assert.equal(verificationRow.state, failed ? 'failed' : 'passed', label);
        assert.equal(lintRow.state, failed ? 'failed' : 'passed', label);

        const verificationBody = JSON.parse(
          Buffer.from(verificationRow.bytes.base64, 'base64').toString('utf8'),
        );
        const lintBody = JSON.parse(Buffer.from(lintRow.bytes.base64, 'base64').toString('utf8'));
        assert.deepEqual(lintBody, verificationBody, `${label}: exact stream body`);
        assert.equal(verificationBody.records.length, 1, `${label}: sole Tester capture`);
        assert.equal(lintBody.records.length, 1, `${label}: reused Tester capture`);
        const verificationCapture = verificationBody.records[0].substantive;
        const lintCapture = lintBody.records[0].substantive;
        assert.equal(
          sha256(canonicalJson(lintCapture)),
          sha256(canonicalJson(verificationCapture)),
          `${label}: exact capture identity`,
        );
        assert.equal(
          normalizeVerificationEnvelopeV2(lintCapture).envelopeIdentity,
          normalizeVerificationEnvelopeV2(verificationCapture).envelopeIdentity,
          `${label}: exact normalized verification identity`,
        );
      }
    }
  });
});

nodeTest('a failed Tester check reaches the production path as a failed verification source state', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    const base = specialistResult('failed-verification', 'accepted');
    const result = {
      ...base,
      outcome: 'failed',
      verification: {
        checks: [{
          definition: 'focused check:failed-verification',
          outcome: 'failed',
          evidence: 'check evidence:failed-verification',
        }],
      },
    };
    /** @type {Record<string, unknown>|null} */
    let injected = null;
    const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts((command, lowLevelRequest) => {
      if (lowLevelRequest.mode === 'capture') injected = clone(lowLevelRequest.input);
      return { status: 'returned', value: runCommand(command, lowLevelRequest) };
    }));
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result },
    }));

    assert.equal(captured.outcome, 'effect-required', captured.reason);
    assert.ok(injected, 'host integration supplied its own trusted capture stream');
    // The failed disposition of the sole Tester check drives the stream state.
    assert.equal(/** @type {Record<string, unknown>} */ (injected).verification[0].state, 'failed');
    assert.equal(/** @type {Record<string, unknown>} */ (injected).review[0].state, 'accepted');
    const approach = captured.effect.projectionBatch.events[0];
    assert.equal(approach.occurrence.disposition, 'verification-failed');

    const events = captured.effect.projectionBatch.events;
    const streams = {
      verification: /** @type {Record<string, unknown>} */ (injected).verification
        .map((/** @type {Record<string, unknown>} */ entry) => ({
          ...clone(entry),
          bytes: Buffer.from(entry.bytes.base64, 'base64'),
        })),
      review: /** @type {Record<string, unknown>} */ (injected).review
        .map((/** @type {Record<string, unknown>} */ entry) => ({
          ...clone(entry),
          bytes: Buffer.from(entry.bytes.base64, 'base64'),
        })),
    };
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
      input: sealedRetentionInput(root, events, events, streams),
    }));
    assert.equal(settled.outcome, 'accepted', settled.reason);
    assert.equal(settled.reason, 'verification-failed');
  });
});

/**
 * The exact apply-lane-effect expectation the adapter must bind before the lane owner can run.
 * @param {Record<string, unknown>} session @param {Record<string, unknown>} permit
 */
function laneApplicationExpectation(session, permit) {
  return {
    semanticOperation: 'apply-lane-effect',
    expectedEffectIdentity: sha256(canonicalJson({
      version: 1,
      kind: 'lane-application',
      semanticOperation: 'apply-lane-effect',
      target: clone(session.target),
      subjectRunStateHash: session.acceptedStateHash,
      permitHash: permit.permitHash,
      mutationIdentity: permit.mutationIdentity,
    })),
    expectedReceiptIdentity: sha256(canonicalJson({
      version: 1,
      kind: 'lane-application-receipt',
      lane: 'lightweight',
      target: clone(session.target),
      permitHash: permit.permitHash,
      mutationIdentity: permit.mutationIdentity,
      targetMappingHash: permit.targetMappingHash,
      lanePrestateHash: permit.lanePrestateHash,
    })),
    provisionalStateHash: session.acceptedStateHash,
  };
}

nodeTest('every autonomous operation records its own in-flight identity under an exclusive claim', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    /** @type {Record<string, unknown>[]} */
    const observedDuringApply = [];
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(
      { ...initial, workspace: { ...WORKSPACE } },
      {
        checkpoint: store,
        laneOwner: {
          identity: sha256('observing-lane-owner'),
          apply(request) {
            // Read the durable record while the authoritative mutator is mid-flight.
            observedDuringApply.push(readCheckpointRecord(root, key).inFlight);
            return applyLightweightWorkRequest(request);
          },
        },
      },
    ));
    const adapter = closure.adapter;
    const binding = sealedLaneBinding(root);

    const audited = adapter.run(sealedRequest(adapter, 'audit-run', { audit: { input: closure.laneInput() } }));
    assert.equal(audited.outcome, 'accepted', audited.reason);
    assert.equal(audited.reason, 'run-audited');

    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: closure.laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    assert.equal(issued.reason, 'lane-permit-issued');
    const permit = issued.product.permit;
    const beforeApply = adapter.snapshot();

    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }));
    assert.equal(applied.outcome, 'accepted', applied.reason);
    assert.equal(applied.reason, 'lane-mutation-applied');

    // The only operation that drives an authoritative external mutator binds a real expectation
    // before the mutator is reachable, so an interrupted apply is detectable rather than silent.
    assert.deepEqual(observedDuringApply, [laneApplicationExpectation(beforeApply, permit)]);
    assert.equal(readCheckpointRecord(root, key).inFlight, null);

    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: { input: closure.laneInput(), permit: clone(permit), receipt: clone(applied.product.receipt) },
    }));
    assert.equal(committed.outcome, 'accepted', committed.reason);
    assert.equal(committed.reason, 'lane-receipt-committed');
    adapter.end('task-settled');
    assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
  });
});

nodeTest('each autonomous operation persists its own semantic identity when it stops mid-flight', () => {
  const key = derivedCheckpointKey();
  const stops = [
    ['prepare-authoritative-projection', { projection: { input: {} } }, 'pending-effect-missing'],
    ['apply-lane-effect', {
      laneApplication: sealedLaneApplication(laneMutationPermit(pendingState('autonomous'))),
    }, 'lane-permit-not-authorized'],
    ['commit-lane-receipt', { laneReceipt: { input: {}, permit: {}, receipt: {} } }, 'lane-permit-not-authorized'],
    ['authorize-lane-effect', {
      laneEffect: { input: {}, mutation: clone(LANE_MUTATION), lanePrestate: {}, targetMapping: {} },
    }, 'runtime-output-empty'],
    ['audit-run', { audit: { input: {} } }, 'runtime-output-empty'],
  ];
  for (const [operation, payload, reason] of stops) {
    withTemporaryRoot((root) => {
      const adapter = checkpointAdapter(root, {
        ...sealedPorts({ status: 'empty' }),
        noEffectAuthority: refusingNoEffectAuthority('indeterminate'),
      }, { state: pendingState('autonomous') });
      const stopped = adapter.run(sealedRequest(
        adapter,
        /** @type {string} */ (operation),
        /** @type {Record<string, unknown>} */ (payload),
      ));
      assert.equal(stopped.outcome, 'hard-stop', /** @type {string} */ (operation));
      assert.equal(stopped.reason, reason, /** @type {string} */ (operation));
      // The durable record names the exact semantic operation that was in flight.
      assert.equal(
        readCheckpointRecord(root, key).inFlight.semanticOperation,
        operation,
        /** @type {string} */ (operation),
      );
    });
  }
});

nodeTest('an interrupted lane apply resumes only on the exact permit-bound proof and poststate', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(
      { ...initial, workspace: { ...WORKSPACE } },
      {
        checkpoint: store,
        laneOwner: {
          identity: sha256('unverifiable-lane-owner'),
          apply(request) {
            // The authoritative mutation lands, then the receipt that would prove it is lost.
            const outcome = applyLightweightWorkRequest(request);
            const { receiptHash: _lost, ...body } = outcome.receipt;
            const forged = { ...body, permitHash: sha256('lost-lane-receipt') };
            return { ...outcome, receipt: { ...forged, receiptHash: sha256(canonicalJson(forged)) } };
          },
        },
      },
    ));
    const adapter = closure.adapter;
    const binding = sealedLaneBinding(root);
    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: closure.laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    const permit = issued.product.permit;
    const beforeApply = adapter.snapshot();
    const expectation = laneApplicationExpectation(beforeApply, permit);

    const unverifiable = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }));
    assert.equal(unverifiable.outcome, 'hard-stop');
    assert.equal(unverifiable.reason, 'lane-receipt-binding-mismatch');
    // The lane mutation did land, and the durable record still carries the expectation.
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
    assert.deepEqual(readCheckpointRecord(root, key).inFlight, expectation);

    const handed = handoffHostWorker(
      handoffInput(beforeApply.invocationIdentity, beforeApply),
      supervisorPorts(store),
    );
    assert.equal(handed.outcome, 'handed-off');
    /** @param {Record<string, unknown>} [overrides] */
    const resumeApply = (overrides) => resumeHostAdapter(
      resumeInput(handed.receipt, overrides),
      resumePorts(store, sealedPorts((command, lowLevelRequest) => ({
        status: 'returned',
        value: runCommand(command, lowLevelRequest),
      }))),
    );
    /** @param {Record<string, unknown>} [overrides] */
    const establishedApply = (overrides = {}) => ({
      effect: {
        status: 'established',
        effectIdentity: expectation.expectedEffectIdentity,
        receiptIdentity: expectation.expectedReceiptIdentity,
        provisionalState: clone(beforeApply.acceptedState),
        ...overrides,
      },
    });

    // No proof at all is an irreducible hard stop: the predecessor is never returned.
    const unproven = resumeApply();
    assert.equal(unproven.outcome, 'hard-stop');
    assert.equal(unproven.reason, 'effect-unverified');
    assert.equal(unproven.adapter, null);

    // The mutation already landed, so an unchanged-prestate attestation is a false claim; and
    // resume forced these identities to equal the checkpoint's before the attestation was read,
    // so it could not have proven anything even if the apply had never reached the lane owner.
    const attested = resumeApply({
      effect: {
        status: 'unchanged-prestate',
        taskPrestateIdentity: WORKSPACE.taskPrestateIdentity,
        lanePrestateIdentity: WORKSPACE.lanePrestateIdentity,
      },
    });
    assert.equal(attested.outcome, 'hard-stop');
    assert.equal(attested.reason, 'effect-unverified');
    assert.equal(attested.adapter, null);
    assert.deepEqual(readCheckpointRecord(root, key).inFlight, expectation);

    for (const [label, overrides, reason] of [
      ['foreign effect', { effectIdentity: sha256('other-lane-effect') }, 'unknown-effect'],
      ['permit hash as its own effect', { effectIdentity: permit.permitHash }, 'unknown-effect'],
      ['foreign receipt', { receiptIdentity: sha256('other-lane-receipt') }, 'unknown-effect'],
      ['effect replayed as its own receipt', { receiptIdentity: expectation.expectedEffectIdentity }, 'unknown-effect'],
      ['drifted poststate', { provisionalState: emptyState('autonomous') }, 'effect-poststate-mismatch'],
    ]) {
      const stopped = resumeApply(establishedApply(/** @type {Record<string, unknown>} */ (overrides)));
      assert.equal(stopped.outcome, 'hard-stop', /** @type {string} */ (label));
      assert.equal(stopped.reason, reason, /** @type {string} */ (label));
      assert.deepEqual(readCheckpointRecord(root, key).inFlight, expectation, /** @type {string} */ (label));
    }

    const resumed = resumeApply(establishedApply());
    assert.equal(resumed.outcome, 'resumed');
    assert.equal(resumed.reason, 'checkpoint-resumed');
    const snapshot = resumed.adapter.snapshot();
    assert.equal(snapshot.acceptedStateBytes, beforeApply.acceptedStateBytes);
    assert.equal(snapshot.acceptedRevision, beforeApply.acceptedRevision);
    assert.equal(readCheckpointRecord(root, key).inFlight, null);

    // The replacement worker names the interrupted autonomous operation exactly once.
    const audited = resumed.adapter.run(sealedRequest(resumed.adapter, 'audit-run', {
      audit: { input: closure.laneInput() },
    }));
    assert.equal(audited.outcome, 'accepted', audited.reason);
    assert.deepEqual(audited.recoveryNotice, {
      incidentClassification: 'host-process-recovered',
      statePreserved: true,
      resumedAction: 'apply-lane-effect',
    });
    resumed.adapter.end('controlled-end');
  });
});

nodeTest('a refused lane apply carries its one spent correction across worker handoff', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const key = derivedCheckpointKey();
    const store = createTemporaryCheckpointStore({ root });
    let applies = 0;
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(
      { ...initial, workspace: { ...WORKSPACE } },
      {
        checkpoint: store,
        laneOwner: {
          identity: sha256('refusing-then-unverifiable-lane-owner'),
          apply(request) {
            applies += 1;
            // A refusal leaves every authoritative surface byte-for-byte unchanged, so the one
            // permitted correction is minted against accepted bytes that never moved.
            if (applies === 1) {
              return { version: 1, ok: false, phase: 'refused', reason: 'lane-prestate-mismatch' };
            }
            // The correction re-attempt lands the mutation and loses the proof, stranding the
            // bound expectation in the durable record exactly as a killed worker would.
            const outcome = applyLightweightWorkRequest(request);
            const { receiptHash: _lost, ...body } = outcome.receipt;
            const forged = { ...body, permitHash: sha256('lost-lane-receipt') };
            return { ...outcome, receipt: { ...forged, receiptHash: sha256(canonicalJson(forged)) } };
          },
        },
      },
    ));
    const adapter = closure.adapter;
    const binding = sealedLaneBinding(root);
    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: closure.laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    const permit = issued.product.permit;

    const refused = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }));
    assert.equal(refused.outcome, 'closed-refusal', refused.reason);
    assert.equal(refused.incidentClass, 'evidence-drift');
    assert.equal(refused.next.kind, 'correction');
    const minted = adapter.snapshot().correction;
    assert.equal(minted.identity, refused.next.correctionIdentity);
    assert.equal(minted.consumed, false);
    assert.equal(minted.acceptedStateHash, adapter.snapshot().acceptedStateHash);

    const beforeApply = adapter.snapshot();
    const expectation = laneApplicationExpectation(beforeApply, permit);
    const stranded = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }, { correctionIdentity: minted.identity }));
    assert.equal(stranded.outcome, 'hard-stop');
    assert.equal(stranded.reason, 'lane-receipt-binding-mismatch');
    const held = readCheckpointRecord(root, key);
    assert.deepEqual(held.inFlight, expectation);
    assert.equal(held.correction.consumed, true);
    assert.equal(held.acceptedRevision, beforeApply.acceptedRevision);

    const handed = handoffHostWorker(
      handoffInput(beforeApply.invocationIdentity, beforeApply),
      supervisorPorts(store),
    );
    assert.equal(handed.outcome, 'handed-off');
    const resumed = resumeHostAdapter(resumeInput(handed.receipt, {
      effect: {
        status: 'established',
        effectIdentity: expectation.expectedEffectIdentity,
        receiptIdentity: expectation.expectedReceiptIdentity,
        provisionalState: clone(beforeApply.acceptedState),
      },
    }), resumePorts(store, sealedPorts((command, lowLevelRequest) => ({
      status: 'returned',
      value: runCommand(command, lowLevelRequest),
    }))));
    assert.equal(resumed.outcome, 'resumed', resumed.reason);

    // The apply route never advances accepted authority, so the replacement worker inherits the
    // same spent correction. A clean slate here would let the one permitted correction be taken
    // a second time against identical accepted bytes.
    const carried = resumed.adapter.snapshot().correction;
    assert.notEqual(carried, null, 'the spent correction must survive the handoff');
    assert.equal(carried.identity, held.correction.identity);
    assert.equal(carried.consumed, true);
    assert.equal(carried.acceptedStateHash, beforeApply.acceptedStateHash);
    assert.equal(resumed.adapter.snapshot().acceptedRevision, beforeApply.acceptedRevision);

    const replayed = resumed.adapter.run(sealedRequest(resumed.adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }, { correctionIdentity: carried.identity }));
    assert.equal(replayed.outcome, 'reinspect-required');
    assert.equal(replayed.reason, 'correction-consumed');
    resumed.adapter.end('controlled-end');
  });
});

nodeTest('a lane permit already in the ledger is refused as a replay instead of reissued', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial));
    const adapter = closure.adapter;
    const binding = sealedLaneBinding(root);
    const laneEffect = () => ({
      input: closure.laneInput(),
      mutation: clone(LANE_MUTATION),
      lanePrestate: binding.lanePrestate,
      targetMapping: binding.targetMapping,
    });
    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', { laneEffect: laneEffect() }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    assert.equal(issued.reason, 'lane-permit-issued');

    // The permit body carries no nonce, so an identical authorization derives the identical
    // permit hash and is refused at issue time rather than handing out a second live permit.
    const replayed = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', { laneEffect: laneEffect() }));
    assert.equal(replayed.outcome, 'hard-stop');
    assert.equal(replayed.reason, 'lane-permit-replayed');
  });
});

/** One current-run capture that blocks the Inspection the lane permit route reacquires. @param {Record<string, unknown>} input */
function blockedLaneInput(input) {
  const body = { target: clone(TARGET), state: 'approval-required', records: [] };
  return {
    ...input,
    currentRun: [...(/** @type {Record<string, unknown>[]} */ (input.currentRun)), {
      ...sealedCapture(TARGET, 'approval-required', []),
      bytes: { base64: Buffer.from(canonicalJson(body)).toString('base64') },
    }],
  };
}

nodeTest('bridge authorization refuses drifted evidence and unpermitted mutations without touching the lane', () => {
  /** @type {[string, string, string, (binding:ReturnType<typeof sealedLaneBinding>, input:Record<string, unknown>)=>Record<string, unknown>][]} */
  const cases = [
    ['a mutation that names another task', 'target-mismatch', 'evidence-drift',
      () => ({ mutation: { ...clone(LANE_MUTATION), target: clone(SECOND_TARGET) } })],
    ['a prestate glyph the lane no longer carries', 'lane-prestate-mismatch', 'evidence-drift',
      (binding) => ({ lanePrestate: { ...clone(binding.lanePrestate), glyph: ' ' } })],
    ['a mapping that names an absent tasks file', 'target-mapping-missing', 'evidence-drift',
      (binding) => ({
        targetMapping: {
          ...clone(binding.targetMapping),
          tasksPath: `${TARGET.specPath.slice(0, -'spec.md'.length)}absent.md`,
        },
      })],
    ['a prestate descriptor that no longer binds the tasks bytes', 'target-mapping-missing', 'evidence-drift',
      (binding) => ({
        lanePrestate: {
          ...clone(binding.lanePrestate),
          tasksDescriptor: { ...clone(binding.lanePrestate.tasksDescriptor), sha256: sha256('drifted-tasks') },
        },
      })],
    ['an Inspection that reacquires a blocker', 'inspection-stale', 'evidence-drift',
      (binding, input) => ({ input: blockedLaneInput(input) })],
    ['a mutation reason no lane permit authorizes', 'permit-transition-mismatch', 'stale-permit',
      () => ({ mutation: { ...clone(LANE_MUTATION), reason: 'not-a-lane-reason' } })],
  ];
  for (const [label, reason, incidentClass, override] of cases) {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      /** @type {unknown[]} */
      const applications = [];
      const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial, {
        laneOwner: {
          identity: sha256(`drift-lane-owner:${label}`),
          apply(request) {
            applications.push(clone(request));
            return applyLightweightWorkRequest(request);
          },
        },
      }));
      const binding = sealedLaneBinding(root);
      const input = closure.laneInput();
      const before = closure.adapter.snapshot().acceptedStateBytes;
      const refused = closure.adapter.run(sealedRequest(closure.adapter, 'authorize-lane-effect', {
        laneEffect: {
          input,
          mutation: clone(LANE_MUTATION),
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
          ...override(binding, input),
        },
      }));
      assert.equal(refused.outcome, 'closed-refusal', label);
      assert.equal(refused.reason, reason, label);
      assert.equal(refused.incidentClass, incidentClass, label);
      assert.equal(Object.hasOwn(refused, 'product'), false, label);
      // A refused authorization hands out no permit, charges no accepted authority,
      // and leaves the authoritative lane byte-for-byte where it was.
      assert.equal(refused.session.acceptedStateBytes, before, label);
      assert.deepEqual(applications, [], label);
      assert.match(
        fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'),
        new RegExp(`- \\[~\\] ${TARGET.taskKey}`),
        label,
      );
    });
  }
});

nodeTest('every lane permit trails a retained no-effect probe, so the probe ceiling bounds the ledger', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const backing = sealedNoEffectAuthority({ identity: sha256('permit-probe-coupling-authority') });
    let captures = 0;
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial, {
      noEffectAuthority: {
        identity: backing.identity,
        capture(request) {
          captures += 1;
          return backing.capture(request);
        },
        classify(request) {
          return backing.classify(request);
        },
      },
    }));
    const binding = sealedLaneBinding(root);
    const laneEffect = () => ({
      input: closure.laneInput(),
      mutation: clone(LANE_MUTATION),
      lanePrestate: binding.lanePrestate,
      targetMapping: binding.targetMapping,
    });

    // The permit ledger carries no cap of its own: issuance always runs the guarded
    // runtime first, so a permit can only enter the ledger behind a retained probe.
    const settled = captures;
    const issued = closure.adapter.run(sealedRequest(closure.adapter, 'authorize-lane-effect', {
      laneEffect: laneEffect(),
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    assert.equal(issued.product.kind, 'lane-permit');
    assert.equal(captures, settled + 1);

    // A refused reissue still spends a probe, so retained probes only ever outrun permits.
    const replayed = closure.adapter.run(sealedRequest(closure.adapter, 'authorize-lane-effect', {
      laneEffect: laneEffect(),
    }));
    assert.equal(replayed.outcome, 'hard-stop');
    assert.equal(replayed.reason, 'lane-permit-replayed');
    assert.equal(captures, settled + 2);
  });
});

nodeTest('a canonical checkpoint tamper that keeps its stale record hash loads as corrupt', () => {
  withTemporaryRoot((root) => {
    const key = derivedCheckpointKey();
    const holder = checkpointAdapter(root);
    assert.equal(holder.snapshot().status, 'active');
    const stored = readCheckpointRecord(root, key);

    // Every other binding still holds: only the record hash covers this field.
    const tampered = { ...stored, inspectionIdentity: sha256('foreign-inspection') };
    assert.notEqual(tampered.inspectionIdentity, stored.inspectionIdentity);
    assert.equal(tampered.recordHash, stored.recordHash);
    fs.writeFileSync(artifactPath(root, key, 'checkpoint'), canonicalJson(tampered), 'utf8');

    const blocked = checkpointAdapter(root);
    assert.equal(blocked.snapshot().status, 'hard-stop');
    assert.equal(blocked.snapshot().disposition, 'checkpoint-stale-orphan');
    assert.equal(blocked.ownership().reason, 'checkpoint-stale-orphan');

    // Restoring the exact record hash restores an admissible, still-owned pair.
    fs.writeFileSync(artifactPath(root, key, 'checkpoint'), canonicalJson(stored), 'utf8');
    assert.equal(checkpointAdapter(root).snapshot().disposition, 'checkpoint-ownership-unavailable');
  });
});

nodeTest('a symlinked artifact root fails closed instead of escaping containment', { skip: process.platform === 'win32' }, () => {
  withTemporaryRoot((root) => {
    const escape = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dude-host-adapter-escape-'));
    try {
      fs.symlinkSync(escape, artifactDirectory(root));
      const blocked = checkpointAdapter(root);
      assert.equal(blocked.snapshot().status, 'hard-stop');
      assert.equal(blocked.snapshot().disposition, 'checkpoint-stale-orphan');
      // Nothing was written through the link, so containment never moved.
      assert.deepEqual(fs.readdirSync(escape), []);
      assert.equal(fs.lstatSync(artifactDirectory(root)).isSymbolicLink(), true);
    } finally {
      fs.rmSync(escape, { recursive: true, force: true });
    }
  });
});

nodeTest('an exhausted no-effect probe ledger stops as a bounded ledger, not as malformed output', () => {
  const authority = sealedNoEffectAuthority({ identity: sha256('exhaustible-no-effect-authority') });
  const adapter = createHostAdapter(sealedInitial(), {
    ...sealedPorts({ status: 'empty' }),
    noEffectAuthority: authority,
  });
  /** @param {Record<string, unknown>} session */
  const inspectRequest = (session) => ({
    version: 1,
    operation: 'fresh-inspection',
    expectedSessionIdentity: session.sessionIdentity,
    expectedAcceptedRevision: session.acceptedRevision,
    expectedHostRevision: session.hostRevision,
    input: {},
  });
  // Every capture is retained, so the bounded ledger fills at its own declared ceiling.
  let session = adapter.snapshot();
  for (let index = 0; index < 4096; index += 1) {
    const refused = adapter.run(inspectRequest(session));
    assert.equal(refused.outcome, 'closed-refusal', `probe ${index}`);
    assert.equal(refused.reason, 'runtime-output-empty', `probe ${index}`);
    session = refused.session;
  }
  const exhausted = adapter.run(inspectRequest(session));
  assert.equal(exhausted.outcome, 'hard-stop');
  assert.equal(exhausted.reason, 'no-effect-probe-ledger-exhausted');
  assert.equal(exhausted.session.disposition, 'no-effect-probe-ledger-exhausted');
});

const NOTICE_TOKENS = Object.freeze([
  'recoveryNotice',
  'incidentClassification',
  'statePreserved',
  'resumedAction',
  'host-process-recovered',
]);

/** Prove the one-shot notice left no ledger, event, report, or audit record anywhere. @param {string} root */
function assertNoNoticeRecord(root) {
  /** @param {string} directory */
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const body = fs.readFileSync(full, 'utf8');
      for (const token of NOTICE_TOKENS) {
        assert.equal(body.includes(token), false, `${path.relative(root, full)}:${token}`);
      }
    }
  };
  walk(root);
}

nodeTest('a first successful outcome that is an end drops the pending notice instead of rendering it', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const inspectionIdentity = sha256(canonicalJson(inspect(input)));
    const mismatchResult = guardedResult({ operations: ['wrong-action'] });
    const pendingNotice = {
      incidentClassification: 'action-mismatch',
      statePreserved: true,
      resumedAction: 'record-attempt-result',
    };

    for (const reason of ['natural-end', 'controlled-end', 'task-settled', 'cancelled']) {
      const adapter = createHostAdapter(sealedInitial({ inspectionIdentity }));
      const mismatch = adapter.run(sealedResultRequest(adapter, mismatchResult));
      assert.equal(mismatch.outcome, 'closed-refusal', reason);
      assert.equal(mismatch.incidentClass, 'action-mismatch', reason);

      const correction = sealedResultRequest(adapter, mismatchResult);
      correction.correctionIdentity = mismatch.next.correctionIdentity;
      const carried = adapter.run(correction);
      assert.equal(carried.outcome, 'closed-refusal', reason);
      assert.equal(Object.hasOwn(carried, 'recoveryNotice'), false, reason);
      // Without a genuinely pending notice at this instant the end assertions below
      // would pass vacuously.
      assert.deepEqual(adapter.snapshot().recoveryNotice, pendingNotice, reason);

      const ended = adapter.end(reason);
      assert.equal(ended.outcome, 'ended', reason);
      assert.equal(ended.reason, reason, reason);
      assert.equal(ended.session.status, 'ended', reason);
      // SC-011 renders the notice only on a successful corrected or resumed outcome.
      // An end is not that outcome: it omits and clears the notice permanently.
      assert.equal(Object.hasOwn(ended, 'recoveryNotice'), false, reason);
      assert.equal(ended.session.recoveryNotice, null, reason);
      assert.deepEqual(Object.keys(ended).sort(), ['outcome', 'reason', 'session', 'version'], reason);
      assert.equal(adapter.snapshot().recoveryNotice, null, reason);

      const repeated = adapter.end('natural-end');
      assert.equal(repeated.outcome, 'ended', reason);
      assert.equal(repeated.reason, reason, reason);
      assert.equal(Object.hasOwn(repeated, 'recoveryNotice'), false, reason);
      assert.equal(repeated.session.recoveryNotice, null, reason);
    }
    assertNoNoticeRecord(root);
  });
});

nodeTest('a corrected controlled end omits the notice and adds nothing to the authoritative record', () => {
  withSealedWorkspace((root) => {
    const required = requiredGovernanceFixture(root);
    const selected = projectedGovernanceBranch(root, required, 'selected-alternative');
    const inspected = inspectedGovernanceBranch(root, selected, required);
    const governance = () => ({
      action: 'controlled-end',
      input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
    });

    // Control: the identical controlled end reached with no incident at all.
    const clean = createHostAdapter(sealedInitial({ state: inspected }));
    const cleanEnd = clean.run(sealedRequest(clean, 'advance-governance', { governance: governance() }));
    assert.equal(cleanEnd.outcome, 'ended', cleanEnd.reason);
    assert.equal(Object.hasOwn(cleanEnd, 'recoveryNotice'), false);

    let invocations = 0;
    const incident = createHostAdapter(sealedInitial({ state: inspected }), sealedPorts((command, request) => {
      invocations += 1;
      // One qualifying no-effect host incident before any successor is accepted.
      return invocations === 1
        ? { status: 'empty' }
        : { status: 'returned', value: runCommand(command, request) };
    }));
    const refused = incident.run(sealedRequest(incident, 'advance-governance', { governance: governance() }));
    assert.equal(refused.outcome, 'closed-refusal', refused.reason);
    assert.equal(refused.incidentClass, 'empty-output');
    assert.equal(refused.next.kind, 'correction');

    const corrected = sealedRequest(
      incident,
      'advance-governance',
      { governance: governance() },
      { correctionIdentity: refused.next.correctionIdentity },
    );
    // The correction is authorized, so a notice is pending for the very next outcome.
    const ended = incident.run(corrected);
    assert.equal(ended.outcome, 'ended', ended.reason);
    assert.equal(ended.reason, cleanEnd.reason);

    // That outcome is the run's first successful one and it is a controlled end, so the
    // notice is dropped rather than carried, and no event or record replaces it.
    assert.equal(Object.hasOwn(ended, 'recoveryNotice'), false);
    assert.equal(ended.session.recoveryNotice, null);
    assert.deepEqual(Object.keys(ended).sort(), ['outcome', 'reason', 'session', 'version']);
    assert.equal(ended.session.acceptedStateBytes, cleanEnd.session.acceptedStateBytes);
    assert.equal(ended.session.acceptedRevision, cleanEnd.session.acceptedRevision);
    for (const token of NOTICE_TOKENS) {
      assert.equal(ended.session.acceptedStateBytes.includes(token), false, token);
    }
    assertNoNoticeRecord(root);
  });
});

nodeTest('the positive bridge binds one prestate, one mutation, one receipt, and one poststate', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    /** @type {Record<string, unknown>[]} */
    const applications = [];
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial, {
      laneOwner: {
        identity: sha256('counting-real-lane-owner'),
        apply(request) {
          applications.push(clone(request));
          return applyLightweightWorkRequest(request);
        },
      },
    }));
    const adapter = closure.adapter;
    const acceptedState = closure.settled.session.acceptedState;
    const binding = sealedLaneBinding(root);
    const prestateTasks = contentDescriptor(fs.readFileSync(path.join(root, TASKS_PATH)));

    const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: closure.laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    const permit = issued.product.permit;

    // Predicate binding: the permit names the exact accepted authority, the exact fresh
    // lane prestate and mapping, and exactly one allowed mutation.
    const { permitHash, ...permitBody } = permit;
    assert.equal(permitHash, sha256(canonicalJson(permitBody)));
    assert.equal(permit.kind, 'lane-mutation');
    assert.equal(permit.lane, 'lightweight');
    assert.equal(permit.operation, 'work-set');
    assert.equal(canonicalJson(permit.target), canonicalJson(canonicalTarget(TARGET)));
    assert.equal(permit.subjectRunStateHash, sha256(canonicalJson(acceptedState)));
    assert.equal(permit.lanePrestateHash, sha256(canonicalJson(binding.lanePrestate)));
    assert.equal(permit.targetMappingHash, sha256(canonicalJson(binding.targetMapping)));
    assert.equal(permit.mutationIdentity, sha256(canonicalJson(LANE_MUTATION)));
    assert.equal(prestateTasks.sha256, binding.lanePrestate.tasksDescriptor.sha256);

    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: clone(permit) },
    }));
    assert.equal(applied.outcome, 'accepted', applied.reason);
    const receipt = applied.product.receipt;

    // Exactly one authoritative lane-owner application, carrying exactly the permit-bound
    // mutation, target, accepted state, and permit.
    assert.equal(applications.length, 1);
    const laneRequest = applications[0];
    assert.equal(laneRequest.operation, 'work-set');
    assert.equal(canonicalJson(laneRequest.permit), canonicalJson(permit));
    assert.equal(canonicalJson(laneRequest.mutation), canonicalJson(LANE_MUTATION));
    assert.equal(canonicalJson(laneRequest.target), canonicalJson(canonicalTarget(TARGET)));
    assert.equal(canonicalJson(laneRequest.state), canonicalJson(acceptedState));
    assert.equal(laneRequest.root, binding.application.root);

    // The receipt matches the permit and binds the exact resulting poststate on disk.
    assert.equal(receipt.permitHash, permit.permitHash);
    assert.equal(receipt.mutationIdentity, permit.mutationIdentity);
    assert.equal(receipt.targetMappingHash, permit.targetMappingHash);
    assert.equal(receipt.lanePrestateHash, permit.lanePrestateHash);
    assert.equal(receipt.targetStateChanged, true);
    assert.equal(
      receipt.tasksPoststateHash,
      contentDescriptor(fs.readFileSync(path.join(root, TASKS_PATH))).sha256,
    );
    assert.equal(
      receipt.taskStatePoststateHash,
      contentDescriptor(fs.readFileSync(path.join(root, TASK_STATE_PATH))).sha256,
    );
    assert.equal(
      receipt.ownerPoststateHash,
      contentDescriptor(fs.readFileSync(path.join(root, IDEA_PATH))).sha256,
    );
    // The bound task moved and the owner did not.
    assert.notEqual(receipt.tasksPoststateHash, prestateTasks.sha256);
    assert.equal(receipt.ownerPoststateHash, binding.lanePrestate.ownerDescriptor.sha256);
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      'x',
    );

    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: { input: closure.laneInput(), permit: clone(permit), receipt: clone(receipt) },
    }));
    assert.equal(committed.outcome, 'accepted', committed.reason);
    assert.equal(committed.product.kind, 'lane-settlement');
    assert.equal(canonicalJson(committed.product.receipt), canonicalJson(receipt));
    assert.equal(committed.product.terminalEvidenceIdentity, receipt.receiptHash);
    // Settlement never moves accepted authority.
    assert.equal(committed.session.acceptedStateBytes, canonicalJson(acceptedState));
    assert.equal(committed.session.acceptedRevision, closure.settled.session.acceptedRevision);

    // Replaying the settled receipt settles nothing a second time.
    const replayed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: { input: closure.laneInput(), permit: clone(permit), receipt: clone(receipt) },
    }));
    assert.equal(replayed.outcome, 'hard-stop');
    assert.equal(replayed.reason, 'lane-receipt-replayed');
    assert.equal(applications.length, 1);
  });
});

nodeTest('a settled or unapplied bridge permit refuses replay, drift, and out-of-order settlement', () => {
  /**
   * @param {string} root
   * @param {(closure:{adapter:ReturnType<typeof createHostAdapter>,laneInput:()=>Record<string, unknown>},
   *   binding:ReturnType<typeof sealedLaneBinding>, permit:Record<string, unknown>,
   *   applications:Record<string, unknown>[])=>void} exercise
   */
  const withIssuedPermit = (root, exercise) => {
    writeSealedTaskState(root);
    /** @type {Record<string, unknown>[]} */
    const applications = [];
    const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial, {
      laneOwner: {
        identity: sha256(`replay-lane-owner:${applications.length}`),
        apply(request) {
          applications.push(clone(request));
          return applyLightweightWorkRequest(request);
        },
      },
    }));
    const binding = sealedLaneBinding(root);
    const issued = closure.adapter.run(sealedRequest(closure.adapter, 'authorize-lane-effect', {
      laneEffect: {
        input: closure.laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }));
    assert.equal(issued.outcome, 'accepted', issued.reason);
    exercise(closure, binding, issued.product.permit, applications);
  };

  withSealedWorkspace((root) => {
    // A second application of the same permit is a replay, not a second mutation.
    withIssuedPermit(root, (closure, binding, permit, applications) => {
      const applied = closure.adapter.run(sealedRequest(closure.adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: clone(permit) },
      }));
      assert.equal(applied.outcome, 'accepted', applied.reason);
      const poststate = fs.readFileSync(path.join(root, TASKS_PATH));

      const replayed = closure.adapter.run(sealedRequest(closure.adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: clone(permit) },
      }));
      assert.equal(replayed.outcome, 'hard-stop');
      assert.equal(replayed.reason, 'lane-permit-replayed');
      assert.equal(applications.length, 1);
      assert.equal(
        contentDescriptor(fs.readFileSync(path.join(root, TASKS_PATH))).sha256,
        contentDescriptor(poststate).sha256,
      );
    });
  });

  withSealedWorkspace((root) => {
    // Settlement cannot run ahead of the lane owner it is supposed to settle.
    withIssuedPermit(root, (closure, binding, permit, applications) => {
      const early = closure.adapter.run(sealedRequest(closure.adapter, 'commit-lane-receipt', {
        laneReceipt: { input: closure.laneInput(), permit: clone(permit), receipt: {} },
      }));
      assert.equal(early.outcome, 'hard-stop');
      assert.equal(early.reason, 'lane-effect-unapplied');
      assert.deepEqual(applications, []);
      assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
    });
  });

  withSealedWorkspace((root) => {
    // One permit authorizes one exact mutation and nothing adjacent to it.
    withIssuedPermit(root, (closure, binding, permit, applications) => {
      const drifted = { ...clone(LANE_MUTATION), toGlyph: '!' };
      const refused = closure.adapter.run(sealedRequest(closure.adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: clone(permit), mutation: drifted },
      }));
      assert.equal(refused.outcome, 'hard-stop');
      assert.equal(refused.reason, 'lane-permit-binding-mismatch');
      assert.deepEqual(applications, []);
      assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
    });
  });

  withSealedWorkspace((root) => {
    // The tracked-lane gate stays closed even for a real, freshly issued Lightweight permit.
    withIssuedPermit(root, (closure, binding, permit) => {
      /** @type {unknown[]} */
      const trackedApplications = [];
      const tracked = createHostAdapter({
        state: emptyState('autonomous'),
        target: clone(TRACKED_TARGET),
        inspectionIdentity: sha256('tracked-bridge-inspection'),
      }, {
        laneOwner: {
          identity: sha256('tracked-bridge-lane-owner'),
          apply(request) {
            trackedApplications.push(clone(request));
            return { ok: true, phase: 'committed' };
          },
        },
      });
      const gated = tracked.run(sealedRequest(tracked, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: clone(permit) },
      }));
      assert.equal(gated.outcome, 'hard-stop');
      assert.equal(gated.reason, 'lane-owner-unavailable');
      assert.deepEqual(trackedApplications, []);
    });
  });
});

nodeTest('every semantic operation reaches its documented owner and only apply reaches the lane owner', () => {
  /** @type {Map<string, string[]>} */
  const routes = new Map([['none', []]]);
  /** @type {string[]} */
  const laneApplications = [];
  let active = 'none';
  /** @param {string} label */
  const recordingRuntime = (label) => ({
    runtime: {
      identity: sha256(`routing-runtime:${label}`),
      invoke(command, lowLevelRequest) {
        /** @type {string[]} */ (routes.get(active)).push(`${command}:${lowLevelRequest.mode || 'ordinary'}`);
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      },
    },
  });
  /** @param {ReturnType<typeof createHostAdapter>} adapter @param {string} operation @param {Record<string, unknown>} payload */
  const route = (adapter, operation, payload) => {
    active = operation;
    if (!routes.has(operation)) routes.set(operation, []);
    const result = adapter.run(sealedRequest(adapter, operation, payload));
    active = 'none';
    return result;
  };

  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const inspectAdapter = createHostAdapter(sealedInitial(), recordingRuntime('inspect'));
    const inspected = route(inspectAdapter, 'fresh-inspection', { input: sealedInspectionInput(root) });
    assert.equal(inspected.outcome, 'accepted', inspected.reason);

    const attemptBinding = sealedLaneBinding(root);
    const authorizeInput = sealedInspectionInput(root, { policyMode: 'autonomous' });
    const authorizeAdapter = createHostAdapter(
      sealedInitial({ state: emptyState('autonomous') }),
      recordingRuntime('authorize'),
    );
    const authorized = route(authorizeAdapter, 'authorize-attempt', {
      authorization: {
        input: authorizeInput,
        assessment: {
          evidenceHash: inspect(authorizeInput).evidenceHash,
          intent: 'unchanged',
          action: 'execute-task',
          materialInputs: clone(MATERIAL_INPUTS),
          equivalence: 'distinct',
          retention: 'transient',
          summary: 'Route the authorized attempt.',
        },
        permit: { lanePrestate: attemptBinding.lanePrestate, targetMapping: attemptBinding.targetMapping },
      },
    });
    assert.equal(authorized.outcome, 'accepted', authorized.reason);

    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'routing', 'accepted');
    const laneAdapter = createHostAdapter(sealedInitial({ state }), {
      ...recordingRuntime('lane'),
      laneOwner: {
        identity: sha256('routing-lane-owner'),
        apply(request) {
          laneApplications.push(active);
          return applyLightweightWorkRequest(request);
        },
      },
    });
    const captureInput = () => sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      ...fixture.streams,
    }));
    const captured = route(laneAdapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
    });
    assert.equal(captured.outcome, 'effect-required', captured.reason);
    const events = captured.effect.projectionBatch.events;

    const prepared = route(laneAdapter, 'prepare-authoritative-projection', { projection: { input: captureInput() } });
    assert.equal(prepared.outcome, 'effect-required', prepared.reason);

    const settled = route(laneAdapter, 'settle-effect', {
      input: sealedRetentionInput(root, events, events, fixture.streams),
    });
    assert.equal(settled.outcome, 'accepted', settled.reason);

    const laneBinding = sealedLaneBinding(root);
    const laneInput = () => sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: [sealedCapture(TARGET, 'failed', events.map((/** @type {Record<string, unknown>} */ event) => ({ event })))],
      ...fixture.streams,
    }));
    const audited = route(laneAdapter, 'audit-run', { audit: { input: laneInput() } });
    assert.equal(audited.outcome, 'accepted', audited.reason);

    const issued = route(laneAdapter, 'authorize-lane-effect', {
      laneEffect: {
        input: laneInput(),
        mutation: clone(LANE_MUTATION),
        lanePrestate: laneBinding.lanePrestate,
        targetMapping: laneBinding.targetMapping,
      },
    });
    assert.equal(issued.outcome, 'accepted', issued.reason);

    const applied = route(laneAdapter, 'apply-lane-effect', {
      laneApplication: { ...laneBinding.application, permit: clone(issued.product.permit) },
    });
    assert.equal(applied.outcome, 'accepted', applied.reason);

    const committed = route(laneAdapter, 'commit-lane-receipt', {
      laneReceipt: {
        input: laneInput(),
        permit: clone(issued.product.permit),
        receipt: clone(applied.product.receipt),
      },
    });
    assert.equal(committed.outcome, 'accepted', committed.reason);
  });

  withSealedWorkspace((root) => {
    const required = requiredGovernanceFixture(root);
    const { review } = governanceReview(required.state, 'selected-alternative');
    const governanceAdapter = createHostAdapter(
      sealedInitial({ state: required.state }),
      recordingRuntime('governance'),
    );
    const reviewed = route(governanceAdapter, 'advance-governance', {
      governance: {
        action: 'review-learning',
        input: sealedRetentionInput(root, required.governedEvents, required.governedEvents, required.streams),
        review,
      },
    });
    assert.equal(reviewed.outcome, 'effect-required', reviewed.reason);
    const learnedEvents = [...required.governedEvents, ...reviewed.effect.projectionBatch.events];
    const projected = route(governanceAdapter, 'settle-effect', {
      input: sealedRetentionInput(root, learnedEvents, learnedEvents, required.streams),
    });
    assert.equal(projected.outcome, 'accepted', projected.reason);
  });

  // Application rederives the runtime permit before the sole authoritative
  // mutator is reachable; no other semantic operation reaches the lane owner.
  assert.deepEqual(Object.fromEntries([...routes].map(([operation, log]) => [operation, [...new Set(log)]])), {
    none: [],
    'fresh-inspection': ['inspect:ordinary'],
    'authorize-attempt': ['transition:issue-attempt-permit', 'authorize:ordinary'],
    'record-attempt-result': ['complete:capture'],
    'prepare-authoritative-projection': ['transition:prepare-projection'],
    'settle-effect': ['complete:finalize', 'transition:verify-projection'],
    'audit-run': ['audit:ordinary'],
    'authorize-lane-effect': ['transition:issue-lane-permit'],
    'apply-lane-effect': ['transition:issue-lane-permit'],
    'commit-lane-receipt': ['transition:commit-lane-receipt'],
    'advance-governance': ['learn:ordinary'],
  });
  assert.deepEqual(laneApplications, ['apply-lane-effect']);
});

/** The exact authoritative Lightweight surfaces one lane effect is allowed to move. @param {string} root */
function laneSurfaceDigests(root) {
  return Object.fromEntries([TASKS_PATH, TASK_STATE_PATH, IDEA_PATH].map((relative) => [
    relative,
    contentDescriptor(fs.readFileSync(path.join(root, relative))).sha256,
  ]));
}

/** @param {Record<string, unknown>} inspection @param {string} summary */
function sealedAssessment(inspection, summary) {
  return {
    evidenceHash: inspection.evidenceHash,
    intent: 'unchanged',
    action: 'execute-task',
    materialInputs: clone(MATERIAL_INPUTS),
    equivalence: 'distinct',
    retention: 'transient',
    summary,
  };
}

nodeTest('one unsettled effect blocks every operation that requires settled authority', () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'unsettled-effect', 'accepted');
    let runtimeInvocations = 0;
    let laneApplications = 0;
    const adapter = createHostAdapter(sealedInitial({ state }), {
      runtime: {
        identity: sha256('unsettled-effect-runtime'),
        invoke(command, lowLevelRequest) {
          runtimeInvocations += 1;
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      laneOwner: {
        identity: sha256('unsettled-effect-lane-owner'),
        apply(request) {
          laneApplications += 1;
          return applyLightweightWorkRequest(request);
        },
      },
    });
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: {
        input: sealedRecordInput(root),
        result: fixture.semantic,
      },
    }));
    assert.equal(captured.outcome, 'effect-required', captured.reason);
    assert.equal(captured.reason, 'occurrence-retention-required');
    const events = captured.effect.projectionBatch.events;
    const outstanding = captured.effect.effectIdentity;
    const acceptedBytes = captured.session.acceptedStateBytes;
    const acceptedRevision = captured.session.acceptedRevision;
    const prestate = laneSurfaceDigests(root);
    const invocationsAtCapture = runtimeInvocations;

    const binding = sealedLaneBinding(root);
    const inspection = inspect(sealedInspectionInput(root, { policyMode: 'autonomous' }));
    /** @type {[string, Record<string, unknown>][]} */
    const blocked = [
      ['record-attempt-result', { attemptResult: { input: { captured: true }, result: fixture.semantic } }],
      ['authorize-attempt', {
        authorization: {
          input: sealedInspectionInput(root, { policyMode: 'autonomous' }),
          assessment: sealedAssessment(inspection, 'Authorize while an effect is outstanding.'),
        },
      }],
      ['advance-governance', { governance: { action: 'verify-no-progress', input: {} } }],
      ['authorize-lane-effect', {
        laneEffect: {
          input: {},
          mutation: clone(LANE_MUTATION),
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
        },
      }],
      ['apply-lane-effect', {
        laneApplication: {
          ...binding.application,
          permit: laneMutationPermit(captured.session.acceptedState),
        },
      }],
      ['commit-lane-receipt', { laneReceipt: { input: {}, permit: {}, receipt: {} } }],
      ['audit-run', { audit: { input: {} } }],
    ];
    for (const [operation, payload] of blocked) {
      const refused = adapter.run(sealedRequest(adapter, operation, payload));
      assert.equal(refused.outcome, 'effect-required', operation);
      assert.equal(refused.reason, 'effect-unsettled', operation);
      // The one outstanding effect is returned unchanged rather than replaced or discarded.
      assert.equal(refused.effect.effectIdentity, outstanding, operation);
      assert.equal(refused.effect.kind, 'completion-retention', operation);
      assert.equal(refused.session.acceptedStateBytes, acceptedBytes, operation);
      assert.equal(refused.session.acceptedRevision, acceptedRevision, operation);
      assert.equal(refused.session.status, 'active', operation);
      assert.deepEqual(laneSurfaceDigests(root), prestate, operation);
    }
    // The refusal precedes every authority: no recovery route and no lane owner was reached.
    assert.equal(runtimeInvocations, invocationsAtCapture);
    assert.equal(laneApplications, 0);

    // The effect those refusals preserved still settles on its own route.
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
      input: sealedRetentionInput(root, events, events, fixture.streams),
    }));
    assert.equal(settled.outcome, 'accepted', settled.reason);
    assert.equal(settled.session.pendingEffect, null);
    assert.equal(runtimeInvocations, invocationsAtCapture + 1);
  });
});

nodeTest('a lane owner that throws, returns malformed output, or lands indeterminately stops without a receipt', () => {
  /** @type {[string, (request:Record<string, unknown>)=>unknown, string][]} */
  const owners = [
    ['throws', () => { throw new Error('lane owner exploded'); }, 'lane-owner-threw'],
    ['returns a bare string', () => 'committed', 'lane-owner-result-malformed'],
    ['returns an array', () => [], 'lane-owner-result-malformed'],
    ['returns an accessor-backed record', () => Object.defineProperty(
      { version: 1, phase: 'committed' },
      'ok',
      { get: () => true, enumerable: true, configurable: true },
    ), 'lane-owner-result-malformed'],
    ['fails without a refusal phase', () => ({
      version: 1, ok: false, phase: 'interrupted', reason: 'lane-prestate-mismatch',
    }), 'lane-effect-indeterminate'],
    ['refuses without a stated reason', () => ({
      version: 1, ok: false, phase: 'refused', reason: 7,
    }), 'lane-effect-indeterminate'],
  ];
  for (const [label, apply, reason] of owners) {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      let applications = 0;
      const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial, {
        laneOwner: {
          identity: sha256(`defective-lane-owner:${label}`),
          apply(request) {
            applications += 1;
            return apply(request);
          },
        },
      }));
      const adapter = closure.adapter;
      const binding = sealedLaneBinding(root);
      const issued = adapter.run(sealedRequest(adapter, 'authorize-lane-effect', {
        laneEffect: {
          input: closure.laneInput(),
          mutation: clone(LANE_MUTATION),
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
        },
      }));
      assert.equal(issued.outcome, 'accepted', `${label}:${issued.reason}`);
      const prestate = laneSurfaceDigests(root);
      const before = adapter.snapshot();

      const stopped = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: clone(issued.product.permit) },
      }));
      assert.equal(stopped.outcome, 'hard-stop', label);
      assert.equal(stopped.reason, reason, label);
      assert.equal(stopped.session.disposition, reason, label);
      assert.equal(applications, 1, label);
      // A lane owner the adapter cannot read yields no receipt, no settlement authority,
      // and no accepted movement.
      assert.equal(Object.hasOwn(stopped, 'product'), false, label);
      assert.equal(stopped.session.acceptedStateBytes, before.acceptedStateBytes, label);
      assert.equal(stopped.session.acceptedRevision, before.acceptedRevision, label);
      assert.deepEqual(laneSurfaceDigests(root), prestate, label);

      // The stop is terminal, so nothing settles behind it.
      const later = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
        laneReceipt: { input: closure.laneInput(), permit: clone(issued.product.permit), receipt: {} },
      }));
      assert.equal(later.outcome, 'hard-stop', label);
      assert.equal(later.reason, reason, label);
    });
  }
});

nodeTest('every governance action, both settlement branches, and an unpermitted authorization compose exact routes', () => {
  /** @type {Map<string, string[]>} */
  const routes = new Map();
  let active = 'none';
  /** @param {string} label */
  const recordingRuntime = (label) => ({
    runtime: {
      identity: sha256(`branch-routing-runtime:${label}`),
      invoke(command, lowLevelRequest) {
        /** @type {string[]} */ (routes.get(active)).push(`${command}:${lowLevelRequest.mode || 'ordinary'}`);
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      },
    },
  });
  /** @param {ReturnType<typeof createHostAdapter>} adapter @param {string} key @param {string} operation @param {Record<string, unknown>} payload */
  const route = (adapter, key, operation, payload) => {
    active = key;
    if (!routes.has(key)) routes.set(key, []);
    const result = adapter.run(sealedRequest(adapter, operation, payload));
    active = 'none';
    return result;
  };

  withSealedWorkspace((root) => {
    // An ordinary authorization carries no attempt permit, so it composes the authorization
    // route alone and never the permit route.
    const input = sealedInspectionInput(root);
    const plain = createHostAdapter(sealedInitial({ state: emptyState() }), recordingRuntime('authorize-plain'));
    const authorized = route(plain, 'authorize-attempt:no-permit', 'authorize-attempt', {
      authorization: {
        input,
        assessment: sealedAssessment(inspect(input), 'Authorize without an attempt permit.'),
      },
    });
    assert.equal(authorized.outcome, 'accepted', authorized.reason);
    assert.equal(authorized.reason, 'authorized');
  });

  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    // A completion-retention effect selects the completion finalization branch.
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'settlement-branch', 'accepted');
    const adapter = createHostAdapter(sealedInitial({ state }), recordingRuntime('completion'));
    const captured = route(adapter, 'record-attempt-result', 'record-attempt-result', {
      attemptResult: {
        input: sealedRecordInput(root),
        result: fixture.semantic,
      },
    });
    assert.equal(captured.outcome, 'effect-required', captured.reason);
    assert.equal(captured.effect.kind, 'completion-retention');
    const events = captured.effect.projectionBatch.events;
    const settled = route(adapter, 'settle-effect:completion-retention', 'settle-effect', {
      input: sealedRetentionInput(root, events, events, fixture.streams),
    });
    assert.equal(settled.outcome, 'accepted', settled.reason);
  });

  withSealedWorkspace((root) => {
    const required = requiredGovernanceFixture(root);
    const selected = projectedGovernanceBranch(root, required, 'selected-alternative');
    const noProgress = projectedGovernanceBranch(root, required, 'no-progress');
    const inspected = inspectedGovernanceBranch(root, selected, required);
    /** @type {[string, Record<string, unknown>, ()=>Record<string, unknown>, string][]} */
    const actions = [
      ['review-learning', required.state, () => ({
        action: 'review-learning',
        input: sealedRetentionInput(root, required.governedEvents, required.governedEvents, required.streams),
        review: selected.review,
      }), 'effect-required'],
      ['bind-alternative', selected.state, () => ({
        action: 'bind-alternative',
        input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
      }), 'accepted'],
      ['verify-no-progress', noProgress.state, () => ({
        action: 'verify-no-progress',
        input: sealedRetentionInput(root, noProgress.learnedEvents, noProgress.learnedEvents, required.streams),
      }), 'accepted'],
      ['controlled-end', inspected, () => ({
        action: 'controlled-end',
        input: sealedRetentionInput(root, selected.learnedEvents, selected.learnedEvents, required.streams),
      }), 'ended'],
      ['resume-learning', required.state, () => ({
        action: 'resume-learning',
        input: sealedRetentionInput(root, required.governedEvents, required.governedEvents, required.streams),
      }), 'accepted'],
    ];
    for (const [action, governedState, governance, expected] of actions) {
      const adapter = createHostAdapter(sealedInitial({ state: governedState }), recordingRuntime(action));
      const advanced = route(adapter, `advance-governance:${action}`, 'advance-governance', {
        governance: governance(),
      });
      assert.equal(advanced.outcome, expected, `${action}:${advanced.reason}`);
      if (action !== 'review-learning') continue;
      // The review's own effect is a projection, which selects the other settlement branch.
      assert.equal(advanced.effect.kind, 'projection');
      const learnedEvents = [...required.governedEvents, ...advanced.effect.projectionBatch.events];
      const projected = route(adapter, 'settle-effect:projection', 'settle-effect', {
        input: sealedRetentionInput(root, learnedEvents, learnedEvents, required.streams),
      });
      assert.equal(projected.outcome, 'accepted', projected.reason);
    }
  });

  // Each governance action composes exactly its own documented transition mode, and the
  // pending effect's kind — not the caller — picks the settlement route.
  assert.deepEqual(Object.fromEntries(routes), {
    'authorize-attempt:no-permit': ['authorize:ordinary'],
    'record-attempt-result': ['complete:capture'],
    'settle-effect:completion-retention': ['complete:finalize'],
    'settle-effect:projection': ['transition:verify-projection'],
    'advance-governance:review-learning': ['learn:ordinary'],
    'advance-governance:bind-alternative': ['transition:bind-post-learning-inspection'],
    'advance-governance:verify-no-progress': ['transition:verify-no-progress'],
    'advance-governance:controlled-end': ['transition:controlled-end'],
    'advance-governance:resume-learning': ['transition:resume-governance'],
  });
});

/** @param {string} root @param {Record<string, unknown>} [overrides] */
function focusedRunnerRequest(root, overrides = {}) {
  const input = sealedInspectionInput(root, { policyMode: 'autonomous' });
  const assessment = {
    evidenceHash: inspect(input).evidenceHash,
    intent: 'unchanged',
    action: 'execute-task',
    materialInputs: clone(MATERIAL_INPUTS),
    equivalence: 'distinct',
    retention: 'transient',
    summary: 'Exercise the bounded host adapter runner.',
  };
  return {
    version: 1,
    root,
    target: clone(TARGET),
    owner: {
      ideaPath: IDEA_PATH,
      specPath: TARGET.specPath,
    },
    state: emptyState('autonomous'),
    assessment,
    specialistResult: specialistResult('focused-runner', 'accepted'),
    ...overrides,
  };
}

/** @param {Record<string, unknown>} challenge @param {Record<string, unknown>} [overrides] */
function focusedChallengeAssessment(challenge, overrides = {}) {
  const inspection = /** @type {Record<string, unknown>} */ (challenge.inspection);
  return {
    evidenceHash: inspection.evidenceHash,
    intent: 'unchanged',
    action: 'execute-task',
    materialInputs: clone(MATERIAL_INPUTS),
    equivalence: 'distinct',
    retention: 'transient',
    summary: 'Respond to the exact fresh runner Inspection.',
    ...overrides,
  };
}

/** @param {Record<string, unknown>} assessment @param {string} label @param {'accepted'|'rejected'} [verdict] */
function focusedSpecialistPair(assessment, label, verdict = 'accepted') {
  const definition = `focused runner check:${label}`;
  return {
    outcome: verdict === 'accepted' ? 'succeeded' : 'blocked',
    operations: clone(assessment.materialInputs.operations),
    changedTargets: [],
    verification: {
      checks: [{ definition, outcome: 'passed', evidence: `focused runner evidence:${label}` }],
    },
    review: {
      verdict,
      findings: verdict === 'accepted' ? [] : [{
        basis: {
          expectation: { kind: 'governing-rule', reference: `focused runner rule:${label}` },
          subjects: [TARGET.taskKey],
          failureClass: 'review-rejection',
          checkDefinition: definition,
        },
        observation: { kind: 'observed-evidence', evidence: `focused runner observation:${label}` },
      }],
    },
  };
}

/** @param {Record<string, unknown>} assessment @param {string} label */
function focusedFailedSpecialistPair(assessment, label) {
  const pair = focusedSpecialistPair(assessment, label, 'accepted');
  pair.outcome = 'failed';
  pair.verification.checks[0].outcome = 'failed';
  return pair;
}

/** @param {readonly string[]} targets */
function focusedMaterialInputs(targets) {
  return { targets: [...targets], operations: ['execute-task'], checks: ['verification'] };
}

/** @param {Record<string, unknown>} challenge @param {string} field @param {unknown} value */
function focusedChallengeResponse(challenge, field, value) {
  return {
    version: 1,
    type: 'challenge-response',
    challengeIdentity: challenge.challengeIdentity,
    kind: challenge.kind,
    [field]: clone(value),
  };
}

/** @param {Record<string, unknown>} challenge @param {string} field @param {unknown} value */
function focusedRawChallengeResponse(challenge, field, value) {
  return {
    version: 1,
    type: 'challenge-response',
    challengeIdentity: challenge.challengeIdentity,
    kind: challenge.kind,
    [field]: value,
  };
}

/**
 * Exercise the producing-host boundary without changing the value later
 * received and independently validated by the runner.
 * @param {Record<string, unknown>} challenge
 * @param {unknown} assessment
 * @param {('accepted'|'rejected')[]} producerVerdicts
 */
function focusedProducedAssessmentResponse(challenge, assessment, producerVerdicts) {
  try {
    validateAssessment(challenge.target, challenge.inspection, assessment);
    producerVerdicts.push('accepted');
  } catch {
    producerVerdicts.push('rejected');
  }
  return focusedRawChallengeResponse(challenge, 'assessment', assessment);
}

/** @param {Record<string, unknown>} challenge */
function focusedCancelResponse(challenge) {
  return {
    version: 1,
    type: 'cancel',
    challengeIdentity: challenge.challengeIdentity,
    kind: challenge.kind,
  };
}

/**
 * @typedef {{
 *   result:Record<string, unknown>,
 *   assessment:Record<string, unknown>,
 *   specialistResult:Record<string, unknown>,
 *   specialistResultBytes:string,
 *   preimages:Record<string, Buffer>,
 *   checkpoint:ReturnType<typeof memoryCheckpointStore>,
 *   runtimeCalls:{command:string,mode:string}[],
 *   runtimeErrors:string[],
 *   captures:{completion:Record<string, unknown>,input:Record<string, unknown>}[],
 *   laneApplications:Record<string, unknown>[],
 *   challenges:Record<string, unknown>[],
 *   exchangeKinds:string[],
 * }} FocusedTrustedCompletionRun
 */

/**
 * Run one real specialist result through the public runner, retaining the exact
 * completion sent to `runCommand` and rethrowing any runtime validation error.
 * @param {string} root
 * @param {string} label
 * @param {(assessment:Record<string, unknown>)=>Record<string, unknown>} makeSpecialistResult
 * @returns {Promise<FocusedTrustedCompletionRun>}
 */
async function runFocusedTrustedCompletion(root, label, makeSpecialistResult) {
  writeSealedTaskState(root);
  const preimages = feature060Preimages(root);
  const request = focusedRunnerRequest(root);
  const assessment = clone(request.assessment);
  const specialistResult = makeSpecialistResult(request.assessment);
  const specialistResultBytes = canonicalJson(specialistResult);
  request.specialistResult = specialistResult;
  const checkpoint = memoryCheckpointStore();
  /** @type {{command:string,mode:string}[]} */
  const runtimeCalls = [];
  /** @type {string[]} */
  const runtimeErrors = [];
  /** @type {{completion:Record<string, unknown>,input:Record<string, unknown>}[]} */
  const captures = [];
  /** @type {Record<string, unknown>[]} */
  const laneApplications = [];
  /** @type {Record<string, unknown>[]} */
  const challenges = [];
  /** @type {string[]} */
  const exchangeKinds = [];

  const result = await runHostAdapter(request, {
    checkpoint: checkpoint.port,
    runtime: {
      identity: sha256(`runner-trusted-completion-outcome:${label}`),
      invoke(command, lowLevelRequest) {
        runtimeCalls.push({ command, mode: lowLevelRequest.mode || 'ordinary' });
        if (command === 'complete' && lowLevelRequest.mode === 'capture') {
          captures.push({
            completion: clone(lowLevelRequest.completion),
            input: clone(lowLevelRequest.input),
          });
        }
        try {
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        } catch (error) {
          runtimeErrors.push(error instanceof Error ? error.message : String(error));
          throw error;
        }
      },
    },
    laneOwner: {
      identity: sha256(`runner-trusted-completion-lane-owner:${label}`),
      apply(requestValue) {
        laneApplications.push(clone(requestValue));
        return applyLightweightWorkRequest(requestValue);
      },
    },
    exchange(challenge) {
      challenges.push(clone(challenge));
      exchangeKinds.push(challenge.kind);
      assert.equal(challenge.kind, 'specialist-pair', `${label}: replacement challenge kind`);
      return focusedCancelResponse(challenge);
    },
  });

  return {
    result,
    assessment,
    specialistResult,
    specialistResultBytes,
    preimages,
    checkpoint,
    runtimeCalls,
    runtimeErrors,
    captures,
    laneApplications,
    challenges,
    exchangeKinds,
  };
}

/** @param {Record<string, unknown>} capture */
function focusedCapturedEnvelope(capture) {
  const bytes = /** @type {Record<string, unknown>} */ (capture.bytes);
  return JSON.parse(
    Buffer.from(/** @type {string} */ (bytes.base64), 'base64').toString('utf8'),
  ).records[0].substantive;
}

/** @param {Record<string, unknown>} result */
function focusedRunnerAcceptedState(result) {
  return JSON.parse(
    Buffer.from(/** @type {string} */ (result.stateBase64), 'base64').toString('utf8'),
  );
}

/**
 * @param {string} root
 * @param {string} label
 * @param {FocusedTrustedCompletionRun} observed
 * @param {'succeeded'|'no-change'} outcome
 */
function assertFocusedTrustedCompletionSettled(root, label, observed, outcome) {
  assert.deepEqual(
    observed.runtimeErrors,
    [],
    `${label}: ${observed.runtimeErrors.join(' | ')}`,
  );
  assert.deepEqual(observed.exchangeKinds, [], `${label}: no replacement exchange`);
  assert.equal(observed.result.outcome, 'ended', `${label}:${observed.result.reason}`);
  assert.equal(observed.result.reason, 'task-settled', label);
  assert.equal(observed.result.haltReport, null, label);
  assert.equal(observed.captures.length, 1, `${label}: one trusted completion capture`);

  const capture = observed.captures[0];
  assert.equal(capture.completion.outcome, outcome, `${label}: outcome stays exact`);
  assert.deepEqual(capture.completion.operations, observed.specialistResult.operations, label);
  assert.deepEqual(capture.completion.changedTargets, observed.specialistResult.changedTargets, label);
  const verificationCaptures = /** @type {Record<string, unknown>[]} */ (capture.input.verification);
  const reviewCaptures = /** @type {Record<string, unknown>[]} */ (capture.input.review);
  const verification = normalizeVerificationEnvelopeV2(
    focusedCapturedEnvelope(verificationCaptures[0]),
  );
  const review = normalizeIndependentReviewEnvelopeV2(
    focusedCapturedEnvelope(reviewCaptures[0]),
    verification,
  );
  assert.deepEqual(
    {
      attemptIdentity: capture.completion.attemptIdentity,
      resultIdentity: capture.completion.resultIdentity,
      verificationEnvelopeIdentity: capture.completion.verificationEnvelopeIdentity,
      reviewEnvelopeIdentity: capture.completion.reviewEnvelopeIdentity,
      findingIdentities: capture.completion.findingIdentities,
    },
    {
      attemptIdentity: verification.attemptIdentity,
      resultIdentity: verification.resultIdentity,
      verificationEnvelopeIdentity: verification.envelopeIdentity,
      reviewEnvelopeIdentity: review.envelopeIdentity,
      findingIdentities: review.findings.map((finding) => finding.findingIdentity),
    },
    `${label}: trusted identities stay exact`,
  );

  const state = focusedRunnerAcceptedState(observed.result);
  assert.deepEqual(state.pending, [], `${label}: pending attempt clears`);
  assert.equal(state.completed.length, 1, `${label}: one completed target`);
  assert.equal(
    state.completed[0].resultHash,
    capture.completion.resultIdentity,
    `${label}: completed result identity`,
  );
  assert.equal(
    state.completed[0].evidenceHash,
    verification.inspectedEvidenceHash,
    `${label}: completed evidence identity`,
  );
  assert.ok(
    observed.result.steps.some((step) => (
      step.step === 'commit-lane-receipt' && step.reason === 'lane-receipt-committed'
    )),
    `${label}: committed lane receipt`,
  );
  assert.match(
    fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'),
    new RegExp(`- \\[x\\] ${TARGET.taskKey}`),
    label,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH]
      .glyphs[TARGET.taskKey],
    'x',
    `${label}: supported final snapshot glyph`,
  );
  assert.deepEqual(
    observed.checkpoint.pair,
    { claim: null, checkpoint: null },
    `${label}: checkpoint cleanup`,
  );
}

/**
 * @param {string} root
 * @param {string} label
 * @param {FocusedTrustedCompletionRun} observed
 * @param {string} outcome
 * @param {RegExp} expectedError
 * @param {{
 *   outcome:string,
 *   operations:string[],
 *   changedTargets:string[],
 *   verificationOutcomes:string[],
 *   reviewVerdict:string,
 * }} validCompanion
 */
function assertFocusedTrustedCompletionRejected(
  root,
  label,
  observed,
  outcome,
  expectedError,
  validCompanion,
) {
  const authorizationRows = observed.result.steps.filter((step) => step.reason === 'authorized');
  const rejectionRows = observed.result.steps.filter((step) => step.outcome === 'closed-refusal');
  const reinspectionRows = observed.result.steps.filter((step) => (
    step.step.endsWith(':reinspect') && step.reason === 'inspection-refreshed'
  ));
  assert.equal(authorizationRows.length, 1, `${label}: one charged authorization`);
  assert.equal(rejectionRows.length, 1, `${label}: one inert preflight rejection`);
  assert.equal(reinspectionRows.length, 1, `${label}: one fresh inspection after rejection`);
  const authorization = authorizationRows[0];
  const rejection = rejectionRows[0];
  const reinspection = reinspectionRows[0];
  assert.equal(rejection.reason, 'malformed-request', `${label}: receiver classifies inert preflight`);

  const acceptedBytes = Buffer.from(authorization.stateBase64, 'base64').toString('utf8');
  const acceptedState = focusedRunnerAcceptedState(authorization);
  assert.equal(acceptedBytes, canonicalJson(acceptedState), `${label}: accepted bytes stay canonical`);
  assert.equal(authorization.stateHash, sha256(acceptedBytes), `${label}: accepted hash binds bytes`);
  assert.equal(authorization.acceptedRevision, 1, `${label}: authorization is the sole accepted revision`);
  assert.equal(acceptedState.overallUsed, 1, `${label}: one attempt remains charged`);
  assert.deepEqual(acceptedState.recoveryUsed, [], `${label}: recovery counter stays empty`);
  assert.equal(acceptedState.pending.length, 1, `${label}: one attempt remains pending`);
  assert.deepEqual(acceptedState.pending[0].target, TARGET, `${label}: pending target stays exact`);
  assert.deepEqual(
    acceptedState.pending[0].materialInputs,
    MATERIAL_INPUTS,
    `${label}: pending material inputs stay exact`,
  );
  assert.deepEqual(acceptedState.completed, [], `${label}: no completion is accepted`);

  assert.throws(
    () => prepareSpecialistResult(acceptedState, observed.specialistResult),
    (error) => {
      assert.ok(error instanceof TypeError, `${label}: preflight returns a typed rejection`);
      assert.match(error.message, expectedError, `${label}: exact preflight rejection`);
      return true;
    },
    `${label}: exact contradiction is rejected by state-bound preflight`,
  );
  const companion = { ...clone(observed.specialistResult), outcome: validCompanion.outcome };
  const prepared = prepareSpecialistResult(acceptedState, companion);
  assert.deepEqual(prepared.result, companion, `${label}: changing only the contradiction is admissible`);
  assert.deepEqual({
    outcome: companion.outcome,
    operations: companion.operations,
    changedTargets: companion.changedTargets,
    verificationOutcomes: companion.verification.checks.map((check) => check.outcome),
    reviewVerdict: companion.review.verdict,
  }, validCompanion, `${label}: every companion input is valid and explicit`);
  assert.equal(
    canonicalJson(observed.specialistResult),
    observed.specialistResultBytes,
    `${label}: rejected raw result stays exact`,
  );
  assert.equal(observed.specialistResult.outcome, outcome, `${label}: rejected outcome stays exact`);

  for (const [stage, row] of [
    ['rejection', rejection],
    ['reinspection', reinspection],
    ['cancellation', observed.result],
  ]) {
    assert.equal(row.stateBase64, authorization.stateBase64, `${label}: ${stage} preserves accepted bytes`);
    assert.equal(row.stateHash, authorization.stateHash, `${label}: ${stage} preserves accepted hash`);
    assert.equal(
      row.acceptedRevision,
      authorization.acceptedRevision,
      `${label}: ${stage} preserves accepted revision`,
    );
    const state = focusedRunnerAcceptedState(row);
    assert.equal(state.overallUsed, acceptedState.overallUsed, `${label}: ${stage} preserves overall counter`);
    assert.deepEqual(
      state.recoveryUsed,
      acceptedState.recoveryUsed,
      `${label}: ${stage} preserves recovery counters`,
    );
    assert.deepEqual(state.pending, acceptedState.pending, `${label}: ${stage} preserves pending attempt`);
    assert.deepEqual(state.completed, [], `${label}: ${stage} accepts no completion`);
  }

  assert.deepEqual(observed.runtimeErrors, [], `${label}: inert preflight throws no runtime error`);
  assert.deepEqual(
    observed.runtimeCalls.filter((call) => call.command === 'complete'),
    [],
    `${label}: completion port is never entered`,
  );
  assert.deepEqual(observed.captures, [], `${label}: no trusted capture is produced`);
  assert.deepEqual(observed.laneApplications, [], `${label}: lane owner is never entered`);
  assert.deepEqual(observed.exchangeKinds, ['specialist-pair'], `${label}: replacement is cancelled`);
  assert.equal(observed.challenges.length, 1, `${label}: one replacement challenge`);
  const challenge = observed.challenges[0];
  assert.equal(challenge.kind, 'specialist-pair', `${label}: exact replacement owner`);
  assert.deepEqual(challenge.target, TARGET, `${label}: replacement target binding`);
  assert.equal(
    challenge.assessmentIdentity,
    sha256(canonicalJson(observed.assessment)),
    `${label}: replacement Assessment binding`,
  );
  assert.equal(challenge.stateBase64, authorization.stateBase64, `${label}: challenge accepted bytes`);
  assert.equal(challenge.stateHash, authorization.stateHash, `${label}: challenge accepted hash`);
  assert.equal(
    challenge.acceptedRevision,
    authorization.acceptedRevision,
    `${label}: challenge accepted revision`,
  );
  assert.match(challenge.attemptIdentity, /^[0-9a-f]{64}$/, `${label}: bound attempt identity`);
  assert.match(challenge.challengeIdentity, /^[0-9a-f]{64}$/, `${label}: opaque challenge identity`);
  const { challengeIdentity, bindingIdentity, ...challengeBody } = challenge;
  assert.equal(
    bindingIdentity,
    sha256(canonicalJson(challengeBody)),
    `${label}: challenge body binding`,
  );
  assert.equal(observed.result.outcome, 'ended', `${label}:${observed.result.reason}`);
  assert.equal(observed.result.reason, 'cancelled', label);
  assert.equal(observed.result.haltReport, null, label);

  const state = focusedRunnerAcceptedState(observed.result);
  assert.deepEqual(state.completed, [], `${label}: rejected target is not completed`);
  assert.equal(state.pending.length, 1, `${label}: authorized attempt remains pending`);
  assert.deepEqual(state.pending[0].target, TARGET, `${label}: exact pending target`);
  assert.deepEqual(
    observed.result.steps.filter((step) => (
      step.step.includes(':completion')
      || step.step.includes(':governance')
      || step.step.includes('projection')
      || ['audit-run', 'authorize-lane-effect', 'apply-lane-effect',
        'commit-lane-receipt', 'final-audit', 'end'].includes(step.step)
      || ['completed', 'task-settled', 'lane-permit-issued',
        'lane-mutation-applied', 'lane-receipt-committed'].includes(step.reason)
    )),
    [],
    `${label}: no completion, projection, receipt, audit, or task close`,
  );
  assert.match(
    fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'),
    new RegExp(`- \\[~\\] ${TARGET.taskKey}`),
    label,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH]
      .glyphs[TARGET.taskKey],
    '~',
    `${label}: pending snapshot glyph`,
  );
  assert.deepEqual(
    feature060Preimages(root),
    observed.preimages,
    `${label}: owner, definition, task, and snapshot preimages stay exact`,
  );
  assert.deepEqual(
    observed.checkpoint.pair,
    { claim: null, checkpoint: null },
    `${label}: cancellation cleans checkpoint ownership`,
  );
}

const FEATURE_029_PACKET_BYTES = 131_072;

/**
 * Recreate the exact model-packet projection only to measure the immediately
 * larger owner suffix beside the real Inspection's other evidence.
 * @param {Record<string, unknown>} inspection
 * @param {Record<string, unknown>[]} [items]
 */
function feature029Packet(inspection, items = /** @type {Record<string, unknown>[]} */ (inspection.items)) {
  const packet = clone(modelPacket(inspection));
  assert.equal(packet.format, 'dude-work-model-view-v1');
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (canonicalJson(item) === canonicalJson(inspection.items[index])) continue;
    assert.ok(['owner-log', 'session'].includes(item.source), 'only literal measurement bodies change');
    const literal = packet.items.find((entry) => entry.frames.some((frame) => (
      frame.occurrences.some((occurrence) => occurrence.source === item.source)
    )));
    assert.equal(literal.tag, 'literal');
    assert.equal(literal.frames.length, 1);
    assert.equal(literal.frames[0].occurrences.length, 1);
    literal.text = item.text;
    literal.frames[0].descriptor = {
      required: item.required,
      status: item.status,
      sha256: item.sha256,
      byteLength: item.byteLength,
    };
  }
  return packet;
}

/** @param {Record<string, unknown>} inspection @param {Record<string, unknown>[]} [items] */
function feature029PacketBytes(inspection, items) {
  return Buffer.byteLength(canonicalJson(feature029Packet(inspection, items)));
}

/** @param {string} root */
function writeFeature029OversizedOwnerLog(root) {
  const eventLines = Array.from({ length: 96 }, (_, index) => (
    `- 2026-08-10 owner event ${String(index + 1).padStart(3, '0')} ${'x'.repeat(1_440)}`
  ));
  const ownerPath = path.join(root, IDEA_PATH);
  fs.writeFileSync(ownerPath, [
    '---',
    'title: Autonomous RunState Continuity',
    'slug: autonomous-runstate-continuity',
    'status: defined',
    `spec_path: ${TARGET.specPath}`,
    '---',
    '',
    '## Idea',
    '',
    'Keep accepted state authoritative.',
    '',
    '## Coordinator Log',
    '',
    ...eventLines,
    '',
  ].join('\n'));
  return {
    ownerPath,
    ownerBytes: fs.readFileSync(ownerPath),
    events: eventLines.map((line) => `${line}\n`),
  };
}

/**
 * @param {Record<string, unknown>} assessment
 * @param {string} label
 * @param {number} checkCount
 */
function feature029SpecialistPair(assessment, label, checkCount) {
  const result = focusedSpecialistPair(assessment, label);
  result.verification.checks = Array.from({ length: checkCount }, (_, index) => ({
    definition: `Feature 029 Tester check ${label} ${String(index + 1).padStart(2, '0')}`,
    outcome: 'passed',
    evidence: `Feature 029 Tester evidence ${label} ${String(index + 1).padStart(2, '0')}`,
  }));
  return result;
}

/** @param {Record<string, unknown>} input */
function feature029CaptureByteLength(input) {
  return ['verification', 'review']
    .flatMap((source) => (
      Array.isArray(input[source])
        ? /** @type {Record<string, unknown>[]} */ (input[source])
        : []
    ))
    .reduce((total, entry) => {
      const bytes = /** @type {Record<string, unknown>} */ (entry.bytes);
      return total + Buffer.from(/** @type {string} */ (bytes.base64), 'base64').byteLength;
    }, 0);
}

/**
 * Run the public runner while observing, but never authoring, the production
 * capture request and its freshly rebuilt Inspection.
 * @param {Record<string, unknown>} request
 * @param {string} label
 */
async function runFeature029Settlement(request, label) {
  /** @type {Record<string, unknown>[]} */
  const observations = [];
  const result = await runHostAdapter(request, {
    checkpoint: memoryCheckpointStore().port,
    runtime: {
      identity: sha256(`feature-029-runtime:${label}`),
      invoke(command, lowLevelRequest) {
        const output = { status: 'returned', value: runCommand(command, lowLevelRequest) };
        const lowLevel = /** @type {Record<string, unknown>} */ (lowLevelRequest);
        const input = lowLevel.input && typeof lowLevel.input === 'object'
          ? /** @type {Record<string, unknown>} */ (lowLevel.input)
          : {};
        const value = /** @type {Record<string, unknown>} */ (output.value);
        if (Object.hasOwn(value, 'inspection')) {
          const verification = Array.isArray(input.verification) ? input.verification : [];
          const review = Array.isArray(input.review) ? input.review : [];
          observations.push({
            command,
            mode: typeof lowLevel.mode === 'string' ? lowLevel.mode : null,
            verificationCount: verification.length,
            reviewCount: review.length,
            captureByteLength: feature029CaptureByteLength(input),
            inspection: clone(value.inspection),
          });
        }
        return output;
      },
    },
  });
  return { result, observations };
}

/**
 * @param {Record<string, unknown>[]} observations
 * @param {string} label
 */
function feature029CapturedInspection(observations, label) {
  const captureIndex = observations.findIndex((row) => (
    row.command === 'complete' && row.mode === 'capture'
  ));
  assert.notEqual(captureIndex, -1, `${label}: production completion capture was observed`);
  const capture = observations[captureIndex];
  assert.equal(capture.verificationCount, 1, `${label}: production Tester capture`);
  assert.equal(capture.reviewCount, 1, `${label}: production Reviewer capture`);
  assert.ok(capture.captureByteLength > 0, `${label}: production captures have bytes`);
  const before = observations.slice(0, captureIndex).find((row) => row.captureByteLength === 0);
  assert.ok(before, `${label}: an Inspection existed before captures`);
  assert.notEqual(
    capture.inspection.evidenceHash,
    before.inspection.evidenceHash,
    `${label}: Inspection was rebuilt after trusted captures`,
  );
  const capturedSources = capture.inspection.items
    .filter((item) => item.status === 'present' && typeof item.text === 'string')
    .map((item) => item.source);
  assert.ok(capturedSources.includes('verification'), `${label}: rebuilt Inspection admits Tester evidence`);
  assert.ok(capturedSources.includes('review'), `${label}: rebuilt Inspection admits Reviewer evidence`);
  return capture;
}

/**
 * @param {Record<string, unknown>} inspection
 * @param {string[]} allEvents
 * @param {string} label
 */
function assertFeature029MaximalSuffix(inspection, allEvents, label) {
  const packet = modelPacket(inspection);
  assert.ok(packet, `${label}: fresh Inspection has a model packet`);
  assert.equal(
    feature029PacketBytes(inspection),
    Buffer.byteLength(canonicalJson(packet)),
    `${label}: test projection matches the production packet`,
  );
  assert.ok(packet.items.length <= inspection.items.length, `${label}: physical items are descriptor-backed`);
  assert.ok(inspection.items.length <= 64, `${label}: original descriptors retain their independent ceiling`);
  assert.ok(
    Buffer.byteLength(canonicalJson(packet)) <= FEATURE_029_PACKET_BYTES,
    `${label}: packet remains within the byte ceiling`,
  );
  const ownerItem = inspection.items.find((item) => item.source === 'owner-log');
  assert.ok(ownerItem && typeof ownerItem.text === 'string', `${label}: owner projection is admitted`);
  const owner = JSON.parse(ownerItem.text);
  const included = /** @type {string[]} */ (owner.events);
  const first = /** @type {number} */ (owner.firstIncludedEventOrdinal);
  assert.equal(owner.totalEventCount, allEvents.length, `${label}: complete event count`);
  assert.ok(first > 1, `${label}: oversized fixture omits an older event`);
  assert.deepEqual(included, allEvents.slice(first - 1), `${label}: selected events are one exact suffix`);

  const expandedEvents = allEvents.slice(first - 2);
  const expandedText = canonicalJson({
    ideaPath: owner.ideaPath,
    specPath: owner.specPath,
    fullLogSha256: owner.fullLogSha256,
    fullLogByteLength: owner.fullLogByteLength,
    totalEventCount: owner.totalEventCount,
    includedEventCount: expandedEvents.length,
    omittedEventCount: first - 2,
    firstIncludedEventOrdinal: first - 1,
    lastIncludedEventOrdinal: owner.totalEventCount,
    events: expandedEvents,
  });
  const expandedOwner = {
    ...ownerItem,
    ...contentDescriptor(expandedText),
    text: expandedText,
  };
  const expandedItems = inspection.items.map((item) => (
    item === ownerItem ? expandedOwner : item
  ));
  assert.ok(
    feature029PacketBytes(inspection, expandedItems) > FEATURE_029_PACKET_BYTES,
    `${label}: adding the immediately preceding whole event crosses the byte ceiling`,
  );
  return owner;
}

nodeTest('Feature 029 rebuilds the owner suffix through actual host-adapter settlement captures', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const owner = writeFeature029OversizedOwnerLog(root);
    const tasksBefore = fs.readFileSync(path.join(root, TASKS_PATH));
    const taskStateBefore = fs.readFileSync(path.join(root, TASK_STATE_PATH));

    const smallRequest = focusedRunnerRequest(root);
    smallRequest.specialistResult = feature029SpecialistPair(smallRequest.assessment, 'small', 1);
    const smallRun = await runFeature029Settlement(smallRequest, 'small');
    assert.equal(smallRun.result.outcome, 'ended', 'the public terminal settlement route is reachable');
    assert.equal(smallRun.result.reason, 'task-settled');
    assert.ok(
      smallRun.result.steps.some((step) => (
        step.step === 'attempt:1:settle-completion' && step.reason === 'completed'
      )),
      'the captured completion reaches the actual settlement step',
    );
    const smallCapture = feature029CapturedInspection(smallRun.observations, 'small');
    const smallOwner = assertFeature029MaximalSuffix(smallCapture.inspection, owner.events, 'small');
    assert.deepEqual(fs.readFileSync(owner.ownerPath), owner.ownerBytes, 'small run leaves the owner byte-identical');

    // Reset only the temporary lane surfaces so the same temporary owner ledger
    // can drive a second, independently settled result pair.
    fs.writeFileSync(path.join(root, TASKS_PATH), tasksBefore);
    fs.writeFileSync(path.join(root, TASK_STATE_PATH), taskStateBefore);

    const largeRequest = focusedRunnerRequest(root);
    largeRequest.specialistResult = feature029SpecialistPair(largeRequest.assessment, 'large', 16);
    const largeRun = await runFeature029Settlement(largeRequest, 'large');
    assert.equal(largeRun.result.outcome, 'ended', 'larger capture set settles through the public route');
    assert.equal(largeRun.result.reason, 'task-settled');
    const largeCapture = feature029CapturedInspection(largeRun.observations, 'large');
    const largeOwner = assertFeature029MaximalSuffix(largeCapture.inspection, owner.events, 'large');

    assert.ok(
      largeCapture.captureByteLength > smallCapture.captureByteLength + 2_000,
      'sixteen Tester checks produce a materially larger actual capture set',
    );
    assert.ok(
      largeOwner.includedEventCount <= smallOwner.includedEventCount,
      'larger captures admit no more owner events',
    );
    assert.ok(
      largeOwner.includedEventCount < smallOwner.includedEventCount,
      'the chosen fixture strictly shrinks the selected suffix',
    );
    assert.deepEqual(fs.readFileSync(owner.ownerPath), owner.ownerBytes, 'both runs leave the owner byte-identical');
  });
});

/**
 * @param {Record<string, unknown>} request
 * @param {(challenge:Record<string, unknown>)=>Record<string, unknown>|null} respond
 * @param {{env?:Record<string,string>,endAfterRequest?:boolean}} [options]
 */
function runFocusedRunnerCli(request, respond, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('./host-adapter-runner.mjs', import.meta.url)),
    ], {
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const rows = [];
    let stdout = '';
    let stderr = '';
    let failed = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      while (stdout.includes('\n')) {
        const index = stdout.indexOf('\n');
        const line = stdout.slice(0, index);
        stdout = stdout.slice(index + 1);
        if (line.length === 0) continue;
        try {
          const row = JSON.parse(line);
          rows.push(row);
          if (row.type === 'input-required') {
            const response = respond(row);
            if (response === null) child.stdin.end();
            else child.stdin.write(`${canonicalJson(response)}\n`);
          } else if (row.type === 'result' && !child.stdin.destroyed) {
            child.stdin.end();
          }
        } catch (error) {
          failed = true;
          child.kill();
          reject(error);
        }
      }
    });
    child.on('error', (error) => {
      failed = true;
      reject(error);
    });
    child.on('close', (code) => {
      if (failed) return;
      if (stdout.length > 0) {
        try {
          rows.push(JSON.parse(stdout));
        } catch (error) {
          reject(error);
          return;
        }
      }
      resolve({ code, rows, stderr });
    });
    child.stdin.write(`${canonicalJson(request)}\n`);
    if (options.endAfterRequest) child.stdin.end();
  });
}

nodeTest('foreground CLI test harness yields between cases so completed output can drain', async (context) => {
  let drained = false;
  let pendingFlush;
  try {
    await context.test('queue a completed-case flush', () => {
      pendingFlush = setImmediate(() => { drained = true; });
    });
    await context.test('start the next synchronous fixture after the flush', () => {
      assert.equal(drained, true, 'a chain of synchronous fixtures must not starve completed-case output');
    });
  } finally {
    if (pendingFlush) clearImmediate(pendingFlush);
  }
});

nodeTest('runner preflight refuses a blank lightweight task before exchange or persistence', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const tasksPath = path.join(root, TASKS_PATH);
    const taskStatePath = path.join(root, TASK_STATE_PATH);
    fs.writeFileSync(
      tasksPath,
      fs.readFileSync(tasksPath, 'utf8').replace(
        `- [~] ${TARGET.taskKey}`,
        `- [ ] ${TARGET.taskKey}`,
      ),
    );
    const taskState = JSON.parse(fs.readFileSync(taskStatePath, 'utf8'));
    taskState[TASKS_PATH].glyphs[TARGET.taskKey] = ' ';
    fs.writeFileSync(taskStatePath, `${JSON.stringify(taskState, null, 2)}\n`);
    const tasksBefore = fs.readFileSync(tasksPath);
    const taskStateBefore = fs.readFileSync(taskStatePath);
    const checkpoint = memoryCheckpointStore();
    let exchangeCalls = 0;

    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: checkpoint.port,
      exchange() {
        exchangeCalls += 1;
        throw new Error('blank task reached specialist exchange');
      },
    });

    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'runner-refused');
    assert.equal(result.detail, 'lane-prestate-mismatch');
    assert.equal(exchangeCalls, 0);
    const tasksAfter = fs.readFileSync(tasksPath);
    assert.deepEqual(tasksAfter, tasksBefore);
    assert.match(tasksAfter.toString('utf8'), new RegExp(`- \\[ \\] ${TARGET.taskKey}`));
    const taskStateAfter = fs.readFileSync(taskStatePath);
    assert.deepEqual(taskStateAfter, taskStateBefore);
    assert.equal(
      JSON.parse(taskStateAfter.toString('utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      ' ',
    );
    assert.equal(tasksAfter.includes('dude-run-event'), false);
    assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 0);
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
  });
});

nodeTest('issue #21: the autonomous runner creates an absent optional snapshot through its first lane mutation', async () => {
  await withSealedWorkspace(async (root) => {
    // Arrange: unlike a corrupt file, no snapshot is a valid semantic `{}` baseline.
    const snapshotPath = path.join(root, TASK_STATE_PATH);
    const tasksBefore = fs.readFileSync(path.join(root, TASKS_PATH));
    const ownerBefore = fs.readFileSync(path.join(root, IDEA_PATH));
    assert.equal(fs.existsSync(snapshotPath), false, 'fixture starts without a snapshot');
    const checkpoint = memoryCheckpointStore();

    // Act.
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: checkpoint.port,
    });

    // Assert: this is the real runner path (admission claim through settlement),
    // not a direct board call with a hand-built postimage.
    assert.equal(result.outcome, 'ended', result.reason);
    assert.equal(result.reason, 'task-settled');
    assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 1, 'runner ownership claim');
    assert.equal(checkpoint.pair.checkpoint, null, 'settlement clears runner ownership');
    for (const step of ['admitted', 'authorize-lane-effect', 'apply-lane-effect', 'commit-lane-receipt', 'end']) {
      assert.ok(result.steps.some((row) => row.step === step), `runner reaches ${step}`);
    }
    assert.ok(fs.existsSync(snapshotPath), 'first authorized lane mutation creates the optional snapshot');
    assert.equal(
      JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      'x',
      'settled snapshot binds the final target glyph',
    );
    assert.equal(fs.readFileSync(path.join(root, TASKS_PATH)).equals(tasksBefore), false, 'task reaches close');
    assert.deepEqual(fs.readFileSync(path.join(root, IDEA_PATH)), ownerBefore, 'unmodified owner stays exact');
  });
});

for (const outcome of /** @type {const} */ (['succeeded', 'no-change'])) {
  nodeTest(`runner trusted completion outcomes: ${outcome} with trusted evidence settles without replacement exchange`, async () => {
    await withSealedWorkspace(async (root) => {
      const observed = await runFocusedTrustedCompletion(root, outcome, (assessment) => ({
        ...focusedSpecialistPair(assessment, outcome),
        outcome,
      }));
      assertFocusedTrustedCompletionSettled(root, outcome, observed, outcome);
    });
  });
}

/**
 * @type {{
 *   label:string,
 *   outcome:string,
 *   makeResult:(assessment:Record<string, unknown>)=>Record<string, unknown>,
 *   expectedError:RegExp,
 *   validCompanion:{
 *     outcome:string,
 *     operations:string[],
 *     changedTargets:string[],
 *     verificationOutcomes:string[],
 *     reviewVerdict:string,
 *   },
 * }[]}
 */
const rejectedTrustedCompletionCases = [
  {
    label: 'no-change with an authorized changed file',
    outcome: 'no-change',
    makeResult: (assessment) => ({
      ...focusedSpecialistPair(assessment, 'changed-file'),
      changedTargets: [MATERIAL_INPUTS.targets[0]],
    }),
    expectedError: /^completion v2 does not match the exact pending action and result route$/,
    validCompanion: {
      outcome: 'succeeded',
      operations: [...MATERIAL_INPUTS.operations],
      changedTargets: [MATERIAL_INPUTS.targets[0]],
      verificationOutcomes: ['passed'],
      reviewVerdict: 'accepted',
    },
  },
  {
    label: 'no-change with failed verification',
    outcome: 'no-change',
    makeResult: (assessment) => focusedFailedSpecialistPair(assessment, 'failed-verification'),
    expectedError: /^completion v2 outcome must be failed for failed verification$/,
    validCompanion: {
      outcome: 'failed',
      operations: [...MATERIAL_INPUTS.operations],
      changedTargets: [],
      verificationOutcomes: ['failed'],
      reviewVerdict: 'accepted',
    },
  },
  {
    label: 'no-change with rejected review',
    outcome: 'no-change',
    makeResult: (assessment) => focusedSpecialistPair(assessment, 'rejected-review', 'rejected'),
    expectedError: /^completion v2 outcome must be blocked for rejected review$/,
    validCompanion: {
      outcome: 'blocked',
      operations: [...MATERIAL_INPUTS.operations],
      changedTargets: [],
      verificationOutcomes: ['passed'],
      reviewVerdict: 'rejected',
    },
  },
  {
    label: 'blocked with passed verification and accepted review',
    outcome: 'blocked',
    makeResult: (assessment) => focusedSpecialistPair(assessment, 'trusted-success'),
    expectedError: /^completion v2 outcome must be succeeded(?: or no-change)? for accepted trusted evidence$/,
    validCompanion: {
      outcome: 'succeeded',
      operations: [...MATERIAL_INPUTS.operations],
      changedTargets: [],
      verificationOutcomes: ['passed'],
      reviewVerdict: 'accepted',
    },
  },
];

for (const {
  label, outcome, makeResult, expectedError, validCompanion,
} of rejectedTrustedCompletionCases) {
  nodeTest(`runner trusted completion outcomes: ${label} is rejected by state-bound preflight before effects`, async () => {
    await withSealedWorkspace(async (root) => {
      const observed = await runFocusedTrustedCompletion(root, label.replaceAll(' ', '-'), (assessment) => ({
        ...makeResult(assessment),
        outcome,
      }));
      assertFocusedTrustedCompletionRejected(
        root,
        label,
        observed,
        outcome,
        expectedError,
        validCompanion,
      );
    });
  });
}

nodeTest('issue #21: an unsafe snapshot halts autonomously with an actionable existing evidence reason', async () => {
  await withSealedWorkspace(async (root) => {
    // Arrange.
    writeSealedTaskState(root);
    const snapshotPath = path.join(root, TASK_STATE_PATH);
    const unsafeSnapshot = Buffer.from('{ malformed task-state snapshot\n');
    fs.writeFileSync(snapshotPath, unsafeSnapshot);
    const tasksBefore = fs.readFileSync(path.join(root, TASKS_PATH));
    const ownerBefore = fs.readFileSync(path.join(root, IDEA_PATH));

    // Act.
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: memoryCheckpointStore().port,
    });

    // Assert: snapshot corruption is evidence-incomplete, not a new opaque
    // runner reason. Its carried blocker identifies the exact unsafe authority
    // surface and the existing hard-stop action tells the owner what to do.
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.equal(OUTCOME_REASON_CLASSES[result.reason], 'hard-stop');
    assert.ok(result.haltReport && typeof result.haltReport === 'object', 'hard stop carries a halt report');
    const report = /** @type {Record<string, unknown>} */ (result.haltReport);
    assert.deepEqual(Object.keys(report).sort(), [
      'evidenceHash', 'halted', 'nextAction', 'reason', 'resolved', 'stopClass', 'subject', 'target',
    ]);
    assert.equal(report.halted, true);
    assert.equal(report.resolved, true);
    assert.equal(report.reason, 'evidence-incomplete');
    assert.equal(report.stopClass, 'hard-stop');
    assert.deepEqual(report.target, TARGET);
    assert.equal(report.subject, TASK_STATE_PATH);
    assert.equal(report.nextAction, 'request-human-input');
    assert.match(report.evidenceHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(fs.readFileSync(path.join(root, TASKS_PATH)), tasksBefore, 'tasks stay exact');
    assert.deepEqual(fs.readFileSync(path.join(root, IDEA_PATH)), ownerBefore, 'owner stays exact');
    assert.deepEqual(fs.readFileSync(snapshotPath), unsafeSnapshot, 'unsafe snapshot bytes stay exact');
  });
});

for (const rejection of ['invalid', 'stale']) {
  nodeTest(`056 owner finalization runner clears a matched first ${rejection} payload and preserves prior accounting`, async () => {
    await withSealedWorkspace(async (root) => {
      writeSealedTaskState(root);
      const beforeFiles = laneSurfaceDigests(root);
      const state = emptyState('autonomous');
      state.overallUsed = 2;
      state.recoveryUsed = [{ targetKey: targetKey(SECOND_TARGET), targetHash: targetHash(SECOND_TARGET), count: 1 }];
      state.completed = [1, 2].map(ordinal => ({
        evidenceHash: sha256(`056 prior evidence ${ordinal}`),
        approachHash: sha256(`056 prior approach ${ordinal}`),
        resultHash: sha256(`056 prior result ${ordinal}`),
      }));
      validateRunState(state);
      const request = focusedRunnerRequest(root, { state, assessment: { invalid: '056 invalid initial input' } });
      const store = createTemporaryCheckpointStore({ root });
      const calls = [];
      const runtimeCalls = [];
      const challenges = [];
      let retainedPair;
      const checkpoint = {
        ...store,
        claim(...args) { calls.push('claim'); return store.claim(...args); },
        clear(...args) {
          calls.push('clear');
          assert.equal(args[3], 'hard-stop-recorded');
          return store.clear(...args);
        },
      };
      const result = await runHostAdapter(request, {
        checkpoint,
        runtime: {
          identity: sha256('056 first rejection runtime'),
          invoke(command, input) {
            runtimeCalls.push(command);
            return { status: 'returned', value: runCommand(command, input) };
          },
        },
        laneOwner: {
          identity: sha256('056 forbidden lane owner'),
          apply() { assert.fail('payload rejection must never enter the lane writer'); },
        },
        exchange(challenge) {
          challenges.push(challenge);
          assert.equal(challenge.kind, 'assessment');
          assert.equal(challenges.length, 1, 'no prompt, correction challenge, or specialist dispatch');
          retainedPair = fs.readdirSync(artifactDirectory(root))
            .map(name => JSON.parse(fs.readFileSync(path.join(artifactDirectory(root), name), 'utf8')));
          return focusedChallengeResponse(challenge, 'assessment', rejection === 'stale'
            ? focusedChallengeAssessment(challenge, { evidenceHash: sha256('056 stale payload secret') })
            : { secret: '056 invalid payload secret', path: 'C:\\private\\056-secret' });
        },
      });
      assert.equal(result.outcome, 'hard-stop');
      assert.equal(result.reason, `challenge-response-${rejection}`);
      assert.equal(result.detail, rejection === 'stale' ? 'assessment' : 'Assessment: invalid-contract');
      assert.deepEqual(result.haltReport, describeUnattendedHalt({ state, reason: result.reason }, null));
      assert.equal(result.cleanup, 'cleared');
      assert.equal(result.orphan, false);
      assert.deepEqual(calls, ['claim', 'clear']);
      assert.deepEqual(runtimeCalls, ['inspect', 'inspect']);
      assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
      assert.equal(result.stateBase64, Buffer.from(canonicalJson(state)).toString('base64'));
      assert.equal(result.stateHash, sha256(canonicalJson(state)));
      assert.equal(result.acceptedRevision, 0);
      assert.equal(result.hostRevision, challenges[0].hostRevision + 1, 'report the real end revision');
      assert.deepEqual(laneSurfaceDigests(root), beforeFiles);
      assert.equal(result.steps.filter(step => step.outcome === 'hard-stop').length, 1);
      assert.equal(result.steps.at(-1).reason, result.reason, 'the retained Work stop is not replaced by resource end');
      assert.equal(result.steps.at(-1).stateBase64, result.stateBase64);
      const emitted = canonicalJson(result);
      for (const secret of [
        '056 invalid initial input', '056 invalid payload secret', '056-secret',
        sha256('056 stale payload secret'),
        ...retainedPair.flatMap(record => [record.invocationIdentity, record.workerToken, record.claimHash, record.recordHash])
          .filter(value => value !== undefined),
      ]) assert.equal(emitted.includes(secret), false, 'private and rejected data stay out of diagnostics');
    });
  });
}

/** @param {string} root */
function ownerFinalizationStore(root) {
  const store = createTemporaryCheckpointStore({ root });
  const calls = [];
  const port = { ...store };
  for (const operation of ['claim', 'load', 'update', 'handoff', 'clear']) {
    port[operation] = (...args) => {
      calls.push(operation);
      return store[operation](...args);
    };
  }
  return { store, port, calls };
}

/** @param {Record<string, unknown>} result @param {Record<string, unknown>} state */
function assertOwnerFinalizationStop(result, state) {
  assert.equal(result.outcome, 'hard-stop');
  assert.equal(result.reason, 'challenge-response-invalid');
  assert.equal(result.detail, 'Assessment: invalid-contract');
  assert.deepEqual(result.haltReport, describeUnattendedHalt({ state, reason: result.reason }, null));
  assert.equal(result.stateBase64, Buffer.from(canonicalJson(state)).toString('base64'));
  assert.equal(result.stateHash, sha256(canonicalJson(state)));
  assert.equal(result.steps.filter(step => step.outcome === 'hard-stop').length, 1);
  assert.equal(result.steps.at(-1).reason, result.reason);
}

nodeTest('056 owner finalization runner refuses lost supervisor and worker authority inside end', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs', true);
  for (const [fault, reason] of [
    ['missing supervisor', 'supervisor-identity-missing'],
    ['wrong supervisor identity', 'supervisor-identity-mismatch'],
    ['wrong supervisor capability', 'supervisor-identity-mismatch'],
    ['missing worker', 'supervisor-identity-mismatch'],
    ['wrong worker token', 'stale-worker'],
    ['wrong worker generation', 'stale-worker'],
  ]) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      let challengeRevision;
      let pairBefore;
      const result = await module.runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          challengeRevision = challenge.hostRevision;
          const supervisor = module.testOwnerContext.ports.supervisorSession;
          const session = module.testOwnerContext.adapter.snapshot();
          const workers = module.testAdapterModule.testAdmittedInvocations;
          if (fault === 'missing supervisor') delete supervisor.admit;
          if (fault === 'wrong supervisor identity') supervisor.identity = sha256('056 foreign supervisor');
          if (fault === 'wrong supervisor capability') supervisor.admit = () => assert.fail('no readmission');
          if (fault === 'missing worker') workers.delete(session.invocationIdentity);
          if (fault === 'wrong worker token' || fault === 'wrong worker generation') {
            workers.set(session.invocationIdentity, {
              workerToken: fault === 'wrong worker token' ? sha256('056 foreign worker') : session.workerToken,
              workerGeneration: session.workerGeneration + (fault === 'wrong worker generation' ? 1 : 0),
            });
          }
          pairBefore = fs.readdirSync(artifactDirectory(root)).map(name => [
            name, fs.readFileSync(path.join(artifactDirectory(root), name), 'utf8'),
          ]);
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assertOwnerFinalizationStop(result, request.state);
      assert.equal(result.cleanup, 'not-attempted', fault);
      assert.equal(result.cleanupReason, reason, fault);
      assert.equal(result.hostRevision, challengeRevision + 1, 'the adapter rejected the end, not a runner guess');
      assert.equal(result.orphan, true);
      assert.equal(checkpoint.calls.includes('clear'), false);
      assert.deepEqual(fs.readdirSync(artifactDirectory(root)).map(name => [
        name, fs.readFileSync(path.join(artifactDirectory(root), name), 'utf8'),
      ]), pairBefore);
    });
  }
});

nodeTest('056 owner finalization runner refuses returned-state-only context and accepted authority drift', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs', true);
  for (const fault of ['missing adapter', 'returned state only', 'replaced handle', 'accepted bytes', 'accepted revision', 'worker identity']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      let expectedState = request.state;
      const result = await module.runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          const owner = module.testOwnerContext;
          const context = module.testAdapterModule.testOwnerContext;
          const session = clone(owner.adapter.snapshot());
          if (fault === 'missing adapter') owner.replaceAdapter(null);
          else if (fault === 'returned state only') {
            owner.replaceAdapter({ snapshot: () => session, ownership: () => null });
          } else if (fault === 'replaced handle') {
            owner.replaceAdapter({ ...owner.adapter });
          } else {
            if (fault === 'accepted bytes') {
              session.acceptedState.policy.overall += 1;
              session.acceptedStateBytes = canonicalJson(session.acceptedState);
              session.acceptedStateHash = sha256(session.acceptedStateBytes);
              expectedState = session.acceptedState;
            }
            if (fault === 'worker identity') session.workerToken = sha256('056 substituted live worker');
            else {
              session.acceptedRevision += 1;
              session.hostRevision += 1;
            }
            context.replaceSession(reidentifySession(session));
            if (fault !== 'worker identity') {
              assert.equal(context.host.settle(context.session), null, 'the changed accepted state is valid and checkpointed');
            }
          }
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assertOwnerFinalizationStop(result, expectedState);
      assert.equal(result.cleanup, 'not-attempted', fault);
      assert.equal(result.cleanupReason, fault.startsWith('accepted') ? 'accepted-state-changed' : 'owner-context-changed', fault);
      assert.equal(checkpoint.calls.includes('clear'), false);
      assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
      assert.equal(result.steps.some(step => step.step.includes('authorize')), false);
    });
  }
});

nodeTest('056 owner finalization runner reacquires exact owner workspace mapping and lane prestate', async () => {
  for (const fault of ['owner bytes', 'owner resolution', 'task prestate', 'task mapping', 'lane bytes', 'workspace']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      const alias = path.join(root, 'workspace-alias');
      if (fault === 'workspace') {
        fs.symlinkSync(root, alias, 'junction');
        request.root = alias;
      }
      let afterDrift;
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          if (fault === 'owner bytes') fs.appendFileSync(path.join(root, IDEA_PATH), '\n056 owner edit\n');
          if (fault === 'owner resolution') {
            const file = path.join(root, IDEA_PATH);
            fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: defined', 'status: captured'));
          }
          if (fault === 'task prestate' || fault === 'task mapping') {
            const file = path.join(root, TASKS_PATH);
            fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(
              fault === 'task prestate' ? '[~]' : TARGET.taskKey,
              fault === 'task prestate' ? '[x]' : SECOND_TARGET.taskKey,
            ));
          }
          if (fault === 'lane bytes') fs.appendFileSync(path.join(root, TASK_STATE_PATH), '\n');
          if (fault === 'workspace') {
            const replacement = path.join(root, 'replacement-workspace');
            fs.mkdirSync(replacement);
            fs.rmSync(alias);
            fs.symlinkSync(replacement, alias, 'junction');
          }
          afterDrift = laneSurfaceDigests(root);
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assertOwnerFinalizationStop(result, request.state);
      assert.equal(result.cleanup, 'not-attempted', fault);
      assert.equal(result.cleanupReason, ['owner resolution', 'task mapping'].includes(fault)
        ? 'owner-binding-unavailable' : 'owner-binding-changed', fault);
      assert.equal(checkpoint.calls.includes('clear'), false);
      assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
      assert.deepEqual(laneSurfaceDigests(root), afterDrift, 'finalization never repairs the changed binding');
    });
  }
});

for (const kind of ['claim', 'checkpoint']) {
  nodeTest(`056 owner finalization runner consumes retained ${kind} comparison before clear`, async () => {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      let changedBytes;
      let changedPath;
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          const name = fs.readdirSync(artifactDirectory(root)).find(entry => entry.endsWith(`.${kind}`));
          const key = name.slice(0, -`.${kind}`.length);
          if (kind === 'claim') rewriteCheckpointClaim(root, key, claim => { claim.createdAt = '2000-01-01T00:00:00.000Z'; });
          else rewriteCheckpointRecord(root, key, record => { record.inspectionIdentity = sha256('056 changed stored inspection'); });
          changedPath = path.join(artifactDirectory(root), name);
          changedBytes = fs.readFileSync(changedPath, 'utf8');
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assertOwnerFinalizationStop(result, request.state);
      assert.equal(result.cleanup, 'not-attempted');
      assert.equal(result.cleanupReason, 'checkpoint-drift');
      assert.equal(checkpoint.calls.includes('clear'), false, 'the retained adapter compares before calling clear');
      assert.equal(fs.readFileSync(changedPath, 'utf8'), changedBytes);
      assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
    });
  });
}

nodeTest('056 owner finalization runner refuses pending attempts completions and evaluations', async () => {
  for (const obligation of ['attempt', 'completion', 'evaluation']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      let state = pendingState('autonomous');
      if (obligation === 'completion') {
        const fixture = sealedTrustedFixture(state, '056 pending completion', 'accepted');
        const captured = captureAdapter(state, fixture, root);
        assert.equal(captured.captured.outcome, 'effect-required');
        state = captured.captured.session.pendingEffect.provisionalState;
      }
      if (obligation === 'evaluation') {
        state = emptyState('autonomous');
        const sequence = {
          target: canonicalTarget(TARGET),
          taskKey: TARGET.taskKey,
          ownerBindingHash: sha256('056 evaluation owner'),
          planDescriptor: contentDescriptor('# Plan\n'),
          registryHash: sha256('056 registry'),
          contractHash: sha256('056 contract'),
          bindingIdentity: sha256('056 evaluation binding'),
          baselineCandidateIdentity: sha256('056 baseline'),
          incumbentCandidateIdentity: sha256('056 incumbent'),
          state: 'open',
          recentComparisons: [],
        };
        state.evaluationSequences = [{ ...sequence, sequenceIdentity: deriveSequenceIdentity(sequence) }];
      }
      validateRunState(state);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null, state });
      let challenges = 0;
      const before = laneSurfaceDigests(root);
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          challenges += 1;
          assert.equal(challenge.kind, 'assessment');
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assertOwnerFinalizationStop(result, state);
      assert.equal(challenges, 1, obligation);
      assert.equal(result.cleanup, 'not-attempted', obligation);
      assert.equal(result.cleanupReason, 'owner-obligations-pending', obligation);
      assert.equal(checkpoint.calls.includes('clear'), false);
      assert.deepEqual(laneSurfaceDigests(root), before);
    });
  }
});

nodeTest('056 owner finalization runner refuses a valid pending learning alternative', async () => {
  await withSealedWorkspace(async root => {
    const required = requiredGovernanceFixture(root);
    const branch = projectedGovernanceBranch(root, required, 'selected-alternative');
    const state = inspectedGovernanceBranch(root, branch, required);
    const input = sealedRetentionInput(root, branch.learnedEvents, branch.learnedEvents, required.streams);
    writeSealedTaskState(root);
    const checkpoint = ownerFinalizationStore(root);
    const before = laneSurfaceDigests(root);
    const request = focusedRunnerRequest(root, {
      assessment: null, state,
      retainedEvidence: Object.fromEntries(['currentRun', 'verification', 'review', 'lint'].map(field => [field, input[field]])),
    });
    let challenges = 0;
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      exchange(challenge) {
        challenges += 1;
        assert.equal(challenge.kind, 'assessment', 'the alternative is already inspected, not a learning-review request');
        return focusedChallengeResponse(challenge, 'assessment', {});
      },
    });
    assertOwnerFinalizationStop(result, state);
    assert.equal(challenges, 1);
    assert.equal(result.cleanupReason, 'owner-obligations-pending');
    assert.equal(checkpoint.calls.includes('clear'), false);
    assert.deepEqual(laneSurfaceDigests(root), before);
  });
});

nodeTest('056 owner finalization runner refuses an unsettled checkpoint at the actual end boundary', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs', true);
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const checkpoint = ownerFinalizationStore(root);
    const request = focusedRunnerRequest(root, { assessment: null });
    const result = await module.runHostAdapter(request, {
      checkpoint: checkpoint.port,
      exchange(challenge) {
        const context = module.testAdapterModule.testOwnerContext;
        const session = clone(context.session);
        session.hostRevision += 1;
        context.replaceSession(reidentifySession(session));
        assert.equal(context.host.commit(context.session, {
          semanticOperation: 'authorize-attempt',
          expectedEffectIdentity: null,
          expectedReceiptIdentity: null,
          provisionalStateHash: null,
        }), null, 'the retained checkpoint and its hash are current, but its operation is unfinished');
        return focusedChallengeResponse(challenge, 'assessment', {});
      },
    });
    assertOwnerFinalizationStop(result, request.state);
    assert.equal(result.cleanup, 'not-attempted');
    assert.equal(result.cleanupReason, 'effect-unverified');
    assert.equal(checkpoint.calls.includes('clear'), false);
    assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
  });
});

nodeTest('056 owner finalization runner refuses a valid pending effect without accepted-state drift', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs', true);
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const pending = pendingState('autonomous');
    const fixture = sealedTrustedFixture(pending, '056 unverified effect', 'accepted');
    const captured = captureAdapter(pending, fixture, root).captured;
    assert.equal(captured.outcome, 'effect-required');
    const checkpoint = ownerFinalizationStore(root);
    const request = focusedRunnerRequest(root, { assessment: null });
    const result = await module.runHostAdapter(request, {
      checkpoint: checkpoint.port,
      exchange(challenge) {
        const context = module.testAdapterModule.testOwnerContext;
        const session = clone(context.session);
        const effect = {
          ...clone(captured.session.pendingEffect),
          predecessorStateHash: session.acceptedStateHash,
          predecessorAcceptedRevision: session.acceptedRevision,
        };
        const { effectIdentity: _identity, ...body } = effect;
        session.pendingEffect = { ...body, effectIdentity: sha256(canonicalJson(body)) };
        context.replaceSession(reidentifySession(session));
        assert.equal(context.session.acceptedState.pending.length, 0, 'no pending attempt masks the effect guard');
        assert.equal(context.session.acceptedStateBytes, canonicalJson(request.state));
        return focusedChallengeResponse(challenge, 'assessment', {});
      },
    });
    assertOwnerFinalizationStop(result, request.state);
    assert.equal(result.cleanup, 'not-attempted');
    assert.equal(result.cleanupReason, 'owner-obligations-pending');
    assert.equal(checkpoint.calls.includes('clear'), false);
  });
});

nodeTest('056 owner finalization runner checks operation entry independently of unchanged accounting', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs', true);
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const checkpoint = ownerFinalizationStore(root);
    const request = focusedRunnerRequest(root, { assessment: null });
    let authorizationCalls = 0;
    const result = await module.runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('056 unchanged authorization refusal'),
        invoke(command, input) {
          if (command === 'authorize') {
            authorizationCalls += 1;
            return { status: 'empty' };
          }
          return { status: 'returned', value: runCommand(command, input) };
        },
      },
      exchange(challenge) {
        const owner = module.testOwnerContext;
        const before = owner.adapter.snapshot();
        const refused = owner.run('attempt:1:authorize-attempt', 'authorize-attempt', {
          authorization: {
            input: sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' })),
            assessment: focusedChallengeAssessment(challenge),
          },
        });
        assert.equal(refused.outcome, 'closed-refusal');
        assert.equal(owner.refreshInspection('attempt:1:fresh-inspection').terminal, null);
        const after = owner.adapter.snapshot();
        assert.deepEqual(acceptedAuthorityTuple(after), acceptedAuthorityTuple(before));
        assert.equal(after.correction, null, 'a pending correction must not mask the step-provenance guard');
        return focusedChallengeResponse(challenge, 'assessment', {});
      },
    });
    assertOwnerFinalizationStop(result, request.state);
    assert.equal(authorizationCalls, 1);
    assert.equal(result.cleanup, 'not-attempted');
    assert.equal(result.cleanupReason, 'claim-phase-changed');
    assert.equal(checkpoint.calls.includes('clear'), false);
  });
});

nodeTest('056 owner finalization runner refuses release when terminal state validation is unavailable', async context => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const checkpoint = ownerFinalizationStore(root);
    const request = focusedRunnerRequest(root, { assessment: null });
    const stateBase64 = Buffer.from(canonicalJson(request.state)).toString('base64');
    const from = Buffer.from;
    let decoding;
    let refusedDecodes = 0;
    let result;
    try {
      result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          decoding = context.mock.method(Buffer, 'from', (value, encoding, length) => {
            if (value === stateBase64 && encoding === 'base64') {
              refusedDecodes += 1;
              throw new TypeError('056 private terminal decoding error');
            }
            return from(value, encoding, length);
          });
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
    } finally {
      decoding?.mock.restore();
    }
    assert.equal(refusedDecodes, 1, 'only terminal report validation was faulted');
    assert.equal(result.reason, 'challenge-response-invalid');
    assert.equal(result.detail, 'Assessment: invalid-contract');
    assert.equal(result.cleanup, 'not-attempted');
    assert.equal(result.cleanupReason, 'terminal-report-unavailable');
    assert.equal(result.stateBase64, stateBase64);
    assert.equal(result.stateHash, sha256(canonicalJson(request.state)));
    assert.deepEqual(result.haltReport, { halted: true, resolved: false, unresolved: ['reason', 'subject'] });
    assert.equal(checkpoint.calls.includes('clear'), false);
    assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
    assert.equal(canonicalJson(result).includes('056 private'), false);
  });
});

nodeTest('056 owner finalization runner preserves framing missing-exchange and transport refusals', async () => {
  for (const fault of ['malformed', 'foreign', 'order', 'missing exchange', 'missing response', 'EOF', 'transport invalid', 'unknown exception', 'replay']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      let firstResponse;
      let calls = 0;
      const exchange = challenge => {
        calls += 1;
        const valid = focusedChallengeResponse(challenge, 'assessment', focusedChallengeAssessment(challenge));
        if (fault === 'malformed') return { ...valid, secret: '056 malformed envelope secret' };
        if (fault === 'foreign') return { ...valid, challengeIdentity: sha256('056 foreign response') };
        if (fault === 'order') return focusedChallengeResponse(
          { ...challenge, kind: 'specialist-pair' }, 'specialistResult', specialistResult('056 out of order', 'accepted'),
        );
        if (fault === 'missing response') return null;
        if (fault === 'EOF') throw Object.assign(new Error('056 EOF secret'), { code: 'supervisor-context-lost' });
        if (fault === 'transport invalid') {
          throw Object.assign(new Error('056 parser secret'), { code: 'challenge-response-invalid' });
        }
        if (fault === 'unknown exception') throw Object.assign(new Error('056 unknown secret'), { code: 'caller-secret' });
        if (calls === 1) { firstResponse = valid; return valid; }
        return {
          ...focusedChallengeResponse(challenge, 'specialistResult', specialistResult('056 replay', 'accepted')),
          challengeIdentity: firstResponse.challengeIdentity,
        };
      };
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        ...(fault === 'missing exchange' ? {} : { exchange }),
      });
      assert.equal(result.outcome, 'hard-stop', fault);
      assert.equal(result.reason, {
        malformed: 'challenge-response-invalid', foreign: 'challenge-response-foreign',
        order: 'challenge-response-out-of-order', 'missing exchange': 'exchange-unavailable',
        'missing response': 'exchange-context-lost', EOF: 'supervisor-context-lost',
        'transport invalid': 'challenge-response-invalid', 'unknown exception': 'exchange-context-lost',
        replay: 'challenge-response-replayed',
      }[fault], fault);
      assert.equal(result.cleanup, 'not-attempted', fault);
      assert.equal(Object.hasOwn(result, 'cleanupReason'), false, 'these branches never nominate the new finalizer');
      assert.equal(checkpoint.calls.includes('clear'), false);
      assert.equal(checkpoint.calls.filter(call => call === 'claim').length, 1);
      assert.equal(fs.readdirSync(artifactDirectory(root)).length, 2);
      assert.equal(calls, fault === 'missing exchange' ? 0 : fault === 'replay' ? 2 : 1);
      assert.equal(canonicalJson(result).includes('secret'), false);
    });
  }
});

nodeTest('056 owner finalization runner leaves authorization correction later Assessment specialist and governance failures on their old routes', async () => {
  for (const phase of ['authorization correction', 'later assessment', 'specialist', 'governance']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root);
      if (phase !== 'authorization correction') request.assessment = null;
      let assessments = 0;
      let authorizationCalls = 0;
      let assessment;
      let beforeRejection;
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        runtime: {
          identity: sha256(`056 later ${phase}`),
          invoke(command, input) {
            if (command === 'authorize') {
              authorizationCalls += 1;
              if (phase === 'authorization correction') return { status: 'empty' };
            }
            return { status: 'returned', value: runCommand(command, input) };
          },
        },
        exchange(challenge) {
          if (challenge.kind === 'assessment') {
            assessments += 1;
            if (phase === 'authorization correction' || (phase === 'later assessment' && assessments === 2)) {
              beforeRejection = laneSurfaceDigests(root);
              return focusedChallengeResponse(challenge, 'assessment', {});
            }
            assessment = focusedChallengeAssessment(challenge, assessments === 1 ? {} : {
              action: 'retry-task',
              materialInputs: { ...clone(MATERIAL_INPUTS), operations: ['retry-task'] },
            });
            return focusedChallengeResponse(challenge, 'assessment', assessment);
          }
          if (challenge.kind === 'specialist-pair') {
            if (phase === 'specialist') {
              beforeRejection = laneSurfaceDigests(root);
              throw Object.assign(new Error('056 late specialist secret'), { code: 'challenge-response-invalid' });
            }
            return focusedChallengeResponse(challenge, 'specialistResult',
              focusedSpecialistPair(assessment, '056 repeated rejection', 'rejected'));
          }
          assert.equal(challenge.kind, 'learning-review');
          beforeRejection = laneSurfaceDigests(root);
          return focusedChallengeResponse(challenge, 'review', {});
        },
      });
      assert.equal(result.outcome, 'hard-stop', phase);
      assert.equal(result.reason, 'challenge-response-invalid', phase);
      if (phase === 'governance') assert.equal(result.detail, 'learning-review');
      assert.equal(result.cleanup, 'not-attempted', phase);
      assert.equal(Object.hasOwn(result, 'cleanupReason'), false);
      assert.equal(checkpoint.calls.includes('clear'), false);
      assert.deepEqual(laneSurfaceDigests(root), beforeRejection, phase);
      if (phase === 'authorization correction') {
        assert.equal(assessments, 1, 'even the first exchange is ineligible after authorization entry');
        assert.equal(authorizationCalls, 2, 'the existing correction was consumed before reinspecting');
        assert.equal(result.stateHash, sha256(canonicalJson(request.state)), 'no counters changed on either request');
      }
    });
  }
});

for (const fault of ['checkpoint removal', 'claim removal', 'absence check', 'final absence check', 'reappearance', 'throwing clear', 'failed clear']) {
  nodeTest(`056 owner finalization runner retains the Work stop across ${fault} failure without retry`, async context => {
    const module = await workModuleWithObservation('host-adapter-runner.mjs', true);
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      const before = laneSurfaceDigests(root);
      const removals = [];
      let paths;
      let checkpointBytes;
      let clearCalls = 0;
      let removedCheckpoint = false;
      let removedClaim = false;
      let injected = false;
      let retainedTerminal;
      const result = await module.runHostAdapter(request, {
        checkpoint: {
          ...checkpoint.port,
          clear(...args) {
            clearCalls += 1;
            retainedTerminal = clone(module.testTerminal);
            assertOwnerFinalizationStop(retainedTerminal, request.state);
            assert.equal(retainedTerminal.cleanup, 'not-attempted', 'the complete terminal report exists before release');
            const original = { remove: fs.rmSync, stat: fs.lstatSync };
            const mocks = [
              context.mock.method(fs, 'rmSync', (file, options) => {
                assert.ok(Object.values(paths).includes(file));
                const kind = file === paths.checkpoint ? 'checkpoint' : 'claim';
                removals.push(kind);
                if (fault === `${kind} removal`) {
                  injected = true;
                  throw new Error('056 private removal error');
                }
                original.remove(file, options);
                if (kind === 'checkpoint') {
                  removedCheckpoint = true;
                  if (fault === 'reappearance') {
                    injected = true;
                    fs.writeFileSync(paths.checkpoint, checkpointBytes);
                  }
                } else removedClaim = true;
              }),
              context.mock.method(fs, 'lstatSync', (file, options) => {
                if (fault === 'absence check' && file === paths.checkpoint && removedCheckpoint) {
                  injected = true;
                  throw new Error('056 private absence error');
                }
                if (fault === 'final absence check' && file === paths.claim && removedClaim) {
                  injected = true;
                  throw new Error('056 private final absence error');
                }
                return original.stat(file, options);
              }),
            ];
            try {
              if (fault === 'throwing clear') {
                injected = true;
                throw new Error('056 private clear exception');
              }
              if (fault === 'failed clear') {
                injected = true;
                return { version: 1, status: 'failed', checkpointKey: checkpoint.store.load(args[0]).checkpointKey, reason: '056 private backend error' };
              }
              return checkpoint.port.clear(...args);
            } finally {
              for (const mocked of mocks.reverse()) mocked.mock.restore();
            }
          },
        },
        exchange(challenge) {
          paths = Object.fromEntries(fs.readdirSync(artifactDirectory(root)).map(name => [
            name.endsWith('.claim') ? 'claim' : 'checkpoint', path.join(artifactDirectory(root), name),
          ]));
          checkpointBytes = fs.readFileSync(paths.checkpoint, 'utf8');
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assert.equal(injected, true, fault);
      assertOwnerFinalizationStop(result, request.state);
      assert.equal(result.cleanup, 'failed');
      assert.equal(result.cleanupReason, 'checkpoint-cleanup-failed');
      assert.equal(result.orphan, true);
      assert.equal(result.hostRevision, retainedTerminal.hostRevision + 1);
      assert.equal(clearCalls, 1);
      assert.equal(checkpoint.calls.filter(call => call === 'claim').length, 1);
      assert.deepEqual(removals, ['claim removal', 'final absence check'].includes(fault) ? ['checkpoint', 'claim']
        : ['throwing clear', 'failed clear'].includes(fault) ? [] : ['checkpoint']);
      assert.equal(fs.existsSync(paths.claim), fault !== 'final absence check');
      if (fault === 'final absence check') {
        assert.deepEqual(fs.readdirSync(artifactDirectory(root)), [], 'absence failure is not success, even after both removals');
      }
      if (fault === 'reappearance') assert.equal(fs.readFileSync(paths.checkpoint, 'utf8'), checkpointBytes);
      assert.deepEqual(laneSurfaceDigests(root), before);
      assert.equal(canonicalJson(result).includes('056 private'), false);
      assert.equal(module.testOwnerContext.adapter.end('hard-stop-recorded').reason, 'checkpoint-cleanup-failed');
      assert.equal(clearCalls, 1, 'even an explicit repeated end on this failed handle cannot retry');
    });
  });
}

nodeTest('056 owner finalization runner permits only separate fresh admission and rechecks both-absent collisions', async () => {
  for (const collision of ['none', 'claim', 'checkpoint', 'both']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const checkpoint = ownerFinalizationStore(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      const pairs = [];
      const port = {
        ...checkpoint.port,
        claim(...args) {
          pairs.push(clone(args[1]));
          return checkpoint.port.claim(...args);
        },
      };
      let artifacts;
      const stopped = await runHostAdapter(request, {
        checkpoint: port,
        exchange(challenge) {
          artifacts = fs.readdirSync(artifactDirectory(root)).map(name => [
            name, fs.readFileSync(path.join(artifactDirectory(root), name)),
          ]);
          return focusedChallengeResponse(challenge, 'assessment', {});
        },
      });
      assertOwnerFinalizationStop(stopped, request.state);
      assert.equal(stopped.cleanup, 'cleared');
      assert.equal(pairs.length, 1, 'resource release creates no replacement claim');
      assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
      const callsBefore = checkpoint.calls.length;
      await assert.rejects(() => runHostAdapter(stopped, { checkpoint: port }), TypeError);
      assert.equal(checkpoint.calls.length, callsBefore, 'a returned summary is neither a request nor owner authority');
      for (const [name, bytes] of artifacts) {
        if (collision === 'both' || name.endsWith(`.${collision}`)) {
          fs.writeFileSync(path.join(artifactDirectory(root), name), bytes);
        }
      }
      let exchanges = 0;
      const later = await runHostAdapter(focusedRunnerRequest(root, { assessment: null }), {
        checkpoint: port,
        exchange(challenge) { exchanges += 1; return focusedCancelResponse(challenge); },
      });
      assert.equal(checkpoint.calls[callsBefore], 'load', 'separate explicit admission starts by checking both artifacts');
      assert.equal(exchanges, collision === 'none' ? 1 : 0);
      assert.equal(pairs.length, collision === 'none' ? 2 : 1);
      if (collision === 'none') {
        assert.equal(later.reason, 'cancelled');
        assert.notEqual(pairs[0].invocationIdentity, pairs[1].invocationIdentity);
        assert.notEqual(pairs[0].workerToken, pairs[1].workerToken);
        assert.deepEqual(fs.readdirSync(artifactDirectory(root)), []);
      } else {
        assert.equal(later.outcome, 'hard-stop');
        assert.equal(later.reason, collision === 'both' ? 'checkpoint-ownership-unavailable' : 'checkpoint-stale-orphan');
        assert.equal(checkpoint.calls.slice(callsBefore).includes('clear'), false);
      }
    });
  }
});

nodeTest('056 owner finalization foreground CLI reports one preserved hard stop with no extra prompt or claim', async () => {
  for (const rejection of ['invalid', 'stale', 'EOF', 'malformed JSON']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const request = focusedRunnerRequest(root, { assessment: null });
      const before = laneSurfaceDigests(root);
      const temp = path.join(root, 'runner-temp');
      fs.mkdirSync(temp);
      const env = { TMPDIR: temp, TMP: temp, TEMP: temp };
      let observed;
      if (rejection === 'malformed JSON') {
        const child = spawnSync(process.execPath, [
          fileURLToPath(new URL('./host-adapter-runner.mjs', import.meta.url)),
        ], {
          env: { ...process.env, ...env },
          input: `${canonicalJson(request)}\n{056 private malformed JSON\n`,
          encoding: 'utf8',
        });
        assert.equal(child.error, undefined);
        observed = { code: child.status, stderr: child.stderr, rows: child.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)) };
      } else {
        observed = await runFocusedRunnerCli(request, challenge => rejection === 'EOF' ? null
          : focusedChallengeResponse(challenge, 'assessment', rejection === 'stale'
            ? focusedChallengeAssessment(challenge, { evidenceHash: sha256('056 private CLI stale hash') })
            : { private: '056 private CLI payload' }), { env });
      }
      assert.equal(observed.code, 1, rejection);
      assert.equal(observed.stderr, '');
      assert.deepEqual(observed.rows.map(row => row.type), ['input-required', 'result']);
      assert.equal(observed.rows[0].kind, 'assessment');
      const result = observed.rows[1];
      assert.equal(result.outcome, 'hard-stop');
      assert.equal(result.reason, rejection === 'EOF' ? 'supervisor-context-lost'
        : rejection === 'stale' ? 'challenge-response-stale' : 'challenge-response-invalid');
      assert.equal(result.stateBase64, Buffer.from(canonicalJson(request.state)).toString('base64'));
      assert.equal(result.stateHash, sha256(canonicalJson(request.state)));
      assert.equal(result.acceptedRevision, 0);
      assert.deepEqual(result.haltReport, describeUnattendedHalt({ state: request.state, reason: result.reason }, null));
      const eligible = rejection === 'invalid' || rejection === 'stale';
      assert.equal(result.cleanup, eligible ? 'cleared' : 'not-attempted');
      assert.equal(result.orphan, !eligible);
      assert.equal(result.hostRevision, observed.rows[0].hostRevision + (eligible ? 1 : 0));
      assert.equal(fs.readdirSync(artifactDirectory(temp)).length, eligible ? 0 : 2);
      assert.equal(canonicalJson(observed.rows).includes('056 private'), false);
      assert.deepEqual(laneSurfaceDigests(root), before);
    });
  }
});

nodeTest('focused table A: sequential challenge protocol and foreground CLI', async () => {
  const cases = [
    {
      label: 'exact bound projection settles the task',
      expectedOutcome: 'ended',
      expectedReason: 'task-settled',
      expectedGlyph: 'x',
      dependencies: () => ({}),
      request: (value) => value,
    },
    {
      label: 'stale initial Assessment requires an exchange capability',
      expectedOutcome: 'hard-stop',
      expectedReason: 'exchange-unavailable',
      expectedGlyph: '~',
      checkpointPresent: true,
      dependencies: () => ({}),
      request: (value) => ({
        ...value,
        assessment: { ...value.assessment, evidenceHash: sha256('focused-stale-assessment') },
      }),
    },
  ];

  for (const row of cases) {
    await withSealedWorkspace(async (root) => {
      writeSealedTaskState(root);
      const checkpoint = memoryCheckpointStore();
      const request = row.request(focusedRunnerRequest(root));
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        ...row.dependencies(),
      });
      assert.equal(result.outcome, row.expectedOutcome, row.label);
      assert.equal(result.reason, row.expectedReason, row.label);
      assert.match(result.stateBase64, /^[A-Za-z0-9+/]+={0,2}$/, row.label);
      assert.match(result.stateHash, /^[0-9a-f]{64}$/, row.label);
      for (const suffix of row.expectedSteps || []) {
        assert.ok(result.steps.some((step) => step.step.endsWith(suffix)), `${row.label}:${suffix}`);
      }
      assert.equal(checkpoint.pair.checkpoint !== null, row.checkpointPresent === true, row.label);
      const tasks = fs.readFileSync(path.join(root, TASKS_PATH), 'utf8');
      assert.match(tasks, new RegExp(`- \\[${row.expectedGlyph}\\] ${TARGET.taskKey}`), row.label);
    });
  }

  const protocolCases = [
    {
      label: 'foreign challenge identity refuses without adapter progress',
      reason: 'challenge-response-foreign',
      exchange(challenge) {
        return {
          ...focusedChallengeResponse(
            challenge,
            'assessment',
            focusedChallengeAssessment(challenge),
          ),
          challengeIdentity: sha256('foreign-runner-challenge'),
        };
      },
    },
    {
      label: 'out-of-order challenge kind refuses without adapter progress',
      reason: 'challenge-response-out-of-order',
      exchange(challenge) {
        return {
          version: 1,
          type: 'challenge-response',
          challengeIdentity: challenge.challengeIdentity,
          kind: 'specialist-pair',
          specialistResult: specialistResult('out-of-order', 'accepted'),
        };
      },
    },
    {
      label: 'stale bound Assessment refuses without authorization',
      reason: 'challenge-response-stale',
      detail: 'assessment',
      kinds: ['assessment'],
      preservedState: true,
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        return focusedProducedAssessmentResponse(challenge, {
          ...focusedChallengeAssessment(challenge),
          evidenceHash: sha256('stale-challenge-assessment'),
        }, this.producerVerdicts);
      },
    },
    {
      // The motivating rejection: one trailing slash in the fourth material
      // target is a malformed contract, never a stale binding.
      label: 'a trailing-slash material target is invalid with a coarse safe detail',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        return focusedProducedAssessmentResponse(challenge, {
          ...focusedChallengeAssessment(challenge),
          materialInputs: focusedMaterialInputs([
            ...SORTED_MATERIAL_TARGETS.slice(0, 3),
            'src/skills/dude-work/recovery.mjs/',
          ]),
        }, this.producerVerdicts);
      },
    },
    {
      label: 'an unknown Assessment field is invalid with a coarse safe detail',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        return focusedProducedAssessmentResponse(challenge, {
          ...focusedChallengeAssessment(challenge),
          hostNote: 'model commentary the contract never accepts',
        }, this.producerVerdicts);
      },
    },
    {
      label: 'a missing Assessment field is invalid with a coarse safe detail',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        const { summary: _summary, ...assessment } = focusedChallengeAssessment(challenge);
        return focusedProducedAssessmentResponse(challenge, assessment, this.producerVerdicts);
      },
    },
    {
      label: 'an Assessment Proxy is invalid before authorization',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      rejectedMarkers: ['assessment-proxy-attacker-marker'],
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        return focusedProducedAssessmentResponse(
          challenge,
          // The same raw hostile Proxy reaches producer and runner validation.
          new Proxy(focusedChallengeAssessment(challenge), {
            ownKeys() {
              throw new Error('assessment-proxy-attacker-marker');
            },
          }),
          this.producerVerdicts,
        );
      },
    },
    {
      label: 'an Assessment Proxy trap error with a hostile outer message stays invalid',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      rejectedMarkers: ['assessment-proxy-trap-outer-message-attacker-marker'],
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        return focusedProducedAssessmentResponse(
          challenge,
          new Proxy(focusedChallengeAssessment(challenge), {
            ownKeys() {
              const marker = 'assessment-proxy-trap-outer-message-attacker-marker';
              const failure = new Error(marker);
              assert.deepEqual(
                Object.getOwnPropertyDescriptor(failure, 'message'),
                { value: marker, writable: true, enumerable: false, configurable: true },
                'the thrown trap Error retains the attacker marker in its own message',
              );
              throw failure;
            },
          }),
          this.producerVerdicts,
        );
      },
    },
    (() => {
      let messageAccessorCalls = 0;
      return {
        label: 'an Assessment Proxy trap error with a hostile throwing message accessor stays invalid',
        reason: 'challenge-response-invalid',
        detail: 'Assessment: invalid-contract',
        kinds: ['assessment'],
        preservedState: true,
        rejectedMarkers: ['assessment-proxy-trap-accessor-message-attacker-marker'],
        producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
        exchange(challenge) {
          return focusedProducedAssessmentResponse(
            challenge,
            new Proxy(focusedChallengeAssessment(challenge), {
              ownKeys() {
                const failure = new Error();
                Object.defineProperty(failure, 'message', {
                  get() {
                    messageAccessorCalls += 1;
                    throw new Error('assessment-proxy-trap-accessor-message-attacker-marker');
                  },
                });
                throw failure;
              },
            }),
            this.producerVerdicts,
          );
        },
        assertResult() {
          assert.equal(
            messageAccessorCalls,
            0,
            'producer and runner never read the hostile error accessor',
          );
        },
      };
    })(),
    (() => {
      let getterCalls = 0;
      return {
        label: 'an Assessment accessor is invalid without invoking its throwing getter',
        reason: 'challenge-response-invalid',
        detail: 'Assessment: invalid-contract',
        kinds: ['assessment'],
        preservedState: true,
        rejectedMarkers: ['assessment-getter-attacker-marker'],
        producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
        exchange(challenge) {
          const assessment = focusedChallengeAssessment(challenge);
          Object.defineProperty(assessment, 'summary', {
            enumerable: true,
            get() {
              getterCalls += 1;
              throw new Error('assessment-getter-attacker-marker');
            },
          });
          return focusedProducedAssessmentResponse(
            challenge,
            assessment,
            this.producerVerdicts,
          );
        },
        assertResult() {
          assert.equal(
            getterCalls,
            0,
            'producer and runner Assessment validation never invoke an accessor',
          );
        },
      };
    })(),
    (() => {
      let evidenceHashReads = 0;
      return {
        label: 'a value-changing Assessment Proxy cannot become valid or stale',
        reason: 'challenge-response-invalid',
        detail: 'Assessment: invalid-contract',
        kinds: ['assessment'],
        preservedState: true,
        rejectedMarkers: [sha256('value-changing-proxy-stale-hash')],
        producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
        exchange(challenge) {
          const assessment = focusedChallengeAssessment(challenge);
          const proxy = new Proxy(assessment, {
            get(targetValue, property, receiver) {
              if (property === 'evidenceHash') {
                evidenceHashReads += 1;
                return evidenceHashReads === 1
                  ? targetValue.evidenceHash
                  : sha256('value-changing-proxy-stale-hash');
              }
              return Reflect.get(targetValue, property, receiver);
            },
          });
          return focusedProducedAssessmentResponse(challenge, proxy, this.producerVerdicts);
        },
        assertResult() {
          // Producer validation reads the current then changed hash; runner
          // validation independently reads it twice and once more while
          // disproving stale as the sole defect.
          assert.equal(evidenceHashReads, 5, 'only authoritative validation reads the Proxy');
        },
      };
    })(),
    (() => {
      let snapshotMutations = 0;
      return {
        label: 'an invalid inert Assessment snapshot is rejected after raw validation',
        reason: 'challenge-response-invalid',
        detail: 'Assessment: invalid-contract',
        kinds: ['assessment'],
        preservedState: true,
        exchange(challenge) {
          assert.equal(challenge.kind, 'assessment', 'the invalid snapshot must not reach specialists');
          const assessment = focusedChallengeAssessment(challenge);
          const validInputs = /** @type {Record<string, unknown>} */ (assessment.materialInputs);
          const invalidInputs = { ...clone(validInputs), checks: [] };
          const operations = /** @type {string[]} */ (validInputs.operations);
          validInputs.operations = new Proxy(operations, {
            get(targetValue, property, receiver) {
              if (property === 'length') {
                snapshotMutations += 1;
                assessment.materialInputs = invalidInputs;
              }
              return Reflect.get(targetValue, property, receiver);
            },
          });
          assert.doesNotThrow(
            () => validateAssessment(challenge.target, challenge.inspection, assessment),
            'the authoritative validator accepts the raw Assessment',
          );
          assessment.materialInputs = validInputs;
          return focusedRawChallengeResponse(challenge, 'assessment', assessment);
        },
        assertResult() {
          assert.equal(snapshotMutations, 2, 'producer and runner each validate the raw Assessment');
        },
      };
    })(),
    {
      label: 'a cyclic Assessment data graph is invalid',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        const assessment = focusedChallengeAssessment(challenge);
        assessment.cycle = assessment;
        return focusedProducedAssessmentResponse(challenge, assessment, this.producerVerdicts);
      },
    },
    {
      label: 'an extra response-envelope field has fixed non-leaking detail',
      reason: 'challenge-response-invalid',
      detail: 'challenge-response-envelope',
      kinds: ['assessment'],
      preservedState: true,
      rejectedMarkers: ['envelope-field-attacker-marker'],
      exchange(challenge) {
        return {
          ...focusedChallengeResponse(
            challenge,
            'assessment',
            focusedChallengeAssessment(challenge),
          ),
          'envelope-field-attacker-marker': true,
        };
      },
    },
    {
      label: 'a response-envelope Proxy is invalid',
      reason: 'challenge-response-invalid',
      detail: 'challenge-response-envelope',
      kinds: ['assessment'],
      preservedState: true,
      exchange(challenge) {
        return new Proxy(focusedChallengeResponse(
          challenge,
          'assessment',
          focusedChallengeAssessment(challenge),
        ), {});
      },
    },
    (() => {
      let getterCalls = 0;
      return {
        label: 'a response-envelope accessor is invalid without invoking its getter',
        reason: 'challenge-response-invalid',
        detail: 'challenge-response-envelope',
        kinds: ['assessment'],
        preservedState: true,
        rejectedMarkers: ['envelope-getter-attacker-marker'],
        exchange(challenge) {
          const response = focusedChallengeResponse(
            challenge,
            'assessment',
            focusedChallengeAssessment(challenge),
          );
          Object.defineProperty(response, 'assessment', {
            enumerable: true,
            get() {
              getterCalls += 1;
              throw new Error('envelope-getter-attacker-marker');
            },
          });
          return response;
        },
        assertResult() {
          assert.equal(getterCalls, 0, 'envelope capture never invokes an accessor');
        },
      };
    })(),
    {
      label: 'a response envelope missing its payload is invalid',
      reason: 'challenge-response-invalid',
      detail: 'challenge-response-envelope',
      kinds: ['assessment'],
      preservedState: true,
      exchange(challenge) {
        return {
          version: 1,
          type: 'challenge-response',
          challengeIdentity: challenge.challengeIdentity,
          kind: challenge.kind,
        };
      },
    },
    {
      label: 'an exchange exception has fixed non-leaking detail',
      reason: 'exchange-context-lost',
      detail: 'exchange-failed',
      kinds: ['assessment'],
      preservedState: true,
      rejectedMarkers: ['exchange-error-attacker-marker'],
      exchange() {
        throw new Error('exchange-error-attacker-marker');
      },
    },
    {
      // A noncurrent hash cannot launder a malformed Assessment into staleness:
      // the discriminator rebinds only the hash and requires the rest to validate.
      label: 'a noncurrent evidence hash beside a malformed target stays invalid',
      reason: 'challenge-response-invalid',
      detail: 'Assessment: invalid-contract',
      kinds: ['assessment'],
      preservedState: true,
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange(challenge) {
        return focusedProducedAssessmentResponse(challenge, {
          ...focusedChallengeAssessment(challenge),
          evidenceHash: sha256('stale-and-malformed-assessment'),
          materialInputs: focusedMaterialInputs([
            ...SORTED_MATERIAL_TARGETS.slice(0, 3),
            'src/skills/dude-work/recovery.mjs/',
          ]),
        }, this.producerVerdicts);
      },
    },
    (() => {
      let getterCalls = 0;
      return {
        label: 'a noncurrent hash beside an accessor stays invalid without invoking it',
        reason: 'challenge-response-invalid',
        detail: 'Assessment: invalid-contract',
        kinds: ['assessment'],
        preservedState: true,
        rejectedMarkers: ['stale-accessor-attacker-marker'],
        producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
        exchange(challenge) {
          const assessment = {
            ...focusedChallengeAssessment(challenge),
            evidenceHash: sha256('stale-accessor-assessment'),
          };
          Object.defineProperty(assessment, 'summary', {
            enumerable: true,
            get() {
              getterCalls += 1;
              throw new Error('stale-accessor-attacker-marker');
            },
          });
          return focusedProducedAssessmentResponse(
            challenge,
            assessment,
            this.producerVerdicts,
          );
        },
        assertResult() {
          assert.equal(
            getterCalls,
            0,
            'producer and runner stale classification never invoke a later accessor',
          );
        },
      };
    })(),
    {
      label: 'a valid sorted multi-target Assessment is accepted and the run continues',
      reason: 'task-settled',
      outcome: 'ended',
      checkpointPresent: false,
      kinds: ['assessment', 'specialist-pair'],
      producerVerdicts: /** @type {('accepted'|'rejected')[]} */ ([]),
      exchange: (() => {
        let assessment;
        return function exchange(challenge) {
          if (challenge.kind === 'assessment') {
            assessment = focusedChallengeAssessment(challenge, {
              materialInputs: focusedMaterialInputs(SORTED_MATERIAL_TARGETS),
            });
            return focusedProducedAssessmentResponse(
              challenge,
              assessment,
              this.producerVerdicts,
            );
          }
          return focusedChallengeResponse(
            challenge,
            'specialistResult',
            focusedSpecialistPair(assessment, 'sorted-material-targets'),
          );
        };
      })(),
    },
    {
      label: 'replayed consumed response refuses the later challenge',
      reason: 'challenge-response-replayed',
      exchange: (() => {
        let firstIdentity = null;
        return (challenge) => {
          if (challenge.kind === 'assessment') {
            firstIdentity = challenge.challengeIdentity;
            return focusedChallengeResponse(
              challenge,
              'assessment',
              focusedChallengeAssessment(challenge),
            );
          }
          return {
            ...focusedChallengeResponse(
              challenge,
              'specialistResult',
              specialistResult('replayed-response', 'accepted'),
            ),
            challengeIdentity: firstIdentity,
          };
        };
      })(),
    },
    {
      label: 'cancel is accepted from an Assessment challenge',
      reason: 'cancelled',
      outcome: 'ended',
      checkpointPresent: false,
      exchange: focusedCancelResponse,
    },
    {
      label: 'cancel is accepted from a specialist-pair challenge',
      reason: 'cancelled',
      outcome: 'ended',
      checkpointPresent: false,
      exchange(challenge) {
        if (challenge.kind === 'assessment') {
          return focusedChallengeResponse(
            challenge,
            'assessment',
            focusedChallengeAssessment(challenge),
          );
        }
        return focusedCancelResponse(challenge);
      },
    },
    {
      label: 'cancel is accepted from a learning-review challenge',
      reason: 'cancelled',
      outcome: 'ended',
      checkpointPresent: false,
      initialVerdict: 'rejected',
      exchange: (() => {
        let assessmentOrdinal = 0;
        let assessment;
        return (challenge) => {
          if (challenge.kind === 'assessment') {
            assessmentOrdinal += 1;
            assessment = focusedChallengeAssessment(challenge, assessmentOrdinal === 1 ? {} : {
              action: 'retry-task',
              materialInputs: {
                targets: ['src/skills/dude-work/host-adapter.mjs'],
                operations: ['retry-task'],
                checks: ['verification'],
              },
              summary: 'Retry after the retained rejected review.',
            });
            return focusedChallengeResponse(challenge, 'assessment', assessment);
          }
          if (challenge.kind === 'specialist-pair') {
            return focusedChallengeResponse(
              challenge,
              'specialistResult',
              focusedSpecialistPair(assessment, 'repeated-rejection', 'rejected'),
            );
          }
          return focusedCancelResponse(challenge);
        };
      })(),
    },
    {
      label: 'sequential Assessment and specialist-pair challenges never overlap',
      reason: 'task-settled',
      outcome: 'ended',
      checkpointPresent: false,
      kinds: ['assessment', 'specialist-pair'],
      omitInitial: true,
      exchange: (() => {
        let assessment;
        let active = 0;
        return (challenge) => {
          active += 1;
          assert.equal(active, 1);
          let response;
          if (challenge.kind === 'assessment') {
            assessment = focusedChallengeAssessment(challenge);
            response = focusedChallengeResponse(challenge, 'assessment', assessment);
          } else {
            response = focusedChallengeResponse(
              challenge,
              'specialistResult',
              focusedSpecialistPair(assessment, 'sequential'),
            );
          }
          active -= 1;
          return response;
        };
      })(),
    },
  ];

  for (const row of protocolCases) {
    await withSealedWorkspace(async (root) => {
      writeSealedTaskState(root);
      const request = focusedRunnerRequest(root, {
        assessment: {
          ...focusedRunnerRequest(root).assessment,
          evidenceHash: sha256('force-assessment-challenge'),
        },
        ...(row.initialVerdict
          ? { specialistResult: specialistResult('initial-rejection', row.initialVerdict) }
          : {}),
      });
      if (row.omitInitial) {
        delete request.assessment;
        delete request.specialistResult;
      }
      const checkpoint = memoryCheckpointStore();
      const kinds = [];
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          kinds.push(challenge.kind);
          assert.equal(challenge.type, 'input-required', row.label);
          assert.deepEqual(challenge.target, TARGET, row.label);
          assert.match(challenge.challengeIdentity, /^[0-9a-f]{64}$/, row.label);
          assert.match(challenge.attemptIdentity, /^[0-9a-f]{64}$/, row.label);
          return row.exchange(challenge);
        },
      });
      assert.equal(
        result.reason,
        row.reason,
        `${row.label}:${kinds.join(',')}:${result.steps.map((step) => `${step.step}=${step.reason}`).join(',')}`,
      );
      assert.equal(result.outcome, row.outcome || 'hard-stop', row.label);
      assert.equal(result.outcome === 'active', false, row.label);
      if (row.producerVerdicts) {
        assert.deepEqual(
          row.producerVerdicts,
          [row.reason === 'task-settled' ? 'accepted' : 'rejected'],
          `${row.label}: producer independently validates the raw Assessment`,
        );
      }
      if (row.detail !== undefined) {
        assert.equal(result.detail, row.detail, row.label);
        const finalized = row.detail === 'assessment' || row.detail === 'Assessment: invalid-contract';
        assert.equal(result.orphan, !finalized, row.label);
        assert.equal(result.cleanup, finalized ? 'cleared' : 'not-attempted', row.label);
        // No rejection may echo the refused Assessment's target text or hashes.
        const emitted = canonicalJson(result);
        for (const rejected of [
          'src/skills/dude-work/recovery.mjs/',
          'hostNote',
          sha256('stale-challenge-assessment'),
          sha256('stale-and-malformed-assessment'),
          ...(row.rejectedMarkers || []),
        ]) {
          assert.equal(emitted.includes(rejected), false, `${row.label}:${rejected}`);
        }
      }
      if (row.preservedState === true) {
        assert.deepEqual(
          JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8')),
          emptyState('autonomous'),
          `${row.label}: accepted bytes, counters, and pending authority stay unchanged`,
        );
        assert.equal(
          result.steps.some((step) => step.step.includes('authorize') || step.step.includes('apply')),
          false,
          `${row.label}: a refused Assessment authorizes and implements nothing`,
        );
        assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 1, row.label);
      }
      assert.equal(
        checkpoint.pair.checkpoint !== null,
        row.checkpointPresent !== false
          && row.detail !== 'assessment' && row.detail !== 'Assessment: invalid-contract',
        row.label,
      );
      if (row.kinds) assert.deepEqual(kinds, row.kinds, row.label);
      if (row.assertResult) row.assertResult(result);
      assert.ok(
        fs.readFileSync(path.join(root, TASKS_PATH), 'utf8').includes(
          `- [${result.reason === 'task-settled' ? 'x' : '~'}] ${TARGET.taskKey}`,
        ),
        row.label,
      );
    });
  }

  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const checkpoint = memoryCheckpointStore();
    const planPath = path.join(root, TARGET.specPath.slice(0, -'spec.md'.length), 'plan.md');
    let authorizeCalls = 0;
    let assessment;
    const challenges = [];
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('focused-continuation-runtime'),
        invoke(command, lowLevelRequest) {
          if (command === 'authorize' && authorizeCalls < 2) {
            authorizeCalls += 1;
            fs.appendFileSync(planPath, `\ncontinuation revision ${authorizeCalls}\n`);
          }
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      exchange(challenge) {
        challenges.push(challenge.kind);
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge);
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(assessment, 'continued-after-refusal'),
        );
      },
    });
    assert.equal(result.outcome, 'ended', result.reason);
    assert.equal(result.reason, 'task-settled');
    assert.deepEqual(challenges, ['assessment', 'specialist-pair']);
    assert.equal(authorizeCalls, 2);
    assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 1);
    assert.equal(result.steps.filter((step) => step.reason === 'evidence-drift').length, 2);
    assert.ok(result.steps.some((step) => step.step.endsWith(':reinspect')));
    assert.equal(
      result.steps.some((step) => step.reason === 'checkpoint-ownership-unavailable'),
      false,
    );
    assert.equal(checkpoint.pair.checkpoint, null);
  });

  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const outside = path.join(root, 'outside-tasks.md');
    fs.writeFileSync(outside, fs.readFileSync(path.join(root, TASKS_PATH)));
    fs.rmSync(path.join(root, TASKS_PATH));
    fs.symlinkSync(outside, path.join(root, TASKS_PATH));
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: memoryCheckpointStore().port,
    });
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'runner-refused');
    assert.match(result.detail, /symbolic link|symlink/i);
  });

  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const temp = path.join(root, 'tmp');
    fs.mkdirSync(temp);
    const env = { TMPDIR: temp, TMP: temp, TEMP: temp };
    const stale = focusedRunnerRequest(root, {
      assessment: {
        ...focusedRunnerRequest(root).assessment,
        evidenceHash: sha256('focused-cli-stale-assessment'),
      },
    });
    let assessment;
    const completed = /** @type {Record<string, unknown>} */ (await runFocusedRunnerCli(
      stale,
      (challenge) => {
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge);
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(assessment, 'cli'),
        );
      },
      { env },
    ));
    assert.equal(completed.code, 0);
    assert.deepEqual(
      completed.rows.map((row) => row.type === 'input-required' ? row.kind : row.type),
      ['assessment', 'specialist-pair', 'result'],
    );
    assert.equal(completed.rows.at(-1).outcome, 'ended');

    fs.writeFileSync(path.join(root, TASKS_PATH), [
      '# Tasks',
      '',
      `- [~] ${TARGET.taskKey} [Shared] Adapter core`,
      '',
      '## Lightweight Execution History',
      '',
    ].join('\n'));
    writeSealedTaskState(root);
    const eof = /** @type {Record<string, unknown>} */ (await runFocusedRunnerCli(
      stale,
      () => null,
      { env, endAfterRequest: true },
    ));
    assert.equal(eof.code, 1);
    assert.deepEqual(
      eof.rows.map((row) => row.type === 'input-required' ? row.kind : row.type),
      ['assessment', 'result'],
    );
    assert.equal(eof.rows.at(-1).outcome, 'hard-stop');
    assert.equal(eof.rows.at(-1).reason, 'supervisor-context-lost');
    assert.equal(eof.rows.at(-1).orphan, true);
    assert.equal(eof.rows.at(-1).cleanup, 'not-attempted');

    const collision = /** @type {Record<string, unknown>} */ (await runFocusedRunnerCli(
      stale,
      () => null,
      { env, endAfterRequest: true },
    ));
    assert.equal(collision.code, 1);
    assert.deepEqual(collision.rows.map((row) => row.type), ['result']);
    assert.equal(collision.rows[0].reason, 'checkpoint-ownership-unavailable');
  });
});

nodeTest('T030 derived backlog failure preserves the production autonomous receipt, commit, and audit path', async () => {
  await withSealedWorkspace(async (root) => {
    // Arrange
    writeSealedTaskState(root);
    const artifacts = {
      markdown: path.join(root, '.dude', 'backlog.md'),
      html: path.join(root, '.dude', 'backlog.html'),
    };
    fs.writeFileSync(artifacts.markdown, 'host regression Markdown preimage\n');
    fs.writeFileSync(artifacts.html, 'host regression HTML preimage\n');
    const tasksPath = path.join(root, TASKS_PATH);
    const realWriteFileSync = fs.writeFileSync;
    let injected = 0;
    let refreshPreimages = null;
    let result;

    try {
      // Act
      // The runner may write projection events before its final task close. Fail
      // specifically at the final `x` poststate so the test observes the actual
      // autonomous task-settlement boundary, not an earlier projection.
      // @ts-ignore -- deliberate O_TRUNC-style derived-writer failure injection
      fs.writeFileSync = (file, data, ...rest) => {
        const absolute = path.resolve(String(file));
        const finalTaskCommitted = fs.readFileSync(tasksPath, 'utf8').includes(`- [x] ${TARGET.taskKey}`);
        if (injected === 0 && absolute === artifacts.markdown && finalTaskCommitted) {
          refreshPreimages = {
            markdown: fs.readFileSync(artifacts.markdown),
            html: fs.readFileSync(artifacts.html),
          };
        }
        if (injected === 0 && absolute === artifacts.html && finalTaskCommitted) {
          injected += 1;
          realWriteFileSync(file, Buffer.from('truncated before host refresh failure\n'), ...rest);
          throw new Error('injected host backlog HTML write failure');
        }
        return realWriteFileSync(file, data, ...rest);
      };
      result = await runHostAdapter(focusedRunnerRequest(root), {
        checkpoint: memoryCheckpointStore().port,
      });
    } finally {
      fs.writeFileSync = realWriteFileSync;
    }

    // Assert: the derived error does not become refusal, rollback, or a second result channel.
    assert.equal(injected, 1, 'the final backlog HTML write was deliberately interrupted');
    assert.ok(refreshPreimages, 'the pair preimages were captured immediately before the failed refresh');
    assert.equal(result.outcome, 'ended');
    assert.equal(result.reason, 'task-settled');
    assert.equal(Object.hasOwn(result, 'unchangedPrestateHash'), false);
    assert.equal(Object.hasOwn(result, 'phase'), false);
    assert.ok(
      result.steps.some((step) => step.step === 'commit-lane-receipt' && step.reason === 'lane-receipt-committed'),
      'the original autonomous receipt is normally committed',
    );
    assert.ok(
      result.steps.some((step) => step.step === 'final-audit' && step.reason === 'run-audited'),
      'normal post-commit audit handling remains intact',
    );
    assert.match(fs.readFileSync(tasksPath, 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      'x',
      'canonical snapshot remains committed',
    );
    assert.deepEqual(
      {
        markdown: fs.readFileSync(artifacts.markdown),
        html: fs.readFileSync(artifacts.html),
      },
      refreshPreimages,
      'the failed refresh restores both pair preimages exactly',
    );

    const stale = spawnSync(process.execPath, [BACKLOG_CLI, 'check', '--root', root], { encoding: 'utf8' });
    assert.equal(stale.status, 3, `${stale.stdout}${stale.stderr}`);
    assert.match(stale.stderr, /\[STALE\] \.dude\/backlog\.md/);
    assert.match(stale.stderr, /\[STALE\] \.dude\/backlog\.html/);
    assert.deepEqual(
      {
        markdown: fs.readFileSync(artifacts.markdown),
        html: fs.readFileSync(artifacts.html),
      },
      refreshPreimages,
      'freshness detection remains read-only over the restored stale pair',
    );
  });
});

nodeTest('focused table B: rejected review settles before learning and later attempt', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.state.policy.recovery = 2;
    request.specialistResult = focusedSpecialistPair(
      request.assessment,
      'repeated-learning-rejection',
      'rejected',
    );
    const challenges = [];
    let assessment;
    let selectedAlternative = null;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange(challenge) {
        challenges.push(clone(challenge));
        for (const forbidden of ['route', 'mode', 'command', 'transition']) {
          assert.equal(Object.hasOwn(challenge, forbidden), false, `${challenge.kind}:${forbidden}`);
        }
        if (challenge.kind === 'learning-review') {
          const governedState = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
          assert.equal(governedState.learningGovernance.governanceIdentity, challenge.governanceIdentity);
          const governed = governanceReview(governedState, 'selected-alternative');
          selectedAlternative = governed.credible;
          return focusedChallengeResponse(challenge, 'review', governed.review);
        }
        if (challenge.kind === 'assessment') {
          const materialInputs = selectedAlternative === null
            ? {
              targets: ['src/skills/dude-work/host-adapter.mjs'],
              operations: ['retry-task'],
              checks: ['verification'],
            }
            : clone(selectedAlternative.approachBasis.materialInputs);
          assessment = focusedChallengeAssessment(challenge, {
            action: 'retry-task',
            materialInputs,
            summary: selectedAlternative === null
              ? 'Retry after the first retained rejected review.'
              : 'Run the selected materially different learning alternative.',
          });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(
            assessment,
            selectedAlternative === null ? 'repeated-learning-rejection' : 'selected-alternative',
            selectedAlternative === null ? 'rejected' : 'accepted',
          ),
        );
      },
    });
    assert.equal(
      result.outcome,
      'ended',
      `${result.reason}:${result.steps.map((step) => `${step.step}=${step.reason}`).join(',')}`,
    );
    assert.equal(result.reason, 'task-settled');
    assert.deepEqual(
      challenges.map((challenge) => challenge.kind),
      ['assessment', 'specialist-pair', 'learning-review', 'assessment', 'specialist-pair'],
    );
    assert.equal(new Set(challenges.map((challenge) => challenge.challengeIdentity)).size, challenges.length);
    assert.equal(new Set(challenges.map((challenge) => challenge.bindingIdentity)).size, challenges.length);
    assert.notEqual(challenges[0].inspection.evidenceHash, challenges[3].inspection.evidenceHash);
    assert.notEqual(challenges[0].attemptIdentity, challenges[3].attemptIdentity);
    assert.ok(challenges[0].modelPacket);
    assert.ok(challenges[2].modelPacket);

    const stepIndex = (prefix) => result.steps.findIndex((step) => step.step.startsWith(prefix));
    assert.ok(stepIndex('attempt:2:completion:apply-projection') >= 0);
    assert.ok(stepIndex('attempt:2:settle-completion') > stepIndex('attempt:2:completion:commit-projection'));
    assert.ok(stepIndex('attempt:2:governance:apply-projection') > stepIndex('attempt:2:settle-completion'));
    assert.ok(stepIndex('attempt:2:settle-governance') > stepIndex('attempt:2:governance:commit-projection'));
    assert.ok(stepIndex('advance-governance:review-learning') > stepIndex('attempt:2:settle-governance'));
    assert.ok(stepIndex('learning-result:apply-projection') > stepIndex('advance-governance:review-learning'));
    assert.ok(stepIndex('learning-result:settle-effect') > stepIndex('learning-result:commit-projection'));
    assert.ok(stepIndex('advance-governance:bind-alternative') > stepIndex('learning-result:settle-effect'));
    assert.ok(stepIndex('attempt:3:authorize-attempt') > stepIndex('advance-governance:bind-alternative'));

    const tasks = fs.readFileSync(path.join(root, TASKS_PATH), 'utf8');
    assert.ok(tasks.includes(`- [x] ${TARGET.taskKey}`));
    assert.ok((tasks.match(/"disposition":"review-rejected"/g) || []).length >= 2);
    assert.ok(tasks.includes('"type":"learning-review"'));
    assert.ok(tasks.includes('"type":"learning-governance"'));
  });

  const cases = [
    ['settlement', 'settle', 'accepted', 'completed'],
    ['application replay', 'replay-apply', 'hard-stop', 'lane-permit-replayed'],
    ['receipt replay', 'replay-commit', 'hard-stop', 'lane-receipt-replayed'],
  ];

  for (const [label, action, expectedOutcome, expectedReason] of cases) {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const state = pendingState('autonomous');
      const fixture = sealedTrustedFixture(state, `focused-projection:${label}`, 'accepted');
      const applications = [];
      const adapter = createHostAdapter(sealedInitial({ state }), {
        laneOwner: {
          identity: sha256(`focused-projection-lane-owner:${label}`),
          apply(request) {
            applications.push(clone(request));
            return applyLightweightWorkRequest(request);
          },
        },
      });
      const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
      }));
      assert.equal(captured.outcome, 'effect-required', label);
      const events = captured.effect.projectionBatch.events;
      assert.equal(events.length, 1, label);

      const binding = sealedLaneBinding(root);
      const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
        projection: {
          input: sealedTransportInput(sealedInspectionInput(root, {
            policyMode: 'autonomous',
            ...fixture.streams,
          })),
          laneBinding: {
            lanePrestate: binding.lanePrestate,
            targetMapping: binding.targetMapping,
            operationTime: LANE_MUTATION.snapshotUpdatedAt,
          },
        },
      }));
      assert.equal(prepared.outcome, 'effect-required', label);
      assert.equal(prepared.reason, 'projection-prepared', label);
      const item = prepared.product.plan.items[0];
      const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
        laneApplication: {
          ...binding.application,
          permit: clone(item.projectionPermit),
          mutation: clone(item.mutation),
        },
      }));
      assert.equal(applied.outcome, 'effect-required', label);
      assert.equal(applied.reason, 'lane-projection-applied', label);
      assert.equal(applications.length, 1, label);
      assert.equal(applications[0].operation, 'work-project', label);

      if (action === 'replay-apply') {
        const replayed = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
          laneApplication: {
            ...binding.application,
            permit: clone(item.projectionPermit),
            mutation: clone(item.mutation),
          },
        }));
        assert.equal(replayed.outcome, expectedOutcome, label);
        assert.equal(replayed.reason, expectedReason, label);
        assert.equal(applications.length, 1, label);
        return;
      }

      const projectedInput = sealedTransportInput(sealedInspectionInput(root, {
        policyMode: 'autonomous',
        currentRun: [sealedCapture(TARGET, 'failed', events.map((event) => ({ event })))],
        ...fixture.streams,
      }));
      const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
        laneReceipt: {
          input: projectedInput,
          permit: clone(item.projectionPermit),
          receipt: clone(applied.product.receipt),
        },
      }));
      assert.equal(committed.outcome, 'effect-required', label);
      assert.equal(committed.reason, 'lane-receipt-committed', label);

      const result = action === 'replay-commit'
        ? adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
          laneReceipt: {
            input: projectedInput,
            permit: clone(item.projectionPermit),
            receipt: clone(applied.product.receipt),
          },
        }))
        : adapter.run(sealedRequest(adapter, 'settle-effect', { input: projectedInput }));
      assert.equal(result.outcome, expectedOutcome, label);
      assert.equal(result.reason, expectedReason, label);
    });
  }
});

nodeTest('issue #21: review rejection recovers through address-review after an unchanged fresh recapture', async () => {
  await withSealedWorkspace(async (root) => {
    // Arrange: the first complete result carries real Tester and Reviewer
    // evidence, but the Reviewer rejects it. The later address-review route
    // deliberately sees two proven no-effect runtime failures.
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.specialistResult = focusedSpecialistPair(
      request.assessment,
      'issue-21-initial-review-rejection',
      'rejected',
    );
    const checkpoint = memoryCheckpointStore();
    const challengeKinds = [];
    const assessmentActions = [];
    let currentAssessment = null;
    let emptyAddressReviewAuthorizations = 0;
    let addressReviewEvidenceHash = null;
    let unchangedRecoveryEvidenceHash = null;

    // Act.
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('issue-21-unchanged-recapture-runtime'),
        invoke(command, lowLevelRequest) {
          const lowLevel = /** @type {Record<string, unknown>} */ (lowLevelRequest);
          const assessment = lowLevel.assessment;
          if (command === 'authorize'
            && assessment !== null
            && typeof assessment === 'object'
            && /** @type {Record<string, unknown>} */ (assessment).action === 'address-review'
            && emptyAddressReviewAuthorizations < 2) {
            const evidenceHash = /** @type {Record<string, unknown>} */ (assessment).evidenceHash;
            if (addressReviewEvidenceHash === null) addressReviewEvidenceHash = evidenceHash;
            emptyAddressReviewAuthorizations += 1;
            return { status: 'empty' };
          }
          const value = runCommand(command, lowLevelRequest);
          if (command === 'inspect'
            && emptyAddressReviewAuthorizations === 2
            && unchangedRecoveryEvidenceHash === null) {
            const inspection = /** @type {Record<string, unknown>} */ (
              /** @type {Record<string, unknown>} */ (value).inspection
            );
            unchangedRecoveryEvidenceHash = /** @type {string} */ (inspection.evidenceHash);
          }
          return { status: 'returned', value };
        },
      },
      exchange(challenge) {
        challengeKinds.push(challenge.kind);
        if (challenge.kind === 'assessment') {
          currentAssessment = focusedChallengeAssessment(challenge, {
            action: 'address-review',
            materialInputs: {
              targets: ['src/skills/dude-work/host-adapter.mjs'],
              operations: ['address-review'],
              checks: ['review', 'verification'],
            },
            summary: 'Address the retained Reviewer finding and repeat both required checks.',
          });
          assessmentActions.push(currentAssessment.action);
          return focusedChallengeResponse(challenge, 'assessment', currentAssessment);
        }
        if (challenge.kind === 'specialist-pair') {
          assert.ok(currentAssessment, 'a specialist result follows its bound Assessment');
          return focusedChallengeResponse(
            challenge,
            'specialistResult',
            focusedSpecialistPair(
              /** @type {Record<string, unknown>} */ (currentAssessment),
              'issue-21-address-review',
              'accepted',
            ),
          );
        }
        assert.fail(`unexpected runner challenge: ${challenge.kind}`);
      },
    });

    // Assert: one real runner ownership claim progresses from rejected review
    // through the review-remediation action and its required verification/review
    // checks to actual lane settlement.
    assert.equal(
      result.outcome,
      'ended',
      `${result.reason}:${result.steps.map((step) => `${step.step}=${step.reason}`).join(',')}`,
    );
    assert.equal(result.reason, 'task-settled');
    assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 1);
    assert.equal(checkpoint.pair.checkpoint, null);
    // The rejected initial pair was supplied in the request. Recovery must
    // authorize address-review before it can request a replacement pair: both
    // no-effect authorization calls precede the fresh Assessment, then the
    // successful authorization permits the one real specialist-pair challenge.
    assert.deepEqual(
      challengeKinds,
      ['assessment', 'assessment', 'specialist-pair'],
      'the replacement specialist pair follows successful address-review authorization',
    );
    assert.deepEqual(assessmentActions, ['address-review', 'address-review']);
    assert.equal(emptyAddressReviewAuthorizations, 2, 'both no-effect refusals were exercised');
    assert.equal(unchangedRecoveryEvidenceHash, addressReviewEvidenceHash, 'reinspection content is unchanged');

    const noEffectSteps = result.steps.filter((step) => step.reason === 'runtime-output-empty');
    assert.equal(noEffectSteps.length, 2, 'both address-review no-effect refusals are retained');
    assert.deepEqual(
      noEffectSteps.map((step) => step.step),
      ['attempt:2:authorize-attempt', 'attempt:2:authorize-attempt:correction'],
      'the second no-effect result is the one permitted correction',
    );
    const firstNoEffect = noEffectSteps[0];
    const secondNoEffect = noEffectSteps[1];
    assert.deepEqual(
      {
        acceptedRevision: secondNoEffect.acceptedRevision,
        stateBase64: secondNoEffect.stateBase64,
        stateHash: secondNoEffect.stateHash,
      },
      {
        acceptedRevision: firstNoEffect.acceptedRevision,
        stateBase64: firstNoEffect.stateBase64,
        stateHash: firstNoEffect.stateHash,
      },
      'no-effect refusals neither charge accepted authority nor alter its state',
    );
    const recapture = result.steps.find((step) => step.step === 'attempt:2:authorize-attempt:reinspect');
    assert.ok(recapture, 'second no-effect refusal triggers a fresh Inspection');
    assert.equal(recapture.reason, 'inspection-refreshed');
    assert.equal(recapture.acceptedRevision, firstNoEffect.acceptedRevision);
    assert.equal(recapture.stateBase64, firstNoEffect.stateBase64);
    assert.ok(
      result.steps.some((step) => step.step === 'attempt:1:settle-completion' && step.reason === 'review-rejected'),
      'initial Reviewer rejection reaches settlement',
    );
    assert.ok(
      result.steps.some((step) => step.step === 'attempt:2:settle-completion' && step.reason === 'completed'),
      'address-review reaches re-verification and re-review settlement',
    );
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      'x',
    );
  });
});

nodeTest('verification failure recovers through address-test, fresh PASS, projection, and settlement', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.specialistResult = focusedFailedSpecialistPair(
      request.assessment,
      'address-test-initial-failure',
    );
    let assessment = null;
    const challenges = [];
    const captureInputs = [];
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('address-test-end-to-end-runtime'),
        invoke(command, lowLevelRequest) {
          if (command === 'complete' && lowLevelRequest.mode === 'capture') {
            captureInputs.push(clone(lowLevelRequest.input));
          }
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      exchange(challenge) {
        challenges.push(challenge.kind);
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge, {
            action: 'address-test',
            materialInputs: {
              targets: ['src/skills/dude-work/host-adapter.mjs'],
              operations: ['address-test'],
              checks: ['lint', 'verification'],
            },
            summary: 'Address the failed Tester check and rerun its required checks.',
          });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        assert.ok(assessment, 'the fresh specialist result follows address-test authorization');
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(
            /** @type {Record<string, unknown>} */ (assessment),
            'address-test-fresh-pass',
          ),
        );
      },
    });

    assert.equal(
      result.outcome,
      'ended',
      `${result.reason}:${result.steps.map((step) => `${step.step}=${step.reason}`).join(',')}`,
    );
    assert.equal(result.reason, 'task-settled');
    assert.deepEqual(challenges, ['assessment', 'specialist-pair']);
    assert.equal(captureInputs.length, 2);
    assert.equal(captureInputs[0].verification[0].state, 'failed');
    assert.deepEqual(captureInputs[0].lint, [], 'execute-task produces no lint stream');
    assert.equal(captureInputs[1].verification[0].state, 'passed');
    assert.equal(captureInputs[1].lint[0].state, 'passed');
    assert.deepEqual(captureInputs[1].lint[0], captureInputs[1].verification[0]);
    assert.ok(result.steps.some((step) => (
      step.step === 'attempt:1:settle-completion' && step.reason === 'verification-failed'
    )));
    assert.ok(result.steps.some((step) => (
      step.step === 'attempt:2:settle-completion' && step.reason === 'completed'
    )));
    assert.ok(result.steps.some((step) => step.step.startsWith('attempt:2:completion:apply-projection')));
    assert.ok(result.steps.some((step) => step.step.startsWith('attempt:2:completion:commit-projection')));
    assert.equal(
      result.steps.some((step) => step.reason === 'runtime-output-malformed'),
      false,
      'same-capture lint is accepted by every runtime route',
    );
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
  });
});

nodeTest('runner retains observed lint unchanged but excludes it from each fresh attestation input', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.state.policy.recovery = 2;
    request.specialistResult = focusedFailedSpecialistPair(
      request.assessment,
      'lint-carriage-initial-failure',
    );
    let assessment = null;
    let specialistOrdinal = 0;
    const runtimeCalls = [];
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('lint-carriage-runtime'),
        invoke(command, lowLevelRequest) {
          runtimeCalls.push({
            command,
            mode: lowLevelRequest.mode || 'ordinary',
            input: Object.hasOwn(lowLevelRequest, 'input') ? clone(lowLevelRequest.input) : null,
          });
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      exchange(challenge) {
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge, {
            action: 'address-test',
            materialInputs: {
              targets: ['src/skills/dude-work/host-adapter.mjs'],
              operations: ['address-test'],
              checks: ['lint', 'verification'],
            },
            summary: 'Rerun the exact failed Tester checks.',
          });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        specialistOrdinal += 1;
        assert.ok(assessment, 'specialist pair follows its address-test Assessment');
        const pair = specialistOrdinal === 1
          ? focusedFailedSpecialistPair(
            /** @type {Record<string, unknown>} */ (assessment),
            'lint-carriage-failed-address-test',
          )
          : focusedSpecialistPair(
            /** @type {Record<string, unknown>} */ (assessment),
            'lint-carriage-passed-address-test',
          );
        return focusedChallengeResponse(challenge, 'specialistResult', pair);
      },
    });

    assert.equal(
      result.outcome,
      'ended',
      `${result.reason}:${result.steps.map((step) => `${step.step}=${step.reason}`).join(',')}`,
    );
    assert.equal(result.reason, 'task-settled');
    const captures = runtimeCalls
      .map((call, index) => ({ ...call, index }))
      .filter((call) => call.command === 'complete' && call.mode === 'capture');
    assert.equal(captures.length, 3);
    assert.deepEqual(captures[0].input.lint, [], 'initial execute-task has no lint');
    assert.equal(captures[1].input.lint.length, 1);
    assert.equal(captures[1].input.lint[0].state, 'failed');
    assert.deepEqual(captures[1].input.lint[0], captures[1].input.verification[0]);
    assert.equal(captures[2].input.lint.length, 1, 'prior lint is removed before fresh attestation');
    assert.equal(captures[2].input.lint[0].state, 'passed');
    assert.deepEqual(captures[2].input.lint[0], captures[2].input.verification[0]);
    assert.notDeepEqual(captures[2].input.lint[0], captures[1].input.lint[0]);

    const betweenCaptures = runtimeCalls
      .slice(captures[1].index + 1, captures[2].index)
      .filter((call) => call.input && call.input.lint.length > 0);
    assert.ok(betweenCaptures.length > 0, 'failed lint remains observed before the next capture');
    for (const call of betweenCaptures) {
      assert.deepEqual(call.input.lint, captures[1].input.lint, `${call.command}:${call.mode}`);
    }
    const carriedLint = [...captures[1].input.lint, ...captures[2].input.lint];
    const afterFreshCapture = runtimeCalls
      .slice(captures[2].index + 1)
      .filter((call) => call.input && call.input.lint.length > 0);
    assert.ok(afterFreshCapture.length > 0, 'later runtime input carries observed lint');
    for (const call of afterFreshCapture) {
      assert.deepEqual(call.input.lint, carriedLint, `${call.command}:${call.mode}`);
    }
    assert.equal(result.steps.some((step) => step.reason === 'runtime-output-malformed'), false);
  });
});

nodeTest('focused table C: projection receipts and replacement-worker resume stay exact', async () => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'focused-c-projection', 'accepted');
    const adapter = createHostAdapter(sealedInitial({ state }));
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
    }));
    assert.equal(captured.outcome, 'effect-required');
    const events = captured.effect.projectionBatch.events;
    const binding = sealedLaneBinding(root);
    const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
      projection: {
        input: sealedTransportInput(sealedInspectionInput(root, {
          policyMode: 'autonomous',
          ...fixture.streams,
        })),
        laneBinding: {
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
          operationTime: LANE_MUTATION.snapshotUpdatedAt,
        },
      },
    }));
    const item = prepared.product.plan.items[0];
    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: {
        ...binding.application,
        permit: clone(item.projectionPermit),
        mutation: clone(item.mutation),
      },
    }));
    assert.equal(applied.outcome, 'effect-required');
    const projectedInput = sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: [sealedCapture(TARGET, 'failed', events.map((event) => ({ event })))],
      ...fixture.streams,
    }));
    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: {
        input: projectedInput,
        permit: clone(item.projectionPermit),
        receipt: clone(applied.product.receipt),
      },
    }));
    assert.equal(committed.outcome, 'effect-required');
    assert.equal(committed.session.acceptedStateBytes, canonicalJson(state));
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', { input: projectedInput }));
    assert.equal(settled.outcome, 'accepted');
    assert.equal(settled.reason, 'completed');
  });

  const cases = [
    ['ordinary receipt compatibility', 'ordinary', 'accepted', 'lane-receipt-committed'],
    ['receipt absence', 'missing', 'lane-receipt-binding-mismatch'],
    ['mismatched receipt', 'mismatched', 'hard-stop', 'lane-receipt-binding-mismatch'],
    ['stale receipt', 'stale', 'hard-stop', 'lane-receipt-binding-mismatch'],
    ['duplicate receipt', 'duplicate', 'hard-stop', 'lane-receipt-replayed'],
    ['replayed receipt', 'replay', 'hard-stop', 'lane-receipt-replayed'],
    ['final poststate drift', 'drift', 'lane-receipt-mismatch'],
  ].map((row) => row.length === 3
    ? [row[0], row[1], 'hard-stop', row[2]]
    : row);

  for (const [label, fault, expectedOutcome, expectedReason] of cases) {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const closure = sealedAcceptedCompletion(root, (initial) => createHostAdapter(initial, {
        laneOwner: {
          identity: sha256(`focused-post-apply-lane-owner:${label}`),
          apply(request) {
            const outcome = applyLightweightWorkRequest(request);
            if (outcome.ok !== true
              || fault === 'ordinary'
              || fault === 'stale'
              || fault === 'duplicate'
              || fault === 'replay'
              || fault === 'drift') return outcome;
            if (fault === 'missing') {
              const { receipt: _receipt, ...withoutReceipt } = outcome;
              return withoutReceipt;
            }
            const { receiptHash: _receiptHash, ...body } = outcome.receipt;
            const mismatched = { ...body, permitHash: sha256('focused-mismatched-receipt') };
            return {
              ...outcome,
              receipt: { ...mismatched, receiptHash: sha256(canonicalJson(mismatched)) },
            };
          },
        },
      }));
      const binding = sealedLaneBinding(root);
      const issued = closure.adapter.run(sealedRequest(closure.adapter, 'authorize-lane-effect', {
        laneEffect: {
          input: closure.laneInput(),
          mutation: clone(LANE_MUTATION),
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
        },
      }));
      assert.equal(issued.outcome, 'accepted', label);
      const permit = issued.product.permit;
      const applied = closure.adapter.run(sealedRequest(closure.adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: clone(permit) },
      }));

      if (fault === 'missing' || fault === 'mismatched') {
        assert.equal(applied.outcome, 'hard-stop', label);
        assert.equal(applied.reason, expectedReason, label);
        assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
        return;
      }

      assert.equal(applied.outcome, 'accepted', label);
      if (fault === 'drift') {
        fs.appendFileSync(path.join(root, TASKS_PATH), '\n<!-- focused final-poststate drift -->\n');
      }
      const suppliedReceipt = clone(applied.product.receipt);
      if (fault === 'stale') suppliedReceipt.receiptHash = sha256('focused-stale-receipt');
      const committed = closure.adapter.run(sealedRequest(closure.adapter, 'commit-lane-receipt', {
        laneReceipt: {
          input: closure.laneInput(),
          permit: clone(permit),
          receipt: suppliedReceipt,
        },
      }));
      if (fault === 'drift' || fault === 'stale') {
        assert.equal(committed.outcome, 'hard-stop', label);
        assert.equal(committed.reason, expectedReason, label);
        return;
      }
      assert.equal(committed.outcome, 'accepted', label);
      if (fault === 'ordinary') {
        assert.equal(committed.reason, expectedReason, label);
        assert.equal(committed.session.acceptedStateBytes, closure.adapter.snapshot().acceptedStateBytes, label);
        return;
      }
      const replayed = closure.adapter.run(sealedRequest(closure.adapter, 'commit-lane-receipt', {
        laneReceipt: {
          input: closure.laneInput(),
          permit: clone(permit),
          receipt: clone(applied.product.receipt),
        },
      }));
      assert.equal(replayed.outcome, expectedOutcome, label);
      assert.equal(replayed.reason, expectedReason, label);
    });
  }

  await withSealedWorkspace(async (root) => {
    // Arrange: this is the pre-existing production runner refusal path. Four
    // persistent lane refusals form two correction/reinspection pairs; a fifth
    // real call remains available only to expose an unbounded runner.
    writeSealedTaskState(root);
    const checkpointRoot = path.join(root, 'checkpoint');
    fs.mkdirSync(checkpointRoot);
    const laneBytes = () => ({
      tasks: fs.readFileSync(path.join(root, TASKS_PATH)),
      snapshot: fs.readFileSync(path.join(root, TASK_STATE_PATH)),
      owner: fs.readFileSync(path.join(root, IDEA_PATH)),
    });
    const authoritativePrestate = laneBytes();
    const observedCurrentRun = [];
    const workProjectRefusals = [
      {
        version: 1,
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-c-runner-order-refusal:1'),
      },
      {
        version: 1,
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-c-runner-order-refusal:2'),
      },
      {
        version: 1,
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-c-runner-order-refusal:3'),
      },
      {
        version: 1,
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-c-runner-order-refusal:4'),
      },
    ];
    const refusalRows = [];
    let delegatedWorkProjects = 0;

    // Act: run through the public autonomous host path and the real board
    // owner boundary, not a source-text or direct adapter assertion.
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: createTemporaryCheckpointStore({ root: checkpointRoot }),
      runtime: {
        identity: sha256('focused-c-runner-order-runtime'),
        invoke(command, lowLevelRequest) {
          if (command === 'inspect') {
            observedCurrentRun.push(lowLevelRequest.input.currentRun.length);
          }
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      laneOwner: {
        identity: sha256('focused-c-runner-order-lane-owner'),
        apply(request) {
          if (request.operation !== 'work-project') return applyLightweightWorkRequest(request);
          if (workProjectRefusals.length > 0) {
            refusalRows.push({
              operation: request.operation,
              authoritative: laneBytes(),
            });
            return workProjectRefusals.shift();
          }
          delegatedWorkProjects += 1;
          return applyLightweightWorkRequest(request);
        },
      },
    });

    // Assert: two-pass recovery stops after two distinct Inspection occurrences
    // and never reaches the available fifth board mutation.
    assert.equal(
      `${result.outcome}/${result.reason}`,
      'hard-stop/repeated-closed-refusal',
      'the bounded deterministic runner stops before a fifth work-project call',
    );
    assert.equal(workProjectRefusals.length, 0, 'exactly four persistent refusals reach the lane boundary');
    assert.equal(refusalRows.length, 4, 'exactly four work-project calls are refused');
    assert.equal(delegatedWorkProjects, 0, 'the fifth work-project fallback is never delegated');
    for (const [index, refusal] of refusalRows.entries()) {
      assert.equal(refusal.operation, 'work-project', `refusal ${index + 1} uses the real projection operation`);
      assert.deepEqual(
        refusal.authoritative,
        authoritativePrestate,
        `refusal ${index + 1} preserves all authoritative lane bytes`,
      );
    }
    assert.ok(observedCurrentRun.length >= 2, 'fresh runtime inspections were actually observed');
    assert.ok(
      observedCurrentRun.every(count => count === 0),
      'every refused lane projection leaves its staged current-run record unpublished, including reinspections',
    );

    const refusalSteps = result.steps.filter((step) => step.outcome === 'closed-refusal'
      && step.reason === 'expected-capture-mismatch');
    assert.equal(refusalSteps.length, 4, 'each lane refusal is retained by the public runner');
    assert.deepEqual(
      refusalSteps.map((step) => step.step.endsWith(':correction')),
      [false, true, false, true],
      'each Inspection occurrence permits exactly one correction',
    );
    const reinspections = result.steps.filter((step) => step.step.endsWith(':reinspect')
      && step.outcome === 'accepted'
      && step.reason === 'inspection-refreshed');
    assert.equal(reinspections.length, 2, 'each refusal pair completes one successful fresh Inspection');
    for (const correction of refusalSteps.filter((step) => step.step.endsWith(':correction'))) {
      const correctionIndex = result.steps.indexOf(correction);
      const preceding = result.steps[correctionIndex - 1];
      const reinspection = result.steps[correctionIndex + 1];
      assert.ok(preceding, 'a correction immediately follows its first refusal');
      assert.ok(reinspection, 'a spent correction is followed by a fresh Inspection');
      assert.equal(correction.step, `${preceding.step}:correction`);
      assert.equal(reinspection.step, `${preceding.step}:reinspect`);
      assert.equal(reinspection.outcome, 'accepted');
      assert.equal(reinspection.reason, 'inspection-refreshed');
    }

    const acceptedAuthority = (row) => {
      const acceptedStateBytes = Buffer.from(row.stateBase64, 'base64').toString('utf8');
      const acceptedState = JSON.parse(acceptedStateBytes);
      return {
        acceptedStateBytes,
        acceptedStateHash: row.stateHash,
        acceptedRevision: row.acceptedRevision,
        overallUsed: acceptedState.overallUsed,
        recoveryUsed: clone(acceptedState.recoveryUsed),
      };
    };
    const beforeFirstRefusal = acceptedAuthority(
      result.steps[result.steps.indexOf(refusalSteps[0]) - 1],
    );
    for (const [index, refusal] of refusalSteps.entries()) {
      const preserved = acceptedAuthority(refusal);
      assert.equal(
        preserved.acceptedStateHash,
        sha256(preserved.acceptedStateBytes),
        `refusal ${index + 1} retains the accepted-state hash`,
      );
      assert.deepEqual(
        preserved,
        beforeFirstRefusal,
        `refusal ${index + 1} does not consume accepted attempt or recovery authority`,
      );
    }
    assert.deepEqual(
      acceptedAuthority(result),
      beforeFirstRefusal,
      'the terminal keeps accepted bytes, hash, revision, and attempt/recovery counters',
    );
    const lastReinspection = reinspections[reinspections.length - 1];
    assert.ok(lastReinspection, 'the second successful reinspection is retained');
    // Corrections advance hostRevision as protocol bookkeeping; the terminal
    // itself must retain the full state produced by the second reinspection.
    assert.deepEqual(
      { ...acceptedAuthority(result), hostRevision: result.hostRevision },
      { ...acceptedAuthority(lastReinspection), hostRevision: lastReinspection.hostRevision },
      'the terminal preserves accepted bytes/hash, accepted/host revisions, and counters',
    );
    assert.deepEqual(laneBytes(), authoritativePrestate, 'terminal refusal leaves task, snapshot, and owner bytes exact');
    assert.equal(
      result.steps.some((step) => step.reason === 'no-effect-probe-ledger-exhausted'),
      false,
      'deterministic refusal recovery does not consume the unrelated no-effect probe ledger',
    );
  });

  const boundaries = [
    ['before current-run append', false, false, false],
    ['after current-run append before lane apply', true, false, false],
    ['after lane apply before receipt commit', true, true, false],
    ['after receipt commit before projection settle', true, true, true],
  ];

  for (const [label, appendCurrentRun, applyLane, commitReceipt] of boundaries) {
    withTemporaryRoot((checkpointRoot) => {
      withSealedWorkspace((root) => {
        writeSealedTaskState(root);
        const state = pendingState('autonomous');
        const fixture = sealedTrustedFixture(state, `focused-c-checkpoint:${label}`, 'accepted');
        const store = createTemporaryCheckpointStore({ root: checkpointRoot });
        const key = derivedCheckpointKey();
        let exactApplication = null;
        const adapter = createHostAdapter(
          { ...sealedInitial({ state }), workspace: { ...WORKSPACE } },
          {
            checkpoint: store,
            laneOwner: {
              identity: sha256(`focused-c-checkpoint-lane-owner:${label}`),
              apply(request) {
                exactApplication = clone(readCheckpointRecord(checkpointRoot, key).inFlight);
                return applyLightweightWorkRequest(request);
              },
            },
          },
        );
        const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
          attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
        }));
        assert.equal(captured.outcome, 'effect-required', label);
        const pending = clone(captured.session.pendingEffect);
        const events = captured.effect.projectionBatch.events;
        const binding = sealedLaneBinding(root);
        const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
          projection: {
            input: sealedTransportInput(sealedInspectionInput(root, {
              policyMode: 'autonomous',
              ...fixture.streams,
            })),
            laneBinding: {
              lanePrestate: binding.lanePrestate,
              targetMapping: binding.targetMapping,
              operationTime: LANE_MUTATION.snapshotUpdatedAt,
            },
          },
        }));
        assert.equal(prepared.outcome, 'effect-required', label);
        assert.equal(prepared.reason, 'projection-prepared', label);
        const item = prepared.product.plan.items[0];
        const currentRun = appendCurrentRun
          ? [sealedCapture(TARGET, 'failed', events.map((event) => ({ event })))]
          : [];
        const projectionInput = sealedTransportInput(sealedInspectionInput(root, {
          policyMode: 'autonomous',
          currentRun,
          ...fixture.streams,
        }));
        let applied = null;
        if (applyLane) {
          applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
            laneApplication: {
              ...binding.application,
              permit: clone(item.projectionPermit),
              mutation: clone(item.mutation),
            },
          }));
          assert.equal(applied.outcome, 'effect-required', label);
          assert.equal(applied.reason, 'lane-projection-applied', label);
        }
        if (commitReceipt) {
          const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
            laneReceipt: {
              input: projectionInput,
              permit: clone(item.projectionPermit),
              receipt: clone(applied.product.receipt),
            },
          }));
          assert.equal(committed.outcome, 'effect-required', label);
          assert.equal(committed.reason, 'lane-receipt-committed', label);
        }

        const active = adapter.snapshot();
        const held = readCheckpointRecord(checkpointRoot, key);
        const handed = handoffHostWorker(
          handoffInput(active.invocationIdentity, active),
          supervisorPorts(store),
        );
        assert.equal(handed.outcome, 'handed-off', label);
        const ports = () => resumePorts(store, sealedPorts((command, lowLevelRequest) => ({
          status: 'returned',
          value: runCommand(command, lowLevelRequest),
        })));
        const resume = (effect) => resumeHostAdapter(
          resumeInput(handed.receipt, { effect }),
          ports(),
        );
        const generic = resume({
          status: 'established',
          effectIdentity: held.inFlight.expectedEffectIdentity,
          receiptIdentity: held.inFlight.expectedReceiptIdentity,
          provisionalState: clone(pending.provisionalState),
        });
        assert.equal(generic.outcome, 'hard-stop', `${label}: generic pending evidence`);
        assert.equal(generic.reason, 'effect-unverified', `${label}: generic pending evidence`);
        assert.equal(
          readCheckpointRecord(checkpointRoot, key).acceptedStateBytes,
          canonicalJson(state),
          `${label}: predecessor retained`,
        );

        if (!applyLane) return;
        assert.deepEqual(held.inFlight, exactApplication, `${label}: exact apply descriptor retained`);
        const receipt = clone(applied.product.receipt);
        const { receiptHash: _receiptHash, ...receiptBody } = receipt;
        const wrongReceiptBody = {
          ...receiptBody,
          permitHash: sha256(`focused-c-wrong-resume-receipt:${label}`),
        };
        const exactEffect = (input, suppliedReceipt = receipt) => ({
          status: 'established',
          effectIdentity: exactApplication.expectedEffectIdentity,
          receiptIdentity: exactApplication.expectedReceiptIdentity,
          provisionalState: clone(pending.provisionalState),
          projection: {
            input,
            projectionBatch: clone(pending.projectionBatch),
            permit: clone(item.projectionPermit),
            receipt: clone(suppliedReceipt),
          },
        });
        const wrongReceipt = resume(exactEffect(projectionInput, {
          ...wrongReceiptBody,
          receiptHash: sha256(canonicalJson(wrongReceiptBody)),
        }));
        assert.equal(wrongReceipt.outcome, 'hard-stop', `${label}: wrong exact receipt`);
        assert.equal(
          readCheckpointRecord(checkpointRoot, key).acceptedStateBytes,
          canonicalJson(state),
          `${label}: wrong receipt retains predecessor`,
        );

        const missingCurrentRunInput = sealedTransportInput(sealedInspectionInput(root, {
          policyMode: 'autonomous',
          ...fixture.streams,
        }));
        const oneSided = resume(exactEffect(missingCurrentRunInput));
        assert.equal(oneSided.outcome, 'hard-stop', `${label}: one-sided projection`);
        assert.match(
          oneSided.reason,
          /^(occurrence-retention-incomplete|projection-missing-current-run)$/,
          `${label}: one-sided projection`,
        );
        assert.equal(
          readCheckpointRecord(checkpointRoot, key).acceptedStateBytes,
          canonicalJson(state),
          `${label}: one-sided projection retains predecessor`,
        );

        const resumed = resume(exactEffect(projectionInput));
        assert.equal(resumed.outcome, 'resumed', `${label}: exact dual projection`);
        assert.equal(resumed.reason, 'checkpoint-resumed', `${label}: exact dual projection`);
        assert.notEqual(
          resumed.adapter.snapshot().acceptedStateBytes,
          canonicalJson(state),
          `${label}: exact dual projection advances predecessor`,
        );
        resumed.adapter.end('controlled-end');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Feature 013 T006: the deterministic autonomous runner attaches the
// resolved-or-explicitly-unresolved halt report at its single terminal
// chokepoint `finish(row)`. Every fixture drives the real `runHostAdapter` end
// to end and asserts the `haltReport` the runner returns. The runtime — never
// the model — establishes the stop, its named-reason attribution, and the
// resolved-versus-unresolved decision (FR-010): the exchange only answers
// challenges; the report is computed in `finish` from the run's own terminal
// row (`stateBase64` + `reason`) and its last fresh Inspection.
//
// Reachability note (honest, per project lesson "an unreachable guard cannot be
// honestly covered"): through `runHostAdapter` the only current-run captures a
// run produces are completion dispositions, and `completionDispositionV2` emits
// exactly `accepted` / `verification-failed` / `review-rejected` — never a
// safety capture — so the five *named* safety-floor category reasons
// (`approval-required`, `safety-or-authority`, `external-dependency`,
// `ambiguous-state`) are not reachable as runner terminals here: three need a
// real work-session safety capture, and `ambiguous-state` (ownership ambiguity)
// is preempted by the runner's own `owner-resolution-failed` guard before any
// Inspection. Their exhaustive reporter-level coverage lives in
// recovery.test.mjs (Feature 013 T003 A–H). The reachable safety-relevant
// wiring behavior — a closed-set hard stop that still halts and requests human
// input carrying its named report, and an unattributable hard stop that still
// halts and reports explicitly unresolved (never continuable) — is covered by
// fixture E below.
// ---------------------------------------------------------------------------

/** The next owner action each closed-set stop class carries (mirrors recovery HALT_NEXT_ACTIONS). */
const F013_T006_NEXT_ACTIONS = Object.freeze({
  'hard-stop': 'request-human-input',
  'recoverable-checkpoint': 'inspect-and-recover',
  'budget-stop': 'raise-budget-or-end-run',
  'learning-stop': 'resolve-learning-governance',
  'guard-stop': 'correct-request-and-reinspect',
});

/** Rewrite the sealed lightweight task from `~` to a blank glyph so preflight orphans the run. */
function f013BlankSealedTask(root) {
  const tasksPath = path.join(root, TASKS_PATH);
  fs.writeFileSync(
    tasksPath,
    fs.readFileSync(tasksPath, 'utf8').replace(`- [~] ${TARGET.taskKey}`, `- [ ] ${TARGET.taskKey}`),
  );
  const taskStatePath = path.join(root, TASK_STATE_PATH);
  const taskState = JSON.parse(fs.readFileSync(taskStatePath, 'utf8'));
  taskState[TASKS_PATH].glyphs[TARGET.taskKey] = ' ';
  fs.writeFileSync(taskStatePath, `${JSON.stringify(taskState, null, 2)}\n`);
}

/** A sequential exchange that authorizes and settles the focused runner task. */
function f013SettlingExchange() {
  let assessment;
  return (challenge) => {
    if (challenge.kind === 'assessment') {
      assessment = focusedChallengeAssessment(challenge);
      return focusedChallengeResponse(challenge, 'assessment', assessment);
    }
    return focusedChallengeResponse(
      challenge,
      'specialistResult',
      focusedSpecialistPair(assessment, 'f013-t006'),
    );
  };
}

nodeTest('Feature 013 T006 A: an out-of-set disposition and an orphan terminal each report explicitly unresolved with no reason, target, or subject (FR-003, FR-004, FR-006)', async () => {
  // (a) Orphan terminal: the blank-task preflight refuses before any Inspection,
  //     so nothing — reason, target, or subject — can be established.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    f013BlankSealedTask(root);
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: memoryCheckpointStore().port,
      exchange() { throw new Error('an orphaned preflight must not reach the exchange'); },
    });
    assert.equal(result.outcome, 'hard-stop', 'an orphan preflight halts');
    assert.equal(result.reason, 'runner-refused');
    // The runner reason is not a member of the closed stop set, so it is never
    // presented as one: the report names it nowhere.
    assert.equal(Object.hasOwn(OUTCOME_REASON_CLASSES, result.reason), false, 'runner-refused is out of the closed set');
    assert.deepEqual(result.haltReport, { halted: true, resolved: false, unresolved: ['reason', 'target', 'subject'] });
    for (const field of ['reason', 'stopClass', 'target', 'subject', 'nextAction', 'evidenceHash']) {
      assert.equal(Object.hasOwn(result.haltReport, field), false, `an unresolved report carries no ${field}`);
    }
  });

  // (a) Out-of-set disposition: a stale Assessment with no exchange capability
  //     halts on an out-of-set diagnostic. The last Inspection is present (so the
  //     target could bind), but the reason is out of the closed set and no
  //     subject is established, so the report is unresolved and names no reason.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root, {
      assessment: { ...focusedRunnerRequest(root).assessment, evidenceHash: sha256('f013-t006-stale') },
    });
    const result = await runHostAdapter(request, { checkpoint: memoryCheckpointStore().port });
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'exchange-unavailable');
    assert.equal(Object.hasOwn(OUTCOME_REASON_CLASSES, result.reason), false, 'exchange-unavailable is out of the closed set');
    assert.equal(result.haltReport.halted, true);
    assert.equal(result.haltReport.resolved, false);
    assert.ok(Array.isArray(result.haltReport.unresolved) && result.haltReport.unresolved.length > 0);
    assert.ok(result.haltReport.unresolved.includes('reason'), 'the out-of-set reason is named unresolved');
    assert.ok(result.haltReport.unresolved.includes('subject'), 'the unestablished subject is named unresolved');
    assert.ok(
      result.haltReport.unresolved.every((field) => ['reason', 'target', 'subject'].includes(field)),
      'unresolved names only the halt report fields',
    );
    for (const field of ['reason', 'stopClass', 'subject', 'nextAction']) {
      assert.equal(Object.hasOwn(result.haltReport, field), false, `an unresolved report carries no ${field}`);
    }
  });
});

nodeTest('Feature 013 T006 B: a closed-set hard stop whose Inspection binds a deterministic probe reports resolved with the affected target, causing subject, and next owner action (FR-003, FR-004, FR-005, FR-010)', async () => {
  const expectedTarget = canonicalTarget(clone(TARGET));

  const assertResolved = (result, expected, label) => {
    assert.equal(result.outcome, 'hard-stop', label);
    assert.equal(result.reason, expected.reason, label);
    const report = result.haltReport;
    assert.deepEqual(Object.keys(report).sort(), [
      'evidenceHash', 'halted', 'nextAction', 'reason', 'resolved', 'stopClass', 'subject', 'target',
    ], `${label}: a resolved report carries exactly the eight named fields`);
    assert.equal(report.halted, true, label);
    assert.equal(report.resolved, true, label);
    // FR-004: the named reason is exactly the runner's own terminal reason and a
    // member of the frozen closed stop set — no new reason is introduced.
    assert.equal(report.reason, result.reason, label);
    assert.equal(Object.hasOwn(OUTCOME_REASON_CLASSES, report.reason), true, `${label}: reason is in the closed set`);
    assert.notEqual(classifyOutcomeReason(report.reason), 'authorized', label);
    assert.equal(report.stopClass, classifyOutcomeReason(report.reason), label);
    assert.equal(report.stopClass, expected.stopClass, label);
    // FR-005: the affected target, the specific causing subject, and the next
    // owner action are all present and actionable without reading the runtime.
    assert.deepEqual(report.target, expectedTarget, label);
    assert.equal(report.subject, expected.subject, label);
    assert.notEqual(report.subject, report.reason, `${label}: the subject never merely echoes the reason`);
    assert.equal(report.nextAction, F013_T006_NEXT_ACTIONS[report.stopClass], label);
    assert.match(report.evidenceHash, /^[0-9a-f]{64}$/, label);
  };

  // A pending authorization already in the accepted state makes the next attempt
  // not dispatchable; the deterministic RunState probe localizes it.
  let firstNotDispatchable = null;
  for (let run = 0; run < 2; run += 1) {
    await withSealedWorkspace(async (root) => {
      writeSealedTaskState(root);
      const result = await runHostAdapter(
        focusedRunnerRequest(root, { state: pendingState('autonomous') }),
        { checkpoint: memoryCheckpointStore().port, exchange: f013SettlingExchange() },
      );
      assertResolved(result, {
        reason: 'not-dispatchable',
        stopClass: 'guard-stop',
        subject: `pending-authorization:${canonicalJson(expectedTarget)}`,
      }, 'not-dispatchable');
      // FR-010: the runtime, not the model, owns the report. The report is
      // byte-identical across independent runs of the same deterministic stop,
      // and the exchange supplied none of its fields.
      if (firstNotDispatchable === null) firstNotDispatchable = canonicalJson(result.haltReport);
      else assert.equal(canonicalJson(result.haltReport), firstNotDispatchable, 'the resolved report is deterministic');
    });
  }

  // A recovery-mode attempt under a policy that disables recovery is a guard stop
  // the recovery-policy probe localizes — a second, distinct closed-set reason.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const state = emptyState('autonomous');
    state.policy.recover = false;
    const request = focusedRunnerRequest(root, { state });
    delete request.assessment;
    delete request.specialistResult;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange(challenge) {
        const assessment = focusedChallengeAssessment(challenge, {
          action: 'retry-task',
          materialInputs: { targets: ['src/skills/dude-work/host-adapter.mjs'], operations: ['retry-task'], checks: ['verification'] },
          summary: 'Recover under a policy that disables recovery.',
        });
        return focusedChallengeResponse(challenge, 'assessment', assessment);
      },
    });
    assertResolved(result, {
      reason: 'recovery-disabled',
      stopClass: 'guard-stop',
      subject: 'policy-recover:false',
    }, 'recovery-disabled');
  });
});

nodeTest('Feature 013 T006 C: a clean task-settled, cancelled, or controlled end is not a halt and carries haltReport null (FR-001)', async () => {
  // task-settled: the bound projection completes the task.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const result = await runHostAdapter(focusedRunnerRequest(root), { checkpoint: memoryCheckpointStore().port });
    assert.equal(result.outcome, 'ended');
    assert.equal(result.reason, 'task-settled');
    assert.equal(Object.hasOwn(result, 'haltReport'), true, 'the field is always present');
    assert.equal(result.haltReport, null, 'a clean settlement carries no halt report');
  });

  // cancelled: a cancel from the first Assessment challenge ends the run cleanly.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root, {
      assessment: { ...focusedRunnerRequest(root).assessment, evidenceHash: sha256('f013-t006-force-cancel') },
    });
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange: (challenge) => focusedCancelResponse(challenge),
    });
    assert.equal(result.outcome, 'ended');
    assert.equal(result.reason, 'cancelled');
    assert.equal(result.haltReport, null, 'a cancelled run carries no halt report');
  });

  // controlled-end: a no-progress governance settlement ends the loop cleanly and
  // is deliberately not reclassified as a named halt.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.state.policy.recovery = 2;
    request.specialistResult = focusedSpecialistPair(request.assessment, 'f013-t006-c-reject', 'rejected');
    let assessment;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange(challenge) {
        if (challenge.kind === 'learning-review') {
          const governedState = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
          return focusedChallengeResponse(challenge, 'review', governanceReview(governedState, 'no-progress').review);
        }
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge, {
            action: 'retry-task',
            materialInputs: { targets: ['src/skills/dude-work/host-adapter.mjs'], operations: ['retry-task'], checks: ['verification'] },
            summary: 'Retry after a retained rejected review.',
          });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(assessment, 'f013-t006-c-reject', 'rejected'),
        );
      },
    });
    assert.equal(result.outcome, 'ended');
    assert.equal(result.reason, 'controlled-unresolved-end');
    assert.equal(result.haltReport, null, 'a governance-controlled end carries no halt report');
  });
});

nodeTest('Feature 013 T006 D: a multi-attempt run surfaces progress and keeps working with no premature halt; only the terminal row carries the report (FR-001, FR-002)', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.state.policy.recovery = 2;
    request.specialistResult = focusedSpecialistPair(request.assessment, 'f013-t006-d-reject', 'rejected');
    const challengeKinds = [];
    let assessment;
    let selectedAlternative = null;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange(challenge) {
        challengeKinds.push(challenge.kind);
        if (challenge.kind === 'learning-review') {
          const governedState = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
          const governed = governanceReview(governedState, 'selected-alternative');
          selectedAlternative = governed.credible;
          return focusedChallengeResponse(challenge, 'review', governed.review);
        }
        if (challenge.kind === 'assessment') {
          const materialInputs = selectedAlternative === null
            ? { targets: ['src/skills/dude-work/host-adapter.mjs'], operations: ['retry-task'], checks: ['verification'] }
            : clone(selectedAlternative.approachBasis.materialInputs);
          assessment = focusedChallengeAssessment(challenge, { action: 'retry-task', materialInputs, summary: 'Continue after progress.' });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(
            assessment,
            selectedAlternative === null ? 'f013-t006-d-reject' : 'f013-t006-d-alt',
            selectedAlternative === null ? 'rejected' : 'accepted',
          ),
        );
      },
    });
    // The rejected first attempt did not stop the loop: it drove learning and a
    // second attempt, and the run settled only on the genuine completion.
    assert.equal(result.outcome, 'ended', `${result.reason}`);
    assert.equal(result.reason, 'task-settled');
    assert.equal(result.haltReport, null, 'no premature halt: the settled loop carries no report');
    assert.deepEqual(challengeKinds, ['assessment', 'specialist-pair', 'learning-review', 'assessment', 'specialist-pair'],
      'the loop kept working across attempts rather than halting to report');
    // A recoverable interim refusal (evidence-drift) was reported inline but never
    // ended the loop — progress reporting is decoupled from stopping.
    assert.ok(result.steps.some((step) => step.reason === 'review-rejected'), 'an interim rejection was surfaced');
    assert.ok(result.steps.length > 20, 'the run proceeded through many steps');
    // Only the terminal result carries `haltReport`; no intermediate step does.
    assert.ok(result.steps.every((step) => !Object.hasOwn(step, 'haltReport')),
      'a non-terminal step never carries a halt report');
  });
});

nodeTest('Feature 013 T006 E: a hard stop still halts and requests human input carrying its report; an unattributable hard stop still halts and reports explicitly unresolved; a persistent rejection is never approval (FR-007, FR-008)', async () => {
  const planPath = `${TARGET.specPath.slice(0, -'spec.md'.length)}plan.md`;

  // FR-007: a closed-set hard stop (the definition plan the autonomous policy
  // requires is missing) still halts and requests human input, carrying its
  // named report. `request-human-input` is exactly the `hard-stop` class action.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    fs.rmSync(path.join(root, planPath));
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: memoryCheckpointStore().port,
      exchange: f013SettlingExchange(),
    });
    assert.equal(result.outcome, 'hard-stop', 'the safety-floor hard stop still halts');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.equal(result.haltReport.resolved, true);
    assert.equal(result.haltReport.stopClass, 'hard-stop', 'it stays a hard stop, not reclassified');
    assert.equal(result.haltReport.nextAction, 'request-human-input', 'it requests human input');
    assert.equal(Object.hasOwn(OUTCOME_REASON_CLASSES, result.haltReport.reason), true);
    assert.equal(result.haltReport.subject, 'definition-plan', 'the report names the affected subject');
  });

  // Amended FR-007: a hard stop whose attribution cannot be bound still halts and
  // reports explicitly unresolved — never continuable, never a masqueraded named
  // halt. (A safety-floor *category* reason cannot be driven to unresolved
  // through the runner because it binds every surfaced blocker to the same fresh
  // Inspection; see the reachability note above. This reachable unattributable
  // hard stop demonstrates the identical wiring behavior.)
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root, {
      assessment: { ...focusedRunnerRequest(root).assessment, evidenceHash: sha256('f013-t006-e-unbound') },
    });
    const result = await runHostAdapter(request, { checkpoint: memoryCheckpointStore().port });
    assert.equal(result.outcome, 'hard-stop', 'an unattributable stop still halts');
    assert.equal(result.type, 'result', 'the run is terminal — never continued');
    assert.equal(result.haltReport.resolved, false, 'it reports explicitly unresolved');
    assert.ok(result.haltReport.unresolved.length > 0, 'it names the fields it could not establish');
    assert.equal(Object.hasOwn(result.haltReport, 'reason'), false, 'it names no closed-set reason it cannot substantiate');
  });

  // FR-008: a persistently rejected review is never treated as approval. It ends
  // on a governance-controlled end, not on `task-settled`/`completed`.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.state.policy.recovery = 2;
    request.specialistResult = focusedSpecialistPair(request.assessment, 'f013-t006-e-reject', 'rejected');
    let assessment;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange(challenge) {
        if (challenge.kind === 'learning-review') {
          const governedState = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
          return focusedChallengeResponse(challenge, 'review', governanceReview(governedState, 'no-progress').review);
        }
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge, {
            action: 'retry-task',
            materialInputs: { targets: ['src/skills/dude-work/host-adapter.mjs'], operations: ['retry-task'], checks: ['verification'] },
            summary: 'Retry after a retained rejected review.',
          });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          focusedSpecialistPair(assessment, 'f013-t006-e-reject', 'rejected'),
        );
      },
    });
    assert.equal(result.outcome, 'ended');
    assert.notEqual(result.reason, 'task-settled', 'a rejected review is never approved into a settlement');
    assert.notEqual(result.reason, 'completed', 'a rejected review is never approved');
    assert.equal(result.reason, 'controlled-unresolved-end');
    assert.equal(result.haltReport, null);
  });
});

nodeTest('Feature 013 T006 F: mutation sentinel — the finish attach binds hard-stop→report and ended→null, so deleting the attach or flipping the branch fails here', async () => {
  // A hard-stop terminal MUST carry a present, non-null report object.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const result = await runHostAdapter(
      focusedRunnerRequest(root, { state: pendingState('autonomous') }),
      { checkpoint: memoryCheckpointStore().port, exchange: f013SettlingExchange() },
    );
    assert.equal(result.outcome, 'hard-stop');
    // Deleting the `finish` attach makes this `undefined`; flipping the branch
    // (hard-stop → null) makes this `null`. Both fail here.
    assert.notEqual(result.haltReport, undefined, 'the finish attach must be present on a hard stop');
    assert.notEqual(result.haltReport, null, 'a hard stop must carry a report, not null');
    assert.equal(typeof result.haltReport, 'object');
    assert.equal(result.haltReport.halted, true);
  });

  // An `ended` terminal MUST carry the field present and exactly null.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const result = await runHostAdapter(focusedRunnerRequest(root), { checkpoint: memoryCheckpointStore().port });
    assert.equal(result.outcome, 'ended');
    // Deleting the attach makes `haltReport` absent (hasOwn false); flipping the
    // branch (ended → report) makes it a non-null object. Both fail here.
    assert.equal(Object.hasOwn(result, 'haltReport'), true, 'the finish attach must be present on an ended run');
    assert.equal(result.haltReport, null, 'an ended run must carry exactly null');
  });
});

// ---------------------------------------------------------------------------
// Feature 022 T002: the runner owns the stop and its attribution at the host-
// exchange boundary. Both tests drive the real production entry point
// `runHostAdapter(request, { exchange })`. A stale initial Assessment forces the
// runner to re-request through the host exchange, so a throwing exchange drives
// the genuine `exchange -> orphan -> finish` fallback path — the same single
// terminal safety writer Feature 013 T006 asserts against. The host exchange is
// caller-supplied and therefore untrusted for attribution.
// ---------------------------------------------------------------------------

/** The closed set of exchange-failure reason codes the runner itself may attribute. */
const F022_RUNNER_OWNED_EXCHANGE_REASONS = new Set([
  'supervisor-context-lost',
  'challenge-response-invalid',
  'exchange-context-lost',
]);

/** A focused runner request whose initial Assessment is stale, forcing an exchange re-request. */
function f022StaleExchangeRequest(root) {
  return focusedRunnerRequest(root, {
    assessment: {
      ...focusedRunnerRequest(root).assessment,
      evidenceHash: sha256('feature-022-stale-assessment'),
    },
  });
}

nodeTest('Feature 022 T002 regression: an exchange failure is attributed only with a runner-owned reason code, never a caller-supplied foreign code (FR-001, FR-002)', async () => {
  // (a) An arbitrary, non-runner-owned code the untrusted exchange raises must
  //     fall back to the runner-owned default and never become the halt reason.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const result = await runHostAdapter(f022StaleExchangeRequest(root), {
      checkpoint: memoryCheckpointStore().port,
      exchange() { throw Object.assign(new Error('boom'), { code: 'totally-arbitrary-code' }); },
    });
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'exchange-context-lost', 'a foreign code falls back to the runner-owned default');
    assert.notEqual(result.reason, 'totally-arbitrary-code', 'the caller-supplied code never becomes the halt reason');
  });

  // (b) A legitimate runner-owned exchange-failure code is carried through unchanged.
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const result = await runHostAdapter(f022StaleExchangeRequest(root), {
      checkpoint: memoryCheckpointStore().port,
      exchange() { throw Object.assign(new Error('lost while a challenge was outstanding'), { code: 'supervisor-context-lost' }); },
    });
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'supervisor-context-lost', 'a runner-owned code passes through unchanged');
  });
});

nodeTest('Feature 022 T002 integration: a fallback terminal from the real safety writer carries the orphaned target and a runner-owned reason while the halt report gains no top-level target (FR-003, FR-005, FR-006)', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = f022StaleExchangeRequest(root);
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      exchange() { throw Object.assign(new Error('exchange context lost'), { code: 'exchange-context-lost' }); },
    });
    assert.equal(result.outcome, 'hard-stop');
    // The fallback terminal carries a runner-owned reason...
    assert.ok(
      F022_RUNNER_OWNED_EXCHANGE_REASONS.has(result.reason),
      `the fallback carries a runner-owned reason, got ${result.reason}`,
    );
    // ...and identifies the target it orphaned (the new fallback-row field).
    assert.deepEqual(result.target, request.target, 'the fallback terminal names the orphaned target');
    // The evidence-derived halt report is unchanged (Feature 013 T006 A
    // semantics): still explicitly unresolved and carrying no top-level target.
    assert.equal(result.haltReport.halted, true);
    assert.equal(result.haltReport.resolved, false);
    assert.equal(Object.hasOwn(result.haltReport, 'target'), false, 'the halt report gains no top-level target');
  });
});

// ---------------------------------------------------------------------------
// Feature 061: work inspection source capacity
// ---------------------------------------------------------------------------

/** @param {number} index */
function feature061HostDraftBytes(index) {
  const suffix = String(index).padStart(3, '0');
  return Buffer.from([
    '---',
    `title: Host capacity draft ${suffix}`,
    `slug: host-capacity-draft-${suffix}`,
    'status: draft',
    '---',
    '',
    '## Idea',
    '',
    `Host inventory fixture ${suffix}.`,
    '',
  ].join('\n'));
}

/** @param {Record<string, unknown>} target @param {number} count @param {string} label */
function feature061RepeatedCapture(target, count, label) {
  const captured = sealedCapture(target, 'failed', [{ label }]);
  return Array.from({ length: count }, () => captured);
}

/** @param {string} root */
function feature061SourceOverflowInput(root) {
  return sealedTransportInput(sealedInspectionInput(root, {
    currentRun: feature061RepeatedCapture(TARGET, 62, 'feature-061-source-overflow'),
  }));
}

/** @param {number} index @param {number} expectedBytes */
function feature061SizedDraftBytes(index, expectedBytes) {
  const base = feature061HostDraftBytes(index);
  assert.ok(base.byteLength <= expectedBytes, 'capacity draft exceeds its allocated body size');
  return Buffer.concat([base, Buffer.alloc(expectedBytes - base.byteLength, 0x78)]);
}

/** @param {string} root @param {number} [remainingBytes] */
function feature061FillInspectionBody(root, remainingBytes = 1) {
  const limit = 4_194_304;
  const chargedPaths = [
    IDEA_PATH,
    TASKS_PATH,
    `${TARGET.specPath.slice(0, -'spec.md'.length)}plan.md`,
    TARGET.specPath,
  ];
  const baselineBytes = chargedPaths.reduce(
    (total, relativePath) => total + fs.statSync(path.join(root, relativePath)).size,
    0,
  );
  const fillerBytes = limit - remainingBytes - baselineBytes;
  const fillerCount = 4;
  const baseSize = Math.floor(fillerBytes / fillerCount);
  const sizes = Array.from(
    { length: fillerCount },
    (_, index) => baseSize + (index < fillerBytes % fillerCount ? 1 : 0),
  );
  assert.ok(sizes.every((size) => size <= 1_048_576), 'filler exceeds the individual body limit');
  const ideasRoot = path.join(root, '.dude/ideas');
  sizes.forEach((size, index) => {
    const lifecycle = 900 + index;
    fs.writeFileSync(
      path.join(ideasRoot, `${lifecycle}-host-capacity-draft-${lifecycle}.md`),
      feature061SizedDraftBytes(lifecycle, size),
    );
  });
  const aggregateBytes = fs.readdirSync(ideasRoot).reduce(
    (total, entry) => total + fs.statSync(path.join(ideasRoot, entry)).size,
    0,
  ) + chargedPaths.slice(1).reduce(
    (total, relativePath) => total + fs.statSync(path.join(root, relativePath)).size,
    0,
  );
  assert.equal(aggregateBytes, limit - remainingBytes);
  return { aggregateBytes, limit };
}

nodeTest('Feature 061: host admission carries the exact source-headroom refusal without state, permit, or lane effects', () => {
  withSealedWorkspace((root) => {
    const state = emptyState('autonomous');
    state.policy.overall = 10;
    const rawInput = sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: feature061RepeatedCapture(TARGET, 59, 'host-source-63'),
    });
    const inspection = inspect(rawInput);
    assert.equal(inspection.overflow, false, 'deduplication keeps the source guard reachable');
    assert.ok(modelPacket(inspection));
    const input = sealedTransportInput(rawInput);
    const assessment = {
      evidenceHash: inspection.evidenceHash,
      intent: 'unchanged',
      action: 'execute-task',
      materialInputs: clone(MATERIAL_INPUTS),
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Exercise host source-headroom admission.',
    };
    const direct = runCommand('authorize', {
      trigger: 'resume',
      state,
      input,
      assessment,
      mode: 'ordinary',
    });
    assert.deepEqual(direct.authorization.capacity, {
      budget: 'source-entries',
      limit: 64,
      required: 65,
      source: 'review',
      target: canonicalTarget(TARGET),
    });
    assert.deepEqual(direct.authorization.blocker, {
      code: 'evidence-incomplete',
      subject: 'capacity:source-entries:review:65',
      evidenceHash: inspection.evidenceHash,
    });

    let laneCalls = 0;
    const adapter = createHostAdapter(sealedInitial({
      state,
      inspectionIdentity: sha256(canonicalJson(inspection)),
    }), {
      laneOwner: {
        identity: sha256('feature-061-admission-lane-owner'),
        apply() {
          laneCalls += 1;
          throw new Error('capacity refusal reached the lane owner');
        },
      },
    });
    const predecessor = adapter.snapshot();
    const acceptedPredecessor = acceptedAuthorityTuple(predecessor);
    const refused = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
      authorization: { input, assessment },
    }));

    assert.equal(refused.outcome, 'hard-stop');
    assert.equal(refused.reason, 'evidence-incomplete');
    assert.deepEqual(refused.capacity, direct.authorization.capacity);
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedPredecessor);
    assert.equal(refused.session.acceptedStateBytes, canonicalJson(state));
    assert.equal(refused.session.acceptedRevision, 0);
    assert.equal(refused.session.acceptedState.pending.length, 0);
    assert.equal(laneCalls, 0);
    assert.equal(Object.hasOwn(refused.session, 'capacity'), false);
    assert.equal(canonicalJson(refused.session).includes('"capacity"'), false);
    assert.doesNotThrow(() => validateHostAdapterResult(refused));

    const sessionSmuggle = clone(refused);
    sessionSmuggle.session.capacity = clone(refused.capacity);
    assert.throws(
      () => validateHostAdapterResult(sessionSmuggle),
      /HostAdapterSession|unknown field|capacity/,
    );

    const wrongReason = clone(refused);
    wrongReason.reason = 'runtime-threw';
    wrongReason.session.disposition = 'runtime-threw';
    assert.throws(
      () => validateHostAdapterResult(wrongReason),
      /capacity|unknown field/,
    );
  });
});

nodeTest('Feature 061: a post-evidence capacity refusal preserves the old pending authorization byte-for-byte', () => {
  withSealedWorkspace((root) => {
    const state = pendingState('autonomous');
    state.policy.overall = 10;
    state.policy.recover = true;
    validateRunState(state);
    const input = sealedRecordInput(root, {
      currentRun: feature061RepeatedCapture(TARGET, 59, 'post-evidence-source-63'),
    });
    let laneCalls = 0;
    const adapter = createHostAdapter(sealedInitial({ state }), {
      laneOwner: {
        identity: sha256('feature-061-post-evidence-lane-owner'),
        apply() {
          laneCalls += 1;
          throw new Error('post-evidence capacity refusal reached the lane owner');
        },
      },
    });
    const predecessor = adapter.snapshot();
    const acceptedPredecessor = acceptedAuthorityTuple(predecessor);
    const refused = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: {
        input,
        result: specialistResult('feature-061-post-evidence', 'accepted'),
      },
    }));

    assert.equal(refused.outcome, 'hard-stop');
    assert.equal(refused.reason, 'evidence-incomplete');
    assert.deepEqual(refused.capacity, {
      budget: 'source-entries',
      limit: 64,
      required: 65,
      source: 'verification',
      target: canonicalTarget(TARGET),
    });
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedPredecessor);
    assert.equal(refused.session.acceptedStateBytes, predecessor.acceptedStateBytes);
    assert.equal(refused.session.acceptedRevision, predecessor.acceptedRevision);
    assert.deepEqual(refused.session.acceptedState.pending, state.pending);
    assert.equal(refused.session.acceptedState.overallUsed, 1);
    assert.equal(laneCalls, 0);
  });
});

nodeTest('Feature 061: unbranded resource lookalikes retain runtime-threw and never expose accessors or secrets', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const initialInspection = inspect(input);
    const lookalike = new TypeError();
    let codeReads = 0;
    let messageReads = 0;
    Object.defineProperty(lookalike, 'code', {
      configurable: true,
      enumerable: true,
      get() {
        codeReads += 1;
        return 'recovery-resource-limit';
      },
    });
    Object.defineProperty(lookalike, 'message', {
      configurable: true,
      enumerable: false,
      get() {
        messageReads += 1;
        return 'HOST_CAPACITY_SECRET: exceeds the resource limit of 64 total source entries';
      },
    });
    const adapter = createHostAdapter(sealedInitial({
      state: emptyState(),
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    }), {
      runtime: {
        identity: sha256('feature-061-unbranded-runtime'),
        invoke() {
          throw lookalike;
        },
      },
    });
    const predecessor = adapter.snapshot();
    const refused = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));

    assert.equal(refused.outcome, 'closed-refusal');
    assert.equal(refused.reason, 'runtime-threw');
    assert.equal(Object.hasOwn(refused, 'capacity'), false);
    assert.equal(canonicalJson(refused).includes('HOST_CAPACITY_SECRET'), false);
    assert.deepEqual({ codeReads, messageReads }, { codeReads: 0, messageReads: 0 });
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(predecessor));
  });
});

nodeTest('Feature 061: an injected matching capacity is carried only with fresh exact no-effect proof', () => {
  withSealedWorkspace((root) => {
    const input = feature061SourceOverflowInput(root);
    const initialInspection = inspect(sealedInspectionInput(root));
    let runtimeCalls = 0;
    const adapter = createHostAdapter(sealedInitial({
      state: emptyState(),
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    }), {
      runtime: {
        identity: sha256('feature-061-proven-no-effect-runtime'),
        invoke(command, lowLevelRequest) {
          runtimeCalls += 1;
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
    });
    const predecessor = adapter.snapshot();

    const refused = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));

    assert.equal(runtimeCalls, 1);
    assert.equal(refused.outcome, 'hard-stop');
    assert.equal(refused.reason, 'evidence-incomplete');
    assert.deepEqual(refused.capacity, {
      budget: 'source-entries',
      limit: 64,
      required: 65,
      source: 'current-run',
      target: canonicalTarget(TARGET),
    });
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(predecessor));
    assert.equal(Object.hasOwn(refused.session, 'capacity'), false);
  });
});

nodeTest('Feature 061: an injected copied-default runtime cannot claim matching capacity without no-effect proof', () => {
  for (const mode of ['missing', 'effect-observed', 'indeterminate']) {
    withSealedWorkspace((root) => {
      const input = feature061SourceOverflowInput(root);
      const initialInspection = inspect(sealedInspectionInput(root));
      let runtimeCalls = 0;
      const adapter = createHostAdapter(sealedInitial({
        state: emptyState(),
        inspectionIdentity: sha256(canonicalJson(initialInspection)),
      }), {
        runtime: {
          identity: sha256('dude-work/recovery.runCommand:v1'),
          invoke(command, lowLevelRequest) {
            runtimeCalls += 1;
            return { status: 'returned', value: runCommand(command, lowLevelRequest) };
          },
        },
        noEffectAuthority: refusingNoEffectAuthority(mode),
      });
      const predecessor = adapter.snapshot();

      const refused = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));

      assert.equal(runtimeCalls, 1, mode);
      assert.equal(refused.outcome, 'hard-stop', mode);
      assert.equal(refused.reason, 'runtime-threw', mode);
      assert.equal(Object.hasOwn(refused, 'capacity'), false, mode);
      assert.deepEqual(
        acceptedAuthorityTuple(refused.session),
        acceptedAuthorityTuple(predecessor),
        mode,
      );
    });
  }
});

nodeTest('Feature 061: a host capacity result rejects another target while retaining the targetless contract', () => {
  withSealedWorkspace((root) => {
    const initialInspection = inspect(sealedInspectionInput(root));
    const adapter = createHostAdapter(sealedInitial({
      state: emptyState(),
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    }));
    const refused = adapter.run(sealedRequest(adapter, 'fresh-inspection', {
      input: feature061SourceOverflowInput(root),
    }));
    assert.equal(refused.outcome, 'hard-stop');
    assert.deepEqual(refused.capacity.target, canonicalTarget(TARGET));
    assert.doesNotThrow(() => validateHostAdapterResult(refused));

    const mismatched = clone(refused);
    mismatched.capacity.target = canonicalTarget(SECOND_TARGET);
    assert.throws(
      () => validateHostAdapterResult(mismatched),
      /must be null or the exact session target/,
    );

    const targetless = clone(refused);
    targetless.capacity.target = null;
    assert.equal(validateHostAdapterResult(targetless).capacity.target, null);
  });
});

nodeTest('Feature 061 regression: host capacity budgets require non-coercible literal strings', () => {
  withSealedWorkspace((root) => {
    const initialInspection = inspect(sealedInspectionInput(root));
    const adapter = createHostAdapter(sealedInitial({
      state: emptyState(),
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    }));
    const refused = adapter.run(sealedRequest(adapter, 'fresh-inspection', {
      input: feature061SourceOverflowInput(root),
    }));
    assert.doesNotThrow(() => validateHostAdapterResult(refused));

    for (const [budget, limit, source] of [
      ['idea-inventory-entries', 999, '.dude/ideas'],
      ['source-entries', 64, 'current-run'],
      ['source-body-bytes', 1_048_576, 'current-run'],
      ['inspection-body-bytes', 4_194_304, 'current-run'],
      ['cli-request-bytes', 6_291_456, 'cli-request'],
      ['retained-descriptors', 64, 'current-run'],
      ['model-packet-bytes', 131_072, 'model-packet'],
    ]) {
      const candidate = clone(refused);
      candidate.capacity = {
        budget,
        limit,
        required: /** @type {number} */ (limit) + 1,
        source,
        target: canonicalTarget(TARGET),
      };
      assert.deepEqual(
        validateHostAdapterResult(candidate).capacity,
        candidate.capacity,
        /** @type {string} */ (budget),
      );
    }

    const coercions = [];
    const budgets = [
      ['array', ['source-entries']],
      ['toString', {
        toString() {
          coercions.push('toString');
          return 'source-entries';
        },
      }],
      ['valueOf', {
        toString() {
          coercions.push('valueOf:toString');
          return {};
        },
        valueOf() {
          coercions.push('valueOf');
          return 'source-entries';
        },
      }],
      ['throwing toString', {
        toString() {
          coercions.push('throwing toString');
          throw new Error('host capacity budget toString invoked');
        },
      }],
      ['throwing valueOf', {
        toString() {
          coercions.push('throwing valueOf:toString');
          return {};
        },
        valueOf() {
          coercions.push('throwing valueOf');
          throw new Error('host capacity budget valueOf invoked');
        },
      }],
      ['Symbol.toPrimitive', {
        [Symbol.toPrimitive]() {
          coercions.push('Symbol.toPrimitive');
          return 'source-entries';
        },
      }],
      ['throwing Symbol.toPrimitive', {
        [Symbol.toPrimitive]() {
          coercions.push('throwing Symbol.toPrimitive');
          throw new Error('host capacity budget Symbol.toPrimitive invoked');
        },
      }],
      ['number', 1],
      ['null', null],
      ['undefined', undefined],
      ['boxed string', Object('source-entries')],
    ];

    const outcomes = budgets.map(([name, budget]) => {
      const candidate = clone(refused);
      candidate.capacity.budget = budget;
      try {
        validateHostAdapterResult(candidate);
        return [name, 'accepted'];
      } catch {
        return [name, 'rejected'];
      }
    });
    assert.deepEqual(outcomes, budgets.map(([name]) => [name, 'rejected']));
    assert.deepEqual(coercions, []);
  });
});

nodeTest('Feature 061 regression: an injected runtime cannot claim the default identity to attribute another target capacity', () => {
  withSealedWorkspace((root) => {
    const input = sealedInspectionInput(root);
    const initialInspection = inspect(input);
    const wrongTarget = clone(SECOND_TARGET);
    const wrongInput = sealedInspectionInput(root, {
      target: wrongTarget,
      currentRun: feature061RepeatedCapture(wrongTarget, 62, 'wrong-target-capacity'),
    });
    let injectedCalls = 0;
    const adapter = createHostAdapter(sealedInitial({
      state: emptyState(),
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    }), {
      runtime: {
        identity: sha256('dude-work/recovery.runCommand:v1'),
        invoke() {
          injectedCalls += 1;
          return runCommand('inspect', {
            trigger: 'explicit-inspection',
            input: wrongInput,
          });
        },
      },
    });
    const predecessor = adapter.snapshot();
    const refused = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input }));

    assert.deepEqual({
      injectedCalls,
      outcome: refused.outcome,
      reason: refused.reason,
      capacity: Object.hasOwn(refused, 'capacity') ? refused.capacity : null,
      attributesWrongTarget: canonicalJson(refused).includes(SECOND_TARGET.taskKey),
    }, {
      injectedCalls: 1,
      outcome: 'closed-refusal',
      reason: 'runtime-threw',
      capacity: null,
      attributesWrongTarget: false,
    });
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(predecessor));
  });
});

nodeTest('Feature 061: initial runner body overflow reports bounded capacity with a null evidence hash', async () => {
  await withSealedWorkspace(async (root) => {
    const request = focusedRunnerRequest(root);
    request.specialistResult = focusedSpecialistPair(
      request.assessment,
      'feature-061-initial-capacity',
    );
    const tasksPath = path.join(root, TASKS_PATH);
    const ownerPath = path.join(root, IDEA_PATH);
    const tasks = fs.readFileSync(tasksPath);
    const owner = fs.readFileSync(ownerPath);
    const oversizedTasks = Buffer.concat([
      tasks,
      Buffer.alloc(1_048_577 - tasks.byteLength, 0x20),
    ]);
    fs.writeFileSync(tasksPath, oversizedTasks);
    const directError = (() => {
      try {
        inspect(sealedInspectionInput(root, { policyMode: 'autonomous' }));
      } catch (error) {
        return error;
      }
      assert.fail('oversized task history did not refuse direct inspection');
    })();
    const directCapacity = capacityDiagnostic(directError);
    assert.deepEqual(directCapacity, {
      budget: 'source-body-bytes',
      limit: 1_048_576,
      required: 1_048_577,
      source: 'task-history',
      target: canonicalTarget(TARGET),
    });

    const checkpoint = memoryCheckpointStore();
    let exchangeCalls = 0;
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      exchange() {
        exchangeCalls += 1;
        throw new Error('pre-inspection capacity reached the exchange');
      },
    });

    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.deepEqual(result.capacity, directCapacity);
    assert.deepEqual(
      JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8')),
      request.state,
    );
    assert.equal(result.stateHash, sha256(canonicalJson(request.state)));
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].step, 'runner');
    assert.equal(result.steps.some((step) => step.step === 'admitted'), false);
    assert.deepEqual(result.haltReport, {
      halted: true,
      resolved: true,
      reason: 'evidence-incomplete',
      stopClass: 'hard-stop',
      target: canonicalTarget(TARGET),
      subject: 'capacity:source-body-bytes:task-history:1048577',
      nextAction: 'request-human-input',
      evidenceHash: null,
    });
    assert.equal(exchangeCalls, 0);
    assert.deepEqual(checkpoint.calls, []);
    assert.deepEqual(fs.readFileSync(tasksPath), oversizedTasks);
    assert.deepEqual(fs.readFileSync(ownerPath), owner);
  });
});

nodeTest('Feature 061: a late capture capacity refusal never borrows an older Inspection hash', async () => {
  await withSealedWorkspace(async (root) => {
    const boundary = feature061FillInspectionBody(root);
    const request = focusedRunnerRequest(root);
    request.specialistResult = focusedSpecialistPair(
      request.assessment,
      'feature-061-late-capture-capacity',
    );
    const priorEvidenceHash = request.assessment.evidenceHash;
    const tasksPath = path.join(root, TASKS_PATH);
    const ownerPath = path.join(root, IDEA_PATH);
    const tasksBefore = fs.readFileSync(tasksPath);
    const ownerBefore = fs.readFileSync(ownerPath);
    const returnedInspectionHashes = [];
    let captureReviewBytes = 0;
    let laneCalls = 0;
    const checkpoint = memoryCheckpointStore();

    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('feature-061-late-capture-runtime'),
        invoke(command, lowLevelRequest) {
          if (command === 'complete' && lowLevelRequest.mode === 'capture') {
            const review = lowLevelRequest.input.review;
            if (Array.isArray(review) && review.length === 1) {
              captureReviewBytes = Buffer.from(review[0].bytes.base64, 'base64').byteLength;
            }
          }
          const value = runCommand(command, lowLevelRequest);
          if (value && typeof value === 'object' && Object.hasOwn(value, 'inspection')) {
            returnedInspectionHashes.push(value.inspection.evidenceHash);
          }
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('feature-061-late-capture-lane-owner'),
        apply() {
          laneCalls += 1;
          throw new Error('late capacity refusal reached the lane owner');
        },
      },
    });

    assert.ok(returnedInspectionHashes.includes(priorEvidenceHash));
    assert.ok(captureReviewBytes > 0);
    const required = boundary.aggregateBytes + captureReviewBytes;
    assert.ok(required > boundary.limit);
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.deepEqual(result.capacity, {
      budget: 'inspection-body-bytes',
      limit: boundary.limit,
      required,
      source: 'review',
      target: canonicalTarget(TARGET),
    });
    const authorized = result.steps.find((step) => (
      step.step === 'attempt:1:authorize-attempt' && step.reason === 'authorized'
    ));
    assert.ok(authorized, 'the attempt is authorized before the unknown capture bytes arrive');
    assert.equal(result.stateHash, authorized.stateHash, 'the late refusal preserves accepted state');
    assert.equal(result.steps.at(-1).step, 'attempt:1:record-attempt-result');
    assert.equal(result.steps.at(-1).reason, 'evidence-incomplete');
    assert.deepEqual(result.steps.at(-1).capacity, result.capacity);
    assert.deepEqual(result.haltReport, {
      halted: true,
      resolved: true,
      reason: 'evidence-incomplete',
      stopClass: 'hard-stop',
      target: canonicalTarget(TARGET),
      subject: `capacity:inspection-body-bytes:review:${required}`,
      nextAction: 'request-human-input',
      evidenceHash: null,
    });
    assert.notEqual(result.haltReport.evidenceHash, priorEvidenceHash);
    assert.equal(laneCalls, 0);
    assert.deepEqual(fs.readFileSync(tasksPath), tasksBefore);
    assert.deepEqual(fs.readFileSync(ownerPath), ownerBefore);
  });
});

nodeTest('Feature 061: real runner completion settles one structured Tester/Reviewer pair with 63 ideas', async () => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const ideasRoot = path.join(root, '.dude/ideas');
    for (let index = 1; index <= 63; index += 1) {
      if (index === 18) continue;
      const suffix = String(index).padStart(3, '0');
      fs.writeFileSync(
        path.join(ideasRoot, `${suffix}-host-capacity-draft-${suffix}.md`),
        feature061HostDraftBytes(index),
      );
    }
    assert.equal(fs.readdirSync(ideasRoot).length, 63);

    const request = focusedRunnerRequest(root);
    request.specialistResult = focusedSpecialistPair(
      request.assessment,
      'feature-061-real-completion',
    );
    const runtimeCalls = [];
    const captureInputs = [];
    const laneOperations = [];
    const checkpoint = memoryCheckpointStore();
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('feature-061-real-completion-runtime'),
        invoke(command, lowLevelRequest) {
          runtimeCalls.push(`${command}:${lowLevelRequest.mode || 'ordinary'}`);
          if (command === 'complete' && lowLevelRequest.mode === 'capture') {
            captureInputs.push(clone(lowLevelRequest.input));
          }
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      laneOwner: {
        identity: sha256('feature-061-real-completion-lane-owner'),
        apply(laneRequest) {
          laneOperations.push({
            operation: laneRequest.operation,
            kind: laneRequest.mutation.kind,
          });
          return applyLightweightWorkRequest(laneRequest);
        },
      },
    });

    assert.equal(
      result.outcome,
      'ended',
      `${result.reason}:${result.steps.map((step) => `${step.step}=${step.reason}`).join(',')}`,
    );
    assert.equal(result.reason, 'task-settled');
    assert.equal(result.haltReport, null);
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.equal(captureInputs.length, 1);
    assert.equal(captureInputs[0].verification.length, 1, 'one fresh Tester capture');
    assert.equal(captureInputs[0].review.length, 1, 'one fresh independent Reviewer capture');
    assert.equal(captureInputs[0].verification[0].state, 'passed');
    assert.equal(captureInputs[0].review[0].state, 'accepted');
    assert.deepEqual(captureInputs[0].lint, [], 'execute-task requires no lint capture');
    for (const [step, reason] of [
      ['attempt:1:authorize-attempt', 'authorized'],
      ['attempt:1:record-attempt-result', 'occurrence-retention-required'],
      ['attempt:1:settle-completion', 'completed'],
      ['audit-run', 'run-audited'],
      ['authorize-lane-effect', 'lane-permit-issued'],
      ['apply-lane-effect', 'lane-mutation-applied'],
      ['commit-lane-receipt', 'lane-receipt-committed'],
      ['final-audit', 'run-audited'],
      ['end', 'task-settled'],
    ]) {
      assert.ok(
        result.steps.some((row) => row.step === step && row.reason === reason),
        `${step}=${reason}`,
      );
    }
    assert.ok(
      result.steps.some((row) => row.step === 'attempt:1:completion:apply-projection:1'),
      'completion projection is applied',
    );
    assert.ok(
      result.steps.some((row) => row.step === 'attempt:1:completion:commit-projection:1'),
      'completion projection receipt is committed',
    );
    assert.ok(runtimeCalls.includes('authorize:ordinary'));
    assert.ok(runtimeCalls.includes('complete:capture'));
    assert.ok(runtimeCalls.includes('complete:finalize'));
    assert.ok(runtimeCalls.includes('audit:ordinary'));
    assert.ok(laneOperations.some(({ operation, kind }) => (
      operation === 'work-project' && kind === 'append-event'
    )));
    assert.ok(laneOperations.some(({ operation, kind }) => (
      operation === 'work-set' && kind === 'task-completed'
    )));
    assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 1);
    assert.equal(checkpoint.pair.checkpoint, null);
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[x\\] ${TARGET.taskKey}`));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      'x',
    );
    assert.equal(fs.readdirSync(ideasRoot).length, 63);
  });
});

/** @param {Record<string, unknown>} input @param {number} expectedBytes */
function sizedHostPacketInput(input, expectedBytes) {
  const output = clone(input);
  output.session = {
    target: clone(TARGET),
    availability: 'available',
    bytes: { base64: Buffer.from('x').toString('base64') },
  };
  const { inspection } = runCommand('inspect', { trigger: 'explicit-inspection', input: output });
  assert.equal(inspection.overflow, false);
  const owner = JSON.parse(inspection.items.find((item) => item.source === 'owner-log').text);
  assert.equal(owner.events.length, 1, 'the complete fixture owner log is already its minimum suffix');
  let length = Math.max(1, expectedBytes - feature029PacketBytes(inspection));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const text = 'x'.repeat(length);
    const items = inspection.items.map((item) => (
      item.source === 'session' ? { ...item, ...contentDescriptor(text), text } : item
    ));
    const actual = feature029PacketBytes(inspection, items);
    if (actual === expectedBytes) {
      output.session.bytes.base64 = Buffer.from(text).toString('base64');
      return output;
    }
    length += expectedBytes - actual;
  }
  assert.fail(`could not construct a complete ${expectedBytes}-byte host packet`);
}

nodeTest('T002 known growth measures all 17 actual lane-first and receipt prefixes before issuing permits', (context) => {
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const label = 'known-growth';
    const findings = Array.from({ length: 16 }, (_, index) => ({
      basis: {
        expectation: { kind: 'governing-rule', reference: `growth rule:${index}` },
        subjects: [TARGET.taskKey],
        failureClass: 'review-rejection',
        checkDefinition: `focused check:${label}`,
      },
      observation: { kind: 'observed-evidence', evidence: `growth finding:${index}` },
    }));
    const fixture = sealedTrustedFixture(state, label, 'rejected', findings);
    let laneCalls = 0;
    const adapter = createHostAdapter(sealedInitial({ state }), {
      laneOwner: {
        identity: sha256('T002-known-growth-lane'),
        apply(request) {
          laneCalls += 1;
          return applyLightweightWorkRequest(request);
        },
      },
    });
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
    }));
    assert.equal(captured.reason, 'occurrence-retention-required');
    const { projectionBatch, provisionalState } = captured.session.pendingEffect;
    assert.equal(projectionBatch.events.length, 17);
    const originals = [TASKS_PATH, TASK_STATE_PATH, IDEA_PATH]
      .map(relative => [relative, fs.readFileSync(path.join(root, relative))]);
    const currentEvents = [];
    const input = () => sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: currentEvents.length === 0
        ? []
        : [sealedCapture(TARGET, 'failed', currentEvents.map(event => ({ event })))],
      ...fixture.streams,
      session: { target: clone(TARGET), availability: 'available', bytes: { base64: Buffer.from('x').toString('base64') } },
    }));
    const observations = [];
    const observe = (prefix, surface) => {
      const { inspection } = runCommand('inspect', { trigger: 'explicit-inspection', input: input() });
      assert.equal(inspection.overflow, false);
      observations.push({ prefix, surface, inspection, bytes: feature029PacketBytes(inspection) });
    };
    observe(0, 'before');
    for (let index = 0; index < projectionBatch.events.length; index += 1) {
      const binding = sealedLaneBinding(root);
      const prepared = runCommand('transition', {
        mode: 'prepare-projection',
        state: provisionalState,
        input: input(),
        projectionBatch,
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
        operationTime: LANE_MUTATION.snapshotUpdatedAt,
      });
      assert.equal(prepared.transition.reason, 'projection-prepared');
      const item = prepared.transition.plan.items[index];
      const applied = applyLightweightWorkRequest({
        version: 1,
        operation: 'work-project',
        ...binding.application,
        target: clone(TARGET),
        state: provisionalState,
        permit: item.projectionPermit,
        mutation: item.mutation,
      });
      assert.equal(applied.ok, true, JSON.stringify(applied));
      observe(index + 1, 'lane-first');
      currentEvents.push(clone(item.currentRunRecord.substantive.event));
      observe(index + 1, 'receipt');
      const committed = runCommand('transition', {
        mode: 'commit-lane-receipt',
        state: provisionalState,
        input: input(),
        permit: item.projectionPermit,
        receipt: applied.receipt,
      });
      assert.equal(committed.transition.committed, true);
    }
    assert.equal(observations.at(-1).bytes, Math.max(...observations.map(row => row.bytes)));
    const exact = sizedHostPacketInput(input(), 131_072).session;
    const sessionText = Buffer.from(exact.bytes.base64, 'base64').toString('utf8');
    const sizedBytes = row => feature029PacketBytes(row.inspection, row.inspection.items.map(item => (
      item.source === 'session' ? { ...item, ...contentDescriptor(sessionText), text: sessionText } : item
    )));
    assert.equal(sizedBytes(observations.at(-1)), 131_072);
    assert.ok(sizedBytes(observations[2]) < 131_072, 'the first complete receipt fits; a later prefix controls');
    context.diagnostic(JSON.stringify({
      knownGrowth: observations.map(row => ({ prefix: row.prefix, surface: row.surface, bytes: sizedBytes(row) })),
    }));
    for (const [relative, bytes] of originals) fs.writeFileSync(path.join(root, relative), bytes);
    currentEvents.length = 0;
    const binding = sealedLaneBinding(root);
    const preparation = session => ({
      projection: {
        input: { ...input(), session },
        laneBinding: {
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
          operationTime: LANE_MUTATION.snapshotUpdatedAt,
        },
      },
    });
    const equality = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', preparation(exact)));
    assert.equal(equality.reason, 'projection-prepared', equality.reason);
    assert.equal(equality.product.plan.items.length, 17);
    const before = adapter.snapshot();
    const excessive = clone(exact);
    excessive.bytes.base64 = Buffer.from(`${sessionText}x`).toString('base64');
    const refused = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', preparation(excessive)));
    assert.equal(refused.outcome, 'hard-stop');
    assert.equal(refused.reason, 'evidence-incomplete');
    assert.deepEqual(refused.capacity, {
      budget: 'model-packet-bytes', limit: 131_072, required: 131_073,
      source: 'model-packet', target: canonicalTarget(TARGET),
    });
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(before));
    assert.deepEqual(refused.session.pendingEffect, before.pendingEffect);
    assert.equal(laneCalls, 0, 'no affected lane operation occurs on preparation');
    for (const [relative, bytes] of originals) {
      assert.deepEqual(fs.readFileSync(path.join(root, relative)), bytes, relative);
    }
  });
});

nodeTest('T002 runner freshly prechecks lane-first and publishes exactly the privately staged record', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs');
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const calls = [];
    const applications = [];
    const result = await module.runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('T002-lane-first-runtime'),
        invoke(command, request) {
          const value = runCommand(command, request);
          calls.push({ command, request: clone(request), value: clone(value) });
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('T002-lane-first-owner'),
        apply(request) {
          if (request.operation === 'work-project') {
            const preparations = calls.filter(call => call.request.mode === 'prepare-projection');
            const item = preparations.at(-1).value.transition.plan.items[0];
            applications.push({
              item: clone(item), preparations: clone(preparations),
              permit: clone(request.permit), prior: laneSurfaceDigests(root),
              currentBefore: clone(module.testCurrentRun),
              authorityBefore: module.testAuthorityObservation(root, TARGET, {
                ideaPath: IDEA_PATH, specPath: TARGET.specPath,
              }, module.testCurrentRun),
            });
          }
          const result = applyLightweightWorkRequest(request);
          if (request.operation === 'work-project') {
            applications.at(-1).currentAfterWrite = clone(module.testCurrentRun);
            applications.at(-1).authorityAfterWrite = module.testAuthorityObservation(root, TARGET, {
              ideaPath: IDEA_PATH, specPath: TARGET.specPath,
            }, module.testCurrentRun);
            applications.at(-1).expectedAfterWrite = sha256(canonicalJson({
              version: 1, root, target: canonicalTarget(TARGET),
              owner: { ideaPath: IDEA_PATH, specPath: TARGET.specPath },
              lanePrestate: sealedLaneBinding(root).lanePrestate, currentRun: [],
            }));
          }
          return result;
        },
      },
    });
    assert.equal(result.reason, 'task-settled', result.reason);
    assert.equal(applications.length, 1);
    const { preparations, item, permit } = applications[0];
    assert.equal(preparations.length, 2, 'preparation is freshly rederived before the lane owner');
    assert.deepEqual(preparations[1].request, preparations[0].request);
    assert.deepEqual(preparations[1].request.input.currentRun, [], 'staged bytes are not observed authority');
    assert.deepEqual(permit, item.projectionPermit);
    assert.deepEqual(applications[0].currentBefore, [], 'the actual retained stream is still old at the writer');
    assert.deepEqual(applications[0].currentAfterWrite, [], 'even the lane-first poststate has no publication yet');
    assert.equal(applications[0].authorityBefore.complete, true);
    assert.deepEqual(applications[0].authorityAfterWrite, {
      complete: true, identity: applications[0].expectedAfterWrite,
    }, 'the actual no-effect observer hashes old current-run and freshly written lane bytes');
    assert.deepEqual(module.testCurrentRun, [item.currentRunRecord]);
    const receipt = calls.find(call => call.request.mode === 'commit-lane-receipt');
    const capture = JSON.parse(Buffer.from(receipt.request.input.currentRun[0].bytes.base64, 'base64'));
    assert.deepEqual(capture.records, [applications[0].item.currentRunRecord]);
    assert.equal(receipt.request.input.currentRun[0].outcomeHash, sha256(canonicalJson({
      target: clone(TARGET), state: 'failed', records: [applications[0].item.currentRunRecord.substantive],
    })));
    assert.notEqual(receipt.request.receipt.tasksPoststateHash, applications[0].prior[TASKS_PATH]);
  });
});

for (const relative of [TASKS_PATH, TASK_STATE_PATH, IDEA_PATH, TARGET.specPath, TARGET.specPath.replace('/spec.md', '/plan.md')]) {
  nodeTest(`T002 application reacquires source/prestate drift before any lane write (${relative})`, () => {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const state = pendingState('autonomous');
      const fixture = sealedTrustedFixture(state, 'application-drift', 'accepted');
      let applications = 0;
      const adapter = createHostAdapter(sealedInitial({ state }), {
        laneOwner: {
          identity: sha256('T002-drift-owner'),
          apply(request) {
            applications += 1;
            return applyLightweightWorkRequest(request);
          },
        },
      });
      const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
      }));
      assert.equal(captured.reason, 'occurrence-retention-required');
      const input = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous', ...fixture.streams }));
      const binding = sealedLaneBinding(root);
      const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
        projection: {
          input,
          laneBinding: {
            lanePrestate: binding.lanePrestate,
            targetMapping: binding.targetMapping,
            operationTime: LANE_MUTATION.snapshotUpdatedAt,
          },
        },
      }));
      assert.equal(prepared.reason, 'projection-prepared');
      const item = prepared.product.plan.items[0];
      fs.appendFileSync(path.join(root, relative), '\n');
      const before = adapter.snapshot();
      const filesBefore = laneSurfaceDigests(root);
      const refused = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: item.projectionPermit, mutation: item.mutation },
      }));
      assert.equal(refused.outcome, 'closed-refusal', refused.reason);
      assert.equal(refused.reason, [TASKS_PATH, TASK_STATE_PATH, IDEA_PATH].includes(relative)
        ? 'lane-prestate-mismatch' : 'inspection-stale');
      assert.equal(applications, 0);
      assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(before));
      assert.deepEqual(refused.session.pendingEffect, before.pendingEffect);
      assert.deepEqual(laneSurfaceDigests(root), filesBefore);
    });
  });
}

nodeTest('T002 application requires exact owner, mapping and expected source bytes before reaching the lane owner', () => {
  const cases = [
    ['owner identity', application => { application.owner.ideaPath = '.dude/ideas/099-foreign-owner.md'; }],
    ['mapping', application => { application.mapping.tasksDescriptor.sha256 = sha256('foreign tasks'); }],
    ['tasks capture', application => {
      application.expected.tasks = capturedBytesV1(Buffer.from(
        `${Buffer.from(application.expected.tasks.base64, 'base64')}extra\n`,
      ));
    }],
    ['snapshot capture', application => { application.expected.taskState = capturedBytesV1('{}\n'); }],
  ];
  for (const [label, mutate] of cases) {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const state = pendingState('autonomous');
      const fixture = sealedTrustedFixture(state, `exact-bindings:${label}`, 'accepted');
      let writes = 0;
      const adapter = createHostAdapter(sealedInitial({ state }), {
        laneOwner: {
          identity: sha256('T002-exact-binding-owner'),
          apply(request) {
            writes += 1;
            return applyLightweightWorkRequest(request);
          },
        },
      });
      const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
      }));
      assert.equal(captured.reason, 'occurrence-retention-required', label);
      const binding = sealedLaneBinding(root);
      const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
        projection: {
          input: sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous', ...fixture.streams })),
          laneBinding: {
            lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping,
            operationTime: LANE_MUTATION.snapshotUpdatedAt,
          },
        },
      }));
      assert.equal(prepared.reason, 'projection-prepared', label);
      const item = prepared.product.plan.items[0];
      const application = { ...binding.application, permit: item.projectionPermit, mutation: item.mutation };
      mutate(application);
      const before = adapter.snapshot();
      const filesBefore = laneSurfaceDigests(root);
      const refused = adapter.run(sealedRequest(adapter, 'apply-lane-effect', { laneApplication: application }));
      assert.equal(refused.reason, 'lane-permit-binding-mismatch', label);
      assert.equal(refused.outcome, 'hard-stop', label);
      assert.equal(writes, 0, label);
      assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(before), label);
      assert.deepEqual(refused.session.pendingEffect, before.pendingEffect, label);
      assert.deepEqual(laneSurfaceDigests(root), filesBefore, label);
    });
  }
});

/**
 * Test-owned instrumentation of actual private memory, with no shipped introspection API.
 * @param {'host-adapter.mjs'|'host-adapter-runner.mjs'} file @param {boolean} [observeOwner]
 */
async function workModuleWithObservation(file, observeOwner = false) {
  const url = new URL(file, import.meta.url);
  let source = fs.readFileSync(url, 'utf8');
  const adapter = file === 'host-adapter.mjs';
  const needle = adapter ? '  const ledger = createLaneLedger();' : '  const currentRun = [];';
  const variable = adapter ? 'testLaneLedger' : 'testCurrentRun';
  assert.equal(source.split(needle).length, 2, 'exactly one private memory owner');
  source = source.replace(needle, `${needle}\n  ${variable} = ${adapter ? 'ledger' : 'currentRun'};`);
  if (observeOwner) {
    source += '\nexport let testOwnerContext = null;\nexport const testModuleUrl = import.meta.url;\n';
    if (adapter) {
      source = source.replace(needle, `${needle}
  testOwnerContext = {
    get session() { return current; },
    get host() { return host; },
    replaceSession(value) { current = validateHostAdapterSession(value); },
  };`);
      source += '\nexport { ADMITTED_INVOCATIONS as testAdmittedInvocations };\n';
    } else {
      const observedAdapter = await workModuleWithObservation('host-adapter.mjs', true);
      source = source.replace("from './host-adapter.mjs';", `from '${observedAdapter.testModuleUrl}';`);
      source += `\nexport * as testAdapterModule from '${observedAdapter.testModuleUrl}';\nexport let testTerminal = null;\n`;
      const admission = '    const admitted = adapter.snapshot();';
      assert.equal(source.split(admission).length, 2);
      source = source.replace(admission, `    testOwnerContext = {
      ports, run, refreshInspection,
      get adapter() { return adapter; },
      replaceAdapter(value) { adapter = value; },
    };\n${admission}`);
      const terminal = '    if (finalizeRejectedAssessment === undefined) return terminal;';
      assert.equal(source.split(terminal).length, 2);
      source = source.replace(terminal, `    testTerminal = terminal;\n${terminal}`);
    }
  }
  source = source.replace(/from '(\.[^']+)'/g, (_match, relative) => `from '${new URL(relative, url).href}'`);
  source += `\nexport let ${variable} = null;\n`;
  if (!adapter) source += 'export { authorityObservation as testAuthorityObservation };\n';
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

nodeTest('T002 preparation capsules are bounded, frozen, shared per batch and released without losing replay seals', async () => {
  const module = await workModuleWithObservation('host-adapter.mjs');
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'capsule-lifetime');
    const adapter = module.createHostAdapter(sealedInitial({ state }), {
      supervisorSession: sealedSupervisorSession(),
      noEffectAuthority: sealedNoEffectAuthority(),
    });
    const ledger = module.testLaneLedger;
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
    }));
    assert.equal(captured.reason, 'occurrence-retention-required');
    const accepted = acceptedAuthorityTuple(adapter.snapshot());
    const currentEvents = [];
    const input = () => sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: currentEvents.length === 0
        ? []
        : [sealedCapture(TARGET, 'failed', currentEvents.map(event => ({ event })))],
      ...fixture.streams,
    }));
    const prepare = (time = LANE_MUTATION.snapshotUpdatedAt) => {
      const binding = sealedLaneBinding(root);
      const projection = {
        input: input(),
        laneBinding: {
          lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping, operationTime: time,
        },
      };
      const result = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', { projection }));
      assert.equal(result.reason, 'projection-prepared', result.reason);
      const entries = result.product.plan.items.map(item => ledger.permits.get(item.projectionPermit.permitHash));
      const capsule = entries[0].preparation;
      assert.ok(entries.every(entry => entry.preparation === capsule), 'one shared batch reference');
      assert.ok(Object.isFrozen(capsule) && Object.isFrozen(capsule.request.input));
      assert.ok(Object.isFrozen(capsule.request.input.verification[0].bytes));
      assert.ok(Buffer.byteLength(canonicalJson(capsule.request)) <= 6_291_456);
      assert.deepEqual(capsule.request.input, projection.input, 'all complete accumulated captures are retained');
      projection.input.verification.length = 0;
      assert.equal(capsule.request.input.verification.length, 1, 'the preparation is detached from caller memory');
      assert.throws(() => { capsule.request.input.review.length = 0; }, TypeError);
      return { binding, result, entries, capsule };
    };
    const first = prepare();
    const superseding = prepare('2026-01-01T00:00:01Z');
    assert.ok(first.entries.every(entry => entry.preparation === null && entry.stage === 'superseded'));
    assert.notEqual(first.capsule, superseding.capsule);
    const item = superseding.result.product.plan.items[0];
    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: {
        ...superseding.binding.application, permit: item.projectionPermit, mutation: item.mutation,
      },
    }));
    assert.equal(applied.reason, 'lane-projection-applied', applied.reason);
    assert.ok([...ledger.permits.values()].every(entry => entry.preparation === null));
    currentEvents.push(item.currentRunRecord.substantive.event);
    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: { input: input(), permit: item.projectionPermit, receipt: applied.product.receipt },
    }));
    assert.equal(committed.reason, 'lane-receipt-committed');
    const seal = ledger.permits.get(item.projectionPermit.permitHash);
    assert.equal(seal.stage, 'committed');
    assert.deepEqual(seal.receipt, applied.product.receipt);
    const remaining = prepare();
    assert.notEqual(remaining.capsule.request.lanePrestate.tasksDescriptor.sha256,
      superseding.capsule.request.lanePrestate.tasksDescriptor.sha256);
    assert.deepEqual(JSON.parse(Buffer.from(
      remaining.capsule.request.input.currentRun[0].bytes.base64, 'base64',
    )).records, [item.currentRunRecord], 'rederivation binds the observed prefix, not stale initial surfaces');
    assert.deepEqual(acceptedAuthorityTuple(adapter.snapshot()), accepted);
    const size = ledger.permits.size;
    adapter.end('cancelled');
    assert.ok([...ledger.permits.values()].every(entry => entry.preparation === null));
    assert.equal(ledger.permits.size, size, 'release keeps the small replay seals');
    assert.equal(seal.stage, 'committed');
    assert.deepEqual(seal.receipt, applied.product.receipt);
    assert.equal(Object.hasOwn(adapter.snapshot(), 'preparation'), false);
    assert.equal(Object.hasOwn(adapter.snapshot().acceptedState, 'preparation'), false);
  });
});

nodeTest('T002 a later known refusal preserves the earlier applied projection and committed receipt', async () => {
  const module = await workModuleWithObservation('host-adapter.mjs');
  withSealedWorkspace((root) => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'later-prefix-refusal');
    let writes = 0;
    const adapter = module.createHostAdapter(sealedInitial({ state }), {
      supervisorSession: sealedSupervisorSession(),
      noEffectAuthority: sealedNoEffectAuthority(),
      laneOwner: {
        identity: sha256('T002-prefix-owner'),
        apply(request) {
          writes += 1;
          return applyLightweightWorkRequest(request);
        },
      },
    });
    const ledger = module.testLaneLedger;
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
    }));
    assert.equal(captured.effect.projectionBatch.events.length, 2);
    const currentEvents = [];
    const input = () => sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: currentEvents.length === 0
        ? []
        : [sealedCapture(TARGET, 'failed', currentEvents.map(event => ({ event })))],
      ...fixture.streams,
    }));
    const prepare = (binding, value) => adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
      projection: {
        input: value,
        laneBinding: {
          lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping,
          operationTime: LANE_MUTATION.snapshotUpdatedAt,
        },
      },
    }));
    const binding = sealedLaneBinding(root);
    const prepared = prepare(binding, input());
    assert.equal(prepared.reason, 'projection-prepared');
    const item = prepared.product.plan.items[0];
    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: { ...binding.application, permit: item.projectionPermit, mutation: item.mutation },
    }));
    assert.equal(applied.reason, 'lane-projection-applied');
    currentEvents.push(item.currentRunRecord.substantive.event);
    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: { input: input(), permit: item.projectionPermit, receipt: applied.product.receipt },
    }));
    assert.equal(committed.reason, 'lane-receipt-committed');
    const seal = ledger.permits.get(item.projectionPermit.permitHash);
    const firstReceipt = clone(seal.receipt);
    const before = adapter.snapshot();
    const filesBefore = [TASKS_PATH, TASK_STATE_PATH, IDEA_PATH]
      .map(relative => [relative, fs.readFileSync(path.join(root, relative))]);
    const sized = sizedHostPacketInput(input(), 131_072);
    const observed = runCommand('inspect', { trigger: 'explicit-inspection', input: sized }).inspection;
    assert.equal(feature029PacketBytes(observed), 131_072, 'all currently observed evidence still fits');
    const refused = prepare(sealedLaneBinding(root), sized);
    assert.equal(refused.reason, 'evidence-incomplete');
    assert.equal(refused.capacity.budget, 'model-packet-bytes');
    assert.ok(refused.capacity.required > 131_072, 'the remaining known event, not current evidence, exceeds capacity');
    assert.equal(writes, 1);
    assert.equal(seal.stage, 'committed');
    assert.deepEqual(seal.receipt, firstReceipt);
    assert.ok([...ledger.permits.values()].every(entry => entry.preparation === null));
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(before));
    assert.deepEqual(refused.session.pendingEffect, before.pendingEffect);
    for (const [relative, bytes] of filesBefore) {
      assert.deepEqual(fs.readFileSync(path.join(root, relative)), bytes, relative);
    }
    assert.equal(adapter.end('task-settled').reason, 'evidence-incomplete');
    assert.equal(adapter.end('hard-stop-recorded').reason, 'hard-stop-recorded');
  });
});

nodeTest('T002 a lane-first crash leaves one-sided evidence without publication, settlement, close or retry', async () => {
  const module = await workModuleWithObservation('host-adapter-runner.mjs');
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const calls = [];
    const applications = [];
    const result = await module.runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('T002-crash-runtime'),
        invoke(command, request) {
          calls.push({ command, request: clone(request) });
          return { status: 'returned', value: runCommand(command, request) };
        },
      },
      laneOwner: {
        identity: sha256('T002-crash-owner'),
        apply(request) {
          const applied = applyLightweightWorkRequest(request);
          applications.push({ request: clone(request), result: clone(applied) });
          throw new Error('T002 crash after the lane transaction');
        },
      },
      exchange() {
        assert.fail('one-sided evidence authorizes no retry or new specialist input');
      },
    });
    assert.equal(result.reason, 'lane-owner-threw');
    assert.equal(applications.length, 1);
    assert.equal(applications[0].result.ok, true, 'the lane transaction really landed');
    assert.deepEqual(module.testCurrentRun, [], 'the actual staged record was never published');
    assert.equal(calls.at(-1).request.mode, 'prepare-projection');
    assert.equal(calls.some(call => ['commit-lane-receipt', 'finalize'].includes(call.request.mode)), false);
    const last = calls.at(-1).request;
    const verified = runCommand('transition', {
      mode: 'verify-projection', state: last.state, input: last.input, projectionBatch: last.projectionBatch,
    });
    assert.equal(verified.transition.verified, false);
    assert.equal(verified.transition.reason, 'projection-missing-current-run');
    assert.deepEqual(verified.transition.state, last.state);
    assert.equal(result.stateHash, result.steps.at(-2).stateHash);
    assert.equal(result.acceptedRevision, result.steps.at(-2).acceptedRevision);
    const accepted = focusedRunnerAcceptedState(result);
    assert.equal(accepted.pending.length, 1);
    assert.equal(accepted.completed.length, 0);
    assert.equal(Object.hasOwn(accepted, 'pendingCompletion'), false);
    assert.equal(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8').split('- dude-run-event: ').length - 1, 1);
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
  });
});

for (const mode of ['forged', 'empty', 'missing-proof', 'effect-observed', 'indeterminate']) {
  nodeTest(`T002 application prechecks keep injected-runtime rederivation and no-effect guards (${mode})`, () => {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const state = pendingState('autonomous');
      const fixture = sealedTrustedFixture(state, 'precheck-authority', 'accepted');
      let corrupt = false;
      let applications = 0;
      const adapter = createHostAdapter(sealedInitial({ state }), {
        runtime: {
          identity: sha256('T002-precheck-runtime'),
          invoke(command, request) {
            if (corrupt && mode === 'empty') return { status: 'empty' };
            const value = runCommand(command, request);
            if (corrupt) value.transition.plan.items[0].mutation.toGlyph = 'x';
            return { status: 'returned', value };
          },
        },
        ...(['missing-proof', 'effect-observed', 'indeterminate'].includes(mode)
          ? { noEffectAuthority: refusingNoEffectAuthority(mode === 'missing-proof' ? 'missing' : mode) }
          : {}),
        laneOwner: {
          identity: sha256('T002-precheck-owner'),
          apply(request) {
            applications += 1;
            return applyLightweightWorkRequest(request);
          },
        },
      });
      const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
      }));
      assert.equal(captured.reason, 'occurrence-retention-required');
      const binding = sealedLaneBinding(root);
      const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
        projection: {
          input: sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous', ...fixture.streams })),
          laneBinding: {
            lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping,
            operationTime: LANE_MUTATION.snapshotUpdatedAt,
          },
        },
      }));
      assert.equal(prepared.reason, 'projection-prepared');
      const item = prepared.product.plan.items[0];
      corrupt = true;
      const before = adapter.snapshot();
      const files = laneSurfaceDigests(root);
      const refused = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
        laneApplication: { ...binding.application, permit: item.projectionPermit, mutation: item.mutation },
      }));
      assert.equal(refused.reason, mode === 'empty' ? 'runtime-output-empty' : 'runtime-result-not-authoritative');
      assert.equal(refused.outcome, ['forged', 'empty'].includes(mode) ? 'closed-refusal' : 'hard-stop');
      assert.equal(applications, 0);
      assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(before));
      assert.deepEqual(refused.session.pendingEffect, before.pendingEffect);
      assert.deepEqual(laneSurfaceDigests(root), files);
    });
  });
}

for (const packetBytes of [131_072, 131_073]) {
  nodeTest(`descriptor-only overflow: applied learning receipt at ${packetBytes} complete packet bytes`, () => {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const required = requiredGovernanceFixture(root);
      const currentEvents = [...required.governedEvents];
      const input = () => sealedTransportInput(sealedInspectionInput(root, {
        policyMode: 'autonomous',
        currentRun: [sealedCapture(TARGET, 'failed', currentEvents.map((event) => ({ event })))],
        ...required.streams,
      }));
      const runtimeCalls = [];
      const laneCalls = [];
      const checkpoint = memoryCheckpointStore();
      const adapter = createHostAdapter({
        ...sealedInitial({ state: required.state }),
        workspace: { ...WORKSPACE },
      }, {
        checkpoint: checkpoint.port,
        runtime: {
          identity: sha256('descriptor-overflow-receipt-runtime'),
          invoke(command, request) {
            runtimeCalls.push({ command, request: clone(request) });
            return { status: 'returned', value: runCommand(command, request) };
          },
        },
        laneOwner: {
          identity: sha256('descriptor-overflow-receipt-lane-owner'),
          apply(request) {
            laneCalls.push(clone(request));
            return applyLightweightWorkRequest(request);
          },
        },
      });
      const reviewed = adapter.run(sealedRequest(adapter, 'advance-governance', {
        governance: {
          action: 'review-learning',
          input: input(),
          review: governanceReview(required.state, 'selected-alternative').review,
        },
      }));
      assert.equal(reviewed.outcome, 'effect-required', reviewed.reason);
      assert.equal(reviewed.reason, 'learning-reviewed');
      const events = reviewed.effect.projectionBatch.events;
      assert.equal(events.length, 2, 'the learning review has two separate authoritative projections');

      for (let index = 0; index < events.length; index += 1) {
        const binding = sealedLaneBinding(root);
        const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
          projection: {
            input: input(),
            laneBinding: {
              lanePrestate: binding.lanePrestate,
              targetMapping: binding.targetMapping,
              operationTime: LANE_MUTATION.snapshotUpdatedAt,
            },
          },
        }));
        assert.equal(prepared.reason, 'projection-prepared');
        const item = prepared.product.plan.items[index];
        const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
          laneApplication: {
            ...binding.application,
            permit: clone(item.projectionPermit),
            mutation: clone(item.mutation),
          },
        }));
        assert.equal(applied.reason, 'lane-projection-applied');
        assert.equal(applied.product.receipt.targetStateChanged, false);
        currentEvents.push(clone(item.currentRunRecord.substantive.event));
        const last = index === events.length - 1;
        const receiptInput = last ? sizedHostPacketInput(input(), packetBytes) : input();
        const lowLevel = {
          mode: 'commit-lane-receipt',
          state: clone(adapter.snapshot().pendingEffect.provisionalState),
          input: receiptInput,
          permit: clone(item.projectionPermit),
          receipt: clone(applied.product.receipt),
        };
        const direct = runCommand('transition', lowLevel);
        assert.equal(validateRecoveryRuntimeResultV1('transition', lowLevel, direct), true);
        const before = adapter.snapshot();
        const laneBefore = laneSurfaceDigests(root);
        const callsBefore = runtimeCalls.length;
        const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
          laneReceipt: {
            input: receiptInput,
            permit: clone(item.projectionPermit),
            receipt: clone(applied.product.receipt),
          },
        }));
        assert.equal(runtimeCalls.length, callsBefore + 1);
        assert.deepEqual(acceptedAuthorityTuple(committed.session), acceptedAuthorityTuple(before));
        assert.deepEqual(committed.session.pendingEffect, before.pendingEffect);
        assert.deepEqual(laneSurfaceDigests(root), laneBefore, 'commit does not undo already applied history');
        assert.equal(committed.session.acceptedState.learningGovernance.phase, 'required');
        assert.ok(committed.session.acceptedState.overallUsed > 0);
        assert.ok(committed.session.acceptedState.completed.length > 0);
        assert.equal(laneCalls.length, index + 1);
        assert.doesNotThrow(() => validateHostAdapterResult(committed));
        if (!last || packetBytes === 131_072) {
          assert.equal(direct.transition.committed, true);
          if (last) assert.equal(feature029PacketBytes(direct.inspection), packetBytes);
          assert.equal(committed.outcome, 'effect-required', committed.reason);
          assert.equal(committed.reason, 'lane-receipt-committed');
          assert.equal(committed.product.terminalEvidenceIdentity, null);
          continue;
        }

        assert.deepEqual(Object.keys(direct), ['inspection']);
        assert.equal(direct.inspection.overflow, true);
        assert.equal(modelPacket(direct.inspection), null);
        assert.ok(direct.inspection.items.every((item) => !Object.hasOwn(item, 'text')));
        assert.ok(direct.inspection.items.length <= 64, 'only the byte ceiling was crossed');
        const control = runCommand('transition', {
          ...lowLevel,
          input: sizedHostPacketInput(input(), 131_072),
        });
        assert.equal(control.transition.committed, true, 'the actual applied receipt is otherwise valid');
        assert.equal(feature029PacketBytes(control.inspection), 131_072);
        assert.equal(committed.outcome, 'hard-stop');
        assert.equal(committed.reason, 'evidence-incomplete');
        assert.equal(Object.hasOwn(committed, 'capacity'), false);
        assert.equal(Object.hasOwn(committed, 'product'), false, 'no receipt was committed');
        assert.equal(committed.session.correction, null);
        assert.equal(adapter.end('task-settled').outcome, 'hard-stop');
        assert.equal(adapter.run(sealedRequest(adapter, 'settle-effect', {
          input: receiptInput,
        })).reason, 'evidence-incomplete');
        assert.equal(runtimeCalls.length, callsBefore + 1, 'the stopped operation is not retried');
        assert.deepEqual(laneSurfaceDigests(root), laneBefore);
        assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
        assert.ok(checkpoint.pair.checkpoint, 'pending authority is retained until the stop is recorded');
        assert.equal(adapter.end('hard-stop-recorded').reason, 'hard-stop-recorded');
        assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
      }
      if (packetBytes === 131_072) {
        const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
          input: sizedHostPacketInput(input(), packetBytes),
        }));
        assert.equal(settled.outcome, 'accepted', settled.reason);
        assert.equal(settled.reason, 'projection-verified');
        assert.equal(settled.session.acceptedState.learningGovernance.phase, 'projected');
        assert.equal(adapter.end('cancelled').reason, 'cancelled');
        assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
      }
    });
  });
}

/** @param {string} root @param {number} [descriptionBytes] */
function latePacketOverflowRunnerRequest(root, descriptionBytes = 57_200) {
  const tasksPath = path.join(root, TASKS_PATH);
  fs.writeFileSync(tasksPath, fs.readFileSync(tasksPath, 'utf8').replace(
    'Adapter core',
    `Adapter core ${'x'.repeat(descriptionBytes)}`,
  ));
  writeSealedTaskState(root);
  const request = focusedRunnerRequest(root);
  request.specialistResult = feature029SpecialistPair(request.assessment, 'late-overflow', 16);
  return request;
}

nodeTest('descriptor-only overflow: unknown post-apply growth reports the fresh receipt inspection without another call', async (context) => {
  await withSealedWorkspace(async (root) => {
    const request = latePacketOverflowRunnerRequest(root);
    const observations = [];
    const applications = [];
    const checkpoint = memoryCheckpointStore();
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('descriptor-overflow-runner-runtime'),
        invoke(command, lowLevelRequest) {
          const value = runCommand(command, lowLevelRequest);
          observations.push({ command, request: clone(lowLevelRequest), value: clone(value) });
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('descriptor-overflow-runner-lane-owner'),
        apply(laneRequest) {
          const applied = applyLightweightWorkRequest(laneRequest);
          applications.push({ request: clone(laneRequest), result: clone(applied) });
          assert.equal(applied.ok, true);
          // External bytes arriving after the prechecked lane transaction were
          // not knowable at preparation. Its receipt is not claimed settled.
          fs.appendFileSync(path.join(root, TASKS_PATH), `${'x'.repeat(3_089)}\n`);
          return applied;
        },
      },
      exchange() {
        assert.fail('overflow must not request another model or specialist response');
      },
    });
    context.diagnostic(JSON.stringify(observations.map(({ command, request: lowLevel, value }) => ({
      command,
      mode: lowLevel.mode ?? null,
      bytes: value.inspection.overflow ? null : feature029PacketBytes(value.inspection),
      overflow: value.inspection.overflow,
    }))));
    const last = observations.at(-1);
    assert.equal(last.command, 'transition');
    assert.equal(last.request.mode, 'commit-lane-receipt');
    assert.deepEqual(Object.keys(last.value), ['inspection']);
    assert.equal(last.value.inspection.overflow, true);
    const measured = await measurePrivateModelView(last.request.input);
    assert.deepEqual(measured.inspection, last.value.inspection);
    assert.equal(measured.modelBytes, 131_073, 'unknown growth crosses the real byte ceiling by one');
    assert.deepEqual(expandModelPacket(measured.packet), originalAvailableProjection({
      target: TARGET, items: measured.items,
    }));
    assert.equal(applications.length, 1);
    assert.equal(applications[0].request.operation, 'work-project');
    assert.equal(result.steps.at(-1).step, 'attempt:1:completion:commit-projection:1');
    const before = result.steps.at(-2);
    assert.equal(before.reason, 'lane-projection-applied');
    assert.equal(result.stateBase64, before.stateBase64);
    assert.equal(result.stateHash, before.stateHash);
    assert.equal(result.acceptedRevision, before.acceptedRevision);
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.deepEqual(result.haltReport, describeUnattendedHalt({
      state: focusedRunnerAcceptedState(result),
      reason: 'evidence-incomplete',
    }, last.value.inspection));
    assert.equal(result.haltReport.resolved, true);
    assert.equal(result.haltReport.evidenceHash, last.value.inspection.evidenceHash);
    assert.notEqual(result.haltReport.evidenceHash, request.assessment.evidenceHash);
    assert.equal(result.haltReport.nextAction, 'request-human-input');
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.equal(result.steps.some((step) => /correction|reinspect/.test(step.step)), false);
    assert.ok(checkpoint.pair.checkpoint, 'returning the hard stop alone does not claim cleanup');
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
  });
});

nodeTest('T002 known growth: forked runner exits nonzero before its excessive projection is applied', async () => {
  await withSealedWorkspace(async (root) => {
    const request = latePacketOverflowRunnerRequest(root, 58_748);
    const filesBefore = laneSurfaceDigests(root);
    const temp = path.join(root, 'tmp');
    fs.mkdirSync(temp);
    const execution = await runFocusedRunnerCli(request, () => {
      assert.fail('overflow must not emit another input-required challenge');
    }, { env: { TMPDIR: temp } });
    assert.equal(execution.code, 1);
    assert.equal(execution.stderr, '');
    assert.deepEqual(execution.rows.map((row) => row.type), ['result']);
    const result = execution.rows[0];
    assert.equal(Object.hasOwn(result, 'steps'), false, 'the CLI keeps its existing summary shape');
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.equal(result.haltReport.resolved, true);
    assert.equal(result.haltReport.reason, 'evidence-incomplete');
    assert.deepEqual(result.haltReport.target, canonicalTarget(TARGET));
    assert.equal(result.haltReport.evidenceHash, null, 'predicted evidence is not reported as observed authority');
    assert.equal(result.capacity.budget, 'model-packet-bytes');
    assert.equal(result.capacity.limit, 131_072);
    assert.equal(result.capacity.required, 131_077);
    assert.equal(result.haltReport.nextAction, 'request-human-input');
    assert.deepEqual(laneSurfaceDigests(root), filesBefore);
    assert.equal(focusedRunnerAcceptedState(result).pending.length, 1);
    assert.equal(focusedRunnerAcceptedState(result).completed.length, 0);
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
  });
});

nodeTest('descriptor-only overflow: every inspection-consuming operation preserves its predecessor', () => {
  for (const operation of [
    'fresh-inspection', 'authorize-attempt', 'record-attempt-result', 'settle-effect',
    'advance-governance', 'prepare-authoritative-projection', 'authorize-lane-effect', 'audit-run',
  ]) {
    withSealedWorkspace((root) => {
      writeSealedTaskState(root);
      const calls = [];
      const authority = sealedNoEffectAuthority();
      const make = (initial) => createHostAdapter(initial, {
        noEffectAuthority: {
          ...authority,
          capture(request) {
            calls.push({ operation: request.semanticOperation, command: request.command });
            return authority.capture(request);
          },
        },
      });
      let state = ['record-attempt-result', 'settle-effect', 'prepare-authoritative-projection'].includes(operation)
        ? pendingState('autonomous')
        : emptyState('autonomous');
      let input = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' }));
      if (operation === 'advance-governance') {
        const required = requiredGovernanceFixture(root);
        state = required.state;
        input = sealedRetentionInput(root, required.governedEvents, required.governedEvents, required.streams);
      }
      let adapter;
      if (operation === 'authorize-lane-effect') {
        const closure = sealedAcceptedCompletion(root, make);
        adapter = closure.adapter;
        input = closure.laneInput();
      } else {
        adapter = make(sealedInitial({ state }));
      }
      if (['settle-effect', 'prepare-authoritative-projection'].includes(operation)) {
        const fixture = sealedTrustedFixture(state, 'shared-overflow', 'accepted');
        const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
          attemptResult: { input: sealedRecordInput(root), result: fixture.semantic },
        }));
        assert.equal(captured.outcome, 'effect-required', operation);
        const events = captured.effect.projectionBatch.events;
        input = operation === 'settle-effect'
          ? sealedRetentionInput(root, events, events, fixture.streams)
          : sealedTransportInput(sealedInspectionInput(root, {
            policyMode: 'autonomous', ...fixture.streams,
          }));
      }
      input = sizedHostPacketInput(input, 131_073);
      const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
      assert.equal(inspection.overflow, true, operation);
      const binding = sealedLaneBinding(root);
      const assessment = sealedAssessment(inspection, 'The complete packet cannot be admitted.');
      const recordInput = clone(input);
      delete recordInput.verification;
      delete recordInput.review;
      delete recordInput.lint;
      const payloads = {
        'fresh-inspection': { input },
        'authorize-attempt': { authorization: { input, assessment } },
        'record-attempt-result': {
          attemptResult: { input: recordInput, result: specialistResult('shared-overflow', 'accepted') },
        },
        'settle-effect': { input },
        'advance-governance': {
          governance: {
            action: 'review-learning',
            input,
            ...(operation === 'advance-governance'
              ? { review: governanceReview(state, 'selected-alternative').review }
              : {}),
          },
        },
        'prepare-authoritative-projection': {
          projection: {
            input,
            laneBinding: {
              lanePrestate: binding.lanePrestate,
              targetMapping: binding.targetMapping,
              operationTime: LANE_MUTATION.snapshotUpdatedAt,
            },
          },
        },
        'authorize-lane-effect': {
          laneEffect: {
            input,
            mutation: clone(LANE_MUTATION),
            lanePrestate: binding.lanePrestate,
            targetMapping: binding.targetMapping,
          },
        },
        'audit-run': { audit: { input } },
      };
      const before = adapter.snapshot();
      const laneBefore = laneSurfaceDigests(root);
      const callsBefore = calls.length;
      const result = adapter.run(sealedRequest(adapter, operation, payloads[operation]));
      assert.equal(result.outcome, 'hard-stop', operation);
      assert.equal(result.reason, 'evidence-incomplete', operation);
      assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before), operation);
      assert.deepEqual(result.session.pendingEffect, before.pendingEffect, operation);
      assert.deepEqual(laneSurfaceDigests(root), laneBefore, operation);
      assert.equal(calls.length, callsBefore + 1, operation);
      assert.equal(calls.at(-1).operation, operation);
      assert.equal(Object.hasOwn(result, 'capacity'), false, operation);
      assert.equal(Object.hasOwn(result, 'product'), false, operation);
      assert.equal(result.session.correction, null, operation);
      assert.doesNotThrow(() => validateHostAdapterResult(result), operation);
    });
  }
});

for (const mode of ['matching', 'missing', 'effect-observed', 'indeterminate', 'forged', 'wrong-target']) {
  nodeTest(`descriptor-only overflow: injected evidence needs exact authority and no-effect proof (${mode})`, () => {
    withSealedWorkspace((root) => {
      const input = sizedHostPacketInput(
        sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' })),
        131_073,
      );
      let actualInput = input;
      if (mode === 'forged') {
        actualInput = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' }));
      } else if (mode === 'wrong-target') {
        actualInput = clone(input);
        actualInput.target = clone(SECOND_TARGET);
        actualInput.session.target = clone(SECOND_TARGET);
        actualInput.session.bytes.base64 = Buffer.from('x'.repeat(131_072)).toString('base64');
      }
      let calls = 0;
      const adapter = createHostAdapter(sealedInitial({ state: emptyState('autonomous') }), {
        runtime: {
          identity: sha256('dude-work/recovery.runCommand:v1'),
          invoke(command, request) {
            calls += 1;
            const value = runCommand(command, mode === 'forged' ? { ...request, input } : request);
            assert.equal(value.inspection.overflow, true, mode);
            return { status: 'returned', value };
          },
        },
        ...(['missing', 'effect-observed', 'indeterminate'].includes(mode)
          ? { noEffectAuthority: refusingNoEffectAuthority(mode) }
          : {}),
      });
      const before = adapter.snapshot();
      const result = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input: actualInput }));
      assert.equal(calls, 1, mode);
      assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before), mode);
      assert.equal(Object.hasOwn(result, 'capacity'), false, mode);
      if (mode === 'matching') {
        assert.equal(result.outcome, 'hard-stop', mode);
        assert.equal(result.reason, 'evidence-incomplete', mode);
        assert.equal(result.session.correction, null, mode);
      } else if (mode === 'forged' || mode === 'wrong-target') {
        assert.equal(result.outcome, 'closed-refusal', mode);
        assert.equal(result.reason, 'runtime-result-not-authoritative', mode);
      } else {
        assert.equal(result.outcome, 'hard-stop', mode);
        assert.equal(result.reason, 'runtime-output-malformed', mode);
        assert.equal(result.session.correction, null, mode);
      }
      assert.doesNotThrow(() => validateHostAdapterResult(result), mode);
    });
  });
}

nodeTest('descriptor-only overflow: an effectful runner port cannot claim a no-effect evidence stop', async (context) => {
  await withSealedWorkspace(async (root) => {
    const request = latePacketOverflowRunnerRequest(root);
    const ownerPath = path.join(root, IDEA_PATH);
    const marker = 'OVERFLOW_INJECTED_EFFECT_SECRET';
    const calls = [];
    let inspection;
    let receiptInput;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('dude-work/host-adapter-runner:recovery-runtime:v1'),
        invoke(command, lowLevelRequest) {
          calls.push(`${command}:${lowLevelRequest.mode ?? 'inspect'}`);
          if (command === 'transition' && lowLevelRequest.mode === 'commit-lane-receipt') {
            // The mandatory last owner event alone must exceed the byte budget;
            // dropping the preceding owner event must not make this guard moot.
            fs.appendFileSync(ownerPath, `\n- 2026-08-10 ${marker} ${'x'.repeat(3_084)}\n`);
            receiptInput = clone(lowLevelRequest.input);
          }
          const value = runCommand(command, lowLevelRequest);
          inspection = value.inspection;
          return { status: 'returned', value };
        },
      },
      exchange() {
        assert.fail('an effectful overflow must not be retried or corrected');
      },
    });
    assert.equal(inspection.overflow, true, 'the returned shape is genuinely runtime-owned');
    const measured = await measurePrivateModelView(receiptInput);
    assert.deepEqual(measured.inspection, inspection);
    assert.equal(measured.modelBytes, 131_087, 'the effectful port returns a real descriptor-only overflow');
    assert.deepEqual(expandModelPacket(measured.packet), originalAvailableProjection({
      target: TARGET, items: measured.items,
    }));
    context.diagnostic(canonicalJson({
      effectfulOverflow: { modelBytes: measured.modelBytes, limit: 131_072 },
    }));
    assert.equal(calls.length, 7, 'the fresh application precheck precedes the late receipt refusal');
    assert.equal(calls.at(-1), 'transition:commit-lane-receipt');
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'runtime-output-malformed');
    assert.equal(result.haltReport.resolved, false);
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.equal(canonicalJson(result).includes(marker), false);
    const before = result.steps.at(-2);
    assert.equal(before.reason, 'lane-projection-applied');
    assert.equal(result.stateHash, before.stateHash);
    assert.equal(result.acceptedRevision, before.acceptedRevision);
    assert.ok(fs.readFileSync(ownerPath, 'utf8').includes(marker), 'the stop does not claim rollback');
    assert.match(fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'), new RegExp(`- \\[~\\] ${TARGET.taskKey}`));
  });
});

const T003_REFERENCE_PREFIX = '- dude-run-event: ';

/** @param {Record<string, unknown>} input */
function t003CurrentEvents(input) {
  return currentRunRecords(input)
    .map(record => /** @type {Record<string, unknown>} */ (record.substantive).event)
    .filter(Boolean);
}

/** @param {string} root @param {Record<string, unknown>} target */
function t003LaneEvents(root, target) {
  const tasksPath = `${target.specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const lines = fs.readFileSync(path.join(root, tasksPath), 'utf8').split(/\r?\n/);
  const global = lines
    .filter(line => line.startsWith(T003_REFERENCE_PREFIX))
    .map((line) => {
      const body = line.slice(T003_REFERENCE_PREFIX.length);
      const event = JSON.parse(body);
      assert.equal(canonicalJson(event), body);
      return event;
    });
  return {
    global,
    target: global.filter(event => targetKey(event.target) === targetKey(target)),
  };
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} reference
 * @param {Record<string, unknown>} target
 */
function t003LaneBinding(root, reference, target) {
  const ownerPath = /** @type {Record<string, unknown>[]} */ (reference.files)
    .find(file => /** @type {string} */ (file.path).startsWith('.dude/ideas/')).path;
  const tasksPath = `${target.specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const taskStatePath = '.dude/state/task-state.json';
  const owner = fs.readFileSync(path.join(root, ownerPath));
  const tasks = fs.readFileSync(path.join(root, tasksPath));
  const taskState = fs.readFileSync(path.join(root, taskStatePath));
  const ownerCapture = capturedBytesV1(owner);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: ownerPath,
    specPath: target.specPath,
    ownerCapture: {
      sha256: ownerCapture.sha256,
      byteLength: ownerCapture.byteLength,
    },
  }));
  const targetMapping = {
    version: 1,
    lane: 'lightweight',
    target: clone(target),
    ownerBindingHash,
    tasksPath,
    tasksDescriptor: contentDescriptor(tasks),
    taskStatePath,
    taskStateDescriptor: contentDescriptor(taskState),
    taskKey: target.taskKey,
  };
  return {
    targetMapping,
    lanePrestate: {
      version: 1,
      lane: 'lightweight',
      target: clone(target),
      glyph: '~',
      blockedBy: null,
      tasksDescriptor: clone(targetMapping.tasksDescriptor),
      taskStateDescriptor: clone(targetMapping.taskStateDescriptor),
      ownerDescriptor: contentDescriptor(owner),
    },
    application: {
      root,
      owner: {
        ideaPath: ownerPath,
        specPath: target.specPath,
        ownerCapture,
        ownerBindingHash,
      },
      mapping: clone(targetMapping),
      expected: {
        tasksPath,
        tasks: capturedBytesV1(tasks),
        taskStatePath,
        taskState: capturedBytesV1(taskState),
      },
    },
  };
}

/**
 * Match the production runner's checkpoint binding for one fresh reference root.
 * @param {string} root
 * @param {Record<string, unknown>} target
 * @param {ReturnType<typeof t003LaneBinding>} binding
 */
function t003CheckpointWorkspace(root, target, binding) {
  return {
    workspaceIdentity: sha256(canonicalJson({ version: 1, root: fs.realpathSync(root) })),
    ownerIdentity: sha256(canonicalJson({
      version: 1,
      owner: binding.application.owner,
    })),
    taskPrestateIdentity: sha256(canonicalJson({
      version: 1,
      target: clone(target),
      glyph: binding.lanePrestate.glyph,
      blockedBy: binding.lanePrestate.blockedBy,
      tasksDescriptor: binding.targetMapping.tasksDescriptor,
    })),
    lanePrestateIdentity: sha256(canonicalJson(binding.lanePrestate)),
  };
}

/** @param {Record<string, unknown>} target */
function t003TerminalMutation(target) {
  return {
    version: 1,
    lane: 'lightweight',
    kind: 'task-completed',
    reason: 'task-completed',
    target: clone(target),
    fromGlyph: '~',
    toGlyph: 'x',
    blocker: { kind: 'unchanged', before: null, after: null },
    eventLines: { kind: 'none' },
    ownerLog: { kind: 'none' },
    snapshotUpdatedAt: '2026-09-18T12:00:06Z',
  };
}

/** @param {string} root @param {Record<string, unknown>} target */
function t003ParsedTargetTask(root, target) {
  const tasksPath = `${target.specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const visible = parseVisibleTasks(
    fs.readFileSync(path.join(root, tasksPath)),
    { path: tasksPath, state: 'Feature 064 T003 terminal fixture' },
  );
  const rows = visible.parsed.tasks.filter(task => task.id === target.taskKey);
  assert.equal(rows.length, 1, 'the terminal fixture keeps one exact parsed target task');
  return rows[0];
}

/** @param {string} root @param {Record<string, unknown>} target */
function t003SnapshotGlyph(root, target) {
  const tasksPath = `${target.specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(root, '.dude/state/task-state.json'), 'utf8'),
  );
  return snapshot[tasksPath]?.glyphs?.[target.taskKey];
}

/** @param {Record<string, unknown>[]} events */
function t003CompletedRows(events) {
  return events.filter(event => event.type === 'approach-occurrence').map(event => ({
    evidenceHash: event.occurrence.authorizationEvidenceHash,
    approachHash: approachHash({
      action: event.basis.action,
      materialInputs: event.basis.materialInputs,
    }),
    resultHash: event.occurrence.resultIdentity,
  }));
}

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>[]} events
 */
function t003HistoricalState(target, events) {
  const state = {
    policy: {
      overall: 30,
      recovery: 30,
      recover: true,
      untilBlocked: false,
      mode: 'autonomous',
    },
    overallUsed: 4,
    recoveryUsed: [{
      targetKey: targetKey(target),
      targetHash: targetHash(target),
      count: 3,
    }],
    pending: [],
    completed: t003CompletedRows(events),
  };
  validateRunState(state);
  return state;
}

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>[]} events
 * @param {ReturnType<typeof buildRetentionPair>} pair
 * @param {number} ordinal
 * @param {string} evidenceHash
 */
function t003CounterfactualPendingState(target, events, pair, ordinal, evidenceHash) {
  const state = {
    policy: {
      overall: 30,
      recovery: 30,
      recover: true,
      untilBlocked: false,
      mode: 'autonomous',
    },
    overallUsed: ordinal,
    recoveryUsed: [{
      targetKey: targetKey(target),
      targetHash: targetHash(target),
      count: ordinal - 1,
    }],
    pending: [{
      target: clone(target),
      evidenceHash,
      approachHash: approachHash({
        action: pair.basis.action,
        materialInputs: pair.basis.materialInputs,
      }),
      action: pair.basis.action,
      materialInputs: clone(pair.basis.materialInputs),
      mode: 'recovery',
    }],
    completed: t003CompletedRows(events),
  };
  validateRunState(state);
  return state;
}

/** @param {string} root @param {Record<string, unknown>} reference */
function t003FileIdentities(root, reference) {
  return Object.fromEntries(
    /** @type {Record<string, unknown>[]} */ (reference.files).map(file => [
      file.path,
      contentDescriptor(fs.readFileSync(path.join(root, /** @type {string} */ (file.path)))),
    ]),
  );
}

/** @param {Record<string, unknown>} entry */
function t003TrustedCapture(entry) {
  const bytes = /** @type {Record<string, unknown>} */ (entry.bytes);
  const body = JSON.parse(
    Buffer.from(/** @type {string} */ (bytes.base64), 'base64').toString('utf8'),
  );
  assert.equal(body.records.length, 1);
  return body.records[0].substantive;
}

/** @param {Record<string, unknown>} input */
function t003CheckSummary(input) {
  const checks = /** @type {Record<string, unknown>[]} */ (input.verification)
    .flatMap(entry => normalizeVerificationEnvelopeV2(t003TrustedCapture(entry)).checks);
  return {
    total: checks.length,
    passed: checks.filter(check => check.outcome === 'passed').length,
    failed: checks.filter(check => check.outcome === 'failed').length,
  };
}

/**
 * @param {{
 *   label:string,
 *   root:string,
 *   reference:Record<string, unknown>,
 *   input:Record<string, unknown>,
 *   inspection:Record<string, unknown>,
 *   privateView?:Awaited<ReturnType<typeof measurePrivateModelView>>,
 * }} value
 */
async function t003StageMeasurement(value) {
  const packet = value.privateView?.packet ?? modelPacket(value.inspection);
  assert.ok(packet, `${value.label}: complete test view`);
  const items = value.privateView?.items
    ?? /** @type {Record<string, unknown>[]} */ (value.inspection.items);
  if (value.privateView) {
    assert.deepEqual(value.privateView.inspection, value.inspection);
    assert.equal(value.privateView.modelBytes, Buffer.byteLength(canonicalJson(packet)));
  }
  const expanded = expandModelPacket(packet);
  assert.deepEqual(
    expanded,
    originalAvailableProjection({ target: value.inspection.target, items }),
    `${value.label}: exact inverse`,
  );
  const headroom = mandatoryCompletionHeadroom(
    { target: value.inspection.target, items },
    value.input,
  );
  const acquisition = acquisitionMetrics(value.root, value.reference, value.input);
  const current = t003CurrentEvents(value.input);
  const lane = t003LaneEvents(value.root, /** @type {Record<string, unknown>} */ (value.input.target));
  const ownerItem = /** @type {Record<string, unknown>[]} */ (packet.items).find(item => (
    /** @type {Record<string, unknown>[]} */ (item.frames).some(frame => (
      /** @type {Record<string, unknown>[]} */ (frame.occurrences)
        .some(occurrence => occurrence.source === 'owner-log')
    ))
  ));
  assert.ok(ownerItem && ownerItem.tag === 'literal');
  const owner = JSON.parse(/** @type {string} */ (ownerItem.text));
  const packetBytes = Buffer.byteLength(canonicalJson(packet));
  return {
    label: value.label,
    capacityAdmissible: value.inspection.overflow === false,
    refusalReason: value.inspection.overflow ? 'model-packet-bytes' : null,
    canonicalBytes: packetBytes,
    byteHeadroom: 131_072 - packetBytes,
    physicalItems: /** @type {Record<string, unknown>[]} */ (packet.items).length,
    logicalOccurrences: expanded.items.length,
    rawSourceEntries: rawSourceCount(value.input),
    originalDescriptors: items.length,
    mandatoryHeadroom: headroom,
    aggregateDecodedBytes: acquisition.aggregateDecodedBytes,
    maximumSourceBodyBytes: acquisition.maximumSourceBodyBytes,
    requestBytes: acquisition.requestBytes,
    packetIdentity: sha256(canonicalJson(packet)),
    sourceIdentity: sha256(canonicalJson(expanded.items.map(item => ({
      source: item.source,
      descriptor: item.descriptor,
    })))),
    evidenceHash: value.inspection.evidenceHash,
    ownerEvents: {
      included: owner.includedEventCount,
      total: owner.totalEventCount,
    },
    surfaces: {
      currentRun: current.length,
      laneTarget: lane.target.length,
      laneGlobal: lane.global.length,
      equal: canonicalJson(current) === canonicalJson(lane.target),
    },
    checks: t003CheckSummary(value.input),
  };
}

nodeTest('Feature 064 T003 component measurement: counterfactual reference growth reaches model-byte overflow', async (context) => {
  const episode = readRetentionEpisodeFixture().value;
  await withReferenceWorkspace(async ({
    root,
    reference,
    referenceBytes,
    input: initialInput,
    filePreimages,
  }) => {
    const target = canonicalTarget(initialInput.target);
    assert.notEqual(root, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
    const initialInspection = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: initialInput,
    }).inspection;
    const literalReference = await measurePrivateModelView(initialInput, { literalHistory: true });
    assert.equal(literalReference.modelBytes, 131_023, 'the immutable pre-compaction reference control');
    const sameProjectionLiteral = await renderPrivateModelProjection(
      target, initialInspection.items, { literalHistory: true },
    );
    const sameProjectionLiteralBytes = Buffer.byteLength(canonicalJson(sameProjectionLiteral));
    assert.deepEqual(expandModelPacket(sameProjectionLiteral), originalAvailableProjection(initialInspection));
    const stages = [await t003StageMeasurement({
      label: 'frozen-reference',
      root,
      reference,
      input: initialInput,
      inspection: initialInspection,
    })];
    assert.deepEqual({
      canonicalBytes: stages[0].canonicalBytes,
      byteHeadroom: stages[0].byteHeadroom,
      physicalItems: stages[0].physicalItems,
      logicalOccurrences: stages[0].logicalOccurrences,
      rawSourceEntries: stages[0].rawSourceEntries,
      originalDescriptors: stages[0].originalDescriptors,
      checks: stages[0].checks,
      surfaces: stages[0].surfaces,
    }, {
      canonicalBytes: 107_680,
      byteHeadroom: 23_392,
      physicalItems: 13,
      logicalOccurrences: 16,
      rawSourceEntries: 16,
      originalDescriptors: 17,
      checks: { total: 50, passed: 27, failed: 23 },
      surfaces: { currentRun: 12, laneTarget: 12, laneGlobal: 20, equal: true },
    });
    assert.deepEqual(stages[0].mandatoryHeadroom, {
      classes: ['verification', 'review', 'lint'],
      sourceDelta: 3,
      descriptorDelta: 3,
      requiredSources: 19,
      requiredDescriptors: 20,
    });
    for (const [relative, bytes] of filePreimages) {
      assert.deepEqual(fs.readFileSync(path.join(root, relative)), bytes, relative);
    }

    const historicalEvents = t003CurrentEvents(initialInput);
    const approaches = historicalEvents.filter(event => event.type === 'approach-occurrence');
    const findings = historicalEvents.filter(event => event.type === 'finding-occurrence');
    const learning = historicalEvents.find(event => event.type === 'learning-review');
    const governance = historicalEvents.filter(event => event.type === 'learning-governance');
    assert.equal(approaches.length, 4);
    assert.equal(new Set(approaches.map(event => event.occurrence.basisIdentity)).size, 3);
    assert.ok(approaches.every(event => event.occurrence.disposition !== 'accepted'));
    assert.equal(findings.length, 5);
    assert.ok(learning);
    assert.deepEqual(governance.map(event => event.phase), ['required', 'reviewed']);
    const occurrences = historicalEvents.filter(event => (
      event.type === 'approach-occurrence' || event.type === 'finding-occurrence'
    ));
    const repeat = deriveEarliestRepeatRelationshipV1(occurrences);
    assert.ok(repeat);
    assert.deepEqual(repeat, governance[0].trigger);
    const failedSet = deriveFailedApproachSetV1(repeat, occurrences);
    assert.equal(failedSet.setIdentity, governance[0].failedApproachSetIdentity);
    assert.equal(learning.failedApproachSetIdentity, failedSet.setIdentity);
    assert.equal(governance[1].reviewIdentity, learning.reviewIdentity);

    const historicalState = t003HistoricalState(target, historicalEvents);
    const directResume = resumeGovernanceV2(
      historicalState,
      initialInput,
      undefined,
      true,
    );
    assert.equal(directResume.transition.resumed, true);
    assert.equal(directResume.transition.resumedFrom, 'retained-occurrences');
    const resumeAdapter = createHostAdapter({
      state: historicalState,
      target,
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    });
    const resumed = resumeAdapter.run(sealedRequest(resumeAdapter, 'advance-governance', {
      governance: { action: 'resume-learning', input: initialInput },
    }));
    assert.equal(resumed.outcome, 'accepted', resumed.reason);
    assert.equal(resumed.reason, 'governance-resumed');
    assert.deepEqual(resumed.session.acceptedState, directResume.transition.state);
    assert.equal(resumed.session.acceptedState.learningGovernance.phase, 'required');
    assert.equal(resumeAdapter.end('cancelled').reason, 'cancelled');

    const projectedState = clone(resumed.session.acceptedState);
    projectedState.learningGovernance.phase = 'projected';
    projectedState.learningGovernance.reviewIdentity = learning.reviewIdentity;
    validateRunState(projectedState);
    const runtimeCalls = [];
    const laneCalls = [];
    let producedStreams = null;
    const supervisor = sealedSupervisorSession();
    const noEffect = sealedNoEffectAuthority({
      identity: sha256('Feature 064 T003 no-effect authority'),
    });
    const adapter = createAuthorizedHostAdapter({
      state: projectedState,
      target,
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
    }, {
      supervisorSession: supervisor,
      noEffectAuthority: noEffect,
      runtime: {
        identity: sha256('Feature 064 T003 recovery runtime'),
        invoke(command, lowLevelRequest) {
          const value = runCommand(command, lowLevelRequest);
          runtimeCalls.push({
            command,
            mode: lowLevelRequest.mode ?? 'ordinary',
            request: clone(lowLevelRequest),
            value: clone(value),
          });
          if (command === 'complete' && lowLevelRequest.mode === 'capture') {
            producedStreams = clone(lowLevelRequest.input);
          }
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('Feature 064 T003 lane owner'),
        apply(laneRequest) {
          laneCalls.push(clone(laneRequest));
          return applyLightweightWorkRequest(laneRequest);
        },
      },
    });
    const admitted = adapter.snapshot();
    assert.equal(canonicalJson(reference).includes(admitted.invocationIdentity), false);
    assert.equal(canonicalJson(reference).includes(admitted.workerToken), false);
    assert.equal(canonicalJson(episode).includes(admitted.invocationIdentity), false);
    assert.equal(canonicalJson(episode).includes(admitted.workerToken), false);
    assert.equal(admitted.authorities.supervisorAuthorityIdentity, supervisor.identity);
    assert.equal(admitted.authorities.noEffectAuthorityIdentity, noEffect.identity);

    const bound = adapter.run(sealedRequest(adapter, 'advance-governance', {
      governance: { action: 'bind-alternative', input: initialInput },
    }));
    assert.equal(bound.outcome, 'accepted', bound.reason);
    assert.equal(bound.reason, 'post-learning-inspection-bound');
    assert.equal(bound.session.acceptedState.learningGovernance.phase, 'alternative-inspected');
    const selected = learning.alternatives.find(
      alternative => alternative.alternativeIdentity === learning.selectedAlternativeIdentity,
    );
    assert.ok(selected);
    const authorizationBinding = t003LaneBinding(root, reference, target);
    const assessment = {
      evidenceHash: initialInspection.evidenceHash,
      intent: 'unchanged',
      action: selected.approachBasis.action,
      materialInputs: clone(selected.approachBasis.materialInputs),
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Retain one fresh fixture-owned verification, review, and lint episode.',
    };
    const authorized = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
      authorization: {
        input: initialInput,
        assessment,
        permit: {
          lanePrestate: authorizationBinding.lanePrestate,
          targetMapping: authorizationBinding.targetMapping,
        },
      },
    }));
    assert.equal(authorized.outcome, 'accepted', authorized.reason);
    assert.equal(authorized.reason, 'authorized');
    assert.equal(authorized.session.acceptedState.overallUsed, 5);
    assert.equal(authorized.session.acceptedState.recoveryUsed[0].count, 4);
    assert.equal(
      authorized.session.acceptedState.learningGovernance.phase,
      'alternative-authorized',
    );

    const recordInput = clone(initialInput);
    delete recordInput.verification;
    delete recordInput.review;
    delete recordInput.lint;
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: {
        input: recordInput,
        result: clone(episode.payload.specialistResult),
      },
    }));
    assert.equal(captured.outcome, 'effect-required', captured.reason);
    assert.equal(captured.reason, 'occurrence-retention-required');
    assert.equal(captured.effect.projectionBatch.events.length, 1);
    assert.ok(producedStreams);
    assert.deepEqual({
      verification: producedStreams.verification.length,
      review: producedStreams.review.length,
      lint: producedStreams.lint.length,
    }, { verification: 1, review: 1, lint: 1 });
    const producedVerification = normalizeVerificationEnvelopeV2(
      t003TrustedCapture(producedStreams.verification[0]),
    );
    const producedReview = normalizeIndependentReviewEnvelopeV2(
      t003TrustedCapture(producedStreams.review[0]),
      producedVerification,
    );
    assert.equal(producedVerification.checks.length, 16);
    assert.ok(producedVerification.checks.every(check => check.outcome === 'passed'));
    assert.equal(producedReview.verdict, 'accepted');
    assert.deepEqual(producedReview.findings, []);
    assert.equal(
      producedReview.verificationEnvelopeIdentity,
      producedVerification.envelopeIdentity,
    );
    assert.notEqual(
      producedVerification.attemptIdentity,
      episode.payload.label,
      'the fixture label supplies no attempt authority',
    );

    let retainedInput = clone(initialInput);
    for (const field of ['verification', 'review', 'lint']) {
      retainedInput[field].push(...producedStreams[field]);
    }
    const captureInspection = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: retainedInput,
    }).inspection;
    stages.push(await t003StageMeasurement({
      label: 'ordinal-5-captures',
      root,
      reference,
      input: retainedInput,
      inspection: captureInspection,
    }));
    const projectionBinding = t003LaneBinding(root, reference, target);
    const prepared = adapter.run(sealedRequest(adapter, 'prepare-authoritative-projection', {
      projection: {
        input: retainedInput,
        laneBinding: {
          lanePrestate: projectionBinding.lanePrestate,
          targetMapping: projectionBinding.targetMapping,
          operationTime: '2026-09-18T12:00:05Z',
        },
      },
    }));
    assert.equal(prepared.outcome, 'effect-required', prepared.reason);
    assert.equal(prepared.reason, 'projection-prepared');
    const item = prepared.product.plan.items[0];
    const beforeApplyState = adapter.snapshot();
    const applied = adapter.run(sealedRequest(adapter, 'apply-lane-effect', {
      laneApplication: {
        ...projectionBinding.application,
        permit: item.projectionPermit,
        mutation: item.mutation,
      },
    }));
    assert.equal(applied.outcome, 'effect-required', applied.reason);
    assert.equal(applied.reason, 'lane-projection-applied');
    assert.equal(laneCalls.length, 1);
    assert.equal(laneCalls[0].root, root);
    assert.equal(laneCalls[0].operation, 'work-project');
    assert.deepEqual(
      acceptedAuthorityTuple(adapter.snapshot()),
      acceptedAuthorityTuple(beforeApplyState),
    );
    assert.deepEqual(adapter.snapshot().pendingEffect, beforeApplyState.pendingEffect);
    const laneFirstInspection = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: retainedInput,
    }).inspection;
    stages.push(await t003StageMeasurement({
      label: 'ordinal-5-lane-first',
      root,
      reference,
      input: retainedInput,
      inspection: laneFirstInspection,
    }));
    assert.deepEqual(stages.at(-1).surfaces, {
      currentRun: 12,
      laneTarget: 13,
      laneGlobal: 21,
      equal: false,
    });
    retainedInput = publishCurrentRun(retainedInput, item.currentRunRecord);
    const publishedInspection = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: retainedInput,
    }).inspection;
    stages.push(await t003StageMeasurement({
      label: 'ordinal-5-receipt',
      root,
      reference,
      input: retainedInput,
      inspection: publishedInspection,
    }));
    assert.deepEqual(stages.at(-1).surfaces, {
      currentRun: 13,
      laneTarget: 13,
      laneGlobal: 21,
      equal: true,
    });
    const committed = adapter.run(sealedRequest(adapter, 'commit-lane-receipt', {
      laneReceipt: {
        input: retainedInput,
        permit: item.projectionPermit,
        receipt: applied.product.receipt,
      },
    }));
    assert.equal(committed.outcome, 'effect-required', committed.reason);
    assert.equal(committed.reason, 'lane-receipt-committed');
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', {
      input: retainedInput,
    }));
    assert.equal(settled.outcome, 'accepted', settled.reason);
    assert.equal(settled.reason, 'completed');
    assert.equal(settled.session.acceptedState.learningGovernance.phase, 'alternative-verified');
    assert.equal(settled.session.acceptedState.pending.length, 0);
    assert.equal(settled.session.acceptedState.completed.length, 5);
    assert.match(
      fs.readFileSync(
        path.join(root, `${target.specPath.slice(0, -'spec.md'.length)}tasks.md`),
        'utf8',
      ),
      new RegExp(`- \\[~\\] ${target.taskKey}`),
      'retention does not close the fixture task',
    );
    const receipts = [clone(applied.product.receipt)];

    let refusal = null;
    // Exact event sharing postpones this counterfactual component's real
    // overflow. Carry the same complete payloads until that byte guard fires.
    for (let ordinal = 6; ordinal <= 14; ordinal += 1) {
      const preCaptureInspection = runCommand('inspect', {
        trigger: 'explicit-inspection',
        input: retainedInput,
      }).inspection;
      const pair = buildRetentionPair({
        target,
        episode,
        ordinal,
        authorizationEvidenceHash: preCaptureInspection.evidenceHash,
      });
      const captureInput = appendRetentionPair(retainedInput, pair);
      const state = t003CounterfactualPendingState(
        target,
        t003CurrentEvents(retainedInput),
        pair,
        ordinal,
        preCaptureInspection.evidenceHash,
      );
      const stateBefore = canonicalJson(state);
      const filesBefore = t003FileIdentities(root, reference);
      const capturedPrefix = captureCompletionV2(
        state,
        captureInput,
        pair.completion,
        undefined,
        true,
      );
      if (capturedPrefix.inspection.overflow) {
        const privateView = await measurePrivateModelView(captureInput);
        const measured = await t003StageMeasurement({
          label: `ordinal-${ordinal}-captures-refused`,
          root,
          reference,
          input: captureInput,
          inspection: capturedPrefix.inspection,
          privateView,
        });
        stages.push(measured);
        assert.deepEqual(Object.keys(capturedPrefix), ['inspection']);
        assert.equal(canonicalJson(state), stateBefore);
        assert.deepEqual(t003FileIdentities(root, reference), filesBefore);
        assert.equal(measured.canonicalBytes, 159_228);
        assert.equal(measured.physicalItems, 15);
        assert.equal(measured.logicalOccurrences, 46);
        assert.equal(measured.rawSourceEntries, 46);
        assert.equal(measured.originalDescriptors, 47);
        assert.deepEqual(measured.surfaces, {
          currentRun: 21,
          laneTarget: 21,
          laneGlobal: 29,
          equal: true,
        });
        assert.deepEqual(capturedPrefix.inspection.blockers, [
          {
            code: 'evidence-incomplete',
            subject: 'lint',
            evidenceHash: capturedPrefix.inspection.evidenceHash,
          },
          {
            code: 'evidence-incomplete',
            subject: 'model-packet',
            evidenceHash: capturedPrefix.inspection.evidenceHash,
          },
          {
            code: 'evidence-incomplete',
            subject: 'verification',
            evidenceHash: capturedPrefix.inspection.evidenceHash,
          },
        ]);
        const report = describeUnattendedHalt({
          state,
          reason: 'evidence-incomplete',
        }, capturedPrefix.inspection);
        assert.equal(report.reason, 'evidence-incomplete');
        assert.equal(report.subject, 'lint');
        assert.deepEqual(report.target, target);
        assert.equal(report.evidenceHash, capturedPrefix.inspection.evidenceHash);
        assert.equal(canonicalJson(report).includes('runtime-output-malformed'), false);
        assert.equal(receipts.length, 9);
        refusal = {
          ordinal,
          phase: 'captures',
          reason: 'model-packet-bytes',
          required: measured.canonicalBytes,
          limit: 131_072,
          target,
          componentReceipts: receipts.map(receipt => receipt.receiptHash),
        };
        break;
      }

      assert.equal(capturedPrefix.completion.captured, true);
      assert.equal(capturedPrefix.completion.reason, 'occurrence-retention-required');
      assert.equal(capturedPrefix.completion.projectionBatch.events.length, 1);
      stages.push(await t003StageMeasurement({
        label: `ordinal-${ordinal}-captures`,
        root,
        reference,
        input: captureInput,
        inspection: capturedPrefix.inspection,
      }));
      const capturedState = capturedPrefix.completion.state;
      const batch = capturedPrefix.completion.projectionBatch;
      const binding = t003LaneBinding(root, reference, target);
      const preparedPrefix = prepareProjectionV2(
        capturedState,
        captureInput,
        batch,
        undefined,
        true,
        {
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
          operationTime: `2026-09-18T12:00:${String(ordinal).padStart(2, '0')}Z`,
        },
      );
      assert.equal(preparedPrefix.transition.prepared, true, preparedPrefix.transition.reason);
      const projection = preparedPrefix.transition.plan.items[0];
      const application = applyLightweightWorkRequest({
        version: 1,
        operation: 'work-project',
        ...binding.application,
        target,
        state: capturedState,
        permit: projection.projectionPermit,
        mutation: projection.mutation,
      });
      assert.equal(application.ok, true, JSON.stringify(application));
      const laneInspection = runCommand('inspect', {
        trigger: 'explicit-inspection',
        input: captureInput,
      }).inspection;
      stages.push(await t003StageMeasurement({
        label: `ordinal-${ordinal}-lane-first`,
        root,
        reference,
        input: captureInput,
        inspection: laneInspection,
      }));
      assert.equal(stages.at(-1).surfaces.equal, false);
      assert.equal(
        stages.at(-1).surfaces.laneTarget,
        stages.at(-1).surfaces.currentRun + 1,
      );
      const publishedInput = publishCurrentRun(captureInput, projection.currentRunRecord);
      const receiptInspection = runCommand('inspect', {
        trigger: 'explicit-inspection',
        input: publishedInput,
      }).inspection;
      stages.push(await t003StageMeasurement({
        label: `ordinal-${ordinal}-receipt`,
        root,
        reference,
        input: publishedInput,
        inspection: receiptInspection,
      }));
      assert.equal(stages.at(-1).surfaces.equal, true);
      const receipt = commitLaneReceiptV2(
        capturedState,
        publishedInput,
        projection.projectionPermit,
        application.receipt,
        undefined,
        true,
      );
      assert.equal(receipt.transition.committed, true, receipt.transition.reason);
      assert.deepEqual(receipt.inspection, receiptInspection);
      const finalized = runCommand('complete', {
        mode: 'finalize',
        state: capturedState,
        input: publishedInput,
        projectionBatch: batch,
      });
      assert.equal(finalized.completion.finalized, true);
      assert.equal(finalized.completion.reason, 'learning-required');
      assert.equal(finalized.completion.completed, false);
      assert.equal(canonicalJson(capturedState), canonicalJson(capturedPrefix.completion.state));
      receipts.push(clone(application.receipt));
      retainedInput = publishedInput;
    }

    assert.deepEqual(stages.map(stage => [
      stage.label, stage.canonicalBytes, stage.ownerEvents.included,
      stage.physicalItems, stage.logicalOccurrences, stage.rawSourceEntries,
      stage.originalDescriptors, stage.capacityAdmissible,
    ]), [
      // Boundary, complete bytes, owner suffix, items, occurrences, sources, descriptors, admitted.
      ['frozen-reference', 107_680, 36, 13, 16, 16, 17, true],
      ['ordinal-5-captures', 115_695, 36, 15, 19, 19, 20, true],
      ['ordinal-5-lane-first', 117_439, 36, 15, 19, 19, 20, true],
      ['ordinal-5-receipt', 117_446, 36, 15, 19, 19, 20, true],
      ['ordinal-6-captures', 120_531, 36, 15, 22, 22, 23, true],
      ['ordinal-6-lane-first', 122_275, 36, 15, 22, 22, 23, true],
      ['ordinal-6-receipt', 122_282, 36, 15, 22, 22, 23, true],
      ['ordinal-7-captures', 125_367, 36, 15, 25, 25, 26, true],
      ['ordinal-7-lane-first', 127_111, 36, 15, 25, 25, 26, true],
      ['ordinal-7-receipt', 127_118, 36, 15, 25, 25, 26, true],
      ['ordinal-8-captures', 130_203, 36, 15, 28, 28, 29, true],
      ['ordinal-8-lane-first', 130_769, 33, 15, 28, 28, 29, true],
      ['ordinal-8-receipt', 130_776, 33, 15, 28, 28, 29, true],
      ['ordinal-9-captures', 130_794, 29, 15, 31, 31, 32, true],
      ['ordinal-9-lane-first', 130_613, 27, 15, 31, 31, 32, true],
      ['ordinal-9-receipt', 130_620, 27, 15, 31, 31, 32, true],
      ['ordinal-10-captures', 129_526, 24, 15, 34, 34, 35, true],
      ['ordinal-10-lane-first', 128_890, 23, 15, 34, 34, 35, true],
      ['ordinal-10-receipt', 128_897, 23, 15, 34, 34, 35, true],
      ['ordinal-11-captures', 130_194, 22, 15, 37, 37, 38, true],
      ['ordinal-11-lane-first', 130_081, 19, 15, 37, 37, 38, true],
      ['ordinal-11-receipt', 130_088, 19, 15, 37, 37, 38, true],
      ['ordinal-12-captures', 130_381, 15, 15, 40, 40, 41, true],
      ['ordinal-12-lane-first', 130_821, 13, 15, 40, 40, 41, true],
      ['ordinal-12-receipt', 130_828, 13, 15, 40, 40, 41, true],
      ['ordinal-13-captures', 131_067, 6, 15, 43, 43, 44, true],
      ['ordinal-13-lane-first', 130_353, 5, 15, 43, 43, 44, true],
      ['ordinal-13-receipt', 130_360, 5, 15, 43, 43, 44, true],
      ['ordinal-14-captures-refused', 159_228, 36, 15, 46, 46, 47, false],
    ]);
    assert.deepEqual(refusal, {
      ordinal: 14,
      phase: 'captures',
      reason: 'model-packet-bytes',
      required: 159_228,
      limit: 131_072,
      target,
      componentReceipts: receipts.map(receipt => receipt.receiptHash),
    });
    assert.equal(stages.at(-2).label, 'ordinal-13-receipt');
    assert.equal(stages.at(-2).canonicalBytes, 130_360);
    assert.deepEqual(stages.at(-1).mandatoryHeadroom, {
      classes: ['verification', 'review', 'lint'],
      sourceDelta: 3,
      descriptorDelta: 3,
      requiredSources: 49,
      requiredDescriptors: 50,
    });
    assert.deepEqual(t003CheckSummary(retainedInput), {
      total: 194,
      passed: 171,
      failed: 23,
    });
    for (const field of ['verification', 'review', 'lint']) {
      assert.deepEqual(
        retainedInput[field].slice(0, reference.input[field].length),
        reference.input[field],
        `${field}: immutable historical captures remain the exact prefix`,
      );
    }
    const immutablePaths = /** @type {Record<string, unknown>[]} */ (reference.files)
      .map(file => file.path)
      .filter(relative => (
        relative !== `${target.specPath.slice(0, -'spec.md'.length)}tasks.md`
        && relative !== '.dude/state/task-state.json'
      ));
    for (const relative of immutablePaths) {
      assert.deepEqual(
        fs.readFileSync(path.join(root, relative)),
        filePreimages.get(relative),
        relative,
      );
    }
    assert.deepEqual(fs.readFileSync(
      new URL('../../../scripts/fixtures/064-work-receipt-overflow-handling/reference.json', import.meta.url),
    ), referenceBytes);
    const research = episode.research.prefixes;
    assert.equal(literalReference.modelBytes - research[0].packetBytes, 10);
    assert.ok(sameProjectionLiteralBytes > stages[0].canonicalBytes,
      'compare the exact selected projection, not an assumed offset from historical research');
    assert.deepEqual(runtimeCalls.map(({ command, mode }) => `${command}:${mode}`), [
      'transition:bind-post-learning-inspection',
      'transition:issue-attempt-permit',
      'authorize:recovery',
      'complete:capture',
      'transition:prepare-projection',
      'transition:prepare-projection',
      'transition:commit-lane-receipt',
      'complete:finalize',
    ]);
    context.diagnostic(canonicalJson({
      feature064T003ComponentMeasurement: {
        classification: 'counterfactual-component-growth-not-supported-Work-continuation',
        fixture: readRetentionEpisodeFixture().descriptor,
        reference: contentDescriptor(referenceBytes),
        productionFormat: 'dude-work-model-view-v1',
        productionOrder: 'lane-first',
        stages,
        literalHistoryReferenceBytes: literalReference.modelBytes,
        sameProjectionLiteralReferenceBytes: sameProjectionLiteralBytes,
        lastFittingComponentPrefix: 'ordinal-13-receipt',
        firstCounterfactualByteOverflow: refusal,
        discardedComponentSuccessors: {
          ordinals: [6, 7, 8, 9, 10, 11, 12, 13],
          finalized: true,
          completed: false,
          reason: 'learning-required',
          governanceProjectionCarried: false,
        },
        historicalResearch: {
          format: episode.research.format,
          order: episode.research.projectionOrder,
          prefixes: research,
        },
        actual062Operations: 0,
      },
    }));
  });
});

nodeTest('Feature 064 T003: the public runner retains the controlled 16-check address-test lint episode', async () => {
  const episode = readRetentionEpisodeFixture().value;
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.specialistResult = focusedFailedSpecialistPair(
      request.assessment,
      'T003 initial verification control',
    );
    let assessment = null;
    const captureInputs = [];
    const laneRequests = [];
    const challengeKinds = [];
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('Feature 064 T003 runner runtime'),
        invoke(command, lowLevelRequest) {
          if (command === 'complete' && lowLevelRequest.mode === 'capture') {
            captureInputs.push(clone(lowLevelRequest.input));
          }
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      laneOwner: {
        identity: sha256('Feature 064 T003 runner lane owner'),
        apply(laneRequest) {
          laneRequests.push(clone(laneRequest));
          return applyLightweightWorkRequest(laneRequest);
        },
      },
      exchange(challenge) {
        challengeKinds.push(challenge.kind);
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge, {
            action: episode.payload.approachBasis.action,
            materialInputs: clone(episode.payload.approachBasis.materialInputs),
            summary: 'Run the controlled fixture verification and required lint checks.',
          });
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        assert.equal(challenge.kind, 'specialist-pair');
        assert.ok(assessment);
        return focusedChallengeResponse(
          challenge,
          'specialistResult',
          cloneCanonical(episode.payload.specialistResult),
        );
      },
    });
    assert.equal(
      result.outcome,
      'ended',
      `${result.reason}:${result.steps.map(step => `${step.step}=${step.reason}`).join(',')}`,
    );
    assert.equal(result.reason, 'task-settled');
    assert.equal(result.haltReport, null);
    assert.deepEqual(challengeKinds, ['assessment', 'specialist-pair']);
    assert.equal(captureInputs.length, 2);
    assert.equal(captureInputs[0].verification[0].state, 'failed');
    assert.deepEqual(captureInputs[0].lint, []);
    assert.equal(captureInputs[1].verification.length, 1);
    assert.equal(captureInputs[1].review.length, 1);
    assert.equal(captureInputs[1].lint.length, 1);
    assert.deepEqual(captureInputs[1].lint[0], captureInputs[1].verification[0]);
    const verification = normalizeVerificationEnvelopeV2(
      t003TrustedCapture(captureInputs[1].verification[0]),
    );
    const review = normalizeIndependentReviewEnvelopeV2(
      t003TrustedCapture(captureInputs[1].review[0]),
      verification,
    );
    assert.equal(verification.checks.length, 16);
    assert.ok(verification.checks.every(check => check.outcome === 'passed'));
    assert.equal(review.verdict, 'accepted');
    assert.deepEqual(review.findings, []);
    assert.ok(result.steps.some(step => (
      step.step === 'attempt:2:settle-completion' && step.reason === 'completed'
    )));
    assert.ok(result.steps.some(step => (
      step.step === 'commit-lane-receipt' && step.reason === 'lane-receipt-committed'
    )));
    assert.ok(laneRequests.some(({ operation, mutation }) => (
      operation === 'work-project' && mutation.kind === 'append-event'
    )));
    assert.ok(laneRequests.some(({ operation, mutation }) => (
      operation === 'work-set' && mutation.kind === 'task-completed'
    )));
    assert.match(
      fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'),
      new RegExp(`- \\[x\\] ${TARGET.taskKey}`),
    );
    assert.equal(
      episode.classification,
      'test-owned-fixture-assertion-not-production-verdict',
    );
  });
});

/**
 * Recreate the complete reference through authentic ordinal-5 completion, then
 * exercise exactly one fresh terminal or negative branch.
 * @param {import('node:test').TestContext} context
 * @param {'terminal-settlement'|'terminal-receipt-misbound'|'premature-attempt'} scenario
 */
async function runT003FullReferenceCase(context, scenario) {
  const episode = readRetentionEpisodeFixture().value;
  await withReferenceWorkspace(async ({
    root, reference, referenceBytes, input: initialInput, filePreimages,
  }) => {
    const target = canonicalTarget(initialInput.target);
    const historicalRecords = currentRunRecords(initialInput);
    const historicalEvents = t003CurrentEvents(initialInput);
    const historicalLane = t003LaneEvents(root, target);
    const historicalReview = historicalEvents.find(event => event.type === 'learning-review');
    const occurrences = historicalEvents.filter(event => (
      event.type === 'approach-occurrence' || event.type === 'finding-occurrence'
    ));
    const repeat = deriveEarliestRepeatRelationshipV1(occurrences);
    const failedSet = deriveFailedApproachSetV1(repeat, occurrences);
    assert.ok(historicalReview);
    assert.equal(historicalRecords.length, 12);
    assert.equal(historicalLane.global.length, 20);
    assert.deepEqual(historicalLane.target, historicalEvents);
    assert.equal(historicalReview.failedApproachSetIdentity, failedSet.setIdentity);

    let retainedInput = clone(initialInput);
    let lastRuntime = null;
    let producedStreams = null;
    let admissions = 0;
    const runtimeCalls = [];
    const operationTrace = [];
    const stages = [];
    const receipts = [];
    const laneCalls = [];
    let terminalReceiptProof = null;
    const initialBinding = t003LaneBinding(root, reference, target);
    const checkpoint = memoryCheckpointStore();
    const supervisor = sealedSupervisorSession({
      identity: randomBytes(32).toString('hex'),
      admit(request, identity) {
        assert.equal(admissions += 1, 1);
        const body = {
          version: 1,
          requestIdentity: request.requestIdentity,
          invocationIdentity: randomBytes(32).toString('hex'),
          workerToken: randomBytes(32).toString('hex'),
          workerGeneration: 1,
          supervisorAuthorityIdentity: identity,
        };
        return { ...body, admissionIdentity: admissionIdentity(request, body) };
      },
    });
    const adapter = createAuthorizedHostAdapter({
      state: t003HistoricalState(target, historicalEvents),
      target,
      inspectionIdentity: sha256('Feature 064 T003 fresh test-owned state'),
      workspace: t003CheckpointWorkspace(root, target, initialBinding),
    }, {
      supervisorSession: supervisor,
      noEffectAuthority: sealedNoEffectAuthority(),
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('Feature 064 T003 unchanged runtime observer'),
        invoke(command, request) {
          const value = runCommand(command, request);
          lastRuntime = { command, mode: request.mode ?? null, value: clone(value) };
          const body = value.authorization ?? value.completion ?? value.transition ?? value.learning;
          runtimeCalls.push({
            command,
            mode: request.mode ?? null,
            requestStateHash: request.state ? sha256(canonicalJson(request.state)) : null,
            returnedStateHash: body?.state ? sha256(canonicalJson(body.state)) : null,
            reason: body?.reason ?? null,
            completion: command === 'complete' && body ? {
              captured: body.captured,
              finalized: body.finalized,
              completed: body.completed ?? null,
            } : null,
            evidenceHash: value.inspection?.evidenceHash ?? null,
          });
          if (command === 'complete' && request.mode === 'capture') {
            producedStreams = clone(request.input);
          }
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('Feature 064 T003 disposable lane writer'),
        apply(request) {
          assert.equal(request.root, root);
          laneCalls.push(clone(request));
          const applied = applyLightweightWorkRequest(request);
          if (scenario !== 'terminal-receipt-misbound'
            || request.operation !== 'work-set'
            || applied.ok !== true) return applied;
          const { receiptHash: _receiptHash, ...receiptBody } = applied.receipt;
          const misboundBody = {
            ...receiptBody,
            permitHash: sha256('Feature 064 T003 full-reference misbound terminal receipt'),
          };
          const misboundReceipt = {
            ...misboundBody,
            receiptHash: sha256(canonicalJson(misboundBody)),
          };
          terminalReceiptProof = {
            genuineReceipt: clone(applied.receipt),
            suppliedReceipt: clone(misboundReceipt),
          };
          return { ...applied, receipt: misboundReceipt };
        },
      },
    });
    const admitted = adapter.snapshot();
    for (const identity of [
      admitted.invocationIdentity, admitted.workerToken, supervisor.identity,
    ]) {
      assert.equal(canonicalJson(reference).includes(identity), false);
      assert.equal(canonicalJson(episode).includes(identity), false);
    }
    const snapshot = session => ({
      ...acceptedAuthorityTuple(session),
      acceptedState: clone(session.acceptedState),
      hostRevision: session.hostRevision,
      pendingEffect: clone(session.pendingEffect),
    });
    const operate = (label, operation, payload, outcome, reason) => {
      const before = adapter.snapshot();
      if (operationTrace.length > 0) {
        assert.deepEqual(snapshot(before), operationTrace.at(-1).after);
      }
      const filesBefore = t003FileIdentities(root, reference);
      const result = adapter.run(sealedRequest(adapter, operation, payload));
      validateHostAdapterResult(result);
      assert.deepEqual(adapter.snapshot(), result.session);
      operationTrace.push({
        label, operation, outcome: result.outcome, reason: result.reason,
        before: snapshot(before), after: snapshot(result.session),
      });
      if (result.outcome !== outcome || result.reason !== reason) {
        context.diagnostic(canonicalJson({ unexpectedSupportedOperation: operationTrace.at(-1) }));
      }
      assert.equal(result.outcome, outcome, `${label}: ${result.reason}`);
      assert.equal(result.reason, reason, label);
      assert.equal(result.session.hostRevision, before.hostRevision + 2);
      assert.equal(
        result.session.acceptedRevision,
        before.acceptedRevision + Number(result.session.acceptedStateHash !== before.acceptedStateHash),
      );
      if (outcome !== 'accepted' || operation === 'fresh-inspection') {
        assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before));
      }
      if ([
        'prepare-authoritative-projection', 'apply-lane-effect', 'commit-lane-receipt',
      ].includes(operation) || outcome === 'hard-stop') {
        assert.deepEqual(result.session.pendingEffect, before.pendingEffect);
      }
      if (operation !== 'apply-lane-effect') {
        assert.deepEqual(t003FileIdentities(root, reference), filesBefore);
      }
      return result;
    };
    const measure = async (label, inspection = runCommand('inspect', {
      trigger: 'explicit-inspection', input: retainedInput,
    }).inspection) => {
      const stage = await t003StageMeasurement({
        label, root, reference, input: retainedInput, inspection,
      });
      stages.push(stage);
      assert.equal(stage.capacityAdmissible, true, label);
      assert.ok(stage.canonicalBytes <= 131_072, label);
      assert.ok(stage.physicalItems <= stage.logicalOccurrences, label);
      assert.ok(stage.logicalOccurrences <= stage.originalDescriptors, label);
      assert.ok(stage.originalDescriptors <= 64 && stage.rawSourceEntries <= 64, label);
      assert.ok(stage.maximumSourceBodyBytes <= 1_048_576, label);
      assert.ok(stage.aggregateDecodedBytes <= 4_194_304, label);
      assert.ok(stage.requestBytes <= 6_291_456, label);
      assert.deepEqual(currentRunRecords(retainedInput).slice(0, historicalRecords.length), historicalRecords);
      const lane = t003LaneEvents(root, target);
      assert.deepEqual(lane.global.slice(0, historicalLane.global.length), historicalLane.global);
      assert.deepEqual(lane.target.slice(0, historicalEvents.length), historicalEvents);
      for (const field of ['verification', 'review', 'lint']) {
        assert.deepEqual(
          retainedInput[field].slice(0, initialInput[field].length),
          initialInput[field],
          `${label}: complete original ${field} captures`,
        );
      }
      return inspection;
    };
    const project = async (label) => {
      const batch = adapter.snapshot().pendingEffect.projectionBatch;
      for (let index = 0; index < batch.events.length; index += 1) {
        const binding = t003LaneBinding(root, reference, target);
        const prepared = operate(`${label}:prepare:${index + 1}`, 'prepare-authoritative-projection', {
          projection: {
            input: retainedInput,
            laneBinding: {
              lanePrestate: binding.lanePrestate,
              targetMapping: binding.targetMapping,
              operationTime: '2026-09-18T12:00:05Z',
            },
          },
        }, 'effect-required', 'projection-prepared');
        await measure(`${label}:prepare:${index + 1}`, lastRuntime.value.inspection);
        const item = prepared.product.plan.items[index];
        assert.equal(item.eventHash, batch.events[index].eventHash);
        const beforePublish = canonicalJson(retainedInput);
        const currentEvents = t003CurrentEvents(retainedInput);
        const applied = operate(`${label}:lane-first:${index + 1}`, 'apply-lane-effect', {
          laneApplication: {
            ...binding.application,
            permit: item.projectionPermit,
            mutation: item.mutation,
          },
        }, 'effect-required', 'lane-projection-applied');
        assert.equal(canonicalJson(retainedInput), beforePublish);
        assert.deepEqual(t003LaneEvents(root, target).target, [...currentEvents, batch.events[index]]);
        await measure(`${label}:lane-first:${index + 1}`);
        assert.equal(stages.at(-1).surfaces.equal, false);
        retainedInput = publishCurrentRun(retainedInput, item.currentRunRecord);
        await measure(`${label}:dual-surface:${index + 1}`);
        const receipt = clone(applied.product.receipt);
        operate(`${label}:receipt:${index + 1}`, 'commit-lane-receipt', {
          laneReceipt: { input: retainedInput, permit: item.projectionPermit, receipt },
        }, 'effect-required', 'lane-receipt-committed');
        await measure(`${label}:receipt:${index + 1}`, lastRuntime.value.inspection);
        assert.deepEqual(t003CurrentEvents(retainedInput), t003LaneEvents(root, target).target);
        assert.equal(stages.at(-1).surfaces.equal, true);
        const files = t003FileIdentities(root, reference);
        assert.equal(receipt.tasksPoststateHash, files[binding.targetMapping.tasksPath].sha256);
        assert.equal(receipt.taskStatePoststateHash, files['.dude/state/task-state.json'].sha256);
        receipts.push(receipt);
      }
    };

    const inspected = operate('initial-inspection', 'fresh-inspection', {
      input: retainedInput,
    }, 'accepted', 'inspection-refreshed');
    await measure('frozen-reference', lastRuntime.value.inspection);
    assert.equal(stages[0].canonicalBytes, 107_680);
    assert.deepEqual(stages[0].checks, { total: 50, passed: 27, failed: 23 });
    assert.equal(inspected.session.acceptedState.overallUsed, 4);
    operate('derive-required', 'advance-governance', {
      governance: { action: 'resume-learning', input: retainedInput },
    }, 'accepted', 'governance-resumed');
    assert.equal(adapter.snapshot().acceptedState.learningGovernance.phase, 'required');
    assert.deepEqual(adapter.snapshot().acceptedState.learningGovernance.failedApproachSet, failedSet);

    const findingBody = {
      version: 1,
      statement: 'Synthetic fixture governance review; not user judgment or real 062 continuation.',
      evidenceIdentities: [sha256('Feature 064 T003 synthetic governance provider')],
      assumptionIdentities: [],
    };
    const review = {
      version: 2,
      target,
      assumptionIdentities: [],
      findings: [{ ...findingBody, findingIdentity: sha256(canonicalJson(findingBody)) }],
      alternatives: clone(historicalReview.alternatives),
      outcome: 'selected-alternative',
      selectedAlternativeIdentity: historicalReview.selectedAlternativeIdentity,
    };
    const reviewed = operate('synthetic-review', 'advance-governance', {
      governance: { action: 'review-learning', input: retainedInput, review },
    }, 'effect-required', 'learning-reviewed');
    assert.equal(reviewed.session.pendingEffect.provisionalState.learningGovernance.phase, 'reviewed');
    assert.notEqual(
      reviewed.session.pendingEffect.provisionalState.learningGovernance.reviewIdentity,
      historicalReview.reviewIdentity,
    );
    await project('learning-result');
    operate('learning-result:settle', 'settle-effect', {
      input: retainedInput,
    }, 'accepted', 'projection-verified');
    assert.equal(adapter.snapshot().acceptedState.learningGovernance.phase, 'projected');
    await measure('learning-result:settled', lastRuntime.value.inspection);
    operate('post-learning-inspection', 'fresh-inspection', {
      input: retainedInput,
    }, 'accepted', 'inspection-refreshed');
    operate('bind-selected-alternative', 'advance-governance', {
      governance: { action: 'bind-alternative', input: retainedInput },
    }, 'accepted', 'post-learning-inspection-bound');
    assert.equal(adapter.snapshot().acceptedState.learningGovernance.phase, 'alternative-inspected');
    const inspection = await measure('before-ordinal-5', lastRuntime.value.inspection);
    const binding = t003LaneBinding(root, reference, target);
    const assessment = {
      evidenceHash: inspection.evidenceHash,
      intent: 'unchanged',
      action: episode.payload.approachBasis.action,
      materialInputs: clone(episode.payload.approachBasis.materialInputs),
      equivalence: 'distinct',
      retention: 'transient',
      summary: 'Retain the complete controlled payload from the carried fixture state.',
    };
    const authorized = operate('ordinal-5:authorize', 'authorize-attempt', {
      authorization: {
        input: retainedInput,
        assessment,
        permit: { lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping },
      },
    }, 'accepted', 'authorized');
    assert.equal(authorized.session.acceptedState.overallUsed, 5);
    assert.equal(authorized.session.acceptedState.recoveryUsed[0].count, 4);
    assert.equal(authorized.session.acceptedState.learningGovernance.phase, 'alternative-authorized');
    const recordInput = clone(retainedInput);
    delete recordInput.verification;
    delete recordInput.review;
    delete recordInput.lint;
    operate('ordinal-5:capture', 'record-attempt-result', {
      attemptResult: { input: recordInput, result: clone(episode.payload.specialistResult) },
    }, 'effect-required', 'occurrence-retention-required');
    assert.ok(producedStreams);
    const verification = normalizeVerificationEnvelopeV2(t003TrustedCapture(producedStreams.verification[0]));
    const independentReview = normalizeIndependentReviewEnvelopeV2(
      t003TrustedCapture(producedStreams.review[0]), verification,
    );
    assert.equal(verification.checks.length, 16);
    assert.ok(verification.checks.every(check => check.outcome === 'passed'));
    assert.equal(independentReview.verdict, 'accepted');
    assert.deepEqual(independentReview.findings, []);
    assert.deepEqual(producedStreams.lint, producedStreams.verification);
    for (const field of ['verification', 'review', 'lint']) {
      assert.equal(producedStreams[field].length, 1);
      retainedInput[field].push(...producedStreams[field]);
    }
    await measure('ordinal-5:captures');
    await project('ordinal-5:completion');
    const settled = operate('ordinal-5:settle', 'settle-effect', {
      input: retainedInput,
    }, 'accepted', 'completed');
    assert.equal(lastRuntime.value.completion.finalized, true);
    assert.equal(lastRuntime.value.completion.completed, true);
    assert.equal(settled.session.acceptedState.learningGovernance.phase, 'alternative-verified');
    assert.equal(settled.session.acceptedState.pending.length, 0);
    assert.equal(settled.session.acceptedState.completed.length, 5);
    assert.equal(settled.session.pendingEffect, null);
    await measure('ordinal-5:settled', lastRuntime.value.inspection);

    const finalEvents = t003CurrentEvents(retainedInput);
    assert.deepEqual(finalEvents.slice(historicalEvents.length).map(event => event.type), [
      'learning-review', 'learning-governance', 'approach-occurrence',
    ]);
    const finalOccurrences = finalEvents.filter(event => (
      event.type === 'approach-occurrence' || event.type === 'finding-occurrence'
    ));
    assert.deepEqual(deriveEarliestRepeatRelationshipV1(finalOccurrences), repeat);
    assert.deepEqual(deriveFailedApproachSetV1(repeat, finalOccurrences), failedSet);
    assert.deepEqual(t003CheckSummary(retainedInput), { total: 66, passed: 43, failed: 23 });
    assert.deepEqual(stages.at(-1).mandatoryHeadroom, {
      classes: ['verification', 'review', 'lint'],
      sourceDelta: 3,
      descriptorDelta: 3,
      requiredSources: 22,
      requiredDescriptors: 23,
    });
    assert.deepEqual(stages.at(-1).surfaces, {
      currentRun: 15, laneTarget: 15, laneGlobal: 23, equal: true,
    });
    assert.ok(stages.at(-1).aggregateDecodedBytes > stages[0].aggregateDecodedBytes);
    const measuredBytes = Object.fromEntries(stages.map(stage => [stage.label, stage.canonicalBytes]));
    assert.deepEqual([
      measuredBytes['learning-result:settled'],
      measuredBytes['ordinal-5:captures'],
      measuredBytes['ordinal-5:completion:lane-first:1'],
      measuredBytes['ordinal-5:completion:receipt:1'],
      measuredBytes['ordinal-5:settled'],
    ], [113_798, 121_813, 123_557, 123_564, 123_564]);
    for (const [relative, bytes] of filePreimages) {
      if (relative === binding.targetMapping.tasksPath || relative === '.dude/state/task-state.json') continue;
      assert.deepEqual(fs.readFileSync(path.join(root, relative)), bytes, relative);
    }
    assert.match(fs.readFileSync(path.join(root, binding.targetMapping.tasksPath), 'utf8'),
      new RegExp(`- \\[~\\] ${target.taskKey}`));
    assert.equal(t003SnapshotGlyph(root, target), '~');
    assert.deepEqual(fs.readFileSync(
      new URL('../../../scripts/fixtures/064-work-receipt-overflow-handling/reference.json', import.meta.url),
    ), referenceBytes);
    assert.equal(receipts.length, 3);
    assert.equal(admissions, 1);
    assert.deepEqual(laneCalls.map(call => call.operation), [
      'work-project', 'work-project', 'work-project',
    ]);
    assert.equal(runtimeCalls.filter(call => call.command === 'complete' && call.mode === 'capture').length, 1);
    assert.deepEqual(
      operationTrace.map(row => [row.after.acceptedRevision, row.after.overallUsed]),
      [
        [0, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4],
        [1, 4], [2, 4], [2, 4], [3, 4], [4, 5], [4, 5], [4, 5], [4, 5],
        [4, 5], [5, 5],
      ],
    );
    assert.equal(checkpoint.calls.filter(call => call === 'claim').length, 1);
    assert.ok(checkpoint.pair.claim, 'the fresh full-reference owner claim remains active');
    assert.ok(checkpoint.pair.checkpoint, 'the fresh full-reference checkpoint remains active');

    const preterminalSession = adapter.snapshot();
    const preterminalFiles = t003FileIdentities(root, reference);
    const preterminalInput = canonicalJson(retainedInput);
    const preterminalReceipts = canonicalJson(receipts);
    const preterminalCurrentEvents = clone(t003CurrentEvents(retainedInput));
    const preterminalLaneEvents = clone(t003LaneEvents(root, target));
    assert.equal(preterminalSession.acceptedRevision, 5);
    assert.equal(preterminalSession.acceptedState.overallUsed, 5);
    assert.deepEqual(preterminalSession.acceptedState.recoveryUsed, [{
      targetKey: canonicalJson(target),
      targetHash: sha256(canonicalJson(target)),
      count: 4,
    }]);
    assert.deepEqual(preterminalSession.acceptedState.pending, []);
    assert.equal(preterminalSession.acceptedState.completed.length, 5);
    assert.equal(preterminalSession.acceptedState.learningGovernance.phase, 'alternative-verified');
    const terminalStageIdentity = stage => ({
      label: stage.label,
      canonicalBytes: stage.canonicalBytes,
      byteHeadroom: stage.byteHeadroom,
      physicalItems: stage.physicalItems,
      logicalOccurrences: stage.logicalOccurrences,
      rawSourceEntries: stage.rawSourceEntries,
      originalDescriptors: stage.originalDescriptors,
      maximumSourceBodyBytes: stage.maximumSourceBodyBytes,
      aggregateDecodedBytes: stage.aggregateDecodedBytes,
      requestBytes: stage.requestBytes,
      capacityAdmissible: stage.capacityAdmissible,
      refusalReason: stage.refusalReason,
      sourceIdentity: stage.sourceIdentity,
      evidenceHash: stage.evidenceHash,
      packetIdentity: stage.packetIdentity,
      ownerEvents: stage.ownerEvents,
      checks: stage.checks,
      surfaces: stage.surfaces,
      mandatoryHeadroom: stage.mandatoryHeadroom,
    });
    const preterminalStageIdentity = {
      canonicalBytes: 123_564,
      byteHeadroom: 7_508,
      physicalItems: 15,
      logicalOccurrences: 19,
      rawSourceEntries: 19,
      originalDescriptors: 20,
      maximumSourceBodyBytes: 77_433,
      aggregateDecodedBytes: 343_915,
      requestBytes: 142_712 + Buffer.byteLength(canonicalJson(root)) - 2,
      capacityAdmissible: true,
      refusalReason: null,
      sourceIdentity: 'acc7f75ea4a3ddc07fcb7f041079ff610910750312509d914b58b599c6ccae18',
      evidenceHash: 'de0e164bed963489e4388ea834c2a996e90b4ecbf017cb7e9882910df4938b66',
      packetIdentity: 'd69d914eede010845190df9929496e3d944ade0390bdc757d41d388c59b2ad67',
      ownerEvents: { included: 36, total: 36 },
      checks: { total: 66, passed: 43, failed: 23 },
      surfaces: { currentRun: 15, laneTarget: 15, laneGlobal: 23, equal: true },
      mandatoryHeadroom: {
        classes: ['verification', 'review', 'lint'],
        sourceDelta: 3,
        descriptorDelta: 3,
        requiredSources: 22,
        requiredDescriptors: 23,
      },
    };
    const appliedStageIdentity = {
      ...preterminalStageIdentity,
      canonicalBytes: 123_550,
      byteHeadroom: 7_522,
      sourceIdentity: 'c67f987bdfcc66afcfa74bc4423483af4c42bdad45c19bb30c725246c6af40c8',
      evidenceHash: 'f7d900a245b4a3e46e68b84aa2aa95273fbda27c9d8dff322dfafc07bce54a2d',
      packetIdentity: '24bd7aca5c4a48b58095dcaa6fd4e977f5b9047c9e3b5e19b6ffe792e3fc85e5',
    };
    const assertTerminalStages = expected => assert.deepEqual(
      stages.filter(stage => stage.label.startsWith('terminal:')).map(terminalStageIdentity),
      expected.map(([label, applied]) => ({
        label,
        ...(applied ? appliedStageIdentity : preterminalStageIdentity),
      })),
    );

    if (scenario === 'premature-attempt') {
      operate('ordinal-6:fresh-inspection', 'fresh-inspection', {
        input: retainedInput,
      }, 'accepted', 'inspection-refreshed');
      const continuationInspection = await measure(
        'before-ordinal-6-authorization',
        lastRuntime.value.inspection,
      );
      const beforeRefusal = adapter.snapshot();
      const refused = operate('ordinal-6:authorize', 'authorize-attempt', {
        authorization: {
          input: retainedInput,
          assessment: {
            ...assessment,
            evidenceHash: continuationInspection.evidenceHash,
            equivalence: 'none',
          },
        },
      }, 'hard-stop', 'learning-required');
      assert.equal(lastRuntime.command, 'authorize');
      assert.equal(lastRuntime.mode, 'recovery');
      assert.deepEqual(lastRuntime.value.authorization.state, beforeRefusal.acceptedState);
      assert.equal(lastRuntime.value.authorization.authorized, false);
      assert.equal(lastRuntime.value.inspection.overflow, false);
      assert.equal(Object.hasOwn(refused, 'capacity'), false);
      assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(beforeRefusal));
      assert.deepEqual(refused.session.pendingEffect, beforeRefusal.pendingEffect);
      assert.deepEqual(t003FileIdentities(root, reference), preterminalFiles);
      assert.equal(canonicalJson(retainedInput), preterminalInput);
      assert.equal(canonicalJson(receipts), preterminalReceipts);
      assert.deepEqual(operationTrace.slice(-2).map(row => [
        row.operation, row.outcome, row.reason, row.after.acceptedRevision, row.after.hostRevision,
      ]), [
        ['fresh-inspection', 'accepted', 'inspection-refreshed', 5, 38],
        ['authorize-attempt', 'hard-stop', 'learning-required', 5, 40],
      ]);
      assert.ok(checkpoint.pair.checkpoint, 'the ordering hard stop does not claim cleanup');
      const cleanup = adapter.end('hard-stop-recorded');
      assert.equal(cleanup.outcome, 'ended');
      assert.equal(cleanup.reason, 'hard-stop-recorded');
      assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
      context.diagnostic(canonicalJson({
        feature064T003PrematureAttemptNegative: {
          classification: 'separate-next-attempt-governance-negative',
          reference: contentDescriptor(referenceBytes),
          fixture: readRetentionEpisodeFixture().descriptor,
          productionFormat: 'dude-work-model-view-v1',
          productionOrder: 'lane-first',
          supervisorAdmissions: admissions,
          stages,
          operationTrace,
          runtimeCalls,
          priorReceipts: receipts,
          lastResultRetentionCycle: 5,
          firstRefusal: {
            ordinal: 6,
            operation: 'authorize-attempt',
            outcome: refused.outcome,
            reason: refused.reason,
            governancePhase: refused.session.acceptedState.learningGovernance.phase,
            modelByteCeilingReached: false,
            target,
            acceptedStateHash: refused.session.acceptedStateHash,
            acceptedRevision: refused.session.acceptedRevision,
            hostRevision: refused.session.hostRevision,
            filesPreserved: preterminalFiles,
          },
          explicitTestCleanup: cleanup.reason,
          naturalSettlementClaimed: false,
          actual062Operations: 0,
        },
      }));
      return;
    }

    const audited = operate('terminal:audit', 'audit-run', {
      audit: { input: retainedInput },
    }, 'accepted', 'run-audited');
    assert.equal(audited.product.kind, 'run-audit');
    await measure('terminal:audit', lastRuntime.value.inspection);
    const terminalBinding = t003LaneBinding(root, reference, target);
    const mutation = t003TerminalMutation(target);
    const issued = operate('terminal:authorize-lane-effect', 'authorize-lane-effect', {
      laneEffect: {
        input: retainedInput,
        mutation,
        lanePrestate: terminalBinding.lanePrestate,
        targetMapping: terminalBinding.targetMapping,
      },
    }, 'accepted', 'lane-permit-issued');
    await measure('terminal:lane-permit', lastRuntime.value.inspection);
    const permit = clone(issued.product.permit);
    assert.equal(permit.kind, 'lane-mutation');
    assert.equal(permit.operation, 'work-set');
    assert.equal(permit.governancePhase, 'alternative-verified');
    assert.equal(permit.subjectRunStateHash, preterminalSession.acceptedStateHash);
    assert.equal(permit.mutationIdentity, sha256(canonicalJson(mutation)));
    assert.deepEqual(acceptedAuthorityTuple(issued.session), acceptedAuthorityTuple(preterminalSession));
    assert.equal(issued.session.acceptedState.learningGovernance.phase, 'alternative-verified');

    const applyInspection = await measure('terminal:apply-preflight');
    const receiptNegative = scenario === 'terminal-receipt-misbound';
    const applied = operate('terminal:apply-lane-effect', 'apply-lane-effect', {
      laneApplication: {
        ...terminalBinding.application,
        permit,
        mutation,
      },
    }, receiptNegative ? 'hard-stop' : 'accepted',
    receiptNegative ? 'lane-receipt-binding-mismatch' : 'lane-mutation-applied');
    assert.deepEqual(lastRuntime.value.inspection, applyInspection);
    if (receiptNegative) {
      assert.ok(terminalReceiptProof, 'the test-owned lane port retains both terminal receipts');
    }
    const terminalReceipt = receiptNegative
      ? clone(terminalReceiptProof.genuineReceipt)
      : clone(applied.product.receipt);
    const laneAppliedInspection = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: retainedInput,
    }).inspection;
    await measure('terminal:lane-applied', laneAppliedInspection);

    assert.deepEqual(acceptedAuthorityTuple(applied.session), acceptedAuthorityTuple(preterminalSession));
    assert.deepEqual(applied.session.acceptedState, preterminalSession.acceptedState);
    assert.equal(applied.session.acceptedState.learningGovernance.phase, 'alternative-verified');
    assert.equal(applied.session.pendingEffect, null);
    assert.equal(t003ParsedTargetTask(root, target).glyph, 'x');
    assert.equal(t003ParsedTargetTask(root, target).blockedBy, null);
    assert.equal(t003SnapshotGlyph(root, target), 'x');
    assert.deepEqual(t003CurrentEvents(retainedInput), preterminalCurrentEvents);
    assert.deepEqual(t003LaneEvents(root, target), preterminalLaneEvents);
    assert.equal(canonicalJson(retainedInput), preterminalInput);
    assert.equal(canonicalJson(receipts), preterminalReceipts);
    const appliedFiles = t003FileIdentities(root, reference);
    for (const relative of Object.keys(appliedFiles)) {
      if (relative === terminalBinding.targetMapping.tasksPath
        || relative === '.dude/state/task-state.json') continue;
      assert.deepEqual(appliedFiles[relative], preterminalFiles[relative], relative);
    }
    assert.notDeepEqual(
      appliedFiles[terminalBinding.targetMapping.tasksPath],
      preterminalFiles[terminalBinding.targetMapping.tasksPath],
    );
    assert.notDeepEqual(
      appliedFiles['.dude/state/task-state.json'],
      preterminalFiles['.dude/state/task-state.json'],
    );
    assert.equal(terminalReceipt.targetStateChanged, true);
    assert.equal(terminalReceipt.permitHash, permit.permitHash);
    assert.equal(terminalReceipt.mutationIdentity, permit.mutationIdentity);
    assert.equal(terminalReceipt.targetMappingHash, permit.targetMappingHash);
    assert.equal(terminalReceipt.lanePrestateHash, permit.lanePrestateHash);
    assert.equal(
      terminalReceipt.tasksPoststateHash,
      appliedFiles[terminalBinding.targetMapping.tasksPath].sha256,
    );
    assert.equal(
      terminalReceipt.taskStatePoststateHash,
      appliedFiles['.dude/state/task-state.json'].sha256,
    );
    assert.equal(
      terminalReceipt.ownerPoststateHash,
      appliedFiles[terminalBinding.application.owner.ideaPath].sha256,
    );
    const { receiptHash: terminalReceiptHash, ...terminalReceiptBody } = terminalReceipt;
    assert.equal(terminalReceiptHash, sha256(canonicalJson(terminalReceiptBody)));
    assert.deepEqual(laneCalls.map(call => [call.operation, call.mutation.kind]), [
      ['work-project', 'append-event'],
      ['work-project', 'append-event'],
      ['work-project', 'append-event'],
      ['work-set', 'task-completed'],
    ]);
    assert.ok(checkpoint.pair.checkpoint, 'lane application alone does not clean the claim');
    assert.equal(checkpoint.calls.includes('clear'), false);

    if (receiptNegative) {
      assertTerminalStages([
        ['terminal:audit', false],
        ['terminal:lane-permit', false],
        ['terminal:apply-preflight', false],
        ['terminal:lane-applied', true],
      ]);
      const suppliedReceipt = terminalReceiptProof.suppliedReceipt;
      const { receiptHash: suppliedHash, ...suppliedBody } = suppliedReceipt;
      const { receiptHash: genuineHash, permitHash: genuinePermitHash, ...genuineBody } = terminalReceipt;
      assert.deepEqual(Object.keys(suppliedReceipt).sort(), Object.keys(terminalReceipt).sort());
      assert.equal(suppliedHash, sha256(canonicalJson(suppliedBody)));
      assert.equal(genuineHash, sha256(canonicalJson({
        ...genuineBody,
        permitHash: genuinePermitHash,
      })));
      assert.deepEqual(
        Object.fromEntries(Object.entries(suppliedBody).filter(([field]) => field !== 'permitHash')),
        genuineBody,
      );
      assert.notEqual(suppliedReceipt.permitHash, permit.permitHash);
      assert.equal(terminalReceipt.permitHash, permit.permitHash);
      assert.deepEqual(operationTrace.slice(-3).map(row => [
        row.operation, row.outcome, row.reason, row.after.acceptedRevision, row.after.hostRevision,
      ]), [
        ['audit-run', 'accepted', 'run-audited', 5, 38],
        ['authorize-lane-effect', 'accepted', 'lane-permit-issued', 5, 40],
        ['apply-lane-effect', 'hard-stop', 'lane-receipt-binding-mismatch', 5, 42],
      ]);
      const cleanup = adapter.end('hard-stop-recorded');
      assert.equal(cleanup.outcome, 'ended');
      assert.equal(cleanup.reason, 'hard-stop-recorded');
      assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
      context.diagnostic(canonicalJson({
        feature064T003MisboundTerminalReceipt: {
          classification: 'matched-terminal-receipt-negative',
          reference: contentDescriptor(referenceBytes),
          fixture: readRetentionEpisodeFixture().descriptor,
          productionFormat: 'dude-work-model-view-v1',
          productionOrder: 'lane-first',
          supervisorAdmissions: admissions,
          stages,
          operationTrace,
          runtimeCalls,
          priorReceipts: receipts,
          terminalPermit: permit,
          genuineReceipt: terminalReceipt,
          suppliedMisboundReceipt: suppliedReceipt,
          acceptedState: {
            hash: applied.session.acceptedStateHash,
            revision: applied.session.acceptedRevision,
            overallUsed: applied.session.acceptedState.overallUsed,
            recoveryUsed: applied.session.acceptedState.recoveryUsed,
            pending: applied.session.acceptedState.pending,
            completed: applied.session.acceptedState.completed,
            governancePhase: applied.session.acceptedState.learningGovernance.phase,
          },
          appliedPoststate: appliedFiles,
          terminalReceiptCommitted: false,
          taskSettledClaimed: false,
          successfulSettlementCleanupClaimed: false,
          explicitTestCleanup: cleanup.reason,
          actual062Operations: 0,
        },
      }));
      return;
    }

    const beforeCommit = adapter.snapshot();
    const expectedTerminalState = clone(beforeCommit.acceptedState);
    delete expectedTerminalState.learningGovernance;
    validateRunState(expectedTerminalState);
    const committed = operate('terminal:commit-lane-receipt', 'commit-lane-receipt', {
      laneReceipt: {
        input: retainedInput,
        permit,
        receipt: terminalReceipt,
      },
    }, 'accepted', 'lane-receipt-committed');
    await measure('terminal:receipt-committed', lastRuntime.value.inspection);
    assert.deepEqual(committed.product.receipt, terminalReceipt);
    assert.equal(committed.product.terminalEvidenceIdentity, terminalReceipt.receiptHash);
    assert.deepEqual(committed.session.acceptedState, expectedTerminalState);
    assert.equal(Object.hasOwn(committed.session.acceptedState, 'learningGovernance'), false);
    assert.equal(committed.session.acceptedRevision, beforeCommit.acceptedRevision + 1);
    assert.equal(committed.session.acceptedState.overallUsed, 5);
    assert.deepEqual(committed.session.acceptedState.recoveryUsed, beforeCommit.acceptedState.recoveryUsed);
    assert.deepEqual(committed.session.acceptedState.pending, []);
    assert.deepEqual(committed.session.acceptedState.completed, beforeCommit.acceptedState.completed);
    assert.deepEqual(t003FileIdentities(root, reference), appliedFiles);
    assert.deepEqual(t003CurrentEvents(retainedInput), preterminalCurrentEvents);
    assert.deepEqual(t003LaneEvents(root, target), preterminalLaneEvents);
    assert.equal(canonicalJson(receipts), preterminalReceipts);
    assert.ok(checkpoint.pair.checkpoint, 'receipt commitment precedes successful cleanup');

    const finalAudit = operate('terminal:final-audit', 'audit-run', {
      audit: { input: retainedInput },
    }, 'accepted', 'run-audited');
    assert.equal(finalAudit.product.kind, 'run-audit');
    await measure('terminal:final-audit', lastRuntime.value.inspection);
    assertTerminalStages([
      ['terminal:audit', false],
      ['terminal:lane-permit', false],
      ['terminal:apply-preflight', false],
      ['terminal:lane-applied', true],
      ['terminal:receipt-committed', true],
      ['terminal:final-audit', true],
    ]);
    assert.deepEqual(finalAudit.session.acceptedState, expectedTerminalState);
    assert.deepEqual(operationTrace.slice(-5).map(row => [
      row.operation, row.reason, row.after.acceptedRevision, row.after.hostRevision,
    ]), [
      ['audit-run', 'run-audited', 5, 38],
      ['authorize-lane-effect', 'lane-permit-issued', 5, 40],
      ['apply-lane-effect', 'lane-mutation-applied', 5, 42],
      ['commit-lane-receipt', 'lane-receipt-committed', 6, 44],
      ['audit-run', 'run-audited', 6, 46],
    ]);
    const beforeEnd = adapter.snapshot();
    const ended = adapter.end('task-settled');
    validateHostAdapterResult(ended);
    assert.equal(ended.outcome, 'ended');
    assert.equal(ended.reason, 'task-settled');
    assert.equal(ended.session.acceptedRevision, 6);
    assert.equal(ended.session.hostRevision, beforeEnd.hostRevision + 1);
    assert.deepEqual(ended.session.acceptedState, expectedTerminalState);
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
    assert.equal(checkpoint.calls.filter(call => call === 'clear').length, 1);
    assert.equal(t003ParsedTargetTask(root, target).glyph, 'x');
    assert.equal(t003SnapshotGlyph(root, target), 'x');
    assert.deepEqual(t003FileIdentities(root, reference), appliedFiles);

    context.diagnostic(canonicalJson({
      feature064T003TerminalSettlement: {
        classification: 'synthetic-fixture-results-not-user-judgment-or-real-062-continuation',
        reference: contentDescriptor(referenceBytes),
        fixture: readRetentionEpisodeFixture().descriptor,
        productionFormat: 'dude-work-model-view-v1',
        productionOrder: 'lane-first',
        supervisorAdmissions: admissions,
        stages,
        operationTrace,
        runtimeCalls,
        priorReceipts: receipts,
        terminalPermit: permit,
        terminalReceipt,
        terminalPoststate: appliedFiles,
        acceptedState: {
          beforeTerminalReceiptHash: beforeCommit.acceptedStateHash,
          afterTerminalReceiptHash: committed.session.acceptedStateHash,
          acceptedRevision: committed.session.acceptedRevision,
          hostRevisionBeforeEnd: beforeEnd.hostRevision,
          hostRevisionAfterEnd: ended.session.hostRevision,
          overallUsed: ended.session.acceptedState.overallUsed,
          recoveryUsed: ended.session.acceptedState.recoveryUsed,
          pending: ended.session.acceptedState.pending,
          completed: ended.session.acceptedState.completed,
          governancePresentAfterCompletion: true,
          governancePresentAfterLaneApply: true,
          governancePresentAfterTerminalReceipt: false,
        },
        lastResultRetentionCycle: 5,
        naturalSettlement: {
          outcome: ended.outcome,
          reason: ended.reason,
          target,
          taskGlyph: t003ParsedTargetTask(root, target).glyph,
          snapshotGlyph: t003SnapshotGlyph(root, target),
          checkpointCleared: checkpoint.pair.checkpoint === null,
        },
        modelByteCeilingReached: false,
        futureSameTaskContinuationClaimed: false,
        actual062Operations: 0,
      },
    }));
  });
}

nodeTest('Feature 064 T003: full reference reaches natural settlement through the terminal receipt', async (context) => {
  await runT003FullReferenceCase(context, 'terminal-settlement');
});

nodeTest('Feature 064 T003: a misbound full-reference terminal receipt preserves governed authority', async (context) => {
  await runT003FullReferenceCase(context, 'terminal-receipt-misbound');
});

nodeTest('Feature 064 T003: premature ordinal-6 authorization remains a separate governance negative', async (context) => {
  await runT003FullReferenceCase(context, 'premature-attempt');
});

nodeTest('Feature 064 T003: the production runner cannot settle after a misbound terminal receipt', async (context) => {
  await withSealedWorkspace(async (root) => {
    writeSealedTaskState(root);
    const checkpoint = memoryCheckpointStore();
    const laneCalls = [];
    let genuineTerminalReceipt = null;
    let suppliedTerminalReceipt = null;
    const runnerRequest = focusedRunnerRequest(root);
    const result = await runHostAdapter(runnerRequest, {
      checkpoint: checkpoint.port,
      laneOwner: {
        identity: sha256('Feature 064 T003 misbound terminal receipt port'),
        apply(request) {
          const applied = applyLightweightWorkRequest(request);
          laneCalls.push({ request: clone(request), applied: clone(applied) });
          if (request.operation !== 'work-set' || applied.ok !== true) return applied;
          genuineTerminalReceipt = clone(applied.receipt);
          const { receiptHash: _receiptHash, ...receiptBody } = applied.receipt;
          const misboundBody = {
            ...receiptBody,
            permitHash: sha256('Feature 064 T003 structurally valid misbound terminal receipt'),
          };
          suppliedTerminalReceipt = {
            ...misboundBody,
            receiptHash: sha256(canonicalJson(misboundBody)),
          };
          return {
            ...applied,
            receipt: suppliedTerminalReceipt,
          };
        },
      },
    });

    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'lane-receipt-binding-mismatch');
    assert.ok(genuineTerminalReceipt, 'the real lane mutation produced its genuine receipt first');
    assert.deepEqual(laneCalls.map(({ request }) => [request.operation, request.mutation.kind]), [
      ['work-project', 'append-event'],
      ['work-set', 'task-completed'],
    ]);
    assert.equal(t003ParsedTargetTask(root, TARGET).glyph, 'x');
    assert.equal(t003ParsedTargetTask(root, TARGET).blockedBy, null);
    assert.equal(t003SnapshotGlyph(root, TARGET), 'x');
    assert.equal(result.steps.some(step => step.step === 'commit-lane-receipt'), false);
    assert.equal(result.steps.some(step => step.step === 'end' || step.reason === 'task-settled'), false);
    assert.equal(result.steps.at(-1).step, 'apply-lane-effect');
    assert.equal(result.steps.at(-1).reason, 'lane-receipt-binding-mismatch');
    assert.ok(suppliedTerminalReceipt, 'the test-owned lane port supplied its misbound receipt');
    const { receiptHash: suppliedHash, ...suppliedBody } = suppliedTerminalReceipt;
    assert.equal(suppliedHash, sha256(canonicalJson(suppliedBody)));
    assert.deepEqual(Object.keys(suppliedTerminalReceipt).sort(), Object.keys(genuineTerminalReceipt).sort());
    assert.deepEqual(
      Object.fromEntries(Object.entries(suppliedBody).filter(([field]) => field !== 'permitHash')),
      Object.fromEntries(Object.entries(genuineTerminalReceipt).filter(
        ([field]) => field !== 'receiptHash' && field !== 'permitHash',
      )),
    );
    assert.equal(genuineTerminalReceipt.permitHash, laneCalls.at(-1).request.permit.permitHash);
    assert.notEqual(suppliedTerminalReceipt.permitHash, laneCalls.at(-1).request.permit.permitHash);
    const accepted = focusedRunnerAcceptedState(result);
    assert.deepEqual(accepted.pending, []);
    assert.equal(accepted.completed.length, 1);
    assert.ok(checkpoint.pair.checkpoint, 'receipt rejection keeps the runner claim for hard-stop handling');
    assert.equal(checkpoint.calls.includes('clear'), false);
    const activeCheckpoint = clone(checkpoint.pair.checkpoint);
    const cleared = checkpoint.port.clear({
      version: 1,
      workspaceIdentity: sha256(canonicalJson({ version: 1, root: fs.realpathSync(root) })),
      target: clone(TARGET),
      ownerIdentity: sha256(canonicalJson({ version: 1, owner: runnerRequest.owner })),
    }, {
      invocationIdentity: activeCheckpoint.invocationIdentity,
      workerToken: activeCheckpoint.workerToken,
      workerGeneration: activeCheckpoint.workerGeneration,
    }, {
      claimHash: checkpoint.pair.claim.claimHash,
      recordHash: activeCheckpoint.recordHash,
      acceptedRevision: activeCheckpoint.acceptedRevision,
      hostRevision: activeCheckpoint.hostRevision,
    }, 'hard-stop-recorded');
    assert.equal(cleared.status, 'cleared');
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
    context.diagnostic(canonicalJson({
      feature064T003RunnerMisboundTerminalReceipt: {
        outcome: result.outcome,
        reason: result.reason,
        steps: result.steps.map(step => ({
          step: step.step,
          outcome: step.outcome,
          reason: step.reason,
        })),
        haltReport: result.haltReport,
        appliedPoststate: {
          taskGlyph: t003ParsedTargetTask(root, TARGET).glyph,
          snapshotGlyph: t003SnapshotGlyph(root, TARGET),
        },
        acceptedState: accepted,
        terminalPermit: laneCalls.at(-1).request.permit,
        genuineTerminalReceipt,
        suppliedTerminalReceipt,
        checkpointBeforeCleanup: {
          hostRevision: activeCheckpoint.hostRevision,
          acceptedRevision: activeCheckpoint.acceptedRevision,
          inFlight: activeCheckpoint.inFlight,
        },
        terminalReceiptCommitted: false,
        taskSettledClaimed: false,
        fixtureCleanup: {
          operation: 'test-owned-checkpoint-clear',
          reason: 'hard-stop-recorded',
        },
        actual062Operations: 0,
      },
    }));
  });
});

/**
 * Each refusal starts with a separate complete, freshly owned failed episode.
 * @param {import('node:test').TestContext} context
 * @param {'review-learning'|'resume-learning'} continuationAction
 */
async function runFeature065FailedEpisode(context, continuationAction) {
  await withHistoryIncidentWorkspace(async ({
    root, reference, referenceBytes, input: initialInput, filePreimages,
  }) => {
    const target = canonicalTarget(initialInput.target);
    const historicalRecords = currentRunRecords(initialInput);
    const historicalEvents = t003CurrentEvents(initialInput);
    const historicalLane = t003LaneEvents(root, target);
    const priorReview = historicalEvents.filter(event => event.type === 'learning-review').at(-1);
    assert.ok(priorReview);
    assert.deepEqual(historicalLane.target, historicalEvents);
    assert.equal(historicalRecords.length, 14);
    assert.deepEqual(t003CheckSummary(initialInput), { total: 54, passed: 28, failed: 26 });

    // Recreate the governed attempt through fresh owner operations. The archive's
    // preflight RunState, worker, and provisional completion are never admitted.
    const initialState = t003HistoricalState(target, historicalEvents);
    initialState.policy.overall = 6;
    initialState.policy.recovery = 5;
    const initialBinding = t003LaneBinding(root, reference, target);
    assert.deepEqual(initialBinding.lanePrestate, reference.preflight.laneBinding.lanePrestate);
    assert.deepEqual(initialBinding.targetMapping, reference.preflight.laneBinding.targetMapping);
    const checkpoint = memoryCheckpointStore();
    const supervisor = sealedSupervisorSession({ identity: randomBytes(32).toString('hex') });
    let input = clone(initialInput);
    let lastRuntime = null;
    let producedStreams = null;
    const stages = [];
    const operations = [];
    const receipts = [];
    const writerPostimages = [];
    const runtimeErrors = [];
    let fullOwner;
    const adapter = createAuthorizedHostAdapter({
      state: initialState,
      target,
      inspectionIdentity: sha256('Feature 065 fresh fixture-owned admission'),
      workspace: t003CheckpointWorkspace(root, target, initialBinding),
    }, {
      supervisorSession: supervisor,
      noEffectAuthority: sealedNoEffectAuthority(),
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('Feature 065 unchanged runtime observer'),
        invoke(command, request) {
          let value;
          try {
            value = runCommand(command, request);
          } catch (error) {
            runtimeErrors.push({ command, mode: request.mode ?? null, message: error.message });
            throw error;
          }
          lastRuntime = { command, mode: request.mode ?? null, value };
          if (command === 'complete' && request.mode === 'capture') {
            producedStreams = clone(request.input);
          }
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('Feature 065 fresh disposable lane owner'),
        apply(request) {
          assert.equal(request.root, root);
          const mutation = request.mutation;
          const predicted = buildLightweightWorkPostimages({
            tasks: Buffer.from(request.expected.tasks.base64, 'base64'),
            owner: Buffer.from(request.owner.ownerCapture.base64, 'base64'),
            taskState: Buffer.from(request.expected.taskState.base64, 'base64'),
            tasksPath: request.expected.tasksPath,
            taskKey: target.taskKey,
            kind: mutation.kind,
            toGlyph: mutation.toGlyph,
            blocker: mutation.blocker,
            eventLines: mutation.eventLines.lines.map(line => line.exactLine),
            ownerLogLines: [],
            snapshotUpdatedAt: mutation.snapshotUpdatedAt,
          });
          assert.ok(!('reason' in predicted));
          const result = applyLightweightWorkRequest(request);
          assert.equal(result.ok, true, canonicalJson(result));
          const hashes = {};
          for (const [surface, relative] of [
            ['tasks', request.expected.tasksPath],
            ['taskState', request.expected.taskStatePath],
            ['owner', request.owner.ideaPath],
          ]) {
            const actual = fs.readFileSync(path.join(root, relative));
            assert.deepEqual(actual, predicted[surface], `${surface}: predictor equals real writer`);
            hashes[surface] = contentDescriptor(actual);
          }
          writerPostimages.push({ eventHash: request.permit.eventHash, hashes });
          return result;
        },
      },
    });
    for (const identity of [
      adapter.snapshot().invocationIdentity, adapter.snapshot().workerToken, supervisor.identity,
    ]) assert.equal(canonicalJson(reference).includes(identity), false);

    const operate = (label, operation, payload, expectedOutcome, expectedReason) => {
      const before = adapter.snapshot();
      const files = t003FileIdentities(root, reference);
      const result = adapter.run(sealedRequest(adapter, operation, payload));
      validateHostAdapterResult(result);
      assert.deepEqual(result.session, adapter.snapshot());
      assert.equal(result.session.hostRevision, before.hostRevision + 2);
      assert.equal(result.session.acceptedRevision, before.acceptedRevision
        + Number(result.session.acceptedStateHash !== before.acceptedStateHash));
      if (result.outcome !== 'accepted' || operation === 'fresh-inspection') {
        assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before), label);
      }
      if (operation !== 'apply-lane-effect') {
        assert.deepEqual(t003FileIdentities(root, reference), files);
      }
      operations.push({
        label, operation, outcome: result.outcome, reason: result.reason,
        beforeStateHash: before.acceptedStateHash,
        afterStateHash: result.session.acceptedStateHash,
        acceptedRevision: result.session.acceptedRevision,
        overallUsed: result.session.acceptedState.overallUsed,
        governancePhase: result.session.acceptedState.learningGovernance?.phase ?? null,
        pendingPurpose: result.session.pendingEffect?.projectionBatch.purpose ?? null,
      });
      if (expectedOutcome !== undefined) {
        assert.equal(result.outcome, expectedOutcome, `${label}: ${result.reason}`);
        assert.equal(result.reason, expectedReason, label);
      }
      return result;
    };
    const measure = async (label, inspection = runCommand('inspect', {
      trigger: 'explicit-inspection', input,
    }).inspection) => {
      const row = await t003StageMeasurement({ label, root, reference, input, inspection });
      const literal = await renderPrivateModelProjection(target, inspection.items, { literalHistory: true });
      row.sameProjectionLiteralBytes = Buffer.byteLength(canonicalJson(literal));
      row.netBytes = row.sameProjectionLiteralBytes - row.canonicalBytes;
      row.ownerEvents.omitted = row.ownerEvents.total - row.ownerEvents.included;
      assert.deepEqual(expandModelPacket(literal), originalAvailableProjection(inspection));
      const ownerItem = inspection.items.find(item => item.source === 'owner-log');
      const owner = JSON.parse(ownerItem.text);
      if (!fullOwner) {
        assert.equal(owner.includedEventCount, owner.totalEventCount);
        fullOwner = owner;
      }
      assert.equal(owner.fullLogSha256, fullOwner.fullLogSha256);
      assert.equal(owner.fullLogByteLength, fullOwner.fullLogByteLength);
      assert.deepEqual(owner.events, fullOwner.events.slice(-owner.includedEventCount));
      if (owner.includedEventCount < owner.totalEventCount) {
        const largerText = canonicalJson({
          ...owner,
          events: fullOwner.events.slice(-(owner.includedEventCount + 1)),
          includedEventCount: owner.includedEventCount + 1,
          omittedEventCount: owner.omittedEventCount - 1,
          firstIncludedEventOrdinal: owner.firstIncludedEventOrdinal - 1,
        });
        const larger = await renderPrivateModelProjection(target, inspection.items.map(item => (
          item === ownerItem ? { ...item, text: largerText, ...contentDescriptor(largerText) } : item
        )));
        row.nextOwnerSuffixBytes = Buffer.byteLength(canonicalJson(larger));
        assert.ok(row.nextOwnerSuffixBytes > 131_072, `${label}: actual owner suffix is maximal`);
      }
      assert.equal(row.capacityAdmissible, true, label);
      assert.ok(row.canonicalBytes <= 131_072 && row.netBytes > 0, label);
      assert.ok(row.physicalItems <= row.logicalOccurrences && row.logicalOccurrences <= row.originalDescriptors);
      assert.ok(row.rawSourceEntries <= 64 && row.originalDescriptors <= 64);
      assert.ok(row.mandatoryHeadroom.requiredSources <= 64
        && row.mandatoryHeadroom.requiredDescriptors <= 64);
      assert.ok(row.maximumSourceBodyBytes <= 1_048_576);
      assert.ok(row.aggregateDecodedBytes <= 4_194_304 && row.requestBytes <= 6_291_456);
      assert.deepEqual(currentRunRecords(input).slice(0, historicalRecords.length), historicalRecords);
      assert.deepEqual(t003LaneEvents(root, target).global.slice(0, historicalLane.global.length), historicalLane.global);
      for (const field of ['verification', 'review', 'lint']) {
        assert.deepEqual(input[field].slice(0, initialInput[field].length), initialInput[field],
          `${label}: every original failed and contradictory capture remains exact`);
      }
      row.captureCounts = Object.fromEntries(['currentRun', 'verification', 'review', 'lint']
        .map(field => [field, input[field].length]));
      assert.deepEqual(t003CheckSummary(initialInput), { total: 54, passed: 28, failed: 26 });
      for (const [relative, bytes] of filePreimages) {
        if (relative === initialBinding.targetMapping.tasksPath || relative === '.dude/state/task-state.json') continue;
        assert.deepEqual(fs.readFileSync(path.join(root, relative)), bytes, relative);
      }
      stages.push(row);
      return inspection;
    };
    const project = async label => {
      const effect = adapter.snapshot().pendingEffect;
      const batch = effect.projectionBatch;
      for (const [index, event] of batch.events.entries()) {
        const binding = t003LaneBinding(root, reference, target);
        const laneBinding = {
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
          operationTime: '2026-09-18T18:00:00Z',
        };
        const prediction = await measurePrivatePreflight({
          state: effect.provisionalState, input, batch, laneBinding,
        });
        assert.equal(prediction.capacity, null, `${label}: known postimages fit`);
        const prepared = operate(`${label}:prepare:${index}`, 'prepare-authoritative-projection', {
          projection: { input, laneBinding },
        }, 'effect-required', 'projection-prepared');
        assert.deepEqual(prepared.product.plan, prediction.result.transition.plan);
        await measure(`${label}:prepare:${index}`, lastRuntime.value.inspection);
        const item = prepared.product.plan.items[index];
        assert.equal(item.eventHash, event.eventHash);
        const beforePublish = canonicalJson(input);
        const applied = operate(`${label}:lane-first:${index}`, 'apply-lane-effect', {
          laneApplication: { ...binding.application, permit: item.projectionPermit, mutation: item.mutation },
        }, 'effect-required', 'lane-projection-applied');
        assert.equal(canonicalJson(input), beforePublish, 'publication follows the actual lane write');
        const laneInspection = await measure(`${label}:lane-first:${index}`);
        assert.deepEqual(laneInspection, prediction.measurements[1].inspection);
        assert.equal(stages.at(-1).surfaces.equal, false);
        input = publishCurrentRun(input, item.currentRunRecord);
        const bothInspection = await measure(`${label}:both-surfaces:${index}`);
        assert.deepEqual(bothInspection, prediction.measurements[2].inspection);
        assert.equal(stages.at(-1).surfaces.equal, true);
        operate(`${label}:receipt:${index}`, 'commit-lane-receipt', {
          laneReceipt: { input, permit: item.projectionPermit, receipt: applied.product.receipt },
        }, 'effect-required', 'lane-receipt-committed');
        await measure(`${label}:receipt:${index}`, lastRuntime.value.inspection);
        receipts.push(clone(applied.product.receipt));
      }
    };

    let continuation = null;
    let refusalProof = null;
    let cleanup = null;
    try {
      operate('acquire', 'fresh-inspection', { input }, 'accepted', 'inspection-refreshed');
      await measure('complete-incident', lastRuntime.value.inspection);
      assert.equal(stages[0].canonicalBytes, 121_590);
      operate('derive-governance', 'advance-governance', {
        governance: { action: 'resume-learning', input },
      }, 'accepted', 'governance-resumed');
      await measure('governance-required', lastRuntime.value.inspection);
      const finding = {
        version: 1,
        statement: 'Synthetic fixture learning for the retained failed result; not real 062 browser acceptance.',
        evidenceIdentities: [sha256('Feature 065 synthetic learning provider')],
        assumptionIdentities: [],
      };
      const review = {
        version: 2, target, assumptionIdentities: [],
        findings: [{ ...finding, findingIdentity: sha256(canonicalJson(finding)) }],
        alternatives: clone(priorReview.alternatives),
        outcome: 'selected-alternative',
        selectedAlternativeIdentity: priorReview.selectedAlternativeIdentity,
      };
      operate('review-before-failed-counterpart', 'advance-governance', {
        governance: { action: 'review-learning', input, review },
      }, 'effect-required', 'learning-reviewed');
      await measure('learning-reviewed', lastRuntime.value.inspection);
      assert.deepEqual(adapter.snapshot().pendingEffect.projectionBatch.events.map(event => event.type),
        ['learning-review', 'learning-governance']);
      await project('initial-learning');
      operate('settle-initial-learning', 'settle-effect', { input }, 'accepted', 'projection-verified');
      await measure('learning-projected', lastRuntime.value.inspection);
      assert.equal(receipts.length, 2);
      assert.equal(adapter.snapshot().acceptedState.learningGovernance.phase, 'projected');
      operate('post-learning-acquire', 'fresh-inspection', { input }, 'accepted', 'inspection-refreshed');
      await measure('post-learning-acquire', lastRuntime.value.inspection);
      operate('bind-alternative', 'advance-governance', {
        governance: { action: 'bind-alternative', input },
      }, 'accepted', 'post-learning-inspection-bound');
      const inspection = await measure('alternative-inspected', lastRuntime.value.inspection);
      const episode = clone(readRetentionEpisodeFixture().value);
      const binding = t003LaneBinding(root, reference, target);
      const authorized = operate('authorize-failed-counterpart', 'authorize-attempt', {
        authorization: {
          input,
          assessment: {
            evidenceHash: inspection.evidenceHash, intent: 'unchanged',
            action: episode.payload.approachBasis.action,
            materialInputs: clone(episode.payload.approachBasis.materialInputs),
            equivalence: 'distinct', retention: 'transient',
            summary: 'Synthetic counterpart of the incident failed result, preserving every old assertion.',
          },
          permit: { lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping },
        },
      }, 'accepted', 'authorized');
      await measure('alternative-authorized', lastRuntime.value.inspection);
      assert.equal(authorized.session.acceptedState.learningGovernance.phase, 'alternative-authorized');
      assert.equal(authorized.session.acceptedState.pending[0].action, 'address-test');
      assert.deepEqual(authorized.session.acceptedState.pending[0].materialInputs.checks, ['lint', 'verification']);
      const historicalVerification = normalizeVerificationEnvelopeV2(t003TrustedCapture(input.verification.at(-1)));
      const historicalReview = normalizeIndependentReviewEnvelopeV2(
        t003TrustedCapture(input.review.at(-1)), historicalVerification,
      );
      episode.payload.specialistResult = {
        outcome: 'failed',
        operations: ['address-test'],
        changedTargets: [],
        verification: { checks: historicalVerification.checks.map(check => ({
          definition: `Synthetic counterpart of captured definition ${check.definitionIdentity}`,
          outcome: check.outcome,
          evidence: `Synthetic reassertion of retained evidence ${check.evidenceIdentity}`,
        })) },
        review: {
          verdict: historicalReview.verdict,
          findings: historicalReview.findings.map(row => ({
            basis: {
              expectation: {
                kind: row.basis.expectation.kind,
                reference: `Synthetic counterpart of retained expectation ${row.basis.expectation.identity}`,
              },
              subjects: clone(row.basis.subjects),
              failureClass: row.basis.failureClass,
              checkDefinition: `Synthetic counterpart of captured definition ${row.basis.checkDefinitionIdentity}`,
            },
            observation: {
              kind: 'observed-evidence',
              evidence: `Synthetic reassertion of retained observation ${row.observation.identity}`,
            },
          })),
        },
      };
      const pair = buildRetentionPair({
        target, episode, ordinal: authorized.session.acceptedState.overallUsed,
        authorizationEvidenceHash: authorized.session.acceptedState.pending[0].evidenceHash,
      });
      assert.equal(pair.semanticResult.outcome, 'failed');
      assert.equal(pair.review.verdict, 'rejected');
      assert.deepEqual(pair.verification.checks.map(check => check.outcome).sort(),
        ['failed', 'failed', 'failed', 'passed']);
      assert.equal(pair.review.verificationEnvelopeIdentity, pair.verification.envelopeIdentity);
      assert.equal(pair.verification.inspectedEvidenceHash, inspection.evidenceHash);
      assert.equal(pair.verification.attemptIdentity,
        authorized.session.acceptedState.learningGovernance.authorizedAttemptIdentity);
      for (const field of ['verification', 'review', 'lint']) {
        assert.equal(input[field].some(stream => canonicalJson(stream) === canonicalJson(pair.streams[field])), false,
          `${field}: genuinely new bound capture, not reinspection`);
        assert.equal(pair.streams[field].state, field === 'review' ? 'rejected' : 'failed');
      }
      const recordInput = clone(input);
      // This owner accepts semantic results, not caller-selected trusted streams.
      // Keep the full retained input and append its actual returned captures below.
      delete recordInput.verification;
      delete recordInput.review;
      delete recordInput.lint;
      operate('capture-failed-counterpart', 'record-attempt-result', {
        attemptResult: { input: recordInput, result: pair.semanticResult },
      }, 'effect-required', 'occurrence-retention-required');
      assert.ok(producedStreams);
      for (const field of ['verification', 'review', 'lint']) {
        assert.deepEqual(producedStreams[field], [pair.streams[field]]);
      }
      input = appendRetentionPair(input, pair);
      await measure('failed-result-captures');
      const grown = stages.at(-1);
      assert.equal(grown.rawSourceEntries, stages[0].rawSourceEntries + 3);
      assert.equal(grown.originalDescriptors, stages[0].originalDescriptors + 3);
      assert.ok(grown.aggregateDecodedBytes > stages[0].aggregateDecodedBytes);
      assert.deepEqual(adapter.snapshot().pendingEffect.projectionBatch.events.map(event => event.type),
        ['approach-occurrence', 'finding-occurrence']);
      await project('failed-result');
      operate('settle-failed-result', 'settle-effect', { input }, 'accepted', 'verification-failed');
      await measure('failed-result-settled', lastRuntime.value.inspection);
      assert.equal(lastRuntime.value.completion.finalized, true);
      assert.equal(lastRuntime.value.completion.completed, false);
      assert.equal(adapter.snapshot().pendingEffect, null);
      assert.deepEqual(adapter.snapshot().acceptedState.pending, []);
      assert.equal(adapter.snapshot().acceptedState.learningGovernance.phase, 'alternative-authorized');
      assert.equal(adapter.snapshot().acceptedState.overallUsed, 5);
      assert.equal(adapter.snapshot().acceptedState.recoveryUsed[0].count, 4);
      assert.deepEqual(t003CheckSummary(input), { total: 58, passed: 29, failed: 29 });
      assert.equal(receipts.length, 4);
      assert.equal(new Set(receipts.map(receipt => receipt.receiptHash)).size, 4);
      assert.equal(writerPostimages.length, 4);
      assert.deepEqual(t003CurrentEvents(input).slice(historicalEvents.length).map(event => event.type),
        ['learning-review', 'learning-governance', 'approach-occurrence', 'finding-occurrence']);
      assert.equal(t003CurrentEvents(input).at(-2).occurrence.disposition, 'verification-failed');
      assert.deepEqual(t003CurrentEvents(input), t003LaneEvents(root, target).target);
      assert.equal(stages.at(-1).canonicalBytes, 129_356);
      assert.equal(stages.at(-1).sameProjectionLiteralBytes, 169_973);

      operate('sealed-acquire', 'fresh-inspection', { input }, 'accepted', 'inspection-refreshed');
      await measure('sealed-acquire', lastRuntime.value.inspection);
      const beforeRefusal = adapter.snapshot();
      const beforeFiles = t003FileIdentities(root, reference);
      const beforeInput = canonicalJson(input);
      const beforeReceipts = canonicalJson(receipts);
      const expectedReason = continuationAction === 'review-learning'
        ? 'learning-phase-mismatch' : 'governance-unresolved';
      continuation = operate('sealed-continuation', 'advance-governance', {
        governance: {
          action: continuationAction, input,
          ...(continuationAction === 'review-learning' ? { review } : {}),
        },
      }, 'hard-stop', expectedReason);
      const returned = continuationAction === 'review-learning'
        ? lastRuntime.value.learning : lastRuntime.value.transition;
      assert.equal(returned[continuationAction === 'review-learning' ? 'reviewed' : 'resumed'], false);
      assert.equal(returned.reason, expectedReason);
      assert.deepEqual(returned.state, beforeRefusal.acceptedState);
      assert.equal(continuation.session.acceptedStateBytes, beforeRefusal.acceptedStateBytes);
      assert.deepEqual(acceptedAuthorityTuple(continuation.session), acceptedAuthorityTuple(beforeRefusal));
      assert.deepEqual(continuation.session.pendingEffect, beforeRefusal.pendingEffect);
      assert.equal(continuation.session.acceptedState.learningGovernance.phase, 'alternative-authorized');
      assert.equal(canonicalJson(input), beforeInput);
      assert.equal(canonicalJson(receipts), beforeReceipts);
      assert.deepEqual(t003FileIdentities(root, reference), beforeFiles);
      assert.equal(Object.hasOwn(continuation, 'capacity'), false, 'a governance refusal, not a capacity failure');
      assert.deepEqual(lastRuntime.value.inspection.blockers, []);
      // Observe the returned packet only. No adapter/runtime operation follows
      // the hard stop; only its independently allowed fixture cleanup remains.
      await measure('sealed-continuation-refused', lastRuntime.value.inspection);
      refusalProof = {
        action: continuationAction,
        runtimeCommand: lastRuntime.command,
        runtimeMode: lastRuntime.mode,
        returned: clone(returned),
        acceptedStateBytes: contentDescriptor(beforeRefusal.acceptedStateBytes),
        acceptedStateUnchanged: true,
        input: contentDescriptor(beforeInput),
        receipts: contentDescriptor(beforeReceipts),
        files: beforeFiles,
        counters: {
          overallUsed: beforeRefusal.acceptedState.overallUsed,
          recoveryUsed: clone(beforeRefusal.acceptedState.recoveryUsed),
        },
      };
      assert.equal(refusalProof.acceptedStateBytes.byteLength, 3_649);
      assert.deepEqual(runtimeErrors, []);
      assert.equal(t003ParsedTargetTask(root, target).glyph, '~');
      assert.equal(t003SnapshotGlyph(root, target), '~');
    } finally {
      cleanup = adapter.end('hard-stop-recorded');
      context.diagnostic(canonicalJson({
        feature065T002FailedPath: {
          classification: 'synthetic-fixture-results-not-real-062-browser-acceptance',
          continuationAction,
          incident: contentDescriptor(referenceBytes),
          stages, operations, receipts, writerPostimages, runtimeErrors,
          refusalProof,
          continuation: continuation && {
            outcome: continuation.outcome, reason: continuation.reason,
            acceptedState: continuation.session.acceptedState,
            pendingEffect: continuation.session.pendingEffect,
          },
          fixtureCleanup: cleanup.reason,
          taskGlyph: t003ParsedTargetTask(root, target).glyph,
          snapshotGlyph: t003SnapshotGlyph(root, target),
          taskSettled: false,
          checkpointCleared: checkpoint.pair.checkpoint === null,
          actual062Operations: 0,
        },
      }));
    }
    assert.equal(continuation?.outcome, 'hard-stop');
    assert.equal(cleanup.outcome, 'ended');
    assert.equal(cleanup.reason, 'hard-stop-recorded');
    assert.equal(cleanup.session.acceptedStateBytes, continuation.session.acceptedStateBytes);
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
    assert.equal(operations.at(-1).label, 'sealed-continuation');
    assert.deepEqual(t003FileIdentities(root, reference), refusalProof.files);
    assert.equal(t003ParsedTargetTask(root, target).glyph, '~');
    assert.equal(t003SnapshotGlyph(root, target), '~');
  });
}

nodeTest('Feature 065 T002 SC003: complete failed episode refuses direct re-review without changing the sealed successor', async context => {
  await runFeature065FailedEpisode(context, 'review-learning');
});

nodeTest('Feature 065 T002 SC003: separate complete failed episode refuses supported resume without changing the sealed successor', async context => {
  await runFeature065FailedEpisode(context, 'resume-learning');
});

/**
 * Fresh admissions share only this disposable lane and the captures actually
 * produced by the adapter. No archived RunState or runner preload is involved.
 * @param {string} root
 */
function crossInvocationFixture(root) {
  writeSealedTaskState(root);
  let input = sealedTransportInput(sealedInspectionInput(root, {
    policyMode: 'autonomous',
    currentRun: [sealedCapture(TARGET, 'failed', [])],
  }));
  let adapter;
  let runtimeResult;
  let produced;
  const admissions = [];
  const receipts = [];
  const operations = [];
  const originalOwner = fs.readFileSync(path.join(root, IDEA_PATH));

  const operate = (operation, payload, outcome, reason) => {
    const result = adapter.run(sealedRequest(adapter, operation, payload));
    validateHostAdapterResult(result);
    operations.push({ operation, outcome: result.outcome, reason: result.reason });
    assert.equal(result.outcome, outcome, `${operation}: ${result.reason}`);
    assert.equal(result.reason, reason, operation);
    assert.deepEqual(fs.readFileSync(path.join(root, IDEA_PATH)), originalOwner);
    return result;
  };
  const start = (state = emptyState('autonomous')) => {
    validateRunState(state);
    adapter = createHostAdapter(sealedInitial({ state: clone(state) }), {
      runtime: {
        identity: sha256('cross-invocation runtime observer'),
        invoke(command, request) {
          const value = runCommand(command, request);
          runtimeResult = value;
          if (command === 'complete' && request.mode === 'capture') produced = clone(request.input);
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('cross-invocation disposable lane owner'),
        apply(request) {
          assert.equal(request.root, root);
          const mutation = request.mutation;
          const predicted = buildLightweightWorkPostimages({
            tasks: Buffer.from(request.expected.tasks.base64, 'base64'),
            owner: Buffer.from(request.owner.ownerCapture.base64, 'base64'),
            taskState: Buffer.from(request.expected.taskState.base64, 'base64'),
            tasksPath: request.expected.tasksPath,
            taskKey: TARGET.taskKey,
            kind: mutation.kind,
            toGlyph: mutation.toGlyph,
            blocker: mutation.blocker,
            eventLines: mutation.eventLines.kind === 'append-exact'
              ? mutation.eventLines.lines.map(line => line.exactLine) : [],
            ownerLogLines: [],
            snapshotUpdatedAt: mutation.snapshotUpdatedAt,
          });
          assert.ok(!('reason' in predicted));
          const applied = applyLightweightWorkRequest(request);
          assert.equal(applied.ok, true, canonicalJson(applied));
          for (const [surface, relative] of [
            ['tasks', TASKS_PATH], ['taskState', TASK_STATE_PATH], ['owner', IDEA_PATH],
          ]) assert.deepEqual(fs.readFileSync(path.join(root, relative)), predicted[surface]);
          return applied;
        },
      },
    });
    const session = adapter.snapshot();
    assert.deepEqual(session.acceptedState, state);
    assert.equal(session.acceptedRevision, 0);
    for (const prior of admissions) {
      assert.notEqual(session.invocationIdentity, prior.invocationIdentity);
      assert.notEqual(session.authorities.supervisorAuthorityIdentity, prior.authorities.supervisorAuthorityIdentity);
    }
    admissions.push(session);
    return session;
  };
  const project = () => {
    const batch = clone(adapter.snapshot().pendingEffect.projectionBatch);
    for (const [index, event] of batch.events.entries()) {
      const binding = sealedLaneBinding(root);
      const prepared = operate('prepare-authoritative-projection', {
        projection: {
          input,
          laneBinding: {
            lanePrestate: binding.lanePrestate,
            targetMapping: binding.targetMapping,
            operationTime: LANE_MUTATION.snapshotUpdatedAt,
          },
        },
      }, 'effect-required', 'projection-prepared');
      const item = prepared.product.plan.items[index];
      assert.equal(item.eventHash, event.eventHash);
      const applied = operate('apply-lane-effect', {
        laneApplication: { ...binding.application, permit: item.projectionPermit, mutation: item.mutation },
      }, 'effect-required', 'lane-projection-applied');
      input = publishCurrentRun(input, item.currentRunRecord);
      operate('commit-lane-receipt', {
        laneReceipt: { input, permit: item.projectionPermit, receipt: applied.product.receipt },
      }, 'effect-required', 'lane-receipt-committed');
      receipts.push(clone(applied.product.receipt));
    }
    return batch.events;
  };
  const attempt = ({
    action = 'execute-task', material, label, verdict = 'rejected',
    failedCheck = false, repeat = false, reverseCurrentRun = false, findings,
  }) => {
    operate('fresh-inspection', { input }, 'accepted', 'inspection-refreshed');
    const binding = sealedLaneBinding(root);
    const assessment = {
      ...sealedAssessment(runtimeResult.inspection, 'Exercise fresh cross-invocation authority.'),
      action,
      materialInputs: {
        targets: [material],
        operations: [action],
        checks: [...requiredChecksForAction[action]],
      },
    };
    const authorized = operate('authorize-attempt', {
      authorization: {
        input, assessment,
        permit: { lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping },
      },
    }, 'accepted', 'authorized');
    const semantic = focusedSpecialistPair(assessment, label, verdict);
    if (findings) semantic.review.findings = findings(semantic.review.findings[0]);
    if (failedCheck) {
      semantic.outcome = 'failed';
      semantic.verification.checks[0].outcome = 'failed';
    }
    const retainedStreams = clone(input);
    const { verification, review, lint, ...recordInput } = input;
    produced = null;
    const captured = operate('record-attempt-result', {
      attemptResult: { input: recordInput, result: semantic },
    }, 'effect-required', 'occurrence-retention-required');
    assert.ok(produced);
    for (const field of ['verification', 'review', 'lint']) {
      input[field].push(...produced[field]);
      assert.deepEqual(input[field].slice(0, retainedStreams[field].length), retainedStreams[field]);
    }
    const events = project();
    const lane = t003LaneEvents(root, TARGET).target;
    assert.deepEqual(t003CurrentEvents(input), lane);
    if (reverseCurrentRun) {
      input.currentRun = sealedTransportInput({
        lane: { kind: 'lightweight' },
        currentRun: [sealedCapture(TARGET, 'failed', [...lane].reverse().map(event => ({ event })))],
      }).currentRun;
    }
    const settled = operate('settle-effect', { input }, repeat ? 'effect-required' : 'accepted',
      repeat ? 'learning-required' : failedCheck ? 'verification-failed'
        : verdict === 'rejected' ? 'review-rejected' : 'completed');
    assert.equal(runtimeResult.completion.finalized, true);
    assert.deepEqual(t003LaneEvents(root, TARGET).target, lane);
    return { authorized, captured, events, settled };
  };
  const close = () => {
    const binding = sealedLaneBinding(root);
    const issued = operate('authorize-lane-effect', {
      laneEffect: {
        input, mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping,
      },
    }, 'accepted', 'lane-permit-issued');
    const permit = issued.product.permit;
    const applied = operate('apply-lane-effect', {
      laneApplication: { ...binding.application, permit },
    }, 'accepted', 'lane-mutation-applied');
    operate('commit-lane-receipt', {
      laneReceipt: { input, permit, receipt: applied.product.receipt },
    }, 'accepted', 'lane-receipt-committed');
    receipts.push(clone(applied.product.receipt));
    const ended = adapter.end('task-settled');
    assert.equal(ended.outcome, 'ended');
    assert.equal(ended.reason, 'task-settled');
    assert.equal(t003ParsedTargetTask(root, TARGET).glyph, 'x');
    assert.equal(t003SnapshotGlyph(root, TARGET), 'x');
    return { permit, ended };
  };
  return {
    start, attempt, project, operate, close, admissions, receipts, operations,
    input: () => clone(input),
    snapshot: () => adapter.snapshot(),
    end: (reason = 'controlled-end') => {
      const ended = adapter.end(reason);
      assert.equal(ended.outcome, 'ended');
      assert.equal(ended.reason, reason);
      return ended;
    },
  };
}

nodeTest('cross-invocation occurrence identity: fresh budgets retain reused ordinals through receipts and settlement', () => {
  withSealedWorkspace(root => {
    const fixture = crossInvocationFixture(root);
    fixture.start();
    const oldFirst = fixture.attempt({ material: 'src/old-first.mjs', label: 'old-first', failedCheck: true });
    const oldSecond = fixture.attempt({ material: 'src/old-second.mjs', label: 'old-second', failedCheck: true });
    const oldEvents = t003LaneEvents(root, TARGET).target;
    const oldStreams = fixture.input();
    assert.equal(fixture.end().session.acceptedState.overallUsed, 2);
    fixture.start();
    const first = fixture.attempt({ material: 'src/new-first.mjs', label: 'new-first' });
    const second = fixture.attempt({
      action: 'address-review', material: 'src/new-second.mjs', label: 'new-second', verdict: 'accepted',
    });
    for (const [old, fresh, ordinal] of [[oldFirst, first, 1], [oldSecond, second, 2]]) {
      assert.equal(old.events[0].occurrence.chronology.attemptOrdinal, ordinal);
      assert.equal(fresh.events[0].occurrence.chronology.attemptOrdinal, ordinal);
      assert.notEqual(old.events[0].occurrence.attemptIdentity, fresh.events[0].occurrence.attemptIdentity);
      assert.notEqual(old.events[0].occurrenceIdentity, fresh.events[0].occurrenceIdentity);
      assert.notEqual(old.events[0].eventHash, fresh.events[0].eventHash);
    }
    assert.deepEqual(t003LaneEvents(root, TARGET).target.slice(0, oldEvents.length), oldEvents);
    for (const field of ['verification', 'review', 'lint']) {
      assert.deepEqual(fixture.input()[field].slice(0, oldStreams[field].length), oldStreams[field]);
    }
    const terminal = fixture.close();
    assert.equal(terminal.permit.attemptIdentity, second.events[0].occurrence.attemptIdentity);
    assert.equal(terminal.ended.session.acceptedState.overallUsed, 2);
    assert.equal(terminal.ended.session.acceptedState.recoveryUsed[0].count, 1);
    assert.equal(terminal.ended.session.acceptedState.completed.length, 2);
    assert.equal(fixture.receipts.length, 8);
    assert.equal(new Set(fixture.receipts.map(receipt => receipt.receiptHash)).size, 8);
  });
});

nodeTest('cross-invocation occurrence identity: an older accepted ordinal cannot mask the current completed tuple', () => {
  withSealedWorkspace(root => {
    const fixture = crossInvocationFixture(root);
    fixture.start();
    const old = fixture.attempt({ material: 'src/accepted.mjs', label: 'accepted', verdict: 'accepted' });
    fixture.end();
    fixture.start();
    const fresh = fixture.attempt({ material: 'src/accepted.mjs', label: 'accepted', verdict: 'accepted' });
    assert.equal(old.events[0].occurrence.chronology.attemptOrdinal, 1);
    assert.equal(fresh.events[0].occurrence.chronology.attemptOrdinal, 1);
    const terminal = fixture.close();
    assert.equal(terminal.permit.attemptIdentity, fresh.events[0].occurrence.attemptIdentity);
    assert.notEqual(terminal.permit.attemptIdentity, old.events[0].occurrence.attemptIdentity);
    assert.equal(terminal.ended.session.acceptedState.overallUsed, 1);
    assert.equal(terminal.ended.session.acceptedState.completed.length, 1);
  });
});

nodeTest('cross-invocation ordinary close: reordered old acceptance cannot mask a later failed lane attempt', () => {
  withSealedWorkspace(root => {
    const fixture = crossInvocationFixture(root);
    fixture.start();
    const older = fixture.attempt({
      material: 'src/older-accepted.mjs', label: 'older-accepted', verdict: 'accepted',
    });
    const acceptedSession = fixture.snapshot();
    const staleAcceptedState = clone(acceptedSession.acceptedState);
    const acceptedInput = fixture.input();
    const olderEvent = older.events[0];
    assert.equal(older.events.length, 1);
    assert.equal(olderEvent.occurrence.disposition, 'accepted');
    assert.equal(olderEvent.occurrence.chronology.attemptOrdinal, 1);
    assert.deepEqual(staleAcceptedState.pending, []);
    assert.equal(Object.hasOwn(staleAcceptedState, 'pendingCompletion'), false);
    assert.equal(Object.hasOwn(staleAcceptedState, 'learningGovernance'), false);
    assert.deepEqual(staleAcceptedState.completed, t003CompletedRows([olderEvent]));
    validateRunState(staleAcceptedState);

    // Establish a real accepted-only control before introducing the later
    // failure. Production permit issuance plus the ordinary lane builder
    // produce a receipt that the production commit API accepts in an exact
    // disposable copy. They become explicitly stale negative fixture data
    // below; they are not represented as a legitimate continuation.
    const controlBinding = sealedLaneBinding(root);
    const controlIssued = runCommand('transition', {
      mode: 'issue-lane-permit',
      state: staleAcceptedState,
      input: acceptedInput,
      mutation: clone(LANE_MUTATION),
      lanePrestate: controlBinding.lanePrestate,
      targetMapping: controlBinding.targetMapping,
    });
    assert.equal(controlIssued.transition.issued, true, controlIssued.transition.reason);
    assert.equal(controlIssued.transition.reason, 'lane-permit-issued');
    assert.deepEqual(controlIssued.inspection.blockers, []);
    const stalePermit = clone(controlIssued.transition.permit);
    /** @type {Record<string, unknown>|null} */
    let staleReceipt = null;
    withTemporaryRoot(receiptRoot => {
      for (const entry of fs.readdirSync(root)) {
        fs.cpSync(path.join(root, entry), path.join(receiptRoot, entry), { recursive: true });
      }
      const receiptBinding = sealedLaneBinding(receiptRoot);
      const controlInput = { ...clone(acceptedInput), root: fs.realpathSync(receiptRoot) };
      const applied = applyLightweightWorkRequest({
        version: 1,
        operation: 'work-set',
        ...receiptBinding.application,
        target: clone(TARGET),
        state: clone(staleAcceptedState),
        permit: clone(stalePermit),
        mutation: clone(LANE_MUTATION),
      });
      assert.equal(applied.ok, true, canonicalJson(applied));
      staleReceipt = clone(applied.receipt);
      const controlCommitted = runCommand('transition', {
        mode: 'commit-lane-receipt',
        state: staleAcceptedState,
        input: controlInput,
        permit: stalePermit,
        receipt: staleReceipt,
      });
      assert.equal(controlCommitted.transition.committed, true, controlCommitted.transition.reason);
      assert.equal(controlCommitted.transition.reason, 'lane-receipt-committed');
      assert.equal(controlCommitted.transition.terminalEvidenceIdentity, staleReceipt.receiptHash);
      assert.deepEqual(controlCommitted.transition.state, staleAcceptedState);
    });
    assert.ok(staleReceipt);
    fixture.end();

    // A separate invocation reuses ordinal 1 but fails after the accepted
    // event was already appended. Reversing only current-run delivery puts the
    // old accepted event last while authoritative lane history remains ordered.
    fixture.start();
    const later = fixture.attempt({
      material: 'src/later-failed.mjs',
      label: 'later-failed',
      verdict: 'accepted',
      failedCheck: true,
      reverseCurrentRun: true,
    });
    fixture.end();
    const laterEvent = later.events[0];
    const collisionInput = fixture.input();
    const laneEvents = t003LaneEvents(root, TARGET).target;
    const currentEvents = t003CurrentEvents(collisionInput);
    assert.equal(later.events.length, 1);
    assert.equal(laterEvent.occurrence.disposition, 'verification-failed');
    assert.equal(laterEvent.occurrence.chronology.attemptOrdinal, 1);
    assert.notEqual(laterEvent.occurrence.attemptIdentity, olderEvent.occurrence.attemptIdentity);
    assert.deepEqual(laneEvents.map(event => event.eventHash), [
      olderEvent.eventHash, laterEvent.eventHash,
    ]);
    assert.deepEqual(currentEvents.map(event => event.eventHash), [
      laterEvent.eventHash, olderEvent.eventHash,
    ]);
    assert.equal(new Set(laneEvents.map(event => event.eventHash)).size, 2);
    assert.deepEqual(
      currentEvents.map(event => event.eventHash).sort(),
      laneEvents.map(event => event.eventHash).sort(),
    );
    for (const laneEvent of laneEvents) {
      assert.deepEqual(
        currentEvents.find(event => event.eventHash === laneEvent.eventHash),
        laneEvent,
      );
    }
    assert.equal(deriveEarliestRepeatRelationshipV1(laneEvents), null);

    // Decode and normalize every trusted capture, then bind both approach
    // events back to the exact verification and review envelopes they name.
    const verificationEnvelopes = collisionInput.verification.map(entry => (
      normalizeVerificationEnvelopeV2(t003TrustedCapture(entry))
    ));
    const verifications = new Map(verificationEnvelopes.map(envelope => (
      [envelope.envelopeIdentity, envelope]
    )));
    const reviews = new Map(collisionInput.review.map((entry, index) => {
      const envelope = normalizeIndependentReviewEnvelopeV2(
        t003TrustedCapture(entry),
        verificationEnvelopes[index],
      );
      return [envelope.envelopeIdentity, envelope];
    }));
    assert.equal(verifications.size, 2);
    assert.equal(reviews.size, 2);
    for (const event of laneEvents) {
      const verification = verifications.get(event.verificationEnvelopeIdentity);
      const review = reviews.get(event.reviewEnvelopeIdentity);
      assert.ok(verification);
      assert.ok(review);
      assert.equal(verification.attemptIdentity, event.occurrence.attemptIdentity);
      assert.equal(verification.resultIdentity, event.occurrence.resultIdentity);
      assert.equal(verification.inspectedEvidenceHash, event.occurrence.authorizationEvidenceHash);
      assert.equal(review.attemptIdentity, event.occurrence.attemptIdentity);
      assert.equal(review.resultIdentity, event.occurrence.resultIdentity);
      assert.equal(review.verificationEnvelopeIdentity, verification.envelopeIdentity);
    }
    const collisionInspection = runCommand('inspect', {
      trigger: 'explicit-inspection',
      input: collisionInput,
    }).inspection;
    assert.equal(collisionInspection.overflow, false);
    assert.deepEqual(collisionInspection.blockers, []);
    assert.deepEqual(collisionInspection.target, canonicalTarget(TARGET));

    // The supplied state is deliberately the stale accepted-only state: its
    // sole completed tuple exactly matches the old accepted event. This is the
    // adversarial input that made current-run order unsafe, not a claimed
    // continuation after the later failed attempt.
    assert.equal(staleAcceptedState.overallUsed, 1);
    assert.deepEqual(staleAcceptedState.completed, t003CompletedRows([olderEvent]));
    assert.notDeepEqual(staleAcceptedState.completed, t003CompletedRows([laterEvent]));
    const filesBefore = laneSurfaceDigests(root);
    const inputBefore = canonicalJson(collisionInput);
    const historicalAuthority = acceptedAuthorityTuple(acceptedSession);

    fixture.start(staleAcceptedState);
    const authorityBefore = acceptedAuthorityTuple(fixture.snapshot());
    assert.equal(authorityBefore.acceptedStateBytes, historicalAuthority.acceptedStateBytes);
    assert.equal(authorityBefore.acceptedStateHash, historicalAuthority.acceptedStateHash);
    assert.equal(authorityBefore.overallUsed, historicalAuthority.overallUsed);
    assert.deepEqual(authorityBefore.recoveryUsed, historicalAuthority.recoveryUsed);
    assert.deepEqual(authorityBefore.completed, historicalAuthority.completed);
    const binding = sealedLaneBinding(root);
    const refusedIssue = fixture.operate('authorize-lane-effect', {
      laneEffect: {
        input: collisionInput,
        mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
      },
    }, 'hard-stop', 'governance-unresolved');
    assert.equal(Object.hasOwn(refusedIssue, 'product'), false);
    assert.deepEqual(acceptedAuthorityTuple(refusedIssue.session), authorityBefore);
    assert.equal(refusedIssue.session.acceptedState.overallUsed, 1);
    assert.deepEqual(refusedIssue.session.acceptedState.completed, t003CompletedRows([olderEvent]));
    assert.deepEqual(laneSurfaceDigests(root), filesBefore);
    assert.equal(canonicalJson(collisionInput), inputBefore);

    // The control permit and receipt are now intentionally stale chronology
    // inputs. Their hashes, target, state, and accepted-only positive control
    // are valid, so the terminal API must still refuse specifically because
    // fresh lane order says the actual latest attempt failed.
    const refusedCommit = runCommand('transition', {
      mode: 'commit-lane-receipt',
      state: staleAcceptedState,
      input: collisionInput,
      permit: stalePermit,
      receipt: staleReceipt,
    });
    assert.deepEqual(refusedCommit.inspection, collisionInspection);
    assert.equal(refusedCommit.transition.committed, false);
    assert.equal(refusedCommit.transition.reason, 'governance-unresolved');
    assert.equal(Object.hasOwn(refusedCommit.transition, 'receipt'), false);
    assert.equal(Object.hasOwn(refusedCommit.transition, 'terminalEvidenceIdentity'), false);
    assert.equal(canonicalJson(refusedCommit.transition.state), acceptedSession.acceptedStateBytes);
    assert.equal(refusedCommit.transition.state.overallUsed, authorityBefore.overallUsed);
    assert.deepEqual(refusedCommit.transition.state.recoveryUsed, authorityBefore.recoveryUsed);
    assert.deepEqual(refusedCommit.transition.state.completed, authorityBefore.completed);
    assert.deepEqual(laneSurfaceDigests(root), filesBefore);
    assert.equal(canonicalJson(collisionInput), inputBefore);
    assert.equal(t003ParsedTargetTask(root, TARGET).glyph, '~');
    assert.equal(t003SnapshotGlyph(root, TARGET), '~');
  });
});

nodeTest('cross-invocation chronology: lane history orders a higher old ordinal before a lower fresh repeat', () => {
  withSealedWorkspace(root => {
    const fixture = crossInvocationFixture(root);
    fixture.start();
    const first = fixture.attempt({
      material: 'src/distinct.mjs', label: 'distinct', failedCheck: true, verdict: 'accepted',
    });
    const old = fixture.attempt({
      material: 'src/repeat.mjs', label: 'repeat', failedCheck: true, verdict: 'accepted',
    });
    fixture.end();
    fixture.start();
    const fresh = fixture.attempt({
      material: 'src/repeat.mjs', label: 'repeat', failedCheck: true, verdict: 'accepted',
      repeat: true, reverseCurrentRun: true,
    });
    const governance = fresh.settled.session.pendingEffect.provisionalState.learningGovernance;
    assert.deepEqual(governance.trigger.occurrenceIdentities, [
      old.events[0].occurrenceIdentity, fresh.events[0].occurrenceIdentity,
    ]);
    assert.equal(old.events[0].occurrence.chronology.attemptOrdinal, 2);
    assert.equal(fresh.events[0].occurrence.chronology.attemptOrdinal, 1);
    assert.deepEqual(governance.failedApproachSet.approachBasisIdentities,
      [first.events[0].occurrence.basisIdentity, old.events[0].occurrence.basisIdentity].sort());
    assert.deepEqual(governance.failedApproachSet.evidenceEventHashes,
      [first.events[0].eventHash, old.events[0].eventHash, fresh.events[0].eventHash].sort());
    fixture.project();
    fixture.operate('settle-effect', { input: fixture.input() }, 'accepted', 'projection-verified');
    fixture.operate('advance-governance', {
      governance: { action: 'resume-learning', input: fixture.input() },
    }, 'accepted', 'governance-resumed');
    assert.deepEqual(fixture.snapshot().acceptedState.learningGovernance.trigger, governance.trigger);
    assert.deepEqual(fixture.snapshot().acceptedState.learningGovernance.failedApproachSet, governance.failedApproachSet);
    assert.equal(fixture.snapshot().acceptedState.overallUsed, 1);
    fixture.end();
  });
});

nodeTest('cross-invocation occurrence identity: multiple trusted findings at reused review ordinals remain distinct', () => {
  withSealedWorkspace(root => {
    const fixture = crossInvocationFixture(root);
    const findings = first => [first, {
      ...clone(first),
      basis: { ...clone(first.basis), failureClass: 'second-finding' },
    }];
    fixture.start();
    const old = fixture.attempt({ material: 'src/old-review.mjs', label: 'shared-review', findings });
    fixture.end();
    fixture.start();
    const fresh = fixture.attempt({
      material: 'src/new-review.mjs', label: 'shared-review', findings,
      repeat: true, reverseCurrentRun: true,
    });
    assert.equal(old.events.length, 3);
    assert.equal(fresh.events.length, 3);
    const all = [...old.events, ...fresh.events];
    assert.equal(new Set(all.map(event => event.occurrenceIdentity)).size, 6);
    assert.equal(new Set(all.map(event => event.eventHash)).size, 6);
    const oldFindings = old.events.slice(1);
    const freshFindings = fresh.events.slice(1);
    for (const finding of freshFindings) {
      const earlier = oldFindings.find(event => event.occurrence.basisIdentity === finding.occurrence.basisIdentity);
      assert.ok(earlier);
      assert.equal(earlier.occurrence.findingIdentity, finding.occurrence.findingIdentity);
      assert.deepEqual(earlier.occurrence.chronology, finding.occurrence.chronology);
      assert.notEqual(earlier.occurrence.attemptIdentity, finding.occurrence.attemptIdentity);
      assert.notEqual(earlier.occurrence.reviewEnvelopeIdentity, finding.occurrence.reviewEnvelopeIdentity);
      assert.notEqual(earlier.sourceCaptureIdentity, finding.sourceCaptureIdentity);
    }
    const governance = fresh.settled.session.pendingEffect.provisionalState.learningGovernance;
    const latest = freshFindings[0];
    const earliest = oldFindings.find(event => event.occurrence.basisIdentity === latest.occurrence.basisIdentity);
    assert.deepEqual(governance.trigger.occurrenceIdentities, [earliest.occurrenceIdentity, latest.occurrenceIdentity]);
    assert.deepEqual(governance.failedApproachSet.approachBasisIdentities,
      [old.events[0].occurrence.basisIdentity, fresh.events[0].occurrence.basisIdentity].sort());
    fixture.project();
    fixture.operate('settle-effect', { input: fixture.input() }, 'accepted', 'projection-verified');
    fixture.end();
  });
});

nodeTest('cross-invocation retention conflicts: exact captures, dual surfaces and one-use receipts remain required', () => {
  withSealedWorkspace(root => {
    const fixture = crossInvocationFixture(root);
    fixture.start();
    fixture.attempt({ material: 'src/prior.mjs', label: 'prior' });
    fixture.end();
    fixture.start();
    const fresh = fixture.attempt({ material: 'src/current.mjs', label: 'current', verdict: 'accepted' });
    const complete = fixture.input();
    const state = fresh.captured.session.pendingEffect.provisionalState;
    const batch = fresh.captured.effect.projectionBatch;
    const event = fresh.events[0];
    const rebuild = overrides => buildApproachOccurrenceEventV1({
      target: event.target, basis: event.basis,
      attemptIdentity: event.occurrence.attemptIdentity,
      authorizationEvidenceHash: event.occurrence.authorizationEvidenceHash,
      resultIdentity: event.occurrence.resultIdentity,
      disposition: event.occurrence.disposition,
      attemptOrdinal: event.occurrence.chronology.attemptOrdinal,
      verificationEnvelopeIdentity: event.verificationEnvelopeIdentity,
      reviewEnvelopeIdentity: event.reviewEnvelopeIdentity,
      ...overrides,
    });
    const replaceReviewCapture = (input, mutate) => {
      const index = input.review.length - 1;
      const trusted = t003TrustedCapture(input.review[index]);
      mutate(trusted);
      input.review[index] = sealedTransportInput({
        lane: { kind: 'lightweight' },
        review: [sealedCapture(TARGET, 'accepted', [trusted])],
      }).review[0];
      return input;
    };
    const oneSided = clone(complete);
    oneSided.currentRun = sealedTransportInput({
      lane: { kind: 'lightweight' },
      currentRun: [sealedCapture(TARGET, 'failed',
        t003CurrentEvents(complete).slice(0, -1).map(row => ({ event: row })))],
    }).currentRun;
    const duplicateCapture = clone(complete);
    const index = duplicateCapture.review.length - 1;
    const trusted = t003TrustedCapture(duplicateCapture.review[index]);
    duplicateCapture.review[index] = sealedTransportInput({
      lane: { kind: 'lightweight' },
      review: [sealedCapture(TARGET, 'accepted', [trusted, clone(trusted)])],
    }).review[0];
    const cases = [
      ['one-sided occurrence', oneSided, 'occurrence-retention-incomplete'],
      ['duplicate event', publishCurrentRun(complete, { substantive: { event } }), 'occurrence-retention-conflict'],
      ['same attempt', publishCurrentRun(complete, { substantive: { event: rebuild({
        resultIdentity: sha256('conflicting result for the actual current attempt'),
      }) } }), 'occurrence-retention-conflict'],
      ['same occurrence', publishCurrentRun(complete, { substantive: { event: rebuild({
        reviewEnvelopeIdentity: sha256('conflicting envelope for the same occurrence'),
      }) } }), 'occurrence-retention-conflict'],
      ['duplicate capture', duplicateCapture, /contains a duplicate trusted capture/],
      ['conflicting capture bytes', replaceReviewCapture(clone(complete), capture => {
        const body = JSON.parse(Buffer.from(capture.bytes.base64, 'base64').toString('utf8'));
        capture.bytes.base64 = Buffer.from(canonicalJson({ ...body, verdict: 'rejected' })).toString('base64');
      }), /descriptor must bind the complete decoded bytes/],
      ['wrong authority', replaceReviewCapture(clone(complete), capture => {
        capture.authority.authorityIdentity = sha256('wrong reviewer authority');
      }), /must bind the reviewer authority and invocation/],
      ['wrong target', replaceReviewCapture(clone(complete), capture => {
        capture.target = clone(SECOND_TARGET);
      }), /must match the normalized envelope target/],
    ];
    const before = laneSurfaceDigests(root);
    for (const [label, input, reason] of cases) {
      const finalize = () => runCommand('complete', { mode: 'finalize', state, input, projectionBatch: batch });
      if (reason instanceof RegExp) assert.throws(finalize, reason, label);
      else {
        const result = finalize();
        assert.equal(result.completion.finalized, false, label);
        assert.equal(result.completion.reason, reason, label);
        assert.deepEqual(result.completion.state, state, label);
      }
      assert.deepEqual(laneSurfaceDigests(root), before, label);
    }
    // A projection receipt alone never discharges retention. The terminal
    // receipt must rebind the exact accepted completion on both surfaces.
    const binding = sealedLaneBinding(root);
    const issued = fixture.operate('authorize-lane-effect', {
      laneEffect: {
        input: complete, mutation: clone(LANE_MUTATION),
        lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping,
      },
    }, 'accepted', 'lane-permit-issued');
    const permit = issued.product.permit;
    const applied = fixture.operate('apply-lane-effect', {
      laneApplication: { ...binding.application, permit },
    }, 'accepted', 'lane-mutation-applied');
    const receipt = applied.product.receipt;
    const appliedFiles = laneSurfaceDigests(root);
    const terminalState = fixture.snapshot().acceptedState;
    const oneSidedReceipt = runCommand('transition', {
      mode: 'commit-lane-receipt', state: terminalState, input: oneSided, permit, receipt,
    });
    assert.equal(oneSidedReceipt.transition.committed, false);
    assert.equal(oneSidedReceipt.transition.reason, 'governance-unresolved');
    assert.deepEqual(oneSidedReceipt.transition.state, terminalState);
    fixture.operate('commit-lane-receipt', {
      laneReceipt: { input: complete, permit, receipt },
    }, 'accepted', 'lane-receipt-committed');
    const prior = fixture.snapshot();
    const replayed = fixture.operate('commit-lane-receipt', {
      laneReceipt: { input: complete, permit, receipt },
    }, 'hard-stop', 'lane-receipt-replayed');
    assert.deepEqual(acceptedAuthorityTuple(replayed.session), acceptedAuthorityTuple(prior));
    assert.deepEqual(laneSurfaceDigests(root), appliedFiles);
    fixture.end('hard-stop-recorded');
  });
});

const RETAINED_STREAMS = ['currentRun', 'verification', 'review', 'lint'];

/** @param {number} count */
function feature060Checks(count) {
  return Array.from({ length: count }, (_, index) => ({
    definition: `Feature060 obligation ${index + 1}`,
    outcome: 'passed',
    evidence: `obligation:${index + 1}:passed`,
  }));
}

/** Explicit synthetic actual-owner reformulation, never performed by the runtime. */
function feature060OwnerCorrectedChecks() {
  return [
    ...feature060Checks(14),
    { definition: 'owner combined 15 and 16', outcome: 'passed', evidence: 'obligation:15:passed; obligation:16:passed' },
    { definition: 'owner combined 17 and 18', outcome: 'passed', evidence: 'obligation:17:passed; obligation:18:passed' },
  ];
}

/** @param {string} root */
function feature060Preimages(root) {
  return Object.fromEntries([
    IDEA_PATH, TARGET.specPath, TARGET.specPath.replace(/spec\.md$/, 'plan.md'), TASKS_PATH, TASK_STATE_PATH,
  ].map(relative => [relative, fs.readFileSync(path.join(root, relative))]));
}

nodeTest('Feature 060 T002: full state-bound preflight accepts 16 rows and rejects 17/18 without evidence loss', () => {
  const state = pendingState('autonomous');
  const adapter = createHostAdapter(sealedInitial({ state }));
  for (const count of [16, 17, 18]) {
    const result = specialistResult(`full-preflight-${count}`, 'accepted');
    result.verification.checks = feature060Checks(count);
    const request = sealedResultRequest(adapter, result);
    const before = canonicalJson(request);
    if (count === 16) {
      assert.deepEqual(validateHostAdapterRequest(request, state), request);
    } else {
      assert.throws(
        () => validateHostAdapterRequest(request, state),
        /checks.*1 through 16/,
        `${count} complete rows must reach the builder`,
      );
    }
    assert.equal(canonicalJson(request), before);
    assert.equal(result.verification.checks.length, count);
  }
  assert.deepEqual(acceptedAuthorityTuple(adapter.snapshot()), acceptedAuthorityTuple({
    acceptedState: state,
    acceptedStateBytes: canonicalJson(state),
    acceptedStateHash: sha256(canonicalJson(state)),
    acceptedRevision: 0,
  }));
});

nodeTest('Feature 060 T002: preflight rejects omitted writer files, wrong operations, and contradictory trusted outcomes', () => {
  const state = pendingState('autonomous');
  const adapter = createHostAdapter(sealedInitial({ state }));
  const valid = specialistResult('pending-scope', 'accepted');
  valid.changedTargets = clone(MATERIAL_INPUTS.targets);
  assert.doesNotThrow(() => validateHostAdapterRequest(sealedResultRequest(adapter, valid), state));
  for (const [label, result, pattern] of [
    ['omitted test file', {
      ...valid, changedTargets: [...MATERIAL_INPUTS.targets, 'src/skills/dude-work/host-adapter.test.mjs'],
    }, /pending action/],
    ['wrong operation', { ...valid, operations: ['retry-task'] }, /pending action/],
    ['failed evidence labeled success', {
      ...valid, verification: { checks: [{ ...valid.verification.checks[0], outcome: 'failed' }] },
    }, /must be failed/],
    ['no-change with a changed file', { ...valid, outcome: 'no-change' }, /pending action/],
  ]) {
    const request = sealedResultRequest(adapter, result);
    const before = canonicalJson(request);
    assert.throws(() => validateHostAdapterRequest(request, state), pattern, label);
    assert.equal(canonicalJson(request), before, label);
  }
  assert.throws(
    () => validateHostAdapterRequest(sealedResultRequest(adapter, valid)),
    /current accepted RunState/,
  );
  assert.throws(
    () => validateHostAdapterRequest(sealedResultRequest(adapter, guardedResult()), state),
    /current policy result contract/,
  );
});

nodeTest('Feature 060 T002: inert local rejection preserves canonical files and permits one same-attempt correction', () => {
  withSealedWorkspace(root => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const checkpoint = memoryCheckpointStore();
    let runtimeCalls = 0;
    let laneCalls = 0;
    let probeCalls = 0;
    const noEffect = sealedNoEffectAuthority();
    let completionInput;
    const adapter = createHostAdapter(checkpointInitial({ state }), {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('Feature060T002 local-preflight-runtime'),
        invoke(command, request) {
          runtimeCalls += 1;
          if (command === 'complete' && request.mode === 'capture') completionInput = clone(request.input);
          return { status: 'returned', value: runCommand(command, request) };
        },
      },
      laneOwner: {
        identity: sha256('Feature060T002 local-preflight-lane'),
        apply() { laneCalls += 1; throw new Error('no lane application expected'); },
      },
      noEffectAuthority: {
        ...noEffect,
        capture(request) { probeCalls += 1; return noEffect.capture(request); },
      },
    });
    const result = specialistResult('local-preflight', 'accepted');
    result.verification.checks = feature060Checks(18);
    const request = sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result },
    });
    const before = canonicalJson(request);
    const accepted = acceptedAuthorityTuple(adapter.snapshot());
    const preimages = feature060Preimages(root);
    const checkpointBefore = canonicalJson(checkpoint.pair);
    assert.throws(() => validateHostAdapterRequest(request, state), /checks.*1 through 16/);
    assert.equal(canonicalJson(checkpoint.pair), checkpointBefore, 'pure preflight writes no checkpoint');
    const refused = adapter.run(request);
    assert.equal(refused.outcome, 'closed-refusal');
    assert.equal(refused.incidentClass, 'malformed-request');
    assert.equal(refused.next.kind, 'correction');
    assert.deepEqual(acceptedAuthorityTuple(refused.session), accepted);
    assert.equal(canonicalJson(request), before);
    assert.deepEqual(feature060Preimages(root), preimages);
    assert.equal(refused.session.pendingEffect, null);
    assert.equal(runtimeCalls, 0);
    assert.equal(laneCalls, 0);
    assert.equal(probeCalls, 0);
    assert.equal(checkpoint.pair.checkpoint.acceptedStateBytes, accepted.acceptedStateBytes);
    assert.equal(checkpoint.pair.checkpoint.acceptedStateHash, accepted.acceptedStateHash);
    assert.equal(checkpoint.pair.checkpoint.inFlight, null);

    const corrected = clone(result);
    corrected.verification.checks = feature060OwnerCorrectedChecks();
    const captured = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: corrected },
    }, { correctionIdentity: refused.next.correctionIdentity }));
    assert.equal(captured.outcome, 'effect-required', captured.reason);
    assert.equal(captured.session.correction.consumed, true);
    assert.equal(Object.hasOwn(captured, 'recoveryNotice'), false);
    assert.deepEqual(acceptedAuthorityTuple(captured.session), accepted);
    assert.deepEqual(feature060Preimages(root), preimages);
    assert.equal(runtimeCalls, 1);
    assert.equal(probeCalls, 1);
    assert.equal(laneCalls, 0);
    const streams = Object.fromEntries(['verification', 'review'].map(field => [
      field, completionInput[field].map(entry => ({
        ...entry, bytes: Buffer.from(entry.bytes.base64, 'base64'),
      })),
    ]));
    const events = captured.effect.projectionBatch.events;
    const retained = sealedRetentionInput(root, events, events, streams);
    const needsInspection = adapter.run(sealedRequest(adapter, 'settle-effect', { input: retained }));
    assert.equal(needsInspection.outcome, 'reinspect-required');
    assert.equal(Object.hasOwn(needsInspection, 'recoveryNotice'), false);
    const resumed = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input: retained }));
    assert.equal(resumed.outcome, 'accepted');
    assert.deepEqual(resumed.recoveryNotice, {
      incidentClassification: 'malformed-request', statePreserved: true, resumedAction: 'record-attempt-result',
    });
    const settled = adapter.run(sealedRequest(adapter, 'settle-effect', { input: retained }));
    assert.equal(settled.outcome, 'accepted');
    assert.equal(settled.reason, 'completed');
    assert.equal(settled.session.acceptedState.overallUsed, accepted.overallUsed);
    assert.equal(Object.hasOwn(settled, 'recoveryNotice'), false);
    const later = adapter.run(sealedRequest(adapter, 'fresh-inspection', { input: retained }));
    assert.equal(later.outcome, 'accepted');
    assert.equal(Object.hasOwn(later, 'recoveryNotice'), false);
    adapter.end('cancelled');
  });
});

nodeTest('Feature 060 T002: runner obtains a fresh bound specialist pair without replaying an invalid result or charging again', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    request.specialistResult.verification.checks = feature060Checks(18);
    const invalidBytes = canonicalJson(request.specialistResult);
    const checkpoint = memoryCheckpointStore();
    const captures = [];
    const challenges = [];
    const preimages = feature060Preimages(root);
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('Feature060T002 same-attempt-runner'),
        invoke(command, input) {
          if (command === 'complete' && input.mode === 'capture') captures.push(clone(input));
          return { status: 'returned', value: runCommand(command, input) };
        },
      },
      exchange(challenge) {
        challenges.push(clone(challenge));
        assert.equal(challenge.kind, 'specialist-pair');
        const pending = focusedRunnerAcceptedState(challenge);
        assert.equal(pending.overallUsed, 1);
        assert.equal(pending.pending.length, 1);
        assert.deepEqual(pending.pending[0].materialInputs, request.assessment.materialInputs);
        assert.equal(captures.length, 0, 'the known-invalid result must never enter the runtime');
        assert.deepEqual(feature060Preimages(root), preimages);
        // Synthetic actual-owner response: all 18 obligations remain explicit.
        // The runner must neither make this semantic decision nor reuse the old review.
        const corrected = focusedSpecialistPair(request.assessment, 'owner-corrected', 'accepted');
        corrected.verification.checks = feature060OwnerCorrectedChecks();
        assert.equal(corrected.verification.checks.length, 16);
        for (let ordinal = 1; ordinal <= 18; ordinal += 1) {
          assert.ok(corrected.verification.checks.some(check => check.evidence.includes(`obligation:${ordinal}:passed`)));
        }
        return focusedChallengeResponse(challenge, 'specialistResult', corrected);
      },
    });
    assert.equal(result.outcome, 'ended', `${result.reason}: ${result.detail ?? ''}`);
    assert.equal(result.reason, 'task-settled');
    assert.equal(challenges.length, 1);
    assert.equal(captures.length, 1);
    assert.equal(canonicalJson(request.specialistResult), invalidBytes);
    assert.equal(focusedRunnerAcceptedState(result).overallUsed, 1);
    assert.equal(result.steps.filter(step => step.reason === 'authorized').length, 1);
    assert.equal(result.steps.filter(step => step.outcome === 'closed-refusal').length, 1);
    const authorization = result.steps.find(step => step.reason === 'authorized');
    const rejection = result.steps.find(step => step.outcome === 'closed-refusal');
    for (const field of ['stateBase64', 'stateHash', 'acceptedRevision', 'workerGeneration']) {
      assert.equal(rejection[field], authorization[field], `${field} survives the rejected handoff`);
    }
    assert.equal(challenges[0].stateHash, authorization.stateHash);
    assert.equal(challenges[0].acceptedRevision, authorization.acceptedRevision);
    assert.equal(captures[0].state.overallUsed, 1);
    assert.equal(result.steps.some(step => step.step.endsWith(':correction')), false);
    assert.ok(result.steps.some(step => step.step.endsWith(':reinspect') && step.reason === 'inspection-refreshed'));
    const notice = result.steps.filter(step => Object.hasOwn(step, 'recoveryNotice'));
    assert.equal(notice.length, 1);
    assert.equal(notice[0].outcome, 'accepted');
    assert.deepEqual(notice[0].recoveryNotice, {
      incidentClassification: 'malformed-request', statePreserved: true, resumedAction: 'fresh-inspection',
    });
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
  });
});

nodeTest('Feature 060 T002: receiver revalidates pending target and writer scope after pure preparation', () => {
  const state = pendingState('autonomous');
  const result = specialistResult('revalidate-scope', 'accepted');
  result.changedTargets = clone(state.pending[0].materialInputs.targets);
  const prepared = prepareSpecialistResult(state, result);
  assert.deepEqual(prepared.result, result);
  const narrowed = clone(state);
  narrowed.pending[0].materialInputs.targets = ['src/other-authorized-file.mjs'];
  narrowed.pending[0].approachHash = approachHash({
    action: narrowed.pending[0].action, materialInputs: narrowed.pending[0].materialInputs,
  });
  validateRunState(narrowed);
  let calls = 0;
  for (const [label, current, input] of [
    ['new pending scope', narrowed, {}],
    ['foreign target', state, { target: SECOND_TARGET }],
    ['foreign package', state, { specPath: '.dude/specs/999-foreign/spec.md' }],
  ]) {
    const adapter = createHostAdapter(sealedInitial({ state: current }), sealedPorts(() => { calls += 1; }));
    const request = sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input, result: prepared.result },
    });
    const before = acceptedAuthorityTuple(adapter.snapshot());
    assert.throws(() => validateHostAdapterRequest(request, current), /pending (action|attempt target)/, label);
    const rejected = adapter.run(request);
    assert.equal(rejected.outcome, 'closed-refusal', label);
    assert.deepEqual(acceptedAuthorityTuple(rejected.session), before, label);
  }
  assert.equal(calls, 0);
  assert.deepEqual(prepared.result, result, 'scope refusal cannot hide the changed file');
});

nodeTest('Feature 060 T002: inert snapshots cannot erase an own prototype-named data field before validation', () => {
  const state = pendingState('autonomous');
  for (const location of ['result', 'check', 'review']) {
    const result = specialistResult(`own-data-key-${location}`, 'accepted');
    const record = location === 'result' ? result
      : location === 'check' ? result.verification.checks[0] : result.review;
    Object.defineProperty(record, '__proto__', { value: null, enumerable: true });
    const before = JSON.stringify(result);
    assert.throws(() => prepareSpecialistResult(state, result), /unknown field '__proto__'/, location);
    let calls = 0;
    const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts(() => { calls += 1; }));
    const request = sealedResultRequest(adapter, result);
    assert.throws(() => validateHostAdapterRequest(request, state), /unknown field '__proto__'/, location);
    const refused = adapter.run(request);
    assert.equal(refused.outcome, 'closed-refusal', location);
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(result), before, location);
    assert.equal(Object.hasOwn(record, '__proto__'), true, location);
  }
});

nodeTest('Feature 060 T002: raw specialist accessors, proxies, and hidden data never run before rejection', async () => {
  for (const source of ['initial', 'exchange']) {
    for (const kind of ['accessor', 'proxy', 'hidden']) {
      await withSealedWorkspace(async root => {
        writeSealedTaskState(root);
        const request = focusedRunnerRequest(root);
        const raw = specialistResult(`inert-${source}-${kind}`, 'accepted');
        let reads = 0;
        if (kind === 'accessor') {
          Object.defineProperty(raw.verification.checks[0], 'evidence', {
            enumerable: true,
            get() { reads += 1; throw new Error('caller accessor must stay inert'); },
          });
        } else if (kind === 'proxy') {
          raw.verification.checks = new Proxy(raw.verification.checks, {
            get(target, key, receiver) { reads += 1; return Reflect.get(target, key, receiver); },
          });
        } else {
          Object.defineProperty(raw.verification.checks[0], 'hidden', { value: 'not JSON data' });
        }
        const state = pendingState('autonomous');
        assert.throws(() => prepareSpecialistResult(state, raw), TypeError);
        assert.equal(reads, 0);
        if (source === 'initial') request.specialistResult = raw;
        else delete request.specialistResult;
        let captures = 0;
        const checkpoint = memoryCheckpointStore();
        const preimages = feature060Preimages(root);
        const result = await runHostAdapter(request, {
          checkpoint: checkpoint.port,
          runtime: {
            identity: sha256(`Feature060T002 inert:${source}:${kind}`),
            invoke(command, input) {
              if (command === 'complete') captures += 1;
              return { status: 'returned', value: runCommand(command, input) };
            },
          },
          exchange(challenge) {
            return focusedRawChallengeResponse(challenge, 'specialistResult', raw);
          },
        });
        assert.equal(result.outcome, 'hard-stop', `${source}:${kind}`);
        assert.equal(result.reason, 'request-not-authorized');
        assert.equal(reads, 0);
        assert.equal(captures, 0);
        assert.equal(focusedRunnerAcceptedState(result).overallUsed, 1);
        assert.equal(result.steps.some(step => step.outcome === 'closed-refusal'), false);
        assert.deepEqual(feature060Preimages(root), preimages);
      });
    }
  }
});

nodeTest('Feature 060 T002: consumed correction and metadata churn require reinspection without a new allowance', () => {
  withSealedWorkspace(root => {
    writeSealedTaskState(root);
    const checkpoint = memoryCheckpointStore();
    const adapter = createHostAdapter(checkpointInitial({ state: pendingState('autonomous') }), {
      checkpoint: checkpoint.port,
    });
    const result = specialistResult('spent-local-correction', 'accepted');
    result.verification.checks = feature060Checks(17);
    const payload = { attemptResult: { input: sealedRecordInput(root), result } };
    const before = acceptedAuthorityTuple(adapter.snapshot());
    const preimages = feature060Preimages(root);
    const first = adapter.run(sealedRequest(adapter, 'record-attempt-result', payload));
    const correction = first.next.correctionIdentity;
    const consumed = adapter.run(sealedRequest(adapter, 'record-attempt-result', payload, {
      correctionIdentity: correction,
    }));
    assert.equal(consumed.outcome, 'closed-refusal');
    assert.equal(consumed.next.kind, 'inspect');
    assert.equal(consumed.session.correction.consumed, true);
    const consumedIdentity = consumed.session.correction.identity;
    for (let revision = 0; revision < 3; revision += 1) {
      const repeated = adapter.run(sealedRequest(adapter, 'record-attempt-result', payload, {
        correctionIdentity: consumedIdentity,
      }));
      assert.equal(repeated.outcome, 'reinspect-required');
      assert.equal(repeated.session.correction.identity, consumedIdentity);
      assert.deepEqual(acceptedAuthorityTuple(repeated.session), before);
      assert.equal(checkpoint.pair.checkpoint.correction.identity, consumedIdentity);
      assert.equal(Object.hasOwn(repeated, 'recoveryNotice'), false);
    }
    const refreshed = adapter.run(sealedRequest(adapter, 'fresh-inspection', {
      input: sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' })),
    }));
    assert.equal(refreshed.outcome, 'accepted');
    assert.equal(refreshed.session.correction, null);
    assert.deepEqual(acceptedAuthorityTuple(refreshed.session), before);
    const stale = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
      attemptResult: { input: sealedRecordInput(root), result: specialistResult('valid-after-inspection', 'accepted') },
    }, { correctionIdentity: correction }));
    assert.equal(stale.outcome, 'hard-stop');
    assert.equal(stale.reason, 'correction-not-authorized');
    assert.deepEqual(feature060Preimages(root), preimages);
  });
});

nodeTest('Feature 060 T002: stale session, revisions, checkpoint hashes, tokens, and generations cannot offer or consume correction', () => {
  for (const phase of ['offer', 'consume']) {
    for (const field of [
      'expectedSessionIdentity', 'expectedAcceptedRevision', 'expectedHostRevision',
      'acceptedStateHash', 'acceptedRevision', 'hostRevision', 'workerToken', 'workerGeneration', 'invocationIdentity',
    ]) {
      const checkpoint = memoryCheckpointStore();
      let calls = 0;
      const adapter = createHostAdapter(checkpointInitial({ state: pendingState('autonomous') }), {
        checkpoint: checkpoint.port,
        ...sealedPorts(() => { calls += 1; throw new Error('stale authority reached runtime'); }),
      });
      const invalid = specialistResult('stale-local', 'accepted');
      invalid.verification.checks = feature060Checks(18);
      const pending = acceptedAuthorityTuple(adapter.snapshot());
      let correctionIdentity;
      if (phase === 'consume') {
        const first = adapter.run(sealedResultRequest(adapter, invalid));
        assert.equal(first.outcome, 'closed-refusal', field);
        correctionIdentity = first.next.correctionIdentity;
      }
      const request = sealedResultRequest(adapter,
        phase === 'offer' ? invalid : specialistResult('stale-corrected', 'accepted'));
      if (correctionIdentity) request.correctionIdentity = correctionIdentity;
      if (field.startsWith('expected')) {
        request[field] = typeof request[field] === 'number' ? request[field] + 1 : sha256(`stale:${field}`);
      } else {
        checkpoint.pair.checkpoint[field] = typeof checkpoint.pair.checkpoint[field] === 'number'
          ? checkpoint.pair.checkpoint[field] + 1 : sha256(`stale:${field}`);
        const { recordHash, ...body } = checkpoint.pair.checkpoint;
        checkpoint.pair.checkpoint.recordHash = sha256(canonicalJson(body));
      }
      const stopped = adapter.run(request);
      assert.equal(stopped.outcome, 'hard-stop', `${phase}:${field}`);
      assert.deepEqual(acceptedAuthorityTuple(stopped.session), pending, `${phase}:${field}`);
      assert.equal(Object.hasOwn(stopped, 'recoveryNotice'), false);
      assert.equal(calls, 0);
    }
  }
});

nodeTest('Feature 060 T002: lost supervisor and cancellation stop local correction before effects', () => {
  for (const phase of ['offer', 'consume']) {
    for (const loss of ['supervisor', 'cancel']) {
      const supervisor = sealedSupervisorSession();
      const checkpoint = memoryCheckpointStore();
      let calls = 0;
      const adapter = createHostAdapter(checkpointInitial({ state: pendingState('autonomous') }), {
        checkpoint: checkpoint.port,
        supervisorSession: supervisor,
        ...sealedPorts(() => { calls += 1; }),
      });
      const invalid = specialistResult('lost-supervisor', 'accepted');
      invalid.review.verdict = 'invalid';
      const before = acceptedAuthorityTuple(adapter.snapshot());
      let correctionIdentity;
      if (phase === 'consume') correctionIdentity = adapter.run(sealedResultRequest(adapter, invalid)).next.correctionIdentity;
      if (loss === 'supervisor') delete supervisor.admit;
      else adapter.end('cancelled');
      const result = adapter.run({
        ...sealedResultRequest(adapter, phase === 'offer' ? invalid : specialistResult('after-loss', 'accepted')),
        ...(correctionIdentity ? { correctionIdentity } : {}),
      });
      assert.equal(result.outcome, loss === 'supervisor' ? 'hard-stop' : 'ended', `${phase}:${loss}`);
      assert.deepEqual(acceptedAuthorityTuple(result.session), before);
      assert.equal(calls, 0);
      assert.equal(Object.hasOwn(result, 'recoveryNotice'), false);
    }
  }
});

for (const phase of ['offer', 'consume-valid', 'consume-malformed']) {
  for (const authority of ['unavailable', 'revoked']) {
    nodeTest(`Feature 060 T002 resumed supervisor: ${phase} refuses ${authority} current authority`, context => {
      let fixtureRoot;
      try {
        withSealedWorkspace(root => {
          fixtureRoot = root;
          writeSealedTaskState(root);
          const checkpoint = memoryCheckpointStore();
          const supervisor = sealedSupervisorSession();
          const handoffPorts = supervisorPorts(checkpoint.port);
          const calls = { runtime: 0, lane: 0, probe: 0 };
          const noEffect = sealedNoEffectAuthority();
          const ports = {
            ...sealedPorts((command, request) => {
              calls.runtime += 1;
              return { status: 'returned', value: runCommand(command, request) };
            }),
            noEffectAuthority: {
              ...noEffect,
              capture(request) { calls.probe += 1; return noEffect.capture(request); },
            },
            laneOwner: {
              identity: sha256('Feature060T002 resumed-local-lane'),
              apply() { calls.lane += 1; throw new Error('local validation must not apply a lane effect'); },
            },
          };
          const worker = createHostAdapter(checkpointInitial({ state: pendingState('autonomous') }), {
            ...ports, checkpoint: checkpoint.port, supervisorSession: supervisor,
          });
          const inspection = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' }));
          assert.equal(worker.run(sealedRequest(worker, 'fresh-inspection', { input: inspection })).outcome, 'accepted');
          const malformed = specialistResult('resumed-local', 'accepted');
          malformed.verification.checks = feature060Checks(18);
          const attempt = result => ({ attemptResult: { input: sealedRecordInput(root), result } });
          let correctionIdentity;
          if (phase !== 'offer') {
            const offered = worker.run(sealedRequest(worker, 'record-attempt-result', attempt(malformed)));
            assert.equal(offered.outcome, 'closed-refusal');
            assert.equal(offered.incidentClass, 'malformed-request');
            assert.equal(offered.next.kind, 'correction');
            correctionIdentity = offered.next.correctionIdentity;
          }
          const active = worker.snapshot();
          const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), handoffPorts);
          assert.equal(handed.outcome, 'handed-off');
          const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(checkpoint.port, ports));
          assert.equal(resumed.outcome, 'resumed', resumed.reason);
          const replacement = resumed.adapter;
          try {
            assert.deepEqual(acceptedAuthorityTuple(replacement.snapshot()), acceptedAuthorityTuple(active));
            assert.equal(replacement.snapshot().workerToken, handed.receipt.workerToken);
            assert.equal(replacement.snapshot().workerGeneration, active.workerGeneration + 1);
            if (phase === 'offer') {
              const fresh = replacement.run(sealedRequest(replacement, 'fresh-inspection', { input: inspection }));
              assert.equal(fresh.outcome, 'accepted', fresh.reason);
            } else {
              // Exercise the existing carried correction before inspection clears it.
              assert.equal(replacement.snapshot().correction.identity, correctionIdentity);
              assert.equal(replacement.snapshot().correction.consumed, false);
            }
            if (authority === 'revoked') {
              delete supervisor.admit;
              delete handoffPorts.supervisorSession.admit;
            }
            const before = replacement.snapshot();
            const files = feature060Preimages(root);
            const checkpointBefore = canonicalJson(checkpoint.pair);
            const callsBefore = { ...calls };
            const corrected = specialistResult('resumed-local', 'accepted');
            corrected.verification.checks = feature060OwnerCorrectedChecks();
            const request = sealedRequest(replacement, 'record-attempt-result',
              attempt(phase === 'consume-valid' ? corrected : malformed),
              correctionIdentity ? { correctionIdentity } : {});
            if (phase === 'consume-valid') {
              assert.doesNotThrow(() => validateHostAdapterRequest(request, before.acceptedState));
            } else {
              assert.throws(() => validateHostAdapterRequest(request, before.acceptedState), /checks.*1 through 16/);
            }
            const requestBytes = canonicalJson(request);
            const result = replacement.run(request);
            context.diagnostic(canonicalJson({
              phase, authority, outcome: result.outcome, reason: result.reason,
              correctionConsumed: result.session.correction?.consumed ?? null,
              runtimeDelta: calls.runtime - callsBefore.runtime,
            }));
            assert.equal(result.outcome, 'hard-stop');
            assert.equal(result.reason, 'supervisor-identity-missing');
            assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before));
            assert.deepEqual(result.session.correction, before.correction, 'no allowance is offered or consumed');
            assert.equal(result.session.pendingEffect, null);
            assert.equal(Object.hasOwn(result, 'recoveryNotice'), false);
            assert.equal(Object.hasOwn(result, 'next'), false);
            assert.equal(canonicalJson(request), requestBytes);
            assert.equal(canonicalJson(checkpoint.pair), checkpointBefore);
            assert.deepEqual(feature060Preimages(root), files);
            assert.deepEqual(calls, callsBefore, 'no runtime, no-effect probe, or lane entry');
          } finally {
            const ended = replacement.end(replacement.snapshot().status === 'hard-stop' ? 'hard-stop-recorded' : 'cancelled');
            assert.equal(ended.outcome, 'ended', ended.reason);
            assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
            context.diagnostic('fixture cleanup: checkpoint pair cleared');
          }
        });
      } finally {
        assert.ok(fixtureRoot);
        assert.equal(fs.existsSync(fixtureRoot), false);
        context.diagnostic('fixture cleanup: temporary workspace removed');
      }
    });
  }
}

for (const mode of ['ordinary', 'entered-port-correction']) {
  nodeTest(`Feature 060 T002 resumed supervisor: ${mode} remains supported after handoff`, context => {
    let fixtureRoot;
    try {
      withSealedWorkspace(root => {
        fixtureRoot = root;
        writeSealedTaskState(root);
        const checkpoint = memoryCheckpointStore();
        let completionCalls = 0;
        const ports = sealedPorts((command, request) => {
          if (command === 'complete') {
            completionCalls += 1;
            if (mode === 'entered-port-correction' && completionCalls === 1) return { status: 'empty' };
          }
          return { status: 'returned', value: runCommand(command, request) };
        });
        const worker = createHostAdapter(checkpointInitial({ state: pendingState('autonomous') }), {
          ...ports, checkpoint: checkpoint.port,
        });
        const active = worker.snapshot();
        const handed = handoffHostWorker(handoffInput(active.invocationIdentity, active), supervisorPorts(checkpoint.port));
        assert.equal(handed.outcome, 'handed-off');
        const resumed = resumeHostAdapter(resumeInput(handed.receipt), resumePorts(checkpoint.port, ports));
        assert.equal(resumed.outcome, 'resumed', resumed.reason);
        const replacement = resumed.adapter;
        try {
          const fresh = replacement.run(sealedRequest(replacement, 'fresh-inspection', {
            input: sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' })),
          }));
          assert.equal(fresh.outcome, 'accepted', fresh.reason);
          const before = acceptedAuthorityTuple(replacement.snapshot());
          const files = feature060Preimages(root);
          const payload = { attemptResult: { input: sealedRecordInput(root), result: specialistResult('resumed-control', 'accepted') } };
          let result = replacement.run(sealedRequest(replacement, 'record-attempt-result', payload));
          if (mode === 'entered-port-correction') {
            assert.equal(result.outcome, 'closed-refusal');
            assert.equal(result.incidentClass, 'empty-output');
            assert.equal(result.next.kind, 'correction');
            assert.deepEqual(acceptedAuthorityTuple(result.session), before);
            result = replacement.run(sealedRequest(replacement, 'record-attempt-result', payload, {
              correctionIdentity: result.next.correctionIdentity,
            }));
            assert.equal(result.session.correction.consumed, true);
          }
          assert.equal(result.outcome, 'effect-required', result.reason);
          assert.equal(completionCalls, mode === 'ordinary' ? 1 : 2);
          assert.deepEqual(acceptedAuthorityTuple(result.session), before);
          assert.deepEqual(feature060Preimages(root), files);
          assert.equal(Object.hasOwn(result, 'recoveryNotice'), false);
        } finally {
          const ended = replacement.end(replacement.snapshot().status === 'hard-stop' ? 'hard-stop-recorded' : 'cancelled');
          assert.equal(ended.outcome, 'ended', ended.reason);
          assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
          context.diagnostic('fixture cleanup: checkpoint pair cleared');
        }
      });
    } finally {
      assert.ok(fixtureRoot);
      assert.equal(fs.existsSync(fixtureRoot), false);
      context.diagnostic('fixture cleanup: temporary workspace removed');
    }
  });
}

nodeTest('Feature 060 T002: pending or unverified completion effects never qualify as local no-effect rejection', () => {
  withSealedWorkspace(root => {
    writeSealedTaskState(root);
    const state = pendingState('autonomous');
    const fixture = sealedTrustedFixture(state, 'pending-not-inert', 'accepted');
    const { adapter, captured } = captureAdapter(state, fixture, root);
    const before = acceptedAuthorityTuple(captured.session);
    const heldEffect = clone(captured.session.pendingEffect);
    const preimages = feature060Preimages(root);
    const malformed = specialistResult('bad-after-effect', 'accepted');
    malformed.verification.checks = feature060Checks(18);
    const stopped = adapter.run(sealedResultRequest(adapter, malformed));
    assert.equal(stopped.outcome, 'hard-stop');
    assert.equal(stopped.reason, 'effect-unverified');
    assert.deepEqual(stopped.session.pendingEffect, heldEffect);
    assert.deepEqual(acceptedAuthorityTuple(stopped.session), before);
    assert.deepEqual(feature060Preimages(root), preimages);

    const unverified = createHostAdapter(sealedInitial({ state: heldEffect.provisionalState }));
    const refused = unverified.run(sealedResultRequest(unverified, malformed));
    assert.equal(refused.outcome, 'hard-stop');
    assert.equal(refused.reason, 'effect-unverified');
    assert.equal(refused.session.acceptedStateBytes, heldEffect.provisionalStateBytes);
    assert.deepEqual(feature060Preimages(root), preimages);
  });
});

nodeTest('Feature 060 T002: entered runtime ports need fresh no-effect proof and surviving authority', () => {
  for (const mode of ['no-effect', 'effect-observed', 'indeterminate', 'missing', 'stale', 'mismatched', 'supervisor-lost']) {
    withSealedWorkspace(root => {
      writeSealedTaskState(root);
      const supervisor = sealedSupervisorSession();
      let calls = 0;
      const adapter = createHostAdapter(sealedInitial({ state: pendingState('autonomous') }), {
        supervisorSession: supervisor,
        noEffectAuthority: ['no-effect', 'supervisor-lost'].includes(mode)
          ? sealedNoEffectAuthority() : refusingNoEffectAuthority(mode),
        ...sealedPorts(() => {
          calls += 1;
          if (mode === 'effect-observed') fs.appendFileSync(path.join(root, TASKS_PATH), '\nObserved injected port effect.\n');
          if (mode === 'supervisor-lost') delete supervisor.admit;
          return { status: 'empty' };
        }),
      });
      const before = acceptedAuthorityTuple(adapter.snapshot());
      const files = feature060Preimages(root);
      const result = adapter.run(sealedRequest(adapter, 'record-attempt-result', {
        attemptResult: { input: sealedRecordInput(root), result: specialistResult(`port-${mode}`, 'accepted') },
      }));
      assert.equal(result.outcome, mode === 'no-effect' ? 'closed-refusal' : 'hard-stop', mode);
      assert.deepEqual(acceptedAuthorityTuple(result.session), before, mode);
      assert.equal(calls, 1, mode);
      assert.equal(Object.hasOwn(result, 'recoveryNotice'), false, mode);
      if (mode !== 'effect-observed') assert.deepEqual(feature060Preimages(root), files, mode);
      else assert.notDeepEqual(feature060Preimages(root), files, 'an effect is not rolled back or excused by equal state');
    });
  }
});

nodeTest('Feature 060 T002: unsupported definition reconciliation remains a hard stop before attestation', () => {
  const state = pendingActionState('reconcile-derived-definition', ['lint', 'review', 'verification']);
  const result = specialistResult('unsupported-definition', 'accepted');
  result.operations = ['reconcile-derived-definition'];
  result.verification.checks = feature060Checks(18);
  let calls = 0;
  const adapter = createHostAdapter(sealedInitial({ state }), sealedPorts(() => { calls += 1; }));
  const request = sealedResultRequest(adapter, result);
  assert.throws(() => validateHostAdapterRequest(request, state), /definition-reconciliation-attestation-unsupported/);
  const stopped = adapter.run(request);
  assert.equal(stopped.outcome, 'hard-stop');
  assert.equal(stopped.reason, 'definition-reconciliation-attestation-unsupported');
  assert.equal(stopped.session.correction, null);
  assert.equal(stopped.session.acceptedStateBytes, canonicalJson(state));
  assert.equal(calls, 0);
});

nodeTest('Feature 060 T002: fresh specialist exchanges keep replay, order, cancellation, context-loss, and challenge bounds', async () => {
  for (const mode of ['replay', 'foreign', 'order', 'cancel', 'lost', 'bounded']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const request = focusedRunnerRequest(root);
      delete request.specialistResult;
      const checkpoint = memoryCheckpointStore();
      const preimages = feature060Preimages(root);
      const challenges = [];
      let firstResponse;
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        exchange(challenge) {
          assert.equal(challenge.kind, 'specialist-pair');
          const state = focusedRunnerAcceptedState(challenge);
          assert.equal(state.overallUsed, 1);
          assert.equal(state.pending.length, 1);
          challenges.push(clone(challenge));
          if (challenges.length === 1) {
            const invalid = specialistResult('invalid-owner-response', 'accepted');
            invalid.verification.checks = feature060Checks(18);
            firstResponse = focusedChallengeResponse(challenge, 'specialistResult', invalid);
            return firstResponse;
          }
          assert.equal(challenge.attemptIdentity, challenges[0].attemptIdentity);
          assert.equal(challenge.stateHash, challenges[0].stateHash);
          assert.notEqual(challenge.challengeIdentity, challenges[0].challengeIdentity);
          assert.notEqual(challenge.bindingIdentity, challenges[0].bindingIdentity);
          if (mode === 'replay') return firstResponse;
          if (mode === 'cancel') return focusedCancelResponse(challenge);
          if (mode === 'lost') return null;
          const response = focusedChallengeResponse(challenge, 'specialistResult',
            mode === 'bounded' ? firstResponse.specialistResult : specialistResult('correct-owner-response', 'accepted'));
          if (mode === 'foreign') response.challengeIdentity = sha256('foreign-correction');
          if (mode === 'order') response.kind = 'assessment';
          return response;
        },
      });
      const expected = {
        replay: 'challenge-response-replayed',
        foreign: 'challenge-response-foreign',
        order: 'challenge-response-out-of-order',
        cancel: 'cancelled',
        lost: 'exchange-context-lost',
        bounded: 'challenge-budget-exhausted',
      }[mode];
      assert.equal(result.reason, expected, mode);
      assert.equal(result.outcome, mode === 'cancel' ? 'ended' : 'hard-stop', mode);
      assert.equal(challenges.length, mode === 'bounded' ? 10 : 2, mode);
      assert.equal(focusedRunnerAcceptedState(result).overallUsed, 1, mode);
      assert.equal(result.steps.some(step => step.step.endsWith(':correction')), false, mode);
      assert.deepEqual(feature060Preimages(root), preimages, mode);
      assert.equal(checkpoint.pair.checkpoint === null, mode === 'cancel', mode);
    });
  }
});

nodeTest('Feature 060 T002: real verification and review failures remain Work outcomes rather than host incidents', async () => {
  for (const failure of ['verification-failed', 'review-rejected']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const request = focusedRunnerRequest(root);
      request.specialistResult = failure === 'verification-failed'
        ? focusedFailedSpecialistPair(request.assessment, 'genuine-failure')
        : focusedSpecialistPair(request.assessment, 'genuine-failure', 'rejected');
      const result = await runHostAdapter(request, {
        checkpoint: memoryCheckpointStore().port,
        exchange(challenge) {
          assert.equal(challenge.kind, 'assessment');
          const state = focusedRunnerAcceptedState(challenge);
          assert.equal(state.overallUsed, 1);
          assert.equal(state.pending.length, 0);
          assert.equal(state.completed.length, 1);
          return focusedCancelResponse(challenge);
        },
      });
      assert.equal(result.outcome, 'ended');
      assert.equal(result.reason, 'cancelled');
      assert.ok(result.steps.some(step => step.outcome === 'accepted' && step.reason === failure));
      assert.equal(result.steps.some(step => step.outcome === 'closed-refusal'), false);
      assert.equal(result.steps.some(step => Object.hasOwn(step, 'recoveryNotice')), false);
      assert.equal(t003LaneEvents(root, TARGET).target[0].occurrence.disposition, failure);
    });
  }
});

/**
 * Observe original runtime-port inputs from real disposable runner attempts,
 * then end by cancellation. This supplies no historical incident or old state.
 * @param {string} root @param {string} label @param {number[]} findingCounts
 * @param {Record<string, unknown>} [retainedEvidence]
 */
async function observedRunnerHistory(root, label, findingCounts, retainedEvidence) {
  const request = focusedRunnerRequest(root, retainedEvidence ? { retainedEvidence } : {});
  delete request.assessment;
  delete request.specialistResult;
  const checkpoint = memoryCheckpointStore();
  const observations = [];
  let ordinal = 0;
  let assessment;
  const result = await runHostAdapter(request, {
    checkpoint: checkpoint.port,
    runtime: {
      identity: sha256(`observed-history:${label}`),
      invoke(command, lowLevelRequest) {
        const original = clone(lowLevelRequest);
        const value = runCommand(command, lowLevelRequest);
        observations.push({ command, request: original, value: clone(value) });
        return { status: 'returned', value };
      },
    },
    exchange(challenge) {
      if (challenge.kind === 'assessment') {
        if (ordinal === findingCounts.length) return focusedCancelResponse(challenge);
        assessment = focusedChallengeAssessment(challenge, {
          materialInputs: focusedMaterialInputs([`src/${label}-${ordinal}.mjs`]),
        });
        return focusedChallengeResponse(challenge, 'assessment', assessment);
      }
      assert.equal(challenge.kind, 'specialist-pair');
      const count = findingCounts[ordinal];
      const pair = count === 0
        ? focusedFailedSpecialistPair(assessment, `${label}-${ordinal}`)
        : focusedSpecialistPair(assessment, `${label}-${ordinal}`, 'rejected');
      if (count > 0) {
        const finding = pair.review.findings[0];
        pair.review.findings = Array.from({ length: count }, (_, index) => ({
          ...clone(finding),
          basis: {
            ...clone(finding.basis),
            expectation: { kind: 'governing-rule', reference: `${label}-${ordinal}-${index}` },
          },
        }));
      }
      ordinal += 1;
      return focusedChallengeResponse(challenge, 'specialistResult', pair);
    },
  });
  assert.equal(result.outcome, 'ended', `${label}: ${result.reason}: ${result.detail ?? ''}`);
  assert.equal(result.reason, 'cancelled', label);
  assert.equal(focusedRunnerAcceptedState(result).overallUsed, findingCounts.length);
  assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
  const input = observations.at(-1).request.input;
  return {
    result, observations,
    retainedEvidence: Object.fromEntries(RETAINED_STREAMS.map(field => [field, clone(input[field])])),
  };
}

nodeTest('Feature 060 T001: original runtime-port captures seed a fresh run without adopting old authority', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const historical = await observedRunnerHistory(root, 'retained-authority', [0, 0]);
    const retained = historical.retainedEvidence;
    const before = canonicalJson(retained);
    const oldEvents = t003LaneEvents(root, TARGET).target;
    assert.equal(oldEvents.length, 2);
    const request = focusedRunnerRequest(root, { retainedEvidence: retained });
    delete request.assessment;
    delete request.specialistResult;
    const calls = [];
    const checkpoint = memoryCheckpointStore();
    let assessment;
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('fresh-retained-authority'),
        invoke(command, lowLevelRequest) {
          calls.push({ command, request: clone(lowLevelRequest) });
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      exchange(challenge) {
        if (challenge.kind === 'assessment') {
          assert.deepEqual(focusedRunnerAcceptedState(challenge), emptyState('autonomous'));
          assert.equal(challenge.inspection.items.find(item => item.source === 'session').status, 'missing');
          assessment = focusedChallengeAssessment(challenge);
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        assert.equal(challenge.kind, 'specialist-pair');
        const state = focusedRunnerAcceptedState(challenge);
        assert.equal(state.overallUsed, 1);
        assert.equal(state.pending.length, 1);
        assert.deepEqual(state.completed, []);
        return focusedChallengeResponse(challenge, 'specialistResult',
          focusedSpecialistPair(assessment, 'fresh-retained-authority'));
      },
    });
    assert.equal(result.reason, 'task-settled', `${result.reason}: ${result.detail ?? ''}`);
    assert.equal(canonicalJson(retained), before);
    assert.equal(calls[0].request.input.currentRun.length, retained.currentRun.length + 1);
    assert.deepEqual(JSON.parse(Buffer.from(
      calls[0].request.input.currentRun.at(-1).bytes.base64, 'base64',
    )).records, []);
    for (const { command, request: call } of calls) {
      for (const field of RETAINED_STREAMS) {
        if (command === 'complete' && call.mode === 'capture' && field !== 'currentRun') continue;
        assert.deepEqual(call.input[field].slice(0, retained[field].length), retained[field],
          `${command}:${call.mode ?? ''}:${field}`);
      }
    }
    const state = focusedRunnerAcceptedState(result);
    assert.equal(state.overallUsed, 1);
    assert.equal(state.completed.length, 1);
    assert.deepEqual(state.pending, []);
    assert.deepEqual(state.recoveryUsed, []);
    const events = t003LaneEvents(root, TARGET).target;
    assert.deepEqual(events.slice(0, oldEvents.length), oldEvents);
    assert.equal(events.at(-1).occurrence.chronology.attemptOrdinal, 1);
    assert.notEqual(events.at(-1).occurrence.attemptIdentity, oldEvents[0].occurrence.attemptIdentity);
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
  });
});

nodeTest('Feature 060 T001: 21 retained events with absent original captures refuse before ownership or dispatch', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    await observedRunnerHistory(root, 'missing-history', [16, 3]);
    assert.equal(t003LaneEvents(root, TARGET).target.length, 21);
    const before = laneSurfaceDigests(root);
    for (const supplied of [false, true]) {
      const checkpoint = memoryCheckpointStore();
      let runtimeCalls = 0;
      let exchanges = 0;
      const request = focusedRunnerRequest(root, supplied ? {
        retainedEvidence: { currentRun: [], verification: [], review: [], lint: [] },
      } : {});
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        runtime: {
          identity: sha256('missing-history-admission'),
          invoke(command, input) {
            runtimeCalls += 1;
            return { status: 'returned', value: runCommand(command, input) };
          },
        },
        exchange() { exchanges += 1; throw new Error('missing history dispatched'); },
      });
      assert.equal(result.reason, 'evidence-incomplete');
      assert.deepEqual(checkpoint.calls, [], 'no checkpoint claim or update');
      assert.equal(runtimeCalls, 0);
      assert.equal(exchanges, 0);
      assert.equal(result.acceptedRevision, 0);
      assert.equal(result.hostRevision, 0);
      assert.deepEqual(focusedRunnerAcceptedState(result), request.state);
      assert.equal(result.detail, 'retainedEvidence: missing current-run');
      assert.equal(result.haltReport.subject, 'occurrence-retention');
      assert.equal(result.haltReport.evidenceHash, request.assessment.evidenceHash);
      assert.deepEqual(laneSurfaceDigests(root), before);
    }
  });
});

/** @param {Record<string, unknown>} entry @param {(body:Record<string, unknown>)=>void} mutate */
function changedRetainedCapture(entry, mutate) {
  const body = JSON.parse(Buffer.from(entry.bytes.base64, 'base64'));
  mutate(body);
  const records = body.records.map(record => record.substantive);
  return sealedTransportInput({
    lane: { kind: 'lightweight' },
    currentRun: [sealedCapture(body.target, body.state, records)],
  }).currentRun[0];
}

nodeTest('Feature 060 T001: missing, conflicting, and wrongly bound original sources refuse before admission', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const observed = await observedRunnerHistory(root, 'source-bindings', [1]);
    const original = observed.retainedEvidence;
    const files = laneSurfaceDigests(root);
    const cases = [
      ['missing current-run', value => { value.currentRun = []; }, 'missing current-run'],
      ['missing verification', value => { value.verification = []; }, 'missing verification'],
      ['missing review', value => { value.review = []; }, 'missing review'],
      ['partial history', value => {
        value.currentRun[0] = changedRetainedCapture(value.currentRun[0], body => { body.records.pop(); });
      }, 'invalid current-run'],
      ['wrong target', value => { value.currentRun[0].target = clone(SECOND_TARGET); }, 'invalid current-run'],
      ['wrong capture state', value => { value.currentRun[0].state = 'passed'; }, 'invalid current-run'],
      ['wrong outcome hash', value => { value.currentRun[0].outcomeHash = sha256('wrong retained hash'); }, 'invalid current-run'],
      ['wrong trusted hash', value => {
        value.verification[0] = changedRetainedCapture(value.verification[0], body => {
          body.records[0].substantive.bytes.sha256 = sha256('wrong trusted bytes');
        });
      }, 'invalid verification'],
      ['wrong attempt', value => {
        value.verification[0] = changedRetainedCapture(value.verification[0], body => {
          const capture = body.records[0].substantive;
          const { envelopeIdentity, ...envelope } = JSON.parse(Buffer.from(capture.bytes.base64, 'base64'));
          envelope.attemptIdentity = sha256('another attempt');
          capture.bytes = capturedBytesV1(Buffer.from(canonicalJson({
            ...envelope, envelopeIdentity: sha256(canonicalJson(envelope)),
          })));
        });
      }, 'invalid verification/review'],
      ['wrong reviewer provenance', value => {
        value.review[0] = changedRetainedCapture(value.review[0], body => {
          body.records[0].substantive.authority.authorityIdentity = sha256('another reviewer authority');
        });
      }, 'invalid review'],
      ['wrong review verification binding', value => {
        value.review[0] = changedRetainedCapture(value.review[0], body => {
          const capture = body.records[0].substantive;
          const { envelopeIdentity, ...envelope } = JSON.parse(Buffer.from(capture.bytes.base64, 'base64'));
          envelope.verificationEnvelopeIdentity = sha256('another verification');
          capture.bytes = capturedBytesV1(Buffer.from(canonicalJson({
            ...envelope, envelopeIdentity: sha256(canonicalJson(envelope)),
          })));
        });
      }, 'invalid verification/review'],
      ['conflicting occurrence', value => {
        value.currentRun.push(changedRetainedCapture(value.currentRun[0], body => {
          const event = body.records[0].substantive.event;
          body.records = [{ substantive: { event: buildApproachOccurrenceEventV1({
            target: event.target, basis: event.basis,
            attemptIdentity: event.occurrence.attemptIdentity,
            authorizationEvidenceHash: event.occurrence.authorizationEvidenceHash,
            resultIdentity: sha256('conflicting result'),
            disposition: event.occurrence.disposition,
            attemptOrdinal: event.occurrence.chronology.attemptOrdinal,
            verificationEnvelopeIdentity: event.verificationEnvelopeIdentity,
            reviewEnvelopeIdentity: event.reviewEnvelopeIdentity,
          }) } }];
        }));
      }, 'invalid current-run'],
      ['duplicate trusted source', value => { value.review.push(clone(value.review[0])); }, 'invalid review'],
      ['normalized text is not a capture', value => {
        value.currentRun[0].bytes = { base64: Buffer.from(
          observed.observations.at(-1).value.inspection.items.find(item => item.source === 'current-run').text,
        ).toString('base64') };
      }, 'invalid current-run'],
    ];
    for (const [label, mutate, detail] of cases) {
      const retainedEvidence = clone(original);
      mutate(retainedEvidence);
      const checkpoint = memoryCheckpointStore();
      let calls = 0;
      const request = focusedRunnerRequest(root, { retainedEvidence });
      const result = await runHostAdapter(request, {
        checkpoint: checkpoint.port,
        runtime: {
          identity: sha256(`retained-invalid:${label}`),
          invoke() { calls += 1; throw new Error('invalid source reached runtime'); },
        },
        exchange() { calls += 1; throw new Error('invalid source dispatched'); },
      });
      assert.equal(result.outcome, 'hard-stop', label);
      assert.equal(result.reason, 'evidence-incomplete', label);
      assert.equal(result.detail, `retainedEvidence: ${detail}`, label);
      assert.equal(calls, 0, label);
      assert.deepEqual(checkpoint.calls, [], label);
      assert.deepEqual(focusedRunnerAcceptedState(result), request.state, label);
      assert.equal(result.acceptedRevision, 0, label);
      assert.equal(result.hostRevision, 0, label);
      assert.deepEqual(laneSurfaceDigests(root), files, label);
    }
  });
});

nodeTest('Feature 060 T001: retainedEvidence is closed canonical transport and never accepts reconstructed or extra state', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const observed = await observedRunnerHistory(root, 'transport-contract', [0]);
    const cases = [
      ['missing stream', value => { delete value.review; }],
      ['extra state', value => { value.state = emptyState('autonomous'); }],
      ['session is not a retained stream', value => { value.session = { availability: 'unavailable' }; }],
      ['not an array', value => { value.lint = {}; }, 'lint'],
      ['noncanonical base64', value => { value.currentRun[0].bytes = { base64: 'YR==' }; }, 'current-run'],
      ['unpadded base64', value => { value.currentRun[0].bytes = { base64: 'YQ' }; }, 'current-run'],
      ['extra byte field', value => { value.currentRun[0].bytes.hash = sha256('extra'); }, 'current-run'],
      ['internal bytes are not runner transport', value => {
        value.currentRun[0].bytes = Buffer.from(value.currentRun[0].bytes.base64, 'base64');
      }, 'current-run'],
      ['extra capture field', value => { value.currentRun[0].archive = 'not-a-source'; }, 'current-run'],
    ];
    for (const [label, mutate, source = 'current-run/verification/review/lint input'] of cases) {
      const retainedEvidence = clone(observed.retainedEvidence);
      mutate(retainedEvidence);
      const checkpoint = memoryCheckpointStore();
      const result = await runHostAdapter(focusedRunnerRequest(root, { retainedEvidence }), {
        checkpoint: checkpoint.port,
        exchange() { assert.fail(`${label}: reached exchange`); },
      });
      assert.equal(result.reason, 'evidence-incomplete', label);
      assert.equal(result.detail, `retainedEvidence: invalid ${source}`, label);
      assert.deepEqual(checkpoint.calls, [], label);
      assert.equal(result.haltReport.resolved, false, 'invalid transport supplies no Inspection hash');
    }
    const checkpoint = memoryCheckpointStore();
    const wrongOwner = focusedRunnerRequest(root, {
      owner: { ideaPath: '.dude/ideas/999-not-the-owner.md', specPath: TARGET.specPath },
      retainedEvidence: { untrusted: 'bad input' },
    });
    const refused = await runHostAdapter(wrongOwner, { checkpoint: checkpoint.port });
    assert.equal(refused.reason, 'runner-refused');
    assert.equal(refused.detail, 'owner-resolution-failed', 'owner precedence survives invalid captures');
    assert.deepEqual(checkpoint.calls, []);
  });
});

nodeTest('Feature 060 T001: duplicate current-run sources keep their multiplicity and caller mutation cannot rewrite history', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const observed = await observedRunnerHistory(root, 'immutable-history', [0]);
    const retainedEvidence = clone(observed.retainedEvidence);
    retainedEvidence.currentRun.push(clone(retainedEvidence.currentRun[0]));
    const original = clone(retainedEvidence);
    const calls = [];
    let assessment;
    const request = focusedRunnerRequest(root, { retainedEvidence });
    delete request.assessment;
    delete request.specialistResult;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('immutable-history'),
        invoke(command, lowLevelRequest) {
          calls.push({ command, request: clone(lowLevelRequest) });
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      },
      exchange(challenge) {
        if (challenge.kind === 'assessment') {
          assessment = focusedChallengeAssessment(challenge);
          retainedEvidence.currentRun.length = 0;
          retainedEvidence.verification[0].outcomeHash = sha256('changed after admission');
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        return focusedChallengeResponse(challenge, 'specialistResult',
          focusedSpecialistPair(assessment, 'immutable-history-fresh'));
      },
    });
    assert.equal(result.reason, 'task-settled', result.detail ?? result.reason);
    for (const call of calls) {
      assert.deepEqual(call.request.input.currentRun.slice(0, 2), original.currentRun);
      assert.equal(call.request.input.currentRun.length, 3, 'only the final live capture changes');
      if (call.command !== 'complete' || call.request.mode !== 'capture') {
        assert.deepEqual(call.request.input.verification.slice(0, 1), original.verification);
      }
    }
  });
});

nodeTest('Feature 060 T001: distinct historical attempts may reuse invocation-local ordinals in a fresh run', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const first = await observedRunnerHistory(root, 'historical-first', [0]);
    const second = await observedRunnerHistory(root, 'historical-second', [0], first.retainedEvidence);
    const third = await observedRunnerHistory(root, 'historical-third', [0], second.retainedEvidence);
    const events = t003LaneEvents(root, TARGET).target;
    assert.deepEqual(events.map(event => event.occurrence.chronology.attemptOrdinal), [1, 1, 1]);
    assert.equal(new Set(events.map(event => event.occurrence.attemptIdentity)).size, 3);
    assert.deepEqual(second.retainedEvidence.currentRun.slice(0, 1), first.retainedEvidence.currentRun);
    assert.deepEqual(third.retainedEvidence.currentRun.slice(0, 2), second.retainedEvidence.currentRun);
    assert.equal(third.retainedEvidence.verification.length, 3);
    assert.equal(third.retainedEvidence.review.length, 3);
    assert.equal(focusedRunnerAcceptedState(third.result).overallUsed, 1);
    assert.equal(focusedRunnerAcceptedState(third.result).completed.length, 1);
  });
});

nodeTest('Feature 060 T001: pending tasks require permit, apply, receipt, setup end, then fresh runner bindings', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    fs.writeFileSync(path.join(root, TASKS_PATH),
      fs.readFileSync(path.join(root, TASKS_PATH), 'utf8').replace('- [~]', '- [ ]'));
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'));
    snapshot[TASKS_PATH].glyphs[TARGET.taskKey] = ' ';
    fs.writeFileSync(path.join(root, TASK_STATE_PATH), `${JSON.stringify(snapshot, null, 2)}\n`);
    const checkpoint = memoryCheckpointStore();
    const pendingFiles = laneSurfaceDigests(root);
    const direct = await runHostAdapter(focusedRunnerRequest(root), { checkpoint: checkpoint.port });
    assert.equal(direct.reason, 'runner-refused');
    assert.equal(direct.detail, 'lane-prestate-mismatch');
    assert.deepEqual(checkpoint.calls, []);
    assert.deepEqual(laneSurfaceDigests(root), pendingFiles);

    const state = emptyState('autonomous');
    const input = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' }));
    const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
    assert.equal(inspectRetainedOccurrencesV2(inspection).blocker, null);
    const binding = sealedLaneBinding(root);
    binding.lanePrestate.glyph = ' ';
    const workspace = {
      workspaceIdentity: sha256(canonicalJson({ version: 1, root })),
      ownerIdentity: sha256(canonicalJson({ version: 1, owner: binding.application.owner })),
      taskPrestateIdentity: sha256(canonicalJson({
        version: 1, target: canonicalTarget(TARGET), glyph: ' ', blockedBy: null,
        tasksDescriptor: binding.targetMapping.tasksDescriptor,
      })),
      lanePrestateIdentity: sha256(canonicalJson(binding.lanePrestate)),
    };
    const setup = createHostAdapter(sealedInitial({
      state, workspace, inspectionIdentity: sha256(canonicalJson(inspection)),
    }), { checkpoint: checkpoint.port });
    const setupIdentity = setup.snapshot().invocationIdentity;
    assert.equal(setup.run(sealedRequest(setup, 'fresh-inspection', { input })).reason, 'inspection-refreshed');
    const mutation = {
      ...clone(LANE_MUTATION), kind: 'claim', reason: 'initial-claim', fromGlyph: ' ', toGlyph: '~',
    };
    const issued = setup.run(sealedRequest(setup, 'authorize-lane-effect', {
      laneEffect: { input, mutation, lanePrestate: binding.lanePrestate, targetMapping: binding.targetMapping },
    }));
    assert.equal(issued.reason, 'lane-permit-issued', issued.reason);
    assert.deepEqual(laneSurfaceDigests(root), pendingFiles, 'issuing a permit is not the claim mutation');
    const permit = issued.product.permit;
    const applied = setup.run(sealedRequest(setup, 'apply-lane-effect', {
      laneApplication: { ...binding.application, mutation, permit },
    }));
    assert.equal(applied.reason, 'lane-mutation-applied', applied.reason);
    assert.equal(t003ParsedTargetTask(root, TARGET).glyph, '~');
    assert.equal(t003SnapshotGlyph(root, TARGET), '~');
    const committed = setup.run(sealedRequest(setup, 'commit-lane-receipt', {
      laneReceipt: { input, permit, receipt: applied.product.receipt },
    }));
    assert.equal(committed.reason, 'lane-receipt-committed', committed.reason);
    assert.equal(committed.session.acceptedStateBytes, canonicalJson(state));
    assert.equal(committed.session.acceptedRevision, 0);
    const ended = setup.end('controlled-end');
    assert.equal(ended.outcome, 'ended');
    assert.equal(ended.reason, 'controlled-end');
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
    let freshIdentity;
    const result = await runHostAdapter(focusedRunnerRequest(root, { state: ended.session.acceptedState }), {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('post-claim-fresh-runtime'),
        invoke(command, request) {
          freshIdentity ??= checkpoint.pair.claim.invocationIdentity;
          assert.notEqual(freshIdentity, setupIdentity);
          return { status: 'returned', value: runCommand(command, request) };
        },
      },
    });
    assert.equal(result.reason, 'task-settled', result.detail ?? result.reason);
    assert.equal(checkpoint.calls.filter(call => call === 'claim').length, 2);
    assert.equal(checkpoint.calls.filter(call => call === 'clear').length, 2);
    assert.deepEqual(checkpoint.pair, { claim: null, checkpoint: null });
  });
});

/** @param {string} root @param {Record<string, unknown>} retained */
function seededRunnerInput(root, retained) {
  const input = {
    ...sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' })),
    ...clone(retained),
  };
  if (retained.currentRun.length > 0) {
    input.currentRun.push(sealedTransportInput({
      lane: { kind: 'lightweight' }, currentRun: [currentRunCapture(TARGET, [])],
    }).currentRun[0]);
  }
  return input;
}

/** @param {string} root @param {Record<string, unknown>} retainedEvidence @param {boolean} [authorize] */
async function probeRetainedAdmission(root, retainedEvidence, authorize = false) {
  const checkpoint = memoryCheckpointStore();
  const kinds = [];
  const inputs = [];
  const request = focusedRunnerRequest(root, { retainedEvidence });
  delete request.assessment;
  delete request.specialistResult;
  const files = laneSurfaceDigests(root);
  const result = await runHostAdapter(request, {
    checkpoint: checkpoint.port,
    runtime: {
      identity: sha256('retained-capacity-probe'),
      invoke(command, lowLevelRequest) {
        inputs.push(clone(lowLevelRequest.input));
        return { status: 'returned', value: runCommand(command, lowLevelRequest) };
      },
    },
    exchange(challenge) {
      kinds.push(challenge.kind);
      return authorize && challenge.kind === 'assessment'
        ? focusedChallengeResponse(challenge, 'assessment', focusedChallengeAssessment(challenge))
        : focusedCancelResponse(challenge);
    },
  });
  assert.deepEqual(laneSurfaceDigests(root), files);
  return { result, checkpoint, kinds, inputs };
}

nodeTest('Feature 060 T001: seeded sources pay the empty live capture and exact source/descriptor completion reservations', async context => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const history = (await observedRunnerHistory(root, 'capacity-history', [0])).retainedEvidence;
    const observations = [];
    for (const [count, required] of [[55, 64], [56, 65], [57, 66]]) {
      const retained = clone(history);
      retained.currentRun = Array.from({ length: count }, () => clone(history.currentRun[0]));
      const input = seededRunnerInput(root, retained);
      assert.equal(rawSourceCount(input), required - 2);
      const probe = await probeRetainedAdmission(root, retained, true);
      assert.ok(probe.checkpoint.calls.includes('claim'), 'acquired sources fit before completion reservation');
      assert.deepEqual(probe.inputs[0], input);
      assert.equal(probe.result.reason, required === 64 ? 'cancelled' : 'evidence-incomplete');
      if (required === 64) {
        assert.deepEqual(probe.kinds, ['assessment', 'specialist-pair']);
        assert.equal(focusedRunnerAcceptedState(probe.result).overallUsed, 1);
      } else {
        assert.deepEqual(probe.kinds, ['assessment'], 'no specialist dispatch without completion headroom');
        assert.deepEqual(probe.result.capacity, {
          budget: 'source-entries', limit: 64, required,
          source: required === 65 ? 'review' : 'verification', target: canonicalTarget(TARGET),
        });
        assert.deepEqual(focusedRunnerAcceptedState(probe.result), emptyState('autonomous'));
      }
      observations.push({ budget: 'mandatory-source-entries', required, reason: probe.result.reason });
    }
    const excessive = clone(history);
    excessive.currentRun = Array.from({ length: 58 }, () => clone(history.currentRun[0]));
    let reads = 0;
    Object.defineProperty(excessive.currentRun[0], 'bytes', {
      enumerable: true, get() { reads += 1; throw new Error('source body must not be acquired'); },
    });
    const overflow = await probeRetainedAdmission(root, excessive);
    assert.deepEqual(overflow.result.capacity, {
      budget: 'source-entries', limit: 64, required: 65, source: 'verification', target: canonicalTarget(TARGET),
    });
    assert.equal(reads, 0, 'original acquisition count precedes capture bodies');
    assert.deepEqual(overflow.checkpoint.calls, []);
    assert.deepEqual(overflow.kinds, []);

    for (const [count, required] of [[52, 63], [53, 64], [54, 65]]) {
      const retained = clone(history);
      retained.lint = sealedTransportInput({
        lane: { kind: 'lightweight' },
        lint: Array.from({ length: count }, (_, index) => sealedCapture(TARGET, 'passed', [{ fixture: index }])),
      }).lint;
      const input = seededRunnerInput(root, retained);
      const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
      assert.equal(inspection.items.length + 2, required);
      assert.equal(rawSourceCount(input) + 2, required - 1, 'source capacity does not mask descriptor capacity');
      const probe = await probeRetainedAdmission(root, retained, true);
      assert.equal(probe.result.reason, required <= 64 ? 'cancelled' : 'evidence-incomplete');
      if (required <= 64) assert.deepEqual(probe.kinds, ['assessment', 'specialist-pair']);
      else {
        assert.deepEqual(probe.kinds, ['assessment']);
        assert.deepEqual(probe.result.capacity, {
          budget: 'retained-descriptors', limit: 64, required: 65,
          source: 'model-packet', target: canonicalTarget(TARGET),
        });
        assert.deepEqual(focusedRunnerAcceptedState(probe.result), emptyState('autonomous'));
      }
      observations.push({ budget: 'mandatory-retained-descriptors', required, reason: probe.result.reason });
    }
    for (const count of [55, 56]) {
      const retained = clone(history);
      retained.lint = sealedTransportInput({
        lane: { kind: 'lightweight' },
        lint: Array.from({ length: count }, (_, index) => sealedCapture(TARGET, 'passed', [{ fixture: index }])),
      }).lint;
      const probe = await probeRetainedAdmission(root, retained);
      assert.equal(probe.result.reason, count === 55 ? 'cancelled' : 'evidence-incomplete');
      if (count === 56) {
        assert.deepEqual(probe.result.capacity, {
          budget: 'retained-descriptors', limit: 64, required: 65, source: 'session', target: null,
        });
        assert.deepEqual(probe.checkpoint.calls, []);
      } else assert.equal(probe.inputs[0].lint.length, 55);
    }
    context.diagnostic(canonicalJson({ seededHistoryAccounting: observations }));
  });
});

/** Synthetic boundary padding in the existing excluded presentation field. @param {Record<string, unknown>} entry @param {number} byteLength */
function sizedRetainedPresentation(entry, byteLength) {
  const body = JSON.parse(Buffer.from(entry.bytes.base64, 'base64'));
  body.records[0].presentation = { summary: '' };
  const base = Buffer.byteLength(canonicalJson(body));
  assert.ok(byteLength >= base);
  body.records[0].presentation.summary = 'x'.repeat(byteLength - base);
  const bytes = Buffer.from(canonicalJson(body));
  assert.equal(bytes.byteLength, byteLength);
  return { ...clone(entry), bytes: { base64: bytes.toString('base64') } };
}

nodeTest('Feature 060 T001: seeded original bytes retain exact individual and aggregate body ceilings', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const history = (await observedRunnerHistory(root, 'body-history', [0])).retainedEvidence;
    const retained = clone(history);
    retained.currentRun[0] = sizedRetainedPresentation(history.currentRun[0], 1_048_576);
    const exact = await probeRetainedAdmission(root, retained);
    assert.equal(exact.result.reason, 'cancelled');
    assert.deepEqual(exact.inputs[0].currentRun[0], retained.currentRun[0]);
    retained.currentRun[0] = sizedRetainedPresentation(history.currentRun[0], 1_048_577);
    const excessive = await probeRetainedAdmission(root, retained);
    assert.deepEqual(excessive.result.capacity, {
      budget: 'source-body-bytes', limit: 1_048_576, required: 1_048_577,
      source: 'current-run', target: canonicalTarget(TARGET),
    });
    assert.deepEqual(excessive.checkpoint.calls, []);

    const aggregate = clone(history);
    aggregate.currentRun = Array.from({ length: 4 }, () => clone(history.currentRun[0]));
    const input = seededRunnerInput(root, aggregate);
    const workspaceBytes = [IDEA_PATH, TASKS_PATH, TARGET.specPath, TARGET.specPath.replace('/spec.md', '/plan.md')]
      .reduce((total, relative) => total + fs.statSync(path.join(root, relative)).size, 0);
    const otherBytes = RETAINED_STREAMS.flatMap(field => input[field])
      .slice(aggregate.currentRun.length)
      .reduce((total, entry) => total + Buffer.from(entry.bytes.base64, 'base64').byteLength, 0);
    const totalCurrent = 4_194_304 - workspaceBytes - otherBytes;
    const base = Math.floor(totalCurrent / 4);
    aggregate.currentRun = aggregate.currentRun.map((entry, index) => sizedRetainedPresentation(
      entry, base + (index < totalCurrent % 4 ? 1 : 0),
    ));
    const aggregateInput = seededRunnerInput(root, aggregate);
    const bodyBytes = RETAINED_STREAMS.flatMap(field => aggregateInput[field])
      .reduce((total, entry) => total + Buffer.from(entry.bytes.base64, 'base64').byteLength, 0);
    assert.equal(workspaceBytes + bodyBytes, 4_194_304);
    const admitted = await probeRetainedAdmission(root, aggregate);
    assert.equal(admitted.result.reason, 'cancelled', admitted.result.detail);
    assert.deepEqual(admitted.inputs[0].currentRun.slice(0, 4), aggregate.currentRun);
    const last = aggregate.currentRun.at(-1);
    aggregate.currentRun[3] = sizedRetainedPresentation(last, Buffer.from(last.bytes.base64, 'base64').byteLength + 1);
    const refused = await probeRetainedAdmission(root, aggregate);
    assert.deepEqual(refused.result.capacity, {
      budget: 'inspection-body-bytes', limit: 4_194_304, required: 4_194_305,
      source: 'verification', target: canonicalTarget(TARGET),
    });
    assert.deepEqual(refused.checkpoint.calls, []);
  });
});

nodeTest('Feature 060 T001: seeded model packets admit exactly 131072 bytes and refuse 131073 before ownership', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    fs.writeFileSync(path.join(root, IDEA_PATH),
      fs.readFileSync(path.join(root, IDEA_PATH), 'utf8').replace('- 2026-08-10 exact owner event', ''));
    const history = (await observedRunnerHistory(root, 'packet-history', [0])).retainedEvidence;
    let length = 110_000;
    let retained;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      retained = clone(history);
      retained.lint = sealedTransportInput({
        lane: { kind: 'lightweight' }, lint: [sealedCapture(TARGET, 'passed', [{ padding: 'x'.repeat(length) }])],
      }).lint;
      const measured = await measurePrivateModelView(seededRunnerInput(root, retained));
      if (measured.modelBytes === 131_072) break;
      length += 131_072 - measured.modelBytes;
    }
    const exact = await measurePrivateModelView(seededRunnerInput(root, retained));
    assert.equal(exact.modelBytes, 131_072);
    assert.equal(exact.inspection.overflow, false);
    const admitted = await probeRetainedAdmission(root, retained);
    assert.equal(admitted.result.reason, 'cancelled');
    retained.lint[0] = changedRetainedCapture(retained.lint[0], body => { body.records[0].substantive.padding += 'x'; });
    const extra = await measurePrivateModelView(seededRunnerInput(root, retained));
    assert.equal(extra.modelBytes, 131_073);
    assert.equal(extra.inspection.overflow, true);
    const refused = await probeRetainedAdmission(root, retained);
    assert.equal(refused.result.reason, 'evidence-incomplete');
    assert.deepEqual(refused.result.blocker, extra.inspection.blockers[0], 'existing blocker precedence is unchanged');
    assert.equal(refused.result.haltReport.evidenceHash, extra.inspection.evidenceHash);
    assert.deepEqual(refused.checkpoint.calls, []);
  });
});

nodeTest('Feature 060 T001: seeded lane-first and receipt predictions match the runner original-source layout', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const history = (await observedRunnerHistory(root, 'footprint-history', [0])).retainedEvidence;
    const files = [IDEA_PATH, TASKS_PATH, TASK_STATE_PATH, TARGET.specPath, TARGET.specPath.replace('/spec.md', '/plan.md')];
    const preparations = [];
    const applications = [];
    let assessment;
    let dispatched = false;
    const request = focusedRunnerRequest(root, { retainedEvidence: history });
    delete request.assessment;
    delete request.specialistResult;
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port,
      runtime: {
        identity: sha256('seeded-footprint-runtime'),
        invoke(command, lowLevelRequest) {
          if (lowLevelRequest.mode === 'prepare-projection') {
            preparations.push({
              request: clone(lowLevelRequest),
              files: files.map(relative => [relative, fs.readFileSync(path.join(root, relative))]),
            });
          }
          const value = runCommand(command, lowLevelRequest);
          if (lowLevelRequest.mode === 'commit-lane-receipt') {
            applications.at(-1).receipt = { request: clone(lowLevelRequest), inspection: clone(value.inspection) };
          }
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('seeded-footprint-lane'),
        apply(application) {
          const preparation = preparations.at(-1);
          const applied = applyLightweightWorkRequest(application);
          assert.equal(applied.ok, true, canonicalJson(applied));
          const inspection = runCommand('inspect', {
            trigger: 'explicit-inspection', input: preparation.request.input,
          }).inspection;
          assert.deepEqual(inspection.blockers, [], 'lane-first Inspection is still legitimate');
          applications.push({ preparation, inspection });
          return applied;
        },
      },
      exchange(challenge) {
        if (challenge.kind === 'assessment') {
          if (dispatched) return focusedCancelResponse(challenge);
          assessment = focusedChallengeAssessment(challenge);
          return focusedChallengeResponse(challenge, 'assessment', assessment);
        }
        dispatched = true;
        return focusedChallengeResponse(challenge, 'specialistResult',
          focusedSpecialistPair(assessment, 'seeded-footprint', 'rejected'));
      },
    });
    assert.equal(result.reason, 'cancelled', result.detail ?? result.reason);
    assert.equal(applications.length, 2);
    for (const [index, application] of applications.entries()) {
      const { preparation, inspection, receipt } = application;
      const before = preparation.request.input;
      assert.deepEqual(before.currentRun.slice(0, -1), history.currentRun);
      assert.deepEqual(receipt.request.input.currentRun.slice(0, -1), history.currentRun);
      assert.equal(before.currentRun.length, history.currentRun.length + 1);
      assert.equal(receipt.request.input.currentRun.length, before.currentRun.length);
      assert.equal(rawSourceCount(before), rawSourceCount(receipt.request.input));
      assert.equal(JSON.parse(Buffer.from(before.currentRun.at(-1).bytes.base64, 'base64')).records.length, index);
      assert.equal(JSON.parse(Buffer.from(receipt.request.input.currentRun.at(-1).bytes.base64, 'base64')).records.length, index + 1);
      await withSealedWorkspace(async measurementRoot => {
        for (const [relative, bytes] of preparation.files) {
          fs.mkdirSync(path.dirname(path.join(measurementRoot, relative)), { recursive: true });
          fs.writeFileSync(path.join(measurementRoot, relative), bytes);
        }
        const predicted = await measurePrivatePreflight({
          state: preparation.request.state,
          input: { ...before, root: measurementRoot },
          batch: preparation.request.projectionBatch,
          laneBinding: {
            lanePrestate: preparation.request.lanePrestate,
            targetMapping: preparation.request.targetMapping,
            operationTime: preparation.request.operationTime,
          },
        });
        assert.equal(predicted.capacity, null);
        assert.equal(predicted.result.transition.reason, 'projection-prepared');
        assert.deepEqual(predicted.measurements[1].inspection, inspection);
        assert.deepEqual(predicted.measurements[2].inspection, receipt.inspection);
        assert.equal(predicted.measurements[1].modelBytes, Buffer.byteLength(canonicalJson(modelPacket(inspection))));
        assert.equal(predicted.measurements[2].modelBytes, Buffer.byteLength(canonicalJson(modelPacket(receipt.inspection))));
      });
    }
  });
});

nodeTest('Feature 060 T001: foreground JSON accepts retained inputs without changing the one-megabyte request ceiling', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const history = (await observedRunnerHistory(root, 'cli-history', [0])).retainedEvidence;
    const request = focusedRunnerRequest(root, { retainedEvidence: history });
    request.assessment.evidenceHash = runCommand('inspect', {
      trigger: 'explicit-inspection', input: seededRunnerInput(root, history),
    }).inspection.evidenceHash;
    const text = canonicalJson(request);
    const exact = `${text}${' '.repeat(1_048_576 - Buffer.byteLength(text))}`;
    assert.equal(Buffer.byteLength(exact), 1_048_576);
    withTemporaryRoot(temporary => {
      const run = input => spawnSync(process.execPath, [
        fileURLToPath(new URL('./host-adapter-runner.mjs', import.meta.url)),
      ], {
        input, encoding: 'utf8', env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      });
      const before = laneSurfaceDigests(root);
      const refused = run(`${exact} \n`);
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /request must contain 1 through 1048576 bytes/);
      assert.equal(refused.stdout, '');
      assert.deepEqual(laneSurfaceDigests(root), before);
      const accepted = run(`${exact}\n`);
      assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
      const result = JSON.parse(accepted.stdout.trim());
      assert.equal(result.reason, 'task-settled');
      assert.equal(focusedRunnerAcceptedState(result).overallUsed, 1);
      assert.equal(focusedRunnerAcceptedState(result).completed.length, 1);
      assert.equal(t003ParsedTargetTask(root, TARGET).glyph, 'x');
    });
  });
});

nodeTest('Feature 060 T003: authorization preserves the runtime occurrence-retention blocker without changing accepted authority', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    await observedRunnerHistory(root, 't003-blocker-history', [0]);
    const input = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' }));
    const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
    assert.deepEqual(inspection.blockers, [], 'the missing dual retention is an authorization check');
    const assessment = focusedChallengeAssessment({ inspection });
    validateAssessment(TARGET, inspection, assessment);
    const state = emptyState('autonomous');
    const direct = runCommand('authorize', { trigger: 'resume', state, input, assessment, mode: 'ordinary' });
    const blocker = {
      code: 'evidence-incomplete',
      subject: 'occurrence-retention',
      evidenceHash: inspection.evidenceHash,
    };
    assert.equal(direct.authorization.authorized, false);
    assert.equal(direct.authorization.reason, blocker.code);
    assert.deepEqual(direct.authorization.blocker, blocker);

    const adapter = createHostAdapter(sealedInitial({
      state, inspectionIdentity: sha256(canonicalJson(inspection)),
    }));
    const before = adapter.snapshot();
    const files = feature060Preimages(root);
    const result = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
      authorization: { input, assessment },
    }));
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, blocker.code);
    assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before));
    assert.equal(result.session.pendingEffect, null);
    assert.equal(result.session.correction, null);
    assert.deepEqual(feature060Preimages(root), files);
    assert.deepEqual(result.blocker, blocker);
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.deepEqual(describeUnattendedHalt({
      state: result.session.acceptedState, reason: result.reason, blocker: result.blocker,
    }, inspection), {
      halted: true, resolved: true, reason: blocker.code, stopClass: 'hard-stop',
      target: canonicalTarget(TARGET), subject: blocker.subject,
      nextAction: 'request-human-input', evidenceHash: inspection.evidenceHash,
    });
    assert.equal(Object.hasOwn(result.session, 'blocker'), false);
    assert.equal(Object.hasOwn(result.session.acceptedState, 'blocker'), false);
  });
});

nodeTest('Feature 060 T003: the runner carries a late occurrence-retention refusal into its step and terminal report', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const clean = feature060Preimages(root);
    await observedRunnerHistory(root, 't003-late-history', [0]);
    const historical = feature060Preimages(root);
    for (const relative of [TASKS_PATH, TASK_STATE_PATH]) {
      fs.writeFileSync(path.join(root, relative), clean[relative]);
    }
    const request = focusedRunnerRequest(root);
    delete request.assessment;
    delete request.specialistResult;
    const checkpoint = memoryCheckpointStore();
    const observations = [];
    const kinds = [];
    const result = await runHostAdapter(request, {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('t003-late-history-runtime'),
        invoke(command, lowLevelRequest) {
          if (observations.length === 0) {
            // Fixture history arrives after pre-claim inspection. Its original
            // captures exist but are not part of this invocation's handoff.
            assert.equal(command, 'inspect');
            for (const relative of [TASKS_PATH, TASK_STATE_PATH]) {
              fs.writeFileSync(path.join(root, relative), historical[relative]);
            }
          }
          const value = runCommand(command, lowLevelRequest);
          observations.push({ command, value: clone(value) });
          return { status: 'returned', value };
        },
      },
      exchange(challenge) {
        kinds.push(challenge.kind);
        assert.equal(challenge.kind, 'assessment', 'no specialist dispatch on refusal');
        return focusedChallengeResponse(challenge, 'assessment', focusedChallengeAssessment(challenge));
      },
    });
    const last = observations.at(-1);
    assert.equal(last.command, 'authorize');
    assert.equal(last.value.authorization.reason, 'evidence-incomplete');
    assert.equal(last.value.authorization.blocker.subject, 'occurrence-retention');
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, last.value.authorization.reason);
    assert.deepEqual(result.blocker, last.value.authorization.blocker);
    assert.deepEqual(result.steps.at(-1).blocker, result.blocker);
    assert.deepEqual(result.haltReport, describeUnattendedHalt(
      last.value.authorization, last.value.inspection,
    ));
    assert.equal(result.haltReport.subject, 'occurrence-retention');
    assert.equal(result.haltReport.nextAction, 'request-human-input');
    assert.equal(result.haltReport.evidenceHash, last.value.inspection.evidenceHash);
    assert.deepEqual(focusedRunnerAcceptedState(result), request.state);
    assert.equal(result.acceptedRevision, 0);
    assert.deepEqual(kinds, ['assessment']);
    assert.deepEqual(feature060Preimages(root), historical);
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.equal(checkpoint.calls.filter(call => call === 'claim').length, 1);
    assert.equal(checkpoint.calls.includes('clear'), false, 'a hard stop grants no cleanup');
    assert.equal(canonicalJson(checkpoint.pair).includes('"blocker"'), false);
  });
});

nodeTest('Feature 060 T003: blocker shape and reason are closed while capacity remains independent', () => {
  withSealedWorkspace(root => {
    const input = sealedTransportInput(sealedInspectionInput(root, {
      policyMode: 'autonomous',
      currentRun: feature061RepeatedCapture(TARGET, 59, 't003-headroom'),
    }));
    const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
    const assessment = focusedChallengeAssessment({ inspection });
    const adapter = createHostAdapter(sealedInitial({ state: emptyState('autonomous') }));
    const active = adapter.snapshot();
    const result = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
      authorization: { input, assessment },
    }));
    const direct = runCommand('authorize', {
      trigger: 'resume', state: active.acceptedState, input, assessment, mode: 'ordinary',
    }).authorization;
    assert.equal(result.outcome, 'hard-stop');
    assert.deepEqual(result.blocker, direct.blocker);
    assert.deepEqual(result.capacity, direct.capacity);
    assert.equal(result.capacity.budget, 'source-entries');
    assert.equal(result.capacity.required, 65);
    assert.equal(result.blocker.evidenceHash, inspection.evidenceHash);
    assert.doesNotThrow(() => validateHostAdapterResult(result));
    const { blocker, ...capacityOnly } = result;
    const { capacity, ...blockerOnly } = result;
    assert.doesNotThrow(() => validateHostAdapterResult(capacityOnly));
    assert.doesNotThrow(() => validateHostAdapterResult(blockerOnly));
    for (const [label, bad] of [
      ['null', null],
      ['missing field', { code: blocker.code, subject: blocker.subject }],
      ['unknown code', { ...blocker, code: 'T003_UNTRUSTED_CODE' }],
      ['mismatching reason', { ...blocker, code: 'approval-required' }],
      ['invalid subject', { ...blocker, subject: 'bad\u0001subject' }],
      ['invalid evidence hash', { ...blocker, evidenceHash: 'not-a-hash' }],
      ['unknown field', { ...blocker, T003_UNTRUSTED_FIELD: 'not diagnostic authority' }],
    ]) {
      assert.throws(() => validateHostAdapterResult({ ...result, blocker: bad }), TypeError, label);
    }
    let reads = 0;
    const accessor = { ...blocker };
    Object.defineProperty(accessor, 'subject', { enumerable: true, get() { reads += 1; return 'untrusted'; } });
    assert.throws(() => validateHostAdapterResult({ ...result, blocker: accessor }), TypeError);
    assert.equal(reads, 0);
    const accepted = { version: 1, outcome: 'accepted', reason: 'inspection-refreshed', session: active };
    assert.doesNotThrow(() => validateHostAdapterResult(accepted));
    assert.throws(() => validateHostAdapterResult({ ...accepted, blocker }), /unknown field/);
  });
});

nodeTest('Feature 060 T003: foreign runtime blockers and stale evidence never become accepted diagnostic facts', () => {
  withSealedWorkspace(root => {
    const input = sealedTransportInput(sealedInspectionInput(root, { policyMode: 'autonomous' }));
    const prior = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
    fs.appendFileSync(path.join(root, TASKS_PATH), '\nCurrent fixture evidence.\n');
    const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
    assert.notEqual(inspection.evidenceHash, prior.evidenceHash);
    const assessment = focusedChallengeAssessment({ inspection }, { intent: 'changed' });
    const state = emptyState('autonomous');
    const request = { trigger: 'resume', state, input, assessment, mode: 'ordinary' };
    const current = runCommand('authorize', request);
    assert.equal(current.authorization.reason, 'clarification-required');
    const foreign = runCommand('inspect', {
      trigger: 'explicit-inspection', input: { ...input, target: clone(SECOND_TARGET) },
    }).inspection;
    const attacks = [
      ['missing subject', response => { delete response.authorization.blocker.subject; }],
      ['unknown code', response => { response.authorization.blocker.code = 'T003_FOREIGN_CODE'; }],
      ['wrong reason', response => { response.authorization.blocker.code = 'evidence-incomplete'; }],
      ['foreign subject', response => { response.authorization.blocker.subject = 'T003_FOREIGN_SUBJECT'; }],
      ['wrong evidence', response => { response.authorization.blocker.evidenceHash = sha256('unrelated-evidence'); }],
      ['stale evidence', response => { response.authorization.blocker.evidenceHash = prior.evidenceHash; }],
      ['stale valid inspection', response => {
        response.inspection = prior;
        response.authorization.blocker.evidenceHash = prior.evidenceHash;
      }],
      ['foreign target', response => {
        response.inspection = foreign;
        response.authorization.blocker.evidenceHash = foreign.evidenceHash;
      }],
      ['unknown field', response => { response.authorization.blocker.T003_FOREIGN_FIELD = 'untrusted'; }],
    ];
    for (const [label, mutate] of attacks) {
      const runtime = sealedPorts((command, lowLevelRequest) => {
        const response = runCommand(command, lowLevelRequest);
        mutate(response);
        assert.throws(() => validateRecoveryRuntimeResultV1(command, lowLevelRequest, response),
          /must equal the recovery-owned result/, label);
        return { status: 'returned', value: response };
      });
      const adapter = createHostAdapter(sealedInitial({
        state, inspectionIdentity: sha256(canonicalJson(inspection)),
      }), runtime);
      const before = adapter.snapshot();
      const result = adapter.run(sealedRequest(adapter, 'authorize-attempt', {
        authorization: { input, assessment },
      }));
      assert.equal(result.outcome, 'closed-refusal', label);
      assert.equal(result.reason, 'runtime-result-not-authoritative', label);
      assert.deepEqual(acceptedAuthorityTuple(result.session), acceptedAuthorityTuple(before), label);
      assert.equal(Object.hasOwn(result, 'blocker'), false, label);
      assert.equal(Object.hasOwn(result, 'capacity'), false, label);
      assert.equal(canonicalJson(result).includes('T003_FOREIGN'), false, label);
    }
    // Current operation evidence is valid even when the session's last explicit
    // Inspection identity differs. It must not bind to that older identity.
    const adapter = createHostAdapter(sealedInitial({ state, inspectionIdentity: sha256('earlier-inspection') }));
    const result = adapter.run(sealedRequest(adapter, 'authorize-attempt', { authorization: { input, assessment } }));
    assert.equal(result.outcome, 'hard-stop');
    assert.deepEqual(result.blocker, current.authorization.blocker);
    assert.equal(result.blocker.evidenceHash, inspection.evidenceHash);
  });
});

nodeTest('Feature 060 T003: runner headroom refusal preserves both the blocker and its independent capacity diagnostic', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const input = sealedTransportInput(sealedInspectionInput(root, {
      currentRun: feature061RepeatedCapture(TARGET, 58, 't003-runner-headroom'),
    }));
    const retained = Object.fromEntries(RETAINED_STREAMS.map(field => [field, input[field]]));
    const before = canonicalJson(retained);
    const probe = await probeRetainedAdmission(root, retained, true);
    const result = probe.result;
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'evidence-incomplete');
    assert.deepEqual(result.capacity, {
      budget: 'source-entries', limit: 64, required: 65, source: 'review', target: canonicalTarget(TARGET),
    });
    const inspection = runCommand('inspect', {
      trigger: 'explicit-inspection', input: probe.inputs.at(-1),
    }).inspection;
    assert.deepEqual(result.blocker, {
      code: 'evidence-incomplete', subject: 'capacity:source-entries:review:65', evidenceHash: inspection.evidenceHash,
    });
    assert.deepEqual(result.steps.at(-1).blocker, result.blocker);
    assert.deepEqual(result.steps.at(-1).capacity, result.capacity);
    assert.equal(result.haltReport.subject, result.blocker.subject);
    assert.equal(result.haltReport.evidenceHash, inspection.evidenceHash);
    assert.equal(result.haltReport.nextAction, 'request-human-input');
    assert.deepEqual(focusedRunnerAcceptedState(result), emptyState('autonomous'));
    assert.deepEqual(probe.kinds, ['assessment']);
    assert.equal(canonicalJson(retained), before);
  });
});

nodeTest('Feature 060 T003: early source refusals preserve bound facts through the runner and foreground CLI without a claim', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const retained = (await observedRunnerHistory(root, 't003-early-history', [0])).retainedEvidence;
    const original = canonicalJson(retained);
    const files = feature060Preimages(root);
    for (const field of ['currentRun', 'verification', 'review']) {
      const incomplete = { ...clone(retained), [field]: [] };
      const probe = await probeRetainedAdmission(root, incomplete);
      const result = probe.result;
      assert.equal(result.reason, 'evidence-incomplete', field);
      assert.equal(result.blocker.subject, 'occurrence-retention', field);
      assert.equal(result.haltReport.subject, result.blocker.subject, field);
      assert.equal(result.haltReport.evidenceHash, result.blocker.evidenceHash, field);
      assert.equal(result.detail, `retainedEvidence: missing ${field === 'currentRun' ? 'current-run' : field}`);
      assert.deepEqual(probe.checkpoint.calls, [], field);
      assert.deepEqual(probe.inputs, [], field);
      assert.deepEqual(probe.kinds, [], field);
      assert.deepEqual(focusedRunnerAcceptedState(result), emptyState('autonomous'), field);
      assert.equal(Object.hasOwn(result, 'capacity'), false, field);
    }
    const temp = fs.mkdtempSync(path.join(root, 't003-cli-'));
    const execution = await runFocusedRunnerCli(focusedRunnerRequest(root), () => {
      assert.fail('missing sources must refuse before a challenge');
    }, { env: { TMPDIR: temp, TMP: temp, TEMP: temp } });
    assert.equal(execution.code, 1);
    assert.equal(execution.stderr, '');
    assert.equal(execution.rows.length, 1);
    const terminal = execution.rows[0];
    assert.equal(terminal.outcome, 'hard-stop');
    assert.equal(terminal.reason, 'evidence-incomplete');
    assert.equal(terminal.detail, 'retainedEvidence: missing current-run');
    assert.equal(terminal.blocker.subject, 'occurrence-retention');
    assert.equal(terminal.haltReport.subject, terminal.blocker.subject);
    assert.equal(terminal.haltReport.evidenceHash, terminal.blocker.evidenceHash);
    assert.equal(terminal.haltReport.nextAction, 'request-human-input');
    assert.equal(terminal.hostRevision, 0);
    assert.equal(terminal.acceptedRevision, 0);
    assert.deepEqual(fs.readdirSync(temp), [], 'pre-claim refusal creates no checkpoint files');
    assert.deepEqual(feature060Preimages(root), files);
    assert.equal(canonicalJson(retained), original);
  });
});

nodeTest('Feature 060 T003: descriptor-only evidence is current while unvalidated or unavailable evidence stays unresolved', async () => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root);
    const priorHash = request.assessment.evidenceHash;
    fs.appendFileSync(path.join(root, TASKS_PATH), 'x'.repeat(131_072));
    const inspection = runCommand('inspect', {
      trigger: 'explicit-inspection', input: sealedInspectionInput(root, { policyMode: 'autonomous' }),
    }).inspection;
    assert.equal(inspection.overflow, true);
    const checkpoint = memoryCheckpointStore();
    const result = await runHostAdapter(request, { checkpoint: checkpoint.port });
    assert.equal(result.reason, 'evidence-incomplete');
    assert.deepEqual(result.blocker, inspection.blockers[0]);
    assert.equal(result.haltReport.evidenceHash, inspection.evidenceHash);
    assert.notEqual(result.haltReport.evidenceHash, priorHash);
    assert.ok(inspection.blockers.some(blocker => blocker.subject === 'model-packet'));
    assert.equal(result.haltReport.subject, inspection.blockers[0].subject, 'keep the runtime blocker order');
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.deepEqual(checkpoint.calls, []);
  });
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const request = focusedRunnerRequest(root, {
      retainedEvidence: { currentRun: [{ bytes: { base64: '?' } }], verification: [], review: [], lint: [] },
    });
    const checkpoint = memoryCheckpointStore();
    const result = await runHostAdapter(request, { checkpoint: checkpoint.port });
    assert.equal(result.reason, 'evidence-incomplete');
    assert.equal(Object.hasOwn(result, 'blocker'), false);
    assert.deepEqual(result.haltReport, { halted: true, resolved: false, unresolved: ['target', 'subject'] });
    assert.deepEqual(checkpoint.calls, []);
  });
  for (const mode of ['stale-inspection', 'foreign-inspection', 'accessor', 'unknown-field', 'exception']) {
    await withSealedWorkspace(async root => {
      writeSealedTaskState(root);
      const prior = runCommand('inspect', {
        trigger: 'explicit-inspection', input: sealedInspectionInput(root, { policyMode: 'autonomous' }),
      }).inspection;
      fs.appendFileSync(path.join(root, TASKS_PATH), '\nCurrent fixture evidence.\n');
      let calls = 0;
      let reads = 0;
      const request = focusedRunnerRequest(root);
      const result = await runHostAdapter(request, {
        checkpoint: memoryCheckpointStore().port,
        runtime: {
          identity: sha256(`t003-observation:${mode}`),
          invoke(command, lowLevelRequest) {
            calls += 1;
            const value = runCommand(command, lowLevelRequest);
            if (calls === 1) return { status: 'returned', value };
            assert.equal(command, 'inspect');
            if (mode === 'exception') throw new Error('T003_PRIVATE_EXCEPTION');
            if (mode === 'stale-inspection') {
              assert.notEqual(value.inspection.evidenceHash, prior.evidenceHash);
              value.inspection = prior;
            } else if (mode === 'foreign-inspection') {
              value.inspection = runCommand(command, {
                ...lowLevelRequest, input: { ...lowLevelRequest.input, target: clone(SECOND_TARGET) },
              }).inspection;
            } else if (mode === 'accessor') {
              Object.defineProperty(value, 'inspection', {
                enumerable: true,
                get() { reads += 1; throw new Error('T003_PRIVATE_ACCESSOR'); },
              });
            } else {
              value.inspection.T003_PRIVATE_FIELD = 'not trusted evidence';
            }
            return { status: 'returned', value };
          },
        },
        exchange() { assert.fail('a rejected fresh Inspection must not dispatch'); },
      });
      assert.equal(result.outcome, 'hard-stop', mode);
      assert.equal(result.reason, 'inspection-incomplete', mode);
      assert.equal(result.haltReport.resolved, false, mode);
      assert.equal(Object.hasOwn(result.haltReport, 'evidenceHash'), false, mode);
      assert.equal(Object.hasOwn(result, 'blocker'), false, mode);
      assert.equal(Object.hasOwn(result, 'capacity'), false, mode);
      assert.equal(canonicalJson(result).includes('T003_PRIVATE'), false, mode);
      assert.equal(reads, 0, mode);
      assert.equal(calls, 2, mode);
      assert.deepEqual(focusedRunnerAcceptedState(result), request.state, mode);
    });
  }
});

nodeTest('Feature 060 T003: a synthetic non-overflow governance refusal preserves known facts without authorizing a retry', async context => {
  await withSealedWorkspace(async root => {
    writeSealedTaskState(root);
    const required = requiredGovernanceFixture(root);
    // Synthetic contract case: retain complete occurrence proof but omit the
    // governance projection. This is not the unavailable historical 062 preimage.
    const occurrences = required.governedEvents.filter(event => event.type.endsWith('occurrence'));
    const input = sealedRetentionInput(root, occurrences, occurrences, required.streams);
    const sized = sizedHostPacketInput(input, 131_020);
    const runtime = runCommand('transition', {
      mode: 'resume-governance', state: required.state, input: sized,
    });
    assert.equal(feature029PacketBytes(runtime.inspection), 131_020);
    assert.equal(runtime.inspection.overflow, false);
    assert.deepEqual(runtime.inspection.blockers, []);
    assert.equal(inspectRetainedOccurrencesV2(runtime.inspection).blocker, null);
    assert.equal(runtime.transition.reason, 'governance-unresolved');
    const files = feature060Preimages(root);
    const adapter = createHostAdapter(sealedInitial({ state: required.state }));
    const before = adapter.snapshot();
    const refused = adapter.run(sealedRequest(adapter, 'advance-governance', {
      governance: { action: 'resume-learning', input: sized },
    }));
    assert.equal(refused.outcome, 'hard-stop');
    assert.equal(refused.reason, runtime.transition.reason);
    assert.deepEqual(acceptedAuthorityTuple(refused.session), acceptedAuthorityTuple(before));
    assert.equal(refused.session.correction, null);
    assert.equal(refused.session.pendingEffect, null);
    assert.equal(Object.hasOwn(refused, 'capacity'), false);
    assert.equal(Object.hasOwn(refused, 'blocker'), false);
    // Keep the closed report classifications. The raw reason and accepted
    // governance phase remain known; no supported causing subject is invented.
    const unresolved = { halted: true, resolved: false, unresolved: ['reason', 'subject'] };
    assert.deepEqual(describeUnattendedHalt(runtime.transition, runtime.inspection), unresolved);

    // The runner has no resume-learning intent. Exercise its supported review
    // route with the real reducer's still-unprojected state instead: that route
    // refuses an outstanding projection commitment, not a missing old snapshot.
    const initialState = required.unprojectedState;
    validateRunState(initialState);
    assert.ok(Object.hasOwn(initialState.learningGovernance, 'projectionCommitment'));
    const retainedEvidence = Object.fromEntries(RETAINED_STREAMS.map(field => [field, clone(input[field])]));
    const request = focusedRunnerRequest(root, { state: initialState, retainedEvidence });
    const kinds = [];
    const respond = challenge => {
      kinds.push(challenge.kind);
      assert.equal(challenge.kind, 'learning-review');
      return focusedChallengeResponse(challenge, 'review', governanceReview(initialState, 'selected-alternative').review);
    };
    const result = await runHostAdapter(request, {
      checkpoint: memoryCheckpointStore().port, exchange: respond,
    });
    context.diagnostic(JSON.stringify({
      syntheticRoute: 'review-learning', kinds, terminal: result.reason,
      operations: result.steps.map(step => ({ step: step.step, reason: step.reason })),
    }));
    assert.equal(result.outcome, 'hard-stop');
    assert.equal(result.reason, 'governance-unresolved');
    assert.equal(result.steps.at(-1).step, 'advance-governance:review-learning');
    assert.equal(result.steps.at(-1).reason, result.reason);
    assert.equal(result.acceptedRevision, 0);
    assert.deepEqual(focusedRunnerAcceptedState(result), initialState);
    assert.deepEqual(result.haltReport, unresolved);
    assert.equal(Object.hasOwn(result, 'capacity'), false);
    assert.equal(Object.hasOwn(result, 'blocker'), false);
    assert.deepEqual(kinds, ['learning-review']);
    const temp = fs.mkdtempSync(path.join(root, 't003-governance-cli-'));
    const execution = await runFocusedRunnerCli(request, respond, {
      env: { TMPDIR: temp, TMP: temp, TEMP: temp },
    });
    assert.equal(execution.code, 1);
    assert.equal(execution.stderr, '');
    const terminal = execution.rows.at(-1);
    assert.equal(terminal.reason, result.reason);
    assert.deepEqual(terminal.haltReport, unresolved);
    assert.deepEqual(focusedRunnerAcceptedState(terminal), initialState);
    assert.equal(Object.hasOwn(terminal, 'capacity'), false);
    assert.deepEqual(kinds, ['learning-review', 'learning-review']);
    assert.deepEqual(feature060Preimages(root), files);
    context.diagnostic('Synthetic contracts only: resume-learning packet=131020, overflow=false, missing governance projection; runner/CLI review-learning refuses an outstanding projection commitment without optional session padding. Historical 062 cause remains unisolated.');
  });
});
