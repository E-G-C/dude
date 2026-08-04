// @ts-check

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseVisibleTasks } from '../dude-engine/lib/tasks.mjs';
import { isMainModule } from '../dude-engine/lib/text.mjs';
import { WORKSPACE_PATHS, resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import { createHostAdapter, createTemporaryCheckpointStore } from './host-adapter.mjs';
import {
  canonicalJson,
  canonicalTarget,
  capturedBytesV1,
  contentDescriptor,
  inspect,
  modelPacket,
  runCommand,
  sha256,
  validateAssessment,
  validateRunState,
} from './recovery.mjs';

const MAX_REQUEST_BYTES = 1_048_576;
const DEFAULT_RUNTIME_IDENTITY = sha256('dude-work/host-adapter-runner:recovery-runtime:v1');

/** @param {unknown} value @param {string[]} fields @param {string} label @param {string[]} [optional] */
function exactRecord(value, fields, label, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const result = /** @type {Record<string, unknown>} */ (value);
  const allowed = new Set([...fields, ...optional]);
  for (const field of Object.keys(result)) {
    if (!allowed.has(field)) throw new TypeError(`${label} contains unknown field '${field}'`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(result, field)) throw new TypeError(`${label} is missing field '${field}'`);
  }
  return result;
}

/** @param {unknown} value */
function clone(value) {
  return JSON.parse(canonicalJson(value));
}

/** @param {string} specPath */
function tasksPathForSpec(specPath) {
  if (!specPath.endsWith('/spec.md')) throw new TypeError('target specPath must end in /spec.md');
  return `${specPath.slice(0, -'spec.md'.length)}tasks.md`;
}

/** @param {string} root @param {string} relativePath */
function readWorkspaceFile(root, relativePath) {
  return fs.readFileSync(resolveMutationPath(root, relativePath));
}

/** @param {unknown} value */
function canonicalTime(value = new Date()) {
  const time = value instanceof Date ? value : new Date(/** @type {string|number} */ (value));
  if (Number.isNaN(time.valueOf())) throw new TypeError('runner clock must return a valid time');
  return time.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Reacquire the exact owner, target, task, and lane bytes used by one lane operation.
 * @param {string} root @param {Record<string, unknown>} targetValue @param {Record<string, unknown>} expectedOwner
 */
function freshLaneBinding(root, targetValue, expectedOwner) {
  const target = /** @type {{specPath:string,lane:'lightweight',taskKey:string}} */ (
    canonicalTarget(targetValue)
  );
  if (target.lane !== 'lightweight') throw new TypeError('lane-owner-unavailable');
  const resolved = resolveFeatureOwner({ root, specPath: target.specPath });
  if (resolved.diagnostics.length !== 0 || resolved.owner === null
    || canonicalJson(resolved.owner) !== canonicalJson(expectedOwner)) {
    throw new TypeError('owner-resolution-failed');
  }
  const tasksPath = tasksPathForSpec(target.specPath);
  const tasks = readWorkspaceFile(root, tasksPath);
  const owner = readWorkspaceFile(root, resolved.owner.ideaPath);
  const taskState = readWorkspaceFile(root, WORKSPACE_PATHS.TASK_STATE);
  const visible = parseVisibleTasks(tasks, { path: tasksPath, state: 'host adapter runner binding' });
  const rows = visible.parsed.tasks.filter((task) => task.id === target.taskKey);
  if (visible.parsed.boardIssue || rows.length !== 1) throw new TypeError('mapping-missing');
  const task = rows[0];
  const ownerCapture = capturedBytesV1(owner);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: resolved.owner.ideaPath,
    specPath: target.specPath,
    ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  }));
  const targetMapping = {
    version: 1,
    lane: 'lightweight',
    target: clone(target),
    ownerBindingHash,
    tasksPath,
    tasksDescriptor: contentDescriptor(tasks),
    taskStatePath: WORKSPACE_PATHS.TASK_STATE,
    taskStateDescriptor: contentDescriptor(taskState),
    taskKey: target.taskKey,
  };
  const lanePrestate = {
    version: 1,
    lane: 'lightweight',
    target: clone(target),
    glyph: task.glyph,
    blockedBy: task.blockedBy,
    tasksDescriptor: clone(targetMapping.tasksDescriptor),
    taskStateDescriptor: clone(targetMapping.taskStateDescriptor),
    ownerDescriptor: contentDescriptor(owner),
  };
  return {
    target,
    task,
    targetMapping,
    lanePrestate,
    application: {
      root,
      owner: {
        ideaPath: resolved.owner.ideaPath,
        specPath: target.specPath,
        ownerCapture,
        ownerBindingHash,
      },
      mapping: clone(targetMapping),
      expected: {
        tasksPath,
        tasks: capturedBytesV1(tasks),
        taskStatePath: WORKSPACE_PATHS.TASK_STATE,
        taskState: capturedBytesV1(taskState),
      },
    },
  };
}

/** @param {Record<string, unknown>} target @param {unknown[]} records */
function currentRunCapture(target, records) {
  const state = 'failed';
  const body = canonicalJson({
    target,
    state,
    records,
  });
  return {
    target: clone(target),
    state,
    outcomeHash: sha256(canonicalJson({
      target,
      state,
      records: records.map((entry) => /** @type {Record<string, unknown>} */ (entry).substantive),
    })),
    bytes: Buffer.from(body),
  };
}

/** @param {Record<string, unknown>} input */
function transportInput(input) {
  const output = { ...input, lane: clone(input.lane) };
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(input, field)) continue;
    output[field] = /** @type {Record<string, unknown>[]} */ (input[field]).map((entry) => ({
      ...entry,
      target: clone(entry.target),
      bytes: { base64: Buffer.from(/** @type {Buffer} */ (entry.bytes)).toString('base64') },
    }));
  }
  return output;
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} fields */
function stateResult(session, fields) {
  const stateBytes = /** @type {string} */ (session.acceptedStateBytes);
  return {
    version: 1,
    ...fields,
    acceptedRevision: session.acceptedRevision,
    hostRevision: session.hostRevision,
    workerGeneration: session.workerGeneration,
    stateBase64: Buffer.from(stateBytes, 'utf8').toString('base64'),
    stateHash: sha256(stateBytes),
  };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} fields */
