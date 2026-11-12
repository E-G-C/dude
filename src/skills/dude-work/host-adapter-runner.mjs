// @ts-check

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { types as utilTypes } from 'node:util';

import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { buildLightweightWorkPostimages } from '../dude-engine/lib/lightweight-work-postimage.mjs';
import { readTaskState } from '../dude-engine/lib/task-state.mjs';
import { parseVisibleTasks } from '../dude-engine/lib/tasks.mjs';
import { isMainModule } from '../dude-engine/lib/text.mjs';
import { WORKSPACE_PATHS, resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import {
  createHostAdapter,
  createTemporaryCheckpointStore,
  prepareSpecialistResult,
  validateTerminalDispositionV1,
  validateTerminalEvidenceManifestV1,
} from './host-adapter.mjs';
import {
  HALT_NEXT_ACTIONS,
  assertDenseDataArrayLength,
  canonicalJson,
  canonicalTarget,
  capacityDiagnostic,
  capacitySubject,
  capturedBytesV1,
  classifyOutcomeReason,
  contentDescriptor,
  currentRunCapture,
  deriveEarliestRepeatRelationshipV1,
  describeUnattendedHalt,
  inspect,
  inspectRetainedOccurrencesV2,
  modelPacket,
  retainedProjectionPrefixV2,
  runCommand,
  sha256,
  validateAssessment,
  validateBlocker,
  validateCapacityDiagnostic,
  validateInspection,
  validateLaneMutationPermitV1,
  validateLightweightAtomicReceiptV1,
  validateRunState,
  validateTerminalFreshClaimMutationV1,
} from './recovery.mjs';

const MAX_REQUEST_BYTES = 1_048_576;
const EMPTY_TASK_STATE_BYTES = Buffer.from('{}\n');
const RETAINED_STREAMS = ['currentRun', 'verification', 'review', 'lint'];
// The streams a completion capture carries for its own attempt alone.
const ATTEMPT_STREAMS = ['verification', 'review', 'lint'];
// Fixed producer-derived run-local names the retention sink publishes.
const CAPTURES_FILE = 'retained-evidence.json';
const TERMINAL_ORIGINAL_FILE = 'terminal-original.json';
const TERMINAL_CONTROLS_FILE = 'terminal-controls.json';
const TERMINAL_FENCE_FILE = 'terminal-fence.json';
const TERMINAL_EFFECTS_FILE = 'terminal-effects.json';
const TERMINAL_EVIDENCE_FILE = 'terminal-evidence.json';
const TERMINAL_DISPOSITION_FILE = 'terminal-disposition.json';
// Terminal disposition lifecycle order: only the first failed proof is reported.
const MISSING_PROOF_ORDER = [
  'owner-fence', 'effect-settlement', 'retained-source', 'current-target', 'exact-control-pair', 'removal-absence',
];
/** One bounded Work-owned statement per missing proof kind, never rejected input. @type {Record<string, [string, string]>} */
const MISSING_PROOF_TEXT = {
  'owner-fence': [
    'the original live Work owner fences its own admitted control pair before it returns',
    'coordinator: report the retained hard stop; only the existing independently confirmed manual orphan cleanup applies',
  ],
  'effect-settlement': [
    'no entered effect authority, or every entered effect settled through the built-in runtime and lane owner',
    'coordinator: keep the pair and route the unsettled or unobserved effect to its owner',
  ],
  'retained-source': [
    'complete immutable terminal evidence published and read back before any removal',
    'coordinator: keep the pair and the retained files and report the unavailable evidence',
  ],
  'current-target': [
    'current owner, task, requirement, and lane surfaces equal the retained terminal basis',
    'coordinator: keep the pair and reconcile the changed surface through its owner',
  ],
  'exact-control-pair': [
    'the exact claim and checkpoint bytes this owner created and last wrote',
    'coordinator: keep every artifact; only the existing independently confirmed manual cleanup applies',
  ],
  'removal-absence': [
    'fresh absence of both artifacts and one published disposition after removal',
    'coordinator: keep what remains; never retry or restore removed controls',
  ],
};

class TaskStateEvidenceError extends Error {}

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

/**
 * Publish one value through the trusted retention sink. Its canonical
 * expectation is fixed before the callback; the sink receives only a detached
 * copy, rebuilt from JSON text in the value's own field order so published
 * bytes keep their existing form; and the returned descriptor's scalars are
 * copied at once. No later callback can change the expectation, the runner's
 * own value, or an earlier row.
 * @param {{write:(name:string, value:unknown)=>unknown}} sink @param {string} name @param {unknown} value
 */
function publishDetached(sink, name, value) {
  const expected = canonicalJson(value);
  const returned = exactRecord(
    sink.write(name, JSON.parse(JSON.stringify(value))),
    ['name', 'sha256', 'byteLength'],
    'retention sink descriptor',
  );
  const descriptor = { name: returned.name, sha256: returned.sha256, byteLength: returned.byteLength };
  if (descriptor.name !== name) throw new TypeError('retention sink descriptor must name the published file');
  return { name, expected, descriptor };
}

/**
 * Reread one published file. Its bytes must match the copied descriptor, and
 * their parsed material must be exactly the expectation fixed before
 * publication: order, duplicates, every field, every string, and embedded
 * bytes. Returns that material and throws on any difference or failure.
 * @param {{read:(name:string)=>Uint8Array}} sink @param {ReturnType<typeof publishDetached>} published
 */
function rereadExactly(sink, published) {
  const bytes = Buffer.from(sink.read(published.name));
  if (bytes.byteLength !== published.descriptor.byteLength || sha256(bytes) !== published.descriptor.sha256) {
    throw new TypeError(`${published.name} did not reread as described`);
  }
  const material = JSON.parse(bytes.toString('utf8'));
  if (canonicalJson(material) !== published.expected) {
    throw new TypeError(`${published.name} did not reread as its original material`);
  }
  return material;
}

// The closed set of exchange-failure reason codes the runner itself may attribute:
// `supervisor-context-lost` on standard-input EOF while a challenge is outstanding,
// `challenge-response-invalid` on a malformed or over-length response, and
// `exchange-context-lost` as the runner-owned default. The host `exchange` is a
// caller-supplied, untrusted dependency, so any other `code` it raises must fall
// back to the default rather than masquerade as the runner's own attribution.
const RUNNER_OWNED_EXCHANGE_REASONS = new Set([
  'supervisor-context-lost',
  'challenge-response-invalid',
  'exchange-context-lost',
]);
const EXCHANGE_FAILURE_DETAIL = 'exchange-failed';
const CHALLENGE_ENVELOPE_INVALID_DETAIL = 'challenge-response-envelope';

// A model-produced Assessment is untrusted input, so a rejection may report only
// this runner-owned failure class. Validator messages, rejected target text,
// evidence bytes, and hashes never reach a result.
const ASSESSMENT_INVALID_DETAIL = 'Assessment: invalid-contract';

const OWNER_FINALIZATION_REFUSALS = new Set([
  'supervisor-identity-missing',
  'supervisor-identity-mismatch',
  'stale-worker',
  'checkpoint-absent',
  'checkpoint-corrupt',
  'checkpoint-load-failed',
  'checkpoint-drift',
  'checkpoint-revision-conflict',
  'effect-unverified',
  'checkpoint-cleanup-failed',
]);

/** Only closed source classes, never validator text or rejected capture bytes. @param {TypeError} error */
function retainedInputFailureDetail(error) {
  const message = utilTypes.isProxy(error) ? null : Object.getOwnPropertyDescriptor(error, 'message')?.value;
  const match = typeof message === 'string'
    ? /^(?:(?:inspect (?:request\.input|input)|rawInputs|retainedEvidence)\.)(currentRun|verification|review|lint)(?:[.\[\s]|$)|^(current-run|verification|review|lint|independent-review)[ .]/.exec(message)
    : null;
  const source = match?.[1] ?? match?.[2];
  return source
    ? `retainedEvidence: invalid ${source === 'currentRun' ? 'current-run' : source === 'independent-review' ? 'review' : source}`
    : 'retainedEvidence: invalid current-run/verification/review/lint input';
}

/**
 * Capture only top-level enumerable data properties without invoking caller
 * accessors. Payload values remain raw so their authoritative validator is the
 * first consumer.
 * @param {unknown} value @param {string[]} required @param {string[]} optional
 * @param {string} label
 */
function captureExactDataRecord(value, required, optional, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || utilTypes.isProxy(value)) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const allowed = new Set([...required, ...optional]);
  const captured = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`${label} contains an unknown field`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label} fields must be enumerable data properties`);
    }
    captured[key] = descriptor.value;
  }
  for (const key of required) {
    if (!Object.hasOwn(captured, key)) throw new TypeError(`${label} is missing a field`);
  }
  return captured;
}

/** @param {unknown} failure */
function exchangeFailureReason(failure) {
  if (failure === null || typeof failure !== 'object' || utilTypes.isProxy(failure)) {
    return 'exchange-context-lost';
  }
  const descriptor = Object.getOwnPropertyDescriptor(failure, 'code');
  return descriptor && 'value' in descriptor
    && typeof descriptor.value === 'string'
    && RUNNER_OWNED_EXCHANGE_REASONS.has(descriptor.value)
    ? descriptor.value
    : 'exchange-context-lost';
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

/** @param {string} root */
function readTaskStateCapture(root) {
  const taskState = readTaskState(root);
  if (taskState.status === 'corrupt') throw new TaskStateEvidenceError(taskState.reason);
  return taskState.status === 'absent'
    ? Buffer.from(EMPTY_TASK_STATE_BYTES)
    : readWorkspaceFile(root, WORKSPACE_PATHS.TASK_STATE);
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
  const taskState = readTaskStateCapture(root);
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

// In-process seals of terminal-qualified starts this runner already consumed.
// The driver's exclusive run-local record is the cross-process guard; neither
// is a registry or a live owner.
const CONSUMED_TERMINAL_STARTS = new WeakSet();
const CONSUMED_TERMINAL_REQUESTS = new Set();
const TERMINAL_REQUEST_USED_FILE = 'runner-request-used.json';
const TERMINAL_REQUIREMENT_FIELDS = ['spec', 'plan', 'taskUnit'];

/**
 * The exact requirement descriptors a terminal manifest binds: the complete
 * spec and plan, and the canonical task unit, its header and contiguous
 * indented metadata lines, within the bound tasks.md bytes. The producer and
 * the terminal start compute them only here.
 * @param {string} root @param {Record<string, unknown>} target @param {ReturnType<typeof freshLaneBinding>} binding
 */
function terminalRequirementDescriptors(root, target, binding) {
  const specPath = /** @type {string} */ (target.specPath);
  const planPath = `${specPath.slice(0, -'spec.md'.length)}plan.md`;
  const tasksPath = /** @type {string} */ (binding.targetMapping.tasksPath);
  const expected = /** @type {Record<string, Record<string, string>>} */ (binding.application.expected);
  const tasks = Buffer.from(expected.tasks.base64, 'base64');
  const visible = /** @type {{lines:{start:number,end:number}[],parsed:{lines:string[],byId:Map<string,{headerLine:number}>}}} */ (
    /** @type {unknown} */ (parseVisibleTasks(tasks, { path: tasksPath, state: 'terminal evidence' }))
  );
  const header = /** @type {{headerLine:number}} */ (visible.parsed.byId.get(/** @type {string} */ (target.taskKey))).headerLine;
  let end = header + 1;
  while (end < visible.parsed.lines.length && /^\s+\S/.test(visible.parsed.lines[end])) end += 1;
  /** @param {string} relative @param {Buffer} bytes */
  const describe = (relative, bytes) => ({ path: relative, ...contentDescriptor(bytes) });
  return {
    spec: describe(specPath, readWorkspaceFile(root, specPath)),
    plan: describe(planPath, readWorkspaceFile(root, planPath)),
    taskUnit: describe(tasksPath, tasks.subarray(visible.lines[header].start, visible.lines[end - 1].end)),
  };
}

/** @param {unknown} value @param {string} label */
function exactCapturedBytes(value, label) {
  const capture = exactRecord(value, ['base64', 'sha256', 'byteLength'], label);
  if (typeof capture.base64 !== 'string') throw new TypeError(`${label} must be exact captured bytes`);
  const bytes = Buffer.from(capture.base64, 'base64');
  if (bytes.toString('base64') !== capture.base64 || canonicalJson(capturedBytesV1(bytes)) !== canonicalJson(capture)) {
    throw new TypeError(`${label} must be exact captured bytes`);
  }
  return bytes;
}

/**
 * Admit one terminal-qualified request only at its single trusted start. The
 * driver's start observation, never a request field, must bind this exact
 * request and its fresh admission once, and carry the admission-bound spec,
 * plan, and task-unit descriptors. The state must be exactly fresh for its
 * policy: the original accepted state, budgets, and learning stay evidence.
 * The current definition must still equal those descriptors, and the current
 * lane bytes must equal the one authorized setup postimage, which the unchanged
 * builder rebuilds from the setup's retained preimages and exact marker
 * mutation, bound to that setup's permit and receipt. Throws before any
 * admission or write; a failed start stays consumed.
 * @param {Record<string, unknown>} request @param {string} root @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} owner @param {Record<string, unknown>} state @param {unknown} requestStart
 */
function verifyTerminalStart(request, root, target, owner, state, requestStart) {
  const label = 'HostAdapterRunnerRequest.priorTerminal';
  const prior = exactRecord(request.priorTerminal, [
    'manifestIdentity', 'dispositionIdentity', 'freshAdmissionIdentity', 'setupReceipt',
  ], label);
  for (const field of ['manifestIdentity', 'dispositionIdentity', 'freshAdmissionIdentity']) {
    if (typeof prior[field] !== 'string' || !/^[0-9a-f]{64}$/.test(/** @type {string} */ (prior[field]))) {
      throw new TypeError(`${label}.${field} must be a lowercase SHA-256 hash`);
    }
  }
  if (!Object.hasOwn(request, 'retainedEvidence')) throw new TypeError(`${label} requires the original retainedEvidence`);
  if (requestStart === null || utilTypes.isProxy(requestStart)) {
    throw new TypeError(`${label} requires the driver's trusted single-use start observation`);
  }
  if (CONSUMED_TERMINAL_STARTS.has(/** @type {object} */ (requestStart))) {
    throw new TypeError(`${label} start observation was already used`);
  }
  const start = exactRecord(requestStart, [
    'version', 'kind', 'requestIdentity', 'freshAdmissionIdentity', 'record', 'requirements',
  ], 'runner request start');
  const record = exactRecord(start.record, ['name', 'sha256', 'byteLength'], 'runner request start.record');
  const requestIdentity = sha256(canonicalJson(request));
  if (start.version !== 1 || start.kind !== 'runner-request-start' || start.requestIdentity !== requestIdentity
    || start.freshAdmissionIdentity !== prior.freshAdmissionIdentity || record.name !== TERMINAL_REQUEST_USED_FILE
    || typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)
    || !Number.isSafeInteger(record.byteLength) || /** @type {number} */ (record.byteLength) < 1) {
    throw new TypeError(`${label} start observation does not bind this exact request`);
  }
  // The admission-bound definition this request was claimed under, carried by the
  // trusted start observation from the issuing claim, never by a request field.
  const requirements = exactRecord(start.requirements, TERMINAL_REQUIREMENT_FIELDS, 'runner request start.requirements');
  for (const field of TERMINAL_REQUIREMENT_FIELDS) {
    const descriptor = exactRecord(requirements[field], ['path', 'sha256', 'byteLength'], `runner request start.requirements.${field}`);
    if (typeof descriptor.path !== 'string' || typeof descriptor.sha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(descriptor.sha256)
      || !Number.isSafeInteger(descriptor.byteLength) || /** @type {number} */ (descriptor.byteLength) < 0) {
      throw new TypeError(`${label} start observation does not carry the admission-bound requirements`);
    }
  }
  if (CONSUMED_TERMINAL_REQUESTS.has(requestIdentity)) throw new TypeError(`${label} request was already started`);
  // Consumed before any further check: a failed or uncertain start never reruns.
  CONSUMED_TERMINAL_STARTS.add(/** @type {object} */ (requestStart));
  CONSUMED_TERMINAL_REQUESTS.add(requestIdentity);

  const policy = /** @type {Record<string, unknown>} */ (state.policy);
  if (canonicalJson(state) !== canonicalJson({ policy, overallUsed: 0, recoveryUsed: [], pending: [], completed: [] })) {
    throw new TypeError(`${label} admits only a fresh state; the original accepted state stays evidence`);
  }
  const setup = exactRecord(prior.setupReceipt, [
    'version', 'mutation', 'permit', 'receipt', 'targetMapping', 'lanePrestate', 'preimages',
  ], `${label}.setupReceipt`);
  if (setup.version !== 1) throw new TypeError(`${label}.setupReceipt.version must be the literal 1`);
  const claim = validateTerminalFreshClaimMutationV1(setup.mutation, target);
  const mutation = /** @type {Record<string, any>} */ (claim.mutation);
  if (mutation.admissionIdentity !== prior.freshAdmissionIdentity
    || claim.marker.manifestIdentity !== prior.manifestIdentity
    || claim.marker.dispositionIdentity !== prior.dispositionIdentity
    || mutation.ownerLog.ownerPath !== owner.ideaPath) {
    throw new TypeError(`${label} marker does not bind this fresh admission and its terminal evidence`);
  }
  const permit = /** @type {Record<string, unknown>} */ (validateLaneMutationPermitV1(setup.permit, `${label}.setupReceipt.permit`));
  const receipt = /** @type {Record<string, unknown>} */ (
    validateLightweightAtomicReceiptV1(setup.receipt, `${label}.setupReceipt.receipt`)
  );
  const mapping = exactRecord(setup.targetMapping, [
    'version', 'lane', 'target', 'ownerBindingHash', 'tasksPath', 'tasksDescriptor', 'taskStatePath',
    'taskStateDescriptor', 'taskKey',
  ], `${label}.setupReceipt.targetMapping`);
  const prestate = exactRecord(setup.lanePrestate, [
    'version', 'lane', 'target', 'glyph', 'blockedBy', 'tasksDescriptor', 'taskStateDescriptor', 'ownerDescriptor',
  ], `${label}.setupReceipt.lanePrestate`);
  const mappingHash = sha256(canonicalJson(mapping));
  const prestateHash = sha256(canonicalJson(prestate));
  if (permit.lane !== 'lightweight' || permit.operation !== 'work-set'
    || canonicalJson(permit.target) !== canonicalJson(target)
    || permit.subjectRunStateHash !== sha256(canonicalJson(state))
    || permit.governanceIdentity !== null || permit.attemptIdentity !== null
    || permit.mutationIdentity !== claim.mutationIdentity
    || permit.targetMappingHash !== mappingHash || permit.lanePrestateHash !== prestateHash
    || receipt.permitHash !== permit.permitHash || receipt.mutationIdentity !== permit.mutationIdentity
    || receipt.targetMappingHash !== mappingHash || receipt.lanePrestateHash !== prestateHash
    || canonicalJson(receipt.target) !== canonicalJson(target) || receipt.targetStateChanged !== false
    || canonicalJson(mapping.target) !== canonicalJson(target) || canonicalJson(prestate.target) !== canonicalJson(target)
    || prestate.glyph !== '~' || prestate.blockedBy !== null) {
    throw new TypeError(`${label} setup receipt does not bind its exact permit, mutation, and prestate`);
  }
  const preimages = exactRecord(setup.preimages, ['tasks', 'owner', 'taskState'], `${label}.setupReceipt.preimages`);
  const before = {
    tasks: exactCapturedBytes(preimages.tasks, `${label}.setupReceipt.preimages.tasks`),
    owner: exactCapturedBytes(preimages.owner, `${label}.setupReceipt.preimages.owner`),
    taskState: exactCapturedBytes(preimages.taskState, `${label}.setupReceipt.preimages.taskState`),
  };
  const ownerDescriptor = contentDescriptor(before.owner);
  if (canonicalJson(contentDescriptor(before.tasks)) !== canonicalJson(prestate.tasksDescriptor)
    || canonicalJson(contentDescriptor(before.taskState)) !== canonicalJson(prestate.taskStateDescriptor)
    || canonicalJson(ownerDescriptor) !== canonicalJson(prestate.ownerDescriptor)
    || canonicalJson(prestate.tasksDescriptor) !== canonicalJson(mapping.tasksDescriptor)
    || canonicalJson(prestate.taskStateDescriptor) !== canonicalJson(mapping.taskStateDescriptor)
    || mapping.ownerBindingHash !== sha256(canonicalJson({
      ideaPath: owner.ideaPath, specPath: target.specPath, ownerCapture: ownerDescriptor,
    }))
    || mutation.ownerLog.expectedOwnerHash !== ownerDescriptor.sha256) {
    throw new TypeError(`${label} setup preimages do not match their bound prestate`);
  }
  const after = buildLightweightWorkPostimages({
    tasks: before.tasks,
    owner: before.owner,
    taskState: before.taskState,
    tasksPath: tasksPathForSpec(/** @type {string} */ (target.specPath)),
    taskKey: /** @type {string} */ (target.taskKey),
    kind: mutation.kind,
    toGlyph: mutation.toGlyph,
    blocker: mutation.blocker,
    eventLines: [],
    ownerLogLines: mutation.ownerLog.exactLines,
    snapshotUpdatedAt: mutation.snapshotUpdatedAt,
  });
  if ('reason' in after || sha256(after.tasks) !== receipt.tasksPoststateHash
    || sha256(after.taskState) !== receipt.taskStatePoststateHash || sha256(after.owner) !== receipt.ownerPoststateHash) {
    throw new TypeError(`${label} setup receipt is not the rebuilt authorized postimage`);
  }
  const current = freshLaneBinding(root, target, owner);
  // Unchanged spec, plan, and task unit are required; no mapping is supplied for a changed definition.
  const definition = /** @type {Record<string, Record<string, unknown>>} */ (terminalRequirementDescriptors(root, target, current));
  for (const field of TERMINAL_REQUIREMENT_FIELDS) {
    if (canonicalJson(definition[field]) !== canonicalJson(requirements[field])) {
      throw new TypeError(`${label} current requirements differ from the admission-bound definition: ${definition[field].path}`);
    }
  }
  const expected = /** @type {Record<string, Record<string, string>>} */ (current.application.expected);
  const actual = {
    tasks: Buffer.from(expected.tasks.base64, 'base64'),
    owner: Buffer.from(/** @type {Record<string, Record<string, string>>} */ (current.application.owner).ownerCapture.base64, 'base64'),
    taskState: Buffer.from(expected.taskState.base64, 'base64'),
  };
  if (!actual.tasks.equals(after.tasks) || !actual.owner.equals(after.owner) || !actual.taskState.equals(after.taskState)) {
    throw new TypeError(`${label} current lane surfaces differ from the authorized setup poststate`);
  }
}

