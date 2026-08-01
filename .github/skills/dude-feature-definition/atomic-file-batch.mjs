// @ts-check
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { types as utilTypes } from 'node:util';

import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseFrontmatterScalars } from '../dude-engine/lib/feature-identity.mjs';
import {
  BOARD_END,
  BOARD_NOTICE,
  BOARD_START,
  CANONICAL_NOTICE,
  parseVisibleTasks,
  scanMarkdownVisibility as scanSharedMarkdownVisibility,
} from '../dude-engine/lib/tasks.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import {
  buildDefinitionRecoveryLearningFindingV1,
  canonicalJson,
  capturedBytesV1,
  composeDefinitionRecoveryV1,
  evaluateDefinitionRevisionV1,
  revalidateDefinitionRevisionReviewIdentityV1,
  validateDefinitionRecoveryAuthorizationShapeV1,
  validateDefinitionRecoveryAuthorizationV1,
} from '../dude-work/recovery.mjs';

const MISSING = 'missing';
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_DEFINITION_ARTIFACT_BYTES = 1_048_576;
const MAX_ATOMIC_ARRAY_ENTRIES = 64;
const ASYNC_FUNCTION_PROTOTYPE = Object.getPrototypeOf(async function () {});
const GENERATOR_FUNCTION_PROTOTYPE = Object.getPrototypeOf(function* () {});
const ASYNC_GENERATOR_FUNCTION_PROTOTYPE = Object.getPrototypeOf(async function* () {});
const DEFINITION_RECOVERY_COORDINATOR_CAPABILITIES = new WeakMap();
const DEFINITION_RECOVERY_PREPARATIONS = new WeakMap();

/**
 * @typedef {{path: string, expected: Buffer | 'missing', staged: Buffer}} AtomicFileChange
 * @typedef {(view: ReadonlyArray<Readonly<{path: string, staged: Buffer}>>) => unknown} AtomicFileValidator
 * @typedef {(view: ReadonlyArray<Readonly<{path: string, expected: Buffer | 'missing', staged: Buffer}>>) => unknown} DefinitionReconciliationValidator
 * @typedef {(event: Readonly<{operation: string, path: string | null, index: number}>) => unknown} FailureInjector
 * @typedef {{
 *   path: string,
 *   expected: Buffer | 'missing',
 *   staged: Buffer,
 *   absolutePath: string,
 *   priorBytes: Buffer | null,
 *   temporaryPath: string | null,
 * }} PreparedChange
 */

/**
 * @param {unknown} value
 * @param {string} label
 * @param {string[]} required
 * @param {string[]} [optional]
 */
function assertClosedRecord(value, label, required, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a record`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(`${label} has unknown field ${String(key)}`);
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label} is missing ${key}`);
  }
}

/** @param {unknown} value @param {string} label */
function assertDenseArray(value, label) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) throw new TypeError(`${label} must be an array`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) {
    throw new TypeError(`${label} must have a plain array prototype`);
  }
  if (value.length > MAX_ATOMIC_ARRAY_ENTRIES) {
    throw new TypeError(`${label} exceeds the ${MAX_ATOMIC_ARRAY_ENTRIES}-entry bound`);
  }
  const indexes = new Set(Array.from({ length: value.length }, (_, index) => String(index)));
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !indexes.has(key)) {
      throw new TypeError(`${label} has unknown entry ${String(key)}`);
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label}[${key}] must be an enumerable data property`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must be dense`);
  }
}

