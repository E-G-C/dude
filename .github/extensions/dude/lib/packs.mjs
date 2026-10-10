// @ts-check
/**
 * Private Canvas pack-read boundary. Compose owns parsing and source resolution;
 * this adapter owns read lifetime, safe paths and the joined snapshot's preimage.
 *
 * Every catalog read runs in a short-lived helper process (catalog-reader.mjs),
 * and there are three reads: the default catalog (the local library, else the
 * recorded upstream), one saved source, and an explicit discovery of the default
 * plus each saved source. At most four helpers are ever active in this process,
 * and at most sixteen more wait for one. A helper's deadline follows from what it
 * reads: a folder, a public GitHub catalog, or another host's whole clone. Every
 * helper one operation starts, and every wait for a helper, also ends within that
 * operation's one acquisition window, so no Git runs on the Canvas thread and no
 * read outlives its bounds.
 *
 * Source identity of a saved local folder needs its real path, and a path on an
 * unreachable share can block a synchronous call for as long as the OS waits. So
 * the Canvas thread never resolves one: a helper per folder does, behind the
 * folder deadline. A folder that does not answer costs only its own slot, and an
 * operation that does not need it does not wait for it:
 *
 * - a request that names a source by key describes every saved folder at once and
 *   stops at the first answer that carries the key, which stops the others;
 * - adding a repository never looks at a saved folder, because a repository can
 *   only repeat another repository;
 * - only an operation that must know every folder (the source rows, a refresh
 *   whose recorded source may be a folder, a discovery) waits for all of them,
 *   each for at most its own deadline.
 *
 * A folder that did not answer keeps the key the shared module gives any folder
 * it cannot resolve, the one from its spelling, so its saved entry stays
 * addressable and removable. The one later exception to "never resolved here" is
 * the synchronous final recheck of a bound local source's pack manifest, which
 * runs only right after a helper proved the folder reachable.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cmdStatus, readManifestSource } from '../../../skills/dude-compose/compose.mjs';
import { PACK_NAME_RE } from '../../../skills/dude-engine/lib/profile.mjs';
import {
  MAX_ADDED_SOURCES,
  PACK_SOURCES_PATH,
  PackSourceError,
  describeBuiltinSources,
  describePackSources,
  matchesRecordedSource,
  readPackSources,
  serializePackSourcesDocument,
  validateNewSource,
  writePackSources,
} from '../../../skills/dude-engine/lib/pack-sources.mjs';
import { resolveMutationPath, WORKSPACE_PATHS } from '../../../skills/dude-engine/lib/workspace-paths.mjs';
import { CANDIDATE_DOCUMENT, CATALOG_GIT_HOME_ENV, CATALOG_REQUEST_ENV, CATALOG_STOP_MARKER } from './catalog-reader.mjs';

// How long one reader may run before it is stopped, by what it reads, counted
// from its slot's admission rather than its launch. Each budget follows from the
// validated source and the operation, never from a caller: a folder is
// described, validated or read within the local bound, and a public GitHub
// catalog within Compose's own 30-second catalog acquisition. Another host's
// whole clone gets 55 seconds, five fewer than Compose's own 60-second Git
// deadline, which starts later still, once the reader runs. So this process
// stops the reader's whole tree, within its two-second stop window, before
// Compose's deadline can stop only Git's launcher, which on Windows leaves the
// real Git running outside that tree. Never return a truncated catalog: one
// reader process carries the complete result, with O(record bytes) memory
// rather than per-row reads or a retained catalog cache.
const READER_BUDGET_MS = Object.freeze({ local: 5_000, github: 30_000, git: 55_000 });
// Every reader one operation starts, and every wait for a reader slot, ends
// within this one absolute window from the operation's start.
const ACQUISITION_WINDOW_MS = 60_000;
// A timed-out or cancelled reader has this long to confirm that its whole
// process tree stopped before its read reports unconfirmed cleanup.
const STOP_CONFIRM_MS = 2_000;
// No more helpers than this are active at once, across every read in this process.
const MAX_READERS = 4;
// No more reads than this wait for a slot, across every read in this process. A
// further one is refused at once and never launches.
const MAX_WAITING_READERS = 16;
// A reader's own root, which holds any clone Compose makes, is observed while it
// runs, and a read whose root is seen at this size or entry count is stopped.
// Checks are asynchronous, skip the links they see in a listing, start every
// 250 ms and never overlap, so writes can overshoot between checks. They are a
// best-effort observation, not a quota or a race-proof boundary.
const ROOT_LIMITS = Object.freeze({ bytes: 1_073_741_824, entries: 65_536, intervalMs: 250 });
// Each read runs this module in its own helper process.
const READER = fileURLToPath(new URL('./catalog-reader.mjs', import.meta.url));
const CATALOG_FAILURES = Object.freeze({
  catalog_timeout: 'The catalog read timed out. Reload to try a fresh read.',
  catalog_cleanup_failed: 'The catalog reader could not confirm process cleanup.',
  catalog_busy: 'Too many catalog reads were waiting, so this one did not start. Reload to try a fresh read.',
  catalog_too_large: 'The source grew past 1 GiB or 65,536 files and folders while it was read, so the read was stopped.',
});
// Compose's own test of a URL-shaped location, which the shared checks treat as a
// public repository and never resolve as a folder. A location that does not match
// is a folder path, which only a helper may resolve.
const URL_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]+:/;

/** @typedef {import('../../../skills/dude-engine/lib/pack-sources.mjs').PackSource} PackSource */
/** @typedef {import('../../../skills/dude-engine/lib/pack-sources.mjs').DescribedSource} DescribedSource */
/** What a reader reads, which alone decides its budget. @typedef {keyof typeof READER_BUDGET_MS} ReaderPurpose */
/** @typedef {{ type: 'remote', repository: string, ref: string } | { type: 'local', location: string }} BoundSource */
/** The closed value a pack request carries for a source the project added. @typedef {{ key: string, sourcesRevision: string, source: BoundSource }} CatalogSource */
/** @typedef {{ status: 'read' | 'unavailable', reason: string | null, message: string | null,
 *   result: { packs: any[], enabled_packs: string[], origin: string } | null }} SourceRead */
/**
 * One saved entry, as far as this read could describe it. `source` carries the
 * derived identity and key. A local folder that did not answer is described by
 * its spelling instead (`root` null) and carries the reason in `problem`, so it
 * still has a key. `described` is false for an entry this read deliberately left
 * alone, which has no `source`.
 * @typedef {object} SavedSource
 * @property {number} index
 * @property {PackSource} entry
 * @property {boolean} described
 * @property {DescribedSource | null} source
 * @property {{ reason: string, message: string } | null} problem
 * @property {SourceRead | null} read
 */

/** @param {string | Buffer} bytes */
function identity(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** @param {string} root */
function readRootIdentity(root) {
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('The workspace root must be a non-linked directory.');
  return identity(JSON.stringify([fs.realpathSync(root), rootStat.dev, rootStat.ino]));
}

/** @param {string} root @param {string} [rootIdentity] */
function profilePreimage(root, rootIdentity = readRootIdentity(root)) {
  const profile = resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
  let stat;
  try { stat = fs.lstatSync(profile); }
  catch (error) {
    if (error?.code === 'ENOENT') return { rootIdentity, profileRevision: 'absent', stamp: null };
    throw error;
  }
  if (!stat.isFile()) throw new Error('The installed profile must be a regular file.');
  return {
    rootIdentity,
    profileRevision: identity(fs.readFileSync(profile)),
    stamp: JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]),
  };
}

/**
 * The saved sources file as one input to a request's basis: its raw-byte
 * revision (`absent` when missing), or, when it cannot be trusted, a stamp that
 * still changes whenever the file does. Whether it parses never decides this
 * input, so a request is bound to the document even while it is unreadable.
 * @param {string} root
 */
function sourcesInput(root) {
  const saved = readPackSources(root);
  if (saved.ok) return saved.revision;
  try {
    const stat = fs.lstatSync(resolveMutationPath(root, PACK_SOURCES_PATH));
    return `unreadable:${identity(JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]))}`;
  } catch { return 'unreadable:unsafe'; }
}

/**
 * Local acquisition inputs, not an integrity claim about installed/source
 * bytes. The Compose owner must still bind its actual preview and apply.
 * A request also binds its one selected local manifest across async queue
 * checks, and the saved sources file, so a saved-source change is a basis change
 * for every request that reads a catalog. Remote content/commit and projected
 * targets belong to the later owner preview; this synchronous check never
 * fetches or scans a catalog. A bound source replaces the default inputs: the
 * default catalog is not what it reads.
 * @param {string} root @param {string} [name] @param {CatalogSource | null} [selection]
 */
function catalogInputsRevision(root, name, selection = null) {
  const inspect = absolute => {
    let stat;
    try { stat = fs.lstatSync(absolute); }
    catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    return { directory: stat.isDirectory(), file: stat.isFile(), realpath: fs.realpathSync(absolute),
      stamp: [stat.dev, stat.ino, stat.mtimeMs, stat.ctimeMs],
      revision: stat.isFile() ? identity(fs.readFileSync(absolute)) : null };
  };
  /** @type {unknown[]} */
  const inputs = [];
  if (name !== undefined && !PACK_NAME_RE.test(name)) throw new Error('Invalid selected pack name.');
  if (!selection) {
    const manifest = inspect(resolveMutationPath(root, WORKSPACE_PATHS.BUNDLE_MANIFEST));
    if (manifest && !manifest.file) throw new Error('The bundle manifest must be a regular file.');
    const library = inspect(resolveMutationPath(root, 'library/packs'));
    inputs.push(manifest, library);
    if (name !== undefined) {
      let sourceRoot = library?.directory ? root : null;
      if (!sourceRoot) {
        const configured = readManifestSource(root)?.source_repo;
        if (configured) {
          const candidate = path.resolve(root, configured);
          try {
            // Compose uses local directory sources in place, relative to its
            // workspace cwd. A URL/non-directory remains the remote reader's job.
            if (fs.statSync(candidate).isDirectory()) sourceRoot = fs.realpathSync(candidate);
          } catch (error) {
            if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
          }
        }
      }
      if (sourceRoot) {
        inputs.push(inspect(resolveMutationPath(sourceRoot, `library/packs/${name}/pack.md`)));
      }
    }
  } else if (name !== undefined && selection.source.type === 'local') {
    // A helper has just read this folder, so it answers; an unreachable one is a refusal.
    inputs.push(inspect(resolveMutationPath(selection.source.location, `library/packs/${name}/pack.md`)));
  }
  inputs.push(['sources', sourcesInput(root)]);
  return identity(JSON.stringify(inputs));
}

