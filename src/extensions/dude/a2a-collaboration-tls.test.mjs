// @ts-check
/**
 * Component suite for Feature 089 collaboration over real mutual TLS.
 *
 * Two independent Node processes, each with its own disposable root (workspace,
 * owner folder, home, and temp, under separate temporary parents), run the real
 * joined provider from lib/a2a.mjs with its default transport and recorder: the
 * real `startServer` HTTPS listener and `prepareClient` client over node:https
 * and node:tls with the bundled A2A SDK 1.2.0 and Express 5.2.1, and the
 * default transcript journals under each workspace. Certificates are real
 * self-signed X.509 certificates that this suite creates with node:crypto for
 * each run, so no OpenSSL command or install is needed. The TLS handshake,
 * certificate parsing, and the pin and validity checks are the shipped ones;
 * nothing about them is replaced.
 *
 * Not real, by design: B's evidence worker is the real worker module driving a
 * COMPONENT FAKE of the public Copilot SDK, which answers the worker's public
 * readiness calls and whose scripted stand-in "model" lists B's approved
 * records, reads the highest one, and answers. The fake comes through a test
 * adapter, so B's readiness record carries no production SDK provenance. One
 * check gives B's worker the existing-sign-in branch: B's provider is then
 * bound from a test-owned Windows environment, and the fake reports a
 * signed-in account, which proves no native sign-in. No Copilot runtime,
 * model, credential, or network beyond loopback is used. Each
 * session is a minimal fake host session; this test makes the tool calls, and
 * every approval is a synthetic root message, never human approval. One check
 * swaps in a failing disk through the transcript recorder's own
 * `io.writeSync` seam.
 *
 * This is component evidence for the real transport, wire correlation, B's
 * readiness records, bounds, cancellation and socket loss, recording, live
 * and retained reading, and process exit. It is not native AI, host,
 * isolation, LAN, or process-tree evidence, and its timings are not the
 * native targets.
 *
 * Feature 095's standing pairing runs over the same processes and files.
 * Each owner enrolls once through its complete proposal and one synthetic
 * typed approval, which saves a digest-only record beside that owner's
 * configuration in its own root under the OS temp folder, outside every Git
 * checkout. Later requests reactivate it, including from recreated processes
 * over the same files. Third peer processes presenting the stranger
 * certificate stand in for wrong peers. This proves no native notice
 * visibility, human review, or real model, host, or account behavior.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

import { createA2a } from './lib/a2a.mjs';
import { createTranscriptRecorder } from './lib/a2a-transcript.mjs';

const PEER_FLAG = '--dude-a2a-tls-component-peer';
const SELF = fileURLToPath(import.meta.url);
const TRANSCRIPT_CLI = fileURLToPath(new URL('./lib/a2a-transcript.mjs', import.meta.url));
const PROJECT = 'dude-number-poc';
const QUESTION = 'Which is the highest lifecycle number in your approved records?';
const WORKER_TOKEN = 'component-fake-worker-token-not-a-credential';
const WORKER_MODEL = 'component-fake-model';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WAIT_MS = 20_000;
const EXIT_MS = 10_000;

if (process.argv.includes(PEER_FLAG)) runPeer();
else defineTests();

// ---------------------------------------------------------------------------
// The peer process: one real provider, driven by the test over IPC.
// ---------------------------------------------------------------------------

function runPeer() {
  /** @param {Record<string, unknown>} message */
  const send = (message) => {
    if (process.connected) process.send?.(message);
  };
  /** @type {ReturnType<typeof createA2a> | null} */
  let provider = null;
  /** @type {ReturnType<typeof componentWorkerSdk> | null} */
  let worker = null;
  /** @type {ReturnType<typeof controllableDisk> | null} */
  let disk = null;
  let sessionId = '';
  let calls = 0;
  const stop = { type: 'user.message', data: { content: 'dude a2a stop' } };
  process.on('message', async (/** @type {any} */ message) => {
    /** @param {boolean} ok @param {unknown} value */
    const reply = (ok, value) => send({ type: 'reply', id: message.id, ok, value });
    try {
      if (message.type === 'init') {
        sessionId = message.sessionId;
        worker = message.side === 'b' ? componentWorkerSdk(message.workerTemp, send, Boolean(message.signIn)) : null;
        disk = message.faultyDisk ? controllableDisk() : null;
        provider = createA2a({
          root: message.root,
          // The default recorder, or the same recorder over a disk this test can fail through its own seam.
          ...(disk ? { recorder: createTranscriptRecorder({ root: message.root, io: { writeSync: disk.writeSync } }) } : {}),
          // A never starts a worker, so it gets none; B's worker drives the component fake SDK.
          ...(worker ? { worker: worker.adapters } : {}),
          // An existing-sign-in B is bound from a test-owned Windows environment, never this process's own.
          ...(message.signIn ? { platform: 'win32', environment: message.signIn.environment } : {}),
        });
        provider.bindSession(/** @type {any} */ ({
          sessionId,
          log: async (/** @type {unknown} */ text) => { send({ type: 'log', text: String(text) }); },
          rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [], inFlightSteeringCount: 0 }) } },
        }));
        return reply(true, null);
      }
      const live = /** @type {ReturnType<typeof createA2a>} */ (provider);
      if (message.type === 'call') {
        const tool = live.tools.find((entry) => entry.name === message.tool);
        if (!tool) throw new Error(`${message.tool} is not registered`);
        const result = await tool.handler(message.args, /** @type {any} */ ({
          sessionId, toolName: message.tool, toolCallId: `${message.tool}-${++calls}`, arguments: message.args, signal: new AbortController().signal,
        }));
        return reply(true, result);
      }
      if (message.type === 'event') {
        live.onEvent(message.event);
        return reply(true, null);
      }
      if (message.type === 'hold') return reply(true, worker?.hold());
      if (message.type === 'release') return reply(true, worker?.release());
      if (message.type === 'fail-next') return reply(true, disk?.arm(message.kind));
      throw new Error(`unknown request ${message.type}`);
    } catch (error) {
      reply(false, error instanceof Error ? error.message : String(error));
    }
  });
  process.once('disconnect', () => {
    // End any activation so its listener closes; the process then exits on its own.
    provider?.onEvent(/** @type {any} */ (stop));
    // Only a safety net against an orphan whose parent died: it cannot keep the process alive.
    setTimeout(() => process.exit(70), 60_000).unref();
  });
}

/**
 * COMPONENT FAKE of the public Copilot SDK surface the real worker module
 * uses. It starts no runtime, model, or process. Each session creates its
 * workspace folder in its owned configuration storage, or, for an
 * existing-sign-in session, which names none, under the client's base
 * directory; its metadata snapshot and public `workspacePath` getter report
 * it. It answers the public readiness calls with an empty ambient state and
 * the worker's own two-tool catalog, and, only for an existing-sign-in B
 * (`account`), a signed-in account for the client and the session; a token
 * B's fake has no account API, as before. It runs the fixed preflight call
 * through its tool pipeline, and delivers events to the handler registered
 * at creation. It reports each client's constructor mode, logged-in-user
 * switch, and option names, never their values. Once `send` returns its
 * admission ID, its scripted stand-in "model" waits while the test holds it,
 * then lists B's approved records, reads the highest one, and answers from
 * what it read; each tool call follows the root request that names it.
 * @param {string} tempParent @param {(message: Record<string, unknown>) => void} send @param {boolean} [account]
 */
