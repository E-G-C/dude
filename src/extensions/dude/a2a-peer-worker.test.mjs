// @ts-check
/**
 * Controlled contract checks for the evidence worker in lib/a2a-peer-worker.mjs.
 *
 * A fake public SDK records what the worker passes at its `CopilotClient`
 * constructor, `RuntimeConnection.forStdio`, and `createSession` seams, answers
 * the public session calls readiness uses (tool catalog, instruction, skill,
 * MCP, extension, and agent queries, `tools.execute`, model and runtime
 * status, and the client's and session's account status), delivers session
 * events to the handler registered at creation,
 * and returns an admission ID from `send`. Each test scripts those answers,
 * the model's run, and the client's stop outcomes. Tool calls carry an
 * invocation signal, which a test aborts where the SDK would. Timers are
 * test-driven. Storage and qualification fixtures are real, inside
 * test-owned temporary folders. Nothing starts a runtime process, calls a
 * model, or opens a connection. These checks establish this module's API use,
 * readiness gates, correlation, and configuration, not native isolation:
 * whether a real runtime honors the filters, rejects unoffered tools the way
 * the probes expect, and stops its whole process tree is qualified natively
 * elsewhere. Nor do they establish a native saved sign-in: the account a
 * fake reports proves only how the worker treats such an answer.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WORKER_BOUNDS, WORKER_EFFECT_TRIGGERS, WORKER_LIMITS, WORKER_TOOLS, startEvidenceWorker } from './lib/a2a-peer-worker.mjs';

const TOKEN = 'fixture-token-not-a-credential-5c1e';
const ENV_VALUE = 'fixture-env-value-not-for-display';
const HIDDEN = 'HIDDEN-REASONING-FIXTURE';
const ADMISSION_ID = 'user-message-41';
const SESSION_ID = 'child-session-1';
const RUNTIME_PATH = path.join(os.tmpdir(), 'dude-fixture-runtime', process.platform === 'win32' ? 'copilot.exe' : 'copilot');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOT_RUNNING = { resultType: 'failure', textResultForLlm: 'Evidence request refused: worker_not_running.' };
const CALL_ENDED = { resultType: 'failure', textResultForLlm: 'Evidence request refused: call_ended.' };
const INVALID = 'Evidence request refused: invalid_arguments.';
// The bound for each result and the answer, and for the observations, buffered identifiers, and readiness observation together.
const CONTENT_BYTES = 8_192;
const STATUS = Object.freeze({ version: '1.0.102-fixture', protocolVersion: 3 });
const BINDING = Object.freeze({
  operationId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  permitId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  mainSessionId: 'main-session-b',
  providerGeneration: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  configDigest: 'c'.repeat(64),
  projectId: 'dude-number-poc',
  conversationId: '9b2e4c1a-3f5d-4e6f-8a7b-1c2d3e4f5a6b',
  questionId: 'question-message-1',
  exchangeId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
});
const JOINED_PATH = path.join(os.tmpdir(), 'dude-fixture-sdk', 'extension.js');
const JOINED = Object.freeze({
  source: 'fixed_loader', resolvedUrl: pathToFileURL(JOINED_PATH).href, path: JOINED_PATH, bytes: 716_344, sha256: 'e'.repeat(64),
});
/** Installed built-in descriptors as `tools.getBuiltinDescriptors` reports them, reduced to the fields the worker reads. */
const DESCRIPTORS = Object.freeze([
  { name: 'view', inputSchema: { type: 'object', properties: { path: { type: 'string' }, view_range: { type: 'array' } }, required: ['path'] } },
  { name: 'create', inputSchema: { type: 'object', properties: { path: { type: 'string' }, file_text: { type: 'string' } }, required: ['path', 'file_text'] } },
  {
    name: 'powershell',
    inputSchema: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' }, mode: { type: 'string' } }, required: ['command', 'description'] },
  },
]);
const LIFECYCLE = new Set(['forStdio', 'construct', 'createSession', 'send', 'abort', 'stop', 'forceStop']);
/** @param {string | Buffer} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

/** A short test-owned temporary folder, by its real path. */
function tempDir() {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-pw-')));
  scratch.push(directory);
  return directory;
}

/** @template T @returns {{promise: Promise<T>, resolve: (value: T) => void, reject: (error: unknown) => void}} */
function deferred() {
  /** @type {(value: T) => void} */
  let resolve = () => {};
  /** @type {(error: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Let pending promise reactions and immediates run. */
async function flush() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** @template T @param {() => T | null | undefined | false} probe @param {string} label @returns {Promise<T>} */
async function until(probe, label) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/**
 * What `promise` settles with, where a correct worker has already settled it: if it is still pending after 2 s of real
 * time, the test fails on an assertion instead of hanging. The timer is cleared either way.
 * @template T @param {Promise<T>} promise @param {string} label @returns {Promise<T>}
 */
async function promptly(promise, label) {
  const pending = Symbol('pending');
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  try {
    const value = await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(resolve, 2_000, pending); })]);
    assert.notEqual(value, pending, `${label}: still pending after 2 s`);
    return /** @type {T} */ (value);
  } finally {
    clearTimeout(timer);
  }
}

/** @param {unknown} value @param {string} label */
function assertNoSecrets(value, label) {
  const text = JSON.stringify(value);
  for (const secret of [TOKEN, ENV_VALUE, HIDDEN]) assert.equal(text.includes(secret), false, `${label} must not carry ${secret}`);
}

/**
 * A non-answer keeps none of the model text a case injected, whole. A result also carries identifiers and digests, a
 * random UUID among them, that can hold any digits, so a bare number such as 999 does not mark that text.
 * @param {unknown} value @param {readonly string[]} texts @param {string} label
 */
function assertTextNotKept(value, texts, label) {
  const json = JSON.stringify(value);
  for (const text of texts) assert.equal(json.includes(text), false, `${label}: no uncorrelated text is kept (${JSON.stringify(text)})`);
}

/** JSON with sorted keys, as the worker digests schemas and arguments. @param {unknown} value @returns {string} */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(/** @type {any} */ (value)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Test-driven timers: nothing fires until a test fires it.
 */
function fakeTimers() {
  /** @type {Set<{ms: number, callback: () => void}>} */
  const pending = new Set();
  return {
    /** @param {() => void} callback @param {number} ms */
    set(callback, ms) {
      const timer = { ms, callback };
      pending.add(timer);
      return () => {
        pending.delete(timer);
      };
    },
    /** Fire the earliest pending timer of exactly `ms`. @param {number} ms */
    fire(ms) {
      const timer = [...pending].find((entry) => entry.ms === ms);
      assert.ok(timer, `a ${ms} ms timer is pending`);
      pending.delete(timer);
      timer.callback();
    },
    pending: () => [...pending].map((entry) => entry.ms),
  };
}

/** A root assistant message of the admitted prompt. @param {string} content @param {object} [data] @param {object} [event] */
function reply(content, data = {}, event = {}) {
  return {
    type: 'assistant.message',
    id: 'event-9',
    parentId: null,
    timestamp: '2026-10-31T23:00:00.000Z',
    ...event,
    data: { messageId: 'assistant-9', originatingMessageId: ADMISSION_ID, content, ...data },
  };
}

/** The rejection a session gives a name it does not offer. @param {string} name */
function lookupError(name) {
  return Object.assign(new Error(`Tool '${name}' is not available in this session.`), { code: -32602 });
}

/** Make a folder, with its parents, and return its path. @param {string} target */
function made(target) {
  fs.mkdirSync(target, { recursive: true });
  return target;
}

/** A path below `base` of exactly `bytes` UTF-8 bytes, in ASCII segments of at most 100 characters. @param {string} base @param {number} bytes */
function pathOfBytes(base, bytes) {
  let result = base;
  while (bytes - Buffer.byteLength(result) > 102) result = path.join(result, 'w'.repeat(100));
  return path.join(result, 'w'.repeat(bytes - Buffer.byteLength(result) - 1));
}

/** A folder link that needs no privilege on Windows. */
const DIRECTORY_LINK = process.platform === 'win32' ? 'junction' : 'dir';

/** A notification that a file view discovered an instruction file, shaped as the public SDK declares it; it carries hidden text. */
const DISCOVERED = Object.freeze({
  type: 'system.notification',
  id: 'event-discovery',
  parentId: null,
  timestamp: '2026-10-31T23:00:00.000Z',
  data: {
    content: `<system_notification>${HIDDEN}</system_notification>`,
    kind: { type: 'instruction_discovered', sourcePath: 'ideas/AGENTS.md', triggerFile: 'ideas/101-peer-idea.md', triggerTool: 'view', description: HIDDEN },
  },
});

/**
 * The MCP notices a normal runtime sends as it starts the owner's configured servers and plugins, shaped as the public SDK
 * declares them (always ephemeral); they carry hidden text.
 */
const MCP_LOADED = Object.freeze({
  type: 'session.mcp_servers_loaded',
  id: 'event-mcp-loaded',
  parentId: null,
  timestamp: '2026-10-31T23:00:00.000Z',
  ephemeral: true,
  data: { servers: [{ name: 'owner-server', status: 'connected', source: 'plugin', pluginName: 'owner-plugin', displayName: HIDDEN }] },
});
const MCP_STATUS = Object.freeze({
  type: 'session.mcp_server_status_changed',
  id: 'event-mcp-status',
  parentId: null,
  timestamp: '2026-10-31T23:00:00.000Z',
  ephemeral: true,
  data: { serverName: 'owner-server', status: 'failed', error: HIDDEN, errorClassification: 'unclassified', configSource: 'plugin' },
});

/**
 * @typedef {object} Script
 * @property {(client: any) => void} [construct]
 * @property {(config: any, makeSession: (config: any) => any) => Promise<unknown>} [createSession]
 * @property {() => Promise<unknown>} [status] The client's public status.
 * @property {Record<string, (params: any, session: any, fallback: (params: any) => unknown) => unknown>} [rpc]
 *   Replaces one public session call, by `space.method`; `fallback` is the default answer.
 * @property {string[]} [omit] Public session calls, by `space.method`, the session does not have; `workspacePath`
 *   leaves out the public getter.
 * @property {'none' | ((config: any) => string)} [storage] The session's own storage: by default a workspace folder the
 *   session creates in its owned configuration storage, which its metadata snapshot and getter report; a function
 *   prepares and names another path to report; `none` reports none.
 * @property {(session: any) => unknown} [workspacePath] Replaces what the public getter returns; it may throw.
 * @property {(session: any) => Promise<unknown>} [send] What `send` resolves with; default the admission ID.
 * @property {(session: any) => Promise<unknown>} [run] The model's run once `send` returned: its final root reply
 *   event, or undefined for none, followed by normal completion; a rejection ends the run with `session.error`.
 * @property {boolean} [account] Whether the client has `getAuthStatus` and the session `gitHubAuth.getStatus`. Off by
 *   default, so a token worker runs against the surface it always had; `signInSdk` turns it on.
 * @property {() => unknown} [authStatus] The client's account status (`getAuthStatus`); default the fixture's signed-in
 *   account. The session's own is `rpc['gitHubAuth.getStatus']`.
 * @property {() => Promise<unknown>} [abort]
 * @property {() => Promise<unknown>} [stop]
 * @property {() => Promise<unknown>} [forceStop]
 */

/** A saved sign-in's account status, as both the client and the session report it; the status text and plan are hidden. */
const SIGNED_IN = Object.freeze({
  isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'fixture-owner', statusMessage: HIDDEN, copilotPlan: HIDDEN,
});
/** The account an existing-sign-in request expects: the same login in another letter case. */
const EXPECTED_ACCOUNT = Object.freeze({ host: 'https://github.com', login: 'Fixture-Owner' });
/** What an existing-sign-in worker keeps of a matching account status. */
const KEPT_ACCOUNT = Object.freeze({ isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'fixture-owner' });

/**
 * A stand-in for the public SDK surface the worker uses. It records the
 * worker's calls in order and starts no process.
 * @param {Script} [script]
 */
function fakeSdk(script = {}) {
  /** @type {string[]} */
  const log = [];
  /** @type {any[]} */
  const clients = [];
  /** @type {Array<{options: any, connection: any}>} */
  const connections = [];
  /** @type {any[]} */
  const sessions = [];

  /** @param {any} config */
  function makeSession(config) {
    let calls = 0;
    const offered = () => config.tools.filter((/** @type {any} */ tool) => config.availableTools.includes(`custom:${tool.name}`));
    // As a runtime keeping a session workspace would, the session creates its folder in the owned configuration storage,
    // or, for an existing-sign-in session, which names none, in the client's base directory; its name is a fixture's,
    // and no name proves identity.
    const storageRoot = config.configDirectory ?? clients[clients.length - 1]?.options.baseDirectory;
    const workspace = script.storage === 'none' ? null
      : script.storage ? script.storage(config) : made(path.join(storageRoot, 'session-state', 'fixture-workspace'));
    /**
     * The native pipeline: an offered tool reaches its handler under the requested call ID; another name is a lookup rejection.
     * @param {any} params
     */
    const execute = (params) => {
      log.push(`tools.execute ${params.name}`);
      const tool = offered().find((/** @type {any} */ entry) => entry.name === params.name);
      if (!tool) throw lookupError(params.name);
      return tool.handler(params.arguments, {
        sessionId: session.sessionId, toolCallId: params.toolCallId, toolName: params.name, arguments: params.arguments,
        signal: new AbortController().signal,
      });
    };
    /** @type {Record<string, (params: any) => unknown>} */
    const defaults = {
      // The public snapshot's fields; the summary is model-written text the worker must never keep.
      'metadata.snapshot': () => ({
        sessionId: session.sessionId, startTime: '2026-10-31T23:00:00.000Z', modifiedTime: '2026-10-31T23:00:00.000Z', isRemote: false,
        alreadyInUse: false, workspacePath: session.workspace, summary: HIDDEN, workingDirectory: config.workingDirectory, currentMode: 'interactive',
        sessionLimits: null,
      }),
      'tools.initializeAndValidate': () => ({}),
      'tools.getCurrentMetadata': () => ({
        tools: offered().map((/** @type {any} */ tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
      }),
      'tools.execute': execute,
      'tools.getBuiltinDescriptors': () => ({ tools: structuredClone(DESCRIPTORS) }),
      'instructions.getSources': () => ({ sources: [] }),
      'skills.list': () => ({ skills: [] }),
      'mcp.listConfigured': () => ({ servers: [] }),
      'extensions.list': () => ({ extensions: [] }),
      'agent.list': () => ({ agents: [] }),
      'agent.getCurrent': () => ({ agent: null }),
      'model.getCurrent': () => ({ modelId: config.model }),
      ...(script.account ? { 'gitHubAuth.getStatus': () => ({ ...SIGNED_IN }) } : {}),
    };
    /** @type {Record<string, Record<string, (params: any) => Promise<unknown>>>} */
    const rpc = {};
    for (const name of Object.keys(defaults)) {
      if (script.omit?.includes(name)) continue;
      const [space, method] = name.split('.');
      rpc[space] ??= {};
      rpc[space][method] = async (params) => {
        if (name !== 'tools.execute') log.push(name);
        const replaced = script.rpc?.[name];
        return replaced ? replaced(params, session, defaults[name]) : defaults[name](params);
      };
    }
    const session = {
      sessionId: SESSION_ID,
      config,
      rpc,
      /** The workspace path the snapshot and getter report, null for none; a case may move or replace it. @type {string | null} */
      workspace,
      /** @type {{options: unknown} | null} */
      sent: null,
      /** Deliver one event to the handler registered at creation. @param {Record<string, unknown>} event */
      emit(event) {
        config.onEvent?.(event);
      },
      /** @param {unknown} options */
      async send(options) {
        log.push('send');
        session.sent = { options };
        const admission = script.send ? await script.send(session) : ADMISSION_ID;
        setImmediate(() => { void drive(session); });
        return admission;
      },
      abort() {
        log.push('abort');
        return script.abort ? script.abort() : Promise.resolve();
      },
      /**
       * The model requests one tool call: a root message of the admission names it, then the runtime invokes the
       * handler. `request: false` invokes it with no such request; `requestedName` requests it under another tool.
       * @param {string} name @param {unknown} args @param {Record<string, unknown>} [overrides]
       * @param {{request?: boolean, requestedName?: string}} [options]
       * @returns {Promise<any>}
       */
      async call(name, args, overrides = {}, options = {}) {
        const tool = config.tools.find((/** @type {any} */ entry) => entry.name === name);
        calls += 1;
        const invocation = {
          sessionId: session.sessionId, toolCallId: `call-${calls}`, toolName: name, arguments: args, signal: new AbortController().signal, ...overrides,
        };
        if (options.request !== false && typeof invocation.toolCallId === 'string' && invocation.toolCallId) {
          session.emit(reply('', { toolRequests: [{ toolCallId: invocation.toolCallId, name: options.requestedName ?? name }] }));
        }
        return tool.handler(args, invocation);
      },
    };
    if (!script.omit?.includes('workspacePath')) {
      // The public getter, as the SDK defines it; each read is logged, so its order is checkable. A case may remove it
      // for a while and put it back.
      Object.defineProperty(session, 'workspacePath', {
        configurable: true,
        enumerable: true,
        get() {
          log.push('workspacePath');
          return script.workspacePath ? script.workspacePath(session) : (session.workspace ?? undefined);
        },
      });
    }
    sessions.push(session);
    return session;
  }

  /** The model's run after `send`: its final reply, if any, then completion, or a session error. @param {any} session */
  async function drive(session) {
    /** @type {unknown} */
    let final;
    try {
      final = await (script.run ? script.run(session) : reply('Observed 101.'));
    } catch {
      session.emit({ type: 'session.error', data: { errorType: 'fixture', message: 'fixture run failure' } });
      return;
    }
    if (final) session.emit(/** @type {Record<string, unknown>} */ (final));
    session.emit({ type: 'session.idle', data: {} });
  }

  class CopilotClient {
    /** @param {any} options */
    constructor(options) {
      log.push('construct');
      this.options = options;
      // Observed at the constructor seam, before any runtime could write.
      const root = path.dirname(options.workingDirectory);
      this.folders = Object.fromEntries(fs.readdirSync(root).sort().map((name) => [name, fs.readdirSync(path.join(root, name), { recursive: true })]));
      /** @type {any} */
      this.sessionConfig = null;
      if (script.account) {
        /** The runtime's account status, only on an account-capable fake. */
        this.getAuthStatus = () => {
          log.push('getAuthStatus');
          return script.authStatus ? script.authStatus() : Promise.resolve({ ...SIGNED_IN });
        };
      }
      clients.push(this);
      script.construct?.(this);
    }

    /** @param {any} config */
    createSession(config) {
      log.push('createSession');
      this.sessionConfig = config;
      return script.createSession ? script.createSession(config, makeSession) : Promise.resolve(makeSession(config));
    }

    getStatus() {
      log.push('getStatus');
      return script.status ? script.status() : Promise.resolve({ ...STATUS });
    }

    stop() {
      log.push('stop');
      return script.stop ? script.stop() : Promise.resolve([]);
    }

    forceStop() {
      log.push('forceStop');
      return script.forceStop ? script.forceStop() : Promise.resolve();
    }
  }

  const sdk = {
    CopilotClient,
    RuntimeConnection: {
      /** @param {any} options */
      forStdio(options) {
        log.push('forStdio');
        const connection = { kind: 'stdio', path: options.path, args: options.args, env: options.env };
        connections.push({ options, connection });
        return connection;
      },
    },
    /** @param {string} name @param {object} config */
    defineTool(name, config) {
      return { name, ...config };
    },
  };
  return { sdk, log, clients, connections, sessions, steps: () => log.filter((entry) => LIFECYCLE.has(entry)) };
}

/**
 * A valid request whose evidence handlers and checkpoint record every call they receive.
 * @param {{inventory?: (call: any) => unknown, read?: (request: any, call: any) => unknown, checkpoint?: (entry: any) => unknown,
 *   log?: string[]}} [handlers] `log` also receives `checkpoint <kind>` in order.
 */
function workerRequest(handlers = {}) {
  /** @type {Array<{tool: string, request: any, call: any}>} */
  const provided = [];
  /** @type {any[]} */
  const checkpoints = [];
  /** @type {any} */
  const request = {
    binding: { ...BINDING },
    qualification: null,
    extension: { loader: { ...JOINED }, pid: 4242 },
    runtime: {
      path: RUNTIME_PATH,
      args: ['--fixture-flag'],
      env: { FIXTURE_SETTING: ENV_VALUE, SystemRoot: 'C:\\Windows' },
      gitHubToken: TOKEN,
    },
    model: 'fixture-model-id',
    prompt: 'Which lifecycle numbers do your approved records show?',
    contentBytes: CONTENT_BYTES,
    timeoutMs: 60_000,
    evidence: {
      inventory: (/** @type {any} */ call) => {
        provided.push({ tool: 'inventory', request: null, call });
        return handlers.inventory ? handlers.inventory(call) : { ok: true, text: '101-peer-idea.md' };
      },
      read: (/** @type {any} */ readRequest, /** @type {any} */ call) => {
        provided.push({ tool: 'read', request: readRequest, call });
        return handlers.read ? handlers.read(readRequest, call) : { ok: true, text: 'number: 101' };
      },
    },
    checkpoint: (/** @type {any} */ entry) => {
      checkpoints.push(entry);
      handlers.log?.push(`checkpoint ${entry.kind}`);
      return handlers.checkpoint ? handlers.checkpoint(entry) : { ok: true };
    },
  };
  return { request, provided, checkpoints };
}

/**
 * Start a worker on the fake SDK with test-owned storage and timers.
 * @param {any} request @param {any} sdk @param {object} [adapters]
 */
function start(request, sdk, adapters = {}) {
  const parent = tempDir();
  const timers = fakeTimers();
  const worker = startEvidenceWorker(request, { loadSdk: async () => sdk, tempParent: parent, timers, ...adapters });
  return { worker, parent, timers };
}

/** @param {string} workerId */
function nothingClosed(workerId) {
  return {
    workerId, runtime: 'not_started', abort: 'not_needed', stop: 'not_needed', stopErrors: 0,
    forceStop: 'not_needed', storage: 'none', retainedPath: null,
  };
}

/** The session once the prompt was sent. @param {ReturnType<typeof fakeSdk>} fake */
const promptSent = (fake) => until(() => fake.sessions[0]?.sent && fake.sessions[0], 'the prompt is sent');

test('the exported bounds and tool names match the approved worker contract', () => {
  assert.deepEqual({ ...WORKER_LIMITS }, { maxMs: 90_000, startupMs: 10_000, stopMs: 5_000, forceStopMs: 5_000 });
  assert.deepEqual({ ...WORKER_TOOLS }, { inventory: 'dude_a2a_evidence_inventory', read: 'dude_a2a_evidence_read' });
  assert.deepEqual({ ...WORKER_BOUNDS }, { startupBytes: 8_192, manifestBytes: 16_384, canaryBytes: 65_536, releaseBytes: 1_024, identifierLength: 256 });
  assert.ok(Object.isFrozen(WORKER_LIMITS) && Object.isFrozen(WORKER_TOOLS) && Object.isFrozen(WORKER_BOUNDS));
});

test('an unexpected native effect\'s detail comes from one closed, frozen list of bounded event types and fixed labels', () => {
  assert.deepEqual([...WORKER_EFFECT_TRIGGERS], ['hook.start', 'skill.invoked', 'subagent.started', 'session.mcp_server_status_changed',
    'session.mcp_servers_loaded', 'system.notification', 'tool.execution_start', 'permission.requested', 'tool_call', 'permission_request',
    'model_output_before_prompt']);
  assert.ok(Object.isFrozen(WORKER_EFFECT_TRIGGERS));
  for (const trigger of WORKER_EFFECT_TRIGGERS) assert.match(trigger, /^[a-z][a-z_.]{0,63}$/, trigger);
});

test('an invalid request is refused before the SDK loads, storage exists, or a deadline starts', async () => {
  const parent = tempDir();
  const timers = fakeTimers();
  let loads = 0;
  const loadSdk = async () => {
    loads += 1;
    return fakeSdk().sdk;
  };
  /** @type {Array<[string, (request: any) => void]>} */
  const cases = [
    ['missing field', (request) => { delete request.model; }],
    ['extra field', (request) => { request.workingDirectory = parent; }],
    ['invalid operation ID', (request) => { request.binding.operationId = 'has space'; }],
    ['binding without its exchange', (request) => { delete request.binding.exchangeId; }],
    ['binding with a conversation that is not a UUID', (request) => { request.binding.conversationId = 'conversation-1'; }],
    ['binding with an uppercase configuration digest', (request) => { request.binding.configDigest = 'C'.repeat(64); }],
    ['qualification of another version', (request) => {
      request.qualification = { version: 2, runId: randomUUID(), fixtureRoot: parent, fixtureSha256: '0'.repeat(64) };
    }],
    ['qualification with a relative fixture root', (request) => {
      request.qualification = { version: 1, runId: randomUUID(), fixtureRoot: 'fixture', fixtureSha256: '0'.repeat(64) };
    }],
    ['an extension loader claiming another source', (request) => { request.extension.loader.source = 'production'; }],
    ['an extension without its process ID key', (request) => { delete request.extension.pid; }],
    ['missing checkpoint', (request) => { delete request.checkpoint; }],
    ['relative runtime path', (request) => { request.runtime.path = 'copilot'; }],
    ['non-string runtime argument', (request) => { request.runtime.args = [1]; }],
    ['runtime file logging', (request) => { request.runtime.env.COPILOT_RUNTIME_PROCESS_FILE_LOGGING = '1'; }],
    ['runtime file logging, other case', (request) => { request.runtime.env.copilot_runtime_process_file_logging = '1'; }],
    ['an owner home', (request) => { request.runtime.env.USERPROFILE = 'C:\\Users\\owner'; }],
    ['an owner temp folder, other case', (request) => { request.runtime.env.tmp = 'C:\\Users\\owner\\AppData\\Local\\Temp'; }],
    ['an owner per-user location', (request) => { request.runtime.env.APPDATA = 'C:\\Users\\owner\\AppData\\Roaming'; }],
    ['non-string environment value', (request) => { request.runtime.env.FIXTURE_NUMBER = 1; }],
    ['empty credential', (request) => { request.runtime.gitHubToken = ''; }],
    ['empty model', (request) => { request.model = ''; }],
    ['blank prompt', (request) => { request.prompt = '   '; }],
    ['zero contentBytes', (request) => { request.contentBytes = 0; }],
    ['deadline over the ceiling', (request) => { request.timeoutMs = WORKER_LIMITS.maxMs + 1; }],
    ['missing read handler', (request) => { delete request.evidence.read; }],
  ];
  for (const [label, mutate] of cases) {
    const { request } = workerRequest();
    mutate(request);
    const worker = startEvidenceWorker(request, { loadSdk, tempParent: parent, timers });
    assert.match(worker.workerId, UUID, label);
    const result = await worker.result;
    assert.deepEqual(
      [result.outcome, result.reason, result.delivery, result.binding, result.sessionId, result.admissionId, result.answer],
      ['refused', 'invalid_request', 'not_sent', null, null, null, null],
      label,
    );
    assert.equal(typeof result.detail, 'string', label);
    assertNoSecrets(result, label);
    assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'refused', reason: 'invalid_request' }, label);
    assert.equal(worker.cancel(), false, label);
    assert.deepEqual({ ...(await worker.closed) }, nothingClosed(worker.workerId), label);
  }
  assert.equal(loads, 0, 'the SDK never loads for an invalid request');
  assert.deepEqual(fs.readdirSync(parent), [], 'no storage is created');
  assert.deepEqual(timers.pending(), [], 'no deadline starts');
});

test('without an injected loader, the fixed loader refuses an unresolvable public SDK with nothing created or started', async (context) => {
  let resolvable = true;
  try {
    import.meta.resolve('@github/copilot-sdk');
  } catch {
    resolvable = false;
  }
  if (resolvable) {
    context.skip('the public SDK resolves in this environment, so the refusal path is not reachable here');
    return;
  }
  const parent = tempDir();
  const timers = fakeTimers();
  const { request } = workerRequest();
  const worker = startEvidenceWorker(request, { tempParent: parent, timers });
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason, result.delivery, result.sessionId], ['refused', 'sdk_provenance_unavailable', 'not_sent', null]);
  assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'refused', reason: 'sdk_provenance_unavailable' });
  assert.deepEqual({ ...(await worker.closed) }, nothingClosed(worker.workerId));
  assert.deepEqual(fs.readdirSync(parent), []);
  assert.deepEqual(timers.pending(), []);
  context.diagnostic('The worker module imported while @github/copilot-sdk was unresolvable, so it has no static SDK import.');
});

