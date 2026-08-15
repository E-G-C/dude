#!/usr/bin/env node
// @ts-check
/**
 * dude-compose — install / remove optional capability packs from the local
 * pack catalog (`library/packs/<name>/`) into a bundle's `.github/`.
 *
 * This is core engine plumbing (the "lego baseplate"): it copies a pack's
 * `dude-pack-<name>-*` artifacts into `.github/`, records the install in
 * `.dude/metadata/profile.md`, and removes exactly what it installed. The
 * `dude-pack-*` namespace is preserved across `@dude upgrade`, so installed
 * packs survive core refreshes.
 *
 * A pack `agents/<stem>.agent.md` source is not copied: it is projected into
 * one Copilot profile (`.github/agents/<stem>.agent.md`) through the packaged
 * renderer. Removal deletes exactly the recorded destination without
 * reprojecting anything.
 *
 * Dependency-free ESM. Targets Node >= 20. Run `node compose.mjs --help`.
 *
 * Commands:
 *   list                 available packs (local catalog, or fetched from the
 *                        bundle's upstream source) + installed flag
 *   status               installed packs (from profile)
 *   add <name>           install pack <name> into .github/ (local catalog, or
 *                        fetched from the bundle's upstream source when absent)
 *   remove <name>        uninstall pack <name> (delete what was installed)
 *   refresh <name>       update an installed pack's .github/ projection from its
 *                        current authoritative source in one transaction
 *   verify               temp-install + lint every catalog pack (source lint)
 *
 * Flags:
 *   --root <dir>      bundle root (default: cwd). `.github` lives at <root>/.github
 *   --library <dir>   pack catalog dir (default: <root>/library/packs)
 *   --source <repo>   upstream source for add/list/refresh (default: the
 *                     bundle manifest's source_repo)
 *   --ref <ref>       upstream ref for source resolution (default: manifest / main)
 *   --no-fetch        never fetch; require the pack in the local catalog
 *   --json            machine-readable output
 *   --force           overwrite existing destination files on add
 *
 * Exit codes: 0 ok, 1 usage error, 2 operation error.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { belongsToPack } from '../dude-engine/lib/ownership.mjs';
import {
  PACK_NAME_RE,
  normalizeGitObjectId,
  parseProfileDocument,
  resolveProfileArtifact,
  serializeProfileDocument,
} from '../dude-engine/lib/profile.mjs';
import { normalizePath } from '../dude-engine/lib/text.mjs';
import { resolveReleaseRef } from '../dude-engine/lib/release-channel.mjs';
import {
  WORKSPACE_PATHS,
  resolveMutationPath,
} from '../dude-engine/lib/workspace-paths.mjs';

const COPY_DIRS = ['agents', 'skills', 'instructions', 'prompts'];
const AGENT_SOURCE_SUFFIX = '.agent.md';
const CACHE_ROOT = path.join(os.tmpdir(), 'dude-compose-cache');

/**
 * Every location a pack can install into. Named once here so `verify` copies
 * and sweeps the same set the installer writes.
 * @type {readonly string[]}
 */
const PACK_INSTALL_LOCATIONS = Object.freeze([
  '.github/agents',
  '.github/skills',
  '.github/instructions',
  '.github/prompts',
]);

/** @typedef {{ kind: string, srcAbs: string, destRel: string, name: string }} PackArtifact */
/** @typedef {{ artifact: PackArtifact, destRel: string, stagedAbs: string }} StagedArtifact */
/** @typedef {{ type: 'local', location: string } | { type: 'remote', repository: string, requested_ref: string, resolved_commit: string | null }} SourceIdentity */
/** @typedef {{ files: string[], source: SourceIdentity }} ProfileEntry */
/** @typedef {{ installed: Record<string, ProfileEntry> }} Profile */

/* ------------------------------------------------------------------ utils */

/** @param {string} p @returns {string} */
function rel(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** @param {string} abs @returns {boolean} */
function exists(abs) {
  try {
    fs.statSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} abs @returns {boolean} */
function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Recursively copy a file or directory.
 * @param {string} src
 * @param {string} dest
 */
function copyRecursive(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new Error(`refusing to copy symbolic link: ${src}`);
  }
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else if (stat.isFile()) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } else {
    throw new Error(`refusing to copy unsupported filesystem entry: ${src}`);
  }
}

/** @param {string} abs */
function removePath(abs) {
  fs.rmSync(abs, { recursive: true, force: true });
}

/**
 * Parse the leading `--- ... ---` YAML-ish frontmatter for a top-level
 * `name:` scalar. Intentionally minimal (no YAML dependency).
 * @param {string} text
 * @returns {string | null}
 */
function frontmatterName(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^name\s*:/.test(l));
  if (!line) return null;
  return line
    .replace(/^name\s*:/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/* ---------------------------------------------------------------- profile */

/**
 * @param {string} root
 * @returns {string}
 */
function profilePath(root) {
  return path.join(root, ...WORKSPACE_PATHS.PROFILE.split('/'));
}

/**
 * Read and strictly validate the install profile. A missing profile represents
 * a bundle with no installed packs; malformed content never does.
 * @param {string} root
 * @returns {Profile}
 */
function readProfile(root) {
  const p = profilePath(root);
  /** @type {Profile} */
  const empty = { installed: {} };
  if (!exists(p)) return empty;
  if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`${WORKSPACE_PATHS.PROFILE} must not be a symbolic link`);
  return parseProfileDocument(fs.readFileSync(p), { root });
}