/** @param {unknown} value @param {string} label */
function assertHash(value, label) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 identity`);
  }
}

/** @param {unknown} value @param {string} label */
function assertSynchronousFunction(value, label) {
  const prototype = typeof value === 'function' && !utilTypes.isProxy(value)
    ? Object.getPrototypeOf(value)
    : null;
  if (typeof value !== 'function'
    || utilTypes.isProxy(value)
    || utilTypes.isAsyncFunction(value)
    || utilTypes.isGeneratorFunction(value)
    || prototype === ASYNC_FUNCTION_PROTOTYPE
    || prototype === GENERATOR_FUNCTION_PROTOTYPE
    || prototype === ASYNC_GENERATOR_FUNCTION_PROTOTYPE) {
    throw new TypeError(`${label} must be a synchronous function`);
  }
}

/** @param {Buffer} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} relativePath @param {Buffer} bytes */
function contentDescriptor(relativePath, bytes) {
  return { path: relativePath, sha256: sha256(bytes), byteLength: bytes.byteLength };
}

/** @param {unknown} value */
function detachCoordinatorData(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (Array.isArray(value)) return value.map(detachCoordinatorData);
  if (value !== null && typeof value === 'object') {
    const clone = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
    for (const key of Object.keys(value)) {
      Object.defineProperty(clone, key, {
        value: detachCoordinatorData(value[key]),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return clone;
  }
  return value;
}

/** @template T @param {T} value @returns {T} */
function deepFreezeData(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreezeData(value[key]);
    Object.freeze(value);
  }
  return value;
}

/** @param {string} value */
function assertCanonicalPath(value) {
  if (!value
    || value.includes('\\')
    || value.includes('\0')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
    || value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`unsafe workspace-relative path: ${value}`);
  }
}

/** @param {string} left @param {string} right */
function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/** @param {string} absolutePath @returns {fs.Stats | null} */
function lstatOrNull(absolutePath) {
  try {
    return fs.lstatSync(absolutePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** @param {string} root @param {string} relativePath */
function inspectTarget(root, relativePath) {
  const absolutePath = resolveMutationPath(root, relativePath);
  const current = lstatOrNull(absolutePath);
  if (!current) return { absolutePath, bytes: null };
  if (current.isSymbolicLink() || !current.isFile()) {
    throw new Error(`atomic file target must be a regular file: ${relativePath}`);
  }
  return { absolutePath, bytes: fs.readFileSync(absolutePath) };
}

/**
 * @param {Pick<PreparedChange, 'path' | 'expected'>} change
 * @param {{bytes: Buffer | null}} current
 */
function assertExpected(change, current) {
  if (change.expected === MISSING) {
    if (current.bytes !== null) throw new Error(`expected atomic file target to be missing: ${change.path}`);
  } else if (current.bytes === null || !current.bytes.equals(change.expected)) {
    throw new Error(`atomic file target does not match expected bytes: ${change.path}`);
  }
}

/**
 * @param {FailureInjector | undefined} failureInjector
 * @param {string} operation
 * @param {string | null} relativePath
 * @param {number} index
 */
function inject(failureInjector, operation, relativePath, index) {
  if (!failureInjector) return;
  const result = failureInjector(Object.freeze({ operation, path: relativePath, index }));
  assertSynchronousResult(result, 'failureInjector');
}

/** @param {unknown} result @param {string} label */
function assertSynchronousResult(result, label) {
  if (result === null || (typeof result !== 'object' && typeof result !== 'function')) return;
  if (utilTypes.isPromise(result) || utilTypes.isProxy(result) || utilTypes.isGeneratorObject(result)) {
    throw new TypeError(`${label} must be synchronous`);
  }
  let cursor = result;
  for (let depth = 0; cursor !== null && depth < 64; depth += 1) {
    if (utilTypes.isProxy(cursor)) throw new TypeError(`${label} must be synchronous`);
    if (Object.getOwnPropertyDescriptor(cursor, 'then')
      || Object.getOwnPropertyDescriptor(cursor, 'next')
      || Object.getOwnPropertyDescriptor(cursor, Symbol.iterator)
      || Object.getOwnPropertyDescriptor(cursor, Symbol.asyncIterator)) {
      throw new TypeError(`${label} must be synchronous`);
    }
    cursor = Object.getPrototypeOf(cursor);
  }
  if (cursor !== null) throw new TypeError(`${label} must be synchronous`);
}

/**
 * @param {string} root
 * @param {PreparedChange} change
 * @param {Array<{absolutePath: string, path: string}>} createdDirectories
 * @param {FailureInjector | undefined} failureInjector
 * @param {number} index
 */
function ensureParentDirectories(root, change, createdDirectories, failureInjector, index) {
  const parts = change.path.split('/').slice(0, -1);
  let cursor = root;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    cursor = path.join(cursor, parts[partIndex]);
    const directoryPath = parts.slice(0, partIndex + 1).join('/');
    const current = lstatOrNull(cursor);
    if (current) {
      if (current.isSymbolicLink() || !current.isDirectory()) {
        throw new Error(`atomic file target has unsafe parent: ${directoryPath}`);
      }
    } else {
      inject(failureInjector, 'mkdir', directoryPath, index);
      try {
        fs.mkdirSync(cursor);
        createdDirectories.push({ absolutePath: cursor, path: directoryPath });
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
        const raced = lstatOrNull(cursor);
        if (!raced || raced.isSymbolicLink() || !raced.isDirectory()) {
          throw new Error(`atomic file target has unsafe parent: ${directoryPath}`);
        }
      }
    }
  }
}

/**
 * @param {string} root
 * @param {PreparedChange} change
 * @param {Buffer} bytes
 * @param {'stage' | 'rollback'} kind
 * @param {number} index
 * @param {Set<string>} forbiddenPaths
 * @param {Map<string, string>} temporaryPaths
 * @param {FailureInjector | undefined} failureInjector
 */
function writeSiblingTemp(
  root,
  change,
  bytes,
  kind,
  index,
  forbiddenPaths,
  temporaryPaths,
  failureInjector,
) {
  if (resolveMutationPath(root, change.path) !== change.absolutePath) {
    throw new Error(`atomic file path changed: ${change.path}`);
  }
  const parent = path.dirname(change.absolutePath);
  let descriptor = null;
  let temporaryPath = '';
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    temporaryPath = path.join(parent, `.dude-atomic-${kind}-${index}-${attempt}.tmp`);
    if (forbiddenPaths.has(temporaryPath)) continue;
    try {
      descriptor = fs.openSync(temporaryPath, 'wx');
      temporaryPaths.set(temporaryPath, change.path);
      break;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') continue;
      throw error;
    }
  }
  if (descriptor === null) throw new Error(`could not allocate sibling temporary file: ${change.path}`);
  try {
    inject(failureInjector, `${kind}-write`, change.path, index);
    fs.writeFileSync(descriptor, bytes);
  } finally {
    fs.closeSync(descriptor);
  }
  return temporaryPath;
}

/** @param {string} temporaryPath @param {string} relativePath */
function assertTemporaryFile(temporaryPath, relativePath) {
  const current = lstatOrNull(temporaryPath);
  if (!current || current.isSymbolicLink() || !current.isFile()) {
    throw new Error(`staged temporary file is unsafe: ${relativePath}`);
  }
}

/** @param {string} temporaryPath @param {string} relativePath @param {Buffer} staged */
function assertStagedTemporaryFile(temporaryPath, relativePath, staged) {
  assertTemporaryFile(temporaryPath, relativePath);
  if (!fs.readFileSync(temporaryPath).equals(staged)) {
    throw new Error(`staged temporary file does not match staged bytes: ${relativePath}`);
  }
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {Array<{operation: string, path: string | null, message: string}>} errors
 * @param {string} operation
 * @param {string | null} relativePath
 * @param {() => void} action
 */
function captureRollbackError(errors, operation, relativePath, action) {
  try {
    action();
  } catch (error) {
    errors.push({ operation, path: relativePath, message: errorMessage(error) });
  }
}

/**
 * @param {unknown} cause
 * @param {ReadonlyArray<{operation: string, path: string | null, message: string}>} rollbackErrors
 */
function incompleteRollback(cause, rollbackErrors) {
  return Object.assign(
    new Error('atomic file batch failed and rollback or cleanup was incomplete', { cause }),
    {
      name: 'AtomicFileBatchRollbackError',
      code: 'ATOMIC_FILE_BATCH_ROLLBACK_FAILED',
      rollbackErrors: Object.freeze(rollbackErrors.map((entry) => Object.freeze({ ...entry }))),
    },
  );
}

/**
 * Refuse tracked definition recovery before entering any filesystem helper.
 * @param {{lane: 'lightweight' | 'tracked'}} options
 */
export function assertDefinitionRecoveryWritable(options) {
  assertClosedRecord(options, 'definition recovery options', ['lane']);
  if (options.lane !== 'lightweight' && options.lane !== 'tracked') {
    throw new TypeError('definition recovery lane must be lightweight or tracked');
  }
  if (options.lane === 'tracked') {
    throw Object.assign(
      new Error('tracked definition recovery is unsupported before filesystem mutation'),
      { name: 'DefinitionRecoveryRefusalError', code: 'tracked-definition-recovery-unsupported' },
    );
  }
}

/**
 * Public atomic batch entry kept adjacent to the filesystem-free tracked
 * refusal guard; the implementation is declared later in this module.
 * @param {{root:string,changes:AtomicFileChange[],validators?:AtomicFileValidator[],failureInjector?:FailureInjector}} options
 * @param {AtomicFileValidator} [afterApply]
 */
export function applyAtomicFileBatch(options, afterApply) {
  return applyAtomicFileBatchInternal(options, afterApply);
}

/** @param {string} root @param {string} specPath @param {string | undefined} expectedIdeaPath */
function requireDefinitionOwner(root, specPath, expectedIdeaPath) {
  const resolved = resolveFeatureOwner({ root, specPath });
  if (resolved.diagnostics.length !== 0 || resolved.owner === null) {
    throw new Error(`definition recovery requires one exact defined owner for '${specPath}'`);
  }
  if (resolved.owner.specPath !== specPath
    || (expectedIdeaPath !== undefined && resolved.owner.ideaPath !== expectedIdeaPath)) {
    throw new Error(`definition recovery owner does not match '${specPath}'`);
  }
  return resolved.owner;
}

/** @param {Buffer} bytes @param {string} specPath @param {string} state */
function assertDefinitionOwner(bytes, specPath, state) {
  let frontmatter;
  try {
    frontmatter = parseFrontmatterScalars(bytes.toString('utf8'), {
      canonicalKeys: ['title', 'slug', 'status', 'spec_path'],
    });
  } catch (error) {
    throw new Error(`${state} definition owner is malformed`, { cause: error });
  }
  if (frontmatter.scalars.get('status')?.value !== 'defined') {
    throw new Error(`${state} definition owner must have status: defined`);
  }
  if (frontmatter.scalars.get('spec_path')?.value !== specPath) {
    throw new Error(`${state} definition owner must have spec_path: ${specPath}`);
  }
}

/** @param {Buffer} bytes */
function byteLines(bytes) {
  /** @type {Array<{start: number, contentEnd: number, end: number}>} */
  const lines = [];
  let start = 0;
  let index = 0;
  while (index < bytes.length) {
    if (bytes[index] !== 0x0a && bytes[index] !== 0x0d) {
      index += 1;
      continue;
    }
    const contentEnd = index;
    index += bytes[index] === 0x0d && bytes[index + 1] === 0x0a ? 2 : 1;
    lines.push({ start, contentEnd, end: index });
    start = index;
  }
  lines.push({ start, contentEnd: bytes.length, end: bytes.length });
  return lines;
}

/**
 * @param {Buffer} bytes
 * @param {string} state
 * @returns {Array<{start:number,contentEnd:number,end:number,text:string}>}
 */
function activeMarkdownLines(bytes, state) {
  return scanSharedMarkdownVisibility(bytes, state, 'generic').lines;
}

/**
 * @param {Array<{start:number,contentEnd:number,end:number,text:string}>} lines
 * @param {string} state
 * @param {number} endOffset
 */
function assertBalancedDudeRegionLines(lines, state, endOffset) {
  /** @type {{name:string,start:number}|null} */
  let open = null;
  /** @type {Map<string, number>} */
  const pairs = new Map();
  for (const line of lines) {
    if (line.start >= endOffset) break;
    const marker = /^<!-- dude:([a-z0-9-]+):(start|end) -->$/.exec(line.text);
    if (!marker) continue;
    const [, name, edge] = marker;
    if (edge === 'start') {
      if (open) throw new Error(`${state} definition artifact has nested ${name} managed fence`);
      open = { name, start: line.start };
      continue;
    }
    if (!open || open.name !== name) {
      throw new Error(`${state} definition artifact has a reversed or stray ${name} managed end fence`);
    }
    pairs.set(name, (pairs.get(name) ?? 0) + 1);
    open = null;
  }
  if (open) throw new Error(`${state} definition artifact has an unclosed ${open.name} managed fence`);
  for (const [name, count] of pairs) {
    if (count > 1) throw new Error(`${state} definition artifact has duplicate ${name} managed regions`);
  }
}

/** @param {Buffer} bytes @param {string} state @param {number} [endOffset] */
function assertBalancedActiveDudeRegions(bytes, state, endOffset = bytes.length) {
  assertBalancedDudeRegionLines(activeMarkdownLines(bytes, state), state, endOffset);
}

/** @param {Buffer} bytes @param {string} state */
function extractManagedCoordinatorLog(bytes, state) {
  const lines = activeMarkdownLines(bytes, state);
  const startMarker = '<!-- dude:managed:start -->';
  const endMarker = '<!-- dude:managed:end -->';
  const starts = lines.filter((line) => line.text === startMarker);
  const ends = lines.filter((line) => line.text === endMarker);
  if (starts.length !== 1 || ends.length !== 1 || starts[0].start >= ends[0].start) {
    throw new Error(`${state} definition owner must contain exactly one balanced active managed region`);
  }
  const nestedMarker = lines.find((line) => (
    line.start > starts[0].start
    && line.start < ends[0].start
    && (line.text === startMarker || line.text === endMarker)
  ));
  if (nestedMarker) throw new Error(`${state} definition owner has a nested managed region`);

  const headings = lines.filter((line) => (
    /^ {0,3}##[ \t]+Coordinator Log(?:[ \t]+#+)?[ \t]*$/.test(line.text)
  ));
  if (headings.length !== 1
    || headings[0].start <= starts[0].start
    || headings[0].start >= ends[0].start) {
    throw new Error(`${state} definition owner must contain exactly one Coordinator Log inside its managed region`);
  }
  const laterHeading = lines.find((line) => (
    line.start > headings[0].start
    && line.start < ends[0].start
    && /^ {0,3}#{1,2}(?:[ \t]+|$)/.test(line.text)
  ));
  if (laterHeading) {
    throw new Error(`${state} Coordinator Log must be the terminal managed section`);
  }
  return Buffer.from(bytes.subarray(headings[0].start, ends[0].start));
}

/** @param {Buffer} current @param {Buffer} staged */
function assertCoordinatorLogAppendOnly(current, staged) {
  const currentLog = extractManagedCoordinatorLog(current, 'current');
  const stagedLog = extractManagedCoordinatorLog(staged, 'staged');
  for (const [state, log] of [['current', currentLog], ['staged', stagedLog]]) {
    const lines = byteLines(log);
    const contentLines = lines.slice(0, lines.at(-1)?.start === log.length ? -1 : undefined);
    if (!contentLines[0]
      || !/^ {0,3}##[ \t]+Coordinator Log(?:[ \t]+#+)?[ \t]*$/.test(
        log.subarray(contentLines[0].start, contentLines[0].contentEnd).toString('utf8'),
      )
      || contentLines.slice(1).some((line) => {
        const text = log.subarray(line.start, line.contentEnd).toString('utf8');
        return text !== '' && !/^- \S.*$/.test(text);
      })) {
      throw new Error(`${state} Coordinator Log must contain only complete event lines`);
    }
  }
  if (stagedLog.length < currentLog.length
    || !stagedLog.subarray(0, currentLog.length).equals(currentLog)) {
    throw new Error('staged Coordinator Log must preserve the exact current log prefix');
  }
  const appended = stagedLog.subarray(currentLog.length);
  if (appended.length === 0) return;
  const lines = byteLines(appended);
  const terminal = lines[lines.length - 1];
  if (terminal.start !== appended.length || terminal.contentEnd !== appended.length) {
    throw new Error('staged Coordinator Log must append only complete event lines');
  }
  for (const line of lines.slice(0, -1)) {
    const text = appended.subarray(line.start, line.contentEnd).toString('utf8');
    if (!/^- \S.*$/.test(text)) {
      throw new Error('staged Coordinator Log must append only complete event lines');
    }
  }
}

/** @param {Buffer} bytes @param {string} state @param {string} taskPath @param {string} ownerPath */
function parseDefinitionTasks(bytes, state, taskPath, ownerPath) {
  const scanned = parseVisibleTasks(bytes, { state, path: taskPath });
  const { parsed } = scanned;
  if (parsed.warnings.length > 0) {
    throw new Error(`${state} tasks are malformed: ${parsed.warnings.join('; ')}`);
  }
  assertBalancedDudeRegionLines(scanned.lines, `${state} tasks`, scanned.activeEnd);

  let auditIndex = 0;
  if (parsed.board) {
    if (parsed.board.startLine !== 0
      || parsed.lines[1] !== BOARD_NOTICE
      || parsed.lines[parsed.board.endLine] !== BOARD_END) {
      throw new Error(`${state} tasks have a malformed generated board preamble`);
    }
    auditIndex = parsed.board.endLine + 1;
    while (auditIndex < parsed.lines.length && parsed.lines[auditIndex].trim() === '') auditIndex += 1;
    if (parsed.lines[auditIndex] !== CANONICAL_NOTICE) {
      throw new Error(`${state} tasks board must be followed by the canonical notice`);
    }
    auditIndex += 1;
    while (auditIndex < parsed.lines.length && parsed.lines[auditIndex].trim() === '') auditIndex += 1;
  } else if (parsed.lines[0] === BOARD_START) {
    throw new Error(`${state} tasks have a malformed generated board preamble`);
  }
  const audit = `<!-- audit log: ${ownerPath}#coordinator-log -->`;
  if (parsed.lines[auditIndex] !== audit) {
    throw new Error(`${state} tasks must begin with the exact owner audit breadcrumb`);
  }
  const auditCount = parsed.lines
    .filter((line, index) => (
      (!parsed.board || index < parsed.board.startLine || index > parsed.board.endLine)
      && /^<!-- audit log: \.dude\/ideas\/[^/\\#\s]+\.md#coordinator-log -->$/.test(line)
    )).length;
  if (auditCount !== 1) throw new Error(`${state} tasks must contain exactly one canonical audit breadcrumb`);
  if (parsed.tasks.length === 0) throw new Error(`${state} tasks must contain canonical task units`);
  for (const task of parsed.tasks) {
    if (new Set(task.deps).size !== task.deps.length) {
      throw new Error(`${state} task ${task.id} has duplicate dependencies`);
    }
  }

  const boardStartOffset = parsed.board ? scanned.lines[parsed.board.startLine].start : -1;
  const boardEndOffset = parsed.board ? scanned.lines[parsed.board.endLine].end : -1;
  const outsideBoard = scanned.lines.filter((line) => (
    boardStartOffset === -1 || line.start < boardStartOffset || line.start >= boardEndOffset
  ));
  const discoveredHeadings = outsideBoard.filter((line) => (
    /^ {0,3}##[ \t]+Discovered[ \t]+During[ \t]+Execution(?:[ \t]+#+)?[ \t]*$/.test(line.text)
  ));
  if (discoveredHeadings.length > 1) throw new Error(`${state} tasks have duplicate discovered sections`);
  let discovered = null;
  if (discoveredHeadings.length === 1) {
    const start = discoveredHeadings[0].start;
    const laterHeading = outsideBoard.find((line) => (
      line.start > start && /^ {0,3}##(?:[ \t]+|$)/.test(line.text)
    ));
    if (laterHeading) {
      throw new Error(`${state} Discovered During Execution must be the final active H2`);
    }
    discovered = Buffer.from(bytes.subarray(start, scanned.activeEnd));
  }
  const history = scanned.historyOffset !== null
    ? Buffer.from(bytes.subarray(scanned.historyOffset))
    : null;
  return { discovered, history };
}

