// @ts-check
/**
 * Offline A2A transport fixtures. Requests cross the real bundled Express and
 * @a2a-js/sdk 1.2.0 JSON-RPC handlers and the real SDK client over in-memory
 * connections: no socket is bound, nothing leaves this process, and TLS is
 * simulated by socket properties. These fixtures therefore do not qualify a
 * real TLS handshake, certificate parsing, or LAN delivery.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

import { createA2a } from './lib/a2a.mjs';
import {
  A2aTransportError,
  checkPeer,
  createServeApp,
  endpointAddressError,
  endpointUrl,
  loadRuntime,
  normalizeAddress,
  prepareClient,
  readAnswer,
  startServer,
} from './lib/a2a-transport.mjs';

let listens = 0;
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = /** @type {typeof originalListen} */ (function countedListen(...args) {
  listens += 1;
  return originalListen.apply(this, args);
});

const runtime = await loadRuntime();
const NOW = Date.parse('2026-09-23T16:00:00Z');
const CURRENT = { valid_from: 'Jan  1 00:00:00 2026 GMT', valid_to: 'Jan  1 00:00:00 2027 GMT' };
const CLIENT_DER = Buffer.from('dude-a2a-test-client-certificate');
const SERVER_DER = Buffer.from('dude-a2a-test-server-certificate');
/** @param {Buffer} bytes */
const pin = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Two cross-wired in-memory stream ends. `written` counts bytes each end sent.
 */
function duplexPair() {
  /** @type {Duplex[]} */
  const sides = [];
  const ended = [false, false];
  const written = [0, 0];
  /** @param {number} index */
  const finish = (index) => {
    if (!ended[index]) {
      ended[index] = true;
      sides[index].push(null);
    }
  };
  for (const index of [0, 1]) {
    sides.push(new Duplex({
      read() {},
      write(chunk, _encoding, callback) {
        written[index] += chunk.length;
        if (!ended[1 - index]) sides[1 - index].push(chunk);
        callback();
      },
      final(callback) {
        finish(1 - index);
        callback();
      },
      destroy(error, callback) {
        finish(1 - index);
        callback(error);
      },
    }));
  }
  return { client: sides[0], server: sides[1], written };
}

/**
 * @param {Duplex} socket
 * @param {{encrypted?: boolean, raw?: Buffer, validity?: {valid_from: string, valid_to: string}, remoteAddress?: string}} tls
 */
function asTls(socket, { encrypted = true, raw = CLIENT_DER, validity = CURRENT, remoteAddress = '127.0.0.1' } = {}) {
  return Object.assign(socket, {
    encrypted,
    remoteAddress,
    getPeerCertificate: () => (raw.length ? { raw, ...validity } : {}),
  });
}

/** @param {Partial<import('./lib/a2a-transport.mjs').ServeOptions>} [overrides] */
function serveFixture(overrides = {}) {
  /** @type {Array<{messageId: string, text: string}>} */
  const questions = [];
  /** @type {string[]} */
  const refusals = [];
  let bindingChecks = 0;
  /** @type {import('./lib/a2a-transport.mjs').ServeOptions} */
  const options = {
    label: 'B (Mac)',
    listen: { address: '127.0.0.1', port: 18443 },
    peer: { label: 'A (Windows)', address: '127.0.0.1', certSha256: pin(CLIENT_DER) },
    tls: { cert: Buffer.from('unused'), key: Buffer.from('unused') },
    contentBytes: 4096,
    commandIds: ['unit-tests', 'lint'],
    checkBinding: () => {
      bindingChecks += 1;
      return true;
    },
    onQuestion: (question) => {
      questions.push(question);
      return { outcome: 'unavailable', reason: 'no_live_receive' };
    },
    onRefused: (reason) => void refusals.push(reason),
    now: () => NOW,
    ...overrides,
  };
  const app = createServeApp(runtime, options);
  return { app, options, questions, refusals, get bindingChecks() { return bindingChecks; } };
}

/**
 * One raw HTTP request to a request listener over an in-memory connection.
 * @param {http.RequestListener} app
 * @param {{method?: string, path?: string, headers?: Record<string, string>, body?: string | Buffer,
 *   chunks?: string[], peer?: Parameters<typeof asTls>[1]}} [request]
 */
