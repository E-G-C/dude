// @ts-check

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { types as utilTypes } from 'node:util';

import { applyLightweightWorkRequest } from '../dude-lightweight-execution/board.mjs';
import {
  approachHash,
  canonicalTarget,
  canonicalJson,
  completeAttempt,
  buildGovernanceEventV1,
  deriveGovernanceRuntimeRequestV1,
  normalizeIndependentReviewEnvelopeV2,
  normalizeVerificationEnvelopeV2,
  requiredChecksForAction,
  runCommand as runRecoveryCommand,
  sha256,
  validateAssessment,
  validateAttemptAuthorizationPermitV1,
  validateInspection,
  validateLaneMutationPermitV1,
  validateLightweightAtomicReceiptV1,
  validateProjectionBatchV1,
  validateProjectionPermitV1,
  validateRecoveryRuntimeResultV1,
  validateRunState,
  validateTarget,
  targetKey,
} from './recovery.mjs';
import { buildSpecialistAttestation } from './specialist-attestation.mjs';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
// Closed semantic operations. Ordinary callers never name a low-level route or
// transition mode, and `incident-correction` stays exceptional internal behavior.
const OPERATIONS = Object.freeze([
  'fresh-inspection',
  'authorize-attempt',
  'record-attempt-result',
  'settle-effect',
  'advance-governance',
  'prepare-authoritative-projection',
  'authorize-lane-effect',
  'apply-lane-effect',
  'commit-lane-receipt',
  'audit-run',
]);
const AUTONOMOUS_OPERATIONS = new Set([
  'prepare-authoritative-projection',
  'authorize-lane-effect',
  'apply-lane-effect',
  'commit-lane-receipt',
  'audit-run',
]);
const RESERVED_ROUTE_FIELDS = Object.freeze(['route', 'mode', 'command', 'transition']);
const CORRECTABLE_OPERATIONS = OPERATIONS;
const INCIDENT_CLASSES = Object.freeze([
  'action-mismatch',
  'malformed-request',
  'evidence-drift',
  'stale-permit',
  'malformed-output',
  'empty-output',
  'tool-contract',
]);
const NOTICE_CLASSES = Object.freeze([...INCIDENT_CLASSES, 'host-process-recovered']);
// The sole outcome the one-shot notice may ride on. Every other outcome, and
// every terminal session, is structurally barred from carrying it.
const NOTICE_OUTCOME = 'accepted';
const PRODUCT_FIELDS = Object.freeze({
  'projection-plan': ['kind', 'plan'],
  'lane-permit': ['kind', 'permit'],
  'lane-receipt': ['kind', 'receipt'],
  'lane-settlement': ['kind', 'receipt', 'terminalEvidenceIdentity'],
  'run-audit': ['kind', 'derived', 'reason'],
});
const OUTCOMES = Object.freeze(['succeeded', 'blocked', 'failed', 'interrupted', 'no-change']);
const EFFECT_RETRY_REASONS = new Set([
  'occurrence-retention-incomplete',
  'projection-stale',
  'projection-missing-both',
  'projection-missing-current-run',
  'projection-missing-lane-history',
]);
const MAX_GRAPH_DEPTH = 32;
const MAX_GRAPH_ENTRIES = 4096;
const MAX_GRAPH_BYTES = 6_291_456;
const MAX_CHECKPOINT_BYTES = 65_536;
const CHECKPOINT_DIRECTORY = 'dude-work-host-adapter-v1';
const CHECKPOINT_OPERATIONS = Object.freeze(['claim', 'load', 'update', 'handoff', 'clear']);
const CHECKPOINT_STATUSES = Object.freeze({
  claim: ['claimed', 'occupied', 'failed'],
  load: ['loaded', 'absent', 'corrupt', 'failed'],
  update: ['updated', 'stale', 'failed'],
  handoff: ['handed-off', 'stale', 'failed'],
  clear: ['cleared', 'failed'],
});
const CHECKPOINT_RECORD_STATUSES = new Set(['claimed', 'loaded', 'updated', 'handed-off']);
const END_REASONS = Object.freeze([
  'task-settled',
  'natural-end',
  'controlled-end',
  'cancelled',
  'hard-stop-recorded',
]);
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DEFAULT_RUNTIME_AUTHORITY = sha256('dude-work/recovery.runCommand:v1');
const DEFAULT_LANE_OWNER_AUTHORITY = sha256('dude-lightweight-execution/board.applyLightweightWorkRequest:v1');
const CONSUMED_SUPERVISOR_SESSIONS = new WeakSet();
const CONSUMED_SUPERVISOR_IDENTITIES = new Set();
// invocationIdentity -> the one worker generation and token that authority currently belongs to.
const ADMITTED_INVOCATIONS = new Map();
const NO_EFFECT_AUTHORITY_STATES = new WeakMap();

/** @param {string} label @param {string} message @returns {never} */
function invalid(label, message) {
  throw new TypeError(`${label} ${message}`);
}

/** @param {unknown} value @param {string} label @returns {Record<string, unknown>} */
function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(label, 'must be an object');
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(label, 'must be a plain object');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid(label, 'must not contain symbol fields');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      invalid(label, `field '${key}' must be an enumerable data property`);
    }
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string[]} required @param {string[]} optional @param {string} label */
function exactRecord(value, required, optional, label) {
  const result = record(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) invalid(label, `contains unknown field '${key}'`);
  }
  for (const key of required) {
    if (!Object.hasOwn(result, key)) invalid(label, `is missing field '${key}'`);
  }
  return result;
}

/** @param {unknown} value @param {readonly string[]} values @param {string} label */
function enumeration(value, values, label) {
  if (typeof value !== 'string' || !values.includes(value)) invalid(label, `must be one of ${values.join(', ')}`);
}

/** @param {unknown} value @param {string} label */
function text(value, label) {
  if (typeof value !== 'string' || Buffer.byteLength(value) < 1 || Buffer.byteLength(value) > 256
    || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    invalid(label, 'must be a nonempty string of at most 256 UTF-8 bytes without controls');
  }
}

/** @param {unknown} value @param {string} label */
function hash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) invalid(label, 'must be a lowercase SHA-256 hash');
}

/** @param {unknown} value @param {string} label @param {boolean} [positive] */
function integer(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)
    || /** @type {number} */ (value) < (positive ? 1 : 0)) {
    invalid(label, `must be a ${positive ? 'positive' : 'nonnegative'} safe integer`);
  }
}

/** @param {unknown} value @param {string} label */
function denseArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || utilTypes.isProxy(value)
    || Object.keys(value).length !== value.length
    || Object.keys(value).some((key, index) => key !== String(index))) {
    invalid(label, 'must be a dense plain array without extra fields');
  }
  return value;
}

/** @param {unknown} value */
function freezeData(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Detach one bounded JSON data tree without invoking caller code.
 * @param {unknown} value @param {string} label
 */
function detachedData(value, label) {
  const active = new WeakSet();
  let entries = 0;
  let scalarBytes = 0;

  /** @param {string} textValue */
  function charge(textValue) {
    scalarBytes += Buffer.byteLength(textValue);
    if (scalarBytes > MAX_GRAPH_BYTES) {
      invalid(label, `exceeds the maximum scalar size of ${MAX_GRAPH_BYTES} UTF-8 bytes`);
    }
  }

  /** @param {unknown} current @param {number} depth @param {string} path */
  function visit(current, depth, path) {
    if (depth > MAX_GRAPH_DEPTH) invalid(label, `exceeds the maximum depth of ${MAX_GRAPH_DEPTH}`);
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'string') {
      charge(current);
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) invalid(path, 'must be a finite JSON number');
      return current;
    }
    if (typeof current !== 'object') invalid(path, 'must contain only JSON data');
    if (utilTypes.isProxy(current)) invalid(path, 'must not be a Proxy');
    if (active.has(current)) invalid(path, 'must not contain cycles');
    active.add(current);

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) invalid(path, 'must be a plain array');
      const keys = Reflect.ownKeys(current);
      if (keys.some((key) => typeof key !== 'string')) invalid(path, 'must not contain symbol fields');
      const extra = keys.filter((key) => key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key));
      if (extra.length > 0 || keys.length !== current.length + 1) invalid(path, 'must be a dense array without extra fields');
      entries += current.length;
      if (entries > MAX_GRAPH_ENTRIES) invalid(label, `exceeds the maximum entry count of ${MAX_GRAPH_ENTRIES}`);
      const result = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          invalid(`${path}[${index}]`, 'must be an enumerable data property');
        }
        result.push(visit(descriptor.value, depth + 1, `${path}[${index}]`));
      }
      active.delete(current);
      return result;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) invalid(path, 'must be a plain object');
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key !== 'string')) invalid(path, 'must not contain symbol fields');
    entries += keys.length;
    if (entries > MAX_GRAPH_ENTRIES) invalid(label, `exceeds the maximum entry count of ${MAX_GRAPH_ENTRIES}`);
    const result = {};
    for (const key of /** @type {string[]} */ (keys)) {
      charge(key);
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        invalid(path, `field '${key}' must be an enumerable data property`);
      }
      result[key] = visit(descriptor.value, depth + 1, `${path}.${key}`);
    }
    active.delete(current);
    return result;
  }

  const result = visit(value, 0, label);
  if (Buffer.byteLength(canonicalJson(result)) > MAX_GRAPH_BYTES) {
    invalid(label, `exceeds the maximum canonical size of ${MAX_GRAPH_BYTES} UTF-8 bytes`);
  }
  return freezeData(result);
}

/** @param {unknown} value @param {string} label @param {boolean} [allowEmpty] */
function sortedStrings(value, label, allowEmpty = true) {
  const rows = denseArray(value, label);
  if ((!allowEmpty && rows.length === 0) || rows.length > 16) {
    invalid(label, `must contain ${allowEmpty ? '0' : '1'} through 16 rows`);
  }
  let previous = null;
  rows.forEach((row, index) => {
    text(row, `${label}[${index}]`);
    if (previous !== null && Buffer.compare(Buffer.from(previous), Buffer.from(/** @type {string} */ (row))) >= 0) {
      invalid(label, 'must be sorted and duplicate-free');
    }
    previous = /** @type {string} */ (row);
  });
  return rows;
}

/** @param {unknown} value */
function clone(value) {
  return JSON.parse(canonicalJson(value));
}

/** @param {Record<string, unknown>} session */
function computeSessionIdentity(session) {
  const { sessionIdentity, ...identityFields } = session;
  return sha256(canonicalJson(identityFields));
}

/** @param {Record<string, unknown>} batch */
function batchCommitment(batch) {
  return {
    purpose: batch.purpose,
    batchIdentity: batch.batchIdentity,
    eventCommitments: clone(batch.eventCommitments),
  };
}

/** @param {unknown} value @param {string} label */
function validateAttemptResult(value, label) {
  const candidate = record(value, label);
  if (Object.hasOwn(candidate, 'checks')) {
    const result = exactRecord(value, ['outcome', 'operations', 'changedTargets', 'checks'], [], label);
    enumeration(result.outcome, OUTCOMES, `${label}.outcome`);
    sortedStrings(result.operations, `${label}.operations`, false);
    sortedStrings(result.changedTargets, `${label}.changedTargets`);
    const checks = exactRecord(result.checks, ['verification', 'lint', 'review'], [], `${label}.checks`);
    enumeration(checks.verification, ['none', 'passed', 'failed'], `${label}.checks.verification`);
    enumeration(checks.lint, ['none', 'passed', 'failed'], `${label}.checks.lint`);
    enumeration(checks.review, ['none', 'accepted', 'rejected'], `${label}.checks.review`);
    return 'guarded';
  }
  // The autonomous request carries the sole structured Tester and Reviewer
  // results only. Every trusted identity, dispatch fact, and capture is derived
  // by host integration from accepted state, so naming one here is unknown.
  const result = exactRecord(value, ['outcome', 'operations', 'changedTargets', 'verification', 'review'], [], label);
  enumeration(result.outcome, OUTCOMES, `${label}.outcome`);
  sortedStrings(result.operations, `${label}.operations`, false);
  sortedStrings(result.changedTargets, `${label}.changedTargets`);
  exactRecord(result.verification, ['checks'], [], `${label}.verification`);
  exactRecord(result.review, ['verdict', 'findings'], [], `${label}.review`);
  return 'trusted';
}

/** @param {Record<string, unknown>} session @param {unknown} value */
function validateCorrection(session, value) {
  if (value === null) return;
  const correction = exactRecord(value, [
    'version', 'identity', 'acceptedStateBytes', 'acceptedStateHash', 'acceptedRevision',
    'semanticOperation', 'incidentClass', 'inspectionIdentity', 'originHostRevision',
    'workerGeneration', 'consumed',
  ], [], 'HostAdapterSession.correction');
  if (correction.version !== 1) invalid('HostAdapterSession.correction.version', 'must be the literal 1');
  hash(correction.identity, 'HostAdapterSession.correction.identity');
  if (correction.acceptedStateBytes !== session.acceptedStateBytes
    || correction.acceptedStateHash !== session.acceptedStateHash
    || correction.acceptedRevision !== session.acceptedRevision) {
    invalid('HostAdapterSession.correction', 'must bind the exact accepted state identity');
  }
  enumeration(correction.semanticOperation, CORRECTABLE_OPERATIONS, 'HostAdapterSession.correction.semanticOperation');
  enumeration(correction.incidentClass, INCIDENT_CLASSES, 'HostAdapterSession.correction.incidentClass');
  if (correction.inspectionIdentity !== session.inspectionIdentity) {
    invalid('HostAdapterSession.correction', 'must bind the fresh Inspection');
  }
  // The origin generation is retained verbatim so one correction survives worker handoff.
  integer(correction.workerGeneration, 'HostAdapterSession.correction.workerGeneration', true);
  if (/** @type {number} */ (correction.workerGeneration) > /** @type {number} */ (session.workerGeneration)) {
    invalid('HostAdapterSession.correction.workerGeneration', 'must not exceed the active worker generation');
  }
  integer(correction.originHostRevision, 'HostAdapterSession.correction.originHostRevision');
  if (/** @type {number} */ (correction.originHostRevision) > /** @type {number} */ (session.hostRevision)) {
    invalid('HostAdapterSession.correction.originHostRevision', 'must not exceed hostRevision');
  }
  if (typeof correction.consumed !== 'boolean') invalid('HostAdapterSession.correction.consumed', 'must be a boolean');
  const { identity, ...core } = correction;
  if (identity !== sha256(canonicalJson(core))) invalid('HostAdapterSession.correction.identity', 'must bind the complete correction');
}

/**
 * The typed one-shot recovery notice. It is presentation data only: no ledger,
 * event, report, or second audit surface ever receives it.
 * @param {unknown} value @param {string} label
 */
function validateRecoveryNotice(value, label) {
  if (value === null) return null;
  const notice = exactRecord(value, ['incidentClassification', 'statePreserved', 'resumedAction'], [], label);
  enumeration(notice.incidentClassification, NOTICE_CLASSES, `${label}.incidentClassification`);
  if (notice.statePreserved !== true) invalid(`${label}.statePreserved`, 'must be the literal true');
  enumeration(notice.resumedAction, OPERATIONS, `${label}.resumedAction`);
  return notice;
}

/** @param {Record<string, unknown>} session @param {unknown} value */
function validatePendingEffect(session, value) {
  if (value === null) return;
  const effect = exactRecord(value, [
    'version', 'effectIdentity', 'kind', 'purpose', 'semanticOperation',
    'originHostRevision', 'predecessorStateHash', 'predecessorAcceptedRevision',
    'provisionalState', 'provisionalStateBytes', 'provisionalStateHash', 'projectionBatch',
  ], [], 'HostAdapterSession.pendingEffect');
  if (effect.version !== 1) invalid('HostAdapterSession.pendingEffect.version', 'must be the literal 1');
  hash(effect.effectIdentity, 'HostAdapterSession.pendingEffect.effectIdentity');
  enumeration(effect.kind, ['completion-retention', 'projection'], 'HostAdapterSession.pendingEffect.kind');
  text(effect.purpose, 'HostAdapterSession.pendingEffect.purpose');
  enumeration(effect.semanticOperation, CORRECTABLE_OPERATIONS, 'HostAdapterSession.pendingEffect.semanticOperation');
  integer(effect.originHostRevision, 'HostAdapterSession.pendingEffect.originHostRevision');
  if (effect.predecessorStateHash !== session.acceptedStateHash
    || effect.predecessorAcceptedRevision !== session.acceptedRevision) {
    invalid('HostAdapterSession.pendingEffect', 'must bind the accepted predecessor');
  }
  const provisional = validateRunState(effect.provisionalState);
  if (canonicalJson(provisional) !== effect.provisionalStateBytes
    || sha256(effect.provisionalStateBytes) !== effect.provisionalStateHash) {
    invalid('HostAdapterSession.pendingEffect.provisionalStateBytes', 'must bind canonical validated RunState bytes');
  }
  const batch = /** @type {Record<string, unknown>} */ (
    validateProjectionBatchV1(effect.projectionBatch, 'HostAdapterSession.pendingEffect.projectionBatch')
  );
  if (effect.purpose !== batch.purpose) invalid('HostAdapterSession.pendingEffect.purpose', 'must match projectionBatch');
  const commitment = batchCommitment(batch);
  const provisionalState = /** @type {Record<string, unknown>} */ (provisional);
  if (effect.kind === 'completion-retention') {
    const pendingCompletion = record(provisionalState.pendingCompletion, 'pending effect provisional pendingCompletion');
    if (effect.purpose !== 'occurrence-retention'
      || canonicalJson(pendingCompletion.retention) !== canonicalJson(commitment)) {
      invalid('HostAdapterSession.pendingEffect', 'must bind the completion retention commitment');
    }
  } else {
    const governance = record(provisionalState.learningGovernance, 'pending effect provisional learningGovernance');
    if (canonicalJson(governance.projectionCommitment) !== canonicalJson(commitment)) {
      invalid('HostAdapterSession.pendingEffect', 'must bind the governance projection commitment');
    }
  }
  const { effectIdentity, ...core } = effect;
  if (effectIdentity !== sha256(canonicalJson(core))) invalid('HostAdapterSession.pendingEffect.effectIdentity', 'must bind the complete effect');
}

/** @param {unknown} value */
function createHostAdapterSession(value) {
  const input = exactRecord(
    detachedData(value, 'host adapter session input'),
    ['state', 'target', 'invocationIdentity', 'workerToken', 'workerGeneration', 'inspectionIdentity'],
    ['acceptedRevision', 'hostRevision', 'authorities', 'correction'],
    'host adapter session input',
  );
  const state = validateRunState(input.state);
  const target = canonicalTarget(validateTarget(input.target));
  hash(input.invocationIdentity, 'host adapter session input.invocationIdentity');
  hash(input.workerToken, 'host adapter session input.workerToken');
  integer(input.workerGeneration, 'host adapter session input.workerGeneration', true);
  hash(input.inspectionIdentity, 'host adapter session input.inspectionIdentity');
  const acceptedRevision = Object.hasOwn(input, 'acceptedRevision') ? input.acceptedRevision : 0;
  const hostRevision = Object.hasOwn(input, 'hostRevision') ? input.hostRevision : 0;
  integer(acceptedRevision, 'host adapter session input.acceptedRevision');
  integer(hostRevision, 'host adapter session input.hostRevision');
  const acceptedStateBytes = canonicalJson(state);
  const authorities = Object.hasOwn(input, 'authorities')
    ? exactRecord(
      input.authorities,
      ['runtimeIdentity', 'supervisorAuthorityIdentity', 'admissionIdentity', 'noEffectAuthorityIdentity'],
      [],
      'host adapter session input.authorities',
    )
    : {
      runtimeIdentity: DEFAULT_RUNTIME_AUTHORITY,
      supervisorAuthorityIdentity: sha256('dude-work/host-adapter:default-supervisor:v1'),
      admissionIdentity: sha256('dude-work/host-adapter:default-admission:v1'),
      noEffectAuthorityIdentity: sha256('dude-work/host-adapter:default-no-effect-authority:v1'),
    };
  for (const field of [
    'runtimeIdentity',
    'supervisorAuthorityIdentity',
    'admissionIdentity',
    'noEffectAuthorityIdentity',
  ]) {
    hash(authorities[field], `host adapter session input.authorities.${field}`);
  }
  const session = {
    version: 1,
    target: clone(target),
    acceptedState: JSON.parse(acceptedStateBytes),
    acceptedStateBytes,
    acceptedStateHash: sha256(acceptedStateBytes),
    acceptedRevision,
    hostRevision,
    invocationIdentity: input.invocationIdentity,
    workerToken: input.workerToken,
    workerGeneration: input.workerGeneration,
    inspectionIdentity: input.inspectionIdentity,
    authorities: clone(authorities),
    correction: Object.hasOwn(input, 'correction') && input.correction !== null ? clone(input.correction) : null,
    pendingEffect: null,
    recoveryNotice: null,
    status: 'active',
    disposition: null,
    sessionIdentity: '',
  };
  session.sessionIdentity = computeSessionIdentity(session);
  return validateHostAdapterSession(session);
}

/** @param {unknown} value */
export function validateHostAdapterSession(value) {
  const session = exactRecord(detachedData(value, 'HostAdapterSession'), [
    'version', 'target', 'acceptedState', 'acceptedStateBytes', 'acceptedStateHash',
    'acceptedRevision', 'hostRevision', 'invocationIdentity', 'workerToken', 'workerGeneration',
    'inspectionIdentity', 'authorities', 'correction', 'pendingEffect', 'recoveryNotice',
    'status', 'disposition', 'sessionIdentity',
  ], [], 'HostAdapterSession');
  if (session.version !== 1) invalid('HostAdapterSession.version', 'must be the literal 1');
  const state = validateRunState(session.acceptedState);
  const target = canonicalTarget(validateTarget(session.target));
  if (canonicalJson(target) !== canonicalJson(session.target)) {
    invalid('HostAdapterSession.target', 'must be canonical');
  }
  const pendingRows = /** @type {Record<string, unknown>[]} */ (/** @type {Record<string, unknown>} */ (state).pending);
  if (pendingRows.some((pending) => canonicalJson(pending.target) !== canonicalJson(target))) {
    invalid('HostAdapterSession.acceptedState.pending', 'must bind the session target');
  }
  if (canonicalJson(state) !== session.acceptedStateBytes
    || sha256(session.acceptedStateBytes) !== session.acceptedStateHash) {
    invalid('HostAdapterSession.acceptedStateBytes', 'must bind canonical validated RunState bytes');
  }
  integer(session.acceptedRevision, 'HostAdapterSession.acceptedRevision');
  integer(session.hostRevision, 'HostAdapterSession.hostRevision');
  hash(session.invocationIdentity, 'HostAdapterSession.invocationIdentity');
  hash(session.workerToken, 'HostAdapterSession.workerToken');
  integer(session.workerGeneration, 'HostAdapterSession.workerGeneration', true);
  hash(session.inspectionIdentity, 'HostAdapterSession.inspectionIdentity');
  const authorities = exactRecord(
    session.authorities,
    ['runtimeIdentity', 'supervisorAuthorityIdentity', 'admissionIdentity', 'noEffectAuthorityIdentity'],
    [],
    'HostAdapterSession.authorities',
  );
  for (const field of [
    'runtimeIdentity',
    'supervisorAuthorityIdentity',
    'admissionIdentity',
    'noEffectAuthorityIdentity',
  ]) {
    hash(authorities[field], `HostAdapterSession.authorities.${field}`);
  }
  enumeration(session.status, ['active', 'hard-stop', 'ended'], 'HostAdapterSession.status');
  if (session.status === 'active') {
    if (session.disposition !== null) invalid('HostAdapterSession.disposition', 'must be null while active');
  } else {
    text(session.disposition, 'HostAdapterSession.disposition');
  }
  hash(session.sessionIdentity, 'HostAdapterSession.sessionIdentity');
  validateCorrection(session, session.correction);
  validatePendingEffect(session, session.pendingEffect);
  validateRecoveryNotice(session.recoveryNotice, 'HostAdapterSession.recoveryNotice');
  // A terminal session can never hold a pending notice, so no hard-stop or
  // ended outcome can be built from one.
  if (session.status !== 'active' && session.recoveryNotice !== null) {
    invalid('HostAdapterSession.recoveryNotice', 'must be null once the session is terminal');
  }
  if (session.sessionIdentity !== computeSessionIdentity(session)) {
    invalid('HostAdapterSession.sessionIdentity', 'must bind the complete session');
  }
  return session;
}