/** Synchronous final admission check after the provider's queue read.
 * @param {string} root @param {boolean} [catalog] @param {string} [name] @param {CatalogSource | null} [selection]
 */
export function packReadRevision(root, catalog = true, name, selection = null) {
  const status = cmdStatus({ root });
  if (!status.ok) throw new Error(status.error);
  return identity(JSON.stringify([profilePreimage(root), catalog ? catalogInputsRevision(root, name, selection) : null]));
}

/** @param {string} reason */
function catalogFailure(reason) {
  return { ok: false, reason,
    error: /** @type {Record<string, string>} */ (CATALOG_FAILURES)[reason]
      ?? 'The catalog reader is unavailable. Reload to try a fresh read.' };
}

/**
 * The only code that knows the Copilot CLI extension launch contract. The CLI
 * starts an extension as `<execPath> <bootstrap>`, with EXTENSION_PATH naming
 * the extension and COPILOT_EXTENSION_PARENT_PID naming the CLI. `<bootstrap>`
 * is the path of `<runtime>/preloads/extension_bootstrap.mjs`, or that file
 * name alone. The CLI's single executable runs a script only through that
 * bootstrap: for an argument with the bootstrap's file name, it runs the
 * bootstrap its runtime ships, whatever the argument's folder or the working
 * directory. So relaunch the reader the same way, as this process's child,
 * with the argument as the CLI spelled it. Override both variables: otherwise
 * the bootstrap imports the extension again, or exits because its parent is
 * not the CLI. Use a path only if it exists, because under plain Node execPath
 * runs that file. A bare name is never checked: Node lists the script it runs
 * by its full path, so a bare name comes only from the CLI, which resolves it
 * itself. Otherwise, under plain Node, execPath runs the reader directly.
 * @param {string} root
 * @returns {{ args: string[], env: Record<string, string> }}
 */
function readerLaunch(root) {
  const bootstrap = process.argv.find(arg => path.basename(arg) === 'extension_bootstrap.mjs');
  return bootstrap && (bootstrap === path.basename(bootstrap) || fs.existsSync(bootstrap))
    ? { args: [bootstrap, READER, root],
      env: { EXTENSION_PATH: READER, COPILOT_EXTENSION_PARENT_PID: String(process.pid) } }
    : { args: [READER, root], env: {} };
}

/** An empty `credential.helper` in `GIT_CONFIG_PARAMETERS`' oldest format, which every Git reads. */
const CREDENTIAL_HELPER_RESET = "'credential.helper='";
/** In a reader's temporary root: the empty folder that is its Git's home (named to the reader by `CATALOG_GIT_HOME_ENV`), and the file that carries the user's own Git configuration. */
const READER_HOME = 'home';
const READER_GLOBAL_CONFIG = 'global.gitconfig';

/**
 * Where Git finds the user's own global configuration from their environment:
 * the XDG file, then `~/.gitconfig`, which is the order Git reads them in. Only
 * names are derived. No file is looked at, because a home on an unreachable
 * share could stall this thread. Without HOME, Git for Windows takes its home
 * from HOMEDRIVE and HOMEPATH, else USERPROFILE.
 * @param {Record<string, string | undefined>} environment
 * @returns {{ xdg: string | undefined, files: string[] }}
 */
function userGitConfiguration(environment) {
  const home = environment.HOME || (process.platform !== 'win32' ? undefined
    : environment.HOMEDRIVE && environment.HOMEPATH ? environment.HOMEDRIVE + environment.HOMEPATH : environment.USERPROFILE);
  const xdg = environment.XDG_CONFIG_HOME || (home ? path.join(home, '.config') : undefined);
  /** @type {string[]} */
  const files = [];
  if (xdg) files.push(path.join(xdg, 'git', 'config'));
  if (home) files.push(path.join(home, '.gitconfig'));
  return { xdg, files };
}

/**
 * Git settings for a reader, and only a reader. Git never prompts, no askpass
 * program runs, no credential helper answers, and libcurl finds no `.netrc`, so
 * a private repository fails visibly instead of being reached through whatever
 * the user's machine has signed in. They are environment variables of the child
 * (and of the child's own process, for its home) and files in its own temporary
 * root, so no Git configuration is changed.
 *
 * An empty `credential.helper` clears every helper configured before it, of any
 * URL scope, so what matters is that ours comes last. Git applies configuration
 * files first, then `GIT_CONFIG_COUNT` entries, then `GIT_CONFIG_PARAMETERS`,
 * which is what `git -c` and some hosts export. So the reset is appended to both
 * carriers, after the entries the user already exports, which are kept because
 * they also carry proxy and certificate settings. The `GIT_CONFIG_PARAMETERS`
 * form reads beside entries of either of its two formats, and is the only one a
 * Git older than 2.31, which ignores `GIT_CONFIG_COUNT`, understands.
 *
 * The other ways in need nothing more: an empty `GIT_ASKPASS` and `SSH_ASKPASS`
 * mean no askpass program, also against `core.askPass` from a file or either
 * carrier; `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and `GIT_CONFIG_NOSYSTEM`
 * choose files that are read before both carriers, so the reset overrides any
 * helper in them, and they stay for the proxy, certificate and URL settings they
 * hold; `GIT_CONFIG_KEY_n` at or past the count is ignored by Git.
 *
 * libcurl reads `~/.netrc` itself, and on Windows `~/_netrc`, and sends the
 * login of a matching machine, or of `default`, to any host. No variable turns
 * that off; only another home does. That home cannot be set in the environment
 * the reader is launched with, though: the CLI's single executable and its
 * extension bootstrap start from that environment, and on Linux and macOS they
 * find their unpacked package under the home they start with, so every reader
 * would unpack the CLI again, and spend its read deadline doing so, before it
 * read anything. So the launch leaves HOME, USERPROFILE, HOMEDRIVE and HOMEPATH
 * exactly as this process has them (unset stays unset), and only names an empty
 * folder in the reader's root in `CATALOG_GIT_HOME_ENV`, which no loader reads.
 * The reader points those variables at that folder (HOMEDRIVE and HOMEPATH on
 * Windows only) in its own process environment, in the main block of
 * catalog-reader.mjs: after any bootstrap has loaded, never on import, and
 * before Compose can start Git. Compose starts Git without an environment of
 * its own, so its Git inherits that home, which holds no `.netrc`, `_netrc` or
 * `.gitconfig`. A reader that is not given a valid folder reads nothing. That
 * home would also hide the user's Git configuration, so it is carried by
 * `GIT_CONFIG_GLOBAL`, which stays in the launch environment: the user's own
 * value, else a file that includes their XDG file and then `~/.gitconfig`.
 * Naming `~/.gitconfig` alone would lose an XDG file, because Git reads no XDG
 * file once `GIT_CONFIG_GLOBAL` is set. `XDG_CONFIG_HOME` keeps the rest of that
 * folder (attributes and ignore) where it was.
 *
 * What remains, by design: a credential the user wrote into the Git configuration
 * that is carried, such as `http.extraHeader`, is still sent. A Git older than
 * 2.32 ignores `GIT_CONFIG_GLOBAL`, so there `~/.gitconfig` is not read, and a
 * source that needs its proxy, certificate or URL settings fails visibly; the XDG
 * file is still read. A `~/` path inside the carried configuration names the
 * empty home.
 * @param {Record<string, string | undefined>} environment
 * @param {string} temporary the reader's own temporary root
 * @returns {Promise<Record<string, string>>}
 */
async function readerGitEnvironment(environment, temporary) {
  const declared = Number(environment.GIT_CONFIG_COUNT);
  const count = Number.isSafeInteger(declared) && declared >= 0 && declared < 1_000 ? declared : 0;
  const inherited = (environment.GIT_CONFIG_PARAMETERS ?? '').trim();
  const home = path.join(temporary, READER_HOME);
  await fs.promises.mkdir(home);
  const user = userGitConfiguration(environment);
  /** @type {Record<string, string>} */
  const configuration = {};
  if (environment.GIT_CONFIG_GLOBAL === undefined && user.files.length) {
    configuration.GIT_CONFIG_GLOBAL = path.join(temporary, READER_GLOBAL_CONFIG);
    await fs.promises.writeFile(configuration.GIT_CONFIG_GLOBAL,
      `[include]\n${user.files.map(file => `\tpath = ${JSON.stringify(file)}\n`).join('')}`, { flag: 'wx' });
  }
  if (user.xdg) configuration.XDG_CONFIG_HOME = user.xdg;
  return {
    GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', GCM_INTERACTIVE: 'never',
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: 'credential.helper',
    [`GIT_CONFIG_VALUE_${count}`]: '',
    GIT_CONFIG_PARAMETERS: inherited ? `${inherited} ${CREDENTIAL_HELPER_RESET}` : CREDENTIAL_HELPER_RESET,
    [CATALOG_GIT_HOME_ENV]: home,
    ...configuration,
  };
}

/**
 * Stop the reader's whole process tree, including the real Git behind a PATH
 * wrapper. `done(true)` confirms the stop only for a tree kill that reported
 * no failure. A stop that is never confirmed ends at the caller's stop window,
 * which reports it as unconfirmed.
 * @param {import('node:child_process').ChildProcess} child
 * @param {(stopped: boolean) => void} done
 */
