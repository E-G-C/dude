// @ts-check
/**
 * Dude canvas read-only loopback server.
 *
 * One loopback HTTP server per open canvas instance. It serves a closed route
 * allowlist only: the browser application, lifecycle event stream, viewport
 * report, and the private read-only projection path. It holds no durable store.
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
  refreshNowProjection,
} from './projection.mjs';

const UI_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');

/** Closed allowlist of served assets: request path -> `ui/`-relative file. */
export const ASSET_ROUTES = Object.freeze({
  '/': 'index.html',
  '/assets/app.js': 'assets/app.js',
  '/assets/app.js.LEGAL.txt': 'assets/app.js.LEGAL.txt',
});

const ASSET_MIME_TYPES = Object.freeze({
  '/': 'text/html; charset=utf-8',
  '/assets/app.js': 'text/javascript; charset=utf-8',
  '/assets/app.js.LEGAL.txt': 'text/plain; charset=utf-8',
});

/** The viewport report is a few numbers; anything larger is not ours. */
const MAX_BODY_BYTES = 4 * 1024;

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
 * @returns {Promise<unknown>}
 */
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  return 'target' in body ? body.target : undefined;
}

/**
 * @param {CanvasInstance} instance
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleRequest(instance, req, res) {
  const { pathname } = new URL(req.url ?? '/', instance.url);

  if (req.method === 'GET' && Object.hasOwn(ASSET_ROUTES, pathname)) {
    const assetPath = /** @type {keyof typeof ASSET_ROUTES} */ (pathname);
    const file = resolveMutationPath(UI_ROOT, ASSET_ROUTES[assetPath]);
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': ASSET_MIME_TYPES[assetPath] });
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
    const body = /** @type {any} */ (await readJsonBody(req));
    const width = Math.round(Number(body?.width) || 0);
    const height = Math.round(Number(body?.height) || 0);
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
 * @returns {Promise<CanvasInstance>}
 */
async function startInstance(instanceId, log, projection, readInput, signal) {
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
  };

  instance.server.on('request', (req, res) => {
    if (!isTrustedRequest(req)) {
      sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
      return;
    }
    handleRequest(instance, req, res).catch(() => {
      if (res.headersSent) res.end();
      else sendJson(res, 400, { error: 'Request failed.' });
    });
  });

  if (signal.aborted) throw new Error('canvas startup was cancelled');
  try {
    await new Promise((resolve, reject) => {
      const failed = (error) => {
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
  return instance;
}

/**
 * Idempotent by `instanceId`: re-opening a known instance reuses its server and
 * URL so the host focuses the existing panel instead of starting a second one.
 * @param {string} instanceId
 * @param {(message: string) => unknown} log
 * @param {unknown} [projection] one complete read-only projection
 * @param {{root:string,target?:string}|null} [readInput] canonical refresh input
 * @returns {Promise<CanvasInstance>}
 */
export function openInstance(instanceId, log, projection = null, readInput = null) {
  let entry = instances.get(instanceId);
  if (!entry) {
    const controller = new AbortController();
    const starting = startInstance(instanceId, log, projection, readInput, controller.signal);
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
  return entry.pending;
}

/**
 * Close the event clients first so the server has no live connection left to
 * wait on, then close the server itself.
 * @param {CanvasInstance} instance
 */
async function stopInstance(instance) {
  for (const client of instance.eventClients) client.end();
  instance.eventClients.clear();
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