/** @param {unknown} value */
export function validateHostAdapterRequest(value, stateValue) {
  const safe = detachedData(value, 'HostAdapterRequest');
  const candidate = record(safe, 'HostAdapterRequest');
  for (const reserved of RESERVED_ROUTE_FIELDS) {
    if (Object.hasOwn(candidate, reserved)) {
      invalid('HostAdapterRequest', `must not select the low-level '${reserved}'`);
    }
  }
  enumeration(candidate.operation, OPERATIONS, 'HostAdapterRequest.operation');
  const payload = {
    'fresh-inspection': ['input'],
    'authorize-attempt': ['authorization'],
    'record-attempt-result': ['attemptResult'],
    'settle-effect': ['input'],
    'advance-governance': ['governance'],
    'prepare-authoritative-projection': ['projection'],
    'authorize-lane-effect': ['laneEffect'],
    'apply-lane-effect': ['laneApplication'],
    'commit-lane-receipt': ['laneReceipt'],
    'audit-run': ['audit'],
  }[/** @type {string} */ (candidate.operation)];
  const request = exactRecord(safe, [
    'version', 'operation', 'expectedSessionIdentity', 'expectedAcceptedRevision',
    'expectedHostRevision', ...payload,
  ], ['correctionIdentity'], 'HostAdapterRequest');
  if (request.version !== 1) invalid('HostAdapterRequest.version', 'must be the literal 1');
  hash(request.expectedSessionIdentity, 'HostAdapterRequest.expectedSessionIdentity');
  integer(request.expectedAcceptedRevision, 'HostAdapterRequest.expectedAcceptedRevision');
  integer(request.expectedHostRevision, 'HostAdapterRequest.expectedHostRevision');
  if (Object.hasOwn(request, 'correctionIdentity')) hash(request.correctionIdentity, 'HostAdapterRequest.correctionIdentity');
  if (request.operation === 'authorize-attempt') {
    const authorization = exactRecord(
      request.authorization,
      ['input', 'assessment'],
      ['permit'],
      'HostAdapterRequest.authorization',
    );
    validateAssessment(authorization.assessment);
    if (Object.hasOwn(authorization, 'permit')) {
      exactRecord(
        authorization.permit,
        ['lanePrestate', 'targetMapping'],
        [],
        'HostAdapterRequest.authorization.permit',
      );
    }
  } else if (request.operation === 'record-attempt-result') {
    const attempt = exactRecord(request.attemptResult, ['input', 'result'], [], 'HostAdapterRequest.attemptResult');
    if (validateAttemptResult(attempt.result, 'HostAdapterRequest.attemptResult.result') === 'trusted') {
      const input = record(attempt.input, 'HostAdapterRequest.attemptResult.input');
      for (const stream of ['verification', 'review', 'lint']) {
        if (Object.hasOwn(input, stream)) {
          invalid('HostAdapterRequest.attemptResult.input', `must not select the '${stream}' trusted capture`);
        }
      }
    }
  } else if (request.operation === 'advance-governance') {
    if (stateValue === undefined) invalid('HostAdapterRequest.governance', 'requires the current accepted RunState');
    deriveGovernanceRuntimeRequestV1(stateValue, request.governance);
  } else if (request.operation === 'prepare-authoritative-projection') {
    const projection = exactRecord(request.projection, ['input'], ['laneBinding'], 'HostAdapterRequest.projection');
    if (Object.hasOwn(projection, 'laneBinding')) {
      exactRecord(
        projection.laneBinding,
        ['lanePrestate', 'targetMapping', 'operationTime'],
        [],
        'HostAdapterRequest.projection.laneBinding',
      );
    }
  } else if (request.operation === 'authorize-lane-effect') {
    exactRecord(
      request.laneEffect,
      ['input', 'mutation', 'lanePrestate', 'targetMapping'],
      [],
      'HostAdapterRequest.laneEffect',
    );
  } else if (request.operation === 'apply-lane-effect') {
    // The adapter supplies the accepted state and canonical target itself; a
    // caller may reference only the permit it was issued and the fresh bindings.
    const application = exactRecord(
      request.laneApplication,
      ['root', 'owner', 'permit', 'mapping', 'expected', 'mutation'],
      [],
      'HostAdapterRequest.laneApplication',
    );
    text(application.root, 'HostAdapterRequest.laneApplication.root');
  } else if (request.operation === 'commit-lane-receipt') {
    exactRecord(request.laneReceipt, ['input', 'permit', 'receipt'], [], 'HostAdapterRequest.laneReceipt');
  } else if (request.operation === 'audit-run') {
    exactRecord(request.audit, ['input'], [], 'HostAdapterRequest.audit');
  }
  return request;
}

/** @param {unknown} value @param {string} label */
function validateAdapterProduct(value, label) {
  const candidate = record(value, label);
  enumeration(candidate.kind, Object.keys(PRODUCT_FIELDS), `${label}.kind`);
  const kind = /** @type {string} */ (candidate.kind);
  const product = exactRecord(value, PRODUCT_FIELDS[kind], kind === 'run-audit' ? ['summary'] : [], label);
  if (kind === 'lane-settlement' && product.terminalEvidenceIdentity !== null) {
    hash(product.terminalEvidenceIdentity, `${label}.terminalEvidenceIdentity`);
  }
  if (kind === 'run-audit') {
    if (typeof product.derived !== 'boolean') invalid(`${label}.derived`, 'must be a boolean');
    text(product.reason, `${label}.reason`);
    if (product.derived === true && !Object.hasOwn(product, 'summary')) {
      invalid(label, 'must carry the derived audit summary');
    }
  }
  return product;
}

/** @param {unknown} value */
export function validateHostAdapterResult(value) {
  const safe = detachedData(value, 'HostAdapterResult');
  const candidate = record(safe, 'HostAdapterResult');
  enumeration(candidate.outcome, ['accepted', 'effect-required', 'closed-refusal', 'reinspect-required', 'hard-stop', 'ended'], 'HostAdapterResult.outcome');
  const fields = {
    accepted: ['version', 'outcome', 'reason', 'session'],
    'effect-required': ['version', 'outcome', 'reason', 'effect', 'session'],
    'closed-refusal': ['version', 'outcome', 'reason', 'incidentClass', 'nonterminal', 'next', 'session'],
    'reinspect-required': ['version', 'outcome', 'reason', 'nonterminal', 'next', 'session'],
    'hard-stop': ['version', 'outcome', 'reason', 'session'],
    ended: ['version', 'outcome', 'reason', 'session'],
  }[/** @type {string} */ (candidate.outcome)];
  // The one-shot notice is admissible on an accepted outcome only; every other
  // outcome rejects it as an unknown field.
  const optional = candidate.outcome === NOTICE_OUTCOME
    ? ['product', 'recoveryNotice']
    : candidate.outcome === 'effect-required' ? ['product'] : [];
  const result = exactRecord(safe, fields, optional, 'HostAdapterResult');
  if (result.version !== 1) invalid('HostAdapterResult.version', 'must be the literal 1');
  text(result.reason, 'HostAdapterResult.reason');
  const session = validateHostAdapterSession(result.session);
  if (Object.hasOwn(result, 'product')) validateAdapterProduct(result.product, 'HostAdapterResult.product');
  if (Object.hasOwn(result, 'recoveryNotice')) {
    if (result.recoveryNotice === null) invalid('HostAdapterResult.recoveryNotice', 'must be omitted when absent');
    validateRecoveryNotice(result.recoveryNotice, 'HostAdapterResult.recoveryNotice');
  }
  if (result.outcome === 'accepted' && session.recoveryNotice !== null) {
    invalid('HostAdapterResult.session.recoveryNotice', 'must be consumed by an accepted outcome');
  }
  if (result.outcome === 'effect-required') {
    const effect = exactRecord(result.effect, ['kind', 'purpose', 'effectIdentity', 'projectionBatch'], [], 'HostAdapterResult.effect');
    const pending = record(session.pendingEffect, 'HostAdapterResult.session.pendingEffect');
    if (canonicalJson(effect) !== canonicalJson({
      kind: pending.kind,
      purpose: pending.purpose,
      effectIdentity: pending.effectIdentity,
      projectionBatch: pending.projectionBatch,
    })) invalid('HostAdapterResult.effect', 'must equal the session pending effect');
  }
  if (result.outcome === 'closed-refusal' || result.outcome === 'reinspect-required') {
    if (result.nonterminal !== true) invalid('HostAdapterResult.nonterminal', 'must be the literal true');
    const next = record(result.next, 'HostAdapterResult.next');
    if (next.kind === 'correction') {
      const correction = exactRecord(next, ['kind', 'correctionIdentity'], [], 'HostAdapterResult.next');
      const stored = record(session.correction, 'HostAdapterResult.session.correction');
      if (stored.consumed !== false || correction.correctionIdentity !== stored.identity) {
        invalid('HostAdapterResult.next.correctionIdentity', 'must identify the unconsumed correction');
      }
    } else {
      exactRecord(next, ['kind'], [], 'HostAdapterResult.next');
      if (next.kind !== 'inspect') invalid('HostAdapterResult.next.kind', 'must be correction or inspect');
    }
  }
  if (result.outcome === 'closed-refusal') enumeration(result.incidentClass, INCIDENT_CLASSES, 'HostAdapterResult.incidentClass');
  if (result.outcome === 'hard-stop') {
    if (session.status !== 'hard-stop' || session.disposition !== result.reason) {
      invalid('HostAdapterResult.session', 'must carry the exact hard-stop disposition');
    }
  } else if (result.outcome === 'ended') {
    if (session.status !== 'ended' || session.disposition !== result.reason) {
      invalid('HostAdapterResult.session', 'must carry the exact ended disposition');
    }
  } else if (session.status !== 'active') {
    invalid('HostAdapterResult.session.status', 'must be active for a nonterminal outcome');
  }
  return safe;
}

/** @param {Record<string, unknown>} result */
function checkedResult(result) {
  return validateHostAdapterResult(result);
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} [updates] */
function advanceHost(session, updates = {}) {
  const next = {
    ...session,
    acceptedState: JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
    correction: session.correction === null ? null : clone(session.correction),
    pendingEffect: session.pendingEffect === null ? null : clone(session.pendingEffect),
    recoveryNotice: session.recoveryNotice === null || session.recoveryNotice === undefined
      ? null
      : clone(session.recoveryNotice),
    ...updates,
    hostRevision: /** @type {number} */ (session.hostRevision) + 1,
    sessionIdentity: '',
  };
  // A terminal transition discards the pending notice rather than carrying it
  // into an outcome that may never render it.
  if (next.status !== 'active') next.recoveryNotice = null;
  next.sessionIdentity = computeSessionIdentity(next);
  return validateHostAdapterSession(next);
}

/** @param {Record<string, unknown>} session @param {string} reason */
function hardStop(session, reason) {
  return checkedResult({
    version: 1,
    outcome: 'hard-stop',
    reason,
    session: advanceHost(session, { status: 'hard-stop', disposition: reason }),
  });
}

/** @param {Record<string, unknown>} session */
function terminalResult(session) {
  const status = /** @type {string} */ (session.status);
  return checkedResult({
    version: 1,
    outcome: status,
    reason: /** @type {string} */ (session.disposition),
    session,
  });
}

/** @param {Record<string, unknown>} session @param {unknown} stateValue @param {string} reason @param {boolean} [ended] @param {Record<string, unknown>} [product] */
function acceptState(session, stateValue, reason, ended = false, product) {
  const state = validateRunState(stateValue);
  const acceptedStateBytes = canonicalJson(state);
  // The pending notice is returned and cleared in the same serialized update.
  const notice = ended ? null : session.recoveryNotice;
  const next = advanceHost(session, {
    acceptedState: JSON.parse(acceptedStateBytes),
    acceptedStateBytes,
    acceptedStateHash: sha256(acceptedStateBytes),
    acceptedRevision: /** @type {number} */ (session.acceptedRevision) + (acceptedStateBytes === session.acceptedStateBytes ? 0 : 1),
    correction: null,
    pendingEffect: null,
    recoveryNotice: null,
    ...(ended ? { status: 'ended', disposition: reason } : {}),
  });
  return checkedResult({
    version: 1,
    outcome: ended ? 'ended' : 'accepted',
    reason,
    ...(product === undefined ? {} : { product: clone(product) }),
    ...(notice === null || notice === undefined ? {} : { recoveryNotice: clone(notice) }),
    session: next,
  });
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} provisional @param {Record<string, unknown>} batch @param {string} kind @param {string} semanticOperation */
function pendingEffect(session, provisional, batch, kind, semanticOperation) {
  validateProjectionBatchV1(batch);
  const provisionalState = validateRunState(provisional);
  const provisionalStateBytes = canonicalJson(provisionalState);
  const core = {
    version: 1,
    kind,
    purpose: batch.purpose,
    semanticOperation,
    originHostRevision: session.hostRevision,
    predecessorStateHash: session.acceptedStateHash,
    predecessorAcceptedRevision: session.acceptedRevision,
    provisionalState: JSON.parse(provisionalStateBytes),
    provisionalStateBytes,
    provisionalStateHash: sha256(provisionalStateBytes),
    projectionBatch: clone(batch),
  };
  return { ...core, effectIdentity: sha256(canonicalJson(core)) };
}

/** @param {Record<string, unknown>} session @param {string} reason @param {Record<string, unknown>} [product] */
function effectRequired(session, reason, product) {
  const next = advanceHost(session);
  const pending = record(next.pendingEffect, 'HostAdapterSession.pendingEffect');
  return checkedResult({
    version: 1,
    outcome: 'effect-required',
    reason,
    effect: {
      kind: pending.kind,
      purpose: pending.purpose,
      effectIdentity: pending.effectIdentity,
      projectionBatch: clone(pending.projectionBatch),
    },
    ...(product === undefined ? {} : { product: clone(product) }),
    session: next,
  });
}

/** @param {Record<string, unknown>} session @param {string} operation @param {string} incidentClass */
function correctionMatches(session, operation, incidentClass) {
  if (session.correction === null) return false;
  const correction = /** @type {Record<string, unknown>} */ (session.correction);
  // The origin worker generation is deliberately not compared so one correction and its
  // consumed state survive worker handoff instead of minting a second correction.
  return correction.acceptedStateBytes === session.acceptedStateBytes
    && correction.acceptedStateHash === session.acceptedStateHash
    && correction.acceptedRevision === session.acceptedRevision
    && correction.semanticOperation === operation
    && correction.incidentClass === incidentClass
    && correction.inspectionIdentity === session.inspectionIdentity;
}

/** @param {Record<string, unknown>} session @param {string} operation @param {string} incidentClass */
function newCorrection(session, operation, incidentClass) {
  const core = {
    version: 1,
    acceptedStateBytes: session.acceptedStateBytes,
    acceptedStateHash: session.acceptedStateHash,
    acceptedRevision: session.acceptedRevision,
    semanticOperation: operation,
    incidentClass,
    inspectionIdentity: session.inspectionIdentity,
    originHostRevision: session.hostRevision,
    workerGeneration: session.workerGeneration,
  };
  const correction = { ...core, consumed: false };
  return { ...correction, identity: sha256(canonicalJson(correction)) };
}

/** @param {Record<string, unknown>} correction @param {boolean} consumed */
function setCorrectionConsumed(correction, consumed) {
  const { identity, ...core } = correction;
  const next = { ...core, consumed };
  return { ...next, identity: sha256(canonicalJson(next)) };
}

/** @param {unknown} correction */
function invalidateCorrection(correction) {
  if (correction === null) return null;
  const current = /** @type {Record<string, unknown>} */ (correction);
  return current.consumed === true ? clone(current) : setCorrectionConsumed(current, true);
}

/** @param {Record<string, unknown>} session @param {string} operation @param {string} incidentClass @param {string} reason */
function closedIncident(session, operation, incidentClass, reason) {
  let correction = session.correction;
  let nextAction;
  if (correction === null) {
    correction = newCorrection(session, operation, incidentClass);
    nextAction = { kind: 'correction', correctionIdentity: correction.identity };
  } else if (correctionMatches(session, operation, incidentClass)
    && /** @type {Record<string, unknown>} */ (correction).consumed === false) {
    nextAction = { kind: 'correction', correctionIdentity: /** @type {Record<string, unknown>} */ (correction).identity };
  } else {
    correction = invalidateCorrection(correction);
    nextAction = { kind: 'inspect' };
  }
  const next = advanceHost(session, { correction: clone(correction) });
  return checkedResult({
    version: 1,
    outcome: 'closed-refusal',
    reason,
    incidentClass,
    nonterminal: true,
    next: nextAction,
    session: next,
  });
}

