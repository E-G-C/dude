#!/usr/bin/env node
// @ts-check
/**
 * Engine for dude-bundle-upgrade: check for, prepare, and apply one exact
 * Dude release in place on the current branch.
 *
 * - `status` lists release tags only, within five seconds, and writes nothing.
 * - `plan` resolves the target commit, acquires its deployment bytes
 *   (`lib/release-source.mjs`), and hands them to that release's own staging
 *   function, which prepares every intended byte in a temporary snapshot and
 *   retains one prepared result under an opaque ID.
 * - `apply --plan <id> --confirm confirm-upgrade` hands the retained result to
 *   the retained target engine, which rechecks it and writes exactly its bytes
 *   as one all-or-restored batch. The changes stay uncommitted; HEAD, the
 *   branch, and the index are not touched.
 * - `discard --plan <id>` releases a prepared result that will not be applied.
 *
 * The staging contract an installed engine requires of its target release is
 * `UPGRADE_STAGING_CONTRACT`, `stageUpgrade`, and `applyPreparedUpgrade`. A
 * prepared result lives in `<os.tmpdir()>/dude-up-<random>/`: `release/` holds
 * the acquired deployment files, `stage/` the staged bytes, and `prepared.json`
 * the result's description, whose top-level `workspace` names the workspace it
 * belongs to and which marks each written file that the release makes
 * executable. Its ID is the folder's random name followed by the start of a
 * digest of that description and every retained release file, so `apply`
 * verifies the reviewed result before it runs any retained code. `apply`,
 * `discard`, and a replacing `plan` first invalidate a result by renaming its
 * description to `released.json`, which no command accepts, then remove the
 * folder as best they can and name any folder they cannot remove. A target
 * without the contract is refused as unsupported.
 *
 * Exit codes:
 *   0   status reported, nothing to update, or a successful apply or discard
 *   10  plan ready, changes detected
 *   40  invalid input, a refusal, or an apply that did not succeed
 *
 * Dependency-free beyond Node.js (>= 20) and Git.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { belongsToPack, classifyPath, TIER } from '../dude-engine/lib/ownership.mjs';
import { RELEASE_CHANNEL } from '../dude-engine/lib/release-channel.mjs';
import {
  DEVELOPMENT_INSTALLED_REF,
  parseDevelopmentBaseRelease,
  renderDevelopmentBaseRelease,
} from '../dude-engine/lib/development-base-release.mjs';
import { WORKSPACE_PATHS, resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import {
  ACQUISITION_DEADLINE_MS,
  ReleaseSourceError,
  acquireRelease,
  compareReleaseTags,
  deadlineSignal,
  foregroundGitEnvironment,
  githubReleaseUrl,
  isGitHubHost,
  isRemoteAddress,
  isStableReleaseTag,
  latestStableRelease,
  observeRoot,
  resolveTarget,
  runOwned,
} from './lib/release-source.mjs';

export const UPGRADE_STAGING_CONTRACT = 1;

const CONTRACT_MARKER = `export const UPGRADE_STAGING_CONTRACT = ${UPGRADE_STAGING_CONTRACT};`;
const CONFIRM_TOKEN = 'confirm-upgrade';
const PREPARED_PREFIX = 'dude-up-';
// A prepared folder is named by 16 random hex digits; the ID adds 16 more,
// the start of the digest that binds the result (see `resultDigest`).
const FOLDER_NAME_RE = /^[0-9a-f]{16}$/;
const PREPARED_ID_RE = /^[0-9a-f]{32}$/;
const PREPARED_FILE = 'prepared.json';
// An invalidated result's description, which no command accepts.
const RELEASED_FILE = 'released.json';
const PREPARED_KIND = 'dude-prepared-upgrade';
const MIB = 1_048_576;
// One prepared result fits the atomic batch's fixed upgrade bound.
const MAX_CHANGES = 8_192;
const MAX_RETAINED_BYTES = 256 * MIB;
// A whole preparation ends within the core acquisition window plus this window
// for each pack it prepares; each pack fetch keeps Compose's own smaller bound.
const PACK_WINDOW_MS = 130_000;
const COMPOSE_OUTPUT_BYTES = 1 * MIB;
// This release's Compose, run as a child process to prepare each pack.
const COMPOSE_CLI = fileURLToPath(new URL('../dude-compose/compose.mjs', import.meta.url));
const LINT_DEADLINE_MS = 120_000;
const LINT_OUTPUT_BYTES = 16 * MIB;
const LOCAL_GIT_DEADLINE_MS = 30_000;
const PACK_LOCATIONS = Object.freeze(['.github/agents', '.github/skills', '.github/instructions', '.github/prompts']);
const MANIFEST = WORKSPACE_PATHS.BUNDLE_MANIFEST;
const BASE_RELEASE = WORKSPACE_PATHS.DEVELOPMENT_BASE_RELEASE;
const UPGRADE_LOG = WORKSPACE_PATHS.UPGRADE_LOG;
const PROFILE = WORKSPACE_PATHS.PROFILE;
const ANSI_RE = /\u001b\[[0-9;]*m/g;
// The permission apply writes for a file the reviewed result marks executable:
// Git's executable file mode.
const EXECUTABLE_MODE = 0o755;

/**
 * @typedef {{ location: string, requested_ref: string, resolved_ref: string, commit: string }} SourceIdentity
 * @typedef {{ sha256: string, size: number }} FileState
 * @typedef {{ path: string, group: 'core' | 'metadata' | 'pack', pack: string | null,
 *   op: 'add' | 'replace' | 'remove', before: FileState | null, after: FileState | null,
 *   executable?: true }} Change
 * @typedef {(event: Readonly<{ phase: string, pack?: string, completed?: number, total?: number }>) => void} ProgressListener
 */

/* ---------------------------------------------------------------- output */

const color = Boolean(process.stderr.isTTY);
const RED = color ? '\u001b[31m' : '';
const RST = color ? '\u001b[0m' : '';
/** @param {string} message */
const logError = (message) => process.stderr.write(`${RED}[upgrade]${RST} ${message}\n`);
/** @param {string} text */
const out = (text) => process.stdout.write(text);
/** @param {unknown} value */
const writeJson = (value) => out(`${JSON.stringify(value, null, 2)}\n`);

/* --------------------------------------------------------------- helpers */

/**
 * How long one Compose child may prepare a pack from `location`. A github.com
 * pack is read over HTTPS within Compose's own 120-second bound. Any other
 * source may be cloned by Compose's synchronous Git, so its child is stopped
 * at the core acquisition window, before that Git's 60-second deadline.
 * @param {string} location
 */
export function composeStopWindowMs(location) {
  return isGitHubHost(location) ? PACK_WINDOW_MS : ACQUISITION_DEADLINE_MS;
}

/**
 * A Compose child's environment: the same noninteractive Git environment as
 * core acquisition, with every temporary root inside `temporary`.
 * @param {string} temporary
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function composeEnvironment(temporary, base = process.env) {
  return { ...foregroundGitEnvironment(base), TMPDIR: temporary, TMP: temporary, TEMP: temporary };
}

/** @param {string} a @param {string} b */
const codeUnitCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** @param {Buffer} bytes */
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
/** @param {Buffer | null} bytes @returns {FileState | null} */
const stateOf = (bytes) => (bytes === null ? null : { sha256: sha256(bytes), size: bytes.length });
/** @param {FileState | null} left @param {FileState | null} right */
const sameState = (left, right) => (left === null || right === null
  ? left === right
  : left.sha256 === right.sha256 && left.size === right.size);
/** @returns {string} ISO 8601 UTC at seconds precision. */
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
/** @param {unknown} error */
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

/**
 * An expected refusal: `reason` classifies it for structured callers.
 * @param {string} reason
 * @param {string} detail
 * @param {Record<string, unknown>} [extra]
 */
function refusal(reason, detail, extra = {}) {
  return Object.assign(new Error(detail), { reason, ...extra });
}

/**
 * Refuse once the preparation's caller cancelled it or its deadline passed.
 * The absolute deadline (a `Date.now()` time) is read from the clock, because
 * local work runs synchronously and never yields to a timer.
 * @param {AbortSignal | undefined} signal
 * @param {string} [timeoutDetail]
 * @param {number} [deadlineAt]
 */
function checkStopped(signal, timeoutDetail = 'the preparation did not finish in time', deadlineAt = Infinity) {
  if (signal?.aborted) {
    throw /** @type {any} */ (signal.reason)?.name === 'TimeoutError'
      ? refusal('timeout', timeoutDetail)
      : refusal('cancelled', 'the preparation was cancelled');
  }
  if (Date.now() >= deadlineAt) throw refusal('timeout', timeoutDetail);
}

/** @param {unknown} error @param {string | null} note @returns {unknown} */
function withNote(error, note) {
  if (note && error instanceof Error) error.message = `${error.message}; ${note}`;
  return error;
}

/** @param {string} absolutePath */
function lstatOrNull(absolutePath) {
  try {
    return fs.lstatSync(absolutePath);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * The bytes of one regular file under `root`, or null when it is absent.
 * Symbolic links, unsafe parents, and other file types refuse.
 * @param {string} root
 * @param {string} relativePath
 * @returns {Buffer | null}
 */
function readFileOrNull(root, relativePath) {
  const absolutePath = resolveMutationPath(root, relativePath);
  const stat = lstatOrNull(absolutePath);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`expected a regular file at ${relativePath}`);
  return fs.readFileSync(absolutePath);
}

/** @param {string} root @param {string} relativePath @param {Buffer | string} bytes */
function writeFileUnder(root, relativePath, bytes) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
}

