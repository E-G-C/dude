// @ts-check
/**
 * Dude canvas loopback server for work discovery and joined-owner responses.
 *
 * One loopback HTTP server per open canvas instance. It serves a closed route
 * allowlist only: the browser application, lifecycle event stream, viewport
 * report, private projection paths, and optional bounded Needs You operations.
 * Human handoffs belong to the joined provider, not a Canvas instance. The
 * update routes read and act on the extension's one update controller, whose
 * write gate this server enforces (see `UPDATES_ROUTE`). The GitHub sign-in
 * route reads and acts on the extension's one session controller, whose access
 * every pack read that may read GitHub is given (see `GITHUB_SESSION_ROUTE`).
 *
 * Dependency-free ESM, Node >= 20. `stdout` belongs to JSON-RPC, so nothing
 * here writes to it — every user-visible line goes through the injected `log`.
 *
 * The relative import of the engine path helpers resolves identically from the
 * authored source tree (`src/extensions/dude/lib/` -> `src/skills/dude-engine/`)
 * and from the projected runtime tree (`.github/extensions/dude/lib/` ->
 * `.github/skills/dude-engine/`).
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_NAME_RE } from '../../../skills/dude-engine/lib/profile.mjs';
import { resolveMutationPath } from '../../../skills/dude-engine/lib/workspace-paths.mjs';
import {
  checkProjectionFreshness,
  initialProjectionFreshness,
  readNowProjection,
  readWorkIndex,
  refreshNowProjection,
} from './projection.mjs';
import { NEEDS_YOU_LIMITS, NeedsYouError } from './needs-you.mjs';
import { REVIEW_LIMITS, ReviewError } from './review.mjs';
import { addPackSource, packActionRevision, readPacks, removePackSource, runPackAction } from './packs.mjs';
import { CREDENTIAL_REJECTED } from './github-session.mjs';
import { readProjectArtifacts } from './project-artifacts.mjs';
import { readInstallationRecord } from './about.mjs';
import { parseCanvasPreferencePatch, readCanvasPreferences, saveCanvasPreference } from './canvas-preferences.mjs';
import { UpdateError } from './bundle-upgrade.mjs';

const UI_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');

/** Closed allowlist of served assets: request path -> `ui/`-relative file. */
export const ASSET_ROUTES = Object.freeze({
  '/': 'index.html',
  '/assets/app.js': 'assets/app.js',
  '/assets/app.js.LEGAL.txt': 'assets/app.js.LEGAL.txt',
});

/** Review assets are inert unless the instance has the joined provider. */
export const REVIEW_ASSET_ROUTES = Object.freeze({
  '/review/engine.mjs': 'review/engine.mjs',
  '/review/geometry.mjs': 'review/geometry.mjs',
  '/review/shapes.mjs': 'review/shapes.mjs',
  '/review/inspector.mjs': 'review/inspector.mjs',
  '/review/panel.mjs': 'review/panel.mjs',
  '/review/capture.mjs': 'review/capture.mjs',
  '/review/bridge.mjs': 'review/bridge.mjs',
  '/review/styles.css': 'review/styles.css',
  '/review/NOTICE.txt': 'review/NOTICE.txt',
});

const ASSET_MIME_TYPES = Object.freeze({
  '/': 'text/html; charset=utf-8',
  '/assets/app.js': 'text/javascript; charset=utf-8',
  '/assets/app.js.LEGAL.txt': 'text/plain; charset=utf-8',
  '/review/engine.mjs': 'text/javascript; charset=utf-8',
  '/review/geometry.mjs': 'text/javascript; charset=utf-8',
  '/review/shapes.mjs': 'text/javascript; charset=utf-8',
  '/review/inspector.mjs': 'text/javascript; charset=utf-8',
  '/review/panel.mjs': 'text/javascript; charset=utf-8',
  '/review/capture.mjs': 'text/javascript; charset=utf-8',
  '/review/bridge.mjs': 'text/javascript; charset=utf-8',
  '/review/styles.css': 'text/css; charset=utf-8',
  '/review/NOTICE.txt': 'text/plain; charset=utf-8',
});

/** The viewport report is a few numbers; anything larger is not ours. */
const MAX_BODY_BYTES = 4 * 1024;

/**
 * Exact POST routes that forward one closed prepare/submit body to the joined
 * provider. The provider alone allocates receipts, sends once and judges results.
 */
const PROVIDER_REQUEST_ROUTES = Object.freeze({
  '/api/imports/request': 'requestImport',
});

/** One fixed body for an About read without a live bound workspace. */
const ABOUT_UNAVAILABLE = Object.freeze({
  error: 'about_unavailable',
  message: 'This Canvas has no current workspace.',
});

/**
 * The user's two Canvas preferences, which every instance shares through one
 * file outside every repository (see `canvas-preferences.mjs`). Two exact
 * requests with closed bodies:
 *
 *   GET  -> 200 {"followAppTheme":<boolean>,"checkForUpdatesOnSessionStart":<boolean>},
 *           false and true when nothing was saved
 *   POST {"followAppTheme":<boolean>} or {"checkForUpdatesOnSessionStart":<boolean>}
 *        -> 200 the complete saved document, the other choice kept
 *
 * A malformed or unreadable preference is 503 {"error":"preference_unreadable"},
 * never the defaults, and a save over it is refused with the same answer and
 * writes nothing. A failed save is 500 {"error":"preference_write_failed"} and
 * leaves the previous preference in place. A save needs this instance's own
 * Origin (403) and a JSON content type (415); any other body, including both
 * keys, a root, path or extra field, is 400 {"error":"invalid_input"}, or 413
 * past the body limit. A read with a body is 400, and another method, a query
 * or a suffix is 404. Neither involves a workspace, pack, Needs You request or
 * agent, and saving either choice starts no update check.
 */
const PREFERENCES_ROUTE = '/api/canvas-preferences';

/**
 * The page carries the saved choice from its first byte, so Canvas paints it
 * before any script runs: an owned attribute for the page background and one
 * fixed JSON slot that the application reads once. Each is replaced exactly
 * once, with only the boolean and the closed read-error code. A read failure
 * still serves the page, with the choice off and the error code set.
 */
const FOLLOW_ATTRIBUTE = 'data-dude-follow-app-theme="false"';
const BOOTSTRAP_SLOT = '<script type="application/json" id="dude-canvas-bootstrap">'
  + '{"followAppTheme":false,"preferenceError":null}</script>';

/** @param {string} page @param {Awaited<ReturnType<typeof readCanvasPreferences>>} read */
function bootstrapPage(page, read) {
  const followAppTheme = 'error' in read ? false : read.followAppTheme;
  const preferenceError = 'error' in read ? read.error : null;
  if (page.split(FOLLOW_ATTRIBUTE).length !== 2 || page.split(BOOTSTRAP_SLOT).length !== 2) {
    throw new Error('The Canvas page has no single preference bootstrap slot.');
  }
  return page.replace(FOLLOW_ATTRIBUTE, `data-dude-follow-app-theme="${followAppTheme}"`)
    .replace(BOOTSTRAP_SLOT, () => '<script type="application/json" id="dude-canvas-bootstrap">'
      + `${JSON.stringify({ followAppTheme, preferenceError })}</script>`);
}

/**
 * The two exact reads of the pack projection. Both return installed packs, the
 * source rows and the separate project rows. Only the second acquires catalogs:
 * the default, the bundle upstream too while a local library is the default,
 * and each saved source, once. Browsing, filtering, events and every other
 * automatic read use the first, so nothing is fetched by accident. The second
 * also names `githubLogin`: the public login of the GitHub allowance it read
 * with, or null for the anonymous allowance (089).
 */
const PACKS_ROUTE = '/api/packs';
const PACKS_DISCOVERY_URL = '/api/packs?discover=1';
/** The one direct configuration write: add or remove a saved pack source. */
const SOURCES_ROUTE = '/api/packs/sources';
const SOURCE_REVISION_RE = /^(?:absent|sha256:[0-9a-f]{64})$/;

/**
 * How each refusal of a source write is reported. The input itself is refused
 * (422), the saved configuration is not what the request assumed or cannot be
 * trusted (409), or the read could not finish (5xx), which includes GitHub
 * refusing it for its rate limit or rejecting the sign-in it used. A rate limit
 * also names `githubLogin`, the login of the allowance the read used, or null
 * for the anonymous allowance. Nothing is saved on any of them, and none is a
 * generic failure.
 */
const SOURCE_REFUSAL_STATUS = Object.freeze({
  invalid_location: 422, credentials: 422, invalid_ref: 422, ref_not_applicable: 422, local_missing: 422,
  local_layout: 422, bare_packs_folder: 422, own_library: 422, missing_catalog: 422, bad_metadata: 422,
  unreachable: 422, unknown_source: 422, builtin_source: 422,
  duplicate: 409, limit: 409, sources_changed: 409, sources_unavailable: 409, source_in_use: 409,
  authority_unavailable: 409, workspace_changed: 409,
  timeout: 504, cleanup_unconfirmed: 503, unavailable: 503, rate_limited: 503, credential_rejected: 503, write_failed: 500,
});
/** Why a source read stopped when the GitHub sign-in it was given ended (see `untilSignedOut`). */
const SOURCE_READ_SIGNED_OUT = 'The read stopped because the GitHub sign-in ended while it ran. Nothing was saved.';