function initialStateResult(state, fields) {
  const stateBytes = canonicalJson(validateRunState(state));
  return {
    version: 1,
    ...fields,
    acceptedRevision: 0,
    hostRevision: 0,
    workerGeneration: 1,
    stateBase64: Buffer.from(stateBytes, 'utf8').toString('base64'),
    stateHash: sha256(stateBytes),
  };
}

/** @param {string} root @param {Record<string, unknown>} target @param {Record<string, unknown>} owner @param {unknown[]} currentRun */
function authorityObservation(root, target, owner, currentRun) {
  try {
    const binding = freshLaneBinding(root, target, owner);
    const material = {
      version: 1,
      root,
      target: binding.target,
      owner,
      lanePrestate: binding.lanePrestate,
      currentRun,
    };
    return { complete: true, identity: sha256(canonicalJson(material)) };
  } catch (error) {
    return {
      complete: false,
      identity: sha256(canonicalJson({
        version: 1,
        status: 'indeterminate',
        detail: error instanceof Error ? error.message : String(error),
      })),
    };
  }
}

/** @param {string} root @param {Record<string, unknown>} target @param {Record<string, unknown>} owner @param {unknown[]} currentRun */
function noEffectAuthority(root, target, owner, currentRun) {
  const identity = randomBytes(32).toString('hex');
  const probes = new Map();
  return {
    identity,
    capture(request) {
      const observation = authorityObservation(root, target, owner, currentRun);
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        operationIdentity: request.operationIdentity,
        authorityIdentity: identity,
        authoritativePreIdentity: observation.identity,
      };
      const result = { ...body, probeIdentity: sha256(canonicalJson({ request, response: body })) };
      probes.set(result.probeIdentity, { result, observation });
      return result;
    },
    classify(request) {
      const captured = probes.get(request.probeIdentity);
      const post = authorityObservation(root, target, owner, currentRun);
      const noEffect = captured?.observation.complete === true
        && post.complete === true
        && captured.observation.identity === post.identity;
      const body = {
        version: 1,
        probeIdentity: request.probeIdentity,
        operationIdentity: request.operationIdentity,
        authorityIdentity: identity,
        incidentIdentity: request.incidentIdentity,
        classification: noEffect ? 'no-effect' : 'indeterminate',
        authoritativePreIdentity: captured?.observation.identity ?? post.identity,
        authoritativePostIdentity: post.identity,
        effectIdentity: null,
      };
      return { ...body, resultIdentity: sha256(canonicalJson({ request, response: body })) };
    },
  };
}

function supervisorSession() {
  const identity = randomBytes(32).toString('hex');
  const invocationIdentity = randomBytes(32).toString('hex');
  const workerToken = randomBytes(32).toString('hex');
  let admitted = false;
  return {
    identity,
    admit(request) {
      if (admitted || request.mode !== 'initial') throw new TypeError('supervisor admission is one-shot');
      admitted = true;
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        invocationIdentity,
        workerToken,
        workerGeneration: 1,
        supervisorAuthorityIdentity: identity,
      };
      return { ...body, admissionIdentity: sha256(canonicalJson({ request, response: body })) };
    },
  };
}

/** @param {ReturnType<typeof freshLaneBinding>} binding @param {string} root */
function checkpointWorkspace(binding, root) {
  return {
    workspaceIdentity: sha256(canonicalJson({ version: 1, root })),
    ownerIdentity: sha256(canonicalJson({
      version: 1,
      owner: binding.application.owner,
    })),
    taskPrestateIdentity: sha256(canonicalJson({
      version: 1,
      target: binding.target,
      glyph: binding.task.glyph,
      blockedBy: binding.task.blockedBy,
      tasksDescriptor: binding.targetMapping.tasksDescriptor,
    })),
    lanePrestateIdentity: sha256(canonicalJson(binding.lanePrestate)),
  };
}

/**
 * Run one closed coordinator-to-adapter request.
 * @param {unknown} requestValue
 * @param {unknown} [dependenciesValue]
 */