function exchange(app, { method = 'POST', path = '/', headers = {}, body, chunks, peer } = {}) {
  const server = http.createServer(app);
  const pair = duplexPair();
  server.emit('connection', asTls(pair.server, peer));
  return new Promise((resolve, reject) => {
    const request = http.request({ createConnection: () => pair.client, host: '127.0.0.1', port: 18443, method, path, headers }, (response) => {
      /** @type {Buffer[]} */
      const received = [];
      response.on('data', (chunk) => received.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(received).toString('utf8');
        /** @type {any} */
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    request.on('error', reject);
    for (const chunk of chunks ?? []) request.write(chunk);
    request.end(body);
  });
}

const A2A_JSON = { 'content-type': 'application/json', 'a2a-version': '1.0' };

/** @param {any} [overrides] */
function questionRequest(overrides = {}) {
  return {
    jsonrpc: '2.0',
    id: 7,
    method: 'SendMessage',
    params: {
      message: {
        messageId: 'question-1',
        role: 'ROLE_USER',
        parts: [{ text: 'Does the recorded log support claim X at revision R?', mediaType: 'text/plain' }],
        metadata: { dudeA2a: { version: 1 } },
      },
      configuration: { acceptedOutputModes: ['application/json'] },
    },
    ...overrides,
  };
}

/** @param {(value: any) => void} mutate */
function mutatedQuestion(mutate) {
  const value = questionRequest();
  mutate(value);
  return JSON.stringify(value);
}

/**
 * An asking-side connection into `server`, with the given server certificate.
 * `hold` is called once per connection; the simulated TLS handshake completes
 * only when its promise resolves, so tests can act while it is pending.
 * @param {http.Server} server
 * @param {{serverRaw?: Buffer, encrypted?: boolean, clientPeer?: Parameters<typeof asTls>[1], connections?: Array<{written: number[]}>,
 *   hold?: () => Promise<unknown>}} [options]
 */
function connectTo(server, { serverRaw = SERVER_DER, encrypted = true, clientPeer, connections = [], hold } = {}) {
  return /** @type {any} */ (() => {
    const pair = duplexPair();
    connections.push(pair);
    server.emit('connection', asTls(pair.server, clientPeer));
    asTls(pair.client, { raw: serverRaw, encrypted });
    const secure = () => pair.client.emit('secureConnect');
    if (hold) hold().then(secure);
    else setImmediate(secure);
    return pair.client;
  });
}

/** @param {Partial<import('./lib/a2a-transport.mjs').AskOptions>} [overrides] */
function askOptions(overrides = {}) {
  return {
    peer: { label: 'B (Mac)', address: '127.0.0.1', port: 18443, certSha256: pin(SERVER_DER) },
    tls: { cert: Buffer.from('client-cert'), key: Buffer.from('client-key') },
    contentBytes: 4096,
    checkBinding: () => true,
    now: () => NOW,
    ...overrides,
  };
}

/** @param {() => unknown} probe @param {string} label */
async function waitFor(probe, label) {
  for (let index = 0; index < 400; index += 1) {
    if (probe()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${label}`);
}

/**
 * Handshakes that stay pending until the test releases them, in connection order.
 * @returns {{hold: () => Promise<unknown>, release: (index: number) => void, readonly pending: number}}
 */
function heldHandshakes() {
  /** @type {Array<() => void>} */
  const releases = [];
  return {
    hold: () => new Promise((resolve) => { releases.push(() => resolve(undefined)); }),
    release: (index) => releases[index](),
    get pending() { return releases.length; },
  };
}

const acceptAnyPem = () => /** @type {any} */ ({});

/** @param {Promise<unknown>} promise */
async function transportFailure(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof A2aTransportError, `expected an A2aTransportError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the transport to refuse');
}

test('endpoints are only canonical loopback or private-LAN IP literals, never wildcards or public addresses', () => {
  for (const accepted of ['127.0.0.1', '127.4.5.6', '10.0.0.8', '172.16.0.1', '172.31.255.254', '192.168.1.20', '::1', 'fd00::1', 'fc12:3456::9']) {
    assert.equal(endpointAddressError(accepted), null, accepted);
  }
  for (const [value, reason] of /** @type {const} */ ([
    ['localhost', 'not_ip_literal'], ['dude-b.local', 'not_ip_literal'], [42, 'not_ip_literal'],
    ['0.0.0.0', 'wildcard'], ['::', 'wildcard'],
    ['8.8.8.8', 'not_private'], ['172.32.0.1', 'not_private'], ['169.254.10.1', 'not_private'],
    ['fe80::1', 'not_private'], ['2001:db8::1', 'not_private'], ['fd::1', 'not_private'], ['224.0.0.1', 'not_private'],
    ['FD00::1', 'not_canonical'], ['::ffff:127.0.0.1', 'not_canonical'],
  ])) {
    assert.equal(endpointAddressError(value), reason, String(value));
  }
  assert.equal(endpointUrl({ address: '192.168.1.10', port: 8443 }), 'https://192.168.1.10:8443/');
  assert.equal(endpointUrl({ address: 'fd00::1', port: 8443 }), 'https://[fd00::1]:8443/');
  assert.equal(normalizeAddress('::ffff:192.168.1.20'), '192.168.1.20');
  assert.equal(normalizeAddress('FD00:0::1'), 'fd00::1');
});

test('the bundled runtime exposes only the pinned direct-message surface and A2A 1.0', () => {
  assert.deepEqual(Object.keys(runtime).sort(), [
    'A2AError', 'A2A_PROTOCOL_VERSION', 'A2A_VERSION_HEADER', 'AGENT_CARD_PATH',
    'ContentTypeNotSupportedError', 'ExtendedAgentCardNotConfiguredError', 'JsonRpcTransportFactory',
    'PushNotificationNotSupportedError', 'RequestMalformedError', 'Role', 'UnsupportedOperationError',
    'VersionNotSupportedError', 'agentCardHandler', 'express', 'jsonRpcHandler', 'toJsonRpcError',
  ]);
  assert.equal(runtime.A2A_PROTOCOL_VERSION, '1.0');
  assert.equal(runtime.A2A_VERSION_HEADER, 'A2A-Version');
  assert.equal(runtime.AGENT_CARD_PATH, '.well-known/agent-card.json');
});

test('peer checks require encryption and the pinned, current certificate from the configured address', () => {
  const peer = { certSha256: pin(CLIENT_DER), address: '192.168.1.20' };
  const socket = (/** @type {any} */ overrides) => ({ encrypted: true, remoteAddress: '::ffff:192.168.1.20', getPeerCertificate: () => ({ raw: CLIENT_DER, ...CURRENT }), ...overrides });
  assert.equal(checkPeer(socket({}), peer, NOW), 'ok');
  assert.equal(checkPeer(socket({ encrypted: false }), peer, NOW), 'encryption_required');
  assert.equal(checkPeer({ remoteAddress: '192.168.1.20' }, peer, NOW), 'encryption_required');
  assert.equal(checkPeer(socket({ getPeerCertificate: () => ({}) }), peer, NOW), 'certificate_required');
  assert.equal(checkPeer(socket({ getPeerCertificate: () => ({ raw: SERVER_DER, ...CURRENT }) }), peer, NOW), 'certificate_mismatch');
  assert.equal(checkPeer(socket({ getPeerCertificate: () => ({ raw: CLIENT_DER, valid_from: CURRENT.valid_from, valid_to: 'Jan  1 00:00:00 2026 GMT' }) }), peer, NOW), 'certificate_not_current');
  assert.equal(checkPeer(socket({ getPeerCertificate: () => ({ raw: CLIENT_DER, valid_from: 'Jan  1 00:00:00 2030 GMT', valid_to: 'Jan  1 00:00:00 2031 GMT' }) }), peer, NOW), 'certificate_not_current');
  assert.equal(checkPeer(socket({ remoteAddress: '192.168.1.99' }), peer, NOW), 'unexpected_address');
  assert.equal(checkPeer(socket({ remoteAddress: '192.168.1.99' }), { certSha256: peer.certSha256 }, NOW), 'ok', 'the asking side checks only the pin');
});

test('the authenticated card lists selected command IDs only and advertises no Task, streaming, or push capability', async () => {
  const fixture = serveFixture();
  const response = /** @type {any} */ (await exchange(fixture.app, { method: 'GET', path: '/.well-known/agent-card.json', headers: {} }));

  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-cache');
  assert.deepEqual(response.json, {
    name: 'Dude B (Mac)',
    description: 'Dude confirmation peer for owner-approved evidence questions. Declared capabilities grant no approval.',
    supportedInterfaces: [{ url: 'https://127.0.0.1:18443/', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    version: '1',
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    securitySchemes: { mtls: { mtlsSecurityScheme: { description: 'Mutual TLS with an owner-pinned certificate.' } } },
    securityRequirements: [{ schemes: { mtls: {} } }],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [
      { id: 'confirmation', name: 'Evidence confirmation', description: 'Answers owner-approved evidence questions while this session is receiving.', tags: ['confirmation'] },
      { id: 'command:unit-tests', name: 'unit-tests', description: 'Owner-selected verification command ID; its definition is not advertised.', tags: ['verification'] },
      { id: 'command:lint', name: 'lint', description: 'Owner-selected verification command ID; its definition is not advertised.', tags: ['verification'] },
    ],
  });
  assert.equal(fixture.questions.length, 0);

  const unpinned = /** @type {any} */ (await exchange(fixture.app, { method: 'GET', path: '/.well-known/agent-card.json', peer: { raw: SERVER_DER } }));
  assert.equal(unpinned.status, 403, 'the card is not served to an unpinned peer');
  assert.deepEqual(unpinned.json, { error: 'certificate_mismatch' });
});

test('missing encryption, a missing, wrong, or stale certificate, and an unexpected address are refused before any handler runs', async () => {
  for (const [peer, reason] of /** @type {const} */ ([
    [{ encrypted: false }, 'encryption_required'],
    [{ raw: Buffer.alloc(0) }, 'certificate_required'],
    [{ raw: SERVER_DER }, 'certificate_mismatch'],
    [{ validity: { valid_from: 'Jan  1 00:00:00 2020 GMT', valid_to: 'Jan  1 00:00:00 2021 GMT' } }, 'certificate_not_current'],
    [{ remoteAddress: '127.0.0.9' }, 'unexpected_address'],
  ])) {
    const fixture = serveFixture();
    const response = /** @type {any} */ (await exchange(fixture.app, { headers: A2A_JSON, body: JSON.stringify(questionRequest()), peer }));
    assert.equal(response.status, 403, reason);
    assert.deepEqual(response.json, { error: reason });
    assert.deepEqual(fixture.refusals, [reason]);
    assert.equal(fixture.questions.length, 0, `${reason} must not reach the question handler`);
    assert.equal(fixture.bindingChecks, 0, `${reason} is refused before activation state is consulted`);
  }
});

test('a binding that no longer holds answers unavailable before the SDK sees the request', async () => {
  const fixture = serveFixture({ checkBinding: () => false });
  const response = /** @type {any} */ (await exchange(fixture.app, { headers: A2A_JSON, body: JSON.stringify(questionRequest()) }));
  assert.equal(response.status, 503);
  assert.deepEqual(response.json, { error: 'activation_ended' });
  assert.equal(fixture.questions.length, 0);
});

test('only A2A 1.0 JSON bodies within contentBytes reach the JSON-RPC handler', async () => {
  const valid = JSON.stringify(questionRequest());
  const cases = /** @type {const} */ ([
    ['missing version header', { headers: { 'content-type': 'application/json' }, body: valid }, 400, -32009, 'unsupported_version'],
    ['v0.3 version header', { headers: { ...A2A_JSON, 'a2a-version': '0.3' }, body: valid }, 400, -32009, 'unsupported_version'],
    ['future version header', { headers: { ...A2A_JSON, 'a2a-version': '2.0' }, body: valid }, 400, -32009, 'unsupported_version'],
    ['non-JSON content type', { headers: { ...A2A_JSON, 'content-type': 'text/plain' }, body: valid }, 415, -32005, 'unsupported_content_type'],
    ['declared oversize', { headers: { ...A2A_JSON, 'content-length': '4097' }, body: 'x'.repeat(4097) }, 413, -32602, 'content_too_large'],
    ['streamed oversize', { headers: A2A_JSON, chunks: ['{"a":"', 'x'.repeat(5000)], body: '"}' }, 413, -32602, 'content_too_large'],
    ['invalid UTF-8', { headers: A2A_JSON, body: Buffer.from([0x7b, 0xff, 0x7d]) }, 400, -32700, 'invalid_json'],
    ['invalid JSON', { headers: A2A_JSON, body: '{"jsonrpc":' }, 400, -32700, 'invalid_json'],
    ['not JSON-RPC 2.0', { headers: A2A_JSON, body: JSON.stringify({ ...questionRequest(), jsonrpc: '1.0' }) }, 400, -32602, 'invalid_json_rpc'],
    ['extra envelope key', { headers: A2A_JSON, body: JSON.stringify({ ...questionRequest(), approve: true }) }, 400, -32602, 'invalid_json_rpc'],
  ]);
  for (const [label, request, status, code, reason] of cases) {
    const fixture = serveFixture();
    const response = /** @type {any} */ (await exchange(fixture.app, request));
    assert.equal(response.status, status, label);
    assert.equal(response.json?.error?.code, code, label);
    assert.equal(response.json?.result, undefined, `${label} is never a success result`);
    assert.deepEqual(fixture.refusals, [reason], label);
    assert.equal(fixture.questions.length, 0, `${label} must not reach the question handler`);
  }
});

test('questions must match the exact Dude envelope, so peer approval payloads and command details never reach the model', async () => {
  const cases = /** @type {Array<[string, (value: any) => void]>} */ ([
    ['agent role', (value) => { value.params.message.role = 'ROLE_AGENT'; }],
    ['two text parts', (value) => { value.params.message.parts.push({ text: 'second' }); }],
    ['file part', (value) => { value.params.message.parts = [{ raw: Buffer.from('x').toString('base64'), mediaType: 'application/octet-stream' }]; }],
    ['data part asking for a raw command', (value) => { value.params.message.parts = [{ data: { executable: '/bin/sh', args: ['-c', 'id'] } }]; }],
    ['text with extra part fields', (value) => { value.params.message.parts[0].metadata = { approve: true }; }],
    ['control characters', (value) => { value.params.message.parts[0].text = 'ok\u0000'; }],
    ['blank text', (value) => { value.params.message.parts[0].text = '   '; }],
    ['approval boolean in metadata', (value) => { value.params.message.metadata = { dudeA2a: { version: 1 }, approve: true }; }],
    ['approval inside the Dude envelope', (value) => { value.params.message.metadata.dudeA2a.approved = true; }],
    ['wrong envelope version', (value) => { value.params.message.metadata.dudeA2a.version = 2; }],
    ['missing envelope', (value) => { delete value.params.message.metadata; }],
    ['task reference', (value) => { value.params.message.taskId = 'task-1'; }],
    ['context reference', (value) => { value.params.message.contextId = 'context-1'; }],
    ['referenced tasks', (value) => { value.params.message.referenceTaskIds = ['task-1']; }],
    ['protocol extension', (value) => { value.params.message.extensions = ['https://example.invalid/ext']; }],
    ['invalid message ID', (value) => { value.params.message.messageId = 'has space'; }],
    ['non-blocking send', (value) => { value.params.configuration.returnImmediately = true; }],
    ['history request', (value) => { value.params.configuration.historyLength = 5; }],
    ['push registration', (value) => { value.params.configuration.taskPushNotificationConfig = { url: 'https://127.0.0.1:1/hook' }; }],
    ['unsupported output mode', (value) => { value.params.configuration.acceptedOutputModes = ['image/png']; }],
    ['tenant', (value) => { value.params.tenant = 'other-session'; }],
    ['request metadata', (value) => { value.params.metadata = { session: 'other-session' }; }],
  ]);
  for (const [label, mutate] of cases) {
    const fixture = serveFixture();
    const response = /** @type {any} */ (await exchange(fixture.app, { headers: A2A_JSON, body: mutatedQuestion(mutate) }));
    assert.equal(response.status, 400, label);
    assert.equal(response.json?.id, 7, label);
    assert.equal(response.json?.error?.code, -32602, label);
    assert.equal(fixture.questions.length, 0, `${label} must not reach the question handler`);
  }
});

test('Task, streaming, push, extended-card, v0.3, and other routes are refused, never answered as success', async () => {
  const fixture = serveFixture();
  for (const [method, code] of /** @type {const} */ ([
    ['GetTask', -32004], ['ListTasks', -32004], ['CancelTask', -32004],
    ['SendStreamingMessage', -32004], ['SubscribeToTask', -32004],
    ['CreateTaskPushNotificationConfig', -32003], ['GetTaskPushNotificationConfig', -32003],
    ['ListTaskPushNotificationConfigs', -32003], ['DeleteTaskPushNotificationConfig', -32003],
    ['GetExtendedAgentCard', -32007], ['message/send', -32601], ['tasks/get', -32601],
  ])) {
    const response = /** @type {any} */ (await exchange(fixture.app, {
      headers: A2A_JSON,
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method, params: { id: 'task-1', message: questionRequest().params.message } }),
    }));
    assert.equal(response.json?.error?.code, code, method);
    assert.equal(response.json?.result, undefined, method);
  }
  for (const [method, path] of [['GET', '/'], ['POST', '/tasks'], ['GET', '/v1/card'], ['PUT', '/']]) {
    const response = /** @type {any} */ (await exchange(fixture.app, { method, path, headers: A2A_JSON, body: '{}' }));
    assert.equal(response.status, 404, `${method} ${path}`);
  }
  assert.equal(fixture.questions.length, 0);
});

test('an admitted question reaches the handler once and gets a correlated direct Message, not a Task', async () => {
  const fixture = serveFixture();
  const response = /** @type {any} */ (await exchange(fixture.app, { headers: A2A_JSON, body: JSON.stringify(questionRequest()) }));

  assert.equal(response.status, 200);
  assert.deepEqual(fixture.questions, [{ messageId: 'question-1', text: 'Does the recorded log support claim X at revision R?', requested: [] }]);
  assert.equal(fixture.bindingChecks, 2, 'the activation is rechecked at request start and again before admission');
  const message = response.json?.result?.message;
  assert.equal(response.json?.result?.task, undefined);
  assert.equal(response.json?.id, 7);
  assert.equal(message.role, 'ROLE_AGENT');
  assert.match(message.messageId, /^[0-9a-f-]{36}$/);
  assert.match(message.contextId, /^[0-9a-f-]{36}$/);
  assert.equal(message.taskId, undefined);
  assert.deepEqual(message.parts, [{ data: { outcome: 'unavailable', reason: 'no_live_receive' }, mediaType: 'application/json' }]);
  assert.deepEqual(message.metadata, { dudeA2a: { version: 1, replyTo: 'question-1' } });
  assert.deepEqual(fixture.refusals, []);
});

test('contentBytes, not the SDK body parser default, bounds an admitted question', async () => {
  const fixture = serveFixture({ contentBytes: 300_000 });
  const text = `Large question ${'x'.repeat(150_000)}`;
  const body = mutatedQuestion((value) => { value.params.message.parts[0].text = text; });
  assert.ok(Buffer.byteLength(body) > 100 * 1024, 'the body exceeds the SDK express.json default limit');

  const response = /** @type {any} */ (await exchange(fixture.app, { headers: A2A_JSON, body }));

  assert.equal(response.status, 200);
  assert.equal(fixture.questions.length, 1);
  assert.equal(fixture.questions[0].text, text, 'delivered complete, never truncated');
});

test('every serving response fits contentBytes as encoded, with an explicit bounded failure instead of an oversized reply', async () => {
  const minimal = (/** @type {string | number} */ id, /** @type {string} */ messageId) => JSON.stringify({
    jsonrpc: '2.0', id, method: 'SendMessage',
    params: { message: { messageId, role: 'ROLE_USER', parts: [{ text: '?' }], metadata: { dudeA2a: { version: 1 } } } },
  });

  // A minimal question fits 256 bytes; the generated two-UUID reply does not.
  const tight = serveFixture({ contentBytes: 256 });
  const request = minimal(1, 'q');
  assert.ok(Buffer.byteLength(request) <= 256);
  const over = /** @type {any} */ (await exchange(tight.app, { headers: A2A_JSON, body: request }));
  assert.equal(over.status, 500);
  assert.ok(Buffer.byteLength(over.text) <= 256, `failure body is ${Buffer.byteLength(over.text)} bytes`);
  assert.equal(Number(over.headers['content-length']), Buffer.byteLength(over.text));
  assert.deepEqual(over.json, { jsonrpc: '2.0', id: 1, error: { code: -32603, message: "The reply exceeds this peer's contentBytes and was withheld." } });
  assert.equal(tight.questions.length, 1, 'the question was admitted; only the reply was withheld');
  assert.ok(tight.refusals.includes('response_over_budget'));

  // The longest request ID that still lets the question fit; the failure echoes it within budget.
  let id = 'i'.repeat(128);
  while (Buffer.byteLength(minimal(id, 'q')) > 256) id = id.slice(1);
  const worst = serveFixture({ contentBytes: 256 });
  const worstFailure = /** @type {any} */ (await exchange(worst.app, { headers: A2A_JSON, body: minimal(id, 'q') }));
  assert.equal(worstFailure.status, 500);
  assert.equal(worstFailure.json?.id, id);
  assert.ok(Buffer.byteLength(worstFailure.text) <= 256);

  // Worst-case IDs fit a normal budget and the reply is sent whole.
  const roomy = serveFixture({ contentBytes: 4096 });
  const longMessageId = 'm'.repeat(128);
  const fit = /** @type {any} */ (await exchange(roomy.app, { headers: A2A_JSON, body: minimal('r'.repeat(128), longMessageId) }));
  assert.equal(fit.status, 200);
  assert.equal(fit.json?.id, 'r'.repeat(128));
  assert.equal(fit.json?.result?.message?.metadata?.dudeA2a?.replyTo, longMessageId);
  assert.ok(Buffer.byteLength(fit.text) <= 4096);
  assert.deepEqual(roomy.refusals, []);

  // The card and refusals obey the same budget; when even the failure cannot fit, the body is empty.
  const cardBudget = serveFixture({ contentBytes: 512 });
  const card = /** @type {any} */ (await exchange(cardBudget.app, { method: 'GET', path: '/.well-known/agent-card.json' }));
  assert.equal(card.status, 500);
  assert.deepEqual(card.json, { error: 'response_over_budget' });
  const tiny = serveFixture({ contentBytes: 24 });
  const empty = /** @type {any} */ (await exchange(tiny.app, { headers: A2A_JSON, body: request, peer: { raw: SERVER_DER } }));
  assert.equal(empty.status, 500);
  assert.equal(empty.text, '');
  assert.equal(empty.headers['content-length'], '0');
});

test('a binding that ends while the body is read answers unavailable without delivering the question', async () => {
  let checks = 0;
  const fixture = serveFixture({ checkBinding: () => (checks += 1) === 1 });
  const response = /** @type {any} */ (await exchange(fixture.app, { headers: A2A_JSON, body: JSON.stringify(questionRequest()) }));
  assert.equal(response.status, 200);
  assert.deepEqual(response.json?.result?.message?.parts, [{ data: { outcome: 'unavailable', reason: 'activation_ended' }, mediaType: 'application/json' }]);
  assert.equal(checks, 2);
  assert.equal(fixture.questions.length, 0, 'the question never reached the activation');
});

test('the SDK JSON-RPC client and server interoperate in-process with both certificate pins', async () => {
  const fixture = serveFixture();
  const server = http.createServer(fixture.app);
  /** @type {Array<{written: number[]}>} */
  const connections = [];
  const client = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: connectTo(server, { connections }) });

  const reply = await client.send('Does your evidence support claim X?', { signal: new AbortController().signal });

  assert.equal(client.url, 'https://127.0.0.1:18443/');
  const { questionId, ...peerReply } = reply;
  assert.deepEqual(peerReply, { outcome: 'unavailable', reason: 'no_live_receive' });
  assert.match(questionId, /^[0-9a-f-]{36}$/, 'the reply names the question it answers');
  assert.equal(fixture.questions.length, 1);
  assert.equal(fixture.questions[0].text, 'Does your evidence support claim X?');
  assert.equal(connections.length, 1, 'one fresh connection per question, no retry');
  assert.deepEqual(fixture.refusals, []);
});

test('the asking side verifies the server pin and encryption before writing any request byte', async () => {
  for (const [options, code] of /** @type {const} */ ([
    [{ serverRaw: Buffer.from('impostor-certificate') }, 'certificate_mismatch'],
    [{ encrypted: false }, 'encryption_required'],
  ])) {
    const fixture = serveFixture();
    const server = http.createServer(fixture.app);
    /** @type {Array<{written: number[]}>} */
    const connections = [];
    const client = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: connectTo(server, { ...options, connections }) });

    const error = await transportFailure(client.send('Is claim X supported?', { signal: new AbortController().signal }));

    assert.equal(error.code, code);
    assert.equal(error.sent, false, 'nothing can have reached the peer');
    assert.equal(connections[0].written[0], 0, `${code}: no request byte was written`);
    assert.equal(fixture.questions.length, 0);
  }
});

test('the asking side refuses oversized, uncorrelated, Task-shaped, and refused replies without calling them answers', async () => {
  const options = askOptions();
  const noConnect = /** @type {any} */ (() => assert.fail('an oversized question must not connect'));
  const tooLarge = await prepareClient(askOptions({ contentBytes: 64 }), { createSecureContext: acceptAnyPem, connect: noConnect });
  const unsent = await transportFailure(tooLarge.send('x'.repeat(200), { signal: new AbortController().signal }));
  assert.equal(unsent.code, 'content_too_large');
  assert.equal(unsent.sent, false);

  const invalidQuestion = await transportFailure(tooLarge.send('bad\u0007text', { signal: new AbortController().signal }));
  assert.equal(invalidQuestion.code, 'invalid_question');

  /**
   * A hand-rolled peer, to produce replies the real serving side never sends.
   * @param {(request: any) => {status?: number, body: unknown}} respond
   */
  const peer = (respond) => http.createServer((request, response) => {
    /** @type {Buffer[]} */
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const incoming = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const { status = 200, body } = respond(incoming);
      response.statusCode = status;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(body));
    });
  });
  const message = (/** @type {any} */ incoming, /** @type {any} */ changes = {}) => ({
    jsonrpc: '2.0',
    id: incoming.id,
    result: {
      message: {
        messageId: 'reply-1',
        contextId: 'context-1',
        role: 'ROLE_AGENT',
        parts: [{ data: { outcome: 'unavailable', reason: 'no_live_receive' }, mediaType: 'application/json' }],
        metadata: { dudeA2a: { version: 1, replyTo: incoming.params.message.messageId } },
        ...changes,
      },
    },
  });
  const cases = /** @type {Array<[string, (incoming: any) => {status?: number, body: unknown}, string, number | null]>} */ ([
    ['reply over contentBytes', (incoming) => ({ body: message(incoming, { parts: [{ data: { outcome: 'unavailable', reason: 'x'.repeat(5000) } }] }) }), 'reply_too_large', 200],
    ['uncorrelated reply', (incoming) => ({ body: message(incoming, { metadata: { dudeA2a: { version: 1, replyTo: 'someone-else' } } }) }), 'invalid_reply', null],
    ['answer-shaped reply without the exact answer envelope', (incoming) => ({ body: message(incoming, { parts: [{ data: { outcome: 'answer', reason: 'model_reply' } }] }) }), 'invalid_reply', null],
    ['Task result', (incoming) => ({ body: { jsonrpc: '2.0', id: incoming.id, result: { task: { id: 'task-1', contextId: 'context-1', status: { state: 'TASK_STATE_COMPLETED' } } } } }), 'invalid_reply', null],
    ['peer refusal', () => ({ status: 403, body: { error: 'certificate_mismatch' } }), 'peer_refused', 403],
    ['JSON-RPC refusal', (incoming) => ({ body: { jsonrpc: '2.0', id: incoming.id, error: { code: -32009, message: 'version' } } }), 'peer_refused', 200],
  ]);
  for (const [label, respond, code, status] of cases) {
    const client = await prepareClient(options, { createSecureContext: acceptAnyPem, connect: connectTo(peer(respond)) });
    const error = await transportFailure(client.send('Is claim X supported?', { signal: new AbortController().signal }));
    assert.equal(error.code, code, label);
    assert.equal(error.sent, true, `${label}: the question may have been delivered`);
    if (status !== null) assert.equal(error.status, status, label);
  }
});

test('asking distinguishes cancellation before sending from a timeout after the question may have been delivered', async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  const neverConnects = /** @type {any} */ (() => assert.fail('a cancelled ask must not connect'));
  const early = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: neverConnects });
  const beforeSend = await transportFailure(early.send('Is claim X supported?', { signal: cancelled.signal }));
  assert.equal(beforeSend.code, 'cancelled');
  assert.equal(beforeSend.sent, false);

  const silent = http.createServer(() => undefined);
  const late = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: connectTo(silent) });
  // The caller owns the deadline; the transport has no timer of its own.
  const afterSend = await transportFailure(late.send('Is claim X supported?', { signal: AbortSignal.timeout(50) }));
  assert.equal(afterSend.code, 'timeout');
  assert.equal(afterSend.sent, true, 'a timeout after writing is uncertain delivery, not non-delivery');
});

