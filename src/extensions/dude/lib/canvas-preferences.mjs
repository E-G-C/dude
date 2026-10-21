// @ts-check
/**
 * The two Canvas user preferences: whether Canvas follows the GitHub app
 * theme, and whether a session checks for a newer Dude release when it starts.
 *
 * They share one file for this user on this computer, outside every
 * repository: `$COPILOT_HOME/extensions/dude/artifacts/canvas-preferences.json`,
 * or the same path under `~/.copilot` when `COPILOT_HOME` is unset. Only the
 * server resolves it. The complete document is exactly
 * `{"followAppTheme":<boolean>,"checkForUpdatesOnSessionStart":<boolean>}`: no
 * workspace, origin, version or theme. An absent file reads as false and true,
 * and the earlier one-key `{"followAppTheme":<boolean>}` document reads with
 * the update check on. Neither read writes anything.
 *
 * A save changes one choice and keeps the other. It reads the current
 * document, refuses to replace one it cannot read, and writes the complete
 * document. Saves in this process run one at a time, so saving one choice
 * never resets the other. Separate processes still replace the whole document:
 * the last successful rename wins.
 *
 * Copilot loads a user extension only from a folder's `extension.mjs`, so the
 * data-only `artifacts` folder never becomes one. A save creates only the
 * missing folders on this path and this one document.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @typedef {{ followAppTheme: boolean, checkForUpdatesOnSessionStart: boolean }} CanvasPreferences */
/** @typedef {keyof CanvasPreferences} PreferenceKey */

/** The document's keys, in the order a save writes them. */
const KEYS = Object.freeze(/** @type {PreferenceKey[]} */ (['followAppTheme', 'checkForUpdatesOnSessionStart']));
/** What an absent file reads as, and what the earlier one-key document leaves out. */
const DEFAULTS = Object.freeze({ followAppTheme: false, checkForUpdatesOnSessionStart: true });

const UNREADABLE = Object.freeze({ error: /** @type {const} */ ('preference_unreadable') });
const WRITE_FAILED = Object.freeze({ error: /** @type {const} */ ('preference_write_failed') });

/**
 * Resolved on every call, so it always follows the current `COPILOT_HOME`.
 * @returns {string}
 */
function preferenceFile() {
  return path.join(process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'),
    'extensions', 'dude', 'artifacts', 'canvas-preferences.json');
}

/**
 * A stored document: the complete two-key one, or the earlier one-key one,
 * whose missing update-check choice is on. Anything else is null.
 * @param {unknown} value
 * @returns {CanvasPreferences | null}
 */
function parseStored(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(record);
  const complete = keys.length === KEYS.length && KEYS.every(key => Object.hasOwn(record, key));
  const earlier = keys.length === 1 && keys[0] === 'followAppTheme';
  const { followAppTheme, checkForUpdatesOnSessionStart } = record;
  if ((!complete && !earlier) || typeof followAppTheme !== 'boolean') return null;
  if (!complete) return { followAppTheme, checkForUpdatesOnSessionStart: DEFAULTS.checkForUpdatesOnSessionStart };
  return typeof checkForUpdatesOnSessionStart === 'boolean' ? { followAppTheme, checkForUpdatesOnSessionStart } : null;
}

/**
 * A save's request body: exactly one own known key holding a boolean, such as
 * `{"checkForUpdatesOnSessionStart":false}`. Anything else is null.
 * @param {unknown} value
 * @returns {{ key: PreferenceKey, value: boolean } | null}
 */
export function parseCanvasPreferencePatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(record);
  const key = /** @type {PreferenceKey} */ (keys[0]);
  return keys.length === 1 && KEYS.includes(key) && typeof record[key] === 'boolean'
    ? { key, value: /** @type {boolean} */ (record[key]) } : null;
}

/**
 * Read the preferences once, uncached. An absent file is the defaults and
 * creates nothing. Any other failure to read it, or any document but the two
 * accepted ones, is `preference_unreadable`: never the defaults, and never
 * repaired here.
 * @returns {Promise<CanvasPreferences | typeof UNREADABLE>}
 */
export async function readCanvasPreferences() {
  let text;
  try {
    text = await fs.promises.readFile(preferenceFile(), 'utf8');
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT' ? { ...DEFAULTS } : UNREADABLE;
  }
  try {
    return parseStored(JSON.parse(text)) ?? UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

/** The tail of this process's save queue; each save starts after the one before it settles. */
let saving = Promise.resolve();

/**
 * Save one choice and keep the other, after every save this process started
 * before it. The answer is the complete saved document;
 * `preference_unreadable` when the current document cannot be read, which is
 * left exactly as it is; or `preference_write_failed`. Reading the choices
 * never waits for this queue.
 * @param {{ key: PreferenceKey, value: boolean }} patch
 * @returns {Promise<CanvasPreferences | typeof UNREADABLE | typeof WRITE_FAILED>}
 */
export function saveCanvasPreference(patch) {
  const saved = saving.then(() => save(patch));
  saving = saved.then(() => undefined, () => undefined);
  return saved;
}

/**
 * The complete document goes to a unique sibling staging file, which is then
 * renamed over the preference, so simultaneous savers in separate processes
 * always leave one complete document. A failure removes its staging file and
 * leaves the previous preference as it was. No survival of a power loss is
 * promised.
 * @param {{ key: PreferenceKey, value: boolean }} patch
 * @returns {Promise<CanvasPreferences | typeof UNREADABLE | typeof WRITE_FAILED>}
 */
async function save({ key, value }) {
  const current = await readCanvasPreferences();
  if ('error' in current) return UNREADABLE;
  const next = { ...current, [key]: value };
  const document = { followAppTheme: next.followAppTheme, checkForUpdatesOnSessionStart: next.checkForUpdatesOnSessionStart };
  let staging = '';
  try {
    const file = preferenceFile();
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    staging = `${file}.${randomUUID()}.tmp`;
    await fs.promises.writeFile(staging, JSON.stringify(document));
    await fs.promises.rename(staging, file);
    return document;
  } catch {
    if (staging) await fs.promises.rm(staging, { force: true }).catch(() => {});
    return WRITE_FAILED;
  }
}