/** @param {string} root @param {string} relativePath */
function removeFileUnder(root, relativePath) {
  fs.rmSync(path.join(root, ...relativePath.split('/')), { force: true });
}

/**
 * Every regular file at or under one relative path, sorted.
 * @param {string} root
 * @param {string} relativePath
 * @returns {string[]}
 */
function listFiles(root, relativePath) {
  const stat = lstatOrNull(resolveMutationPath(root, relativePath));
  if (!stat) return [];
  if (stat.isSymbolicLink()) throw new Error(`${relativePath} is a symbolic link`);
  if (stat.isFile()) return [relativePath];
  if (!stat.isDirectory()) throw new Error(`${relativePath} is not a regular file or directory`);
  return fs.readdirSync(path.join(root, ...relativePath.split('/')))
    .sort(codeUnitCompare)
    .flatMap((name) => listFiles(root, `${relativePath}/${name}`));
}

/** @param {string} fromRoot @param {string} toRoot @param {string} relativePath */
function copyTree(fromRoot, toRoot, relativePath) {
  for (const file of listFiles(fromRoot, relativePath)) {
    writeFileUnder(toRoot, file, /** @type {Buffer} */ (readFileOrNull(fromRoot, file)));
  }
}

/* ------------------------------------------------------------- manifest */

/** @param {string} content @returns {string | null} the fenced ```json block body */
function extractManifestJson(content) {
  const match = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(content);
  return match ? match[1] : null;
}

/**
 * @param {unknown} value
 * @returns {string[]} error messages (empty when valid)
 */
function validateMetadataManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['the JSON is malformed'];
  const obj = /** @type {Record<string, unknown>} */ (value);
  /** @type {string[]} */
  const errors = [];
  for (const key of Object.keys(obj)) {
    if (!['source_repo', 'source_ref', 'installed_ref'].includes(key)) errors.push(`unsupported field '${key}'`);
  }
  if (typeof obj.source_repo !== 'string' || !obj.source_repo) errors.push('missing source_repo');
  if (typeof obj.source_ref !== 'string' || !obj.source_ref) errors.push('missing source_ref');
  // installed_ref may be empty on a fresh install but is always a string: a
  // version tag or a branch/ref name.
  if (obj.installed_ref !== undefined && typeof obj.installed_ref !== 'string') errors.push('installed_ref must be a string');
  return errors;
}

function localManifestError() {
  return `canonical bundle manifest missing or malformed at ${MANIFEST}; install or copy a current bundle engine and metadata, or reinstall the current bundle while preserving project data`;
}

/**
 * Read and validate the bundle manifest under `root`.
 * @param {string} root
 * @param {'local' | 'target'} label
 * @returns {{ bytes: Buffer, data: { source_repo: string, source_ref: string, installed_ref: string } }}
 */
function readManifest(root, label) {
  let bytes = null;
  let parsed = null;
  try {
    bytes = readFileOrNull(root, MANIFEST);
    const body = bytes && extractManifestJson(bytes.toString('utf8'));
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  const errors = validateMetadataManifest(parsed);
  if (!bytes || errors.length > 0) {
    throw label === 'local'
      ? refusal('invalid-manifest', localManifestError())
      : refusal('invalid-target', `the target release has no valid ${MANIFEST}: ${errors[0] ?? 'missing'}`);
  }
  return {
    bytes,
    data: {
      source_repo: parsed.source_repo,
      source_ref: parsed.source_ref,
      installed_ref: typeof parsed.installed_ref === 'string' ? parsed.installed_ref : '',
    },
  };
}

/**
 * Rewrite only the fenced ```json block, preserving the surrounding markdown.
 * @param {Buffer} originalBytes
 * @param {{ source_repo: string, source_ref: string, installed_ref: string }} data
 */
function renderManifest(originalBytes, data) {
  const lines = originalBytes.toString('utf8').split('\n');
  /** @type {string[]} */
  const before = [];
  let index = 0;
  for (; index < lines.length; index += 1) {
    before.push(lines[index]);
    if (/^```json\s*$/.test(lines[index])) {
      index += 1;
      break;
    }
  }
  /** @type {string[]} */
  const after = [];
  let closed = false;
  for (; index < lines.length; index += 1) {
    if (!closed && /^```\s*$/.test(lines[index])) closed = true;
    if (closed) after.push(lines[index]);
  }
  return Buffer.from([...before, JSON.stringify(data, null, 2), ...after].join('\n'));
}

/* -------------------------------------------------- base release record */

/**
 * A base release record from regular-file bytes. A malformed payload is
 * unknown provenance (null), never an error.
 * @param {Buffer | null} bytes
 * @returns {{ source_repo: string, base_release: string } | null}
 */
function usableBaseRelease(bytes) {
  if (!bytes) return null;
  try {
    const { source_repo: sourceRepo, base_release: baseRelease } = parseDevelopmentBaseRelease(bytes);
    return { source_repo: sourceRepo, base_release: baseRelease };
  } catch {
    return null;
  }
}

/**
 * The record an upgrade leaves. Only a `main` target from an upstream
 * development bundle carries provenance: the upstream record must belong to
 * that bundle's manifest source, and the local copy is bound to the selected
 * source. Everything else leaves no record.
 * @param {{ toRef: string, sourceLocation: string,
 *   upstreamManifest: { source_repo: string, installed_ref: string },
 *   upstreamRecord: { source_repo: string, base_release: string } | null }} evidence
 */
function desiredBaseRelease({ toRef, sourceLocation, upstreamManifest, upstreamRecord }) {
  if (toRef !== DEVELOPMENT_INSTALLED_REF || !upstreamRecord
    || upstreamManifest.installed_ref !== DEVELOPMENT_INSTALLED_REF
    || upstreamManifest.source_repo !== upstreamRecord.source_repo) {
    return null;
  }
  return { source_repo: sourceLocation, base_release: upstreamRecord.base_release };
}

/* ---------------------------------------------------------- core inventory */

/**
 * Enumerate core files while refusing namespace candidates hidden from the
 * regular-file enumerator by a symlink or incompatible file type.
 * @param {string} root
 * @param {string} label
 * @returns {string[]}
 */
export function scanCoreInventoryPaths(root, label) {
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
  const walkCoreDirectory = (relativeDirectory) => {
    const absoluteDirectory = path.join(root, ...relativeDirectory.split('/'));
    for (const name of fs.readdirSync(absoluteDirectory).sort(codeUnitCompare)) {
      const relativePath = `${relativeDirectory}/${name}`;
      const stat = safeLstat(relativePath);
      if (!stat) continue;
      if (stat.isDirectory()) walkCoreDirectory(relativePath);
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
      walkCoreDirectory(relativeDirectory);
    }
  }

  if (requireDirectory('.github/extensions')) {
    const dudeExtensionDirectory = '.github/extensions/dude';
    const stat = safeLstat(dudeExtensionDirectory);
    if (stat) {
      if (!stat.isDirectory()) throw new Error(`${label} type changed: ${dudeExtensionDirectory}`);
      walkCoreDirectory(dudeExtensionDirectory);
    }
  }

  return results.sort(codeUnitCompare);
}

/* --------------------------------------------------------- workspace Git */

/** @param {string} root @param {string[]} args */
function workspaceGit(root, args) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: LOCAL_GIT_DEADLINE_MS,
    maxBuffer: 16 * MIB,
  });
}

