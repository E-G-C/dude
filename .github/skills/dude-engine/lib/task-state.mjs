// @ts-check
/**
 * Shared task-state snapshot parser / validator / serializer for the
 * coordinator-state store at `.dude/state/task-state.json`.
 *
 * The snapshot maps each canonical `tasks.md` identity to the last
 * coordinator-written glyph set plus a fresh ISO timestamp. The Lightweight
 * Execution board CLI reads it to detect a human-applied `[x]` without evidence,
 * and `dude-lint` validates its schema. This module is the single source of
 * truth for that read / validate / write cycle so `board.mjs` and `lint.mjs`
 * share exactly one parser and one schema.
 *
 * Distinguishes legitimate absence from unreadable / malformed / wrong-schema /
 * symlinked corruption, and fails closed on a validated write: a corrupt store
 * blocks the mutation and is left byte-unchanged. Dependency-free ESM, Node
 * >= 20. `parseTaskState` is pure over already-read text; `readTaskState` and
 * `upsertTaskStateEntry` are the only filesystem-touching helpers.
 */

import fs from 'node:fs';
import path from 'node:path';

import { GLYPH_STATE, TASK_KEY_RE } from './tasks.mjs';
import { WORKSPACE_PATHS, resolveMutationPath } from './workspace-paths.mjs';

/** Canonical snapshot key grammar: `.dude/specs/<feature>/tasks.md`. */
const STATE_KEY_RE = /^\.dude\/specs\/[^/]+\/tasks\.md$/;
/** Strict `new Date().toISOString()` shape. */
const UPDATED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** The only glyphs a snapshot may record, reusing the board's glyph vocabulary. */
const GLYPHS = new Set(Object.keys(GLYPH_STATE));

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>} true for a non-null, non-array object.
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate a decoded snapshot against the strict schema. First failing rule
 * wins; every returned reason is nonempty and specific. `{}` is valid.
 * @param {unknown} value
 * @returns {string | null} a corruption reason, or null when valid.
 */
function validateTaskState(value) {
  if (!isPlainObject(value)) return 'malformed JSON object';
  for (const [key, entry] of Object.entries(value)) {
    if (!STATE_KEY_RE.test(key)) return `invalid task-state key '${key}'`;
    if (!isPlainObject(entry)) return `task-state entry '${key}' must be an object`;
    if (!('glyphs' in entry)) return `task-state entry '${key}' is missing 'glyphs'`;
    if (!('updated_at' in entry)) return `task-state entry '${key}' is missing 'updated_at'`;
    const extra = Object.keys(entry).filter((field) => field !== 'glyphs' && field !== 'updated_at');
    if (extra.length) return `task-state entry '${key}' has unexpected field '${extra[0]}'`;
    const { glyphs, updated_at: updatedAt } = entry;
    if (!isPlainObject(glyphs)) return `task-state entry '${key}' glyphs must be an object`;
    for (const [taskKey, glyph] of Object.entries(glyphs)) {
      if (!TASK_KEY_RE.test(taskKey)) return `task-state entry '${key}' has invalid task key '${taskKey}'`;
      if (typeof glyph !== 'string' || !GLYPHS.has(glyph)) {
        return `task-state entry '${key}' has invalid glyph '${glyph}' for '${taskKey}'`;
      }
    }
    if (typeof updatedAt !== 'string' || !UPDATED_AT_RE.test(updatedAt)) {
      return `task-state entry '${key}' has invalid updated_at`;
    }
  }
  return null;
}

/**
 * @typedef {Record<string, { glyphs: Record<string, string>, updated_at: string }>} TaskState
 */

/**
 * Parse already-read snapshot text into a validated state. Pure.
 * @param {string} text
 * @returns {{ status: 'ok', state: TaskState } | { status: 'corrupt', reason: string }}
 */
export function parseTaskState(text) {
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { status: 'corrupt', reason: 'malformed JSON object' };
  }
  const reason = validateTaskState(decoded);
  if (reason) return { status: 'corrupt', reason };
  return { status: 'ok', state: /** @type {TaskState} */ (decoded) };
}

/**
 * Read and validate the coordinator-state snapshot below a workspace root.
 * Refuses symlinked / unsafe paths (via `resolveMutationPath`) before any read.
 * @param {string} root
 * @returns {{ status: 'absent' } | { status: 'corrupt', reason: string } | { status: 'ok', state: TaskState }}
 */
export function readTaskState(root) {
  let target;
  try {
    target = resolveMutationPath(root, WORKSPACE_PATHS.TASK_STATE);
  } catch (error) {
    return { status: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
  }
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { status: 'absent' };
    }
    return { status: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
  }
  if (!stat.isFile()) return { status: 'corrupt', reason: 'task-state snapshot is not a regular file' };
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    return { status: 'corrupt', reason: 'task-state snapshot is unreadable' };
  }
  return parseTaskState(text);
}

/**
 * Upsert one feature's glyph set into the snapshot behind a corruption gate.
 * Reads the current snapshot first: on corruption this throws (fail closed) and
 * leaves the file byte-unchanged; otherwise it merges the entry over the base,
 * revalidates, and writes sorted two-space JSON with a trailing newline. The
 * spread preserves every unrelated feature entry.
 * @param {string} root
 * @param {string} relKey canonical `.dude/specs/<feature>/tasks.md`
 * @param {Record<string, string>} glyphs
 * @returns {TaskState} the written state.
 */
export function upsertTaskStateEntry(root, relKey, glyphs) {
  const current = readTaskState(root);
  if (current.status === 'corrupt') {
    throw new Error(`corrupt task-state snapshot: ${current.reason}`);
  }
  const base = current.status === 'ok' ? current.state : {};
  const entry = { glyphs, updated_at: new Date().toISOString() };
  const next = { ...base, [relKey]: entry };
  const reason = validateTaskState(next);
  if (reason) throw new Error(`invalid task-state write: ${reason}`);
  /** @type {TaskState} */
  const ordered = {};
  for (const key of Object.keys(next).sort()) ordered[key] = next[key];
  const target = resolveMutationPath(root, WORKSPACE_PATHS.TASK_STATE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(ordered, null, 2)}\n`);
  return ordered;
}
