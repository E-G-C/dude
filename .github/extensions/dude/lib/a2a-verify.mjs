// @ts-check
/**
 * Named verification runs for one serving activation.
 *
 * An owner-approved catalog entry fixes the absolute executable, argument
 * vector, cwd, environment policy, timeout, and per-stream output bound; a
 * caller supplies only declared parameter values, each filling one whole
 * argument element. A run spawns without a shell, with stdin ignored and only
 * the declared environment: declared inherited names that are present plus
 * fixed values. On Windows, where Node gives every child a set of system
 * variables unless they are supplied, undeclared ones are passed blank so
 * their values do not flow in. Output is drained while it is counted and
 * hashed, and only each stream's approved prefix is kept; a full-stream
 * digest is reported only for a stream observed to its end.
 *
 * Revision observations use only the configured Git executable:
 * `rev-parse HEAD` and `status --porcelain=v1 -z`, which counts untracked
 * files. Ignored files are not checked, and a change undone between
 * observations is not seen.
 *
 * Termination is requested only for a process this module started and only
 * while its exit has not been observed: its POSIX process group, or its
 * Windows process tree through taskkill. A request, and what was seen of its
 * helper, is recorded separately from any observed direct exit; none of it
 * proves that descendants stopped.
 * This is not a sandbox: project code can exceed its declared effects.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * How long observation continues after a direct exit or a termination
 * request, so a descendant holding the output pipes cannot hang a run.
 * Streams still open then are recorded incomplete.
 */
export const SETTLE_MS = 2_000;
const PLACEHOLDER = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** Node on Windows supplies these to every child that is not given them. */
const WINDOWS_SUPPLIED = Object.freeze(['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP',
  'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR']);

/** @typedef {import('./a2a.mjs').Command} Command */
/** @typedef {import('./a2a.mjs').RevisionPolicy} RevisionPolicy */
/** @typedef {import('./a2a-transport.mjs').StreamRecord} StreamRecord */
/** @typedef {import('./a2a-transport.mjs').RevisionObservation} RevisionObservation */
/** @typedef {import('./a2a-transport.mjs').RunEnvironment} RunEnvironment */
/** @typedef {import('./a2a-transport.mjs').TerminationRecord} Termination */
/**
 * What the Windows termination helper was later seen to do.
 * @typedef {{kind: 'spawn'} | {kind: 'error', code: string} | {kind: 'exit', code: number | null, signal: string | null}} HelperEvent
 */
/**
 * @typedef {(pid: number, spawn: typeof nodeSpawn, observe: (event: HelperEvent) => void) => Omit<Termination, 'reason'>} Terminate
 */
/**
 * @typedef {object} ProcessResult
 * @property {'exited' | 'spawn_failed' | 'timed_out' | 'cancelled'} outcome `exited` means the direct
 *   process exited on its own; `timed_out` and `cancelled` mean termination was requested or the run never started.
 * @property {number | null} startedAt When the process started, if it did.
 * @property {number} endedAt When observation ended.
 * @property {{code: number | null, signal: string | null} | null} exit The observed direct exit, if any.
 * @property {Termination | null} termination
 * @property {string | null} spawnError
 * @property {StreamRecord} stdout
 * @property {StreamRecord} stderr
 */

/** A refusal before anything ran; its message names rules, never configuration values. */
export class VerifyError extends Error {
  /** @param {string} code @param {string} detail */
  constructor(code, detail) {
    super(detail);
    this.code = code;
  }
}

/** @param {string | Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Digest of one catalog entry as approved. Fixed environment values are left
 * out so the shareable digest reveals nothing about them; the activation's
 * binding digest still covers them locally.
 * @param {string} id @param {Command} command
 */
export function commandDigest(id, command) {
  return sha256(JSON.stringify({
    id,
    executable: command.executable,
    args: command.args,
    params: command.params,
    cwd: command.cwd,
    env: { inherit: command.env.inherit, set: command.env.set.map(([name]) => name) },
    timeoutMs: command.timeoutMs,
    outputBytes: command.outputBytes,
    effects: command.effects,
  }));
}

/**
 * The argument vector after the executable. Every declared parameter is
 * required, nothing else is accepted, and each value must be one of its enum
 * values or match its whole anchored pattern.
 * @param {Command} command @param {Record<string, string>} params
 * @returns {string[]}
 */
