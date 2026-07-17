#!/usr/bin/env node
// @ts-check
/**
 * Engine for dude-bundle-upgrade (Node port of upgrade.sh / upgrade.ps1).
 *
 * Pulls the newest base bundle from upstream and overlays it onto this project,
 * replacing only core-owned engine files. Ownership is derived from the shared
 * namespace classifier in `dude-engine`, which recognizes three tiers:
 * core (`dude-<slug>`), pack (`dude-pack-<pack>-*`), and local (`dude-local-*`).
 * Pack and local files are preserved across a core upgrade.
 *
 * Subcommands: status | plan | apply | rollback | help
 *
 * Exit codes:
 *   0   no changes (up_to_date) or successful action
 *   10  plan ready, changes detected
 *   40  invalid input, malformed manifest, unreachable upstream, or post-apply lint failure
 *
 * Dependency-free beyond Node.js (>= 20) and git. Node is a documented
 * maintenance-time dependency.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enumerateCorePaths, classifyPath, TIER } from '../dude-engine/lib/ownership.mjs';
import { resolveReleaseRef, pickLatestReleaseTag } from '../dude-engine/lib/release-channel.mjs';
import {
  WORKSPACE_PATHS,
  resolveMutationPath,
} from '../dude-engine/lib/workspace-paths.mjs';

// Re-exported so existing importers (upgrade.test.mjs) keep a stable entry point.
export { pickLatestReleaseTag };

const ROOT = process.cwd();
const CACHE_ROOT = path.join(process.env.TMPDIR || '/tmp', 'dude-upgrade-cache');
const PLANS_DIR = path.join(CACHE_ROOT, 'plans');
const LOCAL_MANIFEST_PATH = path.join(ROOT, ...WORKSPACE_PATHS.BUNDLE_MANIFEST.split('/'));
const LINT_PATH = path.join(ROOT, '.github/skills/dude-lint/lint.mjs');
const DEFAULT_SOURCE = 'https://github.com/E-G-C/dude';
const DEFAULT_REF = 'main';
const PLAN_KIND = 'dude-upgrade-plan';
const PLAN_SCHEMA_VERSION = 1;
const PLAN_IDENTITY_SCOPE = 'same-host-filesystem';
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

// ----- logging (stderr) ------------------------------------------------------
const color = Boolean(process.stderr.isTTY);
const YEL = color ? '\u001b[33m' : '';
const RED = color ? '\u001b[31m' : '';
const GRN = color ? '\u001b[32m' : '';
const CYA = color ? '\u001b[36m' : '';
const RST = color ? '\u001b[0m' : '';
/** @param {string} m */
const logInfo = (m) => process.stderr.write(`${CYA}[upgrade]${RST} ${m}\n`);
/** @param {string} m */
const logWarn = (m) => process.stderr.write(`${YEL}[upgrade]${RST} ${m}\n`);
/** @param {string} m */
const logError = (m) => process.stderr.write(`${RED}[upgrade]${RST} ${m}\n`);
/** @param {string} m */
const logDebug = (m) => {
  if (process.env.UPGRADE_DEBUG) process.stderr.write(`[upgrade] ${m}\n`);
};
/** @param {string} s */
const out = (s) => process.stdout.write(s);

// ----- small fs/sha/date helpers --------------------------------------------
/** @param {string} p @returns {boolean} */
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
/** @param {string} p @returns {boolean} */
const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
/** @param {string} p @returns {boolean} */
const exists = (p) => {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
};
/** @param {string} p @returns {string} */
const read = (p) => fs.readFileSync(p, 'utf8');
/** @param {string} s @returns {string} */
const shortSha = (s) => String(s).slice(0, 12);
/** @param {string} r @returns {string} filesystem-safe form of a git ref */
const sanitizeRef = (r) => String(r).replace(/[^A-Za-z0-9._-]/g, '_') || 'none';

/** @returns {string} ISO-8601 UTC with no milliseconds. */
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
/** @param {string} iso @param {number} secs @returns {string} */
const isoAddSeconds = (iso, secs) =>
  new Date(Date.parse(iso) + secs * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
/** @returns {string} compact UTC stamp YYYYMMDD-HHMMSS */
function stampNow() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}` +
    `-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`
  );
}
/** @param {string} iso @returns {number | null} epoch seconds or null */
function isoToEpoch(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const canonical = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return canonical === iso ? Math.floor(t / 1000) : null;
}
/** @param {string} a @param {string} b @returns {number} */
const codeUnitCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** @param {string | Buffer} bytes @returns {string} */
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
/** @param {string} absolutePath @param {boolean} [bigint] */
function lstatOrNull(absolutePath, bigint = false) {
  try {
    return bigint
      ? fs.lstatSync(absolutePath, { bigint: true })
      : fs.lstatSync(absolutePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}
/** @param {string} absolutePath */
function directoryIdentity(absolutePath) {
  const stat = lstatOrNull(absolutePath, true);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`expected a real directory: ${absolutePath}`);
  }
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
  };
}
/** @param {string} root @param {string} relativePath */
function snapshotExpectedState(root, relativePath) {
  const absolutePath = resolveMutationPath(root, relativePath);
  const stat = lstatOrNull(absolutePath, true);
  if (!stat) return { type: 'missing' };
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`expected regular file at ${relativePath}`);
  }
  return {
    type: 'file',
    sha256: sha256(fs.readFileSync(absolutePath)),
  };
}

/**
 * Enumerate core files while refusing namespace candidates hidden from the
 * regular-file enumerator by a symlink or incompatible file type.
 * @param {string} root
 * @param {string} label
 * @returns {string[]}
 */
function scanCoreInventoryPaths(root, label) {
  /** @type {string[]} */
  const results = [];
  /** @param {string} relativePath */
  const safeLstat = (relativePath) => {
    const stat = lstatOrNull(path.join(root, ...relativePath.split('/')));
    if (stat?.isSymbolicLink()) throw new Error(`${label} contains symbolic link: ${relativePath}`);
    return stat;
  };
  /** @param {string} relativePath */
  const requireDirectory = (relativePath) => {
    const stat = safeLstat(relativePath);
    if (!stat) return false;
    if (!stat.isDirectory()) throw new Error(`${label} type changed: ${relativePath}`);
    return true;
  };
  /** @param {string} relativeDirectory */
  const walkSkill = (relativeDirectory) => {
    const absoluteDirectory = path.join(root, ...relativeDirectory.split('/'));
    for (const name of fs.readdirSync(absoluteDirectory).sort(codeUnitCompare)) {
      const relativePath = `${relativeDirectory}/${name}`;
      const stat = safeLstat(relativePath);
      if (!stat) continue;
      if (stat.isDirectory()) walkSkill(relativePath);
      else if (stat.isFile()) results.push(relativePath);
      else throw new Error(`${label} type changed: ${relativePath}`);
    }
  };

  if (requireDirectory('.github/agents')) {
    for (const name of fs.readdirSync(path.join(root, '.github/agents')).sort(codeUnitCompare)) {
      const relativePath = `.github/agents/${name}`;
      if (!name.endsWith('.agent.md') || classifyPath(relativePath) !== TIER.CORE) continue;
      const stat = safeLstat(relativePath);
      if (!stat?.isFile()) throw new Error(`${label} type changed: ${relativePath}`);
      results.push(relativePath);
    }
  }

  const instructionsPath = '.github/instructions/dude.instructions.md';
  const instructionsStat = safeLstat(instructionsPath);
  if (instructionsStat) {
    if (!instructionsStat.isFile()) throw new Error(`${label} type changed: ${instructionsPath}`);
    results.push(instructionsPath);
  }

  if (requireDirectory('.github/skills')) {
    for (const name of fs.readdirSync(path.join(root, '.github/skills')).sort(codeUnitCompare)) {
      const relativeDirectory = `.github/skills/${name}`;
      if (classifyPath(`${relativeDirectory}/`) !== TIER.CORE) continue;
      const stat = safeLstat(relativeDirectory);
      if (!stat?.isDirectory()) throw new Error(`${label} type changed: ${relativeDirectory}`);
      walkSkill(relativeDirectory);
    }
  }

  return results.sort(codeUnitCompare);
}

/** @param {string} root @param {string} label */
function snapshotCoreInventory(root, label) {
  return scanCoreInventoryPaths(root, label).map((relativePath) => {
    const state = snapshotExpectedState(root, relativePath);
    if (state.type !== 'file') throw new Error(`${label} path disappeared: ${relativePath}`);
    return { path: relativePath, type: 'file', sha256: state.sha256 };
  });
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} state */
function projectExpectedState(state) {
  if (!isRecord(state)) return state;
  if (state.type === 'missing') return { type: state.type };
  return {
    type: state.type,
    sha256: state.sha256,
  };
}

/** @param {unknown} value @param {(entry: Record<string, any>) => object} mapEntry */
function projectArray(value, mapEntry) {
  return Array.isArray(value)
    ? value.map((entry) => (isRecord(entry) ? mapEntry(entry) : entry))
    : value;
}

/**
 * Reconstruct the exact schema-v1 digest projection in canonical key order.
 * Unknown fields are excluded here and rejected by strict apply validation.
 * @param {Record<string, any>} plan
 */
export function canonicalPlanProjection(plan) {
  return {
    kind: plan.kind,
    schema_version: plan.schema_version,
    plan_id: plan.plan_id,
    created_at: plan.created_at,
    ttl_warn_at: plan.ttl_warn_at,
    ttl_expire_at: plan.ttl_expire_at,
    scope: isRecord(plan.scope) ? {
      identity_scope: plan.scope.identity_scope,
      workspace_path: plan.scope.workspace_path,
      workspace_realpath: plan.scope.workspace_realpath,
      workspace_identity: isRecord(plan.scope.workspace_identity) ? {
        device: plan.scope.workspace_identity.device,
        inode: plan.scope.workspace_identity.inode,
      } : plan.scope.workspace_identity,
    } : plan.scope,
    source: isRecord(plan.source) ? {
      type: plan.source.type,
      location: plan.source.location,
      identity: plan.source.identity,
      requested_ref: plan.source.requested_ref,
      resolved_ref: plan.source.resolved_ref,
      resolved_commit: plan.source.resolved_commit,
    } : plan.source,
    from_ref: plan.from_ref,
    to_ref: plan.to_ref,
    cache: isRecord(plan.cache) ? {
      root_path: plan.cache.root_path,
      root_realpath: plan.cache.root_realpath,
      root_identity: isRecord(plan.cache.root_identity) ? {
        device: plan.cache.root_identity.device,
        inode: plan.cache.root_identity.inode,
      } : plan.cache.root_identity,
      manifest: isRecord(plan.cache.manifest) ? {
        path: plan.cache.manifest.path,
        type: plan.cache.manifest.type,
        sha256: plan.cache.manifest.sha256,
      } : plan.cache.manifest,
      inventory: projectArray(plan.cache.inventory, (entry) => ({
        path: entry.path,
        type: entry.type,
        sha256: entry.sha256,
      })),
    } : plan.cache,
    local: isRecord(plan.local) ? {
      manifest: isRecord(plan.local.manifest) ? {
        path: plan.local.manifest.path,
        state: projectExpectedState(plan.local.manifest.state),
        data: isRecord(plan.local.manifest.data) ? {
          source_repo: plan.local.manifest.data.source_repo,
          source_ref: plan.local.manifest.data.source_ref,
          installed_ref: plan.local.manifest.data.installed_ref,
        } : plan.local.manifest.data,
      } : plan.local.manifest,
      upgrade_log: isRecord(plan.local.upgrade_log) ? {
        path: plan.local.upgrade_log.path,
        state: projectExpectedState(plan.local.upgrade_log.state),
      } : plan.local.upgrade_log,
      core_inventory: projectArray(plan.local.core_inventory, (entry) => ({
        path: entry.path,
        state: projectExpectedState(entry.state),
      })),
    } : plan.local,
    summary: isRecord(plan.summary) ? {
      replace: plan.summary.replace,
      add: plan.summary.add,
      remove: plan.summary.remove,
      advisory: plan.summary.advisory,
      up_to_date: plan.summary.up_to_date,
    } : plan.summary,
    buckets: isRecord(plan.buckets) ? {
      replace: projectArray(plan.buckets.replace, (entry) => ({
        path: entry.path,
        added_lines: entry.added_lines,
        removed_lines: entry.removed_lines,
      })),
      add: projectArray(plan.buckets.add, (entry) => ({ path: entry.path })),
      remove: projectArray(plan.buckets.remove, (entry) => ({ path: entry.path })),
      advisory: projectArray(plan.buckets.advisory, (entry) => ({
        path: entry.path,
        kind: entry.kind,
      })),
      up_to_date: projectArray(plan.buckets.up_to_date, (entry) => ({ path: entry.path })),
    } : plan.buckets,
  };
}

/** @param {Record<string, any>} plan @returns {string} */
export function planDigest(plan) {
  return sha256(JSON.stringify(canonicalPlanProjection(plan)));
}

/** @param {Record<string, any>} plan @returns {string} */
function serializeUpgradePlan(plan) {
  return `${JSON.stringify({ ...canonicalPlanProjection(plan), digest: plan.digest }, null, 2)}\n`;
}

/**
 * Run git in ROOT (or a given cwd).
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function git(args, cwd = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
/** @returns {boolean} */
const hasGit = () => spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

/** @param {string} hooksPath @param {string[]} args @param {string} [cwd] */
function gitWithoutHooks(hooksPath, args, cwd = ROOT) {
  return git(['-c', `core.hooksPath=${hooksPath}`, ...args], cwd);
}

/**
 * Find the required canonical manifest in an upstream tree.
 * @param {string} root
 * @returns {string | null}
 */
export function findUpstreamManifestPath(root) {
  const canonical = path.join(root, ...WORKSPACE_PATHS.BUNDLE_MANIFEST.split('/'));
  try {
    if (fs.lstatSync(canonical).isFile()) return canonical;
  } catch {
    // missing or not readable
  }
  return null;
}

/** @returns {string} */
function localManifestError() {
  return `canonical bundle manifest missing or malformed at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}; install or copy a current bundle engine and metadata, or reinstall the current bundle while preserving project data`;
}

// ----- manifest parsing ------------------------------------------------------
/** @param {string} content @returns {string | null} the fenced ```json block body */
function extractManifestJson(content) {
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(content);
  return m ? m[1] : null;
}
/** @param {string} jsonText @returns {Record<string, unknown> | null} */
function parseManifest(jsonText) {
  try {
    const o = JSON.parse(jsonText);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}
/**
 * @param {Record<string, unknown> | null} obj
 * @param {string} label
 * @returns {string[]} error messages (empty when valid)
 */
function validateMetadataManifest(obj, label) {
  /** @type {string[]} */
  const errors = [];
  if (!obj) return [`${label} JSON is malformed`];
  for (const key of Object.keys(obj)) {
    if (!['source_repo', 'source_ref', 'installed_ref'].includes(key)) {
      errors.push(`${label} has unsupported field '${key}'`);
    }
  }
  if (!obj.source_repo) errors.push(`${label} is missing source_repo`);
  if (!obj.source_ref) errors.push(`${label} is missing source_ref`);
  // installed_ref is optional (empty on a fresh install) but, when present,
  // must be a string — a version tag or a branch/ref name, never a raw sha.
  if (obj.installed_ref !== undefined && typeof obj.installed_ref !== 'string') {
    errors.push(`${label} installed_ref must be a string`);
  }
  return errors;
}

const local = {
  json: /** @type {Record<string, unknown> | null} */ (null),
  source_repo: '',
  source_ref: '',
  installed_ref: '',
};
/** @returns {boolean} true on success */
function loadLocalManifest() {
  if (!isFile(LOCAL_MANIFEST_PATH)) return false;
  const body = extractManifestJson(read(LOCAL_MANIFEST_PATH));
  if (!body) return false;
  const obj = parseManifest(body);
  if (!obj) return false;
  if (validateMetadataManifest(obj, 'local manifest').length) return false;
  local.json = obj;
  local.source_repo = String(obj.source_repo || '');
  local.source_ref = String(obj.source_ref || '');
  local.installed_ref = String(obj.installed_ref || '');
  return true;
}

// ----- upstream resolution ---------------------------------------------------
const upstream = { source: '', ref: '', resolvedRef: '', channel: false };
/** @param {string} srcOverride @param {string} refOverride */
function resolveUpstream(srcOverride, refOverride) {
  upstream.source = srcOverride || local.source_repo || DEFAULT_SOURCE;
  upstream.ref = refOverride || local.source_ref || DEFAULT_REF;
  const r = resolveReleaseRef(upstream.source, upstream.ref);
  upstream.channel = r.channel;
  upstream.resolvedRef = r.resolvedRef;
}
/** @returns {string} human display of the ref (channel shows the resolved tag) */
function refDisplay() {
  return upstream.channel && upstream.resolvedRef
    ? `${upstream.ref} (${upstream.resolvedRef})`
    : upstream.ref;
}
/** @param {string} url @returns {string} owner/repo or '' */
function githubOwnerRepo(url) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/.exec(url.replace(/\.git$/, ''));
  return m ? `${m[1]}/${m[2]}` : '';
}