function componentWorkerSdk(tempParent, send, account = false) {
  /** @type {{promise: Promise<void>, resolve: () => void} | null} */
  let held = null;
  let sessions = 0;
  const signedIn = { isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'component-owner' };
  class CopilotClient {
    /** @param {any} options */
    constructor(options) {
      this.options = options;
      if (account) this.getAuthStatus = async () => ({ ...signedIn });
      send({ type: 'worker', event: 'constructed', mode: options.mode, useLoggedInUser: options.useLoggedInUser, keys: Object.keys(options).sort() });
    }

    async getStatus() {
      return { version: 'component-fake', protocolVersion: 3 };
    }

    /** @param {any} config */
    async createSession(config) {
      sessions += 1;
      const sessionId = `component-worker-session-${sessions}`;
      const admission = `${sessionId}-prompt`;
      // As a runtime keeping a session workspace would; the folder's name proves nothing to the worker.
      const workspace = path.join(config.configDirectory ?? this.options.baseDirectory, 'session-state', sessionId);
      fs.mkdirSync(workspace, { recursive: true });
      let toolCalls = 0;
      const offered = () => config.tools.filter((/** @type {any} */ tool) => config.availableTools.includes(`custom:${tool.name}`));
      /** @param {string} name @param {unknown} args @param {string} toolCallId */
      const dispatch = (name, args, toolCallId) => {
        const tool = offered().find((/** @type {any} */ entry) => entry.name === name);
        if (!tool) throw Object.assign(new Error(`Tool '${name}' is not available in this session.`), { code: -32602 });
        return tool.handler(args, { sessionId, toolCallId, toolName: name, arguments: args, signal: new AbortController().signal });
      };
      /** @param {string} name @param {unknown} args */
      const invoke = (name, args) => {
        toolCalls += 1;
        const toolCallId = `${sessionId}-call-${toolCalls}`;
        config.onEvent({ type: 'assistant.message', data: { messageId: `${toolCallId}-request`, originatingMessageId: admission, content: '', toolRequests: [{ toolCallId, name }] } });
        return dispatch(name, args, toolCallId);
      };
      const model = async () => {
        if (held) await held.promise;
        const listed = await invoke('dude_a2a_evidence_inventory', {});
        if (listed.resultType !== 'success') {
          send({ type: 'worker', event: 'refused_late', sessionId, text: listed.textResultForLlm });
          return;
        }
        const records = JSON.parse(listed.textResultForLlm).records;
        const top = records.reduce((/** @type {any} */ best, /** @type {any} */ record) => (!best || record.number > best.number ? record : best), null);
        if (top) await invoke('dude_a2a_evidence_read', { reference: top.reference });
        send({ type: 'worker', event: 'answered', sessionId });
        config.onEvent({
          type: 'assistant.message',
          data: {
            messageId: `${sessionId}-reply`,
            originatingMessageId: admission,
            content: JSON.stringify({
              observedMaximum: top ? top.number : 0,
              explanation: top ? `The highest approved record I read is ${top.reference}, number ${top.number}.` : 'No approved record is listed.',
              limitations: 'Only the approved lifecycle records were inspected; other workspaces are unknown.',
              citations: top ? [{ reference: top.reference }] : [],
            }),
          },
        });
        config.onEvent({ type: 'session.idle', data: {} });
      };
      return {
        sessionId,
        /** The public getter, as the SDK defines it. */
        get workspacePath() {
          return workspace;
        },
        rpc: {
          metadata: {
            snapshot: async () => ({
              sessionId, startTime: new Date().toISOString(), modifiedTime: new Date().toISOString(), isRemote: false, alreadyInUse: false,
              workspacePath: workspace, workingDirectory: config.workingDirectory, currentMode: 'interactive', sessionLimits: null,
            }),
          },
          tools: {
            initializeAndValidate: async () => ({}),
            getCurrentMetadata: async () => ({
              tools: offered().map((/** @type {any} */ tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
            }),
            execute: async (/** @type {any} */ params) => dispatch(params.name, params.arguments, params.toolCallId),
          },
          instructions: { getSources: async () => ({ sources: [] }) },
          skills: { list: async () => ({ skills: [] }) },
          mcp: { listConfigured: async () => ({ servers: [] }) },
          extensions: { list: async () => ({ extensions: [] }) },
          agent: { list: async () => ({ agents: [] }), getCurrent: async () => ({ agent: null }) },
          model: { getCurrent: async () => ({ modelId: config.model }) },
          ...(account ? { gitHubAuth: { getStatus: async () => ({ ...signedIn }) } } : {}),
        },
        async send() {
          send({ type: 'worker', event: 'prompted', sessionId });
          setImmediate(() => { void model(); });
          return admission;
        },
        async abort() {
          send({ type: 'worker', event: 'aborted', sessionId });
        },
      };
    }

    async stop() {
      send({ type: 'worker', event: 'stopped' });
      return [];
    }

    async forceStop() {
      send({ type: 'worker', event: 'force_stopped' });
    }
  }
  const sdk = {
    CopilotClient,
    RuntimeConnection: { forStdio: () => ({ kind: 'component-fake-stdio' }) },
    defineTool: (/** @type {string} */ name, /** @type {object} */ config) => ({ name, ...config }),
  };
  return {
    adapters: { loadSdk: async () => sdk, tempParent },
    hold() {
      /** @type {() => void} */
      let resolve = () => undefined;
      const promise = new Promise((done) => { resolve = () => done(undefined); });
      held = { promise, resolve };
      return null;
    },
    release() {
      const pending = held;
      held = null;
      pending?.resolve();
      return null;
    },
  };
}

/**
 * A disk for the recorder's own `io.writeSync` seam: once armed, it fails the
 * first write of one record kind, and then every write of that operation's
 * journal. Other journals keep writing.
 */
function controllableDisk() {
  /** @type {string | null} */
  let armed = null;
  /** @type {Set<string>} */
  const failed = new Set();
  const enospc = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
  return {
    /** @param {string} kind */
    arm(kind) {
      armed = kind;
      return null;
    },
    writeSync: /** @type {typeof fs.writeSync} */ (/** @type {unknown} */ ((/** @type {number} */ fd, /** @type {Buffer} */ buffer,
      /** @type {number} */ offset, /** @type {number} */ length) => {
      const text = buffer.subarray(offset, offset + length).toString('utf8');
      const operation = /"operationId":"([0-9a-f-]{36})"/.exec(text)?.[1] ?? '';
      if (failed.has(operation)) throw enospc();
      if (armed && text.includes(`"kind":"${armed}"`)) {
        armed = null;
        failed.add(operation);
        throw enospc();
      }
      return fs.writeSync(fd, buffer, offset, length);
    })),
  };
}

// ---------------------------------------------------------------------------
// Real certificates, created with node:crypto for this run.
// ---------------------------------------------------------------------------

/** @param {number} length */
function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  /** @type {number[]} */
  const bytes = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** @param {number} tag @param {...Buffer} parts */
function der(tag, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

/** @param {...Buffer} parts */
const sequence = (...parts) => der(0x30, ...parts);

/** @param {string} dotted */
function objectId(dotted) {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [first * 40 + second];
  for (const value of rest) {
    const chunk = [value & 0x7f];
    for (let high = Math.floor(value / 128); high > 0; high = Math.floor(high / 128)) chunk.unshift(0x80 | (high & 0x7f));
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
}

/** A positive DER INTEGER. @param {Buffer} bytes */
function integer(bytes) {
  let value = bytes;
  while (value.length > 1 && value[0] === 0) value = value.subarray(1);
  return der(0x02, value[0] & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value);
}

/** @param {number} ms */
function utcTime(ms) {
  const iso = new Date(ms).toISOString();
  return der(0x17, Buffer.from(`${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`, 'ascii'));
}

const ECDSA_SHA256 = sequence(objectId('1.2.840.10045.4.3.2'));

/**
 * One self-signed X.509 v3 certificate over a fresh P-256 key, valid from
 * `notBefore` to `notAfter`. Test-owned and synthetic; never a credential.
 * @param {string} commonName @param {number} notBefore @param {number} notAfter
 */
function certificate(commonName, notBefore, notAfter) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const serial = crypto.randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x01;
  const name = sequence(der(0x31, sequence(objectId('2.5.4.3'), der(0x0c, Buffer.from(commonName, 'utf8')))));
  const tbs = sequence(der(0xa0, integer(Buffer.from([2]))), integer(serial), ECDSA_SHA256, name, sequence(utcTime(notBefore), utcTime(notAfter)),
    name, /** @type {Buffer} */ (publicKey.export({ type: 'spki', format: 'der' })));
  const raw = sequence(tbs, ECDSA_SHA256, der(0x03, Buffer.from([0]), crypto.sign('sha256', tbs, privateKey)));
  const lines = /** @type {string[]} */ (raw.toString('base64').match(/.{1,64}/g));
  return {
    commonName,
    certPem: `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`,
    keyPem: String(privateKey.export({ type: 'pkcs8', format: 'pem' })),
    pin: crypto.createHash('sha256').update(raw).digest('hex'),
  };
}

/** @type {Record<'a' | 'b' | 'stranger' | 'bExpired' | 'aFuture', ReturnType<typeof certificate>> | null} */
let issued = null;
function certificates() {
  if (!issued) {
    const now = Date.now();
    const day = 86_400_000;
    issued = {
      a: certificate('Dude component peer A', now - day, now + day),
      b: certificate('Dude component peer B', now - day, now + day),
      stranger: certificate('Dude component stranger', now - day, now + day),
      bExpired: certificate('Dude component peer B, expired', now - 10 * day, now - day),
      aFuture: certificate('Dude component peer A, not yet valid', now + day, now + 10 * day),
    };
  }
  return issued;
}

// ---------------------------------------------------------------------------
// The test side: disposable roots, peer processes, and observation helpers.
// ---------------------------------------------------------------------------

/** @type {string[]} */
const scratch = [];
/** @type {Set<import('node:child_process').ChildProcess>} */
const children = new Set();

/** @param {string} directory */
function removeTree(directory) {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** @param {number} ms */
const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * `promise`, or null once `ms` pass; the timer never outlives the race.
 * @template T @param {Promise<T>} promise @param {number} ms @returns {Promise<T | null>}
 */
function within(promise, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const expired = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return /** @type {Promise<T | null>} */ (Promise.race([promise, expired]).finally(() => clearTimeout(timer)));
}

/** @param {Buffer | string} value */
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** @param {string} content */
const rootMessage = (content) => ({ type: 'user.message', data: { content } });

/** @param {() => unknown} probe @param {string} label @param {number} [ms] */
async function waitFor(probe, label, ms = WAIT_MS) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (probe()) return;
    await delay(10);
  }
  assert.fail(`timed out waiting for ${label}`);
}

/** One peer's own root: no folder is shared with the other peer. @param {'a' | 'b'} side */
function peerRoot(side) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `dude-a2a-tls-${side}-`)));
  scratch.push(base);
  const dirs = {
    base,
    workspace: path.join(base, 'workspace'),
    owner: path.join(base, 'owner'),
    home: path.join(base, 'home'),
    temp: path.join(base, 'temp'),
    workerTemp: path.join(base, 'worker-temp'),
    config: path.join(base, 'owner', 'a2a.json'),
    cert: path.join(base, 'owner', 'cert.pem'),
    key: path.join(base, 'owner', 'key.pem'),
    token: path.join(base, 'owner', 'worker-token.txt'),
  };
  for (const directory of [dirs.workspace, dirs.owner, dirs.home, dirs.temp, ...(side === 'b' ? [dirs.workerTemp] : [])]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return dirs;
}
/** @typedef {ReturnType<typeof peerRoot>} PeerRoot */

/** One canonical draft idea ledger. @param {string} root @param {number} number @param {string} slug */
function writeIdea(root, number, slug) {
  const file = path.join(root, '.dude', 'ideas', `${String(number).padStart(3, '0')}-${slug}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ['---', `title: ${slug}`, `slug: ${slug}`, 'status: draft', 'spec_path:', '---', '', '## Idea', '',
    `Recorded capture ${number} for ${slug}.`, ''].join('\n'));
  return file;
}

/**
 * A separate Node process running the real provider in its own root.
 * @param {'a' | 'b'} side @param {PeerRoot} dirs
 * @param {{faultyDisk?: boolean, signIn?: {environment: Record<string, string>} | null, sessionId?: string}} [options] `signIn` binds an
 *   existing-sign-in worker from this test-owned Windows environment. `sessionId` names the process's host session; a peer
 *   recreated over the same root gets a new one.
 */
async function spawnPeer(side, dirs, { faultyDisk = false, signIn = null, sessionId = `component-session-${side}` } = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { HOME: dirs.home, USERPROFILE: dirs.home, TEMP: dirs.temp, TMP: dirs.temp, TMPDIR: dirs.temp };
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  const child = fork(SELF, [PEER_FLAG], { cwd: dirs.workspace, env, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  children.add(child);
  /** @type {Map<number, {resolve: (value: any) => void, reject: (error: Error) => void}>} */
  const waiting = new Map();
  let next = 0;
  const peer = {
    side,
    dirs,
    child,
    /** @type {string[]} */
    logs: [],
    /** Every root `user.message` text this test delivered, in order: this test is the provider's only input channel. @type {string[]} */
    inputs: [],
    /** Every tool result this test received, in order. @type {Array<{tool: string, result: {resultType: string, textResultForLlm: string}}>} */
    results: [],
    /** @type {Array<{event: string, sessionId?: string, text?: string}>} */
    worker: [],
    stderr: '',
    /** @type {{code: number | null, signal: NodeJS.Signals | null} | null} */
    exited: null,
    /** @type {Promise<{code: number | null, signal: NodeJS.Signals | null}>} */
    exit: new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        children.delete(child);
        peer.exited = { code, signal };
        for (const entry of waiting.values()) entry.reject(new Error(`peer ${side} exited (${code ?? signal}): ${peer.stderr}`));
        waiting.clear();
        resolve({ code, signal });
      });
    }),
    /** @param {Record<string, unknown>} message @returns {Promise<any>} */
    request(message) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error(`peer ${side} did not answer ${message.type} within ${WAIT_MS} ms: ${peer.stderr}`));
        }, WAIT_MS);
        waiting.set(id, {
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
        child.send({ ...message, id }, (error) => {
          if (!error) return;
          clearTimeout(timer);
          waiting.delete(id);
          reject(error);
        });
      });
    },
    /** @param {string} tool @param {unknown} args @returns {Promise<{resultType: string, textResultForLlm: string}>} */
    async call(tool, args) {
      const result = await peer.request({ type: 'call', tool, args });
      peer.results.push({ tool, result });
      return result;
    },
    /** @param {unknown} event */
    event(event) {
      const root = /** @type {any} */ (event);
      if (root?.type === 'user.message') peer.inputs.push(String(root.data?.content));
      return peer.request({ type: 'event', event });
    },
    /**
     * The first log line from `since` that satisfies `probe`.
     * @param {(line: string) => boolean} probe @param {string} label @param {number} [since]
     */
    async waitLog(probe, label, since = 0) {
      await waitFor(() => peer.logs.slice(since).some(probe), `${side}: ${label}; logs ${JSON.stringify(peer.logs.slice(since))}`);
      return /** @type {string} */ (peer.logs.slice(since).find(probe));
    },
    /** @param {string} event @param {number} count */
    async waitWorker(event, count = 1) {
      await waitFor(() => peer.worker.filter((entry) => entry.event === event).length >= count, `${side} worker ${event} x${count}`);
    },
  };
  child.stderr?.setEncoding('utf8').on('data', (chunk) => { peer.stderr += chunk; });
  child.on('message', (/** @type {any} */ message) => {
    if (message.type === 'log') peer.logs.push(message.text);
    else if (message.type === 'worker') peer.worker.push(message);
    else if (message.type === 'reply') {
      const entry = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.ok) entry?.resolve(message.value);
      else entry?.reject(new Error(String(message.value)));
    }
  });
  await peer.request({ type: 'init', side, root: dirs.workspace, sessionId, workerTemp: dirs.workerTemp, faultyDisk, signIn });
  return peer;
}
/** @typedef {Awaited<ReturnType<typeof spawnPeer>>} Peer */

/** @param {Peer} peer @param {Record<string, unknown>} args */
async function conversation(peer, args) {
  const result = await peer.call('dude_a2a_conversation', args);
  return { resultType: result.resultType, ...JSON.parse(result.textResultForLlm) };
}

/**
 * Read until `done` holds; each read is immediate and changes nothing.
 * @param {Peer} peer @param {string} operationId @param {(view: any) => boolean} done @param {string} label
 */
async function readUntil(peer, operationId, done, label) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const view = await conversation(peer, { op: 'read', operationId });
    if (done(view)) return view;
    await delay(20);
  }
  return assert.fail(`timed out waiting for ${label}`);
}
/** @param {any} view */
const decided = (view) => view.outcome !== 'pending';
/** @param {any} view */
const frozen = (view) => view.outcome !== 'pending' && view.cleanup !== 'pending';

/** A loopback port that was free a moment ago; activation retries when another process took it. */
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const { port } = /** @type {net.AddressInfo} */ (server.address());
  await new Promise((resolve) => { server.close(() => resolve(undefined)); });
  return port;
}

/**
 * Both peers in their own roots: A holds record 100 only; B holds 100 and 101.
 * With `signIn`, B's worker reuses an existing saved sign-in: its owner home and base directory are folders in B's
 * own root, and B's provider is bound from a test-owned Windows environment that also holds an ambient token.
 * @param {{faultyDisk?: boolean, signIn?: boolean}} [options]
 */
async function startPair(options = {}) {
  const dirs = { a: peerRoot('a'), b: peerRoot('b') };
  writeIdea(dirs.a.workspace, 100, 'gamma');
  writeIdea(dirs.b.workspace, 100, 'alpha');
  const beta = writeIdea(dirs.b.workspace, 101, 'beta');
  fs.writeFileSync(dirs.b.token, `${WORKER_TOKEN}\n`);
  const ownerHome = path.join(dirs.b.base, 'owner-home');
  const signIn = options.signIn ? {
    baseDirectory: path.join(ownerHome, '.copilot'),
    environment: {
      SystemRoot: 'C:\\Windows', USERPROFILE: ownerHome, APPDATA: path.join(ownerHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(ownerHome, 'AppData', 'Local'), GH_TOKEN: WORKER_TOKEN,
    },
  } : null;
  if (signIn) fs.mkdirSync(signIn.baseDirectory, { recursive: true });
  const a = await spawnPeer('a', dirs.a, { faultyDisk: options.faultyDisk });
  const b = await spawnPeer('b', dirs.b, { faultyDisk: options.faultyDisk, signIn });
  return { a, b, dirs, beta, signIn, port: 0 };
}
/** @typedef {Awaited<ReturnType<typeof startPair>>} Pair */

/**
 * Each owner's configuration and TLS files. Each peer's certificate is its
 * own; each pins the other's certificate unless a case says otherwise.
 * `pairing` makes both profiles request standing approval.
 * @param {Pair} pair
 * @param {{port: number, aCert?: ReturnType<typeof certificate>, bCert?: ReturnType<typeof certificate>, aPinsB?: string,
 *   bPinsA?: string, bContentBytes?: number, pairing?: boolean}} settings
 */
function writeConfigs(pair, settings) {
  const issuedNow = certificates();
  const aCert = settings.aCert ?? issuedNow.a;
  const bCert = settings.bCert ?? issuedNow.b;
  writeAsk(pair.dirs.a, { port: settings.port, cert: aCert, pinsB: settings.aPinsB ?? bCert.pin, pairing: settings.pairing });
  writeServe(pair.dirs.b, {
    port: settings.port, cert: bCert, pinsA: settings.bPinsA ?? aCert.pin, contentBytes: settings.bContentBytes, signIn: pair.signIn,
    pairing: settings.pairing,
  });
}

/**
 * One serving owner's TLS files and configuration: profile b-serve, labeled B, presents `cert` on the loopback `port`
 * and pins `pinsA`; its worker reads the owner's own workspace.
 * @param {PeerRoot} b
 * @param {{port: number, cert: ReturnType<typeof certificate>, pinsA: string, contentBytes?: number, signIn?: Pair['signIn'],
 *   pairing?: boolean}} settings
 */
function writeServe(b, settings) {
  fs.writeFileSync(b.cert, settings.cert.certPem);
  fs.writeFileSync(b.key, settings.cert.keyPem);
  const signIn = settings.signIn ?? null;
  const serve = {
    role: 'serve',
    label: 'B',
    workspace: b.workspace,
    peer: { label: 'A', address: '127.0.0.1', certSha256: settings.pinsA },
    tls: { certFile: b.cert, keyFile: b.key },
    sharing: { allowed: 'Lifecycle record numbers and cited record excerpts', excluded: 'Credentials and unrelated source', purpose: 'Advise first-capture numbering' },
    contentBytes: settings.contentBytes ?? 32_768,
    repeatUse: 'activation',
    listen: { address: '127.0.0.1', port: settings.port },
    evidenceRoots: [b.workspace],
    collaboration: {
      projectId: PROJECT,
      worker: {
        model: WORKER_MODEL,
        // Never started: the component fake SDK only records the connection it is given.
        runtime: signIn ? {
          path: path.join(b.owner, 'component-fake-runtime-never-started'), args: [],
          env: { inherit: ['SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'], set: {} },
          auth: { kind: 'existing-sign-in', baseDirectory: signIn.baseDirectory, expectedAccount: { host: 'https://github.com', login: 'Component-Owner' } },
        } : { path: path.join(b.owner, 'component-fake-runtime-never-started'), args: [], env: { inherit: [], set: {} }, tokenFile: b.token },
        roots: [b.workspace],
      },
    },
    ...(settings.pairing ? { pairing: true } : {}),
  };
  fs.writeFileSync(b.config, JSON.stringify({ profiles: { 'b-serve': serve } }));
}

/**
 * One asking owner's TLS files and configuration: profile a-ask, labeled A, presents `cert` and asks B on the loopback
 * `port`, pinning `pinsB`.
 * @param {PeerRoot} a @param {{port: number, cert: ReturnType<typeof certificate>, pinsB: string, pairing?: boolean}} settings
 */
function writeAsk(a, settings) {
  fs.writeFileSync(a.cert, settings.cert.certPem);
  fs.writeFileSync(a.key, settings.cert.keyPem);
  const ask = {
    role: 'ask',
    label: 'A',
    workspace: a.workspace,
    peer: { label: 'B', address: '127.0.0.1', port: settings.port, certSha256: settings.pinsB },
    tls: { certFile: a.cert, keyFile: a.key },
    sharing: { allowed: 'Number advice questions', excluded: 'Source and credentials', purpose: 'Ask B for its highest lifecycle number' },
    contentBytes: 32_768,
    askTimeoutMs: 60_000,
    repeatUse: 'activation',
    collaboration: { projectId: PROJECT },
    ...(settings.pairing ? { pairing: true } : {}),
  };
  fs.writeFileSync(a.config, JSON.stringify({ profiles: { 'a-ask': ask } }));
}

/**
 * Prepare a proposal and approve it with a synthetic root message (component
 * only, never human approval). Resolves with the activation or refusal line.
 * @param {Peer} peer @param {string} configPath @param {string} profileId
 */
async function approve(peer, configPath, profileId) {
  const proposal = await peer.call('dude_a2a_propose', { configPath, profileId });
  assert.equal(proposal.resultType, 'success', proposal.textResultForLlm);
  return approveShown(peer, proposal.textResultForLlm, profileId);
}

/**
 * Approve the exact code of a returned proposal with a synthetic root message
 * (component only, never human approval). Resolves with the activation line,
 * a refusal, or a saved pairing's inactive startup.
 * @param {Peer} peer @param {string} proposal The returned proposal text. @param {string} profileId
 */
async function approveShown(peer, proposal, profileId) {
  const code = /^Approval: dude a2a approve ([0-9a-f]{12});/m.exec(proposal)?.[1];
  assert.ok(code, 'the proposal names its approval');
  const since = peer.logs.length;
  await peer.event(rootMessage(`dude a2a approve ${code}`));
  return peer.waitLog((line) => /^(?:Activation: active|A2A approval refused|A2A paired, inactive)/.test(line), `${profileId} approval`, since);
}

/**
 * Activate B's real listener on a free loopback port, then A's pinned client.
 * @param {Pair} pair @param {Omit<Parameters<typeof writeConfigs>[1], 'port'>} [settings]
 */
async function activate(pair, settings = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const port = await freePort();
    writeConfigs(pair, { ...settings, port });
    const served = await approve(pair.b, pair.dirs.b.config, 'b-serve');
    if (served.startsWith('Activation: active')) {
      assert.ok(served.includes(`listening https://127.0.0.1:${port}/`), served);
      const asked = await approve(pair.a, pair.dirs.a.config, 'a-ask');
      assert.match(asked, /^Activation: active; ask profile a-ask/, asked);
      pair.port = port;
      return port;
    }
    assert.match(served, /already in use/, served);
    assert.ok(attempt < 3, `no free loopback port after ${attempt} attempts: ${served}`);
  }
}

