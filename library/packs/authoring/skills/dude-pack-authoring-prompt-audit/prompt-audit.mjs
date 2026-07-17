#!/usr/bin/env node
// @ts-check
/**
 * Deterministic, read-only static prompt/context source footprint proxy.
 *
 * This tool measures declared source files. It does not observe host prompt
 * assembly, active context, or runtime token use.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDIT_SCHEMA_VERSION = 2;
export const METRIC_KIND = 'bundle-controlled-static-prompt-context-source-footprint-proxy';

const PROFILE_SCHEMA_VERSION = 1;
const SHA256_RE = /^[a-f0-9]{64}$/;
const NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const PACK_KINDS = Object.freeze(['agents', 'skills', 'instructions', 'prompts']);
const CLAIM_DESCRIPTION = 'deterministic bundle-controlled static prompt/context source footprint proxy';
const CLAIM_EXCLUSIONS = Object.freeze([
  'actual host prompt membership',
  'active runtime context',
  'runtime token use',
]);
const PROFILE_KEYS = Object.freeze([
  'dogfood_guidance',
  'metric',
  'parity',
  'profile_order',
  'profiles',
  'schema_version',
]);
const PROFILE_DEFINITION_KEYS = Object.freeze(['activation_assumption', 'kind', 'members']);
const PARITY_KEYS = Object.freeze([
  'core_generated_root',
  'core_source_root',
  'install_profile',
  'pack_catalog_root',
]);
const REPORT_PROFILE_MANIFEST_KEYS = Object.freeze([
  'core_generated_root',
  'core_source_root',
  'install_profile',
  'pack_catalog_root',
  'path',
  'sha256',
]);
const REPORT_KEYS = Object.freeze([
  'aggregate',
  'claim_limits',
  'dogfood_guidance',
  'metric',
  'prerequisites',
  'profile_manifest',
  'profile_order',
  'profiles',
  'schema_version',
  'tokenizer',
]);
const RECORD_KEYS = Object.freeze([
  'accepted',
  'activation_assumption',
  'definition_sha256',
  'inputs',
  'kind',
  'name',
  'prerequisites',
  'totals',
]);
const INPUT_KEYS = Object.freeze(['code_points', 'path', 'sha256', 'tokens', 'utf8_bytes']);
const TOTAL_KEYS = Object.freeze(['code_points', 'input_count', 'tokens', 'utf8_bytes']);

export class PromptAuditError extends Error {
  /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PromptAuditError';
    this.code = code;
    this.details = details;
  }
}

/** @param {string} code @param {string} message @param {Record<string, unknown>} [details] @returns {never} */
function fail(code, message, details = {}) {
  throw new PromptAuditError(code, message, details);
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} label @param {string} code @returns {Record<string, any>} */
function requireObject(value, label, code = 'E_PROFILE_SCHEMA') {
  if (!isObject(value)) fail(code, `${label} must be an object`);
  return value;
}

/** @param {Record<string, any>} value @param {readonly string[]} keys @param {string} label @param {string} code */
function requireExactKeys(value, keys, label, code = 'E_PROFILE_SCHEMA') {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(code, `${label} fields must be exactly: ${expected.join(', ')}`);
  }
}

/** @param {unknown} value @param {string} label @param {string} code @returns {string} */
function requireNonEmptyString(value, label, code = 'E_PROFILE_SCHEMA') {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(code, `${label} must be a non-empty trimmed string`);
  }
  return value;
}

/** @param {string | Buffer} value @returns {string} */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** @param {string} first @param {string} second @returns {number} */
function lexicalCompare(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}

