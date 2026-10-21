// @ts-check
/**
 * Release source access for dude-bundle-upgrade.
 *
 * Two callers need it. The version check lists a source's tags and compares
 * the newest stable release with the installed one. Its Git gets a fresh
 * environment and fixed settings of its own, so it reads none of the user's
 * Git configuration, logins, cookies, proxies, or client certificates, signs
 * in nowhere (not with the user's Windows or Kerberos account either), follows
 * no redirect, never uses SSH, and creates no file, folder, or cache.
 * Preparation resolves one exact target commit and acquires
 * only that commit's deployment bytes: a depth-one, blob-filtered fetch into
 * an owned folder under `os.tmpdir()`, one batched fetch of the selected
 * blobs, and raw blob reads, so Git's checkout conversion never changes the
 * reviewed bytes; a blob Git records as executable (`100755`) is written as an
 * executable file. A server that ignores blob filtering sends the depth-one
 * snapshot whole; acquisition stays depth-one and bounded either way, and the
 * acquisition folder is observed against a 1 GiB / 65,536-entry bound while
 * Git writes into it.
 *
 * Every owned process, Git here and the selected-pack Compose child of the
 * staging function, runs asynchronously under a deadline and an AbortSignal.
 * Stopping one stops its whole process tree, because a Windows Git launcher
 * can leave the real Git running. On Windows the process itself is stopped
 * before anything it started, and the stop is confirmed only by the process
 * table. Temporary material is removed only after its processes are confirmed
 * stopped; otherwise it is kept and its path is reported.
 *
 * Dependency-free ESM (node:* only). Targets Node >= 20; Git is required.
 */
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyPath, TIER } from '../../dude-engine/lib/ownership.mjs';
import { RELEASE_CHANNEL, pickLatestReleaseTag } from '../../dude-engine/lib/release-channel.mjs';
import { WORKSPACE_PATHS } from '../../dude-engine/lib/workspace-paths.mjs';

const KIB = 1_024;
const MIB = 1_048_576;
const GIB = 1_073_741_824;

/** The version check's whole deadline. */
export const CHECK_DEADLINE_MS = 5_000;
/** Resolution and acquisition of one target share this window. */
export const ACQUISITION_DEADLINE_MS = 55_000;
/** One kill command has this long. */
const STOP_CONFIRM_MS = 2_000;
// A Windows stop reads the process table through PowerShell, about a second
// each time: once before its first kill and once after each of at most
// WINDOWS_STOP_ROUNDS kill rounds, so a stopped tree has STOP_WINDOW_MS there
// to confirm that it stopped.
const PROCESS_TABLE_MS = 5_000;
const WINDOWS_STOP_ROUNDS = 2;
const STOP_WINDOW_MS = process.platform === 'win32' ? 20_000 : 2 * STOP_CONFIRM_MS;
// Windows file time (100 ns units since 1601) at the Unix epoch, and how far a
// process's recorded creation time may differ from this process's clock.
const FILE_TIME_AT_EPOCH = 116_444_736_000_000_000n;
const CLOCK_SLACK_MS = 1_000;
const PROCESS_TABLE_SCRIPT = 'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ForEach-Object { '
  + '"$($_.ProcessId) $($_.ParentProcessId) $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 })" }';
const REF_LIST_BYTES = 1 * MIB;
const TREE_LIST_BYTES = 16 * MIB;
const DIAGNOSTIC_BYTES = 64 * KIB;
/** Ceilings for one acquired release: the upgrade batch's own bounds. */
export const MAX_RELEASE_FILES = 8_192;
export const MAX_RELEASE_BYTES = 256 * MIB;
// While Git writes into an acquisition folder, the folder is observed every
// 250 ms, one walk at a time, and Git is stopped once the folder is seen to
// reach this size or entry count. Writes can overshoot between walks, so this
// is a best-effort observation, not a disk quota.
const ROOT_LIMITS = Object.freeze({ bytes: GIB, entries: 65_536, intervalMs: 250 });