/** @param {Buffer|null} current @param {Buffer|null} staged */
function historyAppendBytes(current, staged) {
  if (current === null) return staged === null ? null : Buffer.from(staged);
  if (staged === null || staged.length < current.length
    || !staged.subarray(0, current.length).equals(current)) {
    throw new Error('definition recovery must preserve exact terminal execution history bytes');
  }
  if (staged.length > current.length
    && current.length > 0
    && current[current.length - 1] !== 0x0a
    && current[current.length - 1] !== 0x0d
    && staged[current.length] !== 0x0a
    && staged[current.length] !== 0x0d) {
    throw new Error('definition recovery history append must begin on a complete logical line');
  }
  return staged.length === current.length ? null : Buffer.from(staged.subarray(current.length));
}

/**
 * @param {Map<string, Buffer>} expectedByPath
 * @param {Map<string, Buffer>} stagedByPath
 * @param {string} ownerPath
 * @param {string} specPath
 */
function inspectDefinitionRecoveryStructure(expectedByPath, stagedByPath, ownerPath, specPath) {
  const packagePrefix = specPath.slice(0, -'spec.md'.length);
  const taskPath = `${packagePrefix}tasks.md`;
  const currentOwner = expectedByPath.get(ownerPath);
  const stagedOwner = stagedByPath.get(ownerPath);
  if (!currentOwner || !stagedOwner) throw new Error('definition recovery is missing owner bytes');
  assertDefinitionOwner(currentOwner, specPath, 'current');
  assertDefinitionOwner(stagedOwner, specPath, 'staged');
  assertBalancedActiveDudeRegions(currentOwner, 'current owner');
  assertBalancedActiveDudeRegions(stagedOwner, 'staged owner');
  assertCoordinatorLogAppendOnly(currentOwner, stagedOwner);
  assertProtectedOwnerSectionsUnchanged(currentOwner, stagedOwner);

  for (const relativePath of [`${packagePrefix}plan.md`, specPath]) {
    const current = expectedByPath.get(relativePath);
    const staged = stagedByPath.get(relativePath);
    if (!current || !staged) throw new Error(`definition recovery is missing bytes: ${relativePath}`);
    assertBalancedActiveDudeRegions(current, `current ${relativePath}`);
    assertBalancedActiveDudeRegions(staged, `staged ${relativePath}`);
  }
  const currentTasksBytes = expectedByPath.get(taskPath);
  const stagedTasksBytes = stagedByPath.get(taskPath);
  if (!currentTasksBytes || !stagedTasksBytes) throw new Error('definition recovery is missing tasks bytes');
  const currentTasks = parseDefinitionTasks(currentTasksBytes, 'current', taskPath, ownerPath);
  const stagedTasks = parseDefinitionTasks(stagedTasksBytes, 'staged', taskPath, ownerPath);
  if ((currentTasks.discovered === null) !== (stagedTasks.discovered === null)
    || (currentTasks.discovered && stagedTasks.discovered
      && !currentTasks.discovered.equals(stagedTasks.discovered))) {
    throw new Error('definition recovery must preserve exact Discovered During Execution bytes');
  }
  return {
    taskPath,
    historyAppend: historyAppendBytes(currentTasks.history, stagedTasks.history),
  };
}

/**
 * @param {Buffer} bytes
 * @param {string} state
 * @returns {Map<string, Buffer>}
 */