/**
 * The closed bodies of the sources route. Every other field, including a root,
 * path, source identity, command, flag or credential, is refused as input.
 * Strings are only bounded here for transport; the shared checks judge them.
 * @param {unknown} value
 * @returns {{ op: 'add', location: string, ref: string | null, sourcesRevision: string }
 *   | { op: 'remove', key: string, sourcesRevision: string }}
 */
function parseSourceBody(value) {
  const invalid = () => new NeedsYouError('invalid_input', 400);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const body = /** @type {Record<string, unknown>} */ (value);
  const allowed = body.op === 'add' ? ['op', 'location', 'ref', 'sourcesRevision']
    : body.op === 'remove' ? ['op', 'key', 'sourcesRevision'] : null;
  const required = body.op === 'add' ? ['op', 'location', 'sourcesRevision'] : ['op', 'key', 'sourcesRevision'];
  if (!allowed || Object.keys(body).some(key => !allowed.includes(key)) || !required.every(key => Object.hasOwn(body, key))
    || typeof body.sourcesRevision !== 'string' || !SOURCE_REVISION_RE.test(body.sourcesRevision)) throw invalid();
  if (body.op === 'remove') {
    if (typeof body.key !== 'string' || !/^src_[0-9a-f]{32}$/.test(body.key)) throw invalid();
    return { op: 'remove', key: body.key, sourcesRevision: body.sourcesRevision };
  }
  if (typeof body.location !== 'string' || Buffer.byteLength(body.location) > 4_096
    || (Object.hasOwn(body, 'ref') && (typeof body.ref !== 'string' || Buffer.byteLength(body.ref) > 256))) throw invalid();
  return { op: 'add', location: body.location, ref: typeof body.ref === 'string' ? body.ref : null,
    sourcesRevision: body.sourcesRevision };
}

/**
 * The one pack action route: Compose's own dry run of an install, removal or
 * refresh, the one apply that preview allows, and Cancel. It involves no Needs
 * You request, idle gate or session message. The closed bodies:
 *
 *   {"op":"preview","operation":"install"|"remove"|"refresh","name":<pack>,"source"?:<saved source key; install only>}
 *   {"op":"apply","token":<token>}
 *   {"op":"cancel","token":<token>}
 *
 * The answers, all plain JSON:
 * - preview 200 {token, thirdParty, preview, message}. `preview` is Compose's dry
 *   run (install: items, files, source, conflicts, tools; remove: files; refresh:
 *   previewed, replaced, added, removed, files, source), or null with `message`
 *   saying why none could be made, and `reason` when GitHub refused its read:
 *   `rate_limited` or `credential_rejected`. A rate limit also names
 *   `githubLogin`, the public login of the allowance that read used, or null for
 *   the anonymous allowance. `token` is null for a blocked preview: none, a
 *   missing tool or a conflict. `thirdParty` marks a saved source the project
 *   added. A new preview replaces the instance's one token. A loading preview
 *   has no token: closing its request cancels it, and its answer is discarded.
 * - apply 200 {ok:true, result} or {ok:false, error, mutation}: Compose's own
 *   result, with the same `reason`, and for a rate limit `githubLogin`, when
 *   GitHub refused its read. `mutation` is none, restored or uncertain, and a
 *   child that ended after it was allowed to write is uncertain.
 * - apply 409 {error}: `changed` (an unknown or spent token, or installed packs,
 *   saved sources or the workspace changed since the preview; nothing was
 *   written), `busy` (another apply runs; the token is kept), `cancelled`
 *   (stopped before writing; nothing changed), or `update_in_progress` or
 *   `new_session_required` (a Canvas update was admitted before this apply
 *   could write; nothing was written).
 * - cancel 200 {cancelled:true} before writing starts, which also discards an
 *   unused token, else 409 {error:'too_late'}, and the apply answers its real
 *   result.
 * - Any op: the guards refuse with 403, 404 or 415, a malformed or oversized body
 *   is 400 or 413 {error:'invalid_input'}, and an ended Canvas lifetime or a
 *   replaced workspace is 409 {error:'identity_mismatch'}.
 *
 * An install's or a refresh's preview and apply are given this session's GitHub
 * access when it has one, which only a child that reads GitHub receives (see
 * `githubAccess`). Signing out stops one that has not reached its write gate, as
 * Cancel does; once the gate said go, it finishes. GitHub rejecting that access,
 * for this action or another read, also stops a child given it that has not
 * reached its gate, and the action answers that refusal rather than `cancelled`:
 * the reason `credential_rejected`, with mutation `none` for an apply. So does
 * one whose child had not started yet, without reading.
 */
const ACTION_ROUTE = '/api/packs/action';
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The closed bodies of the pack action route. Only an install names a saved
 * source, by its key; no body names a path, repository, ref, flag or root.
 * @param {unknown} value
 * @returns {{ op: 'preview', operation: 'install' | 'remove' | 'refresh', name: string, source: string | null }
 *   | { op: 'apply' | 'cancel', token: string }}
 */
function parseActionBody(value) {
  const invalid = () => new NeedsYouError('invalid_input', 400);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const body = /** @type {Record<string, unknown>} */ (value);
  if (body.op === 'apply' || body.op === 'cancel') {
    if (Object.keys(body).length !== 2 || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) throw invalid();
    return { op: body.op, token: body.token };
  }
  const operation = body.operation === 'install' || body.operation === 'remove' || body.operation === 'refresh' ? body.operation : null;
  const allowed = operation === 'install' ? ['op', 'operation', 'name', 'source'] : ['op', 'operation', 'name'];
  if (body.op !== 'preview' || !operation || Object.keys(body).some(key => !allowed.includes(key))
    || typeof body.name !== 'string' || !PACK_NAME_RE.test(body.name)
    || (Object.hasOwn(body, 'source') && (typeof body.source !== 'string' || !/^src_[0-9a-f]{32}$/.test(body.source)))) {
    throw invalid();
  }
  return { op: 'preview', operation, name: body.name, source: typeof body.source === 'string' ? body.source : null };
}

/**
 * The Canvas update routes (072), over the extension's one update controller
 * (`bundle-upgrade.mjs`). They involve no Needs You request, waiter, receipt or
 * session message, and the browser names no repository, ref, root, path,
 * command, executable, file list or bytes: the server derives all of them.
 *
 *   GET  /api/updates         -> 200 this session's update state; it reads the
 *                                installation record and acquires nothing
 *   POST /api/updates/action  -> 200 the state after one closed operation:
 *     {"op":"check"}                          one release check (eligible installs only)
 *     {"op":"later"}                          hide the notice for this session
 *     {"op":"preview","includePacks":<bool>}  prepare the newest release, replacing the live update
 *     {"op":"cancel"}                         dispose the live update before it writes
 *     {"op":"apply","id":<32 hex>}            OK: apply exactly that ready result, once
 *
 * Refusals change nothing: 409 {"error": not_eligible | no_update | stale |
 * busy | update_in_progress | new_session_required | too_late |
 * identity_mismatch}, 400 or 413 {"error":"invalid_input"}, 403 for another
 * origin, 415 for another content type, 404 for another method, query or
 * suffix, and 503 {"error":"updates_unavailable"} for a Canvas with no current
 * workspace or no controller. `busy` refuses OK while another Canvas change of
 * this process can still write (see `committing`). Progress and outcomes
 * arrive as `updates` events on /events, which carry no payload: the browser
 * reads the state again.
 */
const UPDATES_ROUTE = '/api/updates';
const UPDATES_ACTION_ROUTE = '/api/updates/action';
const UPDATES_UNAVAILABLE = Object.freeze({ error: 'updates_unavailable', message: 'This Canvas has no current workspace.' });

/**
 * The closed bodies of the update action route. Anything else, including a
 * root, path, repository, ref, command or file list, is refused as input.
 * @param {unknown} value
 * @returns {{ op: 'check' | 'later' | 'cancel' } | { op: 'preview', includePacks: boolean } | { op: 'apply', id: string }}
 */
function parseUpdateBody(value) {
  const invalid = () => new UpdateError('invalid_input', 400);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const body = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(body);
  if ((body.op === 'check' || body.op === 'later' || body.op === 'cancel') && keys.length === 1) return { op: body.op };
  if (body.op === 'preview' && keys.length === 2 && typeof body.includePacks === 'boolean') {
    return { op: 'preview', includePacks: body.includePacks };
  }
  if (body.op === 'apply' && keys.length === 2 && typeof body.id === 'string' && /^[0-9a-f]{32}$/.test(body.id)) {
    return { op: 'apply', id: body.id };
  }
  throw invalid();
}

