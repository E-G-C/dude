// @ts-check
/**
 * Tests for the session's GitHub sign-in controller (089). Every case runs
 * GitHub's device flow against a fake `globalThis.fetch` in this process, so no
 * case reaches a network, needs a real OAuth App registration or waits for a
 * real poll interval: flows run with a fixture Client ID and a test clock, and
 * the one Start with Dude's public Client ID gets no answer to its code request.
 * Each access token and device code is a sentinel made in test memory; checks
 * of one report counts and booleans, never the value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CREDENTIAL_REJECTED, GITHUB_CLIENT_ID, createGitHubSession } from './github-session.mjs';
import { GitHubAccess } from '../../../skills/dude-engine/lib/github-content.mjs';

const CLIENT_ID = 'Iv1.fixture0client0id';
const CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const VERIFICATION_URI = 'https://github.com/login/device';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const START = Date.UTC(2026, 9, 31, 18, 0, 0);
/** What GitHub's error descriptions say; no state may repeat it. */
const PROVIDER_TEXT = 'planted provider text';

/** A bearer-shaped sentinel no account holds. @param {string} prefix */
const sentinel = prefix => `${prefix}_${randomUUID().replaceAll('-', '')}`;
/** @param {unknown} text @param {string} needle */
const occurrences = (text, needle) => String(text).split(needle).length - 1;
/** @param {string | null} outcome */
const signedOut = outcome => ({ state: 'signed_out', login: null, userCode: null, verificationUri: null, expiresAt: null, outcome });
const REQUESTING = Object.freeze({ ...signedOut(null), state: 'requesting' });
const NO_ACCESS = Object.freeze({ github: null, forgotten: null });

/** @param {string} deviceCode @param {Record<string, unknown>} [extra] */
const codeAnswer = (deviceCode, extra = {}) => ({ json: {
  device_code: deviceCode, user_code: 'WDJB-MJHT', verification_uri: VERIFICATION_URI, expires_in: 900, interval: 5, ...extra } });
/** @param {string} token @param {Record<string, unknown>} [extra] */
const tokenAnswer = (token, extra = {}) => ({ json: { access_token: token, token_type: 'bearer', scope: '', ...extra } });
/** @param {string} error */
const refusal = error => ({ json: { error, error_description: PROVIDER_TEXT, error_uri: 'https://docs.github.com/' } });
const PENDING = refusal('authorization_pending');
const ACCOUNT = { json: { login: 'octocat', id: 1, name: 'The Octocat' } };

/**
 * @typedef {{ status?: number, json?: unknown, text?: string }} Reply
 * @typedef {Reply | 'network' | 'hang' | { later: Promise<Reply> }} Answer
 * @typedef {{ url: string, method: string, headers: Record<string, string>, body: string | null,
 *   credentials: unknown, redirect: unknown, signal: AbortSignal | null }} Seen
 */

/**
 * Fake GitHub for one test: `globalThis.fetch` answers each sign-in endpoint from
 * its list in order, repeating the last answer, and refuses every other address.
 * `network` fails as fetch does without a network; `hang` never answers until
 * its request is aborted; `later` answers when its promise settles, even after an
 * abort, as an answer already on its way does.
 * @param {import('node:test').TestContext} t
 * @param {Partial<Record<string, Answer[]>>} script by endpoint URL
 */