function stopTree(child, done) {
  if (process.platform === 'win32') {
    childProcess.execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'],
      { timeout: STOP_CONFIRM_MS, windowsHide: true }, error => {
        // An error means some process of the tree was not stopped, even if it
        // was only already exiting. Windows descendants can outlive the reader,
        // so the reader's own exit never confirms the stop.
        if (error) child.kill('SIGKILL');
        done(!error);
      });
    return;
  }
  try {
    // The reader leads its own process group, so this reaches its descendants.
    process.kill(-Number(child.pid), 'SIGKILL');
    done(true);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ESRCH') done(true);
    else {
      child.kill('SIGKILL');
      done(false);
    }
  }
}

let activeReaders = 0;
/** @type {Array<{ grant: () => void }>} */
const waitingReaders = [];

function admitWaitingReaders() {
  while (activeReaders < MAX_READERS && waitingReaders.length) /** @type {{ grant: () => void }} */ (waitingReaders.shift()).grant();
}

/**
 * The end of a new operation's acquisition window, on the monotonic clock. Every
 * reader the operation starts, and every wait for a slot, ends by then.
 */
function acquisitionWindow() {
  return performance.now() + ACQUISITION_WINDOW_MS;
}

/**
 * The budget a reader of `source` runs under. A folder is local, a public GitHub
 * repository (the shared module's `github:` identity) is a GitHub catalog, and
 * any other repository address, including an upstream on another host, is a
 * whole clone. An upstream spelled as a path rather than an address names the
 * folder Compose reads in place, so it is local too. The reader finds out, behind
 * this budget, whether that path is a folder, because this thread never touches a
 * path that may lie on an unreachable share; a path that is not a folder, which
 * Compose would hand to Git, also gets the local budget. Only the source's
 * description decides it.
 * @param {DescribedSource} source
 * @returns {ReaderPurpose}
 */
function purposeOf(source) {
  if (source.type === 'local' || !namesRemote(source.repository)) return 'local';
  return source.identity.startsWith('github:') ? 'github' : 'git';
}

/**
 * Whether Git, and so Compose, reads `location` as a remote address rather than
 * a path: a `<scheme>://` URL, or an SSH address whose colon comes before any
 * slash and after more than one letter, since one letter is a Windows drive.
 * Compose's own test lives in its network module, which this process never loads.
 * @param {string} location
 */
function namesRemote(location) {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(location)) return true;
  const colon = location.indexOf(':');
  const slash = location.search(/[\\/]/);
  return colon > 0 && (slash < 0 || colon < slash) && !/^[A-Za-z]:/.test(location);
}

/**
 * What the default read reads: the workspace library, else the recorded
 * upstream. Without either it reads nothing remote.
 * @param {DescribedSource[]} builtins
 * @returns {ReaderPurpose}
 */
function defaultPurpose(builtins) {
  const source = builtins.find(builtin => builtin.builtin === 'local-library')
    ?? builtins.find(builtin => builtin.builtin === 'bundle-upstream');
  return source ? purposeOf(source) : 'local';
}

/**
 * One of at most four reader slots, in first-come order. A reader holds its slot
 * until its tree has stopped and its root is removed or kept, so the cap counts
 * live processes and their cleanup. At most sixteen reads wait: a further one is
 * refused at once as busy. A wait, or a start, that the operation's window has
 * run out on is a timeout. A read refused for either reason, or cancelled while
 * it waits, never starts a reader.
 * @param {AbortSignal} signal
 * @param {number} until the operation's window end
 * @returns {Promise<{ release: () => void } | { refused: 'catalog_busy' | 'catalog_timeout' }>}
 */
function acquireReaderSlot(signal, until) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const remaining = until - performance.now();
    if (remaining <= 0) { resolve({ refused: 'catalog_timeout' }); return; }
    const grant = () => {
      activeReaders += 1;
      let released = false;
      resolve({ release: () => {
        if (released) return;
        released = true;
        activeReaders -= 1;
        admitWaitingReaders();
      } });
    };
    if (activeReaders < MAX_READERS && !waitingReaders.length) { grant(); return; }
    if (waitingReaders.length >= MAX_WAITING_READERS) { resolve({ refused: 'catalog_busy' }); return; }
    const leave = () => {
      clearTimeout(expiry);
      signal.removeEventListener('abort', onAbort);
      const index = waitingReaders.indexOf(waiter);
      if (index >= 0) waitingReaders.splice(index, 1);
    };
    const waiter = { grant: () => { leave(); grant(); } };
    const onAbort = () => { leave(); reject(signal.reason); };
    const expiry = setTimeout(() => { leave(); resolve({ refused: 'catalog_timeout' }); }, remaining);
    signal.addEventListener('abort', onAbort, { once: true });
    waitingReaders.push(waiter);
  });
}

/**
 * Compose's remote resolver runs synchronous Git, which no thread can
 * interrupt. So every read runs the reader in its own short-lived process tree
 * with its own temporary root, and nothing outlives the read. Its deadline, its
 * root's observed bound or a cancellation stops the whole tree within a bounded
 * window. The root is removed only when nothing can still write into it. No
 * shell, arbitrary command, source override or installed-file write is admitted
 * here: the reader is told only a closed request, never a path, repository or ref.
 *
 * A stop that cannot be confirmed may leave a live process behind, and so may a
 * Git that Compose itself stopped but could not confirm stopped, so then its root
 * stays where it is and its slot stays taken for the life of this process. The
 * capacity is never released into more such processes, and nothing reclaims it.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} until the operation's window end
 * @param {ReaderPurpose} purpose what the reader reads, from its validated source
 * @param {Record<string, unknown> | null} [request] a closed request, or null for the default read
 * @param {((temporary: string) => Promise<void>) | null} [prepare] writes the reader's only input file into its own root
 * @returns {Promise<any>}
 */
async function acquireCatalog(root, signal, until, purpose, request = null, prepare = null) {
  signal.throwIfAborted();
  const slot = await acquireReaderSlot(signal, until);
  if ('refused' in slot) return catalogFailure(slot.refused);
  let kept = false;
  try {
    const admitted = performance.now();
    // A slot granted as the window ends still starts no reader.
    if (until <= admitted) return catalogFailure('catalog_timeout');
    // The budget runs from this admission, so preparing and launching the reader
    // spend it too, and it never runs past the operation's window.
    const read = await runReader(root, signal, Math.min(admitted + READER_BUDGET_MS[purpose], until), request, prepare);
    kept = read.kept;
    return read.answer;
  } finally {
    if (!kept) slot.release();
  }
}

/**
 * One source's reader, whose own failure stays its own. A reader that could not be
 * started or cleaned up is that source's unavailable read; only a cancellation,
 * which ends the whole read, propagates.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} until
 * @param {ReaderPurpose} purpose
 * @param {Record<string, unknown> | null} [request]
 * @param {((temporary: string) => Promise<void>) | null} [prepare]
 * @returns {Promise<any>}
 */
async function acquireContained(root, signal, until, purpose, request = null, prepare = null) {
  try { return await acquireCatalog(root, signal, until, purpose, request, prepare); }
  catch {
    signal.throwIfAborted();
    return { ok: false, reason: 'catalog_unavailable', error: 'The catalog acquisition or its cleanup failed. Reload to try a fresh read.' };
  }
}

/**
 * Await every reader before the first failure is rethrown. A cancelled discovery
 * therefore settles only after each reader it started has stopped its tree and
 * settled its root, so a close or a later read never races a sibling's cleanup.
 * @template T
 * @param {Array<Promise<T> | T>} promises
 * @returns {Promise<T[]>}
 */
async function settleAll(promises) {
  const results = await Promise.allSettled(promises);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw /** @type {PromiseRejectedResult} */ (failed).reason;
  return results.map(result => /** @type {PromiseFulfilledResult<T>} */ (result).value);
}

/**
 * Whether a reader's own root has reached its observed bound. Every entry
 * counts, whatever its type, and a folder's entries are counted before any of
 * its files is sized. The walk enters only entries its listing reports as
 * folders and sizes files by `lstat`, so each link it sees counts as one entry
 * and is skipped. This is a best-effort observation, not a race-proof boundary.
 * The walk stops as soon as either bound is reached.
 * @param {string} directory
 */
async function rootReachedLimits(directory) {
  let entries = 0, bytes = 0;
  const pending = [directory];
  while (pending.length) {
    const folder = /** @type {string} */ (pending.pop());
    /** @type {import('node:fs').Dirent[]} */
    let listed;
    try { listed = await fs.promises.readdir(folder, { withFileTypes: true }); }
    catch { continue; }
    entries += listed.length;
    if (entries >= ROOT_LIMITS.entries) return true;
    for (const entry of listed) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        try { bytes += (await fs.promises.lstat(absolute)).size; }
        catch { continue; }
        if (bytes >= ROOT_LIMITS.bytes) return true;
      }
    }
  }
  return false;
}

/**
 * Run one reader to its answer, or stop its tree at `deadlineAt`, at its root's
 * observed bound or on cancellation. `kept` is true when that stop could not be
 * confirmed, or when the reader answered that Compose kept its material because
 * a Git it stopped could not be confirmed stopped: that Git may run outside the
 * tree this process stops, so even a confirmed tree stop does not cover it. The
 * root is then left in place, and the caller keeps its slot.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} deadlineAt when the reader is stopped, on the monotonic clock
 * @param {Record<string, unknown> | null} request
 * @param {((temporary: string) => Promise<void>) | null} prepare
 * @returns {Promise<{ answer: any, kept: boolean }>}
 */
