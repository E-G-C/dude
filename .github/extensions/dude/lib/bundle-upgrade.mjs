// @ts-check
/**
 * The Canvas update controller. The extension makes one for its process and
 * every Canvas instance shares it. It keeps, in memory only, this session's
 * release check and when it finished, the session-only Later, the one live
 * update (its preparation, ready result, application and outcome) and the
 * write gate. Nothing here is saved, sent to the agent, or made a Needs you
 * request.
 *
 * Release checks. Only a `source_ref: latest` installation with a stable
 * installed version is eligible; pinned, development and unreadable
 * installations never check, and offer no check or update. The session-start
 * check runs in the background after the session joins, reads the saved choice
 * and the manifest first, and contacts nothing when the choice is off or cannot
 * be read. Check for updates runs one fresh check for an eligible installation
 * whatever the choice, and saving a choice runs none. A check is the engine's
 * tags-only `checkInstallation`: credential-free Git, five seconds, no file. A
 * failed check is only a result: no notice and no message. What's new is the
 * engine's release page for a validated GitHub repository and tag, or none; no
 * release notes are fetched.
 *
 * Updates. One live update at a time, prepared and applied by the update action
 * child (upgrade-action.mjs) under the release check's closed Git environment,
 * in a temporary root this controller owns. A new preview replaces the live one
 * and invalidates its result; Cancel, a replacement, or closing the Canvas that
 * started it disposes it. A ready result is applied only by its own opaque ID,
 * at most once. Applying becomes Checking only when the target engine reports
 * that its bundle check after writing has started. A root whose process tree
 * cannot be confirmed stopped, or that cannot be removed, is kept and listed,
 * with why, for the rest of the session, whatever becomes of its update.
 *
 * The write gate. Admitting an application closes it: this process's Canvases
 * then refuse workspace-changing actions and stop serving their interface
 * assets, which the update may be replacing. An application that the engine
 * refused before writing reopens it. After any write attempt it stays closed
 * for the life of this process, and a reload gets only the inert Start a new
 * session page. Admission is in-process only: chat and other processes are not
 * locked out.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInstallation } from '../../../skills/dude-bundle-upgrade/upgrade.mjs';
import {
  ACQUISITION_DEADLINE_MS,
  githubReleaseUrl,
  isStableReleaseTag,
  releaseCheckCommand,
} from '../../../skills/dude-bundle-upgrade/lib/release-source.mjs';
import { PACK_NAME_RE } from '../../../skills/dude-engine/lib/profile.mjs';
import { RELEASE_CHANNEL } from '../../../skills/dude-engine/lib/release-channel.mjs';
import { readInstallationRecord } from './about.mjs';
import { readCanvasPreferences } from './canvas-preferences.mjs';
import { nodeChildLaunch, PACK_ACTION_DEADLINE_MS, STOP_CONFIRM_MS, stopTree } from './packs.mjs';
import { UPGRADE_ACTION_REQUEST_ENV } from './upgrade-action.mjs';

/** The update action child's module. */
const ACTION = fileURLToPath(new URL('./upgrade-action.mjs', import.meta.url));
/** Short, because the engine nests its prepared folder, release and staging copies under it. */
const ROOT_PREFIX = 'dude-cu-';
/** The never-created home inside a run's root (see `childEnvironment`). */
const CHILD_HOME = 'home';
/** After Cancel, a preparation has this long to stop what it started and answer: the engine's Windows stop alone may take 20 seconds. */
const CANCEL_GRACE_MS = 30_000;
/**
 * The engine bounds a preparation by its 55-second acquisition window plus 130
 * seconds for each pack it prepares, but it reads that clock between steps, and
 * a synchronous workspace Git call (30 seconds each) or a Windows stop (20
 * seconds) can run past it. This backstop lets that much more pass before it
 * stops a child that has not answered.
 */
