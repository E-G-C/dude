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

const ROOT = process.cwd();
const CACHE_ROOT = path.join(process.env.TMPDIR || '/tmp', 'dude-upgrade-cache');
const PLANS_DIR = path.join(CACHE_ROOT, 'plans');
const LOCAL_MANIFEST_PATH = path.join(ROOT, '.github/dudestuff/bundle-manifest.md');
const LINT_PATH = path.join(ROOT, '.github/skills/dude-lint/lint.mjs');
const DEFAULT_SOURCE = 'https://github.com/E-G-C/dude';
const DEFAULT_REF = 'main';
// The release channel: when source_ref is this sentinel, `@dude upgrade`
// resolves the newest stable `vX.Y.Z` tag instead of tracking a branch.
const RELEASE_CHANNEL = 'latest';
const RELEASE_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

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
/** @param {number} secs @returns {string} */
const isoPlusSeconds = (secs) =>
  new Date(Date.now() + secs * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
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
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
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
/**
 * Pick the newest stable release tag (highest `vX.Y.Z` by numeric semver;
 * pre-release tags such as `v1.0.0-rc1` are ignored) from a list of tag names.
 * @param {string[]} tagNames
 * @returns {string | null}
 */
export function pickLatestReleaseTag(tagNames) {
  /** @type {[number, number, number, string] | null} */
  let best = null;
  for (const raw of tagNames) {
    const name = String(raw).trim();
    const m = RELEASE_TAG_RE.exec(name);
    if (!m) continue;
    const maj = Number(m[1]);
    const min = Number(m[2]);
    const pat = Number(m[3]);
    if (
      best === null ||
      maj > best[0] ||
      (maj === best[0] && min > best[1]) ||
      (maj === best[0] && min === best[1] && pat > best[2])
    ) {
      best = [maj, min, pat, name];
    }
  }
  return best ? best[3] : null;
}

/**
 * List candidate release tag names for a source (remote URL or local path).
 * @param {string} source
 * @returns {string[]}
 */
function listSourceTags(source) {
  if (!hasGit()) return [];
  if (isDir(source)) {
    const r = git(['tag', '--list', 'v*'], source);
    return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  }
  const r = git(['ls-remote', '--tags', '--refs', source]);
  if (r.status !== 0) return [];
  /** @type {string[]} */
  const names = [];
  for (const line of r.stdout.split('\n')) {
    const m = /refs\/tags\/(\S+)$/.exec(line.trim());
    if (m) names.push(m[1]);
  }
  return names;
}

const upstream = { source: '', ref: '', resolvedRef: '', channel: false };
/** @param {string} srcOverride @param {string} refOverride */
function resolveUpstream(srcOverride, refOverride) {
  upstream.source = srcOverride || local.source_repo || DEFAULT_SOURCE;
  upstream.ref = refOverride || local.source_ref || DEFAULT_REF;
  if (upstream.ref === RELEASE_CHANNEL) {
    upstream.channel = true;
    upstream.resolvedRef = pickLatestReleaseTag(listSourceTags(upstream.source)) || '';
  } else {
    upstream.channel = false;
    upstream.resolvedRef = upstream.ref;
  }
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
 * Fetch only the upstream bundle-manifest.md. Returns its local path or null.
 * @returns {Promise<string | null>}
 */
async function fetchUpstreamManifestOnly() {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(CACHE_ROOT, 'manifest-'));
  const outFile = path.join(outDir, 'bundle-manifest.md');

  if (isDir(upstream.source)) {
    const lm = path.join(upstream.source, '.github/dudestuff/bundle-manifest.md');
    if (isFile(lm)) {
      fs.copyFileSync(lm, outFile);
      return outFile;
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    return null;
  }

  const ownerRepo = githubOwnerRepo(upstream.source);
  if (ownerRepo) {
    const rawUrl = `https://raw.githubusercontent.com/${ownerRepo}/${upstream.resolvedRef}/.github/dudestuff/bundle-manifest.md`;
    logDebug(`fetching upstream manifest via raw url: ${rawUrl}`);
    try {
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        fs.writeFileSync(outFile, await res.text());
        return outFile;
      }
    } catch {
      /* fall through to clone */
    }
  }

  if (hasGit()) {
    const cloneDir = path.join(outDir, 'clone');
    logDebug(`shallow-cloning upstream for manifest only: ${upstream.source} @ ${upstream.resolvedRef}`);
    const r = git(['clone', '--quiet', '--depth=1', '--branch', upstream.resolvedRef, upstream.source, cloneDir]);
    const lm = path.join(cloneDir, '.github/dudestuff/bundle-manifest.md');
    if (r.status === 0 && isFile(lm)) {
      fs.copyFileSync(lm, outFile);
      return outFile;
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  return null;
}

/**
 * Fetch the full upstream tree. Returns the tree root path or null.
 * @returns {string | null}
 */
function fetchUpstreamTree() {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });

  if (isDir(upstream.source)) {
    if (!isFile(path.join(upstream.source, '.github/dudestuff/bundle-manifest.md'))) {
      logError('local upstream source is missing .github/dudestuff/bundle-manifest.md');
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

  if (isDir(path.join(dest, '.git')) && isFile(path.join(dest, '.github/dudestuff/bundle-manifest.md'))) {
    return dest;
  }

  fs.rmSync(dest, { recursive: true, force: true });
  logInfo(`fetching upstream tree: ${upstream.source} @ ${refDisplay()}`);
  if (git(['clone', '--quiet', '--depth=1', '--branch', upstream.resolvedRef, upstream.source, dest]).status === 0) {
    return dest;
  }
  if (git(['clone', '--quiet', upstream.source, dest]).status === 0) {
    if (git(['checkout', '--quiet', upstream.resolvedRef], dest).status === 0) return dest;
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
  const a = read(localFile).split('\n');
  const b = read(upstreamFile).split('\n');
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
 */

/**
 * Classify every core-owned file into replace/add/remove + advisories.
 * @param {string} utree upstream tree root
 * @param {string} [root] local repo root (defaults to the process cwd)
 * @returns {Plan}
 */
export function classifyPlan(utree, root = ROOT) {
  const localPaths = enumerateCorePaths(root);
  const localSet = new Set(localPaths);
  const upstreamPaths = enumerateCorePaths(utree);
  const upstreamSet = new Set(upstreamPaths);

  /** @type {Plan} */
  const plan = { replace: [], add: [], remove: [], advisory: [], upToDate: 0 };

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
    for (const e of fs.readdirSync(agentsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
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
    for (const e of fs.readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!e.isDirectory() || e.name === 'project') continue;
      if (classifyPath(`.github/skills/${e.name}/`) !== TIER.PROJECT) continue;
      const skillMd = path.join(skillsDir, e.name, 'SKILL.md');
      if (!isFile(skillMd)) continue;
      plan.advisory.push({ path: `.github/skills/${e.name}/SKILL.md`, kind: 'unreserved_local_skill' });
    }
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
 * @param {string} toRef @param {string} cacheDir
 */
function emitPlanText(plan, planId, fromRef, toRef, cacheDir) {
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
  if (total === 0) {
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

/**
 * @param {Plan} plan
 * @param {{plan_id: string, from_ref: string, to_ref: string, cache_dir: string, created_at: string, ttl_warn: string, ttl_expire: string}} meta
 * @returns {string}
 */
function buildPlanJson(plan, meta) {
  return `${JSON.stringify(
    {
      plan_id: meta.plan_id,
      created_at: meta.created_at,
      ttl_warn_at: meta.ttl_warn,
      ttl_expire_at: meta.ttl_expire,
      source: upstream.source,
      ref: upstream.ref,
      from_ref: meta.from_ref,
      to_ref: meta.to_ref,
      cache_dir: meta.cache_dir,
      summary: {
        replace: plan.replace.length,
        add: plan.add.length,
        remove: plan.remove.length,
        advisory: plan.advisory.length,
        up_to_date: plan.upToDate,
      },
      buckets: {
        replace: plan.replace,
        add: plan.add,
        remove: plan.remove,
        advisory: plan.advisory,
      },
    },
    null,
    2,
  )}\n`;
}

// ----- manifest write --------------------------------------------------------
/**
 * Rewrite only the fenced ```json block in the local manifest, preserving the
 * surrounding markdown wrapper.
 * @param {string} sourceRepo @param {string} sourceRef
 * @param {string} installedRef
 */
function writeManifest(sourceRepo, sourceRef, installedRef) {
  const lines = read(LOCAL_MANIFEST_PATH).split('\n');
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
  fs.writeFileSync(LOCAL_MANIFEST_PATH, [...pre, jsonText, ...post].join('\n'));
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
    if (format === 'json') emitStatusJson('error', '', 'local manifest missing or malformed');
    else logError(`local bundle manifest missing or malformed: ${LOCAL_MANIFEST_PATH}`);
    return 40;
  }
  resolveUpstream(flags.source || '', flags.ref || '');

  if (upstream.channel && !upstream.resolvedRef) {
    const detail = 'no releases published yet';
    if (format === 'json') emitStatusJson('offline', '', detail);
    else emitStatusText('offline', '', detail);
    return 0;
  }

  const manifestPath = await fetchUpstreamManifestOnly();
  if (!manifestPath) {
    if (format === 'json') emitStatusJson('offline', '', 'could not reach upstream');
    else emitStatusText('offline', '', 'could not reach upstream');
    return 0;
  }

  const body = extractManifestJson(read(manifestPath));
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
    logError(`local bundle manifest missing or malformed: ${LOCAL_MANIFEST_PATH}`);
    return 40;
  }
  resolveUpstream(flags.source || '', flags.ref || '');

  if (upstream.channel && !upstream.resolvedRef) {
    logError('no releases published yet on the release channel; nothing to upgrade to');
    return 40;
  }

  const utree = fetchUpstreamTree();
  if (!utree) return 40;

  const upstreamManifest = path.join(utree, '.github/dudestuff/bundle-manifest.md');
  if (!isFile(upstreamManifest)) {
    logError('upstream tree is missing .github/dudestuff/bundle-manifest.md');
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
    '.github/dudestuff/bundle-manifest.md',
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
  const planId = `${stampNow()}-${sanitizeRef(fromRef)}-${sanitizeRef(toRef)}`;

  fs.mkdirSync(PLANS_DIR, { recursive: true });
  const planPath = path.join(PLANS_DIR, `${planId}.json`);
  const planJson = buildPlanJson(plan, {
    plan_id: planId,
    from_ref: fromRef,
    to_ref: toRef,
    cache_dir: utree,
    created_at: createdAt,
    ttl_warn: isoPlusSeconds(3600),
    ttl_expire: isoPlusSeconds(86400),
  });
  fs.writeFileSync(planPath, planJson);
  if (flags.out) fs.copyFileSync(planPath, flags.out);

  if (format === 'json') out(planJson);
  else {
    emitPlanText(plan, planId, fromRef, toRef, utree);
    out(`\nPlan saved: ${planPath}\n`);
  }

  return plan.replace.length + plan.add.length + plan.remove.length === 0 ? 0 : 10;
}

/** @param {string[]} argv @returns {number} */
function cmdApply(argv) {
  const { flags, error } = parseFlags(
    argv,
    new Set(['plan', 'confirm', 'format']),
    new Set(['skip-removals', 'allow-dirty']),
  );
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
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
    logError(`local bundle manifest missing or malformed: ${LOCAL_MANIFEST_PATH}`);
    return 40;
  }

  let planPath = flags.plan;
  if (!isFile(planPath)) planPath = path.join(PLANS_DIR, `${flags.plan}.json`);
  if (!isFile(planPath)) {
    logError(`plan not found: ${flags.plan}`);
    return 40;
  }
  const planObj = parseManifest(read(planPath));
  if (!planObj || !planObj.to_ref || !planObj.cache_dir) {
    logError(`plan file malformed: ${planPath}`);
    return 40;
  }
  const fromRef = String(planObj.from_ref || '');
  const toRef = String(planObj.to_ref || '');
  const cacheDir = String(planObj.cache_dir || '');
  const planSource = String(planObj.source || '');
  const planRef = String(planObj.ref || '');
  const planId = String(planObj.plan_id || '');

  if (fromRef !== local.installed_ref) {
    logError(`plan from_ref (${fromRef}) does not match local installed_ref (${local.installed_ref})`);
    logError("re-run 'plan' to generate a fresh plan");
    return 40;
  }
  if (!isDir(cacheDir)) {
    logError(`plan cache_dir missing: ${cacheDir}`);
    logError("the upstream tree may have been cleaned; re-run 'plan'");
    return 40;
  }
  const ttlExpire = String(planObj.ttl_expire_at || '');
  if (ttlExpire) {
    const expEpoch = isoToEpoch(ttlExpire);
    if (expEpoch !== null && Math.floor(Date.now() / 1000) > expEpoch) {
      logError(`plan expired (created ${planObj.created_at}, expired ${ttlExpire})`);
      logError("re-run 'plan' to generate a fresh plan");
      return 40;
    }
  }
  if (!flags['allow-dirty'] && git(['status', '--porcelain']).stdout.trim()) {
    logError('working tree is dirty; commit/stash first, or pass --allow-dirty');
    return 40;
  }

  upstream.source = planSource;
  upstream.ref = planRef;
  const plan = classifyPlan(cacheDir);

  if (!isFile(path.join(cacheDir, '.github/dudestuff/bundle-manifest.md'))) {
    logError(`plan cache missing upstream manifest at ${cacheDir}/.github/dudestuff/bundle-manifest.md`);
    return 40;
  }

  const total = plan.replace.length + plan.add.length + plan.remove.length;
  if (total === 0) {
    logInfo('nothing to apply (no changes)');
    return 0;
  }

  // ---- Safety net ----
  const safetyTag = `dude-pre-upgrade-${stampNow()}`;
  let upgradeBranch = `chore/dude-upgrade-${sanitizeRef(toRef)}`;
  logInfo(`creating safety tag: ${safetyTag}`);
  if (git(['tag', safetyTag]).status !== 0) {
    logError(`failed to create safety tag: ${safetyTag}`);
    return 40;
  }
  if (git(['show-ref', '--verify', '--quiet', `refs/heads/${upgradeBranch}`]).status === 0) {
    upgradeBranch = `${upgradeBranch}-${stampNow()}`;
  }
  logInfo(`creating upgrade branch: ${upgradeBranch}`);
  if (git(['checkout', '-b', upgradeBranch]).status !== 0) {
    logError(`failed to create upgrade branch: ${upgradeBranch}`);
    git(['tag', '-d', safetyTag]);
    return 40;
  }

  // ---- File operations ----
  /** @type {string[]} */
  const appliedPaths = [];
  /** @type {string[]} */
  const skippedRemoves = [];
  for (const { path: p } of plan.add) {
    fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
    fs.copyFileSync(path.join(cacheDir, p), path.join(ROOT, p));
    appliedPaths.push(p);
  }
  for (const { path: p } of plan.replace) {
    fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
    fs.copyFileSync(path.join(cacheDir, p), path.join(ROOT, p));
    appliedPaths.push(p);
  }
  if (flags['skip-removals']) {
    for (const { path: p } of plan.remove) skippedRemoves.push(p);
  } else {
    for (const { path: p } of plan.remove) {
      fs.rmSync(path.join(ROOT, p), { force: true });
      appliedPaths.push(p);
    }
  }

  // ---- Rewrite manifest ----
  writeManifest(planSource, planRef, toRef);

  // ---- Append upgrade-log entry (placeholder patched after lint) ----
  const logPath = path.join(ROOT, '.github/dudestuff/upgrade-log.md');
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
  git(['add', '-A', '.github/dudestuff/bundle-manifest.md', '.github/dudestuff/upgrade-log.md']);
  for (const p of appliedPaths) git(['add', '-A', p]);
  if (git(['commit', '-q', '-m', `chore: upgrade Dude bundle to ${toRef}`]).status !== 0) {
    logWarn('git commit produced no changes or failed (manifest/log written; review with \'git status\')');
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
  const { flags, error } = parseFlags(argv, new Set(['tag', 'format']), new Set(['allow-dirty']));
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
    return 40;
  }
  if (!hasGit() || git(['rev-parse', '--is-inside-work-tree']).status !== 0) {
    logError('not a git working tree or git missing');
    return 40;
  }
  if (!flags['allow-dirty'] && git(['status', '--porcelain']).stdout.trim()) {
    logError('working tree is dirty; commit/stash first, or pass --allow-dirty');
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

  const logPath = path.join(ROOT, '.github/dudestuff/upgrade-log.md');
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
  --out <path>         write plan.json here in addition to the cache

FLAGS (apply)
  --plan <id|path>     required: persisted plan from a previous \`plan\` run
  --confirm <token>    required: must be the literal string 'confirm-upgrade'
  --skip-removals      keep Remove-bucket files instead of deleting them
  --allow-dirty        permit apply on a dirty working tree (default: refuse)
  --format text|json   output format (default: text)

FLAGS (rollback)
  --tag <name>         specific safety tag to restore (default: most recent)
  --allow-dirty        permit rollback on a dirty working tree (default: refuse)
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
