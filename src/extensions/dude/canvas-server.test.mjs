// @ts-check
/**
 * Tests for the Dude canvas workspace server — loopback binding, the closed
 * route allowlist, cross-origin refusal, idempotent open by `instanceId`, and
 * cleanup on close. The SDK canvas plumbing itself is not retested here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { fork, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  ASSET_ROUTES,
  REVIEW_ASSET_ROUTES,
  closeInstance,
  isTrustedRequest,
  openInstance,
} from './lib/canvas-server.mjs';
import { readNowProjection } from './lib/projection.mjs';
import { createNeedsYou, NEEDS_YOU_LIMITS } from './lib/needs-you.mjs';
import { readPacks } from './lib/packs.mjs';
import { cmdAdd, cmdPreviewRefresh, cmdRefresh, cmdRemove, cmdStatus } from '../../skills/dude-compose/compose.mjs';
import { serializeProfileDocument } from '../../skills/dude-engine/lib/profile.mjs';

const REMOVED_PROOF_ROUTES = Object.freeze([
  '/__dude_i0/proof',
  '/__dude_i0/proof/abort',
]);
const BD_LIST_CALL = ['list', '--all', '--limit', '0', '--json'];
const EXTENSION_SOURCE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SOURCE_ROOT = path.resolve(EXTENSION_SOURCE_ROOT, '../../skills/dude-engine');
const READER = fileURLToPath(new URL('./lib/catalog-reader.mjs', import.meta.url));
const PACKS_MODULE = new URL('./lib/packs.mjs', import.meta.url).href;

/**
 * Runs a real Node child at production's `bd` invocation boundary. `hold` keeps
 * that child alive until the test writes its PID-specific release marker.
 * @param {Array<{output?:unknown,exitCode?:number,hold?:boolean}>} [steps]
 */
function installBdFixture(steps = []) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-bd-'));
  const scriptPath = path.join(fixtureRoot, 'bd.cjs');
  const callsPath = path.join(fixtureRoot, 'calls.json');
  const children = new Set();
  const watchers = new Set();
  fs.writeFileSync(callsPath, '[]');
  const fixtureScript = [
    "const fs = require('node:fs');",
    `const callsPath = ${JSON.stringify(callsPath)};`,
    `const fixtureRoot = ${JSON.stringify(fixtureRoot)};`,
    'const releasePath = `${fixtureRoot}/release-${process.pid}`;',
    `const steps = ${JSON.stringify(steps)};`,
    'const calls = JSON.parse(fs.readFileSync(callsPath, "utf8"));',
    'calls.push({ args: process.argv.slice(2), pid: process.pid });',
    'const temporaryCallsPath = `${callsPath}.${process.pid}.tmp`;',
    'fs.writeFileSync(temporaryCallsPath, JSON.stringify(calls));',
    'fs.renameSync(temporaryCallsPath, callsPath);',
    'const step = steps[Math.min(calls.length - 1, Math.max(steps.length - 1, 0))] || {};',
    'let finished = false;',
    'let releaseWatcher = null;',
    'const finish = () => {',
    '  if (finished) return;',
    '  finished = true;',
    '  releaseWatcher?.close();',
    '  const output = typeof step.output === "string" ? step.output : JSON.stringify(step.output ?? []);',
    '  process.stdout.write(output);',
    '  process.exit(step.exitCode ?? 0);',
    '};',
    'if (step.hold) {',
    '  const released = () => { if (fs.existsSync(releasePath)) finish(); };',
    '  releaseWatcher = fs.watch(fixtureRoot, released);',
    '  released();',
    '}',
    'else finish();',
    '',
  ].join('\n');
  fs.writeFileSync(scriptPath, fixtureScript);

  return {
    get calls() {
      return JSON.parse(fs.readFileSync(callsPath, 'utf8'));
    },
    waitForCalls(count) {
      if (this.calls.length >= count) return Promise.resolve();
      return new Promise((resolve) => {
        const check = () => {
          if (this.calls.length >= count) {
            watcher.close();
            watchers.delete(watcher);
            resolve(undefined);
          }
        };
        const watcher = fs.watch(fixtureRoot, check);
        watchers.add(watcher);
        check();
      });
    },
    release(pid) {
      assert.ok([...children].some(child => child.pid === pid), 'release only an owned fixture child');
      fs.writeFileSync(path.join(fixtureRoot, `release-${pid}`), '');
    },
    /** @template T @param {() => Promise<T>} action */
    async run(action) {
      // Windows execFile cannot use the old PATH-first bd.cmd without a shell.
      // Map only this executable, leaving production's args/options, callback,
      // timeout and cancellation attached to the actual child. No PATH or
      // NODE_OPTIONS changes, shell shim or production injection API is needed.
      const originalExecFile = childProcess.execFile;
      childProcess.execFile = (file, args, options, callback) => {
        if (file !== 'bd') return originalExecFile(file, args, options, callback);
        const child = originalExecFile(process.execPath, [scriptPath, ...args], options, callback);
        children.add(child);
        child.once('close', () => children.delete(child));
        return child;
      };
      syncBuiltinESMExports();
      try {
        return await action();
      } finally {
        childProcess.execFile = originalExecFile;
        syncBuiltinESMExports();
        for (const watcher of watchers) watcher.close();
        await Promise.all([...children].map(child => new Promise(resolve => {
          child.once('close', () => resolve(undefined));
          child.kill('SIGKILL');
        })));
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Subscribe before dispatching an action and resolve when the child records a
 * call. This is a barrier, not a timed sleep.
 * @param {{waitForCalls:(count:number) => Promise<void>}} fixture
 * @param {number} count
 */
function waitForBdCalls(fixture, count) {
  return fixture.waitForCalls(count);
}

/** @returns {{ lines: string[], log: (message: string) => void }} */
function recorder() {
  /** @type {string[]} */
  const lines = [];
  return { lines, log: (message) => void lines.push(message) };
}

/** @param {string} root @param {string} number @param {string} slug */
function writeDraft(root, number, slug) {
  fs.mkdirSync(path.join(root, '.dude', 'ideas'), { recursive: true });
  fs.writeFileSync(path.join(root, `.dude/ideas/${number}-${slug}.md`), [
    '---',
    `title: ${slug}`,
    `slug: ${slug}`,
    'status: draft',
    'spec_path:',
    '---',
    '',
    '## Idea',
    '',
    `${slug} body.`,
    '',
  ].join('\n'));
}

/** @param {string} root @returns {Map<string, Buffer>} */
function snapshotFiles(root) {
  /** @type {string[]} */
  const paths = [];
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) paths.push(absolute);
      else assert.fail(`fixture has unsupported path type: ${absolute}`);
    }
  };
  visit(root);
  return new Map(paths.sort().map((absolute) => [
    path.relative(root, absolute),
    fs.readFileSync(absolute),
  ]));
}

/** A read-only bundle fixture; no pack lifecycle command prepares its profile. */
function packFixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-packs-test-'));
  const environment = Object.fromEntries(['TEMP', 'TMP', 'TMPDIR'].map(key => [key, process.env[key]]));
  const scratch = path.join(temporary, 'scratch');
  fs.mkdirSync(scratch);
  for (const key of Object.keys(environment)) process.env[key] = scratch;
  const root = path.join(temporary, 'workspace');
  const profilePath = path.join(root, '.dude/metadata/profile.md');
  const library = path.join(root, 'library/packs');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.mkdirSync(library, { recursive: true });
  const entry = (name, source = { type: 'local', location: '/recorded/catalog' }) => ({
    files: [`.github/agents/dude-pack-${name}-worker.agent.md`],
    source,
  });
  // Keep the fixture's recorded order; Compose's lifecycle serializer sorts it.
  const profile = installed => fs.writeFileSync(profilePath,
    `# Install Profile\n\n\`\`\`json\n${JSON.stringify({ installed }, null, 2)}\n\`\`\`\n`);
  const catalog = (names, directory = library) => {
    for (const name of names) {
      const pack = path.join(directory, name);
      fs.mkdirSync(pack, { recursive: true });
      fs.writeFileSync(path.join(pack, 'pack.md'), [
        '---', `name: ${name}`, `description: ${JSON.stringify(`${name} full description <script>inert()</script>`)}`,
        'use-cases: [writing, ui]', '---', '', `# ${name}`, '',
      ].join('\n'));
    }
  };
  return { temporary, root, library, profilePath, entry, profile, catalog,
    scratch,
    cleanup() {
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      // A process that a test just stopped can keep its working directory, the
      // workspace, locked for a moment after it reports exit.
      fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } };
}

/** Exercise Compose's configured remote-clone branch, without network access. */
function remotePackCatalog(fixture, names) {
  const repository = path.join(fixture.temporary, 'remote');
  fs.mkdirSync(repository);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  fixture.catalog(names, path.join(repository, 'library/packs'));
  git('add', '-A');
  git('-c', 'user.email=fixture@example.test', '-c', 'user.name=Canvas Fixture', 'commit', '-qm', 'catalog fixture');
  const source = pathToFileURL(repository).href;
  fs.rmSync(fixture.library, { recursive: true });
  fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
    `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: source, source_ref: 'main' })}\n\`\`\`\n`);
  return { repository, source, git };
}

/**
 * Run the owner's real Compose install off this thread, as the real owner runs
 * Compose outside the Canvas process. Remote installs block on `spawnSync` git
 * for as long as the clone takes. In-process, that also freezes this test's
 * `fetch` client and the loopback server past the server's keep-alive deadline:
 * the next request is written to a pooled socket that the server's overdue timer
 * then destroys unread (`fetch failed`, cause `ECONNRESET`).
 * @param {Parameters<typeof cmdAdd>[0]} args
 * @returns {ReturnType<typeof cmdAdd>}
 */
function cmdAddOffLoop(args) {
  const worker = new Worker([
    "const { parentPort, workerData } = require('node:worker_threads');",
    'import(workerData.compose).then(async compose => parentPort.postMessage(await compose.cmdAdd(workerData.args)));',
  ].join('\n'), {
    eval: true,
    workerData: { compose: new URL('../../skills/dude-compose/compose.mjs', import.meta.url).href, args },
  });
  return new Promise((resolve, reject) => {
    let received = false, result;
    worker.once('message', value => { received = true; result = value; });
    worker.once('error', reject);
    worker.once('exit', code => received && code === 0 ? resolve(result)
      : reject(new Error(`Compose worker exited with code ${code} before returning a result`)));
  });
}

/** @param {string|Buffer} value */
const packRevision = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** Package only Compose's existing projection dependencies into owned scratch. */
function packEngineFixture() {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const write = (relative, content) => {
    const target = path.join(fixture.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const name of ['agent-model-map.mjs', 'agent-projection.mjs']) {
    write(`.github/skills/dude-engine/lib/${name}`, fs.readFileSync(path.join(ENGINE_SOURCE_ROOT, 'lib', name)));
  }
  write('.github/skills/dude-engine/config/agent-models.json',
    fs.readFileSync(path.resolve(ENGINE_SOURCE_ROOT, '../../config/agent-models.json')));
  write('library/packs/alpha/agents/dude-pack-alpha-worker.agent.md',
    '---\nname: Alpha Worker\ndescription: "Disposable worker"\ntools: [read, search]\nmodel-class: balanced\n---\nFixture v1.\n');
  write('library/packs/alpha/skills/dude-pack-alpha-helper/SKILL.md',
    '---\nname: dude-pack-alpha-helper\ndescription: "Fixture helper"\n---\n# Helper\n');
  write('library/packs/alpha/instructions/dude-pack-alpha-old.instructions.md', '# Old instruction\n');
  write('.github/agents/dude-local-unrelated.agent.md', 'Unrelated fixture file.\n');
  write('.github/agents/dude-pack-alpha-residue.agent.md', 'Unrecorded residue; never removal authority.\n');
  return { ...fixture, write };
}

/** Real provider + HTTP; only the SDK session is a deterministic foreground stand-in. */
async function packHttpFixture(fixture) {
  const provider = createNeedsYou({ root: fixture.root });
  const sends = [];
  const sessionId = `pack-session-${randomUUID()}`;
  const session = {
    sessionId, rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [] }) } },
    send: async input => {
      sends.push(input);
      const messageId = `pack-message-${sends.length}`;
      provider.onEvent(/** @type {any} */ ({ type: 'user.message', data: { content: input.prompt, messageId, delivery: 'idle' } }));
      return messageId;
    },
  };
  provider.bindSession(/** @type {any} */ (session));
  provider.onEvent(/** @type {any} */ ({ id: randomUUID(), type: 'session.idle', data: {} }));
  const instanceId = `pack-http-${randomUUID()}`;
  const instance = await openInstance(instanceId, () => {}, { complete: true }, { root: fixture.root }, provider);
  const tool = async input => provider.tool.handler(input, {
    sessionId, toolName: 'dude_needs_you', toolCallId: randomUUID(), signal: new AbortController().signal,
  });
  const post = (body, pathname = '/api/packs/request') => call(instance.url, {
    path: pathname, method: 'POST', headers: { origin: new URL(instance.url).origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const admission = async operation => {
    const prepared = await post({ op: 'prepare', operation, name: 'alpha' });
    assert.equal(prepared.status, 202);
    const receipt = await prepared.json();
    const delivered = await post({ op: 'submit', operation, name: 'alpha', packReceipt: receipt.packReceipt });
    assert.equal(delivered.status, 202);
    assert.equal((await delivered.json()).phase, 'delivered');
    return receipt;
  };
  const acknowledgment = (receipt, result, outcome = 'applied', mutation = 'applied', note = 'Owner verified the actual Compose result.') => {
    const { receiptId, owner, operation, name, workspaceId, sessionId, providerGeneration } = receipt.receipt;
    const status = cmdStatus({ root: fixture.root });
    return {
      receiptId, owner, operation, name, workspaceId, sessionId, providerGeneration,
      recognizes: 'pack_result', outcome, mutation, result, note,
      profileRevision: status.ok ? packRevision(fs.readFileSync(fixture.profilePath)) : null,
      source: status.ok && Object.hasOwn(status.result.installed, name) ? status.result.installed[name].source : null,
    };
  };
  const permission = async (receipt, impact) => {
    const operation = receipt.operation;
    const request = {
      owner: 'dude', requestRef: `pack:${receipt.packReceipt}`, scope: { kind: 'session' },
      source: { kind: 'session', revision: receipt.receipt.providerGeneration }, revision: packRevision(JSON.stringify(impact)),
      class: 'permission', blocking: true, prompt: `Preview ${operation} alpha: ${JSON.stringify(impact)}`,
      whyHuman: 'This exact operation requires literal user consent.', unblocks: 'The Compose owner can recheck and apply.',
      fields: { operation: `pack:${operation}`, targets: [
        { target: 'pack:alpha', revision: packRevision(JSON.stringify(impact)) },
        { target: '.dude/metadata/profile.md', revision: packRevision(fs.readFileSync(fixture.profilePath)) },
      ], consequences: operation === 'refresh' ? 'Generated edits can be overwritten; keep customization under dude-local-*.'
        : operation === 'remove' ? 'Delete only these recorded safe paths; leave residue and unrelated files.'
          : 'Install only these artifacts. Required tools are not installed automatically.',
      eligibility: 'The owner rechecks source, profile, targets and required tools before applying.',
      confirmation: `${operation.toUpperCase()} PACK alpha` },
    };
    let unsubscribe;
    const waiting = new Promise(resolve => {
      unsubscribe = provider.subscribe(() => {
        const record = provider.read().requests.find(entry => entry.request.requestRef === request.requestRef && entry.phase === 'pending');
        if (record) resolve(record);
      });
    });
    const result = tool({ op: 'request', request });
    let record;
    try { record = await Promise.race([waiting, result.then(value => { throw new Error(JSON.stringify(value)); })]); }
    finally { unsubscribe(); }
    return {
      request, record, result,
      async reply(consent = true) {
        const response = consent ? { class: 'permission', action: 'consent', operation: request.fields.operation,
          targets: request.fields.targets, confirmation: request.fields.confirmation }
          : { class: 'permission', action: 'decline', text: 'Do not change this pack.' };
        const delivered = await post({ requestHandle: record.requestHandle, revision: request.revision, response }, '/api/needs-you/respond');
        assert.equal(delivered.status, 202);
        const reply = await delivered.json();
        assert.equal(reply.applied, false);
        assert.deepEqual(JSON.parse((await result).textResultForLlm).response, response);
        const r = reply.receipt;
        const recognized = await tool({ op: 'acknowledge', acknowledgment: {
          receiptId: r.receiptId, owner: r.owner, requestRef: r.requestRef, scope: r.scope,
          previousRevision: r.previousRevision, recognizes: r.recognizes,
          outcome: consent ? 'accepted' : 'declined', note: 'Owner recognized the exact permission reply.', source: request.source,
        } });
        assert.equal(recognized.resultType, 'success', recognized.textResultForLlm);
      },
    };
  };
  return { provider, instance, instanceId, session, sends, post, tool, admission, acknowledgment, permission,
    feed: async () => (await call(instance.url, { path: '/api/needs-you' })).json(),
    async close() { provider.dispose(); await closeInstance(instanceId); },
  };
}

test('T003 pack prepare/submit is root-bound, sends one fixed handoff, and performs no Compose writes', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const provider = createNeedsYou({ root: fixture.root });
  const sends = [];
  provider.bindSession(/** @type {any} */ ({
    sessionId: 'pack-http-session',
    rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [] }) } },
    send: async input => {
      sends.push(input);
      provider.onEvent(/** @type {any} */ ({ type: 'user.message', data: {
        content: input.prompt, messageId: 'pack-message', delivery: 'idle',
      } }));
      return 'pack-message';
    },
  }));
  provider.onEvent(/** @type {any} */ ({ id: 'pack-idle', type: 'session.idle', data: {} }));
  const instance = await openInstance('pack-http-request', () => {}, { complete: true }, { root: fixture.root }, provider);
  const post = body => call(instance.url, { path: '/api/packs/request', method: 'POST',
    headers: { origin: new URL(instance.url).origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const before = snapshotFiles(fixture.root);
  try {
    const prepared = await post({ op: 'prepare', operation: 'install', name: 'alpha' });
    assert.equal(prepared.status, 202);
    const preparation = await prepared.json();
    assert.equal(preparation.phase, 'prepared');
    assert.equal(preparation.applied, false);
    assert.equal(sends.length, 0);
    const submit = { op: 'submit', operation: 'install', name: 'alpha', packReceipt: preparation.packReceipt };
    const delivered = await post(submit);
    assert.equal(delivered.status, 202);
    assert.equal((await delivered.json()).phase, 'delivered');
    assert.equal((await post(submit)).status, 409);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].mode, 'immediate');
    const handoff = JSON.parse(sends[0].prompt.split('\n').at(-1));
    assert.deepEqual(Object.keys(handoff).sort(),
      ['name', 'operation', 'owner', 'providerGeneration', 'receiptId', 'sessionId', 'workspaceId']);
    assert.equal(handoff.operation, 'install');
    assert.equal(handoff.name, 'alpha');
    assert.equal(handoff.receiptId, preparation.packReceipt);
    assert.doesNotMatch(sends[0].prompt, /full description|<script>|shell|force/);
    assert.deepEqual(snapshotFiles(fixture.root), before);
    const feed = await (await call(instance.url, { path: '/api/needs-you' })).json();
    assert.equal(feed.packRequests[0].phase, 'delivered');
    assert.equal(feed.packRequests[0].applied, false);
  } finally {
    provider.dispose();
    await closeInstance('pack-http-request');
    fixture.cleanup();
  }
});