/** End both activations; each closes its listener or client. @param {Pair} pair */
async function deactivate(pair) {
  for (const peer of [pair.a, pair.b]) if (!peer.exited) await peer.event(rootMessage('dude a2a stop'));
}

/**
 * B begins receiving and waits for its queue preflight; then A asks.
 * @param {Pair} pair @param {{question?: string, beforeAsk?: () => Promise<void>}} [options]
 */
async function beginExchange(pair, { question = QUESTION, beforeAsk } = {}) {
  const received = await conversation(pair.b, { op: 'begin_receive' });
  assert.equal(received.outcome, 'accepted', JSON.stringify(received));
  await pair.b.waitLog((line) => line === `Status: conversation ${received.operationId} waiting for one project question`, 'B waiting');
  await beforeAsk?.();
  const asked = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question });
  assert.equal(asked.outcome, 'accepted', JSON.stringify(asked));
  return { received, asked };
}

/**
 * Stop a peer's activation, close its IPC channel, and wait for the process to
 * exit by itself: a listener, socket, or timer left behind would keep it alive.
 * @param {Peer} peer
 */
async function finish(peer) {
  if (peer.exited) return peer.exited;
  try {
    await peer.event(rootMessage('dude a2a stop'));
  } catch {
    // The process may already be gone; its exit is what is observed below.
  }
  if (peer.child.connected) peer.child.disconnect();
  const exited = await within(peer.exit, EXIT_MS);
  if (exited) return exited;
  peer.child.kill();
  await peer.exit;
  return { code: null, signal: null, hung: true };
}

/** Best-effort end of both peers after a failed check; never masks the failure. @param {Pair} pair */
async function dispose(pair) {
  for (const peer of [pair.a, pair.b]) {
    if (peer.exited) continue;
    peer.child.kill();
    await within(peer.exit, EXIT_MS);
  }
}

/** Kill anything still running and remove every disposable root this suite created. */
async function removeEverything() {
  for (const child of children) child.kill();
  await delay(children.size ? 200 : 0);
  for (const directory of scratch) removeTree(directory);
}

/** @param {string} root */
const transcriptFolder = (root) => path.join(root, '.dude', 'state', 'a2a');

/** @param {string} file */
function journalRecords(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

/** @param {any[]} records @param {string} kind */
function only(records, kind) {
  const found = records.filter((record) => record.kind === kind);
  assert.equal(found.length, 1, `one ${kind} record in ${JSON.stringify(records.map((record) => record.kind))}`);
  return found[0];
}

/** @param {any[]} records */
const kinds = (records) => records.map((record) => record.kind);

/**
 * The shipped read-only transcript CLI in its own process.
 * @param {string} root @param {string} operationId @param {boolean} follow
 */
function tail(root, operationId, follow) {
  const child = spawn(process.execPath, [TRANSCRIPT_CLI, '--root', root, '--operation', operationId, ...(follow ? ['--follow'] : [])],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  const output = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output.stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output.stderr += chunk; });
  /** @type {Promise<number | null>} */
  const exited = new Promise((resolve) => {
    child.on('close', (code) => {
      children.delete(child);
      resolve(code);
    });
  });
  return { child, output, exited };
}

/** Connect without a client certificate and wait for the server to drop the connection. @param {number} port */
function connectWithoutCertificate(port) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false, checkServerIdentity: () => undefined });
    socket.on('error', () => undefined);
    socket.setTimeout(WAIT_MS, () => socket.destroy());
    socket.once('close', () => resolve(undefined));
  });
}

/** Whether a TCP connection to `port` is refused now. @param {number} port */
function connectionRefused(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(WAIT_MS, () => socket.destroy(new Error('timed out')));
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', (/** @type {NodeJS.ErrnoException} */ error) => resolve(error.code === 'ECONNREFUSED'));
  });
}

/** The worker storage folders kept below B's worker temp folder. @param {Pair} pair */
const retainedWorkerFolders = (pair) => fs.readdirSync(pair.dirs.b.workerTemp).filter((name) => name.startsWith('dude-a2a-w-'));

// ---------------------------------------------------------------------------
// Standing pairing over the real transport. Each owner enrolls once through
// the existing typed handshake, and later requests reuse only that owner's
// own saved grant. Every approval here is a synthetic root message, never
// human approval. Each record sits beside its owner's configuration in that
// peer's own disposable root under the OS temp folder, outside every
// workspace and Git checkout.
// ---------------------------------------------------------------------------

/** The record kinds of an answered asking journal and of a sent serving journal. */
const ANSWERED_KINDS = ['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received', 'reply_validated', 'terminal', 'closed'];
const SENT_KINDS = ['opened', 'accepted', 'request_admitted', 'worker_started', 'worker_preflight', 'worker_ready', 'worker_request_admitted',
  'evidence_returned', 'evidence_returned', 'worker_finished', 'reply_prepared', 'reply_write_started', 'reply_written', 'terminal', 'cleanup', 'closed'];
const NOTICE = 'A2A standing pairing in use: ';
const REVOKED = 'the standing pairing record was deleted, changed, or can no longer be read safely';

/**
 * A loopback port for paired profiles. The port is part of each approved
 * scope, so it stays the same across activations and restarts. It is free
 * now and below the default dynamic ranges (Linux from 32768, Windows and
 * macOS from 49152), so no ephemeral bind or outgoing connection takes it
 * meanwhile.
 */
async function pairedPort() {
  for (let attempt = 1; ; attempt += 1) {
    const port = 20_000 + crypto.randomInt(12_000);
    const server = net.createServer();
    const free = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => { server.close(() => resolve(true)); });
    });
    if (free) return port;
    assert.ok(attempt < 20, `no free loopback port below the dynamic ranges after ${attempt} attempts`);
  }
}

/**
 * Where one profile's standing record lives, derived independently of the
 * provider: beside the canonical configuration, named by the SHA-256 of the
 * exact profile ID.
 * @param {string} config @param {string} profileId
 */
const recordPath = (config, profileId) => path.join(`${fs.realpathSync.native(config)}.pairings`, `${sha256(profileId)}.json`);

/**
 * The pairing store refuses a folder inside a Git checkout or worktree,
 * recognized by a `.git` file or folder on the folder or any ancestor. These
 * disposable owner folders, like the OS temp folder they are in, must be
 * outside every one.
 * @param {string} directory
 */
function assertOutsideCheckouts(directory) {
  for (let folder = fs.realpathSync.native(directory); ; folder = path.dirname(folder)) {
    let marked = true;
    try {
      fs.lstatSync(path.join(folder, '.git'));
    } catch {
      marked = false;
    }
    assert.equal(marked, false, `${folder} has a .git marker, so no standing record could be kept below ${directory}`);
    if (path.dirname(folder) === folder) return;
  }
}

