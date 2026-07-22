// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { isUtf8 } from 'node:buffer';

import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseFrontmatterScalars } from '../dude-engine/lib/feature-identity.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';

const MISSING = 'missing';

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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
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
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
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
  const resultType = typeof result;
  if (result !== null && (resultType === 'object' || resultType === 'function') && 'then' in result) {
    throw new TypeError('failureInjector must be synchronous');
  }
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
  /** @type {Array<{start: number, contentEnd: number}>} */
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
    lines.push({ start, contentEnd });
    start = index;
  }
  lines.push({ start, contentEnd: bytes.length });
  return lines;
}

/**
 * @param {Buffer} bytes
 * @param {string} state
 * @returns {Map<string, Buffer>}
 */
function extractProtectedOwnerSections(bytes, state) {
  if (!isUtf8(bytes)) throw new Error(`${state} definition owner must be valid UTF-8`);
  const names = ['Idea', 'Open Questions', 'Assumptions'];
  const lines = byteLines(bytes);
  /** @type {{character: string, length: number} | null} */
  let fence = null;
  /** @type {Array<{start: number, name: string | null}>} */
  const boundaries = [];
  /** @type {Map<string, number[]>} */
  const occurrences = new Map(names.map((name) => [name, []]));

  for (const line of lines) {
    const text = bytes.subarray(line.start, line.contentEnd).toString('utf8');
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { character: open[1][0], length: open[1].length };
      continue;
    }
    if (!/^ {0,3}##(?:[ \t]+|$)/.test(text)) continue;
    const protectedHeading = /^ {0,3}##[ \t]+(Idea|Open Questions|Assumptions)(?:[ \t]+#+)?[ \t]*$/.exec(text);
    const boundaryIndex = boundaries.length;
    boundaries.push({ start: line.start, name: protectedHeading?.[1] ?? null });
    if (protectedHeading) occurrences.get(protectedHeading[1])?.push(boundaryIndex);
  }
  if (fence) throw new Error(`${state} definition owner has an unclosed fenced section boundary`);

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

/**
 * Compose exact-owner definition recovery through the existing atomic batch.
 * @param {{
 *   lane: 'lightweight' | 'tracked',
 *   root: string,
 *   specPath: string,
 *   changes: AtomicFileChange[],
 *   validateReconciliation: DefinitionReconciliationValidator,
 *   failureInjector?: FailureInjector,
 * }} options
 */
export function applyDefinitionRecovery(options) {
  const laneDescriptor = options && typeof options === 'object'
    ? Object.getOwnPropertyDescriptor(options, 'lane') : undefined;
  assertDefinitionRecoveryWritable({
    lane: laneDescriptor && 'value' in laneDescriptor ? laneDescriptor.value : undefined,
  });
  assertClosedRecord(
    options,
    'definition recovery options',
    ['lane', 'root', 'specPath', 'changes', 'validateReconciliation'],
    ['failureInjector'],
  );
  if (typeof options.validateReconciliation !== 'function') {
    throw new TypeError('validateReconciliation must be a synchronous reconciliation validator');
  }

  const owner = requireDefinitionOwner(
    options.root,
    options.specPath,
    undefined,
  );
  const recoveryPaths = definitionRecoveryPaths(owner.ideaPath, options.specPath);
  const changesByPath = validateDefinitionRecoveryChanges(options.changes, recoveryPaths);
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
  assertProtectedOwnerSectionsUnchanged(currentOwner.bytes, ownerChange.staged);

  /** @type {Map<string, Buffer | 'missing'>} */
  const expectedByPath = new Map();
  for (let index = 0; index < options.changes.length; index += 1) {
    const change = options.changes[index];
    expectedByPath.set(
      change.path,
      change.expected === MISSING ? MISSING : Buffer.from(change.expected),
    );
  }

  return applyAtomicFileBatch({
    root: options.root,
    changes: options.changes,
    validators: [(view) => options.validateReconciliation(Object.freeze(view.map((change) => {
      const expected = expectedByPath.get(change.path);
      if (expected === undefined) throw new Error(`missing expected recovery bytes: ${change.path}`);
      return Object.freeze({
        path: change.path,
        expected: expected === MISSING ? MISSING : Buffer.from(expected),
        staged: Buffer.from(change.staged),
      });
    })))],
    failureInjector: options.failureInjector,
  }, () => {
    requireDefinitionOwner(options.root, options.specPath, owner.ideaPath);
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
export function applyAtomicFileBatch(options, afterApply) {
  assertClosedRecord(options, 'atomic file batch options', ['root', 'changes'], ['validators', 'failureInjector']);
  if (typeof options.root !== 'string' || options.root.length === 0) {
    throw new TypeError('atomic file batch root must be a non-empty string');
  }
  assertDenseArray(options.changes, 'changes');
  if (options.changes.length === 0) throw new TypeError('changes must not be empty');

  const validatorInput = options.validators ?? [];
  assertDenseArray(validatorInput, 'validators');
  for (let index = 0; index < validatorInput.length; index += 1) {
    if (typeof validatorInput[index] !== 'function') throw new TypeError('validators must contain functions');
  }
  if (afterApply !== undefined && typeof afterApply !== 'function') {
    throw new TypeError('afterApply must be a function');
  }
  if (options.failureInjector !== undefined && typeof options.failureInjector !== 'function') {
    throw new TypeError('failureInjector must be a function');
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
      const result = validators[index](view);
      const resultType = typeof result;
      if (result !== null && (resultType === 'object' || resultType === 'function') && 'then' in result) {
        throw new TypeError('validators must be synchronous');
      }
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
      afterApply();
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
