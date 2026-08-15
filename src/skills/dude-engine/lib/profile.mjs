// @ts-check
/** Strict parser, bounded predecessor converter, and path validator for profile.md. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { belongsToPack } from './ownership.mjs';

export const PACK_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

const PREDECESSOR_INVENTORY_FIELDS = Object.freeze(['artifacts', 'digest', 'manifest_sha256', 'pack', 'source', 'version']);
const PREDECESSOR_SOURCE_FIELDS = Object.freeze(['location', 'ref', 'type']);
const PREDECESSOR_ARTIFACT_FIELDS = Object.freeze(['installed_sha256', 'kind', 'path', 'source', 'source_sha256']);
const PREDECESSOR_KINDS = Object.freeze(['agents', 'skills', 'instructions', 'prompts']);

/** @typedef {{ type: 'local', location: string } | { type: 'remote', repository: string, requested_ref: string, resolved_commit: string | null }} ProfileSource */
/** @typedef {{ files: string[], source: ProfileSource }} ProfileEntry */
/** @typedef {{ installed: Record<string, ProfileEntry> }} Profile */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string, unknown>} value @param {readonly string[]} fields */
function hasExactFields(value, fields) {
  const actual = Object.keys(value).sort();
  return actual.length === fields.length && actual.every((field, index) => field === [...fields].sort()[index]);
}

/** @param {unknown} value @returns {value is string} */
function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/**
 * Accept Git's full supported object identifier widths and emit the canonical
 * lowercase spelling used in profile records.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeGitObjectId(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) return null;
  return value.toLowerCase();
}

/** @param {unknown} value */
function isPredecessorTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

/** @param {string[]} values */
function requireSorted(values, label) {
  if (values.some((value, index) => index > 0 && values[index - 1].localeCompare(value) >= 0)) {
    throw new Error(`${label} must be sorted with no duplicates`);
  }
}

/** @param {Record<string, unknown>} installed */
function validatePackNames(installed) {
  const names = Object.keys(installed);
  for (const name of names) {
    if (!PACK_NAME_RE.test(name)) throw new Error(`profile.md has invalid installed pack '${name}'`);
  }
  for (const name of names) {
    for (const other of names) {
      if (name !== other && (name.startsWith(`${other}-`) || other.startsWith(`${name}-`))) {
        throw new Error(`profile.md pack names '${name}' and '${other}' collide by hyphen-prefix`);
      }
    }
  }
}

/**
 * Resolve one profile-owned artifact without accepting alternate separators,
 * traversal, nested artifact paths, another pack's namespace, or symbolic links.
 * @param {string} root
 * @param {string} relPath
 * @param {string} packName
 * @returns {string}
 */
export function resolveProfileArtifact(root, relPath, packName) {
  if (typeof relPath !== 'string'
    || !relPath
    || relPath.includes('\\')
    || path.posix.isAbsolute(relPath)
    || path.win32.isAbsolute(relPath)
    || relPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`unsafe pack profile path '${relPath}'`);
  }
  const match = /^\.github\/(agents|skills|instructions|prompts)\/([^/]+)$/.exec(relPath);
  if (!match) {
    throw new Error(`pack profile path '${relPath}' is outside approved pack installation roots`);
  }
  const [, kind, name] = match;
  if (kind === 'agents' && !name.endsWith('.agent.md')) {
    throw new Error(`pack profile path '${relPath}' is not owned by pack '${packName}'`);
  }
  if (kind === 'instructions' && (name === 'dude.instructions.md' || !name.endsWith('.instructions.md'))) {
    throw new Error(`pack profile path '${relPath}' is reserved for core or project instructions`);
  }
  if (kind === 'prompts' && !name.endsWith('.prompt.md')) {
    throw new Error(`pack profile path '${relPath}' is not a supported prompt artifact`);
  }
  if (!belongsToPack(relPath, packName)) {
    throw new Error(`pack profile path '${relPath}' is not owned by pack '${packName}' under the dude-pack-${packName}-* namespace`);
  }

  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ...relPath.split('/'));
  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`pack profile path '${relPath}' escapes the workspace root`);
  }
  let cursor = absoluteRoot;
  for (const part of relPath.split('/')) {
    cursor = path.join(cursor, part);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) {
        throw new Error(`pack profile path '${relPath}' contains symbolic link '${path.relative(absoluteRoot, cursor).split(path.sep).join('/')}'`);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return absolutePath;
}