test('the prepared client rechecks the binding after the pinned handshake, and a failed check closes the socket before any byte', async () => {
  for (const [label, verdict] of /** @type {Array<[string, () => boolean]>} */ ([
    ['check returns false', () => false],
    ['check throws', () => { throw new Error('binding check failed'); }],
  ])) {
    const peer = serveFixture();
    /** @type {Array<ReturnType<typeof duplexPair>>} */
    const connections = [];
    let handshakeDone = false;
    const hold = () => new Promise((resolve) => setImmediate(() => { handshakeDone = true; resolve(undefined); }));
    /** @type {Array<{handshakeDone: boolean, connections: number, written: number, destroyed: boolean}>} */
    const checks = [];
    const client = await prepareClient(askOptions({
      checkBinding: () => {
        checks.push({ handshakeDone, connections: connections.length, written: connections[0]?.written[0] ?? -1, destroyed: connections[0]?.client.destroyed ?? true });
        return verdict();
      },
    }), { createSecureContext: acceptAnyPem, connect: connectTo(http.createServer(peer.app), { connections, hold }) });

    const outcome = await client.send('Is claim X supported?', { signal: new AbortController().signal })
      .then((reply) => ({ reply, error: null }), (/** @type {unknown} */ error) => ({ reply: null, error }));

    assert.deepEqual(checks, [{ handshakeDone: true, connections: 1, written: 0, destroyed: false }],
      `${label}: checked once, after the handshake and before any request byte`);
    assert.equal(outcome.reply, null, label);
    assert.ok(outcome.error instanceof A2aTransportError, label);
    assert.equal(outcome.error.code, 'activation_ended', label);
    assert.equal(outcome.error.sent, false, `${label}: definite non-delivery, not uncertain`);
    assert.equal(connections[0].written[0], 0, `${label}: no request byte was written`);
    assert.equal(connections[0].client.destroyed, true, `${label}: the socket is closed at once`);
    assert.equal(peer.questions.length, 0, label);
  }
});

test('an abort raised during a passing post-handshake check still stops the ask before any byte', async () => {
  const peer = serveFixture();
  /** @type {Array<ReturnType<typeof duplexPair>>} */
  const connections = [];
  const controller = new AbortController();
  let checks = 0;
  const client = await prepareClient(askOptions({
    checkBinding: () => {
      checks += 1;
      controller.abort();
      return true;
    },
  }), { createSecureContext: acceptAnyPem, connect: connectTo(http.createServer(peer.app), { connections }) });

  const outcome = await client.send('Is claim X supported?', { signal: controller.signal })
    .then((reply) => ({ reply, error: null }), (/** @type {unknown} */ error) => ({ reply: null, error }));

  assert.equal(checks, 1, 'the binding was rechecked after the handshake');
  assert.equal(outcome.reply, null);
  assert.ok(outcome.error instanceof A2aTransportError);
  assert.equal(outcome.error.code, 'cancelled');
  assert.equal(outcome.error.sent, false);
  assert.equal(connections[0].written[0], 0, 'no request byte was written');
  assert.equal(connections[0].client.destroyed, true);
  assert.equal(peer.questions.length, 0);
});

/**
 * A real ask activation, approved through the chat commands, whose prepared
 * SDK client reaches `server` over in-memory connections. Questions go
 * through the registered tool handler, not the exported sender.
 * @param {http.Server} server
 * @param {Parameters<typeof connectTo>[1]} [connectOptions]
 * @param {Record<string, unknown>} [profileOverrides] Extra `a-ask` profile keys, such as `expiresAt`.
 */
async function registeredAsker(server, connectOptions = {}, profileOverrides = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-a2a-ask-'));
  const workspace = path.join(base, 'workspace');
  const owner = path.join(base, 'owner');
  fs.mkdirSync(workspace);
  fs.mkdirSync(owner);
  fs.writeFileSync(path.join(owner, 'cert.pem'), 'fixture certificate text, not a real certificate\n');
  fs.writeFileSync(path.join(owner, 'key.pem'), 'fixture key text, not a real key\n');
  const configPath = path.join(owner, 'a2a.json');
  fs.writeFileSync(configPath, JSON.stringify({ profiles: { 'a-ask': {
    role: 'ask',
    label: 'A (Windows)',
    workspace,
    peer: { label: 'B (Mac)', address: '127.0.0.1', port: 18_443, certSha256: pin(SERVER_DER) },
    tls: { certFile: path.join(owner, 'cert.pem'), keyFile: path.join(owner, 'key.pem') },
    sharing: { allowed: 'Questions about recorded logs', excluded: 'Credentials', purpose: 'Confirmation' },
    contentBytes: 4096,
    askTimeoutMs: 2_000,
    repeatUse: 'activation',
    ...profileOverrides,
  } } }));
  /** @type {string[]} */
  const logs = [];
  const clock = { now: NOW };
  const provider = createA2a({
    root: workspace,
    now: () => clock.now,
    transport: {
      startServer: /** @type {any} */ (() => assert.fail('asking starts no listener')),
      prepareClient: (options) => prepareClient(options, { createSecureContext: acceptAnyPem, connect: connectTo(server, connectOptions) }),
    },
  });
  provider.bindSession(/** @type {any} */ ({
    sessionId: 'session-A',
    log: async (/** @type {string} */ message) => { logs.push(message); },
    rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [], inFlightSteeringCount: 0 }) } },
  }));
  /** @param {(line: string) => boolean} probe */
  const logLine = async (probe) => {
    for (let index = 0; index < 400 && !logs.some(probe); index += 1) await new Promise((resolve) => setImmediate(resolve));
    return String(logs.find(probe));
  };
  const proposeTool = provider.tools.find((entry) => entry.name === 'dude_a2a_propose');
  assert.ok(proposeTool?.handler);
  const args = { configPath, profileId: 'a-ask' };
  const proposal = /** @type {any} */ (await proposeTool.handler(args, {
    sessionId: 'session-A', toolName: 'dude_a2a_propose', toolCallId: randomUUID(), arguments: args, signal: new AbortController().signal,
  }));
  assert.equal(proposal.resultType, 'success');
  const code = /approve ([0-9a-f]{12});/.exec(proposal.textResultForLlm)?.[1];
  assert.ok(code);
  provider.onEvent(/** @type {any} */ ({ type: 'user.message', data: { content: `dude a2a approve ${code}` } }));
  assert.match(await logLine((line) => /^(?:Activation: active|A2A approval refused)/.test(line)), /^Activation: active; ask profile a-ask/);
  const tool = provider.tools.find((entry) => entry.name === 'dude_a2a_ask');
  assert.ok(tool?.handler);
  const handler = tool.handler;
  let calls = 0;
  return {
    /** @param {string} question */
    async ask(question) {
      const result = /** @type {any} */ (await handler({ question }, {
        sessionId: 'session-A', toolName: 'dude_a2a_ask', toolCallId: `in-process-${++calls}`, arguments: {}, signal: new AbortController().signal,
      }));
      assert.equal(result.resultType, 'failure', 'a non-answer is never a success result');
      return JSON.parse(result.textResultForLlm);
    },
    configPath,
    owner,
    logs,
    clock,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

test('the registered ask tool reaches the in-process peer through the real SDK client and reports only its non-answer', async () => {
  const peer = serveFixture();
  const asker = await registeredAsker(http.createServer(peer.app));
  try {
    const details = await asker.ask('Does your recorded log support claim X?');
    assert.deepEqual([details.outcome, details.reason, details.delivery], ['unavailable', 'no_live_receive', 'reached_peer']);
    assert.deepEqual(details.peer, { label: 'B (Mac)', endpoint: 'https://127.0.0.1:18443/', certSha256: pin(SERVER_DER) });
    assert.deepEqual(peer.questions.map((question) => question.text), ['Does your recorded log support claim X?']);
  } finally {
    asker.cleanup();
  }

  // B admits the 287-byte question but cannot fit its 358-byte reply: it withholds
  // the reply explicitly and A reports a refusal, never an answer.
  const tight = serveFixture({ contentBytes: 320 });
  const tightAsker = await registeredAsker(http.createServer(tight.app));
  try {
    const details = await tightAsker.ask('q?');
    assert.deepEqual([details.outcome, details.reason, details.delivery], ['refused', 'peer_refused', 'reached_peer']);
    assert.equal(tight.questions.length, 1);
    assert.ok(tight.refusals.includes('response_over_budget'));
  } finally {
    tightAsker.cleanup();
  }

  const impostorPeer = serveFixture();
  /** @type {Array<{written: number[]}>} */
  const connections = [];
  const impostor = await registeredAsker(http.createServer(impostorPeer.app), { serverRaw: Buffer.from('impostor-certificate'), connections });
  try {
    const details = await impostor.ask('Is claim X supported?');
    assert.deepEqual([details.outcome, details.reason, details.delivery], ['refused', 'certificate_mismatch', 'not_sent']);
    assert.equal(connections[0].written[0], 0, 'no request byte reached the impostor');
    assert.equal(impostorPeer.questions.length, 0);
  } finally {
    impostor.cleanup();
  }
});

const ENDED_ON_DRIFT = [
  'A2A activation ended: the configuration, TLS files, session, or workspace no longer match the approval.',
  'Activation: inactive',
  'Communication: ended; nothing further is sent',
].join('\n');

/** @param {string} configPath @param {(profile: any) => void} mutate */
function editProfile(configPath, mutate) {
  const document = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  mutate(document.profiles['a-ask']);
  fs.writeFileSync(configPath, JSON.stringify(document));
}

test('a sharing change while the pinned handshake is pending refuses the ask unsent, closes the socket, and ends the activation', async () => {
  const peer = serveFixture();
  /** @type {Array<ReturnType<typeof duplexPair>>} */
  const connections = [];
  const handshakes = heldHandshakes();
  const asker = await registeredAsker(http.createServer(peer.app), { connections, hold: handshakes.hold });
  try {
    // Control: an unchanged binding survives a held handshake and sends once.
    const control = asker.ask('Is claim X supported?');
    await waitFor(() => handshakes.pending === 1, 'first handshake started');
    handshakes.release(0);
    const sent = await control;
    assert.deepEqual([sent.outcome, sent.reason, sent.delivery], ['unavailable', 'no_live_receive', 'reached_peer']);
    assert.equal(peer.questions.length, 1);

    const pending = asker.ask('Does your recorded log support claim Y?');
    await waitFor(() => handshakes.pending === 2, 'second handshake started');
    editProfile(asker.configPath, (profile) => { profile.sharing.allowed = 'Everything in the workspace'; });
    handshakes.release(1);
    const details = await pending;

    assert.deepEqual([details.outcome, details.reason, details.delivery], ['refused', 'activation_ended', 'not_sent'],
      'the question approved under the old sharing policy is not sent');
    assert.equal(connections[1].written[0], 0, 'no request byte was written after the change');
    assert.equal(connections[1].client.destroyed, true, 'the pinned socket is closed at once');
    assert.equal(peer.questions.length, 1, 'the peer never received the second question');
    assert.equal(asker.logs.find((line) => line.startsWith('A2A activation ended:')), ENDED_ON_DRIFT);
    const followUp = await asker.ask('Is claim Y supported?');
    assert.deepEqual([followUp.outcome, followUp.reason, followUp.delivery], ['refused', 'no_activation', 'not_sent']);
    assert.equal(connections.length, 2, 'no follow-up connection');
  } finally {
    asker.cleanup();
  }
});

test('peer, revocation, TLS key, and validity drift during a held handshake each refuse the ask before any byte', async () => {
  const expiresAt = '2026-09-23T17:00:00Z';
  const cases = /** @type {Array<[string, (asker: Awaited<ReturnType<typeof registeredAsker>>) => void, string]>} */ ([
    ['peer address changed', (asker) => editProfile(asker.configPath, (profile) => { profile.peer.address = '127.0.0.2'; }), ENDED_ON_DRIFT],
    ['configuration file removed', (asker) => fs.rmSync(asker.configPath), ENDED_ON_DRIFT],
    ['TLS key rotated', (asker) => fs.writeFileSync(path.join(asker.owner, 'key.pem'), 'rotated fixture key text\n'), ENDED_ON_DRIFT],
    ['validity passed', (asker) => { asker.clock.now = Date.parse('2026-09-23T17:00:01Z'); },
      ['A2A activation ended: its validity ended.', 'Activation: inactive', 'Communication: ended; nothing further is sent'].join('\n')],
  ]);
  for (const [label, drift, notice] of cases) {
    const peer = serveFixture();
    /** @type {Array<ReturnType<typeof duplexPair>>} */
    const connections = [];
    const handshakes = heldHandshakes();
    const asker = await registeredAsker(http.createServer(peer.app), { connections, hold: handshakes.hold }, { expiresAt });
    try {
      const pending = asker.ask('Is claim X supported?');
      await waitFor(() => handshakes.pending === 1, `${label}: handshake started`);
      drift(asker);
      handshakes.release(0);
      const details = await pending;

      assert.deepEqual([details.outcome, details.reason, details.delivery], ['refused', 'activation_ended', 'not_sent'], label);
      assert.equal(connections[0].written[0], 0, `${label}: no request byte was written`);
      assert.equal(connections[0].client.destroyed, true, `${label}: the socket is closed at once`);
      assert.equal(peer.questions.length, 0, label);
      assert.equal(asker.logs.find((line) => line.startsWith('A2A activation ended:')), notice, label);
    } finally {
      asker.cleanup();
    }
  }
});

test('prepareClient refuses TLS material Node cannot load instead of activating', async () => {
  const error = await transportFailure(prepareClient(askOptions()));
  assert.equal(error.code, 'tls_material_invalid');
});

test('the listener binds only the configured literal with mutual TLS and drops unpinned connections', async () => {
  class ServerDouble extends EventEmitter {
    /** @param {any} tlsOptions @param {unknown} app */
    constructor(tlsOptions, app) {
      super();
      this.tlsOptions = tlsOptions;
      this.app = app;
      /** @type {any} */
      this.listenArgs = null;
      /** @type {any} */
      this.bound = null;
      /** @type {unknown} */
      this.failure = null;
      this.closes = 0;
      this.connectionsClosed = 0;
    }
    /** @param {any} args */
    listen(args) {
      this.listenArgs = args;
      setImmediate(() => (this.failure ? this.emit('error', this.failure) : this.emit('listening')));
      return this;
    }
    address() {
      return this.bound ?? { address: this.listenArgs.host, port: this.listenArgs.port, family: 'IPv4' };
    }
    /** @param {() => void} callback */
    close(callback) {
      this.closes += 1;
      setImmediate(callback);
      return this;
    }
    closeAllConnections() {
      this.connectionsClosed += 1;
    }
  }
  /** @type {ServerDouble[]} */
  const servers = [];
  /** @param {(server: ServerDouble) => void} [configure] */
  const adapters = (configure = () => undefined) => ({
    createServer: /** @type {any} */ ((/** @type {any} */ tlsOptions, /** @type {unknown} */ app) => {
      const server = new ServerDouble(tlsOptions, app);
      configure(server);
      servers.push(server);
      return server;
    }),
  });
  const fixture = serveFixture();

  const handle = await startServer(fixture.options, adapters());
  const server = servers[0];
  assert.equal(handle.url, 'https://127.0.0.1:18443/');
  assert.deepEqual(server.listenArgs, { host: '127.0.0.1', port: 18443, exclusive: true });
  assert.equal(server.tlsOptions.requestCert, true);
  assert.equal(server.tlsOptions.rejectUnauthorized, false, 'the certificate pin, not a CA chain, decides trust');
  assert.equal(server.tlsOptions.minVersion, 'TLSv1.2');
  assert.equal(server.tlsOptions.cert, fixture.options.tls.cert);
  assert.equal(server.tlsOptions.key, fixture.options.tls.key);
  const destroyed = [];
  const tlsSocket = (/** @type {Buffer} */ raw) => ({ encrypted: true, remoteAddress: '127.0.0.1', getPeerCertificate: () => ({ raw, ...CURRENT }), destroy: () => destroyed.push(raw) });
  server.emit('secureConnection', tlsSocket(SERVER_DER));
  server.emit('secureConnection', tlsSocket(CLIENT_DER));
  assert.deepEqual(destroyed, [SERVER_DER], 'only the unpinned connection is dropped');
  assert.deepEqual(fixture.refusals, ['certificate_mismatch']);
  await handle.close();
  assert.equal(server.closes, 1);
  assert.equal(server.connectionsClosed, 1);

  const inUse = await transportFailure(startServer(fixture.options, adapters((double) => {
    double.failure = Object.assign(new Error('in use'), { code: 'EADDRINUSE' });
  })));
  assert.equal(inUse.code, 'listen_address_in_use');
  const moved = await transportFailure(startServer(fixture.options, adapters((double) => {
    double.bound = { address: '0.0.0.0', port: 18443, family: 'IPv4' };
  })));
  assert.equal(moved.code, 'listen_mismatch');
  assert.equal(servers.at(-1)?.closes, 1, 'a mismatched listener is closed');
  const badPem = await transportFailure(startServer(fixture.options, {
    createServer: /** @type {any} */ (() => { throw new Error('bad pem'); }),
  }));
  assert.equal(badPem.code, 'tls_material_invalid');
});

// ---------------------------------------------------------------------------
// US1 conversations and US3 lifetime. The serving response lifecycle runs
// through the real Express/SDK stack over in-memory sockets, and the
// two-service fixtures run both real providers end to end. The tests write
// the model prose themselves, so they prove adapter behavior, not model
// behavior, real TLS, or real socket semantics.

const LOOPBACK = () => ({ lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: /** @type {const} */ ('IPv4'), mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }] });
const OLD_MTIME = new Date('2026-09-21T08:00:00Z');
const ANSWER_NOTICE = 'The peer model authored the conclusion and limitations. Listed adapter checks cover bindings and structure, not truth. '
  + 'Evidence retains its provenance and uncertainty. Nothing grants permission or replaces local acceptance.';
const EXCERPT_CHECK = "Each excerpt's size and SHA-256 were recomputed from the received text.";
const WAITING = 'Status: waiting; current receive live';
/** @param {Buffer | string} value */
const digest = (value) => createHash('sha256').update(value).digest('hex');
/** @param {string} content @param {Record<string, unknown>} [data] @param {Record<string, unknown>} [event] */
const rootMessage = (content, data = {}, event = {}) => ({ type: 'user.message', ...event, data: { content, ...data } });
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** @param {string} file @param {(document: any) => void} mutate */
function editJson(file, mutate) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(document);
  fs.writeFileSync(file, JSON.stringify(document));
}