const BACKSTOP_SLACK_MS = 120_000;
/** The engine's preparation activities, in the order it reports them. */
const STEPS = Object.freeze(['fetching', 'staging-core', 'preparing-pack', 'comparing']);
const PREPARED_ID_RE = /^[0-9a-f]{32}$/;
/** The phases before the write boundary: Cancel, a replacement and closing the Canvas dispose them. */
const BEFORE_WRITE = Object.freeze(['preparing', 'ready', 'nothing_to_update', 'failed', 'nothing_changed']);
const START_FAILED = 'The update could not start its helper. Canvas runs updates with Node.js 20 or later on PATH. Nothing changed.';
/**
 * Why a root is kept: the clause an outcome's cleanup sentence gives after
 * "because", and the plain sentence the session's kept list gives beside it.
 * @typedef {{ because: string, reason: string }} KeptReason
 */
/** @type {KeptReason} */
const STOP_UNCONFIRMED = Object.freeze({
  because: 'a process the update started could not be confirmed stopped',
  reason: 'A process the update started could not be confirmed stopped.',
});
/** @type {KeptReason} */
const MATERIAL_IN_USE = Object.freeze({
  because: 'the update kept material there that a process it started may still use',
  reason: 'The folder holds material that a process the update started may still use.',
});

/**
 * @typedef {'invalid_input' | 'identity_mismatch' | 'not_eligible' | 'no_update' | 'stale' | 'busy'
 *   | 'update_in_progress' | 'new_session_required' | 'too_late'} UpdateErrorCode
 */
/** A refused update action: its closed code and HTTP status. Nothing was started or changed. */
export class UpdateError extends Error {
  /** @param {UpdateErrorCode} code @param {number} [status] */
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** @typedef {{ step: string | null, pack: string | null, completed: number | null, total: number | null }} Progress */
/**
 * @typedef {{ status: 'update_available' | 'up_to_date' | 'no_stable_releases' | 'check_failed',
 *   installedRef: string | null, availableRef: string | null, releaseUrl: string | null,
 *   checkedAt: string, message: string | null }} CheckResult
 */
/**
 * The reviewed result, as the engine reported it without hashes.
 * @typedef {{ id: string, fromRef: string | null, toRef: string, releaseUrl: string | null, branch: string,
 *   counts: { core: Counts, metadata: Counts, packs: Record<string, Counts> },
 *   changes: { path: string, group: string, pack: string | null, op: string }[], dirtyPaths: string[],
 *   packs: { eligible: string[], affected: string[], unchanged: string[], notSelected: string[] } }} Preview
 * @typedef {{ added: number, replaced: number, removed: number }} Counts
 */
/**
 * @typedef {{ owner: string, includePacks: boolean, phase: string, progress: Progress, packsSeen: string[],
 *   preview: Preview | null, result: Record<string, unknown>, cleanup: string | null, temporary: string | null,
 *   stop: AbortController, running: Promise<void>, disposed: boolean }} Attempt
 */
/**
 * How one child run ended. `exited` is true only for a child that answered and
 * then closed by itself, which leaves nothing it started still running.
 * @typedef {{ started: boolean, answer: any, exited: boolean, timedOut: boolean }} ActionRun
 */

/** @returns {string} ISO 8601 UTC at seconds precision. */
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
/** @param {unknown} error */
const messageOf = error => (error instanceof Error ? error.message : String(error));
/** @param {unknown} value */
const text = value => (typeof value === 'string' ? value : null);
/** @param {unknown} value @returns {string[]} */
const strings = value => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);

/**
 * The update channel of a recorded installation, read without contacting
 * anything: unavailable unless both refs are usable, and `latest` only with a
 * stable installed version.
 * @param {{ installedRef: string | null, sourceRef: string | null }} record
 * @returns {'latest' | 'pinned' | 'development' | 'unavailable'}
 */
function channelOf({ installedRef, sourceRef }) {
  if (sourceRef === null || installedRef === null) return 'unavailable';
  if (sourceRef === RELEASE_CHANNEL) return isStableReleaseTag(installedRef) ? 'latest' : 'unavailable';
  return isStableReleaseTag(sourceRef) ? 'pinned' : 'development';
}

/**
 * One child progress event as a closed activity, or null: one of a
 * preparation's activities, or an application's one boundary, the start of its
 * bundle check after writing.
 * @param {unknown} event
 * @param {'prepare' | 'apply'} op the child's operation
 * @returns {Progress | null}
 */
