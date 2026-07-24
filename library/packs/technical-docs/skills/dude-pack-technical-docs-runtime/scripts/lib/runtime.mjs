import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as FS_CONSTANTS,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse as parsePath,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { isDeepStrictEqual, TextDecoder } from "node:util";

export const SCHEMA_VERSION = 2;

export const EXIT_CODES = Object.freeze({
  FAILED_GATE: 1,
  INVALID_INPUT: 2,
  EMPTY_INPUT: 3,
});

/** Error carrying a stable machine code and CLI exit status. */
export class RuntimeError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "RuntimeError";
    this.code = code;
    this.exitCode = options.exitCode ?? EXIT_CODES.INVALID_INPUT;
    if (options.path !== undefined) this.path = options.path;
    if (options.line !== undefined) this.line = options.line;
    if (options.details !== undefined) this.details = options.details;
  }
}

/** Throw a standard runtime error without requiring callers to parse text. */
export function fail(code, message, options) {
  throw new RuntimeError(code, message, options);
}

/** Return a deterministic diagnostic object for a caught error. */
export function errorDiagnostic(error) {
  if (error instanceof RuntimeError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
      ...(error.line === undefined ? {} : { line: error.line }),
    };
  }
  return { code: "unexpected-error", message: error instanceof Error ? error.message : String(error) };
}

/** Map a caught error to one of the runtime CLI exit statuses. */
export function exitCodeForError(error) {
  return error instanceof RuntimeError ? error.exitCode : EXIT_CODES.INVALID_INPUT;
}

/** Require a plain, non-array object. */
export function assertPlainRecord(value, options = {}) {
  const name = options.name ?? "value";
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("invalid-record", `${name} must be a plain object`);
  }
  return value;
}

/** Require a plain object containing only the declared own fields. */
export function assertClosedRecord(value, options = {}) {
  const name = options.name ?? "value";
  assertPlainRecord(value, { name });

  const required = options.required ?? [];
  const optional = options.optional ?? [];
  const allowed = new Set([...required, ...optional]);
  for (const field of required) {
    if (!Object.hasOwn(value, field)) fail("missing-field", `${name} is missing required field ${JSON.stringify(field)}`);
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail("unknown-field", `${name} contains unknown field ${JSON.stringify(field)}`);
  }
  return value;
}

/** Require an array with every index present and optional length bounds. */
export function assertDenseArray(value, options = {}) {
  const name = options.name ?? "value";
  if (!Array.isArray(value)) fail("invalid-array", `${name} must be an array`);
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) fail("sparse-array", `${name} must not contain a hole at index ${index}`);
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    fail("array-too-short", `${name} must contain at least ${options.minLength} item(s)`);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    fail("array-too-long", `${name} must contain at most ${options.maxLength} item(s)`);
  }
  return value;
}

/** Require a closed schema-version-2 root record. */
export function assertVersion2Record(value, options = {}) {
  const record = assertClosedRecord(value, {
    name: options.name,
    required: ["schemaVersion", ...(options.required ?? [])],
    optional: options.optional,
  });
  if (record.schemaVersion !== SCHEMA_VERSION) {
    fail("unsupported-schema-version", `${options.name ?? "value"}.schemaVersion must be ${SCHEMA_VERSION}`);
  }
  return record;
}

/** Reject duplicate identities selected from a dense record array. */
export function assertUniqueIdentities(records, selector = (record) => record.id, options = {}) {
  assertDenseArray(records, { name: options.name ?? "records" });
  const seen = new Map();
  for (let index = 0; index < records.length; index++) {
    const identity = selector(records[index], index);
    if (typeof identity !== "string" || identity.length === 0) {
      fail("invalid-identity", `${options.identityName ?? "identity"} at index ${index} must be a nonempty string`);
    }
    if (seen.has(identity)) {
      fail("duplicate-identity", `duplicate ${options.identityName ?? "identity"} ${JSON.stringify(identity)}`, {
        details: { firstIndex: seen.get(identity), duplicateIndex: index },
      });
    }
    seen.set(identity, index);
  }
  return records;
}

