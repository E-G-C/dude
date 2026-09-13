// @ts-check
/**
 * Focused T009 regressions for the bounded Needs You provider.
 *
 * These tests use the real provider, loopback server, filesystem owner
 * resolution, and tool result envelopes. The review adapter and Copilot SDK
 * session are deliberately narrow fixtures: T010 owns review storage/sealing
 * and T012 owns installed-host acceptance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import {
  NEEDS_YOU_LIMITS,
  NEEDS_YOU_PARAMETERS,
  NeedsYouError,
  createNeedsYou,
} from './lib/needs-you.mjs';
import { createReview, REVIEW_LIMITS, ReviewError } from './lib/review.mjs';
import { closeInstance, openInstance } from './lib/canvas-server.mjs';

let fixtureSequence = 0;
let invocationSequence = 0;

/** @returns {string} */
function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-needs-you-'));
}

/** @param {string|Buffer} value */
function revision(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {string} root @param {string} relative @param {string|Buffer} value */
function write(root, relative, value) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

/** @param {string} root @param {string} relative */
function bytes(root, relative) {
  return fs.readFileSync(path.join(root, ...relative.split('/')));
}

/** @param {string} root @param {string} number @param {string} slug */
function createDraft(root, number, slug) {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  write(root, ideaPath, [
    '---',
    `title: ${slug}`,
    `slug: ${slug}`,
    'status: draft',
    'spec_path:',
    '---',
    '',
    '## Idea',
    '',
    `${slug} intent.`,
    '',
    '## Open Questions',
    '',
    'None.',
    '',
  ].join('\n'));
  return ideaPath;
}

/**
 * @param {string} root
 * @param {string} [number]
 * @param {string} [slug]
 */
function createFeature(root, number = '001', slug = 'feature') {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  const directory = `.dude/specs/${number}-${slug}`;
  const specPath = `${directory}/spec.md`;
  const tasksPath = `${directory}/tasks.md`;
  const artifactPath = `${directory}/design/mock.html`;
  const assetPath = `${directory}/design/mock.css`;
  const artifact = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="mock.css"><main>Alpha</main>\n';
  const asset = 'main { color: #123456; }\n';
  write(root, artifactPath, artifact);
  write(root, assetPath, asset);
  write(root, specPath, [
    '---',
    `title: ${slug}`,
    `preview_path: ${artifactPath}`,
    '---',
    '',
    `# ${slug}`,
    '',
  ].join('\n'));
  write(root, tasksPath, '- [ ] T001@aaaaaaaa Fixture task\n');
  write(root, ideaPath, [
    '---',
    `title: ${slug}`,
    `slug: ${slug}`,
    'status: defined',
    `spec_path: ${specPath}`,
    '---',
    '',
    '## Idea',
    '',
    `${slug} intent.`,
    '',
    '## Open Questions',
    '',
    'None.',
    '',
  ].join('\n'));
  return {
    ideaPath,
    directory,
    specPath,
    tasksPath,
    artifactPath,
    assetPath,
    preview() {
      return {
        artifact: { path: artifactPath, revision: revision(bytes(root, artifactPath)) },
        assets: [{ path: assetPath, revision: revision(bytes(root, assetPath)) }],
      };
    },
    fileSource(relative = ideaPath) {
      return { kind: /** @type {'file'} */ ('file'), path: relative, revision: revision(bytes(root, relative)) };
    },
    scope: {
      kind: /** @type {'feature'} */ ('feature'),
      ideaPath,
      specPath,
    },
  };
}

/** @param {string} root */
function snapshotFiles(root) {
  /** @type {Map<string,Buffer>} */
  const result = new Map();
  /** @param {string} directory */
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.set(path.relative(root, absolute), fs.readFileSync(absolute));
    }
  }
  visit(root);
  return result;
}

/** @template T */
function deferred() {
  /** @type {(value:T)=>void} */
  let resolve;
  /** @type {(reason?:unknown)=>void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * @template T
 * @param {()=>T|null|undefined|false} probe
 * @param {string} label
 * @param {number} [timeout]
 * @returns {Promise<T>}
 */
async function until(probe, label, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** @param {Promise<any>} promise @param {number} [timeout] */
async function bounded(promise, timeout = 2_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`operation exceeded ${timeout}ms test bound`)),
      timeout,
    ).unref()),
  ]);
}

/**
 * @param {{
 *   sessionId?:string,
 *   pendingItems?:()=>unknown|Promise<unknown>,
 *   send?:(input:{prompt:string,mode:string})=>unknown|Promise<unknown>,
 * }} [options]
 */
function createSessionFixture(options = {}) {
  const calls = {
    queue: 0,
    sends: /** @type {Array<{prompt:string,mode:string}>} */ ([]),
  };
  const state = {
    pendingItems: options.pendingItems ?? (() => ({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    })),
    send: options.send ?? (async () => `message-${calls.sends.length}`),
  };
  const session = {
    sessionId: options.sessionId ?? `session-${++fixtureSequence}`,
    rpc: {
      queue: {
        pendingItems: async () => {
          calls.queue += 1;
          return state.pendingItems();
        },
      },
    },
    send: async (input) => {
      calls.sends.push(input);
      return state.send(input);
    },
  };
  return { calls, session, state };
}

/** @param {string} sessionId @param {Partial<any>} [overrides] */
function invocation(sessionId, overrides = {}) {
  const controller = new AbortController();
  const value = {
    sessionId,
    toolName: 'dude_needs_you',
    toolCallId: `tool-${++invocationSequence}`,
    signal: controller.signal,
    ...overrides,
  };
  return { controller, invocation: value };
}

/** @param {any} result */
function details(result) {
  assert.equal(typeof result?.textResultForLlm, 'string', 'tool result must contain JSON text');
  return JSON.parse(result.textResultForLlm);
}

/** @param {any} result @param {string} reason */
function assertRefused(result, reason) {
  assert.equal(result.resultType, 'failure');
  assert.deepEqual(details(result), {
    status: 'refused',
    acceptedAnswer: false,
    response: null,
    reason,
  });
}

/**
 * @param {ReturnType<typeof createNeedsYou>} provider
 * @param {any} request
 * @param {string} sessionId
 */
async function publishRequest(provider, request, sessionId) {
  const call = invocation(sessionId);
  const result = provider.tool.handler({ op: 'request', request }, call.invocation);
  const record = await until(
    () => provider.read().requests.find((entry) => (
      entry.request.owner === request.owner
      && entry.request.requestRef === request.requestRef
      && JSON.stringify(entry.request.scope) === JSON.stringify(request.scope)
      && entry.request.revision === request.revision
      && entry.phase === 'pending'
    )),
    `pending ${request.requestRef}`,
  );
  return { ...call, record, result };
}

/**
 * @param {string} kind
 * @param {Partial<any>} [overrides]
 */
function sessionRequest(kind, overrides = {}) {
  const requestRef = overrides.requestRef ?? `${kind}-${++fixtureSequence}`;
  const fields = {
    onboarding: { input: { kind: 'text' } },
    fact: { input: { kind: 'choice', options: [
      { id: 'alpha', label: 'Alpha' },
      { id: 'beta', label: 'Beta' },
    ] } },
    manual_observation: {
      steps: ['Inspect the exact current host view.'],
      automationUnavailable: 'Only the user can judge the host rendering.',
      evidenceRequired: 'Report the observed result.',
    },
    permission: {
      operation: 'remove-exact-claim',
      targets: [
        { target: 'claim:alpha', revision: 'claim-rev-a' },
        { target: 'checkpoint:alpha', revision: 'checkpoint-rev-a' },
      ],
      consequences: 'The exact stale pair will be removed.',
      eligibility: 'The owner must recheck that no supervisor is active.',
      confirmation: 'REMOVE claim:alpha + checkpoint:alpha',
    },
    scope_choice: { options: [
      { id: 'narrow', label: 'Narrow', consequence: 'Deliver the bounded outcome.' },
      { id: 'stop', label: 'Stop', consequence: 'Leave the current work unchanged.' },
    ] },
  };
  return {
    owner: 'dude',
    requestRef,
    scope: { kind: 'session' },
    source: { kind: 'session', revision: `source-${requestRef}` },
    revision: `request-${requestRef}`,
    class: kind,
    prompt: `Current ${kind} input is required.`,
    whyHuman: 'A current user decision is required.',
    unblocks: 'The existing owner can continue.',
    blocking: true,
    fields: fields[kind],
    ...overrides,
  };
}

/** @param {ReturnType<typeof createFeature>} feature @param {Partial<any>} [overrides] */
function previewRequest(feature, overrides = {}) {
  return {
    owner: 'dude-spec-lead',
    requestRef: overrides.requestRef ?? `preview-${++fixtureSequence}`,
    scope: feature.scope,
    source: feature.fileSource(),
    revision: overrides.revision ?? `preview-request-${fixtureSequence}`,
    class: 'preview',
    prompt: 'Review the exact current canonical mock.',
    whyHuman: 'Visual approval or revision feedback requires the user.',
    unblocks: 'The design owner can revise or record current approval.',
    blocking: true,
    fields: feature.preview(),
    ...overrides,
  };
}

/** @param {any} receipt @param {string} outcome @param {any} source @param {Partial<any>} [overrides] */
function acknowledgment(receipt, outcome, source, overrides = {}) {
  return {
    receiptId: receipt.receiptId,
    owner: receipt.owner,
    requestRef: receipt.requestRef,
    scope: receipt.scope,
    previousRevision: receipt.previousRevision,
    recognizes: receipt.recognizes,
    outcome,
    note: `Owner recorded ${outcome}.`,
    source,
    ...overrides,
  };
}

/**
 * @param {ReturnType<typeof createNeedsYou>} provider
 * @param {any} acknowledgmentValue
 * @param {string} sessionId
 * @param {Partial<any>} [overrides]
 */
function acknowledge(provider, acknowledgmentValue, sessionId, overrides = {}) {
  const call = invocation(sessionId, overrides);
  return provider.tool.handler(
    { op: 'acknowledge', acknowledgment: acknowledgmentValue },
    call.invocation,
  );
}

/**
 * @param {string} root
 * @param {{reviewAdapter?:any,session?:Parameters<typeof createSessionFixture>[0]}} [options]
 */
function createProviderFixture(root, options = {}) {
  const sessionFixture = createSessionFixture(options.session);
  const provider = createNeedsYou({ root, reviewAdapter: options.reviewAdapter });
  provider.bindSession(/** @type {any} */ (sessionFixture.session));
  return { provider, ...sessionFixture };
}

/**
 * Run production's real `bd` process boundary against a deterministic tracked
 * board. The fixture changes command lookup only and cleans its own directory.
 * @template T
 * @param {unknown[]} issues
 * @param {(fixture:{
 *   setIssues:(next:unknown[])=>void,
 *   holdNextRead:()=>{entered:Promise<void>,release:()=>void},
 * })=>Promise<T>} action
 */
async function withTrackedBoard(issues, action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-needs-you-bd-'));
  const dataPath = path.join(root, 'issues.json');
  const scriptPath = path.join(root, 'bd.cjs');
  const executable = path.join(root, process.platform === 'win32' ? 'bd.cmd' : 'bd');
  /** @type {any} */
  let nextReadGate = null;
  const sockets = /** @type {Set<import('node:net').Socket>} */ (new Set());
  const barrierServer = http.createServer((_request, response) => {
    const gate = nextReadGate;
    nextReadGate = null;
    if (!gate) {
      response.end('continue');
      return;
    }
    gate.entered.resolve();
    void gate.release.promise.then(() => response.end('continue'));
  });
  barrierServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => barrierServer.listen(0, '127.0.0.1', resolve));
  const barrierAddress = /** @type {import('node:net').AddressInfo} */ (barrierServer.address());
  fs.writeFileSync(dataPath, JSON.stringify(issues));
  fs.writeFileSync(scriptPath, [
    "const fs = require('node:fs');",
    "const http = require('node:http');",
    `const request = http.get({ host: '127.0.0.1', port: ${barrierAddress.port}, path: '/' }, (response) => {`,
    '  response.resume();',
    `  response.once('end', () => process.stdout.write(fs.readFileSync(${JSON.stringify(dataPath)})));`,
    '});',
    "request.once('error', (error) => { process.stderr.write(error.message); process.exitCode = 1; });",
    '',
  ].join('\n'));
  if (process.platform === 'win32') {
    fs.writeFileSync(executable, `@${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} %*\r\n`);
  } else {
    fs.writeFileSync(executable, `#!/usr/bin/env node\nrequire(${JSON.stringify(scriptPath)});\n`);
    fs.chmodSync(executable, 0o755);
  }
  const originalPath = process.env.PATH;
  process.env.PATH = `${root}${path.delimiter}${originalPath ?? ''}`;
  try {
    return await action({
      setIssues(next) {
        fs.writeFileSync(dataPath, JSON.stringify(next));
      },
      holdNextRead() {
        if (nextReadGate) throw new Error('tracked read barrier is already armed');
        const entered = deferred();
        const release = deferred();
        nextReadGate = { entered, release };
        return {
          entered: /** @type {Promise<void>} */ (entered.promise),
          release() { release.resolve(); },
        };
      },
    });
  } finally {
    nextReadGate?.release.resolve();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => barrierServer.close(resolve));
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * @param {string} root
 * @param {ReturnType<typeof createNeedsYou>|null} provider
 */
async function createHttpFixture(root, provider) {
  const instanceId = `needs-you-http-${++fixtureSequence}-${randomUUID()}`;
  const logs = /** @type {string[]} */ ([]);
  const instance = await bounded(openInstance(
    instanceId,
    (message) => void logs.push(message),
    Object.freeze({ complete: true, status: 'fixture' }),
    provider ? { root } : null,
    provider,
  ), 5_000);
  return {
    instance,
    instanceId,
    logs,
    async close() {
      await bounded(closeInstance(instanceId), 5_000);
    },
  };
}

/** @param {string|URL} input @param {RequestInit} [init] */
function transportFetch(input, init = {}) {
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)])
    : AbortSignal.timeout(5_000);
  return fetch(input, { ...init, signal });
}

/**
 * @param {string} url
 * @param {string} requestPath
 * @param {unknown} body
 * @param {Record<string,string>} [headers]
 */
function post(url, requestPath, body, headers = {}) {
  return transportFetch(new URL(requestPath, url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(url).origin,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * @param {import('node:http').Server} server
 * @param {{path?:string,method?:string,headers?:Record<string,string>,body?:string|Buffer}} [options]
 */
function rawRequest(server, options = {}) {
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: options.path ?? '/',
      method: options.method ?? 'GET',
      headers: options.headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    request.setTimeout(5_000, () => request.destroy(new Error('raw HTTP fixture timed out')));
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return crc >>> 0;
});

/** @param {Buffer} value */
function crc32(value) {
  let crc = 0xffffffff;
  for (const byte of value) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param {string} kind @param {Buffer} data */
function pngChunk(kind, data) {
  const name = Buffer.from(kind, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return result;
}

/** @param {number} [width] @param {number} [height] */
function validPng(width = 2, height = 2) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.concat([
      Buffer.from([0]),
      Buffer.alloc(width * 4, row % 2 ? 0x88 : 0x44),
    ]));
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {Buffer} png */
function decodePngFixture(png) {
  assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed = [];
  const chunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, end - 4);
    assert.equal(crc32(png.subarray(offset + 4, end - 4)), png.readUInt32BE(end - 4), `${kind} CRC`);
    chunks.push(kind);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0]);
    }
    if (kind === 'IDAT') compressed.push(data);
    offset = end;
  }
  const decoded = inflateSync(Buffer.concat(compressed));
  assert.equal(decoded.length, height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    assert.ok(decoded[row * (1 + width * 4)] <= 4, `row ${row} has a valid PNG filter`);
  }
  assert.deepEqual(chunks, ['IHDR', 'IDAT', 'IEND']);
  return { width, height, decoded };
}

/** @param {any} input @param {{png?:Buffer,report?:string,mutate?:(value:any)=>any}} [options] */
function sealedReview(input, options = {}) {
  const png = options.png ?? validPng();
  const report = options.report ?? '# Review\n\nMove the current action below the explanation.\n';
  const value = {
    binding: {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      providerGeneration: input.providerGeneration,
      toolCallId: input.toolCallId,
      requestHandle: input.requestHandle,
    },
    submissionId: input.submissionId,
    requestRef: input.request.requestRef,
    requestRevision: input.request.revision,
    scope: input.request.scope,
    preview: input.request.fields,
    revisionText: input.revisionText,
    report: { text: report, revision: revision(report) },
    image: {
      bytes: png,
      revision: revision(png),
      width: decodePngFixture(png).width,
      height: decodePngFixture(png).height,
    },
    provenanceRevision: revision('fixture seal'),
  };
  return options.mutate ? options.mutate(value) : value;
}