const STABLE_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
const COMMIT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const URL_ADDRESS_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
// A URL's scheme and authority (`[user@]host[:port]`), as Git splits them.
const URL_PARTS_RE = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#\\]*)/;
const SSH_SCHEMES = new Set(['ssh', 'git+ssh', 'ssh+git']);
// The only transports the release check may use: none of them is SSH.
const CHECK_PROTOCOLS = 'file:git:http:https';
// A release-check address: a file, git, http, or https URL with no user name
// or password, query, fragment, or backslash.
const CHECK_ADDRESS_RE = /^(file|git|https?):\/\/([^/?#\\@]*)((?:\/[^?#\\]*)?)$/i;
// The only variables the release check's Git inherits, each when present:
// what Git needs to start and to find a temporary folder.
const CHECK_INHERITED = Object.freeze(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']);
// The release check's own Git settings, given on its command line. With no
// configuration file read and no helper or prompt, they also close what Git
// and cURL could still do by themselves: sign in with the user's Windows or
// Kerberos account (`http.emptyAuth`), offer a Windows client certificate,
// keep cookies, use a proxy, or follow a redirect to another address.
const CHECK_SETTINGS = Object.freeze([
  'credential.helper=',
  'credential.interactive=false',
  'http.emptyAuth=false',
  'http.proactiveAuth=none',
  'http.allowNTLMAuth=false',
  'http.delegation=none',
  'http.extraHeader=',
  'http.saveCookies=false',
  'http.sslAutoClientCert=false',
  'http.proxy=',
  'core.gitProxy=none',
  'http.followRedirects=false',
  'http.sslVerify=true',
]);
// Git for Windows before 2.32.0(2) shipped a cURL whose Secure Channel TLS
// offered a client certificate from the user's Windows certificate store to
// any server that asked, and no setting turned that off. It reports itself as
// `git version 2.32.0.windows.2`.
const WINDOWS_CHECK_GIT = Object.freeze([2, 32, 0, 2]);
// Git reads `[user@]host:path` as SSH when a colon comes before any slash and
// after more than one character; one letter is a Windows drive.
const SCP_ADDRESS_RE = /^(?:[^@/\\:]+@)?[^@/\\:]{2,}:/;
const REMOTE_HELPER_RE = /^(?:[A-Za-z0-9][A-Za-z0-9+.-]*)?::/;
const WINDOWS_RESERVED_NAME_RE = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(?:\..*)?$/i;
const GITHUB_RE = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;

/**
 * A failure that already names its cause. `code` classifies it for callers;
 * `cleanupConfirmed` is false when a stopped Git process tree could not be
 * confirmed stopped, so its temporary material must be kept.
 */
export class ReleaseSourceError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ cleanupConfirmed?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ReleaseSourceError';
    this.code = code;
    this.cleanupConfirmed = options.cleanupConfirmed ?? true;
  }
}

/* ------------------------------------------------------------ addresses */

/**
 * Whether Git reads `location` as a remote address rather than a local path:
 * a `<scheme>://` URL or an SSH `host:path` address.
 * @param {string} location
 */
export function isRemoteAddress(location) {
  return URL_ADDRESS_RE.test(location) || SCP_ADDRESS_RE.test(location);
}

/**
 * Whether Git reaches `location` over SSH: an `ssh://` (or `git+ssh://`,
 * `ssh+git://`) URL or an SSH `host:path` address.
 * @param {string} location
 */
function isSshAddress(location) {
  const url = URL_PARTS_RE.exec(location);
  return url ? SSH_SCHEMES.has(url[1].toLowerCase()) : SCP_ADDRESS_RE.test(location);
}

/**
 * Whether `location` names a github.com host, in URL or SSH `host:path` form.
 * Compose reads such a source over anonymous HTTPS within its own 120-second
 * selected-pack bound and never runs Git for it; any other source may be
 * cloned by Compose's synchronous Git under its 60-second deadline.
 * @param {string} location
 */
export function isGitHubHost(location) {
  const url = URL_PARTS_RE.exec(location);
  const authority = url ? url[2] : (/^(?:[^@/\\:]+@)?([^@/\\:]{2,}):/.exec(location)?.[1] ?? '');
  const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:[^:\]]*$/, '').toLowerCase();
  return host === 'github.com' || host.endsWith('.github.com');
}

/**
 * Refuse a source Git would misread as an option or hand to a remote helper.
 * @param {unknown} source
 * @returns {string}
 */
export function checkSourceAddress(source) {
  if (typeof source !== 'string' || source.length === 0 || source !== source.trim() || /\p{Cc}/u.test(source)) {
    throw new ReleaseSourceError('invalid', 'the upgrade source must be one non-empty line');
  }
  if (source.startsWith('-')) throw new ReleaseSourceError('invalid', 'the upgrade source must not begin with "-"');
  if (REMOTE_HELPER_RE.test(source)) {
    throw new ReleaseSourceError('invalid', 'the upgrade source must not use Git\'s "<transport>::<address>" remote-helper form');
  }
  return source;
}

/**
 * Whether the release check may contact `source`: a file, git, http, or https
 * URL that carries no user name, password, query, or fragment and, as a
 * `file:` URL, names no network share, which Windows would sign in to with the
 * user's account. Git decodes a URL's escapes, so an encoded slash or
 * backslash counts as one.
 * @param {string} source
 */
function isCheckAddress(source) {
  const match = CHECK_ADDRESS_RE.exec(source);
  if (!match) return false;
  if (match[1].toLowerCase() !== 'file') return true;
  try {
    return match[2] === '' && /^\/(?![\\/])/.test(decodeURIComponent(match[3]));
  } catch {
    return false;
  }
}

/**
 * Refuse a ref Git would misread or cannot name.
 * @param {unknown} ref
 * @returns {string}
 */