test('T003 pack request HTTP gates reject alternate routes, origins, payloads, roots and read-only providers', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const readOnlyId = `pack-read-only-${randomUUID()}`;
  const readOnly = await openInstance(readOnlyId, () => {}, { complete: true }, { root: fixture.root });
  const host = new URL(f.instance.url).host, origin = new URL(f.instance.url).origin;
  const body = { op: 'prepare', operation: 'install', name: 'alpha' };
  const valid = { path: '/api/packs/request', method: 'POST',
    headers: { host, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const expectStatus = async (request, expected, label) => {
    let status;
    try { status = await rawStatus(f.instance.server, request); }
    catch (error) { throw new Error(`Pack HTTP case failed: ${label}`, { cause: error }); }
    assert.equal(status, expected, label);
  };
  const before = snapshotFiles(fixture.root);
  try {
    assert.equal(await rawStatus(readOnly.server, { ...valid,
      headers: { host: new URL(readOnly.url).host, origin: new URL(readOnly.url).origin, 'content-type': 'application/json' } }), 404);
    for (const suffix of ['/', '?root=elsewhere', '/apply', '#submit']) {
      await expectStatus({ ...valid, path: `/api/packs/request${suffix}` }, 404, `route ${suffix}`);
    }
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      await expectStatus({ ...valid, method, body: undefined }, 404, `method ${method}`);
    }
    for (const headers of [
      { ...valid.headers, origin: undefined }, { ...valid.headers, origin: 'null' },
      { ...valid.headers, origin: 'https://foreign.invalid' }, { ...valid.headers, host: 'foreign.invalid' },
      { ...valid.headers, 'sec-fetch-site': 'cross-site' },
    ]) {
      const supplied = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
      await expectStatus({ ...valid, headers: supplied }, 403, `headers ${JSON.stringify(supplied)}`);
    }
    await expectStatus({ ...valid, headers: { ...valid.headers, 'content-type': 'text/plain' } }, 415, 'non-JSON');
    await expectStatus({ ...valid, body: '{invalid' }, 400, 'malformed JSON');
    await expectStatus({ ...valid, body: Buffer.from([0xc3, 0x28]) }, 400, 'invalid UTF-8');
    await expectStatus({ ...valid, body: 'x'.repeat(NEEDS_YOU_LIMITS.bodyBytes + 1) }, 413, 'oversized streamed body');
    for (const key of ['root', 'path', 'source', 'ref', 'force', 'prompt', 'command']) {
      const response = await f.post({ ...body, [key]: 'not allowed' });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_input' });
    }
    for (const operation of ['upgrade', 'list', 'add', 'install alpha']) {
      assert.equal((await f.post({ ...body, operation })).status, 400);
    }
    const oldInput = f.instance.readInput;
    f.instance.readInput = { root: fixture.temporary };
    const wrongRoot = await f.post(body);
    assert.equal(wrongRoot.status, 409);
    assert.deepEqual(await wrongRoot.json(), { error: 'identity_mismatch' }, 'otherwise-valid body reaches the root guard');
    f.instance.readInput = oldInput;
    assert.equal(f.provider.read().packRequests.length, 0);
    assert.equal((await f.post(body)).status, 202, 'the valid control reaches allocation');
    assert.equal(f.sends.length, 0);
    assert.deepEqual(snapshotFiles(fixture.root), before);
  } finally {
    await f.close();
    await closeInstance(readOnlyId);
    fixture.cleanup();
  }
});

test('T003 install, safe remove, changed refresh and unchanged refresh need owner result plus authoritative reread', async t => {
  for (const scenario of ['install', 'remove', 'refresh', 'unchanged refresh']) await t.test(scenario, async () => {
    const fixture = packEngineFixture();
    const operation = scenario === 'unchanged refresh' ? 'refresh' : scenario;
    const args = { root: fixture.root, library: fixture.library, name: 'alpha', fetch: false };
    let f;
    try {
      if (operation !== 'install') {
        const added = await cmdAdd(args);
        assert.equal(added.ok, true, added.error);
      }
      if (scenario === 'refresh') {
        fixture.write('library/packs/alpha/agents/dude-pack-alpha-worker.agent.md',
          fs.readFileSync(path.join(fixture.library, 'alpha/agents/dude-pack-alpha-worker.agent.md'), 'utf8').replace('Fixture v1.', 'Fixture v2.'));
        fs.rmSync(path.join(fixture.library, 'alpha/instructions/dude-pack-alpha-old.instructions.md'));
        fixture.write('library/packs/alpha/instructions/dude-pack-alpha-new.instructions.md', '# New instruction\n');
      }
      if (operation === 'remove') fs.rmSync(fixture.library, { recursive: true });
      f = await packHttpFixture(fixture);
      const before = snapshotFiles(fixture.root);
      const receipt = await f.admission(operation);
      assert.equal(f.sends.length, 1);
      assert.deepEqual(snapshotFiles(fixture.root), before, 'HTTP cannot apply Compose');
      const status = cmdStatus({ root: fixture.root });
      const impact = operation === 'refresh' ? await cmdPreviewRefresh(args)
        : operation === 'remove' ? status.result.installed.alpha
          : { source: { type: 'local', location: fixture.library }, files: [
            '.github/agents/dude-pack-alpha-worker.agent.md',
            '.github/instructions/dude-pack-alpha-old.instructions.md',
            '.github/skills/dude-pack-alpha-helper',
          ], tools: [] };
      if (operation === 'refresh') {
        assert.equal(impact.ok, true, impact.error);
        const insufficient = await f.tool({ op: 'acknowledge', acknowledgment: f.acknowledgment(receipt, null) });
        assert.equal(insufficient.resultType, 'failure');
        assert.equal(JSON.parse(insufficient.textResultForLlm).reason, 'invalid_input');
        const previewOnly = await f.tool({ op: 'acknowledge', acknowledgment: f.acknowledgment(receipt, impact) });
        assert.equal(previewOnly.resultType, 'failure');
        assert.equal(JSON.parse(previewOnly.textResultForLlm).reason, 'invalid_input', 'a preview is not a refresh result');
      }
      const permission = await f.permission(receipt, impact);
      assert.equal((await f.feed()).packRequests[0].phase, 'waiting_permission');
      await permission.reply();
      assert.equal((await f.feed()).packRequests[0].phase, 'waiting_owner');
      assert.deepEqual(snapshotFiles(fixture.root), before, 'even literal consent alone performs no browser write');
      const result = operation === 'install' ? await cmdAdd(args)
        : operation === 'remove' ? cmdRemove(args) : await cmdRefresh(args);
      assert.equal(result.ok, true, result.error);
      assert.equal((await f.feed()).packRequests[0].applied, false, 'membership alone is never a result acknowledgment');
      const ack = f.acknowledgment(receipt, result);
      const acknowledged = await f.tool({ op: 'acknowledge', acknowledgment: ack });
      assert.equal(acknowledged.resultType, 'success', acknowledged.textResultForLlm);
      const view = (await f.feed()).packRequests[0];
      assert.equal(view.phase, 'applied');
      assert.equal(view.applied, true);
      assert.equal(view.receipt.reread.profileRevision, ack.profileRevision);
      assert.deepEqual(view.receipt.reread.entry, cmdStatus({ root: fixture.root }).result.installed.alpha ?? null);
      assert.deepEqual(view.receipt.acknowledgment.result, result);
      if (scenario === 'unchanged refresh') {
        assert.equal(packRevision(before.get(path.normalize('.dude/metadata/profile.md'))), ack.profileRevision);
        assert.deepEqual(result.result.added, []);
        assert.deepEqual(result.result.removed, []);
        assert.deepEqual(result.result.files, status.result.installed.alpha.files);
      }
      if (operation === 'remove') assert.equal(Object.hasOwn(cmdStatus({ root: fixture.root }).result.installed, 'alpha'), false);
      for (const relative of ['.github/agents/dude-pack-alpha-residue.agent.md', '.github/agents/dude-local-unrelated.agent.md']) {
        assert.deepEqual(fs.readFileSync(path.join(fixture.root, relative)), before.get(path.normalize(relative)));
      }
      assert.equal(f.sends.length, 1);
      const duplicate = await f.tool({ op: 'acknowledge', acknowledgment: ack });
      assert.equal(JSON.parse(duplicate.textResultForLlm).reason, 'acknowledgment_conflict');
      // A later profile change invalidates, but undo does not restore result authority.
      const appliedBytes = fs.readFileSync(fixture.profilePath);
      fs.appendFileSync(fixture.profilePath, '\nA later profile revision.\n');
      assert.equal((await f.feed()).packRequests[0].phase, 'stale');
      fs.writeFileSync(fixture.profilePath, appliedBytes);
      assert.equal((await f.feed()).packRequests[0].applied, false);
    } finally { await f?.close(); fixture.cleanup(); }
  });
});

test('T003 pack result finalization rechecks replacement permission while publishing or pending', async t => {
  for (const phase of ['publishing', 'pending']) await t.test(phase, async t => {
    const fixture = packEngineFixture();
    const args = { root: fixture.root, library: fixture.library, name: 'alpha', fetch: false };
    let f, replacement, readMock;
    try {
      const installed = await cmdAdd(args);
      assert.equal(installed.ok, true, installed.error);
      f = await packHttpFixture(fixture);
      const receipt = await f.admission('refresh');
      const impact = await cmdPreviewRefresh(args);
      assert.equal(impact.ok, true, impact.error);
      const permission = await f.permission(receipt, impact);
      await permission.reply();
      assert.equal(f.provider.read().requests[0].receipt.acknowledgment.outcome, 'accepted');
      const before = snapshotFiles(fixture.root);
      const result = await cmdRefresh(args);
      assert.equal(result.ok, true, result.error);
      assert.deepEqual(snapshotFiles(fixture.root), before, 'the actual refresh leaves the profile and artifacts unchanged');
      const acknowledgment = f.acknowledgment(receipt, result);
      const input = { op: 'acknowledge', acknowledgment };
      const invocation = { sessionId: f.session.sessionId, toolName: 'dude_needs_you',
        toolCallId: randomUUID(), signal: new AbortController().signal };
      let replacementHandle, published = false;
      const publishReplacement = () => {
        published = true;
        replacement = f.permission(receipt, { ...impact, note: 'The owner renewed this exact preview.' });
        const current = f.provider.read().requests.at(-1);
        assert.equal(current.phase, 'publishing');
        assert.notEqual(current.request.revision, permission.request.revision);
        replacementHandle = current.requestHandle;
        assert.equal(f.provider.read().packRequests[0].permissionRequest, replacementHandle);
      };
      const read = fs.readFileSync, profileReadPhases = [];
      readMock = t.mock.method(fs, 'readFileSync', (file, ...rest) => {
        const value = read(file, ...rest);
        if (file === fixture.profilePath) {
          // Publishing during the synchronous reread queues the permission's
          // continuation first, so it is pending when result finalization resumes.
          if (phase === 'pending' && !published) publishReplacement();
          if (replacementHandle) profileReadPhases.push(f.provider.read().requests.at(-1).phase);
        }
        return value;
      });
      const acknowledging = f.provider.tool.handler(input, invocation);
      // This same-turn publication lands after the permission check and before
      // the installed-only reread's await continuation, without a lifecycle event.
      if (phase === 'publishing') publishReplacement();
      const response = await acknowledging;
      const currentPermission = await replacement;
      readMock.mock.restore();
      assert.equal(profileReadPhases.at(-1), phase, 'the final profile check reaches the intended permission state');
      assert.equal(response.resultType, 'failure', response.textResultForLlm);
      assert.equal(JSON.parse(response.textResultForLlm).reason, 'acknowledgment_conflict');
      const waiting = f.provider.read().packRequests[0];
      assert.equal(waiting.permissionRequest, currentPermission.record.requestHandle);
      assert.equal(waiting.phase, 'waiting_permission');
      assert.equal(waiting.applied, false);
      assert.equal(waiting.receipt.acknowledgment, null);
      assert.equal(waiting.receipt.ackToolCallId, null);
      assert.equal(waiting.receipt.reread, null);
      const replay = await f.post({ op: 'submit', operation: 'refresh', name: 'alpha', packReceipt: receipt.packReceipt });
      assert.equal(replay.status, 409);
      assert.deepEqual(await replay.json(), { error: 'already_consumed' });
      assert.equal(f.sends.length, 1);
      await currentPermission.reply();
      const recognized = await f.provider.tool.handler(input, invocation);
      assert.equal(recognized.resultType, 'success', recognized.textResultForLlm);
      assert.equal(JSON.parse(recognized.textResultForLlm).applied, true);
      assert.equal(f.provider.read().packRequests[0].receipt.ackToolCallId, invocation.toolCallId,
        'the refused result did not consume its acknowledgment invocation');
      assert.equal(f.sends.length, 1);
      assert.deepEqual(snapshotFiles(fixture.root), before);
    } finally {
      readMock?.mock.restore();
      await f?.close();
      fixture.cleanup();
    }
  });
});