test('an injected loader is only a test adapter: whatever it returns, the worker never reports production provenance', async () => {
  // A loader wrapping a real-looking module and provenance-shaped fields is still an injection.
  const fake = fakeSdk();
  const forged = { ...JOINED, source: 'fixed_loader' };
  const { request } = workerRequest();
  const decorated = Object.assign(Object.create(null), fake.sdk, { provenance: forged, source: 'fixed_loader' });
  const { worker } = start(request, decorated);
  const startup = await worker.startup;
  assert.equal(startup.ok, true);
  assert.deepEqual((/** @type {any} */ (startup)).observation.loaders.worker, { source: 'test_adapter' });
  assert.equal((await worker.result).outcome, 'answered');
  await worker.closed;

  // The production loader's own result shape, returned by an injected loader, is not an SDK at all.
  const shaped = fakeSdk();
  const second = startEvidenceWorker(workerRequest().request, {
    loadSdk: async () => ({ api: shaped.sdk, provenance: forged }), tempParent: tempDir(), timers: fakeTimers(),
  });
  const refused = await second.result;
  assert.deepEqual([refused.outcome, refused.reason], ['refused', 'sdk_unsupported']);
  assert.deepEqual(shaped.log, [], 'nothing was constructed from it');
  await second.closed;
});

test('the production worker callsite loads through the fixed loader and records exactly that artifact as its provenance', async () => {
  // Exact copies of the worker and its loader beside a package-shaped SDK, so the real callsite resolves it unaided.
  const root = tempDir();
  const lib = path.join(root, 'lib');
  fs.mkdirSync(lib);
  for (const name of ['a2a-peer-worker.mjs', 'a2a-sdk-loader.mjs']) {
    fs.copyFileSync(fileURLToPath(new URL(`./lib/${name}`, import.meta.url)), path.join(lib, name));
  }
  const sdkDir = path.join(root, 'node_modules', '@github', 'copilot-sdk');
  fs.mkdirSync(sdkDir, { recursive: true });
  fs.writeFileSync(path.join(sdkDir, 'package.json'), JSON.stringify({ name: '@github/copilot-sdk', type: 'module', exports: { '.': './index.mjs' } }));
  const entry = path.join(sdkDir, 'index.mjs');
  fs.writeFileSync(entry, [
    'const fake = globalThis.__dudeWorkerCallsiteSdk;',
    'export const CopilotClient = fake.CopilotClient;',
    'export const RuntimeConnection = fake.RuntimeConnection;',
    'export const defineTool = fake.defineTool;',
    '',
  ].join('\n'));
  const fake = fakeSdk();
  Reflect.set(globalThis, '__dudeWorkerCallsiteSdk', fake.sdk);
  const copy = await import(pathToFileURL(path.join(lib, 'a2a-peer-worker.mjs')).href);
  const { request } = workerRequest();
  const worker = copy.startEvidenceWorker(request, { tempParent: tempDir(), timers: fakeTimers() });
  const startup = await worker.startup;
  const bytes = fs.readFileSync(entry);
  assert.deepEqual(startup.observation.loaders, {
    joined: { ...JOINED },
    worker: { source: 'fixed_loader', resolvedUrl: pathToFileURL(entry).href, path: entry, bytes: bytes.length, sha256: sha256(bytes) },
  });
  assert.equal((await worker.result).outcome, 'answered');
  await worker.closed;
});

test('start returns the handle before the SDK loads, and the answer settles only after the run', async () => {
  const loader = deferred();
  const runGate = deferred();
  const fake = fakeSdk({ run: () => runGate.promise });
  const { request } = workerRequest();
  const parent = tempDir();
  const timers = fakeTimers();
  let loads = 0;
  const worker = startEvidenceWorker(request, {
    loadSdk: () => {
      loads += 1;
      return loader.promise;
    },
    tempParent: parent,
    timers,
  });
  assert.match(worker.workerId, UUID);
  assert.equal(typeof worker.cancel, 'function');
  assert.ok(Object.isFrozen(worker));
  let settled = false;
  void worker.result.then(() => {
    settled = true;
  });
  await flush();
  assert.equal(loads, 1, 'the SDK load starts only after the request');
  assert.deepEqual(fake.log, [], 'nothing is constructed while the SDK loads');
  assert.deepEqual(fs.readdirSync(parent), [], 'no storage before the SDK is available');
  assert.equal(settled, false);
  assert.deepEqual(timers.pending().sort(), [WORKER_LIMITS.startupMs, 60_000], 'the deadline and the startup bound run from the start call');

  // Changing the caller's objects after start cannot change the worker.
  request.runtime.args.push('--late-flag');
  request.runtime.env.LATE_SETTING = 'late';
  request.model = 'late-model';
  request.binding.exchangeId = randomUUID();
  loader.resolve(fake.sdk);
  await promptSent(fake);
  await flush();
  assert.equal(settled, false, 'no result before the run completes');
  assert.deepEqual(timers.pending(), [60_000], 'the startup bound ended with readiness');
  assert.deepEqual(fake.connections[0].options.args, ['--fixture-flag']);
  assert.equal(Object.hasOwn(fake.connections[0].options.env, 'LATE_SETTING'), false);
  assert.equal(fake.clients[0].sessionConfig.model, 'fixture-model-id');

  runGate.resolve(reply('Observed 101.'));
  const result = await worker.result;
  assert.equal(result.outcome, 'answered');
  assert.deepEqual({ ...result.binding }, { ...BINDING }, 'the binding is the one given at start');
  assert.equal((await worker.closed).storage, 'retained', 'a runtime may have started, so its storage is kept');
});

test('the client starts in empty mode with owned work, config, home, and temp folders, no logging, no logged-in user, and only the approved runtime, environment, and credential', async () => {
  const fake = fakeSdk();
  const { request } = workerRequest();
  // Blanked location variables, as the provider composes them on Windows, pass through empty; owned ones are replaced.
  request.runtime.env.HOMEDRIVE = '';
  request.runtime.env.TEMP = '';
  const { worker, parent } = start(request, fake.sdk);
  await worker.result;
  assert.equal(fake.clients.length, 1);
  const [client] = fake.clients;
  const options = client.options;
  assert.deepEqual(
    Object.keys(options).sort(),
    ['baseDirectory', 'connection', 'gitHubToken', 'logLevel', 'mode', 'useLoggedInUser', 'workingDirectory'],
    'no client-level env: the connection environment replaces inheritance',
  );
  const root = path.dirname(options.workingDirectory);
  assert.equal(path.dirname(root), parent);
  assert.match(path.basename(root), /^dude-a2a-w-/);
  assert.equal(options.workingDirectory, path.join(root, 'work'));
  assert.equal(options.baseDirectory, path.join(root, 'config'));
  assert.deepEqual(client.folders, { config: [], home: [], temp: [], work: [] }, 'all four owned folders exist, empty, before construction');
  assert.equal(options.mode, 'empty');
  assert.equal(options.logLevel, 'none');
  assert.equal(options.useLoggedInUser, false);
  assert.equal(options.gitHubToken, TOKEN);
  assert.equal(fake.connections.length, 1);
  assert.equal(options.connection, fake.connections[0].connection);
  assert.deepEqual(fake.connections[0].options, {
    path: RUNTIME_PATH,
    args: ['--fixture-flag'],
    env: {
      FIXTURE_SETTING: ENV_VALUE,
      SystemRoot: 'C:\\Windows',
      HOMEDRIVE: '',
      HOME: path.join(root, 'home'),
      USERPROFILE: path.join(root, 'home'),
      TEMP: path.join(root, 'temp'),
      TMP: path.join(root, 'temp'),
      TMPDIR: path.join(root, 'temp'),
    },
  });
  assert.notEqual(fake.connections[0].options.env, request.runtime.env, 'the worker passes its own copy');
  assert.notEqual(fake.connections[0].options.args, request.runtime.args, 'the worker passes its own copy');
  const closed = await worker.closed;
  assert.deepEqual(fake.steps(), ['forStdio', 'construct', 'createSession', 'send', 'stop']);
  assert.deepEqual([closed.runtime, closed.stop, closed.storage, closed.retainedPath], ['unconfirmed', 'clean', 'retained', root]);
  assert.deepEqual(fs.readdirSync(parent), [path.basename(root)], 'only the owned directory remains');
});

test('the session turns off discovery and ambient features, offers only the two evidence tools, registers its event handler at creation, and rejects every permission request', async () => {
  /** @type {unknown[]} */
  const decisions = [];
  const fake = fakeSdk({
    run: async (session) => {
      const ask = session.config.onPermissionRequest;
      decisions.push(
        await ask({ kind: 'shell', fullCommandText: 'type secrets.txt' }, { sessionId: session.sessionId }),
        await ask({ kind: 'write', fileName: 'C:\\outside.txt' }, { sessionId: session.sessionId }),
        await ask({ kind: 'Not A Kind!' }, { sessionId: session.sessionId }),
      );
      return reply('Observed 101.');
    },
  });
  const { request } = workerRequest();
  const { worker } = start(request, fake.sdk);
  const result = await worker.result;
  const [client] = fake.clients;
  const { tools, onPermissionRequest, onEvent, ...settings } = client.sessionConfig;
  assert.deepEqual(settings, {
    model: 'fixture-model-id',
    workingDirectory: client.options.workingDirectory,
    configDirectory: client.options.baseDirectory,
    additionalDirectories: [],
    enableConfigDiscovery: false,
    skipCustomInstructions: true,
    enableOnDemandInstructionDiscovery: false,
    enableFileHooks: false,
    enableSkills: false,
    memory: { enabled: false },
    enableSessionStore: false,
    enableHostGitOperations: false,
    requestExtensions: false,
    requestCanvasRenderer: false,
    mcpServers: {},
    availableTools: ['custom:dude_a2a_evidence_inventory', 'custom:dude_a2a_evidence_read'],
    excludedTools: ['builtin:*', 'mcp:*'],
  }, 'exact keys: no hooks, hook or agent or skill directories, custom agents, plugins, or system message');
  assert.equal(typeof onPermissionRequest, 'function');
  assert.equal(typeof onEvent, 'function', 'events are observed from session creation on');
  assert.deepEqual(tools.map((/** @type {any} */ tool) => tool.name), [WORKER_TOOLS.inventory, WORKER_TOOLS.read]);
  for (const tool of tools) {
    assert.deepEqual(Object.keys(tool).sort(), ['defer', 'description', 'handler', 'name', 'parameters', 'skipPermission']);
    assert.equal(tool.skipPermission, true, `${tool.name} runs without a permission prompt`);
    assert.equal(tool.defer, 'never', `${tool.name} is never hidden behind the excluded tool search`);
    assert.equal(typeof tool.handler, 'function');
  }
  assert.deepEqual(tools[0].parameters, { type: 'object', additionalProperties: false, properties: {} });
  assert.equal(tools[1].parameters.additionalProperties, false);
  assert.deepEqual(tools[1].parameters.required, ['reference']);
  assert.deepEqual(Object.keys(tools[1].parameters.properties), ['reference', 'lines']);
  assert.equal(tools[1].parameters.properties.lines.additionalProperties, false);

  const reject = { kind: 'reject', feedback: 'This evidence worker grants no permissions.' };
  assert.deepEqual(decisions, [reject, reject, reject]);
  assert.equal(result.outcome, 'answered', 'a model-phase request is rejected and counted, not an effect');
  assert.deepEqual({ ...result.permissionDenials }, { shell: 1, write: 1, other: 1 });
  assert.deepEqual(onPermissionRequest({ kind: 'read' }, { sessionId: SESSION_ID }), reject, 'still rejected after the result');
  assert.deepEqual({ ...(await worker.result).permissionDenials }, { shell: 1, write: 1, other: 1 }, 'the settled result does not change');
  await worker.closed;
});

test('readiness runs on the actual session before any prompt: public status, model, catalog, and ambient counts, the live invalid inventory, worker_preflight, worker_ready, then the send and its admission ID', async (context) => {
  const fake = fakeSdk();
  const handlers = workerRequest({ log: fake.log });
  const { worker, parent } = start(handlers.request, fake.sdk);
  const startup = /** @type {any} */ (await worker.startup);
  const result = await worker.result;
  const closed = await worker.closed;
  assert.equal(result.outcome, 'answered', JSON.stringify(result));
  assert.deepEqual(fake.log, [
    'forStdio', 'construct', 'createSession', 'metadata.snapshot', 'workspacePath', 'getStatus', 'model.getCurrent', 'tools.initializeAndValidate',
    'tools.getCurrentMetadata', 'instructions.getSources', 'skills.list', 'mcp.listConfigured', 'extensions.list', 'agent.list', 'agent.getCurrent',
    'tools.execute dude_a2a_evidence_inventory', 'metadata.snapshot', 'workspacePath', 'checkpoint worker_preflight', 'workspacePath',
    'checkpoint worker_ready', 'workspacePath', 'send', 'checkpoint worker_request_admitted', 'stop',
  ], 'storage is observed right after creation and again last, every readiness call precedes worker_preflight, the getter is read again '
    + 'right before worker_ready and before the prompt, and the prompt follows worker_ready');
  assert.deepEqual(handlers.provided, [], 'preflight reaches no provider handler and returns no evidence');

  // The startup observation is the one recorded, bounded, and charged; it names the actual session and both loaders.
  const root = String(closed.retainedPath);
  assert.equal(path.dirname(root), parent);
  assert.equal(startup.ok, true);
  const { observation } = startup;
  const text = JSON.stringify(observation);
  assert.equal(startup.sha256, sha256(text));
  assert.ok(Buffer.byteLength(text) <= WORKER_BOUNDS.startupBytes, `${Buffer.byteLength(text)} bytes`);
  const schemas = fake.clients[0].sessionConfig.tools.map((/** @type {any} */ tool) => ({ name: tool.name, schemaSha256: sha256(canonical(tool.parameters)) }));
  // The session's own workspace, in the owned configuration storage, with its exact device and inode.
  const workspace = path.join(root, 'config', 'session-state', 'fixture-workspace');
  assert.equal(fake.sessions[0].workspace, workspace);
  const directory = fs.statSync(workspace, { bigint: true });
  assert.deepEqual(observation, {
    version: 1,
    workerId: worker.workerId,
    binding: { ...BINDING },
    sessionId: SESSION_ID,
    qualification: null,
    loaders: { joined: { ...JOINED }, worker: { source: 'test_adapter' } },
    extensionPid: 4242,
    runtime: { ...STATUS },
    model: 'fixture-model-id',
    storage: root,
    sessionStorage: {
      kind: 'workspace', metadataSessionId: SESSION_ID, workspacePath: workspace, directory: { dev: directory.dev.toString(), ino: directory.ino.toString() },
    },
    catalog: schemas,
    ambient: { instructionSources: 0, skills: 0, enabledSkills: 0, mcpServers: 0, extensions: 0, customAgents: 0, selectedAgent: false },
    probes: [{
      id: 'dude-a2a-preflight-inventory', name: WORKER_TOOLS.inventory, argumentsSha256: sha256('{"qualificationProbe":true}'), shape: 'result',
      code: 'failure', templateSha256: sha256(INVALID), cause: 'invalid_arguments',
    }],
    startedAt: observation.startedAt,
    completedAt: observation.completedAt,
  });
  assert.ok(Date.parse(observation.startedAt) <= Date.parse(observation.completedAt));
  assertNoSecrets(observation, 'the readiness observation');
  assert.equal(text.includes('interactive') || text.includes('modifiedTime'), false, 'no other snapshot field, nor its summary, is kept');
  // Exact decimal strings of the bigint identity: a JavaScript number would round an inode past 2^53.
  assert.deepEqual([typeof observation.sessionStorage.directory.dev, typeof observation.sessionStorage.directory.ino], ['string', 'string']);
  context.diagnostic(`workspace inode ${directory.ino} ${directory.ino > BigInt(Number.MAX_SAFE_INTEGER) ? 'exceeds' : 'is within'} 2^53 - 1 here`);

  const [preflight, ready, admitted] = handlers.checkpoints;
  assert.deepEqual(handlers.checkpoints.map((entry) => [entry.kind, entry.workerId]), [
    ['worker_preflight', worker.workerId], ['worker_ready', worker.workerId], ['worker_request_admitted', worker.workerId],
  ]);
  assert.equal(preflight.data, observation, 'the recorded observation is exactly the startup one');
  assert.deepEqual(ready.data, { workerId: worker.workerId, sessionId: SESSION_ID, observationSha256: startup.sha256, startupRelease: null });
  assert.deepEqual(admitted.data, { workerId: worker.workerId, sessionId: SESSION_ID, admissionId: ADMISSION_ID });
  assert.deepEqual([result.sessionId, result.admissionId, result.delivery, result.answer?.admissionId], [SESSION_ID, ADMISSION_ID, 'possibly_sent', ADMISSION_ID]);
  assert.deepEqual(fake.sessions[0].sent.options, { prompt: handlers.request.prompt }, 'the prompt goes through send, with nothing else');
  assert.deepEqual(fake.log.filter((entry) => entry === 'agent.list'), ['agent.list']);
});

test('readiness refuses before any prompt, evidence, or readiness record on a missing API, a malformed answer, another model, a catalog other than exactly the two tools, or any ambient input', async (context) => {
  const extraTool = { name: 'view', description: 'built-in', input_schema: { type: 'object', properties: {} } };
  /** @type {Array<{label: string, script: Script, reason: string}>} */
  const cases = [
    { label: 'a session without tools.execute', script: { omit: ['tools.execute'] }, reason: 'preflight_unsupported' },
    { label: 'a malformed runtime status', script: { status: async () => ({ version: 3 }) }, reason: 'preflight_unsupported' },
    { label: 'a session without a current model', script: { rpc: { 'model.getCurrent': () => ({}) } }, reason: 'preflight_unsupported' },
    { label: 'another selected model', script: { rpc: { 'model.getCurrent': () => ({ modelId: 'other-model' }) } }, reason: 'model_mismatch' },
    { label: 'a rejected catalog initialization', script: { rpc: { 'tools.initializeAndValidate': () => { throw new Error(`no ${TOKEN}`); } } }, reason: 'preflight_unsupported' },
    { label: 'an uninitialized catalog', script: { rpc: { 'tools.getCurrentMetadata': () => ({ tools: null }) } }, reason: 'tool_catalog_uninitialized' },
    { label: 'a catalog answer of another shape', script: { rpc: { 'tools.getCurrentMetadata': () => ({ entries: [] }) } }, reason: 'preflight_unsupported' },
    {
      label: 'an extra offered tool',
      script: { rpc: { 'tools.getCurrentMetadata': (params, session, fallback) => ({ tools: [.../** @type {any} */ (fallback(params)).tools, extraTool] }) } },
      reason: 'tool_catalog_mismatch',
    },
    {
      label: 'a deferred evidence tool',
      script: { rpc: { 'tools.getCurrentMetadata': (params, session, fallback) => mutateCatalog(fallback(params), (tool) => { tool.deferLoading = true; }) } },
      reason: 'tool_catalog_mismatch',
    },
    {
      label: 'an MCP-backed evidence tool',
      script: { rpc: { 'tools.getCurrentMetadata': (params, session, fallback) => mutateCatalog(fallback(params), (tool) => { tool.mcpServerName = 'canary'; }) } },
      reason: 'tool_catalog_mismatch',
    },
    {
      label: 'an evidence tool whose schema is open',
      script: {
        rpc: { 'tools.getCurrentMetadata': (params, session, fallback) => mutateCatalog(fallback(params), (tool) => { tool.input_schema = { type: 'object' }; }) },
      },
      reason: 'tool_catalog_mismatch',
    },
    {
      label: 'a loaded instruction source',
      script: { rpc: { 'instructions.getSources': () => ({ sources: [{ id: 'repo', label: 'AGENTS.md', sourcePath: 'AGENTS.md', content: HIDDEN, type: 'repo' }] }) } },
      reason: 'unexpected_native_effect',
    },
    { label: 'a listed but disabled skill', script: { rpc: { 'skills.list': () => ({ skills: [{ name: 'canary', enabled: false }] }) } }, reason: 'unexpected_native_effect' },
    { label: 'a configured MCP server', script: { rpc: { 'mcp.listConfigured': () => ({ servers: [{ name: 'canary', enabled: false }] }) } }, reason: 'unexpected_native_effect' },
    { label: 'a worker extension', script: { rpc: { 'extensions.list': () => ({ extensions: [{ id: 'project:dude', status: 'running' }] }) } }, reason: 'unexpected_native_effect' },
    { label: 'a custom agent', script: { rpc: { 'agent.list': () => ({ agents: [{ name: 'canary', id: 'canary' }] }) } }, reason: 'unexpected_native_effect' },
    { label: 'a selected agent', script: { rpc: { 'agent.getCurrent': () => ({ agent: { name: 'canary', id: 'canary' } }) } }, reason: 'unexpected_native_effect' },
    { label: 'a malformed skills answer', script: { rpc: { 'skills.list': () => ({}) } }, reason: 'preflight_unsupported' },
  ];
  for (const { label, script, reason } of cases) {
    await context.test(label, async () => {
      const fake = fakeSdk(script);
      const { request, provided, checkpoints } = workerRequest();
      const { worker, parent } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', reason, 'not_sent', null], label);
      assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'refused', reason }, label);
      assert.equal(fake.log.includes('send'), false, `${label}: no prompt`);
      assert.deepEqual([provided, checkpoints], [[], []], `${label}: no evidence and no readiness record`);
      assertNoSecrets(result, label);
      const closed = await worker.closed;
      assert.deepEqual([closed.runtime, closed.storage], ['unconfirmed', 'retained'], label);
      assert.deepEqual(fs.readdirSync(parent), [path.basename(String(closed.retainedPath))], label);
    });
  }
});

/** A catalog answer with each evidence tool changed. @param {any} answer @param {(tool: any) => void} change */
function mutateCatalog(answer, change) {
  for (const tool of answer.tools) change(tool);
  return answer;
}

/** The owned folders of the worker whose session was created with `config`. @param {any} config */
function ownedFolders(config) {
  const root = path.dirname(config.workingDirectory);
  return { root, work: config.workingDirectory, config: config.configDirectory, home: path.join(root, 'home'), temp: path.join(root, 'temp') };
}

/** A metadata snapshot answer changed by `change`. @param {(snapshot: any, session: any) => void} change */
const snapshotWith = (change) => ({
  rpc: {
    'metadata.snapshot': (/** @type {any} */ params, /** @type {any} */ session, /** @type {any} */ fallback) => {
      const snapshot = fallback(params);
      change(snapshot, session);
      return snapshot;
    },
  },
});

/** A metadata snapshot answer changed by `change` at the second observation only. @param {(snapshot: any, session: any) => void} change */
const secondSnapshotWith = (change) => snapshotWith((snapshot, session) => {
  session.snapshots = (session.snapshots ?? 0) + 1;
  if (session.snapshots === 2) change(snapshot, session);
});

/** Runs `change` on the session during readiness, between the two storage observations. @param {(session: any) => void} change */
const betweenObservations = (change) => ({
  rpc: {
    'skills.list': (/** @type {any} */ params, /** @type {any} */ session, /** @type {any} */ fallback) => {
      change(session);
      return fallback(params);
    },
  },
});

/** Move a folder aside and make a new one at its path: the same path, another directory. @param {string} folder */
function replaceFolder(folder) {
  fs.renameSync(folder, `${folder}-moved`);
  fs.mkdirSync(folder);
}

test('the actual session\'s own storage is observed through its public snapshot and getter right after creation and again at the end of readiness: an owned directory, or coherent absence, is recorded', async (context) => {
  /** @param {Script} script */
  const ready = async (script) => {
    const fake = fakeSdk(script);
    const handlers = workerRequest({ log: fake.log });
    const { worker } = start(handlers.request, fake.sdk);
    const startup = /** @type {any} */ (await worker.startup);
    assert.equal(startup.ok, true, JSON.stringify(startup));
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.answer?.text], ['answered', 'Observed 101.']);
    await worker.closed;
    return { fake, handlers, observation: startup.observation, folders: ownedFolders(fake.sessions[0].config) };
  };

  await context.test('coherent absence: both snapshots null and the getter undefined every time, recorded as none and nothing more', async () => {
    const { fake, observation } = await ready({ storage: 'none' });
    assert.deepEqual(observation.sessionStorage, { kind: 'none', metadataSessionId: SESSION_ID });
    assert.deepEqual(fake.log.filter((entry) => entry === 'metadata.snapshot' || entry === 'workspacePath'),
      ['metadata.snapshot', 'workspacePath', 'metadata.snapshot', 'workspacePath', 'workspacePath', 'workspacePath'],
      'two snapshots, each with the getter, then the getter right before worker_ready and before the prompt');
    assert.equal(fake.clients[0].sessionConfig.enableSessionStore, false, 'absence enables nothing; storage options stay off');
  });

  await context.test('a workspace in the owned home folder', async () => {
    const { observation, folders } = await ready({ storage: (config) => made(path.join(ownedFolders(config).home, '.copilot', 'session-state', 'w-1')) });
    const workspace = path.join(folders.home, '.copilot', 'session-state', 'w-1');
    const directory = fs.statSync(workspace, { bigint: true });
    assert.deepEqual(observation.sessionStorage, {
      kind: 'workspace', metadataSessionId: SESSION_ID, workspacePath: workspace, directory: { dev: directory.dev.toString(), ino: directory.ino.toString() },
    });
  });

  await context.test('a workspace path of exactly 1,024 UTF-8 bytes is kept whole', async () => {
    const { observation, folders } = await ready({ storage: (config) => made(pathOfBytes(path.join(config.configDirectory, 'session-state'), 1_024)) });
    assert.equal(Buffer.byteLength(observation.sessionStorage.workspacePath), 1_024);
    assert.ok(observation.sessionStorage.workspacePath.startsWith(path.join(folders.config, 'session-state') + path.sep));
    assert.ok(Buffer.byteLength(JSON.stringify(observation)) <= WORKER_BOUNDS.startupBytes);
  });

  await context.test('a device and inode past 2^53 are kept as exact decimal strings, never rounded numbers', async () => {
    // Real inodes are the file system's; here the workspace gets an identity no JavaScript number holds exactly.
    const huge = { dev: 18_446_744_073_709_551_557n, ino: 9_007_199_254_740_993n };
    const lstatSync = fs.lstatSync;
    let workspace = '';
    fs.lstatSync = /** @type {any} */ ((/** @type {any} */ target, /** @type {any} */ options) => {
      const stat = lstatSync(target, options);
      return options?.bigint && target === workspace ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, huge) : stat;
    });
    try {
      const { observation } = await ready({ storage: (config) => (workspace = made(path.join(config.configDirectory, 'session-state', 'w-huge'))) });
      assert.deepEqual(observation.sessionStorage.directory, { dev: '18446744073709551557', ino: '9007199254740993' });
      assert.notEqual(String(Number(huge.ino)), '9007199254740993', 'a number would have rounded it');
    } finally {
      fs.lstatSync = lstatSync;
    }
  });
});