/**
 * Fetch only the canonical upstream bundle-manifest.md.
 * @returns {Promise<{ path: string | null, error: string }>}
 */
async function fetchUpstreamManifestOnly() {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(CACHE_ROOT, 'manifest-'));
  const outFile = path.join(outDir, 'bundle-manifest.md');

  if (isDir(upstream.source)) {
    const lm = findUpstreamManifestPath(upstream.source);
    if (lm && isFile(lm)) {
      fs.copyFileSync(lm, outFile);
      return { path: outFile, error: '' };
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    return {
      path: null,
      error: `local upstream source is missing required canonical metadata at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}; old-path manifests are not accepted`,
    };
  }

  const ownerRepo = githubOwnerRepo(upstream.source);
  let rawMissing = false;
  if (ownerRepo) {
    const rawUrl = `https://raw.githubusercontent.com/${ownerRepo}/${upstream.resolvedRef}/${WORKSPACE_PATHS.BUNDLE_MANIFEST}`;
    logDebug(`fetching upstream manifest via raw url: ${rawUrl}`);
    try {
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        fs.writeFileSync(outFile, await res.text());
        return { path: outFile, error: '' };
      }
      rawMissing = res.status === 404;
    } catch {
      /* fall back to clone */
    }
  }

  if (hasGit()) {
    const cloneDir = path.join(outDir, 'clone');
    logDebug(`shallow-cloning upstream for manifest only: ${upstream.source} @ ${upstream.resolvedRef}`);
    let r = git(['clone', '--quiet', '--depth=1', '--branch', upstream.resolvedRef, upstream.source, cloneDir]);
    if (r.status !== 0) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      r = git(['clone', '--quiet', upstream.source, cloneDir]);
      if (r.status === 0) r = git(['checkout', '--quiet', upstream.resolvedRef], cloneDir);
    }
    const lm = findUpstreamManifestPath(cloneDir);
    if (r.status === 0 && lm && isFile(lm)) {
      fs.copyFileSync(lm, outFile);
      return { path: outFile, error: '' };
    }
    if (r.status === 0) {
      fs.rmSync(outDir, { recursive: true, force: true });
      return {
        path: null,
        error: `fetched upstream tree is missing required canonical metadata at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}; old-path manifests are not accepted`,
      };
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  return {
    path: null,
    error: rawMissing
      ? `upstream ref is missing required canonical metadata at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}`
      : '',
  };
}

/**
 * Fetch the full upstream tree. Returns the tree root path or null.
 * @returns {string | null}
 */
function fetchUpstreamTree() {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });

  if (isDir(upstream.source)) {
    if (!findUpstreamManifestPath(upstream.source)) {
      logError(`local upstream source is missing required canonical metadata at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}; old-path manifests are not accepted`);
      return null;
    }
    return upstream.source;
  }

  if (!hasGit()) {
    logError('git is required to fetch upstream tree');
    return null;
  }

  const key = crypto
    .createHash('sha256')
    .update(`${upstream.source}|${upstream.resolvedRef}`)
    .digest('hex')
    .slice(0, 12);
  const dest = path.join(CACHE_ROOT, `upstream-${key}`);

  if (isDir(path.join(dest, '.git'))) {
    if (findUpstreamManifestPath(dest)) return dest;
    fs.rmSync(dest, { recursive: true, force: true });
  }

  fs.rmSync(dest, { recursive: true, force: true });
  logInfo(`fetching upstream tree: ${upstream.source} @ ${refDisplay()}`);
  if (git(['clone', '--quiet', '--depth=1', '--branch', upstream.resolvedRef, upstream.source, dest]).status === 0) {
    if (findUpstreamManifestPath(dest)) return dest;
    fs.rmSync(dest, { recursive: true, force: true });
    logError(`fetched upstream tree is missing required canonical metadata at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}`);
    return null;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  if (git(['clone', '--quiet', upstream.source, dest]).status === 0) {
    if (git(['checkout', '--quiet', upstream.resolvedRef], dest).status === 0) {
      if (findUpstreamManifestPath(dest)) return dest;
      fs.rmSync(dest, { recursive: true, force: true });
      logError(`fetched upstream tree is missing required canonical metadata at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}`);
      return null;
    }
  }
  fs.rmSync(dest, { recursive: true, force: true });
  logError(`failed to fetch upstream from ${upstream.source} @ ${refDisplay()}`);
  return null;
}

// ----- classification --------------------------------------------------------
/**
 * LCS length of two line arrays (rolling DP).
 * @param {string[]} a @param {string[]} b @returns {number}
 */
function lcsLen(a, b) {
  const n = a.length;
  const m = b.length;
  let prev = new Int32Array(m + 1);
  let curr = new Int32Array(m + 1);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1;
      else curr[j] = prev[j] >= curr[j - 1] ? prev[j] : curr[j - 1];
    }
    const t = prev;
    prev = curr;
    curr = t;
  }
  return prev[m];
}
/**
 * Added/removed line counts, matching `diff -u <local> <upstream>` +/- totals.
 * @param {string} localFile @param {string} upstreamFile
 * @returns {{ added: number, removed: number }}
 */