/** @param {string} root */
function requireWorkTree(root) {
  const result = workspaceGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (/** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === 'ENOENT') {
    throw refusal('git-missing', 'Git is required to check or prepare an upgrade; install Git and try again');
  }
  if (result.status !== 0 || result.stdout.trim() !== 'true') {
    throw refusal('not-a-work-tree', "not a Git working tree (run 'git init' in the project root, then try again)");
  }
}

/** The current branch name, or `detached at <commit>`. @param {string} root */
function currentBranch(root) {
  const symbolic = workspaceGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (symbolic.status === 0 && symbolic.stdout.trim()) return symbolic.stdout.trim();
  const head = workspaceGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (head.status === 0 && head.stdout.trim()) return `detached at ${head.stdout.trim().slice(0, 12)}`;
  throw refusal('not-a-work-tree', 'the current branch could not be read');
}

/**
 * Touched paths with uncommitted or staged edits, from a status read that
 * takes no optional index lock. Committed customizations are not detectable.
 * @param {string} root
 * @param {string[]} touched
 */
function knownDirtyPaths(root, touched) {
  const prefix = workspaceGit(root, ['rev-parse', '--show-prefix']);
  const status = workspaceGit(root, [
    '--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.github', '.dude/metadata',
  ]);
  if (prefix.status !== 0 || status.status !== 0) {
    throw refusal('git-failed', `could not read the working tree status: ${(status.stderr || prefix.stderr || '').trim()}`);
  }
  const relativeTo = prefix.stdout.trim();
  /** @type {Set<string>} */
  const dirty = new Set();
  const tokens = status.stdout.split('\0');
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const named = [token.slice(3)];
    if (token[0] === 'R' || token[0] === 'C') {
      named.push(tokens[index + 1] ?? '');
      index += 1;
    }
    for (const name of named) {
      if (name.startsWith(relativeTo)) dirty.add(name.slice(relativeTo.length));
    }
  }
  return touched.filter((relativePath) => dirty.has(relativePath));
}

/* ------------------------------------------------------------------ lint */

/**
 * Run the retained target linter against the workspace. A normal failure
 * report is a readable result; a crash, timeout, oversized output, or a report
 * whose summary and exit status disagree is not.
 * @param {string} lintPath
 * @param {string} workspace
 * @returns {{ ok: true, failures: string[] } | { ok: false, detail: string }}
 */
function runTargetLint(lintPath, workspace) {
  const result = spawnSync(process.execPath, [lintPath, workspace], {
    cwd: workspace,
    encoding: 'utf8',
    windowsHide: true,
    timeout: LINT_DEADLINE_MS,
    maxBuffer: LINT_OUTPUT_BYTES,
  });
  if (result.error) {
    const code = /** @type {NodeJS.ErrnoException} */ (result.error).code;
    return {
      ok: false,
      detail: code === 'ETIMEDOUT' ? `it did not finish within ${LINT_DEADLINE_MS / 1_000} seconds`
        : code === 'ENOBUFS' ? `its report exceeded ${LINT_OUTPUT_BYTES / MIB} MiB`
          : result.error.message,
    };
  }
  if (result.signal) return { ok: false, detail: `it was stopped by ${result.signal}` };
  const lines = result.stdout.split('\n').map((line) => line.replace(ANSI_RE, '').replace(/\r$/, ''));
  const roots = [workspace, workspace.split(path.sep).join('/')];
  const failures = lines.filter((line) => line.startsWith('[FAIL]')).map((line) => {
    let text = line.slice('[FAIL]'.length).trim();
    for (const root of roots) text = text.split(root).join('<root>');
    return text;
  });
  const summaries = lines
    .map((line) => /^\[INFO\]\s+Findings: \d+ warning\(s\), (\d+) failure\(s\)$/.exec(line.trim()))
    .filter((match) => match !== null);
  const summary = summaries.at(-1);
  if (!summary || Number(summary[1]) !== failures.length || result.status !== (failures.length > 0 ? 1 : 0)) {
    return { ok: false, detail: `its report was unreadable (exit ${result.status})` };
  }
  return { ok: true, failures };
}

/**
 * Failures in `after` that `before` does not account for, by identity and
 * occurrence count; a same-count replacement is still new.
 * @param {string[]} before
 * @param {string[]} after
 */
function introducedFailures(before, after) {
  /** @type {Map<string, number>} */
  const remaining = new Map();
  for (const failure of before) remaining.set(failure, (remaining.get(failure) ?? 0) + 1);
  /** @type {string[]} */
  const introduced = [];
  for (const failure of after) {
    const left = remaining.get(failure) ?? 0;
    if (left > 0) remaining.set(failure, left - 1);
    else introduced.push(failure);
  }
  return introduced;
}

/* ------------------------------------------------------------- changes */

/**
 * Whether the regular file at `relativePath` under `root` is executable. No
 * file is on Windows, which has no such permission.
 * @param {string} root
 * @param {string} relativePath
 */
function isExecutable(root, relativePath) {
  return process.platform !== 'win32' && (fs.lstatSync(resolveMutationPath(root, relativePath)).mode & 0o111) !== 0;
}

/**
 * Actual byte differences between the workspace and the staged snapshot. A
 * file that differs only in permission is no change. An added or replaced file
 * is marked `executable` when its source in `executableRoot` is executable:
 * the acquired release for core files, the target's own Compose projection
 * for pack files, and no source for metadata.
 * @param {string[]} paths
 * @param {string} workspace
 * @param {string} stageRoot
 * @param {Change['group']} group
 * @param {string | null} pack
 * @param {string | null} executableRoot
 * @returns {Change[]}
 */
function diffPaths(paths, workspace, stageRoot, group, pack, executableRoot) {
  /** @type {Change[]} */
  const changes = [];
  for (const relativePath of paths) {
    const before = readFileOrNull(workspace, relativePath);
    const after = readFileOrNull(stageRoot, relativePath);
    if (before === null && after === null) continue;
    if (before !== null && after !== null && before.equals(after)) continue;
    /** @type {Change} */
    const change = {
      path: relativePath,
      group,
      pack,
      op: before === null ? 'add' : after === null ? 'remove' : 'replace',
      before: stateOf(before),
      after: stateOf(after),
    };
    if (after !== null && executableRoot !== null && isExecutable(executableRoot, relativePath)) change.executable = true;
    changes.push(change);
  }
  return changes;
}

/** @param {Change[]} changes */
function countChanges(changes) {
  const empty = () => ({ added: 0, replaced: 0, removed: 0 });
  /** @type {{ core: ReturnType<typeof empty>, metadata: ReturnType<typeof empty>, packs: Record<string, ReturnType<typeof empty>> }} */
  const counts = { core: empty(), metadata: empty(), packs: {} };
  for (const change of changes) {
    const bucket = change.group === 'pack'
      ? (counts.packs[/** @type {string} */ (change.pack)] ??= empty())
      : counts[change.group];
    bucket[change.op === 'add' ? 'added' : change.op === 'remove' ? 'removed' : 'replaced'] += 1;
  }
  return counts;
}

/** @param {{ added: number, replaced: number, removed: number }} counts */
function describeCounts(counts) {
  return `${counts.replaced} replaced, ${counts.added} added, ${counts.removed} removed`;
}

/**
 * Copy every workspace entry in one pack's namespace, so Compose sees the
 * same recorded files and the same foreign destinations as the project.
 * @param {string} workspace
 * @param {string} stageRoot
 * @param {string} name
 */
function copyPackNamespace(workspace, stageRoot, name) {
  for (const location of PACK_LOCATIONS) {
    const stat = lstatOrNull(resolveMutationPath(workspace, location));
    if (!stat?.isDirectory() || stat.isSymbolicLink()) continue;
    for (const entry of fs.readdirSync(path.join(workspace, ...location.split('/'))).sort(codeUnitCompare)) {
      if (belongsToPack(`${location}/${entry}`, name)) copyTree(workspace, stageRoot, `${location}/${entry}`);
    }
  }
}

/**
 * Refresh one eligible pack in the staging copy through this release's own
 * Compose, run as a child process this one owns. Compose's other-host Git is
 * synchronous and its own deadline stops only Git's launcher, so a deadline, a
 * cancellation, or the observed folder bound stops the whole child process tree
 * from here, as for core acquisition. That stop ends Compose before its Git, so
 * a Git that ends first cannot release Compose into its full-clone fallback.
 * Compose keeps its temporary roots in `temporary`; anything left there once
 * Compose ends by itself is material a process may still use, so it is kept
 * and reported rather than removed.
 * @param {{
 *   name: string,
 *   stageRoot: string,
 *   source: SourceIdentity,
 *   temporary: string,
 *   env: NodeJS.ProcessEnv,
 *   windowMs: number,
 *   signal: AbortSignal,
 *   cancelled: () => boolean,
 *   deadline: AbortSignal,
 *   deadlineDetail: string,
 * }} input
 */
async function refreshPackInChild({
  name, stageRoot, source, temporary, env, windowMs, signal, cancelled, deadline, deadlineDetail,
}) {
  /** @param {string} detail @param {boolean} [cleanupConfirmed] */
  const failed = (detail, cleanupConfirmed = true) => refusal(
    'pack-failed',
    `pack "${name}" could not be prepared from ${source.location} at ${source.commit.slice(0, 12)}: ${detail}; prepare without packs for a core-only result`,
    { pack: name, cleanupConfirmed },
  );
  let result;
  const packDeadline = deadlineSignal(windowMs, signal);
  try {
    result = await runOwned(process.execPath, [
      COMPOSE_CLI, 'refresh', name,
      '--root', stageRoot,
      '--library', path.join(stageRoot, 'library', 'packs'),
      // An explicit source at the exact target commit: the project's own
      // `library/` cannot take precedence.
      '--source', source.location,
      '--ref', source.commit,
      '--json',
    ], {
      name: 'Compose',
      env,
      signal: packDeadline.signal,
      deadlineLabel: `it did not finish within ${windowMs / 1_000} seconds`,
      maxOutput: COMPOSE_OUTPUT_BYTES,
    });
  } catch (error) {
    const cleanupConfirmed = /** @type {any} */ (error)?.cleanupConfirmed !== false;
    if (cancelled()) throw refusal('cancelled', 'the preparation was cancelled', { cleanupConfirmed });
    if (deadline.aborted) throw refusal('timeout', deadlineDetail, { cleanupConfirmed });
    throw failed(errorMessage(error), cleanupConfirmed);
  } finally {
    packDeadline.dispose();
  }
  if (fs.readdirSync(temporary).length > 0) {
    throw failed('Compose ended but left temporary material that a process may still use', false);
  }
  /** @type {any} */
  let answer = null;
  try {
    answer = JSON.parse(result.stdout.toString('utf8'));
  } catch {
    answer = null;
  }
  if (answer?.ok !== true) {
    const stderr = result.stderr.split('\n').map((line) => line.trim()).find(Boolean);
    throw failed(typeof answer?.error === 'string' ? answer.error
      : `Compose ended without a result (exit ${result.code})${stderr ? `: ${stderr}` : ''}`);
  }
}

/* ===================================================== staging contract */

/**
 * The staging contract, run from the target release's retained files:
 * prepare every intended byte of one upgrade in `preparedRoot/stage` and
 * retain the result for a later apply. Core files come from this release,
 * selected eligible packs from this release's Compose at the target commit,
 * and the manifest, base release record, and one upgrade-log entry follow
 * from them. A result with no actual difference retains nothing.
 *
 * The whole preparation, counted from `startedAt`, ends within the core
 * acquisition window plus one pack window for each pack it prepares. Packs are
 * prepared by Compose child processes whose temporary roots stay inside
 * `preparedRoot`, which is observed while they run. A failure that could not
 * confirm a child process stopped carries `cleanupConfirmed: false`: the caller
 * must keep `preparedRoot` and name it.
 * @param {{
 *   workspaceRoot: string,
 *   preparedRoot: string,
 *   source: SourceIdentity,
 *   includePacks: boolean,
 *   startedAt?: number,
 *   signal?: AbortSignal,
 *   onProgress?: ProgressListener,
 * }} input
 */
export async function stageUpgrade({
  workspaceRoot, preparedRoot, source, includePacks, startedAt = Date.now(), signal, onProgress,
}) {
  /** @param {{ phase: string, pack?: string, completed?: number, total?: number }} event */
  const progress = (event) => onProgress?.(Object.freeze(event));
  const workspace = fs.realpathSync.native(workspaceRoot);
  const releaseRoot = path.join(preparedRoot, 'release');
  const stageRoot = path.join(preparedRoot, 'stage');
  checkStopped(signal);
  requireWorkTree(workspace);
  const branch = currentBranch(workspace);
  const local = readManifest(workspace, 'local');
  const target = readManifest(releaseRoot, 'target');
  for (const required of ['.github/agents', '.github/skills/dude-lint/lint.mjs', '.github/instructions/dude.instructions.md']) {
    if (!lstatOrNull(path.join(releaseRoot, ...required.split('/')))) {
      throw refusal('invalid-target', `the target release is missing ${required}`);
    }
  }
  const fromRef = local.data.installed_ref;
  const toRef = source.resolved_ref;

  progress({ phase: 'staging-core' });
  const targetCore = scanCoreInventoryPaths(releaseRoot, 'target release');
  const currentCore = scanCoreInventoryPaths(workspace, 'workspace');
  fs.mkdirSync(stageRoot);
  for (const relativePath of targetCore) {
    writeFileUnder(stageRoot, relativePath, /** @type {Buffer} */ (readFileOrNull(releaseRoot, relativePath)));
  }
  /** @type {Map<string, Buffer | null>} */
  const metadata = new Map();
  for (const relativePath of [MANIFEST, BASE_RELEASE, UPGRADE_LOG, PROFILE]) {
    const bytes = readFileOrNull(workspace, relativePath);
    metadata.set(relativePath, bytes);
    if (bytes !== null) writeFileUnder(stageRoot, relativePath, bytes);
  }

  // Eligible packs: installed membership whose recorded source matches the
  // bundle upstream. A catalog name alone is neither.
  const compose = await import('../dude-compose/compose.mjs');
  const status = compose.cmdStatus({ root: workspace });
  if (!status.ok) throw refusal('invalid-profile', `${PROFILE} is invalid: ${status.error}`);
  const { describeBuiltinSources, matchesRecordedSource } = await import('../dude-engine/lib/pack-sources.mjs');
  const upstream = describeBuiltinSources({
    root: workspace,
    upstream: { source_repo: source.location, source_ref: source.requested_ref },
  }).find((builtin) => builtin.builtin === 'bundle-upstream');
  /** @type {Record<string, { files: string[], source: unknown }>} */
  const installed = status.result.installed;
  const eligible = Object.keys(installed)
    .filter((name) => upstream !== undefined && matchesRecordedSource(upstream, installed[name].source))
    .sort(codeUnitCompare);
  const refreshPacks = includePacks && eligible.length > 0;
  const budgetMs = ACQUISITION_DEADLINE_MS + (refreshPacks ? eligible.length : 0) * PACK_WINDOW_MS;
  // One absolute deadline counted from `startedAt`. An exhausted budget is
  // refused here, and the clock is read again between the steps that follow
  // and immediately before the result is retained.
  const deadlineAt = startedAt + budgetMs;
  const deadlineDetail = `the preparation did not finish within ${budgetMs / 1_000} seconds`;
  checkStopped(signal, deadlineDetail, deadlineAt);

  /** @type {Change[]} */
  const packChanges = [];
  /** @type {string[]} */
  const affected = [];
  /** @type {string[]} */
  const unchanged = [];
  if (refreshPacks) {
    for (const name of eligible) copyPackNamespace(workspace, stageRoot, name);
    // Compose's temporary roots, inside this prepared folder; its Git gets the
    // same noninteractive environment as core acquisition.
    const temporary = path.join(preparedRoot, 'tmp');
    fs.mkdirSync(temporary);
    const env = composeEnvironment(temporary);
    const windowMs = composeStopWindowMs(source.location);
    // The same deadline as a timer, which stops a pack's child process.
    const deadline = deadlineSignal(Math.max(0, deadlineAt - Date.now()), signal);
    const observed = observeRoot(preparedRoot, deadline.signal);
    try {
      for (const [index, name] of eligible.entries()) {
        checkStopped(signal, deadlineDetail, deadlineAt);
        progress({ phase: 'preparing-pack', pack: name, completed: index, total: eligible.length });
        const profileBefore = /** @type {Buffer} */ (readFileOrNull(stageRoot, PROFILE));
        await refreshPackInChild({
          name,
          stageRoot,
          source,
          temporary,
          env,
          windowMs,
          signal: observed.signal,
          cancelled: () => Boolean(signal?.aborted),
          deadline: deadline.signal,
          deadlineDetail,
        });
        const recorded = [...installed[name].files, ...compose.readProfile(stageRoot).installed[name].files];
        /** @type {Set<string>} */
        const files = new Set();
        for (const entry of recorded) {
          for (const file of listFiles(workspace, entry)) files.add(file);
          for (const file of listFiles(stageRoot, entry)) files.add(file);
        }
        const changes = diffPaths([...files].sort(codeUnitCompare), workspace, stageRoot, 'pack', name, stageRoot);
        if (changes.length === 0) {
          // No projected-file difference: keep the pack's existing record.
          writeFileUnder(stageRoot, PROFILE, profileBefore);
          unchanged.push(name);
        } else {
          affected.push(name);
          packChanges.push(...changes);
        }
      }
    } finally {
      observed.stop();
      deadline.dispose();
    }
    fs.rmdirSync(temporary);
  }
  checkStopped(signal, deadlineDetail, deadlineAt);
  progress({ phase: 'comparing' });

  const nextManifest = { source_repo: source.location, source_ref: source.requested_ref, installed_ref: toRef };
  if (local.data.source_repo !== nextManifest.source_repo
    || local.data.source_ref !== nextManifest.source_ref
    || local.data.installed_ref !== nextManifest.installed_ref) {
    writeFileUnder(stageRoot, MANIFEST, renderManifest(local.bytes, nextManifest));
  }
  const localRecordBytes = /** @type {Buffer | null} */ (metadata.get(BASE_RELEASE));
  const localRecord = usableBaseRelease(localRecordBytes);
  const desired = desiredBaseRelease({
    toRef,
    sourceLocation: source.location,
    upstreamManifest: target.data,
    upstreamRecord: usableBaseRelease(readFileOrNull(releaseRoot, BASE_RELEASE)),
  });
  if (desired === null) {
    if (localRecordBytes !== null) removeFileUnder(stageRoot, BASE_RELEASE);
  } else if (localRecord?.source_repo !== desired.source_repo || localRecord?.base_release !== desired.base_release) {
    // Records compare by value, so an equal record in other bytes stays.
    writeFileUnder(stageRoot, BASE_RELEASE, renderDevelopmentBaseRelease(desired));
  }

  const corePaths = [...new Set([...currentCore, ...targetCore])].sort(codeUnitCompare);
  const changes = [
    ...diffPaths(corePaths, workspace, stageRoot, 'core', null, releaseRoot),
    ...diffPaths([MANIFEST, BASE_RELEASE, ...(refreshPacks ? [PROFILE] : [])], workspace, stageRoot, 'metadata', null, null),
    ...packChanges,
  ];
  const packs = {
    eligible,
    selected: includePacks,
    affected,
    unchanged,
    not_selected: includePacks ? [] : eligible,
  };
  const baseRelease = {
    from: localRecord?.base_release ?? (localRecordBytes ? '(unusable)' : null),
    to: desired?.base_release ?? null,
    changed: changes.some((change) => change.path === BASE_RELEASE),
  };
  if (changes.length === 0) {
    return {
      status: 'nothing_to_update',
      id: null,
      from_ref: fromRef,
      to_ref: toRef,
      source,
      branch,
      include_packs: includePacks,
      packs,
      detail: `the installed bundle already matches ${toRef}`,
    };
  }

  // One immutable log entry, written now as part of the prepared bytes.
  const createdAt = isoNow();
  const counts = countChanges(changes);
  const packSummary = Object.entries(counts.packs).map(([name, packCounts]) => `${name} (${describeCounts(packCounts)})`);
  const logBefore = /** @type {Buffer | null} */ (metadata.get(UPGRADE_LOG));
  const entry = [
    '',
    `## ${createdAt} — upgrade`,
    `- from: ${fromRef || '(none)'}`,
    `- to: ${toRef}`,
    `- ref: ${source.requested_ref}`,
    `- commit: ${source.commit}`,
    `- core: ${describeCounts(counts.core)}`,
    `- packs: ${packSummary.length > 0 ? packSummary.join('; ') : 'none'}`,
    ...(baseRelease.changed ? [`- base release record: ${baseRelease.from ?? '(none)'} -> ${baseRelease.to ?? '(none)'}`] : []),
    `- notes: left uncommitted on ${branch}`,
    '',
  ].join('\n');
  const logPrefix = logBefore === null ? Buffer.from('# Upgrade Log\n')
    : logBefore.length > 0 && logBefore[logBefore.length - 1] !== 0x0a ? Buffer.concat([logBefore, Buffer.from('\n')])
      : logBefore;
  writeFileUnder(stageRoot, UPGRADE_LOG, Buffer.concat([logPrefix, Buffer.from(entry)]));
  changes.push(...diffPaths([UPGRADE_LOG], workspace, stageRoot, 'metadata', null, null));
  changes.sort((left, right) => codeUnitCompare(left.path, right.path));

  const retained = changes.reduce((sum, change) => sum + (change.before?.size ?? 0) + (change.after?.size ?? 0), 0);
  if (changes.length > MAX_CHANGES || retained > MAX_RETAINED_BYTES) {
    throw refusal('too-large', `the update changes ${changes.length} files and ${retained} bytes, beyond the ${MAX_CHANGES}-file and ${MAX_RETAINED_BYTES / MIB} MiB upgrade bound`);
  }

  checkStopped(signal, deadlineDetail, deadlineAt);
  const dirtyPaths = knownDirtyPaths(workspace, changes.map((change) => change.path));
  const guardPaths = [MANIFEST, BASE_RELEASE, UPGRADE_LOG, ...(refreshPacks ? [PROFILE] : [])];
  const prepared = {
    kind: PREPARED_KIND,
    contract: UPGRADE_STAGING_CONTRACT,
    workspace,
    created_at: createdAt,
    branch,
    source,
    from_ref: fromRef,
    to_ref: toRef,
    include_packs: includePacks,
    packs,
    base_release: baseRelease,
    guards: guardPaths.map((relativePath) => ({
      path: relativePath,
      state: stateOf(/** @type {Buffer | null} */ (metadata.get(relativePath))),
    })),
    changes,
    dirty_paths: dirtyPaths,
  };
  checkStopped(signal, deadlineDetail, deadlineAt);
  fs.writeFileSync(path.join(preparedRoot, PREPARED_FILE), `${JSON.stringify(prepared, null, 2)}\n`, { flag: 'wx' });
  return publicReport(prepared);
}

/**
 * What a reviewer sees of a prepared result: no hashes. The installed engine
 * adds the ID, which binds this description and the retained release files.
 * @param {Record<string, any>} prepared
 */
function publicReport(prepared) {
  /** @type {Change[]} */
  const changes = prepared.changes;
  return {
    status: 'ready',
    from_ref: prepared.from_ref,
    to_ref: prepared.to_ref,
    source: prepared.source,
    branch: prepared.branch,
    include_packs: prepared.include_packs,
    counts: countChanges(changes),
    changes: changes.map(({ path: relativePath, group, pack, op }) => ({ path: relativePath, group, pack, op })),
    packs: prepared.packs,
    base_release: prepared.base_release,
    dirty_paths: prepared.dirty_paths,
  };
}

/**
 * The description an installed engine read and verified, checked for a shape
 * this engine can apply.
 * @param {unknown} prepared
 * @returns {Record<string, any>}
 */
function checkPrepared(prepared) {
  const value = /** @type {any} */ (prepared);
  if (value?.kind !== PREPARED_KIND || value.contract !== UPGRADE_STAGING_CONTRACT
    || !Array.isArray(value.changes) || !Array.isArray(value.guards)) {
    throw refusal('not-found', 'the prepared upgrade has an unsupported format; prepare the upgrade again');
  }
  return value;
}

/**
 * Recheck a prepared result against the workspace and build its batch: the
 * branch, every guarded record, every touched path's preimage or absence, and
 * every retained staged byte must still match. A file the result marks
 * executable is written with the executable mode; the batch keeps every other
 * replaced file's permission. Throws the first difference.
 * @param {Record<string, any>} prepared
 * @param {string} workspace
 * @param {string} stageRoot
 * @returns {import('../dude-feature-definition/atomic-file-batch.mjs').AtomicFileChange[]}
 */
function freshBatch(prepared, workspace, stageRoot) {
  const branch = currentBranch(workspace);
  if (branch !== prepared.branch) throw new Error(`the current branch is ${branch}, not ${prepared.branch}`);
  for (const guard of prepared.guards) {
    if (!sameState(stateOf(readFileOrNull(workspace, guard.path)), guard.state)) {
      throw new Error(`${guard.path} changed since the preview`);
    }
  }
  /** @type {import('../dude-feature-definition/atomic-file-batch.mjs').AtomicFileChange[]} */
  const batch = [];
  for (const change of /** @type {Change[]} */ (prepared.changes)) {
    if (change.executable !== undefined && (change.executable !== true || change.after === null)) {
      throw new Error(`the prepared permission for ${change.path} is invalid`);
    }
    const current = readFileOrNull(workspace, change.path);
    if (!sameState(stateOf(current), change.before)) throw new Error(`${change.path} changed since the preview`);
    /** @type {Buffer | 'missing'} */
    let staged = 'missing';
    if (change.after !== null) {
      staged = /** @type {Buffer} */ (readFileOrNull(stageRoot, change.path));
      if (!sameState(stateOf(staged), change.after)) throw new Error(`the prepared bytes for ${change.path} changed`);
    }
    batch.push({ path: change.path, expected: current ?? 'missing', staged, ...(change.executable ? { mode: EXECUTABLE_MODE } : {}) });
  }
  return batch;
}

/**
 * The apply contract, run from the target release's retained files: recheck
 * the prepared result against the workspace, then write exactly its staged
 * bytes, executable where it marks them, as one all-or-restored batch. The
 * same retained linter runs before the batch and again inside its rollback
 * boundary; only newly introduced failures, or a check that cannot be read,
 * restore the batch. The recheck runs again after the first check,
 * immediately before the batch. `prepared`
 * is the description the installed engine read and verified against the ID
 * before it imported this code. `onProgress`, when given, hears
 * `{ phase: 'checking' }` once: after every file is written, immediately
 * before the bundle check runs again. A refusal before writing reports
 * nothing, and a listener that throws changes nothing.
 * @param {{ workspaceRoot: string, preparedRoot: string, prepared: unknown, onProgress?: ProgressListener }} input
 */
export async function applyPreparedUpgrade({ workspaceRoot, preparedRoot, prepared: description, onProgress }) {
  const prepared = checkPrepared(description);
  const workspace = fs.realpathSync.native(workspaceRoot);
  const stageRoot = path.join(preparedRoot, 'stage');
  /** @type {Change[]} */
  const changes = prepared.changes;
  const base = {
    from_ref: prepared.from_ref,
    to_ref: prepared.to_ref,
    branch: prepared.branch,
    counts: countChanges(changes),
    changes: changes.map(({ path: relativePath, group, pack, op }) => ({ path: relativePath, group, pack, op })),
  };
  /** @param {string} reason */
  const nothingChanged = (reason) => ({ ...base, outcome: 'nothing_changed', reason });

  if (prepared.workspace !== workspace) return nothingChanged('this result was prepared for another workspace');
  try {
    freshBatch(prepared, workspace, stageRoot);
  } catch (error) {
    return nothingChanged(`${errorMessage(error)}; prepare the upgrade again`);
  }

  const lintPath = fileURLToPath(new URL('../dude-lint/lint.mjs', import.meta.url));
  const before = runTargetLint(lintPath, workspace);
  if (!before.ok) return nothingChanged(`the bundle check could not run before writing: ${before.detail}`);
  const { applyAtomicFileBatch } = await import('../dude-feature-definition/atomic-file-batch.mjs');
  let batch;
  try {
    batch = freshBatch(prepared, workspace, stageRoot);
  } catch (error) {
    return nothingChanged(`${errorMessage(error)}; prepare the upgrade again`);
  }
  /** @type {string[]} */
  let introduced = [];
  /** @type {string[]} */
  let remaining = [];
  try {
    applyAtomicFileBatch({ root: workspace, changes: batch, bound: 'upgrade' }, () => {
      // Every file is written: the bundle check that decides the outcome starts now.
      try {
        onProgress?.(Object.freeze({ phase: 'checking' }));
      } catch {
        // A listener only observes; it never changes or restores the application.
      }
      const after = runTargetLint(lintPath, workspace);
      if (!after.ok) throw new Error(`the bundle check could not run after writing: ${after.detail}`);
      introduced = introducedFailures(before.failures, after.failures);
      remaining = after.failures;
      if (introduced.length > 0) throw new Error(`the update introduced ${introduced.length} new bundle check failure(s)`);
    });
  } catch (error) {
    const failure = /** @type {any} */ (error);
    if (failure?.code === 'ATOMIC_FILE_BATCH_ROLLBACK_FAILED') {
      const paths = [...new Set(failure.rollbackErrors.map((/** @type {{ path: string | null }} */ entry) => entry.path)
        .filter(Boolean))].sort(codeUnitCompare);
      return {
        ...base,
        outcome: 'restoration_unconfirmed',
        reason: errorMessage(failure.cause ?? failure),
        paths,
        new_failures: introduced,
      };
    }
    return { ...base, outcome: 'restored', reason: errorMessage(error), new_failures: introduced };
  }
  return { ...base, outcome: 'applied', existing_failures: remaining };
}

/* ======================================================== installed side */

/** @param {string} folderName the 16 random hex digits that name a prepared folder */
function preparedRootFor(folderName) {
  return path.join(os.tmpdir(), `${PREPARED_PREFIX}${folderName}`);
}

/** @param {Buffer} bytes @returns {string | null} the workspace a description belongs to */
function descriptionWorkspace(bytes) {
  try {
    const workspace = JSON.parse(bytes.toString('utf8'))?.workspace;
    return typeof workspace === 'string' ? workspace : null;
  } catch {
    return null;
  }
}

/** @param {string} filePath @returns {Buffer | null} */
function readOrNull(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/**
 * The digest that binds a prepared result: its description and every retained
 * release file, by relative path and content. Anything in the release tree
 * other than folders and regular files fails. Returns the 16 hex digits an ID
 * carries.
 * @param {string} preparedRoot
 * @param {Buffer} description
 */
function resultDigest(preparedRoot, description) {
  const releaseRoot = path.join(preparedRoot, 'release');
  /** @type {[string, string][]} */
  const files = [];
  /** @param {string} relativeDirectory */
  const walk = (relativeDirectory) => {
    const absoluteDirectory = path.join(releaseRoot, ...relativeDirectory.split('/').filter(Boolean));
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => codeUnitCompare(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relativePath);
      else if (entry.isFile()) files.push([relativePath, sha256(fs.readFileSync(path.join(absoluteDirectory, entry.name)))]);
      else throw new Error(`the retained release has a link or special file at ${relativePath}`);
    }
  };
  walk('');
  return sha256(Buffer.from(JSON.stringify({ description: sha256(description), release: files }))).slice(0, 16);
}

/**
 * Invalidate a prepared result: rename its description so no command accepts
 * its ID again, whatever happens to the rest of its folder.
 * @param {string} preparedRoot
 */
function invalidatePrepared(preparedRoot) {
  fs.renameSync(path.join(preparedRoot, PREPARED_FILE), path.join(preparedRoot, RELEASED_FILE));
}

/** @param {string} preparedRoot @returns {string | null} a removal failure, or null */
function releasePrepared(preparedRoot) {
  try {
    fs.rmSync(preparedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return null;
  } catch (error) {
    return `the prepared upgrade at ${preparedRoot} could not be removed, so it was kept there: ${errorMessage(error)}`;
  }
}

/**
 * A new preparation replaces every earlier result for the same workspace. Each
 * one is invalidated first, so its ID is never accepted again, and then
 * removed. If one cannot be invalidated, the new preparation is refused rather
 * than leave two usable results.
 * @param {string} workspace
 * @returns {string[]} the folders that could not be removed
 */
function releaseSuperseded(workspace) {
  /** @type {string[]} */
  const notes = [];
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith(PREPARED_PREFIX) || !FOLDER_NAME_RE.test(name.slice(PREPARED_PREFIX.length))) continue;
    const preparedRoot = path.join(os.tmpdir(), name);
    const description = readOrNull(path.join(preparedRoot, PREPARED_FILE));
    if (!description || descriptionWorkspace(description) !== workspace) continue;
    try {
      invalidatePrepared(preparedRoot);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') continue;
      throw refusal(
        'invalidation-failed',
        `the earlier prepared upgrade at ${preparedRoot} could not be invalidated, so no new one was prepared: ${errorMessage(error)}; discard it or remove that folder, then prepare again`,
      );
    }
    const note = releasePrepared(preparedRoot);
    if (note) notes.push(note);
  }
  return notes;
}