/** @param {string} parent @param {string} candidate @returns {boolean} */
function containsPath(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** @param {unknown} value @param {string} label @param {string} code @returns {string} */
function validateRelativePath(value, label, code = 'E_INPUT_UNSAFE') {
  if (typeof value !== 'string'
    || value.length === 0
    || value.includes('\\')
    || value.includes('\0')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')
    || path.posix.normalize(value) !== value) {
    fail(code, `${label} must be a normalized workspace-relative path`, { path: String(value) });
  }
  return value;
}

/**
 * @param {{ core_source_root: string, core_generated_root: string }} parity
 * @param {string} label
 * @param {string} code
 */
function requireDistinctCoreRoots(parity, label, code = 'E_PROFILE_SCHEMA') {
  if (parity.core_source_root === parity.core_generated_root) {
    fail(
      code,
      `${label}.core_source_root and ${label}.core_generated_root must be distinct normalized paths`,
    );
  }
}

/** @param {string} candidate @param {string} parent @returns {boolean} */
function isWithinRelative(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

/**
 * @param {string} inputPath
 * @param {{ core_source_root: string, core_generated_root: string }} parity
 * @returns {string | null}
 */
function generatedPathForCoreInput(inputPath, parity) {
  const prefix = `${parity.core_source_root}/`;
  if (!inputPath.startsWith(prefix)) return null;
  return `${parity.core_generated_root}/${inputPath.slice(prefix.length)}`;
}

/**
 * @param {string} inputPath
 * @param {{ pack_catalog_root: string }} parity
 * @returns {string | null}
 */
function sourcePackNameForInput(inputPath, parity) {
  const prefix = `${parity.pack_catalog_root}/`;
  if (!inputPath.startsWith(prefix)) return null;
  const suffix = inputPath.slice(prefix.length);
  const separator = suffix.indexOf('/');
  if (separator <= 0 || separator === suffix.length - 1) return null;
  const packName = suffix.slice(0, separator);
  return NAME_RE.test(packName) ? packName : null;
}

/** @param {fs.BigIntStats} stat @returns {string} */
function statFingerprint(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
}

/**
 * @typedef {{ kind: 'file'|'directory', absolutePath: string, label: string, fingerprint: string, digest: string | null }} Observation
 * @typedef {{ requestedRoot: string, root: string, observations: Map<string, Observation>, roots: Map<string, string> }} ReadContext
 */

/** @param {string} root @returns {ReadContext} */
function createReadContext(root) {
  const requestedRoot = path.resolve(root);
  const context = {
    requestedRoot,
    root: requestedRoot,
    observations: new Map(),
    roots: new Map(),
  };
  context.root = registerReadRoot(context, requestedRoot, 'workspace root', 'E_ROOT_MISSING');
  return context;
}

/** @param {ReadContext} context @param {string} relativePath @param {string} label @returns {string} */
function workspacePath(context, relativePath, label) {
  const normalized = validateRelativePath(relativePath, label);
  const absolutePath = path.resolve(context.root, ...normalized.split('/'));
  if (!containsPath(context.root, absolutePath)) {
    fail('E_INPUT_UNSAFE', `${label} escapes the workspace root`, { path: normalized });
  }
  return absolutePath;
}

/** @param {ReadContext} context @param {Observation} observation */
function recordObservation(context, observation) {
  const existing = context.observations.get(observation.absolutePath);
  if (existing) {
    if (existing.kind !== observation.kind
      || existing.fingerprint !== observation.fingerprint
      || (existing.digest !== null && observation.digest !== null && existing.digest !== observation.digest)) {
      fail('E_INPUT_DRIFT', `${observation.label} changed while it was being audited`);
    }
    if (existing.digest === null && observation.digest !== null) existing.digest = observation.digest;
    return;
  }
  context.observations.set(observation.absolutePath, observation);
}

/** @param {string} absolutePath @returns {string} */
function platformPathAnchor(absolutePath) {
  const resolvedPath = path.resolve(absolutePath);
  const volumeRoot = path.parse(resolvedPath).root;
  const firstComponent = path.relative(volumeRoot, resolvedPath).split(path.sep).find(Boolean);
  return firstComponent ? path.join(volumeRoot, firstComponent) : volumeRoot;
}

/** @param {ReadContext} context @param {string} absolutePath @param {string} [resolutionBase] */
function selectTrustedLexicalAnchor(context, absolutePath, resolutionBase) {
  const resolvedPath = path.resolve(absolutePath);
  const workspaceRoots = context.roots.size > 0
    ? [context.requestedRoot, context.root]
    : [];
  for (const workspaceRoot of workspaceRoots) {
    if (containsPath(workspaceRoot, resolvedPath)) return path.resolve(workspaceRoot);
  }
  if (resolutionBase) {
    const resolvedBase = path.resolve(resolutionBase);
    if (containsPath(resolvedBase, resolvedPath)) return resolvedBase;
  }
  return platformPathAnchor(resolvedPath);
}

/**
 * @param {string} requestedPath
 * @param {{ anchor: string, label: string, missingCode: string, symlinkCode: string }} options
 */
function assertNoStaticSymlinkAncestors(requestedPath, options) {
  const absolutePath = path.resolve(requestedPath);
  const anchor = path.resolve(options.anchor);
  if (!containsPath(anchor, absolutePath)) {
    fail('E_INPUT_UNSAFE', `${options.label} escapes its trusted lexical anchor`);
  }
  if (absolutePath === anchor) return;
  const relativeParent = path.relative(anchor, path.dirname(absolutePath));
  let cursor = anchor;
  for (const component of relativeParent.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    let stat;
    try {
      stat = fs.lstatSync(cursor, { bigint: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        fail(options.missingCode, `${options.label} is missing`);
      }
      fail('E_INPUT_UNREADABLE', `${options.label} cannot be inspected`);
    }
    if (stat.isSymbolicLink()) {
      fail(options.symlinkCode, `${options.label} traverses a symbolic link`);
    }
    if (!stat.isDirectory()) fail('E_INPUT_TYPE', `${options.label} has a non-directory ancestor`);
  }
}

/**
 * @param {ReadContext} context
 * @param {string} requestedRoot
 * @param {string} label
 * @param {string} [missingCode]
 * @param {string} [resolutionBase]
 */
function registerReadRoot(context, requestedRoot, label, missingCode = 'E_INPUT_MISSING', resolutionBase) {
  const absoluteRoot = path.resolve(requestedRoot);
  assertNoStaticSymlinkAncestors(absoluteRoot, {
    anchor: selectTrustedLexicalAnchor(context, absoluteRoot, resolutionBase),
    label,
    missingCode,
    symlinkCode: 'E_ROOT_UNSAFE',
  });
  let stat;
  try {
    stat = fs.lstatSync(absoluteRoot, { bigint: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      fail(missingCode, `${label} is missing`);
    }
    fail('E_INPUT_UNREADABLE', `${label} cannot be inspected`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('E_ROOT_UNSAFE', `${label} must be a real directory, not a symbolic link`);
  }
  const canonicalRoot = fs.realpathSync(absoluteRoot);
  const knownLabel = context.roots.get(canonicalRoot);
  if (!knownLabel) context.roots.set(canonicalRoot, label);
  recordObservation(context, {
    kind: 'directory',
    absolutePath: canonicalRoot,
    label: knownLabel ?? label,
    fingerprint: statFingerprint(stat),
    digest: null,
  });
  return canonicalRoot;
}

/**
 * @param {ReadContext} context
 * @param {string} root
 * @param {string} absolutePath
 * @param {string} label
 */
function capturePathComponents(context, root, absolutePath, label) {
  if (!containsPath(root, absolutePath)) fail('E_INPUT_UNSAFE', `${label} escapes its declared root`);
  const relative = path.relative(root, absolutePath);
  let cursor = root;
  const components = relative.split(path.sep).filter(Boolean);
  for (let index = -1; index < components.length; index += 1) {
    if (index >= 0) cursor = path.join(cursor, components[index]);
    let stat;
    try {
      stat = fs.lstatSync(cursor, { bigint: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        fail('E_INPUT_MISSING', `${label} is missing`);
      }
      fail('E_INPUT_UNREADABLE', `${label} cannot be inspected`);
    }
    if (stat.isSymbolicLink()) fail('E_INPUT_SYMLINK', `${label} traverses a symbolic link`);
    const final = index === components.length - 1;
    if (!final && !stat.isDirectory()) fail('E_INPUT_TYPE', `${label} has a non-directory ancestor`);
    if (!stat.isDirectory() && !stat.isFile()) fail('E_INPUT_TYPE', `${label} has an unsupported path type`);
    recordObservation(context, {
      kind: stat.isDirectory() ? 'directory' : 'file',
      absolutePath: cursor,
      label: index === -1 ? context.roots.get(root) ?? label : label,
      fingerprint: statFingerprint(stat),
      digest: null,
    });
  }
}

/**
 * @param {ReadContext} context
 * @param {string} absolutePath
 * @param {string} label
 * @param {{ root?: string, track?: boolean }} [options]
 * @returns {{ buffer: Buffer, fingerprint: string, digest: string }}
 */
function readStableFileAt(context, absolutePath, label, options = {}) {
  const root = options.root ?? context.root;
  capturePathComponents(context, root, absolutePath, label);
  let descriptor;
  try {
    fs.accessSync(absolutePath, fs.constants.R_OK);
    descriptor = fs.openSync(
      absolutePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ELOOP') {
      fail('E_INPUT_SYMLINK', `${label} must not be a symbolic link`);
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      fail('E_INPUT_MISSING', `${label} is missing`);
    }
    fail('E_INPUT_UNREADABLE', `${label} is not readable`);
  }

  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) fail('E_INPUT_TYPE', `${label} must be a regular file`);
    const buffer = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    let current;
    try {
      current = fs.lstatSync(absolutePath, { bigint: true });
    } catch {
      fail('E_INPUT_DRIFT', `${label} changed while it was being read`);
    }
    const beforeFingerprint = statFingerprint(before);
    const afterFingerprint = statFingerprint(after);
    const currentFingerprint = statFingerprint(current);
    if (!current.isFile()
      || current.isSymbolicLink()
      || beforeFingerprint !== afterFingerprint
      || beforeFingerprint !== currentFingerprint) {
      fail('E_INPUT_DRIFT', `${label} changed while it was being read`);
    }
    capturePathComponents(context, root, absolutePath, label);
    const digest = sha256(buffer);
    if (options.track !== false) {
      recordObservation(context, {
        kind: 'file',
        absolutePath,
        label,
        fingerprint: beforeFingerprint,
        digest,
      });
    }
    return { buffer, fingerprint: beforeFingerprint, digest };
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * @param {ReadContext} context
 * @param {string} absolutePath
 * @param {string} label
 * @param {{ root?: string, track?: boolean }} [options]
 * @returns {{ entries: fs.Dirent[], fingerprint: string, digest: string }}
 */
function readStableDirectoryAt(context, absolutePath, label, options = {}) {
  const root = options.root ?? context.root;
  capturePathComponents(context, root, absolutePath, label);
  let before;
  try {
    before = fs.lstatSync(absolutePath, { bigint: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      fail('E_INPUT_MISSING', `${label} is missing`);
    }
    fail('E_INPUT_UNREADABLE', `${label} cannot be inspected`);
  }
  if (before.isSymbolicLink()) fail('E_INPUT_SYMLINK', `${label} must not be a symbolic link`);
  if (!before.isDirectory()) fail('E_INPUT_TYPE', `${label} must be a directory`);

  let entries;
  try {
    entries = fs.readdirSync(absolutePath, { withFileTypes: true })
      .sort((first, second) => first.name < second.name ? -1 : first.name > second.name ? 1 : 0);
  } catch {
    fail('E_INPUT_UNREADABLE', `${label} is not readable`);
  }
  const after = fs.lstatSync(absolutePath, { bigint: true });
  const beforeFingerprint = statFingerprint(before);
  if (!after.isDirectory() || after.isSymbolicLink() || statFingerprint(after) !== beforeFingerprint) {
    fail('E_INPUT_DRIFT', `${label} changed while it was being inspected`);
  }
  capturePathComponents(context, root, absolutePath, label);
  const digest = sha256(entries.map((entry) => {
    const kind = entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : entry.isSymbolicLink() ? 'l' : 'o';
    return `${kind}\0${entry.name}\0`;
  }).join(''));
  if (options.track !== false) {
    recordObservation(context, {
      kind: 'directory',
      absolutePath,
      label,
      fingerprint: beforeFingerprint,
      digest,
    });
  }
  return { entries, fingerprint: beforeFingerprint, digest };
}

/** @param {ReadContext} context @param {string} relativePath @param {string} label */
function readWorkspaceFile(context, relativePath, label = relativePath) {
  const absolutePath = workspacePath(context, relativePath, label);
  return readStableFileAt(context, absolutePath, label);
}

/** @param {ReadContext} context @param {string} relativePath @param {string} label */
function readWorkspaceDirectory(context, relativePath, label = relativePath) {
  const absolutePath = workspacePath(context, relativePath, label);
  return readStableDirectoryAt(context, absolutePath, label);
}

/** @param {ReadContext} context */
function verifyObservations(context) {
  const observations = [...context.observations.values()]
    .sort((first, second) => lexicalCompare(first.absolutePath, second.absolutePath));
  for (const observation of observations) {
    let stat;
    try {
      stat = fs.lstatSync(observation.absolutePath, { bigint: true });
    } catch {
      fail('E_INPUT_DRIFT', `${observation.label} changed during the audit`);
    }
    if (stat.isSymbolicLink()
      || (observation.kind === 'file' ? !stat.isFile() : !stat.isDirectory())
      || statFingerprint(stat) !== observation.fingerprint) {
      fail('E_INPUT_DRIFT', `${observation.label} changed during the audit`);
    }
    if (observation.digest === null) continue;
    if (observation.kind === 'directory') {
      const entries = fs.readdirSync(observation.absolutePath, { withFileTypes: true })
        .sort((first, second) => lexicalCompare(first.name, second.name));
      const digest = sha256(entries.map((entry) => {
        const kind = entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : entry.isSymbolicLink() ? 'l' : 'o';
        return `${kind}\0${entry.name}\0`;
      }).join(''));
      if (digest !== observation.digest) fail('E_INPUT_DRIFT', `${observation.label} changed during the audit`);
      continue;
    }
    let descriptor;
    try {
      descriptor = fs.openSync(
        observation.absolutePath,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
      );
      const before = fs.fstatSync(descriptor, { bigint: true });
      const buffer = fs.readFileSync(descriptor);
      const after = fs.fstatSync(descriptor, { bigint: true });
      if (statFingerprint(before) !== observation.fingerprint
        || statFingerprint(after) !== observation.fingerprint
        || sha256(buffer) !== observation.digest) {
        fail('E_INPUT_DRIFT', `${observation.label} changed during the audit`);
      }
    } catch (error) {
      if (error instanceof PromptAuditError) throw error;
      fail('E_INPUT_DRIFT', `${observation.label} changed during the audit`);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
}

/** @param {Buffer} buffer @param {string} label @returns {string} */
function decodeUtf8(buffer, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    fail('E_INPUT_ENCODING', `${label} is not valid UTF-8`);
  }
}

/** @param {string} name @param {{ kind: string, activation_assumption: string, members: string[] }} definition */
function definitionHash(name, definition) {
  return sha256(JSON.stringify({
    name,
    kind: definition.kind,
    activation_assumption: definition.activation_assumption,
    members: definition.members,
  }));
}

/**
 * @param {ReadContext} context
 * @param {string} profilesPath
 */
function readProfileManifest(context, profilesPath) {
  let absolutePath;
  let relativePath;
  if (path.isAbsolute(profilesPath)) {
    const requestedPath = path.resolve(profilesPath);
    const lexicalRoot = [context.requestedRoot, context.root]
      .find((workspaceRoot) => containsPath(workspaceRoot, requestedPath));
    if (!lexicalRoot) {
      fail('E_INPUT_UNSAFE', 'profile manifest must be inside the workspace');
    }
    assertNoStaticSymlinkAncestors(requestedPath, {
      anchor: lexicalRoot,
      label: 'profile manifest',
      missingCode: 'E_INPUT_MISSING',
      symlinkCode: 'E_INPUT_SYMLINK',
    });
    relativePath = path.relative(lexicalRoot, requestedPath).split(path.sep).join('/');
    validateRelativePath(relativePath, 'profile manifest');
    absolutePath = path.join(context.root, ...relativePath.split('/'));
  } else {
    absolutePath = workspacePath(context, profilesPath, 'profile manifest');
    relativePath = path.relative(context.root, absolutePath).split(path.sep).join('/');
  }
  if (!containsPath(context.root, absolutePath)) {
    fail('E_INPUT_UNSAFE', 'profile manifest must be inside the workspace');
  }
  validateRelativePath(relativePath, 'profile manifest');
  const observed = readStableFileAt(context, absolutePath, relativePath);
  let raw;
  try {
    raw = JSON.parse(decodeUtf8(observed.buffer, relativePath));
  } catch (error) {
    if (error instanceof PromptAuditError) throw error;
    fail('E_PROFILE_JSON', 'profile manifest is not valid JSON', { path: relativePath });
  }
  const manifest = requireObject(raw, 'profile manifest');
  requireExactKeys(manifest, PROFILE_KEYS, 'profile manifest');
  if (manifest.schema_version !== PROFILE_SCHEMA_VERSION) {
    fail('E_PROFILE_SCHEMA', `profile manifest schema_version must be ${PROFILE_SCHEMA_VERSION}`);
  }
  if (manifest.metric !== METRIC_KIND) {
    fail('E_PROFILE_SCHEMA', `profile manifest metric must be '${METRIC_KIND}'`);
  }

  if (!Array.isArray(manifest.profile_order) || manifest.profile_order.length === 0) {
    fail('E_PROFILE_ORDER', 'profile_order must be a non-empty array');
  }
  const profileOrder = manifest.profile_order.map((name, index) => {
    const value = requireNonEmptyString(name, `profile_order[${index}]`);
    if (!NAME_RE.test(value)) fail('E_PROFILE_ORDER', `invalid profile name '${value}'`);
    return value;
  });
  if (new Set(profileOrder).size !== profileOrder.length) {
    fail('E_PROFILE_ORDER', 'profile_order contains a duplicate name');
  }

  const profilesObject = requireObject(manifest.profiles, 'profiles');
  if (JSON.stringify(Object.keys(profilesObject)) !== JSON.stringify(profileOrder)) {
    fail('E_PROFILE_ORDER', 'profiles object order and membership must exactly match profile_order');
  }

  const parity = requireObject(manifest.parity, 'parity');
  requireExactKeys(parity, PARITY_KEYS, 'parity');
  for (const key of PARITY_KEYS) validateRelativePath(parity[key], `parity.${key}`);
  requireDistinctCoreRoots(parity, 'parity');

  /** @type {Record<string, { kind: string, activation_assumption: string, members: string[] }>} */
  const profiles = {};
  for (const name of profileOrder) {
    const definition = requireObject(profilesObject[name], `profiles.${name}`);
    requireExactKeys(definition, PROFILE_DEFINITION_KEYS, `profiles.${name}`);
    if (definition.kind !== 'release-source') {
      fail('E_PROFILE_SCHEMA', `profiles.${name}.kind must be 'release-source'`);
    }
    const activation = requireNonEmptyString(
      definition.activation_assumption,
      `profiles.${name}.activation_assumption`,
    );
    if (!Array.isArray(definition.members) || definition.members.length === 0) {
      fail('E_PROFILE_MEMBERSHIP', `profiles.${name}.members must be a non-empty array`);
    }
    const members = definition.members.map((member, index) =>
      validateRelativePath(member, `profiles.${name}.members[${index}]`));
    if (new Set(members).size !== members.length) {
      fail('E_PROFILE_MEMBERSHIP', `profiles.${name}.members contains a duplicate path`);
    }
    for (const member of members) {
      if (!isWithinRelative(member, parity.core_source_root)
        && !isWithinRelative(member, parity.pack_catalog_root)) {
        fail('E_PROFILE_MEMBERSHIP', `release-source member is outside declared source roots`, { path: member });
      }
    }
    profiles[name] = { kind: definition.kind, activation_assumption: activation, members };
  }

  const dogfood = requireObject(manifest.dogfood_guidance, 'dogfood_guidance');
  requireExactKeys(dogfood, PROFILE_DEFINITION_KEYS, 'dogfood_guidance');
  if (dogfood.kind !== 'dogfood-guidance') {
    fail('E_PROFILE_SCHEMA', "dogfood_guidance.kind must be 'dogfood-guidance'");
  }
  const dogfoodActivation = requireNonEmptyString(
    dogfood.activation_assumption,
    'dogfood_guidance.activation_assumption',
  );
  if (!Array.isArray(dogfood.members) || dogfood.members.length === 0) {
    fail('E_PROFILE_MEMBERSHIP', 'dogfood_guidance.members must be a non-empty array');
  }
  const dogfoodMembers = dogfood.members.map((member, index) =>
    validateRelativePath(member, `dogfood_guidance.members[${index}]`));
  if (new Set(dogfoodMembers).size !== dogfoodMembers.length) {
    fail('E_PROFILE_MEMBERSHIP', 'dogfood_guidance.members contains a duplicate path');
  }
  for (const member of dogfoodMembers) {
    if (isWithinRelative(member, '.dude/ideas') || isWithinRelative(member, '.dude/specs')) {
      fail('E_PROFILE_MEMBERSHIP', 'dogfood guidance must exclude ideas and specification history', { path: member });
    }
  }

  return {
    path: relativePath,
    sha256: observed.digest,
    profileOrder,
    profiles,
    dogfood: {
      kind: dogfood.kind,
      activation_assumption: dogfoodActivation,
      members: dogfoodMembers,
    },
    parity: {
      core_source_root: parity.core_source_root,
      core_generated_root: parity.core_generated_root,
      pack_catalog_root: parity.pack_catalog_root,
      install_profile: parity.install_profile,
    },
  };
}

/** @param {ReadContext} context @param {string} root @param {string} relativePath @param {string} [label] */
function optionalTreeStat(context, root, relativePath, label = relativePath) {
  const normalized = validateRelativePath(relativePath, label);
  const absolutePath = path.resolve(root, ...normalized.split('/'));
  if (!containsPath(root, absolutePath)) fail('E_INPUT_UNSAFE', `${label} escapes its declared root`);
  capturePathComponents(context, root, path.dirname(absolutePath), `${label} parent`);
  try {
    const stat = fs.lstatSync(absolutePath, { bigint: true });
    capturePathComponents(context, root, absolutePath, label);
    return stat;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    if (error instanceof PromptAuditError) throw error;
    fail('E_INPUT_UNREADABLE', `${label} cannot be inspected`);
  }
}

/** @param {ReadContext} context @param {string} root @param {string} relativePath @param {string} label */
function readTreeFile(context, root, relativePath, label) {
  const normalized = validateRelativePath(relativePath, label);
  return readStableFileAt(
    context,
    path.resolve(root, ...normalized.split('/')),
    label,
    { root },
  );
}

/** @param {ReadContext} context @param {string} root @param {string} relativePath @param {string} label */
function readTreeDirectory(context, root, relativePath, label) {
  const normalized = validateRelativePath(relativePath, label);
  return readStableDirectoryAt(
    context,
    path.resolve(root, ...normalized.split('/')),
    label,
    { root },
  );
}

/**
 * Hash one artifact with the same canonical tree encoding used by compose.
 * @param {ReadContext} context
 * @param {string} relativePath
 * @param {string} [root]
 * @param {string} [label]
 */
function hashArtifact(context, relativePath, root = context.root, label = relativePath) {
  const hash = crypto.createHash('sha256');
  /** @param {string} currentPath @param {string} relative */
  function visit(currentPath, relative) {
    const stat = optionalTreeStat(context, root, currentPath, label);
    if (!stat) fail('E_INPUT_MISSING', 'pack artifact is missing', { path: currentPath });
    if (stat.isSymbolicLink()) fail('E_INPUT_SYMLINK', 'pack artifact contains a symbolic link', { path: currentPath });
    if (stat.isDirectory()) {
      hash.update(`directory\0${relative}\0`);
      const { entries } = readTreeDirectory(context, root, currentPath, label);
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          fail('E_INPUT_SYMLINK', 'pack artifact contains a symbolic link', { path: `${currentPath}/${entry.name}` });
        }
        visit(`${currentPath}/${entry.name}`, relative ? `${relative}/${entry.name}` : entry.name);
      }
      return;
    }
    if (!stat.isFile()) fail('E_INPUT_TYPE', 'pack artifact must contain only regular files', { path: currentPath });
    const observed = readTreeFile(context, root, currentPath, label);
    hash.update(`file\0${relative}\0`);
    hash.update(observed.buffer);
    hash.update('\0');
  }
  visit(relativePath, '');
  return hash.digest('hex');
}

/** @param {string} text @param {string} packName */
function parsePackManifest(text, packName) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!frontmatter) fail('E_PACK_MANIFEST', `pack '${packName}' has no frontmatter`);
  const name = /^name:\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(frontmatter)?.[1]?.trim();
  if (name !== packName) fail('E_PACK_MANIFEST', `pack manifest name does not match '${packName}'`);
  /** @type {Record<string, string[]>} */
  const provides = { agents: [], skills: [] };
  for (const kind of ['agents', 'skills']) {
    const match = new RegExp(`^\\s{2}${kind}:\\s*\\[([^\\]]*)\\]\\s*$`, 'm').exec(frontmatter);
    if (!match) fail('E_PACK_MANIFEST', `pack '${packName}' must declare provides.${kind}`);
    provides[kind] = match[1].trim()
      ? match[1].split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    if (new Set(provides[kind]).size !== provides[kind].length) {
      fail('E_PACK_MANIFEST', `pack '${packName}' repeats provides.${kind}`);
    }
  }
  return provides;
}

/**
 * @typedef {{ name: string, manifest_sha256: string, artifacts: { source: string, kind: string, sha256: string }[] }} SourcePack
 */

/**
 * @param {ReadContext} context
 * @param {string} catalogRoot
 * @param {string} packName
 * @param {Map<string, SourcePack>} cache
 * @param {string} [root]
 * @returns {SourcePack}
 */
function validateSourcePack(context, catalogRoot, packName, cache, root = context.root) {
  const packRoot = catalogRoot ? `${catalogRoot}/${packName}` : packName;
  const cacheKey = `${root}\0${packRoot}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  if (!NAME_RE.test(packName)) fail('E_PACK_SOURCE', `invalid pack name '${packName}'`);
  const packStat = optionalTreeStat(context, root, packRoot, `pack '${packName}' source`);
  if (!packStat || !packStat.isDirectory()) {
    fail('E_PACK_SOURCE', `persisted source does not contain pack '${packName}'`);
  }
  const manifestPath = `${packRoot}/pack.md`;
  const manifest = readTreeFile(context, root, manifestPath, `pack '${packName}' manifest`);
  const provides = parsePackManifest(decodeUtf8(manifest.buffer, manifestPath), packName);
  /** @type {SourcePack['artifacts']} */
  const artifacts = [];

  for (const kind of PACK_KINDS) {
    const categoryPath = `${packRoot}/${kind}`;
    const stat = optionalTreeStat(context, root, categoryPath, `pack '${packName}' ${kind}`);
    if (!stat) continue;
    if (stat.isSymbolicLink()) fail('E_INPUT_SYMLINK', 'pack category must not be a symbolic link', { path: categoryPath });
    if (!stat.isDirectory()) fail('E_PACK_SOURCE', 'pack category must be a directory', { path: categoryPath });
    const { entries } = readTreeDirectory(context, root, categoryPath, `pack '${packName}' ${kind}`);
    for (const entry of entries) {
      const artifactPath = `${categoryPath}/${entry.name}`;
      if (entry.isSymbolicLink()) fail('E_INPUT_SYMLINK', 'pack artifact must not be a symbolic link', { path: artifactPath });
      if (kind === 'skills' ? !entry.isDirectory() : !entry.isFile()) {
        fail('E_PACK_SOURCE', `pack ${kind} artifact has the wrong type`, { path: artifactPath });
      }
      if (!entry.name.startsWith(`dude-pack-${packName}-`)) {
        fail('E_PACK_SOURCE', `pack artifact is outside the dude-pack-${packName}-* namespace`, { path: artifactPath });
      }
      if ((kind === 'agents' && !entry.name.endsWith('.agent.md'))
        || (kind === 'instructions' && !entry.name.endsWith('.instructions.md'))
        || (kind === 'prompts' && !entry.name.endsWith('.prompt.md'))) {
        fail('E_PACK_SOURCE', `pack ${kind} artifact has an invalid name`, { path: artifactPath });
      }
      artifacts.push({
        source: `${kind}/${entry.name}`,
        kind,
        sha256: hashArtifact(context, artifactPath, root, `pack '${packName}' artifact '${kind}/${entry.name}'`),
      });
    }
  }
  artifacts.sort((first, second) => first.source.localeCompare(second.source));
  if (artifacts.length === 0) fail('E_PACK_SOURCE', `pack '${packName}' has no installable artifacts`);

  const actualAgents = artifacts
    .filter((artifact) => artifact.kind === 'agents')
    .map((artifact) => path.posix.basename(artifact.source).replace(/\.agent\.md$/, ''));
  const actualSkills = artifacts
    .filter((artifact) => artifact.kind === 'skills')
    .map((artifact) => path.posix.basename(artifact.source));
  if (JSON.stringify([...provides.agents].sort()) !== JSON.stringify(actualAgents)
    || JSON.stringify([...provides.skills].sort()) !== JSON.stringify(actualSkills)) {
    fail('E_PACK_MANIFEST', `pack '${packName}' provides do not match its agents and skills`);
  }

  const result = { name: packName, manifest_sha256: manifest.digest, artifacts };
  cache.set(cacheKey, result);
  return result;
}

/** @param {unknown} value @param {string} label @param {string} code @returns {string} */
function requireSha256(value, label, code = 'E_INSTALL_PROFILE') {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    fail(code, `${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

/** @param {unknown} value @param {string} label @param {string} code @returns {string[]} */
function requireSortedUniqueStrings(value, label, code = 'E_INSTALL_PROFILE') {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(code, `${label} must be an array of strings`);
  }
  const strings = /** @type {string[]} */ (value);
  if (new Set(strings).size !== strings.length
    || JSON.stringify(strings) !== JSON.stringify([...strings].sort(lexicalCompare))) {
    fail(code, `${label} must be lexically sorted and unique`);
  }
  return strings;
}

/** @param {string[]} enabled @param {string} [code] */
function requireNoEnabledPackPrefixCollisions(enabled, code = 'E_INSTALL_PROFILE') {
  for (let index = 0; index < enabled.length; index += 1) {
    const packName = enabled[index];
    const ambiguousName = enabled.slice(index + 1).find((candidate) => candidate.startsWith(`${packName}-`));
    if (ambiguousName) {
      fail(
        code,
        `enabled pack names '${packName}' and '${ambiguousName}' have an ambiguous namespace prefix`,
      );
    }
  }
}

/** @param {Record<string, any>} inventory */
export function computeInventoryDigest(inventory) {
  return sha256(JSON.stringify({
    version: inventory.version,
    pack: inventory.pack,
    source: {
      type: inventory.source.type,
      location: inventory.source.location,
      ref: inventory.source.ref,
    },
    manifest_sha256: inventory.manifest_sha256,
    artifacts: [...inventory.artifacts]
      .sort((first, second) => first.path.localeCompare(second.path))
      .map((artifact) => ({
        path: artifact.path,
        kind: artifact.kind,
        source: artifact.source,
        source_sha256: artifact.source_sha256,
        installed_sha256: artifact.installed_sha256,
      })),
  }));
}

/** @param {Buffer} buffer @param {string} label */
function parseFencedJson(buffer, label) {
  const text = decodeUtf8(buffer, label);
  const blocks = [...text.matchAll(/```json[^\S\r\n]*(?:\r?\n)([\s\S]*?)\r?\n```/g)];
  if (blocks.length !== 1) fail('E_INSTALL_PROFILE', `${label} must contain exactly one fenced JSON object`);
  let value;
  try {
    value = JSON.parse(blocks[0][1]);
  } catch {
    fail('E_INSTALL_PROFILE', `${label} contains malformed JSON`);
  }
  return requireObject(value, label, 'E_INSTALL_PROFILE');
}

/**
 * @param {ReadContext} context
 * @param {{ type: string, location: string, ref: string }} sourceIdentity
 * @param {string} packName
 */
function resolvePersistedPackSource(context, sourceIdentity, packName) {
  const location = path.isAbsolute(sourceIdentity.location)
    ? sourceIdentity.location
    : path.resolve(context.root, sourceIdentity.location);
  let sourceRoot;
  try {
    sourceRoot = registerReadRoot(
      context,
      location,
      `pack '${packName}' persisted source root`,
      'E_PACK_SOURCE',
    );
  } catch (error) {
    if (error instanceof PromptAuditError
      && ['E_PACK_SOURCE', 'E_INPUT_MISSING', 'E_ROOT_MISSING'].includes(error.code)) {
      fail('E_PACK_SOURCE', `persisted source for pack '${packName}' is unavailable`, {
        source: sourceIdentity.location,
      });
    }
    throw error;
  }
  return {
    root: sourceRoot,
    catalogRoot: sourceIdentity.type === 'library' ? '' : 'library/packs',
  };
}

/**
 * @param {ReadContext} context
 * @param {string} packName
 * @returns {string[]}
 */
function enumerateInstalledPackArtifacts(context, packName) {
  const prefix = `dude-pack-${packName}-`;
  const artifacts = [];
  for (const kind of PACK_KINDS) {
    const categoryPath = `.github/${kind}`;
    const categoryStat = optionalTreeStat(context, context.root, categoryPath, categoryPath);
    if (!categoryStat) continue;
    if (categoryStat.isSymbolicLink()) {
      fail('E_INPUT_SYMLINK', 'installed pack category must not be a symbolic link', { path: categoryPath });
    }
    if (!categoryStat.isDirectory()) {
      fail('E_PACK_PARITY', 'installed pack category has the wrong type', { path: categoryPath });
    }
    const { entries } = readTreeDirectory(context, context.root, categoryPath, categoryPath);
    for (const entry of entries) {
      if (!entry.name.startsWith(prefix)) continue;
      const artifactPath = `${categoryPath}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        fail('E_INPUT_SYMLINK', 'installed pack artifact must not be a symbolic link', { path: artifactPath });
      }
      if (kind === 'skills' ? !entry.isDirectory() : !entry.isFile()) {
        fail('E_PACK_PARITY', `installed pack ${kind} artifact has the wrong type`, { path: artifactPath });
      }
      artifacts.push(artifactPath);
    }
  }
  return artifacts.sort(lexicalCompare);
}

/** @param {SourcePack} sourcePack */
function sourcePackProjection(sourcePack) {
  const artifacts = sourcePack.artifacts
    .map((artifact) => ({
      source: artifact.source,
      kind: artifact.kind,
      sha256: artifact.sha256,
    }))
    .sort((first, second) => lexicalCompare(first.source, second.source));
  return {
    name: sourcePack.name,
    manifest_sha256: sourcePack.manifest_sha256,
    artifact_count: artifacts.length,
    artifacts,
  };
}

/**
 * @param {ReadContext} context
 * @param {{ install_profile: string }} parity
 * @param {Map<string, SourcePack>} packCache
 */
function verifyEnabledPacks(context, parity, packCache) {
  const profileObserved = readWorkspaceFile(context, parity.install_profile);
  const profile = parseFencedJson(profileObserved.buffer, parity.install_profile);
  requireExactKeys(profile, ['enabled_packs', 'installed'], 'install profile');
  const enabled = requireSortedUniqueStrings(profile.enabled_packs, 'install profile enabled_packs');
  requireNoEnabledPackPrefixCollisions(enabled);
  const installed = requireObject(profile.installed, 'install profile installed');
  if (JSON.stringify(Object.keys(installed)) !== JSON.stringify(enabled)) {
    fail('E_INSTALL_PROFILE', 'install profile installed keys must exactly match enabled_packs');
  }

  /** @type {Record<string, any>[]} */
  const packs = [];
  /** @type {Map<string, SourcePack>} */
  const verifiedPacks = new Map();
  for (const packName of enabled) {
    if (!NAME_RE.test(packName)) fail('E_INSTALL_PROFILE', `invalid enabled pack name '${packName}'`);
    const entry = requireObject(installed[packName], `installed.${packName}`);
    requireExactKeys(entry, ['files', 'installed_at', 'inventory'], `installed.${packName}`);
    if (typeof entry.installed_at !== 'string' || !entry.installed_at) {
      fail('E_INSTALL_PROFILE', `installed.${packName}.installed_at must be a non-empty string`);
    }
    const files = requireSortedUniqueStrings(entry.files, `installed.${packName}.files`);
    const inventory = requireObject(entry.inventory, `installed.${packName}.inventory`);
    requireExactKeys(
      inventory,
      ['artifacts', 'digest', 'manifest_sha256', 'pack', 'source', 'version'],
      `installed.${packName}.inventory`,
    );
    if (inventory.version !== 1 || inventory.pack !== packName) {
      fail('E_INSTALL_PROFILE', `installed.${packName}.inventory identity is invalid`);
    }
    const sourceIdentity = requireObject(inventory.source, `installed.${packName}.inventory.source`);
    requireExactKeys(sourceIdentity, ['location', 'ref', 'type'], `installed.${packName}.inventory.source`);
    if (!['library', 'source'].includes(sourceIdentity.type)
      || typeof sourceIdentity.location !== 'string'
      || !sourceIdentity.location
      || typeof sourceIdentity.ref !== 'string') {
      fail('E_INSTALL_PROFILE', `installed.${packName}.inventory.source is invalid`);
    }
    requireSha256(inventory.manifest_sha256, `installed.${packName}.inventory.manifest_sha256`);
    requireSha256(inventory.digest, `installed.${packName}.inventory.digest`);
    if (!Array.isArray(inventory.artifacts) || inventory.artifacts.length === 0) {
      fail('E_INSTALL_PROFILE', `installed.${packName}.inventory.artifacts must be non-empty`);
    }
    if (inventory.digest !== computeInventoryDigest(inventory)) {
      fail('E_INSTALL_PROFILE', `pack '${packName}' inventory digest is invalid`);
    }

    const persistedSource = resolvePersistedPackSource(context, sourceIdentity, packName);
    const sourcePack = validateSourcePack(
      context,
      persistedSource.catalogRoot,
      packName,
      packCache,
      persistedSource.root,
    );
    if (inventory.manifest_sha256 !== sourcePack.manifest_sha256) {
      fail('E_PACK_PARITY', `pack '${packName}' manifest differs from its persisted source`);
    }
    const sourceBySource = new Map(sourcePack.artifacts.map((artifact) => [artifact.source, artifact]));
    const seenPaths = new Set();
    const seenSources = new Set();
    const artifacts = inventory.artifacts.map((rawArtifact, index) => {
      const artifact = requireObject(rawArtifact, `installed.${packName}.inventory.artifacts[${index}]`);
      requireExactKeys(
        artifact,
        ['installed_sha256', 'kind', 'path', 'source', 'source_sha256'],
        `installed.${packName}.inventory.artifacts[${index}]`,
      );
      if (!PACK_KINDS.includes(artifact.kind)) {
        fail('E_INSTALL_PROFILE', `installed.${packName} has an invalid artifact kind`);
      }
      const expectedPrefix = `${artifact.kind}/`;
      if (typeof artifact.source !== 'string'
        || !artifact.source.startsWith(expectedPrefix)
        || artifact.source.split('/').length !== 2) {
        fail('E_INSTALL_PROFILE', `installed.${packName} has an unsafe artifact source`);
      }
      const expectedPath = `.github/${artifact.source}`;
      if (artifact.path !== expectedPath) {
        fail('E_INSTALL_PROFILE', `installed.${packName} artifact path/source mismatch`);
      }
      validateRelativePath(artifact.path, `installed.${packName} artifact path`);
      requireSha256(artifact.source_sha256, `installed.${packName} artifact source_sha256`);
      requireSha256(artifact.installed_sha256, `installed.${packName} artifact installed_sha256`);
      if (seenPaths.has(artifact.path) || seenSources.has(artifact.source)) {
        fail('E_INSTALL_PROFILE', `installed.${packName} repeats an artifact`);
      }
      seenPaths.add(artifact.path);
      seenSources.add(artifact.source);
      const sourceArtifact = sourceBySource.get(artifact.source);
      if (!sourceArtifact || sourceArtifact.sha256 !== artifact.source_sha256) {
        fail('E_PACK_PARITY', `pack '${packName}' raw source artifact differs from inventory`, { path: artifact.source });
      }
      return artifact;
    });
    const inventoryPaths = artifacts.map((artifact) => artifact.path);
    const sortedInventoryPaths = [...inventoryPaths].sort(lexicalCompare);
    if (JSON.stringify(inventoryPaths) !== JSON.stringify(sortedInventoryPaths)) {
      fail('E_INSTALL_PROFILE', `pack '${packName}' inventory artifacts must use canonical path order`);
    }
    if (JSON.stringify(files) !== JSON.stringify(inventoryPaths)
      || JSON.stringify(sourcePack.artifacts.map((artifact) => `.github/${artifact.source}`))
        !== JSON.stringify(inventoryPaths)) {
      fail('E_PACK_PARITY', `pack '${packName}' source, profile, and installed artifact sets differ`);
    }
    const actualPaths = enumerateInstalledPackArtifacts(context, packName);
    if (JSON.stringify(actualPaths) !== JSON.stringify(inventoryPaths)) {
      const expected = new Set(inventoryPaths);
      const actual = new Set(actualPaths);
      fail('E_PACK_PARITY', `pack '${packName}' installed artifact inventory differs from actual files`, {
        missing: inventoryPaths.filter((artifactPath) => !actual.has(artifactPath)),
        extra: actualPaths.filter((artifactPath) => !expected.has(artifactPath)),
      });
    }
    for (const artifact of artifacts) {
      const installedHash = hashArtifact(
        context,
        artifact.path,
        context.root,
        `pack '${packName}' installed artifact '${artifact.path}'`,
      );
      if (installedHash !== artifact.installed_sha256) {
        fail('E_PACK_PARITY', `pack '${packName}' installed artifact differs from inventory`, { path: artifact.path });
      }
    }
    verifiedPacks.set(packName, sourcePack);
    packs.push({
      name: packName,
      source_identity: {
        type: sourceIdentity.type,
        location: sourceIdentity.location,
        ref: sourceIdentity.ref,
      },
      inventory_digest: inventory.digest,
      manifest_sha256: inventory.manifest_sha256,
      artifact_count: artifacts.length,
      source_status: 'pass',
      installed_status: 'pass',
    });
  }
  return {
    report: {
      status: 'pass',
      profile_path: parity.install_profile,
      profile_sha256: profileObserved.digest,
      enabled_packs: enabled,
      packs,
    },
    verifiedPacks,
  };
}

/**
 * @param {ReadContext} context
 * @param {{ profileOrder: string[], profiles: Record<string, { members: string[] }>, parity: { core_source_root: string, core_generated_root: string } }} manifest
 */
function verifyCoreParity(context, manifest) {
  const sources = new Set();
  for (const name of manifest.profileOrder) {
    for (const member of manifest.profiles[name].members) {
      if (isWithinRelative(member, manifest.parity.core_source_root)) sources.add(member);
    }
  }
  const checks = [...sources].sort(lexicalCompare).map((source) => {
    const suffix = source.slice(manifest.parity.core_source_root.length).replace(/^\//, '');
    const generated = suffix
      ? `${manifest.parity.core_generated_root}/${suffix}`
      : manifest.parity.core_generated_root;
    const sourceObserved = readWorkspaceFile(context, source);
    const generatedObserved = readWorkspaceFile(context, generated);
    if (sourceObserved.digest !== generatedObserved.digest
      || !sourceObserved.buffer.equals(generatedObserved.buffer)) {
      fail('E_CORE_PARITY', 'core source/generated parity failed', { path: source });
    }
    return { source, generated, sha256: sourceObserved.digest };
  });
  return { status: checks.length > 0 ? 'pass' : 'not-applicable', checks };
}

/**
 * @param {ReadContext} context
 * @param {{ profileOrder: string[], profiles: Record<string, { members: string[] }>, parity: { pack_catalog_root: string } }} manifest
 * @param {Map<string, SourcePack>} packCache
 * @param {Map<string, SourcePack>} verifiedPacks
 */
function verifyProfileSourcePacks(context, manifest, packCache, verifiedPacks) {
  const packNames = new Set();
  for (const name of manifest.profileOrder) {
    for (const member of manifest.profiles[name].members) {
      if (!isWithinRelative(member, manifest.parity.pack_catalog_root)) continue;
      const suffix = member.slice(manifest.parity.pack_catalog_root.length).replace(/^\//, '');
      const packName = suffix.split('/')[0];
      if (!packName) fail('E_PROFILE_MEMBERSHIP', 'pack profile member lacks a pack name', { path: member });
      packNames.add(packName);
    }
  }
  return [...packNames].sort(lexicalCompare).map((packName) => {
    const catalogSourcePack = validateSourcePack(
      context,
      manifest.parity.pack_catalog_root,
      packName,
      packCache,
    );
    const persistedSourcePack = verifiedPacks.get(packName);
    if (persistedSourcePack
      && JSON.stringify(sourcePackProjection(catalogSourcePack))
        !== JSON.stringify(sourcePackProjection(persistedSourcePack))) {
      fail(
        'E_PACK_PARITY',
        `pack '${packName}' profile catalog source differs from its persisted source identity`,
      );
    }
    const sourcePack = persistedSourcePack ?? catalogSourcePack;
    const artifactRoots = sourcePack.artifacts.map((artifact) =>
      `${manifest.parity.pack_catalog_root}/${packName}/${artifact.source}`);
    for (const profileName of manifest.profileOrder) {
      for (const member of manifest.profiles[profileName].members) {
        if (isWithinRelative(member, `${manifest.parity.pack_catalog_root}/${packName}`)
          && !artifactRoots.some((root) => isWithinRelative(member, root))) {
          fail('E_PROFILE_MEMBERSHIP', 'pack profile member is outside an installable pack artifact', { path: member });
        }
      }
    }
    return {
      name: packName,
      source_status: 'pass',
      manifest_sha256: sourcePack.manifest_sha256,
      artifact_count: sourcePack.artifacts.length,
      installed_parity: persistedSourcePack ? 'pass' : 'not-applicable',
    };
  });
}

/**
 * @typedef {{ status: 'unavailable', reason: string } | { status: 'available', results_sha256: string, identity_sha256: string, name: string, version: string, encoding: string }} TokenizerIdentity
 */

/**
 * @param {ReadContext} context
 * @param {{ path: string, sha256: string } | undefined} config
 * @param {Map<string, { path: string, sha256: string, code_points: number, utf8_bytes: number }>} auditedInputs
 * @returns {{ identity: TokenizerIdentity, tokens: Map<string, number> | null }}
 */
function loadTokenizerResults(context, config, auditedInputs) {
  if (!config) {
    return {
      identity: { status: 'unavailable', reason: 'no tokenizer results supplied' },
      tokens: null,
    };
  }
  requireSha256(config.sha256, 'tokenizer results SHA-256', 'E_TOKENIZER_CONFIG');
  const requestedResultsPath = path.resolve(config.path);
  const resultsRoot = registerReadRoot(
    context,
    path.dirname(requestedResultsPath),
    'tokenizer results parent',
    'E_INPUT_MISSING',
    process.cwd(),
  );
  const resultsPath = path.join(resultsRoot, path.basename(requestedResultsPath));
  const results = readStableFileAt(context, resultsPath, 'tokenizer results', { root: resultsRoot });
  if (results.digest !== config.sha256) {
    fail('E_TOKENIZER_HASH', 'tokenizer results SHA-256 does not match the supplied digest');
  }
  let parsed;
  try {
    parsed = JSON.parse(decodeUtf8(results.buffer, 'tokenizer results'));
  } catch (error) {
    if (error instanceof PromptAuditError) throw error;
    fail('E_TOKENIZER_JSON', 'tokenizer results are not valid JSON');
  }
  const manifest = requireObject(parsed, 'tokenizer results', 'E_TOKENIZER_SCHEMA');
  requireExactKeys(
    manifest,
    ['inputs', 'kind', 'schema_version', 'tokenizer'],
    'tokenizer results',
    'E_TOKENIZER_SCHEMA',
  );
  if (manifest.schema_version !== 1 || manifest.kind !== 'prompt-audit-tokenizer-results') {
    fail('E_TOKENIZER_SCHEMA', 'tokenizer results identity is invalid');
  }
  const tokenizer = requireObject(manifest.tokenizer, 'tokenizer results tokenizer', 'E_TOKENIZER_SCHEMA');
  requireExactKeys(tokenizer, ['encoding', 'name', 'version'], 'tokenizer results tokenizer', 'E_TOKENIZER_SCHEMA');
  const name = requireNonEmptyString(tokenizer.name, 'tokenizer.name', 'E_TOKENIZER_SCHEMA');
  const version = requireNonEmptyString(tokenizer.version, 'tokenizer.version', 'E_TOKENIZER_SCHEMA');
  const encoding = requireNonEmptyString(tokenizer.encoding, 'tokenizer.encoding', 'E_TOKENIZER_SCHEMA');
  if (!Array.isArray(manifest.inputs)) {
    fail('E_TOKENIZER_SCHEMA', 'tokenizer results inputs must be an array');
  }

  /** @type {Map<string, number>} */
  const tokens = new Map();
  const paths = [];
  for (let index = 0; index < manifest.inputs.length; index += 1) {
    const input = requireObject(manifest.inputs[index], `tokenizer results inputs[${index}]`, 'E_TOKENIZER_SCHEMA');
    requireExactKeys(
      input,
      ['content_sha256', 'path', 'tokens'],
      `tokenizer results inputs[${index}]`,
      'E_TOKENIZER_SCHEMA',
    );
    const inputPath = validateRelativePath(input.path, `tokenizer results inputs[${index}].path`, 'E_TOKENIZER_SCHEMA');
    const contentSha = requireSha256(
      input.content_sha256,
      `tokenizer results inputs[${index}].content_sha256`,
      'E_TOKENIZER_SCHEMA',
    );
    if (!Number.isSafeInteger(input.tokens) || input.tokens < 0) {
      fail('E_TOKENIZER_SCHEMA', `tokenizer results inputs[${index}].tokens must be a non-negative safe integer`);
    }
    if (tokens.has(inputPath)) fail('E_TOKENIZER_COVERAGE', `tokenizer results repeat '${inputPath}'`);
    const audited = auditedInputs.get(inputPath);
    if (!audited) fail('E_TOKENIZER_COVERAGE', `tokenizer results contain unaudited input '${inputPath}'`);
    if (audited.sha256 !== contentSha) {
      fail('E_TOKENIZER_CONTENT', `tokenizer result content hash differs for '${inputPath}'`);
    }
    paths.push(inputPath);
    tokens.set(inputPath, input.tokens);
  }
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort(lexicalCompare))) {
    fail('E_TOKENIZER_COVERAGE', 'tokenizer result inputs must be lexically path-sorted');
  }
  const auditedPaths = [...auditedInputs.keys()].sort(lexicalCompare);
  if (JSON.stringify(paths) !== JSON.stringify(auditedPaths)) {
    fail('E_TOKENIZER_COVERAGE', 'tokenizer results must exactly cover all distinct audited paths');
  }
  const identity = { name, version, encoding };
  return {
    identity: {
      status: 'available',
      results_sha256: results.digest,
      identity_sha256: sha256(JSON.stringify(identity)),
      ...identity,
    },
    tokens,
  };
}

/** @param {number} left @param {number} right @param {string} label */
function checkedAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) fail('E_COUNT_RANGE', `${label} exceeds safe integer range`);
  return result;
}

/** @param {{ code_points: number, utf8_bytes: number, tokens: number | null }[]} inputs */
function totalInputs(inputs) {
  let codePoints = 0;
  let utf8Bytes = 0;
  let tokens = 0;
  let tokensAvailable = true;
  for (const input of inputs) {
    codePoints = checkedAdd(codePoints, input.code_points, 'code point total');
    utf8Bytes = checkedAdd(utf8Bytes, input.utf8_bytes, 'UTF-8 byte total');
    if (input.tokens === null) tokensAvailable = false;
    else tokens = checkedAdd(tokens, input.tokens, 'token total');
  }
  return {
    input_count: inputs.length,
    code_points: codePoints,
    utf8_bytes: utf8Bytes,
    tokens: tokensAvailable ? tokens : null,
  };
}

/**
 * Audit a frozen profile manifest without mutating the workspace.
 * @param {{ root: string, profilesPath: string, tokenizerResults?: { path: string, sha256: string } }} options
 */
export async function auditProfiles(options) {
  const context = createReadContext(options.root);
  const manifest = readProfileManifest(context, options.profilesPath);
  const packCache = new Map();
  const coreParity = verifyCoreParity(context, manifest);
  const enabledPackParity = verifyEnabledPacks(context, manifest.parity, packCache);
  const sourcePacks = verifyProfileSourcePacks(
    context,
    manifest,
    packCache,
    enabledPackParity.verifiedPacks,
  );
  /** @type {Map<string, { path: string, sha256: string, code_points: number, utf8_bytes: number }>} */
  const inputCache = new Map();

  /** @param {string} member */
  function inspectInput(member) {
    const existing = inputCache.get(member);
    if (existing) return existing;
    const observed = readWorkspaceFile(context, member);
    const text = decodeUtf8(observed.buffer, member);
    const codePoints = [...text].length;
    if (!Number.isSafeInteger(codePoints) || !Number.isSafeInteger(observed.buffer.length)) {
      fail('E_COUNT_RANGE', `input '${member}' exceeds safe integer range`);
    }
    const input = {
      path: member,
      sha256: observed.digest,
      code_points: codePoints,
      utf8_bytes: observed.buffer.length,
    };
    inputCache.set(member, input);
    return input;
  }
  for (const name of manifest.profileOrder) {
    for (const member of manifest.profiles[name].members) inspectInput(member);
  }
  for (const member of manifest.dogfood.members) inspectInput(member);

  const tokenizer = loadTokenizerResults(context, options.tokenizerResults, inputCache);
  /** @param {string} member */
  function reportInput(member) {
    const input = inputCache.get(member);
    if (!input) fail('E_INTERNAL', `audited input '${member}' was not cached`);
    return {
      ...input,
      tokens: tokenizer.tokens ? tokenizer.tokens.get(member) ?? null : null,
    };
  }

  const profiles = [];
  for (const name of manifest.profileOrder) {
    const definition = manifest.profiles[name];
    const inputs = definition.members.map(reportInput);
    const packNames = sourcePacks
      .filter((pack) => definition.members.some((member) =>
        isWithinRelative(member, `${manifest.parity.pack_catalog_root}/${pack.name}`)))
      .map((pack) => ({ name: pack.name, source: 'pass', installed: pack.installed_parity }));
    profiles.push({
      name,
      kind: definition.kind,
      activation_assumption: definition.activation_assumption,
      definition_sha256: definitionHash(name, definition),
      accepted: true,
      prerequisites: {
        enabled_pack_source_installed: 'pass',
        core_source_generated: definition.members.some((member) =>
          isWithinRelative(member, manifest.parity.core_source_root)) ? 'pass' : 'not-applicable',
        source_packs: packNames,
      },
      inputs,
      totals: totalInputs(inputs),
    });
  }

  const dogfoodInputs = manifest.dogfood.members.map(reportInput);
  const dogfoodGuidance = {
    name: 'dogfood-guidance',
    kind: manifest.dogfood.kind,
    activation_assumption: manifest.dogfood.activation_assumption,
    definition_sha256: definitionHash('dogfood-guidance', manifest.dogfood),
    accepted: true,
    prerequisites: {
      enabled_pack_source_installed: 'pass',
      core_source_generated: 'not-applicable',
      source_packs: [],
    },
    inputs: dogfoodInputs,
    totals: totalInputs(dogfoodInputs),
  };
  const aggregateInputs = profiles.flatMap((profile) => profile.inputs);

  const report = {
    schema_version: AUDIT_SCHEMA_VERSION,
    metric: METRIC_KIND,
    claim_limits: {
      describes: CLAIM_DESCRIPTION,
      does_not_measure: [...CLAIM_EXCLUSIONS],
    },
    profile_manifest: {
      path: manifest.path,
      sha256: manifest.sha256,
      core_source_root: manifest.parity.core_source_root,
      core_generated_root: manifest.parity.core_generated_root,
      pack_catalog_root: manifest.parity.pack_catalog_root,
      install_profile: manifest.parity.install_profile,
    },
    profile_order: manifest.profileOrder,
    prerequisites: {
      status: 'pass',
      core_source_generated: coreParity,
      enabled_pack_source_installed: enabledPackParity.report,
      profile_source_packs: sourcePacks,
    },
    tokenizer: tokenizer.identity,
    profiles,
    aggregate: totalInputs(aggregateInputs),
    dogfood_guidance: dogfoodGuidance,
  };
  validateAuditReport(report, 'generated report');
  verifyObservations(context);
  return report;
}

/** @param {unknown} value @param {string} label @param {string} code @returns {number} */
function requireCount(value, label, code) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(code, `${label} must be a non-negative safe integer`);
  }
  return value;
}

/** @param {Record<string, any>} value @param {string} label @param {'available'|'unavailable'} tokenStatus @param {string} code */
function validateTotals(value, label, tokenStatus, code) {
  requireExactKeys(value, TOTAL_KEYS, label, code);
  requireCount(value.input_count, `${label}.input_count`, code);
  requireCount(value.code_points, `${label}.code_points`, code);
  requireCount(value.utf8_bytes, `${label}.utf8_bytes`, code);
  if (tokenStatus === 'available') requireCount(value.tokens, `${label}.tokens`, code);
  else if (value.tokens !== null) fail(code, `${label}.tokens must be null when tokenizer results are unavailable`);
}

/** @param {unknown} value @param {string} label @param {string} code @returns {TokenizerIdentity} */
function validateTokenizer(value, label, code) {
  const tokenizer = requireObject(value, label, code);
  if (tokenizer.status === 'unavailable') {
    requireExactKeys(tokenizer, ['reason', 'status'], label, code);
    requireNonEmptyString(tokenizer.reason, `${label}.reason`, code);
    return /** @type {TokenizerIdentity} */ (tokenizer);
  }
  if (tokenizer.status !== 'available') fail(code, `${label}.status must be available or unavailable`);
  requireExactKeys(
    tokenizer,
    ['encoding', 'identity_sha256', 'name', 'results_sha256', 'status', 'version'],
    label,
    code,
  );
  requireSha256(tokenizer.results_sha256, `${label}.results_sha256`, code);
  requireSha256(tokenizer.identity_sha256, `${label}.identity_sha256`, code);
  const name = requireNonEmptyString(tokenizer.name, `${label}.name`, code);
  const version = requireNonEmptyString(tokenizer.version, `${label}.version`, code);
  const encoding = requireNonEmptyString(tokenizer.encoding, `${label}.encoding`, code);
  if (tokenizer.identity_sha256 !== sha256(JSON.stringify({ name, version, encoding }))) {
    fail(code, `${label}.identity_sha256 does not match name/version/encoding`);
  }
  return /** @type {TokenizerIdentity} */ (tokenizer);
}

/**
 * @param {Record<string, any>} prerequisites
 * @param {string} label
 * @param {string} code
 * @param {{ core_source_root: string, core_generated_root: string, pack_catalog_root: string, install_profile: string }} parity
 */
function validateTopPrerequisites(prerequisites, label, code, parity) {
  requireExactKeys(
    prerequisites,
    ['core_source_generated', 'enabled_pack_source_installed', 'profile_source_packs', 'status'],
    label,
    code,
  );
  if (prerequisites.status !== 'pass') fail(code, `${label}.status must be pass`);

  const core = requireObject(prerequisites.core_source_generated, `${label}.core_source_generated`, code);
  requireExactKeys(core, ['checks', 'status'], `${label}.core_source_generated`, code);
  if (!Array.isArray(core.checks)
    || (core.status === 'pass' && core.checks.length === 0)
    || (core.status === 'not-applicable' && core.checks.length !== 0)
    || !['pass', 'not-applicable'].includes(core.status)) {
    fail(code, `${label}.core_source_generated status must agree with check applicability`);
  }
  const coreCheckMap = new Map();
  const coreGenerated = new Set();
  let previousSource = null;
  for (let index = 0; index < core.checks.length; index += 1) {
    const check = requireObject(core.checks[index], `${label}.core_source_generated.checks[${index}]`, code);
    requireExactKeys(check, ['generated', 'sha256', 'source'], `${label}.core_source_generated.checks[${index}]`, code);
    const source = validateRelativePath(check.source, `${label}.core_source_generated.checks[${index}].source`, code);
    const generated = validateRelativePath(check.generated, `${label}.core_source_generated.checks[${index}].generated`, code);
    requireSha256(check.sha256, `${label}.core_source_generated.checks[${index}].sha256`, code);
    if (previousSource !== null && lexicalCompare(previousSource, source) >= 0) {
      fail(code, `${label}.core_source_generated.checks must be lexically source-sorted and unique`);
    }
    if (coreCheckMap.has(source) || coreGenerated.has(generated)) {
      fail(code, `${label}.core_source_generated.checks repeat a path`);
    }
    previousSource = source;
    coreCheckMap.set(source, check);
    coreGenerated.add(generated);
  }

  const enabled = requireObject(
    prerequisites.enabled_pack_source_installed,
    `${label}.enabled_pack_source_installed`,
    code,
  );
  requireExactKeys(
    enabled,
    ['enabled_packs', 'packs', 'profile_path', 'profile_sha256', 'status'],
    `${label}.enabled_pack_source_installed`,
    code,
  );
  if (enabled.status !== 'pass') fail(code, `${label}.enabled_pack_source_installed.status must be pass`);
  validateRelativePath(enabled.profile_path, `${label}.enabled_pack_source_installed.profile_path`, code);
  if (enabled.profile_path !== parity.install_profile) {
    fail(code, `${label}.enabled_pack_source_installed.profile_path does not match the declared install profile`);
  }
  requireSha256(enabled.profile_sha256, `${label}.enabled_pack_source_installed.profile_sha256`, code);
  const enabledPacks = requireSortedUniqueStrings(
    enabled.enabled_packs,
    `${label}.enabled_pack_source_installed.enabled_packs`,
    code,
  );
  requireNoEnabledPackPrefixCollisions(enabledPacks, code);
  if (!Array.isArray(enabled.packs) || enabled.packs.length !== enabledPacks.length) {
    fail(code, `${label}.enabled_pack_source_installed.packs must match enabled_packs`);
  }
  const enabledPackMap = new Map();
  for (let index = 0; index < enabled.packs.length; index += 1) {
    const pack = requireObject(enabled.packs[index], `${label}.enabled_pack_source_installed.packs[${index}]`, code);
    requireExactKeys(
      pack,
      ['artifact_count', 'installed_status', 'inventory_digest', 'manifest_sha256', 'name', 'source_identity', 'source_status'],
      `${label}.enabled_pack_source_installed.packs[${index}]`,
      code,
    );
    if (pack.name !== enabledPacks[index] || !NAME_RE.test(pack.name)) {
      fail(code, `${label}.enabled_pack_source_installed.packs must follow enabled_packs order`);
    }
    const sourceIdentity = requireObject(
      pack.source_identity,
      `${label}.enabled_pack_source_installed.packs[${index}].source_identity`,
      code,
    );
    requireExactKeys(
      sourceIdentity,
      ['location', 'ref', 'type'],
      `${label}.enabled_pack_source_installed.packs[${index}].source_identity`,
      code,
    );
    if (!['library', 'source'].includes(sourceIdentity.type)
      || typeof sourceIdentity.location !== 'string'
      || !sourceIdentity.location
      || typeof sourceIdentity.ref !== 'string') {
      fail(code, `${label}.enabled_pack_source_installed.packs[${index}].source_identity is invalid`);
    }
    requireSha256(pack.inventory_digest, `${label}.enabled_pack_source_installed.packs[${index}].inventory_digest`, code);
    requireSha256(pack.manifest_sha256, `${label}.enabled_pack_source_installed.packs[${index}].manifest_sha256`, code);
    requireCount(pack.artifact_count, `${label}.enabled_pack_source_installed.packs[${index}].artifact_count`, code);
    if (pack.artifact_count === 0 || pack.source_status !== 'pass' || pack.installed_status !== 'pass') {
      fail(code, `${label}.enabled_pack_source_installed.packs[${index}] must have artifacts and passing statuses`);
    }
    enabledPackMap.set(pack.name, pack);
  }

  if (!Array.isArray(prerequisites.profile_source_packs)) {
    fail(code, `${label}.profile_source_packs must be an array`);
  }
  const profileSourcePackMap = new Map();
  let previousPack = null;
  for (let index = 0; index < prerequisites.profile_source_packs.length; index += 1) {
    const pack = requireObject(prerequisites.profile_source_packs[index], `${label}.profile_source_packs[${index}]`, code);
    requireExactKeys(
      pack,
      ['artifact_count', 'installed_parity', 'manifest_sha256', 'name', 'source_status'],
      `${label}.profile_source_packs[${index}]`,
      code,
    );
    if (!NAME_RE.test(pack.name)
      || (previousPack !== null && lexicalCompare(previousPack, pack.name) >= 0)) {
      fail(code, `${label}.profile_source_packs must be lexically name-sorted and unique`);
    }
    previousPack = pack.name;
    requireSha256(pack.manifest_sha256, `${label}.profile_source_packs[${index}].manifest_sha256`, code);
    requireCount(pack.artifact_count, `${label}.profile_source_packs[${index}].artifact_count`, code);
    const enabledPack = enabledPackMap.get(pack.name);
    const expectedInstalled = enabledPack ? enabledPack.installed_status : 'not-applicable';
    if (pack.artifact_count === 0
      || pack.source_status !== 'pass'
      || pack.installed_parity !== expectedInstalled) {
      fail(code, `${label}.profile_source_packs[${index}] has inconsistent status details`);
    }
    if (enabledPack
      && (pack.source_status !== enabledPack.source_status
        || pack.manifest_sha256 !== enabledPack.manifest_sha256
        || pack.artifact_count !== enabledPack.artifact_count)) {
      fail(code, `${label}.profile_source_packs[${index}] contradicts enabled-pack evidence`);
    }
    profileSourcePackMap.set(pack.name, pack);
  }
  return { core, coreCheckMap, profileSourcePackMap, parity };
}

/**
 * @param {Record<string, any>} record
 * @param {string} label
 * @param {'available'|'unavailable'} tokenStatus
 * @param {{ core: Record<string, any>, coreCheckMap: Map<string, Record<string, any>>, profileSourcePackMap: Map<string, Record<string, any>>, parity: { core_source_root: string, core_generated_root: string, pack_catalog_root: string, install_profile: string } }} prerequisiteContext
 * @param {string} code
 * @param {boolean} dogfood
 */
function validateRecord(record, label, tokenStatus, prerequisiteContext, code, dogfood) {
  requireExactKeys(record, RECORD_KEYS, label, code);
  const name = requireNonEmptyString(record.name, `${label}.name`, code);
  if (dogfood) {
    if (name !== 'dogfood-guidance' || record.kind !== 'dogfood-guidance') {
      fail(code, `${label} must be the dogfood-guidance record`);
    }
  } else if (!NAME_RE.test(name) || record.kind !== 'release-source') {
    fail(code, `${label} has an invalid release profile identity`);
  }
  const activation = requireNonEmptyString(record.activation_assumption, `${label}.activation_assumption`, code);
  requireSha256(record.definition_sha256, `${label}.definition_sha256`, code);
  if (record.accepted !== true) fail(code, `${label}.accepted must be true`);
  if (!Array.isArray(record.inputs) || record.inputs.length === 0) {
    fail(code, `${label}.inputs must be a non-empty array`);
  }
  const paths = [];
  const pathSet = new Set();
  for (let index = 0; index < record.inputs.length; index += 1) {
    const input = requireObject(record.inputs[index], `${label}.inputs[${index}]`, code);
    requireExactKeys(input, INPUT_KEYS, `${label}.inputs[${index}]`, code);
    const inputPath = validateRelativePath(input.path, `${label}.inputs[${index}].path`, code);
    if (pathSet.has(inputPath)) fail(code, `${label}.inputs repeat '${inputPath}'`);
    pathSet.add(inputPath);
    paths.push(inputPath);
    requireSha256(input.sha256, `${label}.inputs[${index}].sha256`, code);
    requireCount(input.code_points, `${label}.inputs[${index}].code_points`, code);
    requireCount(input.utf8_bytes, `${label}.inputs[${index}].utf8_bytes`, code);
    if (tokenStatus === 'available') requireCount(input.tokens, `${label}.inputs[${index}].tokens`, code);
    else if (input.tokens !== null) {
      fail(code, `${label}.inputs[${index}].tokens must be null when tokenizer results are unavailable`);
    }
  }
  if (record.definition_sha256 !== definitionHash(name, {
    kind: record.kind,
    activation_assumption: activation,
    members: paths,
  })) {
    fail(code, `${label}.definition_sha256 does not match its ordered definition`);
  }

  const prerequisites = requireObject(record.prerequisites, `${label}.prerequisites`, code);
  requireExactKeys(
    prerequisites,
    ['core_source_generated', 'enabled_pack_source_installed', 'source_packs'],
    `${label}.prerequisites`,
    code,
  );
  if (prerequisites.enabled_pack_source_installed !== 'pass') {
    fail(code, `${label}.prerequisites.enabled_pack_source_installed must be pass`);
  }
  const coreInputs = dogfood
    ? []
    : record.inputs.filter((input) => generatedPathForCoreInput(input.path, prerequisiteContext.parity) !== null);
  const expectedSourcePacks = dogfood
    ? []
    : [...new Set(paths
      .map((inputPath) => sourcePackNameForInput(inputPath, prerequisiteContext.parity))
      .filter((name) => name !== null))]
      .sort(lexicalCompare);
  if (!dogfood && coreInputs.length + paths.filter((inputPath) =>
    sourcePackNameForInput(inputPath, prerequisiteContext.parity) !== null).length
    !== paths.length) {
    fail(code, `${label}.inputs contain a path outside declared release/source roots`);
  }
  const hasCoreInput = coreInputs.length > 0;
  const expectedCoreStatus = hasCoreInput ? 'pass' : 'not-applicable';
  if (prerequisites.core_source_generated !== expectedCoreStatus) {
    fail(code, `${label}.prerequisites.core_source_generated is inconsistent with its inputs`);
  }
  if (!Array.isArray(prerequisites.source_packs)) {
    fail(code, `${label}.prerequisites.source_packs must be an array`);
  }
  const actualSourcePacks = [];
  let previousPack = null;
  for (let index = 0; index < prerequisites.source_packs.length; index += 1) {
    const sourcePack = requireObject(prerequisites.source_packs[index], `${label}.prerequisites.source_packs[${index}]`, code);
    requireExactKeys(sourcePack, ['installed', 'name', 'source'], `${label}.prerequisites.source_packs[${index}]`, code);
    if (!NAME_RE.test(sourcePack.name)
      || (previousPack !== null && lexicalCompare(previousPack, sourcePack.name) >= 0)) {
      fail(code, `${label}.prerequisites.source_packs must be lexically name-sorted and unique`);
    }
    previousPack = sourcePack.name;
    actualSourcePacks.push(sourcePack.name);
    const topPack = prerequisiteContext.profileSourcePackMap.get(sourcePack.name);
    if (!topPack
      || sourcePack.source !== topPack.source_status
      || sourcePack.installed !== topPack.installed_parity) {
      fail(code, `${label}.prerequisites.source_packs[${index}] is inconsistent with top-level prerequisites`);
    }
  }
  if (JSON.stringify(actualSourcePacks) !== JSON.stringify(expectedSourcePacks)) {
    fail(code, `${label}.prerequisites.source_packs do not match its inputs`);
  }
  if (dogfood && prerequisites.source_packs.length !== 0) {
    fail(code, `${label}.prerequisites.source_packs must be empty`);
  }

  for (const input of coreInputs) {
    const check = prerequisiteContext.coreCheckMap.get(input.path);
    const expectedGenerated = generatedPathForCoreInput(input.path, prerequisiteContext.parity);
    if (!check
      || check.generated !== expectedGenerated
      || check.sha256 !== input.sha256) {
      fail(code, `${label} core prerequisite evidence does not match '${input.path}'`);
    }
  }

  const totals = requireObject(record.totals, `${label}.totals`, code);
  validateTotals(totals, `${label}.totals`, tokenStatus, code);
  if (JSON.stringify(totals) !== JSON.stringify(totalInputs(record.inputs))) {
    fail(code, `${label}.totals do not equal the exact input sums`);
  }
  return { coreInputs, sourcePackNames: expectedSourcePacks };
}

/** @param {unknown} value @param {string} label */
function validateAuditReport(value, label) {
  const code = 'E_COMPARE_REPORT';
  const report = requireObject(value, label, code);
  requireExactKeys(report, REPORT_KEYS, label, code);
  if (report.schema_version !== AUDIT_SCHEMA_VERSION || report.metric !== METRIC_KIND) {
    fail(code, `${label} is not a compatible prompt audit report`);
  }
  const claims = requireObject(report.claim_limits, `${label}.claim_limits`, code);
  requireExactKeys(claims, ['describes', 'does_not_measure'], `${label}.claim_limits`, code);
  if (claims.describes !== CLAIM_DESCRIPTION
    || JSON.stringify(claims.does_not_measure) !== JSON.stringify(CLAIM_EXCLUSIONS)) {
    fail(code, `${label}.claim_limits do not match the fixed claim boundary`);
  }
  const profileManifest = requireObject(report.profile_manifest, `${label}.profile_manifest`, code);
  requireExactKeys(profileManifest, REPORT_PROFILE_MANIFEST_KEYS, `${label}.profile_manifest`, code);
  validateRelativePath(profileManifest.path, `${label}.profile_manifest.path`, code);
  requireSha256(profileManifest.sha256, `${label}.profile_manifest.sha256`, code);
  const parity = {
    core_source_root: validateRelativePath(
      profileManifest.core_source_root,
      `${label}.profile_manifest.core_source_root`,
      code,
    ),
    core_generated_root: validateRelativePath(
      profileManifest.core_generated_root,
      `${label}.profile_manifest.core_generated_root`,
      code,
    ),
    pack_catalog_root: validateRelativePath(
      profileManifest.pack_catalog_root,
      `${label}.profile_manifest.pack_catalog_root`,
      code,
    ),
    install_profile: validateRelativePath(
      profileManifest.install_profile,
      `${label}.profile_manifest.install_profile`,
      code,
    ),
  };
  requireDistinctCoreRoots(parity, `${label}.profile_manifest`, code);
  const tokenizer = validateTokenizer(report.tokenizer, `${label}.tokenizer`, code);
  const tokenStatus = tokenizer.status;

  if (!Array.isArray(report.profile_order) || report.profile_order.length === 0) {
    fail(code, `${label}.profile_order must be a non-empty array`);
  }
  const profileOrder = report.profile_order.map((name, index) => {
    const profileName = requireNonEmptyString(name, `${label}.profile_order[${index}]`, code);
    if (!NAME_RE.test(profileName)) fail(code, `${label}.profile_order contains an invalid name`);
    return profileName;
  });
  if (new Set(profileOrder).size !== profileOrder.length) fail(code, `${label}.profile_order contains duplicates`);
  if (!Array.isArray(report.profiles) || report.profiles.length !== profileOrder.length) {
    fail(code, `${label}.profiles must exactly match profile_order`);
  }

  const prerequisites = requireObject(report.prerequisites, `${label}.prerequisites`, code);
  const prerequisiteContext = validateTopPrerequisites(
    prerequisites,
    `${label}.prerequisites`,
    code,
    parity,
  );
  const expectedCoreInputs = new Map();
  const expectedSourcePackNames = new Set();
  for (let index = 0; index < report.profiles.length; index += 1) {
    const profile = requireObject(report.profiles[index], `${label}.profiles[${index}]`, code);
    const expected = validateRecord(
      profile,
      `${label}.profiles[${index}]`,
      tokenStatus,
      prerequisiteContext,
      code,
      false,
    );
    if (profile.name !== profileOrder[index]) fail(code, `${label}.profiles must follow profile_order exactly`);
    for (const input of expected.coreInputs) {
      const previousHash = expectedCoreInputs.get(input.path);
      if (previousHash && previousHash !== input.sha256) {
        fail(code, `${label} reports inconsistent core input hashes for '${input.path}'`);
      }
      expectedCoreInputs.set(input.path, input.sha256);
    }
    for (const packName of expected.sourcePackNames) expectedSourcePackNames.add(packName);
  }
  const dogfood = requireObject(report.dogfood_guidance, `${label}.dogfood_guidance`, code);
  validateRecord(dogfood, `${label}.dogfood_guidance`, tokenStatus, prerequisiteContext, code, true);

  const expectedCoreSources = [...expectedCoreInputs.keys()].sort(lexicalCompare);
  const actualCoreSources = [...prerequisiteContext.coreCheckMap.keys()];
  const expectedCoreStatus = expectedCoreSources.length > 0 ? 'pass' : 'not-applicable';
  if (prerequisiteContext.core.status !== expectedCoreStatus
    || JSON.stringify(actualCoreSources) !== JSON.stringify(expectedCoreSources)) {
    fail(code, `${label}.prerequisites.core_source_generated does not exactly cover core profile inputs`);
  }
  for (const source of expectedCoreSources) {
    const check = prerequisiteContext.coreCheckMap.get(source);
    if (!check
      || check.generated !== generatedPathForCoreInput(source, parity)
      || check.sha256 !== expectedCoreInputs.get(source)) {
      fail(code, `${label}.prerequisites.core_source_generated has mismatched evidence for '${source}'`);
    }
  }
  const expectedPackNames = [...expectedSourcePackNames].sort(lexicalCompare);
  const actualPackNames = [...prerequisiteContext.profileSourcePackMap.keys()];
  if (JSON.stringify(actualPackNames) !== JSON.stringify(expectedPackNames)) {
    fail(code, `${label}.prerequisites.profile_source_packs do not exactly cover profile inputs`);
  }

  const repeatedPaths = new Map();
  const repeatedHashes = new Map();
  for (const record of [...report.profiles, dogfood]) {
    for (const input of record.inputs) {
      const observation = JSON.stringify({
        sha256: input.sha256,
        code_points: input.code_points,
        utf8_bytes: input.utf8_bytes,
        tokens: input.tokens,
      });
      const pathObservation = repeatedPaths.get(input.path);
      if (pathObservation && pathObservation !== observation) {
        fail(code, `${label} reports inconsistent repeated observations for '${input.path}'`);
      }
      repeatedPaths.set(input.path, observation);
      const counts = JSON.stringify({
        code_points: input.code_points,
        utf8_bytes: input.utf8_bytes,
        tokens: input.tokens,
      });
      const hashObservation = repeatedHashes.get(input.sha256);
      if (hashObservation && hashObservation !== counts) {
        fail(code, `${label} reports inconsistent counts for identical content hashes`);
      }
      repeatedHashes.set(input.sha256, counts);
    }
  }

  const aggregate = requireObject(report.aggregate, `${label}.aggregate`, code);
  validateTotals(aggregate, `${label}.aggregate`, tokenStatus, code);
  if (JSON.stringify(aggregate) !== JSON.stringify(totalInputs(report.profiles.flatMap((profile) => profile.inputs)))) {
    fail(code, `${label}.aggregate does not equal the exact release/source sums`);
  }
  return report;
}

/** @param {unknown} value @param {string} label */
function validateAuditEnvelope(value, label) {
  const envelope = requireObject(value, label, 'E_COMPARE_REPORT');
  requireExactKeys(envelope, ['command', 'ok', 'report'], label, 'E_COMPARE_REPORT');
  if (envelope.ok !== true || envelope.command !== 'audit') {
    fail('E_COMPARE_REPORT', `${label} must be a successful audit envelope`);
  }
  return validateAuditReport(envelope.report, `${label}.report`);
}

/** @param {Record<string, any>} baseline @param {Record<string, any>} current @param {string} label */
function compareProfileIdentity(baseline, current, label) {
  const baselineMembers = baseline.inputs.map((input) => input.path);
  const currentMembers = current.inputs.map((input) => input.path);
  if (JSON.stringify(baselineMembers) !== JSON.stringify(currentMembers)) {
    fail('E_COMPARE_MEMBERSHIP', `${label} member order or membership changed`);
  }
  if (baseline.kind !== current.kind
    || baseline.activation_assumption !== current.activation_assumption
    || baseline.definition_sha256 !== current.definition_sha256) {
    fail('E_COMPARE_DEFINITION', `${label} profile definition changed`);
  }
}

/**
 * @param {Record<string, any>} baseline
 * @param {Record<string, any>} current
 * @param {Record<string, any>[]} baselineProfiles
 * @param {Record<string, any>[]} currentProfiles
 * @param {{ pack_catalog_root: string }} parity
 */
function comparePrerequisiteEvidence(baseline, current, baselineProfiles, currentProfiles, parity) {
  const prerequisiteFailure = () => fail(
    'E_COMPARE_PREREQUISITES',
    'prerequisite evidence changed without a verifiable counted-input linkage',
  );
  if (baseline.status !== current.status) prerequisiteFailure();
  const baselineCore = baseline.core_source_generated;
  const currentCore = current.core_source_generated;
  if (baselineCore.status !== currentCore.status
    || baselineCore.checks.length !== currentCore.checks.length
    || baselineCore.checks.some((check, index) =>
      check.source !== currentCore.checks[index].source
      || check.generated !== currentCore.checks[index].generated)) {
    fail('E_COMPARE_PREREQUISITES', 'core prerequisite membership or generated paths changed');
  }

  /** @type {Map<string, boolean>} */
  const packInputChanges = new Map();
  for (let profileIndex = 0; profileIndex < baselineProfiles.length; profileIndex += 1) {
    const baselineInputs = baselineProfiles[profileIndex].inputs;
    const currentInputs = currentProfiles[profileIndex].inputs;
    for (let inputIndex = 0; inputIndex < baselineInputs.length; inputIndex += 1) {
      const baselineInput = baselineInputs[inputIndex];
      const packName = sourcePackNameForInput(baselineInput.path, parity);
      if (packName && baselineInput.sha256 !== currentInputs[inputIndex].sha256) {
        packInputChanges.set(packName, true);
      }
    }
  }

  const baselineEnabled = baseline.enabled_pack_source_installed;
  const currentEnabled = current.enabled_pack_source_installed;
  if (baselineEnabled.status !== currentEnabled.status
    || baselineEnabled.profile_path !== currentEnabled.profile_path
    || JSON.stringify(baselineEnabled.enabled_packs) !== JSON.stringify(currentEnabled.enabled_packs)
    || baselineEnabled.packs.length !== currentEnabled.packs.length) {
    prerequisiteFailure();
  }

  const baselineSourcePacks = new Map(
    baseline.profile_source_packs.map((pack) => [pack.name, pack]),
  );
  const currentSourcePacks = new Map(
    current.profile_source_packs.map((pack) => [pack.name, pack]),
  );
  if (JSON.stringify([...baselineSourcePacks.keys()]) !== JSON.stringify([...currentSourcePacks.keys()])) {
    prerequisiteFailure();
  }

  let linkedEnabledEvidenceChanged = false;
  for (let index = 0; index < baselineEnabled.packs.length; index += 1) {
    const baselinePack = baselineEnabled.packs[index];
    const currentPack = currentEnabled.packs[index];
    const baselineSourcePack = baselineSourcePacks.get(baselinePack.name);
    const currentSourcePack = currentSourcePacks.get(currentPack.name);
    const linkedInputChanged = baselineSourcePack !== undefined
      && currentSourcePack !== undefined
      && packInputChanges.get(baselinePack.name) === true;
    if (baselinePack.name !== currentPack.name
      || JSON.stringify(baselinePack.source_identity) !== JSON.stringify(currentPack.source_identity)
      || baselinePack.artifact_count !== currentPack.artifact_count
      || baselinePack.source_status !== currentPack.source_status
      || baselinePack.installed_status !== currentPack.installed_status) {
      prerequisiteFailure();
    }
    const inventoryChanged = baselinePack.inventory_digest !== currentPack.inventory_digest;
    const manifestChanged = baselinePack.manifest_sha256 !== currentPack.manifest_sha256;
    if (manifestChanged && !inventoryChanged) prerequisiteFailure();
    const mutableEvidenceChanged = inventoryChanged;
    if (mutableEvidenceChanged && !linkedInputChanged) prerequisiteFailure();
    if (linkedInputChanged && !inventoryChanged) prerequisiteFailure();
    if (mutableEvidenceChanged) linkedEnabledEvidenceChanged = true;
  }

  const profileHashChanged = baselineEnabled.profile_sha256 !== currentEnabled.profile_sha256;
  if (profileHashChanged !== linkedEnabledEvidenceChanged) {
    prerequisiteFailure();
  }

  for (const [packName, baselinePack] of baselineSourcePacks) {
    const currentPack = currentSourcePacks.get(packName);
    if (!currentPack
      || baselinePack.name !== currentPack.name
      || baselinePack.artifact_count !== currentPack.artifact_count
      || baselinePack.source_status !== currentPack.source_status
      || baselinePack.installed_parity !== currentPack.installed_parity) {
      prerequisiteFailure();
    }
    const linkedInputChanged = packInputChanges.get(packName) === true;
    const manifestChanged = baselinePack.manifest_sha256 !== currentPack.manifest_sha256;
    if ((manifestChanged && !linkedInputChanged)
      || (baselinePack.installed_parity === 'not-applicable' && linkedInputChanged && !manifestChanged)) {
      prerequisiteFailure();
    }
  }
}

/** @param {Record<string, any>} baseline @param {Record<string, any>} current */
function profileDelta(baseline, current) {
  return {
    name: baseline.name,
    before: baseline.totals,
    current: current.totals,
    delta: {
      code_points: current.totals.code_points - baseline.totals.code_points,
      utf8_bytes: current.totals.utf8_bytes - baseline.totals.utf8_bytes,
      tokens: baseline.totals.tokens === null || current.totals.tokens === null
        ? null
        : current.totals.tokens - baseline.totals.tokens,
    },
    changed_inputs: baseline.inputs
      .filter((input, index) => input.sha256 !== current.inputs[index].sha256)
      .map((input) => input.path),
  };
}

/**
 * Compare two complete successful audit envelopes.
 * @param {unknown} baselineValue
 * @param {unknown} currentValue
 */
export function compareAudits(baselineValue, currentValue) {
  const baseline = validateAuditEnvelope(baselineValue, 'baseline');
  const current = validateAuditEnvelope(currentValue, 'current');
  const parityFields = [
    'core_source_root',
    'core_generated_root',
    'pack_catalog_root',
    'install_profile',
  ];
  if (parityFields.some((field) => baseline.profile_manifest[field] !== current.profile_manifest[field])) {
    fail('E_COMPARE_PREREQUISITES', 'declared parity roots or install profile changed');
  }
  if (baseline.profile_manifest.path !== current.profile_manifest.path
    || baseline.profile_manifest.sha256 !== current.profile_manifest.sha256) {
    fail('E_COMPARE_PROFILE_HASH', 'profile manifest identity changed');
  }
  if (JSON.stringify(baseline.profile_order) !== JSON.stringify(current.profile_order)) {
    fail('E_COMPARE_PROFILE_ORDER', 'profile order changed');
  }
  for (let index = 0; index < baseline.profiles.length; index += 1) {
    compareProfileIdentity(baseline.profiles[index], current.profiles[index], baseline.profile_order[index]);
  }
  compareProfileIdentity(baseline.dogfood_guidance, current.dogfood_guidance, 'dogfood-guidance');
  comparePrerequisiteEvidence(
    baseline.prerequisites,
    current.prerequisites,
    baseline.profiles,
    current.profiles,
    baseline.profile_manifest,
  );
  if (baseline.tokenizer.status !== current.tokenizer.status) {
    fail('E_COMPARE_TOKENIZER', 'tokenizer availability changed');
  }
  if (baseline.tokenizer.status === 'available') {
    const identityFields = ['identity_sha256', 'name', 'version', 'encoding'];
    if (identityFields.some((field) => baseline.tokenizer[field] !== current.tokenizer[field])) {
      fail('E_COMPARE_TOKENIZER', 'tokenizer identity changed');
    }
  }
  for (let index = 0; index < baseline.profiles.length; index += 1) {
    if (JSON.stringify(baseline.profiles[index].prerequisites)
      !== JSON.stringify(current.profiles[index].prerequisites)) {
      fail('E_COMPARE_PREREQUISITES', `prerequisite applicability changed for '${baseline.profile_order[index]}'`);
    }
  }
  if (JSON.stringify(baseline.dogfood_guidance.prerequisites)
    !== JSON.stringify(current.dogfood_guidance.prerequisites)) {
    fail('E_COMPARE_PREREQUISITES', 'dogfood prerequisite applicability changed');
  }

  for (const [beforeProfile, currentProfile] of [
    ...baseline.profiles.map((profile, index) => [profile, current.profiles[index]]),
    [baseline.dogfood_guidance, current.dogfood_guidance],
  ]) {
    for (let inputIndex = 0; inputIndex < beforeProfile.inputs.length; inputIndex += 1) {
      const beforeInput = beforeProfile.inputs[inputIndex];
      const currentInput = currentProfile.inputs[inputIndex];
      if (beforeInput.sha256 === currentInput.sha256
        && (beforeInput.code_points !== currentInput.code_points
          || beforeInput.utf8_bytes !== currentInput.utf8_bytes
          || beforeInput.tokens !== currentInput.tokens)) {
        fail('E_COMPARE_COUNT_DRIFT', `unchanged input counts drifted in '${beforeProfile.name}'`);
      }
    }
  }

  return {
    schema_version: AUDIT_SCHEMA_VERSION,
    metric: METRIC_KIND,
    comparable: true,
    profile_manifest_sha256: baseline.profile_manifest.sha256,
    tokenizer: baseline.tokenizer,
    profiles: baseline.profiles.map((profile, index) => profileDelta(profile, current.profiles[index])),
    aggregate: {
      before: baseline.aggregate,
      current: current.aggregate,
      delta: {
        code_points: current.aggregate.code_points - baseline.aggregate.code_points,
        utf8_bytes: current.aggregate.utf8_bytes - baseline.aggregate.utf8_bytes,
        tokens: baseline.aggregate.tokens === null || current.aggregate.tokens === null
          ? null
          : current.aggregate.tokens - baseline.aggregate.tokens,
      },
    },
    dogfood_guidance: profileDelta(baseline.dogfood_guidance, current.dogfood_guidance),
  };
}

/** @param {string} absolutePath @param {string} label */
function readComparisonJson(absolutePath, label) {
  const requestedPath = path.resolve(absolutePath);
  const context = createReadContext(path.dirname(requestedPath));
  const canonicalPath = path.join(context.root, path.basename(requestedPath));
  const observed = readStableFileAt(context, canonicalPath, label);
  let value;
  try {
    value = JSON.parse(decodeUtf8(observed.buffer, label));
  } catch (error) {
    if (error instanceof PromptAuditError) throw error;
    fail('E_COMPARE_JSON', `${label} is not valid JSON`);
  }
  verifyObservations(context);
  return value;
}

/** @param {string[]} argv */
export function parseCliArgs(argv) {
  /** @type {Record<string, any>} */
  const args = { json: false };
  const positionals = [];
  const valueFlags = new Map([
    ['--root', 'root'],
    ['--profiles', 'profiles'],
    ['--baseline', 'baseline'],
    ['--current', 'current'],
    ['--tokenizer-results', 'tokenizerResults'],
    ['--tokenizer-results-sha256', 'tokenizerResultsSha256'],
  ]);
  const supplied = new Set();
  const record = (name) => {
    if (supplied.has(name)) fail('E_USAGE', `duplicate option: ${name}`);
    supplied.add(name);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      record('--json');
      args.json = true;
    } else if (argument === '--help' || argument === '-h') {
      record('--help');
      args.help = true;
    }
    else if (valueFlags.has(argument)) {
      const value = argv[index + 1];
      record(argument);
      if (!value || value.startsWith('-')) fail('E_USAGE', `${argument} requires a value`);
      args[valueFlags.get(argument)] = value;
      index += 1;
    } else if (argument.startsWith('-')) {
      fail('E_USAGE', `unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  if (positionals.length > 1) fail('E_USAGE', 'exactly one command is allowed');
  args.command = positionals[0];
  if (args.help) {
    if (supplied.size !== 1) fail('E_USAGE', 'help does not accept command options');
    if (args.command && !['audit', 'compare'].includes(args.command)) {
      fail('E_USAGE', `unknown command: ${args.command}`);
    }
    return args;
  }
  if (!args.command) fail('E_USAGE', 'a command is required');
  if (!['audit', 'compare'].includes(args.command)) fail('E_USAGE', `unknown command: ${args.command}`);
  const allowed = args.command === 'audit'
    ? new Set(['--root', '--profiles', '--tokenizer-results', '--tokenizer-results-sha256', '--json'])
    : new Set(['--baseline', '--current', '--json']);
  for (const option of supplied) {
    if (!allowed.has(option)) fail('E_USAGE', `${option} is not valid for ${args.command}`);
  }
  const hasResults = supplied.has('--tokenizer-results');
  const hasResultsSha = supplied.has('--tokenizer-results-sha256');
  if (hasResults !== hasResultsSha) {
    fail('E_USAGE', '--tokenizer-results and --tokenizer-results-sha256 are required together');
  }
  return args;
}

const HELP = `usage:
  node prompt-audit.mjs audit --profiles <profiles.json> [--root <workspace>]
    [--tokenizer-results <results.json> --tokenizer-results-sha256 <sha256>] [--json]
  node prompt-audit.mjs compare --baseline <audit.json> --current <audit.json> [--json]
`;

/**
 * @param {string[]} argv
 * @param {{ stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, defaultRoot?: string, defaultProfilesPath?: string }} [io]
 * @returns {Promise<number>}
 */
export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const wantsJson = argv.includes('--json');
  let command = null;
  try {
    const args = parseCliArgs(argv);
    command = args.command ?? null;
    if (args.help) {
      stdout.write(HELP);
      return 0;
    }
    if (args.command === 'audit') {
      const root = path.resolve(args.root ?? io.defaultRoot ?? process.cwd());
      const profilesPath = args.profiles ?? io.defaultProfilesPath;
      if (!profilesPath) fail('E_USAGE', 'audit requires --profiles <profiles.json>');
      const hasTokenizerResults = Boolean(args.tokenizerResults);
      const report = await auditProfiles({
        root,
        profilesPath: path.isAbsolute(profilesPath) ? profilesPath : path.resolve(root, profilesPath),
        ...(hasTokenizerResults
          ? {
              tokenizerResults: {
                path: path.resolve(args.tokenizerResults),
                sha256: args.tokenizerResultsSha256,
              },
            }
          : {}),
      });
      if (args.json) stdout.write(`${JSON.stringify({ ok: true, command: 'audit', report }, null, 2)}\n`);
      else {
        stdout.write(`[OK] ${report.metric}: ${report.aggregate.code_points} code points, ${report.aggregate.utf8_bytes} UTF-8 bytes\n`);
        stdout.write(`[INFO] tokenizer: ${report.tokenizer.status}\n`);
      }
      return 0;
    }
    if (args.command === 'compare') {
      if (!args.baseline || !args.current) {
        fail('E_USAGE', 'compare requires --baseline <audit.json> and --current <audit.json>');
      }
      const baseline = readComparisonJson(path.resolve(args.baseline), 'baseline audit');
      const current = readComparisonJson(path.resolve(args.current), 'current audit');
      const comparison = compareAudits(baseline, current);
      if (args.json) stdout.write(`${JSON.stringify({ ok: true, command: 'compare', comparison }, null, 2)}\n`);
      else {
        stdout.write(`[OK] comparable: ${comparison.aggregate.delta.code_points} code points, ${comparison.aggregate.delta.utf8_bytes} UTF-8 bytes\n`);
      }
      return 0;
    }
    fail('E_USAGE', `unknown command: ${args.command}`);
  } catch (error) {
    const auditError = error instanceof PromptAuditError
      ? error
      : new PromptAuditError('E_INTERNAL', 'unexpected prompt audit failure');
    const payload = {
      ok: false,
      command,
      error: {
        code: auditError.code,
        message: auditError.message,
        ...auditError.details,
      },
    };
    if (wantsJson) stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else stderr.write(`[FAIL] ${auditError.code}: ${auditError.message}\n`);
    return auditError.code === 'E_USAGE' ? 1 : 2;
  }
}

/** @param {string} metaUrl @param {string | undefined} argv1 */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli(process.argv.slice(2));
}