function checkRefName(ref) {
  if (typeof ref !== 'string' || ref.length === 0 || Buffer.byteLength(ref, 'utf8') > 255
    || /[\p{Cc}\s~^:?*[\\]/u.test(ref) || ref === '@' || ref.includes('..') || ref.includes('@{')
    || /^[-./]|[/.]$|\/\/|\/\.|\.lock(?:\/|$)/.test(ref)) {
    throw new ReleaseSourceError('invalid', `not a usable branch, tag, or commit name: ${JSON.stringify(ref)}`);
  }
  return ref;
}

/* ------------------------------------------------------------- versions */

/** @param {string} tag @returns {[number, number, number] | null} */
function parseStableTag(tag) {
  const match = STABLE_TAG_RE.exec(tag);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** @param {string} tag */
export function isStableReleaseTag(tag) {
  return parseStableTag(tag) !== null;
}

/**
 * Numeric order of two stable release tags (negative, zero, or positive).
 * @param {string} left
 * @param {string} right
 */
export function compareReleaseTags(left, right) {
  const a = parseStableTag(left);
  const b = parseStableTag(right);
  if (!a || !b) throw new Error(`not stable release tags: ${left}, ${right}`);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * A release page only for a public GitHub repository URL and a stable tag;
 * other sources have no safe destination.
 * @param {string} source
 * @param {string} tag
 * @returns {string | null}
 */
export function githubReleaseUrl(source, tag) {
  const match = GITHUB_RE.exec(source);
  if (!match || !isStableReleaseTag(tag)) return null;
  return `https://github.com/${match[1]}/${match[2]}/releases/tag/${tag}`;
}

/* ---------------------------------------------------------- environment */

/**
 * The launching user's Git environment without any prompt.
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function foregroundGitEnvironment(base = process.env) {
  return { ...base, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', GCM_INTERACTIVE: 'never' };
}

/**
 * The release check's Git command for one source: its arguments, the check's
 * own settings first, and its whole environment. The environment is built
 * afresh: only `CHECK_INHERITED` comes from `base`, because any other variable
 * can sign in, carry configuration (`GIT_CONFIG_*`), name a proxy, or present a
 * client certificate. Git's home, global file, and Git directory are paths in
 * a folder that is never created, so no system, user, or workspace repository
 * configuration, saved login, cookie file, or `.netrc` is read. No prompt runs,
 * and Git may use only the file, git, http, and https transports, so no
 * address ever starts SSH, whose agent and keys would sign in.
 * @param {string} source
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {{ args: string[], env: NodeJS.ProcessEnv }}
 */
export function releaseCheckCommand(source, base = process.env) {
  const windows = process.platform === 'win32';
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [name, value] of Object.entries(base)) {
    // Windows reads variable names in any case.
    const kept = CHECK_INHERITED.some((wanted) => (windows ? wanted.toUpperCase() === name.toUpperCase() : wanted === name));
    if (kept && value !== undefined) env[name] = value;
  }
  const home = path.join(os.tmpdir(), `dude-upgrade-check-home-${crypto.randomUUID()}`);
  if (windows) {
    const drive = path.parse(home).root.replace(/[\\/]+$/, '');
    Object.assign(env, { USERPROFILE: home, HOMEDRIVE: drive, HOMEPATH: home.slice(drive.length) });
  }
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
    GIT_DIR: path.join(home, '.git'),
    GIT_ALLOW_PROTOCOL: CHECK_PROTOCOLS,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GCM_INTERACTIVE: 'never',
  });
  return { args: [...CHECK_SETTINGS.flatMap((setting) => ['-c', setting]), 'ls-remote', '--tags', '--', source], env };
}

/**
 * Whether `git --version` output names a Git for Windows the release check
 * may run: 2.32.0(2) or later. Output it cannot read is refused.
 * @param {string} output
 */
export function isCheckableWindowsGit(output) {
  const match = /^git version (\d+)\.(\d+)\.(\d+)(?:\.windows\.(\d+))?/.exec(output.trim());
  if (!match) return false;
  const found = [match[1], match[2], match[3], match[4] ?? '0'].map(Number);
  const index = found.findIndex((part, position) => part !== WINDOWS_CHECK_GIT[position]);
  return index === -1 || found[index] > WINDOWS_CHECK_GIT[index];
}

/* ------------------------------------------------------------ processes */

/**
 * One signal for a deadline and an optional caller signal. The caller runs
 * `dispose()` once its operation ends, which clears the timer and the listener
 * on the caller's signal. The timer itself holds what it aborts, so the
 * deadline stays in force however long the operation runs: Node 20 can
 * collect a timeout signal that only a combined signal refers to, and such a
 * deadline never fires.
 * @param {number} milliseconds
 * @param {AbortSignal | undefined} signal
 * @returns {{ signal: AbortSignal, dispose: () => void }}
 */
export function deadlineSignal(milliseconds, signal) {
  const controller = new AbortController();
  /** @param {unknown} reason */
  const stop = (reason) => {
    dispose();
    controller.abort(reason);
  };
  const onAbort = () => stop(signal?.reason);
  const timer = setTimeout(() => stop(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), milliseconds);
  const dispose = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  };
  if (signal?.aborted) stop(signal.reason);
  else signal?.addEventListener('abort', onAbort, { once: true });
  return { signal: controller.signal, dispose };
}

/**
 * Stop a process and every process it started. Resolves true only when the
 * stop is confirmed.
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} startedAt when the process was started (`Date.now()`)
 * @returns {Promise<boolean>}
 */
