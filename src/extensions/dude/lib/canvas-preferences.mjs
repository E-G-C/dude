// @ts-check
/**
 * The one Canvas user preference: whether Canvas follows the GitHub app theme.
 *
 * It is a single file for this user on this computer, outside every
 * repository: `$COPILOT_HOME/extensions/dude/artifacts/canvas-preferences.json`,
 * or the same path under `~/.copilot` when `COPILOT_HOME` is unset. Only the
 * server resolves it. It holds exactly `{"followAppTheme":true}` or
 * `{"followAppTheme":false}`: no workspace, origin, version or theme.
 *
 * Copilot loads a user extension only from a folder's `extension.mjs`, so the
 * data-only `artifacts` folder never becomes one. A save creates only the
 * missing folders on this path and this one document.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @typedef {{ followAppTheme: boolean }} CanvasPreferences */

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
 * The closed preference document, both as stored and as a request body:
 * exactly one own `followAppTheme` boolean. Anything else is null.
 * @param {unknown} value
 * @returns {CanvasPreferences | null}
 */
export function parseCanvasPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const followAppTheme = /** @type {Record<string, unknown>} */ (value).followAppTheme;
  return keys.length === 1 && keys[0] === 'followAppTheme' && typeof followAppTheme === 'boolean'
    ? { followAppTheme } : null;
}

/**
 * Read the preference once, uncached. An absent file is off and creates
 * nothing. Any other failure to read it, or any document but the closed one,
 * is `preference_unreadable`: never off, and never repaired here.
 * @returns {Promise<CanvasPreferences | typeof UNREADABLE>}
 */
export async function readCanvasPreferences() {
  let text;
  try {
    text = await fs.promises.readFile(preferenceFile(), 'utf8');
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT' ? { followAppTheme: false } : UNREADABLE;
  }
  try {
    return parseCanvasPreferences(JSON.parse(text)) ?? UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

/**
 * Save one choice. The complete document goes to a unique sibling staging
 * file, which is then renamed over the preference, so simultaneous savers
 * always leave one complete document: the last successful rename's. A failure
 * removes its staging file and leaves the previous preference as it was. No
 * survival of a power loss is promised.
 * @param {boolean} followAppTheme
 * @returns {Promise<CanvasPreferences | typeof WRITE_FAILED>}
 */
export async function writeCanvasPreferences(followAppTheme) {
  let staging = '';
  try {
    const file = preferenceFile();
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    staging = `${file}.${randomUUID()}.tmp`;
    await fs.promises.writeFile(staging, JSON.stringify({ followAppTheme }));
    await fs.promises.rename(staging, file);
    return { followAppTheme };
  } catch {
    if (staging) await fs.promises.rm(staging, { force: true }).catch(() => {});
    return WRITE_FAILED;
  }
}
