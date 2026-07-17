// @ts-check
/** Strict parser and path validator for `.dude/metadata/profile.md`. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { belongsToPack } from './ownership.mjs';

export const PACK_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
export const PACK_INSTALL_ROOTS = Object.freeze([
  '.github/agents',
  '.github/skills',
  '.github/instructions',
  '.github/prompts',
]);
export const PROFILE_INVENTORY_VERSION = 1;
export const PACK_ARTIFACT_KINDS = Object.freeze(['agents', 'skills', 'instructions', 'prompts']);

const INVENTORY_FIELDS = Object.freeze(['artifacts', 'digest', 'manifest_sha256', 'pack', 'source', 'version']);
const INVENTORY_SOURCE_FIELDS = Object.freeze(['location', 'ref', 'type']);
const INVENTORY_ARTIFACT_FIELDS = Object.freeze(['installed_sha256', 'kind', 'path', 'source', 'source_sha256']);

/** @typedef {{ path: string, kind: string, source: string, source_sha256: string, installed_sha256: string }} ProfileArtifact */
/** @typedef {{ version: number, pack: string, source: { type: string, location: string, ref: string }, manifest_sha256: string, artifacts: ProfileArtifact[], digest: string }} PackInventory */
/** @typedef {{ files: string[], installed_at: string, inventory?: PackInventory }} ProfileEntry */
/** @typedef {{ enabled_packs: string[], installed: Record<string, ProfileEntry> }} Profile */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {string} value @returns {boolean} */
function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value);
}

/**
 * Compute the canonical digest carried by a pack inventory.
 * @param {Omit<PackInventory, 'digest'> | PackInventory} inventory
 * @returns {string}
 */