test('storage observations that are missing, malformed, mismatched, unsafe, unavailable, oversized, or changed refuse before any record or prompt, and an error is never absence', async (context) => {
  /**
   * With `snapshots`, the refusal follows exactly that many; a fault already there at the first observation refuses at
   * it, before any readiness query.
   * @type {Array<{label: string, script: Script, reason: string, snapshots?: number}>}
   */
  const cases = [
    // Missing or malformed public observations, and snapshots of anything but this local, fresh session in its owned folder.
    { label: 'a session without metadata.snapshot', script: { omit: ['metadata.snapshot'] }, reason: 'preflight_unsupported' },
    { label: 'a session without the workspacePath getter', script: { omit: ['workspacePath'] }, reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a snapshot that throws', script: { rpc: { 'metadata.snapshot': () => { throw new Error(`no ${TOKEN}`); } } }, reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a getter that throws', script: { workspacePath: () => { throw new Error(`no ${TOKEN}`); } }, reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a snapshot that is not an object', script: { rpc: { 'metadata.snapshot': () => null } }, reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a snapshot without its workspace path', script: snapshotWith((snapshot) => { delete snapshot.workspacePath; }), reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a snapshot workspace path of another type', script: snapshotWith((snapshot) => { snapshot.workspacePath = 42; }), reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a snapshot without its remote discriminator', script: snapshotWith((snapshot) => { delete snapshot.isRemote; }), reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a snapshot of another session', script: snapshotWith((snapshot) => { snapshot.sessionId = 'other-session'; }), reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a remote session', script: snapshotWith((snapshot) => { snapshot.isRemote = true; }), reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a session already in use', script: snapshotWith((snapshot) => { snapshot.alreadyInUse = true; }), reason: 'preflight_unsupported', snapshots: 1 },
    {
      label: 'another working directory',
      script: snapshotWith((snapshot, session) => { snapshot.workingDirectory = session.config.configDirectory; }),
      reason: 'preflight_unsupported',
      snapshots: 1,
    },
    { label: 'a relative working directory', script: snapshotWith((snapshot) => { snapshot.workingDirectory = 'work'; }), reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a getter answering null where the snapshot has none', script: { storage: 'none', workspacePath: () => null }, reason: 'preflight_unsupported', snapshots: 1 },
    { label: 'a getter answering undefined where the snapshot has a workspace', script: { workspacePath: () => undefined }, reason: 'preflight_unsupported', snapshots: 1 },
    {
      label: 'a getter naming a workspace where the snapshot has none',
      script: { storage: 'none', workspacePath: (session) => made(path.join(session.config.configDirectory, 'session-state', 'getter-only')) },
      reason: 'preflight_unsupported',
      snapshots: 1,
    },
    {
      label: 'a getter and a snapshot naming different owned folders',
      script: { workspacePath: (session) => made(path.join(session.config.configDirectory, 'session-state', 'other')) },
      reason: 'preflight_unsupported',
      snapshots: 1,
    },
    {
      label: 'a second snapshot of another session',
      script: secondSnapshotWith((snapshot) => { snapshot.sessionId = 'other-session'; }),
      reason: 'preflight_unsupported',
      snapshots: 2,
    },
    // The second observation alone wrong, after a valid first one: it must still be this local, fresh session in its owned folder.
    { label: 'a second snapshot of a remote session', script: secondSnapshotWith((snapshot) => { snapshot.isRemote = true; }), reason: 'preflight_unsupported', snapshots: 2 },
    {
      label: 'a second snapshot of a session already in use',
      script: secondSnapshotWith((snapshot) => { snapshot.alreadyInUse = true; }),
      reason: 'preflight_unsupported',
      snapshots: 2,
    },
    {
      label: 'a second snapshot in another working directory',
      script: secondSnapshotWith((snapshot, session) => { snapshot.workingDirectory = session.config.configDirectory; }),
      reason: 'preflight_unsupported',
      snapshots: 2,
    },
    // The second observation alone incoherent, after a valid first one: its getter and snapshot must agree too.
    {
      label: 'a getter naming a workspace at the second observation only, where both snapshots have none',
      script: {
        storage: 'none',
        workspacePath: (session) => {
          // Read once in each observation and once in each recheck after the latch: only the second read names a folder.
          session.reads = (session.reads ?? 0) + 1;
          return session.reads === 2 ? made(path.join(session.config.configDirectory, 'session-state', 'getter-only')) : undefined;
        },
      },
      reason: 'preflight_unsupported',
      snapshots: 2,
    },
    {
      label: 'a second snapshot naming another owned folder than the getter',
      script: secondSnapshotWith((snapshot, session) => { snapshot.workspacePath = made(path.join(session.config.configDirectory, 'session-state', 'other')); }),
      reason: 'preflight_unsupported',
      snapshots: 2,
    },
    // Unsafe, unavailable, or oversized directories: everything else about the observation is valid.
    { label: 'the owned work folder', script: { storage: (config) => ownedFolders(config).work }, reason: 'storage_unavailable', snapshots: 1 },
    { label: 'the owned temp folder', script: { storage: (config) => ownedFolders(config).temp }, reason: 'storage_unavailable', snapshots: 1 },
    // Strictly inside the evidence working tree or the temp folder is still outside the configuration and home storage.
    {
      label: 'a folder inside the owned work folder',
      script: { storage: (config) => made(path.join(ownedFolders(config).work, 'session-state', 'example')) },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    {
      label: 'a folder inside the owned temp folder',
      script: { storage: (config) => made(path.join(ownedFolders(config).temp, 'session-state', 'example')) },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    { label: 'the owned root', script: { storage: (config) => ownedFolders(config).root }, reason: 'storage_unavailable', snapshots: 1 },
    { label: 'the configuration folder itself', script: { storage: (config) => ownedFolders(config).config }, reason: 'storage_unavailable', snapshots: 1 },
    { label: 'the home folder itself', script: { storage: (config) => ownedFolders(config).home }, reason: 'storage_unavailable', snapshots: 1 },
    { label: 'a folder outside the worker', script: { storage: () => made(path.join(tempDir(), 'session-state', 'w-1')) }, reason: 'storage_unavailable', snapshots: 1 },
    {
      label: 'another worker\'s configuration storage',
      script: { storage: (config) => made(path.join(path.dirname(ownedFolders(config).root), 'dude-a2a-w-other', 'config', 'session-state', 'w-1')) },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    { label: 'a relative path', script: { storage: () => path.join('config', 'session-state', 'w-1') }, reason: 'storage_unavailable', snapshots: 1 },
    { label: 'a path that does not exist', script: { storage: (config) => path.join(config.configDirectory, 'session-state', 'missing') }, reason: 'storage_unavailable', snapshots: 1 },
    {
      label: 'a file',
      script: {
        storage: (config) => {
          const file = path.join(made(path.join(config.configDirectory, 'session-state')), 'w-1');
          fs.writeFileSync(file, 'not a folder');
          return file;
        },
      },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    {
      label: 'a link to an owned folder',
      script: {
        storage: (config) => {
          const real = made(path.join(config.configDirectory, 'session-state', 'real'));
          const link = path.join(config.configDirectory, 'session-state', 'linked');
          fs.symlinkSync(real, link, DIRECTORY_LINK);
          return link;
        },
      },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    {
      label: 'a folder reached through a linked parent',
      script: {
        storage: (config) => {
          const outside = tempDir();
          made(path.join(outside, 'w-1'));
          fs.symlinkSync(outside, path.join(config.configDirectory, 'session-state'), DIRECTORY_LINK);
          return path.join(config.configDirectory, 'session-state', 'w-1');
        },
      },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    {
      label: 'a path of 1,025 UTF-8 bytes',
      script: { storage: (config) => made(pathOfBytes(path.join(config.configDirectory, 'session-state'), 1_025)) },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    {
      label: 'a path over 1,024 UTF-8 bytes in fewer than 1,024 units',
      script: {
        storage: (config) => {
          let wide = path.join(config.configDirectory, 'session-state');
          while (Buffer.byteLength(wide) <= 1_024) wide = path.join(wide, 'é'.repeat(100));
          assert.ok(wide.length <= 1_024, 'a bound on units would admit it');
          return made(wide);
        },
      },
      reason: 'storage_unavailable',
      snapshots: 1,
    },
    // A rooted Windows path without its drive: 1,023 bytes as reported, 1,025 once resolved, as the record would keep it.
    ...(process.platform === 'win32' ? [{
      label: 'a rooted path that resolves past 1,024 UTF-8 bytes',
      script: { storage: (/** @type {any} */ config) => made(pathOfBytes(path.join(config.configDirectory, 'session-state'), 1_025)).slice(2) },
      reason: 'storage_unavailable',
      snapshots: 1,
    }] : []),
    // Changes between the two observations, on both public surfaces alike.
    {
      label: 'the workspace moving to another owned folder',
      script: betweenObservations((session) => { session.workspace = made(path.join(session.config.configDirectory, 'session-state', 'moved')); }),
      reason: 'storage_unavailable',
    },
    { label: 'the workspace folder replaced at its path', script: betweenObservations((session) => replaceFolder(session.workspace)), reason: 'storage_unavailable' },
    {
      label: 'absence becoming a workspace',
      script: {
        storage: 'none',
        ...betweenObservations((session) => { session.workspace = made(path.join(session.config.configDirectory, 'session-state', 'late')); }),
      },
      reason: 'storage_unavailable',
    },
    { label: 'a workspace becoming absent', script: betweenObservations((session) => { session.workspace = null; }), reason: 'storage_unavailable' },
  ];
  for (const { label, script, reason, snapshots } of cases) {
    await context.test(label, async () => {
      const fake = fakeSdk(script);
      const { request, provided, checkpoints } = workerRequest();
      const { worker, parent } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', reason, 'not_sent', null], label);
      assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'refused', reason }, `${label}: no readiness, and never absence`);
      assert.equal(fake.log.includes('send'), false, `${label}: no prompt`);
      assert.deepEqual([provided, checkpoints], [[], []], `${label}: no evidence and no readiness record`);
      if (snapshots !== undefined) {
        assert.equal(fake.log.filter((entry) => entry === 'metadata.snapshot').length, snapshots, `${label}: refused at that observation, neither before nor after it`);
      }
      if (snapshots === 1) assert.equal(fake.log.includes('getStatus'), false, `${label}: nothing after the first observation ran`);
      assertNoSecrets(result, label);
      const closed = await worker.closed;
      assert.deepEqual([closed.runtime, closed.storage], ['unconfirmed', 'retained'], label);
      assert.ok(fs.readdirSync(parent).includes(path.basename(String(closed.retainedPath))), label);
    });
  }
});

test('after the startup latch the getter and a workspace\'s directory identity are rechecked right before worker_ready and again before the prompt, with no wait of their own', async (context) => {
  /** @type {Array<{label: string, at: string, script?: Script, change: (session: any) => void, reason: string | null}>} */
  const cases = [
    { label: 'unchanged storage, a positive control', at: 'worker_ready', change: () => {}, reason: null },
    { label: 'unchanged absence, a positive control', at: 'worker_ready', script: { storage: 'none' }, change: () => {}, reason: null },
    { label: 'the workspace folder replaced while worker_preflight records', at: 'worker_preflight', change: (session) => replaceFolder(session.workspace), reason: 'storage_unavailable' },
    {
      label: 'the getter throwing once worker_preflight is recorded',
      at: 'worker_preflight',
      script: {
        workspacePath: (session) => {
          if (session.gone) throw new Error(`gone ${TOKEN}`);
          return session.workspace ?? undefined;
        },
      },
      change: (session) => { session.gone = true; },
      reason: 'preflight_unsupported',
    },
    {
      label: 'a workspace appearing where absence was recorded',
      at: 'worker_preflight',
      script: { storage: 'none' },
      change: (session) => { session.workspace = made(path.join(session.config.configDirectory, 'session-state', 'late')); },
      reason: 'storage_unavailable',
    },
    {
      label: 'the workspace moving while worker_ready records, the last checkpoint before the prompt',
      at: 'worker_ready',
      change: (session) => { session.workspace = made(path.join(session.config.configDirectory, 'session-state', 'moved')); },
      reason: 'storage_unavailable',
    },
    { label: 'the workspace folder removed while worker_ready records', at: 'worker_ready', change: (session) => fs.rmSync(session.workspace, { recursive: true }), reason: 'storage_unavailable' },
    { label: 'the workspace becoming absent while worker_ready records', at: 'worker_ready', change: (session) => { session.workspace = null; }, reason: 'storage_unavailable' },
  ];
  for (const { label, at, script = {}, change, reason } of cases) {
    await context.test(label, async () => {
      const fake = fakeSdk(script);
      const handlers = workerRequest({
        log: fake.log,
        checkpoint: (entry) => {
          // The change happens while the record is written, after which only the rechecks can see it.
          if (entry.kind === at) change(fake.sessions[0]);
          return { ok: true };
        },
      });
      const { worker, timers } = start(handlers.request, fake.sdk);
      const result = await worker.result;
      const kinds = handlers.checkpoints.map((entry) => entry.kind);
      if (reason === null) {
        assert.deepEqual([result.outcome, result.answer?.text], ['answered', 'Observed 101.'], label);
        assert.deepEqual(kinds, ['worker_preflight', 'worker_ready', 'worker_request_admitted'], label);
      } else {
        assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', reason, 'not_sent', null], label);
        assert.deepEqual(kinds, at === 'worker_preflight' ? ['worker_preflight'] : ['worker_preflight', 'worker_ready'],
          `${label}: nothing is recorded after the change`);
        assert.equal(fake.log.includes('send'), false, `${label}: no first prompt`);
        assert.deepEqual(handlers.provided, [], label);
        assertNoSecrets(result, label);
      }
      const reads = fake.log.slice(fake.log.indexOf('checkpoint worker_preflight')).filter((entry) => entry === 'workspacePath' || entry.startsWith('checkpoint '));
      assert.deepEqual(reads.slice(0, 4), reason === null || at === 'worker_ready'
        ? ['checkpoint worker_preflight', 'workspacePath', 'checkpoint worker_ready', 'workspacePath']
        : ['checkpoint worker_preflight', 'workspacePath'], `${label}: the getter is read right before worker_ready and before the prompt`);
      await worker.closed;
      assert.deepEqual(timers.pending(), [], `${label}: no wait of its own outlives the result`);
    });
  }

  await context.test('a qualification run\'s workspace replaced while it waits for its startup release', async () => {
    const { fixture, fake, worker, timers, checkpoints } = startQualified();
    const startup = await worker.startup;
    replaceFolder(fake.sessions[0].workspace);
    writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
    timers.fire(100);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'storage_unavailable', 'not_sent']);
    assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight'], 'the exact release was read, yet no readiness is recorded');
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
    assert.deepEqual(timers.pending(), []);
  });
});

test('where both snapshots report no workspace, a getter missing or throwing at any one of its four reads refuses there as unsupported and is never absence', async (context) => {
  // The getter is read once in each observation and once in each recheck after the latch. A fault starts at the point
  // before one read and ends at the point after it, so every other read is a valid absence and only that read can refuse.
  const points = ['created', 'between the observations', 'worker_preflight', 'worker_ready'];
  /** @type {Record<string, (session: any) => () => void>} Each starts its fault and returns what ends it. */
  const faults = {
    missing: (session) => {
      const getter = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(session, 'workspacePath'));
      delete session.workspacePath;
      return () => { Object.defineProperty(session, 'workspacePath', getter); };
    },
    throwing: (session) => {
      session.throwing = true;
      return () => { session.throwing = false; };
    },
  };
  /** @param {string} fault @param {number} from The point the fault starts at. @param {number} to The point it ends at. */
  const run = async (fault, from, to) => {
    let end = () => {};
    /** @param {number} point @param {any} session */
    const reach = (point, session) => {
      if (point === from) end = faults[fault](session);
      if (point === to) end();
    };
    const fake = fakeSdk({
      storage: 'none',
      createSession: async (config, makeSession) => {
        const session = makeSession(config);
        reach(0, session);
        return session;
      },
      ...betweenObservations((session) => reach(1, session)),
      workspacePath: (session) => {
        if (session.throwing) throw new Error(`no ${TOKEN}`);
        return session.workspace ?? undefined;
      },
    });
    const handlers = workerRequest({
      log: fake.log,
      checkpoint: (entry) => {
        reach(points.indexOf(entry.kind), fake.sessions[0]);
        return { ok: true };
      },
    });
    const { worker, timers } = start(handlers.request, fake.sdk);
    const startup = /** @type {any} */ (await worker.startup);
    const result = await worker.result;
    await worker.closed;
    return { fake, handlers, timers, startup, result };
  };

  await context.test('a fault ended before the first read leaves the same hooks answering coherent absence, a positive control', async () => {
    for (const fault of Object.keys(faults)) {
      const { fake, handlers, timers, startup, result } = await run(fault, 0, 0);
      assert.deepEqual([result.outcome, result.answer?.text], ['answered', 'Observed 101.'], fault);
      assert.deepEqual(startup.observation.sessionStorage, { kind: 'none', metadataSessionId: SESSION_ID }, fault);
      assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted'], fault);
      assert.equal(fake.log.filter((entry) => entry === 'workspacePath').length, 4, `${fault}: the getter is back for all four reads`);
      assert.deepEqual(timers.pending(), [], fault);
    }
  });

  const reads = ['the first observation', 'the second observation', 'the recheck right before worker_ready', 'the recheck right before the prompt'];
  const recorded = [[], [], ['worker_preflight'], ['worker_preflight', 'worker_ready']];
  for (const fault of Object.keys(faults)) {
    for (const [index, read] of reads.entries()) {
      const label = `a getter ${fault} at ${read} only`;
      await context.test(label, async () => {
        const { fake, handlers, timers, startup, result } = await run(fault, index, index + 1);
        assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', 'preflight_unsupported', 'not_sent', null], label);
        assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), recorded[index], `${label}: nothing is recorded after the failed read`);
        assert.equal(fake.log.filter((entry) => entry === 'metadata.snapshot').length, index === 0 ? 1 : 2, `${label}: refused at that read, not before it`);
        if (index < 2) {
          assert.deepEqual({ ...startup }, { ok: false, outcome: 'refused', reason: 'preflight_unsupported' }, `${label}: no readiness, and never absence`);
        } else {
          assert.deepEqual(startup.observation.sessionStorage, { kind: 'none', metadataSessionId: SESSION_ID }, `${label}: absence was coherent until the fault`);
        }
        assert.equal(fake.log.includes('send'), false, `${label}: no prompt`);
        assert.deepEqual(handlers.provided, [], `${label}: no evidence`);
        assertNoSecrets(result, label);
        assert.deepEqual(timers.pending(), [], `${label}: no wait of its own outlives the result`);
      });
    }
  }
});

test('storage observations keep the existing startup, deadline, and cancellation causes, and a failed record sends nothing', async (context) => {
  await context.test('a first snapshot that never answers times out at the startup bound', async () => {
    const fake = fakeSdk({ rpc: { 'metadata.snapshot': () => new Promise(() => {}) } });
    const { request, checkpoints } = workerRequest();
    const { worker, timers } = start(request, fake.sdk);
    await until(() => fake.log.includes('metadata.snapshot'), 'the first snapshot is pending');
    timers.fire(WORKER_LIMITS.startupMs);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['timed_out', 'startup_deadline', 'not_sent']);
    assert.deepEqual(checkpoints, []);
    assert.equal(fake.log.includes('getStatus'), false, 'nothing after the first observation ran');
    await worker.closed;
    assert.deepEqual(timers.pending(), []);
  });

  await context.test('a cancel while the second snapshot is pending', async () => {
    const held = deferred();
    const fake = fakeSdk({
      rpc: {
        'metadata.snapshot': (params, session, fallback) => {
          session.snapshots = (session.snapshots ?? 0) + 1;
          return session.snapshots === 2 ? held.promise.then(() => fallback(params)) : fallback(params);
        },
      },
    });
    const { request, checkpoints } = workerRequest();
    const { worker } = start(request, fake.sdk);
    await until(() => fake.log.filter((entry) => entry === 'metadata.snapshot').length === 2, 'the second snapshot is pending');
    assert.equal(worker.cancel(), true);
    held.resolve(undefined);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['cancelled', 'cancelled', 'not_sent']);
    await flush();
    assert.deepEqual(checkpoints, []);
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
  });

  await context.test('a worker_preflight record that fails', async () => {
    const fake = fakeSdk();
    const { request, checkpoints } = workerRequest({ checkpoint: () => ({ ok: false, reason: 'recording_failed' }) });
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['failed', 'recording_failed', 'not_sent']);
    assert.equal(checkpoints[0].data.sessionStorage.kind, 'workspace', 'the refused record carried the storage observation');
    assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight']);
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
  });
});

test('the fixed invalid inventory must reach this worker\'s own handler and come back exactly invalid_arguments; a look-alike answer is an unrecognized cause', async (context) => {
  /** @type {Array<[string, Script['rpc']]>} */
  const cases = [
    ['the pipeline answers with the exact text without reaching the handler', {
      'tools.execute': () => ({ resultType: 'failure', textResultForLlm: INVALID }),
    }],
    ['the pipeline answers as a plain string', {
      'tools.execute': async (params, session, fallback) => /** @type {any} */ (await fallback(params)).textResultForLlm,
    }],
    ['the handler is reached under another call ID', {
      'tools.execute': (params, session, fallback) => fallback({ ...params, toolCallId: 'runtime-chosen-id' }),
    }],
    ['the handler is reached from another session', {
      'tools.execute': (params, session) => session.config.tools[0].handler(params.arguments, {
        sessionId: 'parent-session', toolCallId: params.toolCallId, toolName: params.name, arguments: params.arguments, signal: new AbortController().signal,
      }),
    }],
    ['the handler is reached with other arguments', {
      'tools.execute': (params, session, fallback) => fallback({ ...params, arguments: { qualificationProbe: false } }),
    }],
    ['the pipeline reports the worker not running', {
      'tools.execute': () => ({ ...NOT_RUNNING }),
    }],
    ['the pipeline rejects the call', {
      'tools.execute': () => { throw lookupError(WORKER_TOOLS.inventory); },
    }],
  ];
  for (const [label, rpc] of cases) {
    await context.test(label, async () => {
      const fake = fakeSdk({ rpc });
      const { request, provided, checkpoints } = workerRequest();
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'probe_cause_unrecognized', 'not_sent'], label);
      assert.equal(fake.log.includes('send'), false, label);
      assert.deepEqual([provided, checkpoints], [[], []], label);
      await worker.closed;
    });
  }
});

test('each readiness checkpoint gates progress: a refusal stops before the prompt with its own closed cause, and a late deadline is caught right before send', async (context) => {
  /** @type {Array<{label: string, at: string, answer: (entry: any) => unknown, outcome: string, reason: string, sent: boolean}>} */
  const cases = [
    { label: 'activation ended at worker_preflight', at: 'worker_preflight', answer: () => ({ ok: false, reason: 'activation_ended' }), outcome: 'cancelled', reason: 'activation_ended', sent: false },
    { label: 'operation ended at worker_ready', at: 'worker_ready', answer: () => ({ ok: false, reason: 'operation_ended' }), outcome: 'cancelled', reason: 'operation_ended', sent: false },
    { label: 'recording failed at worker_ready', at: 'worker_ready', answer: () => ({ ok: false, reason: 'recording_failed' }), outcome: 'failed', reason: 'recording_failed', sent: false },
    { label: 'a throwing checkpoint', at: 'worker_preflight', answer: () => { throw new Error(`disk ${TOKEN}`); }, outcome: 'failed', reason: 'recording_failed', sent: false },
    { label: 'an unknown answer shape', at: 'worker_ready', answer: () => ({ ok: 'yes' }), outcome: 'failed', reason: 'recording_failed', sent: false },
    { label: 'an open-text refusal', at: 'worker_preflight', answer: () => ({ ok: false, reason: 'C:\\private' }), outcome: 'failed', reason: 'recording_failed', sent: false },
    {
      label: 'operation ended at worker_request_admitted', at: 'worker_request_admitted', answer: () => ({ ok: false, reason: 'operation_ended' }),
      outcome: 'cancelled', reason: 'operation_ended', sent: true,
    },
  ];
  for (const { label, at, answer, outcome, reason, sent } of cases) {
    await context.test(label, async () => {
      const runGate = deferred();
      const fake = fakeSdk({ run: () => runGate.promise });
      const { request, provided, checkpoints } = workerRequest({ checkpoint: (entry) => (entry.kind === at ? answer(entry) : { ok: true }) });
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], [outcome, reason, sent ? 'possibly_sent' : 'not_sent'], label);
      assert.equal(fake.log.includes('send'), sent, `${label}: the prompt is sent only after worker_ready`);
      assert.equal(checkpoints.at(-1).kind, at, `${label}: nothing is recorded after the refused checkpoint`);
      if (sent) {
        const session = fake.sessions[0];
        assert.deepEqual(await session.call(WORKER_TOOLS.inventory, {}), NOT_RUNNING, `${label}: no evidence after the refusal`);
        assert.equal(result.admissionId, null, `${label}: an unrecorded admission is never accepted`);
      }
      assert.deepEqual(provided, [], label);
      assertNoSecrets(result, label);
      runGate.resolve(undefined);
      await worker.closed;
    });
  }

  await context.test('the deadline passes while worker_ready records', async () => {
    let clock = 1_000_000;
    const fake = fakeSdk();
    const { request, checkpoints } = workerRequest({
      checkpoint: (entry) => {
        // Recording takes time while no timer can run: the deadline passes inside the checkpoint.
        if (entry.kind === 'worker_ready') clock += 60_000;
        return { ok: true };
      },
    });
    const { worker, timers } = start(request, fake.sdk, { now: () => clock });
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['timed_out', 'deadline', 'not_sent']);
    assert.equal(fake.log.includes('send'), false, 'no prompt after the deadline, though the deadline timer never ran');
    assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready']);
    await worker.closed;
    assert.deepEqual(timers.pending(), []);
  });
});

test('the admission ID that send returns correlates the run: early events wait for it, wrong admissions and subagent output are non-answers, and a call is served only for its root request', async (context) => {
  await context.test('events and a tool call before send returns wait, then are accepted under the recorded admission', async () => {
    const sendGate = deferred();
    /** @type {Promise<any> | null} */
    let early = null;
    const fake = fakeSdk({
      send: async (session) => {
        // The run starts before send returns: a root request and its call arrive first.
        early = session.call(WORKER_TOOLS.inventory, {});
        await sendGate.promise;
        return ADMISSION_ID;
      },
    });
    const { request, provided, checkpoints } = workerRequest();
    const { worker } = start(request, fake.sdk);
    await until(() => early !== null, 'the early call');
    await flush();
    assert.deepEqual(provided, [], 'no evidence is read before the admission is recorded');
    assert.equal(checkpoints.some((entry) => entry.kind === 'worker_request_admitted'), false);
    sendGate.resolve(undefined);
    assert.deepEqual(await early, { resultType: 'success', textResultForLlm: '101-peer-idea.md' });
    assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted']);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.admissionId, result.observations.length], ['answered', ADMISSION_ID, 1]);
    assert.deepEqual(provided[0].call.toolCallId, 'call-1');
    await worker.closed;
  });

  await context.test('completion before send returns is answered once the admission is known; a second completion changes nothing', async () => {
    const fake = fakeSdk({
      send: async (session) => {
        session.emit(reply('Observed 101 early.'));
        session.emit({ type: 'session.idle', data: {} });
        return ADMISSION_ID;
      },
      run: async (session) => {
        session.emit({ type: 'session.idle', data: {} });
        return reply('A late, second reply.');
      },
    });
    const { request } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.answer?.text, result.answer?.admissionId], ['answered', 'Observed 101 early.', ADMISSION_ID]);
    await worker.closed;
  });

  // The model text these cases inject; no non-answer may keep any of it.
  const UNCORRELATED_TEXT = 'Observed 999.';
  const MALFORMED_TEXT = 'Observed 101.';
  const INJECTED_TEXTS = [UNCORRELATED_TEXT, MALFORMED_TEXT];
  // Valid identifiers that hold 999, as a random UUID or a digest sometimes does, so no run depends on luck.
  const BINDING_WITH_999 = Object.freeze({
    exchangeId: '4d999e1f-2b3c-4d5e-8f60-718293a4b5c6',
    configDigest: `${'a'.repeat(30)}999${'b'.repeat(31)}`,
  });

  /** @type {Array<[string, Script, string]>} */
  const nonAnswers = [
    ['a reply of another admission', { run: async () => reply(UNCORRELATED_TEXT, { originatingMessageId: 'another-message' }) }, 'uncorrelated_answer'],
    ['an early message of another admission', {
      send: async (session) => {
        session.emit(reply(UNCORRELATED_TEXT, { originatingMessageId: 'another-message' }));
        return ADMISSION_ID;
      },
    }, 'uncorrelated_answer'],
    ['subagent output', { run: async () => reply(UNCORRELATED_TEXT, {}, { agentId: 'sub-agent-1' }) }, 'uncorrelated_answer'],
    ['a malformed tool request list', { run: async () => reply(MALFORMED_TEXT, { toolRequests: [{ name: WORKER_TOOLS.read }] }) }, 'uncorrelated_answer'],
    ['one tool call requested twice', {
      run: async () => reply('', { toolRequests: [{ toolCallId: 'twice', name: WORKER_TOOLS.read }, { toolCallId: 'twice', name: WORKER_TOOLS.read }] }),
    }, 'uncorrelated_answer'],
    ['an aborted completion', { run: async (session) => { session.emit({ type: 'session.idle', data: { aborted: true } }); } }, 'run_failed'],
  ];
  for (const [label, script, reason] of nonAnswers) {
    await context.test(label, async () => {
      const fake = fakeSdk(script);
      const { request } = workerRequest();
      Object.assign(request.binding, BINDING_WITH_999);
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.answer], ['failed', reason, null], label);
      assertTextNotKept(result, INJECTED_TEXTS, label);
      await worker.closed;
    });
  }

  await context.test('a non-answer is judged by the text it kept, not by digits: identifiers that hold 999 pass, and the same result with the injected text kept fails', async () => {
    const fake = fakeSdk({ run: async () => reply(UNCORRELATED_TEXT, { originatingMessageId: 'another-message' }) });
    const { request } = workerRequest();
    Object.assign(request.binding, BINDING_WITH_999);
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer], ['failed', 'uncorrelated_answer', null]);
    // The correct result carries identifiers that hold 999, which a scan for the digits cannot tell from the text.
    assert.deepEqual(result.binding, { ...BINDING, ...BINDING_WITH_999 }, 'the result keeps the identifiers');
    assert.equal(JSON.stringify(result).includes('999'), true, 'the identifiers put 999 in the result');
    assertTextNotKept(result, INJECTED_TEXTS, 'the correct non-answer');
    // The same result with either text kept, where no other assertion looks, fails the check for that reason.
    for (const text of INJECTED_TEXTS) {
      assert.throws(() => assertTextNotKept({ ...result, detail: text }, INJECTED_TEXTS, `a result that kept ${JSON.stringify(text)}`), {
        name: 'AssertionError', message: /no uncorrelated text is kept/, actual: true, expected: false,
      });
    }
    await worker.closed;
  });

  await context.test('a call no root request named waits without reading, and one requested under another tool is refused', async () => {
    const runGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    assert.deepEqual(
      await session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' }, {}, { requestedName: WORKER_TOOLS.inventory }),
      { resultType: 'failure', textResultForLlm: 'Evidence request refused: uncorrelated_call.' },
    );
    /** @type {unknown} */
    let unrequested = null;
    void session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' }, {}, { request: false }).then((value) => { unrequested = value; });
    await flush();
    assert.equal(unrequested, null, 'it waits within the deadline for its request');
    assert.deepEqual(provided, [], 'neither call reached a provider handler');
    runGate.resolve(reply('Observed 101.'));
    const result = await worker.result;
    assert.equal(result.outcome, 'answered');
    await flush();
    assert.deepEqual(unrequested, NOT_RUNNING, 'it never reads evidence');
    assert.deepEqual(provided, []);
    assert.deepEqual(result.observations.map((entry) => [entry.toolCallId, entry.outcome, entry.reason]), [['call-1', 'refused', 'uncorrelated_call']]);
    await worker.closed;
  });

  await context.test('a model call cannot reuse a fixed preflight call ID', async () => {
    const runGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    assert.deepEqual(
      await session.call(WORKER_TOOLS.inventory, {}, { toolCallId: 'dude-a2a-preflight-inventory' }, { request: false }),
      { resultType: 'failure', textResultForLlm: 'Evidence request refused: duplicate_call.' },
    );
    assert.deepEqual(provided, []);
    runGate.resolve(reply('Observed 101.'));
    await worker.result;
    await worker.closed;
  });
});