test('T003 declined permission makes no change and remains declined after an independent installed-state change', async () => {
  const fixture = packEngineFixture();
  const f = await packHttpFixture(fixture);
  try {
    const before = snapshotFiles(fixture.root);
    const receipt = await f.admission('install');
    const permission = await f.permission(receipt, { files: ['.github/agents/dude-pack-alpha-worker.agent.md'], tools: [] });
    await permission.reply(false);
    const outcome = await f.tool({ op: 'acknowledge',
      acknowledgment: f.acknowledgment(receipt, null, 'declined', 'none', 'The user declined; nothing was applied.') });
    assert.equal(outcome.resultType, 'success', outcome.textResultForLlm);
    assert.equal((await f.feed()).packRequests[0].phase, 'declined');
    assert.deepEqual(snapshotFiles(fixture.root), before);
    const separateOperation = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', fetch: false });
    assert.equal(separateOperation.ok, true);
    const feed = await f.feed();
    assert.equal(feed.packRequests[0].phase, 'declined');
    assert.equal(feed.packRequests[0].applied, false);
    assert.equal(feed.packRequests[0].receipt.freshness, 'stale');
    assert.equal(f.sends.length, 1);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T003 actual caught Compose failures preserve none, restored and uncertain owner outcomes', async t => {
  for (const scenario of ['install restored', 'remove restored', 'refresh restored', 'refresh none', 'refresh uncertain']) {
    await t.test(scenario, async () => {
      const fixture = packEngineFixture();
      const [operation, mutation] = scenario.split(' ');
      const args = { root: fixture.root, library: fixture.library, name: 'alpha', fetch: false };
      let f;
      let restorationFailures = 0;
      const originalWrite = fs.writeFileSync, originalCopy = fs.copyFileSync;
      try {
        if (operation !== 'install') assert.equal((await cmdAdd(args)).ok, true);
        f = await packHttpFixture(fixture);
        const receipt = await f.admission(operation);
        if (mutation === 'none') fixture.write('library/packs/alpha/pack.md', '---\nuse-cases: invalid\n---\n');
        const before = snapshotFiles(fixture.root);
        if (mutation !== 'none') {
          fs.writeFileSync = (file, ...rest) => {
            if (path.basename(String(file)).startsWith('profile.md.tmp-')) throw new Error('Owned profile-write failure');
            return originalWrite(file, ...rest);
          };
        }
        if (mutation === 'uncertain') {
          fs.copyFileSync = (source, destination, ...rest) => {
            if (String(source).includes('dude-compose-refresh-alpha-txn-')
              && String(destination).endsWith('dude-pack-alpha-worker.agent.md')) {
              restorationFailures += 1;
              throw new Error('Owned restoration failure');
            }
            return originalCopy(source, destination, ...rest);
          };
        }
        const result = operation === 'install' ? await cmdAdd(args)
          : operation === 'remove' ? cmdRemove(args) : await cmdRefresh(args);
        fs.writeFileSync = originalWrite;
        fs.copyFileSync = originalCopy;
        assert.equal(result.ok, false);
        if (operation === 'refresh') assert.equal(result.mutation, mutation);
        if (mutation === 'restored') assert.match(result.error, /rolled back/);
        if (mutation === 'uncertain') {
          assert.equal(restorationFailures, 1, 'the injected fault must reach an actual restoration copy');
          assert.match(result.error, /rollback failed/);
          assert.notDeepEqual(snapshotFiles(fixture.root), before);
        } else assert.deepEqual(snapshotFiles(fixture.root), before);
        const outcome = mutation === 'uncertain' ? 'uncertain' : 'failed';
        const ack = f.acknowledgment(receipt, result, outcome, mutation,
          mutation === 'restored' ? 'The caught failure restored the observed pre-operation bytes. This is not crash recovery.'
            : mutation === 'none' ? 'The operation refused before mutation.' : 'Restoration failed; the state is uncertain.');
        const response = await f.tool({ op: 'acknowledge', acknowledgment: ack });
        assert.equal(response.resultType, 'success', response.textResultForLlm);
        const view = (await f.feed()).packRequests[0];
        assert.equal(view.phase, outcome);
        assert.equal(view.receipt.acknowledgment.mutation, mutation);
        assert.equal(view.applied, false);
        assert.equal(f.sends.length, 1);
      } finally {
        fs.writeFileSync = originalWrite; fs.copyFileSync = originalCopy;
        await f?.close(); fixture.cleanup();
      }
    });
  }
});

test('T003 an install result needs existing safe files and refresh needs the exact resulting file set', async t => {
  for (const scenario of ['missing installed artifact', 'wrong refresh files']) await t.test(scenario, async () => {
    const fixture = packEngineFixture();
    const args = { root: fixture.root, library: fixture.library, name: 'alpha', fetch: false };
    let f;
    try {
      const operation = scenario === 'wrong refresh files' ? 'refresh' : 'install';
      if (operation === 'refresh') assert.equal((await cmdAdd(args)).ok, true);
      f = await packHttpFixture(fixture);
      const receipt = await f.admission(operation);
      const result = operation === 'install' ? await cmdAdd(args) : await cmdRefresh(args);
      assert.equal(result.ok, true);
      const ack = f.acknowledgment(receipt, result);
      if (operation === 'install') fs.rmSync(path.join(fixture.root, result.result.files[0]));
      else {
        const different = '.github/agents/dude-pack-alpha-different.agent.md';
        // Keep all result set invariants, source, profile revision and binding
        // valid: only agreement with the authoritative resulting files is wrong.
        ack.result = { ok: true, code: 0, result: { refreshed: 'alpha', files: [different],
          replaced: [], added: [different], removed: result.result.files } };
      }
      const response = await f.tool({ op: 'acknowledge', acknowledgment: ack });
      assert.equal(response.resultType, 'failure');
      assert.equal(JSON.parse(response.textResultForLlm).reason, 'pack_state_mismatch');
      assert.equal((await f.feed()).packRequests[0].applied, false);
      assert.equal(f.sends.length, 1);
    } finally { await f?.close(); fixture.cleanup(); }
  });
});

test('T003 pack result preserves a complete list larger than the human-reference limit', async () => {
  const fixture = packEngineFixture();
  fixture.write('library/packs/alpha/instructions/dude-pack-alpha-inert%23name.instructions.md',
    '# Inert filename supported by Compose; never URL-decode it.\n');
  for (let i = 0; i < 40; i++) fixture.write(
    `library/packs/alpha/instructions/dude-pack-alpha-rule-${String(i).padStart(2, '0')}.instructions.md`, `# Rule ${i}\n`);
  const f = await packHttpFixture(fixture);
  try {
    const receipt = await f.admission('install');
    const result = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', fetch: false });
    assert.equal(result.ok, true, result.error);
    assert.ok(result.result.files.length > NEEDS_YOU_LIMITS.references);
    const response = await f.tool({ op: 'acknowledge', acknowledgment: f.acknowledgment(receipt, result) });
    assert.equal(response.resultType, 'success', response.textResultForLlm);
    const view = (await f.feed()).packRequests[0];
    assert.deepEqual(view.receipt.reread.entry.files, result.result.files);
    assert.equal(view.applied, true);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T003 the owner forwards Compose --envelope stdout unchanged; flattened --json stdout is refused', async t => {
  const compose = path.resolve(ENGINE_SOURCE_ROOT, '../dude-compose/compose.mjs');
  /** Run the real source CLI as the owner does, outside this process. */
  const cli = (fixture, ...args) => {
    const child = spawnSync(process.execPath, [compose, ...args,
      '--root', fixture.root, '--library', fixture.library, '--no-fetch'], { cwd: fixture.root, encoding: 'utf8', windowsHide: true });
    assert.equal(child.error, undefined);
    assert.equal(child.stderr, '');
    return child;
  };
  for (const scenario of ['install', 'remove', 'refresh', 'refresh failure']) await t.test(scenario, async () => {
    const fixture = packEngineFixture();
    const operation = scenario === 'refresh failure' ? 'refresh' : scenario;
    const failure = scenario === 'refresh failure';
    const args = { root: fixture.root, library: fixture.library, name: 'alpha', fetch: false };
    let f;
    try {
      if (operation !== 'install') assert.equal((await cmdAdd(args)).ok, true);
      if (failure) {
        // A source-only addition whose destination is already foreign refuses
        // before mutation, with exit code 2 and the engine's `mutation: none`.
        fixture.write('library/packs/alpha/instructions/dude-pack-alpha-new.instructions.md', '# New instruction\n');
        fixture.write('.github/instructions/dude-pack-alpha-new.instructions.md', '# Foreign destination\n');
      }
      f = await packHttpFixture(fixture);
      const receipt = await f.admission(operation);
      const command = operation === 'install' ? 'add' : operation;
      if (operation === 'refresh') {
        const flattened = cli(fixture, command, 'alpha', '--json');
        assert.equal(flattened.status, failure ? 2 : 0);
        const refused = await f.tool({ op: 'acknowledge', acknowledgment: f.acknowledgment(receipt, JSON.parse(flattened.stdout),
          failure ? 'failed' : 'applied', failure ? 'none' : 'applied', 'Forwarded the flattened --json stdout unchanged.') });
        assert.equal(refused.resultType, 'failure');
        assert.equal(JSON.parse(refused.textResultForLlm).reason, 'invalid_input');
        const unresolved = (await f.feed()).packRequests[0];
        assert.equal(unresolved.phase, 'delivered');
        assert.equal(unresolved.receipt.acknowledgment, null, 'the refused result consumed nothing');
      }
      const child = cli(fixture, command, 'alpha', '--envelope');
      assert.equal(child.status, failure ? 2 : 0);
      const stdout = JSON.parse(child.stdout);
      assert.deepEqual(Object.keys(stdout).sort(), failure ? ['code', 'error', 'mutation', 'ok'] : ['code', 'ok', 'result']);
      const ack = f.acknowledgment(receipt, stdout, failure ? 'failed' : 'applied', failure ? 'none' : 'applied',
        failure ? 'Compose refused before mutation; nothing changed.' : 'Owner verified the actual Compose result.');
      const response = await f.tool({ op: 'acknowledge', acknowledgment: ack });
      assert.equal(response.resultType, 'success', response.textResultForLlm);
      const view = (await f.feed()).packRequests[0];
      assert.equal(view.phase, failure ? 'failed' : 'applied');
      assert.equal(view.applied, !failure);
      assert.deepEqual(view.receipt.acknowledgment.result, stdout, 'the provider retained the forwarded stdout exactly');
      assert.equal(view.receipt.reread.profileRevision, ack.profileRevision);
      assert.deepEqual(view.receipt.reread.entry, cmdStatus({ root: fixture.root }).result.installed.alpha ?? null);
      if (failure) {
        assert.deepEqual(stdout, { ok: false, code: 2, mutation: 'none', error: stdout.error });
        assert.match(stdout.error, /destination ownership conflict/);
      }
      assert.equal(f.sends.length, 1);
    } finally { await f?.close(); fixture.cleanup(); }
  });
});

test('T003 configured remote admission and actual install result retain the recorded exact source', async () => {
  const fixture = packEngineFixture();
  const sourceFiles = snapshotFiles(path.join(fixture.library, 'alpha'));
  const remote = remotePackCatalog(fixture, ['alpha']);
  for (const [relative, content] of sourceFiles) {
    const target = path.join(remote.repository, 'library/packs/alpha', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  remote.git('add', '-A');
  remote.git('-c', 'user.email=fixture@example.test', '-c', 'user.name=Canvas Fixture', 'commit', '-qm', 'pack artifacts');
  const commit = remote.git('rev-parse', 'HEAD');
  const f = await packHttpFixture(fixture);
  try {
    const receipt = await f.admission('install');
    const permission = await f.permission(receipt, { source: remote.source, reviewedCommit: commit,
      artifacts: [...sourceFiles.keys()], tools: [] });
    await permission.reply();
    const result = await cmdAddOffLoop({ root: fixture.root, library: fixture.library, name: 'alpha',
      source: remote.source, ref: commit });
    assert.equal(result.ok, true, result.error);
    const ack = f.acknowledgment(receipt, result);
    assert.deepEqual(ack.source, { type: 'remote', repository: remote.source, requested_ref: commit, resolved_commit: commit });
    const response = await f.tool({ op: 'acknowledge', acknowledgment: ack });
    assert.equal(response.resultType, 'success', response.textResultForLlm);
    const view = (await f.feed()).packRequests[0];
    assert.equal(view.applied, true);
    assert.deepEqual(view.receipt.reread.entry.source, ack.source);
    assert.equal(f.sends.length, 1);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T003 unreadable authority and failed owner verification cannot become Applied', async t => {
  for (const scenario of ['unavailable', 'failed verification', 'already installed']) await t.test(scenario, async () => {
    const fixture = packEngineFixture(), f = await packHttpFixture(fixture);
    try {
      const receipt = await f.admission('install');
      let ack;
      if (scenario === 'unavailable') {
        fs.writeFileSync(fixture.profilePath, 'The profile became invalid.');
        ack = f.acknowledgment(receipt, null, 'unavailable', 'none', 'Current installed authority is unreadable.');
      } else {
        const result = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', fetch: false });
        assert.equal(result.ok, true);
        if (scenario === 'already installed') {
          const duplicate = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', fetch: false });
          assert.deepEqual(duplicate.result, { added: 'alpha', files: [], alreadyInstalled: true });
          ack = f.acknowledgment(receipt, duplicate, 'stale', 'none', 'Membership changed before this add; it made no change.');
        } else ack = f.acknowledgment(receipt, result, 'failed', 'applied', 'The command returned success, but owner verification failed.');
      }
      const response = await f.tool({ op: 'acknowledge', acknowledgment: ack });
      assert.equal(response.resultType, 'success', response.textResultForLlm);
      const view = (await f.feed()).packRequests[0];
      assert.equal(view.phase, scenario === 'unavailable' ? 'unavailable' : scenario === 'already installed' ? 'stale' : 'failed');
      assert.equal(view.applied, false);
      assert.equal(view.receipt.reread.state, scenario === 'unavailable' ? 'unavailable' : 'current');
    } finally { await f.close(); fixture.cleanup(); }
  });
});

test('T003 pack reads retain current root identity when the profile cannot be acquired', async t => {
  for (const scenario of ['profile directory', 'profile read denied', 'replacement root', 'missing root']) {
    await t.test(scenario, async t => {
      const fixture = packFixture();
      fixture.profile({ alpha: fixture.entry('alpha') });
      let readMock, deniedReads = 0;
      try {
        const before = await readPacks(fixture.root, new AbortController().signal, { catalog: false });
        assert.equal(before.coverage.installed.state, 'current');
        assert.match(before.rootIdentity, /^sha256:[a-f0-9]{64}$/);
        if (scenario === 'profile directory') {
          fs.rmSync(fixture.profilePath);
          fs.mkdirSync(fixture.profilePath);
        } else if (scenario === 'profile read denied') {
          const read = fs.readFileSync;
          readMock = t.mock.method(fs, 'readFileSync', (file, ...rest) => {
            if (file === fixture.profilePath) {
              deniedReads += 1;
              throw Object.assign(new Error('Fixture profile read denied.'), { code: 'EACCES' });
            }
            return read(file, ...rest);
          });
        } else {
          fs.renameSync(fixture.root, path.join(fixture.temporary, 'previous-workspace'));
          if (scenario === 'replacement root') fs.mkdirSync(fixture.profilePath, { recursive: true });
        }
        const rootStat = scenario === 'missing root' ? null : fs.lstatSync(fixture.root);
        const observedRoot = rootStat
          ? packRevision(JSON.stringify([fs.realpathSync(fixture.root), rootStat.dev, rootStat.ino])) : null;
        const unavailable = await readPacks(fixture.root, new AbortController().signal, { catalog: false });
        if (scenario === 'profile read denied') assert.equal(deniedReads, 1);
        assert.equal(unavailable.workspaceId, before.workspaceId);
        assert.equal(unavailable.coverage.installed.state, 'unavailable');
        assert.equal(unavailable.coverage.installed.reason, 'installed_unavailable');
        assert.equal(unavailable.rootIdentity, observedRoot, 'profile failure must not discard an independently observed root');
        if (scenario.startsWith('profile')) assert.equal(unavailable.rootIdentity, before.rootIdentity);
        else assert.notEqual(unavailable.rootIdentity, before.rootIdentity, 'never substitute the previous root identity');
        for (const field of ['profileRevision', 'readRevision', 'installed', 'catalog', 'items', 'readAt']) {
          assert.equal(unavailable[field], null, `${field} remains unacquired`);
        }
      } finally {
        readMock?.mock.restore();
        fixture.cleanup();
      }
    });
  }
});

test('T003 cross-tab HTTP submit consumes one shared receipt and sends at most once', async () => {
  const fixture = packFixture();
  fixture.profile({}); fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const otherId = `pack-second-tab-${randomUUID()}`;
  const other = await openInstance(otherId, () => {}, { complete: true }, { root: fixture.root }, f.provider);
  try {
    const prepared = await (await f.post({ op: 'prepare', operation: 'install', name: 'alpha' })).json();
    const body = { op: 'submit', operation: 'install', name: 'alpha', packReceipt: prepared.packReceipt };
    const results = await Promise.all([
      f.post(body),
      call(other.url, { path: '/api/packs/request', method: 'POST',
        headers: { origin: new URL(other.url).origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    ]);
    assert.deepEqual(results.map(response => response.status).sort(), [202, 409]);
    assert.equal(f.sends.length, 1);
    assert.equal((await f.feed()).packRequests.length, 1);
    assert.equal(cmdStatus({ root: fixture.root }).result.enabled_packs.length, 0);
  } finally { await closeInstance(otherId); await f.close(); fixture.cleanup(); }
});

test('T003 pack acquisition is single-flight across tabs and stops its owned reader tree on Canvas close', { timeout: 15_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(fixture, listener.url('git'));
  const f = await packHttpFixture(fixture);
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const reading = f.post({ op: 'prepare', operation: 'install', name: 'alpha' });
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const otherRequests = await Promise.all(Array.from({ length: 16 }, () => f.post({ op: 'prepare', operation: 'install', name: 'alpha' })));
    assert.ok(otherRequests.every(response => response.status === 409));
    assert.equal(listener.connections, 1, 'refused tabs cannot each start a catalog read');
    const launched = spy.readers().length;
    assert.equal(f.provider.read().packRequests.length, 0, 'no receipt is allocated before a readable eligible snapshot');
    assert.equal(await closeInstance(f.instanceId), true);
    assert.equal((await reading).status, 503);
    assert.equal(listener.open, 0, 'no Git process still holds the stalled connection');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: fs.readdirSync(fixture.scratch) });
    assert.equal(f.provider.read().packRequests.length, 0);
    assert.equal(f.sends.length, 0);
    // Launch evidence last: the spy cannot see a fork-launched reader.
    assert.equal(launched, 1, 'refused tabs cannot each start a catalog reader');
    assert.notEqual(spy.readers()[0]?.exitedAt ?? null, null, 'the reader stopped before the cancelled prepare reported');
  } finally { await f.close(); await stopRecorded(tree); fixture.cleanup(); }
});

/**
 * A Git peer that accepts connections and never answers, so Git stalls on the
 * transport. A `git://` transfer has no Git-side timeout, so only a stop of the
 * reader's process tree ends it. Nothing here releases a connection before
 * teardown: `open` counts the connections that a live Git process still holds.
 * @param {import('node:test').TestContext} t
 */
async function silentGitListener(t) {
  /** @type {{acceptedAt: number, closedAt: number | null}[]} */
  const records = [];
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  /** @type {() => void} */
  let accepted = () => {};
  const first = new Promise(resolve => { accepted = () => resolve(undefined); });
  const server = net.createServer(socket => {
    /** @type {{acceptedAt: number, closedAt: number | null}} */
    const record = { acceptedAt: performance.now(), closedAt: null };
    records.push(record);
    sockets.add(socket);
    // A killed Git may reset its connection; that is the expected stop.
    socket.on('error', () => {});
    socket.once('close', () => { record.closedAt = performance.now(); sockets.delete(socket); });
    socket.resume();
    accepted();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(() => resolve(undefined)));
  });
  return {
    records,
    get connections() { return records.length; },
    get open() { return sockets.size; },
    /** Resolves once Git has reached the stalled transport. */
    connected: () => first,
    /** @param {'git'|'http'} scheme */
    url: scheme => `${scheme}://127.0.0.1:${port}/catalog.git`,
  };
}

/**
 * Leave only the configured upstream catalog. With `main`, Compose clones at
 * once: no `ls-remote` precedes the stalled transfer.
 * @param {ReturnType<typeof packFixture>} fixture
 * @param {string} url
 */
function stallCatalog(fixture, url) {
  fs.rmSync(fixture.library, { recursive: true, force: true });
  fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
    `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: url, source_ref: 'main' })}\n\`\`\`\n`);
}

/**
 * Record production's launches without replacing them. Production spawns
 * through the child_process default export, so this method mock sees every
 * reader. execFile (taskkill) and fork use Node's internal spawn and are not seen.
 * @param {import('node:test').TestContext} t
 */
function spawnSpy(t) {
  const spawn = childProcess.spawn;
  /** @typedef {{command: string, args: readonly string[], options: any, child: import('node:child_process').ChildProcess, spawnedAt: number, exitedAt: number | null}} SpawnCall */
  /** @type {SpawnCall[]} */
  const calls = [];
  t.mock.method(childProcess, 'spawn', /** @this {any} */ function (command, args, options) {
    const spawnedAt = performance.now();
    const child = spawn.call(this, command, args, options);
    /** @type {SpawnCall} */
    const call = { command, args, options, child, spawnedAt, exitedAt: null };
    calls.push(call);
    child.once('exit', () => { call.exitedAt = performance.now(); });
    return child;
  });
  return { calls, readers: () => calls.filter(call => Array.isArray(call.args) && call.args.includes(READER)) };
}

/**
 * Record production's Windows tree kills. Production calls taskkill through the
 * child_process default export, so this method mock sees every tree kill; other
 * execFile calls pass through. By default each kill runs the real taskkill and
 * keeps its error: real taskkill also fails, rarely, for a tree process that is
 * already exiting. `replace` stands in for taskkill and kills nothing itself;
 * it calls `fail` to report a failed tree kill.
 * @param {import('node:test').TestContext} t
 * @param {(args: string[], fail: () => void) => void} [replace]
 */
function taskkillSpy(t, replace) {
  const execFile = childProcess.execFile;
  /** @typedef {{args: string[], calledAt: number, error: Error | null}} TaskkillCall */
  /** @type {TaskkillCall[]} */
  const calls = [];
  t.mock.method(childProcess, 'execFile', /** @this {any} */ function (file, args, options, callback) {
    if (file !== 'taskkill') return execFile.apply(this, arguments);
    /** @type {TaskkillCall} */
    const call = { args: [...args], calledAt: performance.now(), error: null };
    calls.push(call);
    /** @param {Error | null} error @param {string} [stdout] @param {string} [stderr] */
    const done = (error, stdout = '', stderr = '') => {
      call.error = error;
      callback(error, stdout, stderr);
    };
    if (!replace) return execFile.call(this, file, args, options, done);
    replace(call.args, () => done(Object.assign(new Error(`Command failed: taskkill ${args.join(' ')}`), { code: 255 })));
  });
  return {
    calls,
    /** PIDs of the readers whose tree kill reported an error. */
    get failed() { return new Set(calls.filter(call => call.error).map(call => call.args[1])); },
  };
}

/**
 * A process-table row. PID plus creation time is a process's exact identity:
 * Windows reuses PIDs, and a child keeps its dead parent's PID.
 * @typedef {{pid: number, ppid: number, created: string, name: string}} ProcessRow
 */

/** @returns {Promise<ProcessRow[]>} */
function processTable() {
  const script = 'Get-CimInstance Win32_Process | ForEach-Object {'
    + ' $created = if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 };'
    + " '{0}\t{1}\t{2}\t{3}' -f $_.ProcessId, $_.ParentProcessId, $created, $_.Name }";
  return new Promise((resolve, reject) => {
    childProcess.execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout.split(/\r?\n/).filter(Boolean).map(line => {
          const [pid, ppid, created, name] = line.split('\t');
          return { pid: Number(pid), ppid: Number(ppid), created, name };
        }));
      });
  });
}

/**
 * Record a live reader's process tree by exact identity before it is stopped,
 * so that a test can check what a stop left behind without trusting taskkill's
 * report. Only Windows stops trees with taskkill; elsewhere, or for a reader
 * that the spawn spy did not see, this records nothing.
 * @param {number | undefined} pid
 */
async function readerTree(pid) {
  if (process.platform !== 'win32' || pid === undefined) return [];
  const rows = await processTable();
  const tree = rows.filter(row => row.pid === pid);
  for (let index = 0; index < tree.length; index += 1) {
    const parent = tree[index];
    // A process that only reuses a parent's old PID is older than that parent.
    tree.push(...rows.filter(row => row.ppid === parent.pid && row.pid !== parent.pid
      && BigInt(row.created) >= BigInt(parent.created)));
  }
  return tree;
}

/**
 * The members of a recorded tree that still run, by exact identity.
 * @param {ProcessRow[]} tree
 */