/** Parse a canonical decimal safe integer inside an inclusive range. */
export function parseCanonicalInteger(raw, options = {}) {
  const name = options.name ?? "value";
  if (typeof raw !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    fail("invalid-integer", `${name} must be a canonical decimal integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail("invalid-integer", `${name} must be a safe integer`);
  if (options.min !== undefined && value < options.min) fail("integer-out-of-range", `${name} must be at least ${options.min}`);
  if (options.max !== undefined && value > options.max) fail("integer-out-of-range", `${name} must be at most ${options.max}`);
  return value;
}

/** Parse the contract's canonical decimal form inside an inclusive range. */
export function parseCanonicalDecimal(raw, options = {}) {
  const name = options.name ?? "value";
  if (typeof raw !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{0,5}[1-9])?$/.test(raw)) {
    fail("invalid-decimal", `${name} must be a canonical decimal with at most six fractional digits`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) fail("invalid-decimal", `${name} must be finite`);
  if (options.min !== undefined && value < options.min) fail("decimal-out-of-range", `${name} must be at least ${options.min}`);
  if (options.max !== undefined && value > options.max) fail("decimal-out-of-range", `${name} must be at most ${options.max}`);
  return value;
}

function validateOrdinal(value, pattern, prefixes, options = {}) {
  const name = options.name ?? "identity";
  if (typeof value !== "string") fail("invalid-identity", `${name} must be a string`);
  const match = value.match(pattern);
  if (match === null) fail("invalid-identity", `${name} has an invalid canonical form`);
  const prefix = match[1];
  if (match[2].length > 16) fail("invalid-identity", `${name} ordinal must be a positive safe integer`);
  const ordinal = BigInt(match[2]);
  if (ordinal < 1n || ordinal > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("invalid-identity", `${name} ordinal must be a positive safe integer`);
  }
  const width = options.exactWidth ?? Math.max(3, String(ordinal).length);
  if (match[2] !== String(ordinal).padStart(width, "0")) {
    fail("invalid-identity", `${name} has noncanonical ordinal padding`);
  }
  if (!prefixes.includes(prefix)) fail("invalid-identity", `${name} has an invalid prefix`);
  return Object.freeze({ prefix, ordinal: Number(ordinal) });
}

/** Validate one lowercase SHA-256 digest. */
export function validateDigest(value, options = {}) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    fail("invalid-digest", `${options.name ?? "digest"} must be exactly 64 lowercase hexadecimal characters`);
  }
  return value;
}

/** Validate one canonical SourceId and return it unchanged. */
export function validateSourceId(value, options = {}) {
  validateOrdinal(value, /^(S)([0-9]{3,})$/, ["S"], { name: options.name ?? "SourceId" });
  return value;
}

/** Validate one canonical C, E, or R UnitId and return it unchanged. */
export function validateUnitId(value, options = {}) {
  validateOrdinal(value, /^([CER])([0-9]{3,})$/, ["C", "E", "R"], { name: options.name ?? "UnitId" });
  return value;
}

/** Validate one canonical unit-local EvidenceId and return it unchanged. */
export function validateEvidenceId(value, options = {}) {
  const name = options.name ?? "EvidenceId";
  if (typeof value !== "string") fail("invalid-identity", `${name} must be a string`);
  const separator = value.lastIndexOf("-F");
  if (separator === -1) fail("invalid-identity", `${name} has an invalid canonical form`);
  validateUnitId(value.slice(0, separator), { name: `${name} unit` });
  validateOrdinal(`F${value.slice(separator + 2)}`, /^(F)([0-9]{3})$/, ["F"], { name: `${name} finding`, exactWidth: 3 });
  return value;
}

function validateCount(value, minimum, name, code) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(code, `${name} must be a safe integer of at least ${minimum}`);
  return value;
}

/** Validate a positive one-based Line value. */
export function validateLine(value, options = {}) {
  return validateCount(value, 1, options.name ?? "line", "invalid-line");
}

/** Validate a nonnegative ByteCount value. */
export function validateByteCount(value, options = {}) {
  return validateCount(value, 0, options.name ?? "byte count", "invalid-byte-count");
}

/** Validate a nonnegative TokenCount value. */
export function validateTokenCount(value, options = {}) {
  return validateCount(value, 0, options.name ?? "token count", "invalid-token-count");
}

/** Compare UnitIds by prefix rank and numeric ordinal. */
export function compareUnitIds(left, right) {
  const leftParts = validateOrdinal(left, /^([CER])([0-9]{3,})$/, ["C", "E", "R"], { name: "left UnitId" });
  const rightParts = validateOrdinal(right, /^([CER])([0-9]{3,})$/, ["C", "E", "R"], { name: "right UnitId" });
  const rank = { C: 0, E: 1, R: 2 };
  if (rank[leftParts.prefix] !== rank[rightParts.prefix]) return rank[leftParts.prefix] < rank[rightParts.prefix] ? -1 : 1;
  return leftParts.ordinal === rightParts.ordinal ? 0 : leftParts.ordinal < rightParts.ordinal ? -1 : 1;
}

/** Compare EvidenceIds by numeric UnitId then unit-local finding ordinal. */
export function compareEvidenceIds(left, right) {
  validateEvidenceId(left, { name: "left EvidenceId" });
  validateEvidenceId(right, { name: "right EvidenceId" });
  const leftSeparator = left.lastIndexOf("-F");
  const rightSeparator = right.lastIndexOf("-F");
  const unitComparison = compareUnitIds(left.slice(0, leftSeparator), right.slice(0, rightSeparator));
  if (unitComparison !== 0) return unitComparison;
  const leftOrdinal = Number(left.slice(leftSeparator + 2));
  const rightOrdinal = Number(right.slice(rightSeparator + 2));
  return leftOrdinal === rightOrdinal ? 0 : leftOrdinal < rightOrdinal ? -1 : 1;
}

/** Parse an argv array against an exact, alias-free option definition. */
export function parseCliOptions(argv, definitions) {
  assertDenseArray(argv, { name: "argv" });
  assertPlainRecord(definitions, { name: "CLI option definitions" });
  const byFlag = new Map();
  const descriptors = [];
  for (const [key, definition] of Object.entries(definitions)) {
    assertClosedRecord(definition, {
      name: `CLI option definition ${JSON.stringify(key)}`,
      required: ["flag"],
      optional: ["required", "multiple", "takesValue", "parse"],
    });
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) fail("invalid-cli-definition", `invalid CLI result key ${JSON.stringify(key)}`);
    if (typeof definition.flag !== "string" || !/^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.flag)) {
      fail("invalid-cli-definition", `invalid CLI flag for ${JSON.stringify(key)}`);
    }
    if (byFlag.has(definition.flag)) fail("invalid-cli-definition", `duplicate CLI flag ${definition.flag}`);
    for (const booleanField of ["required", "multiple", "takesValue"]) {
      if (definition[booleanField] !== undefined && typeof definition[booleanField] !== "boolean") {
        fail("invalid-cli-definition", `${definition.flag}.${booleanField} must be boolean`);
      }
    }
    if (definition.parse !== undefined && typeof definition.parse !== "function") {
      fail("invalid-cli-definition", `${definition.flag}.parse must be a function`);
    }
    const descriptor = Object.freeze({
      key,
      flag: definition.flag,
      required: definition.required === true,
      multiple: definition.multiple === true,
      takesValue: definition.takesValue !== false,
      parse: definition.parse,
    });
    if (!descriptor.takesValue && (descriptor.multiple || descriptor.parse !== undefined)) {
      fail("invalid-cli-definition", `${descriptor.flag} boolean flags cannot be repeated or parsed`);
    }
    byFlag.set(descriptor.flag, descriptor);
    descriptors.push(descriptor);
  }

  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (typeof flag !== "string") fail("invalid-cli-argument", `argv[${index}] must be a string`);
    const descriptor = byFlag.get(flag);
    if (descriptor === undefined) fail("unknown-option", `unsupported option ${JSON.stringify(flag)}`);
    if (!descriptor.multiple && Object.hasOwn(parsed, descriptor.key)) fail("duplicate-option", `option ${flag} may appear only once`);

    if (!descriptor.takesValue) {
      parsed[descriptor.key] = true;
      continue;
    }
    const raw = argv[++index];
    if (typeof raw !== "string" || raw.startsWith("--")) fail("missing-option-value", `option ${flag} requires one value`);
    const value = descriptor.parse === undefined ? raw : descriptor.parse(raw, { flag, key: descriptor.key });
    if (descriptor.multiple) {
      if (!Object.hasOwn(parsed, descriptor.key)) parsed[descriptor.key] = [];
      parsed[descriptor.key].push(value);
    } else {
      parsed[descriptor.key] = value;
    }
  }

  for (const descriptor of descriptors) {
    if (descriptor.required && !Object.hasOwn(parsed, descriptor.key)) {
      fail("missing-option", `required option ${descriptor.flag} was not supplied`);
    }
    if (descriptor.multiple && Object.hasOwn(parsed, descriptor.key)) Object.freeze(parsed[descriptor.key]);
  }
  return Object.freeze(parsed);
}

/** Build a portable persisted diagnostic without copying raw error details. */
export function persistedDiagnostic(error, options = {}) {
  const code = options.code ?? (error instanceof RuntimeError ? error.code : "unexpected-error");
  if (typeof code !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code)) {
    fail("invalid-diagnostic-code", "persisted diagnostic code must use lowercase kebab case");
  }
  assertPlainRecord(options.messages, { name: "persisted diagnostic messages" });
  if (!Object.hasOwn(options.messages, code)) fail("missing-diagnostic-message", `no fixed persisted message is registered for ${code}`);
  const message = options.messages[code];
  assertUnicodeScalarString(message, { name: `persisted diagnostic message for ${code}` });
  if (message.trim().length === 0) fail("invalid-diagnostic-message", "persisted diagnostic message must not be blank");

  const diagnostic = { code };
  if (options.path !== undefined) diagnostic.path = validateWorkspacePath(options.path, { name: "persisted diagnostic path", allowRoot: true });
  if (options.line !== undefined) diagnostic.line = validateLine(options.line, { name: "persisted diagnostic line" });
  if (options.id !== undefined) {
    assertUnicodeScalarString(options.id, { name: "persisted diagnostic id" });
    if (options.id.length === 0) fail("invalid-diagnostic-id", "persisted diagnostic id must not be empty");
    diagnostic.id = options.id;
  }
  diagnostic.message = message;
  return Object.freeze(diagnostic);
}

/** Require a string to contain only Unicode scalar values. */
export function assertUnicodeScalarString(value, options = {}) {
  const name = options.name ?? "value";
  if (typeof value !== "string") fail("invalid-string", `${name} must be a string`);
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail("invalid-unicode-scalar", `${name} contains an unpaired high surrogate at code-unit index ${index}`);
      }
      index++;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail("invalid-unicode-scalar", `${name} contains an unpaired low surrogate at code-unit index ${index}`);
    }
  }
  return value;
}

/** Count Unicode code points after rejecting unpaired surrogates. */
export function countCodePoints(value, options = {}) {
  assertUnicodeScalarString(value, options);
  let count = 0;
  for (let index = 0; index < value.length; count++) {
    const codeUnit = value.charCodeAt(index);
    index += codeUnit >= 0xd800 && codeUnit <= 0xdbff ? 2 : 1;
  }
  return count;
}

/** Slice by zero-based Unicode code-point offsets without splitting a scalar. */
export function sliceCodePoints(value, start, end, options = {}) {
  assertUnicodeScalarString(value, options);
  if (!Number.isSafeInteger(start) || start < 0) fail("invalid-code-point-offset", "code-point start must be a nonnegative safe integer");
  if (end !== undefined && (!Number.isSafeInteger(end) || end < start)) {
    fail("invalid-code-point-offset", "code-point end must be a safe integer no smaller than start");
  }
  let codePoint = 0;
  let codeUnit = 0;
  let startCodeUnit = value.length;
  let endCodeUnit = value.length;
  while (codeUnit < value.length) {
    if (codePoint === start) startCodeUnit = codeUnit;
    if (end !== undefined && codePoint === end) {
      endCodeUnit = codeUnit;
      break;
    }
    const current = value.charCodeAt(codeUnit);
    codeUnit += current >= 0xd800 && current <= 0xdbff ? 2 : 1;
    codePoint++;
  }
  if (codePoint === start) startCodeUnit = codeUnit;
  if (end !== undefined && codePoint === end) endCodeUnit = codeUnit;
  return value.slice(startCodeUnit, end === undefined ? value.length : endCodeUnit);
}

/** Compute the contract token estimate: ceil(UnicodeCodePointCount / 4). */
export function approximateTokens(value) {
  return Math.ceil(countCodePoints(value, { name: "text" }) / 4);
}

/** Compare strings by their exact UTF-8 bytes, without locale collation. */
export function compareUtf8(left, right) {
  assertUnicodeScalarString(left, { name: "left value" });
  assertUnicodeScalarString(right, { name: "right value" });
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalizeValue(value, sortKeys, location) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return assertUnicodeScalarString(value, { name: location });
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("invalid-json-number", `${location} must be a finite canonical JSON number`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) fail("invalid-json-number", `${location} must be a safe integer`);
    return value;
  }
  if (Array.isArray(value)) {
    assertDenseArray(value, { name: location });
    return value.map((item, index) => canonicalizeValue(item, sortKeys, `${location}[${index}]`));
  }
  assertPlainRecord(value, { name: location });
  const keys = Object.keys(value);
  if (sortKeys) keys.sort(compareUtf8);
  const output = {};
  for (const key of keys) {
    assertUnicodeScalarString(key, { name: `${location} field name` });
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value: canonicalizeValue(value[key], sortKeys, `${location}.${key}`),
      writable: true,
    });
  }
  return output;
}

/** Serialize deterministic UTF-8 JSON with LF and one terminal newline. */
export function canonicalJson(value, options = {}) {
  return `${JSON.stringify(canonicalizeValue(value, options.sortKeys === true, options.name ?? "value"), null, 2)}\n`;
}

/** Serialize one deterministic compact JSON object. */
export function canonicalJsonLine(value, options = {}) {
  assertPlainRecord(value, { name: options.name ?? "record" });
  return JSON.stringify(canonicalizeValue(value, options.sortKeys === true, options.name ?? "record"));
}

/** Serialize a dense object-only JSONL sequence with one terminal newline. */
export function canonicalJsonl(records, options = {}) {
  assertDenseArray(records, { name: options.name ?? "records" });
  if (options.requireNonempty === true && records.length === 0) {
    fail("empty-jsonl", `${options.name ?? "records"} must not be empty`, { exitCode: EXIT_CODES.EMPTY_INPUT });
  }
  return records.map((record, index) => canonicalJsonLine(record, {
    name: `${options.name ?? "records"}[${index}]`,
    sortKeys: options.sortKeys,
  })).join("\n") + (records.length === 0 ? "" : "\n");
}

function toExactBytes(value, name) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  fail("invalid-byte-input", `${name} must be a string, Buffer, or Uint8Array`);
}

/** Hash exact bytes with lowercase SHA-256. */
export function sha256Bytes(value) {
  const bytes = toExactBytes(value, "hash input");
  return createHash("sha256").update(bytes).digest("hex");
}

export const LIMIT_DEFINITIONS = Object.freeze({
  sourcesPerRun: Object.freeze({ flag: "--limit-sources-per-run", default: 100, min: 1, max: 1000 }),
  textSourceBytesPerFile: Object.freeze({ flag: "--limit-text-source-bytes-per-file", default: 33554432, min: 1, max: 268435456 }),
  documentBytes: Object.freeze({ flag: "--limit-document-bytes", default: 67108864, min: 1, max: 268435456 }),
  jsonBytesPerFile: Object.freeze({ flag: "--limit-json-bytes-per-file", default: 16777216, min: 1, max: 67108864 }),
  jsonlBytesPerFile: Object.freeze({ flag: "--limit-jsonl-bytes-per-file", default: 67108864, min: 1, max: 536870912 }),
  jsonlBytesPerLine: Object.freeze({ flag: "--limit-jsonl-bytes-per-line", default: 1048576, min: 1, max: 16777216 }),
  jsonlRecords: Object.freeze({ flag: "--limit-jsonl-records", default: 100000, min: 1, max: 1000000 }),
  repositoryChildrenPerDirectory: Object.freeze({ flag: "--limit-repository-children-per-directory", default: 10000, min: 1, max: 100000 }),
  repositoryTraversalDepth: Object.freeze({ flag: "--limit-repository-traversal-depth", default: 64, min: 1, max: 256 }),
  repositoryEncounteredEntries: Object.freeze({ flag: "--limit-repository-encountered-entries", default: 100000, min: 1, max: 1000000 }),
  repositoryAdmittedFiles: Object.freeze({ flag: "--limit-repository-admitted-files", default: 5000, min: 1, max: 100000 }),
  repositoryCandidateBytes: Object.freeze({ flag: "--limit-repository-candidate-bytes", default: 268435456, min: 1, max: 17179869184 }),
  repositoryBytesPerAdmittedFile: Object.freeze({ flag: "--limit-repository-bytes-per-admitted-file", default: 33554432, min: 1, max: 268435456 }),
  sourceWorkUnits: Object.freeze({ flag: "--limit-source-work-units", default: 20000, min: 1, max: 200000 }),
  unitApproximateTokens: Object.freeze({ flag: "--limit-unit-approximate-tokens", default: 3000, min: 1, max: 32000 }),
  unitOverlapApproximateTokens: Object.freeze({ flag: "--limit-unit-overlap-approximate-tokens", default: 200, min: 0, max: 8000 }),
  digestSnippetCodePoints: Object.freeze({ flag: "--limit-digest-snippet-code-points", default: 90, min: 20, max: 4096 }),
});

export const DEFAULT_LIMITS = Object.freeze(Object.fromEntries(
  Object.entries(LIMIT_DEFINITIONS).map(([name, definition]) => [name, definition.default])
));

export const LIMIT_RELATIONS = Object.freeze([
  Object.freeze({ left: "jsonlBytesPerLine", operator: "<=", right: "jsonlBytesPerFile" }),
  Object.freeze({ left: "repositoryChildrenPerDirectory", operator: "<=", right: "repositoryEncounteredEntries" }),
  Object.freeze({ left: "repositoryAdmittedFiles", operator: "<=", right: "repositoryEncounteredEntries" }),
  Object.freeze({ left: "repositoryBytesPerAdmittedFile", operator: "<=", right: "repositoryCandidateBytes" }),
  Object.freeze({ left: "unitOverlapApproximateTokens", operator: "<", right: "unitApproximateTokens" }),
]);

/** Validate reusable numeric field relations. */
export function assertCrossFieldRelations(values, relations) {
  assertPlainRecord(values, { name: "cross-field values" });
  assertDenseArray(relations, { name: "cross-field relations" });
  for (const relation of relations) {
    assertClosedRecord(relation, { name: "cross-field relation", required: ["left", "operator", "right"] });
    if (!Object.hasOwn(values, relation.left) || !Object.hasOwn(values, relation.right)) {
      fail("missing-relation-field", "cross-field relation references a missing field");
    }
    if (relation.operator !== "<" && relation.operator !== "<=") {
      fail("invalid-relation-operator", `unsupported cross-field operator ${JSON.stringify(relation.operator)}`);
    }
    const valid = relation.operator === "<"
      ? values[relation.left] < values[relation.right]
      : values[relation.left] <= values[relation.right];
    if (!valid) {
      fail("invalid-limit-relation", `${relation.left} must be ${relation.operator} ${relation.right}`, { details: relation });
    }
  }
  return values;
}

/** Validate a complete persisted limits record. */
export function validateLimits(limits) {
  assertClosedRecord(limits, { name: "limits", required: Object.keys(LIMIT_DEFINITIONS) });
  for (const [name, definition] of Object.entries(LIMIT_DEFINITIONS)) {
    const value = limits[name];
    if (!Number.isSafeInteger(value) || value < definition.min || value > definition.max) {
      fail("integer-out-of-range", `${name} must be a safe integer from ${definition.min} through ${definition.max}`);
    }
  }
  assertCrossFieldRelations(limits, LIMIT_RELATIONS);
  return limits;
}

/** Resolve raw CLI limit overrides, defaults, and cross-field constraints. */
export function resolveLimits(overrides = {}) {
  assertClosedRecord(overrides, { name: "limit overrides", optional: Object.keys(LIMIT_DEFINITIONS) });
  const limits = {};
  for (const [name, definition] of Object.entries(LIMIT_DEFINITIONS)) {
    const raw = Object.hasOwn(overrides, name) ? overrides[name] : String(definition.default);
    limits[name] = parseCanonicalInteger(raw, { name: definition.flag, min: definition.min, max: definition.max });
  }
  validateLimits(limits);
  return Object.freeze(limits);
}

function tryLstat(filePath) {
  try {
    return lstatSync(filePath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("path-inspection-failed", `cannot inspect path ${filePath}: ${error.message}`, { path: filePath, cause: error });
  }
}

function canonicalRealpath(filePath) {
  try {
    return realpathSync.native(filePath);
  } catch (error) {
    fail("path-resolution-failed", `cannot resolve path ${filePath}: ${error.message}`, { path: filePath, cause: error });
  }
}

function identityFromStat(stat) {
  if (stat === null || stat === undefined) return null;
  const inode = BigInt(stat.ino);
  if (inode === 0n) return null;
  return Object.freeze({ device: String(stat.dev), inode: String(stat.ino) });
}

function identitiesEqual(left, right) {
  return left !== null && right !== null && left.device === right.device && left.inode === right.inode;
}

function assertLexicallyContained(root, candidate, options = {}) {
  const difference = relative(root, candidate);
  const contained = difference === "" || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
  if (!contained || (difference === "" && options.allowEqual === false)) {
    fail("path-outside-root", `${options.name ?? "path"} escapes the workspace root`, { path: candidate });
  }
  return difference;
}

/** Validate a portable workspace-relative POSIX path or the reserved root anchor. */
export function validateWorkspacePath(value, options = {}) {
  const name = options.name ?? "path";
  if (value === "@root") {
    if (options.allowRoot === true) return value;
    fail("reserved-root-path", `${name} must not use the reserved @root anchor`);
  }
  if (typeof value !== "string" || value.length === 0) fail("invalid-path", `${name} must be a nonempty string`);
  assertUnicodeScalarString(value, { name });
  if (value.includes("\0") || value.includes("\\") || posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith("//")) {
    fail("invalid-path", `${name} must be a workspace-relative POSIX path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("invalid-path", `${name} contains an empty, dot, or parent segment`);
  }
  if (posix.normalize(value) !== value) fail("invalid-path", `${name} is not normalized`);
  return value;
}

/** Validate a persisted non-root path. */
export function validatePersistedPath(value, options = {}) {
  return validateWorkspacePath(value, { ...options, allowRoot: false });
}

/** Validate a result-index-relative path. */
export function validateIndexPath(value, options = {}) {
  return validateWorkspacePath(value, { name: options.name ?? "index path", allowRoot: false });
}

/** Reject every symlink component in an absolute authorization-boundary path. */
export function assertNoSymlinkComponents(inputPath, options = {}) {
  const absolutePath = resolve(inputPath);
  const parsed = parsePath(absolutePath);
  const tail = relative(parsed.root, absolutePath);
  const segments = tail === "" ? [] : tail.split(sep);
  let current = parsed.root;
  let missing = false;

  const rootStat = tryLstat(current);
  if (rootStat?.isSymbolicLink()) fail("symlink-component", `path contains a symlink component: ${current}`, { path: current });

  for (const segment of segments) {
    current = join(current, segment);
    if (missing) continue;
    const stat = tryLstat(current);
    if (stat === null) {
      if (options.allowMissingTail === true) {
        missing = true;
        continue;
      }
      fail("missing-path", `path does not exist: ${current}`, { path: current });
    }
    if (stat.isSymbolicLink()) fail("symlink-component", `path contains a symlink component: ${current}`, { path: current });
  }
  return absolutePath;
}

/** Resolve, authorize, and canonicalize an invocation workspace root. */
export function acquireWorkspaceRoot(input, options = {}) {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    fail("invalid-workspace-root", "workspace root must be a nonempty path string");
  }
  const absolutePath = resolve(options.cwd ?? process.cwd(), input);
  assertNoSymlinkComponents(absolutePath);
  const stat = tryLstat(absolutePath);
  if (!stat?.isDirectory()) fail("invalid-workspace-root", `workspace root is not a directory: ${absolutePath}`, { path: absolutePath });
  return canonicalRealpath(absolutePath);
}