/** @param {Record<string, unknown>} session @param {string} reason */
function reinspect(session, reason) {
  return checkedResult({
    version: 1,
    outcome: 'reinspect-required',
    reason,
    nonterminal: true,
    next: { kind: 'inspect' },
    session: advanceHost(session, { correction: invalidateCorrection(session.correction) }),
  });
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request */
function authorizeCorrection(session, request) {
  if (session.correction === null) {
    return Object.hasOwn(request, 'correctionIdentity')
      ? { result: hardStop(session, 'correction-not-authorized') }
      : { session };
  }
  const correction = /** @type {Record<string, unknown>} */ (session.correction);
  if (request.operation === 'fresh-inspection' && !Object.hasOwn(request, 'correctionIdentity')) {
    return { session };
  }
  if (!Object.hasOwn(request, 'correctionIdentity')) return { result: reinspect(session, 'correction-or-inspection-required') };
  if (request.correctionIdentity !== correction.identity || request.operation !== correction.semanticOperation) {
    return { result: hardStop(session, 'correction-identity-mismatch') };
  }
  if (correction.consumed === true) return { result: reinspect(session, 'correction-consumed') };
  return {
    // Authorizing the one permitted correction opens the pending one-shot notice.
    session: advanceHost(session, {
      correction: setCorrectionConsumed(correction, true),
      recoveryNotice: {
        incidentClassification: correction.incidentClass,
        statePreserved: true,
        resumedAction: correction.semanticOperation,
      },
    }),
  };
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request */
function authorityFailure(session, request) {
  if (request.expectedSessionIdentity !== session.sessionIdentity) return 'adapter-session-mismatch';
  if (request.expectedAcceptedRevision !== session.acceptedRevision
    || request.expectedHostRevision !== session.hostRevision) return 'adapter-revision-mismatch';
  return null;
}

/** @param {Record<string, unknown>} session @param {unknown} value */
function malformedRequestOperation(session, value) {
  try {
    const request = record(detachedData(value, 'HostAdapterRequest'), 'HostAdapterRequest');
    if (request.version !== 1 || !CORRECTABLE_OPERATIONS.includes(/** @type {string} */ (request.operation))) {
      return null;
    }
    hash(request.expectedSessionIdentity, 'HostAdapterRequest.expectedSessionIdentity');
    integer(request.expectedAcceptedRevision, 'HostAdapterRequest.expectedAcceptedRevision');
    integer(request.expectedHostRevision, 'HostAdapterRequest.expectedHostRevision');
    return authorityFailure(session, request) === null ? request.operation : null;
  } catch {
    return null;
  }
}

/** @param {Record<string, unknown>} pending */
function completionRoute(pending) {
  if (pending.action === 'execute-task' || pending.action === 'retry-task') {
    return `${/** @type {Record<string, unknown>} */ (pending.target).lane}-task`;
  }
  const route = {
    'address-test': 'test-repair',
    'address-review': 'review-remediation',
    'reconcile-derived-definition': 'definition-reconciliation',
    'retain-learning': 'retention',
  }[/** @type {string} */ (pending.action)];
  if (!route) invalid('HostAdapterSession.acceptedState.pending[0].action', 'has no completion route');
  return route;
}

/** @param {unknown} value */
function stateEnvelope(value) {
  try {
    const state = /** @type {Record<string, unknown>} */ (validateRunState(value));
    return { state, bytes: canonicalJson(state) };
  } catch {
    return null;
  }
}

/** @param {Record<string, unknown>} inspection @param {Record<string, unknown>} session @param {string} label */
function requireSessionInspection(inspection, session, label) {
  const validated = /** @type {Record<string, unknown>} */ (validateInspection(inspection));
  if (canonicalJson(validated.target) !== canonicalJson(session.target)) {
    invalid(label, 'must bind the exact adapter target');
  }
  return validated;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right @param {string[]} ignored */
function sameFieldsExcept(left, right, ignored) {
  const leftCopy = clone(left);
  const rightCopy = clone(right);
  for (const key of ignored) {
    delete leftCopy[key];
    delete rightCopy[key];
  }
  return canonicalJson(leftCopy) === canonicalJson(rightCopy);
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} successor @param {Record<string, unknown>} assessment @param {Record<string, unknown>} inspection @param {string} mode @param {Record<string, unknown>|undefined} permit @param {Record<string, unknown>} authorization */
function validateAuthorizedSuccessor(session, successor, assessment, inspection, mode, permit, authorization) {
  const predecessor = /** @type {Record<string, unknown>} */ (session.acceptedState);
  const pendingRows = /** @type {Record<string, unknown>[]} */ (successor.pending);
  if (/** @type {unknown[]} */ (predecessor.pending).length !== 0 || pendingRows.length !== 1) {
    invalid('recovery authorize response.authorization.state.pending', 'must add exactly one pending authorization');
  }
  const pending = pendingRows[0];
  const expectedApproachHash = approachHash({
    action: assessment.action,
    materialInputs: assessment.materialInputs,
  });
  if (canonicalJson(pending.target) !== canonicalJson(session.target)
    || pending.evidenceHash !== inspection.evidenceHash
    || pending.action !== assessment.action
    || canonicalJson(pending.materialInputs) !== canonicalJson(assessment.materialInputs)
    || pending.mode !== mode
    || (assessment.action !== 'reconcile-derived-definition'
      && pending.approachHash !== expectedApproachHash)) {
    invalid('recovery authorize response.authorization.state.pending', 'must bind the exact target, evidence, action, and material inputs');
  }
  if (successor.overallUsed !== /** @type {number} */ (predecessor.overallUsed) + 1
    || canonicalJson(successor.policy) !== canonicalJson(predecessor.policy)
    || canonicalJson(successor.completed) !== canonicalJson(predecessor.completed)
    || !sameFieldsExcept(successor, predecessor, ['overallUsed', 'recoveryUsed', 'pending', 'learningGovernance'])) {
    invalid('recovery authorize response.authorization.state', 'must be the exact authorization successor');
  }
  const predecessorRecovery = /** @type {Record<string, unknown>[]} */ (predecessor.recoveryUsed);
  const successorRecovery = /** @type {Record<string, unknown>[]} */ (successor.recoveryUsed);
  if (mode === 'ordinary') {
    if (canonicalJson(successorRecovery) !== canonicalJson(predecessorRecovery)) {
      invalid('recovery authorize response.authorization.state.recoveryUsed', 'must remain unchanged for ordinary authorization');
    }
  } else {
    const targetKeyValue = targetKey(session.target);
    const before = predecessorRecovery.find((row) => row.targetKey === targetKeyValue)?.count || 0;
    const after = successorRecovery.find((row) => row.targetKey === targetKeyValue)?.count;
    if (after !== before + 1 || successorRecovery.length !== predecessorRecovery.length + (before === 0 ? 1 : 0)) {
      invalid('recovery authorize response.authorization.state.recoveryUsed', 'must increment only the exact recovery target');
    }
  }
  const predecessorHasGovernance = Object.hasOwn(predecessor, 'learningGovernance');
  const successorHasGovernance = Object.hasOwn(successor, 'learningGovernance');
  if (permit === undefined || permit.governancePhase === null) {
    if (predecessorHasGovernance !== successorHasGovernance
      || (predecessorHasGovernance
        && canonicalJson(predecessor.learningGovernance) !== canonicalJson(successor.learningGovernance))) {
      invalid('recovery authorize response.authorization.state.learningGovernance', 'must remain unchanged without a governed permit');
    }
    return;
  }
  hash(authorization.attemptIdentity, 'recovery authorize response.authorization.attemptIdentity');
  if (typeof authorization.claimRequired !== 'boolean') {
    invalid('recovery authorize response.authorization.claimRequired', 'must be a boolean');
  }
  if (!predecessorHasGovernance || !successorHasGovernance) {
    invalid('recovery authorize response.authorization.state.learningGovernance', 'must consume the existing governed branch');
  }
  const expectedGovernance = {
    .../** @type {Record<string, unknown>} */ (predecessor.learningGovernance),
    phase: authorization.claimRequired ? 'alternative-authorized-pending-lane' : 'alternative-authorized',
    consumedAttemptPermitHash: permit.permitHash,
    authorizedAttemptIdentity: authorization.attemptIdentity,
  };
  if (canonicalJson(successor.learningGovernance) !== canonicalJson(expectedGovernance)) {
    invalid('recovery authorize response.authorization.state.learningGovernance', 'must bind exact permit consumption');
  }
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} assessment @param {unknown} response @param {string} mode @param {Record<string, unknown>|undefined} permit */
function handleAuthorization(session, assessment, response, mode, permit) {
  const top = exactRecord(response, ['inspection', 'authorization'], [], 'recovery authorize response');
  const inspection = requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery authorize response.inspection',
  );
  const authorization = record(top.authorization, 'recovery authorize response.authorization');
  if (typeof authorization.authorized !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  const fields = authorization.authorized
    ? exactRecord(
      authorization,
      ['authorized', 'reason', 'state'],
      ['attemptIdentity', 'claimRequired', 'definitionReconciliation'],
      'recovery authorize response.authorization',
    )
    : exactRecord(
      authorization,
      ['authorized', 'reason', 'state'],
      ['blocker'],
      'recovery authorize response.authorization',
    );
  text(fields.reason, 'recovery authorize response.authorization.reason');
  const successor = stateEnvelope(fields.state);
  if (!successor) return hardStop(session, 'successor-malformed');
  if (authorization.authorized !== true) {
    if (successor.bytes !== session.acceptedStateBytes) return hardStop(session, 'refused-successor-mismatch');
    const incidentClass = {
      'evidence-drift': 'evidence-drift',
      'inspection-stale': 'evidence-drift',
      'permit-stale': 'stale-permit',
      'permit-target-mismatch': 'stale-permit',
      'permit-transition-mismatch': 'stale-permit',
    }[/** @type {string} */ (fields.reason)];
    return incidentClass
      ? closedIncident(session, 'authorize-attempt', incidentClass, /** @type {string} */ (fields.reason))
      : hardStop(session, /** @type {string} */ (fields.reason));
  }
  if (fields.reason !== 'authorized' || inspection.evidenceHash !== assessment.evidenceHash) {
    return hardStop(session, 'authorization-binding-mismatch');
  }
  try {
    validateAuthorizedSuccessor(
      session,
      /** @type {Record<string, unknown>} */ (successor.state),
      assessment,
      inspection,
      mode,
      permit,
      authorization,
    );
  } catch {
    return hardStop(session, 'authorization-binding-mismatch');
  }
  return acceptState(session, successor.state, 'authorized');
}

/** @param {Record<string, unknown>} session @param {unknown} response @param {Record<string, unknown>} completionInput */
function handleLegacyCompletion(session, response, completionInput) {
  const top = exactRecord(response, ['completion'], [], 'recovery complete response');
  const completion = exactRecord(top.completion, ['completed', 'reason', 'state'], ['result'], 'recovery complete response.completion');
  if (typeof completion.completed !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  text(completion.reason, 'recovery complete response.completion.reason');
  const successor = stateEnvelope(completion.state);
  if (!successor) return hardStop(session, 'successor-malformed');
  let expected;
  try {
    expected = completeAttempt(
      JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
      clone(completionInput),
    );
  } catch {
    return hardStop(session, 'legacy-completion-binding-mismatch');
  }
  if (canonicalJson(completion) !== canonicalJson(expected)) {
    return hardStop(session, 'legacy-completion-binding-mismatch');
  }
  if (completion.completed === false
    && (completion.reason === 'action-mismatch' || completion.reason === 'pending-not-found')) {
    if (successor.bytes !== session.acceptedStateBytes) return hardStop(session, 'closed-refusal-state-mismatch');
    return closedIncident(
      session,
      'record-attempt-result',
      completion.reason === 'action-mismatch' ? 'action-mismatch' : 'evidence-drift',
      /** @type {string} */ (completion.reason),
    );
  }
  if (completion.completed === false) {
    return successor.bytes === session.acceptedStateBytes
      ? hardStop(session, /** @type {string} */ (completion.reason))
      : acceptState(session, successor.state, /** @type {string} */ (completion.reason));
  }
  return acceptState(session, successor.state, /** @type {string} */ (completion.reason));
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} trusted @param {unknown} response */
function handleTrustedCapture(session, trusted, response) {
  const top = exactRecord(response, ['inspection', 'completion'], [], 'recovery trusted capture response');
  const inspection = requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery trusted capture response.inspection',
  );
  const completion = exactRecord(top.completion, ['captured', 'finalized', 'reason', 'state'], ['projectionBatch'], 'recovery trusted capture response.completion');
  if (typeof completion.captured !== 'boolean' || typeof completion.finalized !== 'boolean') {
    return hardStop(session, 'runtime-result-malformed');
  }
  text(completion.reason, 'recovery trusted capture response.completion.reason');
  const successor = stateEnvelope(completion.state);
  if (!successor) return hardStop(session, 'successor-malformed');
  if (completion.captured !== true || completion.finalized !== false
    || completion.reason !== 'occurrence-retention-required'
    || !Object.hasOwn(completion, 'projectionBatch')) {
    if (successor.bytes !== session.acceptedStateBytes) return hardStop(session, 'refused-successor-mismatch');
    return hardStop(session, /** @type {string} */ (completion.reason));
  }
  const provisional = /** @type {Record<string, unknown>} */ (successor.state);
  const pendingCompletion = record(
    provisional.pendingCompletion,
    'recovery trusted capture response.completion.state.pendingCompletion',
  );
  const predecessor = clone(provisional);
  delete predecessor.pendingCompletion;
  if (canonicalJson(predecessor) !== session.acceptedStateBytes
    || canonicalJson(pendingCompletion.target) !== canonicalJson(session.target)
    || pendingCompletion.attemptIdentity !== trusted.attemptIdentity
    || pendingCompletion.resultIdentity !== trusted.resultIdentity
    || pendingCompletion.verificationEnvelopeIdentity !== trusted.verificationEnvelopeIdentity
    || pendingCompletion.reviewEnvelopeIdentity !== trusted.reviewEnvelopeIdentity
    || canonicalJson(pendingCompletion.findingIdentities) !== canonicalJson(trusted.findingIdentities)
    || pendingCompletion.capturedInspectionIdentity !== sha256(canonicalJson(inspection))) {
    return hardStop(session, 'trusted-capture-binding-mismatch');
  }
  let effect;
  try {
    const batch = /** @type {Record<string, unknown>} */ (
      validateProjectionBatchV1(completion.projectionBatch, 'recovery trusted capture response.completion.projectionBatch')
    );
    const events = /** @type {Record<string, unknown>[]} */ (batch.events);
    const approach = record(events[0], 'recovery trusted capture response approach event');
    const occurrence = record(approach.occurrence, 'recovery trusted capture response approach occurrence');
    const basis = record(approach.basis, 'recovery trusted capture response approach basis');
    const chronology = record(occurrence.chronology, 'recovery trusted capture response approach chronology');
    const pending = /** @type {Record<string, unknown>[]} */ (
      /** @type {Record<string, unknown>} */ (session.acceptedState).pending
    )[0];
    const findings = events.slice(1).map((event, index) => {
      const findingOccurrence = record(
        record(event, `recovery trusted capture response finding event[${index}]`).occurrence,
        `recovery trusted capture response finding occurrence[${index}]`,
      );
      if (findingOccurrence.reviewEnvelopeIdentity !== trusted.reviewEnvelopeIdentity) {
        invalid('recovery trusted capture response finding event', 'must bind the exact review envelope');
      }
      return findingOccurrence.findingIdentity;
    }).sort((left, right) => Buffer.compare(
      Buffer.from(/** @type {string} */ (left)),
      Buffer.from(/** @type {string} */ (right)),
    ));
    if (occurrence.attemptIdentity !== trusted.attemptIdentity
      || occurrence.resultIdentity !== trusted.resultIdentity
      || occurrence.authorizationEvidenceHash !== pending.evidenceHash
      || chronology.attemptOrdinal !== session.acceptedState.overallUsed
      || canonicalJson(approach.target) !== canonicalJson(session.target)
      || canonicalJson(basis.target) !== canonicalJson(session.target)
      || basis.action !== pending.action
      || canonicalJson(basis.materialInputs) !== canonicalJson(pending.materialInputs)
      || approach.verificationEnvelopeIdentity !== trusted.verificationEnvelopeIdentity
      || approach.reviewEnvelopeIdentity !== trusted.reviewEnvelopeIdentity
      || canonicalJson(findings) !== canonicalJson(trusted.findingIdentities)) {
      invalid('recovery trusted capture response projectionBatch', 'must bind the exact trusted result identities');
    }
    effect = pendingEffect(session, successor.state, batch, 'completion-retention', 'record-attempt-result');
  } catch {
    return hardStop(session, 'effect-contract-mismatch');
  }
  return effectRequired({ ...session, pendingEffect: effect }, 'occurrence-retention-required');
}

/**
 * Present one builder-produced capture as the trusted source stream the
 * unchanged recovery routes read. The caller never names or selects it.
 * @param {Record<string, unknown>} target @param {string} state @param {Record<string, unknown>} capture
 */
function trustedCaptureStream(target, state, capture) {
  const records = [capture];
  const body = canonicalJson({ target, state, records: records.map((substantive) => ({ substantive })) });
  return [{
    target: clone(target),
    state,
    outcomeHash: sha256(canonicalJson({ target, state, records })),
    bytes: { base64: Buffer.from(body).toString('base64') },
  }];
}

/**
 * Build both cooperative specialist attestations for one recorded attempt. Every
 * authoritative fact — target, attempt, source revision, dispatch, and chronology
 * — comes from accepted host state, and the exact verification capture this
 * boundary just produced is what review construction receives.
 * @param {Record<string, unknown>} state @param {Record<string, unknown>} pending
 * @param {Record<string, unknown>} semanticResult
 */
function specialistAttestation(state, pending, semanticResult) {
  const target = clone(canonicalTarget(pending.target));
  const attemptOrdinal = /** @type {number} */ (state.overallUsed);
  // The authorizing Inspection evidence is the host-owned identity of the source
  // revision both specialists were dispatched against.
  const inspectedEvidenceHash = /** @type {string} */ (pending.evidenceHash);
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
      outcome: semanticResult.outcome,
      operations: semanticResult.operations,
      changedTargets: semanticResult.changedTargets,
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
  const reviewOrdinal = 1;
  const verification = /** @type {Record<string, unknown>} */ (semanticResult.verification);
  const review = /** @type {Record<string, unknown>} */ (semanticResult.review);
  const verificationCapture = /** @type {Record<string, unknown>} */ (buildSpecialistAttestation({
    kind: 'verification',
    context: { ...clone(context), dispatch: { ...testerDispatch } },
    result: { ...clone(binding), dispatch: { ...testerDispatch }, checks: verification.checks },
  }));
  const reviewCapture = buildSpecialistAttestation({
    kind: 'independent-review',
    context: {
      ...clone(context),
      dispatch: { ...reviewerDispatch },
      reviewOrdinal,
      verification: { capture: verificationCapture, dispatch: { ...testerDispatch } },
    },
    result: {
      ...clone(binding),
      reviewOrdinal,
      dispatch: { ...reviewerDispatch },
      verdict: review.verdict,
      findings: review.findings,
    },
  });
  const verificationEnvelope = /** @type {Record<string, unknown>} */ (
    normalizeVerificationEnvelopeV2(verificationCapture)
  );
  const reviewEnvelope = /** @type {Record<string, unknown>} */ (
    normalizeIndependentReviewEnvelopeV2(reviewCapture, verificationEnvelope)
  );
  const checks = /** @type {Record<string, unknown>[]} */ (verificationEnvelope.checks);
  const verificationState = checks.some((check) => check.outcome === 'failed') ? 'failed' : 'passed';
  const testerStream = trustedCaptureStream(target, verificationState, verificationCapture);
  /** @type {{verification:Record<string, unknown>[],review:Record<string, unknown>[],lint:Record<string, unknown>[]}} */
  const streams = {
    verification: testerStream,
    review: trustedCaptureStream(target, /** @type {string} */ (reviewEnvelope.verdict), reviewCapture),
    lint: [],
  };
  if (requiredChecksForAction[
    /** @type {keyof typeof requiredChecksForAction} */ (pending.action)
  ].includes('lint')) {
    // Lint is the same cooperative Tester provenance, not an independent check.
    streams.lint = testerStream;
  }
  return {
    trusted: {
      attemptIdentity: verificationEnvelope.attemptIdentity,
      resultIdentity: verificationEnvelope.resultIdentity,
      verificationEnvelopeIdentity: verificationEnvelope.envelopeIdentity,
      reviewEnvelopeIdentity: reviewEnvelope.envelopeIdentity,
      findingIdentities: /** @type {Record<string, unknown>[]} */ (reviewEnvelope.findings)
        .map((finding) => finding.findingIdentity),
    },
    streams,
  };
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke */
function recordAttemptResult(session, request, invoke) {
  if (session.pendingEffect !== null) return effectRequired(session, 'effect-unsettled');
  const state = /** @type {Record<string, unknown>} */ (session.acceptedState);
  const pendingRows = /** @type {Record<string, unknown>[]} */ (state.pending);
  if (pendingRows.length !== 1) return hardStop(session, 'pending-attempt-missing');
  const pending = pendingRows[0];
  const policy = /** @type {Record<string, unknown>} */ (state.policy);
  const attempt = /** @type {Record<string, unknown>} */ (request.attemptResult);
  const semanticResult = /** @type {Record<string, unknown>} */ (attempt.result);
  const resultKind = validateAttemptResult(semanticResult, 'HostAdapterRequest.attemptResult.result');
  if (resultKind !== (policy.mode === 'autonomous' ? 'trusted' : 'guarded')) {
    return hardStop(session, 'attempt-result-contract-mismatch');
  }
  const target = clone(pending.target);
  const route = completionRoute(pending);
  if (policy.mode === 'autonomous') {
    // Autonomous attestation derives only the plain ordinary approach basis, so
    // it cannot reach this action's proposal-bound basis. Refuse before capture.
    if (pending.action === 'reconcile-derived-definition') {
      return hardStop(session, 'definition-reconciliation-attestation-unsupported');
    }
    let attestation;
    try {
      attestation = specialistAttestation(state, pending, semanticResult);
    } catch {
      return hardStop(session, 'attempt-result-contract-mismatch');
    }
    const completion = {
      version: 2,
      target,
      route,
      outcome: semanticResult.outcome,
      operations: clone(semanticResult.operations),
      changedTargets: clone(semanticResult.changedTargets),
      ...attestation.trusted,
    };
    return handleTrustedCapture(session, attestation.trusted, invoke('complete', {
        mode: 'capture',
        state: JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
        input: { .../** @type {Record<string, unknown>} */ (attempt.input), ...attestation.streams },
        completion,
    }));
  }
  const completionInput = {
    target,
    evidenceHash: pending.evidenceHash,
    approachHash: pending.approachHash,
    result: { target, route, ...clone(semanticResult) },
  };
  return handleLegacyCompletion(session, invoke('complete', {
      state: JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
      input: completionInput,
    }), completionInput);
}

/** @param {Record<string, unknown>} session @param {unknown} response */
function handleCompletionSettlement(session, response) {
  const top = exactRecord(response, ['inspection', 'completion'], [], 'recovery completion settlement response');
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery completion settlement response.inspection',
  );
  const completion = exactRecord(top.completion, ['captured', 'finalized', 'completed', 'reason', 'state'], ['resultIdentity', 'repeat', 'governanceEvent', 'projectionBatch'], 'recovery completion settlement response.completion');
  if (['captured', 'finalized', 'completed'].some((field) => typeof completion[field] !== 'boolean')) {
    return hardStop(session, 'runtime-result-malformed');
  }
  const effect = /** @type {Record<string, unknown>} */ (session.pendingEffect);
  const provisionalState = /** @type {Record<string, unknown>} */ (effect.provisionalState);
  const pendingCompletion = record(
    provisionalState.pendingCompletion,
    'HostAdapterSession.pendingEffect.provisionalState.pendingCompletion',
  );
  const successor = stateEnvelope(completion.state);
  if (!successor) return hardStop(session, 'successor-malformed');
  if (completion.finalized !== true) {
    if (successor.bytes !== effect.provisionalStateBytes) return hardStop(session, 'effect-refusal-state-mismatch');
    return EFFECT_RETRY_REASONS.has(/** @type {string} */ (completion.reason))
      ? effectRequired(session, /** @type {string} */ (completion.reason))
      : hardStop(session, /** @type {string} */ (completion.reason));
  }
  if (completion.captured !== true
    || !Object.hasOwn(completion, 'resultIdentity')
    || completion.resultIdentity !== pendingCompletion.resultIdentity
    || Object.hasOwn(/** @type {Record<string, unknown>} */ (successor.state), 'pendingCompletion')) {
    return hardStop(session, 'completion-finalization-binding-mismatch');
  }
  const finalState = /** @type {Record<string, unknown>} */ (successor.state);
  const capturedBatch = /** @type {Record<string, unknown>} */ (effect.projectionBatch);
  const capturedApproach = record(
    /** @type {Record<string, unknown>[]} */ (capturedBatch.events)[0],
    'HostAdapterSession.pendingEffect captured approach event',
  );
  const capturedOccurrence = record(
    capturedApproach.occurrence,
    'HostAdapterSession.pendingEffect captured approach occurrence',
  );
  const disposition = /** @type {string} */ (capturedOccurrence.disposition);
  const provisionalPending = /** @type {Record<string, unknown>[]} */ (provisionalState.pending);
  const finalCompleted = /** @type {Record<string, unknown>[]} */ (finalState.completed);
  const provisionalCompleted = /** @type {Record<string, unknown>[]} */ (provisionalState.completed);
  if (provisionalPending.length !== 1
    || finalState.overallUsed !== provisionalState.overallUsed
    || canonicalJson(finalState.policy) !== canonicalJson(provisionalState.policy)
    || canonicalJson(finalState.recoveryUsed) !== canonicalJson(provisionalState.recoveryUsed)
    || /** @type {unknown[]} */ (finalState.pending).length !== 0
    || finalCompleted.length !== provisionalCompleted.length + 1
    || canonicalJson(finalCompleted.slice(0, -1)) !== canonicalJson(provisionalCompleted)
    || canonicalJson(finalCompleted.at(-1)) !== canonicalJson({
      evidenceHash: provisionalPending[0].evidenceHash,
      approachHash: provisionalPending[0].approachHash,
      resultHash: pendingCompletion.resultIdentity,
    })
    || !sameFieldsExcept(finalState, provisionalState, ['pending', 'completed', 'pendingCompletion', 'learningGovernance'])) {
    return hardStop(session, 'completion-finalization-binding-mismatch');
  }
  if (Object.hasOwn(completion, 'projectionBatch')) {
    if (!Object.hasOwn(completion, 'governanceEvent')
      || !Object.hasOwn(completion, 'repeat')
      || !Object.hasOwn(finalState, 'learningGovernance')
      || completion.completed !== false
      || completion.reason !== 'learning-required'
      || canonicalJson(completion.repeat)
        !== canonicalJson(/** @type {Record<string, unknown>} */ (finalState.learningGovernance).trigger)) {
      return hardStop(session, 'completion-finalization-binding-mismatch');
    }
    try {
      const expectedEvent = buildGovernanceEventV1(finalState.learningGovernance);
      const batch = /** @type {Record<string, unknown>} */ (
        validateProjectionBatchV1(completion.projectionBatch, 'recovery completion settlement response.completion.projectionBatch')
      );
      if (canonicalJson(completion.governanceEvent) !== canonicalJson(expectedEvent)
        || batch.purpose !== 'governance-required'
        || canonicalJson(batch.target) !== canonicalJson(session.target)
        || canonicalJson(batch.events) !== canonicalJson([expectedEvent])) {
        invalid('recovery completion settlement response.completion', 'must bind exact learning governance projection');
      }
    } catch {
      return hardStop(session, 'completion-finalization-binding-mismatch');
    }
    let nextEffect;
    try {
      nextEffect = pendingEffect(session, successor.state, /** @type {Record<string, unknown>} */ (completion.projectionBatch), 'projection', /** @type {string} */ (effect.semanticOperation));
    } catch {
      return hardStop(session, 'effect-contract-mismatch');
    }
    return effectRequired({ ...session, pendingEffect: nextEffect }, /** @type {string} */ (completion.reason));
  }
  const expectedReason = disposition === 'accepted' ? 'completed' : disposition;
  if (Object.hasOwn(completion, 'repeat')
    || Object.hasOwn(completion, 'governanceEvent')
    || completion.completed !== (disposition === 'accepted')
    || completion.reason !== expectedReason) {
    return hardStop(session, 'completion-finalization-binding-mismatch');
  }
  const provisionalHasGovernance = Object.hasOwn(provisionalState, 'learningGovernance');
  const finalHasGovernance = Object.hasOwn(finalState, 'learningGovernance');
  if (provisionalHasGovernance !== finalHasGovernance) {
    return hardStop(session, 'completion-finalization-binding-mismatch');
  }
  if (provisionalHasGovernance) {
    const expectedGovernance = clone(provisionalState.learningGovernance);
    if (disposition === 'accepted'
      && expectedGovernance.phase === 'alternative-authorized'
      && expectedGovernance.authorizedAttemptIdentity === pendingCompletion.attemptIdentity) {
      expectedGovernance.phase = 'alternative-verified';
    }
    if (canonicalJson(finalState.learningGovernance) !== canonicalJson(expectedGovernance)) {
      return hardStop(session, 'completion-finalization-binding-mismatch');
    }
  }
  return acceptState(session, successor.state, /** @type {string} */ (completion.reason));
}

/** @param {Record<string, unknown>} session @param {unknown} response */
function handleProjectionSettlement(session, response) {
  const top = exactRecord(response, ['inspection', 'transition'], [], 'recovery projection settlement response');
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery projection settlement response.inspection',
  );
  const transition = exactRecord(top.transition, ['verified', 'reason', 'state'], ['projectionRef'], 'recovery projection settlement response.transition');
  if (typeof transition.verified !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  const effect = /** @type {Record<string, unknown>} */ (session.pendingEffect);
  const successor = stateEnvelope(transition.state);
  if (!successor) return hardStop(session, 'successor-malformed');
  if (transition.verified !== true) {
    if (successor.bytes !== effect.provisionalStateBytes) return hardStop(session, 'effect-refusal-state-mismatch');
    return EFFECT_RETRY_REASONS.has(/** @type {string} */ (transition.reason))
      ? effectRequired(session, /** @type {string} */ (transition.reason))
      : hardStop(session, /** @type {string} */ (transition.reason));
  }
  if (!Object.hasOwn(transition, 'projectionRef')) {
    return hardStop(session, 'projection-binding-mismatch');
  }
  try {
    const batch = /** @type {Record<string, unknown>} */ (effect.projectionBatch);
    const ref = /** @type {Record<string, unknown>} */ (transition.projectionRef);
    if (canonicalJson(ref.target) !== canonicalJson(session.target)
      || ref.batchIdentity !== batch.batchIdentity
      || canonicalJson(ref.eventHashes) !== canonicalJson(
        /** @type {Record<string, unknown>[]} */ (batch.events).map((event) => event.eventHash),
      )) invalid('projectionRef', 'must bind the exact pending projection batch');
    const provisional = /** @type {Record<string, unknown>} */ (effect.provisionalState);
    const accepted = /** @type {Record<string, unknown>} */ (successor.state);
    const provisionalGovernance = record(provisional.learningGovernance, 'pending projection learningGovernance');
    const acceptedGovernance = record(accepted.learningGovernance, 'accepted projection learningGovernance');
    const expectedGovernance = clone(provisionalGovernance);
    delete expectedGovernance.projectionCommitment;
    if (expectedGovernance.phase === 'reviewed') expectedGovernance.phase = 'projected';
    if (!sameFieldsExcept(accepted, provisional, ['learningGovernance'])
      || canonicalJson(acceptedGovernance) !== canonicalJson(expectedGovernance)) {
      invalid('projection successor', 'must preserve the exact provisional predecessor');
    }
  } catch {
    return hardStop(session, 'projection-binding-mismatch');
  }
  return acceptState(session, successor.state, /** @type {string} */ (transition.reason));
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke */
function settleEffect(session, request, invoke) {
  if (session.pendingEffect === null) return hardStop(session, 'pending-effect-missing');
  const effect = /** @type {Record<string, unknown>} */ (session.pendingEffect);
  if (effect.kind === 'completion-retention') {
    return handleCompletionSettlement(session, invoke('complete', {
        mode: 'finalize',
        state: clone(effect.provisionalState),
        input: request.input,
        projectionBatch: clone(effect.projectionBatch),
    }));
  }
  return handleProjectionSettlement(session, invoke('transition', {
      mode: 'verify-projection',
      state: clone(effect.provisionalState),
      input: request.input,
      projectionBatch: clone(effect.projectionBatch),
  }));
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} governance @param {unknown} response @param {string} key @param {string} flag */
function handleGovernance(session, governance, response, key, flag) {
  const top = exactRecord(response, ['inspection', key], [], `recovery ${governance.action} response`);
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    `recovery ${governance.action} response.inspection`,
  );
  const optionalFields = {
    'review-learning': ['reviewEvent', 'governanceEvent', 'projectionBatch'],
    'bind-alternative': ['binding'],
    'verify-no-progress': ['verification'],
    'controlled-end': ['controlledEnd'],
    'resume-learning': [
      'resumedFrom', 'governanceIdentity', 'revision', 'phase', 'trigger',
      'failedApproachSet', 'projectionRef',
    ],
  }[/** @type {string} */ (governance.action)];
  const body = exactRecord(
    top[key],
    [flag, 'reason', 'state'],
    optionalFields,
    `recovery ${governance.action} response.${key}`,
  );
  if (typeof body[flag] !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  text(body.reason, `recovery ${governance.action} response.${key}.reason`);
  const successor = stateEnvelope(body.state);
  if (!successor) return hardStop(session, 'successor-malformed');
  if (body[flag] !== true) {
    if (successor.bytes !== session.acceptedStateBytes) return hardStop(session, 'refused-successor-mismatch');
    const incidentClass = {
      'inspection-stale': 'evidence-drift',
      'target-mismatch': 'evidence-drift',
      'lane-prestate-mismatch': 'evidence-drift',
      'permit-stale': 'stale-permit',
      'permit-target-mismatch': 'stale-permit',
      'permit-transition-mismatch': 'stale-permit',
    }[/** @type {string} */ (body.reason)];
    return incidentClass
      ? closedIncident(session, 'advance-governance', incidentClass, /** @type {string} */ (body.reason))
      : hardStop(session, /** @type {string} */ (body.reason));
  }
  const successFields = {
    'review-learning': ['reviewEvent', 'governanceEvent', 'projectionBatch'],
    'bind-alternative': ['binding'],
    'verify-no-progress': ['verification'],
    'controlled-end': ['controlledEnd'],
    'resume-learning': ['resumedFrom', 'governanceIdentity', 'revision', 'phase', 'trigger', 'failedApproachSet'],
  }[/** @type {string} */ (governance.action)];
  if (successFields.some((field) => !Object.hasOwn(body, field))) {
    return hardStop(session, 'runtime-result-malformed');
  }
  if (Object.hasOwn(body, 'projectionBatch')) {
    let effect;
    try {
      effect = pendingEffect(session, successor.state, /** @type {Record<string, unknown>} */ (body.projectionBatch), 'projection', 'advance-governance');
    } catch {
      return hardStop(session, 'effect-contract-mismatch');
    }
    return effectRequired({ ...session, pendingEffect: effect }, /** @type {string} */ (body.reason));
  }
  return acceptState(session, successor.state, /** @type {string} */ (body.reason), governance.action === 'controlled-end');
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke */
function advanceGovernance(session, request, invoke) {
  if (session.pendingEffect !== null) return effectRequired(session, 'effect-unsettled');
  const governance = /** @type {Record<string, unknown>} */ (request.governance);
  const route = /** @type {Record<string, unknown>} */ (
    deriveGovernanceRuntimeRequestV1(session.acceptedState, governance)
  );
  return handleGovernance(
    session,
    governance,
    invoke(/** @type {string} */ (route.command), route.request),
    /** @type {string} */ (route.resultKey),
    /** @type {string} */ (route.successFlag),
  );
}

/** One adapter worker's replay seal over the lane permits it issued itself. */
function createLaneLedger() {
  return { permits: new Map() };
}

/** @param {unknown} value @param {string} label */
function laneEffectPermit(value, label) {
  const candidate = record(value, label);
  return /** @type {Record<string, unknown>} */ (
    candidate.kind === 'lane-projection'
      ? validateProjectionPermitV1(value, label)
      : validateLaneMutationPermitV1(value, label)
  );
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke @param {ReturnType<typeof createLaneLedger>} ledger */
function prepareAuthoritativeProjection(session, request, invoke, ledger) {
  if (session.pendingEffect === null) return hardStop(session, 'pending-effect-missing');
  const effect = /** @type {Record<string, unknown>} */ (session.pendingEffect);
  const projection = /** @type {Record<string, unknown>} */ (request.projection);
  const binding = Object.hasOwn(projection, 'laneBinding')
    ? /** @type {Record<string, unknown>} */ (projection.laneBinding)
    : null;
  const top = exactRecord(invoke('transition', {
    mode: 'prepare-projection',
    state: clone(effect.provisionalState),
    input: projection.input,
    projectionBatch: clone(effect.projectionBatch),
    ...(binding === null ? {} : {
      lanePrestate: binding.lanePrestate,
      targetMapping: binding.targetMapping,
      operationTime: binding.operationTime,
    }),
  }), ['inspection', 'transition'], [], 'recovery projection preparation response');
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery projection preparation response.inspection',
  );
  const transition = exactRecord(top.transition, ['prepared', 'reason', 'state'], ['plan'], 'recovery projection preparation response.transition');
  if (typeof transition.prepared !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  text(transition.reason, 'recovery projection preparation response.transition.reason');
  const successor = stateEnvelope(transition.state);
  // Preparation derives; it never advances the provisional predecessor.
  if (!successor || successor.bytes !== effect.provisionalStateBytes) {
    return hardStop(session, 'projection-preparation-state-mismatch');
  }
  if (transition.prepared !== true) {
    if (EFFECT_RETRY_REASONS.has(/** @type {string} */ (transition.reason))) {
      return effectRequired(session, /** @type {string} */ (transition.reason));
    }
    const incidentClass = {
      'lane-prestate-mismatch': 'evidence-drift',
      'target-mapping-missing': 'evidence-drift',
      'projection-batch-mismatch': 'evidence-drift',
    }[/** @type {string} */ (transition.reason)];
    return incidentClass
      ? closedIncident(session, 'prepare-authoritative-projection', incidentClass, /** @type {string} */ (transition.reason))
      : hardStop(session, /** @type {string} */ (transition.reason));
  }
  if (transition.reason !== 'projection-prepared' || !Object.hasOwn(transition, 'plan')) {
    return hardStop(session, 'projection-preparation-binding-mismatch');
  }
  const plan = record(transition.plan, 'recovery projection preparation response.transition.plan');
  const batch = /** @type {Record<string, unknown>} */ (effect.projectionBatch);
  if (plan.batchIdentity !== batch.batchIdentity
    || canonicalJson(plan.target) !== canonicalJson(session.target)) {
    return hardStop(session, 'projection-preparation-binding-mismatch');
  }
  if (binding !== null) {
    try {
      const items = denseArray(plan.items, 'recovery projection preparation response.transition.plan.items');
      const events = /** @type {Record<string, unknown>[]} */ (batch.events);
      if (items.length !== events.length) invalid('projection plan', 'must cover the exact pending batch');
      for (let index = 0; index < items.length; index += 1) {
        const item = record(items[index], `projection plan item[${index}]`);
        const permit = laneEffectPermit(item.projectionPermit, `projection plan item[${index}].projectionPermit`);
        if (permit.kind !== 'lane-projection'
          || canonicalJson(permit.target) !== canonicalJson(session.target)
          || permit.subjectRunStateHash !== effect.provisionalStateHash
          || permit.batchIdentity !== batch.batchIdentity
          || permit.eventHash !== events[index].eventHash
          || permit.eventHash !== item.eventHash
          || permit.mutationIdentity !== item.mutationIdentity
          || permit.mutationIdentity !== sha256(canonicalJson(item.mutation))) {
          invalid('projection plan item', 'must bind the exact provisional state, event, and mutation');
        }
        const prior = ledger.permits.get(/** @type {string} */ (permit.permitHash));
        if (prior && canonicalJson(prior.permit) !== canonicalJson(permit)) {
          invalid('projection plan item', 'must not conflict with an admitted permit');
        }
        if (!prior) {
          ledger.permits.set(/** @type {string} */ (permit.permitHash), {
            stage: 'issued',
            permit: clone(permit),
            receipt: null,
          });
        }
      }
    } catch {
      return hardStop(session, 'projection-preparation-binding-mismatch');
    }
  }
  return effectRequired(session, 'projection-prepared', { kind: 'projection-plan', plan: clone(plan) });
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke @param {ReturnType<typeof createLaneLedger>} ledger */
function authorizeLaneEffect(session, request, invoke, ledger) {
  if (session.pendingEffect !== null) return effectRequired(session, 'effect-unsettled');
  const laneEffect = /** @type {Record<string, unknown>} */ (request.laneEffect);
  const top = exactRecord(invoke('transition', {
    mode: 'issue-lane-permit',
    state: JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
    input: laneEffect.input,
    mutation: laneEffect.mutation,
    lanePrestate: laneEffect.lanePrestate,
    targetMapping: laneEffect.targetMapping,
  }), ['inspection', 'transition'], [], 'recovery lane permit response');
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery lane permit response.inspection',
  );
  const transition = exactRecord(top.transition, ['issued', 'reason', 'state'], ['permit'], 'recovery lane permit response.transition');
  if (typeof transition.issued !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  text(transition.reason, 'recovery lane permit response.transition.reason');
  const successor = stateEnvelope(transition.state);
  if (!successor || successor.bytes !== session.acceptedStateBytes) {
    return hardStop(session, 'lane-permit-state-mismatch');
  }
  if (transition.issued !== true) {
    const incidentClass = {
      'inspection-stale': 'evidence-drift',
      'target-mismatch': 'evidence-drift',
      'lane-prestate-mismatch': 'evidence-drift',
      'target-mapping-missing': 'evidence-drift',
      'projection-batch-mismatch': 'evidence-drift',
      'permit-transition-mismatch': 'stale-permit',
    }[/** @type {string} */ (transition.reason)];
    return incidentClass
      ? closedIncident(session, 'authorize-lane-effect', incidentClass, /** @type {string} */ (transition.reason))
      : hardStop(session, /** @type {string} */ (transition.reason));
  }
  if (transition.reason !== 'lane-permit-issued' || !Object.hasOwn(transition, 'permit')) {
    return hardStop(session, 'lane-permit-binding-mismatch');
  }
  let permit;
  try {
    permit = laneEffectPermit(transition.permit, 'recovery lane permit response.transition.permit');
    if (permit.lane !== 'lightweight'
      || canonicalJson(permit.target) !== canonicalJson(session.target)
      || permit.subjectRunStateHash !== session.acceptedStateHash
      || permit.mutationIdentity !== sha256(canonicalJson(laneEffect.mutation))) {
      invalid('recovery lane permit response.transition.permit', 'must bind the exact accepted authority and one allowed mutation');
    }
  } catch {
    return hardStop(session, 'lane-permit-binding-mismatch');
  }
  if (ledger.permits.has(/** @type {string} */ (permit.permitHash))) {
    return hardStop(session, 'lane-permit-replayed');
  }
  // No local cap: every permit insert trails a retained probe insert on the same handle-stable authority, so the probe ceiling bounds permits at the same MAX_GRAPH_ENTRIES.
  ledger.permits.set(/** @type {string} */ (permit.permitHash), {
    stage: 'issued',
    permit: clone(permit),
    receipt: null,
  });
  return acceptState(session, successor.state, 'lane-permit-issued', false, {
    kind: 'lane-permit',
    permit: clone(permit),
  });
}

/**
 * Apply exactly one permit-bound mutation through the authoritative lane owner.
 * No board command line and no direct file edit is reachable from here.
 * @param {Record<string, unknown>} session @param {Record<string, unknown>} request
 * @param {ReturnType<typeof trustedPorts>} ports @param {ReturnType<typeof createLaneLedger>} ledger
 */
function applyLaneEffect(session, request, ports, ledger) {
  if (/** @type {Record<string, unknown>} */ (session.target).lane !== 'lightweight') {
    return hardStop(session, 'lane-owner-unavailable');
  }
  const application = /** @type {Record<string, unknown>} */ (request.laneApplication);
  if (session.pendingEffect !== null
    && (application.permit === null
      || typeof application.permit !== 'object'
      || Array.isArray(application.permit)
      || /** @type {Record<string, unknown>} */ (application.permit).kind !== 'lane-projection')) {
    return effectRequired(session, 'effect-unsettled');
  }
  let permit;
  try {
    permit = laneEffectPermit(application.permit, 'HostAdapterRequest.laneApplication.permit');
  } catch {
    return hardStop(session, 'lane-permit-not-authorized');
  }
  const entry = ledger.permits.get(/** @type {string} */ (permit.permitHash));
  if (!entry) return hardStop(session, 'lane-permit-not-authorized');
  if (entry.stage !== 'issued') return hardStop(session, 'lane-permit-replayed');
  const projection = permit.kind === 'lane-projection';
  const pending = session.pendingEffect === null
    ? null
    : /** @type {Record<string, unknown>} */ (session.pendingEffect);
  if (projection) {
    if (pending === null
      || permit.subjectRunStateHash !== pending.provisionalStateHash
      || permit.batchIdentity !== /** @type {Record<string, unknown>} */ (pending.projectionBatch).batchIdentity) {
      return hardStop(session, 'lane-permit-binding-mismatch');
    }
  } else if (pending !== null) {
    return effectRequired(session, 'effect-unsettled');
  }
  const subjectState = projection
    ? /** @type {Record<string, unknown>} */ (pending).provisionalState
    : session.acceptedState;
  const subjectStateHash = projection
    ? /** @type {Record<string, unknown>} */ (pending).provisionalStateHash
    : session.acceptedStateHash;
  if (canonicalJson(entry.permit) !== canonicalJson(permit)
    || permit.subjectRunStateHash !== subjectStateHash
    || permit.mutationIdentity !== sha256(canonicalJson(application.mutation))) {
    return hardStop(session, 'lane-permit-binding-mismatch');
  }
  const laneRequest = freezeData({
    version: 1,
    operation: permit.kind === 'lane-projection' ? 'work-project' : 'work-set',
    root: application.root,
    owner: clone(application.owner),
    target: clone(session.target),
    state: clone(subjectState),
    permit: clone(permit),
    mapping: clone(application.mapping),
    expected: clone(application.expected),
    mutation: clone(application.mutation),
  });
  let outcome;
  try {
    outcome = ports.laneOwner.apply(laneRequest);
  } catch {
    return hardStop(session, 'lane-owner-threw');
  }
  let laneResult;
  try {
    laneResult = record(detachedData(outcome, 'lane owner result'), 'lane owner result');
  } catch {
    return hardStop(session, 'lane-owner-result-malformed');
  }
  if (laneResult.ok !== true) {
    // A refusal leaves every authoritative surface byte-for-byte unchanged; an
    // indeterminate outcome is the existing irreducible hard stop.
    if (laneResult.phase !== 'refused' || typeof laneResult.reason !== 'string') {
      return hardStop(session, 'lane-effect-indeterminate');
    }
    return closedIncident(session, 'apply-lane-effect', 'evidence-drift', laneResult.reason);
  }
  let receipt;
  try {
    receipt = /** @type {Record<string, unknown>} */ (
      validateLightweightAtomicReceiptV1(laneResult.receipt, 'lane owner result.receipt')
    );
    if (laneResult.phase !== 'committed'
      || receipt.permitHash !== permit.permitHash
      || receipt.mutationIdentity !== permit.mutationIdentity
      || receipt.targetMappingHash !== permit.targetMappingHash
      || receipt.lanePrestateHash !== permit.lanePrestateHash
      || canonicalJson(receipt.target) !== canonicalJson(session.target)) {
      invalid('lane owner result.receipt', 'must bind the exact permit, mapping, prestate, and target');
    }
  } catch {
    return hardStop(session, 'lane-receipt-binding-mismatch');
  }
  entry.stage = 'applied';
  entry.receipt = clone(receipt);
  if (projection) {
    return effectRequired(
      session,
      'lane-projection-applied',
      { kind: 'lane-receipt', receipt: clone(receipt) },
    );
  }
  return acceptState(
    session,
    JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
    'lane-mutation-applied',
    false,
    { kind: 'lane-receipt', receipt: clone(receipt) },
  );
}

/** @param {Record<string, unknown>} subject @param {Record<string, unknown>} successor @param {Record<string, unknown>} receipt */
function laneReceiptSuccessorMatches(subject, successor, receipt) {
  if (!Object.hasOwn(subject, 'learningGovernance')) {
    return canonicalJson(successor) === canonicalJson(subject);
  }
  const expected = clone(subject);
  const governance = /** @type {Record<string, unknown>} */ (expected.learningGovernance);
  if (governance.phase === 'alternative-authorized-pending-lane') {
    governance.phase = 'alternative-authorized';
    governance.laneClaimReceiptIdentity = receipt.receiptHash;
  } else if (governance.phase === 'alternative-verified'
    || governance.phase === 'no-progress-verified') {
    delete expected.learningGovernance;
  }
  return canonicalJson(successor) === canonicalJson(expected);
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke @param {ReturnType<typeof createLaneLedger>} ledger */
function commitLaneReceipt(session, request, invoke, ledger) {
  const laneReceipt = /** @type {Record<string, unknown>} */ (request.laneReceipt);
  if (session.pendingEffect !== null
    && (laneReceipt.permit === null
      || typeof laneReceipt.permit !== 'object'
      || Array.isArray(laneReceipt.permit)
      || /** @type {Record<string, unknown>} */ (laneReceipt.permit).kind !== 'lane-projection')) {
    return effectRequired(session, 'effect-unsettled');
  }
  let permit;
  try {
    permit = laneEffectPermit(laneReceipt.permit, 'HostAdapterRequest.laneReceipt.permit');
  } catch {
    return hardStop(session, 'lane-permit-not-authorized');
  }
  const entry = ledger.permits.get(/** @type {string} */ (permit.permitHash));
  if (!entry) return hardStop(session, 'lane-permit-not-authorized');
  if (entry.stage === 'committed') return hardStop(session, 'lane-receipt-replayed');
  if (entry.stage !== 'applied') return hardStop(session, 'lane-effect-unapplied');
  const projection = permit.kind === 'lane-projection';
  const pending = session.pendingEffect === null
    ? null
    : /** @type {Record<string, unknown>} */ (session.pendingEffect);
  if (projection) {
    if (pending === null
      || permit.subjectRunStateHash !== pending.provisionalStateHash
      || permit.batchIdentity !== /** @type {Record<string, unknown>} */ (pending.projectionBatch).batchIdentity) {
      return hardStop(session, 'lane-permit-binding-mismatch');
    }
  } else if (pending !== null) {
    return effectRequired(session, 'effect-unsettled');
  }
  const subjectState = projection
    ? /** @type {Record<string, unknown>} */ (pending).provisionalState
    : session.acceptedState;
  const subjectStateBytes = projection
    ? /** @type {Record<string, unknown>} */ (pending).provisionalStateBytes
    : session.acceptedStateBytes;
  if (canonicalJson(entry.permit) !== canonicalJson(permit)
    || canonicalJson(entry.receipt) !== canonicalJson(laneReceipt.receipt)
    || permit.subjectRunStateHash !== sha256(/** @type {string} */ (subjectStateBytes))) {
    return hardStop(session, 'lane-receipt-binding-mismatch');
  }
  const top = exactRecord(invoke('transition', {
    mode: 'commit-lane-receipt',
    state: clone(subjectState),
    input: laneReceipt.input,
    permit: clone(entry.permit),
    receipt: clone(entry.receipt),
  }), ['inspection', 'transition'], [], 'recovery lane receipt response');
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery lane receipt response.inspection',
  );
  const transition = exactRecord(
    top.transition,
    ['committed', 'reason', 'state'],
    ['receipt', 'terminalEvidenceIdentity'],
    'recovery lane receipt response.transition',
  );
  if (typeof transition.committed !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  text(transition.reason, 'recovery lane receipt response.transition.reason');
  const successor = stateEnvelope(transition.state);
  if (!successor) {
    return hardStop(session, projection ? 'lane-receipt-state-mismatch' : 'successor-malformed');
  }
  if (transition.committed !== true) {
    if (successor.bytes !== subjectStateBytes) {
      return hardStop(session, projection ? 'lane-receipt-state-mismatch' : 'refused-successor-mismatch');
    }
    if (projection) return hardStop(session, /** @type {string} */ (transition.reason));
    const incidentClass = {
      'inspection-stale': 'evidence-drift',
      'permit-stale': 'stale-permit',
      'permit-target-mismatch': 'stale-permit',
      'permit-hash-mismatch': 'stale-permit',
    }[/** @type {string} */ (transition.reason)];
    return incidentClass
      ? closedIncident(session, 'commit-lane-receipt', incidentClass, /** @type {string} */ (transition.reason))
      : hardStop(session, /** @type {string} */ (transition.reason));
  }
  if (projection
    ? successor.bytes !== subjectStateBytes
    : !laneReceiptSuccessorMatches(
      /** @type {Record<string, unknown>} */ (subjectState),
      /** @type {Record<string, unknown>} */ (successor.state),
      /** @type {Record<string, unknown>} */ (entry.receipt),
    )) {
    return hardStop(session, 'lane-receipt-state-mismatch');
  }
  if (transition.reason !== 'lane-receipt-committed'
    || !Object.hasOwn(transition, 'receipt')
    || canonicalJson(transition.receipt) !== canonicalJson(entry.receipt)) {
    return hardStop(session, 'lane-receipt-binding-mismatch');
  }
  entry.stage = 'committed';
  if (projection) {
    return effectRequired(session, 'lane-receipt-committed', {
      kind: 'lane-settlement',
      receipt: clone(entry.receipt),
      terminalEvidenceIdentity: null,
    });
  }
  return acceptState(session, successor.state, 'lane-receipt-committed', false, {
    kind: 'lane-settlement',
    receipt: clone(entry.receipt),
    terminalEvidenceIdentity: Object.hasOwn(transition, 'terminalEvidenceIdentity')
      ? transition.terminalEvidenceIdentity
      : null,
  });
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke */
function auditRun(session, request, invoke) {
  if (session.pendingEffect !== null) return effectRequired(session, 'effect-unsettled');
  const audit = /** @type {Record<string, unknown>} */ (request.audit);
  const top = exactRecord(invoke('audit', {
    state: JSON.parse(/** @type {string} */ (session.acceptedStateBytes)),
    input: audit.input,
  }), ['inspection', 'audit'], [], 'recovery audit response');
  requireSessionInspection(
    /** @type {Record<string, unknown>} */ (top.inspection),
    session,
    'recovery audit response.inspection',
  );
  const body = exactRecord(top.audit, ['derived', 'reason', 'state'], ['summary'], 'recovery audit response.audit');
  if (typeof body.derived !== 'boolean') return hardStop(session, 'runtime-result-malformed');
  text(body.reason, 'recovery audit response.audit.reason');
  const successor = stateEnvelope(body.state);
  // The audit reads and validates; it never mutates the accepted state.
  if (!successor || successor.bytes !== session.acceptedStateBytes) {
    return hardStop(session, 'audit-state-mismatch');
  }
  if (body.derived === true && !Object.hasOwn(body, 'summary')) {
    return hardStop(session, 'runtime-result-malformed');
  }
  return acceptState(session, successor.state, 'run-audited', false, {
    kind: 'run-audit',
    derived: body.derived,
    reason: body.reason,
    ...(Object.hasOwn(body, 'summary') ? { summary: clone(body.summary) } : {}),
  });
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke */
function freshInspection(session, request, invoke) {
  const response = exactRecord(invoke('inspect', { trigger: 'explicit-inspection', input: request.input }), ['inspection'], [], 'recovery inspect response');
  const inspection = requireSessionInspection(
    /** @type {Record<string, unknown>} */ (response.inspection),
    session,
    'recovery inspect response.inspection',
  );
  // Evidence identity stays content-derived on Inspection itself. Bind this
  // successful runtime capture to the prior serialized session so equal content
  // captured again is a new occurrence without introducing another counter.
  const inspectionIdentity = sha256(canonicalJson({
    inspection,
    predecessorSessionIdentity: session.sessionIdentity,
  }));
  const notice = session.recoveryNotice;
  const next = advanceHost(session, { inspectionIdentity, correction: null, recoveryNotice: null });
  return checkedResult({
    version: 1,
    outcome: 'accepted',
    reason: 'inspection-refreshed',
    ...(notice === null || notice === undefined ? {} : { recoveryNotice: clone(notice) }),
    session: next,
  });
}

/** @param {Record<string, unknown>} session @param {Record<string, unknown>} request @param {(command:string, request:unknown)=>unknown} invoke */
function authorizeAttemptOperation(session, request, invoke) {
  if (session.pendingEffect !== null) return effectRequired(session, 'effect-unsettled');
  const authorization = /** @type {Record<string, unknown>} */ (request.authorization);
  const assessment = /** @type {Record<string, unknown>} */ (authorization.assessment);
  const mode = assessment.action === 'execute-task' ? 'ordinary' : 'recovery';
  const state = JSON.parse(/** @type {string} */ (session.acceptedStateBytes));
  let attemptPermit;
  if (Object.hasOwn(authorization, 'permit')) {
    const binding = /** @type {Record<string, unknown>} */ (authorization.permit);
    const permitResponse = exactRecord(invoke('transition', {
      mode: 'issue-attempt-permit',
      state,
      input: authorization.input,
      lanePrestate: binding.lanePrestate,
      targetMapping: binding.targetMapping,
    }), ['inspection', 'transition'], [], 'recovery attempt permit response');
    requireSessionInspection(
      /** @type {Record<string, unknown>} */ (permitResponse.inspection),
      session,
      'recovery attempt permit response.inspection',
    );
    const transition = exactRecord(
      permitResponse.transition,
      ['issued', 'reason', 'state'],
      ['permit'],
      'recovery attempt permit response.transition',
    );
    if (typeof transition.issued !== 'boolean') return hardStop(session, 'runtime-result-malformed');
    const permitState = stateEnvelope(transition.state);
    if (!permitState || permitState.bytes !== session.acceptedStateBytes) {
      return hardStop(session, 'attempt-permit-state-mismatch');
    }
    if (transition.issued !== true) {
      const incidentClass = {
        'inspection-stale': 'evidence-drift',
        'target-mismatch': 'evidence-drift',
        'lane-prestate-mismatch': 'evidence-drift',
        'permit-stale': 'stale-permit',
      }[/** @type {string} */ (transition.reason)];
      return incidentClass
        ? closedIncident(session, 'authorize-attempt', incidentClass, /** @type {string} */ (transition.reason))
        : hardStop(session, /** @type {string} */ (transition.reason));
    }
    if (transition.reason !== 'attempt-permit-issued' || !Object.hasOwn(transition, 'permit')) {
      return hardStop(session, 'attempt-permit-binding-mismatch');
    }
    try {
      const permit = /** @type {Record<string, unknown>} */ (
        validateAttemptAuthorizationPermitV1(transition.permit, 'recovery attempt permit response.transition.permit')
      );
      if (canonicalJson(permit.target) !== canonicalJson(session.target)
        || permit.subjectRunStateHash !== session.acceptedStateHash) {
        invalid('recovery attempt permit response.transition.permit', 'must bind the exact session predecessor');
      }
      attemptPermit = permit;
    } catch {
      return hardStop(session, 'attempt-permit-binding-mismatch');
    }
  }
  return handleAuthorization(session, assessment, invoke('authorize', {
    trigger: 'resume',
    state,
    input: authorization.input,
    assessment,
    mode,
    ...(attemptPermit === undefined ? {} : { attemptPermit }),
  }), mode, attemptPermit);
}

class RuntimeIncident extends Error {
  /** @param {string} incidentClass @param {string} reason @param {string} observationIdentity */
  constructor(incidentClass, reason, observationIdentity) {
    super(reason);
    this.incidentClass = incidentClass;
    this.observationIdentity = observationIdentity;
    this.provenNoEffect = false;
  }
}

/**
 * @param {unknown} dependenciesValue
 * @param {'admitted'|'resumed'} [mode] `resumed` ports carry no admission because the
 * surviving supervisor already admitted the replacement worker through handoff.
 */
function trustedPorts(dependenciesValue, mode = 'admitted') {
  const dependencies = exactRecord(
    dependenciesValue === undefined ? {} : dependenciesValue,
    mode === 'admitted' ? ['supervisorSession', 'noEffectAuthority'] : ['noEffectAuthority', 'checkpoint'],
    mode === 'admitted' ? ['runtime', 'checkpoint', 'laneOwner'] : ['runtime', 'laneOwner'],
    'host adapter dependencies',
  );
  const supervisorSession = mode === 'admitted'
    ? exactRecord(
      dependencies.supervisorSession,
      ['identity', 'admit'],
      [],
      'host adapter dependencies.supervisorSession',
    )
    : { identity: sha256('dude-work/host-adapter:resumed-supervisor:v1'), admit: () => undefined };
  hash(supervisorSession.identity, 'host adapter dependencies.supervisorSession.identity');
  if (typeof supervisorSession.admit !== 'function' || utilTypes.isProxy(supervisorSession.admit)) {
    invalid('host adapter dependencies.supervisorSession.admit', 'must be a non-Proxy function');
  }
  const noEffectAuthority = exactRecord(
    dependencies.noEffectAuthority,
    ['identity', 'capture', 'classify'],
    [],
    'host adapter dependencies.noEffectAuthority',
  );
  hash(noEffectAuthority.identity, 'host adapter dependencies.noEffectAuthority.identity');
  for (const method of ['capture', 'classify']) {
    if (typeof noEffectAuthority[method] !== 'function' || utilTypes.isProxy(noEffectAuthority[method])) {
      invalid(`host adapter dependencies.noEffectAuthority.${method}`, 'must be a non-Proxy function');
    }
  }
  let runtimeIdentity = DEFAULT_RUNTIME_AUTHORITY;
  let runtimeInvoke = (command, request) => ({
    status: 'returned',
    value: runRecoveryCommand(command, request),
  });
  if (Object.hasOwn(dependencies, 'runtime')) {
    const runtime = exactRecord(dependencies.runtime, ['identity', 'invoke'], [], 'host adapter dependencies.runtime');
    hash(runtime.identity, 'host adapter dependencies.runtime.identity');
    if (typeof runtime.invoke !== 'function' || utilTypes.isProxy(runtime.invoke)) {
      invalid('host adapter dependencies.runtime.invoke', 'must be a non-Proxy function');
    }
    runtimeIdentity = /** @type {string} */ (runtime.identity);
    runtimeInvoke = /** @type {(command:string, request:unknown)=>unknown} */ (runtime.invoke);
  }
  let laneOwner = Object.freeze({
    identity: DEFAULT_LANE_OWNER_AUTHORITY,
    apply: (laneRequest) => applyLightweightWorkRequest(laneRequest),
  });
  if (Object.hasOwn(dependencies, 'laneOwner')) {
    const owner = exactRecord(dependencies.laneOwner, ['identity', 'apply'], [], 'host adapter dependencies.laneOwner');
    hash(owner.identity, 'host adapter dependencies.laneOwner.identity');
    if (typeof owner.apply !== 'function' || utilTypes.isProxy(owner.apply)) {
      invalid('host adapter dependencies.laneOwner.apply', 'must be a non-Proxy function');
    }
    laneOwner = Object.freeze({
      identity: /** @type {string} */ (owner.identity),
      apply: /** @type {(request:unknown)=>unknown} */ (owner.apply),
    });
  }
  let checkpoint = null;
  if (Object.hasOwn(dependencies, 'checkpoint')) {
    const store = exactRecord(
      dependencies.checkpoint,
      ['identity', ...CHECKPOINT_OPERATIONS],
      [],
      'host adapter dependencies.checkpoint',
    );
    hash(store.identity, 'host adapter dependencies.checkpoint.identity');
    for (const operation of CHECKPOINT_OPERATIONS) {
      if (typeof store[operation] !== 'function' || utilTypes.isProxy(store[operation])) {
        invalid(`host adapter dependencies.checkpoint.${operation}`, 'must be a non-Proxy function');
      }
    }
    checkpoint = Object.freeze({
      identity: /** @type {string} */ (store.identity),
      claim: /** @type {Function} */ (store.claim),
      load: /** @type {Function} */ (store.load),
      update: /** @type {Function} */ (store.update),
      handoff: /** @type {Function} */ (store.handoff),
      clear: /** @type {Function} */ (store.clear),
    });
  }
  return Object.freeze({
    supervisorSession: Object.freeze({
      identity: /** @type {string} */ (supervisorSession.identity),
      admit: /** @type {(request:unknown)=>unknown} */ (supervisorSession.admit),
      authority: dependencies.supervisorSession,
    }),
    noEffectAuthority: Object.freeze({
      identity: /** @type {string} */ (noEffectAuthority.identity),
      capture: /** @type {(request:unknown)=>unknown} */ (noEffectAuthority.capture),
      classify: /** @type {(request:unknown)=>unknown} */ (noEffectAuthority.classify),
      authority: dependencies.noEffectAuthority,
    }),
    checkpoint,
    laneOwner,
    runtimeIdentity,
    runtimeInvoke,
  });
}

/** @param {Record<string, unknown>} request @param {unknown} value @param {string} supervisorAuthorityIdentity */
function validateSupervisorAdmission(request, value, supervisorAuthorityIdentity) {
  const admission = exactRecord(detachedData(value, 'host adapter supervisor admission'), [
    'version', 'requestIdentity', 'invocationIdentity', 'workerToken', 'workerGeneration',
    'supervisorAuthorityIdentity', 'admissionIdentity',
  ], [], 'host adapter supervisor admission');
  if (admission.version !== 1) invalid('host adapter supervisor admission.version', 'must be the literal 1');
  hash(admission.requestIdentity, 'host adapter supervisor admission.requestIdentity');
  hash(admission.invocationIdentity, 'host adapter supervisor admission.invocationIdentity');
  hash(admission.workerToken, 'host adapter supervisor admission.workerToken');
  integer(admission.workerGeneration, 'host adapter supervisor admission.workerGeneration', true);
  hash(admission.supervisorAuthorityIdentity, 'host adapter supervisor admission.supervisorAuthorityIdentity');
  hash(admission.admissionIdentity, 'host adapter supervisor admission.admissionIdentity');
  if (admission.requestIdentity !== request.requestIdentity
    || admission.supervisorAuthorityIdentity !== supervisorAuthorityIdentity) {
    invalid('host adapter supervisor admission', 'must bind the exact request and supervisor authority');
  }
  const { admissionIdentity, ...body } = admission;
  if (admissionIdentity !== sha256(canonicalJson({ request, response: body }))) {
    invalid('host adapter supervisor admission.admissionIdentity', 'must bind the complete request and response');
  }
  return admission;
}

/**
 * Admit one worker generation under the supervisor's retained invocation identity.
 * A replacement keeps the same identity, so authority is keyed on the active
 * generation and token rather than on the identity alone.
 * @param {ReturnType<typeof trustedPorts>} ports @param {Record<string, unknown>} provisional
 * @param {'initial'|'replacement'} mode @param {Record<string, unknown>} [priorWorker]
 */
function admitSupervisorSession(ports, provisional, mode = 'initial', priorWorker) {
  const requestBody = {
    version: 1,
    mode,
    target: clone(provisional.target),
    acceptedStateBytes: provisional.acceptedStateBytes,
    acceptedStateHash: provisional.acceptedStateHash,
    acceptedRevision: provisional.acceptedRevision,
    hostRevision: provisional.hostRevision,
    inspectionIdentity: provisional.inspectionIdentity,
    runtimeAuthorityIdentity: ports.runtimeIdentity,
    ...(mode === 'replacement' && priorWorker
      ? {
        invocationIdentity: priorWorker.invocationIdentity,
        priorWorkerToken: priorWorker.workerToken,
        priorWorkerGeneration: priorWorker.workerGeneration,
      }
      : {}),
  };
  const request = freezeData({
    ...requestBody,
    requestIdentity: sha256(canonicalJson(requestBody)),
  });
  const authority = /** @type {object} */ (ports.supervisorSession.authority);
  const authorityIdentity = ports.supervisorSession.identity;
  if (CONSUMED_SUPERVISOR_SESSIONS.has(authority)
    || CONSUMED_SUPERVISOR_IDENTITIES.has(authorityIdentity)) {
    invalid('host adapter supervisorSession', 'must have one unused trusted port identity');
  }
  if (CONSUMED_SUPERVISOR_IDENTITIES.size >= MAX_GRAPH_ENTRIES) {
    invalid('host adapter supervisorSession', `exceeds ${MAX_GRAPH_ENTRIES} consumed identities`);
  }
  CONSUMED_SUPERVISOR_SESSIONS.add(authority);
  CONSUMED_SUPERVISOR_IDENTITIES.add(authorityIdentity);
  let response;
  try {
    response = ports.supervisorSession.admit(request);
  } catch {
    invalid('host adapter supervisor admission', 'must return one closed admission result');
  }
  const admission = validateSupervisorAdmission(request, response, ports.supervisorSession.identity);
  const invocationIdentity = /** @type {string} */ (admission.invocationIdentity);
  const admitted = ADMITTED_INVOCATIONS.get(invocationIdentity);
  if (mode === 'initial') {
    if (admitted) {
      invalid('host adapter supervisor admission.invocationIdentity', 'must not replay a prior admitted invocation identity');
    }
    if (ADMITTED_INVOCATIONS.size >= MAX_GRAPH_ENTRIES) {
      invalid('host adapter supervisor admission.invocationIdentity', `exceeds ${MAX_GRAPH_ENTRIES} consumed identities`);
    }
    registerAdmittedInvocation(admission);
    return admission;
  }
  const prior = /** @type {Record<string, unknown>} */ (priorWorker);
  if (invocationIdentity !== prior.invocationIdentity) {
    invalid('host adapter supervisor admission.invocationIdentity', 'must be the retained supervisor invocation identity');
  }
  if (admission.workerGeneration !== /** @type {number} */ (prior.workerGeneration) + 1
    || admission.workerToken === prior.workerToken) {
    invalid('host adapter supervisor admission', 'must supply one fresh worker token and the next generation');
  }
  if (admitted
    && (admitted.workerGeneration !== prior.workerGeneration || admitted.workerToken !== prior.workerToken)) {
    invalid('host adapter supervisor admission.invocationIdentity', 'must not replay a prior admitted invocation identity outside an authorized handoff');
  }
  // The authorized handoff supersedes the prior entry so the retired generation cannot be replayed.
  registerAdmittedInvocation(admission);
  return admission;
}

/** @param {Record<string, unknown>} admission */
function registerAdmittedInvocation(admission) {
  ADMITTED_INVOCATIONS.set(/** @type {string} */ (admission.invocationIdentity), {
    workerToken: admission.workerToken,
    workerGeneration: admission.workerGeneration,
  });
}

function nowStamp() {
  return new Date().toISOString();
}

/** @param {unknown} value @param {string} label */
function isoTime(value, label) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    invalid(label, 'must be an ISO-8601 UTC timestamp');
  }
}

/** @param {unknown} value @param {string} label */
function validateCheckpointBinding(value, label) {
  const binding = exactRecord(
    detachedData(value, label),
    ['version', 'workspaceIdentity', 'target', 'ownerIdentity'],
    [],
    label,
  );
  if (binding.version !== 1) invalid(`${label}.version`, 'must be the literal 1');
  hash(binding.workspaceIdentity, `${label}.workspaceIdentity`);
  hash(binding.ownerIdentity, `${label}.ownerIdentity`);
  const target = canonicalTarget(validateTarget(binding.target));
  if (canonicalJson(target) !== canonicalJson(binding.target)) invalid(`${label}.target`, 'must be canonical');
  return binding;
}

/** @param {unknown} value @param {string} label */
function validatePrestate(value, label) {
  const prestate = exactRecord(value, ['taskPrestateIdentity', 'lanePrestateIdentity'], [], label);
  hash(prestate.taskPrestateIdentity, `${label}.taskPrestateIdentity`);
  hash(prestate.lanePrestateIdentity, `${label}.lanePrestateIdentity`);
  return prestate;
}

/** @param {unknown} value @param {string} label */
function validateWorker(value, label) {
  const worker = exactRecord(value, ['workerToken', 'workerGeneration'], [], label);
  hash(worker.workerToken, `${label}.workerToken`);
  integer(worker.workerGeneration, `${label}.workerGeneration`, true);
  return worker;
}

/**
 * The per-target key is derived from canonical workspace and target identities only,
 * so no caller text can choose a storage path.
 * @param {Record<string, unknown>} binding
 */
function checkpointKeyOf(binding) {
  return sha256(canonicalJson({
    version: 1,
    workspaceIdentity: binding.workspaceIdentity,
    target: clone(binding.target),
  }));
}

/** @param {unknown} value @param {string} label */
function validateHostCheckpointRecord(value, label) {
  const checkpoint = exactRecord(detachedData(value, label), [
    'version', 'checkpointKey', 'invocationIdentity', 'workspaceIdentity', 'target', 'ownerIdentity',
    'lane', 'acceptedStateBytes', 'acceptedStateHash', 'taskPrestateIdentity', 'lanePrestateIdentity',
    'workerToken', 'workerGeneration', 'acceptedRevision', 'hostRevision', 'inFlight',
    'inspectionIdentity', 'correction', 'createdAt', 'updatedAt', 'recordHash',
  ], [], label);
  if (checkpoint.version !== 1) invalid(`${label}.version`, 'must be the literal 1');
  for (const field of [
    'checkpointKey', 'invocationIdentity', 'workspaceIdentity', 'ownerIdentity', 'acceptedStateHash',
    'taskPrestateIdentity', 'lanePrestateIdentity', 'workerToken', 'inspectionIdentity', 'recordHash',
  ]) {
    hash(checkpoint[field], `${label}.${field}`);
  }
  const target = canonicalTarget(validateTarget(checkpoint.target));
  if (canonicalJson(target) !== canonicalJson(checkpoint.target)) invalid(`${label}.target`, 'must be canonical');
  if (checkpoint.lane !== /** @type {Record<string, unknown>} */ (target).lane) {
    invalid(`${label}.lane`, 'must be the canonical target lane');
  }
  if (checkpoint.checkpointKey !== checkpointKeyOf(checkpoint)) {
    invalid(`${label}.checkpointKey`, 'must bind the canonical workspace and target');
  }
  if (typeof checkpoint.acceptedStateBytes !== 'string'
    || Buffer.byteLength(checkpoint.acceptedStateBytes) > MAX_CHECKPOINT_BYTES) {
    invalid(`${label}.acceptedStateBytes`, `must be at most ${MAX_CHECKPOINT_BYTES} UTF-8 bytes`);
  }
  let state;
  try {
    state = validateRunState(JSON.parse(/** @type {string} */ (checkpoint.acceptedStateBytes)));
  } catch {
    invalid(`${label}.acceptedStateBytes`, 'must bind canonical validated RunState bytes');
  }
  if (canonicalJson(state) !== checkpoint.acceptedStateBytes
    || sha256(/** @type {string} */ (checkpoint.acceptedStateBytes)) !== checkpoint.acceptedStateHash) {
    invalid(`${label}.acceptedStateBytes`, 'must bind canonical validated RunState bytes');
  }
  integer(checkpoint.workerGeneration, `${label}.workerGeneration`, true);
  integer(checkpoint.acceptedRevision, `${label}.acceptedRevision`);
  integer(checkpoint.hostRevision, `${label}.hostRevision`);
  if (checkpoint.inFlight !== null) {
    const inFlight = exactRecord(
      checkpoint.inFlight,
      ['semanticOperation', 'expectedEffectIdentity', 'expectedReceiptIdentity', 'provisionalStateHash'],
      [],
      `${label}.inFlight`,
    );
    enumeration(inFlight.semanticOperation, OPERATIONS, `${label}.inFlight.semanticOperation`);
    const paired = [inFlight.expectedEffectIdentity, inFlight.provisionalStateHash];
    if (paired.every((entry) => entry !== null)) {
      hash(inFlight.expectedEffectIdentity, `${label}.inFlight.expectedEffectIdentity`);
      hash(inFlight.provisionalStateHash, `${label}.inFlight.provisionalStateHash`);
      // A null receipt expectation is retained verbatim so an underivable effect resumes as unverifiable.
      if (inFlight.expectedReceiptIdentity !== null) {
        hash(inFlight.expectedReceiptIdentity, `${label}.inFlight.expectedReceiptIdentity`);
      }
    } else if (paired.some((entry) => entry !== null) || inFlight.expectedReceiptIdentity !== null) {
      invalid(`${label}.inFlight`, 'must bind both or neither effect descriptor');
    }
  }
  if (checkpoint.correction !== null) {
    const correction = exactRecord(checkpoint.correction, [
      'identity', 'consumed', 'semanticOperation', 'incidentClass', 'originHostRevision', 'workerGeneration',
    ], [], `${label}.correction`);
    hash(correction.identity, `${label}.correction.identity`);
    if (typeof correction.consumed !== 'boolean') invalid(`${label}.correction.consumed`, 'must be a boolean');
    enumeration(correction.semanticOperation, CORRECTABLE_OPERATIONS, `${label}.correction.semanticOperation`);
    enumeration(correction.incidentClass, INCIDENT_CLASSES, `${label}.correction.incidentClass`);
    integer(correction.originHostRevision, `${label}.correction.originHostRevision`);
    integer(correction.workerGeneration, `${label}.correction.workerGeneration`, true);
  }
  isoTime(checkpoint.createdAt, `${label}.createdAt`);
  isoTime(checkpoint.updatedAt, `${label}.updatedAt`);
  const { recordHash, ...body } = checkpoint;
  if (recordHash !== sha256(canonicalJson(body))) invalid(`${label}.recordHash`, 'must bind the complete record');
  if (Buffer.byteLength(canonicalJson(checkpoint)) > MAX_CHECKPOINT_BYTES) {
    invalid(label, `must be at most ${MAX_CHECKPOINT_BYTES} canonical UTF-8 bytes`);
  }
  return checkpoint;
}

/** @param {Record<string, unknown>} binding @param {Record<string, unknown>} prestate @param {Record<string, unknown>} session @param {unknown} inFlight @param {string} createdAt */
function buildCheckpointRecord(binding, prestate, session, inFlight, createdAt) {
  const correction = /** @type {Record<string, unknown>|null} */ (session.correction);
  const body = {
    version: 1,
    checkpointKey: checkpointKeyOf(binding),
    invocationIdentity: session.invocationIdentity,
    workspaceIdentity: binding.workspaceIdentity,
    target: clone(binding.target),
    ownerIdentity: binding.ownerIdentity,
    lane: /** @type {Record<string, unknown>} */ (binding.target).lane,
    acceptedStateBytes: session.acceptedStateBytes,
    acceptedStateHash: session.acceptedStateHash,
    taskPrestateIdentity: prestate.taskPrestateIdentity,
    lanePrestateIdentity: prestate.lanePrestateIdentity,
    workerToken: session.workerToken,
    workerGeneration: session.workerGeneration,
    acceptedRevision: session.acceptedRevision,
    hostRevision: session.hostRevision,
    inFlight: inFlight === null ? null : clone(inFlight),
    inspectionIdentity: session.inspectionIdentity,
    correction: correction === null ? null : {
      identity: correction.identity,
      consumed: correction.consumed,
      semanticOperation: correction.semanticOperation,
      incidentClass: correction.incidentClass,
      originHostRevision: correction.originHostRevision,
      workerGeneration: correction.workerGeneration,
    },
    createdAt,
    updatedAt: nowStamp(),
  };
  return { ...body, recordHash: sha256(canonicalJson(body)) };
}

/** @param {Record<string, unknown>} checkpoint */
function restoredCorrection(checkpoint) {
  if (checkpoint.correction === null) return null;
  const stored = /** @type {Record<string, unknown>} */ (checkpoint.correction);
  const body = {
    version: 1,
    acceptedStateBytes: checkpoint.acceptedStateBytes,
    acceptedStateHash: checkpoint.acceptedStateHash,
    acceptedRevision: checkpoint.acceptedRevision,
    semanticOperation: stored.semanticOperation,
    incidentClass: stored.incidentClass,
    inspectionIdentity: checkpoint.inspectionIdentity,
    originHostRevision: stored.originHostRevision,
    workerGeneration: stored.workerGeneration,
    consumed: stored.consumed,
  };
  const identity = sha256(canonicalJson(body));
  if (identity !== stored.identity) invalid('checkpoint record.correction.identity', 'must bind the exact carried correction');
  return { ...body, identity };
}

/** @param {unknown} value @param {string} label */
function validateCheckpointDiagnostic(value, label) {
  const diagnostic = exactRecord(value, [
    'version', 'checkpointKey', 'claimPresent', 'checkpointPresent', 'createdAt', 'updatedAt', 'detail',
  ], [], label);
  if (diagnostic.version !== 1) invalid(`${label}.version`, 'must be the literal 1');
  hash(diagnostic.checkpointKey, `${label}.checkpointKey`);
  for (const field of ['claimPresent', 'checkpointPresent']) {
    if (typeof diagnostic[field] !== 'boolean') invalid(`${label}.${field}`, 'must be a boolean');
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (diagnostic[field] !== null) isoTime(diagnostic[field], `${label}.${field}`);
  }
  text(diagnostic.detail, `${label}.detail`);
  return diagnostic;
}

/** @param {unknown} value @param {string} operation @param {string} checkpointKey */
function validateCheckpointResult(value, operation, checkpointKey) {
  const label = `checkpoint store ${operation} result`;
  const safe = detachedData(value, label);
  const candidate = record(safe, label);
  enumeration(candidate.status, CHECKPOINT_STATUSES[operation], `${label}.status`);
  const status = /** @type {string} */ (candidate.status);
  const extra = CHECKPOINT_RECORD_STATUSES.has(status)
    ? ['record']
    : status === 'failed'
      ? ['reason']
      : status === 'cleared'
        ? []
        : ['diagnostic'];
  const result = exactRecord(safe, ['version', 'status', 'checkpointKey', ...extra], [], label);
  if (result.version !== 1) invalid(`${label}.version`, 'must be the literal 1');
  hash(result.checkpointKey, `${label}.checkpointKey`);
  if (result.checkpointKey !== checkpointKey) {
    invalid(`${label}.checkpointKey`, 'must bind the derived workspace-target key');
  }
  if (extra[0] === 'record') validateHostCheckpointRecord(result.record, `${label}.record`);
  if (extra[0] === 'reason') text(result.reason, `${label}.reason`);
  if (extra[0] === 'diagnostic') validateCheckpointDiagnostic(result.diagnostic, `${label}.diagnostic`);
  return result;
}

/** @param {string} checkpointKey @param {unknown} diagnostic @param {string} detail */
function ownershipDiagnostic(checkpointKey, diagnostic, detail) {
  const observed = diagnostic === undefined || diagnostic === null
    ? null
    : /** @type {Record<string, unknown>} */ (diagnostic);
  return freezeData({
    version: 1,
    checkpointKey,
    artifacts: ['ownership-claim', 'checkpoint'],
    claimPresent: observed === null ? null : observed.claimPresent,
    checkpointPresent: observed === null ? null : observed.checkpointPresent,
    createdAt: observed === null ? null : observed.createdAt,
    updatedAt: observed === null ? null : observed.updatedAt,
    detail: observed === null ? detail : observed.detail,
    reason: detail,
    ageIsDiagnosticOnly: true,
    nextAction: 'manual-cleanup-of-this-bounded-pair-after-confirmed-no-invocation',
  });
}

/** @param {Record<string, unknown>} session */
function activeWorker(session) {
  return {
    invocationIdentity: session.invocationIdentity,
    workerToken: session.workerToken,
    workerGeneration: session.workerGeneration,
  };
}

/**
 * The receipt an establishing party must present, derived from the pending effect's own externally
 * observable identity. An underivable kind yields null so resume can only treat it as unverifiable.
 * @param {Record<string, unknown>|null} pending
 */
function receiptExpectation(pending) {
  if (pending === null) return null;
  let derived = null;
  if (pending.kind === 'completion-retention') {
    const provisional = /** @type {Record<string, unknown>} */ (pending.provisionalState);
    const completion = /** @type {Record<string, unknown>|null|undefined} */ (provisional.pendingCompletion);
    derived = completion === undefined || completion === null ? null : completion.resultIdentity;
  } else if (pending.kind === 'projection') {
    derived = /** @type {Record<string, unknown>} */ (pending.projectionBatch).batchIdentity;
  }
  return typeof derived === 'string' && HASH_PATTERN.test(derived) ? derived : null;
}

/** @param {Record<string, unknown>} target @param {string} subjectRunStateHash @param {Record<string, unknown>} permit */
function permitApplicationExpectation(target, subjectRunStateHash, permit) {
  const projection = permit.kind === 'lane-projection';
  const projectionBinding = projection ? {
    targetMappingHash: permit.targetMappingHash,
    lanePrestateHash: permit.lanePrestateHash,
    batchIdentity: permit.batchIdentity,
  } : {};
  return {
    expectedEffectIdentity: sha256(canonicalJson({
      version: 1,
      kind: 'lane-application',
      semanticOperation: 'apply-lane-effect',
      target: clone(target),
      subjectRunStateHash,
      permitHash: permit.permitHash,
      mutationIdentity: permit.mutationIdentity,
      ...projectionBinding,
    })),
    expectedReceiptIdentity: sha256(canonicalJson({
      version: 1,
      kind: 'lane-application-receipt',
      lane: 'lightweight',
      target: clone(target),
      permitHash: permit.permitHash,
      mutationIdentity: permit.mutationIdentity,
      targetMappingHash: permit.targetMappingHash,
      lanePrestateHash: permit.lanePrestateHash,
      ...(projection ? { batchIdentity: permit.batchIdentity } : {}),
    })),
  };
}

/**
 * The lane apply route is the only operation that drives an authoritative external mutator, so its
 * expectation is bound to the exact permit the lane owner will be handed. Projection permits act on
 * the pending provisional state and additionally bind the pending batch.
 * @param {Record<string, unknown>} session @param {Record<string, unknown>} request
 */
function laneApplicationExpectation(session, request) {
  const pending = /** @type {Record<string, unknown>|null} */ (session.pendingEffect);
  let permit;
  let application;
  try {
    application = record(request.laneApplication, 'HostAdapterRequest.laneApplication');
    permit = laneEffectPermit(application.permit, 'HostAdapterRequest.laneApplication.permit');
  } catch {
    return null;
  }
  const projection = permit.kind === 'lane-projection';
  if (projection && (pending === null
    || permit.subjectRunStateHash !== pending.provisionalStateHash
    || permit.batchIdentity !== /** @type {Record<string, unknown>} */ (pending.projectionBatch).batchIdentity)) {
    return null;
  }
  if (!projection && pending !== null) return null;
  const subjectRunStateHash = projection
    ? /** @type {string} */ (pending.provisionalStateHash)
    : /** @type {string} */ (session.acceptedStateHash);
  if (permit.subjectRunStateHash !== subjectRunStateHash
    || permit.mutationIdentity !== sha256(canonicalJson(application.mutation))) return null;
  return {
    ...permitApplicationExpectation(
      /** @type {Record<string, unknown>} */ (session.target),
      subjectRunStateHash,
      permit,
    ),
    provisionalStateHash: projection
      ? /** @type {string} */ (pending.provisionalStateHash)
      : /** @type {string} */ (session.acceptedStateHash),
  };
}

/** @param {Record<string, unknown>} session @param {string} [operation] @param {Record<string, unknown>} [request] */
function inFlightDescriptor(session, operation, request) {
  const pending = /** @type {Record<string, unknown>|null} */ (session.pendingEffect);
  if (operation === undefined) {
    return pending === null ? null : {
      semanticOperation: pending.semanticOperation,
      expectedEffectIdentity: pending.effectIdentity,
      expectedReceiptIdentity: receiptExpectation(pending),
      provisionalStateHash: pending.provisionalStateHash,
    };
  }
  if (operation === 'apply-lane-effect' && request !== undefined) {
    const laneApplication = laneApplicationExpectation(session, request);
    return laneApplication === null
      ? {
        semanticOperation: operation,
        expectedEffectIdentity: null,
        expectedReceiptIdentity: null,
        provisionalStateHash: null,
      }
      : { semanticOperation: operation, ...laneApplication };
  }
  return {
    semanticOperation: operation,
    expectedEffectIdentity: pending === null ? null : pending.effectIdentity,
    expectedReceiptIdentity: receiptExpectation(pending),
    provisionalStateHash: pending === null ? null : pending.provisionalStateHash,
  };
}

/**
 * Serialize host authority beneath the exclusive ownership claim.
 * @param {NonNullable<ReturnType<typeof trustedPorts>['checkpoint']>} store
 * @param {Record<string, unknown>} binding @param {Record<string, unknown>} prestate
 * @param {string} createdAt @param {Record<string, unknown>} claimed
 */
function createCheckpointHost(store, binding, prestate, createdAt, claimed) {
  const checkpointKey = checkpointKeyOf(binding);
  let last = claimed;
  let projectionApplication = null;
  const host = {
    checkpointKey,
    /** @param {Record<string, unknown>} session */
    verify(session) {
      let loaded;
      try {
        loaded = validateCheckpointResult(store.load(binding), 'load', checkpointKey);
      } catch {
        return 'checkpoint-corrupt';
      }
      if (loaded.status === 'absent') return 'checkpoint-absent';
      if (loaded.status === 'corrupt') return 'checkpoint-corrupt';
      if (loaded.status === 'failed') return 'checkpoint-load-failed';
      const current = /** @type {Record<string, unknown>} */ (loaded.record);
      if (current.recordHash !== last.recordHash) return 'checkpoint-drift';
      if (current.invocationIdentity !== session.invocationIdentity
        || current.workerToken !== session.workerToken
        || current.workerGeneration !== session.workerGeneration) return 'stale-worker';
      // Host metadata may legitimately be ahead in memory before commit; accepted authority may not.
      if (current.acceptedStateHash !== session.acceptedStateHash
        || current.acceptedRevision !== session.acceptedRevision) return 'checkpoint-revision-conflict';
      return null;
    },
    /** @param {Record<string, unknown>} session @param {unknown} inFlight */
    commit(session, inFlight) {
      const next = buildCheckpointRecord(binding, prestate, session, inFlight, createdAt);
      let updated;
      try {
        updated = validateCheckpointResult(
          store.update(
            binding,
            activeWorker(session),
            { acceptedRevision: last.acceptedRevision, hostRevision: last.hostRevision },
            next,
          ),
          'update',
          checkpointKey,
        );
      } catch {
        return 'checkpoint-update-failed';
      }
      if (updated.status === 'stale') return 'checkpoint-revision-conflict';
      if (updated.status === 'failed') return 'checkpoint-update-failed';
      const written = /** @type {Record<string, unknown>} */ (updated.record);
      if (written.recordHash !== next.recordHash) return 'checkpoint-update-failed';
      last = written;
      return null;
    },
    /** @param {Record<string, unknown>} session @param {string} operation @param {Record<string, unknown>} [request] */
    beginOperation(session, operation, request) {
      const drift = host.verify(session);
      if (drift) return { reason: drift };
      const advanced = /** @type {Record<string, unknown>} */ (advanceHost(session));
      const descriptor = inFlightDescriptor(advanced, operation, request);
      const pending = /** @type {Record<string, unknown>|null} */ (advanced.pendingEffect);
      if (operation === 'apply-lane-effect' && pending !== null
        && descriptor.expectedEffectIdentity !== null) {
        projectionApplication = clone(descriptor);
      }
      const failure = host.commit(
        advanced,
        pending !== null && projectionApplication !== null
          ? projectionApplication
          : descriptor,
      );
      return failure ? { reason: failure } : { session: advanced };
    },
    /** @param {Record<string, unknown>} session */
    settle(session) {
      const pending = /** @type {Record<string, unknown>|null} */ (session.pendingEffect);
      const descriptor = pending !== null && projectionApplication !== null
        ? projectionApplication
        : inFlightDescriptor(session);
      if (pending === null) projectionApplication = null;
      return /** @type {number} */ (session.hostRevision) <= /** @type {number} */ (last.hostRevision)
        ? null
        : host.commit(session, descriptor);
    },
    /** @param {Record<string, unknown>} session @param {string} reason */
    clear(session, reason) {
      let cleared;
      try {
        cleared = validateCheckpointResult(
          store.clear(binding, activeWorker(session), last.hostRevision, reason),
          'clear',
          checkpointKey,
        );
      } catch {
        return 'checkpoint-cleanup-failed';
      }
      return cleared.status === 'cleared' ? null : 'checkpoint-cleanup-failed';
    },
  };
  return host;
}

/**
 * Dependency-free default backend: one bounded ownership claim and one bounded
 * checkpoint per hashed workspace-target key beneath a canonical OS temporary root.
 * Age is diagnostic only; nothing here expires, steals, or takes over ownership.
 * @param {unknown} [optionsValue]
 */
export function createTemporaryCheckpointStore(optionsValue) {
  const options = exactRecord(
    optionsValue === undefined ? {} : detachedData(optionsValue, 'checkpoint store options'),
    [],
    ['root', 'identity'],
    'checkpoint store options',
  );
  if (Object.hasOwn(options, 'identity')) hash(options.identity, 'checkpoint store options.identity');
  if (Object.hasOwn(options, 'root')) text(options.root, 'checkpoint store options.root');
  const identity = Object.hasOwn(options, 'identity')
    ? /** @type {string} */ (options.identity)
    : sha256('dude-work/host-adapter:temporary-checkpoint-store:v1');
  let trustedRoot = null;

  function resolveRoot() {
    if (trustedRoot !== null) return trustedRoot;
    const base = fs.realpathSync(Object.hasOwn(options, 'root') ? /** @type {string} */ (options.root) : os.tmpdir());
    const root = path.join(base, CHECKPOINT_DIRECTORY);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
      // Windows relies on inherited ACLs; no POSIX mode or ownership claim is made there.
      fs.chmodSync(root, 0o700);
    }
    const stats = fs.lstatSync(root);
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error('checkpoint-root-not-a-directory');
    if (fs.realpathSync(root) !== root) throw new Error('checkpoint-root-not-canonical');
    trustedRoot = root;
    return root;
  }

  /** @param {string} key */
  function artifactPaths(key) {
    if (!HASH_PATTERN.test(key)) throw new Error('checkpoint-key-not-hashed');
    const root = resolveRoot();
    const claimPath = path.join(root, `${key}.claim`);
    const checkpointPath = path.join(root, `${key}.checkpoint`);
    for (const candidate of [claimPath, checkpointPath]) {
      if (path.dirname(candidate) !== root || !candidate.startsWith(root + path.sep)) {
        throw new Error('checkpoint-path-not-contained');
      }
    }
    return { root, claimPath, checkpointPath };
  }

  /** @param {string} target */
  function probeFile(target) {
    let stats;
    try {
      stats = fs.lstatSync(target);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { present: false, size: 0 };
      throw error;
    }
    if (stats.isSymbolicLink()) throw new Error('checkpoint-artifact-is-a-symlink');
    if (!stats.isFile()) throw new Error('checkpoint-artifact-is-not-a-regular-file');
    return { present: true, size: stats.size };
  }

  /** @param {string} target */
  function readBounded(target) {
    const probe = probeFile(target);
    if (!probe.present) return null;
    if (probe.size > MAX_CHECKPOINT_BYTES) throw new Error('checkpoint-artifact-too-large');
    const bytes = fs.readFileSync(target);
    if (bytes.byteLength > MAX_CHECKPOINT_BYTES) throw new Error('checkpoint-artifact-too-large');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  }

  /** @param {string} root */
  function syncDirectory(root) {
    // Directory synchronization is platform-dependent and is never claimed as a guarantee.
    let handle;
    try {
      handle = fs.openSync(root, 'r');
      fs.fsyncSync(handle);
    } catch {
      // Platforms that cannot open or sync a directory handle simply skip this step.
    } finally {
      if (handle !== undefined) {
        try {
          fs.closeSync(handle);
        } catch {
          handle = undefined;
        }
      }
    }
  }

  /** @param {string} root @param {string} key @param {string} target @param {unknown} body @param {boolean} exclusive */
  function writeArtifact(root, key, target, body, exclusive) {
    const serialized = canonicalJson(body);
    if (Buffer.byteLength(serialized) > MAX_CHECKPOINT_BYTES) throw new Error('checkpoint-record-too-large');
    if (exclusive) {
      const handle = fs.openSync(target, 'wx', 0o600);
      try {
        fs.writeFileSync(handle, serialized, { encoding: 'utf8' });
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      syncDirectory(root);
      return;
    }
    const temporary = path.join(root, `${key}.${randomBytes(12).toString('hex')}.tmp`);
    const handle = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(handle, serialized, { encoding: 'utf8' });
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        throw new Error('checkpoint-temporary-cleanup-failed');
      }
      throw error;
    }
    if (probeFile(temporary).present) {
      try {
        fs.rmSync(temporary);
      } catch {
        throw new Error('checkpoint-temporary-cleanup-failed');
      }
    }
    syncDirectory(root);
  }

  /** @param {Record<string, unknown>} checkpoint */
  function claimBody(checkpoint) {
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

  /** @param {string} serialized */
  function parseClaim(serialized) {
    const parsed = JSON.parse(serialized);
    const claim = exactRecord(detachedData(parsed, 'checkpoint claim'), [
      'version', 'checkpointKey', 'invocationIdentity', 'workerToken', 'workerGeneration',
      'createdAt', 'claimHash',
    ], [], 'checkpoint claim');
    if (claim.version !== 1) invalid('checkpoint claim.version', 'must be the literal 1');
    for (const field of ['checkpointKey', 'invocationIdentity', 'workerToken', 'claimHash']) {
      hash(claim[field], `checkpoint claim.${field}`);
    }
    integer(claim.workerGeneration, 'checkpoint claim.workerGeneration', true);
    isoTime(claim.createdAt, 'checkpoint claim.createdAt');
    const { claimHash, ...body } = claim;
    if (claimHash !== sha256(canonicalJson(body))) invalid('checkpoint claim.claimHash', 'must bind the complete claim');
    if (canonicalJson(claim) !== serialized) invalid('checkpoint claim', 'must be canonical bytes without trailing data');
    return claim;
  }

  /** @param {string} serialized */
  function parseCheckpoint(serialized) {
    const parsed = JSON.parse(serialized);
    const checkpoint = validateHostCheckpointRecord(parsed, 'checkpoint record');
    if (canonicalJson(checkpoint) !== serialized) {
      invalid('checkpoint record', 'must be canonical bytes without trailing data');
    }
    return checkpoint;
  }

  /** @param {string} key @param {boolean} claimPresent @param {boolean} checkpointPresent @param {Record<string, unknown>|null} claim @param {Record<string, unknown>|null} checkpoint @param {string} detail */
  function diagnostic(key, claimPresent, checkpointPresent, claim, checkpoint, detail) {
    return {
      version: 1,
      checkpointKey: key,
      claimPresent,
      checkpointPresent,
      createdAt: checkpoint?.createdAt ?? claim?.createdAt ?? null,
      updatedAt: checkpoint?.updatedAt ?? null,
      detail,
    };
  }

  /** @param {string} key @param {unknown} error */
  function failure(key, error) {
    const reason = error instanceof Error && error.message.length > 0 && error.message.length <= 200
      ? error.message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      : 'checkpoint-operation-failed';
    return { version: 1, status: 'failed', checkpointKey: key, reason };
  }

  /** @param {unknown} error */
  function isStorageFault(error) {
    return Boolean(error && typeof error === 'object' && 'syscall' in /** @type {object} */ (error));
  }

  /** @param {string} key */
  function readPair(key) {
    const { claimPath, checkpointPath } = artifactPaths(key);
    const claimBytes = readBounded(claimPath);
    const checkpointBytes = readBounded(checkpointPath);
    return {
      claim: claimBytes === null ? null : parseClaim(claimBytes),
      checkpoint: checkpointBytes === null ? null : parseCheckpoint(checkpointBytes),
      claimPresent: claimBytes !== null,
      checkpointPresent: checkpointBytes !== null,
    };
  }

  /** @param {unknown} bindingValue @param {string} label */
  function derivedKey(bindingValue, label) {
    return checkpointKeyOf(validateCheckpointBinding(bindingValue, label));
  }

  /** @param {string} key @param {Record<string, unknown>} pair @param {Record<string, unknown>} worker @param {Record<string, unknown>} expected */
  function ownershipFailure(key, pair, worker, expected) {
    if (!pair.claimPresent || !pair.checkpointPresent) {
      return {
        version: 1,
        status: 'stale',
        checkpointKey: key,
        diagnostic: diagnostic(
          key,
          /** @type {boolean} */ (pair.claimPresent),
          /** @type {boolean} */ (pair.checkpointPresent),
          /** @type {Record<string, unknown>|null} */ (pair.claim),
          /** @type {Record<string, unknown>|null} */ (pair.checkpoint),
          pair.claimPresent || pair.checkpointPresent ? 'partial-artifacts' : 'artifacts-absent',
        ),
      };
    }
    const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
    const claim = /** @type {Record<string, unknown>} */ (pair.claim);
    if (current.invocationIdentity !== worker.invocationIdentity
      || claim.invocationIdentity !== worker.invocationIdentity
      || current.workerToken !== worker.workerToken
      || current.workerGeneration !== worker.workerGeneration) {
      return {
        version: 1,
        status: 'stale',
        checkpointKey: key,
        diagnostic: diagnostic(key, true, true, claim, current, 'worker-not-active'),
      };
    }
    if (current.acceptedRevision !== expected.acceptedRevision
      || current.hostRevision !== expected.hostRevision) {
      return {
        version: 1,
        status: 'stale',
        checkpointKey: key,
        diagnostic: diagnostic(key, true, true, claim, current, 'revision-mismatch'),
      };
    }
    return null;
  }

  return Object.freeze({
    identity,
    claim(bindingValue, initialCheckpoint) {
      let key = null;
      try {
        key = derivedKey(bindingValue, 'checkpoint store claim binding');
        const next = validateHostCheckpointRecord(initialCheckpoint, 'checkpoint store claim record');
        if (next.checkpointKey !== key) invalid('checkpoint store claim record', 'must bind the derived key');
        const { root, claimPath, checkpointPath } = artifactPaths(key);
        // Post-clean preflight: both controlled artifacts must be absent before a fresh claim.
        const claimProbe = probeFile(claimPath);
        const checkpointProbe = probeFile(checkpointPath);
        if (claimProbe.present || checkpointProbe.present) {
          const pair = readPair(key);
          return {
            version: 1,
            status: 'occupied',
            checkpointKey: key,
            diagnostic: diagnostic(
              key,
              claimProbe.present,
              checkpointProbe.present,
              /** @type {Record<string, unknown>|null} */ (pair.claim),
              /** @type {Record<string, unknown>|null} */ (pair.checkpoint),
              claimProbe.present && checkpointProbe.present ? 'ownership-claim-active' : 'partial-artifacts',
            ),
          };
        }
        writeArtifact(root, key, claimPath, claimBody(next), true);
        try {
          writeArtifact(root, key, checkpointPath, next, true);
        } catch (error) {
          try {
            fs.rmSync(claimPath, { force: true });
          } catch {
            return failure(key, new Error('checkpoint-claim-cleanup-failed'));
          }
          throw error;
        }
        return { version: 1, status: 'claimed', checkpointKey: key, record: next };
      } catch (error) {
        return failure(key === null ? sha256('checkpoint-key-underivable') : key, error);
      }
    },
    load(bindingValue) {
      let key = null;
      try {
        key = derivedKey(bindingValue, 'checkpoint store load binding');
        const pair = readPair(key);
        if (!pair.claimPresent && !pair.checkpointPresent) {
          return {
            version: 1,
            status: 'absent',
            checkpointKey: key,
            diagnostic: diagnostic(key, false, false, null, null, 'artifacts-absent'),
          };
        }
        if (!pair.claimPresent || !pair.checkpointPresent) {
          return {
            version: 1,
            status: 'corrupt',
            checkpointKey: key,
            diagnostic: diagnostic(
              key,
              pair.claimPresent,
              pair.checkpointPresent,
              /** @type {Record<string, unknown>|null} */ (pair.claim),
              /** @type {Record<string, unknown>|null} */ (pair.checkpoint),
              'partial-artifacts',
            ),
          };
        }
        const claim = /** @type {Record<string, unknown>} */ (pair.claim);
        const checkpoint = /** @type {Record<string, unknown>} */ (pair.checkpoint);
        if (claim.checkpointKey !== key || checkpoint.checkpointKey !== key) {
          return {
            version: 1,
            status: 'corrupt',
            checkpointKey: key,
            diagnostic: diagnostic(key, true, true, claim, checkpoint, 'artifact-key-mismatch'),
          };
        }
        return { version: 1, status: 'loaded', checkpointKey: key, record: checkpoint };
      } catch (error) {
        const safeKey = key === null ? sha256('checkpoint-key-underivable') : key;
        if (key !== null && !isStorageFault(error)) {
          return {
            version: 1,
            status: 'corrupt',
            checkpointKey: key,
            diagnostic: diagnostic(key, true, true, null, null, 'record-unreadable'),
          };
        }
        return failure(safeKey, error);
      }
    },
    update(bindingValue, worker, expected, nextCheckpoint) {
      let key = null;
      try {
        key = derivedKey(bindingValue, 'checkpoint store update binding');
        const active = exactRecord(
          worker,
          ['invocationIdentity', 'workerToken', 'workerGeneration'],
          [],
          'checkpoint store update worker',
        );
        hash(active.invocationIdentity, 'checkpoint store update worker.invocationIdentity');
        hash(active.workerToken, 'checkpoint store update worker.workerToken');
        integer(active.workerGeneration, 'checkpoint store update worker.workerGeneration', true);
        const revisions = exactRecord(expected, ['acceptedRevision', 'hostRevision'], [], 'checkpoint store update revisions');
        const next = validateHostCheckpointRecord(nextCheckpoint, 'checkpoint store update record');
        const pair = readPair(key);
        const stale = ownershipFailure(key, pair, /** @type {Record<string, unknown>} */ (worker), revisions);
        if (stale) return stale;
        const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
        if (next.checkpointKey !== key
          || next.invocationIdentity !== active.invocationIdentity
          || next.workerToken !== active.workerToken
          || next.workerGeneration !== active.workerGeneration
          || /** @type {number} */ (next.hostRevision) <= /** @type {number} */ (current.hostRevision)
          || /** @type {number} */ (next.acceptedRevision) < /** @type {number} */ (current.acceptedRevision)) {
          invalid('checkpoint store update record', 'must advance host authority under the active worker');
        }
        const { root, checkpointPath } = artifactPaths(key);
        writeArtifact(root, key, checkpointPath, next, false);
        return { version: 1, status: 'updated', checkpointKey: key, record: next };
      } catch (error) {
        return failure(key === null ? sha256('checkpoint-key-underivable') : key, error);
      }
    },
    handoff(bindingValue, priorWorker, replacementWorker, expected, nextCheckpoint) {
      let key = null;
      try {
        key = derivedKey(bindingValue, 'checkpoint store handoff binding');
        const prior = validateWorker(priorWorker, 'checkpoint store handoff prior worker');
        const replacement = validateWorker(replacementWorker, 'checkpoint store handoff replacement worker');
        const revisions = exactRecord(expected, ['acceptedRevision', 'hostRevision'], [], 'checkpoint store handoff revisions');
        const next = validateHostCheckpointRecord(nextCheckpoint, 'checkpoint store handoff record');
        const pair = readPair(key);
        const stale = ownershipFailure(key, pair, {
          invocationIdentity: next.invocationIdentity,
          workerToken: prior.workerToken,
          workerGeneration: prior.workerGeneration,
        }, revisions);
        if (stale) return stale;
        const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
        if (replacement.workerGeneration !== /** @type {number} */ (prior.workerGeneration) + 1
          || replacement.workerToken === prior.workerToken) {
          invalid('checkpoint store handoff replacement worker', 'must be one fresh token at the next generation');
        }
        if (next.checkpointKey !== key
          || next.invocationIdentity !== current.invocationIdentity
          || next.workerToken !== replacement.workerToken
          || next.workerGeneration !== replacement.workerGeneration
          || /** @type {number} */ (next.hostRevision) <= /** @type {number} */ (current.hostRevision)
          || /** @type {number} */ (next.acceptedRevision) < /** @type {number} */ (current.acceptedRevision)) {
          invalid('checkpoint store handoff record', 'must bind the replacement worker and advance host revision');
        }
        const { root, checkpointPath } = artifactPaths(key);
        writeArtifact(root, key, checkpointPath, next, false);
        return { version: 1, status: 'handed-off', checkpointKey: key, record: next };
      } catch (error) {
        return failure(key === null ? sha256('checkpoint-key-underivable') : key, error);
      }
    },
    clear(bindingValue, worker, expectedHostRevision, reason) {
      let key = null;
      try {
        key = derivedKey(bindingValue, 'checkpoint store clear binding');
        exactRecord(worker, ['invocationIdentity', 'workerToken', 'workerGeneration'], [], 'checkpoint store clear worker');
        integer(expectedHostRevision, 'checkpoint store clear expectedHostRevision');
        text(reason, 'checkpoint store clear reason');
        const { claimPath, checkpointPath } = artifactPaths(key);
        const pair = readPair(key);
        if (pair.checkpointPresent) {
          const current = /** @type {Record<string, unknown>} */ (pair.checkpoint);
          if (current.invocationIdentity !== /** @type {Record<string, unknown>} */ (worker).invocationIdentity
            || current.workerToken !== /** @type {Record<string, unknown>} */ (worker).workerToken
            || current.workerGeneration !== /** @type {Record<string, unknown>} */ (worker).workerGeneration
            || current.hostRevision !== expectedHostRevision) {
            invalid('checkpoint store clear', 'must be requested by the active worker at the exact host revision');
          }
        }
        fs.rmSync(checkpointPath, { force: true });
        fs.rmSync(claimPath, { force: true });
        if (probeFile(checkpointPath).present || probeFile(claimPath).present) {
          invalid('checkpoint store clear', 'must leave no ownership claim or checkpoint behind');
        }
        return { version: 1, status: 'cleared', checkpointKey: key };
      } catch (error) {
        return failure(key === null ? sha256('checkpoint-key-underivable') : key, error);
      }
    },
  });
}

/** @param {unknown} value @param {string} kind */
function runtimeObservationIdentity(value, kind) {
  try {
    return sha256(canonicalJson({ kind, value: detachedData(value, 'host runtime observation') }));
  } catch {
    return sha256(canonicalJson({ kind, value: 'uninspectable' }));
  }
}

/** @param {ReturnType<typeof trustedPorts>} ports @param {Record<string, unknown>} request */
function captureNoEffectProbe(ports, request) {
  const authority = /** @type {object} */ (ports.noEffectAuthority.authority);
  let authorityState = NO_EFFECT_AUTHORITY_STATES.get(authority);
  if (!authorityState) {
    authorityState = { probes: new Map(), consumed: new Set() };
    NO_EFFECT_AUTHORITY_STATES.set(authority, authorityState);
  }
  if (authorityState.probes.size >= MAX_GRAPH_ENTRIES) {
    // A bounded-ledger stop is its own typed reason: nothing about the runtime output is malformed.
    throw new RuntimeIncident(
      'tool-contract',
      'no-effect-probe-ledger-exhausted',
      runtimeObservationIdentity({ probes: authorityState.probes.size }, 'probe-ledger'),
    );
  }
  let value;
  try {
    value = ports.noEffectAuthority.capture(request);
  } catch {
    invalid('host no-effect probe', 'must return one closed pre-invocation probe');
  }
  const probe = exactRecord(detachedData(value, 'host no-effect probe'), [
    'version', 'requestIdentity', 'operationIdentity', 'authorityIdentity',
    'authoritativePreIdentity', 'probeIdentity',
  ], [], 'host no-effect probe');
  if (probe.version !== 1) invalid('host no-effect probe.version', 'must be the literal 1');
  for (const field of [
    'requestIdentity',
    'operationIdentity',
    'authorityIdentity',
    'authoritativePreIdentity',
    'probeIdentity',
  ]) {
    hash(probe[field], `host no-effect probe.${field}`);
  }
  if (probe.requestIdentity !== request.requestIdentity
    || probe.operationIdentity !== request.operationIdentity
    || probe.authorityIdentity !== ports.noEffectAuthority.identity) {
    invalid('host no-effect probe', 'must bind the exact invocation request and authority');
  }
  const { probeIdentity, ...body } = probe;
  if (probeIdentity !== sha256(canonicalJson({ request, response: body }))) {
    invalid('host no-effect probe.probeIdentity', 'must bind the complete request and response');
  }
  if (authorityState.probes.has(/** @type {string} */ (probeIdentity))) {
    invalid('host no-effect probe.probeIdentity', 'must not replay a prior probe');
  }
  authorityState.probes.set(/** @type {string} */ (probeIdentity), {
    operationIdentity: probe.operationIdentity,
    authoritativePreIdentity: probe.authoritativePreIdentity,
  });
  return probe;
}

/** @param {ReturnType<typeof trustedPorts>} ports @param {Record<string, unknown>} probe @param {RuntimeIncident} incident */
function classifyNoEffect(ports, probe, incident) {
  const authority = /** @type {object} */ (ports.noEffectAuthority.authority);
  const authorityState = NO_EFFECT_AUTHORITY_STATES.get(authority);
  const registered = authorityState?.probes.get(/** @type {string} */ (probe.probeIdentity));
  if (!registered || authorityState.consumed.has(/** @type {string} */ (probe.probeIdentity))) return false;
  authorityState.consumed.add(/** @type {string} */ (probe.probeIdentity));
  const incidentBody = {
    version: 1,
    probeIdentity: probe.probeIdentity,
    operationIdentity: probe.operationIdentity,
    incidentClass: incident.incidentClass,
    reason: incident.message,
    observationIdentity: incident.observationIdentity,
  };
  const request = freezeData({
    ...incidentBody,
    incidentIdentity: sha256(canonicalJson(incidentBody)),
  });
  let value;
  try {
    value = ports.noEffectAuthority.classify(request);
  } catch {
    return false;
  }
  let result;
  try {
    result = exactRecord(detachedData(value, 'host no-effect result'), [
      'version', 'probeIdentity', 'operationIdentity', 'authorityIdentity',
      'incidentIdentity', 'classification', 'authoritativePreIdentity',
      'authoritativePostIdentity', 'effectIdentity', 'resultIdentity',
    ], [], 'host no-effect result');
    if (result.version !== 1) invalid('host no-effect result.version', 'must be the literal 1');
    for (const field of [
      'probeIdentity',
      'operationIdentity',
      'authorityIdentity',
      'incidentIdentity',
      'authoritativePreIdentity',
      'authoritativePostIdentity',
      'resultIdentity',
    ]) {
      hash(result[field], `host no-effect result.${field}`);
    }
    enumeration(
      result.classification,
      ['no-effect', 'effect-observed', 'indeterminate'],
      'host no-effect result.classification',
    );
    if (result.effectIdentity !== null) hash(result.effectIdentity, 'host no-effect result.effectIdentity');
    const { resultIdentity, ...body } = result;
    if (resultIdentity !== sha256(canonicalJson({ request, response: body }))) {
      invalid('host no-effect result.resultIdentity', 'must bind the complete incident and response');
    }
  } catch {
    return false;
  }
  return result.probeIdentity === probe.probeIdentity
    && result.operationIdentity === probe.operationIdentity
    && result.authorityIdentity === ports.noEffectAuthority.identity
    && result.incidentIdentity === request.incidentIdentity
    && result.classification === 'no-effect'
    && result.authoritativePreIdentity === registered.authoritativePreIdentity
    && result.authoritativePostIdentity === registered.authoritativePreIdentity
    && result.effectIdentity === null;
}

/** @param {ReturnType<typeof trustedPorts>} ports @param {Record<string, unknown>} probe @param {string} incidentClass @param {string} reason @param {unknown} observation @param {string} observationKind */
function classifiedRuntimeIncident(ports, probe, incidentClass, reason, observation, observationKind) {
  const incident = new RuntimeIncident(
    incidentClass,
    reason,
    runtimeObservationIdentity(observation, observationKind),
  );
  incident.provenNoEffect = classifyNoEffect(ports, probe, incident);
  return incident;
}

/** @param {ReturnType<typeof trustedPorts>} ports @param {Record<string, unknown>} session @param {string} semanticOperation @param {string} command @param {unknown} request */
function invokeRuntime(ports, session, semanticOperation, command, request) {
  const lowLevelRequest = freezeData(clone(request));
  const operationIdentity = randomBytes(32).toString('hex');
  const probeBody = {
    version: 1,
    sessionIdentity: session.sessionIdentity,
    invocationIdentity: session.invocationIdentity,
    workerGeneration: session.workerGeneration,
    target: clone(session.target),
    acceptedStateBytes: session.acceptedStateBytes,
    acceptedStateHash: session.acceptedStateHash,
    acceptedRevision: session.acceptedRevision,
    hostRevision: session.hostRevision,
    inspectionIdentity: session.inspectionIdentity,
    semanticOperation,
    runtimeIdentity: ports.runtimeIdentity,
    command,
    lowLevelRequestIdentity: sha256(canonicalJson(lowLevelRequest)),
    operationIdentity,
  };
  const probeRequest = freezeData({
    ...probeBody,
    requestIdentity: sha256(canonicalJson(probeBody)),
  });
  const probe = captureNoEffectProbe(ports, probeRequest);
  let output;
  try {
    output = ports.runtimeInvoke(command, lowLevelRequest);
  } catch {
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'tool-contract',
      'runtime-threw',
      null,
      'thrown',
    );
  }
  if (output === undefined || output === null || output === '') {
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'empty-output',
      'runtime-output-empty',
      output,
      'empty',
    );
  }
  let envelope;
  try {
    const safe = detachedData(output, 'host runtime result');
    const candidate = record(safe, 'host runtime result');
    enumeration(candidate.status, ['returned', 'empty', 'nonzero'], 'host runtime result.status');
    envelope = candidate.status === 'returned'
      ? exactRecord(safe, ['status', 'value'], [], 'host runtime result')
      : candidate.status === 'nonzero'
        ? exactRecord(safe, ['status', 'code'], [], 'host runtime result')
        : exactRecord(safe, ['status'], [], 'host runtime result');
  } catch {
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'malformed-output',
      'runtime-output-malformed',
      output,
      'malformed',
    );
  }
  if (envelope.status === 'empty') {
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'empty-output',
      'runtime-output-empty',
      envelope,
      'empty',
    );
  }
  if (envelope.status === 'nonzero') {
    try {
      integer(envelope.code, 'host runtime result.code', true);
    } catch {
      throw classifiedRuntimeIncident(
        ports,
        probe,
        'malformed-output',
        'runtime-output-malformed',
        envelope,
        'malformed-nonzero',
      );
    }
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'tool-contract',
      'runtime-nonzero',
      envelope,
      'nonzero',
    );
  }
  if (envelope.value === undefined || envelope.value === null || envelope.value === '') {
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'empty-output',
      'runtime-output-empty',
      envelope,
      'empty-value',
    );
  }
  try {
    validateRecoveryRuntimeResultV1(command, request, envelope.value);
    return envelope.value;
  } catch {
    throw classifiedRuntimeIncident(
      ports,
      probe,
      'malformed-output',
      'runtime-result-not-authoritative',
      envelope,
      'non-authoritative',
    );
  }
}

/** @param {Record<string, unknown>} session @param {unknown} requestValue @param {ReturnType<typeof trustedPorts>} ports @param {{beginOperation:(session:Record<string, unknown>, operation:string, request:Record<string, unknown>)=>{session?:Record<string, unknown>, reason?:string}}|null} [host] @param {ReturnType<typeof createLaneLedger>} [ledger] */
function runOperation(session, requestValue, ports, host = null, ledger = createLaneLedger()) {
  if (session.status !== 'active') return terminalResult(session);
  let request;
  try {
    request = /** @type {Record<string, unknown>} */ (
      validateHostAdapterRequest(requestValue, session.acceptedState)
    );
  } catch (error) {
    const operation = malformedRequestOperation(session, requestValue);
    if (operation) {
      if (session.correction !== null) return reinspect(session, 'correction-or-inspection-required');
      return closedIncident(session, /** @type {string} */ (operation), 'malformed-request', 'malformed-request');
    }
    return hardStop(session, 'request-not-authorized');
  }
  const authorityReason = authorityFailure(session, request);
  if (authorityReason) return hardStop(session, authorityReason);
  // The completion bridge and every lane-effect and audit route are autonomous only.
  if (AUTONOMOUS_OPERATIONS.has(/** @type {string} */ (request.operation))
    && /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (session.acceptedState).policy
    ).mode !== 'autonomous') {
    return hardStop(session, 'autonomous-policy-required');
  }
  const correction = authorizeCorrection(session, request);
  if (correction.result) return correction.result;
  let workingSession = /** @type {Record<string, unknown>} */ (correction.session);
  if (host) {
    const registered = host.beginOperation(workingSession, /** @type {string} */ (request.operation), request);
    if (registered.reason) return hardStop(workingSession, registered.reason);
    workingSession = /** @type {Record<string, unknown>} */ (registered.session);
  }
  const invoke = (command, lowLevelRequest) => invokeRuntime(
    ports,
    workingSession,
    /** @type {string} */ (request.operation),
    command,
    lowLevelRequest,
  );
  try {
    if (request.operation === 'fresh-inspection') return freshInspection(workingSession, request, invoke);
    if (request.operation === 'authorize-attempt') return authorizeAttemptOperation(workingSession, request, invoke);
    if (request.operation === 'record-attempt-result') return recordAttemptResult(workingSession, request, invoke);
    if (request.operation === 'settle-effect') return settleEffect(workingSession, request, invoke);
    if (request.operation === 'advance-governance') return advanceGovernance(workingSession, request, invoke);
    if (request.operation === 'prepare-authoritative-projection') {
      return prepareAuthoritativeProjection(workingSession, request, invoke, ledger);
    }
    if (request.operation === 'authorize-lane-effect') {
      return authorizeLaneEffect(workingSession, request, invoke, ledger);
    }
    if (request.operation === 'apply-lane-effect') return applyLaneEffect(workingSession, request, ports, ledger);
    if (request.operation === 'commit-lane-receipt') {
      return commitLaneReceipt(workingSession, request, invoke, ledger);
    }
    return auditRun(workingSession, request, invoke);
  } catch (error) {
    if (error instanceof RuntimeIncident && error.provenNoEffect) {
      return closedIncident(workingSession, /** @type {string} */ (request.operation), error.incidentClass, error.message);
    }
    return hardStop(
      workingSession,
      error instanceof RuntimeIncident ? error.message : 'runtime-output-malformed',
    );
  }
}