function extractProtectedOwnerSections(bytes, state) {
  const names = ['Idea', 'Open Questions', 'Assumptions'];
  const lines = activeMarkdownLines(bytes, state);
  /** @type {Array<{start: number, name: string | null}>} */
  const boundaries = [];
  /** @type {Map<string, number[]>} */
  const occurrences = new Map(names.map((name) => [name, []]));

  for (const line of lines) {
    if (!/^ {0,3}##(?:[ \t]+|$)/.test(line.text)) continue;
    const protectedHeading = /^ {0,3}##[ \t]+(Idea|Open Questions|Assumptions)(?:[ \t]+#+)?[ \t]*$/.exec(line.text);
    const boundaryIndex = boundaries.length;
    boundaries.push({ start: line.start, name: protectedHeading?.[1] ?? null });
    if (protectedHeading) occurrences.get(protectedHeading[1])?.push(boundaryIndex);
  }

  const indexes = names.map((name) => {
    const matches = occurrences.get(name) ?? [];
    if (matches.length !== 1) {
      throw new Error(`${state} definition owner must contain exactly one top-level ## ${name} section`);
    }
    return matches[0];
  });
  if (!(indexes[0] < indexes[1] && indexes[1] < indexes[2])) {
    throw new Error(`${state} definition owner sections must be ordered ## Idea, ## Open Questions, ## Assumptions`);
  }

  /** @type {Map<string, Buffer>} */
  const sections = new Map();
  for (let index = 0; index < names.length; index += 1) {
    const boundaryIndex = indexes[index];
    const end = boundaries[boundaryIndex + 1]?.start ?? bytes.length;
    sections.set(names[index], Buffer.from(bytes.subarray(boundaries[boundaryIndex].start, end)));
  }
  return sections;
}

/** @param {Buffer} current @param {Buffer} staged */
function assertProtectedOwnerSectionsUnchanged(current, staged) {
  const currentSections = extractProtectedOwnerSections(current, 'current');
  const stagedSections = extractProtectedOwnerSections(staged, 'staged');
  for (const name of ['Idea', 'Open Questions', 'Assumptions']) {
    if (!currentSections.get(name)?.equals(stagedSections.get(name))) {
      throw new Error(`definition recovery must preserve complete ## ${name} section bytes`);
    }
  }
}

/** @param {string} ideaPath @param {string} specPath */
function definitionRecoveryPaths(ideaPath, specPath) {
  const packagePrefix = specPath.slice(0, -'spec.md'.length);
  return [ideaPath, `${packagePrefix}plan.md`, specPath, `${packagePrefix}tasks.md`]
    .sort(comparePaths);
}

/**
 * @param {unknown} value
 * @param {ReadonlyArray<string>} expectedPaths
 * @returns {Map<string, AtomicFileChange>}
 */
function validateDefinitionRecoveryChanges(value, expectedPaths) {
  assertDenseArray(value, 'changes');
  if (value.length !== expectedPaths.length) {
    throw new Error('definition recovery requires exactly owner, spec.md, plan.md, and tasks.md changes');
  }
  const expectedSet = new Set(expectedPaths);
  /** @type {Map<string, AtomicFileChange>} */
  const changesByPath = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const change = value[index];
    assertClosedRecord(change, `changes[${index}]`, ['path', 'expected', 'staged']);
    if (typeof change.path !== 'string' || !expectedSet.has(change.path)) {
      throw new Error(`definition recovery path is outside the exact four-file scope: ${String(change.path)}`);
    }
    if (changesByPath.has(change.path)) {
      throw new Error(`definition recovery path must occur exactly once: ${change.path}`);
    }
    if (change.expected !== MISSING && !Buffer.isBuffer(change.expected)) {
      throw new TypeError(`changes[${index}].expected must be a Buffer or "missing"`);
    }
    if (!Buffer.isBuffer(change.staged)) {
      throw new TypeError(`changes[${index}].staged must be a Buffer`);
    }
    changesByPath.set(change.path, /** @type {AtomicFileChange} */ (change));
  }
  for (const expectedPath of expectedPaths) {
    if (!changesByPath.has(expectedPath)) {
      throw new Error(`definition recovery is missing exact scope path: ${expectedPath}`);
    }
  }
  return changesByPath;
}

/** @param {unknown} value @param {ReadonlyArray<string>} expectedPaths @param {string} label */
function validateArtifactDescriptors(value, expectedPaths, label) {
  assertDenseArray(value, label);
  if (value.length !== expectedPaths.length) {
    throw new Error(`${label} must contain exactly four descriptors`);
  }
  return value.map((row, index) => {
    assertClosedRecord(row, `${label}[${index}]`, ['path', 'sha256', 'byteLength']);
    if (row.path !== expectedPaths[index]) {
      throw new Error(`${label}[${index}].path must match the exact four-artifact scope`);
    }
    assertHash(row.sha256, `${label}[${index}].sha256`);
    if (!Number.isSafeInteger(row.byteLength)
      || row.byteLength < 0
      || row.byteLength > MAX_DEFINITION_ARTIFACT_BYTES) {
      throw new TypeError(`${label}[${index}].byteLength is outside the artifact bound`);
    }
    return { path: row.path, sha256: row.sha256, byteLength: row.byteLength };
  });
}

/** @param {ReadonlyArray<{path:string,sha256:string,byteLength:number}>} left @param {ReadonlyArray<{path:string,sha256:string,byteLength:number}>} right @param {string} label */
function assertDescriptorsEqual(left, right, label) {
  if (left.length !== right.length || left.some((row, index) => (
    row.path !== right[index].path
    || row.sha256 !== right[index].sha256
    || row.byteLength !== right[index].byteLength
  ))) throw new Error(`${label} do not match exact artifact bytes`);
}

/** @param {ReadonlyArray<string>} paths @param {Map<string, Buffer>} bytesByPath */
function descriptorsFor(paths, bytesByPath) {
  return paths.map((relativePath) => {
    const bytes = bytesByPath.get(relativePath);
    if (!bytes) throw new Error(`missing descriptor bytes: ${relativePath}`);
    return contentDescriptor(relativePath, bytes);
  });
}

/**
 * @param {unknown} value
 * @param {ReadonlyArray<string>} expectedPaths
 * @param {Map<string, Buffer>} expectedByPath
 * @param {Map<string, Buffer>} stagedByPath
 */
function validateDefinitionRecoveryBinding(value, expectedPaths, expectedByPath, stagedByPath) {
  assertClosedRecord(
    value,
    'definition recovery binding',
    [
      'proposalIdentity', 'prestateDescriptors', 'coordinatorFinalDescriptors',
      'reconciliationIdentity', 'review',
    ],
  );
  assertHash(value.proposalIdentity, 'definition recovery binding.proposalIdentity');
  assertHash(value.reconciliationIdentity, 'definition recovery binding.reconciliationIdentity');
  const prestateDescriptors = validateArtifactDescriptors(
    value.prestateDescriptors,
    expectedPaths,
    'definition recovery binding.prestateDescriptors',
  );
  const coordinatorFinalDescriptors = validateArtifactDescriptors(
    value.coordinatorFinalDescriptors,
    expectedPaths,
    'definition recovery binding.coordinatorFinalDescriptors',
  );
  assertDescriptorsEqual(
    prestateDescriptors,
    descriptorsFor(expectedPaths, expectedByPath),
    'definition recovery prestate descriptors',
  );
  assertDescriptorsEqual(
    coordinatorFinalDescriptors,
    descriptorsFor(expectedPaths, stagedByPath),
    'definition recovery coordinator-final descriptors',
  );
  assertClosedRecord(
    value.review,
    'definition recovery binding.review',
    ['proposalIdentity', 'reviewIdentity', 'coordinatorFinalDescriptors'],
  );
  assertHash(value.review.proposalIdentity, 'definition recovery binding.review.proposalIdentity');
  assertHash(value.review.reviewIdentity, 'definition recovery binding.review.reviewIdentity');
  if (value.review.proposalIdentity !== value.proposalIdentity) {
    throw new Error('definition recovery review must bind the exact proposal identity');
  }
  const reviewDescriptors = validateArtifactDescriptors(
    value.review.coordinatorFinalDescriptors,
    expectedPaths,
    'definition recovery binding.review.coordinatorFinalDescriptors',
  );
  assertDescriptorsEqual(
    reviewDescriptors,
    coordinatorFinalDescriptors,
    'definition recovery review descriptors',
  );
  return Object.freeze({
    proposalIdentity: value.proposalIdentity,
    reviewIdentity: value.review.reviewIdentity,
    reconciliationIdentity: value.reconciliationIdentity,
    prestateDescriptors: Object.freeze(prestateDescriptors.map((row) => Object.freeze(row))),
    coordinatorFinalDescriptors: Object.freeze(
      coordinatorFinalDescriptors.map((row) => Object.freeze(row)),
    ),
  });
}

/** @param {unknown} value */
function validatePostApplyCapabilities(value) {
  assertClosedRecord(
    value,
    'definition recovery postApply',
    ['recomputeProposalIdentity', 'validateReviewIdentity', 'lint', 'verification'],
  );
  const capabilities = {};
  for (const field of [
    'recomputeProposalIdentity',
    'validateReviewIdentity',
    'lint',
    'verification',
  ]) {
    assertSynchronousFunction(value[field], `definition recovery postApply.${field}`);
    capabilities[field] = value[field];
  }
  return capabilities;
}

/**
 * Seal the exact synchronous callbacks the coordinator supplies to the atomic
 * definition boundary. `applyDefinitionRecovery` accepts only this exact pair;
 * copied or caller-substituted callback objects are unbranded and fail closed.
 * @param {unknown} value
 */
function sealDefinitionRecoveryCoordinatorCapabilities(value) {
  assertClosedRecord(
    value,
    'definition recovery coordinator capabilities',
    ['validateReconciliation', 'postApply'],
  );
  assertSynchronousFunction(
    value.validateReconciliation,
    'definition recovery coordinator capabilities.validateReconciliation',
  );
  const postApply = Object.freeze({ ...validatePostApplyCapabilities(value.postApply) });
  const sealed = Object.freeze({
    validateReconciliation: value.validateReconciliation,
    postApply,
  });
  DEFINITION_RECOVERY_COORDINATOR_CAPABILITIES.set(postApply, value.validateReconciliation);
  return sealed;
}