/** Resolve a validated persisted path beneath a canonical workspace root. */
export function resolveWorkspacePath(workspaceRoot, workspacePath, options = {}) {
  const root = resolve(workspaceRoot);
  validateWorkspacePath(workspacePath, options);
  const absolutePath = workspacePath === "@root" ? root : join(root, ...workspacePath.split("/"));
  assertLexicallyContained(root, absolutePath, { name: options.name });
  return absolutePath;
}

/** Convert a contained host path to its portable POSIX workspace representation. */
export function toWorkspacePath(workspaceRoot, inputPath, options = {}) {
  const root = resolve(workspaceRoot);
  const absolutePath = resolve(inputPath);
  const difference = assertLexicallyContained(root, absolutePath, { name: options.name });
  if (difference === "") {
    if (options.allowRoot === true) return "@root";
    fail("reserved-root-path", `${options.name ?? "path"} resolves to the workspace root`, { path: absolutePath });
  }
  const portable = difference.split(sep).join("/");
  return validateWorkspacePath(portable, { name: options.name });
}

/** Authorize one existing contained non-symlink file or directory. */
export function authorizeExistingPath(workspaceRoot, workspacePath, options = {}) {
  const root = resolve(workspaceRoot);
  const absolutePath = resolveWorkspacePath(root, workspacePath, { name: options.name, allowRoot: options.allowRoot });
  assertNoSymlinkComponents(absolutePath);
  const stat = tryLstat(absolutePath);
  if (stat === null) fail("missing-path", `${options.name ?? "path"} does not exist`, { path: absolutePath });
  if (stat.isSymbolicLink()) fail("symlink-path", `${options.name ?? "path"} must not be a symlink`, { path: absolutePath });

  const kind = options.kind ?? "file";
  if (kind === "file" && !stat.isFile()) fail("not-regular-file", `${options.name ?? "path"} must be a regular file`, { path: absolutePath });
  if (kind === "directory" && !stat.isDirectory()) fail("not-directory", `${options.name ?? "path"} must be a directory`, { path: absolutePath });
  if (kind !== "file" && kind !== "directory") fail("invalid-path-kind", `unsupported required path kind ${JSON.stringify(kind)}`);

  const realPath = canonicalRealpath(absolutePath);
  assertLexicallyContained(root, realPath, { name: options.name });
  return Object.freeze({ path: absolutePath, realPath, stat, identity: identityFromStat(stat) });
}

