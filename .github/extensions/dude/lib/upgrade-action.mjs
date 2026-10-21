// @ts-check
/**
 * Private Canvas update action. The update controller (bundle-upgrade.mjs) runs
 * it as a short-lived child for one preparation or one application of a Dude
 * update, and owns its launch, environment, stop and temporary root. The child
 * does that one operation, reports progress and its one result over IPC, and
 * exits.
 *
 * It is told only a closed request in `UPGRADE_ACTION_REQUEST_ENV`: prepare,
 * with or without the eligible out-of-the-box packs, or apply one prepared
 * result by its opaque ID. The workspace comes from its launch. Everything else
 * comes from the installation: the installed bundle upgrade engine reads the
 * recorded source and ref, acquires the target release with this installation's
 * code, and runs the target release's own retained engine to stage and to
 * apply, from the prepared folder rather than from the deployed files it
 * replaces. A prepared folder lives in this child's temporary folder, which the
 * controller owns, so a preparation and the application of its result use the
 * same one.
 *
 * Cancel reaches a preparation as an IPC message, and a parent that goes away
 * cancels it too: the engine stops the processes it started and reports. An
 * application takes no cancellation of any kind: once it starts, it finishes or
 * restores, whatever happens to the Canvas that asked for it. Its one progress
 * event says that every file is written and the bundle check after writing
 * starts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
/** The installed engine, which this child runs; it hands staging and application to the target's own engine. */
const ENGINE = new URL('../../../skills/dude-bundle-upgrade/upgrade.mjs', import.meta.url).href;

/** The one environment variable that carries the closed request to this child. */
export const UPGRADE_ACTION_REQUEST_ENV = 'DUDE_CANVAS_UPGRADE_ACTION';

/** @typedef {{ op: 'prepare', includePacks: boolean } | { op: 'apply', id: string }} UpgradeActionRequest */

/**
 * The closed request. Anything else is a refusal, never a best-effort run.
 * @param {string | undefined} text
 * @returns {UpgradeActionRequest}
 */
function parseRequest(text) {
  const value = text === undefined ? null : JSON.parse(text);
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  if (keys.length === 2 && value.op === 'prepare' && keys.includes('includePacks') && typeof value.includePacks === 'boolean') {
    return { op: 'prepare', includePacks: value.includePacks };
  }
  if (keys.length === 2 && value.op === 'apply' && keys.includes('id') && typeof value.id === 'string' && /^[0-9a-f]{32}$/.test(value.id)) {
    return { op: 'apply', id: value.id };
  }
  throw new Error('The update action request is not one of the fixed operations.');
}

/**
 * The engine's refusal as plain data: its classified reason, its message, and
 * the pack it names when a selected pack could not be prepared.
 * @param {unknown} error
 */
function refusalOf(error) {
  const value = /** @type {any} */ (error);
  return {
    ok: false,
    reason: typeof value?.reason === 'string' ? value.reason : typeof value?.code === 'string' ? value.code : 'failed',
    message: error instanceof Error ? error.message : String(error),
    pack: typeof value?.pack === 'string' ? value.pack : null,
  };
}

/**
 * Report one engine progress event to the parent. `process.send` writes to the
 * IPC channel before it returns while nothing is queued ahead of it, and
 * nothing is in an application: the parent hears its one event even though the
 * bundle check that follows holds this child's event loop until that check ends.
 * @param {unknown} event
 */
function sendProgress(event) {
  if (process.connected && process.send) process.send({ type: 'progress', event }, () => {});
}

/**
 * The one operation's result. It never rejects.
 * @param {string} root
 * @param {AbortSignal} signal
 */
async function handle(root, signal) {
  let request;
  try { request = parseRequest(process.env[UPGRADE_ACTION_REQUEST_ENV]); }
  catch (error) { return { ok: false, reason: 'invalid-input', message: error instanceof Error ? error.message : String(error), pack: null }; }
  try {
    const engine = await import(ENGINE);
    if (request.op === 'apply') return { ok: true, result: await engine.applyUpgrade({ root, id: request.id, onProgress: sendProgress }) };
    const report = await engine.prepareUpgrade({ root, includePacks: request.includePacks, signal, onProgress: sendProgress });
    return { ok: true, report };
  } catch (error) {
    return refusalOf(error);
  }
}

// One operation, never a command dispatcher. The launch always ends with this
// module's path and the workspace root, so any other importer never acts.
const [entry, root] = process.argv.slice(-2);
if (typeof process.send === 'function' && entry && path.resolve(entry) === SELF && root) {
  const cancel = new AbortController();
  process.on('message', (/** @type {any} */ message) => { if (message?.type === 'cancel') cancel.abort(); });
  // Only a preparation listens: a parent that is gone can never apply what it prepares.
  process.once('disconnect', () => cancel.abort());
  const result = await handle(root, cancel.signal);
  // Exit explicitly: nothing this child started outlives its answer.
  if (process.connected && process.send) {
    process.send({ type: 'result', result }, (/** @type {Error | null} */ error) => process.exit(error ? 1 : 0));
  } else {
    process.exit(1);
  }
}