async function liveMembers(tree) {
  const candidates = tree.filter(({ pid }) => {
    try { return process.kill(pid, 0); }
    catch (error) { return /** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH'; }
  });
  if (!candidates.length) return [];
  const rows = await processTable();
  return candidates.filter(member => rows.some(row => row.pid === member.pid && row.created === member.created));
}

/**
 * Poll within a bound until no member of a recorded tree runs. Returns the
 * members still running at the bound.
 * @param {ProcessRow[]} tree
 */
async function survivorsAfterBound(tree, boundMs = 5_000) {
  const until = performance.now() + boundMs;
  for (;;) {
    const alive = await liveMembers(tree);
    if (!alive.length || performance.now() >= until) return alive;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Stop the members of a recorded tree that still run, only by exact identity.
 * Returns any member that outlives a bounded wait.
 * @param {ProcessRow[]} tree
 */
async function stopRecorded(tree) {
  for (const member of (await liveMembers(tree)).reverse()) {
    try { process.kill(member.pid, 'SIGKILL'); } catch { /* it ended first */ }
  }
  return survivorsAfterBound(tree);
}

/**
 * The stop oracle for stalled readers that production stopped. A clean tree
 * kill confirms the stop, and the reader's root is removed. Only a failed tree
 * kill that this test saw may leave a stop unconfirmed, such as the rare benign
 * failure for an already exiting process. That reader's root must then remain.
 * Either way, no process recorded from a stopped tree may still run, which is
 * checked by exact identity within a bound. Each seen failure is reported as a
 * test diagnostic.
 * @param {{t: import('node:test').TestContext, spy: ReturnType<typeof spawnSpy>, kills: ReturnType<typeof taskkillSpy>, trees: ProcessRow[][], scratch: string[]}} observed
 *   `scratch` lists the acquisition roots left when the stop was reported.
 */
async function assertTreeStops({ t, spy, kills, trees, scratch }) {
  const { failed } = kills;
  for (const { error } of kills.calls) {
    if (error) t.diagnostic(`taskkill failed, so the stop stayed unconfirmed: ${error.message.replace(/\s+/g, ' ').trim()}`);
  }
  const kept = spy.readers().filter(({ child }) => failed.has(String(child.pid)))
    .map(({ options }) => path.basename(options.env.TMP)).sort();
  assert.deepEqual([...scratch].sort(), kept, failed.size
    ? 'an unconfirmed stop keeps only its own checkout root' : 'the checkout root was removed after the stop');
  for (const pid of failed) {
    assert.ok(trees.some(tree => String(tree[0]?.pid) === pid && tree.length > 1),
      'the unconfirmed stop\'s live tree was recorded before the stop');
  }
  for (const tree of trees) {
    assert.deepEqual(await survivorsAfterBound(tree), [], 'no process recorded from the reader tree survived its stop');
  }
}

/**
 * The catalog coverage of a read stopped at its deadline: timed out after a
 * clean tree kill, and unconfirmed cleanup only after a failed tree kill that
 * the test saw.
 * @param {ReturnType<typeof taskkillSpy>} kills
 */
function deadlineCoverage(kills) {
  return kills.failed.size
    ? { state: 'unavailable', reason: 'catalog_cleanup_failed', message: 'The catalog reader could not confirm process cleanup.' }
    : { state: 'unavailable', reason: 'catalog_timeout', message: 'The catalog read timed out. Reload to try a fresh read.' };
}

/**
 * Run `readPacks` in a plain-Node driver that stands in for a Copilot CLI
 * extension host, so no global in this test process is patched. With
 * `executable: 'git'`, the driver's execPath is a real binary whose own parser
 * rejects a script path, like the CLI's single executable. A spawn of it runs
 * `cli/index.mjs`, as that executable runs only its own entry. The entry
 * mirrors the runtime's argv routing; the bootstrap mirrors the real parent
 * check and extension import. The driver inherits what a CLI gives an
 * extension: its entry module (a decoy here) and the CLI's PID. Only
 * allowlisted launch fields and environment keys reach the output.
 * @param {ReturnType<typeof packFixture>} fixture
 * @param {{executable: 'git'|'node', bootstrap?: 'current'|'changed'|'missing'}} options
 */
function simulatedCliHost(fixture, { executable, bootstrap }) {
  const cli = path.join(fixture.temporary, 'cli');
  const cliBootstrap = path.join(cli, 'preloads', 'extension_bootstrap.mjs');
  const entry = path.join(cli, 'index.mjs');
  const decoy = path.join(cli, 'decoy-extension.mjs');
  const marker = path.join(cli, 'decoy-imported');
  const driver = path.join(cli, 'host-driver.mjs');
  fs.mkdirSync(path.dirname(cliBootstrap), { recursive: true });
  fs.writeFileSync(entry, [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { fileURLToPath, pathToFileURL } from 'node:url';",
    "const local = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preloads', 'extension_bootstrap.mjs');",
    "if (process.argv.some(arg => path.basename(arg) === 'extension_bootstrap.mjs') && fs.existsSync(local)) {",
    '  await import(pathToFileURL(local).href);',
    '} else {',
    "  process.stderr.write('Invalid command format\\n');",
    '  process.exit(1);',
    '}',
  ].join('\n'));
  fs.writeFileSync(cliBootstrap, bootstrap === 'changed' ? 'process.exit(0);\n' : [
    "import { pathToFileURL } from 'node:url';",
    'if (process.ppid !== Number(process.env.COPILOT_EXTENSION_PARENT_PID)) process.exit(0);',
    'if (!process.env.EXTENSION_PATH) process.exit(1);',
    'await import(pathToFileURL(process.env.EXTENSION_PATH).href);',
  ].join('\n'));
  fs.writeFileSync(decoy, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, '');\nprocess.exit(1);\n`);
  const host = executable === 'git' ? executableOnPath('git') : process.execPath;
  const argvBootstrap = bootstrap === 'missing' ? path.join(cli, 'absent', 'preloads', 'extension_bootstrap.mjs')
    : bootstrap ? cliBootstrap : null;
  fs.writeFileSync(driver, [
    "import childProcess from 'node:child_process';",
    "import { syncBuiltinESMExports } from 'node:module';",
    'const node = process.execPath;',
    `const host = ${JSON.stringify(host)};`,
    'process.execPath = host;',
    `const argvBootstrap = ${JSON.stringify(argvBootstrap)};`,
    'if (argvBootstrap) process.argv.push(argvBootstrap);',
    "const keys = ['EXTENSION_PATH', 'COPILOT_EXTENSION_PARENT_PID', 'TMP', 'TEMP', 'TMPDIR', 'GIT_TERMINAL_PROMPT',",
    "  'GIT_HTTP_LOW_SPEED_LIMIT', 'GIT_HTTP_LOW_SPEED_TIME'];",
    'const launches = [];',
    'const spawn = childProcess.spawn;',
    'childProcess.spawn = function (command, args, options = {}) {',
    '  const env = options.env ?? process.env;',
    '  launches.push({ command, args, stdio: options.stdio, detached: options.detached, windowsHide: options.windowsHide,',
    '    cwd: options.cwd, env: Object.fromEntries(keys.filter(key => env[key] !== undefined).map(key => [key, env[key]])) });',
    `  return command === host && host !== node ? spawn.call(this, node, [${JSON.stringify(entry)}, ...args], options)`,
    '    : spawn.call(this, command, args, options);',
    '};',
    'syncBuiltinESMExports();',
    `const { readPacks } = await import(${JSON.stringify(PACKS_MODULE)});`,
    'const started = performance.now();',
    `const snapshot = await readPacks(${JSON.stringify(fixture.root)}, AbortSignal.timeout(20_000));`,
    'process.stdout.write(JSON.stringify({ execPath: process.execPath, hostPid: process.pid,',
    '  elapsedMs: performance.now() - started, coverage: snapshot.coverage,',
    '  packs: snapshot.catalog?.packs.map(pack => pack.name) ?? null, items: snapshot.items, launches }));',
  ].join('\n'));
  const child = spawnSync(process.execPath, [driver], {
    cwd: fixture.root, encoding: 'utf8', timeout: 25_000, windowsHide: true,
    env: { ...process.env, EXTENSION_PATH: decoy, COPILOT_EXTENSION_PARENT_PID: String(process.pid) },
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return { ...JSON.parse(child.stdout), host, cliBootstrap, decoy, marker };
}

/**
 * A reader launch sees only its own temporary root and Git's prompt ban, keeps
 * the user's Git transfer settings, reports over IPC only, and runs in the
 * workspace.
 * @param {{env: Record<string, string | undefined>, stdio: unknown, windowsHide?: boolean, detached?: boolean, cwd?: string}} launch
 * @param {ReturnType<typeof packFixture>} fixture
 */
function assertIsolatedLaunch(launch, fixture) {
  const { TMP, TEMP, TMPDIR, GIT_TERMINAL_PROMPT } = launch.env;
  assert.equal(path.dirname(String(TMP)), fixture.scratch);
  assert.match(path.basename(String(TMP)), /^dude-canvas-packs-/);
  assert.deepEqual([TEMP, TMPDIR], [TMP, TMP], 'Compose checkouts stay in the acquisition root');
  assert.equal(GIT_TERMINAL_PROMPT, '0');
  for (const key of ['GIT_HTTP_LOW_SPEED_LIMIT', 'GIT_HTTP_LOW_SPEED_TIME']) {
    assert.equal(launch.env[key], process.env[key], `no ${key} is added`);
  }
  assert.deepEqual(launch.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
  assert.equal(launch.windowsHide, true);
  assert.equal(launch.detached, process.platform !== 'win32');
  assert.equal(launch.cwd, fixture.root);
}

/**
 * Absolute path of a non-Node executable on PATH, as a stand-in host binary.
 * @param {string} name
 */
function executableOnPath(name) {
  const extensions = process.platform === 'win32' ? ['.exe'] : [''];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* next PATH entry */ }
    }
  }
  return assert.fail(`${name} is required on PATH`);
}

/**
 * @param {string} url
 * @param {RequestInit & { path?: string }} [init]
 */
function call(url, { path = '/', ...init } = {}) {
  return fetch(new URL(path, url), init).catch(error => {
    // `fetch failed` alone names neither the request nor the transport cause.
    const cause = error?.cause;
    const detail = cause ? ` (${cause.code ?? cause.name}: ${cause.message})` : '';
    throw new Error(`${init.method ?? 'GET'} ${path}: ${error?.message}${detail}`, { cause: error });
  });
}

/**
 * `fetch` normalizes the request path and refuses to set `host` or `origin`, so
 * tests that need any of them must drive the raw request line.
 * @param {import('node:http').Server} server
 * @param {{ path?: string, method?: string, headers?: Record<string, string>, body?: string }} [options]
 * @returns {Promise<number | undefined>}
 */
function rawStatus(server, { path = '/', method = 'GET', headers = {}, body } = {}) {
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

/**
 * The SDK has no local test double, so run an untouched copied runtime under a
 * package-shaped SDK boundary. IPC reports observations without consuming stdout,
 * which production reserves for JSON-RPC.
 */
function copiedExtensionHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-extension-'));
  const extensionRoot = path.join(root, 'src/extensions/dude');
  const sdkRoot = path.join(extensionRoot, 'node_modules/@github/copilot-sdk');
  const driverPath = path.join(root, 'driver.mjs');
  fs.cpSync(EXTENSION_SOURCE_ROOT, extensionRoot, { recursive: true });
  fs.cpSync(ENGINE_SOURCE_ROOT, path.join(root, 'src/skills/dude-engine'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/skills/dude-compose'), { recursive: true });
  fs.copyFileSync(path.resolve(ENGINE_SOURCE_ROOT, '../dude-compose/compose.mjs'),
    path.join(root, 'src/skills/dude-compose/compose.mjs'));
  fs.mkdirSync(sdkRoot, { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify({
    name: '@github/copilot-sdk',
    type: 'module',
    exports: { './extension': './extension.mjs' },
  }));
  fs.writeFileSync(path.join(sdkRoot, 'extension.mjs'), [
    'let canvas;',
    'let sessionOptions;',
    'let logCalls = 0;',
    'export function createCanvas(value) { canvas = value; return value; }',
    'export async function joinSession(value) {',
    '  sessionOptions = value;',
    '  return { log: async () => { logCalls += 1; throw new Error("rejected session log"); } };',
    '}',
    'export function registeredCanvas() { return canvas; }',
    'export function registeredSessionSummary() {',
    '  return {',
    '    toolNames: sessionOptions.tools.map((tool) => tool.name),',
    '    operationNames: sessionOptions.tools[0].parameters.properties.op.enum,',
    '    acknowledgmentKinds: sessionOptions.tools[0].parameters.properties.acknowledgment.oneOf.flatMap(branch =>',
    '      branch.properties.recognizes.enum ?? [branch.properties.recognizes.const]),',
    '    hasOnEvent: typeof sessionOptions.onEvent === "function",',
    '    canvasCount: sessionOptions.canvases.length,',
    '  };',
    '}',
    'export function sessionLogCalls() { return logCalls; }',
    '',
  ].join('\n'));
  fs.writeFileSync(driverPath, [
    "import fs from 'node:fs';",
    'const originalWrite = process.stdout.write;',
    'const originalPath = process.env.PATH;',
    'let stdoutWrites = 0;',
    'process.stdout.write = () => { stdoutWrites += 1; return true; };',
    'try {',
    "  fs.mkdirSync('.dude/ideas', { recursive: true });",
    "  fs.writeFileSync('.dude/ideas/001-initial-unavailable.md', [",
    "    '---', 'title: initial-unavailable', 'slug: initial-unavailable',",
    "    'status: draft', 'spec_path:', '---', '', '## Idea', '', 'Initial acquisition fixture.',",
    "  ].join('\\n'));",
    "  process.env.PATH = '';",
    "  const sdk = await import('./src/extensions/dude/node_modules/@github/copilot-sdk/extension.mjs');",
    "  await import('./src/extensions/dude/extension.mjs');",
    '  const canvas = sdk.registeredCanvas();',
    "  const context = { instanceId: 'rejected-session-logs', input: { target: 'initial-unavailable' } };",
    '  const first = await canvas.open(context);',
    '  const second = await canvas.open(context);',
    '  const page = await fetch(first.url);',
    "  const projection = await (await fetch(new URL('/api/projection', first.url))).json();",
    '  await canvas.onClose({ instanceId: context.instanceId });',
    '  let portRefused = false;',
    '  try { await fetch(first.url); } catch { portRefused = true; }',
    '  await canvas.onClose({ instanceId: context.instanceId });',
    '  process.send?.({',
    '    first, second, pageStatus: page.status, projection, portRefused,',
    '    sessionLogCalls: sdk.sessionLogCalls(), stdoutWrites,',
    '    sessionRegistration: sdk.registeredSessionSummary(),',
    '  });',
    '} catch (error) {',
    "  process.send?.({ error: error instanceof Error ? error.stack : String(error), stdoutWrites });",
    '} finally {',
    '  process.stdout.write = originalWrite;',
    "  if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;",
    '}',
    '',
  ].join('\n'));
  return {
    root,
    /** @returns {Promise<{result:any,stdout:string,stderr:string}>} */
    run() {
      return new Promise((resolve, reject) => {
        const child = fork(driverPath, [], { cwd: root, silent: true });
        const stdout = [];
        const stderr = [];
        let result = null;
        let settled = false;
        const finish = (callback) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback();
        };
        child.stdout?.on('data', (chunk) => stdout.push(chunk));
        child.stderr?.on('data', (chunk) => stderr.push(chunk));
        child.on('message', (message) => {
          result = message;
        });
        child.on('error', (error) => finish(() => reject(error)));
        child.on('exit', (code, signal) => finish(() => {
          if (result) {
            resolve({
              result,
              stdout: Buffer.concat(stdout).toString('utf8'),
              stderr: Buffer.concat(stderr).toString('utf8'),
            });
            return;
          }
          reject(new Error(`extension fixture exited ${code ?? 'null'} (${signal ?? 'none'}) without IPC result`));
        }));
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          finish(() => reject(new Error('extension fixture timed out')));
        }, 5_000);
      });
    },
  };
}

test('open binds an OS-assigned loopback port and serves the shipped workspace shell', async () => {
  const { log } = recorder();
  const instance = await openInstance('bind-1', log);
  try {
    const address = instance.server.address();
    assert.ok(address && typeof address === 'object');
    assert.equal(address.address, '127.0.0.1');
    assert.ok(address.port > 0);
    assert.match(instance.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);

    const response = await call(instance.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
    const body = await response.text();
    assert.match(body, /<title>Dude<\/title>/);
    assert.match(body, /<script type="module" src="\/assets\/app\.js"><\/script>/);
    assert.doesNotMatch(body, /new EventSource\("\/events"\)/,
      'the React data owner, not the bootstrap document, owns the one event stream');
    assert.match(body, /recorded work and current owner requests/);
  } finally {
    await closeInstance('bind-1');
  }
});

test('open is idempotent by instanceId and distinct instances get distinct servers', async () => {
  const { log } = recorder();
  const first = await openInstance('same', log);
  const second = await openInstance('same', log);
  const other = await openInstance('other', log);
  try {
    assert.equal(second, first);
    assert.equal(second.url, first.url);
    assert.notEqual(other.url, first.url);
  } finally {
    await closeInstance('same');
    await closeInstance('other');
  }
});

test('concurrent opens for one instanceId start exactly one server', async () => {
  const { log } = recorder();
  const [first, second] = await Promise.all([
    openInstance('race', log),
    openInstance('race', log),
  ]);
  try {
    assert.equal(second, first);
  } finally {
    await closeInstance('race');
  }
});

test('only exact workspace shell assets are served with fixed MIME and cache headers', async () => {
  // Arrange
  const { log } = recorder();
  const instance = await openInstance('routes', log);
  try {
    const expectedAssets = [
      ['/', 'text/html; charset=utf-8', 'ui/index.html'],
      ['/assets/app.js', 'text/javascript; charset=utf-8', 'ui/assets/app.js'],
      ['/assets/app.js.LEGAL.txt', 'text/plain; charset=utf-8', 'ui/assets/app.js.LEGAL.txt'],
    ];

    // Act + Assert
    assert.deepEqual(Object.keys(ASSET_ROUTES), expectedAssets.map(([route]) => route));
    for (const [route, mime, relative] of expectedAssets) {
      const response = await call(instance.url, { path: route });
      assert.equal(response.status, 200, `GET ${route}`);
      assert.equal(response.headers.get('content-type'), mime, `MIME for ${route}`);
      assert.equal(response.headers.get('cache-control'), 'no-store', `cache policy for ${route}`);
      assert.equal(
        await response.text(),
        fs.readFileSync(new URL(`./${relative}`, import.meta.url), 'utf8'),
        `exact bytes for ${route}`,
      );
    }

    for (const route of [
      '/index.html',
      '/ui/index.html',
      '/assets/',
      '/assets/app.js/',
      '/assets/nested/app.js',
      '/assets/app.js.map',
      '/lib/canvas-server.mjs',
      '/api/state',
      '/review',
      '/nope',
    ]) {
      const response = await call(instance.url, { path: route });
      assert.equal(response.status, 404, `unknown path ${route}`);
    }
    assert.equal(await rawStatus(instance.server, { path: '/../extension.mjs' }), 404);
    for (const [route] of expectedAssets) {
      for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
        assert.equal(
          await rawStatus(instance.server, { path: route, method }),
          404,
          `${method} ${route} is not an asset route`,
        );
      }
    }
  } finally {
    await closeInstance('routes');
  }
});

test('provider instances serve exactly nine adopted Review files while default read-only instances stay useful', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-review-static-'));
  const expected = [
    ['/review/engine.mjs', 'text/javascript; charset=utf-8', 'ui/review/engine.mjs'],
    ['/review/geometry.mjs', 'text/javascript; charset=utf-8', 'ui/review/geometry.mjs'],
    ['/review/shapes.mjs', 'text/javascript; charset=utf-8', 'ui/review/shapes.mjs'],
    ['/review/inspector.mjs', 'text/javascript; charset=utf-8', 'ui/review/inspector.mjs'],
    ['/review/panel.mjs', 'text/javascript; charset=utf-8', 'ui/review/panel.mjs'],
    ['/review/capture.mjs', 'text/javascript; charset=utf-8', 'ui/review/capture.mjs'],
    ['/review/bridge.mjs', 'text/javascript; charset=utf-8', 'ui/review/bridge.mjs'],
    ['/review/styles.css', 'text/css; charset=utf-8', 'ui/review/styles.css'],
    ['/review/NOTICE.txt', 'text/plain; charset=utf-8', 'ui/review/NOTICE.txt'],
  ];
  const provider = /** @type {any} */ ({
    matchesRoot: (candidate) => path.resolve(candidate) === path.resolve(root),
    subscribe: () => () => {},
  });
  const plain = await openInstance('review-static-plain', () => {}, Object.freeze({ complete: true }));
  const enabled = await openInstance(
    'review-static-enabled',
    () => {},
    Object.freeze({ complete: true }),
    { root },
    provider,
  );
  try {
    // Act + Assert
    assert.equal((await call(plain.url)).status, 200, 'the existing shell is independent of Review');
    assert.equal((await call(plain.url, { path: '/review/engine.mjs' })).status, 404);
    assert.deepEqual(Object.keys(REVIEW_ASSET_ROUTES), expected.map(([route]) => route));
    for (const [route, mime, relative] of expected) {
      for (const origin of [undefined, 'null']) {
        const response = await call(enabled.url, {
          path: route,
          ...(origin ? { headers: { origin } } : {}),
        });
        assert.equal(response.status, 200, `${route} from ${origin ?? 'same-origin navigation'}`);
        assert.equal(response.headers.get('content-type'), mime);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          fs.readFileSync(new URL(`./${relative}`, import.meta.url)),
          `exact adopted bytes for ${route}`,
        );
      }
    }
    for (const route of [
      '/review/unlisted.mjs',
      '/review/nested/engine.mjs',
      '/review/engine.test.mjs',
      '/review/package.json',
      '/review/node_modules/dependency/index.mjs',
      '/frontend/app.jsx',
    ]) {
      assert.equal((await call(enabled.url, { path: route })).status, 404, route);
    }
    assert.equal(
      await rawStatus(enabled.server, { path: '/review/../extension.mjs' }),
      404,
      'review traversal never becomes a static source read',
    );
  } finally {
    await closeInstance('review-static-plain');
    await closeInstance('review-static-enabled');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 work-index route is an exact read-only GET over the production reader', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-work-index-'));
  writeDraft(root, '001', 'route-fixture');
  const bd = installBdFixture([{ output: [] }, { output: [] }]);
  await bd.run(async () => {
    const instance = await openInstance(
      'work-index-route',
      () => {},
      Object.freeze({ complete: true }),
      { root },
    );
    try {
      // Act
      const response = await call(instance.url, { path: '/api/work-index' });
      const body = await response.json();

      // Assert
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(body).sort(), [
        'contexts', 'coverage', 'inventoryIdentity', 'items', 'readAt',
        'rootIdentity', 'sourceIdentity', 'sources', 'workspace', 'workspaceId',
      ]);
      assert.equal(body.contexts.length, 1);
      assert.equal(body.items[0].ideaPath, '.dude/ideas/001-route-fixture.md');
      assert.equal(body.items[0].basis, 'idea-ledger');
      assert.equal(body.items[0].taskCounts, null);
      assert.equal(body.coverage.inventory.state, 'current');
      assert.equal((await call(instance.url, { path: '/api/work-index?target=route-fixture' })).status, 404);
      assert.equal((await call(instance.url, { path: '/api/work-index/' })).status, 404);
      assert.equal((await call(instance.url, { path: '/api/work-index', method: 'POST' })).status, 404);
      assert.deepEqual(bd.calls.map(({ args }) => args), [BD_LIST_CALL, BD_LIST_CALL]);
    } finally {
      await closeInstance('work-index-route');
    }
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('T001 packs GET preserves complete catalog metadata and profile-ordered installed files/source without writes', async () => {
  const fixture = packFixture();
  const remoteSource = { type: 'remote', repository: 'https://example.test/packs',
    requested_ref: 'v1.2.3', resolved_commit: 'a'.repeat(40) };
  const installed = {
    zulu: fixture.entry('zulu', remoteSource),
    alpha: { ...fixture.entry('alpha'), files: [
      '.github/agents/dude-pack-alpha-worker.agent.md', '.github/skills/dude-pack-alpha-helper',
    ] },
    retired: fixture.entry('retired'),
  };
  fixture.profile(installed);
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'zulu'];
  fixture.catalog(names);
  // Source identity and membership do not claim integrity of installed bytes.
  const artifact = path.join(fixture.root, installed.alpha.files[0]);
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, 'locally changed installed bytes');
  const before = snapshotFiles(fixture.root);
  let sends = 0;
  const provider = /** @type {any} */ ({
    matchesRoot: root => root === fixture.root, subscribe: () => () => {},
    respond() { sends += 1; }, captureIdea() { sends += 1; }, requestPack() { sends += 1; },
  });
  const instance = await openInstance('packs-local', () => {}, { complete: true }, { root: fixture.root }, provider);
  try {
    const response = await call(instance.url, { path: '/api/packs' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.coverage.installed.state, 'current');
    assert.equal(body.coverage.catalog.state, 'current');
    assert.deepEqual(body.installed, { enabled_packs: ['alpha', 'retired', 'zulu'], installed });
    assert.equal(body.catalog.origin, 'local');
    assert.deepEqual(body.catalog.packs, names.map(name => ({
      name, description: `${name} full description <script>inert()</script>`,
      use_cases: ['writing', 'ui'], installed: Object.hasOwn(installed, name),
    })));
    assert.deepEqual(body.items.map(item => item.name), ['zulu', 'alpha', 'retired', ...names.filter(name => !Object.hasOwn(installed, name))]);
    assert.deepEqual(body.items.find(item => item.name === 'retired'), {
      name: 'retired', installed: true, ...installed.retired, description: null, use_cases: null,
    });
    assert.deepEqual(body.items[0].source, remoteSource);
    assert.match(body.workspaceId, /^sha256:[a-f0-9]{64}$/);
    assert.match(body.rootIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.match(body.profileRevision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(Number.isNaN(Date.parse(body.readAt)), false);
    assert.equal(sends, 0);
    assert.deepEqual(snapshotFiles(fixture.root), before);
  } finally {
    await closeInstance('packs-local');
    fixture.cleanup();
  }
});

test('T001 packs GET does not invent prototype membership for a catalog named constructor', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['constructor']);
  const before = snapshotFiles(fixture.root);
  const instance = await openInstance('packs-prototype', () => {}, { complete: true }, { root: fixture.root });
  try {
    const body = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(body.coverage.installed.state, 'empty');
    assert.equal(body.coverage.catalog.state, 'current');
    assert.deepEqual(body.installed, { enabled_packs: [], installed: {} });
    assert.equal(Object.hasOwn(body.installed.installed, 'constructor'), false);
    assert.equal(body.installed.installed.constructor, Object.prototype.constructor);
    assert.deepEqual(body.catalog.packs, [{
      name: 'constructor', installed: false,
      description: 'constructor full description <script>inert()</script>', use_cases: ['writing', 'ui'],
    }], 'Compose reports valid catalog metadata without installed membership');
    assert.deepEqual(body.items, [{
      ...body.catalog.packs[0], files: null, source: null,
    }], 'an inherited constructor must not become installed membership in the join');
    assert.deepEqual(snapshotFiles(fixture.root), before);

    const installed = { constructor: fixture.entry('constructor') };
    fixture.profile(installed);
    const installedBefore = snapshotFiles(fixture.root);
    const current = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(current.coverage.installed.state, 'current');
    assert.deepEqual(current.installed, { enabled_packs: ['constructor'], installed });
    assert.deepEqual(current.items, [{
      ...body.catalog.packs[0], installed: true, ...installed.constructor,
    }], 'an own constructor entry remains authoritative');
    assert.deepEqual(snapshotFiles(fixture.root), installedBefore);
  } finally {
    await closeInstance('packs-prototype');
    fixture.cleanup();
  }
});

test('T001 packs GET uses the configured remote catalog and retains installed-only records on its failure', async () => {
  const fixture = packFixture();
  fixture.profile({ retired: fixture.entry('retired') });
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'];
  const remote = remotePackCatalog(fixture, names);
  const before = snapshotFiles(fixture.root);
  const instance = await openInstance('packs-remote', () => {}, { complete: true }, { root: fixture.root });
  try {
    const response = await call(instance.url, { path: '/api/packs' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.catalog.origin, `${remote.source} @ main`);
    assert.deepEqual(body.catalog.packs.map(pack => pack.name), names);
    assert.equal(body.catalog.packs[6].description, 'golf full description <script>inert()</script>');
    assert.deepEqual(body.catalog.packs[6].use_cases, ['writing', 'ui']);
    assert.deepEqual(body.items[0].source, fixture.entry('retired').source);

    fs.renameSync(remote.repository, `${remote.repository}-offline`);
    const failed = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(failed.coverage.installed.state, 'current');
    assert.equal(failed.coverage.catalog.state, 'unavailable');
    assert.match(failed.coverage.catalog.message, /failed to fetch source/);
    assert.equal(failed.catalog, null, 'a failed current read must not reuse the prior remote catalog');
    assert.deepEqual(failed.installed, body.installed);
    assert.deepEqual(failed.items, [body.items[0]]);
    assert.deepEqual(snapshotFiles(fixture.root), before);
  } finally {
    await closeInstance('packs-remote');
    fixture.cleanup();
  }
});

for (const names of [['alpha'], []]) {
  test(`T001 packs GET rejects configured linked catalog ancestors with ${names.length ? 'populated' : 'empty'} catalogs`, async () => {
    const fixture = packFixture();
    const installed = { retired: fixture.entry('retired') };
    fixture.profile(installed);
    fs.rmSync(fixture.library, { recursive: true });
    const source = path.join(fixture.temporary, 'configured-source');
    const sourceLibrary = path.join(source, 'library');
    const sourceCatalog = path.join(sourceLibrary, 'packs');
    fs.mkdirSync(sourceCatalog, { recursive: true });
    fixture.catalog(names, sourceCatalog);
    fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
      `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: source, source_ref: 'main' })}\n\`\`\`\n`);
    const before = snapshotFiles(fixture.root);
    const id = `packs-linked-source-${names.length}`;
    const instance = await openInstance(id, () => {}, { complete: true }, { root: fixture.root });
    try {
      const valid = await (await call(instance.url, { path: '/api/packs' })).json();
      assert.equal(valid.coverage.installed.state, 'current');
      assert.deepEqual(valid.installed, { enabled_packs: ['retired'], installed });
      assert.equal(valid.coverage.catalog.state, names.length ? 'current' : 'empty');
      assert.equal(valid.catalog.origin, `source ${source}`);
      assert.deepEqual(valid.catalog.packs.map(pack => pack.name), names);

      // Change only the library ancestor. The configured root, profile and all
      // catalog bytes remain valid, so no parser/installed guard can mask this.
      const outside = path.join(fixture.temporary, 'outside-library');
      fs.renameSync(sourceLibrary, outside);
      fs.symlinkSync(outside, sourceLibrary, process.platform === 'win32' ? 'junction' : 'dir');
      const outsideBefore = snapshotFiles(outside);
      const body = await (await call(instance.url, { path: '/api/packs' })).json();
      assert.equal(body.coverage.installed.state, 'current');
      assert.deepEqual(body.installed, valid.installed);
      assert.equal(body.coverage.catalog.state, 'unavailable');
      assert.match(body.coverage.catalog.message, /symbolic link 'library'/);
      assert.equal(body.catalog, null);
      assert.deepEqual(body.items, [{
        name: 'retired', installed: true, ...installed.retired, description: null, use_cases: null,
      }]);
      assert.deepEqual(snapshotFiles(fixture.root), before);
      assert.deepEqual(snapshotFiles(outside), outsideBefore);
      assert.equal(fs.lstatSync(sourceLibrary).isSymbolicLink(), true, 'the reader does not repair the source');
      assert.deepEqual(fs.readdirSync(fixture.scratch), []);
    } finally {
      await closeInstance(id);
      fixture.cleanup();
    }
  });
}

