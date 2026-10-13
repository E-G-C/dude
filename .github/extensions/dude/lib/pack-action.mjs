// @ts-check
/**
 * Private Canvas pack action. `runPackAction` in `packs.mjs` runs it as a
 * short-lived child for one Compose preview or apply of one pack, and owns its
 * launch, deadline, stop and temporary root, as it owns a catalog reader's. The
 * child does that one operation, answers over IPC and exits.
 *
 * It is told only a closed request in `PACK_ACTION_REQUEST_ENV`, which
 * `packs.mjs` builds from a validated route body or from a preview's own
 * binding: the operation, the pack, and the source Compose reads (a saved
 * source, a repository at the previewed commit, or the workspace library alone).
 *
 * Compose makes every check and every write. An install or a refresh asks the
 * parent once, at Compose's `beforeWrite`, after staging and before any write;
 * Compose writes only on the parent's literal go, and a parent that is gone is a
 * no.
 *
 * Git's home moves here as it does in the catalog reader's main block: to the
 * empty folder `packs.mjs` made in this child's own temporary root, once any host
 * bootstrap has loaded and before Compose can start Git, so libcurl finds none of
 * the user's `.netrc` logins. A child without that folder does nothing.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cmdAdd,
  cmdPreviewAdd,
  cmdPreviewRefresh,
  cmdPreviewRemove,
  cmdRefresh,
  cmdRemove,
} from '../../../skills/dude-compose/compose.mjs';
import { CATALOG_GIT_HOME_ENV } from './catalog-reader.mjs';

const SELF = fileURLToPath(import.meta.url);

/** The one environment variable that carries the closed request to this child. */
export const PACK_ACTION_REQUEST_ENV = 'DUDE_CANVAS_PACK_ACTION';

/**
 * @typedef {{ op: 'preview' | 'apply', operation: 'install' | 'remove' | 'refresh', name: string,
 *   source: string | null, ref: string | null, fetch: boolean }} PackActionRequest
 */

/**
 * The closed request. Anything else is a refusal, never a best-effort run.
 * @param {string | undefined} text
 * @returns {PackActionRequest}
 */
function parseRequest(text) {
  const value = text === undefined ? null : JSON.parse(text);
  const keys = ['op', 'operation', 'name', 'source', 'ref', 'fetch'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || (value.op !== 'preview' && value.op !== 'apply') || !['install', 'remove', 'refresh'].includes(value.operation)
    || typeof value.name !== 'string' || (value.source !== null && typeof value.source !== 'string')
    || (value.ref !== null && typeof value.ref !== 'string') || typeof value.fetch !== 'boolean') {
    throw new Error('The pack action request is not one of the fixed operations.');
  }
  return value;
}

/**
 * Ask the parent once whether Compose may write now. Only its literal go is a
 * yes; a lost parent, or a question that cannot be sent, is a no.
 * @returns {Promise<boolean>}
 */
function askParent() {
  return new Promise(resolve => {
    let answered = false;
    /** @param {boolean} go */
    const finish = go => {
      if (answered) return;
      answered = true;
      process.off('message', hear);
      process.off('disconnect', lost);
      resolve(go);
    };
    /** @param {any} message */
    const hear = message => { if (message?.type === 'gate') finish(message.go === true); };
    const lost = () => finish(false);
    process.on('message', hear);
    process.on('disconnect', lost);
    if (!process.connected || !process.send) finish(false);
    else process.send({ type: 'gate' }, (/** @type {Error | null} */ error) => { if (error) finish(false); });
  });
}

/**
 * The one operation's Compose result. It never rejects.
 * @param {string} root
 */
async function handle(root) {
  try {
    const request = parseRequest(process.env[PACK_ACTION_REQUEST_ENV]);
    const { name } = request;
    if (request.operation === 'remove') {
      return request.op === 'preview' ? cmdPreviewRemove({ root, name }) : cmdRemove({ root, name });
    }
    const args = {
      root, library: path.join(root, 'library', 'packs'), name, fetch: request.fetch,
      ...(request.source === null ? {} : { source: request.source }),
      ...(request.ref === null ? {} : { ref: request.ref }),
    };
    if (request.op === 'preview') {
      return request.operation === 'install' ? await cmdPreviewAdd(args) : await cmdPreviewRefresh(args);
    }
    return request.operation === 'install'
      ? await cmdAdd({ ...args, force: false, beforeWrite: askParent })
      : await cmdRefresh({ ...args, beforeWrite: askParent });
  } catch (error) {
    // No mutation is claimed: the parent judges that by whether it let this child write.
    return { ok: false, code: 2, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Point every spelling of this process's home at the Git home `packs.mjs` named,
 * HOMEDRIVE and HOMEPATH too on Windows. Only an absolute folder directly in this
 * child's own temporary root qualifies; any other value moves nothing.
 * @returns {boolean} whether the home moved
 */
function useOwnGitHome() {
  const value = process.env[CATALOG_GIT_HOME_ENV];
  if (!value || !path.isAbsolute(value)) return false;
  const home = path.resolve(value);
  if (path.dirname(home) === home || path.dirname(home) !== path.resolve(os.tmpdir())) return false;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  if (process.platform === 'win32') {
    const { root: drive } = path.parse(home);
    process.env.HOMEDRIVE = drive.replace(/[\\/]$/, '');
    process.env.HOMEPATH = home.slice(drive.length - 1);
  }
  return true;
}

// One operation, never a command dispatcher. The launch always ends with this
// module's path and the workspace root, so any other importer never acts.
const [entry, root] = process.argv.slice(-2);
if (typeof process.send === 'function' && entry && path.resolve(entry) === SELF && root) {
  const result = useOwnGitHome() ? await handle(root)
    : { ok: false, code: 2, mutation: 'none', error: 'The pack action was not given a Git home of its own.' };
  // Exit explicitly: a host runtime may hold handles that would keep a finished child alive.
  process.send({ type: 'result', result }, (/** @type {Error | null} */ error) => process.exit(error ? 1 : 0));
}