/** Return an available device/inode identity for a non-symlink filesystem entry. */
export function fileIdentity(filePath) {
  const absolutePath = resolve(filePath);
  const stat = tryLstat(absolutePath);
  if (stat === null) fail("missing-path", `path does not exist: ${absolutePath}`, { path: absolutePath });
  if (stat.isSymbolicLink()) fail("symlink-path", `path must not be a symlink: ${absolutePath}`, { path: absolutePath });
  return identityFromStat(stat);
}

/** Determine whether two existing or prospective paths alias. */
export function pathsAlias(leftPath, rightPath) {
  const leftAbsolute = resolve(leftPath);
  const rightAbsolute = resolve(rightPath);
  if (leftAbsolute === rightAbsolute) return true;

  const leftStat = tryLstat(leftAbsolute);
  const rightStat = tryLstat(rightAbsolute);
  if (leftStat === null || rightStat === null) return false;
  if (canonicalRealpath(leftAbsolute) === canonicalRealpath(rightAbsolute)) return true;
  return identitiesEqual(identityFromStat(leftStat), identityFromStat(rightStat));
}

/** Reject lexical, realpath, symlink-target, and available file-identity aliases. */
export function assertNoPathAliases(paths, options = {}) {
  assertDenseArray(paths, { name: options.name ?? "paths" });
  const lexicalPaths = new Map();
  const realPaths = new Map();
  const identities = new Map();
  const register = (map, key, index) => {
    if (key === null) return;
    if (map.has(key)) {
      fail("path-alias", `${options.name ?? "paths"} contains aliased entries`, {
        details: { leftIndex: map.get(key), rightIndex: index },
      });
    }
    map.set(key, index);
  };

  for (let index = 0; index < paths.length; index++) {
    const absolutePath = resolve(paths[index]);
    register(lexicalPaths, absolutePath, index);
    const stat = tryLstat(absolutePath);
    if (stat === null) continue;
    register(realPaths, canonicalRealpath(absolutePath), index);
    const identity = identityFromStat(stat);
    register(identities, identity === null ? null : `${identity.device}:${identity.inode}`, index);
  }
  return paths;
}

function assertByteLimit(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    fail("invalid-byte-limit", `${name} must be a nonnegative safe integer smaller than Number.MAX_SAFE_INTEGER`);
  }
  return value;
}