/** @param {string} id */
function notFound(id) {
  return refusal('not-found', `prepared upgrade ${id} was not found: it was applied, discarded, or replaced, or never prepared; run plan again`);
}

/**
 * Find this workspace's prepared result by ID: its folder and the description
 * bytes read now, which are all that is used from here on.
 * @param {unknown} id
 * @param {string} workspace
 */
function lookupPrepared(id, workspace) {
  if (typeof id !== 'string' || !PREPARED_ID_RE.test(id)) throw refusal('invalid-input', `not a prepared upgrade ID: ${String(id)}`);
  const preparedRoot = preparedRootFor(id.slice(0, 16));
  const description = readOrNull(path.join(preparedRoot, PREPARED_FILE));
  const owner = description && descriptionWorkspace(description);
  if (!description || owner === null) throw notFound(id);
  if (owner !== workspace) throw refusal('other-workspace', `prepared upgrade ${id} belongs to another workspace: ${owner}`);
  return { preparedRoot, description };
}

/**
 * Import the retained target engine, refusing a release without the staging
 * contract before running any of its code.
 * @param {string} preparedRoot
 * @param {string} label
 */
async function loadTargetEngine(preparedRoot, label) {
  const enginePath = path.join(preparedRoot, 'release', '.github', 'skills', 'dude-bundle-upgrade', 'upgrade.mjs');
  const unsupported = refusal(
    'unsupported-target',
    `the target release ${label} does not support staged upgrades; choose a release that does`,
  );
  let text = null;
  try {
    text = fs.readFileSync(enginePath, 'utf8');
  } catch {
    throw unsupported;
  }
  if (!text.includes(CONTRACT_MARKER)) throw unsupported;
  const engine = await import(pathToFileURL(enginePath).href);
  if (engine.UPGRADE_STAGING_CONTRACT !== UPGRADE_STAGING_CONTRACT
    || typeof engine.stageUpgrade !== 'function'
    || typeof engine.applyPreparedUpgrade !== 'function') {
    throw unsupported;
  }
  return engine;
}