/** A file's exact bytes and identity: equal states show it was reused, not rewritten. @param {string} file */
function fileState(file) {
  const stat = fs.statSync(file, { bigint: true });
  return { bytes: fs.readFileSync(file).toString('base64'), ino: String(stat.ino), mtimeNs: String(stat.mtimeNs) };
}

/** A pin as the provider displays it. @param {string} hex */
const fingerprint = (hex) => `SHA-256 ${hex.toUpperCase().replace(/(..)(?!$)/g, '$1:')}`;

/**
 * The required notice of one automatic activation, derived from the owner's
 * configuration file independently of the provider's renderer: the standing
 * pairing in use, the peer, the workspace, every scope and limit, and how to
 * revoke it. It asks for nothing.
 * @param {PeerRoot} dirs @param {string} profileId
 */
function expectedNotice(dirs, profileId) {
  const profile = JSON.parse(fs.readFileSync(dirs.config, 'utf8')).profiles[profileId];
  const serving = profile.role === 'serve';
  return [
    `${NOTICE}${profile.label} ${profile.role} profile ${profileId} starts automatically, without a new approval; this notice needs no response`,
    `Peer: ${profile.peer.label}; ${serving ? `client address ${profile.peer.address}` : `https://${profile.peer.address}:${profile.peer.port}/`}; `
      + fingerprint(profile.peer.certSha256),
    `Workspace: ${profile.workspace}${serving ? `; listening https://${profile.listen.address}:${profile.listen.port}/` : ''}`,
    `SHARING: ${profile.sharing.allowed}; excludes ${profile.sharing.excluded}`,
    'COMMANDS: none',
    `WORKER: ${serving ? `separately approved for project ${PROJECT}; model ${WORKER_MODEL}` : 'none'}`,
    `Validity/limits: until activation ends; every in-scope exchange while active; ${profile.contentBytes} bytes per message`
      + `${serving ? '' : `; ${profile.askTimeoutMs} ms ask timeout`}; counts restart with each activation`,
    `Pairing record: ${recordPath(dirs.config, profileId)}; revoke: dude a2a stop, then delete that file`,
  ].join('\n');
}

/**
 * Both peers in their own roots, each with a pairing profile on one fixed
 * loopback port. Nobody has enrolled yet, and nothing listens.
 */
async function startPairing() {
  const pair = await startPair();
  for (const directory of [os.tmpdir(), pair.dirs.a.owner, pair.dirs.b.owner]) assertOutsideCheckouts(directory);
  pair.port = await pairedPort();
  writeConfigs(pair, { port: pair.port, pairing: true });
  return pair;
}

/**
 * One owner's enrollment through the existing typed handshake: the complete
 * PAIRING proposal, which saves, starts, and listens for nothing, then its
 * exact code as a synthetic eligible root input. That approval saves only
 * this owner's digest-only record, before its activation starts. Resolves
 * with the activation line.
 * @param {Peer} peer @param {'a-ask' | 'b-serve'} profileId @param {number} port
 */
async function enroll(peer, profileId, port) {
  const record = recordPath(peer.dirs.config, profileId);
  // The proposal shows only the rest after its Config path when the record's folder is literally that path plus `.pairings`.
  const rest = `.pairings${path.sep}${path.basename(record)}`;
  const shown = record === `${peer.dirs.config}${rest}` ? `Config path + ${rest}` : record;
  const { result, text: proposal } = await requestProfile(peer, profileId);
  assert.equal(result.resultType, 'success', proposal);
  const lines = proposal.split('\n');
  assert.equal(lines[0], 'Proposal only: nothing is activated. Review this entire native tool result before local approval.', proposal);
  for (const line of [
    'PAIRING: this approval persists for later matching sessions on this machine; any binding change needs new full approval; '
      + 'numeric repeat use resets per activation; absolute expiries do not extend',
    `Pairing record: ${shown}; digest only; revoke: dude a2a stop, then delete that file; stop or a config edit alone does not revoke`,
    'Pairing trust: ordinary root input does not prove human authorship; an unrestricted local file writer can forge or remove this grant',
  ]) assert.ok(lines.includes(line), `${profileId}: the proposal shows ${line.slice(0, 48)}...`);
  assert.match(proposal, /^Approval: dude a2a approve [0-9a-f]{12}; .+; also saves the PAIRING grant$/m);
  assert.ok(Buffer.byteLength(proposal, 'utf8') <= 4_490, `${profileId}: the complete proposal fits the fixed display cap`);
  assert.equal(fs.existsSync(path.dirname(record)), false, `${profileId}: preparing saves nothing`);
  if (profileId === 'b-serve') assert.equal(await connectionRefused(port), true, 'preparing listens for nothing');
  const since = peer.logs.length;
  const outcome = await approveShown(peer, proposal, profileId);
  assert.match(outcome, /^Activation: active; /, outcome);
  assert.equal(outcome.split('\n')[1], 'Authority: this exact local approval, also saved as a standing pairing; revoke: dude a2a stop, '
    + `then delete ${record}`);
  assert.ok(peer.logs.slice(since).includes(`A2A pairing saved: ${record}. It persists for later matching local sessions until you use `
    + 'dude a2a stop, then delete that file.'), JSON.stringify(peer.logs.slice(since)));
  assert.match(fs.readFileSync(record, 'utf8'), /^\{"version":1,"bindingSha256":"[0-9a-f]{64}"\}\n$/, 'a digest-only record');
  return outcome;
}

/**
 * A later local request for a paired profile through the same proposal tool.
 * Resolves with its result and every log line it produced.
 * @param {Peer} peer @param {'a-ask' | 'b-serve'} profileId
 */
async function requestProfile(peer, profileId) {
  const since = peer.logs.length;
  const result = await peer.call('dude_a2a_propose', { configPath: peer.dirs.config, profileId });
  return { result, text: result.textResultForLlm, logs: peer.logs.slice(since) };
}

/**
 * A later request that a matching standing record activates on its own: a
 * fresh activation with no code, approval instruction, or prompt, reported
 * active only after its one required notice was delivered.
 * @param {Peer} peer @param {'a-ask' | 'b-serve'} profileId @param {number} port
 */
async function activatePaired(peer, profileId, port) {
  const { result, text, logs } = await requestProfile(peer, profileId);
  assert.equal(result.resultType, 'success', text);
  const head = profileId === 'b-serve' ? `Activation: active; serve profile b-serve; listening https://127.0.0.1:${port}/`
    : 'Activation: active; ask profile a-ask; peer B';
  assert.equal(text.split('\n').slice(0, 2).join('\n'), `${head}\nAuthority: the standing pairing from an earlier exact local approval; `
    + `nothing new was approved; revoke: dude a2a stop, then delete ${recordPath(peer.dirs.config, profileId)}`, text);
  assert.match(text, /\nConversation: dude_a2a_conversation begin_/, 'the approved collaboration scope is live');
  assert.doesNotMatch(text, /dude a2a approve|Proposal only|preparation only/i, 'no fresh approval instruction');
  assert.deepEqual(logs, [expectedNotice(peer.dirs, profileId)], 'exactly the required notice, delivered before the result');
}

/**
 * The enrollment proposal that a request gets when this owner has no
 * matching record: nothing activates, listens, or gives a notice.
 * @param {Peer} peer @param {'a-ask' | 'b-serve'} profileId
 */
async function enrollmentOnly(peer, profileId) {
  const { result, text, logs } = await requestProfile(peer, profileId);
  assert.equal(result.resultType, 'success', text);
  assert.match(text, /^Proposal only: nothing is activated\./, text);
  assert.match(text, /^Approval: dude a2a approve [0-9a-f]{12}; .+; also saves the PAIRING grant$/m);
  assert.deepEqual(logs, [], `${profileId}: no notice, and nothing activated`);
}

/**
 * The approval prompts and inputs one owner's peer processes saw, from the
 * first process on: every result or log line carrying an approval code, and
 * every `dude a2a approve` root input.
 * @param {Peer[]} processes
 */
function approvals(processes) {
  const instruction = /dude a2a approve [0-9a-f]{12}/;
  return {
    prompts: processes.flatMap((peer) => [...peer.results.map((entry) => entry.result.textResultForLlm), ...peer.logs])
      .filter((text) => instruction.test(text)).length,
    inputs: processes.flatMap((peer) => peer.inputs).filter((input) => input.startsWith('dude a2a approve')).length,
  };
}

/**
 * One in-scope conversation over the live activations, its actual messages
 * checked across both journals: A's recorded request is what B admitted,
 * and B's recorded reply is what A received and accepted. Resolves with the
 * identifiers it was given.
 * @param {Pair} pair @param {string} question
 * @param {{received: any, asked: any}} [begun] An exchange already begun with this question.
 */
async function converse(pair, question, begun) {
  const { received, asked } = begun ?? await beginExchange(pair, { question });
  const answer = await readUntil(pair.a, asked.operationId, decided, 'A answer');
  const sent = await readUntil(pair.b, received.operationId, frozen, 'B frozen');
  assert.deepEqual([answer.resultType, answer.outcome, answer.delivery, answer.recording, answer.advice?.observedMaximum],
    ['success', 'answer', 'reached_peer', 'complete', 101], JSON.stringify(answer));
  assert.deepEqual([sent.resultType, sent.outcome, sent.delivery, sent.recording], ['success', 'sent', 'written', 'complete'], JSON.stringify(sent));
  const aRecords = journalRecords(asked.transcript);
  const bRecords = journalRecords(received.transcript);
  assert.deepEqual([kinds(aRecords), kinds(bRecords)], [ANSWERED_KINDS, SENT_KINDS], 'every boundary is recorded on both sides');
  const requestBody = JSON.parse(only(aRecords, 'request_write_started').data.body);
  const questionId = requestBody.params.message.messageId;
  const admitted = only(bRecords, 'request_admitted').data;
  assert.deepEqual([admitted.messageId, admitted.text], [questionId, requestBody.params.message.parts[0].text],
    'B admitted exactly the request A recorded before its first byte');
  assert.deepEqual(JSON.parse(admitted.text), {
    version: 1, kind: 'number_advice', projectId: PROJECT, conversationId: asked.conversationId, slug: 'delta', tentativeNumber: 101, question,
  });
  const replyBody = JSON.parse(only(bRecords, 'reply_write_started').data.body);
  const { questionId: repliedTo, ...reply } = only(aRecords, 'reply_received').data.reply;
  assert.deepEqual(replyBody.result.message.parts, [{ data: reply, mediaType: 'application/json' }],
    'A received exactly the reply B recorded before its first byte');
  assert.deepEqual([replyBody.result.message.metadata.dudeA2a.replyTo, repliedTo, reply.exchangeId], [questionId, questionId, admitted.exchangeId]);
  assert.deepEqual(answer.advice.evidence.map((/** @type {any} */ item) => [item.existingFile, item.excerpt]),
    [['workspace/.dude/ideas/101-beta.md', fs.readFileSync(pair.beta, 'utf8')]]);
  const { binding } = only(bRecords, 'worker_preflight').data;
  assert.deepEqual([binding.operationId, binding.conversationId, binding.questionId, binding.exchangeId],
    [received.operationId, asked.conversationId, questionId, admitted.exchangeId], "B's worker is bound to this exchange");
  assert.match(binding.permitId, UUID);
  return { asked, received, questionId, exchangeId: admitted.exchangeId, binding };
}

/**
 * A's ask while no B serves: the existing unavailable outcome, with no
 * request byte written anywhere.
 * @param {Peer} asker
 */
