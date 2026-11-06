// @ts-check
/**
 * This session's optional GitHub sign-in for Canvas pack reads.
 *
 * One controller serves every Canvas of one extension session: extension.mjs
 * makes it and hands it to each Canvas instance, so a reload or a second panel
 * shares its one pending sign-in and its one signed-in access. Both live in this
 * process's memory only, and a new session starts signed out. Nothing starts on
 * its own: making the controller, reading it and opening Canvas ask GitHub
 * nothing, and only an explicit `start` begins a sign-in.
 *
 * Sign-in is GitHub's OAuth device flow for Dude's OAuth App, with an explicitly
 * empty scope, so its token reads public information only. The app's public
 * Client ID is the one constant below; while it is unset, `start` answers
 * `unavailable` and asks GitHub nothing. The endpoints are fixed. Every request
 * omits credentials, refuses redirects and is bounded in time and size. Any
 * failure ends the attempt, and so does GitHub's stated expiry, at that moment
 * even while a request is on its way: nothing answered after the end is used,
 * and nothing starts again until the next `start`.
 *
 * `read` is everything a page may see: the state, the public login while signed
 * in, the user code, the fixed verification address and the expiry while
 * waiting, and the closed outcome of the last attempt or sign-out. The access
 * token and the device code are never in it, and this module logs nothing.
 *
 * A Canvas pack read takes the access with `current`: the explicit
 * `GitHubAccess`, and its signal `forgotten`. Sign-out, the session's end and
 * GitHub's rejection of that same access, reported with `rejected`, each forget
 * it: the access is released, the signal aborts so that the reads still using
 * it stop, and every subscriber is told. A rejection aborts the signal with the
 * closed reason `credential_rejected`, so that a Canvas read stops only what
 * still reads GitHub with that access and answers every other source, where
 * sign-out or the session's end stops the whole read (see canvas-server.mjs).
 * None of them sends a request; the authorization itself is revoked on GitHub.
 *
 * The relative import resolves identically from the authored source tree and
 * from the projected runtime tree, as canvas-server.mjs explains.
 *
 * Dependency-free ESM (node:* only). Targets Node >= 20.
 */

import { setTimeout as delay } from 'node:timers/promises';
import {
  GITHUB_API_HEADERS,
  GitHubAccess,
  createReadBudget,
  fetchGitHubJson,
} from '../../../skills/dude-engine/lib/github-content.mjs';

/**
 * The public Client ID of Dude's GitHub OAuth App, which has Device Flow turned
 * on. It identifies the app and is not a secret; there is no client secret.
 * @type {string | null}
 */
export const GITHUB_CLIENT_ID = 'Ov23liG1pVFOML0vKqsF';

/**
 * The reason an access's `forgotten` signal aborts with when GitHub rejected
 * that access, rather than sign-out or the session's end forgetting it.
 */
export const CREDENTIAL_REJECTED = 'credential_rejected';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const ACCOUNT_URL = 'https://api.github.com/user';
/** Where the user enters the code: GitHub's fixed page. */
const VERIFICATION_URI = 'https://github.com/login/device';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
// Each of the flow's small requests, and the one account lookup, ends after 15
// seconds, and an answer past 64 KiB is refused.
const REQUEST_TIMEOUT_MS = 15_000;
const RESPONSE_BYTES = 64 * 1024;
const ACCOUNT_LIMITS = Object.freeze({
  maxRequests: 1, maxResponseBytes: RESPONSE_BYTES, maxTotalBytes: RESPONSE_BYTES, requestTimeoutMs: REQUEST_TIMEOUT_MS,
});
// The device flow's own rules: poll every 5 seconds unless GitHub names an
// interval, and 5 seconds less often after each `slow_down`.
const DEFAULT_INTERVAL_S = 5;
const SLOW_DOWN_MS = 5_000;
const USER_CODE = /^[A-Za-z0-9-]{1,32}$/;
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
/** GitHub's errors that end an attempt with an outcome of their own; any other is `failed`. */
const GITHUB_ERRORS = new Map(/** @type {Array<[string, Outcome]>} */ ([
  ['access_denied', 'denied'],
  ['expired_token', 'expired'],
  ['device_flow_disabled', 'unavailable'],
  ['incorrect_client_credentials', 'unavailable'],
  ['unauthorized_client', 'unavailable'],
]));