/** @param {unknown} error */
function sourceRefusal(error) {
  return error instanceof ReleaseSourceError ? refusal(error.code, error.message) : error;
}

/**
 * The release check for an installation: read the manifest, then, only for a
 * latest-channel install with a stable installed version, list the source's
 * tags. Pinned and development installs make no lookup. Nothing is written.
 * @param {{ root?: string, source?: string, ref?: string, signal?: AbortSignal }} [input]
 */
export async function checkInstallation({ root = process.cwd(), source, ref, signal } = {}) {
  const result = {
    status: '',
    channel: /** @type {string | null} */ (null),
    source: source || null,
    ref: ref || null,
    installed_ref: /** @type {string | null} */ (null),
    available_ref: /** @type {string | null} */ (null),
    release_url: /** @type {string | null} */ (null),
    checked_at: /** @type {string | null} */ (null),
    detail: '',
  };
  let manifest;
  try {
    manifest = readManifest(root, 'local');
  } catch (error) {
    return { ...result, status: 'installation_unavailable', detail: errorMessage(error) };
  }
  const location = source || manifest.data.source_repo;
  const requested = ref || manifest.data.source_ref;
  const installed = manifest.data.installed_ref;
  Object.assign(result, { source: location, ref: requested, installed_ref: installed });
  if (requested !== RELEASE_CHANNEL) {
    const channel = isStableReleaseTag(requested) ? 'pinned' : 'development';
    return {
      ...result,
      status: channel,
      channel,
      detail: channel === 'pinned'
        ? `pinned to ${requested}; release checks do not apply`
        : `tracks ${requested}; release checks do not apply`,
    };
  }
  result.channel = 'latest';
  if (!isRemoteAddress(location)) {
    return { ...result, status: 'check_failed', detail: 'a local-path source does not support ref latest; pass an explicit local branch or tag with --ref' };
  }
  if (!isStableReleaseTag(installed)) {
    return { ...result, status: 'installation_unavailable', detail: `the installed version ${installed || '(none)'} is not a stable release tag` };
  }
  let latest;
  try {
    latest = await latestStableRelease({ source: location, signal });
  } catch (error) {
    return { ...result, status: 'check_failed', detail: errorMessage(error) };
  }
  const checkedAt = isoNow();
  if (!latest) return { ...result, status: 'no_stable_releases', checked_at: checkedAt, detail: `no stable releases are published at ${location}` };
  const newer = compareReleaseTags(latest, installed) > 0;
  return {
    ...result,
    status: newer ? 'upgrade_available' : 'up_to_date',
    available_ref: latest,
    release_url: newer ? githubReleaseUrl(location, latest) : null,
    checked_at: checkedAt,
  };
}