function diffPlusMinus(localFile, upstreamFile) {
  if (!isFile(localFile) || !isFile(upstreamFile)) return { added: 0, removed: 0 };
  return diffPlusMinusBytes(fs.readFileSync(localFile), fs.readFileSync(upstreamFile));
}
/** @param {Buffer} localBytes @param {Buffer} upstreamBytes */
function diffPlusMinusBytes(localBytes, upstreamBytes) {
  const a = localBytes.toString('utf8').split('\n');
  const b = upstreamBytes.toString('utf8').split('\n');
  const l = lcsLen(a, b);
  return { added: b.length - l, removed: a.length - l };
}
/** @param {string} a @param {string} b @returns {boolean} byte-equal */
function filesEqual(a, b) {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

/**
 * @typedef {Object} Plan
 * @property {{path: string, added_lines: number, removed_lines: number}[]} replace
 * @property {{path: string}[]} add
 * @property {{path: string}[]} remove
 * @property {{path: string, kind: string}[]} advisory
 * @property {number} upToDate
 * @property {{path: string}[]} upToDatePaths
 */

/**
 * Classify every core-owned file into replace/add/remove + advisories.
 * @param {string} utree upstream tree root
 * @param {string} [root] local repo root (defaults to the process cwd)
 * @returns {Plan}
 */
export function classifyPlan(utree, root = ROOT) {
  // Observable seam (debug-gated, non-behavioral): apply consumes the persisted
  // buckets directly and must never re-derive a plan here. The apply-time
  // regression asserts this marker is absent when UPGRADE_DEBUG is set.
  logDebug('classifyPlan: classifying upstream core tree against local workspace');
  const localPaths = enumerateCorePaths(root);
  const localSet = new Set(localPaths);
  const upstreamPaths = enumerateCorePaths(utree);
  const upstreamSet = new Set(upstreamPaths);

  /** @type {Plan} */
  const plan = { replace: [], add: [], remove: [], advisory: [], upToDate: 0, upToDatePaths: [] };

  for (const p of upstreamPaths) {
    const localDisk = path.join(root, p);
    const upstreamFile = path.join(utree, p);
    if (!localSet.has(p)) {
      plan.add.push({ path: p });
      continue;
    }
    if (!isFile(localDisk)) {
      plan.replace.push({ path: p, added_lines: 0, removed_lines: 0 });
      continue;
    }
    if (filesEqual(localDisk, upstreamFile)) {
      plan.upToDate += 1;
      plan.upToDatePaths.push({ path: p });
    } else {
      const { added, removed } = diffPlusMinus(localDisk, upstreamFile);
      plan.replace.push({ path: p, added_lines: added, removed_lines: removed });
    }
  }

  for (const p of localPaths) {
    if (!upstreamSet.has(p)) plan.remove.push({ path: p });
  }

  // Advisories: project-tier agents/skills outside core/pack/local namespaces.
  const agentsDir = path.join(root, '.github/agents');
  if (isDir(agentsDir)) {
    for (const e of fs.readdirSync(agentsDir, { withFileTypes: true }).sort((a, b) => codeUnitCompare(a.name, b.name))) {
      if (!e.isFile() || !e.name.endsWith('.agent.md')) continue;
      if (e.name === 'dude.agent.md') continue;
      const rel = `.github/agents/${e.name}`;
      if (classifyPath(rel) === TIER.PROJECT) {
        plan.advisory.push({ path: rel, kind: 'unreserved_local_agent' });
      }
    }
  }
  const skillsDir = path.join(root, '.github/skills');
  if (isDir(skillsDir)) {
    for (const e of fs.readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => codeUnitCompare(a.name, b.name))) {
      if (!e.isDirectory() || e.name === 'project') continue;
      if (classifyPath(`.github/skills/${e.name}/`) !== TIER.PROJECT) continue;
      const skillMd = path.join(skillsDir, e.name, 'SKILL.md');
      if (!isFile(skillMd)) continue;
      plan.advisory.push({ path: `.github/skills/${e.name}/SKILL.md`, kind: 'unreserved_local_skill' });
    }
  }

  for (const bucket of [plan.replace, plan.add, plan.remove, plan.advisory, plan.upToDatePaths]) {
    bucket.sort((a, b) => codeUnitCompare(a.path, b.path));
  }

  return plan;
}

// ----- emitters --------------------------------------------------------------
/**
 * @param {string} kind @param {string} upstreamRef @param {string} detail
 */
function emitStatusText(kind, upstreamRef, detail) {
  let head;
  if (kind === 'up_to_date') head = `${GRN}up to date${RST}`;
  else if (kind === 'upgrade_available') head = `${YEL}upgrade available${RST}`;
  else if (kind === 'offline') head = `${YEL}upgrade status unavailable (${detail})${RST}`;
  else head = `${RED}error (${detail})${RST}`;
  out(`Bundle: ${head}\n`);
  out(`  Source:    ${upstream.source} @ ${refDisplay()}\n`);
  out(`  Installed: ${local.installed_ref || '(none)'}\n`);
  if ((kind === 'upgrade_available' || kind === 'up_to_date') && upstreamRef) {
    out(`  Latest:    ${upstreamRef}\n`);
  }
  if (kind === 'upgrade_available') out('  Next:      @dude upgrade --dry-run\n');
}
/**
 * @param {string} kind @param {string} upstreamRef @param {string} detail
 */
function emitStatusJson(kind, upstreamRef, detail) {
  out(
    `${JSON.stringify(
      {
        status: kind,
        source: upstream.source,
        ref: upstream.ref,
        installed_ref: local.installed_ref,
        upstream_ref: upstreamRef,
        detail,
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * @param {Plan} plan @param {string} planId @param {string} fromRef
 * @param {string} toRef @param {string} cacheDir @param {boolean} metadataChange
 */
function emitPlanText(plan, planId, fromRef, toRef, cacheDir, metadataChange) {
  out(`Upgrade report: ${fromRef || '(none)'} -> ${toRef}\n`);
  out(`Source: ${upstream.source} @ ${refDisplay()}\n`);
  out(`Plan ID: ${planId}\n`);
  out(`Cache: ${cacheDir}\n\n`);

  /** @param {string} label @param {string[]} rows @param {number} count */
  const list = (label, rows, count) => {
    out(`${label} (${count}):\n`);
    if (count === 0) out('  (none)\n');
    else for (const r of rows) out(`  ${r}\n`);
    out('\n');
  };
  list(
    'Will replace (overwrite)',
    plan.replace.map((r) => `${r.path}  [+${r.added_lines} / -${r.removed_lines}]`),
    plan.replace.length,
  );
  list('Will add', plan.add.map((r) => r.path), plan.add.length);
  list('Will remove', plan.remove.map((r) => r.path), plan.remove.length);
  list('Advisories', plan.advisory.map((r) => `${r.path}  (${r.kind})`), plan.advisory.length);
  out(`Up to date: ${plan.upToDate}\n`);

  const total = plan.replace.length + plan.add.length + plan.remove.length;
  if (total === 0 && !metadataChange) {
    out(`\n${GRN}Already up to date.${RST} Nothing to apply.\n`);
  } else {
    out(`\n${GRN}Ready to apply.${RST} Reply "confirm upgrade" to proceed.\n`);
    if (plan.replace.length > 0 || plan.remove.length > 0) {
      out(`${YEL}Note:${RST} any local edits to files in the Replace or Remove list will be\n`);
      out('discarded. Base files are upstream-owned; copy them under .github/agents/dude-local-<slug>.agent.md\n');
      out('or .github/skills/dude-local-<slug>/ before upgrading if you need to keep edits.\n');
    }
  }
}

/** @param {string} cacheRoot */
function snapshotSource(cacheRoot) {
  const head = git(['rev-parse', 'HEAD^{commit}'], cacheRoot);
  const resolved = git(['rev-parse', `${upstream.resolvedRef}^{commit}`], cacheRoot);
  const resolvedCommit = head.stdout.trim().toLowerCase();
  if (head.status !== 0 || !COMMIT_PATTERN.test(resolvedCommit)) {
    throw new Error('upstream cache does not have a concrete git commit');
  }
  if (resolved.status !== 0 || resolved.stdout.trim().toLowerCase() !== resolvedCommit) {
    throw new Error(`upstream cache HEAD does not match resolved ref ${upstream.resolvedRef}`);
  }
  if (git(['status', '--porcelain=v1', '--untracked-files=all'], cacheRoot).stdout.trim()) {
    throw new Error('upstream source working tree must be clean before planning');
  }
  if (isDir(upstream.source)) {
    return {
      type: 'local-path',
      location: upstream.source,
      identity: fs.realpathSync(upstream.source),
      requested_ref: upstream.ref,
      resolved_ref: upstream.resolvedRef,
      resolved_commit: resolvedCommit,
    };
  }
  const origin = git(['config', '--get', 'remote.origin.url'], cacheRoot);
  if (origin.status !== 0 || !origin.stdout.trim()) {
    throw new Error('upstream cache is missing its source identity');
  }
  return {
    type: 'git-remote',
    location: upstream.source,
    identity: origin.stdout.trim(),
    requested_ref: upstream.ref,
    resolved_ref: upstream.resolvedRef,
    resolved_commit: resolvedCommit,
  };
}

/**
 * @param {Plan} classified
 * @param {{plan_id: string, from_ref: string, to_ref: string, cache_dir: string, created_at: string, ttl_warn: string, ttl_expire: string}} meta
 */
function buildUpgradePlan(classified, meta) {
  const workspacePath = path.resolve(ROOT);
  const cacheRoot = path.resolve(meta.cache_dir);
  const cacheInventory = snapshotCoreInventory(cacheRoot, 'upstream cache');
  const cacheManifestPath = resolveMutationPath(cacheRoot, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  const cacheManifestStat = lstatOrNull(cacheManifestPath);
  if (!cacheManifestStat?.isFile() || cacheManifestStat.isSymbolicLink()) {
    throw new Error(`upstream cache manifest is not a regular file at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}`);
  }
  const cacheManifestBytes = fs.readFileSync(cacheManifestPath);
  const localManifestState = snapshotExpectedState(ROOT, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  const upgradeLogState = snapshotExpectedState(ROOT, WORKSPACE_PATHS.UPGRADE_LOG);
  const localPaths = [
    ...classified.replace.map((entry) => entry.path),
    ...classified.add.map((entry) => entry.path),
    ...classified.remove.map((entry) => entry.path),
    ...classified.upToDatePaths.map((entry) => entry.path),
  ].sort(codeUnitCompare);
  const addPaths = new Set(classified.add.map((entry) => entry.path));
  const localCoreInventory = localPaths.map((relativePath) => ({
    path: relativePath,
    state: addPaths.has(relativePath)
      ? { type: 'missing' }
      : snapshotExpectedState(ROOT, relativePath),
  }));
  const plan = {
    kind: PLAN_KIND,
    schema_version: PLAN_SCHEMA_VERSION,
    plan_id: meta.plan_id,
    created_at: meta.created_at,
    ttl_warn_at: meta.ttl_warn,
    ttl_expire_at: meta.ttl_expire,
    scope: {
      identity_scope: PLAN_IDENTITY_SCOPE,
      workspace_path: workspacePath,
      workspace_realpath: fs.realpathSync(workspacePath),
      workspace_identity: directoryIdentity(workspacePath),
    },
    source: snapshotSource(cacheRoot),
    from_ref: meta.from_ref,
    to_ref: meta.to_ref,
    cache: {
      root_path: cacheRoot,
      root_realpath: fs.realpathSync(cacheRoot),
      root_identity: directoryIdentity(cacheRoot),
      manifest: {
        path: WORKSPACE_PATHS.BUNDLE_MANIFEST,
        type: 'file',
        sha256: sha256(cacheManifestBytes),
      },
      inventory: cacheInventory,
    },
    local: {
      manifest: {
        path: WORKSPACE_PATHS.BUNDLE_MANIFEST,
        state: localManifestState,
        data: {
          source_repo: local.source_repo,
          source_ref: local.source_ref,
          installed_ref: local.installed_ref,
        },
      },
      upgrade_log: {
        path: WORKSPACE_PATHS.UPGRADE_LOG,
        state: upgradeLogState,
      },
      core_inventory: localCoreInventory,
    },
    summary: {
      replace: classified.replace.length,
      add: classified.add.length,
      remove: classified.remove.length,
      advisory: classified.advisory.length,
      up_to_date: classified.upToDatePaths.length,
    },
    buckets: {
      replace: classified.replace,
      add: classified.add,
      remove: classified.remove,
      advisory: classified.advisory,
      up_to_date: classified.upToDatePaths,
    },
    digest: '',
  };
  plan.digest = planDigest(plan);
  return plan;
}

/** @param {Record<string, any>} plan @returns {string} */
function buildPlanJson(plan) {
  return serializeUpgradePlan(plan);
}

/**
 * Persist a plan under a collision-resistant ID without ever replacing bytes.
 * @param {{
 *   plansDir: string,
 *   baseId: string,
 *   suffixFactory?: () => string,
 *   maxAttempts?: number,
 *   buildBytes: (planId: string) => string | Buffer,
 * }} options
 */
export function persistUniquePlan(options) {
  const {
    plansDir,
    baseId,
    suffixFactory = () => crypto.randomBytes(12).toString('hex'),
    maxAttempts = 8,
    buildBytes,
  } = options;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('plan persistence requires at least one allocation attempt');
  }
  fs.mkdirSync(plansDir, { recursive: true });
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const suffix = suffixFactory();
    if (!/^[A-Za-z0-9._-]+$/.test(suffix)) throw new Error('plan ID suffix is invalid');
    const planId = `${baseId}-${suffix}`;
    const planPath = path.join(plansDir, `${planId}.json`);
    const bytes = buildBytes(planId);
    let descriptor;
    try {
      descriptor = fs.openSync(planPath, 'wx', 0o600);
      fs.writeFileSync(descriptor, bytes);
      fs.closeSync(descriptor);
      descriptor = undefined;
      return { planId, planPath };
    } catch (writeError) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {
          // Preserve the original persistence error.
        }
        fs.rmSync(planPath, { force: true });
      }
      if (writeError && typeof writeError === 'object' && 'code' in writeError && writeError.code === 'EEXIST') {
        continue;
      }
      throw writeError;
    }
  }
  throw new Error(`could not allocate a unique upgrade plan after ${maxAttempts} attempts`);
}

/** @param {boolean} condition @param {string} detail */
function requirePlanSchema(condition, detail) {
  if (!condition) throw new Error(`plan schema is invalid: ${detail}; re-run 'plan'`);
}

/** @param {Record<string, any>} value @param {string[]} keys @param {string} label */
function requireExactKeys(value, keys, label) {
  requirePlanSchema(isRecord(value), `${label} must be an object`);
  const actual = Object.keys(value).sort(codeUnitCompare);
  const expected = [...keys].sort(codeUnitCompare);
  requirePlanSchema(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} fields must be exactly ${keys.join(', ')}`,
  );
}