/**
 * Prove both controlled artifacts absent, then take one exclusive ownership claim.
 * @param {NonNullable<ReturnType<typeof trustedPorts>['checkpoint']>} store
 * @param {Record<string, unknown>} binding @param {Record<string, unknown>} prestate
 * @param {Record<string, unknown>} session
 */
function openCheckpointHost(store, binding, prestate, session) {
  const checkpointKey = checkpointKeyOf(binding);
  /** @param {string} reason @param {unknown} [diagnostic] */
  const refuse = (reason, diagnostic) => ({
    reason,
    ownership: ownershipDiagnostic(checkpointKey, diagnostic ?? null, reason),
  });
  let preflight;
  try {
    preflight = validateCheckpointResult(store.load(binding), 'load', checkpointKey);
  } catch {
    return refuse('checkpoint-load-failed');
  }
  if (preflight.status === 'loaded') {
    const occupant = /** @type {Record<string, unknown>} */ (preflight.record);
    return refuse('checkpoint-ownership-unavailable', {
      claimPresent: true,
      checkpointPresent: true,
      createdAt: occupant.createdAt,
      updatedAt: occupant.updatedAt,
      detail: 'ownership-claim-active',
    });
  }
  if (preflight.status === 'corrupt') return refuse('checkpoint-stale-orphan', preflight.diagnostic);
  if (preflight.status === 'failed') return refuse('checkpoint-load-failed');
  const observed = /** @type {Record<string, unknown>} */ (preflight.diagnostic);
  if (observed.claimPresent !== false || observed.checkpointPresent !== false) {
    return refuse('checkpoint-absence-unproven', observed);
  }
  const createdAt = nowStamp();
  const initialRecord = buildCheckpointRecord(binding, prestate, session, null, createdAt);
  let claimed;
  try {
    claimed = validateCheckpointResult(store.claim(binding, initialRecord), 'claim', checkpointKey);
  } catch {
    return refuse('checkpoint-claim-failed');
  }
  if (claimed.status === 'occupied') return refuse('checkpoint-ownership-unavailable', claimed.diagnostic);
  if (claimed.status !== 'claimed'
    || /** @type {Record<string, unknown>} */ (claimed.record).recordHash !== initialRecord.recordHash) {
    return refuse('checkpoint-claim-failed');
  }
  return {
    host: createCheckpointHost(
      store,
      binding,
      prestate,
      createdAt,
      /** @type {Record<string, unknown>} */ (claimed.record),
    ),
  };
}