/**
 * Prepare one upgrade: resolve the exact target, acquire it into a new owned
 * temporary folder, and hand it to the target release's staging function.
 * A ready result stays retained under an ID that binds its description and
 * every retained release file; anything else retains nothing, except material
 * a process may still use, which is kept and named.
 * @param {{ root?: string, source?: string, ref?: string, includePacks?: boolean,
 *   signal?: AbortSignal, onProgress?: ProgressListener }} [input]
 */
export async function prepareUpgrade({ root = process.cwd(), source, ref, includePacks = false, signal, onProgress } = {}) {
  const startedAt = Date.now();
  const workspace = fs.realpathSync.native(root);
  requireWorkTree(workspace);
  const manifest = readManifest(workspace, 'local');
  const location = source || manifest.data.source_repo;
  const requested = ref || manifest.data.source_ref;
  if (requested === RELEASE_CHANNEL && !isRemoteAddress(location)) {
    throw refusal('invalid-input', 'a local-path source does not support ref latest; pass an explicit local branch or tag with --ref');
  }
  // Compose reads a local folder source as its working tree, so packs from it
  // could not come from the exact target commit; through a Git address they do.
  if (includePacks && !isRemoteAddress(location)) {
    throw refusal(
      'invalid-input',
      '--all needs the source as a Git address, such as a file: URL, so that packs come from the exact target commit; a local folder path would be read as its current working tree. Prepare without --all, or pass --source with a Git address',
    );
  }
  // Earlier results' folders that could not be removed are named with this one.
  const kept = releaseSuperseded(workspace);
  /** @param {(string | null)[]} more */
  const cleanupNote = (...more) => [...kept, ...more].filter(Boolean).join('; ') || null;
  onProgress?.(Object.freeze({ phase: 'fetching' }));
  const acquisition = deadlineSignal(ACQUISITION_DEADLINE_MS, signal);
  try {
    const deadlineLabel = `the release was not fetched within ${ACQUISITION_DEADLINE_MS / 1_000} seconds`;
    const env = foregroundGitEnvironment();
    let target;
    try {
      target = await resolveTarget({ source: location, ref: requested, env, signal: acquisition.signal, deadlineLabel });
    } catch (error) {
      throw withNote(sourceRefusal(error), cleanupNote());
    }
    const installed = manifest.data.installed_ref;
    if (requested === RELEASE_CHANNEL && isStableReleaseTag(installed) && compareReleaseTags(target.resolvedRef, installed) < 0) {
      const cleanup = cleanupNote();
      return {
        status: 'nothing_to_update',
        id: null,
        from_ref: installed,
        to_ref: target.resolvedRef,
        detail: `the installed ${installed} is newer than the latest release ${target.resolvedRef}, and a release check never offers a downgrade`,
        ...(cleanup ? { cleanup } : {}),
      };
    }

    let folderName = '';
    let preparedRoot = '';
    for (let attempt = 0; attempt < 8 && !preparedRoot; attempt += 1) {
      folderName = crypto.randomBytes(8).toString('hex');
      try {
        fs.mkdirSync(preparedRootFor(folderName));
        preparedRoot = preparedRootFor(folderName);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error)?.code !== 'EEXIST') throw error;
      }
    }
    if (!preparedRoot) throw withNote(refusal('failed', 'could not allocate a prepared upgrade folder'), cleanupNote());
    let report;
    /** @type {string | null} */
    let id = null;
    try {
      await acquireRelease({ source: location, target, destination: preparedRoot, env, signal: acquisition.signal, deadlineLabel });
      const engine = await loadTargetEngine(preparedRoot, target.resolvedRef);
      report = await engine.stageUpgrade({
        workspaceRoot: workspace,
        preparedRoot,
        source: { location, requested_ref: target.requestedRef, resolved_ref: target.resolvedRef, commit: target.commit },
        includePacks,
        startedAt,
        signal,
        onProgress,
      });
      if (report?.status === 'ready') {
        id = `${folderName}${resultDigest(preparedRoot, fs.readFileSync(path.join(preparedRoot, PREPARED_FILE)))}`;
      }
    } catch (error) {
      const failure = /** @type {any} */ (error);
      if (failure?.cleanupConfirmed === false) {
        // A process may still write there: keep the folder and say where.
        throw withNote(refusal(
          failure.reason ?? failure.code ?? 'failed',
          `${errorMessage(error)}; a process could not be confirmed stopped, so its temporary material was kept at ${preparedRoot}`,
          typeof failure.pack === 'string' ? { pack: failure.pack } : {},
        ), cleanupNote());
      }
      throw withNote(sourceRefusal(error), cleanupNote(releasePrepared(preparedRoot)));
    }
    if (id !== null) {
      const { status, ...rest } = report;
      const cleanup = cleanupNote();
      return { status, id, ...rest, ...(cleanup ? { cleanup } : {}) };
    }
    const cleanup = cleanupNote(releasePrepared(preparedRoot));
    return cleanup ? { ...report, cleanup } : report;
  } finally {
    acquisition.dispose();
  }
}