/**
 * One raw request to `app` over an in-memory connection that the test can
 * inspect or drop while the response is pending.
 * @param {http.RequestListener} app @param {string} body
 */
function openRequest(app, body) {
  const pair = duplexPair();
  /** @type {boolean[]} */
  const requestClosed = [];
  const server = http.createServer((request, response) => {
    request.once('close', () => requestClosed.push(true));
    app(request, response);
  });
  server.emit('connection', asTls(pair.server));
  /** @type {Promise<{status: number | null | undefined, text: string}>} */
  const response = new Promise((resolve) => {
    const request = http.request({ createConnection: () => pair.client, host: '127.0.0.1', port: 18443, method: 'POST', path: '/', headers: A2A_JSON }, (incoming) => {
      /** @type {Buffer[]} */
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      incoming.on('error', () => resolve({ status: null, text: '' }));
    });
    request.on('error', () => resolve({ status: null, text: '' }));
    request.end(body);
  });
  return { pair, requestClosed, response };
}

test('the serving response lifecycle: a completed request body is not client loss, measure() is the exact written body, and early response closure is loss', async () => {
  /** @type {Array<{delivery: import('./lib/a2a-transport.mjs').Delivery, respond: (reply: any) => void}>} */
  const admitted = [];
  const fixture = serveFixture({ onQuestion: (_question, delivery) => new Promise((respond) => { admitted.push({ delivery, respond }); }) });

  // Worst-case IDs, and prose whose UTF-8 size differs from its length.
  const normal = openRequest(fixture.app, mutatedQuestion((value) => { value.id = 'i'.repeat(128); value.params.message.messageId = 'm'.repeat(128); }));
  await waitFor(() => admitted.length === 1 && normal.requestClosed.length === 1, 'question admitted after its request body completed and closed');
  for (let index = 0; index < 5; index += 1) await tick();
  assert.equal(admitted[0].delivery.signal.aborted, false, 'the request closing after its body is not client loss');
  const answer = { outcome: 'answer', exchangeId: randomUUID(), conclusion: 'Yes: é, ✓, and 𝄞 count as UTF-8 bytes.', limitations: 'none', evidence: [] };
  const measured = admitted[0].delivery.measure(answer);
  admitted[0].respond(answer);
  const sent = await normal.response;
  assert.equal(sent.status, 200);
  assert.equal(Buffer.byteLength(sent.text, 'utf8'), measured, 'measure() equals the bytes the SDK and Express wrote');
  assert.deepEqual(JSON.parse(sent.text).result.message.parts, [{ data: answer, mediaType: 'application/json' }]);
  assert.equal(await admitted[0].delivery.written, 'sent');

  const plain = openRequest(fixture.app, JSON.stringify(questionRequest()));
  await waitFor(() => admitted.length === 2, 'second question admitted');
  const nonAnswer = { outcome: 'unavailable', reason: 'exchange_ended' };
  const plainSize = admitted[1].delivery.measure(nonAnswer);
  admitted[1].respond(nonAnswer);
  assert.equal(Buffer.byteLength((await plain.response).text, 'utf8'), plainSize);

  // The asker drops the connection while the reply is pending.
  const lost = openRequest(fixture.app, JSON.stringify(questionRequest()));
  await waitFor(() => admitted.length === 3, 'third question admitted');
  lost.pair.client.destroy();
  await waitFor(() => admitted[2].delivery.signal.aborted, 'loss observed from the response lifecycle');
  assert.equal(await admitted[2].delivery.written, 'lost');
  admitted[2].respond(answer);
  for (let index = 0; index < 5; index += 1) await tick();
  assert.equal(lost.pair.written[1], 0, 'nothing is written after the asker is gone');

  // A withdrawn reply drops the connection and writes nothing.
  const withdrawn = openRequest(fixture.app, JSON.stringify(questionRequest()));
  await waitFor(() => admitted.length === 4, 'fourth question admitted');
  admitted[3].respond(null);
  assert.equal((await withdrawn.response).status, null);
  assert.equal(withdrawn.pair.written[1], 0);
  assert.equal(await admitted[3].delivery.written, 'lost');

  // The encoded-size backstop withholds an oversized reply and says so.
  /** @type {typeof admitted} */
  const tight = [];
  const small = serveFixture({ contentBytes: 512, onQuestion: (_question, delivery) => new Promise((respond) => { tight.push({ delivery, respond }); }) });
  const over = openRequest(small.app, JSON.stringify(questionRequest()));
  await waitFor(() => tight.length === 1, 'tight question admitted');
  tight[0].respond({ ...answer, conclusion: 'x'.repeat(600) });
  const withheld = await over.response;
  assert.equal(withheld.status, 500);
  assert.ok(Buffer.byteLength(withheld.text) <= 512);
  assert.equal(await tight[0].delivery.written, 'too_large', 'a withheld reply is reported as not sent');
});

test('the asking side accepts only the exact answer envelope and recomputes each excerpt, so tampered or incomplete answers are uncertain and never delivered', async () => {
  const text = 'result: 412 passed, 0 failed\n';
  const valid = () => ({
    outcome: 'answer',
    exchangeId: randomUUID(),
    conclusion: 'R2 passes according to its recorded log.',
    limitations: 'Not rerun; the log is from 2026-09-20.',
    evidence: [{
      kind: 'file', reference: 'evidence/runs/r2.log', lines: { start: 5, end: 5 }, text, bytes: Buffer.byteLength(text), sha256: digest(text),
      fileBytes: 120, fileSha256: 'a'.repeat(64), readAt: '2026-09-23T16:00:00.000Z', mtime: '2026-09-21T08:00:00.000Z', claimedProvenance: 'revision R2',
    }],
  });
  const whole = valid();
  whole.evidence[0] = { ...whole.evidence[0], lines: null, fileBytes: Buffer.byteLength(text), fileSha256: digest(text) };
  assert.ok(readAnswer(valid()), 'a partial excerpt with its own hash');
  assert.ok(readAnswer(whole), 'a whole-file excerpt whose file fields match');
  const cases = /** @type {Array<[string, (value: any) => void]>} */ ([
    ['tampered excerpt hash', (value) => { value.evidence[0].sha256 = 'b'.repeat(64); }],
    ['wrong excerpt size', (value) => { value.evidence[0].bytes += 1; }],
    ['whole-file claim that does not match its excerpt', (value) => { value.evidence[0].lines = null; }],
    ['absolute reference', (value) => { value.evidence[0].reference = '/Users/b/evidence/r2.log'; }],
    ['escaping reference', (value) => { value.evidence[0].reference = 'evidence/../secrets.txt'; }],
    ['inverted line range', (value) => { value.evidence[0].lines = { start: 5, end: 4 }; }],
    ['unparseable read time', (value) => { value.evidence[0].readAt = 'yesterday'; }],
    ['extra evidence field', (value) => { value.evidence[0].verified = true; }],
    ['run record this build cannot validate', (value) => { value.evidence = [{ run: 'run-1' }]; }],
    ['blank conclusion', (value) => { value.conclusion = '  '; }],
    ['control character in limitations', (value) => { value.limitations = 'bell\u0007'; }],
    ['non-UUID exchange', (value) => { value.exchangeId = 'exchange-1'; }],
    ['approval field', (value) => { value.approved = true; }],
    ['evidence not a list', (value) => { value.evidence = {}; }],
  ]);
  for (const [label, mutate] of cases) {
    const value = valid();
    mutate(value);
    assert.equal(readAnswer(value), null, label);
  }

  /** @param {unknown} data A peer that answers every question with `data`. */
  const answering = (data) => http.createServer((request, response) => {
    /** @type {Buffer[]} */
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const incoming = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: incoming.id, result: { message: {
        messageId: 'reply-1', contextId: 'context-1', role: 'ROLE_AGENT', parts: [{ data, mediaType: 'application/json' }],
        metadata: { dudeA2a: { version: 1, replyTo: incoming.params.message.messageId } },
      } } }));
    });
  });
  const good = valid();
  const client = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: connectTo(answering(good)) });
  const { questionId, ...received } = await client.send('Does R2 pass?', { signal: new AbortController().signal });
  assert.deepEqual(received, good);
  assert.match(questionId, /^[0-9a-f-]{36}$/);
  for (const [label, mutate] of cases) {
    const bad = valid();
    mutate(bad);
    const tampered = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: connectTo(answering(bad)) });
    const error = await transportFailure(tampered.send('Does R2 pass?', { signal: new AbortController().signal }));
    assert.deepEqual([error.code, error.sent], ['invalid_reply', true], label);
  }
});

/**
 * Two real providers in one process, each approved through its chat
 * commands. B serves through its real Express and SDK app; A's real SDK
 * client reaches it over in-memory connections. Nothing listens: B's
 * listener is an unbound http.Server fed emitted connections, and closing it
 * destroys them as closeAllConnections() would. The test plays both models
 * by calling the registered tool handlers.
 * @param {{
 *   serve?: Record<string, unknown> | ((dirs: {bRoot: string, evidence: string, ownerB: string}) => Record<string, unknown>),
 *   ask?: Record<string, unknown>,
 *   commands?: (dirs: {bRoot: string}) => Record<string, unknown>,
 * }} [overrides]
 */
async function servicePair(overrides = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-a2a-pair-'));
  const aRoot = path.join(base, 'a-workspace');
  const bRoot = path.join(base, 'b-workspace');
  const evidence = path.join(bRoot, 'evidence');
  const ownerA = path.join(base, 'a-owner');
  const ownerB = path.join(base, 'b-owner');
  for (const directory of [aRoot, evidence, ownerA, ownerB]) fs.mkdirSync(directory, { recursive: true });
  for (const owner of [ownerA, ownerB]) {
    fs.writeFileSync(path.join(owner, 'cert.pem'), 'fixture certificate text, not a real certificate\n');
    fs.writeFileSync(path.join(owner, 'key.pem'), 'fixture key text, not a real key\n');
  }
  const configA = path.join(ownerA, 'a2a.json');
  const configB = path.join(ownerB, 'a2a.json');
  const serveExtra = typeof overrides.serve === 'function' ? overrides.serve({ bRoot, evidence, ownerB }) : overrides.serve ?? {};
  fs.writeFileSync(configB, JSON.stringify({ profiles: { 'b-serve': {
    role: 'serve',
    label: 'B (Mac)',
    workspace: bRoot,
    peer: { label: 'A (Windows)', address: '127.0.0.1', certSha256: pin(CLIENT_DER) },
    tls: { certFile: path.join(ownerB, 'cert.pem'), keyFile: path.join(ownerB, 'key.pem') },
    sharing: { allowed: 'Questions, conclusions, and excerpts about recorded test logs', excluded: 'Credentials and unrelated source', purpose: 'Confirm recorded test results' },
    contentBytes: 16_384,
    repeatUse: 'activation',
    listen: { address: '127.0.0.1', port: 18_443 },
    evidenceRoots: [evidence],
    ...serveExtra,
  } }, ...(overrides.commands ? { commands: overrides.commands({ bRoot }) } : {}) }));
  fs.writeFileSync(configA, JSON.stringify({ profiles: { 'a-ask': {
    role: 'ask',
    label: 'A (Windows)',
    workspace: aRoot,
    peer: { label: 'B (Mac)', address: '127.0.0.1', port: 18_443, certSha256: pin(SERVER_DER) },
    tls: { certFile: path.join(ownerA, 'cert.pem'), keyFile: path.join(ownerA, 'key.pem') },
    sharing: { allowed: 'Questions about recorded test results', excluded: 'Source code and credentials', purpose: 'Ask B to confirm recorded results' },
    contentBytes: 16_384,
    askTimeoutMs: 5_000,
    repeatUse: 'activation',
    ...overrides.ask,
  } } }));
  const clock = { now: NOW };
  /** @type {http.Server | null} */
  let listener = null;
  /** @type {Duplex[]} */
  const accepted = [];
  /** @type {Array<ReturnType<typeof duplexPair>>} */
  const connections = [];
  const connect = /** @type {any} */ (() => {
    const pair = duplexPair();
    connections.push(pair);
    asTls(pair.client, { raw: SERVER_DER });
    const serving = listener;
    if (!serving) {
      setImmediate(() => pair.client.destroy(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })));
      return pair.client;
    }
    accepted.push(pair.server);
    serving.emit('connection', asTls(pair.server));
    setImmediate(() => pair.client.emit('secureConnect'));
    return pair.client;
  });
  /**
   * @param {string} sessionId @param {string} root
   * @param {{startServer: typeof startServer, prepareClient: typeof prepareClient}} transport
   */
  const party = (sessionId, root, transport) => {
    /** @type {string[]} */
    const logs = [];
    /** @type {any[]} Native proposal results, separate from status logs. */
    const proposals = [];
    // With `hold`, each queued-input RPC waits until the test releases it with the items it reports.
    const queue = {
      items: /** @type {unknown[]} */ ([]),
      hold: false,
      /** @type {Array<(items: unknown[]) => void>} */
      held: [],
    };
    const provider = createA2a({ root, transport, now: () => clock.now, interfaces: /** @type {any} */ (LOOPBACK), timers: { set: () => () => undefined } });
    provider.bindSession(/** @type {any} */ ({
      sessionId,
      log: async (/** @type {string} */ message) => { logs.push(message); },
      rpc: { queue: { pendingItems: () => (queue.hold
        ? new Promise((resolve) => { queue.held.push((items) => resolve({ items, steeringMessages: [], inFlightSteeringCount: 0 })); })
        : Promise.resolve({ items: queue.items, steeringMessages: [], inFlightSteeringCount: 0 })) } },
    }));
    let calls = 0;
    return {
      logs,
      proposals,
      queue,
      /** @param {unknown} event */
      event: (event) => provider.onEvent(/** @type {any} */ (event)),
      /**
       * Call a registered tool as the host does and parse its result.
       * @param {string} name @param {unknown} args @param {{signal?: AbortSignal}} [options]
       * @returns {Promise<any>}
       */
      async call(name, args, options = {}) {
        const tool = provider.tools.find((entry) => entry.name === name);
        assert.ok(tool?.handler, `${name} is registered`);
        const result = /** @type {any} */ (await tool.handler(args, {
          sessionId, toolName: name, toolCallId: `${name}-${++calls}`, arguments: args, signal: options.signal ?? new AbortController().signal,
        }));
        if (name === 'dude_a2a_propose') {
          proposals.push(result);
          return result;
        }
        return { resultType: result.resultType, ...JSON.parse(result.textResultForLlm) };
      },
      /** @param {(line: string) => boolean} probe @param {string} label */
      async logLine(probe, label) {
        await waitFor(() => logs.some(probe), label);
        return String(logs.find(probe));
      },
    };
  };
  const b = party('session-B', bRoot, {
    startServer: /** @type {any} */ (async (/** @type {import('./lib/a2a-transport.mjs').ServeOptions} */ options) => {
      listener = http.createServer(createServeApp(runtime, options));
      return {
        url: endpointUrl(options.listen),
        close: async () => {
          listener = null;
          for (const socket of accepted) socket.destroy();
        },
      };
    }),
    prepareClient: /** @type {any} */ (() => assert.fail('B does not ask')),
  });
  const a = party('session-A', aRoot, {
    startServer: /** @type {any} */ (() => assert.fail('A does not listen')),
    prepareClient: (options) => prepareClient(options, { createSecureContext: acceptAnyPem, connect }),
  });
  for (const [side, configPath, profile] of /** @type {Array<[typeof a, string, string]>} */ ([[b, configB, 'b-serve'], [a, configA, 'a-ask']])) {
    const proposal = await side.call('dude_a2a_propose', { configPath, profileId: profile });
    assert.equal(proposal.resultType, 'success');
    const code = /approve ([0-9a-f]{12});/.exec(proposal.textResultForLlm)?.[1];
    assert.ok(code);
    side.event(rootMessage(`dude a2a approve ${code}`));
    assert.match(await side.logLine((line) => /^(?:Activation: active|A2A approval refused)/.test(line), `${profile} approval`), /^Activation: active/);
  }
  return {
    a,
    b,
    clock,
    connect,
    connections,
    dirs: { base, aRoot, bRoot, evidence, ownerA, ownerB, configA, configB },
    get listening() { return listener !== null; },
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}
/** @typedef {Awaited<ReturnType<typeof servicePair>>} Pair */

/**
 * B receives, A asks, and B's receive returns the admitted question.
 * @param {Pair} pair @param {string} question @param {{askSignal?: AbortSignal, receiveSignal?: AbortSignal}} [options]
 */
async function openExchange(pair, question, options = {}) {
  const waiting = pair.b.logs.filter((line) => line === WAITING).length;
  const received = pair.b.call('dude_a2a_receive', {}, { signal: options.receiveSignal });
  await waitFor(() => pair.b.logs.filter((line) => line === WAITING).length > waiting, 'B waiting');
  const asked = pair.a.call('dude_a2a_ask', { question }, { signal: options.askSignal });
  const admitted = await received;
  assert.equal(admitted.outcome, 'question', JSON.stringify(admitted));
  return { admitted, asked };
}