function stopProcessTree(child, startedAt) {
  if (process.platform === 'win32') return stopWindowsTree(child, startedAt);
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    try {
      // The child leads its own process group, so this reaches its descendants.
      process.kill(-Number(child.pid), 'SIGKILL');
      resolve(true);
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error)?.code;
      if (code !== 'ESRCH') child.kill('SIGKILL');
      resolve(code === 'ESRCH');
    }
  });
}

/**
 * Stop a Windows process tree parent first. A tree kill can end a descendant
 * before its parent, and a parent that is still running can react: Compose
 * starts a full clone when its shallow clone fails. So the tree is read from
 * the process table while every link is alive, because ending a Node process
 * also ends the processes it started directly (Node's job object), whose own
 * children would then have parents never seen. The process itself is ended
 * next, before anything it started; then each process of its tree is ended
 * with its own tree, until a fresh table shows none left. Only that confirms
 * the stop: a table that cannot be read, or a process that outlives the last
 * round, leaves it unconfirmed.
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} startedAt
 * @returns {Promise<boolean>}
 */
async function stopWindowsTree(child, startedAt) {
  const rootPid = Number(child.pid);
  const root = { from: fileTime(startedAt - CLOCK_SLACK_MS), until: /** @type {bigint | null} */ (null) };
  /** @type {Map<number, { from: bigint, until: bigint | null }>} */
  const tree = new Map([[rootPid, root]]);
  /** @type {number[] | null} */
  let live = null;
  try {
    live = liveDescendants(await windowsProcessTable(), tree, rootPid);
  } catch {
    live = null;
  }
  child.kill('SIGKILL');
  // Its children were created before it ended.
  root.until = fileTime(Date.now() + CLOCK_SLACK_MS);
  if (live === null) return false;
  for (let round = 1; ; round += 1) {
    if (live.length > 0) {
      // A failed kill shows in the next table, which alone decides.
      const pids = live;
      await new Promise((resolve) => {
        execFile('taskkill', ['/F', '/T', ...pids.flatMap((pid) => ['/PID', String(pid)])],
          { timeout: STOP_CONFIRM_MS, windowsHide: true }, () => resolve(undefined));
      });
    }
    try {
      live = liveDescendants(await windowsProcessTable(), tree, rootPid);
    } catch {
      return false;
    }
    if (live.length === 0) return true;
    if (round === WINDOWS_STOP_ROUNDS) return false;
  }
}

/** @param {number} milliseconds since the Unix epoch */
function fileTime(milliseconds) {
  return BigInt(Math.round(milliseconds)) * 10_000n + FILE_TIME_AT_EPOCH;
}

/**
 * The running Windows processes, each with its parent's ID and its creation
 * time, read through PowerShell's CIM, which every supported Windows has.
 * @returns {Promise<{ pid: number, ppid: number, created: bigint }[]>}
 */
function windowsProcessTable() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROCESS_TABLE_SCRIPT],
      { timeout: PROCESS_TABLE_MS, windowsHide: true, maxBuffer: 4 * MIB }, (error, stdout) => {
        /** @type {{ pid: number, ppid: number, created: bigint }[]} */
        const rows = [];
        for (const line of String(stdout).split(/\r?\n/)) {
          const match = /^(\d+) (\d+) (\d+)$/.exec(line.trim());
          if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]), created: BigInt(match[3]) });
        }
        if (error || rows.length === 0) reject(error ?? new Error('the process table could not be read'));
        else resolve(rows);
      });
  });
}

/**
 * The still-running processes that a process started, directly or through
 * others, parents first. A process belongs to the tree when its parent does
 * and it was created after that parent, because Windows reuses process IDs and
 * a process keeps its ended parent's ID. `tree` keeps every member found so
 * far, so a process whose parent has already ended is still found.
 * @param {{ pid: number, ppid: number, created: bigint }[]} table
 * @param {Map<number, { from: bigint, until: bigint | null }>} tree
 * @param {number} rootPid
 * @returns {number[]}
 */
function liveDescendants(table, tree, rootPid) {
  for (let grew = true; grew;) {
    grew = false;
    for (const row of table) {
      const parent = tree.get(row.ppid);
      if (!parent || tree.has(row.pid) || row.created < parent.from || (parent.until !== null && row.created > parent.until)) continue;
      tree.set(row.pid, { from: row.created, until: null });
      grew = true;
    }
  }
  const running = new Map(table.map((row) => [row.pid, row.created]));
  return [...tree].filter(([pid, member]) => pid !== rootPid && running.get(pid) === member.from).map(([pid]) => pid);
}

/**
 * @typedef {{
 *   cwd?: string,
 *   env: NodeJS.ProcessEnv,
 *   signal: AbortSignal,
 *   deadlineLabel: string,
 *   input?: string,
 *   maxOutput?: number,
 *   onStdout?: (chunk: Buffer) => void,
 * }} GitRun
 */

/**
 * Run one Git command (see `runOwned`).
 * @param {string[]} args
 * @param {GitRun} options
 */
function runGit(args, options) {
  return runOwned('git', args, options);
}