/** @param {unknown} value @param {string} label @param {boolean} [allowEmpty] */
function requireString(value, label, allowEmpty = false) {
  requirePlanSchema(typeof value === 'string' && (allowEmpty || value.length > 0), `${label} must be a string`);
}

/** @param {unknown} value @param {string} label */
function requireCount(value, label) {
  requirePlanSchema(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
}

/** @param {Record<string, any>} identity @param {string} label @param {boolean} [file] */
function validateIdentityShape(identity, label) {
  requireExactKeys(identity, ['device', 'inode'], label);
  for (const key of ['device', 'inode']) {
    requirePlanSchema(typeof identity[key] === 'string' && /^\d+$/.test(identity[key]), `${label}.${key} must be decimal`);
  }
}

/** @param {Record<string, any>} state @param {string} label @param {boolean} [allowMissing] */
function validateExpectedStateShape(state, label, allowMissing = true) {
  requirePlanSchema(isRecord(state), `${label} must be an object`);
  if (state.type === 'missing') {
    requirePlanSchema(allowMissing, `${label} must describe a regular file`);
    requireExactKeys(state, ['type'], label);
    return;
  }
  requireExactKeys(state, ['type', 'sha256'], label);
  requirePlanSchema(state.type === 'file', `${label}.type must be file or missing`);
  requirePlanSchema(typeof state.sha256 === 'string' && /^[a-f0-9]{64}$/.test(state.sha256), `${label}.sha256 must be lowercase SHA-256`);
}

/** @param {unknown} value @param {string} label */
function requireAbsolutePath(value, label) {
  requireString(value, label);
  requirePlanSchema(path.isAbsolute(value) && path.resolve(value) === value, `${label} must be an absolute canonical path`);
}

/** @param {string} relativePath @param {string} label @param {boolean} [core] */
function validatePlanPath(relativePath, label, core = true) {
  requireString(relativePath, label);
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const unsafe = normalized !== relativePath
    || path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..');
  requirePlanSchema(!unsafe, `plan contains unsafe path: ${relativePath}`);
  requirePlanSchema(
    classifyPath(relativePath) === (core ? TIER.CORE : TIER.PROJECT),
    `${label} has invalid ownership: ${relativePath}`,
  );
}

/** @param {Record<string, any>} plan */
function validatePlanShape(plan) {
  requireExactKeys(plan, [
    'kind', 'schema_version', 'plan_id', 'created_at', 'ttl_warn_at', 'ttl_expire_at',
    'scope', 'source', 'from_ref', 'to_ref', 'cache', 'local', 'summary', 'buckets', 'digest',
  ], 'plan');
  requirePlanSchema(plan.kind === PLAN_KIND && plan.schema_version === PLAN_SCHEMA_VERSION, 'unsupported upgrade plan schema');
  for (const key of ['plan_id', 'created_at', 'ttl_warn_at', 'ttl_expire_at', 'to_ref']) {
    requireString(plan[key], `plan.${key}`);
  }
  requireString(plan.from_ref, 'plan.from_ref', true);
  requirePlanSchema(typeof plan.digest === 'string' && /^[a-f0-9]{64}$/.test(plan.digest), 'plan.digest must be lowercase SHA-256');

  requireExactKeys(plan.scope, ['identity_scope', 'workspace_path', 'workspace_realpath', 'workspace_identity'], 'plan.scope');
  requireString(plan.scope.identity_scope, 'plan.scope.identity_scope');
  requireAbsolutePath(plan.scope.workspace_path, 'plan.scope.workspace_path');
  requireAbsolutePath(plan.scope.workspace_realpath, 'plan.scope.workspace_realpath');
  validateIdentityShape(plan.scope.workspace_identity, 'plan.scope.workspace_identity');

  requireExactKeys(plan.source, ['type', 'location', 'identity', 'requested_ref', 'resolved_ref', 'resolved_commit'], 'plan.source');
  for (const key of ['type', 'location', 'identity', 'requested_ref', 'resolved_ref', 'resolved_commit']) {
    requireString(plan.source[key], `plan.source.${key}`);
  }

  requireExactKeys(plan.cache, ['root_path', 'root_realpath', 'root_identity', 'manifest', 'inventory'], 'plan.cache');
  requireAbsolutePath(plan.cache.root_path, 'plan.cache.root_path');
  requireAbsolutePath(plan.cache.root_realpath, 'plan.cache.root_realpath');
  validateIdentityShape(plan.cache.root_identity, 'plan.cache.root_identity');
  requireExactKeys(plan.cache.manifest, ['path', 'type', 'sha256'], 'plan.cache.manifest');
  requireString(plan.cache.manifest.path, 'plan.cache.manifest.path');
  requireString(plan.cache.manifest.type, 'plan.cache.manifest.type');
  requirePlanSchema(typeof plan.cache.manifest.sha256 === 'string' && /^[a-f0-9]{64}$/.test(plan.cache.manifest.sha256), 'plan.cache.manifest.sha256 must be lowercase SHA-256');
  requirePlanSchema(Array.isArray(plan.cache.inventory), 'plan.cache.inventory must be an array');
  for (const [index, entry] of plan.cache.inventory.entries()) {
    requireExactKeys(entry, ['path', 'type', 'sha256'], `plan.cache.inventory[${index}]`);
    requireString(entry.path, `plan.cache.inventory[${index}].path`);
    requireString(entry.type, `plan.cache.inventory[${index}].type`);
    requirePlanSchema(typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256), `plan.cache.inventory[${index}].sha256 must be lowercase SHA-256`);
  }

  requireExactKeys(plan.local, ['manifest', 'upgrade_log', 'core_inventory'], 'plan.local');
  requireExactKeys(plan.local.manifest, ['path', 'state', 'data'], 'plan.local.manifest');
  requireString(plan.local.manifest.path, 'plan.local.manifest.path');
  validateExpectedStateShape(plan.local.manifest.state, 'plan.local.manifest.state', false);
  requireExactKeys(plan.local.manifest.data, ['source_repo', 'source_ref', 'installed_ref'], 'plan.local.manifest.data');
  requireString(plan.local.manifest.data.source_repo, 'plan.local.manifest.data.source_repo');
  requireString(plan.local.manifest.data.source_ref, 'plan.local.manifest.data.source_ref');
  requireString(plan.local.manifest.data.installed_ref, 'plan.local.manifest.data.installed_ref', true);
  requireExactKeys(plan.local.upgrade_log, ['path', 'state'], 'plan.local.upgrade_log');
  requireString(plan.local.upgrade_log.path, 'plan.local.upgrade_log.path');
  validateExpectedStateShape(plan.local.upgrade_log.state, 'plan.local.upgrade_log.state');
  requirePlanSchema(Array.isArray(plan.local.core_inventory), 'plan.local.core_inventory must be an array');
  for (const [index, entry] of plan.local.core_inventory.entries()) {
    requireExactKeys(entry, ['path', 'state'], `plan.local.core_inventory[${index}]`);
    requireString(entry.path, `plan.local.core_inventory[${index}].path`);
    validateExpectedStateShape(entry.state, `plan.local.core_inventory[${index}].state`);
  }

  requireExactKeys(plan.summary, ['replace', 'add', 'remove', 'advisory', 'up_to_date'], 'plan.summary');
  for (const key of ['replace', 'add', 'remove', 'advisory', 'up_to_date']) requireCount(plan.summary[key], `plan.summary.${key}`);
  requireExactKeys(plan.buckets, ['replace', 'add', 'remove', 'advisory', 'up_to_date'], 'plan.buckets');
  for (const key of ['replace', 'add', 'remove', 'advisory', 'up_to_date']) {
    requirePlanSchema(Array.isArray(plan.buckets[key]), `plan.buckets.${key} must be an array`);
  }
  for (const [index, entry] of plan.buckets.replace.entries()) {
    requireExactKeys(entry, ['path', 'added_lines', 'removed_lines'], `plan.buckets.replace[${index}]`);
    requireString(entry.path, `plan.buckets.replace[${index}].path`);
    requireCount(entry.added_lines, `plan.buckets.replace[${index}].added_lines`);
    requireCount(entry.removed_lines, `plan.buckets.replace[${index}].removed_lines`);
  }
  for (const key of ['add', 'remove', 'up_to_date']) {
    for (const [index, entry] of plan.buckets[key].entries()) {
      requireExactKeys(entry, ['path'], `plan.buckets.${key}[${index}]`);
      requireString(entry.path, `plan.buckets.${key}[${index}].path`);
    }
  }
  for (const [index, entry] of plan.buckets.advisory.entries()) {
    requireExactKeys(entry, ['path', 'kind'], `plan.buckets.advisory[${index}]`);
    requireString(entry.path, `plan.buckets.advisory[${index}].path`);
    requireString(entry.kind, `plan.buckets.advisory[${index}].kind`);
  }
}

