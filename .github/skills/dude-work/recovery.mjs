// @ts-check

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import {
  parseFrontmatterScalars,
  parseSpecIdentity,
  resolveSpecIdentity,
} from '../dude-engine/lib/feature-identity.mjs';
import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseTaskState } from '../dude-engine/lib/task-state.mjs';
import { parseTasks, parseVisibleTasks } from '../dude-engine/lib/tasks.mjs';
import { resolveWorkspacePath } from '../dude-engine/lib/workspace-paths.mjs';

const SOURCES = Object.freeze([
  'owner-log',
  'task-history',
  'definition-plan',
  'lane-history',
  'current-run',
  'review',
  'verification',
  'lint',
  'session',
]);
const SOURCE_INDEX = new Map(SOURCES.map((source, index) => [source, index]));
const EVIDENCE_STATUSES = Object.freeze([
  'present',
  'missing',
  'malformed',
  'stale',
  'conflict',
  'overflow',
  'nontext',
]);
const ACTIONS = Object.freeze([
  'execute-task',
  'retry-task',
  'address-test',
  'address-review',
  'reconcile-derived-definition',
  'retain-learning',
  'none',
]);
export const BLOCKER_CODES = Object.freeze([
  'ambiguous-state',
  'evidence-incomplete',
  'clarification-required',
  'approval-required',
  'external-dependency',
  'safety-or-authority',
  'verification-failed',
  'review-rejected',
  'tracked-definition-recovery-unsupported',
  'objective-source-conflict',
]);
const OUTCOMES = Object.freeze(['succeeded', 'blocked', 'failed', 'interrupted', 'no-change']);
const CURRENT_RUN_STATES = Object.freeze([
  'clarification-required',
  'approval-required',
  'external-dependency',
  'safety-or-authority',
  'blocked',
  'failed',
  'succeeded',
  'interrupted',
]);
const REVIEW_STATES = Object.freeze(['none', 'accepted', 'rejected']);
const CHECK_STATES = Object.freeze(['none', 'passed', 'failed']);
const COMPLETION_CHECKS = Object.freeze(['verification', 'lint', 'review']);
const ACTION_ROUTES = Object.freeze({
  'address-review': 'review-remediation',
  'address-test': 'test-repair',
  'reconcile-derived-definition': 'definition-reconciliation',
  'retain-learning': 'retention',
});
export const requiredChecksForAction = Object.freeze({
  'execute-task': Object.freeze(['verification']),
  'retry-task': Object.freeze(['verification']),
  'address-test': Object.freeze(['lint', 'verification']),
  'address-review': Object.freeze(['review', 'verification']),
  'reconcile-derived-definition': Object.freeze(['lint', 'review', 'verification']),
  'retain-learning': Object.freeze(['lint']),
  none: Object.freeze([]),
});
const PRESENTATION_FIELDS = Object.freeze({
  'current-run': Object.freeze(['eventId', 'timestamp', 'summary', 'rationale']),
  review: Object.freeze(['reviewId', 'timestamp', 'summary', 'rationale']),
  verification: Object.freeze(['runId', 'timestamp', 'summary', 'rationale']),
  lint: Object.freeze(['runId', 'timestamp', 'summary', 'rationale']),
});
const WORK_TRIGGERS = Object.freeze([
  'start',
  'resume',
  'post-block',
  'post-failure',
  'explicit-inspection',
]);
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SPEC_PATH_PATTERN = /^\.dude\/specs\/\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md$/;
const TASK_KEY_PATTERN = /^T\d{3,}@[a-z0-9]{8}$/;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9.:/_@-]{0,255}$/;
const MAX_CLI_REQUEST_BYTES = 6_291_456;
const MAX_SOURCE_BODY_BYTES = 1_048_576;
const MAX_INSPECTION_BODY_BYTES = 4_194_304;
const MAX_SOURCE_ENTRIES = 64;
const MAX_RETAINED_DESCRIPTORS = 64;
const MAX_ERROR_JSON_BYTES = 8_192;
const MAX_PACKET_ITEMS = 16;
const MAX_PACKET_BYTES = 65_536;
const MAX_REGISTRY_ENTRIES = 64;
const MAX_RUNTIME_RESULT_DEPTH = 32;
const MAX_RUNTIME_RESULT_ENTRIES = 4096;
const MAX_LEARNING_GOVERNANCE_BYTES = 32_768;
const MAX_DEFINITION_REVISION_PROPOSAL_BYTES = 32_768;
const MAX_DEFINITION_REVISION_COMPONENT_BYTES = 131_072;
const MAX_DEFINITION_REVISION_PROOF_BYTES = 262_144;
const MAX_DEFINITION_REVISION_REVIEW_BYTES = 262_144;
const MAX_DEFINITION_REVISION_ROWS = 64;
const DEFINITION_OBLIGATION_CATEGORIES = Object.freeze([
  'acceptance',
  'failure',
  'meaning-of-done',
  'outcome',
  'quality',
  'safety',
  'scope',
]);
const DEFINITION_SPEC_EDIT_CLASSES = Object.freeze([
  'none',
  'contradiction-clarification',
  'accidental-execution-constraint-relocation-or-replacement',
  'verified-execution-assumption',
]);
const DEFINITION_TASK_RECONCILIATION_DISPOSITIONS = Object.freeze([
  'one-to-one-kept',
  'changed',
  'split',
  'merged',
  'dropped',
  'dropped-defective',
  'new',
]);
const DEFINITION_REVISION_REVIEW_ENVELOPE_TYPE = 'definition-revision-semantic-review-envelope';
const DEFINITION_RECOVERY_ARCHIVE_PREFIX = '- dude-definition-recovery-archive: ';
// Assembled by concatenation so no literal active registry marker line ever appears in source.
const OBJECTIVE_REGISTRY_START = '<' + '!-- dude:objective-registry:start --' + '>';
const OBJECTIVE_REGISTRY_END = '<' + '!-- dude:objective-registry:end --' + '>';
const TRACKED_STATUSES = Object.freeze(['open', 'in_progress', 'blocked', 'closed']);
const TRACKED_DETAIL_FIELDS = Object.freeze([
  'design',
  'acceptance_criteria',
  'notes',
  'priority',
  'owner',
  'created_at',
  'created_by',
  'updated_at',
  'metadata',
  'labels',
]);

/** @param {string} label @param {string} message @returns {never} */
function invalid(label, message) {
  throw new TypeError(`${label} ${message}`);
}

/** @param {unknown} value @param {string} label */
function assertUnicodeScalarString(value, label) {
  if (typeof value !== 'string') invalid(label, 'must be a string');
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid(label, 'contains an unpaired surrogate');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      invalid(label, 'contains an unpaired surrogate');
    }
  }
}

/** @param {unknown} value @param {string} label @returns {Record<string, unknown>} */
function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(label, 'must be an object');
  }
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

/** @param {unknown} value @param {string} label @param {Set<object>} [ancestors] */
function assertProxyFreeDataGraph(value, label, ancestors = new Set()) {
  if (value === null || typeof value !== 'object') return;
  if (utilTypes.isProxy(value)) invalid(label, 'must not contain a Proxy');
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return;
  if (ancestors.has(value)) invalid(label, 'must not contain a cycle');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const rows = assertDenseDataArray(value, label);
      rows.forEach((row, index) => assertProxyFreeDataGraph(row, `${label}[${index}]`, ancestors));
      return;
    }
    const record = assertRecord(value, label);
    for (const key of Object.keys(record)) {
      assertProxyFreeDataGraph(record[key], `${label}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

/** Detach one bounded JSON data graph without invoking caller code. @param {unknown} value @param {string} label */
function detachRuntimeData(value, label) {
  const active = new WeakSet();
  let entries = 0;
  let scalarBytes = 0;
  /** @param {string} text */
  const charge = (text) => {
    scalarBytes += Buffer.byteLength(text);
    if (scalarBytes > MAX_CLI_REQUEST_BYTES) {
      invalid(label, `exceeds the resource limit of ${MAX_CLI_REQUEST_BYTES} bytes`);
    }
  };
  /** @param {unknown} current @param {number} depth @param {string} path */
  const visit = (current, depth, path) => {
    if (depth > MAX_RUNTIME_RESULT_DEPTH) {
      invalid(label, `exceeds the maximum depth of ${MAX_RUNTIME_RESULT_DEPTH}`);
    }
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'string') {
      assertUnicodeScalarString(current, path);
      charge(current);
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) invalid(path, 'must be a finite JSON number');
      return current;
    }
    if (typeof current !== 'object') invalid(path, 'must contain only JSON data');
    if (utilTypes.isProxy(current)) invalid(path, 'must not contain a Proxy');
    if (active.has(current)) invalid(path, 'must not contain a cycle');
    active.add(current);
    if (Array.isArray(current)) {
      const rows = assertDenseDataArray(current, path);
      entries += rows.length;
      if (entries > MAX_RUNTIME_RESULT_ENTRIES) {
        invalid(label, `exceeds the maximum entry count of ${MAX_RUNTIME_RESULT_ENTRIES}`);
      }
      const detached = rows.map((row, index) => visit(row, depth + 1, `${path}[${index}]`));
      active.delete(current);
      return detached;
    }
    const source = assertRecord(current, path);
    const keys = Object.keys(source);
    entries += keys.length;
    if (entries > MAX_RUNTIME_RESULT_ENTRIES) {
      invalid(label, `exceeds the maximum entry count of ${MAX_RUNTIME_RESULT_ENTRIES}`);
    }
    const detached = {};
    for (const key of keys) {
      charge(key);
      detached[key] = visit(source[key], depth + 1, `${path}.${key}`);
    }
    active.delete(current);
    return detached;
  };
  const detached = visit(value, 0, label);
  const bytes = canonicalJson(detached);
  if (Buffer.byteLength(bytes) > MAX_CLI_REQUEST_BYTES) {
    invalid(label, `exceeds the resource limit of ${MAX_CLI_REQUEST_BYTES} bytes`);
  }
  return JSON.parse(bytes);
}

/**
 * @param {unknown} value
 * @param {string[]} required
 * @param {string[]} optional
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function assertExactRecord(value, required, optional, label) {
  const record = assertRecord(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) invalid(label, `contains unknown field '${key}'`);
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) invalid(label, `is missing field '${key}'`);
  }
  return record;
}

/** @param {unknown} value */
function validateDependencies(value) {
  const dependencies = value === undefined
    ? {}
    : assertExactRecord(value, [], ['normalizeTrackedEvidence'], 'dependencies');
  if (Object.hasOwn(dependencies, 'normalizeTrackedEvidence')
    && typeof dependencies.normalizeTrackedEvidence !== 'function') {
    invalid('dependencies.normalizeTrackedEvidence', 'must be a function');
  }
  return dependencies;
}

/** @param {unknown} value @param {readonly string[]} values @param {string} label */
function assertEnum(value, values, label) {
  if (typeof value !== 'string' || !values.includes(value)) {
    invalid(label, `must be one of ${values.join(', ')}`);
  }
}

/** @param {unknown} value @param {string} label @param {boolean} positive */
function assertSafeInteger(value, label, positive) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || (positive ? value < 1 : value < 0)) {
    invalid(label, `must be a ${positive ? 'positive' : 'nonnegative'} safe integer`);
  }
}

/** @param {unknown} value @param {string} label */
function assertCanonicalInteger(value, label) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    invalid(label, 'must be a safe integer other than -0');
  }
}

/** @param {string} left @param {string} right */
function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/** @param {unknown} value @param {string} label */
function assertHash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    invalid(label, 'must be a lowercase SHA-256 hash');
  }
}

// A hostile [[Prototype]] leaves canonical bytes unchanged while redirecting
// every method lookup a later reader performs on the raw value.
/** @param {unknown} value @param {string} label */
function assertPlainArrayPrototype(value, label) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) invalid(label, 'must be a plain array');
}

/** @param {unknown} value @param {string} label @returns {unknown[]} */
function assertDenseDataArray(value, label) {
  if (!Array.isArray(value)) invalid(label, 'must be an array');
  assertPlainArrayPrototype(value, label);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)
    || lengthDescriptor.enumerable || lengthDescriptor.configurable) {
    invalid(label, 'array length must be an own non-enumerable data property');
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    invalid(label, 'array length must be a nonnegative safe integer');
  }
  /** @type {Map<number, unknown>} */
  const indexedValues = new Map();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid(label, 'array must not contain symbol properties');
    if (key === 'length') continue;
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) invalid(label, `array contains extra property '${key}'`);
    const index = Number(key);
    if (!Number.isSafeInteger(index) || String(index) !== key || index >= length) {
      invalid(label, `array contains extra property '${key}'`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      invalid(label, `array index '${key}' must be an enumerable data property`);
    }
    indexedValues.set(index, descriptor.value);
  }
  if (indexedValues.size !== length) invalid(label, 'must not contain a sparse array');
  const values = [];
  for (let index = 0; index < length; index += 1) {
    if (!indexedValues.has(index)) invalid(label, 'must not contain a sparse array');
    values.push(indexedValues.get(index));
  }
  return values;
}

/** @param {unknown} value @param {string} label */
function assertDenseDataArrayLength(value, label) {
  if (!Array.isArray(value)) invalid(label, 'must be an array');
  assertPlainArrayPrototype(value, label);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)
    || lengthDescriptor.enumerable || lengthDescriptor.configurable) {
    invalid(label, 'array length must be an own non-enumerable data property');
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    invalid(label, 'array length must be a nonnegative safe integer');
  }
  let indexedCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') invalid(label, 'array must not contain symbol properties');
    if (key === 'length') continue;
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) invalid(label, `array contains extra property '${key}'`);
    const index = Number(key);
    if (!Number.isSafeInteger(index) || String(index) !== key || index >= length) {
      invalid(label, `array contains extra property '${key}'`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      invalid(label, `array index '${key}' must be an enumerable data property`);
    }
    indexedCount += 1;
  }
  if (indexedCount !== length) invalid(label, 'must not contain a sparse array');
  return length;
}

/** @param {unknown} value @param {(value: string, label: string) => void} validate @param {string} label */
function assertSortedUniqueStrings(value, validate, label) {
  const values = assertDenseDataArray(value, label);
  for (let index = 0; index < values.length; index += 1) {
    validate(/** @type {string} */ (values[index]), `${label}[${index}]`);
    if (index > 0 && compareUtf8(/** @type {string} */ (values[index - 1]), /** @type {string} */ (values[index])) >= 0) {
      invalid(label, 'must be sorted and duplicate-free');
    }
  }
  return values;
}

/** @param {string} value @param {string} label */
function assertSubject(value, label) {
  assertUnicodeScalarString(value, label);
  const bytes = Buffer.byteLength(value);
  if (bytes < 1 || bytes > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    invalid(label, 'must be a nonempty canonical identifier without controls');
  }
}

/** @param {string} value @param {string} label */
function assertMaterialIdentifier(value, label) {
  assertUnicodeScalarString(value, label);
  if (!IDENTIFIER_PATTERN.test(value) || value.includes('\\')) {
    invalid(label, 'must be a normalized action identifier');
  }
  if (value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    invalid(label, 'must not contain empty, dot, or dot-dot path segments');
  }
}

/** @param {unknown} value @param {string} label */
function assertMaterialTarget(value, label) {
  assertSubject(/** @type {string} */ (value), label);
  if (/** @type {string} */ (value).includes('\\')) invalid(label, 'must use forward slashes');
  const segments = /** @type {string} */ (value).split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    invalid(label, 'must not contain empty, dot, or dot-dot path segments');
  }
}

/** @param {unknown} value @param {Set<object>} ancestors @param {string} label @returns {string} */
function serializeCanonical(value, ancestors, label) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, label);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    assertCanonicalInteger(value, label);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') invalid(label, 'contains a non-JSON value');
  if (ancestors.has(value)) invalid(label, 'must not contain a cycle');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const values = assertDenseDataArray(value, label);
      const entries = [];
      for (let index = 0; index < values.length; index += 1) {
        entries.push(serializeCanonical(values[index], ancestors, `${label}[${index}]`));
      }
      return `[${entries.join(',')}]`;
    }
    const record = assertRecord(value, label);
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => {
      assertUnicodeScalarString(key, `${label} key`);
      return `${JSON.stringify(key)}:${serializeCanonical(record[key], ancestors, `${label}.${key}`)}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Canonically serialize a JSON value. @param {unknown} value */
export function canonicalJson(value) {
  return serializeCanonical(value, new Set(), 'value');
}

/** Hash bytes, or the complete UTF-8 bytes of a string. @param {string | ArrayBuffer | ArrayBufferView} value */
export function sha256(value) {
  /** @type {Buffer} */
  let bytes;
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, 'hash input');
    bytes = Buffer.from(value);
  } else if (value instanceof ArrayBuffer) {
    bytes = Buffer.from(value);
  } else if (ArrayBuffer.isView(value)) {
    bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  } else {
    invalid('hash input', 'must be a string or byte sequence');
  }
  return createHash('sha256').update(bytes).digest('hex');
}

/** Describe complete content without retaining it. @param {string | ArrayBuffer | ArrayBufferView} value */
export function contentDescriptor(value) {
  if (typeof value === 'string') assertUnicodeScalarString(value, 'content');
  const bytes = typeof value === 'string'
    ? Buffer.from(value)
    : value instanceof ArrayBuffer
      ? Buffer.from(value)
      : ArrayBuffer.isView(value)
        ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        : invalid('content', 'must be a string or byte sequence');
  return { sha256: sha256(bytes), byteLength: bytes.byteLength };
}

/** @param {unknown} value @returns {Buffer | null} */
function byteSequence(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

/** @param {unknown} value @returns {{bytes:Buffer|null,text:string|null}} */
function decodeCapturedBytes(value) {
  const bytes = byteSequence(value);
  if (!bytes) return { bytes: null, text: null };
  try {
    return { bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { bytes, text: null };
  }
}

/** @param {unknown} value @param {string} label */
function parseCanonicalJsonBytes(value, label) {
  const bytes = byteSequence(value);
  if (!bytes) invalid(label, 'must be a captured byte sequence');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    invalid(label, 'must be strict UTF-8 canonical JSON');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid(label, 'must contain one canonical JSON value');
  }
  let canonical;
  try {
    canonical = canonicalJson(parsed);
  } catch {
    invalid(label, 'must contain a value in the canonical JSON domain');
  }
  if (!Buffer.from(canonical).equals(bytes)) {
    invalid(label, 'must use the exact canonical JSON representation');
  }
  return parsed;
}

/** @returns {{used:number}} */
function createBodyBudget() {
  return { used: 0 };
}

/** @param {number} byteLength @param {string} label @param {{used:number}} budget */
function chargeBodyLength(byteLength, label, budget) {
  if (byteLength > MAX_SOURCE_BODY_BYTES) {
    invalid(label, `exceeds the individual source body resource limit of ${MAX_SOURCE_BODY_BYTES} bytes`);
  }
  if (byteLength > MAX_INSPECTION_BODY_BYTES - budget.used) {
    invalid(label, `exceeds the aggregate inspection body resource limit of ${MAX_INSPECTION_BODY_BYTES} bytes`);
  }
  budget.used += byteLength;
}

/** @param {unknown} value @param {string} label @param {{used:number}} budget */
function chargeByteSequence(value, label, budget) {
  const bytes = byteSequence(value);
  if (bytes) chargeBodyLength(bytes.byteLength, label, budget);
}

/** @param {Record<string, unknown>} raw */
function validateDeclaredJsonCaptures(raw) {
  const lane = assertRecord(raw.lane, 'rawInputs.lane');
  if (lane.kind === 'tracked') {
    parseCanonicalJsonBytes(lane.listBytes, 'tracked list captured JSON');
    const issues = assertDenseDataArray(lane.issues, 'rawInputs.lane.issues');
    for (let index = 0; index < issues.length; index += 1) {
      const issue = assertExactRecord(
        issues[index],
        ['detailBytes', 'historyBytes'],
        [],
        `rawInputs.lane.issues[${index}]`,
      );
      parseCanonicalJsonBytes(issue.detailBytes, `tracked detail captured JSON[${index}]`);
      parseCanonicalJsonBytes(issue.historyBytes, `tracked history captured JSON[${index}]`);
    }
  }
  for (const [field, source] of [
    ['currentRun', 'current-run'],
    ['review', 'review'],
    ['verification', 'verification'],
    ['lint', 'lint'],
  ]) {
    if (!Object.hasOwn(raw, field)) continue;
    const entries = assertDenseDataArray(raw[field], `rawInputs.${field}`);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = assertExactRecord(
        entries[index],
        ['target', 'state', 'outcomeHash', 'bytes'],
        [],
        `rawInputs.${field}[${index}]`,
      );
      parseCanonicalJsonBytes(entry.bytes, `${source} captured JSON`);
    }
  }
}

/**
 * @param {string} source
 * @param {boolean} required
 * @param {string} status
 * @param {string | Buffer} body
 * @param {boolean} [textual]
 */
function acquiredEvidence(source, required, status, body, textual = true) {
  const item = { source, required, status, ...contentDescriptor(body) };
  return textual ? { ...item, text: /** @type {string} */ (body) } : item;
}

/** @param {string} source @param {boolean} required @param {boolean} [textual] */
function missingEvidence(source, required, textual = true) {
  return acquiredEvidence(source, required, 'missing', '', textual);
}

/** @param {string} text */
function logicalLines(text) {
  /** @type {{text:string,start:number,end:number}[]} */
  const lines = [];
  let start = 0;
  for (const match of text.matchAll(/\r\n|\n|\r/g)) {
    const matchStart = /** @type {number} */ (match.index);
    const end = matchStart + match[0].length;
    lines.push({ text: text.slice(start, matchStart), start, end });
    start = end;
  }
  lines.push({ text: text.slice(start), start, end: text.length });
  return lines;
}

/** @param {string} text @returns {{text:string|null,malformed:boolean}} */
function extractCoordinatorLog(text) {
  const lines = logicalLines(text);
  /** @type {{character:string,length:number}|null} */
  let fence = null;
  /** @type {number[]} */
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].text;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { character: open[1][0], length: open[1].length };
      continue;
    }
    if (/^ {0,3}##[ \t]+Coordinator Log(?:[ \t]+#+)?[ \t]*$/.test(line)) headings.push(index);
  }
  if (headings.length !== 1) return { text: null, malformed: true };

  const headingIndex = headings[0];
  let endOffset = text.length;
  fence = null;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].text;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { character: open[1][0], length: open[1].length };
      continue;
    }
    if (/^ {0,3}#{1,2}[ \t]+/.test(line)) {
      endOffset = lines[index].start;
      break;
    }
  }
  return { text: text.slice(lines[headingIndex].start, endOffset), malformed: false };
}

/** @param {unknown} value @param {string} label */
function assertDirectIdeaPath(value, label) {
  if (typeof value !== 'string' || !/^\.dude\/ideas\/[^/]+\.md$/.test(value)) {
    invalid(label, 'must be a direct canonical idea path');
  }
}

const REGISTRY_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:/@-]{0,127}$/;
const CANONICAL_DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;

/** @param {unknown} value @param {string} label */
function assertRegistryIdentifier(value, label) {
  assertUnicodeScalarString(value, label);
  if (!REGISTRY_IDENTIFIER_PATTERN.test(/** @type {string} */ (value))) {
    invalid(label, 'must be a canonical registry identifier');
  }
}

/** @param {unknown} value @param {string} label */
function assertShortText(value, label) {
  assertUnicodeScalarString(value, label);
  const bytes = Buffer.byteLength(/** @type {string} */ (value));
  if (bytes < 1 || bytes > 1024) invalid(label, 'must contain 1 through 1,024 UTF-8 bytes');
}

/** @param {unknown} value @param {string} label */
function assertNormalizedWorkspacePath(value, label) {
  assertUnicodeScalarString(value, label);
  const text = /** @type {string} */ (value);
  const bytes = Buffer.byteLength(text);
  if (bytes < 1 || bytes > 512 || text.includes('\\') || /[\u0000-\u001f\u007f-\u009f]/.test(text)) {
    invalid(label, 'must be a normalized workspace path of at most 512 UTF-8 bytes');
  }
  if (text.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    invalid(label, 'must not contain empty, dot, or dot-dot path segments');
  }
}

/** @param {unknown} value @param {string} label */
function assertConstraintTarget(value, label) {
  assertUnicodeScalarString(value, label);
  const text = /** @type {string} */ (value);
  const bytes = Buffer.byteLength(text);
  if (bytes < 1 || bytes > 512 || /[\u0000-\u001f\u007f-\u009f]/.test(text)) {
    invalid(label, 'must be a normalized path or canonical target identifier of at most 512 UTF-8 bytes');
  }
}

/** @param {unknown} value @param {string} label @param {boolean} nonnegative */
function assertCanonicalDecimal(value, label, nonnegative) {
  assertUnicodeScalarString(value, label);
  const text = /** @type {string} */ (value);
  if (Buffer.byteLength(text) > 64 || !CANONICAL_DECIMAL_PATTERN.test(text) || text === '-0') {
    invalid(label, 'must be a canonical decimal');
  }
  const negative = text.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? text.slice(1) : text).split('.');
  if (intPart.length > 30 || fracPart.length > 18) invalid(label, 'exceeds the canonical decimal digit bounds');
  if (nonnegative && negative) invalid(label, 'must be nonnegative');
}

/** @param {string} left @param {string} right */
function compareNonnegativeDecimals(left, right) {
  const [leftInt, leftFrac = ''] = left.split('.');
  const [rightInt, rightFrac = ''] = right.split('.');
  const scale = Math.max(leftFrac.length, rightFrac.length);
  const leftValue = BigInt(leftInt + leftFrac.padEnd(scale, '0'));
  const rightValue = BigInt(rightInt + rightFrac.padEnd(scale, '0'));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

/** @param {unknown} value @param {string} label */
function validateRubric(value, label) {
  const rubric = assertExactRecord(value, ['id', 'criteria'], [], label);
  assertRegistryIdentifier(rubric.id, `${label}.id`);
  const criteria = assertDenseDataArray(rubric.criteria, `${label}.criteria`);
  if (criteria.length < 1 || criteria.length > 16) invalid(`${label}.criteria`, 'must contain 1 through 16 rows');
  const ids = new Set();
  let totalTextBytes = 0;
  criteria.forEach((criterionValue, index) => {
    const criterion = assertExactRecord(criterionValue, ['id', 'text'], [], `${label}.criteria[${index}]`);
    assertRegistryIdentifier(criterion.id, `${label}.criteria[${index}].id`);
    if (ids.has(criterion.id)) invalid(`${label}.criteria[${index}].id`, 'must be unique');
    ids.add(criterion.id);
    assertShortText(criterion.text, `${label}.criteria[${index}].text`);
    totalTextBytes += Buffer.byteLength(/** @type {string} */ (criterion.text));
  });
  if (totalTextBytes > 8192) invalid(`${label}.criteria`, 'total criterion text exceeds 8,192 UTF-8 bytes');
  if (Buffer.byteLength(canonicalJson(rubric)) > 16384) invalid(label, 'canonical rubric exceeds 16,384 UTF-8 bytes');
}

/** @param {unknown} value @param {string} kind @param {string} label @returns {number} */
function validateComparator(value, kind, label) {
  const comparator = assertRecord(value, label);
  if (comparator.mode === 'numeric') {
    const numeric = assertExactRecord(
      value,
      ['mode', 'unit', 'direction', 'sampleCount', 'aggregation', 'tolerance', 'meaningfulThreshold'],
      [],
      label,
    );
    if (kind !== 'numeric') invalid(`${label}.mode`, 'numeric comparator requires the numeric contract kind');
    assertRegistryIdentifier(numeric.unit, `${label}.unit`);
    assertEnum(numeric.direction, ['maximize', 'minimize'], `${label}.direction`);
    if (!Number.isSafeInteger(numeric.sampleCount) || /** @type {number} */ (numeric.sampleCount) < 1
      || /** @type {number} */ (numeric.sampleCount) > 15 || /** @type {number} */ (numeric.sampleCount) % 2 === 0) {
      invalid(`${label}.sampleCount`, 'must be a fixed odd integer from 1 through 15');
    }
    if (numeric.aggregation !== 'median') invalid(`${label}.aggregation`, 'must be the literal median');
    assertCanonicalDecimal(numeric.tolerance, `${label}.tolerance`, true);
    assertCanonicalDecimal(numeric.meaningfulThreshold, `${label}.meaningfulThreshold`, true);
    if (numeric.meaningfulThreshold === '0'
      || compareNonnegativeDecimals(
        /** @type {string} */ (numeric.meaningfulThreshold),
        /** @type {string} */ (numeric.tolerance),
      ) <= 0) {
      invalid(`${label}.meaningfulThreshold`, 'must be positive and strictly greater than tolerance');
    }
    return 1;
  }
  if (comparator.mode === 'ordinal-levels') {
    const ordinal = assertExactRecord(value, ['mode', 'levels', 'meaningfulSteps'], [], label);
    if (kind !== 'ordinal') invalid(`${label}.mode`, 'ordinal-levels comparator requires the ordinal contract kind');
    const levels = assertDenseDataArray(ordinal.levels, `${label}.levels`);
    if (levels.length < 2 || levels.length > 32) invalid(`${label}.levels`, 'must contain 2 through 32 levels');
    const seen = new Set();
    levels.forEach((level, index) => {
      assertRegistryIdentifier(level, `${label}.levels[${index}]`);
      if (seen.has(level)) invalid(`${label}.levels`, 'must contain unique levels');
      seen.add(level);
    });
    if (!Number.isSafeInteger(ordinal.meaningfulSteps) || /** @type {number} */ (ordinal.meaningfulSteps) < 1
      || /** @type {number} */ (ordinal.meaningfulSteps) >= levels.length) {
      invalid(`${label}.meaningfulSteps`, 'must be positive and less than the level count');
    }
    return 1;
  }
  if (comparator.mode === 'ordinal-pairwise') {
    const pairwise = assertExactRecord(value, ['mode', 'rubric'], [], label);
    if (kind !== 'ordinal') invalid(`${label}.mode`, 'ordinal-pairwise comparator requires the ordinal contract kind');
    validateRubric(pairwise.rubric, `${label}.rubric`);
    return 2;
  }
  if (comparator.mode === 'subjective') {
    const subjective = assertExactRecord(value, ['mode', 'rubric'], [], label);
    if (kind !== 'subjective') invalid(`${label}.mode`, 'subjective comparator requires the subjective contract kind');
    validateRubric(subjective.rubric, `${label}.rubric`);
    return 2;
  }
  return invalid(`${label}.mode`, 'must be a supported comparator variant');
}

/** @param {unknown} value @param {number} requiredCount @param {string} label */
function validateEvaluators(value, requiredCount, label) {
  const evaluators = assertDenseDataArray(value, label);
  if (evaluators.length !== requiredCount) {
    invalid(label, `must contain exactly ${requiredCount} evaluator${requiredCount === 1 ? '' : 's'}`);
  }
  /** @type {{id:string,version:string}|null} */
  let previous = null;
  evaluators.forEach((evaluatorValue, index) => {
    const evaluator = assertExactRecord(evaluatorValue, ['id', 'version'], [], `${label}[${index}]`);
    assertRegistryIdentifier(evaluator.id, `${label}[${index}].id`);
    assertRegistryIdentifier(evaluator.version, `${label}[${index}].version`);
    if (previous) {
      const order = compareUtf8(previous.id, /** @type {string} */ (evaluator.id))
        || compareUtf8(previous.version, /** @type {string} */ (evaluator.version));
      if (order >= 0) invalid(label, 'must contain distinct evaluators sorted by id then version');
    }
    previous = { id: /** @type {string} */ (evaluator.id), version: /** @type {string} */ (evaluator.version) };
  });
}

/** @param {unknown} value @param {string} label */
function validateContractInputs(value, label) {
  const inputs = assertDenseDataArray(value, label);
  if (inputs.length < 1 || inputs.length > 16) invalid(label, 'must contain 1 through 16 rows');
  /** @type {string|null} */
  let previousId = null;
  inputs.forEach((inputValue, index) => {
    const rowLabel = `${label}[${index}]`;
    const row = assertRecord(inputValue, rowLabel);
    assertEnum(row.kind, ['file', 'value'], `${rowLabel}.kind`);
    const fields = row.kind === 'file' ? ['id', 'kind', 'path', 'sha256'] : ['id', 'kind', 'valueHash'];
    const validated = assertExactRecord(inputValue, fields, [], rowLabel);
    assertRegistryIdentifier(validated.id, `${rowLabel}.id`);
    if (row.kind === 'file') {
      assertNormalizedWorkspacePath(validated.path, `${rowLabel}.path`);
      assertHash(validated.sha256, `${rowLabel}.sha256`);
    } else {
      assertHash(validated.valueHash, `${rowLabel}.valueHash`);
    }
    const id = /** @type {string} */ (validated.id);
    if (previousId !== null && compareUtf8(previousId, id) >= 0) invalid(label, 'must be sorted by id and duplicate-free');
    previousId = id;
  });
}

/** @param {unknown} value @param {string} label */
function validateEnvironment(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length < 1 || rows.length > 16) invalid(label, 'must contain 1 through 16 rows');
  /** @type {string|null} */
  let previousId = null;
  rows.forEach((rowValue, index) => {
    const row = assertExactRecord(rowValue, ['id', 'valueHash'], [], `${label}[${index}]`);
    assertRegistryIdentifier(row.id, `${label}[${index}].id`);
    assertHash(row.valueHash, `${label}[${index}].valueHash`);
    if (previousId !== null && compareUtf8(previousId, /** @type {string} */ (row.id)) >= 0) {
      invalid(label, 'must be sorted by id and duplicate-free');
    }
    previousId = /** @type {string} */ (row.id);
  });
}

/** @param {unknown} value @param {string} label */
function validateConditions(value, label) {
  const conditions = assertDenseDataArray(value, label);
  if (conditions.length < 1 || conditions.length > 16) invalid(label, 'must contain 1 through 16 ids');
  /** @type {string|null} */
  let previous = null;
  conditions.forEach((condition, index) => {
    assertRegistryIdentifier(condition, `${label}[${index}]`);
    if (previous !== null && compareUtf8(previous, /** @type {string} */ (condition)) >= 0) {
      invalid(label, 'must be sorted and duplicate-free');
    }
    previous = /** @type {string} */ (condition);
  });
}

/** @param {unknown} value @param {string} label */
function validateContractBudget(value, label) {
  const budget = assertExactRecord(value, ['comparisons', 'durationMs', 'tokens', 'costMicrounits'], [], label);
  if (!Number.isSafeInteger(budget.comparisons) || Object.is(budget.comparisons, -0)
    || /** @type {number} */ (budget.comparisons) < 1 || /** @type {number} */ (budget.comparisons) > 64) {
    invalid(`${label}.comparisons`, 'must be a safe integer from 1 through 64');
  }
  assertSafeInteger(budget.durationMs, `${label}.durationMs`, false);
  assertSafeInteger(budget.tokens, `${label}.tokens`, false);
  assertSafeInteger(budget.costMicrounits, `${label}.costMicrounits`, false);
}

/** @param {unknown} value @param {string} label */
function validateHardConstraints(value, label) {
  const constraints = assertDenseDataArray(value, label);
  if (constraints.length > 16) invalid(label, 'must contain 0 through 16 rows');
  /** @type {{kind:string,id:string,target:string}|null} */
  let previous = null;
  constraints.forEach((constraintValue, index) => {
    const constraint = assertExactRecord(constraintValue, ['kind', 'id', 'target'], [], `${label}[${index}]`);
    assertEnum(constraint.kind, ['lint', 'verification'], `${label}[${index}].kind`);
    assertRegistryIdentifier(constraint.id, `${label}[${index}].id`);
    if (constraint.id === 'candidate-bound-completion') {
      invalid(`${label}[${index}].id`, 'must not use the reserved id candidate-bound-completion');
    }
    assertConstraintTarget(constraint.target, `${label}[${index}].target`);
    if (previous) {
      const order = compareUtf8(previous.kind, /** @type {string} */ (constraint.kind))
        || compareUtf8(previous.id, /** @type {string} */ (constraint.id))
        || compareUtf8(previous.target, /** @type {string} */ (constraint.target));
      if (order >= 0) invalid(label, 'must be sorted by kind, id, then target and duplicate-free');
    }
    previous = {
      kind: /** @type {string} */ (constraint.kind),
      id: /** @type {string} */ (constraint.id),
      target: /** @type {string} */ (constraint.target),
    };
  });
}

/** @param {unknown} value @param {string} label */
function validateTieRule(value, label) {
  const tieRule = assertRecord(value, label);
  if (tieRule.mode === 'discard') {
    assertExactRecord(value, ['mode'], [], label);
  } else if (tieRule.mode === 'independent-review') {
    const rule = assertExactRecord(value, ['mode', 'purpose', 'rubric'], [], label);
    assertEnum(rule.purpose, ['simplicity', 'risk'], `${label}.purpose`);
    validateRubric(rule.rubric, `${label}.rubric`);
  } else {
    invalid(`${label}.mode`, 'must be discard or independent-review');
  }
}

/** Validate one closed EvaluationContract shape. This is the sole owner of contract shape. @param {unknown} value @param {string} [label] */
export function validateEvaluationContract(value, label = 'EvaluationContract') {
  const contract = assertExactRecord(value, [
    'id', 'subject', 'kind', 'evaluators', 'inputs', 'environment',
    'conditions', 'budget', 'hardConstraints', 'tieRule', 'comparator',
  ], [], label);
  assertRegistryIdentifier(contract.id, `${label}.id`);
  assertShortText(contract.subject, `${label}.subject`);
  assertEnum(contract.kind, ['numeric', 'ordinal', 'subjective'], `${label}.kind`);
  const evaluatorCount = validateComparator(contract.comparator, /** @type {string} */ (contract.kind), `${label}.comparator`);
  validateEvaluators(contract.evaluators, evaluatorCount, `${label}.evaluators`);
  validateContractInputs(contract.inputs, `${label}.inputs`);
  validateEnvironment(contract.environment, `${label}.environment`);
  validateConditions(contract.conditions, `${label}.conditions`);
  validateContractBudget(contract.budget, `${label}.budget`);
  validateHardConstraints(contract.hardConstraints, `${label}.hardConstraints`);
  validateTieRule(contract.tieRule, `${label}.tieRule`);
  return value;
}

/** @param {unknown} value @param {Set<string>} allowedRefPaths @param {string} label */
function validateProvenance(value, allowedRefPaths, label) {
  const provenance = assertExactRecord(value, ['kind', 'refs'], [], label);
  assertEnum(provenance.kind, ['idea', 'spec', 'task'], `${label}.kind`);
  const refs = assertDenseDataArray(provenance.refs, `${label}.refs`);
  if (refs.length < 1 || refs.length > 8) invalid(`${label}.refs`, 'must contain 1 through 8 rows');
  /** @type {{path:string,section:string}|null} */
  let previous = null;
  refs.forEach((refValue, index) => {
    const ref = assertExactRecord(refValue, ['path', 'section'], [], `${label}.refs[${index}]`);
    assertUnicodeScalarString(ref.path, `${label}.refs[${index}].path`);
    if (!allowedRefPaths.has(/** @type {string} */ (ref.path))) {
      invalid(`${label}.refs[${index}].path`, 'must reference the owner idea, spec, or sibling tasks');
    }
    assertRegistryIdentifier(ref.section, `${label}.refs[${index}].section`);
    if (previous) {
      const order = compareUtf8(previous.path, /** @type {string} */ (ref.path))
        || compareUtf8(previous.section, /** @type {string} */ (ref.section));
      if (order >= 0) invalid(`${label}.refs`, 'must be sorted by path then section and duplicate-free');
    }
    previous = { path: /** @type {string} */ (ref.path), section: /** @type {string} */ (ref.section) };
  });
}

/** Validate one closed ObjectiveRegistry shape. @param {unknown} value */
export function validateObjectiveRegistry(value) {
  const registry = assertExactRecord(value, ['version', 'owner', 'entries'], [], 'ObjectiveRegistry');
  if (registry.version !== 1) invalid('ObjectiveRegistry.version', 'must be the literal safe integer 1');
  const owner = assertExactRecord(registry.owner, ['ideaPath', 'specPath'], [], 'ObjectiveRegistry.owner');
  assertDirectIdeaPath(owner.ideaPath, 'ObjectiveRegistry.owner.ideaPath');
  assertUnicodeScalarString(owner.specPath, 'ObjectiveRegistry.owner.specPath');
  if (!SPEC_PATH_PATTERN.test(/** @type {string} */ (owner.specPath))) {
    invalid('ObjectiveRegistry.owner.specPath', 'must be a canonical specification path');
  }
  const entries = assertDenseDataArray(registry.entries, 'ObjectiveRegistry.entries');
  if (entries.length < 1 || entries.length > MAX_REGISTRY_ENTRIES) {
    invalid('ObjectiveRegistry.entries', `must contain 1 through ${MAX_REGISTRY_ENTRIES} rows`);
  }
  const specPath = /** @type {string} */ (owner.specPath);
  const tasksPath = `${specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const allowedRefPaths = new Set([/** @type {string} */ (owner.ideaPath), specPath, tasksPath]);
  const contractIds = new Set();
  let previousTaskKey = '';
  entries.forEach((entryValue, index) => {
    const entry = assertExactRecord(entryValue, ['taskKey', 'provenance', 'contract'], [], `ObjectiveRegistry.entries[${index}]`);
    if (typeof entry.taskKey !== 'string' || !TASK_KEY_PATTERN.test(entry.taskKey)) {
      invalid(`ObjectiveRegistry.entries[${index}].taskKey`, 'must be a durable task key');
    }
    if (index > 0 && compareUtf8(previousTaskKey, /** @type {string} */ (entry.taskKey)) >= 0) {
      invalid('ObjectiveRegistry.entries', 'must be sorted and unique by taskKey');
    }
    previousTaskKey = /** @type {string} */ (entry.taskKey);
    validateProvenance(entry.provenance, allowedRefPaths, `ObjectiveRegistry.entries[${index}].provenance`);
    validateEvaluationContract(entry.contract, `ObjectiveRegistry.entries[${index}].contract`);
    const contractId = /** @type {Record<string, unknown>} */ (entry.contract).id;
    if (contractIds.has(contractId)) {
      invalid(`ObjectiveRegistry.entries[${index}].contract.id`, 'must be unique within the registry');
    }
    contractIds.add(contractId);
  });
  return value;
}

/**
 * Scan plan text for the single valid active ObjectiveRegistry region.
 * @param {string} planText
 * @returns {{status:'none'}|{status:'present',registryText:string,registry:unknown}|{status:'malformed'}}
 */
export function scanObjectiveRegistry(planText) {
  assertUnicodeScalarString(planText, 'plan text');
  const lines = logicalLines(planText);
  /** @type {number[]} */
  const starts = [];
  /** @type {number[]} */
  const ends = [];
  /** @type {{character:string,length:number}|null} */
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].text;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { character: open[1][0], length: open[1].length };
      continue;
    }
    if (line === OBJECTIVE_REGISTRY_START) starts.push(index);
    else if (line === OBJECTIVE_REGISTRY_END) ends.push(index);
  }
  if (starts.length === 0 && ends.length === 0) return { status: 'none' };
  if (starts.length !== 1 || ends.length !== 1 || ends[0] - starts[0] !== 2) return { status: 'malformed' };
  const bodyLine = lines[starts[0] + 1].text;
  if (bodyLine.length === 0) return { status: 'malformed' };
  let parsed;
  try {
    parsed = JSON.parse(bodyLine);
  } catch {
    return { status: 'malformed' };
  }
  let registryText;
  try {
    registryText = canonicalJson(parsed);
  } catch {
    return { status: 'malformed' };
  }
  if (registryText !== bodyLine) return { status: 'malformed' };
  try {
    validateObjectiveRegistry(parsed);
  } catch {
    return { status: 'malformed' };
  }
  return { status: 'present', registryText, registry: parsed };
}

/**
 * @param {unknown} value
 * @param {string} specPath
 * @param {unknown[]} resolverDiagnostics
 */
function normalizeOwnerLog(value, specPath, resolverDiagnostics) {
  const ideas = assertDenseDataArray(value, 'rawInputs.directIdeas');
  const diagnostics = assertDenseDataArray(resolverDiagnostics, 'owner resolver diagnostics');
  /** @type {{code:string,path:string}[]} */
  const normalizedDiagnostics = [];
  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = assertRecord(diagnostics[index], `owner resolver diagnostics[${index}]`);
    normalizedDiagnostics.push({ code: String(diagnostic.code || ''), path: String(diagnostic.path || '') });
  }
  const resolverFailures = normalizedDiagnostics.filter((diagnostic) => (
    diagnostic.code !== 'FEATURE_OWNER_NOT_FOUND'
    && diagnostic.code !== 'FEATURE_IDEAS_ROOT_MISSING'
  ));
  if (resolverFailures.length) {
    const status = resolverFailures.some((diagnostic) => diagnostic.code === 'FEATURE_OWNER_DUPLICATE')
      ? 'conflict'
      : 'malformed';
    return {
      item: acquiredEvidence('owner-log', true, status, canonicalJson({ diagnostics: resolverFailures })),
      ownerIdeaPath: null,
    };
  }

  /** @type {{path:string,text:string,specPath:string}[]} */
  const definedIdeas = [];
  /** @type {{path:string,reason:string}[]} */
  const malformedIdeas = [];
  const seenPaths = new Set();
  for (let index = 0; index < ideas.length; index += 1) {
    const record = assertExactRecord(ideas[index], ['path', 'bytes'], [], `rawInputs.directIdeas[${index}]`);
    assertDirectIdeaPath(record.path, `rawInputs.directIdeas[${index}].path`);
    const ideaPath = /** @type {string} */ (record.path);
    if (seenPaths.has(ideaPath)) {
      return {
        item: acquiredEvidence('owner-log', true, 'conflict', canonicalJson({ duplicatePath: ideaPath })),
        ownerIdeaPath: null,
      };
    }
    seenPaths.add(ideaPath);
    const captured = decodeCapturedBytes(record.bytes);
    if (!captured.bytes) {
      malformedIdeas.push({ path: ideaPath, reason: 'invalid-bytes' });
      continue;
    }
    if (captured.text === null) {
      return { item: acquiredEvidence('owner-log', true, 'nontext', captured.bytes, false), ownerIdeaPath: null };
    }
    try {
      const frontmatter = parseFrontmatterScalars(captured.text, {
        canonicalKeys: ['title', 'slug', 'status', 'spec_path'],
      });
      const status = frontmatter.scalars.get('status')?.value || '';
      const ideaSpecPath = frontmatter.scalars.get('spec_path')?.value || '';
      if (!['draft', 'defined'].includes(status)
        || (status === 'defined' && !parseSpecIdentity(ideaSpecPath))
        || (status === 'draft' && ideaSpecPath !== '')) {
        malformedIdeas.push({ path: ideaPath, reason: 'invalid-owner-frontmatter' });
      } else if (status === 'defined') {
        definedIdeas.push({ path: ideaPath, text: captured.text, specPath: ideaSpecPath });
      }
    } catch {
      malformedIdeas.push({ path: ideaPath, reason: 'malformed-frontmatter' });
    }
  }
  if (malformedIdeas.length) {
    return {
      item: acquiredEvidence('owner-log', true, 'malformed', canonicalJson({ diagnostics: malformedIdeas })),
      ownerIdeaPath: null,
    };
  }
  /** @type {Map<string, string[]>} */
  const ownersBySpec = new Map();
  for (const idea of definedIdeas) {
    if (!ownersBySpec.has(idea.specPath)) ownersBySpec.set(idea.specPath, []);
    ownersBySpec.get(idea.specPath)?.push(idea.path);
  }
  const duplicateOwners = [...ownersBySpec]
    .filter(([, paths]) => paths.length > 1)
    .map(([ownedSpecPath, paths]) => ({ specPath: ownedSpecPath, paths: paths.sort(compareUtf8) }));
  if (duplicateOwners.length) {
    return {
      item: acquiredEvidence('owner-log', true, 'conflict', canonicalJson({ owners: duplicateOwners })),
      ownerIdeaPath: null,
    };
  }
  const owners = definedIdeas.filter((idea) => idea.specPath === specPath);
  if (owners.length === 0) return { item: missingEvidence('owner-log', true), ownerIdeaPath: null };
  const log = extractCoordinatorLog(owners[0].text);
  if (log.malformed || log.text === null) {
    return {
      item: acquiredEvidence('owner-log', true, 'malformed', canonicalJson({
        ideaPath: owners[0].path,
        specPath,
        ownerBytes: owners[0].text,
      })),
      ownerIdeaPath: owners[0].path,
    };
  }
  return {
    item: acquiredEvidence('owner-log', true, 'present', canonicalJson({
      ideaPath: owners[0].path,
      specPath,
      coordinatorLog: log.text,
    })),
    ownerIdeaPath: owners[0].path,
  };
}

/** @param {import('../dude-engine/lib/tasks.mjs').Task} task */
function normalizeTask(task) {
  return {
    id: task.id,
    state: task.state,
    parallel: task.parallel,
    label: task.label,
    description: task.description,
    deps: [...task.deps],
    blockedBy: task.blockedBy,
    extraMeta: [...task.extraMeta],
  };
}

/** @param {ReturnType<typeof parseTasks>} parsed */
function extractDiscoveredSection(parsed) {
  /** @type {number[]} */
  const starts = [];
  const activeLineCount = parsed.history?.startLine ?? parsed.lines.length;
  for (let index = 0; index < activeLineCount; index += 1) {
    if (parsed.board && index >= parsed.board.startLine && index <= parsed.board.endLine) continue;
    if (/^##[ \t]+Discovered[ \t]+During[ \t]+Execution(?:[ \t]+#+)?[ \t]*$/.test(parsed.lines[index])) {
      starts.push(index);
    }
  }
  if (starts.length === 0) return { text: '', malformed: false };
  if (starts.length > 1) return { text: '', malformed: true };
  const start = starts[0];
  let endOffset = parsed.history?.startOffset ?? parsed.source.length;
  for (let index = start + 1; index < activeLineCount; index += 1) {
    if (parsed.board && index >= parsed.board.startLine && index <= parsed.board.endLine) continue;
    if (/^##[ \t]+/.test(parsed.lines[index])) {
      endOffset = parsed.lineMeta[index].startOffset;
      break;
    }
  }
  return {
    text: parsed.source.slice(parsed.lineMeta[start].startOffset, endOffset),
    malformed: false,
  };
}

/** @param {unknown} value @param {Record<string, unknown>} target */
function normalizeTaskHistory(value, target) {
  const input = assertExactRecord(value, ['path', 'bytes'], [], 'rawInputs.tasks');
  const expectedPath = `${/** @type {string} */ (target.specPath).slice(0, -'spec.md'.length)}tasks.md`;
  if (input.path !== expectedPath) {
    return {
      item: acquiredEvidence('task-history', true, 'conflict', canonicalJson({ expectedPath })),
      tasks: [],
      targetTask: null,
      usable: false,
    };
  }
  if (input.bytes === null) {
    return { item: missingEvidence('task-history', true), tasks: [], targetTask: null, usable: false };
  }
  const captured = decodeCapturedBytes(input.bytes);
  if (!captured.bytes) {
    return {
      item: acquiredEvidence('task-history', true, 'malformed', canonicalJson({ path: expectedPath })),
      tasks: [],
      targetTask: null,
      usable: false,
    };
  }
  if (captured.text === null) {
    return {
      item: acquiredEvidence('task-history', true, 'nontext', captured.bytes, false),
      tasks: [],
      targetTask: null,
      usable: false,
    };
  }
  const parsedVisible = (() => {
    try {
      return parseVisibleTasks(captured.bytes, { path: expectedPath });
    } catch {
      return null;
    }
  })();
  if (!parsedVisible) {
    return {
      item: acquiredEvidence('task-history', true, 'malformed', canonicalJson({ path: expectedPath })),
      tasks: [],
      targetTask: null,
      usable: false,
    };
  }
  const parsed = parsedVisible.parsed;
  const discovered = extractDiscoveredSection(parsed);
  const tasks = parsed.tasks.map(normalizeTask);
  const taskKey = target.lane === 'lightweight' && typeof target.taskKey === 'string'
    ? target.taskKey
    : null;
  const targetTask = taskKey ? tasks.find((task) => task.id === taskKey) || null : null;
  const dependencies = targetTask
    ? tasks.filter((task) => targetTask.deps.includes(task.id))
    : [];
  const normalized = canonicalJson({
    path: expectedPath,
    canonicalTasks: taskKey ? (targetTask ? [targetTask] : []) : tasks,
    dependencies,
    discovered: discovered.text,
    history: parsedVisible.historyOffset === null
      ? ''
      : captured.bytes.subarray(parsedVisible.historyOffset).toString('utf8'),
  });
  if (parsed.warnings.length || discovered.malformed) {
    return {
      item: acquiredEvidence('task-history', true, 'malformed', normalized),
      tasks,
      targetTask,
      usable: false,
    };
  }
  if (taskKey && !targetTask) {
    return {
      item: acquiredEvidence('task-history', true, 'conflict', normalized),
      tasks,
      targetTask,
      usable: false,
    };
  }
  return {
    item: acquiredEvidence('task-history', true, 'present', normalized),
    tasks,
    targetTask,
    usable: true,
  };
}

/**
 * Normalize the autonomous-only definition-plan evidence item.
 * @param {unknown} value
 * @param {Record<string, unknown>} target
 * @param {string|null} ownerIdeaPath
 * @param {string|null} verifiedTaskKey
 * @param {string|undefined} acquisitionStatus
 * @param {Record<string, unknown>|null} definitionPrestate
 * @param {Record<string, unknown>|null} definitionProjectionBase
 */
function normalizeDefinitionPlan(
  value,
  target,
  ownerIdeaPath,
  verifiedTaskKey,
  acquisitionStatus,
  definitionPrestate,
  definitionProjectionBase,
) {
  const plan = assertExactRecord(value, ['path', 'bytes'], [], 'rawInputs.definitionPlan');
  const specPath = /** @type {string} */ (target.specPath);
  const siblingPlanPath = `${specPath.slice(0, -'spec.md'.length)}plan.md`;
  if (acquisitionStatus === 'overflow') {
    return acquiredEvidence('definition-plan', true, 'overflow', '', false);
  }
  if (acquisitionStatus === 'stale') {
    return acquiredEvidence('definition-plan', true, 'stale', canonicalJson({ path: plan.path }));
  }
  if (acquisitionStatus === 'missing' || plan.bytes === null) {
    return missingEvidence('definition-plan', true);
  }
  const captured = byteSequence(plan.bytes);
  if (!captured) return missingEvidence('definition-plan', true);
  if (captured.byteLength > MAX_SOURCE_BODY_BYTES) {
    return acquiredEvidence('definition-plan', true, 'overflow', captured, false);
  }
  const decoded = decodeCapturedBytes(captured);
  if (decoded.text === null) {
    return acquiredEvidence('definition-plan', true, 'nontext', captured, false);
  }
  if (plan.path !== siblingPlanPath) {
    return acquiredEvidence('definition-plan', true, 'conflict', canonicalJson({ expectedPath: siblingPlanPath }));
  }
  if (ownerIdeaPath === null) {
    return acquiredEvidence('definition-plan', true, 'conflict', canonicalJson({ reason: 'owner-unresolved' }));
  }
  const scan = scanObjectiveRegistry(decoded.text);
  if (scan.status === 'malformed') {
    return acquiredEvidence('definition-plan', true, 'malformed', canonicalJson({ path: siblingPlanPath }));
  }
  const planDescriptor = contentDescriptor(captured);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: ownerIdeaPath,
    specPath,
    planPath: /** @type {string} */ (plan.path),
  }));
  if (scan.status === 'none') {
    return acquiredEvidence('definition-plan', true, 'present', canonicalJson({
      path: plan.path,
      planDescriptor,
      ownerBindingHash,
      registryHash: null,
      ...(definitionPrestate ? { definitionPrestate } : {}),
      ...(definitionProjectionBase ? { definitionProjectionBase } : {}),
    }));
  }
  const registry = /** @type {Record<string, unknown>} */ (scan.registry);
  const owner = /** @type {Record<string, unknown>} */ (registry.owner);
  if (owner.specPath !== specPath || owner.ideaPath !== ownerIdeaPath) {
    return acquiredEvidence('definition-plan', true, 'conflict', canonicalJson({ reason: 'registry-owner-mismatch' }));
  }
  const registryHash = sha256(scan.registryText);
  const selectionKey = target.lane === 'lightweight'
    ? (typeof target.taskKey === 'string' ? target.taskKey : null)
    : (typeof verifiedTaskKey === 'string' ? verifiedTaskKey : null);
  /** @type {Record<string, unknown>} */
  const body = {
    path: plan.path,
    planDescriptor,
    ownerBindingHash,
    registryHash,
    ...(definitionPrestate ? { definitionPrestate } : {}),
    ...(definitionProjectionBase ? { definitionProjectionBase } : {}),
  };
  if (selectionKey !== null) {
    const selectedEntry = /** @type {Record<string, unknown>[]} */ (registry.entries)
      .find((entry) => entry.taskKey === selectionKey);
    if (selectedEntry) {
      body.selectedEntry = selectedEntry;
      body.contractHash = sha256(canonicalJson(selectedEntry.contract));
    }
  }
  return acquiredEvidence('definition-plan', true, 'present', canonicalJson(body));
}

/**
 * @param {unknown} value
 * @param {Record<string, unknown>} target
 * @param {ReturnType<typeof normalizeTaskHistory>} taskHistory
 * @param {Record<string, unknown>} dependencies
 */
function normalizeLaneHistory(value, target, taskHistory, dependencies) {
  const lane = assertRecord(value, 'rawInputs.lane');
  if (lane.kind === 'lightweight') {
    assertExactRecord(lane, ['kind'], [], 'rawInputs.lane');
    if (target.lane !== 'lightweight') {
      return { item: acquiredEvidence('lane-history', true, 'conflict', canonicalJson({ kind: lane.kind })), verifiedTaskKey: null };
    }
    if (!taskHistory.usable) {
      return { item: acquiredEvidence('lane-history', true, 'malformed', canonicalJson({ kind: lane.kind })), verifiedTaskKey: null };
    }
    return {
      item: acquiredEvidence('lane-history', true, 'present', canonicalJson({
        kind: 'lightweight',
        canonicalTasks: typeof target.taskKey === 'string'
          ? [taskHistory.targetTask]
          : taskHistory.tasks,
      })),
      verifiedTaskKey: null,
    };
  }
  if (lane.kind !== 'tracked') {
    assertExactRecord(lane, ['kind'], [], 'rawInputs.lane');
    return { item: acquiredEvidence('lane-history', true, 'malformed', canonicalJson({ kind: String(lane.kind) })), verifiedTaskKey: null };
  }
  assertExactRecord(lane, ['kind', 'listBytes', 'issues'], [], 'rawInputs.lane');
  if (target.lane !== 'tracked') {
    return { item: acquiredEvidence('lane-history', true, 'conflict', canonicalJson({ kind: lane.kind })), verifiedTaskKey: null };
  }
  const issueEntries = assertDenseDataArray(lane.issues, 'rawInputs.lane.issues');
  issueEntries.forEach((entry, index) => assertExactRecord(
    entry,
    ['detailBytes', 'historyBytes'],
    [],
    `rawInputs.lane.issues[${index}]`,
  ));
  if (!Object.hasOwn(dependencies, 'normalizeTrackedEvidence')) {
    return { item: missingEvidence('lane-history', true), verifiedTaskKey: null };
  }
  try {
    for (const captured of [
      lane.listBytes,
      ...issueEntries.flatMap((entry) => [entry.detailBytes, entry.historyBytes]),
    ]) {
      const decoded = decodeCapturedBytes(captured);
      if (!decoded.bytes || decoded.text === null) throw new Error('invalid tracked byte capture');
    }
    const projection = dependencies.normalizeTrackedEvidence({
      kind: 'tracked',
      listBytes: lane.listBytes,
      issues: lane.issues,
      target,
    });
    const normalized = assertExactRecord(projection, ['target', 'records'], [], 'tracked projection');
    const projectedTarget = assertExactRecord(
      normalized.target,
      ['specPath', 'lane'],
      ['issueId'],
      'tracked projection.target',
    );
    validateTarget(projectedTarget);
    if (canonicalJson(projectedTarget) !== canonicalJson(canonicalTarget(target))) {
      return { item: acquiredEvidence('lane-history', true, 'conflict', canonicalJson({ kind: 'tracked' })), verifiedTaskKey: null };
    }
    const records = normalizeTrackedRecords(normalized.records, target);
    let verifiedTaskKey = null;
    if (typeof target.issueId === 'string') {
      const targetRecord = records.find((record) => record.issueId === target.issueId);
      if (targetRecord && typeof targetRecord.taskKey === 'string') verifiedTaskKey = targetRecord.taskKey;
    }
    return {
      item: acquiredEvidence('lane-history', true, 'present', canonicalJson({ kind: 'tracked', records })),
      verifiedTaskKey,
    };
  } catch {
    return { item: acquiredEvidence('lane-history', true, 'malformed', canonicalJson({ kind: 'tracked' })), verifiedTaskKey: null };
  }
}

/** @param {unknown} value @param {string} label @param {boolean} record @param {string} specPath */
function normalizeTrackedIssue(value, label, record, specPath) {
  const issue = assertExactRecord(
    value,
    ['issueId', 'status', 'type', 'title', 'description', 'detail', ...(record ? ['history'] : [])],
    ['taskKey'],
    label,
  );
  assertUnicodeScalarString(issue.issueId, `${label}.issueId`);
  const issueId = /** @type {string} */ (issue.issueId);
  const idLength = Buffer.byteLength(issueId);
  if (idLength < 1 || idLength > 256 || /[\u0000-\u001f\u007f-\u009f]/.test(issueId)) {
    invalid(`${label}.issueId`, 'must contain 1-256 UTF-8 bytes and no controls');
  }
  assertEnum(issue.status, TRACKED_STATUSES, `${label}.status`);
  for (const field of ['type', 'title', 'description']) {
    assertUnicodeScalarString(issue[field], `${label}.${field}`);
    if (issue[field] === '') invalid(`${label}.${field}`, 'must be nonempty');
  }
  if (issue.type !== /** @type {string} */ (issue.type).toLowerCase() || issue.type === 'epic') {
    invalid(`${label}.type`, 'must be a canonical executable type');
  }
  if (Object.hasOwn(issue, 'taskKey')
    && (typeof issue.taskKey !== 'string' || !TASK_KEY_PATTERN.test(issue.taskKey))) {
    invalid(`${label}.taskKey`, 'must be a durable task key');
  }
  if (/** @type {string} */ (issue.description).split(/\r?\n/, 1)[0] !== `spec: ${specPath}`) {
    invalid(`${label}.description`, 'must retain the target specification identity');
  }
  const detail = assertExactRecord(issue.detail, [], TRACKED_DETAIL_FIELDS, `${label}.detail`);
  canonicalJson(detail);
  return {
    issueId,
    status: issue.status,
    type: issue.type,
    title: issue.title,
    description: issue.description,
    ...(Object.hasOwn(issue, 'taskKey') ? { taskKey: issue.taskKey } : {}),
    detail,
  };
}

/** @param {unknown} value @param {Record<string, unknown>} target */
function normalizeTrackedRecords(value, target) {
  const specPath = /** @type {string} */ (target.specPath);
  const values = assertDenseDataArray(value, 'tracked projection.records');
  const records = values.map((entry, index) => {
    const label = `tracked projection.records[${index}]`;
    const record = normalizeTrackedIssue(entry, label, true, specPath);
    const source = /** @type {Record<string, unknown>} */ (entry);
    const history = assertDenseDataArray(source.history, `${label}.history`)
      .map((historyEntry, historyIndex) => {
        const historyLabel = `${label}.history[${historyIndex}]`;
        const event = assertExactRecord(historyEntry, ['commitDate', 'issue'], [], historyLabel);
        assertUnicodeScalarString(event.commitDate, `${historyLabel}.commitDate`);
        if (event.commitDate === '') invalid(`${historyLabel}.commitDate`, 'must be nonempty');
        const issue = normalizeTrackedIssue(event.issue, `${historyLabel}.issue`, false, specPath);
        if (issue.issueId !== record.issueId) invalid(historyLabel, 'must retain the record issue ID');
        return { commitDate: event.commitDate, issue };
      });
    return { ...record, history };
  });
  const taskKeys = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (index > 0 && compareUtf8(records[index - 1].issueId, record.issueId) >= 0) {
      invalid('tracked projection.records', 'must be sorted and duplicate-free');
    }
    if (record.taskKey) {
      if (taskKeys.has(record.taskKey)) invalid('tracked projection.records', 'contains a duplicate task key');
      taskKeys.add(record.taskKey);
    }
  }
  if (typeof target.issueId === 'string'
    && (records.length !== 1 || records[0].issueId !== target.issueId)) {
    invalid('tracked projection.records', 'must contain only the target issue');
  }
  if (typeof target.taskKey === 'string' && records[0]?.taskKey !== target.taskKey) {
    invalid('tracked projection.records', 'must retain the verified target task key');
  }
  return records;
}

/**
 * @param {unknown} value
 * @param {Record<string, unknown>} target
 * @param {string} field
 * @param {string} source
 * @param {readonly string[]} states
 */
function normalizeCaptureStream(value, target, field, source, states) {
  if (value === undefined) return [missingEvidence(source, true)];
  const entries = assertDenseDataArray(value, `rawInputs.${field}`);
  if (entries.length === 0) return [acquiredEvidence(source, true, 'present', '[]')];
  /** @type {Record<string, unknown>[]} */
  const items = [];
  const trustedCaptureIdentities = new Set();
  let sawWrongTarget = false;
  for (let index = 0; index < entries.length; index += 1) {
    const label = `rawInputs.${field}[${index}]`;
    const entry = assertExactRecord(entries[index], ['target', 'state', 'outcomeHash', 'bytes'], [], label);
    try {
      validateTarget(entry.target);
    } catch {
      return [acquiredEvidence(source, true, 'malformed', canonicalJson({ index }))];
    }
    if (!sameCapturedTarget(entry.target, target)) {
      sawWrongTarget = true;
      continue;
    }
    if (typeof entry.state !== 'string' || !states.includes(entry.state)) {
      return [acquiredEvidence(source, true, 'malformed', canonicalJson({ index }))];
    }
    if (typeof entry.outcomeHash !== 'string' || !HASH_PATTERN.test(entry.outcomeHash)) {
      return [acquiredEvidence(source, true, 'malformed', canonicalJson({ index }))];
    }
    const captured = decodeCapturedBytes(entry.bytes);
    if (!captured.bytes) return [acquiredEvidence(source, true, 'malformed', canonicalJson({ index }))];
    if (captured.text === null) return [acquiredEvidence(source, true, 'nontext', captured.bytes, false)];
    let normalized;
    try {
      const body = assertExactRecord(JSON.parse(captured.text), ['target', 'state', 'records'], [], `${source} body`);
      validateTarget(body.target);
      assertEnum(body.state, states, `${source} body.state`);
      const records = assertDenseDataArray(body.records, `${source} body.records`);
      if (!sameCapturedTarget(body.target, target)) {
        return [acquiredEvidence(source, true, 'conflict', captured.text)];
      }
      normalized = {
        target: canonicalTarget(body.target),
        state: body.state,
        records: records.map((record, recordIndex) => (
          normalizeSourceRecord(record, source, `${source} body.records[${recordIndex}]`)
        )),
      };
      canonicalJson(normalized);
    } catch {
      return [acquiredEvidence(source, true, 'malformed', captured.text)];
    }
    const text = canonicalJson(normalized);
    if (normalized.state !== entry.state
      || sha256(text) !== entry.outcomeHash) {
      return [acquiredEvidence(source, true, 'conflict', text)];
    }
    if (source === 'verification' || source === 'review') {
      const records = /** @type {Record<string, unknown>[]} */ (normalized.records);
      for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        const record = records[recordIndex];
        if (!Object.hasOwn(record, 'authority') && !Object.hasOwn(record, 'bytes')) continue;
        try {
          validateTrustedSourceCaptureV2(record, `${source} trusted source capture[${recordIndex}]`);
        } catch {
          continue;
        }
        const identity = sha256(canonicalJson(record));
        if (trustedCaptureIdentities.has(identity)) {
          invalid(label, 'contains a duplicate trusted capture');
        }
        trustedCaptureIdentities.add(identity);
      }
    }
    items.push(acquiredEvidence(source, true, 'present', text));
  }
  if (items.length === 0) {
    return [sawWrongTarget
      ? acquiredEvidence(source, true, 'stale', '')
      : missingEvidence(source, true)];
  }
  return items;
}

/** @param {unknown} value @param {string} source @param {string} label */
function normalizeSourceRecord(value, source, label) {
  const envelope = assertExactRecord(value, ['substantive'], ['presentation'], label);
  const substantive = assertRecord(envelope.substantive, `${label}.substantive`);
  canonicalJson(substantive);
  if (Object.hasOwn(envelope, 'presentation')) {
    const fields = PRESENTATION_FIELDS[/** @type {keyof typeof PRESENTATION_FIELDS} */ (source)];
    const presentation = assertExactRecord(envelope.presentation, [], [...fields], `${label}.presentation`);
    for (const field of Object.keys(presentation)) {
      assertUnicodeScalarString(presentation[field], `${label}.presentation.${field}`);
    }
  }
  return substantive;
}

/** @param {unknown} value @param {Record<string, unknown>} target */
function normalizeSession(value, target) {
  if (value === undefined) return missingEvidence('session', false, false);
  try {
    const session = assertExactRecord(value, ['target', 'availability'], ['bytes'], 'rawInputs.session');
    validateTarget(session.target);
    if (session.availability !== 'available'
      || !sameCapturedTarget(session.target, target)
      || !Object.hasOwn(session, 'bytes')) {
      return missingEvidence('session', false, false);
    }
    const captured = decodeCapturedBytes(session.bytes);
    if (!captured.bytes) return missingEvidence('session', false, false);
    if (captured.text === null) return acquiredEvidence('session', false, 'nontext', captured.bytes, false);
    return acquiredEvidence('session', false, 'present', captured.text);
  } catch {
    return missingEvidence('session', false, false);
  }
}

/** @param {Record<string, unknown>} value @param {number} directIdeaCount @param {string} label @param {string} [policyMode] */
function assertSourceEntryLimit(value, directIdeaCount, label, policyMode = 'guarded') {
  let count = directIdeaCount + 2;
  const lane = assertRecord(value.lane, `${label}.lane`);
  if (lane.kind === 'tracked') {
    assertExactRecord(lane, ['kind', 'listBytes', 'issues'], [], `${label}.lane`);
    count += assertDenseDataArrayLength(lane.issues, `${label}.lane.issues`);
  } else {
    assertExactRecord(lane, ['kind'], [], `${label}.lane`);
  }
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (Object.hasOwn(value, field)) {
      count += assertDenseDataArrayLength(value[field], `${label}.${field}`);
    }
  }
  if (Object.hasOwn(value, 'session')) count += 1;
  if (policyMode === 'autonomous') count += 1;
  if (count > MAX_SOURCE_ENTRIES) {
    invalid(label, `exceeds the resource limit of ${MAX_SOURCE_ENTRIES} total source entries`);
  }
  return count - directIdeaCount;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{used:number}} budget
 * @param {boolean} workspaceCharged
 * @param {boolean} capturesCharged
 * @param {Record<string, unknown>} target
 */
/**
 * Charge the plan body against the aggregate. An oversize plan (> the individual
 * source body limit) is neither charged nor thrown; it surfaces as an overflow status.
 * @param {unknown} value @param {string} label @param {{used:number}} budget
 */
function chargePlanBody(value, label, budget) {
  const bytes = byteSequence(value);
  if (bytes && bytes.byteLength <= MAX_SOURCE_BODY_BYTES) chargeBodyLength(bytes.byteLength, label, budget);
}

function chargeRawInputBodies(raw, budget, workspaceCharged, capturesCharged, target) {
  if (!workspaceCharged) {
    const ideas = assertDenseDataArray(raw.directIdeas, 'rawInputs.directIdeas');
    for (let index = 0; index < ideas.length; index += 1) {
      const idea = assertExactRecord(ideas[index], ['path', 'bytes'], [], `rawInputs.directIdeas[${index}]`);
      chargeByteSequence(idea.bytes, `rawInputs.directIdeas[${index}] workspace file source body`, budget);
    }
    const tasks = assertExactRecord(raw.tasks, ['path', 'bytes'], [], 'rawInputs.tasks');
    chargeByteSequence(tasks.bytes, 'rawInputs.tasks workspace file source body', budget);
    if (Object.hasOwn(raw, 'definitionPlan')) {
      const plan = assertExactRecord(raw.definitionPlan, ['path', 'bytes'], [], 'rawInputs.definitionPlan');
      chargePlanBody(plan.bytes, 'rawInputs.definitionPlan workspace file source body', budget);
    }
  }
  if (capturesCharged) return;

  const lane = assertRecord(raw.lane, 'rawInputs.lane');
  if (lane.kind === 'tracked') {
    assertExactRecord(lane, ['kind', 'listBytes', 'issues'], [], 'rawInputs.lane');
    chargeByteSequence(lane.listBytes, 'rawInputs.lane.listBytes captured source body', budget);
    const issues = assertDenseDataArray(lane.issues, 'rawInputs.lane.issues');
    for (let index = 0; index < issues.length; index += 1) {
      const issue = assertExactRecord(
        issues[index],
        ['detailBytes', 'historyBytes'],
        [],
        `rawInputs.lane.issues[${index}]`,
      );
      chargeByteSequence(issue.detailBytes, `rawInputs.lane.issues[${index}].detailBytes captured source body`, budget);
      chargeByteSequence(issue.historyBytes, `rawInputs.lane.issues[${index}].historyBytes captured source body`, budget);
    }
  }
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(raw, field)) continue;
    const entries = assertDenseDataArray(raw[field], `rawInputs.${field}`);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = assertExactRecord(
        entries[index],
        ['target', 'state', 'outcomeHash', 'bytes'],
        [],
        `rawInputs.${field}[${index}]`,
      );
      chargeByteSequence(entry.bytes, `rawInputs.${field}[${index}].bytes captured source body`, budget);
    }
  }
  if (Object.hasOwn(raw, 'session')) {
    const session = assertRecord(raw.session, 'rawInputs.session');
    if (session.availability === 'available' && Object.hasOwn(session, 'bytes')) {
      let exactTarget = false;
      try {
        exactTarget = sameCapturedTarget(session.target, target);
      } catch {
        // Malformed or unbound optional session evidence is not acquired.
      }
      if (exactTarget) {
        chargeByteSequence(session.bytes, 'rawInputs.session.bytes captured source body', budget);
      }
    }
  }
}

/**
 * @param {unknown} targetValue
 * @param {unknown} rawValue
 * @param {unknown} [dependenciesValue]
 * @param {{ownerDiagnostics?:unknown[],budget?:{used:number},workspaceCharged?:boolean,capturesCharged?:boolean,policyMode?:string,definitionPlanStatus?:string,definitionSpec?:{path:string,bytes:Buffer|null},definitionSpecStatus?:string,definitionTaskSuffix?:Buffer}} [context]
 */
function collectEvidenceInternal(targetValue, rawValue, dependenciesValue, context = {}) {
  const dependencies = validateDependencies(dependenciesValue);
  const target = /** @type {Record<string, unknown>} */ (validateTarget(targetValue));
  const policyMode = context.policyMode || 'guarded';
  assertEnum(policyMode, ['guarded', 'autonomous'], 'policy mode');
  const raw = assertExactRecord(
    rawValue,
    ['directIdeas', 'tasks', 'lane'],
    ['currentRun', 'review', 'verification', 'lint', 'session', 'definitionPlan'],
    'rawInputs',
  );
  if (policyMode === 'guarded' && Object.hasOwn(raw, 'definitionPlan')) {
    invalid('rawInputs.definitionPlan', 'is forbidden under the guarded policy');
  }
  if (policyMode === 'autonomous' && !Object.hasOwn(raw, 'definitionPlan')) {
    invalid('rawInputs.definitionPlan', 'is required under the autonomous policy');
  }
  if (Object.hasOwn(raw, 'definitionPlan')) {
    assertExactRecord(raw.definitionPlan, ['path', 'bytes'], [], 'rawInputs.definitionPlan');
  }
  const directIdeaCount = assertDenseDataArrayLength(raw.directIdeas, 'rawInputs.directIdeas');
  assertSourceEntryLimit(raw, directIdeaCount, 'rawInputs', policyMode);
  const budget = context.budget || createBodyBudget();
  chargeRawInputBodies(
    raw,
    budget,
    context.workspaceCharged === true,
    context.capturesCharged === true,
    target,
  );
  validateDeclaredJsonCaptures(raw);
  const owner = normalizeOwnerLog(raw.directIdeas, /** @type {string} */ (target.specPath), context.ownerDiagnostics || []);
  const taskHistory = normalizeTaskHistory(raw.tasks, target);
  const lane = normalizeLaneHistory(raw.lane, target, taskHistory, dependencies);
  const definitionPrestate = policyMode === 'autonomous'
    ? acquiredDefinitionPrestateV1(
      raw,
      target,
      owner.ownerIdeaPath,
      context.definitionSpec,
      context.definitionSpecStatus,
    )
    : null;
  const definitionProjectionBase = policyMode === 'autonomous'
    ? acquiredDefinitionProjectionBaseV1(
      raw,
      target,
      owner.ownerIdeaPath,
      context.definitionSpec,
      context.definitionSpecStatus,
      context.definitionTaskSuffix,
    )
    : null;
  const definitionPlan = policyMode === 'autonomous'
    ? normalizeDefinitionPlan(
      raw.definitionPlan,
      target,
      owner.ownerIdeaPath,
      lane.verifiedTaskKey,
      context.definitionPlanStatus,
      definitionPrestate,
      definitionProjectionBase,
    )
    : null;
  const currentRun = normalizeCaptureStream(
    raw.currentRun,
    target,
    'currentRun',
    'current-run',
    CURRENT_RUN_STATES,
  );
  const review = normalizeCaptureStream(raw.review, target, 'review', 'review', REVIEW_STATES);
  const verification = normalizeCaptureStream(
    raw.verification,
    target,
    'verification',
    'verification',
    CHECK_STATES,
  );
  const lint = normalizeCaptureStream(raw.lint, target, 'lint', 'lint', CHECK_STATES);
  return [
    owner.item,
    taskHistory.item,
    ...(definitionPlan ? [definitionPlan] : []),
    lane.item,
    ...currentRun,
    ...review,
    ...verification,
    ...lint,
    normalizeSession(raw.session, target),
  ];
}

/** Collect concrete evidence from the closed captured-input shape. @param {unknown} target @param {unknown} rawInputs @param {unknown} [dependencies] @param {string} [policyMode] */
export function collectEvidence(target, rawInputs, dependencies, policyMode = 'guarded') {
  return collectEvidenceInternal(target, rawInputs, dependencies, { policyMode });
}

/** @param {unknown} error */
function isMissingPath(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

/** @param {string} root @param {string} relativePath */
function inspectWorkspaceFilePath(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const rootStat = fs.lstatSync(absoluteRoot, { bigint: true });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('unsafe workspace root');
  const realRoot = fs.realpathSync(absoluteRoot);
  const absolutePath = resolveWorkspacePath(absoluteRoot, relativePath);
  let cursor = absoluteRoot;
  const parts = relativePath.split('/');
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe workspace path');
    const real = fs.realpathSync(cursor);
    if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error('workspace path escapes its root');
    }
  }
  const stat = fs.lstatSync(absolutePath, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe workspace file');
  return { absolutePath, stat };
}

/** @param {import('node:fs').BigIntStats} left @param {import('node:fs').BigIntStats} right */
function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

/** @param {import('node:fs').BigIntStats} left @param {import('node:fs').BigIntStats} right */
function sameFileSnapshot(left, right) {
  return sameFileIdentity(left, right)
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

/** @param {string} root @param {string} relativePath @param {{used:number}} budget */
function readWorkspaceFile(root, relativePath, budget) {
  const beforePath = inspectWorkspaceFilePath(root, relativePath);
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const nonblock = typeof fs.constants.O_NONBLOCK === 'number' ? fs.constants.O_NONBLOCK : 0;
  const descriptor = fs.openSync(
    beforePath.absolutePath,
    fs.constants.O_RDONLY | noFollow | nonblock,
  );
  let bodyLimitRefusal = false;
  try {
    const beforeRead = fs.fstatSync(descriptor, { bigint: true });
    if (!beforeRead.isFile() || !sameFileIdentity(beforePath.stat, beforeRead)) {
      throw new Error('workspace file identity changed before acquisition');
    }
    let byteLength;
    try {
      if (beforeRead.size > BigInt(MAX_SOURCE_BODY_BYTES)) {
        invalid('workspace file', `exceeds the individual source body resource limit of ${MAX_SOURCE_BODY_BYTES} bytes`);
      }
      byteLength = Number(beforeRead.size);
      chargeBodyLength(byteLength, 'workspace file source body', budget);
    } catch (error) {
      bodyLimitRefusal = true;
      throw error;
    }
    const bytes = Buffer.allocUnsafe(byteLength);
    let offset = 0;
    while (offset < byteLength) {
      const read = fs.readSync(
        descriptor,
        bytes,
        offset,
        Math.min(65_536, byteLength - offset),
        null,
      );
      if (read === 0) throw new Error('workspace file changed during acquisition');
      offset += read;
    }
    const probe = Buffer.allocUnsafe(1);
    if (fs.readSync(descriptor, probe, 0, 1, null) !== 0) {
      throw new Error('workspace file grew during acquisition');
    }
    const afterRead = fs.fstatSync(descriptor, { bigint: true });
    if (!afterRead.isFile() || !sameFileSnapshot(beforeRead, afterRead)) {
      throw new Error('workspace file changed during acquisition');
    }
    const afterPath = inspectWorkspaceFilePath(root, relativePath);
    if (!sameFileIdentity(afterRead, afterPath.stat)) {
      throw new Error('workspace file identity changed during acquisition');
    }
    return bytes;
  } finally {
    try {
      fs.closeSync(descriptor);
    } catch (error) {
      if (!bodyLimitRefusal) throw error;
    }
  }
}

/** @param {string} root @param {{used:number}} budget @param {number} sourceEntryTail @param {(() => void) | undefined} [beforeBodyAcquisition] */
function readDirectIdeas(root, budget, sourceEntryTail, beforeBodyAcquisition) {
  /** @type {{path:string,bytes:Buffer}[]} */
  const directIdeas = [];
  /** @type {{code:string,path:string}[]} */
  const diagnostics = [];
  let absoluteRoot;
  try {
    absoluteRoot = path.resolve(root);
    const rootStat = fs.lstatSync(absoluteRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('unsafe root');
    fs.realpathSync(absoluteRoot);
  } catch {
    return { directIdeas, diagnostics: [{ code: 'FEATURE_ROOT_UNSAFE', path: '.' }] };
  }
  let ideasRoot = absoluteRoot;
  for (const part of ['.dude', 'ideas']) {
    ideasRoot = path.join(ideasRoot, part);
    let stat;
    try {
      stat = fs.lstatSync(ideasRoot);
    } catch (error) {
      if (isMissingPath(error)) return { directIdeas, diagnostics };
      return {
        directIdeas,
        diagnostics: [{ code: 'FEATURE_IDEAS_ROOT_UNREADABLE', path: '.dude/ideas' }],
      };
    }
    if (stat.isSymbolicLink()) {
      return {
        directIdeas,
        diagnostics: [{ code: 'FEATURE_IDEAS_ROOT_UNSAFE', path: '.dude/ideas' }],
      };
    }
    if (!stat.isDirectory()) {
      return {
        directIdeas,
        diagnostics: [{ code: 'FEATURE_IDEAS_ROOT_NOT_DIRECTORY', path: '.dude/ideas' }],
      };
    }
  }
  let directory;
  try {
    directory = fs.opendirSync(ideasRoot);
  } catch {
    return {
      directIdeas,
      diagnostics: [{ code: 'FEATURE_IDEAS_ROOT_UNREADABLE', path: '.dude/ideas' }],
    };
  }
  /** @type {{entryName:string,ideaPath:string}[]} */
  const candidateEntries = [];
  let enumerationFailed = false;
  let sourceEntryLimitExceeded = false;
  try {
    while (true) {
      let entry;
      try {
        entry = directory.readSync();
      } catch {
        enumerationFailed = true;
        break;
      }
      if (entry === null) break;
      if (candidateEntries.length + 1 + sourceEntryTail > MAX_SOURCE_ENTRIES) {
        sourceEntryLimitExceeded = true;
        invalid('inspect input', `exceeds the resource limit of ${MAX_SOURCE_ENTRIES} total source entries`);
      }
      const entryName = entry.name;
      const ideaPath = `.dude/ideas/${entryName}`;
      candidateEntries.push({ entryName, ideaPath });
    }
  } catch (error) {
    if (sourceEntryLimitExceeded) {
      try { directory.closeSync(); } catch {}
    } else {
      directory.closeSync();
    }
    throw error;
  }
  directory.closeSync();
  if (enumerationFailed) {
    return {
      directIdeas,
      diagnostics: [{ code: 'FEATURE_IDEAS_ROOT_UNREADABLE', path: '.dude/ideas' }],
    };
  }
  beforeBodyAcquisition?.();
  candidateEntries.sort((left, right) => compareUtf8(left.ideaPath, right.ideaPath));
  /** @type {{ideaPath:string}[]} */
  const readableEntries = [];
  for (const { entryName, ideaPath } of candidateEntries) {
    if (entryName.endsWith('.md')) {
      readableEntries.push({ ideaPath });
      continue;
    }
    try {
      fs.lstatSync(path.join(ideasRoot, entryName));
      diagnostics.push({ code: 'FEATURE_IDEA_ENTRY_UNSUPPORTED', path: ideaPath });
    } catch (error) {
      diagnostics.push({
        code: isMissingPath(error) ? 'FEATURE_IDEA_ENTRY_UNSUPPORTED' : 'FEATURE_IDEA_UNREADABLE',
        path: ideaPath,
      });
    }
  }
  /** @type {{ideaPath:string,specPath:string}[]} */
  const features = [];
  for (const { ideaPath } of readableEntries) {
    let stat;
    try {
      stat = fs.lstatSync(path.join(absoluteRoot, ideaPath));
    } catch (error) {
      diagnostics.push({
        code: isMissingPath(error) ? 'FEATURE_IDEA_ENTRY_UNSUPPORTED' : 'FEATURE_IDEA_UNREADABLE',
        path: ideaPath,
      });
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      diagnostics.push({ code: 'FEATURE_IDEA_ENTRY_UNSUPPORTED', path: ideaPath });
      continue;
    }
    let bytes;
    try {
      bytes = readWorkspaceFile(root, ideaPath, budget);
    } catch (error) {
      if (error instanceof TypeError) throw error;
      diagnostics.push({ code: 'FEATURE_IDEA_UNREADABLE', path: ideaPath });
      continue;
    }
    directIdeas.push({ path: ideaPath, bytes });
    let frontmatter;
    try {
      frontmatter = parseFrontmatterScalars(bytes, {
        canonicalKeys: ['title', 'slug', 'status', 'spec_path'],
      });
    } catch {
      diagnostics.push({ code: 'FEATURE_FRONTMATTER_MALFORMED', path: ideaPath });
      continue;
    }
    const status = frontmatter.scalars.get('status')?.value || '';
    const specPath = frontmatter.scalars.get('spec_path')?.value || '';
    let statusValid = true;
    if (!status) {
      statusValid = false;
      diagnostics.push({ code: 'FEATURE_STATUS_MISSING', path: ideaPath });
    } else if (!['draft', 'defined'].includes(status)) {
      statusValid = false;
      diagnostics.push({ code: 'FEATURE_STATUS_INVALID', path: ideaPath });
    }
    let specPathValid = false;
    if (!specPath) {
      if (status === 'defined') diagnostics.push({ code: 'FEATURE_SPEC_PATH_MISSING', path: ideaPath });
    } else if (!parseSpecIdentity(specPath)) {
      diagnostics.push({ code: 'FEATURE_SPEC_PATH_INVALID', path: ideaPath });
    } else {
      try {
        resolveSpecIdentity(absoluteRoot, specPath, { canonicalOnly: true, mustExist: true });
        specPathValid = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push({
          code: message.includes('target does not exist')
            ? 'FEATURE_SPEC_PATH_DANGLING'
            : 'FEATURE_SPEC_PATH_UNSAFE',
          path: ideaPath,
        });
      }
    }
    if (status === 'draft' && specPathValid) {
      diagnostics.push({ code: 'FEATURE_DRAFT_SPEC_PATH', path: ideaPath });
    }
    if (statusValid && status === 'defined' && specPathValid) {
      features.push({ ideaPath, specPath });
    }
  }
  /** @type {Map<string, string[]>} */
  const ownersBySpec = new Map();
  for (const feature of features) {
    if (!ownersBySpec.has(feature.specPath)) ownersBySpec.set(feature.specPath, []);
    ownersBySpec.get(feature.specPath)?.push(feature.ideaPath);
  }
  for (const [specPath, ideaPaths] of ownersBySpec) {
    if (ideaPaths.length > 1) diagnostics.push({ code: 'FEATURE_OWNER_DUPLICATE', path: specPath });
  }
  diagnostics.sort((left, right) => (
    compareUtf8(left.path, right.path) || compareUtf8(left.code, right.code)
  ));
  return { directIdeas, diagnostics };
}

/** @param {string} root @param {string} tasksPath @param {{used:number}} budget */
function readTasks(root, tasksPath, budget) {
  try {
    return { path: tasksPath, bytes: readWorkspaceFile(root, tasksPath, budget) };
  } catch (error) {
    if (error instanceof TypeError) throw error;
    if (isMissingPath(error)) return { path: tasksPath, bytes: null };
    return { path: tasksPath, bytes: false };
  }
}

/**
 * Fail-soft read of one definition file under the autonomous policy. Oversize is
 * a soft overflow, an aggregate-limit refusal still throws, and a missing or
 * unstable file surfaces as a status rather than an exception.
 * @param {string} root @param {string} relativePath @param {{used:number}} budget
 * @param {string} label
 * @returns {{bytes:Buffer}|{bytes:null,status:string}}
 */
function readAutonomousDefinitionFile(root, relativePath, budget, label) {
  let beforePath;
  try {
    beforePath = inspectWorkspaceFilePath(root, relativePath);
  } catch {
    return { bytes: null, status: 'missing' };
  }
  if (beforePath.stat.size > BigInt(MAX_SOURCE_BODY_BYTES)) return { bytes: null, status: 'overflow' };
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const nonblock = typeof fs.constants.O_NONBLOCK === 'number' ? fs.constants.O_NONBLOCK : 0;
  let descriptor;
  try {
    descriptor = fs.openSync(beforePath.absolutePath, fs.constants.O_RDONLY | noFollow | nonblock);
  } catch {
    return { bytes: null, status: 'missing' };
  }
  try {
    const beforeRead = fs.fstatSync(descriptor, { bigint: true });
    if (!beforeRead.isFile() || !sameFileIdentity(beforePath.stat, beforeRead)) {
      return { bytes: null, status: 'stale' };
    }
    if (beforeRead.size > BigInt(MAX_SOURCE_BODY_BYTES)) return { bytes: null, status: 'overflow' };
    const byteLength = Number(beforeRead.size);
    chargeBodyLength(byteLength, `${label} workspace file source body`, budget);
    const bytes = Buffer.allocUnsafe(byteLength);
    let offset = 0;
    while (offset < byteLength) {
      const read = fs.readSync(descriptor, bytes, offset, Math.min(65_536, byteLength - offset), null);
      if (read === 0) return { bytes: null, status: 'stale' };
      offset += read;
    }
    const probe = Buffer.allocUnsafe(1);
    if (fs.readSync(descriptor, probe, 0, 1, null) !== 0) return { bytes: null, status: 'stale' };
    const afterRead = fs.fstatSync(descriptor, { bigint: true });
    if (!afterRead.isFile() || !sameFileSnapshot(beforeRead, afterRead)) return { bytes: null, status: 'stale' };
    const afterPath = inspectWorkspaceFilePath(root, relativePath);
    if (!sameFileIdentity(afterRead, afterPath.stat)) return { bytes: null, status: 'stale' };
    return { bytes };
  } catch (error) {
    if (error instanceof TypeError) throw error;
    return { bytes: null, status: 'stale' };
  } finally {
    try { fs.closeSync(descriptor); } catch { /* close race after a successful read is not a read failure */ }
  }
}

/**
 * @param {unknown} value @param {unknown} [dependenciesValue] @param {boolean} [transport]
 * @param {string} [policyModeOverride] @param {{definitionTaskSuffix?:Buffer}} [acquisitionOptions]
 */
function acquireInspection(
  value,
  dependenciesValue,
  transport = false,
  policyModeOverride = undefined,
  acquisitionOptions = {},
) {
  const dependencies = validateDependencies(dependenciesValue);
  const input = assertExactRecord(
    value,
    ['root', 'specPath', 'target', 'lane'],
    ['currentRun', 'review', 'verification', 'lint', 'session', 'policyMode'],
    'inspect input',
  );
  if (typeof input.root !== 'string' || input.root.length === 0) invalid('inspect input.root', 'must be a nonempty string');
  const target = /** @type {Record<string, unknown>} */ (validateTarget(input.target));
  if (input.specPath !== target.specPath) invalid('inspect input.specPath', 'must equal Target.specPath');
  const specPath = /** @type {string} */ (input.specPath);
  if (Object.hasOwn(input, 'policyMode')) {
    assertEnum(input.policyMode, ['guarded', 'autonomous'], 'inspect input.policyMode');
  }
  if (policyModeOverride !== undefined) {
    assertEnum(policyModeOverride, ['guarded', 'autonomous'], 'policy mode override');
    if (Object.hasOwn(input, 'policyMode') && input.policyMode !== policyModeOverride) {
      invalid('inspect input.policyMode', 'must match the authorizing policy mode');
    }
  }
  const policyMode = /** @type {string} */ (policyModeOverride ?? input.policyMode ?? 'guarded');
  const sourceEntryTail = assertSourceEntryLimit(input, 0, 'inspect input', policyMode);
  const budget = createBodyBudget();
  let transportPreflighted = false;
  const preflightTransport = transport
    ? () => {
        decodeTransportInput(input, 'inspect input');
        transportPreflighted = true;
      }
    : undefined;
  let capturedIdeas;
  try {
    capturedIdeas = readDirectIdeas(
      /** @type {string} */ (input.root),
      budget,
      sourceEntryTail,
      preflightTransport,
    );
  } catch (error) {
    if (error instanceof TypeError) throw error;
    capturedIdeas = {
      directIdeas: [],
      diagnostics: [{ code: 'FEATURE_IDEAS_ROOT_UNREADABLE', path: '.dude/ideas' }],
    };
  }
  if (preflightTransport && !transportPreflighted) preflightTransport();
  const tasksPath = `${specPath.slice(0, -'spec.md'.length)}tasks.md`;
  const tasks = capturedIdeas.diagnostics.some(({ code }) => code === 'FEATURE_IDEA_UNREADABLE')
    ? { path: tasksPath, bytes: false }
    : readTasks(/** @type {string} */ (input.root), tasksPath, budget);
  /** @type {{path:string,bytes:Buffer|null}|undefined} */
  let definitionPlan;
  /** @type {string|undefined} */
  let definitionPlanStatus;
  /** @type {{path:string,bytes:Buffer|null}|undefined} */
  let definitionSpec;
  /** @type {string|undefined} */
  let definitionSpecStatus;
  if (policyMode === 'autonomous') {
    const planPath = `${specPath.slice(0, -'spec.md'.length)}plan.md`;
    const planRead = readAutonomousDefinitionFile(
      /** @type {string} */ (input.root),
      planPath,
      budget,
      'rawInputs.definitionPlan',
    );
    definitionPlan = { path: planPath, bytes: planRead.bytes };
    definitionPlanStatus = 'status' in planRead ? planRead.status : undefined;
    const specRead = readAutonomousDefinitionFile(
      /** @type {string} */ (input.root),
      specPath,
      budget,
      'definition prestate spec',
    );
    definitionSpec = { path: specPath, bytes: specRead.bytes };
    definitionSpecStatus = 'status' in specRead ? specRead.status : undefined;
  }
  const acquiredInput = transport
    ? materializeTransportInput(input, 'inspect input', budget)
    : input;
  const rawInputs = {
    directIdeas: capturedIdeas.directIdeas,
    tasks,
    lane: acquiredInput.lane,
    ...(definitionPlan ? { definitionPlan } : {}),
    ...(Object.hasOwn(acquiredInput, 'currentRun') ? { currentRun: acquiredInput.currentRun } : {}),
    ...(Object.hasOwn(acquiredInput, 'review') ? { review: acquiredInput.review } : {}),
    ...(Object.hasOwn(acquiredInput, 'verification') ? { verification: acquiredInput.verification } : {}),
    ...(Object.hasOwn(acquiredInput, 'lint') ? { lint: acquiredInput.lint } : {}),
    ...(Object.hasOwn(acquiredInput, 'session') ? { session: acquiredInput.session } : {}),
  };
  return {
    root: /** @type {string} */ (input.root),
    target,
    inspection: buildInspection(target, collectEvidenceInternal(target, rawInputs, dependencies, {
      ownerDiagnostics: capturedIdeas.diagnostics,
      budget,
      workspaceCharged: true,
      capturesCharged: transport,
      policyMode,
      definitionPlanStatus,
      definitionSpec,
      definitionSpecStatus,
      ...(acquisitionOptions.definitionTaskSuffix
        ? { definitionTaskSuffix: acquisitionOptions.definitionTaskSuffix }
        : {}),
    })),
  };
}

/** Acquire bounded workspace evidence and build one read-only Inspection. @param {unknown} value @param {unknown} [dependencies] */
export function inspect(value, dependencies) {
  return acquireInspection(value, dependencies).inspection;
}

/** @param {unknown} value */
export function validateTarget(value) {
  const target = assertExactRecord(value, ['specPath', 'lane'], ['taskKey', 'issueId'], 'Target');
  assertUnicodeScalarString(target.specPath, 'Target.specPath');
  if (!SPEC_PATH_PATTERN.test(/** @type {string} */ (target.specPath))) {
    invalid('Target.specPath', 'must be an exact canonical specification path');
  }
  assertEnum(target.lane, ['lightweight', 'tracked'], 'Target.lane');
  if (Object.hasOwn(target, 'taskKey')) {
    if (typeof target.taskKey !== 'string' || !TASK_KEY_PATTERN.test(target.taskKey)) {
      invalid('Target.taskKey', 'must be a durable task key');
    }
  }
  if (Object.hasOwn(target, 'issueId')) {
    assertUnicodeScalarString(target.issueId, 'Target.issueId');
    const issueId = /** @type {string} */ (target.issueId);
    const byteLength = Buffer.byteLength(issueId);
    if (byteLength < 1 || byteLength > 256 || /[\u0000-\u001f\u007f-\u009f]/.test(issueId)) {
      invalid('Target.issueId', 'must contain 1-256 UTF-8 bytes and no controls');
    }
  }
  if (target.lane === 'lightweight' && Object.hasOwn(target, 'issueId')) {
    invalid('Target.issueId', 'is forbidden in the lightweight lane');
  }
  if (target.lane === 'tracked' && Object.hasOwn(target, 'taskKey') && !Object.hasOwn(target, 'issueId')) {
    invalid('Target.taskKey', 'requires issueId in the tracked lane');
  }
  return value;
}

/** @param {unknown} value */
export function canonicalTarget(value) {
  const target = /** @type {Record<string, string>} */ (validateTarget(value));
  if (target.lane === 'lightweight' && target.taskKey) {
    return { specPath: target.specPath, lane: target.lane, taskKey: target.taskKey };
  }
  if (target.lane === 'tracked' && target.issueId) {
    return { specPath: target.specPath, lane: target.lane, issueId: target.issueId };
  }
  return { specPath: target.specPath, lane: target.lane };
}

/** @param {unknown} target */
export function targetKey(target) {
  return canonicalJson(canonicalTarget(target));
}

/** @param {unknown} target */
export function targetHash(target) {
  return sha256(targetKey(target));
}

/** @param {unknown} left @param {unknown} right */
function sameCapturedTarget(left, right) {
  return targetKey(left) === targetKey(right);
}

/** @param {unknown} value */
export function validateEvidenceItem(value) {
  const item = assertExactRecord(
    value,
    ['source', 'required', 'status', 'sha256', 'byteLength'],
    ['text'],
    'EvidenceItem',
  );
  assertEnum(item.source, SOURCES, 'EvidenceItem.source');
  if (typeof item.required !== 'boolean') invalid('EvidenceItem.required', 'must be a boolean');
  assertEnum(item.status, EVIDENCE_STATUSES, 'EvidenceItem.status');
  assertHash(item.sha256, 'EvidenceItem.sha256');
  assertSafeInteger(item.byteLength, 'EvidenceItem.byteLength', false);
  if (Object.hasOwn(item, 'text')) {
    assertUnicodeScalarString(item.text, 'EvidenceItem.text');
    const actual = contentDescriptor(/** @type {string} */ (item.text));
    if (actual.sha256 !== item.sha256 || actual.byteLength !== item.byteLength) {
      invalid('EvidenceItem', 'descriptor must bind the complete text');
    }
  }
  if (item.status === 'missing') {
    const empty = contentDescriptor('');
    if (item.sha256 !== empty.sha256 || item.byteLength !== 0) {
      invalid('EvidenceItem', 'missing content must use the empty-body descriptor');
    }
    if (Object.hasOwn(item, 'text') && item.text !== '') {
      invalid('EvidenceItem.text', 'must be empty for missing content');
    }
  }
  if ((item.status === 'overflow' || item.status === 'nontext') && Object.hasOwn(item, 'text')) {
    invalid('EvidenceItem.text', `is forbidden for ${item.status} content`);
  }
  return value;
}

/** @param {unknown} value */
export function descriptor(value) {
  const item = /** @type {Record<string, unknown>} */ (validateEvidenceItem(value));
  return {
    required: item.required,
    status: item.status,
    sha256: item.sha256,
    byteLength: item.byteLength,
  };
}

/** @param {unknown} value */
function orderAndDedupeItems(value) {
  const items = assertDenseDataArray(value, 'EvidenceItem list');
  const indexed = items.map((item, index) => {
    validateEvidenceItem(item);
    return { item: /** @type {Record<string, unknown>} */ (item), index };
  });
  indexed.sort((left, right) => {
    const sourceDifference = /** @type {number} */ (SOURCE_INDEX.get(/** @type {string} */ (left.item.source)))
      - /** @type {number} */ (SOURCE_INDEX.get(/** @type {string} */ (right.item.source)));
    return sourceDifference || left.index - right.index;
  });
  const seen = new Set();
  /** @type {Record<string, unknown>[]} */
  const ordered = [];
  for (const { item } of indexed) {
    const key = canonicalJson(item);
    if (seen.has(key)) continue;
    if (ordered.length >= MAX_RETAINED_DESCRIPTORS) {
      invalid('Inspection.items', `retained descriptor 65 exceeds the resource limit of ${MAX_RETAINED_DESCRIPTORS}`);
    }
    seen.add(key);
    ordered.push({ ...item });
  }
  return ordered;
}

/** @param {Record<string, unknown>} item */
function isAvailable(item) {
  return item.status !== 'missing'
    && item.status !== 'nontext'
    && item.status !== 'overflow'
    && Object.hasOwn(item, 'text');
}

/** @param {unknown} target @param {unknown} value */
function packetProjection(target, value) {
  const items = /** @type {Record<string, unknown>[]} */ (assertDenseDataArray(value, 'EvidenceItem list'));
  return {
    target: canonicalTarget(target),
    items: items.filter(isAvailable).map((item) => ({
      source: item.source,
      descriptor: descriptor(item),
      text: item.text,
    })),
  };
}

/** @param {unknown} target @param {unknown[]} items @param {boolean} overflow */
export function evidenceHash(target, items, overflow = false) {
  if (typeof overflow !== 'boolean') invalid('overflow', 'must be a boolean');
  const ordered = orderAndDedupeItems(items);
  return sha256(canonicalJson({
    target: canonicalTarget(target),
    items: ordered.map((item) => ({ source: item.source, descriptor: descriptor(item) })),
    overflow,
  }));
}

/** @param {unknown} value @param {string} label */
function validateMaterialInputs(value, label = 'Assessment.materialInputs') {
  const materialInputs = assertExactRecord(value, ['targets', 'operations', 'checks'], [], label);
  const targets = assertSortedUniqueStrings(materialInputs.targets, assertMaterialTarget, `${label}.targets`);
  const operations = assertSortedUniqueStrings(materialInputs.operations, assertMaterialIdentifier, `${label}.operations`);
  const checks = assertSortedUniqueStrings(materialInputs.checks, assertMaterialIdentifier, `${label}.checks`);
  return { materialInputs, targets, operations, checks };
}

/** @param {unknown} value @param {unknown} [inspection] @param {unknown} [assessment] */
export function validateAssessment(value, inspection, assessment) {
  const candidate = arguments.length === 3 ? assessment : value;
  if (arguments.length === 3) {
    validateTarget(value);
    validateInspection(inspection);
    if (targetKey(value) !== targetKey(/** @type {Record<string, unknown>} */ (inspection).target)) {
      invalid('Assessment', 'target must match the inspection');
    }
  }
  const record = assertExactRecord(
    candidate,
    ['evidenceHash', 'intent', 'action', 'materialInputs', 'equivalence', 'retention', 'summary'],
    [],
    'Assessment',
  );
  assertHash(record.evidenceHash, 'Assessment.evidenceHash');
  if (arguments.length === 3
    && record.evidenceHash !== /** @type {Record<string, unknown>} */ (inspection).evidenceHash) {
    invalid('Assessment.evidenceHash', 'must equal the inspected evidence hash');
  }
  assertEnum(record.intent, ['unchanged', 'changed', 'ambiguous'], 'Assessment.intent');
  assertEnum(record.action, ACTIONS, 'Assessment.action');
  const validatedMaterialInputs = validateMaterialInputs(record.materialInputs);
  assertEnum(record.equivalence, ['none', 'distinct', 'same', 'equivalent'], 'Assessment.equivalence');
  assertEnum(record.retention, ['transient', 'memory', 'skill', 'none'], 'Assessment.retention');
  assertUnicodeScalarString(record.summary, 'Assessment.summary');
  const summaryBytes = Buffer.byteLength(/** @type {string} */ (record.summary));
  if (summaryBytes < 1 || summaryBytes > 1024) invalid('Assessment.summary', 'must contain 1-1024 UTF-8 bytes');
  if (record.action === 'none' && [
    validatedMaterialInputs.targets,
    validatedMaterialInputs.operations,
    validatedMaterialInputs.checks,
  ].some((values) => values.length > 0)) {
    invalid('Assessment.materialInputs', 'must be empty when action is none');
  }
  if (record.action === 'reconcile-derived-definition' && record.intent !== 'unchanged') {
    invalid('Assessment.intent', 'must be unchanged for derived-definition reconciliation');
  }
  const requiredChecks = requiredChecksForAction[/** @type {keyof typeof requiredChecksForAction} */ (record.action)];
  if (canonicalJson(validatedMaterialInputs.checks) !== canonicalJson(requiredChecks)) {
    invalid('Assessment.materialInputs.checks', `must exactly match the hardcoded checks for ${record.action}`);
  }
  if (arguments.length === 3 && !actionInputsMatch(
    /** @type {Record<string, unknown>} */ (value),
    record,
    /** @type {Record<string, unknown>} */ (inspection),
  )) {
    invalid('Assessment.materialInputs', 'does not match the selected action and inspected target');
  }
  return candidate;
}

/** @param {unknown} value @param {unknown} [materialInputs] */
export function approachHash(value, materialInputs) {
  let action;
  let inputs;
  if (typeof value === 'string') {
    action = value;
    inputs = materialInputs;
    assertEnum(action, ACTIONS, 'approach action');
    validateMaterialInputs(inputs, 'approach materialInputs');
  } else {
    const record = assertRecord(value, 'approach');
    if (Object.hasOwn(record, 'intent')) {
      assertExactRecord(
        value,
        ['evidenceHash', 'intent', 'action', 'materialInputs', 'equivalence', 'retention', 'summary'],
        [],
        'approach',
      );
      assertHash(record.evidenceHash, 'approach.evidenceHash');
    } else {
      assertExactRecord(value, ['action', 'materialInputs'], [], 'approach');
    }
    action = record.action;
    inputs = record.materialInputs;
    assertEnum(action, ACTIONS, 'approach action');
    validateMaterialInputs(inputs, 'approach materialInputs');
  }
  return sha256(canonicalJson({ action, materialInputs: inputs }));
}

/** @param {unknown} value */
export function validateBlocker(value) {
  const blocker = assertExactRecord(value, ['code', 'subject', 'evidenceHash'], [], 'Blocker');
  assertEnum(blocker.code, BLOCKER_CODES, 'Blocker.code');
  assertSubject(/** @type {string} */ (blocker.subject), 'Blocker.subject');
  assertHash(blocker.evidenceHash, 'Blocker.evidenceHash');
  return value;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function compareBlockers(left, right) {
  return compareUtf8(/** @type {string} */ (left.code), /** @type {string} */ (right.code))
    || compareUtf8(/** @type {string} */ (left.subject), /** @type {string} */ (right.subject))
    || compareUtf8(/** @type {string} */ (left.evidenceHash), /** @type {string} */ (right.evidenceHash));
}

/** @param {Record<string, unknown>[]} items @param {string} hash @param {boolean} overflow */
function inspectionBlockers(items, hash, overflow) {
  /** @type {Record<string, unknown>[]} */
  const blockers = [];
  if (overflow) blockers.push({ code: 'evidence-incomplete', subject: 'model-packet', evidenceHash: hash });
  const failingStatuses = new Set(['missing', 'malformed', 'stale', 'conflict', 'overflow', 'nontext']);
  for (const item of items) {
    if (item.required && failingStatuses.has(/** @type {string} */ (item.status))) {
      let code = 'evidence-incomplete';
      if (item.status === 'conflict' && (item.source === 'owner-log' || item.source === 'lane-history')) {
        code = 'ambiguous-state';
      } else if (item.source === 'definition-plan' && (item.status === 'malformed' || item.status === 'conflict')) {
        code = 'objective-source-conflict';
      }
      blockers.push({ code, subject: item.source, evidenceHash: hash });
    }
    if (item.source === 'current-run' && item.status === 'present' && typeof item.text === 'string') {
      try {
        const parsed = JSON.parse(item.text);
        const events = Array.isArray(parsed) ? parsed : [parsed];
        for (const event of events) {
          if (event && typeof event === 'object' && [
            'clarification-required',
            'approval-required',
            'external-dependency',
            'safety-or-authority',
          ].includes(event.state)) {
            blockers.push({
              code: event.state,
              subject: `current-run:${event.state}`,
              evidenceHash: hash,
            });
          }
        }
      } catch {
        // Pre-normalized T001 evidence without acquisition records has no semantic blocker.
      }
    }
  }
  blockers.sort(compareBlockers);
  return blockers.filter((blocker, index) => index === 0
    || canonicalJson(blocker) !== canonicalJson(blockers[index - 1]));
}

/**
 * Build an Inspection from already normalized EvidenceItem input without acquiring any source.
 * @param {unknown} target
 * @param {unknown[]} values
 */
export function buildInspection(target, values) {
  const inspectionTarget = canonicalTarget(target);
  const ordered = orderAndDedupeItems(values);
  for (const item of ordered) {
    if (item.status === 'missing' && Object.hasOwn(item, 'text') && item.text !== '') {
      invalid('EvidenceItem.text', 'must be present and empty for an admissible missing item');
    }
    if (!['missing', 'overflow', 'nontext'].includes(/** @type {string} */ (item.status))
      && !Object.hasOwn(item, 'text')) {
      invalid('EvidenceItem.text', 'must contain the complete available body');
    }
  }

  let crossingIndex = ordered.findIndex((item) => item.status === 'overflow');
  let availableCount = 0;
  /** @type {Record<string, unknown>[]} */
  const prefix = [];
  if (crossingIndex < 0 && Buffer.byteLength(canonicalJson(packetProjection(inspectionTarget, []))) > MAX_PACKET_BYTES) {
    crossingIndex = 0;
  }
  for (let index = 0; crossingIndex < 0 && index < ordered.length; index += 1) {
    const item = ordered[index];
    if (!isAvailable(item)) continue;
    availableCount += 1;
    prefix.push(item);
    if (availableCount > MAX_PACKET_ITEMS
      || Buffer.byteLength(canonicalJson(packetProjection(inspectionTarget, prefix))) > MAX_PACKET_BYTES) {
      crossingIndex = index;
    }
  }

  const overflow = crossingIndex >= 0;
  let outputItems = ordered;
  if (overflow) {
    outputItems = ordered.map((item, index) => {
      const output = { ...item };
      if (index >= crossingIndex && isAvailable(item)) output.status = 'overflow';
      delete output.text;
      return output;
    });
  }
  const hash = evidenceHash(inspectionTarget, outputItems, overflow);
  const inspection = {
    target: inspectionTarget,
    items: outputItems,
    evidenceHash: hash,
    overflow,
    blockers: inspectionBlockers(outputItems, hash, overflow),
  };
  validateInspection(inspection);
  return inspection;
}

/** @param {unknown} value */
export function validateInspection(value) {
  const inspection = assertExactRecord(
    value,
    ['target', 'items', 'evidenceHash', 'overflow', 'blockers'],
    [],
    'Inspection',
  );
  validateTarget(inspection.target);
  const items = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(inspection.items, 'Inspection.items')
  );
  const canonicalItems = orderAndDedupeItems(items);
  if (canonicalJson(items) !== canonicalJson(canonicalItems)) {
    invalid('Inspection.items', 'must use canonical source order and contain no exact duplicates');
  }
  if (typeof inspection.overflow !== 'boolean') invalid('Inspection.overflow', 'must be a boolean');
  for (const item of items) {
    if (inspection.overflow) {
      if (Object.hasOwn(item, 'text')) invalid('Inspection.items', 'must be descriptor-only on overflow');
    } else {
      if (item.status === 'overflow') invalid('Inspection.items', 'cannot contain overflow status when admitted');
      const nonAdmittedSession = item.source === 'session'
        && item.required === false
        && item.status === 'missing'
        && !Object.hasOwn(item, 'text');
      if (item.status === 'missing' && !nonAdmittedSession && item.text !== '') {
        invalid('Inspection.items', 'must carry empty text for an admitted missing item');
      }
      if (!['missing', 'nontext'].includes(/** @type {string} */ (item.status))
        && !Object.hasOwn(item, 'text')) {
        invalid('Inspection.items', 'must carry complete admitted text');
      }
    }
  }
  if (!inspection.overflow) {
    const packet = packetProjection(inspection.target, items);
    if (packet.items.length > MAX_PACKET_ITEMS
      || Buffer.byteLength(canonicalJson(packet)) > MAX_PACKET_BYTES) {
      invalid('Inspection.overflow', 'must be true when packet limits are exceeded');
    }
  } else {
    const hasOverflowItem = items.some((item) => item.status === 'overflow');
    const emptyPacketTooLarge = Buffer.byteLength(canonicalJson(packetProjection(inspection.target, []))) > MAX_PACKET_BYTES;
    if (!hasOverflowItem && !emptyPacketTooLarge) invalid('Inspection.overflow', 'requires an overflow descriptor');
    let crossed = false;
    for (const item of items) {
      if (item.status === 'overflow') crossed = true;
      else if (crossed && !['missing', 'nontext'].includes(/** @type {string} */ (item.status))) {
        invalid('Inspection.items', 'available descriptors after the first crossing must be overflow');
      }
    }
  }
  assertHash(inspection.evidenceHash, 'Inspection.evidenceHash');
  const recomputed = evidenceHash(
    inspection.target,
    items,
    /** @type {boolean} */ (inspection.overflow),
  );
  if (inspection.evidenceHash !== recomputed) invalid('Inspection.evidenceHash', 'does not match its projection');
  const blockers = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(inspection.blockers, 'Inspection.blockers')
  );
  blockers.forEach((blocker, index) => {
    validateBlocker(blocker);
    if (blocker.evidenceHash !== inspection.evidenceHash) {
      invalid('Inspection.blockers', 'must bind the inspection evidence hash');
    }
    if (index > 0 && compareBlockers(blockers[index - 1], blocker) >= 0) {
      invalid('Inspection.blockers', 'must be sorted and duplicate-free');
    }
  });
  const required = inspectionBlockers(items, /** @type {string} */ (inspection.evidenceHash), /** @type {boolean} */ (inspection.overflow));
  if (canonicalJson(blockers) !== canonicalJson(required)) {
    invalid('Inspection.blockers', 'must exactly match the deterministic blocker list');
  }
  return value;
}

/** Return the sole canonical model packet, or null for descriptor-only overflow reports. @param {unknown} value */
export function modelPacket(value) {
  const inspection = /** @type {Record<string, unknown>} */ (validateInspection(value));
  if (inspection.overflow) return null;
  return packetProjection(
    inspection.target,
    assertDenseDataArray(inspection.items, 'Inspection.items'),
  );
}

/** @param {unknown} value */
export function resultHash(value) {
  const result = assertRecord(value, 'result');
  if (!Object.hasOwn(result, 'outcome') || !Object.hasOwn(result, 'changedTargets') || !Object.hasOwn(result, 'blockers')) {
    invalid('result', 'must contain outcome, changedTargets, and blockers');
  }
  assertEnum(result.outcome, OUTCOMES, 'result.outcome');
  const changedTargets = assertSortedUniqueStrings(
    result.changedTargets,
    assertMaterialTarget,
    'result.changedTargets',
  );
  const blockers = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(result.blockers, 'result.blockers')
  );
  blockers.forEach((blocker, index) => {
    validateBlocker(blocker);
    if (index > 0 && compareBlockers(blockers[index - 1], blocker) >= 0) {
      invalid('result.blockers', 'must be sorted and duplicate-free');
    }
  });
  return sha256(canonicalJson({
    outcome: result.outcome,
    changedTargets,
    blockers: blockers.map(({ code, subject, evidenceHash: hash }) => ({ code, subject, evidenceHash: hash })),
  }));
}

/** @param {unknown} value @param {string} label */
function validateBudget(value, label) {
  if (value === 'unlimited') return;
  assertSafeInteger(value, label, true);
}

/** @param {Record<string, unknown>} completion */
function pendingCompletionSealHash(completion) {
  return sha256(canonicalJson({
    version: completion.version,
    target: canonicalTarget(/** @type {Record<string, unknown>} */ (completion.target)),
    evidenceHash: completion.evidenceHash,
    approachHash: completion.approachHash,
    resultHash: completion.resultHash,
    priorApproachHash: completion.priorApproachHash,
  }));
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} entry */
function repeatedApproachSealHash(target, entry) {
  return sha256(canonicalJson({
    version: 1,
    kind: 'approach-repeat',
    target: canonicalTarget(target),
    evidenceHash: entry.evidenceHash,
    approachHash: entry.approachHash,
    resultHash: entry.resultHash,
  }));
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} prior @param {Record<string, unknown>} repeated */
function retainedResultSealHash(target, prior, repeated) {
  return sha256(canonicalJson({
    version: 1,
    kind: 'retained-result-repeat',
    target: canonicalTarget(target),
    evidenceHash: repeated.evidenceHash,
    resultHash: repeated.resultHash,
    priorApproachHash: prior.approachHash,
    repeatedApproachHash: repeated.approachHash,
  }));
}

/** @param {unknown} value @param {string} label */
function validatePendingCompletionSeal(value, label) {
  const candidate = assertRecord(value, label);
  if (candidate.version === 2) return validatePendingCompletionRetentionV2(candidate, label);
  const completion = assertExactRecord(
    value,
    ['version', 'target', 'evidenceHash', 'approachHash', 'resultHash', 'priorApproachHash'],
    [],
    label,
  );
  if (completion.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateTarget(completion.target);
  if (isFeatureTarget(/** @type {Record<string, unknown>} */ (completion.target))) {
    invalid(`${label}.target`, 'must identify a task target');
  }
  assertHash(completion.evidenceHash, `${label}.evidenceHash`);
  assertHash(completion.approachHash, `${label}.approachHash`);
  assertHash(completion.resultHash, `${label}.resultHash`);
  assertHash(completion.priorApproachHash, `${label}.priorApproachHash`);
  return completion;
}

/** @param {unknown} value @param {string} label */
function validateLearningGovernanceSeal(value, label) {
  const candidate = assertRecord(value, label);
  if (Object.hasOwn(candidate, 'governanceIdentity')) return validateLearningGovernanceV1(candidate, label);
  const governance = assertExactRecord(
    value,
    ['version', 'target', 'phase', 'revision', 'triggerEvidenceHash'],
    [],
    label,
  );
  if (governance.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateTarget(governance.target);
  if (isFeatureTarget(/** @type {Record<string, unknown>} */ (governance.target))) {
    invalid(`${label}.target`, 'must identify a task target');
  }
  if (governance.phase !== 'required') invalid(`${label}.phase`, 'must be required');
  if (governance.revision !== 1) invalid(`${label}.revision`, 'must be the literal safe integer 1');
  assertHash(governance.triggerEvidenceHash, `${label}.triggerEvidenceHash`);
  if (Buffer.byteLength(canonicalJson(governance)) > MAX_LEARNING_GOVERNANCE_BYTES) {
    invalid(label, `exceeds ${MAX_LEARNING_GOVERNANCE_BYTES} canonical UTF-8 bytes`);
  }
  return governance;
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} target */
function hasUnresolvedLearningGovernance(state, target) {
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous'
    || !Object.hasOwn(state, 'learningGovernance')) return false;
  const governance = /** @type {Record<string, unknown>} */ (state.learningGovernance);
  return targetKey(governance.target) === targetKey(target);
}

/** @param {unknown} value */
export function validateRunState(value) {
  const state = assertExactRecord(
    value,
    ['policy', 'overallUsed', 'recoveryUsed', 'pending', 'completed'],
    ['evaluationSequences', 'learningReviewRefs', 'pendingCompletion', 'learningGovernance'],
    'RunState',
  );
  const policy = assertExactRecord(
    state.policy,
    ['overall', 'recovery', 'recover', 'untilBlocked', 'mode'],
    [],
    'RunState.policy',
  );
  validateBudget(policy.overall, 'RunState.policy.overall');
  validateBudget(policy.recovery, 'RunState.policy.recovery');
  if (typeof policy.recover !== 'boolean') invalid('RunState.policy.recover', 'must be a boolean');
  if (typeof policy.untilBlocked !== 'boolean') invalid('RunState.policy.untilBlocked', 'must be a boolean');
  assertEnum(policy.mode, ['guarded', 'autonomous'], 'RunState.policy.mode');
  if (policy.recover && policy.untilBlocked) invalid('RunState.policy', 'cannot combine recovery with until-blocked');
  assertSafeInteger(state.overallUsed, 'RunState.overallUsed', false);

  const recoveryUsed = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(state.recoveryUsed, 'RunState.recoveryUsed')
  );
  recoveryUsed.forEach((row, index) => {
    const record = assertExactRecord(row, ['targetKey', 'targetHash', 'count'], [], `RunState.recoveryUsed[${index}]`);
    assertUnicodeScalarString(record.targetKey, `RunState.recoveryUsed[${index}].targetKey`);
    let parsed;
    try {
      parsed = JSON.parse(/** @type {string} */ (record.targetKey));
    } catch {
      invalid(`RunState.recoveryUsed[${index}].targetKey`, 'must be canonical target JSON');
    }
    validateTarget(parsed);
    if (targetKey(parsed) !== record.targetKey) invalid(`RunState.recoveryUsed[${index}].targetKey`, 'must be canonical target JSON');
    if (isFeatureTarget(parsed)) invalid(`RunState.recoveryUsed[${index}].targetKey`, 'must identify a task target');
    assertHash(record.targetHash, `RunState.recoveryUsed[${index}].targetHash`);
    if (targetHash(parsed) !== record.targetHash) invalid(`RunState.recoveryUsed[${index}].targetHash`, 'does not match targetKey');
    assertSafeInteger(record.count, `RunState.recoveryUsed[${index}].count`, true);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (recoveryUsed[index - 1].targetKey),
      /** @type {string} */ (record.targetKey),
    ) >= 0) invalid('RunState.recoveryUsed', 'must be sorted and target-unique');
    if (policy.recovery !== 'unlimited' && record.count > policy.recovery) {
      invalid(`RunState.recoveryUsed[${index}].count`, 'exceeds the recovery budget');
    }
  });
  if (!policy.recover && recoveryUsed.length > 0) {
    invalid('RunState.recoveryUsed', 'requires recovery policy opt-in');
  }

  const pending = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(state.pending, 'RunState.pending')
  );
  if (pending.length > 1) invalid('RunState.pending', 'must remain sequential with no more than one pending authorization');
  let previousPendingKey = '';
  let previousTargetKey = '';
  pending.forEach((entry, index) => {
    const record = assertExactRecord(
      entry,
      ['target', 'evidenceHash', 'approachHash', 'action', 'materialInputs', 'mode'],
      [],
      `RunState.pending[${index}]`,
    );
    validateTarget(record.target);
    const target = /** @type {Record<string, unknown>} */ (record.target);
    if (isFeatureTarget(target)) invalid(`RunState.pending[${index}].target`, 'must identify a task target');
    assertHash(record.evidenceHash, `RunState.pending[${index}].evidenceHash`);
    assertHash(record.approachHash, `RunState.pending[${index}].approachHash`);
    assertEnum(record.action, ACTIONS.filter((action) => action !== 'none'), `RunState.pending[${index}].action`);
    validateMaterialInputs(record.materialInputs, `RunState.pending[${index}].materialInputs`);
    if (record.action === 'reconcile-derived-definition' && target.lane === 'tracked') {
      invalid(`RunState.pending[${index}].action`, 'does not support tracked definition recovery');
    }
    if (!actionInputsMatch(
      target,
      { action: record.action, materialInputs: record.materialInputs },
    )) invalid(`RunState.pending[${index}].materialInputs`, 'does not match its stored action');
    const proposalBoundApproach = policy.mode === 'autonomous'
      && record.action === 'reconcile-derived-definition';
    if (!proposalBoundApproach
      && approachHash({ action: record.action, materialInputs: record.materialInputs }) !== record.approachHash) {
      invalid(`RunState.pending[${index}].approachHash`, 'does not match action and materialInputs');
    }
    assertEnum(record.mode, ['ordinary', 'recovery'], `RunState.pending[${index}].mode`);
    if ((record.mode === 'ordinary' && record.action !== 'execute-task')
      || (record.mode === 'recovery' && record.action === 'execute-task')) {
      invalid(`RunState.pending[${index}]`, 'has an action incompatible with its mode');
    }
    if (record.mode === 'recovery' && !policy.recover) {
      invalid(`RunState.pending[${index}].mode`, 'requires recovery policy opt-in');
    }
    const key = targetKey(target);
    const sortKey = `${key}\u0000${record.evidenceHash}\u0000${record.approachHash}`;
    if (index > 0 && compareUtf8(previousPendingKey, sortKey) >= 0) invalid('RunState.pending', 'must be canonically sorted');
    if (index > 0 && previousTargetKey === key) invalid('RunState.pending', 'must contain unique canonical targets');
    previousPendingKey = sortKey;
    previousTargetKey = key;
  });

  const completed = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(state.completed, 'RunState.completed')
  );
  completed.forEach((entry, index) => {
    const record = assertExactRecord(
      entry,
      ['evidenceHash', 'approachHash', 'resultHash'],
      [],
      `RunState.completed[${index}]`,
    );
    assertHash(record.evidenceHash, `RunState.completed[${index}].evidenceHash`);
    assertHash(record.approachHash, `RunState.completed[${index}].approachHash`);
    assertHash(record.resultHash, `RunState.completed[${index}].resultHash`);
  });
  const hasPendingCompletion = Object.hasOwn(state, 'pendingCompletion');
  const hasLearningGovernance = Object.hasOwn(state, 'learningGovernance');
  /** @type {Record<string, unknown> | null} */
  let pendingCompletion = null;
  if (hasPendingCompletion) {
    pendingCompletion = validatePendingCompletionSeal(
      state.pendingCompletion,
      'RunState.pendingCompletion',
    );
    if (pendingCompletion.version === 1 && !hasLearningGovernance) {
      invalid('RunState.pendingCompletion', 'legacy seal requires learningGovernance');
    }
    if (pendingCompletion.version === 2) {
      if (policy.mode !== 'autonomous') {
        invalid('RunState.pendingCompletion', 'v2 retention requires autonomous policy');
      }
      const definitionReconciliationRetention = hasLearningGovernance
        && pending.length === 1
        && pending[0].action === 'reconcile-derived-definition'
        && pending[0].mode === 'recovery'
        && ['projected', 'no-progress-verified'].includes(
          /** @type {string} */ (/** @type {Record<string, unknown>} */ (state.learningGovernance).phase),
        )
        && pendingCompletion.attemptIdentity
          === completionApproachContextV2(state, pending[0]).attemptIdentity;
      // Only a Feature 009 authorized attempt or the exact proposal-bound
      // definition reconciliation may retain completion beside governance.
      if (hasLearningGovernance
        && !V2_AUTHORIZED_PHASES.includes(
          /** @type {string} */ (/** @type {Record<string, unknown>} */ (state.learningGovernance).phase),
        )
        && !definitionReconciliationRetention) {
        invalid('RunState.pendingCompletion', 'v2 retention cannot coexist with active learning governance');
      }
      if (pending.length !== 1
        || targetKey(pending[0].target) !== targetKey(pendingCompletion.target)) {
        invalid('RunState.pendingCompletion', 'must bind the sole still-pending attempt target');
      }
      const pendingContext = completionApproachContextV2(state, pending[0]);
      if (pendingCompletion.attemptIdentity !== pendingContext.attemptIdentity) {
        invalid('RunState.pendingCompletion.attemptIdentity', 'must bind the exact still-pending authorization and approach');
      }
    }
  }
  if (hasLearningGovernance) {
    if (policy.mode !== 'autonomous') {
      invalid('RunState.learningGovernance', 'is permitted only under autonomous policy');
    }
    const governance = validateLearningGovernanceSeal(
      state.learningGovernance,
      'RunState.learningGovernance',
    );
    const exactV2 = Object.hasOwn(governance, 'governanceIdentity');
    if (exactV2 && governance.phase === 'reviewed'
      && !Object.hasOwn(governance, 'projectionCommitment')) {
      invalid(
        'RunState.learningGovernance.projectionCommitment',
        'must retain the exact learning-result commitment while reviewed',
      );
    }
    let triggerValid = exactV2;
    if (pendingCompletion?.version === 1) {
      if (targetKey(pendingCompletion.target) !== targetKey(governance.target)) {
        invalid('RunState.learningGovernance.target', 'must match pendingCompletion.target');
      }
      triggerValid = governance.triggerEvidenceHash === pendingCompletionSealHash(pendingCompletion)
        && completed.some((entry) => (
          entry.evidenceHash === pendingCompletion.evidenceHash
          && entry.resultHash === pendingCompletion.resultHash
          && entry.approachHash === pendingCompletion.priorApproachHash
        ));
    } else if (!exactV2) {
      triggerValid = completed.some((entry) => (
        repeatedApproachSealHash(
          /** @type {Record<string, unknown>} */ (governance.target),
          entry,
        ) === governance.triggerEvidenceHash
      ));
      for (let repeatedIndex = 1; !triggerValid && repeatedIndex < completed.length; repeatedIndex += 1) {
        const repeated = completed[repeatedIndex];
        for (let priorIndex = 0; priorIndex < repeatedIndex; priorIndex += 1) {
          const prior = completed[priorIndex];
          if (prior.evidenceHash === repeated.evidenceHash
            && prior.resultHash === repeated.resultHash
            && retainedResultSealHash(
              /** @type {Record<string, unknown>} */ (governance.target),
              prior,
              repeated,
            ) === governance.triggerEvidenceHash) {
            triggerValid = true;
            break;
          }
        }
      }
    }
    if (!triggerValid) {
      invalid('RunState.learningGovernance.triggerEvidenceHash', 'must bind deterministic retained repeat evidence');
    }
    const governedPending = pending.filter((entry) => targetKey(entry.target) === targetKey(governance.target));
    if (governedPending.length > 0) {
      const definitionReconciliationPending = governedPending.length === 1
        && governedPending[0].action === 'reconcile-derived-definition'
        && governedPending[0].mode === 'recovery'
        && ['projected', 'no-progress-verified'].includes(/** @type {string} */ (governance.phase));
      // Feature 009 still owns alternative permits. The sole additional shape
      // is the existing definition-reconciliation action beside its retained
      // no-alternative branch; authorization derives that branch freshly.
      const permittedAlternativePending = V2_AUTHORIZED_PHASES.includes(/** @type {string} */ (governance.phase))
        && governedPending.length === 1
        && completionApproachContextV2(state, governedPending[0]).attemptIdentity
          === governance.authorizedAttemptIdentity;
      if (!definitionReconciliationPending && !permittedAlternativePending) {
        invalid('RunState.pending', 'must not authorize the learning-governed target');
      }
    }
  }
  if (policy.overall !== 'unlimited' && state.overallUsed > policy.overall) {
    invalid('RunState.overallUsed', 'exceeds the overall budget');
  }
  const pendingCompletionCount = pendingCompletion?.version === 1 ? 1 : 0;
  if (state.overallUsed !== pending.length + completed.length + pendingCompletionCount) {
    invalid(
      'RunState.overallUsed',
      pendingCompletionCount > 0
        ? 'must equal pending plus completed attempts and the pending completion'
        : 'must equal pending plus completed attempts',
    );
  }
  let recoveryTotal = 0;
  for (const row of recoveryUsed) {
    if (row.count > /** @type {number} */ (state.overallUsed) - recoveryTotal) {
      invalid('RunState.recoveryUsed', 'cannot exceed overall authorized attempts');
    }
    recoveryTotal += /** @type {number} */ (row.count);
  }
  for (let index = 0; index < pending.length; index += 1) {
    if (pending[index].mode !== 'recovery') continue;
    const key = targetKey(pending[index].target);
    if (!recoveryUsed.some((row) => row.targetKey === key)) {
      invalid(`RunState.pending[${index}].mode`, 'requires its canonical recovery counter');
    }
  }
  if (Object.hasOwn(state, 'evaluationSequences')) {
    validateEvaluationSequences(state.evaluationSequences, 'RunState.evaluationSequences');
  }
  if (Object.hasOwn(state, 'learningReviewRefs')) {
    validateLearningReviewRefs(state.learningReviewRefs, 'RunState.learningReviewRefs');
  }
  return value;
}

/** @param {Record<string, unknown>} target */
function isFeatureTarget(target) {
  return !Object.hasOwn(target, 'taskKey') && !Object.hasOwn(target, 'issueId');
}

/** @param {Record<string, unknown>} assessment */
function canonicalAssessment(assessment) {
  const materialInputs = /** @type {Record<string, unknown>} */ (assessment.materialInputs);
  return {
    action: /** @type {string} */ (assessment.action),
    materialInputs: {
      targets: [.../** @type {string[]} */ (materialInputs.targets)],
      operations: [.../** @type {string[]} */ (materialInputs.operations)],
      checks: [.../** @type {string[]} */ (materialInputs.checks)],
    },
  };
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} assessment */
function actionInputsMatch(target, assessment, inspection) {
  const action = /** @type {string} */ (assessment.action);
  const inputs = /** @type {Record<string, unknown>} */ (assessment.materialInputs);
  const targets = /** @type {string[]} */ (inputs.targets);
  const operations = /** @type {string[]} */ (inputs.operations);
  const checks = /** @type {string[]} */ (inputs.checks);
  if (action === 'none') return targets.length === 0 && operations.length === 0 && checks.length === 0;
  if (operations.length !== 1 || operations[0] !== action) return false;
  if (canonicalJson(checks) !== canonicalJson(
    requiredChecksForAction[/** @type {keyof typeof requiredChecksForAction} */ (action)],
  )) return false;
  if (action === 'execute-task' || action === 'retry-task'
    || action === 'address-test' || action === 'address-review') return true;
  if (action === 'reconcile-derived-definition') {
    const packageRoot = /** @type {string} */ (target.specPath).slice(0, -'spec.md'.length);
    const packageTargets = [
      `${packageRoot}plan.md`,
      `${packageRoot}spec.md`,
      `${packageRoot}tasks.md`,
    ];
    let ownerPath = null;
    if (inspection) {
      const ownerItem = /** @type {Record<string, unknown>[]} */ (inspection.items)
        .find((item) => item.source === 'owner-log' && item.status === 'present');
      if (ownerItem && typeof ownerItem.text === 'string') {
        try {
          const owner = assertExactRecord(
            JSON.parse(ownerItem.text),
            ['ideaPath', 'specPath', 'coordinatorLog'],
            [],
            'owner-log body',
          );
          assertDirectIdeaPath(owner.ideaPath, 'owner-log body.ideaPath');
          if (owner.specPath === target.specPath) ownerPath = /** @type {string} */ (owner.ideaPath);
        } catch {
          ownerPath = null;
        }
      }
    }
    const ideaTargets = targets.filter((entry) => /^\.dude\/ideas\/[^/]+\.md$/.test(entry));
    if (ideaTargets.length !== 1) return false;
    if (ownerPath !== null && ideaTargets[0] !== ownerPath) return false;
    const expected = [ideaTargets[0], ...packageTargets].sort(compareUtf8);
    return canonicalJson(targets) === canonicalJson(expected);
  }
  return action === 'retain-learning';
}

/** @param {Record<string, unknown>} state @param {string} reason @param {Record<string, unknown>} [blocker] */
function authorizationRefusal(state, reason, blocker) {
  return blocker
    ? { authorized: false, reason, blocker, state }
    : { authorized: false, reason, state };
}

/** @param {Record<string, unknown>} entry */
function copyPendingEntry(entry) {
  const inputs = /** @type {Record<string, unknown>} */ (entry.materialInputs);
  return {
    target: { .../** @type {Record<string, unknown>} */ (entry.target) },
    evidenceHash: entry.evidenceHash,
    approachHash: entry.approachHash,
    action: entry.action,
    materialInputs: {
      targets: [.../** @type {string[]} */ (inputs.targets)],
      operations: [.../** @type {string[]} */ (inputs.operations)],
      checks: [.../** @type {string[]} */ (inputs.checks)],
    },
    mode: entry.mode,
  };
}

/** @param {Record<string, unknown>} target @param {string} action @param {Record<string, unknown>} materialInputs */
function autonomousApproachBasis(target, action, materialInputs) {
  return {
    version: 1,
    target: canonicalTarget(target),
    action,
    materialInputs: {
      targets: [.../** @type {string[]} */ (materialInputs.targets)],
      operations: [.../** @type {string[]} */ (materialInputs.operations)],
      checks: [.../** @type {string[]} */ (materialInputs.checks)],
    },
    mechanismIdentities: [],
    assumptionIdentities: [],
    evidenceAcquisitionIdentities: [],
    validationPlanIdentities: [],
  };
}

/** @param {Record<string, unknown>} target @param {number} attemptOrdinal @param {string} authorizationEvidenceHash @param {string} approachBasisIdentity */
function autonomousAttemptIdentity(target, attemptOrdinal, authorizationEvidenceHash, approachBasisIdentity) {
  return sha256(canonicalJson({
    version: 2,
    target: canonicalTarget(target),
    attemptOrdinal,
    authorizationEvidenceHash,
    approachBasisIdentity,
  }));
}

const V2_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:/@-]{0,127}$/;
/**
 * The single shared declaration of every lane-history event type this runtime's
 * writer may emit. Each type is declared exactly once with its retention
 * relevance and its own validator: `retention-relevant` types feed occurrence
 * retention and repeat detection, `audit-only` types are validated just as
 * strictly and are then excluded from retention decisions. A type absent from
 * this declaration is unknown and keeps failing closed.
 */
export const LANE_EVENT_TYPES = Object.freeze({
  'approach-occurrence': Object.freeze({ relevance: 'retention-relevant', validate: validateApproachOccurrenceEventV1 }),
  'finding-occurrence': Object.freeze({ relevance: 'retention-relevant', validate: validateFindingOccurrenceEventV1 }),
  'learning-review': Object.freeze({ relevance: 'audit-only', validate: validateLearningReviewEventV2 }),
  'learning-governance': Object.freeze({ relevance: 'audit-only', validate: validateGovernanceEventV1 }),
  'incident-supersession': Object.freeze({ relevance: 'audit-only', validate: validateIncidentSupersessionEventV1 }),
});

/** @param {unknown} type @returns {{relevance: string, validate: (value: unknown, label: string) => unknown} | null} */
function laneEventDeclaration(type) {
  if (typeof type !== 'string' || !Object.hasOwn(LANE_EVENT_TYPES, type)) return null;
  return /** @type {Record<string, {relevance: string, validate: (value: unknown, label: string) => unknown}>} */ (
    LANE_EVENT_TYPES
  )[type];
}
const V2_GOVERNANCE_PHASES = Object.freeze([
  'required',
  'reviewed',
  'projected',
  'alternative-inspected',
  'alternative-permitted',
  'alternative-authorized-pending-lane',
  'alternative-authorized',
  'alternative-verified',
  'no-progress-verified',
]);
const V2_GOVERNANCE_BRANCH_FIELDS = Object.freeze([
  'reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity',
  'postLearningInspectionIdentity', 'issuedAttemptPermitHash', 'consumedAttemptPermitHash',
  'authorizedAttemptIdentity', 'laneClaimReceiptIdentity', 'terminalEvidenceIdentity',
  'suspension', 'halt', 'controlledEnd',
]);
// Closed per-phase rules for every reachable phase. `optional` names the branch
// fields one phase may additionally carry: unchanged suspension while learning
// is unresolved, and Controlled Unresolved End only from `alternative-inspected`
// or `no-progress-verified`. `alternative-permitted` stays unavailable because
// attempt-permit issuance is pure and returns the byte-identical state, so no
// route ever stores that phase. Immediate Halt End likewise stays ephemeral:
// `haltGovernanceV2` returns its outcome without writing state, so no phase
// opens a stored `halt` and `issuedAttemptPermitHash` has no writer either.
const V2_GOVERNANCE_PHASE_RULES = Object.freeze({
  required: {
    required: Object.freeze([]),
    optional: Object.freeze(['suspension']),
    commitment: 'governance-required',
    commitmentKinds: Object.freeze(['learning-governance']),
  },
  reviewed: {
    required: Object.freeze(['reviewIdentity']),
    optional: Object.freeze([]),
    commitment: 'learning-result',
    commitmentKinds: Object.freeze(['learning-review', 'learning-governance']),
  },
  projected: {
    required: Object.freeze(['reviewIdentity']),
    optional: Object.freeze(['suspension']),
    commitment: null,
    commitmentKinds: null,
  },
  'alternative-inspected': {
    required: Object.freeze([
      'reviewIdentity', 'selectedAlternativeIdentity',
      'discriminatingCheckIdentity', 'postLearningInspectionIdentity',
    ]),
    optional: Object.freeze(['suspension', 'controlledEnd']),
    commitment: null,
    commitmentKinds: null,
  },
  'alternative-authorized-pending-lane': {
    required: Object.freeze([
      'reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity',
      'postLearningInspectionIdentity', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity',
    ]),
    optional: Object.freeze([]),
    commitment: null,
    commitmentKinds: null,
  },
  'alternative-authorized': {
    required: Object.freeze([
      'reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity',
      'postLearningInspectionIdentity', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity',
    ]),
    optional: Object.freeze(['laneClaimReceiptIdentity']),
    commitment: null,
    commitmentKinds: null,
  },
  'alternative-verified': {
    required: Object.freeze([
      'reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity',
      'postLearningInspectionIdentity', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity',
    ]),
    optional: Object.freeze(['laneClaimReceiptIdentity']),
    commitment: null,
    commitmentKinds: null,
  },
  'no-progress-verified': {
    required: Object.freeze(['reviewIdentity', 'postLearningInspectionIdentity']),
    optional: Object.freeze(['suspension', 'controlledEnd']),
    commitment: null,
    commitmentKinds: null,
  },
});

/** @param {unknown} phase @param {string} label */
function v2GovernancePhaseRule(phase, label) {
  const rule = Object.hasOwn(V2_GOVERNANCE_PHASE_RULES, /** @type {string} */ (phase))
    ? V2_GOVERNANCE_PHASE_RULES[/** @type {string} */ (phase)]
    : null;
  if (!rule) invalid(label, 'is unavailable before its owning permit, halt, or terminal task');
  return /** @type {{required:string[],optional:string[],commitment:string|null,commitmentKinds:string[]|null}} */ (rule);
}

/**
 * Validate the optional unresolved-governance branch fields and bind them to the
 * exact governed target, phase, and stored branch identities.
 * @param {Record<string, unknown>} record @param {{required:string[],optional:string[]}} phaseRule @param {Record<string, unknown>} target @param {string} label
 */
function validateV2GovernanceBranchFields(record, phaseRule, target, label) {
  if (V2_GOVERNANCE_BRANCH_FIELDS.some((field) => (
    !phaseRule.required.includes(field)
      && !phaseRule.optional.includes(field)
      && Object.hasOwn(record, field)
  ))) invalid(label, `${record.phase} phase forbids branch, permit, receipt, halt, suspension, and terminal fields`);
  if (Object.hasOwn(record, 'suspension')) {
    const suspension = /** @type {Record<string, unknown>} */ (
      validateSuspensionV1(record.suspension, `${label}.suspension`)
    );
    if (canonicalJson(suspension.affectedTarget) !== canonicalJson(target)) {
      invalid(`${label}.suspension.affectedTarget`, 'must be the governed affected target');
    }
  }
  if (Object.hasOwn(record, 'controlledEnd')) {
    const controlledEnd = /** @type {Record<string, unknown>} */ (
      validateControlledUnresolvedEndV1(record.controlledEnd, `${label}.controlledEnd`)
    );
    const branch = /** @type {Record<string, unknown>} */ (controlledEnd.branchEvidence);
    if (branch.sourcePhase !== record.phase) {
      invalid(`${label}.controlledEnd.branchEvidence.sourcePhase`, 'must equal the exact eligible governance phase');
    }
    if (controlledEnd.reviewIdentity !== record.reviewIdentity) {
      invalid(`${label}.controlledEnd.reviewIdentity`, 'must bind the governed learning review');
    }
    // The no-progress branch resolves `postLearningInspectionIdentity` as a
    // NoProgressVerificationV2 identity, never as an Inspection binding.
    const boundIdentity = branch.kind === 'selected-alternative'
      ? branch.postLearningInspectionIdentity
      : branch.noProgressVerificationIdentity;
    if (boundIdentity !== record.postLearningInspectionIdentity
      || (branch.kind === 'selected-alternative'
        && (branch.selectedAlternativeIdentity !== record.selectedAlternativeIdentity
          || branch.discriminatingCheckIdentity !== record.discriminatingCheckIdentity))) {
      invalid(`${label}.controlledEnd.branchEvidence`, 'must bind the exact stored branch identities');
    }
  }
}

/** @param {unknown} value @param {string} label */
function assertV2Identifier(value, label) {
  if (typeof value !== 'string' || !V2_IDENTIFIER_PATTERN.test(value)) {
    invalid(label, 'must be a canonical identifier of at most 128 ASCII bytes');
  }
}

/** @param {unknown} value @param {string} label */
function assertV2SubjectIdentity(value, label) {
  assertUnicodeScalarString(value, label);
  if (typeof value !== 'string') invalid(label, 'must be a string');
  const bytes = Buffer.byteLength(value);
  if (bytes < 1 || bytes > 512 || /[\u0000-\u001f\u007f-\u009f]/.test(value) || value.includes('\\')) {
    invalid(label, 'must contain 1 through 512 UTF-8 bytes, no controls, and use forward slashes');
  }
}

/** @param {unknown} value @param {(value:unknown,label:string)=>void} validate @param {number} min @param {number} max @param {string} label */
function validateV2SortedSet(value, validate, min, max, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length < min || rows.length > max) {
    invalid(label, `must contain ${min} through ${max} rows`);
  }
  rows.forEach((row, index) => {
    validate(row, `${label}[${index}]`);
    if (index > 0 && compareUtf8(/** @type {string} */ (rows[index - 1]), /** @type {string} */ (row)) >= 0) {
      invalid(label, 'must be UTF-8 sorted and duplicate-free');
    }
  });
  return /** @type {string[]} */ (rows);
}

/** @param {unknown} value @param {string} label */
function validateV2HashSet(value, label, min = 0, max = 16) {
  return validateV2SortedSet(value, assertHash, min, max, label);
}

/** @param {unknown} value @param {string} label */
function validateAffectedTargetV2(value, label) {
  const target = /** @type {Record<string, unknown>} */ (assertRecord(value, label));
  validateTarget(target);
  if (isFeatureTarget(target)) invalid(label, 'must identify a task target');
  if (canonicalJson(target) !== canonicalJson(canonicalTarget(target))) {
    invalid(label, 'must use the canonical affected-target shape');
  }
  return target;
}

/** @param {unknown} value @param {string} [label] */
export function validateMaterialInputsV1(value, label = 'MaterialInputsV1') {
  const record = assertExactRecord(value, ['targets', 'operations', 'checks'], [], label);
  validateV2SortedSet(record.targets, assertV2SubjectIdentity, 1, 16, `${label}.targets`);
  validateV2SortedSet(record.operations, assertV2Identifier, 1, 16, `${label}.operations`);
  validateV2SortedSet(record.checks, assertV2Identifier, 1, 16, `${label}.checks`);
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateApproachBasisV1(value, label = 'ApproachBasisV1') {
  const basis = assertExactRecord(
    value,
    ['version', 'target', 'action', 'materialInputs', 'mechanismIdentities', 'assumptionIdentities', 'evidenceAcquisitionIdentities', 'validationPlanIdentities'],
    [],
    label,
  );
  if (basis.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateAffectedTargetV2(basis.target, `${label}.target`);
  assertV2Identifier(basis.action, `${label}.action`);
  validateMaterialInputsV1(basis.materialInputs, `${label}.materialInputs`);
  validateV2HashSet(basis.mechanismIdentities, `${label}.mechanismIdentities`);
  validateV2HashSet(basis.assumptionIdentities, `${label}.assumptionIdentities`);
  validateV2HashSet(basis.evidenceAcquisitionIdentities, `${label}.evidenceAcquisitionIdentities`);
  validateV2HashSet(basis.validationPlanIdentities, `${label}.validationPlanIdentities`);
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateFindingBasisV1(value, label = 'FindingBasisV1') {
  const basis = assertExactRecord(
    value,
    ['version', 'target', 'expectation', 'subjects', 'failureClass', 'checkDefinitionIdentity'],
    [],
    label,
  );
  if (basis.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateAffectedTargetV2(basis.target, `${label}.target`);
  const expectation = assertExactRecord(basis.expectation, ['kind', 'identity'], [], `${label}.expectation`);
  assertEnum(expectation.kind, ['governing-rule', 'expected-condition'], `${label}.expectation.kind`);
  assertHash(expectation.identity, `${label}.expectation.identity`);
  validateV2SortedSet(basis.subjects, assertV2SubjectIdentity, 1, 16, `${label}.subjects`);
  assertV2Identifier(basis.failureClass, `${label}.failureClass`);
  assertHash(basis.checkDefinitionIdentity, `${label}.checkDefinitionIdentity`);
  return value;
}

/** @param {unknown} value @param {string} label */
function validateCapturedBytesV1(value, label) {
  const envelope = assertExactRecord(value, ['base64', 'sha256', 'byteLength'], [], label);
  assertUnicodeScalarString(envelope.base64, `${label}.base64`);
  const encoded = /** @type {string} */ (envelope.base64);
  if (!BASE64_PATTERN.test(encoded)) invalid(`${label}.base64`, 'must be canonical padded RFC4648 base64');
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) invalid(`${label}.base64`, 'must round-trip canonically');
  if (decoded.byteLength > MAX_SOURCE_BODY_BYTES) {
    invalid(label, `exceeds the individual source body resource limit of ${MAX_SOURCE_BODY_BYTES} bytes`);
  }
  assertHash(envelope.sha256, `${label}.sha256`);
  assertSafeInteger(envelope.byteLength, `${label}.byteLength`, false);
  if (decoded.byteLength !== envelope.byteLength || sha256(decoded) !== envelope.sha256) {
    invalid(label, 'descriptor must bind the complete decoded bytes');
  }
  return { envelope, decoded };
}

/** Create one exact CapturedBytesV1 value. @param {string|ArrayBuffer|ArrayBufferView} value */
export function capturedBytesV1(value) {
  const bytes = typeof value === 'string'
    ? Buffer.from(value)
    : value instanceof ArrayBuffer
      ? Buffer.from(value)
      : ArrayBuffer.isView(value)
        ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        : invalid('CapturedBytesV1 input', 'must be text or bytes');
  return { base64: bytes.toString('base64'), sha256: sha256(bytes), byteLength: bytes.byteLength };
}

/** @param {unknown} value @param {string} label @param {number} [min] */
function validateDefinitionHashSetV1(value, label, min = 1) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  return validateV2HashSet(value, label, min, 16);
}

/** @param {unknown} value @param {string} label @param {number} [min] */
function validateDefinitionRevisionHashSetV1(value, label, min = 1) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  return validateV2HashSet(value, label, min, MAX_DEFINITION_REVISION_ROWS);
}

/** @param {Record<string, unknown>} mapping @param {string} category */
function definitionObligationMappingIdentityV1(mapping, category) {
  return sha256(canonicalJson({
    version: 1,
    category,
    sourceAnchorIdentity: mapping.sourceAnchorIdentity,
    successorAnchorIdentities: mapping.successorAnchorIdentities,
    relation: mapping.relation,
  }));
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionObligationMappingSetV1(
  value,
  label = 'DefinitionObligationMappingSetV1',
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const set = assertExactRecord(value, ['version', 'categories', 'componentIdentity'], [], label);
  if (set.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (utilTypes.isProxy(set.categories)) invalid(`${label}.categories`, 'must not be a Proxy');
  const categories = assertDenseDataArray(set.categories, `${label}.categories`);
  if (categories.length !== DEFINITION_OBLIGATION_CATEGORIES.length) {
    invalid(
      `${label}.categories`,
      `must contain exactly ${DEFINITION_OBLIGATION_CATEGORIES.join(', ')} including safety`,
    );
  }
  const mappingIdentities = new Set();
  categories.forEach((categoryValue, categoryIndex) => {
    const categoryLabel = `${label}.categories[${categoryIndex}]`;
    if (utilTypes.isProxy(categoryValue)) invalid(categoryLabel, 'must not be a Proxy');
    const category = assertExactRecord(
      categoryValue,
      ['category', 'preChangeAnchors', 'postChangeAnchors', 'mappings'],
      [],
      categoryLabel,
    );
    if (category.category !== DEFINITION_OBLIGATION_CATEGORIES[categoryIndex]) {
      invalid(
        `${categoryLabel}.category`,
        `must be ${DEFINITION_OBLIGATION_CATEGORIES[categoryIndex]} in the complete sorted category table`,
      );
    }
    const preChangeAnchors = validateDefinitionRevisionHashSetV1(
      category.preChangeAnchors,
      `${categoryLabel}.preChangeAnchors`,
    );
    const postChangeAnchors = validateDefinitionRevisionHashSetV1(
      category.postChangeAnchors,
      `${categoryLabel}.postChangeAnchors`,
    );
    if (utilTypes.isProxy(category.mappings)) invalid(`${categoryLabel}.mappings`, 'must not be a Proxy');
    const mappings = assertDenseDataArray(category.mappings, `${categoryLabel}.mappings`);
    if (mappings.length < 1 || mappings.length > MAX_DEFINITION_REVISION_ROWS) {
      invalid(
        `${categoryLabel}.mappings`,
        `must contain 1 through ${MAX_DEFINITION_REVISION_ROWS} rows`,
      );
    }
    const preChangeSet = new Set(preChangeAnchors);
    const postChangeSet = new Set(postChangeAnchors);
    const mappedSources = new Set();
    mappings.forEach((mappingValue, mappingIndex) => {
      const mappingLabel = `${categoryLabel}.mappings[${mappingIndex}]`;
      if (utilTypes.isProxy(mappingValue)) invalid(mappingLabel, 'must not be a Proxy');
      const mapping = assertExactRecord(
        mappingValue,
        [
          'mappingIdentity', 'sourceAnchorIdentity', 'successorAnchorIdentities',
          'relation',
        ],
        [],
        mappingLabel,
      );
      assertHash(mapping.mappingIdentity, `${mappingLabel}.mappingIdentity`);
      assertHash(mapping.sourceAnchorIdentity, `${mappingLabel}.sourceAnchorIdentity`);
      const successors = validateDefinitionRevisionHashSetV1(
        mapping.successorAnchorIdentities,
        `${mappingLabel}.successorAnchorIdentities`,
      );
      assertEnum(mapping.relation, ['equal', 'stronger'], `${mappingLabel}.relation`);
      if (!preChangeSet.has(/** @type {string} */ (mapping.sourceAnchorIdentity))) {
        invalid(`${mappingLabel}.sourceAnchorIdentity`, 'must resolve in the declared pre-change anchors');
      }
      if (mappedSources.has(mapping.sourceAnchorIdentity)) {
        invalid(`${categoryLabel}.mappings`, 'must map each pre-change anchor exactly once');
      }
      if (successors.some((identity) => !postChangeSet.has(identity))) {
        invalid(`${mappingLabel}.successorAnchorIdentities`, 'must resolve in the declared post-change anchors');
      }
      const expectedIdentity = definitionObligationMappingIdentityV1(mapping, /** @type {string} */ (category.category));
      if (mapping.mappingIdentity !== expectedIdentity) {
        invalid(`${mappingLabel}.mappingIdentity`, 'must equal the exact closed mapping identity');
      }
      if (mappingIdentities.has(mapping.mappingIdentity)) {
        invalid(`${label}.categories`, 'must contain duplicate-free mapping identities');
      }
      if (mappingIndex > 0 && compareUtf8(
        /** @type {string} */ (/** @type {Record<string, unknown>} */ (mappings[mappingIndex - 1])).sourceAnchorIdentity,
        /** @type {string} */ (mapping.sourceAnchorIdentity),
      ) >= 0) {
        invalid(`${categoryLabel}.mappings`, 'must be sorted by sourceAnchorIdentity and duplicate-free');
      }
      mappedSources.add(mapping.sourceAnchorIdentity);
      mappingIdentities.add(mapping.mappingIdentity);
    });
    if (mappedSources.size !== preChangeSet.size
      || preChangeAnchors.some((identity) => !mappedSources.has(identity))) {
      invalid(`${categoryLabel}.mappings`, 'must map every declared pre-change anchor exactly once');
    }
  });
  assertHash(set.componentIdentity, `${label}.componentIdentity`);
  const expectedIdentity = sha256(canonicalJson({ version: 1, categories: set.categories }));
  if (set.componentIdentity !== expectedIdentity) {
    invalid(`${label}.componentIdentity`, 'must equal the exact closed component identity');
  }
  if (Buffer.byteLength(canonicalJson(set)) > MAX_DEFINITION_REVISION_COMPONENT_BYTES) {
    invalid(label, `must serialize to at most ${MAX_DEFINITION_REVISION_COMPONENT_BYTES} UTF-8 bytes`);
  }
  return value;
}

/** Build one closed obligation mapping component without inferring semantic strength. @param {unknown} value */
export function buildDefinitionObligationMappingSetV1(value) {
  const label = 'buildDefinitionObligationMappingSetV1';
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  assertProxyFreeDataGraph(value, label);
  const input = assertExactRecord(value, ['categories'], [], label);
  if (utilTypes.isProxy(input.categories)) invalid(`${label}.categories`, 'must not be a Proxy');
  const categories = assertDenseDataArray(input.categories, `${label}.categories`).map(
    (categoryValue, categoryIndex) => {
      const categoryLabel = `${label}.categories[${categoryIndex}]`;
      if (utilTypes.isProxy(categoryValue)) invalid(categoryLabel, 'must not be a Proxy');
      const category = assertExactRecord(
        categoryValue,
        ['category', 'preChangeAnchors', 'postChangeAnchors', 'mappings'],
        [],
        categoryLabel,
      );
      if (utilTypes.isProxy(category.mappings)) invalid(`${categoryLabel}.mappings`, 'must not be a Proxy');
      const mappings = assertDenseDataArray(category.mappings, `${categoryLabel}.mappings`).map(
        (mappingValue, mappingIndex) => {
          const mappingLabel = `${categoryLabel}.mappings[${mappingIndex}]`;
          if (utilTypes.isProxy(mappingValue)) invalid(mappingLabel, 'must not be a Proxy');
          const mapping = assertExactRecord(
            mappingValue,
            ['sourceAnchorIdentity', 'successorAnchorIdentities', 'relation'],
            [],
            mappingLabel,
          );
          return {
            ...mapping,
            mappingIdentity: definitionObligationMappingIdentityV1(
              mapping,
              /** @type {string} */ (category.category),
            ),
          };
        },
      );
      return {
        category: category.category,
        preChangeAnchors: category.preChangeAnchors,
        postChangeAnchors: category.postChangeAnchors,
        mappings,
      };
    },
  );
  const body = JSON.parse(canonicalJson({ version: 1, categories }));
  const set = { ...body, componentIdentity: sha256(canonicalJson(body)) };
  validateDefinitionObligationMappingSetV1(set);
  return set;
}

/** @param {Record<string, unknown>} mapping */
function definitionCheckMappingIdentityV1(mapping) {
  return sha256(canonicalJson({
    version: 1,
    oldCheckIdentity: mapping.oldCheckIdentity,
    newCheckIdentity: mapping.newCheckIdentity,
    disposition: mapping.disposition,
    intendedInvariantIdentity: mapping.intendedInvariantIdentity,
    triggerEvidenceIdentities: mapping.triggerEvidenceIdentities,
  }));
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionCheckMappingSetV1(
  value,
  label = 'DefinitionCheckMappingSetV1',
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const set = assertExactRecord(
    value,
    [
      'version', 'preChangeCheckAnchors', 'postChangeCheckAnchors', 'mappings',
      'componentIdentity',
    ],
    [],
    label,
  );
  if (set.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const preChangeAnchors = validateDefinitionRevisionHashSetV1(
    set.preChangeCheckAnchors,
    `${label}.preChangeCheckAnchors`,
  );
  const postChangeAnchors = validateDefinitionRevisionHashSetV1(
    set.postChangeCheckAnchors,
    `${label}.postChangeCheckAnchors`,
  );
  if (utilTypes.isProxy(set.mappings)) invalid(`${label}.mappings`, 'must not be a Proxy');
  const mappings = assertDenseDataArray(set.mappings, `${label}.mappings`);
  if (mappings.length < 1 || mappings.length > MAX_DEFINITION_REVISION_ROWS) {
    invalid(`${label}.mappings`, `must contain 1 through ${MAX_DEFINITION_REVISION_ROWS} rows`);
  }
  const preChangeSet = new Set(preChangeAnchors);
  const postChangeSet = new Set(postChangeAnchors);
  const mappedSources = new Set();
  const mappingIdentities = new Set();
  mappings.forEach((mappingValue, mappingIndex) => {
    const mappingLabel = `${label}.mappings[${mappingIndex}]`;
    if (utilTypes.isProxy(mappingValue)) invalid(mappingLabel, 'must not be a Proxy');
    const mapping = assertExactRecord(
      mappingValue,
      [
        'mappingIdentity', 'oldCheckIdentity', 'newCheckIdentity', 'disposition',
        'intendedInvariantIdentity', 'triggerEvidenceIdentities',
      ],
      [],
      mappingLabel,
    );
    // intendedInvariantIdentity resolves against no declared anchor set; the
    // reviewer's intendedInvariantJudgment over mappingIdentity resolves it.
    for (const field of ['mappingIdentity', 'oldCheckIdentity', 'newCheckIdentity', 'intendedInvariantIdentity']) {
      assertHash(mapping[field], `${mappingLabel}.${field}`);
    }
    assertEnum(mapping.disposition, ['retained', 'successor'], `${mappingLabel}.disposition`);
    const triggerEvidence = validateDefinitionRevisionHashSetV1(
      mapping.triggerEvidenceIdentities,
      `${mappingLabel}.triggerEvidenceIdentities`,
      0,
    );
    if (!preChangeSet.has(/** @type {string} */ (mapping.oldCheckIdentity))) {
      invalid(`${mappingLabel}.oldCheckIdentity`, 'must resolve in the declared pre-change checks');
    }
    if (!postChangeSet.has(/** @type {string} */ (mapping.newCheckIdentity))) {
      invalid(`${mappingLabel}.newCheckIdentity`, 'must resolve in the declared post-change checks');
    }
    if (mappedSources.has(mapping.oldCheckIdentity)) {
      invalid(`${label}.mappings`, 'must map each pre-change check exactly once');
    }
    if (mapping.disposition === 'retained') {
      if (mapping.oldCheckIdentity !== mapping.newCheckIdentity) {
        invalid(mappingLabel, 'retained checks must keep the exact old check identity');
      }
      if (triggerEvidence.length !== 0) {
        invalid(`${mappingLabel}.triggerEvidenceIdentities`, 'must be empty for a retained check');
      }
    } else {
      if (mapping.oldCheckIdentity === mapping.newCheckIdentity) {
        invalid(mappingLabel, 'a successor check must have a different exact check identity');
      }
      if (triggerEvidence.length < 1) {
        invalid(
          `${mappingLabel}.triggerEvidenceIdentities`,
          'must retain trigger evidence for a replaced defective literal',
        );
      }
    }
    const expectedIdentity = definitionCheckMappingIdentityV1(mapping);
    if (mapping.mappingIdentity !== expectedIdentity) {
      invalid(`${mappingLabel}.mappingIdentity`, 'must equal the exact closed mapping identity');
    }
    if (mappingIdentities.has(mapping.mappingIdentity)) {
      invalid(`${label}.mappings`, 'must contain duplicate-free mapping identities');
    }
    if (mappingIndex > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (mappings[mappingIndex - 1])).oldCheckIdentity,
      /** @type {string} */ (mapping.oldCheckIdentity),
    ) >= 0) {
      invalid(`${label}.mappings`, 'must be sorted by oldCheckIdentity and duplicate-free');
    }
    mappedSources.add(mapping.oldCheckIdentity);
    mappingIdentities.add(mapping.mappingIdentity);
  });
  if (mappedSources.size !== preChangeSet.size
    || preChangeAnchors.some((identity) => !mappedSources.has(identity))) {
    invalid(`${label}.mappings`, 'must map every declared pre-change check exactly once');
  }
  assertHash(set.componentIdentity, `${label}.componentIdentity`);
  const expectedIdentity = sha256(canonicalJson({
    version: 1,
    preChangeCheckAnchors: set.preChangeCheckAnchors,
    postChangeCheckAnchors: set.postChangeCheckAnchors,
    mappings: set.mappings,
  }));
  if (set.componentIdentity !== expectedIdentity) {
    invalid(`${label}.componentIdentity`, 'must equal the exact closed component identity');
  }
  if (Buffer.byteLength(canonicalJson(set)) > MAX_DEFINITION_REVISION_COMPONENT_BYTES) {
    invalid(label, `must serialize to at most ${MAX_DEFINITION_REVISION_COMPONENT_BYTES} UTF-8 bytes`);
  }
  return value;
}

/** Build one closed check mapping component without judging adequacy. @param {unknown} value */
export function buildDefinitionCheckMappingSetV1(value) {
  const label = 'buildDefinitionCheckMappingSetV1';
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  assertProxyFreeDataGraph(value, label);
  const input = assertExactRecord(
    value,
    ['preChangeCheckAnchors', 'postChangeCheckAnchors', 'mappings'],
    [],
    label,
  );
  if (utilTypes.isProxy(input.mappings)) invalid(`${label}.mappings`, 'must not be a Proxy');
  const mappings = assertDenseDataArray(input.mappings, `${label}.mappings`).map(
    (mappingValue, mappingIndex) => {
      const mappingLabel = `${label}.mappings[${mappingIndex}]`;
      if (utilTypes.isProxy(mappingValue)) invalid(mappingLabel, 'must not be a Proxy');
      const mapping = assertExactRecord(
        mappingValue,
        [
          'oldCheckIdentity', 'newCheckIdentity', 'disposition',
          'intendedInvariantIdentity', 'triggerEvidenceIdentities',
        ],
        [],
        mappingLabel,
      );
      return { ...mapping, mappingIdentity: definitionCheckMappingIdentityV1(mapping) };
    },
  );
  const body = JSON.parse(canonicalJson({
    version: 1,
    preChangeCheckAnchors: input.preChangeCheckAnchors,
    postChangeCheckAnchors: input.postChangeCheckAnchors,
    mappings,
  }));
  const set = { ...body, componentIdentity: sha256(canonicalJson(body)) };
  validateDefinitionCheckMappingSetV1(set);
  return set;
}

/** @param {unknown} value @param {string} label */
function assertDefinitionTaskKeyV1(value, label) {
  if (typeof value !== 'string' || !TASK_KEY_PATTERN.test(value)) {
    invalid(label, 'must be a durable task key');
  }
}

/** @param {unknown} value @param {string} label @param {number} min */
function validateDefinitionTaskKeySetV1(value, label, min) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  return validateV2SortedSet(
    value,
    assertDefinitionTaskKeyV1,
    min,
    MAX_DEFINITION_REVISION_ROWS,
    label,
  );
}

/** @param {unknown} value @param {string} label */
function validateDefinitionTaskAnchorV1(value, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const anchor = assertExactRecord(
    value,
    ['taskKey', 'taskScopeIdentity', 'acceptanceObligationIdentities'],
    [],
    label,
  );
  assertDefinitionTaskKeyV1(anchor.taskKey, `${label}.taskKey`);
  // taskScopeIdentity resolves against no declared anchor set; the reviewer's
  // taskScopeJudgment over reconciliationIdentity resolves it.
  assertHash(anchor.taskScopeIdentity, `${label}.taskScopeIdentity`);
  validateDefinitionRevisionHashSetV1(
    anchor.acceptanceObligationIdentities,
    `${label}.acceptanceObligationIdentities`,
  );
  return anchor;
}

/** @param {unknown} value @param {string} label @param {number} min @param {number} max */
function validateDefinitionTaskAnchorSetV1(value, label, min, max) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const anchors = assertDenseDataArray(value, label);
  if (anchors.length < min || anchors.length > max) {
    invalid(label, `must contain ${min} through ${max} rows`);
  }
  anchors.forEach((anchorValue, index) => {
    const anchor = validateDefinitionTaskAnchorV1(anchorValue, `${label}[${index}]`);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (anchors[index - 1])).taskKey,
      /** @type {string} */ (anchor.taskKey),
    ) >= 0) invalid(label, 'must be sorted by taskKey and duplicate-free');
  });
  return /** @type {Record<string, unknown>[]} */ (anchors);
}

/** @param {unknown} value @param {string} label */
function validateDroppedDefectiveArchiveV1(value, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const archive = assertExactRecord(
    value,
    [
      'archiveIdentity', 'defectEvidenceIdentities', 'triggerEvidenceIdentities',
      'successorTaskKeys', 'successorObligationMappingIdentities',
      'successorCheckMappingIdentities',
    ],
    [],
    label,
  );
  // archiveIdentity resolves against no declared anchor set; the reviewer's
  // archiveAuthorityJudgment over reconciliationIdentity resolves it.
  assertHash(archive.archiveIdentity, `${label}.archiveIdentity`);
  validateDefinitionRevisionHashSetV1(
    archive.defectEvidenceIdentities,
    `${label}.defectEvidenceIdentities`,
  );
  validateDefinitionRevisionHashSetV1(
    archive.triggerEvidenceIdentities,
    `${label}.triggerEvidenceIdentities`,
  );
  validateDefinitionTaskKeySetV1(archive.successorTaskKeys, `${label}.successorTaskKeys`, 1);
  validateDefinitionRevisionHashSetV1(
    archive.successorObligationMappingIdentities,
    `${label}.successorObligationMappingIdentities`,
  );
  validateDefinitionRevisionHashSetV1(
    archive.successorCheckMappingIdentities,
    `${label}.successorCheckMappingIdentities`,
  );
  return archive;
}

/** @param {unknown} value @param {string} label @param {boolean} withIdentity */
function definitionTaskReconciliationRowBodyV1(value, label, withIdentity) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const candidate = assertRecord(value, label);
  assertEnum(candidate.disposition, DEFINITION_TASK_RECONCILIATION_DISPOSITIONS, `${label}.disposition`);
  const dropped = candidate.disposition === 'dropped-defective';
  const row = assertExactRecord(
    value,
    [
      ...(withIdentity ? ['reconciliationIdentity'] : []),
      'disposition', 'oldTasks', 'finalTasks', 'decompositionBasisIdentities',
      ...(dropped ? ['archive'] : []),
    ],
    [],
    label,
  );
  const cardinalities = {
    'one-to-one-kept': [1, 1, 1, 1],
    changed: [1, 1, 1, 1],
    split: [1, 1, 2, MAX_DEFINITION_REVISION_ROWS],
    merged: [2, MAX_DEFINITION_REVISION_ROWS, 1, 1],
    dropped: [1, 1, 0, 0],
    'dropped-defective': [1, 1, 1, MAX_DEFINITION_REVISION_ROWS],
    new: [0, 0, 1, 1],
  }[/** @type {keyof typeof cardinalities} */ (row.disposition)];
  const oldTasks = validateDefinitionTaskAnchorSetV1(
    row.oldTasks,
    `${label}.oldTasks`,
    cardinalities[0],
    cardinalities[1],
  );
  const finalTasks = validateDefinitionTaskAnchorSetV1(
    row.finalTasks,
    `${label}.finalTasks`,
    cardinalities[2],
    cardinalities[3],
  );
  validateDefinitionRevisionHashSetV1(
    row.decompositionBasisIdentities,
    `${label}.decompositionBasisIdentities`,
  );
  if (row.disposition === 'one-to-one-kept'
    && oldTasks[0].taskKey !== finalTasks[0].taskKey) {
    invalid(label, 'one-to-one-kept must retain the exact durable task key');
  }
  if (dropped) {
    const archive = validateDroppedDefectiveArchiveV1(row.archive, `${label}.archive`);
    const finalTaskKeys = finalTasks.map((anchor) => anchor.taskKey);
    if (canonicalJson(archive.successorTaskKeys) !== canonicalJson(finalTaskKeys)) {
      invalid(`${label}.archive.successorTaskKeys`, 'must identify every exact final successor task');
    }
  }
  const body = {
    disposition: row.disposition,
    oldTasks: row.oldTasks,
    finalTasks: row.finalTasks,
    decompositionBasisIdentities: row.decompositionBasisIdentities,
    ...(dropped ? { archive: row.archive } : {}),
  };
  if (withIdentity) {
    assertHash(row.reconciliationIdentity, `${label}.reconciliationIdentity`);
    const expectedIdentity = sha256(canonicalJson({ version: 1, ...body }));
    if (row.reconciliationIdentity !== expectedIdentity) {
      invalid(`${label}.reconciliationIdentity`, 'must equal the exact closed reconciliation identity');
    }
  }
  return body;
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionTaskReconciliationV1(
  value,
  label = 'DefinitionTaskReconciliationV1',
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const reconciliation = assertExactRecord(
    value,
    ['version', 'declaredOldTaskKeys', 'declaredFinalTaskKeys', 'rows', 'componentIdentity'],
    [],
    label,
  );
  if (reconciliation.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const declaredOld = validateDefinitionTaskKeySetV1(
    reconciliation.declaredOldTaskKeys,
    `${label}.declaredOldTaskKeys`,
    0,
  );
  const declaredFinal = validateDefinitionTaskKeySetV1(
    reconciliation.declaredFinalTaskKeys,
    `${label}.declaredFinalTaskKeys`,
    1,
  );
  if (utilTypes.isProxy(reconciliation.rows)) invalid(`${label}.rows`, 'must not be a Proxy');
  const rows = assertDenseDataArray(reconciliation.rows, `${label}.rows`);
  if (rows.length < 1 || rows.length > MAX_DEFINITION_REVISION_ROWS) {
    invalid(`${label}.rows`, `must contain 1 through ${MAX_DEFINITION_REVISION_ROWS} rows`);
  }
  const oldCoverage = new Set();
  const finalCoverage = new Set();
  const rowIdentities = new Set();
  rows.forEach((rowValue, rowIndex) => {
    const rowLabel = `${label}.rows[${rowIndex}]`;
    definitionTaskReconciliationRowBodyV1(rowValue, rowLabel, true);
    const row = /** @type {Record<string, unknown>} */ (rowValue);
    if (rowIdentities.has(row.reconciliationIdentity)) {
      invalid(`${label}.rows`, 'must contain duplicate-free reconciliation identities');
    }
    if (rowIndex > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (rows[rowIndex - 1])).reconciliationIdentity,
      /** @type {string} */ (row.reconciliationIdentity),
    ) >= 0) {
      invalid(`${label}.rows`, 'must be sorted by reconciliationIdentity and duplicate-free');
    }
    for (const anchor of /** @type {Record<string, unknown>[]} */ (row.oldTasks)) {
      if (oldCoverage.has(anchor.taskKey)) invalid(`${label}.rows`, 'must cover each old task exactly once');
      oldCoverage.add(anchor.taskKey);
    }
    for (const anchor of /** @type {Record<string, unknown>[]} */ (row.finalTasks)) {
      if (finalCoverage.has(anchor.taskKey)) invalid(`${label}.rows`, 'must cover each final task exactly once');
      finalCoverage.add(anchor.taskKey);
    }
    rowIdentities.add(row.reconciliationIdentity);
  });
  if (canonicalJson([...oldCoverage].sort(compareUtf8)) !== canonicalJson(declaredOld)) {
    invalid(`${label}.rows`, 'must completely and exactly cover declaredOldTaskKeys');
  }
  if (canonicalJson([...finalCoverage].sort(compareUtf8)) !== canonicalJson(declaredFinal)) {
    invalid(`${label}.rows`, 'must completely and exactly cover declaredFinalTaskKeys');
  }
  assertHash(reconciliation.componentIdentity, `${label}.componentIdentity`);
  const expectedIdentity = sha256(canonicalJson({
    version: 1,
    declaredOldTaskKeys: reconciliation.declaredOldTaskKeys,
    declaredFinalTaskKeys: reconciliation.declaredFinalTaskKeys,
    rows: reconciliation.rows,
  }));
  if (reconciliation.componentIdentity !== expectedIdentity) {
    invalid(`${label}.componentIdentity`, 'must equal the exact closed component identity');
  }
  if (Buffer.byteLength(canonicalJson(reconciliation)) > MAX_DEFINITION_REVISION_COMPONENT_BYTES) {
    invalid(label, `must serialize to at most ${MAX_DEFINITION_REVISION_COMPONENT_BYTES} UTF-8 bytes`);
  }
  return value;
}

/** Build one closed task-reconciliation component without deciding task state. @param {unknown} value */
export function buildDefinitionTaskReconciliationV1(value) {
  const label = 'buildDefinitionTaskReconciliationV1';
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  assertProxyFreeDataGraph(value, label);
  const input = assertExactRecord(
    value,
    ['declaredOldTaskKeys', 'declaredFinalTaskKeys', 'rows'],
    [],
    label,
  );
  if (utilTypes.isProxy(input.rows)) invalid(`${label}.rows`, 'must not be a Proxy');
  const rows = assertDenseDataArray(input.rows, `${label}.rows`).map((rowValue, rowIndex) => {
    const body = definitionTaskReconciliationRowBodyV1(
      rowValue,
      `${label}.rows[${rowIndex}]`,
      false,
    );
    return {
      ...JSON.parse(canonicalJson(body)),
      reconciliationIdentity: sha256(canonicalJson({ version: 1, ...body })),
    };
  }).sort((left, right) => compareUtf8(left.reconciliationIdentity, right.reconciliationIdentity));
  const body = JSON.parse(canonicalJson({
    version: 1,
    declaredOldTaskKeys: input.declaredOldTaskKeys,
    declaredFinalTaskKeys: input.declaredFinalTaskKeys,
    rows,
  }));
  const reconciliation = { ...body, componentIdentity: sha256(canonicalJson(body)) };
  validateDefinitionTaskReconciliationV1(reconciliation);
  return reconciliation;
}

/** @param {Record<string, unknown>} proof @param {string} label */
function validateDefinitionRevisionProofCrossReferencesV1(proof, label) {
  const obligationMappings = /** @type {Record<string, unknown>} */ (proof.obligationMappings);
  const checkMappings = /** @type {Record<string, unknown>} */ (proof.checkMappings);
  const reconciliation = /** @type {Record<string, unknown>} */ (proof.taskReconciliation);
  const categories = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(obligationMappings.categories, `${label}.obligationMappings.categories`)
  );
  const acceptanceCategory = /** @type {Record<string, unknown>} */ (
    categories.find((category) => category.category === 'acceptance')
  );
  const preAcceptanceIdentities = new Set(/** @type {string[]} */ (assertDenseDataArray(
    acceptanceCategory.preChangeAnchors,
    `${label}.obligationMappings.acceptance.preChangeAnchors`,
  )));
  const finalAcceptanceIdentities = new Set(/** @type {string[]} */ (assertDenseDataArray(
    acceptanceCategory.postChangeAnchors,
    `${label}.obligationMappings.acceptance.postChangeAnchors`,
  )));
  const obligationIdentities = new Set(categories
    .flatMap((category, categoryIndex) => /** @type {Record<string, unknown>[]} */ (
      assertDenseDataArray(
        category.mappings,
        `${label}.obligationMappings.categories[${categoryIndex}].mappings`,
      )
    ))
    .map((mapping) => mapping.mappingIdentity));
  const checkIdentities = new Set(/** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(checkMappings.mappings, `${label}.checkMappings.mappings`)
  ).map((mapping) => mapping.mappingIdentity));
  const ownedPreAcceptance = new Set();
  const ownedPostAcceptance = new Set();
  const rows = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(reconciliation.rows, `${label}.taskReconciliation.rows`)
  );
  for (const [rowIndex, row] of rows.entries()) {
    const rowLabel = `${label}.taskReconciliation.rows[${rowIndex}]`;
    /** @type {Record<string, Record<string, unknown>[]>} */
    const anchorSets = {};
    for (const [field, allowed, owned] of /** @type {[string, Set<unknown>, Set<unknown>][]} */ ([
      ['oldTasks', preAcceptanceIdentities, ownedPreAcceptance],
      ['finalTasks', finalAcceptanceIdentities, ownedPostAcceptance],
    ])) {
      const tasks = /** @type {Record<string, unknown>[]} */ (
        assertDenseDataArray(row[field], `${rowLabel}.${field}`)
      );
      anchorSets[field] = tasks;
      for (const [taskIndex, task] of tasks.entries()) {
        const identities = /** @type {string[]} */ (assertDenseDataArray(
          task.acceptanceObligationIdentities,
          `${rowLabel}.${field}[${taskIndex}].acceptanceObligationIdentities`,
        ));
        if (identities.some((identity) => !allowed.has(identity))) {
          invalid(
            `${rowLabel}.${field}[${taskIndex}].acceptanceObligationIdentities`,
            'must resolve in the exact acceptance obligation anchors',
          );
        }
        for (const identity of identities) owned.add(identity);
      }
    }
    if (row.disposition === 'one-to-one-kept'
      && anchorSets.oldTasks[0].taskScopeIdentity !== anchorSets.finalTasks[0].taskScopeIdentity) {
      invalid(rowLabel, 'one-to-one-kept must retain the exact task scope identity');
    }
    if (row.disposition !== 'dropped-defective') continue;
    const archive = /** @type {Record<string, unknown>} */ (row.archive);
    if (/** @type {string[]} */ (assertDenseDataArray(
      archive.successorObligationMappingIdentities,
      `${rowLabel}.archive.successorObligationMappingIdentities`,
    )).some((identity) => !obligationIdentities.has(identity))) {
      invalid(
        `${rowLabel}.archive.successorObligationMappingIdentities`,
        'must resolve in the exact obligation mapping component',
      );
    }
    if (/** @type {string[]} */ (assertDenseDataArray(
      archive.successorCheckMappingIdentities,
      `${rowLabel}.archive.successorCheckMappingIdentities`,
    )).some((identity) => !checkIdentities.has(identity))) {
      invalid(
        `${rowLabel}.archive.successorCheckMappingIdentities`,
        'must resolve in the exact check mapping component',
      );
    }
  }
  if (ownedPreAcceptance.size !== preAcceptanceIdentities.size) {
    invalid(
      `${label}.obligationMappings.acceptance.preChangeAnchors`,
      'must each be owned by exactly one entering task',
    );
  }
  if (ownedPostAcceptance.size !== finalAcceptanceIdentities.size) {
    invalid(
      `${label}.obligationMappings.acceptance.postChangeAnchors`,
      'must each be owned by exactly one final task',
    );
  }
}

/**
 * Close the proof graph against the evidence the proposal actually bound. The
 * proof may not invent a decomposition basis, a trigger, or a defect.
 * @param {Record<string, unknown>} proposal @param {Record<string, unknown>} proof @param {string} label
 */
function validateDefinitionRevisionProposalClosureV1(proposal, proof, label) {
  const references = /** @type {Record<string, unknown>} */ (proposal.reviewerEvidenceReferences);
  const blockerIdentities = new Set(assertDenseDataArray(
    references.blockerEvidenceIdentities,
    `${label}.proposal.reviewerEvidenceReferences.blockerEvidenceIdentities`,
  ));
  const decompositionIdentities = new Set(assertDenseDataArray(
    references.decompositionEvidenceIdentities,
    `${label}.proposal.reviewerEvidenceReferences.decompositionEvidenceIdentities`,
  ));
  const checkMappings = /** @type {Record<string, unknown>} */ (proof.checkMappings);
  const successorTriggerIdentities = new Set();
  const checkRows = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(checkMappings.mappings, `${label}.proof.checkMappings.mappings`)
  );
  for (const [index, mapping] of checkRows.entries()) {
    if (mapping.disposition !== 'successor') continue;
    const mappingLabel = `${label}.proof.checkMappings.mappings[${index}].triggerEvidenceIdentities`;
    const triggers = /** @type {string[]} */ (
      assertDenseDataArray(mapping.triggerEvidenceIdentities, mappingLabel)
    );
    if (triggers.some((identity) => !blockerIdentities.has(identity))) {
      invalid(mappingLabel, 'must resolve in the exact proposal blocker evidence references');
    }
    for (const identity of triggers) successorTriggerIdentities.add(identity);
  }
  const reconciliation = /** @type {Record<string, unknown>} */ (proof.taskReconciliation);
  const rows = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(reconciliation.rows, `${label}.proof.taskReconciliation.rows`)
  );
  for (const [rowIndex, row] of rows.entries()) {
    const rowLabel = `${label}.proof.taskReconciliation.rows[${rowIndex}]`;
    if (/** @type {string[]} */ (assertDenseDataArray(
      row.decompositionBasisIdentities,
      `${rowLabel}.decompositionBasisIdentities`,
    )).some((identity) => !decompositionIdentities.has(identity))) {
      invalid(
        `${rowLabel}.decompositionBasisIdentities`,
        'must resolve in the exact proposal decomposition evidence references',
      );
    }
    if (row.disposition !== 'dropped-defective') continue;
    const archive = /** @type {Record<string, unknown>} */ (row.archive);
    if (/** @type {string[]} */ (assertDenseDataArray(
      archive.defectEvidenceIdentities,
      `${rowLabel}.archive.defectEvidenceIdentities`,
    )).some((identity) => !blockerIdentities.has(identity))) {
      invalid(
        `${rowLabel}.archive.defectEvidenceIdentities`,
        'must resolve in the exact proposal blocker evidence references',
      );
    }
    if (/** @type {string[]} */ (assertDenseDataArray(
      archive.triggerEvidenceIdentities,
      `${rowLabel}.archive.triggerEvidenceIdentities`,
    )).some((identity) => !successorTriggerIdentities.has(identity))) {
      invalid(
        `${rowLabel}.archive.triggerEvidenceIdentities`,
        'must resolve in the exact successor check trigger evidence',
      );
    }
  }
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionRevisionProofV1(value, label = 'DefinitionRevisionProofV1') {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const proof = assertExactRecord(
    value,
    [
      'type', 'version', 'proposalIdentity', 'target', 'owner',
      'eligibilityIdentity', 'prestateDescriptorIdentity',
      'coordinatorFinalDescriptors', 'coordinatorFinalDescriptorIdentity',
      'specEditClass', 'authorities', 'obligationMappings', 'checkMappings',
      'taskReconciliation', 'proofIdentity',
    ],
    [],
    label,
  );
  if (proof.type !== 'definition-revision-proof') {
    invalid(`${label}.type`, 'must be definition-revision-proof');
  }
  if (proof.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(proof.proposalIdentity, `${label}.proposalIdentity`);
  assertHash(proof.eligibilityIdentity, `${label}.eligibilityIdentity`);
  assertHash(proof.prestateDescriptorIdentity, `${label}.prestateDescriptorIdentity`);
  if (utilTypes.isProxy(proof.target)) invalid(`${label}.target`, 'must not be a Proxy');
  const target = /** @type {Record<string, unknown>} */ (
    validateAffectedTargetV2(proof.target, `${label}.target`)
  );
  if (target.lane !== 'lightweight') invalid(`${label}.target.lane`, 'must be lightweight');
  if (utilTypes.isProxy(proof.owner)) invalid(`${label}.owner`, 'must not be a Proxy');
  const owner = assertExactRecord(proof.owner, ['ideaPath', 'specPath'], [], `${label}.owner`);
  assertDirectIdeaPath(owner.ideaPath, `${label}.owner.ideaPath`);
  if (owner.specPath !== target.specPath) invalid(`${label}.owner.specPath`, 'must match the exact target specification');
  const descriptors = validateDefinitionArtifactDescriptorsV1(
    proof.coordinatorFinalDescriptors,
    exactDefinitionRevisionPathsV1(target, owner),
    `${label}.coordinatorFinalDescriptors`,
  );
  assertHash(proof.coordinatorFinalDescriptorIdentity, `${label}.coordinatorFinalDescriptorIdentity`);
  if (proof.coordinatorFinalDescriptorIdentity !== sha256(canonicalJson(descriptors))) {
    invalid(
      `${label}.coordinatorFinalDescriptorIdentity`,
      'must bind the complete ordered coordinator-final descriptor set',
    );
  }
  assertEnum(proof.specEditClass, DEFINITION_SPEC_EDIT_CLASSES, `${label}.specEditClass`);
  if (utilTypes.isProxy(proof.authorities)) invalid(`${label}.authorities`, 'must not be a Proxy');
  const authorities = assertExactRecord(
    proof.authorities,
    ['stagerAuthorityIdentity', 'coordinatorAuthorityIdentity'],
    [],
    `${label}.authorities`,
  );
  assertHash(authorities.stagerAuthorityIdentity, `${label}.authorities.stagerAuthorityIdentity`);
  assertHash(authorities.coordinatorAuthorityIdentity, `${label}.authorities.coordinatorAuthorityIdentity`);
  if (authorities.stagerAuthorityIdentity === authorities.coordinatorAuthorityIdentity) {
    invalid(`${label}.authorities`, 'must bind distinct stager and coordinator authorities');
  }
  validateDefinitionObligationMappingSetV1(proof.obligationMappings, `${label}.obligationMappings`);
  validateDefinitionCheckMappingSetV1(proof.checkMappings, `${label}.checkMappings`);
  validateDefinitionTaskReconciliationV1(proof.taskReconciliation, `${label}.taskReconciliation`);
  validateDefinitionRevisionProofCrossReferencesV1(proof, label);
  assertHash(proof.proofIdentity, `${label}.proofIdentity`);
  const { proofIdentity, ...body } = proof;
  if (proofIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.proofIdentity`, 'must equal the exact closed proof identity');
  }
  if (Buffer.byteLength(canonicalJson(proof)) > MAX_DEFINITION_REVISION_PROOF_BYTES) {
    invalid(label, `must serialize to at most ${MAX_DEFINITION_REVISION_PROOF_BYTES} UTF-8 bytes`);
  }
  return value;
}

/** Build one exact proof over closed mapping components without inferring semantics. @param {unknown} value */
export function buildDefinitionRevisionProofV1(value) {
  const label = 'buildDefinitionRevisionProofV1';
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  assertProxyFreeDataGraph(value, label);
  const input = assertExactRecord(
    value,
    [
      'proposalIdentity', 'target', 'owner', 'eligibilityIdentity',
      'prestateDescriptorIdentity', 'coordinatorFinalDescriptors',
      'specEditClass', 'authorities', 'obligationMappings', 'checkMappings',
      'taskReconciliation',
    ],
    [],
    label,
  );
  const body = JSON.parse(canonicalJson({
    type: 'definition-revision-proof',
    version: 1,
    proposalIdentity: input.proposalIdentity,
    target: input.target,
    owner: input.owner,
    eligibilityIdentity: input.eligibilityIdentity,
    prestateDescriptorIdentity: input.prestateDescriptorIdentity,
    coordinatorFinalDescriptors: input.coordinatorFinalDescriptors,
    coordinatorFinalDescriptorIdentity: sha256(canonicalJson(input.coordinatorFinalDescriptors)),
    specEditClass: input.specEditClass,
    authorities: input.authorities,
    obligationMappings: input.obligationMappings,
    checkMappings: input.checkMappings,
    taskReconciliation: input.taskReconciliation,
  }));
  const proof = { ...body, proofIdentity: sha256(canonicalJson(body)) };
  validateDefinitionRevisionProofV1(proof);
  return proof;
}

/** @param {unknown} proposalValue @param {unknown} proofValue @param {string} [label] */
export function validateDefinitionRevisionProofBindingV1(
  proposalValue,
  proofValue,
  label = 'DefinitionRevisionProofBindingV1',
) {
  const proposal = /** @type {Record<string, unknown>} */ (
    validateDefinitionRevisionProposalV1(proposalValue, `${label}.proposal`)
  );
  const proof = /** @type {Record<string, unknown>} */ (
    validateDefinitionRevisionProofV1(proofValue, `${label}.proof`)
  );
  for (const field of ['proposalIdentity', 'target', 'owner', 'coordinatorFinalDescriptors']) {
    const proofField = field === 'proposalIdentity' ? proof.proposalIdentity : proof[field];
    const proposalField = field === 'proposalIdentity' ? proposal.proposalIdentity : proposal[field];
    if (canonicalJson(proofField) !== canonicalJson(proposalField)) {
      invalid(`${label}.${field}`, 'must bind the exact proposal value');
    }
  }
  const obligationMappings = /** @type {Record<string, unknown>} */ (proof.obligationMappings);
  const checkMappings = /** @type {Record<string, unknown>} */ (proof.checkMappings);
  const reconciliation = /** @type {Record<string, unknown>} */ (proof.taskReconciliation);
  const eligibility = /** @type {Record<string, unknown>} */ (proposal.eligibility);
  if (proof.eligibilityIdentity !== eligibility.eligibilityIdentity) {
    invalid(`${label}.eligibilityIdentity`, 'must bind the exact proposal eligibility identity');
  }
  if (proof.prestateDescriptorIdentity !== sha256(canonicalJson(proposal.prestateDescriptors))) {
    invalid(
      `${label}.prestateDescriptorIdentity`,
      'must bind the complete ordered proposal prestate descriptor set',
    );
  }
  const expectedMappingReferences = [
    /** @type {string} */ (obligationMappings.componentIdentity),
    /** @type {string} */ (checkMappings.componentIdentity),
  ].sort(compareUtf8);
  if (canonicalJson(proposal.mappingReferences) !== canonicalJson(expectedMappingReferences)) {
    invalid(`${label}.proposal.mappingReferences`, 'must exactly identify both proof mapping components');
  }
  if (canonicalJson(proposal.reconciliationReferences)
    !== canonicalJson([reconciliation.componentIdentity])) {
    invalid(
      `${label}.proposal.reconciliationReferences`,
      'must exactly identify the proof reconciliation component',
    );
  }
  validateDefinitionRevisionProposalClosureV1(proposal, proof, label);
  return proofValue;
}

/** @param {unknown} value @param {string} label @param {string[]} expectedIdentities @param {string[]} fields */
function validateDefinitionSemanticJudgmentRowsV1(
  value,
  label,
  expectedIdentities,
  fields,
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const rows = assertDenseDataArray(value, label);
  if (rows.length !== expectedIdentities.length) {
    invalid(label, `must contain exactly ${expectedIdentities.length} complete judgment rows`);
  }
  rows.forEach((rowValue, index) => {
    const rowLabel = `${label}[${index}]`;
    if (utilTypes.isProxy(rowValue)) invalid(rowLabel, 'must not be a Proxy');
    const row = assertExactRecord(rowValue, ['identity', ...fields], [], rowLabel);
    assertHash(row.identity, `${rowLabel}.identity`);
    if (row.identity !== expectedIdentities[index]) {
      invalid(`${rowLabel}.identity`, 'must match the complete sorted proof identity set');
    }
  });
  return /** @type {Record<string, unknown>[]} */ (rows);
}

/** @param {Record<string, unknown>} proof */
function definitionObligationMappingRowsV1(proof) {
  const obligationMappings = /** @type {Record<string, unknown>} */ (proof.obligationMappings);
  return /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(obligationMappings.categories, 'proof.obligationMappings.categories')
  ).flatMap((category, index) => /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(
      category.mappings,
      `proof.obligationMappings.categories[${index}].mappings`,
    )
  ));
}

/** @param {Record<string, unknown>} proof */
function definitionObligationMappingIdentitiesV1(proof) {
  return definitionObligationMappingRowsV1(proof)
    .map((mapping) => /** @type {string} */ (mapping.mappingIdentity))
    .sort(compareUtf8);
}

/** @param {Record<string, unknown>} proof */
function definitionCheckMappingRowsV1(proof) {
  const checkMappings = /** @type {Record<string, unknown>} */ (proof.checkMappings);
  return /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(checkMappings.mappings, 'proof.checkMappings.mappings')
  );
}

/** @param {Record<string, unknown>} proof */
function definitionCheckMappingIdentitiesV1(proof) {
  return definitionCheckMappingRowsV1(proof)
    .map((mapping) => /** @type {string} */ (mapping.mappingIdentity))
    .sort(compareUtf8);
}

/** @param {Record<string, unknown>} proof */
function definitionReconciliationRowsByIdentityV1(proof) {
  const reconciliation = /** @type {Record<string, unknown>} */ (proof.taskReconciliation);
  return /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(reconciliation.rows, 'proof.taskReconciliation.rows')
  )
    .slice()
    .sort((left, right) => compareUtf8(
      /** @type {string} */ (left.reconciliationIdentity),
      /** @type {string} */ (right.reconciliationIdentity),
    ));
}

/**
 * Derive only whether the reviewer's declared result is internally consistent
 * with the exact relations and dispositions the proof asserts. This does not
 * infer any semantic judgment.
 * @param {Record<string, unknown>} review @param {Record<string, unknown>} proof
 */
function expectedDefinitionSemanticReviewResultV1(review, proof) {
  let rejected = false;
  let clarificationRequired = false;
  /** @param {unknown} judgment @param {string[]} approved */
  const observe = (judgment, approved) => {
    if (judgment === 'ambiguous' || judgment === 'normative-change') {
      clarificationRequired = true;
    } else if (!approved.includes(/** @type {string} */ (judgment))) {
      rejected = true;
    }
  };
  observe(review.outcomeJudgment, ['equivalent']);
  const assertedRelations = new Map(definitionObligationMappingRowsV1(proof)
    .map((mapping) => [mapping.mappingIdentity, /** @type {string} */ (mapping.relation)]));
  /** @type {Set<unknown>} */
  const relationConsistentMappings = new Set();
  for (const row of /** @type {Record<string, unknown>[]} */ (review.obligationJudgments)) {
    const relation = assertedRelations.get(row.identity);
    observe(row.judgment, relation === undefined ? [] : [relation]);
    if (row.judgment === relation) relationConsistentMappings.add(row.identity);
  }
  const proofRows = new Map(definitionReconciliationRowsByIdentityV1(proof)
    .map((row) => [row.reconciliationIdentity, row]));
  for (const judgment of /** @type {Record<string, unknown>[]} */ (review.taskReconciliationJudgments)) {
    const row = /** @type {Record<string, unknown>} */ (proofRows.get(judgment.identity));
    const statePreserving = row.disposition === 'one-to-one-kept';
    observe(
      judgment.taskScopeJudgment,
      [statePreserving ? 'unchanged' : 'not-state-preserving'],
    );
    observe(
      judgment.acceptanceObligationJudgment,
      [statePreserving ? 'unchanged' : 'not-state-preserving'],
    );
    observe(
      judgment.decompositionBasisJudgment,
      ['one-to-one-kept', 'dropped-defective'].includes(/** @type {string} */ (row.disposition))
        ? ['equivalent']
        : ['equivalent', 'different'],
    );
  }
  const checkDispositions = new Map(definitionCheckMappingRowsV1(proof)
    .map((mapping) => [mapping.mappingIdentity, /** @type {string} */ (mapping.disposition)]));
  for (const row of /** @type {Record<string, unknown>[]} */ (review.checkJudgments)) {
    const retained = checkDispositions.get(row.identity) === 'retained';
    observe(row.intendedInvariantJudgment, ['adequate']);
    observe(row.successorCheckJudgment, [retained ? 'not-applicable' : 'adequate']);
    observe(row.triggerEvidenceJudgment, [retained ? 'not-applicable' : 'binding']);
  }
  for (const row of /** @type {Record<string, unknown>[]} */ (review.droppedDefectiveJudgments)) {
    const proofRow = /** @type {Record<string, unknown>} */ (proofRows.get(row.identity));
    const archive = /** @type {Record<string, unknown>} */ (proofRow.archive);
    const successorsConsistent = /** @type {string[]} */ (assertDenseDataArray(
      archive.successorObligationMappingIdentities,
      'proof.taskReconciliation.archive.successorObligationMappingIdentities',
    )).every((identity) => relationConsistentMappings.has(identity));
    observe(row.defectClassificationJudgment, ['approved']);
    observe(row.archiveAuthorityJudgment, ['approved']);
    observe(row.successorTaskScopeJudgment, ['equivalent']);
    observe(row.successorObligationJudgment, successorsConsistent ? ['equal-or-stronger'] : []);
    observe(row.successorCheckJudgment, ['adequate']);
  }
  const specEditClassJudgment = /** @type {Record<string, unknown>} */ (review.specEditClassJudgment);
  observe(specEditClassJudgment.judgment, ['approved']);
  return clarificationRequired ? 'clarification-required' : rejected ? 'rejected' : 'approved';
}

/** @param {unknown} value @param {unknown} proofValue @param {string} [label] */
export function validateDefinitionRevisionSemanticReviewEnvelopeV1(
  value,
  proofValue,
  label = 'DefinitionRevisionSemanticReviewEnvelopeV1',
) {
  const proof = /** @type {Record<string, unknown>} */ (
    validateDefinitionRevisionProofV1(proofValue, `${label}.proof`)
  );
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const review = assertExactRecord(
    value,
    [
      'type', 'version', 'target', 'proposalIdentity', 'proofIdentity',
      'preparationIdentity', 'reviewRequestIdentity',
      'coordinatorFinalDescriptors', 'coordinatorFinalDescriptorIdentity',
      'reviewerAuthorityIdentity', 'reviewInvocationIdentity',
      'stagerAuthorityIdentity', 'coordinatorAuthorityIdentity', 'outcomeJudgment',
      'obligationJudgments', 'taskReconciliationJudgments', 'checkJudgments',
      'droppedDefectiveJudgments', 'specEditClassJudgment', 'finalResult',
      'reviewIdentity',
    ],
    [],
    label,
  );
  if (review.type !== 'definition-revision-semantic-review-envelope') {
    invalid(`${label}.type`, 'must be definition-revision-semantic-review-envelope');
  }
  if (review.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (utilTypes.isProxy(review.target)) invalid(`${label}.target`, 'must not be a Proxy');
  validateAffectedTargetV2(review.target, `${label}.target`);
  for (const field of [
    'proposalIdentity', 'proofIdentity', 'preparationIdentity', 'reviewRequestIdentity',
    'coordinatorFinalDescriptorIdentity',
    'reviewerAuthorityIdentity', 'reviewInvocationIdentity', 'stagerAuthorityIdentity',
    'coordinatorAuthorityIdentity', 'reviewIdentity',
  ]) assertHash(review[field], `${label}.${field}`);
  const owner = /** @type {Record<string, unknown>} */ (proof.owner);
  const target = /** @type {Record<string, unknown>} */ (proof.target);
  const descriptors = validateDefinitionArtifactDescriptorsV1(
    review.coordinatorFinalDescriptors,
    exactDefinitionRevisionPathsV1(target, owner),
    `${label}.coordinatorFinalDescriptors`,
  );
  if (review.coordinatorFinalDescriptorIdentity !== sha256(canonicalJson(descriptors))) {
    invalid(
      `${label}.coordinatorFinalDescriptorIdentity`,
      'must bind the complete ordered coordinator-final descriptor set',
    );
  }
  const proofAuthorities = /** @type {Record<string, unknown>} */ (proof.authorities);
  for (const [reviewField, proofField] of [
    ['target', 'target'],
    ['proposalIdentity', 'proposalIdentity'],
    ['proofIdentity', 'proofIdentity'],
    ['coordinatorFinalDescriptors', 'coordinatorFinalDescriptors'],
    ['coordinatorFinalDescriptorIdentity', 'coordinatorFinalDescriptorIdentity'],
  ]) {
    if (canonicalJson(review[reviewField]) !== canonicalJson(proof[proofField])) {
      invalid(`${label}.${reviewField}`, 'must bind the exact proof value');
    }
  }
  if (review.stagerAuthorityIdentity !== proofAuthorities.stagerAuthorityIdentity
    || review.coordinatorAuthorityIdentity !== proofAuthorities.coordinatorAuthorityIdentity) {
    invalid(`${label}.stagerAuthorityIdentity`, 'must bind the proof authorities');
  }
  if (review.reviewerAuthorityIdentity === proofAuthorities.stagerAuthorityIdentity
    || review.reviewerAuthorityIdentity === proofAuthorities.coordinatorAuthorityIdentity) {
    invalid(`${label}.reviewerAuthorityIdentity`, 'must be independent of stager and coordinator');
  }
  assertEnum(
    review.outcomeJudgment,
    ['equivalent', 'weaker', 'narrower', 'ambiguous', 'normative-change', 'rejected'],
    `${label}.outcomeJudgment`,
  );
  const obligationRows = validateDefinitionSemanticJudgmentRowsV1(
    review.obligationJudgments,
    `${label}.obligationJudgments`,
    definitionObligationMappingIdentitiesV1(proof),
    ['judgment'],
  );
  obligationRows.forEach((row, index) => assertEnum(
    row.judgment,
    ['equal', 'stronger', 'weaker', 'narrower', 'ambiguous', 'normative-change', 'rejected'],
    `${label}.obligationJudgments[${index}].judgment`,
  ));
  const reconciliationRows = definitionReconciliationRowsByIdentityV1(proof);
  const taskRows = validateDefinitionSemanticJudgmentRowsV1(
    review.taskReconciliationJudgments,
    `${label}.taskReconciliationJudgments`,
    reconciliationRows.map((row) => /** @type {string} */ (row.reconciliationIdentity)),
    ['taskScopeJudgment', 'acceptanceObligationJudgment', 'decompositionBasisJudgment'],
  );
  taskRows.forEach((row, index) => {
    for (const field of ['taskScopeJudgment', 'acceptanceObligationJudgment']) {
      assertEnum(
        row[field],
        [
          'unchanged', 'not-state-preserving', 'weaker', 'narrower', 'ambiguous',
          'normative-change', 'rejected',
        ],
        `${label}.taskReconciliationJudgments[${index}].${field}`,
      );
    }
    assertEnum(
      row.decompositionBasisJudgment,
      ['equivalent', 'different', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.taskReconciliationJudgments[${index}].decompositionBasisJudgment`,
    );
  });
  const checkRows = validateDefinitionSemanticJudgmentRowsV1(
    review.checkJudgments,
    `${label}.checkJudgments`,
    definitionCheckMappingIdentitiesV1(proof),
    ['intendedInvariantJudgment', 'successorCheckJudgment', 'triggerEvidenceJudgment'],
  );
  checkRows.forEach((row, index) => {
    assertEnum(
      row.intendedInvariantJudgment,
      ['adequate', 'inadequate', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.checkJudgments[${index}].intendedInvariantJudgment`,
    );
    assertEnum(
      row.successorCheckJudgment,
      ['adequate', 'inadequate', 'not-applicable', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.checkJudgments[${index}].successorCheckJudgment`,
    );
    assertEnum(
      row.triggerEvidenceJudgment,
      ['binding', 'not-binding', 'not-applicable', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.checkJudgments[${index}].triggerEvidenceJudgment`,
    );
  });
  const droppedRows = reconciliationRows.filter((row) => row.disposition === 'dropped-defective');
  const droppedJudgments = validateDefinitionSemanticJudgmentRowsV1(
    review.droppedDefectiveJudgments,
    `${label}.droppedDefectiveJudgments`,
    droppedRows.map((row) => /** @type {string} */ (row.reconciliationIdentity)),
    [
      'defectClassificationJudgment', 'archiveAuthorityJudgment',
      'successorTaskScopeJudgment', 'successorObligationJudgment',
      'successorCheckJudgment',
    ],
  );
  droppedJudgments.forEach((row, index) => {
    for (const field of ['defectClassificationJudgment', 'archiveAuthorityJudgment']) {
      assertEnum(
        row[field],
        ['approved', 'rejected', 'ambiguous', 'normative-change'],
        `${label}.droppedDefectiveJudgments[${index}].${field}`,
      );
    }
    assertEnum(
      row.successorTaskScopeJudgment,
      ['equivalent', 'weaker', 'narrower', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.droppedDefectiveJudgments[${index}].successorTaskScopeJudgment`,
    );
    assertEnum(
      row.successorObligationJudgment,
      ['equal-or-stronger', 'weaker', 'narrower', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.droppedDefectiveJudgments[${index}].successorObligationJudgment`,
    );
    assertEnum(
      row.successorCheckJudgment,
      ['adequate', 'inadequate', 'ambiguous', 'normative-change', 'rejected'],
      `${label}.droppedDefectiveJudgments[${index}].successorCheckJudgment`,
    );
  });
  if (utilTypes.isProxy(review.specEditClassJudgment)) {
    invalid(`${label}.specEditClassJudgment`, 'must not be a Proxy');
  }
  const specEditClassJudgment = assertExactRecord(
    review.specEditClassJudgment,
    ['specEditClass', 'judgment'],
    [],
    `${label}.specEditClassJudgment`,
  );
  assertEnum(
    specEditClassJudgment.specEditClass,
    DEFINITION_SPEC_EDIT_CLASSES,
    `${label}.specEditClassJudgment.specEditClass`,
  );
  if (specEditClassJudgment.specEditClass !== proof.specEditClass) {
    invalid(`${label}.specEditClassJudgment.specEditClass`, 'must match the exact proof class');
  }
  assertEnum(
    specEditClassJudgment.judgment,
    ['approved', 'rejected', 'ambiguous', 'normative-change'],
    `${label}.specEditClassJudgment.judgment`,
  );
  assertEnum(review.finalResult, ['approved', 'rejected', 'clarification-required'], `${label}.finalResult`);
  const expectedResult = expectedDefinitionSemanticReviewResultV1(review, proof);
  if (review.finalResult !== expectedResult) {
    invalid(
      `${label}.finalResult`,
      `must be ${expectedResult} for the complete declared semantic judgments`,
    );
  }
  const { reviewIdentity, ...body } = review;
  if (reviewIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.reviewIdentity`, 'must equal the exact closed semantic-review identity');
  }
  if (Buffer.byteLength(canonicalJson(review)) > MAX_DEFINITION_REVISION_REVIEW_BYTES) {
    invalid(label, `must serialize to at most ${MAX_DEFINITION_REVISION_REVIEW_BYTES} UTF-8 bytes`);
  }
  return value;
}

/**
 * Build an identity over reviewer-authored judgments without creating those
 * judgments. Reviewer-side only: the evaluation path never reaches this and
 * sources every review from a fresh Inspection instead.
 * Preparation and request identities establish ordering and exact-request
 * binding when checked by the coordinator; they are not reviewer attestation.
 * @param {unknown} value @param {unknown} proofValue
 */
export function buildDefinitionRevisionSemanticReviewEnvelopeV1(value, proofValue) {
  const label = 'buildDefinitionRevisionSemanticReviewEnvelopeV1';
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  assertProxyFreeDataGraph(value, label);
  const input = assertExactRecord(
    value,
    [
      'target', 'proposalIdentity', 'proofIdentity', 'preparationIdentity',
      'reviewRequestIdentity', 'coordinatorFinalDescriptors',
      'coordinatorFinalDescriptorIdentity', 'reviewerAuthorityIdentity',
      'reviewInvocationIdentity', 'stagerAuthorityIdentity', 'coordinatorAuthorityIdentity',
      'outcomeJudgment', 'obligationJudgments', 'taskReconciliationJudgments',
      'checkJudgments', 'droppedDefectiveJudgments', 'specEditClassJudgment',
      'finalResult',
    ],
    [],
    label,
  );
  const body = JSON.parse(canonicalJson({
    type: 'definition-revision-semantic-review-envelope',
    version: 1,
    ...input,
  }));
  const review = { ...body, reviewIdentity: sha256(canonicalJson(body)) };
  validateDefinitionRevisionSemanticReviewEnvelopeV1(review, proofValue);
  return review;
}

/** @param {unknown} captureValue @param {string} label */
function trustedDefinitionRevisionSemanticReviewBodyV1(captureValue, label) {
  assertProxyFreeDataGraph(captureValue, label);
  const normalized = trustedEnvelopeBodyV2(captureValue, 'independent-review', label);
  const capturedBytes = /** @type {Record<string, unknown>} */ (normalized.capture.bytes);
  if (normalized.capture.outcomeHash !== capturedBytes.sha256) {
    invalid(`${label}.outcomeHash`, 'must bind the exact captured semantic-review bytes');
  }
  const review = assertRecord(normalized.envelope, `${label}.bytes`);
  if (canonicalJson(normalized.capture.target) !== canonicalJson(review.target)) {
    invalid(`${label}.target`, 'must match the captured semantic-review target');
  }
  if (review.reviewerAuthorityIdentity !== normalized.authority.authorityIdentity
    || review.reviewInvocationIdentity !== normalized.authority.invocationIdentity) {
    invalid(`${label}.authority`, 'must bind the reviewer authority and invocation');
  }
  return { review, capture: normalized.capture, authority: normalized.authority };
}

/**
 * Resolve the one definition semantic review that the fresh Inspection actually
 * carries for this exact proof. Self-consistency over caller bytes proves
 * nothing about attribution, so the review is only ever sourced here.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} proof
 * @param {{preparationIdentity:string,reviewRequestIdentity:string}|null} [requestBinding]
 */
function trustedDefinitionRevisionSemanticReviewFromInspectionV1(
  inspection,
  proof,
  requestBinding = null,
) {
  /** @type {{review:Record<string, unknown>,sourceState:string}[]} */
  const matches = [];
  try {
    for (const row of trustedCaptureRowsFromInspectionV2(inspection)) {
      if (row.kind !== 'independent-review') continue;
      const label = 'definition semantic-review trusted capture';
      const body = trustedEnvelopeBodyV2(row.capture, 'independent-review', label).envelope;
      if (body.type === 'independent-review-envelope') continue;
      if (body.type !== DEFINITION_REVISION_REVIEW_ENVELOPE_TYPE) {
        invalid(`${label}.type`, 'must be a known trusted review envelope type');
      }
      const normalized = trustedDefinitionRevisionSemanticReviewBodyV1(row.capture, label);
      const review = /** @type {Record<string, unknown>} */ (normalized.review);
      if (review.proofIdentity !== proof.proofIdentity) continue;
      matches.push({ review, sourceState: row.sourceState });
    }
  } catch {
    return { reason: 'untrusted-review' };
  }
  const exactMatches = requestBinding === null
    ? matches
    : matches.filter(({ review }) => (
      review.preparationIdentity === requestBinding.preparationIdentity
      && review.reviewRequestIdentity === requestBinding.reviewRequestIdentity
    ));
  if (exactMatches.length === 0) {
    return {
      reason: matches.length === 0 ? 'missing-review-evidence' : 'review-request-mismatch',
      semanticReviewCount: 0,
    };
  }
  if (exactMatches.length !== 1 || (requestBinding !== null && matches.length !== 1)) {
    return { reason: 'ambiguous-review-evidence', semanticReviewCount: exactMatches.length };
  }
  const semanticReviewCount = exactMatches.length;
  const { review, sourceState } = exactMatches[0];
  const expectedState = review.finalResult === 'approved' ? 'accepted' : 'rejected';
  if (!['approved', 'rejected', 'clarification-required'].includes(/** @type {string} */ (review.finalResult))
    || sourceState !== expectedState) {
    return { reason: 'review-state-mismatch', semanticReviewCount };
  }
  const inspected = inspectedDefinitionRevisionProposalV1(inspection);
  if (inspected.reason) {
    return { reason: /** @type {string} */ (inspected.reason), semanticReviewCount };
  }
  const inspectedProposal = /** @type {Record<string, unknown>} */ (inspected.proposal);
  if (review.proposalIdentity !== inspectedProposal.proposalIdentity) {
    return { reason: 'stale-review-identity', semanticReviewCount };
  }
  return { review, semanticReviewCount };
}

/** @param {string} reason */
function refusedDefinitionRevisionEvaluationV1(reason) {
  return { approved: false, result: 'refused', reason };
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionRecoveryFeature009EvidenceV1(
  value,
  label = 'DefinitionRecoveryFeature009EvidenceV1',
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const evidence = assertExactRecord(
    value,
    [
      'type', 'version', 'target', 'proposalIdentity', 'reviewIdentity',
      'blockerEvidenceIdentities', 'decompositionEvidenceIdentities',
      'decompositionRelationships', 'evidenceIdentity',
    ],
    [],
    label,
  );
  if (evidence.type !== 'definition-recovery-feature009-evidence' || evidence.version !== 1) {
    invalid(label, 'must be version 1 definition-recovery-feature009-evidence');
  }
  validateAffectedTargetV2(evidence.target, `${label}.target`);
  assertHash(evidence.proposalIdentity, `${label}.proposalIdentity`);
  assertHash(evidence.reviewIdentity, `${label}.reviewIdentity`);
  validateDefinitionRevisionHashSetV1(
    evidence.blockerEvidenceIdentities,
    `${label}.blockerEvidenceIdentities`,
  );
  validateDefinitionRevisionHashSetV1(
    evidence.decompositionEvidenceIdentities,
    `${label}.decompositionEvidenceIdentities`,
  );
  if (utilTypes.isProxy(evidence.decompositionRelationships)) {
    invalid(`${label}.decompositionRelationships`, 'must not be a Proxy');
  }
  const relationships = assertDenseDataArray(
    evidence.decompositionRelationships,
    `${label}.decompositionRelationships`,
  );
  if (relationships.length < 1 || relationships.length > MAX_DEFINITION_REVISION_ROWS) {
    invalid(`${label}.decompositionRelationships`, `must contain 1 through ${MAX_DEFINITION_REVISION_ROWS} rows`);
  }
  relationships.forEach((rowValue, index) => {
    const row = assertExactRecord(
      rowValue,
      ['reconciliationIdentity', 'judgment'],
      [],
      `${label}.decompositionRelationships[${index}]`,
    );
    assertHash(row.reconciliationIdentity, `${label}.decompositionRelationships[${index}].reconciliationIdentity`);
    assertEnum(
      row.judgment,
      ['equivalent', 'different'],
      `${label}.decompositionRelationships[${index}].judgment`,
    );
    if (index > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (relationships[index - 1])).reconciliationIdentity,
      /** @type {string} */ (row.reconciliationIdentity),
    ) >= 0) {
      invalid(`${label}.decompositionRelationships`, 'must be sorted and duplicate-free');
    }
  });
  assertHash(evidence.evidenceIdentity, `${label}.evidenceIdentity`);
  const { evidenceIdentity, ...body } = evidence;
  if (evidenceIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.evidenceIdentity`, 'must bind the exact proposal-bound semantic evidence');
  }
  return value;
}

/**
 * Adapt exact proposal-bound evidence to Feature 009's existing finding shape.
 * This creates no new governance event, policy, counter, or store.
 * @param {unknown} value
 */
export function buildDefinitionRecoveryLearningFindingV1(value) {
  const evidence = /** @type {Record<string, unknown>} */ (
    validateDefinitionRecoveryFeature009EvidenceV1(value)
  );
  const body = {
    version: 1,
    statement: 'The reviewed definition-recovery blocker and decomposition relationships are proposal-bound.',
    evidenceIdentities: [
      evidence.proposalIdentity,
      evidence.reviewIdentity,
      evidence.evidenceIdentity,
    ].sort(compareUtf8),
    assumptionIdentities: [],
  };
  const finding = { ...body, findingIdentity: sha256(canonicalJson(body)) };
  validateLearningFindingV1(finding, 'DefinitionRecoveryLearningFindingV1');
  return finding;
}

/** @param {Record<string, unknown>} proposal @param {Record<string, unknown>} review */
function definitionRecoveryFeature009EvidenceV1(proposal, review) {
  const references = /** @type {Record<string, unknown>} */ (proposal.reviewerEvidenceReferences);
  const body = JSON.parse(canonicalJson({
    type: 'definition-recovery-feature009-evidence',
    version: 1,
    target: proposal.target,
    proposalIdentity: proposal.proposalIdentity,
    reviewIdentity: review.reviewIdentity,
    blockerEvidenceIdentities: references.blockerEvidenceIdentities,
    decompositionEvidenceIdentities: references.decompositionEvidenceIdentities,
    decompositionRelationships: /** @type {Record<string, unknown>[]} */ (
      review.taskReconciliationJudgments
    ).map((row) => ({
      reconciliationIdentity: row.identity,
      judgment: row.decompositionBasisJudgment,
    })).sort((left, right) => compareUtf8(left.reconciliationIdentity, right.reconciliationIdentity)),
  }));
  const evidence = { ...body, evidenceIdentity: sha256(canonicalJson(body)) };
  validateDefinitionRecoveryFeature009EvidenceV1(evidence);
  return evidence;
}

/**
 * Validate one exact proposal and proof against the one independent semantic
 * review the fresh Inspection carries for that proof. No caller can supply a
 * review body. This capability is non-mutating; T004 owns acquisition and
 * application order.
 * @param {unknown} value
 */
export function evaluateDefinitionRevisionV1(value) {
  let input;
  try {
    if (utilTypes.isProxy(value)) invalid('DefinitionRevisionEvaluationV1', 'must not be a Proxy');
    input = assertExactRecord(
      value,
      ['inspection', 'proposal', 'proof'],
      ['preparationIdentity', 'reviewRequestIdentity'],
      'DefinitionRevisionEvaluationV1',
    );
    assertProxyFreeDataGraph(input.inspection, 'DefinitionRevisionEvaluationV1.inspection');
    assertProxyFreeDataGraph(input.proposal, 'DefinitionRevisionEvaluationV1.proposal');
    assertProxyFreeDataGraph(input.proof, 'DefinitionRevisionEvaluationV1.proof');
  } catch {
    return refusedDefinitionRevisionEvaluationV1('invalid-request');
  }
  const hasPreparationIdentity = Object.hasOwn(input, 'preparationIdentity');
  const hasReviewRequestIdentity = Object.hasOwn(input, 'reviewRequestIdentity');
  if (hasPreparationIdentity !== hasReviewRequestIdentity) {
    return refusedDefinitionRevisionEvaluationV1('invalid-request');
  }
  let requestBinding = null;
  if (hasPreparationIdentity) {
    try {
      assertHash(input.preparationIdentity, 'DefinitionRevisionEvaluationV1.preparationIdentity');
      assertHash(input.reviewRequestIdentity, 'DefinitionRevisionEvaluationV1.reviewRequestIdentity');
      requestBinding = {
        preparationIdentity: /** @type {string} */ (input.preparationIdentity),
        reviewRequestIdentity: /** @type {string} */ (input.reviewRequestIdentity),
      };
    } catch {
      return refusedDefinitionRevisionEvaluationV1('invalid-request');
    }
  }
  const refuse = (reason, semanticReviewCount = 0) => ({
    ...refusedDefinitionRevisionEvaluationV1(reason),
    ...(requestBinding === null ? {} : { semanticReviewCount }),
  });
  let inspection;
  try {
    inspection = /** @type {Record<string, unknown>} */ (validateInspection(input.inspection));
  } catch {
    return refuse('invalid-inspection');
  }
  let proposal;
  try {
    proposal = /** @type {Record<string, unknown>} */ (
      validateDefinitionRevisionProposalV1(input.proposal)
    );
  } catch {
    return refuse('invalid-proposal');
  }
  let proof;
  try {
    proof = /** @type {Record<string, unknown>} */ (validateDefinitionRevisionProofV1(input.proof));
  } catch {
    return refuse('invalid-proof');
  }
  try {
    validateDefinitionRevisionProofBindingV1(proposal, proof);
  } catch {
    return refuse('proof-binding-mismatch');
  }
  const resolved = trustedDefinitionRevisionSemanticReviewFromInspectionV1(
    inspection,
    proof,
    requestBinding,
  );
  if (resolved.reason) return refuse(resolved.reason, resolved.semanticReviewCount ?? 0);
  const review = /** @type {Record<string, unknown>} */ (resolved.review);
  const proofAuthorities = /** @type {Record<string, unknown>} */ (proof.authorities);
  for (const [reviewField, proofField] of [
    ['target', 'target'],
    ['proposalIdentity', 'proposalIdentity'],
    ['proofIdentity', 'proofIdentity'],
    ['coordinatorFinalDescriptors', 'coordinatorFinalDescriptors'],
    ['coordinatorFinalDescriptorIdentity', 'coordinatorFinalDescriptorIdentity'],
  ]) {
    try {
      if (canonicalJson(review[reviewField]) !== canonicalJson(proof[proofField])) {
        return refuse('review-binding-mismatch', 1);
      }
    } catch {
      return refuse('semantic-review-invalid', 1);
    }
  }
  if (review.stagerAuthorityIdentity !== proofAuthorities.stagerAuthorityIdentity
    || review.coordinatorAuthorityIdentity !== proofAuthorities.coordinatorAuthorityIdentity) {
    return refuse('review-binding-mismatch', 1);
  }
  if (review.reviewerAuthorityIdentity === proofAuthorities.stagerAuthorityIdentity
    || review.reviewerAuthorityIdentity === proofAuthorities.coordinatorAuthorityIdentity) {
    return refuse('self-review', 1);
  }
  try {
    validateDefinitionRevisionSemanticReviewEnvelopeV1(review, proof);
  } catch {
    return refuse('semantic-review-invalid', 1);
  }
  if (review.finalResult === 'clarification-required') {
    return refuse('clarification-required', 1);
  }
  if (review.finalResult === 'rejected') {
    return refuse('review-rejected', 1);
  }
  return {
    approved: true,
    result: 'approved',
    reason: 'approved',
    proposalIdentity: proposal.proposalIdentity,
    proofIdentity: proof.proofIdentity,
    reviewIdentity: review.reviewIdentity,
    feature009Evidence: definitionRecoveryFeature009EvidenceV1(proposal, review),
    ...(requestBinding === null ? {} : { semanticReviewCount: resolved.semanticReviewCount }),
  };
}

/**
 * Re-resolve and validate the already captured review envelope by exact
 * identity. This is deterministic post-apply identity validation, not another
 * semantic review invocation.
 * @param {unknown} value
 */
export function revalidateDefinitionRevisionReviewIdentityV1(value) {
  const label = 'DefinitionRevisionReviewIdentityRevalidationV1';
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const input = assertExactRecord(
    value,
    ['inspection', 'proposal', 'proof', 'reviewIdentity'],
    [],
    label,
  );
  assertProxyFreeDataGraph(input.inspection, `${label}.inspection`);
  assertProxyFreeDataGraph(input.proposal, `${label}.proposal`);
  assertProxyFreeDataGraph(input.proof, `${label}.proof`);
  assertHash(input.reviewIdentity, `${label}.reviewIdentity`);
  const inspection = /** @type {Record<string, unknown>} */ (
    validateInspection(input.inspection)
  );
  const proposal = /** @type {Record<string, unknown>} */ (
    validateDefinitionRevisionProposalV1(input.proposal, `${label}.proposal`)
  );
  const proof = /** @type {Record<string, unknown>} */ (
    validateDefinitionRevisionProofV1(input.proof, `${label}.proof`)
  );
  validateDefinitionRevisionProofBindingV1(proposal, proof, `${label}.binding`);
  const resolved = trustedDefinitionRevisionSemanticReviewFromInspectionV1(inspection, proof);
  if (resolved.reason) invalid(label, `cannot resolve the exact trusted review: ${resolved.reason}`);
  const review = /** @type {Record<string, unknown>} */ (resolved.review);
  validateDefinitionRevisionSemanticReviewEnvelopeV1(review, proof, `${label}.review`);
  if (review.finalResult !== 'approved'
    || review.reviewIdentity !== input.reviewIdentity
    || review.proposalIdentity !== proposal.proposalIdentity) {
    invalid(label, 'does not match the exact approved proposal-bound review identity');
  }
  return {
    proposalIdentity: proposal.proposalIdentity,
    reviewIdentity: review.reviewIdentity,
    coordinatorFinalDescriptors: JSON.parse(canonicalJson(proposal.coordinatorFinalDescriptors)),
  };
}

/** @param {unknown} value @param {string[]} expectedPaths @param {string} label */
function definitionRecoveryArtifactRowsV1(value, expectedPaths, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const rows = assertDenseDataArray(value, label);
  if (rows.length !== expectedPaths.length) {
    invalid(label, `must contain exactly ${expectedPaths.length} artifact rows`);
  }
  return rows.map((rowValue, index) => {
    const rowLabel = `${label}[${index}]`;
    if (utilTypes.isProxy(rowValue)) invalid(rowLabel, 'must not be a Proxy');
    const row = assertExactRecord(rowValue, ['path', 'expected', 'staged'], [], rowLabel);
    if (row.path !== expectedPaths[index]) {
      invalid(`${rowLabel}.path`, 'must match the exact sorted four-artifact scope');
    }
    const expected = byteSequence(row.expected);
    const staged = byteSequence(row.staged);
    if (!expected || !staged) invalid(rowLabel, 'must carry exact expected and staged byte sequences');
    if (expected.byteLength > MAX_SOURCE_BODY_BYTES || staged.byteLength > MAX_SOURCE_BODY_BYTES) {
      invalid(rowLabel, `artifact bytes must not exceed ${MAX_SOURCE_BODY_BYTES}`);
    }
    return { path: /** @type {string} */ (row.path), expected, staged };
  });
}

/** @param {{path:string,expected:Buffer,staged:Buffer}[]} rows @param {'expected'|'staged'} field */
function definitionRecoveryDescriptorsV1(rows, field) {
  return rows.map((row) => ({ path: row.path, ...contentDescriptor(row[field]) }));
}

/** @param {Buffer} bytes @param {string} label */
function definitionRecoveryUtf8V1(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    invalid(label, 'must be strict UTF-8');
  }
}

/** @param {Buffer} bytes @param {string} taskPath @param {string} label */
function parsedDefinitionRecoveryTasksV1(bytes, taskPath, label) {
  definitionRecoveryUtf8V1(bytes, label);
  let visible;
  try {
    visible = parseVisibleTasks(bytes, { path: taskPath, state: label });
  } catch (error) {
    invalid(label, error instanceof Error ? error.message : 'must contain visible Markdown task syntax');
  }
  const parsed = visible.parsed;
  if (parsed.boardIssue || parsed.warnings.length !== 0 || parsed.tasks.length !== parsed.byId.size) {
    invalid(label, 'must contain one valid canonical task set with no parser diagnostics');
  }
  return {
    parsed,
    bytes: Buffer.from(bytes),
    lines: visible.lines,
    activeEnd: visible.activeEnd,
    history: visible.historyOffset === null
      ? null
      : {
        startOffset: visible.historyOffset,
        suffix: bytes.subarray(visible.historyOffset).toString('utf8'),
      },
  };
}

/** @param {ReturnType<typeof parsedDefinitionRecoveryTasksV1>} visible @param {string} label */
function partitionDefinitionRecoveryTasksV1(visible, label) {
  const { parsed } = visible;
  const inBoard = (lineIndex) => parsed.board !== null
    && lineIndex >= parsed.board.startLine
    && lineIndex <= parsed.board.endLine;
  const discoveredLines = visible.lines.flatMap((line, index) => (
    line.start < visible.activeEnd
      && !inBoard(index)
      && /^##[ \t]+Discovered[ \t]+During[ \t]+Execution(?:[ \t]+#+)?[ \t]*$/.test(line.text)
      ? [index]
      : []
  ));
  if (discoveredLines.length > 1) invalid(label, 'must contain at most one active discovered-work section');
  const discoveredLine = discoveredLines[0] ?? -1;
  const canonicalTasks = parsed.tasks.filter((task) => (
    discoveredLine === -1 || task.headerLine < discoveredLine
  ));
  const canonicalById = new Map(canonicalTasks.map((task) => [task.id, task]));
  const discovered = discoveredLine === -1
    ? null
    : visible.bytes.subarray(visible.lines[discoveredLine].start, visible.activeEnd).toString('utf8');
  return { canonicalTasks, canonicalById, discovered };
}

/** @param {import('../dude-engine/lib/tasks.mjs').Task} task */
function definitionRecoveryTaskMeaningV1(task) {
  return {
    id: task.id,
    parallel: task.parallel,
    label: task.label,
    description: task.description,
    deps: task.deps,
    order: task.order,
  };
}

/** @param {import('../dude-engine/lib/tasks.mjs').Task[]} left @param {import('../dude-engine/lib/tasks.mjs').Task[]} right @param {string} label */
function assertDefinitionRecoveryTaskMeaningEqualV1(left, right, label) {
  const leftRows = left.map(definitionRecoveryTaskMeaningV1);
  const rightRows = right.map(definitionRecoveryTaskMeaningV1);
  if (canonicalJson(leftRows) !== canonicalJson(rightRows)) {
    invalid(label, 'must preserve the exact staged canonical task meaning and order');
  }
}

/** @param {Buffer} stageBytes @param {Buffer} finalBytes */
function assertDefinitionRecoveryOwnerStageConsumedV1(stageBytes, finalBytes) {
  const label = 'definition recovery coordinator owner composition';
  const split = (bytes, side) => {
    const text = definitionRecoveryUtf8V1(bytes, `${label}.${side}`);
    const headings = [...text.matchAll(/^## Coordinator Log[^\r\n]*(?:\r\n|\n|\r)/gm)];
    if (headings.length !== 1) invalid(`${label}.${side}`, 'must contain exactly one Coordinator Log');
    const heading = /** @type {RegExpMatchArray} */ (headings[0]);
    const headingStart = /** @type {number} */ (heading.index);
    const marker = '<!-- dude:managed:end -->';
    const markerStart = text.indexOf(marker, headingStart + heading[0].length);
    if (markerStart === -1 || text.indexOf(marker, markerStart + marker.length) !== -1) {
      invalid(`${label}.${side}`, 'must contain one terminal managed end after Coordinator Log');
    }
    return {
      prefix: text.slice(0, headingStart),
      log: text.slice(headingStart, markerStart),
      suffix: text.slice(markerStart),
    };
  };
  const staged = split(stageBytes, 'stage');
  const composed = split(finalBytes, 'final');
  if (staged.prefix !== composed.prefix || staged.suffix !== composed.suffix
    || !composed.log.startsWith(staged.log)) {
    invalid(label, 'must consume the exact Spec Lead owner stage and only append coordinator log bytes');
  }
}

/** @param {unknown} value @param {string} label */
function validateDefinitionRecoveryArchiveRecordV1(value, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const record = assertExactRecord(
    value,
    [
      'type', 'version', 'reconciliationIdentity', 'archiveIdentity',
      'priorTaskKey', 'priorTaskScopeIdentity', 'priorGlyph', 'defectReason',
      'defectEvidenceIdentities', 'triggerEvidenceIdentities', 'successorTaskKeys',
      'successorObligationMappingIdentities', 'successorCheckMappingIdentities',
    ],
    [],
    label,
  );
  if (record.type !== 'dropped-defective' || record.version !== 1) {
    invalid(label, 'must be a version 1 dropped-defective archive record');
  }
  for (const field of ['reconciliationIdentity', 'archiveIdentity', 'priorTaskScopeIdentity']) {
    assertHash(record[field], `${label}.${field}`);
  }
  assertDefinitionTaskKeyV1(record.priorTaskKey, `${label}.priorTaskKey`);
  assertEnum(record.priorGlyph, ['~', '!', 'x'], `${label}.priorGlyph`);
  assertUnicodeScalarString(record.defectReason, `${label}.defectReason`);
  if (/** @type {string} */ (record.defectReason).trim().length === 0
    || Buffer.byteLength(/** @type {string} */ (record.defectReason)) > 512) {
    invalid(`${label}.defectReason`, 'must be non-empty and at most 512 UTF-8 bytes');
  }
  validateDefinitionRevisionHashSetV1(record.defectEvidenceIdentities, `${label}.defectEvidenceIdentities`);
  validateDefinitionRevisionHashSetV1(record.triggerEvidenceIdentities, `${label}.triggerEvidenceIdentities`);
  validateDefinitionTaskKeySetV1(record.successorTaskKeys, `${label}.successorTaskKeys`, 1);
  validateDefinitionRevisionHashSetV1(
    record.successorObligationMappingIdentities,
    `${label}.successorObligationMappingIdentities`,
  );
  validateDefinitionRevisionHashSetV1(
    record.successorCheckMappingIdentities,
    `${label}.successorCheckMappingIdentities`,
  );
  return record;
}

/**
 * Enforce only the state and archive consequences of the reviewed semantic
 * reconciliation. Semantic equivalence remains the independent reviewer's job.
 * @param {Buffer} currentBytes @param {Buffer} stageBytes @param {Buffer} finalBytes
 * @param {Record<string, unknown>} reconciliation @param {unknown} archiveRecordsValue
 * @param {string} taskPath
 */
function composeDefinitionTaskReconciliationV1(
  currentBytes,
  stageBytes,
  finalBytes,
  reconciliation,
  archiveRecordsValue,
  taskPath,
) {
  const current = parsedDefinitionRecoveryTasksV1(currentBytes, taskPath, 'definition recovery current tasks');
  const stage = parsedDefinitionRecoveryTasksV1(stageBytes, taskPath, 'definition recovery Spec Lead task stage');
  const final = parsedDefinitionRecoveryTasksV1(finalBytes, taskPath, 'definition recovery coordinator-final tasks');
  const currentParts = partitionDefinitionRecoveryTasksV1(current, 'definition recovery current tasks');
  const stageParts = partitionDefinitionRecoveryTasksV1(stage, 'definition recovery Spec Lead task stage');
  const finalParts = partitionDefinitionRecoveryTasksV1(final, 'definition recovery coordinator-final tasks');
  assertDefinitionRecoveryTaskMeaningEqualV1(
    stageParts.canonicalTasks,
    finalParts.canonicalTasks,
    'definition recovery coordinator-final tasks',
  );
  if (stageParts.canonicalTasks.some((task) => (
    task.glyph !== ' ' || task.blockedBy !== null || task.extraMeta.length !== 0
  ))) {
    invalid('definition recovery Spec Lead task stage', 'must leave every staged task open without execution state');
  }
  if (stageParts.discovered !== currentParts.discovered
    || finalParts.discovered !== currentParts.discovered) {
    invalid('definition recovery discovered work', 'must remain byte-identical outside canonical task reconciliation');
  }
  const currentKeys = currentParts.canonicalTasks.map((task) => task.id).sort(compareUtf8);
  const finalKeys = finalParts.canonicalTasks.map((task) => task.id).sort(compareUtf8);
  if (canonicalJson(currentKeys) !== canonicalJson(reconciliation.declaredOldTaskKeys)
    || canonicalJson(finalKeys) !== canonicalJson(reconciliation.declaredFinalTaskKeys)) {
    invalid('definition recovery task reconciliation', 'must exactly cover current and coordinator-final canonical tasks');
  }
  const rows = definitionReconciliationRowsByIdentityV1({ taskReconciliation: reconciliation });
  for (const row of rows) {
    const disposition = /** @type {string} */ (row.disposition);
    const oldTasks = /** @type {Record<string, unknown>[]} */ (row.oldTasks);
    const finalTasks = /** @type {Record<string, unknown>[]} */ (row.finalTasks);
    if (disposition === 'dropped') {
      const old = currentParts.canonicalById.get(/** @type {string} */ (oldTasks[0].taskKey));
      if (!old) invalid('definition recovery dropped task', 'must resolve in current tasks');
      if (old.glyph !== ' ') {
        invalid('clarification-required:', `non-open task ${old.id} cannot be dropped automatically`);
      }
    }
    for (const anchor of finalTasks) {
      const finalTask = finalParts.canonicalById.get(/** @type {string} */ (anchor.taskKey));
      if (!finalTask) invalid('definition recovery final task', 'must resolve in coordinator-final tasks');
      if (disposition === 'one-to-one-kept') {
        const oldTask = currentParts.canonicalById.get(/** @type {string} */ (oldTasks[0].taskKey));
        if (!oldTask
          || finalTask.glyph !== oldTask.glyph
          || finalTask.blockedBy !== oldTask.blockedBy
          || canonicalJson(finalTask.extraMeta) !== canonicalJson(oldTask.extraMeta)) {
          invalid('definition recovery kept task', 'must preserve its exact prior glyph and execution metadata');
        }
      } else if (finalTask.glyph !== ' ' || finalTask.blockedBy !== null
        || finalTask.extraMeta.length !== 0) {
        invalid('definition recovery successor task', 'must be open with no inherited state or completion metadata');
      }
    }
  }
  if (stage.history?.suffix !== current.history?.suffix) {
    invalid('definition recovery Spec Lead task stage', 'must byte-preserve prior Lightweight execution history');
  }
  if (utilTypes.isProxy(archiveRecordsValue)) invalid('definition recovery archive records', 'must not be a Proxy');
  const archiveValues = assertDenseDataArray(archiveRecordsValue, 'definition recovery archive records');
  const droppedRows = rows.filter((row) => row.disposition === 'dropped-defective');
  if (archiveValues.length !== droppedRows.length) {
    invalid('definition recovery archive records', 'must contain exactly one record per dropped-defective row');
  }
  const archives = archiveValues.map((value, index) => validateDefinitionRecoveryArchiveRecordV1(
    value,
    `definition recovery archive records[${index}]`,
  ));
  for (let index = 0; index < archives.length; index += 1) {
    const archiveRecord = archives[index];
    const row = droppedRows[index];
    if (archiveRecord.reconciliationIdentity !== row.reconciliationIdentity) {
      invalid('definition recovery archive records', 'must be sorted by and bind the exact reconciliation rows');
    }
    const proofArchive = /** @type {Record<string, unknown>} */ (row.archive);
    const oldAnchor = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>[]} */ (row.oldTasks)[0]
    );
    const oldTask = currentParts.canonicalById.get(/** @type {string} */ (oldAnchor.taskKey));
    if (!oldTask || oldTask.glyph === ' '
      || archiveRecord.priorTaskKey !== oldAnchor.taskKey
      || archiveRecord.priorTaskScopeIdentity !== oldAnchor.taskScopeIdentity
      || archiveRecord.priorGlyph !== oldTask.glyph) {
      invalid('definition recovery archive record', 'must bind the exact non-open prior task identity and state');
    }
    for (const field of [
      'archiveIdentity', 'defectEvidenceIdentities', 'triggerEvidenceIdentities',
      'successorTaskKeys', 'successorObligationMappingIdentities',
      'successorCheckMappingIdentities',
    ]) {
      if (canonicalJson(archiveRecord[field]) !== canonicalJson(proofArchive[field])) {
        invalid(`definition recovery archive record.${field}`, 'must match the exact reviewed archive mapping');
      }
    }
  }
  const historyAppend = archives.length === 0
    ? null
    : Buffer.from(archives.map((record) => (
      `${DEFINITION_RECOVERY_ARCHIVE_PREFIX}${canonicalJson(record)}\n`
    )).join(''));
  const expectedFinalHistory = `${current.history?.suffix ?? ''}${historyAppend?.toString('utf8') ?? ''}`;
  if ((final.history?.suffix ?? '') !== expectedFinalHistory) {
    invalid('definition recovery coordinator-final tasks', 'must preserve prior history and append the exact complete archive');
  }
  return historyAppend;
}

/**
 * Consume a Spec Lead-authorized stage and bind the coordinator's exact final
 * four-path bytes plus every represented reconciliation effect.
 * @param {unknown} value
 */
export function composeDefinitionRecoveryV1(value) {
  if (utilTypes.isProxy(value)) invalid('DefinitionRecoveryCompositionV1', 'must not be a Proxy');
  assertProxyFreeDataGraph(value, 'DefinitionRecoveryCompositionV1');
  const input = assertExactRecord(
    value,
    ['version', 'mode', 'intent', 'target', 'owner', 'eligibility', 'stage', 'coordinator'],
    [],
    'DefinitionRecoveryCompositionV1',
  );
  if (input.version !== 1 || input.mode !== 'autonomous' || input.intent !== 'unchanged') {
    invalid('DefinitionRecoveryCompositionV1', 'requires version 1 explicit autonomous unchanged-intent recovery');
  }
  const target = /** @type {Record<string, unknown>} */ (
    validateAffectedTargetV2(input.target, 'DefinitionRecoveryCompositionV1.target')
  );
  if (target.lane !== 'lightweight') invalid('DefinitionRecoveryCompositionV1.target.lane', 'must be lightweight');
  const owner = assertExactRecord(input.owner, ['ideaPath', 'specPath'], [], 'DefinitionRecoveryCompositionV1.owner');
  assertDirectIdeaPath(owner.ideaPath, 'DefinitionRecoveryCompositionV1.owner.ideaPath');
  if (owner.specPath !== target.specPath) invalid('DefinitionRecoveryCompositionV1.owner.specPath', 'must match target');
  const expectedPaths = exactDefinitionRevisionPathsV1(target, owner);
  const eligibility = /** @type {Record<string, unknown>} */ (
    validateDefinitionReconciliationEligibilityV1(input.eligibility, 'DefinitionRecoveryCompositionV1.eligibility')
  );
  const stage = assertExactRecord(
    input.stage,
    [
      'authorityIdentity', 'artifacts', 'specEditClass', 'obligationMappings',
      'checkMappings', 'taskReconciliation', 'reviewerEvidenceReferences',
    ],
    [],
    'DefinitionRecoveryCompositionV1.stage',
  );
  const coordinator = assertExactRecord(
    input.coordinator,
    ['authorityIdentity', 'artifacts', 'archiveRecords'],
    [],
    'DefinitionRecoveryCompositionV1.coordinator',
  );
  assertHash(stage.authorityIdentity, 'DefinitionRecoveryCompositionV1.stage.authorityIdentity');
  assertHash(coordinator.authorityIdentity, 'DefinitionRecoveryCompositionV1.coordinator.authorityIdentity');
  if (stage.authorityIdentity === coordinator.authorityIdentity) {
    invalid('DefinitionRecoveryCompositionV1.coordinator.authorityIdentity', 'must be distinct from the Spec Lead');
  }
  assertEnum(stage.specEditClass, DEFINITION_SPEC_EDIT_CLASSES, 'DefinitionRecoveryCompositionV1.stage.specEditClass');
  validateDefinitionObligationMappingSetV1(stage.obligationMappings, 'DefinitionRecoveryCompositionV1.stage.obligationMappings');
  validateDefinitionCheckMappingSetV1(stage.checkMappings, 'DefinitionRecoveryCompositionV1.stage.checkMappings');
  const reconciliation = /** @type {Record<string, unknown>} */ (
    validateDefinitionTaskReconciliationV1(
      stage.taskReconciliation,
      'DefinitionRecoveryCompositionV1.stage.taskReconciliation',
    )
  );
  validateDefinitionReviewerEvidenceReferencesV1(
    stage.reviewerEvidenceReferences,
    'DefinitionRecoveryCompositionV1.stage.reviewerEvidenceReferences',
  );
  const stageArtifacts = definitionRecoveryArtifactRowsV1(
    stage.artifacts,
    expectedPaths,
    'DefinitionRecoveryCompositionV1.stage.artifacts',
  );
  const finalArtifacts = definitionRecoveryArtifactRowsV1(
    coordinator.artifacts,
    expectedPaths,
    'DefinitionRecoveryCompositionV1.coordinator.artifacts',
  );
  for (let index = 0; index < expectedPaths.length; index += 1) {
    if (!stageArtifacts[index].expected.equals(finalArtifacts[index].expected)) {
      invalid('DefinitionRecoveryCompositionV1.coordinator.artifacts', 'must use the exact staged prestate bytes');
    }
  }
  const ownerPath = /** @type {string} */ (owner.ideaPath);
  const packageRoot = /** @type {string} */ (target.specPath).slice(0, -'spec.md'.length);
  const planPath = `${packageRoot}plan.md`;
  const specPath = /** @type {string} */ (target.specPath);
  const taskPath = `${packageRoot}tasks.md`;
  const stageByPath = new Map(stageArtifacts.map((row) => [row.path, row]));
  const finalByPath = new Map(finalArtifacts.map((row) => [row.path, row]));
  for (const artifactPath of [planPath, specPath]) {
    if (!stageByPath.get(artifactPath)?.staged.equals(finalByPath.get(artifactPath)?.staged)) {
      invalid(`DefinitionRecoveryCompositionV1.coordinator.artifacts.${artifactPath}`, 'must equal the exact Spec Lead stage');
    }
  }
  assertDefinitionRecoveryOwnerStageConsumedV1(
    /** @type {{staged:Buffer}} */ (stageByPath.get(ownerPath)).staged,
    /** @type {{staged:Buffer}} */ (finalByPath.get(ownerPath)).staged,
  );
  const historyAppend = composeDefinitionTaskReconciliationV1(
    /** @type {{expected:Buffer}} */ (finalByPath.get(taskPath)).expected,
    /** @type {{staged:Buffer}} */ (stageByPath.get(taskPath)).staged,
    /** @type {{staged:Buffer}} */ (finalByPath.get(taskPath)).staged,
    reconciliation,
    coordinator.archiveRecords,
    taskPath,
  );
  const prestateDescriptors = definitionRecoveryDescriptorsV1(finalArtifacts, 'expected');
  const coordinatorFinalDescriptors = definitionRecoveryDescriptorsV1(finalArtifacts, 'staged');
  const obligationMappings = /** @type {Record<string, unknown>} */ (stage.obligationMappings);
  const checkMappings = /** @type {Record<string, unknown>} */ (stage.checkMappings);
  const proposal = buildDefinitionRevisionProposalV1({
    target,
    owner,
    eligibility,
    prestateDescriptors,
    coordinatorFinalDescriptors,
    mappingReferences: [obligationMappings.componentIdentity, checkMappings.componentIdentity]
      .sort(compareUtf8),
    reconciliationReferences: [reconciliation.componentIdentity],
    reviewerEvidenceReferences: stage.reviewerEvidenceReferences,
  });
  const proof = buildDefinitionRevisionProofV1({
    proposalIdentity: proposal.proposalIdentity,
    target,
    owner,
    eligibilityIdentity: eligibility.eligibilityIdentity,
    prestateDescriptorIdentity: sha256(canonicalJson(prestateDescriptors)),
    coordinatorFinalDescriptors,
    specEditClass: stage.specEditClass,
    authorities: {
      stagerAuthorityIdentity: stage.authorityIdentity,
      coordinatorAuthorityIdentity: coordinator.authorityIdentity,
    },
    obligationMappings,
    checkMappings,
    taskReconciliation: reconciliation,
  });
  validateDefinitionRevisionProofBindingV1(proposal, proof, 'DefinitionRecoveryCompositionV1.binding');
  const stageIdentity = sha256(canonicalJson({
    authorityIdentity: stage.authorityIdentity,
    descriptors: definitionRecoveryDescriptorsV1(stageArtifacts, 'staged'),
    specEditClass: stage.specEditClass,
    obligationMappingIdentity: obligationMappings.componentIdentity,
    checkMappingIdentity: checkMappings.componentIdentity,
    taskReconciliationIdentity: reconciliation.componentIdentity,
    reviewerEvidenceReferences: stage.reviewerEvidenceReferences,
  }));
  const compositionIdentity = sha256(canonicalJson({
    stageIdentity,
    coordinatorAuthorityIdentity: coordinator.authorityIdentity,
    proposalIdentity: proposal.proposalIdentity,
    proofIdentity: proof.proofIdentity,
    archiveRecords: coordinator.archiveRecords,
  }));
  return {
    stageIdentity,
    compositionIdentity,
    proposal,
    proof,
    changes: finalArtifacts.map((row) => ({
      path: row.path,
      expected: Buffer.from(row.expected),
      staged: Buffer.from(row.staged),
    })),
    reconciliationEvidence: {
      reconciliationIdentity: reconciliation.componentIdentity,
      historyAppend: historyAppend === null ? null : { path: taskPath, bytes: historyAppend },
    },
  };
}

/**
 * Validate the closed authorization shape and its exact proposal binding
 * without consulting a fresh Inspection.
 * @param {unknown} value @param {unknown} proposalValue @param {string} [label]
 */
function validatedDefinitionRecoveryAuthorizationShapeV1(
  value,
  proposalValue,
  label = 'DefinitionRecoveryAuthorizationV1',
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  assertProxyFreeDataGraph(value, label);
  const authorization = assertExactRecord(
    value,
    ['authorized', 'reason', 'state', 'definitionReconciliation'],
    ['attemptIdentity', 'claimRequired'],
    label,
  );
  if (authorization.authorized !== true || authorization.reason !== 'authorized') {
    invalid(label, 'must be one accepted authorization');
  }
  const proposal = /** @type {Record<string, unknown>} */ (
    validateDefinitionRevisionProposalV1(proposalValue, `${label}.proposal`)
  );
  const state = /** @type {Record<string, unknown>} */ (
    validateRunState(authorization.state)
  );
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid(`${label}.state.policy.mode`, 'must be autonomous');
  }
  const pendingRows = /** @type {Record<string, unknown>[]} */ (state.pending);
  if (pendingRows.length !== 1) invalid(`${label}.state.pending`, 'must contain exactly one pending recovery');
  const pending = pendingRows[0];
  const materialInputs = /** @type {Record<string, unknown>} */ (pending.materialInputs);
  if (pending.action !== 'reconcile-derived-definition'
    || pending.mode !== 'recovery'
    || pending.approachHash !== proposal.proposalIdentity
    || targetKey(/** @type {Record<string, unknown>} */ (pending.target)) !== targetKey(
      /** @type {Record<string, unknown>} */ (proposal.target),
    )
    || canonicalJson(materialInputs.checks) !== canonicalJson(['lint', 'review', 'verification'])) {
    invalid(`${label}.state.pending`, 'must bind the exact authorized definition proposal and checks');
  }
  const binding = assertExactRecord(
    authorization.definitionReconciliation,
    [
      'version', 'variant', 'proposalIdentity', 'eligibilityIdentity', 'proposal',
      'reviewerEvidenceReferences', 'approachBasis', 'approachBasisIdentity',
    ],
    [],
    `${label}.definitionReconciliation`,
  );
  if (binding.version !== 1
    || binding.proposalIdentity !== proposal.proposalIdentity
    || canonicalJson(binding.proposal) !== canonicalJson(proposal)
    || canonicalJson(binding.reviewerEvidenceReferences)
      !== canonicalJson(proposal.reviewerEvidenceReferences)) {
    invalid(`${label}.definitionReconciliation`, 'must bind the exact proposal and reviewer evidence references');
  }
  const eligibility = /** @type {Record<string, unknown>} */ (proposal.eligibility);
  if (binding.variant !== eligibility.variant
    || binding.eligibilityIdentity !== eligibility.eligibilityIdentity) {
    invalid(`${label}.definitionReconciliation`, 'must bind the exact trusted eligibility variant');
  }
  validateApproachBasisV1(binding.approachBasis, `${label}.definitionReconciliation.approachBasis`);
  if (binding.approachBasisIdentity !== sha256(canonicalJson(binding.approachBasis))
    || canonicalJson(binding.approachBasis.mechanismIdentities)
      !== canonicalJson([proposal.proposalIdentity])) {
    invalid(`${label}.definitionReconciliation.approachBasis`, 'must bind the exact proposal-only approach identity');
  }
  return { authorization, proposal, state, materialInputs, binding };
}

/**
 * Validate only the authorization shape used during deterministic preparation.
 * Fresh evidence is deliberately re-derived by validateDefinitionRecoveryAuthorizationV1.
 * @param {unknown} value @param {unknown} proposalValue @param {string} [label]
 */
export function validateDefinitionRecoveryAuthorizationShapeV1(
  value,
  proposalValue,
  label = 'DefinitionRecoveryAuthorizationShapeV1',
) {
  validatedDefinitionRecoveryAuthorizationShapeV1(value, proposalValue, label);
  return value;
}

/**
 * Bind execution to the exact transient authorization produced by the existing
 * T001 recovery path. This adds no authorization policy or persisted state.
 * @param {unknown} value @param {unknown} proposalValue @param {unknown} inspectionValue
 * @param {string} [label]
 */
export function validateDefinitionRecoveryAuthorizationV1(
  value,
  proposalValue,
  inspectionValue,
  label = 'DefinitionRecoveryAuthorizationV1',
) {
  const { state, proposal, materialInputs, binding } = validatedDefinitionRecoveryAuthorizationShapeV1(
    value,
    proposalValue,
    label,
  );
  assertProxyFreeDataGraph(inspectionValue, `${label}.inspection`);
  const inspection = /** @type {Record<string, unknown>} */ (
    validateInspection(inspectionValue)
  );
  if (targetKey(inspection.target) !== targetKey(/** @type {Record<string, unknown>} */ (proposal.target))) {
    invalid(`${label}.inspection.target`, 'must match the exact proposal target');
  }
  const derived = deriveDefinitionReconciliationBindingV1(
    state,
    /** @type {Record<string, unknown>} */ (proposal.target),
    inspection,
    materialInputs,
  );
  if (!derived.binding
    || canonicalJson(derived.binding) !== canonicalJson(binding)) {
    invalid(`${label}.inspection`, 'must freshly re-derive the exact trusted eligibility binding');
  }
  return value;
}

/**
 * Validate the exact identity body for one closed automatic-redefinition
 * eligibility variant. These references bind evidence; they do not establish
 * semantic equivalence between definitions or decompositions.
 * @param {unknown} value @param {string} label @param {boolean} withIdentity
 */
function definitionReconciliationEligibilityBodyV1(value, label, withIdentity) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const candidate = assertRecord(value, label);
  assertEnum(
    candidate.variant,
    ['definition-contradiction', 'learning-no-alternative'],
    `${label}.variant`,
  );
  const identityField = withIdentity ? ['eligibilityIdentity'] : [];
  if (candidate.variant === 'definition-contradiction') {
    const eligibility = assertExactRecord(
      value,
      [
        'variant', 'proofKind', 'blockerEvidenceIdentity', 'gateEvidenceIdentity',
        'definitionReferenceIdentities', 'causalEvidenceIdentities',
        ...identityField,
      ],
      [],
      label,
    );
    assertEnum(eligibility.proofKind, ['contradiction', 'impossible-gate'], `${label}.proofKind`);
    assertHash(eligibility.blockerEvidenceIdentity, `${label}.blockerEvidenceIdentity`);
    assertHash(eligibility.gateEvidenceIdentity, `${label}.gateEvidenceIdentity`);
    validateDefinitionHashSetV1(
      eligibility.definitionReferenceIdentities,
      `${label}.definitionReferenceIdentities`,
      eligibility.proofKind === 'contradiction' ? 2 : 1,
    );
    validateDefinitionHashSetV1(eligibility.causalEvidenceIdentities, `${label}.causalEvidenceIdentities`);
    return {
      variant: eligibility.variant,
      proofKind: eligibility.proofKind,
      blockerEvidenceIdentity: eligibility.blockerEvidenceIdentity,
      gateEvidenceIdentity: eligibility.gateEvidenceIdentity,
      definitionReferenceIdentities: eligibility.definitionReferenceIdentities,
      causalEvidenceIdentities: eligibility.causalEvidenceIdentities,
    };
  }
  const eligibility = assertExactRecord(
    value,
    [
      'variant', 'blockerEvidenceIdentity', 'governanceIdentity', 'reviewIdentity',
      'learningReviewEventHash', 'failedApproachSetIdentity', 'noProgressProofIdentity',
      'noNewDistinguishingEvidenceHash', 'projectionReferenceIdentity',
      ...identityField,
    ],
    [],
    label,
  );
  for (const field of [
    'blockerEvidenceIdentity', 'governanceIdentity', 'reviewIdentity',
    'learningReviewEventHash', 'failedApproachSetIdentity', 'noProgressProofIdentity',
    'noNewDistinguishingEvidenceHash', 'projectionReferenceIdentity',
  ]) assertHash(eligibility[field], `${label}.${field}`);
  return {
    variant: eligibility.variant,
    blockerEvidenceIdentity: eligibility.blockerEvidenceIdentity,
    governanceIdentity: eligibility.governanceIdentity,
    reviewIdentity: eligibility.reviewIdentity,
    learningReviewEventHash: eligibility.learningReviewEventHash,
    failedApproachSetIdentity: eligibility.failedApproachSetIdentity,
    noProgressProofIdentity: eligibility.noProgressProofIdentity,
    noNewDistinguishingEvidenceHash: eligibility.noNewDistinguishingEvidenceHash,
    projectionReferenceIdentity: eligibility.projectionReferenceIdentity,
  };
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionReconciliationEligibilityV1(
  value,
  label = 'DefinitionReconciliationEligibilityV1',
) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const eligibility = assertRecord(value, label);
  const body = definitionReconciliationEligibilityBodyV1(eligibility, label, true);
  assertHash(eligibility.eligibilityIdentity, `${label}.eligibilityIdentity`);
  if (eligibility.eligibilityIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.eligibilityIdentity`, 'must equal the exact closed eligibility identity');
  }
  return value;
}

/** Build one exact eligibility value without inferring semantic facts. @param {unknown} value */
export function buildDefinitionReconciliationEligibilityV1(value) {
  const body = definitionReconciliationEligibilityBodyV1(
    value,
    'buildDefinitionReconciliationEligibilityV1',
    false,
  );
  const eligibility = {
    ...JSON.parse(canonicalJson(body)),
    eligibilityIdentity: sha256(canonicalJson(body)),
  };
  validateDefinitionReconciliationEligibilityV1(eligibility);
  return eligibility;
}

/** @param {unknown} value @param {string[]} expectedPaths @param {string} label */
function validateDefinitionArtifactDescriptorsV1(value, expectedPaths, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const rows = assertDenseDataArray(value, label);
  if (rows.length !== expectedPaths.length) {
    invalid(label, `must contain exactly ${expectedPaths.length} descriptors`);
  }
  rows.forEach((rowValue, index) => {
    const rowLabel = `${label}[${index}]`;
    if (utilTypes.isProxy(rowValue)) invalid(rowLabel, 'must not be a Proxy');
    const row = assertExactRecord(rowValue, ['path', 'sha256', 'byteLength'], [], rowLabel);
    if (row.path !== expectedPaths[index]) invalid(`${rowLabel}.path`, 'must match the exact four-artifact scope');
    assertHash(row.sha256, `${rowLabel}.sha256`);
    assertSafeInteger(row.byteLength, `${rowLabel}.byteLength`, false);
    if (/** @type {number} */ (row.byteLength) > MAX_SOURCE_BODY_BYTES) {
      invalid(`${rowLabel}.byteLength`, `must not exceed ${MAX_SOURCE_BODY_BYTES} bytes`);
    }
  });
  return rows;
}

/** @param {unknown} value @param {string} label */
function validateDefinitionReviewerEvidenceReferencesV1(value, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const references = assertExactRecord(
    value,
    ['blockerEvidenceIdentities', 'decompositionEvidenceIdentities'],
    [],
    label,
  );
  validateDefinitionHashSetV1(references.blockerEvidenceIdentities, `${label}.blockerEvidenceIdentities`);
  validateDefinitionHashSetV1(
    references.decompositionEvidenceIdentities,
    `${label}.decompositionEvidenceIdentities`,
  );
  return references;
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} owner */
function exactDefinitionRevisionPathsV1(target, owner) {
  const packageRoot = /** @type {string} */ (target.specPath).slice(0, -'spec.md'.length);
  return [
    /** @type {string} */ (owner.ideaPath),
    `${packageRoot}plan.md`,
    `${packageRoot}spec.md`,
    `${packageRoot}tasks.md`,
  ].sort(compareUtf8);
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} owner @param {unknown} descriptorsValue @param {string} label */
function definitionSourceRevisionIdentityV1(target, owner, descriptorsValue, label) {
  const expectedPaths = exactDefinitionRevisionPathsV1(target, owner);
  const descriptors = /** @type {Record<string, unknown>[]} */ (
    validateDefinitionArtifactDescriptorsV1(descriptorsValue, expectedPaths, `${label}.descriptors`)
  );
  const writeSet = { candidatePaths: expectedPaths, protectedPaths: [] };
  const fileStates = descriptors.map((descriptor) => ({ ...descriptor, state: 'file' }));
  validateFileStateDescriptors(fileStates, writeSet, `${label}.fileStates`);
  return stateIdentity(writeSetIdentity(writeSet), fileStates);
}

/**
 * Keep append-only execution history outside the active definition source
 * revision. Exact proposal descriptors still retain the complete task bytes.
 * @param {Buffer} bytes @param {string} taskPath
 */
function definitionTaskSourceBytesV1(bytes, taskPath) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return null;
  let visible;
  try {
    visible = parseVisibleTasks(bytes, { path: taskPath, state: 'definition task source' });
  } catch {
    return null;
  }
  if (visible.parsed.warnings.length > 0) return null;
  if (visible.historyOffset === null) return bytes;
  let source = bytes.subarray(0, visible.activeEnd).toString('utf8');
  const separator = visible.parsed.preferredSeparator;
  if (separator.length > 0 && source.endsWith(`${separator}${separator}`)) {
    source = source.slice(0, -separator.length);
  }
  return Buffer.from(source, 'utf8');
}

/**
 * Derive an acquisition-only prestate binding from exact workspace bytes.
 * @param {Record<string, unknown>} raw @param {Record<string, unknown>} target
 * @param {string|null} ownerIdeaPath @param {{path:string,bytes:Buffer|null}|undefined} spec
 * @param {string|undefined} specStatus @param {Buffer} [taskBytesOverride] @param {string} [label]
 */
function acquiredDefinitionPrestateV1(
  raw,
  target,
  ownerIdeaPath,
  spec,
  specStatus,
  taskBytesOverride = undefined,
  label = 'acquired definition prestate',
) {
  if (ownerIdeaPath === null || !spec || specStatus !== undefined || !byteSequence(spec.bytes)) return null;
  const owner = { ideaPath: ownerIdeaPath, specPath: target.specPath };
  const expectedPaths = exactDefinitionRevisionPathsV1(target, owner);
  const ideas = /** @type {Record<string, unknown>[]} */ (raw.directIdeas);
  const ownerRows = ideas.filter((idea) => idea.path === ownerIdeaPath && byteSequence(idea.bytes));
  const tasks = /** @type {Record<string, unknown>} */ (raw.tasks);
  const plan = /** @type {Record<string, unknown>} */ (raw.definitionPlan);
  const acquiredTaskBytes = byteSequence(tasks.bytes);
  if (ownerRows.length !== 1
    || tasks.path !== expectedPaths.find((entry) => entry.endsWith('/tasks.md'))
    || plan.path !== expectedPaths.find((entry) => entry.endsWith('/plan.md'))
    || spec.path !== target.specPath) return null;
  const captures = new Map([
    [ownerIdeaPath, byteSequence(ownerRows[0].bytes)],
    [/** @type {string} */ (tasks.path), taskBytesOverride ?? acquiredTaskBytes],
    [/** @type {string} */ (plan.path), byteSequence(plan.bytes)],
    [/** @type {string} */ (spec.path), byteSequence(spec.bytes)],
  ]);
  if ([...captures.values()].some((bytes) => bytes === null)) return null;
  const prestateDescriptors = expectedPaths.map((artifactPath) => ({
    path: artifactPath,
    ...contentDescriptor(/** @type {Buffer} */ (captures.get(artifactPath))),
  }));
  const taskPath = /** @type {string} */ (tasks.path);
  const taskSourceBytes = definitionTaskSourceBytesV1(
    /** @type {Buffer} */ (captures.get(taskPath)),
    taskPath,
  );
  if (taskSourceBytes === null) return null;
  const sourceRevisionDescriptors = expectedPaths.map((artifactPath) => ({
    path: artifactPath,
    ...contentDescriptor(artifactPath === taskPath
      ? taskSourceBytes
      : /** @type {Buffer} */ (captures.get(artifactPath))),
  }));
  return {
    prestateDescriptors,
    sourceRevisionIdentity: definitionSourceRevisionIdentityV1(
      target,
      owner,
      sourceRevisionDescriptors,
      label,
    ),
  };
}

/**
 * Strip only one exact committed occurrence suffix from fresh task bytes.
 * @param {Record<string, unknown>} raw @param {Record<string, unknown>} target
 * @param {string|null} ownerIdeaPath @param {{path:string,bytes:Buffer|null}|undefined} spec
 * @param {string|undefined} specStatus @param {Buffer|undefined} expectedSuffix
 */
function acquiredDefinitionProjectionBaseV1(
  raw,
  target,
  ownerIdeaPath,
  spec,
  specStatus,
  expectedSuffix,
) {
  if (!expectedSuffix || expectedSuffix.byteLength === 0) return null;
  const tasks = /** @type {Record<string, unknown>} */ (raw.tasks);
  const taskBytes = byteSequence(tasks.bytes);
  if (!taskBytes || taskBytes.byteLength < expectedSuffix.byteLength) return null;
  const suffixOffset = taskBytes.byteLength - expectedSuffix.byteLength;
  if (!taskBytes.subarray(suffixOffset).equals(expectedSuffix)) return null;
  return acquiredDefinitionPrestateV1(
    raw,
    target,
    ownerIdeaPath,
    spec,
    specStatus,
    taskBytes.subarray(0, suffixOffset),
    'acquired definition projection base',
  );
}

/** @param {Record<string, unknown>} proposal @param {string} label */
function validateDefinitionRevisionProposalBodyV1(proposal, label) {
  if (proposal.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (utilTypes.isProxy(proposal.target)) invalid(`${label}.target`, 'must not be a Proxy');
  const target = /** @type {Record<string, unknown>} */ (
    validateAffectedTargetV2(proposal.target, `${label}.target`)
  );
  if (target.lane !== 'lightweight') invalid(`${label}.target.lane`, 'must be lightweight');
  if (canonicalJson(target) !== canonicalJson(canonicalTarget(target))) {
    invalid(`${label}.target`, 'must use the canonical affected-target shape');
  }
  if (utilTypes.isProxy(proposal.owner)) invalid(`${label}.owner`, 'must not be a Proxy');
  const owner = assertExactRecord(proposal.owner, ['ideaPath', 'specPath'], [], `${label}.owner`);
  assertDirectIdeaPath(owner.ideaPath, `${label}.owner.ideaPath`);
  if (owner.specPath !== target.specPath) invalid(`${label}.owner.specPath`, 'must match the exact target specification');
  const expectedPaths = exactDefinitionRevisionPathsV1(target, owner);
  validateDefinitionReconciliationEligibilityV1(proposal.eligibility, `${label}.eligibility`);
  validateDefinitionArtifactDescriptorsV1(proposal.prestateDescriptors, expectedPaths, `${label}.prestateDescriptors`);
  validateDefinitionArtifactDescriptorsV1(
    proposal.coordinatorFinalDescriptors,
    expectedPaths,
    `${label}.coordinatorFinalDescriptors`,
  );
  validateDefinitionHashSetV1(proposal.mappingReferences, `${label}.mappingReferences`);
  validateDefinitionHashSetV1(proposal.reconciliationReferences, `${label}.reconciliationReferences`);
  const reviewerReferences = validateDefinitionReviewerEvidenceReferencesV1(
    proposal.reviewerEvidenceReferences,
    `${label}.reviewerEvidenceReferences`,
  );
  const eligibility = /** @type {Record<string, unknown>} */ (proposal.eligibility);
  if (!/** @type {string[]} */ (reviewerReferences.blockerEvidenceIdentities)
    .includes(/** @type {string} */ (eligibility.blockerEvidenceIdentity))) {
    invalid(
      `${label}.reviewerEvidenceReferences.blockerEvidenceIdentities`,
      'must include the eligibility blocker evidence identity',
    );
  }
}

/** @param {unknown} value @param {string} [label] */
export function validateDefinitionRevisionProposalV1(value, label = 'DefinitionRevisionProposalV1') {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  const proposal = assertExactRecord(
    value,
    [
      'version', 'target', 'owner', 'eligibility', 'prestateDescriptors',
      'coordinatorFinalDescriptors', 'mappingReferences', 'reconciliationReferences',
      'reviewerEvidenceReferences', 'proposalIdentity',
    ],
    [],
    label,
  );
  validateDefinitionRevisionProposalBodyV1(proposal, label);
  assertHash(proposal.proposalIdentity, `${label}.proposalIdentity`);
  const { proposalIdentity, ...body } = proposal;
  if (proposalIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.proposalIdentity`, 'must equal the exact closed proposal identity');
  }
  if (Buffer.byteLength(canonicalJson(proposal)) > MAX_DEFINITION_REVISION_PROPOSAL_BYTES) {
    invalid(label, `must serialize to at most ${MAX_DEFINITION_REVISION_PROPOSAL_BYTES} UTF-8 bytes`);
  }
  return value;
}

/** Build one transient exact proposal identity without normalizing semantic content. @param {unknown} value */
export function buildDefinitionRevisionProposalV1(value) {
  if (utilTypes.isProxy(value)) invalid('buildDefinitionRevisionProposalV1', 'must not be a Proxy');
  const input = assertExactRecord(
    value,
    [
      'target', 'owner', 'eligibility', 'prestateDescriptors', 'coordinatorFinalDescriptors',
      'mappingReferences', 'reconciliationReferences', 'reviewerEvidenceReferences',
    ],
    [],
    'buildDefinitionRevisionProposalV1',
  );
  const body = { version: 1, ...input };
  validateDefinitionRevisionProposalBodyV1(body, 'buildDefinitionRevisionProposalV1');
  const canonicalBody = JSON.parse(canonicalJson(body));
  const proposal = {
    ...canonicalBody,
    proposalIdentity: sha256(canonicalJson(canonicalBody)),
  };
  validateDefinitionRevisionProposalV1(proposal);
  return proposal;
}

/** @param {unknown} value @param {string} [label] */
export function validateTrustedSourceCaptureV2(value, label = 'TrustedSourceCaptureV2') {
  const capture = assertExactRecord(value, ['target', 'state', 'outcomeHash', 'authority', 'bytes'], [], label);
  validateAffectedTargetV2(capture.target, `${label}.target`);
  if (capture.state !== 'complete') invalid(`${label}.state`, 'must be complete');
  assertHash(capture.outcomeHash, `${label}.outcomeHash`);
  const authority = assertExactRecord(
    capture.authority,
    ['kind', 'authorityIdentity', 'invocationIdentity'],
    [],
    `${label}.authority`,
  );
  assertEnum(authority.kind, ['verification', 'independent-review'], `${label}.authority.kind`);
  assertHash(authority.authorityIdentity, `${label}.authority.authorityIdentity`);
  assertHash(authority.invocationIdentity, `${label}.authority.invocationIdentity`);
  validateCapturedBytesV1(capture.bytes, `${label}.bytes`);
  return value;
}

/** @param {unknown} captureValue */
export function trustedSourceCaptureIdentityV2(captureValue) {
  validateTrustedSourceCaptureV2(captureValue);
  return sha256(canonicalJson(captureValue));
}

/** @param {unknown} value @param {string} label */
function validateCheckEvidenceV2(value, label) {
  const check = assertExactRecord(value, ['checkIdentity', 'definitionIdentity', 'outcome', 'evidenceIdentity'], [], label);
  assertHash(check.checkIdentity, `${label}.checkIdentity`);
  assertHash(check.definitionIdentity, `${label}.definitionIdentity`);
  assertEnum(check.outcome, ['passed', 'failed'], `${label}.outcome`);
  assertHash(check.evidenceIdentity, `${label}.evidenceIdentity`);
  const expected = sha256(canonicalJson({
    definitionIdentity: check.definitionIdentity,
    outcome: check.outcome,
    evidenceIdentity: check.evidenceIdentity,
  }));
  if (check.checkIdentity !== expected) invalid(`${label}.checkIdentity`, 'must equal the recomputed identity');
  return check;
}

/** @param {unknown} value @param {string} [label] */
export function validateVerificationEnvelopeV2(value, label = 'VerificationEnvelopeV2') {
  const envelope = assertExactRecord(
    value,
    ['type', 'version', 'envelopeIdentity', 'target', 'attemptIdentity', 'sourceRevisionIdentity', 'inspectedEvidenceHash', 'resultIdentity', 'checks'],
    [],
    label,
  );
  if (envelope.type !== 'verification-envelope') invalid(`${label}.type`, 'must be verification-envelope');
  if (envelope.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  assertHash(envelope.envelopeIdentity, `${label}.envelopeIdentity`);
  validateAffectedTargetV2(envelope.target, `${label}.target`);
  assertHash(envelope.attemptIdentity, `${label}.attemptIdentity`);
  assertHash(envelope.sourceRevisionIdentity, `${label}.sourceRevisionIdentity`);
  assertHash(envelope.inspectedEvidenceHash, `${label}.inspectedEvidenceHash`);
  assertHash(envelope.resultIdentity, `${label}.resultIdentity`);
  const checks = assertDenseDataArray(envelope.checks, `${label}.checks`);
  if (checks.length < 1 || checks.length > 16) invalid(`${label}.checks`, 'must contain 1 through 16 rows');
  checks.forEach((check, index) => {
    const row = validateCheckEvidenceV2(check, `${label}.checks[${index}]`);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (checks[index - 1]).checkIdentity),
      /** @type {string} */ (row.checkIdentity),
    ) >= 0) invalid(`${label}.checks`, 'must be sorted by checkIdentity and duplicate-free');
  });
  const { envelopeIdentity, ...withoutIdentity } = envelope;
  if (sha256(canonicalJson(withoutIdentity)) !== envelopeIdentity) {
    invalid(`${label}.envelopeIdentity`, 'must equal the recomputed envelope identity');
  }
  return value;
}

/** @param {unknown} value @param {Record<string, unknown>} verification @param {string} label */
function validateIndependentReviewFindingV2(value, verification, label) {
  const finding = assertExactRecord(
    value,
    ['version', 'findingIdentity', 'basis', 'basisIdentity', 'observation'],
    [],
    label,
  );
  if (finding.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  assertHash(finding.findingIdentity, `${label}.findingIdentity`);
  validateFindingBasisV1(finding.basis, `${label}.basis`);
  assertHash(finding.basisIdentity, `${label}.basisIdentity`);
  const basisIdentity = sha256(canonicalJson(finding.basis));
  if (finding.basisIdentity !== basisIdentity) invalid(`${label}.basisIdentity`, 'must equal the complete basis identity');
  const observation = assertExactRecord(finding.observation, ['kind', 'identity'], [], `${label}.observation`);
  assertEnum(observation.kind, ['observed-evidence', 'check-result'], `${label}.observation.kind`);
  assertHash(observation.identity, `${label}.observation.identity`);
  if (observation.kind === 'check-result') {
    const check = /** @type {Record<string, unknown>[]} */ (verification.checks)
      .find((row) => row.checkIdentity === observation.identity);
    if (!check || check.definitionIdentity !== /** @type {Record<string, unknown>} */ (finding.basis).checkDefinitionIdentity) {
      invalid(`${label}.observation`, 'must identify a bound verification check with the same definition identity');
    }
  }
  const expected = sha256(canonicalJson({ version: 2, basisIdentity, observation }));
  if (finding.findingIdentity !== expected) invalid(`${label}.findingIdentity`, 'must equal the recomputed finding identity');
  return finding;
}

/** @param {unknown} value @param {unknown} verificationValue @param {string} [label] */
export function validateIndependentReviewEnvelopeV2(value, verificationValue, label = 'IndependentReviewEnvelopeV2') {
  const verification = /** @type {Record<string, unknown>} */ (
    validateVerificationEnvelopeV2(verificationValue, `${label}.verification`)
  );
  const envelope = assertExactRecord(
    value,
    ['type', 'version', 'envelopeIdentity', 'target', 'attemptIdentity', 'attemptOrdinal', 'reviewOrdinal', 'reviewerAuthorityIdentity', 'reviewInvocationIdentity', 'sourceRevisionIdentity', 'inspectedEvidenceHash', 'resultIdentity', 'verificationEnvelopeIdentity', 'verdict', 'findings'],
    [],
    label,
  );
  if (envelope.type !== 'independent-review-envelope') invalid(`${label}.type`, 'must be independent-review-envelope');
  if (envelope.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  assertHash(envelope.envelopeIdentity, `${label}.envelopeIdentity`);
  validateAffectedTargetV2(envelope.target, `${label}.target`);
  assertHash(envelope.attemptIdentity, `${label}.attemptIdentity`);
  assertSafeInteger(envelope.attemptOrdinal, `${label}.attemptOrdinal`, true);
  assertSafeInteger(envelope.reviewOrdinal, `${label}.reviewOrdinal`, true);
  assertHash(envelope.reviewerAuthorityIdentity, `${label}.reviewerAuthorityIdentity`);
  assertHash(envelope.reviewInvocationIdentity, `${label}.reviewInvocationIdentity`);
  assertHash(envelope.sourceRevisionIdentity, `${label}.sourceRevisionIdentity`);
  assertHash(envelope.inspectedEvidenceHash, `${label}.inspectedEvidenceHash`);
  assertHash(envelope.resultIdentity, `${label}.resultIdentity`);
  assertHash(envelope.verificationEnvelopeIdentity, `${label}.verificationEnvelopeIdentity`);
  assertEnum(envelope.verdict, ['accepted', 'rejected'], `${label}.verdict`);
  const findings = assertDenseDataArray(envelope.findings, `${label}.findings`);
  if (findings.length > 16) invalid(`${label}.findings`, 'must contain at most 16 rows');
  if ((envelope.verdict === 'accepted' && findings.length !== 0)
    || (envelope.verdict === 'rejected' && findings.length === 0)) {
    invalid(`${label}.findings`, 'must be empty for accepted review and nonempty for rejected review');
  }
  findings.forEach((finding, index) => {
    const row = validateIndependentReviewFindingV2(finding, verification, `${label}.findings[${index}]`);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (findings[index - 1]).findingIdentity),
      /** @type {string} */ (row.findingIdentity),
    ) >= 0) invalid(`${label}.findings`, 'must be sorted by findingIdentity and duplicate-free');
  });
  for (const field of ['target', 'attemptIdentity', 'sourceRevisionIdentity', 'inspectedEvidenceHash', 'resultIdentity']) {
    if (canonicalJson(envelope[field]) !== canonicalJson(verification[field])) {
      invalid(`${label}.${field}`, 'must match the bound verification envelope');
    }
  }
  if (envelope.verificationEnvelopeIdentity !== verification.envelopeIdentity) {
    invalid(`${label}.verificationEnvelopeIdentity`, 'must bind the verification envelope');
  }
  const { envelopeIdentity, ...withoutIdentity } = envelope;
  if (sha256(canonicalJson(withoutIdentity)) !== envelopeIdentity) {
    invalid(`${label}.envelopeIdentity`, 'must equal the recomputed envelope identity');
  }
  return value;
}

/** @param {Record<string, unknown>} eventWithoutHash @param {string} label */
function finalizeV2Event(eventWithoutHash, label) {
  const event = { ...eventWithoutHash, eventHash: sha256(canonicalJson(eventWithoutHash)) };
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) {
    invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  }
  return event;
}

/** @param {unknown} input */
export function buildFindingOccurrenceEventV1(input) {
  const args = assertExactRecord(
    input,
    ['target', 'basis', 'attemptIdentity', 'attemptApproachBasisIdentity', 'reviewEnvelopeIdentity', 'findingIdentity', 'observation', 'attemptOrdinal', 'reviewOrdinal', 'sourceCaptureIdentity'],
    [],
    'buildFindingOccurrenceEventV1',
  );
  const target = canonicalTarget(validateAffectedTargetV2(args.target, 'buildFindingOccurrenceEventV1.target'));
  validateFindingBasisV1(args.basis, 'buildFindingOccurrenceEventV1.basis');
  if (canonicalJson(/** @type {Record<string, unknown>} */ (args.basis).target) !== canonicalJson(target)) {
    invalid('buildFindingOccurrenceEventV1.basis.target', 'must match the event target');
  }
  for (const field of ['attemptIdentity', 'attemptApproachBasisIdentity', 'reviewEnvelopeIdentity', 'findingIdentity', 'sourceCaptureIdentity']) {
    assertHash(args[field], `buildFindingOccurrenceEventV1.${field}`);
  }
  const observation = assertExactRecord(args.observation, ['kind', 'identity'], [], 'buildFindingOccurrenceEventV1.observation');
  assertEnum(observation.kind, ['observed-evidence', 'check-result'], 'buildFindingOccurrenceEventV1.observation.kind');
  assertHash(observation.identity, 'buildFindingOccurrenceEventV1.observation.identity');
  assertSafeInteger(args.attemptOrdinal, 'buildFindingOccurrenceEventV1.attemptOrdinal', true);
  assertSafeInteger(args.reviewOrdinal, 'buildFindingOccurrenceEventV1.reviewOrdinal', true);
  const basisIdentity = sha256(canonicalJson(args.basis));
  const expectedFindingIdentity = sha256(canonicalJson({
    version: 2,
    basisIdentity,
    observation: { kind: observation.kind, identity: observation.identity },
  }));
  if (args.findingIdentity !== expectedFindingIdentity) {
    invalid('buildFindingOccurrenceEventV1.findingIdentity', 'must equal the recomputed trusted finding identity');
  }
  const occurrence = {
    version: 1,
    basisIdentity,
    attemptIdentity: args.attemptIdentity,
    attemptApproachBasisIdentity: args.attemptApproachBasisIdentity,
    reviewEnvelopeIdentity: args.reviewEnvelopeIdentity,
    findingIdentity: args.findingIdentity,
    observation: { kind: observation.kind, identity: observation.identity },
    chronology: { attemptOrdinal: args.attemptOrdinal, reviewOrdinal: args.reviewOrdinal },
  };
  const eventWithoutHash = {
    type: 'finding-occurrence',
    version: 1,
    occurrenceIdentity: sha256(canonicalJson(occurrence)),
    target,
    basis: args.basis,
    occurrence,
    sourceCaptureIdentity: args.sourceCaptureIdentity,
  };
  const event = finalizeV2Event(eventWithoutHash, 'FindingOccurrenceEventV1');
  validateFindingOccurrenceEventV1(event);
  return event;
}

/** @param {unknown} value @param {string} [label] */
export function validateFindingOccurrenceEventV1(value, label = 'FindingOccurrenceEventV1') {
  const event = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'occurrenceIdentity', 'target', 'basis', 'occurrence', 'sourceCaptureIdentity'],
    [],
    label,
  );
  if (event.type !== 'finding-occurrence') invalid(`${label}.type`, 'must be finding-occurrence');
  if (event.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(event.eventHash, `${label}.eventHash`);
  assertHash(event.occurrenceIdentity, `${label}.occurrenceIdentity`);
  const target = validateAffectedTargetV2(event.target, `${label}.target`);
  validateFindingBasisV1(event.basis, `${label}.basis`);
  if (canonicalJson(/** @type {Record<string, unknown>} */ (event.basis).target) !== canonicalJson(target)) {
    invalid(`${label}.basis.target`, 'must match the event target');
  }
  const occurrence = assertExactRecord(
    event.occurrence,
    ['version', 'basisIdentity', 'attemptIdentity', 'attemptApproachBasisIdentity', 'reviewEnvelopeIdentity', 'findingIdentity', 'observation', 'chronology'],
    [],
    `${label}.occurrence`,
  );
  if (occurrence.version !== 1) invalid(`${label}.occurrence.version`, 'must be the literal safe integer 1');
  for (const field of ['basisIdentity', 'attemptIdentity', 'attemptApproachBasisIdentity', 'reviewEnvelopeIdentity', 'findingIdentity']) {
    assertHash(occurrence[field], `${label}.occurrence.${field}`);
  }
  if (occurrence.basisIdentity !== sha256(canonicalJson(event.basis))) {
    invalid(`${label}.occurrence.basisIdentity`, 'must equal the complete basis identity');
  }
  const observation = assertExactRecord(occurrence.observation, ['kind', 'identity'], [], `${label}.occurrence.observation`);
  assertEnum(observation.kind, ['observed-evidence', 'check-result'], `${label}.occurrence.observation.kind`);
  assertHash(observation.identity, `${label}.occurrence.observation.identity`);
  const expectedFindingIdentity = sha256(canonicalJson({
    version: 2,
    basisIdentity: occurrence.basisIdentity,
    observation,
  }));
  if (occurrence.findingIdentity !== expectedFindingIdentity) {
    invalid(`${label}.occurrence.findingIdentity`, 'must equal the recomputed trusted finding identity');
  }
  const chronology = assertExactRecord(occurrence.chronology, ['attemptOrdinal', 'reviewOrdinal'], [], `${label}.occurrence.chronology`);
  assertSafeInteger(chronology.attemptOrdinal, `${label}.occurrence.chronology.attemptOrdinal`, true);
  assertSafeInteger(chronology.reviewOrdinal, `${label}.occurrence.chronology.reviewOrdinal`, true);
  if (event.occurrenceIdentity !== sha256(canonicalJson(occurrence))) {
    invalid(`${label}.occurrenceIdentity`, 'must equal the complete occurrence identity');
  }
  assertHash(event.sourceCaptureIdentity, `${label}.sourceCaptureIdentity`);
  const { eventHash, ...withoutHash } = event;
  if (eventHash !== sha256(canonicalJson(withoutHash))) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

/** @param {unknown} input */
export function buildApproachOccurrenceEventV1(input) {
  const args = assertExactRecord(
    input,
    ['target', 'basis', 'attemptIdentity', 'authorizationEvidenceHash', 'resultIdentity', 'disposition', 'attemptOrdinal', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity'],
    [],
    'buildApproachOccurrenceEventV1',
  );
  const target = canonicalTarget(validateAffectedTargetV2(args.target, 'buildApproachOccurrenceEventV1.target'));
  validateApproachBasisV1(args.basis, 'buildApproachOccurrenceEventV1.basis');
  if (canonicalJson(/** @type {Record<string, unknown>} */ (args.basis).target) !== canonicalJson(target)) {
    invalid('buildApproachOccurrenceEventV1.basis.target', 'must match the event target');
  }
  for (const field of ['attemptIdentity', 'authorizationEvidenceHash', 'resultIdentity', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity']) {
    assertHash(args[field], `buildApproachOccurrenceEventV1.${field}`);
  }
  assertEnum(args.disposition, ['accepted', 'verification-failed', 'review-rejected', 'no-change', 'interrupted'], 'buildApproachOccurrenceEventV1.disposition');
  assertSafeInteger(args.attemptOrdinal, 'buildApproachOccurrenceEventV1.attemptOrdinal', true);
  const basisIdentity = sha256(canonicalJson(args.basis));
  const occurrence = {
    version: 1,
    basisIdentity,
    attemptIdentity: args.attemptIdentity,
    authorizationEvidenceHash: args.authorizationEvidenceHash,
    resultIdentity: args.resultIdentity,
    disposition: args.disposition,
    chronology: { attemptOrdinal: args.attemptOrdinal },
  };
  const eventWithoutHash = {
    type: 'approach-occurrence',
    version: 1,
    occurrenceIdentity: sha256(canonicalJson(occurrence)),
    target,
    basis: args.basis,
    occurrence,
    verificationEnvelopeIdentity: args.verificationEnvelopeIdentity,
    reviewEnvelopeIdentity: args.reviewEnvelopeIdentity,
  };
  const event = finalizeV2Event(eventWithoutHash, 'ApproachOccurrenceEventV1');
  validateApproachOccurrenceEventV1(event);
  return event;
}

/** @param {unknown} value @param {string} [label] */
export function validateApproachOccurrenceEventV1(value, label = 'ApproachOccurrenceEventV1') {
  const event = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'occurrenceIdentity', 'target', 'basis', 'occurrence', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity'],
    [],
    label,
  );
  if (event.type !== 'approach-occurrence') invalid(`${label}.type`, 'must be approach-occurrence');
  if (event.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(event.eventHash, `${label}.eventHash`);
  assertHash(event.occurrenceIdentity, `${label}.occurrenceIdentity`);
  const target = validateAffectedTargetV2(event.target, `${label}.target`);
  validateApproachBasisV1(event.basis, `${label}.basis`);
  if (canonicalJson(/** @type {Record<string, unknown>} */ (event.basis).target) !== canonicalJson(target)) {
    invalid(`${label}.basis.target`, 'must match the event target');
  }
  const occurrence = assertExactRecord(
    event.occurrence,
    ['version', 'basisIdentity', 'attemptIdentity', 'authorizationEvidenceHash', 'resultIdentity', 'disposition', 'chronology'],
    [],
    `${label}.occurrence`,
  );
  if (occurrence.version !== 1) invalid(`${label}.occurrence.version`, 'must be the literal safe integer 1');
  for (const field of ['basisIdentity', 'attemptIdentity', 'authorizationEvidenceHash', 'resultIdentity']) {
    assertHash(occurrence[field], `${label}.occurrence.${field}`);
  }
  if (occurrence.basisIdentity !== sha256(canonicalJson(event.basis))) {
    invalid(`${label}.occurrence.basisIdentity`, 'must equal the complete basis identity');
  }
  assertEnum(occurrence.disposition, ['accepted', 'verification-failed', 'review-rejected', 'no-change', 'interrupted'], `${label}.occurrence.disposition`);
  const chronology = assertExactRecord(occurrence.chronology, ['attemptOrdinal'], [], `${label}.occurrence.chronology`);
  assertSafeInteger(chronology.attemptOrdinal, `${label}.occurrence.chronology.attemptOrdinal`, true);
  if (event.occurrenceIdentity !== sha256(canonicalJson(occurrence))) {
    invalid(`${label}.occurrenceIdentity`, 'must equal the complete occurrence identity');
  }
  assertHash(event.verificationEnvelopeIdentity, `${label}.verificationEnvelopeIdentity`);
  assertHash(event.reviewEnvelopeIdentity, `${label}.reviewEnvelopeIdentity`);
  const { eventHash, ...withoutHash } = event;
  if (eventHash !== sha256(canonicalJson(withoutHash))) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateEventCommitmentV1(value, label = 'EventCommitmentV1') {
  const commitment = assertExactRecord(value, ['kind', 'eventHash'], [], label);
  assertEnum(
    commitment.kind,
    Object.keys(LANE_EVENT_TYPES),
    `${label}.kind`,
  );
  assertHash(commitment.eventHash, `${label}.eventHash`);
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateProjectionCommitmentV1(value, label = 'ProjectionCommitmentV1') {
  const commitment = assertExactRecord(value, ['purpose', 'batchIdentity', 'eventCommitments'], [], label);
  assertEnum(
    commitment.purpose,
    ['occurrence-retention', 'incident-evidence', 'governance-required', 'learning-result', 'governance-snapshot', 'incident-supersession'],
    `${label}.purpose`,
  );
  assertHash(commitment.batchIdentity, `${label}.batchIdentity`);
  const rows = assertDenseDataArray(commitment.eventCommitments, `${label}.eventCommitments`);
  if (rows.length < 1 || rows.length > 17) invalid(`${label}.eventCommitments`, 'must contain 1 through 17 rows');
  rows.forEach((row, index) => validateEventCommitmentV1(row, `${label}.eventCommitments[${index}]`));
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validatePendingCompletionRetentionV2(value, label = 'PendingCompletionRetentionV2') {
  const pending = assertExactRecord(
    value,
    ['version', 'target', 'attemptIdentity', 'resultIdentity', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity', 'findingIdentities', 'retention', 'capturedInspectionIdentity'],
    [],
    label,
  );
  if (pending.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  validateAffectedTargetV2(pending.target, `${label}.target`);
  for (const field of ['attemptIdentity', 'resultIdentity', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity', 'capturedInspectionIdentity']) {
    assertHash(pending[field], `${label}.${field}`);
  }
  validateV2HashSet(pending.findingIdentities, `${label}.findingIdentities`, 0, 16);
  const retention = /** @type {Record<string, unknown>} */ (
    validateProjectionCommitmentV1(pending.retention, `${label}.retention`)
  );
  if (retention.purpose !== 'occurrence-retention') {
    invalid(`${label}.retention.purpose`, 'must be occurrence-retention');
  }
  const commitments = /** @type {Record<string, unknown>[]} */ (retention.eventCommitments);
  if (commitments.length !== /** @type {unknown[]} */ (pending.findingIdentities).length + 1
    || commitments[0]?.kind !== 'approach-occurrence'
    || commitments.slice(1).some((row) => row.kind !== 'finding-occurrence')) {
    invalid(`${label}.retention.eventCommitments`, 'must contain one approach followed by the complete finding set');
  }
  if (new Set(commitments.map((row) => row.eventHash)).size !== commitments.length) {
    invalid(`${label}.retention.eventCommitments`, 'must be event-hash unique');
  }
  const expectedBatchIdentity = sha256(canonicalJson({
    version: 1,
    purpose: 'occurrence-retention',
    target: canonicalTarget(pending.target),
    eventCommitments: commitments,
  }));
  if (retention.batchIdentity !== expectedBatchIdentity) {
    invalid(`${label}.retention.batchIdentity`, 'must bind the exact target and ordered event commitments');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateRepeatRelationshipV1(value, label = 'RepeatRelationshipV1') {
  const repeat = assertExactRecord(value, ['version', 'channel', 'basisIdentity', 'occurrenceIdentities'], [], label);
  if (repeat.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertEnum(repeat.channel, ['finding', 'approach'], `${label}.channel`);
  assertHash(repeat.basisIdentity, `${label}.basisIdentity`);
  const occurrences = assertDenseDataArray(repeat.occurrenceIdentities, `${label}.occurrenceIdentities`);
  if (occurrences.length !== 2) invalid(`${label}.occurrenceIdentities`, 'must contain exactly two rows');
  occurrences.forEach((identity, index) => assertHash(identity, `${label}.occurrenceIdentities[${index}]`));
  if (occurrences[0] === occurrences[1]) invalid(`${label}.occurrenceIdentities`, 'must identify two distinct occurrences');
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateFailedApproachSetV1(value, label = 'FailedApproachSetV1') {
  const set = assertExactRecord(
    value,
    ['version', 'target', 'chronologyCutoff', 'approachBasisIdentities', 'evidenceEventHashes', 'setIdentity'],
    [],
    label,
  );
  if (set.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateAffectedTargetV2(set.target, `${label}.target`);
  assertSafeInteger(set.chronologyCutoff, `${label}.chronologyCutoff`, true);
  validateV2HashSet(set.approachBasisIdentities, `${label}.approachBasisIdentities`, 1, 16);
  validateV2HashSet(set.evidenceEventHashes, `${label}.evidenceEventHashes`, 1, 16);
  assertHash(set.setIdentity, `${label}.setIdentity`);
  const { setIdentity, ...withoutIdentity } = set;
  if (sha256(canonicalJson(withoutIdentity)) !== setIdentity) {
    invalid(`${label}.setIdentity`, 'must equal the recomputed complete set identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateLearningGovernanceV1(value, label = 'LearningGovernanceV1') {
  const governance = assertExactRecord(
    value,
    ['version', 'governanceIdentity', 'target', 'trigger', 'failedApproachSet', 'phase', 'revision', 'triggerEvidenceHash'],
    ['projectionCommitment', 'reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity', 'issuedAttemptPermitHash', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity', 'laneClaimReceiptIdentity', 'terminalEvidenceIdentity', 'suspension', 'halt', 'controlledEnd'],
    label,
  );
  if (governance.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(governance.governanceIdentity, `${label}.governanceIdentity`);
  const target = validateAffectedTargetV2(governance.target, `${label}.target`);
  validateRepeatRelationshipV1(governance.trigger, `${label}.trigger`);
  const failedSet = /** @type {Record<string, unknown>} */ (
    validateFailedApproachSetV1(governance.failedApproachSet, `${label}.failedApproachSet`)
  );
  if (canonicalJson(failedSet.target) !== canonicalJson(target)) {
    invalid(`${label}.failedApproachSet.target`, 'must match the governed target');
  }
  assertEnum(governance.phase, V2_GOVERNANCE_PHASES, `${label}.phase`);
  const phaseRule = v2GovernancePhaseRule(governance.phase, `${label}.phase`);
  assertSafeInteger(governance.revision, `${label}.revision`, true);
  assertHash(governance.triggerEvidenceHash, `${label}.triggerEvidenceHash`);
  const repeatIdentity = sha256(canonicalJson(governance.trigger));
  const expectedIdentity = sha256(canonicalJson({ version: 1, target, repeatIdentity }));
  if (governance.governanceIdentity !== expectedIdentity) {
    invalid(`${label}.governanceIdentity`, 'must bind the exact target and Repeat Relationship');
  }
  const expectedTriggerEvidenceHash = sha256(canonicalJson({
    trigger: governance.trigger,
    failedApproachSetIdentity: failedSet.setIdentity,
  }));
  if (governance.triggerEvidenceHash !== expectedTriggerEvidenceHash) {
    invalid(`${label}.triggerEvidenceHash`, 'must bind the exact trigger and failed-approach set');
  }
  if (Object.hasOwn(governance, 'projectionCommitment')) {
    const commitment = /** @type {Record<string, unknown>} */ (
      validateProjectionCommitmentV1(governance.projectionCommitment, `${label}.projectionCommitment`)
    );
    const expectedBatchIdentity = sha256(canonicalJson({
      version: 1,
      purpose: commitment.purpose,
      target,
      eventCommitments: commitment.eventCommitments,
    }));
    if (commitment.batchIdentity !== expectedBatchIdentity) {
      invalid(`${label}.projectionCommitment.batchIdentity`, 'must bind the governed target and ordered event commitments');
    }
  }
  for (const field of ['reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity', 'issuedAttemptPermitHash', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity', 'laneClaimReceiptIdentity', 'terminalEvidenceIdentity']) {
    if (Object.hasOwn(governance, field)) assertHash(governance[field], `${label}.${field}`);
  }
  for (const field of phaseRule.required) {
    if (!Object.hasOwn(governance, field)) {
      invalid(`${label}.phase`, `${governance.phase} is unavailable without its exact ${field}`);
    }
  }
  validateV2GovernanceBranchFields(governance, phaseRule, target, label);
  if (Object.hasOwn(governance, 'projectionCommitment')) {
    const commitment = /** @type {Record<string, unknown>} */ (governance.projectionCommitment);
    if (phaseRule.commitment === null) {
      invalid(`${label}.projectionCommitment`, `is forbidden in ${governance.phase} phase`);
    }
    if (commitment.purpose !== phaseRule.commitment) {
      invalid(`${label}.projectionCommitment.purpose`, `must be ${phaseRule.commitment} in ${governance.phase} phase`);
    }
    const commitments = /** @type {Record<string, unknown>[]} */ (commitment.eventCommitments);
    if (canonicalJson(commitments.map((row) => row.kind)) !== canonicalJson(phaseRule.commitmentKinds)) {
      invalid(`${label}.projectionCommitment.eventCommitments`, `must contain exactly ${canonicalJson(phaseRule.commitmentKinds)}`);
    }
  }
  if (Buffer.byteLength(canonicalJson(governance)) > MAX_LEARNING_GOVERNANCE_BYTES) {
    invalid(label, `exceeds ${MAX_LEARNING_GOVERNANCE_BYTES} canonical UTF-8 bytes`);
  }
  return value;
}

/** @param {unknown} input */
export function buildGovernanceEventV1(input) {
  const governance = /** @type {Record<string, unknown>} */ (validateLearningGovernanceV1(input));
  const eventWithoutHash = {
    type: 'learning-governance',
    version: 1,
    governanceIdentity: governance.governanceIdentity,
    revision: governance.revision,
    target: governance.target,
    trigger: governance.trigger,
    failedApproachSetIdentity: /** @type {Record<string, unknown>} */ (governance.failedApproachSet).setIdentity,
    phase: governance.phase,
    ...Object.fromEntries([
      'reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity',
      'postLearningInspectionIdentity', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity',
      'laneClaimReceiptIdentity', 'terminalEvidenceIdentity', 'suspension', 'halt', 'controlledEnd',
    ].filter((field) => Object.hasOwn(governance, field)).map((field) => [field, governance[field]])),
  };
  const event = finalizeV2Event(eventWithoutHash, 'GovernanceEventV1');
  validateGovernanceEventV1(event);
  return event;
}

/** @param {unknown} value @param {string} [label] */
export function validateGovernanceEventV1(value, label = 'GovernanceEventV1') {
  const event = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'governanceIdentity', 'revision', 'target', 'trigger', 'failedApproachSetIdentity', 'phase'],
    ['reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity', 'laneClaimReceiptIdentity', 'terminalEvidenceIdentity', 'suspension', 'halt', 'controlledEnd'],
    label,
  );
  if (event.type !== 'learning-governance') invalid(`${label}.type`, 'must be learning-governance');
  if (event.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(event.eventHash, `${label}.eventHash`);
  assertHash(event.governanceIdentity, `${label}.governanceIdentity`);
  const target = validateAffectedTargetV2(event.target, `${label}.target`);
  validateRepeatRelationshipV1(event.trigger, `${label}.trigger`);
  const expectedIdentity = sha256(canonicalJson({
    version: 1,
    target,
    repeatIdentity: sha256(canonicalJson(event.trigger)),
  }));
  if (event.governanceIdentity !== expectedIdentity) {
    invalid(`${label}.governanceIdentity`, 'must bind the exact target and Repeat Relationship');
  }
  assertSafeInteger(event.revision, `${label}.revision`, true);
  assertHash(event.failedApproachSetIdentity, `${label}.failedApproachSetIdentity`);
  assertEnum(event.phase, V2_GOVERNANCE_PHASES, `${label}.phase`);
  const phaseRule = v2GovernancePhaseRule(event.phase, `${label}.phase`);
  for (const field of ['reviewIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity', 'consumedAttemptPermitHash', 'authorizedAttemptIdentity', 'laneClaimReceiptIdentity', 'terminalEvidenceIdentity']) {
    if (Object.hasOwn(event, field)) assertHash(event[field], `${label}.${field}`);
  }
  for (const field of phaseRule.required) {
    if (!Object.hasOwn(event, field)) {
      invalid(`${label}.phase`, `${event.phase} is unavailable without its exact ${field}`);
    }
  }
  validateV2GovernanceBranchFields(event, phaseRule, target, label);
  const { eventHash, ...withoutHash } = event;
  if (eventHash !== sha256(canonicalJson(withoutHash))) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

/** @param {unknown} captureValue @param {string} expectedKind @param {string} label */
function trustedEnvelopeBodyV2(captureValue, expectedKind, label) {
  const capture = /** @type {Record<string, unknown>} */ (
    validateTrustedSourceCaptureV2(captureValue, label)
  );
  const authority = /** @type {Record<string, unknown>} */ (capture.authority);
  if (authority.kind !== expectedKind) invalid(`${label}.authority.kind`, `must be ${expectedKind}`);
  const bytes = validateCapturedBytesV1(capture.bytes, `${label}.bytes`).decoded;
  const envelope = /** @type {Record<string, unknown>} */ (parseCanonicalJsonBytes(bytes, `${label}.bytes`));
  return { capture, authority, envelope };
}

/** Normalize a verification envelope only from one trusted authoritative capture. @param {unknown} captureValue */
export function normalizeVerificationEnvelopeV2(captureValue) {
  const normalized = trustedEnvelopeBodyV2(captureValue, 'verification', 'verification trusted capture');
  validateVerificationEnvelopeV2(normalized.envelope);
  if (canonicalJson(normalized.capture.target) !== canonicalJson(normalized.envelope.target)) {
    invalid('verification trusted capture.target', 'must match the normalized envelope target');
  }
  return JSON.parse(canonicalJson(normalized.envelope));
}

/** Normalize an independent-review envelope only from one trusted authoritative capture. @param {unknown} captureValue @param {unknown} verificationValue */
export function normalizeIndependentReviewEnvelopeV2(captureValue, verificationValue) {
  const verification = /** @type {Record<string, unknown>} */ (
    validateVerificationEnvelopeV2(verificationValue)
  );
  const normalized = trustedEnvelopeBodyV2(captureValue, 'independent-review', 'independent-review trusted capture');
  validateIndependentReviewEnvelopeV2(normalized.envelope, verification);
  if (canonicalJson(normalized.capture.target) !== canonicalJson(normalized.envelope.target)) {
    invalid('independent-review trusted capture.target', 'must match the normalized envelope target');
  }
  if (normalized.envelope.reviewerAuthorityIdentity !== normalized.authority.authorityIdentity
    || normalized.envelope.reviewInvocationIdentity !== normalized.authority.invocationIdentity) {
    invalid('independent-review trusted capture.authority', 'must bind the reviewer authority and invocation');
  }
  return JSON.parse(canonicalJson(normalized.envelope));
}

/** @param {Record<string, unknown>} inspection */
function trustedCaptureRowsFromInspectionV2(inspection) {
  /** @type {{capture:Record<string, unknown>,captureIdentity:string,kind:string,sourceState:string}[]} */
  const rows = [];
  const items = /** @type {Record<string, unknown>[]} */ (inspection.items);
  for (const item of items) {
    if (!['verification', 'review'].includes(/** @type {string} */ (item.source))
      || item.status !== 'present' || typeof item.text !== 'string') continue;
    const sourceBody = assertExactRecord(
      JSON.parse(item.text),
      ['target', 'state', 'records'],
      [],
      `${item.source} Inspection source body`,
    );
    const records = assertDenseDataArray(sourceBody.records, `${item.source} Inspection source body.records`);
    for (let index = 0; index < records.length; index += 1) {
      const candidate = records[index];
      const record = assertRecord(candidate, `${item.source} Inspection source body.records[${index}]`);
      const resemblesTrustedCapture = Object.hasOwn(record, 'authority') || Object.hasOwn(record, 'bytes');
      if (!resemblesTrustedCapture) continue;
      validateTrustedSourceCaptureV2(record, `${item.source} trusted source capture[${index}]`);
      const authority = /** @type {Record<string, unknown>} */ (record.authority);
      const expectedKind = item.source === 'verification' ? 'verification' : 'independent-review';
      if (authority.kind !== expectedKind) {
        invalid(`${item.source} trusted source capture[${index}].authority.kind`, `must be ${expectedKind}`);
      }
      if (targetKey(record.target) !== targetKey(inspection.target)) {
        invalid(`${item.source} trusted source capture[${index}].target`, 'must match the fresh Inspection target');
      }
      rows.push({
        capture: record,
        captureIdentity: trustedSourceCaptureIdentityV2(record),
        kind: /** @type {string} */ (authority.kind),
        sourceState: /** @type {string} */ (sourceBody.state),
      });
    }
  }
  const captureIdentities = rows.map((row) => row.captureIdentity);
  if (new Set(captureIdentities).size !== captureIdentities.length) {
    invalid('trusted Inspection captures', 'must be duplicate-free');
  }
  return rows;
}

/** @param {Record<string, unknown>} inspection */
function trustedEnvelopeIndexFromInspectionV2(inspection) {
  const captures = trustedCaptureRowsFromInspectionV2(inspection);
  const verificationRows = captures
    .filter((row) => row.kind === 'verification')
    .map((row) => ({ ...row, envelope: /** @type {Record<string, unknown>} */ (normalizeVerificationEnvelopeV2(row.capture)) }));
  /** @type {Map<string, typeof verificationRows[number]>} */
  const verifications = new Map();
  for (const row of verificationRows) {
    const identity = /** @type {string} */ (row.envelope.envelopeIdentity);
    if (verifications.has(identity)) invalid('trusted Inspection verification captures', 'contain a duplicate envelope identity');
    const expectedState = /** @type {Record<string, unknown>[]} */ (row.envelope.checks)
      .some((check) => check.outcome === 'failed') ? 'failed' : 'passed';
    if (row.sourceState !== expectedState) {
      invalid('trusted Inspection verification capture', 'must match its authoritative source outcome');
    }
    verifications.set(identity, row);
  }
  const reviewCaptures = captures.filter((row) => row.kind === 'independent-review');
  /** @type {Map<string, Record<string, unknown>>} */
  const reviews = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const definitionReviews = new Map();
  for (const row of reviewCaptures) {
    const body = trustedEnvelopeBodyV2(row.capture, 'independent-review', 'independent-review trusted capture').envelope;
    // Definition-revision semantic reviews travel the same trusted review
    // stream. They are segregated by decoded type so V2 review resolution and
    // every verdict built on it stay byte-identical.
    if (body.type === DEFINITION_REVISION_REVIEW_ENVELOPE_TYPE) {
      definitionReviews.set(row.captureIdentity, { ...row, envelope: body });
      continue;
    }
    if (body.type !== 'independent-review-envelope') {
      invalid('independent-review envelope.type', 'must be a known trusted review envelope type');
    }
    const verificationIdentity = body.verificationEnvelopeIdentity;
    assertHash(verificationIdentity, 'independent-review envelope.verificationEnvelopeIdentity');
    const verificationRow = verifications.get(/** @type {string} */ (verificationIdentity));
    if (!verificationRow) {
      invalid('independent-review envelope.verificationEnvelopeIdentity', 'must resolve to one trusted verification capture');
    }
    const envelope = /** @type {Record<string, unknown>} */ (
      normalizeIndependentReviewEnvelopeV2(row.capture, verificationRow.envelope)
    );
    if (row.sourceState !== envelope.verdict) {
      invalid('trusted Inspection review capture', 'must match its authoritative source verdict');
    }
    const identity = /** @type {string} */ (envelope.envelopeIdentity);
    if (reviews.has(identity)) invalid('trusted Inspection review captures', 'contain a duplicate envelope identity');
    reviews.set(identity, { ...row, envelope, verification: verificationRow.envelope });
  }
  return { captures, verifications, reviews, definitionReviews };
}

/** @param {unknown} value @param {string} label */
function validateT002AuthoritativeEvent(value, label) {
  const record = assertRecord(value, label);
  const declared = isV2AuthoritativeEventRecord(record) ? laneEventDeclaration(record.type) : null;
  if (!declared) return invalid(`${label}.type`, 'is not an authoritative autonomous v2 event');
  return declared.validate(value, label);
}

/** @param {string} purpose @param {Record<string, unknown>} target @param {Record<string, unknown>[]} events @param {string} label */
function projectionCommitmentForEventsV1(purpose, target, events, label) {
  assertEnum(
    purpose,
    ['occurrence-retention', 'governance-required', 'learning-result', 'incident-evidence', 'incident-supersession'],
    `${label}.purpose`,
  );
  const canonical = canonicalTarget(validateAffectedTargetV2(target, `${label}.target`));
  if (events.length < 1 || events.length > 17) invalid(`${label}.events`, 'must contain 1 through 17 exact event bodies');
  const eventCommitments = events.map((event, index) => {
    validateV2ProjectableEvent(event, `${label}.events[${index}]`);
    if (targetKey(event.target) !== targetKey(canonical)) invalid(`${label}.events[${index}].target`, 'must match the commitment target');
    return { kind: event.type, eventHash: event.eventHash };
  });
  if (purpose === 'incident-evidence') {
    // The dedicated incident-evidence batch is finding-only, exactly two rows,
    // and stays in strict chronology order. Normal completion retention still
    // requires its approach event first.
    if (events.length !== 2 || events.some((event) => event.type !== 'finding-occurrence')) {
      invalid(`${label}.events`, 'must contain exactly two finding occurrence events');
    }
    if (compareOccurrenceChronologyV2(events[0], events[1]) >= 0) {
      invalid(`${label}.events`, 'must be in strict chronology order');
    }
  } else if (purpose === 'incident-supersession') {
    if (events.length !== 1 || events[0].type !== 'incident-supersession') {
      invalid(`${label}.events`, 'must contain exactly one IncidentSupersessionEventV1');
    }
  } else if (purpose === 'occurrence-retention') {
    if (events[0]?.type !== 'approach-occurrence'
      || events.slice(1).some((event) => event.type !== 'finding-occurrence')) {
      invalid(`${label}.events`, 'must contain one approach followed only by findings');
    }
    for (let index = 2; index < events.length; index += 1) {
      if (compareUtf8(
        /** @type {string} */ (events[index - 1].occurrenceIdentity),
        /** @type {string} */ (events[index].occurrenceIdentity),
      ) >= 0) invalid(`${label}.events`, 'finding occurrences must be sorted and duplicate-free');
    }
  } else if (purpose === 'learning-result') {
    if (events.length !== 2
      || events[0].type !== 'learning-review'
      || events[1].type !== 'learning-governance') {
      invalid(`${label}.events`, 'must contain one LearningReviewEventV2 followed by one GovernanceEventV1');
    }
  } else if (events.length !== 1 || events[0].type !== 'learning-governance') {
    invalid(`${label}.events`, 'must contain exactly one GovernanceEventV1');
  }
  const commitment = {
    purpose,
    batchIdentity: sha256(canonicalJson({ version: 1, purpose, target: canonical, eventCommitments })),
    eventCommitments,
  };
  validateProjectionCommitmentV1(commitment, `${label}.commitment`);
  return commitment;
}

/** @param {Record<string, unknown>[]} events @param {Record<string, unknown>} target @param {Record<string, unknown>} commitment @param {string} label */
function validateCommittedEventBodiesV1(events, target, commitment, label) {
  const recomputed = projectionCommitmentForEventsV1(
    /** @type {string} */ (commitment.purpose),
    target,
    events,
    label,
  );
  if (canonicalJson(recomputed) !== canonicalJson(commitment)) {
    invalid(label, 'must exactly match the stored ordered event commitment');
  }
  return events;
}

/** @param {Record<string, unknown>} pending @param {Record<string, unknown>} completion @param {string} label */
function validateCompletionV2Binding(pending, completion, label) {
  const target = canonicalTarget(validateAffectedTargetV2(completion.target, `${label}.target`));
  if (targetKey(target) !== targetKey(pending.target)) invalid(`${label}.target`, 'must match the pending attempt target');
  if (completion.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  for (const field of ['attemptIdentity', 'resultIdentity', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity']) {
    assertHash(completion[field], `${label}.${field}`);
  }
  assertUnicodeScalarString(completion.route, `${label}.route`);
  assertEnum(completion.outcome, OUTCOMES, `${label}.outcome`);
  const operations = validateV2SortedSet(completion.operations, assertV2Identifier, 1, 16, `${label}.operations`);
  const changedTargets = validateV2SortedSet(completion.changedTargets, assertV2SubjectIdentity, 0, 16, `${label}.changedTargets`);
  const findingIdentities = validateV2HashSet(completion.findingIdentities, `${label}.findingIdentities`, 0, 16);
  const materialInputs = /** @type {Record<string, unknown>} */ (pending.materialInputs);
  if (completion.route !== expectedResultRoute(/** @type {string} */ (pending.action), /** @type {Record<string, unknown>} */ (pending.target))
    || canonicalJson(operations) !== canonicalJson(materialInputs.operations)
    || changedTargets.some((changedTarget) => !/** @type {string[]} */ (materialInputs.targets).includes(changedTarget))
    || (completion.outcome === 'interrupted' && changedTargets.length > 0)
    || (completion.outcome === 'no-change' && changedTargets.length > 0)) {
    invalid(label, 'does not match the exact pending action and result route');
  }
  return { target, operations, changedTargets, findingIdentities };
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} pending */
function completionApproachContextV2(state, pending) {
  const target = /** @type {Record<string, unknown>} */ (pending.target);
  const materialInputs = /** @type {Record<string, unknown>} */ (pending.materialInputs);
  const basis = pending.action === 'reconcile-derived-definition'
    ? definitionReconciliationApproachBasisFromProposalIdentityV1(
      target,
      materialInputs,
      /** @type {string} */ (pending.approachHash),
    )
    : autonomousApproachBasis(target, /** @type {string} */ (pending.action), materialInputs);
  validateApproachBasisV1(basis);
  const approachBasisIdentity = sha256(canonicalJson(basis));
  const attemptOrdinal = /** @type {number} */ (state.overallUsed);
  assertSafeInteger(attemptOrdinal, 'autonomous attempt ordinal', true);
  return {
    basis,
    approachBasisIdentity,
    attemptOrdinal,
    attemptIdentity: autonomousAttemptIdentity(
      target,
      attemptOrdinal,
      /** @type {string} */ (pending.evidenceHash),
      approachBasisIdentity,
    ),
  };
}

/** @param {Record<string, unknown>} verification @param {Record<string, unknown>} review */
function trustedCompletionDispositionV2(verification, review) {
  const checks = /** @type {Record<string, unknown>[]} */ (verification.checks);
  const verificationFailed = checks.some((check) => check.outcome === 'failed');
  const reviewRejected = review.verdict === 'rejected';
  if (verificationFailed) return 'verification-failed';
  if (reviewRejected) return 'review-rejected';
  return 'accepted';
}

/** @param {Record<string, unknown>} completion @param {Record<string, unknown>} verification @param {Record<string, unknown>} review */
function completionDispositionV2(completion, verification, review) {
  const trustedDisposition = trustedCompletionDispositionV2(verification, review);
  if (trustedDisposition === 'verification-failed') {
    if (completion.outcome !== 'failed') invalid('completion v2 outcome', 'must be failed for failed verification');
    return 'verification-failed';
  }
  if (trustedDisposition === 'review-rejected') {
    if (completion.outcome !== 'blocked') invalid('completion v2 outcome', 'must be blocked for rejected review');
    return 'review-rejected';
  }
  if (completion.outcome !== 'succeeded') {
    invalid('completion v2 outcome', 'must be succeeded for accepted trusted evidence');
  }
  return 'accepted';
}

/**
 * Capture one autonomous completion from trusted rows inside a fresh Inspection.
 * The semantic completion value contains identities only.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} completionValue
 * @param {unknown} [dependencies] @param {boolean} [publicRoute] Transport-decoded `complete.capture` route.
 */
export function captureCompletionV2(stateValue, inputValue, completionValue, dependencies, publicRoute = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('captureCompletionV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, publicRoute, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} completionResult */
  const respond = (completionResult) => (publicRoute
    ? { inspection, completion: completionResult }
    : completionResult);
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    invalid('captureCompletionV2 inspection', 'must be complete and unblocked');
  }
  const completion = assertExactRecord(
    completionValue,
    ['version', 'target', 'attemptIdentity', 'route', 'outcome', 'operations', 'changedTargets', 'resultIdentity', 'verificationEnvelopeIdentity', 'reviewEnvelopeIdentity', 'findingIdentities'],
    [],
    'completion v2',
  );
  const completionTarget = canonicalTarget(validateAffectedTargetV2(completion.target, 'completion v2.target'));
  const pendingRows = /** @type {Record<string, unknown>[]} */ (state.pending);
  if (pendingRows.length !== 1) invalid('captureCompletionV2', 'requires exactly one pending attempt');
  const pending = pendingRows[0];
  if (targetKey(completionTarget) !== targetKey(pending.target)) {
    invalid('completion v2.target', 'must match the pending attempt target');
  }
  if (targetKey(inspection.target) !== targetKey(completionTarget)) {
    invalid('captureCompletionV2 inspection.target', 'must match the completion target');
  }
  const definitionReconciliationCandidate = pending.action === 'reconcile-derived-definition';
  const definitionReconciliation = definitionReconciliationCandidate
    ? currentDefinitionReconciliationBindingV1(
      state,
      pending,
      inspection,
      completion.attemptIdentity,
    )
    : null;
  if (definitionReconciliationCandidate && !definitionReconciliation) {
    return respond({ captured: false, finalized: false, reason: 'learning-governance-conflict', state });
  }
  if (Object.hasOwn(state, 'learningGovernance')) {
    const governance = activeGovernanceCaseV2(state);
    const permittedAlternative = governance
      && V2_AUTHORIZED_PHASES.includes(/** @type {string} */ (governance.phase))
      && targetKey(governance.target) === targetKey(completionTarget)
      && governance.authorizedAttemptIdentity === completion.attemptIdentity;
    const permittedLearningReconciliation = definitionReconciliation?.variant
      === 'learning-no-alternative';
    if (!permittedAlternative && !permittedLearningReconciliation) {
      return respond({ captured: false, finalized: false, reason: 'learning-governance-conflict', state });
    }
  }
  let existingPendingCompletion = null;
  if (Object.hasOwn(state, 'pendingCompletion')) {
    existingPendingCompletion = /** @type {Record<string, unknown>} */ (state.pendingCompletion);
    if (targetKey(/** @type {Record<string, unknown>} */ (existingPendingCompletion.target)) !== targetKey(completionTarget)) {
      return respond({ captured: false, finalized: false, reason: 'occurrence-retention-conflict', state });
    }
  }
  let binding;
  try {
    binding = validateCompletionV2Binding(pending, completion, 'completion v2');
  } catch (error) {
    if (existingPendingCompletion) {
      return respond({ captured: false, finalized: false, reason: 'occurrence-retention-conflict', state });
    }
    throw error;
  }
  if (existingPendingCompletion) {
    const potentiallyIdempotent = existingPendingCompletion.version === 2
      && existingPendingCompletion.attemptIdentity === completion.attemptIdentity
      && existingPendingCompletion.resultIdentity === completion.resultIdentity
      && existingPendingCompletion.verificationEnvelopeIdentity === completion.verificationEnvelopeIdentity
      && existingPendingCompletion.reviewEnvelopeIdentity === completion.reviewEnvelopeIdentity
      && canonicalJson(existingPendingCompletion.findingIdentities) === canonicalJson(binding.findingIdentities);
    if (!potentiallyIdempotent) {
      return respond({ captured: false, finalized: false, reason: 'occurrence-retention-conflict', state });
    }
  }
  const context = completionApproachContextV2(state, pending);
  if (completion.attemptIdentity !== context.attemptIdentity) {
    invalid('completion v2.attemptIdentity', 'must reference the derived pending attempt identity');
  }
  const trusted = trustedEnvelopeIndexFromInspectionV2(inspection);
  const verificationRow = trusted.verifications.get(/** @type {string} */ (completion.verificationEnvelopeIdentity));
  if (!verificationRow) invalid('completion v2.verificationEnvelopeIdentity', 'must select exactly one trusted verification capture');
  const verification = verificationRow.envelope;
  const reviewRow = trusted.reviews.get(/** @type {string} */ (completion.reviewEnvelopeIdentity));
  if (!reviewRow) invalid('completion v2.reviewEnvelopeIdentity', 'must select exactly one trusted independent-review capture');
  const review = /** @type {Record<string, unknown>} */ (reviewRow.envelope);
  validateIndependentReviewEnvelopeV2(review, verification);
  if (review.attemptOrdinal !== context.attemptOrdinal) {
    invalid('completion v2 attempt chronology', 'must match the authorized attempt ordinal');
  }
  for (const envelope of [verification, review]) {
    if (envelope.attemptIdentity !== completion.attemptIdentity
      || envelope.resultIdentity !== completion.resultIdentity
      || envelope.inspectedEvidenceHash !== pending.evidenceHash
      || canonicalJson(envelope.target) !== canonicalJson(binding.target)) {
      invalid('completion v2', 'must match trusted target, attempt, result, and pending authorization Inspection evidence');
    }
  }
  const reviewFindings = /** @type {Record<string, unknown>[]} */ (review.findings);
  const normalizedFindingIdentities = reviewFindings.map((finding) => finding.findingIdentity);
  if (canonicalJson(binding.findingIdentities) !== canonicalJson(normalizedFindingIdentities)) {
    invalid('completion v2.findingIdentities', 'must equal the complete trusted review finding set');
  }
  const disposition = completionDispositionV2(completion, verification, review);
  const approachEvent = buildApproachOccurrenceEventV1({
    target: binding.target,
    basis: context.basis,
    attemptIdentity: completion.attemptIdentity,
    authorizationEvidenceHash: pending.evidenceHash,
    resultIdentity: completion.resultIdentity,
    disposition,
    attemptOrdinal: context.attemptOrdinal,
    verificationEnvelopeIdentity: verification.envelopeIdentity,
    reviewEnvelopeIdentity: review.envelopeIdentity,
  });
  const findingEvents = reviewFindings.map((finding) => buildFindingOccurrenceEventV1({
    target: binding.target,
    basis: finding.basis,
    attemptIdentity: completion.attemptIdentity,
    attemptApproachBasisIdentity: context.approachBasisIdentity,
    reviewEnvelopeIdentity: review.envelopeIdentity,
    findingIdentity: finding.findingIdentity,
    observation: finding.observation,
    attemptOrdinal: review.attemptOrdinal,
    reviewOrdinal: review.reviewOrdinal,
    sourceCaptureIdentity: reviewRow.captureIdentity,
  })).sort((left, right) => compareUtf8(left.occurrenceIdentity, right.occurrenceIdentity));
  const occurrenceEvents = [approachEvent, ...findingEvents];
  const projectionBatch = buildProjectionBatchV1(
    'occurrence-retention',
    binding.target,
    occurrenceEvents,
    'captureCompletionV2 occurrence retention',
  );
  const retention = projectionCommitmentOfBatchV1(projectionBatch);
  // The declared public Success shape carries the exact batch alone; bare bodies stay in process.
  const retentionCarrier = publicRoute ? { projectionBatch } : { occurrenceEvents, projectionBatch };
  const pendingCompletion = {
    version: 2,
    target: binding.target,
    attemptIdentity: completion.attemptIdentity,
    resultIdentity: completion.resultIdentity,
    verificationEnvelopeIdentity: verification.envelopeIdentity,
    reviewEnvelopeIdentity: review.envelopeIdentity,
    findingIdentities: [...binding.findingIdentities],
    retention,
    capturedInspectionIdentity: sha256(canonicalJson(inspection)),
  };
  validatePendingCompletionRetentionV2(pendingCompletion);
  if (Object.hasOwn(state, 'pendingCompletion')) {
    const existing = /** @type {Record<string, unknown>} */ (state.pendingCompletion);
    if (existing.version !== 2
      || canonicalJson(existing) !== canonicalJson(pendingCompletion)) {
      return respond({ captured: false, finalized: false, reason: 'occurrence-retention-conflict', state });
    }
    return respond({ captured: true, finalized: false, reason: 'occurrence-retention-required', state, ...retentionCarrier });
  }
  const nextState = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: pendingRows.map(copyPendingEntry),
    completed: /** @type {Record<string, unknown>[]} */ (state.completed).map((entry) => ({ ...entry })),
  });
  nextState.pendingCompletion = pendingCompletion;
  validateRunState(nextState);
  return respond({ captured: true, finalized: false, reason: 'occurrence-retention-required', state: nextState, ...retentionCarrier });
}

/** @param {Record<string, unknown>} inspection @param {string} source */
function inspectionSourceBodyV2(inspection, source) {
  const matches = /** @type {Record<string, unknown>[]} */ (inspection.items)
    .filter((item) => item.source === source && item.status === 'present' && typeof item.text === 'string');
  if (matches.length !== 1) invalid(`T002 ${source}`, 'must have exactly one complete fresh Inspection source');
  return JSON.parse(/** @type {string} */ (matches[0].text));
}

/**
 * Existing Feature 005 v1 `learning-review` history shares the type token but
 * remains legacy-audit-only, so v2 candidacy also requires the v2 version.
 * @param {unknown} value
 */
function isV2AuthoritativeEventRecord(value) {
  if (!isPlainRecord(value)) return false;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (!laneEventDeclaration(record.type)) return false;
  return record.type !== 'learning-review' || record.version === 2;
}

/** @param {unknown} value */
function t002EventCandidate(value) {
  if (!isPlainRecord(value)) return null;
  const envelope = /** @type {Record<string, unknown>} */ (value);
  if (Object.hasOwn(envelope, 'event')) {
    return isV2AuthoritativeEventRecord(envelope.event)
      ? /** @type {Record<string, unknown>} */ (envelope.event)
      : null;
  }
  return isV2AuthoritativeEventRecord(envelope) ? envelope : null;
}

/** @param {string} text @param {string} label */
function parseV2EventLines(text, label) {
  assertUnicodeScalarString(text, label);
  /** @type {Record<string, unknown>[]} */
  const events = [];
  for (const line of logicalLines(text)) {
    if (!line.text.startsWith(LANE_EVENT_PREFIX)) continue;
    const suffix = line.text.slice(LANE_EVENT_PREFIX.length);
    let parsed;
    try {
      parsed = JSON.parse(suffix);
    } catch {
      invalid(label, 'contains a malformed v2 event line');
    }
    if (canonicalJson(parsed) !== suffix) invalid(label, 'contains a noncanonical v2 event line');
    if (isPlainRecord(parsed)
      && Object.hasOwn(/** @type {Record<string, unknown>} */ (parsed), 'event')) {
      // Existing wrapped v1 `CJ({event})` lines remain audit-only.
      continue;
    }
    const candidate = t002EventCandidate(parsed);
    if (!candidate) invalid(label, 'contains an unknown prefixed event record');
    const terminator = text.slice(line.start + line.text.length, line.end);
    if (terminator !== '\n') {
      invalid(label, 'contains a v2 event record not terminated by exactly one LF');
    }
    validateT002AuthoritativeEvent(candidate, `${label} event`);
    events.push(/** @type {Record<string, unknown>} */ (candidate));
  }
  return events;
}

/** @param {unknown} value @param {Record<string, unknown>[]} output @param {Set<object>} seen */
function collectV2EventLinesFromValue(value, output, seen) {
  if (typeof value === 'string') {
    output.push(...parseV2EventLines(value, 'lane-history'));
    return;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (const entry of assertDenseDataArray(value, 'lane-history value')) {
        collectV2EventLinesFromValue(entry, output, seen);
      }
      return;
    }
    const record = assertRecord(value, 'lane-history value');
    for (const field of Object.keys(record)) {
      collectV2EventLinesFromValue(record[field], output, seen);
    }
  } finally {
    seen.delete(value);
  }
}

/** @param {Record<string, unknown>} inspection */
function currentRunEventsV2(inspection) {
  const output = [];
  const items = /** @type {Record<string, unknown>[]} */ (inspection.items)
    .filter((item) => item.source === 'current-run' && item.status === 'present' && typeof item.text === 'string');
  if (items.length === 0) invalid('T002 current-run', 'must have complete fresh Inspection evidence');
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const parsed = JSON.parse(/** @type {string} */ (items[itemIndex].text));
    if (Array.isArray(parsed)) {
      if (assertDenseDataArray(parsed, `current-run Inspection body[${itemIndex}]`).length !== 0) {
        invalid(`current-run Inspection body[${itemIndex}]`, 'array form must be the canonical empty capture');
      }
      continue;
    }
    const body = assertExactRecord(
      parsed,
      ['target', 'state', 'records'],
      [],
      `current-run Inspection body[${itemIndex}]`,
    );
    if (targetKey(body.target) !== targetKey(inspection.target)) {
      invalid(`current-run Inspection body[${itemIndex}].target`, 'must match the Inspection target');
    }
    for (const [recordIndex, recordValue] of assertDenseDataArray(
      body.records,
      `current-run Inspection body[${itemIndex}].records`,
    ).entries()) {
      if (!isPlainRecord(recordValue)
        || !Object.hasOwn(/** @type {Record<string, unknown>} */ (recordValue), 'event')) continue;
      const record = assertExactRecord(
        recordValue,
        ['event'],
        [],
        `current-run Inspection body[${itemIndex}].records[${recordIndex}]`,
      );
      const candidate = t002EventCandidate(record);
      if (!candidate) continue;
      validateT002AuthoritativeEvent(candidate, 'current-run v2 event');
      output.push(/** @type {Record<string, unknown>} */ (candidate));
    }
  }
  return output;
}

/** @param {Record<string, unknown>} inspection */
function laneHistoryEventsV2(inspection) {
  const lane = assertRecord(inspectionSourceBodyV2(inspection, 'lane-history'), 'lane-history Inspection body');
  /** @type {Record<string, unknown>[]} */
  const output = [];
  if (lane.kind === 'lightweight') {
    const taskHistory = assertExactRecord(
      inspectionSourceBodyV2(inspection, 'task-history'),
      ['path', 'canonicalTasks', 'dependencies', 'discovered', 'history'],
      [],
      'task-history Inspection body',
    );
    parseV2EventLines(/** @type {string} */ (taskHistory.history), 'Lightweight execution history')
      .forEach((event) => output.push(event));
    return output;
  }
  if (lane.kind !== 'tracked') invalid('lane-history Inspection body.kind', 'must match the target lane');
  const records = assertDenseDataArray(lane.records, 'lane-history Inspection body.records');
  for (const value of records) {
    const record = assertRecord(value, 'tracked lane-history record');
    const detail = assertRecord(record.detail, 'tracked lane-history record.detail');
    if (Object.hasOwn(detail, 'notes')) collectV2EventLinesFromValue(detail.notes, output, new Set());
  }
  return output;
}

/** @param {Record<string, unknown>} event */
function eventChronologyV2(event) {
  const occurrence = /** @type {Record<string, unknown>} */ (event.occurrence);
  const chronology = /** @type {Record<string, unknown>} */ (occurrence.chronology);
  return {
    attemptOrdinal: /** @type {number} */ (chronology.attemptOrdinal),
    reviewOrdinal: event.type === 'finding-occurrence' ? /** @type {number} */ (chronology.reviewOrdinal) : 0,
  };
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function compareOccurrenceChronologyV2(left, right) {
  const leftChronology = eventChronologyV2(left);
  const rightChronology = eventChronologyV2(right);
  return leftChronology.attemptOrdinal - rightChronology.attemptOrdinal
    || leftChronology.reviewOrdinal - rightChronology.reviewOrdinal
    || compareUtf8(/** @type {string} */ (left.occurrenceIdentity), /** @type {string} */ (right.occurrenceIdentity));
}

/** @param {Record<string, unknown>[]} events @param {string} surface */
function validateOccurrenceSurfaceV2(events, surface) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byHash = new Map();
  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @type {Map<string, string>} */
  const byOccurrence = new Map();
  /** @type {Map<string, string>} */
  const chronology = new Map();
  for (const event of events) {
    // Declared audit-only records are already validated by this point; they are
    // excluded here by declared relevance so retention and repeat detection
    // never see them.
    if (laneEventDeclaration(event.type)?.relevance !== 'retention-relevant') continue;
    const eventHash = /** @type {string} */ (event.eventHash);
    const eventJson = canonicalJson(event);
    if (byHash.has(eventHash)) {
      if (canonicalJson(byHash.get(eventHash)) !== eventJson) {
        invalid(surface, 'contains conflicting bytes for one event hash');
      }
      counts.set(eventHash, (counts.get(eventHash) || 0) + 1);
      continue;
    }
    byHash.set(eventHash, event);
    counts.set(eventHash, 1);
    const occurrenceIdentity = /** @type {string} */ (event.occurrenceIdentity);
    const priorOccurrence = byOccurrence.get(occurrenceIdentity);
    if (priorOccurrence && priorOccurrence !== eventHash) invalid(surface, 'contains conflicting bytes for one occurrence identity');
    byOccurrence.set(occurrenceIdentity, eventHash);
    const position = event.type === 'finding-occurrence'
      ? `finding:${eventChronologyV2(event).attemptOrdinal}:${eventChronologyV2(event).reviewOrdinal}:${/** @type {Record<string, unknown>} */ (event.occurrence).findingIdentity}`
      : `approach:${eventChronologyV2(event).attemptOrdinal}`;
    const priorPosition = chronology.get(position);
    if (priorPosition && priorPosition !== eventJson) invalid(surface, 'contains conflicting bytes at one chronology position');
    chronology.set(position, eventJson);
  }
  return { byHash, counts };
}

/** @param {Record<string, unknown>} inspection */
function dualRetainedOccurrenceEventsV2(inspection) {
  const currentRun = currentRunEventsV2(inspection);
  let lane = laneHistoryEventsV2(inspection);
  const inspectionTargetKey = targetKey(inspection.target);
  for (const event of currentRun) {
    if (laneEventDeclaration(event.type)?.relevance === 'retention-relevant'
      && targetKey(event.target) !== inspectionTargetKey) {
      invalid('occurrence retention', 'contains a wrong-target event');
    }
  }
  if (inspection.target.lane === 'lightweight') {
    lane = lane.filter((event) => targetKey(event.target) === inspectionTargetKey);
  }
  const currentSurface = validateOccurrenceSurfaceV2(currentRun, 'current-run');
  const laneSurface = validateOccurrenceSurfaceV2(lane, 'lane-history');
  const currentByHash = currentSurface.byHash;
  const laneByHash = laneSurface.byHash;
  /** @type {Record<string, unknown>[]} */
  const retained = [];
  for (const [eventHash, currentEvent] of currentByHash) {
    const laneEvent = laneByHash.get(eventHash);
    if (!laneEvent) invalid('occurrence retention', 'is incomplete on lane-history');
    if (canonicalJson(currentEvent) !== canonicalJson(laneEvent)) {
      invalid('occurrence retention', 'contains conflicting current-run and lane event bytes');
    }
    retained.push(currentEvent);
  }
  for (const eventHash of laneByHash.keys()) {
    if (!currentByHash.has(eventHash)) invalid('occurrence retention', 'is incomplete on current-run');
  }
  return {
    currentByHash,
    laneByHash,
    currentCounts: currentSurface.counts,
    laneCounts: laneSurface.counts,
    retained,
  };
}

/** @param {Record<string, unknown>[]} events @param {ReturnType<typeof trustedEnvelopeIndexFromInspectionV2>} trusted */
function validateRetainedOccurrenceAuthorityV2(events, trusted) {
  const approaches = events.filter((event) => event.type === 'approach-occurrence');
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const occurrence = /** @type {Record<string, unknown>} */ (event.occurrence);
    if (event.type === 'approach-occurrence') {
      const verification = trusted.verifications.get(/** @type {string} */ (event.verificationEnvelopeIdentity));
      const review = trusted.reviews.get(/** @type {string} */ (event.reviewEnvelopeIdentity));
      if (!verification || !review) {
        invalid(`retained occurrence events[${index}]`, 'must retain fresh trusted verification and review captures');
      }
      const verificationEnvelope = verification.envelope;
      const reviewEnvelope = /** @type {Record<string, unknown>} */ (review.envelope);
      const expectedDisposition = trustedCompletionDispositionV2(verificationEnvelope, reviewEnvelope);
      const chronology = /** @type {Record<string, unknown>} */ (occurrence.chronology);
      const retainedBasis = /** @type {Record<string, unknown>} */ (event.basis);
      const mechanismIdentities = /** @type {string[]} */ (retainedBasis.mechanismIdentities);
      const derivedBasis = retainedBasis.action === 'reconcile-derived-definition'
        && mechanismIdentities.length === 1
        ? definitionReconciliationApproachBasisFromProposalIdentityV1(
          /** @type {Record<string, unknown>} */ (event.target),
          /** @type {Record<string, unknown>} */ (retainedBasis.materialInputs),
          mechanismIdentities[0],
        )
        : autonomousApproachBasis(
          /** @type {Record<string, unknown>} */ (event.target),
          /** @type {string} */ (retainedBasis.action),
          /** @type {Record<string, unknown>} */ (retainedBasis.materialInputs),
        );
      validateApproachBasisV1(derivedBasis, `retained occurrence events[${index}].basis`);
      const basisIdentity = sha256(canonicalJson(derivedBasis));
      if (verificationEnvelope.attemptIdentity !== occurrence.attemptIdentity
        || verificationEnvelope.resultIdentity !== occurrence.resultIdentity
        || reviewEnvelope.attemptIdentity !== occurrence.attemptIdentity
        || reviewEnvelope.resultIdentity !== occurrence.resultIdentity
        || reviewEnvelope.verificationEnvelopeIdentity !== verificationEnvelope.envelopeIdentity
        || reviewEnvelope.attemptOrdinal !== chronology.attemptOrdinal
        || verificationEnvelope.inspectedEvidenceHash !== occurrence.authorizationEvidenceHash
        || reviewEnvelope.inspectedEvidenceHash !== occurrence.authorizationEvidenceHash
        || occurrence.disposition !== expectedDisposition
        || occurrence.basisIdentity !== basisIdentity
        || canonicalJson(event.basis) !== canonicalJson(derivedBasis)
        || autonomousAttemptIdentity(
          /** @type {Record<string, unknown>} */ (event.target),
          /** @type {number} */ (chronology.attemptOrdinal),
          /** @type {string} */ (occurrence.authorizationEvidenceHash),
          basisIdentity,
        ) !== occurrence.attemptIdentity) {
        invalid(`retained occurrence events[${index}]`, 'conflicts with its fresh trusted completion envelopes');
      }
      continue;
    }
    if (event.type !== 'finding-occurrence') continue;
    const review = trusted.reviews.get(/** @type {string} */ (occurrence.reviewEnvelopeIdentity));
    if (!review || review.captureIdentity !== event.sourceCaptureIdentity) {
      invalid(`retained occurrence events[${index}]`, 'must retain its exact trusted independent-review capture');
    }
    const reviewEnvelope = /** @type {Record<string, unknown>} */ (review.envelope);
    const finding = /** @type {Record<string, unknown>[]} */ (reviewEnvelope.findings)
      .find((row) => row.findingIdentity === occurrence.findingIdentity);
    const chronology = /** @type {Record<string, unknown>} */ (occurrence.chronology);
    const matchingApproaches = approaches.filter((approach) => {
      const approachOccurrence = /** @type {Record<string, unknown>} */ (approach.occurrence);
      const approachChronology = /** @type {Record<string, unknown>} */ (approachOccurrence.chronology);
      return targetKey(approach.target) === targetKey(event.target)
        && approachOccurrence.attemptIdentity === occurrence.attemptIdentity
        && approachChronology.attemptOrdinal === chronology.attemptOrdinal
        && approach.reviewEnvelopeIdentity === occurrence.reviewEnvelopeIdentity;
    });
    if (!finding
      || reviewEnvelope.attemptIdentity !== occurrence.attemptIdentity
      || reviewEnvelope.attemptOrdinal !== chronology.attemptOrdinal
      || reviewEnvelope.reviewOrdinal !== chronology.reviewOrdinal
      || canonicalJson(finding.observation) !== canonicalJson(occurrence.observation)
      || finding.basisIdentity !== occurrence.basisIdentity) {
      invalid(`retained occurrence events[${index}]`, 'conflicts with its fresh trusted review envelope');
    }
    if (matchingApproaches.length !== 1) {
      invalid(`retained occurrence events[${index}]`, 'must bind exactly one retained approach occurrence for the same attempt');
    }
    const matchingApproach = matchingApproaches[0];
    const matchingOccurrence = /** @type {Record<string, unknown>} */ (matchingApproach.occurrence);
    if (occurrence.attemptApproachBasisIdentity !== matchingOccurrence.basisIdentity
      || matchingOccurrence.resultIdentity !== reviewEnvelope.resultIdentity) {
      invalid(`retained occurrence events[${index}]`, 'conflicts with its retained attempt approach occurrence');
    }
  }
}

/** @param {Record<string, unknown>[]} events */
export function deriveEarliestRepeatRelationshipV1(events) {
  const validatedRows = assertDenseDataArray(events, 'retained occurrence events')
    .map((event, index) => {
      const record = /** @type {Record<string, unknown>} */ (event);
      if (record.type === 'finding-occurrence') validateFindingOccurrenceEventV1(record, `retained occurrence events[${index}]`);
      else if (record.type === 'approach-occurrence') validateApproachOccurrenceEventV1(record, `retained occurrence events[${index}]`);
      else invalid(`retained occurrence events[${index}].type`, 'must be an occurrence event');
      return record;
    });
  const surface = validateOccurrenceSurfaceV2(validatedRows, 'retained occurrence events');
  const rows = [...surface.byHash.values()].sort(compareOccurrenceChronologyV2);
  /** @type {{repeat:Record<string, unknown>,second:Record<string, unknown>,first:Record<string, unknown>}[]} */
  const candidates = [];
  for (const channel of ['finding', 'approach']) {
    const type = `${channel}-occurrence`;
    const channelRows = rows.filter((event) => event.type === type);
    for (let secondIndex = 1; secondIndex < channelRows.length; secondIndex += 1) {
      const second = channelRows[secondIndex];
      const secondOccurrence = /** @type {Record<string, unknown>} */ (second.occurrence);
      if (channel === 'approach' && secondOccurrence.disposition === 'accepted') continue;
      for (let firstIndex = 0; firstIndex < secondIndex; firstIndex += 1) {
        const first = channelRows[firstIndex];
        const firstOccurrence = /** @type {Record<string, unknown>} */ (first.occurrence);
        if (channel === 'approach' && firstOccurrence.disposition === 'accepted') continue;
        if (firstOccurrence.basisIdentity !== secondOccurrence.basisIdentity
          || firstOccurrence.attemptIdentity === secondOccurrence.attemptIdentity
          || first.occurrenceIdentity === second.occurrenceIdentity
          || targetKey(first.target) !== targetKey(second.target)
          || eventChronologyV2(first).attemptOrdinal >= eventChronologyV2(second).attemptOrdinal
          || compareOccurrenceChronologyV2(first, second) >= 0) continue;
        candidates.push({
          first,
          second,
          repeat: {
            version: 1,
            channel,
            basisIdentity: secondOccurrence.basisIdentity,
            occurrenceIdentities: [first.occurrenceIdentity, second.occurrenceIdentity],
          },
        });
        break;
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => compareOccurrenceChronologyV2(left.second, right.second)
    || compareOccurrenceChronologyV2(left.first, right.first)
    || compareUtf8(/** @type {string} */ (left.repeat.channel), /** @type {string} */ (right.repeat.channel)));
  validateRepeatRelationshipV1(candidates[0].repeat);
  return candidates[0].repeat;
}

/** @param {Record<string, unknown>} repeat @param {Record<string, unknown>[]} retained */
export function deriveFailedApproachSetV1(repeat, retained) {
  validateRepeatRelationshipV1(repeat);
  const events = assertDenseDataArray(retained, 'retained occurrence events')
    .map((event, index) => {
      const record = /** @type {Record<string, unknown>} */ (event);
      if (record.type === 'finding-occurrence') validateFindingOccurrenceEventV1(record, `retained occurrence events[${index}]`);
      else if (record.type === 'approach-occurrence') validateApproachOccurrenceEventV1(record, `retained occurrence events[${index}]`);
      else invalid(`retained occurrence events[${index}].type`, 'must be an occurrence event');
      return record;
    });
  const byOccurrence = new Map(events.map((event) => [event.occurrenceIdentity, event]));
  const triggerEvents = /** @type {string[]} */ (repeat.occurrenceIdentities)
    .map((identity) => byOccurrence.get(identity));
  if (triggerEvents.some((event) => !event)) invalid('RepeatRelationshipV1', 'must reference retained occurrence events');
  const typedTriggerEvents = /** @type {Record<string, unknown>[]} */ (triggerEvents);
  if (typedTriggerEvents.some((event) => event.type !== `${repeat.channel}-occurrence`)) {
    invalid('RepeatRelationshipV1.channel', 'must match its occurrence event types');
  }
  const target = /** @type {Record<string, unknown>} */ (typedTriggerEvents[0].target);
  if (typedTriggerEvents.some((event) => targetKey(event.target) !== targetKey(target))) {
    invalid('RepeatRelationshipV1', 'must bind one target');
  }
  const cutoff = Math.max(...typedTriggerEvents.map((event) => eventChronologyV2(event).attemptOrdinal));
  const qualifying = events.filter((event) => event.type === `${repeat.channel}-occurrence`
    && targetKey(event.target) === targetKey(target)
    && (repeat.channel === 'approach'
      || /** @type {Record<string, unknown>} */ (event.occurrence).basisIdentity === repeat.basisIdentity)
    && (repeat.channel !== 'approach'
      || /** @type {Record<string, unknown>} */ (event.occurrence).disposition !== 'accepted')
    && eventChronologyV2(event).attemptOrdinal <= cutoff);
  const basisIdentities = qualifying.map((event) => repeat.channel === 'finding'
    ? /** @type {Record<string, unknown>} */ (event.occurrence).attemptApproachBasisIdentity
    : /** @type {Record<string, unknown>} */ (event.occurrence).basisIdentity);
  const approachBasisIdentities = [...new Set(/** @type {string[]} */ (basisIdentities))].sort(compareUtf8);
  if (approachBasisIdentities.length < 1) {
    invalid('FailedApproachSetV1', 'must contain at least one failed-approach basis');
  }
  if (approachBasisIdentities.length > 16) {
    invalid('FailedApproachSetV1', 'exceeds the complete failed-approach capacity');
  }
  /** @type {Map<string, string>} */
  const supportingEvidence = new Map();
  for (let index = 0; index < qualifying.length; index += 1) {
    const basisIdentity = /** @type {string} */ (basisIdentities[index]);
    const eventHash = /** @type {string} */ (qualifying[index].eventHash);
    const existing = supportingEvidence.get(basisIdentity);
    if (existing === undefined || compareUtf8(eventHash, existing) < 0) {
      supportingEvidence.set(basisIdentity, eventHash);
    }
  }
  const completeEvidenceEventHashes = [...new Set(
    qualifying.map((event) => /** @type {string} */ (event.eventHash)),
  )].sort(compareUtf8);
  const evidenceEventHashes = completeEvidenceEventHashes.length <= 16
    ? completeEvidenceEventHashes
    : [...supportingEvidence.values()].sort(compareUtf8);
  const withoutIdentity = {
    version: 1,
    target: canonicalTarget(target),
    chronologyCutoff: cutoff,
    approachBasisIdentities,
    evidenceEventHashes,
  };
  const set = { ...withoutIdentity, setIdentity: sha256(canonicalJson(withoutIdentity)) };
  validateFailedApproachSetV1(set);
  return set;
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} pendingCompletion @param {unknown} eventBodiesValue */
function validateFinalizeEventBindingV2(state, pendingCompletion, eventBodiesValue) {
  const events = assertDenseDataArray(eventBodiesValue, 'finalizeCompletionV2 occurrenceEvents')
    .map((event) => /** @type {Record<string, unknown>} */ (event));
  validateCommittedEventBodiesV1(
    events,
    /** @type {Record<string, unknown>} */ (pendingCompletion.target),
    /** @type {Record<string, unknown>} */ (pendingCompletion.retention),
    'finalizeCompletionV2 occurrenceEvents',
  );
  const approach = events[0];
  const findings = events.slice(1);
  if (/** @type {Record<string, unknown>} */ (approach.occurrence).attemptIdentity !== pendingCompletion.attemptIdentity
    || approach.verificationEnvelopeIdentity !== pendingCompletion.verificationEnvelopeIdentity
    || approach.reviewEnvelopeIdentity !== pendingCompletion.reviewEnvelopeIdentity
    || /** @type {Record<string, unknown>} */ (approach.occurrence).resultIdentity !== pendingCompletion.resultIdentity
    || canonicalJson(findings.map((event) => /** @type {Record<string, unknown>} */ (event.occurrence).findingIdentity).sort(compareUtf8))
      !== canonicalJson(pendingCompletion.findingIdentities)) {
    invalid('finalizeCompletionV2 occurrenceEvents', 'do not match pending completion identities');
  }
  const pendingRows = /** @type {Record<string, unknown>[]} */ (state.pending);
  if (pendingRows.length !== 1 || targetKey(pendingRows[0].target) !== targetKey(pendingCompletion.target)) {
    invalid('finalizeCompletionV2 state', 'must retain the exact pending attempt until finalization');
  }
  const pendingContext = completionApproachContextV2(state, pendingRows[0]);
  const approachOccurrence = /** @type {Record<string, unknown>} */ (approach.occurrence);
  if (pendingCompletion.attemptIdentity !== pendingContext.attemptIdentity
    || approachOccurrence.attemptIdentity !== pendingContext.attemptIdentity
    || approachOccurrence.authorizationEvidenceHash !== pendingRows[0].evidenceHash
    || approachOccurrence.basisIdentity !== pendingContext.approachBasisIdentity
    || canonicalJson(approach.basis) !== canonicalJson(pendingContext.basis)) {
    invalid('finalizeCompletionV2 state', 'must retain the exact pending authorization, attempt, and approach until finalization');
  }
  return { events, pending: pendingRows[0] };
}

/** @param {Record<string, unknown>[]} events */
function definitionOccurrenceProjectionSuffixV1(events) {
  return Buffer.concat(events.map((event, index) => {
    const item = v2ProjectionPlanItem(event, `finalizeCompletionV2 occurrenceEvents[${index}]`);
    if (item.laneEventLineTerminator !== 'LF') {
      invalid('finalizeCompletionV2 occurrenceEvents', 'must use LF-terminated projection records');
    }
    return Buffer.from(`${item.laneEventLine}\n`, 'utf8');
  }));
}

/**
 * Finalize one captured completion only after fresh exact dual retention. It
 * returns a governance-required body only for the earliest retained repeat.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} occurrenceEventsValue
 * @param {unknown} [dependencies] @param {boolean} [publicRoute] Transport-decoded `complete.finalize` route.
 */
export function finalizeCompletionV2(stateValue, inputValue, occurrenceEventsValue, dependencies, publicRoute = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('finalizeCompletionV2', 'requires autonomous policy');
  }
  if (!Object.hasOwn(state, 'pendingCompletion')) {
    invalid('finalizeCompletionV2', 'requires one pending completion retention case');
  }
  const pendingCompletion = /** @type {Record<string, unknown>} */ (
    validatePendingCompletionRetentionV2(state.pendingCompletion)
  );
  const pendingRows = /** @type {Record<string, unknown>[]} */ (state.pending);
  const definitionReconciliationCandidate = pendingRows.length === 1
    && pendingRows[0].action === 'reconcile-derived-definition';
  let binding = definitionReconciliationCandidate
    ? validateFinalizeEventBindingV2(
      state,
      pendingCompletion,
      finalizeOccurrenceEventBodiesV2(occurrenceEventsValue, pendingCompletion, publicRoute),
    )
    : null;
  const acquired = acquireInspection(
    inputValue,
    dependencies,
    publicRoute,
    'autonomous',
    binding ? { definitionTaskSuffix: definitionOccurrenceProjectionSuffixV1(binding.events) } : {},
  );
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} completionResult */
  const respond = (completionResult) => (publicRoute
    ? { inspection, completion: completionResult }
    : completionResult);
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0
    || targetKey(inspection.target) !== targetKey(pendingCompletion.target)) {
    return respond({ captured: true, finalized: false, completed: false, reason: 'occurrence-retention-incomplete', state });
  }
  binding ??= validateFinalizeEventBindingV2(
    state,
    pendingCompletion,
    finalizeOccurrenceEventBodiesV2(occurrenceEventsValue, pendingCompletion, publicRoute),
  );
  const definitionReconciliation = definitionReconciliationCandidate
    ? currentDefinitionReconciliationBindingV1(
      state,
      binding.pending,
      inspection,
      pendingCompletion.attemptIdentity,
      binding.events,
    )
    : null;
  if (definitionReconciliationCandidate && !definitionReconciliation) {
    return respond({ captured: true, finalized: false, completed: false, reason: 'learning-governance-conflict', state });
  }
  let retained;
  let trusted;
  try {
    retained = dualRetainedOccurrenceEventsV2(inspection);
    trusted = trustedEnvelopeIndexFromInspectionV2(inspection);
    validateRetainedOccurrenceAuthorityV2(retained.retained, trusted);
  } catch (error) {
    const reason = error instanceof Error && /incomplete|must retain fresh|must retain its exact/.test(error.message)
      ? 'occurrence-retention-incomplete'
      : 'occurrence-retention-conflict';
    return respond({ captured: true, finalized: false, completed: false, reason, state });
  }
  for (const event of binding.events) {
    const hash = /** @type {string} */ (event.eventHash);
    const current = retained.currentByHash.get(hash);
    const lane = retained.laneByHash.get(hash);
    if (!current || !lane) {
      return respond({ captured: true, finalized: false, completed: false, reason: 'occurrence-retention-incomplete', state });
    }
    if (retained.currentCounts.get(hash) !== 1 || retained.laneCounts.get(hash) !== 1) {
      return respond({ captured: true, finalized: false, completed: false, reason: 'occurrence-retention-conflict', state });
    }
    if (canonicalJson(current) !== canonicalJson(event) || canonicalJson(lane) !== canonicalJson(event)) {
      return respond({ captured: true, finalized: false, completed: false, reason: 'occurrence-retention-conflict', state });
    }
  }
  const completed = /** @type {Record<string, unknown>[]} */ (state.completed);
  const nextState = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: [],
    completed: [
      ...completed.map((entry) => ({ ...entry })),
      {
        evidenceHash: binding.pending.evidenceHash,
        approachHash: binding.pending.approachHash,
        resultHash: pendingCompletion.resultIdentity,
      },
    ],
  });
  delete nextState.pendingCompletion;
  const authorizedCase = activeGovernanceCaseV2(state);
  if (authorizedCase
    && V2_AUTHORIZED_PHASES.includes(/** @type {string} */ (authorizedCase.phase))
    && authorizedCase.authorizedAttemptIdentity === pendingCompletion.attemptIdentity) {
    // The bound post-learning attempt is retained first and only then verified.
    // A non-accepted disposition advances nothing and keeps the seal closed.
    const disposition = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (binding.events[0]).occurrence
    ).disposition;
    if (disposition === 'accepted' && authorizedCase.phase === 'alternative-authorized') {
      nextState.learningGovernance = JSON.parse(canonicalJson({
        ...authorizedCase,
        phase: 'alternative-verified',
      }));
      validateLearningGovernanceV1(nextState.learningGovernance);
    }
    validateRunState(nextState);
    return respond({
      captured: true,
      finalized: true,
      completed: disposition === 'accepted',
      reason: disposition === 'accepted' ? 'completed' : /** @type {string} */ (disposition),
      resultIdentity: pendingCompletion.resultIdentity,
      state: nextState,
    });
  }
  if (definitionReconciliation?.variant === 'learning-no-alternative') {
    const disposition = /** @type {Record<string, unknown>} */ (
      /** @type {Record<string, unknown>} */ (binding.events[0]).occurrence
    ).disposition;
    validateRunState(nextState);
    return respond({
      captured: true,
      finalized: true,
      completed: disposition === 'accepted',
      reason: disposition === 'accepted' ? 'completed' : /** @type {string} */ (disposition),
      resultIdentity: pendingCompletion.resultIdentity,
      state: nextState,
    });
  }
  const repeat = deriveEarliestRepeatRelationshipV1(retained.retained);
  if (!repeat) {
    validateRunState(nextState);
    return respond({
      captured: true,
      finalized: true,
      completed: /** @type {Record<string, unknown>} */ (binding.events[0]).occurrence.disposition === 'accepted',
      reason: /** @type {Record<string, unknown>} */ (binding.events[0]).occurrence.disposition === 'accepted'
        ? 'completed'
        : /** @type {Record<string, unknown>} */ (binding.events[0]).occurrence.disposition,
      resultIdentity: pendingCompletion.resultIdentity,
      state: nextState,
    });
  }
  if (Object.hasOwn(state, 'learningGovernance')) {
    // An occupied singleton is a conflict; `learning-governance-capacity` is
    // reserved for derivable failed-approach-set excess alone.
    return respond({ captured: true, finalized: false, completed: false, reason: 'learning-governance-conflict', state });
  }
  let failedApproachSet;
  try {
    failedApproachSet = deriveFailedApproachSetV1(repeat, retained.retained);
  } catch (error) {
    if (error instanceof TypeError
      && error.message === 'FailedApproachSetV1 exceeds the complete failed-approach capacity') {
      return respond({ captured: true, finalized: false, completed: false, reason: 'learning-governance-capacity', state });
    }
    throw error;
  }
  const governanceIdentity = sha256(canonicalJson({
    version: 1,
    target: pendingCompletion.target,
    repeatIdentity: sha256(canonicalJson(repeat)),
  }));
  const governanceCore = {
    version: 1,
    governanceIdentity,
    target: pendingCompletion.target,
    trigger: repeat,
    failedApproachSet,
    phase: 'required',
    revision: 1,
    triggerEvidenceHash: sha256(canonicalJson({
      trigger: repeat,
      failedApproachSetIdentity: failedApproachSet.setIdentity,
    })),
  };
  const governanceEvent = buildGovernanceEventV1(governanceCore);
  const projectionBatch = buildProjectionBatchV1(
    'governance-required',
    /** @type {Record<string, unknown>} */ (pendingCompletion.target),
    [governanceEvent],
    'finalizeCompletionV2 governance required',
  );
  const governance = {
    ...governanceCore,
    projectionCommitment: projectionCommitmentOfBatchV1(projectionBatch),
  };
  validateLearningGovernanceV1(governance);
  nextState.learningGovernance = governance;
  validateRunState(nextState);
  return respond({
    captured: true,
    finalized: true,
    completed: false,
    reason: 'learning-required',
    resultIdentity: pendingCompletion.resultIdentity,
    repeat,
    state: nextState,
    governanceEvent,
    projectionBatch,
  });
}

/** @param {Record<string, unknown>} source @param {Record<string, unknown>} target */
function carryOptionalRunState(source, target) {
  if (Object.hasOwn(source, 'evaluationSequences')) target.evaluationSequences = source.evaluationSequences;
  if (Object.hasOwn(source, 'learningReviewRefs')) target.learningReviewRefs = source.learningReviewRefs;
  if (Object.hasOwn(source, 'pendingCompletion')) {
    target.pendingCompletion = JSON.parse(canonicalJson(source.pendingCompletion));
  }
  if (Object.hasOwn(source, 'learningGovernance')) {
    target.learningGovernance = JSON.parse(canonicalJson(source.learningGovernance));
  }
  return target;
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} target @param {string} triggerEvidenceHash */
function establishRequiredLearningGovernance(state, target, triggerEvidenceHash) {
  const nextState = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: /** @type {Record<string, unknown>[]} */ (state.pending).map(copyPendingEntry),
    completed: /** @type {Record<string, unknown>[]} */ (state.completed).map((entry) => ({ ...entry })),
  });
  nextState.learningGovernance = {
    version: 1,
    target: { ...target },
    phase: 'required',
    revision: 1,
    triggerEvidenceHash,
  };
  validateRunState(nextState);
  return nextState;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function comparePending(left, right) {
  return compareUtf8(targetKey(left.target), targetKey(right.target))
    || compareUtf8(/** @type {string} */ (left.evidenceHash), /** @type {string} */ (right.evidenceHash))
    || compareUtf8(/** @type {string} */ (left.approachHash), /** @type {string} */ (right.approachHash));
}

/** @param {Record<string, unknown>} inspection @param {Record<string, unknown>} target */
function resolvedDefinitionOwnerV1(inspection, target) {
  const matches = /** @type {Record<string, unknown>[]} */ (inspection.items)
    .filter((item) => item.source === 'owner-log' && item.status === 'present' && typeof item.text === 'string');
  if (matches.length !== 1) return null;
  try {
    const owner = assertExactRecord(
      JSON.parse(/** @type {string} */ (matches[0].text)),
      ['ideaPath', 'specPath', 'coordinatorLog'],
      [],
      'definition reconciliation owner',
    );
    assertDirectIdeaPath(owner.ideaPath, 'definition reconciliation owner.ideaPath');
    assertUnicodeScalarString(owner.coordinatorLog, 'definition reconciliation owner.coordinatorLog');
    if (owner.specPath !== target.specPath) return null;
    return { ideaPath: owner.ideaPath, specPath: owner.specPath };
  } catch {
    return null;
  }
}

/** @param {Record<string, unknown>} inspection */
function inspectedDefinitionRevisionProposalV1(inspection) {
  /** @type {Record<string, unknown>[]} */
  const proposals = [];
  try {
    const items = /** @type {Record<string, unknown>[]} */ (inspection.items)
      .filter((item) => item.source === 'current-run' && item.status === 'present' && typeof item.text === 'string');
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const parsed = JSON.parse(/** @type {string} */ (items[itemIndex].text));
      if (Array.isArray(parsed)) {
        if (assertDenseDataArray(parsed, `definition proposal source[${itemIndex}]`).length !== 0) {
          return { reason: 'malformed-proposal-evidence' };
        }
        continue;
      }
      const body = assertExactRecord(
        parsed,
        ['target', 'state', 'records'],
        [],
        `definition proposal source[${itemIndex}]`,
      );
      if (targetKey(body.target) !== targetKey(inspection.target)) return { reason: 'wrong-target-proposal-evidence' };
      for (const [recordIndex, value] of assertDenseDataArray(
        body.records,
        `definition proposal source[${itemIndex}].records`,
      ).entries()) {
        const record = assertRecord(value, `definition proposal source[${itemIndex}].records[${recordIndex}]`);
        if (record.type !== 'definition-revision-proposal') continue;
        const envelope = assertExactRecord(
          record,
          ['type', 'version', 'proposal'],
          [],
          `definition proposal source[${itemIndex}].records[${recordIndex}]`,
        );
        if (body.state !== 'blocked' || envelope.version !== 1) return { reason: 'malformed-proposal-evidence' };
        validateDefinitionRevisionProposalV1(envelope.proposal);
        proposals.push(/** @type {Record<string, unknown>} */ (envelope.proposal));
      }
    }
  } catch {
    return { reason: 'malformed-proposal-evidence' };
  }
  if (proposals.length === 0) return { reason: 'missing-proposal-evidence' };
  if (proposals.length !== 1) return { reason: 'ambiguous-proposal-evidence' };
  return { proposal: JSON.parse(canonicalJson(proposals[0])) };
}

/** @param {Set<string>} allowed @param {unknown} values */
function definitionReferencesResolveV1(allowed, values) {
  return /** @type {string[]} */ (values).every((identity) => allowed.has(identity));
}

/** Resolve one closed contradiction bundle per fresh trusted finding occurrence. @param {Record<string, unknown>} inspection */
function trustedDefinitionContradictionReferencesV1(inspection) {
  try {
    const trusted = trustedEnvelopeIndexFromInspectionV2(inspection);
    const bundles = [];
    for (const row of trusted.reviews.values()) {
      const review = /** @type {Record<string, unknown>} */ (row.envelope);
      for (const findingValue of /** @type {Record<string, unknown>[]} */ (review.findings)) {
        const finding = /** @type {Record<string, unknown>} */ (findingValue);
        const basis = /** @type {Record<string, unknown>} */ (finding.basis);
        const proofKind = basis.failureClass === 'definition-contradiction'
          ? 'contradiction'
          : basis.failureClass === 'impossible-definition-gate'
            ? 'impossible-gate'
            : null;
        if (proofKind === null) continue;
        const expectation = /** @type {Record<string, unknown>} */ (basis.expectation);
        const observation = /** @type {Record<string, unknown>} */ (finding.observation);
        const gateIdentities = new Set([
          /** @type {string} */ (basis.checkDefinitionIdentity),
          /** @type {string} */ (observation.identity),
        ]);
        const causalIdentities = new Set([
          /** @type {string} */ (finding.findingIdentity),
          /** @type {string} */ (finding.basisIdentity),
          /** @type {string} */ (expectation.identity),
          /** @type {string} */ (basis.checkDefinitionIdentity),
          /** @type {string} */ (observation.identity),
        ]);
        if (observation.kind === 'check-result') {
          const verification = /** @type {Record<string, unknown>} */ (row.verification);
          const check = /** @type {Record<string, unknown>[]} */ (verification.checks)
            .find((candidate) => candidate.checkIdentity === observation.identity);
          if (!check) return null;
          for (const identity of [check.checkIdentity, check.definitionIdentity, check.evidenceIdentity]) {
            gateIdentities.add(/** @type {string} */ (identity));
            causalIdentities.add(/** @type {string} */ (identity));
          }
        }
        bundles.push({
          blockerIdentity: finding.findingIdentity,
          proofKind,
          sourceRevisionIdentity: review.sourceRevisionIdentity,
          definitionIdentities: new Set([
            /** @type {string} */ (expectation.identity),
            /** @type {string} */ (basis.checkDefinitionIdentity),
          ]),
          gateIdentities,
          causalIdentities,
          blockerIdentities: new Set([/** @type {string} */ (finding.findingIdentity)]),
          decompositionIdentities: new Set([/** @type {string} */ (finding.basisIdentity)]),
        });
      }
    }
    return bundles;
  } catch {
    return null;
  }
}

/**
 * Resolve one source revision from the fresh trusted reviews that authorize the
 * exact retained occurrence proof.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>[]} retained
 */
function trustedRetainedSourceRevisionIdentityV1(inspection, retained) {
  try {
    const trusted = trustedEnvelopeIndexFromInspectionV2(inspection);
    const revisions = retained.map((event) => {
      const reviewEnvelopeIdentity = event.type === 'approach-occurrence'
        ? event.reviewEnvelopeIdentity
        : /** @type {Record<string, unknown>} */ (event.occurrence).reviewEnvelopeIdentity;
      const review = trusted.reviews.get(/** @type {string} */ (reviewEnvelopeIdentity));
      if (!review) return null;
      return /** @type {Record<string, unknown>} */ (review.envelope).sourceRevisionIdentity;
    });
    if (revisions.some((revision) => revision === null)) return null;
    const unique = [...new Set(/** @type {string[]} */ (revisions))].sort(compareUtf8);
    return unique.length === 1 ? unique[0] : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} state @param {Set<string>|undefined} [projectedOccurrenceEventHashes]
 */
function currentFeature009DefinitionEvidenceV1(
  inspection,
  target,
  state,
  projectedOccurrenceEventHashes = undefined,
) {
  let governance;
  try {
    governance = activeGovernanceCaseV2(state);
  } catch {
    return { kind: 'incomplete' };
  }
  if (!governance || targetKey(governance.target) !== targetKey(target)) return { kind: 'none' };
  if (!['projected', 'alternative-inspected', 'no-progress-verified'].includes(
    /** @type {string} */ (governance.phase),
  ) || Object.hasOwn(governance, 'controlledEnd')) return { kind: 'incomplete' };
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return { kind: 'incomplete' };
  const retained = retainedLearningResultV2(inspection, governance);
  if (retained.reason) return { kind: 'incomplete' };
  const reviewEvent = /** @type {Record<string, unknown>} */ (retained.reviewEvent);
  if (reviewEvent.outcome === 'selected-alternative') return { kind: 'viable-alternative' };
  if (reviewEvent.outcome !== 'no-progress'
    || !['projected', 'no-progress-verified'].includes(/** @type {string} */ (governance.phase))) {
    return { kind: 'incomplete' };
  }
  const failedApproachSet = /** @type {Record<string, unknown>} */ (rebound.failedApproachSet);
  try {
    const alternatives = requireCompleteFailedSetComparisonV2(
      reviewEvent.alternatives,
      failedApproachSet,
      'definition reconciliation learning alternatives',
    );
    if (alternatives.credible.length !== 0) return { kind: 'viable-alternative' };
  } catch {
    return { kind: 'incomplete' };
  }
  const proof = /** @type {Record<string, unknown>} */ (reviewEvent.noProgressProof);
  const proofRetained = projectedOccurrenceEventHashes
    ? /** @type {Record<string, unknown>[]} */ (rebound.retained)
      .filter((event) => !projectedOccurrenceEventHashes.has(/** @type {string} */ (event.eventHash)))
    : /** @type {Record<string, unknown>[]} */ (rebound.retained);
  const sourceRevisionIdentity = trustedRetainedSourceRevisionIdentityV1(inspection, proofRetained);
  if (proof.failedApproachSetIdentity !== failedApproachSet.setIdentity
    || sourceRevisionIdentity === null
    || proof.completeEvidenceHash !== noProgressCompleteEvidenceHashV2(
      failedApproachSet,
      proofRetained,
    )) return { kind: 'incomplete' };
  const blockerIdentities = new Set(
    /** @type {Record<string, unknown>[]} */ (reviewEvent.findings)
      .map((finding) => /** @type {string} */ (finding.findingIdentity)),
  );
  const decompositionIdentities = new Set([
    /** @type {string} */ (failedApproachSet.setIdentity),
    .../** @type {string[]} */ (failedApproachSet.approachBasisIdentities),
    /** @type {string} */ (proof.proofIdentity),
  ]);
  for (const alternative of /** @type {Record<string, unknown>[]} */ (reviewEvent.alternatives)) {
    for (const identity of [
      alternative.alternativeIdentity,
      alternative.approachBasisIdentity,
      alternative.semanticAssessmentIdentity,
    ]) decompositionIdentities.add(/** @type {string} */ (identity));
  }
  return {
    kind: 'learning-no-alternative',
    governance,
    reviewEvent,
    failedApproachSet,
    proof,
    sourceRevisionIdentity,
    projectionRef: retained.projectionRef,
    blockerIdentities,
    decompositionIdentities,
  };
}

/** @param {Record<string, unknown>} target @param {Record<string, unknown>} materialInputs @param {string} proposalIdentity */
function definitionReconciliationApproachBasisFromProposalIdentityV1(
  target,
  materialInputs,
  proposalIdentity,
) {
  assertHash(proposalIdentity, 'definition reconciliation proposal identity');
  const basis = autonomousApproachBasis(target, 'reconcile-derived-definition', materialInputs);
  basis.mechanismIdentities = [proposalIdentity];
  basis.evidenceAcquisitionIdentities = [sha256(canonicalJson({
    kind: 'proposal-bound-eligibility-evidence',
    proposalIdentity,
  }))];
  basis.validationPlanIdentities = [
    sha256(canonicalJson({
      kind: 'proposal-bound-blocker-evidence',
      proposalIdentity,
    })),
    sha256(canonicalJson({
      kind: 'proposal-bound-decomposition-evidence',
      proposalIdentity,
    })),
  ].sort(compareUtf8);
  validateApproachBasisV1(basis, 'definition reconciliation approach basis');
  return basis;
}

/**
 * @param {Record<string, unknown>} state @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} materialInputs
 * @param {'definitionPrestate'|'definitionProjectionBase'} [prestateField]
 * @param {Set<string>|undefined} [projectedOccurrenceEventHashes]
 */
function deriveDefinitionReconciliationBindingV1(
  state,
  target,
  inspection,
  materialInputs,
  prestateField = 'definitionPrestate',
  projectedOccurrenceEventHashes = undefined,
) {
  const inspected = inspectedDefinitionRevisionProposalV1(inspection);
  if (!inspected.proposal) return inspected;
  const proposal = /** @type {Record<string, unknown>} */ (inspected.proposal);
  const owner = resolvedDefinitionOwnerV1(inspection, target);
  if (!owner
    || targetKey(proposal.target) !== targetKey(target)
    || canonicalJson(proposal.owner) !== canonicalJson(owner)) {
    return { reason: 'wrong-target-proposal-evidence' };
  }
  const eligibility = /** @type {Record<string, unknown>} */ (proposal.eligibility);
  const references = /** @type {Record<string, unknown>} */ (proposal.reviewerEvidenceReferences);
  let currentPrestate;
  try {
    const planItems = /** @type {Record<string, unknown>[]} */ (inspection.items)
      .filter((item) => item.source === 'definition-plan'
        && item.status === 'present'
        && typeof item.text === 'string');
    if (planItems.length !== 1) return { reason: 'stale-definition-prestate' };
    const planBody = assertRecord(
      JSON.parse(/** @type {string} */ (planItems[0].text)),
      'definition reconciliation Inspection plan',
    );
    currentPrestate = assertExactRecord(
      planBody[prestateField],
      ['prestateDescriptors', 'sourceRevisionIdentity'],
      [],
      `definition reconciliation Inspection ${prestateField}`,
    );
    assertHash(
      currentPrestate.sourceRevisionIdentity,
      `definition reconciliation Inspection ${prestateField}.sourceRevisionIdentity`,
    );
    if (canonicalJson(currentPrestate.prestateDescriptors)
        !== canonicalJson(proposal.prestateDescriptors)) {
      return { reason: 'stale-definition-prestate' };
    }
  } catch {
    return { reason: 'stale-definition-prestate' };
  }
  const learning = currentFeature009DefinitionEvidenceV1(
    inspection,
    target,
    state,
    projectedOccurrenceEventHashes,
  );
  if (eligibility.variant === 'definition-contradiction') {
    if (learning.kind === 'viable-alternative') return { reason: 'viable-implementation-alternative' };
    if (learning.kind !== 'none') return { reason: 'conflicting-eligibility-evidence' };
    const trustedBundles = trustedDefinitionContradictionReferencesV1(inspection);
    const trustedBundle = trustedBundles?.find((bundle) => (
      bundle.blockerIdentity === eligibility.blockerEvidenceIdentity
      && bundle.proofKind === eligibility.proofKind
      && bundle.sourceRevisionIdentity === currentPrestate.sourceRevisionIdentity
      && bundle.gateIdentities.has(eligibility.gateEvidenceIdentity)
      && definitionReferencesResolveV1(bundle.definitionIdentities, eligibility.definitionReferenceIdentities)
      && definitionReferencesResolveV1(bundle.causalIdentities, eligibility.causalEvidenceIdentities)
      && definitionReferencesResolveV1(bundle.blockerIdentities, references.blockerEvidenceIdentities)
      && definitionReferencesResolveV1(
        bundle.decompositionIdentities,
        references.decompositionEvidenceIdentities,
      )
    ));
    if (!trustedBundle) return { reason: 'untrusted-contradiction-evidence' };
  } else {
    if (learning.kind === 'viable-alternative') return { reason: 'viable-implementation-alternative' };
    if (learning.kind !== 'learning-no-alternative') return { reason: 'stale-learning-evidence' };
    if (learning.sourceRevisionIdentity !== currentPrestate.sourceRevisionIdentity) {
      return { reason: 'stale-learning-evidence' };
    }
    if (!learning.blockerIdentities.has(/** @type {string} */ (eligibility.blockerEvidenceIdentity))
      || !definitionReferencesResolveV1(learning.blockerIdentities, references.blockerEvidenceIdentities)
      || !definitionReferencesResolveV1(
        learning.decompositionIdentities,
        references.decompositionEvidenceIdentities,
      )
      || !/** @type {string[]} */ (references.decompositionEvidenceIdentities)
        .includes(/** @type {string} */ (learning.failedApproachSet.setIdentity))) {
      return { reason: 'conflicting-learning-evidence' };
    }
    const expectedEligibility = buildDefinitionReconciliationEligibilityV1({
      variant: 'learning-no-alternative',
      blockerEvidenceIdentity: eligibility.blockerEvidenceIdentity,
      governanceIdentity: learning.governance.governanceIdentity,
      reviewIdentity: learning.reviewEvent.reviewIdentity,
      learningReviewEventHash: learning.reviewEvent.eventHash,
      failedApproachSetIdentity: learning.failedApproachSet.setIdentity,
      noProgressProofIdentity: learning.proof.proofIdentity,
      noNewDistinguishingEvidenceHash: learning.proof.noNewDistinguishingEvidenceHash,
      projectionReferenceIdentity: sha256(canonicalJson(learning.projectionRef)),
    });
    if (canonicalJson(expectedEligibility) !== canonicalJson(eligibility)) {
      return { reason: 'stale-learning-evidence' };
    }
  }
  const approachBasis = definitionReconciliationApproachBasisFromProposalIdentityV1(
    target,
    materialInputs,
    /** @type {string} */ (proposal.proposalIdentity),
  );
  return {
    binding: {
      version: 1,
      variant: eligibility.variant,
      proposalIdentity: proposal.proposalIdentity,
      eligibilityIdentity: eligibility.eligibilityIdentity,
      proposal: JSON.parse(canonicalJson(proposal)),
      reviewerEvidenceReferences: JSON.parse(canonicalJson(references)),
      approachBasis,
      approachBasisIdentity: sha256(canonicalJson(approachBasis)),
    },
  };
}

/**
 * Rebind the exact proposal variant for one pending definition reconciliation.
 * Learning requires its matching occupied governance; contradiction requires
 * the singleton to be unoccupied.
 * @param {Record<string, unknown>} state @param {Record<string, unknown>} pending
 * @param {Record<string, unknown>} inspection @param {unknown} attemptIdentity
 * @param {Record<string, unknown>[]|undefined} [projectedOccurrenceEvents]
 */
function currentDefinitionReconciliationBindingV1(
  state,
  pending,
  inspection,
  attemptIdentity,
  projectedOccurrenceEvents = undefined,
) {
  try {
    if (pending.action !== 'reconcile-derived-definition'
      || pending.mode !== 'recovery'
      || targetKey(inspection.target) !== targetKey(pending.target)
      || completionApproachContextV2(state, pending).attemptIdentity !== attemptIdentity) return null;
    const projectedOccurrenceEventHashes = projectedOccurrenceEvents
      ? new Set(projectedOccurrenceEvents.map((event) => /** @type {string} */ (event.eventHash)))
      : undefined;
    const derived = deriveDefinitionReconciliationBindingV1(
      state,
      /** @type {Record<string, unknown>} */ (pending.target),
      inspection,
      /** @type {Record<string, unknown>} */ (pending.materialInputs),
      projectedOccurrenceEvents ? 'definitionProjectionBase' : 'definitionPrestate',
      projectedOccurrenceEventHashes,
    );
    if (!derived.binding
      || derived.binding.proposalIdentity !== pending.approachHash) return null;
    const occupied = Object.hasOwn(state, 'learningGovernance');
    if ((derived.binding.variant === 'learning-no-alternative' && !occupied)
      || (derived.binding.variant === 'definition-contradiction' && occupied)) return null;
    return derived.binding;
  } catch {
    return null;
  }
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} inspection @param {string} reason */
function definitionReconciliationRefusalV1(state, inspection, reason) {
  const code = ['ambiguous-proposal-evidence', 'conflicting-eligibility-evidence',
    'conflicting-learning-evidence', 'viable-implementation-alternative'].includes(reason)
    ? 'clarification-required'
    : 'evidence-incomplete';
  const blocker = {
    code,
    subject: `definition-reconciliation:${reason}`,
    evidenceHash: inspection.evidenceHash,
  };
  return authorizationRefusal(state, code, blocker);
}

/**
 * Authorize one transient ordinary or recovery attempt.
 * @param {unknown} stateValue
 * @param {unknown} targetValue
 * @param {unknown} rawInputs
 * @param {unknown} assessmentValue
 * @param {unknown} mode
 * @param {unknown} [dependencies]
 */
function authorizeInspectedAttempt(state, target, inspection, assessmentValue, mode, attemptPermitValue) {
  let consumed = null;
  if (attemptPermitValue !== undefined) {
    consumed = consumeAttemptPermitV2(state, target, inspection, attemptPermitValue);
    if (consumed.reason) return authorizationRefusal(state, consumed.reason);
  }
  let assessment;
  try {
    assessment = /** @type {Record<string, unknown>} */ (validateAssessment(assessmentValue));
  } catch (error) {
    if (error instanceof TypeError
      && error.message.startsWith('Assessment.materialInputs.checks must exactly match')) {
      return authorizationRefusal(state, 'invalid-action');
    }
    throw error;
  }
  if (assessment.evidenceHash !== inspection.evidenceHash) {
    return authorizationRefusal(state, 'evidence-drift');
  }
  try {
    validateAssessment(target, inspection, assessment);
  } catch (error) {
    if (error instanceof TypeError
      && (error.message.startsWith('Assessment.materialInputs.checks must exactly match')
        || error.message.startsWith('Assessment.materialInputs does not match'))) {
      return authorizationRefusal(state, 'invalid-action');
    }
    throw error;
  }
  if (isFeatureTarget(target)) return authorizationRefusal(state, 'feature-only');
  if (inspection.blockers.length > 0) {
    const blocker = /** @type {Record<string, unknown>} */ (inspection.blockers[0]);
    return authorizationRefusal(state, /** @type {string} */ (blocker.code), blocker);
  }
  const { action, materialInputs } = canonicalAssessment(assessment);
  let candidateApproachHash = approachHash({ action, materialInputs });

  if (assessment.intent !== 'unchanged') {
    const blocker = {
      code: 'clarification-required',
      subject: `assessment:${assessment.intent}`,
      evidenceHash: inspection.evidenceHash,
    };
    return authorizationRefusal(state, 'clarification-required', blocker);
  }
  if (assessment.action === 'reconcile-derived-definition' && target.lane === 'tracked') {
    const blocker = {
      code: 'tracked-definition-recovery-unsupported',
      subject: targetKey(target),
      evidenceHash: inspection.evidenceHash,
    };
    return authorizationRefusal(state, 'tracked-definition-recovery-unsupported', blocker);
  }
  if (mode !== 'ordinary' && mode !== 'recovery') return authorizationRefusal(state, 'invalid-mode');
  if (action === 'none') return authorizationRefusal(state, 'no-action');
  if ((mode === 'ordinary' && action !== 'execute-task')
    || (mode === 'recovery' && action === 'execute-task')
    || !actionInputsMatch(target, assessment)) {
    return authorizationRefusal(state, 'invalid-action');
  }
  const policy = /** @type {Record<string, unknown>} */ (state.policy);
  if (mode === 'recovery' && !policy.recover) return authorizationRefusal(state, 'recovery-disabled');
  if (evaluationSequenceRows(state).some((row) => (
    row.state === 'unsettled'
      || Object.hasOwn(row, 'activeCheckpointIdentity')
      || Object.hasOwn(row, 'activeCandidateIdentity')
  ))) {
    return authorizationRefusal(state, 'not-dispatchable');
  }
  if (policy.mode === 'autonomous') {
    if (state.overallUsed === Number.MAX_SAFE_INTEGER
      || (policy.overall !== 'unlimited' && state.overallUsed >= policy.overall)) {
      return authorizationRefusal(state, 'overall-exhausted');
    }
    if (mode === 'recovery') {
      const autonomousTargetKey = targetKey(target);
      const autonomousRecoveryRow = /** @type {Record<string, unknown>[]} */ (state.recoveryUsed)
        .find((row) => row.targetKey === autonomousTargetKey);
      if (autonomousRecoveryRow?.count === Number.MAX_SAFE_INTEGER
        || (policy.recovery !== 'unlimited' && (autonomousRecoveryRow?.count || 0) >= policy.recovery)) {
        return authorizationRefusal(state, 'recovery-exhausted');
      }
    }
  }
  let definitionReconciliationBinding = null;
  if (policy.mode === 'autonomous' && action === 'reconcile-derived-definition') {
    const derived = deriveDefinitionReconciliationBindingV1(state, target, inspection, materialInputs);
    if (!derived.binding) {
      return definitionReconciliationRefusalV1(
        state,
        inspection,
        /** @type {string} */ (derived.reason),
      );
    }
    definitionReconciliationBinding = derived.binding;
    candidateApproachHash = /** @type {string} */ (definitionReconciliationBinding.proposalIdentity);
  }
  if (hasUnresolvedLearningGovernance(state, target)
    && !consumed?.governance
    && !definitionReconciliationBinding) {
    return authorizationRefusal(state, 'learning-required');
  }
  const claimedEquivalent = assessment.equivalence === 'same' || assessment.equivalence === 'equivalent';
  if (claimedEquivalent && policy.mode !== 'autonomous') {
    return authorizationRefusal(state, 'no-progress');
  }
  const completed = /** @type {Record<string, unknown>[]} */ (state.completed);
  /** @type {Record<string, unknown>[]} */
  let retainedV2Approaches = [];
  if (policy.mode === 'autonomous') {
    try {
      const retained = dualRetainedOccurrenceEventsV2(inspection).retained;
      if (retained.length > 0) {
        const trusted = trustedEnvelopeIndexFromInspectionV2(inspection);
        validateRetainedOccurrenceAuthorityV2(retained, trusted);
      }
      retainedV2Approaches = retained
        .filter((event) => event.type === 'approach-occurrence');
    } catch {
      const blocker = {
        code: 'evidence-incomplete',
        subject: 'occurrence-retention',
        evidenceHash: inspection.evidenceHash,
      };
      return authorizationRefusal(state, 'evidence-incomplete', blocker);
    }
  }
  const legacyCompleted = completed.filter((entry) => !retainedV2Approaches.some((event) => {
    const occurrence = /** @type {Record<string, unknown>} */ (event.occurrence);
    const basis = /** @type {Record<string, unknown>} */ (event.basis);
    const retainedApproachHash = basis.action === 'reconcile-derived-definition'
      ? /** @type {string[]} */ (basis.mechanismIdentities)[0]
      : approachHash({ action: basis.action, materialInputs: basis.materialInputs });
    return occurrence.authorizationEvidenceHash === entry.evidenceHash
      && occurrence.resultIdentity === entry.resultHash
      && retainedApproachHash === entry.approachHash;
  }));
  const resultPairs = new Map();
  for (const entry of legacyCompleted) {
    if (entry.evidenceHash !== inspection.evidenceHash) continue;
    const pair = `${entry.evidenceHash}:${entry.resultHash}`;
    const prior = resultPairs.get(pair);
    if (prior) {
      if (policy.mode === 'autonomous') {
        if (Object.hasOwn(state, 'pendingCompletion')) {
          return authorizationRefusal(state, 'occurrence-retention-conflict');
        }
        if (Object.hasOwn(state, 'learningGovernance')) {
          return authorizationRefusal(state, 'learning-governance-conflict');
        }
        const governedState = establishRequiredLearningGovernance(
          state,
          target,
          retainedResultSealHash(target, prior, entry),
        );
        return authorizationRefusal(governedState, 'learning-required');
      }
      return authorizationRefusal(state, 'prior-no-progress');
    }
    resultPairs.set(pair, entry);
  }
  const repeatedApproach = legacyCompleted.find((entry) => (
    entry.evidenceHash === inspection.evidenceHash && entry.approachHash === candidateApproachHash
  ));
  if (repeatedApproach) {
    if (policy.mode === 'autonomous') {
      if (Object.hasOwn(state, 'pendingCompletion')) {
        return authorizationRefusal(state, 'occurrence-retention-conflict');
      }
      if (Object.hasOwn(state, 'learningGovernance')) {
        return authorizationRefusal(state, 'learning-governance-conflict');
      }
      const governedState = establishRequiredLearningGovernance(
        state,
        target,
        repeatedApproachSealHash(target, repeatedApproach),
      );
      return authorizationRefusal(governedState, 'learning-required');
    }
    return authorizationRefusal(state, 'no-progress');
  }
  if (claimedEquivalent) {
    const blocker = {
      code: 'evidence-incomplete',
      subject: 'autonomous-repeat-equivalence',
      evidenceHash: inspection.evidenceHash,
    };
    return authorizationRefusal(state, 'evidence-incomplete', blocker);
  }

  const pending = /** @type {Record<string, unknown>[]} */ (state.pending);
  const key = targetKey(target);
  if (pending.length > 0) return authorizationRefusal(state, 'not-dispatchable');
  if (state.overallUsed === Number.MAX_SAFE_INTEGER
    || (policy.overall !== 'unlimited' && state.overallUsed >= policy.overall)) {
    return authorizationRefusal(state, 'overall-exhausted');
  }

  const recoveryUsed = /** @type {Record<string, unknown>[]} */ (state.recoveryUsed);
  const recoveryRow = recoveryUsed.find((row) => row.targetKey === key);
  if (mode === 'recovery' && (recoveryRow?.count === Number.MAX_SAFE_INTEGER
    || (policy.recovery !== 'unlimited' && (recoveryRow?.count || 0) >= policy.recovery))) {
    return authorizationRefusal(state, 'recovery-exhausted');
  }

  const nextRecoveryUsed = recoveryUsed.map((row) => ({ ...row }));
  if (mode === 'recovery') {
    const row = nextRecoveryUsed.find((entry) => entry.targetKey === key);
    if (row) row.count = /** @type {number} */ (row.count) + 1;
    else nextRecoveryUsed.push({ targetKey: key, targetHash: targetHash(target), count: 1 });
    nextRecoveryUsed.sort((left, right) => compareUtf8(
      /** @type {string} */ (left.targetKey),
      /** @type {string} */ (right.targetKey),
    ));
  }
  const nextPending = pending.map(copyPendingEntry);
  nextPending.push({
    target: { ...target },
    evidenceHash: inspection.evidenceHash,
    approachHash: candidateApproachHash,
    action,
    materialInputs,
    mode,
  });
  nextPending.sort(comparePending);
  const nextState = carryOptionalRunState(state, {
    policy: { ...policy },
    overallUsed: /** @type {number} */ (state.overallUsed) + 1,
    recoveryUsed: nextRecoveryUsed,
    pending: nextPending,
    completed: completed.map((entry) => ({ ...entry })),
  });
  if (consumed?.governance) {
    // The permit is consumed exactly here, before RunState changes settle, and
    // is never reusable for the lane claim that may follow.
    const authorizedAttemptIdentity = completionApproachContextV2(
      nextState,
      nextPending.find((entry) => targetKey(entry.target) === targetKey(target)),
    ).attemptIdentity;
    const claimRequired = lightweightClaimRequiredV2(inspection, target);
    nextState.learningGovernance = JSON.parse(canonicalJson({
      ...consumed.governance,
      phase: claimRequired ? 'alternative-authorized-pending-lane' : 'alternative-authorized',
      consumedAttemptPermitHash: /** @type {Record<string, unknown>} */ (consumed.permit).permitHash,
      authorizedAttemptIdentity,
    }));
    validateLearningGovernanceV1(nextState.learningGovernance);
    validateRunState(nextState);
    return {
      authorized: true,
      reason: 'authorized',
      state: nextState,
      attemptIdentity: authorizedAttemptIdentity,
      claimRequired,
      ...(definitionReconciliationBinding
        ? { definitionReconciliation: definitionReconciliationBinding }
        : {}),
    };
  }
  validateRunState(nextState);
  return consumed
    ? {
      authorized: true,
      reason: 'authorized',
      state: nextState,
      attemptIdentity: completionApproachContextV2(
        nextState,
        nextPending.find((entry) => targetKey(entry.target) === targetKey(target)),
      ).attemptIdentity,
      claimRequired: lightweightClaimRequiredV2(inspection, target),
      ...(definitionReconciliationBinding
        ? { definitionReconciliation: definitionReconciliationBinding }
        : {}),
    }
    : {
      authorized: true,
      reason: 'authorized',
      state: nextState,
      ...(definitionReconciliationBinding
        ? { definitionReconciliation: definitionReconciliationBinding }
        : {}),
    };
}

/** Derive claim need from fresh Inspection task facts, never from a caller claim. @param {Record<string, unknown>} inspection @param {Record<string, unknown>} target */
function lightweightClaimRequiredV2(inspection, target) {
  if (target.lane !== 'lightweight') return true;
  return freshLightweightTaskFactsV2(inspection, target).glyph !== '~';
}

export function authorizeAttempt(stateValue, targetValue, rawInputs, assessmentValue, mode, dependencies) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  const target = /** @type {Record<string, unknown>} */ (validateTarget(targetValue));
  const policyMode = /** @type {string} */ (/** @type {Record<string, unknown>} */ (state.policy).mode);
  const inspection = buildInspection(target, collectEvidence(target, rawInputs, dependencies, policyMode));
  return authorizeInspectedAttempt(state, target, inspection, assessmentValue, mode);
}

/** @param {string} action @param {Record<string, unknown>} target */
function expectedResultRoute(action, target) {
  if (action === 'execute-task' || action === 'retry-task') return `${target.lane}-task`;
  return ACTION_ROUTES[action];
}

/**
 * @param {Record<string, unknown>} pending
 * @param {unknown} value
 * @returns {{outcome:string,changedTargets:string[],checks:{verification:string,lint:string,review:string},blockers:Record<string, unknown>[]} | null}
 */
function normalizeCompletionResult(pending, value) {
  const result = assertExactRecord(
    value,
    ['target', 'route', 'outcome', 'operations', 'changedTargets', 'checks'],
    [],
    'completion result',
  );
  if (!validateCompletionTarget(result.target, 'completion result target')) return null;
  assertUnicodeScalarString(result.route, 'completion result.route');
  assertEnum(result.outcome, OUTCOMES, 'completion result.outcome');
  const operations = /** @type {string[]} */ (assertSortedUniqueStrings(
    result.operations,
    assertMaterialIdentifier,
    'completion result.operations',
  ));
  const changedTargets = /** @type {string[]} */ (assertSortedUniqueStrings(
    result.changedTargets,
    assertMaterialTarget,
    'completion result.changedTargets',
  ));
  const checks = assertExactRecord(
    result.checks,
    ['verification', 'lint', 'review'],
    [],
    'completion result.checks',
  );
  assertEnum(checks.verification, CHECK_STATES, 'completion result.checks.verification');
  assertEnum(checks.lint, CHECK_STATES, 'completion result.checks.lint');
  assertEnum(checks.review, REVIEW_STATES, 'completion result.checks.review');

  const pendingTarget = /** @type {Record<string, unknown>} */ (pending.target);
  const inputs = /** @type {Record<string, unknown>} */ (pending.materialInputs);
  const expectedChecks = requiredChecksForAction[
    /** @type {keyof typeof requiredChecksForAction} */ (pending.action)
  ];
  const suppliedChecks = COMPLETION_CHECKS.filter((check) => checks[check] !== 'none');
  const interrupted = result.outcome === 'interrupted';
  if (targetKey(result.target) !== targetKey(pendingTarget)
    || result.route !== expectedResultRoute(/** @type {string} */ (pending.action), pendingTarget)
    || canonicalJson(operations) !== canonicalJson(inputs.operations)
    || changedTargets.some((target) => !/** @type {string[]} */ (inputs.targets).includes(target))
    || (interrupted && (changedTargets.length > 0 || suppliedChecks.length > 0))
    || (!interrupted && suppliedChecks.some((check) => !expectedChecks.includes(check)))
    || (['succeeded', 'no-change'].includes(/** @type {string} */ (result.outcome))
      && expectedChecks.some((check) => !suppliedChecks.includes(check)))
    || (result.outcome === 'no-change' && changedTargets.length > 0)) {
    return null;
  }

  const evidence = /** @type {string} */ (pending.evidenceHash);
  /** @type {Record<string, unknown>[]} */
  const blockers = [];
  if (checks.verification === 'failed') {
    blockers.push({ code: 'verification-failed', subject: 'verification', evidenceHash: evidence });
  }
  if (checks.lint === 'failed') {
    blockers.push({ code: 'verification-failed', subject: 'lint', evidenceHash: evidence });
  }
  if (checks.review === 'rejected') {
    blockers.push({ code: 'review-rejected', subject: 'review', evidenceHash: evidence });
  }
  blockers.sort(compareBlockers);
  const outcome = blockers.some((blocker) => blocker.code === 'verification-failed')
    ? 'failed'
    : blockers.some((blocker) => blocker.code === 'review-rejected')
      ? 'blocked'
      : /** @type {string} */ (result.outcome);
  return {
    outcome,
    changedTargets,
    checks: {
      verification: /** @type {string} */ (checks.verification),
      lint: /** @type {string} */ (checks.lint),
      review: /** @type {string} */ (checks.review),
    },
    blockers,
  };
}

/** @param {Record<string, unknown>} state @param {string} reason */
function completionRefusal(state, reason) {
  return { completed: false, reason, state };
}

/** @param {unknown} value @param {string} [label] */
function validateCompletionTarget(value, label = 'completion target') {
  const target = assertExactRecord(value, ['specPath', 'lane'], ['taskKey', 'issueId'], label);
  if (target.lane === 'tracked' && Object.hasOwn(target, 'taskKey')) {
    invalid(`${label}.taskKey`, 'is forbidden for tracked completion');
  }
  validateTarget(target);
  return (target.lane === 'lightweight' && Object.hasOwn(target, 'taskKey'))
    || (target.lane === 'tracked' && Object.hasOwn(target, 'issueId'));
}

/**
 * Consume and record one exact pending authorization.
 * @param {unknown} stateValue
 * @param {unknown} inputValue
 */
export function completeAttempt(stateValue, inputValue) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  const input = assertExactRecord(
    inputValue,
    ['target', 'evidenceHash', 'approachHash', 'result'],
    [],
    'completion input',
  );
  if (!validateCompletionTarget(input.target)) return completionRefusal(state, 'pending-not-found');
  assertHash(input.evidenceHash, 'completion input.evidenceHash');
  assertHash(input.approachHash, 'completion input.approachHash');
  const pending = /** @type {Record<string, unknown>[]} */ (state.pending);
  const selectedIndex = pending.findIndex((entry) => (
    targetKey(entry.target) === targetKey(input.target)
    && entry.evidenceHash === input.evidenceHash
    && entry.approachHash === input.approachHash
  ));
  if (selectedIndex < 0) return completionRefusal(state, 'pending-not-found');
  const selected = pending[selectedIndex];
  const normalized = normalizeCompletionResult(selected, input.result);
  if (!normalized) return completionRefusal(state, 'action-mismatch');

  const normalizedHash = resultHash(normalized);
  const completed = /** @type {Record<string, unknown>[]} */ (state.completed);
  const repeatedEntry = completed.find((entry) => (
    entry.evidenceHash === input.evidenceHash && entry.resultHash === normalizedHash
  ));
  if (repeatedEntry
    && /** @type {Record<string, unknown>} */ (state.policy).mode === 'autonomous') {
    if (Object.hasOwn(state, 'pendingCompletion')) {
      return completionRefusal(state, 'occurrence-retention-conflict');
    }
    if (Object.hasOwn(state, 'learningGovernance')) {
      return completionRefusal(state, 'learning-governance-conflict');
    }
    const pendingCompletion = {
      version: 1,
      target: { .../** @type {Record<string, unknown>} */ (input.target) },
      evidenceHash: input.evidenceHash,
      approachHash: input.approachHash,
      resultHash: normalizedHash,
      priorApproachHash: repeatedEntry.approachHash,
    };
    const learningGovernance = {
      version: 1,
      target: { .../** @type {Record<string, unknown>} */ (input.target) },
      phase: 'required',
      revision: 1,
      triggerEvidenceHash: pendingCompletionSealHash(pendingCompletion),
    };
    const sealedState = carryOptionalRunState(state, {
      policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
      overallUsed: state.overallUsed,
      recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
      pending: pending.filter((_, index) => index !== selectedIndex).map(copyPendingEntry),
      completed: completed.map((entry) => ({ ...entry })),
    });
    sealedState.pendingCompletion = pendingCompletion;
    sealedState.learningGovernance = learningGovernance;
    validateRunState(sealedState);
    return {
      completed: false,
      reason: 'learning-required',
      result: normalized,
      state: sealedState,
    };
  }
  const nextState = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: pending.filter((_, index) => index !== selectedIndex).map(copyPendingEntry),
    completed: [
      ...completed.map((entry) => ({ ...entry })),
      {
        evidenceHash: input.evidenceHash,
        approachHash: input.approachHash,
        resultHash: normalizedHash,
      },
    ],
  });
  validateRunState(nextState);
  let reason = normalized.outcome;
  if (repeatedEntry) reason = 'no-progress';
  else if (normalized.blockers.some((blocker) => blocker.code === 'verification-failed')) {
    reason = 'verification-failed';
  } else if (normalized.blockers.some((blocker) => blocker.code === 'review-rejected')) {
    reason = 'review-rejected';
  } else if (normalized.outcome === 'succeeded') reason = 'completed';
  return {
    completed: reason === 'completed',
    reason,
    result: normalized,
    state: nextState,
  };
}

/**
 * Autonomous-continuation license for a routine recoverable checkpoint.
 *
 * Fail-closed and non-throwing: it returns `true` only for an authorized
 * transition whose sole pending authorization is a recovery attempt in an
 * `autonomous` policy. Safety theorem:
 *
 *   mayContinueAutonomously(o) === true
 *     ⇒ o.authorized === true ⇒ o.reason === 'authorized'.
 *
 * Because it is gated on `authorized === true`, it can never return `true` on
 * any hard-stop, budget, learning, or guard refusal. It licenses skipping only
 * the user-approval ask; it does NOT bypass mandatory verification or the
 * independent review that `completeAttempt` and the reviewer still enforce.
 *
 * @param {unknown} outcome
 * @returns {boolean}
 */
export function mayContinueAutonomously(outcome) {
  if (!outcome || /** @type {Record<string, unknown>} */ (outcome).authorized !== true) return false;
  let state;
  try {
    state = /** @type {Record<string, unknown>} */ (
      validateRunState(/** @type {Record<string, unknown>} */ (outcome).state)
    );
  } catch {
    return false;
  }
  const policy = /** @type {Record<string, unknown>} */ (state.policy);
  const pending = /** @type {Record<string, unknown>[]} */ (state.pending);
  return policy.mode === 'autonomous'
    && pending.length === 1
    && pending[0].mode === 'recovery';
}

/**
 * Total classification of every authorization and completion outcome reason
 * into its stop category. Frozen and exhaustive over the real reason domain
 * (`BLOCKER_CODES` ∪ the authorization-only refusals ∪ `'authorized'`).
 * @type {Readonly<Record<string, 'authorized' | 'hard-stop' | 'recoverable-checkpoint' | 'budget-stop' | 'learning-stop' | 'guard-stop'>>}
 */
export const OUTCOME_REASON_CLASSES = Object.freeze({
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
  'learning-required': 'learning-stop',
  'learning-governance-capacity': 'learning-stop',
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

/**
 * Classify one outcome reason. Throws on any reason outside the frozen domain.
 * @param {unknown} reason
 * @returns {'authorized' | 'hard-stop' | 'recoverable-checkpoint' | 'budget-stop' | 'learning-stop' | 'guard-stop'}
 */
export function classifyOutcomeReason(reason) {
  if (typeof reason !== 'string' || !Object.hasOwn(OUTCOME_REASON_CLASSES, reason)) {
    invalid('OutcomeReason', 'is not a known authorization or completion reason');
  }
  return OUTCOME_REASON_CLASSES[/** @type {keyof typeof OUTCOME_REASON_CLASSES} */ (reason)];
}

/**
 * Sequential post-stop scheduling license for autonomous work.
 *
 * Fail-closed and non-throwing (exactly like `mayContinueAutonomously`): any
 * thrown validation or any unmet gate yields `false`. It mutates nothing and
 * authorizes nothing. It returns `true` only when the current authorized
 * bounded recovery attempt has already finished — the `stopped` work reached a
 * hard stop with an empty pending queue under an `autonomous` policy — and one
 * board-ready `candidate` is provably independent of it: a distinct task, a
 * disjoint change set, and no direct dependency on the stopped target.
 *
 * It never fans out and holds no concurrency: it only LICENSES a single
 * candidate for consideration. Actual dispatch still flows through the
 * unchanged `authorizeAttempt`, which re-enforces `not-dispatchable` while any
 * authorization is pending.
 *
 * Revisiting a blocked task is intentionally not decided here: the unchanged
 * `authorizeInspectedAttempt` already refuses a repeat without new evidence
 * (`evidence-drift`) or a materially different approach (`no-progress` /
 * `prior-no-progress`).
 *
 * @param {unknown} stopped `{ outcome, target, changeSet }` for the hard-stopped work,
 *   where `outcome` is its authorize/complete outcome, `target` is the task that
 *   stopped, and `changeSet` is that work's `materialInputs.targets`.
 * @param {unknown} candidate `{ target, changeSet, deps }` for a board-ready task,
 *   where `changeSet` is its assessed `materialInputs.targets` and `deps` is its
 *   declared direct dependency ids exactly as the board parsed them (`Task.deps`).
 * @returns {boolean}
 */
export function mayScheduleAfterStop(stopped, candidate) {
  try {
    const stoppedRecord = assertExactRecord(stopped, ['outcome', 'target', 'changeSet'], [], 'stopped');
    const candidateRecord = assertExactRecord(candidate, ['target', 'changeSet', 'deps'], [], 'candidate');
    const outcome = assertRecord(stoppedRecord.outcome, 'stopped.outcome');
    assertUnicodeScalarString(outcome.reason, 'stopped.outcome.reason');
    if (!Object.hasOwn(outcome, 'state')) return false;

    validateTarget(stoppedRecord.target);
    validateTarget(candidateRecord.target);
    const stoppedTarget = /** @type {Record<string, unknown>} */ (stoppedRecord.target);
    const candidateTarget = /** @type {Record<string, unknown>} */ (candidateRecord.target);
    if (isFeatureTarget(stoppedTarget) || isFeatureTarget(candidateTarget)) return false;

    const stoppedChangeSet = /** @type {string[]} */ (
      assertSortedUniqueStrings(stoppedRecord.changeSet, assertMaterialTarget, 'stopped.changeSet')
    );
    const candidateChangeSet = /** @type {string[]} */ (
      assertSortedUniqueStrings(candidateRecord.changeSet, assertMaterialTarget, 'candidate.changeSet')
    );
    const deps = assertDenseDataArray(candidateRecord.deps, 'candidate.deps');
    deps.forEach((dep, index) => assertUnicodeScalarString(dep, `candidate.deps[${index}]`));

    validateRunState(outcome.state);
    const state = /** @type {Record<string, unknown>} */ (outcome.state);
    const policy = /** @type {Record<string, unknown>} */ (state.policy);
    if (policy.mode !== 'autonomous') return false;

    if (classifyOutcomeReason(outcome.reason) !== 'hard-stop') return false;

    if (/** @type {unknown[]} */ (state.pending).length !== 0) return false;

    if (targetKey(candidateTarget) === targetKey(stoppedTarget)) return false;

    const stoppedTargets = new Set(stoppedChangeSet);
    for (const target of candidateChangeSet) {
      if (stoppedTargets.has(target)) return false;
    }

    const canonicalStopped = /** @type {Record<string, unknown>} */ (canonicalTarget(stoppedTarget));
    const durableId = canonicalStopped.taskKey ?? canonicalStopped.issueId;
    if (deps.includes(durableId)) return false;

    return true;
  } catch {
    return false;
  }
}

/** @param {string} token @param {string} option @param {boolean} allowUnlimited */
function parsePositiveOption(token, option, allowUnlimited) {
  if (allowUnlimited && token === 'unlimited') return token;
  if (!/^[1-9][0-9]*$/.test(token)) invalid(option, 'requires a positive ASCII safe integer or unlimited');
  const value = Number(token);
  if (!Number.isSafeInteger(value)) invalid(option, 'requires a positive ASCII safe integer or unlimited');
  return value;
}

/** Parse tokens following `work`. @param {string[]} argv */
export function parseInvocation(argv) {
  const tokens = /** @type {string[]} */ (assertDenseDataArray(argv, 'argv'));
  tokens.forEach((token, index) => {
    assertUnicodeScalarString(token, `argv[${index}]`);
  });
  let feature;
  let index = 0;
  if (tokens.length > 0 && !tokens[0].startsWith('-')) {
    if (tokens[0].length === 0) invalid('feature selector', 'must not be empty');
    feature = tokens[0];
    index = 1;
  }
  if (index < tokens.length && !tokens[index].startsWith('-')) {
    invalid('feature selector', 'may appear at most once and only before flags');
  }

  /** @type {number | 'unlimited'} */
  let overall = 3;
  /** @type {number | 'unlimited'} */
  let recovery = 1;
  let recover = false;
  let untilBlocked = false;
  let mode = 'guarded';
  let explicitMax = false;
  const seen = new Set();
  while (index < tokens.length) {
    const option = tokens[index];
    if (!option.startsWith('-')) invalid('feature selector', 'must appear before all flags');
    if (!['--max', '--recover-on-block', '--recovery-cycles', '--until', '--policy'].includes(option)) {
      invalid('option', `is unknown: ${option}`);
    }
    if (seen.has(option)) invalid('option', `must not be repeated: ${option}`);
    seen.add(option);
    index += 1;
    if (option === '--recover-on-block') {
      recover = true;
      continue;
    }
    const token = tokens[index];
    if (token === undefined || token.startsWith('--')) invalid(option, 'requires a value');
    index += 1;
    if (option === '--until') {
      if (token !== 'blocked') invalid('--until', "accepts only 'blocked'");
      untilBlocked = true;
    } else if (option === '--max') {
      overall = parsePositiveOption(token, option, true);
      explicitMax = true;
    } else if (option === '--recovery-cycles') {
      recovery = parsePositiveOption(token, option, true);
    } else if (option === '--policy') {
      if (token !== 'guarded' && token !== 'autonomous') invalid('--policy', "accepts only 'guarded' or 'autonomous'");
      mode = token;
    }
  }
  if (seen.has('--recovery-cycles') && !recover) {
    invalid('--recovery-cycles', 'requires --recover-on-block');
  }
  if (recover && untilBlocked) invalid('options', 'cannot combine recovery with --until blocked');
  if (untilBlocked && !explicitMax) overall = 25;
  const policy = { overall, recovery, recover, untilBlocked, mode };
  return feature === undefined ? { policy } : { feature, policy };
}

/** @param {unknown} value @param {string} label */
function validateTransportByteEnvelope(value, label) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  const envelope = assertExactRecord(value, ['base64'], [], `${label} byte envelope`);
  assertUnicodeScalarString(envelope.base64, `${label} byte envelope.base64`);
  return value;
}

/** @param {unknown} value @param {string} label */
function preflightTransportBytes(value, label) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    if (value.byteLength > MAX_SOURCE_BODY_BYTES) {
      invalid(`${label} captured source body`, `exceeds the individual source body resource limit of ${MAX_SOURCE_BODY_BYTES} bytes`);
    }
    return;
  }
  const envelope = validateTransportByteEnvelope(value, label);
  const encoded = /** @type {string} */ (envelope.base64);
  if (!BASE64_PATTERN.test(encoded)) {
    invalid(`${label} byte envelope.base64`, 'must be canonical padded RFC4648 base64');
  }
  const hasNoncanonicalPadBits = encoded.endsWith('==')
    ? !/[AQgw]==$/.test(encoded)
    : encoded.endsWith('=') && !/[AEIMQUYcgkosw048]=$/.test(encoded);
  if (hasNoncanonicalPadBits) {
    invalid(`${label} byte envelope.base64`, 'must round-trip as canonical padded RFC4648 base64');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedLength = (encoded.length / 4) * 3 - padding;
  if (decodedLength > MAX_SOURCE_BODY_BYTES) {
    invalid(`${label} captured source body`, `exceeds the individual source body resource limit of ${MAX_SOURCE_BODY_BYTES} bytes`);
  }
}

/** @param {unknown} value @param {string} label @param {{used:number}} budget */
function decodeTransportBytes(value, label, budget) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    chargeBodyLength(value.byteLength, `${label} captured source body`, budget);
    const internal = byteSequence(value);
    return Buffer.from(/** @type {Buffer} */ (internal));
  }
  const envelope = validateTransportByteEnvelope(value, label);
  const encoded = /** @type {string} */ (envelope.base64);
  if (!BASE64_PATTERN.test(encoded)) invalid(`${label} byte envelope.base64`, 'must be canonical padded RFC4648 base64');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedLength = (encoded.length / 4) * 3 - padding;
  chargeBodyLength(decodedLength, `${label} captured source body`, budget);
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) {
    invalid(`${label} byte envelope.base64`, 'must round-trip as canonical padded RFC4648 base64');
  }
  return decoded;
}

/** @param {unknown} value @param {string} label @param {boolean} [preflight] */
function decodeTransportInput(value, label, preflight = true) {
  const input = assertExactRecord(
    value,
    ['root', 'specPath', 'target', 'lane'],
    ['currentRun', 'review', 'verification', 'lint', 'session', 'policyMode'],
    label,
  );
  if (Object.hasOwn(input, 'policyMode')) {
    assertEnum(input.policyMode, ['guarded', 'autonomous'], `${label}.policyMode`);
  }
  const policyMode = /** @type {string} */ (input.policyMode ?? 'guarded');
  const lane = assertRecord(input.lane, `${label}.lane`);
  if (lane.kind === 'tracked') {
    assertExactRecord(lane, ['kind', 'listBytes', 'issues'], [], `${label}.lane`);
    assertDenseDataArrayLength(lane.issues, `${label}.lane.issues`);
  } else {
    assertExactRecord(lane, ['kind'], [], `${label}.lane`);
  }
  assertSourceEntryLimit(input, 0, label, policyMode);
  if (lane.kind === 'tracked') {
    const issues = assertDenseDataArray(lane.issues, `${label}.lane.issues`);
    for (let index = 0; index < issues.length; index += 1) {
      assertExactRecord(
        issues[index],
        ['detailBytes', 'historyBytes'],
        [],
        `${label}.lane.issues[${index}]`,
      );
    }
  }
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(input, field)) continue;
    const entries = assertDenseDataArray(input[field], `${label}.${field}`);
    for (let index = 0; index < entries.length; index += 1) {
      const capture = assertExactRecord(
        entries[index],
        ['target', 'state', 'outcomeHash', 'bytes'],
        [],
        `${label}.${field}[${index}]`,
      );
    }
  }
  if (Object.hasOwn(input, 'session')) {
    const session = assertExactRecord(
      input.session,
      ['target', 'availability'],
      ['bytes'],
      `${label}.session`,
    );
  }
  if (!preflight) return input;
  if (lane.kind === 'tracked') {
    preflightTransportBytes(lane.listBytes, `${label}.lane.listBytes`);
    const issues = assertDenseDataArray(lane.issues, `${label}.lane.issues`);
    for (let index = 0; index < issues.length; index += 1) {
      const issue = /** @type {Record<string, unknown>} */ (issues[index]);
      preflightTransportBytes(issue.detailBytes, `${label}.lane.issues[${index}].detailBytes`);
      preflightTransportBytes(issue.historyBytes, `${label}.lane.issues[${index}].historyBytes`);
    }
  }
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(input, field)) continue;
    const entries = assertDenseDataArray(input[field], `${label}.${field}`);
    for (let index = 0; index < entries.length; index += 1) {
      const capture = /** @type {Record<string, unknown>} */ (entries[index]);
      preflightTransportBytes(capture.bytes, `${label}.${field}[${index}].bytes`);
    }
  }
  if (Object.hasOwn(input, 'session')) {
    const session = /** @type {Record<string, unknown>} */ (input.session);
    if (session.availability === 'available' && Object.hasOwn(session, 'bytes')) {
      preflightTransportBytes(session.bytes, `${label}.session.bytes`);
    }
  }
  return input;
}

/** @param {Record<string, unknown>} input @param {string} label @param {{used:number}} budget */
function materializeTransportInput(input, label, budget) {
  const lane = /** @type {Record<string, unknown>} */ (input.lane);
  let decodedLane;
  if (lane.kind === 'tracked') {
    const issues = assertDenseDataArray(lane.issues, `${label}.lane.issues`);
    const listBytes = decodeTransportBytes(lane.listBytes, `${label}.lane.listBytes`, budget);
    decodedLane = {
      kind: 'tracked',
      listBytes,
      issues: issues.map((entry, index) => {
        const issue = /** @type {Record<string, unknown>} */ (entry);
        const detailBytes = decodeTransportBytes(
          issue.detailBytes,
          `${label}.lane.issues[${index}].detailBytes`,
          budget,
        );
        const historyBytes = decodeTransportBytes(
          issue.historyBytes,
          `${label}.lane.issues[${index}].historyBytes`,
          budget,
        );
        return { detailBytes, historyBytes };
      }),
    };
  } else {
    decodedLane = { kind: lane.kind };
  }
  const decoded = {
    root: input.root,
    specPath: input.specPath,
    target: input.target,
    lane: decodedLane,
  };
  for (const field of ['currentRun', 'review', 'verification', 'lint']) {
    if (!Object.hasOwn(input, field)) continue;
    const entries = assertDenseDataArray(input[field], `${label}.${field}`);
    decoded[field] = entries.map((entry, index) => {
      const capture = /** @type {Record<string, unknown>} */ (entry);
      const bytes = decodeTransportBytes(capture.bytes, `${label}.${field}[${index}].bytes`, budget);
      return {
        target: capture.target,
        state: capture.state,
        outcomeHash: capture.outcomeHash,
        bytes,
      };
    });
  }
  if (Object.hasOwn(input, 'session')) {
    const session = /** @type {Record<string, unknown>} */ (input.session);
    let acquireBytes = false;
    try {
      acquireBytes = session.availability === 'available'
        && Object.hasOwn(session, 'bytes')
        && sameCapturedTarget(session.target, input.target);
    } catch {
      acquireBytes = false;
    }
    decoded.session = {
      target: session.target,
      availability: session.availability,
      ...(Object.hasOwn(session, 'bytes')
        ? {
            bytes: acquireBytes
              ? decodeTransportBytes(session.bytes, `${label}.session.bytes`, budget)
              : Buffer.alloc(0),
          }
        : {}),
    };
  }
  return decoded;
}

// === Feature 009 (T003): public learning and exact projection batches =======
// Command-reachable two-stage completion, `learn`, and the projection
// transitions. RunState keeps hash-only ProjectionCommitmentV1 values; exact
// ProjectionBatchV1 bodies travel only in responses and subsequent requests.
// Every fresh Inspection stays the earlier call-local fail-closed gate, and
// every trigger, failed set, alternative, and branch value is recomputed from
// the fresh trusted envelopes and authoritative surfaces instead of being
// trusted from RunState, history, or the caller.

const V2_CHANGED_DIMENSIONS = Object.freeze([
  'material-input', 'mechanism', 'assumption', 'evidence-acquisition', 'validation-plan',
]);
const V2_LEARNING_OUTCOMES = Object.freeze(['selected-alternative', 'no-progress']);
const V2_ALTERNATIVE_DISPOSITIONS = Object.freeze([
  'credible-material', 'not-credible', 'not-materially-different',
]);
const MAX_EVENT_LINE_TEXT_BYTES = 16_402;
const MAX_EVENT_LINE_RECORD_BYTES = 16_403;

/** Exact `ProjectionBatchV1` bodies for one closed purpose. @param {string} purpose @param {Record<string, unknown>} target @param {Record<string, unknown>[]} events @param {string} label */
function buildProjectionBatchV1(purpose, target, events, label) {
  const commitment = projectionCommitmentForEventsV1(purpose, target, events, label);
  const batch = {
    version: 1,
    purpose,
    target: canonicalTarget(target),
    events: JSON.parse(canonicalJson(events)),
    eventCommitments: commitment.eventCommitments,
    batchIdentity: commitment.batchIdentity,
  };
  validateProjectionBatchV1(batch, label);
  return batch;
}

/** @param {unknown} value @param {string} [label] */
export function validateProjectionBatchV1(value, label = 'ProjectionBatchV1') {
  const batch = assertExactRecord(
    value,
    ['version', 'purpose', 'target', 'events', 'eventCommitments', 'batchIdentity'],
    [],
    label,
  );
  if (batch.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const events = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(batch.events, `${label}.events`)
  );
  const recomputed = projectionCommitmentForEventsV1(
    /** @type {string} */ (batch.purpose),
    /** @type {Record<string, unknown>} */ (batch.target),
    events,
    label,
  );
  validateProjectionCommitmentV1(
    { purpose: batch.purpose, batchIdentity: batch.batchIdentity, eventCommitments: batch.eventCommitments },
    `${label} commitment`,
  );
  if (canonicalJson(recomputed.eventCommitments) !== canonicalJson(batch.eventCommitments)
    || recomputed.batchIdentity !== batch.batchIdentity) {
    invalid(label, 'must carry the recomputed ordered event commitments and batch identity');
  }
  return value;
}

/** @param {Record<string, unknown>} batch */
function projectionCommitmentOfBatchV1(batch) {
  return {
    purpose: batch.purpose,
    batchIdentity: batch.batchIdentity,
    eventCommitments: JSON.parse(canonicalJson(batch.eventCommitments)),
  };
}

/** Require one caller-supplied batch to equal the stored hash-only commitment. @param {unknown} value @param {Record<string, unknown>} target @param {Record<string, unknown>} commitment @param {string} label */
function requireExactProjectionBatchV1(value, target, commitment, label) {
  const batch = /** @type {Record<string, unknown>} */ (validateProjectionBatchV1(value, label));
  if (targetKey(batch.target) !== targetKey(target)) {
    invalid(`${label}.target`, 'must be the exact committed affected target');
  }
  if (batch.purpose !== commitment.purpose
    || batch.batchIdentity !== commitment.batchIdentity
    || canonicalJson(batch.eventCommitments) !== canonicalJson(commitment.eventCommitments)) {
    invalid(label, 'must exactly match the stored ordered batch commitment');
  }
  return batch;
}

/** Accept the exact response-carried finalize batch; only the in-process helper route also accepts its bare ordered bodies. @param {unknown} value @param {Record<string, unknown>} pendingCompletion @param {boolean} publicRoute */
function finalizeOccurrenceEventBodiesV2(value, pendingCompletion, publicRoute) {
  if (!publicRoute && Array.isArray(value)) return value;
  return /** @type {Record<string, unknown>} */ (requireExactProjectionBatchV1(
    value,
    /** @type {Record<string, unknown>} */ (pendingCompletion.target),
    /** @type {Record<string, unknown>} */ (pendingCompletion.retention),
    'finalizeCompletionV2 projectionBatch',
  )).events;
}

/** @param {unknown} value @param {string} [label] */
export function validateLearningFindingV1(value, label = 'LearningFindingV1') {
  const finding = assertExactRecord(
    value,
    ['version', 'findingIdentity', 'statement', 'evidenceIdentities', 'assumptionIdentities'],
    [],
    label,
  );
  if (finding.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(finding.findingIdentity, `${label}.findingIdentity`);
  assertFindingText(finding.statement, `${label}.statement`);
  validateV2HashSet(finding.evidenceIdentities, `${label}.evidenceIdentities`, 1, 16);
  validateV2HashSet(finding.assumptionIdentities, `${label}.assumptionIdentities`, 0, 16);
  const expected = sha256(canonicalJson({
    version: 1,
    statement: finding.statement,
    evidenceIdentities: finding.evidenceIdentities,
    assumptionIdentities: finding.assumptionIdentities,
  }));
  if (finding.findingIdentity !== expected) {
    invalid(`${label}.findingIdentity`, 'must equal the recomputed complete finding identity');
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function validateChangedDimensionsV1(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length < 1 || rows.length > 5) invalid(label, 'must contain 1 through 5 changed dimensions');
  rows.forEach((row, index) => assertEnum(row, V2_CHANGED_DIMENSIONS, `${label}[${index}]`));
  for (let index = 1; index < rows.length; index += 1) {
    if (V2_CHANGED_DIMENSIONS.indexOf(/** @type {string} */ (rows[index - 1]))
      >= V2_CHANGED_DIMENSIONS.indexOf(/** @type {string} */ (rows[index]))) {
      invalid(label, 'must use the closed dimension order without duplicates');
    }
  }
  return rows;
}

/** @param {unknown} value @param {string} label */
function validateComparisonRowsV1(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length < 1 || rows.length > 16) invalid(label, 'must contain 1 through 16 rows');
  let sameCount = 0;
  rows.forEach((row, index) => {
    const rowLabel = `${label}[${index}]`;
    const outcome = assertRecord(row, rowLabel).outcome;
    assertEnum(outcome, ['same', 'different'], `${rowLabel}.outcome`);
    const comparison = outcome === 'same'
      ? assertExactRecord(row, ['failedApproachBasisIdentity', 'outcome', 'evidenceIdentities'], [], rowLabel)
      : assertExactRecord(row, ['failedApproachBasisIdentity', 'outcome', 'changedDimensions', 'evidenceIdentities'], [], rowLabel);
    assertHash(comparison.failedApproachBasisIdentity, `${rowLabel}.failedApproachBasisIdentity`);
    if (outcome === 'different') validateChangedDimensionsV1(comparison.changedDimensions, `${rowLabel}.changedDimensions`);
    else sameCount += 1;
    validateV2HashSet(comparison.evidenceIdentities, `${rowLabel}.evidenceIdentities`, 1, 16);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (rows[index - 1]).failedApproachBasisIdentity),
      /** @type {string} */ (comparison.failedApproachBasisIdentity),
    ) >= 0) invalid(label, 'must be sorted by failedApproachBasisIdentity and duplicate-free');
  });
  return { rows, sameCount };
}

/** @param {unknown} value @param {string} label */
function validateMaterialDifferenceRowsV1(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length < 1 || rows.length > 16) invalid(label, 'must contain 1 through 16 rows');
  rows.forEach((row, index) => {
    const rowLabel = `${label}[${index}]`;
    const difference = assertExactRecord(
      row,
      ['failedApproachBasisIdentity', 'changedDimensions', 'evidenceIdentities'],
      [],
      rowLabel,
    );
    assertHash(difference.failedApproachBasisIdentity, `${rowLabel}.failedApproachBasisIdentity`);
    validateChangedDimensionsV1(difference.changedDimensions, `${rowLabel}.changedDimensions`);
    validateV2HashSet(difference.evidenceIdentities, `${rowLabel}.evidenceIdentities`, 1, 16);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (rows[index - 1]).failedApproachBasisIdentity),
      /** @type {string} */ (difference.failedApproachBasisIdentity),
    ) >= 0) invalid(label, 'must be sorted by failedApproachBasisIdentity and duplicate-free');
  });
  return rows;
}

/** @param {unknown} value @param {string} [label] */
export function validateAlternativeV2(value, label = 'AlternativeV2') {
  const disposition = assertRecord(value, label).disposition;
  assertEnum(disposition, V2_ALTERNATIVE_DISPOSITIONS, `${label}.disposition`);
  const credible = disposition === 'credible-material';
  const alternative = credible
    ? assertExactRecord(value, ['version', 'alternativeIdentity', 'disposition', 'approachBasis', 'approachBasisIdentity', 'failedApproachSetIdentity', 'materialDifferences', 'discriminatingCheck', 'semanticAssessmentIdentity'], [], label)
    : assertExactRecord(value, ['version', 'alternativeIdentity', 'disposition', 'approachBasis', 'approachBasisIdentity', 'failedApproachSetIdentity', 'comparisons', 'semanticAssessmentIdentity', 'reason'], [], label);
  if (alternative.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  assertHash(alternative.alternativeIdentity, `${label}.alternativeIdentity`);
  validateApproachBasisV1(alternative.approachBasis, `${label}.approachBasis`);
  assertHash(alternative.approachBasisIdentity, `${label}.approachBasisIdentity`);
  if (alternative.approachBasisIdentity !== sha256(canonicalJson(alternative.approachBasis))) {
    invalid(`${label}.approachBasisIdentity`, 'must equal the recomputed complete approach basis identity');
  }
  assertHash(alternative.failedApproachSetIdentity, `${label}.failedApproachSetIdentity`);
  assertHash(alternative.semanticAssessmentIdentity, `${label}.semanticAssessmentIdentity`);
  /** @type {Record<string, unknown>} */
  let identityBody;
  if (credible) {
    const materialDifferences = validateMaterialDifferenceRowsV1(
      alternative.materialDifferences,
      `${label}.materialDifferences`,
    );
    const check = assertExactRecord(
      alternative.discriminatingCheck,
      ['identity', 'definitionIdentity', 'evidenceIdentities'],
      [],
      `${label}.discriminatingCheck`,
    );
    assertHash(check.identity, `${label}.discriminatingCheck.identity`);
    assertHash(check.definitionIdentity, `${label}.discriminatingCheck.definitionIdentity`);
    validateV2HashSet(check.evidenceIdentities, `${label}.discriminatingCheck.evidenceIdentities`, 1, 16);
    if (check.identity !== sha256(canonicalJson({
      definitionIdentity: check.definitionIdentity,
      evidenceIdentities: check.evidenceIdentities,
    }))) invalid(`${label}.discriminatingCheck.identity`, 'must equal the recomputed discriminating check identity');
    identityBody = {
      version: 2,
      disposition,
      approachBasisIdentity: alternative.approachBasisIdentity,
      failedApproachSetIdentity: alternative.failedApproachSetIdentity,
      materialDifferences,
      discriminatingCheck: check,
      semanticAssessmentIdentity: alternative.semanticAssessmentIdentity,
    };
  } else {
    const comparisons = validateComparisonRowsV1(alternative.comparisons, `${label}.comparisons`);
    if (disposition === 'not-materially-different' && comparisons.sameCount < 1) {
      invalid(`${label}.comparisons`, 'not-materially-different requires at least one same comparison');
    }
    assertV2Identifier(alternative.reason, `${label}.reason`);
    identityBody = {
      version: 2,
      disposition,
      approachBasisIdentity: alternative.approachBasisIdentity,
      failedApproachSetIdentity: alternative.failedApproachSetIdentity,
      comparisons: comparisons.rows,
      semanticAssessmentIdentity: alternative.semanticAssessmentIdentity,
      reason: alternative.reason,
    };
  }
  if (alternative.alternativeIdentity !== sha256(canonicalJson(identityBody))) {
    invalid(`${label}.alternativeIdentity`, 'must equal the recomputed complete alternative identity');
  }
  return value;
}

/**
 * Bind one bounded alternative set to the exact current complete failed-approach
 * set: every row compares against every failed basis, and every credible row
 * differs materially from every one of them.
 * @param {unknown} value @param {Record<string, unknown>} failedApproachSet @param {string} label
 */
function requireCompleteFailedSetComparisonV2(value, failedApproachSet, label) {
  const set = /** @type {Record<string, unknown>} */ (
    validateFailedApproachSetV1(failedApproachSet, `${label} failedApproachSet`)
  );
  const bases = /** @type {string[]} */ (set.approachBasisIdentities);
  const rows = /** @type {Record<string, unknown>[]} */ (assertDenseDataArray(value, label));
  if (rows.length > 8) invalid(label, 'must contain at most 8 alternatives');
  rows.forEach((row, index) => {
    const rowLabel = `${label}[${index}]`;
    validateAlternativeV2(row, rowLabel);
    if (row.failedApproachSetIdentity !== set.setIdentity) {
      invalid(`${rowLabel}.failedApproachSetIdentity`, 'must bind the current complete failed-approach set');
    }
    if (canonicalJson(/** @type {Record<string, unknown>} */ (row.approachBasis).target)
      !== canonicalJson(set.target)) {
      invalid(`${rowLabel}.approachBasis.target`, 'must match the governed target');
    }
    const compared = /** @type {Record<string, unknown>[]} */ (
      row.disposition === 'credible-material' ? row.materialDifferences : row.comparisons
    ).map((entry) => entry.failedApproachBasisIdentity);
    if (canonicalJson(compared) !== canonicalJson(bases)) {
      invalid(rowLabel, 'must carry exactly one comparison for every current failed-approach basis');
    }
    if (row.disposition === 'credible-material'
      && bases.includes(/** @type {string} */ (row.approachBasisIdentity))) {
      invalid(`${rowLabel}.approachBasisIdentity`, 'must differ materially from every current failed approach');
    }
    if (index > 0 && compareUtf8(
      /** @type {string} */ (rows[index - 1].alternativeIdentity),
      /** @type {string} */ (row.alternativeIdentity),
    ) >= 0) invalid(label, 'must be sorted by alternativeIdentity and duplicate-free');
  });
  const credible = rows.filter((row) => row.disposition === 'credible-material');
  if (new Set(credible.map((row) => row.approachBasisIdentity)).size !== credible.length) {
    invalid(label, 'credible-material alternatives must all differ');
  }
  return { rows, credible, bases, set };
}

/** @param {unknown} value @param {string} [label] */
export function validateNoProgressProofV2(value, label = 'NoProgressProofV2') {
  const proof = assertExactRecord(
    value,
    ['version', 'failedApproachSetIdentity', 'completeEvidenceHash', 'alternativeSetHash', 'credibleMaterialAlternativeIdentities', 'noNewDistinguishingEvidenceHash', 'assumptionSetHash', 'proofIdentity'],
    [],
    label,
  );
  if (proof.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  for (const field of ['failedApproachSetIdentity', 'completeEvidenceHash', 'alternativeSetHash', 'noNewDistinguishingEvidenceHash', 'assumptionSetHash', 'proofIdentity']) {
    assertHash(proof[field], `${label}.${field}`);
  }
  if (assertDenseDataArray(proof.credibleMaterialAlternativeIdentities, `${label}.credibleMaterialAlternativeIdentities`).length !== 0) {
    invalid(`${label}.credibleMaterialAlternativeIdentities`, 'must be exactly the empty set');
  }
  if (proof.noNewDistinguishingEvidenceHash !== sha256(canonicalJson({
    failedApproachSetIdentity: proof.failedApproachSetIdentity,
    completeEvidenceHash: proof.completeEvidenceHash,
    distinguishingEvidenceIdentities: [],
  }))) invalid(`${label}.noNewDistinguishingEvidenceHash`, 'must equal the recomputed no-new-evidence hash');
  const { proofIdentity, ...withoutIdentity } = proof;
  if (proofIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.proofIdentity`, 'must equal the recomputed complete proof identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateNoProgressVerificationV2(value, label = 'NoProgressVerificationV2') {
  const verification = assertExactRecord(
    value,
    ['version', 'noProgressProofIdentity', 'failedApproachSetIdentity', 'preLearningEvidenceHash', 'postLearningEvidenceHash', 'expectedProjectionEventHashes', 'distinguishingEvidenceIdentities', 'noNewDistinguishingEvidenceHash', 'verificationIdentity'],
    [],
    label,
  );
  if (verification.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  for (const field of ['noProgressProofIdentity', 'failedApproachSetIdentity', 'preLearningEvidenceHash', 'postLearningEvidenceHash', 'noNewDistinguishingEvidenceHash', 'verificationIdentity']) {
    assertHash(verification[field], `${label}.${field}`);
  }
  const expected = assertDenseDataArray(verification.expectedProjectionEventHashes, `${label}.expectedProjectionEventHashes`);
  if (expected.length < 1 || expected.length > 17) invalid(`${label}.expectedProjectionEventHashes`, 'must contain 1 through 17 rows');
  expected.forEach((row, index) => assertHash(row, `${label}.expectedProjectionEventHashes[${index}]`));
  if (assertDenseDataArray(verification.distinguishingEvidenceIdentities, `${label}.distinguishingEvidenceIdentities`).length !== 0) {
    invalid(`${label}.distinguishingEvidenceIdentities`, 'must be exactly the empty set');
  }
  if (verification.noNewDistinguishingEvidenceHash !== sha256(canonicalJson({
    noProgressProofIdentity: verification.noProgressProofIdentity,
    failedApproachSetIdentity: verification.failedApproachSetIdentity,
    preLearningEvidenceHash: verification.preLearningEvidenceHash,
    postLearningEvidenceHash: verification.postLearningEvidenceHash,
    expectedProjectionEventHashes: expected,
    distinguishingEvidenceIdentities: [],
  }))) invalid(`${label}.noNewDistinguishingEvidenceHash`, 'must equal the recomputed no-new-evidence hash');
  const { verificationIdentity, ...withoutIdentity } = verification;
  if (verificationIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.verificationIdentity`, 'must equal the recomputed complete verification identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validatePostLearningInspectionBindingV1(value, label = 'PostLearningInspectionBindingV1') {
  const binding = assertExactRecord(
    value,
    ['version', 'target', 'governanceIdentity', 'repeatIdentity', 'reviewIdentity', 'failedApproachSetIdentity', 'projectionRef', 'evidenceHash', 'branchIdentity', 'expectedProjectionEventHashes', 'postLearningInspectionIdentity'],
    [],
    label,
  );
  if (binding.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateAffectedTargetV2(binding.target, `${label}.target`);
  for (const field of ['governanceIdentity', 'repeatIdentity', 'reviewIdentity', 'failedApproachSetIdentity', 'evidenceHash', 'branchIdentity', 'postLearningInspectionIdentity']) {
    assertHash(binding[field], `${label}.${field}`);
  }
  validateProjectionRefV1(binding.projectionRef, `${label}.projectionRef`);
  const expected = assertDenseDataArray(binding.expectedProjectionEventHashes, `${label}.expectedProjectionEventHashes`);
  if (expected.length < 1 || expected.length > 17) invalid(`${label}.expectedProjectionEventHashes`, 'must contain 1 through 17 rows');
  expected.forEach((row, index) => assertHash(row, `${label}.expectedProjectionEventHashes[${index}]`));
  const { postLearningInspectionIdentity, ...withoutIdentity } = binding;
  if (postLearningInspectionIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.postLearningInspectionIdentity`, 'must equal the recomputed complete binding identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateProjectionRefV1(value, label = 'ProjectionRefV1') {
  const ref = assertExactRecord(
    value,
    ['version', 'target', 'batchIdentity', 'eventHashes', 'currentRunProjectionIdentity', 'laneProjectionIdentity'],
    [],
    label,
  );
  if (ref.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  validateAffectedTargetV2(ref.target, `${label}.target`);
  for (const field of ['batchIdentity', 'currentRunProjectionIdentity', 'laneProjectionIdentity']) {
    assertHash(ref[field], `${label}.${field}`);
  }
  const hashes = assertDenseDataArray(ref.eventHashes, `${label}.eventHashes`);
  if (hashes.length < 1 || hashes.length > 17) invalid(`${label}.eventHashes`, 'must contain 1 through 17 rows');
  hashes.forEach((row, index) => assertHash(row, `${label}.eventHashes[${index}]`));
  return value;
}

/** @param {unknown} input */
export function buildLearningReviewEventV2(input) {
  const args = assertExactRecord(
    input,
    ['governanceIdentity', 'target', 'trigger', 'failedApproachSetIdentity', 'preLearningEvidenceHash', 'assumptionSetHash', 'findings', 'alternatives', 'outcome'],
    ['sequenceIdentity', 'selectedAlternativeIdentity', 'noProgressProof'],
    'buildLearningReviewEventV2',
  );
  const body = {
    governanceIdentity: args.governanceIdentity,
    target: canonicalTarget(validateAffectedTargetV2(args.target, 'buildLearningReviewEventV2.target')),
    ...(Object.hasOwn(args, 'sequenceIdentity') ? { sequenceIdentity: args.sequenceIdentity } : {}),
    trigger: args.trigger,
    failedApproachSetIdentity: args.failedApproachSetIdentity,
    preLearningEvidenceHash: args.preLearningEvidenceHash,
    assumptionSetHash: args.assumptionSetHash,
    findings: args.findings,
    alternatives: args.alternatives,
    outcome: args.outcome,
    ...(Object.hasOwn(args, 'selectedAlternativeIdentity')
      ? { selectedAlternativeIdentity: args.selectedAlternativeIdentity }
      : {}),
    ...(Object.hasOwn(args, 'noProgressProof') ? { noProgressProof: args.noProgressProof } : {}),
  };
  const eventWithoutHash = {
    type: 'learning-review',
    version: 2,
    reviewIdentity: sha256(canonicalJson(body)),
    ...body,
  };
  const event = finalizeV2Event(eventWithoutHash, 'LearningReviewEventV2');
  validateLearningReviewEventV2(event);
  return event;
}

/** @param {unknown} value @param {string} [label] */
export function validateLearningReviewEventV2(value, label = 'LearningReviewEventV2') {
  const event = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'reviewIdentity', 'governanceIdentity', 'target', 'trigger', 'failedApproachSetIdentity', 'preLearningEvidenceHash', 'assumptionSetHash', 'findings', 'alternatives', 'outcome'],
    ['sequenceIdentity', 'selectedAlternativeIdentity', 'noProgressProof'],
    label,
  );
  if (event.type !== 'learning-review') invalid(`${label}.type`, 'must be learning-review');
  if (event.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  const target = validateAffectedTargetV2(event.target, `${label}.target`);
  validateRepeatRelationshipV1(event.trigger, `${label}.trigger`);
  for (const field of ['eventHash', 'reviewIdentity', 'governanceIdentity', 'failedApproachSetIdentity', 'preLearningEvidenceHash', 'assumptionSetHash']) {
    assertHash(event[field], `${label}.${field}`);
  }
  if (event.governanceIdentity !== sha256(canonicalJson({
    version: 1,
    target,
    repeatIdentity: sha256(canonicalJson(event.trigger)),
  }))) invalid(`${label}.governanceIdentity`, 'must bind the exact target and Repeat Relationship');
  if (Object.hasOwn(event, 'sequenceIdentity')) assertHash(event.sequenceIdentity, `${label}.sequenceIdentity`);
  const findings = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(event.findings, `${label}.findings`)
  );
  if (findings.length < 1 || findings.length > 16) invalid(`${label}.findings`, 'must contain 1 through 16 findings');
  findings.forEach((finding, index) => {
    validateLearningFindingV1(finding, `${label}.findings[${index}]`);
    if (index > 0 && compareUtf8(
      /** @type {string} */ (findings[index - 1].findingIdentity),
      /** @type {string} */ (finding.findingIdentity),
    ) >= 0) invalid(`${label}.findings`, 'must be sorted by findingIdentity and duplicate-free');
  });
  const alternatives = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(event.alternatives, `${label}.alternatives`)
  );
  if (alternatives.length > 8) invalid(`${label}.alternatives`, 'must contain at most 8 alternatives');
  alternatives.forEach((alternative, index) => {
    validateAlternativeV2(alternative, `${label}.alternatives[${index}]`);
    if (alternative.failedApproachSetIdentity !== event.failedApproachSetIdentity) {
      invalid(`${label}.alternatives[${index}].failedApproachSetIdentity`, 'must bind the reviewed failed-approach set');
    }
    if (index > 0 && compareUtf8(
      /** @type {string} */ (alternatives[index - 1].alternativeIdentity),
      /** @type {string} */ (alternative.alternativeIdentity),
    ) >= 0) invalid(`${label}.alternatives`, 'must be sorted by alternativeIdentity and duplicate-free');
  });
  assertEnum(event.outcome, V2_LEARNING_OUTCOMES, `${label}.outcome`);
  const credible = alternatives.filter((alternative) => alternative.disposition === 'credible-material');
  if (event.outcome === 'selected-alternative') {
    if (Object.hasOwn(event, 'noProgressProof')) invalid(label, 'selected-alternative forbids a no-progress proof');
    assertHash(event.selectedAlternativeIdentity, `${label}.selectedAlternativeIdentity`);
    if (credible.filter((alternative) => alternative.alternativeIdentity === event.selectedAlternativeIdentity).length !== 1) {
      invalid(`${label}.selectedAlternativeIdentity`, 'must select exactly one credible-material alternative');
    }
  } else {
    if (Object.hasOwn(event, 'selectedAlternativeIdentity')) invalid(label, 'no-progress forbids a selected alternative');
    if (credible.length !== 0) invalid(`${label}.alternatives`, 'no-progress forbids credible-material alternatives');
    const proof = /** @type {Record<string, unknown>} */ (
      validateNoProgressProofV2(event.noProgressProof, `${label}.noProgressProof`)
    );
    if (proof.failedApproachSetIdentity !== event.failedApproachSetIdentity
      || proof.assumptionSetHash !== event.assumptionSetHash
      || proof.alternativeSetHash !== sha256(canonicalJson({
        failedApproachSetIdentity: event.failedApproachSetIdentity,
        alternatives,
      }))) invalid(`${label}.noProgressProof`, 'must bind the complete reviewed failed set, alternatives, and assumptions');
  }
  const { eventHash, reviewIdentity, type, version, ...body } = event;
  if (reviewIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.reviewIdentity`, 'must equal the recomputed complete review identity');
  }
  const { eventHash: hash, ...withoutHash } = event;
  if (hash !== sha256(canonicalJson(withoutHash))) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

// --- Canonical autonomous v2 event lines and dual-surface projection ---------

/** @param {Record<string, unknown>} event */
function v2EventLineText(event) {
  return `${LANE_EVENT_PREFIX}${canonicalJson(event)}`;
}

/** @param {Record<string, unknown>} event @param {string} label */
function v2ProjectionPlanItem(event, label) {
  const laneEventLine = v2EventLineText(event);
  const lineBytes = Buffer.from(laneEventLine, 'utf8');
  if (lineBytes.byteLength > MAX_EVENT_LINE_TEXT_BYTES) {
    invalid(label, `event line must serialize to at most ${MAX_EVENT_LINE_TEXT_BYTES} UTF-8 bytes`);
  }
  const recordBytes = Buffer.concat([lineBytes, Buffer.from([0x0a])]);
  if (recordBytes.byteLength > MAX_EVENT_LINE_RECORD_BYTES) {
    invalid(label, `event line record must serialize to at most ${MAX_EVENT_LINE_RECORD_BYTES} bytes`);
  }
  return {
    eventHash: event.eventHash,
    currentRunRecord: buildProjectionRecord(event),
    currentRunRecordHash: sha256(canonicalJson({ event })),
    laneEventLine,
    laneEventLineTerminator: 'LF',
    laneEventLineHash: sha256(lineBytes),
    laneEventRecordHash: sha256(recordBytes),
  };
}

/** Index every fresh dual-surface v2 event by hash, failing closed on conflict. @param {Record<string, unknown>} inspection */
function dualSurfaceEventIndexV2(inspection) {
  /** @type {{byHash:Map<string,Record<string, unknown>>,counts:Map<string,number>}[]} */
  const surfaces = [];
  for (const [events, surface] of [
    [currentRunEventsV2(inspection), 'current-run'],
    [laneHistoryEventsV2(inspection), 'lane-history'],
  ]) {
    /** @type {Map<string,Record<string, unknown>>} */
    const byHash = new Map();
    /** @type {Map<string,number>} */
    const counts = new Map();
    for (const event of /** @type {Record<string, unknown>[]} */ (events)) {
      const hash = /** @type {string} */ (event.eventHash);
      const json = canonicalJson(event);
      if (byHash.has(hash)) {
        if (canonicalJson(byHash.get(hash)) !== json) {
          invalid(/** @type {string} */ (surface), 'contains conflicting bytes for one event hash');
        }
        counts.set(hash, /** @type {number} */ (counts.get(hash)) + 1);
        continue;
      }
      byHash.set(hash, event);
      counts.set(hash, 1);
    }
    surfaces.push({ byHash, counts });
  }
  return { currentRun: surfaces[0], lane: surfaces[1] };
}

/** @param {string} surface @param {Record<string, unknown>} target @param {string} batchIdentity @param {string[]} recordHashes */
function v2SurfaceProjectionIdentity(surface, target, batchIdentity, recordHashes) {
  return sha256(canonicalJson({ surface, target: canonicalTarget(target), batchIdentity, recordHashes }));
}

/**
 * Require every exact batch event exactly once and byte-equivalent on both
 * authoritative surfaces, then derive the exact ProjectionRefV1.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} batch
 */
function verifyBatchProjectionV2(inspection, batch) {
  const index = dualSurfaceEventIndexV2(inspection);
  const events = /** @type {Record<string, unknown>[]} */ (batch.events);
  /** @type {string[]} */
  const currentRecordHashes = [];
  /** @type {string[]} */
  const laneRecordHashes = [];
  for (const event of events) {
    const hash = /** @type {string} */ (event.eventHash);
    const current = index.currentRun.byHash.get(hash);
    const lane = index.lane.byHash.get(hash);
    if (!current && !lane) return { verified: false, reason: 'projection-missing-both' };
    if (!current) return { verified: false, reason: 'projection-missing-current-run' };
    if (!lane) return { verified: false, reason: 'projection-missing-lane-history' };
    if (index.currentRun.counts.get(hash) !== 1 || index.lane.counts.get(hash) !== 1) {
      return { verified: false, reason: 'projection-conflict' };
    }
    const expected = canonicalJson(event);
    if (canonicalJson(current) !== expected || canonicalJson(lane) !== expected) {
      return { verified: false, reason: 'projection-conflict' };
    }
    const item = v2ProjectionPlanItem(event, 'projection verification');
    currentRecordHashes.push(/** @type {string} */ (item.currentRunRecordHash));
    laneRecordHashes.push(/** @type {string} */ (item.laneEventRecordHash));
  }
  const target = /** @type {Record<string, unknown>} */ (batch.target);
  const batchIdentity = /** @type {string} */ (batch.batchIdentity);
  const projectionRef = {
    version: 1,
    target: canonicalTarget(target),
    batchIdentity,
    eventHashes: events.map((event) => event.eventHash),
    currentRunProjectionIdentity: v2SurfaceProjectionIdentity('current-run', target, batchIdentity, currentRecordHashes),
    laneProjectionIdentity: v2SurfaceProjectionIdentity('lane-history', target, batchIdentity, laneRecordHashes),
  };
  validateProjectionRefV1(projectionRef);
  return { verified: true, reason: 'projection-verified', projectionRef, index };
}

// --- Fresh gates shared by the public learning and transition routes ---------

/** @param {Record<string, unknown>} inspection @param {Record<string, unknown>} target @param {string} label */
function requireResolvedOwnerMappingV2(inspection, target, label) {
  const items = /** @type {Record<string, unknown>[]} */ (inspection.items);
  for (const source of ['owner-log', 'lane-history']) {
    if (items.filter((item) => item.source === source && item.status === 'present').length !== 1) {
      invalid(label, `requires exactly one freshly resolved ${source} authority`);
    }
  }
  if (targetKey(inspection.target) !== targetKey(target)) {
    invalid(label, 'must resolve the exact affected-target mapping');
  }
}

/** Recompute the trigger and complete failed set from fresh dual-retained evidence. @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance */
function reboundGovernanceEvidenceV2(inspection, governance) {
  let retained;
  try {
    retained = dualRetainedOccurrenceEventsV2(inspection);
    validateRetainedOccurrenceAuthorityV2(retained.retained, trustedEnvelopeIndexFromInspectionV2(inspection));
  } catch {
    return { reason: 'occurrence-retention-incomplete' };
  }
  const repeat = deriveEarliestRepeatRelationshipV1(retained.retained);
  if (!repeat || canonicalJson(repeat) !== canonicalJson(governance.trigger)) {
    return { reason: 'repeat-not-established' };
  }
  let failedApproachSet;
  try {
    failedApproachSet = deriveFailedApproachSetV1(repeat, retained.retained);
  } catch (error) {
    if (error instanceof TypeError
      && error.message === 'FailedApproachSetV1 exceeds the complete failed-approach capacity') {
      return { reason: 'learning-governance-capacity' };
    }
    throw error;
  }
  if (canonicalJson(failedApproachSet) !== canonicalJson(governance.failedApproachSet)) {
    return { reason: 'failed-approach-set-mismatch' };
  }
  return { repeat, failedApproachSet, retained: retained.retained };
}

/** @param {Record<string, unknown>} set @param {Record<string, unknown>[]} retained */
function noProgressCompleteEvidenceHashV2(set, retained) {
  return sha256(canonicalJson({
    version: 2,
    target: set.target,
    failedApproachSetIdentity: set.setIdentity,
    retainedOccurrenceEventHashes: [...new Set(retained.map((event) => /** @type {string} */ (event.eventHash)))]
      .sort(compareUtf8),
  }));
}

/** Resolve the exact autonomous v2 governance case, or explain why learning cannot proceed. @param {Record<string, unknown>} state */
function activeGovernanceCaseV2(state) {
  if (!Object.hasOwn(state, 'learningGovernance')) return null;
  const governance = /** @type {Record<string, unknown>} */ (state.learningGovernance);
  if (!Object.hasOwn(governance, 'governanceIdentity')) return null;
  return /** @type {Record<string, unknown>} */ (validateLearningGovernanceV1(governance));
}

/** @param {Record<string, unknown>} state @param {Record<string, unknown>} governance @param {Record<string, unknown>} updates */
function governanceSuccessorStateV2(state, governance, updates) {
  const next = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: /** @type {Record<string, unknown>[]} */ (state.pending).map(copyPendingEntry),
    completed: /** @type {Record<string, unknown>[]} */ (state.completed).map((entry) => ({ ...entry })),
  });
  const successor = { ...JSON.parse(canonicalJson(governance)), ...updates };
  for (const [field, value] of Object.entries(updates)) if (value === undefined) delete successor[field];
  validateLearningGovernanceV1(successor);
  next.learningGovernance = successor;
  validateRunState(next);
  return next;
}

/**
 * Complete one bounded learning review from fresh evidence and return the exact
 * `learning-result` batch plus its hash-only successor commitment.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} reviewValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function learnGovernanceV2(stateValue, inputValue, reviewValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('learnGovernanceV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} learning */
  const respond = (learning) => ({ inspection, learning });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ reviewed: false, reason: 'learning-evidence-incomplete', state });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0
    || targetKey(inspection.target) !== targetKey(governance.target)) {
    return respond({ reviewed: false, reason: 'learning-evidence-incomplete', state });
  }
  if (governance.phase !== 'required') return respond({ reviewed: false, reason: 'learning-phase-mismatch', state });
  if (Object.hasOwn(governance, 'projectionCommitment')) {
    return respond({ reviewed: false, reason: 'governance-unresolved', state });
  }
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return respond({ reviewed: false, reason: rebound.reason, state });
  const failedApproachSet = /** @type {Record<string, unknown>} */ (rebound.failedApproachSet);
  const review = assertExactRecord(
    reviewValue,
    ['version', 'target', 'assumptionIdentities', 'findings', 'alternatives', 'outcome'],
    ['sequenceIdentity', 'selectedAlternativeIdentity'],
    'learning review v2',
  );
  if (review.version !== 2) invalid('learning review v2.version', 'must be the literal safe integer 2');
  const target = canonicalTarget(validateAffectedTargetV2(review.target, 'learning review v2.target'));
  if (targetKey(target) !== targetKey(governance.target)) {
    invalid('learning review v2.target', 'must be the governed affected target');
  }
  const assumptionIdentities = validateV2HashSet(review.assumptionIdentities, 'learning review v2.assumptionIdentities', 0, 16);
  assertEnum(review.outcome, V2_LEARNING_OUTCOMES, 'learning review v2.outcome');
  const findings = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(review.findings, 'learning review v2.findings')
  );
  if (findings.length < 1 || findings.length > 16) invalid('learning review v2.findings', 'must contain 1 through 16 findings');
  findings.forEach((finding, index) => validateLearningFindingV1(finding, `learning review v2.findings[${index}]`));
  const alternatives = requireCompleteFailedSetComparisonV2(
    review.alternatives,
    failedApproachSet,
    'learning review v2.alternatives',
  );
  // An optional already-valid uniquely mapped objective may carry evidence; the
  // runtime never creates, repairs, or infers one.
  let sequenceIdentity;
  if (Object.hasOwn(review, 'sequenceIdentity')) {
    assertHash(review.sequenceIdentity, 'learning review v2.sequenceIdentity');
    const sequences = Object.hasOwn(state, 'evaluationSequences')
      ? /** @type {Record<string, unknown>[]} */ (state.evaluationSequences)
      : [];
    const matches = sequences.filter((row) => row.sequenceIdentity === review.sequenceIdentity
      && targetKey(row.target) === targetKey(target));
    if (matches.length !== 1) {
      invalid('learning review v2.sequenceIdentity', 'must reference one already valid uniquely matched objective');
    }
    sequenceIdentity = review.sequenceIdentity;
  }
  const assumptionSetHash = sha256(canonicalJson(assumptionIdentities));
  /** @type {Record<string, unknown>} */
  const branch = {};
  if (review.outcome === 'selected-alternative') {
    if (!Object.hasOwn(review, 'selectedAlternativeIdentity')) {
      invalid('learning review v2.selectedAlternativeIdentity', 'is required for a selected alternative');
    }
    assertHash(review.selectedAlternativeIdentity, 'learning review v2.selectedAlternativeIdentity');
    if (alternatives.credible.length === 0) return respond({ reviewed: false, reason: 'alternative-invalid', state });
    if (alternatives.credible.filter((row) => row.alternativeIdentity === review.selectedAlternativeIdentity).length !== 1) {
      return respond({ reviewed: false, reason: 'alternative-selection-mismatch', state });
    }
    branch.selectedAlternativeIdentity = review.selectedAlternativeIdentity;
  } else {
    if (Object.hasOwn(review, 'selectedAlternativeIdentity')) {
      invalid('learning review v2.selectedAlternativeIdentity', 'is forbidden for no-progress');
    }
    if (alternatives.credible.length !== 0) return respond({ reviewed: false, reason: 'alternative-invalid', state });
    const completeEvidenceHash = noProgressCompleteEvidenceHashV2(
      failedApproachSet,
      /** @type {Record<string, unknown>[]} */ (rebound.retained),
    );
    const proofWithoutIdentity = {
      version: 2,
      failedApproachSetIdentity: failedApproachSet.setIdentity,
      completeEvidenceHash,
      alternativeSetHash: sha256(canonicalJson({
        failedApproachSetIdentity: failedApproachSet.setIdentity,
        alternatives: alternatives.rows,
      })),
      credibleMaterialAlternativeIdentities: [],
      noNewDistinguishingEvidenceHash: sha256(canonicalJson({
        failedApproachSetIdentity: failedApproachSet.setIdentity,
        completeEvidenceHash,
        distinguishingEvidenceIdentities: [],
      })),
      assumptionSetHash,
    };
    branch.noProgressProof = {
      ...proofWithoutIdentity,
      proofIdentity: sha256(canonicalJson(proofWithoutIdentity)),
    };
    validateNoProgressProofV2(branch.noProgressProof);
  }
  const reviewEvent = buildLearningReviewEventV2({
    governanceIdentity: governance.governanceIdentity,
    target,
    ...(sequenceIdentity ? { sequenceIdentity } : {}),
    trigger: rebound.repeat,
    failedApproachSetIdentity: failedApproachSet.setIdentity,
    preLearningEvidenceHash: inspection.evidenceHash,
    assumptionSetHash,
    findings: JSON.parse(canonicalJson(findings)),
    alternatives: JSON.parse(canonicalJson(alternatives.rows)),
    outcome: review.outcome,
    ...branch,
  });
  const reviewedCore = {
    ...JSON.parse(canonicalJson(governance)),
    phase: 'reviewed',
    reviewIdentity: reviewEvent.reviewIdentity,
  };
  const governanceEvent = buildGovernanceEventV1(reviewedCore);
  const projectionBatch = buildProjectionBatchV1(
    'learning-result',
    target,
    [reviewEvent, governanceEvent],
    'learnGovernanceV2 learning result',
  );
  const nextState = governanceSuccessorStateV2(state, governance, {
    phase: 'reviewed',
    reviewIdentity: reviewEvent.reviewIdentity,
    projectionCommitment: projectionCommitmentOfBatchV1(projectionBatch),
  });
  return {
    inspection,
    learning: {
      reviewed: true,
      reason: 'learning-reviewed',
      state: nextState,
      reviewEvent,
      governanceEvent,
      projectionBatch,
    },
  };
}
/** Resolve the exact state commitment that one supplied batch purpose must match. @param {Record<string, unknown>} state @param {unknown} purpose */
function activeProjectionCommitmentV2(state, purpose) {
  if (purpose === 'occurrence-retention') {
    if (!Object.hasOwn(state, 'pendingCompletion')) return null;
    if (/** @type {Record<string, unknown>} */ (state.pendingCompletion).version !== 2) return null;
    const pending = /** @type {Record<string, unknown>} */ (
      validatePendingCompletionRetentionV2(state.pendingCompletion)
    );
    return { commitment: pending.retention, target: pending.target, governance: null };
  }
  const governance = activeGovernanceCaseV2(state);
  if (!governance || !Object.hasOwn(governance, 'projectionCommitment')) return null;
  const commitment = /** @type {Record<string, unknown>} */ (governance.projectionCommitment);
  if (commitment.purpose !== purpose) return null;
  return { commitment, target: governance.target, governance };
}

/**
 * Prepare one exact projection without advancing state. When the caller also
 * supplies the fresh lane binding, every item carries its complete lane
 * mutation, whole-object mutation identity, and `ProjectionPermitV1`, and
 * `planIdentity` is recomputed over those complete items.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} batchValue
 * @param {unknown} [dependencies] @param {boolean} [transport] @param {Record<string, unknown>} [laneBinding]
 */
export function prepareProjectionV2(stateValue, inputValue, batchValue, dependencies, transport = false, laneBinding) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('prepareProjectionV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return { inspection, transition: { prepared: false, reason: 'projection-stale', state } };
  }
  const active = activeProjectionCommitmentV2(state, assertRecord(batchValue, 'projectionBatch').purpose);
  if (!active) return { inspection, transition: { prepared: false, reason: 'projection-batch-mismatch', state } };
  const batch = requireExactProjectionBatchV1(batchValue, active.target, active.commitment, 'projectionBatch');
  requireResolvedOwnerMappingV2(inspection, active.target, 'prepareProjectionV2');
  if (active.governance) {
    // A stored governance record is never a derivation input on its own.
    const rebound = reboundGovernanceEvidenceV2(inspection, active.governance);
    if (rebound.reason) return { inspection, transition: { prepared: false, reason: rebound.reason, state } };
  }
  const target = canonicalTarget(active.target);
  let bound = null;
  if (laneBinding) {
    try {
      const mapping = validateTargetMappingV1(laneBinding.targetMapping, target, 'prepare-projection targetMapping');
      const prestate = validateLanePrestateV1(laneBinding.lanePrestate, target, mapping.mapping, 'prepare-projection lanePrestate');
      bound = {
        ...mapping,
        ...prestate,
        operationTime: assertV2CanonicalUtcTimestamp(laneBinding.operationTime, 'prepare-projection operationTime'),
      };
    } catch {
      return { inspection, transition: { prepared: false, reason: 'target-mapping-missing', state } };
    }
    if (!lanePrestateMatchesFreshEvidenceV2(inspection, target, bound.prestate)) {
      return { inspection, transition: { prepared: false, reason: 'lane-prestate-mismatch', state } };
    }
  }
  const items = /** @type {Record<string, unknown>[]} */ (batch.events)
    .map((event, index) => {
      const item = v2ProjectionPlanItem(event, `projectionBatch.events[${index}]`);
      if (!bound) return item;
      const mutation = v2ProjectionMutationV1(target, bound, item);
      const derived = validateLaneMutationV1(mutation, target, `projectionBatch.events[${index}] mutation`);
      const projectionPermit = v2PermitWithHash({
        version: 1,
        kind: 'lane-projection',
        origin: 'dude-work',
        lane: /** @type {string} */ (target.lane),
        target,
        subjectRunStateHash: v2RunStateHash(state),
        batchIdentity: batch.batchIdentity,
        eventHash: item.eventHash,
        targetMappingHash: bound.targetMappingHash,
        lanePrestateHash: bound.lanePrestateHash,
        mutationIdentity: derived.mutationIdentity,
      });
      validateProjectionPermitV1(projectionPermit);
      return { ...item, mutation, mutationIdentity: derived.mutationIdentity, projectionPermit };
    });
  const planWithoutIdentity = {
    version: 1,
    target,
    batchIdentity: batch.batchIdentity,
    items,
  };
  return {
    inspection,
    transition: {
      prepared: true,
      reason: 'projection-prepared',
      state,
      plan: { ...planWithoutIdentity, planIdentity: sha256(canonicalJson(planWithoutIdentity)) },
    },
  };
}

/** Derive one exact same-state projection mutation for a bound plan item. @param {Record<string, unknown>} target @param {Record<string, unknown>} bound @param {Record<string, unknown>} item */
function v2ProjectionMutationV1(target, bound, item) {
  const lightweight = target.lane === 'lightweight';
  const prestate = /** @type {Record<string, unknown>} */ (bound.prestate);
  const currentState = lightweight ? prestate.glyph : prestate.status;
  const blockerText = lightweight ? prestate.blockedBy : prestate.blocker;
  return {
    version: 1,
    lane: target.lane,
    kind: 'append-event',
    reason: 'event-projection',
    target,
    ...(lightweight
      ? { fromGlyph: currentState, toGlyph: currentState }
      : { fromStatus: currentState, toStatus: currentState }),
    blocker: { kind: 'unchanged', before: blockerText, after: blockerText },
    eventLines: {
      kind: 'append-exact',
      lines: [{ eventHash: item.eventHash, exactLine: item.laneEventLine, terminator: 'LF' }],
      appendIfAbsent: true,
    },
    ownerLog: { kind: 'none' },
    ...(lightweight ? { snapshotUpdatedAt: bound.operationTime } : {}),
  };
}

/**
 * Verify one exact projection freshly on both authoritative surfaces and clear
 * only the commitment it satisfies.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} batchValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function verifyProjectionV2(stateValue, inputValue, batchValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('verifyProjectionV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return { inspection, transition: { verified: false, reason: 'projection-stale', state } };
  }
  const active = activeProjectionCommitmentV2(state, assertRecord(batchValue, 'projectionBatch').purpose);
  if (!active) return { inspection, transition: { verified: false, reason: 'projection-batch-mismatch', state } };
  const batch = requireExactProjectionBatchV1(batchValue, active.target, active.commitment, 'projectionBatch');
  requireResolvedOwnerMappingV2(inspection, active.target, 'verifyProjectionV2');
  if (active.governance) {
    // A stored governance record is never a derivation input on its own.
    const rebound = reboundGovernanceEvidenceV2(inspection, active.governance);
    if (rebound.reason) return { inspection, transition: { verified: false, reason: rebound.reason, state } };
  }
  let outcome;
  try {
    outcome = verifyBatchProjectionV2(inspection, batch);
  } catch {
    return { inspection, transition: { verified: false, reason: 'projection-conflict', state } };
  }
  if (!outcome.verified) {
    return { inspection, transition: { verified: false, reason: outcome.reason, state } };
  }
  // Occurrence admission stays owned by `complete.finalize`.
  if (!active.governance) {
    return { inspection, transition: { verified: true, reason: 'projection-verified', state, projectionRef: outcome.projectionRef } };
  }
  const governance = active.governance;
  const nextState = governanceSuccessorStateV2(state, governance, {
    phase: governance.phase === 'reviewed' ? 'projected' : governance.phase,
    projectionCommitment: undefined,
  });
  return {
    inspection,
    transition: {
      verified: true,
      reason: 'projection-verified',
      state: nextState,
      projectionRef: outcome.projectionRef,
    },
  };
}

/**
 * Rebind the dual-retained learning result from the fresh surfaces so no stored
 * hash alone can carry a branch decision.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance
 */
function retainedLearningResultV2(inspection, governance) {
  let outcome;
  try {
    const index = dualSurfaceEventIndexV2(inspection);
    const reviewEvents = [...index.currentRun.byHash.values()].filter((event) => (
      event.type === 'learning-review'
        && event.reviewIdentity === governance.reviewIdentity
        && event.governanceIdentity === governance.governanceIdentity
    ));
    const governanceEvents = [...index.currentRun.byHash.values()].filter((event) => (
      event.type === 'learning-governance'
        && event.governanceIdentity === governance.governanceIdentity
        && event.phase === 'reviewed'
        && event.reviewIdentity === governance.reviewIdentity
    ));
    if (reviewEvents.length !== 1 || governanceEvents.length !== 1) {
      return { reason: reviewEvents.length === 0 || governanceEvents.length === 0
        ? 'projection-missing-current-run'
        : 'projection-conflict' };
    }
    const batch = buildProjectionBatchV1(
      'learning-result',
      /** @type {Record<string, unknown>} */ (governance.target),
      [reviewEvents[0], governanceEvents[0]],
      'retained learning result',
    );
    outcome = verifyBatchProjectionV2(inspection, batch);
    if (!outcome.verified) return { reason: outcome.reason };
    return { reviewEvent: reviewEvents[0], batch, projectionRef: outcome.projectionRef };
  } catch {
    return { reason: 'projection-conflict' };
  }
}

/**
 * Bind one fresh post-learning Inspection to the selected alternative and its
 * discriminating check.
 * @param {unknown} stateValue @param {unknown} inputValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function bindPostLearningInspectionV2(stateValue, inputValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('bindPostLearningInspectionV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ bound: false, reason: 'learning-evidence-incomplete', state });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0
    || targetKey(inspection.target) !== targetKey(governance.target)) {
    return respond({ bound: false, reason: 'inspection-stale', state });
  }
  if (governance.phase !== 'projected') return respond({ bound: false, reason: 'learning-phase-mismatch', state });
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return respond({ bound: false, reason: rebound.reason, state });
  const retained = retainedLearningResultV2(inspection, governance);
  if (retained.reason) return respond({ bound: false, reason: retained.reason, state });
  const reviewEvent = /** @type {Record<string, unknown>} */ (retained.reviewEvent);
  if (reviewEvent.outcome !== 'selected-alternative') {
    return respond({ bound: false, reason: 'inspection-branch-mismatch', state });
  }
  let alternatives;
  try {
    alternatives = requireCompleteFailedSetComparisonV2(
      reviewEvent.alternatives,
      /** @type {Record<string, unknown>} */ (rebound.failedApproachSet),
      'retained learning review alternatives',
    );
  } catch {
    return respond({ bound: false, reason: 'failed-approach-set-mismatch', state });
  }
  const selected = alternatives.credible
    .filter((row) => row.alternativeIdentity === reviewEvent.selectedAlternativeIdentity);
  if (selected.length !== 1) return respond({ bound: false, reason: 'alternative-selection-mismatch', state });
  const failedApproachSet = /** @type {Record<string, unknown>} */ (rebound.failedApproachSet);
  const discriminatingCheckIdentity = /** @type {Record<string, unknown>} */ (
    selected[0].discriminatingCheck
  ).identity;
  const bindingWithoutIdentity = {
    version: 1,
    target: canonicalTarget(/** @type {Record<string, unknown>} */ (governance.target)),
    governanceIdentity: governance.governanceIdentity,
    repeatIdentity: sha256(canonicalJson(governance.trigger)),
    reviewIdentity: governance.reviewIdentity,
    failedApproachSetIdentity: failedApproachSet.setIdentity,
    projectionRef: retained.projectionRef,
    evidenceHash: inspection.evidenceHash,
    branchIdentity: sha256(canonicalJson({
      selectedAlternativeIdentity: selected[0].alternativeIdentity,
      discriminatingCheckIdentity,
      failedApproachSetIdentity: failedApproachSet.setIdentity,
    })),
    expectedProjectionEventHashes: /** @type {Record<string, unknown>} */ (retained.projectionRef).eventHashes,
  };
  const binding = {
    ...bindingWithoutIdentity,
    postLearningInspectionIdentity: sha256(canonicalJson(bindingWithoutIdentity)),
  };
  validatePostLearningInspectionBindingV1(binding);
  const nextState = governanceSuccessorStateV2(state, governance, {
    phase: 'alternative-inspected',
    selectedAlternativeIdentity: selected[0].alternativeIdentity,
    discriminatingCheckIdentity,
    postLearningInspectionIdentity: binding.postLearningInspectionIdentity,
  });
  return respond({
    bound: true,
    reason: 'post-learning-inspection-bound',
    state: nextState,
    binding,
  });
}

/**
 * Prove no new distinguishing evidence against the complete projected
 * no-alternative result before any lane no-progress disposition.
 * @param {unknown} stateValue @param {unknown} inputValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function verifyNoProgressV2(stateValue, inputValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('verifyNoProgressV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ verified: false, reason: 'learning-evidence-incomplete', state });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0
    || targetKey(inspection.target) !== targetKey(governance.target)) {
    return respond({ verified: false, reason: 'inspection-stale', state });
  }
  if (governance.phase !== 'projected') return respond({ verified: false, reason: 'learning-phase-mismatch', state });
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return respond({ verified: false, reason: rebound.reason, state });
  const retained = retainedLearningResultV2(inspection, governance);
  if (retained.reason) return respond({ verified: false, reason: retained.reason, state });
  const reviewEvent = /** @type {Record<string, unknown>} */ (retained.reviewEvent);
  if (reviewEvent.outcome !== 'no-progress') {
    return respond({ verified: false, reason: 'inspection-branch-mismatch', state });
  }
  const failedApproachSet = /** @type {Record<string, unknown>} */ (rebound.failedApproachSet);
  try {
    requireCompleteFailedSetComparisonV2(
      reviewEvent.alternatives,
      failedApproachSet,
      'retained learning review alternatives',
    );
  } catch {
    return respond({ verified: false, reason: 'failed-approach-set-mismatch', state });
  }
  const proof = /** @type {Record<string, unknown>} */ (reviewEvent.noProgressProof);
  if (proof.failedApproachSetIdentity !== failedApproachSet.setIdentity
    || proof.completeEvidenceHash !== noProgressCompleteEvidenceHashV2(
      failedApproachSet,
      /** @type {Record<string, unknown>[]} */ (rebound.retained),
    )) return respond({ verified: false, reason: 'new-distinguishing-evidence', state });
  const verificationWithoutIdentity = {
    version: 2,
    noProgressProofIdentity: proof.proofIdentity,
    failedApproachSetIdentity: failedApproachSet.setIdentity,
    preLearningEvidenceHash: reviewEvent.preLearningEvidenceHash,
    postLearningEvidenceHash: inspection.evidenceHash,
    expectedProjectionEventHashes: /** @type {Record<string, unknown>} */ (retained.projectionRef).eventHashes,
    distinguishingEvidenceIdentities: [],
    noNewDistinguishingEvidenceHash: sha256(canonicalJson({
      noProgressProofIdentity: proof.proofIdentity,
      failedApproachSetIdentity: failedApproachSet.setIdentity,
      preLearningEvidenceHash: reviewEvent.preLearningEvidenceHash,
      postLearningEvidenceHash: inspection.evidenceHash,
      expectedProjectionEventHashes: /** @type {Record<string, unknown>} */ (retained.projectionRef).eventHashes,
      distinguishingEvidenceIdentities: [],
    })),
  };
  const verification = {
    ...verificationWithoutIdentity,
    verificationIdentity: sha256(canonicalJson(verificationWithoutIdentity)),
  };
  validateNoProgressVerificationV2(verification);
  const nextState = governanceSuccessorStateV2(state, governance, {
    phase: 'no-progress-verified',
    postLearningInspectionIdentity: verification.verificationIdentity,
  });
  return respond({
    verified: true,
    reason: 'no-progress-verified',
    state: nextState,
    verification,
  });
}

// === Feature 009 (T004): scoped halts, re-derivation, scheduling, and audit ==
// Halt scope stays authoritative and closed: a target-scoped stop restricts only
// its target while a run-wide stop ends the invocation, and missing or
// conflicting scope is run-wide ambiguity. Unchanged suspension reuses Feature
// 005's exact sequential decision through `mayScheduleAfterStop`; nothing here
// adds a scheduler, starts another target, or authorizes concurrency. Immediate
// Halt End stays an ephemeral outcome with no controlled-end permit, mutation,
// record, or receipt, and `AuditSummaryV2` reads only the byte-equivalent
// dual-surface event intersection.

const V2_RUN_HALT_KINDS = Object.freeze([
  'security', 'safety', 'authority', 'credential', 'destructive-confirmation',
  'spending', 'external-authorization', 'lane-ambiguity', 'ownership-ambiguity',
  'overall-budget', 'unrecoverable-governance-evidence',
]);
const V2_TARGET_HALT_KINDS = Object.freeze([
  'unavailable-dependency', 'unavailable-input', 'per-target-budget',
  'target-hard-stop', 'learning-evidence-incomplete',
]);
const V2_HALT_KINDS = Object.freeze([...V2_RUN_HALT_KINDS, ...V2_TARGET_HALT_KINDS]);
const V2_PROJECTION_DISPOSITIONS = Object.freeze(['verified', 'rederive-required', 'unavailable']);
const V2_SUSPENSION_REASONS = Object.freeze(['unresolved-learning', 'target-hard-stop', 'per-target-budget']);
const V2_INVOCATION_OUTCOMES = Object.freeze([
  'in-progress', 'controlled-unresolved-end', 'immediate-halt-end',
]);

/** The closed authoritative scope of one halt kind. @param {unknown} kind */
function authoritativeHaltScopeV2(kind) {
  if (V2_RUN_HALT_KINDS.includes(/** @type {string} */ (kind))) return 'run';
  if (V2_TARGET_HALT_KINDS.includes(/** @type {string} */ (kind))) return 'target';
  return null;
}

/** @param {unknown} value @param {string} [label] */
export function validateSuspensionV1(value, label = 'SuspensionV1') {
  const suspension = assertExactRecord(
    value,
    ['version', 'reason', 'affectedTarget', 'affectedChangeSetHash', 'selectedTarget', 'selectedChangeSetHash', 'readinessEvidenceHash', 'dependencyProofHash', 'disjointnessProofHash', 'schedulingEvidenceIdentity'],
    [],
    label,
  );
  if (suspension.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertEnum(suspension.reason, V2_SUSPENSION_REASONS, `${label}.reason`);
  const affected = validateAffectedTargetV2(suspension.affectedTarget, `${label}.affectedTarget`);
  const selected = validateAffectedTargetV2(suspension.selectedTarget, `${label}.selectedTarget`);
  if (targetKey(affected) === targetKey(selected)) {
    invalid(`${label}.selectedTarget`, 'must be a distinct disjoint target');
  }
  for (const field of ['affectedChangeSetHash', 'selectedChangeSetHash', 'readinessEvidenceHash', 'dependencyProofHash', 'disjointnessProofHash', 'schedulingEvidenceIdentity']) {
    assertHash(suspension[field], `${label}.${field}`);
  }
  const { schedulingEvidenceIdentity, ...withoutIdentity } = suspension;
  if (schedulingEvidenceIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.schedulingEvidenceIdentity`, 'must equal the recomputed complete scheduling evidence identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateHaltV1(value, label = 'HaltV1') {
  const halt = assertExactRecord(
    value,
    ['version', 'scope', 'kind', 'reason', 'evidenceIdentity', 'projectionDisposition'],
    ['target'],
    label,
  );
  if (halt.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertEnum(halt.scope, ['target', 'run'], `${label}.scope`);
  assertEnum(halt.kind, V2_HALT_KINDS, `${label}.kind`);
  if (authoritativeHaltScopeV2(halt.kind) !== halt.scope) {
    invalid(`${label}.scope`, 'must equal the authoritative scope of its halt kind');
  }
  assertV2Identifier(halt.reason, `${label}.reason`);
  assertHash(halt.evidenceIdentity, `${label}.evidenceIdentity`);
  assertEnum(halt.projectionDisposition, V2_PROJECTION_DISPOSITIONS, `${label}.projectionDisposition`);
  if (halt.scope === 'target') {
    if (!Object.hasOwn(halt, 'target')) invalid(`${label}.target`, 'is required for a target-scoped halt');
    validateAffectedTargetV2(halt.target, `${label}.target`);
  } else if (Object.hasOwn(halt, 'target')) {
    invalid(`${label}.target`, 'is forbidden for a run-wide halt');
  }
  if (halt.projectionDisposition === 'unavailable' && halt.kind !== 'unrecoverable-governance-evidence') {
    invalid(`${label}.projectionDisposition`, 'unavailable requires a run-wide unrecoverable-governance-evidence halt');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateGovernanceRederivationProofV1(value, label = 'GovernanceRederivationProofV1') {
  const proof = assertExactRecord(
    value,
    ['version', 'target', 'governanceIdentity', 'repeat', 'failedApproachSetIdentity', 'retainedOccurrences', 'proofIdentity'],
    [],
    label,
  );
  if (proof.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const target = validateAffectedTargetV2(proof.target, `${label}.target`);
  assertHash(proof.governanceIdentity, `${label}.governanceIdentity`);
  validateRepeatRelationshipV1(proof.repeat, `${label}.repeat`);
  assertHash(proof.failedApproachSetIdentity, `${label}.failedApproachSetIdentity`);
  if (proof.governanceIdentity !== sha256(canonicalJson({
    version: 1,
    target,
    repeatIdentity: sha256(canonicalJson(proof.repeat)),
  }))) invalid(`${label}.governanceIdentity`, 'must bind the exact target and Repeat Relationship');
  const rows = assertDenseDataArray(proof.retainedOccurrences, `${label}.retainedOccurrences`);
  if (rows.length !== 2) invalid(`${label}.retainedOccurrences`, 'must contain exactly two retained occurrence references');
  rows.forEach((row, index) => {
    const reference = assertExactRecord(row, ['occurrenceIdentity', 'eventHash'], [], `${label}.retainedOccurrences[${index}]`);
    assertHash(reference.occurrenceIdentity, `${label}.retainedOccurrences[${index}].occurrenceIdentity`);
    assertHash(reference.eventHash, `${label}.retainedOccurrences[${index}].eventHash`);
    if (reference.occurrenceIdentity !== /** @type {string[]} */ (
      /** @type {Record<string, unknown>} */ (proof.repeat).occurrenceIdentities
    )[index]) invalid(`${label}.retainedOccurrences[${index}]`, 'must name the exact repeat occurrence in chronology order');
  });
  const { proofIdentity, ...withoutIdentity } = proof;
  if (proofIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.proofIdentity`, 'must equal the recomputed complete proof identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateControlledEndBranchEvidenceV1(value, label = 'ControlledEndBranchEvidenceV1') {
  const kind = assertRecord(value, label).kind;
  assertEnum(kind, ['selected-alternative', 'no-progress'], `${label}.kind`);
  if (kind === 'selected-alternative') {
    const branch = assertExactRecord(
      value,
      ['kind', 'sourcePhase', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity'],
      [],
      label,
    );
    if (branch.sourcePhase !== 'alternative-inspected') {
      invalid(`${label}.sourcePhase`, 'must be alternative-inspected');
    }
    for (const field of ['selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity']) {
      assertHash(branch[field], `${label}.${field}`);
    }
    return value;
  }
  const branch = assertExactRecord(
    value,
    ['kind', 'sourcePhase', 'noProgressProofIdentity', 'noProgressVerificationIdentity'],
    [],
    label,
  );
  if (branch.sourcePhase !== 'no-progress-verified') invalid(`${label}.sourcePhase`, 'must be no-progress-verified');
  for (const field of ['noProgressProofIdentity', 'noProgressVerificationIdentity']) {
    assertHash(branch[field], `${label}.${field}`);
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateControlledUnresolvedEndV1(value, label = 'ControlledUnresolvedEndV1') {
  const end = assertExactRecord(
    value,
    ['version', 'kind', 'branchEvidence', 'governanceBranchStatus', 'laneDisposition', 'targetDisposition', 'invocationOutcome', 'reviewIdentity', 'learningReviewEventHash', 'projectionRef', 'endIdentity'],
    [],
    label,
  );
  if (end.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (end.kind !== 'controlled-unresolved-end') invalid(`${label}.kind`, 'must be controlled-unresolved-end');
  validateControlledEndBranchEvidenceV1(end.branchEvidence, `${label}.branchEvidence`);
  if (end.governanceBranchStatus !== 'resolved') invalid(`${label}.governanceBranchStatus`, 'must be resolved');
  if (end.laneDisposition !== 'pending') invalid(`${label}.laneDisposition`, 'must be pending');
  if (end.targetDisposition !== 'unchanged') invalid(`${label}.targetDisposition`, 'must be unchanged');
  if (end.invocationOutcome !== 'controlled-unresolved-end') {
    invalid(`${label}.invocationOutcome`, 'must be controlled-unresolved-end');
  }
  assertHash(end.reviewIdentity, `${label}.reviewIdentity`);
  assertHash(end.learningReviewEventHash, `${label}.learningReviewEventHash`);
  const projectionRef = /** @type {Record<string, unknown>} */ (
    validateProjectionRefV1(end.projectionRef, `${label}.projectionRef`)
  );
  if (!/** @type {string[]} */ (projectionRef.eventHashes).includes(/** @type {string} */ (end.learningReviewEventHash))) {
    invalid(`${label}.projectionRef`, 'must identify the matching learning-result batch');
  }
  const { endIdentity, ...withoutIdentity } = end;
  if (endIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.endIdentity`, 'must equal the recomputed complete end identity');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateImmediateHaltOutcomeV1(value, label = 'ImmediateHaltOutcomeV1') {
  const outcome = assertExactRecord(
    value,
    ['ok', 'invocationOutcome', 'targetDisposition', 'halt', 'projectionDisposition', 'projectionEvidence'],
    [],
    label,
  );
  if (outcome.ok !== false) invalid(`${label}.ok`, 'must be the literal boolean false');
  if (outcome.invocationOutcome !== 'immediate-halt-end') invalid(`${label}.invocationOutcome`, 'must be immediate-halt-end');
  if (outcome.targetDisposition !== 'unchanged') invalid(`${label}.targetDisposition`, 'must be unchanged');
  const halt = /** @type {Record<string, unknown>} */ (validateHaltV1(outcome.halt, `${label}.halt`));
  assertEnum(outcome.projectionDisposition, V2_PROJECTION_DISPOSITIONS, `${label}.projectionDisposition`);
  const disposition = assertRecord(outcome.projectionEvidence, `${label}.projectionEvidence`).disposition;
  // Outcome, nested halt, and evidence dispositions are exactly equal.
  if (outcome.projectionDisposition !== halt.projectionDisposition
    || outcome.projectionDisposition !== disposition) {
    invalid(`${label}.projectionDisposition`, 'must equal the nested halt and evidence dispositions');
  }
  if (disposition === 'verified') {
    const evidence = assertExactRecord(
      outcome.projectionEvidence,
      ['disposition', 'projectionRef', 'governanceIdentity', 'governanceRevision', 'governanceEventHash'],
      [],
      `${label}.projectionEvidence`,
    );
    validateProjectionRefV1(evidence.projectionRef, `${label}.projectionEvidence.projectionRef`);
    assertHash(evidence.governanceIdentity, `${label}.projectionEvidence.governanceIdentity`);
    assertSafeInteger(evidence.governanceRevision, `${label}.projectionEvidence.governanceRevision`, true);
    assertHash(evidence.governanceEventHash, `${label}.projectionEvidence.governanceEventHash`);
    if (!/** @type {string[]} */ (
      /** @type {Record<string, unknown>} */ (evidence.projectionRef).eventHashes
    ).includes(/** @type {string} */ (evidence.governanceEventHash))) {
      invalid(`${label}.projectionEvidence.projectionRef`, 'must bind the named Governance Event');
    }
    return value;
  }
  if (disposition === 'rederive-required') {
    const evidence = assertExactRecord(
      outcome.projectionEvidence,
      ['disposition', 'rederivationProof'],
      [],
      `${label}.projectionEvidence`,
    );
    validateGovernanceRederivationProofV1(evidence.rederivationProof, `${label}.projectionEvidence.rederivationProof`);
    return value;
  }
  const evidence = assertExactRecord(
    outcome.projectionEvidence,
    ['disposition', 'unrecoverableEvidenceIdentity'],
    [],
    `${label}.projectionEvidence`,
  );
  assertHash(evidence.unrecoverableEvidenceIdentity, `${label}.projectionEvidence.unrecoverableEvidenceIdentity`);
  if (halt.scope !== 'run'
    || halt.kind !== 'unrecoverable-governance-evidence'
    || evidence.unrecoverableEvidenceIdentity !== halt.evidenceIdentity) {
    invalid(`${label}.projectionEvidence`, 'unavailable must bind the run-wide unrecoverable-governance-evidence halt');
  }
  return value;
}

/** @param {unknown} value @param {string} [label] */
export function validateAuditSummaryV2(value, label = 'AuditSummaryV2') {
  const summary = assertExactRecord(
    value,
    ['version', 'target', 'governanceIdentity', 'trigger', 'channel', 'learningRequirement', 'governanceStatus', 'targetDisposition', 'invocationOutcome', 'scope', 'unresolvedReason', 'schedulingOutcome', 'projectionDisposition', 'failedApproachSetIdentity', 'evidenceEventHashes', 'summaryIdentity'],
    ['branchEvidence', 'suspension', 'controlledEnd', 'immediateHaltEnd'],
    label,
  );
  if (summary.version !== 2) invalid(`${label}.version`, 'must be the literal safe integer 2');
  const target = validateAffectedTargetV2(summary.target, `${label}.target`);
  assertHash(summary.governanceIdentity, `${label}.governanceIdentity`);
  const trigger = /** @type {Record<string, unknown>} */ (
    validateRepeatRelationshipV1(summary.trigger, `${label}.trigger`)
  );
  if (summary.channel !== trigger.channel) invalid(`${label}.channel`, 'must equal the triggering Repeat Relationship channel');
  if (summary.governanceIdentity !== sha256(canonicalJson({
    version: 1,
    target,
    repeatIdentity: sha256(canonicalJson(trigger)),
  }))) invalid(`${label}.governanceIdentity`, 'must bind the exact target and Repeat Relationship');
  assertEnum(summary.learningRequirement, ['unresolved', 'resolved'], `${label}.learningRequirement`);
  assertEnum(summary.governanceStatus, V2_GOVERNANCE_PHASES, `${label}.governanceStatus`);
  // No T004-reachable row may claim target completion, block, close, or an
  // applied no-progress lane disposition.
  if (summary.targetDisposition !== 'unchanged') invalid(`${label}.targetDisposition`, 'must be unchanged');
  assertEnum(summary.invocationOutcome, V2_INVOCATION_OUTCOMES, `${label}.invocationOutcome`);
  assertEnum(summary.scope, ['target', 'run'], `${label}.scope`);
  assertV2Identifier(summary.unresolvedReason, `${label}.unresolvedReason`);
  assertEnum(
    summary.schedulingOutcome,
    ['none', 'sequential-disjoint-continuation', 'invocation-stopped'],
    `${label}.schedulingOutcome`,
  );
  assertEnum(summary.projectionDisposition, V2_PROJECTION_DISPOSITIONS, `${label}.projectionDisposition`);
  assertHash(summary.failedApproachSetIdentity, `${label}.failedApproachSetIdentity`);
  validateV2SortedSet(summary.evidenceEventHashes, assertHash, 0, 128, `${label}.evidenceEventHashes`);
  if (Object.hasOwn(summary, 'branchEvidence')) {
    const branchKind = assertRecord(summary.branchEvidence, `${label}.branchEvidence`).kind;
    assertEnum(branchKind, ['selected-alternative', 'no-progress'], `${label}.branchEvidence.kind`);
    const branch = branchKind === 'selected-alternative'
      ? assertExactRecord(summary.branchEvidence, ['kind', 'sourcePhase', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'postLearningInspectionIdentity'], [], `${label}.branchEvidence`)
      // A `no-progress-verified` row resolves its identity as a verification,
      // never as a Post-Learning Inspection binding.
      : assertExactRecord(summary.branchEvidence, ['kind', 'sourcePhase', 'noProgressVerificationIdentity'], [], `${label}.branchEvidence`);
    if (branch.sourcePhase !== summary.governanceStatus) {
      invalid(`${label}.branchEvidence.sourcePhase`, 'must equal the current governance status');
    }
    for (const field of Object.keys(branch)) {
      if (field !== 'kind' && field !== 'sourcePhase') assertHash(branch[field], `${label}.branchEvidence.${field}`);
    }
    if (Object.hasOwn(summary, 'controlledEnd')) {
      invalid(`${label}.branchEvidence`, 'is forbidden beside a Controlled Unresolved End record');
    }
  }
  if (Object.hasOwn(summary, 'suspension')) validateSuspensionV1(summary.suspension, `${label}.suspension`);
  if (Object.hasOwn(summary, 'controlledEnd')) {
    validateControlledUnresolvedEndV1(summary.controlledEnd, `${label}.controlledEnd`);
    if (summary.invocationOutcome !== 'controlled-unresolved-end') {
      invalid(`${label}.invocationOutcome`, 'must be controlled-unresolved-end beside a controlled-end record');
    }
  }
  if (Object.hasOwn(summary, 'immediateHaltEnd')) {
    const outcome = /** @type {Record<string, unknown>} */ (
      validateImmediateHaltOutcomeV1(summary.immediateHaltEnd, `${label}.immediateHaltEnd`)
    );
    if (summary.invocationOutcome !== 'immediate-halt-end'
      || summary.projectionDisposition !== outcome.projectionDisposition
      || summary.scope !== /** @type {Record<string, unknown>} */ (outcome.halt).scope) {
      invalid(`${label}.immediateHaltEnd`, 'must match the reported outcome, scope, and projection disposition');
    }
  } else if (summary.invocationOutcome === 'immediate-halt-end') {
    invalid(`${label}.immediateHaltEnd`, 'is required for an Immediate Halt End row');
  }
  const { summaryIdentity, ...withoutIdentity } = summary;
  if (summaryIdentity !== sha256(canonicalJson(withoutIdentity))) {
    invalid(`${label}.summaryIdentity`, 'must equal the recomputed complete summary identity');
  }
  return value;
}

/**
 * Classify one caller-observed halt fact set against the closed authoritative
 * kind-to-scope table. Missing or conflicting scope is run-wide ambiguity.
 * @param {unknown} value @param {Record<string, unknown>} target @param {string} label
 */
function classifyHaltScopeV2(value, target, label) {
  const facts = assertExactRecord(value, ['kind', 'reason', 'evidenceIdentity'], ['scope', 'target'], label);
  assertEnum(facts.kind, V2_HALT_KINDS, `${label}.kind`);
  assertV2Identifier(facts.reason, `${label}.reason`);
  assertHash(facts.evidenceIdentity, `${label}.evidenceIdentity`);
  if (Object.hasOwn(facts, 'scope')) assertEnum(facts.scope, ['target', 'run'], `${label}.scope`);
  if (Object.hasOwn(facts, 'target')) validateAffectedTargetV2(facts.target, `${label}.target`);
  const authoritative = authoritativeHaltScopeV2(facts.kind);
  const declared = Object.hasOwn(facts, 'scope') ? facts.scope : null;
  const boundTarget = Object.hasOwn(facts, 'target')
    && targetKey(facts.target) === targetKey(target);
  if (declared === null
    || declared !== authoritative
    || (authoritative === 'target' && !boundTarget)
    || (authoritative === 'run' && Object.hasOwn(facts, 'target'))) {
    return { ambiguous: true };
  }
  return { ambiguous: false, scope: authoritative, facts };
}

/**
 * Resolve the highest dual-retained governance revision for one case and verify
 * its exact batch freshly on both authoritative surfaces.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance
 */
function retainedGovernanceProjectionV2(inspection, governance) {
  /** @type {ReturnType<typeof dualSurfaceEventIndexV2>} */
  let index;
  try {
    index = dualSurfaceEventIndexV2(inspection);
  } catch {
    return { reason: 'projection-conflict' };
  }
  const revisions = [...index.currentRun.byHash.values()].filter((event) => (
    event.type === 'learning-governance'
      && event.governanceIdentity === governance.governanceIdentity
      && targetKey(event.target) === targetKey(governance.target)
  ));
  if (revisions.length === 0) return { reason: 'projection-missing-current-run' };
  // "Highest consistent projected revision" orders by revision and then by the
  // closed phase progression, because one revision may be snapshotted twice.
  const rank = (event) => (
    /** @type {number} */ (event.revision) * V2_GOVERNANCE_PHASES.length
      + V2_GOVERNANCE_PHASES.indexOf(/** @type {string} */ (event.phase))
  );
  const highest = Math.max(...revisions.map(rank));
  const candidates = revisions.filter((event) => rank(event) === highest);
  if (candidates.length !== 1) return { reason: 'projection-conflict' };
  const event = candidates[0];
  if (event.phase === 'reviewed') {
    const retained = retainedLearningResultV2(inspection, governance);
    if (retained.reason) return { reason: retained.reason };
    const batch = /** @type {Record<string, unknown>} */ (retained.batch);
    if (/** @type {Record<string, unknown>[]} */ (batch.events)[1].eventHash !== event.eventHash) {
      return { reason: 'projection-conflict' };
    }
    return { event, batch, projectionRef: retained.projectionRef };
  }
  try {
    const batch = buildProjectionBatchV1(
      'governance-required',
      /** @type {Record<string, unknown>} */ (governance.target),
      [event],
      'retained governance revision',
    );
    const outcome = verifyBatchProjectionV2(inspection, batch);
    if (!outcome.verified) return { reason: outcome.reason };
    return { event, batch, projectionRef: outcome.projectionRef };
  } catch {
    return { reason: 'projection-conflict' };
  }
}

/**
 * Derive the exact projection or re-derivation status of one governance case
 * from fresh evidence alone. `unavailable` is never derived here: it belongs to
 * the authoritative unrecoverable-governance-evidence halt.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance
 */
function immediateHaltProjectionEvidenceV2(inspection, governance) {
  const projected = retainedGovernanceProjectionV2(inspection, governance);
  if (!projected.reason) {
    const event = /** @type {Record<string, unknown>} */ (projected.event);
    return {
      disposition: 'verified',
      projectionRef: projected.projectionRef,
      governanceIdentity: governance.governanceIdentity,
      governanceRevision: event.revision,
      governanceEventHash: event.eventHash,
    };
  }
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return { reason: rebound.reason };
  const repeat = /** @type {Record<string, unknown>} */ (rebound.repeat);
  const retained = /** @type {Record<string, unknown>[]} */ (rebound.retained);
  const retainedOccurrences = /** @type {string[]} */ (repeat.occurrenceIdentities).map((identity) => {
    const matches = retained.filter((event) => event.occurrenceIdentity === identity);
    return matches.length === 1 ? { occurrenceIdentity: identity, eventHash: matches[0].eventHash } : null;
  });
  if (retainedOccurrences.some((reference) => reference === null)) {
    return { reason: 'occurrence-retention-incomplete' };
  }
  const proofWithoutIdentity = {
    version: 1,
    target: canonicalTarget(/** @type {Record<string, unknown>} */ (governance.target)),
    governanceIdentity: governance.governanceIdentity,
    repeat,
    failedApproachSetIdentity: /** @type {Record<string, unknown>} */ (rebound.failedApproachSet).setIdentity,
    retainedOccurrences,
  };
  const rederivationProof = {
    ...proofWithoutIdentity,
    proofIdentity: sha256(canonicalJson(proofWithoutIdentity)),
  };
  validateGovernanceRederivationProofV1(rederivationProof);
  return { disposition: 'rederive-required', rederivationProof };
}

/**
 * Derive one ephemeral Immediate Halt End outcome. It creates no controlled-end
 * permit, mutation, record, or receipt and never resolves learning.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance
 * @param {unknown} haltValue @param {string} label
 */
function deriveImmediateHaltEndV2(inspection, governance, haltValue, label) {
  const classified = classifyHaltScopeV2(haltValue, /** @type {Record<string, unknown>} */ (governance.target), label);
  if (classified.ambiguous) return { reason: 'halt-scope-ambiguous', scope: 'run' };
  const facts = /** @type {Record<string, unknown>} */ (classified.facts);
  let projectionEvidence;
  if (facts.kind === 'unrecoverable-governance-evidence') {
    projectionEvidence = { disposition: 'unavailable', unrecoverableEvidenceIdentity: facts.evidenceIdentity };
  } else {
    const derived = immediateHaltProjectionEvidenceV2(inspection, governance);
    // Governance that is neither safely retained nor deterministically
    // re-derivable stops the invocation without releasing required evidence.
    if (derived.reason) return { reason: 'unrecoverable-governance-evidence', scope: 'run' };
    projectionEvidence = derived;
  }
  const halt = {
    version: 1,
    scope: classified.scope,
    kind: facts.kind,
    reason: facts.reason,
    evidenceIdentity: facts.evidenceIdentity,
    ...(classified.scope === 'target'
      ? { target: canonicalTarget(/** @type {Record<string, unknown>} */ (governance.target)) }
      : {}),
    projectionDisposition: projectionEvidence.disposition,
  };
  validateHaltV1(halt);
  const outcome = {
    ok: false,
    invocationOutcome: 'immediate-halt-end',
    targetDisposition: 'unchanged',
    halt,
    projectionDisposition: projectionEvidence.disposition,
    projectionEvidence,
  };
  validateImmediateHaltOutcomeV1(outcome);
  return { scope: classified.scope, kind: facts.kind, outcome };
}

/**
 * Classify one authoritatively scoped halt without resolving learning. A
 * target-scoped stop leaves eligible sequential scheduling available; a run-wide
 * stop ends the invocation and starts no other target.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} haltValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function haltGovernanceV2(stateValue, inputValue, haltValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('haltGovernanceV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ halted: false, reason: 'learning-evidence-incomplete', state });
  requireResolvedOwnerMappingV2(inspection, /** @type {Record<string, unknown>} */ (governance.target), 'haltGovernanceV2');
  const derived = deriveImmediateHaltEndV2(inspection, governance, haltValue, 'halt');
  if (derived.reason) {
    return respond({
      halted: true,
      reason: derived.reason,
      scope: 'run',
      schedulingPreserved: false,
      state,
    });
  }
  return respond({
    halted: true,
    reason: derived.scope === 'run' ? 'run-halted' : 'target-halted',
    scope: derived.scope,
    // A target-scoped stop consumes no unrelated scheduling authority; a
    // run-wide stop consumes all of it.
    schedulingPreserved: derived.scope === 'target',
    // Byte-identical state: no permit, mutation, record, or receipt.
    state,
    outcome: derived.outcome,
  });
}

/**
 * Suspend the affected target unchanged and license exactly one eligible
 * disjoint candidate through Feature 005's own sequential decision.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} suspensionValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function suspendTargetV2(stateValue, inputValue, suspensionValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('suspendTargetV2', 'requires autonomous policy');
  }
  const request = assertExactRecord(suspensionValue, ['scheduling'], ['halt'], 'suspend-target request');
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ suspended: false, reason: 'learning-evidence-incomplete', state });
  if (Object.hasOwn(governance, 'suspension')) {
    return respond({ suspended: false, reason: 'learning-phase-mismatch', state });
  }
  const target = /** @type {Record<string, unknown>} */ (governance.target);
  requireResolvedOwnerMappingV2(inspection, target, 'suspendTargetV2');
  let suspensionReason = 'unresolved-learning';
  let haltScoped = false;
  if (Object.hasOwn(request, 'halt')) {
    const classified = classifyHaltScopeV2(request.halt, target, 'suspend-target request.halt');
    if (classified.ambiguous) {
      return respond({ suspended: false, reason: 'halt-scope-ambiguous', scope: 'run', state });
    }
    if (classified.scope === 'run') {
      // A run-wide stop authorizes no suspension and starts no other target.
      return respond({ suspended: false, reason: 'run-halted', scope: 'run', state });
    }
    haltScoped = true;
    suspensionReason = /** @type {Record<string, unknown>} */ (classified.facts).kind === 'per-target-budget'
      ? 'per-target-budget'
      : 'target-hard-stop';
  } else if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return respond({ suspended: false, reason: 'inspection-stale', state });
  }
  const projectionEvidence = immediateHaltProjectionEvidenceV2(inspection, governance);
  if (projectionEvidence.reason) {
    return respond({ suspended: false, reason: projectionEvidence.reason, state });
  }
  if (!haltScoped && projectionEvidence.disposition !== 'verified') {
    // Without an immediate-halt exception, unchanged suspension waits until the
    // bounded unresolved event is safely projected and retained.
    return respond({ suspended: false, reason: 'governance-unresolved', state });
  }
  if (/** @type {unknown[]} */ (state.pending).length !== 0) {
    return respond({ suspended: false, reason: 'concurrency-forbidden', state });
  }
  const scheduling = assertExactRecord(
    request.scheduling,
    ['stopped', 'candidate'],
    [],
    'suspend-target request.scheduling',
  );
  const stopped = assertExactRecord(
    scheduling.stopped,
    ['reason', 'changeSet'],
    [],
    'suspend-target request.scheduling.stopped',
  );
  const candidate = assertExactRecord(
    scheduling.candidate,
    ['target', 'changeSet', 'deps'],
    [],
    'suspend-target request.scheduling.candidate',
  );
  // Feature 005's exact readiness, dependency-independence, and change-set
  // disjointness decision. It licenses one candidate and starts nothing.
  const licensed = mayScheduleAfterStop(
    { outcome: { reason: stopped.reason, state }, target, changeSet: stopped.changeSet },
    candidate,
  );
  if (!licensed) return respond({ suspended: false, reason: 'scheduling-ineligible', state });
  const affectedChangeSet = /** @type {string[]} */ (
    assertSortedUniqueStrings(stopped.changeSet, assertMaterialTarget, 'suspend-target request.scheduling.stopped.changeSet')
  );
  const selectedChangeSet = /** @type {string[]} */ (
    assertSortedUniqueStrings(candidate.changeSet, assertMaterialTarget, 'suspend-target request.scheduling.candidate.changeSet')
  );
  const declaredDependencies = /** @type {string[]} */ (
    assertDenseDataArray(candidate.deps, 'suspend-target request.scheduling.candidate.deps')
  );
  const affectedTarget = /** @type {Record<string, unknown>} */ (canonicalTarget(target));
  const suspensionWithoutIdentity = {
    version: 1,
    reason: suspensionReason,
    affectedTarget,
    affectedChangeSetHash: sha256(canonicalJson(affectedChangeSet)),
    selectedTarget: canonicalTarget(candidate.target),
    selectedChangeSetHash: sha256(canonicalJson(selectedChangeSet)),
    readinessEvidenceHash: sha256(canonicalJson({
      version: 1,
      evidenceHash: inspection.evidenceHash,
      pendingAuthorizations: /** @type {unknown[]} */ (state.pending).length,
      stoppedReason: stopped.reason,
    })),
    dependencyProofHash: sha256(canonicalJson({
      version: 1,
      stoppedDurableId: affectedTarget.taskKey ?? affectedTarget.issueId,
      declaredDependencies,
    })),
    disjointnessProofHash: sha256(canonicalJson({
      version: 1,
      affectedChangeSet,
      selectedChangeSet,
    })),
  };
  const suspension = {
    ...suspensionWithoutIdentity,
    schedulingEvidenceIdentity: sha256(canonicalJson(suspensionWithoutIdentity)),
  };
  validateSuspensionV1(suspension);
  // The governed phase, trigger, failed set, and lane disposition stay unchanged.
  const nextState = governanceSuccessorStateV2(state, governance, { suspension });
  return respond({
    suspended: true,
    reason: 'target-suspended',
    state: nextState,
    suspension,
    projectionDisposition: projectionEvidence.disposition,
    projectionEvidence,
  });
}

/**
 * Rebind the branch evidence of one eligible unresolved phase from the fresh
 * rebound evidence and dual-retained learning result, and recompute the stored
 * post-learning identity exactly as its owning route derived it. A stored hash
 * alone never carries a selected alternative, discriminating check, or
 * un-drifted post-learning claim.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance
 * @param {Record<string, unknown>} rebound @param {Record<string, unknown>} retained
 */
function reboundBranchEvidenceV2(inspection, governance, rebound, retained) {
  const reviewEvent = /** @type {Record<string, unknown>} */ (retained.reviewEvent);
  const failedApproachSet = /** @type {Record<string, unknown>} */ (rebound.failedApproachSet);
  const failedApproachSetIdentity = failedApproachSet.setIdentity;
  const projectionRef = /** @type {Record<string, unknown>} */ (retained.projectionRef);
  let alternatives;
  try {
    alternatives = requireCompleteFailedSetComparisonV2(
      reviewEvent.alternatives,
      failedApproachSet,
      'retained learning review alternatives',
    );
  } catch {
    return { reason: 'failed-approach-set-mismatch' };
  }
  if (governance.phase === 'alternative-inspected') {
    if (reviewEvent.outcome !== 'selected-alternative') return { reason: 'inspection-branch-mismatch' };
    const selected = alternatives.credible.filter((row) => (
      row.alternativeIdentity === reviewEvent.selectedAlternativeIdentity
        && row.alternativeIdentity === governance.selectedAlternativeIdentity
    ));
    const discriminatingCheckIdentity = selected.length === 1
      ? /** @type {Record<string, unknown>} */ (selected[0].discriminatingCheck).identity
      : null;
    if (selected.length !== 1 || discriminatingCheckIdentity !== governance.discriminatingCheckIdentity) {
      return { reason: 'alternative-selection-mismatch' };
    }
    // Recomputed exactly as `bindPostLearningInspectionV2` derives it, so
    // post-learning Inspection evidence drift cannot survive as a stored hash.
    const bindingWithoutIdentity = {
      version: 1,
      target: canonicalTarget(/** @type {Record<string, unknown>} */ (governance.target)),
      governanceIdentity: governance.governanceIdentity,
      repeatIdentity: sha256(canonicalJson(rebound.repeat)),
      reviewIdentity: governance.reviewIdentity,
      failedApproachSetIdentity,
      projectionRef,
      evidenceHash: inspection.evidenceHash,
      branchIdentity: sha256(canonicalJson({
        selectedAlternativeIdentity: selected[0].alternativeIdentity,
        discriminatingCheckIdentity,
        failedApproachSetIdentity,
      })),
      expectedProjectionEventHashes: projectionRef.eventHashes,
    };
    if (sha256(canonicalJson(bindingWithoutIdentity)) !== governance.postLearningInspectionIdentity) {
      return { reason: 'inspection-stale' };
    }
    return {
      branchEvidence: {
        kind: 'selected-alternative',
        sourcePhase: 'alternative-inspected',
        selectedAlternativeIdentity: selected[0].alternativeIdentity,
        discriminatingCheckIdentity,
        postLearningInspectionIdentity: governance.postLearningInspectionIdentity,
      },
    };
  }
  if (reviewEvent.outcome !== 'no-progress') return { reason: 'inspection-branch-mismatch' };
  const proof = /** @type {Record<string, unknown>} */ (reviewEvent.noProgressProof);
  if (proof.failedApproachSetIdentity !== failedApproachSetIdentity
    || proof.completeEvidenceHash !== noProgressCompleteEvidenceHashV2(
      failedApproachSet,
      /** @type {Record<string, unknown>[]} */ (rebound.retained),
    )) return { reason: 'new-distinguishing-evidence' };
  // Recomputed exactly as `verifyNoProgressV2` derives it.
  const noProgressCore = {
    noProgressProofIdentity: proof.proofIdentity,
    failedApproachSetIdentity,
    preLearningEvidenceHash: reviewEvent.preLearningEvidenceHash,
    postLearningEvidenceHash: inspection.evidenceHash,
    expectedProjectionEventHashes: projectionRef.eventHashes,
    distinguishingEvidenceIdentities: [],
  };
  const verificationWithoutIdentity = {
    version: 2,
    ...noProgressCore,
    noNewDistinguishingEvidenceHash: sha256(canonicalJson(noProgressCore)),
  };
  if (sha256(canonicalJson(verificationWithoutIdentity)) !== governance.postLearningInspectionIdentity) {
    return { reason: 'inspection-stale' };
  }
  return {
    branchEvidence: {
      kind: 'no-progress',
      sourcePhase: 'no-progress-verified',
      noProgressProofIdentity: proof.proofIdentity,
      // On this branch the stored identity is a NoProgressVerificationV2
      // identity, not a Post-Learning Inspection binding.
      noProgressVerificationIdentity: governance.postLearningInspectionIdentity,
    },
  };
}

/**
 * Take the ordinary Controlled Unresolved End from `alternative-inspected` or
 * `no-progress-verified` only. It resolves the governance branch for audit while
 * the target lane disposition stays pending and unchanged.
 * @param {unknown} stateValue @param {unknown} inputValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function controlledEndV2(stateValue, inputValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('controlledEndV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ ended: false, reason: 'learning-evidence-incomplete', state });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0
    || targetKey(inspection.target) !== targetKey(governance.target)) {
    return respond({ ended: false, reason: 'inspection-stale', state });
  }
  // Phase `projected` and every other phase are explicitly ineligible.
  if (Object.hasOwn(governance, 'controlledEnd')
    || (governance.phase !== 'alternative-inspected' && governance.phase !== 'no-progress-verified')) {
    return respond({ ended: false, reason: 'controlled-end-unavailable', state });
  }
  requireResolvedOwnerMappingV2(inspection, /** @type {Record<string, unknown>} */ (governance.target), 'controlledEndV2');
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return respond({ ended: false, reason: rebound.reason, state });
  const retained = retainedLearningResultV2(inspection, governance);
  if (retained.reason) return respond({ ended: false, reason: retained.reason, state });
  const reviewEvent = /** @type {Record<string, unknown>} */ (retained.reviewEvent);
  const derived = reboundBranchEvidenceV2(inspection, governance, rebound, retained);
  if (derived.reason) return respond({ ended: false, reason: derived.reason, state });
  const endWithoutIdentity = {
    version: 1,
    kind: 'controlled-unresolved-end',
    branchEvidence: derived.branchEvidence,
    governanceBranchStatus: 'resolved',
    laneDisposition: 'pending',
    targetDisposition: 'unchanged',
    invocationOutcome: 'controlled-unresolved-end',
    reviewIdentity: governance.reviewIdentity,
    learningReviewEventHash: reviewEvent.eventHash,
    projectionRef: retained.projectionRef,
  };
  const controlledEnd = {
    ...endWithoutIdentity,
    endIdentity: sha256(canonicalJson(endWithoutIdentity)),
  };
  validateControlledUnresolvedEndV1(controlledEnd);
  // The phase, target, and lane disposition all stay unchanged: this is neither
  // a block, a close, a completion, nor an applied no-progress disposition.
  const nextState = governanceSuccessorStateV2(state, governance, { controlledEnd });
  return respond({
    ended: true,
    reason: 'controlled-unresolved-end',
    state: nextState,
    controlledEnd,
  });
}

/**
 * Restore required governance from the highest consistent projected revision, or
 * deterministically re-derive it from the exact dual-retained occurrence events.
 * @param {unknown} stateValue @param {unknown} inputValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function resumeGovernanceV2(stateValue, inputValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('resumeGovernanceV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return respond({ resumed: false, reason: 'inspection-stale', state });
  }
  const existing = activeGovernanceCaseV2(state);
  const target = canonicalTarget(validateAffectedTargetV2(
    existing ? existing.target : inspection.target,
    'resumeGovernanceV2.target',
  ));
  if (!existing && Object.hasOwn(state, 'pendingCompletion')) {
    return respond({ resumed: false, reason: 'occurrence-retention-incomplete', state });
  }
  if (!existing && Object.hasOwn(state, 'learningGovernance')) {
    // A seal this route cannot read still occupies the singleton and may govern
    // another target; overwriting it would transfer authority. An occupied
    // singleton is a conflict, never derivable failed-approach-set excess.
    return respond({ resumed: false, reason: 'learning-governance-conflict', state });
  }
  requireResolvedOwnerMappingV2(inspection, target, 'resumeGovernanceV2');
  let retained;
  try {
    retained = dualRetainedOccurrenceEventsV2(inspection);
    validateRetainedOccurrenceAuthorityV2(retained.retained, trustedEnvelopeIndexFromInspectionV2(inspection));
  } catch {
    return respond({ resumed: false, reason: 'occurrence-retention-incomplete', state });
  }
  const repeat = deriveEarliestRepeatRelationshipV1(retained.retained);
  if (!repeat) return respond({ resumed: false, reason: 'repeat-not-established', state });
  let failedApproachSet;
  try {
    failedApproachSet = deriveFailedApproachSetV1(repeat, retained.retained);
  } catch (error) {
    if (error instanceof TypeError
      && error.message === 'FailedApproachSetV1 exceeds the complete failed-approach capacity') {
      return respond({ resumed: false, reason: 'learning-governance-capacity', state });
    }
    throw error;
  }
  const governanceIdentity = sha256(canonicalJson({
    version: 1,
    target,
    repeatIdentity: sha256(canonicalJson(repeat)),
  }));
  if (existing) {
    if (existing.governanceIdentity !== governanceIdentity
      || canonicalJson(existing.trigger) !== canonicalJson(repeat)
      || canonicalJson(existing.failedApproachSet) !== canonicalJson(failedApproachSet)) {
      return respond({ resumed: false, reason: 'repeat-not-established', state });
    }
    const projected = retainedGovernanceProjectionV2(inspection, existing);
    if (projected.reason) return respond({ resumed: false, reason: 'governance-unresolved', state });
    return respond({
      resumed: true,
      reason: 'governance-resumed',
      resumedFrom: 'projected-revision',
      state,
      governanceIdentity,
      revision: /** @type {Record<string, unknown>} */ (projected.event).revision,
      phase: existing.phase,
      trigger: repeat,
      failedApproachSet,
      projectionRef: projected.projectionRef,
    });
  }
  if (/** @type {Record<string, unknown>[]} */ (state.pending)
    .some((entry) => targetKey(entry.target) === targetKey(target))) {
    return respond({ resumed: false, reason: 'concurrency-forbidden', state });
  }
  const governance = {
    version: 1,
    governanceIdentity,
    target,
    trigger: repeat,
    failedApproachSet,
    phase: 'required',
    revision: 1,
    triggerEvidenceHash: sha256(canonicalJson({
      trigger: repeat,
      failedApproachSetIdentity: failedApproachSet.setIdentity,
    })),
  };
  validateLearningGovernanceV1(governance);
  const nextState = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: /** @type {Record<string, unknown>[]} */ (state.pending).map(copyPendingEntry),
    completed: /** @type {Record<string, unknown>[]} */ (state.completed).map((entry) => ({ ...entry })),
  });
  nextState.learningGovernance = governance;
  validateRunState(nextState);
  return respond({
    resumed: true,
    reason: 'governance-resumed',
    resumedFrom: 'retained-occurrences',
    state: nextState,
    governanceIdentity,
    revision: 1,
    phase: 'required',
    trigger: repeat,
    failedApproachSet,
  });
}

/**
 * Render one conditional `AuditSummaryV2` from the byte-equivalent intersection
 * of the freshly reacquired current-run and lane surfaces, never their union.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} haltValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function auditGovernanceV2(stateValue, inputValue, haltValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('auditGovernanceV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} audit */
  const respond = (audit) => ({ inspection, audit });
  const governance = activeGovernanceCaseV2(state);
  if (!governance) return respond({ derived: false, reason: 'learning-evidence-incomplete', state });
  requireResolvedOwnerMappingV2(inspection, /** @type {Record<string, unknown>} */ (governance.target), 'auditGovernanceV2');
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return respond({ derived: false, reason: rebound.reason, state });
  /** @type {ReturnType<typeof dualSurfaceEventIndexV2>} */
  let index;
  try {
    index = dualSurfaceEventIndexV2(inspection);
  } catch {
    return respond({ derived: false, reason: 'projection-conflict', state });
  }
  // Intersection only: a one-sided or conflicting event contributes no row.
  const evidenceEventHashes = [...index.currentRun.byHash.entries()]
    .filter(([eventHash, event]) => {
      const lane = index.lane.byHash.get(eventHash);
      return Boolean(lane)
        && index.currentRun.counts.get(eventHash) === 1
        && index.lane.counts.get(eventHash) === 1
        && canonicalJson(lane) === canonicalJson(event)
        && targetKey(event.target) === targetKey(governance.target);
    })
    .map(([eventHash]) => eventHash)
    .sort(compareUtf8);
  let immediateHaltEnd;
  let scope = 'target';
  if (haltValue !== undefined) {
    const derived = deriveImmediateHaltEndV2(inspection, governance, haltValue, 'audit request.halt');
    if (derived.reason) return respond({ derived: false, reason: derived.reason, state });
    immediateHaltEnd = /** @type {Record<string, unknown>} */ (derived.outcome);
    scope = /** @type {string} */ (derived.scope);
  }
  const projectionEvidence = immediateHaltEnd
    ? { disposition: immediateHaltEnd.projectionDisposition }
    : immediateHaltProjectionEvidenceV2(inspection, governance);
  if (projectionEvidence.reason) {
    return respond({ derived: false, reason: 'unrecoverable-governance-evidence', state });
  }
  const controlledEnd = Object.hasOwn(governance, 'controlledEnd')
    ? /** @type {Record<string, unknown>} */ (governance.controlledEnd)
    : null;
  const suspension = Object.hasOwn(governance, 'suspension')
    ? /** @type {Record<string, unknown>} */ (governance.suspension)
    : null;
  const invocationOutcome = immediateHaltEnd
    ? 'immediate-halt-end'
    : controlledEnd ? 'controlled-unresolved-end' : 'in-progress';
  /** @type {Record<string, unknown>|null} */
  let branchEvidence = null;
  if (controlledEnd
    || governance.phase === 'alternative-inspected'
    || governance.phase === 'no-progress-verified') {
    // Every branch and controlled-end row is backed by the byte-equivalent
    // intersection, never by a stored RunState hash.
    const retained = retainedLearningResultV2(inspection, governance);
    if (retained.reason) return respond({ derived: false, reason: retained.reason, state });
    if (controlledEnd) {
      if (!evidenceEventHashes.includes(/** @type {string} */ (controlledEnd.learningReviewEventHash))
        || controlledEnd.learningReviewEventHash
          !== /** @type {Record<string, unknown>} */ (retained.reviewEvent).eventHash
        || canonicalJson(controlledEnd.projectionRef) !== canonicalJson(retained.projectionRef)) {
        return respond({ derived: false, reason: 'projection-conflict', state });
      }
    } else {
      const derivedBranch = reboundBranchEvidenceV2(inspection, governance, rebound, retained);
      if (derivedBranch.reason) return respond({ derived: false, reason: derivedBranch.reason, state });
      const branch = /** @type {Record<string, unknown>} */ (derivedBranch.branchEvidence);
      // A `no-progress-verified` row resolves its identity as a verification
      // alone; the proof identity belongs to the controlled-end record.
      branchEvidence = branch.kind === 'selected-alternative' ? branch : {
        kind: 'no-progress',
        sourcePhase: 'no-progress-verified',
        noProgressVerificationIdentity: branch.noProgressVerificationIdentity,
      };
    }
  }
  const summaryWithoutIdentity = {
    version: 2,
    target: canonicalTarget(/** @type {Record<string, unknown>} */ (governance.target)),
    governanceIdentity: governance.governanceIdentity,
    // Re-derived from the retained occurrence events, never read from state.
    trigger: rebound.repeat,
    channel: /** @type {Record<string, unknown>} */ (rebound.repeat).channel,
    learningRequirement: controlledEnd ? 'resolved' : 'unresolved',
    governanceStatus: governance.phase,
    targetDisposition: 'unchanged',
    invocationOutcome,
    scope,
    unresolvedReason: immediateHaltEnd
      ? /** @type {Record<string, unknown>} */ (immediateHaltEnd.halt).kind
      : controlledEnd ? 'controlled-unresolved-end' : suspension ? suspension.reason : 'learning-required',
    schedulingOutcome: scope === 'run'
      ? 'invocation-stopped'
      : suspension ? 'sequential-disjoint-continuation' : 'none',
    projectionDisposition: projectionEvidence.disposition,
    failedApproachSetIdentity: /** @type {Record<string, unknown>} */ (rebound.failedApproachSet).setIdentity,
    evidenceEventHashes,
    ...(branchEvidence ? { branchEvidence } : {}),
    ...(suspension ? { suspension } : {}),
    ...(controlledEnd ? { controlledEnd } : {}),
    ...(immediateHaltEnd ? { immediateHaltEnd } : {}),
  };
  const summary = {
    ...summaryWithoutIdentity,
    summaryIdentity: sha256(canonicalJson(summaryWithoutIdentity)),
  };
  validateAuditSummaryV2(summary);
  return respond({ derived: true, reason: 'audit-derived', state, summary });
}

// === Feature 009 (T005): acyclic permits, receipts, and incident contracts ==
// Authority flows in one direction only: post-learning Inspection, pure attempt
// permit, `authorize`, optional lane claim, receipt commit, execution, retained
// completion, and terminal lane mutation. Every permit binds the exact subject
// RunState it was issued against, so no permit survives the mutation it
// authorizes. Nothing here trusts a stored governance hash: each route rebinds
// the trigger, failed set, learning result, and branch evidence from the fresh
// dual-retained surfaces before a permit may act on them. Incident correction
// derives intent, then branch-authorized events, then batches, then the preview,
// then the whole-object mutation, and no event ever references `previewIdentity`.

const V2_LANES = Object.freeze(['lightweight', 'tracked']);
const V2_GLYPHS = Object.freeze([' ', '~', '!', 'x']);
const V2_TRACKED_STATUSES = Object.freeze(['open', 'in_progress', 'blocked', 'closed']);
const V2_STATE_GLYPHS = Object.freeze({ todo: ' ', 'in-progress': '~', blocked: '!', done: 'x' });
const V2_LANE_STATE_KINDS = Object.freeze(['claim', 'task-blocked', 'task-completed', 'controlled-end']);
const V2_LANE_REASONS = Object.freeze([
  'initial-claim', 'resume-claim', 'post-learning-claim',
  'task-blocked', 'no-progress', 'task-completed', 'controlled-unresolved-end',
]);
const V2_LANE_KIND_REASONS = Object.freeze({
  'append-event': Object.freeze(['event-projection']),
  claim: Object.freeze(['initial-claim', 'resume-claim', 'post-learning-claim']),
  // A verified no-progress exit blocks the exact task, so it is a task-blocked
  // mutation carrying its own terminal reason.
  'task-blocked': Object.freeze(['task-blocked', 'no-progress']),
  'task-completed': Object.freeze(['task-completed']),
  'controlled-end': Object.freeze(['controlled-unresolved-end']),
  'incident-supersession': Object.freeze(['incident-supersession']),
});
const V2_AUTHORIZED_PHASES = Object.freeze([
  'alternative-authorized-pending-lane', 'alternative-authorized', 'alternative-verified',
]);
const TASK_STATE_PATH = '.dude/state/task-state.json';
const FEATURE_007_TARGET = Object.freeze({
  specPath: '.dude/specs/007-technical-docs-pack-remediation/spec.md',
  lane: 'lightweight',
  taskKey: 'T001@00709e37',
});
const FEATURE_007_IDEA_PATH = '.dude/ideas/technical-docs-pack-remediation.md';
const FEATURE_007_TASKS_PATH = '.dude/specs/007-technical-docs-pack-remediation/tasks.md';
const INCIDENT_INCOMPLETE_BLOCKER =
  'contract-mismatch: evidence-incomplete autonomous review occurrence evidence unavailable';
const V2_INCIDENT_INCOMPLETE_REASONS = Object.freeze([
  'occurrence-retention-incomplete', 'repeat-not-established', 'finding-repeat-unavailable',
]);
const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** @param {unknown} value @param {string} label */
function assertV2ShortText(value, label) {
  assertUnicodeScalarString(value, label);
  const text = /** @type {string} */ (value);
  const bytes = Buffer.byteLength(text);
  if (bytes < 1 || bytes > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(text)) {
    invalid(label, 'must be control-free ShortText of 1 through 1,024 UTF-8 bytes');
  }
  return text;
}

/** @param {unknown} value @param {string} label */
function assertV2CanonicalUtcTimestamp(value, label) {
  assertUnicodeScalarString(value, label);
  if (!CANONICAL_UTC_PATTERN.test(/** @type {string} */ (value))) {
    invalid(label, 'must be a canonical UTC timestamp');
  }
  return /** @type {string} */ (value);
}

/** @param {unknown} value @param {string} label */
function validateByteDescriptorV1(value, label) {
  const descriptor = assertExactRecord(value, ['sha256', 'byteLength'], [], label);
  assertHash(descriptor.sha256, `${label}.sha256`);
  assertSafeInteger(descriptor.byteLength, `${label}.byteLength`, false);
  return descriptor;
}

/** The exact canonical RunState subject one permit is issued against. @param {Record<string, unknown>} state */
function v2RunStateHash(state) {
  return sha256(canonicalJson(state));
}

/** @param {Record<string, unknown>} target */
function v2TasksPathForTarget(target) {
  return `${/** @type {string} */ (target.specPath).slice(0, -'spec.md'.length)}tasks.md`;
}

/**
 * Validate one complete lane-specific target mapping and return its identity.
 * @param {unknown} value @param {Record<string, unknown>} target @param {string} label
 */
function validateTargetMappingV1(value, target, label) {
  const record = assertRecord(value, label);
  assertEnum(record.lane, V2_LANES, `${label}.lane`);
  const mapping = record.lane === 'lightweight'
    ? assertExactRecord(
      value,
      ['version', 'lane', 'target', 'ownerBindingHash', 'tasksPath', 'tasksDescriptor', 'taskStatePath', 'taskStateDescriptor', 'taskKey'],
      [],
      label,
    )
    : assertExactRecord(
      value,
      ['version', 'lane', 'target', 'ownerBindingHash', 'taskKey', 'listDescriptor', 'detailDescriptor', 'historyDescriptor'],
      [],
      label,
    );
  if (mapping.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const mappedTarget = validateAffectedTargetV2(mapping.target, `${label}.target`);
  if (mappedTarget.lane !== mapping.lane) invalid(`${label}.lane`, 'must match the mapped target lane');
  if (targetKey(mappedTarget) !== targetKey(target)) invalid(`${label}.target`, 'must be the exact affected target');
  assertHash(mapping.ownerBindingHash, `${label}.ownerBindingHash`);
  assertTaskKeyString(mapping.taskKey, `${label}.taskKey`);
  if (mapping.lane === 'lightweight') {
    if (mapping.taskKey !== mappedTarget.taskKey) invalid(`${label}.taskKey`, 'must equal the Lightweight target task key');
    if (mapping.tasksPath !== v2TasksPathForTarget(mappedTarget)) {
      invalid(`${label}.tasksPath`, 'must be the canonical package tasks path');
    }
    if (mapping.taskStatePath !== TASK_STATE_PATH) invalid(`${label}.taskStatePath`, `must be ${TASK_STATE_PATH}`);
    validateByteDescriptorV1(mapping.tasksDescriptor, `${label}.tasksDescriptor`);
    validateByteDescriptorV1(mapping.taskStateDescriptor, `${label}.taskStateDescriptor`);
  } else {
    for (const field of ['listDescriptor', 'detailDescriptor', 'historyDescriptor']) {
      validateByteDescriptorV1(mapping[field], `${label}.${field}`);
    }
  }
  return { mapping, targetMappingHash: sha256(canonicalJson(mapping)) };
}

/**
 * Validate one complete lane prestate, bind it to the same mapping descriptors,
 * and return its identity.
 * @param {unknown} value @param {Record<string, unknown>} target @param {Record<string, unknown>} mapping @param {string} label
 */
function validateLanePrestateV1(value, target, mapping, label) {
  const record = assertRecord(value, label);
  assertEnum(record.lane, V2_LANES, `${label}.lane`);
  const prestate = record.lane === 'lightweight'
    ? assertExactRecord(
      value,
      ['version', 'lane', 'target', 'glyph', 'blockedBy', 'tasksDescriptor', 'taskStateDescriptor', 'ownerDescriptor'],
      [],
      label,
    )
    : assertExactRecord(
      value,
      ['version', 'lane', 'target', 'taskKey', 'status', 'blocker', 'listDescriptor', 'detailDescriptor', 'historyDescriptor', 'ownerDescriptor'],
      [],
      label,
    );
  if (prestate.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const prestateTarget = validateAffectedTargetV2(prestate.target, `${label}.target`);
  if (prestate.lane !== mapping.lane) invalid(`${label}.lane`, 'must match the mapped lane');
  if (targetKey(prestateTarget) !== targetKey(target)) invalid(`${label}.target`, 'must be the exact affected target');
  validateByteDescriptorV1(prestate.ownerDescriptor, `${label}.ownerDescriptor`);
  if (prestate.lane === 'lightweight') {
    assertEnum(prestate.glyph, V2_GLYPHS, `${label}.glyph`);
    if (prestate.blockedBy !== null) assertV2ShortText(prestate.blockedBy, `${label}.blockedBy`);
    for (const field of ['tasksDescriptor', 'taskStateDescriptor']) {
      validateByteDescriptorV1(prestate[field], `${label}.${field}`);
      if (canonicalJson(prestate[field]) !== canonicalJson(mapping[field])) {
        invalid(`${label}.${field}`, 'must equal the mapped fresh descriptor');
      }
    }
  } else {
    assertTaskKeyString(prestate.taskKey, `${label}.taskKey`);
    if (prestate.taskKey !== mapping.taskKey) invalid(`${label}.taskKey`, 'must equal the mapped durable task key');
    assertEnum(prestate.status, V2_TRACKED_STATUSES, `${label}.status`);
    if (prestate.blocker !== null) assertV2ShortText(prestate.blocker, `${label}.blocker`);
    for (const field of ['listDescriptor', 'detailDescriptor', 'historyDescriptor']) {
      validateByteDescriptorV1(prestate[field], `${label}.${field}`);
      if (canonicalJson(prestate[field]) !== canonicalJson(mapping[field])) {
        invalid(`${label}.${field}`, 'must equal the mapped fresh descriptor');
      }
    }
  }
  return { prestate, lanePrestateHash: sha256(canonicalJson(prestate)) };
}

/**
 * Recompute the fresh Lightweight task facts one prestate claims. A caller can
 * supply captured bytes, never the task state they are supposed to prove.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} target
 */
function freshLightweightTaskFactsV2(inspection, target) {
  const taskHistory = assertExactRecord(
    inspectionSourceBodyV2(inspection, 'task-history'),
    ['path', 'canonicalTasks', 'dependencies', 'discovered', 'history'],
    [],
    'task-history Inspection body',
  );
  if (taskHistory.path !== v2TasksPathForTarget(target)) {
    invalid('task-history Inspection body.path', 'must be the canonical package tasks path');
  }
  const tasks = /** @type {Record<string, unknown>[]} */ (
    assertDenseDataArray(taskHistory.canonicalTasks, 'task-history Inspection body.canonicalTasks')
  );
  const rows = tasks.filter((task) => task.id === target.taskKey);
  if (rows.length !== 1) invalid('task-history Inspection body.canonicalTasks', 'must resolve exactly one canonical task unit');
  const task = rows[0];
  const glyph = Object.hasOwn(V2_STATE_GLYPHS, /** @type {string} */ (task.state))
    ? V2_STATE_GLYPHS[/** @type {string} */ (task.state)]
    : invalid('task-history Inspection body.canonicalTasks[0].state', 'must be a canonical task state');
  return {
    task,
    glyph,
    blockedBy: typeof task.blockedBy === 'string' && task.blockedBy.length > 0 ? task.blockedBy : null,
    taskUnitHash: sha256(canonicalJson(task)),
  };
}

/** Fail closed when a supplied Lightweight prestate contradicts fresh Inspection facts. @param {Record<string, unknown>} inspection @param {Record<string, unknown>} target @param {Record<string, unknown>} prestate */
function lanePrestateMatchesFreshEvidenceV2(inspection, target, prestate) {
  if (prestate.lane !== 'lightweight') return true;
  const fresh = freshLightweightTaskFactsV2(inspection, target);
  return prestate.glyph === fresh.glyph && prestate.blockedBy === fresh.blockedBy;
}

/** @param {unknown} value @param {string} label */
function validateBlockerEffectV1(value, label) {
  const effect = assertExactRecord(value, ['kind', 'before', 'after'], [], label);
  assertEnum(effect.kind, ['unchanged', 'add', 'remove', 'replace'], `${label}.kind`);
  for (const field of ['before', 'after']) {
    if (effect[field] !== null) assertV2ShortText(effect[field], `${label}.${field}`);
  }
  if (effect.kind === 'unchanged' && effect.before !== effect.after) {
    invalid(label, 'unchanged requires byte-identical before and after');
  }
  if (effect.kind === 'add' && (effect.before !== null || effect.after === null)) {
    invalid(label, 'add requires a null before and a present after');
  }
  if (effect.kind === 'remove' && (effect.before === null || effect.after !== null)) {
    invalid(label, 'remove requires a present before and a null after');
  }
  if (effect.kind === 'replace'
    && (effect.before === null || effect.after === null || effect.before === effect.after)) {
    invalid(label, 'replace requires two byte-distinct present values');
  }
  return effect;
}

/** Parse one exact `EventLineText` and require it to carry its declared event hash. @param {unknown} value @param {string} label */
function validateEventLineAppendV1(value, label) {
  const line = assertExactRecord(value, ['eventHash', 'exactLine', 'terminator'], [], label);
  assertHash(line.eventHash, `${label}.eventHash`);
  assertUnicodeScalarString(line.exactLine, `${label}.exactLine`);
  if (line.terminator !== 'LF') invalid(`${label}.terminator`, 'must be the literal LF');
  const text = /** @type {string} */ (line.exactLine);
  if (!text.startsWith(LANE_EVENT_PREFIX) || /[\r\n]/.test(text)) {
    invalid(`${label}.exactLine`, 'must be one canonical autonomous v2 event line without CR or LF');
  }
  if (Buffer.byteLength(text) > MAX_EVENT_LINE_TEXT_BYTES) {
    invalid(`${label}.exactLine`, `must serialize to at most ${MAX_EVENT_LINE_TEXT_BYTES} UTF-8 bytes`);
  }
  const suffix = text.slice(LANE_EVENT_PREFIX.length);
  let parsed;
  try {
    parsed = JSON.parse(suffix);
  } catch {
    invalid(`${label}.exactLine`, 'must carry one canonical JSON event body');
  }
  if (canonicalJson(parsed) !== suffix) invalid(`${label}.exactLine`, 'must carry canonical JSON bytes');
  const event = /** @type {Record<string, unknown>} */ (assertRecord(parsed, `${label}.exactLine event`));
  validateV2ProjectableEvent(event, `${label}.exactLine event`);
  if (event.eventHash !== line.eventHash) invalid(`${label}.eventHash`, 'must equal the parsed event hash');
  return { line, event };
}

/** @param {unknown} value @param {string} label */
function validateEventLineEffectV1(value, label) {
  const record = assertRecord(value, label);
  if (record.kind === 'none') {
    assertExactRecord(value, ['kind'], [], label);
    return { effect: record, events: [] };
  }
  const effect = assertExactRecord(value, ['kind', 'lines', 'appendIfAbsent'], [], label);
  if (effect.kind !== 'append-exact') invalid(`${label}.kind`, 'must be none or append-exact');
  if (effect.appendIfAbsent !== true) invalid(`${label}.appendIfAbsent`, 'must be the literal true');
  const rows = assertDenseDataArray(effect.lines, `${label}.lines`);
  if (rows.length < 1 || rows.length > 4) invalid(`${label}.lines`, 'must contain 1 through 4 exact lines');
  const events = rows.map((row, index) => validateEventLineAppendV1(row, `${label}.lines[${index}]`).event);
  if (new Set(events.map((event) => event.eventHash)).size !== events.length) {
    invalid(`${label}.lines`, 'must be duplicate-free');
  }
  return { effect, events };
}

/** @param {unknown} value @param {string} label */
function validateOwnerLogEffectV1(value, label) {
  const record = assertRecord(value, label);
  if (record.kind === 'none') {
    assertExactRecord(value, ['kind'], [], label);
    return record;
  }
  const effect = assertExactRecord(
    value,
    ['kind', 'ownerPath', 'expectedOwnerHash', 'exactLines', 'terminator', 'appendIfAbsent'],
    [],
    label,
  );
  if (effect.kind !== 'append-exact') invalid(`${label}.kind`, 'must be none or append-exact');
  assertDirectIdeaPath(effect.ownerPath, `${label}.ownerPath`);
  assertHash(effect.expectedOwnerHash, `${label}.expectedOwnerHash`);
  if (effect.terminator !== 'LF') invalid(`${label}.terminator`, 'must be the literal LF');
  if (effect.appendIfAbsent !== true) invalid(`${label}.appendIfAbsent`, 'must be the literal true');
  const lines = assertDenseDataArray(effect.exactLines, `${label}.exactLines`);
  if (lines.length < 1 || lines.length > 4) invalid(`${label}.exactLines`, 'must contain 1 through 4 exact lines');
  lines.forEach((line, index) => {
    assertV2ShortText(line, `${label}.exactLines[${index}]`);
    if (/[\r\n]/.test(/** @type {string} */ (line))) {
      invalid(`${label}.exactLines[${index}]`, 'must contain no CR or LF');
    }
  });
  return effect;
}

/** The closed lane transition matrix. @param {Record<string, unknown>} mutation @param {string} from @param {string} to @param {string} blockerKind @param {string} label */
function requireClosedLaneTransitionV2(mutation, from, to, blockerKind, blocker, label) {
  const lightweight = mutation.lane === 'lightweight';
  const claimed = lightweight ? '~' : 'in_progress';
  const blockedState = lightweight ? '!' : 'blocked';
  const doneState = lightweight ? 'x' : 'closed';
  const openState = lightweight ? ' ' : 'open';
  const nullBlocker = blockerKind === 'unchanged' && blocker.before === null && blocker.after === null;
  const allowed = (() => {
    switch (mutation.kind) {
      case 'append-event':
        return from === to && blockerKind === 'unchanged';
      case 'claim':
        return (from === openState && to === claimed && nullBlocker)
          || (from === blockedState && to === claimed && blockerKind === 'remove');
      case 'task-blocked':
        return ((from === openState || from === claimed) && to === blockedState && blockerKind === 'add')
          || (from === blockedState && to === blockedState && blockerKind === 'replace');
      case 'task-completed':
        return from === claimed && to === doneState && nullBlocker;
      case 'controlled-end':
        return from === to && from !== doneState && blockerKind === 'unchanged';
      case 'incident-supersession':
        return from === '!'
          && ((to === '~' && blockerKind === 'remove') || (to === '!' && blockerKind === 'replace'));
      default:
        return false;
    }
  })();
  if (!allowed) invalid(label, 'is not an allowed closed lane transition');
}

/**
 * Validate one complete closed lane-specific mutation object and derive its
 * whole-object identity. `mutationIdentity` is never derived from an abstract
 * kind, reason, target, event hash, or prestate summary.
 * @param {unknown} value @param {Record<string, unknown>} target @param {string} label
 */
function validateLaneMutationV1(value, target, label) {
  const record = assertRecord(value, label);
  assertEnum(record.lane, V2_LANES, `${label}.lane`);
  const lightweight = record.lane === 'lightweight';
  const incident = record.kind === 'incident-supersession';
  if (incident && !lightweight) invalid(`${label}.kind`, 'incident supersession is Lightweight only');
  const stateFields = lightweight ? ['fromGlyph', 'toGlyph'] : ['fromStatus', 'toStatus'];
  const mutation = assertExactRecord(
    value,
    incident
      ? ['version', 'lane', 'kind', 'reason', 'intentIdentity', 'previewIdentity', 'target', 'fromGlyph', 'toGlyph', 'blocker', 'eventLines', 'ownerLog', 'snapshotUpdatedAt']
      : [
        'version', 'lane', 'kind', 'reason', 'target', ...stateFields,
        'blocker', 'eventLines', 'ownerLog', ...(lightweight ? ['snapshotUpdatedAt'] : []),
      ],
    [],
    label,
  );
  if (mutation.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertEnum(
    mutation.kind,
    incident ? ['incident-supersession'] : ['append-event', ...V2_LANE_STATE_KINDS],
    `${label}.kind`,
  );
  assertEnum(
    mutation.reason,
    incident ? ['incident-supersession'] : ['event-projection', ...V2_LANE_REASONS],
    `${label}.reason`,
  );
  if (!V2_LANE_KIND_REASONS[/** @type {string} */ (mutation.kind)].includes(/** @type {string} */ (mutation.reason))) {
    invalid(`${label}.reason`, 'must match its exact mutation kind');
  }
  const mutationTarget = validateAffectedTargetV2(mutation.target, `${label}.target`);
  if (mutationTarget.lane !== mutation.lane) invalid(`${label}.lane`, 'must match the mutation target lane');
  if (targetKey(mutationTarget) !== targetKey(target)) invalid(`${label}.target`, 'must be the exact affected target');
  if (incident && canonicalJson(mutationTarget) !== canonicalJson(FEATURE_007_TARGET)) {
    invalid(`${label}.target`, 'must be the exact Feature 007 incident target');
  }
  if (incident) {
    assertHash(mutation.intentIdentity, `${label}.intentIdentity`);
    assertHash(mutation.previewIdentity, `${label}.previewIdentity`);
  }
  const from = /** @type {string} */ (mutation[stateFields[0]]);
  const to = /** @type {string} */ (mutation[stateFields[1]]);
  assertEnum(from, lightweight ? V2_GLYPHS : V2_TRACKED_STATUSES, `${label}.${stateFields[0]}`);
  assertEnum(to, lightweight ? V2_GLYPHS : V2_TRACKED_STATUSES, `${label}.${stateFields[1]}`);
  const blocker = validateBlockerEffectV1(mutation.blocker, `${label}.blocker`);
  const eventLines = validateEventLineEffectV1(mutation.eventLines, `${label}.eventLines`);
  validateOwnerLogEffectV1(mutation.ownerLog, `${label}.ownerLog`);
  if (lightweight) assertV2CanonicalUtcTimestamp(mutation.snapshotUpdatedAt, `${label}.snapshotUpdatedAt`);
  if (mutation.kind === 'append-event' && eventLines.events.length !== 1) {
    invalid(`${label}.eventLines`, 'projection requires exactly one append line matching its item event');
  }
  requireClosedLaneTransitionV2(mutation, from, to, /** @type {string} */ (blocker.kind), blocker, label);
  return { mutation, mutationIdentity: sha256(canonicalJson(mutation)), events: eventLines.events };
}

/** @param {Record<string, unknown>} body */
function v2PermitWithHash(body) {
  return { ...body, permitHash: sha256(canonicalJson(body)) };
}

/** @param {unknown} value @param {string} [label] */
export function validateAttemptAuthorizationPermitV1(value, label = 'AttemptAuthorizationPermitV1') {
  const permit = assertExactRecord(
    value,
    ['version', 'kind', 'origin', 'target', 'subjectRunStateHash', 'governanceIdentity', 'governancePhase', 'postLearningInspectionIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity', 'inspectionEvidenceHash', 'targetMappingHash', 'lanePrestateHash', 'permitHash'],
    [],
    label,
  );
  if (permit.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (permit.kind !== 'attempt-authorization') invalid(`${label}.kind`, 'must be attempt-authorization');
  if (permit.origin !== 'dude-work') invalid(`${label}.origin`, 'must be dude-work');
  validateAffectedTargetV2(permit.target, `${label}.target`);
  for (const field of ['subjectRunStateHash', 'inspectionEvidenceHash', 'targetMappingHash', 'lanePrestateHash', 'permitHash']) {
    assertHash(permit[field], `${label}.${field}`);
  }
  const governanceFields = ['governanceIdentity', 'postLearningInspectionIdentity', 'selectedAlternativeIdentity', 'discriminatingCheckIdentity'];
  for (const field of governanceFields) {
    if (permit[field] !== null) assertHash(permit[field], `${label}.${field}`);
  }
  if (permit.governancePhase !== null && permit.governancePhase !== 'alternative-inspected') {
    invalid(`${label}.governancePhase`, 'must be null or alternative-inspected');
  }
  const governed = permit.governancePhase === 'alternative-inspected';
  if (governanceFields.some((field) => (permit[field] === null) === governed)) {
    invalid(label, 'governance fields must be all null or all present with alternative-inspected');
  }
  const { permitHash, ...body } = permit;
  if (permitHash !== sha256(canonicalJson(body))) invalid(`${label}.permitHash`, 'must equal the recomputed permit hash');
  return permit;
}

/** @param {unknown} value @param {string} [label] */
export function validateProjectionPermitV1(value, label = 'ProjectionPermitV1') {
  const permit = assertExactRecord(
    value,
    ['version', 'kind', 'origin', 'lane', 'target', 'subjectRunStateHash', 'batchIdentity', 'eventHash', 'targetMappingHash', 'lanePrestateHash', 'mutationIdentity', 'permitHash'],
    [],
    label,
  );
  if (permit.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (permit.kind !== 'lane-projection') invalid(`${label}.kind`, 'must be lane-projection');
  if (permit.origin !== 'dude-work') invalid(`${label}.origin`, 'must be dude-work');
  assertEnum(permit.lane, V2_LANES, `${label}.lane`);
  const target = validateAffectedTargetV2(permit.target, `${label}.target`);
  if (target.lane !== permit.lane) invalid(`${label}.lane`, 'must match the permitted target lane');
  for (const field of ['subjectRunStateHash', 'batchIdentity', 'eventHash', 'targetMappingHash', 'lanePrestateHash', 'mutationIdentity', 'permitHash']) {
    assertHash(permit[field], `${label}.${field}`);
  }
  const { permitHash, ...body } = permit;
  if (permitHash !== sha256(canonicalJson(body))) invalid(`${label}.permitHash`, 'must equal the recomputed permit hash');
  return permit;
}

/** @param {unknown} value @param {string} [label] */
export function validateLaneMutationPermitV1(value, label = 'LaneMutationPermitV1') {
  const permit = assertExactRecord(
    value,
    ['version', 'kind', 'origin', 'lane', 'operation', 'target', 'subjectRunStateHash', 'governanceIdentity', 'governancePhase', 'attemptIdentity', 'targetMappingHash', 'lanePrestateHash', 'mutationIdentity', 'permitHash'],
    [],
    label,
  );
  if (permit.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (permit.kind !== 'lane-mutation') invalid(`${label}.kind`, 'must be lane-mutation');
  if (permit.origin !== 'dude-work') invalid(`${label}.origin`, 'must be dude-work');
  assertEnum(permit.lane, V2_LANES, `${label}.lane`);
  assertEnum(permit.operation, ['work-set', 'work-transition'], `${label}.operation`);
  if (permit.operation !== (permit.lane === 'lightweight' ? 'work-set' : 'work-transition')) {
    invalid(`${label}.operation`, 'must be the exact lane boundary operation');
  }
  const target = validateAffectedTargetV2(permit.target, `${label}.target`);
  if (target.lane !== permit.lane) invalid(`${label}.lane`, 'must match the permitted target lane');
  for (const field of ['subjectRunStateHash', 'targetMappingHash', 'lanePrestateHash', 'mutationIdentity', 'permitHash']) {
    assertHash(permit[field], `${label}.${field}`);
  }
  for (const field of ['governanceIdentity', 'attemptIdentity']) {
    if (permit[field] !== null) assertHash(permit[field], `${label}.${field}`);
  }
  if (permit.governancePhase !== null) {
    assertEnum(permit.governancePhase, V2_GOVERNANCE_PHASES, `${label}.governancePhase`);
  }
  if ((permit.governanceIdentity === null) !== (permit.governancePhase === null)) {
    invalid(label, 'governance identity and phase must both be present or both null');
  }
  const { permitHash, ...body } = permit;
  if (permitHash !== sha256(canonicalJson(body))) invalid(`${label}.permitHash`, 'must equal the recomputed permit hash');
  return permit;
}

/** @param {unknown} value @param {string} [label] */
export function validateLightweightAtomicReceiptV1(value, label = 'LightweightAtomicReceiptV1') {
  const receipt = assertExactRecord(
    value,
    ['version', 'lane', 'permitHash', 'mutationIdentity', 'target', 'targetMappingHash', 'lanePrestateHash', 'tasksPoststateHash', 'taskStatePoststateHash', 'ownerPoststateHash', 'targetStateChanged', 'receiptHash'],
    [],
    label,
  );
  if (receipt.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (receipt.lane !== 'lightweight') invalid(`${label}.lane`, 'must be lightweight');
  const target = validateAffectedTargetV2(receipt.target, `${label}.target`);
  if (target.lane !== 'lightweight') invalid(`${label}.target`, 'must be a Lightweight target');
  for (const field of ['permitHash', 'mutationIdentity', 'targetMappingHash', 'lanePrestateHash', 'tasksPoststateHash', 'taskStatePoststateHash', 'ownerPoststateHash', 'receiptHash']) {
    assertHash(receipt[field], `${label}.${field}`);
  }
  if (typeof receipt.targetStateChanged !== 'boolean') invalid(`${label}.targetStateChanged`, 'must be a boolean');
  const { receiptHash, ...body } = receipt;
  if (receiptHash !== sha256(canonicalJson(body))) invalid(`${label}.receiptHash`, 'must equal the recomputed receipt hash');
  return receipt;
}

/** @param {unknown} value @param {string} [label] */
export function validateTrackedCompositeReceiptV1(value, label = 'TrackedCompositeReceiptV1') {
  const receipt = assertExactRecord(
    value,
    ['version', 'lane', 'mutationIdentity', 'laneReceiptHash', 'ownerLogReceiptHash', 'receiptHash'],
    [],
    label,
  );
  if (receipt.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (receipt.lane !== 'tracked') invalid(`${label}.lane`, 'must be tracked');
  for (const field of ['mutationIdentity', 'laneReceiptHash', 'ownerLogReceiptHash', 'receiptHash']) {
    assertHash(receipt[field], `${label}.${field}`);
  }
  const { receiptHash, ...body } = receipt;
  if (receiptHash !== sha256(canonicalJson(body))) invalid(`${label}.receiptHash`, 'must equal the recomputed receipt hash');
  return receipt;
}

/** @param {unknown} value @param {string} [label] */
export function validateAcceptedFeatureEvidenceV1(value, label = 'AcceptedFeatureEvidenceV1') {
  const record = assertRecord(value, label);
  assertEnum(record.mode, ['standard', 'core-close'], `${label}.mode`);
  const evidence = record.mode === 'standard'
    ? assertExactRecord(
      value,
      ['version', 'mode', 'featureSpecPath', 'definitionContractIdentity', 'sourceRevisionIdentity', 'verificationSetIdentity', 'independentReviewEnvelopeIdentity', 'acceptedFeatureEvidenceIdentity'],
      [],
      label,
    )
    : assertExactRecord(
      value,
      ['version', 'mode', 'featureSpecPath', 'definitionContractIdentity', 'terminalTaskKey', 'baselineEvidenceLineHash', 'acceptedEvidenceLineHash', 'head', 'declared', 'source', 'changed', 'verificationSetIdentity', 'finalReviewEnvelopeIdentity', 'review', 'acceptedFeatureEvidenceIdentity'],
      [],
      label,
    );
  if (evidence.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertUnicodeScalarString(evidence.featureSpecPath, `${label}.featureSpecPath`);
  if (!/^\.dude\/specs\/[^/]+\/spec\.md$/.test(/** @type {string} */ (evidence.featureSpecPath))) {
    invalid(`${label}.featureSpecPath`, 'must be a canonical spec path');
  }
  const hashFields = evidence.mode === 'standard'
    ? ['definitionContractIdentity', 'sourceRevisionIdentity', 'verificationSetIdentity', 'independentReviewEnvelopeIdentity', 'acceptedFeatureEvidenceIdentity']
    : ['definitionContractIdentity', 'baselineEvidenceLineHash', 'acceptedEvidenceLineHash', 'declared', 'source', 'changed', 'verificationSetIdentity', 'finalReviewEnvelopeIdentity', 'review', 'acceptedFeatureEvidenceIdentity'];
  for (const field of hashFields) assertHash(evidence[field], `${label}.${field}`);
  if (evidence.mode === 'core-close') {
    assertTaskKeyString(evidence.terminalTaskKey, `${label}.terminalTaskKey`);
    assertUnicodeScalarString(evidence.head, `${label}.head`);
    if (!/^[0-9a-f]{40,64}$/.test(/** @type {string} */ (evidence.head))) {
      invalid(`${label}.head`, 'must be a complete lowercase Git object identifier');
    }
  }
  const { acceptedFeatureEvidenceIdentity, ...body } = evidence;
  if (acceptedFeatureEvidenceIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.acceptedFeatureEvidenceIdentity`, 'must equal the recomputed complete evidence identity');
  }
  return evidence;
}

/** @param {unknown} value @param {string} [label] */
export function validateIncidentSupersessionEventV1(value, label = 'IncidentSupersessionEventV1') {
  const event = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'incidentIdentity', 'intentIdentity', 'target', 'priorDispositionIdentity', 'acceptedFeatureEvidenceIdentity', 'branch', 'conclusion', 'resultingTargetState', 'evidenceInventoryHash'],
    [],
    label,
  );
  if (event.type !== 'incident-supersession') invalid(`${label}.type`, 'must be incident-supersession');
  if (event.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  for (const field of ['eventHash', 'incidentIdentity', 'intentIdentity', 'priorDispositionIdentity', 'acceptedFeatureEvidenceIdentity', 'evidenceInventoryHash']) {
    assertHash(event[field], `${label}.${field}`);
  }
  if (canonicalJson(validateAffectedTargetV2(event.target, `${label}.target`)) !== canonicalJson(FEATURE_007_TARGET)) {
    invalid(`${label}.target`, 'must be the exact Feature 007 incident target');
  }
  assertEnum(event.branch, ['exact-evidence', 'evidence-incomplete'], `${label}.branch`);
  if (event.conclusion !== 'unauthorized-block-superseded') {
    invalid(`${label}.conclusion`, 'must be unauthorized-block-superseded');
  }
  assertEnum(
    event.resultingTargetState,
    ['in-progress-learning-required', 'blocked-evidence-incomplete'],
    `${label}.resultingTargetState`,
  );
  if ((event.branch === 'exact-evidence') !== (event.resultingTargetState === 'in-progress-learning-required')) {
    invalid(`${label}.resultingTargetState`, 'must match its exact branch');
  }
  const { eventHash, ...withoutHash } = event;
  if (eventHash !== sha256(canonicalJson(withoutHash))) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return event;
}

/** Closed set of events one autonomous v2 lane line or batch may carry. @param {unknown} value @param {string} label */
function validateV2ProjectableEvent(value, label) {
  return validateT002AuthoritativeEvent(value, label);
}

/** @param {unknown} value @param {string} [label] */
export function validateIncidentCorrectionIntentV1(value, label = 'IncidentCorrectionIntentV1') {
  const record = assertRecord(value, label);
  assertEnum(record.branch, ['exact-evidence', 'evidence-incomplete'], `${label}.branch`);
  const exact = record.branch === 'exact-evidence';
  const intent = assertExactRecord(
    value,
    exact
      ? ['version', 'intentIdentity', 'branch', 'operationTime', 'incidentIdentity', 'target', 'priorDispositionIdentity', 'acceptedFeatureEvidenceIdentity', 'prestateIdentity', 'evidenceInventoryHash', 'reviewEnvelopeIdentities', 'findingOccurrenceIdentities', 'repeat', 'resultingTargetState', 'taskEffect']
      : ['version', 'intentIdentity', 'branch', 'operationTime', 'incidentIdentity', 'target', 'priorDispositionIdentity', 'acceptedFeatureEvidenceIdentity', 'prestateIdentity', 'evidenceInventoryHash', 'incompleteReason', 'resultingTargetState', 'taskEffect'],
    [],
    label,
  );
  if (intent.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  for (const field of ['intentIdentity', 'incidentIdentity', 'priorDispositionIdentity', 'acceptedFeatureEvidenceIdentity', 'prestateIdentity', 'evidenceInventoryHash']) {
    assertHash(intent[field], `${label}.${field}`);
  }
  assertV2CanonicalUtcTimestamp(intent.operationTime, `${label}.operationTime`);
  if (canonicalJson(validateAffectedTargetV2(intent.target, `${label}.target`)) !== canonicalJson(FEATURE_007_TARGET)) {
    invalid(`${label}.target`, 'must be the exact Feature 007 incident target');
  }
  const taskEffect = assertExactRecord(intent.taskEffect, ['fromGlyph', 'toGlyph', 'blocker'], [], `${label}.taskEffect`);
  if (taskEffect.fromGlyph !== '!') invalid(`${label}.taskEffect.fromGlyph`, 'must be the blocked glyph');
  const blocker = validateBlockerEffectV1(taskEffect.blocker, `${label}.taskEffect.blocker`);
  if (exact) {
    if (intent.resultingTargetState !== 'in-progress-learning-required') {
      invalid(`${label}.resultingTargetState`, 'must be in-progress-learning-required');
    }
    if (taskEffect.toGlyph !== '~' || blocker.kind !== 'remove') {
      invalid(`${label}.taskEffect`, 'must return the exact task to in progress and remove only the invalid blocker');
    }
    const reviewIdentities = assertDenseDataArray(intent.reviewEnvelopeIdentities, `${label}.reviewEnvelopeIdentities`);
    const occurrenceIdentities = assertDenseDataArray(intent.findingOccurrenceIdentities, `${label}.findingOccurrenceIdentities`);
    if (reviewIdentities.length !== 2) invalid(`${label}.reviewEnvelopeIdentities`, 'must contain exactly two rows');
    if (occurrenceIdentities.length !== 2) invalid(`${label}.findingOccurrenceIdentities`, 'must contain exactly two rows');
    reviewIdentities.forEach((row, index) => assertHash(row, `${label}.reviewEnvelopeIdentities[${index}]`));
    occurrenceIdentities.forEach((row, index) => assertHash(row, `${label}.findingOccurrenceIdentities[${index}]`));
    const repeat = /** @type {Record<string, unknown>} */ (
      validateRepeatRelationshipV1(intent.repeat, `${label}.repeat`)
    );
    if (repeat.channel !== 'finding') invalid(`${label}.repeat.channel`, 'must be the finding channel');
    if (canonicalJson(repeat.occurrenceIdentities) !== canonicalJson(occurrenceIdentities)) {
      invalid(`${label}.findingOccurrenceIdentities`, 'must be the exact chronology-ordered repeat occurrences');
    }
  } else {
    if (intent.resultingTargetState !== 'blocked-evidence-incomplete') {
      invalid(`${label}.resultingTargetState`, 'must be blocked-evidence-incomplete');
    }
    assertV2Identifier(intent.incompleteReason, `${label}.incompleteReason`);
    if (taskEffect.toGlyph !== '!' || blocker.kind !== 'replace' || blocker.after !== INCIDENT_INCOMPLETE_BLOCKER) {
      invalid(`${label}.taskEffect`, 'must replace only the invalid blocker with the exact evidence-incomplete text');
    }
  }
  const { intentIdentity, ...body } = intent;
  if (intentIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.intentIdentity`, 'must equal the recomputed complete intent identity');
  }
  return intent;
}

/** @param {unknown} value @param {string} [label] */
export function validateIncidentCorrectionPreviewV1(value, label = 'IncidentCorrectionPreviewV1') {
  const record = assertRecord(value, label);
  assertEnum(record.branch, ['exact-evidence', 'evidence-incomplete'], `${label}.branch`);
  const exact = record.branch === 'exact-evidence';
  const preview = assertExactRecord(
    value,
    exact
      ? ['version', 'branch', 'intent', 'acceptedFeatureEvidence', 'prestate', 'evidence', 'incidentEvidenceBatch', 'governanceBatch', 'supersessionBatch', 'mutationCore', 'rollback', 'previewIdentity']
      : ['version', 'branch', 'intent', 'acceptedFeatureEvidence', 'prestate', 'evidence', 'supersessionBatch', 'mutationCore', 'rollback', 'previewIdentity'],
    [],
    label,
  );
  if (preview.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const intent = /** @type {Record<string, unknown>} */ (
    validateIncidentCorrectionIntentV1(preview.intent, `${label}.intent`)
  );
  if (intent.branch !== preview.branch) invalid(`${label}.intent.branch`, 'must equal the preview branch');
  const accepted = validateAcceptedFeatureEvidenceV1(preview.acceptedFeatureEvidence, `${label}.acceptedFeatureEvidence`);
  if (accepted.acceptedFeatureEvidenceIdentity !== intent.acceptedFeatureEvidenceIdentity) {
    invalid(`${label}.acceptedFeatureEvidence`, 'must bind the exact accepted evidence the intent names');
  }
  const prestate = /** @type {Record<string, unknown>} */ (
    validateFeature007PrestateV1(preview.prestate, `${label}.prestate`)
  );
  if (sha256(canonicalJson(preview.prestate)) !== intent.prestateIdentity) {
    invalid(`${label}.prestate`, 'must equal the exact prestate the intent names');
  }
  const rollback = /** @type {Record<string, unknown>} */ (
    validateFeature007RollbackV1(preview.rollback, `${label}.rollback`)
  );
  const evidence = exact
    ? assertExactRecord(preview.evidence, ['inventoryHash', 'reviewEnvelopeIdentities', 'findingOccurrenceEvents', 'repeat'], [], `${label}.evidence`)
    : assertExactRecord(preview.evidence, ['inventoryHash', 'incompleteReason'], [], `${label}.evidence`);
  assertHash(evidence.inventoryHash, `${label}.evidence.inventoryHash`);
  if (evidence.inventoryHash !== intent.evidenceInventoryHash) {
    invalid(`${label}.evidence.inventoryHash`, 'must equal the intent evidence inventory hash');
  }
  const supersession = /** @type {Record<string, unknown>[]} */ (
    /** @type {Record<string, unknown>} */ (
      validateProjectionBatchV1(preview.supersessionBatch, `${label}.supersessionBatch`)
    ).events
  );
  if (supersession.length !== 1
    || /** @type {Record<string, unknown>} */ (supersession[0]).intentIdentity !== intent.intentIdentity) {
    invalid(`${label}.supersessionBatch`, 'must carry exactly one intent-bound supersession event');
  }
  if (canonicalJson(supersession[0]).includes('"previewIdentity"')) {
    invalid(`${label}.supersessionBatch`, 'must not reference previewIdentity');
  }
  /** @type {string[]|null} */
  let exactLineHashes = null;
  if (exact) {
    const findings = /** @type {Record<string, unknown>[]} */ (
      assertDenseDataArray(evidence.findingOccurrenceEvents, `${label}.evidence.findingOccurrenceEvents`)
    );
    if (findings.length !== 2) invalid(`${label}.evidence.findingOccurrenceEvents`, 'must contain exactly two rows');
    findings.forEach((row, index) => validateFindingOccurrenceEventV1(row, `${label}.evidence.findingOccurrenceEvents[${index}]`));
    validateRepeatRelationshipV1(evidence.repeat, `${label}.evidence.repeat`);
    if (canonicalJson(evidence.repeat) !== canonicalJson(intent.repeat)) {
      invalid(`${label}.evidence.repeat`, 'must equal the exact intent Repeat Relationship');
    }
    // The carried rows are the exact occurrences the intent repeats, and the
    // carried envelopes are the exact ones those occurrences were reviewed in.
    if (canonicalJson(findings.map((event) => event.occurrenceIdentity))
      !== canonicalJson(/** @type {Record<string, unknown>} */ (intent.repeat).occurrenceIdentities)) {
      invalid(`${label}.evidence.findingOccurrenceEvents`, 'must be the exact chronology-ordered repeat occurrences');
    }
    const reviewEnvelopeIdentities = findings.map((event) => (
      /** @type {Record<string, unknown>} */ (event.occurrence).reviewEnvelopeIdentity
    ));
    if (canonicalJson(reviewEnvelopeIdentities) !== canonicalJson(intent.reviewEnvelopeIdentities)
      || canonicalJson(evidence.reviewEnvelopeIdentities) !== canonicalJson(intent.reviewEnvelopeIdentities)) {
      invalid(`${label}.evidence.reviewEnvelopeIdentities`, 'must be the exact retained review envelopes of those occurrences');
    }
    // Recomputed from the preview's own rows: an inventory hash copied out of
    // the intent proves nothing about the evidence this preview carries.
    if (evidence.inventoryHash !== sha256(canonicalJson({
      version: 1,
      target: canonicalTarget(FEATURE_007_TARGET),
      branch: 'exact-evidence',
      reviewEnvelopeIdentities,
      findingOccurrenceEventHashes: findings.map((event) => event.eventHash),
    }))) {
      invalid(`${label}.evidence.inventoryHash`, 'must equal the inventory recomputed from the carried evidence');
    }
    const incidentEvidence = /** @type {Record<string, unknown>} */ (
      validateProjectionBatchV1(preview.incidentEvidenceBatch, `${label}.incidentEvidenceBatch`)
    );
    if (incidentEvidence.purpose !== 'incident-evidence') {
      invalid(`${label}.incidentEvidenceBatch.purpose`, 'must be incident-evidence');
    }
    if (canonicalJson(incidentEvidence.target) !== canonicalJson(FEATURE_007_TARGET)) {
      invalid(`${label}.incidentEvidenceBatch.target`, 'must be the exact Feature 007 incident target');
    }
    if (canonicalJson(incidentEvidence.events) !== canonicalJson(findings)) {
      invalid(`${label}.incidentEvidenceBatch.events`, 'must be the exact chronology-ordered finding pair');
    }
    const governance = /** @type {Record<string, unknown>} */ (
      validateProjectionBatchV1(preview.governanceBatch, `${label}.governanceBatch`)
    );
    if (governance.purpose !== 'governance-required') {
      invalid(`${label}.governanceBatch.purpose`, 'must be governance-required');
    }
    if (canonicalJson(governance.target) !== canonicalJson(FEATURE_007_TARGET)) {
      invalid(`${label}.governanceBatch.target`, 'must be the exact Feature 007 incident target');
    }
    const governanceEvents = /** @type {Record<string, unknown>[]} */ (governance.events);
    if (governanceEvents.length !== 1) {
      invalid(`${label}.governanceBatch.events`, 'must carry exactly one required Governance Event');
    }
    const governanceEvent = governanceEvents[0];
    // The event is pinned to the intent Repeat Relationship, which is what its
    // own `governanceIdentity` and failed-approach binding are derived from.
    if (governanceEvent.phase !== 'required'
      || governanceEvent.revision !== 1
      || canonicalJson(governanceEvent.trigger) !== canonicalJson(intent.repeat)) {
      invalid(`${label}.governanceBatch.events[0]`, 'must require governance on the exact intent Repeat Relationship');
    }
    exactLineHashes = [
      ...findings.map((event) => /** @type {string} */ (event.eventHash)),
      /** @type {string} */ (governanceEvent.eventHash),
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (supersession[0]).eventHash),
    ];
  } else {
    assertV2Identifier(evidence.incompleteReason, `${label}.evidence.incompleteReason`);
    if (evidence.incompleteReason !== intent.incompleteReason) {
      invalid(`${label}.evidence.incompleteReason`, 'must equal the intent reason');
    }
  }
  const core = validateIncidentLaneMutationCoreV1(preview.mutationCore, `${label}.mutationCore`);
  if (core.intentIdentity !== intent.intentIdentity) {
    invalid(`${label}.mutationCore.intentIdentity`, 'must equal the intent identity');
  }
  const lines = validateEventLineEffectV1(core.eventLines, `${label}.mutationCore.eventLines`).events;
  if (exact) {
    // The exact branch appends the two chronology-ordered finding lines, then
    // the Governance Event line, then the Incident Supersession Event line.
    if (canonicalJson(lines.map((line) => line.eventHash)) !== canonicalJson(exactLineHashes)) {
      invalid(
        `${label}.mutationCore.eventLines`,
        'must append the exact ordered finding pair, Governance Event, and Incident Supersession Event',
      );
    }
  } else if (lines.length !== 1
    || lines[0].type !== 'incident-supersession'
    || lines[0].eventHash !== /** @type {Record<string, unknown>} */ (supersession[0]).eventHash) {
    // The incomplete branch fabricates neither repetition nor governance: its
    // only appended line is the exact intent-bound Incident Supersession Event.
    invalid(
      `${label}.mutationCore.eventLines`,
      'evidence-incomplete forbids a Repeat Relationship, occurrence, or Governance Event',
    );
  }
  const ownerLog = /** @type {Record<string, unknown>} */ (core.ownerLog);
  const expectedOwnerLine = `- ${intent.operationTime} - incident-supersession v1 `
    + `intent=${intent.intentIdentity} branch=${intent.branch} target=${FEATURE_007_TARGET.taskKey}`;
  if (/** @type {string[]} */ (ownerLog.exactLines)[0] !== expectedOwnerLine) {
    invalid(`${label}.mutationCore.ownerLog.exactLines`, 'must be the exact intent-bound owner line');
  }
  if (ownerLog.expectedOwnerHash !== prestate.ideaHash) {
    invalid(`${label}.mutationCore.ownerLog.expectedOwnerHash`, 'must be the exact prestate owner revision');
  }
  if (core.snapshotUpdatedAt !== intent.operationTime) {
    invalid(`${label}.mutationCore.snapshotUpdatedAt`, 'must equal the intent operation time');
  }
  // Rollback restores the exact revision the prestate promises, never another.
  if (canonicalJson(/** @type {Record<string, unknown>[]} */ (rollback.captures).map((capture) => (
    /** @type {Record<string, unknown>} */ (capture.bytes).sha256
  ))) !== canonicalJson([prestate.ideaHash, prestate.tasksHash, prestate.taskStateHash])) {
    invalid(`${label}.rollback.captures`, 'must capture the exact prestate revision it restores');
  }
  const taskEffect = /** @type {Record<string, unknown>} */ (intent.taskEffect);
  if (core.toGlyph !== taskEffect.toGlyph || canonicalJson(core.blocker) !== canonicalJson(taskEffect.blocker)) {
    invalid(`${label}.mutationCore`, 'must apply the exact intent task effect');
  }
  const { previewIdentity, ...body } = preview;
  if (previewIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.previewIdentity`, 'must equal the recomputed complete preview identity');
  }
  return preview;
}

/** @param {unknown} value @param {string} [label] */
export function validateFeature007PrestateV1(value, label = 'Feature007PrestateV1') {
  const prestate = assertExactRecord(
    value,
    ['version', 'target', 'ownerBindingHash', 'ideaPath', 'ideaHash', 'tasksPath', 'tasksHash', 'taskStatePath', 'taskStateHash', 'ownerLogTailHash', 'taskUnitHash', 'glyph', 'blockedBy', 'blockedByHash'],
    [],
    label,
  );
  if (prestate.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  if (canonicalJson(validateAffectedTargetV2(prestate.target, `${label}.target`)) !== canonicalJson(FEATURE_007_TARGET)) {
    invalid(`${label}.target`, 'must be the exact Feature 007 incident target');
  }
  if (prestate.ideaPath !== FEATURE_007_IDEA_PATH) invalid(`${label}.ideaPath`, `must be ${FEATURE_007_IDEA_PATH}`);
  if (prestate.tasksPath !== FEATURE_007_TASKS_PATH) invalid(`${label}.tasksPath`, `must be ${FEATURE_007_TASKS_PATH}`);
  if (prestate.taskStatePath !== TASK_STATE_PATH) invalid(`${label}.taskStatePath`, `must be ${TASK_STATE_PATH}`);
  for (const field of ['ownerBindingHash', 'ideaHash', 'tasksHash', 'taskStateHash', 'ownerLogTailHash', 'taskUnitHash', 'blockedByHash']) {
    assertHash(prestate[field], `${label}.${field}`);
  }
  if (prestate.glyph !== '!') invalid(`${label}.glyph`, 'must be the blocked glyph');
  const blockedBy = assertV2ShortText(prestate.blockedBy, `${label}.blockedBy`);
  if (prestate.blockedByHash !== sha256(blockedBy)) {
    invalid(`${label}.blockedByHash`, 'must hash the exact blocker text');
  }
  return prestate;
}

/** @param {unknown} value @param {string} [label] */
export function validateFeature007RollbackV1(value, label = 'Feature007RollbackV1') {
  const rollback = assertExactRecord(value, ['version', 'captures', 'rollbackIdentity'], [], label);
  if (rollback.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  const captures = assertDenseDataArray(rollback.captures, `${label}.captures`);
  const expected = [FEATURE_007_IDEA_PATH, FEATURE_007_TASKS_PATH, TASK_STATE_PATH];
  if (captures.length !== 3) invalid(`${label}.captures`, 'must contain exactly three exact captures');
  captures.forEach((row, index) => {
    const capture = assertExactRecord(row, ['path', 'bytes'], [], `${label}.captures[${index}]`);
    if (capture.path !== expected[index]) invalid(`${label}.captures[${index}].path`, `must be ${expected[index]}`);
    validateCapturedBytesV1(capture.bytes, `${label}.captures[${index}].bytes`);
  });
  assertHash(rollback.rollbackIdentity, `${label}.rollbackIdentity`);
  const { rollbackIdentity, ...body } = rollback;
  if (rollbackIdentity !== sha256(canonicalJson(body))) {
    invalid(`${label}.rollbackIdentity`, 'must equal the recomputed complete rollback identity');
  }
  return rollback;
}

/** @param {unknown} value @param {string} [label] */
export function validateIncidentLaneMutationCoreV1(value, label = 'IncidentLaneMutationCoreV1') {
  const core = assertExactRecord(
    value,
    ['intentIdentity', 'target', 'fromGlyph', 'toGlyph', 'blocker', 'eventLines', 'ownerLog', 'snapshotUpdatedAt'],
    [],
    label,
  );
  assertHash(core.intentIdentity, `${label}.intentIdentity`);
  if (canonicalJson(validateAffectedTargetV2(core.target, `${label}.target`)) !== canonicalJson(FEATURE_007_TARGET)) {
    invalid(`${label}.target`, 'must be the exact Feature 007 incident target');
  }
  if (core.fromGlyph !== '!') invalid(`${label}.fromGlyph`, 'must be the blocked glyph');
  assertEnum(core.toGlyph, ['~', '!'], `${label}.toGlyph`);
  validateBlockerEffectV1(core.blocker, `${label}.blocker`);
  validateEventLineEffectV1(core.eventLines, `${label}.eventLines`);
  const ownerLog = validateOwnerLogEffectV1(core.ownerLog, `${label}.ownerLog`);
  if (ownerLog.kind !== 'append-exact' || ownerLog.ownerPath !== FEATURE_007_IDEA_PATH
    || /** @type {unknown[]} */ (ownerLog.exactLines).length !== 1) {
    invalid(`${label}.ownerLog`, 'must append exactly one Feature 007 owner line');
  }
  assertV2CanonicalUtcTimestamp(core.snapshotUpdatedAt, `${label}.snapshotUpdatedAt`);
  return core;
}

// --- Acyclic permit issuance, consumption, and receipt commit ----------------

/**
 * Rebind one `alternative-inspected` case from fresh evidence so a permit is
 * never issued against a stored self-consistent governance record.
 * @param {Record<string, unknown>} inspection @param {Record<string, unknown>} governance
 */
function reboundInspectedBranchV2(inspection, governance) {
  const rebound = reboundGovernanceEvidenceV2(inspection, governance);
  if (rebound.reason) return { reason: rebound.reason };
  const retained = retainedLearningResultV2(inspection, governance);
  if (retained.reason) return { reason: retained.reason };
  const derived = reboundBranchEvidenceV2(inspection, governance, rebound, retained);
  if (derived.reason) return { reason: derived.reason };
  return { rebound, retained, branchEvidence: derived.branchEvidence };
}

/**
 * Issue one pure `AttemptAuthorizationPermitV1` against the unchanged
 * post-learning Inspection state. Nothing about RunState changes here.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} lanePrestateValue
 * @param {unknown} targetMappingValue @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function issueAttemptPermitV2(stateValue, inputValue, lanePrestateValue, targetMappingValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('issueAttemptPermitV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return respond({ issued: false, reason: 'inspection-stale', state });
  }
  const governance = activeGovernanceCaseV2(state);
  const target = canonicalTarget(validateAffectedTargetV2(
    governance ? governance.target : inspection.target,
    'issueAttemptPermitV2.target',
  ));
  if (targetKey(inspection.target) !== targetKey(target)) {
    return respond({ issued: false, reason: 'target-mismatch', state });
  }
  requireResolvedOwnerMappingV2(inspection, target, 'issueAttemptPermitV2');
  let bound;
  try {
    const mapping = validateTargetMappingV1(targetMappingValue, target, 'issue-attempt-permit targetMapping');
    const prestate = validateLanePrestateV1(lanePrestateValue, target, mapping.mapping, 'issue-attempt-permit lanePrestate');
    bound = { ...mapping, ...prestate };
  } catch {
    return respond({ issued: false, reason: 'target-mapping-missing', state });
  }
  if (!lanePrestateMatchesFreshEvidenceV2(inspection, target, bound.prestate)) {
    return respond({ issued: false, reason: 'lane-prestate-mismatch', state });
  }
  /** @type {Record<string, unknown>} */
  let branch = {
    governanceIdentity: null,
    governancePhase: null,
    postLearningInspectionIdentity: null,
    selectedAlternativeIdentity: null,
    discriminatingCheckIdentity: null,
  };
  if (governance) {
    if (governance.phase !== 'alternative-inspected') {
      return respond({ issued: false, reason: 'learning-phase-mismatch', state });
    }
    if (Object.hasOwn(governance, 'controlledEnd')) {
      return respond({ issued: false, reason: 'learning-phase-mismatch', state });
    }
    const derived = reboundInspectedBranchV2(inspection, governance);
    if (derived.reason) return respond({ issued: false, reason: derived.reason, state });
    const evidence = /** @type {Record<string, unknown>} */ (derived.branchEvidence);
    branch = {
      governanceIdentity: governance.governanceIdentity,
      governancePhase: 'alternative-inspected',
      // Rebound from the fresh surfaces, never copied out of RunState.
      postLearningInspectionIdentity: evidence.postLearningInspectionIdentity,
      selectedAlternativeIdentity: evidence.selectedAlternativeIdentity,
      discriminatingCheckIdentity: evidence.discriminatingCheckIdentity,
    };
  }
  const permit = v2PermitWithHash({
    version: 1,
    kind: 'attempt-authorization',
    origin: 'dude-work',
    target,
    subjectRunStateHash: v2RunStateHash(state),
    ...branch,
    inspectionEvidenceHash: inspection.evidenceHash,
    targetMappingHash: bound.targetMappingHash,
    lanePrestateHash: bound.lanePrestateHash,
  });
  validateAttemptAuthorizationPermitV1(permit);
  // Pure issuance: the returned state is the byte-identical request state.
  return respond({ issued: true, reason: 'attempt-permit-issued', state, permit });
}

/**
 * Validate and consume one attempt permit before RunState changes. A permit
 * that is stale, replayed, transferred, or bound to different branch evidence
 * rejects without touching state.
 * @param {Record<string, unknown>} state @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} inspection @param {unknown} permitValue
 */
function consumeAttemptPermitV2(state, target, inspection, permitValue) {
  let permit;
  try {
    permit = validateAttemptAuthorizationPermitV1(permitValue, 'authorize request.attemptPermit');
  } catch {
    return { reason: 'permit-hash-mismatch' };
  }
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    return { reason: 'permit-transition-mismatch' };
  }
  if (targetKey(permit.target) !== targetKey(target)) return { reason: 'permit-target-mismatch' };
  if (permit.subjectRunStateHash !== v2RunStateHash(state)) return { reason: 'permit-stale' };
  if (permit.inspectionEvidenceHash !== inspection.evidenceHash) return { reason: 'permit-stale' };
  const governance = activeGovernanceCaseV2(state);
  if (!governance) {
    return permit.governancePhase === null
      ? { permit, governance: null }
      : { reason: 'permit-transition-mismatch' };
  }
  if (targetKey(governance.target) !== targetKey(target)) return { reason: 'permit-target-mismatch' };
  if (governance.phase !== 'alternative-inspected' || permit.governancePhase !== 'alternative-inspected') {
    return { reason: 'permit-transition-mismatch' };
  }
  // Permit replay is sealed by `subjectRunStateHash`: consuming one permit
  // changes the phase and the exact state the permit was issued against.
  const derived = reboundInspectedBranchV2(inspection, governance);
  if (derived.reason) return { reason: derived.reason };
  const evidence = /** @type {Record<string, unknown>} */ (derived.branchEvidence);
  if (permit.governanceIdentity !== governance.governanceIdentity
    || permit.postLearningInspectionIdentity !== evidence.postLearningInspectionIdentity
    || permit.selectedAlternativeIdentity !== evidence.selectedAlternativeIdentity
    || permit.discriminatingCheckIdentity !== evidence.discriminatingCheckIdentity) {
    return { reason: 'permit-transition-mismatch' };
  }
  return { permit, governance };
}

/**
 * Issue one post-authorization or projection lane permit from the complete
 * closed lane-specific mutation object.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} mutationValue
 * @param {unknown} lanePrestateValue @param {unknown} targetMappingValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function issueLanePermitV2(stateValue, inputValue, mutationValue, lanePrestateValue, targetMappingValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('issueLanePermitV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return respond({ issued: false, reason: 'inspection-stale', state });
  }
  const mutationTarget = validateAffectedTargetV2(
    assertRecord(mutationValue, 'issue-lane-permit mutation').target,
    'issue-lane-permit mutation.target',
  );
  if (targetKey(inspection.target) !== targetKey(mutationTarget)) {
    return respond({ issued: false, reason: 'target-mismatch', state });
  }
  const target = canonicalTarget(mutationTarget);
  requireResolvedOwnerMappingV2(inspection, target, 'issueLanePermitV2');
  let derivedMutation;
  try {
    derivedMutation = validateLaneMutationV1(mutationValue, target, 'issue-lane-permit mutation');
  } catch {
    return respond({ issued: false, reason: 'permit-transition-mismatch', state });
  }
  let bound;
  try {
    const mapping = validateTargetMappingV1(targetMappingValue, target, 'issue-lane-permit targetMapping');
    const prestate = validateLanePrestateV1(lanePrestateValue, target, mapping.mapping, 'issue-lane-permit lanePrestate');
    bound = { ...mapping, ...prestate };
  } catch {
    return respond({ issued: false, reason: 'target-mapping-missing', state });
  }
  const mutation = /** @type {Record<string, unknown>} */ (derivedMutation.mutation);
  const prestateState = mutation.lane === 'lightweight'
    ? bound.prestate.glyph
    : bound.prestate.status;
  if (mutation[mutation.lane === 'lightweight' ? 'fromGlyph' : 'fromStatus'] !== prestateState) {
    return respond({ issued: false, reason: 'lane-prestate-mismatch', state });
  }
  if (mutation.kind !== 'incident-supersession'
    && !lanePrestateMatchesFreshEvidenceV2(inspection, target, bound.prestate)) {
    return respond({ issued: false, reason: 'lane-prestate-mismatch', state });
  }
  const governance = activeGovernanceCaseV2(state);
  const governed = governance && targetKey(governance.target) === targetKey(target) ? governance : null;
  if (mutation.kind === 'append-event') {
    const active = activeProjectionCommitmentV2(state, 'occurrence-retention')
      || activeProjectionCommitmentV2(state, 'governance-required')
      || activeProjectionCommitmentV2(state, 'learning-result');
    const eventHash = /** @type {Record<string, unknown>} */ (derivedMutation.events[0]).eventHash;
    if (!active
      || targetKey(active.target) !== targetKey(target)
      || !/** @type {Record<string, unknown>[]} */ (
        /** @type {Record<string, unknown>} */ (active.commitment).eventCommitments
      ).some((row) => row.eventHash === eventHash)) {
      return respond({ issued: false, reason: 'projection-batch-mismatch', state });
    }
    const permit = v2PermitWithHash({
      version: 1,
      kind: 'lane-projection',
      origin: 'dude-work',
      lane: mutation.lane,
      target,
      subjectRunStateHash: v2RunStateHash(state),
      batchIdentity: /** @type {Record<string, unknown>} */ (active.commitment).batchIdentity,
      eventHash,
      targetMappingHash: bound.targetMappingHash,
      lanePrestateHash: bound.lanePrestateHash,
      mutationIdentity: derivedMutation.mutationIdentity,
    });
    validateProjectionPermitV1(permit);
    return respond({ issued: true, reason: 'lane-permit-issued', state, permit });
  }
  const gate = requiredLanePermitPhaseV2(state, mutation, governed, inspection);
  if (gate.reason) return respond({ issued: false, reason: gate.reason, state });
  const permit = v2PermitWithHash({
    version: 1,
    kind: 'lane-mutation',
    origin: 'dude-work',
    lane: mutation.lane,
    operation: mutation.lane === 'lightweight' ? 'work-set' : 'work-transition',
    target,
    subjectRunStateHash: v2RunStateHash(state),
    governanceIdentity: gate.governanceIdentity,
    governancePhase: gate.governancePhase,
    attemptIdentity: gate.attemptIdentity,
    targetMappingHash: bound.targetMappingHash,
    lanePrestateHash: bound.lanePrestateHash,
    mutationIdentity: derivedMutation.mutationIdentity,
  });
  validateLaneMutationPermitV1(permit);
  return respond({ issued: true, reason: 'lane-permit-issued', state, permit });
}

/**
 * Re-derive the branch authority one governed lane reason requires from the
 * rebound evidence and the retained learning result. Issuance and the commit
 * that releases governance both run it, so neither trusts a stored record.
 * @param {string} reason @param {Record<string, unknown>} governance
 * @param {Record<string, unknown>} rebound @param {Record<string, unknown>} retained
 */
function lanePermitBranchAuthorityV2(reason, governance, rebound, retained) {
  const reviewEvent = /** @type {Record<string, unknown>} */ (retained.reviewEvent);
  const outcome = reason === 'no-progress' ? 'no-progress' : 'selected-alternative';
  if (reviewEvent.outcome !== outcome) return { reason: 'inspection-branch-mismatch' };
  if (outcome === 'selected-alternative') {
    // The stored branch identities are rebound to the retained review, so no
    // RunState alone names the alternative a lane claim or completion acts on.
    let alternatives;
    try {
      alternatives = requireCompleteFailedSetComparisonV2(
        reviewEvent.alternatives,
        /** @type {Record<string, unknown>} */ (rebound.failedApproachSet),
        'retained learning review alternatives',
      );
    } catch {
      return { reason: 'failed-approach-set-mismatch' };
    }
    const selected = alternatives.credible.filter((row) => (
      row.alternativeIdentity === reviewEvent.selectedAlternativeIdentity
        && row.alternativeIdentity === governance.selectedAlternativeIdentity
    ));
    if (selected.length !== 1
      || /** @type {Record<string, unknown>} */ (selected[0].discriminatingCheck).identity
        !== governance.discriminatingCheckIdentity) {
      return { reason: 'alternative-selection-mismatch' };
    }
  }
  const attemptIdentity = Object.hasOwn(governance, 'authorizedAttemptIdentity')
    ? /** @type {string} */ (governance.authorizedAttemptIdentity)
    : null;
  // Completion is the one arm whose authority is an executed attempt: the
  // exact authorized attempt must be retained as an accepted occurrence.
  if (reason === 'task-completed'
    && !(/** @type {Record<string, unknown>[]} */ (rebound.retained)).some((event) => (
      event.type === 'approach-occurrence'
        && /** @type {Record<string, unknown>} */ (event.occurrence).attemptIdentity === attemptIdentity
        && /** @type {Record<string, unknown>} */ (event.occurrence).disposition === 'accepted'
    ))) {
    return { reason: 'occurrence-retention-incomplete' };
  }
  return { attemptIdentity };
}

/**
 * Reconstruct the sole ordinary accepted completion that can close the exact
 * target without learning governance. The bridge is Lightweight only: no
 * tracked target ever reaches this ungoverned authority.
 * @param {Record<string, unknown>} state @param {Record<string, unknown>} inspection
 * @param {Record<string, unknown>} target
 */
function ordinaryAcceptedCompletionAuthorityV2(state, inspection, target) {
  if (target.lane !== 'lightweight') return null;
  if (/** @type {Record<string, unknown>[]} */ (state.pending).length !== 0
    || Object.hasOwn(state, 'pendingCompletion')
    || Object.hasOwn(state, 'learningGovernance')
    || /** @type {unknown[]} */ (inspection.blockers).length !== 0
    || targetKey(inspection.target) !== targetKey(target)) return null;
  for (const purpose of ['occurrence-retention', 'governance-required', 'learning-result']) {
    if (activeProjectionCommitmentV2(state, purpose)) return null;
  }
  const evaluationSequences = /** @type {Record<string, unknown>[]} */ (state.evaluationSequences || []);
  if (evaluationSequences.some((row) => targetKey(row.target) === targetKey(target))) return null;
  let retained;
  try {
    retained = dualRetainedOccurrenceEventsV2(inspection);
    validateRetainedOccurrenceAuthorityV2(
      retained.retained,
      trustedEnvelopeIndexFromInspectionV2(inspection),
    );
  } catch {
    return null;
  }
  if (retained.retained.some((event) => retained.currentCounts.get(/** @type {string} */ (event.eventHash)) !== 1
    || retained.laneCounts.get(/** @type {string} */ (event.eventHash)) !== 1)) return null;
  if (deriveEarliestRepeatRelationshipV1(retained.retained)) return null;
  const finalAttemptOrdinal = /** @type {number} */ (state.overallUsed);
  const accepted = retained.retained.filter((event) => event.type === 'approach-occurrence'
    && targetKey(event.target) === targetKey(target)
    && eventChronologyV2(event).attemptOrdinal === finalAttemptOrdinal
    && /** @type {Record<string, unknown>} */ (event.occurrence).disposition === 'accepted');
  if (accepted.length !== 1) return null;
  const event = accepted[0];
  const eventHash = /** @type {string} */ (event.eventHash);
  if (retained.currentCounts.get(eventHash) !== 1 || retained.laneCounts.get(eventHash) !== 1) return null;
  const occurrence = /** @type {Record<string, unknown>} */ (event.occurrence);
  const basis = /** @type {Record<string, unknown>} */ (event.basis);
  const mechanismIdentities = /** @type {string[]} */ (basis.mechanismIdentities);
  if (basis.action === 'reconcile-derived-definition' && mechanismIdentities.length !== 1) return null;
  const approachHashValue = basis.action === 'reconcile-derived-definition'
    ? mechanismIdentities[0]
    : approachHash({ action: basis.action, materialInputs: basis.materialInputs });
  const completedTuple = {
    evidenceHash: occurrence.authorizationEvidenceHash,
    approachHash: approachHashValue,
    resultHash: occurrence.resultIdentity,
  };
  const completed = /** @type {Record<string, unknown>[]} */ (state.completed);
  const matches = completed.filter((entry) => canonicalJson(entry) === canonicalJson(completedTuple));
  if (matches.length !== 1
    || completed.length !== finalAttemptOrdinal
    || canonicalJson(completed[completed.length - 1]) !== canonicalJson(completedTuple)) return null;
  return /** @type {string} */ (occurrence.attemptIdentity);
}

/**
 * Bind an ordinary Lightweight completion receipt to the exact canonical lane
 * bytes left by the completed wrapper transaction.
 * @param {string} root @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} receipt
 */
function ordinaryLightweightReceiptPoststateV2(root, target, receipt) {
  let ownerPath;
  try {
    const resolved = resolveFeatureOwner({
      root,
      specPath: /** @type {string} */ (target.specPath),
    });
    if (resolved.diagnostics.length !== 0 || resolved.owner === null) return 'inspection-stale';
    ownerPath = resolved.owner.ideaPath;
  } catch {
    return 'inspection-stale';
  }
  const tasksPath = `${/** @type {string} */ (target.specPath).slice(0, -'spec.md'.length)}tasks.md`;
  const expected = [
    [tasksPath, receipt.tasksPoststateHash],
    [TASK_STATE_PATH, receipt.taskStatePoststateHash],
    [ownerPath, receipt.ownerPoststateHash],
  ];
  const budget = createBodyBudget();
  /** @type {Map<string, Buffer>} */
  const poststateBytes = new Map();
  for (const [relativePath, expectedHash] of expected) {
    let bytes;
    try {
      bytes = readWorkspaceFile(root, /** @type {string} */ (relativePath), budget);
    } catch {
      return 'inspection-stale';
    }
    if (sha256(bytes) !== expectedHash) return 'lane-receipt-mismatch';
    poststateBytes.set(/** @type {string} */ (relativePath), bytes);
  }
  try {
    const visible = parseVisibleTasks(/** @type {Buffer} */ (poststateBytes.get(tasksPath)), {
      path: tasksPath,
      state: 'ordinary completion poststate',
    });
    const parsed = visible.parsed;
    if (parsed.boardIssue || parsed.warnings.length !== 0 || parsed.tasks.length !== parsed.byId.size) {
      return 'lane-receipt-mismatch';
    }
    const matches = parsed.tasks.filter((task) => task.id === target.taskKey);
    if (matches.length !== 1
      || matches[0].glyph !== 'x'
      || matches[0].state !== 'done'
      || matches[0].blockedBy !== null) {
      return 'lane-receipt-mismatch';
    }
    const snapshot = parseTaskState(
      /** @type {Buffer} */ (poststateBytes.get(TASK_STATE_PATH)).toString('utf8'),
    );
    if (snapshot.status !== 'ok'
      || !Object.hasOwn(snapshot.state, tasksPath)
      || snapshot.state[tasksPath].glyphs[/** @type {string} */ (target.taskKey)] !== 'x') {
      return 'lane-receipt-mismatch';
    }
  } catch {
    return 'lane-receipt-mismatch';
  }
  return null;
}

/**
 * Bind one lane state mutation reason to the exact governance phase that may
 * authorize it. Everything else fails closed.
 * @param {Record<string, unknown>} state @param {Record<string, unknown>} mutation
 * @param {Record<string, unknown>|null} governance @param {Record<string, unknown>} inspection
 */
function requiredLanePermitPhaseV2(state, mutation, governance, inspection) {
  const ungoverned = { governanceIdentity: null, governancePhase: null, attemptIdentity: null };
  const reason = /** @type {string} */ (mutation.reason);
  if (reason === 'incident-supersession' || reason === 'initial-claim'
    || reason === 'resume-claim' || reason === 'task-blocked') {
    return governance ? { reason: 'learning-phase-mismatch' } : ungoverned;
  }
  if (!governance) {
    if (reason === 'task-completed') {
      const attemptIdentity = ordinaryAcceptedCompletionAuthorityV2(
        state,
        inspection,
        /** @type {Record<string, unknown>} */ (mutation.target),
      );
      if (attemptIdentity) return { ...ungoverned, attemptIdentity };
    }
    return { reason: 'governance-unresolved' };
  }
  const expected = {
    'post-learning-claim': 'alternative-authorized-pending-lane',
    'task-completed': 'alternative-verified',
    'no-progress': 'no-progress-verified',
  }[reason];
  if (expected) {
    if (governance.phase !== expected) return { reason: 'learning-phase-mismatch' };
    // A controlled end leaves its target unchanged, so it never authorizes the
    // no-progress mutation that blocks the exact task afresh.
    if (reason === 'no-progress' && Object.hasOwn(governance, 'controlledEnd')) {
      return { reason: 'learning-phase-mismatch' };
    }
    // Governance evidence is rebound from the fresh surfaces on every arm: a
    // stored, self-consistent record alone never carries lane authority.
    const rebound = reboundGovernanceEvidenceV2(inspection, governance);
    if (rebound.reason) return { reason: rebound.reason };
    const retained = retainedLearningResultV2(inspection, governance);
    if (retained.reason) return { reason: retained.reason };
    const authority = lanePermitBranchAuthorityV2(reason, governance, rebound, retained);
    if (authority.reason) return { reason: authority.reason };
    return {
      governanceIdentity: /** @type {string} */ (governance.governanceIdentity),
      governancePhase: /** @type {string} */ (governance.phase),
      attemptIdentity: authority.attemptIdentity,
    };
  }
  // Controlled Unresolved End: `projected` and every other phase are ineligible.
  if (!Object.hasOwn(governance, 'controlledEnd')
    || (governance.phase !== 'alternative-inspected' && governance.phase !== 'no-progress-verified')) {
    return { reason: 'controlled-end-unavailable' };
  }
  const derived = reboundInspectedBranchV2(inspection, governance);
  if (derived.reason) return { reason: derived.reason };
  const controlledEnd = /** @type {Record<string, unknown>} */ (governance.controlledEnd);
  if (canonicalJson(controlledEnd.branchEvidence) !== canonicalJson(derived.branchEvidence)) {
    return { reason: 'inspection-stale' };
  }
  return {
    governanceIdentity: /** @type {string} */ (governance.governanceIdentity),
    governancePhase: /** @type {string} */ (governance.phase),
    attemptIdentity: null,
  };
}

/**
 * Commit one exact terminal or claim lane receipt. A failed commit changes
 * nothing and never clears governance.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} permitValue
 * @param {unknown} receiptValue @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function commitLaneReceiptV2(stateValue, inputValue, permitValue, receiptValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('commitLaneReceiptV2', 'requires autonomous policy');
  }
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  const permitRecord = assertRecord(permitValue, 'commit-lane-receipt permit');
  let permit;
  try {
    permit = permitRecord.kind === 'lane-projection'
      ? validateProjectionPermitV1(permitValue, 'commit-lane-receipt permit')
      : validateLaneMutationPermitV1(permitValue, 'commit-lane-receipt permit');
  } catch {
    return respond({ committed: false, reason: 'permit-hash-mismatch', state });
  }
  if (permit.subjectRunStateHash !== v2RunStateHash(state)) {
    return respond({ committed: false, reason: 'permit-stale', state });
  }
  if (targetKey(inspection.target) !== targetKey(permit.target)) {
    return respond({ committed: false, reason: 'permit-target-mismatch', state });
  }
  let receipt;
  try {
    receipt = permit.lane === 'lightweight'
      ? validateLightweightAtomicReceiptV1(receiptValue, 'commit-lane-receipt receipt')
      : validateTrackedCompositeReceiptV1(receiptValue, 'commit-lane-receipt receipt');
  } catch {
    return respond({ committed: false, reason: 'lane-receipt-invalid', state });
  }
  if (receipt.mutationIdentity !== permit.mutationIdentity) {
    return respond({ committed: false, reason: 'lane-receipt-mismatch', state });
  }
  if (permit.lane === 'lightweight'
    && (receipt.permitHash !== permit.permitHash
      || receipt.targetMappingHash !== permit.targetMappingHash
      || receipt.lanePrestateHash !== permit.lanePrestateHash
      || targetKey(receipt.target) !== targetKey(permit.target))) {
    return respond({ committed: false, reason: 'lane-receipt-mismatch', state });
  }
  const governance = activeGovernanceCaseV2(state);
  const governed = governance && targetKey(governance.target) === targetKey(permit.target)
    ? governance
    : null;
  // `targetStateChanged` is false for projection and Controlled Unresolved End.
  // The controlled end is keyed on the stored record, never on its phase: a
  // no-progress mutation shares that phase and does block the exact task.
  const unchangedTargetState = permit.kind === 'lane-projection'
    || (governed !== null && Object.hasOwn(governed, 'controlledEnd'));
  if (permit.lane === 'lightweight' && unchangedTargetState && receipt.targetStateChanged !== false) {
    return respond({ committed: false, reason: 'lane-receipt-mismatch', state });
  }
  if (permit.kind === 'lane-projection') {
    // Projection commitments are cleared only by fresh dual verification.
    return respond({ committed: true, reason: 'lane-receipt-committed', state, receipt });
  }
  if (permit.governanceIdentity === null) {
    // An ungoverned claim, block, or incident permit discharges no obligation:
    // it commits only while no governed case owns the exact permit target.
    if (governed) return respond({ committed: false, reason: 'governance-unresolved', state });
    if (permit.attemptIdentity === null) {
      return respond({ committed: true, reason: 'lane-receipt-committed', state, receipt });
    }
    const attemptIdentity = ordinaryAcceptedCompletionAuthorityV2(
      state,
      inspection,
      /** @type {Record<string, unknown>} */ (permit.target),
    );
    if (attemptIdentity !== permit.attemptIdentity) {
      return respond({ committed: false, reason: 'governance-unresolved', state });
    }
    if (permit.lane === 'lightweight') {
      if (receipt.targetStateChanged !== true) {
        return respond({ committed: false, reason: 'lane-receipt-mismatch', state });
      }
      const poststateReason = ordinaryLightweightReceiptPoststateV2(
        /** @type {string} */ (acquired.root),
        /** @type {Record<string, unknown>} */ (permit.target),
        receipt,
      );
      if (poststateReason) {
        return respond({ committed: false, reason: poststateReason, state });
      }
    }
    return respond({
      committed: true,
      reason: 'lane-receipt-committed',
      state,
      receipt,
      terminalEvidenceIdentity: receipt.receiptHash,
    });
  }
  if (!governed
    || permit.governanceIdentity !== governed.governanceIdentity
    || permit.governancePhase !== governed.phase) {
    return respond({ committed: false, reason: 'governance-unresolved', state });
  }
  // A permit is a plain digest, so every commit that advances or releases
  // governance rebinds exactly what issuance required instead of trusting the
  // permit body.
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return respond({ committed: false, reason: 'inspection-stale', state });
  }
  requireResolvedOwnerMappingV2(
    inspection,
    /** @type {Record<string, unknown>} */ (permit.target),
    'commitLaneReceiptV2',
  );
  const rebound = reboundGovernanceEvidenceV2(inspection, governed);
  if (rebound.reason) return respond({ committed: false, reason: rebound.reason, state });
  const retained = retainedLearningResultV2(inspection, governed);
  if (retained.reason) return respond({ committed: false, reason: retained.reason, state });
  if (governed.phase === 'alternative-authorized-pending-lane') {
    // The claim gate advances the phase and seals a receipt identity, so it
    // re-applies the exact branch authority issuance required.
    const claim = lanePermitBranchAuthorityV2('post-learning-claim', governed, rebound, retained);
    if (claim.reason) return respond({ committed: false, reason: claim.reason, state });
    const nextState = governanceSuccessorStateV2(state, governed, {
      phase: 'alternative-authorized',
      laneClaimReceiptIdentity: receipt.receiptHash,
    });
    return respond({ committed: true, reason: 'lane-receipt-committed', state: nextState, receipt });
  }
  if (Object.hasOwn(governed, 'controlledEnd')) {
    // Controlled Unresolved End has no lifecycle exit: its receipt leaves the
    // unresolved obligation, and the stored controlled end, byte-identical.
    return respond({ committed: true, reason: 'lane-receipt-committed', state, receipt });
  }
  // The lifecycle exits only from the two verified phases, so the commit
  // re-applies the exact issuance restriction the permit body cannot carry.
  const terminalReason = {
    'alternative-verified': 'task-completed',
    'no-progress-verified': 'no-progress',
  }[/** @type {string} */ (governed.phase)];
  if (!terminalReason) {
    return respond({ committed: false, reason: 'learning-phase-mismatch', state });
  }
  const authority = lanePermitBranchAuthorityV2(terminalReason, governed, rebound, retained);
  if (authority.reason) return respond({ committed: false, reason: authority.reason, state });
  // Terminal commit: the discharged governance requirement is released only
  // after the exact final receipt exists.
  const nextState = carryOptionalRunState(state, {
    policy: { .../** @type {Record<string, unknown>} */ (state.policy) },
    overallUsed: state.overallUsed,
    recoveryUsed: /** @type {Record<string, unknown>[]} */ (state.recoveryUsed).map((row) => ({ ...row })),
    pending: /** @type {Record<string, unknown>[]} */ (state.pending).map(copyPendingEntry),
    completed: /** @type {Record<string, unknown>[]} */ (state.completed).map((entry) => ({ ...entry })),
  });
  delete nextState.learningGovernance;
  validateRunState(nextState);
  return respond({
    committed: true,
    reason: 'lane-receipt-committed',
    state: nextState,
    receipt,
    terminalEvidenceIdentity: receipt.receiptHash,
  });
}

// --- Acyclic Feature 007 incident correction --------------------------------

/** @param {Record<string, unknown>} inspection */
function feature007OwnerBodyV2(inspection) {
  const owner = assertExactRecord(
    inspectionSourceBodyV2(inspection, 'owner-log'),
    ['ideaPath', 'specPath', 'coordinatorLog'],
    [],
    'owner-log Inspection body',
  );
  if (owner.ideaPath !== FEATURE_007_IDEA_PATH) {
    invalid('owner-log Inspection body.ideaPath', `must be ${FEATURE_007_IDEA_PATH}`);
  }
  return owner;
}

/**
 * Derive the exact branch evidence from the fresh dual-retained surfaces. A
 * caller supplies no occurrence, relation, or branch decision.
 * @param {Record<string, unknown>} inspection
 */
function incidentBranchEvidenceV2(inspection) {
  let retained;
  try {
    retained = dualRetainedOccurrenceEventsV2(inspection);
    validateRetainedOccurrenceAuthorityV2(retained.retained, trustedEnvelopeIndexFromInspectionV2(inspection));
  } catch {
    return { incompleteReason: 'occurrence-retention-incomplete' };
  }
  const repeat = deriveEarliestRepeatRelationshipV1(retained.retained);
  if (!repeat) return { incompleteReason: 'repeat-not-established' };
  if (repeat.channel !== 'finding') return { incompleteReason: 'finding-repeat-unavailable' };
  const byOccurrence = new Map(retained.retained.map((event) => [event.occurrenceIdentity, event]));
  const findings = /** @type {string[]} */ (repeat.occurrenceIdentities)
    .map((identity) => byOccurrence.get(identity));
  if (findings.some((event) => !event || event.type !== 'finding-occurrence')) {
    return { incompleteReason: 'occurrence-retention-incomplete' };
  }
  const events = /** @type {Record<string, unknown>[]} */ (findings);
  let failedApproachSet;
  try {
    failedApproachSet = deriveFailedApproachSetV1(repeat, retained.retained);
  } catch {
    return { incompleteReason: 'repeat-not-established' };
  }
  return {
    repeat,
    findingOccurrenceEvents: events,
    failedApproachSet,
    reviewEnvelopeIdentities: events.map((event) => (
      /** @type {Record<string, unknown>} */ (event.occurrence).reviewEnvelopeIdentity
    )),
  };
}

/**
 * Derive one complete acyclic Feature 007 incident correction. RunState is
 * never mutated here: the lane transaction owns application.
 * @param {unknown} stateValue @param {unknown} inputValue @param {unknown} requestValue
 * @param {unknown} [dependencies] @param {boolean} [transport]
 */
export function prepareIncidentCorrectionV2(stateValue, inputValue, requestValue, dependencies, transport = false) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  if (/** @type {Record<string, unknown>} */ (state.policy).mode !== 'autonomous') {
    invalid('prepareIncidentCorrectionV2', 'requires autonomous policy');
  }
  const request = assertExactRecord(
    requestValue,
    ['acceptedFeatureEvidence', 'incidentIdentity', 'priorDispositionIdentity', 'operationTime', 'captures'],
    [],
    'incident-correction request',
  );
  assertHash(request.incidentIdentity, 'incident-correction request.incidentIdentity');
  assertHash(request.priorDispositionIdentity, 'incident-correction request.priorDispositionIdentity');
  const operationTime = assertV2CanonicalUtcTimestamp(request.operationTime, 'incident-correction request.operationTime');
  const captures = assertExactRecord(request.captures, ['idea', 'tasks', 'taskState'], [], 'incident-correction request.captures');
  const ideaCapture = validateCapturedBytesV1(captures.idea, 'incident-correction request.captures.idea');
  const tasksCapture = validateCapturedBytesV1(captures.tasks, 'incident-correction request.captures.tasks');
  const taskStateCapture = validateCapturedBytesV1(captures.taskState, 'incident-correction request.captures.taskState');
  const acquired = acquireInspection(inputValue, dependencies, transport, 'autonomous');
  const inspection = /** @type {Record<string, unknown>} */ (acquired.inspection);
  if (inspection.overflow) return { inspection };
  /** @param {Record<string, unknown>} transition */
  const respond = (transition) => ({ inspection, transition });
  if (/** @type {unknown[]} */ (inspection.blockers).length > 0) {
    return respond({ prepared: false, reason: 'inspection-stale', state });
  }
  let accepted;
  try {
    accepted = validateAcceptedFeatureEvidenceV1(
      request.acceptedFeatureEvidence,
      'incident-correction request.acceptedFeatureEvidence',
    );
  } catch {
    return respond({ prepared: false, reason: 'incident-correction-not-authorized', state });
  }
  if (accepted.mode !== 'core-close') {
    return respond({ prepared: false, reason: 'core-close-evidence-stale', state });
  }
  if (targetKey(inspection.target) !== targetKey(FEATURE_007_TARGET)) {
    return respond({ prepared: false, reason: 'target-mismatch', state });
  }
  requireResolvedOwnerMappingV2(inspection, FEATURE_007_TARGET, 'prepareIncidentCorrectionV2');
  const fresh = freshLightweightTaskFactsV2(inspection, FEATURE_007_TARGET);
  // The owner body and the blocker are workspace-derived, not caller-supplied:
  // a resolved owner idea stored under another path, or blocker text the lane
  // contracts cannot carry, refuses in the closed set instead of throwing.
  /** @type {Record<string, unknown>|null} */
  let owner = null;
  /** @type {string|null} */
  let blockedBy = null;
  try {
    owner = feature007OwnerBodyV2(inspection);
    blockedBy = fresh.blockedBy === null
      ? null
      : assertV2ShortText(fresh.blockedBy, 'incident-correction fresh blocker');
  } catch {
    owner = null;
    blockedBy = null;
  }
  if (owner === null || fresh.glyph !== '!' || blockedBy === null) {
    return respond({ prepared: false, reason: 'incident-correction-not-authorized', state });
  }
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: FEATURE_007_IDEA_PATH,
    specPath: FEATURE_007_TARGET.specPath,
    ownerCapture: { sha256: ideaCapture.envelope.sha256, byteLength: ideaCapture.envelope.byteLength },
  }));
  const prestate = {
    version: 1,
    target: canonicalTarget(FEATURE_007_TARGET),
    ownerBindingHash,
    ideaPath: FEATURE_007_IDEA_PATH,
    ideaHash: ideaCapture.envelope.sha256,
    tasksPath: FEATURE_007_TASKS_PATH,
    tasksHash: tasksCapture.envelope.sha256,
    taskStatePath: TASK_STATE_PATH,
    taskStateHash: taskStateCapture.envelope.sha256,
    ownerLogTailHash: sha256(/** @type {string} */ (owner.coordinatorLog)),
    taskUnitHash: fresh.taskUnitHash,
    glyph: '!',
    blockedBy: fresh.blockedBy,
    blockedByHash: sha256(/** @type {string} */ (fresh.blockedBy)),
  };
  validateFeature007PrestateV1(prestate);
  const rollbackWithoutIdentity = {
    version: 1,
    captures: [
      { path: FEATURE_007_IDEA_PATH, bytes: ideaCapture.envelope },
      { path: FEATURE_007_TASKS_PATH, bytes: tasksCapture.envelope },
      { path: TASK_STATE_PATH, bytes: taskStateCapture.envelope },
    ],
  };
  const rollback = {
    ...rollbackWithoutIdentity,
    rollbackIdentity: sha256(canonicalJson(rollbackWithoutIdentity)),
  };
  validateFeature007RollbackV1(rollback);
  const derived = incidentBranchEvidenceV2(inspection);
  const exact = !derived.incompleteReason;
  // The exact branch derives a required Governance Event: one singleton only.
  if (exact && Object.hasOwn(state, 'learningGovernance')) {
    return respond({ prepared: false, reason: 'learning-governance-conflict', state });
  }
  const evidenceInventoryHash = sha256(canonicalJson(exact
    ? {
      version: 1,
      target: canonicalTarget(FEATURE_007_TARGET),
      branch: 'exact-evidence',
      reviewEnvelopeIdentities: derived.reviewEnvelopeIdentities,
      findingOccurrenceEventHashes: /** @type {Record<string, unknown>[]} */ (derived.findingOccurrenceEvents)
        .map((event) => event.eventHash),
    }
    : {
      version: 1,
      target: canonicalTarget(FEATURE_007_TARGET),
      branch: 'evidence-incomplete',
      incompleteReason: derived.incompleteReason,
    }));
  const intentCore = {
    version: 1,
    branch: exact ? 'exact-evidence' : 'evidence-incomplete',
    operationTime,
    incidentIdentity: request.incidentIdentity,
    target: canonicalTarget(FEATURE_007_TARGET),
    priorDispositionIdentity: request.priorDispositionIdentity,
    acceptedFeatureEvidenceIdentity: accepted.acceptedFeatureEvidenceIdentity,
    prestateIdentity: sha256(canonicalJson(prestate)),
    evidenceInventoryHash,
    ...(exact
      ? {
        reviewEnvelopeIdentities: derived.reviewEnvelopeIdentities,
        findingOccurrenceIdentities: /** @type {Record<string, unknown>[]} */ (derived.findingOccurrenceEvents)
          .map((event) => event.occurrenceIdentity),
        repeat: derived.repeat,
        resultingTargetState: 'in-progress-learning-required',
        taskEffect: {
          fromGlyph: '!',
          toGlyph: '~',
          blocker: { kind: 'remove', before: fresh.blockedBy, after: null },
        },
      }
      : {
        incompleteReason: derived.incompleteReason,
        resultingTargetState: 'blocked-evidence-incomplete',
        taskEffect: {
          fromGlyph: '!',
          toGlyph: '!',
          blocker: { kind: 'replace', before: fresh.blockedBy, after: INCIDENT_INCOMPLETE_BLOCKER },
        },
      }),
  };
  if (!exact && fresh.blockedBy === INCIDENT_INCOMPLETE_BLOCKER) {
    return respond({ prepared: false, reason: 'incident-evidence-incomplete', state });
  }
  const intent = { ...intentCore, intentIdentity: sha256(canonicalJson(intentCore)) };
  validateIncidentCorrectionIntentV1(intent);
  const supersessionCore = {
    type: 'incident-supersession',
    version: 1,
    incidentIdentity: intent.incidentIdentity,
    intentIdentity: intent.intentIdentity,
    target: canonicalTarget(FEATURE_007_TARGET),
    priorDispositionIdentity: intent.priorDispositionIdentity,
    acceptedFeatureEvidenceIdentity: intent.acceptedFeatureEvidenceIdentity,
    branch: intent.branch,
    conclusion: 'unauthorized-block-superseded',
    resultingTargetState: intent.resultingTargetState,
    evidenceInventoryHash,
  };
  const supersessionEvent = { ...supersessionCore, eventHash: sha256(canonicalJson(supersessionCore)) };
  validateIncidentSupersessionEventV1(supersessionEvent);
  const supersessionBatch = buildProjectionBatchV1(
    'incident-supersession',
    FEATURE_007_TARGET,
    [supersessionEvent],
    'incident supersession',
  );
  /** @type {Record<string, unknown>[]} */
  const lineEvents = [];
  /** @type {Record<string, unknown>} */
  const branchBatches = {};
  if (exact) {
    const findingEvents = /** @type {Record<string, unknown>[]} */ (derived.findingOccurrenceEvents);
    const incidentEvidenceBatch = buildProjectionBatchV1(
      'incident-evidence',
      FEATURE_007_TARGET,
      findingEvents,
      'incident evidence',
    );
    const failedApproachSet = /** @type {Record<string, unknown>} */ (derived.failedApproachSet);
    const repeat = /** @type {Record<string, unknown>} */ (derived.repeat);
    const governanceEvent = buildGovernanceEventV1({
      version: 1,
      governanceIdentity: sha256(canonicalJson({
        version: 1,
        target: canonicalTarget(FEATURE_007_TARGET),
        repeatIdentity: sha256(canonicalJson(repeat)),
      })),
      target: canonicalTarget(FEATURE_007_TARGET),
      trigger: repeat,
      failedApproachSet,
      phase: 'required',
      revision: 1,
      triggerEvidenceHash: sha256(canonicalJson({
        trigger: repeat,
        failedApproachSetIdentity: failedApproachSet.setIdentity,
      })),
    });
    const governanceBatch = buildProjectionBatchV1(
      'governance-required',
      FEATURE_007_TARGET,
      [governanceEvent],
      'incident governance required',
    );
    branchBatches.incidentEvidenceBatch = incidentEvidenceBatch;
    branchBatches.governanceBatch = governanceBatch;
    lineEvents.push(...findingEvents, governanceEvent);
  }
  lineEvents.push(supersessionEvent);
  const taskEffect = /** @type {Record<string, unknown>} */ (intent.taskEffect);
  const mutationCore = {
    intentIdentity: intent.intentIdentity,
    target: canonicalTarget(FEATURE_007_TARGET),
    fromGlyph: '!',
    toGlyph: taskEffect.toGlyph,
    blocker: taskEffect.blocker,
    eventLines: {
      kind: 'append-exact',
      lines: lineEvents.map((event) => ({
        eventHash: event.eventHash,
        exactLine: v2EventLineText(event),
        terminator: 'LF',
      })),
      appendIfAbsent: true,
    },
    ownerLog: {
      kind: 'append-exact',
      ownerPath: FEATURE_007_IDEA_PATH,
      expectedOwnerHash: ideaCapture.envelope.sha256,
      exactLines: [
        `- ${operationTime} - incident-supersession v1 intent=${intent.intentIdentity} branch=${intent.branch} target=${FEATURE_007_TARGET.taskKey}`,
      ],
      terminator: 'LF',
      appendIfAbsent: true,
    },
    snapshotUpdatedAt: operationTime,
  };
  validateIncidentLaneMutationCoreV1(mutationCore);
  const previewCore = {
    version: 1,
    branch: intent.branch,
    intent,
    acceptedFeatureEvidence: accepted,
    prestate,
    evidence: exact
      ? {
        inventoryHash: evidenceInventoryHash,
        reviewEnvelopeIdentities: derived.reviewEnvelopeIdentities,
        findingOccurrenceEvents: derived.findingOccurrenceEvents,
        repeat: derived.repeat,
      }
      : { inventoryHash: evidenceInventoryHash, incompleteReason: derived.incompleteReason },
    ...branchBatches,
    supersessionBatch,
    mutationCore,
    rollback,
  };
  const preview = { ...previewCore, previewIdentity: sha256(canonicalJson(previewCore)) };
  validateIncidentCorrectionPreviewV1(preview);
  // The final mutation adds only its closed constants and `previewIdentity`.
  const mutation = {
    version: 1,
    lane: 'lightweight',
    kind: 'incident-supersession',
    reason: 'incident-supersession',
    intentIdentity: intent.intentIdentity,
    previewIdentity: preview.previewIdentity,
    target: canonicalTarget(FEATURE_007_TARGET),
    fromGlyph: '!',
    toGlyph: mutationCore.toGlyph,
    blocker: mutationCore.blocker,
    eventLines: mutationCore.eventLines,
    ownerLog: mutationCore.ownerLog,
    snapshotUpdatedAt: mutationCore.snapshotUpdatedAt,
  };
  const derivedMutation = validateLaneMutationV1(mutation, FEATURE_007_TARGET, 'incident supersession mutation');
  return respond({
    prepared: true,
    reason: exact ? 'incident-correction-prepared' : 'incident-evidence-incomplete',
    branch: intent.branch,
    // RunState is byte-identical: derivation grants no lane authority by itself.
    state,
    intent,
    supersessionEvent,
    ...branchBatches,
    supersessionBatch,
    preview,
    mutation,
    mutationIdentity: derivedMutation.mutationIdentity,
  });
}

/**
 * Execute one closed recovery command without scheduling or invoking owners.
 * @param {unknown} commandValue
 * @param {unknown} requestValue
 * @param {unknown} [dependencies]
 */
export function runCommand(commandValue, requestValue, dependencies) {
  validateDependencies(dependencies);
  assertUnicodeScalarString(commandValue, 'command');
  const command = /** @type {string} */ (commandValue);
  if (!['inspect', 'authorize', 'complete', 'learn', 'transition', 'audit'].includes(command)) invalid('unknown command', 'is not supported');
  if (command === 'audit') {
    const request = assertExactRecord(requestValue, ['state', 'input'], ['halt'], 'audit request');
    const input = decodeTransportInput(request.input, 'audit request.input', false);
    return auditGovernanceV2(
      request.state,
      input,
      Object.hasOwn(request, 'halt') ? request.halt : undefined,
      dependencies,
      true,
    );
  }
  if (command === 'inspect') {
    const request = assertExactRecord(requestValue, ['trigger', 'input'], [], 'inspect request');
    assertEnum(request.trigger, WORK_TRIGGERS, 'inspect request.trigger');
    if (request.trigger !== 'explicit-inspection') {
      invalid('inspect request.trigger', 'must be explicit-inspection');
    }
    const input = decodeTransportInput(request.input, 'inspect request.input', false);
    return { inspection: acquireInspection(input, dependencies, true).inspection };
  }
  if (command === 'authorize') {
    const request = assertExactRecord(
      requestValue,
      ['trigger', 'state', 'input', 'assessment', 'mode'],
      ['attemptPermit'],
      'authorize request',
    );
    assertEnum(request.trigger, WORK_TRIGGERS, 'authorize request.trigger');
    if (request.trigger === 'explicit-inspection') {
      invalid('authorize request.trigger', 'cannot be explicit-inspection');
    }
    const state = /** @type {Record<string, unknown>} */ (validateRunState(request.state));
    const input = decodeTransportInput(request.input, 'authorize request.input', false);
    const acquired = acquireInspection(
      input,
      dependencies,
      true,
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (state.policy).mode),
    );
    const inspection = acquired.inspection;
    const authorization = authorizeInspectedAttempt(
      state,
      acquired.target,
      inspection,
      request.assessment,
      request.mode,
      Object.hasOwn(request, 'attemptPermit') ? request.attemptPermit : undefined,
    );
    return { inspection, authorization };
  }
  if (command === 'learn') {
    const request = assertExactRecord(requestValue, ['state', 'input', 'review'], [], 'learn request');
    const input = decodeTransportInput(request.input, 'learn request.input', false);
    return learnGovernanceV2(request.state, input, request.review, dependencies, true);
  }
  if (command === 'transition') {
    const mode = assertRecord(requestValue, 'transition request').mode;
    assertEnum(
      mode,
      [
        'prepare-projection', 'verify-projection', 'bind-post-learning-inspection', 'verify-no-progress',
        'halt', 'suspend-target', 'controlled-end', 'resume-governance',
        'issue-attempt-permit', 'issue-lane-permit', 'commit-lane-receipt', 'incident-correction',
      ],
      'transition request.mode',
    );
    if (mode === 'prepare-projection' || mode === 'verify-projection') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'projectionBatch'],
        mode === 'prepare-projection' ? ['lanePrestate', 'targetMapping', 'operationTime'] : [],
        `transition.${mode} request`,
      );
      const input = decodeTransportInput(request.input, `transition.${mode} request.input`, false);
      if (mode === 'verify-projection') {
        return verifyProjectionV2(request.state, input, request.projectionBatch, dependencies, true);
      }
      const bindingFields = ['lanePrestate', 'targetMapping', 'operationTime'];
      const supplied = bindingFields.filter((field) => Object.hasOwn(request, field));
      if (supplied.length !== 0 && supplied.length !== bindingFields.length) {
        invalid('transition.prepare-projection request', 'requires the complete lane binding or none of it');
      }
      return prepareProjectionV2(
        request.state,
        input,
        request.projectionBatch,
        dependencies,
        true,
        supplied.length === 0 ? undefined : {
          lanePrestate: request.lanePrestate,
          targetMapping: request.targetMapping,
          operationTime: request.operationTime,
        },
      );
    }
    if (mode === 'issue-attempt-permit') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'lanePrestate', 'targetMapping'],
        [],
        'transition.issue-attempt-permit request',
      );
      const input = decodeTransportInput(request.input, 'transition.issue-attempt-permit request.input', false);
      return issueAttemptPermitV2(request.state, input, request.lanePrestate, request.targetMapping, dependencies, true);
    }
    if (mode === 'issue-lane-permit') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'mutation', 'lanePrestate', 'targetMapping'],
        [],
        'transition.issue-lane-permit request',
      );
      const input = decodeTransportInput(request.input, 'transition.issue-lane-permit request.input', false);
      return issueLanePermitV2(
        request.state,
        input,
        request.mutation,
        request.lanePrestate,
        request.targetMapping,
        dependencies,
        true,
      );
    }
    if (mode === 'commit-lane-receipt') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'permit', 'receipt'],
        [],
        'transition.commit-lane-receipt request',
      );
      const input = decodeTransportInput(request.input, 'transition.commit-lane-receipt request.input', false);
      return commitLaneReceiptV2(request.state, input, request.permit, request.receipt, dependencies, true);
    }
    if (mode === 'incident-correction') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'incident'],
        [],
        'transition.incident-correction request',
      );
      const input = decodeTransportInput(request.input, 'transition.incident-correction request.input', false);
      return prepareIncidentCorrectionV2(request.state, input, request.incident, dependencies, true);
    }
    if (mode === 'halt') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'halt'],
        [],
        'transition.halt request',
      );
      const input = decodeTransportInput(request.input, 'transition.halt request.input', false);
      return haltGovernanceV2(request.state, input, request.halt, dependencies, true);
    }
    if (mode === 'suspend-target') {
      const request = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'scheduling'],
        ['halt'],
        'transition.suspend-target request',
      );
      const input = decodeTransportInput(request.input, 'transition.suspend-target request.input', false);
      return suspendTargetV2(
        request.state,
        input,
        {
          scheduling: request.scheduling,
          ...(Object.hasOwn(request, 'halt') ? { halt: request.halt } : {}),
        },
        dependencies,
        true,
      );
    }
    const request = assertExactRecord(
      requestValue,
      ['mode', 'state', 'input'],
      [],
      `transition.${mode} request`,
    );
    const input = decodeTransportInput(request.input, `transition.${mode} request.input`, false);
    if (mode === 'bind-post-learning-inspection') {
      return bindPostLearningInspectionV2(request.state, input, dependencies, true);
    }
    if (mode === 'verify-no-progress') return verifyNoProgressV2(request.state, input, dependencies, true);
    if (mode === 'controlled-end') return controlledEndV2(request.state, input, dependencies, true);
    return resumeGovernanceV2(request.state, input, dependencies, true);
  }
  if (Object.hasOwn(assertRecord(requestValue, 'complete request'), 'mode')) {
    const mode = /** @type {Record<string, unknown>} */ (requestValue).mode;
    assertEnum(mode, ['capture', 'finalize'], 'complete request.mode');
    if (mode === 'capture') {
      const captureRequest = assertExactRecord(
        requestValue,
        ['mode', 'state', 'input', 'completion'],
        [],
        'complete.capture request',
      );
      const captureInput = decodeTransportInput(captureRequest.input, 'complete.capture request.input', false);
      return captureCompletionV2(
        captureRequest.state,
        captureInput,
        captureRequest.completion,
        dependencies,
        true,
      );
    }
    const finalizeRequest = assertExactRecord(
      requestValue,
      ['mode', 'state', 'input', 'projectionBatch'],
      [],
      'complete.finalize request',
    );
    const finalizeInput = decodeTransportInput(finalizeRequest.input, 'complete.finalize request.input', false);
    return finalizeCompletionV2(
      finalizeRequest.state,
      finalizeInput,
      finalizeRequest.projectionBatch,
      dependencies,
      true,
    );
  }
  const request = assertExactRecord(requestValue, ['state', 'input'], [], 'complete request');
  return { completion: completeAttempt(request.state, request.input) };
}

/**
 * Derive one closed low-level recovery request from a typed governance intent.
 * This pure dispatcher validates data and grants no effect or successor authority.
 * @param {unknown} stateValue @param {unknown} intentValue
 */
export function deriveGovernanceRuntimeRequestV1(stateValue, intentValue) {
  const state = /** @type {Record<string, unknown>} */ (
    validateRunState(detachRuntimeData(stateValue, 'GovernanceRuntimeRequestV1.state'))
  );
  const intent = detachRuntimeData(intentValue, 'GovernanceRuntimeRequestV1.intent');
  const action = assertRecord(intent, 'GovernanceRuntimeRequestV1.intent').action;
  assertEnum(action, [
    'review-learning', 'bind-alternative', 'verify-no-progress', 'controlled-end',
    'resume-learning', 'halt', 'suspend-target',
  ], 'GovernanceRuntimeRequestV1.intent.action');
  if (action === 'review-learning') {
    const governed = assertExactRecord(intent, ['action', 'input', 'review'], [], 'GovernanceRuntimeRequestV1.intent');
    return detachRuntimeData({
      command: 'learn',
      request: { state, input: governed.input, review: governed.review },
      resultKey: 'learning',
      successFlag: 'reviewed',
    }, 'GovernanceRuntimeRequestV1');
  }
  const governed = action === 'halt'
    ? assertExactRecord(intent, ['action', 'input', 'halt'], [], 'GovernanceRuntimeRequestV1.intent')
    : action === 'suspend-target'
      ? assertExactRecord(intent, ['action', 'input', 'scheduling'], ['halt'], 'GovernanceRuntimeRequestV1.intent')
      : assertExactRecord(intent, ['action', 'input'], [], 'GovernanceRuntimeRequestV1.intent');
  const routes = {
    'bind-alternative': ['bind-post-learning-inspection', 'bound'],
    'verify-no-progress': ['verify-no-progress', 'verified'],
    'controlled-end': ['controlled-end', 'ended'],
    'resume-learning': ['resume-governance', 'resumed'],
    halt: ['halt', 'halted'],
    'suspend-target': ['suspend-target', 'suspended'],
  };
  const [mode, successFlag] = routes[/** @type {keyof typeof routes} */ (action)];
  const request = { mode, state, input: governed.input };
  if (action === 'halt') request.halt = governed.halt;
  if (action === 'suspend-target') {
    request.scheduling = governed.scheduling;
    if (Object.hasOwn(governed, 'halt')) request.halt = governed.halt;
  }
  return detachRuntimeData({
    command: 'transition', request, resultKey: 'transition', successFlag,
  }, 'GovernanceRuntimeRequestV1');
}

/**
 * Reacquire and recompute one recovery result from its exact closed request.
 * This validation-only operation grants no effect, permit, or adapter authority.
 * @param {unknown} commandValue @param {unknown} requestValue @param {unknown} resultValue
 */
export function validateRecoveryRuntimeResultV1(commandValue, requestValue, resultValue) {
  const request = detachRuntimeData(requestValue, 'RecoveryRuntimeResultV1.request');
  const supplied = detachRuntimeData(resultValue, 'RecoveryRuntimeResultV1.result');
  const expected = detachRuntimeData(
    runCommand(commandValue, request),
    'RecoveryRuntimeResultV1.expected',
  );
  if (canonicalJson(supplied) !== canonicalJson(expected)) {
    invalid('RecoveryRuntimeResultV1.result', 'must equal the recovery-owned result for the exact request');
  }
  return true;
}

/**
 * Route one retention proposal to its existing owner boundary without side effects.
 * @param {unknown} inputValue
 * @param {unknown} [dependenciesValue]
 */
export function retentionRoute(inputValue, dependenciesValue) {
  const input = assertExactRecord(
    inputValue,
    ['retention', 'finding'],
    ['artifact', 'content', 'slug'],
    'retention input',
  );
  assertEnum(input.retention, ['transient', 'memory', 'skill', 'none'], 'retention input.retention');
  assertUnicodeScalarString(input.finding, 'retention input.finding');
  if (Buffer.byteLength(/** @type {string} */ (input.finding)) < 1) {
    invalid('retention input.finding', 'must be nonempty');
  }
  const dependencies = dependenciesValue === undefined
    ? {}
    : assertExactRecord(dependenciesValue, [], ['analyzeMemory', 'inspectSkill'], 'retention dependencies');
  for (const name of ['analyzeMemory', 'inspectSkill']) {
    if (Object.hasOwn(dependencies, name) && typeof dependencies[name] !== 'function') {
      invalid(`retention dependencies.${name}`, 'must be a function');
    }
  }
  const retention = /** @type {string} */ (input.retention);
  if (retention === 'transient' || retention === 'none') {
    if (Object.keys(input).some((key) => !['retention', 'finding'].includes(key))) {
      invalid('retention input', `${retention} accepts no owner fields`);
    }
    return { retention, owner: null, artifact: null, refused: false };
  }
  if (retention === 'memory') {
    assertExactRecord(input, ['retention', 'finding', 'artifact', 'content'], [], 'memory retention input');
    if (typeof dependencies.analyzeMemory !== 'function') invalid('retention dependencies.analyzeMemory', 'is required');
    assertUnicodeScalarString(input.artifact, 'memory retention input.artifact');
    assertUnicodeScalarString(input.content, 'memory retention input.content');
    const analysis = assertExactRecord(
      dependencies.analyzeMemory(input.content, input.finding),
      ['entryCount', 'overlaps', 'maxScore'],
      [],
      'memory retention analysis',
    );
    assertSafeInteger(analysis.entryCount, 'memory retention analysis.entryCount', false);
    if (typeof analysis.maxScore !== 'number' || !Number.isFinite(analysis.maxScore)
      || analysis.maxScore < 0 || analysis.maxScore > 1) {
      invalid('memory retention analysis.maxScore', 'must be a finite number from 0 through 1');
    }
    const overlaps = assertDenseDataArray(analysis.overlaps, 'memory retention analysis.overlaps');
    overlaps.forEach((value, index) => {
      const overlap = assertExactRecord(
        value,
        ['id', 'score'],
        [],
        `memory retention analysis.overlaps[${index}]`,
      );
      assertUnicodeScalarString(overlap.id, `memory retention analysis.overlaps[${index}].id`);
      if (typeof overlap.score !== 'number' || !Number.isFinite(overlap.score)
        || overlap.score < 0 || overlap.score > 1) {
        invalid(`memory retention analysis.overlaps[${index}].score`, 'must be a finite number from 0 through 1');
      }
    });
    const refused = overlaps.length > 0;
    return {
      retention,
      owner: ['dude', 'memory', 'ledger'].join('-'),
      artifact: input.artifact,
      refused,
      ...(refused ? { reason: 'duplicate or overlapping memory finding' } : {}),
    };
  }
  const skillInput = assertExactRecord(
    input,
    ['retention', 'finding', 'slug'],
    [],
    'skill retention input',
  );
  if (typeof dependencies.inspectSkill !== 'function') invalid('retention dependencies.inspectSkill', 'is required');
  assertUnicodeScalarString(skillInput.slug, 'skill retention input.slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(/** @type {string} */ (skillInput.slug))) {
    invalid('skill retention input.slug', 'must be a canonical skill slug');
  }
  const inspection = assertExactRecord(
    dependencies.inspectSkill({
      finding: skillInput.finding,
      slug: skillInput.slug,
    }),
    ['destinationExists', 'overlaps'],
    [],
    'skill retention inspection',
  );
  if (typeof inspection.destinationExists !== 'boolean') {
    invalid('skill retention inspection.destinationExists', 'must be a boolean');
  }
  const overlaps = assertSortedUniqueStrings(
    inspection.overlaps,
    assertMaterialIdentifier,
    'skill retention inspection.overlaps',
  );
  const refused = inspection.destinationExists || overlaps.length > 0;
  return {
    retention,
    owner: ['dude', 'learning', 'promotion'].join('-'),
    boundary: ['dude', 'skill', 'authoring'].join('-'),
    artifact: `.github/skills/dude-local-${skillInput.slug}/SKILL.md`,
    refused,
    ...(refused ? { reason: inspection.destinationExists ? 'skill destination exists' : 'skill overlap exists' } : {}),
  };
}

function readCliRequest() {
  const bytes = Buffer.allocUnsafe(MAX_CLI_REQUEST_BYTES);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const read = fs.readSync(0, bytes, offset, Math.min(65_536, bytes.byteLength - offset), null);
    if (read === 0) return bytes.subarray(0, offset);
    offset += read;
  }
  const probe = Buffer.allocUnsafe(1);
  if (fs.readSync(0, probe, 0, 1, null) !== 0) {
    invalid('CLI request stdin', `exceeds the resource limit of ${MAX_CLI_REQUEST_BYTES} bytes`);
  }
  return bytes;
}

// === Feature 005 (T005): bounded objective evaluation machinery ==============
// Identity derivations, the injected checkpoint-host lifecycle, deterministic
// comparators, and the five authoritative retention gates. The checkpoint host
// is a dedicated parameter of these functions and is never threaded through
// `dependencies`; the guarded/no-objective evidence and authorization path is
// untouched. Every gate result and comparison relation is DERIVED from
// validated authority records; callers cannot inject a gate status or relation.

const MAX_WRITE_SET_PATHS = 64;
const MAX_CHECKPOINT_FILE_BYTES = 1_048_576;
const MAX_CHECKPOINT_AGGREGATE_BYTES = 4_194_304;
const MAX_EVALUATION_SEQUENCES = 16;
const MAX_RECENT_COMPARISONS = 8;
const MAX_TOTAL_COMPARISON_REFS = 64;
const MAX_LEARNING_REVIEW_REFS = 16;
const CHECKPOINT_PHASES = Object.freeze(['captured', 'candidate', 'restoring', 'kept', 'restored', 'unsettled']);
const CHECKPOINT_VALUE_PHASES = Object.freeze(['candidate', 'kept', 'unsettled']);
const GATE_NAMES = Object.freeze(['authorization', 'checkpoint', 'hard-constraints', 'comparison', 'independent-review']);
const OBSERVATION_ROLES = Object.freeze(['baseline', 'incumbent', 'candidate']);
const OBSERVATION_STATUSES = Object.freeze(['ok', 'failed', 'timeout', 'crash', 'malformed']);
const JUDGMENT_RELATIONS = Object.freeze(['better', 'equivalent', 'worse', 'incomparable']);
const DECISION_REASONS = Object.freeze([
  'numeric-threshold', 'ordinal-levels', 'unanimous-rubric', 'evaluator-disagreement',
  'observation-not-ok', 'binding-drift',
]);
const READINESS_OUTCOMES = Object.freeze(['accepted', 'rejected', 'timeout', 'crash']);
const TIE_OUTCOMES = Object.freeze(['candidate', 'incumbent', 'equivalent', 'incomparable', 'timeout', 'crash']);
const RESERVED_COMPLETION_CHECK_ID = 'candidate-bound-completion';

/** Assert a value is already a canonical Target identity. @param {unknown} value @param {string} label */
function assertCanonicalTargetIdentity(value, label) {
  validateTarget(value);
  if (canonicalJson(value) !== canonicalJson(canonicalTarget(value))) {
    invalid(label, 'must be a canonical target identity');
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function validatePlanDescriptor(value, label) {
  const descriptorRecord = assertExactRecord(value, ['sha256', 'byteLength'], [], label);
  assertHash(descriptorRecord.sha256, `${label}.sha256`);
  assertSafeInteger(descriptorRecord.byteLength, `${label}.byteLength`, false);
  return value;
}

/** Validate one closed CandidateWriteSet. @param {unknown} value @param {string} [label] */
export function validateCandidateWriteSet(value, label = 'CandidateWriteSet') {
  const writeSet = assertExactRecord(value, ['candidatePaths', 'protectedPaths'], [], label);
  const candidatePaths = /** @type {string[]} */ (
    assertSortedUniqueStrings(writeSet.candidatePaths, assertNormalizedWorkspacePath, `${label}.candidatePaths`)
  );
  if (candidatePaths.length < 1) invalid(`${label}.candidatePaths`, 'must contain at least one path');
  const protectedPaths = /** @type {string[]} */ (
    assertSortedUniqueStrings(writeSet.protectedPaths, assertNormalizedWorkspacePath, `${label}.protectedPaths`)
  );
  const union = new Set(candidatePaths);
  for (const path of protectedPaths) {
    if (union.has(path)) invalid(label, 'candidate and protected paths must be disjoint');
    union.add(path);
  }
  if (union.size > MAX_WRITE_SET_PATHS) invalid(label, `must contain at most ${MAX_WRITE_SET_PATHS} paths`);
  return value;
}

/** The sorted path union of a validated write set. @param {Record<string, unknown>} writeSet */
function writeSetUnion(writeSet) {
  return [.../** @type {string[]} */ (writeSet.candidatePaths), .../** @type {string[]} */ (writeSet.protectedPaths)]
    .sort(compareUtf8);
}

/** Derive the write-set identity. @param {unknown} value */
export function writeSetIdentity(value) {
  validateCandidateWriteSet(value);
  return sha256(canonicalJson(value));
}

/** Validate ordered file-state descriptors that cover a write-set union exactly. @param {unknown} value @param {unknown} writeSetValue @param {string} [label] */
export function validateFileStateDescriptors(value, writeSetValue, label = 'fileStateDescriptors') {
  validateCandidateWriteSet(writeSetValue);
  const union = new Set(writeSetUnion(/** @type {Record<string, unknown>} */ (writeSetValue)));
  const files = assertDenseDataArray(value, label);
  /** @type {string|null} */
  let previous = null;
  const seen = new Set();
  let aggregate = 0;
  files.forEach((fileValue, index) => {
    const rowLabel = `${label}[${index}]`;
    const state = assertRecord(fileValue, rowLabel).state;
    const row = state === 'missing'
      ? assertExactRecord(fileValue, ['path', 'state'], [], rowLabel)
      : assertExactRecord(fileValue, ['path', 'state', 'sha256', 'byteLength'], [], rowLabel);
    assertNormalizedWorkspacePath(row.path, `${rowLabel}.path`);
    assertEnum(row.state, ['missing', 'file'], `${rowLabel}.state`);
    if (row.state === 'file') {
      assertHash(row.sha256, `${rowLabel}.sha256`);
      assertSafeInteger(row.byteLength, `${rowLabel}.byteLength`, false);
      if (/** @type {number} */ (row.byteLength) > MAX_CHECKPOINT_FILE_BYTES) {
        invalid(`${rowLabel}.byteLength`, `must be at most ${MAX_CHECKPOINT_FILE_BYTES} bytes`);
      }
      aggregate += /** @type {number} */ (row.byteLength);
      if (aggregate > MAX_CHECKPOINT_AGGREGATE_BYTES) {
        invalid(label, `must capture at most ${MAX_CHECKPOINT_AGGREGATE_BYTES} aggregate bytes`);
      }
    }
    const path = /** @type {string} */ (row.path);
    if (!union.has(path)) invalid(`${rowLabel}.path`, 'must belong to the write-set union');
    if (seen.has(path)) invalid(label, 'must not repeat a path');
    seen.add(path);
    if (previous !== null && compareUtf8(previous, path) >= 0) invalid(label, 'must be sorted by path');
    previous = path;
  });
  if (seen.size !== union.size) invalid(label, 'must cover the complete write-set union exactly');
  return value;
}

/** Derive a state identity over a write-set identity and ordered descriptors. @param {string} writeSetId @param {unknown} files */
export function stateIdentity(writeSetId, files) {
  assertHash(writeSetId, 'writeSetIdentity');
  return sha256(canonicalJson({ writeSetIdentity: writeSetId, files }));
}

/** @param {{target:unknown,sequenceIdentity:string,contractHash:string,writeSetIdentity:string,prestateIdentity:string}} parts */
export function deriveCheckpointIdentity({ target, sequenceIdentity, contractHash, writeSetIdentity: wsId, prestateIdentity }) {
  assertHash(sequenceIdentity, 'sequenceIdentity');
  assertHash(contractHash, 'contractHash');
  assertHash(wsId, 'writeSetIdentity');
  assertHash(prestateIdentity, 'prestateIdentity');
  return sha256(canonicalJson({
    target: canonicalTarget(target),
    sequenceIdentity,
    contractHash,
    writeSetIdentity: wsId,
    prestateIdentity,
  }));
}

/** @param {string} checkpointIdentity @param {string} poststateIdentity */
export function deriveCandidateIdentity(checkpointIdentity, poststateIdentity) {
  assertHash(checkpointIdentity, 'checkpointIdentity');
  assertHash(poststateIdentity, 'poststateIdentity');
  return sha256(canonicalJson({ checkpointIdentity, poststateIdentity }));
}

/**
 * Derive the comparison rubric hash (A1). `rubricMaterial` is canonical null
 * when neither the comparator nor the tie rule declares a rubric; otherwise it
 * is `{comparatorRubric, tieRubric}` with each absent rubric collapsed to null.
 * @param {Record<string, unknown>} contract
 */
function deriveRubricHash(contract) {
  const comparator = /** @type {Record<string, unknown>} */ (contract.comparator);
  const tieRule = /** @type {Record<string, unknown>} */ (contract.tieRule);
  const comparatorRubric = Object.hasOwn(comparator, 'rubric') ? comparator.rubric : null;
  const tieRubric = Object.hasOwn(tieRule, 'rubric') ? tieRule.rubric : null;
  const rubricMaterial = comparatorRubric === null && tieRubric === null
    ? null
    : { comparatorRubric, tieRubric };
  return sha256(canonicalJson(rubricMaterial));
}

/**
 * Derive the active comparison binding identity from the contract's component
 * identities plus the plan-level binding fields.
 * @param {{ownerBindingHash:string,planDescriptor:unknown,registryHash:string,contract:unknown}} parts
 */
export function deriveBindingIdentity({ ownerBindingHash, planDescriptor, registryHash, contract }) {
  assertHash(ownerBindingHash, 'ownerBindingHash');
  assertHash(registryHash, 'registryHash');
  validatePlanDescriptor(planDescriptor, 'planDescriptor');
  validateEvaluationContract(contract);
  const record = /** @type {Record<string, unknown>} */ (contract);
  return sha256(canonicalJson({
    ownerBindingHash,
    planDescriptor,
    registryHash,
    contractHash: sha256(canonicalJson(contract)),
    evaluatorIdentity: sha256(canonicalJson(record.evaluators)),
    inputIdentity: sha256(canonicalJson(record.inputs)),
    environmentIdentity: sha256(canonicalJson(record.environment)),
    conditionIdentity: sha256(canonicalJson(record.conditions)),
    rubricHash: deriveRubricHash(record),
    budgetIdentity: sha256(canonicalJson(record.budget)),
  }));
}

/** @param {{target:unknown,taskKey:string,ownerBindingHash:string,planDescriptor:unknown,registryHash:string,contractHash:string,bindingIdentity:string,baselineCandidateIdentity:string}} parts */
export function deriveSequenceIdentity({ target, taskKey, ownerBindingHash, planDescriptor, registryHash, contractHash, bindingIdentity, baselineCandidateIdentity }) {
  if (typeof taskKey !== 'string' || !TASK_KEY_PATTERN.test(taskKey)) invalid('sequenceIdentity.taskKey', 'must be a durable task key');
  assertHash(ownerBindingHash, 'ownerBindingHash');
  assertHash(registryHash, 'registryHash');
  assertHash(contractHash, 'contractHash');
  assertHash(bindingIdentity, 'bindingIdentity');
  assertHash(baselineCandidateIdentity, 'baselineCandidateIdentity');
  validatePlanDescriptor(planDescriptor, 'planDescriptor');
  return sha256(canonicalJson({
    target: canonicalTarget(target),
    taskKey,
    ownerBindingHash,
    planDescriptor,
    registryHash,
    contractHash,
    bindingIdentity,
    baselineCandidateIdentity,
  }));
}

/** @param {unknown} value @param {string} label @param {number|null} previousOrdinal @returns {number} */
function validateProjectionReference(value, label, previousOrdinal) {
  const ref = assertExactRecord(
    value,
    ['ordinal', 'comparisonIdentity', 'eventHash', 'currentRunProjectionIdentity', 'laneProjectionIdentity'],
    [],
    label,
  );
  assertSafeInteger(ref.ordinal, `${label}.ordinal`, true);
  if (previousOrdinal !== null && /** @type {number} */ (ref.ordinal) <= previousOrdinal) {
    invalid(`${label}.ordinal`, 'must strictly increase within its sequence');
  }
  assertHash(ref.comparisonIdentity, `${label}.comparisonIdentity`);
  assertHash(ref.eventHash, `${label}.eventHash`);
  assertHash(ref.currentRunProjectionIdentity, `${label}.currentRunProjectionIdentity`);
  assertHash(ref.laneProjectionIdentity, `${label}.laneProjectionIdentity`);
  return /** @type {number} */ (ref.ordinal);
}

/** Validate the RunState `evaluationSequences` shape. @param {unknown} value @param {string} [label] */
export function validateEvaluationSequences(value, label = 'RunState.evaluationSequences') {
  const rows = assertDenseDataArray(value, label);
  if (rows.length > MAX_EVALUATION_SEQUENCES) invalid(label, `must contain at most ${MAX_EVALUATION_SEQUENCES} rows`);
  /** @type {string|null} */
  let previousSequenceIdentity = null;
  let totalComparisons = 0;
  rows.forEach((rowValue, index) => {
    const rowLabel = `${label}[${index}]`;
    const row = assertExactRecord(
      rowValue,
      [
        'sequenceIdentity', 'target', 'taskKey', 'ownerBindingHash', 'planDescriptor', 'registryHash',
        'contractHash', 'bindingIdentity', 'baselineCandidateIdentity', 'incumbentCandidateIdentity',
        'state', 'recentComparisons',
      ],
      ['activeCheckpointIdentity', 'activeCandidateIdentity'],
      rowLabel,
    );
    assertHash(row.sequenceIdentity, `${rowLabel}.sequenceIdentity`);
    assertCanonicalTargetIdentity(row.target, `${rowLabel}.target`);
    if (typeof row.taskKey !== 'string' || !TASK_KEY_PATTERN.test(row.taskKey)) invalid(`${rowLabel}.taskKey`, 'must be a durable task key');
    assertHash(row.ownerBindingHash, `${rowLabel}.ownerBindingHash`);
    validatePlanDescriptor(row.planDescriptor, `${rowLabel}.planDescriptor`);
    assertHash(row.registryHash, `${rowLabel}.registryHash`);
    assertHash(row.contractHash, `${rowLabel}.contractHash`);
    assertHash(row.bindingIdentity, `${rowLabel}.bindingIdentity`);
    assertHash(row.baselineCandidateIdentity, `${rowLabel}.baselineCandidateIdentity`);
    assertHash(row.incumbentCandidateIdentity, `${rowLabel}.incumbentCandidateIdentity`);
    assertEnum(row.state, ['open', 'closing', 'unsettled'], `${rowLabel}.state`);
    const comparisons = assertDenseDataArray(row.recentComparisons, `${rowLabel}.recentComparisons`);
    if (comparisons.length > MAX_RECENT_COMPARISONS) invalid(`${rowLabel}.recentComparisons`, `must contain at most ${MAX_RECENT_COMPARISONS} rows`);
    /** @type {number|null} */
    let previousOrdinal = null;
    comparisons.forEach((refValue, refIndex) => {
      previousOrdinal = validateProjectionReference(refValue, `${rowLabel}.recentComparisons[${refIndex}]`, previousOrdinal);
    });
    totalComparisons += comparisons.length;
    const hasCheckpoint = Object.hasOwn(row, 'activeCheckpointIdentity');
    const hasCandidate = Object.hasOwn(row, 'activeCandidateIdentity');
    if (hasCheckpoint !== hasCandidate) invalid(rowLabel, 'active checkpoint and candidate identities must both be absent or both present');
    if (hasCheckpoint) {
      assertHash(row.activeCheckpointIdentity, `${rowLabel}.activeCheckpointIdentity`);
      assertHash(row.activeCandidateIdentity, `${rowLabel}.activeCandidateIdentity`);
    }
    if (row.state === 'closing' && hasCheckpoint) invalid(rowLabel, 'a closing sequence forbids active checkpoint and candidate identities');
    if (row.state === 'unsettled' && !hasCheckpoint) invalid(rowLabel, 'an unsettled sequence requires active checkpoint and candidate identities');
    const recomputed = deriveSequenceIdentity({
      target: row.target,
      taskKey: /** @type {string} */ (row.taskKey),
      ownerBindingHash: /** @type {string} */ (row.ownerBindingHash),
      planDescriptor: row.planDescriptor,
      registryHash: /** @type {string} */ (row.registryHash),
      contractHash: /** @type {string} */ (row.contractHash),
      bindingIdentity: /** @type {string} */ (row.bindingIdentity),
      baselineCandidateIdentity: /** @type {string} */ (row.baselineCandidateIdentity),
    });
    if (recomputed !== row.sequenceIdentity) invalid(`${rowLabel}.sequenceIdentity`, 'must equal the recomputed sequence identity');
    if (previousSequenceIdentity !== null && compareUtf8(previousSequenceIdentity, /** @type {string} */ (row.sequenceIdentity)) >= 0) {
      invalid(label, 'must be sorted and unique by sequenceIdentity');
    }
    previousSequenceIdentity = /** @type {string} */ (row.sequenceIdentity);
  });
  if (totalComparisons > MAX_TOTAL_COMPARISON_REFS) invalid(label, `must retain at most ${MAX_TOTAL_COMPARISON_REFS} comparison references in total`);
  return value;
}

/** Validate the RunState `learningReviewRefs` shape. @param {unknown} value @param {string} [label] */
export function validateLearningReviewRefs(value, label = 'RunState.learningReviewRefs') {
  const rows = assertDenseDataArray(value, label);
  if (rows.length > MAX_LEARNING_REVIEW_REFS) invalid(label, `must contain at most ${MAX_LEARNING_REVIEW_REFS} rows`);
  /** @type {string|null} */
  let previous = null;
  rows.forEach((rowValue, index) => {
    const rowLabel = `${label}[${index}]`;
    const row = assertExactRecord(
      rowValue,
      ['reviewIdentity', 'target', 'eventHash', 'currentRunProjectionIdentity', 'laneProjectionIdentity'],
      [],
      rowLabel,
    );
    assertHash(row.reviewIdentity, `${rowLabel}.reviewIdentity`);
    assertCanonicalTargetIdentity(row.target, `${rowLabel}.target`);
    assertHash(row.eventHash, `${rowLabel}.eventHash`);
    assertHash(row.currentRunProjectionIdentity, `${rowLabel}.currentRunProjectionIdentity`);
    assertHash(row.laneProjectionIdentity, `${rowLabel}.laneProjectionIdentity`);
    if (previous !== null && compareUtf8(previous, /** @type {string} */ (row.reviewIdentity)) >= 0) {
      invalid(label, 'must be sorted and unique by reviewIdentity');
    }
    previous = /** @type {string} */ (row.reviewIdentity);
  });
  return value;
}

/**
 * Create an open EvaluationSequence row for a freshly selected objective. The
 * bootstrap baseline is an independent `stateIdentity` over the initial
 * evaluated state; baseline and incumbent both start at that bootstrap value.
 * @param {unknown} target
 * @param {unknown} definitionPlanBody normalized `definition-plan` body with a selected entry
 * @param {unknown} contract frozen EvaluationContract for the selected entry
 * @param {unknown} candidateWriteSet
 * @param {unknown} initialStateDescriptors ordered descriptors of the initial evaluated state
 */
export function createEvaluationSequence(target, definitionPlanBody, contract, candidateWriteSet, initialStateDescriptors) {
  const canonical = canonicalTarget(target);
  const body = assertExactRecord(
    definitionPlanBody,
    ['path', 'planDescriptor', 'ownerBindingHash', 'registryHash'],
    ['selectedEntry', 'contractHash'],
    'definitionPlanBody',
  );
  if (!Object.hasOwn(body, 'selectedEntry') || !Object.hasOwn(body, 'contractHash')) {
    invalid('definitionPlanBody', 'must include a selected entry and contract hash to open a sequence');
  }
  validatePlanDescriptor(body.planDescriptor, 'definitionPlanBody.planDescriptor');
  assertHash(body.ownerBindingHash, 'definitionPlanBody.ownerBindingHash');
  assertHash(body.registryHash, 'definitionPlanBody.registryHash');
  const selectedEntry = assertExactRecord(body.selectedEntry, ['taskKey', 'provenance', 'contract'], [], 'definitionPlanBody.selectedEntry');
  validateEvaluationContract(contract);
  const contractHash = sha256(canonicalJson(contract));
  if (sha256(canonicalJson(selectedEntry.contract)) !== contractHash) invalid('definitionPlanBody.selectedEntry.contract', 'must match the frozen contract');
  if (body.contractHash !== contractHash) invalid('definitionPlanBody.contractHash', 'must match the frozen contract');
  const taskKey = selectedEntry.taskKey;
  if (typeof taskKey !== 'string' || !TASK_KEY_PATTERN.test(taskKey)) invalid('definitionPlanBody.selectedEntry.taskKey', 'must be a durable task key');
  const wsId = writeSetIdentity(candidateWriteSet);
  validateFileStateDescriptors(initialStateDescriptors, candidateWriteSet, 'initialStateDescriptors');
  const bootstrapStateIdentity = stateIdentity(wsId, initialStateDescriptors);
  const bindingIdentity = deriveBindingIdentity({
    ownerBindingHash: /** @type {string} */ (body.ownerBindingHash),
    planDescriptor: body.planDescriptor,
    registryHash: /** @type {string} */ (body.registryHash),
    contract,
  });
  const sequenceIdentity = deriveSequenceIdentity({
    target: canonical,
    taskKey,
    ownerBindingHash: /** @type {string} */ (body.ownerBindingHash),
    planDescriptor: body.planDescriptor,
    registryHash: /** @type {string} */ (body.registryHash),
    contractHash,
    bindingIdentity,
    baselineCandidateIdentity: bootstrapStateIdentity,
  });
  const row = {
    sequenceIdentity,
    target: canonical,
    taskKey,
    ownerBindingHash: body.ownerBindingHash,
    planDescriptor: body.planDescriptor,
    registryHash: body.registryHash,
    contractHash,
    bindingIdentity,
    baselineCandidateIdentity: bootstrapStateIdentity,
    incumbentCandidateIdentity: bootstrapStateIdentity,
    state: 'open',
    recentComparisons: [],
  };
  validateEvaluationSequences([row], 'EvaluationSequence');
  return row;
}

/** Validate the injected checkpoint host interface. @param {unknown} value @param {string} [label] */
export function validateCheckpointHost(value, label = 'checkpointHost') {
  const host = assertRecord(value, label);
  for (const method of ['preflight', 'open', 'probe', 'get', 'setPhase', 'markPoststate', 'restore', 'release']) {
    if (typeof host[method] !== 'function') invalid(`${label}.${method}`, 'must be a function');
  }
  return value;
}

/** Validate one schema-visible CheckpointRecord. @param {unknown} value @param {string} [label] */
export function validateCheckpointRecord(value, label = 'CheckpointRecord') {
  const phase = assertRecord(value, label).phase;
  const withValue = CHECKPOINT_VALUE_PHASES.includes(/** @type {string} */ (phase));
  const fields = withValue
    ? ['checkpointIdentity', 'target', 'sequenceIdentity', 'contractHash', 'writeSetIdentity', 'prestateIdentity', 'phase', 'poststateIdentity', 'candidateIdentity']
    : ['checkpointIdentity', 'target', 'sequenceIdentity', 'contractHash', 'writeSetIdentity', 'prestateIdentity', 'phase'];
  const record = assertExactRecord(value, fields, [], label);
  assertHash(record.checkpointIdentity, `${label}.checkpointIdentity`);
  assertCanonicalTargetIdentity(record.target, `${label}.target`);
  assertHash(record.sequenceIdentity, `${label}.sequenceIdentity`);
  assertHash(record.contractHash, `${label}.contractHash`);
  assertHash(record.writeSetIdentity, `${label}.writeSetIdentity`);
  assertHash(record.prestateIdentity, `${label}.prestateIdentity`);
  assertEnum(record.phase, CHECKPOINT_PHASES, `${label}.phase`);
  if (withValue) {
    assertHash(record.poststateIdentity, `${label}.poststateIdentity`);
    assertHash(record.candidateIdentity, `${label}.candidateIdentity`);
  }
  return value;
}

/** @param {Record<string, unknown>} record @param {string} phase */
function checkpointRecordWithPhase(record, phase) {
  const base = {
    checkpointIdentity: record.checkpointIdentity,
    target: record.target,
    sequenceIdentity: record.sequenceIdentity,
    contractHash: record.contractHash,
    writeSetIdentity: record.writeSetIdentity,
    prestateIdentity: record.prestateIdentity,
    phase,
  };
  if (CHECKPOINT_VALUE_PHASES.includes(phase)) {
    return { ...base, poststateIdentity: record.poststateIdentity, candidateIdentity: record.candidateIdentity };
  }
  return base;
}

/**
 * Admit the checkpoint owner's private context view without reading a property
 * value until its complete closed descriptor set is known to be data-only.
 * @param {unknown} value @param {unknown} candidateWriteSet @param {string} label
 */
function checkpointContextSnapshot(value, candidateWriteSet, label) {
  if (utilTypes.isProxy(value)) invalid(label, 'must not be a Proxy');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(label, 'must be an object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(label, 'must be a plain object');
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(['phase', 'prestate', 'poststateIdentity', 'candidateIdentity']);
  /** @type {Map<string, PropertyDescriptor>} */
  const descriptors = new Map();
  for (const key of keys) {
    if (typeof key !== 'string') invalid(label, 'must not contain symbol fields');
    if (!allowed.has(key)) invalid(label, `contains unknown field '${key}'`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      invalid(label, `field '${key}' must be an enumerable data property`);
    }
    descriptors.set(key, descriptor);
  }
  for (const key of ['phase', 'prestate']) {
    if (!descriptors.has(key)) invalid(label, `is missing field '${key}'`);
  }
  const hasPoststateIdentity = descriptors.has('poststateIdentity');
  const hasCandidateIdentity = descriptors.has('candidateIdentity');
  if (hasPoststateIdentity !== hasCandidateIdentity) {
    invalid(label, 'poststate and candidate identities must both be absent or both present');
  }
  const phase = descriptors.get('phase')?.value;
  if (['candidate', 'restoring', 'kept', 'unsettled'].includes(/** @type {string} */ (phase))
    && !hasPoststateIdentity) {
    invalid(label, 'is missing poststate and candidate identities');
  }
  const prestateValue = descriptors.get('prestate')?.value;
  if (utilTypes.isProxy(prestateValue)) invalid(`${label}.prestate`, 'must not be a Proxy');
  const rows = assertDenseDataArray(prestateValue, `${label}.prestate`);
  rows.forEach((row, index) => {
    if (utilTypes.isProxy(row)) invalid(`${label}.prestate[${index}]`, 'must not be a Proxy');
  });
  validateFileStateDescriptors(prestateValue, candidateWriteSet, `${label}.prestate`);
  const prestate = rows.map((rowValue) => {
    const rowDescriptors = Object.getOwnPropertyDescriptors(rowValue);
    const state = rowDescriptors.state.value;
    return state === 'missing'
      ? { path: rowDescriptors.path.value, state }
      : {
          path: rowDescriptors.path.value,
          state,
          sha256: rowDescriptors.sha256.value,
          byteLength: rowDescriptors.byteLength.value,
        };
  });
  return {
    phase,
    prestate,
    ...(hasPoststateIdentity
      ? {
          poststateIdentity: descriptors.get('poststateIdentity')?.value,
          candidateIdentity: descriptors.get('candidateIdentity')?.value,
        }
      : {}),
  };
}

/**
 * Attempt to retain and then prove the exact checkpoint context as unsettled.
 * An observed absence is never recreated or reported as retention.
 * @param {Record<string, Function>} hostApi @param {Record<string, unknown>} record @param {unknown} candidateWriteSet
 */
function retainCheckpointUnsettled(hostApi, record, candidateWriteSet) {
  const id = /** @type {string} */ (record.checkpointIdentity);
  try {
    const before = hostApi.get(id);
    if (!before) return false;
    checkpointContextSnapshot(before, candidateWriteSet, 'checkpoint retention precheck');
  } catch {
    return false;
  }
  try {
    hostApi.setPhase(id, 'unsettled');
    const returnedContext = hostApi.get(id);
    if (!returnedContext) return false;
    const context = checkpointContextSnapshot(returnedContext, candidateWriteSet, 'unsettled checkpoint context');
    if (!context || context.phase !== 'unsettled') return false;
    if (stateIdentity(/** @type {string} */ (record.writeSetIdentity), context.prestate) !== record.prestateIdentity) return false;
    assertHash(context.poststateIdentity, 'unsettled checkpoint poststateIdentity');
    assertHash(context.candidateIdentity, 'unsettled checkpoint candidateIdentity');
    if (deriveCandidateIdentity(id, /** @type {string} */ (context.poststateIdentity)) !== context.candidateIdentity) return false;
    if (Object.hasOwn(record, 'poststateIdentity')
      && (record.poststateIdentity !== context.poststateIdentity || record.candidateIdentity !== context.candidateIdentity)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire a checkpoint: preflight (refusing unsupported effects before any
 * capture or mutation), capture the prestate, and derive the captured record.
 * @param {unknown} host
 * @param {{target:unknown,sequenceIdentity:string,contractHash:string,candidateWriteSet:unknown}} args
 */
export function acquireCheckpoint(host, { target, sequenceIdentity, contractHash, candidateWriteSet }) {
  validateCheckpointHost(host);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const canonical = canonicalTarget(target);
  assertHash(sequenceIdentity, 'sequenceIdentity');
  assertHash(contractHash, 'contractHash');
  validateCandidateWriteSet(candidateWriteSet);
  const wsId = writeSetIdentity(candidateWriteSet);
  hostApi.preflight(candidateWriteSet);
  const prestate = hostApi.open(candidateWriteSet);
  validateFileStateDescriptors(prestate, candidateWriteSet, 'prestate');
  const prestateIdentity = stateIdentity(wsId, prestate);
  const checkpointIdentity = deriveCheckpointIdentity({
    target: canonical, sequenceIdentity, contractHash, writeSetIdentity: wsId, prestateIdentity,
  });
  hostApi.setPhase(checkpointIdentity, 'captured');
  return {
    checkpointIdentity,
    target: canonical,
    sequenceIdentity,
    contractHash,
    writeSetIdentity: wsId,
    prestateIdentity,
    phase: 'captured',
  };
}

/**
 * Capture the candidate poststate for a captured checkpoint.
 * @param {unknown} host @param {unknown} recordValue captured CheckpointRecord @param {unknown} candidateWriteSet
 */
export function captureCandidate(host, recordValue, candidateWriteSet) {
  validateCheckpointHost(host);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const record = /** @type {Record<string, unknown>} */ (validateCheckpointRecord(recordValue));
  if (record.phase !== 'captured') invalid('checkpoint', 'candidate capture requires a captured checkpoint');
  const id = /** @type {string} */ (record.checkpointIdentity);
  const returnedContext = hostApi.get(id);
  if (!returnedContext) {
    invalid('checkpoint', 'host context must be present and captured');
  }
  const context = checkpointContextSnapshot(returnedContext, candidateWriteSet, 'candidate capture checkpoint context');
  if (context.phase !== 'captured') invalid('checkpoint', 'host context must be present and captured');
  const wsId = writeSetIdentity(candidateWriteSet);
  if (wsId !== record.writeSetIdentity) invalid('checkpoint', 'candidate write set must match the captured checkpoint');
  const poststate = hostApi.probe(id);
  validateFileStateDescriptors(poststate, candidateWriteSet, 'poststate');
  const poststateIdentity = stateIdentity(wsId, poststate);
  const candidateIdentity = deriveCandidateIdentity(id, poststateIdentity);
  hostApi.markPoststate(id, poststateIdentity, candidateIdentity);
  hostApi.setPhase(id, 'candidate');
  return { ...record, phase: 'candidate', poststateIdentity, candidateIdentity };
}

/**
 * Restore the exact prestate for a checkpoint. Returns a `restored` record on
 * proven restoration. A restore fault, probe fault, or post-restore mismatch
 * retains the host entry as `unsettled`: a candidate-context fault returns the
 * `unsettled` record, while a captured-context fault hard stops (mirroring the
 * release-fault branch). Never releases.
 * @param {unknown} host @param {unknown} recordValue @param {unknown} candidateWriteSet
 */
export function restoreCheckpoint(host, recordValue, candidateWriteSet) {
  validateCheckpointHost(host);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const record = /** @type {Record<string, unknown>} */ (validateCheckpointRecord(recordValue));
  const id = /** @type {string} */ (record.checkpointIdentity);
  validateCandidateWriteSet(candidateWriteSet);
  /**
   * A restore/probe/proof fault retains the entry as unsettled. A captured
   * context hard stops; a candidate context returns the unsettled record.
   * @returns {Record<string, unknown>}
   */
  const restoreFault = () => {
    hostApi.setPhase(id, 'unsettled');
    if (record.phase === 'captured') {
      invalid('checkpoint', 'a captured context restoration could not be proven and was retained as unsettled');
    }
    return checkpointRecordWithPhase(record, 'unsettled');
  };
  try {
    hostApi.setPhase(id, 'restoring');
    hostApi.restore(id);
    const fresh = hostApi.probe(id);
    validateFileStateDescriptors(fresh, candidateWriteSet, 'restoration');
    if (stateIdentity(/** @type {string} */ (record.writeSetIdentity), fresh) !== record.prestateIdentity) {
      return restoreFault();
    }
    hostApi.setPhase(id, 'restored');
  } catch {
    return restoreFault();
  }
  return checkpointRecordWithPhase(record, 'restored');
}

/**
 * Keep a candidate: re-probe and confirm the poststate still equals the
 * evaluated candidate. Returns a `kept` record, or `unsettled` on mismatch or
 * a probe fault.
 * @param {unknown} host @param {unknown} recordValue @param {unknown} candidateWriteSet
 */
export function keepCheckpoint(host, recordValue, candidateWriteSet) {
  validateCheckpointHost(host);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const record = /** @type {Record<string, unknown>} */ (validateCheckpointRecord(recordValue));
  if (record.phase !== 'candidate') invalid('checkpoint', 'keep requires a candidate checkpoint');
  const id = /** @type {string} */ (record.checkpointIdentity);
  validateCandidateWriteSet(candidateWriteSet);
  let fresh;
  try {
    fresh = hostApi.probe(id);
  } catch {
    hostApi.setPhase(id, 'unsettled');
    return checkpointRecordWithPhase(record, 'unsettled');
  }
  validateFileStateDescriptors(fresh, candidateWriteSet, 'keep');
  if (stateIdentity(/** @type {string} */ (record.writeSetIdentity), fresh) !== record.poststateIdentity) {
    hostApi.setPhase(id, 'unsettled');
    return checkpointRecordWithPhase(record, 'unsettled');
  }
  hostApi.setPhase(id, 'kept');
  return checkpointRecordWithPhase(record, 'kept');
}

/**
 * Release a checkpoint context, gated on its host phase. Kept and restored
 * contexts prove their expected state; an unchanged captured context proves the
 * prestate. A changed captured, candidate, restoring, or unsettled context is
 * never released. A release fault retains and proves the entry as unsettled
 * when possible; unavailable or unprovable context reports contract mismatch.
 * @param {unknown} host @param {unknown} recordValue @param {unknown} candidateWriteSet
 */
export function releaseCheckpoint(host, recordValue, candidateWriteSet) {
  validateCheckpointHost(host);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const record = /** @type {Record<string, unknown>} */ (validateCheckpointRecord(recordValue));
  const id = /** @type {string} */ (record.checkpointIdentity);
  validateCandidateWriteSet(candidateWriteSet);
  /** @param {string} reason */
  const releaseFault = (reason) => {
    if (retainCheckpointUnsettled(hostApi, record, candidateWriteSet)) {
      invalid('checkpoint', `${reason} and was retained as unsettled`);
    }
    invalid('checkpoint', `${reason}; contract-mismatch: the exact context is unavailable or could not be proven retained`);
  };
  let returnedContext;
  try {
    returnedContext = hostApi.get(id);
  } catch {
    return releaseFault('release proof acquisition failed');
  }
  if (!returnedContext) return releaseFault('release requires a present host context');
  let context;
  try {
    context = checkpointContextSnapshot(returnedContext, candidateWriteSet, 'release checkpoint context');
  } catch {
    return releaseFault('release phase acquisition failed');
  }
  const phase = /** @type {string} */ (context.phase);
  if (phase === 'candidate' || phase === 'restoring' || phase === 'unsettled') {
    return releaseFault('pending or unsettled context is never released');
  }
  const wsId = /** @type {string} */ (record.writeSetIdentity);
  let freshIdentity;
  try {
    const fresh = hostApi.probe(id);
    validateFileStateDescriptors(fresh, candidateWriteSet, 'release');
    freshIdentity = stateIdentity(wsId, fresh);
  } catch {
    return releaseFault('release proof failed');
  }
  if (phase === 'kept') {
    if (freshIdentity !== record.poststateIdentity) {
      return releaseFault('a kept context must still equal the evaluated candidate before release');
    }
  } else if (phase === 'restored') {
    if (freshIdentity !== record.prestateIdentity) {
      return releaseFault('a restored context must equal the exact prestate before release');
    }
  } else if (phase === 'captured') {
    if (freshIdentity !== record.prestateIdentity) {
      return releaseFault('a changed captured context must be restored before release');
    }
  } else {
    return releaseFault('release requires a captured, kept, or restored context');
  }
  try {
    hostApi.release(id);
  } catch {
    return releaseFault('context release failed');
  }
  return checkpointRecordWithPhase(record, /** @type {string} */ (phase));
}

/** Parse a CanonicalDecimal into its sign and digit parts. @param {string} text */
function decimalParts(text) {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [intPart, fracPart = ''] = body.split('.');
  return { negative, intPart, fracPart };
}

/** Fractional-digit count of a CanonicalDecimal. @param {string} text */
function decimalScale(text) {
  return decimalParts(text).fracPart.length;
}

/** Convert a CanonicalDecimal to a signed scaled BigInt at the given scale. @param {string} text @param {number} scale */
function decimalToScaled(text, scale) {
  const { negative, intPart, fracPart } = decimalParts(text);
  const scaled = BigInt(intPart + fracPart.padEnd(scale, '0'));
  return negative ? -scaled : scaled;
}

/** Median scaled BigInt of an odd-length decimal sample list. @param {string[]} samples @param {number} scale */
function medianScaled(samples, scale) {
  const scaled = samples.map((sample) => decimalToScaled(sample, scale))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return scaled[(scaled.length - 1) / 2];
}

/** @param {unknown} value @param {Record<string, unknown>} contract @param {string} label */
function validateObservationValue(value, contract, label) {
  const comparator = /** @type {Record<string, unknown>} */ (contract.comparator);
  if (comparator.mode === 'numeric') {
    const numeric = assertExactRecord(value, ['mode', 'samples'], [], label);
    if (numeric.mode !== 'numeric') invalid(`${label}.mode`, 'must be numeric');
    const samples = assertDenseDataArray(numeric.samples, `${label}.samples`);
    if (samples.length !== comparator.sampleCount) invalid(`${label}.samples`, 'must contain exactly the frozen sample count');
    samples.forEach((sample, index) => assertCanonicalDecimal(sample, `${label}.samples[${index}]`, false));
  } else if (comparator.mode === 'ordinal-levels') {
    const ordinal = assertExactRecord(value, ['mode', 'level'], [], label);
    if (ordinal.mode !== 'ordinal-level') invalid(`${label}.mode`, 'must be ordinal-level');
    assertRegistryIdentifier(ordinal.level, `${label}.level`);
    if (!/** @type {string[]} */ (comparator.levels).includes(/** @type {string} */ (ordinal.level))) {
      invalid(`${label}.level`, 'must be one of the frozen levels');
    }
  } else {
    const artifact = assertExactRecord(value, ['mode', 'artifactHash'], [], label);
    if (artifact.mode !== 'artifact') invalid(`${label}.mode`, 'must be artifact');
    assertHash(artifact.artifactHash, `${label}.artifactHash`);
  }
  return value;
}

/**
 * Validate one closed ObjectiveObservation against its frozen contract.
 * @param {unknown} value @param {unknown} contractValue @param {string} [label]
 */
export function validateObjectiveObservation(value, contractValue, label = 'ObjectiveObservation') {
  validateEvaluationContract(contractValue);
  const contract = /** @type {Record<string, unknown>} */ (contractValue);
  const hasValue = Object.hasOwn(assertRecord(value, label), 'value');
  const observation = assertExactRecord(
    value,
    [
      'role', 'target', 'candidateIdentity', 'contractHash', 'kind', 'status', 'evaluatorIdentity',
      'inputIdentity', 'environmentIdentity', 'conditionIdentity', 'rubricHash', 'budgetIdentity',
    ],
    ['value'],
    label,
  );
  assertEnum(observation.role, OBSERVATION_ROLES, `${label}.role`);
  assertCanonicalTargetIdentity(observation.target, `${label}.target`);
  assertHash(observation.candidateIdentity, `${label}.candidateIdentity`);
  assertHash(observation.contractHash, `${label}.contractHash`);
  assertEnum(observation.kind, ['numeric', 'ordinal', 'subjective'], `${label}.kind`);
  if (observation.kind !== contract.kind) invalid(`${label}.kind`, 'must match the contract kind');
  assertEnum(observation.status, OBSERVATION_STATUSES, `${label}.status`);
  assertHash(observation.evaluatorIdentity, `${label}.evaluatorIdentity`);
  assertHash(observation.inputIdentity, `${label}.inputIdentity`);
  assertHash(observation.environmentIdentity, `${label}.environmentIdentity`);
  assertHash(observation.conditionIdentity, `${label}.conditionIdentity`);
  assertHash(observation.rubricHash, `${label}.rubricHash`);
  assertHash(observation.budgetIdentity, `${label}.budgetIdentity`);
  if (observation.status === 'ok') {
    if (!hasValue) invalid(`${label}.value`, 'is required when status is ok');
    validateObservationValue(observation.value, contract, `${label}.value`);
  } else if (hasValue) {
    invalid(`${label}.value`, 'is forbidden unless status is ok');
  }
  return value;
}

/**
 * Validate one closed EvaluatorJudgment against its frozen contract.
 * @param {unknown} value @param {unknown} contractValue @param {string} [label]
 */
export function validateEvaluatorJudgment(value, contractValue, label = 'EvaluatorJudgment') {
  validateEvaluationContract(contractValue);
  const contract = /** @type {Record<string, unknown>} */ (contractValue);
  const judgment = assertExactRecord(
    value,
    ['evaluator', 'target', 'contractHash', 'baselineObservationIdentity', 'incumbentObservationIdentity', 'candidateObservationIdentity', 'relation'],
    [],
    label,
  );
  const evaluator = assertExactRecord(judgment.evaluator, ['id', 'version'], [], `${label}.evaluator`);
  assertRegistryIdentifier(evaluator.id, `${label}.evaluator.id`);
  assertRegistryIdentifier(evaluator.version, `${label}.evaluator.version`);
  const declared = /** @type {Record<string, unknown>[]} */ (contract.evaluators)
    .some((row) => row.id === evaluator.id && row.version === evaluator.version);
  if (!declared) invalid(`${label}.evaluator`, 'must be a frozen contract evaluator');
  assertCanonicalTargetIdentity(judgment.target, `${label}.target`);
  assertHash(judgment.contractHash, `${label}.contractHash`);
  assertHash(judgment.baselineObservationIdentity, `${label}.baselineObservationIdentity`);
  assertHash(judgment.incumbentObservationIdentity, `${label}.incumbentObservationIdentity`);
  assertHash(judgment.candidateObservationIdentity, `${label}.candidateObservationIdentity`);
  assertEnum(judgment.relation, JUDGMENT_RELATIONS, `${label}.relation`);
  return value;
}

/** @param {string[]} incumbentSamples @param {string[]} candidateSamples @param {Record<string, unknown>} comparator */
function numericRelation(incumbentSamples, candidateSamples, comparator) {
  const tolerance = /** @type {string} */ (comparator.tolerance);
  const threshold = /** @type {string} */ (comparator.meaningfulThreshold);
  const scale = Math.max(
    ...incumbentSamples.map(decimalScale),
    ...candidateSamples.map(decimalScale),
    decimalScale(tolerance),
    decimalScale(threshold),
  );
  const raw = medianScaled(candidateSamples, scale) - medianScaled(incumbentSamples, scale);
  const delta = comparator.direction === 'maximize' ? raw : -raw;
  const toleranceScaled = decimalToScaled(tolerance, scale);
  const thresholdScaled = decimalToScaled(threshold, scale);
  const magnitude = delta < 0n ? -delta : delta;
  if (magnitude <= toleranceScaled) return 'equivalent';
  if (delta >= thresholdScaled) return 'better';
  if (delta <= -thresholdScaled) return 'worse';
  return 'incomparable';
}

/** @param {string} incumbentLevel @param {string} candidateLevel @param {Record<string, unknown>} comparator */
function ordinalLevelRelation(incumbentLevel, candidateLevel, comparator) {
  const levels = /** @type {string[]} */ (comparator.levels);
  const move = levels.indexOf(candidateLevel) - levels.indexOf(incumbentLevel);
  const steps = /** @type {number} */ (comparator.meaningfulSteps);
  if (move === 0) return 'equivalent';
  if (move >= steps) return 'better';
  if (move <= -steps) return 'worse';
  return 'incomparable';
}

/**
 * Derive the closed ComparisonDecision from three role-ordered observations,
 * the frozen contract, any required judgments, and the active/fresh binding
 * identities. Every field is validated; the relation and reason are derived.
 * @param {{observations:unknown,contract:unknown,judgments?:unknown,sequenceIdentity:string,checkpointIdentity:string,activeBindingIdentity:string,freshBindingIdentity:string}} args
 */
export function deriveComparisonDecision({ observations, contract, judgments = [], sequenceIdentity, checkpointIdentity, activeBindingIdentity, freshBindingIdentity }) {
  validateEvaluationContract(contract);
  const contractRecord = /** @type {Record<string, unknown>} */ (contract);
  const contractHash = sha256(canonicalJson(contract));
  assertHash(sequenceIdentity, 'sequenceIdentity');
  assertHash(checkpointIdentity, 'checkpointIdentity');
  assertHash(activeBindingIdentity, 'activeBindingIdentity');
  assertHash(freshBindingIdentity, 'freshBindingIdentity');
  const rows = /** @type {Record<string, unknown>[]} */ (assertDenseDataArray(observations, 'observations'));
  if (rows.length !== 3) invalid('observations', 'must contain exactly three role-ordered observations');
  rows.forEach((observation, index) => {
    validateObjectiveObservation(observation, contract, `observations[${index}]`);
    if (observation.role !== OBSERVATION_ROLES[index]) invalid(`observations[${index}].role`, `must be ${OBSERVATION_ROLES[index]}`);
  });
  const [baseline, incumbent, candidate] = rows;
  const observationIdentities = {
    baseline: sha256(canonicalJson(baseline)),
    incumbent: sha256(canonicalJson(incumbent)),
    candidate: sha256(canonicalJson(candidate)),
  };
  /** @param {string} relation @param {string} reason @param {string[]} judgmentIdentities */
  const buildDecision = (relation, reason, judgmentIdentities) => {
    const withoutIdentity = {
      target: canonicalTarget(baseline.target),
      sequenceIdentity,
      checkpointIdentity,
      contractHash,
      baselineObservationIdentity: observationIdentities.baseline,
      incumbentObservationIdentity: observationIdentities.incumbent,
      candidateObservationIdentity: observationIdentities.candidate,
      judgmentIdentities,
      relation,
      reason,
    };
    return { comparisonIdentity: sha256(canonicalJson(withoutIdentity)), ...withoutIdentity };
  };
  if (rows.some((observation) => observation.status !== 'ok')) {
    return buildDecision('incomparable', 'observation-not-ok', []);
  }
  const sharedFields = ['evaluatorIdentity', 'inputIdentity', 'environmentIdentity', 'conditionIdentity', 'rubricHash', 'budgetIdentity', 'kind', 'target'];
  const bindingConsistent = freshBindingIdentity === activeBindingIdentity
    && [baseline, incumbent, candidate].every((observation) => observation.contractHash === contractHash)
    && sharedFields.every((field) => (
      canonicalJson(incumbent[field]) === canonicalJson(baseline[field])
      && canonicalJson(candidate[field]) === canonicalJson(baseline[field])
    ));
  if (!bindingConsistent) return buildDecision('incomparable', 'binding-drift', []);
  const comparator = /** @type {Record<string, unknown>} */ (contractRecord.comparator);
  if (comparator.mode === 'numeric') {
    const relation = numericRelation(
      /** @type {string[]} */ (/** @type {Record<string, unknown>} */ (incumbent.value).samples),
      /** @type {string[]} */ (/** @type {Record<string, unknown>} */ (candidate.value).samples),
      comparator,
    );
    return buildDecision(relation, 'numeric-threshold', []);
  }
  if (comparator.mode === 'ordinal-levels') {
    const relation = ordinalLevelRelation(
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (incumbent.value).level),
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (candidate.value).level),
      comparator,
    );
    return buildDecision(relation, 'ordinal-levels', []);
  }
  const judgmentRows = /** @type {Record<string, unknown>[]} */ (assertDenseDataArray(judgments, 'judgments'));
  if (judgmentRows.length !== 2) invalid('judgments', 'pairwise and subjective comparisons require exactly two judgments');
  /** @type {string|null} */
  let previousEvaluator = null;
  const relations = judgmentRows.map((judgment, index) => {
    validateEvaluatorJudgment(judgment, contract, `judgments[${index}]`);
    const evaluatorIdentity = sha256(canonicalJson(judgment.evaluator));
    if (previousEvaluator !== null && compareUtf8(previousEvaluator, evaluatorIdentity) >= 0) {
      invalid('judgments', 'must be sorted by evaluator identity and one per frozen evaluator');
    }
    previousEvaluator = evaluatorIdentity;
    return /** @type {string} */ (judgment.relation);
  });
  const judgmentIdentities = judgmentRows.map((judgment) => sha256(canonicalJson(judgment)));
  if (relations[0] === relations[1] && relations[0] !== 'incomparable') {
    return buildDecision(relations[0], 'unanimous-rubric', judgmentIdentities);
  }
  return buildDecision('incomparable', 'evaluator-disagreement', judgmentIdentities);
}

/** @param {string} gate @param {string[]} recordIdentities */
function gateEvidenceIdentity(gate, recordIdentities) {
  const sorted = [...new Set(recordIdentities)].sort(compareUtf8);
  return sha256(canonicalJson({ gate, recordIdentities: sorted }));
}

/**
 * The subset of ordered file-state descriptors whose paths are protected.
 * Descriptors already carry no bytes, so the subset is a bytes-free comparison
 * unit for detecting any protected-path change.
 * @param {unknown} descriptors @param {Set<string>} protectedPaths
 */
function protectedSubset(descriptors, protectedPaths) {
  return /** @type {Record<string, unknown>[]} */ (descriptors)
    .filter((entry) => protectedPaths.has(/** @type {string} */ (entry.path)));
}

/**
 * Derive the authorization gate result. The authoritative outcome is wrapped
 * from the existing authorize path (`authorization.authorized`), never accepted
 * as a caller field; the source record carries no gate name, status, or result.
 * @param {{record:unknown,authorization:unknown}} source
 */
export function normalizeAuthorizationGate({ record, authorization }) {
  const fields = assertExactRecord(
    record,
    ['kind', 'target', 'policyMode', 'evidenceHash', 'ownerBindingHash', 'planDescriptor', 'registryHash', 'contractHash', 'authorityIdentity'],
    [],
    'authorization record',
  );
  if (fields.kind !== 'authorization') invalid('authorization record.kind', 'must be authorization');
  assertCanonicalTargetIdentity(fields.target, 'authorization record.target');
  if (fields.policyMode !== 'autonomous') invalid('authorization record.policyMode', 'must be autonomous');
  assertHash(fields.evidenceHash, 'authorization record.evidenceHash');
  assertHash(fields.ownerBindingHash, 'authorization record.ownerBindingHash');
  validatePlanDescriptor(fields.planDescriptor, 'authorization record.planDescriptor');
  assertHash(fields.registryHash, 'authorization record.registryHash');
  assertHash(fields.contractHash, 'authorization record.contractHash');
  assertHash(fields.authorityIdentity, 'authorization record.authorityIdentity');
  const result = assertRecord(authorization, 'authorization result');
  if (typeof result.authorized !== 'boolean') invalid('authorization result.authorized', 'must be a boolean');
  const outcome = result.authorized === true ? 'authorized' : 'refused';
  const closed = {
    kind: 'authorization',
    target: fields.target,
    policyMode: 'autonomous',
    evidenceHash: fields.evidenceHash,
    ownerBindingHash: fields.ownerBindingHash,
    planDescriptor: fields.planDescriptor,
    registryHash: fields.registryHash,
    contractHash: fields.contractHash,
    authorityIdentity: fields.authorityIdentity,
    outcome,
  };
  const recordIdentity = sha256(canonicalJson(closed));
  return {
    name: 'authorization',
    evidenceIdentity: gateEvidenceIdentity('authorization', [recordIdentity]),
    result: outcome === 'authorized' ? 'pass' : 'fail',
  };
}

/**
 * Derive the checkpoint gate result. The outcome (`ready`/`invalid`/`unsettled`)
 * is derived from the host phase and a fresh probe, never from a caller field.
 * @param {{record:unknown,host:unknown,candidateWriteSet:unknown}} source
 */
export function normalizeCheckpointGate({ record, host, candidateWriteSet }) {
  const fields = assertExactRecord(
    record,
    ['kind', 'target', 'checkpointIdentity', 'candidateIdentity', 'writeSetIdentity', 'prestateIdentity', 'poststateIdentity'],
    [],
    'checkpoint record',
  );
  if (fields.kind !== 'checkpoint') invalid('checkpoint record.kind', 'must be checkpoint');
  assertCanonicalTargetIdentity(fields.target, 'checkpoint record.target');
  assertHash(fields.checkpointIdentity, 'checkpoint record.checkpointIdentity');
  assertHash(fields.candidateIdentity, 'checkpoint record.candidateIdentity');
  assertHash(fields.writeSetIdentity, 'checkpoint record.writeSetIdentity');
  assertHash(fields.prestateIdentity, 'checkpoint record.prestateIdentity');
  assertHash(fields.poststateIdentity, 'checkpoint record.poststateIdentity');
  validateCheckpointHost(host);
  validateCandidateWriteSet(candidateWriteSet);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const id = /** @type {string} */ (fields.checkpointIdentity);
  const returnedContext = hostApi.get(id);
  let outcome = 'invalid';
  if (returnedContext) {
    const context = checkpointContextSnapshot(returnedContext, candidateWriteSet, 'checkpoint gate context');
    const phase = /** @type {string} */ (context.phase);
    if (phase === 'unsettled') {
      outcome = 'unsettled';
    } else if (phase === 'candidate' || phase === 'kept') {
      const fresh = hostApi.probe(id);
      validateFileStateDescriptors(fresh, candidateWriteSet, 'checkpoint gate probe');
      const poststateIdentity = stateIdentity(/** @type {string} */ (fields.writeSetIdentity), fresh);
      const prestate = context.prestate;
      const protectedPaths = new Set(
        /** @type {string[]} */ (/** @type {Record<string, unknown>} */ (candidateWriteSet).protectedPaths),
      );
      const protectedUnchanged = canonicalJson(protectedSubset(fresh, protectedPaths))
        === canonicalJson(protectedSubset(prestate, protectedPaths));
      if (poststateIdentity === fields.poststateIdentity
        && context.candidateIdentity === fields.candidateIdentity
        && protectedUnchanged) {
        outcome = 'ready';
      }
    }
  }
  const closed = {
    kind: 'checkpoint',
    target: fields.target,
    checkpointIdentity: fields.checkpointIdentity,
    candidateIdentity: fields.candidateIdentity,
    writeSetIdentity: fields.writeSetIdentity,
    prestateIdentity: fields.prestateIdentity,
    poststateIdentity: fields.poststateIdentity,
    outcome,
  };
  const recordIdentity = sha256(canonicalJson(closed));
  const result = outcome === 'ready' ? 'pass' : outcome === 'unsettled' ? 'fail' : 'incomplete';
  return { name: 'checkpoint', evidenceIdentity: gateEvidenceIdentity('checkpoint', [recordIdentity]), result };
}

/**
 * Derive the hard-constraints gate result. The runtime ALWAYS synthesizes the
 * expected set: one mandatory candidate-bound completion verification plus one
 * record per declared registry constraint. A registry can neither suppress the
 * mandatory record nor reuse its reserved id.
 * @param {{records:unknown,contract:unknown,target:unknown,checkpointIdentity:string,candidateIdentity:string,contractHash:string}} source
 */
export function normalizeHardConstraintsGate({ records, contract, target, checkpointIdentity, candidateIdentity, contractHash }) {
  validateEvaluationContract(contract);
  const canonical = canonicalTarget(target);
  assertHash(checkpointIdentity, 'checkpointIdentity');
  assertHash(candidateIdentity, 'candidateIdentity');
  assertHash(contractHash, 'contractHash');
  if (sha256(canonicalJson(contract)) !== contractHash) invalid('contractHash', 'must match the frozen contract');
  /** @type {{constraintKind:string,checkId:string,target:string}[]} */
  const expected = [{ constraintKind: 'verification', checkId: RESERVED_COMPLETION_CHECK_ID, target: targetKey(canonical) }];
  for (const constraint of /** @type {Record<string, unknown>[]} */ (/** @type {Record<string, unknown>} */ (contract).hardConstraints)) {
    expected.push({
      constraintKind: /** @type {string} */ (constraint.kind),
      checkId: /** @type {string} */ (constraint.id),
      target: /** @type {string} */ (constraint.target),
    });
  }
  const rows = assertDenseDataArray(records, 'hard-constraint records');
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();
  /** @type {string[]} */
  const recordIdentities = [];
  let duplicate = false;
  let boundMismatch = false;
  rows.forEach((rowValue, index) => {
    const rowLabel = `hard-constraint records[${index}]`;
    const row = assertExactRecord(
      rowValue,
      ['kind', 'constraintKind', 'checkId', 'target', 'checkpointIdentity', 'candidateIdentity', 'contractHash', 'evidenceHash', 'outcome'],
      [],
      rowLabel,
    );
    if (row.kind !== 'hard-constraint') invalid(`${rowLabel}.kind`, 'must be hard-constraint');
    assertEnum(row.constraintKind, ['verification', 'lint'], `${rowLabel}.constraintKind`);
    assertRegistryIdentifier(row.checkId, `${rowLabel}.checkId`);
    assertConstraintTarget(row.target, `${rowLabel}.target`);
    assertHash(row.checkpointIdentity, `${rowLabel}.checkpointIdentity`);
    assertHash(row.candidateIdentity, `${rowLabel}.candidateIdentity`);
    assertHash(row.contractHash, `${rowLabel}.contractHash`);
    assertHash(row.evidenceHash, `${rowLabel}.evidenceHash`);
    assertEnum(row.outcome, ['passed', 'failed', 'timeout', 'crash'], `${rowLabel}.outcome`);
    if (row.checkpointIdentity !== checkpointIdentity || row.candidateIdentity !== candidateIdentity || row.contractHash !== contractHash) {
      boundMismatch = true;
    }
    const key = canonicalJson([row.constraintKind, row.checkId, row.target]);
    if (byKey.has(key)) duplicate = true;
    byKey.set(key, row);
    recordIdentities.push(sha256(canonicalJson(row)));
  });
  let present = true;
  let allPassed = true;
  for (const expectation of expected) {
    const match = byKey.get(canonicalJson([expectation.constraintKind, expectation.checkId, expectation.target]));
    if (!match) { present = false; continue; }
    if (match.outcome !== 'passed') allPassed = false;
  }
  const extra = byKey.size !== expected.length;
  const complete = present && !duplicate && !extra && !boundMismatch;
  const result = !complete ? 'incomplete' : allPassed ? 'pass' : 'fail';
  return { name: 'hard-constraints', evidenceIdentity: gateEvidenceIdentity('hard-constraints', recordIdentities), result };
}

/**
 * Derive the comparison gate result from a derived ComparisonDecision plus its
 * three observations and any required judgments. Pass means a valid decision
 * over ok observations with matching bindings; it does NOT imply a qualifying
 * relation.
 * @param {{decision:unknown,observations:unknown,contract:unknown,judgments?:unknown}} source
 */
export function normalizeComparisonGate({ decision, observations, contract, judgments = [] }) {
  validateEvaluationContract(contract);
  const decisionRecord = assertExactRecord(
    decision,
    ['comparisonIdentity', 'target', 'sequenceIdentity', 'checkpointIdentity', 'contractHash', 'baselineObservationIdentity', 'incumbentObservationIdentity', 'candidateObservationIdentity', 'judgmentIdentities', 'relation', 'reason'],
    [],
    'ComparisonDecision',
  );
  assertHash(decisionRecord.comparisonIdentity, 'ComparisonDecision.comparisonIdentity');
  assertCanonicalTargetIdentity(decisionRecord.target, 'ComparisonDecision.target');
  assertHash(decisionRecord.sequenceIdentity, 'ComparisonDecision.sequenceIdentity');
  assertHash(decisionRecord.checkpointIdentity, 'ComparisonDecision.checkpointIdentity');
  assertHash(decisionRecord.contractHash, 'ComparisonDecision.contractHash');
  assertHash(decisionRecord.baselineObservationIdentity, 'ComparisonDecision.baselineObservationIdentity');
  assertHash(decisionRecord.incumbentObservationIdentity, 'ComparisonDecision.incumbentObservationIdentity');
  assertHash(decisionRecord.candidateObservationIdentity, 'ComparisonDecision.candidateObservationIdentity');
  const decisionJudgments = assertDenseDataArray(decisionRecord.judgmentIdentities, 'ComparisonDecision.judgmentIdentities');
  if (decisionJudgments.length !== 0 && decisionJudgments.length !== 2) invalid('ComparisonDecision.judgmentIdentities', 'must be empty or exactly two hashes');
  decisionJudgments.forEach((hash, index) => assertHash(hash, `ComparisonDecision.judgmentIdentities[${index}]`));
  assertEnum(decisionRecord.relation, JUDGMENT_RELATIONS, 'ComparisonDecision.relation');
  assertEnum(decisionRecord.reason, DECISION_REASONS, 'ComparisonDecision.reason');
  const observationRows = assertDenseDataArray(observations, 'observations');
  if (observationRows.length !== 3) invalid('observations', 'must contain exactly three observations');
  const observationIdentities = observationRows.map((observation, index) => {
    validateObjectiveObservation(observation, contract, `observations[${index}]`);
    return sha256(canonicalJson(observation));
  });
  const judgmentRows = assertDenseDataArray(judgments, 'judgments');
  const judgmentIdentities = judgmentRows.map((judgment, index) => {
    validateEvaluatorJudgment(judgment, contract, `judgments[${index}]`);
    return sha256(canonicalJson(judgment));
  });
  if (decisionRecord.baselineObservationIdentity !== observationIdentities[0]
    || decisionRecord.incumbentObservationIdentity !== observationIdentities[1]
    || decisionRecord.candidateObservationIdentity !== observationIdentities[2]
    || canonicalJson(decisionRecord.judgmentIdentities) !== canonicalJson(judgmentIdentities)) {
    invalid('ComparisonDecision', 'must match the supplied observations/judgments');
  }
  const { comparisonIdentity, ...decisionWithoutIdentity } = decisionRecord;
  if (sha256(canonicalJson(decisionWithoutIdentity)) !== comparisonIdentity) {
    invalid('ComparisonDecision', 'must match the supplied observations/judgments');
  }
  const recordIdentities = [sha256(canonicalJson(decisionRecord)), ...observationIdentities, ...judgmentIdentities];
  const reason = /** @type {string} */ (decisionRecord.reason);
  const result = reason === 'binding-drift' ? 'fail' : reason === 'observation-not-ok' ? 'incomplete' : 'pass';
  return { name: 'comparison', evidenceIdentity: gateEvidenceIdentity('comparison', recordIdentities), result };
}

/**
 * Derive the independent-review gate result. Readiness must be accepted; a
 * supplied predeclared tie review must independently select the candidate and
 * carry an identity distinct from the readiness review.
 * @param {{readinessReview:unknown,tieReview?:unknown}} source
 */
export function normalizeIndependentReviewGate({ readinessReview, tieReview }) {
  const readiness = assertExactRecord(
    readinessReview,
    ['kind', 'reviewIdentity', 'target', 'checkpointIdentity', 'candidateIdentity', 'contractHash', 'evidenceHash', 'outcome'],
    [],
    'readiness-review record',
  );
  if (readiness.kind !== 'readiness-review') invalid('readiness-review record.kind', 'must be readiness-review');
  assertHash(readiness.reviewIdentity, 'readiness-review record.reviewIdentity');
  assertCanonicalTargetIdentity(readiness.target, 'readiness-review record.target');
  assertHash(readiness.checkpointIdentity, 'readiness-review record.checkpointIdentity');
  assertHash(readiness.candidateIdentity, 'readiness-review record.candidateIdentity');
  assertHash(readiness.contractHash, 'readiness-review record.contractHash');
  assertHash(readiness.evidenceHash, 'readiness-review record.evidenceHash');
  assertEnum(readiness.outcome, READINESS_OUTCOMES, 'readiness-review record.outcome');
  const recordIdentities = [sha256(canonicalJson(readiness))];
  let tieOk = true;
  if (tieReview !== undefined) {
    const tie = assertExactRecord(
      tieReview,
      ['kind', 'reviewIdentity', 'purpose', 'rubricHash', 'target', 'checkpointIdentity', 'incumbentCandidateIdentity', 'candidateIdentity', 'contractHash', 'evidenceHash', 'outcome'],
      [],
      'tie-review record',
    );
    if (tie.kind !== 'tie-review') invalid('tie-review record.kind', 'must be tie-review');
    assertHash(tie.reviewIdentity, 'tie-review record.reviewIdentity');
    assertEnum(tie.purpose, ['simplicity', 'risk'], 'tie-review record.purpose');
    assertHash(tie.rubricHash, 'tie-review record.rubricHash');
    assertCanonicalTargetIdentity(tie.target, 'tie-review record.target');
    assertHash(tie.checkpointIdentity, 'tie-review record.checkpointIdentity');
    assertHash(tie.incumbentCandidateIdentity, 'tie-review record.incumbentCandidateIdentity');
    assertHash(tie.candidateIdentity, 'tie-review record.candidateIdentity');
    assertHash(tie.contractHash, 'tie-review record.contractHash');
    assertHash(tie.evidenceHash, 'tie-review record.evidenceHash');
    assertEnum(tie.outcome, TIE_OUTCOMES, 'tie-review record.outcome');
    if (tie.reviewIdentity === readiness.reviewIdentity) invalid('tie-review record.reviewIdentity', 'must be distinct from the readiness review');
    recordIdentities.push(sha256(canonicalJson(tie)));
    tieOk = tie.outcome === 'candidate';
  }
  let result;
  if (readiness.outcome === 'accepted') result = tieOk ? 'pass' : 'fail';
  else if (readiness.outcome === 'rejected') result = 'fail';
  else result = 'incomplete';
  return { name: 'independent-review', evidenceIdentity: gateEvidenceIdentity('independent-review', recordIdentities), result };
}

/**
 * Assemble the five-row GateSet in fixed order and derive its identity.
 * @param {{target:unknown,checkpointIdentity:string,candidateIdentity:string,contractHash:string,gates:unknown}} args
 */
export function buildGateSet({ target, checkpointIdentity, candidateIdentity, contractHash, gates }) {
  const canonical = canonicalTarget(target);
  assertHash(checkpointIdentity, 'checkpointIdentity');
  assertHash(candidateIdentity, 'candidateIdentity');
  assertHash(contractHash, 'contractHash');
  const rows = assertDenseDataArray(gates, 'gates');
  if (rows.length !== GATE_NAMES.length) invalid('gates', 'must contain exactly five gate results in fixed order');
  const normalized = rows.map((rowValue, index) => {
    const row = assertExactRecord(rowValue, ['name', 'evidenceIdentity', 'result'], [], `gates[${index}]`);
    if (row.name !== GATE_NAMES[index]) invalid(`gates[${index}].name`, `must be ${GATE_NAMES[index]}`);
    assertHash(row.evidenceIdentity, `gates[${index}].evidenceIdentity`);
    assertEnum(row.result, ['pass', 'fail', 'incomplete'], `gates[${index}].result`);
    return { name: row.name, evidenceIdentity: row.evidenceIdentity, result: row.result };
  });
  const gateSetIdentity = sha256(canonicalJson({ target: canonical, checkpointIdentity, candidateIdentity, contractHash, gates: normalized }));
  return { target: canonical, checkpointIdentity, candidateIdentity, contractHash, gates: normalized, gateSetIdentity };
}

/**
 * Whether a candidate qualifies to keep: all five gates pass and a qualifying
 * relation (better, or equivalent with a predeclared tie review selecting the
 * candidate).
 * @param {unknown} gateSet @param {string} relation @param {string} [tieReviewOutcome]
 */
export function qualifiesForKeep(gateSet, relation, tieReviewOutcome) {
  const set = assertExactRecord(gateSet, ['target', 'checkpointIdentity', 'candidateIdentity', 'contractHash', 'gates', 'gateSetIdentity'], [], 'GateSet');
  assertEnum(relation, JUDGMENT_RELATIONS, 'relation');
  const gates = assertDenseDataArray(set.gates, 'GateSet.gates');
  const allPass = gates.length === GATE_NAMES.length && gates.every((gate, index) => (
    /** @type {Record<string, unknown>} */ (gate).name === GATE_NAMES[index]
    && /** @type {Record<string, unknown>} */ (gate).result === 'pass'
  ));
  if (!allPass) return false;
  if (relation === 'better') return true;
  if (relation === 'equivalent') return tieReviewOutcome === 'candidate';
  return false;
}

/**
 * Drive keep or restore for a candidate context. Returns the settled record.
 * Never releases the context or advances the incumbent (both deferred to T006).
 * @param {unknown} host @param {unknown} record @param {unknown} candidateWriteSet @param {{keep:boolean}} decision
 */
export function settleCandidate(host, record, candidateWriteSet, { keep }) {
  if (typeof keep !== 'boolean') invalid('settleCandidate.keep', 'must be a boolean');
  return keep
    ? keepCheckpoint(host, record, candidateWriteSet)
    : restoreCheckpoint(host, record, candidateWriteSet);
}

// --- T006: bounded events, dual projection, references, and audit -----------
//
// Every objective event is a closed canonical record whose `eventHash` is
// recomputed over the event without its own top-level hash and whose complete
// serialization stays within MAX_EVENT_BYTES. Events carry identities and
// bounded findings only — never file bytes, plan bytes, snapshots, or handles.
// Projection writes and re-reads flow through an injected projection owner, so
// this module writes no file. A reference is admitted only after a fresh
// dual-surface verification, and no second ledger is created.

const MAX_EVENT_BYTES = 16384;
const CLOSED_EVENT_REASONS = Object.freeze([
  'rebaseline', 'drift', 'task-completed', 'task-blocked', 'no-progress', 'hard-stop', 'controlled-end',
]);
const COMPARISON_DECISIONS = Object.freeze(['keep', 'discard', 'stop-unsettled']);
const LEARNING_OUTCOMES = Object.freeze(['authorized-alternative', 'no-progress']);
const MAX_FINDINGS = 16;
const MAX_ALTERNATIVES = 8;
const MAX_CLOSED_COMPARISON_HASHES = 64;
const MAX_CLOSED_REVIEW_HASHES = 16;
const LANE_EVENT_PREFIX = '- dude-run-event: ';
const AUDIT_CYCLE_KINDS = Object.freeze(['recovery', 'learning', 'objective']);
const AUDIT_OBJECTIVE_OUTCOMES = Object.freeze(['kept', 'discarded', 'blocked', 'unsettled']);

/** @param {unknown} value @param {string} label */
function assertTaskKeyString(value, label) {
  if (typeof value !== 'string' || !TASK_KEY_PATTERN.test(value)) invalid(label, 'must be a durable task key');
}

/** @param {unknown} value @param {string} label */
function assertFindingText(value, label) {
  assertUnicodeScalarString(value, label);
  const bytes = Buffer.byteLength(/** @type {string} */ (value));
  if (bytes < 1 || bytes > 512) invalid(label, 'must contain 1 through 512 UTF-8 bytes');
}

/** Attach the recomputed eventHash and enforce the canonical byte bound. @param {Record<string, unknown>} eventWithoutHash @param {string} label */
function finalizeEvent(eventWithoutHash, label) {
  const eventHash = sha256(canonicalJson(eventWithoutHash));
  const event = { ...eventWithoutHash, eventHash };
  if (Buffer.byteLength(canonicalJson(event)) > MAX_EVENT_BYTES) {
    invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  }
  return event;
}

/** @param {unknown} value @param {string} label */
function validateObservationIdentities(value, label) {
  const record = assertExactRecord(value, ['baseline', 'incumbent', 'candidate'], [], label);
  assertHash(record.baseline, `${label}.baseline`);
  assertHash(record.incumbent, `${label}.incumbent`);
  assertHash(record.candidate, `${label}.candidate`);
  return { baseline: record.baseline, incumbent: record.incumbent, candidate: record.candidate };
}

/** @param {unknown} value @param {string} label */
function validateGateResults(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length !== GATE_NAMES.length) invalid(label, 'must contain exactly five gate results in fixed order');
  return rows.map((rowValue, index) => {
    const row = assertExactRecord(rowValue, ['name', 'evidenceIdentity', 'result'], [], `${label}[${index}]`);
    if (row.name !== GATE_NAMES[index]) invalid(`${label}[${index}].name`, `must be ${GATE_NAMES[index]}`);
    assertHash(row.evidenceIdentity, `${label}[${index}].evidenceIdentity`);
    assertEnum(row.result, ['pass', 'fail', 'incomplete'], `${label}[${index}].result`);
    return { name: row.name, evidenceIdentity: row.evidenceIdentity, result: row.result };
  });
}

/** @param {unknown} value @param {number} max @param {string} label */
function validateBoundedHashList(value, max, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length > max) invalid(label, `must contain at most ${max} hashes`);
  rows.forEach((hash, index) => assertHash(hash, `${label}[${index}]`));
  return [.../** @type {string[]} */ (rows)];
}

/** @param {unknown} value @param {string} label */
function validateAlternatives(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length > MAX_ALTERNATIVES) invalid(label, `must contain at most ${MAX_ALTERNATIVES} rows`);
  /** @type {string|null} */
  let previous = null;
  return rows.map((rowValue, index) => {
    const row = assertExactRecord(rowValue, ['approachHash', 'discriminatingCheckId'], [], `${label}[${index}]`);
    assertHash(row.approachHash, `${label}[${index}].approachHash`);
    assertRegistryIdentifier(row.discriminatingCheckId, `${label}[${index}].discriminatingCheckId`);
    if (previous !== null && compareUtf8(previous, /** @type {string} */ (row.approachHash)) >= 0) {
      invalid(label, 'must be sorted and unique by approachHash');
    }
    previous = /** @type {string} */ (row.approachHash);
    return { approachHash: row.approachHash, discriminatingCheckId: row.discriminatingCheckId };
  });
}

/**
 * Build a bounded ObjectiveComparisonEvent. `incumbentAfterIdentity` is derived
 * from the decision: keep advances to the candidate, discard holds the prior
 * incumbent, and stop-unsettled advances nothing. `restorationIdentity` is
 * required for and unique to a discard.
 * @param {unknown} input
 */
export function buildObjectiveComparisonEvent(input) {
  const args = assertExactRecord(
    input,
    [
      'target', 'taskKey', 'sequenceIdentity', 'comparisonIdentity', 'checkpointIdentity', 'contractHash',
      'baselineCandidateIdentity', 'incumbentBeforeIdentity', 'candidateIdentity', 'observationIdentities',
      'relation', 'gateSetIdentity', 'gateResults', 'decision',
    ],
    ['restorationIdentity'],
    'buildObjectiveComparisonEvent',
  );
  const canonical = canonicalTarget(args.target);
  assertTaskKeyString(args.taskKey, 'buildObjectiveComparisonEvent.taskKey');
  assertHash(args.sequenceIdentity, 'buildObjectiveComparisonEvent.sequenceIdentity');
  assertHash(args.comparisonIdentity, 'buildObjectiveComparisonEvent.comparisonIdentity');
  assertHash(args.checkpointIdentity, 'buildObjectiveComparisonEvent.checkpointIdentity');
  assertHash(args.contractHash, 'buildObjectiveComparisonEvent.contractHash');
  assertHash(args.baselineCandidateIdentity, 'buildObjectiveComparisonEvent.baselineCandidateIdentity');
  assertHash(args.incumbentBeforeIdentity, 'buildObjectiveComparisonEvent.incumbentBeforeIdentity');
  assertHash(args.candidateIdentity, 'buildObjectiveComparisonEvent.candidateIdentity');
  const observationIdentities = validateObservationIdentities(args.observationIdentities, 'buildObjectiveComparisonEvent.observationIdentities');
  assertEnum(args.relation, JUDGMENT_RELATIONS, 'buildObjectiveComparisonEvent.relation');
  assertHash(args.gateSetIdentity, 'buildObjectiveComparisonEvent.gateSetIdentity');
  const gateResults = validateGateResults(args.gateResults, 'buildObjectiveComparisonEvent.gateResults');
  assertEnum(args.decision, COMPARISON_DECISIONS, 'buildObjectiveComparisonEvent.decision');
  const decision = /** @type {string} */ (args.decision);
  const hasRestoration = Object.hasOwn(args, 'restorationIdentity');
  /** @type {string|null} */
  let incumbentAfterIdentity;
  /** @type {string|undefined} */
  let restorationIdentity;
  if (decision === 'keep') {
    if (hasRestoration) invalid('buildObjectiveComparisonEvent.restorationIdentity', 'is forbidden for a keep');
    incumbentAfterIdentity = /** @type {string} */ (args.candidateIdentity);
  } else if (decision === 'discard') {
    assertHash(args.restorationIdentity, 'buildObjectiveComparisonEvent.restorationIdentity');
    restorationIdentity = /** @type {string} */ (args.restorationIdentity);
    incumbentAfterIdentity = /** @type {string} */ (args.incumbentBeforeIdentity);
  } else {
    if (hasRestoration) invalid('buildObjectiveComparisonEvent.restorationIdentity', 'is forbidden for a stop-unsettled');
    incumbentAfterIdentity = null;
  }
  const eventWithoutHash = {
    type: 'objective-comparison',
    version: 1,
    target: canonical,
    taskKey: args.taskKey,
    sequenceIdentity: args.sequenceIdentity,
    comparisonIdentity: args.comparisonIdentity,
    checkpointIdentity: args.checkpointIdentity,
    contractHash: args.contractHash,
    baselineCandidateIdentity: args.baselineCandidateIdentity,
    incumbentBeforeIdentity: args.incumbentBeforeIdentity,
    candidateIdentity: args.candidateIdentity,
    observationIdentities,
    relation: args.relation,
    gateSetIdentity: args.gateSetIdentity,
    gateResults,
    decision,
    incumbentAfterIdentity,
    ...(restorationIdentity !== undefined ? { restorationIdentity } : {}),
  };
  return finalizeEvent(eventWithoutHash, 'ObjectiveComparisonEvent');
}

/** Validate one closed ObjectiveComparisonEvent. @param {unknown} value @param {string} [label] */
export function validateObjectiveComparisonEvent(value, label = 'ObjectiveComparisonEvent') {
  const record = assertExactRecord(
    value,
    [
      'type', 'version', 'eventHash', 'target', 'taskKey', 'sequenceIdentity', 'comparisonIdentity',
      'checkpointIdentity', 'contractHash', 'baselineCandidateIdentity', 'incumbentBeforeIdentity',
      'candidateIdentity', 'observationIdentities', 'relation', 'gateSetIdentity', 'gateResults',
      'decision', 'incumbentAfterIdentity',
    ],
    ['restorationIdentity'],
    label,
  );
  if (record.type !== 'objective-comparison') invalid(`${label}.type`, 'must be objective-comparison');
  if (record.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(record.eventHash, `${label}.eventHash`);
  assertCanonicalTargetIdentity(record.target, `${label}.target`);
  assertTaskKeyString(record.taskKey, `${label}.taskKey`);
  assertHash(record.sequenceIdentity, `${label}.sequenceIdentity`);
  assertHash(record.comparisonIdentity, `${label}.comparisonIdentity`);
  assertHash(record.checkpointIdentity, `${label}.checkpointIdentity`);
  assertHash(record.contractHash, `${label}.contractHash`);
  assertHash(record.baselineCandidateIdentity, `${label}.baselineCandidateIdentity`);
  assertHash(record.incumbentBeforeIdentity, `${label}.incumbentBeforeIdentity`);
  assertHash(record.candidateIdentity, `${label}.candidateIdentity`);
  validateObservationIdentities(record.observationIdentities, `${label}.observationIdentities`);
  assertEnum(record.relation, JUDGMENT_RELATIONS, `${label}.relation`);
  assertHash(record.gateSetIdentity, `${label}.gateSetIdentity`);
  validateGateResults(record.gateResults, `${label}.gateResults`);
  assertEnum(record.decision, COMPARISON_DECISIONS, `${label}.decision`);
  const hasRestoration = Object.hasOwn(record, 'restorationIdentity');
  if (record.decision === 'keep') {
    if (hasRestoration) invalid(`${label}.restorationIdentity`, 'is forbidden for a keep');
    assertHash(record.incumbentAfterIdentity, `${label}.incumbentAfterIdentity`);
    if (record.incumbentAfterIdentity !== record.candidateIdentity) invalid(`${label}.incumbentAfterIdentity`, 'must equal the candidate identity for a keep');
  } else if (record.decision === 'discard') {
    assertHash(record.restorationIdentity, `${label}.restorationIdentity`);
    assertHash(record.incumbentAfterIdentity, `${label}.incumbentAfterIdentity`);
    if (record.incumbentAfterIdentity !== record.incumbentBeforeIdentity) invalid(`${label}.incumbentAfterIdentity`, 'must equal the prior incumbent for a discard');
  } else {
    if (hasRestoration) invalid(`${label}.restorationIdentity`, 'is forbidden for a stop-unsettled');
    if (record.incumbentAfterIdentity !== null) invalid(`${label}.incumbentAfterIdentity`, 'must be null for a stop-unsettled');
  }
  const { eventHash, ...rest } = record;
  if (sha256(canonicalJson(rest)) !== eventHash) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(record)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

/** Build a bounded EvaluationSequenceClosedEvent over a settled final incumbent. @param {unknown} input */
export function buildEvaluationSequenceClosedEvent(input) {
  const args = assertExactRecord(
    input,
    ['target', 'taskKey', 'sequenceIdentity', 'contractHash', 'baselineCandidateIdentity', 'finalIncumbentIdentity', 'reason', 'comparisonEventHashes', 'learningReviewEventHashes'],
    [],
    'buildEvaluationSequenceClosedEvent',
  );
  const canonical = canonicalTarget(args.target);
  assertTaskKeyString(args.taskKey, 'buildEvaluationSequenceClosedEvent.taskKey');
  assertHash(args.sequenceIdentity, 'buildEvaluationSequenceClosedEvent.sequenceIdentity');
  assertHash(args.contractHash, 'buildEvaluationSequenceClosedEvent.contractHash');
  assertHash(args.baselineCandidateIdentity, 'buildEvaluationSequenceClosedEvent.baselineCandidateIdentity');
  assertHash(args.finalIncumbentIdentity, 'buildEvaluationSequenceClosedEvent.finalIncumbentIdentity');
  assertEnum(args.reason, CLOSED_EVENT_REASONS, 'buildEvaluationSequenceClosedEvent.reason');
  const comparisonEventHashes = validateBoundedHashList(args.comparisonEventHashes, MAX_CLOSED_COMPARISON_HASHES, 'buildEvaluationSequenceClosedEvent.comparisonEventHashes');
  const learningReviewEventHashes = validateBoundedHashList(args.learningReviewEventHashes, MAX_CLOSED_REVIEW_HASHES, 'buildEvaluationSequenceClosedEvent.learningReviewEventHashes');
  const eventWithoutHash = {
    type: 'evaluation-sequence-closed',
    version: 1,
    target: canonical,
    taskKey: args.taskKey,
    sequenceIdentity: args.sequenceIdentity,
    contractHash: args.contractHash,
    baselineCandidateIdentity: args.baselineCandidateIdentity,
    finalIncumbentIdentity: args.finalIncumbentIdentity,
    reason: args.reason,
    comparisonEventHashes,
    learningReviewEventHashes,
  };
  return finalizeEvent(eventWithoutHash, 'EvaluationSequenceClosedEvent');
}

/** Validate one closed EvaluationSequenceClosedEvent. @param {unknown} value @param {string} [label] */
export function validateEvaluationSequenceClosedEvent(value, label = 'EvaluationSequenceClosedEvent') {
  const record = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'target', 'taskKey', 'sequenceIdentity', 'contractHash', 'baselineCandidateIdentity', 'finalIncumbentIdentity', 'reason', 'comparisonEventHashes', 'learningReviewEventHashes'],
    [],
    label,
  );
  if (record.type !== 'evaluation-sequence-closed') invalid(`${label}.type`, 'must be evaluation-sequence-closed');
  if (record.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(record.eventHash, `${label}.eventHash`);
  assertCanonicalTargetIdentity(record.target, `${label}.target`);
  assertTaskKeyString(record.taskKey, `${label}.taskKey`);
  assertHash(record.sequenceIdentity, `${label}.sequenceIdentity`);
  assertHash(record.contractHash, `${label}.contractHash`);
  assertHash(record.baselineCandidateIdentity, `${label}.baselineCandidateIdentity`);
  assertHash(record.finalIncumbentIdentity, `${label}.finalIncumbentIdentity`);
  assertEnum(record.reason, CLOSED_EVENT_REASONS, `${label}.reason`);
  validateBoundedHashList(record.comparisonEventHashes, MAX_CLOSED_COMPARISON_HASHES, `${label}.comparisonEventHashes`);
  validateBoundedHashList(record.learningReviewEventHashes, MAX_CLOSED_REVIEW_HASHES, `${label}.learningReviewEventHashes`);
  const { eventHash, ...rest } = record;
  if (sha256(canonicalJson(rest)) !== eventHash) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(record)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

/** Build a bounded LearningReviewEvent; `reviewIdentity` is derived. @param {unknown} input */
export function buildLearningReviewEvent(input) {
  const args = assertExactRecord(
    input,
    ['target', 'evidenceHash', 'repeatedEvidenceHash', 'repeatedApproachHash', 'findings', 'alternatives', 'outcome'],
    ['sequenceIdentity', 'selectedApproachHash', 'discriminatingCheckId'],
    'buildLearningReviewEvent',
  );
  const canonical = canonicalTarget(args.target);
  const hasSequence = Object.hasOwn(args, 'sequenceIdentity');
  if (hasSequence) assertHash(args.sequenceIdentity, 'buildLearningReviewEvent.sequenceIdentity');
  assertHash(args.evidenceHash, 'buildLearningReviewEvent.evidenceHash');
  assertHash(args.repeatedEvidenceHash, 'buildLearningReviewEvent.repeatedEvidenceHash');
  assertHash(args.repeatedApproachHash, 'buildLearningReviewEvent.repeatedApproachHash');
  const findings = assertDenseDataArray(args.findings, 'buildLearningReviewEvent.findings');
  if (findings.length < 1 || findings.length > MAX_FINDINGS) invalid('buildLearningReviewEvent.findings', `must contain 1 through ${MAX_FINDINGS} findings`);
  findings.forEach((finding, index) => assertFindingText(finding, `buildLearningReviewEvent.findings[${index}]`));
  const alternatives = validateAlternatives(args.alternatives, 'buildLearningReviewEvent.alternatives');
  assertEnum(args.outcome, LEARNING_OUTCOMES, 'buildLearningReviewEvent.outcome');
  const outcome = /** @type {string} */ (args.outcome);
  /** @type {Record<string, unknown>} */
  const optionalTail = {};
  if (outcome === 'authorized-alternative') {
    assertHash(args.selectedApproachHash, 'buildLearningReviewEvent.selectedApproachHash');
    assertRegistryIdentifier(args.discriminatingCheckId, 'buildLearningReviewEvent.discriminatingCheckId');
    if (args.selectedApproachHash === args.repeatedApproachHash) invalid('buildLearningReviewEvent.selectedApproachHash', 'must differ from the repeated approach');
    if (!alternatives.some((alternative) => alternative.approachHash === args.selectedApproachHash && alternative.discriminatingCheckId === args.discriminatingCheckId)) {
      invalid('buildLearningReviewEvent.selectedApproachHash', 'must match an alternatives row');
    }
    optionalTail.selectedApproachHash = args.selectedApproachHash;
    optionalTail.discriminatingCheckId = args.discriminatingCheckId;
  } else if (Object.hasOwn(args, 'selectedApproachHash') || Object.hasOwn(args, 'discriminatingCheckId')) {
    invalid('buildLearningReviewEvent', 'no-progress forbids a selected approach and discriminating check');
  }
  const reviewIdentity = sha256(canonicalJson({
    target: canonical,
    ...(hasSequence ? { sequenceIdentity: args.sequenceIdentity } : {}),
    evidenceHash: args.evidenceHash,
    repeatedEvidenceHash: args.repeatedEvidenceHash,
    repeatedApproachHash: args.repeatedApproachHash,
  }));
  const eventWithoutHash = {
    type: 'learning-review',
    version: 1,
    reviewIdentity,
    target: canonical,
    ...(hasSequence ? { sequenceIdentity: args.sequenceIdentity } : {}),
    evidenceHash: args.evidenceHash,
    repeatedEvidenceHash: args.repeatedEvidenceHash,
    repeatedApproachHash: args.repeatedApproachHash,
    findings: [.../** @type {string[]} */ (findings)],
    alternatives,
    outcome,
    ...optionalTail,
  };
  return finalizeEvent(eventWithoutHash, 'LearningReviewEvent');
}

/** Validate one closed LearningReviewEvent. @param {unknown} value @param {string} [label] */
export function validateLearningReviewEvent(value, label = 'LearningReviewEvent') {
  const record = assertExactRecord(
    value,
    ['type', 'version', 'eventHash', 'reviewIdentity', 'target', 'evidenceHash', 'repeatedEvidenceHash', 'repeatedApproachHash', 'findings', 'alternatives', 'outcome'],
    ['sequenceIdentity', 'selectedApproachHash', 'discriminatingCheckId'],
    label,
  );
  if (record.type !== 'learning-review') invalid(`${label}.type`, 'must be learning-review');
  if (record.version !== 1) invalid(`${label}.version`, 'must be the literal safe integer 1');
  assertHash(record.eventHash, `${label}.eventHash`);
  assertHash(record.reviewIdentity, `${label}.reviewIdentity`);
  assertCanonicalTargetIdentity(record.target, `${label}.target`);
  const hasSequence = Object.hasOwn(record, 'sequenceIdentity');
  if (hasSequence) assertHash(record.sequenceIdentity, `${label}.sequenceIdentity`);
  assertHash(record.evidenceHash, `${label}.evidenceHash`);
  assertHash(record.repeatedEvidenceHash, `${label}.repeatedEvidenceHash`);
  assertHash(record.repeatedApproachHash, `${label}.repeatedApproachHash`);
  const findings = assertDenseDataArray(record.findings, `${label}.findings`);
  if (findings.length < 1 || findings.length > MAX_FINDINGS) invalid(`${label}.findings`, `must contain 1 through ${MAX_FINDINGS} findings`);
  findings.forEach((finding, index) => assertFindingText(finding, `${label}.findings[${index}]`));
  validateAlternatives(record.alternatives, `${label}.alternatives`);
  assertEnum(record.outcome, LEARNING_OUTCOMES, `${label}.outcome`);
  if (record.outcome === 'authorized-alternative') {
    assertHash(record.selectedApproachHash, `${label}.selectedApproachHash`);
    assertRegistryIdentifier(record.discriminatingCheckId, `${label}.discriminatingCheckId`);
    if (record.selectedApproachHash === record.repeatedApproachHash) invalid(`${label}.selectedApproachHash`, 'must differ from the repeated approach');
    if (!/** @type {Record<string, unknown>[]} */ (record.alternatives).some((alternative) => alternative.approachHash === record.selectedApproachHash && alternative.discriminatingCheckId === record.discriminatingCheckId)) {
      invalid(`${label}.selectedApproachHash`, 'must match an alternatives row');
    }
  } else if (Object.hasOwn(record, 'selectedApproachHash') || Object.hasOwn(record, 'discriminatingCheckId')) {
    invalid(label, 'no-progress forbids a selected approach and discriminating check');
  }
  const reviewIdentity = sha256(canonicalJson({
    target: record.target,
    ...(hasSequence ? { sequenceIdentity: record.sequenceIdentity } : {}),
    evidenceHash: record.evidenceHash,
    repeatedEvidenceHash: record.repeatedEvidenceHash,
    repeatedApproachHash: record.repeatedApproachHash,
  }));
  if (reviewIdentity !== record.reviewIdentity) invalid(`${label}.reviewIdentity`, 'must equal the recomputed review identity');
  const { eventHash, ...rest } = record;
  if (sha256(canonicalJson(rest)) !== eventHash) invalid(`${label}.eventHash`, 'must equal the recomputed event hash');
  if (Buffer.byteLength(canonicalJson(record)) > MAX_EVENT_BYTES) invalid(label, `must serialize to at most ${MAX_EVENT_BYTES} UTF-8 bytes`);
  return value;
}

/** Dispatch to the closed validator for one objective event type. @param {unknown} value @param {string} [label] */
function validateEvent(value, label = 'event') {
  const type = assertRecord(value, label).type;
  if (type === 'objective-comparison') return validateObjectiveComparisonEvent(value, label);
  if (type === 'evaluation-sequence-closed') return validateEvaluationSequenceClosedEvent(value, label);
  if (type === 'learning-review') return validateLearningReviewEvent(value, label);
  return invalid(`${label}.type`, 'must be a known objective event type');
}

// --- Exact dual projection through an injected owner ------------------------

/** Validate the injected projection owner interface. @param {unknown} value @param {string} [label] */
export function validateProjectionOwner(value, label = 'projectionOwner') {
  const owner = assertRecord(value, label);
  for (const method of ['appendCurrentRunRecord', 'acquireCurrentRunRecords', 'appendLaneEventLine', 'acquireLaneEventLines']) {
    if (typeof owner[method] !== 'function') invalid(`${label}.${method}`, 'must be a function');
  }
  return value;
}

/** The current-run capture record whose substantive payload is exactly `{event}`. @param {unknown} event */
export function buildProjectionRecord(event) {
  return { substantive: { event } };
}

/** The exact lane-history line: `- dude-run-event: ` followed by `CJ({event})`. @param {unknown} event */
export function buildLaneEventLine(event) {
  return `${LANE_EVENT_PREFIX}${canonicalJson({ event })}`;
}

/** @param {string} surface @param {unknown} target @param {string} eventHash @param {string} recordHash */
function projectionSurfaceIdentity(surface, target, eventHash, recordHash) {
  return sha256(canonicalJson({ surface, target: canonicalTarget(target), eventHash, recordHash }));
}

/** @param {unknown} value */
function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Extract candidate current-run events. @param {unknown} records */
function currentRunProjectionCandidates(records) {
  const rows = assertDenseDataArray(records, 'current-run records');
  /** @type {{event:unknown}[]} */
  const candidates = [];
  for (const recordValue of rows) {
    if (!isPlainRecord(recordValue)) continue;
    const substantive = /** @type {Record<string, unknown>} */ (recordValue).substantive;
    if (!isPlainRecord(substantive) || !Object.hasOwn(/** @type {Record<string, unknown>} */ (substantive), 'event')) continue;
    candidates.push({ event: /** @type {Record<string, unknown>} */ (substantive).event });
  }
  return candidates;
}

/** Extract candidate lane events; a prefixed but noncanonical line is malformed. @param {unknown} lines */
function laneProjectionCandidates(lines) {
  const rows = assertDenseDataArray(lines, 'lane event lines');
  /** @type {{event:unknown,line:string}[]} */
  const candidates = [];
  for (const lineValue of rows) {
    if (typeof lineValue !== 'string' || !lineValue.startsWith(LANE_EVENT_PREFIX)) continue;
    const payloadText = lineValue.slice(LANE_EVENT_PREFIX.length);
    let parsed;
    try {
      parsed = JSON.parse(payloadText);
    } catch {
      invalid('projection', 'a lane-history projection is malformed');
    }
    let canonical;
    try {
      canonical = canonicalJson(parsed);
    } catch {
      invalid('projection', 'a lane-history projection is malformed');
    }
    if (canonical !== payloadText) invalid('projection', 'a lane-history projection is not canonical');
    if (!isPlainRecord(parsed) || !Object.hasOwn(/** @type {Record<string, unknown>} */ (parsed), 'event')) {
      invalid('projection', 'a lane-history projection is malformed');
    }
    candidates.push({ event: /** @type {Record<string, unknown>} */ (parsed).event, line: lineValue });
  }
  return candidates;
}

/**
 * Match exactly one byte-equivalent, valid, correctly-targeted event on a
 * surface. Zero matches is missing, two or more is duplicate-conflicting, and a
 * wrong target or a hash mismatch each hard stops.
 * @param {string} surface @param {{event:unknown}[]} candidates @param {string} eventHash @param {unknown} canonicalExpected @param {(candidate:any)=>string} recordHashOf
 */
function matchProjectionSurface(surface, candidates, eventHash, canonicalExpected, recordHashOf) {
  const canonicalExpectedJson = canonicalJson(canonicalExpected);
  /** @type {{event:Record<string, unknown>,recordHash:string}[]} */
  const matches = [];
  for (const candidate of candidates) {
    const event = candidate.event;
    if (!isPlainRecord(event) || /** @type {Record<string, unknown>} */ (event).eventHash !== eventHash) continue;
    const record = /** @type {Record<string, unknown>} */ (event);
    let target;
    try {
      target = canonicalTarget(record.target);
    } catch {
      invalid('projection', `a ${surface} projection has an invalid target`);
    }
    if (canonicalJson(target) !== canonicalExpectedJson) invalid('projection', `a ${surface} projection has the wrong target`);
    const { eventHash: embedded, ...rest } = record;
    if (sha256(canonicalJson(rest)) !== embedded) invalid('projection', `a ${surface} projection has a hash mismatch`);
    validateEvent(record, `${surface} projection event`);
    matches.push({ event: record, recordHash: recordHashOf(candidate) });
  }
  if (matches.length === 0) invalid('projection', `the ${surface} projection is missing`);
  if (matches.length > 1) invalid('projection', `the ${surface} projection is duplicate-conflicting`);
  return matches[0];
}

/**
 * Reacquire both surfaces fresh, require exactly one byte-equivalent valid event
 * per surface, and derive both projection identities.
 * @param {unknown} owner @param {string} eventHash @param {unknown} expectedTarget
 */
export function reacquireProjection(owner, eventHash, expectedTarget) {
  validateProjectionOwner(owner);
  assertHash(eventHash, 'eventHash');
  const canonicalExpected = canonicalTarget(expectedTarget);
  const ownerApi = /** @type {Record<string, Function>} */ (owner);
  const currentRun = matchProjectionSurface(
    'current-run',
    currentRunProjectionCandidates(ownerApi.acquireCurrentRunRecords()),
    eventHash,
    canonicalExpected,
    (candidate) => sha256(canonicalJson({ event: candidate.event })),
  );
  const lane = matchProjectionSurface(
    'lane-history',
    laneProjectionCandidates(ownerApi.acquireLaneEventLines()),
    eventHash,
    canonicalExpected,
    (candidate) => sha256(Buffer.from(candidate.line, 'utf8')),
  );
  if (canonicalJson(currentRun.event) !== canonicalJson(lane.event)) {
    invalid('projection', 'the current-run and lane-history projections must carry the same event');
  }
  return {
    event: currentRun.event,
    currentRunProjectionIdentity: projectionSurfaceIdentity('current-run', canonicalExpected, eventHash, currentRun.recordHash),
    laneProjectionIdentity: projectionSurfaceIdentity('lane-history', canonicalExpected, eventHash, lane.recordHash),
  };
}

/** Reacquire and additionally assert the reacquired event byte-equals `event`. @param {unknown} owner @param {unknown} event */
export function verifyProjection(owner, event) {
  validateProjectionOwner(owner);
  validateEvent(event, 'event');
  const eventRecord = /** @type {Record<string, unknown>} */ (event);
  const result = reacquireProjection(owner, /** @type {string} */ (eventRecord.eventHash), eventRecord.target);
  if (canonicalJson(result.event) !== canonicalJson(event)) {
    invalid('projection', 'the reacquired event must byte-equal the supplied event');
  }
  return result;
}

/** Validate the event, append both projections through the owner, then verify. @param {unknown} owner @param {unknown} event */
export function projectEvent(owner, event) {
  validateProjectionOwner(owner);
  validateEvent(event, 'event');
  const ownerApi = /** @type {Record<string, Function>} */ (owner);
  ownerApi.appendCurrentRunRecord(buildProjectionRecord(event));
  ownerApi.appendLaneEventLine(buildLaneEventLine(event));
  return verifyProjection(owner, event);
}

// --- Bounded references, pressure, and verified eviction --------------------

/** Build the RunState successor carrying updated objective arrays. @param {Record<string, unknown>} state @param {{evaluationSequences?:unknown,learningReviewRefs?:unknown}} updates */
function withObjectiveArrays(state, updates) {
  const next = carryOptionalRunState(state, {
    policy: state.policy,
    overallUsed: state.overallUsed,
    recoveryUsed: state.recoveryUsed,
    pending: state.pending,
    completed: state.completed,
  });
  const sequences = Object.hasOwn(updates, 'evaluationSequences')
    ? updates.evaluationSequences
    : (Object.hasOwn(state, 'evaluationSequences') ? state.evaluationSequences : undefined);
  const refs = Object.hasOwn(updates, 'learningReviewRefs')
    ? updates.learningReviewRefs
    : (Object.hasOwn(state, 'learningReviewRefs') ? state.learningReviewRefs : undefined);
  if (sequences !== undefined) /** @type {Record<string, unknown>} */ (next).evaluationSequences = sequences;
  if (refs !== undefined) /** @type {Record<string, unknown>} */ (next).learningReviewRefs = refs;
  return next;
}

/** @param {Record<string, unknown>} state @returns {Record<string, unknown>[]} */
function evaluationSequenceRows(state) {
  return Object.hasOwn(state, 'evaluationSequences')
    ? /** @type {Record<string, unknown>[]} */ (state.evaluationSequences)
    : [];
}

/** @param {Record<string, unknown>} state @returns {Record<string, unknown>[]} */
function learningReviewRefRows(state) {
  return Object.hasOwn(state, 'learningReviewRefs')
    ? /** @type {Record<string, unknown>[]} */ (state.learningReviewRefs)
    : [];
}

/**
 * Re-verify the lowest-ordinal comparison reference's dual projection and drop
 * it. A missing, conflicting, or mismatched projection blocks eviction.
 * @param {Record<string, unknown>[]} comparisons @param {Record<string, unknown>} row @param {unknown} owner
 */
function evictOldestComparisonRef(comparisons, row, owner) {
  if (comparisons.length === 0) invalid('eviction', 'no verified comparison reference is available to evict');
  const oldest = comparisons[0];
  const verified = reacquireProjection(owner, /** @type {string} */ (oldest.eventHash), row.target);
  if (verified.currentRunProjectionIdentity !== oldest.currentRunProjectionIdentity
    || verified.laneProjectionIdentity !== oldest.laneProjectionIdentity
    || /** @type {Record<string, unknown>} */ (verified.event).comparisonIdentity !== oldest.comparisonIdentity) {
    invalid('eviction', 'the oldest comparison reference must re-verify before eviction');
  }
  return comparisons.slice(1);
}

/**
 * Admit one comparison ProjectionReference into its sequence after projection.
 * Reaching the per-sequence (8) or total (64) bound first evicts this sequence's
 * oldest verified reference; pressure never drops an unprojected comparison.
 * @param {unknown} stateValue @param {string} sequenceIdentity @param {unknown} ref @param {unknown} owner
 */
export function admitComparisonReference(stateValue, sequenceIdentity, ref, owner) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  validateProjectionOwner(owner);
  assertHash(sequenceIdentity, 'sequenceIdentity');
  const refFields = assertExactRecord(ref, ['comparisonIdentity', 'eventHash', 'currentRunProjectionIdentity', 'laneProjectionIdentity'], [], 'comparison reference');
  assertHash(refFields.comparisonIdentity, 'comparison reference.comparisonIdentity');
  assertHash(refFields.eventHash, 'comparison reference.eventHash');
  assertHash(refFields.currentRunProjectionIdentity, 'comparison reference.currentRunProjectionIdentity');
  assertHash(refFields.laneProjectionIdentity, 'comparison reference.laneProjectionIdentity');
  const sequences = evaluationSequenceRows(state)
    .map((sequenceRow) => ({ ...sequenceRow, recentComparisons: [.../** @type {unknown[]} */ (sequenceRow.recentComparisons)] }));
  const rowIndex = sequences.findIndex((sequenceRow) => sequenceRow.sequenceIdentity === sequenceIdentity);
  if (rowIndex === -1) invalid('admitComparisonReference', 'must target a sequence present in the run state');
  const row = sequences[rowIndex];
  let comparisons = /** @type {Record<string, unknown>[]} */ (row.recentComparisons);
  const nextOrdinal = comparisons.reduce((max, entry) => Math.max(max, /** @type {number} */ (entry.ordinal)), 0) + 1;
  const totalOther = sequences.reduce(
    (sum, sequenceRow, index) => sum + (index === rowIndex ? 0 : /** @type {unknown[]} */ (sequenceRow.recentComparisons).length),
    0,
  );
  if (comparisons.length + 1 > MAX_RECENT_COMPARISONS || totalOther + comparisons.length + 1 > MAX_TOTAL_COMPARISON_REFS) {
    comparisons = evictOldestComparisonRef(comparisons, row, owner);
  }
  comparisons.push({
    ordinal: nextOrdinal,
    comparisonIdentity: refFields.comparisonIdentity,
    eventHash: refFields.eventHash,
    currentRunProjectionIdentity: refFields.currentRunProjectionIdentity,
    laneProjectionIdentity: refFields.laneProjectionIdentity,
  });
  row.recentComparisons = comparisons;
  const nextState = withObjectiveArrays(state, { evaluationSequences: sequences });
  validateRunState(nextState);
  return nextState;
}

/** @param {Record<string, unknown>[]} refs @param {unknown} owner */
function evictLowestLearningReviewRef(refs, owner) {
  if (refs.length === 0) invalid('eviction', 'no verified learning review reference is available to evict');
  const lowest = [...refs].sort((left, right) => compareUtf8(/** @type {string} */ (left.reviewIdentity), /** @type {string} */ (right.reviewIdentity)))[0];
  const verified = reacquireProjection(owner, /** @type {string} */ (lowest.eventHash), lowest.target);
  if (verified.currentRunProjectionIdentity !== lowest.currentRunProjectionIdentity
    || verified.laneProjectionIdentity !== lowest.laneProjectionIdentity
    || /** @type {Record<string, unknown>} */ (verified.event).reviewIdentity !== lowest.reviewIdentity) {
    invalid('eviction', 'the lowest learning review reference must re-verify before eviction');
  }
  return refs.filter((refRow) => refRow.reviewIdentity !== lowest.reviewIdentity);
}

/**
 * Admit one learning-review ProjectionReference after projection. At the 16-ref
 * bound, re-verify and drop the lowest identity's projection first.
 * @param {unknown} stateValue @param {unknown} ref @param {unknown} owner
 */
export function admitLearningReviewReference(stateValue, ref, owner) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  validateProjectionOwner(owner);
  const refFields = assertExactRecord(ref, ['reviewIdentity', 'target', 'eventHash', 'currentRunProjectionIdentity', 'laneProjectionIdentity'], [], 'learning review reference');
  assertHash(refFields.reviewIdentity, 'learning review reference.reviewIdentity');
  const canonical = canonicalTarget(refFields.target);
  assertHash(refFields.eventHash, 'learning review reference.eventHash');
  assertHash(refFields.currentRunProjectionIdentity, 'learning review reference.currentRunProjectionIdentity');
  assertHash(refFields.laneProjectionIdentity, 'learning review reference.laneProjectionIdentity');
  let refs = learningReviewRefRows(state).map((refRow) => ({ ...refRow }));
  if (refs.some((refRow) => refRow.reviewIdentity === refFields.reviewIdentity)) {
    invalid('admitLearningReviewReference', 'must not duplicate an existing review identity');
  }
  if (refs.length + 1 > MAX_LEARNING_REVIEW_REFS) {
    refs = evictLowestLearningReviewRef(refs, owner);
  }
  refs.push({
    reviewIdentity: refFields.reviewIdentity,
    target: canonical,
    eventHash: refFields.eventHash,
    currentRunProjectionIdentity: refFields.currentRunProjectionIdentity,
    laneProjectionIdentity: refFields.laneProjectionIdentity,
  });
  refs.sort((left, right) => compareUtf8(/** @type {string} */ (left.reviewIdentity), /** @type {string} */ (right.reviewIdentity)));
  const nextState = withObjectiveArrays(state, { learningReviewRefs: refs });
  validateRunState(nextState);
  return nextState;
}

// --- Retention decision drives keep, restore, or unsettled stop -------------

/** @param {unknown} value @param {string} [label] */
function validateComparisonDecisionRecord(value, label = 'ComparisonDecision') {
  const record = assertExactRecord(
    value,
    ['comparisonIdentity', 'target', 'sequenceIdentity', 'checkpointIdentity', 'contractHash', 'baselineObservationIdentity', 'incumbentObservationIdentity', 'candidateObservationIdentity', 'judgmentIdentities', 'relation', 'reason'],
    [],
    label,
  );
  assertHash(record.comparisonIdentity, `${label}.comparisonIdentity`);
  assertCanonicalTargetIdentity(record.target, `${label}.target`);
  assertHash(record.sequenceIdentity, `${label}.sequenceIdentity`);
  assertHash(record.checkpointIdentity, `${label}.checkpointIdentity`);
  assertHash(record.contractHash, `${label}.contractHash`);
  assertHash(record.baselineObservationIdentity, `${label}.baselineObservationIdentity`);
  assertHash(record.incumbentObservationIdentity, `${label}.incumbentObservationIdentity`);
  assertHash(record.candidateObservationIdentity, `${label}.candidateObservationIdentity`);
  const judgments = assertDenseDataArray(record.judgmentIdentities, `${label}.judgmentIdentities`);
  if (judgments.length !== 0 && judgments.length !== 2) invalid(`${label}.judgmentIdentities`, 'must be empty or exactly two hashes');
  judgments.forEach((hash, index) => assertHash(hash, `${label}.judgmentIdentities[${index}]`));
  assertEnum(record.relation, JUDGMENT_RELATIONS, `${label}.relation`);
  assertEnum(record.reason, DECISION_REASONS, `${label}.reason`);
  return record;
}

/**
 * Classify the first live checkpoint observation without allowing a host fault
 * to escape the owner-returned active-context envelope.
 * @param {unknown} host @param {Record<string, unknown>} row @param {string} checkpointIdentity
 * @param {string} candidateIdentity @param {unknown} candidateWriteSet @param {string} wsId
 */
function liveCandidateOutcome(host, row, checkpointIdentity, candidateIdentity, candidateWriteSet, wsId) {
  const hostApi = /** @type {Record<string, Function>} */ (host);
  try {
    const returnedContext = hostApi.get(checkpointIdentity);
    if (!returnedContext) return { outcome: 'contract-mismatch' };
    const context = checkpointContextSnapshot(returnedContext, candidateWriteSet, 'resolveComparison checkpoint context');
    if (!context || !['candidate', 'restoring', 'unsettled'].includes(/** @type {string} */ (context.phase))) {
      return { outcome: 'contract-mismatch' };
    }
    const prestate = context.prestate;
    const prestateIdentity = stateIdentity(wsId, prestate);
    const expectedCheckpointIdentity = deriveCheckpointIdentity({
      target: row.target,
      sequenceIdentity: /** @type {string} */ (row.sequenceIdentity),
      contractHash: /** @type {string} */ (row.contractHash),
      writeSetIdentity: wsId,
      prestateIdentity,
    });
    if (checkpointIdentity !== expectedCheckpointIdentity) return { outcome: 'contract-mismatch' };
    assertHash(context.poststateIdentity, 'resolveComparison checkpoint poststateIdentity');
    assertHash(context.candidateIdentity, 'resolveComparison checkpoint candidateIdentity');
    const expectedCandidateIdentity = deriveCandidateIdentity(
      expectedCheckpointIdentity,
      /** @type {string} */ (context.poststateIdentity),
    );
    if (context.candidateIdentity !== expectedCandidateIdentity || candidateIdentity !== expectedCandidateIdentity) {
      return { outcome: 'contract-mismatch' };
    }
    const record = {
      checkpointIdentity: expectedCheckpointIdentity,
      target: row.target,
      sequenceIdentity: row.sequenceIdentity,
      contractHash: row.contractHash,
      writeSetIdentity: wsId,
      prestateIdentity,
      phase: 'candidate',
      poststateIdentity: context.poststateIdentity,
      candidateIdentity: expectedCandidateIdentity,
    };
    validateCheckpointRecord(record);
    if (context.phase === 'candidate') return { outcome: 'candidate', record };
    return {
      outcome: retainCheckpointUnsettled(hostApi, record, candidateWriteSet)
        ? 'stop-unsettled'
        : 'contract-mismatch',
    };
  } catch {
    return { outcome: 'contract-mismatch' };
  }
}

/**
 * Settle one candidate against its retention decision and gate set. A keep
 * advances the incumbent, releases, and clears the active identities; a non-keep
 * restores the exact prestate first; a restore or release fault records a
 * stop-unsettled event, retains the context, and hard stops without releasing.
 * A learning-governed fault instead returns its identity-paired successor
 * without projection; unavailable context uses admitted open-active quarantine.
 * Every ordinary comparison outcome projects one event and admits its reference.
 * Objective evidence never completes a task.
 * @param {unknown} stateValue @param {unknown} sequenceValue @param {unknown} options
 */
export function resolveComparison(stateValue, sequenceValue, options) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  const args = assertExactRecord(
    options,
    ['host', 'owner', 'decision', 'gateSet', 'candidateIdentity', 'candidateWriteSet'],
    ['tieReviewOutcome'],
    'resolveComparison options',
  );
  validateCandidateWriteSet(args.candidateWriteSet);
  const wsId = writeSetIdentity(args.candidateWriteSet);
  const decision = validateComparisonDecisionRecord(args.decision);
  const set = assertExactRecord(args.gateSet, ['target', 'checkpointIdentity', 'candidateIdentity', 'contractHash', 'gates', 'gateSetIdentity'], [], 'GateSet');
  assertHash(args.candidateIdentity, 'resolveComparison.candidateIdentity');
  validateEvaluationSequences([sequenceValue], 'resolveComparison.sequence context');
  const sequenceInput = /** @type {Record<string, unknown>} */ (sequenceValue);
  assertHash(sequenceInput.sequenceIdentity, 'resolveComparison.sequence.sequenceIdentity');
  const sequences = evaluationSequenceRows(state).map((sequenceRow) => ({ ...sequenceRow }));
  const rowIndex = sequences.findIndex((sequenceRow) => sequenceRow.sequenceIdentity === sequenceInput.sequenceIdentity);
  if (rowIndex === -1) invalid('resolveComparison', 'must target a sequence present in the run state');
  const row = sequences[rowIndex];
  if (canonicalJson(sequenceInput) !== canonicalJson(row)) {
    invalid('resolveComparison', 'sequence context must exactly match the selected run-state row');
  }
  if (row.state !== 'open'
    || Object.hasOwn(row, 'activeCheckpointIdentity')
    || Object.hasOwn(row, 'activeCandidateIdentity')) {
    invalid('resolveComparison', 'selected sequence state must be open without an unresolved active context');
  }
  const expectedSequenceIdentity = deriveSequenceIdentity({
    target: row.target,
    taskKey: /** @type {string} */ (row.taskKey),
    ownerBindingHash: /** @type {string} */ (row.ownerBindingHash),
    planDescriptor: row.planDescriptor,
    registryHash: /** @type {string} */ (row.registryHash),
    contractHash: /** @type {string} */ (row.contractHash),
    bindingIdentity: /** @type {string} */ (row.bindingIdentity),
    baselineCandidateIdentity: /** @type {string} */ (row.baselineCandidateIdentity),
  });
  if (expectedSequenceIdentity !== row.sequenceIdentity) {
    invalid('resolveComparison', 'selected sequence identity must match its recomputed context');
  }
  const expectedTarget = canonicalJson(row.target);
  if (canonicalJson(decision.target) !== expectedTarget) {
    invalid('resolveComparison', 'decision target must match the selected sequence target');
  }
  if (decision.sequenceIdentity !== expectedSequenceIdentity) {
    invalid('resolveComparison', 'decision sequence identity must match the selected sequence');
  }
  if (decision.contractHash !== row.contractHash) {
    invalid('resolveComparison', 'decision contract hash must match the selected sequence contract');
  }
  const { comparisonIdentity, ...decisionWithoutIdentity } = decision;
  if (sha256(canonicalJson(decisionWithoutIdentity)) !== comparisonIdentity) {
    invalid('resolveComparison', 'decision identity must equal the recomputed comparison identity');
  }
  assertCanonicalTargetIdentity(set.target, 'GateSet.target');
  assertHash(set.checkpointIdentity, 'GateSet.checkpointIdentity');
  assertHash(set.candidateIdentity, 'GateSet.candidateIdentity');
  assertHash(set.contractHash, 'GateSet.contractHash');
  assertHash(set.gateSetIdentity, 'GateSet.gateSetIdentity');
  const expectedGateSet = buildGateSet({
    target: set.target,
    checkpointIdentity: /** @type {string} */ (set.checkpointIdentity),
    candidateIdentity: /** @type {string} */ (set.candidateIdentity),
    contractHash: /** @type {string} */ (set.contractHash),
    gates: set.gates,
  });
  if (canonicalJson(expectedGateSet) !== canonicalJson(set)) {
    invalid('resolveComparison', 'gate set identity must equal the recomputed gate set identity');
  }
  if (canonicalJson(set.target) !== expectedTarget) {
    invalid('resolveComparison', 'gate set target must match the selected sequence target');
  }
  if (set.contractHash !== row.contractHash) {
    invalid('resolveComparison', 'gate set contract hash must match the selected sequence contract');
  }
  if (decision.checkpointIdentity !== set.checkpointIdentity) {
    invalid('resolveComparison', 'decision and gate set must bind the same checkpoint identity');
  }
  if (set.candidateIdentity !== args.candidateIdentity) {
    invalid('resolveComparison', 'gate set and request must bind the same candidate identity');
  }
  const checkpointIdentity = /** @type {string} */ (set.checkpointIdentity);
  const unresolvedState = (sequenceState) => {
    const unresolvedRow = {
      ...row,
      state: sequenceState,
      activeCheckpointIdentity: checkpointIdentity,
      activeCandidateIdentity: args.candidateIdentity,
    };
    const nextSequences = sequences.map((sequenceRow, index) => (index === rowIndex ? unresolvedRow : sequenceRow));
    const nextState = withObjectiveArrays(state, { evaluationSequences: nextSequences });
    validateRunState(nextState);
    return nextState;
  };
  const quarantineState = unresolvedState('open');
  const unsettledState = unresolvedState('unsettled');
  const unresolvedOutcome = (outcome) => ({
    outcome,
    stopped: true,
    state: outcome === 'stop-unsettled' ? unsettledState : quarantineState,
  });
  validateCheckpointHost(args.host);
  validateProjectionOwner(args.owner);
  const live = liveCandidateOutcome(
    args.host,
    row,
    checkpointIdentity,
    /** @type {string} */ (args.candidateIdentity),
    args.candidateWriteSet,
    wsId,
  );
  if (live.outcome !== 'candidate') return unresolvedOutcome(live.outcome);
  const record = /** @type {Record<string, unknown>} */ (live.record);
  if (hasUnresolvedLearningGovernance(state, row.target)) {
    const stopGovernedFault = () => {
      const retained = retainCheckpointUnsettled(
        /** @type {Record<string, Function>} */ (args.host),
        record,
        args.candidateWriteSet,
      );
      return unresolvedOutcome(retained ? 'stop-unsettled' : 'contract-mismatch');
    };
    let restored;
    try {
      restored = restoreCheckpoint(args.host, record, args.candidateWriteSet);
    } catch {
      return stopGovernedFault();
    }
    if (restored.phase !== 'restored') return stopGovernedFault();
    try {
      releaseCheckpoint(args.host, restored, args.candidateWriteSet);
    } catch {
      return stopGovernedFault();
    }
    invalid('resolveComparison', 'is sealed: learning-required');
  }
  const observationIdentities = {
    baseline: decision.baselineObservationIdentity,
    incumbent: decision.incumbentObservationIdentity,
    candidate: decision.candidateObservationIdentity,
  };
  const keep = qualifiesForKeep(args.gateSet, /** @type {string} */ (decision.relation), /** @type {string|undefined} */ (args.tieReviewOutcome));

  /** @param {string} decisionKind @param {string|undefined} restorationIdentity */
  const comparisonEvent = (decisionKind, restorationIdentity) => buildObjectiveComparisonEvent({
    target: row.target,
    taskKey: row.taskKey,
    sequenceIdentity: row.sequenceIdentity,
    comparisonIdentity: decision.comparisonIdentity,
    checkpointIdentity,
    contractHash: row.contractHash,
    baselineCandidateIdentity: row.baselineCandidateIdentity,
    incumbentBeforeIdentity: row.incumbentCandidateIdentity,
    candidateIdentity: args.candidateIdentity,
    observationIdentities,
    relation: decision.relation,
    gateSetIdentity: set.gateSetIdentity,
    gateResults: set.gates,
    decision: decisionKind,
    ...(restorationIdentity !== undefined ? { restorationIdentity } : {}),
  });

  /** @param {Record<string, unknown>} nextRow */
  const finishOpen = (outcome, event, nextRow) => {
    const nextSequences = sequences.map((sequenceRow, index) => (index === rowIndex ? nextRow : sequenceRow));
    const staged = withObjectiveArrays(state, { evaluationSequences: nextSequences });
    validateRunState(staged);
    const projection = projectEvent(args.owner, event);
    const nextState = admitComparisonReference(staged, /** @type {string} */ (row.sequenceIdentity), {
      comparisonIdentity: event.comparisonIdentity,
      eventHash: event.eventHash,
      currentRunProjectionIdentity: projection.currentRunProjectionIdentity,
      laneProjectionIdentity: projection.laneProjectionIdentity,
    }, args.owner);
    return { outcome, stopped: false, state: nextState, event, projection };
  };

  // A settle/restore fault or a release fault records a stop-unsettled event,
  // retains the context and active identities, and hard stops without release.
  const stopUnsettled = () => {
    const event = comparisonEvent('stop-unsettled', undefined);
    const unsettledRow = {
      ...row,
      state: 'unsettled',
      activeCheckpointIdentity: checkpointIdentity,
      activeCandidateIdentity: args.candidateIdentity,
    };
    return { ...finishOpen('stop-unsettled', event, unsettledRow), stopped: true };
  };

  if (keep) {
    const kept = keepCheckpoint(args.host, record, args.candidateWriteSet);
    if (kept.phase !== 'kept') return stopUnsettled();
    const event = comparisonEvent('keep', undefined);
    try {
      releaseCheckpoint(args.host, kept, args.candidateWriteSet);
    } catch {
      return stopUnsettled();
    }
    const advancedRow = { ...row, incumbentCandidateIdentity: args.candidateIdentity, state: 'open' };
    delete advancedRow.activeCheckpointIdentity;
    delete advancedRow.activeCandidateIdentity;
    return finishOpen('keep', event, advancedRow);
  }

  const restored = restoreCheckpoint(args.host, record, args.candidateWriteSet);
  if (restored.phase !== 'restored') return stopUnsettled();
  const restorationIdentity = sha256(canonicalJson(restored));
  const event = comparisonEvent('discard', restorationIdentity);
  try {
    releaseCheckpoint(args.host, restored, args.candidateWriteSet);
  } catch {
    return stopUnsettled();
  }
  const clearedRow = { ...row, state: 'open' };
  delete clearedRow.activeCheckpointIdentity;
  delete clearedRow.activeCandidateIdentity;
  return finishOpen('discard', event, clearedRow);
}

// --- Task-scoped closure, rebaseline support, and task boundary -------------

/**
 * Close a settled sequence: build, project, and verify one close event, then
 * remove the row only after the verified projection. An unsettled restoration
 * or context-unavailable active-identity quarantine blocks the close first.
 * @param {unknown} stateValue @param {string} sequenceIdentity @param {unknown} options
 */
export function closeEvaluationSequence(stateValue, sequenceIdentity, options) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  const args = assertExactRecord(options, ['owner', 'reason', 'comparisonEventHashes', 'learningReviewEventHashes'], [], 'closeEvaluationSequence options');
  validateProjectionOwner(args.owner);
  assertHash(sequenceIdentity, 'sequenceIdentity');
  assertEnum(args.reason, CLOSED_EVENT_REASONS, 'closeEvaluationSequence.reason');
  const sequences = evaluationSequenceRows(state);
  const rowIndex = sequences.findIndex((sequenceRow) => sequenceRow.sequenceIdentity === sequenceIdentity);
  if (rowIndex === -1) invalid('closeEvaluationSequence', 'must target a sequence present in the run state');
  const row = sequences[rowIndex];
  const hasActiveContext = Object.hasOwn(row, 'activeCheckpointIdentity')
    || Object.hasOwn(row, 'activeCandidateIdentity');
  if (row.state === 'unsettled') invalid('closeEvaluationSequence', 'an unsettled restoration blocks sequence close');
  if (hasActiveContext) invalid('closeEvaluationSequence', 'an unresolved active context blocks sequence close');
  if (args.reason !== 'hard-stop' && hasUnresolvedLearningGovernance(state, row.target)) {
    invalid('closeEvaluationSequence', 'is sealed: learning-required');
  }
  const event = buildEvaluationSequenceClosedEvent({
    target: row.target,
    taskKey: row.taskKey,
    sequenceIdentity: row.sequenceIdentity,
    contractHash: row.contractHash,
    baselineCandidateIdentity: row.baselineCandidateIdentity,
    finalIncumbentIdentity: row.incumbentCandidateIdentity,
    reason: args.reason,
    comparisonEventHashes: args.comparisonEventHashes,
    learningReviewEventHashes: args.learningReviewEventHashes,
  });
  const projection = projectEvent(args.owner, event);
  const nextSequences = sequences.filter((_, index) => index !== rowIndex);
  const nextState = withObjectiveArrays(state, { evaluationSequences: nextSequences });
  validateRunState(nextState);
  return { state: nextState, event, projection };
}

/**
 * Settle a task boundary: optionally settle a live candidate, project every
 * pending comparison, close the sequence with a task-completion or task-block
 * reason after a fresh dual-surface verify, and return a state that is ready for
 * the coordinator's lane transition. This never invokes a lane transition and
 * permits no post-task optimization: the row is removed with no continuation.
 * @param {unknown} stateValue @param {unknown} options
 */
export function settleTaskBoundary(stateValue, options) {
  const state = /** @type {Record<string, unknown>} */ (validateRunState(stateValue));
  const args = assertExactRecord(
    options,
    ['host', 'owner', 'target', 'taskKey', 'reason', 'comparisonEventHashes', 'learningReviewEventHashes'],
    ['settle'],
    'settleTaskBoundary options',
  );
  validateCheckpointHost(args.host);
  validateProjectionOwner(args.owner);
  const canonical = canonicalTarget(args.target);
  assertTaskKeyString(args.taskKey, 'settleTaskBoundary.taskKey');
  if (args.reason !== 'task-completed' && args.reason !== 'task-blocked') invalid('settleTaskBoundary.reason', 'must be task-completed or task-blocked');
  if (hasUnresolvedLearningGovernance(state, canonical)) {
    invalid('settleTaskBoundary', 'is sealed: learning-required');
  }
  const canonicalJson_ = canonicalJson(canonical);
  const rowIndex = evaluationSequenceRows(state).findIndex((sequenceRow) => (
    canonicalJson(sequenceRow.target) === canonicalJson_ && sequenceRow.taskKey === args.taskKey
  ));
  if (rowIndex === -1) invalid('settleTaskBoundary', 'must target a sequence present in the run state');
  const sequenceIdentity = /** @type {string} */ (evaluationSequenceRows(state)[rowIndex].sequenceIdentity);

  let workingState = state;
  /** @type {unknown} */
  let comparison;
  if (Object.hasOwn(args, 'settle')) {
    const settleArgs = assertExactRecord(args.settle, ['decision', 'gateSet', 'candidateIdentity', 'candidateWriteSet'], ['tieReviewOutcome'], 'settleTaskBoundary.settle');
    comparison = resolveComparison(workingState, evaluationSequenceRows(workingState)[rowIndex], {
      host: args.host,
      owner: args.owner,
      decision: settleArgs.decision,
      gateSet: settleArgs.gateSet,
      candidateIdentity: settleArgs.candidateIdentity,
      candidateWriteSet: settleArgs.candidateWriteSet,
      ...(Object.hasOwn(settleArgs, 'tieReviewOutcome') ? { tieReviewOutcome: settleArgs.tieReviewOutcome } : {}),
    });
    workingState = /** @type {Record<string, unknown>} */ (comparison.state);
    if (comparison.stopped) {
      return { state: workingState, readyForLaneTransition: false, stopped: true, comparison };
    }
  }

  const closed = closeEvaluationSequence(workingState, sequenceIdentity, {
    owner: args.owner,
    reason: args.reason,
    comparisonEventHashes: args.comparisonEventHashes,
    learningReviewEventHashes: args.learningReviewEventHashes,
  });
  return {
    state: closed.state,
    readyForLaneTransition: true,
    stopped: false,
    close: { event: closed.event, projection: closed.projection },
    ...(comparison !== undefined ? { comparison } : {}),
  };
}

// --- Deterministic audit summary renderer -----------------------------------

/** @param {unknown} value @param {(value:string,label:string)=>void} validate @param {string} label */
function sortedUniqueStrings(value, validate, label) {
  const rows = assertDenseDataArray(value, label);
  rows.forEach((entry, index) => validate(/** @type {string} */ (entry), `${label}[${index}]`));
  return [...new Set(/** @type {string[]} */ (rows))].sort(compareUtf8);
}

/** @param {unknown} value @param {string} label */
function shortTextArray(value, label) {
  const rows = assertDenseDataArray(value, label);
  if (rows.length > 16) invalid(label, 'must contain at most 16 rows');
  rows.forEach((entry, index) => assertShortText(entry, `${label}[${index}]`));
  return [.../** @type {string[]} */ (rows)];
}

/** Build an eventHash → validated event map from the fresh surfaces. @param {unknown} currentRunRecords @param {unknown} laneEventLines */
function surfaceEventIndex(currentRunRecords, laneEventLines) {
  /** @type {Map<string, Record<string, unknown>>} */
  const index = new Map();
  const admit = (event) => {
    if (!isPlainRecord(event)) return;
    const record = /** @type {Record<string, unknown>} */ (event);
    if (typeof record.eventHash !== 'string') return;
    const { eventHash, ...rest } = record;
    let recomputed;
    try {
      recomputed = sha256(canonicalJson(rest));
    } catch {
      return;
    }
    if (recomputed !== eventHash) return;
    try {
      validateEvent(record);
    } catch {
      return;
    }
    index.set(/** @type {string} */ (eventHash), record);
  };
  for (const candidate of currentRunProjectionCandidates(currentRunRecords)) admit(candidate.event);
  for (const candidate of laneProjectionCandidates(laneEventLines)) admit(candidate.event);
  return index;
}

/** @param {Record<string, unknown>} event */
function auditReasonForEvent(event) {
  if (event.type === 'objective-comparison') return /** @type {string} */ (event.decision);
  if (event.type === 'evaluation-sequence-closed') return /** @type {string} */ (event.reason);
  return /** @type {string} */ (event.outcome);
}

/**
 * Render the exact AuditSummary from bounded invocation state plus freshly
 * acquired current-run and lane history. Objective/learning cycle reasons are
 * read from the reacquired surface event; objective-sequence rows are provided
 * only for actually-created sequences. Writes no file and creates no ledger.
 * @param {unknown} stateValue @param {unknown} history @param {unknown} input
 */
export function renderAuditSummary(stateValue, history, input) {
  validateRunState(stateValue);
  const surfaces = assertExactRecord(history, ['currentRunRecords', 'laneEventLines'], [], 'audit history');
  const fields = assertExactRecord(
    input,
    ['tasksAttempted', 'tasksCompleted', 'tasksSkipped', 'tasksBlocked', 'cycles', 'objectiveSequences', 'filesChanged', 'verificationOutcomes', 'autonomousDecisions', 'remainingRisks'],
    [],
    'audit input',
  );
  const eventIndex = surfaceEventIndex(surfaces.currentRunRecords, surfaces.laneEventLines);

  const cycleRows = assertDenseDataArray(fields.cycles, 'audit.cycles');
  const cycles = cycleRows.map((cycleValue, index) => {
    const label = `audit.cycles[${index}]`;
    assertEnum(assertRecord(cycleValue, label).kind, AUDIT_CYCLE_KINDS, `${label}.kind`);
    const kind = /** @type {string} */ (/** @type {Record<string, unknown>} */ (cycleValue).kind);
    if (kind === 'recovery') {
      const row = assertExactRecord(cycleValue, ['target', 'kind', 'reason'], [], label);
      assertCanonicalTargetIdentity(row.target, `${label}.target`);
      assertShortText(row.reason, `${label}.reason`);
      return { target: row.target, kind: 'recovery', reason: row.reason };
    }
    const row = assertExactRecord(cycleValue, ['target', 'kind', 'eventHash'], [], label);
    assertCanonicalTargetIdentity(row.target, `${label}.target`);
    assertHash(row.eventHash, `${label}.eventHash`);
    const event = eventIndex.get(/** @type {string} */ (row.eventHash));
    if (!event) invalid(`${label}.eventHash`, 'must match a freshly reacquired surface event');
    if (kind === 'learning' && event.type !== 'learning-review') invalid(`${label}.eventHash`, 'must match a learning-review event');
    if (kind === 'objective' && event.type !== 'objective-comparison' && event.type !== 'evaluation-sequence-closed') {
      invalid(`${label}.eventHash`, 'must match an objective-comparison or sequence-closed event');
    }
    if (canonicalJson(canonicalTarget(event.target)) !== canonicalJson(row.target)) invalid(`${label}.target`, 'must match the surface event target');
    return { target: row.target, kind, reason: auditReasonForEvent(event), eventHash: row.eventHash };
  });

  const objectiveRows = assertDenseDataArray(fields.objectiveSequences, 'audit.objectiveSequences');
  const objectiveSequences = objectiveRows.map((rowValue, index) => {
    const label = `audit.objectiveSequences[${index}]`;
    const withClose = Object.hasOwn(assertRecord(rowValue, label), 'closeEventHash');
    const row = withClose
      ? assertExactRecord(rowValue, ['target', 'taskKey', 'sequenceIdentity', 'contractHash', 'outcome', 'closeEventHash'], [], label)
      : assertExactRecord(rowValue, ['target', 'taskKey', 'sequenceIdentity', 'contractHash', 'outcome'], [], label);
    assertCanonicalTargetIdentity(row.target, `${label}.target`);
    assertTaskKeyString(row.taskKey, `${label}.taskKey`);
    assertHash(row.sequenceIdentity, `${label}.sequenceIdentity`);
    assertHash(row.contractHash, `${label}.contractHash`);
    assertEnum(row.outcome, AUDIT_OBJECTIVE_OUTCOMES, `${label}.outcome`);
    /** @type {Record<string, unknown>} */
    const result = { target: row.target, taskKey: row.taskKey, sequenceIdentity: row.sequenceIdentity, contractHash: row.contractHash, outcome: row.outcome };
    if (withClose) {
      assertHash(row.closeEventHash, `${label}.closeEventHash`);
      const event = eventIndex.get(/** @type {string} */ (row.closeEventHash));
      if (!event || event.type !== 'evaluation-sequence-closed') invalid(`${label}.closeEventHash`, 'must match a freshly reacquired close event');
      result.closeEventHash = row.closeEventHash;
    }
    return result;
  });

  return {
    tasksAttempted: sortedUniqueStrings(fields.tasksAttempted, assertTaskKeyString, 'audit.tasksAttempted'),
    tasksCompleted: sortedUniqueStrings(fields.tasksCompleted, assertTaskKeyString, 'audit.tasksCompleted'),
    tasksSkipped: sortedUniqueStrings(fields.tasksSkipped, assertTaskKeyString, 'audit.tasksSkipped'),
    tasksBlocked: sortedUniqueStrings(fields.tasksBlocked, assertTaskKeyString, 'audit.tasksBlocked'),
    cycles,
    objectiveSequences,
    filesChanged: sortedUniqueStrings(fields.filesChanged, assertNormalizedWorkspacePath, 'audit.filesChanged'),
    verificationOutcomes: shortTextArray(fields.verificationOutcomes, 'audit.verificationOutcomes'),
    autonomousDecisions: shortTextArray(fields.autonomousDecisions, 'audit.autonomousDecisions'),
    remainingRisks: shortTextArray(fields.remainingRisks, 'audit.remainingRisks'),
  };
}

/** @param {unknown} error */
export function boundedErrorJson(error) {
  const candidateCode = error && typeof error === 'object' && 'code' in error
    ? error.code
    : null;
  const code = typeof candidateCode === 'string' && [
    'recovery-error',
    'recovery-command-unsupported',
    'recovery-resource-limit',
    'recovery-canonical-json',
    'recovery-byte-envelope',
    'recovery-unsafe-workspace',
    'recovery-invalid-request',
  ].includes(candidateCode)
    ? candidateCode
    : 'recovery-error';
  let message = error instanceof Error ? error.message : String(error);
  try {
    assertUnicodeScalarString(message, 'error message');
  } catch {
    message = 'Recovery command failed.';
  }
  const serialize = (candidate) => canonicalJson({ error: { code, message: candidate } });
  let output = serialize(message);
  if (Buffer.byteLength(output) <= MAX_ERROR_JSON_BYTES) return output;

  const scalars = Array.from(message);
  let low = 0;
  let high = scalars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = serialize(`${scalars.slice(0, middle).join('')}...`);
    if (Buffer.byteLength(candidate) <= MAX_ERROR_JSON_BYTES) low = middle;
    else high = middle - 1;
  }
  output = serialize(`${scalars.slice(0, low).join('')}...`);
  return output;
}

/** @param {unknown} error */
function fixedCliError(error) {
  const detail = error instanceof Error ? error.message : '';
  let code = 'recovery-invalid-request';
  let message = 'Recovery request is invalid.';
  if (/unknown command is not supported/.test(detail)) {
    code = 'recovery-command-unsupported';
    message = 'Recovery command is not supported.';
  } else if (/resource limit|individual source body|aggregate inspection body|retained descriptor/.test(detail)) {
    code = 'recovery-resource-limit';
    message = 'Recovery request exceeds a fixed resource limit.';
  } else if (/canonical JSON|strict UTF-8|canonical JSON representation|one canonical JSON value/.test(detail)) {
    code = 'recovery-canonical-json';
    message = 'Recovery request must use canonical JSON.';
  } else if (/byte envelope|base64|RFC4648/.test(detail)) {
    code = 'recovery-byte-envelope';
    message = 'Recovery request contains an invalid canonical byte envelope.';
  } else if (/workspace|symbolic link|path escapes|file identity/.test(detail)) {
    code = 'recovery-unsafe-workspace';
    message = 'Recovery workspace evidence could not be acquired safely.';
  } else if (/unknown field/.test(detail)) {
    message = 'Recovery request contains an unknown field.';
  }
  const publicError = new Error(message);
  Object.defineProperty(publicError, 'code', { value: code, enumerable: false });
  return publicError;
}

function runMain() {
  try {
    if (process.argv.length !== 3) invalid('argv', 'requires exactly one command');
    const request = parseCanonicalJsonBytes(readCliRequest(), 'CLI request');
    process.stdout.write(`${JSON.stringify(runCommand(process.argv[2], request))}\n`);
  } catch (error) {
    process.stderr.write(boundedErrorJson(fixedCliError(error)));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runMain();

export const limits = Object.freeze({ items: MAX_PACKET_ITEMS, bytes: MAX_PACKET_BYTES });