export function expandArgv(command, params) {
  const declared = new Map(command.params);
  for (const name of Object.keys(params)) {
    if (!declared.has(name)) throw new VerifyError('invalid_params', `parameter ${name} is not declared by this command`);
  }
  for (const [name, spec] of command.params) {
    if (!Object.hasOwn(params, name)) throw new VerifyError('invalid_params', `parameter ${name} is required`);
    const value = params[name];
    const allowed = typeof value === 'string' && !CONTROL.test(value)
      && (spec.kind === 'enum' ? spec.values.includes(value) : new RegExp(`^(?:${spec.pattern})$`, 'u').test(value));
    if (!allowed) throw new VerifyError('invalid_params', `parameter ${name} is not an allowed value`);
  }
  return command.args.map((arg) => {
    const slot = PLACEHOLDER.exec(arg);
    return slot ? params[slot[1]] : arg;
  });
}

/**
 * The declared environment, and the non-secret facts a record may report.
 * @param {Command} command @param {Record<string, string | undefined>} source
 * @param {NodeJS.Platform} [platform]
 * @returns {{env: Record<string, string>, facts: RunEnvironment}}
 */
export function commandEnvironment(command, source, platform = process.platform) {
  /** @type {Record<string, string>} */
  const env = {};
  const inherited = command.env.inherit.map((name) => {
    const value = source[name];
    if (value !== undefined) env[name] = value;
    return { name, present: value !== undefined };
  });
  for (const [name, value] of command.env.set) env[name] = value;
  const declared = new Set([...command.env.inherit, ...command.env.set.map(([name]) => name)].map((name) => name.toUpperCase()));
  const blanked = platform === 'win32' ? WINDOWS_SUPPLIED.filter((name) => !declared.has(name)) : [];
  for (const name of blanked) env[name] = '';
  return {
    env,
    facts: { platform, arch: process.arch, inherited, fixed: command.env.set.map(([name]) => name), blanked, values: 'hidden' },
  };
}

/**
 * The length of `bytes` that ends on a UTF-8 character boundary.
 * @param {Buffer} bytes
 */
function utf8Boundary(bytes) {
  let index = bytes.length - 1;
  let continuation = 0;
  while (index >= 0 && continuation < 3 && (bytes[index] & 0xc0) === 0x80) {
    index -= 1;
    continuation += 1;
  }
  if (index < 0) return bytes.length;
  const lead = bytes[index];
  const width = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  return index + width > bytes.length ? index : bytes.length;
}

/**
 * Count and hash a stream as it drains, keeping only a prefix of `limit` bytes.
 * @param {number} limit
 */
function capture(limit) {
  const hash = createHash('sha256');
  /** @type {Buffer[]} */
  const kept = [];
  let keptBytes = 0;
  let bytes = 0;
  return {
    /** @param {Buffer} chunk */
    push(chunk) {
      hash.update(chunk);
      bytes += chunk.length;
      if (keptBytes < limit) {
        const part = chunk.subarray(0, limit - keptBytes);
        kept.push(part);
        keptBytes += part.length;
      }
    },
    /** @param {boolean} complete @returns {StreamRecord} */
    finish(complete) {
      let prefix = Buffer.concat(kept);
      if (prefix.length < bytes) prefix = prefix.subarray(0, utf8Boundary(prefix));
      let text;
      let lossy = false;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(prefix);
      } catch {
        lossy = true;
        text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(prefix);
      }
      return { bytes, complete, sha256: complete ? hash.digest('hex') : null, retained: prefix.length, text, lossy };
    },
  };
}

/** @param {unknown} error @param {string} [fallback] */
function errorCode(error, fallback = 'spawn_failed') {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : fallback;
}

/**
 * Request termination of the process tree this module started, by its own
 * identity only: its POSIX process group (created at spawn), or its Windows
 * tree through taskkill resolved from SystemRoot rather than PATH. The
 * helper's start, launch error, or exit arrives later through `observe`; its
 * error codes are kept, never its messages or paths.
 * @param {number} pid @param {typeof nodeSpawn} [spawn] @param {(event: HelperEvent) => void} [observe]
 * @returns {Omit<Termination, 'reason'>}
 */