/** @param {{path: string}[]} entries @param {string} label */
function validateSortedUniquePaths(entries, label) {
  const paths = entries.map((entry) => entry.path);
  const sorted = [...paths].sort(codeUnitCompare);
  requirePlanSchema(paths.every((entry, index) => entry === sorted[index]), `${label} must use canonical code-unit ordering`);
  requirePlanSchema(new Set(paths).size === paths.length, `${label} contains duplicate paths`);
  return paths;
}

/** @param {Record<string, any>} plan */
function metadataTransitionNeeded(plan) {
  return plan.local.manifest.data.source_repo !== plan.source.location
    || plan.local.manifest.data.source_ref !== plan.source.requested_ref
    || plan.local.manifest.data.installed_ref !== plan.to_ref;
}

/** @param {Record<string, any>} plan */
function validatePlanInvariants(plan) {
  requirePlanSchema(plan.scope.identity_scope === PLAN_IDENTITY_SCOPE, `unsupported identity scope: ${plan.scope.identity_scope}`);
  requirePlanSchema(['local-path', 'git-remote'].includes(plan.source.type), 'plan.source.type must be local-path or git-remote');
  requirePlanSchema(COMMIT_PATTERN.test(plan.source.resolved_commit), 'plan.source.resolved_commit must be a lowercase concrete commit');
  requirePlanSchema(
    plan.source.type !== 'local-path' || plan.source.requested_ref !== 'latest',
    'local-path source does not support ref latest; re-run plan with an explicit local branch or tag',
  );
  if (plan.source.requested_ref === 'latest') {
    const release = resolveReleaseRef(plan.source.location, plan.source.requested_ref);
    requirePlanSchema(
      release.channel && /^v\d+\.\d+\.\d+$/.test(release.resolvedRef),
      'plan latest ref must resolve to a stable release tag',
    );
    requirePlanSchema(
      release.resolvedRef === plan.source.resolved_ref,
      'plan latest resolved ref must equal the highest stable release tag',
    );
  } else {
    requirePlanSchema(
      plan.source.requested_ref === plan.source.resolved_ref,
      'plan literal requested ref must equal its resolved ref',
    );
  }
  requirePlanSchema(plan.to_ref === plan.source.resolved_ref, 'plan.to_ref must equal plan.source.resolved_ref');
  requirePlanSchema(plan.from_ref === plan.local.manifest.data.installed_ref, 'plan.from_ref must equal the reviewed installed_ref');
  requirePlanSchema(plan.cache.manifest.path === WORKSPACE_PATHS.BUNDLE_MANIFEST && plan.cache.manifest.type === 'file', 'plan.cache.manifest must identify the canonical manifest');
  requirePlanSchema(plan.local.manifest.path === WORKSPACE_PATHS.BUNDLE_MANIFEST, 'plan.local.manifest must identify the canonical manifest');
  requirePlanSchema(plan.local.upgrade_log.path === WORKSPACE_PATHS.UPGRADE_LOG, 'plan.local.upgrade_log must identify the canonical upgrade log');

  const timestamps = [plan.created_at, plan.ttl_warn_at, plan.ttl_expire_at];
  const epochs = timestamps.map((value) => isoToEpoch(value));
  requirePlanSchema(
    timestamps.every((value, index) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && epochs[index] !== null),
    'plan timestamps must be canonical UTC ISO-8601 values',
  );
  requirePlanSchema(epochs[1] - epochs[0] === 3600 && epochs[2] - epochs[0] === 86400, 'plan TTL metadata is inconsistent');

  /** @type {Map<string, string>} */
  const bucketByPath = new Map();
  for (const key of ['replace', 'add', 'remove', 'up_to_date']) {
    validateSortedUniquePaths(plan.buckets[key], `plan.buckets.${key}`);
    for (const entry of plan.buckets[key]) {
      validatePlanPath(entry.path, `plan.buckets.${key}`);
      requirePlanSchema(!bucketByPath.has(entry.path), `plan buckets are invalid: duplicate path ${entry.path}`);
      bucketByPath.set(entry.path, key);
    }
    requirePlanSchema(plan.summary[key] === plan.buckets[key].length, `plan.summary.${key} does not match its bucket`);
  }
  validateSortedUniquePaths(plan.buckets.advisory, 'plan.buckets.advisory');
  requirePlanSchema(plan.summary.advisory === plan.buckets.advisory.length, 'plan.summary.advisory does not match its bucket');
  for (const entry of plan.buckets.advisory) {
    validatePlanPath(entry.path, 'plan.buckets.advisory', false);
    requirePlanSchema(
      ['unreserved_local_agent', 'unreserved_local_skill'].includes(entry.kind),
      `plan advisory kind is invalid: ${entry.kind}`,
    );
  }

  validateSortedUniquePaths(plan.cache.inventory, 'plan.cache.inventory');
  const expectedCachePaths = [...bucketByPath.entries()]
    .filter(([, bucket]) => bucket !== 'remove')
    .map(([relativePath]) => relativePath)
    .sort(codeUnitCompare);
  const cachePaths = plan.cache.inventory.map((entry) => entry.path);
  requirePlanSchema(JSON.stringify(cachePaths) === JSON.stringify(expectedCachePaths), 'plan cache inventory does not match reviewed buckets');
  for (const entry of plan.cache.inventory) {
    validatePlanPath(entry.path, 'plan.cache.inventory');
    requirePlanSchema(entry.type === 'file', `plan cache inventory type is invalid: ${entry.path}`);
  }

  validateSortedUniquePaths(plan.local.core_inventory, 'plan.local.core_inventory');
  const expectedLocalPaths = [...bucketByPath.keys()].sort(codeUnitCompare);
  const localPaths = plan.local.core_inventory.map((entry) => entry.path);
  requirePlanSchema(JSON.stringify(localPaths) === JSON.stringify(expectedLocalPaths), 'plan local inventory does not match reviewed buckets');
  const cacheByPath = new Map(plan.cache.inventory.map((entry) => [entry.path, entry]));
  const localByPath = new Map(plan.local.core_inventory.map((entry) => [entry.path, entry]));
  for (const [relativePath, bucket] of bucketByPath) {
    validatePlanPath(relativePath, 'plan.local.core_inventory');
    const cacheEntry = cacheByPath.get(relativePath);
    const localEntry = localByPath.get(relativePath);
    requirePlanSchema(Boolean(localEntry), `plan local inventory is missing ${relativePath}`);
    if (bucket === 'add') {
      requirePlanSchema(localEntry.state.type === 'missing' && Boolean(cacheEntry), `plan Add evidence is invalid: ${relativePath}`);
    } else if (bucket === 'remove') {
      requirePlanSchema(localEntry.state.type === 'file' && !cacheEntry, `plan Remove evidence is invalid: ${relativePath}`);
    } else if (bucket === 'replace') {
      requirePlanSchema(
        localEntry.state.type === 'file' && Boolean(cacheEntry) && localEntry.state.sha256 !== cacheEntry.sha256,
        `plan Replace evidence is invalid: ${relativePath}`,
      );
    } else {
      requirePlanSchema(
        localEntry.state.type === 'file' && Boolean(cacheEntry) && localEntry.state.sha256 === cacheEntry.sha256,
        `plan up-to-date evidence is invalid: ${relativePath}`,
      );
    }
  }

}

/** @param {string} planPath */
function parseUpgradePlan(planPath) {
  const stat = lstatOrNull(planPath);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`plan file malformed: ${planPath} is not a regular file`);
  }
  const bytes = fs.readFileSync(planPath);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`plan file malformed: ${planPath}`);
  }
  if (!isRecord(parsed) || parsed.kind !== PLAN_KIND || parsed.schema_version !== PLAN_SCHEMA_VERSION) {
    throw new Error("unsupported upgrade plan schema; re-run 'plan' with the current engine");
  }
  validatePlanShape(parsed);
  if (bytes.toString('utf8') !== serializeUpgradePlan(parsed)) {
    throw new Error("plan is not canonical; re-run 'plan'");
  }
  if (planDigest(parsed) !== parsed.digest) {
    throw new Error("plan digest mismatch; the digest is a consistency check, not authentication; re-run 'plan'");
  }
  validatePlanInvariants(parsed);
  return parsed;
}

/** @param {unknown} actual @param {unknown} expected */
function evidenceEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/** @param {string} root @param {string} relativePath @param {Record<string, any>} expected @param {string} label */
function verifyExpectedState(root, relativePath, expected, label) {
  let actual;
  try {
    actual = snapshotExpectedState(root, relativePath);
  } catch {
    throw new Error(`${label}: ${relativePath}`);
  }
  if (!evidenceEqual(actual, expected)) throw new Error(`${label}: ${relativePath}`);
  return resolveMutationPath(root, relativePath);
}

/** @param {Record<string, any>} plan @param {boolean} skipRemovals */
function plannedWritePaths(plan, skipRemovals) {
  const operationPaths = [
    ...plan.buckets.add.map((entry) => entry.path),
    ...plan.buckets.replace.map((entry) => entry.path),
    ...(skipRemovals ? [] : plan.buckets.remove.map((entry) => entry.path)),
  ];
  const hasReviewedTransition = plan.summary.add + plan.summary.replace + plan.summary.remove > 0
    || metadataTransitionNeeded(plan);
  if (hasReviewedTransition) {
    operationPaths.push(WORKSPACE_PATHS.BUNDLE_MANIFEST, WORKSPACE_PATHS.UPGRADE_LOG);
  }
  return [...new Set(operationPaths)].sort(codeUnitCompare);
}

/** @param {Record<string, any>} plan */
function verifyWorkspaceEvidence(plan) {
  const workspacePath = path.resolve(ROOT);
  if (plan.scope.workspace_path !== workspacePath) {
    throw new Error('reviewed workspace path changed; re-run plan in this workspace');
  }
  let workspaceRealpath;
  let workspaceIdentity;
  try {
    workspaceRealpath = fs.realpathSync(workspacePath);
    workspaceIdentity = directoryIdentity(workspacePath);
  } catch {
    throw new Error('reviewed workspace identity changed; re-run plan in this workspace');
  }
  if (plan.scope.workspace_realpath !== workspaceRealpath
      || !evidenceEqual(plan.scope.workspace_identity, workspaceIdentity)) {
    throw new Error('reviewed workspace identity changed; re-run plan in this workspace');
  }
}

