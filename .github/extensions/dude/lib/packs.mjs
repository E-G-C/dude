// @ts-check
/**
 * Private Canvas pack-read boundary. Compose owns parsing and source resolution;
 * this adapter owns read lifetime, safe paths and the joined snapshot's preimage.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cmdStatus, readManifestSource } from '../../../skills/dude-compose/compose.mjs';
import { PACK_NAME_RE } from '../../../skills/dude-engine/lib/profile.mjs';
import { resolveMutationPath, WORKSPACE_PATHS } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

// Match Canvas's existing external-acquisition window. Never return a truncated
// catalog: one reader process carries the complete result, with O(record bytes)
// memory rather than per-row reads or a retained catalog cache.
const READ_DEADLINE_MS = 5_000;
// A timed-out or cancelled reader has this long to confirm that its whole
// process tree stopped before its read reports unconfirmed cleanup.
const STOP_CONFIRM_MS = 2_000;
// Each read runs this module in its own helper process.
const READER = fileURLToPath(new URL('./catalog-reader.mjs', import.meta.url));
const CATALOG_FAILURES = Object.freeze({
  catalog_timeout: 'The catalog read timed out. Reload to try a fresh read.',
  catalog_cleanup_failed: 'The catalog reader could not confirm process cleanup.',
});

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
 * Local acquisition inputs, not an integrity claim about installed/source
 * bytes. The Compose owner must still bind its actual preview and apply.
 * A request also binds its one selected local manifest across async queue
 * checks. Remote content/commit and projected targets belong to the later
 * owner preview; this synchronous check never fetches or scans a catalog.
 * @param {string} root @param {string} [name]
 */
function catalogInputsRevision(root, name) {
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
  const manifest = inspect(resolveMutationPath(root, WORKSPACE_PATHS.BUNDLE_MANIFEST));
  if (manifest && !manifest.file) throw new Error('The bundle manifest must be a regular file.');
  const library = inspect(resolveMutationPath(root, 'library/packs'));
  const inputs = [manifest, library];
  if (name !== undefined) {
    if (!PACK_NAME_RE.test(name)) throw new Error('Invalid selected pack name.');
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
  return identity(JSON.stringify(inputs));
}

/** Synchronous final admission check after the provider's queue read.
 * @param {string} root @param {boolean} [catalog] @param {string} [name]
 */
export function packReadRevision(root, catalog = true, name) {
  const status = cmdStatus({ root });
  if (!status.ok) throw new Error(status.error);
  return identity(JSON.stringify([profilePreimage(root), catalog ? catalogInputsRevision(root, name) : null]));
}

/** @param {string} reason */
function catalogFailure(reason) {
  return { ok: false, reason,
    error: /** @type {Record<string, string>} */ (CATALOG_FAILURES)[reason]
      ?? 'The catalog reader is unavailable. Reload to try a fresh read.' };
}

/**
 * The only code that knows the Copilot CLI extension launch contract. The CLI
 * starts an extension as `<execPath> <runtime>/preloads/extension_bootstrap.mjs`
 * with EXTENSION_PATH naming the extension and COPILOT_EXTENSION_PARENT_PID
 * naming the CLI, and its single executable runs a script only through that
 * bootstrap. So relaunch the reader the same way, as this process's child.
 * Override both variables: otherwise the bootstrap imports the extension again,
 * or exits because its parent is not the CLI. Use the bootstrap only if it
 * exists, as the CLI does. Under plain Node, execPath runs the reader directly.
 * @param {string} root
 * @returns {{ args: string[], env: Record<string, string> }}
 */
function readerLaunch(root) {
  const bootstrap = process.argv.find(arg => path.basename(arg) === 'extension_bootstrap.mjs');
  return bootstrap && fs.existsSync(bootstrap)
    ? { args: [bootstrap, READER, root],
      env: { EXTENSION_PATH: READER, COPILOT_EXTENSION_PARENT_PID: String(process.pid) } }
    : { args: [READER, root], env: {} };
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

/**
 * Compose's remote resolver runs synchronous Git, which no thread can
 * interrupt. So every read runs the reader in its own short-lived process tree
 * with its own temporary root, and nothing outlives the read. The deadline or
 * a cancellation stops the whole tree within a bounded window. The root is
 * removed only when nothing can still write into it. No shell, arbitrary
 * command, source override or installed-file write is admitted here.
 * @param {string} root
 * @param {AbortSignal} signal
 */
async function acquireCatalog(root, signal) {
  signal.throwIfAborted();
  const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dude-canvas-packs-'));
  // Compose's temporary checkout belongs to this acquisition only.
  const remove = () => fs.promises.rm(temporary, { recursive: true, force: true });
  if (signal.aborted) {
    await remove();
    return catalogFailure('catalog_cancelled');
  }
  const launch = readerLaunch(root);
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
      env: { ...process.env, ...launch.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        GIT_TERMINAL_PROMPT: '0' },
    });
  } catch {
    await remove();
    return catalogFailure('catalog_unavailable');
  }
  /** @type {{ reason: string | null, result?: any }} */
  const outcome = await new Promise(resolve => {
    /** @type {any} */
    let message = null;
    /** @type {string | null} */
    let trigger = null;
    /** @type {boolean | null} */
    let stopped = null;
    let failed = false, closed = false, settled = false;
    /** @type {NodeJS.Timeout | undefined} */
    let stopWindow;
    /** @param {{ reason: string | null, result?: any }} value */
    const settle = value => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(stopWindow);
      signal.removeEventListener('abort', cancel);
      resolve(value);
    };
    // After a trigger, the stop is confirmed only by both the close and the kill result.
    const confirm = () => {
      if (closed && stopped !== null) settle({ reason: stopped ? trigger : 'catalog_cleanup_failed' });
    };
    /** @param {string} reason */
    const stop = reason => {
      if (trigger || closed) return;
      trigger = reason;
      stopWindow = setTimeout(() => {
        // The last resort for a reader that outlived its tree stop.
        child.kill('SIGKILL');
        settle({ reason: 'catalog_cleanup_failed' });
      }, STOP_CONFIRM_MS);
      stopTree(child, result => { stopped = result; confirm(); });
    };
    const cancel = () => stop('catalog_cancelled');
    const deadline = setTimeout(() => stop('catalog_timeout'), READ_DEADLINE_MS);
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
      settle(!failed && code === 0 && message && typeof message.ok === 'boolean'
        ? { reason: null, result: message } : { reason: 'catalog_unavailable' });
    });
    if (signal.aborted) cancel();
  });
  // An unconfirmed stop may leave a live descendant writing into the root, so
  // leave the root rather than race it.
  if (outcome.reason === 'catalog_cleanup_failed') return catalogFailure(outcome.reason);
  await remove();
  return outcome.reason ? catalogFailure(outcome.reason) : outcome.result;
}