export function inventoryDigest(inventory) {
  const payload = {
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
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Validate the persisted inventory for one pack. Missing required fields make
 * an otherwise valid inventory legacy-incomplete; supplied values remain
 * strictly validated and are never promoted into a synthesized inventory.
 * @param {unknown} value
 * @param {string} packName
 * @returns {{ status: 'current', inventory: PackInventory } | { status: 'legacy-incomplete', artifacts: Record<string, unknown>[] | null }}
 */
function validateInventory(value, packName) {
  if (!isObject(value)) throw new Error(`profile.md installed.${packName}.inventory must be an object`);
  const unknownFields = Object.keys(value).filter((key) => !INVENTORY_FIELDS.includes(key));
  if (unknownFields.length > 0) {
    throw new Error(`profile.md installed.${packName}.inventory has unsupported fields`);
  }
  let complete = INVENTORY_FIELDS.every((field) => Object.hasOwn(value, field));
  if (Object.hasOwn(value, 'version') && value.version !== PROFILE_INVENTORY_VERSION) {
    throw new Error(`profile.md installed.${packName}.inventory has unsupported version '${String(value.version)}'`);
  }
  if (Object.hasOwn(value, 'pack') && (typeof value.pack !== 'string' || value.pack !== packName)) {
    throw new Error(`profile.md installed.${packName}.inventory belongs to pack '${String(value.pack)}'`);
  }

  if (Object.hasOwn(value, 'source')) {
    if (!isObject(value.source)) {
      throw new Error(`profile.md installed.${packName}.inventory.source must be an object`);
    }
    const unknownSourceFields = Object.keys(value.source).filter((key) => !INVENTORY_SOURCE_FIELDS.includes(key));
    if (unknownSourceFields.length > 0) {
      throw new Error(`profile.md installed.${packName}.inventory.source has unsupported fields`);
    }
    complete = complete && INVENTORY_SOURCE_FIELDS.every((field) => Object.hasOwn(value.source, field));
    if (Object.hasOwn(value.source, 'type')
      && (typeof value.source.type !== 'string' || !['library', 'source'].includes(value.source.type))) {
      throw new Error(`profile.md installed.${packName}.inventory.source.type must be library or source`);
    }
    if (Object.hasOwn(value.source, 'location')
      && (typeof value.source.location !== 'string' || !value.source.location)) {
      throw new Error(`profile.md installed.${packName}.inventory.source.location must be a non-empty string`);
    }
    if (Object.hasOwn(value.source, 'ref') && typeof value.source.ref !== 'string') {
      throw new Error(`profile.md installed.${packName}.inventory.source.ref must be a string`);
    }
  }

  if (Object.hasOwn(value, 'manifest_sha256')
    && (typeof value.manifest_sha256 !== 'string' || !isSha256(value.manifest_sha256))) {
    throw new Error(`profile.md installed.${packName}.inventory.manifest_sha256 must be a SHA-256 digest`);
  }

  /** @type {ProfileArtifact[]} */
  const artifacts = [];
  /** @type {Record<string, unknown>[] | null} */
  let partialArtifacts = null;
  if (Object.hasOwn(value, 'artifacts')) {
    if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) {
      throw new Error(`profile.md installed.${packName}.inventory.artifacts must be a non-empty array`);
    }
    partialArtifacts = [];
    const seenPaths = new Set();
    const seenSources = new Set();
    for (const rawArtifact of value.artifacts) {
      if (!isObject(rawArtifact)) {
        throw new Error(`profile.md installed.${packName}.inventory has a malformed artifact record`);
      }
      const unknownArtifactFields = Object.keys(rawArtifact)
        .filter((key) => !INVENTORY_ARTIFACT_FIELDS.includes(key));
      if (unknownArtifactFields.length > 0) {
        throw new Error(`profile.md installed.${packName}.inventory has a malformed artifact record`);
      }
      const artifactComplete = INVENTORY_ARTIFACT_FIELDS.every((field) => Object.hasOwn(rawArtifact, field));
      complete = complete && artifactComplete;

      if (Object.hasOwn(rawArtifact, 'path')) {
        validateInventoryArtifactPath(rawArtifact.path, packName);
        if (seenPaths.has(rawArtifact.path)) {
          throw new Error(`profile.md installed.${packName}.inventory repeats '${rawArtifact.path}'`);
        }
        seenPaths.add(rawArtifact.path);
      }
      if (Object.hasOwn(rawArtifact, 'kind')
        && (typeof rawArtifact.kind !== 'string' || !PACK_ARTIFACT_KINDS.includes(rawArtifact.kind))) {
        throw new Error(`profile.md installed.${packName}.inventory has unsupported artifact kind '${String(rawArtifact.kind)}'`);
      }
      if (Object.hasOwn(rawArtifact, 'source')) {
        if (typeof rawArtifact.source !== 'string') {
          throw new Error(`profile.md installed.${packName}.inventory has unsafe source '${String(rawArtifact.source)}'`);
        }
        const sourceMatch = /^(agents|skills|instructions|prompts)\/([^/]+)$/.exec(rawArtifact.source);
        if (!sourceMatch) {
          throw new Error(`profile.md installed.${packName}.inventory has unsafe source '${rawArtifact.source}'`);
        }
        validateInventoryArtifactPath(`.github/${rawArtifact.source}`, packName);
        if (Object.hasOwn(rawArtifact, 'kind') && sourceMatch[1] !== rawArtifact.kind) {
          throw new Error(`profile.md installed.${packName}.inventory has unsafe source '${rawArtifact.source}'`);
        }
        if (seenSources.has(rawArtifact.source)) {
          throw new Error(`profile.md installed.${packName}.inventory repeats source '${rawArtifact.source}'`);
        }
        seenSources.add(rawArtifact.source);
      }
      if (Object.hasOwn(rawArtifact, 'path') && Object.hasOwn(rawArtifact, 'kind')) {
        const pathKind = /^\.github\/(agents|skills|instructions|prompts)\//.exec(rawArtifact.path)?.[1];
        if (pathKind !== rawArtifact.kind) {
          throw new Error(`profile.md installed.${packName}.inventory artifact '${rawArtifact.path}' conflicts with kind '${String(rawArtifact.kind)}'`);
        }
      }
      if (Object.hasOwn(rawArtifact, 'path')
        && Object.hasOwn(rawArtifact, 'source')
        && rawArtifact.path !== `.github/${rawArtifact.source}`) {
        throw new Error(`profile.md installed.${packName}.inventory artifact '${rawArtifact.path}' conflicts with source '${rawArtifact.source}'`);
      }
      for (const hashField of ['source_sha256', 'installed_sha256']) {
        if (Object.hasOwn(rawArtifact, hashField)
          && (typeof rawArtifact[hashField] !== 'string' || !isSha256(rawArtifact[hashField]))) {
          const artifactPath = typeof rawArtifact.path === 'string' ? rawArtifact.path : '<incomplete>';
          throw new Error(`profile.md installed.${packName}.inventory artifact '${artifactPath}' has an invalid SHA-256 digest`);
        }
      }
      partialArtifacts.push({ ...rawArtifact });
      if (artifactComplete) {
        artifacts.push(/** @type {ProfileArtifact} */ ({ ...rawArtifact }));
      }
    }
  }

  if (Object.hasOwn(value, 'digest')
    && (typeof value.digest !== 'string' || !isSha256(value.digest))) {
    throw new Error(`profile.md installed.${packName}.inventory digest must be a SHA-256 digest`);
  }
  if (!complete) {
    return { status: 'legacy-incomplete', artifacts: partialArtifacts };
  }

  const inventory = {
    version: PROFILE_INVENTORY_VERSION,
    pack: packName,
    source: {
      type: /** @type {string} */ (value.source.type),
      location: /** @type {string} */ (value.source.location),
      ref: /** @type {string} */ (value.source.ref),
    },
    manifest_sha256: /** @type {string} */ (value.manifest_sha256),
    artifacts,
    digest: /** @type {string} */ (value.digest),
  };
  if (inventory.digest !== inventoryDigest(inventory)) {
    throw new Error(`profile.md installed.${packName}.inventory digest does not match its exact artifact inventory`);
  }
  return { status: 'current', inventory };
}

/**
 * Validate a supplied inventory artifact path without consulting the
 * filesystem or accepting another pack's reserved namespace.
 * @param {unknown} relPath
 * @param {string} packName
 */
function validateInventoryArtifactPath(relPath, packName) {
  if (typeof relPath !== 'string'
    || !relPath
    || relPath.includes('\\')
    || path.posix.isAbsolute(relPath)
    || path.win32.isAbsolute(relPath)
    || relPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`profile.md installed.${packName}.inventory has unsafe artifact path '${String(relPath)}'`);
  }
  const match = /^\.github\/(agents|skills|instructions|prompts)\/([^/]+)$/.exec(relPath);
  if (!match) {
    throw new Error(`profile.md installed.${packName}.inventory has unsafe artifact path '${relPath}'`);
  }
  const [,, name] = match;
  if ((match[1] === 'agents' && !name.endsWith('.agent.md'))
    || (match[1] === 'instructions' && (name === 'dude.instructions.md' || !name.endsWith('.instructions.md')))
    || (match[1] === 'prompts' && !name.endsWith('.prompt.md'))) {
    throw new Error(`profile.md installed.${packName}.inventory has unsafe artifact path '${relPath}'`);
  }
  if (name.startsWith('dude-pack-') && !belongsToPack(relPath, packName)) {
    throw new Error(`pack profile path '${relPath}' is not owned by pack '${packName}' under the dude-pack-${packName}-* namespace`);
  }
}

