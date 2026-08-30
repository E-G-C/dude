// @ts-check

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as nodeTest } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyLightweightWorkRequest } from '../dude-lightweight-execution/board.mjs';
import {
  approachHash,
  canonicalJson,
  canonicalTarget,
  capturedBytesV1,
  classifyOutcomeReason,
  contentDescriptor,
  inspect,
  modelPacket,
  normalizeIndependentReviewEnvelopeV2,
  normalizeVerificationEnvelopeV2,
  OUTCOME_REASON_CLASSES,
  runCommand,
  sha256,
  validateRunState,
} from './recovery.mjs';
import { buildSpecialistAttestation } from './specialist-attestation.mjs';
import * as hostAdapterModule from './host-adapter.mjs';
import { runHostAdapter } from './host-adapter-runner.mjs';

const {
  createHostAdapter: createAuthorizedHostAdapter,
  createTemporaryCheckpointStore,
  handoffHostWorker,
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
      ideaPath: '.dude/ideas/autonomous-runstate-continuity.md',
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
  const { verification, review, ...rest } = sealedInspectionInput(root, {
    policyMode: 'autonomous',
    ...overrides,
  });
  return sealedTransportInput(rest);
}

/** @param {(root:string)=>unknown} run */
function withSealedWorkspace(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-host-adapter-')));
  const ideaPath = '.dude/ideas/autonomous-runstate-continuity.md';
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
    const ideaPath = '.dude/ideas/autonomous-runstate-continuity.md';
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
 */
function sealedTrustedFixture(state, label, verdict = 'rejected') {
  const semantic = specialistResult(label, verdict);
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
    if (pair.claim === null || pair.checkpoint === null) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'partial-artifacts') };
    }
    const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
    if (current.invocationIdentity !== worker.invocationIdentity
      || current.workerToken !== worker.workerToken
      || current.workerGeneration !== worker.workerGeneration) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'worker-not-active') };
    }
    if (current.acceptedRevision !== expected.acceptedRevision || current.hostRevision !== expected.hostRevision) {
      return { version: 1, status: 'stale', checkpointKey: key, diagnostic: diagnostic(key, 'revision-mismatch') };
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
      pair.claim = {
        invocationIdentity: next.invocationIdentity,
        workerToken: next.workerToken,
        workerGeneration: next.workerGeneration,
        createdAt: next.createdAt,
      };
      pair.checkpoint = clone(next);
      return { version: 1, status: 'claimed', checkpointKey: key, record: clone(next) };
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
      return { version: 1, status: 'loaded', checkpointKey: key, record: clone(pair.checkpoint) };
    },
    update(binding, worker, expected, next) {
      const key = keyOf(binding);
      const fault = faulted('update', key);
      if (fault) return fault;
      const stale = ownershipFailure(worker, expected, key);
      if (stale) return stale;
      pair.checkpoint = clone(next);
      return { version: 1, status: 'updated', checkpointKey: key, record: clone(next) };
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
      return { version: 1, status: 'handed-off', checkpointKey: key, record: clone(next) };
    },
    clear(binding, worker, expectedHostRevision, reason) {
      const key = keyOf(binding);
      const fault = faulted('clear', key);
      if (fault) return fault;
      const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
      if (current && (current.workerToken !== worker.workerToken || current.hostRevision !== expectedHostRevision)) {
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

nodeTest('a failed clear reports a cleanup hard stop and keeps blocking replacement work', () => {
  withTemporaryRoot((root) => {
    const backing = createTemporaryCheckpointStore({ root });
    const worker = createHostAdapter(checkpointInitial(), {
      checkpoint: {
        ...backing,
        clear(binding, activeWorker, expectedHostRevision, reason) {
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
const IDEA_PATH = '.dude/ideas/autonomous-runstate-continuity.md';
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

nodeTest('a sole specialist result the builder refuses stops before any trusted capture', () => {
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
      assert.equal(refused.outcome, 'hard-stop', label);
      assert.equal(refused.reason, 'attempt-result-contract-mismatch', label);
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
            '.dude/ideas/autonomous-runstate-continuity.md',
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

  // Every one of the ten closed semantic operations composed exactly its documented
  // low-level owner. `apply-lane-effect` reaches no runtime route at all because its
  // only authority is the Lightweight lane owner module.
  assert.deepEqual(Object.fromEntries([...routes].map(([operation, log]) => [operation, [...new Set(log)]])), {
    none: [],
    'fresh-inspection': ['inspect:ordinary'],
    'authorize-attempt': ['transition:issue-attempt-permit', 'authorize:ordinary'],
    'record-attempt-result': ['complete:capture'],
    'prepare-authoritative-projection': ['transition:prepare-projection'],
    'settle-effect': ['complete:finalize', 'transition:verify-projection'],
    'audit-run': ['audit:ordinary'],
    'authorize-lane-effect': ['transition:issue-lane-permit'],
    'apply-lane-effect': [],
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

/** @param {Record<string, unknown>} challenge */
function focusedCancelResponse(challenge) {
  return {
    version: 1,
    type: 'cancel',
    challengeIdentity: challenge.challengeIdentity,
    kind: challenge.kind,
  };
}

const FEATURE_029_PACKET_BYTES = 65_536;

/**
 * Recreate the exact model-packet projection only to measure the immediately
 * larger owner suffix beside the real Inspection's other evidence.
 * @param {Record<string, unknown>} inspection
 * @param {Record<string, unknown>[]} [items]
 */
function feature029Packet(inspection, items = /** @type {Record<string, unknown>[]} */ (inspection.items)) {
  return {
    target: canonicalTarget(inspection.target),
    items: items
      .filter((item) => (
        !['missing', 'nontext', 'overflow'].includes(/** @type {string} */ (item.status))
        && Object.hasOwn(item, 'text')
      ))
      .map((item) => ({
        source: item.source,
        descriptor: {
          required: item.required,
          status: item.status,
          sha256: item.sha256,
          byteLength: item.byteLength,
        },
        text: item.text,
      })),
  };
}

/** @param {Record<string, unknown>} inspection @param {Record<string, unknown>[]} [items] */
function feature029PacketBytes(inspection, items) {
  return Buffer.byteLength(canonicalJson(feature029Packet(inspection, items)));
}

/** @param {string} root */
function writeFeature029OversizedOwnerLog(root) {
  const eventLines = Array.from({ length: 96 }, (_, index) => (
    `- 2026-08-10 owner event ${String(index + 1).padStart(3, '0')} ${'x'.repeat(720)}`
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
  assert.ok(packet.items.length <= 16, `${label}: packet remains within the item ceiling`);
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

  await withSealedWorkspace(async (root) => {
    // Arrange: two refusal pairs exercise two separate Inspection occurrences.
    // The finite script then lets the real authoritative lane boundary settle.
    writeSealedTaskState(root);
    const checkpoint = memoryCheckpointStore();
    const authoritativePrestate = {
      tasks: fs.readFileSync(path.join(root, TASKS_PATH)),
      taskState: fs.readFileSync(path.join(root, TASK_STATE_PATH)),
      owner: fs.readFileSync(path.join(root, IDEA_PATH)),
    };
    const workProjectRefusals = [
      {
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-runner-scripted-refusal:1'),
      },
      {
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-runner-scripted-refusal:2'),
      },
      {
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-runner-scripted-refusal:3'),
      },
      {
        ok: false,
        phase: 'refused',
        reason: 'expected-capture-mismatch',
        unchangedPrestateHash: sha256('focused-runner-scripted-refusal:4'),
      },
    ];
    const refusalRows = [];
    let activeInspectionIdentity = null;
    let delegatedWorkProjects = 0;

    // Act.
    const result = await runHostAdapter(focusedRunnerRequest(root), {
      checkpoint: checkpoint.port,
      runtime: {
        identity: sha256('focused-runner-scripted-refusal-runtime'),
        invoke(command, lowLevelRequest) {
          const value = /** @type {Record<string, unknown>} */ (runCommand(command, lowLevelRequest));
          if (command === 'inspect') {
            activeInspectionIdentity = sha256(canonicalJson(value.inspection));
          }
          return { status: 'returned', value };
        },
      },
      laneOwner: {
        identity: sha256('focused-runner-scripted-refusal-lane-owner'),
        apply(request) {
          if (request.operation === 'work-project' && workProjectRefusals.length > 0) {
            refusalRows.push({
              operation: request.operation,
              inspectionIdentity: activeInspectionIdentity,
              delegatedWorkProjects,
              authoritative: {
                tasks: fs.readFileSync(path.join(root, TASKS_PATH)),
                taskState: fs.readFileSync(path.join(root, TASK_STATE_PATH)),
                owner: fs.readFileSync(path.join(root, IDEA_PATH)),
              },
            });
            return workProjectRefusals.shift();
          }
          if (request.operation === 'work-project') delegatedWorkProjects += 1;
          return applyLightweightWorkRequest(request);
        },
      },
    });

    // Assert: four proven no-effect refusals cross the old fabricated terminal.
    assert.equal(
      `${result.outcome}/${result.reason}`,
      'ended/task-settled',
      'a fresh reinspection after each spent correction must continue to the scripted success',
    );
    assert.equal(result.haltReport, null, 'a settled run carries no halt report');
    assert.equal(
      result.steps.some((step) => step.reason === 'repeated-closed-refusal'),
      false,
      'no synthetic repeated-refusal terminal is emitted',
    );
    assert.equal(workProjectRefusals.length, 0, 'all four genuine refusals reached the real lane boundary');
    assert.equal(delegatedWorkProjects, 1, 'the fifth work-project call delegated to the real lane boundary');
    assert.equal(refusalRows.length, 4, 'exactly four no-effect lane refusals were observed');

    const refusalSteps = result.steps.filter((step) => step.outcome === 'closed-refusal'
      && step.reason === 'expected-capture-mismatch');
    assert.equal(refusalSteps.length, 4, 'each scripted refusal is retained in the runner result');
    assert.deepEqual(
      refusalSteps.map((step) => step.step.endsWith(':correction')),
      [false, true, false, true],
      'each Inspection occurrence receives exactly one immediate correction',
    );
    const correctionSteps = refusalSteps.filter((step) => step.step.endsWith(':correction'));
    assert.equal(correctionSteps.length, 2);
    for (const correction of correctionSteps) {
      const correctionIndex = result.steps.indexOf(correction);
      const preceding = result.steps[correctionIndex - 1];
      const reinspection = result.steps[correctionIndex + 1];
      assert.ok(preceding, 'the correction immediately follows its refusal');
      assert.ok(reinspection, 'the spent correction is followed by a fresh Inspection');
      assert.equal(preceding.outcome, 'closed-refusal');
      assert.equal(preceding.reason, 'expected-capture-mismatch');
      assert.equal(correction.step, `${preceding.step}:correction`);
      assert.equal(reinspection.step, `${preceding.step}:reinspect`);
      assert.equal(reinspection.outcome, 'accepted');
      assert.equal(reinspection.reason, 'inspection-refreshed');
    }

    for (const [index, row] of refusalRows.entries()) {
      assert.equal(row.operation, 'work-project', `refusal ${index + 1}`);
      assert.equal(row.delegatedWorkProjects, 0, `refusal ${index + 1} precedes every real lane effect`);
      assert.deepEqual(
        row.authoritative,
        authoritativePrestate,
        `refusal ${index + 1} leaves all authoritative lane surfaces byte-exact`,
      );
      assert.equal(typeof row.inspectionIdentity, 'string', `refusal ${index + 1} has a fresh Inspection`);
    }
    assert.equal(refusalRows[0].inspectionIdentity, refusalRows[1].inspectionIdentity);
    assert.notEqual(refusalRows[1].inspectionIdentity, refusalRows[2].inspectionIdentity);
    assert.equal(refusalRows[2].inspectionIdentity, refusalRows[3].inspectionIdentity);

    const acceptedAuthority = (step) => {
      const acceptedStateBytes = Buffer.from(step.stateBase64, 'base64').toString('utf8');
      const acceptedState = JSON.parse(acceptedStateBytes);
      return {
        ...acceptedAuthorityTuple({
          acceptedState,
          acceptedStateBytes,
          acceptedStateHash: step.stateHash,
          acceptedRevision: step.acceptedRevision,
        }),
        overallBudget: acceptedState.policy.overall,
        recoveryBudget: acceptedState.policy.recovery,
      };
    };
    const beforeFirstRefusal = acceptedAuthority(result.steps[result.steps.indexOf(refusalSteps[0]) - 1]);
    for (const [index, refusal] of refusalSteps.entries()) {
      const preserved = acceptedAuthority(refusal);
      assert.equal(preserved.acceptedStateHash, sha256(preserved.acceptedStateBytes), `refusal ${index + 1}`);
      assert.deepEqual(
        preserved,
        beforeFirstRefusal,
        `refusal ${index + 1} preserves accepted bytes, revision, tuples, and budgets`,
      );
    }

    assert.match(
      fs.readFileSync(path.join(root, TASKS_PATH), 'utf8'),
      new RegExp(`- \\[x\\] ${TARGET.taskKey}`),
      'the final real lane effect settles the task',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, TASK_STATE_PATH), 'utf8'))[TASKS_PATH].glyphs[TARGET.taskKey],
      'x',
      'the final real lane effect settles the snapshot',
    );
    assert.deepEqual(
      fs.readFileSync(path.join(root, IDEA_PATH)),
      authoritativePrestate.owner,
      'task settlement keeps the exact owner and Coordinator Log when ownerLog is none',
    );
    assert.equal(checkpoint.calls.filter((call) => call === 'claim').length, 1);
    assert.equal(checkpoint.pair.claim, null, 'the terminal result clears its ownership claim');
    assert.equal(checkpoint.pair.checkpoint, null, 'the terminal result clears its checkpoint');
  });

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
      exchange(challenge) {
        return focusedChallengeResponse(challenge, 'assessment', {
          ...focusedChallengeAssessment(challenge),
          evidenceHash: sha256('stale-challenge-assessment'),
        });
      },
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
      assert.equal(
        checkpoint.pair.checkpoint !== null,
        row.checkpointPresent !== false,
        row.label,
      );
      if (row.kinds) assert.deepEqual(kinds, row.kinds, row.label);
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
    const env = { TMPDIR: temp };
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
    writeSealedTaskState(root);
    const checkpointRoot = path.join(root, 'checkpoint');
    fs.mkdirSync(checkpointRoot);
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
    let delegatedWorkProjects = 0;
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
          if (request.operation === 'work-project' && workProjectRefusals.length > 0) {
            return workProjectRefusals.shift();
          }
          if (request.operation === 'work-project') delegatedWorkProjects += 1;
          return applyLightweightWorkRequest(request);
        },
      },
    });
    assert.equal(`${result.outcome}/${result.reason}`, 'ended/task-settled');
    assert.equal(workProjectRefusals.length, 0, 'the finite refusal script crossed both correction occurrences');
    assert.equal(delegatedWorkProjects, 1, 'the later work-project call reaches the real lane boundary');
    assert.ok(
      observedCurrentRun.includes(1),
      'runner fresh Inspection must retain current-run before a refused lane projection',
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