async function runReader(root, signal, deadlineAt, request, prepare) {
  signal.throwIfAborted();
  const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dude-canvas-packs-'));
  // Compose's temporary checkout belongs to this acquisition only.
  // A process that was just stopped can hold a file in its checkout for a moment longer, so a locked
  // entry is retried briefly before the removal is reported as failed.
  const remove = () => fs.promises.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  /** @param {string} reason */
  const unstarted = async reason => {
    await remove();
    return { answer: catalogFailure(reason), kept: false };
  };
  if (signal.aborted) return unstarted('catalog_cancelled');
  if (prepare) {
    try { await prepare(temporary); }
    catch { return unstarted('catalog_unavailable'); }
  }
  const launch = readerLaunch(root);
  /** @type {Record<string, string>} */
  let git;
  try { git = await readerGitEnvironment(process.env, temporary); }
  catch { return unstarted('catalog_unavailable'); }
  /** @type {import('node:child_process').ChildProcess} */
  let child;
  try {
    child = childProcess.spawn(process.execPath, launch.args, {
      // Compose resolves a relative configured source against its cwd.
      cwd: root, windowsHide: true,
      // On POSIX this is an owned process group, not a background service:
      // it remains referenced and is killed and reaped on deadline or close.
      detached: process.platform !== 'win32',
      // stdout carries the extension's JSON-RPC; the reader reports over IPC.
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      // The home variables stay as this process has them, for the CLI's own loader
      // and bootstrap; the reader moves its Git's home itself (see readerGitEnvironment).
      env: { ...process.env, ...launch.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        ...git,
        ...(request ? { [CATALOG_REQUEST_ENV]: JSON.stringify(request) } : {}) },
    });
  } catch { return unstarted('catalog_unavailable'); }
  /** @type {{ reason: string | null, result?: any }} */
  const outcome = await new Promise(resolve => {
    /** @type {any} */
    let message = null;
    /** @type {string | null} */
    let trigger = null;
    /** @type {boolean | null} */
    let stopped = null;
    let failed = false, closed = false, settled = false;
    let held = false;
    /** @type {NodeJS.Timeout | undefined} */
    let stopWindow;
    // The one observation of the root in flight, if any.
    let observing = false;
    /** @param {{ reason: string | null, result?: any }} value */
    const settle = value => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(stopWindow);
      clearInterval(observer);
      signal.removeEventListener('abort', cancel);
      resolve(value);
    };
    // The reader's answer that Compose kept its material (see catalog-reader.mjs).
    const keptByCompose = () => message?.kept === true;
    // After a trigger, the stop is confirmed only by both the close and the kill result.
    const confirm = () => {
      if (closed && stopped !== null) settle({ reason: stopped && !held && !keptByCompose() ? trigger : 'catalog_cleanup_failed' });
    };
    /** @param {string} reason */
    const stop = reason => {
      if (trigger || closed || settled) return;
      trigger = reason;
      clearInterval(observer);
      // Finish the gate write before a kill can release the reader's current
      // Git call into Compose's fallback. If it fails, still stop, but retain
      // this root: even a successful kill cannot confirm the ungated stop.
      try { fs.writeFileSync(path.join(temporary, CATALOG_STOP_MARKER), ''); }
      catch { held = true; }
      stopWindow = setTimeout(() => {
        // The last resort for a reader that outlived its tree stop.
        child.kill('SIGKILL');
        settle({ reason: 'catalog_cleanup_failed' });
      }, STOP_CONFIRM_MS);
      stopTree(child, result => { stopped = result; confirm(); });
    };
    const cancel = () => stop('catalog_cancelled');
    const deadline = setTimeout(() => stop('catalog_timeout'), Math.max(0, deadlineAt - performance.now()));
    // A whole clone is repository-sized. Observe the root it lands in, one walk at
    // a time, off this thread's synchronous path, and stop the tree past the bound.
    const observer = setInterval(() => {
      if (observing || trigger || closed || settled) return;
      observing = true;
      rootReachedLimits(temporary).then(reached => { if (reached) stop('catalog_too_large'); }, () => {})
        .finally(() => { observing = false; });
    }, ROOT_LIMITS.intervalMs);
    signal.addEventListener('abort', cancel, { once: true });
    child.once('message', value => { message = value; });
    child.on('error', () => {
      failed = true;
      // The reader never started, so no tree exists to stop.
      if (child.pid === undefined) settle({ reason: 'catalog_unavailable' });
    });
    child.once('close', code => {
      closed = true;
      if (trigger) return confirm();
      if (keptByCompose()) return settle({ reason: 'catalog_cleanup_failed' });
      settle(!failed && code === 0 && message && typeof message.ok === 'boolean'
        ? { reason: null, result: message } : { reason: 'catalog_unavailable' });
    });
    if (signal.aborted) cancel();
  });
  // An unconfirmed stop, or Compose's kept material, may leave a live process
  // writing into the root, so leave the root rather than race it.
  if (outcome.reason === 'catalog_cleanup_failed') return { answer: catalogFailure(outcome.reason), kept: true };
  await remove();
  return { answer: outcome.reason ? catalogFailure(outcome.reason) : outcome.result, kept: false };
}

/** @param {string} state @param {string|null} [reason] @param {string|null} [message] */
function coverage(state, reason = null, message = null) {
  return { state, reason, message };
}

/* ------------------------------------------------------- saved and built-in sources */

/**
 * The two derived built-ins: the workspace library and the recorded upstream.
 * They sit under the workspace root, so describing them never resolves a saved
 * local folder.
 * @param {string} root
 */
function readBuiltins(root) {
  /** @type {ReturnType<typeof readManifestSource>} */
  let upstream = null;
  try { upstream = readManifestSource(root); } catch { /* an unreadable manifest names no upstream */ }
  return describeBuiltinSources({ root, upstream });
}

/**
 * The saved document and the two derived built-ins. Both are cheap and never
 * resolve a saved local folder: the built-ins sit under the workspace root, and
 * parsing is only text.
 * @param {string} root
 */
function readConfiguration(root) {
  return { saved: readPackSources(root), builtins: readBuiltins(root) };
}

/** @typedef {ReturnType<typeof readConfiguration>} Configuration */

/** @param {string} repository */
function repositoryName(repository) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(repository);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** @param {any} outcome the reader's answer for one catalog @returns {SourceRead} */
function normalizeRead(outcome) {
  if (outcome?.ok) return { status: 'read', reason: null, message: null, result: outcome.result };
  return { status: 'unavailable', reason: outcome?.reason || 'catalog_unavailable',
    message: outcome?.error || 'The catalog reader is unavailable. Reload to try a fresh read.', result: null };
}