/** @param {unknown} value @param {string} label */
function validateWorkspaceBinding(value, label) {
  const workspace = exactRecord(
    value,
    ['workspaceIdentity', 'ownerIdentity', 'taskPrestateIdentity', 'lanePrestateIdentity'],
    [],
    label,
  );
  hash(workspace.workspaceIdentity, `${label}.workspaceIdentity`);
  hash(workspace.ownerIdentity, `${label}.ownerIdentity`);
  return {
    workspace,
    prestate: validatePrestate({
      taskPrestateIdentity: workspace.taskPrestateIdentity,
      lanePrestateIdentity: workspace.lanePrestateIdentity,
    }, label),
  };
}

/** @param {unknown} value @param {string} label */
function validateHandoffReceipt(value, label) {
  const receipt = exactRecord(value, [
    'version', 'checkpointKey', 'invocationIdentity', 'priorWorkerToken', 'priorWorkerGeneration',
    'workerToken', 'workerGeneration', 'acceptedStateHash', 'acceptedRevision', 'hostRevision',
    'supervisorAuthorityIdentity', 'admissionIdentity', 'receiptHash',
  ], [], label);
  if (receipt.version !== 1) invalid(`${label}.version`, 'must be the literal 1');
  for (const field of [
    'checkpointKey', 'invocationIdentity', 'priorWorkerToken', 'workerToken',
    'acceptedStateHash', 'supervisorAuthorityIdentity', 'admissionIdentity', 'receiptHash',
  ]) {
    hash(receipt[field], `${label}.${field}`);
  }
  integer(receipt.priorWorkerGeneration, `${label}.priorWorkerGeneration`, true);
  integer(receipt.workerGeneration, `${label}.workerGeneration`, true);
  integer(receipt.acceptedRevision, `${label}.acceptedRevision`);
  integer(receipt.hostRevision, `${label}.hostRevision`);
  const { receiptHash, ...body } = receipt;
  if (receiptHash !== sha256(canonicalJson(body))) invalid(`${label}.receiptHash`, 'must bind the complete receipt');
  return receipt;
}