test('hook, skill, subagent, and materialized MCP events, and any permission request before the prompt, end a token worker as unexpected native effects that name their trigger', async (context) => {
  /** @type {Array<[string, Record<string, unknown>]>} */
  const events = [
    ['a hook start', { type: 'hook.start', data: { hookInvocationId: 'h1', hookType: 'sessionStart' } }],
    ['a skill invocation', { type: 'skill.invoked', data: { name: 'canary', path: 'SKILL.md', content: HIDDEN } }],
    ['a subagent start', { type: 'subagent.started', data: { toolCallId: 't1', agentName: 'canary', agentDisplayName: 'Canary', agentDescription: '' } }],
    ['MCP servers loaded', { type: 'session.mcp_servers_loaded', data: { servers: [{ name: 'canary' }] } }],
    ['an MCP server status change', { type: 'session.mcp_server_status_changed', data: { serverName: 'canary', status: 'connected' } }],
    ['an instruction discovered after a file view', DISCOVERED],
  ];
  for (const [label, event] of events) {
    await context.test(`${label} during session creation refuses before readiness`, async () => {
      const fake = fakeSdk({
        createSession: (config, makeSession) => {
          config.onEvent(event);
          return Promise.resolve(makeSession(config));
        },
      });
      const { request, checkpoints } = workerRequest();
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'unexpected_native_effect', 'not_sent'], label);
      assert.equal(result.detail, event.type, `${label}: the detail names the event type only`);
      assert.deepEqual(checkpoints, [], label);
      assertNoSecrets(result, label);
      await worker.closed;
    });
    await context.test(`${label} during the run fails it`, async () => {
      const fake = fakeSdk({
        run: async (session) => {
          session.emit(event);
          return reply('Observed 101.');
        },
      });
      const { request } = workerRequest();
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.detail, result.answer], ['failed', 'unexpected_native_effect', event.type, null], label);
      assertNoSecrets(result, label);
      await worker.closed;
    });
  }

  await context.test('an empty MCP load is not an effect', async () => {
    const fake = fakeSdk({
      createSession: (config, makeSession) => {
        config.onEvent({ type: 'session.mcp_servers_loaded', data: { servers: [] } });
        return Promise.resolve(makeSession(config));
      },
    });
    const { worker } = start(workerRequest().request, fake.sdk);
    assert.equal((await worker.result).outcome, 'answered');
    await worker.closed;
  });

  await context.test('a permission request during readiness', async () => {
    /** @type {unknown} */
    let decision = null;
    const fake = fakeSdk({
      rpc: {
        'skills.list': async (params, session, fallback) => {
          decision = await session.config.onPermissionRequest({ kind: 'read' }, { sessionId: session.sessionId });
          return fallback(params);
        },
      },
    });
    const { worker } = start(workerRequest().request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.detail], ['refused', 'unexpected_native_effect', 'permission_request']);
    assert.deepEqual(await until(() => decision, 'the decision'), { kind: 'reject', feedback: 'This evidence worker grants no permissions.' }, 'still rejected');
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
  });
});

test('an instruction-discovery notification is an unexpected native effect from readiness through final acceptance: before the prompt it refuses, after it the run fails, later disclosure stops, and nothing revives the result', async (context) => {
  // Session creation and the run are covered by the table of unexpected events above.
  await context.test('during readiness', async () => {
    const fake = fakeSdk({ rpc: { 'skills.list': (params, session, fallback) => { session.emit(DISCOVERED); return fallback(params); } } });
    const { request, provided, checkpoints } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'unexpected_native_effect', 'not_sent']);
    assert.deepEqual([provided, checkpoints], [[], []]);
    assert.equal(fake.log.includes('send'), false);
    assertNoSecrets(result, 'the result');
    await worker.closed;
  });

  await context.test('during the startup latch, while a qualification run waits for its release', async () => {
    const { fixture, fake, worker, timers, checkpoints } = startQualified();
    const startup = await worker.startup;
    fake.sessions[0].emit(DISCOVERED);
    const result = await promptly(worker.result, 'the notification ends the worker');
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'unexpected_native_effect', 'not_sent']);
    writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
    await flush();
    assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight'], 'the exact release, written afterward, revives nothing');
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
    assert.deepEqual(timers.pending(), []);
  });

  await context.test('before send returns, with a correlated reply and completion already buffered', async () => {
    const fake = fakeSdk({
      send: async (session) => {
        session.emit(reply('Observed 101.'));
        session.emit(DISCOVERED);
        session.emit({ type: 'session.idle', data: {} });
        return ADMISSION_ID;
      },
    });
    const { request, provided, checkpoints } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery, result.admissionId, result.answer],
      ['failed', 'unexpected_native_effect', 'possibly_sent', null, null]);
    assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready'], 'the admission is never recorded or accepted');
    assert.deepEqual(provided, []);
    assertTextNotKept(result, ['Observed 101.'], 'the buffered reply');
    await worker.closed;
  });

  await context.test('while a qualification run holds the first evidence call', async () => {
    const runGate = deferred();
    const { fixture, fake, worker, timers, checkpoints, provided } = startQualified({ run: () => runGate.promise });
    const startup = await worker.startup;
    writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
    timers.fire(100);
    const session = await promptSent(fake);
    const held = session.call(WORKER_TOOLS.inventory, {});
    const pending = await until(() => checkpoints.find((entry) => entry.kind === 'worker_evidence_pending'), 'the hold is recorded');
    session.emit(DISCOVERED);
    const result = await promptly(worker.result, 'the notification ends the worker');
    assert.deepEqual([result.outcome, result.reason, result.answer], ['failed', 'unexpected_native_effect', null]);
    assert.deepEqual(await promptly(held, 'the held call returns'), NOT_RUNNING, 'the held call returns no evidence');
    writeRelease(fixture.root, `${worker.workerId}.evidence-release.json`, JSON.stringify({
      version: 1, release: 'evidence', runId: fixture.runId, workerId: worker.workerId, operationId: BINDING.operationId, permitId: BINDING.permitId,
      sessionId: SESSION_ID, admissionId: ADMISSION_ID, toolCallId: 'call-1', observationSha256: sha256(JSON.stringify(pending.data)),
    }));
    runGate.resolve(reply('Observed 101.'));
    await flush();
    assert.deepEqual(provided.filter((entry) => entry.call.toolCallId.startsWith('call-')), [], 'no evidence is read, before or after the exact release');
    assert.equal(await worker.result, result, 'a later reply and completion revive nothing');
    await worker.closed;
  });

  await context.test('between evidence calls of the run', async () => {
    const runGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    assert.deepEqual(await session.call(WORKER_TOOLS.inventory, {}), { resultType: 'success', textResultForLlm: '101-peer-idea.md' });
    session.emit(DISCOVERED);
    const result = await promptly(worker.result, 'the notification ends the worker');
    assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['failed', 'unexpected_native_effect', 'possibly_sent', null]);
    assert.deepEqual(await session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' }), NOT_RUNNING, 'no later disclosure');
    assert.equal(provided.length, 1, 'no handler runs after the notification');
    assert.equal(result.observations.length, 1, 'evidence returned before it stays reported');
    runGate.resolve(reply('Observed 101.'));
    await flush();
    assert.equal(await worker.result, result, 'a later reply and completion revive nothing');
    assert.equal(worker.cancel(), false);
    assert.equal((await worker.closed).abort, 'acknowledged', 'the run in progress is aborted');
    assertNoSecrets(result, 'the result');
  });

  await context.test('at final acceptance, after the final reply and before completion', async () => {
    const fake = fakeSdk({
      run: async (session) => {
        session.emit(reply('Observed 101.'));
        session.emit(DISCOVERED);
        return undefined;
      },
    });
    const { request } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer], ['failed', 'unexpected_native_effect', null], 'the completion after it is no answer');
    assertTextNotKept(result, ['Observed 101.'], 'the final reply');
    await worker.closed;
  });

  await context.test('from a subagent', async () => {
    const fake = fakeSdk({ run: async (session) => { session.emit({ ...DISCOVERED, agentId: 'sub-agent-1' }); return reply('Observed 101.'); } });
    const { worker } = start(workerRequest().request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason], ['failed', 'unexpected_native_effect']);
    await worker.closed;
  });

  await context.test('another notification kind, a positive control', async () => {
    const fake = fakeSdk({
      run: async (session) => {
        session.emit({ ...DISCOVERED, data: { content: '<system_notification>host note</system_notification>', kind: { type: 'unclassified' } } });
        return reply('Observed 101.');
      },
    });
    const { worker } = start(workerRequest().request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.answer?.text], ['answered', 'Observed 101.']);
    await worker.closed;
  });

  await context.test('once the answer was accepted, a notification changes nothing', async () => {
    const fake = fakeSdk();
    const { worker } = start(workerRequest().request, fake.sdk);
    const result = await worker.result;
    assert.equal(result.outcome, 'answered');
    fake.sessions[0].emit(DISCOVERED);
    await flush();
    assert.equal(await worker.result, result, 'the settled result is final');
    await worker.closed;
  });
});

test('evidence handlers see only validated calls of the admitted run from the worker session, and the answer is the correlated root reply', async () => {
  const runGate = deferred();
  const fake = fakeSdk({ run: () => runGate.promise });
  const atCap = 'é'.repeat(CONTENT_BYTES / 2);
  const { request, provided } = workerRequest({
    read: (readRequest) => ({ ok: true, text: readRequest.lines ? atCap : 'number: 101' }),
  });
  const { worker, parent } = start(request, fake.sdk);
  const session = await promptSent(fake);
  assert.deepEqual(session.sent.options, { prompt: request.prompt });

  const reference = 'ideas/101-peer-idea.md';
  assert.deepEqual(await session.call(WORKER_TOOLS.inventory, {}), { resultType: 'success', textResultForLlm: '101-peer-idea.md' });
  assert.deepEqual(await session.call(WORKER_TOOLS.read, { reference }), { resultType: 'success', textResultForLlm: 'number: 101' });
  assert.deepEqual(
    await session.call(WORKER_TOOLS.read, { reference, lines: { start: 2, end: 3 } }),
    { resultType: 'success', textResultForLlm: atCap },
    'a result of exactly contentBytes UTF-8 bytes is returned whole',
  );
  assert.deepEqual(provided.map((entry) => [entry.tool, entry.request]), [
    ['inventory', null],
    ['read', { reference, lines: null }],
    ['read', { reference, lines: { start: 2, end: 3 } }],
  ]);
  for (const [index, { call }] of provided.entries()) {
    assert.deepEqual(Object.keys(call).sort(), ['operationId', 'permitId', 'sessionId', 'signal', 'toolCallId', 'workerId']);
    assert.deepEqual(
      [call.workerId, call.operationId, call.permitId, call.sessionId, call.toolCallId],
      [worker.workerId, BINDING.operationId, BINDING.permitId, SESSION_ID, `call-${index + 1}`],
    );
    assert.ok(Object.isFrozen(call));
    assert.equal(call.signal.aborted, true, 'a call signal ends with its call');
  }

  const text = 'Observed maximum 101 in ideas/101-peer-idea.md.';
  runGate.resolve(reply(text, { reasoningText: HIDDEN, reasoningOpaque: HIDDEN, encryptedContent: HIDDEN }));
  const result = await worker.result;
  assert.deepEqual(
    [result.workerId, result.outcome, result.reason, result.detail, result.sessionId, result.admissionId, result.delivery],
    [worker.workerId, 'answered', null, null, SESSION_ID, ADMISSION_ID, 'possibly_sent'],
  );
  assert.deepEqual({ ...result.binding }, { ...BINDING });
  assert.deepEqual({ ...result.answer }, { admissionId: ADMISSION_ID, text, bytes: Buffer.byteLength(text), sha256: sha256(text) });
  assert.deepEqual(result.observations.map((entry) => ({ ...entry })), [
    { sequence: 1, tool: 'inventory', toolCallId: 'call-1', request: null, outcome: 'returned', reason: null, bytes: 16, sha256: sha256('101-peer-idea.md') },
    { sequence: 2, tool: 'read', toolCallId: 'call-2', request: { reference, lines: null }, outcome: 'returned', reason: null, bytes: 11, sha256: sha256('number: 101') },
    { sequence: 3, tool: 'read', toolCallId: 'call-3', request: { reference, lines: { start: 2, end: 3 } }, outcome: 'returned', reason: null, bytes: CONTENT_BYTES, sha256: sha256(atCap) },
  ]);
  assert.deepEqual({ ...result.permissionDenials }, {});
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.answer) && Object.isFrozen(result.observations));
  assertNoSecrets(result, 'the result');
  assert.equal(worker.cancel(), false, 'an answered worker cannot be cancelled into another outcome');
  assert.equal((await worker.result).outcome, 'answered');

  const closed = await worker.closed;
  const root = path.dirname(fake.clients[0].options.workingDirectory);
  assert.deepEqual({ ...closed }, {
    workerId: worker.workerId, runtime: 'unconfirmed', abort: 'not_needed', stop: 'clean', stopErrors: 0,
    forceStop: 'not_needed', storage: 'retained', retainedPath: root,
  });
  assertNoSecrets(closed, 'the cleanup report');
  assert.deepEqual(fs.readdirSync(parent), [path.basename(root)]);
});

test('malformed, unscoped, oversized, failing, or misidentified calls get a closed refusal and return no evidence', async () => {
  const bound = 16_384;
  const runGate = deferred();
  const fake = fakeSdk({ run: () => runGate.promise });
  /** @type {Record<string, unknown>} */
  const outcomes = {
    'ideas/outside.md': { ok: false, reason: 'outside_scope' },
    'ideas/large.md': { ok: true, text: `${'é'.repeat(bound / 2)}x` },
    'ideas/malformed.md': { ok: 'yes', text: 'number: 999' },
    'ideas/extra-field.md': { ok: true, text: 'number: 999', path: 'C:\\private\\999.md' },
    'ideas/open-reason.md': { ok: false, reason: 'C:\\private is outside' },
  };
  const { request, provided } = workerRequest({
    read: (readRequest) => {
      if (readRequest.reference === 'ideas/throws.md') throw new Error(`denied ${TOKEN} C:\\private\\secret.md`);
      return outcomes[readRequest.reference];
    },
  });
  request.contentBytes = bound;
  const { worker } = start(request, fake.sdk);
  const session = await promptSent(fake);
  const read = WORKER_TOOLS.read;
  const valid = { reference: 'ideas/101-peer-idea.md' };
  /** @type {Array<[string, () => Promise<any>, string]>} */
  const attempts = [
    ['extra argument', () => session.call(read, { ...valid, path: 'C:\\private' }), 'invalid_arguments'],
    ['missing reference', () => session.call(read, { lines: { start: 1, end: 2 } }), 'invalid_arguments'],
    ['empty reference', () => session.call(read, { reference: '' }), 'invalid_arguments'],
    ['multi-line reference', () => session.call(read, { reference: 'a.md\nb.md' }), 'invalid_arguments'],
    ['oversized reference', () => session.call(read, { reference: 'r'.repeat(4_097) }), 'invalid_arguments'],
    ['zero start line', () => session.call(read, { ...valid, lines: { start: 0, end: 1 } }), 'invalid_arguments'],
    ['reversed lines', () => session.call(read, { ...valid, lines: { start: 3, end: 2 } }), 'invalid_arguments'],
    ['fractional line', () => session.call(read, { ...valid, lines: { start: 1.5, end: 2 } }), 'invalid_arguments'],
    ['extra line key', () => session.call(read, { ...valid, lines: { start: 1, end: 2, step: 1 } }), 'invalid_arguments'],
    ['string arguments', () => session.call(read, 'ideas/101-peer-idea.md'), 'invalid_arguments'],
    ['inventory argument', () => session.call(WORKER_TOOLS.inventory, { root: 'C:\\' }), 'invalid_arguments'],
    ['another session', () => session.call(read, valid, { sessionId: 'parent-session' }), 'session_mismatch'],
    ['another tool name', () => session.call(read, valid, { toolName: 'view' }), 'tool_mismatch'],
    ['sub-agent caller', () => session.call(read, valid, { agentId: 'sub-agent-1' }), 'unexpected_caller'],
    ['missing call ID', () => session.call(read, valid, { toolCallId: undefined }), 'invalid_call'],
    ['repeated call ID', () => session.call(read, valid, { toolCallId: 'call-1' }, { request: false }), 'duplicate_call'],
    ['outside approved scope', () => session.call(read, { reference: 'ideas/outside.md' }), 'outside_scope'],
    ['handler throws', () => session.call(read, { reference: 'ideas/throws.md' }), 'provider_error'],
    ['over contentBytes', () => session.call(read, { reference: 'ideas/large.md' }), 'output_too_large'],
    ['malformed outcome', () => session.call(read, { reference: 'ideas/malformed.md' }), 'provider_error'],
    ['outcome with extra field', () => session.call(read, { reference: 'ideas/extra-field.md' }), 'provider_error'],
    ['open-text reason', () => session.call(read, { reference: 'ideas/open-reason.md' }), 'provider_error'],
    ['no invocation signal', () => session.call(read, valid, { signal: undefined }), 'invalid_call'],
  ];
  for (const [label, attempt, reason] of attempts) {
    assert.deepEqual(await attempt(), { resultType: 'failure', textResultForLlm: `Evidence request refused: ${reason}.` }, label);
  }
  assert.deepEqual(
    provided.map((entry) => entry.request.reference),
    ['ideas/outside.md', 'ideas/throws.md', 'ideas/large.md', 'ideas/malformed.md', 'ideas/extra-field.md', 'ideas/open-reason.md'],
    'only calls with a valid identity and arguments reach a handler',
  );

  runGate.resolve(reply('No usable evidence.'));
  const result = await worker.result;
  assert.equal(result.outcome, 'answered');
  assert.deepEqual(result.observations.map((entry) => entry.reason), attempts.map(([, , reason]) => reason));
  for (const entry of result.observations) {
    assert.deepEqual([entry.outcome, entry.bytes, entry.sha256], ['refused', null, null], String(entry.reason));
  }
  assert.equal(result.observations[14].toolCallId, null, 'a call without a usable ID is recorded without one');
  assert.equal(result.observations[22].toolCallId, 'call-23', 'a call without a signal keeps its ID and reaches no handler');
  assert.deepEqual(result.observations.slice(0, 16).map((entry) => entry.request), Array(16).fill(null));
  assert.deepEqual({ ...result.observations[16].request }, { reference: 'ideas/outside.md', lines: null });
  assertNoSecrets(result, 'the result');
  assert.equal(JSON.stringify(result).includes('private'), false, 'handler errors and rejected arguments are not echoed');
  await worker.closed;
});

test('runtime- and peer-supplied identifiers are kept whole up to the 256-unit bound recording capacity charges, and refused one unit past it', async (context) => {
  const limit = WORKER_BOUNDS.identifierLength;
  // Every unit a lone surrogate, which JSON escapes to six bytes: the serialized worst case the capacity charges.
  const at = {
    mainSessionId: '\ud800'.repeat(limit), questionId: '\ud801'.repeat(limit), sessionId: '\udc00'.repeat(limit),
    admissionId: '\udc01'.repeat(limit), toolCallId: '\udfff'.repeat(limit),
  };
  for (const value of Object.values(at)) assert.equal(Buffer.byteLength(JSON.stringify(value)), 6 * limit + 2);
  /** @param {string} value */
  const over = (value) => `${value}x`;
  /**
   * A worker whose session, admission, and first call use these identifiers, and whose binding names the main session and question.
   * Its session observes coherent absence: with all three recorded identifiers at the bound, a workspace path as well would
   * overflow the 8 KiB readiness observation, which the last case shows refusing.
   * @param {Partial<typeof at>} [ids] @param {Script['storage']} [storage]
   */
  const run = (ids = {}, storage = 'none') => {
    const use = { ...at, ...ids };
    const fake = fakeSdk({
      storage,
      createSession: async (config, make) => Object.assign(make(config), { sessionId: use.sessionId }),
      send: async () => use.admissionId,
      run: async (session) => {
        session.emit(reply('', { originatingMessageId: use.admissionId, toolRequests: [{ toolCallId: at.toolCallId, name: WORKER_TOOLS.inventory }] }));
        const listed = await session.call(WORKER_TOOLS.inventory, {}, { toolCallId: use.toolCallId }, { request: false });
        return reply(`Listed: ${listed.resultType}.`, { originatingMessageId: use.admissionId });
      },
    });
    const handlers = workerRequest();
    handlers.request.binding = { ...BINDING, mainSessionId: use.mainSessionId, questionId: use.questionId };
    handlers.request.contentBytes = 32_768;
    const { worker } = start(handlers.request, fake.sdk);
    return { fake, handlers, worker };
  };

  await context.test('at the bound, each is kept exactly, in the result and the readiness records', async () => {
    const { handlers, worker } = run();
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer?.text], ['answered', null, 'Listed: success.']);
    assert.deepEqual(
      [result.binding?.mainSessionId, result.binding?.questionId, result.sessionId, result.admissionId, result.observations[0]?.toolCallId],
      [at.mainSessionId, at.questionId, at.sessionId, at.admissionId, at.toolCallId],
    );
    assert.deepEqual(handlers.provided.map((entry) => entry.call.toolCallId), [at.toolCallId]);
    const [preflight, ready, admitted] = handlers.checkpoints;
    assert.deepEqual([preflight.data.binding.mainSessionId, preflight.data.binding.questionId, preflight.data.sessionId],
      [at.mainSessionId, at.questionId, at.sessionId]);
    assert.ok(Buffer.byteLength(JSON.stringify(preflight.data)) <= WORKER_BOUNDS.startupBytes, 'the widest identifiers still fit the readiness observation');
    assert.deepEqual(preflight.data.sessionStorage, { kind: 'none', metadataSessionId: at.sessionId }, 'the snapshot\'s session ID is kept whole too');
    assert.equal(ready.data.sessionId, at.sessionId);
    assert.deepEqual({ ...admitted.data }, { workerId: worker.workerId, sessionId: at.sessionId, admissionId: at.admissionId });
    await worker.closed;
  });

  for (const [label, ids, expected] of /** @type {Array<[string, Partial<typeof at>, [string, string, string]]>} */ ([
    ['a longer main session', { mainSessionId: over(at.mainSessionId) }, ['refused', 'invalid_request', 'not_sent']],
    ['a longer question', { questionId: over(at.questionId) }, ['refused', 'invalid_request', 'not_sent']],
    ['a longer session', { sessionId: over(at.sessionId) }, ['refused', 'sdk_unsupported', 'not_sent']],
    ['a longer admission', { admissionId: over(at.admissionId) }, ['failed', 'uncorrelated_answer', 'possibly_sent']],
  ])) {
    await context.test(`${label} is refused, and nothing longer is kept or recorded`, async () => {
      const { fake, handlers, worker } = run(ids);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], expected);
      // The over-long value's escaped last two units, which no kept value at the bound contains.
      const tail = JSON.stringify(Object.values(ids)[0].slice(-2)).slice(1, -1);
      assert.equal(JSON.stringify({ result, checkpoints: handlers.checkpoints }).includes(tail), false, 'the over-long value appears nowhere');
      assert.deepEqual(handlers.provided, [], 'no evidence handler is reached');
      if (expected[2] === 'not_sent') assert.equal(fake.sessions[0]?.sent ?? null, null, 'nothing is sent');
      await worker.closed;
    });
  }

  await context.test('a longer tool-call ID is an invalid call that reaches no handler and is recorded without its ID', async () => {
    const { handlers, worker } = run({ toolCallId: over(at.toolCallId) });
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.answer?.text], ['answered', 'Listed: failure.']);
    assert.deepEqual([result.observations[0]?.reason, result.observations[0]?.toolCallId], ['invalid_call', null]);
    assert.deepEqual(handlers.provided, []);
    await worker.closed;
  });

  await context.test('with a workspace path as well, the widest identifiers overflow the 8 KiB readiness observation, which refuses whole before any record or prompt', async () => {
    // A path near its own 1,024-byte bound, so the observation overflows whatever the length of the test's temporary folder.
    const { fake, handlers, worker } = run({}, (config) => made(pathOfBytes(path.join(config.configDirectory, 'session-state'), 900)));
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', 'startup_observation_too_large', 'not_sent', null]);
    assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'refused', reason: 'startup_observation_too_large' });
    assert.deepEqual([handlers.checkpoints, handlers.provided], [[], []], 'nothing is recorded, truncated, or read');
    assert.equal(fake.sessions[0].sent, null, 'nothing is sent');
    await worker.closed;
  });
});