function progressOf(event, op) {
  const value = /** @type {any} */ (event);
  if (!value || typeof value !== 'object') return null;
  if (op === 'apply') return value.phase === 'checking' ? { step: 'checking', pack: null, completed: null, total: null } : null;
  if (!STEPS.includes(value.phase)) return null;
  if (value.phase !== 'preparing-pack') return { step: value.phase, pack: null, completed: null, total: null };
  return typeof value.pack === 'string' && PACK_NAME_RE.test(value.pack)
    && Number.isSafeInteger(value.completed) && Number.isSafeInteger(value.total) && value.completed >= 0 && value.total > 0
    ? { step: value.phase, pack: value.pack, completed: value.completed, total: value.total } : null;
}

/** @param {unknown} value @returns {Counts | null} */
function countsOf(value) {
  const counts = /** @type {any} */ (value);
  return counts && ['added', 'replaced', 'removed'].every(key => Number.isSafeInteger(counts[key]))
    ? { added: counts.added, replaced: counts.replaced, removed: counts.removed } : null;
}

/**
 * The engine's ready report as the browser sees it, or null when it is not one.
 * The source is used only for What's new and is not passed on.
 * @param {any} report
 * @returns {Preview | null}
 */
function previewOf(report) {
  const core = countsOf(report?.counts?.core), metadata = countsOf(report?.counts?.metadata);
  const packCounts = report?.counts?.packs && typeof report.counts.packs === 'object' ? Object.entries(report.counts.packs) : null;
  if (report?.status !== 'ready' || typeof report.id !== 'string' || !PREPARED_ID_RE.test(report.id)
    || typeof report.to_ref !== 'string' || typeof report.branch !== 'string' || !core || !metadata || !packCounts
    || !Array.isArray(report.changes) || !report.packs || typeof report.packs !== 'object') return null;
  /** @type {Record<string, Counts>} */
  const packs = {};
  for (const [name, counts] of packCounts) {
    const parsed = countsOf(counts);
    if (!parsed) return null;
    packs[name] = parsed;
  }
  const changes = report.changes.map((/** @type {any} */ change) => ({
    path: change?.path, group: change?.group, pack: change?.pack ?? null, op: change?.op,
  }));
  if (changes.some(change => typeof change.path !== 'string' || !['core', 'metadata', 'pack'].includes(change.group)
    || !['add', 'replace', 'remove'].includes(change.op) || (change.pack !== null && typeof change.pack !== 'string'))) return null;
  return {
    id: report.id,
    fromRef: text(report.from_ref),
    toRef: report.to_ref,
    releaseUrl: githubReleaseUrl(text(report.source?.location) ?? '', report.to_ref),
    branch: report.branch,
    counts: { core, metadata, packs },
    changes,
    dirtyPaths: strings(report.dirty_paths),
    packs: {
      eligible: strings(report.packs.eligible),
      affected: strings(report.packs.affected),
      unchanged: strings(report.packs.unchanged),
      notSelected: strings(report.packs.not_selected),
    },
  };
}

/**
 * The child's whole environment: the release check's closed Git environment
 * (`releaseCheckCommand`), so a Canvas preparation is as credential-free as the
 * check. Only PATH, the Windows system folders and the temporary folder are
 * inherited; Git's home, global file and XDG folder are paths in a home folder
 * that is never created; no system configuration, prompt, askpass program or
 * credential helper is used; and the check's own settings, which it gives on
 * its command line, reach every Git the engine starts as
 * `GIT_CONFIG_PARAMETERS`, the form `git -c` passes on. Only the check's
 * `GIT_DIR` is left out, because preparation needs repositories: its own
 * temporary one and the workspace's.
 *
 * The check's home layout moves into this run's own root, as `CHILD_HOME`. On
 * Windows the engine confirms a stop through PowerShell, which writes its own
 * startup data under the home it is given, so a home outside the root could be
 * created and left behind. Inside it, it is still never created by Canvas, Git
 * still finds no configuration, login or `.netrc` there, and whatever another
 * tool writes there goes with the root. The temporary folder is the same root,
 * where the engine keeps its prepared folder.
 * @param {string} temporary
 * @param {{ op: 'prepare', includePacks: boolean } | { op: 'apply', id: string }} request
 * @returns {Record<string, string>}
 */