/**
 * Apply one retained prepared result through its own retained target engine.
 * The result is invalidated first, so it can never apply twice, and its ID is
 * checked against the retained description and release files before any
 * retained code runs. Its folder is then removed as best it can be; a folder
 * that cannot be removed is named. The caller owns confirmation. `onProgress`
 * goes to the retained target engine, which reports when its bundle check after
 * writing starts (see `applyPreparedUpgrade`).
 * @param {{ root?: string, id: string, onProgress?: ProgressListener }} input
 */
export async function applyUpgrade({ root = process.cwd(), id, onProgress }) {
  const workspace = fs.realpathSync.native(root);
  const { preparedRoot, description } = lookupPrepared(id, workspace);
  try {
    invalidatePrepared(preparedRoot);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') throw notFound(id);
    return {
      id,
      outcome: 'nothing_changed',
      reason: `the prepared upgrade could not be marked as used, so nothing was applied: ${errorMessage(error)}; it is still at ${preparedRoot}`,
    };
  }
  /** @param {Record<string, unknown>} result */
  const released = (result) => {
    const cleanup = releasePrepared(preparedRoot);
    return { id, ...result, ...(cleanup ? { cleanup } : {}) };
  };
  let prepared;
  try {
    if (resultDigest(preparedRoot, description) !== id.slice(16)) throw new Error('the digest differs');
    prepared = JSON.parse(description.toString('utf8'));
  } catch {
    return released({ outcome: 'nothing_changed', reason: 'the prepared upgrade changed since the preview; prepare the upgrade again' });
  }
  let result;
  try {
    const engine = await loadTargetEngine(preparedRoot, 'prepared for this upgrade');
    result = await engine.applyPreparedUpgrade({ workspaceRoot: workspace, preparedRoot, prepared, onProgress });
  } catch (error) {
    throw withNote(error, releasePrepared(preparedRoot));
  }
  return released(result);
}

/**
 * Release a prepared result that will not be applied: invalidate it, then
 * remove its folder as best it can be, naming a folder that remains.
 * @param {{ root?: string, id: string }} input
 */
export function discardUpgrade({ root = process.cwd(), id }) {
  const { preparedRoot } = lookupPrepared(id, fs.realpathSync.native(root));
  try {
    invalidatePrepared(preparedRoot);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') throw notFound(id);
    throw refusal('invalidation-failed', `prepared upgrade ${id} could not be discarded: ${errorMessage(error)}; it is still at ${preparedRoot}`);
  }
  const cleanup = releasePrepared(preparedRoot);
  return { status: 'discarded', id, ...(cleanup ? { cleanup } : {}) };
}

/* ==================================================================== CLI */

/**
 * @param {string[]} argv
 * @param {Set<string>} valued flags that take a value
 * @param {Set<string>} bools boolean flags
 * @returns {{ flags: Record<string, string>, error?: string }}
 */
function parseFlags(argv, valued, bools) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      const key = arg.slice(2, eq);
      if (!valued.has(key)) return { flags, error: `unknown flag: ${arg}` };
      flags[key] = arg.slice(eq + 1);
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (bools.has(key)) flags[key] = '1';
      else if (valued.has(key)) {
        flags[key] = argv[index + 1] ?? '';
        index += 1;
      } else return { flags, error: `unknown flag: ${arg}` };
    } else {
      return { flags, error: `unexpected argument: ${arg}` };
    }
  }
  return { flags };
}

/**
 * @param {string[]} argv
 * @param {string[]} valued
 * @param {string[]} [bools]
 */
function readFlags(argv, valued, bools = []) {
  const { flags, error } = parseFlags(argv, new Set(['format', ...valued]), new Set(bools));
  const format = flags.format || 'text';
  if (error || (format !== 'text' && format !== 'json')) {
    logError(error || `invalid --format: ${format} (expected text|json)`);
    return null;
  }
  return { flags, format };
}

/** @param {unknown} error @param {string} format */
function reportRefusal(error, format) {
  const failure = /** @type {any} */ (error);
  const reason = typeof failure?.reason === 'string' ? failure.reason : 'failed';
  const detail = errorMessage(error);
  if (format === 'json') {
    writeJson({ status: 'refused', reason, detail, ...(typeof failure?.pack === 'string' ? { pack: failure.pack } : {}) });
  } else logError(detail);
  return 40;
}

/** @param {Awaited<ReturnType<typeof checkInstallation>>} result */
function formatStatus(result) {
  const heads = {
    upgrade_available: `update available (${result.available_ref})`,
    up_to_date: 'up to date',
    no_stable_releases: 'no stable releases found',
    check_failed: `couldn't check (${result.detail})`,
    pinned: result.detail,
    development: result.detail,
    installation_unavailable: `installation information unavailable (${result.detail})`,
  };
  const lines = [`Bundle: ${heads[/** @type {keyof typeof heads} */ (result.status)]}`];
  if (result.source) lines.push(`  Source:    ${result.source} @ ${result.ref}`);
  if (result.installed_ref !== null) lines.push(`  Installed: ${result.installed_ref || '(none)'}`);
  if (result.available_ref) lines.push(`  Latest:    ${result.available_ref}`);
  if (result.release_url) lines.push(`  What's new: ${result.release_url}`);
  if (result.status === 'upgrade_available') lines.push('  Next:      @dude upgrade --dry-run');
  return `${lines.join('\n')}\n`;
}