test('all six response classes cross the real HTTP/provider boundary with literal data and explicit owner outcomes', { timeout: 15_000 }, async (t) => {
  const cases = [
    {
      kind: 'onboarding',
      response: { class: 'onboarding', action: 'answer', text: '  First\u00a0line\n第二 line  ' },
      outcome: 'applied',
    },
    {
      kind: 'fact',
      response: { class: 'fact', action: 'choose', optionId: 'beta' },
      outcome: 'accepted',
    },
    {
      kind: 'preview',
      outcome: 'applied',
    },
    {
      kind: 'manual_observation',
      response: {
        class: 'manual_observation',
        action: 'observation',
        text: '  Host says:\n✓ aligned\u00a0exactly  ',
        evidence: [],
      },
      outcome: 'accepted',
    },
    {
      kind: 'permission',
      response(request) {
        return {
          class: 'permission',
          action: 'consent',
          operation: request.fields.operation,
          targets: request.fields.targets,
          confirmation: request.fields.confirmation,
        };
      },
      outcome: 'accepted',
    },
    {
      kind: 'scope_choice',
      response: {
        class: 'scope_choice',
        action: 'choose',
        optionId: 'narrow',
        text: 'Keep “quoted” context\nand spacing\u00a0intact.',
      },
      outcome: 'accepted',
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.kind, async () => {
      // Arrange
      const root = temporaryRoot();
      const feature = createFeature(root);
      const sessionFixture = createProviderFixture(root);
      const httpFixture = await createHttpFixture(root, sessionFixture.provider);
      try {
        const request = fixture.kind === 'preview'
          ? previewRequest(feature)
          : sessionRequest(fixture.kind);
        const response = fixture.kind === 'preview'
          ? {
            class: 'preview',
            action: 'approve',
            artifactRevision: request.fields.artifact.revision,
          }
          : typeof fixture.response === 'function'
            ? fixture.response(request)
            : fixture.response;
        const pending = await publishRequest(
          sessionFixture.provider,
          request,
          sessionFixture.session.sessionId,
        );

        // Act
        const readBefore = await transportFetch(new URL('/api/needs-you', httpFixture.instance.url));
        const delivered = await post(httpFixture.instance.url, '/api/needs-you/respond', {
          requestHandle: pending.record.requestHandle,
          revision: request.revision,
          response,
        });
        const delivery = await delivered.json();
        const result = await bounded(pending.result);

        // Assert: HTTP delivery is not owner application.
        assert.equal(readBefore.status, 200);
        const beforePayload = await readBefore.json();
        assert.equal(beforePayload.requests.at(-1).phase, 'pending');
        assert.equal(delivered.status, 202);
        assert.equal(delivery.status, 'delivered');
        assert.equal(delivery.saved, false);
        assert.equal(delivery.applied, false);
        assert.equal(result.resultType, 'success');
        const resultDetails = details(result);
        assert.equal(resultDetails.status, 'awaiting_acknowledgment');
        assert.equal(resultDetails.acceptedAnswer, false);
        assert.deepEqual(resultDetails.response, response, 'typed values and authored whitespace are byte-stable');
        assert.equal(sessionFixture.calls.sends.length, 0, 'a response never queues a chat turn');

        const ack = acknowledgment(
          resultDetails.receipt,
          fixture.outcome,
          request.source,
          fixture.kind === 'preview'
            ? {
              preview: {
                reviewedRevision: request.fields.artifact.revision,
                current: request.fields,
              },
            }
            : {},
        );
        const ackResult = await acknowledge(
          sessionFixture.provider,
          ack,
          sessionFixture.session.sessionId,
        );
        const ackDetails = details(ackResult);
        assert.equal(ackDetails.status, fixture.outcome);
        assert.equal(ackDetails.applied, fixture.outcome === 'applied');
        assert.equal(ackDetails.saved, false);
        if (fixture.outcome === 'accepted') {
          assert.equal(ackDetails.applied, false, 'accepted is not applied');
        }
        const readAfter = await (await transportFetch(new URL('/api/needs-you', httpFixture.instance.url))).json();
        assert.equal(readAfter.requests.at(-1).phase, fixture.outcome);
      } finally {
        sessionFixture.provider.dispose();
        await httpFixture.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('closed request and response shapes reject missing, unknown, wrong-choice, and oversized authored input without consuming the waiter', async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const httpFixture = await createHttpFixture(root, fixture.provider);
  try {
    const invalidRequests = [
      { ...sessionRequest('fact'), extra: true },
      { ...sessionRequest('fact'), fields: { input: { kind: 'text', options: [] } } },
      { ...sessionRequest('permission'), fields: { operation: 'x' } },
      { ...sessionRequest('scope_choice'), fields: { options: [{ id: 'only', label: 'Only', consequence: 'None' }] } },
      { ...sessionRequest('fact'), prompt: '🙂'.repeat(Math.floor(NEEDS_YOU_LIMITS.textBytes / 4) + 1) },
    ];
    for (const request of invalidRequests) {
      const call = invocation(fixture.session.sessionId);
      const result = await fixture.provider.tool.handler({ op: 'request', request }, call.invocation);
      assertRefused(result, 'invalid_input');
    }
    assert.deepEqual(fixture.provider.read().requests, []);

    const request = sessionRequest('fact');
    const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
    const invalidResponses = [
      { class: 'fact', action: 'choose' },
      { class: 'fact', action: 'choose', optionId: 'unknown' },
      { class: 'fact', action: 'choose', optionId: 'alpha', unknown: true },
      { class: 'scope_choice', action: 'choose', optionId: 'alpha' },
    ];

    // Act + Assert
    for (const response of invalidResponses) {
      const result = await post(httpFixture.instance.url, '/api/needs-you/respond', {
        requestHandle: pending.record.requestHandle,
        revision: request.revision,
        response,
      });
      assert.equal(result.status, 400);
      assert.deepEqual(await result.json(), { error: 'invalid_input' });
      const current = fixture.provider.read().requests.at(-1);
      assert.equal(current.phase, 'pending');
      assert.equal(current.responding, false);
    }

    await post(httpFixture.instance.url, '/api/needs-you/respond', {
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: { class: 'fact', action: 'choose', optionId: 'alpha' },
    });
    assert.equal(details(await pending.result).response.optionId, 'alpha');
  } finally {
    fixture.provider.dispose();
    await httpFixture.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Needs You HTTP routes are exact, same-origin JSON-only, byte-bounded, UTF-8 strict, and safe for read-only servers', async () => {
  // Arrange
  const readOnlyRoot = temporaryRoot();
  const readOnly = await createHttpFixture(readOnlyRoot, null);
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const live = await createHttpFixture(root, fixture.provider);
  const origin = new URL(live.instance.url).origin;
  const ownHost = new URL(live.instance.url).host;
  try {
    // Read-only Canvas remains useful and exposes no mutation fallback.
    assert.equal((await transportFetch(readOnly.instance.url)).status, 200);
    assert.equal((await transportFetch(new URL('/api/projection', readOnly.instance.url))).status, 200);
    assert.equal((await transportFetch(new URL('/api/needs-you', readOnly.instance.url))).status, 404);
    assert.equal((await post(readOnly.instance.url, '/api/needs-you/respond', {})).status, 404);

    assert.equal((await transportFetch(new URL('/api/needs-you', live.instance.url))).status, 200);
    for (const requestPath of [
      '/api/needs-you?refresh=true',
      '/api/needs-you/',
      '/api/needs-you/respond?again=true',
      '/api/needs-you/capture-receipt/',
      '/api/needs-you/capture/extra',
      '/api/needs-you/review/open?again=true',
      '/api/needs-you/review/save/',
      '/api/needs-you/review/seal/extra',
      '/api/needs-you/review/export',
      '/api/needs-you/cancel',
    ]) {
      const method = requestPath.includes('respond') || requestPath.includes('capture') ? 'POST' : 'GET';
      const response = await transportFetch(new URL(requestPath, live.instance.url), {
        method,
        headers: method === 'POST' ? { origin, 'content-type': 'application/json' } : {},
        body: method === 'POST' ? '{}' : undefined,
      });
      assert.equal(response.status, 404, `${method} ${requestPath}`);
    }
    for (const [requestPath, method] of [
      ['/api/needs-you', 'POST'],
      ['/api/needs-you/respond', 'GET'],
      ['/api/needs-you/respond', 'PUT'],
      ['/api/needs-you/capture-receipt', 'DELETE'],
      ['/api/needs-you/capture', 'PATCH'],
      ['/api/needs-you/review/open', 'GET'],
      ['/api/needs-you/review/save', 'PUT'],
      ['/api/needs-you/review/seal', 'DELETE'],
    ]) {
      const response = await transportFetch(new URL(requestPath, live.instance.url), {
        method,
        headers: { origin, 'content-type': 'application/json' },
        body: ['GET', 'HEAD'].includes(method) ? undefined : '{}',
      });
      assert.equal(response.status, 404, `${method} ${requestPath}`);
    }

    const missingOrigin = await rawRequest(live.instance.server, {
      path: '/api/needs-you/respond',
      method: 'POST',
      headers: { host: ownHost, 'content-type': 'application/json', 'content-length': '2' },
      body: '{}',
    });
    assert.equal(missingOrigin.status, 403);
    const foreignOrigin = await rawRequest(live.instance.server, {
      path: '/api/needs-you/respond',
      method: 'POST',
      headers: {
        host: ownHost,
        origin: 'https://foreign.invalid',
        'content-type': 'application/json',
        'content-length': '2',
      },
      body: '{}',
    });
    assert.equal(foreignOrigin.status, 403);
    const foreignHost = await rawRequest(live.instance.server, {
      path: '/api/needs-you/respond',
      method: 'POST',
      headers: {
        host: 'foreign.invalid',
        origin,
        'content-type': 'application/json',
        'content-length': '2',
      },
      body: '{}',
    });
    assert.equal(foreignHost.status, 403);

    for (const [name, headers] of [
      ['missing Origin', { host: ownHost }],
      ['foreign Origin', { host: ownHost, origin: 'https://foreign.invalid' }],
      ['foreign Host', { host: 'foreign.invalid', origin }],
      ['opaque frame Origin', { host: ownHost, origin: 'null' }],
    ]) {
      const response = await rawRequest(live.instance.server, {
        path: '/api/needs-you/review/open',
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'content-length': '2',
        },
        body: '{}',
      });
      assert.equal(response.status, 403, `review open rejects ${name}`);
    }

    for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) {
      const headers = { host: ownHost, origin, 'content-length': '2' };
      if (contentType) headers['content-type'] = contentType;
      const response = await rawRequest(live.instance.server, {
        path: '/api/needs-you/respond',
        method: 'POST',
        headers,
        body: '{}',
      });
      assert.equal(response.status, 415);
    }
    const malformed = await rawRequest(live.instance.server, {
      path: '/api/needs-you/respond',
      method: 'POST',
      headers: {
        host: ownHost,
        origin,
        'content-type': 'application/json',
        'content-length': '1',
      },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(JSON.parse(malformed.body), { error: 'Request failed.' });

    const invalidUtf8 = Buffer.from([0xc3, 0x28]);
    const utf8 = await rawRequest(live.instance.server, {
      path: '/api/needs-you/respond',
      method: 'POST',
      headers: {
        host: ownHost,
        origin,
        'content-type': 'application/json',
        'content-length': String(invalidUtf8.length),
      },
      body: invalidUtf8,
    });
    assert.equal(utf8.status, 400);
    assert.deepEqual(JSON.parse(utf8.body), { error: 'invalid_input' });

    const oversized = Buffer.alloc(NEEDS_YOU_LIMITS.bodyBytes + 1, 0x20);
    const tooLarge = await rawRequest(live.instance.server, {
      path: '/api/needs-you/respond',
      method: 'POST',
      headers: {
        host: ownHost,
        origin,
        'content-type': 'application/json',
        'content-length': String(oversized.length),
      },
      body: oversized,
    });
    assert.equal(tooLarge.status, 413);
    assert.deepEqual(JSON.parse(tooLarge.body), { error: 'invalid_input' });

    const oversizedReview = Buffer.alloc(REVIEW_LIMITS.bodyBytes + 1, 0x20);
    const reviewTooLarge = await rawRequest(live.instance.server, {
      path: '/api/needs-you/review/save',
      method: 'POST',
      headers: {
        host: ownHost,
        origin,
        'content-type': 'application/json',
        'content-length': String(oversizedReview.length),
      },
      body: oversizedReview,
    });
    assert.equal(reviewTooLarge.status, 413);
    assert.deepEqual(JSON.parse(reviewTooLarge.body), { error: 'invalid_input' });
    const reviewInvalidUtf8 = await rawRequest(live.instance.server, {
      path: '/api/needs-you/review/seal',
      method: 'POST',
      headers: {
        host: ownHost,
        origin,
        'content-type': 'application/json',
        'content-length': String(invalidUtf8.length),
      },
      body: invalidUtf8,
    });
    assert.equal(reviewInvalidUtf8.status, 400);
    assert.deepEqual(JSON.parse(reviewInvalidUtf8.body), { error: 'invalid_input' });
    assert.equal((await transportFetch(new URL('/api/needs-you', live.instance.url))).status, 200);
  } finally {
    fixture.provider.dispose();
    await live.close();
    await readOnly.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(readOnlyRoot, { recursive: true, force: true });
  }
});

test('T011 SSE emits only exact named refresh hints for healthy idle, source admission, response, and acknowledgment', async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const fixture = createProviderFixture(root);
  const live = await createHttpFixture(root, fixture.provider);
  const abort = new AbortController();
  const secret = 'CONSENT-SECRET-\u00a0-回答';
  try {
    const stream = await transportFetch(new URL('/events', live.instance.url), { signal: abort.signal });
    const reader = /** @type {ReadableStream<Uint8Array>} */ (stream.body).getReader();
    let buffered = '';
    const nextEvent = async () => {
      while (!buffered.includes('\n\n')) {
        const part = await bounded(reader.read());
        assert.equal(part.done, false);
        buffered += new TextDecoder().decode(part.value, { stream: true });
      }
      const boundary = buffered.indexOf('\n\n') + 2;
      const event = buffered.slice(0, boundary);
      buffered = buffered.slice(boundary);
      return event;
    };
    assert.equal(await nextEvent(), ': connected\n\n');
    const request = sessionRequest('permission', {
      prompt: `Never log ${secret}`,
      scope: feature.scope,
      source: feature.fileSource(),
      fields: {
        ...sessionRequest('permission').fields,
        confirmation: secret,
      },
    });

    // Act
    fixture.provider.onEvent({
      id: 'healthy-idle-publication',
      type: 'session.idle',
      data: { aborted: false },
    });
    const idleEvent = await nextEvent();
    const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
    const admissionEvent = await nextEvent();
    const response = await post(live.instance.url, '/api/needs-you/respond', {
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: {
        class: 'permission',
        action: 'consent',
        operation: request.fields.operation,
        targets: request.fields.targets,
        confirmation: secret,
      },
    });
    const responseEvent = await nextEvent();
    const delivered = details(await pending.result);
    const ownerResult = await acknowledge(
      fixture.provider,
      acknowledgment(delivered.receipt, 'applied', request.source),
      fixture.session.sessionId,
    );
    const acknowledgmentEvents = [];
    for (let index = 0; index < 4; index += 1) {
      const event = await nextEvent();
      acknowledgmentEvents.push(event);
      if (event.startsWith('event: workspace\n')) break;
    }

    // Assert
    const workspaceHint = 'event: workspace\ndata: {"refresh":true}\n\n';
    const needsHint = 'event: needs-you\ndata: {"refresh":true}\n\n';
    assert.equal(idleEvent, workspaceHint,
      'ordinary healthy chat completion asks an open Canvas to reread canonical work');
    assert.equal(admissionEvent, workspaceHint,
      'source-qualified request admission invalidates both work and request views');
    assert.equal(response.status, 202);
    assert.equal(responseEvent, needsHint,
      'a response receipt changes only the transient request feed');
    assert.equal(details(ownerResult).status, 'applied');
    assert.equal(acknowledgmentEvents.at(-1), workspaceHint,
      'owner acknowledgment with a canonical source causes an authoritative reread');
    assert.ok(acknowledgmentEvents.slice(0, -1).every((event) => event === needsHint),
      'intermediate response-state invalidations remain content-free Needs You hints');
    const streamed = `${idleEvent}${admissionEvent}${responseEvent}${acknowledgmentEvents.join('')}`;
    assert.doesNotMatch(streamed, new RegExp(secret));
    assert.doesNotMatch(streamed, new RegExp(feature.ideaPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(streamed, /requestHandle|requestRef|receiptId|revision|answer|consent|token/i);
    assert.doesNotMatch(JSON.stringify(live.logs), new RegExp(secret));
    assert.deepEqual(live.logs, [`Dude canvas ${live.instanceId}: renderer attached.`]);
  } finally {
    abort.abort();
    fixture.provider.dispose();
    await live.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 capture preparation distinguishes explicit idle null, omitted legacy waiter, and an exact intended waiter', async (t) => {
  await t.test('explicit null requires healthy idle and rejects bad body fields before allocation', async () => {
    // Arrange
    const root = temporaryRoot();
    const fixture = createProviderFixture(root);
    try {
      await assert.rejects(
        fixture.provider.issueCaptureReceipt({ requestHandle: null, extra: true }),
        (error) => error instanceof NeedsYouError && error.code === 'invalid_input',
      );
      assert.deepEqual(fixture.provider.read().captures, []);
      fixture.provider.onEvent({
        id: 'explicit-idle',
        type: 'session.idle',
        data: { aborted: false },
      });

      // Act
      const prepared = await fixture.provider.issueCaptureReceipt({ requestHandle: null });

      // Assert
      assert.equal(prepared.status, 'prepared');
      assert.equal(prepared.throughRequest, null);
      assert.match(prepared.captureReceipt, /^[a-f0-9-]{36}$/);
      assert.equal(fixture.provider.read().captures.length, 1);
      assert.equal(fixture.calls.sends.length, 0, 'preparation alone sends or saves nothing');
    } finally {
      fixture.provider.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('omitted selector retains the existing sole-waiter behavior', async () => {
    // Arrange
    const root = temporaryRoot();
    const fixture = createProviderFixture(root);
    const pending = await publishRequest(
      fixture.provider,
      sessionRequest('fact', { requestRef: 'omitted-selector' }),
      fixture.session.sessionId,
    );
    try {
      // Act
      const prepared = await fixture.provider.issueCaptureReceipt({});

      // Assert
      assert.equal(prepared.throughRequest, pending.record.requestHandle);
      assert.equal(fixture.provider.read().captures[0].receipt.originalToolCallId, pending.invocation.toolCallId);
    } finally {
      fixture.provider.dispose();
      await pending.result;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('an exact selector binds only its intended waiter and leaves another request untouched', async () => {
    // Arrange
    const root = temporaryRoot();
    const fixture = createProviderFixture(root);
    const intended = await publishRequest(
      fixture.provider,
      sessionRequest('fact', { requestRef: 'intended-selector' }),
      fixture.session.sessionId,
    );
    const unrelated = await publishRequest(
      fixture.provider,
      sessionRequest('fact', { requestRef: 'unrelated-selector' }),
      fixture.session.sessionId,
    );
    try {
      // Act
      const prepared = await fixture.provider.issueCaptureReceipt({
        requestHandle: intended.record.requestHandle,
      });

      // Assert
      assert.equal(prepared.throughRequest, intended.record.requestHandle);
      const current = fixture.provider.read();
      assert.equal(
        current.requests.find(({ requestHandle }) => requestHandle === unrelated.record.requestHandle).phase,
        'pending',
      );
      assert.equal(current.capture.waitingRequests.includes(unrelated.record.requestHandle), true);
    } finally {
      fixture.provider.dispose();
      await Promise.all([intended.result, unrelated.result]);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('T011 explicit idle preparation is atomic against a waiter admitted during its queue read', {
  timeout: 10_000,
}, async () => {
  // Arrange
  const root = temporaryRoot();
  const entered = deferred();
  const release = deferred();
  const fixture = createProviderFixture(root, {
    session: {
      pendingItems: async () => {
        entered.resolve();
        await release.promise;
        return { items: [], steeringMessages: [], inFlightSteeringCount: 0 };
      },
    },
  });
  let racing;
  try {
    fixture.provider.onEvent({
      id: 'idle-before-racing-waiter',
      type: 'session.idle',
      data: { aborted: false },
    });
    const preparation = fixture.provider.issueCaptureReceipt({ requestHandle: null });
    await bounded(entered.promise);
    racing = await publishRequest(
      fixture.provider,
      sessionRequest('fact', { requestRef: 'racing-waiter' }),
      fixture.session.sessionId,
    );

    // Act
    release.resolve();

    // Assert
    await assert.rejects(
      bounded(preparation),
      (error) => error instanceof NeedsYouError && error.code === 'idle_required',
    );
    assert.deepEqual(fixture.provider.read().captures, [],
      'the losing idle preparation allocates no unused or waiter-bound receipt');
    assert.equal(fixture.provider.read().requests[0].phase, 'pending');
    assert.equal(fixture.calls.sends.length, 0);
  } finally {
    release.resolve();
    fixture.provider.dispose();
    if (racing) await racing.result;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 root replacement without a waiter invalidates idle capture authority and never writes the replacement', async () => {
  // Arrange
  const root = temporaryRoot();
  const moved = `${root}-original`;
  const fixture = createProviderFixture(root);
  try {
    fixture.provider.onEvent({
      id: 'idle-before-root-replacement',
      type: 'session.idle',
      data: { aborted: false },
    });
    fs.renameSync(root, moved);
    fs.mkdirSync(root);
    write(root, 'replacement-sentinel.txt', 'replacement workspace\n');

    // Act
    const refreshed = await fixture.provider.refresh();

    // Assert
    assert.equal(refreshed.coverage.state, 'unavailable');
    assert.equal(refreshed.coverage.reason, 'workspace_changed');
    assert.equal(refreshed.capture.idle, false);
    assert.deepEqual(refreshed.captures, []);
    await assert.rejects(
      fixture.provider.issueCaptureReceipt({ requestHandle: null }),
      (error) => error instanceof NeedsYouError && error.code === 'provider_unavailable',
    );
    assert.deepEqual(fs.readdirSync(root), ['replacement-sentinel.txt']);
    assert.equal(bytes(root, 'replacement-sentinel.txt').toString('utf8'), 'replacement workspace\n');
  } finally {
    fixture.provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(moved, { recursive: true, force: true });
  }
});

test('provider retention is bounded and refuses the sixty-fifth unresolved record without eviction', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const pending = [];
  try {
    assert.deepEqual(fixture.provider.read().limits, NEEDS_YOU_LIMITS);

    // Act
    for (let index = 0; index < NEEDS_YOU_LIMITS.records; index += 1) {
      pending.push(await publishRequest(
        fixture.provider,
        sessionRequest('onboarding', { requestRef: `capacity-${index}` }),
        fixture.session.sessionId,
      ));
    }
    const overflowCall = invocation(fixture.session.sessionId);
    const overflow = await fixture.provider.tool.handler({
      op: 'request',
      request: sessionRequest('onboarding', { requestRef: 'capacity-overflow' }),
    }, overflowCall.invocation);

    // Assert
    assertRefused(overflow, 'capacity');
    assert.equal(fixture.provider.read().requests.length, NEEDS_YOU_LIMITS.records);
    assert.ok(fixture.provider.read().requests.every((entry) => entry.phase === 'pending'));
  } finally {
    fixture.provider.dispose();
    await Promise.all(pending.map((entry) => entry.result));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('retained UTF-8 byte budget refuses new publication before record capacity without evicting unresolved waiters', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const pending = [];
  let refusal = null;
  try {
    // Each production-reachable request remains below the body and individual
    // text limits, but the provider-wide retained-byte limit must still apply.
    for (let index = 0; index < NEEDS_YOU_LIMITS.records; index += 1) {
      const request = sessionRequest('onboarding', {
        requestRef: `retained-${index}`,
        prompt: 'p'.repeat(NEEDS_YOU_LIMITS.textBytes),
        whyHuman: 'h'.repeat(4_096),
        unblocks: 'u'.repeat(4_096),
      });
      const call = invocation(fixture.session.sessionId);
      const before = fixture.provider.read().requests.length;
      const result = fixture.provider.tool.handler({ op: 'request', request }, call.invocation);
      await new Promise((resolve) => setImmediate(resolve));
      if (fixture.provider.read().requests.length === before) {
        refusal = await result;
        break;
      }
      await until(
        () => fixture.provider.read().requests.find(
          (entry) => entry.request.requestRef === request.requestRef && entry.phase === 'pending',
        ),
        `retained request ${index}`,
      );
      pending.push({ ...call, result });
    }

    // Act + Assert
    assert.ok(refusal, 'the retained-byte ceiling must be reached by bounded live records');
    assertRefused(refusal, 'capacity');
    assert.ok(fixture.provider.read().requests.length < NEEDS_YOU_LIMITS.records);
    assert.ok(fixture.provider.read().requests.length > 1);
    assert.ok(fixture.provider.read().requests.every((entry) => entry.phase === 'pending'));
  } finally {
    fixture.provider.dispose();
    await Promise.all(pending.map((entry) => entry.result));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('one provider is shared by Canvas instances, deduplicates only exact scope, and leaves unrelated contexts responsive', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const firstIdea = createDraft(root, '001', 'first');
  const secondIdea = createDraft(root, '002', 'second');
  const fixture = createProviderFixture(root);
  const firstCanvas = await createHttpFixture(root, fixture.provider);
  const secondCanvas = await createHttpFixture(root, fixture.provider);
  const remaining = [];
  try {
    const request = sessionRequest('onboarding', { requestRef: 'shared-request' });
    const original = await publishRequest(fixture.provider, request, fixture.session.sessionId);
    remaining.push(original);
    const duplicateInvocation = invocation(fixture.session.sessionId);

    // Act: the same logical publication gets a reference, not a second waiter.
    const duplicate = await fixture.provider.tool.handler(
      { op: 'request', request },
      duplicateInvocation.invocation,
    );
    const [firstRead, secondRead] = await Promise.all([
      transportFetch(new URL('/api/needs-you', firstCanvas.instance.url)).then((response) => response.json()),
      transportFetch(new URL('/api/needs-you', secondCanvas.instance.url)).then((response) => response.json()),
    ]);

    // Assert
    assert.equal(details(duplicate).status, 'already_published');
    assert.equal(details(duplicate).requestHandle, original.record.requestHandle);
    assert.equal(fixture.provider.read().requests.length, 1);
    assert.equal(firstRead.providerGeneration, secondRead.providerGeneration);
    assert.equal(firstRead.sessionId, secondRead.sessionId);
    assert.equal(firstRead.requests[0].requestHandle, secondRead.requests[0].requestHandle);

    const scoped = (ideaPath, requestRef) => sessionRequest('onboarding', {
      owner: 'dude',
      requestRef,
      scope: { kind: 'idea', ideaPath },
      source: { kind: 'file', path: ideaPath, revision: revision(bytes(root, ideaPath)) },
      revision: `revision-${requestRef}`,
    });
    const inFirst = await publishRequest(
      fixture.provider,
      scoped(firstIdea, 'same-owner-ref'),
      fixture.session.sessionId,
    );
    const inSecond = await publishRequest(
      fixture.provider,
      scoped(secondIdea, 'same-owner-ref'),
      fixture.session.sessionId,
    );
    remaining.push(inFirst, inSecond);
    assert.notEqual(inFirst.record.requestHandle, inSecond.record.requestHandle);
    assert.deepEqual(
      fixture.provider.read().requests
        .filter((entry) => entry.request.requestRef === 'same-owner-ref')
        .map((entry) => entry.request.scope.ideaPath)
        .sort(),
      [firstIdea, secondIdea],
      'similar requests in exact distinct scopes must remain distinct',
    );

    const firstResponse = await post(firstCanvas.instance.url, '/api/needs-you/respond', {
      requestHandle: inFirst.record.requestHandle,
      revision: inFirst.record.request.revision,
      response: {
        class: 'onboarding',
        action: 'answer',
        text: 'Only the first idea response.',
      },
    });
    assert.equal(firstResponse.status, 202);
    assert.equal(details(await inFirst.result).status, 'awaiting_acknowledgment');
    assert.equal(
      fixture.provider.read().requests.find((entry) => entry.requestHandle === inSecond.record.requestHandle).phase,
      'pending',
      'answering one scope must not consume the other',
    );
    const projection = await transportFetch(new URL('/api/projection', secondCanvas.instance.url));
    assert.equal(projection.status, 200, 'read-only context stays responsive while another request waits');

    const changedInvocation = invocation(fixture.session.sessionId);
    const changedPublication = fixture.provider.tool.handler({
      op: 'request',
      request: { ...request, prompt: 'A materially changed publication.' },
    }, changedInvocation.invocation);
    const originalResult = await original.result;
    const changedResult = await changedPublication;
    assert.equal(details(originalResult).status, 'source_changed');
    assert.equal(details(originalResult).acceptedAnswer, false);
    assertRefused(changedResult, 'publication_conflict');
    assert.equal(
      fixture.provider.read().requests.filter((entry) => entry.request.requestRef === request.requestRef).length,
      1,
      'a conflicting publication invalidates the old waiter but cannot create a successor implicitly',
    );

    await firstCanvas.close();
    const survivingRead = await transportFetch(new URL('/api/needs-you', secondCanvas.instance.url));
    assert.equal(survivingRead.status, 200, 'closing one Canvas cannot dispose the joined provider');
  } finally {
    for (const entry of remaining) entry.controller.abort();
    fixture.provider.dispose();
    await Promise.allSettled(remaining.map((entry) => entry.result));
    await firstCanvas.close();
    await secondCanvas.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('wrong handle, revision, class, session, duplicate submit, and concurrent response are refused without stealing the valid delivery', async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const request = sessionRequest('onboarding');
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  try {
    const response = { class: 'onboarding', action: 'answer', text: 'Current literal answer.' };
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: randomUUID(),
        revision: request.revision,
        response,
      }),
      (error) => error instanceof NeedsYouError && error.code === 'unknown_request',
    );
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: pending.record.requestHandle,
        revision: 'wrong-revision',
        response,
      }),
      (error) => error instanceof NeedsYouError && error.code === 'invalid_input',
    );
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: pending.record.requestHandle,
        revision: request.revision,
        response: { class: 'fact', action: 'answer', text: 'wrong class' },
      }),
      (error) => error instanceof NeedsYouError && error.code === 'invalid_input',
    );
    const wrongSession = invocation('another-session');
    const wrongSessionResult = await fixture.provider.tool.handler(
      { op: 'request', request: sessionRequest('fact') },
      wrongSession.invocation,
    );
    assertRefused(wrongSessionResult, 'identity_mismatch');

    const gate = deferred();
    fixture.state.pendingItems = () => gate.promise;
    const delivering = fixture.provider.respond({
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response,
    });
    await until(
      () => fixture.provider.read().requests.find(
        (entry) => entry.requestHandle === pending.record.requestHandle && entry.responding,
      ),
      'first response in progress',
    );

    // Act + Assert
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: pending.record.requestHandle,
        revision: request.revision,
        response,
      }),
      (error) => error instanceof NeedsYouError && error.code === 'response_in_progress',
    );
    gate.resolve({ items: [], steeringMessages: [], inFlightSteeringCount: 0 });
    const delivered = await delivering;
    assert.equal(delivered.status, 'delivered');
    assert.equal(details(await pending.result).response.text, response.text);
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: pending.record.requestHandle,
        revision: request.revision,
        response,
      }),
      (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
    );
  } finally {
    fixture.provider.dispose();
    await pending.result;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('acknowledgment identity is exact and concurrent or duplicate acknowledgments cannot both win', async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const request = sessionRequest('fact');
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  try {
    await fixture.provider.respond({
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: { class: 'fact', action: 'choose', optionId: 'alpha' },
    });
    const responseResult = details(await pending.result);
    const valid = acknowledgment(responseResult.receipt, 'applied', request.source);
    const wrongValues = [
      { ...valid, receiptId: randomUUID() },
      { ...valid, owner: 'another-owner' },
      { ...valid, requestRef: 'another-ref' },
      { ...valid, scope: { kind: 'idea', ideaPath: '.dude/ideas/999-missing.md' } },
      { ...valid, previousRevision: 'another-revision' },
      { ...valid, recognizes: 'outside_answer' },
    ];
    for (const candidate of wrongValues) {
      const result = await acknowledge(
        fixture.provider,
        candidate,
        fixture.session.sessionId,
      );
      assertRefused(result, candidate.receiptId === valid.receiptId ? 'acknowledgment_conflict' : 'unknown_receipt');
    }

    // Act: the first acknowledgment yields at its reread, keeping the conflict
    // guard observable to a second invocation in the same event-loop turn.
    const first = acknowledge(fixture.provider, valid, fixture.session.sessionId);
    const second = acknowledge(fixture.provider, valid, fixture.session.sessionId);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    // Assert
    assert.equal(details(firstResult).status, 'applied');
    assertRefused(secondResult, 'acknowledgment_conflict');
    const duplicate = await acknowledge(fixture.provider, valid, fixture.session.sessionId);
    assertRefused(duplicate, 'acknowledgment_conflict');
    assert.equal(fixture.provider.read().requests.at(-1).phase, 'applied');
  } finally {
    fixture.provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('delivery with no acknowledgment remains unresolved and cannot be republished or retried implicitly', async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const request = sessionRequest('onboarding', { requestRef: 'missing-ack' });
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  try {
    await fixture.provider.respond({
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: { class: 'onboarding', action: 'answer', text: 'Delivered but not yet applied.' },
    });
    const result = details(await pending.result);
    assert.equal(result.status, 'awaiting_acknowledgment');

    // Act
    const refreshed = await fixture.provider.refresh();
    const duplicateCall = invocation(fixture.session.sessionId);
    const duplicate = await fixture.provider.tool.handler(
      { op: 'request', request },
      duplicateCall.invocation,
    );

    // Assert
    assert.equal(refreshed.requests.at(-1).phase, 'awaiting_acknowledgment');
    assert.equal(refreshed.requests.at(-1).receipt.acknowledgment, null);
    assert.equal(details(duplicate).status, 'already_published');
    assert.equal(details(duplicate).phase, 'awaiting_acknowledgment');
    assert.equal(fixture.provider.read().requests.length, 1);
    assert.equal(fixture.calls.sends.length, 0, 'refresh and republish never retry a response');
  } finally {
    fixture.provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file-backed requests reread exact source, stay stale after byte undo, and require explicit outside-answer recognition', async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const originalIdea = bytes(root, feature.ideaPath);
  const fixture = createProviderFixture(root);
  const httpFixture = await createHttpFixture(root, fixture.provider);
  const request = sessionRequest('fact', {
    owner: 'dude-spec-lead',
    requestRef: 'file-backed-fact',
    scope: feature.scope,
    source: feature.fileSource(),
    revision: 'file-backed-request-a',
  });
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  try {
    write(root, feature.ideaPath, Buffer.concat([originalIdea, Buffer.from('\nOutside answer.\n')]));

    // Act
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: pending.record.requestHandle,
        revision: request.revision,
        response: { class: 'fact', action: 'choose', optionId: 'alpha' },
      }),
      (error) => error instanceof NeedsYouError && error.code === 'source_changed',
    );
    const invalidated = details(await pending.result);

    // Assert
    assert.equal(invalidated.status, 'source_changed');
    assert.equal(invalidated.acceptedAnswer, false);
    assert.equal(invalidated.response, null);
    assert.equal(invalidated.receipt.recognizes, 'outside_answer');
    assert.deepEqual(invalidated.receipt.scope, feature.scope);

    write(root, feature.ideaPath, originalIdea);
    const afterUndo = await fixture.provider.refresh();
    const stale = afterUndo.requests.find((entry) => entry.requestHandle === pending.record.requestHandle);
    assert.equal(stale.phase, 'source_changed', 'restoring bytes cannot resurrect the consumed waiter');
    assert.equal(stale.receipt.freshness, 'stale');
    assert.equal(stale.receipt.acknowledgment, null);

    const wrongRecognition = await acknowledge(
      fixture.provider,
      acknowledgment(invalidated.receipt, 'accepted', request.source, {
        recognizes: 'canvas_response',
      }),
      fixture.session.sessionId,
    );
    assertRefused(wrongRecognition, 'acknowledgment_conflict');

    const recognized = await acknowledge(
      fixture.provider,
      acknowledgment(invalidated.receipt, 'accepted', request.source, {
        note: 'The definition owner explicitly located and recognized the outside answer.',
      }),
      fixture.session.sessionId,
    );
    assert.equal(details(recognized).status, 'accepted');
    assert.equal(details(recognized).applied, false);

    write(root, feature.ideaPath, Buffer.concat([originalIdea, Buffer.from('\nChanged again.\n')]));
    const refreshed = await transportFetch(new URL('/api/needs-you', httpFixture.instance.url));
    const current = await refreshed.json();
    const drifted = current.requests.find((entry) => entry.requestHandle === pending.record.requestHandle);
    assert.equal(drifted.receipt.freshness, 'stale');
    assert.equal(drifted.receipt.current, false);
    assert.equal(current.coverage.state, 'partial');
    assert.deepEqual(current.coverage.affected, [{
      scope: feature.scope,
      requestHandle: pending.record.requestHandle,
      phase: 'accepted',
    }]);
  } finally {
    fixture.provider.dispose();
    await httpFixture.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked source uses the real projection/process boundary and invalidates when the normalized board identity changes', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const issues = [{
    id: 'tracked-active',
    issue_type: 'task',
    status: 'in_progress',
    title: 'Tracked active task',
    description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
  }];
  try {
    await withTrackedBoard(issues, async (board) => {
      const fixture = createProviderFixture(root);
      const source = {
        kind: 'tracked',
        revision: revision(JSON.stringify(issues)),
      };
      const request = sessionRequest('fact', {
        owner: 'dude',
        requestRef: 'tracked-source',
        scope: feature.scope,
        source,
        revision: 'tracked-request-a',
      });
      const first = await publishRequest(fixture.provider, request, fixture.session.sessionId);
      let second;
      try {
        await fixture.provider.respond({
          requestHandle: first.record.requestHandle,
          revision: request.revision,
          response: { class: 'fact', action: 'choose', optionId: 'alpha' },
        });
        const firstResult = details(await first.result);
        assert.equal(firstResult.status, 'awaiting_acknowledgment');
        const acknowledged = await acknowledge(
          fixture.provider,
          acknowledgment(firstResult.receipt, 'accepted', source),
          fixture.session.sessionId,
        );
        assert.equal(details(acknowledged).status, 'accepted');

        const requestB = { ...request, requestRef: 'tracked-source-b', revision: 'tracked-request-b' };
        second = await publishRequest(fixture.provider, requestB, fixture.session.sessionId);
        board.setIssues([{ ...issues[0], title: 'Changed tracked task' }]);

        // Act
        await assert.rejects(
          fixture.provider.respond({
            requestHandle: second.record.requestHandle,
            revision: requestB.revision,
            response: { class: 'fact', action: 'choose', optionId: 'beta' },
          }),
          (error) => error instanceof NeedsYouError && error.code === 'source_changed',
        );

        // Assert
        const changed = details(await second.result);
        assert.equal(changed.status, 'source_changed');
        assert.equal(changed.acceptedAnswer, false);
        assert.equal(changed.response, null);
      } finally {
        second?.controller.abort();
        fixture.provider.dispose();
        await Promise.allSettled([second?.result].filter(Boolean));
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file source changing during an asynchronous response boundary cannot be accepted from the old snapshot', async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const fixture = createProviderFixture(root);
  const request = sessionRequest('fact', {
    scope: feature.scope,
    source: feature.fileSource(),
    revision: 'async-file-race',
  });
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  const queueGate = deferred();
  fixture.state.pendingItems = () => queueGate.promise;
  try {
    const responding = fixture.provider.respond({
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: { class: 'fact', action: 'choose', optionId: 'alpha' },
    });
    await until(
      () => fixture.provider.read().requests.at(-1)?.responding,
      'file-backed response boundary',
    );
    write(root, feature.ideaPath, Buffer.concat([bytes(root, feature.ideaPath), Buffer.from('\nrace edit\n')]));
    queueGate.resolve({ items: [], steeringMessages: [], inFlightSteeringCount: 0 });

    // Act + Assert
    await assert.rejects(
      responding,
      (error) => error instanceof NeedsYouError && error.code === 'source_changed',
    );
    const result = details(await pending.result);
    assert.equal(result.status, 'source_changed');
    assert.equal(result.acceptedAnswer, false);
    assert.equal(result.response, null);
  } finally {
    queueGate.resolve({ items: [], steeringMessages: [], inFlightSteeringCount: 0 });
    fixture.provider.dispose();
    await Promise.allSettled([pending.result]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exact owner and regular contained source checks refuse ambiguity, missing owners, malformed tasks, traversal, symlinks, and directories', async (t) => {
  const cases = [
    {
      name: 'ambiguous feature owner',
      arrange(root, feature) {
        const otherIdea = '.dude/ideas/002-conflict.md';
        write(root, otherIdea, [
          '---',
          'title: conflict',
          'slug: conflict',
          'status: defined',
          `spec_path: ${feature.specPath}`,
          '---',
          '',
          '## Idea',
          '',
          'Conflicting owner.',
          '',
        ].join('\n'));
        return sessionRequest('fact', {
          scope: feature.scope,
          source: feature.fileSource(),
          revision: 'ambiguous-owner',
        });
      },
      reason: 'unavailable',
      initialOwnershipFailure: true,
    },
    {
      name: 'exact missing idea path with no slug fallback',
      arrange(root, feature) {
        const missingScope = {
          kind: 'feature',
          ideaPath: '.dude/ideas/999-feature.md',
          specPath: feature.specPath,
        };
        return sessionRequest('fact', {
          scope: missingScope,
          source: feature.fileSource(),
          revision: 'missing-owner',
        });
      },
      reason: 'unavailable',
      initialOwnershipFailure: true,
    },
    {
      name: 'malformed tasks source',
      arrange(root, feature) {
        write(root, feature.tasksPath, '```text\nunclosed task-board fence\n');
        return sessionRequest('fact', {
          scope: feature.scope,
          source: feature.fileSource(feature.tasksPath),
          revision: 'malformed-tasks',
        });
      },
      reason: 'unavailable',
    },
    {
      name: 'traversal source',
      arrange(root, feature) {
        return sessionRequest('fact', {
          scope: feature.scope,
          source: {
            kind: 'file',
            path: `${feature.directory}/design/../../../../outside.md`,
            revision: revision('outside'),
          },
          revision: 'traversal',
        });
      },
      reason: 'invalid_input',
    },
    {
      name: 'symlink source',
      arrange(root, feature) {
        const outside = path.join(root, 'outside.txt');
        fs.writeFileSync(outside, 'outside');
        const relative = `${feature.directory}/design/link.txt`;
        fs.symlinkSync(outside, path.join(root, ...relative.split('/')));
        return sessionRequest('fact', {
          scope: feature.scope,
          source: { kind: 'file', path: relative, revision: revision('outside') },
          revision: 'symlink-source',
        });
      },
      reason: 'unavailable',
    },
    {
      name: 'nonregular directory source',
      arrange(root, feature) {
        const relative = `${feature.directory}/design`;
        return sessionRequest('fact', {
          scope: feature.scope,
          source: { kind: 'file', path: relative, revision: revision('directory') },
          revision: 'directory-source',
        });
      },
      reason: 'unavailable',
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      // Arrange
      const root = temporaryRoot();
      const feature = createFeature(root);
      const fixture = createProviderFixture(root);
      try {
        const request = entry.arrange(root, feature);
        const call = invocation(fixture.session.sessionId);

        // Act
        const result = await bounded(fixture.provider.tool.handler(
          { op: 'request', request },
          call.invocation,
        ));

        // Assert
        if (entry.reason === 'invalid_input') assertRefused(result, entry.reason);
        else {
          const resultDetails = details(result);
          if (entry.initialOwnershipFailure) {
            assert.deepEqual(resultDetails, {
              status: 'unavailable',
              acceptedAnswer: false,
              response: null,
              receipt: null,
            }, 'initial owner admission failure has no outside-answer receipt authority');
          } else {
            assert.equal(resultDetails.status, 'unavailable');
            assert.equal(resultDetails.acceptedAnswer, false);
            assert.equal(resultDetails.response, null);
          }
        }
        assert.equal(fixture.calls.sends.length, 0);
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('owner removal after publication invalidates only that waiter as a typed non-answer', async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const fixture = createProviderFixture(root);
  const request = sessionRequest('fact', {
    scope: feature.scope,
    source: feature.fileSource(),
    revision: 'owner-removal',
  });
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  try {
    fs.rmSync(path.join(root, ...feature.ideaPath.split('/')));

    // Act
    await assert.rejects(
      fixture.provider.respond({
        requestHandle: pending.record.requestHandle,
        revision: request.revision,
        response: { class: 'fact', action: 'choose', optionId: 'alpha' },
      }),
      (error) => error instanceof NeedsYouError && error.code === 'owner_unavailable',
    );

    // Assert
    const result = details(await pending.result);
    assert.equal(result.status, 'source_changed');
    assert.equal(result.acceptedAnswer, false);
    assert.deepEqual(result.receipt.scope, feature.scope);
    assert.equal(fixture.provider.read().coverage.state, 'partial');
  } finally {
    fixture.provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preview source or asset drift during asynchronous adapter validation cannot be retargeted or consumed', async (t) => {
  for (const changed of ['artifact', 'asset']) {
    await t.test(changed, async () => {
      // Arrange
      const root = temporaryRoot();
      const feature = createFeature(root);
      const entered = deferred();
      const release = deferred();
      const adapter = {
        async readSealedSubmission(input) {
          const result = sealedReview(input);
          entered.resolve();
          await release.promise;
          return result;
        },
      };
      const fixture = createProviderFixture(root, { reviewAdapter: adapter });
      const request = previewRequest(feature, { requestRef: `drift-${changed}` });
      const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
      const submissionId = randomUUID();
      try {
        const responding = fixture.provider.respond({
          requestHandle: pending.record.requestHandle,
          revision: request.revision,
          response: {
            class: 'preview',
            action: 'annotations',
            submissionId,
            text: 'Keep this exact revision note.',
          },
        });
        await entered.promise;
        const changedPath = changed === 'artifact' ? feature.artifactPath : feature.assetPath;
        write(root, changedPath, Buffer.concat([bytes(root, changedPath), Buffer.from('\n/* drift */\n')]));
        release.resolve();

        // Act + Assert
        await assert.rejects(
          responding,
          (error) => error instanceof NeedsYouError && error.code === 'source_changed',
        );
        const result = details(await pending.result);
        assert.equal(result.status, 'source_changed');
        assert.equal(result.acceptedAnswer, false);
        assert.equal(result.response, null);
        assert.equal(result.binaryResultsForLlm, undefined);
        assert.equal(fixture.calls.sends.length, 0);
      } finally {
        release.resolve();
        fixture.provider.dispose();
        await Promise.allSettled([pending.result]);
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('permission response requires exact operation, ordered targets, revisions, content, and literal confirmation but executes nothing', async () => {
      // Arrange
      const root = temporaryRoot();
      const feature = createFeature(root);
      const fixture = createProviderFixture(root);
      const request = sessionRequest('permission', {
        owner: 'dude',
        requestRef: 'exact-permission',
        scope: feature.scope,
        source: feature.fileSource(),
        revision: 'permission-revision-a',
      });
      const before = snapshotFiles(root);
      const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
      const exact = {
        class: 'permission',
        action: 'consent',
        operation: request.fields.operation,
        targets: request.fields.targets,
        confirmation: request.fields.confirmation,
      };
      try {
        const invalid = [
          { ...exact, operation: 'remove-another-claim' },
          { ...exact, targets: [...exact.targets].reverse() },
          {
            ...exact,
            targets: exact.targets.map((target, index) => (
              index ? target : { ...target, revision: 'older-target-revision' }
            )),
          },
          {
            ...exact,
            targets: exact.targets.map((target, index) => (
              index ? target : { ...target, target: `${target.target} ` }
            )),
          },
          { ...exact, confirmation: exact.confirmation.toLowerCase() },
          { ...exact, confirmation: ` ${exact.confirmation}` },
          { ...exact, additionalAssent: 'yes' },
        ];
        for (const response of invalid) {
          await assert.rejects(
            fixture.provider.respond({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
              response,
            }),
            (error) => error instanceof NeedsYouError && error.code === 'invalid_input',
          );
          assert.equal(fixture.provider.read().requests.at(-1).phase, 'pending');
        }

        // Act
        const delivery = await fixture.provider.respond({
          requestHandle: pending.record.requestHandle,
          revision: request.revision,
          response: exact,
        });
        const result = details(await pending.result);

        // Assert
        assert.equal(delivery.applied, false);
        assert.equal(result.status, 'awaiting_acknowledgment');
        assert.deepEqual(result.response, exact);
        assert.deepEqual(snapshotFiles(root), before, 'consent transport cannot execute or write the operation');
        assert.equal(fixture.calls.sends.length, 0);
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('preview approval binds only the exact current artifact and a successor receives no inherited approval', async () => {
      // Arrange
      const root = temporaryRoot();
      const feature = createFeature(root);
      const fixture = createProviderFixture(root);
      const requestA = previewRequest(feature, {
        requestRef: 'successive-preview',
        revision: 'preview-a',
      });
      const pendingA = await publishRequest(fixture.provider, requestA, fixture.session.sessionId);
      let pendingB;
      try {
        await assert.rejects(
          fixture.provider.respond({
            requestHandle: pendingA.record.requestHandle,
            revision: requestA.revision,
            response: {
              class: 'preview',
              action: 'approve',
              artifactRevision: revision('another artifact'),
            },
          }),
          (error) => error instanceof NeedsYouError && error.code === 'invalid_input',
        );
        assert.equal(fixture.provider.read().requests.at(-1).phase, 'pending');

        await fixture.provider.respond({
          requestHandle: pendingA.record.requestHandle,
          revision: requestA.revision,
          response: {
            class: 'preview',
            action: 'approve',
            artifactRevision: requestA.fields.artifact.revision,
          },
        });
        const responseA = details(await pendingA.result);
        const appliedA = await acknowledge(
          fixture.provider,
          acknowledgment(responseA.receipt, 'applied', requestA.source, {
            preview: {
              reviewedRevision: requestA.fields.artifact.revision,
              current: requestA.fields,
            },
          }),
          fixture.session.sessionId,
        );
        assert.equal(details(appliedA).status, 'applied');

        write(root, feature.artifactPath, '<!doctype html><main>Successor B</main>\n');
        const afterChange = await fixture.provider.refresh();
        const old = afterChange.requests.find(
          (entry) => entry.requestHandle === pendingA.record.requestHandle,
        );
        assert.equal(old.phase, 'applied');
        assert.equal(old.receipt.freshness, 'stale', 'the historical approval is no longer current');

        const requestB = previewRequest(feature, {
          requestRef: requestA.requestRef,
          revision: 'preview-b',
        });
        pendingB = await publishRequest(fixture.provider, requestB, fixture.session.sessionId);

        // Assert
        assert.notEqual(pendingB.record.requestHandle, pendingA.record.requestHandle);
        const successor = fixture.provider.read().requests.find(
          (entry) => entry.requestHandle === pendingB.record.requestHandle,
        );
        assert.equal(successor.phase, 'pending');
        assert.equal(successor.receipt, null);
        assert.equal(successor.responseAction, null);
        assert.notEqual(
          successor.request.fields.artifact.revision,
          requestA.fields.artifact.revision,
        );
        await assert.rejects(
          fixture.provider.respond({
            requestHandle: pendingA.record.requestHandle,
            revision: requestA.revision,
            response: {
              class: 'preview',
              action: 'approve',
              artifactRevision: requestA.fields.artifact.revision,
            },
          }),
          (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
        );
      } finally {
        pendingB?.controller.abort();
        fixture.provider.dispose();
        await Promise.allSettled([pendingB?.result].filter(Boolean));
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('preview artifact and asset drift before a response closes the old waiter without accepting approval', async (t) => {
      for (const changed of ['artifact', 'asset']) {
        await t.test(changed, async () => {
          // Arrange
          const root = temporaryRoot();
          const feature = createFeature(root);
          const fixture = createProviderFixture(root);
          const request = previewRequest(feature, { requestRef: `before-${changed}` });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          try {
            const changedPath = changed === 'artifact' ? feature.artifactPath : feature.assetPath;
            write(root, changedPath, Buffer.concat([bytes(root, changedPath), Buffer.from('\nchanged\n')]));

            // Act
            await assert.rejects(
              fixture.provider.respond({
                requestHandle: pending.record.requestHandle,
                revision: request.revision,
                response: {
                  class: 'preview',
                  action: 'approve',
                  artifactRevision: request.fields.artifact.revision,
                },
              }),
              (error) => error instanceof NeedsYouError && error.code === 'source_changed',
            );

            // Assert
            const result = details(await pending.result);
            assert.equal(result.status, 'source_changed');
            assert.equal(result.acceptedAnswer, false);
            assert.equal(result.response, null);
          } finally {
            fixture.provider.dispose();
            await pending.result;
            fs.rmSync(root, { recursive: true, force: true });
          }
        });
      }
    });

    test('invocation abort and root abort independently cancel a waiter, including when the invocation signal stays live', async (t) => {
      await t.test('invocation signal', async () => {
        const root = temporaryRoot();
        const fixture = createProviderFixture(root);
        const pending = await publishRequest(
          fixture.provider,
          sessionRequest('onboarding'),
          fixture.session.sessionId,
        );
        try {
          pending.controller.abort();
          const result = await pending.result;
          assert.equal(result.resultType, 'rejected');
          assert.equal(details(result).status, 'cancelled');
          assert.equal(details(result).acceptedAnswer, false);
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });

      await t.test('session root abort event', async () => {
        const root = temporaryRoot();
        const fixture = createProviderFixture(root);
        const pending = await publishRequest(
          fixture.provider,
          sessionRequest('fact'),
          fixture.session.sessionId,
        );
        try {
          fixture.provider.onEvent({
            id: 'root-abort',
            type: 'abort',
            data: {},
          });
          const result = await pending.result;
          assert.equal(pending.controller.signal.aborted, false, 'the host invocation signal is deliberately still live');
          assert.equal(result.resultType, 'rejected');
          assert.equal(details(result).status, 'cancelled');
          assert.equal(details(result).acceptedAnswer, false);
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    });

    test('queued outside input is a typed non-answer and only a later explicit owner acknowledgment recognizes it', async () => {
      // Arrange
      const root = temporaryRoot();
      const fixture = createProviderFixture(root);
      const pending = await publishRequest(
        fixture.provider,
        sessionRequest('fact', { requestRef: 'outside-input' }),
        fixture.session.sessionId,
      );
      try {
        fixture.state.pendingItems = () => ({
          items: [{ opaque: true }],
          steeringMessages: [],
          inFlightSteeringCount: 0,
        });

        // Act
        fixture.provider.onEvent({
          id: 'queue-modified',
          type: 'pending_messages.modified',
          data: {},
        });
        const result = await pending.result;
        const resultDetails = details(result);

        // Assert
        assert.equal(result.resultType, 'success', 'normal transport preserves queued input');
        assert.equal(resultDetails.status, 'outside_input_available');
        assert.equal(resultDetails.acceptedAnswer, false);
        assert.equal(resultDetails.response, null);
        assert.equal(resultDetails.receipt.recognizes, 'outside_answer');
        assert.equal(fixture.provider.read().requests.at(-1).phase, 'outside_input_available');

        const wrong = await acknowledge(
          fixture.provider,
          acknowledgment(
            resultDetails.receipt,
            'accepted',
            resultDetails.receipt.source,
            { recognizes: 'canvas_response' },
          ),
          fixture.session.sessionId,
        );
        assertRefused(wrong, 'acknowledgment_conflict');
        fixture.state.pendingItems = () => ({
          items: [],
          steeringMessages: [],
          inFlightSteeringCount: 0,
        });
        const recognized = await acknowledge(
          fixture.provider,
          acknowledgment(
            resultDetails.receipt,
            'accepted',
            resultDetails.receipt.source,
            { note: 'Current owner explicitly recognized the outside answer.' },
          ),
          fixture.session.sessionId,
        );
        assert.equal(details(recognized).status, 'accepted');
        assert.equal(details(recognized).applied, false);
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('session shutdown and provider replacement release current waiters and never resurrect old handles', async (t) => {
      await t.test('shutdown', async () => {
        const root = temporaryRoot();
        const fixture = createProviderFixture(root);
        const pending = await publishRequest(
          fixture.provider,
          sessionRequest('onboarding'),
          fixture.session.sessionId,
        );
        try {
          fixture.provider.onEvent({
            id: 'shutdown',
            type: 'session.shutdown',
            data: {},
          });
          const result = details(await pending.result);
          assert.equal(result.status, 'unavailable');
          assert.equal(fixture.provider.read().coverage.state, 'unavailable');
          assert.equal(fixture.provider.read().coverage.reason, 'session_ended');
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });

      await t.test('replacement', async () => {
        const root = temporaryRoot();
        const fixture = createProviderFixture(root);
        const request = sessionRequest('fact');
        const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
        try {
          const replacementSession = createSessionFixture({ sessionId: 'replacement-session' });
          fixture.provider.bindSession(/** @type {any} */ (replacementSession.session));
          assert.equal(details(await pending.result).status, 'unavailable');
          assert.equal(fixture.provider.read().coverage.reason, 'session_changed');
          await assert.rejects(
            fixture.provider.respond({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
              response: { class: 'fact', action: 'choose', optionId: 'alpha' },
            }),
            (error) => error instanceof NeedsYouError && error.code === 'provider_unavailable',
          );

          const successor = createNeedsYou({ root });
          successor.bindSession(/** @type {any} */ (replacementSession.session));
          try {
            await assert.rejects(
              successor.respond({
                requestHandle: pending.record.requestHandle,
                revision: request.revision,
                response: { class: 'fact', action: 'choose', optionId: 'alpha' },
              }),
              (error) => error instanceof NeedsYouError && error.code === 'unknown_request',
            );
            assert.deepEqual(successor.read().requests, []);
          } finally {
            successor.dispose();
          }
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    });

    test('Save as idea through a waiter yields capture_intent first, sends no message, and keeps Submit and Save intentions distinct', async (t) => {
      for (const continuation of ['brainstorm', 'capture_only']) {
        await t.test(continuation, async () => {
          // Arrange
          const root = temporaryRoot();
          const fixture = createProviderFixture(root);
          const request = sessionRequest('scope_choice', { requestRef: `waiter-capture-${continuation}` });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          const literalIntent = `  ${continuation}\u00a0intent\n第二 line  `;
          try {
            const prepared = await fixture.provider.issueCaptureReceipt({
              requestHandle: pending.record.requestHandle,
            });
            assert.equal(prepared.status, 'prepared');
            assert.equal(prepared.throughRequest, pending.record.requestHandle);

            // Act
            const delivered = await fixture.provider.captureIdea({
              captureReceipt: prepared.captureReceipt,
              intent: literalIntent,
              continuation,
            });
            const waiterResult = details(await pending.result);

            // Assert
            assert.equal(delivered.status, 'delivered');
            assert.equal(delivered.saved, false);
            assert.equal(delivered.applied, false);
            assert.equal(waiterResult.status, 'capture_intent');
            assert.equal(waiterResult.acceptedAnswer, false);
            assert.equal(waiterResult.response, null);
            assert.deepEqual(waiterResult.capture, { intent: literalIntent, continuation });
            assert.match(waiterResult.instruction, /Neither defines nor executes/);
            assert.equal(waiterResult.receipt.recognizes, 'capture');
            assert.deepEqual(waiterResult.receipt.scope, { kind: 'session' });
            assert.equal(waiterResult.receipt.originalToolCallId, pending.invocation.toolCallId);
            assert.equal(fixture.calls.sends.length, 0, 'capture must yield the waiter rather than queue behind it');
          } finally {
            fixture.provider.dispose();
            await pending.result;
            fs.rmSync(root, { recursive: true, force: true });
          }
        });
      }
    });

    test('idle capture requires fresh nonaborted idle and repeated queue checks, sends immediate exactly once, and correlates the observed message', async () => {
      // Arrange
      const root = temporaryRoot();
      const fixture = createProviderFixture(root);
      const literalIntent = '  Preserve\nthis\u00a0Unicode ✓ intent.  ';
      fixture.state.send = async ({ prompt, mode }) => {
        assert.equal(mode, 'immediate');
        const messageId = 'idle-message-1';
        fixture.provider.onEvent({
          id: 'user-message-event',
          type: 'user.message',
          data: { content: prompt, messageId, delivery: 'idle' },
        });
        return messageId;
      };
      try {
        await assert.rejects(
          fixture.provider.issueCaptureReceipt({}),
          (error) => error instanceof NeedsYouError && error.code === 'idle_required',
        );
        fixture.provider.onEvent({
          id: 'aborted-idle',
          type: 'session.idle',
          data: { aborted: true },
        });
        await assert.rejects(
          fixture.provider.issueCaptureReceipt({}),
          (error) => error instanceof NeedsYouError && error.code === 'idle_required',
        );
        fixture.provider.onEvent({
          id: 'fresh-idle',
          type: 'session.idle',
          data: { aborted: false },
        });
        const prepared = await fixture.provider.issueCaptureReceipt({});
        const duplicatePreparation = await fixture.provider.issueCaptureReceipt({});
        assert.deepEqual(duplicatePreparation, prepared, 'preparing twice reuses the one live receipt');

        // Act
        const delivered = await fixture.provider.captureIdea({
          captureReceipt: prepared.captureReceipt,
          intent: literalIntent,
          continuation: 'brainstorm',
        });

        // Assert
        assert.equal(delivered.status, 'delivered');
        assert.equal(delivered.saved, false);
        assert.equal(delivered.applied, false);
        assert.equal(fixture.calls.queue, 2, 'receipt preparation and final send boundary each inspect queue state');
        assert.equal(fixture.calls.sends.length, 1);
        assert.equal(fixture.calls.sends[0].mode, 'immediate');
        const promptLines = fixture.calls.sends[0].prompt.split('\n');
        const promptData = JSON.parse(promptLines.at(-1));
        assert.equal(promptData.intent, literalIntent);
        assert.equal(promptData.continuation, 'brainstorm');
        assert.equal(promptData.receiptId, prepared.captureReceipt);
        assert.deepEqual(promptData.scope, { kind: 'session' });
        assert.equal(fixture.provider.read().captures.at(-1).phase, 'awaiting_acknowledgment');
        await assert.rejects(
          fixture.provider.captureIdea({
            captureReceipt: prepared.captureReceipt,
            intent: literalIntent,
            continuation: 'brainstorm',
          }),
          (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
        );
        assert.equal(fixture.calls.sends.length, 1, 'a consumed capture is never replayed');
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('idle queue race burns the receipt without sending and requires a new observed idle boundary', async () => {
      // Arrange
      const root = temporaryRoot();
      const fixture = createProviderFixture(root);
      try {
        fixture.provider.onEvent({
          id: 'idle-before-race',
          type: 'session.idle',
          data: { aborted: false },
        });
        const prepared = await fixture.provider.issueCaptureReceipt({});
        fixture.state.pendingItems = () => ({
          items: [{ opaque: 'outside input' }],
          steeringMessages: [],
          inFlightSteeringCount: 0,
        });

        // Act
        await assert.rejects(
          fixture.provider.captureIdea({
            captureReceipt: prepared.captureReceipt,
            intent: 'Do not send behind queued input.',
            continuation: 'capture_only',
          }),
          (error) => error instanceof NeedsYouError && error.code === 'idle_required',
        );

        // Assert
        assert.equal(fixture.calls.sends.length, 0);
        const capture = fixture.provider.read().captures.at(-1);
        assert.equal(capture.phase, 'unavailable');
        assert.equal(capture.reason, 'idle_required');
        await assert.rejects(
          fixture.provider.captureIdea({
            captureReceipt: prepared.captureReceipt,
            intent: 'Do not retry.',
            continuation: 'capture_only',
          }),
          (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
        );
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('capture message receipt needs matching message id and idle delivery; uncertainty never replays', async (t) => {
      await t.test('late matching event reconciles an initially unconfirmed send', async () => {
        const root = temporaryRoot();
        const fixture = createProviderFixture(root, {
          session: { send: async () => 'late-message' },
        });
        try {
          fixture.provider.onEvent({ id: 'idle', type: 'session.idle', data: { aborted: false } });
          const prepared = await fixture.provider.issueCaptureReceipt({});
          const result = await fixture.provider.captureIdea({
            captureReceipt: prepared.captureReceipt,
            intent: 'Late event fixture.',
            continuation: 'capture_only',
          });
          assert.equal(result.status, 'delivery_unconfirmed');
          assert.equal(fixture.provider.read().captures.at(-1).phase, 'sending');
          const prompt = fixture.calls.sends[0].prompt;
          fixture.provider.onEvent({
            id: 'late-event',
            type: 'user.message',
            data: { content: prompt, messageId: 'late-message', delivery: 'idle' },
          });
          assert.equal(fixture.provider.read().captures.at(-1).phase, 'awaiting_acknowledgment');
          assert.equal(fixture.calls.sends.length, 1);
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });

      for (const mismatch of ['message-id', 'delivery']) {
        await t.test(`mismatched ${mismatch}`, async () => {
          const root = temporaryRoot();
          const fixture = createProviderFixture(root);
          fixture.state.send = async ({ prompt }) => {
            fixture.provider.onEvent({
              id: `mismatch-${mismatch}`,
              type: 'user.message',
              data: {
                content: prompt,
                messageId: mismatch === 'message-id' ? 'observed-other' : 'returned-message',
                delivery: mismatch === 'delivery' ? 'foreground' : 'idle',
              },
            });
            return 'returned-message';
          };
          try {
            fixture.provider.onEvent({ id: 'idle', type: 'session.idle', data: { aborted: false } });
            const prepared = await fixture.provider.issueCaptureReceipt({});
            await assert.rejects(
              fixture.provider.captureIdea({
                captureReceipt: prepared.captureReceipt,
                intent: 'Uncertain once only.',
                continuation: 'brainstorm',
              }),
              (error) => error instanceof NeedsYouError && error.code === 'capture_send_uncertain',
            );
            assert.equal(fixture.provider.read().captures.at(-1).phase, 'uncertain');
            assert.equal(fixture.provider.read().captures.at(-1).reason, 'capture_send_uncertain');
            await assert.rejects(
              fixture.provider.captureIdea({
                captureReceipt: prepared.captureReceipt,
                intent: 'No replay.',
                continuation: 'brainstorm',
              }),
              (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
            );
            assert.equal(fixture.calls.sends.length, 1);
          } finally {
            fixture.provider.dispose();
            fs.rmSync(root, { recursive: true, force: true });
          }
        });
      }
    });

    test('capture receipts reject forgery and acknowledgment before correlated delivery', async () => {
      // Arrange
      const root = temporaryRoot();
      const fixture = createProviderFixture(root, {
        session: { send: async () => 'unobserved-message' },
      });
      try {
        fixture.provider.onEvent({ id: 'idle', type: 'session.idle', data: { aborted: false } });
        const prepared = await fixture.provider.issueCaptureReceipt({});
        await assert.rejects(
          fixture.provider.captureIdea({
            captureReceipt: randomUUID(),
            intent: 'Forged receipt.',
            continuation: 'capture_only',
          }),
          (error) => error instanceof NeedsYouError && error.code === 'unknown_receipt',
        );
        const delivery = await fixture.provider.captureIdea({
          captureReceipt: prepared.captureReceipt,
          intent: 'Await actual delivery correlation.',
          continuation: 'capture_only',
        });
        assert.equal(delivery.status, 'delivery_unconfirmed');
        const receipt = delivery.receipt;

        // Act
        const premature = await acknowledge(
          fixture.provider,
          acknowledgment(receipt, 'applied', {
            kind: 'file',
            path: '.dude/ideas/001-missing.md',
            revision: revision('missing'),
          }),
          fixture.session.sessionId,
        );

        // Assert
        assertRefused(premature, 'capture_unreconciled');
        assert.equal(fixture.provider.read().captures.at(-1).phase, 'sending');
        assert.equal(fixture.calls.sends.length, 1);
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('only applied capture plus exact canonical reread is Saved; matching an existing idea is allowed and later drift invalidates Saved', async () => {
      // Arrange
      const root = temporaryRoot();
      const existingIdea = createDraft(root, '001', 'existing');
      const canonicalSource = {
        kind: 'file',
        path: existingIdea,
        revision: revision(bytes(root, existingIdea)),
      };
      const fixture = createProviderFixture(root);
      fixture.state.send = async ({ prompt }) => {
        const messageId = `capture-message-${fixture.calls.sends.length}`;
        fixture.provider.onEvent({
          id: `capture-event-${fixture.calls.sends.length}`,
          type: 'user.message',
          data: { content: prompt, messageId, delivery: 'idle' },
        });
        return messageId;
      };
      /** @param {string} id @param {'brainstorm'|'capture_only'} continuation */
      async function deliveredCapture(id, continuation) {
        fixture.provider.onEvent({ id, type: 'session.idle', data: { aborted: false } });
        const prepared = await fixture.provider.issueCaptureReceipt({});
        return fixture.provider.captureIdea({
          captureReceipt: prepared.captureReceipt,
          intent: `Intent ${id}`,
          continuation,
        });
      }
      try {
        const acceptedDelivery = await deliveredCapture('idle-accepted', 'brainstorm');
        const accepted = await acknowledge(
          fixture.provider,
          acknowledgment(
            acceptedDelivery.receipt,
            'accepted',
            canonicalSource,
          ),
          fixture.session.sessionId,
        );
        const acceptedDetails = details(accepted);
        const acceptedCaptureReceipt = acceptedDelivery.receipt.receiptId;
        assert.equal(acceptedDetails.status, 'accepted');
        assert.equal(acceptedDetails.saved, false, 'accepted capture is not Saved');
        assert.equal(acceptedDetails.applied, false);
        assert.equal(acceptedDetails.receipt.receiptId, acceptedCaptureReceipt);
        assert.deepEqual(acceptedDetails.receipt.scope, { kind: 'session' });
        assert.deepEqual(acceptedDetails.receipt.reread.source, canonicalSource);

        const appliedDelivery = await deliveredCapture('idle-applied', 'capture_only');
        const applied = await acknowledge(
          fixture.provider,
          acknowledgment(
            appliedDelivery.receipt,
            'applied',
            canonicalSource,
          ),
          fixture.session.sessionId,
        );
        const appliedDetails = details(applied);
        const appliedCaptureReceipt = appliedDelivery.receipt.receiptId;
        assert.notEqual(appliedCaptureReceipt, acceptedCaptureReceipt);
        assert.equal(appliedDetails.status, 'applied');
        assert.equal(appliedDetails.saved, true, 'an exact existing match is a valid canonical capture result');
        assert.equal(appliedDetails.applied, true);
        assert.equal(appliedDetails.receipt.receiptId, appliedCaptureReceipt);
        assert.deepEqual(appliedDetails.receipt.scope, { kind: 'session' }, 'capture receipt identity stays original');
        assert.deepEqual(appliedDetails.receipt.reread.source, canonicalSource);
        assert.equal(
          appliedDetails.receipt.reread.canonicalIdeaPath,
          existingIdea,
        );
        const beforeDrift = fixture.provider.read();
        assert.equal(beforeDrift.coverage.state, 'current');
        assert.deepEqual(beforeDrift.coverage.affected, []);
        assert.deepEqual(
          beforeDrift.captures.map((capture) => ({
            captureReceipt: capture.captureReceipt,
            phase: capture.phase,
            scope: capture.receipt.scope,
            freshness: capture.receipt.freshness,
            saved: capture.saved,
          })),
          [
            {
              captureReceipt: acceptedCaptureReceipt,
              phase: 'accepted',
              scope: { kind: 'session' },
              freshness: 'current',
              saved: false,
            },
            {
              captureReceipt: appliedCaptureReceipt,
              phase: 'applied',
              scope: { kind: 'session' },
              freshness: 'current',
              saved: true,
            },
          ],
        );

        const expectedAffected = [
          {
            scope: { kind: 'session' },
            captureReceipt: acceptedCaptureReceipt,
            phase: 'accepted',
            source: canonicalSource,
          },
          {
            scope: { kind: 'session' },
            captureReceipt: appliedCaptureReceipt,
            phase: 'applied',
            source: canonicalSource,
          },
        ];
        const expectedInvalidatedCaptures = (freshness) => [
          {
            captureReceipt: acceptedCaptureReceipt,
            phase: 'accepted',
            scope: { kind: 'session' },
            freshness,
            saved: false,
          },
          {
            captureReceipt: appliedCaptureReceipt,
            phase: 'applied',
            scope: { kind: 'session' },
            freshness,
            saved: false,
          },
        ];
        const assertInvalidatedCaptureCoverage = (snapshot, freshness) => {
          assert.equal(snapshot.coverage.state, 'partial');
          assert.equal(snapshot.coverage.reason, null, 'canonical capture drift is scoped, not provider-wide');
          assert.deepEqual(snapshot.coverage.affected, expectedAffected);
          assert.ok(
            snapshot.coverage.affected.every((affected) => !Object.hasOwn(affected, 'requestHandle')),
            'capture coverage must not fabricate request authority',
          );
          assert.deepEqual(
            snapshot.captures.map((capture) => ({
              captureReceipt: capture.captureReceipt,
              phase: capture.phase,
              scope: capture.receipt.scope,
              freshness: capture.receipt.freshness,
              saved: capture.saved,
            })),
            expectedInvalidatedCaptures(freshness),
          );
        };

        write(root, existingIdea, Buffer.concat([bytes(root, existingIdea), Buffer.from('\nLater change.\n')]));
        const changed = await fixture.provider.refresh();
        assertInvalidatedCaptureCoverage(changed, 'stale');

        fs.rmSync(path.join(root, ...existingIdea.split('/')));
        const removed = await fixture.provider.refresh();
        assertInvalidatedCaptureCoverage(removed, 'unavailable');
      } finally {
        fixture.provider.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('ordinary Defer never captures: source-backed deferral is durable, session-only deferral is explicitly unsaved', async (t) => {
      await t.test('source-backed', async () => {
        const root = temporaryRoot();
        const feature = createFeature(root);
        const fixture = createProviderFixture(root);
        const before = snapshotFiles(root);
        const request = sessionRequest('fact', {
          scope: feature.scope,
          source: feature.fileSource(),
          revision: 'defer-source-backed',
        });
        const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
        try {
          await fixture.provider.respond({
            requestHandle: pending.record.requestHandle,
            revision: request.revision,
            response: { class: 'fact', action: 'defer', text: 'Retain this exact owner context.' },
          });
          const response = details(await pending.result);
          const ack = await acknowledge(
            fixture.provider,
            acknowledgment(response.receipt, 'deferred', request.source),
            fixture.session.sessionId,
          );
          assert.equal(details(ack).status, 'deferred');
          assert.equal(fixture.provider.read().requests.at(-1).durable, true);
          assert.deepEqual(fixture.provider.read().captures, []);
          assert.deepEqual(snapshotFiles(root), before);
          assert.equal(fixture.calls.sends.length, 0);
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });

      await t.test('session-only', async () => {
        const root = temporaryRoot();
        const fixture = createProviderFixture(root);
        const request = sessionRequest('fact', { requestRef: 'session-defer' });
        const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
        try {
          await fixture.provider.respond({
            requestHandle: pending.record.requestHandle,
            revision: request.revision,
            response: { class: 'fact', action: 'defer' },
          });
          const response = details(await pending.result);
          const ack = await acknowledge(
            fixture.provider,
            acknowledgment(response.receipt, 'deferred', request.source),
            fixture.session.sessionId,
          );
          assert.equal(details(ack).status, 'deferred');
          assert.equal(fixture.provider.read().requests.at(-1).durable, false);
          assert.deepEqual(fixture.provider.read().captures, []);
          assert.equal(fixture.calls.sends.length, 0);
        } finally {
          fixture.provider.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    });

    test('declined and deferred requests reactivate only through an explicit current republication', async (t) => {
      for (const outcome of ['declined', 'deferred']) {
        await t.test(outcome, async () => {
          // Arrange
          const root = temporaryRoot();
          const fixture = createProviderFixture(root);
          const request = outcome === 'declined'
            ? sessionRequest('permission', { requestRef: `reactivate-${outcome}` })
            : sessionRequest('fact', { requestRef: `reactivate-${outcome}` });
          const first = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          let successor;
          try {
            const response = outcome === 'declined'
              ? { class: 'permission', action: 'decline', text: 'Not this operation now.' }
              : { class: 'fact', action: 'defer', text: 'Later, through this same owner.' };
            await fixture.provider.respond({
              requestHandle: first.record.requestHandle,
              revision: request.revision,
              response,
            });
            const receipt = details(await first.result).receipt;
            const result = await acknowledge(
              fixture.provider,
              acknowledgment(receipt, outcome, request.source),
              fixture.session.sessionId,
            );
            assert.equal(details(result).status, outcome);
            assert.equal(fixture.provider.read().capture.waitingRequests.length, 0);

            // Act
            successor = await publishRequest(fixture.provider, request, fixture.session.sessionId);

            // Assert
            assert.notEqual(successor.record.requestHandle, first.record.requestHandle);
            assert.equal(successor.record.phase, 'pending');
            assert.equal(
              fixture.provider.read().requests.filter(
                (entry) => entry.request.requestRef === request.requestRef,
              ).length,
              2,
            );
          } finally {
            successor?.controller.abort();
            fixture.provider.dispose();
            await Promise.allSettled([successor?.result].filter(Boolean));
            fs.rmSync(root, { recursive: true, force: true });
          }
        });
  }
});

test('annotation response without T010 review adapter is explicitly unavailable and retains the waiter', async () => {
          // Arrange
          const root = temporaryRoot();
          const feature = createFeature(root);
          const fixture = createProviderFixture(root);
          const httpFixture = await createHttpFixture(root, fixture.provider);
          const request = previewRequest(feature, { requestRef: 'missing-review-adapter' });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          try {
            // Act
            const response = await post(httpFixture.instance.url, '/api/needs-you/respond', {
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
              response: {
                class: 'preview',
                action: 'annotations',
                submissionId: randomUUID(),
                text: 'Revision note.',
              },
            });

            // Assert
            assert.equal(response.status, 503);
            assert.deepEqual(await response.json(), { error: 'review_unavailable' });
            const current = fixture.provider.read().requests.at(-1);
            assert.equal(current.phase, 'pending');
            assert.equal(current.responding, false);
            assert.equal(current.receipt, null);
            assert.deepEqual(fixture.provider.read().review, {
              available: false,
              reason: 'review_unavailable',
            });
            assert.equal(fixture.calls.sends.length, 0);
          } finally {
            pending.controller.abort();
            fixture.provider.dispose();
            await pending.result;
            await httpFixture.close();
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('trusted sealed adapter returns report and a real decodable PNG to the original waiter exactly once with live binding', async () => {
          // Arrange
          const root = temporaryRoot();
          const feature = createFeature(root);
          const adapterInputs = [];
          const propertyReads = [];
          const png = validPng(3, 2);
          const report = '# Sealed review\n\nMove “Continue” below the explanation.\n';
          const adapter = new Proxy({
            async readSealedSubmission(input) {
              adapterInputs.push(input);
              return sealedReview(input, { png, report });
            },
          }, {
            get(target, property, receiver) {
              propertyReads.push(String(property));
              return Reflect.get(target, property, receiver);
            },
          });
          const fixture = createProviderFixture(root, { reviewAdapter: adapter });
          const request = previewRequest(feature, { requestRef: 'valid-sealed-review' });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          const submissionId = randomUUID();
          const revisionText = '  Keep this\u00a0context\nexactly.  ';
          try {
            // Act
            const delivered = await fixture.provider.respond({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
              response: {
                class: 'preview',
                action: 'annotations',
                submissionId,
                text: revisionText,
              },
            });
            const result = await pending.result;
            const resultDetails = details(result);

            // Assert: the fixture adapter stands in only for T010's storage/seal work.
            assert.equal(delivered.status, 'delivered');
            assert.equal(adapterInputs.length, 1);
            assert.deepEqual([...new Set(propertyReads)], ['readSealedSubmission']);
            const [input] = adapterInputs;
            assert.equal(input.root, path.resolve(root));
            assert.equal(input.workspaceId, fixture.provider.read().workspaceId);
            assert.equal(input.sessionId, fixture.session.sessionId);
            assert.equal(input.providerGeneration, fixture.provider.read().providerGeneration);
            assert.equal(input.toolCallId, pending.invocation.toolCallId);
            assert.equal(input.requestHandle, pending.record.requestHandle);
            assert.equal(input.submissionId, submissionId);
            assert.equal(input.revisionText, revisionText);
            assert.equal(input.signal.aborted, true, 'the one-time validation signal closes after delivery');
            assert.deepEqual(input.request, request);

            assert.equal(result.resultType, 'success');
            assert.equal(resultDetails.status, 'awaiting_acknowledgment');
            assert.equal(resultDetails.acceptedAnswer, false);
            assert.deepEqual(resultDetails.response, {
              class: 'preview',
              action: 'annotations',
              submissionId,
              text: revisionText,
            });
            assert.deepEqual(resultDetails.review.preview, request.fields);
            assert.deepEqual(resultDetails.review.report, {
              path: `${feature.directory}/reviews/${submissionId}/report.md`,
              text: report,
              revision: revision(report),
            });
            assert.deepEqual(resultDetails.review.image, {
              path: `${feature.directory}/reviews/${submissionId}/annotated.png`,
              revision: revision(png),
              width: 3,
              height: 2,
            });
            assert.deepEqual(resultDetails.review.provenance, {
              path: `${feature.directory}/reviews/${submissionId}/provenance.json`,
              revision: revision('fixture seal'),
            });
            assert.equal(result.binaryResultsForLlm.length, 1);
            assert.deepEqual(
              Object.keys(result.binaryResultsForLlm[0]).sort(),
              ['data', 'description', 'mimeType', 'type'],
            );
            assert.equal(result.binaryResultsForLlm[0].type, 'image');
            assert.equal(result.binaryResultsForLlm[0].mimeType, 'image/png');
            assert.match(result.binaryResultsForLlm[0].description, /revision feedback, not approval/i);
            const deliveredPng = Buffer.from(result.binaryResultsForLlm[0].data, 'base64');
            assert.ok(deliveredPng.equals(png));
            const decoded = decodePngFixture(deliveredPng);
            assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 3, height: 2 });
            assert.equal(fixture.calls.sends.length, 0);

            await assert.rejects(
              fixture.provider.respond({
                requestHandle: pending.record.requestHandle,
                revision: request.revision,
                response: {
                  class: 'preview',
                  action: 'annotations',
                  submissionId,
                  text: revisionText,
                },
              }),
              (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
            );
            assert.equal(adapterInputs.length, 1, 'duplicate submit cannot reread or redeliver the seal');
          } finally {
            fixture.provider.dispose();
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('report-only, path-only, fake MIME, wrong binding/submission/source, malformed PNG, and limit failures retain preview waiter', { timeout: 15_000 }, async () => {
          // Arrange
          const root = temporaryRoot();
          const feature = createFeature(root);
          let mutate = (value) => value;
          let calls = 0;
          const adapter = {
            async readSealedSubmission(input) {
              calls += 1;
              return mutate(sealedReview(input));
            },
          };
          const fixture = createProviderFixture(root, { reviewAdapter: adapter });
          const request = previewRequest(feature, { requestRef: 'invalid-sealed-review' });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          const submissionId = randomUUID();
          const response = {
            class: 'preview',
            action: 'annotations',
            submissionId,
            text: 'Current revision note.',
          };
          const badCrc = validPng();
          badCrc[badCrc.length - 8] ^= 0x01;
          const oversizedPng = Buffer.alloc(NEEDS_YOU_LIMITS.pngBytes + 1);
          Buffer.from('89504e470d0a1a0a', 'hex').copy(oversizedPng);
          const invalidCompressedHeader = Buffer.alloc(13);
          invalidCompressedHeader.writeUInt32BE(2, 0);
          invalidCompressedHeader.writeUInt32BE(2, 4);
          invalidCompressedHeader[8] = 8;
          invalidCompressedHeader[9] = 6;
          const invalidCompressedPng = Buffer.concat([
            Buffer.from('89504e470d0a1a0a', 'hex'),
            pngChunk('IHDR', invalidCompressedHeader),
            pngChunk('IDAT', Buffer.from('not-deflate')),
            pngChunk('IEND', Buffer.alloc(0)),
          ]);
          const invalidCases = [
            ['report only', (value) => {
              delete value.image;
              return value;
            }],
            ['path only image', (value) => ({
              ...value,
              image: { path: '/tmp/annotated.png', mimeType: 'image/png' },
            })],
            ['fake MIME authority', (value) => ({
              ...value,
              image: { ...value.image, mimeType: 'image/jpeg' },
            })],
            ['wrong live handle', (value) => ({
              ...value,
              binding: { ...value.binding, requestHandle: randomUUID() },
            })],
            ['wrong tool call', (value) => ({
              ...value,
              binding: { ...value.binding, toolCallId: 'another-tool-call' },
            })],
            ['wrong submission', (value) => ({ ...value, submissionId: randomUUID() })],
            ['wrong scope', (value) => ({
              ...value,
              scope: { ...value.scope, ideaPath: '.dude/ideas/999-other.md' },
            })],
            ['wrong request revision', (value) => ({ ...value, requestRevision: 'old-request' })],
            ['wrong report hash', (value) => ({
              ...value,
              report: { ...value.report, revision: revision('different report') },
            })],
            ['malformed provenance hash', (value) => ({ ...value, provenanceRevision: 'not-a-hash' })],
            ['bad PNG CRC', (value) => ({
              ...value,
              image: {
                ...value.image,
                bytes: badCrc,
                revision: revision(badCrc),
              },
            })],
            ['bad PNG compression', (value) => ({
              ...value,
              image: {
                ...value.image,
                bytes: invalidCompressedPng,
                revision: revision(invalidCompressedPng),
              },
            })],
            ['wrong declared dimensions', (value) => ({
              ...value,
              image: { ...value.image, width: value.image.width + 1 },
            })],
            ['PNG byte limit', (value) => ({
              ...value,
              image: {
                ...value.image,
                bytes: oversizedPng,
                revision: revision(oversizedPng),
              },
            })],
            ['report byte limit', (value) => {
              const text = 'r'.repeat(NEEDS_YOU_LIMITS.reportBytes + 1);
              return { ...value, report: { text, revision: revision(text) } };
            }],
            ['image dimension limit', (value) => {
              const image = validPng(NEEDS_YOU_LIMITS.imageDimension + 1, 1);
              return {
                ...value,
                image: {
                  bytes: image,
                  revision: revision(image),
                  width: NEEDS_YOU_LIMITS.imageDimension + 1,
                  height: 1,
                },
              };
            }],
          ];
          try {
            for (const [name, mutation] of invalidCases) {
              mutate = mutation;

              // Act
              await assert.rejects(
                fixture.provider.respond({
                  requestHandle: pending.record.requestHandle,
                  revision: request.revision,
                  response,
                }),
                (error) => error instanceof NeedsYouError && error.code === 'review_evidence_invalid',
                name,
              );

              // Assert
              const current = fixture.provider.read().requests.at(-1);
              assert.equal(current.phase, 'pending', `${name} retains the original waiter`);
              assert.equal(current.responding, false, `${name} releases the response gate`);
              assert.equal(current.receipt, null, `${name} creates no delivery receipt`);
            }

            mutate = (value) => value;
            const delivered = await fixture.provider.respond({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
              response,
            });
            assert.equal(delivered.status, 'delivered');
            const result = await pending.result;
            assert.equal(details(result).status, 'awaiting_acknowledgment');
            assert.equal(result.binaryResultsForLlm.length, 1);
            assert.equal(calls, invalidCases.length + 1);
            assert.equal(fixture.calls.sends.length, 0);
          } finally {
            fixture.provider.dispose();
            await Promise.allSettled([pending.result]);
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('PNG fixture independently proves signature, chunk CRC, zlib stream, dimensions, and pixel-row bounds', () => {
          // Arrange + Act
          const png = validPng(4, 3);
          const decoded = decodePngFixture(png);

          // Assert
          assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 4, height: 3 });
          assert.equal(decoded.decoded.length, 3 * (1 + 4 * 4));
          assert.ok(png.length < NEEDS_YOU_LIMITS.pngBytes);
          assert.ok(decoded.width <= NEEDS_YOU_LIMITS.imageDimension);
          assert.ok(decoded.height <= NEEDS_YOU_LIMITS.imageDimension);
          assert.ok(decoded.width * decoded.height <= NEEDS_YOU_LIMITS.imagePixels);
        });

        test('T010 review operations allocate one provider UUID, serialize one request, and leave unrelated requests responsive', { timeout: 10_000 }, async () => {
          // Arrange
          const root = temporaryRoot();
          const feature = createFeature(root, '610', 'review-operations');
          const sealEntered = deferred();
          const releaseSeal = deferred();
          const calls = [];
          const adapter = {
            async openReview(input) {
              calls.push({ operation: 'open', input });
              return {
                status: input.allocate ? 'editing' : 'historical',
                editable: Boolean(input.allocate),
                submissionId: input.submissionId,
                workingRevision: revision('working-0'),
                working: {},
                framePath: `/review-source/${input.submissionId}/mock.html`,
                capture: { available: true },
              };
            },
            async saveReview(input) {
              calls.push({ operation: 'save', input });
              return {
                status: 'saved',
                submissionId: input.submissionId,
                workingRevision: revision('working-1'),
              };
            },
            async sealReview(input) {
              calls.push({ operation: 'seal', input });
              sealEntered.resolve();
              await releaseSeal.promise;
              input.signal.throwIfAborted();
              return {
                status: 'sealed',
                submissionId: input.submissionId,
                workingRevision: input.workingRevision,
                sent: false,
                applied: false,
              };
            },
          };
          const fixture = createProviderFixture(root, { reviewAdapter: adapter });
          const preview = previewRequest(feature, { requestRef: 'serialized-review-operations' });
          const pending = await publishRequest(fixture.provider, preview, fixture.session.sessionId);
          const unrelated = await publishRequest(
            fixture.provider,
            sessionRequest('fact', { requestRef: 'unrelated-during-review' }),
            fixture.session.sessionId,
          );
          try {
            // Act: omission of submissionId is the only writable allocation path.
            const opened = await fixture.provider.openReview({
              requestHandle: pending.record.requestHandle,
              revision: preview.revision,
            });
            const submissionId = opened.submissionId;

            // Assert
            assert.match(submissionId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
            assert.equal(fixture.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === pending.record.requestHandle,
            ).reviewSubmissionId, submissionId);
            assert.equal(calls.length, 1);
            assert.equal(calls[0].input.allocate, true);
            assert.equal(calls[0].input.requestHandle, pending.record.requestHandle);
            assert.equal(calls[0].input.toolCallId, pending.invocation.toolCallId);
            assert.equal(calls[0].input.sessionId, fixture.session.sessionId);
            assert.equal(calls[0].input.root, path.resolve(root));
            assert.equal(Object.hasOwn(calls[0].input, 'outputPath'), false);
            assert.equal(Object.hasOwn(calls[0].input, 'mimeType'), false);
            assert.equal(Object.hasOwn(calls[0].input, 'executable'), false);

            for (const [name, action] of [
              ['unknown open field', () => fixture.provider.openReview({
                requestHandle: pending.record.requestHandle,
                revision: preview.revision,
                outputPath: '/tmp/forged',
              })],
              ['wrong request revision', () => fixture.provider.openReview({
                requestHandle: pending.record.requestHandle,
                revision: 'stale-review-revision',
              })],
              ['forged save submission', () => fixture.provider.saveReview({
                requestHandle: pending.record.requestHandle,
                revision: preview.revision,
                submissionId: randomUUID(),
                workingRevision: revision('working-0'),
                working: {},
              })],
            ]) {
              await assert.rejects(
                action(),
                (error) => error instanceof NeedsYouError
                  && (name === 'forged save submission' ? error.code === 'identity_mismatch' : error.code === 'invalid_input'),
                name,
              );
            }
            assert.equal(calls.length, 1, 'closed-field and identity refusals never enter the adapter');

            const saved = await fixture.provider.saveReview({
              requestHandle: pending.record.requestHandle,
              revision: preview.revision,
              submissionId,
              workingRevision: revision('working-0'),
              working: { literal: 'first\u00a0line\n第二 line' },
            });
            assert.equal(saved.status, 'saved');
            assert.equal(calls.length, 2);

            const sealing = fixture.provider.sealReview({
              requestHandle: pending.record.requestHandle,
              revision: preview.revision,
              submissionId,
              workingRevision: saved.workingRevision,
              revisionText: '  Keep\u00a0this\nliteral.  ',
            });
            await sealEntered.promise;
            await assert.rejects(
              fixture.provider.sealReview({
                requestHandle: pending.record.requestHandle,
                revision: preview.revision,
                submissionId,
                workingRevision: saved.workingRevision,
              }),
              (error) => error instanceof NeedsYouError && error.code === 'response_in_progress',
            );
            await assert.rejects(
              fixture.provider.respond({
                requestHandle: pending.record.requestHandle,
                revision: preview.revision,
                response: {
                  class: 'preview',
                  action: 'approve',
                  artifactRevision: preview.fields.artifact.revision,
                },
              }),
              (error) => error instanceof NeedsYouError && error.code === 'response_in_progress',
            );

            // A review gate is per request, not a global provider lock.
            const unrelatedDelivery = await bounded(fixture.provider.respond({
              requestHandle: unrelated.record.requestHandle,
              revision: unrelated.record.request.revision,
              response: { class: 'fact', action: 'choose', optionId: 'alpha' },
            }));
            assert.equal(unrelatedDelivery.status, 'delivered');
            assert.equal(details(await unrelated.result).status, 'awaiting_acknowledgment');

            releaseSeal.resolve();
            const sealed = await sealing;
            assert.deepEqual(sealed, {
              status: 'sealed',
              submissionId,
              workingRevision: saved.workingRevision,
              sent: false,
              applied: false,
            });
            assert.equal(fixture.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === pending.record.requestHandle,
            ).phase, 'pending', 'seal is not send, approval, acknowledgment, or application');
            assert.equal(fixture.calls.sends.length, 0);
          } finally {
            releaseSeal.resolve();
            pending.controller.abort();
            fixture.provider.dispose();
            await Promise.allSettled([pending.result, unrelated.result]);
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('a timed-out real capture preserves working bytes, the pending request, and the absence of a seal', {
          skip: process.platform === 'win32'
            ? 'The test-owned executable uses the POSIX executable contract.'
            : false,
          timeout: 15_000,
          concurrency: false,
        }, async (context) => {
          // Arrange: the owned executable completes both startup handshakes and
          // Browser.close, but deliberately never answers Target.createTarget.
          // This enters capture's real post-startup command timer.
          const root = temporaryRoot();
          const feature = createFeature(root, '612', 'capture-timeout-retention');
          const bin = path.join(root, 'owned-browser-bin');
          const executable = path.join(bin, 'microsoft-edge');
          const commandsPath = path.join(root, 'owned-browser-commands.ndjson');
          fs.mkdirSync(bin);
          fs.writeFileSync(executable, [
            `#!${process.execPath}`,
            "const fs = require('node:fs');",
            `const commandsPath = ${JSON.stringify(commandsPath)};`,
            "const profile = process.argv.find(value => value.startsWith('--user-data-dir='))?.slice(16);",
            'let wire = Buffer.alloc(0);',
            'const reply = message => fs.writeSync(4, Buffer.from(JSON.stringify(message) + "\\0"));',
            'const read = () => {',
            '  const bytes = Buffer.alloc(4096);',
            '  fs.read(3, bytes, 0, bytes.length, null, (error, count) => {',
            '    if (error || !count) return;',
            '    wire = Buffer.concat([wire, bytes.subarray(0, count)]);',
            '    for (let split; (split = wire.indexOf(0)) !== -1;) {',
            '      const message = JSON.parse(wire.subarray(0, split).toString("utf8"));',
            '      wire = wire.subarray(split + 1);',
            '      fs.appendFileSync(commandsPath, JSON.stringify({',
            '        pid: process.pid, profile, at: Date.now(), id: message.id, method: message.method,',
            '      }) + "\\n");',
            '      if (message.method === "Browser.getVersion") {',
            '        reply({ id: message.id, result: { product: "Edg/133.0.0.0" } });',
            '      } else if (message.method === "Browser.close") {',
            '        reply({ id: message.id, result: {} });',
            '        process.exit(0);',
            '      }',
            '    }',
            '    read();',
            '  });',
            '};',
            'read();',
            'setInterval(() => {}, 1_000);',
            '',
          ].join('\n'), { mode: 0o755 });
          const originalPath = process.env.PATH;
          process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
          const adapter = createReview({ root });
          const fixture = createProviderFixture(root, { reviewAdapter: adapter });
          const request = previewRequest(feature, { requestRef: 'real-capture-timeout-retention' });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          const origin = 'http://127.0.0.1:43123';
          let reviewDirectory;
          try {
            const opened = await fixture.provider.openReview({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
            }, { origin });
            assert.deepEqual(opened.capture, {
              available: true,
              browser: 'Edg/133.0.0.0',
              mode: 'fresh-viewport',
            });
            const state = {
              annotations: [{
                id: randomUUID(),
                tool: 'box',
                x1: 20,
                y1: 20,
                x2: 80,
                y2: 60,
                comment: 'Retain this exact working annotation.',
                replacement: '',
                styleNote: '',
                element: null,
              }],
              notes: 'Working bytes must survive capture failure.',
              tool: 'box',
              selectedId: null,
              caret: null,
              view: {
                viewport: {
                  width: 320,
                  height: 240,
                  scrollX: 0,
                  scrollY: 0,
                  deviceScale: 1,
                  theme: 'light',
                  documentWidth: 320,
                  documentHeight: 240,
                },
                signature: revision('capture-timeout-view'),
              },
              palette: {
                stroke: '#d13438',
                background: '#ffffff',
                foreground: '#242424',
                highlightFill: '#fff4ce',
                highlightStroke: '#c19c00',
                selection: '#0f6cbd',
                fontFamily: 'Segoe UI',
              },
            };
            const saved = await fixture.provider.saveReview({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
              submissionId: opened.submissionId,
              workingRevision: opened.workingRevision,
              working: state,
            }, { origin });
            reviewDirectory = path.join(
              root,
              ...feature.directory.split('/'),
              'reviews',
              opened.submissionId,
            );
            const workingPath = path.join(reviewDirectory, 'working.json');
            const workingBefore = fs.readFileSync(workingPath);
            const started = performance.now();
            let failure;

            // Act
            try {
              await fixture.provider.sealReview({
                requestHandle: pending.record.requestHandle,
                revision: request.revision,
                submissionId: opened.submissionId,
                workingRevision: saved.workingRevision,
                revisionText: 'Keep the pending request available for an explicit retry.',
              }, { origin });
            } catch (error) {
              failure = error;
            }
            const captureMs = performance.now() - started;

            // Assert
            assert.ok(failure instanceof ReviewError);
            assert.equal(failure.code, 'review_capture_timeout');
            assert.equal(failure.detail?.stage, 'command_timeout');
            assert.ok(captureMs >= 3_700 && captureMs < 7_000,
              `the real failed capture did not use the post-startup command bound: ${captureMs}ms`);
            assert.deepEqual(fs.readFileSync(workingPath), workingBefore,
              'failed capture must preserve the exact saved working bytes');
            assert.deepEqual(fs.readdirSync(reviewDirectory), ['working.json'],
              'failed capture must create no report, image, or provenance seal');
            const current = fixture.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === pending.record.requestHandle,
            );
            assert.equal(current.phase, 'pending',
              'failed capture must leave the still-current request pending');
            assert.equal(current.reviewing, false);
            assert.equal(current.receipt, null);
            assert.equal(current.reviewSubmissionId, opened.submissionId);
            const commands = fs.readFileSync(commandsPath, 'utf8').trim().split('\n')
              .map(line => JSON.parse(line));
            const capture = commands.find(command => command.method === 'Target.createTarget');
            assert.ok(capture, `the capture command never crossed the real CDP pipe: ${JSON.stringify(commands)}`);
            assert.equal(
              commands.filter(command => command.pid === capture.pid
                && command.method === 'Browser.getVersion').length,
              1,
              'the failed capture used one startup handshake and no retry loop',
            );
            assert.equal(
              commands.some(command => command.pid === capture.pid
                && command.method === 'Browser.close'),
              true,
              'the failed capture closed its owned browser',
            );
            const profiles = [...new Set(commands.map(command => command.profile))];
            assert.equal(profiles.every(profile => !fs.existsSync(profile)), true,
              `all test-owned capture profiles must be removed: ${JSON.stringify(profiles)}`);
            context.diagnostic(JSON.stringify({ captureMs, commands: commands.map(
              ({ id, method }) => ({ id, method }),
            ) }));
          } finally {
            pending.controller.abort();
            fixture.provider.dispose();
            await Promise.allSettled([pending.result]);
            if (originalPath === undefined) delete process.env.PATH;
            else process.env.PATH = originalPath;
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('T010 review work is cancelled by queued outside input without allocating a live submission or replaying', { timeout: 10_000 }, async () => {
          // Arrange
          const root = temporaryRoot();
          const feature = createFeature(root, '611', 'review-queue-race');
          const entered = deferred();
          const release = deferred();
          let calls = 0;
          const adapter = {
            async openReview(input) {
              calls += 1;
              entered.resolve(input);
              await release.promise;
              input.signal.throwIfAborted();
              return {
                status: 'editing',
                editable: true,
                submissionId: input.submissionId,
                workingRevision: revision('working'),
                working: {},
                framePath: `/review-source/${input.submissionId}/mock.html`,
              };
            },
          };
          const fixture = createProviderFixture(root, { reviewAdapter: adapter });
          const request = previewRequest(feature, { requestRef: 'review-queue-race' });
          const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
          try {
            const opening = fixture.provider.openReview({
              requestHandle: pending.record.requestHandle,
              revision: request.revision,
            });
            const adapterInput = await entered.promise;
            fixture.state.pendingItems = () => ({
              items: [{ opaque: true }],
              steeringMessages: [],
              inFlightSteeringCount: 0,
            });

            // Act
            fixture.provider.onEvent({
              id: 'review-queue-modified',
              type: 'pending_messages.modified',
              data: {},
            });
            const result = await pending.result;
            release.resolve();

            // Assert
            await assert.rejects(opening);
            assert.equal(result.resultType, 'success');
            assert.equal(details(result).status, 'outside_input_available');
            assert.equal(details(result).acceptedAnswer, false);
            assert.equal(adapterInput.signal.aborted, true);
            assert.equal(calls, 1);
            const current = fixture.provider.read().requests.at(-1);
            assert.equal(current.reviewSubmissionId, null);
            assert.equal(current.phase, 'outside_input_available');
            assert.equal(current.receipt.recognizes, 'outside_answer');
            assert.equal(fixture.calls.sends.length, 0);
          } finally {
            release.resolve();
            fixture.provider.dispose();
            await Promise.allSettled([pending.result]);
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('tool schema exposes exactly request and acknowledge, six classes, and no cancel or generic operation', async () => {
          // Arrange
          const root = temporaryRoot();
          const fixture = createProviderFixture(root);
          try {
            // Act + Assert
            assert.equal(fixture.provider.tool.name, 'dude_needs_you');
            assert.deepEqual(NEEDS_YOU_PARAMETERS.properties.op.enum, ['request', 'acknowledge']);
            assert.equal(NEEDS_YOU_PARAMETERS.additionalProperties, false);
            assert.deepEqual(
              NEEDS_YOU_PARAMETERS.properties.request.oneOf
                .map((entry) => entry.properties.class.const),
              ['onboarding', 'fact', 'preview', 'manual_observation', 'permission', 'scope_choice'],
            );
            assert.doesNotMatch(JSON.stringify(NEEDS_YOU_PARAMETERS), /cancel|endpoint|command|toolName|outputPath/);
            assert.ok(Object.isFrozen(NEEDS_YOU_PARAMETERS));
            const invalid = invocation(fixture.session.sessionId);
            const result = await fixture.provider.tool.handler(
              { op: 'cancel', requestHandle: randomUUID() },
              invalid.invocation,
            );
            assertRefused(result, 'invalid_input');
            assert.deepEqual(fixture.provider.read().requests, []);
          } finally {
            fixture.provider.dispose();
            fs.rmSync(root, { recursive: true, force: true });
          }
        });

        test('producer guidance keeps one detailed owning section and focused caller references', () => {
          // Arrange
          const read = (relative) => fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
          const intake = read('src/skills/dude-work-intake/SKILL.md');
          const generatedIntake = read('.github/skills/dude-work-intake/SKILL.md');
          const headingOffset = intake.indexOf('\n## Needs You Handoff\n');
          assert.ok(headingOffset >= 0, 'the detailed handoff heading exists');
          const start = headingOffset + 1;
          const end = intake.indexOf('\n## ', start + 3);
          assert.ok(start >= 0 && end > start, 'the detailed handoff has one bounded owning section');
          const section = intake.slice(start, end);
          const normalize = (value) => value.replace(/\s+/g, ' ').trim();
          const requiredSentences = [
            '`dude_needs_you` is bounded transport to that owner. It does not establish ownership, permission, continuation, or completion.',
            'A valid Canvas response resolves that invocation exactly once with `status: \'awaiting_acknowledgment\'`, `acceptedAnswer: false`, the typed response, and its receipt; it never queues `session.send` behind the waiter.',
            'Treat `accepted` and `applied` as different outcomes.',
            'The report text and actual `image/png` bytes must return together to the original waiting tool.',
            'In **New idea**, **Submit** sets `continuation: \'brainstorm\'`; **Save** sets `continuation: \'capture_only\'`, meaning save for later without further discussion or execution.',
            'Ordinary **Defer** returns to the existing owner and never captures automatically.',
          ].map(normalize);
          const verify = (candidate) => {
            const normalized = normalize(candidate);
            for (const sentence of requiredSentences) {
              assert.ok(normalized.includes(sentence), `missing Needs You owner rule: ${sentence}`);
            }
          };

          // Act + Assert: each exact owner rule has its own deletion falsifier.
          verify(section);
          const normalizedSection = normalize(section);
          for (const sentence of requiredSentences) {
            assert.throws(
              () => verify(normalizedSection.replace(sentence, '')),
              /missing Needs You owner rule/,
              `deleting "${sentence}" must fail this contract`,
            );
          }
          assert.equal(generatedIntake, intake, 'the detailed source guidance must match its generated core projection');

          const references = [
            ['src/agents/dude.agent.md', 2],
            ['src/agents/dude-spec-lead.agent.md', 1],
            ['src/skills/dude-feature-definition/SKILL.md', 1],
            ['src/skills/dude-work/SKILL.md', 1],
          ];
          for (const [relative, minimum] of references) {
            const source = read(relative);
            const matches = source.split('\n').filter(
              (line) => line.includes('dude-work-intake') && line.includes('## Needs You Handoff'),
            );
            assert.ok(matches.length >= minimum, `${relative} must point to the owning handoff section`);
          }
        });

test('T009 review regression: idle capture does not send after lifecycle invalidation during the final queue read', { timeout: 10_000 }, async (t) => {
  for (const ending of ['workspace change', 'session shutdown', 'provider replacement', 'root abort']) {
    await t.test(ending, async () => {
      // Arrange
      const root = temporaryRoot();
      const replacementRoot = temporaryRoot();
      const fixture = createProviderFixture(root);
      const queueEntered = deferred();
      const queueRelease = deferred();
      let captureAttempt;
      try {
        fixture.provider.onEvent({
          id: `review-idle-before-${ending}`,
          type: 'session.idle',
          data: { aborted: false },
        });
        const prepared = await fixture.provider.issueCaptureReceipt({});
        fixture.state.pendingItems = () => {
          queueEntered.resolve();
          return queueRelease.promise;
        };
        captureAttempt = fixture.provider.captureIdea({
          captureReceipt: prepared.captureReceipt,
          intent: `Keep this capture in the context that admitted it before ${ending}.`,
          continuation: 'capture_only',
        });
        const settledCapture = captureAttempt.then(
          (value) => ({ status: 'fulfilled', value }),
          (error) => ({ status: 'rejected', error }),
        );
        await bounded(queueEntered.promise);

        // Act: use the same provider event/binding paths production receives.
        // No synthetic cancellation option is supplied to captureIdea.
        if (ending === 'workspace change') {
          fixture.provider.onEvent({
            id: 'review-workspace-change-during-capture',
            type: 'session.context_changed',
            data: { cwd: replacementRoot },
          });
        } else if (ending === 'session shutdown') {
          fixture.provider.onEvent({
            id: 'review-session-shutdown-during-capture',
            type: 'session.shutdown',
            data: {},
          });
        } else if (ending === 'provider replacement') {
          const replacementSession = createSessionFixture({ sessionId: 'review-replacement-session' });
          fixture.provider.bindSession(/** @type {any} */ (replacementSession.session));
        } else {
          fixture.provider.onEvent({
            id: 'review-root-abort-during-capture',
            type: 'abort',
            data: {},
          });
        }
        queueRelease.resolve({
          items: [],
          steeringMessages: [],
          inFlightSteeringCount: 0,
        });
        const outcome = await bounded(settledCapture);
        const state = fixture.provider.read();
        const capture = state.captures.find(
          (entry) => entry.captureReceipt === prepared.captureReceipt,
        );
        assert.ok(capture, 'the refused attempt retains its exact receipt for an honest terminal state');

        // Assert: provider-ending events become unavailable while root abort is
        // conservatively uncertain. Neither outcome is Saved or sendable.
        assert.deepEqual(
          {
            receiptIdentity: capture.captureReceipt,
            retainedCaptureCount: state.captures.length,
            sendCount: fixture.calls.sends.length,
            rejected: outcome.status === 'rejected',
            typedCurrentContextRefusal: outcome.error instanceof NeedsYouError
              && ['provider_unavailable', 'operation_unavailable'].includes(outcome.error.code),
            honestNonSuccessPhase: ['unavailable', 'uncertain'].includes(capture.phase),
            reasonRecorded: typeof capture.reason === 'string' && capture.reason.length > 0,
            acknowledgment: capture.receipt.acknowledgment,
            saved: capture.saved,
            providerWideEnd: ending === 'root abort'
              ? state.coverage.state === 'partial' && state.coverage.reason === null
              : state.coverage.state === 'unavailable' && typeof state.coverage.reason === 'string',
          },
          {
            receiptIdentity: prepared.captureReceipt,
            retainedCaptureCount: 1,
            sendCount: 0,
            rejected: true,
            typedCurrentContextRefusal: true,
            honestNonSuccessPhase: true,
            reasonRecorded: true,
            acknowledgment: null,
            saved: false,
            providerWideEnd: true,
          },
          `${ending} observed outcome=${outcome.status}:${outcome.error?.code ?? 'none'}`,
        );

        await assert.rejects(
          fixture.provider.captureIdea({
            captureReceipt: prepared.captureReceipt,
            intent: 'A refused final-boundary capture must never replay.',
            continuation: 'capture_only',
          }),
          (error) => error instanceof NeedsYouError
            && ['already_consumed', 'provider_unavailable'].includes(error.code),
        );
        assert.equal(fixture.calls.sends.length, 0, 'retrying the retained receipt cannot send');
      } finally {
        queueRelease.resolve({
          items: [],
          steeringMessages: [],
          inFlightSteeringCount: 0,
        });
        fixture.provider.dispose();
        await Promise.allSettled([captureAttempt].filter(Boolean));
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(replacementRoot, { recursive: true, force: true });
      }
    });
  }
});

test('T009 review regression: concurrent idle capture preparation retains one receipt and sends at most once', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const fixture = createProviderFixture(root);
  const prepareEntered = deferred();
  const prepareRelease = deferred();
  const finalEntered = deferred();
  const finalRelease = deferred();
  let prepareQueueCalls = 0;
  let finalQueueCalls = 0;
  try {
    fixture.provider.onEvent({
      id: 'review-shared-idle-boundary',
      type: 'session.idle',
      data: { aborted: false },
    });
    fixture.state.pendingItems = () => {
      prepareQueueCalls += 1;
      prepareEntered.resolve();
      return prepareRelease.promise;
    };

    const preparationResults = Promise.allSettled([
      fixture.provider.issueCaptureReceipt({}),
      fixture.provider.issueCaptureReceipt({}),
    ]);
    await bounded(prepareEntered.promise);
    await Promise.resolve();
    prepareRelease.resolve({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    const preparations = await bounded(preparationResults);
    const fulfilledPreparations = preparations.filter((result) => result.status === 'fulfilled');
    const refusedPreparations = preparations.filter((result) => result.status === 'rejected');
    const preparedReceipts = preparations.flatMap((result) => (
      result.status === 'fulfilled' ? [result.value.captureReceipt] : []
    ));
    const uniqueReceipts = [...new Set(preparedReceipts)];

    fixture.state.pendingItems = () => {
      finalQueueCalls += 1;
      finalEntered.resolve();
      return finalRelease.promise;
    };
    const messageIds = new Map();
    fixture.state.send = async ({ prompt }) => {
      const messageId = `review-concurrent-message-${messageIds.size + 1}`;
      messageIds.set(prompt, messageId);
      return messageId;
    };
    const captureResults = uniqueReceipts.map((captureReceipt, index) => (
      fixture.provider.captureIdea({
        captureReceipt,
        intent: `Concurrent intent ${index + 1}`,
        continuation: 'capture_only',
      })
    ));
    const settledCaptures = Promise.allSettled(captureResults);
    if (captureResults.length) {
      await bounded(finalEntered.promise);
      await Promise.resolve();
    }

    // Act
    finalRelease.resolve({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    const captureOutcomes = await bounded(settledCaptures);
    // Delay host correlation until every competing attempt has crossed the
    // queue boundary, so a user.message event cannot accidentally serialize it.
    for (const [index, sent] of fixture.calls.sends.entries()) {
      fixture.provider.onEvent({
        id: `review-delayed-user-message-${index + 1}`,
        type: 'user.message',
        data: {
          content: sent.prompt,
          messageId: messageIds.get(sent.prompt),
          delivery: 'idle',
        },
      });
    }
    const captures = fixture.provider.read().captures;
    const retained = captures.at(-1);

    // Assert
    assert.equal(fulfilledPreparations.length, 1, 'exactly one concurrent preparation owns the idle boundary');
    assert.equal(fulfilledPreparations[0].value.status, 'prepared');
    assert.equal(fulfilledPreparations[0].value.throughRequest, null);
    assert.equal(refusedPreparations.length, 1, 'the conflicting preparation is refused, not aliased');
    assert.ok(refusedPreparations[0].reason instanceof NeedsYouError);
    assert.equal(refusedPreparations[0].reason.code, 'capture_unreconciled');
    assert.equal(prepareQueueCalls, 2, 'both preparations reached the held allocation race');
    assert.equal(finalQueueCalls, 1, 'only the winning receipt reached a final send boundary');
    assert.equal(captureOutcomes.length, 1);
    assert.equal(captureOutcomes[0].status, 'fulfilled');
    assert.equal(captureOutcomes[0].value.status, 'delivery_unconfirmed');
    assert.equal(captureOutcomes[0].value.receipt.receiptId, uniqueReceipts[0]);
    assert.equal(captureOutcomes[0].value.saved, false);
    assert.equal(captureOutcomes[0].value.applied, false);
    assert.equal(fixture.calls.sends.length, 1, 'the one retained receipt sends exactly once');
    assert.equal(JSON.parse(fixture.calls.sends[0].prompt.split('\n').at(-1)).receiptId, uniqueReceipts[0]);
    assert.deepEqual(
      {
        captureReceipt: retained.captureReceipt,
        receiptId: retained.receipt.receiptId,
        phase: retained.phase,
        acknowledgment: retained.receipt.acknowledgment,
        intent: retained.intent,
        continuation: retained.continuation,
        saved: retained.saved,
      },
      {
        captureReceipt: uniqueReceipts[0],
        receiptId: uniqueReceipts[0],
        phase: 'awaiting_acknowledgment',
        acknowledgment: null,
        intent: 'Concurrent intent 1',
        continuation: 'capture_only',
        saved: false,
      },
      'the correlated send retains the exact winning receipt and intent',
    );
    await assert.rejects(
      fixture.provider.captureIdea({
        captureReceipt: uniqueReceipts[0],
        intent: 'Concurrent intent 1',
        continuation: 'capture_only',
      }),
      (error) => error instanceof NeedsYouError && error.code === 'already_consumed',
    );
    assert.equal(fixture.calls.sends.length, 1, 'the winning receipt cannot replay after correlation');

    assert.deepEqual(
      {
        onePreparedIdentity: uniqueReceipts.length === 1,
        oneRetainedCapture: captures.length === 1,
        atMostOneSend: fixture.calls.sends.length <= 1,
      },
      {
        onePreparedIdentity: true,
        oneRetainedCapture: true,
        atMostOneSend: true,
      },
      `observed prepareQueueCalls=${prepareQueueCalls}, finalQueueCalls=${finalQueueCalls}, `
        + `receiptIdentities=${uniqueReceipts.length}, retained=${captures.length}, sends=${fixture.calls.sends.length}`,
    );
  } finally {
    prepareRelease.resolve({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    finalRelease.resolve({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    fixture.provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T009 review regression: root abort during tracked acknowledgment cannot commit and a later owner invocation can reconcile', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const issues = [{
    id: 'review-tracked-ack',
    issue_type: 'task',
    status: 'in_progress',
    title: 'Tracked acknowledgment barrier',
    description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
  }];
  try {
    await withTrackedBoard(issues, async (board) => {
      const fixture = createProviderFixture(root);
      const source = {
        kind: 'tracked',
        revision: revision(JSON.stringify(issues)),
      };
      const request = sessionRequest('fact', {
        owner: 'dude',
        requestRef: 'review-tracked-ack',
        scope: feature.scope,
        source,
        revision: 'review-tracked-ack-request',
      });
      const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
      let barrier;
      try {
        await fixture.provider.respond({
          requestHandle: pending.record.requestHandle,
          revision: request.revision,
          response: { class: 'fact', action: 'choose', optionId: 'alpha' },
        });
        const delivered = details(await pending.result);
        const ack = acknowledgment(delivered.receipt, 'accepted', source);

        // An ordinary earlier turn boundary must not poison a distinct,
        // subsequently admitted owner acknowledgment.
        fixture.provider.onEvent({
          id: 'review-turn-before-ack',
          type: 'assistant.turn_start',
          data: {},
        });
        barrier = board.holdNextRead();
        const interruptedInvocation = invocation(fixture.session.sessionId);
        const interruptedPromise = fixture.provider.tool.handler(
          { op: 'acknowledge', acknowledgment: ack },
          interruptedInvocation.invocation,
        );
        await bounded(barrier.entered);

        // Act: T007 established that this root event can arrive while the
        // individual ToolInvocation.signal remains live.
        fixture.provider.onEvent({
          id: 'review-root-abort-during-ack',
          type: 'abort',
          data: {},
        });
        const invocationStayedLive = !interruptedInvocation.controller.signal.aborted;
        barrier.release();
        const interrupted = await bounded(interruptedPromise);
        const afterInterrupted = fixture.provider.read().requests.find(
          (entry) => entry.requestHandle === pending.record.requestHandle,
        );

        fixture.provider.onEvent({
          id: 'review-distinct-turn-after-abort',
          type: 'assistant.turn_start',
          data: {},
        });
        const reconciled = await acknowledge(
          fixture.provider,
          ack,
          fixture.session.sessionId,
        );

        // Assert
        const interruptedDetails = details(interrupted);
        const reconciledDetails = details(reconciled);
        assert.deepEqual(
          {
            invocationStayedLive,
            interruptedResultType: interrupted.resultType,
            interruptedStatus: interruptedDetails.status,
            typedInterruption: ['cancelled', 'operation_unavailable', 'provider_unavailable']
              .includes(interruptedDetails.reason),
            acknowledgmentCommitted: afterInterrupted.receipt.acknowledgment !== null,
            unresolvedPhase: ['awaiting_acknowledgment', 'unavailable'].includes(afterInterrupted.phase),
            reconciliationResultType: reconciled.resultType,
            reconciliationStatus: reconciledDetails.status,
          },
          {
            invocationStayedLive: true,
            interruptedResultType: 'failure',
            interruptedStatus: 'refused',
            typedInterruption: true,
            acknowledgmentCommitted: false,
            unresolvedPhase: true,
            reconciliationResultType: 'success',
            reconciliationStatus: 'accepted',
          },
          `interrupted=${interruptedDetails.status}:${interruptedDetails.reason ?? 'none'}, `
            + `phase=${afterInterrupted.phase}, retry=${reconciledDetails.status}:${reconciledDetails.reason ?? 'none'}`,
        );
      } finally {
        barrier?.release();
        fixture.provider.dispose();
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T009 review regression: manual evidence drift during the final queue read preserves the waiter for current resubmission', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const feature = createFeature(root);
  const evidencePath = `${feature.directory}/evidence/host-observation.txt`;
  write(root, evidencePath, 'Host observation revision A.\n');
  const fixture = createProviderFixture(root);
  const request = sessionRequest('manual_observation', {
    owner: 'dude',
    requestRef: 'review-manual-evidence-drift',
    scope: feature.scope,
    source: feature.fileSource(),
    revision: 'review-manual-evidence-request',
  });
  const pending = await publishRequest(fixture.provider, request, fixture.session.sessionId);
  const queueEntered = deferred();
  const queueRelease = deferred();
  let ownerSettled = false;
  let ownerResult;
  void pending.result.then((result) => {
    ownerSettled = true;
    ownerResult = result;
  });
  try {
    fixture.state.pendingItems = () => {
      queueEntered.resolve();
      return queueRelease.promise;
    };
    const staleResponse = {
      class: 'manual_observation',
      action: 'observation',
      text: 'The host result is attached.',
      evidence: [{ path: evidencePath, revision: revision(bytes(root, evidencePath)) }],
    };
    const staleAttempt = fixture.provider.respond({
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: staleResponse,
    }).then(
      (value) => ({ status: 'fulfilled', value }),
      (error) => ({ status: 'rejected', error }),
    );
    await bounded(queueEntered.promise);
    write(root, evidencePath, 'Host observation revision B.\n');

    // Act
    queueRelease.resolve({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    const staleOutcome = await bounded(staleAttempt);
    await Promise.resolve();
    const phaseAfterStaleAttempt = fixture.provider.read().requests.find(
      (entry) => entry.requestHandle === pending.record.requestHandle,
    )?.phase;
    const waiterSettledAfterStaleAttempt = ownerSettled;

    fixture.state.pendingItems = () => ({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    const currentResponse = {
      ...staleResponse,
      evidence: [{ path: evidencePath, revision: revision(bytes(root, evidencePath)) }],
    };
    const currentOutcome = await fixture.provider.respond({
      requestHandle: pending.record.requestHandle,
      revision: request.revision,
      response: currentResponse,
    }).then(
      (value) => ({ status: 'fulfilled', value }),
      (error) => ({ status: 'rejected', error }),
    );
    await Promise.resolve();
    const ownerDetails = ownerResult ? details(ownerResult) : null;

    // Assert: the second submission is also the unchanged-evidence success
    // control; only the evidence file changed, never the request source.
    assert.deepEqual(
      {
        staleAttempt: staleOutcome.status === 'rejected'
          ? `rejected:${staleOutcome.error?.code}`
          : `fulfilled:${staleOutcome.value?.status}`,
        phaseAfterStaleAttempt,
        waiterSettledAfterStaleAttempt,
        currentAttempt: currentOutcome.status === 'rejected'
          ? `rejected:${currentOutcome.error?.code}`
          : `fulfilled:${currentOutcome.value?.status}`,
        ownerStatus: ownerDetails?.status ?? null,
        ownerEvidence: ownerDetails?.response?.evidence ?? null,
      },
      {
        staleAttempt: 'rejected:source_changed',
        phaseAfterStaleAttempt: 'pending',
        waiterSettledAfterStaleAttempt: false,
        currentAttempt: 'fulfilled:delivered',
        ownerStatus: 'awaiting_acknowledgment',
        ownerEvidence: currentResponse.evidence,
      },
      'drifted response evidence must not consume the original request or its waiter',
    );
  } finally {
    queueRelease.resolve({
      items: [],
      steeringMessages: [],
      inFlightSteeringCount: 0,
    });
    pending.controller.abort();
    fixture.provider.dispose();
    await Promise.allSettled([pending.result]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T009 review regression: resolved canonical idea can acknowledge an explicit capture match without becoming a live owner', { timeout: 10_000 }, async () => {
  // Arrange
  const root = temporaryRoot();
  const ideaPath = createDraft(root, '001', 'resolved-match');
  write(
    root,
    ideaPath,
    bytes(root, ideaPath).toString('utf8').replace('\nstatus: draft\n', '\nstatus: resolved\n'),
  );
  const canonicalSource = {
    kind: 'file',
    path: ideaPath,
    revision: revision(bytes(root, ideaPath)),
  };
  const resolvedScope = { kind: 'idea', ideaPath };
  const before = snapshotFiles(root);
  const fixture = createProviderFixture(root);
  fixture.state.send = async ({ prompt }) => {
    const messageId = 'review-resolved-match-message';
    fixture.provider.onEvent({
      id: 'review-resolved-match-user-message',
      type: 'user.message',
      data: { content: prompt, messageId, delivery: 'idle' },
    });
    return messageId;
  };
  try {
    const liveRequestInvocation = invocation(fixture.session.sessionId);
    const liveRequestResult = await bounded(fixture.provider.tool.handler(
      {
        op: 'request',
        request: sessionRequest('fact', {
          owner: 'dude',
          requestRef: 'review-resolved-live-request',
          scope: resolvedScope,
          source: canonicalSource,
          revision: 'review-resolved-live-request',
        }),
      },
      liveRequestInvocation.invocation,
    ));

    fixture.provider.onEvent({
      id: 'review-resolved-match-idle',
      type: 'session.idle',
      data: { aborted: false },
    });
    const prepared = await fixture.provider.issueCaptureReceipt({});
    const delivered = await fixture.provider.captureIdea({
      captureReceipt: prepared.captureReceipt,
      intent: 'Match the already resolved canonical outcome without reopening it.',
      continuation: 'capture_only',
    });

    // Act
    const ownerAcknowledgment = acknowledgment(delivered.receipt, 'applied', canonicalSource);
    const acknowledged = await acknowledge(
      fixture.provider,
      ownerAcknowledgment,
      fixture.session.sessionId,
    );
    const acknowledgedDetails = details(acknowledged);
    const current = fixture.provider.read();
    const refreshed = await fixture.provider.refresh();

    // Assert
    assert.deepEqual(details(liveRequestResult), {
      status: 'unavailable',
      acceptedAnswer: false,
      response: null,
      receipt: null,
    }, 'a terminal idea is not a live request owner');
    assert.equal(current.requests.at(-1).phase, 'unavailable');
    assert.equal(current.capture.waitingRequests.length, 0);
    assert.deepEqual(snapshotFiles(root), before, 'capture matching cannot reopen or rewrite the terminal ledger');
    assert.deepEqual(fs.readdirSync(path.join(root, '.dude/ideas')), ['001-resolved-match.md']);
    assert.equal(fs.existsSync(path.join(root, '.dude/specs')), false, 'matching creates no duplicate package');
    assert.match(bytes(root, ideaPath).toString('utf8'), /\nstatus: resolved\nspec_path:\n/);

    assert.deepEqual(
      {
        resultType: acknowledged.resultType,
        status: acknowledgedDetails.status,
        reason: acknowledgedDetails.reason ?? null,
        saved: acknowledgedDetails.saved ?? false,
        applied: acknowledgedDetails.applied ?? false,
        receiptScope: acknowledgedDetails.receipt?.scope ?? null,
        canonicalIdeaPath: acknowledgedDetails.receipt?.reread?.canonicalIdeaPath ?? null,
        rereadSource: acknowledgedDetails.receipt?.reread?.source ?? null,
        capturePhase: current.captures.at(-1).phase,
        captureSaved: current.captures.at(-1).saved,
      },
      {
        resultType: 'success',
        status: 'applied',
        reason: null,
        saved: true,
        applied: true,
        receiptScope: { kind: 'session' },
        canonicalIdeaPath: ideaPath,
        rereadSource: canonicalSource,
        capturePhase: 'applied',
        captureSaved: true,
      },
      'explicit matching may confirm the existing terminal evidence without reopening it',
    );

    const refreshedRequest = refreshed.requests.find(
      (entry) => entry.request.requestRef === 'review-resolved-live-request',
    );
    const refreshedCapture = refreshed.captures.find(
      (entry) => entry.captureReceipt === delivered.receipt.receiptId,
    );
    assert.ok(refreshedRequest, 'refresh retains the refused live-request record');
    assert.ok(refreshedCapture, 'refresh retains the acknowledged capture record');
    assert.deepEqual(
      {
        coverageState: refreshed.coverage.state,
        coverageAffected: refreshed.coverage.affected,
        liveRequestCount: refreshed.requests.length,
        liveRequestPhase: refreshedRequest?.phase,
        liveRequestReceipt: refreshedRequest?.receipt ?? null,
        captureCount: refreshed.captures.length,
        captureReceipt: refreshedCapture?.captureReceipt ?? null,
        capturePhase: refreshedCapture?.phase ?? null,
        captureSaved: refreshedCapture?.saved ?? false,
        receiptCurrent: refreshedCapture?.receipt.current ?? false,
        receiptFreshness: refreshedCapture?.receipt.freshness ?? null,
        receiptAcknowledgment: refreshedCapture?.receipt.acknowledgment ?? null,
        rereadSource: refreshedCapture?.receipt.reread?.source ?? null,
        canonicalIdeaPath: refreshedCapture?.receipt.reread?.canonicalIdeaPath ?? null,
        sendCount: fixture.calls.sends.length,
      },
      {
        coverageState: 'partial',
        coverageAffected: [{
          scope: resolvedScope,
          requestHandle: refreshedRequest.requestHandle,
          phase: 'unavailable',
        }],
        liveRequestCount: 1,
        liveRequestPhase: 'unavailable',
        liveRequestReceipt: null,
        captureCount: 1,
        captureReceipt: delivered.receipt.receiptId,
        capturePhase: 'applied',
        captureSaved: true,
        receiptCurrent: true,
        receiptFreshness: 'current',
        receiptAcknowledgment: ownerAcknowledgment,
        rereadSource: canonicalSource,
        canonicalIdeaPath: ideaPath,
        sendCount: 1,
      },
      'unchanged-source refresh retains exact Saved evidence without reviving the resolved live owner or replaying capture',
    );
    assert.deepEqual(snapshotFiles(root), before, 'refresh cannot rewrite the canonical resolved ledger');
    assert.deepEqual(fs.readdirSync(path.join(root, '.dude/ideas')), ['001-resolved-match.md']);
    assert.equal(fs.existsSync(path.join(root, '.dude/specs')), false);
    assert.match(bytes(root, ideaPath).toString('utf8'), /\nstatus: resolved\nspec_path:\n/);
  } finally {
    fixture.provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