function childEnvironment(temporary, request) {
  const { args, env } = releaseCheckCommand('', process.env);
  const settings = args.flatMap((arg, index) => (arg === '-c' && index + 1 < args.length ? [args[index + 1]] : []));
  const replaced = ['GIT_DIR', 'TMPDIR', 'TMP', 'TEMP'];
  /** @param {string} name Windows reads variable names in any case. */
  const isReplaced = name => replaced.some(own => (process.platform === 'win32' ? own.toUpperCase() === name.toUpperCase() : own === name));
  const checkHome = String(env.HOME);
  const home = path.join(temporary, CHILD_HOME);
  /** @type {Record<string, string>} */
  const environment = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || isReplaced(name)) continue;
    environment[name] = value === checkHome || value.startsWith(`${checkHome}${path.sep}`) ? `${home}${value.slice(checkHome.length)}` : value;
  }
  if (process.platform === 'win32') {
    const drive = path.parse(home).root.replace(/[\\/]+$/, '');
    Object.assign(environment, { HOMEDRIVE: drive, HOMEPATH: home.slice(drive.length) });
  }
  return {
    ...environment,
    GIT_CONFIG_PARAMETERS: settings.map(setting => `'${setting.replaceAll("'", "'\\''")}'`).join(' '),
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    [UPGRADE_ACTION_REQUEST_ENV]: JSON.stringify(request),
  };
}

/**
 * Run one closed request in the update action child, to its end. It is never
 * given the workspace's or the user's environment, and it reports over IPC
 * only. A preparation follows `signal`: Cancel asks it to stop what it started
 * and answer, and one that has not closed within the grace period, or within
 * the backstop past the engine's own budget, has its tree stopped from here.
 * An application has no signal and no deadline: it finishes or restores, and
 * its one progress event says that its bundle check after writing started. A
 * child that closes without answering, or is stopped from here, may leave
 * processes it started, so its root must be kept.
 * @param {string} root the workspace
 * @param {string} temporary the run's own root
 * @param {{ op: 'prepare', includePacks: boolean } | { op: 'apply', id: string }} request
 * @param {AbortSignal | null} signal
 * @param {((progress: Progress) => void) | null} onProgress
 * @returns {Promise<ActionRun>}
 */