/** @param {unknown} validator @param {unknown} postApply */
function requireDefinitionRecoveryCoordinatorCapabilities(validator, postApply) {
  if ((postApply === null || typeof postApply !== 'object' || utilTypes.isProxy(postApply))
    || DEFINITION_RECOVERY_COORDINATOR_CAPABILITIES.get(postApply) !== validator) {
    throw new TypeError('definition recovery callbacks must be sealed internal coordinator capabilities');
  }
  return validatePostApplyCapabilities(postApply);
}

/** @param {unknown} value */
function validateDefinitionRecoveryExecutionGates(value) {
  assertClosedRecord(value, 'definition recovery execution gates', ['lint', 'verification']);
  assertSynchronousFunction(value.lint, 'definition recovery execution gates.lint');
  assertSynchronousFunction(value.verification, 'definition recovery execution gates.verification');
  return Object.freeze({ lint: value.lint, verification: value.verification });
}

/** @param {unknown} value @param {string} label */
function validateDefinitionRecoveryGateEvidence(value, label) {
  assertSynchronousResult(value, label);
  assertClosedRecord(value, label, ['status', 'evidenceIdentity']);
  if (value.status !== 'passed') throw new Error(`${label} must report passed fresh evidence`);
  assertHash(value.evidenceIdentity, `${label}.evidenceIdentity`);
  return value;
}

/**
 * Reacquire and validate one exact four-artifact transition without writing or
 * conferring commit authority.
 * @param {string} root @param {string} specPath @param {unknown} changes
 * @param {string|undefined} expectedIdeaPath
 */
function inspectDefinitionRecoveryArtifactTransition(
  root,
  specPath,
  changes,
  expectedIdeaPath,
) {
  const owner = requireDefinitionOwner(root, specPath, expectedIdeaPath);
  const recoveryPaths = definitionRecoveryPaths(owner.ideaPath, specPath);
  const changesByPath = validateDefinitionRecoveryChanges(changes, recoveryPaths);
  /** @type {Map<string, Buffer>} */
  const expectedByPath = new Map();
  /** @type {Map<string, Buffer>} */
  const stagedByPath = new Map();
  for (const relativePath of recoveryPaths) {
    const change = changesByPath.get(relativePath);
    if (!change || change.expected === MISSING) {
      throw new Error(`definition recovery preflight requires existing expected bytes: ${relativePath}`);
    }
    const current = inspectTarget(root, relativePath);
    assertExpected(change, current);
    expectedByPath.set(relativePath, Buffer.from(change.expected));
    stagedByPath.set(relativePath, Buffer.from(change.staged));
  }
  const structure = inspectDefinitionRecoveryStructure(
    expectedByPath,
    stagedByPath,
    owner.ideaPath,
    specPath,
  );
  return { owner, recoveryPaths, changesByPath, expectedByPath, stagedByPath, structure };
}

/**
 * Public read-only validation for the exact artifact grammar used by recovery.
 * It returns descriptors and captured append bytes, never callbacks or a write capability.
 * @param {{root:string,specPath:string,changes:unknown}} options
 */
export function validateDefinitionRecoveryArtifactTransitionV1(options) {
  if (utilTypes.isProxy(options)) throw new TypeError('definition recovery transition options must be a record');
  assertClosedRecord(
    options,
    'definition recovery transition options',
    ['root', 'specPath', 'changes'],
  );
  if (typeof options.root !== 'string' || options.root.length === 0) {
    throw new TypeError('definition recovery transition root must be a non-empty string');
  }
  if (typeof options.specPath !== 'string') {
    throw new TypeError('definition recovery transition specPath must be a string');
  }
  const inspected = inspectDefinitionRecoveryArtifactTransition(
    fs.realpathSync(options.root),
    options.specPath,
    options.changes,
    undefined,
  );
  return deepFreezeData({
    paths: inspected.recoveryPaths.slice(),
    owner: { ideaPath: inspected.owner.ideaPath, specPath: inspected.owner.specPath },
    taskPath: inspected.structure.taskPath,
    prestateDescriptors: descriptorsFor(inspected.recoveryPaths, inspected.expectedByPath),
    finalDescriptors: descriptorsFor(inspected.recoveryPaths, inspected.stagedByPath),
    historyAppend: inspected.structure.historyAppend === null
      ? null
      : capturedBytesV1(inspected.structure.historyAppend),
  });
}

/**
 * Reacquire and parse the exact composed transaction before semantic review.
 * `applyDefinitionRecovery` repeats these checks after review so any intervening
 * drift still fails before or inside the rollback boundary.
 * @param {string} root @param {string} specPath @param {Record<string, unknown>} composed
 */
function preflightDefinitionRecoveryComposition(root, specPath, composed) {
  const proposal = /** @type {Record<string, unknown>} */ (composed.proposal);
  const ownerBinding = /** @type {Record<string, unknown>} */ (proposal.owner);
  const inspected = inspectDefinitionRecoveryArtifactTransition(
    root,
    specPath,
    composed.changes,
    /** @type {string} */ (ownerBinding.ideaPath),
  );
  const {
    owner, recoveryPaths, changesByPath, expectedByPath, stagedByPath, structure,
  } = inspected;
  assertDescriptorsEqual(
    validateArtifactDescriptors(
      proposal.prestateDescriptors,
      recoveryPaths,
      'definition recovery preflight prestateDescriptors',
    ),
    descriptorsFor(recoveryPaths, expectedByPath),
    'definition recovery preflight prestate descriptors',
  );
  assertDescriptorsEqual(
    validateArtifactDescriptors(
      proposal.coordinatorFinalDescriptors,
      recoveryPaths,
      'definition recovery preflight coordinatorFinalDescriptors',
    ),
    descriptorsFor(recoveryPaths, stagedByPath),
    'definition recovery preflight coordinator-final descriptors',
  );
  validateReconciliationEvidence(
    composed.reconciliationEvidence,
    { reconciliationIdentity: composed.reconciliationEvidence.reconciliationIdentity },
    structure.taskPath,
    structure.historyAppend,
  );
  return { owner, recoveryPaths, changesByPath, expectedByPath, stagedByPath, structure };
}

/**
 * Complete deterministic preparation before any semantic review is acquired.
 * The returned descriptor is inert frozen data; only its original object
 * identity resolves the private detached authorization and composition bytes.
 * @param {{
 *   lane:'lightweight'|'tracked', root:string, specPath:string,
 *   authorization:unknown, composition:unknown,
 * }} options
 */
export function prepareDefinitionRecoveryV1(options) {
  if (utilTypes.isProxy(options)) throw new TypeError('definition recovery preparation options must be a record');
  const laneDescriptor = options && typeof options === 'object'
    ? Object.getOwnPropertyDescriptor(options, 'lane') : undefined;
  assertDefinitionRecoveryWritable({
    lane: laneDescriptor && 'value' in laneDescriptor ? laneDescriptor.value : undefined,
  });
  assertClosedRecord(
    options,
    'definition recovery preparation options',
    ['lane', 'root', 'specPath', 'authorization', 'composition'],
  );
  if (typeof options.root !== 'string' || options.root.length === 0) {
    throw new TypeError('definition recovery preparation root must be a non-empty string');
  }
  if (typeof options.specPath !== 'string') {
    throw new TypeError('definition recovery preparation specPath must be a string');
  }
  const composed = composeDefinitionRecoveryV1(options.composition);
  const proposal = /** @type {Record<string, unknown>} */ (composed.proposal);
  const proof = /** @type {Record<string, unknown>} */ (composed.proof);
  if (proposal.target.lane !== options.lane || proposal.target.specPath !== options.specPath) {
    throw new Error('definition recovery execution target must match the exact request lane and specification');
  }
  validateDefinitionRecoveryAuthorizationShapeV1(
    options.authorization,
    proposal,
  );
  const canonicalRoot = fs.realpathSync(options.root);
  preflightDefinitionRecoveryComposition(canonicalRoot, options.specPath, composed);
  const preparationIdentity = sha256(randomBytes(32));
  const finalArtifacts = /** @type {Record<string, unknown>[]} */ (composed.changes).map((change) => ({
    path: change.path,
    bytes: capturedBytesV1(/** @type {Buffer} */ (change.staged)),
  }));
  const reviewRequestBody = JSON.parse(canonicalJson({
    type: 'definition-revision-review-request',
    version: 1,
    preparationIdentity,
    proposalIdentity: proposal.proposalIdentity,
    proofIdentity: proof.proofIdentity,
    compositionIdentity: composed.compositionIdentity,
    coordinatorFinalDescriptors: proposal.coordinatorFinalDescriptors,
    finalArtifacts,
  }));
  const reviewRequestIdentity = sha256(Buffer.from(canonicalJson(reviewRequestBody)));
  const reviewRequest = {
    ...reviewRequestBody,
    reviewRequestIdentity,
  };
  const prepared = deepFreezeData(JSON.parse(canonicalJson({
    type: 'definition-recovery-prepared',
    version: 1,
    preparationIdentity,
    reviewRequestIdentity,
    lane: options.lane,
    root: canonicalRoot,
    specPath: options.specPath,
    proposal,
    proof,
    composition: {
      stageIdentity: composed.stageIdentity,
      compositionIdentity: composed.compositionIdentity,
      reconciliationIdentity: composed.reconciliationEvidence.reconciliationIdentity,
    },
    reviewRequest,
  })));
  DEFINITION_RECOVERY_PREPARATIONS.set(prepared, {
    lane: options.lane,
    root: canonicalRoot,
    specPath: options.specPath,
    authorization: detachCoordinatorData(options.authorization),
    composition: detachCoordinatorData(options.composition),
    preparationIdentity,
    reviewRequestIdentity,
    compositionIdentity: composed.compositionIdentity,
    proposalIdentity: proposal.proposalIdentity,
    proofIdentity: proof.proofIdentity,
  });
  return prepared;
}