test('T001 packs GET distinguishes confirmed empty from malformed or unsafe installed authority', async () => {
  const fixture = packFixture();
  const instance = await openInstance('packs-authority', () => {}, { complete: true }, { root: fixture.root });
  try {
    const empty = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(empty.coverage.installed.state, 'empty');
    assert.equal(empty.coverage.catalog.state, 'empty');
    assert.deepEqual(empty.installed, { enabled_packs: [], installed: {} });
    assert.deepEqual(empty.items, []);
    for (const content of [
      '# Profile\n\n```json\nnot JSON\n```\n',
      `# Profile\n\n\`\`\`json\n${JSON.stringify({ installed: {
        alpha: { ...fixture.entry('alpha'), files: ['.github/agents/../dude-pack-alpha-worker.agent.md'] },
      } })}\n\`\`\`\n`,
    ]) {
      fs.writeFileSync(fixture.profilePath, content);
      const before = snapshotFiles(fixture.root);
      const body = await (await call(instance.url, { path: '/api/packs' })).json();
      assert.equal(body.coverage.installed.state, 'unavailable');
      assert.equal(body.coverage.catalog.state, 'unavailable');
      assert.equal(body.installed, null);
      assert.equal(body.catalog, null);
      assert.equal(body.items, null);
      assert.deepEqual(snapshotFiles(fixture.root), before);
    }
  } finally {
    await closeInstance('packs-authority');
    fixture.cleanup();
  }
});

test('T001 packs GET keeps installed authority when catalog metadata is invalid', async () => {
  const fixture = packFixture();
  const installed = { alpha: fixture.entry('alpha') };
  fixture.profile(installed);
  fixture.catalog(['alpha']);
  fs.writeFileSync(path.join(fixture.library, 'alpha/pack.md'), '---\nname: alpha\nuse-cases: ui\n---\n');
  const before = snapshotFiles(fixture.root);
  const instance = await openInstance('packs-bad-catalog', () => {}, { complete: true }, { root: fixture.root });
  try {
    const body = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(body.coverage.installed.state, 'current');
    assert.equal(body.coverage.catalog.state, 'unavailable');
    assert.match(body.coverage.catalog.message, /invalid metadata.*use-cases/);
    assert.deepEqual(body.installed.installed, installed);
    assert.deepEqual(body.items, [{ name: 'alpha', installed: true, ...installed.alpha, description: null, use_cases: null }]);
    assert.equal(body.catalog, null);
    assert.deepEqual(snapshotFiles(fixture.root), before);
    assert.deepEqual(fs.readdirSync(fixture.scratch), [], 'temporary source acquisition is cleaned on failure');
  } finally {
    await closeInstance('packs-bad-catalog');
    fixture.cleanup();
  }
});

test('T001 packs GET rejects linked profile parents and linked recorded destinations without reading them as empty', async () => {
  const fixture = packFixture();
  const installed = { alpha: { ...fixture.entry('alpha'), files: ['.github/skills/dude-pack-alpha-helper'] } };
  fixture.profile(installed);
  fixture.catalog(['alpha']);
  const outside = path.join(fixture.temporary, 'outside');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(fixture.root, '.github/skills'), { recursive: true });
  const link = path.join(fixture.root, installed.alpha.files[0]);
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  const profileBytes = fs.readFileSync(fixture.profilePath);
  const instance = await openInstance('packs-linked', () => {}, { complete: true }, { root: fixture.root });
  try {
    const artifact = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(artifact.coverage.installed.state, 'unavailable');
    assert.match(artifact.coverage.installed.message, /symbolic link/);
    assert.equal(artifact.installed, null);
    fs.unlinkSync(link);
    const metadata = path.dirname(fixture.profilePath);
    const moved = path.join(outside, 'metadata');
    fs.renameSync(metadata, moved);
    fs.symlinkSync(moved, metadata, process.platform === 'win32' ? 'junction' : 'dir');
    const parent = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(parent.coverage.installed.state, 'unavailable');
    assert.match(parent.coverage.installed.message, /symbolic link/);
    assert.equal(parent.installed, null);
    assert.equal(parent.items, null);
    assert.deepEqual(fs.readFileSync(path.join(moved, 'profile.md')), profileBytes);
  } finally {
    await closeInstance('packs-linked');
    fixture.cleanup();
  }
});

test('T001 packs GET retains large complete contexts, omitted metadata and fresh local replacements', async t => {
  const fixture = packFixture();
  const names = Array.from({ length: 128 }, (_, index) => `pack-${String(index).padStart(3, '0')}`);
  const order = names.filter((_, index) => index % 2 === 0).reverse();
  fixture.profile(Object.fromEntries(order.map(name => [name, fixture.entry(name)])));
  fixture.catalog(names);
  fs.writeFileSync(path.join(fixture.library, names[127], 'pack.md'), `---\nname: ${names[127]}\n---\n`);
  const before = snapshotFiles(fixture.root);
  const spy = spawnSpy(t);
  const instance = await openInstance('packs-complete', () => {}, { complete: true }, { root: fixture.root });
  try {
    const body = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(body.catalog.packs.length, 128);
    assert.deepEqual(body.catalog.packs.map(pack => pack.name), names);
    assert.deepEqual(body.items.slice(0, 64).map(pack => pack.name), order);
    assert.deepEqual(body.items.slice(64).map(pack => pack.name), names.filter((_, index) => index % 2 === 1));
    assert.equal(body.catalog.packs[127].description, '');
    assert.deepEqual(body.catalog.packs[127].use_cases, []);
    assert.equal(spy.readers().length, 1, 'there is one acquisition, not a reader per row or page');
    assert.deepEqual(snapshotFiles(fixture.root), before);
    const description = 'Complete replacement description. '.repeat(4096);
    fs.writeFileSync(path.join(fixture.library, names[127], 'pack.md'),
      `---\nname: ${names[127]}\ndescription: ${JSON.stringify(description)}\nuse-cases: [writing]\n---\n`);
    const replaced = snapshotFiles(fixture.root);
    const fresh = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.equal(fresh.catalog.packs[127].description, description, 'metadata is not shortened');
    assert.deepEqual(fresh.catalog.packs[127].use_cases, ['writing']);
    assert.equal(fresh.profileRevision, body.profileRevision);
    assert.equal(spy.readers().length, 2, 'a completed read is not cached');
    assert.deepEqual(snapshotFiles(fixture.root), replaced);
    assert.deepEqual(fs.readdirSync(fixture.scratch), []);
  } finally {
    await closeInstance('packs-complete');
    fixture.cleanup();
  }
});

test('T001 packs GET rejects source/root/path overrides, bodies, other methods and foreign origins', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const before = snapshotFiles(fixture.root);
  const instance = await openInstance('packs-gates', () => {}, { complete: true }, { root: fixture.root });
  const host = new URL(instance.url).host;
  try {
    // A valid companion root and catalog ensure these refusals exercise the route gate.
    assert.equal((await call(instance.url, { path: '/api/packs' })).status, 200);
    for (const suffix of ['?root=elsewhere', '?source=file:///elsewhere', '?ref=other', '?library=elsewhere',
      '?path=../profile.md', '?useCase=ui', '?command=add', '?', '/']) {
      assert.equal(await rawStatus(instance.server, { path: `/api/packs${suffix}`, headers: { host } }), 404, suffix);
    }
    assert.equal(await rawStatus(instance.server, { path: '/api/packs', method: 'POST', headers: { host } }), 404);
    assert.equal(await rawStatus(instance.server, { path: '/api/packs', headers: {
      host, 'content-type': 'application/json', 'content-length': '2',
    }, body: '{}' }), 400);
    assert.equal(await rawStatus(instance.server, { path: '/api/packs', headers: { host, origin: 'https://example.test' } }), 403);
    assert.deepEqual(snapshotFiles(fixture.root), before);
  } finally {
    await closeInstance('packs-gates');
    fixture.cleanup();
  }
});