/** @param {Record<string, any>} plan */
function verifySourceEvidence(plan) {
  const cacheRoot = plan.cache.root_path;
  const head = git(['rev-parse', 'HEAD^{commit}'], cacheRoot);
  if (head.status !== 0 || head.stdout.trim().toLowerCase() !== plan.source.resolved_commit) {
    throw new Error('reviewed resolved commit changed; re-run plan');
  }
  const resolved = git(['rev-parse', `${plan.source.resolved_ref}^{commit}`], cacheRoot);
  if (resolved.status !== 0 || resolved.stdout.trim().toLowerCase() !== plan.source.resolved_commit) {
    throw new Error('reviewed resolved ref changed; re-run plan');
  }
  if (plan.source.type === 'local-path') {
    let sourceRealpath;
    try {
      sourceRealpath = fs.realpathSync(plan.source.location);
    } catch {
      throw new Error('reviewed local source identity changed; re-run plan');
    }
    if (sourceRealpath !== plan.source.identity || sourceRealpath !== plan.cache.root_realpath) {
      throw new Error('reviewed local source identity changed; re-run plan');
    }
  } else {
    const origin = git(['config', '--get', 'remote.origin.url'], cacheRoot);
    if (origin.status !== 0
        || origin.stdout.trim() !== plan.source.identity
        || origin.stdout.trim() !== plan.source.location) {
      throw new Error('reviewed source identity changed; re-run plan');
    }
  }
}

/** @param {Record<string, any>} plan */
function verifyCacheEvidence(plan) {
  const cacheRoot = plan.cache.root_path;
  const rootStat = lstatOrNull(cacheRoot);
  if (!rootStat) throw new Error('reviewed cache root is missing; re-run plan');
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('reviewed cache root type changed; re-run plan');
  }
  let realRoot;
  let rootIdentity;
  try {
    realRoot = fs.realpathSync(cacheRoot);
    rootIdentity = directoryIdentity(cacheRoot);
  } catch {
    throw new Error('reviewed cache root identity changed; re-run plan');
  }
  if (realRoot !== plan.cache.root_realpath || !evidenceEqual(rootIdentity, plan.cache.root_identity)) {
    throw new Error('reviewed cache root identity changed; re-run plan');
  }

  verifySourceEvidence(plan);

  /** @type {Map<string, Buffer>} */
  const cacheBytes = new Map();
  for (const entry of plan.cache.inventory) {
    let absolutePath;
    let stat;
    try {
      absolutePath = resolveMutationPath(cacheRoot, entry.path);
      stat = lstatOrNull(absolutePath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/symbolic link/i.test(detail)) throw new Error(`reviewed cache contains symbolic link: ${entry.path}`);
      throw new Error(`reviewed cache type changed: ${entry.path}`);
    }
    if (!stat?.isFile() || stat.isSymbolicLink()) {
      if (!stat) throw new Error(`reviewed cache inventory changed: missing ${entry.path}`);
      throw new Error(`reviewed cache type changed: ${entry.path}`);
    }
    const bytes = fs.readFileSync(absolutePath);
    if (sha256(bytes) !== entry.sha256) throw new Error(`reviewed cache bytes changed: ${entry.path}`);
    cacheBytes.set(entry.path, bytes);
  }

  for (const entry of plan.buckets.remove) {
    let absolutePath;
    try {
      absolutePath = resolveMutationPath(cacheRoot, entry.path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/symbolic link/i.test(detail)) throw new Error(`reviewed cache contains symbolic link: ${entry.path}`);
      throw new Error(`reviewed cache type changed: ${entry.path}`);
    }
    if (lstatOrNull(absolutePath)) throw new Error(`reviewed cache inventory changed: unexpected ${entry.path}`);
  }

  let actualInventory;
  try {
    actualInventory = snapshotCoreInventory(cacheRoot, 'reviewed cache');
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (!evidenceEqual(actualInventory, plan.cache.inventory)) {
    throw new Error('reviewed cache inventory changed; re-run plan');
  }

  const manifestPath = resolveMutationPath(cacheRoot, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  const manifestStat = lstatOrNull(manifestPath);
  if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error('reviewed upstream manifest type changed; re-run plan');
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  if (sha256(manifestBytes) !== plan.cache.manifest.sha256) {
    throw new Error('reviewed upstream manifest changed; re-run plan');
  }
  const manifestBody = extractManifestJson(manifestBytes.toString('utf8'));
  const manifestObject = manifestBody ? parseManifest(manifestBody) : null;
  const manifestErrors = validateMetadataManifest(manifestObject, 'upstream manifest');
  if (manifestErrors.length) throw new Error(`reviewed upstream manifest is invalid: ${manifestErrors[0]}`);

  const sourceStatus = git(['status', '--porcelain=v1', '--untracked-files=all'], cacheRoot);
  if (sourceStatus.status !== 0) throw new Error('could not inspect the reviewed source working tree; re-run plan');
  if (sourceStatus.stdout.trim()) {
    throw new Error('reviewed source working tree changed; re-run plan');
  }
  return cacheBytes;
}

/** @param {Record<string, any>} plan */
function verifyLocalEvidence(plan) {
  const manifestPath = resolveMutationPath(ROOT, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  const upgradeLogPath = resolveMutationPath(ROOT, WORKSPACE_PATHS.UPGRADE_LOG);
  const actualManifestData = {
    source_repo: local.source_repo,
    source_ref: local.source_ref,
    installed_ref: local.installed_ref,
  };
  if (!evidenceEqual(actualManifestData, plan.local.manifest.data)) {
    throw new Error('reviewed bundle manifest values changed; re-run plan');
  }
  const actualManifestState = snapshotExpectedState(ROOT, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  if (!evidenceEqual(actualManifestState, plan.local.manifest.state)) {
    throw new Error('reviewed bundle manifest bytes changed; re-run plan');
  }
  let actualLogState;
  try {
    actualLogState = snapshotExpectedState(ROOT, WORKSPACE_PATHS.UPGRADE_LOG);
  } catch {
    throw new Error('reviewed upgrade log state changed; re-run plan');
  }
  if (!evidenceEqual(actualLogState, plan.local.upgrade_log.state)) {
    throw new Error('reviewed upgrade log state changed; re-run plan');
  }

  const bucketByPath = new Map();
  for (const key of ['replace', 'add', 'remove', 'up_to_date']) {
    for (const entry of plan.buckets[key]) bucketByPath.set(entry.path, key);
  }
  /** @type {Map<string, string>} */
  const mutationTargets = new Map();
  for (const entry of plan.local.core_inventory) {
    const bucket = bucketByPath.get(entry.path);
    const label = `reviewed local state changed: ${bucket}`;
    const absolutePath = verifyExpectedState(ROOT, entry.path, entry.state, label);
    if (bucket !== 'up_to_date') mutationTargets.set(entry.path, absolutePath);
  }

  const mutatesBundle = plan.summary.replace + plan.summary.add + plan.summary.remove > 0
    || metadataTransitionNeeded(plan);
  if (mutatesBundle) {
    mutationTargets.set(WORKSPACE_PATHS.BUNDLE_MANIFEST, manifestPath);
    if (plan.local.upgrade_log.state.type === 'file') {
      mutationTargets.set(WORKSPACE_PATHS.UPGRADE_LOG, upgradeLogPath);
    }
  }
  let actualCorePaths;
  try {
    actualCorePaths = scanCoreInventoryPaths(ROOT, 'reviewed local workspace');
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  const expectedExistingPaths = plan.local.core_inventory
    .filter((entry) => entry.state.type === 'file')
    .map((entry) => entry.path);
  if (!evidenceEqual(actualCorePaths, expectedExistingPaths)) {
    throw new Error('reviewed local core inventory changed; re-run plan');
  }

  const manifestBytes = fs.readFileSync(manifestPath);
  mutationTargets.delete(WORKSPACE_PATHS.BUNDLE_MANIFEST);
  mutationTargets.delete(WORKSPACE_PATHS.UPGRADE_LOG);
  return { manifestPath, upgradeLogPath, manifestBytes, mutationTargets };
}

/** @param {Record<string, any>} plan */
function preflightApply(plan) {
  const expiry = isoToEpoch(plan.ttl_expire_at);
  if (expiry === null || Math.floor(Date.now() / 1000) > expiry) {
    throw new Error(`plan expired (created ${plan.created_at}, expired ${plan.ttl_expire_at}); re-run 'plan'`);
  }
  verifyWorkspaceEvidence(plan);
  const localStatus = git(['status', '--porcelain']);
  if (localStatus.status !== 0) throw new Error('failed to inspect the local Git working tree');
  if (localStatus.stdout.trim()) throw new Error('working tree is dirty; commit or stash changes before applying');
  const localEvidence = verifyLocalEvidence(plan);
  const cacheBytes = verifyCacheEvidence(plan);
  for (const entry of plan.buckets.replace) {
    const target = localEvidence.mutationTargets.get(entry.path);
    const upstreamBytes = cacheBytes.get(entry.path);
    if (!target || !upstreamBytes) throw new Error(`reviewed Replace evidence is incomplete: ${entry.path}`);
    const lineCounts = diffPlusMinusBytes(fs.readFileSync(target), upstreamBytes);
    if (lineCounts.added !== entry.added_lines || lineCounts.removed !== entry.removed_lines) {
      throw new Error(`reviewed Replace line metadata changed: ${entry.path}; re-run plan`);
    }
  }
  return { ...localEvidence, cacheBytes };
}

// ----- manifest write --------------------------------------------------------
/**
 * Rewrite only the fenced ```json block in the local manifest, preserving the
 * surrounding markdown wrapper.
 * @param {Buffer} originalBytes @param {string} sourceRepo @param {string} sourceRef
 * @param {string} installedRef
 */
function renderManifest(originalBytes, sourceRepo, sourceRef, installedRef) {
  const lines = originalBytes.toString('utf8').split('\n');
  /** @type {string[]} */
  const pre = [];
  let i = 0;
  for (; i < lines.length; i += 1) {
    pre.push(lines[i]);
    if (/^```json\s*$/.test(lines[i])) {
      i += 1;
      break;
    }
  }
  /** @type {string[]} */
  const post = [];
  let closed = false;
  for (; i < lines.length; i += 1) {
    if (!closed && /^```\s*$/.test(lines[i])) {
      closed = true;
      post.push(lines[i]);
      continue;
    }
    if (closed) post.push(lines[i]);
  }
  const jsonText = JSON.stringify(
    {
      source_repo: sourceRepo,
      source_ref: sourceRef,
      installed_ref: installedRef,
    },
    null,
    2,
  );
  return Buffer.from([...pre, jsonText, ...post].join('\n'));
}

// ----- lint ------------------------------------------------------------------
/** @returns {'OK' | 'FAIL' | 'SKIPPED'} */
function runLint() {
  if (!isFile(LINT_PATH)) return 'SKIPPED';
  const r = spawnSync('node', [LINT_PATH], { cwd: ROOT, stdio: 'ignore' });
  return r.status === 0 ? 'OK' : 'FAIL';
}

// ----- flag parsing ----------------------------------------------------------
/**
 * @param {string[]} argv
 * @param {Set<string>} valued flags that take a value
 * @param {Set<string>} bools boolean flags
 * @returns {{ flags: Record<string, string>, error?: string }}
 */
function parseFlags(argv, valued, bools) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq !== -1) {
      const k = a.slice(2, eq);
      if (!valued.has(k) && !bools.has(k)) return { flags, error: `unknown flag: ${a}` };
      flags[k] = a.slice(eq + 1);
    } else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (bools.has(k)) flags[k] = '1';
      else if (valued.has(k)) {
        flags[k] = argv[i + 1] || '';
        i += 1;
      } else return { flags, error: `unknown flag: ${a}` };
    } else {
      return { flags, error: `unknown flag: ${a}` };
    }
  }
  return { flags };
}