function statSnapshot(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

function validateExpectedIdentity(value, name) {
  assertClosedRecord(value, { name, required: ["device", "inode"] });
  if (typeof value.device !== "string" || typeof value.inode !== "string" || !/^[0-9]+$/.test(value.device) || !/^[0-9]+$/.test(value.inode)) {
    fail("invalid-file-identity", `${name} must contain decimal device and inode strings`);
  }
  return value;
}

function authorizationSnapshot(workspaceRoot, absolutePath) {
  const difference = assertLexicallyContained(workspaceRoot, absolutePath, { name: "stable-read path" });
  const segments = difference === "" ? [] : difference.split(sep);
  const snapshot = [];
  let current = workspaceRoot;
  for (const segment of [null, ...segments]) {
    if (segment !== null) current = join(current, segment);
    const stat = tryLstat(current);
    if (stat === null) fail("missing-path", `stable-read authorization component is missing: ${current}`, { path: current });
    if (stat.isSymbolicLink()) fail("symlink-component", `stable-read authorization contains a symlink component: ${current}`, { path: current });
    const identity = identityFromStat(stat);
    snapshot.push(`${stat.mode}:${identity?.device ?? "?"}:${identity?.inode ?? "?"}`);
  }
  return snapshot.join("/");
}

function authorizeStableRead(absolutePath, options) {
  const hasRoot = options.workspaceRoot !== undefined;
  const hasPersistedPath = options.workspacePath !== undefined;
  if (hasRoot !== hasPersistedPath) {
    fail("incomplete-read-authorization", "workspaceRoot and workspacePath must be supplied together");
  }
  if (!hasRoot) return null;

  const workspaceRoot = resolve(options.workspaceRoot);
  assertNoSymlinkComponents(workspaceRoot);
  const rootStat = tryLstat(workspaceRoot);
  if (!rootStat?.isDirectory()) fail("invalid-workspace-root", `workspace root is not a directory: ${workspaceRoot}`, { path: workspaceRoot });
  const expectedPath = resolveWorkspacePath(workspaceRoot, options.workspacePath, {
    name: options.name ?? "stable-read path",
    allowRoot: options.allowRoot === true,
  });
  if (absolutePath !== expectedPath) {
    fail("read-path-mismatch", "stable-read host path does not match its persisted workspace path", { path: options.workspacePath });
  }
  const authorized = authorizeExistingPath(workspaceRoot, options.workspacePath, {
    name: options.name ?? "stable-read path",
    allowRoot: options.allowRoot === true,
    kind: "file",
  });
  if (options.expectedRealPath !== undefined && canonicalRealpath(resolve(options.expectedRealPath)) !== authorized.realPath) {
    fail("read-canonical-path-mismatch", "stable-read path does not match the expected canonical path", { path: options.workspacePath });
  }
  if (options.expectedIdentity !== undefined) {
    const expectedIdentity = validateExpectedIdentity(options.expectedIdentity, "expected stable-read identity");
    if (!identitiesEqual(expectedIdentity, authorized.identity)) {
      fail("read-identity-mismatch", "stable-read path does not match the expected file identity", { path: options.workspacePath });
    }
  }
  return Object.freeze({
    workspaceRoot,
    workspacePath: options.workspacePath,
    realPath: authorized.realPath,
    identity: authorized.identity,
    components: authorizationSnapshot(workspaceRoot, absolutePath),
  });
}

/**
 * Read exact bytes within an inclusive bound and reject concurrent mutation.
 * When workspaceRoot/workspacePath are supplied, the complete authorization
 * chain is revalidated before and after the read. Portable Node lacks openat(2)
 * traversal, so authorization-boundary parents must not be writable by a
 * hostile actor during the final namespace lookup.
 */
export function readStableBytes(filePath, options = {}) {
  const displayPath = String(filePath);
  const absolutePath = resolve(filePath);
  const maxBytes = assertByteLimit(options.maxBytes ?? DEFAULT_LIMITS.jsonBytesPerFile, "maxBytes");
  if (options.exactBytes !== undefined) assertByteLimit(options.exactBytes, "exactBytes");
  let descriptor;
  try {
    const initialAuthorization = authorizeStableRead(absolutePath, options);
    if (options.rejectSymlinks !== false) assertNoSymlinkComponents(absolutePath);
    const pathStat = tryLstat(absolutePath);
    if (pathStat === null) fail("missing-file", `file does not exist: ${displayPath}`, { path: displayPath });
    if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
      fail("not-regular-file", `path is not a regular non-symlink file: ${displayPath}`, { path: displayPath });
    }

    const noFollow = FS_CONSTANTS.O_NOFOLLOW ?? 0;
    descriptor = openSync(absolutePath, FS_CONSTANTS.O_RDONLY | noFollow);
    const initialStat = fstatSync(descriptor, { bigint: true });
    if (!initialStat.isFile() || !identitiesEqual(identityFromStat(pathStat), identityFromStat(initialStat))) {
      fail("changed-before-read", `file changed before it could be read: ${displayPath}`, { path: displayPath });
    }
    if (initialStat.size > BigInt(maxBytes)) {
      fail("file-byte-limit", `file exceeds the ${maxBytes}-byte limit: ${displayPath}`, { path: displayPath });
    }

    options.testHooks?.afterInitialStat?.({ path: absolutePath });
    const initialSize = Number(initialStat.size);
    const bytes = Buffer.allocUnsafe(initialSize);
    let totalBytes = 0;
    while (totalBytes < initialSize) {
      const bytesRead = readSync(descriptor, bytes, totalBytes, initialSize - totalBytes, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
    }
    const overflowProbe = Buffer.allocUnsafe(1);
    const overflowBytes = readSync(descriptor, overflowProbe, 0, 1, null);

    options.testHooks?.afterRead?.({ path: absolutePath });
    const finalStat = fstatSync(descriptor, { bigint: true });
    const finalPathStat = tryLstat(absolutePath);
    const finalAuthorization = authorizeStableRead(absolutePath, options);
    if (
      statSnapshot(initialStat) !== statSnapshot(finalStat)
      || totalBytes !== Number(initialStat.size)
      || overflowBytes !== 0
      || finalPathStat === null
      || !identitiesEqual(identityFromStat(initialStat), identityFromStat(finalPathStat))
      || (initialAuthorization !== null && (
        finalAuthorization === null
        || initialAuthorization.realPath !== finalAuthorization.realPath
        || !identitiesEqual(initialAuthorization.identity, finalAuthorization.identity)
        || initialAuthorization.components !== finalAuthorization.components
      ))
    ) {
      fail("changed-during-read", `file changed while it was being read: ${displayPath}`, { path: displayPath });
    }
    if (options.exactBytes !== undefined && totalBytes !== options.exactBytes) {
      fail("unexpected-byte-count", `file has ${totalBytes} bytes; expected ${options.exactBytes}: ${displayPath}`, { path: displayPath });
    }
    return bytes;
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    fail("file-read-failed", `cannot read file ${displayPath}: ${error.message}`, { path: displayPath, cause: error });
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve the primary result */ }
    }
  }
}

function firstInvalidUtf8Offset(buffer) {
  const continuation = (byte) => byte >= 0x80 && byte <= 0xbf;
  for (let offset = 0; offset < buffer.length;) {
    const first = buffer[offset];
    if (first <= 0x7f) {
      offset++;
      continue;
    }

    const second = buffer[offset + 1];
    const third = buffer[offset + 2];
    const fourth = buffer[offset + 3];
    if (first >= 0xc2 && first <= 0xdf && continuation(second)) {
      offset += 2;
      continue;
    }
    const validThree =
      (first === 0xe0 && second >= 0xa0 && second <= 0xbf && continuation(third))
      || (first >= 0xe1 && first <= 0xec && continuation(second) && continuation(third))
      || (first === 0xed && second >= 0x80 && second <= 0x9f && continuation(third))
      || (first >= 0xee && first <= 0xef && continuation(second) && continuation(third));
    if (validThree) {
      offset += 3;
      continue;
    }
    const validFour =
      (first === 0xf0 && second >= 0x90 && second <= 0xbf && continuation(third) && continuation(fourth))
      || (first >= 0xf1 && first <= 0xf3 && continuation(second) && continuation(third) && continuation(fourth))
      || (first === 0xf4 && second >= 0x80 && second <= 0x8f && continuation(third) && continuation(fourth));
    if (validFour) {
      offset += 4;
      continue;
    }
    return offset;
  }
  return -1;
}

function lineAtByteOffset(buffer, offset) {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (buffer[index] === 0x0a) line++;
  }
  return line;
}

/** Decode exact UTF-8 bytes, rejecting BOM and malformed sequences by default. */
export function decodeUtf8(bytes, options = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  if (hasBom && options.allowBom !== true) {
    fail("utf8-bom", `UTF-8 BOM is not permitted${options.path ? `: ${options.path}` : ""}`, {
      path: options.path,
      line: options.line ?? 1,
    });
  }
  const content = hasBom ? buffer.subarray(3) : buffer;
  const invalidOffset = firstInvalidUtf8Offset(content);
  if (invalidOffset !== -1) {
    fail("invalid-utf8", `invalid UTF-8${options.path ? ` in ${options.path}` : ""}`, {
      path: options.path,
      line: options.line ?? lineAtByteOffset(content, invalidOffset),
    });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    fail("invalid-utf8", `invalid UTF-8${options.path ? ` in ${options.path}` : ""}`, {
      path: options.path,
      line: options.line ?? 1,
      cause: error,
    });
  }
}

