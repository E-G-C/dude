// @ts-check
/**
 * Dude canvas loopback server for work discovery and joined-owner responses.
 *
 * One loopback HTTP server per open canvas instance. It serves a closed route
 * allowlist only: the browser application, lifecycle event stream, viewport
 * report, private projection paths, and optional bounded Needs You operations.
 * Human handoffs belong to the joined provider, not a Canvas instance.
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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { addPackSource, readPacks, removePackSource } from './packs.mjs';
import { readProjectArtifacts } from './project-artifacts.mjs';
import { readInstallationRecord } from './about.mjs';

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
  '/api/packs/request': 'requestPack',
  '/api/imports/request': 'requestImport',
});

/** One fixed body for an About read without a live bound workspace. */
const ABOUT_UNAVAILABLE = Object.freeze({
  error: 'about_unavailable',
  message: 'This Canvas has no current workspace.',
});

/**
 * The two exact reads of the pack projection. Both return installed packs, the
 * source rows and the separate project rows. Only the second acquires catalogs:
 * the default plus each saved source, once. Browsing, filtering, events and
 * every other automatic read use the first, so nothing is fetched by accident.
 */
const PACKS_ROUTE = '/api/packs';
const PACKS_DISCOVERY_URL = '/api/packs?discover=1';
/** The one direct configuration write: add or remove a saved pack source. */
const SOURCES_ROUTE = '/api/packs/sources';
const SOURCE_REVISION_RE = /^(?:absent|sha256:[0-9a-f]{64})$/;

/**
 * How each refusal of a source write is reported. The input itself is refused
 * (422), the saved configuration is not what the request assumed or cannot be
 * trusted (409), or the read could not finish (5xx). Nothing is saved on any of
 * them, and none is a generic failure.
 */
const SOURCE_REFUSAL_STATUS = Object.freeze({
  invalid_location: 422, credentials: 422, invalid_ref: 422, ref_not_applicable: 422, local_missing: 422,
  local_layout: 422, bare_packs_folder: 422, own_library: 422, missing_catalog: 422, bad_metadata: 422,
  unreachable: 422, unknown_source: 422, builtin_source: 422,
  duplicate: 409, limit: 409, sources_changed: 409, sources_unavailable: 409, source_in_use: 409,
  authority_unavailable: 409, workspace_changed: 409,
  timeout: 504, cleanup_unconfirmed: 503, unavailable: 503, write_failed: 500,
});

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
 */
/** @typedef {{root:string,controller:AbortController,readers:number,promise:Promise<Awaited<ReturnType<typeof readPacks>> & {project: Awaited<ReturnType<typeof readProjectArtifacts>>}>}} PackReadSlot */

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
 * discovery acquires the default plus each saved source, once.
 *
 * This settles only once both children have settled. A cancelled pack read still
 * owns its reader process tree and temporary root until its bounded stop
 * finishes, and close and replacement reads wait on this promise for that,
 * however quickly the scan noticed the cancellation.
 *
 * A pack read failure of any kind rejects with that same failure. It discards
 * the whole result, so it also aborts the sibling scan: the scan stops at its
 * next cancellation check instead of running on while the failure waits for it.
 * @param {CanvasInstance} instance
 * @param {string} root
 * @param {AbortSignal} signal
 * @param {boolean} discover
 */
async function readInstalledSurface(instance, root, signal, discover) {
  const stopScan = new AbortController();
  const packRead = readPacks(root, signal, discover ? { discover: true } : { catalog: false, sources: true });
  void packRead.catch(() => stopScan.abort());
  const [packs, project] = await Promise.allSettled([
    packRead,
    readProject(instance, root, AbortSignal.any([signal, stopScan.signal])),
  ]);
  if (packs.status === 'rejected') throw packs.reason;
  if (project.status === 'rejected') throw project.reason;
  return { ...packs.value, project: project.value };
}

/**
 * @param {CanvasInstance} instance
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleRequest(instance, req, res) {
  const { pathname } = new URL(req.url ?? '/', instance.url);

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
    res.end(await readFile(file));
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
    // Only a provider-issued prepare/submit receipt crosses this boundary.
    // Compose and import previews, consent, and all writes remain with the owner.
    sendJson(res, 202, await provider[PROVIDER_REQUEST_ROUTES[pathname]](body, { signal: instance.signal }));
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
    // A browser that goes away stops the read, and nothing is saved after that.
    const disconnected = new AbortController();
    const onClose = () => disconnected.abort();
    res.once('close', onClose);
    try {
      const signal = AbortSignal.any([instance.signal, disconnected.signal]);
      const result = body.op === 'add'
        ? await addPackSource(root, signal, body, { beforeCommit: current })
        : await removePackSource(root, signal, body, { liveUses: key => provider.sourceUses(key), beforeCommit: current });
      if (res.destroyed) return;
      if (result.ok) {
        const { ok, ...saved } = result;
        sendJson(res, 200, saved);
      } else {
        const { ok, code, message, ...rest } = result;
        sendJson(res, /** @type {Record<string, number>} */ (SOURCE_REFUSAL_STATUS)[code] ?? 409, { error: code, message, ...rest });
      }
    } catch (error) {
      if (res.destroyed || disconnected.signal.aborted) return;
      throw error;
    } finally { res.off('close', onClose); }
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
    // cycles overlap them.
    while (pending && (pending.controller.signal.aborted || pending.root !== root)) {
      pending.controller.abort();
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
      // One pack-plus-project read per coalesced operation, not one per subscriber.
      const promise = readInstalledSurface(instance, root, AbortSignal.any([instance.signal, controller.signal]), discover);
      pending = { root, controller, readers: 0, promise };
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
 * @returns {Promise<CanvasInstance>}
 */
async function startInstance(instanceId, log, projection, readInput, signal, needsYou) {
  if (needsYou && (!readInput || !needsYou.matchesRoot(readInput.root))) {
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
      const providerRequest = sourcesRoute || Object.keys(PROVIDER_REQUEST_ROUTES).some((route) => req.url?.startsWith(route));
      if (res.headersSent) res.end();
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
  instance.unsubscribeNeedsYou = needsYou?.subscribe((hint) => {
    // Invalidation only: never put answer/consent/intent payloads in an SSE log.
    for (const client of instance.eventClients) {
      const event = hint === 'workspace' ? 'workspace' : 'needs-you';
      if (!client.write(`event: ${event}\ndata: {"refresh":true}\n\n`)) {
        instance.eventClients.delete(client);
        client.end();
      }
    }
  }) ?? null;
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
 * @returns {Promise<CanvasInstance>}
 */
export function openInstance(instanceId, log, projection = null, readInput = null, needsYou = null) {
  let entry = instances.get(instanceId);
  if (!entry) {
    const controller = new AbortController();
    const starting = startInstance(instanceId, log, projection, readInput, controller.signal, needsYou);
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
  for (const client of instance.eventClients) client.end();
  instance.eventClients.clear();
  // Also await an acquisition whose last HTTP reader already disconnected.
  await instance.packRead?.promise.catch(() => null);
  await instance.catalogRead?.promise.catch(() => null);
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