function fakeGitHub(t, script) {
  /** @type {Seen[]} */
  const requests = [];
  const lists = new Map(Object.entries(script).map(([url, answers]) => [url, [...(answers ?? [])]]));
  /** @param {Answer} answer @param {AbortSignal | undefined} signal @returns {Promise<Response>} */
  const respond = async (answer, signal) => {
    if (answer === 'network') throw new TypeError('fetch failed');
    if (answer === 'hang') {
      return new Promise((_, reject) => {
        if (signal?.aborted) reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
    if ('later' in answer) return respond(await answer.later, undefined);
    return new Response(answer.text ?? JSON.stringify(answer.json), {
      status: answer.status ?? 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  };
  t.mock.method(globalThis, 'fetch', async (/** @type {any} */ input, /** @type {any} */ init = {}) => {
    const url = String(input);
    requests.push({ url, method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body === undefined ? null : String(init.body), credentials: init.credentials, redirect: init.redirect,
      signal: init.signal ?? null });
    const answers = lists.get(url);
    if (!answers?.length) throw new TypeError(`fixture: nothing answers ${url}`);
    return respond(/** @type {Answer} */ (answers.length > 1 ? answers.shift() : answers[0]), init.signal);
  });
  return { requests, to: (/** @type {string} */ url) => requests.filter(request => request.url === url) };
}

/**
 * The controller's clock and its wait between polls. Each wait is recorded and,
 * unless held, passes at once and moves the clock on by its length. A held wait
 * passes with `pass`, or fails with its attempt's abort.
 */
function testClock() {
  let time = START;
  let holding = false;
  /** @type {number[]} */
  const waits = [];
  /** @type {Array<() => void>} */
  const held = [];
  return {
    waits,
    now: () => time,
    /** @param {number} ms @param {AbortSignal} signal */
    sleep(ms, signal) {
      waits.push(ms);
      if (!holding) {
        time += ms;
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        held.push(() => {
          signal.removeEventListener('abort', aborted);
          time += ms;
          resolve(undefined);
        });
      });
    },
    hold() { holding = true; },
    /** Pass every held wait, and every later one at once. */
    run() {
      holding = false;
      while (held.length) /** @type {() => void} */ (held.shift())();
    },
  };
}

/** Let every answer and continuation already due run. */
async function settle() {
  for (let turn = 0; turn < 25; turn += 1) await new Promise(resolve => setImmediate(resolve));
}

/** Settle until `probe` holds, for a bounded number of rounds. @param {() => boolean} probe @param {string} label */
async function eventually(probe, label) {
  for (let round = 0; round < 40 && !probe(); round += 1) await settle();
  assert.ok(probe(), `timed out waiting for ${label}`);
}

/**
 * The state once it satisfies `predicate`, checked now and at each notification.
 * @param {ReturnType<typeof createGitHubSession>} session
 * @param {(view: ReturnType<ReturnType<typeof createGitHubSession>['read']>) => boolean} predicate
 * @param {string} label
 */
function until(session, predicate, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting until ${label}: ${JSON.stringify(session.read())}`));
    }, 5_000);
    const check = () => {
      const view = session.read();
      if (!predicate(view)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(view);
    };
    const unsubscribe = session.subscribe(check);
    check();
  });
}

/**
 * A controller over fake GitHub that approves at once, signed in as octocat.
 * @param {import('node:test').TestContext} t
 * @param {string[]} tokens one per sign-in, in order
 */
async function signedInSession(t, tokens = [sentinel('gho')]) {
  const github = fakeGitHub(t, {
    [CODE_URL]: [codeAnswer(sentinel('dc'))],
    [TOKEN_URL]: tokens.map(token => tokenAnswer(token)),
    [USER_URL]: [ACCOUNT],
  });
  const clock = testClock();
  const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
  session.start();
  await until(session, view => view.state === 'signed_in', 'signed in');
  return { github, clock, session };
}

test('089 T002 making, reading and subscribing ask GitHub nothing, and Start without a Client ID answers unavailable with no request', async t => {
  const github = fakeGitHub(t, {});
  // Dude's OAuth App is registered, so the default controller has its public
  // Client ID (its Start is the next case); only a test-only null or empty
  // Client ID leaves sign-in unconfigured.
  assert.equal(GITHUB_CLIENT_ID, 'Ov23liG1pVFOML0vKqsF');
  const configured = createGitHubSession();
  configured.subscribe(() => {});
  assert.deepEqual([configured.read(), configured.current()], [signedOut(null), NO_ACCESS]);
  for (const session of [createGitHubSession({ clientId: null }), createGitHubSession({ clientId: '' })]) {
    /** @type {unknown[]} */
    const told = [];
    session.subscribe(() => told.push(session.read()));
    assert.deepEqual(session.read(), signedOut(null));
    assert.deepEqual(session.current(), NO_ACCESS);
    assert.deepEqual(session.start(), signedOut('unavailable'));
    assert.deepEqual(session.start(), signedOut('unavailable'), 'Sign in again asks nothing either');
    await settle();
    assert.deepEqual(told, [signedOut('unavailable'), signedOut('unavailable')], 'every panel is told');
    assert.deepEqual(session.current(), NO_ACCESS, 'pack reads stay anonymous');
    assert.deepEqual([session.cancel(), session.signOut()], [signedOut('unavailable'), signedOut('unavailable')]);
  }
  assert.equal(github.requests.length, 0, 'nothing was asked of GitHub');
});

test('089 T004 Start with Dude\'s configured Client ID asks GitHub\'s fixed device-code endpoint once, for that ID and an explicitly empty scope', async t => {
  // Nothing answers, as without a network, so the attempt ends unreachable.
  const github = fakeGitHub(t, {});
  const session = createGitHubSession();
  assert.deepEqual(session.start(), REQUESTING);
  assert.deepEqual(await until(session, view => view.state === 'signed_out', 'the attempt to end'), signedOut('unreachable'));
  await settle();
  assert.deepEqual(github.requests.map(request => `${request.method} ${request.url} ${request.body}`),
    [`POST ${CODE_URL} client_id=${GITHUB_CLIENT_ID}&scope=`], 'one request, and nothing retried');
  assert.deepEqual(session.current(), NO_ACCESS, 'pack reads stay anonymous');
});

test('089 T002 a complete sign-in asks for an explicitly empty scope at the fixed endpoints, waits the returned interval and five seconds more after slow_down, looks the account up once, and never shows the token or device code', async t => {
  const token = sentinel('gho');
  const deviceCode = sentinel('dc');
  const github = fakeGitHub(t, {
    [CODE_URL]: [codeAnswer(deviceCode, { interval: 7 })],
    [TOKEN_URL]: [PENDING, { json: { error: 'slow_down', interval: 12, error_description: PROVIDER_TEXT } }, PENDING, tokenAnswer(token)],
    [USER_URL]: [ACCOUNT],
  });
  const clock = testClock();
  const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
  /** @type {unknown[]} */
  const told = [];
  session.subscribe(() => told.push(session.read()));
  const started = session.start();
  assert.deepEqual(started, REQUESTING);
  const signedIn = await until(session, view => view.state === 'signed_in', 'signed in');

  assert.deepEqual(signedIn, { state: 'signed_in', login: 'octocat', userCode: null, verificationUri: null, expiresAt: null, outcome: null });
  assert.deepEqual(told, [REQUESTING, {
    state: 'waiting', login: null, userCode: 'WDJB-MJHT', verificationUri: VERIFICATION_URI,
    expiresAt: new Date(START + 900_000).toISOString(), outcome: null,
  }, signedIn], 'each panel is told of each change, and nothing more');
  assert.deepEqual(clock.waits, [7_000, 7_000, 12_000, 12_000], 'the returned interval, then five seconds more after slow_down');
  assert.deepEqual(github.requests.map(request => `${request.method} ${request.url}`),
    [`POST ${CODE_URL}`, ...Array(4).fill(`POST ${TOKEN_URL}`), `GET ${USER_URL}`]);
  const [code, ...polls] = github.requests.slice(0, 5);
  assert.equal(code.body, `client_id=${CLIENT_ID}&scope=`, 'the requested scope is named, and empty');
  for (const poll of polls) {
    assert.deepEqual(Object.fromEntries(new URLSearchParams(poll.body ?? '')),
      { client_id: CLIENT_ID, device_code: deviceCode, grant_type: DEVICE_GRANT });
  }
  for (const request of [code, ...polls]) {
    assert.deepEqual([request.headers.accept, request.headers['content-type'], request.headers.authorization, request.credentials, request.redirect],
      ['application/json', 'application/x-www-form-urlencoded', undefined, 'omit', 'error']);
  }
  const account = github.requests[5];
  assert.equal(account.headers.authorization === `Bearer ${token}`, true, 'only the account lookup carries the access');
  assert.deepEqual([account.headers.accept, account.credentials, account.redirect], ['application/vnd.github+json', 'omit', 'error']);

  const { github: access, forgotten } = session.current();
  assert.ok(access instanceof GitHubAccess);
  assert.equal(access.token === token, true, 'pack reads are given the issued access');
  assert.equal(forgotten?.aborted, false);
  const shown = JSON.stringify([started, told, session.read(), access]);
  assert.deepEqual([occurrences(shown, token), occurrences(shown, deviceCode), occurrences(shown, PROVIDER_TEXT)], [0, 0, 0],
    'no state, and not the access itself, shows the token, the device code or GitHub\'s text');
});

test('089 T002 Start while a sign-in is pending answers that one attempt and its code, and Start while signed in asks nothing', async t => {
  /** @type {(reply: any) => void} */
  let answerCode = () => {};
  const github = fakeGitHub(t, {
    [CODE_URL]: [{ later: new Promise(resolve => { answerCode = resolve; }) }],
    [TOKEN_URL]: [PENDING, tokenAnswer(sentinel('gho'))],
    [USER_URL]: [ACCOUNT],
  });
  const clock = testClock();
  clock.hold();
  const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
  assert.deepEqual(session.start(), REQUESTING);
  assert.deepEqual(session.start(), REQUESTING, 'a reload or a second panel shares the code request');
  answerCode(codeAnswer(sentinel('dc')));
  const waiting = await until(session, view => view.state === 'waiting', 'waiting');
  assert.deepEqual(session.start(), waiting, 'and the same code and expiry while it waits');
  assert.equal(github.to(CODE_URL).length, 1, 'one attempt asked for one code');
  clock.run();
  await until(session, view => view.state === 'signed_in', 'signed in');
  const asked = github.requests.length;
  assert.equal(session.start().state, 'signed_in');
  await settle();
  assert.equal(github.requests.length, asked, 'Start while signed in asks nothing');
  assert.equal(github.to(USER_URL).length, 1, 'one account lookup for one sign-in');
});

test('089 T002 Cancel during the code request or while waiting ends the attempt, and a late answer never signs the session in', async t => {
  await t.test('during the code request', async t => {
    const github = fakeGitHub(t, { [CODE_URL]: ['hang'] });
    const clock = testClock();
    const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
    session.start();
    await settle();
    assert.deepEqual(session.cancel(), signedOut('cancelled'));
    await settle();
    assert.deepEqual(session.read(), signedOut('cancelled'));
    assert.deepEqual(github.requests.map(request => request.url), [CODE_URL], 'nothing follows the cancelled request');
    assert.deepEqual(session.current(), NO_ACCESS);
  });

  await t.test('while waiting, so an approval on GitHub afterwards is never collected', async t => {
    const github = fakeGitHub(t, { [CODE_URL]: [codeAnswer(sentinel('dc'))], [TOKEN_URL]: [tokenAnswer(sentinel('gho'))], [USER_URL]: [ACCOUNT] });
    const clock = testClock();
    clock.hold();
    const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
    session.start();
    await until(session, view => view.state === 'waiting', 'waiting');
    assert.deepEqual(session.cancel(), signedOut('cancelled'));
    clock.run();
    await settle();
    assert.deepEqual(session.read(), signedOut('cancelled'));
    assert.equal(github.to(TOKEN_URL).length, 0, 'no poll after Cancel');
    assert.deepEqual(session.current(), NO_ACCESS);
  });

  for (const late of ['an approval', 'an account answer']) {
    await t.test(`with ${late} already on its way`, async t => {
      /** @type {(reply: any) => void} */
      let arrive = () => {};
      const later = { later: new Promise(resolve => { arrive = resolve; }) };
      const token = sentinel('gho');
      const approval = late === 'an approval';
      const github = fakeGitHub(t, {
        [CODE_URL]: [codeAnswer(sentinel('dc'))],
        [TOKEN_URL]: [approval ? later : tokenAnswer(token)],
        [USER_URL]: [approval ? ACCOUNT : later],
      });
      const clock = testClock();
      const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
      session.start();
      await eventually(() => github.to(approval ? TOKEN_URL : USER_URL).length === 1, 'the request the answer is on its way to');
      assert.deepEqual(session.cancel(), signedOut('cancelled'));
      arrive(approval ? tokenAnswer(token) : ACCOUNT);
      await settle();
      assert.deepEqual(session.read(), signedOut('cancelled'), 'the late answer changed nothing');
      assert.deepEqual(session.current(), NO_ACCESS, 'no access was kept');
      assert.equal(github.to(USER_URL).length, approval ? 0 : 1, 'a late token is not even looked up');
    });
  }
});

test('089 T002 denial, expiry, disabled Device Flow, network and account-lookup failures, and a token with a scope each leave the session signed out with a closed outcome and no retry', async t => {
  const token = sentinel('gho');
  const deviceCode = sentinel('dc');
  // Each case: what GitHub answers differently, the outcome, and how many account lookups it made.
  /** @type {Array<[string, Partial<Record<string, Answer[]>>, string, number]>} */
  const cases = [
    ['GitHub declines the request', { [TOKEN_URL]: [PENDING, refusal('access_denied')] }, 'denied', 0],
    ['GitHub reports the code expired', { [TOKEN_URL]: [refusal('expired_token')] }, 'expired', 0],
    ['Device Flow is off at the code request', { [CODE_URL]: [{ status: 400, ...refusal('device_flow_disabled') }] }, 'unavailable', 0],
    ['Device Flow is off while polling', { [TOKEN_URL]: [refusal('device_flow_disabled')] }, 'unavailable', 0],
    ['GitHub refuses the Client ID', { [CODE_URL]: [{ status: 401, ...refusal('incorrect_client_credentials') }] }, 'unavailable', 0],
    ['another refusal', { [TOKEN_URL]: [refusal('incorrect_device_code')] }, 'failed', 0],
    ['no network for the code request', { [CODE_URL]: ['network'] }, 'unreachable', 0],
    ['no network while polling', { [TOKEN_URL]: [PENDING, 'network'] }, 'unreachable', 0],
    ['no network for the account lookup', { [USER_URL]: ['network'] }, 'unreachable', 1],
    ['the account lookup is refused', { [USER_URL]: [{ status: 500, json: { message: PROVIDER_TEXT } }] }, 'failed', 1],
    ['the account lookup rejects the new access', { [USER_URL]: [{ status: 401, json: { message: PROVIDER_TEXT } }] }, 'failed', 1],
    ['the account lookup names no login', { [USER_URL]: [{ json: { id: 1, name: PROVIDER_TEXT } }] }, 'failed', 1],
    ['the token carries a scope', { [TOKEN_URL]: [tokenAnswer(token, { scope: 'repo' })] }, 'failed', 0],
    ['the token is not a bearer token', { [TOKEN_URL]: [tokenAnswer(token, { token_type: 'mac' })] }, 'failed', 0],
    ['the code answer has no code', { [CODE_URL]: [{ json: { user_code: 'WDJB-MJHT', expires_in: 900 } }] }, 'failed', 0],
    ['the code answer is not JSON', { [CODE_URL]: [{ status: 502, text: `<html>${PROVIDER_TEXT}</html>` }] }, 'failed', 0],
  ];
  for (const [label, override, outcome, lookups] of cases) {
    await t.test(label, async t => {
      const github = fakeGitHub(t, {
        [CODE_URL]: [codeAnswer(deviceCode)], [TOKEN_URL]: [tokenAnswer(token)], [USER_URL]: [ACCOUNT], ...override,
      });
      const clock = testClock();
      const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
      /** @type {unknown[]} */
      const told = [];
      session.subscribe(() => told.push(session.read()));
      session.start();
      const ended = await until(session, view => view.state === 'signed_out', 'signed out');
      assert.deepEqual(ended, signedOut(outcome));
      assert.deepEqual(session.current(), NO_ACCESS, 'pack reads stay anonymous');
      const asked = github.requests.length;
      await settle();
      assert.equal(github.requests.length, asked, 'nothing is retried');
      assert.equal(github.to(USER_URL).length, lookups, 'a token that cannot be used is never looked up');
      const shown = JSON.stringify(told);
      assert.deepEqual([occurrences(shown, token), occurrences(shown, deviceCode), occurrences(shown, PROVIDER_TEXT)], [0, 0, 0]);
    });
  }
});

test('089 T002 the returned expiry ends the attempt at its deadline without another poll', async t => {
  const github = fakeGitHub(t, { [CODE_URL]: [codeAnswer(sentinel('dc'), { expires_in: 12, interval: 5 })], [TOKEN_URL]: [PENDING] });
  const clock = testClock();
  const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
  session.start();
  assert.deepEqual(await until(session, view => view.state === 'signed_out', 'signed out'), signedOut('expired'));
  assert.deepEqual(clock.waits, [5_000, 5_000, 2_000], 'two polls, then the rest of the twelve seconds');
  assert.equal(github.to(TOKEN_URL).length, 2, 'no poll at or after the deadline');
});

test('089 T002 GitHub\'s stated expiry ends the attempt while a poll is still on its way, and a token answered after it never signs the session in', async t => {
  for (const late of ['a poll that never answers', 'a token answered after the expiry']) {
    await t.test(late, async t => {
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
      const stalled = late === 'a poll that never answers';
      /** @type {(reply: any) => void} */
      let arrive = () => {};
      const github = fakeGitHub(t, {
        [CODE_URL]: [codeAnswer(sentinel('dc'), { expires_in: 10, interval: 5 })],
        [TOKEN_URL]: [stalled ? 'hang' : { later: new Promise(resolve => { arrive = resolve; }) }],
        [USER_URL]: [ACCOUNT],
      });
      // One clock, the mocked one, and no wait between polls, so the one poll is on its way from the start.
      const session = createGitHubSession({ clientId: CLIENT_ID, now: () => Date.now(), sleep: async () => {} });
      /** @type {string[]} */
      const told = [];
      session.subscribe(() => told.push(session.read().state));
      session.start();
      await eventually(() => github.to(TOKEN_URL).length === 1, 'the poll');
      assert.equal(session.read().expiresAt, new Date(START + 10_000).toISOString());
      t.mock.timers.tick(9_999);
      await settle();
      assert.equal(session.read().state, 'waiting', 'nothing ends before the stated expiry');
      assert.equal(github.to(TOKEN_URL)[0].signal?.aborted, false, 'the poll is still on its way');
      t.mock.timers.tick(1);
      await settle();
      assert.deepEqual(session.read(), signedOut('expired'), 'the expiry ends the attempt while its poll is on its way');
      assert.equal(github.to(TOKEN_URL)[0].signal?.aborted, true, 'and aborts that poll then, rather than leave it to its own 15-second bound');
      if (!stalled) {
        arrive(tokenAnswer(sentinel('gho')));
        await settle();
      }
      assert.deepEqual(session.read(), signedOut('expired'), 'an answer after the expiry changes nothing');
      assert.deepEqual(session.current(), NO_ACCESS, 'and no access is kept');
      assert.deepEqual(github.requests.map(request => request.url), [CODE_URL, TOKEN_URL],
        'a late token is not even looked up, and nothing polls again');
      assert.deepEqual(told, ['requesting', 'waiting', 'signed_out'], 'every panel is told of the expiry, and of nothing after it');
    });
  }
});

test('089 T002 each sign-in request is bounded: one that never answers ends unreachable after 15 seconds, and one past 64 KiB fails', async t => {
  await t.test('no answer', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const github = fakeGitHub(t, { [CODE_URL]: ['hang'] });
    const session = createGitHubSession({ clientId: CLIENT_ID, now: () => START, sleep: async () => {} });
    session.start();
    await settle();
    t.mock.timers.tick(14_999);
    await settle();
    assert.equal(session.read().state, 'requesting');
    t.mock.timers.tick(1);
    await settle();
    assert.deepEqual(session.read(), signedOut('unreachable'));
    assert.equal(github.requests.length, 1);
  });
  await t.test('an oversized answer', async t => {
    fakeGitHub(t, { [CODE_URL]: [{ text: JSON.stringify({ padding: 'x'.repeat(64 * 1024) }) }] });
    const clock = testClock();
    const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
    session.start();
    assert.deepEqual(await until(session, view => view.state === 'signed_out', 'signed out'), signedOut('failed'));
  });
});

test('089 T002 sign-out releases the access, aborts its signal and tells every subscriber at once, and sends no revocation request', async t => {
  const { github, session } = await signedInSession(t);
  const { github: access, forgotten } = session.current();
  /** @type {string[]} */
  const told = [];
  session.subscribe(() => { throw new Error('a broken panel'); });
  session.subscribe(() => told.push(String(session.read().outcome)));
  const asked = github.requests.length;
  assert.deepEqual(session.signOut(), signedOut('signed_out'));
  assert.equal(access?.token, null, 'the access can no longer be sent');
  assert.equal(forgotten?.aborted, true, 'reads that still use it are stopped');
  assert.notEqual(forgotten?.reason, CREDENTIAL_REJECTED, 'as a whole: sign-out is not a rejection');
  assert.deepEqual(session.current(), NO_ACCESS);
  assert.deepEqual(told, ['signed_out'], 'a listener that throws keeps no other from being told');
  assert.deepEqual(session.signOut(), signedOut('signed_out'), 'signing out again changes nothing');
  assert.deepEqual(told, ['signed_out']);
  await settle();
  assert.equal(github.requests.length, asked, 'no request at all: revoking is done on GitHub');
});

test('089 T002 only a rejection of the current access forgets it, so an old access never ends a later sign-in', async t => {
  const tokens = [sentinel('gho'), sentinel('gho')];
  const { session } = await signedInSession(t, tokens);
  const { github: current, forgotten: firstForgotten } = session.current();
  const first = /** @type {GitHubAccess} */ (current);
  session.rejected(null);
  session.rejected(new GitHubAccess(tokens[0]));
  assert.equal(session.read().state, 'signed_in', 'another access, even with the same token, is not this one');
  session.rejected(first);
  assert.deepEqual(session.read(), signedOut('rejected'));
  assert.equal(first.token, null);
  assert.deepEqual([firstForgotten?.aborted, firstForgotten?.reason], [true, CREDENTIAL_REJECTED],
    'every read still using it is stopped, as a rejection');
  assert.equal(CREDENTIAL_REJECTED, 'credential_rejected');

  session.start();
  await until(session, view => view.state === 'signed_in', 'signed in again');
  const { github: second, forgotten } = session.current();
  assert.equal(second?.token === tokens[1], true);
  session.rejected(first);
  assert.equal(session.read().state, 'signed_in', 'an old access never ends the later sign-in');
  assert.equal(forgotten?.aborted, false);
  assert.equal(second?.token === tokens[1], true);
});

test('089 T002 the session end forgets the access or the pending attempt, and starts nothing afterwards', async t => {
  await t.test('signed in', async t => {
    const { github, session } = await signedInSession(t);
    const { github: access, forgotten } = session.current();
    let told = 0;
    session.subscribe(() => { told += 1; });
    const asked = github.requests.length;
    session.end();
    assert.deepEqual([session.read(), access?.token, forgotten?.aborted, told], [signedOut(null), null, true, 1]);
    assert.deepEqual(session.start(), signedOut(null));
    session.end();
    await settle();
    assert.deepEqual([github.requests.length, told], [asked, 1], 'nothing is asked, and the end is told once');
  });
  await t.test('waiting', async t => {
    const github = fakeGitHub(t, { [CODE_URL]: [codeAnswer(sentinel('dc'))], [TOKEN_URL]: [tokenAnswer(sentinel('gho'))], [USER_URL]: [ACCOUNT] });
    const clock = testClock();
    clock.hold();
    const session = createGitHubSession({ clientId: CLIENT_ID, now: clock.now, sleep: clock.sleep });
    session.start();
    await until(session, view => view.state === 'waiting', 'waiting');
    session.end();
    clock.run();
    await settle();
    assert.deepEqual(session.read(), signedOut(null));
    assert.deepEqual(session.start(), signedOut(null));
    await settle();
    assert.deepEqual(github.requests.map(request => request.url), [CODE_URL], 'no poll, and no new attempt');
  });
});