/**
 * Run one owned process to its exit. The deadline, cancellation, output beyond
 * its bound, or a failing stdout consumer stops its whole process tree; the
 * rejection's `cleanupConfirmed` says whether that stop was confirmed.
 * @param {string} command `git`, or an absolute executable path
 * @param {string[]} args
 * @param {GitRun & { name?: string }} options `name` labels the process in messages
 * @returns {Promise<{ code: number, stdout: Buffer, stderr: string }>}
 */
export function runOwned(command, args, {
  cwd, env, signal, deadlineLabel, input, maxOutput = DIAGNOSTIC_BYTES, onStdout, name = 'Git',
}) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortFailure(signal, deadlineLabel));
      return;
    }
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    /** @type {Buffer[]} */
    const stdout = [];
    let stdoutBytes = 0;
    let stderr = '';
    let settled = false;
    /** @type {Error | null} */
    let stopReason = null;
    /** @type {Promise<boolean> | null} */
    let stopping = null;
    /** @type {NodeJS.Timeout | null} */
    let stopWindow = null;

    /** @param {() => void} settle */
    const finish = (settle) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (stopWindow) clearTimeout(stopWindow);
      settle();
    };
    /** @param {Error} reason */
    const stop = (reason) => {
      if (stopping) return;
      stopReason = reason;
      stopping = stopProcessTree(child, startedAt);
      stopWindow = setTimeout(() => finish(() => reject(withCleanup(reason, false))), STOP_WINDOW_MS);
    };
    const onAbort = () => stop(abortFailure(signal, deadlineLabel));
    signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (/** @type {Buffer} */ chunk) => {
      if (stopping) return;
      if (onStdout) {
        try {
          onStdout(chunk);
        } catch (error) {
          stop(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutput) {
        stop(new ReleaseSourceError('too-large', `${name} wrote more than ${Math.round(maxOutput / KIB)} KiB of output`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr?.on('data', (/** @type {Buffer} */ chunk) => {
      if (stderr.length < DIAGNOSTIC_BYTES) stderr += chunk.toString('utf8').slice(0, DIAGNOSTIC_BYTES - stderr.length);
    });
    if (input !== undefined && child.stdin) {
      // A Git that exits early closes its input; that exit is reported instead.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.on('error', (error) => {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      finish(() => reject(code === 'ENOENT' && command === 'git'
        ? new ReleaseSourceError('git-missing', 'Git is required to check or prepare an upgrade; install Git and try again')
        : new ReleaseSourceError('unavailable', `${name} could not be started: ${error.message}`)));
    });
    child.on('close', (code) => {
      if (stopping) {
        const reason = /** @type {Error} */ (stopReason);
        void stopping.then((confirmed) => finish(() => reject(withCleanup(reason, confirmed))));
        return;
      }
      finish(() => resolve({ code: code ?? 1, stdout: Buffer.concat(stdout), stderr: stderr.trim() }));
    });
  });
}

/** @param {AbortSignal} signal @param {string} deadlineLabel */
function abortFailure(signal, deadlineLabel) {
  const reason = /** @type {any} */ (signal.reason);
  if (reason instanceof ReleaseSourceError) return reason;
  return reason?.name === 'TimeoutError'
    ? new ReleaseSourceError('timeout', deadlineLabel)
    : new ReleaseSourceError('cancelled', 'the operation was cancelled');
}

/** @param {Error} error @param {boolean} confirmed */
function withCleanup(error, confirmed) {
  if (error instanceof ReleaseSourceError) {
    error.cleanupConfirmed = confirmed;
    return error;
  }
  return Object.assign(new ReleaseSourceError('failed', error.message, { cleanupConfirmed: confirmed }), { cause: error });
}

/** @param {string} source @param {{ code: number, stderr: string }} result @param {string} action */
function gitFailure(source, result, action) {
  const detail = result.stderr.split('\n').map((line) => line.replace(/^(?:fatal|error): /, '').trim()).filter(Boolean)[0];
  return new ReleaseSourceError('unavailable', `could not ${action} ${source}${detail ? `: ${detail}` : ''}`);
}

/* ------------------------------------------------------------ resolution */

/**
 * Read `git ls-remote` lines into exact ref names and object IDs.
 * @param {Buffer} output
 * @returns {Map<string, string>}
 */
function parseRefs(output) {
  /** @type {Map<string, string>} */
  const refs = new Map();
  for (const line of output.toString('utf8').split('\n')) {
    const match = /^([0-9a-f]{40}|[0-9a-f]{64})\t(\S+)$/.exec(line.trim());
    if (match) refs.set(match[2], match[1]);
  }
  return refs;
}

/** @param {Map<string, string>} refs */
function tagNames(refs) {
  return [...refs.keys()]
    .filter((name) => name.startsWith('refs/tags/') && !name.endsWith('^{}'))
    .map((name) => name.slice('refs/tags/'.length));
}

/**
 * The commit a listed tag names: its peeled commit for an annotated tag.
 * @param {Map<string, string>} refs
 * @param {string} tag
 */
function tagCommit(refs, tag) {
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) ?? null;
}

/**
 * List a source's tags.
 * @param {{ source: string, env: NodeJS.ProcessEnv, signal: AbortSignal, deadlineLabel: string }} input
 */