/**
 * One worker's handle over the accepted state, its checkpoint, and its terminal boundary.
 * @param {Record<string, unknown>} session @param {ReturnType<typeof trustedPorts>} ports
 * @param {ReturnType<typeof createCheckpointHost>|null} checkpointHost @param {unknown} ownershipReport
 */
function hostAdapterHandle(session, ports, checkpointHost, ownershipReport) {
  let current = session;
  let host = checkpointHost;
  let ownership = ownershipReport;
  const ledger = createLaneLedger();

  /** @param {Record<string, unknown>} stopped @param {string} reason */
  function fail(stopped, reason) {
    if (host) ownership = ownershipDiagnostic(host.checkpointKey, null, reason);
    const result = /** @type {Record<string, unknown>} */ (hardStop(stopped, reason));
    current = /** @type {Record<string, unknown>} */ (result.session);
    return result;
  }

  return Object.freeze({
    snapshot() {
      return validateHostAdapterSession(current);
    },
    ownership() {
      return ownership;
    },
    run(requestValue) {
      const priorHostRevision = /** @type {number} */ (current.hostRevision);
      const result = /** @type {Record<string, unknown>} */ (runOperation(current, requestValue, ports, host, ledger));
      const next = /** @type {Record<string, unknown>} */ (result.session);
      if (host && result.outcome === 'ended') {
        const cleanup = host.clear(next, /** @type {string} */ (result.reason));
        if (cleanup) return fail(next, cleanup);
        host = null;
      } else if (host && result.outcome !== 'hard-stop'
        && /** @type {number} */ (next.hostRevision) > priorHostRevision) {
        const failure = host.settle(next);
        if (failure) return fail(next, failure);
      }
      current = next;
      return validateHostAdapterResult(result);
    },
    end(reasonValue) {
      enumeration(reasonValue, END_REASONS, 'host adapter end reason');
      const reason = /** @type {string} */ (reasonValue);
      if (current.status === 'ended') return terminalResult(current);
      if (current.status === 'hard-stop' && reason !== 'hard-stop-recorded') return terminalResult(current);
      if (host) {
        const cleanup = host.clear(current, reason);
        // A failed clear never ends: it leaves the collision visible and blocks replacement work.
        if (cleanup) return fail(current, cleanup);
        host = null;
      }
      current = /** @type {Record<string, unknown>} */ (advanceHost(current, { status: 'ended', disposition: reason }));
      return checkedResult({ version: 1, outcome: 'ended', reason, session: current });
    },
  });
}