test('a handler call ends with its tool call or with the worker, whichever ends first, and its later result is never returned', async (context) => {
  const valid = { reference: 'ideas/101-peer-idea.md' };

  await context.test('the runtime ends the call while the provider is pending', async () => {
    const runGate = deferred();
    const providerGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest({
      read: (readRequest) => (readRequest.reference === 'ideas/slow.md' ? providerGate.promise : { ok: true, text: 'number: 101' }),
    });
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    // Stands in for the SDK's per-request controller, which it aborts on
    // external_tool.completed or a disconnect and then discards the handler's result.
    const invocation = new AbortController();
    /** @type {unknown} */
    let answered = null;
    void session.call(WORKER_TOOLS.read, { reference: 'ideas/slow.md' }, { signal: invocation.signal }).then((value) => {
      answered = value;
    });
    await until(() => provided.length === 1, 'the provider is called');
    const providerSignal = provided[0].call.signal;
    assert.equal(providerSignal.aborted, false);
    invocation.abort();
    assert.equal(providerSignal.aborted, true, 'the provider learns at once that the call ended');
    await flush();
    assert.deepEqual(answered, CALL_ENDED, 'the handler returns without waiting for the provider');

    providerGate.resolve({ ok: true, text: 'number: 999' });
    await flush();
    assert.deepEqual(await session.call(WORKER_TOOLS.read, valid), { resultType: 'success', textResultForLlm: 'number: 101' }, 'the worker keeps running');
    runGate.resolve(reply('Observed 101.'));
    const result = await worker.result;
    assert.equal(result.outcome, 'answered');
    assert.deepEqual(result.observations.map((entry) => ({ ...entry })), [
      { sequence: 1, tool: 'read', toolCallId: 'call-1', request: { reference: 'ideas/slow.md', lines: null }, outcome: 'abandoned', reason: 'call_ended', bytes: null, sha256: null },
      { sequence: 2, tool: 'read', toolCallId: 'call-2', request: { reference: 'ideas/101-peer-idea.md', lines: null }, outcome: 'returned', reason: null, bytes: 11, sha256: sha256('number: 101') },
    ]);
    assert.equal(JSON.stringify(result).includes(sha256('number: 999')), false, 'the abandoned result is not recorded');
    await worker.closed;
  });

  await context.test('the runtime ended the call before its handler ran', async () => {
    const runGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    const invocation = new AbortController();
    invocation.abort();
    assert.deepEqual(await session.call(WORKER_TOOLS.read, valid, { signal: invocation.signal }), CALL_ENDED);
    assert.equal(provided.length, 0, 'no provider work starts for an ended call');
    runGate.resolve(reply('Observed 101.'));
    const result = await worker.result;
    assert.deepEqual(result.observations.map((entry) => [entry.toolCallId, entry.outcome, entry.reason]), [['call-1', 'abandoned', 'call_ended']]);
    await worker.closed;
  });

  await context.test('the worker settles while the provider is pending', async () => {
    const runGate = deferred();
    const providerGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest({ read: () => providerGate.promise });
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    /** @type {unknown} */
    let answered = null;
    void session.call(WORKER_TOOLS.read, valid).then((value) => {
      answered = value;
    });
    await until(() => provided.length === 1, 'the provider is called');
    assert.equal(worker.cancel(), true);
    assert.equal(provided[0].call.signal.aborted, true, 'the provider learns at once that the worker ended');
    await flush();
    assert.deepEqual(answered, NOT_RUNNING, 'the handler returns without waiting for the provider');
    providerGate.resolve({ ok: true, text: 'number: 101' });
    await flush();
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.observations.length], ['cancelled', 0], 'the late result is not recorded');
    runGate.resolve(reply('Observed 101.'));
    await worker.closed;
  });
});

test('the abort the SDK sends after each completed call ends neither the worker nor later calls', async () => {
  const runGate = deferred();
  const fake = fakeSdk({ run: () => runGate.promise });
  const { request } = workerRequest();
  const { worker } = start(request, fake.sdk);
  const session = await promptSent(fake);
  let settled = false;
  void worker.result.then(() => {
    settled = true;
  });
  for (const label of ['first', 'second']) {
    const invocation = new AbortController();
    assert.deepEqual(
      await session.call(WORKER_TOOLS.inventory, {}, { signal: invocation.signal }),
      { resultType: 'success', textResultForLlm: '101-peer-idea.md' },
      label,
    );
    // _executeToolAndRespond aborts its controller in `finally` after every handler returns.
    invocation.abort();
    await flush();
    assert.equal(settled, false, `the worker keeps running after the ${label} call`);
  }
  runGate.resolve(reply('Observed 101.'));
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason], ['answered', null]);
  assert.deepEqual(result.observations.map((entry) => entry.outcome), ['returned', 'returned']);
  await worker.closed;
});

test('observations, kept call IDs, buffered request identifiers, and the readiness observation share the contentBytes budget, and exhausting it ends the worker with nothing dropped', async (context) => {
  const contentBytes = 4_096;
  const valid = { reference: 'ideas/101-peer-idea.md' };
  /** @type {Array<{label: string, call: (session: any) => Promise<any>, expect: (index: number) => [string, string | null]}>} */
  const storms = [
    { label: 'short evidence results', call: (session) => session.call(WORKER_TOOLS.inventory, {}), expect: () => ['returned', null] },
    {
      label: 'provider refusals',
      call: (session) => session.call(WORKER_TOOLS.read, { reference: 'ideas/outside.md' }),
      expect: () => ['refused', 'outside_scope'],
    },
    {
      label: 'invalid arguments, each under a new call ID',
      call: (session) => session.call(WORKER_TOOLS.read, { reference: '' }),
      expect: () => ['refused', 'invalid_arguments'],
    },
    {
      label: 'one call ID repeated',
      // Only the first use is requested by the model; every reuse is refused before any correlation wait.
      call: (session) => session.call(WORKER_TOOLS.read, valid, { toolCallId: 'call-repeated' }, { request: !session.requestedOnce && (session.requestedOnce = true) }),
      expect: (index) => (index === 0 ? ['returned', null] : ['refused', 'duplicate_call']),
    },
    {
      label: 'sub-agent callers',
      call: (session) => session.call(WORKER_TOOLS.read, valid, { agentId: 'sub-agent-1' }),
      expect: () => ['refused', 'unexpected_caller'],
    },
    {
      label: 'another session',
      call: (session) => session.call(WORKER_TOOLS.read, valid, { sessionId: 'parent-session' }),
      expect: () => ['refused', 'session_mismatch'],
    },
    {
      label: 'calls without IDs',
      call: (session) => session.call(WORKER_TOOLS.read, valid, { toolCallId: undefined }),
      expect: () => ['refused', 'invalid_call'],
    },
  ];
  for (const storm of storms) {
    await context.test(storm.label, async (t) => {
      const runGate = deferred();
      const fake = fakeSdk({ run: () => runGate.promise });
      const { request, provided } = workerRequest({
        read: (readRequest) => (readRequest.reference === 'ideas/outside.md' ? { ok: false, reason: 'outside_scope' } : { ok: true, text: 'number: 101' }),
      });
      request.contentBytes = contentBytes;
      const { worker } = start(request, fake.sdk);
      const session = await promptSent(fake);
      const startup = /** @type {any} */ (await worker.startup);
      const readiness = Buffer.byteLength(JSON.stringify(startup.observation), 'utf8') + 1;
      /** @type {any} */
      let result = null;
      void worker.result.then((value) => {
        result = value;
      });
      /** @type {unknown[]} */
      const answers = [];
      for (let index = 0; index < 200 && result === null; index += 1) answers.push(await storm.call(session));
      await flush();
      assert.ok(result, 'the storm ends the worker within 200 calls');
      assert.deepEqual([result.outcome, result.reason, result.answer], ['failed', 'observation_budget_exhausted', null]);
      /** @type {any[]} */
      const kept = result.observations;
      assert.ok(kept.length >= 2, 'calls within the budget are kept');
      assert.deepEqual(answers.at(-1), NOT_RUNNING, 'the call that did not fit returns no evidence');
      assert.deepEqual(kept.map((entry) => entry.sequence), kept.map((_, index) => index + 1), 'nothing kept is dropped');
      for (const [index, entry] of kept.entries()) assert.deepEqual([entry.outcome, entry.reason], storm.expect(index), `observation ${index + 1}`);
      const encoded = Buffer.byteLength(JSON.stringify(kept), 'utf8');
      assert.ok(encoded + readiness <= contentBytes, `${encoded} observation bytes and ${readiness} readiness bytes fit within ${contentBytes}`);
      const handled = provided.length;
      assert.deepEqual(await storm.call(session), NOT_RUNNING, 'nothing more is admitted');
      assert.equal(provided.length, handled, 'no handler runs after exhaustion');
      t.diagnostic(`${storm.label}: ${kept.length} observations kept in ${encoded} bytes beside ${readiness} readiness bytes of ${contentBytes}; `
        + `call ${answers.length} ended the worker`);
      assert.equal((await worker.closed).abort, 'acknowledged', 'the run in progress is aborted');
    });
  }

  await context.test('calls whose handlers are pending hold their room', async (t) => {
    const runGate = deferred();
    const providerGate = deferred();
    const fake = fakeSdk({ run: () => runGate.promise });
    const { request, provided } = workerRequest({ read: () => providerGate.promise });
    request.contentBytes = contentBytes;
    const { worker } = start(request, fake.sdk);
    const session = await promptSent(fake);
    /** @type {any} */
    let result = null;
    void worker.result.then((value) => {
      result = value;
    });
    /** @type {Promise<unknown>[]} */
    const answers = [];
    for (let index = 0; index < 200 && result === null; index += 1) {
      answers.push(session.call(WORKER_TOOLS.read, valid));
      await flush();
    }
    assert.ok(result, 'pending calls exhaust the budget within 200 calls');
    assert.deepEqual([result.outcome, result.reason], ['failed', 'observation_budget_exhausted']);
    assert.ok(provided.length >= 2 && provided.length < answers.length, 'calls admitted before exhaustion reached their handler, and the last did not');
    assert.ok(provided.every(({ call }) => call.signal.aborted), 'pending handlers learn that the worker ended');
    assert.deepEqual(await Promise.all(answers), answers.map(() => NOT_RUNNING), 'no pending call returns evidence');
    assert.deepEqual(result.observations, [], 'no pending call had an outcome to keep');
    t.diagnostic(`${provided.length} pending calls held the budget; call ${answers.length} did not fit`);
    providerGate.resolve({ ok: true, text: 'number: 101' });
    await worker.closed;
  });
});

test('only the admitted prompt\'s root reply at normal completion, within contentBytes, is an answer; nothing is truncated', async () => {
  const over = `${'é'.repeat(CONTENT_BYTES / 2)}x`;
  /** @type {Array<[string, Script['run'], string, string]>} */
  const cases = [
    ['no reply', async () => undefined, 'no_answer', 'not_needed'],
    ['a user message instead of a reply', async () => ({ ...reply('Observed 101.'), type: 'user.message' }), 'no_answer', 'not_needed'],
    ['blank content', async () => reply('   '), 'no_answer', 'not_needed'],
    ['over contentBytes', async () => reply(over), 'answer_too_large', 'not_needed'],
    ['no originating message', async () => reply('Observed 101.', { originatingMessageId: undefined }), 'uncorrelated_answer', 'acknowledged'],
    ['sub-agent reply', async () => reply('Observed 101.', {}, { agentId: 'sub-agent-1' }), 'uncorrelated_answer', 'acknowledged'],
    ['run error', async () => { throw new Error(`runtime stderr ${TOKEN}`); }, 'run_failed', 'acknowledged'],
  ];
  for (const [label, run, reason, abort] of cases) {
    const fake = fakeSdk({ run });
    const { request } = workerRequest();
    const { worker, parent } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer, result.delivery], ['failed', reason, null, 'possibly_sent'], label);
    assert.equal(JSON.stringify(result).includes('é'), false, `${label}: no partial reply text`);
    assertNoSecrets(result, label);
    const closed = await worker.closed;
    assert.deepEqual([closed.runtime, closed.abort, closed.stop, closed.storage], ['unconfirmed', abort, 'clean', 'retained'], label);
    assert.deepEqual(fs.readdirSync(parent), [path.basename(String(closed.retainedPath))], label);
  }
});

test('the deadline settles at once, aborts the run before stopping, and later replies or calls change nothing', async () => {
  const runGate = deferred();
  const fake = fakeSdk({ run: () => runGate.promise });
  const { request, provided } = workerRequest();
  request.timeoutMs = WORKER_LIMITS.maxMs;
  const { worker, parent, timers } = start(request, fake.sdk);
  const session = await promptSent(fake);
  await session.call(WORKER_TOOLS.inventory, {});
  timers.fire(WORKER_LIMITS.maxMs);
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['timed_out', 'deadline', 'possibly_sent', null]);
  assert.equal(result.observations.length, 1, 'evidence already returned before the deadline stays reported');
  assert.equal(provided[0].call.signal.aborted, true);

  const closed = await worker.closed;
  const root = path.dirname(fake.clients[0].options.workingDirectory);
  assert.deepEqual({ ...closed }, {
    workerId: worker.workerId, runtime: 'unconfirmed', abort: 'acknowledged', stop: 'clean', stopErrors: 0,
    forceStop: 'not_needed', storage: 'retained', retainedPath: root,
  });
  assert.deepEqual(fake.log.slice(-2), ['abort', 'stop'], 'the run is aborted before the client stops');
  assert.deepEqual(await session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' }), NOT_RUNNING);
  assert.equal(provided.length, 1, 'no handler runs after the deadline');
  runGate.resolve(reply('Observed 101.'));
  await flush();
  assert.equal(await worker.result, result, 'a later reply cannot revive success');
  assert.equal(worker.cancel(), false);
  assert.deepEqual(timers.pending(), [], 'no timer outlives cleanup');
  assert.deepEqual(fs.readdirSync(parent), [path.basename(root)]);
});

test('a startup that overruns its 10-second bound times out before any prompt', async () => {
  const creation = deferred();
  const fake = fakeSdk({ rpc: { 'tools.getCurrentMetadata': () => creation.promise } });
  const { request, checkpoints } = workerRequest();
  const { worker, timers } = start(request, fake.sdk);
  await until(() => fake.log.includes('tools.getCurrentMetadata'), 'readiness is under way');
  timers.fire(WORKER_LIMITS.startupMs);
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason, result.delivery], ['timed_out', 'startup_deadline', 'not_sent']);
  assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'timed_out', reason: 'startup_deadline' });
  creation.resolve({ tools: [] });
  await flush();
  assert.equal(fake.log.includes('send'), false);
  assert.deepEqual(checkpoints, []);
  await worker.closed;
  assert.deepEqual(timers.pending(), []);
});

/**
 * B's checkpoint while its operation and grant stay current: the operation's 120-second deadline, read on the
 * worker's own clock, is still ahead in every case below, so only the worker's own bounds can end it.
 * @param {() => number} clock @param {number} origin
 */
const operationCurrent = (clock, origin) => () => (clock() < origin + 120_000 ? { ok: true } : { ok: false, reason: 'operation_ended' });

test('readiness counts only if worker_preflight was recorded before the 10-second startup bound and the deadline, read again right after recording while neither timer has fired', async (context) => {
  /** @type {Array<{label: string, timeoutMs: number, enter: number, leave: number, reason: string | null}>} */
  const cases = [
    { label: 'recorded from 9,998 to 9,999 ms, a positive control', timeoutMs: WORKER_LIMITS.maxMs, enter: 9_998, leave: 9_999, reason: null },
    { label: 'recorded from 9,999 to exactly 10,000 ms', timeoutMs: WORKER_LIMITS.maxMs, enter: 9_999, leave: 10_000, reason: 'startup_deadline' },
    { label: 'recorded from 9,999 to 10,001 ms', timeoutMs: WORKER_LIMITS.maxMs, enter: 9_999, leave: 10_001, reason: 'startup_deadline' },
    { label: 'a 5-second deadline still ahead at 4,999 ms, a positive control', timeoutMs: 5_000, enter: 4_998, leave: 4_999, reason: null },
    { label: 'a 5-second deadline reached while recording', timeoutMs: 5_000, enter: 4_999, leave: 5_000, reason: 'deadline' },
  ];
  for (const { label, timeoutMs, enter, leave, reason } of cases) {
    await context.test(label, async () => {
      const origin = 1_000_000;
      let clock = origin;
      const timers = fakeTimers();
      /** @type {number[][]} */
      const pendingWhileRecording = [];
      const fake = fakeSdk();
      const current = operationCurrent(() => clock, origin);
      const handlers = workerRequest({
        log: fake.log,
        checkpoint: (entry) => {
          if (entry.kind === 'worker_preflight') {
            // Recording takes from `enter` to `leave` while no timer can run.
            clock = origin + enter;
            pendingWhileRecording.push(timers.pending().sort((a, b) => a - b));
            clock = origin + leave;
          }
          return current();
        },
      });
      handlers.request.timeoutMs = timeoutMs;
      const { worker } = start(handlers.request, fake.sdk, { timers, now: () => clock });
      const startup = /** @type {any} */ (await worker.startup);
      assert.deepEqual(pendingWhileRecording, [[timeoutMs, WORKER_LIMITS.startupMs].sort((a, b) => a - b)], `${label}: neither timer had fired`);
      if (reason === null) {
        assert.equal(startup.ok, true, label);
        const result = await worker.result;
        assert.deepEqual([result.outcome, result.answer?.text], ['answered', 'Observed 101.'], label);
        assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted'], label);
        assert.ok(fake.log.indexOf('checkpoint worker_ready') < fake.log.indexOf('send'), label);
      } else {
        assert.deepEqual({ ...startup }, { ok: false, outcome: 'timed_out', reason }, `${label}: readiness is not claimed`);
        const result = await worker.result;
        assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['timed_out', reason, 'not_sent', null], label);
        await flush();
        assert.equal(fake.log.includes('send'), false, `${label}: no first prompt`);
        assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight'], `${label}: nothing is recorded as ready`);
      }
      assert.deepEqual(handlers.provided, [], label);
      await worker.closed;
      assert.deepEqual(timers.pending(), [], `${label}: no timer outlives the result`);
    });
  }
});

test('a completion seen at or past the 90-second worker deadline is no answer, though its timer is still pending and B\'s operation is still current, and nothing later revives it', async (context) => {
  /** @type {Array<[string, number, boolean]>} */
  const cases = [
    ['completed at 89,999 ms, a positive control', 89_999, true],
    ['completed at exactly 90,000 ms', 90_000, false],
    ['completed at 90,001 ms', 90_001, false],
  ];
  for (const [label, at, answered] of cases) {
    await context.test(label, async () => {
      const origin = 1_000_000;
      let clock = origin;
      const runGate = deferred();
      const fake = fakeSdk({
        run: async () => {
          await runGate.promise;
          // The final reply and normal completion arrive at `at`; the deadline timer has not run.
          clock = origin + at;
          return reply('Observed 101.');
        },
      });
      const handlers = workerRequest({ log: fake.log, checkpoint: operationCurrent(() => clock, origin) });
      handlers.request.timeoutMs = WORKER_LIMITS.maxMs;
      const { worker, timers } = start(handlers.request, fake.sdk, { now: () => clock });
      await promptSent(fake);
      assert.deepEqual(timers.pending(), [WORKER_LIMITS.maxMs], `${label}: only the deadline timer is pending, and it never fires`);
      runGate.resolve(undefined);
      const result = await worker.result;
      assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted'], label);
      assert.ok(fake.log.indexOf('send') < fake.log.indexOf('checkpoint worker_request_admitted'), `${label}: the admission is recorded once send returned`);
      if (answered) {
        assert.deepEqual([result.outcome, result.reason, result.answer?.text], ['answered', null, 'Observed 101.'], label);
      } else {
        assert.deepEqual(
          [result.outcome, result.reason, result.delivery, result.admissionId, result.answer],
          ['timed_out', 'deadline', 'possibly_sent', ADMISSION_ID, null],
          label,
        );
        assert.deepEqual(timers.pending(), [], `${label}: the settled result cancelled the deadline timer`);
        const session = fake.sessions[0];
        session.emit(reply('Observed 102.'));
        session.emit({ type: 'session.idle', data: {} });
        await flush();
        assert.equal(await worker.result, result, `${label}: a later reply and completion cannot revive success`);
        assert.equal(worker.cancel(), false, label);
      }
      assert.equal((/** @type {any} */ (await worker.startup)).ok, true, `${label}: readiness came well before the deadline`);
      const closed = await worker.closed;
      assert.deepEqual([closed.runtime, closed.abort, closed.stop, closed.storage], ['unconfirmed', 'not_needed', 'clean', 'retained'], label);
      assert.deepEqual(timers.pending(), [], label);
    });
  }
});

test('a model evidence call reaches B\'s provider, and B\'s answer reaches the model, only before the 90-second worker deadline, read on the clock while its timer is still pending and B\'s operation is still current', async (context) => {
  const origin = 1_000_000;
  const valid = { reference: 'ideas/101-peer-idea.md' };
  const served = { resultType: 'success', textResultForLlm: 'number: 101' };

  /** A read from 89,000 ms that waits for its root request, which names it at `at`. @param {any} setup @param {number} at */
  async function requestedAt(setup, at) {
    setup.at(89_000);
    const call = setup.session.call(WORKER_TOOLS.read, valid, {}, { request: false });
    await flush();
    assert.equal(setup.reads(), 0, 'it waits for its root request without reading');
    setup.at(at);
    setup.session.emit(reply('', { toolRequests: [{ toolCallId: 'call-1', name: WORKER_TOOLS.read }] }));
    return call;
  }

  /** A qualification run's read from 89,000 ms, held until its exact evidence release is read at `at`. @param {any} setup @param {number} at */
  async function releasedAt(setup, at) {
    setup.at(89_000);
    const call = setup.session.call(WORKER_TOOLS.read, valid);
    const pending = await until(() => setup.checkpoints.find((/** @type {any} */ entry) => entry.kind === 'worker_evidence_pending'), 'the hold is recorded');
    writeRelease(setup.fixture.root, `${setup.worker.workerId}.evidence-release.json`, JSON.stringify({
      version: 1, release: 'evidence', runId: setup.fixture.runId, workerId: setup.worker.workerId, operationId: BINDING.operationId,
      permitId: BINDING.permitId, sessionId: SESSION_ID, admissionId: ADMISSION_ID, toolCallId: 'call-1', observationSha256: sha256(JSON.stringify(pending.data)),
    }));
    assert.equal(setup.reads(), 0, 'nothing is read while held');
    setup.at(at);
    // The release poll's own interval, not the deadline timer.
    setup.timers.fire(100);
    return call;
  }

  /** A read from 89,000 ms whose provider answer, pending meanwhile, is given at `at`. @param {any} setup @param {number} at */
  async function answeredAt(setup, at) {
    const answer = deferred();
    setup.work = () => answer.promise;
    setup.at(89_000);
    const call = setup.session.call(WORKER_TOOLS.read, valid);
    await until(() => setup.reads() === 1, 'B\'s provider is called');
    setup.at(at);
    answer.resolve(undefined);
    return call;
  }

  /**
   * A read whose provider reads and records its answer synchronously from `enter` to `leave`, while no timer can run.
   * @param {any} setup @param {number} enter @param {number} leave
   */
  async function recordedFrom(setup, enter, leave) {
    setup.work = () => {
      setup.at(leave);
    };
    setup.at(enter);
    return setup.session.call(WORKER_TOOLS.read, valid);
  }

  /** @type {Array<{label: string, answered: boolean, reads: number, qualified?: boolean, act: (setup: any) => Promise<unknown>}>} */
  const cases = [
    {
      label: 'a read started at 89,999 ms, a positive control',
      answered: true,
      reads: 1,
      act: async (setup) => {
        setup.at(89_999);
        return setup.session.call(WORKER_TOOLS.read, valid);
      },
    },
    {
      label: 'an inventory call started at exactly 90,000 ms',
      answered: false,
      reads: 0,
      act: async (setup) => {
        setup.at(90_000);
        return setup.session.call(WORKER_TOOLS.inventory, {});
      },
    },
    {
      label: 'a read started at exactly 90,000 ms',
      answered: false,
      reads: 0,
      act: async (setup) => {
        setup.at(90_000);
        return setup.session.call(WORKER_TOOLS.read, valid);
      },
    },
    { label: 'a read from 89,000 ms whose root request names it at 89,999 ms, a positive control', answered: true, reads: 1, act: (setup) => requestedAt(setup, 89_999) },
    { label: 'a read from 89,000 ms whose root request names it at exactly 90,000 ms', answered: false, reads: 0, act: (setup) => requestedAt(setup, 90_000) },
    {
      label: 'a qualification run\'s read held from 89,000 ms and released at 89,999 ms, a positive control',
      answered: true,
      reads: 1,
      qualified: true,
      act: (setup) => releasedAt(setup, 89_999),
    },
    {
      label: 'a qualification run\'s read held from 89,000 ms and released at exactly 90,000 ms',
      answered: false,
      reads: 0,
      qualified: true,
      act: (setup) => releasedAt(setup, 90_000),
    },
    { label: 'B\'s answer pending from 89,000 ms and given at 89,999 ms, a positive control', answered: true, reads: 1, act: (setup) => answeredAt(setup, 89_999) },
    { label: 'B\'s answer pending from 89,000 ms and given at exactly 90,000 ms', answered: false, reads: 1, act: (setup) => answeredAt(setup, 90_000) },
    { label: 'B recording its answer from 89,998 to 89,999 ms, a positive control', answered: true, reads: 1, act: (setup) => recordedFrom(setup, 89_998, 89_999) },
    { label: 'B recording its answer from 89,999 to exactly 90,000 ms', answered: false, reads: 1, act: (setup) => recordedFrom(setup, 89_999, 90_000) },
  ];
  for (const { label, answered, reads, qualified = false, act } of cases) {
    await context.test(label, async () => {
      let clock = origin;
      // B's checkpoint and provider while its operation and grant stay current, through its 120-second deadline.
      const current = operationCurrent(() => clock, origin);
      /** @type {any} */
      const setup = {
        at: (/** @type {number} */ ms) => {
          clock = origin + ms;
        },
        /** B's own reading and recording before it answers; it may move the clock or return a promise to wait for. */
        work: () => undefined,
      };
      /** B's answer once its work is done: the evidence, while its operation is current. @param {string} text */
      const provide = (text) => {
        const answer = () => {
          const operation = current();
          return operation.ok ? { ok: true, text } : operation;
        };
        const working = setup.work();
        return working instanceof Promise ? working.then(answer) : answer();
      };
      const runGate = deferred();
      const fake = fakeSdk({ run: () => runGate.promise });
      const handlers = workerRequest({
        log: fake.log,
        checkpoint: current,
        inventory: () => provide('101-peer-idea.md'),
        // Like the conversation's reader, it refuses any reference its listing never showed, such as the qualification probe's.
        read: (readRequest) => (readRequest.reference.startsWith('ideas/') ? provide('number: 101') : { ok: false, reason: 'not_listed' }),
      });
      handlers.request.timeoutMs = WORKER_LIMITS.maxMs;
      const fixture = qualified ? qualificationFixture() : null;
      if (fixture) handlers.request.qualification = fixture.qualification;
      const { worker, timers } = start(handlers.request, fake.sdk, { now: () => clock });
      if (fixture) {
        const startup = await worker.startup;
        writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
        timers.fire(100);
      }
      const session = await promptSent(fake);
      assert.deepEqual(timers.pending(), [WORKER_LIMITS.maxMs], `${label}: only the deadline timer is pending, and it never fires`);
      Object.assign(setup, {
        session,
        worker,
        timers,
        fixture,
        checkpoints: handlers.checkpoints,
        reads: () => handlers.provided.filter((entry) => entry.call.toolCallId.startsWith('call-')).length,
      });

      const returned = await act(setup);
      assert.equal(setup.reads(), reads, `${label}: B's provider handler calls`);
      if (answered) {
        assert.deepEqual(returned, served, label);
        assert.deepEqual(timers.pending(), [WORKER_LIMITS.maxMs], `${label}: the worker is still running`);
        runGate.resolve(reply('Observed 101.'));
        const result = await worker.result;
        assert.deepEqual([result.outcome, result.reason, result.answer?.text], ['answered', null, 'Observed 101.'], label);
        assert.deepEqual(result.observations.map((entry) => [entry.toolCallId, entry.outcome]), [['call-1', 'returned']], label);
      } else {
        assert.deepEqual(returned, NOT_RUNNING, `${label}: the custom-tool caller gets no evidence`);
        const result = await worker.result;
        assert.deepEqual(
          [result.outcome, result.reason, result.delivery, result.admissionId, result.answer],
          ['timed_out', 'deadline', 'possibly_sent', ADMISSION_ID, null],
          `${label}: the worker's own deadline ended it, not B's operation`,
        );
        assert.equal(result.observations.length, 0, `${label}: nothing was returned to the model`);
        assert.equal(timers.pending().includes(WORKER_LIMITS.maxMs), false, `${label}: the settled result cancelled the deadline timer`);
        runGate.resolve(reply('Observed 101.'));
        await flush();
        assert.equal(await worker.result, result, `${label}: a later reply and completion cannot revive success`);
        assert.equal(setup.reads(), reads, `${label}: nothing more is read`);
      }
      const recorded = ['worker_preflight', 'worker_ready', 'worker_request_admitted', ...(qualified ? ['worker_evidence_pending'] : [])];
      assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), recorded, label);
      const closed = await worker.closed;
      assert.deepEqual([closed.runtime, closed.stop, closed.storage], ['unconfirmed', 'clean', 'retained'], label);
      assert.deepEqual(fake.steps(), ['forStdio', 'construct', 'createSession', 'send', ...(answered ? [] : ['abort']), 'stop'], `${label}: one cleanup`);
      assert.deepEqual(timers.pending(), [], `${label}: no timer outlives cleanup`);
    });
  }
});

