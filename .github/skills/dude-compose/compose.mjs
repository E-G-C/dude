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
 * Dependency-free ESM. Targets Node >= 20. Run `node compose.mjs --help`.
 *
 * Commands:
 *   list                 available packs (local catalog, or fetched from the
 *                        bundle's upstream source) + installed flag
 *   status               installed packs (from profile)
 *   add <name>           install pack <name> into .github/ (local catalog, or
 *                        fetched from the bundle's upstream source when absent)
 *   remove <name>        uninstall pack <name> (delete what was installed)
 *   verify               temp-install + lint every catalog pack (source lint)
 *
 * Flags:
 *   --root <dir>      bundle root (default: cwd). `.github` lives at <root>/.github
 *   --library <dir>   pack catalog dir (default: <root>/library/packs)
 *   --source <repo>   upstream source for add/list (default: the
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
import { fileURLToPath } from 'node:url';
import { belongsToPack } from '../dude-engine/lib/ownership.mjs';
import { normalizeAgentFrontmatter } from '../dude-engine/lib/agent-frontmatter.mjs';
import {
  PACK_NAME_RE,
  PROFILE_INVENTORY_VERSION,
  inventoryDigest,
  parseProfileDocument,
  resolveProfileArtifact,
  validateProfile,
} from '../dude-engine/lib/profile.mjs';
import { normalizePath } from '../dude-engine/lib/text.mjs';
import { resolveReleaseRef } from '../dude-engine/lib/release-channel.mjs';
import {
  WORKSPACE_PATHS,
  resolveMutationPath,
} from '../dude-engine/lib/workspace-paths.mjs';

const COPY_DIRS = ['agents', 'skills', 'instructions', 'prompts'];
const CACHE_ROOT = path.join(os.tmpdir(), 'dude-compose-cache');

/** @typedef {{ path: string, kind: string, source: string, source_sha256: string, installed_sha256: string }} ProfileArtifact */
/** @typedef {{ version: number, pack: string, source: { type: string, location: string, ref: string }, manifest_sha256: string, artifacts: ProfileArtifact[], digest: string }} PackInventory */
/** @typedef {{ files: string[], installed_at: string, inventory?: PackInventory }} ProfileEntry */
/** @typedef {{ enabled_packs: string[], installed: Record<string, ProfileEntry> }} Profile */

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
  const empty = { enabled_packs: [], installed: {} };
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
  const validated = validateProfile(profile, { root });
  const enabled = [...new Set(validated.enabled_packs)].sort();
  /** @type {Record<string, ProfileEntry>} */
  const installed = {};
  for (const name of Object.keys(validated.installed).sort()) {
    const entry = validated.installed[name];
    installed[name] = {
      files: [...entry.files].sort(),
      installed_at: entry.installed_at,
      ...(entry.inventory
        ? {
            inventory: {
              ...entry.inventory,
              artifacts: [...entry.inventory.artifacts].sort((first, second) => first.path.localeCompare(second.path)),
            },
          }
        : {}),
    };
  }
  const json = JSON.stringify({ enabled_packs: enabled, installed }, null, 2);
  return `# Install Profile

This file records which optional **packs** from \`library/packs/\` are installed
into this bundle's \`.github/\`. It is maintained by \`dude-compose\`
(\`@dude add pack <name>\` / \`@dude remove pack <name>\`). Do not hand-edit the
\`installed\` map — it is the removal manifest.

\`\`\`json
${json}
\`\`\`

## Notes

- \`enabled_packs\` — names of installed packs (sorted).
- \`installed.<name>.files\` — the exact top-level destination paths written for
  that pack; \`remove\` deletes precisely these.
- \`installed.<name>.inventory\` — the versioned source identity, manifest hash,
  and per-artifact source/install hashes used to validate removal without a
  local catalog. Ambiguous legacy entries fail closed.
- Installed pack artifacts use the \`dude-pack-<name>-*\` namespace, which
  \`@dude upgrade\` preserves across core refreshes.
`;
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

/**
 * Serialize and atomically write the profile.
 * @param {string} root
 * @param {Profile} profile
 */
function writeProfile(root, profile) {
  writeProfileDocument(root, serializeProfile(root, profile));
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
 * @returns {{ kind: string, srcAbs: string, destRel: string, name: string }[]}
 */
function packArtifacts(packDir) {
  /** @type {{ kind: string, srcAbs: string, destRel: string, name: string }[]} */
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

/**
 * Hash one regular file or directory tree without following symbolic links.
 * @param {string} absolutePath
 * @returns {string}
 */
function hashArtifact(absolutePath) {
  const hash = crypto.createHash('sha256');
  /** @param {string} current @param {string} relative */
  function visit(current, relative) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`pack artifact contains symbolic link: ${current}`);
    if (stat.isDirectory()) {
      hash.update(`directory\0${relative}\0`);
      for (const name of fs.readdirSync(current).sort()) {
        visit(path.join(current, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`pack artifact is not a regular file or directory: ${current}`);
    const bytes = fs.readFileSync(current);
    const framed = current.endsWith('.agent.md') ? normalizeAgentFrontmatter(bytes) : bytes;
    hash.update(`file\0${relative}\0`);
    hash.update(framed);
    hash.update('\0');
  }
  visit(absolutePath, '');
  return hash.digest('hex');
}

/**
 * Build the exact source/install inventory persisted for one pack.
 * @param {string} packDir
 * @param {string} packName
 * @param {{ type: string, location: string, ref: string }} source
 * @param {{ artifact: { kind: string, srcAbs: string, destRel: string, name: string }, stagedAbs: string }[]} staged
 * @returns {PackInventory}
 */
function buildPackInventory(packDir, packName, source, staged) {
  const manifestSha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(packDir, 'pack.md')))
    .digest('hex');
  const inventory = {
    version: PROFILE_INVENTORY_VERSION,
    pack: packName,
    source: { type: source.type, location: source.location, ref: source.ref },
    manifest_sha256: manifestSha,
    artifacts: staged.map(({ artifact, stagedAbs }) => ({
      path: artifact.destRel,
      kind: artifact.kind,
      source: `${artifact.kind}/${artifact.name}`,
      source_sha256: hashArtifact(artifact.srcAbs),
      installed_sha256: hashArtifact(stagedAbs),
    })),
    digest: '',
  };
  inventory.digest = inventoryDigest(inventory);
  return inventory;
}

/**
 * Reconcile a persisted inventory with its exact source when that source still
 * exists. A release without a local catalog relies on the persisted hashes.
 * @param {PackInventory} inventory
 * @param {string} packName
 */
function verifyAvailableInventorySource(inventory, packName) {
  const hasLegacyLooseArtifacts = inventory.artifacts.some(
    (artifact) => (artifact.kind === 'instructions' || artifact.kind === 'prompts')
      && !belongsToPack(artifact.path, packName),
  );
  let packDir = '';
  if (inventory.source.type === 'library' && isDir(inventory.source.location)) {
    packDir = path.join(inventory.source.location, packName);
  } else if (inventory.source.type === 'source') {
    if (isDir(inventory.source.location)) {
      packDir = path.join(inventory.source.location, 'library', 'packs', packName);
    } else if (hasLegacyLooseArtifacts) {
      const resolved = resolveSourceTree(inventory.source.location, inventory.source.ref, true);
      if ('error' in resolved) {
        throw new Error(`historical loose artifacts for pack "${packName}" require their exact inventory source: ${resolved.error}`);
      }
      packDir = path.join(resolved.tree, 'library', 'packs', packName);
    }
  }
  if (!packDir && hasLegacyLooseArtifacts) {
    throw new Error(`historical loose artifacts are not owned by the dude-pack-${packName}-* namespace and require their exact inventory source for removal`);
  }
  if (!packDir) {
    return;
  }
  if (!isDir(packDir) || !exists(path.join(packDir, 'pack.md'))) {
    if (hasLegacyLooseArtifacts) {
      throw new Error(`historical loose artifacts for pack "${packName}" require the exact inventory source at ${packDir}`);
    }
    throw new Error(`persisted inventory source no longer contains pack "${packName}" at ${packDir}`);
  }
  const manifestSha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(packDir, 'pack.md')))
    .digest('hex');
  if (manifestSha !== inventory.manifest_sha256) {
    throw new Error(`persisted inventory manifest for pack "${packName}" no longer matches its exact source`);
  }
  const currentArtifacts = packArtifacts(packDir);
  const inventoryByPath = new Map(inventory.artifacts.map((artifact) => [artifact.path, artifact]));
  if (currentArtifacts.length !== inventory.artifacts.length) {
    throw new Error(`persisted inventory for pack "${packName}" no longer matches its exact source artifact set`);
  }
  for (const artifact of currentArtifacts) {
    const record = inventoryByPath.get(artifact.destRel);
    if (!record
      || record.kind !== artifact.kind
      || record.source !== `${artifact.kind}/${artifact.name}`
      || record.source_sha256 !== hashArtifact(artifact.srcAbs)) {
      throw new Error(`persisted inventory for pack "${packName}" does not match source artifact '${artifact.destRel}'`);
    }
  }
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
/** @returns {boolean} */
function hasGit() {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

/**
 * Resolve a source tree for an upstream source + ref. Local-dir sources are
 * used in place; remote sources are shallow-cloned into a per-source cache and
 * reused across calls.
 * @param {string} source repo URL or local path
 * @param {string} ref
 * @param {boolean} [refresh]
 * @returns {{ tree: string } | { error: string }}
 */
function resolveSourceTree(source, ref, refresh = false) {
  if (isDir(source)) return { tree: source };
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
  if (!refresh && isDir(path.join(dest, '.git'))) return { tree: dest };
  removePath(dest);
  if (git(['clone', '--quiet', '--depth=1', '--branch', fetchRef, source, dest]) === 0) {
    return { tree: dest };
  }
  if (git(['clone', '--quiet', source, dest]) === 0 && git(['checkout', '--quiet', fetchRef], dest) === 0) {
    return { tree: dest };
  }
  removePath(dest);
  return { error: `failed to fetch source ${source} @ ${fetchRef}` };
}

/**
 * Resolve a pack's source directory. Prefers the local catalog, then falls back
 * to the bundle's configured upstream source (or an explicit override), so a
 * pack can be installed even when `library/packs/` is not vendored locally.
 * @param {{ root: string, library: string, name: string, fetch: boolean, source?: string, ref?: string, refreshSource?: boolean }} a
 * @returns {{ packDir: string, origin: string, sourceIdentity: { type: string, location: string, ref: string } } | { error: string }}
 */
function resolvePackDir({ root, library, name, fetch, source, ref, refreshSource = false }) {
  const localDir = path.join(library, name);
  if (isDir(localDir) && exists(path.join(localDir, 'pack.md'))) {
    return {
      packDir: localDir,
      origin: 'local',
      sourceIdentity: { type: 'library', location: fs.realpathSync(library), ref: '' },
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
  const tree = resolveSourceTree(src, sref, refreshSource);
  if ('error' in tree) return { error: tree.error };
  const fetchedDir = path.join(tree.tree, 'library', 'packs', name);
  if (isDir(fetchedDir) && exists(path.join(fetchedDir, 'pack.md'))) {
    return {
      packDir: fetchedDir,
      origin: isDir(src) ? `source ${src}` : `${src} @ ${sref}`,
      sourceIdentity: {
        type: 'source',
        location: isDir(src) ? fs.realpathSync(src) : src,
        ref: sref,
      },
    };
  }
  return { error: `pack "${name}" not found in source ${src}${isDir(src) ? '' : ` @ ${sref}`}` };
}

/**
 * Resolve the catalog directory to enumerate for `list`. Prefers a local
 * `library/packs/` when the repo vendors one; otherwise (a released core ships
 * no local catalog) falls back to the bundle's configured upstream source so
 * `list` can still show installable packs. Never throws: any fetch problem
 * degrades to the (usually empty) local view with the error surfaced as a note.
 * @param {{ root: string, library: string, fetch: boolean, source?: string, ref?: string }} a
 * @returns {{ dir: string, origin: string, error?: string }}
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
  if ('error' in tree) return { dir: library, origin: 'local', error: tree.error };
  const catalog = path.join(tree.tree, 'library', 'packs');
  if (isDir(catalog)) {
    return { dir: catalog, origin: isDir(src) ? `source ${src}` : `${src} @ ${sref}` };
  }
  return { dir: library, origin: 'local', error: `no pack catalog found in ${src}${isDir(src) ? '' : ` @ ${sref}`}` };
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

/* ----------------------------------------------------------------- commands */

/**
 * @param {{ kind: string, destRel: string, name: string }} artifact
 * @param {string} packName
 * @returns {boolean} true when a copied artifact carries the pack namespace.
 */
function artifactInNamespace(artifact, packName) {
  if (artifact.kind === 'agents' && !artifact.name.endsWith('.agent.md')) return false;
  if (artifact.kind === 'instructions' && !artifact.name.endsWith('.instructions.md')) return false;
  if (artifact.kind === 'prompts' && !artifact.name.endsWith('.prompt.md')) return false;
  return belongsToPack(artifact.destRel, packName);
}

/**
 * @param {{ root: string, library: string, name: string, force: boolean }} args
 * @returns {{ ok: boolean, code: number, result?: any, error?: string }}
 */
function cmdAdd({ root, library, name, force, fetch = true, source, ref }) {
  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }
  if (!PACK_NAME_RE.test(name)) {
    return { ok: false, code: 1, error: `invalid pack name: ${name}` };
  }

  const loadedProfile = loadProfile(root);
  if ('error' in loadedProfile) return { ok: false, code: 2, error: loadedProfile.error };
  const { profile } = loadedProfile;
  if (profile.enabled_packs.includes(name)) {
    return { ok: true, code: 0, result: { added: name, files: [], alreadyInstalled: true } };
  }

  const resolved = resolvePackDir({ root, library, name, fetch, source, ref });
  if ('error' in resolved) {
    return { ok: false, code: 2, error: resolved.error };
  }
  const { packDir, origin, sourceIdentity } = resolved;
  const manifestName = frontmatterName(fs.readFileSync(path.join(packDir, 'pack.md'), 'utf8'));
  if (manifestName && manifestName !== name) {
    return { ok: false, code: 2, error: `pack.md name "${manifestName}" does not match directory "${name}"` };
  }

  // Prefix-collision guard: pack names must not be hyphen-prefixes of one
  // another, because `remove` matches on the `dude-pack-<name>-` prefix.
  for (const other of profile.enabled_packs) {
    if (name.startsWith(`${other}-`) || other.startsWith(`${name}-`)) {
      return { ok: false, code: 2, error: `pack name "${name}" collides with installed pack "${other}" (hyphen-prefix)` };
    }
  }

  const artifacts = packArtifacts(packDir);
  if (artifacts.length === 0) {
    return { ok: false, code: 2, error: `pack "${name}" ships no installable artifacts` };
  }

  for (const artifact of artifacts) {
    if (!artifactInNamespace(artifact, name)) {
      return { ok: false, code: 2, error: `artifact "${artifact.destRel}" is outside the approved namespace and ownership rules for pack "${name}"` };
    }
  }

  const claimedBy = new Map();
  for (const [packName, entry] of Object.entries(profile.installed)) {
    for (const relPath of entry.files) claimedBy.set(relPath, packName);
  }

  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), `dude-compose-add-${name}-`));
  const backupRoot = path.join(stageRoot, 'backup');
  /** @type {{ artifact: { kind: string, srcAbs: string, destRel: string, name: string }, stagedAbs: string }[]} */
  const staged = [];
  /** @type {{ relPath: string, destination: string, backup: string | null }[]} */
  const applied = [];
  try {
    for (const artifact of artifacts) {
      const stagedAbs = path.join(stageRoot, 'install', ...artifact.destRel.split('/'));
      copyRecursive(artifact.srcAbs, stagedAbs);
      if (origin !== 'local') normalizePath(stagedAbs);
      staged.push({ artifact, stagedAbs });
    }

    const inventory = buildPackInventory(packDir, name, sourceIdentity, staged);
    const inventoryByPath = new Map(inventory.artifacts.map((artifact) => [artifact.path, artifact]));
    /** @type {string[]} */
    const conflicts = [];
    /** @type {{ relPath: string, destination: string, stagedAbs: string }[]} */
    const targets = [];
    for (const item of staged) {
      const { artifact, stagedAbs } = item;
      const owner = claimedBy.get(artifact.destRel);
      if (owner && owner !== name) {
        conflicts.push(`${artifact.destRel} (claimed by pack "${owner}")`);
        continue;
      }
      const destination = resolveProfileArtifact(root, artifact.destRel, name, inventoryByPath.get(artifact.destRel));
      if (exists(destination)
        && (!force || artifact.kind === 'instructions' || artifact.kind === 'prompts')) {
        conflicts.push(`${artifact.destRel} (already exists as a core, project, or foreign artifact)`);
      }
      targets.push({ relPath: artifact.destRel, destination, stagedAbs });
    }
    if (conflicts.length > 0) {
      return { ok: false, code: 2, error: `destination ownership conflict:\n  ${conflicts.join('\n  ')}` };
    }

    const files = artifacts.map((artifact) => artifact.destRel);
    const nextProfile = structuredClone(profile);
    nextProfile.enabled_packs.push(name);
    nextProfile.installed[name] = {
      files,
      installed_at: new Date().toISOString(),
      inventory,
    };
    const nextProfileBody = serializeProfile(root, nextProfile);
    const previousProfile = exists(profilePath(root)) ? fs.readFileSync(profilePath(root)) : null;

    try {
      for (const target of targets) {
        let backup = null;
        if (exists(target.destination)) {
          backup = path.join(backupRoot, ...target.relPath.split('/'));
          copyRecursive(target.destination, backup);
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
    removePath(stageRoot);
  }
}

/**
 * Whole-profile currency gate for removal. Removal reserializes the entire
 * profile, so every retained entry must already be a complete current
 * inventory and `enabled_packs` must carry no un-installed ghost; otherwise
 * serialization would silently normalize or drop unrelated legacy or partial
 * evidence. The parser preserves that evidence for `cmdStatus`, so this reads
 * the already-parsed profile without reparsing.
 * @param {Profile} profile
 * @returns {string | null} description of the first non-current evidence, or null
 */
function firstNonCurrentProfileEvidence(profile) {
  for (const packName of profile.enabled_packs) {
    if (!Object.hasOwn(profile.installed, packName)) {
      return `enabled pack "${packName}" is not installed`;
    }
  }
  for (const [packName, entry] of Object.entries(profile.installed)) {
    if (!entry.inventory) {
      return `pack "${packName}" lacks a complete current inventory`;
    }
  }
  return null;
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
  let profile = { enabled_packs: [], installed: {} };
  try {
    if (exists(currentProfilePath)) {
      authorizedProfileBytes = fs.readFileSync(currentProfilePath);
      profile = parseProfileDocument(authorizedProfileBytes, { root });
    }
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }

  const entry = profile.installed[name];
  const inventory = entry?.inventory;
  if (!entry || !inventory || !authorizedProfileBytes) {
    return { ok: false, code: 2, error: `pack "${name}" removal requires a complete current inventory` };
  }

  const nonCurrentEvidence = firstNonCurrentProfileEvidence(profile);
  if (nonCurrentEvidence) {
    return {
      ok: false,
      code: 2,
      error: `refusing to remove pack "${name}": the install profile is not fully current (${nonCurrentEvidence}); resolve it before removal so unrelated evidence is not rewritten`,
    };
  }

  const targets = entry.files.slice();
  const inventoryByPath = new Map(inventory.artifacts.map((artifact) => [artifact.path, artifact]));
  if (targets.length !== inventory.artifacts.length
    || targets.some((target) => !inventoryByPath.has(target))
    || inventory.artifacts.some((artifact) => !targets.includes(artifact.path))) {
    return { ok: false, code: 2, error: `pack "${name}" removal requires exact files and complete current inventory evidence` };
  }
  try {
    verifyAvailableInventorySource(inventory, name);
  } catch (error) {
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }

  /** @type {{ relPath: string, absolutePath: string }[]} */
  const resolvedTargets = [];
  for (const t of targets) {
    try {
      const abs = resolveProfileArtifact(root, t, name, inventoryByPath.get(t));
      const record = inventoryByPath.get(t);
      if (!exists(abs) || !record || hashArtifact(abs) !== record.installed_sha256) {
        return { ok: false, code: 2, error: `installed artifact '${t}' no longer matches pack "${name}" inventory; refusing deletion` };
      }
      resolvedTargets.push({ relPath: t, absolutePath: abs });
    } catch (error) {
      return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const nextProfile = structuredClone(profile);
  nextProfile.enabled_packs = nextProfile.enabled_packs.filter((packName) => packName !== name);
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
 * @param {{ root: string, library: string, fetch?: boolean, source?: string, ref?: string }} args
 * @returns {{ ok: boolean, code: number, result: any }}
 */
function cmdList({ root, library, fetch = true, source, ref }) {
  const loadedProfile = loadProfile(root);
  if ('error' in loadedProfile) return { ok: false, code: 2, error: loadedProfile.error };
  const { profile } = loadedProfile;
  const installedSet = new Set(profile.enabled_packs);
  const cat = resolveCatalogDir({ root, library, fetch, source, ref });
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
      ...(cat.error ? { note: cat.error } : {}),
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
      enabled_packs: [...profile.enabled_packs].sort(),
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
 * @returns {{ ok: boolean, code: number, result: any }}
 */
function cmdVerify({ root, library }) {
  const lintPath = fileURLToPath(new URL('../dude-lint/lint.mjs', import.meta.url));
  const profile = profileVerificationDiagnostic(root);
  const coreDirs = ['agents', 'skills', 'instructions', 'prompts'];
  const names = availablePacks(library);
  /** @type {{ name: string, warnings: number, failures: number, leftovers: number, error?: string }[]} */
  const verified = [];

  for (const name of names) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dude-verify-${name}-`));
    try {
      for (const d of coreDirs) {
        const srcAbs = path.join(root, '.github', d);
        if (isDir(srcAbs)) copyRecursive(srcAbs, path.join(tmp, '.github', d));
      }
      const metadataSource = path.join(root, ...WORKSPACE_PATHS.METADATA_DIR.split('/'));
      if (isDir(metadataSource)) {
        copyRecursive(metadataSource, path.join(tmp, ...WORKSPACE_PATHS.METADATA_DIR.split('/')));
      }
      const libSrc = path.join(root, 'library');
      if (isDir(libSrc)) copyRecursive(libSrc, path.join(tmp, 'library'));

      const add = cmdAdd({ root: tmp, library: path.join(tmp, 'library', 'packs'), name, force: false, fetch: false });
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
      for (const sub of coreDirs) {
        const subAbs = path.join(tmp, '.github', sub);
        if (!isDir(subAbs)) continue;
        for (const e of fs.readdirSync(subAbs)) {
          if (belongsToPack(rel(path.join('.github', sub, e)), name)) leftovers += 1;
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
  node compose.mjs verify               temp-install + lint every catalog pack

Flags:
  --root <dir>      bundle root (default: cwd)
  --library <dir>   pack catalog (default: <root>/library/packs)
  --source <repo>   upstream source for add/list (default: manifest)
  --ref <ref>       upstream ref for source resolution (default: manifest / main)
  --no-fetch        never fetch; require the pack in the local catalog
  --json            machine-readable output
  --force           overwrite existing files on add
`;

/**
 * @param {string[]} argv
 * @returns {{ cmd?: string, name?: string, root: string, library?: string, json: boolean, force: boolean, help: boolean }}
 */
function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), json: false, force: false, fetch: true, help: false };
  /** @type {string[]} */
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
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

function main() {
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
        r = cmdAdd({ root, library, name: args.name, force: args.force, fetch: args.fetch, source: args.source, ref: args.ref });
      }
      break;
    case 'remove':
      if (!args.name) {
        r = { ok: false, code: 1, error: 'remove requires a pack name' };
      } else {
        r = cmdRemove({ root, name: args.name });
      }
      break;
    case 'verify':
      r = cmdVerify({ root, library });
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
  main();
}

export {
  cmdAdd,
  cmdRemove,
  cmdList,
  cmdStatus,
  cmdVerify,
  readProfile,
  availablePacks,
  packArtifacts,
  resolvePackDir,
  resolveCatalogDir,
  readManifestSource,
  normalizeAgentFrontmatter,
  isMainModule,
};