/**
 * Resolve one profile-owned artifact without accepting alternate separators,
 * traversal, nested artifact paths, or symbolic links.
 * @param {string} root
 * @param {string} relPath
 * @param {string} packName
 * @param {ProfileArtifact} [artifact]
 * @param {{ allowUnverifiedOwnership?: boolean }} [options]
 * @returns {string}
 */
export function resolveProfileArtifact(root, relPath, packName, artifact, options = {}) {
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
  const kind = match[1];
  const name = match[2];
  if (kind === 'agents' && !name.endsWith('.agent.md')) {
    throw new Error(`pack profile path '${relPath}' is not owned by pack '${packName}'`);
  }
  if (kind === 'instructions' && (name === 'dude.instructions.md' || !name.endsWith('.instructions.md'))) {
    throw new Error(`pack profile path '${relPath}' is reserved for core or project instructions`);
  }
  if (kind === 'prompts' && !name.endsWith('.prompt.md')) {
    throw new Error(`pack profile path '${relPath}' is not a supported prompt artifact`);
  }
  const intrinsicallyOwned = belongsToPack(relPath, packName);
  const exactLegacyLooseArtifact = (kind === 'instructions' || kind === 'prompts') && artifact;
  if (name.startsWith('dude-pack-') && !intrinsicallyOwned) {
    throw new Error(`pack profile path '${relPath}' is not owned by pack '${packName}' under the dude-pack-${packName}-* namespace`);
  }
  if (!intrinsicallyOwned && !exactLegacyLooseArtifact && !options.allowUnverifiedOwnership) {
    throw new Error(`pack profile path '${relPath}' is not owned by pack '${packName}' under the dude-pack-${packName}-* namespace without an exact persisted pack inventory`);
  }
  if (artifact
    && (artifact.path !== relPath || artifact.kind !== kind || artifact.source !== `${kind}/${name}`)) {
    throw new Error(`pack profile path '${relPath}' does not match its exact persisted source inventory`);
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

/**
 * Parse the single fenced JSON payload without applying a profile schema.
 * Reconciliation uses this only to recognize schema-v0 input before building
 * and validating a canonical versioned profile.
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
 * Validate a parsed install profile and all removal-manifest paths.
 * @param {unknown} value
 * @param {{ root?: string }} [options]
 * @returns {Profile}
 */
export function validateProfile(value, options = {}) {
  if (!isObject(value)) throw new Error('profile.md JSON must be an object');
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'enabled_packs,installed') {
    throw new Error('profile.md JSON must contain only enabled_packs and installed');
  }
  if (!Array.isArray(value.enabled_packs)) {
    throw new Error('profile.md enabled_packs must be an array');
  }
  /** @type {string[]} */
  const enabledPacks = [];
  for (const name of value.enabled_packs) {
    if (typeof name !== 'string' || !PACK_NAME_RE.test(name)) {
      throw new Error(`profile.md has invalid enabled pack '${String(name)}'`);
    }
    if (enabledPacks.includes(name)) throw new Error(`profile.md repeats enabled pack '${name}'`);
    enabledPacks.push(name);
  }
  if (!isObject(value.installed)) throw new Error('profile.md installed must be an object');

  /** @type {Record<string, ProfileEntry>} */
  const installed = {};
  const claimedPaths = new Map();
  for (const [name, rawEntry] of Object.entries(value.installed)) {
    if (!PACK_NAME_RE.test(name)) throw new Error(`profile.md has invalid installed pack '${name}'`);
    if (!enabledPacks.includes(name)) {
      throw new Error(`profile.md installed pack '${name}' is not listed in enabled_packs`);
    }
    if (!isObject(rawEntry)) throw new Error(`profile.md installed.${name} must be an object`);
    const entryKeys = Object.keys(rawEntry).sort();
    const legacy = entryKeys.join(',') === 'files,installed_at';
    if (!legacy && entryKeys.join(',') !== 'files,installed_at,inventory') {
      throw new Error(`profile.md installed.${name} has unsupported or missing fields`);
    }
    if (!Array.isArray(rawEntry.files)) {
      throw new Error(`profile.md installed.${name}.files must be an array`);
    }
    if (typeof rawEntry.installed_at !== 'string' || !rawEntry.installed_at) {
      throw new Error(`profile.md installed.${name}.installed_at must be a non-empty string`);
    }
    /** @type {string[]} */
    const files = [];
    const inventoryValidation = legacy ? null : validateInventory(rawEntry.inventory, name);
    const inventory = inventoryValidation?.status === 'current' ? inventoryValidation.inventory : undefined;
    const partialArtifacts = inventoryValidation?.status === 'legacy-incomplete'
      ? inventoryValidation.artifacts
      : null;
    const inventoryByPath = new Map((inventory?.artifacts ?? []).map((artifact) => [artifact.path, artifact]));
    for (const relPath of rawEntry.files) {
      if (typeof relPath !== 'string') {
        throw new Error(`profile.md installed.${name}.files must contain only strings`);
      }
      if (files.includes(relPath)) {
        throw new Error(`profile.md installed.${name}.files repeats '${relPath}'`);
      }
      try {
        if (options.root) {
          resolveProfileArtifact(
            options.root,
            relPath,
            name,
            inventoryByPath.get(relPath),
            { allowUnverifiedOwnership: inventoryValidation?.status === 'legacy-incomplete' },
          );
        }
      } catch (error) {
        throw new Error(`profile.md installed.${name}.files: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (inventory && !inventoryByPath.has(relPath)) {
        throw new Error(`profile.md installed.${name}.files path '${relPath}' is absent from its exact inventory`);
      }
      const owner = claimedPaths.get(relPath);
      if (owner && owner !== name) {
        throw new Error(`profile.md path '${relPath}' is claimed by both '${owner}' and '${name}'`);
      }
      claimedPaths.set(relPath, name);
      files.push(relPath);
    }
    if (inventory && inventory.artifacts.some((artifact) => !files.includes(artifact.path))) {
      throw new Error(`profile.md installed.${name}.inventory contains an artifact absent from files`);
    }
    if (partialArtifacts) {
      if (partialArtifacts.length !== files.length) {
        throw new Error(`profile.md installed.${name}.inventory artifact count does not match files`);
      }
      for (const artifact of partialArtifacts) {
        const artifactPath = typeof artifact.path === 'string'
          ? artifact.path
          : typeof artifact.source === 'string'
            ? `.github/${artifact.source}`
            : null;
        if (artifactPath && !files.includes(artifactPath)) {
          throw new Error(`profile.md installed.${name}.inventory artifact '${artifactPath}' is absent from files`);
        }
      }
    }
    installed[name] = {
      files,
      installed_at: rawEntry.installed_at,
      ...(inventory ? { inventory } : {}),
    };
  }
  return { enabled_packs: enabledPacks, installed };
}

/**
 * Parse the single fenced JSON payload from an install profile.
 * @param {string | Buffer} content
 * @param {{ root?: string }} [options]
 * @returns {Profile}
 */
export function parseProfileDocument(content, options = {}) {
  return validateProfile(parseProfilePayload(content), options);
}