test('cancel settles at once with possible disclosure, and cleanup completes afterward', async () => {
  const runGate = deferred();
  const stopGate = deferred();
  const fake = fakeSdk({ run: () => runGate.promise, stop: () => stopGate.promise });
  const { request, provided } = workerRequest();
  const { worker, parent } = start(request, fake.sdk);
  const session = await promptSent(fake);
  await session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' });
  assert.equal(worker.cancel(), true);
  assert.equal(worker.cancel(), false, 'cancel is idempotent');
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['cancelled', 'cancelled', 'possibly_sent', null]);
  assert.equal(result.observations.length, 1, 'evidence already returned to the model is reported');

  let closedSettled = false;
  void worker.closed.then(() => {
    closedSettled = true;
  });
  await until(() => fake.log.includes('stop'), 'stop is requested');
  await flush();
  assert.equal(closedSettled, false, 'the result does not wait for cleanup');
  assert.ok(fake.log.indexOf('abort') < fake.log.indexOf('stop'), 'abort precedes stop');
  assert.deepEqual(await session.call(WORKER_TOOLS.inventory, {}), NOT_RUNNING);
  assert.equal(provided.length, 1);

  stopGate.resolve([]);
  const closed = await worker.closed;
  assert.deepEqual([closed.runtime, closed.abort, closed.stop, closed.forceStop, closed.storage], ['unconfirmed', 'acknowledged', 'clean', 'not_needed', 'retained']);
  runGate.resolve(reply('Observed 101.'));
  await flush();
  assert.equal((await worker.result).outcome, 'cancelled', 'a later reply cannot replace cancellation');
  assert.deepEqual(fs.readdirSync(parent), [path.basename(String(closed.retainedPath))]);
});

test('cancel before the SDK loads, during session creation, or during readiness leaves no runtime unreported and sends nothing', async (context) => {
  await context.test('before the SDK loads', async () => {
    const loader = deferred();
    const fake = fakeSdk();
    const { request } = workerRequest();
    const parent = tempDir();
    const timers = fakeTimers();
    const worker = startEvidenceWorker(request, { loadSdk: () => loader.promise, tempParent: parent, timers });
    assert.equal(worker.cancel(), true);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.delivery, result.sessionId], ['cancelled', 'not_sent', null]);
    assert.deepEqual({ ...(await worker.closed) }, nothingClosed(worker.workerId));
    loader.resolve(fake.sdk);
    await flush();
    assert.deepEqual(fake.log, [], 'an SDK that loads late starts nothing');
    assert.deepEqual(fs.readdirSync(parent), []);
    assert.deepEqual(timers.pending(), []);
  });

  await context.test('in the same turn as a synchronous SDK load', async () => {
    const fake = fakeSdk();
    const { request } = workerRequest();
    const parent = tempDir();
    const timers = fakeTimers();
    // The loaded value is already settled when cancel runs, so it can win the wait.
    const worker = startEvidenceWorker(request, { loadSdk: () => fake.sdk, tempParent: parent, timers });
    assert.equal(worker.cancel(), true);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.delivery], ['cancelled', 'not_sent']);
    assert.deepEqual({ ...(await worker.closed) }, nothingClosed(worker.workerId));
    assert.deepEqual(fake.log, [], 'no storage, client, or runtime after cancellation');
    assert.deepEqual(fs.readdirSync(parent), []);
  });

  await context.test('while session creation settles within the stop window', async () => {
    const creation = deferred();
    /** @type {{config: any, makeSession: (config: any) => any} | null} */
    let pending = null;
    const fake = fakeSdk({
      createSession: (config, makeSession) => {
        pending = { config, makeSession };
        return creation.promise;
      },
    });
    const { request } = workerRequest();
    const { worker, parent } = start(request, fake.sdk);
    const created = await until(() => pending, 'session creation starts');
    assert.equal(worker.cancel(), true);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.delivery, result.sessionId], ['cancelled', 'not_sent', null]);
    await flush();
    assert.equal(fake.log.includes('stop'), false, 'stop waits for session creation to settle');
    creation.resolve(created.makeSession(created.config));
    const closed = await worker.closed;
    assert.deepEqual([closed.runtime, closed.abort, closed.stop, closed.storage], ['unconfirmed', 'not_needed', 'clean', 'retained']);
    assert.equal(fake.log.includes('send'), false, 'nothing was sent');
    assert.deepEqual(fs.readdirSync(parent), [path.basename(String(closed.retainedPath))]);
  });

  await context.test('while readiness waits on a public call', async () => {
    const held = deferred();
    const fake = fakeSdk({ rpc: { 'extensions.list': () => held.promise } });
    const { request, checkpoints } = workerRequest();
    const { worker } = start(request, fake.sdk);
    await until(() => fake.log.includes('extensions.list'), 'readiness is under way');
    assert.equal(worker.cancel(), true);
    held.resolve({ extensions: [] });
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.delivery, result.sessionId], ['cancelled', 'not_sent', SESSION_ID]);
    await flush();
    assert.equal(fake.log.includes('send'), false);
    assert.deepEqual(checkpoints, []);
    assert.equal((await worker.closed).storage, 'retained');
  });

  await context.test('while session creation never settles', async () => {
    const fake = fakeSdk({ createSession: () => new Promise(() => {}) });
    const { request } = workerRequest();
    const { worker, parent, timers } = start(request, fake.sdk);
    await until(() => fake.log.includes('createSession'), 'session creation starts');
    worker.cancel();
    await worker.result;
    await until(() => timers.pending().includes(WORKER_LIMITS.stopMs), 'the stop window opens');
    timers.fire(WORKER_LIMITS.stopMs);
    const closed = await worker.closed;
    assert.ok(closed.retainedPath);
    assert.deepEqual({ ...closed }, {
      workerId: worker.workerId, runtime: 'unconfirmed', abort: 'not_needed', stop: 'skipped', stopErrors: 0,
      forceStop: 'completed', storage: 'retained', retainedPath: closed.retainedPath,
    });
    assert.deepEqual(fs.readdirSync(parent), [path.basename(closed.retainedPath)], 'the exact owned directory is kept');
    assert.equal(fake.log.includes('stop'), false, 'stop never races an unsettled startup');
    assert.equal(fake.log.at(-1), 'forceStop');
    assert.deepEqual(timers.pending(), []);
  });
});

test('stop errors, overruns, or failures fall back to a bounded forceStop and keep the exact storage', async (context) => {
  await context.test('stop reports errors', async () => {
    const fake = fakeSdk({ stop: () => Promise.resolve([new Error(`Failed to gracefully shut down runtime ${TOKEN}`)]) });
    const { request } = workerRequest();
    const { worker, parent } = start(request, fake.sdk);
    assert.equal((await worker.result).outcome, 'answered', 'cleanup cannot change the settled result');
    const closed = await worker.closed;
    assert.ok(closed.retainedPath);
    assert.deepEqual({ ...closed }, {
      workerId: worker.workerId, runtime: 'unconfirmed', abort: 'not_needed', stop: 'errors', stopErrors: 1,
      forceStop: 'completed', storage: 'retained', retainedPath: closed.retainedPath,
    });
    assert.equal(path.dirname(closed.retainedPath), parent);
    for (const folder of ['work', 'config', 'home', 'temp']) assert.ok(fs.statSync(path.join(closed.retainedPath, folder)).isDirectory(), folder);
    assert.deepEqual(fake.log.slice(-2), ['stop', 'forceStop']);
    assertNoSecrets(closed, 'the cleanup report');
  });

  await context.test('stop and forceStop overrun their windows', async () => {
    const fake = fakeSdk({ stop: () => new Promise(() => {}), forceStop: () => new Promise(() => {}) });
    const { request } = workerRequest();
    const { worker, timers } = start(request, fake.sdk);
    await worker.result;
    await until(() => fake.log.includes('stop') && timers.pending().includes(WORKER_LIMITS.stopMs), 'stop is pending');
    timers.fire(WORKER_LIMITS.stopMs);
    await until(() => fake.log.includes('forceStop') && timers.pending().includes(WORKER_LIMITS.forceStopMs), 'forceStop is pending');
    timers.fire(WORKER_LIMITS.forceStopMs);
    const closed = await worker.closed;
    assert.deepEqual([closed.runtime, closed.stop, closed.forceStop, closed.storage], ['unconfirmed', 'timed_out', 'timed_out', 'retained']);
    assert.ok(closed.retainedPath && fs.existsSync(closed.retainedPath));
    assert.deepEqual(timers.pending(), []);
  });

  await context.test('stop and forceStop reject', async () => {
    const fake = fakeSdk({
      stop: () => Promise.reject(new Error('connection lost')),
      forceStop: () => Promise.reject(new Error('Timed out waiting for CLI process to exit after SIGKILL')),
    });
    const { request } = workerRequest();
    const { worker } = start(request, fake.sdk);
    const closed = await worker.closed;
    assert.deepEqual([closed.runtime, closed.stop, closed.forceStop, closed.storage], ['unconfirmed', 'failed', 'failed', 'retained']);
    assert.ok(closed.retainedPath && fs.existsSync(closed.retainedPath));
  });
});

test('an error-free stop() is not proof of cessation, so the runtime stays unconfirmed and its exact storage is kept', async (context) => {
  /** @type {Array<[string, Script]>} */
  const cases = [
    ['after an answer', {}],
    // Once its connection has closed, the SDK's stop() skips the runtime's shutdown and still returns no errors.
    ['after the connection closed as the prompt was sent', { send: () => Promise.reject(new Error('Session disconnected while waiting for a response')) }],
  ];
  for (const [label, script] of cases) {
    await context.test(label, async () => {
      const fake = fakeSdk({ ...script, stop: () => Promise.resolve([]) });
      const { request } = workerRequest();
      const { worker, parent, timers } = start(request, fake.sdk);
      await worker.result;
      const closed = await worker.closed;
      const root = path.dirname(fake.clients[0].options.workingDirectory);
      assert.deepEqual({ ...closed }, {
        workerId: worker.workerId, runtime: 'unconfirmed', abort: 'not_needed', stop: 'clean', stopErrors: 0,
        forceStop: 'not_needed', storage: 'retained', retainedPath: root,
      });
      assert.deepEqual(fs.readdirSync(parent), [path.basename(root)], 'only the exact owned directory is kept');
      assert.deepEqual(fs.readdirSync(root).sort(), ['config', 'home', 'temp', 'work']);
      assert.deepEqual(timers.pending(), []);
    });
  }
});

test('setup failures refuse or fail before sending, and delete storage only when no runtime could have used it', async (context) => {
  /** @type {Array<{label: string, setup: () => {sdk: any, steps: () => string[], adapters?: object}, outcome: string, reason: string, runtime: string, storage: string, steps: string[]}>} */
  const cases = [
    {
      label: 'the SDK fails to load',
      setup: () => ({ ...fakeSdk(), adapters: { loadSdk: () => Promise.reject(Object.assign(new Error(`cannot find ${TOKEN}`), { code: 'sdk_artifact_changed' })) } }),
      outcome: 'refused', reason: 'sdk_unavailable', runtime: 'not_started', storage: 'none', steps: [],
    },
    {
      label: 'RuntimeConnection.forStdio is missing',
      setup: () => {
        const fake = fakeSdk();
        return { ...fake, sdk: { ...fake.sdk, RuntimeConnection: {} } };
      },
      outcome: 'refused', reason: 'sdk_unsupported', runtime: 'not_started', storage: 'none', steps: [],
    },
    {
      label: 'defineTool is missing',
      setup: () => {
        const fake = fakeSdk();
        return { ...fake, sdk: { ...fake.sdk, defineTool: undefined } };
      },
      outcome: 'refused', reason: 'sdk_unsupported', runtime: 'not_started', storage: 'none', steps: [],
    },
    {
      label: 'CopilotClient is not constructible',
      setup: () => {
        const fake = fakeSdk();
        return { ...fake, sdk: { ...fake.sdk, CopilotClient: {} } };
      },
      outcome: 'refused', reason: 'sdk_unsupported', runtime: 'not_started', storage: 'none', steps: [],
    },
    {
      label: 'the temporary parent is unavailable',
      setup: () => ({ ...fakeSdk(), adapters: { tempParent: path.join(tempDir(), 'missing') } }),
      outcome: 'refused', reason: 'storage_unavailable', runtime: 'not_started', storage: 'none', steps: [],
    },
    {
      label: 'the client constructor throws',
      setup: () => fakeSdk({ construct: () => { throw new Error(`invalid options ${TOKEN}`); } }),
      outcome: 'failed', reason: 'client_failed', runtime: 'not_started', storage: 'deleted', steps: ['forStdio', 'construct'],
    },
    {
      label: 'the client lacks forceStop',
      setup: () => fakeSdk({ construct: (client) => { client.forceStop = undefined; } }),
      outcome: 'refused', reason: 'sdk_unsupported', runtime: 'not_started', storage: 'deleted', steps: ['forStdio', 'construct'],
    },
    {
      label: 'the client lacks getStatus',
      setup: () => fakeSdk({ construct: (client) => { client.getStatus = undefined; } }),
      outcome: 'refused', reason: 'sdk_unsupported', runtime: 'not_started', storage: 'deleted', steps: ['forStdio', 'construct'],
    },
    {
      label: 'session creation rejects',
      setup: () => fakeSdk({ createSession: () => Promise.reject(new Error(`CLI exited; stderr ${TOKEN}`)) }),
      outcome: 'failed', reason: 'session_failed', runtime: 'unconfirmed', storage: 'retained', steps: ['forStdio', 'construct', 'createSession', 'stop'],
    },
    {
      label: 'the session lacks send',
      setup: () => fakeSdk({
        createSession: (config, makeSession) => {
          const session = makeSession(config);
          session.send = undefined;
          return Promise.resolve(session);
        },
      }),
      outcome: 'refused', reason: 'sdk_unsupported', runtime: 'unconfirmed', storage: 'retained', steps: ['forStdio', 'construct', 'createSession', 'stop'],
    },
  ];
  for (const { label, setup, outcome, reason, runtime, storage, steps } of cases) {
    await context.test(label, async () => {
      const fake = setup();
      const { request } = workerRequest();
      const { worker, parent, timers } = start(request, fake.sdk, fake.adapters);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], [outcome, reason, 'not_sent', null]);
      assertNoSecrets(result, label);
      const closed = await worker.closed;
      assert.deepEqual([closed.runtime, closed.storage], [runtime, storage]);
      assert.deepEqual(fake.steps(), steps);
      if (storage === 'retained') {
        assert.equal(path.dirname(String(closed.retainedPath)), parent);
        assert.deepEqual(fs.readdirSync(parent), [path.basename(String(closed.retainedPath))], 'only the exact owned directory is kept');
      } else {
        assert.equal(closed.retainedPath, null);
        assert.deepEqual(fs.readdirSync(parent), [], 'nothing this worker created remains');
      }
      assert.deepEqual(timers.pending(), []);
    });
  }
});

test('storage no runtime used is removed within the cleanup bound, and a removal still running then is reported pending', async (context) => {
  const bound = WORKER_LIMITS.stopMs + WORKER_LIMITS.forceStopMs;
  /**
   * A worker whose client constructor throws after its storage exists, so no runtime starts.
   * @param {(directory: string) => Promise<unknown>} removeTree
   */
  function startUnused(removeTree) {
    const fake = fakeSdk({ construct: () => { throw new Error('invalid options'); } });
    const { request } = workerRequest();
    return start(request, fake.sdk, { removeTree });
  }

  await context.test('a removal that outlasts the bound', async () => {
    const removal = deferred();
    /** @type {string[]} */
    const removing = [];
    const { worker, parent, timers } = startUnused((directory) => {
      removing.push(directory);
      return removal.promise;
    });
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason], ['failed', 'client_failed']);
    /** @type {any} */
    let closed = null;
    void worker.closed.then((value) => {
      closed = value;
    });
    await until(() => removing.length === 1, 'the removal starts');
    assert.ok(timers.pending().includes(bound), 'the removal runs under the whole cleanup bound');
    assert.deepEqual(removing, fs.readdirSync(parent).map((name) => path.join(parent, name)), 'only the exact owned directory is removed');
    await flush();
    assert.equal(closed, null, 'closed waits for the removal while the bound lasts');
    timers.fire(bound);
    await flush();
    assert.ok(closed, 'closed settles when the bound ends, without the removal');
    assert.deepEqual({ ...closed }, { ...nothingClosed(worker.workerId), storage: 'delete_pending', retainedPath: removing[0] });
    removal.resolve(undefined);
    await flush();
    assert.equal(removing.length, 1, 'no second removal starts');
    assert.equal(await worker.closed, closed, 'a late removal changes nothing reported');
    assert.deepEqual(timers.pending(), []);
  });

  await context.test('a removal that finishes within the bound', async () => {
    const removal = deferred();
    const { worker, parent, timers } = startUnused((directory) => removal.promise.then(() => fs.rmSync(directory, { recursive: true })));
    await until(() => timers.pending().includes(bound), 'the removal runs under the whole cleanup bound');
    removal.resolve(undefined);
    assert.deepEqual({ ...(await worker.closed) }, { ...nothingClosed(worker.workerId), storage: 'deleted' });
    assert.deepEqual(fs.readdirSync(parent), []);
    assert.deepEqual(timers.pending(), [], 'the bound is cancelled');
  });

  await context.test('a removal that fails', async () => {
    const { worker, parent, timers } = startUnused(() => Promise.reject(new Error(`EBUSY ${TOKEN}`)));
    const closed = await worker.closed;
    assert.deepEqual(
      { ...closed },
      { ...nothingClosed(worker.workerId), storage: 'delete_failed', retainedPath: path.join(parent, fs.readdirSync(parent)[0]) },
    );
    assertNoSecrets(closed, 'the cleanup report');
    assert.deepEqual(timers.pending(), []);
  });
});

/**
 * A hash-bound qualification fixture in its own test-owned root: synthetic
 * canary sources, a closed manifest, and the binding that names it.
 * @param {{mutate?: (manifest: any, root: string, sources: Record<string, string>) => void, pad?: number}} [options]
 *   `mutate` changes the manifest or sources before hashing; `pad` appends that many spaces to the manifest bytes.
 */
function qualificationFixture({ mutate, pad = 0 } = {}) {
  const root = tempDir();
  const runId = randomUUID();
  /** @type {Record<string, string>} */
  const sources = {
    'canaries/AGENTS.md': '# Canary AGENTS.md: loading this would show discovery stayed on.\n',
    'canaries/copilot-instructions.md': 'Canary custom instructions.\n',
    'canaries/canary.instructions.md': '---\napplyTo: "**"\n---\nCanary on-demand instructions.\n',
    'canaries/hooks.json': '{"version":1,"hooks":{}}\n',
    'canaries/SKILL.md': '---\nname: canary\ndescription: Canary skill.\n---\n',
    'canaries/mcp-config.json': '{"mcpServers":{"dude-canary":{"command":"never-run"}}}\n',
    'canaries/HEAD': 'ref: refs/heads/canary\n',
    'canaries/denied-read.txt': 'synthetic denied read target\n',
  };
  /** @param {string} kind @param {string} location @param {string} destination @param {string | null} source */
  const entry = (kind, location, destination, source) => ({
    kind, location, path: destination, source, sha256: source === null ? null : sha256(/** @type {string} */ (sources[source])),
  });
  const manifest = {
    version: 1,
    runId,
    canaries: [
      entry('agents', 'work', 'AGENTS.md', 'canaries/AGENTS.md'),
      entry('instructions', 'work', '.github/copilot-instructions.md', 'canaries/copilot-instructions.md'),
      entry('on_demand_instructions', 'work', '.github/instructions/canary.instructions.md', 'canaries/canary.instructions.md'),
      entry('hooks', 'work', '.github/hooks/canary.json', 'canaries/hooks.json'),
      entry('skills', 'work', '.github/skills/canary/SKILL.md', 'canaries/SKILL.md'),
      entry('mcp', 'config', 'mcp-config.json', 'canaries/mcp-config.json'),
      entry('git', 'work', '.git/HEAD', 'canaries/HEAD'),
      entry('denied_read', 'home', 'denied/read-target.txt', 'canaries/denied-read.txt'),
      entry('denied_write', 'work', 'denied/write-target.txt', null),
    ],
  };
  mutate?.(manifest, root, sources);
  for (const [relative, content] of Object.entries(sources)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  }
  const bytes = `${JSON.stringify(manifest)}${' '.repeat(pad)}`;
  fs.writeFileSync(path.join(root, 'manifest.json'), bytes);
  return { root, runId, manifest, sources, qualification: { version: 1, runId, fixtureRoot: root, fixtureSha256: sha256(bytes) } };
}

/** Write one release file under the fixture root in one rename. @param {string} root @param {string} name @param {string} text */
function writeRelease(root, name, text) {
  const file = path.join(root, name);
  fs.writeFileSync(`${file}.partial`, text);
  fs.renameSync(`${file}.partial`, file);
}

/** A provider read handler that, like the conversation's, refuses any reference its listing never showed. */
const listedOnly = (/** @type {any} */ readRequest) => (readRequest.reference.startsWith('ideas/') ? { ok: true, text: 'number: 101' } : { ok: false, reason: 'not_listed' });

/**
 * A qualification worker on a fresh fixture, with the listing-only read handler.
 * @param {Script} [script] @param {Parameters<typeof qualificationFixture>[0]} [fixtureOptions]
 */
function startQualified(script = {}, fixtureOptions = {}) {
  const fixture = qualificationFixture(fixtureOptions);
  const fake = fakeSdk(script);
  const handlers = workerRequest({ read: listedOnly, log: fake.log });
  handlers.request.qualification = fixture.qualification;
  const started = start(handlers.request, fake.sdk);
  return { fixture, fake, ...handlers, ...started };
}

/** The exact startup release for a ready worker. @param {any} fixture @param {any} worker @param {any} startup */
function startupRelease(fixture, worker, startup) {
  return {
    version: 1, release: 'startup', runId: fixture.runId, workerId: worker.workerId, operationId: BINDING.operationId,
    permitId: BINDING.permitId, sessionId: SESSION_ID, observationSha256: startup.sha256,
  };
}

test('a qualification run copies its hash-bound canaries into the worker\'s own folders before the client starts, runs the fixed probe set, and sends only after its exact startup release', async () => {
  const { fixture, fake, worker, timers, checkpoints, provided } = startQualified();
  const startup = /** @type {any} */ (await worker.startup);
  assert.equal(startup.ok, true, JSON.stringify(startup));
  const { folders } = fake.clients[0];
  assert.deepEqual(folders.config, ['mcp-config.json']);
  assert.deepEqual(folders.home.map((/** @type {string} */ entry) => entry.replaceAll('\\', '/')).sort(), ['denied', 'denied/read-target.txt']);
  const work = folders.work.map((/** @type {string} */ entry) => entry.replaceAll('\\', '/'));
  for (const copied of ['AGENTS.md', '.github/copilot-instructions.md', '.github/instructions/canary.instructions.md', '.github/hooks/canary.json',
    '.github/skills/canary/SKILL.md', '.git/HEAD']) {
    assert.ok(work.includes(copied), `${copied} was copied before the client was constructed`);
  }
  assert.equal(work.includes('denied/write-target.txt'), false, 'the denied write destination stays absent');
  assert.deepEqual(folders.temp, []);
  const root = path.dirname(fake.clients[0].options.workingDirectory);
  assert.equal(fs.readFileSync(path.join(root, 'home', 'denied', 'read-target.txt'), 'utf8'), fixture.sources['canaries/denied-read.txt']);

  const { observation } = startup;
  const totalBytes = Object.values(fixture.sources).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  assert.deepEqual(observation.qualification, {
    version: 1, runId: fixture.runId, fixtureSha256: fixture.qualification.fixtureSha256, canaries: 9, canaryBytes: totalBytes,
  });
  const deniedRead = path.join(root, 'home', 'denied', 'read-target.txt');
  const deniedWrite = path.join(root, 'work', 'denied', 'write-target.txt');
  assert.deepEqual(observation.probes.map((/** @type {any} */ probe) => [probe.id, probe.name, probe.cause]), [
    ['dude-a2a-preflight-inventory', WORKER_TOOLS.inventory, 'invalid_arguments'],
    ['dude-a2a-preflight-control-before', 'dude_a2a_unknown_control_before', 'unknown_tool_lookup'],
    ['dude-a2a-preflight-read', WORKER_TOOLS.read, 'not_listed'],
    ['dude-a2a-preflight-view', 'view', 'unoffered_tool_lookup'],
    ['dude-a2a-preflight-create', 'create', 'unoffered_tool_lookup'],
    ['dude-a2a-preflight-shell', 'powershell', 'unoffered_tool_lookup'],
    ['dude-a2a-preflight-mcp', 'dude-canary-probe', 'unoffered_tool_lookup'],
    ['dude-a2a-preflight-control-after', 'dude_a2a_unknown_control_after', 'unknown_tool_lookup'],
    ['dude-a2a-preflight-inventory-after', WORKER_TOOLS.inventory, 'invalid_arguments'],
  ]);
  const template = sha256("Tool '{name}' is not available in this session.");
  for (const probe of observation.probes.filter((/** @type {any} */ entry) => entry.cause.endsWith('_lookup'))) {
    assert.deepEqual([probe.shape, probe.code, probe.templateSha256], ['rpc_error', -32602, template], probe.id);
  }
  assert.deepEqual(observation.probes.map((/** @type {any} */ probe) => probe.argumentsSha256), [
    sha256('{"qualificationProbe":true}'), sha256('{}'), sha256(canonical({ reference: deniedRead })), sha256(canonical({ path: deniedRead })),
    sha256(canonical({ file_text: 'dude-a2a-qualification-marker\n', path: deniedWrite })),
    sha256(canonical({ command: 'exit 0', description: 'Dude A2A qualification probe' })), sha256('{}'), sha256('{}'), sha256('{"qualificationProbe":true}'),
  ]);
  assert.ok(fake.log.indexOf('tools.getBuiltinDescriptors') < fake.log.indexOf('tools.execute view'), 'descriptors are checked before any built-in lookup');
  assert.deepEqual(provided.map((entry) => [entry.tool, entry.request.reference, entry.call.toolCallId]), [['read', deniedRead, 'dude-a2a-preflight-read']],
    'only the unlisted read reached the provider, under its fixed ID');
  assert.ok(Buffer.byteLength(JSON.stringify(observation)) <= WORKER_BOUNDS.startupBytes);

  // Waiting for the exact startup release: recorded readiness, no prompt, and only the fixed poll timer.
  await flush();
  assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight']);
  assert.equal(fake.log.includes('send'), false);
  assert.deepEqual(timers.pending().sort((a, b) => a - b), [100, 60_000]);
  timers.fire(100);
  await flush();
  assert.equal(fake.log.includes('send'), false, 'still no prompt without the release');
  const release = JSON.stringify(startupRelease(fixture, worker, startup));
  writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, release);
  timers.fire(100);
  await promptSent(fake);
  assert.deepEqual(checkpoints[1].data, { workerId: worker.workerId, sessionId: SESSION_ID, observationSha256: startup.sha256, startupRelease: sha256(release) });
  assert.equal(fs.existsSync(deniedWrite), false);
  assert.equal((await worker.result).outcome, 'answered');
  await worker.closed;
  assert.deepEqual(timers.pending(), []);
});