function runAction(root, temporary, request, signal, onProgress) {
  return new Promise(resolve => {
    const launch = nodeChildLaunch(root, ACTION);
    /** @type {import('node:child_process').ChildProcess} */
    let child;
    try {
      child = childProcess.spawn(launch.command, launch.args, {
        // The run's own empty root: no workspace file can stand in for the
        // `node` that Windows looks for in the working directory first.
        cwd: temporary,
        windowsHide: true,
        // On POSIX an owned process group, so that a stop reaches its descendants.
        detached: process.platform !== 'win32',
        // stdout carries the extension's JSON-RPC; the child reports over IPC.
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: childEnvironment(temporary, request),
      });
    } catch {
      resolve({ started: false, answer: null, exited: false, timedOut: false });
      return;
    }
    const startedAt = performance.now();
    /** @type {any} */
    let answer = null;
    let settled = false, cancelling = false, stopping = false, timedOut = false;
    /** @type {NodeJS.Timeout | undefined} */
    let grace;
    /** @type {NodeJS.Timeout | undefined} */
    let stopWindow;
    /** @type {NodeJS.Timeout | undefined} */
    let backstop;
    /** @param {ActionRun} value */
    const settle = value => {
      if (settled) return;
      settled = true;
      clearTimeout(grace);
      clearTimeout(stopWindow);
      clearTimeout(backstop);
      signal?.removeEventListener('abort', cancel);
      resolve(value);
    };
    const stop = () => {
      if (stopping || settled) return;
      stopping = true;
      stopTree(child, () => {});
      // A child that outlives its tree stop is left running, and its root kept.
      stopWindow = setTimeout(() => settle({ started: true, answer, exited: false, timedOut }), 2 * STOP_CONFIRM_MS);
    };
    function cancel() {
      if (cancelling || settled) return;
      cancelling = true;
      clearTimeout(backstop);
      child.send({ type: 'cancel' }, () => {});
      grace = setTimeout(stop, CANCEL_GRACE_MS);
    }
    /** @param {number} packs the packs the engine said it prepares */
    const arm = packs => {
      clearTimeout(backstop);
      const deadlineAt = startedAt + ACQUISITION_DEADLINE_MS + packs * PACK_ACTION_DEADLINE_MS + BACKSTOP_SLACK_MS;
      backstop = setTimeout(() => { timedOut = true; cancel(); }, Math.max(0, deadlineAt - performance.now()));
    };
    if (request.op === 'prepare') {
      arm(0);
      signal?.addEventListener('abort', cancel, { once: true });
    }
    child.on('message', (/** @type {any} */ message) => {
      if (message?.type === 'result') {
        answer = message.result ?? null;
        return;
      }
      const progress = message?.type === 'progress' ? progressOf(message.event, request.op) : null;
      if (!progress) return;
      if (request.op === 'prepare' && progress.total !== null && !cancelling) arm(progress.total);
      onProgress?.(progress);
    });
    // Kept for the child's whole life: a later error event must never go unhandled.
    child.on('error', () => {
      // The child never started, so there is no process to stop or wait for.
      if (child.pid === undefined) settle({ started: false, answer: null, exited: false, timedOut: false });
    });
    child.once('close', () => {
      if (child.pid === undefined) return settle({ started: false, answer: null, exited: false, timedOut: false });
      if (!stopping && answer !== null) return settle({ started: true, answer, exited: true, timedOut });
      // Stopped from here, or ended without answering: what it started may still run.
      if (!stopping) stopTree(child, () => {});
      return settle({ started: true, answer, exited: false, timedOut });
    });
    if (request.op === 'prepare' && signal?.aborted) cancel();
  });
}

/**
 * Whether a child left nothing of the engine's in its root. Only the home a
 * tool may have created (see `childEnvironment`) does not count.
 * @param {string} folder
 */
async function holdsNothing(folder) {
  try {
    return (await fs.promises.readdir(folder)).every(name => name === CHILD_HOME);
  } catch {
    return false;
  }
}

/**
 * The update controller for one workspace. Construction starts nothing; the
 * extension calls `startSessionCheck` once the session has joined.
 * @param {{ root: string }} options
 */