test('T001 packs GET rejects a profile preimage race across successful reads', async t => {
  const fixture = packFixture();
  fixture.profile({ alpha: fixture.entry('alpha') });
  fixture.catalog(['alpha', 'bravo']);
  const next = serializeProfileDocument({ installed: { bravo: fixture.entry('bravo') } }, { root: fixture.root });
  const instance = await openInstance('packs-profile-race', () => {}, { complete: true }, { root: fixture.root });
  const original = fs.readFileSync;
  let reads = 0;
  t.mock.method(fs, 'readFileSync', function (file, ...args) {
    const bytes = original.call(this, file, ...args);
    if (file === fixture.profilePath && ++reads === 2) fs.writeFileSync(fixture.profilePath, next);
    return bytes;
  });
  try {
    const response = await call(instance.url, { path: '/api/packs' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(reads >= 3, 'the final profile check must observe the valid replacement');
    assert.equal(body.coverage.installed.state, 'stale');
    assert.equal(body.coverage.installed.reason, 'profile_changed');
    assert.equal(body.coverage.catalog.reason, 'profile_changed');
    assert.equal(body.installed, null);
    assert.equal(body.catalog, null);
    assert.equal(body.items, null, 'never join old installed files to new membership');
    assert.equal(fs.readFileSync(fixture.profilePath, 'utf8'), next, 'a read must not restore or repair raced bytes');
  } finally {
    t.mock.restoreAll();
    await closeInstance('packs-profile-race');
    fixture.cleanup();
  }
});

test('T001 packs GET rejects a replaced workspace even with identical profile and catalog bytes', async t => {
  const fixture = packFixture();
  fixture.profile({ alpha: fixture.entry('alpha') });
  fixture.catalog(['alpha']);
  const original = fs.readFileSync;
  let reads = 0;
  const instance = await openInstance('packs-root-race', () => {}, { complete: true }, { root: fixture.root });
  t.mock.method(fs, 'readFileSync', function (file, ...args) {
    const bytes = original.call(this, file, ...args);
    if (file === fixture.profilePath && ++reads === 2) {
      const previous = path.join(fixture.temporary, 'previous-workspace');
      fs.renameSync(fixture.root, previous);
      fs.cpSync(previous, fixture.root, { recursive: true });
    }
    return bytes;
  });
  try {
    const body = await (await call(instance.url, { path: '/api/packs' })).json();
    assert.ok(reads >= 3);
    assert.equal(body.coverage.installed.reason, 'workspace_changed');
    assert.equal(body.coverage.catalog.reason, 'workspace_changed');
    assert.equal(body.installed, null);
    assert.equal(body.catalog, null);
  } finally {
    t.mock.restoreAll();
    await closeInstance('packs-root-race');
    fixture.cleanup();
  }
});

test('T001 packs GET coalesces live reads, stays responsive and stops its reader tree on close', { timeout: 15_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(fixture, listener.url('git'));
  const instance = await openInstance('packs-close', () => {}, { complete: true }, { root: fixture.root });
  const firstController = new AbortController();
  let requests = 0, disconnected, joined;
  const firstClosed = new Promise(resolve => { disconnected = resolve; });
  const secondJoined = new Promise(resolve => { joined = resolve; });
  instance.server.on('request', (req, res) => {
    if (req.url !== '/api/packs') return;
    requests += 1;
    if (requests === 1) res.once('close', disconnected);
    if (requests === 2) joined();
  });
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const first = call(instance.url, { path: '/api/packs', signal: firstController.signal }).catch(error => error);
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    assert.equal((await call(instance.url, { path: '/api/projection' })).status, 200);
    const second = call(instance.url, { path: '/api/packs' });
    await secondJoined;
    assert.equal(instance.packRead.readers, 2);
    const coalesced = spy.readers().length;
    firstController.abort();
    await first;
    await firstClosed;
    assert.equal(instance.packRead.readers, 1);
    assert.equal(listener.open, 1, 'another live reader retains the acquisition');
    const retained = spy.readers()[0]?.exitedAt === null;
    assert.equal(await closeInstance('packs-close'), true);
    const stopped = { open: listener.open, scratch: fs.readdirSync(fixture.scratch) };
    const launched = { readers: spy.readers().length, exited: spy.readers()[0]?.exitedAt !== null };
    assert.equal(stopped.open, 0, 'the reader tree stopped before close returned');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: stopped.scratch });
    assert.equal((await second).status, 503);
    const replacement = await openInstance('packs-close', () => {}, { complete: true }, { root: fixture.root });
    assert.equal(replacement.packRead, null, 'a replacement lifetime inherits no in-flight read or result');
    // Launch evidence last: the spy cannot see a fork-launched reader.
    assert.deepEqual({ coalesced, retained, ...launched }, { coalesced: 1, retained: true, readers: 1, exited: true });
  } finally {
    await closeInstance('packs-close');
    await stopRecorded(tree);
    fixture.cleanup();
  }
});

test('T001 packs GET close awaits cleanup after its last HTTP reader has disconnected', { timeout: 15_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(fixture, listener.url('git'));
  const instance = await openInstance('packs-disconnected-close', () => {}, { complete: true }, { root: fixture.root });
  const controller = new AbortController();
  let disconnected;
  const closed = new Promise(resolve => { disconnected = resolve; });
  instance.server.once('request', (_, res) => res.once('close', disconnected));
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const reading = call(instance.url, { path: '/api/packs', signal: controller.signal }).catch(error => error);
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    controller.abort();
    await reading;
    await closed;
    assert.equal(await closeInstance('packs-disconnected-close'), true);
    const stopped = { open: listener.open, scratch: fs.readdirSync(fixture.scratch) };
    const launched = { readers: spy.readers().length, exited: spy.readers()[0]?.exitedAt !== null };
    assert.equal(stopped.open, 0, 'close returned only after the reader tree stopped');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: stopped.scratch });
    // Launch evidence last: the spy cannot see a fork-launched reader.
    assert.deepEqual(launched, { readers: 1, exited: true }, 'the reader had exited when close returned');
  } finally {
    await closeInstance('packs-disconnected-close');
    await stopRecorded(tree);
    fixture.cleanup();
  }
});

test('T001 packs GET stops a stalled Git transfer\'s whole reader tree at the deadline without manual release', { timeout: 30_000 }, async t => {
  for (const scheme of /** @type {const} */ (['git', 'http'])) await t.test(`${scheme}://`, async t => {
    const fixture = packFixture();
    const installed = { alpha: fixture.entry('alpha') };
    fixture.profile(installed);
    const listener = await silentGitListener(t);
    const spy = spawnSpy(t);
    const kills = taskkillSpy(t);
    stallCatalog(fixture, listener.url(scheme));
    const before = snapshotFiles(fixture.root);
    const instanceId = `packs-stalled-${scheme}`;
    const instance = await openInstance(instanceId, () => {}, { complete: true }, { root: fixture.root });
    let tree = /** @type {ProcessRow[]} */ ([]);
    try {
      const started = performance.now();
      const pending = call(instance.url, { path: '/api/packs' });
      await listener.connected();
      tree = await readerTree(spy.readers()[0]?.child.pid);
      const response = await pending;
      const body = await response.json();
      const elapsed = performance.now() - started;
      assert.equal(response.status, 200);
      assert.deepEqual(body.coverage.catalog, deadlineCoverage(kills));
      assert.equal(body.coverage.installed.state, 'current');
      assert.equal(body.catalog, null);
      assert.deepEqual(body.items, [{ name: 'alpha', installed: true, ...installed.alpha, description: null, use_cases: null }]);
      assert.ok(listener.connections >= 1, 'Git reached the stalled transport');
      assert.equal(listener.open, 0, 'no Git process still holds the stalled connection');
      await assertTreeStops({ t, spy, kills, trees: [tree], scratch: fs.readdirSync(fixture.scratch) });
      assert.ok(elapsed >= 5_000 && elapsed < 7_500, `reported within the deadline plus stop confirmation: ${elapsed} ms`);
      assert.deepEqual(snapshotFiles(fixture.root), before);
      // Launch evidence last: the spy cannot see a fork-launched reader.
      assert.equal(spy.readers().length, 1);
      assert.notEqual(spy.readers()[0].exitedAt, null, 'the reader exited before the read reported');
    } finally {
      await closeInstance(instanceId);
      await stopRecorded(tree);
      fixture.cleanup();
    }
  });
});

test('T001 a later pack read recovers at once while an earlier stalled Git transfer stays unreleased', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({ alpha: fixture.entry('alpha') });
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(fixture, listener.url('git'));
  const instance = await openInstance('packs-stall-recovery', () => {}, { complete: true }, { root: fixture.root });
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const pending = call(instance.url, { path: '/api/packs' });
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const stalled = await (await pending).json();
    const connections = listener.connections;
    // Compose prefers a local catalog; the configured stalled source stays in place.
    fixture.catalog(['alpha', 'bravo']);
    const started = performance.now();
    const recovered = await (await call(instance.url, { path: '/api/packs' })).json();
    const elapsed = performance.now() - started;
    assert.deepEqual(recovered.coverage.catalog, { state: 'current', reason: null, message: null });
    assert.equal(recovered.catalog.origin, 'local');
    assert.deepEqual(recovered.catalog.packs.map(pack => pack.name), ['alpha', 'bravo']);
    assert.ok(elapsed < 5_000, `the later read waited on nothing: ${elapsed} ms`);
    assert.equal(listener.connections, connections, 'the later read did not touch the stalled source');
    assert.equal(listener.open, 0);
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: fs.readdirSync(fixture.scratch) });
    assert.equal(stalled.coverage.catalog.reason, deadlineCoverage(kills).reason, 'the stalled read ended at its deadline');
    // Launch evidence last: the spy cannot see a fork-launched reader.
    const readers = spy.readers();
    assert.equal(readers.length, 2);
    assert.ok(readers[0].exitedAt !== null && readers[0].exitedAt <= readers[1].spawnedAt,
      'reader 2 started after reader 1 had exited');
  } finally {
    await closeInstance('packs-stall-recovery');
    await stopRecorded(tree);
    fixture.cleanup();
  }
});

test('T001 Install and Refresh prepare and submit rechecks recover at once after a stalled Git read', { timeout: 45_000 }, async t => {
  for (const operation of ['install', 'refresh']) await t.test(operation, async t => {
    const fixture = packEngineFixture();
    const args = { root: fixture.root, library: fixture.library, name: 'alpha', fetch: false };
    const manifestPath = path.join(fixture.root, '.dude/metadata/bundle-manifest.md');
    const aside = path.join(fixture.temporary, 'library-aside');
    let f;
    let tree = /** @type {ProcessRow[]} */ ([]);
    try {
      if (operation === 'refresh') {
        const added = await cmdAdd(args);
        assert.equal(added.ok, true, added.error);
      }
      const listener = await silentGitListener(t);
      const spy = spawnSpy(t);
      const kills = taskkillSpy(t);
      const manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : null;
      fs.renameSync(fixture.library, aside);
      stallCatalog(fixture, listener.url('git'));
      f = await packHttpFixture(fixture);
      const pending = call(f.instance.url, { path: '/api/packs' });
      await listener.connected();
      tree = await readerTree(spy.readers()[0]?.child.pid);
      const stalled = await (await pending).json();
      fs.renameSync(aside, fixture.library);
      if (manifest) fs.writeFileSync(manifestPath, manifest);
      else fs.rmSync(manifestPath);
      /** @param {Record<string, unknown>} body */
      const timedPost = async body => {
        const started = performance.now();
        const response = await f.post(body);
        const value = await response.json();
        return { status: response.status, value, elapsed: performance.now() - started };
      };
      const prepared = await timedPost({ op: 'prepare', operation, name: 'alpha' });
      assert.equal(prepared.status, 202, JSON.stringify(prepared.value));
      assert.equal(prepared.value.phase, 'prepared');
      assert.ok(prepared.elapsed < 5_000, `prepare waited on nothing: ${prepared.elapsed} ms`);
      const delivered = await timedPost({ op: 'submit', operation, name: 'alpha', packReceipt: prepared.value.packReceipt });
      assert.equal(delivered.status, 202, JSON.stringify(delivered.value));
      assert.equal(delivered.value.phase, 'delivered');
      assert.ok(delivered.elapsed < 5_000, `submit waited on nothing: ${delivered.elapsed} ms`);
      assert.equal(f.sends.length, 1);
      assert.ok(listener.connections >= 1);
      assert.equal(listener.open, 0);
      await assertTreeStops({ t, spy, kills, trees: [tree], scratch: fs.readdirSync(fixture.scratch) });
      assert.equal(stalled.coverage.catalog.reason, deadlineCoverage(kills).reason, 'the stalled read ended at its deadline');
    } finally { await f?.close(); await stopRecorded(tree); fixture.cleanup(); }
  });
});

test('T001 cancelling a stalled pack read stops its reader tree before the replacement read starts', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(fixture, listener.url('git'));
  const instance = await openInstance('packs-cancel-replace', () => {}, { complete: true }, { root: fixture.root });
  const controller = new AbortController();
  let disconnected;
  const firstClosed = new Promise(resolve => { disconnected = resolve; });
  instance.server.once('request', (_, res) => res.once('close', disconnected));
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const first = call(instance.url, { path: '/api/packs', signal: controller.signal }).catch(error => error);
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const abortedAt = performance.now();
    controller.abort();
    assert.ok((await first) instanceof Error, 'the abandoned fetch rejected');
    await firstClosed;
    fixture.catalog(['alpha']);
    const started = performance.now();
    const second = await (await call(instance.url, { path: '/api/packs' })).json();
    const elapsed = performance.now() - started;
    assert.deepEqual(second.coverage.catalog, { state: 'current', reason: null, message: null });
    assert.ok(elapsed < 5_000, `the replacement read waited on nothing else: ${elapsed} ms`);
    assert.ok(listener.connections >= 1);
    assert.equal(listener.open, 0, 'no Git process still holds the stalled connection');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: fs.readdirSync(fixture.scratch) });
    // Launch evidence last: the spy cannot see a fork-launched reader.
    const readers = spy.readers();
    assert.equal(readers.length, 2);
    const [abandoned, replacement] = readers;
    assert.ok(abandoned.exitedAt !== null && abandoned.exitedAt - abortedAt <= 2_500,
      `the abandoned reader exited within the stop window: ${abandoned.exitedAt === null ? 'never' : abandoned.exitedAt - abortedAt} ms`);
    assert.ok(abandoned.exitedAt <= replacement.spawnedAt, 'the replacement waited for the stop');
    for (const record of listener.records) {
      assert.ok(record.closedAt !== null && record.closedAt <= replacement.spawnedAt,
        'the stalled connection closed before the replacement started');
    }
  } finally {
    await closeInstance('packs-cancel-replace');
    await stopRecorded(tree);
    fixture.cleanup();
  }
});

test('T001 Canvas close during a stalled pack read stops its reader tree and a reopened Canvas reads at once', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(fixture, listener.url('git'));
  const instanceId = 'packs-close-reopen';
  const instance = await openInstance(instanceId, () => {}, { complete: true }, { root: fixture.root });
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const pending = call(instance.url, { path: '/api/packs' });
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const started = performance.now();
    assert.equal(await closeInstance(instanceId), true);
    const closeMs = performance.now() - started;
    const stopped = { open: listener.open, scratch: fs.readdirSync(fixture.scratch), listening: instance.server.listening };
    const launched = { readers: spy.readers().length, exited: spy.readers()[0]?.exitedAt !== null };
    assert.ok(closeMs < 3_000, `close stopped the reader tree within its window: ${closeMs} ms`);
    assert.deepEqual({ open: stopped.open, listening: stopped.listening }, { open: 0, listening: false });
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: stopped.scratch });
    const response = await pending;
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'packs_unavailable');
    fixture.catalog(['alpha']);
    const reopened = await openInstance(instanceId, () => {}, { complete: true }, { root: fixture.root });
    assert.equal(reopened.packRead, null);
    const reopenedAt = performance.now();
    const body = await (await call(reopened.url, { path: '/api/packs' })).json();
    const elapsed = performance.now() - reopenedAt;
    assert.deepEqual(body.coverage.catalog, { state: 'current', reason: null, message: null });
    assert.ok(elapsed < 5_000, `the reopened Canvas waited on nothing: ${elapsed} ms`);
    // Launch evidence last: the spy cannot see a fork-launched reader.
    assert.deepEqual(launched, { readers: 1, exited: true }, 'the reader had exited when close returned');
  } finally {
    await closeInstance(instanceId);
    await stopRecorded(tree);
    fixture.cleanup();
  }
});

/**
 * Stall one read to its deadline with `fail` standing in for taskkill: it
 * reports a failed tree kill and kills nothing itself. The reader's live tree
 * is recorded first. Teardown stops whatever of that tree still runs, only by
 * exact identity, and then removes the kept root.
 * @param {import('node:test').TestContext} t
 * @param {(reader: import('node:child_process').ChildProcess, fail: () => void) => void} fail
 */
async function readWithFailedTreeKill(t, fail) {
  // Register the listener's teardown first: hooks run in order, and a failing
  // hook skips the rest, which would leave the listener holding this process.
  const listener = await silentGitListener(t);
  const fixture = packFixture();
  const installed = { alpha: fixture.entry('alpha') };
  fixture.profile(installed);
  let tree = /** @type {ProcessRow[]} */ ([]);
  t.after(async () => {
    await stopRecorded(tree);
    fixture.cleanup();
  });
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t, (args, report) => {
    const reader = spy.readers().find(({ child }) => String(child.pid) === args[1]);
    fail(/** @type {NonNullable<typeof reader>} */ (reader).child, report);
  });
  stallCatalog(fixture, listener.url('git'));
  const started = performance.now();
  const reading = readPacks(fixture.root, AbortSignal.timeout(20_000));
  await listener.connected();
  tree = await readerTree(spy.readers()[0]?.child.pid);
  const snapshot = await reading;
  const settled = { elapsed: performance.now() - started, open: listener.open, scratch: fs.readdirSync(fixture.scratch) };
  return { installed, spy, kills, tree, snapshot, settled, alive: await liveMembers(tree) };
}

test('T001 a failed tree kill leaves the stop unconfirmed and keeps the root while a real descendant survives', {
  timeout: 30_000, skip: process.platform !== 'win32' && 'taskkill stops reader trees only on Windows',
}, async t => {
  const observed = await readWithFailedTreeKill(t, (_reader, fail) => setImmediate(fail));
  const [reader] = observed.spy.readers();
  assert.deepEqual(observed.snapshot.coverage.catalog, { state: 'unavailable', reason: 'catalog_cleanup_failed',
    message: 'The catalog reader could not confirm process cleanup.' });
  assert.equal(observed.snapshot.coverage.installed.state, 'current');
  assert.deepEqual(observed.snapshot.items, [{ name: 'alpha', installed: true, ...observed.installed.alpha, description: null, use_cases: null }]);
  assert.ok(observed.settled.elapsed >= 5_000 && observed.settled.elapsed < 7_500,
    `settled within the deadline plus the stop window: ${observed.settled.elapsed} ms`);
  assert.deepEqual(observed.kills.calls.map(call => call.args), [['/PID', String(reader.child.pid), '/T', '/F']]);
  assert.deepEqual(observed.settled.scratch, [path.basename(reader.options.env.TMP)], 'the unconfirmed stop kept its checkout root');
  assert.ok(observed.settled.open >= 1, 'a live Git still held the stalled connection at settlement');
  assert.ok(observed.alive.some(member => member.name.toLowerCase() === 'git.exe'),
    'a recorded Git descendant outlived the failed tree kill');
  assert.deepEqual(await stopRecorded(observed.tree), [], 'the test stopped the surviving tree by exact identity');
});