/**
 * Run one closed coordinator-to-adapter request.
 * @param {unknown} requestValue
 * @param {unknown} [dependenciesValue]
 */
export async function runHostAdapter(requestValue, dependenciesValue) {
  const request = captureExactDataRecord(requestValue, [
    'version', 'root', 'target', 'owner', 'state',
  ], ['assessment', 'specialistResult', 'retainedEvidence', 'priorTerminal'], 'HostAdapterRunnerRequest');
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
  let initialAssessment = Object.hasOwn(request, 'assessment') ? request.assessment : null;
  let initialSpecialistResult = Object.hasOwn(request, 'specialistResult')
    ? request.specialistResult
    : null;
  const dependencies = dependenciesValue === undefined
    ? {}
    : exactRecord(
      dependenciesValue,
      Object.keys(/** @type {Record<string, unknown>} */ (dependenciesValue)),
      'host adapter runner dependencies',
    );
  for (const field of Object.keys(dependencies)) {
    if (!['checkpoint', 'runtime', 'laneOwner', 'exchange', 'retentionSink', 'requestStart'].includes(field)) {
      throw new TypeError(`host adapter runner dependencies contains unknown field '${field}'`);
    }
  }
  if (Object.hasOwn(dependencies, 'exchange') && typeof dependencies.exchange !== 'function') {
    throw new TypeError('host adapter runner dependencies.exchange must be a function');
  }
  // The trusted host's synchronous run-local publication sink. Without it the
  // runner keeps its compatibility behavior and produces no terminal evidence.
  /** @type {{write:(name:string, value:unknown)=>{name:string,sha256:string,byteLength:number}, read:(name:string)=>Uint8Array}|null} */
  let retentionSink = null;
  if (Object.hasOwn(dependencies, 'retentionSink')) {
    const sink = exactRecord(dependencies.retentionSink, ['write', 'read'], 'host adapter runner dependencies.retentionSink');
    if (typeof sink.write !== 'function' || typeof sink.read !== 'function'
      || utilTypes.isProxy(sink.write) || utilTypes.isProxy(sink.read)) {
      throw new TypeError('host adapter runner dependencies.retentionSink must hold write and read functions');
    }
    retentionSink = /** @type {NonNullable<typeof retentionSink>} */ (/** @type {unknown} */ (sink));
  }
  // The driver's trusted single-use start observation of a terminal-qualified
  // request, never a request field. Ordinary requests carry neither.
  const requestStart = Object.hasOwn(dependencies, 'requestStart') ? dependencies.requestStart : null;
  if (Object.hasOwn(request, 'priorTerminal')) {
    verifyTerminalStart(request, root, target, owner, state, requestStart);
  } else if (requestStart !== null) {
    throw new TypeError('host adapter runner dependencies.requestStart applies only to a priorTerminal request');
  }

  /** @type {Record<string, unknown>[]} */
  const steps = [];
  /** @type {Record<string, unknown>[]} */
  const currentRun = [];
  /** @type {{verification:Record<string, unknown>[],review:Record<string, unknown>[],lint:Record<string, unknown>[]}} */
  const observedStreams = { verification: [], review: [], lint: [] };
  /** @type {Record<string, Record<string, unknown>[]>} */
  let retainedEvidence = { currentRun: [], verification: [], review: [], lint: [] };
  /** @type {string|null} */
  let occurrenceIdentity = null;
  /** @type {ReturnType<typeof createHostAdapter>|null} */
  let adapter = null;
  /** The original admitted handle and its admission binding; the terminal seal uses nothing else. @type {ReturnType<typeof createHostAdapter>|null} */
  let ownerHandle = null;
  /** @type {Record<string, unknown>|null} */
  let ownerWorkspace = null;
  /** The admitted lane prestate descriptors an effect-free owner must leave unchanged. @type {Record<string, unknown>|null} */
  let ownerPrestate = null;
  /**
   * The original capture streams the runtime port received, in received order.
   * Every runtime input except a completion capture carries the accumulated
   * streams, which replace these whole. A capture carries the accumulated
   * current run but only its own attempt's specialist streams, each added once,
   * so a stop during a later capture keeps every earlier attempt's captures.
   * Rows are copied as received, never rebuilt.
   * @type {Record<string, unknown[]>|null}
   */
  let received = null;
  // Exchange provenance a terminal seal must account for.
  const initialPairSupplied = Object.hasOwn(request, 'specialistResult') && request.specialistResult !== null;
  let specialistPairExposed = false;
  let challengesClosed = false;
  /** @type {((terminal:Record<string, unknown>)=>Record<string, unknown>)|undefined} */
  let finalizeInitialAssessmentRejection;
  /** @type {Record<string, unknown>|null} */
  let currentInspection = null;
  /** The terminal operation's evidence, separate from the model's last explicit Inspection. @type {Record<string, unknown>|null} */
  let reportInspection = null;
  /** @type {Record<string, unknown>|null} */
  let carriedBlocker = null;
  /** @type {{budget:string,limit:number,required:number,source:string,target:Record<string, unknown>|null}|null} */
  let carriedCapacity = null;
  /**
   * The evidence hash the carried capacity may bind, established at the moment
   * the refusal is observed. An acquisition refusal has none, so it stays null
   * and no older Inspection hash is ever borrowed.
   * @type {string|null}
   */
  let capacityEvidenceHash = null;
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

  /** @param {unknown} value @param {unknown} reason @param {unknown} evidence */
  const boundBlocker = (value, reason, evidence) => {
    try {
      const blocker = /** @type {Record<string, unknown>} */ (validateBlocker(value));
      const inspection = /** @type {Record<string, unknown>} */ (validateInspection(evidence));
      if (blocker.code !== reason || blocker.evidenceHash !== inspection.evidenceHash
        || canonicalJson(inspection.target) !== canonicalJson(target)) {
        throw new TypeError('blocker binding mismatch');
      }
      return clone(blocker);
    } catch {
      throw new TypeError('runtime-blocker-invalid');
    }
  };

  /**
   * The single terminal chokepoint: every terminal result of the deterministic
   * unattended run flows through here, so the halt report is attached here and
   * nowhere else. A `hard-stop` row carries the resolved-or-explicitly-unresolved
   * report the landed `describeUnattendedHalt` primitive returns for this run's
   * own halt outcome; an `ended` row (task-settled, controlled-end, cancelled) is
   * a clean settlement and carries `haltReport: null`. The runner — not the model
   * — establishes the stop and its attribution, so the report is deterministic.
   * The computation is wrapped so `finish` can never throw: a state that cannot be
   * decoded, or an absent/undescribable Inspection, fails closed to the exact
   * unresolved report shape `describeUnattendedHalt` itself returns.
   * @param {Record<string, unknown>} row
   * @param {(terminal:Record<string, unknown>)=>Record<string, unknown>} [finalizeRejectedAssessment]
   */
  const finish = (row, finalizeRejectedAssessment) => {
    if (!['ended', 'hard-stop'].includes(/** @type {string} */ (row.outcome))) {
      throw new TypeError('runner attempted to return a nonterminal result');
    }
    let haltReport = null;
    let validDiagnostics = false;
    if (row.outcome === 'hard-stop') {
      haltReport = { halted: true, resolved: false, unresolved: ['reason', 'subject'] };
      try {
        const haltState = JSON.parse(
          Buffer.from(/** @type {string} */ (row.stateBase64), 'base64').toString('utf8'),
        );
        const blocker = carriedBlocker === null
          ? null
          : boundBlocker(carriedBlocker, row.reason, reportInspection);
        const report = describeUnattendedHalt({
          state: haltState,
          reason: row.reason,
          ...(blocker === null ? {} : { blocker }),
        }, reportInspection);
        if (report !== null) haltReport = report;
        validDiagnostics = true;
      } catch {
        // Fail closed: keep the unresolved report; `finish` must never throw.
      }
      // A recognized capacity refusal binds only the evidence hash established
      // when it was observed. An acquisition refusal — initial or late — has
      // none, so the report carries `evidenceHash: null` rather than an older
      // Inspection's hash. Its runtime-owned fields still resolve the halt.
      // Without a canonical target the report stays unresolved alongside the
      // bounded diagnostic.
      if (validDiagnostics && carriedCapacity !== null && row.reason === 'evidence-incomplete'
        && carriedBlocker === null
        && (haltReport.resolved !== true || haltReport.evidenceHash !== capacityEvidenceHash)) {
        try {
          haltReport = {
            halted: true,
            resolved: true,
            reason: 'evidence-incomplete',
            stopClass: classifyOutcomeReason('evidence-incomplete'),
            target: /** @type {Record<string, unknown>} */ (canonicalTarget(target)),
            subject: capacitySubject(carriedCapacity),
            nextAction: HALT_NEXT_ACTIONS[classifyOutcomeReason('evidence-incomplete')],
            evidenceHash: capacityEvidenceHash,
          };
        } catch {
          // No canonical target: keep the unresolved report.
        }
      }
    }
    const terminal = {
      ...row,
      type: 'result',
      step: 'result',
      occurrenceIdentity,
      steps,
      haltReport,
    };
    // A nominated 056 release keeps precedence; the owner's seal never follows it.
    if (retentionSink !== null && finalizeRejectedAssessment === undefined) return retainedTerminal(terminal);
    if (finalizeRejectedAssessment === undefined) return terminal;
    // Retain the Work stop and its halt attribution before any resource release.
    const released = {
      ...terminal,
      ...(validDiagnostics
        ? finalizeRejectedAssessment(terminal)
        : { cleanupReason: 'terminal-report-unavailable' }),
    };
    // Whether released, refused, or failed partway, 056 keeps its own diagnostics:
    // the sink receives only ordinary captures, never terminal proof.
    if (retentionSink !== null) retainCaptures(retentionSink);
    return released;
  };

  /**
   * The exact current requirement and lane surfaces one terminal manifest
   * binds, read once from the same bytes the lane binding validated. Throws
   * when the workspace, exact owner, or single task mapping no longer resolves.
   */
  const terminalSurfaces = () => {
    if (fs.realpathSync(path.resolve(/** @type {string} */ (request.root))) !== root) {
      throw new TypeError('workspace-changed');
    }
    const binding = freshLaneBinding(root, target, owner);
    const tasksPath = /** @type {string} */ (binding.targetMapping.tasksPath);
    const lane = /** @type {Record<string, Record<string, unknown>>} */ (binding.lanePrestate);
    return {
      binding,
      requirements: terminalRequirementDescriptors(root, target, binding),
      lanePoststate: {
        tasks: { path: tasksPath, ...lane.tasksDescriptor },
        owner: { path: owner.ideaPath, ...lane.ownerDescriptor },
        taskState: { path: WORKSPACE_PATHS.TASK_STATE, ...lane.taskStateDescriptor },
      },
    };
  };

  /**
   * The first current lane surface this owner's own settled writes do not
   * explain: unchanged admitted prestate without a write, otherwise the exact
   * poststate of its last committed receipt.
   * @param {ReturnType<typeof terminalSurfaces>} surfaces @param {Record<string, unknown>[]} receipts
   */
  const unexplainedLaneSurface = (surfaces, receipts) => {
    const prestate = /** @type {Record<string, Record<string, unknown>>} */ (ownerPrestate);
    const last = receipts.at(-1);
    const expected = last === undefined
      ? {
        tasks: prestate.tasksDescriptor.sha256,
        taskState: prestate.taskStateDescriptor.sha256,
        owner: prestate.ownerDescriptor.sha256,
      }
      : { tasks: last.tasksPoststateHash, taskState: last.taskStatePoststateHash, owner: last.ownerPoststateHash };
    for (const field of ['tasks', 'taskState', 'owner']) {
      const current = /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (surfaces.lanePoststate)[field]);
      if (current.sha256 !== expected[field]) return /** @type {string} */ (current.path);
    }
    return null;
  };

  /** @param {{present:boolean|null,same:boolean|null}|null|undefined} artifact */
  const keptFact = (artifact) => (artifact?.present === true ? 'retained' : 'unestablished');

  /**
   * A fresh observation decides each artifact's fact. When it cannot establish
   * presence, only this disposal's own confirmed removal of that artifact is kept;
   * an unlink alone is never called a removal.
   * @param {{present:boolean|null,same:boolean|null}|null|undefined} artifact
   * @param {boolean} attempted @param {boolean} confirmed The guarded clear removed it and freshly found it absent.
   */
  const removalFact = (artifact, attempted, confirmed) => {
    if (artifact === null || artifact === undefined || artifact.present === null) {
      return confirmed ? 'removed' : 'unestablished';
    }
    if (!artifact.present) return attempted ? 'removed' : 'unestablished';
    return attempted && artifact.same === false ? 'unestablished' : 'retained';
  };

  /**
   * The original owner's terminal path for one hard stop: fence its own
   * capability, retain immutable evidence content first and manifest last,
   * account for every entered effect, recheck the exact basis, remove the exact
   * pair once, and publish a separate disposition. It never throws and never
   * retries: the original terminal returns unchanged with auxiliary resource
   * fields only, and a refusal names exactly one first missing proof.
   * @param {Record<string, unknown>} terminal
   * @param {NonNullable<typeof retentionSink>} sink
   * @param {Record<string, unknown[]>|null} captures
   */
  const disposeTerminal = (terminal, sink, captures) => {
    /** @type {Map<string, string>} */
    const failures = new Map();
    /** @param {string} kind @param {string} subject */
    const fail = (kind, subject) => {
      if (!failures.has(kind)) failures.set(kind, subject);
    };
    const firstFailure = () => MISSING_PROOF_ORDER.find((kind) => failures.has(kind)) ?? null;
    const workspaceIdentity = sha256(canonicalJson({ version: 1, root }));
    // The store derives the same key from the same workspace and target.
    const pairKey = sha256(canonicalJson({ version: 1, workspaceIdentity, target }));
    let stage = 'owner-fence';
    /** @type {string|null} */
    let manifestIdentity = null;
    /** @type {{checkpoint:string,claim:string}} */
    let removal = { checkpoint: 'unestablished', claim: 'unestablished' };
    let attempted = false;
    let cleared = false;
    try {
      // Fence the original admitted handle; no later caller can supply this proof.
      /** @type {ReturnType<NonNullable<typeof ownerHandle>['sealTerminalOwner']>|null} */
      let sealed = null;
      if (ownerHandle === null) {
        const observed = /** @type {Record<string, unknown>|null} */ (adapter?.ownership() ?? null);
        removal = {
          checkpoint: observed?.checkpointPresent === true ? 'retained' : 'unestablished',
          claim: observed?.claimPresent === true ? 'retained' : 'unestablished',
        };
        fail('owner-fence', pairKey);
      } else {
        sealed = ownerHandle.sealTerminalOwner();
        const observed = /** @type {Record<string, {present:boolean|null,same:boolean|null}>|null} */ (sealed.observed);
        removal = { checkpoint: keptFact(observed?.checkpoint), claim: keptFact(observed?.claim) };
        if (sealed.fence === null || adapter !== ownerHandle) fail('owner-fence', pairKey);
      }
      const fence = /** @type {Record<string, unknown>|null} */ (sealed?.fence ?? null);
      if (fence !== null
        && (terminal.stateHash !== fence.acceptedStateHash || terminal.acceptedRevision !== fence.acceptedRevision
          || sha256(Buffer.from(String(terminal.stateBase64), 'base64')) !== fence.acceptedStateHash)) {
        fail('owner-fence', pairKey);
      }

      stage = 'effect-settlement';
      /** @type {ReturnType<typeof terminalSurfaces>|null} */
      let surfaces = null;
      /** @type {Record<string, unknown>|null} */
      let effects = null;
      if (fence !== null && sealed !== null) {
        const owned = /** @type {Record<string, unknown>} */ (sealed.effects);
        if (owned.unaccounted !== null) fail('effect-settlement', /** @type {string} */ (owned.unaccounted));
        if (outstandingChallenge !== null) fail('effect-settlement', /** @type {string} */ (outstandingChallenge.kind));
        if (initialPairSupplied || specialistPairExposed) fail('effect-settlement', 'specialist-pair');
        try {
          surfaces = terminalSurfaces();
        } catch {
          fail('current-target', /** @type {string} */ (target.taskKey));
        }
        if (surfaces !== null) {
          const unexplained = unexplainedLaneSurface(surfaces, /** @type {Record<string, unknown>[]} */ (owned.receipts));
          if (unexplained !== null) fail('effect-settlement', unexplained);
        }
        if (sealed.pairFailure !== null) fail('exact-control-pair', pairKey);
        effects = {
          ...owned,
          exchange: {
            challenges: challengeCount,
            consumed: consumedChallenges.size,
            outstanding: outstandingChallenge === null ? null : outstandingChallenge.kind,
            specialistPairExposed,
            initialSpecialistPair: initialPairSupplied,
          },
          qualified: !failures.has('effect-settlement'),
        };
      }

      // Retain immutable evidence: content first, manifest last, then reread.
      stage = 'retained-source';
      /** @type {(ReturnType<typeof publishDetached> & {role:string})[]} */
      const members = [];
      /** @param {string} role @param {string} name @param {unknown} value */
      const retain = (role, name, value) => {
        try {
          members.push({ role, ...publishDetached(sink, name, value) });
          return true;
        } catch {
          fail('retained-source', name);
          return false;
        }
      };
      let complete = retain('original-terminal', TERMINAL_ORIGINAL_FILE, terminal);
      if (captures !== null) complete = retain('captures', CAPTURES_FILE, captures) && complete;
      else if (fence !== null) {
        fail('retained-source', CAPTURES_FILE);
        complete = false;
      }
      if (complete && fence !== null && sealed !== null && effects !== null && surfaces !== null) {
        complete = retain('controls', TERMINAL_CONTROLS_FILE, sealed.controls)
          && retain('host-fence', TERMINAL_FENCE_FILE, fence)
          && retain('effects', TERMINAL_EFFECTS_FILE, effects);
        if (complete) {
          const binding = {
            workspaceIdentity,
            owner: { ideaPath: owner.ideaPath, specPath: owner.specPath },
            target: clone(target),
            invocationIdentity: fence.invocationIdentity,
            admissionIdentity: fence.admissionIdentity,
            supervisorAuthorityIdentity: fence.supervisorAuthorityIdentity,
            workerTokenHash: fence.workerTokenHash,
            workerGeneration: fence.workerGeneration,
            checkpointKey: fence.checkpointKey,
            claimHash: fence.claimHash,
            checkpointHash: fence.checkpointHash,
            acceptedStateHash: fence.acceptedStateHash,
            acceptedStateByteLength: fence.acceptedStateByteLength,
            acceptedRevision: fence.acceptedRevision,
            checkpointHostRevision: fence.checkpointHostRevision,
            fenceHostRevision: fence.fenceHostRevision,
            requirements: surfaces.requirements,
            lanePoststate: surfaces.lanePoststate,
            terminalOutcome: terminal.outcome,
            terminalReason: terminal.reason,
            terminalHash: sha256(canonicalJson(terminal)),
          };
          const files = members.map(({ role, descriptor }) => ({
            role, name: descriptor.name, sha256: descriptor.sha256, byteLength: descriptor.byteLength,
          }));
          const manifest = validateTerminalEvidenceManifestV1({
            version: 1,
            kind: 'terminal-work-evidence',
            binding,
            files,
            inventoryHash: sha256(canonicalJson({ binding, files })),
          });
          if (retain('manifest', TERMINAL_EVIDENCE_FILE, manifest)) {
            // Acknowledge retention only after every member and the manifest reread
            // as exactly the original material fixed before the sink saw any of it.
            let reread = true;
            for (const member of members) {
              try {
                const material = rereadExactly(sink, member);
                if (member.role === 'manifest') validateTerminalEvidenceManifestV1(material);
              } catch {
                fail('retained-source', member.name);
                reread = false;
                break;
              }
            }
            if (reread) manifestIdentity = sha256(canonicalJson(manifest));
          }
        }
      }

      // Recheck the exact current basis immediately before removal.
      stage = 'current-target';
      if (firstFailure() === null && manifestIdentity !== null && surfaces !== null) {
        try {
          const now = terminalSurfaces();
          for (const [group, fields] of /** @type {[string, string[]][]} */ ([
            ['requirements', ['spec', 'plan', 'taskUnit']], ['lanePoststate', ['tasks', 'owner', 'taskState']],
          ])) {
            for (const field of fields) {
              const before = /** @type {Record<string, Record<string, unknown>>} */ (surfaces)[group][field];
              const after = /** @type {Record<string, Record<string, unknown>>} */ (now)[group][field];
              if (canonicalJson(before) !== canonicalJson(after)) fail('current-target', /** @type {string} */ (before.path));
            }
          }
        } catch {
          fail('current-target', /** @type {string} */ (target.taskKey));
        }
      }

      // Consume the private one-use capability through the existing guarded clear.
      stage = 'removal-absence';
      if (firstFailure() === null && manifestIdentity !== null && sealed !== null && sealed.dispose !== null) {
        const outcome = sealed.dispose(manifestIdentity);
        attempted = outcome.attempted;
        cleared = outcome.cleared;
        const observed = /** @type {Record<string, {present:boolean|null,same:boolean|null}>|null} */ (outcome.observed);
        const confirmed = /** @type {readonly string[]} */ (outcome.removed);
        removal = {
          checkpoint: removalFact(observed?.checkpoint, attempted, confirmed.includes('checkpoint')),
          claim: removalFact(observed?.claim, attempted, confirmed.includes('claim')),
        };
        if (outcome.stage === 'owner') fail('owner-fence', pairKey);
        else if (outcome.stage === 'effects') fail('effect-settlement', pairKey);
        else if (outcome.stage === 'pair') fail('exact-control-pair', pairKey);
        else if (outcome.stage !== 'removed') fail('removal-absence', pairKey);
      } else if (firstFailure() === null) {
        fail('retained-source', TERMINAL_EVIDENCE_FILE);
      }
    } catch {
      // An unexpected failure stops at the current lifecycle step; nothing retries.
      fail(stage, stage === 'retained-source' ? TERMINAL_EVIDENCE_FILE : pairKey);
    }

    const first = firstFailure();
    const disposed = first === null && attempted && cleared;
    const missingProof = (/** @type {string} */ kind, /** @type {string} */ subject) => ({
      kind, subject, required: MISSING_PROOF_TEXT[kind][0], nextOwnerAction: MISSING_PROOF_TEXT[kind][1],
    });
    /** @type {Record<string, unknown>} */
    let record = disposed
      ? {
        version: 1, manifestIdentity, outcome: 'disposed', removal: { checkpoint: 'absent', claim: 'absent' }, missingProof: null,
      }
      : {
        version: 1,
        manifestIdentity,
        outcome: 'refused',
        removal,
        missingProof: missingProof(first ?? 'removal-absence', first === null ? pairKey : /** @type {string} */ (failures.get(first))),
      };
    /** @type {string|null} */
    let dispositionIdentity = null;
    try {
      validateTerminalDispositionV1(record);
      // The record itself never reaches the sink; its reread must be exactly this expectation.
      const published = publishDetached(sink, TERMINAL_DISPOSITION_FILE, record);
      validateTerminalDispositionV1(rereadExactly(sink, published));
      dispositionIdentity = sha256(published.expected);
    } catch {
      // Removal facts stay as observed; an unpublished disposition proves nothing more.
      if (record.outcome === 'disposed') {
        record = {
          version: 1,
          manifestIdentity,
          outcome: 'refused',
          removal: { checkpoint: 'removed', claim: 'removed' },
          missingProof: missingProof('removal-absence', TERMINAL_DISPOSITION_FILE),
        };
      }
    }
    return {
      ...terminal,
      ...(disposed ? { cleanup: 'cleared', orphan: false } : attempted ? { cleanup: 'failed' } : {}),
      terminalDisposition: { ...record, dispositionIdentity },
    };
  };

  /**
   * Ordinary capture retention: the original received captures go to the
   * trusted host sink, which records and reports its own publication failure.
   * @param {NonNullable<typeof retentionSink>} sink
   */
  const retainCaptures = (sink) => {
    if (received === null) return;
    try {
      sink.write(CAPTURES_FILE, received);
    } catch {
      // The host sink records and reports its own publication failure.
    }
  };

  /**
   * With the trusted host sink, every terminal outside a nominated 056 release
   * hands the original received captures to it; only a hard stop enters the
   * owner's disposition path.
   * @param {Record<string, unknown>} terminal
   */
  const retainedTerminal = (terminal) => {
    const sink = /** @type {NonNullable<typeof retentionSink>} */ (retentionSink);
    challengesClosed = true;
    if (terminal.outcome === 'hard-stop') return disposeTerminal(terminal, sink, received);
    retainCaptures(sink);
    return terminal;
  };

  /** @param {string} step @param {Record<string, unknown>} result */
  const recordStep = (step, result) => {
    reportInspection = runtimeInspection === null
      ? null
      : clone(validateInspection(runtimeInspection));
    const blocker = Object.hasOwn(result, 'blocker')
      ? boundBlocker(result.blocker, result.reason, reportInspection)
      : null;
    // Capacity is independent of a carried blocker. An acquisition refusal
    // returned no Inspection, so it must not borrow an earlier evidence hash.
    const capacity = Object.hasOwn(result, 'capacity')
      ? validateCapacityDiagnostic(result.capacity)
      : null;
    if (Object.hasOwn(result, 'capacity') && capacity === null) {
      throw new TypeError('runtime-capacity-invalid');
    }
    carriedBlocker = blocker;
    carriedCapacity = capacity;
    capacityEvidenceHash = capacity === null || reportInspection === null
      ? null
      : /** @type {string} */ (reportInspection.evidenceHash);
    const row = stateResult(/** @type {Record<string, unknown>} */ (result.session), {
      type: 'step',
      step,
      outcome: result.outcome,
      reason: result.reason,
      ...(blocker === null ? {} : { blocker }),
      ...(capacity === null ? {} : { capacity }),
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

  /**
   * @param {string} reason @param {string} detail
   * @param {(terminal:Record<string, unknown>)=>Record<string, unknown>} [finalizeRejectedAssessment]
   */
  const orphan = (reason, detail, finalizeRejectedAssessment) => {
    reportInspection = null;
    carriedBlocker = null;
    carriedCapacity = null;
    capacityEvidenceHash = null;
    const row = adapter === null
      ? initialStateResult(state, {
        type: 'step', step: 'runner', outcome: 'hard-stop', reason, detail,
        orphan: true, cleanup: 'not-attempted', target: clone(target),
      })
      : stateResult(adapter.snapshot(), {
        type: 'step', step: 'runner', outcome: 'hard-stop', reason, detail,
        orphan: true, cleanup: 'not-attempted', target: clone(target),
        ...(adapter.ownership() === null ? {} : { ownership: adapter.ownership() }),
      });
    steps.push(row);
    return finish(row, finalizeRejectedAssessment);
  };

  /** @param {Record<string, unknown>|null} blocker @param {string} detail */
  const refuseAdmission = (blocker, detail) => {
    carriedBlocker = blocker === null ? null : boundBlocker(blocker, blocker.code, reportInspection);
    const row = initialStateResult(state, {
      type: 'step', step: 'runner', outcome: 'hard-stop',
      reason: blocker?.code ?? 'evidence-incomplete', detail,
      ...(carriedBlocker === null ? {} : { blocker: carriedBlocker }),
    });
    steps.push(row);
    return finish(row);
  };

  /** @param {string[]} fields */
  const retainedSourceDetail = (fields) => {
    const missing = fields.filter(field => retainedEvidence[field].length === 0);
    const sources = (missing.length > 0 ? missing : fields)
      .map(field => field === 'currentRun' ? 'current-run' : field);
    return `retainedEvidence: ${missing.length > 0 ? 'missing' : 'invalid'} ${sources.join('/')}`;
  };

  /** @param {string} step @param {string} operation @param {Record<string, unknown>} payload @param {string} [correctionIdentity] */
  const run = (step, operation, payload, correctionIdentity) => {
    const current = /** @type {NonNullable<typeof adapter>} */ (adapter).snapshot();
    // A later refusal must not inherit evidence or diagnostics from an earlier
    // operation. Keep the explicit model Inspection for challenge binding only.
    runtimeInspection = null;
    reportInspection = null;
    carriedBlocker = null;
    carriedCapacity = null;
    capacityEvidenceHash = null;
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
    currentRun: retainedEvidence.currentRun.length === 0 && currentRun.length === 0
      ? []
      : [currentRunCapture(target, currentRun)],
    review: [],
    verification: [],
    lint: [],
    policyMode: 'autonomous',
  });
  const runtimeInput = () => {
    const input = transportInput(rawInput());
    for (const field of RETAINED_STREAMS) {
      input[field] = [
        ...Array.prototype.values.call(retainedEvidence[field]),
        ...(field === 'currentRun' ? input.currentRun : observedStreams[field]),
      ];
    }
    return input;
  };

  /**
   * Classify one untrusted Assessment against the outstanding target and the
   * exact current Inspection. `validateAssessment` is the first consumer and
   * sole authority. After it accepts the raw value, `structuredClone` captures
   * one inert representation and that exact representation is fully revalidated
   * before acceptance. Staleness is claimed only when the raw validation failure
   * is the known hash mismatch and replacing only that field in an inert
   * representation makes the whole Assessment valid.
   * @param {unknown} value @param {Record<string, unknown>} inspection
   * @returns {{status:'valid',assessment:Record<string, unknown>}
   *   |{status:'stale'}|{status:'invalid',detail:string}}
   */
  const classifyAssessment = (value, inspection) => {
    let valid = true;
    try {
      validateAssessment(target, inspection, value);
    } catch {
      valid = false;
    }
    if (valid) {
      try {
        const captured = structuredClone(value);
        validateAssessment(target, inspection, captured);
        return { status: 'valid', assessment: /** @type {Record<string, unknown>} */ (captured) };
      } catch {
        return { status: 'invalid', detail: ASSESSMENT_INVALID_DETAIL };
      }
    }
    try {
      // Standalone validation proves the raw Assessment has no defect except a
      // possible binding mismatch. Cloning then rebinding only evidenceHash
      // proves whether that mismatch is the sole defect without inspecting the
      // untrusted thrown value or invoking an Assessment accessor.
      validateAssessment(value);
      const rebound = /** @type {Record<string, unknown>} */ (structuredClone(value));
      rebound.evidenceHash = inspection.evidenceHash;
      validateAssessment(target, inspection, rebound);
      return { status: 'stale' };
    } catch {
      // Any structural, cloning, or rebound failure is malformed, not stale.
    }
    return { status: 'invalid', detail: ASSESSMENT_INVALID_DETAIL };
  };

  /** @param {unknown} value */
  const preflightSpecialistResult = (value) => {
    try {
      return prepareSpecialistResult(
        /** @type {NonNullable<typeof adapter>} */ (adapter).snapshot().acceptedState,
        value,
      ).result;
    } catch {
      // Do not clone, repair, or accept rejected raw data. The receiver repeats
      // validation and alone decides whether this inert rejection has surviving
      // authority for correction or must hard-stop.
      return value;
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
    if (challengesClosed) {
      return { terminal: orphan('challenge-admission-closed', kind) };
    }
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
    // A published specialist-pair challenge exposes dispatch to the coordinator.
    if (kind === 'specialist-pair') specialistPairExposed = true;
    if (!Object.hasOwn(dependencies, 'exchange')) {
      return { terminal: orphan('exchange-unavailable', kind) };
    }
    let responseValue;
    try {
      responseValue = await /** @type {Function} */ (dependencies.exchange)(clone(challenge));
    } catch (error) {
      return {
        terminal: orphan(
          exchangeFailureReason(error),
          EXCHANGE_FAILURE_DETAIL,
        ),
      };
    }
    if (responseValue === undefined || responseValue === null) {
      return { terminal: orphan('exchange-context-lost', kind) };
    }
    let response;
    try {
      response = captureExactDataRecord(
        responseValue,
        ['version', 'type', 'challengeIdentity', 'kind'],
        ['assessment', 'specialistResult', 'review'],
        'HostAdapterChallengeResponse',
      );
    } catch {
      return {
        terminal: orphan(
          'challenge-response-invalid',
          CHALLENGE_ENVELOPE_INVALID_DETAIL,
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
      } catch {
        return {
          terminal: orphan(
            'challenge-response-invalid',
            CHALLENGE_ENVELOPE_INVALID_DETAIL,
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
    } catch {
      return {
        terminal: orphan(
          'challenge-response-invalid',
          CHALLENGE_ENVELOPE_INVALID_DETAIL,
        ),
      };
    }
    consumedChallenges.add(challenge.challengeIdentity);
    outstandingChallenge = null;
    return { value: response[field] };
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
   * Apply the adapter's offered correction once for a valid payload rejected by
   * a port. A locally invalid specialist result needs fresh inspection and its
   * actual owners, never replay of that same known-invalid record.
   * @param {string} step @param {string} operation @param {Record<string, unknown>} payload
   */
  const runSemantic = (step, operation, payload) => {
    let result = run(step, operation, payload);
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
    if (next.kind === 'correction'
      && !(operation === 'record-attempt-result' && result.incidentClass === 'malformed-request')) {
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
      // An item this preparation's fresh Inspection already holds exactly once
      // on both surfaces, such as a re-derived governance event from an earlier
      // invocation, needs no lane write: the lane owner refuses that no-op as a
      // replay. Settlement still verifies both surfaces before acceptance.
      const retained = runtimeInspection === null
        ? null
        : retainedProjectionPrefixV2(runtimeInspection, batch);
      if (retained === null || 'reason' in retained) {
        return { terminal: orphan('projection-plan-mismatch', label) };
      }
      if (index < retained.count) continue;

      const stagedRecord = clone(item.currentRunRecord);
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
      currentRun.push(stagedRecord);
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

  /**
   * The accumulated earlier captures every later operation will carry, plus a fresh
   * lane binding, so the adapter can measure a known completion before accepting it.
   * @param {Record<string, unknown>} input
   */
  const completionFit = (input) => {
    let laneBinding = null;
    try {
      const binding = freshLaneBinding(root, target, owner);
      laneBinding = {
        lanePrestate: binding.lanePrestate,
        targetMapping: binding.targetMapping,
        operationTime: canonicalTime(),
      };
    } catch {
      // The capture must still reach the runtime so its records are retained. An
      // unreadable lane leaves only its write footprint unmeasured here; the next
      // preparation reacquires that same binding and owns its refusal.
    }
    return {
      captures: { verification: input.verification, review: input.review, lint: input.lint },
      ...(laneBinding === null ? {} : { laneBinding }),
    };
  };

  /** @param {boolean} allowInitial */
  const requestAssessment = async (allowInitial) => {
    if (allowInitial && initialAssessment !== null) {
      const candidate = classifyAssessment(
        initialAssessment,
        /** @type {Record<string, unknown>} */ (currentInspection),
      );
      initialAssessment = null;
      if (candidate.status === 'valid') return { value: candidate.assessment, initial: true };
      initialSpecialistResult = null;
    }
    const response = await exchange('assessment', {
      modelPacket: modelPacket(currentInspection),
    });
    if (response.terminal) return response;
    const assessment = classifyAssessment(
      response.value,
      /** @type {Record<string, unknown>} */ (currentInspection),
    );
    if (assessment.status === 'valid') return { value: assessment.assessment, initial: false };
    // Only a matched first exchange's rejected payload can nominate owner cleanup.
    const finalize = allowInitial && challengeCount === 1
      && consumedChallenges.size === 1 && outstandingChallenge === null
      ? finalizeInitialAssessmentRejection
      : undefined;
    return assessment.status === 'stale'
      ? { terminal: orphan('challenge-response-stale', 'assessment', finalize) }
      : { terminal: orphan('challenge-response-invalid', assessment.detail, finalize) };
  };

  /** @param {boolean} allowInitial @param {Record<string, unknown>} assessment */
  const requestSpecialistPair = async (allowInitial, assessment) => {
    if (allowInitial && initialSpecialistResult !== null) {
      const candidate = preflightSpecialistResult(initialSpecialistResult);
      initialSpecialistResult = null;
      return { value: candidate };
    }
    const response = await exchange('specialist-pair', {
      assessmentIdentity: sha256(canonicalJson(assessment)),
    });
    if (response.terminal) return response;
    return { value: preflightSpecialistResult(response.value) };
  };

  try {
    const initialBinding = freshLaneBinding(root, target, owner);
    if (initialBinding.task.glyph !== '~' || initialBinding.task.blockedBy !== null) {
      throw new TypeError('lane-prestate-mismatch');
    }
    let initialInspection;
    try {
      if (Object.hasOwn(request, 'retainedEvidence')) {
        const supplied = captureExactDataRecord(request.retainedEvidence, RETAINED_STREAMS, [], 'retainedEvidence');
        for (const field of RETAINED_STREAMS) {
          assertDenseDataArrayLength(supplied[field], `retainedEvidence.${field}`);
        }
        retainedEvidence = /** @type {Record<string, Record<string, unknown>[]>} */ (supplied);
      }
      initialInspection = runCommand('inspect', {
        trigger: 'explicit-inspection', input: runtimeInput(),
      }).inspection;
      // The receiver charges and validates original acquisitions before this
      // private snapshot. The runner entry accepts only its JSON byte transport.
      for (const field of RETAINED_STREAMS) {
        for (const entry of retainedEvidence[field]) {
          exactRecord(entry.bytes, ['base64'], `retainedEvidence.${field} bytes`);
        }
      }
      retainedEvidence = clone(retainedEvidence);
    } catch (error) {
      if (!Object.hasOwn(request, 'retainedEvidence')
        || !(error instanceof TypeError) || capacityDiagnostic(error) !== null) throw error;
      return refuseAdmission(null, retainedInputFailureDetail(error));
    }
    currentInspection = clone(initialInspection);
    reportInspection = clone(initialInspection);
    if (initialInspection.blockers.length > 0) {
      const blocker = initialInspection.blockers[0];
      const field = blocker.subject === 'current-run' ? 'currentRun' : blocker.subject;
      return refuseAdmission(blocker, RETAINED_STREAMS.includes(field)
        ? retainedSourceDetail([field])
        : 'inspection prerequisites unavailable');
    }
    const retention = inspectRetainedOccurrencesV2(initialInspection);
    if (retention.blocker) {
      return refuseAdmission(retention.blocker, retainedSourceDetail(
        retention.source === 'current-run' ? ['currentRun'] : ['verification', 'review'],
      ));
    }

    if (Object.hasOwn(dependencies, 'runtime')) {
      const injected = exactRecord(dependencies.runtime, ['identity', 'invoke'], 'host adapter runner runtime');
      if (typeof injected.identity !== 'string' || typeof injected.invoke !== 'function') {
        throw new TypeError('host adapter runner runtime must be one existing runtime port');
      }
    }
    /** The driver's former retention bookkeeping, now over adapter-observed inputs. @param {Record<string, unknown>} lowLevelRequest */
    const retainReceived = (lowLevelRequest) => {
      const input = lowLevelRequest.input;
      if (input === null || typeof input !== 'object' || Array.isArray(input)
        || !RETAINED_STREAMS.every((field) => Array.isArray(/** @type {Record<string, unknown>} */ (input)[field]))) {
        return;
      }
      /** @type {Record<string, unknown[]>} */
      const streams = Object.fromEntries(RETAINED_STREAMS.map((field) => [
        field, JSON.parse(JSON.stringify(/** @type {Record<string, unknown>} */ (input)[field])),
      ]));
      const accumulated = received;
      if (lowLevelRequest.mode === 'capture' && accumulated !== null) {
        accumulated.currentRun = streams.currentRun;
        for (const field of ATTEMPT_STREAMS) {
          for (const row of streams[field]) {
            const bytes = canonicalJson(row);
            if (!accumulated[field].some((entry) => canonicalJson(entry) === bytes)) accumulated[field].push(row);
          }
        }
      } else {
        received = streams;
      }
    };
    /**
     * The adapter's trusted observer at its actual runtime boundary. It sees the
     * exact frozen input before the reducer and an inert result after, and it
     * can neither choose a route nor replace a result.
     * @param {Record<string, unknown>} observation
     */
    const observeRuntime = (observation) => {
      if (observation.phase === 'input') {
        // Some semantic operations invoke more than one low-level route. Only
        // the final call can establish evidence for that operation's refusal.
        runtimeInspection = null;
        const lowLevelRequest = /** @type {Record<string, unknown>} */ (observation.request);
        if (lowLevelRequest.mode === 'capture') {
          const input = /** @type {Record<string, unknown>} */ (lowLevelRequest.input);
          appendUniqueRows(observedStreams.verification, input.verification);
          appendUniqueRows(observedStreams.review, input.review);
          appendUniqueRows(observedStreams.lint, input.lint);
        }
        retainReceived(lowLevelRequest);
        return;
      }
      try {
        const output = /** @type {Record<string, unknown>|null} */ (observation.output);
        if (output === null) return;
        const envelope = exactRecord(output, ['status', 'value'], 'runtime result');
        const value = envelope.value;
        if (envelope.status === 'returned' && value !== null && typeof value === 'object'
          && Object.hasOwn(value, 'inspection')) {
          const inspection = /** @type {Record<string, unknown>} */ (
            validateInspection(/** @type {Record<string, unknown>} */ (value).inspection)
          );
          if (canonicalJson(inspection.target) === canonicalJson(target)) {
            runtimeInspection = clone(inspection);
          }
        }
      } catch {
        // The adapter owns authoritative result validation and sanitization.
        // An invalid observation supplies no report evidence.
      }
    };
    const ports = {
      supervisorSession: supervisorSession(),
      noEffectAuthority: noEffectAuthority(root, target, owner, currentRun),
      ...(Object.hasOwn(dependencies, 'runtime') ? { runtime: dependencies.runtime } : {}),
      runtimeEvidence: observeRuntime,
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

    const admittedAdapter = adapter;
    const admittedWorkspace = checkpointWorkspace(initialBinding, root);
    ownerHandle = admittedAdapter;
    ownerWorkspace = admittedWorkspace;
    ownerPrestate = clone(initialBinding.lanePrestate);
    finalizeInitialAssessmentRejection = (terminal) => {
      const refuse = (cleanupReason) => ({ cleanup: 'not-attempted', cleanupReason });
      if (adapter !== admittedAdapter) return refuse('owner-context-changed');
      const current = admittedAdapter.snapshot();
      if (current.status !== 'active'
        || current.invocationIdentity !== admitted.invocationIdentity
        || current.workerToken !== admitted.workerToken
        || current.workerGeneration !== admitted.workerGeneration
        || canonicalJson(current.authorities) !== canonicalJson(admitted.authorities)
        || canonicalJson(current.target) !== canonicalJson(target)) {
        return refuse('owner-context-changed');
      }
      if (current.acceptedStateBytes !== admitted.acceptedStateBytes
        || current.acceptedStateHash !== admitted.acceptedStateHash
        || current.acceptedRevision !== admitted.acceptedRevision
        || terminal.stateBase64 !== admittedRow.stateBase64
        || terminal.stateHash !== admittedRow.stateHash
        || terminal.acceptedRevision !== admittedRow.acceptedRevision) {
        return refuse('accepted-state-changed');
      }
      // Step provenance detects authorization entry even when it changed no counters.
      if (!steps.slice(1, -1).every(step => (
        ['fresh-inspection', 'attempt:1:fresh-inspection'].includes(/** @type {string} */ (step.step))
        && step.outcome === 'accepted' && step.reason === 'inspection-refreshed'
      ))) return refuse('claim-phase-changed');
      const accepted = /** @type {Record<string, unknown>} */ (current.acceptedState);
      if (current.pendingEffect !== null || current.correction !== null || current.recoveryNotice !== null
        || /** @type {unknown[]} */ (accepted.pending).length !== 0
        || Object.hasOwn(accepted, 'pendingCompletion') || Object.hasOwn(accepted, 'learningGovernance')
        || (Object.hasOwn(accepted, 'evaluationSequences')
          && /** @type {unknown[]} */ (accepted.evaluationSequences).length !== 0)
        || currentRun.length !== 0 || occurrenceIdentity !== null
        || Object.values(observedStreams).some(rows => rows.length !== 0)) {
        return refuse('owner-obligations-pending');
      }
      try {
        if (fs.realpathSync(root) !== root
          || fs.realpathSync(path.resolve(/** @type {string} */ (request.root))) !== root
          || canonicalJson(checkpointWorkspace(freshLaneBinding(root, target, owner), root))
            !== canonicalJson(admittedWorkspace)) {
          return refuse('owner-binding-changed');
        }
      } catch {
        return refuse('owner-binding-unavailable');
      }
      const ended = admittedAdapter.end('hard-stop-recorded');
      const cleanupReason = OWNER_FINALIZATION_REFUSALS.has(/** @type {string} */ (ended.reason))
        ? ended.reason
        : 'owner-finalization-refused';
      return {
        hostRevision: /** @type {Record<string, unknown>} */ (ended.session).hostRevision,
        ...(ended.outcome === 'ended' && ended.reason === 'hard-stop-recorded'
          ? { cleanup: 'cleared', orphan: false }
          : {
            cleanup: cleanupReason === 'checkpoint-cleanup-failed' ? 'failed' : 'not-attempted',
            cleanupReason,
            ...(admittedAdapter.ownership() === null ? {} : { ownership: admittedAdapter.ownership() }),
          }),
      };
    };

    const inspected = refreshInspection('fresh-inspection');
    if (inspected.terminal) return inspected.terminal;

    // Fresh accounting does not discharge an exact target's retained learning.
    // Restore through the adapter before an Assessment can authorize an attempt.
    if (!Object.hasOwn(state, 'learningGovernance')
      && deriveEarliestRepeatRelationshipV1(retention.retained) !== null) {
      const resumed = runDeterministic(
        'advance-governance:resume-learning',
        'advance-governance',
        () => ({ governance: { action: 'resume-learning', input: runtimeInput() } }),
      );
      if (resumed.terminal) return resumed.terminal;
      if (!expected(resumed.result, 'accepted', 'governance-resumed')) {
        return orphan('governance-unresolved', /** @type {string} */ (resumed.result.reason));
      }
    }

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
        const accumulated = runtimeInput();
        const recordInput = { ...accumulated };
        delete recordInput.verification;
        delete recordInput.review;
        delete recordInput.lint;
        const outcome = runSemantic(
          `attempt:${attemptOrdinal}:record-attempt-result`,
          'record-attempt-result',
          { attemptResult: { input: recordInput, result: specialistResult, completionFit: completionFit(accumulated) } },
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
    const capacity = capacityDiagnostic(error);
    // A thrown acquisition or runner failure supplied no current Inspection.
    reportInspection = null;
    carriedCapacity = capacity;
    capacityEvidenceHash = null;
    carriedBlocker = null;
    const detail = capacity === null
      ? (error instanceof Error ? error.message : String(error))
      : `${capacity.budget}: ${capacity.required} required against the fixed limit of `
        + `${capacity.limit} for ${capacity.source}`;
    const taskStateFailure = error instanceof TaskStateEvidenceError;
    if (taskStateFailure) {
      try {
        reportInspection = clone(inspect(rawInput()));
      } catch {
        // The terminal report remains explicitly unresolved when no valid
        // Inspection can bind the snapshot evidence.
      }
    }
    if (taskStateFailure && reportInspection !== null) {
      carriedBlocker = boundBlocker({
        code: 'evidence-incomplete',
        subject: WORKSPACE_PATHS.TASK_STATE,
        evidenceHash: reportInspection.evidenceHash,
      }, 'evidence-incomplete', reportInspection);
    }
    const reason = taskStateFailure || capacity !== null ? 'evidence-incomplete' : 'runner-refused';
    const fields = {
      type: 'step',
      step: 'runner',
      outcome: 'hard-stop',
      reason,
      detail,
      ...(carriedBlocker === null ? {} : { blocker: carriedBlocker }),
      ...(capacity === null ? {} : { capacity }),
    };
    const row = adapter === null
      ? initialStateResult(state, fields)
      : stateResult(adapter.snapshot(), fields);
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