async function listTags({ source, env, signal, deadlineLabel }) {
  const result = await runGit(['ls-remote', '--tags', '--', source], { env, signal, deadlineLabel, maxOutput: REF_LIST_BYTES });
  if (result.code !== 0) throw gitFailure(source, result, 'list the tags of');
  return parseRefs(result.stdout);
}

/**
 * The tags-only release check: the newest stable tag at `source`, or null when
 * it has none. Runs one noninteractive `git ls-remote` as `releaseCheckCommand`
 * builds it, under the five-second deadline. It creates no file or folder.
 * The check never signs in, so before any process starts it refuses an SSH
 * address, which would offer the launching user's SSH agent and keys, and any
 * address that carries a login, query, or fragment or names a network share.
 * On Windows it first refuses a Git older than Git for Windows 2.32.0(2).
 * @param {{ source: string, signal?: AbortSignal }} input
 * @returns {Promise<string | null>}
 */
export async function latestStableRelease({ source, signal }) {
  checkSourceAddress(source);
  const fallback = 'or run "@dude upgrade --dry-run", which uses your own Git sign-in';
  if (isSshAddress(source)) {
    throw new ReleaseSourceError('unsupported',
      `release checks never sign in, so they do not use the SSH address ${source}; record an HTTPS source to check it automatically, ${fallback}`);
  }
  if (!isCheckAddress(source)) {
    throw new ReleaseSourceError('unsupported',
      `release checks never sign in, so they use only a file:, git:, http:, or https: address with no user name, password, query, or fragment, and no network share; record such a source to check it automatically, ${fallback}`);
  }
  const { args, env } = releaseCheckCommand(source);
  const deadline = deadlineSignal(CHECK_DEADLINE_MS, signal);
  const run = {
    env,
    signal: deadline.signal,
    deadlineLabel: `the release source did not answer within ${CHECK_DEADLINE_MS / 1_000} seconds`,
  };
  try {
    if (process.platform === 'win32') {
      const version = await runGit(['--version'], run);
      const reported = version.stdout.toString('utf8').trim().split('\n')[0];
      if (version.code !== 0 || !isCheckableWindowsGit(reported)) {
        throw new ReleaseSourceError('unsupported',
          `release checks on Windows need Git for Windows 2.32.0(2) or later, because an older one can offer a client certificate from your Windows certificate store by itself; this Git reports ${JSON.stringify(reported.slice(0, 80))}. Update Git, ${fallback}`);
      }
    }
    const result = await runGit(args, { ...run, maxOutput: REF_LIST_BYTES });
    if (result.code !== 0) throw gitFailure(source, result, 'list the tags of');
    return pickLatestReleaseTag(tagNames(parseRefs(result.stdout)));
  } finally {
    deadline.dispose();
  }
}

/**
 * @typedef {{ requestedRef: string, resolvedRef: string, commit: string, fetchRef: string }} Target
 */

/**
 * Resolve the requested ref at the source to one exact commit, freshly. The
 * release channel selects the highest stable tag; a literal tag wins over a
 * same-named branch, as in Git; a full commit name is used as given.
 * @param {{ source: string, ref: string, env: NodeJS.ProcessEnv, signal: AbortSignal, deadlineLabel: string }} input
 * @returns {Promise<Target>}
 */
export async function resolveTarget({ source, ref, env, signal, deadlineLabel }) {
  checkSourceAddress(source);
  if (ref === RELEASE_CHANNEL) {
    const refs = await listTags({ source, env, signal, deadlineLabel });
    const tag = pickLatestReleaseTag(tagNames(refs));
    if (!tag) throw new ReleaseSourceError('no-stable-releases', `no stable releases are published at ${source}`);
    return { requestedRef: ref, resolvedRef: tag, commit: /** @type {string} */ (tagCommit(refs, tag)), fetchRef: `refs/tags/${tag}` };
  }
  const lowered = ref.toLowerCase();
  if (COMMIT_RE.test(lowered)) return { requestedRef: ref, resolvedRef: ref, commit: lowered, fetchRef: lowered };
  checkRefName(ref);
  const result = await runGit(
    ['ls-remote', '--', source, `refs/tags/${ref}`, `refs/tags/${ref}^{}`, `refs/heads/${ref}`],
    { env, signal, deadlineLabel, maxOutput: REF_LIST_BYTES },
  );
  if (result.code !== 0) throw gitFailure(source, result, 'read refs from');
  const refs = parseRefs(result.stdout);
  const tagged = tagCommit(refs, ref);
  if (tagged) return { requestedRef: ref, resolvedRef: ref, commit: tagged, fetchRef: `refs/tags/${ref}` };
  const branch = refs.get(`refs/heads/${ref}`);
  if (branch) return { requestedRef: ref, resolvedRef: ref, commit: branch, fetchRef: `refs/heads/${ref}` };
  throw new ReleaseSourceError('not-found', `${ref} is not a tag or branch at ${source}`);
}

/* ----------------------------------------------------------- acquisition */

/**
 * Whether a release path is deployment content: the four core categories or
 * canonical metadata. The upgrade engine and its imports live inside the core
 * skill directories, so they are included.
 * @param {string} relPath
 */