/**
 * Create one adapter worker under fresh trusted supervisor admission, optionally taking
 * the exclusive workspace-target ownership claim when a checkpoint store is injected.
 * @param {unknown} initialSessionInput @param {unknown} dependencies
 */
export function createHostAdapter(initialSessionInput, dependencies) {
  const ports = trustedPorts(dependencies);
  const initial = exactRecord(
    detachedData(initialSessionInput, 'host adapter initial input'),
    ['state', 'target', 'inspectionIdentity'],
    ['workspace'],
    'host adapter initial input',
  );
  if (Object.hasOwn(initial, 'workspace') !== (ports.checkpoint !== null)) {
    invalid('host adapter initial input.workspace', 'must accompany exactly one injected checkpoint store');
  }
  const workspaceBinding = ports.checkpoint === null
    ? null
    : validateWorkspaceBinding(initial.workspace, 'host adapter initial input.workspace');
  const sessionInput = {
    state: initial.state,
    target: initial.target,
    inspectionIdentity: initial.inspectionIdentity,
  };
  const provisional = /** @type {Record<string, unknown>} */ (createHostAdapterSession({
    ...sessionInput,
    invocationIdentity: sha256('dude-work/host-adapter:pre-admission-invocation:v1'),
    workerToken: sha256('dude-work/host-adapter:pre-admission-worker:v1'),
    workerGeneration: 1,
    authorities: {
      runtimeIdentity: ports.runtimeIdentity,
      supervisorAuthorityIdentity: ports.supervisorSession.identity,
      admissionIdentity: sha256('dude-work/host-adapter:pre-admission:v1'),
      noEffectAuthorityIdentity: ports.noEffectAuthority.identity,
    },
  }));
  const admission = admitSupervisorSession(ports, provisional);
  const current = /** @type {Record<string, unknown>} */ (createHostAdapterSession({
    ...sessionInput,
    invocationIdentity: admission.invocationIdentity,
    workerToken: admission.workerToken,
    workerGeneration: admission.workerGeneration,
    authorities: {
      runtimeIdentity: ports.runtimeIdentity,
      supervisorAuthorityIdentity: admission.supervisorAuthorityIdentity,
      admissionIdentity: admission.admissionIdentity,
      noEffectAuthorityIdentity: ports.noEffectAuthority.identity,
    },
  }));
  if (workspaceBinding === null) return hostAdapterHandle(current, ports, null, null);
  const binding = validateCheckpointBinding({
    version: 1,
    workspaceIdentity: workspaceBinding.workspace.workspaceIdentity,
    target: clone(current.target),
    ownerIdentity: workspaceBinding.workspace.ownerIdentity,
  }, 'host adapter checkpoint binding');
  const opened = openCheckpointHost(
    /** @type {NonNullable<ReturnType<typeof trustedPorts>['checkpoint']>} */ (ports.checkpoint),
    binding,
    workspaceBinding.prestate,
    current,
  );
  if (opened.host) return hostAdapterHandle(current, ports, opened.host, null);
  const stopped = /** @type {Record<string, unknown>} */ (
    hardStop(current, /** @type {string} */ (opened.reason))
  );
  return hostAdapterHandle(
    /** @type {Record<string, unknown>} */ (stopped.session),
    ports,
    null,
    opened.ownership,
  );
}