/**
 * Commit one original prepared capability against a fresh post-prepare
 * Inspection. Lint and verification function bodies are trusted coordinator
 * TCB: callback branding prevents substitution, but does not sandbox them.
 * @param {{prepared:unknown,inspection:unknown,gates:unknown,failureInjector?:FailureInjector}} options
 */
export function commitDefinitionRecoveryV1(options) {
  if (utilTypes.isProxy(options)) throw new TypeError('definition recovery commit options must be a record');
  assertClosedRecord(
    options,
    'definition recovery commit options',
    ['prepared', 'inspection', 'gates'],
    ['failureInjector'],
  );
  const snapshot = options.prepared !== null && typeof options.prepared === 'object'
    ? DEFINITION_RECOVERY_PREPARATIONS.get(options.prepared)
    : undefined;
  if (!snapshot) {
    throw new TypeError('definition recovery commit requires the original prepared capability');
  }
  if (options.failureInjector !== undefined) {
    assertSynchronousFunction(options.failureInjector, 'definition recovery commit failureInjector');
  }
  const gateSource = options.gates;
  const inspectionSource = options.inspection;
  const gates = validateDefinitionRecoveryExecutionGates(options.gates);
  const lintGate = gates.lint;
  const verificationGate = gates.verification;
  const composed = composeDefinitionRecoveryV1(snapshot.composition);
  const proposal = /** @type {Record<string, unknown>} */ (composed.proposal);
  const proof = /** @type {Record<string, unknown>} */ (composed.proof);
  if (composed.compositionIdentity !== snapshot.compositionIdentity
    || proposal.proposalIdentity !== snapshot.proposalIdentity
    || proof.proofIdentity !== snapshot.proofIdentity) {
    throw new Error('definition recovery private preparation snapshot drifted');
  }
  const preflight = preflightDefinitionRecoveryComposition(
    snapshot.root,
    snapshot.specPath,
    composed,
  );
  validateDefinitionRecoveryAuthorizationV1(
    snapshot.authorization,
    proposal,
    inspectionSource,
  );
  const review = evaluateDefinitionRevisionV1({
    inspection: inspectionSource,
    proposal,
    proof,
    preparationIdentity: snapshot.preparationIdentity,
    reviewRequestIdentity: snapshot.reviewRequestIdentity,
  });
  const semanticReviewCount = Number.isSafeInteger(review.semanticReviewCount)
    ? review.semanticReviewCount
    : 0;
  if (!review.approved) {
    return {
      accepted: false,
      reason: review.reason,
      semanticReviewCount,
      proposalIdentity: proposal.proposalIdentity,
      proofIdentity: proof.proofIdentity,
    };
  }
  if (semanticReviewCount !== 1) {
    throw new Error('definition recovery commit requires exactly one matching semantic review');
  }
  const reviewIdentity = /** @type {string} */ (review.reviewIdentity);
  const feature009Evidence = review.feature009Evidence;
  const feature009Finding = buildDefinitionRecoveryLearningFindingV1(feature009Evidence);
  const finalDescriptors = /** @type {Record<string, unknown>[]} */ (
    proposal.coordinatorFinalDescriptors
  );
  const gateContext = Object.freeze({
    proposalIdentity: proposal.proposalIdentity,
    proofIdentity: proof.proofIdentity,
    preparationIdentity: snapshot.preparationIdentity,
    reviewRequestIdentity: snapshot.reviewRequestIdentity,
    reviewIdentity,
    coordinatorFinalDescriptors: Object.freeze(finalDescriptors.map((row) => Object.freeze({ ...row }))),
  });
  const gateResult = (field) => {
    const capturedGate = field === 'lint' ? lintGate : verificationGate;
    const sourceDescriptor = Object.getOwnPropertyDescriptor(options, 'gates');
    const descriptor = Object.getOwnPropertyDescriptor(gateSource, field);
    if (!sourceDescriptor
      || !('value' in sourceDescriptor)
      || sourceDescriptor.value !== gateSource
      || !descriptor
      || !('value' in descriptor)
      || descriptor.value !== capturedGate) {
      throw new Error(`definition recovery commit gate callback changed after sealing: ${field}`);
    }
    const evidence = validateDefinitionRecoveryGateEvidence(
      capturedGate(gateContext),
      `definition recovery commit gates.${field}`,
    );
    return {
      status: evidence.status,
      evidenceIdentity: evidence.evidenceIdentity,
      proposalIdentity: proposal.proposalIdentity,
      reviewIdentity,
      coordinatorFinalDescriptors: finalDescriptors.map((row) => ({ ...row })),
    };
  };
  const capabilities = sealDefinitionRecoveryCoordinatorCapabilities({
    validateReconciliation(view) {
      const changes = /** @type {Record<string, unknown>[]} */ (composed.changes);
      if (view.length !== changes.length) {
        throw new Error('definition recovery reconciliation view must contain the exact four paths');
      }
      for (let index = 0; index < view.length; index += 1) {
        const expected = /** @type {Buffer} */ (changes[index].expected);
        const staged = /** @type {Buffer} */ (changes[index].staged);
        if (view[index].path !== changes[index].path
          || !view[index].expected.equals(expected)
          || !view[index].staged.equals(staged)) {
          throw new Error('definition recovery reconciliation view drifted from coordinator composition');
        }
      }
      return {
        reconciliationIdentity: composed.reconciliationEvidence.reconciliationIdentity,
        historyAppend: composed.reconciliationEvidence.historyAppend === null
          ? null
          : {
            path: composed.reconciliationEvidence.historyAppend.path,
            bytes: Buffer.from(composed.reconciliationEvidence.historyAppend.bytes),
          },
      };
    },
    postApply: {
      recomputeProposalIdentity() {
        const recomposed = composeDefinitionRecoveryV1(snapshot.composition);
        if (recomposed.compositionIdentity !== composed.compositionIdentity
          || canonicalJson(recomposed.proposal) !== canonicalJson(proposal)
          || canonicalJson(recomposed.proof) !== canonicalJson(proof)) {
          throw new Error('definition recovery post-apply composition identity drifted');
        }
        return {
          proposalIdentity: proposal.proposalIdentity,
          coordinatorFinalDescriptors: finalDescriptors.map((row) => ({ ...row })),
        };
      },
      validateReviewIdentity() {
        // Re-resolve the approved review from a fresh read of the same
        // Inspection instead of echoing the pre-apply closure value.
        return revalidateDefinitionRevisionReviewIdentityV1({
          inspection: inspectionSource,
          proposal,
          proof,
          reviewIdentity,
        });
      },
      lint() { return gateResult('lint'); },
      verification() { return gateResult('verification'); },
    },
  });
  const applied = applyDefinitionRecovery({
    lane: snapshot.lane,
    root: snapshot.root,
    specPath: snapshot.specPath,
    changes: composed.changes,
    binding: {
      proposalIdentity: proposal.proposalIdentity,
      prestateDescriptors: proposal.prestateDescriptors,
      coordinatorFinalDescriptors: finalDescriptors,
      reconciliationIdentity: composed.reconciliationEvidence.reconciliationIdentity,
      review: {
        proposalIdentity: proposal.proposalIdentity,
        reviewIdentity,
        coordinatorFinalDescriptors: finalDescriptors,
      },
    },
    ...capabilities,
    ...(options.failureInjector ? { failureInjector: options.failureInjector } : {}),
  });
  const taskDescriptor = finalDescriptors.find((row) => row.path === preflight.structure.taskPath);
  if (!taskDescriptor) throw new Error('definition recovery commit is missing the final tasks descriptor');
  const binding = deepFreezeData({
    root: snapshot.root,
    owner: JSON.parse(canonicalJson(proposal.owner)),
    target: JSON.parse(canonicalJson(proposal.target)),
    tasksPath: preflight.structure.taskPath,
    tasksDescriptor: {
      sha256: taskDescriptor.sha256,
      byteLength: taskDescriptor.byteLength,
    },
    proposalIdentity: proposal.proposalIdentity,
  });
  return {
    accepted: true,
    reason: 'definition-accepted',
    semanticReviewCount,
    proposalIdentity: proposal.proposalIdentity,
    proofIdentity: proof.proofIdentity,
    reviewIdentity,
    compositionIdentity: composed.compositionIdentity,
    feature009Evidence,
    feature009Finding,
    applied,
    binding,
  };
}

/** @param {unknown} value @param {Readonly<{reconciliationIdentity:string}>} binding @param {string} taskPath @param {Buffer|null} expectedAppend */
function validateReconciliationEvidence(value, binding, taskPath, expectedAppend) {
  assertSynchronousResult(value, 'validateReconciliation');
  assertClosedRecord(
    value,
    'definition recovery reconciliation evidence',
    ['reconciliationIdentity', 'historyAppend'],
  );
  if (value.reconciliationIdentity !== binding.reconciliationIdentity) {
    throw new Error('definition recovery reconciliation identity does not match the exact proposal');
  }
  if (expectedAppend === null) {
    if (value.historyAppend !== null) {
      throw new Error('definition recovery reconciliation claims an unexpected history archive append');
    }
    return Object.freeze({ reconciliationIdentity: value.reconciliationIdentity, historyAppend: null });
  }
  assertClosedRecord(value.historyAppend, 'definition recovery reconciliation historyAppend', ['path', 'bytes']);
  if (value.historyAppend.path !== taskPath || !Buffer.isBuffer(value.historyAppend.bytes)
    || !value.historyAppend.bytes.equals(expectedAppend)) {
    throw new Error('definition recovery history archive append is not exactly authorized by reconciliation');
  }
  return Object.freeze({
    reconciliationIdentity: value.reconciliationIdentity,
    historyAppend: Object.freeze({ path: taskPath, bytes: Buffer.from(expectedAppend) }),
  });
}