// ----- subcommands -----------------------------------------------------------
/** @param {string[]} argv @returns {Promise<number>} */
async function cmdStatus(argv) {
  const { flags, error } = parseFlags(argv, new Set(['format', 'source', 'ref']), new Set());
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
    return 40;
  }

  if (!hasGit() || git(['rev-parse', '--is-inside-work-tree']).status !== 0) {
    const reason = !hasGit()
      ? 'git is not installed; install git and re-run'
      : "not a git working tree (run 'git init' in the project root, then re-run)";
    upstream.source = flags.source || 'unknown';
    upstream.ref = flags.ref || 'unknown';
    if (format === 'json') emitStatusJson('error', '', reason);
    else logError(reason);
    return 40;
  }

  if (!loadLocalManifest()) {
    upstream.source = flags.source || 'unknown';
    upstream.ref = flags.ref || 'unknown';
    const detail = localManifestError();
    if (format === 'json') emitStatusJson('error', '', detail);
    else logError(detail);
    return 40;
  }
  resolveUpstream(flags.source || '', flags.ref || '');

  if (isDir(upstream.source) && upstream.ref === 'latest') {
    const detail = 'local-path source does not support ref latest; pass an explicit local branch or tag with --ref';
    if (format === 'json') emitStatusJson('error', '', detail);
    else logError(detail);
    return 40;
  }

  if (upstream.channel && !upstream.resolvedRef) {
    const detail = 'no releases published yet';
    if (format === 'json') emitStatusJson('offline', '', detail);
    else emitStatusText('offline', '', detail);
    return 0;
  }

  const fetchedManifest = await fetchUpstreamManifestOnly();
  if (!fetchedManifest.path) {
    if (fetchedManifest.error) {
      if (format === 'json') emitStatusJson('error', '', fetchedManifest.error);
      else logError(fetchedManifest.error);
      return 40;
    }
    if (format === 'json') emitStatusJson('offline', '', 'could not reach upstream');
    else emitStatusText('offline', '', 'could not reach upstream');
    return 0;
  }

  const body = extractManifestJson(read(fetchedManifest.path));
  const obj = body ? parseManifest(body) : null;
  const errs = validateMetadataManifest(obj, 'upstream manifest');
  if (errs.length) {
    if (format === 'json') emitStatusJson('error', '', errs[0]);
    else {
      logError('upstream manifest invalid:');
      for (const e of errs) process.stderr.write(`  ${e}\n`);
    }
    return 40;
  }

  const upstreamRef = upstream.resolvedRef;
  const kind = upstreamRef && upstreamRef === local.installed_ref ? 'up_to_date' : 'upgrade_available';
  if (format === 'json') emitStatusJson(kind, upstreamRef, '');
  else emitStatusText(kind, upstreamRef, '');
  return 0;
}

/** @param {string[]} argv @returns {number} */
function cmdPlan(argv) {
  const { flags, error } = parseFlags(argv, new Set(['format', 'source', 'ref', 'out']), new Set());
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
    return 40;
  }
  if (!hasGit() || git(['rev-parse', '--is-inside-work-tree']).status !== 0) {
    logError(
      !hasGit()
        ? 'git is not installed; install git and re-run'
        : "not a git working tree (run 'git init' in the project root, then re-run)",
    );
    return 40;
  }
  if (!loadLocalManifest()) {
    logError(localManifestError());
    return 40;
  }
  resolveUpstream(flags.source || '', flags.ref || '');

  if (isDir(upstream.source) && upstream.ref === 'latest') {
    logError('local-path source does not support ref latest; pass an explicit local branch or tag with --ref');
    return 40;
  }

  if (upstream.channel && !upstream.resolvedRef) {
    logError('no releases published yet on the release channel; nothing to upgrade to');
    return 40;
  }

  const utree = fetchUpstreamTree();
  if (!utree) return 40;

  const upstreamManifest = findUpstreamManifestPath(utree);
  if (!upstreamManifest) {
    logError(`upstream tree is missing ${WORKSPACE_PATHS.BUNDLE_MANIFEST}`);
    return 40;
  }
  const obj = parseManifest(extractManifestJson(read(upstreamManifest)) || '');
  const errs = validateMetadataManifest(obj, 'upstream manifest');
  if (errs.length) {
    logError('upstream manifest invalid:');
    for (const e of errs) process.stderr.write(`  ${e}\n`);
    return 40;
  }

  for (const need of [
    '.github/agents',
    '.github/skills/dude-lint',
    '.github/instructions/dude.instructions.md',
  ]) {
    if (!exists(path.join(utree, need))) {
      logError(`upstream tree is missing required path: ${need}`);
      return 40;
    }
  }

  const plan = classifyPlan(utree);

  const toRef = upstream.resolvedRef;
  const fromRef = local.installed_ref;
  const createdAt = isoNow();
  const planIdBase = `${stampNow()}-${sanitizeRef(fromRef)}-${sanitizeRef(toRef)}`;
  let persistedPlan;
  let planJson = '';
  let persisted;
  try {
    persisted = persistUniquePlan({
      plansDir: PLANS_DIR,
      baseId: planIdBase,
      buildBytes: (candidatePlanId) => {
        persistedPlan = buildUpgradePlan(plan, {
          plan_id: candidatePlanId,
          from_ref: fromRef,
          to_ref: toRef,
          cache_dir: utree,
          created_at: createdAt,
          ttl_warn: isoAddSeconds(createdAt, 3600),
          ttl_expire: isoAddSeconds(createdAt, 86400),
        });
        planJson = buildPlanJson(persistedPlan);
        return planJson;
      },
    });
  } catch (planError) {
    logError(planError instanceof Error ? planError.message : String(planError));
    return 40;
  }
  const { planId, planPath } = persisted;
  if (flags.out) {
    try {
      fs.copyFileSync(planPath, flags.out, fs.constants.COPYFILE_EXCL);
    } catch (copyError) {
      fs.rmSync(planPath, { force: true });
      const existsError = copyError && typeof copyError === 'object' && 'code' in copyError
        && copyError.code === 'EEXIST';
      logError(existsError
        ? `--out already exists; refusing to overwrite: ${flags.out}`
        : `failed to write --out plan: ${copyError instanceof Error ? copyError.message : String(copyError)}`);
      return 40;
    }
  }

  if (format === 'json') out(planJson);
  else {
    emitPlanText(plan, planId, fromRef, toRef, utree, metadataTransitionNeeded(persistedPlan));
    out(`\nPlan saved: ${planPath}\n`);
  }

  return plan.replace.length + plan.add.length + plan.remove.length === 0
    && !metadataTransitionNeeded(persistedPlan) ? 0 : 10;
}