test('a qualification fixture outside its closed manifest, hash, or bounds refuses before any client exists', async (context) => {
  /** @type {Array<[string, Parameters<typeof qualificationFixture>[0], ((fixture: ReturnType<typeof qualificationFixture>) => void)?]>} */
  const cases = [
    ['a manifest whose digest differs', {}, (fixture) => { fixture.qualification.fixtureSha256 = '0'.repeat(64); }],
    ['another run ID', { mutate: (manifest) => { manifest.runId = randomUUID(); } }],
    ['an unknown manifest key', { mutate: (manifest) => { manifest.approved = true; } }],
    ['an unknown canary kind', { mutate: (manifest) => { manifest.canaries[0].kind = 'command'; } }],
    ['a canary destination that escapes', { mutate: (manifest) => { manifest.canaries[0].path = '../escape.md'; } }],
    ['a trailing-dot segment', { mutate: (manifest) => { manifest.canaries[0].path = 'AGENTS.md.'; } }],
    ['an absolute source', { mutate: (manifest, root) => { manifest.canaries[0].source = path.join(root, 'canaries', 'AGENTS.md'); } }],
    ['two denied read targets', { mutate: (manifest) => { manifest.canaries.push({ ...manifest.canaries[7], path: 'denied/second.txt' }); } }],
    ['no absent write destination', { mutate: (manifest) => { manifest.canaries.pop(); } }],
    ['a write destination with content', { mutate: (manifest) => { manifest.canaries[8].source = 'canaries/HEAD'; } }],
    ['one destination twice', { mutate: (manifest) => { manifest.canaries[1].path = 'AGENTS.md'; } }],
    ['canaries over 64 KiB together', {
      mutate: (manifest, root, sources) => {
        sources['canaries/large.md'] = 'x'.repeat(WORKER_BOUNDS.canaryBytes);
        manifest.canaries.unshift({ kind: 'agents', location: 'config', path: 'large.md', source: 'canaries/large.md', sha256: sha256(sources['canaries/large.md']) });
      },
    }],
    ['a manifest over 16 KiB', { pad: WORKER_BOUNDS.manifestBytes }],
    ['a changed canary', {}, (fixture) => { fs.appendFileSync(path.join(fixture.root, 'canaries', 'HEAD'), 'changed\n'); }],
    ['a fixture root that is a file', {}, (fixture) => { fixture.qualification.fixtureRoot = path.join(fixture.root, 'manifest.json'); }],
  ];
  for (const [label, options, change] of cases) {
    await context.test(label, async () => {
      const fixture = qualificationFixture(options);
      change?.(fixture);
      const fake = fakeSdk();
      const { request, checkpoints } = workerRequest({ read: listedOnly });
      request.qualification = fixture.qualification;
      const { worker, parent } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'qualification_fixture_invalid', 'not_sent'], label);
      assert.deepEqual(fake.steps(), [], `${label}: no client, session, or runtime`);
      assert.deepEqual(checkpoints, [], label);
      assert.deepEqual([(await worker.closed).storage, fs.readdirSync(parent)], ['deleted', []], `${label}: no runtime used the storage, so it is removed`);
    });
  }
});

test('qualification probes require the calibrated name-lookup rejection and no effect: a generic, mismatched, or effectful answer refuses before any prompt', async (context) => {
  /** @param {string} name @param {(params: any, session: any, fallback: (params: any) => unknown) => unknown} answer */
  const onLookup = (name, answer) => ({
    rpc: {
      'tools.execute': (/** @type {any} */ params, /** @type {any} */ session, /** @type {any} */ fallback) => (params.name === name
        ? answer(params, session, fallback) : fallback(params)),
    },
  });
  /** @type {Array<{label: string, script: Script, reason: string, detail?: string, read?: (request: any) => unknown}>} */
  const cases = [
    { label: 'a lookup rejection that does not name the tool', script: onLookup('view', () => { throw new Error('Unknown tool'); }), reason: 'probe_cause_unrecognized' },
    { label: 'a built-in rejected unlike the controls', script: onLookup('create', (params) => { throw Object.assign(new Error(`Permission denied for ${params.name}`), { code: -32602 }); }), reason: 'probe_cause_unrecognized' },
    { label: 'a lookup answered with success', script: onLookup('powershell', (params) => ({ resultType: 'success', textResultForLlm: `${params.name} ran` })), reason: 'probe_cause_unrecognized' },
    { label: 'a lookup rejected under another code', script: onLookup('dude-canary-probe', (params) => { throw Object.assign(lookupError(params.name), { code: -32603 }); }), reason: 'probe_cause_unrecognized' },
    { label: 'controls that disagree', script: onLookup('dude_a2a_unknown_control_after', (params) => { throw Object.assign(new Error(`No tool named ${params.name}`), { code: -32602 }); }), reason: 'probe_cause_unrecognized' },
    { label: 'the unlisted read refused for another cause', script: {}, read: () => ({ ok: false, reason: 'outside_scope' }), reason: 'probe_cause_unrecognized' },
    { label: 'the unlisted read reaching evidence', script: {}, read: () => ({ ok: true, text: HIDDEN }), reason: 'probe_cause_unrecognized' },
    {
      label: 'the create destination appears',
      script: onLookup('create', (params) => {
        fs.mkdirSync(path.dirname(params.arguments.path), { recursive: true });
        fs.writeFileSync(params.arguments.path, params.arguments.file_text);
        throw lookupError(params.name);
      }),
      reason: 'unexpected_native_effect',
    },
    {
      label: 'a lookup that starts executing',
      script: onLookup('view', (params, session) => {
        session.emit({ type: 'tool.execution_start', data: { toolCallId: params.toolCallId, toolName: params.name } });
        throw lookupError(params.name);
      }),
      reason: 'unexpected_native_effect',
      detail: 'tool.execution_start',
    },
    {
      label: 'a permission request during a lookup',
      script: onLookup('powershell', async (params, session) => {
        await session.config.onPermissionRequest({ kind: 'shell', fullCommandText: 'exit 0' }, { sessionId: session.sessionId });
        throw lookupError(params.name);
      }),
      reason: 'unexpected_native_effect',
      detail: 'permission_request',
    },
    {
      label: 'no installed shell descriptor',
      script: { rpc: { 'tools.getBuiltinDescriptors': () => ({ tools: structuredClone(DESCRIPTORS).filter((entry) => entry.name !== 'powershell') }) } },
      reason: 'preflight_unsupported',
    },
    {
      label: 'a descriptor requiring another argument',
      script: {
        rpc: {
          'tools.getBuiltinDescriptors': () => {
            const tools = structuredClone(DESCRIPTORS);
            /** @type {any} */ (tools[1].inputSchema).required.push('mode');
            return { tools };
          },
        },
      },
      reason: 'preflight_unsupported',
    },
    { label: 'a session without built-in descriptors', script: { omit: ['tools.getBuiltinDescriptors'] }, reason: 'preflight_unsupported' },
  ];
  for (const { label, script, reason, detail, read } of cases) {
    await context.test(label, async () => {
      const fixture = qualificationFixture();
      const fake = fakeSdk(script);
      const { request, checkpoints } = workerRequest({ read: read ?? listedOnly });
      request.qualification = fixture.qualification;
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', reason, 'not_sent'], label);
      // Only an unexpected native effect the worker saw happen names a trigger; a readiness finding such as a written canary does not.
      assert.equal(result.detail, detail ?? null, label);
      assert.equal(fake.log.includes('send'), false, label);
      assert.deepEqual(checkpoints, [], `${label}: no readiness is recorded`);
      assertNoSecrets(result, label);
      await worker.closed;
    });
  }
});

test('only the one closed name-lookup rejection counts: a generic, argument, transport, other-code, or result answer given alike by every control and probe refuses before any prompt, with every companion valid', async (context) => {
  /** @type {Array<[string, (name: string) => unknown, string | null]>} */
  const cases = [
    ['the recognized rejection, a positive control', (name) => { throw lookupError(name); }, null],
    ['a generic dispatch failure', (name) => { throw Object.assign(new Error(`Dispatch failed for ${name}`), { code: -32603 }); }, 'probe_cause_unrecognized'],
    ['an argument failure under the same invalid-params code', (name) => {
      throw Object.assign(new Error(`Invalid arguments for tool '${name}'.`), { code: -32602 });
    }, 'probe_cause_unrecognized'],
    ['a transport failure naming the tool', (name) => {
      throw Object.assign(new Error(`Connection closed while calling ${name}.`), { code: -32097 });
    }, 'probe_cause_unrecognized'],
    ['the recognized text under another code', (name) => { throw Object.assign(lookupError(name), { code: -32000 }); }, 'probe_cause_unrecognized'],
    ['the recognized text without a code', (name) => { throw new Error(`Tool '${name}' is not available in this session.`); }, 'probe_cause_unrecognized'],
    ['the recognized text as a rejected result', (name) => ({
      resultType: 'rejected', textResultForLlm: `Tool '${name}' is not available in this session.`,
    }), 'probe_cause_unrecognized'],
  ];
  for (const [label, answer, reason] of cases) {
    await context.test(label, async () => {
      /** @type {string[]} */
      const looked = [];
      // Every name the session does not offer gets the same answer; the two offered tools still reach this worker's handlers.
      const fake = fakeSdk({
        rpc: {
          'tools.execute': (params, session, fallback) => {
            if (Object.values(WORKER_TOOLS).includes(params.name)) return fallback(params);
            looked.push(params.name);
            return answer(params.name);
          },
        },
      });
      const fixture = qualificationFixture();
      const { request, checkpoints, provided } = workerRequest({ read: listedOnly, log: fake.log });
      request.qualification = fixture.qualification;
      const { worker } = start(request, fake.sdk);
      const startup = /** @type {any} */ (await worker.startup);
      // The companions stay valid: the descriptors fit, every lookup is asked, and both live custom controls reach this worker.
      assert.ok(fake.log.includes('tools.getBuiltinDescriptors'), label);
      assert.deepEqual(looked, ['dude_a2a_unknown_control_before', 'view', 'create', 'powershell', 'dude-canary-probe', 'dude_a2a_unknown_control_after'], label);
      assert.deepEqual(fake.log.filter((entry) => entry.startsWith('tools.execute ')),
        [WORKER_TOOLS.inventory, WORKER_TOOLS.read, WORKER_TOOLS.inventory].map((name) => `tools.execute ${name}`), label);
      assert.deepEqual(provided.map((entry) => [entry.tool, entry.call.toolCallId]), [['read', 'dude-a2a-preflight-read']], label);
      if (reason === null) {
        assert.equal(startup.ok, true, JSON.stringify(startup));
        assert.deepEqual(startup.observation.probes.map((/** @type {any} */ probe) => probe.cause), [
          'invalid_arguments', 'unknown_tool_lookup', 'not_listed', 'unoffered_tool_lookup', 'unoffered_tool_lookup', 'unoffered_tool_lookup',
          'unoffered_tool_lookup', 'unknown_tool_lookup', 'invalid_arguments',
        ], label);
        assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight'], label);
        assert.equal(worker.cancel(), true, 'the control only needs readiness, so its wait for the startup release is cancelled');
      } else {
        // Asserted before awaiting the result: a worker that wrongly counted as ready would wait for its startup release.
        assert.deepEqual({ ...startup }, { ok: false, outcome: 'refused', reason }, label);
        const result = await worker.result;
        assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', reason, 'not_sent', null], label);
        assert.deepEqual(checkpoints, [], `${label}: no readiness is recorded`);
      }
      assert.equal(fake.log.includes('send'), false, `${label}: no first prompt`);
      await worker.closed;
    });
  }
});

test('the startup release must be the exact closed record: anything else at its path refuses, and the deadline or a cancel ends the wait with nothing sent', async (context) => {
  /** @type {Array<[string, (release: any) => string | null]>} */
  const cases = [
    ['another session', (release) => JSON.stringify({ ...release, sessionId: 'other-session' })],
    ['another observation digest', (release) => JSON.stringify({ ...release, observationSha256: '0'.repeat(64) })],
    ['the evidence discriminator', (release) => JSON.stringify({ ...release, release: 'evidence' })],
    ['an extra key', (release) => JSON.stringify({ ...release, approved: true })],
    ['malformed JSON', () => '{"version":1,'],
    ['over 1 KiB', (release) => `${JSON.stringify(release)}${' '.repeat(WORKER_BOUNDS.releaseBytes)}`],
    ['a folder', () => null],
  ];
  for (const [label, write] of cases) {
    await context.test(label, async () => {
      const { fixture, fake, worker, timers, checkpoints } = startQualified();
      const startup = await worker.startup;
      const text = write(startupRelease(fixture, worker, startup));
      const target = `${worker.workerId}.startup-release.json`;
      if (text === null) fs.mkdirSync(path.join(fixture.root, target));
      else writeRelease(fixture.root, target, text);
      timers.fire(100);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'qualification_release_mismatch', 'not_sent'], label);
      assert.equal(fake.log.includes('send'), false, label);
      assert.deepEqual(checkpoints.map((entry) => entry.kind), ['worker_preflight'], label);
      await worker.closed;
      assert.deepEqual(timers.pending(), [], label);
    });
  }

  await context.test('the deadline ends the wait', async () => {
    const { fake, worker, timers } = startQualified();
    await worker.startup;
    timers.fire(60_000);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['timed_out', 'deadline', 'not_sent']);
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
    assert.deepEqual(timers.pending(), []);
  });

  await context.test('a cancel ends the wait', async () => {
    const { fixture, fake, worker, timers } = startQualified();
    const startup = await worker.startup;
    assert.equal(worker.cancel(), true);
    writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
    await flush();
    assert.deepEqual([(await worker.result).outcome, fake.log.includes('send')], ['cancelled', false]);
    await worker.closed;
    assert.deepEqual(timers.pending(), []);
  });
});

test('an exact startup release read at or past the worker deadline, while its timer is still pending, is never recorded as readiness and sends nothing', async (context) => {
  /** @type {Array<[string, number, boolean]>} */
  const cases = [
    ['read at 59,999 ms, a positive control', 59_999, true],
    ['read at exactly 60,000 ms', 60_000, false],
  ];
  for (const [label, at, ready] of cases) {
    await context.test(label, async () => {
      const origin = 1_000_000;
      let clock = origin;
      const fixture = qualificationFixture();
      const fake = fakeSdk();
      const handlers = workerRequest({ read: listedOnly, log: fake.log, checkpoint: operationCurrent(() => clock, origin) });
      handlers.request.qualification = fixture.qualification;
      const { worker, timers } = start(handlers.request, fake.sdk, { now: () => clock });
      const startup = /** @type {any} */ (await worker.startup);
      assert.equal(startup.ok, true, label);
      writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
      clock = origin + at;
      assert.deepEqual(timers.pending().sort((a, b) => a - b), [100, 60_000], `${label}: the deadline timer has not fired`);
      timers.fire(100);
      const result = await worker.result;
      if (ready) {
        assert.equal(result.outcome, 'answered', label);
        assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted'], label);
      } else {
        assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['timed_out', 'deadline', 'not_sent', null], label);
        await flush();
        assert.equal(fake.log.includes('send'), false, `${label}: no first prompt`);
        assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight'], `${label}: no readiness is recorded past the deadline`);
      }
      await worker.closed;
      assert.deepEqual(timers.pending(), [], label);
    });
  }
});

test('a qualification run holds its first legitimate evidence call before any read, records worker_evidence_pending, and serves evidence only after the exact evidence release', async (context) => {
  /** Start a qualified worker and release its startup. */
  async function heldWorker() {
    const runGate = deferred();
    const started = startQualified({ run: () => runGate.promise });
    const startup = await started.worker.startup;
    writeRelease(started.fixture.root, `${started.worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(started.fixture, started.worker, startup)));
    started.timers.fire(100);
    const session = await promptSent(started.fake);
    return { ...started, session, runGate };
  }

  await context.test('the exact release serves the held call and a concurrent one', async () => {
    const { fixture, worker, timers, checkpoints, provided, session, runGate } = await heldWorker();
    const evidenceCalls = () => provided.filter((entry) => entry.call.toolCallId.startsWith('call-'));
    const first = session.call(WORKER_TOOLS.inventory, {});
    const second = session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' });
    await until(() => checkpoints.some((entry) => entry.kind === 'worker_evidence_pending'), 'the hold is recorded');
    const pending = checkpoints.find((entry) => entry.kind === 'worker_evidence_pending');
    assert.deepEqual(pending.data, { workerId: worker.workerId, sessionId: SESSION_ID, admissionId: ADMISSION_ID, toolCallId: 'call-1', tool: WORKER_TOOLS.inventory });
    timers.fire(100);
    await flush();
    assert.deepEqual(evidenceCalls(), [], 'no evidence is read while held, for either call');
    assert.equal(checkpoints.filter((entry) => entry.kind === 'worker_evidence_pending').length, 1, 'one hold for the run');
    writeRelease(fixture.root, `${worker.workerId}.evidence-release.json`, JSON.stringify({
      version: 1, release: 'evidence', runId: fixture.runId, workerId: worker.workerId, operationId: BINDING.operationId, permitId: BINDING.permitId,
      sessionId: SESSION_ID, admissionId: ADMISSION_ID, toolCallId: 'call-1', observationSha256: sha256(JSON.stringify(pending.data)),
    }));
    timers.fire(100);
    assert.deepEqual(await first, { resultType: 'success', textResultForLlm: '101-peer-idea.md' });
    assert.deepEqual(await second, { resultType: 'success', textResultForLlm: 'number: 101' });
    assert.deepEqual(evidenceCalls().map((entry) => entry.call.toolCallId), ['call-1', 'call-2']);
    runGate.resolve(reply('Observed 101.'));
    assert.equal((await worker.result).outcome, 'answered');
    await worker.closed;
  });

  await context.test('a release for another call fails the run without evidence', async () => {
    const { fixture, worker, timers, checkpoints, provided, session, runGate } = await heldWorker();
    const held = session.call(WORKER_TOOLS.inventory, {});
    await until(() => checkpoints.some((entry) => entry.kind === 'worker_evidence_pending'), 'the hold is recorded');
    const pending = checkpoints.find((entry) => entry.kind === 'worker_evidence_pending');
    writeRelease(fixture.root, `${worker.workerId}.evidence-release.json`, JSON.stringify({
      version: 1, release: 'evidence', runId: fixture.runId, workerId: worker.workerId, operationId: BINDING.operationId, permitId: BINDING.permitId,
      sessionId: SESSION_ID, admissionId: ADMISSION_ID, toolCallId: 'call-9', observationSha256: sha256(JSON.stringify(pending.data)),
    }));
    timers.fire(100);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason], ['failed', 'qualification_release_mismatch']);
    assert.deepEqual(await held, NOT_RUNNING);
    assert.deepEqual(provided.filter((entry) => entry.call.toolCallId.startsWith('call-')), [], 'nothing was read');
    runGate.resolve(undefined);
    await worker.closed;
  });

  await context.test('a cancel while held reads nothing', async () => {
    const { worker, checkpoints, provided, session, runGate } = await heldWorker();
    const held = session.call(WORKER_TOOLS.read, { reference: 'ideas/101-peer-idea.md' });
    await until(() => checkpoints.some((entry) => entry.kind === 'worker_evidence_pending'), 'the hold is recorded');
    assert.equal(worker.cancel(), true);
    assert.deepEqual(await held, NOT_RUNNING);
    assert.deepEqual(provided.filter((entry) => entry.call.toolCallId.startsWith('call-')), []);
    runGate.resolve(undefined);
    await worker.closed;
  });
});

// ---------------------------------------------------------------------------
// Existing sign-in: the runtime's own saved sign-in, normal storage, and point-in-time account checks. Fake SDK only:
// these establish the worker's API use and refusals, not a native account, entitlement, or isolation.
// ---------------------------------------------------------------------------

/**
 * A valid existing-sign-in request: the owner's home and app data and the base directory are test-owned folders, the
 * expected account is the fixture's login in another letter case, and a temp variable is passed blank, as the provider
 * composes it on Windows.
 * @param {Parameters<typeof workerRequest>[0]} [handlers]
 */
function signInRequest(handlers = {}) {
  const built = workerRequest(handlers);
  const owner = tempDir();
  const locations = {
    home: made(path.join(owner, 'home')),
    appData: made(path.join(owner, 'home', 'AppData', 'Roaming')),
    localAppData: made(path.join(owner, 'home', 'AppData', 'Local')),
    base: made(path.join(owner, 'home', '.copilot')),
  };
  built.request.runtime = {
    path: RUNTIME_PATH,
    args: [],
    env: {
      SystemRoot: 'C:\\Windows', PATH: ENV_VALUE, HOME: locations.home, USERPROFILE: locations.home, APPDATA: locations.appData,
      LOCALAPPDATA: locations.localAppData, HOMEDRIVE: '', TEMP: '',
    },
    auth: { kind: 'existing-sign-in', baseDirectory: locations.base, expectedAccount: { ...EXPECTED_ACCOUNT } },
  };
  return { ...built, locations };
}

/** The signed-in status without one field. @param {string} key */
function signedInWithout(key) {
  /** @type {Record<string, unknown>} */
  const status = { ...SIGNED_IN };
  delete status[key];
  return status;
}

/**
 * A fake SDK whose client and session also answer their account status, as an existing-sign-in worker needs.
 * @param {Script} [script]
 */
function signInSdk(script = {}) {
  return fakeSdk({ ...script, account: true });
}

/** The session settings both branches share, apart from the working and configuration folders. */
const SHARED_SESSION_SETTINGS = Object.freeze({
  model: 'fixture-model-id',
  additionalDirectories: [],
  enableConfigDiscovery: false,
  skipCustomInstructions: true,
  enableOnDemandInstructionDiscovery: false,
  enableFileHooks: false,
  enableSkills: false,
  memory: { enabled: false },
  enableSessionStore: false,
  enableHostGitOperations: false,
  requestExtensions: false,
  requestCanvasRenderer: false,
  mcpServers: {},
  availableTools: ['custom:dude_a2a_evidence_inventory', 'custom:dude_a2a_evidence_read'],
  excludedTools: ['builtin:*', 'mcp:*'],
});

test('an existing-sign-in worker starts in copilot-cli mode with the logged-in user, the approved real base directory, owned work and temp folders, and no token, beside the unchanged token constructor', async () => {
  const fake = signInSdk();
  const { request, locations } = signInRequest();
  const { worker, parent } = start(request, fake.sdk);
  const result = await worker.result;
  assert.equal(result.outcome, 'answered', JSON.stringify(result));
  const [client] = fake.clients;
  const { options } = client;
  assert.deepEqual(Object.keys(options).sort(), ['baseDirectory', 'connection', 'mode', 'useLoggedInUser', 'workingDirectory'],
    'no token, no logging switch, and no client-level environment: the connection environment replaces inheritance');
  assert.deepEqual([options.mode, options.useLoggedInUser, options.baseDirectory], ['copilot-cli', true, locations.base]);
  const root = path.dirname(options.workingDirectory);
  assert.equal(path.dirname(root), parent);
  assert.match(path.basename(root), /^dude-a2a-w-/);
  assert.equal(options.workingDirectory, path.join(root, 'work'));
  assert.deepEqual(client.folders, { temp: [], work: [] }, 'only the owned work and temp folders exist, empty, before construction');
  const temp = path.join(root, 'temp');
  assert.deepEqual(fake.connections[0].options, {
    path: RUNTIME_PATH,
    args: [],
    env: {
      SystemRoot: 'C:\\Windows', PATH: ENV_VALUE, HOME: locations.home, USERPROFILE: locations.home, APPDATA: locations.appData,
      LOCALAPPDATA: locations.localAppData, HOMEDRIVE: '', TEMP: temp, TMP: temp, TMPDIR: temp,
    },
  }, 'the owner home and app data are kept for the saved sign-in; only the temp variables name the worker folder');
  const { tools, onPermissionRequest, onEvent, ...settings } = client.sessionConfig;
  assert.deepEqual(settings, { ...SHARED_SESSION_SETTINGS, workingDirectory: options.workingDirectory },
    'the same disabled features and two tools, and no owned configuration folder: the runtime keeps its normal storage');
  assert.deepEqual(tools.map((/** @type {any} */ tool) => tool.name), [WORKER_TOOLS.inventory, WORKER_TOOLS.read]);
  assert.deepEqual([typeof onPermissionRequest, typeof onEvent], ['function', 'function']);
  assertNoSecrets(result, 'the result');
  const closed = await worker.closed;
  assert.deepEqual([closed.runtime, closed.stop, closed.storage, closed.retainedPath], ['unconfirmed', 'clean', 'retained', root]);
  for (const kept of Object.values(locations)) assert.ok(fs.existsSync(kept), `${kept} is never removed`);

  // The token branch, beside it, is unchanged, and needs no account API: its fake has neither, as before this branch.
  const tokenFake = fakeSdk();
  const token = start(workerRequest().request, tokenFake.sdk);
  assert.equal((await token.worker.result).outcome, 'answered');
  assert.deepEqual([typeof tokenFake.clients[0].getAuthStatus, typeof tokenFake.sessions[0].rpc.gitHubAuth], ['undefined', 'undefined'],
    'the token worker answered without any account API');
  assert.deepEqual(Object.keys(tokenFake.clients[0].options).sort(),
    ['baseDirectory', 'connection', 'gitHubToken', 'logLevel', 'mode', 'useLoggedInUser', 'workingDirectory']);
  assert.deepEqual([tokenFake.clients[0].options.mode, tokenFake.clients[0].options.useLoggedInUser, tokenFake.clients[0].options.gitHubToken],
    ['empty', false, TOKEN]);
  await token.worker.closed;
});

test('existing-sign-in readiness observes normal storage, status, both accounts, the model, and the catalog, records worker_preflight version 2 without ambient counts or probes, then rechecks storage and accounts after the latch and accounts before the answer', async () => {
  const fake = signInSdk();
  const handlers = signInRequest({ log: fake.log });
  const { worker } = start(handlers.request, fake.sdk);
  const startup = /** @type {any} */ (await worker.startup);
  const result = await worker.result;
  const closed = await worker.closed;
  assert.equal(result.outcome, 'answered', JSON.stringify(result));
  assert.deepEqual(fake.log, [
    'forStdio', 'construct', 'createSession', 'metadata.snapshot', 'workspacePath', 'getStatus', 'getAuthStatus', 'gitHubAuth.getStatus',
    'model.getCurrent', 'tools.initializeAndValidate', 'tools.getCurrentMetadata', 'metadata.snapshot', 'workspacePath', 'checkpoint worker_preflight',
    'metadata.snapshot', 'workspacePath', 'getAuthStatus', 'gitHubAuth.getStatus', 'checkpoint worker_ready', 'workspacePath', 'send',
    'checkpoint worker_request_admitted', 'getAuthStatus', 'gitHubAuth.getStatus', 'stop',
  ], 'the client account precedes the session account each time; no ambient query or probe runs; the answer waits for its account check');
  assert.deepEqual(handlers.provided, []);
  const root = String(closed.retainedPath);
  assert.equal(startup.ok, true);
  const { observation } = startup;
  const text = JSON.stringify(observation);
  assert.equal(startup.sha256, sha256(text));
  assert.ok(Buffer.byteLength(text) <= WORKER_BOUNDS.startupBytes, `${Buffer.byteLength(text)} bytes`);
  const schemas = fake.clients[0].sessionConfig.tools.map((/** @type {any} */ tool) => ({ name: tool.name, schemaSha256: sha256(canonical(tool.parameters)) }));
  assert.deepEqual(observation, {
    version: 2,
    workerId: worker.workerId,
    binding: { ...BINDING },
    sessionId: SESSION_ID,
    qualification: null,
    loaders: { joined: { ...JOINED }, worker: { source: 'test_adapter' } },
    extensionPid: 4242,
    runtime: { ...STATUS },
    model: 'fixture-model-id',
    storage: root,
    auth: { runtime: { ...KEPT_ACCOUNT }, session: { ...KEPT_ACCOUNT } },
    sessionStorage: {
      kind: 'normal', metadataSessionId: SESSION_ID, workingDirectory: path.join(root, 'work'),
      workspacePath: path.join(handlers.locations.base, 'session-state', 'fixture-workspace'),
    },
    catalog: schemas,
    startedAt: observation.startedAt,
    completedAt: observation.completedAt,
  }, 'the observed login and host are kept, not the expected ones; no ambient counts or probes are fabricated');
  assertNoSecrets(observation, 'the readiness observation');
  assert.equal(text.includes('copilotPlan') || text.includes('statusMessage'), false, 'no status text or plan is kept');
  const [, ready, admitted] = handlers.checkpoints;
  assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted']);
  assert.equal(handlers.checkpoints[0].data, observation);
  assert.deepEqual(ready.data, { workerId: worker.workerId, sessionId: SESSION_ID, observationSha256: startup.sha256, startupRelease: null });
  assert.deepEqual(admitted.data, { workerId: worker.workerId, sessionId: SESSION_ID, admissionId: ADMISSION_ID });
  assert.deepEqual({ ...result.answer }, { admissionId: ADMISSION_ID, text: 'Observed 101.', bytes: 13, sha256: sha256('Observed 101.') });
  assertNoSecrets(result, 'the result');
});

test('existing-sign-in accounts refuse before any prompt, readiness record, or evidence when either observation is missing, malformed, throwing, unauthenticated, or another account; a saved GitHub CLI sign-in passes', async (context) => {
  const thrown = () => { throw Object.assign(new Error(`sign-in failed for ${TOKEN}`), { code: 401 }); };
  /** @param {unknown} status */
  const session = (status) => ({ rpc: { 'gitHubAuth.getStatus': () => status } });
  /** @param {unknown} status */
  const client = (status) => ({ authStatus: async () => status });
  /** @type {Array<{label: string, script: Script, reason: string}>} */
  const cases = [
    { label: 'the client status throws', script: { authStatus: thrown }, reason: 'auth_unavailable' },
    { label: 'the session status rejects', script: { rpc: { 'gitHubAuth.getStatus': thrown } }, reason: 'auth_unavailable' },
    { label: 'the client status is not an object', script: client(null), reason: 'auth_unavailable' },
    { label: 'the session status has no boolean state', script: session({ ...SIGNED_IN, isAuthenticated: 'true' }), reason: 'auth_unavailable' },
    { label: 'the client status omits its kind', script: client(signedInWithout('authType')), reason: 'auth_unavailable' },
    { label: 'the session status omits its host', script: session(signedInWithout('host')), reason: 'auth_unavailable' },
    { label: 'the client status omits its login', script: client(signedInWithout('login')), reason: 'auth_unavailable' },
    { label: 'the session host is not a URL', script: session({ ...SIGNED_IN, host: 'github.com' }), reason: 'auth_unavailable' },
    { label: 'the client is signed out', script: client({ isAuthenticated: false, statusMessage: HIDDEN }), reason: 'auth_required' },
    { label: 'the session is signed out', script: session({ ...SIGNED_IN, isAuthenticated: false }), reason: 'auth_required' },
    { label: 'the client account comes from the environment', script: client({ ...SIGNED_IN, authType: 'env' }), reason: 'auth_mismatch' },
    { label: 'the session account is an explicit token', script: session({ ...SIGNED_IN, authType: 'token' }), reason: 'auth_mismatch' },
    { label: 'the client is another host', script: client({ ...SIGNED_IN, host: 'https://example.ghe.com' }), reason: 'auth_mismatch' },
    { label: 'the session host is not HTTPS', script: session({ ...SIGNED_IN, host: 'http://github.com' }), reason: 'auth_mismatch' },
    { label: 'the client is another login', script: client({ ...SIGNED_IN, login: 'someone-else' }), reason: 'auth_mismatch' },
    { label: 'the session has no account API', script: { omit: ['gitHubAuth.getStatus'] }, reason: 'preflight_unsupported' },
  ];
  for (const { label, script, reason } of cases) {
    await context.test(label, async () => {
      const fake = signInSdk(script);
      const { request, provided, checkpoints } = signInRequest({ log: fake.log });
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', reason, 'not_sent', null], label);
      assert.deepEqual({ ...(await worker.startup) }, { ok: false, outcome: 'refused', reason }, label);
      assert.equal(fake.log.includes('send'), false, `${label}: no prompt`);
      assert.deepEqual([provided, checkpoints], [[], []], `${label}: no evidence and no readiness record`);
      assertNoSecrets(result, label);
      const closed = await worker.closed;
      assert.deepEqual([closed.runtime, closed.storage], ['unconfirmed', 'retained'], label);
    });
  }

  await context.test('a client without the account API is refused before any session exists', async () => {
    const fake = signInSdk({ construct: (built) => { built.getAuthStatus = undefined; } });
    const { request, checkpoints } = signInRequest({ log: fake.log });
    const { worker } = start(request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', 'sdk_unsupported', 'not_sent']);
    assert.deepEqual([fake.log.includes('createSession'), checkpoints.length], [false, 0]);
    const closed = await worker.closed;
    assert.deepEqual([closed.runtime, closed.storage], ['not_started', 'deleted']);
  });

  await context.test('a saved GitHub CLI sign-in with a trailing slash and another letter case passes, and only its canonical host is kept', async () => {
    const fake = signInSdk(client({ ...SIGNED_IN, authType: 'gh-cli', host: 'https://GitHub.com/', login: 'FIXTURE-OWNER' }));
    const { request } = signInRequest();
    const { worker } = start(request, fake.sdk);
    const startup = /** @type {any} */ (await worker.startup);
    assert.equal((await worker.result).outcome, 'answered');
    assert.deepEqual(startup.observation.auth.runtime, { isAuthenticated: true, authType: 'gh-cli', host: 'https://github.com', login: 'FIXTURE-OWNER' });
    assert.deepEqual(startup.observation.auth.session, { ...KEPT_ACCOUNT });
    await worker.closed;
  });
});

test('existing-sign-in accounts are checked again after the latch, before evidence text, and before the answer: a change ends the worker there, within its bounds, and nothing late revives it', async (context) => {
  await context.test('the session signs out once worker_preflight is recorded: refused before worker_ready and the prompt', async () => {
    /** @type {Record<string, unknown>} */
    let status = { ...SIGNED_IN };
    const fake = signInSdk({ rpc: { 'gitHubAuth.getStatus': () => status } });
    const handlers = signInRequest({
      log: fake.log,
      checkpoint: (entry) => {
        if (entry.kind === 'worker_preflight') status = { ...SIGNED_IN, isAuthenticated: false };
        return { ok: true };
      },
    });
    const { worker } = start(handlers.request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['refused', 'auth_required', 'not_sent', null]);
    assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight']);
    assert.equal(fake.log.includes('send'), false);
    await worker.closed;
  });

  for (const tool of /** @type {const} */ (['inventory', 'read'])) {
    await context.test(`the client account changes as the model makes ${tool === 'inventory' ? 'an inventory' : 'a read'} call: that call's own check ends the worker before its provider is asked, and the model sees no evidence text`, async () => {
      /** @type {Record<string, unknown>} */
      let status = { ...SIGNED_IN };
      /** @type {any} */
      let toolResult = null;
      const fake = signInSdk({
        authStatus: async () => status,
        run: async (session) => {
          // The prompt was sent after the latch's check, so the call's own check is the next to read the account.
          status = { ...SIGNED_IN, login: 'someone-else' };
          toolResult = await session.call(WORKER_TOOLS[tool], tool === 'read' ? { reference: 'ideas/101-peer-idea.md' } : {});
          return reply('Observed 101.');
        },
      });
      const handlers = signInRequest();
      const { worker } = start(handlers.request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery, result.answer], ['failed', 'auth_mismatch', 'possibly_sent', null]);
      await until(() => toolResult, 'the evidence call returned');
      assert.deepEqual(toolResult, NOT_RUNNING, 'the model never saw evidence text');
      assert.deepEqual(result.observations, [], 'nothing is recorded as returned');
      assert.deepEqual(handlers.provided, [], 'the provider was never asked, so no evidence text was prepared');
      assert.deepEqual(['getAuthStatus', 'gitHubAuth.getStatus'].map((name) => fake.log.filter((entry) => entry === name).length), [3, 2],
        'the client\'s third read, the call\'s own check after readiness and the latch, found the change; the session was not read again');
      await worker.closed;
    });
  }

  await context.test('the session signs out before the answer counts: no answer', async () => {
    /** @type {Record<string, unknown>} */
    let status = { ...SIGNED_IN };
    const fake = signInSdk({ rpc: { 'gitHubAuth.getStatus': () => status } });
    const handlers = signInRequest({
      checkpoint: (entry) => {
        if (entry.kind === 'worker_request_admitted') status = { isAuthenticated: false };
        return { ok: true };
      },
    });
    const { worker } = start(handlers.request, fake.sdk);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer], ['failed', 'auth_required', null]);
    assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted']);
    await worker.closed;
  });

  await context.test('a cancel while the answer\'s account check waits ends the worker, and the late matching status revives nothing', async () => {
    const held = deferred();
    let calls = 0;
    const fake = signInSdk({ authStatus: () => (++calls === 3 ? held.promise : Promise.resolve({ ...SIGNED_IN })) });
    const handlers = signInRequest({ log: fake.log });
    const { worker } = start(handlers.request, fake.sdk);
    await until(() => calls === 3, 'the answer\'s account check waits');
    assert.equal(worker.cancel(), true);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer], ['cancelled', 'cancelled', null]);
    held.resolve({ ...SIGNED_IN });
    await flush();
    assert.equal(await worker.result, result, 'a late matching status revives nothing');
    assert.equal(fake.log.filter((entry) => entry === 'gitHubAuth.getStatus').length, 2, 'the session account was never read for the answer');
    await worker.closed;
  });

  await context.test('the deadline passing while the answer\'s account check waits is a timeout, though its timer has not run', async () => {
    const origin = 1_000_000;
    let clock = origin;
    const held = deferred();
    let calls = 0;
    const fake = signInSdk({ authStatus: () => (++calls === 3 ? held.promise : Promise.resolve({ ...SIGNED_IN })) });
    const handlers = signInRequest();
    const { worker, timers } = start(handlers.request, fake.sdk, { now: () => clock });
    await until(() => calls === 3, 'the answer\'s account check waits');
    clock = origin + handlers.request.timeoutMs;
    held.resolve({ ...SIGNED_IN });
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.answer], ['timed_out', 'deadline', null]);
    assert.deepEqual(timers.pending(), [], 'the settled result cancelled the deadline timer');
    await worker.closed;
  });

  await context.test('a client status that never answers during readiness ends at the 10-second startup bound', async () => {
    const fake = signInSdk({ authStatus: () => new Promise(() => {}) });
    const handlers = signInRequest({ log: fake.log });
    const { worker, timers } = start(handlers.request, fake.sdk);
    await until(() => fake.log.includes('getAuthStatus'), 'the client status is pending');
    timers.fire(WORKER_LIMITS.startupMs);
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery], ['timed_out', 'startup_deadline', 'not_sent']);
    assert.deepEqual(handlers.checkpoints, []);
    assert.equal(fake.log.includes('gitHubAuth.getStatus'), false);
    await worker.closed;
  });
});