export function terminateTree(pid, spawn = nodeSpawn, observe = () => undefined) {
  if (process.platform === 'win32') {
    const method = 'windows-taskkill-tree';
    const root = process.env.SystemRoot ?? process.env.windir;
    if (!root) return { method, result: 'unavailable', error: null, helper: null };
    let helper;
    try {
      helper = spawn(path.join(root, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false });
    } catch (error) {
      return { method, result: 'failed', error: errorCode(error, 'error'), helper: null };
    }
    helper.once('spawn', () => observe({ kind: 'spawn' }));
    helper.on('error', (error) => observe({ kind: 'error', code: errorCode(error, 'error') }));
    helper.once('exit', (code, signal) => observe({ kind: 'exit', code, signal }));
    return { method, result: 'requested', error: null, helper: { started: false, exit: null } };
  }
  const method = 'posix-process-group-sigkill';
  try {
    process.kill(-pid, 'SIGKILL');
    return { method, result: 'requested', error: null, helper: null };
  } catch (error) {
    const code = errorCode(error, 'error');
    return code === 'ESRCH' ? { method, result: 'no_such_group', error: null, helper: null } : { method, result: 'failed', error: code, helper: null };
  }
}

/**
 * Run one process to completion, timeout, or cancellation. `signal` carries
 * the one deadline and every cancellation; `cause` names why it aborted. The
 * process is never started after `signal` aborted, and termination is never
 * requested after its exit was observed, when its identity may be reused.
 * Within the settle bound, observation also waits for a termination helper
 * to exit or fail to launch, so the record reports what was seen of it.
 * @param {{
 *   executable: string, argv: string[], cwd: string, env: Record<string, string>, outputBytes: number,
 *   signal: AbortSignal, cause: () => string, now: () => number,
 *   spawn?: typeof nodeSpawn, terminate?: Terminate, settleMs?: number, onStart?: () => void,
 * }} options
 * @returns {Promise<ProcessResult>}
 */