/** @param {Pair} pair @param {string} exchangeId @param {Record<string, unknown>} [extra] */
const replyFrom = (pair, exchangeId, extra = {}) => pair.b.call('dude_a2a_reply', {
  exchangeId, conclusion: 'R2 passes according to its recorded log.', limitations: 'The log was not rerun.', evidence: [], ...extra,
});

/**
 * Independently seeded US1 evidence with an old filesystem mtime: a current
 * run, an older conflicting run, and a third-party note.
 * @param {string} evidence
 */
function seedEvidence(evidence) {
  const files = {
    current: path.join(evidence, 'runs', 'r2-linux.log'),
    older: path.join(evidence, 'runs', 'r1-windows.log'),
    vendor: path.join(evidence, 'notes', 'vendor-report.md'),
  };
  fs.mkdirSync(path.dirname(files.current), { recursive: true });
  fs.mkdirSync(path.dirname(files.vendor), { recursive: true });
  fs.writeFileSync(files.current, ['revision: R2', 'environment: linux-x64, node 24', 'command: npm test', 'recorded: 2026-09-20T10:00:00Z', 'result: 412 passed, 0 failed', ''].join('\n'));
  fs.writeFileSync(files.older, ['revision: R1', 'environment: windows-x64, node 22', 'command: npm test', 'recorded: 2026-09-01T09:00:00Z', 'result: 409 passed, 3 failed', ''].join('\n'));
  fs.writeFileSync(files.vendor, 'Vendor report (third party, not reproduced here): claim X holds on R2.\n');
  for (const file of Object.values(files)) fs.utimesSync(file, OLD_MTIME, OLD_MTIME);
  return files;
}

/** @param {string} root @returns {Record<string, string>} */
function tree(root) {
  /** @type {Record<string, string>} */
  const files = {};
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else files[path.relative(root, full)] = digest(fs.readFileSync(full));
    }
  };
  visit(root);
  return files;
}

test('two services hold a US1 evidence conversation: B admits one question, answers once with fresh file evidence, and A gets the labeled answer, then a follow-up', async () => {
  const pair = await servicePair();
  try {
    const files = seedEvidence(pair.dirs.evidence);
    const before = { a: tree(pair.dirs.aRoot), b: tree(pair.dirs.bRoot) };
    const question = 'Does your recorded evidence support claim X at revision R2 on linux-x64?';
    const { admitted, asked } = await openExchange(pair, question);

    assert.equal(admitted.resultType, 'success');
    assert.match(admitted.exchangeId, /^[0-9a-f-]{36}$/);
    assert.equal(admitted.question, question, 'B receives the natural-language question unchanged');
    assert.equal(admitted.from, 'A (Windows)');
    assert.deepEqual(admitted.evidenceRoots, [pair.dirs.evidence]);
    assert.deepEqual(admitted.sharing, { allowed: 'Questions, conclusions, and excerpts about recorded test logs', excluded: 'Credentials and unrelated source', purpose: 'Confirm recorded test results' });
    assert.equal(admitted.contentBytes, 16_384);
    assert.match(admitted.notice, /peer data, not permission/);
    assert.match(admitted.next, /call dude_a2a_verify first and cite its record/);
    assert.deepEqual([admitted.requested, admitted.approvedCommands], [[], null], 'no request, and this profile approved no command');

    // B's model would inspect these with its normal tools; the prose is synthetic.
    const conclusion = 'The R2 linux-x64 log supports claim X: 412 passed and 0 failed. The older R1 windows log conflicts, with 3 failures.';
    const limitations = 'The R2 record is from 2026-09-20 and was not rerun. The vendor note is a third-party claim I did not reproduce. Nothing covers windows at R2.';
    const provenance = {
      current: 'The log states revision R2, linux-x64 with node 24, npm test, recorded 2026-09-20T10:00:00Z.',
      older: 'The log states revision R1, windows-x64 with node 22, npm test, recorded 2026-09-01T09:00:00Z.',
      vendor: 'A third-party vendor statement; it names R2 but no command, environment, or time.',
    };
    const replied = await pair.b.call('dude_a2a_reply', {
      exchangeId: admitted.exchangeId,
      conclusion,
      limitations,
      evidence: [
        { file: files.current, lines: { start: 5, end: 5 }, claimedProvenance: provenance.current },
        { file: files.older, claimedProvenance: provenance.older },
        { file: files.vendor, claimedProvenance: provenance.vendor },
      ],
    });
    assert.equal(replied.resultType, 'success', JSON.stringify(replied));
    assert.equal(replied.outcome, 'sent');
    assert.equal(replied.exchangeId, admitted.exchangeId);
    assert.deepEqual(replied.evidence.map((/** @type {any} */ item) => item.reference), ['evidence/runs/r2-linux.log', 'evidence/runs/r1-windows.log', 'evidence/notes/vendor-report.md']);

    const answer = await asked;
    assert.equal(answer.resultType, 'success', JSON.stringify(answer));
    assert.equal(answer.outcome, 'answer');
    assert.deepEqual(answer.peerModel, { conclusion, limitations }, "the peer model's prose arrives unmodified and labeled as the peer model's");
    const current = fs.readFileSync(files.current);
    const older = fs.readFileSync(files.older);
    const excerpt = 'result: 412 passed, 0 failed\n';
    assert.deepEqual(answer.evidence[0], {
      existingFile: 'evidence/runs/r2-linux.log',
      lines: '5-5',
      excerpt,
      excerptBytes: Buffer.byteLength(excerpt),
      excerptSha256: digest(excerpt),
      fileAtRead: { bytes: current.length, sha256: digest(current) },
      readTime: '2026-09-23T16:00:00.000Z',
      filesystemMtime: OLD_MTIME.toISOString(),
      claimedProvenance: provenance.current,
    }, 'read time, filesystem mtime, and the log-claimed time stay distinct');
    assert.deepEqual(answer.evidence[1], {
      existingFile: 'evidence/runs/r1-windows.log',
      lines: 'whole file',
      excerpt: older.toString('utf8'),
      excerptBytes: older.length,
      excerptSha256: digest(older),
      fileAtRead: { bytes: older.length, sha256: digest(older) },
      readTime: '2026-09-23T16:00:00.000Z',
      filesystemMtime: OLD_MTIME.toISOString(),
      claimedProvenance: provenance.older,
    });
    assert.equal(answer.evidence[2].claimedProvenance, provenance.vendor, 'the third-party claim stays identifiable');
    assert.equal(answer.evidenceNotes.length, 4);
    assert.equal(answer.freshVerification, 'no run record supplied; execution unknown', 'no record was supplied, so A cannot say whether B ran anything');
    assert.equal(answer.adapter.outcome, 'answer');
    assert.deepEqual(answer.adapter.peer, { label: 'B (Mac)', endpoint: 'https://127.0.0.1:18443/', certSha256: pin(SERVER_DER) });
    assert.equal(answer.adapter.exchange.peerExchange, admitted.exchangeId);
    assert.match(answer.adapter.exchange.question, /^[0-9a-f-]{36}$/);
    assert.ok(answer.adapter.checks.includes(EXCERPT_CHECK));
    assert.equal(answer.notice, ANSWER_NOTICE);
    assert.match(answer.next, /not verification, approval, or task closure/);

    assert.ok(pair.b.logs.includes(WAITING));
    assert.ok(pair.b.logs.includes(`Status: admitted; ${admitted.exchangeId}`));
    assert.ok(pair.b.logs.includes(`Status: reply sent; ${admitted.exchangeId}`));
    assert.ok(pair.a.logs.includes('Status: waiting for reply'));
    assert.equal([...pair.a.logs, ...pair.b.logs].some((line) => line.includes('claim X') || line.includes('412 passed')), false,
      'logs carry metadata only, never the question, answer, or evidence text');

    // A follow-up under the same approvals: a fresh receive, no new prompt.
    const followUp = await openExchange(pair, 'Is there any recorded result for revision R3?');
    assert.notEqual(followUp.admitted.exchangeId, admitted.exchangeId);
    const none = await replyFrom(pair, followUp.admitted.exchangeId, {
      conclusion: 'I cannot confirm anything about R3.',
      limitations: 'The approved evidence has no recorded result for R3, and no fresh run was made.',
    });
    assert.equal(none.outcome, 'sent');
    const second = await followUp.asked;
    assert.equal(second.outcome, 'answer');
    assert.deepEqual(second.evidence, [], 'missing evidence is explicit, not invented');
    assert.equal(second.freshVerification, 'no run record supplied; execution unknown');
    assert.equal(second.adapter.checks.includes(EXCERPT_CHECK), false);
    assert.equal(pair.b.proposals.length, 1, 'the follow-up needed no new proposal or approval');
    assert.deepEqual({ a: tree(pair.dirs.aRoot), b: tree(pair.dirs.bRoot) }, before, 'communication wrote nothing to either workspace');
  } finally {
    pair.cleanup();
  }
});

test('a reply is measured as encoded: one byte over contentBytes is refused before any write with the exchange still open, and an exact fit is sent whole', async () => {
  const pair = await servicePair({ serve: { contentBytes: 1024 } });
  try {
    const { admitted, asked } = await openExchange(pair, 'q?');
    const reply = (/** @type {string} */ conclusion) => replyFrom(pair, admitted.exchangeId, { conclusion, limitations: 'none checked' });
    const probe = await reply('x'.repeat(2000));
    assert.deepEqual([probe.outcome, probe.reason, probe.exchangeOpen, probe.limit], ['refused', 'reply_too_large', true, 1024]);
    const overhead = probe.bytes - 2000;
    const over = await reply('x'.repeat(1024 - overhead + 1));
    assert.deepEqual([over.outcome, over.reason, over.bytes, over.exchangeOpen], ['refused', 'reply_too_large', 1025, true]);
    assert.equal(pair.connections[0].written[1], 0, 'B wrote no response byte while refusing');
    const fit = await reply('x'.repeat(1024 - overhead));
    assert.deepEqual([fit.outcome, fit.bytes], ['sent', 1024]);
    const answer = await asked;
    assert.equal(answer.outcome, 'answer', 'the exact fit was not withheld, so the written body did not exceed the measure');
    assert.equal(answer.peerModel.conclusion.length, 1024 - overhead);
  } finally {
    pair.cleanup();
  }
});

test('availability is truthful: no waiter and busy are unavailable, receives never stack, and only admission turns a receive into an exchange that outlives its call', async () => {
  const pair = await servicePair();
  try {
    const idle = await pair.a.call('dude_a2a_ask', { question: 'Anyone there?' });
    assert.deepEqual([idle.outcome, idle.reason, idle.delivery], ['unavailable', 'no_live_receive', 'reached_peer']);
    assert.ok(pair.b.logs.includes('A2A answered a question from A (Windows) unavailable: no receive was waiting in this session. The question was not shown to the model.'));

    const cancelled = new AbortController();
    const cancelledReceive = pair.b.call('dude_a2a_receive', {}, { signal: cancelled.signal });
    await waitFor(() => pair.b.logs.includes(WAITING), 'first receive waiting');
    const stacked = await pair.b.call('dude_a2a_receive', {});
    assert.deepEqual([stacked.outcome, stacked.reason], ['refused', 'receive_in_progress']);
    cancelled.abort();
    const gone = await cancelledReceive;
    assert.deepEqual([gone.resultType, gone.outcome, gone.reason], ['failure', 'cancelled', 'invocation_cancelled']);
    assert.ok(pair.b.logs.includes('Status: not waiting; the receive call was cancelled before a question arrived'));
    assert.equal((await pair.a.call('dude_a2a_ask', { question: 'Still there?' })).reason, 'no_live_receive', 'a cancelled receive admitted nothing');

    const receiveSignal = new AbortController();
    const { admitted, asked } = await openExchange(pair, 'Does R2 pass?', { receiveSignal: receiveSignal.signal });
    receiveSignal.abort();
    const busyReceive = await pair.b.call('dude_a2a_receive', {});
    assert.deepEqual([busyReceive.outcome, busyReceive.reason, busyReceive.exchangeId], ['refused', 'exchange_in_progress', admitted.exchangeId]);
    const other = await prepareClient(askOptions(), { createSecureContext: acceptAnyPem, connect: pair.connect });
    const { questionId, ...busy } = await other.send('Me too?', { signal: new AbortController().signal });
    assert.deepEqual(busy, { outcome: 'unavailable', reason: 'busy' }, 'a second authenticated question is refused, not queued');
    const sent = await replyFrom(pair, admitted.exchangeId);
    assert.equal(sent.outcome, 'sent', 'the receive signal aborting after normal completion did not cancel the exchange');
    assert.equal((await asked).outcome, 'answer');
  } finally {
    pair.cleanup();
  }
});

test('evidence must be a fresh regular file inside an approved root: unsafe, owner, linked, oversized, binary, missing, and out-of-range citations are refused without reaching A', async (context) => {
  const pair = await servicePair({ serve: ({ evidence, ownerB }) => ({ evidenceRoots: [evidence, ownerB] }) });
  try {
    const files = seedEvidence(pair.dirs.evidence);
    const secret = path.join(pair.dirs.bRoot, 'secret.txt');
    fs.writeFileSync(secret, 'workspace secret outside every evidence root\n');
    const hard = path.join(pair.dirs.evidence, 'hard.log');
    fs.writeFileSync(hard, 'hard-linked content\n');
    fs.linkSync(hard, path.join(pair.dirs.evidence, 'hard-alias.log'));
    const big = path.join(pair.dirs.evidence, 'big.log');
    fs.writeFileSync(big, Buffer.alloc(1024 * 1024 + 1, 0x61));
    const binary = path.join(pair.dirs.evidence, 'blob.bin');
    fs.writeFileSync(binary, Buffer.from([0xc3, 0x28, 0x0a]));
    /** @type {Array<[string, Record<string, unknown>]>} */
    const refusals = [
      ['outside_evidence_roots', { file: secret }],
      ['outside_evidence_roots', { file: path.join(pair.dirs.evidence, '..', 'secret.txt') }],
      ['owner_file', { file: path.join(pair.dirs.ownerB, 'key.pem') }],
      ['owner_file', { file: pair.dirs.configB }],
      ['linked_file', { file: hard }],
      ['not_regular_file', { file: path.join(pair.dirs.evidence, 'runs') }],
      ['evidence_unavailable', { file: path.join(pair.dirs.evidence, 'missing.log') }],
      ['evidence_too_large', { file: big }],
      ['evidence_not_text', { file: binary }],
      ['lines_out_of_range', { file: files.current, lines: { start: 6, end: 6 } }],
    ];
    const outside = path.join(pair.dirs.base, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'elsewhere.txt'), 'workspace secret reached through a link\n');
    try {
      fs.symlinkSync(secret, path.join(pair.dirs.evidence, 'linked.log'), 'file');
      refusals.push(['unsafe_path', { file: path.join(pair.dirs.evidence, 'linked.log') }]);
      fs.symlinkSync(outside, path.join(pair.dirs.evidence, 'linked-dir'), 'junction');
      refusals.push(['unsafe_path', { file: path.join(pair.dirs.evidence, 'linked-dir', 'elsewhere.txt') }]);
    } catch (error) {
      context.diagnostic(`symbolic link cases not run: ${/** @type {Error} */ (error).message}`);
    }
    const { admitted, asked } = await openExchange(pair, 'Show me what you have.');
    let answered = false;
    void asked.then(() => { answered = true; });
    /** @type {any[]} */
    const results = [];
    for (const [reason, item] of refusals) {
      const refused = await replyFrom(pair, admitted.exchangeId, { evidence: [{ claimedProvenance: 'missing', ...item }] });
      results.push(refused);
      assert.deepEqual([refused.outcome, refused.reason, refused.exchangeOpen, refused.evidence], ['refused', reason, true, 'evidence[0]'], `${reason}: ${String(item.file)}`);
    }
    const invalid = /** @type {Array<[string, Record<string, unknown>]>} */ ([
      ['evidence[0].file', { evidence: [{ file: 'runs/r2-linux.log', claimedProvenance: 'missing' }] }],
      ['evidence[0].lines', { evidence: [{ file: files.current, lines: { start: 0, end: 1 }, claimedProvenance: 'missing' }] }],
      ['evidence[0].lines', { evidence: [{ file: files.current, lines: { start: 3, end: 2 }, claimedProvenance: 'missing' }] }],
      ['evidence[0].lines', { evidence: [{ file: files.current, lines: { start: 1.5, end: 2 }, claimedProvenance: 'missing' }] }],
      ['evidence[0].lines', { evidence: [{ file: files.current, lines: { start: 1, end: 2, all: true }, claimedProvenance: 'missing' }] }],
      ['evidence[0].claimedProvenance', { evidence: [{ file: files.current }] }],
      ['evidence[0]', { evidence: [{ file: files.current, claimedProvenance: 'missing', approved: true }] }],
      ['arguments', { approved: true }],
      ['conclusion', { conclusion: '' }],
      ['limitations', { limitations: 'bell\u0007' }],
    ]);
    for (const [field, extra] of invalid) {
      const refused = await replyFrom(pair, admitted.exchangeId, extra);
      results.push(refused);
      assert.deepEqual([refused.outcome, refused.reason, refused.field, refused.exchangeOpen], ['refused', 'invalid_arguments', field, true], field);
    }
    assert.equal(answered, false, 'no refusal reached A');
    assert.equal(pair.connections.at(-1)?.written[1], 0, 'B wrote no response byte for any refusal');

    const sent = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: files.current, lines: { start: 1, end: 1 }, claimedProvenance: 'revision R2' }] });
    assert.equal(sent.outcome, 'sent');
    const answer = await asked;
    assert.deepEqual(answer.evidence.map((/** @type {any} */ item) => [item.existingFile, item.excerpt]), [['evidence/runs/r2-linux.log', 'revision: R2\n']]);
    const shown = JSON.stringify([results, answer, pair.a.logs, pair.b.logs]);
    for (const secretText of ['workspace secret', 'fixture key text', 'hard-linked content', pair.dirs.ownerB]) {
      assert.equal(shown.includes(secretText), false, `nothing reveals ${secretText}`);
    }
  } finally {
    pair.cleanup();
  }
});