async function unavailableAsk(asker) {
  const asked = await conversation(asker, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
  assert.equal(asked.outcome, 'accepted', JSON.stringify(asked));
  const view = await readUntil(asker, asked.operationId, frozen, 'A told B is unavailable');
  assert.deepEqual([view.outcome, view.reason, view.delivery, view.advice, view.recording], ['unavailable', 'peer_unreachable', 'not_sent', undefined, 'complete'],
    JSON.stringify(view));
  assert.deepEqual(kinds(journalRecords(asked.transcript)), ['opened', 'accepted', 'request_prepared', 'terminal', 'closed'], 'no request byte left A');
}

/**
 * A third independent peer process, in its own root, presenting the stranger
 * certificate under the real peer's label and project. Its ordinary
 * configuration pins the real other peer on the pair's port, so the only
 * wrong thing about it is the identity it presents.
 * @param {'a' | 'b'} side @param {number} port
 */
async function startImpostor(side, port) {
  const dirs = peerRoot(side);
  const issuedNow = certificates();
  if (side === 'b') {
    fs.writeFileSync(dirs.token, `${WORKER_TOKEN}\n`);
    writeServe(dirs, { port, cert: issuedNow.stranger, pinsA: issuedNow.a.pin });
  } else {
    writeAsk(dirs, { port, cert: issuedNow.stranger, pinsB: issuedNow.b.pin });
  }
  return spawnPeer(side, dirs, { sessionId: `component-session-impostor-${side}` });
}

function defineTests() {
  after(removeEverything);

  test('real mutual TLS between two peer processes: correlated wire messages, a live tail before B answers, a retained reread after both exit, and honest worker cleanup', { timeout: 120_000 }, async (context) => {
    const pair = await startPair();
    /** @type {Array<ReturnType<typeof tail>>} */
    const tails = [];
    try {
      const port = await activate(pair);
      await pair.b.request({ type: 'hold' });
      let started = performance.now();
      const { received, asked } = await beginExchange(pair);
      const beginMs = performance.now() - started;
      const aJournal = path.join(transcriptFolder(pair.dirs.a.workspace), `${asked.operationId}.jsonl`);
      const bJournal = path.join(transcriptFolder(pair.dirs.b.workspace), `${received.operationId}.jsonl`);
      assert.deepEqual([asked.transcript, received.transcript], [aJournal, bJournal], 'each peer journals in its own root');
      assert.match(asked.conversationId, UUID);
      await pair.b.waitWorker('prompted');

      // While B's worker is held: each side's journal is readable live from a third process.
      tails.push(tail(pair.dirs.a.workspace, asked.operationId, true), tail(pair.dirs.b.workspace, received.operationId, true));
      const [aLive, bLive] = tails;
      await waitFor(() => aLive.output.stdout.includes(' request_write_started ') && bLive.output.stdout.includes(' worker_started '),
        'both tails show the exchange while B reasons');
      assert.ok(aLive.output.stdout.includes(QUESTION) && bLive.output.stdout.includes(QUESTION), 'each tail shows the actual question');
      assert.equal(aLive.output.stdout.includes(' reply_received '), false, 'no reply is shown before B answers');

      started = performance.now();
      const pendingA = await conversation(pair.a, { op: 'read', operationId: asked.operationId });
      const pendingB = await conversation(pair.b, { op: 'read', operationId: received.operationId });
      const readMs = performance.now() - started;
      assert.deepEqual([pendingA.outcome, pendingA.phase, pendingB.outcome, pendingB.phase], ['pending', 'awaiting_reply', 'pending', 'reasoning']);
      const busyA = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      const busyB = await conversation(pair.b, { op: 'begin_receive' });
      assert.deepEqual([busyA.outcome, busyA.reason, busyA.busy, busyB.outcome, busyB.reason, busyB.busy],
        ['refused', 'busy', 'conversation', 'refused', 'busy', 'conversation'], 'one operation per activation; nothing queues');
      const legacy = JSON.parse((await pair.a.call('dude_a2a_ask', { question: QUESTION })).textResultForLlm);
      assert.deepEqual([legacy.outcome, legacy.reason, legacy.delivery], ['refused', 'conversation_in_progress', 'not_sent']);
      context.diagnostic(`component timings while B's fake worker was held (not native targets): begin_receive plus begin_ask ${beginMs.toFixed(1)} ms; `
        + `two reads ${readMs.toFixed(1)} ms`);

      await pair.b.request({ type: 'release' });
      const answer = await readUntil(pair.a, asked.operationId, decided, 'A answer');
      const sent = await readUntil(pair.b, received.operationId, frozen, 'B frozen');
      assert.deepEqual([answer.resultType, answer.outcome, answer.delivery, answer.recording], ['success', 'answer', 'reached_peer', 'complete']);
      assert.deepEqual([sent.resultType, sent.outcome, sent.delivery, sent.recording], ['success', 'sent', 'written', 'complete']);
      assert.deepEqual(await Promise.all(tails.map((entry) => entry.exited)), [0, 0], 'each tail ends at its closed record');
      assert.match(aLive.output.stdout, /\n-- journal complete: 8 records; outcome answer\n$/);
      assert.match(bLive.output.stdout, /\n-- journal complete: 16 records; outcome sent\n$/);

      // The journals hold the actual messages, correlated across both peers over the real sockets.
      const aRecords = journalRecords(aJournal);
      const bRecords = journalRecords(bJournal);
      assert.deepEqual(kinds(aRecords), ['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received', 'reply_validated',
        'terminal', 'closed'], "A's answered journal is exactly its eight records");
      assert.deepEqual(kinds(bRecords), ['opened', 'accepted', 'request_admitted', 'worker_started', 'worker_preflight', 'worker_ready',
        'worker_request_admitted', 'evidence_returned', 'evidence_returned', 'worker_finished', 'reply_prepared', 'reply_write_started', 'reply_written',
        'terminal', 'cleanup', 'closed']);
      const issuedNow = certificates();
      assert.deepEqual([aRecords[0].data.peer, bRecords[0].data.peer],
        [{ label: 'B', certSha256: issuedNow.b.pin }, { label: 'A', certSha256: issuedNow.a.pin }], 'each header names the real peer pin');
      const requestBody = JSON.parse(only(aRecords, 'request_write_started').data.body);
      assert.deepEqual([requestBody.jsonrpc, requestBody.method], ['2.0', 'SendMessage']);
      const questionId = requestBody.params.message.messageId;
      const admitted = only(bRecords, 'request_admitted').data;
      assert.deepEqual([admitted.messageId, admitted.text], [questionId, requestBody.params.message.parts[0].text],
        'B admitted exactly the request A recorded before its first byte');
      assert.deepEqual(JSON.parse(admitted.text), {
        version: 1, kind: 'number_advice', projectId: PROJECT, conversationId: asked.conversationId, slug: 'delta', tentativeNumber: 101, question: QUESTION,
      });
      const replyBody = JSON.parse(only(bRecords, 'reply_write_started').data.body);
      const receivedReply = only(aRecords, 'reply_received').data.reply;
      const { questionId: repliedTo, ...reply } = receivedReply;
      assert.deepEqual(replyBody.result.message.parts, [{ data: reply, mediaType: 'application/json' }],
        'A received exactly the reply B recorded before its first byte');
      assert.deepEqual([replyBody.result.message.metadata.dudeA2a.replyTo, repliedTo], [questionId, questionId]);
      assert.equal(reply.exchangeId, admitted.exchangeId);
      assert.equal(only(bRecords, 'reply_written').data.written, 'sent');

      // The advice carries B's real evidence and binds exactly A's recorded reply.
      assert.equal(answer.advice.observedMaximum, 101);
      assert.deepEqual(answer.advice.evidence.map((/** @type {any} */ item) => [item.existingFile, item.excerpt]),
        [['workspace/.dude/ideas/101-beta.md', fs.readFileSync(pair.beta, 'utf8')]]);
      assert.deepEqual(answer.advice.capture, {
        version: 1,
        slug: 'delta',
        projectId: PROJECT,
        conversationId: asked.conversationId,
        operationId: asked.operationId,
        questionId,
        exchangeId: admitted.exchangeId,
        peerCertSha256: issuedNow.b.pin,
        reply: { sequence: 5, sha256: sha256(JSON.stringify(receivedReply)) },
        observedMaximum: 101,
      });

      // B's served worker recorded its readiness before its prompt, bound to the exchange that crossed the real sockets.
      // Component evidence only: the fake SDK came through a test adapter and no extension supplied joined provenance.
      const preflight = only(bRecords, 'worker_preflight').data;
      assert.deepEqual(preflight.binding, {
        operationId: received.operationId, permitId: preflight.binding.permitId, mainSessionId: 'component-session-b',
        providerGeneration: preflight.binding.providerGeneration, configDigest: sha256(fs.readFileSync(pair.dirs.b.config)), projectId: PROJECT,
        conversationId: asked.conversationId, questionId, exchangeId: admitted.exchangeId,
      });
      assert.deepEqual(preflight.loaders, { joined: { source: 'unavailable' }, worker: { source: 'test_adapter' } }, 'no production provenance here');
      assert.deepEqual(preflight.probes.map((/** @type {any} */ probe) => [probe.id, probe.cause]), [['dude-a2a-preflight-inventory', 'invalid_arguments']]);
      assert.deepEqual(only(bRecords, 'worker_ready').data.observationSha256, sha256(JSON.stringify(preflight)));
      assert.equal(only(bRecords, 'worker_request_admitted').data.admissionId, `${preflight.sessionId}-prompt`);
      assert.deepEqual(sent.startup, {
        status: 'ready', workerId: preflight.workerId, sessionId: preflight.sessionId, observationSha256: sha256(JSON.stringify(preflight)),
      });

      // Worker cleanup is reported honestly: the fake runtime "stopped", yet cessation stays unconfirmed and storage is kept.
      const cleanup = only(bRecords, 'cleanup').data;
      assert.deepEqual([cleanup.runtime, cleanup.stop, cleanup.storage], ['unconfirmed', 'clean', 'retained']);
      assert.deepEqual(sent.cleanup, cleanup);
      assert.ok(cleanup.retainedPath.startsWith(pair.dirs.b.workerTemp + path.sep), cleanup.retainedPath);
      assert.ok(fs.existsSync(cleanup.retainedPath), 'the worker storage is kept, never deleted');
      // What the component fake session reported about its own storage, as B's worker observed and recorded it: a folder in
      // the worker's own configuration storage, by exact identity. Component evidence of the recording only, not of a runtime.
      assert.equal(preflight.storage, cleanup.retainedPath);
      const workspace = path.join(cleanup.retainedPath, 'config', 'session-state', preflight.sessionId);
      const directory = fs.statSync(workspace, { bigint: true });
      assert.deepEqual(preflight.sessionStorage, {
        kind: 'workspace', metadataSessionId: preflight.sessionId, workspacePath: workspace,
        directory: { dev: directory.dev.toString(), ino: directory.ino.toString() },
      });

      // Both processes end by themselves once their activations stop; B's listener is gone.
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
      assert.equal(await connectionRefused(port), true, "B's loopback listener closed with its process");
      assert.ok(fs.existsSync(cleanup.retainedPath), 'nothing deleted the worker storage at exit either');

      // A retained reread after both processes ended shows exactly what was live.
      const reread = [tail(pair.dirs.a.workspace, asked.operationId, false), tail(pair.dirs.b.workspace, received.operationId, false)];
      assert.deepEqual(await Promise.all(reread.map((entry) => entry.exited)), [0, 0]);
      assert.equal(reread[0].output.stdout, aLive.output.stdout, "A's retained transcript matches its live view");
      assert.equal(reread[1].output.stdout, bLive.output.stdout, "B's retained transcript matches its live view");
      const everything = fs.readFileSync(aJournal, 'utf8') + fs.readFileSync(bJournal, 'utf8');
      for (const secret of [WORKER_TOKEN, 'PRIVATE KEY', issuedNow.a.keyPem.split('\n')[1], 'You are a restricted evidence worker', 'a2a-version']) {
        assert.equal(everything.toLowerCase().includes(secret.toLowerCase()), false, `no record carries ${secret.slice(0, 40)}`);
      }
      assert.doesNotMatch(everything, /approve [0-9a-f]{12}/, 'no approval code is recorded');
    } finally {
      for (const entry of tails) entry.child.kill();
      await dispose(pair);
    }
  });

  test('real mutual TLS with existing sign-in: B\'s worker reuses the runtime\'s own saved sign-in, its version 2 readiness record crosses the production receiver, and A\'s eight-record journal and advice are unchanged', { timeout: 120_000 }, async () => {
    const pair = await startPair({ signIn: true });
    try {
      await activate(pair);
      const { received, asked } = await beginExchange(pair);
      const answer = await readUntil(pair.a, asked.operationId, decided, 'A answer');
      const sent = await readUntil(pair.b, received.operationId, frozen, 'B frozen');
      assert.deepEqual([answer.resultType, answer.outcome, answer.delivery, answer.recording, answer.advice?.observedMaximum],
        ['success', 'answer', 'reached_peer', 'complete', 101], JSON.stringify(answer));
      assert.deepEqual([sent.resultType, sent.outcome, sent.delivery, sent.recording], ['success', 'sent', 'written', 'complete']);
      const constructed = pair.b.worker.find((entry) => entry.event === 'constructed');
      assert.deepEqual(constructed && [constructed.mode, constructed.useLoggedInUser, constructed.keys],
        ['copilot-cli', true, ['baseDirectory', 'connection', 'mode', 'useLoggedInUser', 'workingDirectory']], 'the normal client, with no token option');

      const aRecords = journalRecords(asked.transcript);
      const bRecords = journalRecords(received.transcript);
      assert.deepEqual(kinds(aRecords), ['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received', 'reply_validated',
        'terminal', 'closed'], "A's answered journal is still exactly its eight records");
      assert.deepEqual(kinds(bRecords), ['opened', 'accepted', 'request_admitted', 'worker_started', 'worker_preflight', 'worker_ready',
        'worker_request_admitted', 'evidence_returned', 'evidence_returned', 'worker_finished', 'reply_prepared', 'reply_write_started', 'reply_written',
        'terminal', 'cleanup', 'closed']);
      const preflight = only(bRecords, 'worker_preflight').data;
      const kept = { isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'component-owner' };
      assert.deepEqual([preflight.version, preflight.auth], [2, { runtime: kept, session: kept }]);
      assert.equal(preflight.sessionStorage.kind, 'normal');
      const signIn = /** @type {NonNullable<Pair['signIn']>} */ (pair.signIn);
      assert.equal(path.dirname(path.dirname(preflight.sessionStorage.workspacePath)), fs.realpathSync.native(signIn.baseDirectory),
        'the session kept its normal storage under the approved base directory');
      assert.equal(Object.hasOwn(preflight, 'ambient') || Object.hasOwn(preflight, 'probes'), false, 'no strict result is fabricated');
      assert.ok(Buffer.byteLength(JSON.stringify(preflight)) <= 8_192);
      assert.equal(only(bRecords, 'worker_ready').data.observationSha256, sha256(JSON.stringify(preflight)));
      assert.deepEqual(Object.keys(answer.advice.capture),
        ['version', 'slug', 'projectId', 'conversationId', 'operationId', 'questionId', 'exchangeId', 'peerCertSha256', 'reply', 'observedMaximum']);

      const cleanup = only(bRecords, 'cleanup').data;
      assert.deepEqual([cleanup.runtime, cleanup.storage], ['unconfirmed', 'retained']);
      assert.ok(fs.existsSync(signIn.baseDirectory) && fs.existsSync(preflight.sessionStorage.workspacePath), 'nothing under the base directory is deleted');
      const everything = fs.readFileSync(asked.transcript, 'utf8') + fs.readFileSync(received.transcript, 'utf8');
      assert.equal(everything.includes(WORKER_TOKEN), false, "the ambient token in B's environment reaches no record");
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
    } finally {
      await dispose(pair);
    }
  });

  test('wrong pins, certificates outside their validity, a client without a certificate, and an over-budget question are refused before admission', { timeout: 120_000 }, async (context) => {
    const pair = await startPair();
    const issuedNow = certificates();
    try {
      /**
       * One case on fresh activations: B waits to receive, A asks once, then
       * both stop. B never admits anything, so its journal stays empty.
       * @param {string} label @param {Omit<Parameters<typeof writeConfigs>[1], 'port'>} settings
       * @param {{question?: string, beforeAsk?: (port: number) => Promise<void>}} [options]
       */
      const refusedCase = async (label, settings, options = {}) => {
        const port = await activate(pair, settings);
        const since = pair.b.logs.length;
        const { received, asked } = await beginExchange(pair, {
          question: options.question,
          beforeAsk: options.beforeAsk ? () => /** @type {any} */ (options.beforeAsk)(port) : undefined,
        });
        const aView = await readUntil(pair.a, asked.operationId, decided, `${label}: A decided`);
        const bView = await conversation(pair.b, { op: 'read', operationId: received.operationId });
        assert.deepEqual([bView.outcome, bView.phase], ['pending', 'waiting'], `${label}: B admitted nothing and still waits`);
        const bLogs = pair.b.logs.slice(since);
        await deactivate(pair);
        const bRecords = journalRecords(received.transcript);
        assert.deepEqual(kinds(bRecords), ['opened', 'accepted', 'terminal', 'closed'], `${label}: B recorded no question`);
        assert.equal(pair.b.worker.length, 0, `${label}: no worker started`);
        context.diagnostic(`${label}: A ${aView.outcome}/${aView.reason}/${aView.delivery}`);
        return { aView, aRecords: journalRecords(asked.transcript), bLogs };
      };

      const serverPin = await refusedCase('server pin mismatch', { aPinsB: issuedNow.stranger.pin }, {
        beforeAsk: async (port) => {
          const since = pair.b.logs.length;
          await connectWithoutCertificate(port);
          await pair.b.waitLog((line) => line.startsWith('A2A refused a peer request: certificate_required.'), 'no client certificate refused', since);
        },
      });
      assert.deepEqual([serverPin.aView.outcome, serverPin.aView.reason, serverPin.aView.delivery], ['refused', 'certificate_mismatch', 'not_sent']);
      assert.deepEqual(kinds(serverPin.aRecords), ['opened', 'accepted', 'request_prepared', 'terminal', 'closed'],
        'the request was never recorded as written: no byte left A');

      const clientPin = await refusedCase('client pin mismatch', { bPinsA: issuedNow.stranger.pin });
      assert.ok(clientPin.bLogs.some((line) => line.startsWith('A2A refused a peer request: certificate_mismatch.')), JSON.stringify(clientPin.bLogs));
      assert.deepEqual([clientPin.aView.outcome, clientPin.aView.reason, clientPin.aView.delivery], ['uncertain', 'connection_lost', 'may_have_occurred'],
        'A finished its own handshake and may have written; B dropped the connection before reading it');

      const expired = await refusedCase('expired server certificate', { bCert: issuedNow.bExpired });
      assert.deepEqual([expired.aView.outcome, expired.aView.reason, expired.aView.delivery], ['refused', 'certificate_not_current', 'not_sent']);
      assert.deepEqual(kinds(expired.aRecords), ['opened', 'accepted', 'request_prepared', 'terminal', 'closed']);

      const future = await refusedCase('client certificate not yet valid', { aCert: issuedNow.aFuture });
      assert.ok(future.bLogs.some((line) => line.startsWith('A2A refused a peer request: certificate_not_current.')), JSON.stringify(future.bLogs));
      assert.deepEqual([future.aView.outcome, future.aView.reason, future.aView.delivery], ['uncertain', 'connection_lost', 'may_have_occurred']);

      // B's real listener refuses a request body larger than its contentBytes before reading it.
      const long = `${QUESTION} ${'Please consider every approved lifecycle record. '.repeat(30)}`.trim();
      const budget = await refusedCase('over-budget question', { bContentBytes: 1_024 }, { question: long });
      assert.ok(budget.bLogs.some((line) => line.startsWith('A2A refused a peer request: content_too_large.')), JSON.stringify(budget.bLogs));
      assert.deepEqual([budget.aView.outcome, budget.aView.reason, budget.aView.delivery], ['refused', 'peer_refused', 'reached_peer']);
      assert.ok(Buffer.byteLength(only(budget.aRecords, 'request_write_started').data.body) > 1_024, 'the refused body exceeded B\'s bound');

      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
    } finally {
      await dispose(pair);
    }
  });

  test('cancel closes the real socket and ends B\'s held worker with no late success; B\'s process dying leaves A uncertain and B\'s journal and worker storage honest', { timeout: 120_000 }, async (context) => {
    const pair = await startPair();
    try {
      await activate(pair);
      await pair.b.request({ type: 'hold' });
      const first = await beginExchange(pair);
      await pair.b.waitWorker('prompted');
      const started = performance.now();
      const cancelled = await conversation(pair.a, { op: 'cancel', operationId: first.asked.operationId });
      context.diagnostic(`component cancel while B's fake worker was held: ${(performance.now() - started).toFixed(1)} ms (not a native target)`);
      assert.deepEqual([cancelled.outcome, cancelled.reason, cancelled.delivery, cancelled.cancelled], ['cancelled', 'cancelled', 'may_have_occurred', true]);
      const lost = await readUntil(pair.b, first.received.operationId, frozen, 'B after A closed its socket');
      assert.deepEqual([lost.outcome, lost.reason, lost.delivery], ['cancelled', 'asker_disconnected', 'not_sent'],
        "A's cancel closed the connection, and B saw the socket loss");
      assert.equal(lost.worker.outcome, 'cancelled');
      assert.deepEqual([lost.cleanup.runtime, lost.cleanup.abort, lost.cleanup.storage], ['unconfirmed', 'acknowledged', 'retained']);
      await pair.b.waitWorker('aborted');

      // Released after the end: the fake model's late tool call is refused and nothing revives either side.
      await pair.b.request({ type: 'release' });
      await pair.b.waitWorker('refused_late');
      assert.match(String(pair.b.worker.find((entry) => entry.event === 'refused_late')?.text), /worker_not_running/);
      const aAfter = await conversation(pair.a, { op: 'read', operationId: first.asked.operationId });
      const bAfter = await conversation(pair.b, { op: 'read', operationId: first.received.operationId });
      assert.deepEqual([aAfter.outcome, aAfter.advice, bAfter.outcome, bAfter.reason], ['cancelled', undefined, 'cancelled', 'asker_disconnected']);
      const aRecords = journalRecords(first.asked.transcript);
      const bRecords = journalRecords(first.received.transcript);
      assert.deepEqual(kinds(aRecords), ['opened', 'accepted', 'request_prepared', 'request_write_started', 'terminal', 'closed']);
      assert.deepEqual(only(aRecords, 'terminal').data, { outcome: 'cancelled', reason: 'cancelled', delivery: 'may_have_occurred' });
      assert.deepEqual(only(bRecords, 'terminal').data, { outcome: 'cancelled', reason: 'asker_disconnected', delivery: 'not_sent' });
      assert.equal(kinds(bRecords).includes('reply_prepared'), false, 'no reply was prepared after the asker left');

      // A second held exchange; then B's process dies with the request open.
      await pair.b.request({ type: 'hold' });
      const second = await beginExchange(pair);
      await pair.b.waitWorker('prompted', 2);
      pair.b.child.kill('SIGKILL');
      const killed = await pair.b.exit;
      assert.ok(killed.code !== 0 || killed.signal !== null, JSON.stringify(killed));
      const uncertain = await readUntil(pair.a, second.asked.operationId, decided, 'A after B died');
      assert.deepEqual([uncertain.outcome, uncertain.reason, uncertain.delivery, uncertain.advice, uncertain.recording],
        ['uncertain', 'connection_lost', 'may_have_occurred', undefined, 'complete']);
      const aShown = tail(pair.dirs.a.workspace, second.asked.operationId, false);
      assert.equal(await aShown.exited, 0);
      assert.match(aShown.output.stdout, /\n-- journal complete: 6 records; outcome uncertain \(connection_lost\)\n$/);
      const bShown = tail(pair.dirs.b.workspace, second.received.operationId, false);
      assert.equal(await bShown.exited, 1);
      assert.match(bShown.output.stdout, /\n-- journal INCOMPLETE: no terminal record; not closed\n$/, 'a killed peer\'s journal never reads as complete');
      assert.equal(retainedWorkerFolders(pair).length, 2, 'both workers\' storage is kept; nothing deleted it');

      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
    } finally {
      await dispose(pair);
    }
  });

  test('recording over real sockets: ten retained conversations refuse before disclosure, and a failing journal disk on either side withholds the next byte', { timeout: 120_000 }, async () => {
    const pair = await startPair({ faultyDisk: true });
    try {
      await activate(pair);
      const received = await conversation(pair.b, { op: 'begin_receive' });
      await pair.b.waitLog((line) => line === `Status: conversation ${received.operationId} waiting for one project question`, 'B waiting');

      // Ten retained conversations: A refuses to begin, so nothing is recorded or sent.
      const folder = transcriptFolder(pair.dirs.a.workspace);
      fs.mkdirSync(folder, { recursive: true });
      const kept = Array.from({ length: 10 }, () => path.join(folder, `${crypto.randomUUID()}.jsonl`));
      for (const file of kept) fs.writeFileSync(file, '{}\n');
      const full = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      assert.deepEqual([full.resultType, full.outcome, full.reason], ['failure', 'refused', 'recording_full']);
      assert.deepEqual(fs.readdirSync(folder).sort(), kept.map((file) => path.basename(file)).sort(), 'nothing was rotated or added');
      for (const file of kept) fs.rmSync(file);

      // A's disk fails while it records the request body: no request byte is written, and B admits nothing.
      await pair.a.request({ type: 'fail-next', kind: 'request_write_started' });
      const unsent = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      const unsentView = await readUntil(pair.a, unsent.operationId, frozen, 'A failed before writing');
      assert.deepEqual([unsentView.outcome, unsentView.reason, unsentView.delivery, unsentView.recording], ['failed', 'recording_failed', 'not_sent', 'incomplete']);
      assert.deepEqual((await conversation(pair.b, { op: 'read', operationId: received.operationId })).phase, 'waiting', 'B admitted nothing');
      assert.equal(kinds(journalRecords(received.transcript)).includes('request_admitted'), false);
      const unsentShown = tail(pair.dirs.a.workspace, unsent.operationId, false);
      assert.equal(await unsentShown.exited, 1);
      assert.match(unsentShown.output.stdout, /\n-- journal INCOMPLETE: no terminal record; not closed\n$/);

      // B's disk fails while it records the reply body: no reply byte is written, and A learns only that delivery is uncertain.
      await pair.b.request({ type: 'fail-next', kind: 'reply_write_started' });
      const asked = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      const bView = await readUntil(pair.b, received.operationId, frozen, 'B withheld the reply');
      assert.deepEqual([bView.outcome, bView.reason, bView.delivery, bView.recording], ['failed', 'recording_failed', 'not_sent', 'incomplete']);
      const aView = await readUntil(pair.a, asked.operationId, decided, 'A after B withheld the reply');
      assert.deepEqual([aView.outcome, aView.reason, aView.delivery, aView.advice, aView.recording],
        ['uncertain', 'connection_lost', 'may_have_occurred', undefined, 'complete']);
      const bKinds = kinds(journalRecords(received.transcript));
      assert.deepEqual(bKinds.slice(-2), ['worker_finished', 'reply_prepared'], 'the prepared reply is recorded; its write never started');
      assert.deepEqual(kinds(journalRecords(asked.transcript)), ['opened', 'accepted', 'request_prepared', 'request_write_started', 'terminal', 'closed']);
      assert.equal(fs.readFileSync(asked.transcript, 'utf8').includes('Recorded capture 101'), false, "the answer's content never reached A");

      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
    } finally {
      await dispose(pair);
    }
  });

  test('standing pairing over real mutual TLS: each owner enrolls once with one typed approval, then two later automatic activations converse with zero approval prompts or inputs, the second after both processes are recreated over the same external files', { timeout: 120_000 }, async () => {
    const pair = await startPairing();
    const processes = { a: [pair.a], b: [pair.b] };
    const records = { a: recordPath(pair.dirs.a.config, 'a-ask'), b: recordPath(pair.dirs.b.config, 'b-serve') };
    const external = [pair.dirs.a.config, pair.dirs.a.cert, pair.dirs.a.key, pair.dirs.b.config, pair.dirs.b.cert, pair.dirs.b.key, pair.dirs.b.token];
    const before = external.map(fileState);
    try {
      // Enrollment: each owner approves its own complete PAIRING proposal once, which saves only that owner's record.
      await enroll(pair.b, 'b-serve', pair.port);
      assert.equal(fs.existsSync(path.dirname(records.a)), false, "B's approval saves nothing for A");
      await enroll(pair.a, 'a-ask', pair.port);
      for (const side of /** @type {const} */ (['a', 'b'])) {
        assert.deepEqual(approvals(processes[side]), { prompts: 1, inputs: 1 }, `${side}: one enrollment prompt and one approval input`);
      }
      const saved = { a: fileState(records.a), b: fileState(records.b) };
      await deactivate(pair);

      /** @type {Array<Awaited<ReturnType<typeof converse>>>} */
      const rounds = [];
      /** @type {Map<string, Buffer>} */
      const retained = new Map();
      for (const round of [1, 2]) {
        if (round === 2) {
          // Both sessions end with their processes. New processes, providers, and sessions start over the same roots and files.
          assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
          assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
          pair.b = await spawnPeer('b', pair.dirs.b, { sessionId: 'component-session-b-recreated' });
          pair.a = await spawnPeer('a', pair.dirs.a, { sessionId: 'component-session-a-recreated' });
          processes.a.push(pair.a);
          processes.b.push(pair.b);
          assert.equal(await connectionRefused(pair.port), true, 'startup activates nothing');
          assert.deepEqual([pair.a.logs, pair.b.logs], [[], []], 'and says nothing');
        }
        // Each later request alone starts a fresh activation, B's and then A's, each after its required notice.
        await activatePaired(pair.b, 'b-serve', pair.port);
        await activatePaired(pair.a, 'a-ask', pair.port);
        const ids = await converse(pair, `${QUESTION} Round ${round}.`);
        rounds.push(ids);
        for (const file of [ids.asked.transcript, ids.received.transcript]) retained.set(file, fs.readFileSync(file));
        await deactivate(pair);
      }

      // Each activation has its own identifiers; only the approved configuration is the same.
      const [first, second] = rounds;
      assert.deepEqual([first.binding.mainSessionId, second.binding.mainSessionId], ['component-session-b', 'component-session-b-recreated']);
      assert.notEqual(second.binding.providerGeneration, first.binding.providerGeneration, 'the recreated provider is new');
      for (const [label, earlier, later] of [
        ['worker permit', first.binding.permitId, second.binding.permitId],
        ['asking operation', first.asked.operationId, second.asked.operationId],
        ['serving operation', first.received.operationId, second.received.operationId],
        ['conversation', first.asked.conversationId, second.asked.conversationId],
        ['question', first.questionId, second.questionId],
        ['exchange', first.exchangeId, second.exchangeId],
      ]) assert.notEqual(later, earlier, `the second activation has a new ${label}`);
      const configDigest = sha256(fs.readFileSync(pair.dirs.b.config));
      assert.deepEqual([first.binding.configDigest, second.binding.configDigest], [configDigest, configDigest]);

      // SC-001: one enrollment approval per owner, and no approval prompt or input across both later activations.
      for (const side of /** @type {const} */ (['a', 'b'])) {
        assert.deepEqual(approvals(processes[side]), { prompts: 1, inputs: 1 }, `${side}: zero later approval prompts or inputs`);
        const inputs = processes[side].flatMap((peer) => peer.inputs);
        assert.deepEqual(inputs.slice(1), inputs.slice(1).map(() => 'dude a2a stop'), `${side}: after enrollment the only root inputs were stops`);
        const logs = processes[side].flatMap((peer) => peer.logs);
        assert.equal(logs.filter((line) => line.startsWith(NOTICE)).length, 2, `${side}: one required notice per automatic activation`);
        assert.equal(logs.filter((line) => line.startsWith('A2A pairing saved:')).length, 1, `${side}: saved once, at enrollment`);
        assert.equal(logs.some((line) => line.startsWith('A2A approval')), false, `${side}: no approval was attempted or refused`);
        assert.deepEqual(fileState(records[side]), saved[side], `${side}: the record was reused, never rewritten`);
      }
      assert.deepEqual(external.map(fileState), before, 'the same external configuration, TLS, and token files throughout');

      // Both processes end by themselves; each retained journal then rereads as complete and unchanged.
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
      assert.equal(await connectionRefused(pair.port), true, "B's listener closed with its process");
      for (const [index, ids] of rounds.entries()) {
        const shown = [tail(pair.dirs.a.workspace, ids.asked.operationId, false), tail(pair.dirs.b.workspace, ids.received.operationId, false)];
        assert.deepEqual(await Promise.all(shown.map((entry) => entry.exited)), [0, 0]);
        assert.match(shown[0].output.stdout, /\n-- journal complete: 8 records; outcome answer\n$/);
        assert.match(shown[1].output.stdout, /\n-- journal complete: 16 records; outcome sent\n$/);
        assert.ok(shown.every((entry) => entry.output.stdout.includes(`${QUESTION} Round ${index + 1}.`)), `round ${index + 1}: its actual question`);
      }
      for (const [file, bytes] of retained) assert.deepEqual(fs.readFileSync(file), bytes, `${path.basename(file)} is retained unchanged`);
      for (const [side, key] of /** @type {const} */ ([['a', 'asked'], ['b', 'received']])) {
        const journals = fs.readdirSync(transcriptFolder(pair.dirs[side].workspace)).filter((name) => name.endsWith('.jsonl')).sort();
        assert.deepEqual(journals, rounds.map((ids) => `${ids[key].operationId}.jsonl`).sort(), `${side}: exactly the two conversations are retained`);
      }
      const everything = [...retained.values()].map((bytes) => bytes.toString('utf8')).join('');
      assert.doesNotMatch(everything, /approve [0-9a-f]{12}/, 'no approval code is recorded');
      assert.equal(everything.includes(WORKER_TOKEN), false, 'no credential is recorded');
    } finally {
      await dispose(pair);
    }
  });

  test('one-sided pairing over real mutual TLS: one owner\'s enrollment and automatic activations never enroll, reach, or wake the other, and a peer that is unpaired, stopped, or exited gives the existing unavailable outcome', { timeout: 120_000 }, async () => {
    // The asker alone: A's owner enrolls A while B was never enrolled.
    const pair = await startPairing();
    const records = { a: recordPath(pair.dirs.a.config, 'a-ask'), b: recordPath(pair.dirs.b.config, 'b-serve') };
    /** @type {Pair | null} */
    let serverAlone = null;
    try {
      await enroll(pair.a, 'a-ask', pair.port);
      await pair.a.event(rootMessage('dude a2a stop'));
      await activatePaired(pair.a, 'a-ask', pair.port);
      await unavailableAsk(pair.a);
      assert.deepEqual(pair.b.logs, [], 'nothing reached or woke the unpaired B');
      assert.equal(fs.existsSync(path.dirname(records.b)), false, "A's enrollment and activation saved nothing for B");
      // B's own request gets only its own complete enrollment proposal: A's pairing does not enroll B.
      await enrollmentOnly(pair.b, 'b-serve');
      assert.equal(await connectionRefused(pair.port), true, 'nothing listens for B');

      // B's owner then enrolls B through B's own typed approval, and B stops. A's ask finds the paired but stopped B
      // unavailable, and B is not woken.
      await enroll(pair.b, 'b-serve', pair.port);
      await pair.b.event(rootMessage('dude a2a stop'));
      const bRecord = fileState(records.b);
      const quiet = pair.b.logs.length;
      await unavailableAsk(pair.a);
      assert.equal(pair.b.logs.length, quiet, 'nothing reached or woke the stopped B');

      // B's process exits. A's next automatic activation finds B unavailable in the same way, and nothing restarts B.
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
      await pair.a.event(rootMessage('dude a2a stop'));
      await activatePaired(pair.a, 'a-ask', pair.port);
      await unavailableAsk(pair.a);
      assert.equal(await connectionRefused(pair.port), true, 'nothing listens for B');
      assert.deepEqual(fileState(records.b), bRecord, "A's activations changed nothing of B's");
      assert.deepEqual(approvals([pair.a]), { prompts: 1, inputs: 1 }, 'A was approved once, by its own owner');
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });

      // The server alone: B's owner enrolls B while A was never enrolled.
      serverAlone = await startPairing();
      const other = serverAlone;
      const aRecord = recordPath(other.dirs.a.config, 'a-ask');
      await enroll(other.b, 'b-serve', other.port);
      await other.b.event(rootMessage('dude a2a stop'));
      await activatePaired(other.b, 'b-serve', other.port);
      const waiting = await conversation(other.b, { op: 'begin_receive' });
      await other.b.waitLog((line) => line === `Status: conversation ${waiting.operationId} waiting for one project question`, 'B waiting');
      assert.deepEqual(other.a.logs, [], 'nothing reached or woke the unpaired A');
      // A gets only its own complete enrollment proposal, and without its own approval it cannot ask.
      await enrollmentOnly(other.a, 'a-ask');
      assert.equal(fs.existsSync(path.dirname(aRecord)), false, "B's enrollment and activations saved nothing for A");
      const unasked = await conversation(other.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      assert.deepEqual([unasked.outcome, unasked.reason], ['refused', 'no_activation']);
      const idle = await conversation(other.b, { op: 'read', operationId: waiting.operationId });
      assert.deepEqual([idle.outcome, idle.phase], ['pending', 'waiting'], 'B admitted nothing');
      assert.deepEqual([approvals([other.a]).inputs, approvals([other.b])], [0, { prompts: 1, inputs: 1 }]);
      assert.deepEqual(await finish(other.a), { code: 0, signal: null });
      assert.deepEqual(await finish(other.b), { code: 0, signal: null });
    } finally {
      await dispose(pair);
      if (serverAlone) await dispose(serverAlone);
    }
  });

  test('deleting a standing record over real mutual TLS ends that side\'s live automatic activation at its next authority check, before its worker model sees any evidence; afterwards its request, in the same or a recreated session, gets only the enrollment proposal and nothing activates', { timeout: 120_000 }, async () => {
    const pair = await startPairing();
    const records = { a: recordPath(pair.dirs.a.config, 'a-ask'), b: recordPath(pair.dirs.b.config, 'b-serve') };
    try {
      await enroll(pair.b, 'b-serve', pair.port);
      await enroll(pair.a, 'a-ask', pair.port);
      await deactivate(pair);
      await activatePaired(pair.b, 'b-serve', pair.port);
      await activatePaired(pair.a, 'a-ask', pair.port);

      // B's record is deleted while B's worker is held after B admitted A's question; its evidence call is the next check.
      await pair.b.request({ type: 'hold' });
      const { received, asked } = await beginExchange(pair);
      await pair.b.waitWorker('prompted');
      fs.rmSync(records.b);
      const since = pair.b.logs.length;
      await pair.b.request({ type: 'release' });
      await pair.b.waitWorker('refused_late');
      assert.equal(await pair.b.waitLog((line) => line.startsWith('A2A activation ended: '), 'B ended by revocation', since), [
        `A2A activation ended: ${REVOKED}.`,
        'Activation: inactive',
        'Communication: ended; listener closed; any unsent reply is withheld and late replies are rejected',
      ].join('\n'));
      const bView = await readUntil(pair.b, received.operationId, frozen, 'B frozen after revocation');
      assert.deepEqual([bView.outcome, bView.reason, bView.delivery, bView.worker?.outcome], ['cancelled', 'activation_ended', 'not_sent', 'cancelled'],
        JSON.stringify(bView));
      const bKinds = kinds(journalRecords(received.transcript));
      assert.deepEqual([bKinds.includes('evidence_returned'), bKinds.includes('reply_prepared')], [false, false], 'nothing was disclosed');
      const aView = await readUntil(pair.a, asked.operationId, frozen, 'A after B ended');
      assert.deepEqual([aView.outcome, aView.reason, aView.delivery, aView.advice], ['uncertain', 'connection_lost', 'may_have_occurred', undefined],
        'the withdrawn reply leaves A uncertain, never answered');
      assert.equal(pair.b.worker.some((entry) => entry.event === 'answered'), false, 'the worker never answered');

      // After deletion the same session's request gets only the enrollment proposal: nothing listens, and nothing recreates the record.
      await enrollmentOnly(pair.b, 'b-serve');
      assert.equal(fs.existsSync(records.b), false, 'nothing recreated the record');
      assert.equal(await connectionRefused(pair.port), true, 'nothing listens');

      // After session end, a recreated B process gets the same.
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
      pair.b = await spawnPeer('b', pair.dirs.b, { sessionId: 'component-session-b-recreated' });
      await enrollmentOnly(pair.b, 'b-serve');
      assert.equal(await connectionRefused(pair.port), true, 'nothing listens after the restart either');

      // A's own record is untouched: A still activates automatically, but finds B unavailable. Deleting A's record revokes A too.
      await pair.a.event(rootMessage('dude a2a stop'));
      await activatePaired(pair.a, 'a-ask', pair.port);
      await unavailableAsk(pair.a);
      await pair.a.event(rootMessage('dude a2a stop'));
      fs.rmSync(records.a);
      await enrollmentOnly(pair.a, 'a-ask');
      assert.equal(fs.existsSync(records.a), false);
      assert.equal(pair.a.logs.filter((line) => line.startsWith(NOTICE)).length, 2, 'A was activated automatically only while its record existed');
      assert.equal(pair.b.logs.some((line) => line.startsWith(NOTICE)), false, 'the recreated B was never activated automatically');
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
    } finally {
      await dispose(pair);
    }
  });

  test('no replay over real mutual TLS: a stop on either side ends the exchange in flight for good, the ended worker\'s late call is refused, and the stopped side\'s fresh automatic activation admits and answers only a new question', { timeout: 120_000 }, async () => {
    const pair = await startPairing();
    try {
      await enroll(pair.b, 'b-serve', pair.port);
      await enroll(pair.a, 'a-ask', pair.port);
      await deactivate(pair);
      await activatePaired(pair.b, 'b-serve', pair.port);
      await activatePaired(pair.a, 'a-ask', pair.port);
      /** @type {Map<string, Buffer>} */
      const ended = new Map();

      // B's owner stops B while B's worker is held after admitting A's first question.
      await pair.b.request({ type: 'hold' });
      const first = await beginExchange(pair, { question: `${QUESTION} First.` });
      await pair.b.waitWorker('prompted');
      await pair.b.event(rootMessage('dude a2a stop'));
      const lost = await readUntil(pair.a, first.asked.operationId, frozen, 'A after B stopped');
      assert.deepEqual([lost.outcome, lost.reason, lost.delivery, lost.advice], ['uncertain', 'connection_lost', 'may_have_occurred', undefined]);
      const stopped = await readUntil(pair.b, first.received.operationId, frozen, 'B frozen after its stop');
      assert.deepEqual([stopped.outcome, stopped.reason, stopped.delivery], ['cancelled', 'activation_ended', 'not_sent']);
      await pair.b.request({ type: 'release' });
      await pair.b.waitWorker('refused_late');
      for (const file of [first.asked.transcript, first.received.transcript]) ended.set(file, fs.readFileSync(file));

      // B's fresh automatic activation admits nothing of the ended exchange; the old handle reaches nothing.
      await activatePaired(pair.b, 'b-serve', pair.port);
      const receiving = await conversation(pair.b, { op: 'begin_receive' });
      await pair.b.waitLog((line) => line === `Status: conversation ${receiving.operationId} waiting for one project question`, 'B waiting again');
      const idle = await conversation(pair.b, { op: 'read', operationId: receiving.operationId });
      assert.deepEqual([idle.outcome, idle.phase], ['pending', 'waiting'], 'nothing of the ended exchange is admitted');
      const oldB = await conversation(pair.b, { op: 'read', operationId: first.received.operationId });
      assert.deepEqual([oldB.outcome, oldB.reason], ['refused', 'unknown_operation']);
      const secondQuestion = `${QUESTION} Second.`;
      const asked = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: secondQuestion });
      assert.equal(asked.outcome, 'accepted', JSON.stringify(asked));
      const second = await converse(pair, secondQuestion, { received: receiving, asked });

      // A's owner stops A while B's worker is held after admitting A's third question.
      const prompted = pair.b.worker.filter((entry) => entry.event === 'prompted').length;
      await pair.b.request({ type: 'hold' });
      const third = await beginExchange(pair, { question: `${QUESTION} Third.` });
      await pair.b.waitWorker('prompted', prompted + 1);
      await pair.a.event(rootMessage('dude a2a stop'));
      const cancelled = await readUntil(pair.a, third.asked.operationId, frozen, 'A after its stop');
      assert.deepEqual([cancelled.outcome, cancelled.reason, cancelled.delivery, cancelled.advice],
        ['cancelled', 'activation_ended', 'may_have_occurred', undefined]);
      const left = await readUntil(pair.b, third.received.operationId, frozen, 'B after A left');
      assert.deepEqual([left.outcome, left.reason, left.delivery], ['cancelled', 'asker_disconnected', 'not_sent']);
      await pair.b.request({ type: 'release' });
      await pair.b.waitWorker('refused_late', 2);
      for (const file of [third.asked.transcript, third.received.transcript]) ended.set(file, fs.readFileSync(file));

      // A's fresh automatic activation: its new question gets the only later answer, and the old handle reaches nothing.
      await activatePaired(pair.a, 'a-ask', pair.port);
      const fourth = await converse(pair, `${QUESTION} Fourth.`);
      const oldA = await conversation(pair.a, { op: 'read', operationId: third.asked.operationId });
      assert.deepEqual([oldA.outcome, oldA.reason], ['refused', 'unknown_operation']);

      // Each ended exchange stays exactly as it ended: no reply was received, prepared, or written for it afterwards.
      for (const [file, bytes] of ended) {
        assert.deepEqual(fs.readFileSync(file), bytes, `${path.basename(file)} is unchanged`);
        const recorded = kinds(journalRecords(file));
        assert.equal(recorded.at(-1), 'closed');
        assert.deepEqual(recorded.filter((kind) => ['reply_received', 'evidence_returned', 'reply_prepared', 'reply_written'].includes(kind)), []);
      }
      assert.deepEqual(pair.b.worker.filter((entry) => entry.event === 'answered').length, 2, 'only the two new questions were answered');
      assert.notEqual(second.binding.permitId, only(journalRecords(first.received.transcript), 'worker_preflight').data.binding.permitId,
        "B's fresh activation has a new worker permit");
      const exchanges = [first, third].map((begun) => only(journalRecords(begun.received.transcript), 'request_admitted').data.exchangeId);
      assert.equal(new Set([...exchanges, second.exchangeId, fourth.exchangeId]).size, 4, 'four distinct exchanges');
      for (const side of /** @type {const} */ (['a', 'b'])) {
        assert.deepEqual(approvals([pair[side]]), { prompts: 1, inputs: 1 }, `${side}: no approval after enrollment`);
      }
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
    } finally {
      await dispose(pair);
    }
  });

  test('a standing pairing lends no trust to another peer over real mutual TLS: with both approved configurations and records unchanged and still matching, an impostor presenting the stranger certificate under the same label is refused by the real pin check on either side, and the real pair then converses', { timeout: 120_000 }, async () => {
    const pair = await startPairing();
    const issuedNow = certificates();
    const records = { a: recordPath(pair.dirs.a.config, 'a-ask'), b: recordPath(pair.dirs.b.config, 'b-serve') };
    /** @type {Peer[]} */
    const impostors = [];
    try {
      await enroll(pair.b, 'b-serve', pair.port);
      await enroll(pair.a, 'a-ask', pair.port);
      await deactivate(pair);
      const approved = [pair.dirs.a.config, pair.dirs.a.cert, pair.dirs.a.key, records.a, pair.dirs.b.config, pair.dirs.b.cert, pair.dirs.b.key, records.b];
      const before = approved.map(fileState);

      // The serving identity changes: an impostor B presents the stranger certificate on B's port. A's unchanged
      // configuration and record still activate A automatically, and A's real pin check refuses before any byte leaves.
      const fakeB = await startImpostor('b', pair.port);
      impostors.push(fakeB);
      assert.match(await approve(fakeB, fakeB.dirs.config, 'b-serve'), new RegExp(`^Activation: active; serve profile b-serve; listening https://127\\.0\\.0\\.1:${pair.port}/`));
      await activatePaired(pair.a, 'a-ask', pair.port);
      const fakeReceive = await conversation(fakeB, { op: 'begin_receive' });
      await fakeB.waitLog((line) => line === `Status: conversation ${fakeReceive.operationId} waiting for one project question`, 'impostor B waiting');
      const toImpostor = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      const refusedByA = await readUntil(pair.a, toImpostor.operationId, frozen, 'A refused the impostor');
      assert.deepEqual([refusedByA.outcome, refusedByA.reason, refusedByA.delivery, refusedByA.advice], ['refused', 'certificate_mismatch', 'not_sent', undefined]);
      assert.deepEqual(kinds(journalRecords(toImpostor.transcript)), ['opened', 'accepted', 'request_prepared', 'terminal', 'closed'], 'no request byte left A');
      const fakeIdle = await conversation(fakeB, { op: 'read', operationId: fakeReceive.operationId });
      assert.deepEqual([fakeIdle.outcome, fakeIdle.phase], ['pending', 'waiting'], 'the impostor admitted nothing');
      assert.equal(fakeB.worker.length, 0, 'and started no worker');
      assert.deepEqual(await finish(fakeB), { code: 0, signal: null });

      // The asking identity changes: an impostor A presents the stranger certificate to the real B, which the unchanged
      // record activated automatically. B's real pin check refuses it before admission.
      await activatePaired(pair.b, 'b-serve', pair.port);
      const fakeA = await startImpostor('a', pair.port);
      impostors.push(fakeA);
      assert.match(await approve(fakeA, fakeA.dirs.config, 'a-ask'), /^Activation: active; ask profile a-ask; peer B/);
      const since = pair.b.logs.length;
      const receiving = await conversation(pair.b, { op: 'begin_receive' });
      await pair.b.waitLog((line) => line === `Status: conversation ${receiving.operationId} waiting for one project question`, 'B waiting');
      const fromImpostor = await conversation(fakeA, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question: QUESTION });
      const impostorView = await readUntil(fakeA, fromImpostor.operationId, frozen, 'impostor A decided');
      assert.deepEqual([impostorView.outcome, impostorView.reason, impostorView.delivery], ['uncertain', 'connection_lost', 'may_have_occurred']);
      await pair.b.waitLog((line) => line.startsWith('A2A refused a peer request: certificate_mismatch.'), 'B refused the impostor', since);
      const bIdle = await conversation(pair.b, { op: 'read', operationId: receiving.operationId });
      assert.deepEqual([bIdle.outcome, bIdle.phase], ['pending', 'waiting'], 'B admitted nothing');
      assert.deepEqual(kinds(journalRecords(receiving.transcript)), ['opened', 'accepted'], 'and recorded no question');
      assert.equal(pair.b.worker.length, 0, 'and started no worker');
      assert.deepEqual(await finish(fakeA), { code: 0, signal: null });

      // The real A, still on its automatic activation, asks the real B, still receiving: the pair was valid throughout.
      const question = `${QUESTION} Authentic.`;
      const asked = await conversation(pair.a, { op: 'begin_ask', slug: 'delta', tentativeNumber: 101, question });
      assert.equal(asked.outcome, 'accepted', JSON.stringify(asked));
      const { binding } = await converse(pair, question, { received: receiving, asked });
      assert.equal(binding.mainSessionId, 'component-session-b');
      const answered = await conversation(pair.a, { op: 'read', operationId: asked.operationId });
      assert.equal(answered.advice.capture.peerCertSha256, issuedNow.b.pin, "the answer is bound to B's real pin");
      assert.deepEqual([journalRecords(asked.transcript)[0].data.peer, journalRecords(receiving.transcript)[0].data.peer],
        [{ label: 'B', certSha256: issuedNow.b.pin }, { label: 'A', certSha256: issuedNow.a.pin }]);
      assert.deepEqual(approved.map(fileState), before, 'no approved configuration, TLS file, or record changed');
      for (const side of /** @type {const} */ (['a', 'b'])) {
        assert.deepEqual(approvals([pair[side]]), { prompts: 1, inputs: 1 }, `${side}: no approval after enrollment`);
      }
      assert.deepEqual(await finish(pair.a), { code: 0, signal: null });
      assert.deepEqual(await finish(pair.b), { code: 0, signal: null });
    } finally {
      for (const impostor of impostors) {
        if (!impostor.exited) {
          impostor.child.kill();
          await within(impostor.exit, EXIT_MS);
        }
      }
      await dispose(pair);
    }
  });
}