export function runProcess({
  executable, argv, cwd, env, outputBytes, signal, cause, now,
  spawn = nodeSpawn, terminate = terminateTree, settleMs = SETTLE_MS, onStart,
}) {
  return new Promise((resolve) => {
    const stdout = capture(outputBytes);
    const stderr = capture(outputBytes);
    if (signal.aborted) {
      const endedAt = now();
      resolve({
        outcome: cause() === 'timeout' ? 'timed_out' : 'cancelled', startedAt: null, endedAt, exit: null, termination: null,
        spawnError: null, stdout: stdout.finish(false), stderr: stderr.finish(false),
      });
      return;
    }
    /** @type {number | null} */
    let startedAt = null;
    /** @type {{code: number | null, signal: string | null} | null} */
    let exit = null;
    /** @type {Termination | null} */
    let termination = null;
    /** @type {string | null} */
    let spawnError = null;
    let outEnded = false;
    let errEnded = false;
    let settled = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let settleTimer = null;
    /** @type {import('node:child_process').ChildProcess | null} */
    let child = null;
    const outcome = () => (termination ? (termination.reason === 'timeout' ? 'timed_out' : 'cancelled') : 'exited');
    /** @param {ProcessResult['outcome']} result */
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (settleTimer) clearTimeout(settleTimer);
      signal.removeEventListener('abort', onAbort);
      // Stop reading pipes a descendant may still hold open.
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      // A copy: later helper events cannot change a record already handed off.
      const final = termination && { ...termination, helper: termination.helper && { ...termination.helper } };
      resolve({
        outcome: result, startedAt, endedAt: now(), exit, termination: final, spawnError,
        stdout: stdout.finish(outEnded), stderr: stderr.finish(errEnded),
      });
    };
    const settleSoon = () => {
      if (!settled && !settleTimer) settleTimer = setTimeout(() => finish(outcome()), settleMs);
    };
    // A termination helper counts as observed once it failed to launch or exited.
    const helperSettled = () => !termination?.helper || termination.error !== null || termination.helper.exit !== null;
    const maybeDone = () => {
      if (exit && outEnded && errEnded && helperSettled()) finish(outcome());
    };
    /** @param {HelperEvent} event */
    const observeHelper = (event) => {
      const request = termination;
      if (settled || !request?.helper) return;
      if (event.kind === 'spawn') request.helper.started = true;
      else if (event.kind === 'exit') request.helper.exit = { code: event.code, signal: event.signal };
      else if (request.error === null) {
        request.result = 'failed';
        request.error = event.code;
      }
      maybeDone();
    };
    const onAbort = () => {
      if (settled) return;
      if (exit) {
        finish(outcome());
        return;
      }
      const pid = child?.pid;
      const reason = cause();
      if (pid === undefined) {
        termination = { reason, method: 'none', result: 'unavailable', error: null, helper: null };
      } else {
        const request = terminate(pid, spawn, observeHelper);
        termination = { reason, method: request.method, result: request.result, error: request.error ?? null, helper: request.helper ?? null };
      }
      settleSoon();
    };
    try {
      child = spawn(executable, argv, {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // A POSIX process group makes termination reach this run's tree only.
        detached: process.platform !== 'win32',
      });
    } catch (error) {
      spawnError = errorCode(error);
      finish('spawn_failed');
      return;
    }
    const started = child;
    started.once('spawn', () => {
      startedAt = now();
      onStart?.();
    });
    started.once('error', (error) => {
      if (startedAt === null && exit === null) {
        spawnError = errorCode(error);
        finish('spawn_failed');
      }
    });
    started.stdout?.on('data', (/** @type {Buffer} */ chunk) => stdout.push(chunk));
    started.stdout?.once('end', () => { outEnded = true; maybeDone(); });
    started.stdout?.on('error', () => undefined);
    started.stderr?.on('data', (/** @type {Buffer} */ chunk) => stderr.push(chunk));
    started.stderr?.once('end', () => { errEnded = true; maybeDone(); });
    started.stderr?.on('error', () => undefined);
    started.once('exit', (code, exitSignal) => {
      exit = { code, signal: exitSignal };
      if (!outEnded || !errEnded) settleSoon();
      maybeDone();
    });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** @param {string} reason @returns {RevisionObservation} */
export function unobserved(reason) {
  return { head: null, statusBytes: null, statusSha256: null, clean: null, unknown: reason };
}

/** @param {ProcessResult} result */
function probeFailure(result) {
  if (result.outcome === 'spawn_failed') return 'git_unavailable';
  if (result.outcome === 'timed_out') return 'probe_timeout';
  if (result.outcome === 'cancelled') return 'probe_cancelled';
  return result.exit?.code === 0 ? null : 'probe_failed';
}

/**
 * Observe HEAD and porcelain status with the configured Git executable only;
 * a missing executable or failing probe is reported, never replaced by
 * another program. The probes run with fsmonitor off, without optional index
 * writes, and without the adapter's wider environment.
 * @param {{git: string | null, workspace: string, signal: AbortSignal, cause: () => string, now: () => number,
 *   spawn?: typeof nodeSpawn, terminate?: Terminate}} options
 * @returns {Promise<RevisionObservation>}
 */
export async function observeRevision({ git, workspace, signal, cause, now, spawn, terminate }) {
  if (!git) return unobserved('git_not_configured');
  /** @type {Record<string, string>} */
  const env = { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
  for (const name of ['SystemRoot', 'HOME', 'USERPROFILE']) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const probe = (/** @type {string[]} */ args, /** @type {number} */ outputBytes) => runProcess({
    executable: git, argv: ['-c', 'core.fsmonitor=false', '-C', workspace, ...args], cwd: workspace, env, outputBytes,
    signal, cause, now, spawn, terminate,
  });
  const head = await probe(['rev-parse', 'HEAD'], 128);
  const headFailure = probeFailure(head);
  if (headFailure) return unobserved(headFailure);
  const sha = head.stdout.text.trim();
  if (!head.stdout.complete || head.stdout.retained !== head.stdout.bytes || !COMMIT.test(sha)) return unobserved('probe_failed');
  const status = await probe(['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--ignore-submodules=none'], 0);
  const statusFailure = probeFailure(status);
  if (statusFailure) return unobserved(statusFailure);
  if (!status.stdout.complete || status.stdout.sha256 === null) return unobserved('probe_failed');
  return { head: sha, statusBytes: status.stdout.bytes, statusSha256: status.stdout.sha256, clean: status.stdout.bytes === 0, unknown: null };
}

/**
 * The refusal a revision policy requires before spawning, or null. A commit
 * pin needs an observed matching HEAD and an empty status; unknown never
 * satisfies it. The worktree policy accepts whatever is current.
 * @param {RevisionPolicy} policy @param {RevisionObservation} before
 */
export function revisionRefusal(policy, before) {
  if (policy === 'worktree') return null;
  if (before.unknown !== null) return before.unknown === 'git_not_configured' || before.unknown === 'git_unavailable' ? 'git_unavailable' : 'revision_unobservable';
  if (before.head !== policy.commit) return 'revision_mismatch';
  return before.clean ? null : 'worktree_dirty';
}

/**
 * Whether the observed revision or status changed across the run: unknown
 * unless both observations exist.
 * @param {RevisionObservation} before @param {RevisionObservation} after
 * @returns {boolean | 'unknown'}
 */
export function changedDuringRun(before, after) {
  if (before.unknown !== null || after.unknown !== null) return 'unknown';
  return before.head !== after.head || before.statusSha256 !== after.statusSha256;
}