test('evidence is read fresh at reply time: a file changed after the question attaches its current bytes, and a removed file is refused, never served stale', async () => {
  const pair = await servicePair();
  try {
    const files = seedEvidence(pair.dirs.evidence);
    const { admitted, asked } = await openExchange(pair, 'What does the R2 run say now?');
    fs.writeFileSync(files.current, 'revision: R2\nresult: rerun by hand, 411 passed, 1 failed\n');
    fs.rmSync(files.older);
    const gone = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: files.older, claimedProvenance: 'revision R1' }] });
    assert.deepEqual([gone.reason, gone.exchangeOpen, gone.evidence], ['evidence_unavailable', true, 'evidence[0]']);
    const sent = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: files.current, claimedProvenance: 'revision R2; the file states no time' }] });
    assert.equal(sent.outcome, 'sent');
    const answer = await asked;
    const now = fs.readFileSync(files.current);
    assert.equal(answer.evidence[0].excerpt, now.toString('utf8'));
    assert.equal(answer.evidence[0].excerptSha256, digest(now));
    assert.notEqual(answer.evidence[0].filesystemMtime, OLD_MTIME.toISOString(), 'the filesystem mtime is the observed one');
  } finally {
    pair.cleanup();
  }
});

test('a reply is one-shot and bound to the current exchange: wrong-ID, repeated, and late replies are refused and never delivered', async () => {
  const pair = await servicePair();
  try {
    const { admitted, asked } = await openExchange(pair, 'Does R2 pass?');
    const wrong = await replyFrom(pair, randomUUID());
    assert.deepEqual([wrong.outcome, wrong.reason, wrong.exchangeOpen], ['refused', 'exchange_not_current', false]);
    assert.equal((await replyFrom(pair, admitted.exchangeId)).outcome, 'sent');
    assert.equal((await asked).outcome, 'answer');
    const repeated = await replyFrom(pair, admitted.exchangeId, { conclusion: 'A second opinion.' });
    assert.deepEqual([repeated.outcome, repeated.reason], ['refused', 'exchange_not_current']);

    const next = await openExchange(pair, 'And R3?');
    pair.b.event(rootMessage('dude a2a stop'));
    await pair.b.logLine((line) => line.startsWith('A2A activation ended: stopped'), 'stop');
    const late = await replyFrom(pair, next.admitted.exchangeId);
    assert.deepEqual([late.outcome, late.reason], ['refused', 'no_activation']);
    const lost = await next.asked;
    assert.deepEqual([lost.outcome, lost.reason, lost.delivery], ['uncertain', 'connection_lost', 'may_have_occurred']);
  } finally {
    pair.cleanup();
  }
});

test('root abort, new root input, and queued input end a waiting receive or an admitted exchange; the asker gets unavailable and the reply is withheld', async () => {
  const interruptions = /** @type {Array<[string, (pair: Pair) => void, string, string]>} */ ([
    ['root abort', (pair) => pair.b.event({ type: 'abort', data: { reason: 'user initiated' } }), 'root_abort', 'the session turn was aborted'],
    ['new root input', (pair) => pair.b.event(rootMessage('Stop that and summarize the README instead.')), 'new_input', 'new root input arrived in this session'],
    ['queued input', (pair) => {
      pair.b.queue.items = [{ id: 'opaque' }];
      pair.b.event({ type: 'pending_messages.modified', data: {} });
    }, 'input_pending', 'other input is queued in this session'],
  ]);
  for (const [label, interrupt, reason, text] of interruptions) {
    const early = await servicePair();
    try {
      const receiving = early.b.call('dude_a2a_receive', {});
      await waitFor(() => early.b.logs.includes(WAITING), `${label}: waiting`);
      interrupt(early);
      const ended = await receiving;
      assert.deepEqual([ended.resultType, ended.outcome, ended.reason], ['failure', 'ended', reason], label);
      assert.ok(early.b.logs.includes(`A2A receive ended: ${text}.\nStatus: not waiting; peer questions get unavailable until the next receive`), label);
      const asked = await early.a.call('dude_a2a_ask', { question: 'Anyone there?' });
      assert.deepEqual([asked.outcome, asked.reason], ['unavailable', 'no_live_receive'], `${label}: nothing was queued`);
    } finally {
      early.cleanup();
    }
    const late = await servicePair();
    try {
      const { admitted, asked } = await openExchange(late, 'Does R2 pass?');
      interrupt(late);
      const answer = await asked;
      assert.deepEqual([answer.outcome, answer.reason, answer.delivery], ['unavailable', 'exchange_ended', 'reached_peer'], label);
      assert.equal(await late.b.logLine((line) => line.startsWith('A2A exchange ended:'), `${label}: notice`), [
        `A2A exchange ended: ${text}; the peer gets unavailable, any unsent reply is withheld, and late replies are rejected.`,
        `Exchange: ${admitted.exchangeId}`,
      ].join('\n'));
      const refused = await replyFrom(late, admitted.exchangeId);
      assert.deepEqual([refused.outcome, refused.reason, refused.exchangeOpen], ['refused', 'exchange_not_current', false], label);
      assert.equal(late.b.logs.some((line) => line.startsWith('A2A activation ended')), false, `${label}: the activation stays`);
    } finally {
      late.cleanup();
    }
  }
});

test('subagent, autopilot, and attributed messages and an empty queue change do not end an admitted exchange', async () => {
  const pair = await servicePair();
  try {
    const { admitted, asked } = await openExchange(pair, 'Does R2 pass?');
    pair.b.event(rootMessage('subagent chatter', {}, { agentId: 'subagent-1' }));
    pair.b.event(rootMessage('autopilot continues', { isAutopilotContinuation: true }));
    pair.b.event(rootMessage('autopilot mode', { agentMode: 'autopilot' }));
    pair.b.event(rootMessage('scheduled prompt', { source: 'schedule' }));
    pair.b.event({ type: 'abort', agentId: 'subagent-1', data: { reason: 'subagent turn' } });
    pair.b.event({ type: 'pending_messages.modified', data: {} });
    for (let index = 0; index < 20; index += 1) await tick();
    assert.equal(pair.b.logs.some((line) => line.startsWith('A2A exchange ended')), false);
    assert.equal((await replyFrom(pair, admitted.exchangeId)).outcome, 'sent');
    assert.equal((await asked).outcome, 'answer');
  } finally {
    pair.cleanup();
  }
});

test('stop, a workspace change, or shutdown withdraws an admitted exchange without writing, so the asker reports uncertain delivery; a waiting receive ends and later asks find no listener', async () => {
  const ends = /** @type {Array<[string, (pair: Pair) => void, string, string]>} */ ([
    ['stop', (pair) => pair.b.event(rootMessage('dude a2a stop')), 'stopped by dude a2a stop', 'no_activation'],
    ['workspace change', (pair) => pair.b.event({ type: 'session.context_changed', data: { cwd: pair.dirs.ownerB } }), 'the session workspace changed', 'workspace_changed'],
    ['shutdown', (pair) => pair.b.event({ type: 'session.shutdown', data: {} }), 'the session shut down', 'provider_unavailable'],
  ]);
  for (const [label, finish, text, replyReason] of ends) {
    const early = await servicePair();
    try {
      const receiving = early.b.call('dude_a2a_receive', {});
      await waitFor(() => early.b.logs.includes(WAITING), `${label}: waiting`);
      finish(early);
      const ended = await receiving;
      assert.deepEqual([ended.outcome, ended.reason], ['ended', 'activation_ended'], label);
      await waitFor(() => !early.listening, `${label}: listener closed`);
      const asked = await early.a.call('dude_a2a_ask', { question: 'Anyone there?' });
      assert.deepEqual([asked.outcome, asked.reason, asked.delivery], ['unavailable', 'peer_unreachable', 'not_sent'], label);
    } finally {
      early.cleanup();
    }
    const late = await servicePair();
    try {
      const { admitted, asked } = await openExchange(late, 'Does R2 pass?');
      finish(late);
      const answer = await asked;
      assert.deepEqual([answer.outcome, answer.reason, answer.delivery], ['uncertain', 'connection_lost', 'may_have_occurred'], label);
      assert.equal(await late.b.logLine((line) => line.startsWith('A2A activation ended:'), `${label}: notice`), [
        `A2A activation ended: ${text}.`,
        'Activation: inactive',
        'Communication: ended; listener closed; any unsent reply is withheld and late replies are rejected',
      ].join('\n'));
      const refused = await replyFrom(late, admitted.exchangeId);
      assert.deepEqual([refused.outcome, refused.reason], ['refused', replyReason], label);
      assert.equal(late.connections.at(-1)?.written[1], 0, `${label}: B wrote no reply byte`);
    } finally {
      late.cleanup();
    }
  }
});

test('sharing revocation, a rotated TLS key, or expiry ends the activation at the next check: a waiting receive admits nothing, and an answer is withheld at the last reply boundary', async () => {
  const changed = 'the configuration, TLS files, session, or workspace no longer match the approval';
  const cases = /** @type {Array<[string, (pair: Pair) => void, string]>} */ ([
    ['sharing revoked', (pair) => editJson(pair.dirs.configB, (document) => { document.profiles['b-serve'].sharing.allowed = 'Nothing may be shared'; }), changed],
    ['TLS key rotated', (pair) => fs.writeFileSync(path.join(pair.dirs.ownerB, 'key.pem'), 'rotated fixture key\n'), changed],
    ['validity passed', (pair) => { pair.clock.now = Date.parse('2026-09-23T17:00:01Z'); }, 'its validity ended'],
  ]);
  for (const [label, drift, text] of cases) {
    const early = await servicePair({ serve: { expiresAt: '2026-09-23T17:00:00Z' } });
    try {
      const receiving = early.b.call('dude_a2a_receive', {});
      await waitFor(() => early.b.logs.includes(WAITING), `${label}: waiting`);
      drift(early);
      const asked = await early.a.call('dude_a2a_ask', { question: 'Does R2 pass?' });
      assert.deepEqual([asked.outcome, asked.reason, asked.delivery], ['refused', 'peer_refused', 'reached_peer'], `${label}: refused before admission`);
      const ended = await receiving;
      assert.deepEqual([ended.outcome, ended.reason], ['ended', 'activation_ended'], label);
    } finally {
      early.cleanup();
    }
    const late = await servicePair({ serve: { expiresAt: '2026-09-23T17:00:00Z' } });
    try {
      const files = seedEvidence(late.dirs.evidence);
      const { admitted, asked } = await openExchange(late, 'Does R2 pass?');
      drift(late);
      const refused = await replyFrom(late, admitted.exchangeId, { evidence: [{ file: files.current, claimedProvenance: 'revision R2' }] });
      assert.deepEqual([refused.outcome, refused.reason, refused.exchangeOpen], ['refused', 'activation_ended', false], label);
      const answer = await asked;
      assert.deepEqual([answer.outcome, answer.reason, answer.delivery], ['uncertain', 'connection_lost', 'may_have_occurred'], label);
      assert.equal(JSON.stringify(answer).includes('412 passed'), false, `${label}: no evidence left B`);
      assert.equal(await late.b.logLine((line) => line.startsWith('A2A activation ended:'), `${label}: notice`), [
        `A2A activation ended: ${text}.`,
        'Activation: inactive',
        'Communication: ended; listener closed; any unsent reply is withheld and late replies are rejected',
      ].join('\n'));
    } finally {
      late.cleanup();
    }
  }
});

test('client loss ends B\'s exchange: an aborted, timed-out, or interrupted ask reports uncertain delivery, and B\'s later reply is refused', async () => {
  const cases = /** @type {Array<[string, Parameters<typeof servicePair>[0], (pair: Pair, controller: AbortController) => void, string]>} */ ([
    ['aborted ask', {}, (_pair, controller) => controller.abort(), 'cancelled'],
    ['ask timeout', { ask: { askTimeoutMs: 200 } }, () => undefined, 'timeout'],
    ['new root input on A', {}, (pair) => pair.a.event(rootMessage('Actually, never mind.')), 'new_input'],
    ['root abort on A', {}, (pair) => pair.a.event({ type: 'abort', data: { reason: 'user initiated' } }), 'root_abort'],
  ]);
  for (const [label, overrides, lose, reason] of cases) {
    const pair = await servicePair(overrides);
    try {
      const controller = new AbortController();
      const { admitted, asked } = await openExchange(pair, 'Does R2 pass?', { askSignal: controller.signal });
      lose(pair, controller);
      const answer = await asked;
      assert.deepEqual([answer.outcome, answer.reason, answer.delivery], ['uncertain', reason, 'may_have_occurred'], label);
      await pair.b.logLine((line) => line.startsWith('A2A exchange ended: the asking side disconnected'), `${label}: B observed the loss`);
      const refused = await replyFrom(pair, admitted.exchangeId);
      assert.deepEqual([refused.outcome, refused.reason], ['refused', 'exchange_not_current'], label);
    } finally {
      pair.cleanup();
    }
  }
});