export function createBundleUpgrade({ root }) {
  const workspace = path.resolve(root);
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {Promise<Awaited<ReturnType<typeof readInstallationRecord>>> | null} */
  let session = null;
  /** @type {Promise<void> | null} */
  let checking = null;
  /** @type {CheckResult | null} */
  let lastCheck = null;
  let dismissed = false;
  /** @type {'open' | 'applying' | 'closed'} */
  let gate = 'open';
  /** @type {Attempt | null} */
  let live = null;
  /** The affected packs the pack choice names, kept while one dialog's previews replace each other. */
  /** @type {string[]} */
  let knownPacks = [];
  /**
   * Temporary roots kept because their process stop or their removal could not
   * be confirmed, in the order kept. They stay listed for the rest of the
   * session, whatever becomes of the update that made them.
   * @type {{ root: string, reason: string }[]}
   */
  const kept = [];

  const notify = () => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* A listener never breaks the controller. */ }
    }
  };

  /** The installation as this session found it, read once. */
  const sessionStart = () => (session ??= readInstallationRecord(workspace));

  function requireOpenGate() {
    if (gate === 'applying') throw new UpdateError('update_in_progress');
    if (gate === 'closed') throw new UpdateError('new_session_required');
  }

  async function requireEligible() {
    if (channelOf(await readInstallationRecord(workspace)) !== 'latest') throw new UpdateError('not_eligible');
  }

  /** @param {Attempt} attempt */
  function view(attempt) {
    const base = {
      phase: attempt.phase,
      includePacks: attempt.includePacks,
      packChoice: knownPacks.length > 0 ? { names: [...knownPacks], checked: attempt.includePacks } : null,
    };
    if (attempt.phase === 'preparing') return { ...base, ...attempt.progress };
    if (attempt.phase === 'nothing_to_update' || attempt.phase === 'failed') {
      return { ...base, ...attempt.result, cleanup: attempt.cleanup };
    }
    const { id, ...reviewed } = /** @type {Preview} */ (attempt.preview);
    if (attempt.phase === 'ready' || attempt.phase === 'applying' || attempt.phase === 'checking') return { ...base, id, ...reviewed };
    return { ...base, ...reviewed, ...attempt.result, cleanup: attempt.cleanup };
  }

  /** The session's update state. It reads the manifest and nothing else. */
  async function state() {
    const [record, start] = await Promise.all([readInstallationRecord(workspace), sessionStart()]);
    return {
      installation: { channel: channelOf(record), installedRef: record.installedRef, sourceRef: record.sourceRef },
      runningRef: start.installedRef,
      checking: checking !== null,
      check: lastCheck,
      notice: gate === 'open' && !dismissed && lastCheck?.status === 'update_available'
        ? { installedRef: lastCheck.installedRef, availableRef: lastCheck.availableRef, releaseUrl: lastCheck.releaseUrl }
        : null,
      update: live ? view(live) : null,
      gate,
      kept: kept.map(entry => ({ root: entry.root, reason: entry.reason })),
    };
  }

  /**
   * One release check at a time; a second request joins the running one.
   * @returns {Promise<void>}
   */
  function runCheck() {
    if (checking) return checking;
    checking = (async () => {
      /** @type {any} */
      let result;
      try {
        result = await checkInstallation({ root: workspace });
      } catch (error) {
        result = { status: 'check_failed', installed_ref: null, detail: messageOf(error) };
      }
      const checkedAt = isoNow();
      const installedRef = text(result?.installed_ref);
      const availableRef = text(result?.available_ref);
      switch (result?.status) {
        case 'upgrade_available':
          lastCheck = { status: 'update_available', installedRef, availableRef, releaseUrl: text(result.release_url), checkedAt, message: null };
          break;
        case 'up_to_date':
          lastCheck = { status: 'up_to_date', installedRef, availableRef, releaseUrl: null, checkedAt, message: null };
          break;
        case 'no_stable_releases':
          lastCheck = { status: 'no_stable_releases', installedRef, availableRef: null, releaseUrl: null, checkedAt, message: null };
          break;
        case 'check_failed':
          lastCheck = { status: 'check_failed', installedRef, availableRef: null, releaseUrl: null, checkedAt,
            message: text(result.detail) || 'the release check failed' };
          break;
        default:
          // The installation became pinned, development or unreadable meanwhile: nothing was checked.
          lastCheck = null;
      }
    })().finally(() => {
      checking = null;
      notify();
    });
    notify();
    return checking;
  }

  /** @param {Attempt} attempt @param {Progress} progress */
  function progress(attempt, progress) {
    if (attempt.disposed || attempt.phase !== 'preparing') return;
    attempt.progress = progress;
    if (progress.pack !== null && !attempt.packsSeen.includes(progress.pack)) attempt.packsSeen.push(progress.pack);
    notify();
  }

  /**
   * Remove an attempt's root once nothing can use it, else keep it: its
   * outcome names it, and the session's kept list keeps it, with why, after
   * the attempt itself is cancelled, replaced or closed.
   * @param {Attempt} attempt
   * @param {boolean} confirmed
   * @param {KeptReason} [why] why the root is kept when it is not confirmed
   */
  async function settleRoot(attempt, confirmed, why = STOP_UNCONFIRMED) {
    const temporary = attempt.temporary;
    if (!temporary) return;
    attempt.temporary = null;
    let reason = why;
    if (confirmed) {
      try {
        await fs.promises.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        return;
      } catch (error) {
        reason = { because: `it could not be removed (${messageOf(error)})`, reason: `The folder could not be removed (${messageOf(error)}).` };
      }
    }
    kept.push(Object.freeze({ root: temporary, reason: reason.reason }));
    attempt.cleanup = `The update's temporary folder was kept at ${temporary} because ${reason.because}.`;
    notify();
  }

  /** @param {Attempt} attempt */
  async function runPreparation(attempt) {
    let temporary;
    try {
      temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), ROOT_PREFIX));
    } catch (error) {
      if (!attempt.disposed) {
        attempt.result = { reason: 'unavailable', pack: null, message: `Canvas could not create a temporary folder for the update: ${messageOf(error)}` };
        attempt.phase = 'failed';
        notify();
      }
      return;
    }
    attempt.temporary = temporary;
    /** @type {ActionRun} */
    const run = attempt.stop.signal.aborted ? { started: false, answer: null, exited: false, timedOut: false }
      : await runAction(workspace, temporary, { op: 'prepare', includePacks: attempt.includePacks }, attempt.stop.signal,
        step => progress(attempt, step));
    const report = run.answer?.ok === true ? run.answer.report : null;
    const ready = run.exited ? previewOf(report) : null;
    if (ready) {
      // Its root holds the result until it is applied or disposed.
      if (attempt.disposed) return;
      attempt.preview = ready;
      if (attempt.includePacks) knownPacks = [...ready.packs.affected];
      attempt.phase = 'ready';
      notify();
      return;
    }
    // The engine removes what it made unless a process may still use it, so a
    // root that still holds any of it once the child closed by itself is kept.
    const confirmed = !run.started || (run.exited && await holdsNothing(temporary));
    await settleRoot(attempt, confirmed, run.exited ? MATERIAL_IN_USE : STOP_UNCONFIRMED);
    if (attempt.disposed) {
      notify();
      return;
    }
    if (run.exited && report?.status === 'nothing_to_update') {
      if (attempt.includePacks) knownPacks = strings(report.packs?.affected);
      attempt.result = { fromRef: text(report.from_ref), toRef: text(report.to_ref), message: text(report.detail) ?? '' };
      attempt.phase = 'nothing_to_update';
    } else {
      const answer = run.answer?.ok === false ? run.answer : null;
      attempt.result = !run.started ? { reason: 'unavailable', pack: null, message: START_FAILED }
        : run.timedOut ? { reason: 'timeout', pack: null, message: 'The preparation did not finish in time, so Canvas stopped it. Nothing in your project changed.' }
          : answer ? { reason: text(answer.reason) ?? 'failed', pack: text(answer.pack), message: text(answer.message) ?? '' }
            : { reason: 'failed', pack: null, message: 'The preparation ended without a result. Nothing in your project changed.' };
      if (attempt.includePacks && attempt.result.reason === 'pack-failed' && attempt.packsSeen.length > 0) knownPacks = [...attempt.packsSeen];
      attempt.phase = 'failed';
    }
    notify();
  }

  /** @param {Attempt} attempt */
  async function runApplication(attempt) {
    const preview = /** @type {Preview} */ (attempt.preview);
    // The engine's one boundary: every file is written and its bundle check starts.
    const toChecking = () => {
      if (attempt.phase !== 'applying') return;
      attempt.phase = 'checking';
      notify();
    };
    const run = await runAction(workspace, /** @type {string} */ (attempt.temporary), { op: 'apply', id: preview.id }, null,
      step => { if (step.step === 'checking') toChecking(); });
    const result = run.answer?.ok === true ? run.answer.result : null;
    if (!run.started) {
      attempt.phase = 'nothing_changed';
      attempt.result = { message: START_FAILED };
    } else if (run.answer?.ok === false) {
      // The engine refused before anything was written.
      attempt.phase = 'nothing_changed';
      attempt.result = { message: text(run.answer.message) ?? '' };
    } else if (result?.outcome === 'applied') {
      attempt.phase = 'applied';
      attempt.result = { existingFailures: strings(result.existing_failures) };
    } else if (result?.outcome === 'nothing_changed') {
      attempt.phase = 'nothing_changed';
      attempt.result = { message: text(result.reason) ?? '' };
    } else if (result?.outcome === 'restored') {
      attempt.phase = 'restored';
      attempt.result = { message: text(result.reason) ?? '', newFailures: strings(result.new_failures) };
    } else if (result?.outcome === 'restoration_unconfirmed') {
      attempt.phase = 'restoration_unconfirmed';
      attempt.result = { message: text(result.reason) ?? '', paths: strings(result.paths), newFailures: strings(result.new_failures) };
    } else {
      // No answer: any reviewed file may have been written and not put back.
      attempt.phase = 'restoration_unconfirmed';
      attempt.result = {
        message: 'The update ended without reporting what it changed, so Canvas cannot confirm that your files are as they were.',
        paths: preview.changes.map(change => change.path),
        newFailures: [],
      };
    }
    gate = attempt.phase === 'nothing_changed' ? 'open' : 'closed';
    notify();
    // The engine released its prepared folder; a child that did not close by itself is not trusted with the root.
    await settleRoot(attempt, !run.started || run.exited);
    notify();
  }

  /**
   * End an attempt before its write boundary: stop its preparation, then
   * remove its root, or keep it in the session's kept list.
   * @param {Attempt} attempt
   */
  async function dispose(attempt) {
    attempt.disposed = true;
    attempt.stop.abort();
    await attempt.running;
    // A ready result's root: its child closed long ago, so nothing uses it.
    await settleRoot(attempt, true);
    notify();
  }

  return {
    /** @param {string} candidate */
    matchesRoot(candidate) { return path.resolve(candidate) === workspace; },

    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** Whether the write gate is open, applying, or closed after a write attempt. */
    get gate() { return gate; },

    /**
     * The session-start check, in the background: nothing needs to wait for
     * it, and the promise it returns never rejects. An unreadable or off
     * choice, or an ineligible installation, contacts nothing.
     * @returns {Promise<void>}
     */
    startSessionCheck() {
      return (async () => {
        const start = await sessionStart();
        const choice = await readCanvasPreferences();
        if ('error' in choice || !choice.checkForUpdatesOnSessionStart) return;
        if (channelOf(start) !== 'latest') return;
        await runCheck();
      })().catch(() => {});
    },

    /** GET: this session's state, never acquiring anything. */
    read: state,

    /** Check for updates: one fresh check for an eligible installation, whatever the saved choice. */
    async check() {
      await requireEligible();
      requireOpenGate();
      void runCheck();
      return state();
    },

    /** Later: hide the notice for this session. */
    async later() {
      dismissed = true;
      notify();
      return state();
    },

    /**
     * Prepare the newest release for review, replacing the live update.
     * @param {{ includePacks: boolean, owner: string }} input
     */
    async preview({ includePacks, owner }) {
      await requireEligible();
      requireOpenGate();
      if (lastCheck?.status !== 'update_available') throw new UpdateError('no_update');
      const previous = live;
      if (!previous) knownPacks = [];
      /** @type {Attempt} */
      const attempt = {
        owner, includePacks, phase: 'preparing', progress: { step: null, pack: null, completed: null, total: null },
        packsSeen: [], preview: null, result: {}, cleanup: null, temporary: null,
        stop: new AbortController(), running: Promise.resolve(), disposed: false,
      };
      live = attempt;
      if (previous) void dispose(previous).catch(() => {});
      attempt.running = runPreparation(attempt).catch(() => {});
      notify();
      return state();
    },

    /** Cancel or Close before the write boundary: dispose the live update. */
    async cancel() {
      const attempt = live;
      if (attempt && !BEFORE_WRITE.includes(attempt.phase)) throw new UpdateError('too_late');
      if (attempt) {
        live = null;
        knownPacks = [];
        void dispose(attempt).catch(() => {});
        notify();
      }
      return state();
    },

    /**
     * OK: apply exactly the ready result with this ID, at most once.
     * @param {{ id: string }} input
     */
    async apply({ id }) {
      requireOpenGate();
      const attempt = live;
      if (!attempt || attempt.phase !== 'ready' || attempt.preview?.id !== id) throw new UpdateError('stale');
      gate = 'applying';
      attempt.phase = 'applying';
      attempt.running = runApplication(attempt).catch(() => {});
      notify();
      return state();
    },

    /**
     * A closing Canvas ends the update it started, unless it already started
     * writing: that finishes or restores.
     * @param {string} owner
     */
    async release(owner) {
      const attempt = live;
      if (!attempt || attempt.owner !== owner || !BEFORE_WRITE.includes(attempt.phase)) return;
      live = null;
      knownPacks = [];
      notify();
      await dispose(attempt);
    },
  };
}