/**
 * The GitHub sign-in route (089), over the extension's one session controller
 * (`github-session.mjs`), which every Canvas of this process shares. It involves
 * no workspace, Needs You request or session message, and the browser names no
 * token, scope, Client ID, host or endpoint:
 *
 *   GET  /api/github-session -> 200 the session's state; it asks GitHub nothing
 *   POST /api/github-session -> 200 the state after one closed operation:
 *     {"op":"start"}     start a sign-in, or answer the one already pending, or
 *                        the signed-in state; without a Client ID, `unavailable`
 *     {"op":"cancel"}    end the pending sign-in
 *     {"op":"sign-out"}  forget this session's access and account
 *
 * The state is always {state, login, userCode, verificationUri, expiresAt,
 * outcome}: `state` is signed_out, requesting, waiting or signed_in; `login` is
 * the account's public login while signed in; `userCode`, the fixed
 * `verificationUri` and `expiresAt` (ISO time) are shown while waiting; and
 * `outcome` is the closed end of the last attempt or sign-out while signed out:
 * cancelled, denied, expired, unreachable, unavailable, failed, signed_out or
 * rejected. Every other field is null. No answer carries the access token or
 * the device code.
 *
 * Refusals change nothing: 403 for another origin, 415 for another content type,
 * 404 for another method, query or suffix, 400 or 413 {"error":"invalid_input"},
 * and 503 {"error":"github_session_unavailable"} for a Canvas without the
 * controller. Changes arrive as `github-session` events on /events, which carry
 * no payload: the browser reads the state again. Nothing here reads, saves,
 * installs, refreshes or removes a pack, or repeats a read.
 */
const GITHUB_SESSION_ROUTE = '/api/github-session';
const GITHUB_SESSION_OPS = Object.freeze(['start', 'cancel', 'sign-out']);

/**
 * The closed bodies of the GitHub sign-in route: the operation alone.
 * @param {unknown} value
 * @returns {'start' | 'cancel' | 'sign-out'}
 */
function parseGitHubSessionBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1
    || !GITHUB_SESSION_OPS.includes(/** @type {any} */ (value).op)) {
    throw new NeedsYouError('invalid_input', 400);
  }
  return /** @type {any} */ (value).op;
}

/**
 * The workspace-changing actions an old Canvas stops at the update write gate:
 * every Needs You response, capture and Review write, imports, saved sources
 * and pack actions.
 */
const GATED_ROUTES = Object.freeze([
  '/api/needs-you/respond', '/api/needs-you/capture-receipt', '/api/needs-you/capture',
  '/api/needs-you/review/open', '/api/needs-you/review/save', '/api/needs-you/review/seal',
  ...Object.keys(PROVIDER_REQUEST_ROUTES), SOURCES_ROUTE, ACTION_ROUTE,
]);

/**
 * Admitted Canvas workspace changes, in any Canvas of this process, that can
 * still commit without asking the update write gate again: a Needs You action
 * or an import request from its admission, a pack removal from its start, and a
 * pack install or refresh once its write gate said go. OK is refused as `busy`
 * while one holds a slot. A source change holds none, because its last gate
 * check comes immediately before its synchronous save. Like the gate, this is
 * in-process only.
 */
let committing = 0;

/**
 * Hold one commit slot until the returned function releases it, once.
 * @returns {() => void}
 */
function holdCommit() {
  committing += 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    committing -= 1;
  };
}

/**
 * The update write gate's refusal of a workspace-changing action, or null while
 * the gate is open. Each action asks when its request arrives, again once its
 * body is read, and at its last check before it writes.
 * @param {CanvasInstance} instance
 * @returns {'update_in_progress' | 'new_session_required' | null}
 */
function gateRefusal(instance) {
  const gate = instance.updates?.gate ?? 'open';
  return gate === 'open' ? null : gate === 'applying' ? 'update_in_progress' : 'new_session_required';
}

/** Refuse a workspace-changing action once an update was admitted. @param {CanvasInstance} instance */
function requireOpenWriteGate(instance) {
  const refusal = gateRefusal(instance);
  if (refusal) throw new UpdateError(refusal);
}

/** @param {unknown} value */
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

/** The inert page's whole style: Fluent's page colors and type, or the GitHub app's while following it. */
const INERT_STYLE = [
  ':root{color-scheme:light dark}',
  'body{margin:0;background:#ffffff;color:#242424;font-family:"Segoe UI","Segoe UI Web (West European)",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",sans-serif;font-size:14px;line-height:20px}',
  '@media (prefers-color-scheme:dark){body{background:#292929;color:#ffffff}}',
  ':root[data-dude-follow-app-theme="true"] body{background:var(--background-color-default,Canvas);color:var(--text-color-default,CanvasText);font-family:var(--font-sans,"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",sans-serif)}',
  'main{box-sizing:border-box;max-width:76ch;padding:24px;display:flex;flex-direction:column;gap:12px;overflow-wrap:anywhere}',
  'p,h1,ul{margin:0}',
  '.eyebrow{font-size:12px;line-height:16px;color:#616161}',
  '@media (prefers-color-scheme:dark){.eyebrow{color:#adadad}}',
  ':root[data-dude-follow-app-theme="true"] .eyebrow{color:inherit}',
  'h1{font-size:20px;line-height:28px;font-weight:600}',
  'code{font-family:Consolas,"Courier New",Courier,monospace;font-size:12px}',
  'ul{padding-left:20px}',
  '@media (max-width:479px){main{padding:16px 8px}}',
].join('\n');

/**
 * The page an old Canvas serves once an update has started writing: inert, with
 * no script and no application bundle, built by this process's own code rather
 * than read from the files the update may have replaced. Its words follow this
 * session's update: applying, installed, restored, or restoration unconfirmed
 * with the paths to inspect. Below them come the outcome's cleanup sentence and
 * every temporary folder this session kept, with why: after a reload this page
 * is the only one the old session can show.
 * @param {any} state the update controller's state
 * @param {boolean} followAppTheme
 */