/**
 * The closed outcome of the last attempt or sign-out, shown while signed out.
 * `unavailable` is a Client ID that is unset or that GitHub refuses for the
 * device flow; `failed` is any other answer that cannot sign in, such as a
 * token with a scope; `rejected` is access GitHub refused for a pack read.
 * @typedef {'cancelled' | 'denied' | 'expired' | 'unreachable' | 'unavailable' | 'failed' | 'signed_out' | 'rejected'} Outcome
 */
/** @typedef {{ controller: AbortController }} Attempt */
/**
 * @typedef {{ phase: 'signed_out', outcome: Outcome | null }
 *   | { phase: 'requesting', attempt: Attempt }
 *   | { phase: 'waiting', attempt: Attempt, userCode: string, expiresAt: string }
 *   | { phase: 'signed_in', access: GitHubAccess, login: string, forgotten: AbortController }} State
 */
/**
 * What a page may see, with every field always present.
 * @typedef {{ state: State['phase'], login: string | null, userCode: string | null,
 *   verificationUri: string | null, expiresAt: string | null, outcome: Outcome | null }} SessionView
 */

/** A read that is not signed in: no access and nothing that forgets it. */
const NO_ACCESS = Object.freeze({ github: null, forgotten: null });

/**
 * The body of an answer as text, read as a stream and stopped past 64 KiB even
 * when Content-Length is absent or wrong. A body that stops arriving is
 * `unreachable`; one that is too large, or missing, is `failed`.
 * @param {Response} response
 * @returns {Promise<string | { outcome: Outcome }>}
 */
async function readSmall(response) {
  if (!response.body || Number(response.headers.get('content-length') ?? 0) > RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    return { outcome: 'failed' };
  }
  const reader = response.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_BYTES) {
        void reader.cancel().catch(() => {});
        return { outcome: 'failed' };
      }
      chunks.push(value);
    }
  } catch { return { outcome: 'unreachable' }; }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * POST `fields` as a form to one fixed sign-in endpoint and read its small JSON
 * answer. Credentials are omitted, a redirect is refused, and the request ends
 * after 15 seconds or with `signal`. No answer at all is `unreachable`; an answer
 * that is not a JSON object is `failed`.
 * @param {string} url @param {Record<string, string>} fields @param {AbortSignal} signal
 * @returns {Promise<{ status: number, body: Record<string, unknown> } | { outcome: Outcome }>}
 */