/** Stable-read and decode one bounded UTF-8 file. */
export function readUtf8File(filePath, options = {}) {
  return decodeUtf8(readStableBytes(filePath, options), { path: String(filePath), allowBom: options.allowBom });
}

function jsonErrorLine(error, text) {
  const explicit = error.message.match(/\bline\s+(\d+)\b/i);
  if (explicit) return Number(explicit[1]);
  const position = error.message.match(/\bposition\s+(\d+)\b/i);
  if (!position) return 1;
  return text.slice(0, Number(position[1])).split("\n").length;
}

function withContext(error, context) {
  if (!(error instanceof RuntimeError)) return error;
  if (error.path !== undefined && error.line !== undefined) return error;
  return new RuntimeError(error.code, error.message, {
    cause: error,
    exitCode: error.exitCode,
    path: error.path ?? context.path,
    line: error.line ?? context.line,
    details: error.details,
  });
}

function inspectJsonLexicalEvidence(text, options = {}) {
  const path = options.path;
  const malformedCode = options.malformedCode ?? "malformed-json";
  const baseLine = options.line ?? 1;
  const maxDepth = options.maxDepth ?? 256;
  validateCount(maxDepth, 1, "maximum JSON depth", "invalid-json-depth-limit");
  let index = 0;

  const lineAt = (offset) => baseLine + text.slice(0, offset).split("\n").length - 1;
  const reject = (code, message, offset = index) => fail(code, message, { path, line: lineAt(offset) });
  const skipWhitespace = () => {
    while (index < text.length && (text[index] === " " || text[index] === "\t" || text[index] === "\r" || text[index] === "\n")) index++;
  };
  const expect = (character) => {
    if (text[index] !== character) reject(malformedCode, `malformed JSON: expected ${JSON.stringify(character)}`);
    index++;
  };
  const parseStringToken = (decode = false) => {
    const start = index;
    expect('"');
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        if (!decode) return undefined;
        const raw = text.slice(start, index);
        try {
          return JSON.parse(raw);
        } catch {
          reject(malformedCode, "malformed JSON string", start);
        }
      }
      if (character.charCodeAt(0) < 0x20) reject(malformedCode, "malformed JSON string", index - 1);
      if (character !== "\\") continue;
      if (index >= text.length) reject(malformedCode, "malformed JSON escape", index - 1);
      const escape = text[index++];
      if ('"\\/bfnrt'.includes(escape)) continue;
      if (escape !== "u" || !/^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) {
        reject(malformedCode, "malformed JSON escape", index - 1);
      }
      index += 4;
    }
    reject(malformedCode, "unterminated JSON string", start);
  };
  const parseNumberToken = () => {
    const start = index;
    const match = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (match === null) reject(malformedCode, "malformed JSON number", start);
    const raw = match[0];
    index += raw.length;
    if (!/[.eE]/.test(raw)) {
      const magnitude = raw.startsWith("-") ? raw.slice(1) : raw;
      if (magnitude.length > 16 || (magnitude.length === 16 && magnitude > "9007199254740991")) {
        reject("unsafe-json-integer", "JSON integer must be within the safe-integer range", start);
      }
    }
  };
  const parseValue = (depth) => {
    if (depth > maxDepth) reject("json-depth-limit", `JSON nesting exceeds the ${maxDepth}-level limit`);
    skipWhitespace();
    const character = text[index];
    if (character === '"') {
      parseStringToken();
      return;
    }
    if (character === "{") {
      index++;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === "}") {
        index++;
        return;
      }
      while (true) {
        skipWhitespace();
        const keyOffset = index;
        if (text[index] !== '"') reject(malformedCode, "malformed JSON object key");
        const key = parseStringToken(true);
        if (keys.has(key)) reject("duplicate-json-key", `duplicate JSON member ${JSON.stringify(key)}`, keyOffset);
        keys.add(key);
        skipWhitespace();
        expect(":");
        parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === "}") {
          index++;
          return;
        }
        expect(",");
      }
    }
    if (character === "[") {
      index++;
      skipWhitespace();
      if (text[index] === "]") {
        index++;
        return;
      }
      while (true) {
        parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === "]") {
          index++;
          return;
        }
        expect(",");
      }
    }
    if (text.startsWith("true", index)) {
      index += 4;
      return;
    }
    if (text.startsWith("false", index)) {
      index += 5;
      return;
    }
    if (text.startsWith("null", index)) {
      index += 4;
      return;
    }
    parseNumberToken();
  };

  parseValue(0);
  skipWhitespace();
  if (index !== text.length) reject(malformedCode, "malformed JSON: trailing content");
}

function canonicalValueFrom(value, options, context) {
  if (typeof options.canonicalize !== "function") {
    fail("missing-canonicalizer", "strict canonical input requires a schema-order canonicalize callback", context);
  }
  return options.canonicalize(value, context);
}

/**
 * Read one bounded object-root JSON file and invoke an optional validator.
 * strictCanonical additionally requires a schema-order canonicalize callback
 * and compares canonical bytes to the exact input. Decoded text and the parsed
 * object graph necessarily add memory beyond the single stable-read buffer.
 */
export function readJsonFile(filePath, options = {}) {
  const bytes = readStableBytes(filePath, {
    maxBytes: options.maxBytes,
    exactBytes: options.exactBytes,
    rejectSymlinks: options.rejectSymlinks,
    workspaceRoot: options.workspaceRoot,
    workspacePath: options.workspacePath,
    allowRoot: options.allowRoot,
    expectedRealPath: options.expectedRealPath,
    expectedIdentity: options.expectedIdentity,
    testHooks: options.testHooks,
  });
  const text = decodeUtf8(bytes, { path: String(filePath), allowBom: options.allowBom });
  inspectJsonLexicalEvidence(text, { path: String(filePath), maxDepth: options.maxDepth });
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail("malformed-json", `malformed JSON in ${filePath}: ${error.message}`, {
      path: String(filePath),
      line: jsonErrorLine(error, text),
      cause: error,
    });
  }
  try {
    assertPlainRecord(value, { name: options.name ?? "JSON root" });
    options.validate?.(value, { path: String(filePath), line: 1 });
    if (options.strictCanonical === true) {
      const canonicalValue = canonicalValueFrom(value, options, { path: String(filePath), line: 1 });
      const canonicalBytes = Buffer.from(canonicalJson(canonicalValue, { name: options.name ?? "JSON root" }), "utf8");
      if (!bytes.equals(canonicalBytes)) {
        fail("noncanonical-json", `JSON does not use the required canonical serialization: ${filePath}`, {
          path: String(filePath),
          line: 1,
        });
      }
    }
  } catch (error) {
    throw withContext(error, { path: String(filePath), line: 1 });
  }
  return value;
}

/**
 * Parse bounded object-only JSONL bytes with exact line and record checks.
 * strictCanonical compares each validated record with a schema-order
 * canonicalize callback and requires terminal LF. Line buffers are views over
 * the input; retained parsed object graphs necessarily add memory.
 */
export function parseJsonlBytes(bytes, options = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const path = options.path ?? "<jsonl>";
  const maxLineBytes = assertByteLimit(options.maxLineBytes ?? DEFAULT_LIMITS.jsonlBytesPerLine, "maxLineBytes");
  const maxRecords = assertByteLimit(options.maxRecords ?? DEFAULT_LIMITS.jsonlRecords, "maxRecords");
  if (buffer.length === 0) {
    if (options.requireNonempty === true) {
      fail("empty-jsonl", "JSONL must contain at least one record", { path, exitCode: EXIT_CODES.EMPTY_INPUT });
    }
    return [];
  }

  const records = [];
  let lineStart = 0;
  let lineNumber = 1;
  for (let offset = 0; offset <= buffer.length; offset++) {
    if (offset !== buffer.length && buffer[offset] !== 0x0a) continue;
    const terminalEmpty = offset === buffer.length && lineStart === buffer.length && buffer[buffer.length - 1] === 0x0a;
    if (terminalEmpty) break;
    const lineBytes = buffer.subarray(lineStart, offset);
    if (lineBytes.length > maxLineBytes) {
      fail("jsonl-line-byte-limit", `JSONL line exceeds the ${maxLineBytes}-byte limit`, { path, line: lineNumber });
    }
    if (lineBytes.length === 0) fail("blank-jsonl-line", "JSONL must not contain blank records", { path, line: lineNumber });
    if (lineBytes[lineBytes.length - 1] === 0x0d) {
      fail("noncanonical-jsonl-line-ending", "JSONL must use LF line endings", { path, line: lineNumber });
    }

    const text = decodeUtf8(lineBytes, { path, line: lineNumber });
    inspectJsonLexicalEvidence(text, { path, line: lineNumber, malformedCode: "malformed-jsonl", maxDepth: options.maxDepth });
    let record;
    try {
      record = JSON.parse(text);
    } catch (error) {
      fail("malformed-jsonl", `malformed JSONL record: ${error.message}`, { path, line: lineNumber, cause: error });
    }
    try {
      assertPlainRecord(record, { name: `JSONL record at line ${lineNumber}` });
      options.validate?.(record, { path, line: lineNumber, index: records.length });
      if (options.strictCanonical === true) {
        const context = { path, line: lineNumber, index: records.length };
        const canonicalValue = canonicalValueFrom(record, options, context);
        const canonicalBytes = Buffer.from(canonicalJsonLine(canonicalValue, {
          name: `JSONL record at line ${lineNumber}`,
        }), "utf8");
        if (!lineBytes.equals(canonicalBytes)) {
          fail("noncanonical-jsonl", "JSONL record does not use the required canonical serialization", context);
        }
      }
    } catch (error) {
      throw withContext(error, { path, line: lineNumber });
    }
    records.push(record);
    if (records.length > maxRecords) {
      fail("jsonl-record-limit", `JSONL exceeds the ${maxRecords}-record limit`, { path, line: lineNumber });
    }
    lineStart = offset + 1;
    lineNumber++;
  }

  if ((options.requireTerminalNewline === true || options.strictCanonical === true) && buffer[buffer.length - 1] !== 0x0a) {
    fail("missing-jsonl-terminal-newline", "JSONL must end with LF", { path, line: Math.max(1, lineNumber - 1) });
  }
  return records;
}