/** Folders compare by real path, and case-insensitively on Windows, as the shared module does. @param {string} folder */
function folderIdentity(folder) {
  const resolved = path.resolve(folder);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * The key the shared module gives a saved local folder that cannot be resolved:
 * a hash of its spelling, resolved against the workspace, instead of its real
 * path. It is derived here because only a helper may resolve a folder, so a
 * folder that never answers must still be named. A folder that does resolve keeps
 * its real path's key, which is the same whenever the spelling is already that
 * real path. Pinned to `describePackSources` by a test.
 * @param {string} root @param {string} location
 */
export function unresolvedSourceKey(root, location) {
  return `src_${createHash('sha256').update(`local:${folderIdentity(path.resolve(root, location))}`).digest('hex').slice(0, 32)}`;
}

/**
 * A saved local folder described by its spelling alone, as the shared module
 * describes one it cannot resolve.
 * @param {string} root @param {{ type: 'local', location: string }} entry
 * @returns {DescribedSource}
 */
function unresolvedSource(root, entry) {
  return { ...entry, identity: `local:${folderIdentity(path.resolve(root, entry.location))}`,
    key: unresolvedSourceKey(root, entry.location), root: null };
}

/**
 * Describe one saved local folder in a helper that touches only that folder, and
 * with `list` read its catalog there too. A folder the helper could not answer
 * for, whether by deadline, stopped tree or failed launch, is described by its
 * spelling and carries the reason as its `problem`, so it keeps a key and its
 * row. A folder that answered without being readable is not a problem: it has a
 * real key and an unavailable catalog.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} until the operation's window end
 * @param {string} revision the saved document's revision the helper must find
 * @param {{ type: 'local', location: string }} entry
 * @param {number} index
 * @param {boolean} list
 * @returns {Promise<SavedSource>}
 */
async function describeFolder(root, signal, until, revision, entry, index, list) {
  const outcome = await acquireContained(root, signal, until, 'local', {
    op: 'source', index, key: null, revision, document: 'configured', list });
  /** @type {SavedSource} */
  const item = { index, entry, described: true, source: null, problem: null, read: null };
  if (outcome.source) {
    item.source = { ...entry, key: outcome.source.key, root: outcome.source.root, identity: `local:${outcome.source.key}` };
  } else {
    item.source = unresolvedSource(root, entry);
    item.problem = { reason: outcome.reason || 'catalog_unavailable',
      message: outcome.error || 'The saved folder could not be described.' };
  }
  if (list) item.read = normalizeRead(outcome);
  return item;
}

/**
 * Describe each saved source (its identity and key) and, with `list`, read its
 * catalog once. A remote entry is described from its text alone. A local one is
 * described, and read, by a helper that touches only that folder, so one that
 * does not answer costs only its own slot and deadline. Entries whose type is not
 * in `types` are left alone, and a read that needs only some types therefore
 * never waits for the others.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} until the operation's window end
 * @param {Configuration} configuration
 * @param {{ list: boolean, types?: Array<'remote' | 'local'> }} options
 * @returns {Promise<{ ok: true, items: SavedSource[] } | { ok: false, error: string }>}
 */
async function readSavedSources(root, signal, until, configuration, { list, types = ['remote', 'local'] }) {
  const { saved, builtins } = configuration;
  if (!saved.ok) return { ok: false, error: saved.error };
  /** @type {string | null} */
  let invalid = null;
  const items = await settleAll(saved.sources.map(async (entry, index) => {
    if (!types.includes(entry.type)) return /** @type {SavedSource} */ ({ index, entry, described: false, source: null, problem: null, read: null });
    if (entry.type === 'local') return describeFolder(root, signal, until, saved.revision, entry, index, list);
    /** @type {SavedSource} */
    const item = { index, entry, described: true, source: null, problem: null, read: null };
    const described = describePackSources({ root, sources: [entry], builtins });
    if (!described.ok) { invalid ??= described.error; return item; }
    item.source = described.sources[0];
    if (list) {
      item.read = normalizeRead(await acquireContained(root, signal, until, purposeOf(item.source), {
        op: 'source', index, key: item.source.key, revision: saved.revision, document: 'configured', list: true }));
    }
    return item;
  }));
  if (invalid) return { ok: false, error: invalid };
  // Rows are selected by key, so two sources, or a source and a built-in, may not share one.
  const taken = new Set(builtins.map(builtin => builtin.key));
  for (const item of items) {
    if (!item.source) continue;
    if (taken.has(item.source.key)) {
      return { ok: false, error: `${path.posix.basename(PACK_SOURCES_PATH)} sources[${item.index}] repeats another source` };
    }
    taken.add(item.source.key);
  }
  return { ok: true, items };
}

/**
 * The saved entry that a request names by key. A repository's key follows from
 * its text. A folder's key follows from its real path, so every saved folder is
 * described by its own helper at once, and the first answer that carries the key
 * ends the search and stops the others: a folder that never answers delays only
 * a request that cannot be told apart from it. Only when no folder that did
 * answer has the key is a folder that did not answer considered, and it is
 * named by its spelling's key.
 *
 * A search that ends early does not check the folders it stopped against each
 * other. Two entries that name one folder would have the same key, and either is
 * then the one removed or read.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} until the operation's window end
 * @param {Configuration} configuration
 * @param {string} key
 * @returns {Promise<{ ok: true, item: SavedSource }
 *   | { ok: false, why: 'unreadable', error: string } | { ok: false, why: 'unanswered', reason: string }
 *   | { ok: false, why: 'changed' | 'unknown' }>}
 */
async function findSavedSource(root, signal, until, configuration, key) {
  const { saved } = configuration;
  if (!saved.ok) return { ok: false, why: 'unreadable', error: saved.error };
  const remote = await readSavedSources(root, signal, until, configuration, { list: false, types: ['remote'] });
  if (!remote.ok) return { ok: false, why: 'unreadable', error: remote.error };
  const repository = remote.items.find(item => item.source?.key === key);
  if (repository) return { ok: true, item: repository };
  const folders = saved.sources.flatMap((entry, index) => entry.type === 'local' ? [{ entry, index }] : []);
  if (!folders.length) return { ok: false, why: 'unknown' };
  const found = new AbortController();
  const searching = AbortSignal.any([signal, found.signal]);
  /** @type {SavedSource | null} */
  let match = null;
  /** @type {SavedSource[]} */
  const unanswered = [];
  await settleAll(folders.map(async ({ entry, index }) => {
    /** @type {SavedSource} */
    let item;
    try { item = await describeFolder(root, searching, until, saved.revision, entry, index, false); }
    catch (error) {
      // Only the search's own end is expected; a cancelled read is the caller's.
      if (found.signal.aborted && !signal.aborted) return;
      throw error;
    }
    if (match) return;
    if (item.problem) unanswered.push(item);
    else if (item.source?.key === key) { match = item; found.abort(); }
  }));
  signal.throwIfAborted();
  if (match) return { ok: true, item: match };
  // A reader that found the document changed or unreadable has news about the document, not about its folder.
  if (unanswered.some(item => item.problem?.reason === 'sources_changed')) return { ok: false, why: 'changed' };
  const unreadable = unanswered.find(item => item.problem?.reason === 'sources_unavailable');
  if (unreadable) return { ok: false, why: 'unreadable', error: unreadable.problem?.message ?? 'The saved sources could not be read.' };
  const named = unanswered.find(item => item.source?.key === key);
  if (named) return { ok: true, item: named };
  return unanswered.length
    ? { ok: false, why: 'unanswered', reason: unanswered[0].problem?.reason ?? 'catalog_unavailable' }
    : { ok: false, why: 'unknown' };
}

/** @param {string} left @param {string} right */
function sameFolder(left, right) {
  return folderIdentity(left) === folderIdentity(right);
}

/**
 * Does an installed record come from this source? Compose's own matcher decides,
 * except that a saved folder that no longer resolves is still the source that a
 * recorded location names: it must not turn into "no match" and fall back to
 * another catalog.
 * @param {string} root @param {DescribedSource} source @param {any} recorded
 */
function usesSource(root, source, recorded) {
  if (matchesRecordedSource(source, recorded)) return true;
  return source.type === 'local' && !source.root && recorded?.type === 'local'
    && typeof recorded.location === 'string' && path.isAbsolute(recorded.location)
    && sameFolder(recorded.location, path.resolve(root, source.location));
}

/** The closed public value a request binds for a saved source. @param {SavedSource} item @param {string} revision @returns {CatalogSource} */
function bindingFor(item, revision) {
  const source = /** @type {DescribedSource} */ (item.source);
  return { key: source.key, sourcesRevision: revision,
    source: source.type === 'remote'
      ? { type: 'remote', repository: source.repository, ref: source.ref }
      : { type: 'local', location: /** @type {string} */ (source.root) } };
}

/**
 * The source a provider request reads. An install names a saved source by its
 * key. A refresh takes the saved source that matches its installed record, else
 * the default; it never takes a choice from the browser. A source that is gone,
 * unreadable or unresolved is a refusal, never a quiet use of another catalog.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {number} until the operation's window end
 * @param {Configuration} configuration
 * @param {{ source: string } | { refresh: true }} select
 * @param {any} recorded the installed record's source, for a refresh
 * @returns {Promise<{ ok: true, selection: CatalogSource | null, item: SavedSource | null }
 *   | { ok: false, state: 'stale' | 'unavailable', reason: string, message: string }>}
 */
async function chooseSource(root, signal, until, configuration, select, recorded) {
  const { saved, builtins } = configuration;
  /** @param {'stale' | 'unavailable'} state @param {string} reason @param {string} message */
  const refuse = (state, reason, message) => ({ ok: /** @type {const} */ (false), state, reason, message });
  if (!saved.ok) return refuse('unavailable', 'sources_unavailable', saved.error);
  if ('source' in select) {
    if (builtins.some(builtin => builtin.key === select.source)) {
      return refuse('unavailable', 'source_not_added', 'Built-in sources are the default catalog and take no source selection.');
    }
    const search = await findSavedSource(root, signal, until, configuration, select.source);
    if (!search.ok) {
      if (search.why === 'unreadable') return refuse('unavailable', 'sources_unavailable', search.error);
      // A folder that did not answer might be the one this key names, so the key is not simply gone.
      return search.why === 'unanswered'
        ? refuse('unavailable', 'source_unavailable', 'A saved folder did not answer, so the selected source cannot be established.')
        : refuse('stale', 'source_changed', 'The selected source is no longer in the saved sources.');
    }
    const found = search.item;
    if (found.source?.type === 'local' && !found.source.root) {
      return refuse('unavailable', 'source_unavailable', 'The saved folder is not available.');
    }
    return { ok: true, selection: bindingFor(found, saved.revision), item: found };
  }
  if (!recorded) return { ok: true, selection: null, item: null };
  const read = await readSavedSources(root, signal, until, configuration, { list: false, types: [recorded.type] });
  if (!read.ok) return refuse('unavailable', 'sources_unavailable', read.error);
  // An entry that could not be described might be the very source this was installed from.
  if (read.items.some(item => item.described && item.problem)) {
    return refuse('unavailable', 'source_unavailable', 'A saved source did not answer, so the source of this pack cannot be established.');
  }
  const match = read.items.find(item => item.source && usesSource(root, item.source, recorded));
  if (!match?.source) return { ok: true, selection: null, item: null };
  if (match.source.type === 'local' && !match.source.root) {
    return refuse('unavailable', 'source_unavailable', 'The saved folder is not available.');
  }
  return { ok: true, selection: bindingFor(match, saved.revision), item: match };
}

/* -------------------------------------------------------------- the joined projection */

/**
 * @param {string} root
 * @param {Array<[string, any]>} installedEntries recorded installed packs, in profile order
 * @param {DescribedSource[]} candidates built-ins, then saved sources that could be described
 * @param {boolean} undecided true when a source this record might match could not be established
 * @returns {Map<string, { provenance: 'source' | 'unlisted' | 'unknown', sourceKey: string | null }>}
 */
function matchInstalled(root, installedEntries, candidates, undecided) {
  return new Map(installedEntries.map(([name, record]) => {
    const match = candidates.find(source => usesSource(root, source, record.source));
    return [name, match ? { provenance: /** @type {const} */ ('source'), sourceKey: match.key }
      : { provenance: undecided ? /** @type {const} */ ('unknown') : /** @type {const} */ ('unlisted'), sourceKey: null }];
  }));
}

/**
 * Profile order first, then each read catalog's uninstalled packs in catalog
 * order. Installed membership is by name alone, so any installation of a name
 * leaves none of its Available rows, but same-named Available rows from different
 * sources stay separate, each with its own key. An installed row's description
 * comes from the source its record matches (unavailable when that source was not
 * read), and only an unmatched record uses the default catalog by name.
 * @param {{ installed: Record<string, any>, catalogs: Array<{ key: string | null, packs: any[] }>,
 *   defaultCatalog: any[] | null, matches: ReturnType<typeof matchInstalled> | null }} input
 */
function joinItems({ installed, catalogs, defaultCatalog, matches }) {
  const projected = matches !== null;
  const rows = Object.keys(installed).map(name => {
    const entry = installed[name];
    const match = matches?.get(name) ?? null;
    const pack = (match?.provenance === 'source'
      ? catalogs.find(catalog => catalog.key === match.sourceKey)?.packs
      : defaultCatalog)?.find(candidate => candidate.name === name);
    return { key: `pack:${name}`, name, installed: true, files: entry.files, source: entry.source,
      description: pack?.description ?? null, use_cases: pack?.use_cases ?? null,
      ...(projected ? { sourceKey: match?.sourceKey ?? null, provenance: match?.provenance ?? null } : {}) };
  });
  for (const catalog of catalogs) {
    for (const pack of catalog.packs) {
      if (Object.hasOwn(installed, pack.name)) continue;
      rows.push({ key: catalog.key ? `pack:${pack.name}@${catalog.key}` : `pack:${pack.name}`, name: pack.name,
        installed: false, files: null, source: null, description: pack.description ?? null, use_cases: pack.use_cases ?? null,
        ...(projected ? { sourceKey: catalog.key, provenance: null } : {}) });
    }
  }
  return rows;
}

/**
 * The catalog coverage of a discovery: every read source, with partial coverage
 * named as such rather than as a confirmed total.
 * @param {Array<{ read: SourceRead }>} reads
 * @param {string | null} configurationProblem why saved sources could not be read, if they could not
 */
function discoveryCoverage(reads, configurationProblem) {
  const read = reads.filter(entry => entry.read.status === 'read');
  const failed = reads.filter(entry => entry.read.status === 'unavailable');
  if (!failed.length && !configurationProblem) {
    return coverage(read.some(entry => entry.read.result?.packs.length) ? 'current' : 'empty');
  }
  if (!read.length) {
    const first = failed[0]?.read;
    return coverage('unavailable', first?.reason ?? 'sources_unavailable',
      first?.message ?? configurationProblem ?? 'No catalog could be read.');
  }
  const unread = failed.length + (configurationProblem ? 1 : 0);
  return coverage('partial', configurationProblem && !failed.length ? 'sources_unavailable' : 'sources_partial',
    `${read.length} of ${reads.length + (configurationProblem ? 1 : 0)} sources were read; counts are the packs known so far. `
    + `${unread} could not be read, which is not a confirmed empty list.`);
}

/**
 * The source rows: the two derived built-ins first, then the saved sources in
 * saved order. A source's own catalog outcome, counts and installed matches are
 * independent of every other source's.
 * @param {{ root: string, configuration: Configuration, items: SavedSource[] | null, invalid: string | null,
 *   reads: Map<string, SourceRead>, defaultKey: string | null,
 *   installedNames: Set<string> | null, matches: ReturnType<typeof matchInstalled> | null }} input
 */
function projectSources({ root, configuration, items, invalid, reads, defaultKey, installedNames, matches }) {
  const { saved, builtins } = configuration;
  /** @param {string | null} key */
  const installedFrom = key => matches && key ? [...matches].filter(([, match]) => match.sourceKey === key).map(([name]) => name) : null;
  /** @param {string | null} key @param {boolean} byDesign */
  const outcome = (key, byDesign) => {
    const read = key ? reads.get(key) : undefined;
    if (read) {
      const packs = read.result?.packs ?? null;
      return { status: read.status, reason: read.reason, message: read.message, count: packs ? packs.length : null,
        uninstalled: packs && installedNames ? packs.filter(pack => !installedNames.has(pack.name)).length : null };
    }
    return { status: /** @type {const} */ ('not_read'), count: null, uninstalled: null,
      reason: byDesign ? 'not_read_by_design' : null, message: byDesign ? 'Not read while library/packs exists.' : null };
  };
  /**
   * `known` is false for a folder that did not answer: what is installed from it
   * cannot be counted, and "none" would claim more than is known.
   * @param {DescribedSource} source @param {boolean} [known]
   */
  const row = (source, known = true) => {
    const names = known ? installedFrom(source.key) : null;
    return {
      key: source.key, type: source.type,
      repository: source.type === 'remote' ? source.repository : null, ref: source.type === 'remote' ? source.ref : null,
      location: source.type === 'local' ? source.location : null,
      default: source.key === defaultKey,
      installedNames: names, installedCount: names ? names.length : null,
    };
  };
  const builtinRows = builtins.map(source => ({
    ...row(source), scope: 'builtin', builtin: source.builtin ?? null,
    managedBy: source.builtin === 'bundle-upstream' ? 'bundle-upgrade' : null,
    name: source.builtin === 'local-library' ? 'Local library' : 'Bundle upstream',
    repositoryName: source.type === 'remote' ? repositoryName(source.repository) : null,
    ...outcome(source.key, source.builtin === 'bundle-upstream' && source.key !== defaultKey),
  }));
  const savedRows = (invalid ? [] : items ?? []).map(item => {
    // Every saved entry has a source here, even a folder that did not answer: that one
    // is described by its spelling, so its row keeps the key a request can name.
    const source = /** @type {DescribedSource} */ (item.source);
    const unanswered = item.problem;
    return { ...row(source, !unanswered), scope: 'project', builtin: null, managedBy: null,
      name: source.type === 'remote' ? repositoryName(source.repository) ?? source.repository
        : path.basename(path.resolve(root, source.location)) || source.location,
      repositoryName: source.type === 'remote' ? repositoryName(source.repository) : null,
      ...(unanswered
        ? { status: /** @type {const} */ ('unavailable'), reason: unanswered.reason, message: unanswered.message,
          count: null, uninstalled: null }
        : outcome(source.key, false)) };
  });
  const unmatched = matches ? [...matches.values()] : null;
  return {
    state: saved.ok && !invalid ? 'current' : 'unavailable',
    reason: saved.ok && !invalid ? null : 'sources_unavailable',
    message: saved.ok ? invalid : saved.error,
    sourcesRevision: saved.ok ? saved.revision : null,
    savedIn: PACK_SOURCES_PATH, limit: MAX_ADDED_SOURCES, defaultKey,
    items: [...builtinRows, ...savedRows],
    unmatched: { unlisted: unmatched ? unmatched.filter(match => match.provenance === 'unlisted').length : null,
      unknown: unmatched ? unmatched.filter(match => match.provenance === 'unknown').length : null },
  };
}

/**
 * installed and catalog preserve the complete cmdStatus/cmdList results.
 * items is their exact-name join: profile order first, then uninstalled catalog
 * order. Null metadata means unacquired, never an invented empty declaration.
 * Only current/empty installed coverage establishes membership. A recorded
 * source is provenance, not verification of installed bytes or operation consent.
 *
 * Which catalogs a read acquires is explicit:
 * - default: the default catalog (the local library, else the recorded upstream);
 * - `catalog: false`: none, an installed-only check;
 * - `select`: exactly one saved source for a provider request, bound by its key
 *   (`{ source }` for an install) or derived from the installed record (`{ refresh }`);
 * - `discover`: the default plus every saved source, each once.
 * `sources` adds the source rows and every item's source key and provenance;
 * discovery implies it. Without a catalog read those rows say "not read".
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {{ catalog?: boolean, name?: string, select?: { source: string } | { refresh: true } | null,
 *   discover?: boolean, sources?: boolean }} [options]
 *   `name` binds local metadata to the provider-selected pack.
 */
export async function readPacks(root, signal, { catalog: includeCatalog = true, name, select = null, discover = false, sources: includeSources = false } = {}) {
  root = path.resolve(root);
  signal.throwIfAborted();
  const until = acquisitionWindow();
  const projected = includeSources || discover;
  const snapshot = {
    workspaceId: identity(root), rootIdentity: null, profileRevision: null, readRevision: null, readAt: null,
    installed: null, catalog: null, items: null, selection: /** @type {CatalogSource | null} */ (null),
    coverage: {
      installed: coverage('unavailable', 'installed_unavailable', 'The installed profile could not be read.'),
      catalog: coverage('unavailable', 'installed_unavailable', 'Catalog membership requires a readable installed profile.'),
    },
    ...(projected ? { sources: /** @type {any} */ (null) } : {}),
  };
  /**
   * A read that stops early still shows the saved sources, without any catalog.
   * @param {typeof snapshot} value
   */
  const withSources = async value => {
    if (projected) {
      const configuration = readConfiguration(root);
      const described = configuration.saved.ok ? await readSavedSources(root, signal, until, configuration, { list: false }) : null;
      signal.throwIfAborted();
      value.sources = projectSources({ root, configuration, items: described?.ok ? described.items : null,
        invalid: described && !described.ok ? described.error : null, reads: new Map(), defaultKey: null,
        installedNames: null, matches: null });
    }
    return value;
  };
  let before;
  try {
    snapshot.rootIdentity = readRootIdentity(root);
    before = profilePreimage(root, snapshot.rootIdentity);
    snapshot.profileRevision = before.profileRevision;
  } catch (error) {
    snapshot.coverage.installed.message = error instanceof Error ? error.message : snapshot.coverage.installed.message;
    return withSources(snapshot);
  }
  const installed = cmdStatus({ root });
  if (!installed.ok) {
    snapshot.coverage.installed.message = installed.error;
    return withSources(snapshot);
  }
  // The saved sources are described before any catalog is read, so every row and
  // every installed match in this read uses the same keys. A discovery describes
  // them while it reads them.
  const configuration = projected || select ? readConfiguration(root) : null;
  /** @type {SavedSource[] | null} */
  let savedItems = null;
  /** @type {string | null} */
  let savedInvalid = null;
  if (projected && !discover && configuration?.saved.ok) {
    const described = await readSavedSources(root, signal, until, configuration, { list: false });
    savedItems = described.ok ? described.items : null;
    savedInvalid = described.ok ? null : described.error;
  }
  /** @type {any} */
  let catalog = null;
  /** @type {string | null} */
  let inputs = null;
  let failedAcquisition = false;
  try {
    if (!includeCatalog) {
      catalog = { ok: false, reason: projected ? 'catalog_not_read' : 'catalog_not_requested',
        error: projected ? 'The catalog is read only when you choose Reload.' : 'This installed-state check does not acquire a catalog.' };
    } else if (discover && configuration) {
      inputs = catalogInputsRevision(root);
      const [defaultOutcome, saved] = await settleAll([
        acquireContained(root, signal, until, defaultPurpose(configuration.builtins)),
        configuration.saved.ok ? readSavedSources(root, signal, until, configuration, { list: true }) : null,
      ]);
      catalog = defaultOutcome;
      savedItems = saved?.ok ? saved.items : null;
      savedInvalid = saved && !saved.ok ? saved.error : null;
    } else if (select && configuration) {
      const recorded = name !== undefined && Object.hasOwn(installed.result.installed, name)
        ? installed.result.installed[name].source : null;
      const chosen = await chooseSource(root, signal, until, configuration, select, recorded);
      if (!chosen.ok) catalog = { ok: false, reason: chosen.reason, error: chosen.message, state: chosen.state };
      else {
        snapshot.selection = chosen.selection;
        inputs = catalogInputsRevision(root, name, chosen.selection);
        catalog = chosen.item && chosen.selection
          ? await acquireCatalog(root, signal, until, purposeOf(/** @type {DescribedSource} */ (chosen.item.source)), {
            op: 'source', index: chosen.item.index, key: chosen.selection.key, revision: chosen.selection.sourcesRevision,
            document: 'configured', list: true })
          : await acquireCatalog(root, signal, until, defaultPurpose(configuration.builtins));
      }
    } else {
      inputs = catalogInputsRevision(root, name);
      catalog = await acquireCatalog(root, signal, until, defaultPurpose(readBuiltins(root)));
    }
  }
  catch {
    signal.throwIfAborted();
    failedAcquisition = true;
    catalog = { ok: false, reason: 'catalog_unavailable', error: 'The catalog acquisition or its cleanup failed. Reload to try a fresh read.' };
  }
  signal.throwIfAborted();
  // Recorded destinations may have become unsafe without changing profile bytes.
  // Keep this validation inside the preimage window too.
  const validated = cmdStatus({ root });
  let after;
  try { after = profilePreimage(root); }
  catch {
    snapshot.coverage.installed = coverage('unavailable', 'installed_unavailable', 'The installed profile became unreadable during the read.');
    snapshot.coverage.catalog = coverage('stale', 'profile_changed', 'The profile changed during the read. Reload before using pack membership.');
    snapshot.profileRevision = null;
    return withSources(snapshot);
  }
  const changed = before.rootIdentity !== after.rootIdentity ? 'workspace_changed'
    : before.profileRevision !== after.profileRevision || before.stamp !== after.stamp ? 'profile_changed' : null;
  if (changed) {
    snapshot.coverage.installed = snapshot.coverage.catalog = coverage('stale', changed,
      'The workspace or installed profile changed during the read. Reload to read one current snapshot.');
    snapshot.profileRevision = null;
    return withSources(snapshot);
  }
  // A catalog read is current only while its inputs, including the saved sources
  // file, are what they were when it began. Nothing it read is returned otherwise.
  let discardedReads = false;
  try {
    if (includeCatalog && inputs !== null && inputs !== catalogInputsRevision(root, name, snapshot.selection)) {
      catalog = { ok: false, reason: 'catalog_changed', error: 'Catalog inputs changed during the read. Reload before requesting a pack change.' };
      discardedReads = true;
    } else snapshot.readRevision = identity(JSON.stringify([after, inputs]));
  } catch {
    catalog = { ok: false, reason: 'catalog_unavailable', error: 'Catalog inputs became unreadable during the read.' };
    discardedReads = true;
  }
  if (validated.ok) {
    snapshot.installed = installed.result;
    snapshot.coverage.installed = coverage(installed.result.enabled_packs.length ? 'current' : 'empty');
  } else snapshot.coverage.installed = coverage('unavailable', 'installed_unavailable', validated.error);

  // The catalogs this read established, each with the source it was read from.
  /** @type {Array<{ key: string | null, packs: any[] }>} */
  const catalogs = [];
  /** @type {Map<string, SourceRead>} */
  const reads = new Map();
  const defaultSource = configuration
    ? configuration.builtins.find(source => source.builtin === 'local-library')
      ?? configuration.builtins.find(source => source.builtin === 'bundle-upstream') ?? null
    : null;
  if (discardedReads) {
    savedItems = savedItems?.map(item => ({ ...item, read: null })) ?? null;
  }
  // A read that could not finish still shows every saved source, described but unread.
  if (projected && configuration?.saved.ok && savedItems === null && savedInvalid === null) {
    const described = await readSavedSources(root, signal, until, configuration, { list: false });
    signal.throwIfAborted();
    savedItems = described.ok ? described.items : null;
    savedInvalid = described.ok ? null : described.error;
  }
  if (discover && configuration && !discardedReads && !failedAcquisition) {
    const defaultRead = normalizeRead(catalog);
    // Without a built-in source there is no default to read: the empty list it
    // returns is not a source, and it neither covers nor widens the catalog.
    /** @type {Array<{ key: string | null, read: SourceRead }>} */
    const all = defaultSource ? [{ key: defaultSource.key, read: defaultRead }] : [];
    for (const item of savedItems ?? []) if (item.read) all.push({ key: item.source?.key ?? null, read: item.read });
    for (const { key, read } of all) {
      if (key) reads.set(key, read);
      if (read.result) catalogs.push({ key, packs: read.result.packs });
    }
    snapshot.catalog = defaultRead.result;
    snapshot.coverage.catalog = discoveryCoverage(all, configuration.saved.ok ? savedInvalid : configuration.saved.error);
  } else if (catalog.ok) {
    snapshot.catalog = catalog.result;
    snapshot.coverage.catalog = coverage(catalog.result.packs.length ? 'current' : 'empty');
    const key = snapshot.selection ? snapshot.selection.key : defaultSource?.key ?? null;
    catalogs.push({ key: projected || snapshot.selection ? key : null, packs: catalog.result.packs });
    if (key) reads.set(key, normalizeRead(catalog));
  } else {
    snapshot.coverage.catalog = coverage(
      catalog.reason === 'catalog_not_read' ? 'not_read' : catalog.reason === 'catalog_changed' || catalog.state === 'stale' ? 'stale' : 'unavailable',
      catalog.reason || 'catalog_unavailable', catalog.error);
  }
  /** @type {ReturnType<typeof matchInstalled> | null} */
  let matches = null;
  if (snapshot.installed && projected && configuration) {
    // A folder that did not answer is not a candidate: it might be the source a record names, which is what `undecided` says.
    const candidates = [...configuration.builtins, ...(savedItems ?? []).flatMap(item => item.source && !item.problem ? [item.source] : [])];
    // A saved source that could not be established might be the one a record names.
    const undecided = !configuration.saved.ok || Boolean(savedInvalid)
      || Boolean(savedItems?.some(item => item.problem));
    matches = matchInstalled(root, Object.entries(snapshot.installed.installed), candidates, undecided);
  }
  if (snapshot.installed) {
    snapshot.items = joinItems({ installed: snapshot.installed.installed, catalogs,
      defaultCatalog: snapshot.catalog?.packs ?? null, matches });
  }
  if (projected && configuration) {
    snapshot.sources = projectSources({ root, configuration, items: savedItems, invalid: savedInvalid, reads,
      defaultKey: defaultSource?.key ?? null,
      installedNames: snapshot.installed ? new Set(Object.keys(snapshot.installed.installed)) : null, matches });
  }
  snapshot.readAt = new Date().toISOString();
  return snapshot;
}

/* ------------------------------------------------------------ add and remove a source */

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
function refusal(code, message, extra = {}) {
  return { ok: /** @type {const} */ (false), code, message, ...extra };
}

/** The shared checks name two states differently from this route's vocabulary. @param {string} code */
const sourceCode = code => code === 'stale' ? 'sources_changed' : code === 'unavailable' ? 'sources_unavailable' : code;

/** How a read's failure is reported when it stops an addition. Nothing here is saved. */
const ADD_READ_REFUSALS = Object.freeze({
  catalog_cleanup_failed: ['cleanup_unconfirmed', 'The catalog reader could not confirm process cleanup, so nothing was saved.'],
  catalog_unavailable: ['unavailable', 'The catalog reader is unavailable. Try again.'],
  catalog_busy: ['unavailable', 'Too many catalog reads were waiting, so the source was not read. Try again.'],
  catalog_missing: ['missing_catalog', 'The source has no library/packs catalog.'],
  catalog_unreachable: ['unreachable', 'The source could not be fetched. It may be private or missing, or its ref may not exist.'],
  source_unavailable: ['local_missing', 'The folder is not available.'],
  sources_changed: ['sources_changed', 'The saved sources changed. Reload packs and try again.'],
  sources_unavailable: ['sources_unavailable', 'The saved sources could not be read, so nothing was saved.'],
});
/** The shared checks of a local add also resolve every saved folder, so the new folder is not the only one that can stall them. */
const ADD_VALIDATE_TIMEOUT = Object.freeze(['timeout', 'A folder, the new one or a saved one, did not answer within 5 seconds. Nothing was saved.']);

/**
 * The refusal for a candidate read that ended in `reason`. A timeout names the
 * bound of what was read: a folder's or a repository's.
 * @param {string} reason @param {ReaderPurpose} purpose
 * @returns {string[]}
 */
function addReadRefusal(reason, purpose) {
  if (reason === 'catalog_timeout') return ['timeout', `The source did not answer within ${READER_BUDGET_MS[purpose] / 1_000} seconds.`];
  return /** @type {Record<string, string[]>} */ (ADD_READ_REFUSALS)[reason] ?? ADD_READ_REFUSALS.catalog_unavailable;
}

/**
 * Add one source: validate it, read its catalog once from a validated prospective
 * document, and only then save. Nothing is saved on any refusal. Every step
 * after the read rechecks what the read could have outlived.
 *
 * The shared checks may resolve a local folder, so they run in a helper unless
 * they are provably text-only: a repository URL. A repository can only repeat
 * another repository, so it is checked against the saved repositories alone and
 * never waits for, or even looks at, a saved folder; the limit still counts every
 * entry. The prospective document is serialized by the shared writer from the
 * validated entry, written into the reader's own temporary root, and parsed there
 * by the shared parser; the real sources file is never touched until the commit.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {{ location: string, ref?: string | null, sourcesRevision: string }} input already shape-checked strings
 * @param {{ beforeCommit?: () => void }} [hooks] throws to stop the commit, such as a ended Canvas lifetime
 */
export async function addPackSource(root, signal, { location, ref = null, sourcesRevision }, { beforeCommit } = {}) {
  root = path.resolve(root);
  signal.throwIfAborted();
  const until = acquisitionWindow();
  let rootIdentity;
  try { rootIdentity = readRootIdentity(root); }
  catch { return refusal('workspace_changed', 'The workspace is not available.'); }
  const configuration = readConfiguration(root);
  const { saved } = configuration;
  if (!saved.ok) return refusal('sources_unavailable', saved.error);
  if (saved.revision !== sourcesRevision) {
    return refusal('sources_changed', 'The saved sources changed. Reload packs and try again.');
  }
  /** @type {{ entry: PackSource, key: string, root: string | null, purpose: ReaderPurpose }} */
  let validated;
  if (URL_SCHEME_RE.test(location)) {
    // The shared check refuses a ninth entry first, so this does the same, in its words.
    if (saved.sources.length >= MAX_ADDED_SOURCES) {
      return refusal('limit', `At most ${MAX_ADDED_SOURCES} sources can be added to a project.`);
    }
    try {
      const { entry, source } = validateNewSource({ root, sources: saved.sources.filter(existing => existing.type === 'remote'),
        builtins: configuration.builtins, location, ref: ref ?? undefined });
      validated = { entry, key: source.key, root: source.root ?? null, purpose: purposeOf(source) };
    } catch (error) {
      if (!(error instanceof PackSourceError)) throw error;
      return refusal(sourceCode(error.code), error.message, error.key ? { key: error.key } : {});
    }
  } else {
    const outcome = await acquireContained(root, signal, until, 'local', { op: 'validate', location, ref, revision: saved.revision });
    if (outcome.refusal) {
      return refusal(sourceCode(outcome.refusal.code), outcome.refusal.message, outcome.refusal.key ? { key: outcome.refusal.key } : {});
    }
    if (!outcome.ok) {
      const [code, message] = outcome.reason === 'catalog_timeout' ? ADD_VALIDATE_TIMEOUT : addReadRefusal(outcome.reason, 'local');
      signal.throwIfAborted();
      return refusal(code, message);
    }
    validated = { entry: outcome.entry, key: outcome.source.key, root: outcome.source.root, purpose: 'local' };
  }
  const prospective = [...saved.sources, validated.entry];
  const bytes = Buffer.from(serializePackSourcesDocument(prospective), 'utf8');
  const read = await acquireContained(root, signal, until, validated.purpose, {
    op: 'source', index: saved.sources.length, key: validated.key, revision: identity(bytes), document: 'candidate', list: true,
  }, async temporary => { await fs.promises.writeFile(path.join(temporary, CANDIDATE_DOCUMENT), bytes, { flag: 'wx' }); });
  signal.throwIfAborted();
  if (!read.ok) {
    if (read.reason === 'catalog_metadata') return refusal('bad_metadata', read.error);
    const [code, message] = addReadRefusal(read.reason, validated.purpose);
    return refusal(code, message);
  }
  // The candidate that was read must be the candidate that was validated.
  if (read.source?.key !== validated.key || (validated.root !== null && read.source.root !== validated.root)) {
    return refusal('sources_changed', 'The source changed while it was read. Try again.');
  }
  const count = read.result.packs.length;
  // From here to the write nothing is awaited, so nothing can interleave.
  beforeCommit?.();
  try {
    if (readRootIdentity(root) !== rootIdentity) return refusal('workspace_changed', 'The workspace changed while the source was read.');
  } catch { return refusal('workspace_changed', 'The workspace is not available.'); }
  const current = readPackSources(root);
  if (!current.ok) return refusal('sources_unavailable', current.error);
  if (current.revision !== saved.revision) {
    return refusal('sources_changed', 'The saved sources changed while the source was read. Reload packs and try again.');
  }
  try {
    const written = writePackSources(root, prospective, saved.revision);
    return { ok: /** @type {const} */ (true), key: validated.key, count, sourcesRevision: written.revision };
  } catch (error) {
    if (error instanceof PackSourceError) {
      return refusal(error.code === 'stale' ? 'sources_changed' : 'sources_unavailable',
        error.code === 'stale' ? 'The saved sources changed while the source was read. Reload packs and try again.' : error.message);
    }
    return refusal('write_failed', 'The sources file could not be saved. Nothing was changed.');
  }
}

/**
 * @param {Array<{ kind: 'installed', name: string } | { kind: 'request', name: string, operation: string, phase: string }>} blockers
 */
function describeBlockers(blockers) {
  const installed = blockers.filter(blocker => blocker.kind === 'installed').map(blocker => blocker.name);
  const requests = blockers.filter(blocker => blocker.kind === 'request')
    .map(blocker => `${/** @type {any} */ (blocker).operation} ${blocker.name} (${/** @type {any} */ (blocker).phase})`);
  return [installed.length ? `Installed packs from this source: ${installed.join(', ')}.` : '',
    requests.length ? `Pack requests that use it: ${requests.join(', ')}.` : ''].filter(Boolean).join(' ');
}

/**
 * Remove one saved source, which deletes only its entry. It is refused while an
 * installed pack records the source or a live pack request is bound to it, and
 * every blocker is named. The final check is synchronous from the installed
 * authority and the provider's live requests through the write, so a request
 * that is being prepared cannot slip between the check and the write. Whether a
 * catalog was ever read, or can be, never matters, and neither does a different
 * saved folder that does not answer. A folder that does not answer is itself
 * removable by the key its row shows; an installed pack that records its
 * spelled location still blocks it.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {{ key: string, sourcesRevision: string }} input
 * @param {{ liveUses: (key: string) => Array<{ name: string, operation: string, phase: string }>, beforeCommit?: () => void }} hooks
 */
export async function removePackSource(root, signal, { key, sourcesRevision }, { liveUses, beforeCommit }) {
  root = path.resolve(root);
  signal.throwIfAborted();
  const until = acquisitionWindow();
  let rootIdentity;
  try { rootIdentity = readRootIdentity(root); }
  catch { return refusal('workspace_changed', 'The workspace is not available.'); }
  const configuration = readConfiguration(root);
  const { saved, builtins } = configuration;
  if (!saved.ok) return refusal('sources_unavailable', saved.error);
  if (saved.revision !== sourcesRevision) {
    return refusal('sources_changed', 'The saved sources changed. Reload packs and try again.');
  }
  if (builtins.some(builtin => builtin.key === key)) {
    return refusal('builtin_source', 'A built-in source is managed by the bundle and cannot be removed.');
  }
  const search = await findSavedSource(root, signal, until, configuration, key);
  if (!search.ok) {
    if (search.why === 'unreadable') return refusal('sources_unavailable', search.error);
    if (search.why === 'changed') return refusal('sources_changed', 'The saved sources changed. Reload packs and try again.');
    // A folder that did not answer might be the one this key names, so the key cannot be called unknown.
    if (search.why === 'unanswered') {
      return search.reason === 'catalog_timeout'
        ? refusal('timeout', 'A saved folder did not answer within 5 seconds, so this source could not be identified. Nothing was changed.')
        : refusal('unavailable', 'A saved folder could not be read, so this source could not be identified. Nothing was changed. Try again.');
    }
    return refusal('unknown_source', 'This is not a source saved in this project.');
  }
  const removed = search.item;
  const source = /** @type {DescribedSource} */ (removed.source);
  // ---- No await from here to the write. ----
  const fresh = readPackSources(root);
  if (!fresh.ok) return refusal('sources_unavailable', fresh.error);
  if (fresh.revision !== sourcesRevision) {
    return refusal('sources_changed', 'The saved sources changed. Reload packs and try again.');
  }
  const status = cmdStatus({ root });
  if (!status.ok) {
    return refusal('authority_unavailable', 'Installed pack authority could not be read, so this source cannot be shown to be unused.');
  }
  /** @type {Parameters<typeof describeBlockers>[0]} */
  const blockers = Object.entries(status.result.installed)
    .filter(([, record]) => usesSource(root, source, /** @type {any} */ (record).source))
    .map(([name]) => ({ kind: /** @type {const} */ ('installed'), name }));
  try {
    for (const use of liveUses(key)) blockers.push({ kind: 'request', name: use.name, operation: use.operation, phase: use.phase });
  } catch {
    return refusal('authority_unavailable', 'Pack requests could not be checked, so this source cannot be shown to be unused.');
  }
  if (blockers.length) {
    return refusal('source_in_use', `This source is in use. ${describeBlockers(blockers)}`, { blockers });
  }
  beforeCommit?.();
  try {
    if (readRootIdentity(root) !== rootIdentity) return refusal('workspace_changed', 'The workspace changed.');
  } catch { return refusal('workspace_changed', 'The workspace is not available.'); }
  try {
    const written = writePackSources(root, fresh.sources.filter((_, index) => index !== removed.index), fresh.revision);
    return { ok: /** @type {const} */ (true), sourcesRevision: written.revision };
  } catch (error) {
    if (error instanceof PackSourceError) {
      return refusal(error.code === 'stale' ? 'sources_changed' : 'sources_unavailable',
        error.code === 'stale' ? 'The saved sources changed. Reload packs and try again.' : error.message);
    }
    return refusal('write_failed', 'The sources file could not be saved. Nothing was changed.');
  }
}