/** @param {Readonly<{proposalIdentity:string,reviewIdentity:string,coordinatorFinalDescriptors:ReadonlyArray<object>}>} binding */
function postApplyContext(binding) {
  return Object.freeze({
    proposalIdentity: binding.proposalIdentity,
    reviewIdentity: binding.reviewIdentity,
    coordinatorFinalDescriptors: Object.freeze(
      binding.coordinatorFinalDescriptors.map((row) => Object.freeze({ ...row })),
    ),
  });
}

/** @param {unknown} value @param {ReadonlyArray<string>} paths @param {ReadonlyArray<object>} expectedDescriptors @param {string} label @param {string[]} identityFields */
function validatePostApplyResult(value, paths, expectedDescriptors, label, identityFields) {
  assertSynchronousResult(value, label);
  const required = [...identityFields, 'coordinatorFinalDescriptors'];
  if (label.endsWith('.lint') || label.endsWith('.verification')) {
    required.push('status', 'evidenceIdentity');
  }
  assertClosedRecord(value, label, required);
  for (const field of identityFields) assertHash(value[field], `${label}.${field}`);
  const descriptors = validateArtifactDescriptors(
    value.coordinatorFinalDescriptors,
    paths,
    `${label}.coordinatorFinalDescriptors`,
  );
  assertDescriptorsEqual(
    descriptors,
    /** @type {ReadonlyArray<{path:string,sha256:string,byteLength:number}>} */ (expectedDescriptors),
    `${label} descriptors`,
  );
  if (required.includes('status')) {
    if (value.status !== 'passed') throw new Error(`${label} must report passed fresh evidence`);
    assertHash(value.evidenceIdentity, `${label}.evidenceIdentity`);
  }
  return value;
}

/** @param {string} root @param {ReadonlyArray<string>} paths @param {Map<string, Buffer>} stagedByPath */
function readExactAppliedBytes(root, paths, stagedByPath) {
  /** @type {Map<string, Buffer>} */
  const appliedByPath = new Map();
  for (const relativePath of paths) {
    const current = inspectTarget(root, relativePath);
    const staged = stagedByPath.get(relativePath);
    if (current.bytes === null || !staged || !current.bytes.equals(staged)) {
      throw new Error(`applied definition bytes do not match coordinator-final descriptor: ${relativePath}`);
    }
    appliedByPath.set(relativePath, Buffer.from(current.bytes));
  }
  return appliedByPath;
}

/**
 * @param {string} root
 * @param {ReadonlyArray<string>} paths
 * @param {Map<string, Buffer>} expectedByPath
 * @param {Map<string, Buffer>} stagedByPath
 * @param {string} ownerPath
 * @param {string} specPath
 * @param {Readonly<{proposalIdentity:string,reviewIdentity:string,reconciliationIdentity:string,coordinatorFinalDescriptors:ReadonlyArray<object>}>} binding
 * @param {Record<string, Function>} postApply
 * @param {unknown} reconciliationEvidence
 */
function validateAppliedDefinitionRecovery(
  root,
  paths,
  expectedByPath,
  stagedByPath,
  ownerPath,
  specPath,
  binding,
  postApply,
  reconciliationEvidence,
) {
  const appliedByPath = new Map(paths.map((relativePath) => {
    const current = inspectTarget(root, relativePath);
    if (current.bytes === null) throw new Error(`applied definition path is missing: ${relativePath}`);
    return [relativePath, Buffer.from(current.bytes)];
  }));
  const structure = inspectDefinitionRecoveryStructure(
    expectedByPath,
    appliedByPath,
    ownerPath,
    specPath,
  );
  validateReconciliationEvidence(
    reconciliationEvidence,
    binding,
    structure.taskPath,
    structure.historyAppend,
  );
  readExactAppliedBytes(root, paths, stagedByPath);
  const appliedDescriptors = descriptorsFor(paths, appliedByPath);
  assertDescriptorsEqual(
    appliedDescriptors,
    /** @type {ReadonlyArray<{path:string,sha256:string,byteLength:number}>} */ (
      binding.coordinatorFinalDescriptors
    ),
    'applied coordinator-final descriptors',
  );
  requireDefinitionOwner(root, specPath, ownerPath);

  const invoke = (field, identityFields) => {
    const label = `definition recovery postApply.${field}`;
    const result = postApply[field](postApplyContext(binding));
    validatePostApplyResult(
      result,
      paths,
      binding.coordinatorFinalDescriptors,
      label,
      identityFields,
    );
    if (result.proposalIdentity !== binding.proposalIdentity) {
      throw new Error(`${label} proposal identity does not match the exact applied proposal`);
    }
    if (identityFields.includes('reviewIdentity')
      && result.reviewIdentity !== binding.reviewIdentity) {
      throw new Error(`${label} review identity does not match the independent review`);
    }
    readExactAppliedBytes(root, paths, stagedByPath);
  };
  invoke('recomputeProposalIdentity', ['proposalIdentity']);
  invoke('validateReviewIdentity', ['proposalIdentity', 'reviewIdentity']);
  invoke('lint', ['proposalIdentity', 'reviewIdentity']);
  invoke('verification', ['proposalIdentity', 'reviewIdentity']);
}

/**
 * Compose exact-owner definition recovery through the existing atomic batch.
 * @param {{
 *   lane: 'lightweight' | 'tracked',
 *   root: string,
 *   specPath: string,
 *   changes: AtomicFileChange[],
 *   binding: unknown,
 *   validateReconciliation: DefinitionReconciliationValidator,
 *   postApply: unknown,
 *   failureInjector?: FailureInjector,
 * }} options
 */
export function applyDefinitionRecovery(options) {
  if (utilTypes.isProxy(options)) throw new TypeError('definition recovery options must be a record');
  const laneDescriptor = options && typeof options === 'object'
    ? Object.getOwnPropertyDescriptor(options, 'lane') : undefined;
  assertDefinitionRecoveryWritable({
    lane: laneDescriptor && 'value' in laneDescriptor ? laneDescriptor.value : undefined,
  });
  assertClosedRecord(
    options,
    'definition recovery options',
    [
      'lane', 'root', 'specPath', 'changes', 'binding',
      'validateReconciliation', 'postApply',
    ],
    ['failureInjector'],
  );
  if (typeof options.root !== 'string' || options.root.length === 0) {
    throw new TypeError('definition recovery root must be a non-empty string');
  }
  if (typeof options.specPath !== 'string') throw new TypeError('definition recovery specPath must be a string');
  assertSynchronousFunction(options.validateReconciliation, 'validateReconciliation');
  const postApply = requireDefinitionRecoveryCoordinatorCapabilities(
    options.validateReconciliation,
    options.postApply,
  );

  const owner = requireDefinitionOwner(
    options.root,
    options.specPath,
    undefined,
  );
  const recoveryPaths = definitionRecoveryPaths(owner.ideaPath, options.specPath);
  const changesByPath = validateDefinitionRecoveryChanges(options.changes, recoveryPaths);
  /** @type {Map<string, Buffer>} */
  const expectedByPath = new Map();
  /** @type {Map<string, Buffer>} */
  const stagedByPath = new Map();
  for (const relativePath of recoveryPaths) {
    const change = changesByPath.get(relativePath);
    if (!change || change.expected === MISSING) {
      throw new Error(`definition recovery requires existing expected bytes for '${relativePath}'`);
    }
    expectedByPath.set(relativePath, Buffer.from(change.expected));
    stagedByPath.set(relativePath, Buffer.from(change.staged));
  }
  const binding = validateDefinitionRecoveryBinding(
    options.binding,
    recoveryPaths,
    expectedByPath,
    stagedByPath,
  );
  const ownerChange = changesByPath.get(owner.ideaPath);
  if (!ownerChange || ownerChange.expected === MISSING) {
    throw new Error(`definition recovery requires current owner bytes for '${owner.ideaPath}'`);
  }
  const currentOwner = inspectTarget(options.root, owner.ideaPath);
  assertExpected(ownerChange, currentOwner);
  if (currentOwner.bytes === null) {
    throw new Error(`definition recovery requires current owner bytes for '${owner.ideaPath}'`);
  }
  assertDefinitionOwner(currentOwner.bytes, options.specPath, 'current');
  assertDefinitionOwner(ownerChange.staged, options.specPath, 'staged');
  assertCoordinatorLogAppendOnly(currentOwner.bytes, ownerChange.staged);
  assertProtectedOwnerSectionsUnchanged(currentOwner.bytes, ownerChange.staged);

  let reconciliationEvidence;

  return applyAtomicFileBatch({
    root: options.root,
    changes: options.changes,
    validators: [(view) => {
      for (const change of view) {
        const staged = stagedByPath.get(change.path);
        if (!staged || !change.staged.equals(staged)) {
          throw new Error(`atomic staged view drifted from coordinator-final bytes: ${change.path}`);
        }
      }
      const structure = inspectDefinitionRecoveryStructure(
        expectedByPath,
        stagedByPath,
        owner.ideaPath,
        options.specPath,
      );
      const evidence = options.validateReconciliation(Object.freeze(view.map((change) => {
      const expected = expectedByPath.get(change.path);
      if (!expected) throw new Error(`missing expected recovery bytes: ${change.path}`);
      return Object.freeze({
        path: change.path,
        expected: Buffer.from(expected),
        staged: Buffer.from(change.staged),
      });
      })));
      reconciliationEvidence = validateReconciliationEvidence(
        evidence,
        binding,
        structure.taskPath,
        structure.historyAppend,
      );
    }],
    failureInjector: options.failureInjector,
  }, () => {
    if (!reconciliationEvidence) throw new Error('definition recovery reconciliation evidence is missing');
    validateAppliedDefinitionRecovery(
      options.root,
      recoveryPaths,
      expectedByPath,
      stagedByPath,
      owner.ideaPath,
      options.specPath,
      binding,
      postApply,
      reconciliationEvidence,
    );
  });
}