/** @param {unknown} value @param {string} packName @returns {ProfileSource} */
function validateCanonicalSource(value, packName) {
  if (!isObject(value) || typeof value.type !== 'string') {
    throw new Error(`profile.md installed.${packName}.source must be an object`);
  }
  if (value.type === 'local') {
    if (!hasExactFields(value, ['location', 'type']) || typeof value.location !== 'string' || !value.location) {
      throw new Error(`profile.md installed.${packName}.source must be an exact local identity`);
    }
    return { type: 'local', location: value.location };
  }
  if (value.type === 'remote') {
    const resolvedCommit = value.resolved_commit === null ? null : normalizeGitObjectId(value.resolved_commit);
    if (!hasExactFields(value, ['repository', 'requested_ref', 'resolved_commit', 'type'])
      || typeof value.repository !== 'string' || !value.repository
      || typeof value.requested_ref !== 'string' || !value.requested_ref
      || (value.resolved_commit !== null && !resolvedCommit)) {
      throw new Error(`profile.md installed.${packName}.source must be an exact remote identity`);
    }
    return {
      type: 'remote',
      repository: value.repository,
      requested_ref: value.requested_ref,
      resolved_commit: resolvedCommit,
    };
  }
  throw new Error(`profile.md installed.${packName}.source has unsupported type '${value.type}'`);
}

/**
 * Validate only the canonical minimal model.
 * @param {unknown} value
 * @param {{ root?: string }} [options]
 * @returns {Profile}
 */
function validateCanonicalProfile(value, options = {}) {
  if (!isObject(value)) throw new Error('profile.md JSON must be an object');
  if (!hasExactFields(value, ['installed']) || !isObject(value.installed)) {
    throw new Error('profile.md JSON must contain only installed');
  }
  validatePackNames(value.installed);
  /** @type {Record<string, ProfileEntry>} */
  const installed = {};
  const claimedPaths = new Map();
  for (const [name, rawEntry] of Object.entries(value.installed)) {
    if (!isObject(rawEntry) || !hasExactFields(rawEntry, ['files', 'source'])) {
      throw new Error(`profile.md installed.${name} has unsupported or missing fields`);
    }
    if (!Array.isArray(rawEntry.files) || rawEntry.files.length === 0) {
      throw new Error(`profile.md installed.${name}.files must be a non-empty array`);
    }
    /** @type {string[]} */
    const files = [];
    for (const relPath of rawEntry.files) {
      if (typeof relPath !== 'string') throw new Error(`profile.md installed.${name}.files must contain only strings`);
      if (files.includes(relPath)) throw new Error(`profile.md installed.${name}.files repeats '${relPath}'`);
      try {
        if (options.root) resolveProfileArtifact(options.root, relPath, name);
        else validatePredecessorArtifactPath(relPath, name);
      } catch (error) {
        throw new Error(`profile.md installed.${name}.files: ${error instanceof Error ? error.message : String(error)}`);
      }
      const owner = claimedPaths.get(relPath);
      if (owner && owner !== name) throw new Error(`profile.md path '${relPath}' is claimed by both '${owner}' and '${name}'`);
      claimedPaths.set(relPath, name);
      files.push(relPath);
    }
    requireSorted(files, `profile.md installed.${name}.files`);
    installed[name] = { files, source: validateCanonicalSource(rawEntry.source, name) };
  }
  return { installed };
}

/** @param {unknown} relPath @param {string} packName */
function validatePredecessorArtifactPath(relPath, packName) {
  if (typeof relPath !== 'string'
    || !relPath
    || relPath.includes('\\')
    || path.posix.isAbsolute(relPath)
    || path.win32.isAbsolute(relPath)
    || relPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`profile.md installed.${packName}.inventory has unsafe artifact path '${String(relPath)}'`);
  }
  const match = /^\.github\/(agents|skills|instructions|prompts)\/([^/]+)$/.exec(relPath);
  if (!match || !PREDECESSOR_KINDS.includes(match[1])
    || (match[1] === 'agents' && !match[2].endsWith('.agent.md'))
    || (match[1] === 'instructions' && !match[2].endsWith('.instructions.md'))
    || (match[1] === 'prompts' && !match[2].endsWith('.prompt.md'))
    || !belongsToPack(relPath, packName)) {
    throw new Error(`profile.md installed.${packName}.inventory has unsafe artifact path '${String(relPath)}'`);
  }
}