/**
 * Replace one exited adapter worker under the supervisor's retained invocation identity.
 * The supervisor must supply the exact observed prior-worker exit; nothing here infers it.
 * @param {unknown} inputValue @param {unknown} dependencies
 */
export function handoffHostWorker(inputValue, dependencies) {
  const ports = trustedPorts(dependencies);
  const store = ports.checkpoint;
  if (store === null) invalid('host adapter dependencies.checkpoint', 'must be supplied for worker handoff');
  const input = exactRecord(detachedData(inputValue, 'host worker handoff input'), [
    'workspaceIdentity', 'target', 'ownerIdentity', 'invocationIdentity', 'priorWorker', 'observedExit',
  ], [], 'host worker handoff input');
  hash(input.workspaceIdentity, 'host worker handoff input.workspaceIdentity');
  hash(input.ownerIdentity, 'host worker handoff input.ownerIdentity');
  hash(input.invocationIdentity, 'host worker handoff input.invocationIdentity');
  const prior = validateWorker(input.priorWorker, 'host worker handoff input.priorWorker');
  const observedExit = exactRecord(
    input.observedExit,
    ['workerToken', 'workerGeneration', 'exitCode'],
    [],
    'host worker handoff input.observedExit',
  );
  hash(observedExit.workerToken, 'host worker handoff input.observedExit.workerToken');
  integer(observedExit.workerGeneration, 'host worker handoff input.observedExit.workerGeneration', true);
  integer(observedExit.exitCode, 'host worker handoff input.observedExit.exitCode');
  const binding = validateCheckpointBinding({
    version: 1,
    workspaceIdentity: input.workspaceIdentity,
    target: canonicalTarget(validateTarget(input.target)),
    ownerIdentity: input.ownerIdentity,
  }, 'host worker handoff binding');
  const checkpointKey = checkpointKeyOf(binding);
  /** @param {string} reason @param {unknown} [diagnostic] */
  const stop = (reason, diagnostic) => Object.freeze({
    version: 1,
    outcome: 'hard-stop',
    reason,
    checkpointKey,
    ownership: ownershipDiagnostic(checkpointKey, diagnostic ?? null, reason),
    receipt: null,
  });
  if (observedExit.workerToken !== prior.workerToken
    || observedExit.workerGeneration !== prior.workerGeneration) {
    return stop('prior-worker-exit-unproven');
  }
  let loaded;
  try {
    loaded = validateCheckpointResult(store.load(binding), 'load', checkpointKey);
  } catch {
    return stop('checkpoint-corrupt');
  }
  if (loaded.status === 'absent') return stop('checkpoint-absent', loaded.diagnostic);
  if (loaded.status === 'corrupt') return stop('checkpoint-stale-orphan', loaded.diagnostic);
  if (loaded.status === 'failed') return stop('checkpoint-load-failed');
  const currentRecord = /** @type {Record<string, unknown>} */ (loaded.record);
  if (currentRecord.invocationIdentity !== input.invocationIdentity) {
    return stop('invocation-identity-mismatch');
  }
  if (currentRecord.workerToken !== prior.workerToken
    || currentRecord.workerGeneration !== prior.workerGeneration) {
    return stop('stale-worker');
  }
  let admission;
  try {
    admission = admitSupervisorSession(ports, currentRecord, 'replacement', {
      invocationIdentity: currentRecord.invocationIdentity,
      workerToken: prior.workerToken,
      workerGeneration: prior.workerGeneration,
    });
  } catch {
    return stop('replacement-admission-refused');
  }
  const body = clone(currentRecord);
  delete body.recordHash;
  body.workerToken = admission.workerToken;
  body.workerGeneration = admission.workerGeneration;
  body.hostRevision = /** @type {number} */ (currentRecord.hostRevision) + 1;
  body.updatedAt = nowStamp();
  const next = { ...body, recordHash: sha256(canonicalJson(body)) };
  const replacement = { workerToken: admission.workerToken, workerGeneration: admission.workerGeneration };
  let handed;
  try {
    handed = validateCheckpointResult(
      store.handoff(
        binding,
        { workerToken: prior.workerToken, workerGeneration: prior.workerGeneration },
        replacement,
        { acceptedRevision: currentRecord.acceptedRevision, hostRevision: currentRecord.hostRevision },
        next,
      ),
      'handoff',
      checkpointKey,
    );
  } catch {
    return stop('checkpoint-handoff-failed');
  }
  if (handed.status === 'stale') return stop('stale-worker', handed.diagnostic);
  if (handed.status !== 'handed-off'
    || /** @type {Record<string, unknown>} */ (handed.record).recordHash !== next.recordHash) {
    return stop('checkpoint-handoff-failed');
  }
  const receiptBody = {
    version: 1,
    checkpointKey,
    invocationIdentity: currentRecord.invocationIdentity,
    priorWorkerToken: prior.workerToken,
    priorWorkerGeneration: prior.workerGeneration,
    workerToken: admission.workerToken,
    workerGeneration: admission.workerGeneration,
    acceptedStateHash: next.acceptedStateHash,
    acceptedRevision: next.acceptedRevision,
    hostRevision: next.hostRevision,
    supervisorAuthorityIdentity: admission.supervisorAuthorityIdentity,
    admissionIdentity: admission.admissionIdentity,
  };
  return Object.freeze({
    version: 1,
    outcome: 'handed-off',
    reason: 'worker-replaced',
    checkpointKey,
    ownership: null,
    receipt: freezeData({ ...receiptBody, receiptHash: sha256(canonicalJson(receiptBody)) }),
  });
}

/**
 * Resume one replacement worker from the surviving supervisor's checkpoint. Every
 * comparison class must match freshly supplied authority before any route may run.
 * @param {unknown} inputValue @param {unknown} dependencies
 */
export function resumeHostAdapter(inputValue, dependencies) {
  const ports = trustedPorts(dependencies, 'resumed');
  const store = /** @type {NonNullable<ReturnType<typeof trustedPorts>['checkpoint']>} */ (ports.checkpoint);
  const safe = detachedData(inputValue, 'host adapter resume input');
  const candidate = record(safe, 'host adapter resume input');
  const unbound = sha256('checkpoint-key-underivable');
  /** @param {string} key @param {string} reason @param {unknown} [diagnostic] */
  const stop = (key, reason, diagnostic) => Object.freeze({
    version: 1,
    outcome: 'hard-stop',
    reason,
    checkpointKey: key,
    ownership: ownershipDiagnostic(key, diagnostic ?? null, reason),
    adapter: null,
  });
  // Checkpoint bytes never establish caller identity: the supervisor must supply it.
  for (const field of ['invocationIdentity', 'worker', 'handoffReceipt']) {
    if (!Object.hasOwn(candidate, field)) return stop(unbound, 'supervisor-identity-missing');
  }
  let input;
  let binding;
  let prestate;
  let worker;
  let receipt;
  try {
    input = exactRecord(safe, [
      'workspaceIdentity', 'target', 'ownerIdentity', 'prestate',
      'invocationIdentity', 'worker', 'handoffReceipt',
    ], ['effect'], 'host adapter resume input');
    hash(input.workspaceIdentity, 'host adapter resume input.workspaceIdentity');
    hash(input.ownerIdentity, 'host adapter resume input.ownerIdentity');
    hash(input.invocationIdentity, 'host adapter resume input.invocationIdentity');
    worker = validateWorker(input.worker, 'host adapter resume input.worker');
    prestate = validatePrestate(input.prestate, 'host adapter resume input.prestate');
    receipt = validateHandoffReceipt(input.handoffReceipt, 'host adapter resume input.handoffReceipt');
    binding = validateCheckpointBinding({
      version: 1,
      workspaceIdentity: input.workspaceIdentity,
      target: canonicalTarget(validateTarget(input.target)),
      ownerIdentity: input.ownerIdentity,
    }, 'host adapter resume binding');
  } catch {
    return stop(unbound, 'resume-input-not-authorized');
  }
  const checkpointKey = checkpointKeyOf(binding);
  if (receipt.invocationIdentity !== input.invocationIdentity
    || receipt.workerToken !== worker.workerToken
    || receipt.workerGeneration !== worker.workerGeneration) {
    return stop(checkpointKey, 'supervisor-identity-mismatch');
  }
  let loaded;
  try {
    loaded = validateCheckpointResult(store.load(binding), 'load', checkpointKey);
  } catch {
    return stop(checkpointKey, 'checkpoint-corrupt');
  }
  if (loaded.status === 'absent') return stop(checkpointKey, 'checkpoint-absent', loaded.diagnostic);
  if (loaded.status === 'corrupt') return stop(checkpointKey, 'checkpoint-stale-orphan', loaded.diagnostic);
  if (loaded.status === 'failed') return stop(checkpointKey, 'checkpoint-load-failed');
  const checkpoint = /** @type {Record<string, unknown>} */ (loaded.record);
  const target = /** @type {Record<string, unknown>} */ (binding.target);
  if (checkpoint.invocationIdentity !== input.invocationIdentity) {
    return stop(checkpointKey, 'invocation-identity-mismatch');
  }
  if (checkpoint.workerToken !== worker.workerToken
    || checkpoint.workerGeneration !== worker.workerGeneration) {
    return stop(checkpointKey, 'stale-worker');
  }
  if (checkpoint.acceptedRevision !== receipt.acceptedRevision
    || checkpoint.hostRevision !== receipt.hostRevision
    || checkpoint.acceptedStateHash !== receipt.acceptedStateHash) {
    return stop(checkpointKey, 'checkpoint-revision-conflict');
  }
  if (checkpoint.checkpointKey !== checkpointKey
    || receipt.checkpointKey !== checkpointKey
    || checkpoint.workspaceIdentity !== binding.workspaceIdentity
    || canonicalJson(checkpoint.target) !== canonicalJson(target)) {
    return stop(checkpointKey, 'workspace-target-drift');
  }
  if (checkpoint.ownerIdentity !== binding.ownerIdentity
    || /** @type {Record<string, unknown>} */ (checkpoint.target).specPath !== target.specPath) {
    return stop(checkpointKey, 'owner-drift');
  }
  if (checkpoint.lane !== target.lane
    || checkpoint.taskPrestateIdentity !== prestate.taskPrestateIdentity
    || checkpoint.lanePrestateIdentity !== prestate.lanePrestateIdentity) {
    return stop(checkpointKey, 'lane-prestate-drift');
  }
  let acceptedBytes;
  try {
    acceptedBytes = canonicalJson(validateRunState(JSON.parse(/** @type {string} */ (checkpoint.acceptedStateBytes))));
    if (acceptedBytes !== checkpoint.acceptedStateBytes
      || sha256(acceptedBytes) !== checkpoint.acceptedStateHash) {
      throw new TypeError('checkpoint-state-drift');
    }
  } catch {
    return stop(checkpointKey, 'checkpoint-corrupt');
  }
  const authorities = {
    runtimeIdentity: ports.runtimeIdentity,
    supervisorAuthorityIdentity: receipt.supervisorAuthorityIdentity,
    admissionIdentity: receipt.admissionIdentity,
    noEffectAuthorityIdentity: ports.noEffectAuthority.identity,
  };
  const correction = restoredCorrection(checkpoint);
  let predecessorSession;
  try {
    predecessorSession = /** @type {Record<string, unknown>} */ (createHostAdapterSession({
      state: JSON.parse(acceptedBytes),
      target: clone(target),
      invocationIdentity: input.invocationIdentity,
      workerToken: worker.workerToken,
      workerGeneration: worker.workerGeneration,
      inspectionIdentity: checkpoint.inspectionIdentity,
      acceptedRevision: checkpoint.acceptedRevision,
      hostRevision: checkpoint.hostRevision,
      authorities,
      ...(correction === null ? {} : { correction }),
    }));
  } catch {
    return stop(checkpointKey, 'checkpoint-corrupt');
  }
  const settled = settleResumedEffect(checkpoint, input, acceptedBytes, predecessorSession, ports);
  if (settled.reason) return stop(checkpointKey, settled.reason);
  let resumed;
  try {
    resumed = /** @type {Record<string, unknown>} */ (createHostAdapterSession({
      state: JSON.parse(/** @type {string} */ (settled.acceptedStateBytes)),
      target: clone(target),
      invocationIdentity: input.invocationIdentity,
      workerToken: worker.workerToken,
      workerGeneration: worker.workerGeneration,
      inspectionIdentity: checkpoint.inspectionIdentity,
      acceptedRevision: settled.acceptedRevision,
      hostRevision: checkpoint.hostRevision,
      authorities,
      ...(settled.correction === null ? {} : { correction: settled.correction }),
    }));
  } catch {
    return stop(checkpointKey, 'checkpoint-corrupt');
  }
  const host = createCheckpointHost(
    store,
    binding,
    prestate,
    /** @type {string} */ (checkpoint.createdAt),
    checkpoint,
  );
  const advanced = /** @type {Record<string, unknown>} */ (advanceHost(resumed, {
    // The replacement worker carries one pending notice; the first successful
    // accepted outcome returns and consumes it.
    recoveryNotice: {
      incidentClassification: 'host-process-recovered',
      statePreserved: true,
      resumedAction: checkpoint.inFlight === null
        ? 'fresh-inspection'
        : /** @type {Record<string, unknown>} */ (checkpoint.inFlight).semanticOperation,
    },
  }));
  const failure = host.commit(advanced, null);
  if (failure) return stop(checkpointKey, failure);
  return Object.freeze({
    version: 1,
    outcome: 'resumed',
    reason: 'checkpoint-resumed',
    checkpointKey,
    ownership: null,
    adapter: hostAdapterHandle(advanced, ports, host, null),
  });
}

/**
 * Comparison class six: an unchanged prestate resumes the predecessor, and an established
 * effect resumes only against its exact receipt and freshly supplied poststate.
 * @param {Record<string, unknown>} checkpoint @param {Record<string, unknown>} input @param {string} acceptedBytes
 * @param {Record<string, unknown>} predecessorSession @param {ReturnType<typeof trustedPorts>} ports
 */
function settleResumedEffect(checkpoint, input, acceptedBytes, predecessorSession, ports) {
  const inFlight = /** @type {Record<string, unknown>|null} */ (checkpoint.inFlight);
  const expected = inFlight === null ? null : inFlight.expectedEffectIdentity;
  const supplied = Object.hasOwn(input, 'effect') ? input.effect : null;
  const predecessor = {
    acceptedStateBytes: acceptedBytes,
    acceptedRevision: checkpoint.acceptedRevision,
    correction: restoredCorrection(checkpoint),
  };
  if (supplied === null) {
    return expected === null || expected === undefined ? predecessor : { reason: 'effect-unverified' };
  }
  let effect;
  try {
    effect = record(supplied, 'host adapter resume input.effect');
    if (effect.status === 'unchanged-prestate') {
      exactRecord(effect, ['status', 'taskPrestateIdentity', 'lanePrestateIdentity'], [], 'host adapter resume input.effect');
    } else if (effect.status === 'established') {
      exactRecord(
        effect,
        ['status', 'effectIdentity', 'receiptIdentity', 'provisionalState'],
        ['projection'],
        'host adapter resume input.effect',
      );
      hash(effect.effectIdentity, 'host adapter resume input.effect.effectIdentity');
      hash(effect.receiptIdentity, 'host adapter resume input.effect.receiptIdentity');
    } else {
      return { reason: 'unknown-effect' };
    }
  } catch {
    return { reason: 'unknown-effect' };
  }
  if (effect.status === 'unchanged-prestate') {
    // Resume already required these identities to equal the checkpoint's, so this attestation
    // restates the caller's own input and can never vouch for a bound effect's establishment.
    if (expected !== null && expected !== undefined) return { reason: 'effect-unverified' };
    return effect.taskPrestateIdentity === checkpoint.taskPrestateIdentity
      && effect.lanePrestateIdentity === checkpoint.lanePrestateIdentity
      ? predecessor
      : { reason: 'lane-prestate-drift' };
  }
  if (expected === null || expected === undefined || effect.effectIdentity !== expected) {
    return { reason: 'unknown-effect' };
  }
  // The receipt is compared against the expectation bound when the effect was requested, so the
  // checkpoint the dead worker wrote can never vouch for its own establishment.
  const expectedReceipt = /** @type {Record<string, unknown>} */ (inFlight).expectedReceiptIdentity;
  if (expectedReceipt === null || expectedReceipt === undefined) return { reason: 'effect-unverified' };
  if (effect.receiptIdentity !== expectedReceipt) return { reason: 'unknown-effect' };
  let provisional;
  let provisionalBytes;
  try {
    provisional = /** @type {Record<string, unknown>} */ (validateRunState(effect.provisionalState));
    provisionalBytes = canonicalJson(provisional);
  } catch {
    return { reason: 'effect-poststate-mismatch' };
  }
  if (sha256(provisionalBytes) !== /** @type {Record<string, unknown>} */ (inFlight).provisionalStateHash) {
    return { reason: 'effect-poststate-mismatch' };
  }
  const governance = Object.hasOwn(provisional, 'learningGovernance')
    ? /** @type {Record<string, unknown>} */ (provisional.learningGovernance)
    : null;
  const projectionRequired = Object.hasOwn(provisional, 'pendingCompletion')
    || (governance !== null && Object.hasOwn(governance, 'projectionCommitment'));
  if (projectionRequired) {
    if (!Object.hasOwn(effect, 'projection')) return { reason: 'effect-unverified' };
    return settleResumedProjection(
      checkpoint,
      /** @type {Record<string, unknown>} */ (inFlight),
      effect,
      provisional,
      predecessorSession,
      ports,
    );
  }
  if (Object.hasOwn(effect, 'projection')) return { reason: 'unknown-effect' };
  return {
    acceptedStateBytes: provisionalBytes,
    acceptedRevision: /** @type {number} */ (checkpoint.acceptedRevision)
      + (provisionalBytes === acceptedBytes ? 0 : 1),
    // Accepted authority that did not move cannot spend the one permitted correction, so worker
    // handoff carries it verbatim exactly as an unchanged prestate does. Only genuinely different
    // accepted bytes retire it.
    correction: provisionalBytes === acceptedBytes ? predecessor.correction : null,
  };
}

/**
 * Projection replacement is eligible only from the exact permit-bound lane application. The
 * supplied receipt proves that application, while the existing verifier freshly proves both
 * current-run and lane surfaces before any provisional bytes become accepted authority.
 * @param {Record<string, unknown>} checkpoint @param {Record<string, unknown>} inFlight
 * @param {Record<string, unknown>} effect @param {Record<string, unknown>} provisional
 * @param {Record<string, unknown>} predecessorSession @param {ReturnType<typeof trustedPorts>} ports
 */
function settleResumedProjection(checkpoint, inFlight, effect, provisional, predecessorSession, ports) {
  let projection;
  let batch;
  let permit;
  let receipt;
  try {
    projection = exactRecord(
      effect.projection,
      ['input', 'projectionBatch', 'permit', 'receipt'],
      [],
      'host adapter resume input.effect.projection',
    );
    batch = /** @type {Record<string, unknown>} */ (
      validateProjectionBatchV1(
        projection.projectionBatch,
        'host adapter resume input.effect.projection.projectionBatch',
      )
    );
    permit = laneEffectPermit(
      projection.permit,
      'host adapter resume input.effect.projection.permit',
    );
    receipt = /** @type {Record<string, unknown>} */ (
      validateLightweightAtomicReceiptV1(
        projection.receipt,
        'host adapter resume input.effect.projection.receipt',
      )
    );
  } catch {
    return { reason: 'unknown-effect' };
  }
  const provisionalStateHash = sha256(canonicalJson(provisional));
  if (inFlight.semanticOperation !== 'apply-lane-effect'
    || permit.kind !== 'lane-projection'
    || canonicalJson(permit.target) !== canonicalJson(checkpoint.target)
    || permit.subjectRunStateHash !== provisionalStateHash
    || permit.batchIdentity !== batch.batchIdentity
    || receipt.permitHash !== permit.permitHash
    || receipt.mutationIdentity !== permit.mutationIdentity
    || receipt.targetMappingHash !== permit.targetMappingHash
    || receipt.lanePrestateHash !== permit.lanePrestateHash
    || canonicalJson(receipt.target) !== canonicalJson(checkpoint.target)) {
    return { reason: 'unknown-effect' };
  }
  const expectation = {
    semanticOperation: 'apply-lane-effect',
    ...permitApplicationExpectation(
      /** @type {Record<string, unknown>} */ (checkpoint.target),
      provisionalStateHash,
      permit,
    ),
    provisionalStateHash,
  };
  if (canonicalJson(inFlight) !== canonicalJson(expectation)
    || effect.effectIdentity !== expectation.expectedEffectIdentity
    || effect.receiptIdentity !== expectation.expectedReceiptIdentity) {
    return { reason: 'unknown-effect' };
  }

  let verified;
  try {
    const effectKind = Object.hasOwn(provisional, 'pendingCompletion')
      ? 'completion-retention'
      : 'projection';
    const verificationEffect = pendingEffect(
      predecessorSession,
      provisional,
      batch,
      effectKind,
      'apply-lane-effect',
    );
    const verificationSession = /** @type {Record<string, unknown>} */ (
      advanceHost(predecessorSession, { pendingEffect: verificationEffect })
    );
    if (effectKind === 'completion-retention') {
      const response = invokeRuntime(
        ports,
        verificationSession,
        'settle-effect',
        'complete',
        {
          mode: 'finalize',
          state: clone(provisional),
          input: projection.input,
          projectionBatch: clone(batch),
        },
      );
      verified = /** @type {Record<string, unknown>} */ (
        handleCompletionSettlement(verificationSession, response)
      );
    } else {
      const response = invokeRuntime(
        ports,
        verificationSession,
        'settle-effect',
        'transition',
        {
          mode: 'verify-projection',
          state: clone(provisional),
          input: projection.input,
          projectionBatch: clone(batch),
        },
      );
      verified = /** @type {Record<string, unknown>} */ (
        handleProjectionSettlement(verificationSession, response)
      );
    }
  } catch (error) {
    return {
      reason: error instanceof RuntimeIncident ? error.message : 'runtime-output-malformed',
    };
  }
  if (verified.outcome !== 'accepted') return { reason: verified.reason };
  const session = /** @type {Record<string, unknown>} */ (verified.session);
  return {
    acceptedStateBytes: session.acceptedStateBytes,
    acceptedRevision: session.acceptedRevision,
    correction: session.correction,
  };
}