test('T001 a failed tree kill stays unconfirmed even when the reader exits inside the stop window', {
  timeout: 45_000, skip: process.platform !== 'win32' && 'taskkill stops reader trees only on Windows',
}, async t => {
  /** @type {[string, (reader: import('node:child_process').ChildProcess, fail: () => void) => void][]} */
  const orders = [
    ['taskkill error, then reader exit', (reader, fail) => setImmediate(() => {
      fail();
      setImmediate(() => reader.kill('SIGKILL'));
    })],
    ['reader exit, then taskkill error', (reader, fail) => {
      reader.once('exit', () => setImmediate(fail));
      reader.kill('SIGKILL');
    }],
  ];
  for (const [name, fail] of orders) await t.test(name, async t => {
    const observed = await readWithFailedTreeKill(t, fail);
    const [reader] = observed.spy.readers();
    const [kill] = observed.kills.calls;
    assert.deepEqual(observed.snapshot.coverage.catalog, { state: 'unavailable', reason: 'catalog_cleanup_failed',
      message: 'The catalog reader could not confirm process cleanup.' });
    assert.ok(reader.exitedAt !== null && reader.exitedAt - kill.calledAt < 2_000, 'the reader exited inside the stop window');
    assert.ok(observed.settled.elapsed < 7_500, `settled within the deadline plus the stop window: ${observed.settled.elapsed} ms`);
    assert.deepEqual(observed.settled.scratch, [path.basename(reader.options.env.TMP)], 'the reader\'s exit did not confirm the stop');
    assert.ok(observed.settled.open >= 1, 'a live Git still held the stalled connection at settlement');
    assert.ok(observed.alive.some(member => member.name.toLowerCase() === 'git.exe'), 'a recorded Git descendant outlived the reader');
    assert.deepEqual(await stopRecorded(observed.tree), [], 'the test stopped the surviving tree by exact identity');
  });
});

test('T001 a host executable that cannot run a Node script reads the catalog through its extension bootstrap', { timeout: 30_000 }, () => {
  const fixture = packFixture();
  fixture.profile({ alpha: fixture.entry('alpha') });
  fixture.catalog(['alpha', 'bravo']);
  try {
    const observed = simulatedCliHost(fixture, { executable: 'git', bootstrap: 'current' });
    assert.equal(observed.execPath, observed.host, 'the reader ran under a host executable that is not Node');
    assert.deepEqual(observed.coverage, {
      installed: { state: 'current', reason: null, message: null },
      catalog: { state: 'current', reason: null, message: null },
    });
    assert.deepEqual(observed.packs, ['alpha', 'bravo']);
    assert.deepEqual(observed.items.map(item => [item.name, item.installed, item.description]), [
      ['alpha', true, 'alpha full description <script>inert()</script>'],
      ['bravo', false, 'bravo full description <script>inert()</script>'],
    ]);
    assert.equal(observed.launches.length, 1, 'one reader launch through the host bootstrap');
    assert.deepEqual(fs.readdirSync(fixture.scratch), [], 'the acquisition root was removed');
  } finally { fixture.cleanup(); }
});

test('T001 the bootstrap relaunch gives its helper this module\'s reader and parent identity, not the inherited ones', { timeout: 30_000 }, () => {
  const fixture = packFixture();
  fixture.profile({ alpha: fixture.entry('alpha') });
  fixture.catalog(['alpha', 'bravo']);
  try {
    const observed = simulatedCliHost(fixture, { executable: 'git', bootstrap: 'current' });
    assert.equal(fs.existsSync(observed.marker), false, 'the helper never imported the inherited extension entry');
    assert.equal(observed.coverage.catalog.state, 'current');
    assert.equal(observed.launches.length, 1);
    const [launch] = observed.launches;
    assert.equal(launch.command, observed.host);
    assert.deepEqual(launch.args, [observed.cliBootstrap, READER, fixture.root]);
    assert.equal(launch.env.EXTENSION_PATH, READER);
    assert.equal(launch.env.COPILOT_EXTENSION_PARENT_PID, String(observed.hostPid));
    assertIsolatedLaunch(launch, fixture);
  } finally { fixture.cleanup(); }
});

test('T001 a Node host launches the reader directly and writes no CLI launch contract', { timeout: 30_000 }, async t => {
  await t.test('in-process Node host', async t => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    const spy = spawnSpy(t);
    try {
      const snapshot = await readPacks(fixture.root, AbortSignal.timeout(20_000));
      assert.deepEqual(snapshot.coverage.catalog, { state: 'current', reason: null, message: null });
      assert.equal(spy.calls.length, 1, 'exactly one launch');
      const [{ command, args, options }] = spy.calls;
      assert.equal(command, process.execPath);
      assert.deepEqual(args, [READER, fixture.root]);
      assert.equal(options.env.EXTENSION_PATH, process.env.EXTENSION_PATH);
      assert.equal(options.env.COPILOT_EXTENSION_PARENT_PID, process.env.COPILOT_EXTENSION_PARENT_PID);
      assertIsolatedLaunch(options, fixture);
      assert.deepEqual(fs.readdirSync(fixture.scratch), []);
    } finally { fixture.cleanup(); }
  });
  await t.test('stray absent bootstrap argument', () => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    try {
      const observed = simulatedCliHost(fixture, { executable: 'node', bootstrap: 'missing' });
      assert.deepEqual(observed.coverage.catalog, { state: 'current', reason: null, message: null });
      assert.equal(observed.launches.length, 1);
      const [launch] = observed.launches;
      assert.equal(launch.command, process.execPath);
      assert.deepEqual(launch.args, [READER, fixture.root]);
      assert.equal(launch.env.EXTENSION_PATH, observed.decoy, 'the inherited entry is left as it was');
      assert.equal(launch.env.COPILOT_EXTENSION_PARENT_PID, String(process.pid), 'the inherited parent is left as it was');
      assertIsolatedLaunch(launch, fixture);
      assert.deepEqual(fs.readdirSync(fixture.scratch), []);
    } finally { fixture.cleanup(); }
  });
});

test('T001 a changed or absent host launch contract is an ordinary bounded catalog_unavailable', { timeout: 30_000 }, async t => {
  for (const [name, bootstrap] of /** @type {const} */ ([['changed bootstrap', 'changed'], ['no bootstrap argument', undefined]])) {
    await t.test(name, () => {
      const fixture = packFixture();
      const installed = { alpha: fixture.entry('alpha') };
      fixture.profile(installed);
      fixture.catalog(['alpha', 'bravo']);
      try {
        const observed = simulatedCliHost(fixture, { executable: 'git', bootstrap });
        assert.deepEqual(observed.coverage.catalog, { state: 'unavailable', reason: 'catalog_unavailable',
          message: 'The catalog reader is unavailable. Reload to try a fresh read.' });
        assert.equal(observed.coverage.installed.state, 'current');
        assert.deepEqual(observed.items, [{ name: 'alpha', installed: true, ...installed.alpha, description: null, use_cases: null }]);
        assert.ok(observed.elapsedMs < 5_000, `reported at helper exit, not at the deadline: ${observed.elapsedMs} ms`);
        assert.equal(observed.launches.length, 1, 'no retry and no fallback launcher');
        assert.deepEqual(fs.readdirSync(fixture.scratch), []);
      } finally { fixture.cleanup(); }
    });
  }
});

test('T001 only readerLaunch in lib/packs.mjs names the Copilot CLI extension launch contract', () => {
  const tokens = ['extension_bootstrap.mjs', 'EXTENSION_PATH', 'COPILOT_EXTENSION_PARENT_PID'];
  /** @type {string[]} */
  const files = [];
  /** @param {string} directory */
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) files.push(absolute);
    }
  };
  visit(EXTENSION_SOURCE_ROOT);
  const packs = path.join(EXTENSION_SOURCE_ROOT, 'lib', 'packs.mjs');
  assert.ok(files.includes(packs) && files.includes(READER) && files.includes(path.join(EXTENSION_SOURCE_ROOT, 'lib', 'canvas-server.mjs')));
  const lines = fs.readFileSync(packs, 'utf8').split(/\r?\n/);
  const declaration = lines.findIndex(line => line.startsWith('function readerLaunch('));
  let open = declaration - 1;
  if (declaration > 0 && lines[open].trim() === '*/') while (open >= 0 && !lines[open].startsWith('/**')) open -= 1;
  else open = -1;
  const close = lines.findIndex((line, index) => index > declaration && line === '}');
  assert.ok(declaration > 0 && open >= 0 && close > declaration, 'the JSDoc-led readerLaunch region exists');
  const region = lines.slice(open, close + 1).join('\n');
  for (const token of tokens) assert.ok(region.includes(token), `readerLaunch names ${token}`);
  for (const file of files) {
    const text = file === packs ? [...lines.slice(0, open), ...lines.slice(close + 1)].join('\n') : fs.readFileSync(file, 'utf8');
    for (const token of tokens) {
      assert.equal(text.includes(token), false, `${path.relative(EXTENSION_SOURCE_ROOT, file)} names ${token} outside readerLaunch`);
    }
  }
});