/** @param {string} root @returns {{ profile: Profile } | { error: string }} */
function loadProfile(root) {
  try {
    return { profile: readProfile(root) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** @param {string} root @param {Profile} profile @returns {string} */
function serializeProfile(root, profile) {
  return serializeProfileDocument(profile, { root });
}

/** @param {string} root @param {string} relPath @param {string} body */
function writeProfileDocumentAt(root, relPath, body) {
  const target = resolveMutationPath(root, relPath);
  ensureDir(path.dirname(target));
  const nonce = `${process.pid}-${crypto.randomUUID()}`;
  const temporary = `${target}.tmp-${nonce}`;
  const backup = `${target}.backup-${nonce}`;
  const hadProfile = exists(target);
  try {
    fs.writeFileSync(temporary, body);
    if (hadProfile) fs.renameSync(target, backup);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      if (hadProfile) fs.renameSync(backup, target);
      throw error;
    }
    if (hadProfile) removePath(backup);
  } finally {
    removePath(temporary);
  }
}

/** @param {string} root @param {string} body */
function writeProfileDocument(root, body) {
  writeProfileDocumentAt(root, WORKSPACE_PATHS.PROFILE, body);
}

/* ------------------------------------------------------------------ catalog */

/**
 * List available pack names in the catalog (dirs containing pack.md).
 * @param {string} libraryDir
 * @returns {string[]}
 */
function availablePacks(libraryDir) {
  if (!isDir(libraryDir)) return [];
  return fs
    .readdirSync(libraryDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists(path.join(libraryDir, e.name, 'pack.md')))
    .map((e) => e.name)
    .sort();
}

/**
 * Enumerate the top-level source entries a pack ships, mapped to their
 * `.github/` destinations.
 * @param {string} packDir
 * @returns {PackArtifact[]}
 */
function packArtifacts(packDir) {
  /** @type {PackArtifact[]} */
  const out = [];
  for (const sub of COPY_DIRS) {
    const subAbs = path.join(packDir, sub);
    if (!exists(subAbs)) continue;
    const subStat = fs.lstatSync(subAbs);
    if (subStat.isSymbolicLink() || !subStat.isDirectory()) {
      throw new Error(`pack artifact category must be a regular directory: ${subAbs}`);
    }
    for (const entry of fs.readdirSync(subAbs, { withFileTypes: true })) {
      // skills/ entries are directories; everything else is a flat file.
      if (sub === 'skills') {
        if (!entry.isDirectory()) throw new Error(`pack skill must be a regular directory: ${path.join(subAbs, entry.name)}`);
      } else if (!entry.isFile()) {
        throw new Error(`pack ${sub} artifact must be a regular file: ${path.join(subAbs, entry.name)}`);
      }
      out.push({
        kind: sub,
        srcAbs: path.join(subAbs, entry.name),
        destRel: rel(path.join('.github', sub, entry.name)),
        name: entry.name,
      });
    }
  }
  return out.sort((first, second) => first.destRel.localeCompare(second.destRel));
}

/* ------------------------------------------------------------ source fetch */

/**
 * Read the bundle manifest's upstream source pin, if present and usable.
 * @param {string} root
 * @returns {{ source_repo: string, source_ref: string } | null}
 */
function readManifestSource(root) {
  const p = path.join(root, ...WORKSPACE_PATHS.BUNDLE_MANIFEST.split('/'));
  if (!exists(p)) return null;
  const m = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(fs.readFileSync(p, 'utf8'));
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    const source_repo = typeof o.source_repo === 'string' ? o.source_repo : '';
    if (!source_repo) return null;
    const source_ref = typeof o.source_ref === 'string' && o.source_ref ? o.source_ref : 'main';
    return { source_repo, source_ref };
  } catch {
    return null;
  }
}

/** @param {string[]} args @param {string} [cwd] @returns {number} exit status */
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status == null ? 1 : r.status;
}
/** @param {string[]} args @param {string} cwd @returns {string | null} */
function gitOutput(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}
/** @returns {boolean} */
function hasGit() {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

/**
 * Resolve a source tree for an upstream source + ref. Local-dir sources are
 * used in place; remote sources are cloned anew so current upstream bytes are
 * used for every invocation.
 * @param {string} source repo URL or local path
 * @param {string} ref
 * @returns {{ tree: string, sourceIdentity: SourceIdentity } | { error: string }}
 */
function resolveSourceTree(source, ref) {
  if (isDir(source)) {
    return {
      tree: source,
      sourceIdentity: { type: 'local', location: fs.realpathSync(source) },
    };
  }
  if (!hasGit()) return { error: 'git is required to fetch a pack from a remote source' };
  // Resolve the `latest` release channel to a concrete tag (shared with upgrade)
  // so a released manifest's `source_ref: latest` fetches packs from the newest
  // release tag rather than a nonexistent `latest` ref.
  const chan = resolveReleaseRef(source, ref);
  if (chan.channel && !chan.resolvedRef) {
    return { error: `no releases published yet at ${source} (channel: ${ref})` };
  }
  const fetchRef = chan.resolvedRef;
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const key = crypto.createHash('sha256').update(`${source}|${fetchRef}`).digest('hex').slice(0, 12);
  const dest = path.join(CACHE_ROOT, `src-${key}`);
  removePath(dest);
  let cloned = git(['clone', '--quiet', '--depth=1', '--branch', fetchRef, source, dest]) === 0;
  if (!cloned) {
    removePath(dest);
    cloned = git(['clone', '--quiet', source, dest]) === 0
      && git(['checkout', '--quiet', fetchRef], dest) === 0;
  }
  if (cloned) {
    const resolvedCommit = normalizeGitObjectId(gitOutput(['rev-parse', '--verify', 'HEAD^{commit}'], dest));
    if (resolvedCommit) {
      return {
        tree: dest,
        sourceIdentity: {
          type: 'remote',
          repository: source,
          requested_ref: ref,
          resolved_commit: resolvedCommit,
        },
      };
    }
  }
  removePath(dest);
  return { error: `failed to fetch source ${source} @ ${fetchRef}` };
}

/**
 * Resolve a pack's source directory. Prefers the local catalog, then falls back
 * to the bundle's configured upstream source (or an explicit override), so a
 * pack can be installed even when `library/packs/` is not vendored locally.
 * @param {{ root: string, library: string, name: string, fetch: boolean, source?: string, ref?: string }} a
 * @returns {{ packDir: string, origin: string, sourceIdentity: SourceIdentity } | { error: string }}
 */
function resolvePackDir({ root, library, name, fetch, source, ref }) {
  const localDir = path.join(library, name);
  if (isDir(localDir) && exists(path.join(localDir, 'pack.md'))) {
    return {
      packDir: localDir,
      origin: 'local',
      sourceIdentity: { type: 'local', location: fs.realpathSync(library) },
    };
  }
  if (fetch === false) {
    return { error: `pack not found in catalog: ${rel(localDir)}` };
  }
  let src = source || '';
  let sref = ref || '';
  if (!src) {
    const man = readManifestSource(root);
    if (man) {
      src = man.source_repo;
      if (!sref) sref = man.source_ref;
    }
  }
  if (!src) {
    return {
      error: `pack "${name}" is not in the local catalog and no upstream source is configured (seed ${WORKSPACE_PATHS.BUNDLE_MANIFEST} or pass --source)`,
    };
  }
  if (!sref) sref = 'main';
  const tree = resolveSourceTree(src, sref);
  if ('error' in tree) return { error: tree.error };
  const fetchedDir = path.join(tree.tree, 'library', 'packs', name);
  if (isDir(fetchedDir) && exists(path.join(fetchedDir, 'pack.md'))) {
    return {
      packDir: fetchedDir,
      origin: isDir(src) ? `source ${src}` : `${src} @ ${sref}`,
      sourceIdentity: tree.sourceIdentity,
    };
  }
  return { error: `pack "${name}" not found in source ${src}${isDir(src) ? '' : ` @ ${sref}`}` };
}

/**
 * Resolve the catalog directory to enumerate for `list`. Prefers a local
 * `library/packs/` when the repo vendors one; otherwise (a released core ships
 * no local catalog) falls back to the bundle's configured upstream source so
 * `list` can still show installable packs. A selected remote source must resolve
 * successfully; its fetch or missing-catalog failure is returned to the caller.
 * @param {{ root: string, library: string, fetch: boolean, source?: string, ref?: string }} a
 * @returns {{ dir: string, origin: string } | { error: string }}
 */
function resolveCatalogDir({ root, library, fetch, source, ref }) {
  if (isDir(library)) return { dir: library, origin: 'local' };
  if (fetch === false) return { dir: library, origin: 'local' };
  let src = source || '';
  let sref = ref || '';
  if (!src) {
    const man = readManifestSource(root);
    if (man) {
      src = man.source_repo;
      if (!sref) sref = man.source_ref;
    }
  }
  if (!src) return { dir: library, origin: 'local' };
  if (!sref) sref = 'main';
  const tree = resolveSourceTree(src, sref);
  if ('error' in tree) return { error: tree.error };
  const catalog = path.join(tree.tree, 'library', 'packs');
  if (isDir(catalog)) {
    return { dir: catalog, origin: isDir(src) ? `source ${src}` : `${src} @ ${sref}` };
  }
  return { error: `no pack catalog found in ${src}${isDir(src) ? '' : ` @ ${sref}`}` };
}

/** @param {string} root */
function profileVerificationDiagnostic(root) {
  const p = profilePath(root);
  if (!exists(p)) return { status: 'absent' };
  try {
    readProfile(root);
    return { status: 'valid', path: WORKSPACE_PATHS.PROFILE };
  } catch (error) {
    return { status: 'invalid', path: WORKSPACE_PATHS.PROFILE, conflicts: [error instanceof Error ? error.message : String(error)] };
  }
}

/**
 * Import one direct packaged dependency from its current bytes. The content key
 * prevents an earlier import of that entry module from masking its replacement
 * at the same path; its static dependencies retain Node's usual cache semantics.
 * @param {string} modulePath
 * @param {string} label
 */
async function importPackagedModule(modulePath, label) {
  let bytes;
  try {
    bytes = fs.readFileSync(modulePath);
  } catch (error) {
    throw new Error(`cannot load packaged ${label} '${modulePath}': ${error instanceof Error ? error.message : String(error)}`);
  }
  const key = crypto.createHash('sha256').update(bytes).digest('hex');
  try {
    return await import(`${pathToFileURL(modulePath).href}?sha256=${key}`);
  } catch (error) {
    throw new Error(`cannot load packaged ${label} '${modulePath}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Load rendering dependencies only for commands that create profiles.
 * @param {string} root
 */
async function loadProjectionDependencies(root) {
  const engineRoot = path.resolve(root, '.github', 'skills', 'dude-engine');
  const mapPath = path.join(engineRoot, 'lib', 'agent-model-map.mjs');
  const projectionPath = path.join(engineRoot, 'lib', 'agent-projection.mjs');
  const modelMap = await importPackagedModule(mapPath, 'agent model loader');
  if (typeof modelMap.loadAgentModelConfig !== 'function') {
    throw new Error(`packaged agent model loader '${mapPath}' has no loadAgentModelConfig export`);
  }
  const configPath = path.resolve(engineRoot, 'config', 'agent-models.json');
  const config = modelMap.loadAgentModelConfig(configPath);

  const projection = await importPackagedModule(projectionPath, 'Copilot renderer');
  for (const name of ['parseAgentSource', 'validateAgentSet', 'copilotAgentPath', 'renderCopilotAgent']) {
    if (typeof projection[name] !== 'function') {
      throw new Error(`packaged Copilot renderer '${projectionPath}' has no ${name} export`);
    }
  }
  return { config, ...projection };
}

/* ----------------------------------------------------------------- commands */

/**
 * @param {{ kind: string, destRel: string, name: string }} artifact
 * @param {string} packName
 * @returns {boolean} true when this artifact's direct destination carries the
 *   pack namespace on its own stem.
 */
function artifactInNamespace(artifact, packName) {
  if (artifact.kind === 'agents' && !artifact.name.endsWith(AGENT_SOURCE_SUFFIX)) return false;
  if (artifact.kind === 'instructions' && !artifact.name.endsWith('.instructions.md')) return false;
  if (artifact.kind === 'prompts' && !artifact.name.endsWith('.prompt.md')) return false;
  return belongsToPack(artifact.destRel, packName);
}

/**
 * Stage a pack's current source shape into a fresh temp directory. Source-shape
 * only: it resolves the pack source, matches the
 * manifest name, enumerates and namespace-checks the artifacts, validates the
 * agent set, projects/copies each artifact into `<stageRoot>/install`, and
 * returns the source identity and direct destinations. It owns no profile, collision, conflict,
 * or transaction policy — the caller does.
 *
 * The temp directory is created via `mkdtempSync(stagePrefix)` only after every
 * pre-stage validation passes, so an invalid source never creates a stage
 * directory. On success the caller owns cleanup of the returned `stageRoot`; on
 * a staging failure the helper removes its own stage directory before returning.
 * @param {{ root: string, library: string, name: string, projection: any, stagePrefix: string, fetch?: boolean, source?: string, ref?: string }} args
 * @returns {{ origin: string, sourceIdentity: SourceIdentity, staged: StagedArtifact[], stageRoot: string } | { error: string }}
 */
function stagePackFromSource({ root, library, name, projection, stagePrefix, fetch = true, source, ref }) {
  const resolved = resolvePackDir({ root, library, name, fetch, source, ref });
  if ('error' in resolved) {
    return { error: resolved.error };
  }
  const { packDir, origin, sourceIdentity } = resolved;
  const manifestName = frontmatterName(fs.readFileSync(path.join(packDir, 'pack.md'), 'utf8'));
  if (manifestName && manifestName !== name) {
    return { error: `pack.md name "${manifestName}" does not match directory "${name}"` };
  }

  let artifacts;
  try {
    artifacts = packArtifacts(packDir);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (artifacts.length === 0) {
    return { error: `pack "${name}" ships no installable artifacts` };
  }
  for (const artifact of artifacts) {
    if (!artifactInNamespace(artifact, name)) {
      return { error: `artifact "${artifact.destRel}" is outside the approved namespace and ownership rules for pack "${name}"` };
    }
  }

  const agentRecords = new Map();
  try {
    for (const artifact of artifacts) {
      if (artifact.kind !== 'agents') continue;
      const stem = artifact.name.slice(0, -AGENT_SOURCE_SUFFIX.length);
      agentRecords.set(
        artifact,
        projection.parseAgentSource(fs.readFileSync(artifact.srcAbs), { stem, config: projection.config }),
      );
    }
    projection.validateAgentSet([...agentRecords.values()]);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  // Every pre-stage validation passed; only now create the stage directory so an
  // invalid source never creates one.
  const stageRoot = fs.mkdtempSync(stagePrefix);
  try {
    /** @type {StagedArtifact[]} */
    const staged = [];
    for (const artifact of artifacts) {
      // An `agents` source installs as one rendered Copilot profile; every
      // other kind is copied one-to-one.
      const record = artifact.kind === 'agents' ? agentRecords.get(artifact) : null;
      if (artifact.kind === 'agents' && !record) {
        throw new Error(`agent source '${artifact.name}' was not parsed before staging`);
      }
      const output = record
        ? {
          relPath: projection.copilotAgentPath(record.stem),
          bytes: projection.renderCopilotAgent(record, projection.config),
        }
        : { relPath: artifact.destRel, bytes: null };
      const stagedAbs = path.join(stageRoot, 'install', ...output.relPath.split('/'));
      if (output.bytes) {
        ensureDir(path.dirname(stagedAbs));
        fs.writeFileSync(stagedAbs, output.bytes);
      } else {
        copyRecursive(artifact.srcAbs, stagedAbs);
      }
      if (origin !== 'local') normalizePath(stagedAbs);
      staged.push({ artifact, destRel: output.relPath, stagedAbs });
    }
    return { origin, sourceIdentity, staged, stageRoot };
  } catch (error) {
    removePath(stageRoot);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * @param {{ root: string, library: string, name: string, force: boolean }} args
 * @returns {Promise<{ ok: boolean, code: number, result?: any, error?: string }>}
 */
async function cmdAdd({ root, library, name, force, fetch = true, source, ref }) {
  if (!PACK_NAME_RE.test(name)) {
    return { ok: false, code: 1, error: `invalid pack name: ${name}` };
  }
  let projection;
  try {
    projection = await loadProjectionDependencies(root);
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }

  const loadedProfile = loadProfile(root);
  if ('error' in loadedProfile) return { ok: false, code: 2, error: loadedProfile.error };
  const { profile } = loadedProfile;
  if (Object.hasOwn(profile.installed, name)) {
    return { ok: true, code: 0, result: { added: name, files: [], alreadyInstalled: true } };
  }

  // Prefix-collision guard: pack names must not be hyphen-prefixes of one
  // another, because `remove` matches on the `dude-pack-<name>-` prefix. This is
  // a profile-level constraint independent of the pack source, so it runs before
  // any staging (no stage directory is created when a name collides).
  for (const other of Object.keys(profile.installed)) {
    if (name.startsWith(`${other}-`) || other.startsWith(`${name}-`)) {
      return { ok: false, code: 2, error: `pack name "${name}" collides with installed pack "${other}" (hyphen-prefix)` };
    }
  }

  /** @type {string | null} */
  let stageRoot = null;
  try {
    const stagedResult = stagePackFromSource({
      root,
      library,
      name,
      projection,
      stagePrefix: path.join(os.tmpdir(), `dude-compose-add-${name}-`),
      fetch,
      source,
      ref,
    });
    if ('error' in stagedResult) {
      return { ok: false, code: 2, error: stagedResult.error };
    }
    stageRoot = stagedResult.stageRoot;
    const { origin, sourceIdentity, staged } = stagedResult;
    const backupRoot = path.join(stageRoot, 'backup');

    const claimedBy = new Map();
    for (const [packName, entry] of Object.entries(profile.installed)) {
      for (const relPath of entry.files) claimedBy.set(relPath, packName);
    }

    /** @type {string[]} */
    const conflicts = [];
    /** @type {{ relPath: string, destination: string, stagedAbs: string }[]} */
    const targets = [];
    for (const item of staged) {
      const { artifact, destRel, stagedAbs } = item;
      const owner = claimedBy.get(destRel);
      if (owner && owner !== name) {
        conflicts.push(`${destRel} (claimed by pack "${owner}")`);
        continue;
      }
      const destination = resolveProfileArtifact(root, destRel, name);
      if (exists(destination)
        && (!force || artifact.kind === 'instructions' || artifact.kind === 'prompts')) {
        conflicts.push(`${destRel} (already exists as a core, project, or foreign artifact)`);
      }
      targets.push({ relPath: destRel, destination, stagedAbs });
    }
    if (conflicts.length > 0) {
      return { ok: false, code: 2, error: `destination ownership conflict:\n  ${conflicts.join('\n  ')}` };
    }

    const files = staged.map((item) => item.destRel).sort();
    const nextProfile = structuredClone(profile);
    nextProfile.installed[name] = {
      files,
      source: sourceIdentity,
    };
    const nextProfileBody = serializeProfile(root, nextProfile);
    const previousProfile = exists(profilePath(root)) ? fs.readFileSync(profilePath(root)) : null;

    /** @type {{ relPath: string, destination: string, backup: string | null }[]} */
    const applied = [];
    try {
      // Back up every existing force-overwrite target before the first deletion.
      // A later backup failure therefore leaves every destination untouched.
      const backups = new Map();
      for (const target of targets) {
        if (exists(target.destination)) {
          const backup = path.join(backupRoot, ...target.relPath.split('/'));
          copyRecursive(target.destination, backup);
          backups.set(target.relPath, backup);
        }
      }
      for (const target of targets) {
        const backup = backups.get(target.relPath) ?? null;
        if (backup) {
          removePath(target.destination);
        }
        applied.push({ relPath: target.relPath, destination: target.destination, backup });
        copyRecursive(target.stagedAbs, target.destination);
      }
      writeProfileDocument(root, nextProfileBody);
    } catch (error) {
      /** @type {string[]} */
      const rollbackErrors = [];
      for (const target of [...applied].reverse()) {
        try {
          removePath(target.destination);
          if (target.backup) copyRecursive(target.backup, target.destination);
        } catch (rollbackError) {
          rollbackErrors.push(`${target.relPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
      try {
        if (previousProfile) fs.writeFileSync(profilePath(root), previousProfile);
        else removePath(profilePath(root));
        sweepProfileTransactionResidue(profilePath(root));
      } catch (rollbackError) {
        rollbackErrors.push(`${WORKSPACE_PATHS.PROFILE}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      if (rollbackErrors.length > 0) {
        return {
          ok: false,
          code: 2,
          error: `pack add failed (${error instanceof Error ? error.message : String(error)}); rollback failed: ${rollbackErrors.join('; ')}`,
        };
      }
      return { ok: false, code: 2, error: `pack add failed and was rolled back: ${error instanceof Error ? error.message : String(error)}` };
    }

    return { ok: true, code: 0, result: { added: name, files: files.sort(), origin } };
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (stageRoot) removePath(stageRoot);
  }
}

/**
 * Best-effort sweep of leftover profile-transaction siblings so the metadata
 * directory matches its prior state after a rollback. The atomic writer
 * normally removes these, but a cleanup failure can strand a `.backup-*` (or
 * `.tmp-*`). Bounded to the profile's own directory; never throws.
 * @param {string} profileAbsolutePath
 */
function sweepProfileTransactionResidue(profileAbsolutePath) {
  const dir = path.dirname(profileAbsolutePath);
  const base = path.basename(profileAbsolutePath);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(`${base}.backup-`) || entry.startsWith(`${base}.tmp-`)) {
      try {
        removePath(path.join(dir, entry));
      } catch {
        // best effort: the metadata tree already reflects the restored profile
      }
    }
  }
}

/**
 * @param {{ root: string, name: string }} args
 * @returns {{ ok: boolean, code: number, result?: any, error?: string }}
 */
function cmdRemove({ root, name }) {
  const currentProfilePath = profilePath(root);
  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }
  if (!PACK_NAME_RE.test(name)) {
    return { ok: false, code: 1, error: `invalid pack name: ${name}` };
  }
  /** @type {Buffer | null} */
  let authorizedProfileBytes = null;
  /** @type {Profile} */
  let profile = { installed: {} };
  try {
    if (exists(currentProfilePath)) {
      authorizedProfileBytes = fs.readFileSync(currentProfilePath);
      profile = parseProfileDocument(authorizedProfileBytes, { root });
    }
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }

  const entry = profile.installed[name];
  if (!entry || !authorizedProfileBytes) {
    return { ok: false, code: 2, error: `pack "${name}" is not installed` };
  }

  const targets = entry.files.slice();

  /** @type {{ relPath: string, absolutePath: string }[]} */
  const resolvedTargets = [];
  for (const t of targets) {
    try {
      const abs = resolveProfileArtifact(root, t, name);
      resolvedTargets.push({ relPath: t, absolutePath: abs });
    } catch (error) {
      return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const nextProfile = structuredClone(profile);
  delete nextProfile.installed[name];
  let nextProfileBody;
  try {
    nextProfileBody = serializeProfile(root, nextProfile);
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
    const currentProfileBytes = exists(currentProfilePath) ? fs.readFileSync(currentProfilePath) : null;
    if (!currentProfileBytes || !authorizedProfileBytes.equals(currentProfileBytes)) {
      return { ok: false, code: 2, error: `profile changed after authorizing removal of pack "${name}"; refusing deletion` };
    }
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }

  const transactionRoot = fs.mkdtempSync(path.join(os.tmpdir(), `dude-compose-remove-${name}-`));
  /** @type {{ relPath: string, absolutePath: string, backup: string }[]} */
  const removed = [];
  try {
    try {
      // Phase 1: back up every present artifact before deleting any of them, so
      // a mid-transaction failure never strands a deletion with no backup.
      for (const target of resolvedTargets) {
        if (!exists(target.absolutePath)) continue;
        const backup = path.join(transactionRoot, ...target.relPath.split('/'));
        copyRecursive(target.absolutePath, backup);
        removed.push({ ...target, backup });
      }
      // Phase 2: delete the fully backed-up artifacts, then replace the profile.
      for (const target of removed) {
        removePath(target.absolutePath);
      }
      writeProfileDocument(root, nextProfileBody);
    } catch (error) {
      /** @type {string[]} */
      const rollbackErrors = [];
      for (const target of [...removed].reverse()) {
        try {
          removePath(target.absolutePath);
          copyRecursive(target.backup, target.absolutePath);
        } catch (rollbackError) {
          rollbackErrors.push(`${target.relPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
      try {
        fs.writeFileSync(currentProfilePath, authorizedProfileBytes);
        sweepProfileTransactionResidue(currentProfilePath);
      } catch (rollbackError) {
        rollbackErrors.push(`${WORKSPACE_PATHS.PROFILE}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      return {
        ok: false,
        code: 2,
        error: rollbackErrors.length > 0
          ? `pack removal failed (${error instanceof Error ? error.message : String(error)}); rollback failed: ${rollbackErrors.join('; ')}`
          : `pack removal failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return { ok: true, code: 0, result: { removed: name, files: removed.map((target) => target.relPath).sort() } };
  } finally {
    removePath(transactionRoot);
  }
}

/**
 * Prepare an installed pack's ordinary refresh projection. The caller owns the
 * successful stage directory and either previews it or runs the transaction.
 * @param {{ root: string, library: string, name: string, fetch?: boolean, source?: string, ref?: string }} args
 * @returns {Promise<{ ok: boolean, code: number, result?: any, error?: string }>}
 */
async function prepareRefresh({ root, library, name, fetch = true, source, ref }) {
  const currentProfilePath = profilePath(root);
  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
  } catch (error) {
    return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
  }
  if (!PACK_NAME_RE.test(name)) {
    return { ok: false, code: 1, mutation: 'none', error: `invalid pack name: ${name}` };
  }

  /** @type {Buffer | null} */
  let authorizedProfileBytes = null;
  /** @type {Profile} */
  let profile = { installed: {} };
  try {
    if (exists(currentProfilePath)) {
      authorizedProfileBytes = fs.readFileSync(currentProfilePath);
      profile = parseProfileDocument(authorizedProfileBytes, { root });
    }
  } catch (error) {
    return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
  }

  const entry = profile.installed[name];
  if (!entry || !authorizedProfileBytes) {
    return { ok: false, code: 2, mutation: 'none', error: `pack "${name}" is not installed` };
  }

  const recordedFiles = entry.files.slice();
  const oldFiles = new Set(recordedFiles);

  // Every recorded target must still resolve safely, but it may be missing or
  // edited because pack output is replaceable.
  /** @type {Map<string, string>} */
  const oldResolved = new Map();
  for (const file of recordedFiles) {
    try {
      const abs = resolveProfileArtifact(root, file, name);
      oldResolved.set(file, abs);
    } catch (error) {
      return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
    }
  }

  let projection;
  try {
    projection = await loadProjectionDependencies(root);
  } catch (error) {
    return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
  }

  /** @type {string | null} */
  let stageRoot = null;
  let ready = false;
  try {
    const stagedResult = stagePackFromSource({
      root,
      library,
      name,
      projection,
      stagePrefix: path.join(os.tmpdir(), `dude-compose-refresh-${name}-`),
      fetch,
      source,
      ref,
    });
    if ('error' in stagedResult) {
      return { ok: false, code: 2, mutation: 'none', error: stagedResult.error };
    }
    stageRoot = stagedResult.stageRoot;
    const { sourceIdentity, staged } = stagedResult;
    const stagedByPath = new Map(staged.map((item) => [item.destRel, item.stagedAbs]));
    const newFiles = staged.map((item) => item.destRel).sort();
    const newFileSet = new Set(newFiles);

    // Other packs' destination claims (this pack's own claims are authorized by
    // the installed-side gate above and must not conflict with themselves).
    const claimedBy = new Map();
    for (const [packName, packEntry] of Object.entries(profile.installed)) {
      if (packName === name) continue;
      for (const relPath of packEntry.files) claimedBy.set(relPath, packName);
    }

    // Destination-set difference: same-path replacements, new-only additions,
    // old-only removals. The additive preflight refuses before any mutation.
    /** @type {{ relPath: string, destination: string, stagedAbs: string }[]} */
    const replacements = [];
    /** @type {{ relPath: string, destination: string, stagedAbs: string }[]} */
    const additions = [];
    /** @type {{ relPath: string, destination: string }[]} */
    const removals = [];
    /** @type {string[]} */
    const conflicts = [];
    try {
      for (const file of newFiles) {
        const stagedAbs = /** @type {string} */ (stagedByPath.get(file));
        if (oldFiles.has(file)) {
          // A same-path existing pack destination is replaceable, whether it is
          // present, missing, or locally edited.
          const destination = resolveProfileArtifact(root, file, name);
          replacements.push({ relPath: file, destination, stagedAbs });
        } else {
          // New-only addition: authorize creation only through namespace, path,
          // and ownership validation plus absence and other-pack checks. No force
          // exception for any kind.
          const owner = claimedBy.get(file);
          if (owner) {
            conflicts.push(`${file} (claimed by pack "${owner}")`);
            continue;
          }
          const destination = resolveProfileArtifact(root, file, name);
          if (exists(destination)) {
            conflicts.push(`${file} (already exists as a core, project, or foreign artifact)`);
            continue;
          }
          additions.push({ relPath: file, destination, stagedAbs });
        }
      }
    } catch (error) {
      return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
    }
    for (const file of recordedFiles) {
      if (!newFileSet.has(file)) {
        removals.push({ relPath: file, destination: /** @type {string} */ (oldResolved.get(file)) });
      }
    }
    if (conflicts.length > 0) {
      return { ok: false, code: 2, mutation: 'none', error: `destination ownership conflict:\n  ${conflicts.join('\n  ')}` };
    }

    // Build the next canonical profile and re-establish authority by rereading
    // the record immediately before application.
    const nextProfile = structuredClone(profile);
    nextProfile.installed[name] = {
      files: newFiles,
      source: sourceIdentity,
    };
    let nextProfileBody;
    try {
      nextProfileBody = serializeProfile(root, nextProfile);
    } catch (error) {
      return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
    }
    const authorityError = reauthorizeRefresh({
      root,
      name,
      currentProfilePath,
      authorizedProfileBytes,
    });
    if (authorityError) return { ok: false, code: 2, mutation: 'none', error: authorityError };

    ready = true;
    return {
      ok: true,
      code: 0,
      result: {
        name,
        sourceIdentity,
        staged,
        stageRoot,
        currentProfilePath,
        authorizedProfileBytes,
        replacements,
        additions,
        removals,
        newFiles,
        nextProfileBody,
      },
    };
  } catch (error) {
    return { ok: false, code: 2, mutation: 'none', error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (stageRoot && !ready) removePath(stageRoot);
  }
}

/** @param {any} prepared */
function reauthorizeRefresh(prepared) {
  try {
    resolveMutationPath(prepared.root, WORKSPACE_PATHS.PROFILE);
    const currentProfileBytes = exists(prepared.currentProfilePath) ? fs.readFileSync(prepared.currentProfilePath) : null;
    if (!currentProfileBytes || !prepared.authorizedProfileBytes.equals(currentProfileBytes)) {
      return `profile changed after authorizing refresh of pack "${prepared.name}"; refusing refresh`;
    }
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Return the ordinary refresh projection without writing pack artifacts or the
 * profile. The caller receives only the public preview shape.
 * @param {{ root: string, library: string, name: string, fetch?: boolean, source?: string, ref?: string }} args
 */
async function cmdPreviewRefresh(args) {
  const prepared = await prepareRefresh(args);
  if (!prepared.ok) return prepared;
  const data = prepared.result;
  try {
    const authorityError = reauthorizeRefresh({ ...data, root: args.root });
    if (authorityError) return { ok: false, code: 2, mutation: 'none', error: authorityError };
    return {
      ok: true,
      code: 0,
      result: {
        previewed: data.name,
        replaced: data.replacements.map((item) => item.relPath).sort(),
        added: data.additions.map((item) => item.relPath).sort(),
        removed: data.removals.map((item) => item.relPath).sort(),
        files: data.newFiles.slice(),
        source: data.sourceIdentity,
      },
    };
  } finally {
    removePath(data.stageRoot);
  }
}

async function cmdRefresh(args) {
  const prepared = await prepareRefresh(args);
  if (!prepared.ok) return prepared;
  const data = prepared.result;
  let transactionRoot = null;
  let mutationStarted = false;
  try {
    const authorityError = reauthorizeRefresh({ ...data, root: args.root });
    if (authorityError) return { ok: false, code: 2, mutation: 'none', error: authorityError };

    const {
      name,
      currentProfilePath,
      authorizedProfileBytes,
      replacements,
      additions,
      removals,
      newFiles,
      nextProfileBody,
    } = data;

    // All-or-restored transaction: back up every replacement and removal target
    // before mutating any; apply removals, then replacements, then additions,
    // then the profile; on any failure reverse the applied mutations and restore
    // the record.
    transactionRoot = fs.mkdtempSync(path.join(os.tmpdir(), `dude-compose-refresh-${name}-txn-`));
    /** @type {{ relPath: string, destination: string, stagedAbs: string | null, action: 'replace' | 'add' | 'remove', backup: string | null }[]} */
    const applied = [];
    try {
      // Phase 1: back up every existing replacement and removal target before
      // mutating any destination.
      /** @type {Map<string, string>} */
      const backups = new Map();
      for (const item of [...replacements, ...removals]) {
        if (!exists(item.destination)) continue;
        const backup = path.join(transactionRoot, ...item.relPath.split('/'));
        copyRecursive(item.destination, backup);
        backups.set(item.relPath, backup);
      }
      // Phase 2: removals, then replacements, then additions, then the profile.
      for (const item of removals) {
        mutationStarted = true;
        applied.push({ relPath: item.relPath, destination: item.destination, stagedAbs: null, action: 'remove', backup: backups.get(item.relPath) ?? null });
        removePath(item.destination);
      }
      for (const item of replacements) {
        mutationStarted = true;
        applied.push({ relPath: item.relPath, destination: item.destination, stagedAbs: item.stagedAbs, action: 'replace', backup: backups.get(item.relPath) ?? null });
        removePath(item.destination);
        copyRecursive(item.stagedAbs, item.destination);
      }
      for (const item of additions) {
        mutationStarted = true;
        applied.push({ relPath: item.relPath, destination: item.destination, stagedAbs: item.stagedAbs, action: 'add', backup: null });
        copyRecursive(item.stagedAbs, item.destination);
      }
      mutationStarted = true;
      writeProfileDocument(args.root, nextProfileBody);
    } catch (error) {
      /** @type {string[]} */
      const rollbackErrors = [];
      for (const item of [...applied].reverse()) {
        try {
          if (item.action === 'add') {
            removePath(item.destination);
          } else if (item.action === 'replace') {
            removePath(item.destination);
            if (item.backup) copyRecursive(item.backup, item.destination);
          } else if (item.backup) {
            copyRecursive(item.backup, item.destination);
          }
        } catch (rollbackError) {
          rollbackErrors.push(`${item.relPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }
      try {
        fs.writeFileSync(currentProfilePath, authorizedProfileBytes);
        sweepProfileTransactionResidue(currentProfilePath);
      } catch (rollbackError) {
        rollbackErrors.push(`${WORKSPACE_PATHS.PROFILE}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      return {
        ok: false,
        code: 2,
        mutation: rollbackErrors.length > 0 ? 'uncertain' : 'restored',
        error: rollbackErrors.length > 0
          ? `pack refresh failed (${error instanceof Error ? error.message : String(error)}); rollback failed: ${rollbackErrors.join('; ')}`
          : `pack refresh failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      ok: true,
      code: 0,
      result: {
        refreshed: name,
        replaced: replacements.map((item) => item.relPath).sort(),
        added: additions.map((item) => item.relPath).sort(),
        removed: removals.map((item) => item.relPath).sort(),
        files: newFiles.slice().sort(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: 2,
      mutation: mutationStarted ? 'uncertain' : 'none',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (transactionRoot) removePath(transactionRoot);
    removePath(data.stageRoot);
  }
}

/**
 * @param {{ root: string, library: string, fetch?: boolean, source?: string, ref?: string }} args
 * @returns {{ ok: boolean, code: number, result?: any, error?: string }}
 */
function cmdList({ root, library, fetch = true, source, ref }) {
  const loadedProfile = loadProfile(root);
  if ('error' in loadedProfile) return { ok: false, code: 2, error: loadedProfile.error };
  const { profile } = loadedProfile;
  const installedSet = new Set(Object.keys(profile.installed));
  const cat = resolveCatalogDir({ root, library, fetch, source, ref });
  if ('error' in cat) return { ok: false, code: 2, error: cat.error };
  const packs = availablePacks(cat.dir).map((name) => {
    let description = '';
    try {
      const text = fs.readFileSync(path.join(cat.dir, name, 'pack.md'), 'utf8');
      const m = /^description\s*:\s*(.+)$/m.exec(text);
      if (m) description = m[1].trim().replace(/^["']|["']$/g, '');
    } catch {
      /* ignore */
    }
    return { name, installed: installedSet.has(name), description };
  });
  return {
    ok: true,
    code: 0,
    result: {
      packs,
      enabled_packs: [...installedSet].sort(),
      origin: cat.origin,
    },
  };
}

/**
 * @param {{ root: string }} args
 * @returns {{ ok: boolean, code: number, result: any }}
 */
function cmdStatus({ root }) {
  const loadedProfile = loadProfile(root);
  if ('error' in loadedProfile) return { ok: false, code: 2, error: loadedProfile.error };
  const { profile } = loadedProfile;
  return {
    ok: true,
    code: 0,
    result: {
      enabled_packs: Object.keys(profile.installed).sort(),
      installed: profile.installed,
    },
  };
}

/**
 * Verify catalog packs by temp-installing each into a throwaway copy of the
 * current bundle and running dude-lint against it. Reports per-pack warning /
 * failure / leftover counts. This is the pack-source lint integration: it
 * surfaces issues (stale handles, malformed frontmatter, removal leftovers)
 * that the core linter cannot see while a pack still lives under library/packs/.
 * @param {{ root: string, library: string }} a
 * @returns {Promise<{ ok: boolean, code: number, result?: any, error?: string }>}
 */
async function cmdVerify({ root, library }) {
  try {
    await loadProjectionDependencies(root);
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }
  const lintPath = fileURLToPath(new URL('../dude-lint/lint.mjs', import.meta.url));
  const profile = profileVerificationDiagnostic(root);
  const names = availablePacks(library);
  /** @type {{ name: string, warnings: number, failures: number, leftovers: number, error?: string }[]} */
  const verified = [];

  for (const name of names) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dude-verify-${name}-`));
    try {
      for (const location of PACK_INSTALL_LOCATIONS) {
        const srcAbs = path.join(root, ...location.split('/'));
        if (isDir(srcAbs)) copyRecursive(srcAbs, path.join(tmp, ...location.split('/')));
      }
      const metadataSource = path.join(root, ...WORKSPACE_PATHS.METADATA_DIR.split('/'));
      if (isDir(metadataSource)) {
        copyRecursive(metadataSource, path.join(tmp, ...WORKSPACE_PATHS.METADATA_DIR.split('/')));
      }
      const libSrc = path.join(root, 'library');
      if (isDir(libSrc)) copyRecursive(libSrc, path.join(tmp, 'library'));

      const add = await cmdAdd({ root: tmp, library: path.join(tmp, 'library', 'packs'), name, force: false, fetch: false });
      if (!add.ok) {
        verified.push({ name, warnings: 0, failures: 1, leftovers: 0, error: add.error });
        continue;
      }
      const lint = spawnSync(process.execPath, [lintPath, tmp], { encoding: 'utf8' });
      const out = `${lint.stdout || ''}${lint.stderr || ''}`;
      const m = /Findings:\s*(\d+)\s*warning\(s\),\s*(\d+)\s*failure\(s\)/.exec(out);
      const warnings = m ? Number(m[1]) : 0;
      const failures = m ? Number(m[2]) : lint.status ? 1 : 0;

      const removal = cmdRemove({ root: tmp, name });
      let leftovers = 0;
      for (const location of PACK_INSTALL_LOCATIONS) {
        const subAbs = path.join(tmp, ...location.split('/'));
        if (!isDir(subAbs)) continue;
        for (const e of fs.readdirSync(subAbs)) {
          if (belongsToPack(`${location}/${e}`, name)) leftovers += 1;
        }
      }
      verified.push({
        name,
        warnings,
        failures,
        leftovers,
        ...(!removal.ok ? { error: removal.error } : {}),
      });
    } finally {
      removePath(tmp);
    }
  }

  const profileFailed = profile.status === 'invalid';
  const anyFail = profileFailed || verified.some((v) => v.failures > 0 || v.leftovers > 0 || v.error);
  return { ok: !anyFail, code: anyFail ? 2 : 0, result: { verified, profile } };
}

/* --------------------------------------------------------------------- cli */

const HELP = `dude-compose — install / remove optional packs

Usage:
  node compose.mjs list                 list catalog packs (local or fetched) + installed
  node compose.mjs status               list installed packs
  node compose.mjs add <name>           install a pack into .github/
  node compose.mjs remove <name>        uninstall a pack
  node compose.mjs refresh <name>       update an installed pack from its current source
  node compose.mjs verify               temp-install + lint every catalog pack

Flags:
  --root <dir>      bundle root (default: cwd)
  --library <dir>   pack catalog (default: <root>/library/packs)
  --source <repo>   upstream source for add/list/refresh (default: manifest)
  --ref <ref>       upstream ref for source resolution (default: manifest / main)
  --no-fetch        never fetch; require the pack in the local catalog
  --json            machine-readable output
  --dry-run         preview refresh without writing
  --force           overwrite existing files on add
`;

/**
 * @param {string[]} argv
 * @returns {{ cmd?: string, name?: string, root: string, library?: string, json: boolean, force: boolean, dryRun: boolean, help: boolean }}
 */
function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), json: false, force: false, dryRun: false, fetch: true, help: false };
  /** @type {string[]} */
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--no-fetch') out.fetch = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--library') out.library = argv[++i];
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--ref') out.ref = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else positionals.push(a);
  }
  out.cmd = positionals[0];
  out.name = positionals[1];
  if (out.dryRun && out.cmd !== 'refresh') out.help = true;
  return out;
}

/** @param {any} r @param {boolean} json */
function report(r, json) {
  if (json) {
    process.stdout.write(JSON.stringify(
      r.ok
        ? { ok: true, ...r.result }
        : { ok: false, error: r.error, ...r.result, ...(r.plan ? { plan: r.plan } : {}) },
      null,
      2,
    ) + '\n');
    return;
  }
  const res = r.result || {};
  if (!r.ok && !res.verified) {
    process.stderr.write(`[FAIL] ${r.error}\n`);
    return;
  }
  if (res.packs) {
    if (res.origin && res.origin !== 'local') {
      process.stdout.write(`# catalog: ${res.origin}\n`);
    }
    for (const p of res.packs) {
      process.stdout.write(`${p.installed ? '[x]' : '[ ]'} ${p.name}${p.description ? ' — ' + p.description : ''}\n`);
    }
    if (res.packs.length === 0) {
      process.stdout.write('No packs available in the catalog.\n');
    }
    if (res.note) process.stderr.write(`[INFO] ${res.note}\n`);
  } else if (res.refreshed) {
    process.stdout.write(
      `[OK] refreshed pack "${res.refreshed}" (${res.replaced.length} replaced, ${res.added.length} added, ${res.removed.length} removed)\n`
    );
  } else if (res.previewed) {
    process.stdout.write(
      `[OK] previewed pack "${res.previewed}" (${res.replaced.length} replaced, ${res.added.length} added, ${res.removed.length} removed)\n`
    );
  } else if (res.added) {
    const from = res.origin && res.origin !== 'local' ? ` from ${res.origin}` : '';
    process.stdout.write(
      res.alreadyInstalled
        ? `[INFO] pack "${res.added}" already installed\n`
        : `[OK] installed pack "${res.added}" (${res.files.length} item(s))${from}\n`
    );
  } else if (res.removed) {
    process.stdout.write(`[OK] removed pack "${res.removed}" (${res.files.length} item(s))\n`);
  } else if (res.enabled_packs) {
    process.stdout.write(res.enabled_packs.length ? `Installed: ${res.enabled_packs.join(', ')}\n` : 'No packs installed.\n');
  } else if (res.verified) {
    if (res.profile.status === 'invalid') {
      process.stdout.write(`[FAIL] invalid profile: ${(res.profile.conflicts ?? []).join('; ')}\n`);
    }
    for (const v of res.verified) {
      const bad = v.failures > 0 || v.leftovers > 0 || v.error;
      const detail = v.error
        ? `error: ${v.error}`
        : `${v.warnings} warning(s), ${v.failures} failure(s), ${v.leftovers} leftover(s)`;
      process.stdout.write(`${bad ? '[FAIL]' : '[OK]  '} ${v.name} — ${detail}\n`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.cmd) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }
  const root = path.resolve(args.root);
  const library = args.library ? path.resolve(args.library) : path.join(root, 'library', 'packs');

  /** @type {{ ok: boolean, code: number, result?: any, error?: string }} */
  let r;
  switch (args.cmd) {
    case 'list':
      r = cmdList({ root, library, fetch: args.fetch, source: args.source, ref: args.ref });
      break;
    case 'status':
      r = cmdStatus({ root });
      break;
    case 'add':
      if (!args.name) {
        r = { ok: false, code: 1, error: 'add requires a pack name' };
      } else {
        r = await cmdAdd({ root, library, name: args.name, force: args.force, fetch: args.fetch, source: args.source, ref: args.ref });
      }
      break;
    case 'remove':
      if (!args.name) {
        r = { ok: false, code: 1, error: 'remove requires a pack name' };
      } else {
        r = cmdRemove({ root, name: args.name });
      }
      break;
    case 'refresh':
      if (!args.name) {
        r = { ok: false, code: 1, error: 'refresh requires a pack name' };
      } else {
        r = args.dryRun
          ? await cmdPreviewRefresh({ root, library, name: args.name, fetch: args.fetch, source: args.source, ref: args.ref })
          : await cmdRefresh({ root, library, name: args.name, fetch: args.fetch, source: args.source, ref: args.ref });
      }
      break;
    case 'verify':
      r = await cmdVerify({ root, library });
      break;
    default:
      r = { ok: false, code: 1, error: `unknown command: ${args.cmd}` };
  }

  report(r, args.json);
  process.exit(r.code);
}

/**
 * Is this module being executed directly (vs. imported)? Robust to script
 * paths that contain spaces (percent-encoded in a `file://` URL) and to symlinks
 * (e.g. macOS `/tmp` -> `/private/tmp`), where `import.meta.url` is realpath-
 * resolved but `process.argv[1]` is not.
 * @param {string} metaUrl `import.meta.url`
 * @param {string | undefined} argv1 `process.argv[1]`
 * @returns {boolean}
 */
function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

// Run only when invoked directly (allows importing for tests).
if (isMainModule(import.meta.url, process.argv[1])) {
  void main();
}

export {
  cmdAdd,
  cmdRemove,
  cmdRefresh,
  cmdPreviewRefresh,
  cmdList,
  cmdStatus,
  cmdVerify,
  readProfile,
  availablePacks,
  packArtifacts,
  resolvePackDir,
  resolveCatalogDir,
  readManifestSource,
  isMainModule,
};