/** @param {string} state @param {string|null} [reason] @param {string|null} [message] */
function coverage(state, reason = null, message = null) {
  return { state, reason, message };
}

/**
 * installed and catalog preserve the complete cmdStatus/cmdList results.
 * items is their exact-name join: profile order first, then uninstalled catalog
 * order. Null metadata means unacquired, never an invented empty declaration.
 * Only current/empty installed coverage establishes membership. A recorded
 * source is provenance, not verification of installed bytes or operation consent.
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {{catalog?:boolean,name?:string}} [options] A provider-selected name binds local metadata; installed-only checks never need a catalog.
 */
export async function readPacks(root, signal, { catalog: includeCatalog = true, name } = {}) {
  root = path.resolve(root);
  signal.throwIfAborted();
  const snapshot = {
    workspaceId: identity(root), rootIdentity: null, profileRevision: null, readRevision: null, readAt: null,
    installed: null, catalog: null, items: null,
    coverage: {
      installed: coverage('unavailable', 'installed_unavailable', 'The installed profile could not be read.'),
      catalog: coverage('unavailable', 'installed_unavailable', 'Catalog membership requires a readable installed profile.'),
    },
  };
  let before;
  try {
    snapshot.rootIdentity = readRootIdentity(root);
    before = profilePreimage(root, snapshot.rootIdentity);
    snapshot.profileRevision = before.profileRevision;
  } catch (error) {
    snapshot.coverage.installed.message = error instanceof Error ? error.message : snapshot.coverage.installed.message;
    return snapshot;
  }
  const installed = cmdStatus({ root });
  if (!installed.ok) {
    snapshot.coverage.installed.message = installed.error;
    return snapshot;
  }
  let catalog, inputs = null;
  try {
    if (includeCatalog) inputs = catalogInputsRevision(root, name);
    catalog = includeCatalog ? await acquireCatalog(root, signal)
      : { ok: false, reason: 'catalog_not_requested', error: 'This installed-state check does not acquire a catalog.' };
  }
  catch {
    signal.throwIfAborted();
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
    return snapshot;
  }
  const changed = before.rootIdentity !== after.rootIdentity ? 'workspace_changed'
    : before.profileRevision !== after.profileRevision || before.stamp !== after.stamp ? 'profile_changed' : null;
  if (changed) {
    snapshot.coverage.installed = snapshot.coverage.catalog = coverage('stale', changed,
      'The workspace or installed profile changed during the read. Reload to read one current snapshot.');
    snapshot.profileRevision = null;
    return snapshot;
  }
  try {
    if (includeCatalog && inputs !== catalogInputsRevision(root, name)) {
      catalog = { ok: false, reason: 'catalog_changed', error: 'Catalog inputs changed during the read. Reload before requesting a pack change.' };
    } else snapshot.readRevision = identity(JSON.stringify([after, inputs]));
  } catch {
    catalog = { ok: false, reason: 'catalog_unavailable', error: 'Catalog inputs became unreadable during the read.' };
  }
  if (validated.ok) {
    snapshot.installed = installed.result;
    snapshot.coverage.installed = coverage(installed.result.enabled_packs.length ? 'current' : 'empty');
  } else snapshot.coverage.installed = coverage('unavailable', 'installed_unavailable', validated.error);
  if (catalog.ok) {
    snapshot.catalog = catalog.result;
    snapshot.coverage.catalog = coverage(catalog.result.packs.length ? 'current' : 'empty');
  } else snapshot.coverage.catalog = coverage(catalog.reason === 'catalog_changed' ? 'stale' : 'unavailable',
    catalog.reason || 'catalog_unavailable', catalog.error);
  if (snapshot.installed) {
    const metadata = new Map((snapshot.catalog?.packs ?? []).map(pack => [pack.name, pack]));
    const names = [...Object.keys(snapshot.installed.installed),
      ...(snapshot.catalog?.packs ?? []).filter(pack => !Object.hasOwn(snapshot.installed.installed, pack.name)).map(pack => pack.name)];
    snapshot.items = names.map(name => {
      const isInstalled = Object.hasOwn(snapshot.installed.installed, name);
      const entry = isInstalled ? snapshot.installed.installed[name] : null, pack = metadata.get(name);
      return { name, installed: isInstalled, files: entry?.files ?? null, source: entry?.source ?? null,
        description: pack?.description ?? null, use_cases: pack?.use_cases ?? null };
    });
  }
  snapshot.readAt = new Date().toISOString();
  return snapshot;
}