test('T011 Review history GET accepts only exact owner query keys once', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-history-route-'));
  const calls = [];
  const provider = /** @type {any} */ ({
    matchesRoot: (candidate) => path.resolve(candidate) === path.resolve(root),
    subscribe: () => () => {},
    readReviewHistory(value, options) {
      assert.equal(options.signal.aborted, false);
      calls.push(value);
      return {
        scope: value.scope,
        ...(value.submissionId ? { submissionId: value.submissionId } : {}),
        status: value.submissionId ? 'historical' : 'listed',
      };
    },
  });
  const instance = await openInstance(
    'history-query-route',
    () => {},
    Object.freeze({ complete: true }),
    { root },
    provider,
  );
  const ideaPath = '.dude/ideas/001-owned.md';
  const specPath = '.dude/specs/001-owned/spec.md';
  const submissionId = randomUUID();
  try {
    const query = new URLSearchParams({ ideaPath, specPath, submissionId });

    // Act
    const selected = await call(instance.url, {
      path: `/api/needs-you/review/history?${query}`,
    });
    const listing = await call(instance.url, {
      path: `/api/needs-you/review/history?${new URLSearchParams({ ideaPath, specPath })}`,
    });
    const invalid = await Promise.all([
      call(instance.url, { path: `/api/needs-you/review/history?ideaPath=${encodeURIComponent(ideaPath)}` }),
      call(instance.url, { path: `/api/needs-you/review/history?ideaPath=${encodeURIComponent(ideaPath)}&specPath=${encodeURIComponent(specPath)}&extra=x` }),
      call(instance.url, { path: `/api/needs-you/review/history?ideaPath=${encodeURIComponent(ideaPath)}&ideaPath=${encodeURIComponent(ideaPath)}&specPath=${encodeURIComponent(specPath)}` }),
      call(instance.url, { path: `/api/needs-you/review/history?ideaPath=${encodeURIComponent(ideaPath)}&specPath=${encodeURIComponent(specPath)}&submissionId=${submissionId}&submissionId=${submissionId}` }),
      call(instance.url, {
        path: `/api/needs-you/review/history?${query}`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    ]);

    // Assert
    assert.equal(selected.status, 200);
    assert.equal(listing.status, 200);
    assert.deepEqual(await selected.json(), {
      scope: { kind: 'feature', ideaPath, specPath },
      submissionId,
      status: 'historical',
    });
    assert.deepEqual(await listing.json(), {
      scope: { kind: 'feature', ideaPath, specPath },
      status: 'listed',
    });
    assert.deepEqual(invalid.map(({ status }) => status), [400, 400, 400, 400, 404]);
    assert.deepEqual(calls, [
      { scope: { kind: 'feature', ideaPath, specPath }, submissionId },
      { scope: { kind: 'feature', ideaPath, specPath } },
    ], 'invalid or duplicate query keys never reach the selected-owner reader');
  } finally {
    await closeInstance('history-query-route');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('read-only API route matrix permits only projection GETs and refresh POST', async () => {
  // Arrange
  const { log } = recorder();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-read-only-routes-'));
  const projection = await readNowProjection({ root });
  const instance = await openInstance('default-routes', log, projection);
  const controlRoutes = [
    ...REMOVED_PROOF_ROUTES,
    '/api/proof',
    '/api/review',
    '/api/state',
    '/api/send',
    '/api/sendAndWait',
    '/api/abort',
    '/api/message',
    '/api/mutation',
    '/api/command',
    '/api/retry',
    '/api/answer',
    '/api/approval',
    '/api/stop',
  ];
  const forbiddenControls = [
    'sendAndWait',
    'abort',
    'message',
    'mutation',
    'command',
    'retry',
    'answer',
    'approval',
    'stop',
  ];
  const servedRoutes = [
    ...Object.keys(ASSET_ROUTES),
    '/events',
    '/api/viewport',
    '/api/projection',
    '/api/freshness',
    '/api/refresh',
  ];

  try {
    // Act
    const projectionResponse = await call(instance.url, { path: '/api/projection' });
    const freshnessResponse = await call(instance.url, { path: '/api/freshness' });
    const refreshResponse = await call(instance.url, {
      path: '/api/refresh',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'fixture' }),
    });
    const wrongMethodStatuses = await Promise.all([
      call(instance.url, { path: '/api/projection', method: 'POST' }).then((response) => response.status),
      call(instance.url, { path: '/api/freshness', method: 'POST' }).then((response) => response.status),
      call(instance.url, { path: '/api/refresh' }).then((response) => response.status),
      call(instance.url, { path: '/events', method: 'POST' }).then((response) => response.status),
      call(instance.url, { path: '/api/viewport' }).then((response) => response.status),
    ]);
    const statuses = await Promise.all(controlRoutes.flatMap((route) => [
      call(instance.url, { path: route }).then((response) => response.status),
      call(instance.url, {
        path: route,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identity: 'unreachable' }),
      }).then((response) => response.status),
    ]));
    const response = await call(instance.url);
    const body = await response.text();

    // Assert
    assert.equal(instance.projection, projection);
    assert.equal('proof' in instance, false);
    assert.deepEqual(statuses, new Array(controlRoutes.length * 2).fill(404));
    assert.deepEqual(wrongMethodStatuses, new Array(5).fill(404));
    assert.equal(projectionResponse.status, 200);
    assert.equal(freshnessResponse.status, 200);
    assert.equal(refreshResponse.status, 200);
    const projectionPayload = await projectionResponse.json();
    const freshnessPayload = await freshnessResponse.json();
    const refreshPayload = await refreshResponse.json();
    assert.deepEqual(projectionPayload.projection, projection);
    assert.equal(projectionPayload.freshness.state, 'current');
    assert.deepEqual(freshnessPayload, projectionPayload);
    assert.deepEqual(refreshPayload, { ...projectionPayload, replaced: false });
    assert.equal(body, fs.readFileSync(new URL('./ui/index.html', import.meta.url), 'utf8'));
    assert.match(body, /<title>Dude<\/title>/);
    assert.match(body, /<script type="module" src="\/assets\/app\.js"><\/script>/);
    assert.doesNotMatch(body, /<(?:button|form|input|select|textarea)\b/i);
    assert.doesNotMatch(body, /__dude_i0|proof\/abort/i);
    for (const control of forbiddenControls) {
      assert.doesNotMatch(body, new RegExp(control, 'i'), `${control} must not appear in the UI`);
      assert.ok(
        servedRoutes.every((route) => !route.toLowerCase().includes(control.toLowerCase())),
        `${control} must not appear in a served route`,
      );
    }
    assert.deepEqual(Object.keys(ASSET_ROUTES), [
      '/',
      '/assets/app.js',
      '/assets/app.js.LEGAL.txt',
    ]);
  } finally {
    await closeInstance('default-routes');
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refresh bodies are bounded and reject non-allowlisted input with a safe JSON error', async () => {
  // Arrange
  const { log } = recorder();
  const projection = Object.freeze({ complete: true, status: 'ok' });
  const instance = await openInstance('refresh-body', log, projection);
  const invalidBodies = [
    'not json',
    JSON.stringify({ target: 7 }),
    JSON.stringify({ target: 'fixture', additional: true }),
    JSON.stringify({ target: 'x'.repeat(4 * 1024) }),
  ];
  try {
    // Act
    const responses = await Promise.all(invalidBodies.map((body) => call(instance.url, {
      path: '/api/refresh',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })));

    // Assert
    for (const response of responses) {
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
      assert.deepEqual(await response.json(), { error: 'Request failed.' });
    }
    assert.equal((await call(instance.url, { path: '/api/projection' })).status, 200);
  } finally {
    await closeInstance('refresh-body');
  }
});

test('refresh route swaps only a complete exact-target successor', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-refresh-'));
  const draft = (number, slug) => [
    '---',
    `title: ${slug}`,
    `slug: ${slug}`,
    'status: draft',
    'spec_path:',
    '---',
    '',
    '## Idea',
    '',
    `${slug} body.`,
    '',
  ].join('\n');
  fs.mkdirSync(path.join(root, '.dude', 'ideas'), { recursive: true });
  fs.writeFileSync(path.join(root, '.dude/ideas/001-alpha.md'), draft('001', 'alpha'));
  fs.writeFileSync(path.join(root, '.dude/ideas/002-beta.md'), draft('002', 'beta'));
  const { log } = recorder();
  const bd = installBdFixture();
  try {
    await bd.run(async () => {
      const previous = await readNowProjection({ root, target: 'alpha' });
      const instance = await openInstance('refresh-live', log, previous, { root, target: 'alpha' });
      try {
        // Act
        const refreshed = await call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'beta' }),
        });
        const invalidTarget = await call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'not-present' }),
        });

        // Assert
        assert.equal(refreshed.status, 200);
        const refreshedPayload = await refreshed.json();
        assert.equal(refreshedPayload.replaced, true);
        assert.equal(refreshedPayload.projection.selected.slug, 'beta');
        assert.equal(instance.projection.selected.slug, 'beta');
        assert.equal(instance.readInput?.target, 'beta');

        assert.equal(invalidTarget.status, 200);
        const invalidPayload = await invalidTarget.json();
        assert.equal(invalidPayload.replaced, false);
        assert.equal(invalidPayload.projection.selected.slug, 'beta');
        assert.equal(instance.readInput?.target, 'beta', 'a refused successor preserves the committed target');
        assert.equal(invalidPayload.freshness.state, 'stale');
        assert.deepEqual(invalidPayload.freshness.nextAction, {
          kind: 'refresh',
          label: 'Refresh from repository',
          method: 'POST',
          path: '/api/refresh',
        });
      } finally {
        await closeInstance('refresh-live');
      }

      const chooserPrevious = await readNowProjection({ root });
      const chooserInstance = await openInstance('refresh-chooser', log, chooserPrevious, { root });
      try {
        const refused = await call(chooserInstance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'not-present' }),
        });

        // Assert
        assert.equal(refused.status, 200);
        const refusedPayload = await refused.json();
        assert.equal(refusedPayload.replaced, false);
        assert.equal(refusedPayload.projection.selected, null);
        assert.deepEqual(
          refusedPayload.projection.choices.map((choice) => choice.slug),
          ['alpha', 'beta'],
          'a refused chooser selection preserves its original inventory',
        );
        assert.equal(chooserInstance.projection, chooserPrevious);
        assert.deepEqual(chooserInstance.readInput, { root }, 'a refused chooser selection must remain targetless');
      } finally {
        await closeInstance('refresh-chooser');
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('isolated shipped server reaches chooser, refresh, viewport, and events without project writes', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-shipped-smoke-'));
  writeDraft(root, '001', 'alpha');
  writeDraft(root, '002', 'beta');
  const before = snapshotFiles(path.join(root, '.dude'));
  const { lines, log } = recorder();
  const bd = installBdFixture();
  try {
    await bd.run(async () => {
      const instance = await openInstance('shipped-smoke', log, null, { root });
      const streamAbort = new AbortController();
      try {
        // Act
        const [page, application, legal, initial, freshness, viewport, stream] = await Promise.all([
          call(instance.url),
          call(instance.url, { path: '/assets/app.js' }),
          call(instance.url, { path: '/assets/app.js.LEGAL.txt' }),
          call(instance.url, { path: '/api/projection' }),
          call(instance.url, { path: '/api/freshness' }),
          call(instance.url, {
            path: '/api/viewport',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ width: 1080, height: 720 }),
          }),
          call(instance.url, { path: '/events', signal: streamAbort.signal }),
        ]);
        const refreshed = await call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'alpha' }),
        });
        const reader = /** @type {ReadableStream<Uint8Array>} */ (stream.body).getReader();
        await reader.read();

        // Assert
        assert.equal(page.status, 200);
        assert.equal(application.status, 200);
        assert.equal(legal.status, 200);
        assert.equal(stream.status, 200);
        assert.ok((await application.text()).length > 100_000, 'the bundled application is served');
        assert.match(await legal.text(), /Bundled license information/);
        assert.equal((await initial.json()).projection.status, 'choose');
        assert.equal((await freshness.json()).freshness.state, 'current');
        assert.deepEqual(await viewport.json(), { recorded: true, width: 1080, height: 720 });
        const refreshPayload = await refreshed.json();
        assert.equal(refreshPayload.replaced, true);
        assert.equal(refreshPayload.projection.selected.slug, 'alpha');
        assert.ok(lines.includes('Dude canvas shipped-smoke: renderer attached.'));

        const closed = await closeInstance('shipped-smoke');
        assert.equal(closed, true);
        assert.equal(instance.server.listening, false);
        assert.equal((await reader.read()).done, true);
        assert.deepEqual(snapshotFiles(path.join(root, '.dude')), before, 'server must not write project state');
      } finally {
        streamAbort.abort();
        await closeInstance('shipped-smoke');
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('initial open serves a typed unavailable projection when acquisition cannot read authority', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-initial-'));
  writeDraft(root, '001', 'initial-unavailable');
  const { log } = recorder();
  const bd = installBdFixture([{ exitCode: 1 }]);
  try {
    await bd.run(async () => {
      // Act
      const instance = await openInstance(
        'initial-unavailable',
        log,
        null,
        { root, target: 'initial-unavailable' },
      );

      // Assert
      try {
        assert.equal(instance.projection.complete, false);
        assert.deepEqual(instance.projection.diagnostics.map((diagnostic) => diagnostic.code), [
          'TRACKED_AUTHORITY_UNAVAILABLE',
        ]);
        assert.equal(instance.freshness.state, 'unavailable');
        const payload = await (await call(instance.url, { path: '/api/projection' })).json();
        assert.deepEqual(payload.projection, instance.projection);
        assert.deepEqual(payload.freshness, instance.freshness);
        assert.deepEqual(bd.calls.map((call) => call.args), [BD_LIST_CALL]);
      } finally {
        await closeInstance('initial-unavailable');
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a real held bd child times out, is reaped, and returns a typed private projection failure', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-timeout-'));
  writeDraft(root, '001', 'child-timeout');
  const bd = installBdFixture([{ hold: true }]);
  try {
    await bd.run(async () => {
      // Act
      const result = await readNowProjection(
        { root, target: 'child-timeout' },
        { timeoutMs: 750 },
      );

      // Assert
      assert.equal(result.complete, false);
      assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
        'TRACKED_AUTHORITY_UNAVAILABLE',
      ]);
      assert.equal(bd.calls.length, 1, 'the held child must have started before its bounded timeout');
      assert.throws(() => process.kill(bd.calls[0].pid, 0), { code: 'ESRCH' });
      assert.doesNotMatch(JSON.stringify(result), /dude-canvas-bd-|Error:/i);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stalled initial acquisition yields to the event loop, reaps on close, and cannot delete a replacement', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-startup-'));
  writeDraft(root, '001', 'startup');
  const { log } = recorder();
  const bd = installBdFixture([{ hold: true }, {}, {}]);
  try {
    await bd.run(async () => {
      const firstCall = waitForBdCalls(bd, 1);
      const opening = openInstance('startup-race', log, null, { root, target: 'startup' });

      // Act
      let yielded = false;
      await new Promise((resolve) => setImmediate(() => {
        yielded = true;
        resolve(undefined);
      }));
      await firstCall;
      const oldPid = bd.calls[0].pid;
      const closing = closeInstance('startup-race');
      const replacementPromise = openInstance('startup-race', log, null, { root, target: 'startup' });
      const closed = await Promise.race([
        closing,
        new Promise((resolve) => setTimeout(() => resolve('stalled'), 2_000).unref()),
      ]);
      const replacement = await replacementPromise;

      // Assert
      assert.equal(yielded, true, 'a blocked child must not block an unrelated event-loop turn');
      assert.equal(closed, true, 'close must await cancellation and child reaping');
      await assert.rejects(opening, /cancelled/i);
      assert.throws(() => process.kill(oldPid, 0), { code: 'ESRCH' }, 'closed child must be reaped');
      assert.equal(replacement.server.listening, true);
      assert.equal(await openInstance('startup-race', log), replacement, 'old rejection must not delete replacement');
      assert.equal(await closeInstance('startup-race'), true);
      assert.equal(await closeInstance('startup-race'), false, 'no stale instance or listener remains');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('projection GET stays immediate and stale freshness cannot overwrite a concurrent refresh', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-freshness-'));
  writeDraft(root, '001', 'alpha');
  writeDraft(root, '002', 'beta');
  const { log } = recorder();
  const bd = installBdFixture([{}, {}, { hold: true }, {}, {}]);
  try {
    await bd.run(async () => {
      const initial = await readNowProjection({ root, target: 'alpha' });
      const instance = await openInstance('freshness-race', log, initial, { root, target: 'alpha' });
      try {
        const freshnessStarted = waitForBdCalls(bd, 3);
        const freshness = call(instance.url, { path: '/api/freshness' });
        await freshnessStarted;
        const heldPid = bd.calls[2].pid;

        // Act
        const immediate = await call(instance.url, { path: '/api/projection' });
        const immediatePayload = await immediate.json();
        const refreshed = await call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'beta' }),
        });
        bd.release(heldPid);
        const freshnessPayload = await (await freshness).json();
        const refreshPayload = await refreshed.json();

        // Assert
        assert.equal(immediate.status, 200);
        assert.deepEqual(immediatePayload.projection, initial, 'GET must not await the pending freshness acquisition');
        assert.equal(refreshPayload.replaced, true);
        assert.equal(refreshPayload.projection.selected.slug, 'beta');
        assert.equal(freshnessPayload.replaced, false);
        assert.deepEqual(freshnessPayload.projection, instance.projection);
        assert.equal(freshnessPayload.projection.selected.slug, 'beta');
        assert.deepEqual(freshnessPayload.freshness, instance.freshness);
      } finally {
        await closeInstance('freshness-race');
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('late refresh and close during a held refresh preserve the current instance and close boundedly', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-server-refresh-race-'));
  writeDraft(root, '001', 'alpha');
  writeDraft(root, '002', 'beta');
  const { log } = recorder();
  const bd = installBdFixture([{}, {}, { hold: true }, {}, {}, {}, { hold: true }]);
  try {
    await bd.run(async () => {
      const initial = await readNowProjection({ root, target: 'alpha' });
      const instance = await openInstance('refresh-race', log, initial, { root, target: 'alpha' });
      let closing = null;
      try {
        const oldStarted = waitForBdCalls(bd, 3);
        const olderRefresh = call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        await oldStarted;
        const oldPid = bd.calls[2].pid;
        const immediate = await call(instance.url, { path: '/api/projection' });
        assert.equal(immediate.status, 200, 'GET remains available while the older refresh is held');
        const newerRefresh = await call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: 'beta' }),
        });
        const newerPayload = await newerRefresh.json();
        bd.release(oldPid);
        const olderPayload = await (await olderRefresh).json();

        // Assert
        assert.equal(newerPayload.replaced, true);
        assert.equal(newerPayload.projection.selected.slug, 'beta');
        assert.equal(olderPayload.replaced, false);
        assert.deepEqual(olderPayload.projection, instance.projection);
        assert.deepEqual(olderPayload.freshness, instance.freshness);
        assert.equal(instance.readInput?.target, 'beta');

        const closeStarted = waitForBdCalls(bd, 7);
        const heldRefresh = call(instance.url, {
          path: '/api/refresh',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        await closeStarted;
        const heldPid = bd.calls[6].pid;
        closing = closeInstance('refresh-race');
        const closed = await Promise.race([
          closing,
          new Promise((resolve) => setTimeout(() => resolve('stalled'), 5_000).unref()),
        ]);
        await Promise.allSettled([heldRefresh]);

        if (closed !== true) await closing;
        assert.throws(() => process.kill(heldPid, 0), { code: 'ESRCH' }, 'refresh child must be reaped');
        assert.equal(instance.server.listening, false);
        assert.equal(closed, true, 'close must settle within the bounded five-second acquisition window');
        assert.equal(await closeInstance('refresh-race'), false);
      } finally {
        if (closing) await closing;
        else await closeInstance('refresh-race');
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a traversal request cannot escape the ui directory', async () => {
  const { log } = recorder();
  const instance = await openInstance('traversal', log);
  try {
    // `fetch` normalizes `..`, so drive the raw request line directly.
    assert.equal(await rawStatus(instance.server, { path: '/../extension.mjs' }), 404);
  } finally {
    await closeInstance('traversal');
  }
});

test('cross-site and non-loopback requests are refused', async () => {
  const { log } = recorder();
  const instance = await openInstance('trust', log);
  try {
    const crossSite = await call(instance.url, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(crossSite.status, 403);

    // A DNS-rebound request reaches the loopback socket with a foreign `Host`.
    assert.equal(await rawStatus(instance.server, { headers: { host: 'evil.example.com' } }), 403);

    const sameOrigin = await call(instance.url, { headers: { 'sec-fetch-site': 'same-origin' } });
    assert.equal(sameOrigin.status, 200);
  } finally {
    await closeInstance('trust');
  }
});

test('isTrustedRequest accepts loopback hosts only', () => {
  const trust = (headers) => isTrustedRequest(/** @type {any} */ ({ headers }));
  assert.equal(trust({ host: '127.0.0.1:5000' }), true);
  assert.equal(trust({ host: 'localhost:5000' }), true);
  assert.equal(trust({ host: '[::1]:5000' }), true);
  assert.equal(trust({ host: '0.0.0.0:5000' }), false);
  assert.equal(trust({ host: '127.0.0.1.evil.example:5000' }), false);
  assert.equal(trust({}), false);
  assert.equal(trust({ host: '127.0.0.1:5000', 'sec-fetch-site': 'same-site' }), false);
});

// Fetch metadata is optional, so `Origin` has to stand on its own.
test('isTrustedRequest judges Origin without relying on fetch metadata', () => {
  const trust = (headers) => isTrustedRequest(/** @type {any} */ ({ headers }));
  assert.equal(
    trust({ host: '127.0.0.1:5000', origin: 'https://evil.example' }),
    false,
    'a foreign Origin must be refused with no Sec-Fetch-Site to lean on',
  );
  assert.equal(
    trust({ host: '127.0.0.1:5000', origin: 'http://127.0.0.1:5001' }),
    false,
    'another loopback port is another origin',
  );
  assert.equal(trust({ host: '127.0.0.1:5000', origin: 'null' }), false, 'an opaque Origin is not our own');
  assert.equal(
    trust({ host: '127.0.0.1:5000', origin: 'http://127.0.0.1:5000' }),
    true,
    "the renderer's own origin must still be accepted",
  );
  assert.equal(
    trust({ host: 'localhost:5000', origin: 'http://localhost:5000' }),
    true,
    'the own-origin check follows the host name the renderer actually used',
  );
  assert.equal(
    trust({ host: '127.0.0.1:5000', 'sec-fetch-site': 'same-origin' }),
    true,
    'an absent Origin stays acceptable when the other guards pass',
  );
});

test('a request declaring a foreign Origin is refused before it reaches a route', async () => {
  // Arrange
  const { lines, log } = recorder();
  let projectionReadAttempts = 0;
  const readInput = Object.freeze({
    get root() {
      projectionReadAttempts += 1;
      throw new Error('untrusted requests must not read projection input');
    },
    get target() {
      projectionReadAttempts += 1;
      throw new Error('untrusted requests must not read projection input');
    },
  });
  const instance = await openInstance(
    'origin',
    log,
    Object.freeze({ complete: true, status: 'ok' }),
    /** @type {any} */ (readInput),
  );
  const foreign = { origin: 'https://evil.example' };
  try {
    // Act
    assert.equal(
      await rawStatus(instance.server, { headers: foreign }),
      403,
      'a foreign Origin must be refused even when Sec-Fetch-Site is absent',
    );
    assert.equal(
      await rawStatus(instance.server, {
        path: '/api/viewport',
        method: 'POST',
        headers: { ...foreign, 'content-type': 'application/json' },
        body: JSON.stringify({ width: 1280, height: 900 }),
      }),
      403,
      'a foreign Origin must be refused on the viewport report',
    );
    assert.equal(
      await rawStatus(instance.server, { path: '/api/freshness', headers: foreign }),
      403,
      'a foreign Origin must be refused before a freshness read',
    );
    assert.equal(
      await rawStatus(instance.server, {
        path: '/api/refresh',
        method: 'POST',
        headers: { ...foreign, 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'fixture' }),
      }),
      403,
      'a foreign Origin must be refused before a refresh read',
    );
    assert.equal(
      await rawStatus(instance.server, {
        path: '/api/refresh',
        method: 'POST',
        headers: { host: 'evil.example.com', 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'fixture' }),
      }),
      403,
      'a foreign Host must be refused before a refresh read',
    );

    // Assert
    assert.equal(projectionReadAttempts, 0, 'route trust must precede projection reads');
    assert.deepEqual(lines, [], 'a refused request must not reach a handler side effect');

    const own = new URL(instance.url).host;
    assert.equal(
      await rawStatus(instance.server, { headers: { origin: `http://${own}` } }),
      200,
      "the renderer's own loopback origin must still be served",
    );
    assert.equal(
      await rawStatus(instance.server),
      200,
      'a same-origin GET that omits Origin must still be served',
    );
  } finally {
    await closeInstance('origin');
  }
});

test('the viewport report reaches the session log instead of stdout', async () => {
  const { lines, log } = recorder();
  const instance = await openInstance('viewport', log);
  try {
    const response = await call(instance.url, {
      path: '/api/viewport',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ width: 1280.4, height: 900 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { recorded: true, width: 1280, height: 900 });
    assert.ok(lines.some((line) => line === 'Dude canvas viewport: host viewport 1280x900.'));
  } finally {
    await closeInstance('viewport');
  }
});

test('a malformed viewport body fails the request without killing the server', async () => {
  const { log } = recorder();
  const instance = await openInstance('bad-body', log);
  try {
    const response = await call(instance.url, {
      path: '/api/viewport',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    assert.equal(response.status, 400);
    assert.equal((await call(instance.url)).status, 200);
  } finally {
    await closeInstance('bad-body');
  }
});

test('extension lifecycle contains rejected session logs without touching stdout', { timeout: 10_000 }, async () => {
  // Arrange
  const harness = copiedExtensionHarness();
  try {
    // Act
    const { result, stdout, stderr } = await harness.run();

    // Assert
    assert.equal(result.error, undefined, result.error);
    assert.deepEqual(stdout, '', 'the extension must not write JSON-RPC stdout');
    assert.deepEqual(stderr, '', 'the harness must not emit an unhandled log rejection');
    assert.equal(result.first.title, 'Dude');
    assert.equal(result.first.status, 'Work and Needs you');
    assert.match(result.first.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.deepEqual(result.second, result.first, 'reopening must reuse the one live instance');
    assert.equal(result.pageStatus, 200, 'the reused server must remain usable after open logging rejects');
    assert.equal(result.projection.projection.complete, false, 'initial acquisition remains a typed projection result');
    assert.deepEqual(result.projection.projection.diagnostics.map((diagnostic) => diagnostic.code), [
      'TRACKED_AUTHORITY_UNAVAILABLE',
    ]);
    assert.equal(result.portRefused, true, 'close must remove the server despite close logging rejection');
    assert.equal(result.sessionLogCalls, 3, 'both opens and the successful close attempt session logging');
    assert.equal(result.stdoutWrites, 0, 'neither lifecycle nor logging containment may use stdout');
    assert.deepEqual(result.sessionRegistration, {
      toolNames: ['dude_needs_you'],
      operationNames: ['request', 'acknowledge'],
      acknowledgmentKinds: ['canvas_response', 'outside_answer', 'capture', 'pack_result'],
      hasOnEvent: true,
      canvasCount: 1,
    }, 'the existing Canvas and one closed two-operation handoff share the joined session');
  } finally {
    fs.rmSync(harness.root, { recursive: true, force: true });
  }
});

// A regression that leaves an event client open would stall `server.close()`
// forever, so bound the close and hang up the client afterwards either way.
test('close ends event clients and forgets the instance without stalling', async () => {
  // Arrange
  const { lines, log } = recorder();
  const instance = await openInstance('close', log);

  const hangUp = new AbortController();
  const stream = await call(instance.url, { path: '/events', signal: hangUp.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') ?? '', /^text\/event-stream/);
  const reader = /** @type {ReadableStream<Uint8Array>} */ (stream.body).getReader();
  await reader.read();
  assert.equal(instance.eventClients.size, 1);
  assert.ok(lines.some((line) => line === 'Dude canvas close: renderer attached.'));

  try {
    // Act
    const closed = await Promise.race([
      closeInstance('close'),
      new Promise((resolve) => setTimeout(() => resolve('stalled'), 5_000).unref()),
    ]);

    // Assert
    assert.equal(closed, true, 'close must not wait on a still-open event client');
    assert.equal(instance.eventClients.size, 0);
    assert.equal((await reader.read()).done, true);
    assert.equal(instance.server.listening, false);
    await assert.rejects(call(instance.url));

    // The instance is gone, so a second close is a no-op.
    assert.equal(await closeInstance('close'), false);
  } finally {
    hangUp.abort();
  }
});

test('closing an unknown instance is a no-op', async () => {
  assert.equal(await closeInstance('never-opened'), false);
});