test('an answer reaches only a still-current asking activation: a sharing change on A while waiting withholds it', async () => {
  const pair = await servicePair();
  try {
    const { admitted, asked } = await openExchange(pair, 'Does R2 pass?');
    editJson(pair.dirs.configA, (document) => { document.profiles['a-ask'].sharing.allowed = 'Questions about anything'; });
    assert.equal((await replyFrom(pair, admitted.exchangeId)).outcome, 'sent', 'B answered its current exchange');
    const withheld = await asked;
    assert.deepEqual([withheld.resultType, withheld.outcome, withheld.reason, withheld.delivery], ['failure', 'cancelled', 'activation_ended', 'reached_peer']);
    assert.equal(JSON.stringify(withheld).includes('R2 passes'), false, 'the answer text was not delivered');
    await pair.a.logLine((line) => line.startsWith('A2A activation ended:'), 'A ended on its own drift');
  } finally {
    pair.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Review findings: held queued-input RPCs, persistent parent substitution,
// the aggregate source budget, and changes during the read. The seams below
// hold a real RPC or make a real filesystem change at a named step and then
// defer to the real call; they never decide a guard's result.

/** Resolve the oldest held queued-input check with `items`. @param {{held: Array<(items: unknown[]) => void>}} queue @param {unknown[]} [items] */
function releaseCheck(queue, items = []) {
  const next = queue.held.shift();
  assert.ok(next, 'a queued-input check is held');
  next(items);
}

/**
 * Observe a promise's settlement without awaiting it.
 * @param {Promise<any>} promise
 */
function watch(promise) {
  const state = { settled: false, value: /** @type {any} */ (undefined) };
  void promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

/** @param {Pair} pair A final stop releases any waiter a failing assertion left behind. */
function stopAndRelease(pair) {
  for (const side of [pair.a, pair.b]) {
    side.queue.hold = false;
    for (const release of side.queue.held.splice(0)) release([]);
  }
  pair.b.event(rootMessage('dude a2a stop'));
  pair.a.event(rootMessage('dude a2a stop'));
}

/**
 * Run `mutate` once, just before the first read from an open descriptor of
 * `target`, then read through the real fs.readSync.
 * @param {string} target @param {() => void} mutate
 */
function duringRead(target, mutate) {
  const original = fs.readSync;
  const { dev, ino } = fs.statSync(target);
  let fired = false;
  fs.readSync = /** @type {any} */ (function readSync(/** @type {number} */ fd, /** @type {any[]} */ ...rest) {
    if (!fired) {
      const opened = fs.fstatSync(fd);
      if (opened.dev === dev && opened.ino === ino) {
        fired = true;
        mutate();
      }
    }
    return Reflect.apply(original, fs, [fd, ...rest]);
  });
  return { get fired() { return fired; }, restore: () => { fs.readSync = original; } };
}

/**
 * Run `swap` once, right after path validation resolved `leaf` (its realpath
 * call), before the next filesystem step.
 * @param {string} leaf @param {() => void} swap
 */
function afterPathValidation(leaf, swap) {
  const original = fs.realpathSync;
  let fired = false;
  const wrapped = /** @type {any} */ (function realpathSync(/** @type {any} */ target, /** @type {any[]} */ ...rest) {
    const result = Reflect.apply(original, fs, [target, ...rest]);
    if (!fired && typeof target === 'string' && path.resolve(target) === path.resolve(leaf)) {
      fired = true;
      swap();
    }
    return result;
  });
  wrapped.native = original.native;
  fs.realpathSync = wrapped;
  return { get fired() { return fired; }, restore: () => { fs.realpathSync = original; } };
}

/** Count opens of `target`. @param {string} target */
function openCounter(target) {
  const original = fs.openSync;
  let opens = 0;
  fs.openSync = /** @type {any} */ (function openSync(/** @type {any} */ file, /** @type {any[]} */ ...rest) {
    if (typeof file === 'string' && path.resolve(file) === path.resolve(target)) opens += 1;
    return Reflect.apply(original, fs, [file, ...rest]);
  });
  return { get opens() { return opens; }, restore: () => { fs.openSync = original; } };
}

/** A file of exactly `bytes` bytes in 100-byte numbered lines. @param {string} file @param {number} bytes */
function sizedFile(file, bytes) {
  let text = '';
  for (let line = 1; text.length + 100 <= bytes; line += 1) text += `${String(line).padStart(4, '0')} ${'x'.repeat(94)}\n`;
  fs.writeFileSync(file, text + 'y'.repeat(bytes - text.length));
  assert.equal(fs.statSync(file).size, bytes);
}

test('root abort or new root input during the receive preflight ends that receive while its signal stays live', async () => {
  const cases = /** @type {Array<[string, (pair: Pair) => void, string]>} */ ([
    ['root abort', (pair) => pair.b.event({ type: 'abort', data: { reason: 'user initiated' } }), 'root_abort'],
    ['new root input', (pair) => pair.b.event(rootMessage('Do something else first.')), 'new_input'],
  ]);
  for (const [label, interrupt, reason] of cases) {
    const pair = await servicePair();
    try {
      pair.b.queue.hold = true;
      const receiving = watch(pair.b.call('dude_a2a_receive', {}));
      await waitFor(() => pair.b.queue.held.length === 1, `${label}: preflight check held`);
      assert.equal(pair.b.logs.includes(WAITING), false, `${label}: not waiting before the preflight resolves`);
      const early = await pair.a.call('dude_a2a_ask', { question: 'Is anyone there yet?' });
      assert.deepEqual([early.outcome, early.reason], ['unavailable', 'no_live_receive'], `${label}: nothing is admitted during the preflight`);
      interrupt(pair);
      await waitFor(() => receiving.settled, `${label}: the receive ended during its preflight`);
      assert.deepEqual([receiving.value.outcome, receiving.value.reason], ['ended', reason], label);
      releaseCheck(pair.b.queue);
      for (let index = 0; index < 10; index += 1) await tick();
      assert.equal(pair.b.logs.includes(WAITING), false, `${label}: the stale empty result starts no waiter`);
      pair.b.queue.hold = false;
      const asked = await pair.a.call('dude_a2a_ask', { question: 'Anyone there?' });
      assert.deepEqual([asked.outcome, asked.reason], ['unavailable', 'no_live_receive'], label);
    } finally {
      stopAndRelease(pair);
      pair.cleanup();
    }
  }
});

test('a queued-input check follows its receive into the admitted exchange, and a positive result ends that exchange', async () => {
  const pair = await servicePair();
  try {
    const receiving = pair.b.call('dude_a2a_receive', {});
    await waitFor(() => pair.b.logs.includes(WAITING), 'waiting');
    pair.b.queue.hold = true;
    pair.b.event({ type: 'pending_messages.modified', data: {} });
    await waitFor(() => pair.b.queue.held.length === 1, 'queue check held');
    const asked = pair.a.call('dude_a2a_ask', { question: 'Does R2 pass?' });
    const admitted = await receiving;
    assert.equal(admitted.outcome, 'question', 'admission does not wait for the check');
    releaseCheck(pair.b.queue, [{ id: 'opaque' }]);
    await waitFor(() => pair.b.logs.some((line) => line.startsWith('A2A exchange ended: other input is queued in this session')),
      'the check captured on the waiter ended the exchange it became');
    const answer = await asked;
    assert.deepEqual([answer.outcome, answer.reason, answer.delivery], ['unavailable', 'exchange_ended', 'reached_peer']);
    const refused = await replyFrom(pair, admitted.exchangeId);
    assert.deepEqual([refused.outcome, refused.reason], ['refused', 'exchange_not_current']);
  } finally {
    stopAndRelease(pair);
    pair.cleanup();
  }
});

test('a reply waits for an applicable queued-input check: queued input withholds it, an empty queue lets it go', async () => {
  const cases = /** @type {Array<[string, unknown[], string[], string[]]>} */ ([
    ['queued input', [{ id: 'opaque' }], ['refused', 'exchange_not_current'], ['unavailable', 'exchange_ended']],
    ['empty queue', [], ['sent'], ['answer']],
  ]);
  for (const [label, items, replyOutcome, askOutcome] of cases) {
    const pair = await servicePair();
    try {
      const { admitted, asked } = await openExchange(pair, 'Does R2 pass?');
      const answered = watch(asked);
      pair.b.queue.hold = true;
      pair.b.event({ type: 'pending_messages.modified', data: {} });
      await waitFor(() => pair.b.queue.held.length === 1, `${label}: queue check held`);
      const replying = watch(replyFrom(pair, admitted.exchangeId));
      for (let index = 0; index < 20; index += 1) await tick();
      assert.equal(replying.settled, false, `${label}: the reply waits for the check`);
      assert.equal(answered.settled, false, `${label}: nothing reached A`);
      assert.equal(pair.connections.at(-1)?.written[1], 0, `${label}: nothing was handed to the transport`);
      releaseCheck(pair.b.queue, items);
      await waitFor(() => replying.settled, `${label}: reply settled`);
      assert.deepEqual(replyOutcome.map((_, index) => [replying.value.outcome, replying.value.reason][index]), replyOutcome, label);
      const answer = await asked;
      assert.deepEqual(askOutcome.map((_, index) => [answer.outcome, answer.reason][index]), askOutcome, label);
    } finally {
      stopAndRelease(pair);
      pair.cleanup();
    }
  }
});

test('a stale queued-input result for an earlier receive does not end a later, unrelated exchange', async () => {
  const pair = await servicePair();
  try {
    const first = new AbortController();
    const cancelled = pair.b.call('dude_a2a_receive', {}, { signal: first.signal });
    await waitFor(() => pair.b.logs.includes(WAITING), 'first receive waiting');
    pair.b.queue.hold = true;
    pair.b.event({ type: 'pending_messages.modified', data: {} });
    await waitFor(() => pair.b.queue.held.length === 1, 'check against the first receive held');
    first.abort();
    assert.equal((await cancelled).outcome, 'cancelled');
    const second = watch(pair.b.call('dude_a2a_receive', {}));
    await waitFor(() => pair.b.queue.held.length === 2, 'second preflight held');
    pair.b.queue.held.splice(1, 1)[0]([]);
    await waitFor(() => pair.b.logs.filter((line) => line === WAITING).length === 2, 'second receive waiting');
    const asked = pair.a.call('dude_a2a_ask', { question: 'Does R2 pass?' });
    await waitFor(() => second.settled, 'second receive admitted');
    releaseCheck(pair.b.queue, [{ id: 'opaque' }]);
    for (let index = 0; index < 10; index += 1) await tick();
    assert.equal(pair.b.logs.some((line) => line.startsWith('A2A exchange ended')), false, 'the stale result applied to the earlier receive only');
    assert.equal((await replyFrom(pair, second.value.exchangeId)).outcome, 'sent');
    assert.equal((await asked).outcome, 'answer');
  } finally {
    stopAndRelease(pair);
    pair.cleanup();
  }
});

test('the asker waits for its applicable queued-input check before delivering an answer', async () => {
  const cases = /** @type {Array<[string, unknown[], string[]]>} */ ([
    ['queued input', [{ id: 'opaque' }], ['failure', 'cancelled', 'input_pending', 'reached_peer']],
    ['empty queue', [], ['success', 'answer']],
  ]);
  for (const [label, items, expected] of cases) {
    const pair = await servicePair();
    try {
      const { admitted, asked } = await openExchange(pair, 'Does R2 pass?');
      const answered = watch(asked);
      pair.a.queue.hold = true;
      pair.a.event({ type: 'pending_messages.modified', data: {} });
      await waitFor(() => pair.a.queue.held.length === 1, `${label}: A's check held`);
      assert.equal((await replyFrom(pair, admitted.exchangeId)).outcome, 'sent', `${label}: B answered`);
      for (let index = 0; index < 20; index += 1) await tick();
      assert.equal(answered.settled, false, `${label}: A holds the answer until its check resolves`);
      releaseCheck(pair.a.queue, items);
      const answer = await asked;
      assert.deepEqual(expected.map((_, index) => [answer.resultType, answer.outcome, answer.reason, answer.delivery][index]), expected, label);
      if (items.length) assert.equal(JSON.stringify(answer).includes('R2 passes'), false, `${label}: the answer text was withheld`);
    } finally {
      stopAndRelease(pair);
      pair.cleanup();
    }
  }
});

test('a parent directory swapped for an outside-root junction after path validation is refused after the read, and no outside byte is attached', async (context) => {
  const pair = await servicePair();
  try {
    const sub = path.join(pair.dirs.evidence, 'sub');
    fs.mkdirSync(sub);
    const leaf = path.join(sub, 'report.log');
    fs.writeFileSync(leaf, 'inside evidence\n');
    const outside = path.join(pair.dirs.base, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'report.log'), 'outside secret bytes\n');
    try {
      fs.symlinkSync(outside, path.join(pair.dirs.base, 'junction-probe'), 'junction');
    } catch (error) {
      context.skip(`directory junctions are unavailable here, so this case did not run: ${/** @type {Error} */ (error).message}`);
      return;
    }
    const { admitted, asked } = await openExchange(pair, 'What does the report say?');
    const answered = watch(asked);
    const seam = afterPathValidation(leaf, () => {
      fs.renameSync(sub, `${sub}-moved`);
      fs.symlinkSync(outside, sub, 'junction');
    });
    let refused;
    try {
      refused = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: leaf, claimedProvenance: 'missing' }] });
    } finally {
      seam.restore();
    }
    assert.equal(seam.fired, true, 'the parent became an outside junction after validation, before the read');
    assert.deepEqual([refused.outcome, refused.reason, refused.exchangeOpen, refused.evidence], ['refused', 'unsafe_path', true, 'evidence[0]']);
    for (let index = 0; index < 10; index += 1) await tick();
    assert.equal(answered.settled, false, 'nothing reached A');
    assert.equal(pair.connections.at(-1)?.written[1], 0, 'no byte was handed to the transport');
    assert.equal(JSON.stringify([refused, pair.a.logs, pair.b.logs]).includes('outside secret'), false);
  } finally {
    stopAndRelease(pair);
    pair.cleanup();
  }
});

test('contentBytes bounds the aggregate bytes of the distinct files a reply cites, checked before any over-budget file is read', async () => {
  const pair = await servicePair({ serve: { contentBytes: 4096 } });
  try {
    const file = (/** @type {string} */ name, /** @type {number} */ bytes) => {
      const full = path.join(pair.dirs.evidence, name);
      sizedFile(full, bytes);
      return full;
    };
    const [a, b, fitA, fitB, big] = [file('a.log', 3000), file('b.log', 3000), file('fit-a.log', 2000), file('fit-b.log', 2096), file('big.log', 5000)];
    const cite = (/** @type {string} */ path, /** @type {number} */ line) => ({ file: path, lines: { start: line, end: line }, claimedProvenance: 'missing' });
    const { admitted, asked } = await openExchange(pair, 'Do the logs agree?');
    const answered = watch(asked);

    const over = await replyFrom(pair, admitted.exchangeId, { evidence: [cite(a, 1), cite(b, 1)] });
    assert.deepEqual([over.outcome, over.reason, over.exchangeOpen, over.evidence], ['refused', 'evidence_over_budget', true, 'evidence[1]'],
      'two short excerpts would fit one message, but 6000 source bytes exceed 4096');
    const opens = openCounter(big);
    let early;
    try {
      early = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: big, claimedProvenance: 'missing' }] });
    } finally {
      opens.restore();
    }
    assert.deepEqual([early.outcome, early.reason, early.evidence], ['refused', 'evidence_over_budget', 'evidence[0]']);
    assert.equal(opens.opens, 0, 'a file larger than the budget is refused before it is opened');
    for (let index = 0; index < 10; index += 1) await tick();
    assert.equal(answered.settled, false);
    assert.equal(pair.connections.at(-1)?.written[1], 0, 'no refusal handed anything to the transport');

    const fits = await replyFrom(pair, admitted.exchangeId, { evidence: [cite(fitA, 1), cite(fitA, 2), cite(fitB, 1)] });
    assert.equal(fits.outcome, 'sent', 'a file cited twice counts once, and exactly 4096 source bytes fit');
    const answer = await asked;
    assert.deepEqual(answer.evidence.map((/** @type {any} */ item) => item.fileAtRead.bytes), [2000, 2000, 2096]);
  } finally {
    stopAndRelease(pair);
    pair.cleanup();
  }
});

test('an evidence file that changes while it is read is refused as changed, and none of its bytes are sent', async () => {
  const pair = await servicePair();
  try {
    const files = seedEvidence(pair.dirs.evidence);
    const { admitted, asked } = await openExchange(pair, 'What does the R2 run say?');
    const answered = watch(asked);
    const variants = /** @type {Array<[string, () => void]>} */ ([
      ['appended during the read', () => fs.appendFileSync(files.current, 'a line appended mid-read\n')],
      ['rewritten in place during the read', () => {
        const fd = fs.openSync(files.current, 'r+');
        try {
          fs.writeSync(fd, 'REVISION: R9', 0);
        } finally {
          fs.closeSync(fd);
        }
        fs.utimesSync(files.current, new Date(), new Date(Date.now() + 60_000));
      }],
    ]);
    for (const [label, mutate] of variants) {
      const seam = duringRead(files.current, mutate);
      let refused;
      try {
        refused = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: files.current, claimedProvenance: 'revision R2' }] });
      } finally {
        seam.restore();
      }
      assert.equal(seam.fired, true, `${label}: the change happened after the file was opened, during the read`);
      assert.deepEqual([refused.outcome, refused.reason, refused.exchangeOpen, refused.evidence], ['refused', 'evidence_changed', true, 'evidence[0]'], label);
    }
    for (let index = 0; index < 10; index += 1) await tick();
    assert.equal(answered.settled, false, 'nothing reached A');
    assert.equal(pair.connections.at(-1)?.written[1], 0, 'no byte was handed to the transport');
    const sent = await replyFrom(pair, admitted.exchangeId, { evidence: [{ file: files.current, claimedProvenance: 'revision R2' }] });
    assert.equal(sent.outcome, 'sent', 'the same citation is attached once the file is stable');
    assert.equal((await asked).evidence[0].excerpt, fs.readFileSync(files.current, 'utf8'));
  } finally {
    stopAndRelease(pair);
    pair.cleanup();
  }
});

test('askTimeoutMs bounds the whole ask: an answer held past the deadline by a queued-input check is withheld and never resurrected', async () => {
  const pair = await servicePair({ ask: { askTimeoutMs: 200, repeatUse: 1 } });
  try {
    const receiving = pair.b.call('dude_a2a_receive', {});
    await waitFor(() => pair.b.logs.includes(WAITING), 'B waiting');
    const asked = watch(pair.a.call('dude_a2a_ask', { question: 'Does R2 pass?' }));
    const admitted = await receiving;
    pair.a.queue.hold = true;
    pair.a.event({ type: 'pending_messages.modified', data: {} });
    await waitFor(() => pair.a.queue.held.length === 1, "A's queued-input check held");
    assert.equal((await replyFrom(pair, admitted.exchangeId)).outcome, 'sent', 'the peer answered well within the deadline');
    // Three times askTimeoutMs, far short of the check's own 5 s deadline; the check stays held throughout.
    await delay(600);
    assert.equal(asked.settled, true, 'the ask ended at its deadline while the check was still held');
    assert.equal(pair.a.queue.held.length, 1);
    releaseCheck(pair.a.queue, []);
    for (let index = 0; index < 10; index += 1) await tick();
    const answer = asked.value;
    assert.deepEqual([answer.resultType, answer.outcome, answer.reason, answer.delivery], ['failure', 'cancelled', 'ask_timeout', 'reached_peer'],
      'the reply arrived but is withheld after the deadline; an empty result released later resurrects nothing');
    assert.equal(JSON.stringify(answer).includes('R2 passes'), false, 'no answer text was delivered');
    assert.equal(pair.a.logs.some((line) => line.startsWith('A2A activation ended')), false, 'the deadline ends the ask, not the activation');
    const again = await pair.a.call('dude_a2a_ask', { question: 'And R3?' });
    assert.deepEqual([again.outcome, again.reason], ['refused', 'repeat_use_exhausted'], 'the withheld exchange reached the peer, so it is not refunded');
  } finally {
    stopAndRelease(pair);
    pair.cleanup();
  }

  // Control: the same held check released before the deadline lets the answer through.
  const control = await servicePair({ ask: { askTimeoutMs: 2_000 } });
  try {
    const { admitted, asked } = await openExchange(control, 'Does R2 pass?');
    control.a.queue.hold = true;
    control.a.event({ type: 'pending_messages.modified', data: {} });
    await waitFor(() => control.a.queue.held.length === 1, "A's queued-input check held");
    assert.equal((await replyFrom(control, admitted.exchangeId)).outcome, 'sent');
    releaseCheck(control.a.queue, []);
    const answer = await asked;
    assert.deepEqual([answer.resultType, answer.outcome], ['success', 'answer']);
  } finally {
    stopAndRelease(control);
    control.cleanup();
  }
});