/**
 * Apply complete bytes in path order. The batch is all-or-restored only for
 * failures caught by this process; no process-loss or power-loss claim is made.
 *
 * @param {{
 *   root: string,
 *   changes: AtomicFileChange[],
 *   validators?: AtomicFileValidator[],
 *   failureInjector?: FailureInjector,
 * }} options
 * @param {(() => void) | undefined} [afterApply]
 */
function applyAtomicFileBatchInternal(options, afterApply) {
  assertClosedRecord(options, 'atomic file batch options', ['root', 'changes'], ['validators', 'failureInjector']);
  if (typeof options.root !== 'string' || options.root.length === 0) {
    throw new TypeError('atomic file batch root must be a non-empty string');
  }
  assertDenseArray(options.changes, 'changes');
  if (options.changes.length === 0) throw new TypeError('changes must not be empty');

  const validatorInput = options.validators ?? [];
  assertDenseArray(validatorInput, 'validators');
  for (let index = 0; index < validatorInput.length; index += 1) {
    assertSynchronousFunction(validatorInput[index], `validators[${index}]`);
  }
  if (afterApply !== undefined) assertSynchronousFunction(afterApply, 'afterApply');
  if (options.failureInjector !== undefined) {
    assertSynchronousFunction(options.failureInjector, 'failureInjector');
  }

  const validators = [...validatorInput];
  const failureInjector = options.failureInjector;
  const root = path.resolve(options.root);
  const seenPaths = new Set();
  /** @type {PreparedChange[]} */
  const changes = [];
  for (let index = 0; index < options.changes.length; index += 1) {
    const change = options.changes[index];
    assertClosedRecord(change, `changes[${index}]`, ['path', 'expected', 'staged']);
    if (typeof change.path !== 'string') throw new TypeError(`changes[${index}].path must be a string`);
    assertCanonicalPath(change.path);
    if (seenPaths.has(change.path)) throw new Error(`duplicate atomic file path: ${change.path}`);
    seenPaths.add(change.path);
    if (change.expected !== MISSING && !Buffer.isBuffer(change.expected)) {
      throw new TypeError(`changes[${index}].expected must be a Buffer or "missing"`);
    }
    if (!Buffer.isBuffer(change.staged)) throw new TypeError(`changes[${index}].staged must be a Buffer`);
    changes.push({
      path: change.path,
      expected: change.expected === MISSING ? MISSING : Buffer.from(change.expected),
      staged: Buffer.from(change.staged),
      absolutePath: '',
      priorBytes: null,
      temporaryPath: null,
    });
  }
  changes.sort((left, right) => comparePaths(left.path, right.path));

  for (const change of changes) {
    const segments = change.path.split('/');
    for (let length = 1; length < segments.length; length += 1) {
      const ancestor = segments.slice(0, length).join('/');
      if (seenPaths.has(ancestor)) {
        throw new Error(`atomic file paths must not contain one another: ${ancestor}, ${change.path}`);
      }
    }
  }

  for (const change of changes) {
    const current = inspectTarget(root, change.path);
    assertExpected(change, current);
    change.absolutePath = current.absolutePath;
    change.priorBytes = current.bytes === null ? null : Buffer.from(current.bytes);
  }

  const createdDirectories = /** @type {Array<{absolutePath: string, path: string}>} */ ([]);
  const temporaryPaths = /** @type {Map<string, string>} */ (new Map());
  const forbiddenPaths = new Set(changes.map((change) => change.absolutePath));

  try {
    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index];
      ensureParentDirectories(root, change, createdDirectories, failureInjector, index);
      change.temporaryPath = writeSiblingTemp(
        root,
        change,
        change.staged,
        'stage',
        index,
        forbiddenPaths,
        temporaryPaths,
        failureInjector,
      );
    }

    for (let index = 0; index < validators.length; index += 1) {
      inject(failureInjector, 'validate', null, index);
      const view = Object.freeze(changes.map((change) => Object.freeze({
        path: change.path,
        staged: Buffer.from(change.staged),
      })));
      assertSynchronousResult(validators[index](view), 'validators');
    }

    for (let index = 0; index < changes.length; index += 1) {
      inject(failureInjector, 'recheck', changes[index].path, index);
      assertExpected(changes[index], inspectTarget(root, changes[index].path));
    }

    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index];
      inject(failureInjector, 'rename', change.path, index);
      if (resolveMutationPath(root, change.path) !== change.absolutePath) {
        throw new Error(`atomic file path changed before apply: ${change.path}`);
      }
      const destination = lstatOrNull(change.absolutePath);
      if (destination && (destination.isSymbolicLink() || !destination.isFile())) {
        throw new Error(`atomic file target became unsafe: ${change.path}`);
      }
      if (change.temporaryPath === null) throw new Error(`missing staged temporary file: ${change.path}`);
      assertStagedTemporaryFile(change.temporaryPath, change.path, change.staged);
      assertExpected(change, inspectTarget(root, change.path));
      fs.renameSync(change.temporaryPath, change.absolutePath);
      temporaryPaths.delete(change.temporaryPath);
      change.temporaryPath = null;
    }

    if (afterApply) {
      inject(failureInjector, 'validate-applied', null, 0);
      assertSynchronousResult(afterApply(), 'afterApply');
    }
  } catch (cause) {
    const rollbackErrors = /** @type {Array<{operation: string, path: string | null, message: string}>} */ ([]);

    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const change = changes[index];
      captureRollbackError(rollbackErrors, 'restore-target', change.path, () => {
        const current = inspectTarget(root, change.path);
        if (change.priorBytes === null) {
          if (current.bytes !== null) {
            inject(failureInjector, 'rollback-remove', change.path, index);
            const removable = inspectTarget(root, change.path);
            if (removable.bytes !== null) fs.unlinkSync(removable.absolutePath);
          }
          if (inspectTarget(root, change.path).bytes !== null) {
            throw new Error(`new atomic file still exists after rollback: ${change.path}`);
          }
        } else {
          if (current.bytes === null || !current.bytes.equals(change.priorBytes)) {
            const restoreTemporary = writeSiblingTemp(
              root,
              change,
              change.priorBytes,
              'rollback',
              index,
              forbiddenPaths,
              temporaryPaths,
              failureInjector,
            );
            inject(failureInjector, 'rollback-rename', change.path, index);
            if (resolveMutationPath(root, change.path) !== change.absolutePath) {
              throw new Error(`atomic file path changed during rollback: ${change.path}`);
            }
            assertTemporaryFile(restoreTemporary, change.path);
            fs.renameSync(restoreTemporary, change.absolutePath);
            temporaryPaths.delete(restoreTemporary);
          }
          const restored = inspectTarget(root, change.path);
          if (restored.bytes === null || !restored.bytes.equals(change.priorBytes)) {
            throw new Error(`atomic file target could not be restored: ${change.path}`);
          }
        }
      });
    }

    for (const [temporaryPath, relativePath] of [...temporaryPaths].reverse()) {
      captureRollbackError(rollbackErrors, 'remove-temporary', relativePath, () => {
        inject(failureInjector, 'cleanup-temp', relativePath, -1);
        resolveMutationPath(root, relativePath);
        const current = lstatOrNull(temporaryPath);
        if (current) {
          if (current.isSymbolicLink() || !current.isFile()) {
            throw new Error(`temporary path became unsafe: ${relativePath}`);
          }
          fs.unlinkSync(temporaryPath);
        }
        temporaryPaths.delete(temporaryPath);
      });
    }

    for (let index = createdDirectories.length - 1; index >= 0; index -= 1) {
      const directory = createdDirectories[index];
      captureRollbackError(rollbackErrors, 'remove-directory', directory.path, () => {
        inject(failureInjector, 'cleanup-directory', directory.path, index);
        resolveMutationPath(root, `${directory.path}/.dude-atomic-probe`);
        const current = lstatOrNull(directory.absolutePath);
        if (!current) return;
        if (current.isSymbolicLink() || !current.isDirectory()) {
          throw new Error(`created path is no longer a directory: ${directory.path}`);
        }
        fs.rmdirSync(directory.absolutePath);
      });
    }

    if (rollbackErrors.length > 0) throw incompleteRollback(cause, rollbackErrors);
    throw cause;
  }

  return Object.freeze({
    count: changes.length,
    paths: Object.freeze(changes.map((change) => change.path)),
  });
}