/** @param {string[]} argv @returns {number} */
function cmdApply(argv) {
  const { flags, error } = parseFlags(
    argv,
    new Set(['plan', 'confirm', 'format']),
    new Set(['skip-removals']),
  );
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
    return 40;
  }
  try {
    resolveMutationPath(ROOT, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  } catch (pathError) {
    logError(pathError instanceof Error ? pathError.message : String(pathError));
    return 40;
  }
  if (!hasGit() || git(['rev-parse', '--is-inside-work-tree']).status !== 0) {
    logError('not a git working tree or git missing');
    return 40;
  }
  if (!flags.plan) {
    logError('--plan is required (path or plan id)');
    return 40;
  }
  if (!flags.confirm) {
    logError("--confirm is required (use 'confirm-upgrade')");
    return 40;
  }
  if (flags.confirm !== 'confirm-upgrade') {
    logError(`invalid --confirm token: ${flags.confirm} (expected literal string 'confirm-upgrade')`);
    return 40;
  }
  if (!loadLocalManifest()) {
    logError(localManifestError());
    return 40;
  }

  let planPath = flags.plan;
  if (!isFile(planPath)) planPath = path.join(PLANS_DIR, `${flags.plan}.json`);
  if (!isFile(planPath)) {
    logError(`plan not found: ${flags.plan}`);
    return 40;
  }
  let planObj;
  try {
    planObj = parseUpgradePlan(planPath);
  } catch (planError) {
    logError(planError instanceof Error ? planError.message : String(planError));
    return 40;
  }
  const fromRef = planObj.from_ref;
  const toRef = planObj.to_ref;
  const planSource = planObj.source.location;
  const planRef = planObj.source.requested_ref;
  const planId = planObj.plan_id;
  const plan = planObj.buckets;
  const skipRemovals = Boolean(flags['skip-removals']);
  const writePaths = plannedWritePaths(planObj, skipRemovals);

  let preflight;
  try {
    preflight = preflightApply(planObj);
  } catch (preflightError) {
    logError(preflightError instanceof Error ? preflightError.message : String(preflightError));
    return 40;
  }

  const total = plan.replace.length + plan.add.length + plan.remove.length;
  if (total === 0 && !metadataTransitionNeeded(planObj)) {
    logInfo('nothing to apply (no changes)');
    return 0;
  }

  // ---- Safety net ----
  const safetyTagBase = `dude-pre-upgrade-${stampNow()}`;
  let safetyTag = safetyTagBase;
  let tagProbe = git(['show-ref', '--verify', '--quiet', `refs/tags/${safetyTag}`]);
  if (tagProbe.status !== 0 && tagProbe.status !== 1) {
    logError('failed to inspect existing safety tags');
    return 40;
  }
  for (let suffix = 2; tagProbe.status === 0; suffix += 1) {
    safetyTag = `${safetyTagBase}-${suffix}`;
    tagProbe = git(['show-ref', '--verify', '--quiet', `refs/tags/${safetyTag}`]);
    if (tagProbe.status !== 0 && tagProbe.status !== 1) {
      logError('failed to inspect existing safety tags');
      return 40;
    }
  }
  let upgradeBranch = `chore/dude-upgrade-${sanitizeRef(toRef)}`;
  let branchProbe = git(['show-ref', '--verify', '--quiet', `refs/heads/${upgradeBranch}`]);
  if (branchProbe.status !== 0 && branchProbe.status !== 1) {
    logError('failed to inspect existing upgrade branches');
    return 40;
  }
  if (branchProbe.status === 0) {
    const branchBase = `${upgradeBranch}-${stampNow()}`;
    upgradeBranch = branchBase;
    branchProbe = git(['show-ref', '--verify', '--quiet', `refs/heads/${upgradeBranch}`]);
    if (branchProbe.status !== 0 && branchProbe.status !== 1) {
      logError('failed to inspect existing upgrade branches');
      return 40;
    }
    for (let suffix = 2; branchProbe.status === 0; suffix += 1) {
      upgradeBranch = `${branchBase}-${suffix}`;
      branchProbe = git(['show-ref', '--verify', '--quiet', `refs/heads/${upgradeBranch}`]);
      if (branchProbe.status !== 0 && branchProbe.status !== 1) {
        logError('failed to inspect existing upgrade branches');
        return 40;
      }
    }
  }
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const disabledHooksPath = fs.mkdtempSync(path.join(CACHE_ROOT, 'disabled-hooks-'));
  logInfo(`creating safety tag: ${safetyTag}`);
  if (git(['tag', safetyTag]).status !== 0) {
    fs.rmSync(disabledHooksPath, { recursive: true, force: true });
    logError(`failed to create safety tag: ${safetyTag}`);
    return 40;
  }
  logInfo(`creating upgrade branch: ${upgradeBranch}`);
  if (gitWithoutHooks(disabledHooksPath, ['checkout', '--quiet', '-b', upgradeBranch]).status !== 0) {
    fs.rmSync(disabledHooksPath, { recursive: true, force: true });
    logError(`failed to create upgrade branch: ${upgradeBranch}`);
    return 40;
  }
  const manifestOutput = renderManifest(preflight.manifestBytes, planSource, planRef, toRef);

  // ---- File operations ----
  /** @type {string[]} */
  const appliedPaths = [];
  /** @type {string[]} */
  const skippedRemoves = [];
  for (const { path: p } of plan.add) {
    const target = preflight.mutationTargets.get(p);
    const bytes = preflight.cacheBytes.get(p);
    if (!target || !bytes) throw new Error(`validated Add evidence missing for ${p}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    appliedPaths.push(p);
  }
  for (const { path: p } of plan.replace) {
    const target = preflight.mutationTargets.get(p);
    const bytes = preflight.cacheBytes.get(p);
    if (!target || !bytes) throw new Error(`validated Replace evidence missing for ${p}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    appliedPaths.push(p);
  }
  if (skipRemovals) {
    for (const { path: p } of plan.remove) skippedRemoves.push(p);
  } else {
    for (const { path: p } of plan.remove) {
      const target = preflight.mutationTargets.get(p);
      if (!target) throw new Error(`validated Remove evidence missing for ${p}`);
      fs.rmSync(target, { force: true });
      appliedPaths.push(p);
    }
  }

  // ---- Rewrite manifest ----
  fs.writeFileSync(preflight.manifestPath, manifestOutput);

  // ---- Append upgrade-log entry (placeholder patched after lint) ----
  const logPath = preflight.upgradeLogPath;
  const actualRemoved = plan.remove.length - skippedRemoves.length;
  const ts = isoNow().replace('T', ' ').replace('Z', '');
  const entry =
    `\n## ${ts} — upgrade\n` +
    `- from: ${fromRef || '(none)'}\n` +
    `- to:   ${toRef}\n` +
    `- ref:  ${planRef}\n` +
    `- replaced: ${plan.replace.length}\n` +
    `- added:    ${plan.add.length}\n` +
    `- removed:  ${actualRemoved}\n` +
    `- removals_deferred:   ${skippedRemoves.length}\n` +
    `- preserved: project files outside the base namespace\n` +
    `- safety tag: ${safetyTag}\n` +
    `- lint: __LINT_RESULT__\n` +
    `- notes: plan_id=${planId}; branch=${upgradeBranch}\n`;
  fs.appendFileSync(logPath, entry);

  // ---- Run lint, patch placeholder ----
  const lintResult = runLint();
  fs.writeFileSync(logPath, read(logPath).replace('__LINT_RESULT__', `[${lintResult}]`));

  // ---- Stage + commit ----
  const addResult = git(['add', '-A', '--', ...writePaths]);
  if (addResult.status !== 0) {
    fs.rmSync(disabledHooksPath, { recursive: true, force: true });
    logError(`git add failed while staging reviewed upgrade paths: ${addResult.stderr.trim() || 'unknown error'}`);
    return 40;
  }
  const commitResult = gitWithoutHooks(disabledHooksPath, [
    'commit', '-q', '-m', `chore: upgrade Dude bundle to ${toRef}`,
  ]);
  fs.rmSync(disabledHooksPath, { recursive: true, force: true });
  if (commitResult.status !== 0) {
    logError(`git commit failed for reviewed upgrade paths: ${commitResult.stderr.trim() || 'unknown error'}`);
    return 40;
  }
  // ---- Report ----
  if (format === 'json') {
    out(
      `${JSON.stringify(
        {
          status: 'applied',
          from_ref: fromRef,
          to_ref: toRef,
          safety_tag: safetyTag,
          upgrade_branch: upgradeBranch,
          counts: {
            replaced: plan.replace.length,
            added: plan.add.length,
            removed: actualRemoved,
            removals_deferred: skippedRemoves.length,
          },
          lint: lintResult,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    out(`Applied: ${fromRef || '(none)'} -> ${toRef}\n`);
    out(`  replaced:             ${plan.replace.length}\n`);
    out(`  added:                ${plan.add.length}\n`);
    out(`  removed:              ${actualRemoved}\n`);
    out(`  removals deferred:    ${skippedRemoves.length}\n`);
    out(`  safety tag:           ${safetyTag}\n`);
    out(`  upgrade branch:       ${upgradeBranch}\n`);
    out(`  lint:                 [${lintResult}]\n\n`);
    out(`Review:  git diff <target-branch>...${upgradeBranch}\n`);
    out(`Rollback: node .github/skills/dude-bundle-upgrade/upgrade.mjs rollback --tag ${safetyTag}\n`);
  }

  if (lintResult === 'FAIL') {
    logError(`post-apply lint reported failures; review and consider 'rollback --tag ${safetyTag}'`);
    return 40;
  }
  return 0;
}

/** @param {string[]} argv @returns {number} */
function cmdRollback(argv) {
  const { flags, error } = parseFlags(argv, new Set(['tag', 'format']), new Set());
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
    return 40;
  }
  try {
    resolveMutationPath(ROOT, WORKSPACE_PATHS.BUNDLE_MANIFEST);
  } catch (pathError) {
    logError(pathError instanceof Error ? pathError.message : String(pathError));
    return 40;
  }
  if (!hasGit() || git(['rev-parse', '--is-inside-work-tree']).status !== 0) {
    logError('not a git working tree or git missing');
    return 40;
  }
  if (git(['status', '--porcelain']).stdout.trim()) {
    logError('working tree is dirty; commit or stash changes before rollback');
    return 40;
  }

  let tag = flags.tag || '';
  if (!tag) {
    const r = git(['tag', '--list', 'dude-pre-upgrade-*', '--sort=-creatordate']);
    tag = r.stdout.split('\n')[0].trim();
    if (!tag) {
      logError('no dude-pre-upgrade-* tag found; nothing to rollback to');
      return 40;
    }
  }
  if (git(['rev-parse', '--verify', tag]).status !== 0) {
    logError(`tag not found: ${tag}`);
    return 40;
  }

  const restoredSha = git(['rev-parse', tag]).stdout.trim();
  const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  logInfo(`resetting ${currentBranch} to safety tag: ${tag} (${shortSha(restoredSha)})`);
  if (git(['reset', '--hard', tag]).status !== 0) {
    logError(`git reset --hard ${tag} failed`);
    return 40;
  }

  const logPath = resolveMutationPath(ROOT, WORKSPACE_PATHS.UPGRADE_LOG);
  if (isFile(logPath)) {
    const ts = isoNow().replace('T', ' ').replace('Z', '');
    fs.appendFileSync(
      logPath,
      `\n## ${ts} — rollback\n` +
        `- restored: ${restoredSha}\n` +
        `- safety tag: ${tag}\n` +
        `- branch: ${currentBranch}\n` +
        `- notes: appended uncommitted; commit or discard as desired\n`,
    );
  }

  const lintResult = runLint() === 'FAIL' ? 'FAIL' : 'OK';
  if (format === 'json') {
    out(
      `${JSON.stringify(
        { status: 'rolled_back', tag, restored_sha: restoredSha, branch: currentBranch, lint: lintResult },
        null,
        2,
      )}\n`,
    );
  } else {
    out(`Rolled back ${currentBranch} to ${tag} (${shortSha(restoredSha)})\n`);
    out(`Lint: [${lintResult}]\n`);
    out('Note: rollback log entry appended uncommitted; review and commit if desired.\n');
  }
  return 0;
}

function cmdHelp() {
  out(`upgrade.mjs — engine for dude-bundle-upgrade.

USAGE
  node .github/skills/dude-bundle-upgrade/upgrade.mjs <subcommand> [flags]

SUBCOMMANDS
  status     compare local manifest against upstream manifest (read-only)
  plan       fetch upstream tree, classify every file, persist plan (read-only)
  apply      apply a persisted plan: safety tag + branch + writes + commit
  rollback   reset HEAD to the most recent dude-pre-upgrade-* safety tag
  help       this message

FLAGS (status, plan)
  --format text|json   output format (default: text)
  --source <s>         override manifest source_repo (URL or local path)
  --ref <r>            override manifest source_ref (branch, tag, or sha)

FLAGS (plan)
  --out <path>         write plan.json here too; refuse if the path exists

FLAGS (apply)
  --plan <id|path>     required: persisted plan from a previous \`plan\` run
  --confirm <token>    required: must be the literal string 'confirm-upgrade'
  --skip-removals      keep Remove-bucket files instead of deleting them
  --format text|json   output format (default: text)

FLAGS (rollback)
  --tag <name>         specific safety tag to restore (default: most recent)
  --format text|json   output format (default: text)

EXIT CODES
  0   no changes, up-to-date, or action succeeded
  10  plan ready, changes detected
  40  invalid input, malformed manifest, unreachable upstream, or post-apply lint failure

NOTES
  Core files are identified by the namespace convention (.github/agents/dude*.agent.md,
  .github/skills/dude-*/**, .github/instructions/dude.instructions.md) excluding the
  reserved dude-pack-* and dude-local-* tiers, and are upstream-owned: they will be
  silently overwritten on apply. To customize a base agent or skill, copy it under the
  reserved dude-local-<slug> namespace and edit there.

  \`apply\` does not push or merge. It leaves the upgrade commit on a local
  chore/dude-upgrade-<sha> branch for the user to review and merge.

ENVIRONMENT
  UPGRADE_DEBUG=1      enable debug logging on stderr
  TMPDIR               override default /tmp for the upgrade cache
`);
}

// ----- main dispatch ---------------------------------------------------------
/** @returns {Promise<number>} */
async function main() {
  const [, , sub, ...rest] = process.argv;
  switch (sub) {
    case 'status':
      return cmdStatus(rest);
    case 'plan':
      return cmdPlan(rest);
    case 'apply':
      return cmdApply(rest);
    case 'rollback':
      return cmdRollback(rest);
    case 'help':
    case '-h':
    case '--help':
      cmdHelp();
      return 0;
    default:
      if (sub) logError(`unknown subcommand: ${sub}`);
      cmdHelp();
      return 40;
  }
}

/** @param {string} metaUrl @param {string|undefined} argv1 @returns {boolean} */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().then((code) => process.exit(code));
}