export function isDeploymentPath(relPath) {
  if (relPath === WORKSPACE_PATHS.BUNDLE_MANIFEST || relPath === WORKSPACE_PATHS.DEVELOPMENT_BASE_RELEASE) return true;
  if (classifyPath(relPath) !== TIER.CORE) return false;
  return relPath.startsWith('.github/extensions/dude/')
    || relPath === '.github/instructions/dude.instructions.md'
    || /^\.github\/agents\/[^/]+\.agent\.md$/.test(relPath)
    || /^\.github\/skills\/[^/]+\/./.test(relPath);
}

/** @param {string} relPath */
function checkReleasePath(relPath) {
  for (const segment of relPath.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[\\<>:"|?*\p{Cc}]/u.test(segment)
      || /[. ]$/.test(segment) || WINDOWS_RESERVED_NAME_RE.test(segment)) {
      throw new ReleaseSourceError('invalid', `the release contains a path that cannot be written safely: ${JSON.stringify(relPath)}`);
    }
  }
}

/**
 * Read `git ls-tree -r -z` records for the selected deployment files, keeping
 * whether Git records each one as executable (`100755`).
 * @param {Buffer} output
 */
function selectDeploymentEntries(output) {
  /** @type {{ path: string, oid: string, executable: boolean }[]} */
  const entries = [];
  for (const record of output.toString('utf8').split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, type, oid] = record.slice(0, tab).split(' ');
    const relPath = record.slice(tab + 1);
    if (!isDeploymentPath(relPath)) continue;
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
      throw new ReleaseSourceError('invalid', `the release has a symbolic link or submodule at ${relPath}`);
    }
    checkReleasePath(relPath);
    entries.push({ path: relPath, oid, executable: mode === '100755' });
    if (entries.length > MAX_RELEASE_FILES) {
      throw new ReleaseSourceError('too-large', `the release has more than ${MAX_RELEASE_FILES} deployment files`);
    }
  }
  return entries;
}

/**
 * Write each blob that `git cat-file --batch` returns, in request order, as raw
 * bytes. A blob Git records as executable is made executable (`0o755`), so the
 * release keeps that permission; Windows has no such permission, so no mode
 * changes there. The running total enforces the release byte ceiling.
 * @param {{ path: string, oid: string, executable: boolean }[]} entries
 * @param {string} releaseRoot
 */
function blobWriter(entries, releaseRoot) {
  let index = 0;
  let total = 0;
  /** @type {Buffer} */
  let pending = Buffer.alloc(0);
  /** @type {Buffer[]} */
  let parts = [];
  let partBytes = 0;
  /** @type {number | null} body bytes plus the closing newline, or null while reading a header */
  let need = null;

  return {
    /** @param {Buffer} chunk */
    write(chunk) {
      parts.push(chunk);
      partBytes += chunk.length;
      for (;;) {
        if (need === null) {
          if (parts.length > 0) {
            pending = Buffer.concat([pending, ...parts]);
            parts = [];
            partBytes = 0;
          }
          const newline = pending.indexOf(0x0a);
          if (newline === -1) return;
          const header = pending.subarray(0, newline).toString('utf8');
          pending = pending.subarray(newline + 1);
          const entry = entries[index];
          const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
          if (!entry || !match || match[1] !== entry.oid) {
            throw new ReleaseSourceError('unavailable', `the release file ${entry?.path ?? '(unexpected)'} could not be read (${header})`);
          }
          total += Number(match[2]);
          if (total > MAX_RELEASE_BYTES) {
            throw new ReleaseSourceError('too-large', `the release deployment files exceed ${MAX_RELEASE_BYTES / MIB} MiB`);
          }
          need = Number(match[2]) + 1;
          parts = pending.length ? [pending] : [];
          partBytes = pending.length;
          pending = Buffer.alloc(0);
        }
        if (partBytes < need) return;
        const joined = Buffer.concat(parts, partBytes);
        const body = joined.subarray(0, need - 1);
        const target = path.join(releaseRoot, ...entries[index].path.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, body);
        if (entries[index].executable && process.platform !== 'win32') fs.chmodSync(target, 0o755);
        pending = joined.subarray(need);
        parts = [];
        partBytes = 0;
        index += 1;
        need = null;
      }
    },
    complete() {
      return index === entries.length && need === null && pending.length === 0 && partBytes === 0;
    },
    get bytes() {
      return total;
    },
  };
}

/**
 * Whether a folder has reached the observation bounds: it reaches 1 GiB or
 * 65,536 files and folders. Every listed entry counts, whatever its type;
 * files are sized by `lstat`, and links are never followed. The walk stops as
 * soon as either bound is reached.
 * @param {string} directory
 */
async function rootReachedLimits(directory) {
  let entries = 0;
  let bytes = 0;
  const pending = [directory];
  while (pending.length > 0) {
    const folder = /** @type {string} */ (pending.pop());
    /** @type {fs.Dirent[]} */
    let listed;
    try {
      listed = await fs.promises.readdir(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    entries += listed.length;
    if (entries >= ROOT_LIMITS.entries) return true;
    for (const entry of listed) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        try {
          bytes += (await fs.promises.lstat(absolute)).size;
        } catch {
          continue;
        }
        if (bytes >= ROOT_LIMITS.bytes) return true;
      }
    }
  }
  return false;
}