async function postForm(url, fields, signal) {
  if (signal.aborted) return { outcome: 'cancelled' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const stop = () => controller.abort();
  signal.addEventListener('abort', stop, { once: true });
  try {
    /** @type {Response} */
    let response;
    try {
      response = await globalThis.fetch(url, {
        method: 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal,
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
    } catch { return { outcome: 'unreachable' }; }
    const text = await readSmall(response);
    if (typeof text !== 'string') return text;
    /** @type {unknown} */
    let body;
    try { body = JSON.parse(text); } catch { return { outcome: 'failed' }; }
    return body && typeof body === 'object' && !Array.isArray(body)
      ? { status: response.status, body: /** @type {Record<string, unknown>} */ (body) } : { outcome: 'failed' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

/** The outcome GitHub's `error` names. @param {string} error @returns {Outcome} */
const refusedAs = error => GITHUB_ERRORS.get(error) ?? 'failed';

/**
 * The code GitHub issued, or null for an answer that is not one.
 * @param {Record<string, unknown>} body
 */
function issuedCode(body) {
  const { device_code: deviceCode, user_code: userCode, expires_in: expiresIn, interval = DEFAULT_INTERVAL_S } = body;
  if (typeof deviceCode !== 'string' || !deviceCode || deviceCode.length > 512
    || typeof userCode !== 'string' || !USER_CODE.test(userCode)
    || !Number.isSafeInteger(expiresIn) || /** @type {number} */ (expiresIn) <= 0
    || !Number.isSafeInteger(interval) || /** @type {number} */ (interval) <= 0) return null;
  return { deviceCode, userCode, expiresIn: /** @type {number} */ (expiresIn), interval: /** @type {number} */ (interval) };
}

/**
 * The access a token answer grants, or null. Only a bearer token whose scope
 * GitHub reports as empty, which reads public information alone, is accepted.
 * @param {Record<string, unknown>} body
 */
function grantedAccess(body) {
  if (typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer' || body.scope !== '') return null;
  try { return new GitHubAccess(/** @type {string} */ (body.access_token)); }
  catch { return null; }
}

/**
 * Whether GitHub answered a request that failed: the error, or one that caused
 * it, carries an HTTP status.
 * @param {unknown} error
 */
function answered(error) {
  for (let cause = error; cause instanceof Error; cause = /** @type {any} */ (cause).cause) {
    if (typeof (/** @type {any} */ (cause).status) === 'number') return true;
  }
  return false;
}

/**
 * The public login of the account `access` belongs to, from one GET /user with
 * that access, through the shared GitHub transport. A refusal or an answer
 * without a login is `failed`; no answer at all is `unreachable`.
 * @param {GitHubAccess} access @param {AbortSignal} signal
 * @returns {Promise<string | { outcome: Outcome }>}
 */
async function accountLogin(access, signal) {
  /** @type {unknown} */
  let user;
  try {
    user = await fetchGitHubJson(ACCOUNT_URL, createReadBudget('metadata', ACCOUNT_LIMITS),
      { headers: GITHUB_API_HEADERS, signal, access });
  } catch (error) {
    return { outcome: answered(error) ? 'failed' : 'unreachable' };
  }
  const login = user && typeof user === 'object' ? /** @type {Record<string, unknown>} */ (user).login : null;
  return typeof login === 'string' && LOGIN.test(login) ? login : { outcome: 'failed' };
}

/**
 * The one GitHub sign-in controller of an extension session.
 *
 * `clientId` defaults to `GITHUB_CLIENT_ID`. `now` and `sleep` are the clock and
 * the wait between polls, which only tests replace.
 * @param {{ clientId?: string | null, now?: () => number,
 *   sleep?: (ms: number, signal: AbortSignal) => Promise<unknown> }} [options]
 */
export function createGitHubSession({
  clientId = GITHUB_CLIENT_ID,
  now = Date.now,
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
} = {}) {
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {State} */
  let state = { phase: 'signed_out', outcome: null };
  let closed = false;

  const notify = () => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* A listener never breaks the controller. */ }
    }
  };
  /** @param {State} next */
  const become = next => {
    state = next;
    notify();
  };
  /** Whether `attempt` is still the one pending sign-in. @param {Attempt} attempt */
  const pending = attempt => (state.phase === 'requesting' || state.phase === 'waiting') && state.attempt === attempt;

  /** @returns {SessionView} */
  const read = () => ({
    state: state.phase,
    login: state.phase === 'signed_in' ? state.login : null,
    userCode: state.phase === 'waiting' ? state.userCode : null,
    verificationUri: state.phase === 'waiting' ? VERIFICATION_URI : null,
    expiresAt: state.phase === 'waiting' ? state.expiresAt : null,
    outcome: state.phase === 'signed_out' ? state.outcome : null,
  });

  /**
   * Forget the signed-in access: the state first, so nothing can take it again,
   * then the access itself and the reads that still use it, which a rejection
   * stops with the reason `credential_rejected`.
   * @param {Outcome | null} outcome
   */
  const forget = outcome => {
    if (state.phase !== 'signed_in') return;
    const { access, forgotten } = state;
    state = { phase: 'signed_out', outcome };
    access.release();
    forgotten.abort(outcome === 'rejected' ? CREDENTIAL_REJECTED : undefined);
    notify();
  };

  /**
   * End the pending sign-in with `outcome`: its requests are aborted, and
   * nothing it answers afterwards is used (see `run`).
   * @param {Outcome | null} outcome
   */
  const endAttempt = outcome => {
    if (state.phase !== 'requesting' && state.phase !== 'waiting') return;
    const { attempt } = state;
    become({ phase: 'signed_out', outcome });
    attempt.controller.abort();
  };

  /**
   * One device flow, from the code request to the account lookup. It answers the
   * signed-in access and login, or the outcome that ended it; an answer for an
   * attempt that is no longer pending is never used.
   * @param {Attempt} attempt
   * @returns {Promise<{ access: GitHubAccess, login: string } | Outcome>}
   */
  async function signIn(attempt) {
    const { signal } = attempt.controller;
    const id = /** @type {string} */ (clientId);
    const asked = await postForm(DEVICE_CODE_URL, { client_id: id, scope: '' }, signal);
    if ('outcome' in asked) return asked.outcome;
    if (typeof asked.body.error === 'string') return refusedAs(asked.body.error);
    const code = asked.status === 200 ? issuedCode(asked.body) : null;
    if (!code) return 'failed';
    if (!pending(attempt)) return 'cancelled';
    const deadline = now() + code.expiresIn * 1_000;
    become({ phase: 'waiting', attempt, userCode: code.userCode, expiresAt: new Date(deadline).toISOString() });
    // GitHub's stated expiry ends the attempt at that moment, as Cancel would,
    // even while a poll or the account lookup is on its way.
    const expiry = setTimeout(() => { if (pending(attempt)) endAttempt('expired'); }, code.expiresIn * 1_000);
    try {
      let interval = code.interval * 1_000;
      for (;;) {
        const remaining = deadline - now();
        if (remaining <= 0) return 'expired';
        await sleep(Math.min(interval, remaining), signal);
        if (!pending(attempt)) return 'cancelled';
        if (now() >= deadline) return 'expired';
        const answer = await postForm(ACCESS_TOKEN_URL,
          { client_id: id, device_code: code.deviceCode, grant_type: DEVICE_GRANT }, signal);
        if ('outcome' in answer) return answer.outcome;
        const { error } = answer.body;
        if (error === 'authorization_pending') continue;
        if (error === 'slow_down') {
          interval += SLOW_DOWN_MS;
          continue;
        }
        if (typeof error === 'string') return refusedAs(error);
        const access = answer.status === 200 ? grantedAccess(answer.body) : null;
        if (!access) return 'failed';
        if (!pending(attempt)) {
          access.release();
          return 'cancelled';
        }
        const login = await accountLogin(access, signal);
        if (typeof login !== 'string') {
          access.release();
          return login.outcome;
        }
        return { access, login };
      }
    } finally {
      clearTimeout(expiry);
    }
  }

  /** Run one attempt to its end, and apply that end only while it is still pending. @param {Attempt} attempt */
  async function run(attempt) {
    /** @type {Awaited<ReturnType<typeof signIn>>} */
    let result;
    try { result = await signIn(attempt); }
    catch { result = 'failed'; }
    if (!pending(attempt)) {
      // Cancelled, expired or ended meanwhile: a late answer never signs this session in.
      if (typeof result !== 'string') result.access.release();
      return;
    }
    become(typeof result === 'string' ? { phase: 'signed_out', outcome: result }
      : { phase: 'signed_in', access: result.access, login: result.login, forgotten: new AbortController() });
  }

  return {
    /** The safe state every panel shows. */
    read,

    /**
     * Start a sign-in, unless one is pending, this session is signed in or has
     * ended; each of those answers the state as it is. Without a Client ID it
     * answers `unavailable` and asks GitHub nothing.
     * @returns {SessionView}
     */
    start() {
      if (closed || state.phase !== 'signed_out') return read();
      if (!clientId) {
        become({ phase: 'signed_out', outcome: 'unavailable' });
        return read();
      }
      const attempt = { controller: new AbortController() };
      become({ phase: 'requesting', attempt });
      void run(attempt);
      return read();
    },

    /** End the pending sign-in, during its code request or while it waits. @returns {SessionView} */
    cancel() {
      endAttempt('cancelled');
      return read();
    },

    /** Forget this session's access and account. No request is sent. @returns {SessionView} */
    signOut() {
      forget('signed_out');
      return read();
    },

    /**
     * The access a pack read may use now, and the signal that aborts once it is
     * forgotten: by sign-out or the session's end, or, with the reason
     * `credential_rejected`, by GitHub's rejection. Both are null while signed out.
     * @returns {{ github: GitHubAccess | null, forgotten: AbortSignal | null }}
     */
    current() {
      return state.phase === 'signed_in' ? { github: state.access, forgotten: state.forgotten.signal } : NO_ACCESS;
    },

    /**
     * A pack read reports that GitHub rejected `github`, as soon as the reader
     * that met the rejection answers. Only the current access is forgotten, so
     * an old read never ends a later sign-in. Its signal aborts with the reason
     * `credential_rejected`, which stops what still reads GitHub with it.
     * @param {GitHubAccess | null} github
     */
    rejected(github) {
      if (state.phase === 'signed_in' && state.access === github) forget('rejected');
    },

    /** The session ended: forget everything and start nothing more. */
    end() {
      if (closed) return;
      closed = true;
      if (state.phase === 'signed_in') forget(null);
      else endAttempt(null);
    },

    /** @param {() => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