test('stop or invocation abort while an answer waits on a queued-input check ends the ask at once with its own cause', async () => {
  const cases = /** @type {Array<[string, (pair: Pair, controller: AbortController) => void, string]>} */ ([
    ['stop', (pair) => pair.a.event(rootMessage('dude a2a stop')), 'activation_ended'],
    ['invocation abort', (_pair, controller) => controller.abort(), 'invocation_cancelled'],
  ]);
  for (const [label, finish, reason] of cases) {
    const pair = await servicePair({ ask: { askTimeoutMs: 5_000 } });
    try {
      const controller = new AbortController();
      const { admitted, asked } = await openExchange(pair, 'Does R2 pass?', { askSignal: controller.signal });
      const answered = watch(asked);
      pair.a.queue.hold = true;
      pair.a.event({ type: 'pending_messages.modified', data: {} });
      await waitFor(() => pair.a.queue.held.length === 1, `${label}: A's check held`);
      assert.equal((await replyFrom(pair, admitted.exchangeId)).outcome, 'sent');
      for (let index = 0; index < 10; index += 1) await tick();
      assert.equal(answered.settled, false, `${label}: the answer waits for the check`);
      finish(pair, controller);
      await waitFor(() => answered.settled, `${label}: the ask ended without waiting for the check`);
      assert.deepEqual([answered.value.outcome, answered.value.reason, answered.value.delivery], ['cancelled', reason, 'reached_peer'], label);
      assert.equal(pair.a.queue.held.length, 1, `${label}: the check was still held`);
    } finally {
      stopAndRelease(pair);
      pair.cleanup();
    }
  }
});

test('the ask deadline also covers the handshake: expiry before any byte is a refunded, definite timeout', async () => {
  const peer = serveFixture();
  const handshakes = heldHandshakes();
  const asker = await registeredAsker(http.createServer(peer.app), { hold: handshakes.hold }, { askTimeoutMs: 100, repeatUse: 1 });
  try {
    const first = await asker.ask('Is claim X supported?');
    assert.deepEqual([first.outcome, first.reason, first.delivery], ['timeout', 'ask_timeout', 'not_sent']);
    const second = await asker.ask('Is claim X supported now?');
    assert.deepEqual([second.outcome, second.reason, second.delivery], ['timeout', 'ask_timeout', 'not_sent'],
      'the unsent attempt was refunded, so repeat use 1 still allows another');
    assert.equal(peer.questions.length, 0);
  } finally {
    asker.cleanup();
  }
});

/**
 * A harmless Node script B's owner approves as command `check`. It writes
 * nothing; `sleep` keeps running until its termination is requested.
 */
const CHECK_SCRIPT = `const mode = process.argv[2];
if (mode === 'pass') { process.stdout.write('412 passed, 0 failed\\n'); process.exit(0); }
if (mode === 'fail') { process.stdout.write('409 passed, 3 failed\\n'); process.exit(3); }
if (mode === 'sleep') { process.stdout.write('started\\n'); setInterval(() => {}, 1000); }
`;
const RUN_CHECK = /^Each run record names this exchange and is consistent with its revision policy and outcome/;

/**
 * A pair whose B profile approves three commands for the current worktree
 * without Git, so revision observations are explicitly unknown: `check`,
 * `missing` (a program that does not exist, so it cannot start), and `hang`
 * (which outlives its 500 ms timeout). The no-listen guard in NODE_OPTIONS is
 * declared so it also loads in the fixture children.
 * @param {Record<string, unknown>} [serve]
 */
async function verifyingPair(serve = {}) {
  const inherit = [...(process.platform === 'win32' ? ['SystemRoot'] : []), ...(process.env.NODE_OPTIONS ? ['NODE_OPTIONS'] : [])];
  const pair = await servicePair({
    serve: { verification: { commands: ['check', 'missing', 'hang'], revision: 'worktree', repeatUse: 'activation' }, ...serve },
    commands: ({ bRoot }) => ({
      check: {
        executable: process.execPath,
        args: [path.join(bRoot, 'tools', 'check.mjs'), '{mode}'],
        params: { mode: { enum: ['pass', 'fail', 'sleep'] } },
        cwd: bRoot,
        env: { inherit, set: {} },
        timeoutMs: 10_000,
        outputBytes: 4096,
        effects: 'Prints a fixed test summary; writes nothing',
      },
      missing: {
        executable: path.join(bRoot, 'tools', 'missing-program.exe'),
        args: [],
        params: {},
        cwd: bRoot,
        env: { inherit: [], set: {} },
        timeoutMs: 5_000,
        outputBytes: 64,
        effects: 'None; the program does not exist',
      },
      hang: {
        executable: process.execPath,
        args: [path.join(bRoot, 'tools', 'check.mjs'), 'sleep'],
        params: {},
        cwd: bRoot,
        env: { inherit, set: {} },
        timeoutMs: 500,
        outputBytes: 64,
        effects: 'Prints one line and waits; writes nothing',
      },
    }),
  });
  fs.mkdirSync(path.join(pair.dirs.bRoot, 'tools'));
  fs.writeFileSync(path.join(pair.dirs.bRoot, 'tools', 'check.mjs'), CHECK_SCRIPT);
  return pair;
}

test('two services complete a US4 exchange: A requests runs, B runs one approved command through dude_a2a_verify, and A gets its fresh record with the output digest recomputed', async () => {
  const pair = await verifyingPair();
  try {
    const before = tree(pair.dirs.bRoot);
    const requested = [{ commandId: 'check', params: { mode: 'pass' } }, { commandId: 'check', params: { mode: 'fail' } }];
    const waiting = pair.b.logs.filter((line) => line === WAITING).length;
    const received = pair.b.call('dude_a2a_receive', {});
    await waitFor(() => pair.b.logs.filter((line) => line === WAITING).length > waiting, 'B waiting');
    const asked = pair.a.call('dude_a2a_ask', { question: 'Does the suite pass on your current worktree?', requested });
    const admitted = await received;
    assert.equal(admitted.outcome, 'question', JSON.stringify(admitted));
    assert.deepEqual(admitted.requested, requested, "B's model sees A's requests as peer data, next to what its owner approved");
    assert.deepEqual(admitted.approvedCommands.commands.map((/** @type {any} */ command) => [command.id, command.params]),
      [['check', { mode: { oneOf: ['pass', 'fail', 'sleep'] } }], ['missing', {}], ['hang', {}]]);
    assert.equal(admitted.approvedCommands.revision, 'current worktree');

    // B's model chooses to run only the pass mode.
    const ran = await pair.b.call('dude_a2a_verify', { exchangeId: admitted.exchangeId, commandId: 'check', params: { mode: 'pass' } });
    assert.deepEqual([ran.resultType, ran.outcome, ran.attachable], ['success', 'ran', true], JSON.stringify(ran));
    const record = ran.record;
    const script = path.join(pair.dirs.bRoot, 'tools', 'check.mjs');
    assert.deepEqual([record.exchangeId, record.argv, record.cwd, record.revision.before.unknown, record.revision.changedDuringRun],
      [admitted.exchangeId, [script, 'pass'], pair.dirs.bRoot, 'git_not_configured', 'unknown']);

    const replied = await pair.b.call('dude_a2a_reply', {
      exchangeId: admitted.exchangeId,
      conclusion: 'A fresh run on my current worktree passed: 412 passed, 0 failed.',
      limitations: 'I ran only the pass mode, not the fail mode. The revision is unknown because Git is not configured.',
      evidence: [{ run: record.runId }],
    });
    assert.equal(replied.outcome, 'sent', JSON.stringify(replied));

    const answer = await asked;
    assert.equal(answer.outcome, 'answer', JSON.stringify(answer));
    assert.deepEqual(answer.evidence, [], 'no file evidence was cited');
    assert.equal(answer.freshVerification.length, 1);
    const fresh = answer.freshVerification[0];
    const output = '412 passed, 0 failed\n';
    assert.deepEqual([fresh.freshAdapterRecord, fresh.command], [record.runId, {
      id: 'check', digest: record.commandDigest, executable: process.execPath, argv: [script, 'pass'], params: { mode: 'pass' },
    }]);
    assert.deepEqual([fresh.context.revisionPolicy, fresh.context.before.unknown, fresh.context.after.unknown, fresh.context.changedDuringRun],
      ['current worktree', 'git_not_configured', 'git_not_configured', 'unknown']);
    assert.deepEqual([fresh.outcome, fresh.status, fresh.exit, fresh.termination, fresh.descendants],
      ['exited', 'started; direct exit code 0', { code: 0, signal: null }, 'not requested', 'unknown']);
    assert.deepEqual(fresh.output.stdout, {
      text: output, bytes: output.length, retainedBytes: output.length, truncated: false, incomplete: false, byteExactText: true,
      sha256: digest(output), digest: 'recomputed here from the complete output',
    });
    assert.equal(fresh.environment.values, 'hidden');
    assert.match(fresh.effects, /^not observed/);
    assert.deepEqual(answer.requestedOperations, [
      { commandId: 'check', params: { mode: 'pass' }, status: `fresh adapter record ${record.runId}: started; direct exit code 0` },
      { commandId: 'check', params: { mode: 'fail' }, status: 'no run record supplied; execution unknown' },
    ], 'a requested operation with no supplied record is unknown, not assumed unrun');
    assert.equal(answer.runNotes.length, 2);
    assert.ok(answer.adapter.checks.some((/** @type {string} */ check) => RUN_CHECK.test(check)));
    assert.deepEqual(answer.peerModel.limitations, 'I ran only the pass mode, not the fail mode. The revision is unknown because Git is not configured.');

    assert.ok(pair.b.logs.includes(`Run start: ${record.runId}`));
    assert.ok(pair.b.logs.includes(`Run end: ${record.runId}; direct exit code 0`));
    assert.equal([...pair.a.logs, ...pair.b.logs].some((line) => line.includes('412 passed')), false, 'logs carry no command output');
    assert.deepEqual(tree(pair.dirs.bRoot), before, 'the approved run and the exchange wrote nothing to B\'s workspace');
  } finally {
    pair.cleanup();
  }
});

test('A reports each requested operation from the supplied record fields: a completed run B left uncited stays unknown, a cited spawn failure did not start, and a cited timeout started but did not finish', async () => {
  const pair = await verifyingPair();
  try {
    const requested = [{ commandId: 'check', params: { mode: 'pass' } }, { commandId: 'missing', params: {} }, { commandId: 'hang', params: {} }];
    const waiting = pair.b.logs.filter((line) => line === WAITING).length;
    const received = pair.b.call('dude_a2a_receive', {});
    await waitFor(() => pair.b.logs.filter((line) => line === WAITING).length > waiting, 'B waiting');
    const asked = pair.a.call('dude_a2a_ask', { question: 'Does the suite pass, and do the other tools finish?', requested });
    const admitted = await received;
    assert.equal(admitted.outcome, 'question', JSON.stringify(admitted));

    // B runs all three: one completes, one cannot start, one times out.
    const verify = (/** @type {string} */ commandId, /** @type {Record<string, string>} */ params) => pair.b.call('dude_a2a_verify', { exchangeId: admitted.exchangeId, commandId, params });
    const completed = await verify('check', { mode: 'pass' });
    assert.deepEqual([completed.attachable, completed.record.outcome, completed.record.exit], [true, 'exited', { code: 0, signal: null }]);
    const failed = await verify('missing', {});
    assert.deepEqual([failed.attachable, failed.record.outcome, failed.record.startedAt, failed.record.exit], [true, 'spawn_failed', null, null]);
    const timedOut = await verify('hang', {});
    assert.deepEqual([timedOut.attachable, timedOut.record.outcome, timedOut.record.termination?.reason], [true, 'timed_out', 'timeout']);
    assert.notEqual(timedOut.record.startedAt, null);

    // B cites only the spawn failure and the timeout; its completed run stays uncited.
    const replied = await pair.b.call('dude_a2a_reply', {
      exchangeId: admitted.exchangeId,
      conclusion: 'The missing tool could not start, and the hang tool did not finish.',
      limitations: 'I am not sharing the suite output.',
      evidence: [{ run: failed.record.runId }, { run: timedOut.record.runId }],
    });
    assert.equal(replied.outcome, 'sent', JSON.stringify(replied));
    const answer = await asked;
    assert.equal(answer.outcome, 'answer', JSON.stringify(answer));
    const [check, missing, hang] = answer.requestedOperations;
    assert.deepEqual(check, { commandId: 'check', params: { mode: 'pass' }, status: 'no run record supplied; execution unknown' },
      'a run B completed but did not cite is unknown to A, not reported as unrun');
    assert.deepEqual(missing, { commandId: 'missing', params: {}, status: `fresh adapter record ${failed.record.runId}: did not start (spawn failed)` },
      'a cited spawn failure is not reported as a run');
    assert.match(hang.status, new RegExp(`^fresh adapter record ${timedOut.record.runId}: started; timed out; termination `));
    assert.equal(answer.freshVerification.length, 2);
    const [notStarted, unfinished] = answer.freshVerification;
    assert.deepEqual([notStarted.freshAdapterRecord, notStarted.status, notStarted.outcome, notStarted.times.started, notStarted.exit],
      [failed.record.runId, 'did not start (spawn failed)', 'spawn_failed', 'did not start', 'not observed']);
    assert.deepEqual([unfinished.freshAdapterRecord, unfinished.outcome, unfinished.times.started], [timedOut.record.runId, 'timed_out', timedOut.record.startedAt]);
    assert.match(unfinished.status, /^started; timed out; termination /);
  } finally {
    pair.cleanup();
  }
});

test('client loss during a verification run ends B\'s exchange: the run is cancelled with termination requested for its own PID, and its record reaches no one', async () => {
  const pair = await verifyingPair();
  /** @type {Promise<any> | null} */
  let running = null;
  try {
    const controller = new AbortController();
    const { admitted, asked } = await openExchange(pair, 'Does the suite pass?', { askSignal: controller.signal });
    running = pair.b.call('dude_a2a_verify', { exchangeId: admitted.exchangeId, commandId: 'check', params: { mode: 'sleep' } });
    const started = await pair.b.logLine((line) => line.startsWith('Run start: '), 'B run started');
    controller.abort();
    const lost = await asked;
    assert.deepEqual([lost.outcome, lost.reason, lost.delivery], ['uncertain', 'cancelled', 'may_have_occurred']);
    const ran = await running;
    assert.deepEqual([ran.outcome, ran.attachable], ['ran', false], JSON.stringify(ran));
    assert.equal(`Run start: ${ran.record.runId}`, started);
    assert.deepEqual([ran.record.outcome, ran.record.termination?.reason, ran.record.termination?.result], ['cancelled', 'exchange_ended', 'requested']);
    assert.match(ran.record.termination.method, process.platform === 'win32' ? /^windows-taskkill-tree$/ : /^posix-process-group-sigkill$/);
    const cited = await replyFrom(pair, admitted.exchangeId, { evidence: [{ run: ran.record.runId }] });
    assert.deepEqual([cited.outcome, cited.reason], ['refused', 'exchange_not_current'], 'nothing from the ended exchange is sent later');
  } finally {
    // Stop ends any run a failed assertion left behind, so its process has exited before cleanup.
    stopAndRelease(pair);
    await running;
    pair.cleanup();
  }
});

test('a run that starts while a reply waits on queued-input checks makes that reply refuse, so no run outlives its exchange; the settled record is then citable', async () => {
  const pair = await verifyingPair();
  /** @type {Promise<any> | null} */
  let running = null;
  try {
    const { admitted, asked } = await openExchange(pair, 'Does the suite pass?');
    pair.b.queue.hold = true;
    pair.b.event({ type: 'pending_messages.modified', data: {} });
    await waitFor(() => pair.b.queue.held.length === 1, 'first queue check held');
    const replying = watch(replyFrom(pair, admitted.exchangeId));
    // A second check starts before the verify waits, so when it resolves the verify resumes, and spawns, before the reply.
    pair.b.event({ type: 'pending_messages.modified', data: {} });
    await waitFor(() => pair.b.queue.held.length === 2, 'second queue check held');
    running = pair.b.call('dude_a2a_verify', { exchangeId: admitted.exchangeId, commandId: 'check', params: { mode: 'pass' } });
    for (let index = 0; index < 20; index += 1) await tick();
    releaseCheck(pair.b.queue);
    for (let index = 0; index < 20; index += 1) await tick();
    assert.equal(replying.settled, false, 'the reply still waits for the second check');
    releaseCheck(pair.b.queue);
    await waitFor(() => replying.settled, 'reply settled');
    assert.deepEqual([replying.value.outcome, replying.value.reason, replying.value.exchangeOpen], ['refused', 'run_in_progress', true], JSON.stringify(replying.value));
    const ran = await running;
    assert.deepEqual([ran.outcome, ran.attachable], ['ran', true], JSON.stringify(ran));
    const sent = await replyFrom(pair, admitted.exchangeId, { evidence: [{ run: ran.record.runId }] });
    assert.equal(sent.outcome, 'sent', JSON.stringify(sent));
    const answer = await asked;
    assert.deepEqual([answer.outcome, answer.freshVerification[0].freshAdapterRecord], ['answer', ran.record.runId]);
  } finally {
    stopAndRelease(pair);
    await running;
    pair.cleanup();
  }
});

test('offline transport fixtures never bound a real listener', () => {
  assert.equal(listens, 0);
});