test('existing-sign-in normal storage: the snapshot and getter must agree on this session, the owned work folder, and a bounded absolute workspace path or none, at both readiness observations, after the latch, and before the prompt', async (context) => {
  /** @param {(session: any) => void} change */
  const betweenNormalObservations = (change) => ({
    rpc: {
      'tools.getCurrentMetadata': (/** @type {any} */ params, /** @type {any} */ session, /** @type {any} */ fallback) => {
        change(session);
        return fallback(params);
      },
    },
  });
  /** @type {Array<{label: string, script: Script, at?: string, change?: (fake: any) => void, reason: string, recorded: string[]}>} */
  const cases = [
    { label: 'the getter reports another path than the snapshot', script: { workspacePath: () => path.join(tempDir(), 'other') }, reason: 'preflight_unsupported', recorded: [] },
    { label: 'the snapshot names another working directory', script: snapshotWith((snapshot) => { snapshot.workingDirectory = tempDir(); }), reason: 'preflight_unsupported', recorded: [] },
    { label: 'the snapshot names another session', script: snapshotWith((snapshot) => { snapshot.sessionId = 'another-session'; }), reason: 'preflight_unsupported', recorded: [] },
    { label: 'a relative workspace path', script: { storage: () => 'relative-workspace' }, reason: 'storage_unavailable', recorded: [] },
    { label: 'a workspace path over 1,024 UTF-8 bytes', script: { storage: () => pathOfBytes(tempDir(), 1_025) }, reason: 'storage_unavailable', recorded: [] },
    {
      label: 'the workspace path changes between the readiness observations',
      script: betweenNormalObservations((session) => { session.workspace = path.join(path.dirname(session.workspace), 'moved'); }),
      reason: 'storage_unavailable', recorded: [],
    },
    {
      label: 'the workspace path changes once worker_preflight is recorded',
      script: {}, at: 'worker_preflight', change: (fake) => { fake.sessions[0].workspace = path.join(tempDir(), 'moved'); },
      reason: 'storage_unavailable', recorded: ['worker_preflight'],
    },
    {
      label: 'the getter changes while worker_ready records',
      script: {}, at: 'worker_ready', change: (fake) => { fake.sessions[0].workspace = null; },
      reason: 'storage_unavailable', recorded: ['worker_preflight', 'worker_ready'],
    },
  ];
  for (const { label, script, at, change, reason, recorded } of cases) {
    await context.test(label, async () => {
      const fake = signInSdk(script);
      const handlers = signInRequest({
        log: fake.log,
        checkpoint: (entry) => {
          if (entry.kind === at) change?.(fake);
          return { ok: true };
        },
      });
      const { worker } = start(handlers.request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.delivery], ['refused', reason, 'not_sent'], label);
      assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), recorded, label);
      assert.equal(fake.log.includes('send'), false, `${label}: no prompt`);
      await worker.closed;
    });
  }

  await context.test('a snapshot null with an undefined getter is recorded as no workspace, observed only', async () => {
    const fake = signInSdk({ storage: 'none' });
    const { request } = signInRequest();
    const { worker } = start(request, fake.sdk);
    const startup = /** @type {any} */ (await worker.startup);
    assert.equal((await worker.result).outcome, 'answered');
    assert.deepEqual(startup.observation.sessionStorage, {
      kind: 'normal', metadataSessionId: SESSION_ID, workingDirectory: fake.clients[0].options.workingDirectory, workspacePath: null,
    });
    await worker.closed;
  });
});

test('an existing-sign-in session keeps the catalog check and every action refusal, each effect naming its trigger; only instruction-discovery and MCP notices are no longer errors', async (context) => {
  const extraTool = { name: 'view', description: 'built-in', input_schema: { type: 'object', properties: {} } };
  /** @type {Array<{label: string, script: Script, outcome: string, reason: string | null, detail: string | null}>} */
  const cases = [
    {
      label: 'an extra offered tool',
      script: { rpc: { 'tools.getCurrentMetadata': (params, session, fallback) => ({ tools: [.../** @type {any} */ (fallback(params)).tools, extraTool] }) } },
      outcome: 'refused', reason: 'tool_catalog_mismatch', detail: null,
    },
    {
      label: 'a permission request before the prompt',
      script: {
        rpc: {
          'model.getCurrent': (params, session, fallback) => {
            session.emit({ type: 'permission.requested', data: { requestId: 'p-1', permissionRequest: { kind: 'shell' } } });
            return fallback(params);
          },
        },
      },
      outcome: 'refused', reason: 'unexpected_native_effect', detail: 'permission.requested',
    },
    {
      label: 'a hook starting during the run',
      script: { run: async (session) => { session.emit({ type: 'hook.start', data: { hookType: 'preToolUse', input: HIDDEN } }); return reply('Observed 101.'); } },
      outcome: 'failed', reason: 'unexpected_native_effect', detail: 'hook.start',
    },
    {
      label: 'a skill invoked during the run',
      script: { run: async (session) => { session.emit({ type: 'skill.invoked', data: { name: 'canary', path: 'SKILL.md', content: HIDDEN } }); return reply('Observed 101.'); } },
      outcome: 'failed', reason: 'unexpected_native_effect', detail: 'skill.invoked',
    },
    {
      label: 'a subagent starting during the run',
      script: { run: async (session) => { session.emit({ type: 'subagent.started', data: {} }); return reply('Observed 101.'); } },
      outcome: 'failed', reason: 'unexpected_native_effect', detail: 'subagent.started',
    },
    {
      label: 'an instruction file discovered during the run',
      script: { run: async (session) => { session.emit(DISCOVERED); return reply('Observed 101.'); } },
      outcome: 'answered', reason: null, detail: null,
    },
  ];
  for (const { label, script, outcome, reason, detail } of cases) {
    await context.test(label, async () => {
      const fake = signInSdk(script);
      const { request } = signInRequest();
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.detail], [outcome, reason, detail], label);
      assertNoSecrets(result, label);
      await worker.closed;
    });
  }
});

test('an existing-sign-in worker takes the normal runtime\'s MCP server notices as normal: loaded and status notices at creation, during readiness, before the prompt, and during the run leave the answer standing, and the model still sees only the two evidence tools', async (context) => {
  /** @param {any} session */
  const notices = (session) => {
    session.emit(MCP_STATUS);
    session.emit(MCP_LOADED);
  };
  /** @type {Array<{label: string, script?: Script, at?: string}>} */
  const cases = [
    {
      label: 'at session creation',
      script: {
        createSession: (config, makeSession) => {
          config.onEvent(MCP_STATUS);
          config.onEvent(MCP_LOADED);
          return Promise.resolve(makeSession(config));
        },
      },
    },
    { label: 'while readiness initializes the tool catalog', script: { rpc: { 'tools.initializeAndValidate': (params, session, fallback) => { notices(session); return fallback(params); } } } },
    { label: 'between readiness and the prompt', at: 'worker_ready' },
    { label: 'right after the prompt is admitted', at: 'worker_request_admitted' },
    { label: 'during the run, before the final reply', script: { run: async (session) => { notices(session); return reply('Observed 101.'); } } },
    {
      label: 'a load with no server list, during the run',
      script: { run: async (session) => { session.emit({ type: 'session.mcp_servers_loaded', data: {} }); return reply('Observed 101.'); } },
    },
  ];
  for (const { label, script = {}, at } of cases) {
    await context.test(label, async () => {
      const fake = signInSdk(script);
      const handlers = signInRequest({
        checkpoint: (entry) => {
          if (entry.kind === at) notices(fake.sessions[0]);
          return { ok: true };
        },
      });
      const { worker } = start(handlers.request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason, result.detail, result.answer?.text], ['answered', null, null, 'Observed 101.'], label);
      assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted'], label);
      const config = fake.clients[0].sessionConfig;
      assert.deepEqual([config.mcpServers, config.availableTools, config.excludedTools],
        [{}, ['custom:dude_a2a_evidence_inventory', 'custom:dude_a2a_evidence_read'], ['builtin:*', 'mcp:*']], `${label}: the model's tools are unchanged`);
      assertNoSecrets(result, label);
      await worker.closed;
    });
  }
});

test('in both branches an effect the worker itself sees names a fixed label, never what it carried: an evidence call outside the run, a permission request or model output before the prompt; a failed run or a cancel names none', async (context) => {
  /** @param {(session: any) => unknown} act @returns {Script} */
  const duringReadiness = (act) => ({ rpc: { 'model.getCurrent': async (params, session, fallback) => { await act(session); return fallback(params); } } });
  /** @type {Array<{label: string, script?: Script, at?: string, act?: (session: any) => unknown, detail: string}>} */
  const cases = [
    {
      label: 'an evidence call between readiness and the prompt', at: 'worker_ready',
      act: (session) => { void session.call(WORKER_TOOLS.read, { reference: HIDDEN }, {}, { request: false }); }, detail: 'tool_call',
    },
    {
      label: 'a permission request reaching the handler during readiness',
      script: duringReadiness((session) => session.config.onPermissionRequest({ kind: 'read', path: HIDDEN }, { sessionId: session.sessionId })),
      detail: 'permission_request',
    },
    {
      label: 'a permission request event during readiness',
      script: duringReadiness((session) => { session.emit({ type: 'permission.requested', data: { requestId: 'p-1', permissionRequest: { kind: 'read', path: HIDDEN } } }); }),
      detail: 'permission.requested',
    },
    { label: 'model output during readiness', script: duringReadiness((session) => { session.emit(reply(HIDDEN)); }), detail: 'model_output_before_prompt' },
  ];
  for (const branch of /** @type {const} */ (['token', 'existing sign-in'])) {
    const sdkOf = branch === 'token' ? fakeSdk : signInSdk;
    const requestOf = branch === 'token' ? workerRequest : signInRequest;
    for (const { label, script = {}, at, act, detail } of cases) {
      await context.test(`${branch}: ${label}`, async () => {
        const fake = sdkOf(script);
        const handlers = requestOf({
          checkpoint: (entry) => {
            if (entry.kind === at) act?.(fake.sessions[0]);
            return { ok: true };
          },
        });
        const { worker } = start(handlers.request, fake.sdk);
        const result = await worker.result;
        assert.deepEqual([result.outcome, result.reason, result.detail, result.delivery], ['refused', 'unexpected_native_effect', detail, 'not_sent'], label);
        assert.ok(WORKER_EFFECT_TRIGGERS.includes(/** @type {any} */ (result.detail)), `${label}: from the closed list`);
        assert.equal(fake.log.includes('send'), false, `${label}: no prompt`);
        assert.deepEqual(handlers.provided, [], `${label}: no evidence`);
        assertNoSecrets(result, label);
        await worker.closed;
      });
    }
    await context.test(`${branch}: a failed run and a cancel name no trigger`, async () => {
      const failing = sdkOf({ run: async () => { throw new Error(HIDDEN); } });
      const failed = start(requestOf().request, failing.sdk).worker;
      const result = await failed.result;
      assert.deepEqual([result.outcome, result.reason, result.detail], ['failed', 'run_failed', null]);
      assertNoSecrets(result, 'the failed run');
      await failed.closed;
      const runGate = deferred();
      const holding = sdkOf({ run: () => runGate.promise });
      const cancelled = start(requestOf().request, holding.sdk).worker;
      await promptSent(holding);
      assert.equal(cancelled.cancel(), true);
      const ended = await cancelled.result;
      assert.deepEqual([ended.outcome, ended.reason, ended.detail], ['cancelled', 'cancelled', null]);
      runGate.resolve(reply('Observed 101.'));
      await cancelled.closed;
    });
  }
});

/**
 * A version 2, latch-only qualification fixture in its own test-owned root: a manifest of exactly
 * `{version: 2, runId}`, unless `manifest` writes another, and the binding that names it.
 * @param {{manifest?: (runId: string) => unknown}} [options]
 */
function latchFixture({ manifest } = {}) {
  const root = tempDir();
  const runId = randomUUID();
  const bytes = JSON.stringify(manifest ? manifest(runId) : { version: 2, runId });
  fs.writeFileSync(path.join(root, 'manifest.json'), bytes);
  return { root, runId, qualification: { version: 2, runId, fixtureRoot: root, fixtureSha256: sha256(bytes) } };
}

test('a version 2 qualification is latch-only for an existing-sign-in worker: its exact manifest, no canaries or probes, the startup release before the prompt, and the evidence hold', async (context) => {
  await context.test('the latches gate the prompt and the first evidence call', async () => {
    const fixture = latchFixture();
    const runGate = deferred();
    /** @type {any} */
    let toolResult = null;
    const fake = signInSdk({
      run: async (session) => {
        await runGate.promise;
        toolResult = await session.call(WORKER_TOOLS.inventory, {});
        return reply('Observed 101.');
      },
    });
    const handlers = signInRequest({ log: fake.log });
    handlers.request.qualification = fixture.qualification;
    const { worker, timers } = start(handlers.request, fake.sdk);
    const startup = /** @type {any} */ (await worker.startup);
    assert.equal(startup.ok, true, JSON.stringify(startup));
    assert.deepEqual(startup.observation.qualification, { version: 2, runId: fixture.runId, fixtureSha256: fixture.qualification.fixtureSha256 });
    assert.deepEqual(fake.clients[0].folders, { temp: [], work: [] }, 'nothing was copied into the worker folders');
    assert.equal(fake.log.some((entry) => entry.startsWith('tools.execute')), false, 'no probe runs');
    timers.fire(100);
    await flush();
    assert.equal(fake.log.includes('send'), false, 'no prompt before the startup release');
    writeRelease(fixture.root, `${worker.workerId}.startup-release.json`, JSON.stringify(startupRelease(fixture, worker, startup)));
    timers.fire(100);
    const session = await promptSent(fake);
    assert.equal(session.sessionId, SESSION_ID);
    runGate.resolve(undefined);
    await until(() => handlers.checkpoints.some((entry) => entry.kind === 'worker_evidence_pending'), 'the hold is recorded');
    const pending = handlers.checkpoints.find((entry) => entry.kind === 'worker_evidence_pending');
    assert.deepEqual(handlers.provided, [], 'nothing is read while held');
    writeRelease(fixture.root, `${worker.workerId}.evidence-release.json`, JSON.stringify({
      version: 1, release: 'evidence', runId: fixture.runId, workerId: worker.workerId, operationId: BINDING.operationId, permitId: BINDING.permitId,
      sessionId: SESSION_ID, admissionId: ADMISSION_ID, toolCallId: 'call-1', observationSha256: sha256(JSON.stringify(pending.data)),
    }));
    timers.fire(100);
    const result = await worker.result;
    assert.equal(result.outcome, 'answered', JSON.stringify(result));
    assert.deepEqual(toolResult, { resultType: 'success', textResultForLlm: '101-peer-idea.md' });
    assert.deepEqual(handlers.checkpoints.map((entry) => entry.kind), ['worker_preflight', 'worker_ready', 'worker_request_admitted', 'worker_evidence_pending']);
    assert.deepEqual(fs.readdirSync(fixture.root).sort(), [`${worker.workerId}.evidence-release.json`, `${worker.workerId}.startup-release.json`, 'manifest.json'].sort());
    await worker.closed;
  });

  for (const [label, mutate] of /** @type {Array<[string, (runId: string) => unknown]>} */ ([
    ['a manifest that lists canaries', (runId) => ({ version: 2, runId, canaries: [] })],
    ['a version 1 manifest', (runId) => ({ version: 1, runId })],
    ['a manifest for another run', () => ({ version: 2, runId: randomUUID() })],
  ])) {
    await context.test(`${label} is refused before the client starts`, async () => {
      const fixture = latchFixture({ manifest: mutate });
      const fake = signInSdk();
      const { request } = signInRequest();
      request.qualification = fixture.qualification;
      const { worker } = start(request, fake.sdk);
      const result = await worker.result;
      assert.deepEqual([result.outcome, result.reason], ['refused', 'qualification_fixture_invalid'], label);
      assert.deepEqual(fake.log, [], `${label}: nothing was constructed`);
      await worker.closed;
    });
  }

  await context.test('a manifest whose digest differs is refused before the client starts', async () => {
    const fixture = latchFixture();
    const fake = signInSdk();
    const { request } = signInRequest();
    request.qualification = { ...fixture.qualification, fixtureSha256: '0'.repeat(64) };
    const { worker } = start(request, fake.sdk);
    assert.deepEqual([(await worker.result).outcome, (await worker.result).reason], ['refused', 'qualification_fixture_invalid']);
    assert.deepEqual(fake.log, []);
    await worker.closed;
  });
});

test('an invalid existing-sign-in request is refused before the SDK loads, storage exists, or a deadline starts, and names no value', async () => {
  const parent = tempDir();
  const timers = fakeTimers();
  let loads = 0;
  const loadSdk = async () => {
    loads += 1;
    return signInSdk().sdk;
  };
  /** @type {Array<[string, (request: any) => void]>} */
  const cases = [
    ['both a token and existing sign-in', (request) => { request.runtime.gitHubToken = TOKEN; }],
    ['neither a token nor existing sign-in', (request) => { delete request.runtime.auth; }],
    ['a version 1 qualification', (request) => {
      request.qualification = { version: 1, runId: randomUUID(), fixtureRoot: parent, fixtureSha256: '0'.repeat(64) };
    }],
    ['another sign-in kind', (request) => { request.runtime.auth.kind = 'token'; }],
    ['an extra sign-in key', (request) => { request.runtime.auth.login = true; }],
    ['a relative base directory', (request) => { request.runtime.auth.baseDirectory = 'copilot-home'; }],
    ['a host with a trailing slash', (request) => { request.runtime.auth.expectedAccount.host = 'https://github.com/'; }],
    ['an HTTP host', (request) => { request.runtime.auth.expectedAccount.host = 'http://github.com'; }],
    ['a login with a control character', (request) => { request.runtime.auth.expectedAccount.login = 'fixture\nowner'; }],
    ['a login over 256 bytes', (request) => { request.runtime.auth.expectedAccount.login = 'x'.repeat(257); }],
    ['runtime arguments', (request) => { request.runtime.args = ['--fixture-flag']; }],
    ['a credential variable', (request) => { request.runtime.env.GH_TOKEN = TOKEN; }],
    ['a temp folder of the owner', (request) => { request.runtime.env.TEMP = 'C:\\Users\\owner\\AppData\\Local\\Temp'; }],
    ['runtime file logging, even blank', (request) => { request.runtime.env.COPILOT_RUNTIME_PROCESS_FILE_LOGGING = ''; }],
    ['no USERPROFILE', (request) => { delete request.runtime.env.USERPROFILE; }],
    ['a relative APPDATA', (request) => { request.runtime.env.APPDATA = 'AppData'; }],
    ['one name twice in another letter case', (request) => { request.runtime.env.Path = ENV_VALUE; }],
  ];
  for (const [label, mutate] of cases) {
    const { request } = signInRequest();
    mutate(request);
    const worker = startEvidenceWorker(request, { loadSdk, tempParent: parent, timers });
    const result = await worker.result;
    assert.deepEqual([result.outcome, result.reason, result.delivery, result.binding], ['refused', 'invalid_request', 'not_sent', null], label);
    assert.equal(typeof result.detail, 'string', label);
    assertNoSecrets(result, label);
    assert.deepEqual({ ...(await worker.closed) }, nothingClosed(worker.workerId), label);
  }
  assert.equal(loads, 0, 'the SDK never loads for an invalid request');
  assert.deepEqual(fs.readdirSync(parent), [], 'no storage is created');
  assert.deepEqual(timers.pending(), [], 'no deadline starts');
});