/** @param {any} inventory */
function predecessorDigest(inventory) {
  const payload = {
    version: inventory.version,
    pack: inventory.pack,
    source: { type: inventory.source.type, location: inventory.source.location, ref: inventory.source.ref },
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
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** @param {Record<string, unknown>} source @param {string} packName @returns {ProfileSource} */
function convertPredecessorSource(source, packName) {
  if (!hasExactFields(source, PREDECESSOR_SOURCE_FIELDS)
    || !['library', 'source'].includes(/** @type {any} */ (source.type))
    || typeof source.location !== 'string' || !source.location
    || typeof source.ref !== 'string') {
    throw new Error(`profile.md installed.${packName}.inventory.source is not a complete predecessor identity`);
  }
  if (source.type === 'library') {
    if (source.ref) throw new Error(`profile.md installed.${packName}.inventory.source is ambiguous`);
    return { type: 'local', location: source.location };
  }
  if (path.isAbsolute(source.location) || path.win32.isAbsolute(source.location)) {
    return { type: 'local', location: source.location };
  }
  if (!source.ref) {
    throw new Error(`profile.md installed.${packName}.inventory.source is ambiguous`);
  }
  return {
    type: 'remote',
    repository: source.location,
    requested_ref: source.ref,
    resolved_commit: null,
  };
}

/** @param {unknown} value @param {string} packName @param {{ root?: string }} options @returns {ProfileEntry} */
function convertPredecessorEntry(value, packName, options) {
  if (!isObject(value) || !hasExactFields(value, ['files', 'installed_at', 'inventory'])
    || !Array.isArray(value.files) || value.files.length === 0
    || !isPredecessorTimestamp(value.installed_at)
    || !isObject(value.inventory) || !hasExactFields(value.inventory, PREDECESSOR_INVENTORY_FIELDS)) {
    throw new Error(`profile.md installed.${packName} is not a complete predecessor entry`);
  }
  const inventory = value.inventory;
  if (inventory.version !== 1 || inventory.pack !== packName || !isSha256(inventory.manifest_sha256)
    || !isSha256(inventory.digest) || !isObject(inventory.source)
    || !Array.isArray(inventory.artifacts) || inventory.artifacts.length === 0) {
    throw new Error(`profile.md installed.${packName}.inventory is not a complete version-1 predecessor inventory`);
  }
  const source = convertPredecessorSource(inventory.source, packName);
  /** @type {any[]} */
  const artifacts = [];
  const artifactPaths = new Set();
  const artifactSources = new Set();
  for (const artifact of inventory.artifacts) {
    if (!isObject(artifact) || !hasExactFields(artifact, PREDECESSOR_ARTIFACT_FIELDS)
      || typeof artifact.path !== 'string' || typeof artifact.kind !== 'string'
      || typeof artifact.source !== 'string' || !isSha256(artifact.source_sha256)
      || !isSha256(artifact.installed_sha256) || !PREDECESSOR_KINDS.includes(artifact.kind)) {
      throw new Error(`profile.md installed.${packName}.inventory has a malformed predecessor artifact`);
    }
    validatePredecessorArtifactPath(artifact.path, packName);
    const expectedSource = `${artifact.kind}/${artifact.path.split('/').at(-1)}`;
    const expectedPath = `.github/${expectedSource}`;
    if (artifact.path !== expectedPath || artifact.source !== expectedSource
      || artifactPaths.has(artifact.path) || artifactSources.has(artifact.source)) {
      throw new Error(`profile.md installed.${packName}.inventory has inconsistent predecessor artifact bindings`);
    }
    artifactPaths.add(artifact.path);
    artifactSources.add(artifact.source);
    artifacts.push(artifact);
  }
  requireSorted(artifacts.map((artifact) => artifact.path), `profile.md installed.${packName}.inventory.artifacts`);
  if (predecessorDigest(inventory) !== inventory.digest) {
    throw new Error(`profile.md installed.${packName}.inventory digest does not match its exact predecessor inventory`);
  }

  /** @type {string[]} */
  const files = [];
  for (const relPath of value.files) {
    if (typeof relPath !== 'string' || files.includes(relPath) || !artifactPaths.has(relPath)) {
      throw new Error(`profile.md installed.${packName}.files do not exactly match predecessor inventory`);
    }
    try {
      if (options.root) resolveProfileArtifact(options.root, relPath, packName);
      else validatePredecessorArtifactPath(relPath, packName);
    } catch (error) {
      throw new Error(`profile.md installed.${packName}.files: ${error instanceof Error ? error.message : String(error)}`);
    }
    files.push(relPath);
  }
  requireSorted(files, `profile.md installed.${packName}.files`);
  if (files.length !== artifacts.length) {
    throw new Error(`profile.md installed.${packName}.files do not exactly match predecessor inventory`);
  }
  return { files, source };
}

/** @param {unknown} value @param {{ root?: string }} [options] @returns {Profile} */
function convertPredecessorProfile(value, options = {}) {
  if (!isObject(value) || !hasExactFields(value, ['enabled_packs', 'installed'])
    || !Array.isArray(value.enabled_packs) || !isObject(value.installed)) {
    throw new Error('profile.md JSON is neither canonical nor the complete predecessor shape');
  }
  validatePackNames(value.installed);
  const installedOrder = Object.keys(value.installed);
  if (installedOrder.some((name, index) => name !== [...installedOrder].sort()[index])) {
    throw new Error('profile.md predecessor installed map must be sorted');
  }
  /** @type {string[]} */
  const enabled = [];
  for (const name of value.enabled_packs) {
    if (typeof name !== 'string' || !PACK_NAME_RE.test(name) || enabled.includes(name)) {
      throw new Error(`profile.md has invalid predecessor enabled pack '${String(name)}'`);
    }
    enabled.push(name);
  }
  requireSorted(enabled, 'profile.md enabled_packs');
  const names = Object.keys(value.installed).sort();
  if (enabled.length !== names.length || enabled.some((name, index) => name !== names[index])) {
    throw new Error('profile.md predecessor enabled_packs and installed must have identical pack sets');
  }
  /** @type {Record<string, ProfileEntry>} */
  const installed = {};
  const claimed = new Map();
  for (const name of names) {
    const entry = convertPredecessorEntry(value.installed[name], name, options);
    for (const file of entry.files) {
      const owner = claimed.get(file);
      if (owner) throw new Error(`profile.md path '${file}' is claimed by both '${owner}' and '${name}'`);
      claimed.set(file, name);
    }
    installed[name] = entry;
  }
  return { installed };
}

/**
 * Parse the single fenced JSON payload without applying a profile schema.
 * @param {string | Buffer} content
 * @returns {unknown}
 */
export function parseProfilePayload(content) {
  const text = String(content);
  const blocks = [...text.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/g)];
  if (blocks.length !== 1) {
    throw new Error(`profile.md must contain exactly one fenced JSON block (found ${blocks.length})`);
  }
  try {
    return JSON.parse(blocks[0][1]);
  } catch (error) {
    throw new Error(`profile.md has malformed JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

/**
 * Parse canonical state or the one exact complete predecessor state. Conversion
 * is in-memory only; a lifecycle writer is the sole place canonical bytes emit.
 * @param {unknown} value
 * @param {{ root?: string }} [options]
 * @returns {Profile}
 */
export function validateProfile(value, options = {}) {
  if (isObject(value) && hasExactFields(value, ['installed'])) {
    return validateCanonicalProfile(value, options);
  }
  return convertPredecessorProfile(value, options);
}

/** @param {string | Buffer} content @param {{ root?: string }} [options] @returns {Profile} */
export function parseProfileDocument(content, options = {}) {
  return validateProfile(parseProfilePayload(content), options);
}

/**
 * Serialize canonical state only. Callers use parsed profile state, so this
 * naturally writes converted predecessor profiles in canonical form.
 * @param {Profile} profile
 * @param {{ root?: string }} [options]
 * @returns {string}
 */
export function serializeProfileDocument(profile, options = {}) {
  const validated = validateCanonicalProfile(profile, options);
  /** @type {Record<string, ProfileEntry>} */
  const installed = {};
  for (const name of Object.keys(validated.installed).sort()) {
    const entry = validated.installed[name];
    installed[name] = {
      files: [...entry.files].sort(),
      source: entry.source.type === 'local'
        ? { type: 'local', location: entry.source.location }
        : {
            type: 'remote',
            repository: entry.source.repository,
            requested_ref: entry.source.requested_ref,
            resolved_commit: entry.source.resolved_commit,
          },
    };
  }
  return `# Install Profile

This file records optional packs installed into this bundle's \`.github/\`.
It is maintained by \`dude-compose\`. Do not hand-edit the \`installed\` map.

\`\`\`json
${JSON.stringify({ installed }, null, 2)}
\`\`\`
`;
}