/** @param {Record<string, any>} report @param {boolean} dryRun */
function formatPlan(report, dryRun) {
  const note = report.cleanup ? `Note: ${report.cleanup}\n` : '';
  if (report.status !== 'ready') return `Nothing to update: ${report.detail}.\n${note}`;
  const { source } = report;
  const lines = [
    `Upgrade preview: ${report.from_ref || '(none)'} -> ${report.to_ref}`,
    `Source: ${source.location} @ ${source.requested_ref}${source.resolved_ref !== source.requested_ref ? ` (${source.resolved_ref})` : ''}, commit ${source.commit.slice(0, 12)}`,
    dryRun ? 'Dry run: nothing was retained or written.' : `Prepared ID: ${report.id}`,
    `Branch: ${report.branch} (the changes stay uncommitted)`,
    '',
    `Core: ${describeCounts(report.counts.core)}`,
    `Metadata: ${describeCounts(report.counts.metadata)}`,
  ];
  for (const [name, counts] of Object.entries(report.counts.packs)) lines.push(`Pack ${name}: ${describeCounts(/** @type {any} */ (counts))}`);
  if (report.base_release.changed) {
    lines.push(`Base release record: ${report.base_release.from ?? '(none)'} -> ${report.base_release.to ?? '(none)'}`);
  }
  if (report.packs.unchanged.length > 0) lines.push(`Packs with no changes: ${report.packs.unchanged.join(', ')}`);
  if (report.packs.not_selected.length > 0) {
    lines.push(`Eligible packs not included (add --all to include them): ${report.packs.not_selected.join(', ')}`);
  }
  lines.push('', 'Files:');
  for (const change of report.changes) {
    lines.push(`  ${change.op.padEnd(7)} ${change.group === 'pack' ? `pack ${change.pack}` : change.group}: ${change.path}`);
  }
  if (report.dirty_paths.length > 0) {
    lines.push('', 'Uncommitted or staged edits this update overwrites:', ...report.dirty_paths.map((/** @type {string} */ p) => `  ${p}`));
  }
  lines.push(
    '',
    `Warning: applying overwrites local customizations in these files on branch ${report.branch} and leaves the changes uncommitted.`,
    'Git cannot recover pre-existing uncommitted edits that the update overwrites. Start a new session afterward to load the updated Dude.',
  );
  if (!dryRun) lines.push(`Reply "confirm upgrade" to apply prepared result ${report.id}.`);
  return `${lines.join('\n')}\n${note}`;
}

/** @param {Record<string, any>} result */
function formatApply(result) {
  /** @type {string[]} */
  const lines = [];
  if (result.outcome === 'applied') {
    lines.push(
      `Applied ${result.from_ref || '(none)'} -> ${result.to_ref} on branch ${result.branch}; the changes are uncommitted.`,
      `  Core: ${describeCounts(result.counts.core)}`,
      `  Metadata: ${describeCounts(result.counts.metadata)}`,
      ...Object.entries(result.counts.packs).map(([name, counts]) => `  Pack ${name}: ${describeCounts(/** @type {any} */ (counts))}`),
    );
    if (result.existing_failures.length > 0) {
      lines.push(`Existing bundle check failures, unchanged by this update (${result.existing_failures.length}):`,
        ...result.existing_failures.map((/** @type {string} */ failure) => `  ${failure}`));
    }
    lines.push(
      'Review with `git status` and `git diff`, then commit. Before committing, `git restore -- <path>` returns a',
      'modified or deleted tracked file to its staged version, which is its committed version unless you staged a change',
      'to it (`git restore --source=HEAD -- <path>` takes the committed version); delete an untracked file the update added',
      '(for example `git clean -f -- <path>`). After committing, revert that commit.',
      'Git cannot recover pre-existing uncommitted edits that the update overwrote. Start a new session to load the updated Dude.',
    );
  } else if (result.outcome === 'nothing_changed') {
    lines.push(`Nothing changed: ${result.reason}`);
  } else if (result.outcome === 'restored') {
    lines.push(`Files restored: ${result.reason}`);
    for (const failure of result.new_failures) lines.push(`  new failure: ${failure}`);
  } else {
    lines.push(`Restoration unconfirmed: ${result.reason}`, 'Inspect these paths:', ...result.paths.map((/** @type {string} */ p) => `  ${p}`));
  }
  if (result.cleanup) lines.push(`Note: ${result.cleanup}`);
  return `${lines.join('\n')}\n`;
}

/** @param {string[]} argv */
async function cmdStatus(argv) {
  const parsed = readFlags(argv, ['source', 'ref']);
  if (!parsed) return 40;
  const result = await checkInstallation({ root: process.cwd(), source: parsed.flags.source, ref: parsed.flags.ref });
  if (parsed.format === 'json') writeJson(result);
  else out(formatStatus(result));
  return result.status === 'installation_unavailable' ? 40 : 0;
}

/** @param {string[]} argv */
async function cmdPlan(argv) {
  const parsed = readFlags(argv, ['source', 'ref'], ['all', 'dry-run']);
  if (!parsed) return 40;
  const { flags, format } = parsed;
  const dryRun = Boolean(flags['dry-run']);
  let report;
  try {
    report = await prepareUpgrade({ root: process.cwd(), source: flags.source, ref: flags.ref, includePacks: Boolean(flags.all) });
  } catch (error) {
    return reportRefusal(error, format);
  }
  if (dryRun && report.status === 'ready') {
    const notes = [report.cleanup];
    try {
      notes.push(discardUpgrade({ root: process.cwd(), id: report.id }).cleanup);
    } catch (error) {
      notes.push(errorMessage(error));
    }
    const cleanup = notes.filter(Boolean).join('; ');
    report = { ...report, id: null, ...(cleanup ? { cleanup } : {}) };
  }
  if (format === 'json') writeJson({ ...report, dry_run: dryRun });
  else out(formatPlan(report, dryRun));
  return report.status === 'ready' ? 10 : 0;
}

/** @param {string[]} argv */
async function cmdApply(argv) {
  const parsed = readFlags(argv, ['plan', 'confirm']);
  if (!parsed) return 40;
  const { flags, format } = parsed;
  if (!flags.plan) {
    logError('--plan <id> is required');
    return 40;
  }
  if (flags.confirm !== CONFIRM_TOKEN) {
    logError(`apply requires --confirm with the literal token '${CONFIRM_TOKEN}'`);
    return 40;
  }
  let result;
  try {
    result = await applyUpgrade({ root: process.cwd(), id: flags.plan });
  } catch (error) {
    return reportRefusal(error, format);
  }
  if (format === 'json') writeJson(result);
  else out(formatApply(result));
  return result.outcome === 'applied' ? 0 : 40;
}

/** @param {string[]} argv */
async function cmdDiscard(argv) {
  const parsed = readFlags(argv, ['plan']);
  if (!parsed) return 40;
  if (!parsed.flags.plan) {
    logError('--plan <id> is required');
    return 40;
  }
  let result;
  try {
    result = discardUpgrade({ root: process.cwd(), id: parsed.flags.plan });
  } catch (error) {
    return reportRefusal(error, parsed.format);
  }
  if (parsed.format === 'json') writeJson(result);
  else out(`Discarded prepared upgrade ${result.id}; nothing was written.\n${result.cleanup ? `Note: ${result.cleanup}\n` : ''}`);
  return 0;
}

function cmdHelp() {
  out(`upgrade.mjs — engine for dude-bundle-upgrade.

USAGE
  node .github/skills/dude-bundle-upgrade/upgrade.mjs <subcommand> [flags]

SUBCOMMANDS
  status    check the recorded release channel for a newer stable release (writes nothing)
  plan      prepare the exact target and report every file it changes (writes no project file)
  apply     apply one prepared result in place; the changes stay uncommitted
  discard   release a prepared result that will not be applied
  help      this message

FLAGS (status, plan)
  --source <s>          override the manifest source_repo (URL or local path)
  --ref <r>             override the manifest source_ref (latest, tag, branch, or commit)

FLAGS (plan)
  --all                 also refresh installed packs whose recorded source is the bundle upstream
  --dry-run             report the changes and retain nothing

FLAGS (apply, discard)
  --plan <id>           required: the prepared ID that plan reported
  --confirm <token>     apply only: the literal token 'confirm-upgrade'

FLAGS (all)
  --format text|json    output format (default: text)

EXIT CODES
  0   status reported, nothing to update, or apply/discard succeeded
  10  plan ready, changes detected
  40  invalid input, a refusal, or an apply that did not succeed

NOTES
  Apply writes the prepared bytes in place on the current branch as one
  all-or-restored batch. It creates no tag, branch, or commit and does not
  stage anything. Git cannot recover pre-existing uncommitted edits that it
  overwrites. Start a new session afterward to load the updated Dude.
`);
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'status':
      return cmdStatus(rest);
    case 'plan':
      return cmdPlan(rest);
    case 'apply':
      return cmdApply(rest);
    case 'discard':
      return cmdDiscard(rest);
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

/** @param {string} metaUrl @param {string | undefined} argv1 @returns {boolean} */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    logError(errorMessage(error));
    process.exit(40);
  });
}