export async function runHostAdapter(requestValue, dependenciesValue) {
  const request = exactRecord(requestValue, [
    'version', 'root', 'target', 'owner', 'state',
  ], 'HostAdapterRunnerRequest', ['assessment', 'specialistResult']);
  if (request.version !== 1) throw new TypeError('HostAdapterRunnerRequest.version must be the literal 1');
  if (typeof request.root !== 'string' || request.root.length === 0) {
    throw new TypeError('HostAdapterRunnerRequest.root must be a nonempty string');
  }
  const root = fs.realpathSync(path.resolve(request.root));
  const target = /** @type {Record<string, unknown>} */ (canonicalTarget(request.target));
  if (canonicalJson(target) !== canonicalJson(request.target) || target.lane !== 'lightweight') {
    throw new TypeError('HostAdapterRunnerRequest.target must be one canonical Lightweight target');
  }
  const owner = exactRecord(request.owner, ['ideaPath', 'specPath'], 'HostAdapterRunnerRequest.owner');
  if (owner.specPath !== target.specPath) throw new TypeError('HostAdapterRunnerRequest.owner must match target');
  const state = /** @type {Record<string, unknown>} */ (clone(validateRunState(request.state)));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    throw new TypeError('HostAdapterRunnerRequest.state must use autonomous policy');
  }
  let initialAssessment = Object.hasOwn(request, 'assessment') ? clone(request.assessment) : null;
  let initialSpecialistResult = Object.hasOwn(request, 'specialistResult')
    ? clone(request.specialistResult)
    : null;
  const dependencies = dependenciesValue === undefined
    ? {}
    : exactRecord(
      dependenciesValue,
      Object.keys(/** @type {Record<string, unknown>} */ (dependenciesValue)),
      'host adapter runner dependencies',
    );
  for (const field of Object.keys(dependencies)) {
    if (!['checkpoint', 'runtime', 'laneOwner', 'exchange'].includes(field)) {
      throw new TypeError(`host adapter runner dependencies contains unknown field '${field}'`);
    }
  }
  if (Object.hasOwn(dependencies, 'exchange') && typeof dependencies.exchange !== 'function') {
    throw new TypeError('host adapter runner dependencies.exchange must be a function');
  }

  /** @type {Record<string, unknown>[]} */
  const steps = [];
  /** @type {unknown[]} */
  const currentRun = [];
  /** @type {{verification:Record<string, unknown>[],review:Record<string, unknown>[]}} */
  const observedStreams = { verification: [], review: [] };
  /** @type {string|null} */
  let occurrenceIdentity = null;
  /** @type {ReturnType<typeof createHostAdapter>|null} */
  let adapter = null;
  /** @type {Record<string, unknown>|null} */
  let currentInspection = null;
  /** @type {Record<string, unknown>|null} */
  let runtimeInspection = null;
  /** @type {Record<string, unknown>|null} */
  let outstandingChallenge = null;
  const consumedChallenges = new Set();
  let challengeCount = 0;
  const policy = /** @type {Record<string, unknown>} */ (state.policy);
  const challengeCeiling = policy.overall === 'unlimited'
    ? 75
    : Math.max(1, /** @type {number} */ (policy.overall) * 3 + 1);

  /** @param {Record<string, unknown>} row */
  const finish = (row) => {
    if (!['ended', 'hard-stop'].includes(/** @type {string} */ (row.outcome))) {
      throw new TypeError('runner attempted to return a nonterminal result');
    }
    return {
      ...row,
      type: 'result',
      step: 'result',
      occurrenceIdentity,
      steps,
    };
  };

  /** @param {string} step @param {Record<string, unknown>} result */
  const recordStep = (step, result) => {
    const row = stateResult(/** @type {Record<string, unknown>} */ (result.session), {
      type: 'step',
      step,
      outcome: result.outcome,
      reason: result.reason,
      ...(Object.hasOwn(result, 'effect')
        ? { effectIdentity: /** @type {Record<string, unknown>} */ (result.effect).effectIdentity }
        : {}),
      ...(Object.hasOwn(result, 'product')
        ? { productKind: /** @type {Record<string, unknown>} */ (result.product).kind }
        : {}),
      ...(Object.hasOwn(result, 'recoveryNotice') ? { recoveryNotice: result.recoveryNotice } : {}),
    });
    steps.push(row);
    return row;
  };

  /** @param {string} reason @param {string} detail */
  const orphan = (reason, detail) => {
    const row = adapter === null
      ? initialStateResult(state, {
        type: 'step', step: 'runner', outcome: 'hard-stop', reason, detail,
        orphan: true, cleanup: 'not-attempted',
      })
      : stateResult(adapter.snapshot(), {
        type: 'step', step: 'runner', outcome: 'hard-stop', reason, detail,
        orphan: true, cleanup: 'not-attempted',
        ...(adapter.ownership() === null ? {} : { ownership: adapter.ownership() }),
      });
    steps.push(row);
    return finish(row);
  };

  /** @param {string} step @param {string} operation @param {Record<string, unknown>} payload @param {string} [correctionIdentity] */
  const run = (step, operation, payload, correctionIdentity) => {
    const current = /** @type {NonNullable<typeof adapter>} */ (adapter).snapshot();
    const result = /** @type {Record<string, unknown>} */ (
      /** @type {NonNullable<typeof adapter>} */ (adapter).run({
        version: 1,
        operation,
        expectedSessionIdentity: current.sessionIdentity,
        expectedAcceptedRevision: current.acceptedRevision,
        expectedHostRevision: current.hostRevision,
        ...payload,
        ...(correctionIdentity === undefined ? {} : { correctionIdentity }),
      })
    );
    recordStep(step, result);
    return result;
  };

  /** @param {Record<string, unknown>} result @param {string} outcome @param {string} [reason] */
  const expected = (result, outcome, reason) => result.outcome === outcome
    && (reason === undefined || result.reason === reason);

  /** @param {Record<string, unknown>[]} retained @param {unknown} value */
  const appendUniqueRows = (retained, value) => {
    const rows = /** @type {Record<string, unknown>[]} */ (value);
    for (const row of rows) {
      if (!retained.some((entry) => canonicalJson(entry) === canonicalJson(row))) {
        retained.push(clone(row));
      }
    }
  };

  const rawInput = () => ({
    root,
    specPath: target.specPath,
    target: clone(target),
    lane: { kind: 'lightweight' },
    currentRun: currentRun.length === 0 ? [] : [currentRunCapture(target, currentRun)],
    review: [],
    verification: [],
    lint: [],
    policyMode: 'autonomous',
  });
  const runtimeInput = () => {
    const input = transportInput(rawInput());
    if (observedStreams.verification.length > 0 || observedStreams.review.length > 0) {
      input.verification = observedStreams.verification;
      input.review = observedStreams.review;
    }
    return input;
  };

  /** @param {unknown} value @param {Record<string, unknown>} inspection */
  const boundAssessment = (value, inspection) => {
    try {
      validateAssessment(target, inspection, value);
      return /** @type {Record<string, unknown>} */ (clone(value));
    } catch {
      return null;
    }
  };

  /** @param {unknown} value */
  const boundSpecialistResult = (value) => {
    try {
      const result = exactRecord(
        value,
        ['outcome', 'operations', 'changedTargets', 'verification', 'review'],
        'specialist-pair result',
      );
      if (!Array.isArray(result.operations) || !Array.isArray(result.changedTargets)) {
        throw new TypeError('specialist-pair operations and changedTargets must be arrays');
      }
      exactRecord(result.verification, ['checks'], 'specialist-pair verification');
      exactRecord(result.review, ['verdict', 'findings'], 'specialist-pair review');
      return /** @type {Record<string, unknown>} */ (clone(result));
    } catch {
      return null;
    }
  };

  /** @param {Record<string, unknown>} session */
  const currentAttemptIdentity = (session) => {
    const acceptedState = /** @type {Record<string, unknown>} */ (session.acceptedState);
    const pending = /** @type {Record<string, unknown>[]} */ (acceptedState.pending);
    return sha256(canonicalJson({
      version: 1,
      target,
      acceptedStateHash: session.acceptedStateHash,
      attemptOrdinal: pending.length === 1
        ? acceptedState.overallUsed
        : /** @type {number} */ (acceptedState.overallUsed) + 1,
      pending: pending.length === 1 ? pending[0] : null,
      governance: Object.hasOwn(acceptedState, 'learningGovernance')
        ? acceptedState.learningGovernance
        : null,
      inspectionIdentity: currentInspection === null
        ? session.inspectionIdentity
        : sha256(canonicalJson(currentInspection)),
    }));
  };

  /** @param {'assessment'|'specialist-pair'|'learning-review'} kind @param {Record<string, unknown>} fields */
  const exchange = async (kind, fields) => {
    if (outstandingChallenge !== null) {
      return { terminal: orphan('challenge-already-outstanding', kind) };
    }
    if (challengeCount >= challengeCeiling) {
      return { terminal: orphan('challenge-budget-exhausted', kind) };
    }
    const session = /** @type {NonNullable<typeof adapter>} */ (adapter).snapshot();
    const challengeBody = {
      version: 1,
      type: 'input-required',
      kind,
      target: clone(target),
      attemptIdentity: currentAttemptIdentity(session),
      acceptedRevision: session.acceptedRevision,
      hostRevision: session.hostRevision,
      stateBase64: Buffer.from(/** @type {string} */ (session.acceptedStateBytes), 'utf8').toString('base64'),
      stateHash: session.acceptedStateHash,
      inspection: currentInspection === null ? null : clone(currentInspection),
      ...fields,
    };
    const challenge = {
      ...challengeBody,
      challengeIdentity: randomBytes(32).toString('hex'),
      bindingIdentity: sha256(canonicalJson(challengeBody)),
    };
    outstandingChallenge = challenge;
    challengeCount += 1;
    if (!Object.hasOwn(dependencies, 'exchange')) {
      return { terminal: orphan('exchange-unavailable', kind) };
    }
    let responseValue;
    try {
      responseValue = await /** @type {Function} */ (dependencies.exchange)(clone(challenge));
    } catch (error) {
      const code = error && typeof error === 'object' && Object.hasOwn(error, 'code')
        ? /** @type {Record<string, unknown>} */ (error).code
        : null;
      return {
        terminal: orphan(
          typeof code === 'string' ? code : 'exchange-context-lost',
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
    if (responseValue === undefined || responseValue === null) {
      return { terminal: orphan('exchange-context-lost', kind) };
    }
    let response;
    try {
      response = exactRecord(
        responseValue,
        Object.keys(/** @type {Record<string, unknown>} */ (responseValue)),
        'HostAdapterChallengeResponse',
      );
    } catch (error) {
      return {
        terminal: orphan(
          'challenge-response-invalid',
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
    if (response.challengeIdentity !== challenge.challengeIdentity) {
      return {
        terminal: orphan(
          consumedChallenges.has(response.challengeIdentity)
            ? 'challenge-response-replayed'
            : 'challenge-response-foreign',
          kind,
        ),
      };
    }
    if (response.kind !== kind) {
      return { terminal: orphan('challenge-response-out-of-order', kind) };
    }
    if (response.type === 'cancel') {
      try {
        exactRecord(
          response,
          ['version', 'type', 'challengeIdentity', 'kind'],
          'HostAdapterChallengeCancel',
        );
        if (response.version !== 1) throw new TypeError('cancel version must be 1');
      } catch (error) {
        return {
          terminal: orphan(
            'challenge-response-invalid',
            error instanceof Error ? error.message : String(error),
          ),
        };
      }
      consumedChallenges.add(challenge.challengeIdentity);
      outstandingChallenge = null;
      const ended = /** @type {Record<string, unknown>} */ (
        /** @type {NonNullable<typeof adapter>} */ (adapter).end('cancelled')
      );
      return { terminal: finish(recordStep('cancel', ended)) };
    }
    const field = {
      assessment: 'assessment',
      'specialist-pair': 'specialistResult',
      'learning-review': 'review',
    }[kind];
    try {
      exactRecord(
        response,
        ['version', 'type', 'challengeIdentity', 'kind', field],
        'HostAdapterChallengeResponse',
      );
      if (response.version !== 1 || response.type !== 'challenge-response') {
        throw new TypeError('challenge response must use version 1 and type challenge-response');
      }
    } catch (error) {
      return {
        terminal: orphan(
          'challenge-response-invalid',
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
    consumedChallenges.add(challenge.challengeIdentity);
    outstandingChallenge = null;
    return { value: clone(response[field]) };
  };

  const refreshInspection = (step) => {
    const input = runtimeInput();
    const result = run(step, 'fresh-inspection', { input });
    if (result.outcome === 'hard-stop' || result.outcome === 'ended') {
      return { terminal: finish(steps.at(-1)), result };
    }
    if (!expected(result, 'accepted', 'inspection-refreshed')) {
      return { terminal: orphan('inspection-incomplete', /** @type {string} */ (result.reason)), result };
    }
    if (runtimeInspection === null) {
      return { terminal: orphan('inspection-result-missing', step), result };
    }
    currentInspection = clone(runtimeInspection);
    return { terminal: null, result };
  };

  /**
   * Apply the adapter's exact offered correction once. A second refusal is
   * followed by one fresh Inspection and returned to the caller for new input.
   * @param {string} step @param {string} operation @param {Record<string, unknown>} payload
   */
  const runSemantic = (step, operation, payload) => {
    let result = run(step, operation, clone(payload));
    if (!['closed-refusal', 'reinspect-required'].includes(/** @type {string} */ (result.outcome))) {
      return {
        result,
        reinspected: false,
        terminal: ['hard-stop', 'ended'].includes(/** @type {string} */ (result.outcome))
          ? finish(steps.at(-1))
          : null,
      };
    }
    const next = /** @type {Record<string, unknown>} */ (result.next);
    if (next.kind === 'correction') {
      result = run(
        `${step}:correction`,
        operation,
        clone(payload),
        /** @type {string} */ (next.correctionIdentity),
      );
      if (!['closed-refusal', 'reinspect-required'].includes(/** @type {string} */ (result.outcome))) {
        return {
          result,
          reinspected: false,
          terminal: ['hard-stop', 'ended'].includes(/** @type {string} */ (result.outcome))
            ? finish(steps.at(-1))
            : null,
        };
      }
    }
    const refreshed = refreshInspection(`${step}:reinspect`);
    return { result, reinspected: refreshed.terminal === null, terminal: refreshed.terminal };
  };

  /** @param {string} step @param {string} operation @param {()=>Record<string, unknown>} payload */
  const runDeterministic = (step, operation, payload) => {
    let outcome = runSemantic(step, operation, payload());
    if (outcome.terminal || !outcome.reinspected) return outcome;
    outcome = runSemantic(`${step}:fresh`, operation, payload());
    if (outcome.terminal || !outcome.reinspected) return outcome;
    return {
      ...outcome,
      terminal: orphan('repeated-closed-refusal', operation),
    };
  };

  /** @param {Record<string, unknown>} effect @param {string} label */
  const projectEffect = (effect, label) => {
    const batch = /** @type {Record<string, unknown>} */ (effect.projectionBatch);
    const events = /** @type {Record<string, unknown>[]} */ (batch.events);
    const occurrences = events.filter((event) => event.type === 'approach-occurrence');
    if (occurrences.length > 1 || (occurrences.length === 1
      && typeof occurrences[0].occurrenceIdentity !== 'string')) {
      return { terminal: orphan('projection-occurrence-invalid', label) };
    }
    if (occurrences.length === 1) {
      occurrenceIdentity = /** @type {string} */ (occurrences[0].occurrenceIdentity);
    }

    for (let index = 0; index < events.length; index += 1) {
      const prepared = runDeterministic(
        `${label}:prepare-projection:${index + 1}`,
        'prepare-authoritative-projection',
        () => {
          const binding = freshLaneBinding(root, target, owner);
          return {
            projection: {
              input: runtimeInput(),
              laneBinding: {
                lanePrestate: binding.lanePrestate,
                targetMapping: binding.targetMapping,
                operationTime: canonicalTime(),
              },
            },
          };
        },
      );
      if (prepared.terminal) return { terminal: prepared.terminal };
      if (!expected(prepared.result, 'effect-required', 'projection-prepared')) {
        return {
          terminal: orphan(
            'projection-preparation-incomplete',
            /** @type {string} */ (prepared.result.reason),
          ),
        };
      }
      const plan = /** @type {Record<string, unknown>} */ (
        /** @type {Record<string, unknown>} */ (prepared.result.product).plan
      );
      const items = /** @type {Record<string, unknown>[]} */ (plan.items);
      const item = items[index];
      const currentRunRecord = item
        ? exactRecord(item.currentRunRecord, ['substantive'], 'projection current-run record')
        : null;
      if (!item || item.eventHash !== events[index].eventHash
        || currentRunRecord === null
        || item.currentRunRecordHash !== sha256(canonicalJson(currentRunRecord.substantive))) {
        return { terminal: orphan('projection-plan-mismatch', label) };
      }

      currentRun.push(clone(item.currentRunRecord));
      const applied = runDeterministic(
        `${label}:apply-projection:${index + 1}`,
        'apply-lane-effect',
        () => {
          const binding = freshLaneBinding(root, target, owner);
          return {
            laneApplication: {
              ...binding.application,
              permit: item.projectionPermit,
              mutation: item.mutation,
            },
          };
        },
      );
      if (applied.terminal) return { terminal: applied.terminal };
      if (!expected(applied.result, 'effect-required', 'lane-projection-applied')) {
        return {
          terminal: orphan(
            'projection-application-incomplete',
            /** @type {string} */ (applied.result.reason),
          ),
        };
      }
      const receipt = /** @type {Record<string, unknown>} */ (
        /** @type {Record<string, unknown>} */ (applied.result.product).receipt
      );
      const committed = runDeterministic(
        `${label}:commit-projection:${index + 1}`,
        'commit-lane-receipt',
        () => ({
          laneReceipt: { input: runtimeInput(), permit: item.projectionPermit, receipt },
        }),
      );
      if (committed.terminal) return { terminal: committed.terminal };
      if (!expected(committed.result, 'effect-required', 'lane-receipt-committed')) {
        return {
          terminal: orphan(
            'projection-receipt-incomplete',
            /** @type {string} */ (committed.result.reason),
          ),
        };
      }
    }
    return { terminal: null };
  };

  /** @param {string} label */
  const settleEffect = (label) => {
    const settled = runDeterministic(
      label,
      'settle-effect',
      () => ({ input: runtimeInput() }),
    );
    if (settled.terminal) return settled;
    return { terminal: null, result: settled.result };
  };

  /** @param {boolean} allowInitial */
  const requestAssessment = async (allowInitial) => {
    if (allowInitial && initialAssessment !== null) {
      const candidate = boundAssessment(
        initialAssessment,
        /** @type {Record<string, unknown>} */ (currentInspection),
      );
      initialAssessment = null;
      if (candidate !== null) return { value: candidate, initial: true };
      initialSpecialistResult = null;
    }
    const response = await exchange('assessment', {
      modelPacket: modelPacket(currentInspection),
    });
    if (response.terminal) return response;
    const assessment = boundAssessment(
      response.value,
      /** @type {Record<string, unknown>} */ (currentInspection),
    );
    return assessment === null
      ? { terminal: orphan('challenge-response-stale', 'assessment') }
      : { value: assessment, initial: false };
  };

  /** @param {boolean} allowInitial @param {Record<string, unknown>} assessment */
  const requestSpecialistPair = async (allowInitial, assessment) => {
    if (allowInitial && initialSpecialistResult !== null) {
      const candidate = boundSpecialistResult(initialSpecialistResult);
      initialSpecialistResult = null;
      if (candidate !== null) return { value: candidate };
    }
    const response = await exchange('specialist-pair', {
      assessmentIdentity: sha256(canonicalJson(assessment)),
    });
    if (response.terminal) return response;
    const specialistResult = boundSpecialistResult(response.value);
    return specialistResult === null
      ? { terminal: orphan('challenge-response-invalid', 'specialist-pair') }
      : { value: specialistResult };
  };

  try {
    const initialBinding = freshLaneBinding(root, target, owner);
    if (initialBinding.task.glyph !== '~' || initialBinding.task.blockedBy !== null) {
      throw new TypeError('lane-prestate-mismatch');
    }
    const initialInspectionInput = rawInput();
    const initialInspection = /** @type {Record<string, unknown>} */ (inspect(initialInspectionInput));
    currentInspection = clone(initialInspection);

    const baseRuntime = Object.hasOwn(dependencies, 'runtime')
      ? exactRecord(dependencies.runtime, ['identity', 'invoke'], 'host adapter runner runtime')
      : {
        identity: DEFAULT_RUNTIME_IDENTITY,
        invoke(command, lowLevelRequest) {
          return { status: 'returned', value: runCommand(command, lowLevelRequest) };
        },
      };
    if (typeof baseRuntime.identity !== 'string' || typeof baseRuntime.invoke !== 'function') {
      throw new TypeError('host adapter runner runtime must be one existing runtime port');
    }
    const runtime = {
      identity: baseRuntime.identity,
      invoke(command, lowLevelRequest) {
        if (lowLevelRequest && typeof lowLevelRequest === 'object'
          && /** @type {Record<string, unknown>} */ (lowLevelRequest).mode === 'capture') {
          const input = /** @type {Record<string, unknown>} */ (
            /** @type {Record<string, unknown>} */ (lowLevelRequest).input
          );
          appendUniqueRows(observedStreams.verification, input.verification);
          appendUniqueRows(observedStreams.review, input.review);
        }
        const output = /** @type {Function} */ (baseRuntime.invoke)(command, lowLevelRequest);
        if (output && typeof output === 'object'
          && /** @type {Record<string, unknown>} */ (output).status === 'returned') {
          const value = /** @type {Record<string, unknown>} */ (
            /** @type {Record<string, unknown>} */ (output).value
          );
          if (value && typeof value === 'object' && Object.hasOwn(value, 'inspection')) {
            runtimeInspection = clone(value.inspection);
          }
        }
        return output;
      },
    };
    const ports = {
      supervisorSession: supervisorSession(),
      noEffectAuthority: noEffectAuthority(root, target, owner, currentRun),
      runtime,
      checkpoint: Object.hasOwn(dependencies, 'checkpoint')
        ? dependencies.checkpoint
        : createTemporaryCheckpointStore(),
      ...(Object.hasOwn(dependencies, 'laneOwner') ? { laneOwner: dependencies.laneOwner } : {}),
    };
    adapter = createHostAdapter({
      state,
      target,
      inspectionIdentity: sha256(canonicalJson(initialInspection)),
      workspace: checkpointWorkspace(initialBinding, root),
    }, ports);
    const admitted = adapter.snapshot();
    const admittedRow = stateResult(admitted, {
      type: 'step',
      step: 'admitted',
      outcome: admitted.status === 'active' ? 'accepted' : 'hard-stop',
      reason: admitted.status === 'active' ? 'supervisor-admitted' : admitted.disposition,
      ...(adapter.ownership() === null ? {} : { ownership: adapter.ownership() }),
    });
    steps.push(admittedRow);
    if (admitted.status !== 'active') return finish(admittedRow);

    const inspected = refreshInspection('fresh-inspection');
    if (inspected.terminal) return inspected.terminal;

    let attemptOrdinal = 0;
    let completed = false;
    while (!completed) {
      const acceptedState = /** @type {Record<string, unknown>} */ (adapter.snapshot().acceptedState);
      if (Object.hasOwn(acceptedState, 'learningGovernance')) {
        const governance = /** @type {Record<string, unknown>} */ (acceptedState.learningGovernance);
        if (governance.phase === 'required') {
          const refreshed = refreshInspection('learning-review:fresh-inspection');
          if (refreshed.terminal) return refreshed.terminal;
          let reviewed;
          let review;
          while (true) {
            const governanceInput = runtimeInput();
            const response = await exchange('learning-review', {
              governanceIdentity: governance.governanceIdentity,
              governanceRequestIdentity: sha256(canonicalJson({
                action: 'review-learning',
                input: governanceInput,
              })),
              modelPacket: modelPacket(currentInspection),
            });
            if (response.terminal) return response.terminal;
            try {
              review = /** @type {Record<string, unknown>} */ (clone(response.value));
              if (canonicalJson(review.target) !== canonicalJson(target)) {
                return orphan('challenge-response-stale', 'learning-review');
              }
            } catch {
              return orphan('challenge-response-invalid', 'learning-review');
            }
            const outcome = runSemantic('advance-governance:review-learning', 'advance-governance', {
              governance: { action: 'review-learning', input: governanceInput, review },
            });
            if (outcome.terminal) return outcome.terminal;
            if (outcome.reinspected) continue;
            reviewed = outcome.result;
            break;
          }
          if (!expected(reviewed, 'effect-required', 'learning-reviewed')) {
            return orphan('learning-review-incomplete', /** @type {string} */ (reviewed.reason));
          }
          const projected = projectEffect(
            /** @type {Record<string, unknown>} */ (reviewed.effect),
            'learning-result',
          );
          if (projected.terminal) return projected.terminal;
          const learningSettled = settleEffect('learning-result:settle-effect');
          if (learningSettled.terminal) return learningSettled.terminal;
          if (!expected(learningSettled.result, 'accepted', 'projection-verified')) {
            return orphan(
              'learning-projection-incomplete',
              /** @type {string} */ (learningSettled.result.reason),
            );
          }
          const postLearningInspection = refreshInspection('post-learning:fresh-inspection');
          if (postLearningInspection.terminal) return postLearningInspection.terminal;
          if (review.outcome === 'selected-alternative') {
            const bound = runDeterministic(
              'advance-governance:bind-alternative',
              'advance-governance',
              () => ({ governance: { action: 'bind-alternative', input: runtimeInput() } }),
            );
            if (bound.terminal) return bound.terminal;
            if (!expected(bound.result, 'accepted', 'post-learning-inspection-bound')) {
              return orphan(
                'learning-alternative-incomplete',
                /** @type {string} */ (bound.result.reason),
              );
            }
          } else if (review.outcome === 'no-progress') {
            const verified = runDeterministic(
              'advance-governance:verify-no-progress',
              'advance-governance',
              () => ({ governance: { action: 'verify-no-progress', input: runtimeInput() } }),
            );
            if (verified.terminal) return verified.terminal;
            if (!expected(verified.result, 'accepted', 'no-progress-verified')) {
              return orphan(
                'learning-no-progress-incomplete',
                /** @type {string} */ (verified.result.reason),
              );
            }
            const ended = runDeterministic(
              'advance-governance:controlled-end',
              'advance-governance',
              () => ({ governance: { action: 'controlled-end', input: runtimeInput() } }),
            );
            if (ended.terminal) return ended.terminal;
            return orphan('controlled-end-incomplete', /** @type {string} */ (ended.result.reason));
          } else {
            return orphan('challenge-response-invalid', 'learning-review outcome');
          }
        } else if (!['alternative-inspected', 'alternative-authorized', 'alternative-verified'].includes(
          /** @type {string} */ (governance.phase),
        )) {
          return orphan(
            'learning-governance-phase-unhandled',
            /** @type {string} */ (governance.phase),
          );
        }
      }

      const refreshed = refreshInspection(`attempt:${attemptOrdinal + 1}:fresh-inspection`);
      if (refreshed.terminal) return refreshed.terminal;
      let assessmentResponse = await requestAssessment(attemptOrdinal === 0);
      if (assessmentResponse.terminal) return assessmentResponse.terminal;
      let assessment = /** @type {Record<string, unknown>} */ (assessmentResponse.value);
      let authorized;
      while (true) {
        const authorizationState = /** @type {Record<string, unknown>} */ (adapter.snapshot().acceptedState);
        const activeGovernance = Object.hasOwn(authorizationState, 'learningGovernance')
          ? /** @type {Record<string, unknown>} */ (authorizationState.learningGovernance)
          : null;
        let permit = {};
        if (activeGovernance?.phase === 'alternative-inspected') {
          const binding = freshLaneBinding(root, target, owner);
          permit = {
            permit: {
              lanePrestate: binding.lanePrestate,
              targetMapping: binding.targetMapping,
            },
          };
        }
        const outcome = runSemantic(
          `attempt:${attemptOrdinal + 1}:authorize-attempt`,
          'authorize-attempt',
          {
            authorization: { input: runtimeInput(), assessment, ...permit },
          },
        );
        if (outcome.terminal) return outcome.terminal;
        if (!outcome.reinspected) {
          authorized = outcome.result;
          break;
        }
        initialSpecialistResult = null;
        assessmentResponse = await requestAssessment(false);
        if (assessmentResponse.terminal) return assessmentResponse.terminal;
        assessment = /** @type {Record<string, unknown>} */ (assessmentResponse.value);
      }
      if (!expected(authorized, 'accepted', 'authorized')) {
        return orphan('attempt-authorization-incomplete', /** @type {string} */ (authorized.reason));
      }

      attemptOrdinal += 1;
      let specialistResponse = await requestSpecialistPair(
        attemptOrdinal === 1 && assessmentResponse.initial === true,
        assessment,
      );
      if (specialistResponse.terminal) return specialistResponse.terminal;
      let specialistResult = /** @type {Record<string, unknown>} */ (specialistResponse.value);
      let captured;
      while (true) {
        const recordInput = runtimeInput();
        delete recordInput.verification;
        delete recordInput.review;
        const outcome = runSemantic(
          `attempt:${attemptOrdinal}:record-attempt-result`,
          'record-attempt-result',
          { attemptResult: { input: recordInput, result: specialistResult } },
        );
        if (outcome.terminal) return outcome.terminal;
        if (!outcome.reinspected) {
          captured = outcome.result;
          break;
        }
        specialistResponse = await requestSpecialistPair(false, assessment);
        if (specialistResponse.terminal) return specialistResponse.terminal;
        specialistResult = /** @type {Record<string, unknown>} */ (specialistResponse.value);
      }
      if (!expected(captured, 'effect-required', 'occurrence-retention-required')) {
        return orphan('attempt-capture-incomplete', /** @type {string} */ (captured.reason));
      }
      if (observedStreams.verification.length === 0 || observedStreams.review.length === 0) {
        return orphan('specialist-capture-streams-missing', `attempt:${attemptOrdinal}`);
      }
      const occurrenceProjection = projectEffect(
        /** @type {Record<string, unknown>} */ (captured.effect),
        `attempt:${attemptOrdinal}:completion`,
      );
      if (occurrenceProjection.terminal) return occurrenceProjection.terminal;
      let settlement = settleEffect(`attempt:${attemptOrdinal}:settle-completion`);
      if (settlement.terminal) return settlement.terminal;
      if (settlement.result.outcome === 'effect-required') {
        const governanceProjection = projectEffect(
          /** @type {Record<string, unknown>} */ (settlement.result.effect),
          `attempt:${attemptOrdinal}:governance`,
        );
        if (governanceProjection.terminal) return governanceProjection.terminal;
        settlement = settleEffect(`attempt:${attemptOrdinal}:settle-governance`);
        if (settlement.terminal) return settlement.terminal;
        if (!expected(settlement.result, 'accepted', 'projection-verified')) {
          return orphan(
            'governance-projection-incomplete',
            /** @type {string} */ (settlement.result.reason),
          );
        }
        continue;
      }
      if (!expected(settlement.result, 'accepted')) {
        return orphan(
          'completion-settlement-incomplete',
          /** @type {string} */ (settlement.result.reason),
        );
      }
      if (settlement.result.reason === 'completed') {
        completed = true;
      } else if (!['review-rejected', 'verification-failed'].includes(
        /** @type {string} */ (settlement.result.reason),
      )) {
        return orphan(
          'completion-disposition-unhandled',
          /** @type {string} */ (settlement.result.reason),
        );
      }
    }

    const audited = runDeterministic(
      'audit-run',
      'audit-run',
      () => ({ audit: { input: runtimeInput() } }),
    );
    if (audited.terminal) return audited.terminal;
    if (!expected(audited.result, 'accepted', 'run-audited')) {
      return orphan('run-audit-incomplete', /** @type {string} */ (audited.result.reason));
    }

    const laneBinding = freshLaneBinding(root, target, owner);
    if (laneBinding.task.glyph !== '~' || laneBinding.task.blockedBy !== null) {
      throw new TypeError('lane-prestate-mismatch');
    }
    const mutation = {
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
      snapshotUpdatedAt: canonicalTime(),
    };
    const issued = runDeterministic(
      'authorize-lane-effect',
      'authorize-lane-effect',
      () => {
        const binding = freshLaneBinding(root, target, owner);
        return {
          laneEffect: {
            input: runtimeInput(),
            mutation,
            lanePrestate: binding.lanePrestate,
            targetMapping: binding.targetMapping,
          },
        };
      },
    );
    if (issued.terminal) return issued.terminal;
    if (!expected(issued.result, 'accepted', 'lane-permit-issued')) {
      return orphan('lane-permit-incomplete', /** @type {string} */ (issued.result.reason));
    }
    const permit = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (issued.result.product).permit
    );

    const applied = runDeterministic(
      'apply-lane-effect',
      'apply-lane-effect',
      () => {
        const binding = freshLaneBinding(root, target, owner);
        return {
          laneApplication: { ...binding.application, permit, mutation },
        };
      },
    );
    if (applied.terminal) return applied.terminal;
    if (!expected(applied.result, 'accepted', 'lane-mutation-applied')) {
      return orphan('lane-mutation-incomplete', /** @type {string} */ (applied.result.reason));
    }
    const receipt = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (applied.result.product).receipt
    );

    const poststate = freshLaneBinding(root, target, owner);
    if (poststate.task.glyph !== 'x' || poststate.task.blockedBy !== null) {
      throw new TypeError('lane-poststate-mismatch');
    }
    const committed = runDeterministic(
      'commit-lane-receipt',
      'commit-lane-receipt',
      () => ({ laneReceipt: { input: runtimeInput(), permit, receipt } }),
    );
    if (committed.terminal) return committed.terminal;
    if (!expected(committed.result, 'accepted', 'lane-receipt-committed')) {
      return orphan('lane-receipt-incomplete', /** @type {string} */ (committed.result.reason));
    }

    const finalAudit = runDeterministic(
      'final-audit',
      'audit-run',
      () => ({ audit: { input: runtimeInput() } }),
    );
    if (finalAudit.terminal) return finalAudit.terminal;
    if (!expected(finalAudit.result, 'accepted', 'run-audited')) {
      return orphan('final-audit-incomplete', /** @type {string} */ (finalAudit.result.reason));
    }

    const ended = /** @type {Record<string, unknown>} */ (adapter.end('task-settled'));
    const endedRow = recordStep('end', ended);
    return finish(endedRow);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const row = adapter === null
      ? initialStateResult(state, {
        type: 'step', step: 'runner', outcome: 'hard-stop', reason: 'runner-refused', detail,
      })
      : stateResult(adapter.snapshot(), {
        type: 'step', step: 'runner', outcome: 'hard-stop', reason: 'runner-refused', detail,
      });
    steps.push(row);
    return finish(row);
  }
}

async function main() {
  if (process.argv.length !== 2) {
    process.stderr.write('usage: node host-adapter-runner.mjs < request.ndjson\n');
    process.exitCode = 1;
    return;
  }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  const iterator = lines[Symbol.asyncIterator]();
  let request;
  try {
    const initial = await iterator.next();
    if (initial.done || Buffer.byteLength(initial.value) < 1
      || Buffer.byteLength(initial.value) > MAX_REQUEST_BYTES) {
      throw new TypeError(`request must contain 1 through ${MAX_REQUEST_BYTES} bytes on one line`);
    }
    request = JSON.parse(initial.value);
    const result = await runHostAdapter(request, {
      async exchange(challenge) {
        await new Promise((resolve) => process.stdout.write(`${canonicalJson(challenge)}\n`, resolve));
        const response = await iterator.next();
        if (response.done) {
          const error = new Error('standard input ended while a challenge was outstanding');
          Object.assign(error, { code: 'supervisor-context-lost' });
          throw error;
        }
        if (Buffer.byteLength(response.value) < 1
          || Buffer.byteLength(response.value) > MAX_REQUEST_BYTES) {
          const error = new Error(`response must contain 1 through ${MAX_REQUEST_BYTES} bytes on one line`);
          Object.assign(error, { code: 'challenge-response-invalid' });
          throw error;
        }
        try {
          return JSON.parse(response.value);
        } catch {
          const error = new Error('challenge response must be one JSON line');
          Object.assign(error, { code: 'challenge-response-invalid' });
          throw error;
        }
      },
    });
    const { steps: _steps, ...summary } = result;
    process.stdout.write(`${canonicalJson(summary)}\n`);
    process.exitCode = result.outcome === 'ended' ? 0 : 1;
  } catch (error) {
    try {
      const state = exactRecord(request, Object.keys(request), 'HostAdapterRunnerRequest').state;
      const row = initialStateResult(/** @type {Record<string, unknown>} */ (state), {
        type: 'result',
        step: 'request',
        outcome: 'hard-stop',
        reason: 'request-invalid',
        detail: error instanceof Error ? error.message : String(error),
        occurrenceIdentity: null,
      });
      process.stdout.write(`${canonicalJson(row)}\n`);
    } catch {
      process.stderr.write(`invalid request: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exitCode = 1;
  } finally {
    lines.close();
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