/** Stable-read one bounded object-only JSONL file. */
export function readJsonlFile(filePath, options = {}) {
  const bytes = readStableBytes(filePath, {
    maxBytes: options.maxBytes ?? DEFAULT_LIMITS.jsonlBytesPerFile,
    exactBytes: options.exactBytes,
    rejectSymlinks: options.rejectSymlinks,
    workspaceRoot: options.workspaceRoot,
    workspacePath: options.workspacePath,
    allowRoot: options.allowRoot,
    expectedRealPath: options.expectedRealPath,
    expectedIdentity: options.expectedIdentity,
    testHooks: options.testHooks,
  });
  return parseJsonlBytes(bytes, { ...options, path: String(filePath) });
}

/** Hash a stable bounded file's exact bytes. */
export function hashFile(filePath, options = {}) {
  const bytes = readStableBytes(filePath, options);
  return Object.freeze({ bytes: bytes.length, sha256: sha256Bytes(bytes) });
}

/** Create a contained output parent one verified non-symlink segment at a time. */
export function ensureContainedOutputParent(workspaceRoot, outputPath, options = {}) {
  const root = resolve(workspaceRoot);
  assertNoSymlinkComponents(root);
  const rootStat = tryLstat(root);
  if (!rootStat?.isDirectory()) fail("invalid-workspace-root", `workspace root is not a directory: ${root}`, { path: root });

  const absoluteOutput = resolveWorkspacePath(root, outputPath, { name: options.name ?? "output path" });
  const parent = dirname(absoluteOutput);
  const parentDifference = assertLexicallyContained(root, parent, { name: "output parent" });
  const segments = parentDifference === "" ? [] : parentDifference.split(sep);
  let current = root;
  const created = [];

  for (const segment of segments) {
    current = join(current, segment);
    let stat = tryLstat(current);
    if (stat === null) {
      try {
        mkdirSync(current, { mode: options.mode ?? 0o700 });
        created.push(current);
      } catch (error) {
        if (error?.code !== "EEXIST") {
          fail("output-parent-create-failed", `cannot create output parent ${current}: ${error.message}`, { path: current, cause: error });
        }
      }
      stat = tryLstat(current);
    }
    if (stat?.isSymbolicLink() || !stat?.isDirectory()) {
      fail("unsafe-output-parent", `output parent component is not a non-symlink directory: ${current}`, { path: current });
    }
    assertLexicallyContained(root, canonicalRealpath(current), { name: "output parent" });
  }

  const outputStat = tryLstat(absoluteOutput);
  if (outputStat?.isSymbolicLink() || (outputStat !== null && !outputStat.isFile())) {
    fail("unsafe-output-target", `output target must be absent or a regular non-symlink file: ${absoluteOutput}`, { path: absoluteOutput });
  }
  return Object.freeze({ path: absoluteOutput, parent, created: Object.freeze(created) });
}

function temporaryPathFor(target) {
  const suffix = `${process.pid}-${randomBytes(8).toString("hex")}`;
  return join(dirname(target), `.${basename(target)}.tmp-${suffix}`);
}

function syncDirectoryBestEffort(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, FS_CONSTANTS.O_RDONLY);
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is unsupported on some target filesystems.
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* publication has already completed */ }
    }
  }
}

function validateExpectedTarget(target, expectedTarget, options = {}) {
  assertClosedRecord(expectedTarget, { name: "expected target", required: ["state", "bytes", "sha256"] });
  const targetStat = tryLstat(target);
  if (expectedTarget.state === "absent") {
    if (expectedTarget.bytes !== null || expectedTarget.sha256 !== null) {
      fail("invalid-expected-target", "an absent expected target requires null bytes and sha256");
    }
    if (targetStat !== null) fail("target-state-changed", "atomic target is no longer absent", { path: target });
    return Object.freeze({ state: "absent", bytes: null, sha256: null });
  }
  if (expectedTarget.state !== "file") fail("invalid-expected-target", "expected target state must be absent or file");
  validateByteCount(expectedTarget.bytes, { name: "expected target bytes" });
  validateDigest(expectedTarget.sha256, { name: "expected target sha256" });
  if (targetStat?.isSymbolicLink() || !targetStat?.isFile()) {
    fail("target-state-changed", "atomic target is no longer a regular non-symlink file", { path: target });
  }
  const readOptions = { maxBytes: expectedTarget.bytes, exactBytes: expectedTarget.bytes };
  if (options.workspaceRoot !== undefined) {
    readOptions.workspaceRoot = options.workspaceRoot;
    readOptions.workspacePath = toWorkspacePath(options.workspaceRoot, target, { name: "atomic target" });
  }
  const currentBytes = readStableBytes(target, readOptions);
  const currentDigest = sha256Bytes(currentBytes);
  if (currentDigest !== expectedTarget.sha256) {
    fail("target-state-changed", "atomic target content no longer matches its expected digest", { path: target });
  }
  return Object.freeze({ state: "file", bytes: currentBytes.length, sha256: currentDigest });
}

function assertNoProtectedTargetAlias(target, protectedPaths) {
  assertDenseArray(protectedPaths, { name: "protected atomic paths" });
  for (let index = 0; index < protectedPaths.length; index++) {
    if (typeof protectedPaths[index] !== "string") {
      fail("invalid-protected-path", `protected atomic path at index ${index} must be a string`);
    }
    if (pathsAlias(target, protectedPaths[index])) {
      fail("protected-path-alias", "atomic target aliases a protected path", {
        path: target,
        details: { protectedIndex: index },
      });
    }
  }
}

/**
 * Atomically publish bytes through an adjacent exclusive temp file.
 * expectedTarget and protectedPaths are revalidated after the temp file is
 * flushed, followed by validateBeforePublish. Rename-based replacement cannot
 * provide compare-and-swap: callers must keep the target parent namespace
 * trusted from the final validation until renameSync completes.
 */