function inertPage(state, followAppTheme) {
  const update = state.update ?? {};
  const code = (/** @type {unknown} */ value) => `<code>${escapeHtml(value)}</code>`;
  /** @type {string} */
  let title;
  /** @type {string[]} */
  let body;
  if (update.phase === 'applied') {
    title = `Start a new session to use Dude ${escapeHtml(update.toRef)}`;
    body = [
      `<p>Dude ${escapeHtml(update.toRef)} is installed in this project, but this session still runs ${escapeHtml(state.runningRef ?? update.fromRef)}. Canvas can't be used in this session anymore.</p>`,
      `<p>The changes are uncommitted on ${code(update.branch)}. Review and commit them when you're ready.</p>`,
    ];
  } else if (update.phase === 'restored') {
    title = 'Start a new session to keep using Canvas';
    body = ['<p>The update didn\'t finish, and Dude restored your files. Canvas stops in a session once an update starts writing files.</p>'];
  } else if (update.phase === 'restoration_unconfirmed') {
    const paths = Array.isArray(update.paths) ? update.paths : [];
    title = 'Start a new session to keep using Canvas';
    body = paths.length > 0 ? [
      '<p>The update didn\'t finish, and Dude couldn\'t confirm that these files were put back:</p>',
      `<ul>${paths.map(file => `<li>${code(file)}</li>`).join('')}</ul>`,
      '<p>Inspect them before you start a new session, for example with git status.</p>',
    ] : ['<p>The update didn\'t finish, and Dude couldn\'t confirm that your files were put back. Inspect them before you start a new session, for example with git status.</p>'];
  } else {
    title = 'Dude is updating this project';
    body = ['<p>Canvas can\'t be used while the update writes and checks files. Reload this page to see the result.</p>'];
  }
  if (typeof update.cleanup === 'string' && update.cleanup) body.push(`<p>${escapeHtml(update.cleanup)}</p>`);
  const kept = Array.isArray(state.kept) ? state.kept : [];
  if (kept.length > 0) {
    body.push(
      '<p>Dude kept these temporary folders because it couldn\'t confirm that they were cleaned up:</p>',
      `<ul>${kept.map((/** @type {any} */ entry) => `<li>${code(entry.root)}: ${escapeHtml(entry.reason)}</li>`).join('')}</ul>`,
      '<p>Remove them yourself once nothing uses them.</p>',
    );
  }
  return [
    '<!doctype html>',
    `<html lang="en" data-dude-follow-app-theme="${followAppTheme}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<title>Dude</title>',
    `<style>\n${INERT_STYLE}\n</style>`,
    '</head>',
    '<body>',
    '<main aria-labelledby="handoff-title">',
    '<p class="eyebrow">Dude</p>',
    `<h1 id="handoff-title">${title}</h1>`,
    ...body,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * @typedef {object} CanvasInstance
 * @property {string} instanceId
 * @property {import('node:http').Server} server
 * @property {string} url
 * @property {Set<import('node:http').ServerResponse>} eventClients
 * @property {(message: string) => Promise<void>} log
 * @property {unknown} projection
 * @property {{root:string,target?:string}|null} readInput
 * @property {unknown} freshness
 * @property {AbortSignal} signal
 * @property {ReturnType<import('./needs-you.mjs').createNeedsYou>|null} needsYou
 * @property {(()=>void)|null} unsubscribeNeedsYou
 * @property {PackReadSlot|null} packRead The coalesced automatic read: installed packs, sources and project rows.
 * @property {PackReadSlot|null} catalogRead The coalesced explicit discovery, which also acquires catalogs.
 * @property {PackToken|null} packToken The one pack action token: the last unblocked preview's, until used or replaced.
 * @property {PackApply|null} packApply The one pack action apply that runs, if any.
 * @property {ReturnType<import('./bundle-upgrade.mjs').createBundleUpgrade>|null} updates The extension's one update controller.
 * @property {(()=>void)|null} unsubscribeUpdates
 * @property {ReturnType<import('./github-session.mjs').createGitHubSession>|null} githubSession The extension's one GitHub sign-in.
 * @property {(()=>void)|null} unsubscribeGitHub
 */
/**
 * One coalesced pack read. `forgotten` is the signal of the GitHub access a
 * discovery was given, or null for a read given none. A discovery's answer
 * also names `githubLogin`, the allowance that access belongs to (089).
 * @typedef {{root:string,controller:AbortController,readers:number,forgotten:AbortSignal|null,
 *   promise:Promise<Awaited<ReturnType<typeof readPacks>> & {project: Awaited<ReturnType<typeof readProjectArtifacts>>,
 *   githubLogin?: string | null}>}} PackReadSlot
 */
/** @typedef {import('../../../skills/dude-engine/lib/github-content.mjs').GitHubAccess} GitHubAccess */
/**
 * A Canvas pack read's GitHub access, its `forgotten` signal, and `login`: the
 * public login of the account whose allowance the read uses, or null for the
 * anonymous allowance (089). It words a rate limit the read meets.
 * @typedef {{ github: GitHubAccess | null, forgotten: AbortSignal | null, login: string | null }} SessionAccess
 */
/**
 * A preview's single-use token and what it binds: the operation and pack, the
 * workspace revision (root, profile and saved sources), and the source key,
 * resolved identity and child kind of the preview.
 * @typedef {{ token: string, operation: 'install' | 'remove' | 'refresh', name: string, revision: string,
 *   binding: import('./packs.mjs').PackBinding }} PackToken
 */
/**
 * @typedef {{ token: string, went: boolean, changed: boolean, refused: 'update_in_progress' | 'new_session_required' | null,
 *   cancel: () => void, promise: Promise<unknown> | null }} PackApply
 */

/**
 * Open instances keyed by host `instanceId`. Each entry owns its in-flight
 * startup and every acquisition for the resulting server.
 * @type {Map<string, {pending:Promise<CanvasInstance>,controller:AbortController}>}
 */
const instances = new Map();

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 */
function sendJson(res, status, value) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

/** A pack read given no GitHub access, which sign-out never stops. @type {SessionAccess} */
const NO_GITHUB = Object.freeze({ github: null, forgotten: null, login: null });

/**
 * This session's GitHub access for one Canvas pack read that may read GitHub: a
 * discovery, a source being added, and an install's or a refresh's preview and
 * apply. The read passes both to `packs.mjs`, which gives the access only to a
 * child that reads GitHub and stops that child once `forgotten` aborts. Sign-out
 * and the session's end also stop the whole read (see `untilSignedOut`).
 * Signed out, or without the controller, the read is anonymous. The login is
 * read in the same step as the access, so a rate limit the read meets is worded
 * for the allowance it was given, not for what a page last saw of the sign-in.
 * @param {CanvasInstance} instance
 * @returns {SessionAccess}
 */
function githubAccess(instance) {
  const session = instance.githubSession;
  if (!session) return NO_GITHUB;
  const access = session.current();
  return access.github ? { ...access, login: session.read().login } : NO_GITHUB;
}

/**
 * For each access's `forgotten` signal, the one that aborts only when sign-out
 * or the session's end forgot that access, and not when GitHub rejected it. One
 * is made per access, so a sign-in that serves many reads adds one listener to
 * its signal, and the pair goes with that access.
 * @type {WeakMap<AbortSignal, AbortSignal>}
 */
const signedOutSignals = new WeakMap();

/**
 * `signals` joined with sign-out and the session's end, which stop a Canvas read
 * given `access` as Cancel would, including any folder it also reads; once a pack
 * action's write gate said go, nothing stops it. GitHub rejecting the access is
 * not joined: it stops only the children that still read GitHub with it, each of
 * which answers `credential_rejected`, while the rest of the read goes on to
 * answer every other source (see packs.mjs).
 * @param {SessionAccess} access
 * @param {...AbortSignal} signals
 */
function untilSignedOut(access, ...signals) {
  const { forgotten } = access;
  if (!forgotten) return AbortSignal.any(signals);
  let signedOut = signedOutSignals.get(forgotten);
  if (!signedOut) {
    const ended = new AbortController();
    const end = () => { if (forgotten.reason !== CREDENTIAL_REJECTED) ended.abort(forgotten.reason); };
    if (forgotten.aborted) end();
    else forgotten.addEventListener('abort', end, { once: true });
    signedOut = ended.signal;
    signedOutSignals.set(forgotten, signedOut);
  }
  return AbortSignal.any([...signals, signedOut]);
}

/**
 * A read that GitHub refused because it rejected the access the read was given:
 * the session forgets that access, if it is still the current one, before the
 * read's answer is sent, and a discovery reports it as each reader answers (see
 * `readInstalledSurface`). A rate limit, or any other refusal, keeps it.
 * @param {CanvasInstance} instance
 * @param {GitHubAccess | null} github
 * @param {unknown} reason
 */
function reportRefusal(instance, github, reason) {
  if (github && reason === 'credential_rejected') instance.githubSession?.rejected(github);
}

/**
 * The server is loopback-only, so refuse requests a browser marks as coming
 * from another site, requests aimed at a non-loopback host name, and requests
 * that declare a foreign `Origin`.
 *
 * Fetch metadata is not universal, so `Origin` is judged on its own rather than
 * only as a cross-check of `Sec-Fetch-Site`. The renderer's own origin is this
 * instance's already-validated loopback `Host`; an absent `Origin` stays
 * acceptable because same-origin `GET` navigations and `EventSource` omit it.
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
export function isTrustedRequest(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;

  const host = String(req.headers.host ?? '');
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) return false;

  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  if (Number(req.headers['content-length'] ?? 0) > limit) throw new NeedsYouError('invalid_input', 413);
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new NeedsYouError('invalid_input', 413);
    chunks.push(chunk);
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new NeedsYouError('invalid_input', 400); }
  return JSON.parse(text);
}

/**
 * Refresh accepts no fields except an optional exact target. An empty body
 * means refresh the current selection.
 * @param {import('node:http').IncomingMessage} req
 */
async function readRefreshTarget(req) {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error('request body too large');
  if (declared === 0 && !req.headers['transfer-encoding']) return undefined;
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('refresh body must be an object');
  }
  const keys = Object.keys(body);
  if (keys.some((key) => key !== 'target')
    || ('target' in body && typeof body.target !== 'string')) {
    throw new Error('refresh body is not allowlisted');
  }
  return 'target' in body && typeof body.target === 'string' ? body.target : undefined;
}

/**
 * The project agents and skills are a projection beside the pack read, not part
 * of it. A failed scan is its own coverage and never discards the packs; only
 * cancellation, which ends the whole coalesced read, propagates.
 * @param {CanvasInstance} instance
 * @param {string} root
 * @param {AbortSignal} signal
 * @returns {Promise<Awaited<ReturnType<typeof readProjectArtifacts>>>}
 */
async function readProject(instance, root, signal) {
  try {
    return await readProjectArtifacts(root, signal);
  } catch (error) {
    signal.throwIfAborted();
    // Filesystem outcomes are already coverage; only a defect reaches this point.
    await instance.log(`Dude canvas ${instance.instanceId}: the project agent and skill read failed (${error instanceof Error ? error.name : 'unknown'}).`);
    return {
      coverage: { state: /** @type {const} */ ('unavailable'), reason: 'project_unavailable',
        message: 'The project agent and skill read failed. Reload to try again.' },
      items: null,
    };
  }
}

/**
 * The one coalesced Installed read: the pack authority plus the separate
 * project projection, under one signal. The project scan starts no process and
 * runs beside the pack read. An automatic read acquires no catalog; an explicit
 * discovery acquires the default, the bundle upstream too while a local library
 * is the default, and each saved source, once.
 *
 * This settles only once both children have settled. A cancelled pack read still
 * owns its reader process tree and temporary root until its bounded stop
 * finishes, and close and replacement reads wait on this promise for that,
 * however quickly the scan noticed the cancellation.
 *
 * A pack read failure of any kind rejects with that same failure. It discards
 * the whole result, so it also aborts the sibling scan: the scan stops at its
 * next cancellation check instead of running on while the failure waits for it.
 *
 * A discovery passes `access`, this session's GitHub access, to its readers.
 * When GitHub rejects that access for one source, the session forgets it as that
 * reader answers, before another reader can start: every GitHub reader still
 * reading or waiting with it stops and answers `credential_rejected`, while the
 * folders, the project scan and the read itself go on, so the read answers every
 * source. Its answer names `githubLogin`, the login of the allowance its readers
 * used, or null for the anonymous allowance, so every request that joins the
 * read is told the allowance the read actually used.
 * @param {CanvasInstance} instance
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {boolean} discover
 * @param {SessionAccess} [access]
 */
async function readInstalledSurface(instance, root, signal, discover, access = NO_GITHUB) {
  const stopScan = new AbortController();
  const packRead = readPacks(root, signal, discover
    ? { discover: true, github: access.github, forgotten: access.forgotten,
      rejected: github => reportRefusal(instance, github, 'credential_rejected') }
    : { catalog: false, sources: true });
  void packRead.catch(() => stopScan.abort());
  const [packs, project] = await Promise.allSettled([
    packRead,
    readProject(instance, root, AbortSignal.any([signal, stopScan.signal])),
  ]);
  if (packs.status === 'rejected') throw packs.reason;
  if (project.status === 'rejected') throw project.reason;
  return { ...packs.value, project: project.value, ...(discover ? { githubLogin: access.login } : {}) };
}

/**
 * One closed body of the pack action route (see `ACTION_ROUTE`). The preview's
 * token binds what the apply must still find, and is spent before anything else
 * happens. The child's write gate answers go only while the workspace is still
 * the previewed one, nothing was cancelled, the Canvas lifetime goes on and no
 * update was admitted. An apply that may write holds a commit slot until it
 * ends (see `committing`).
 * @param {CanvasInstance} instance
 * @param {import('node:http').ServerResponse} res
 * @param {ReturnType<typeof parseActionBody>} body
 */
async function handlePackAction(instance, res, body) {
  const provider = /** @type {NonNullable<CanvasInstance['needsYou']>} */ (instance.needsYou);
  const root = /** @type {NonNullable<CanvasInstance['readInput']>} */ (instance.readInput).root;
  /** Root and lifetime, checked as the sources route checks them. */
  const current = () => {
    if (instance.signal.aborted || instance.readInput?.root !== root || !provider.matchesRoot(root)) {
      throw new NeedsYouError('identity_mismatch');
    }
  };
  current();
  // Admitted only now that its body is read: an update may have been admitted meanwhile.
  requireOpenWriteGate(instance);
  if (body.op === 'cancel') {
    const running = instance.packApply;
    if (instance.packToken?.token === body.token) instance.packToken = null;
    else if (running?.token === body.token && !running.went) running.cancel();
    else {
      sendJson(res, 409, { error: 'too_late' });
      return;
    }
    sendJson(res, 200, { cancelled: true });
    return;
  }
  // A browser that goes away cancels what has not started writing.
  const disconnected = new AbortController();
  const onClose = () => disconnected.abort();
  res.once('close', onClose);
  try {
    if (body.op === 'preview') {
      const revision = packActionRevision(root);
      // An install or a refresh reads its source; a removal reads none.
      const access = body.operation === 'remove' ? NO_GITHUB : githubAccess(instance);
      const { outcome, binding } = await runPackAction(root, untilSignedOut(access, instance.signal, disconnected.signal),
        { op: 'preview', operation: body.operation, name: body.name, source: body.source },
        { github: access.github, forgotten: access.forgotten });
      if (!outcome.ok) reportRefusal(instance, access.github, outcome.reason);
      // A cancelled preview's result is discarded.
      if (res.destroyed || disconnected.signal.aborted) return;
      current();
      const preview = outcome.ok ? outcome.result : null;
      const blocked = !binding || preview?.tools?.some((/** @type {any} */ tool) => !tool.found) || preview?.conflicts?.length > 0;
      const token = blocked ? null : randomUUID();
      instance.packToken = token && binding ? { token, operation: body.operation, name: body.name, revision, binding } : null;
      sendJson(res, 200, { token, thirdParty: Boolean(binding?.sourceKey), preview, message: outcome.ok ? null : outcome.error,
        ...(!outcome.ok && outcome.reason ? { reason: outcome.reason } : {}),
        ...(!outcome.ok && outcome.reason === 'rate_limited' ? { githubLogin: access.login } : {}) });
      return;
    }
    if (instance.packApply) {
      sendJson(res, 409, { error: 'busy' });
      return;
    }
    const bound = instance.packToken;
    if (!bound || bound.token !== body.token) {
      sendJson(res, 409, { error: 'changed' });
      return;
    }
    // Single use: the token is spent before anything else can happen.
    instance.packToken = null;
    const unchanged = () => {
      try { return packActionRevision(root) === bound.revision; } catch { return false; }
    };
    if (!unchanged()) {
      sendJson(res, 409, { error: 'changed' });
      return;
    }
    const stop = new AbortController();
    // The apply reads its source again, with this session's access as it is now.
    const access = bound.operation === 'remove' ? NO_GITHUB : githubAccess(instance);
    const signal = untilSignedOut(access, instance.signal, disconnected.signal, stop.signal);
    /** @type {PackApply} */
    const apply = { token: bound.token, went: bound.operation === 'remove', changed: false, refused: null,
      cancel: () => stop.abort(), promise: null };
    // A removal may write from its start; an install or a refresh only once its write gate says go.
    let release = apply.went ? holdCommit() : null;
    try {
      const running = runPackAction(root, signal, { op: 'apply', operation: bound.operation, name: bound.name, binding: bound.binding }, {
        github: access.github,
        forgotten: access.forgotten,
        gate: () => {
          if (signal.aborted) return false;
          const refusal = gateRefusal(instance);
          if (refusal) { apply.refused = refusal; return false; }
          try { current(); } catch { apply.changed = true; return false; }
          if (!unchanged()) { apply.changed = true; return false; }
          apply.went = true;
          release = holdCommit();
          return true;
        },
      });
      apply.promise = running;
      instance.packApply = apply;
      const { outcome } = await running;
      const stopped = signal.aborted;
      if (!outcome.ok) reportRefusal(instance, access.github, outcome.reason);
      if (res.destroyed) return;
      if (!apply.went && apply.refused) sendJson(res, 409, { error: apply.refused });
      else if (!apply.went && apply.changed) sendJson(res, 409, { error: 'changed' });
      else if (!apply.went && stopped) sendJson(res, 409, { error: 'cancelled' });
      else sendJson(res, 200, !outcome.ok && outcome.reason === 'rate_limited' ? { ...outcome, githubLogin: access.login } : outcome);
    } finally {
      release?.();
      if (instance.packApply === apply) instance.packApply = null;
    }
  } finally { res.off('close', onClose); }
}

/**
 * The two update routes (see `UPDATES_ROUTE`). The shared Host/Origin guard has
 * already run, and its opaque Review exception never reaches them.
 * @param {CanvasInstance} instance
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 */
async function handleUpdates(instance, req, res, pathname) {
  const read = pathname === UPDATES_ROUTE;
  if (req.url !== pathname || req.method !== (read ? 'GET' : 'POST')) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }
  if (read && (Number(req.headers['content-length'] ?? 0) !== 0 || req.headers['transfer-encoding'])) {
    sendJson(res, 400, { error: 'invalid_input' });
    return;
  }
  if (!read && req.headers.origin !== new URL(instance.url).origin) {
    sendJson(res, 403, { error: 'Same-origin action required.' });
    return;
  }
  if (!read && req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    sendJson(res, 415, { error: 'JSON action required.' });
    return;
  }
  const updates = instance.updates;
  const root = instance.readInput?.root;
  if (!updates || !root) {
    sendJson(res, 503, UPDATES_UNAVAILABLE);
    return;
  }
  /** Root and lifetime, checked as the other workspace routes check them. */
  const current = () => {
    if (instance.signal.aborted || instance.readInput?.root !== root || !updates.matchesRoot(root)) {
      throw new UpdateError('identity_mismatch');
    }
  };
  try {
    const body = read ? null : parseUpdateBody(await readJsonBody(req));
    current();
    let state;
    if (!body) state = await updates.read();
    else if (body.op === 'check') state = await updates.check();
    else if (body.op === 'later') state = await updates.later();
    else if (body.op === 'cancel') state = await updates.cancel();
    else if (body.op === 'preview') state = await updates.preview({ includePacks: body.includePacks, owner: instance.instanceId });
    else {
      // Another Canvas change of this process that can still write is let finish first.
      if (committing > 0) throw new UpdateError('busy');
      state = await updates.apply({ id: body.id });
    }
    if (res.destroyed) return;
    // A read is delivered only to the still-current workspace; an action's result is its own.
    if (read) current();
    sendJson(res, 200, state);
  } catch (error) {
    if (res.headersSent || res.destroyed) return;
    if (error instanceof UpdateError) sendJson(res, error.status, { error: error.code });
    else if (error instanceof NeedsYouError || error instanceof SyntaxError) {
      sendJson(res, error instanceof NeedsYouError ? error.status : 400, { error: 'invalid_input' });
    } else sendJson(res, 503, UPDATES_UNAVAILABLE);
  }
}

/**
 * The GitHub sign-in route (see `GITHUB_SESSION_ROUTE`). The shared Host/Origin
 * guard has already run, and its opaque Review exception never reaches it. Any
 * Canvas with the controller answers, bound to a workspace or not.
 * @param {CanvasInstance} instance
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleGitHubSession(instance, req, res) {
  const read = req.method === 'GET';
  if (req.url !== GITHUB_SESSION_ROUTE || (!read && req.method !== 'POST')) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }
  if (read && (Number(req.headers['content-length'] ?? 0) !== 0 || req.headers['transfer-encoding'])) {
    sendJson(res, 400, { error: 'invalid_input' });
    return;
  }
  if (!read && req.headers.origin !== new URL(instance.url).origin) {
    sendJson(res, 403, { error: 'Same-origin action required.' });
    return;
  }
  if (!read && req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    sendJson(res, 415, { error: 'JSON action required.' });
    return;
  }
  const session = instance.githubSession;
  if (!session) {
    sendJson(res, 503, { error: 'github_session_unavailable' });
    return;
  }
  let op = null;
  if (!read) {
    try { op = parseGitHubSessionBody(await readJsonBody(req)); }
    catch (error) {
      if (!res.headersSent && !res.destroyed) {
        sendJson(res, error instanceof NeedsYouError ? error.status : 400, { error: 'invalid_input' });
      }
      return;
    }
  }
  const state = op === 'start' ? session.start() : op === 'cancel' ? session.cancel()
    : op === 'sign-out' ? session.signOut() : session.read();
  if (!res.destroyed) sendJson(res, 200, state);
}

/**
 * @param {CanvasInstance} instance
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleRequest(instance, req, res) {
  const { pathname } = new URL(req.url ?? '/', instance.url);

  // The update write gate: from an admitted update apply, this Canvas serves
  // none of its interface assets, which the update may be replacing, and admits
  // no workspace-changing action. A reload gets the inert page instead. An
  // apply the engine refused before writing reopens the gate; any write
  // attempt keeps it closed for this process. Each action asks the gate again
  // once its body is read, and at its last check before it writes.
  const refusal = gateRefusal(instance);
  if (refusal) {
    if (Object.hasOwn(ASSET_ROUTES, pathname) || Object.hasOwn(REVIEW_ASSET_ROUTES, pathname)) {
      if (req.method !== 'GET' || pathname !== '/') {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }
      const [state, read] = await Promise.all([/** @type {NonNullable<CanvasInstance['updates']>} */ (instance.updates).read(), readCanvasPreferences()]);
      res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" });
      res.end(inertPage(state, !('error' in read) && read.followAppTheme));
      return;
    }
    if (req.method === 'POST' && GATED_ROUTES.includes(pathname)) {
      sendJson(res, 409, { error: refusal });
      return;
    }
  }

  if (pathname === UPDATES_ROUTE || pathname === UPDATES_ACTION_ROUTE) {
    await handleUpdates(instance, req, res, pathname);
    return;
  }

  if (pathname === GITHUB_SESSION_ROUTE) {
    await handleGitHubSession(instance, req, res);
    return;
  }

  if (instance.needsYou && req.method === 'GET' && req.url === pathname
    && pathname.startsWith('/review-source/')) {
    const match = /^\/review-source\/([a-f0-9-]{36})\/(.+)$/.exec(pathname);
    if (!match) { sendJson(res, 404, { error: 'Not found.' }); return; }
    const file = await instance.needsYou.readReviewResource(match[1], pathname, {
      signal: instance.signal, origin: new URL(instance.url).origin,
    });
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': file.mime,
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*',
      ...(file.csp ? { 'Content-Security-Policy': file.csp } : {}) });
    res.end(file.bytes);
    return;
  }

  if (instance.needsYou && pathname.startsWith('/api/needs-you')) {
    if (req.method === 'GET' && pathname === '/api/needs-you/review/history') {
      const query = new URL(req.url, instance.url).searchParams;
      const keys = [...query.keys()];
      if (req.url.split('?', 1)[0] !== pathname || req.url.includes('#')
        || req.url.length > MAX_BODY_BYTES || !query.has('ideaPath') || !query.has('specPath')
        || keys.some(key => !['ideaPath', 'specPath', 'submissionId'].includes(key))
        || new Set(keys).size !== keys.length) {
        sendJson(res, 400, { error: 'invalid_input' });
        return;
      }
      sendJson(res, 200, await instance.needsYou.readReviewHistory({
        scope: { kind: 'feature', ideaPath: query.get('ideaPath'), specPath: query.get('specPath') },
        ...(query.has('submissionId') ? { submissionId: query.get('submissionId') } : {}),
      }, { signal: instance.signal }));
      return;
    }
    // No URL normalization, query parameters, arbitrary actions, or absent-Origin
    // mutation allowance on the handoff surface.
    if (req.url !== pathname) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    const provider = instance.needsYou;
    if (req.method === 'GET' && pathname === '/api/needs-you') {
      sendJson(res, 200, await provider.refresh());
      return;
    }
    if (req.method === 'POST' && [
      '/api/needs-you/respond',
      '/api/needs-you/capture-receipt',
      '/api/needs-you/capture',
      '/api/needs-you/review/open',
      '/api/needs-you/review/save',
      '/api/needs-you/review/seal',
    ].includes(pathname)) {
      if (req.headers.origin !== new URL(instance.url).origin) {
        sendJson(res, 403, { error: 'Same-origin action required.' });
        return;
      }
      if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        sendJson(res, 415, { error: 'JSON action required.' });
        return;
      }
      const isReview = pathname.startsWith('/api/needs-you/review/');
      const body = await readJsonBody(req, isReview ? REVIEW_LIMITS.bodyBytes : NEEDS_YOU_LIMITS.bodyBytes);
      // Admitted only now that its body is read; it may write until it ends, so OK waits for it.
      requireOpenWriteGate(instance);
      const release = holdCommit();
      try {
        const reviewOptions = { signal: instance.signal, origin: new URL(instance.url).origin };
        let result;
        if (pathname === '/api/needs-you/review/open') result = await provider.openReview(body, reviewOptions);
        else if (pathname === '/api/needs-you/review/save') result = await provider.saveReview(body, reviewOptions);
        else if (pathname === '/api/needs-you/review/seal') result = await provider.sealReview(body, reviewOptions);
        else {
          result = pathname === '/api/needs-you/respond'
            ? await provider.respond(body, { signal: instance.signal })
            : pathname === '/api/needs-you/capture-receipt'
              ? await provider.issueCaptureReceipt(body)
              : await provider.captureIdea(body, { signal: instance.signal });
        }
        sendJson(res, 202, result);
      } finally { release(); }
      return;
    }
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }

  const assets = Object.hasOwn(ASSET_ROUTES, pathname) ? ASSET_ROUTES
    : instance.needsYou && req.url === pathname && Object.hasOwn(REVIEW_ASSET_ROUTES, pathname) ? REVIEW_ASSET_ROUTES : null;
  if (req.method === 'GET' && assets) {
    const file = resolveMutationPath(UI_ROOT, assets[pathname]);
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': ASSET_MIME_TYPES[pathname],
      // The parent's policy also bounds an opaque review frame's self-navigation.
      'Content-Security-Policy': `frame-src ${new URL(instance.url).origin}/review-source/`,
      ...(pathname.startsWith('/review/') ? { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } : {}) });
    res.end(pathname === '/' ? bootstrapPage(await readFile(file, 'utf8'), await readCanvasPreferences())
      : await readFile(file));
    return;
  }

  if (req.method === 'GET' && pathname === '/events') {
    res.writeHead(200, {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    });
    res.write(': connected\n\n');
    instance.eventClients.add(res);
    req.on('close', () => instance.eventClients.delete(res));
    await instance.log(`Dude canvas ${instance.instanceId}: renderer attached.`);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/projection') {
    sendJson(res, 200, { projection: instance.projection, freshness: instance.freshness });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/work-index' && instance.readInput) {
    sendJson(res, 200, await readWorkIndex({ root: instance.readInput.root }, { signal: instance.signal }));
    return;
  }

  if (Object.hasOwn(PROVIDER_REQUEST_ROUTES, pathname) && instance.readInput && instance.needsYou) {
    if (req.method !== 'POST' || req.url !== pathname) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (req.headers.origin !== new URL(instance.url).origin) {
      sendJson(res, 403, { error: 'Same-origin action required.' });
      return;
    }
    if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      sendJson(res, 415, { error: 'JSON action required.' });
      return;
    }
    const provider = instance.needsYou;
    const body = await readJsonBody(req, NEEDS_YOU_LIMITS.bodyBytes);
    if (instance.signal.aborted || !provider.matchesRoot(instance.readInput.root)) throw new NeedsYouError('identity_mismatch');
    // Admitted only now that its body is read; it may hand off until it ends, so OK waits for it.
    requireOpenWriteGate(instance);
    const release = holdCommit();
    // Only a provider-issued prepare/submit receipt crosses this boundary.
    // The import's preview, consent, and all writes remain with the owner.
    try {
      sendJson(res, 202, await provider[PROVIDER_REQUEST_ROUTES[pathname]](body, { signal: instance.signal }));
    } finally { release(); }
    return;
  }

  if (pathname === SOURCES_ROUTE && instance.readInput && instance.needsYou) {
    // The one direct configuration write. It adds no Needs You class and no
    // idle-consent gate, and it runs no import or pack: it saves or removes one
    // validated entry of the project's sources file. Same guards as the provider
    // routes; its refusals are all explicit and none saves anything.
    if (req.method !== 'POST' || req.url !== pathname) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (req.headers.origin !== new URL(instance.url).origin) {
      sendJson(res, 403, { error: 'Same-origin action required.' });
      return;
    }
    if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      sendJson(res, 415, { error: 'JSON action required.' });
      return;
    }
    const provider = instance.needsYou;
    const body = parseSourceBody(await readJsonBody(req, NEEDS_YOU_LIMITS.bodyBytes));
    const root = instance.readInput.root;
    /** Root and lifetime, checked again immediately before anything is saved. */
    const current = () => {
      if (instance.signal.aborted || instance.readInput?.root !== root || !provider.matchesRoot(root)) {
        throw new NeedsYouError('identity_mismatch');
      }
    };
    current();
    // Admitted only now that its body is read. It holds no commit slot: the
    // update write gate is asked again immediately before its synchronous save.
    requireOpenWriteGate(instance);
    // A browser that goes away stops the read, and nothing is saved after that.
    const disconnected = new AbortController();
    const onClose = () => disconnected.abort();
    res.once('close', onClose);
    // Only an addition reads a source, so only it is given this session's GitHub access.
    const access = body.op === 'add' ? githubAccess(instance) : NO_GITHUB;
    // Sign-out stops the read; GitHub rejecting the access is the read's own refusal.
    const signal = untilSignedOut(access, instance.signal, disconnected.signal);
    try {
      const beforeCommit = () => {
        current();
        requireOpenWriteGate(instance);
      };
      const result = body.op === 'add'
        ? await addPackSource(root, signal, body, { beforeCommit, github: access.github, forgotten: access.forgotten })
        : await removePackSource(root, signal, body, { beforeCommit });
      if (!result.ok) reportRefusal(instance, access.github, result.code);
      if (res.destroyed) return;
      if (result.ok) {
        const { ok, ...saved } = result;
        sendJson(res, 200, saved);
      } else {
        const { ok, code, message, ...rest } = result;
        sendJson(res, /** @type {Record<string, number>} */ (SOURCE_REFUSAL_STATUS)[code] ?? 409, { error: code, message, ...rest,
          ...(code === 'rate_limited' ? { githubLogin: access.login } : {}) });
      }
    } catch (error) {
      if (res.destroyed || disconnected.signal.aborted) return;
      // The sign-in this read was given ended while it ran: an honest stop, with nothing saved.
      if (signal.aborted && !instance.signal.aborted) {
        sendJson(res, 409, { error: 'cancelled', message: SOURCE_READ_SIGNED_OUT });
        return;
      }
      throw error;
    } finally { res.off('close', onClose); }
    return;
  }

  if (pathname === ACTION_ROUTE && instance.readInput && instance.needsYou) {
    // One Compose preview or apply, behind the sources route's guards.
    if (req.method !== 'POST' || req.url !== pathname) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (req.headers.origin !== new URL(instance.url).origin) {
      sendJson(res, 403, { error: 'Same-origin action required.' });
      return;
    }
    if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      sendJson(res, 415, { error: 'JSON action required.' });
      return;
    }
    await handlePackAction(instance, res, parseActionBody(await readJsonBody(req)));
    return;
  }

  if (req.method === 'GET' && (req.url === PACKS_ROUTE || req.url === PACKS_DISCOVERY_URL) && instance.readInput) {
    if (Number(req.headers['content-length'] ?? 0) !== 0 || req.headers['transfer-encoding']) {
      sendJson(res, 400, { error: 'Pack reads do not accept a body.' });
      return;
    }
    const root = instance.readInput.root;
    const discover = req.url === PACKS_DISCOVERY_URL;
    const slot = discover ? 'catalogRead' : 'packRead';
    let pending = instance[slot];
    // A cancelled read still owns its reader process tree and temporary root
    // until its bounded stop and removal finish. Do not let rapid abort/reload
    // cycles overlap them. A discovery whose GitHub access sign-out or the
    // session's end forgot is stopping too, so a read after sign-out never joins
    // it. One whose access GitHub rejected still answers its own readers, so a
    // later read waits for it without ending it, and then reads afresh.
    while (pending && (pending.controller.signal.aborted || pending.forgotten?.aborted || pending.root !== root)) {
      if (pending.root !== root || pending.forgotten?.reason !== CREDENTIAL_REJECTED) pending.controller.abort();
      await pending.promise.catch(() => null);
      pending = instance[slot];
    }
    if (res.destroyed) return;
    if (instance.signal.aborted) {
      sendJson(res, 503, { error: 'packs_unavailable', message: 'The Canvas lifetime ended during the pack read.' });
      return;
    }
    if (!pending) {
      const controller = new AbortController();
      // Only a discovery acquires catalogs, so only it is given this session's GitHub access.
      const access = discover ? githubAccess(instance) : NO_GITHUB;
      // One pack-plus-project read per coalesced operation, not one per subscriber.
      const promise = readInstalledSurface(instance, root, untilSignedOut(access, instance.signal, controller.signal), discover,
        access);
      pending = { root, controller, readers: 0, forgotten: access.forgotten, promise };
      instance[slot] = pending;
      const owned = pending;
      const forget = () => { if (instance[slot] === owned) instance[slot] = null; };
      void promise.then(forget, forget);
    }
    // Coalesce only an in-flight read. The last disconnected reader cancels its
    // acquisition; neither a completed snapshot nor an abandoned fetch is cached.
    const owned = pending;
    owned.readers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (--owned.readers === 0) owned.controller.abort();
    };
    res.once('close', release);
    try {
      const result = await owned.promise;
      if (res.destroyed) return;
      if (instance.signal.aborted || instance.readInput?.root !== root) {
        sendJson(res, 409, { error: 'identity_mismatch', message: 'The workspace or Canvas lifetime changed. Reload to read current packs.' });
      } else sendJson(res, 200, result);
    } catch {
      if (!res.destroyed) sendJson(res, 503, { error: 'packs_unavailable', message: 'The pack read was cancelled or became unavailable.' });
    } finally {
      res.off('close', release);
      release();
    }
    return;
  }

  if (pathname === '/api/about') {
    // Exactly one read-only record per request: no query, suffix, body, root
    // override or alternate method. The shared Host/Origin guard has already
    // run, and its opaque Review exception never reaches this route.
    if (req.method !== 'GET' || req.url !== pathname) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) !== 0 || req.headers['transfer-encoding']) {
      sendJson(res, 400, { error: 'About reads do not accept a body.' });
      return;
    }
    const root = instance.readInput?.root;
    if (!root) {
      sendJson(res, 503, ABOUT_UNAVAILABLE);
      return;
    }
    const record = await readInstallationRecord(root);
    // Deliver only the still-current workspace's record. A lifetime end or a
    // root replacement during the read discards it.
    if (res.destroyed) return;
    if (instance.signal.aborted) sendJson(res, 503, ABOUT_UNAVAILABLE);
    else if (instance.readInput?.root !== root) {
      sendJson(res, 409, { error: 'identity_mismatch', message: 'The workspace changed. Open About again to read it.' });
    } else sendJson(res, 200, record);
    return;
  }

  if (pathname === PREFERENCES_ROUTE) {
    // Any instance answers, bound or not. The shared Host/Origin guard has
    // already run, and its opaque Review exception never reaches this route.
    if (req.url !== pathname || (req.method !== 'GET' && req.method !== 'POST')) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (req.method === 'GET') {
      if (Number(req.headers['content-length'] ?? 0) !== 0 || req.headers['transfer-encoding']) {
        sendJson(res, 400, { error: 'invalid_input' });
        return;
      }
      const read = await readCanvasPreferences();
      sendJson(res, 'error' in read ? 503 : 200, read);
      return;
    }
    if (req.headers.origin !== new URL(instance.url).origin) {
      sendJson(res, 403, { error: 'Same-origin action required.' });
      return;
    }
    if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      sendJson(res, 415, { error: 'JSON action required.' });
      return;
    }
    let patch = null, refusal = 400;
    try { patch = parseCanvasPreferencePatch(await readJsonBody(req)); }
    catch (error) { if (error instanceof NeedsYouError) refusal = error.status; }
    if (!patch) {
      sendJson(res, refusal, { error: 'invalid_input' });
      return;
    }
    // Saving either choice starts no update check.
    const saved = await saveCanvasPreference(patch);
    sendJson(res, !('error' in saved) ? 200 : saved.error === 'preference_unreadable' ? 503 : 500, saved);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/freshness') {
    if (!instance.readInput) {
      sendJson(res, 200, { projection: instance.projection, freshness: instance.freshness });
      return;
    }
    const projection = instance.projection;
    const readInput = instance.readInput;
    const freshness = await checkProjectionFreshness({
      root: readInput.root,
      projection,
    }, { signal: instance.signal });
    void instance.needsYou?.refresh();
    if (instance.projection !== projection) {
      sendJson(res, 200, {
        projection: instance.projection,
        freshness: instance.freshness,
        replaced: false,
      });
      return;
    }
    instance.freshness = freshness;
    sendJson(res, 200, { projection: instance.projection, freshness: instance.freshness });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/refresh') {
    const suppliedTarget = await readRefreshTarget(req);
    if (!instance.readInput) {
      sendJson(res, 200, { projection: instance.projection, freshness: instance.freshness, replaced: false });
      return;
    }
    const projection = instance.projection;
    const readInput = instance.readInput;
    const target = suppliedTarget ?? readInput.target;
    const result = await refreshNowProjection({
      root: readInput.root,
      target,
      previous: projection,
    }, { signal: instance.signal });
    void instance.needsYou?.refresh();
    if (!result || typeof result !== 'object' || !('replaced' in result)
      || typeof result.replaced !== 'boolean' || !('projection' in result) || !('freshness' in result)) {
      throw new Error('projection refresh result is unavailable');
    }
    if (instance.projection !== projection) {
      sendJson(res, 200, {
        projection: instance.projection,
        freshness: instance.freshness,
        replaced: false,
      });
      return;
    }
    if (result.replaced) {
      instance.projection = result.projection;
      instance.readInput = { root: readInput.root, ...(target === undefined ? {} : { target }) };
    }
    instance.freshness = result.freshness;
    sendJson(res, 200, {
      projection: instance.projection,
      freshness: instance.freshness,
      replaced: result.replaced,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/viewport') {
    const body = await readJsonBody(req);
    const width = Math.round(Number(body && typeof body === 'object' && 'width' in body ? body.width : 0) || 0);
    const height = Math.round(Number(body && typeof body === 'object' && 'height' in body ? body.height : 0) || 0);
    await instance.log(`Dude canvas ${instance.instanceId}: host viewport ${width}x${height}.`);
    sendJson(res, 200, { recorded: true, width, height });
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}

/**
 * Logging is evidence, never a reason to fail a request.
 * @param {(message: string) => unknown} log
 * @returns {(message: string) => Promise<void>}
 */
function safeLogger(log) {
  return async (message) => {
    try {
      await log(message);
    } catch {
      // Ignored on purpose: the canvas must keep serving without a session log.
    }
  };
}

/**
 * @param {string} instanceId
 * @param {(message: string) => unknown} log
 * @param {unknown} projection
 * @param {{root:string,target?:string}|null} readInput
 * @param {AbortSignal} signal
 * @param {CanvasInstance['needsYou']} needsYou
 * @param {CanvasInstance['updates']} updates
 * @param {CanvasInstance['githubSession']} githubSession
 * @returns {Promise<CanvasInstance>}
 */
async function startInstance(instanceId, log, projection, readInput, signal, needsYou, updates, githubSession) {
  if (needsYou && (!readInput || !needsYou.matchesRoot(readInput.root))) {
    throw new NeedsYouError('identity_mismatch');
  }
  if (updates && (!readInput || !updates.matchesRoot(readInput.root))) {
    throw new NeedsYouError('identity_mismatch');
  }
  let initialProjection = projection;
  if (initialProjection === null && readInput) {
    initialProjection = await readNowProjection(readInput, { signal });
  }
  if (signal.aborted) throw new Error('canvas startup was cancelled');

  /** @type {CanvasInstance} */
  const instance = {
    eventClients: new Set(),
    instanceId,
    log: safeLogger(log),
    projection: initialProjection,
    readInput,
    freshness: initialProjectionFreshness(initialProjection),
    signal,
    server: createServer(),
    url: '',
    needsYou,
    unsubscribeNeedsYou: null,
    packRead: null,
    catalogRead: null,
    packToken: null,
    packApply: null,
    updates,
    unsubscribeUpdates: null,
    githubSession,
    unsubscribeGitHub: null,
  };

  instance.server.on('request', (req, res) => {
    // Opaque sandbox documents may read ONLY exact review resources/static
    // modules. The null-Origin exception never reaches JSON or mutation routes.
    const sandboxRead = instance.needsYou && req.method === 'GET'
      && (!req.headers.origin || req.headers.origin === 'null')
      && (Object.hasOwn(REVIEW_ASSET_ROUTES, req.url ?? '')
        || /^\/review-source\/[a-f0-9-]{36}\/[^?#]+$/.test(req.url ?? ''));
    if ((!isTrustedRequest(req) && !sandboxRead) || !instance.url || req.headers.host !== new URL(instance.url).host) {
      sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
      return;
    }
    handleRequest(instance, req, res).catch((error) => {
      // Failures on these routes keep the provider's explicit status and closed
      // code, so a possible delivery is never reported as a generic no-change error.
      // The sources route follows the same discipline without any send semantics.
      const sourcesRoute = req.url?.startsWith(SOURCES_ROUTE) ?? false;
      const actionRoute = req.url?.startsWith(ACTION_ROUTE) ?? false;
      const providerRequest = sourcesRoute || actionRoute || Object.keys(PROVIDER_REQUEST_ROUTES).some((route) => req.url?.startsWith(route));
      if (res.headersSent) res.end();
      // The update write gate's refusal, asked again after a gated action was admitted.
      else if (error instanceof UpdateError) sendJson(res, error.status, { error: error.code });
      else if (error instanceof ReviewError && (req.url?.startsWith('/api/needs-you/review/')
        || req.url?.startsWith('/api/needs-you/respond') || req.url?.startsWith('/review-source/'))) {
        sendJson(res, error.status, { error: error.code, message: error.message });
      }
      else if (error instanceof NeedsYouError && (req.url?.startsWith('/api/needs-you') || providerRequest)) {
        sendJson(res, error.status, { error: error.code });
      } else if (providerRequest && error instanceof SyntaxError) {
        sendJson(res, 400, { error: 'invalid_input' });
      } else if (sourcesRoute) {
        sendJson(res, 503, { error: 'sources_unavailable' });
      } else if ((req.url?.startsWith('/api/needs-you') || providerRequest) && !(error instanceof SyntaxError)) {
        sendJson(res, 503, { error: 'provider_unavailable' });
      } else sendJson(res, 400, { error: 'Request failed.' });
    });
  });

  if (signal.aborted) throw new Error('canvas startup was cancelled');
  try {
    await new Promise((resolve, reject) => {
      const failed = (/** @type {Error} */ error) => {
        instance.server.off('listening', listening);
        reject(error);
      };
      const listening = () => {
        instance.server.off('error', failed);
        resolve(undefined);
      };
      instance.server.once('error', failed);
      instance.server.once('listening', listening);
      instance.server.listen(0, '127.0.0.1');
    });
    if (signal.aborted) {
      await stopInstance(instance);
      throw new Error('canvas startup was cancelled');
    }
  } catch (error) {
    if (instance.server.listening) await stopInstance(instance);
    throw error;
  }

  const address = instance.server.address();
  instance.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
  /** Invalidation only: never put answer, consent, intent or update payloads in an SSE log. @param {string} event */
  const invalidate = event => {
    for (const client of instance.eventClients) {
      if (!client.write(`event: ${event}\ndata: {"refresh":true}\n\n`)) {
        instance.eventClients.delete(client);
        client.end();
      }
    }
  };
  instance.unsubscribeNeedsYou = needsYou?.subscribe((hint) => invalidate(hint === 'workspace' ? 'workspace' : 'needs-you')) ?? null;
  instance.unsubscribeUpdates = updates?.subscribe(() => invalidate('updates')) ?? null;
  // Every panel of the session rereads the GitHub sign-in when it changes; no pack read follows.
  instance.unsubscribeGitHub = githubSession?.subscribe(() => invalidate('github-session')) ?? null;
  return instance;
}

/**
 * Idempotent by `instanceId`: re-opening a known instance reuses its server and
 * URL so the host focuses the existing panel instead of starting a second one.
 * @param {string} instanceId
 * @param {(message: string) => unknown} log
 * @param {unknown} [projection] one complete read-only projection
 * @param {{root:string,target?:string}|null} [readInput] canonical refresh input
 * @param {CanvasInstance['needsYou']} [needsYou] shared joined-provider handoff
 * @param {CanvasInstance['updates']} [updates] the extension's one update controller
 * @param {CanvasInstance['githubSession']} [githubSession] the extension's one GitHub sign-in
 * @returns {Promise<CanvasInstance>}
 */
export function openInstance(instanceId, log, projection = null, readInput = null, needsYou = null, updates = null,
  githubSession = null) {
  let entry = instances.get(instanceId);
  if (!entry) {
    const controller = new AbortController();
    const starting = startInstance(instanceId, log, projection, readInput, controller.signal, needsYou, updates, githubSession);
    const ownedEntry = {
      controller,
      pending: starting,
    };
    ownedEntry.pending = starting.catch((error) => {
      if (instances.get(instanceId) === ownedEntry) instances.delete(instanceId);
      throw error;
    });
    entry = ownedEntry;
    instances.set(instanceId, ownedEntry);
  }
  if (needsYou) {
    return entry.pending.then((instance) => {
      if (instance.needsYou !== needsYou || !readInput || !needsYou.matchesRoot(readInput.root)) {
        throw new NeedsYouError('identity_mismatch');
      }
      return instance;
    });
  }
  return entry.pending;
}

/**
 * Close the event clients first so the server has no live connection left to
 * wait on, then close the server itself.
 * @param {CanvasInstance} instance
 */
async function stopInstance(instance) {
  instance.unsubscribeNeedsYou?.();
  instance.unsubscribeNeedsYou = null;
  instance.unsubscribeUpdates?.();
  instance.unsubscribeUpdates = null;
  // Closing one panel ends only its subscription; the session's sign-in goes on.
  instance.unsubscribeGitHub?.();
  instance.unsubscribeGitHub = null;
  for (const client of instance.eventClients) client.end();
  instance.eventClients.clear();
  // Also await an acquisition whose last HTTP reader already disconnected.
  await instance.packRead?.promise.catch(() => null);
  await instance.catalogRead?.promise.catch(() => null);
  // The token ends with the instance. The ended lifetime already cancelled an
  // apply that had not started writing; one that had finishes first.
  instance.packToken = null;
  await instance.packApply?.promise?.catch(() => null);
  // An update this Canvas started ends with it, unless it started writing:
  // that one finishes or restores whatever happens to this Canvas.
  await instance.updates?.release(instance.instanceId).catch(() => null);
  if (!instance.server.listening) return;
  await new Promise((resolve) => instance.server.close(() => resolve(undefined)));
}

/**
 * Abort acquisition before awaiting startup so an in-flight child is killed and
 * reaped before any listening server can survive the close.
 * @param {string} instanceId
 * @returns {Promise<boolean>} whether a known instance was closed
 */
export async function closeInstance(instanceId) {
  const entry = instances.get(instanceId);
  if (!entry) return false;
  if (instances.get(instanceId) === entry) instances.delete(instanceId);
  entry.controller.abort();

  const instance = await entry.pending.catch(() => null);
  if (instance) await stopInstance(instance);
  return true;
}