/**
 * Observe a folder that owned processes write into until `stop()`: the
 * returned signal also aborts once the folder is seen at the observation
 * bounds.
 * @param {string} directory
 * @param {AbortSignal} signal
 */
export function observeRoot(directory, signal) {
  const controller = new AbortController();
  let observing = false;
  const timer = setInterval(() => {
    if (observing || controller.signal.aborted) return;
    observing = true;
    rootReachedLimits(directory)
      .then((reached) => {
        if (reached) {
          controller.abort(new ReleaseSourceError('too-large',
            `the upgrade's temporary folder grew past 1 GiB or ${ROOT_LIMITS.entries} files and folders, so its work was stopped`));
        }
      }, () => {})
      .finally(() => { observing = false; });
  }, ROOT_LIMITS.intervalMs);
  return { signal: AbortSignal.any([signal, controller.signal]), stop: () => clearInterval(timer) };
}

/**
 * Acquire the deployment bytes of one exact commit into
 * `<destination>/release`. Git works in `<destination>/repo`, which is removed
 * once the bytes are written. The caller owns `destination` and removes it.
 * @param {{
 *   source: string,
 *   target: Target,
 *   destination: string,
 *   env: NodeJS.ProcessEnv,
 *   signal: AbortSignal,
 *   deadlineLabel: string,
 * }} input
 * @returns {Promise<{ files: number, bytes: number }>}
 */
export async function acquireRelease({ source, target, destination, env, signal, deadlineLabel }) {
  checkSourceAddress(source);
  const observed = observeRoot(destination, signal);
  try {
    return await acquireObserved({ source, target, destination, env, signal: observed.signal, deadlineLabel });
  } finally {
    observed.stop();
  }
}

/**
 * @param {{
 *   source: string,
 *   target: Target,
 *   destination: string,
 *   env: NodeJS.ProcessEnv,
 *   signal: AbortSignal,
 *   deadlineLabel: string,
 * }} input
 * @returns {Promise<{ files: number, bytes: number }>}
 */
async function acquireObserved({ source, target, destination, env, signal, deadlineLabel }) {
  const repository = path.join(destination, 'repo');
  const releaseRoot = path.join(destination, 'release');
  // An explicit Git directory also satisfies `safe.bareRepository=explicit`.
  const gitDir = `--git-dir=${repository}`;
  /** @param {string[]} args @param {Partial<GitRun>} [extra] */
  const git = (args, extra = {}) => runGit(args, { env, signal, deadlineLabel, ...extra });

  let result = await git(['init', '--quiet', '--bare', repository]);
  if (result.code !== 0) throw gitFailure(repository, result, 'create a temporary repository at');
  result = await git([gitDir, 'remote', 'add', 'origin', source]);
  if (result.code !== 0) throw gitFailure(source, result, 'record the source');
  result = await git([gitDir, 'fetch', '--quiet', '--no-tags', '--depth=1', '--filter=blob:none', 'origin', target.fetchRef]);
  if (result.code !== 0) throw gitFailure(source, result, `fetch ${target.resolvedRef} from`);
  result = await git([gitDir, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  if (result.code !== 0 || result.stdout.toString('utf8').trim().toLowerCase() !== target.commit) {
    throw new ReleaseSourceError('moved', `${target.resolvedRef} moved at ${source} while it was fetched; prepare the upgrade again`);
  }
  result = await git(
    [gitDir, 'ls-tree', '-r', '-z', '--full-tree', target.commit, '--', '.github', '.dude/metadata'],
    { maxOutput: TREE_LIST_BYTES },
  );
  if (result.code !== 0) throw gitFailure(source, result, `list the files of ${target.resolvedRef} from`);
  const entries = selectDeploymentEntries(result.stdout);
  const objects = [...new Set(entries.map((entry) => entry.oid))];
  if (objects.length > 0) {
    // One request for every selected blob, as Git's own partial-clone backfill
    // does. Blobs the server already sent are not transferred again.
    result = await git(
      [gitDir, '-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head',
        '--recurse-submodules=no', '--filter=blob:none', '--stdin', 'origin'],
      { input: `${objects.join('\n')}\n` },
    );
    if (result.code !== 0) throw gitFailure(source, result, `fetch the files of ${target.resolvedRef} from`);
  }
  fs.mkdirSync(releaseRoot);
  const writer = blobWriter(entries, releaseRoot);
  if (entries.length > 0) {
    result = await git([gitDir, 'cat-file', '--batch'], {
      env: { ...env, GIT_NO_LAZY_FETCH: '1' },
      input: `${entries.map((entry) => entry.oid).join('\n')}\n`,
      onStdout: (chunk) => writer.write(chunk),
    });
    if (result.code !== 0 || !writer.complete()) throw gitFailure(source, result, `read the files of ${target.resolvedRef} from`);
  }
  fs.rmSync(repository, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  return { files: entries.length, bytes: writer.bytes };
}