export function writeAtomicFile(targetPath, value, options = {}) {
  const target = resolve(targetPath);
  const mode = options.mode ?? "replace";
  if (mode !== "replace" && mode !== "create") fail("invalid-write-mode", "atomic write mode must be create or replace");
  if (options.testOnlyInjectFailure !== undefined && options.testOnlyInjectFailure !== "before-publish") {
    fail("invalid-test-injection", "the only supported test failure injection is before-publish");
  }
  if (options.validateBeforePublish !== undefined && typeof options.validateBeforePublish !== "function") {
    fail("invalid-publish-validator", "validateBeforePublish must be a function");
  }
  const bytes = toExactBytes(value, "atomic write input");
  const digest = sha256Bytes(bytes);
  const parent = dirname(target);

  if (options.workspaceRoot !== undefined) {
    const root = resolve(options.workspaceRoot);
    assertLexicallyContained(root, target, { name: "atomic output" });
  }
  assertNoSymlinkComponents(parent);
  const parentStat = tryLstat(parent);
  if (!parentStat?.isDirectory() || parentStat.isSymbolicLink()) {
    fail("unsafe-output-parent", `atomic output parent must be a non-symlink directory: ${parent}`, { path: parent });
  }
  const targetStat = tryLstat(target);
  if (targetStat?.isSymbolicLink() || (targetStat !== null && !targetStat.isFile())) {
    fail("unsafe-output-target", `atomic output must be absent or a regular non-symlink file: ${target}`, { path: target });
  }
  if (mode === "create" && targetStat !== null) fail("output-exists", `create target already exists: ${target}`, { path: target });

  let temporary;
  let descriptor;
  let createPublished = false;
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      temporary = temporaryPathFor(target);
      try {
        descriptor = openSync(temporary, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL, options.fileMode ?? 0o600);
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    }
    if (descriptor === undefined) fail("temp-file-collision", "could not allocate an adjacent exclusive temporary file", { path: target });
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    options.testHooks?.afterTempFlush?.({ target, temporary, mode });
    if (options.expectedTarget !== undefined) {
      validateExpectedTarget(target, options.expectedTarget, { workspaceRoot: options.workspaceRoot });
    }
    if (options.protectedPaths !== undefined) assertNoProtectedTargetAlias(target, options.protectedPaths);
    options.validateBeforePublish?.(Object.freeze({ target, temporary, mode, bytes: bytes.length, sha256: digest }));
    if (options.testOnlyInjectFailure === "before-publish") {
      fail("injected-write-failure", "injected failure before atomic publication", { path: target });
    }
    if (mode === "create") {
      linkSync(temporary, target);
      createPublished = true;
      unlinkSync(temporary);
      temporary = undefined;
    } else {
      renameSync(temporary, target);
      temporary = undefined;
    }
    syncDirectoryBestEffort(parent);
    return Object.freeze({ path: target, bytes: bytes.length, sha256: digest, mode });
  } catch (error) {
    if (createPublished) {
      try { unlinkSync(target); } catch { /* cleanup below still removes the temp name */ }
    }
    if (error instanceof RuntimeError) throw error;
    const code = mode === "create" && error?.code === "EEXIST" ? "output-exists" : "atomic-write-failed";
    fail(code, `cannot atomically ${mode} ${target}: ${error.message}`, { path: target, cause: error });
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve the primary failure */ }
    }
    if (temporary !== undefined) {
      try { unlinkSync(temporary); } catch { /* preserve the primary failure */ }
    }
  }
}

/** Create an exclusive adjacent directory for staged output construction. */
export function createStagedDirectory(targetPath, options = {}) {
  const target = resolve(targetPath);
  const parent = dirname(target);
  if (options.workspaceRoot !== undefined) {
    assertLexicallyContained(resolve(options.workspaceRoot), target, { name: "staged-directory target" });
  }
  assertNoSymlinkComponents(parent);
  const parentStat = tryLstat(parent);
  if (!parentStat?.isDirectory() || parentStat.isSymbolicLink()) {
    fail("unsafe-output-parent", `staged-directory parent must be a non-symlink directory: ${parent}`, { path: parent });
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const stagedPath = join(parent, `.${basename(target)}.stage-${process.pid}-${randomBytes(8).toString("hex")}`);
    try {
      mkdirSync(stagedPath, { mode: options.mode ?? 0o700 });
      return stagedPath;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        fail("staged-directory-create-failed", `cannot create adjacent staged directory: ${error.message}`, { path: target, cause: error });
      }
    }
  }
  fail("staged-directory-collision", "could not allocate an adjacent staged directory", { path: target });
}

/**
 * Publish an adjacent staged directory to an absent destination, or reuse an
 * existing directory only when verifyExisting proves exact entry/digest
 * equality. The verifier owns recursive membership and digest validation.
 * Portable Node has no renameat2(RENAME_NOREPLACE), so this API rechecks the
 * destination immediately before rename but still requires a trusted immutable
 * parent namespace for the final lookup or reuse cleanup. On failed validation,
 * the staged directory is retained and an existing destination is never removed.
 */
export function publishStagedDirectory(stagedPath, targetPath, options = {}) {
  const staged = resolve(stagedPath);
  const target = resolve(targetPath);
  const parent = dirname(target);
  if (dirname(staged) !== parent || staged === target) {
    fail("invalid-staged-directory", "staged directory must be adjacent to and distinct from its destination", { path: staged });
  }
  if (options.validateBeforePublish !== undefined && typeof options.validateBeforePublish !== "function") {
    fail("invalid-publish-validator", "validateBeforePublish must be a function");
  }
  if (options.verifyExisting !== undefined && typeof options.verifyExisting !== "function") {
    fail("invalid-existing-directory-verifier", "verifyExisting must be a function");
  }
  if (options.workspaceRoot !== undefined) {
    const root = resolve(options.workspaceRoot);
    assertLexicallyContained(root, staged, { name: "staged directory" });
    assertLexicallyContained(root, target, { name: "staged-directory target" });
  }
  assertNoSymlinkComponents(staged);
  assertNoSymlinkComponents(parent);
  const stagedStat = tryLstat(staged);
  if (!stagedStat?.isDirectory() || stagedStat.isSymbolicLink()) {
    fail("invalid-staged-directory", "staged path must be an existing non-symlink directory", { path: staged });
  }

  options.testHooks?.beforeDirectoryPublish?.({ staged, target });
  assertNoSymlinkComponents(staged);
  assertNoSymlinkComponents(parent);
  const targetStat = tryLstat(target);
  if (targetStat !== null) {
    if (options.verifyExisting === undefined) {
      fail("output-exists", "staged-directory destination already exists", { path: target });
    }
    assertNoSymlinkComponents(target);
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      fail("unsafe-output-target", "existing staged-directory destination must be a non-symlink directory", { path: target });
    }
    const expectedIdentity = identityFromStat(targetStat);
    const verified = options.verifyExisting(Object.freeze({ staged, target })) === true;
    assertNoSymlinkComponents(staged);
    assertNoSymlinkComponents(target);
    const finalStagedStat = tryLstat(staged);
    const finalTargetStat = tryLstat(target);
    if (
      !finalStagedStat?.isDirectory()
      || finalStagedStat.isSymbolicLink()
      || !finalTargetStat?.isDirectory()
      || finalTargetStat.isSymbolicLink()
      || !identitiesEqual(expectedIdentity, identityFromStat(finalTargetStat))
    ) {
      fail("staged-directory-changed", "staged or existing directory changed during verification", { path: target });
    }
    if (!verified) fail("staged-directory-mismatch", "existing directory does not exactly match the staged directory", { path: target });
    options.validateBeforePublish?.(Object.freeze({ staged, target, reused: true }));
    rmSync(staged, { recursive: true });
    syncDirectoryBestEffort(parent);
    return Object.freeze({ path: target, reused: true });
  }

  options.validateBeforePublish?.(Object.freeze({ staged, target, reused: false }));
  assertNoSymlinkComponents(staged);
  assertNoSymlinkComponents(parent);
  if (tryLstat(target) !== null) fail("output-exists", "staged-directory destination appeared before publication", { path: target });
  try {
    renameSync(staged, target);
    syncDirectoryBestEffort(parent);
    return Object.freeze({ path: target, reused: false });
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    fail("staged-directory-publish-failed", `cannot publish staged directory: ${error.message}`, { path: target, cause: error });
  }
}

/** Create mutable state for CommonMark-compatible fenced-code tracking. */
export function createFenceState() {
  return { open: false, marker: null, length: 0, line: null, info: null };
}

/** Advance fenced-code state for one source line and report open/close events. */
export function updateFenceState(state, line, lineNumber) {
  assertClosedRecord(state, { name: "fence state", required: ["open", "marker", "length", "line", "info"] });
  assertUnicodeScalarString(line, { name: "fence line" });
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) fail("invalid-line-number", "fence line number must be a positive safe integer");

  if (!state.open) {
    const opener = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
    if (!opener || (opener[1][0] === "`" && opener[2].includes("`"))) return null;
    state.open = true;
    state.marker = opener[1][0];
    state.length = opener[1].length;
    state.line = lineNumber;
    state.info = opener[2].trim();
    return Object.freeze({ type: "open", marker: state.marker, length: state.length, line: lineNumber, info: state.info });
  }

  const closer = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  if (!closer || closer[1][0] !== state.marker || closer[1].length < state.length) return null;
  const event = Object.freeze({ type: "close", marker: state.marker, length: closer[1].length, line: lineNumber, openLine: state.line });
  state.open = false;
  state.marker = null;
  state.length = 0;
  state.line = null;
  state.info = null;
  return event;
}

/** Require a value to match an expected immutable configuration. */
export function assertConfiguration(value, expected, name = "configuration") {
  if (!isDeepStrictEqual(value, expected)) fail("configuration-mismatch", `${name} does not match the expected value`);
  return value;
}
