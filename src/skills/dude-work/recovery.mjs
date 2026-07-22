// @ts-check

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFrontmatterScalars,
  parseSpecIdentity,
  resolveSpecIdentity,
} from '../dude-engine/lib/feature-identity.mjs';
import { parseTasks } from '../dude-engine/lib/tasks.mjs';
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

/** @param {unknown} value @param {string} label @returns {unknown[]} */
function assertDenseDataArray(value, label) {
  if (!Array.isArray(value)) invalid(label, 'must be an array');
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
  const parsed = parseTasks(captured.text, { path: expectedPath });
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
    history: parsed.history?.suffix || '',
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
 */
function normalizeDefinitionPlan(value, target, ownerIdeaPath, verifiedTaskKey, acquisitionStatus) {
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
  const body = { path: plan.path, planDescriptor, ownerBindingHash, registryHash };
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
 * @param {{ownerDiagnostics?:unknown[],budget?:{used:number},workspaceCharged?:boolean,capturesCharged?:boolean,policyMode?:string,definitionPlanStatus?:string}} [context]
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
  const definitionPlan = policyMode === 'autonomous'
    ? normalizeDefinitionPlan(raw.definitionPlan, target, owner.ownerIdeaPath, lane.verifiedTaskKey, context.definitionPlanStatus)
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
 * Fail-soft read of the sibling plan.md under the autonomous policy. Oversize is a
 * soft overflow, an aggregate-limit refusal still throws, and a missing or unstable
 * plan surfaces as a status rather than an exception.
 * @param {string} root @param {string} relativePath @param {{used:number}} budget
 * @returns {{bytes:Buffer}|{bytes:null,status:string}}
 */
function readPlanFile(root, relativePath, budget) {
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
    chargeBodyLength(byteLength, 'rawInputs.definitionPlan workspace file source body', budget);
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

/** @param {unknown} value @param {unknown} [dependenciesValue] @param {boolean} [transport] @param {string} [policyModeOverride] */
function acquireInspection(value, dependenciesValue, transport = false, policyModeOverride = undefined) {
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
  if (policyMode === 'autonomous') {
    const planPath = `${specPath.slice(0, -'spec.md'.length)}plan.md`;
    const planRead = readPlanFile(/** @type {string} */ (input.root), planPath, budget);
    definitionPlan = { path: planPath, bytes: planRead.bytes };
    definitionPlanStatus = 'status' in planRead ? planRead.status : undefined;
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
    target,
    inspection: buildInspection(target, collectEvidenceInternal(target, rawInputs, dependencies, {
      ownerDiagnostics: capturedIdeas.diagnostics,
      budget,
      workspaceCharged: true,
      capturesCharged: transport,
      policyMode,
      definitionPlanStatus,
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

/** @param {unknown} value */
export function validateRunState(value) {
  const state = assertExactRecord(
    value,
    ['policy', 'overallUsed', 'recoveryUsed', 'pending', 'completed'],
    ['evaluationSequences', 'learningReviewRefs'],
    'RunState',
  );
  const policy = assertExactRecord(
    state.policy,
    ['overall', 'recovery', 'recover', 'untilBlocked', 'parallel', 'mode'],
    [],
    'RunState.policy',
  );
  validateBudget(policy.overall, 'RunState.policy.overall');
  validateBudget(policy.recovery, 'RunState.policy.recovery');
  if (typeof policy.recover !== 'boolean') invalid('RunState.policy.recover', 'must be a boolean');
  if (typeof policy.untilBlocked !== 'boolean') invalid('RunState.policy.untilBlocked', 'must be a boolean');
  if (policy.parallel !== 1) invalid('RunState.policy.parallel', 'must be the literal safe integer 1');
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
    if (approachHash({ action: record.action, materialInputs: record.materialInputs }) !== record.approachHash) {
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
  if (policy.overall !== 'unlimited' && state.overallUsed > policy.overall) {
    invalid('RunState.overallUsed', 'exceeds the overall budget');
  }
  if (state.overallUsed !== pending.length + completed.length) {
    invalid('RunState.overallUsed', 'must equal pending plus completed attempts');
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

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function comparePending(left, right) {
  return compareUtf8(targetKey(left.target), targetKey(right.target))
    || compareUtf8(/** @type {string} */ (left.evidenceHash), /** @type {string} */ (right.evidenceHash))
    || compareUtf8(/** @type {string} */ (left.approachHash), /** @type {string} */ (right.approachHash));
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
function authorizeInspectedAttempt(state, target, inspection, assessmentValue, mode) {
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
  const candidateApproachHash = approachHash({ action, materialInputs });

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
  if (assessment.equivalence === 'same' || assessment.equivalence === 'equivalent') {
    return authorizationRefusal(state, 'no-progress');
  }
  const completed = /** @type {Record<string, unknown>[]} */ (state.completed);
  const resultPairs = new Set();
  for (const entry of completed) {
    if (entry.evidenceHash !== inspection.evidenceHash) continue;
    const pair = `${entry.evidenceHash}:${entry.resultHash}`;
    if (resultPairs.has(pair)) return authorizationRefusal(state, 'prior-no-progress');
    resultPairs.add(pair);
  }
  if (completed.some((entry) => (
    entry.evidenceHash === inspection.evidenceHash && entry.approachHash === candidateApproachHash
  ))) return authorizationRefusal(state, 'no-progress');

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
  const nextState = {
    policy: { ...policy },
    overallUsed: /** @type {number} */ (state.overallUsed) + 1,
    recoveryUsed: nextRecoveryUsed,
    pending: nextPending,
    completed: completed.map((entry) => ({ ...entry })),
  };
  // Carry forward the optional objective arrays unchanged and only when present,
  // so guarded and feature-004 output stays byte-identical (both absent).
  if (Object.hasOwn(state, 'evaluationSequences')) nextState.evaluationSequences = state.evaluationSequences;
  if (Object.hasOwn(state, 'learningReviewRefs')) nextState.learningReviewRefs = state.learningReviewRefs;
  validateRunState(nextState);
  return { authorized: true, reason: 'authorized', state: nextState };
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
  const repeatedResult = completed.some((entry) => (
    entry.evidenceHash === input.evidenceHash && entry.resultHash === normalizedHash
  ));
  const nextState = {
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
  };
  validateRunState(nextState);
  let reason = normalized.outcome;
  if (repeatedResult) reason = 'no-progress';
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
 * authorization is pending and keeps `policy.parallel === 1`.
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
    if (!['--max', '--recover-on-block', '--recovery-cycles', '--until', '--parallel', '--policy'].includes(option)) {
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
    } else {
      parsePositiveOption(token, option, false);
    }
  }
  if (seen.has('--recovery-cycles') && !recover) {
    invalid('--recovery-cycles', 'requires --recover-on-block');
  }
  if (recover && untilBlocked) invalid('options', 'cannot combine recovery with --until blocked');
  if (untilBlocked && !explicitMax) overall = 25;
  const policy = { overall, recovery, recover, untilBlocked, parallel: 1, mode };
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
  if (!['inspect', 'authorize', 'complete'].includes(command)) invalid('unknown command', 'is not supported');
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
      [],
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
    );
    return { inspection, authorization };
  }
  const request = assertExactRecord(requestValue, ['state', 'input'], [], 'complete request');
  return { completion: completeAttempt(request.state, request.input) };
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
  const context = hostApi.get(id);
  if (!context || /** @type {Record<string, unknown>} */ (context).phase !== 'captured') {
    invalid('checkpoint', 'host context must be present and captured');
  }
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
  hostApi.setPhase(id, 'restoring');
  try {
    hostApi.restore(id);
  } catch {
    return restoreFault();
  }
  let fresh;
  try {
    fresh = hostApi.probe(id);
  } catch {
    return restoreFault();
  }
  validateFileStateDescriptors(fresh, candidateWriteSet, 'restoration');
  if (stateIdentity(/** @type {string} */ (record.writeSetIdentity), fresh) !== record.prestateIdentity) {
    return restoreFault();
  }
  hostApi.setPhase(id, 'restored');
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
 * never released. A release fault retains the entry as unsettled and hard stops.
 * @param {unknown} host @param {unknown} recordValue @param {unknown} candidateWriteSet
 */
export function releaseCheckpoint(host, recordValue, candidateWriteSet) {
  validateCheckpointHost(host);
  const hostApi = /** @type {Record<string, Function>} */ (host);
  const record = /** @type {Record<string, unknown>} */ (validateCheckpointRecord(recordValue));
  const id = /** @type {string} */ (record.checkpointIdentity);
  validateCandidateWriteSet(candidateWriteSet);
  const context = hostApi.get(id);
  if (!context) invalid('checkpoint', 'release requires a present host context');
  const phase = /** @type {string} */ (/** @type {Record<string, unknown>} */ (context).phase);
  if (phase === 'candidate' || phase === 'restoring' || phase === 'unsettled') {
    invalid('checkpoint', 'pending or unsettled context is never released');
  }
  const wsId = /** @type {string} */ (record.writeSetIdentity);
  const fresh = hostApi.probe(id);
  validateFileStateDescriptors(fresh, candidateWriteSet, 'release');
  const freshIdentity = stateIdentity(wsId, fresh);
  if (phase === 'kept') {
    if (freshIdentity !== record.poststateIdentity) {
      hostApi.setPhase(id, 'unsettled');
      invalid('checkpoint', 'a kept context must still equal the evaluated candidate before release');
    }
  } else if (phase === 'restored') {
    if (freshIdentity !== record.prestateIdentity) {
      hostApi.setPhase(id, 'unsettled');
      invalid('checkpoint', 'a restored context must equal the exact prestate before release');
    }
  } else if (phase === 'captured') {
    if (freshIdentity !== record.prestateIdentity) {
      invalid('checkpoint', 'a changed captured context must be restored before release');
    }
  } else {
    invalid('checkpoint', 'pending or unsettled context is never released');
  }
  try {
    hostApi.release(id);
  } catch {
    hostApi.setPhase(id, 'unsettled');
    invalid('checkpoint', 'context release failed and was retained as unsettled');
  }
  return checkpointRecordWithPhase(record, phase);
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
  const context = hostApi.get(id);
  let outcome = 'invalid';
  if (context) {
    const phase = /** @type {string} */ (/** @type {Record<string, unknown>} */ (context).phase);
    if (phase === 'unsettled') {
      outcome = 'unsettled';
    } else if (phase === 'candidate' || phase === 'kept') {
      const fresh = hostApi.probe(id);
      validateFileStateDescriptors(fresh, candidateWriteSet, 'checkpoint gate probe');
      const poststateIdentity = stateIdentity(/** @type {string} */ (fields.writeSetIdentity), fresh);
      const prestate = /** @type {Record<string, unknown>} */ (context).prestate;
      validateFileStateDescriptors(prestate, candidateWriteSet, 'checkpoint gate prestate');
      const protectedPaths = new Set(
        /** @type {string[]} */ (/** @type {Record<string, unknown>} */ (candidateWriteSet).protectedPaths),
      );
      const protectedUnchanged = canonicalJson(protectedSubset(fresh, protectedPaths))
        === canonicalJson(protectedSubset(prestate, protectedPaths));
      if (poststateIdentity === fields.poststateIdentity
        && /** @type {Record<string, unknown>} */ (context).candidateIdentity === fields.candidateIdentity
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
  const next = {
    policy: state.policy,
    overallUsed: state.overallUsed,
    recoveryUsed: state.recoveryUsed,
    pending: state.pending,
    completed: state.completed,
  };
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
 * Reconstruct the live candidate CheckpointRecord from the host context. The
 * host exposes bytes-free prestate descriptors and the poststate/candidate
 * identities; the sequence supplies the target, contract, and identity.
 * @param {unknown} host @param {Record<string, unknown>} row @param {string} checkpointIdentity @param {unknown} candidateWriteSet
 */
function liveCandidateRecord(host, row, checkpointIdentity, candidateWriteSet) {
  const context = /** @type {Record<string, unknown>} */ (/** @type {Record<string, Function>} */ (host).get(checkpointIdentity));
  if (!context) invalid('resolveComparison', 'requires a live candidate checkpoint context');
  if (context.phase !== 'candidate') invalid('resolveComparison', 'requires a candidate-phase checkpoint context');
  const wsId = writeSetIdentity(candidateWriteSet);
  const record = {
    checkpointIdentity,
    target: row.target,
    sequenceIdentity: row.sequenceIdentity,
    contractHash: row.contractHash,
    writeSetIdentity: wsId,
    prestateIdentity: stateIdentity(wsId, context.prestate),
    phase: 'candidate',
    poststateIdentity: context.poststateIdentity,
    candidateIdentity: context.candidateIdentity,
  };
  validateCheckpointRecord(record);
  return record;
}

/**
 * Settle one candidate against its retention decision and gate set. A keep
 * advances the incumbent, releases, and clears the active identities; a non-keep
 * restores the exact prestate first; a restore or release fault records a
 * stop-unsettled event, retains the context, and hard stops without releasing.
 * Every outcome projects one comparison event and admits its reference.
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
  validateCheckpointHost(args.host);
  validateProjectionOwner(args.owner);
  validateCandidateWriteSet(args.candidateWriteSet);
  const decision = validateComparisonDecisionRecord(args.decision);
  const set = assertExactRecord(args.gateSet, ['target', 'checkpointIdentity', 'candidateIdentity', 'contractHash', 'gates', 'gateSetIdentity'], [], 'GateSet');
  assertHash(args.candidateIdentity, 'resolveComparison.candidateIdentity');
  const sequenceInput = assertRecord(sequenceValue, 'resolveComparison.sequence');
  assertHash(sequenceInput.sequenceIdentity, 'resolveComparison.sequence.sequenceIdentity');
  const sequences = evaluationSequenceRows(state).map((sequenceRow) => ({ ...sequenceRow }));
  const rowIndex = sequences.findIndex((sequenceRow) => sequenceRow.sequenceIdentity === sequenceInput.sequenceIdentity);
  if (rowIndex === -1) invalid('resolveComparison', 'must target a sequence present in the run state');
  const row = sequences[rowIndex];
  const checkpointIdentity = /** @type {string} */ (set.checkpointIdentity);
  const record = liveCandidateRecord(args.host, row, checkpointIdentity, args.candidateWriteSet);
  if (record.candidateIdentity !== args.candidateIdentity) invalid('resolveComparison', 'candidate identity must match the live context');
  if (set.candidateIdentity !== args.candidateIdentity) invalid('resolveComparison', 'the gate set candidate identity must match the live context');
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
 * blocks the close and keeps the sequence.
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
  if (row.state === 'unsettled') invalid('closeEvaluationSequence', 'an unsettled restoration blocks sequence close');
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
    comparison = resolveComparison(workingState, { sequenceIdentity }, {
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
