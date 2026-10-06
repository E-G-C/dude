// @ts-check
/**
 * Tests for the Dude canvas workspace server — loopback binding, the closed
 * route allowlist, cross-origin refusal, idempotent open by `instanceId`, and
 * cleanup on close. The SDK canvas plumbing itself is not retested here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { fork, spawnSync } from 'node:child_process';
import nodeCrypto, { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
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
import { readInstallationRecord } from './lib/about.mjs';
import { createNeedsYou, NEEDS_YOU_LIMITS } from './lib/needs-you.mjs';
import { readPacks, unresolvedSourceKey } from './lib/packs.mjs';
import { readProjectArtifacts } from './lib/project-artifacts.mjs';
import { cmdAdd, cmdPreviewRefresh, cmdRefresh, cmdRemove, cmdStatus } from '../../skills/dude-compose/compose.mjs';
import { renderDevelopmentBaseRelease } from '../../skills/dude-engine/lib/development-base-release.mjs';
import { PACK_SOURCES_PATH, describePackSources, readPackSources, serializePackSourcesDocument } from '../../skills/dude-engine/lib/pack-sources.mjs';
import { serializeProfileDocument } from '../../skills/dude-engine/lib/profile.mjs';
import { CANDIDATE_DOCUMENT, CATALOG_GIT_HOME_ENV, CATALOG_REQUEST_ENV, CATALOG_STOP_MARKER } from './lib/catalog-reader.mjs';
import { addPackSource } from './lib/packs.mjs';

const REMOVED_PROOF_ROUTES = Object.freeze([
  '/__dude_i0/proof',
  '/__dude_i0/proof/abort',
]);
const BD_LIST_CALL = ['list', '--all', '--limit', '0', '--json'];
const EXTENSION_SOURCE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SOURCE_ROOT = path.resolve(EXTENSION_SOURCE_ROOT, '../../skills/dude-engine');
const READER = fileURLToPath(new URL('./lib/catalog-reader.mjs', import.meta.url));
const PACKS_MODULE = new URL('./lib/packs.mjs', import.meta.url).href;
/** Every environment variable that names a home to the CLI's loader, to Git for Windows or to libcurl. */
const HOME_VARIABLES = Object.freeze(['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH']);

/** The explicit discovery read of the pack projection. The plain URL reads installed packs, sources and project rows and acquires no catalog. */
const DISCOVER = '/api/packs?discover=1';
/**
 * An installed row as the explicit discovery projects it: the Phase A fields plus
 * its key and, when no source matches its record, Unlisted provenance.
 * @param {string} name @param {{ files: string[], source: any }} entry @param {Record<string, unknown>} [extra]
 */
const installedRow = (name, entry, extra = {}) => ({
  key: `pack:${name}`, name, installed: true, ...entry, description: null, use_cases: null,
  sourceKey: null, provenance: 'unlisted', ...extra,
});

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
  // A saved source is named by its key, in both bodies, only for an install.
  const admission = async (operation, source) => {
    const choice = source ? { source } : {};
    const prepared = await post({ op: 'prepare', operation, name: 'alpha', ...choice });
    assert.equal(prepared.status, 202);
    const receipt = await prepared.json();
    const delivered = await post({ op: 'submit', operation, name: 'alpha', ...choice, packReceipt: receipt.packReceipt });
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
      // A source-bound receipt is acknowledged with its exact binding echoed back whole; a default one has none.
      ...(receipt.receipt.catalogSource ? { catalogSource: receipt.receipt.catalogSource } : {}),
      profileRevision: status.ok ? packRevision(fs.readFileSync(fixture.profilePath)) : null,
      source: status.ok && Object.hasOwn(status.result.installed, name) ? status.result.installed[name].source : null,
    };
  };
  // `targets` replaces the default two targets, as a source-bound request's source-first targets do.
  const permission = async (receipt, impact, { targets } = {}) => {
    const operation = receipt.operation;
    const request = {
      owner: 'dude', requestRef: `pack:${receipt.packReceipt}`, scope: { kind: 'session' },
      source: { kind: 'session', revision: receipt.receipt.providerGeneration }, revision: packRevision(JSON.stringify(impact)),
      class: 'permission', blocking: true, prompt: `Preview ${operation} alpha: ${JSON.stringify(impact)}`,
      whyHuman: 'This exact operation requires literal user consent.', unblocks: 'The Compose owner can recheck and apply.',
      fields: { operation: `pack:${operation}`, targets: targets ?? [
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

// Feature 073 T001: `/api/imports/request` mirrors the pack route's guards over the
// same joined provider. It forwards one closed prepare/submit body and never
// reads a source, starts a process or connection, imports, or writes a file.
const IMPORT_ROUTE = '/api/imports/request';
const IMPORT_SOURCE = 'C:\\Users\\Example\\skills\\dude-local-demo\\SKILL.md';
const IMPORT_GITHUB_SOURCE = 'https://github.com/example/skills/blob/main/skills/demo/SKILL.md';

/**
 * Like `rawStatus`, but also returns the JSON body, so the explicit error code is pinned too.
 * @param {import('node:http').Server} server
 * @param {{ path?: string, method?: string, headers?: Record<string, string>, body?: string | Buffer }} [options]
 * @returns {Promise<{ status: number | undefined, body: unknown }>}
 */
function rawJson(server, { path = '/', method = 'GET', headers = {}, body } = {}) {
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null });
      });
    });
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

test('T001 import prepare/submit is root-bound, sends one fixed handoff, and reads, runs, connects and writes nothing', async t => {
  for (const kind of ['local file', 'public GitHub file']) await t.test(kind, async t => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    const f = await packHttpFixture(fixture);
    const local = path.join(fixture.root, 'incoming', 'dude-local-demo', 'SKILL.md');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, 'Source bytes the import route must never read.\n');
    const source = kind === 'local file' ? local : IMPORT_GITHUB_SOURCE;
    const before = snapshotFiles(fixture.root);
    const post = body => f.post(body, IMPORT_ROUTE);
    const spawns = t.mock.method(childProcess.ChildProcess.prototype, 'spawn');
    const syncLaunches = ['spawnSync', 'execSync', 'execFileSync'].map(name => t.mock.method(childProcess, name));
    syncBuiltinESMExports();
    const connects = t.mock.method(net.Socket.prototype, 'connect');
    const inspected = ['lstatSync', 'statSync', 'readFileSync', 'readdirSync', 'openSync', 'opendirSync', 'realpathSync']
      .map(name => t.mock.method(fs, name));
    const mutating = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync', 'copyFileSync', 'cpSync',
      'symlinkSync', 'linkSync', 'unlinkSync'].map(name => t.mock.method(fs, name));
    try {
      const prepared = await post({ op: 'prepare', importSource: source });
      assert.equal(prepared.status, 202);
      const preparation = await prepared.json();
      assert.equal(preparation.phase, 'prepared');
      assert.equal(preparation.applied, false);
      assert.equal(preparation.importSource, source);
      assert.equal(f.sends.length, 0);
      const submit = { op: 'submit', importSource: source, importReceipt: preparation.importReceipt };
      const delivered = await post(submit);
      assert.equal(delivered.status, 202);
      assert.equal((await delivered.json()).phase, 'delivered');
      const replay = await post(submit);
      assert.equal(replay.status, 409);
      assert.deepEqual(await replay.json(), { error: 'already_consumed' });
      assert.equal(f.sends.length, 1);
      assert.equal(f.sends[0].mode, 'immediate');
      const handoff = JSON.parse(f.sends[0].prompt.split('\n').at(-1));
      assert.deepEqual(Object.keys(handoff),
        ['receiptId', 'owner', 'importSource', 'workspaceId', 'sessionId', 'providerGeneration']);
      assert.equal(handoff.importSource, source);
      assert.equal(handoff.receiptId, preparation.importReceipt);
      assert.match(f.sends[0].prompt, /^Dude Canvas explicit artifact import request in this joined workspace\/session\.\n/);
      const feed = await f.feed();
      assert.equal(feed.importRequests.length, 1);
      assert.equal(feed.importRequests[0].phase, 'delivered');
      assert.equal(feed.importRequests[0].applied, false);
      assert.equal(feed.packRequests.length, 0);

      const marked = ['dude-local-demo', 'incoming', 'profile.md', 'library', 'bundle-manifest'];
      const reads = inspected.flatMap(spy => spy.mock.calls.filter(call => call.arguments
        .some(argument => marked.some(marker => String(argument).includes(marker)))));
      assert.deepEqual(reads, [], 'no source, profile, catalog or workspace document is inspected');
      assert.deepEqual(mutating.map(spy => spy.mock.callCount()), mutating.map(() => 0));
      assert.equal(spawns.mock.callCount() + syncLaunches.reduce((sum, spy) => sum + spy.mock.callCount(), 0), 0,
        'no command or process starts');
      const targets = connects.mock.calls.map(({ arguments: args }) => {
        const options = Array.isArray(args[0]) ? args[0][0] : args[0];
        return options && typeof options === 'object' ? `${options.host}:${options.port}` : `${args[1]}:${options}`;
      });
      assert.ok(targets.length > 0, "the socket spy observed this test's own requests");
      assert.deepEqual([...new Set(targets)], [new URL(f.instance.url).host], 'only the Canvas loopback server is contacted');
      t.mock.restoreAll();
      syncBuiltinESMExports();
      assert.deepEqual(snapshotFiles(fixture.root), before);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      await f.close();
      fixture.cleanup();
    }
  });
});

test('T001 import request HTTP gates reject alternate routes, origins, payloads, roots and read-only providers', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const readOnlyId = `import-read-only-${randomUUID()}`;
  const readOnly = await openInstance(readOnlyId, () => {}, { complete: true }, { root: fixture.root });
  const host = new URL(f.instance.url).host, origin = new URL(f.instance.url).origin;
  const body = { op: 'prepare', importSource: IMPORT_SOURCE };
  const valid = { path: IMPORT_ROUTE, method: 'POST',
    headers: { host, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const expectStatus = async (request, expected, label) => {
    let status;
    try { status = await rawStatus(f.instance.server, request); }
    catch (error) { throw new Error(`Import HTTP case failed: ${label}`, { cause: error }); }
    assert.equal(status, expected, label);
  };
  const before = snapshotFiles(fixture.root);
  try {
    assert.equal(await rawStatus(readOnly.server, { ...valid,
      headers: { host: new URL(readOnly.url).host, origin: new URL(readOnly.url).origin, 'content-type': 'application/json' } }), 404,
    'a read-only Canvas exposes no import route');
    for (const suffix of ['/', '?root=elsewhere', '/apply', '#submit', '?', '/.', '%2F']) {
      await expectStatus({ ...valid, path: `${IMPORT_ROUTE}${suffix}` }, 404, `route suffix ${suffix}`);
    }
    for (const alias of ['/api/imports/./request', '/api/imports//request', '/api/imports/%72equest', '/api/Imports/request',
      '/api/imports/request/../request', '/api/import/request', '/api/imports', '/api/packs/imports/request']) {
      await expectStatus({ ...valid, path: alias }, 404, `route alias ${alias}`);
    }
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      await expectStatus({ ...valid, method, body: undefined }, 404, `method ${method}`);
    }
    for (const headers of [
      { ...valid.headers, origin: undefined }, { ...valid.headers, origin: 'null' },
      { ...valid.headers, origin: 'https://foreign.invalid' }, { ...valid.headers, host: 'foreign.invalid' },
      { ...valid.headers, 'sec-fetch-site': 'cross-site' }, { ...valid.headers, 'sec-fetch-site': 'same-site' },
    ]) {
      const supplied = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
      await expectStatus({ ...valid, headers: supplied }, 403, `headers ${JSON.stringify(supplied)}`);
    }
    await expectStatus({ ...valid, headers: { ...valid.headers, 'content-type': 'text/plain' } }, 415, 'non-JSON');
    await expectStatus({ ...valid, headers: { host, origin } }, 415, 'missing content type');
    // The explicit closed code, not the generic failure body, accompanies each body refusal.
    for (const [label, rejected, status] of [
      ['malformed JSON', '{invalid', 400], ['invalid UTF-8', Buffer.from([0xc3, 0x28]), 400],
      ['oversized streamed body', 'x'.repeat(NEEDS_YOU_LIMITS.bodyBytes + 1), 413],
    ]) {
      const refused = await rawJson(f.instance.server, { ...valid, body: rejected });
      assert.equal(refused.status, status, label);
      assert.deepEqual(refused.body, { error: 'invalid_input' }, label);
    }
    for (const key of ['root', 'path', 'destination', 'source', 'ref', 'force', 'prompt', 'command', 'token', 'adaptation', 'flags']) {
      const response = await f.post({ ...body, [key]: 'not allowed' }, IMPORT_ROUTE);
      assert.equal(response.status, 400, key);
      assert.deepEqual(await response.json(), { error: 'invalid_input' });
    }
    for (const operation of ['execute', 'apply', 'import', 'PREPARE']) {
      assert.equal((await f.post({ ...body, op: operation }, IMPORT_ROUTE)).status, 400, operation);
    }
    for (const importSource of ['', ' ', 'a\nb', 'https://github.com:443/example/skills/blob/main/SKILL.md',
      'file:///etc/passwd', `/${'a'.repeat(2_048)}`, 5, null,
      // Not an `https://` authority, however a URL parser reads them: the provider gate must refuse each.
      'https:evil.example//github.com/o/r/blob/main/a.md', 'https:github.com//github.com/o/r/blob/main/a.md',
      'https:github.com:443//github.com/o/r/blob/main/a.md', 'https:evil.example@github.com//github.com/o/r/blob/main/a.md',
      'https:https://github.com/o/r', 'https:evil.example//raw.githubusercontent.com/o/r/main/a.md',
      'HTTPS:evil.example//github.com/o/r/blob/main/a.md']) {
      const response = await f.post({ ...body, importSource }, IMPORT_ROUTE);
      assert.equal(response.status, 400, String(importSource).slice(0, 40));
      assert.deepEqual(await response.json(), { error: 'invalid_input' });
    }
    assert.equal((await f.post({ op: 'submit', importSource: IMPORT_SOURCE }, IMPORT_ROUTE)).status, 400, 'submit needs its receipt');
    const oldInput = f.instance.readInput;
    f.instance.readInput = { root: fixture.temporary };
    const wrongRoot = await f.post(body, IMPORT_ROUTE);
    assert.equal(wrongRoot.status, 409);
    assert.deepEqual(await wrongRoot.json(), { error: 'identity_mismatch' }, 'an otherwise-valid body reaches the root guard');
    f.instance.readInput = oldInput;
    assert.equal(f.provider.read().importRequests.length, 0);
    assert.equal((await f.post(body, IMPORT_ROUTE)).status, 202, 'the valid control reaches allocation');
    assert.equal(f.sends.length, 0);
    assert.deepEqual(snapshotFiles(fixture.root), before);
  } finally {
    await f.close();
    await closeInstance(readOnlyId);
    fixture.cleanup();
  }
});

test('T001 an import request that outlives its Canvas is refused before the provider and sends nothing', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const { port, host } = new URL(f.instance.url);
  const body = JSON.stringify({ op: 'prepare', importSource: IMPORT_SOURCE });
  // `request` fires once the headers are parsed, before the incomplete body ends.
  const headersReceived = new Promise(resolve => f.instance.server.once('request', () => resolve(undefined)));
  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: IMPORT_ROUTE, headers: {
        host, origin: new URL(f.instance.url).origin, 'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      } }, incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('end', () => resolve({ status: incoming.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', reject);
      request.setTimeout(5_000, () => request.destroy(new Error('import lifetime fixture timed out')));
      request.write(body.slice(0, 12));
      // End the Canvas lifetime while the body is incomplete, then finish the body.
      void headersReceived.then(() => {
        void closeInstance(f.instanceId);
        setTimeout(() => request.end(body.slice(12)), 25);
      });
    });
    assert.equal(response.status, 409);
    assert.deepEqual(JSON.parse(response.text), { error: 'identity_mismatch' });
    assert.equal(f.provider.read().importRequests.length, 0);
    assert.equal(f.sends.length, 0);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T001 import route failures keep explicit refusal and send-uncertainty statuses instead of a generic error', async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const post = body => f.post(body, IMPORT_ROUTE);
  /** @param {Response} response @param {number} status @param {string} error */
  const expectRefusal = async (response, status, error, label) => {
    assert.equal(response.status, status, label);
    assert.deepEqual(await response.json(), { error }, label);
  };
  try {
    const queue = f.session.rpc.queue.pendingItems;
    f.session.rpc.queue.pendingItems = async () => ({ items: [{}], steeringMessages: [] });
    await expectRefusal(await post({ op: 'prepare', importSource: IMPORT_SOURCE }), 409, 'idle_required', 'queued input');
    f.session.rpc.queue.pendingItems = queue;
    const prepared = await (await post({ op: 'prepare', importSource: IMPORT_SOURCE })).json();
    const submit = { op: 'submit', importSource: IMPORT_SOURCE, importReceipt: prepared.importReceipt };
    await expectRefusal(await post({ op: 'submit', importSource: IMPORT_SOURCE, importReceipt: randomUUID() }), 404,
      'unknown_receipt', 'unknown receipt');
    await expectRefusal(await post({ ...submit, importSource: `${IMPORT_SOURCE}2` }), 409, 'identity_mismatch', 'other Source');
    await expectRefusal(await post({ op: 'prepare', importSource: IMPORT_SOURCE }), 409, 'import_unreconciled', 'second preparation');
    await expectRefusal(await f.post({ op: 'prepare', operation: 'install', name: 'alpha' }), 409, 'import_unreconciled',
      'pack preparation while an import is outstanding');
    // The SDK fails after the send began: possible delivery, never a generic no-change error.
    f.session.send = async () => { throw new Error('Private SDK failure with the prompt'); };
    const uncertain = await post(submit);
    assert.equal(uncertain.status, 502);
    const uncertainText = await uncertain.text();
    assert.deepEqual(JSON.parse(uncertainText), { error: 'import_send_uncertain' });
    assert.doesNotMatch(uncertainText, /Private SDK|prompt/, 'SDK detail never leaves the provider');
    await expectRefusal(await post(submit), 409, 'already_consumed', 'resubmit after uncertainty');
    await expectRefusal(await post({ op: 'prepare', importSource: IMPORT_SOURCE }), 409, 'import_unreconciled', 'prepare after uncertainty');
    const feed = await f.feed();
    assert.equal(feed.importRequests[0].phase, 'uncertain');
    assert.equal(feed.importRequests[0].sendStarted, true);
    assert.equal(feed.importRequests[0].applied, false);
    f.provider.dispose();
    await expectRefusal(await post({ op: 'prepare', importSource: IMPORT_SOURCE }), 503, 'provider_unavailable', 'provider ended');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T001 cross-tab HTTP import submit consumes one shared receipt and sends at most once', async () => {
  const fixture = packFixture();
  fixture.profile({}); fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const otherId = `import-second-tab-${randomUUID()}`;
  const other = await openInstance(otherId, () => {}, { complete: true }, { root: fixture.root }, f.provider);
  const postOther = body => call(other.url, { path: IMPORT_ROUTE, method: 'POST',
    headers: { origin: new URL(other.url).origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const prepared = await (await f.post({ op: 'prepare', importSource: IMPORT_SOURCE }, IMPORT_ROUTE)).json();
    assert.equal((await postOther({ op: 'prepare', importSource: IMPORT_SOURCE })).status, 409, 'the other tab is excluded');
    const body = { op: 'submit', importSource: IMPORT_SOURCE, importReceipt: prepared.importReceipt };
    const results = await Promise.all([f.post(body, IMPORT_ROUTE), postOther(body)]);
    assert.deepEqual(results.map(response => response.status).sort(), [202, 409]);
    assert.equal(f.sends.length, 1);
    assert.equal((await f.feed()).importRequests.length, 1);
    assert.equal(cmdStatus({ root: fixture.root }).result.enabled_packs.length, 0);
  } finally { await closeInstance(otherId); await f.close(); fixture.cleanup(); }
});

test('T001 an Applied import result leaves /api/packs authority untouched and builds no row from its paths', async () => {
  const fixture = packFixture();
  fixture.profile({}); fixture.catalog(['alpha']);
  const f = await packHttpFixture(fixture);
  const skill = '.github/skills/dude-local-demo/SKILL.md';
  try {
    // `readAt` is each read's own clock. The project projection reads the disk
    // beside the pack authority, so it is compared separately; every pack
    // revision and row is compared exactly.
    const packs = async () => {
      const { readAt, project, ...authority } = await (await call(f.instance.url, { path: '/api/packs' })).json();
      assert.equal(typeof readAt, 'string');
      return { authority, project };
    };
    const before = await packs();
    assert.deepEqual(before.project, { coverage: { state: 'empty', reason: null, message: null }, items: [] });
    const prepared = await (await f.post({ op: 'prepare', importSource: IMPORT_SOURCE }, IMPORT_ROUTE)).json();
    const delivered = await (await f.post({ op: 'submit', importSource: IMPORT_SOURCE, importReceipt: prepared.importReceipt }, IMPORT_ROUTE)).json();
    assert.equal(delivered.phase, 'delivered');
    fs.mkdirSync(path.join(fixture.root, '.github/skills/dude-local-demo'), { recursive: true });
    fs.writeFileSync(path.join(fixture.root, skill), '---\nname: dude-local-demo\ndescription: "Demo"\n---\n');
    const hints = [];
    const unsubscribe = f.provider.subscribe(hint => hints.push(hint));
    const { receiptId, owner, importSource, workspaceId, sessionId, providerGeneration } = delivered.receipt;
    const result = await f.tool({ op: 'acknowledge', acknowledgment: {
      receiptId, owner, importSource, workspaceId, sessionId, providerGeneration, recognizes: 'import_result',
      outcome: 'applied', mutation: 'applied', written: [skill], uncertain: [], note: 'Owner verified the written skill.',
    } });
    unsubscribe();
    assert.equal(result.resultType, 'success', result.textResultForLlm);
    assert.deepEqual(hints, ['workspace'], 'the open Canvas is asked to reread workspace facts');
    const after = await packs();
    assert.deepEqual(after.authority, before.authority, 'the hint leaves installed and catalog authority exactly as it was');
    assert.equal(JSON.stringify(after.authority).includes('dude-local-demo'), false, 'no pack row is built from a reported path');
    // The Installed list follows the files on disk, never the result's reported paths.
    assert.deepEqual(after.project.items.map(item => item.key), ['project:skill:dude-local-demo']);
    fs.rmSync(path.join(fixture.root, '.github/skills/dude-local-demo'), { recursive: true });
    assert.deepEqual((await packs()).project, before.project, 'the acknowledged result keeps no row alive without its files');
    const feed = await f.feed();
    assert.equal(feed.importRequests[0].applied, true);
    assert.deepEqual(feed.importRequests[0].receipt.acknowledgment.written, [skill]);
    assert.deepEqual(cmdStatus({ root: fixture.root }).result.enabled_packs, []);
  } finally { await f.close(); fixture.cleanup(); }
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
 * it calls `fail` to report a failed tree kill or `run` to perform the real kill.
 * @param {import('node:test').TestContext} t
 * @param {(args: string[], fail: () => void, run: () => void) => void} [replace]
 */
function taskkillSpy(t, replace) {
  const execFile = childProcess.execFile;
  /** @typedef {{args: string[], calledAt: number, error: Error | null, durationMs?: number}} TaskkillCall */
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
      call.durationMs = performance.now() - call.calledAt;
      callback(error, stdout, stderr);
    };
    if (!replace) return execFile.call(this, file, args, options, done);
    replace(call.args, () => done(Object.assign(new Error(`Command failed: taskkill ${args.join(' ')}`), { code: 255 })),
      () => execFile.call(this, file, args, options, done));
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
 * @typedef {{pid: number, ppid: number, created: string, name: string, commandLine: string | null}} ProcessRow
 */

/** @returns {Promise<ProcessRow[]>} */
function processTable() {
  const script = 'Get-CimInstance Win32_Process | ForEach-Object {'
    + ' $created = if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 };'
    + ' [pscustomobject]@{pid=$_.ProcessId;ppid=$_.ParentProcessId;created=$created.ToString();'
    + 'name=$_.Name;commandLine=$_.CommandLine} | ConvertTo-Json -Compress }';
  return new Promise((resolve, reject) => {
    childProcess.execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)));
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
 * Warm a test-only Windows helper before the reader's deadline. At the kill
 * boundary it rechecks the native shallow clone's exact identity, stops only
 * that clone, and leaves the reader alive for the known 1,000 ms fallback
 * window. Process-table sampling stays outside the binding stop window; the
 * test identifies any new owned clone after the read settles.
 * @param {import('node:test').TestContext} t
 */
async function partialCloneKill(t) {
  const script = String.raw`
$ErrorActionPreference='Stop'
# Load this cmdlet before the stop window, not at the first kill.
Get-Process -Id $PID | Out-Null
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
$request=[Console]::In.ReadLine()|ConvertFrom-Json
if($request){
  try {
    $started=[DateTime]::UtcNow
    $clone=Get-Process -Id $request.clone.pid -ErrorAction SilentlyContinue
    $created=if($clone){$clone.StartTime.ToUniversalTime().ToFileTimeUtc()}else{0}
    # CIM records microseconds; Get-Process also carries the finer final digit.
    if(!$clone -or ($created-($created%10)).ToString() -ne $request.clone.created){throw 'The recorded clone identity changed'}
    if($request.clone.name -ne 'git.exe' -or $request.clone.commandLine -notmatch '\bclone\b' -or $request.clone.commandLine -notmatch '--depth=1'){throw 'The target is not the native shallow clone'}
    Stop-Process -Id $clone.Id -Force
    Start-Sleep -Milliseconds 1000
    $reader=Get-Process -Id $request.reader.pid -ErrorAction SilentlyContinue
    $created=if($reader){$reader.StartTime.ToUniversalTime().ToFileTimeUtc()}else{0}
    $sameReader=$reader -and ($created-($created%10)).ToString() -eq $request.reader.created
    $result=[pscustomobject]@{ok=$true;killed=$request.clone;reader=$(if($sameReader){$request.reader}else{$null});elapsedMs=([DateTime]::UtcNow-$started).TotalMilliseconds}
  }catch{$result=[pscustomobject]@{ok=$false;error=$_.Exception.Message}}
  [Console]::Out.WriteLine(($result|ConvertTo-Json -Depth 5 -Compress))
  [Console]::Out.Flush()
}
`;
  const child = childProcess.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  /** @type {(value: any) => void} */
  let readyResolve = () => {}, killedResolve = () => {};
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const killed = new Promise(resolve => { killedResolve = resolve; });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', line => {
    const value = JSON.parse(line);
    if (value.ready) readyResolve(value);
    else killedResolve(value);
  });
  const closed = new Promise(resolve => child.once('close', () => {
    const failure = { ok: false, error: `partial-kill helper closed: ${stderr}` };
    readyResolve(failure);
    killedResolve(failure);
    resolve(undefined);
  }));
  t.after(async () => { child.stdin.end(); child.kill('SIGKILL'); await closed; lines.close(); });
  assert.equal((await ready).ready, true, 'the kill helper was ready before the read started');
  return {
    /** @param {ProcessRow} clone @param {ProcessRow} reader */
    kill(clone, reader) {
      child.stdin.end(JSON.stringify({ clone, reader }) + '\n');
      return killed;
    },
  };
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
 * allowlisted launch fields and environment keys reach the output. The driver
 * reports the home it has, which is the host's own, and the bootstrap records
 * the home it starts with, before it imports the extension, as the CLI's own
 * loader and bootstrap would find it.
 * @param {ReturnType<typeof packFixture>} fixture
 * @param {{executable: 'git'|'node', bootstrap?: 'current'|'changed'|'missing'}} options
 */
function simulatedCliHost(fixture, { executable, bootstrap }) {
  const cli = path.join(fixture.temporary, 'cli');
  const cliBootstrap = path.join(cli, 'preloads', 'extension_bootstrap.mjs');
  const entry = path.join(cli, 'index.mjs');
  const decoy = path.join(cli, 'decoy-extension.mjs');
  const marker = path.join(cli, 'decoy-imported');
  const bootstrapHomes = path.join(cli, 'bootstrap-homes.jsonl');
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
    "import fs from 'node:fs';",
    "import os from 'node:os';",
    "import { pathToFileURL } from 'node:url';",
    `const homes = ${JSON.stringify(HOME_VARIABLES)};`,
    `fs.appendFileSync(${JSON.stringify(bootstrapHomes)}, JSON.stringify({`,
    "  ...Object.fromEntries(homes.map(key => [key, process.env[key] ?? null])), homedir: os.homedir() }) + '\\n');",
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
    "import os from 'node:os';",
    "import { syncBuiltinESMExports } from 'node:module';",
    'const node = process.execPath;',
    `const host = ${JSON.stringify(host)};`,
    'process.execPath = host;',
    `const argvBootstrap = ${JSON.stringify(argvBootstrap)};`,
    'if (argvBootstrap) process.argv.push(argvBootstrap);',
    `const homes = ${JSON.stringify(HOME_VARIABLES)};`,
    // The home this host has, before anything is launched.
    'const home = { ...Object.fromEntries(homes.map(key => [key, process.env[key] ?? null])), homedir: os.homedir() };',
    `const keys = ['EXTENSION_PATH', 'COPILOT_EXTENSION_PARENT_PID', 'TMP', 'TEMP', 'TMPDIR', 'GIT_TERMINAL_PROMPT',`,
    `  'GIT_HTTP_LOW_SPEED_LIMIT', 'GIT_HTTP_LOW_SPEED_TIME', ...homes, ${JSON.stringify(CATALOG_GIT_HOME_ENV)}];`,
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
    'process.stdout.write(JSON.stringify({ execPath: process.execPath, hostPid: process.pid, home,',
    '  elapsedMs: performance.now() - started, coverage: snapshot.coverage,',
    '  packs: snapshot.catalog?.packs.map(pack => pack.name) ?? null, items: snapshot.items, launches }));',
  ].join('\n'));
  const child = spawnSync(process.execPath, [driver], {
    cwd: fixture.root, encoding: 'utf8', timeout: 25_000, windowsHide: true,
    env: { ...process.env, EXTENSION_PATH: decoy, COPILOT_EXTENSION_PARENT_PID: String(process.pid) },
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const homesSeen = fs.existsSync(bootstrapHomes)
    ? fs.readFileSync(bootstrapHomes, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return { ...JSON.parse(child.stdout), host, cliBootstrap, decoy, marker, bootstrapHomes: homesSeen };
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
    // A bare missing bd can be verified optional absence. Initialization
    // evidence keeps this initial read unavailable on every host.
    "  fs.mkdirSync('.beads');",
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
    const response = await call(instance.url, { path: DISCOVER });
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
    assert.deepEqual(body.items.find(item => item.name === 'retired'), installedRow('retired', installed.retired));
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
    const body = await (await call(instance.url, { path: DISCOVER })).json();
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
      key: `pack:constructor@${body.sources.defaultKey}`, sourceKey: body.sources.defaultKey, provenance: null,
    }], 'an inherited constructor must not become installed membership in the join');
    assert.deepEqual(snapshotFiles(fixture.root), before);

    const installed = { constructor: fixture.entry('constructor') };
    fixture.profile(installed);
    const installedBefore = snapshotFiles(fixture.root);
    const current = await (await call(instance.url, { path: DISCOVER })).json();
    assert.equal(current.coverage.installed.state, 'current');
    assert.deepEqual(current.installed, { enabled_packs: ['constructor'], installed });
    assert.deepEqual(current.items, [{
      ...body.catalog.packs[0], installed: true, ...installed.constructor,
      key: 'pack:constructor', sourceKey: null, provenance: 'unlisted',
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
    const response = await call(instance.url, { path: DISCOVER });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.catalog.origin, `${remote.source} @ main`);
    assert.deepEqual(body.catalog.packs.map(pack => pack.name), names);
    assert.equal(body.catalog.packs[6].description, 'golf full description <script>inert()</script>');
    assert.deepEqual(body.catalog.packs[6].use_cases, ['writing', 'ui']);
    assert.deepEqual(body.items[0].source, fixture.entry('retired').source);

    fs.renameSync(remote.repository, `${remote.repository}-offline`);
    const failed = await (await call(instance.url, { path: DISCOVER })).json();
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
      const valid = await (await call(instance.url, { path: DISCOVER })).json();
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
      const body = await (await call(instance.url, { path: DISCOVER })).json();
      assert.equal(body.coverage.installed.state, 'current');
      assert.deepEqual(body.installed, valid.installed);
      assert.equal(body.coverage.catalog.state, 'unavailable');
      assert.match(body.coverage.catalog.message, /symbolic link 'library'/);
      assert.equal(body.catalog, null);
      assert.deepEqual(body.items, [installedRow('retired', installed.retired)]);
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
    const empty = await (await call(instance.url, { path: DISCOVER })).json();
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
      const body = await (await call(instance.url, { path: DISCOVER })).json();
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
    const body = await (await call(instance.url, { path: DISCOVER })).json();
    assert.equal(body.coverage.installed.state, 'current');
    assert.equal(body.coverage.catalog.state, 'unavailable');
    assert.match(body.coverage.catalog.message, /invalid metadata.*use-cases/);
    assert.deepEqual(body.installed.installed, installed);
    assert.deepEqual(body.items, [installedRow('alpha', installed.alpha)]);
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
    const body = await (await call(instance.url, { path: DISCOVER })).json();
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
    const fresh = await (await call(instance.url, { path: DISCOVER })).json();
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
    if (req.url !== DISCOVER) return;
    requests += 1;
    if (requests === 1) res.once('close', disconnected);
    if (requests === 2) joined();
  });
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const first = call(instance.url, { path: DISCOVER, signal: firstController.signal }).catch(error => error);
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    assert.equal((await call(instance.url, { path: '/api/projection' })).status, 200);
    const second = call(instance.url, { path: DISCOVER });
    await secondJoined;
    assert.equal(instance.catalogRead.readers, 2);
    const coalesced = spy.readers().length;
    firstController.abort();
    await first;
    await firstClosed;
    assert.equal(instance.catalogRead.readers, 1);
    assert.equal(listener.open, 1, 'another live reader retains the acquisition');
    const retained = spy.readers()[0]?.exitedAt === null;
    assert.equal(await closeInstance('packs-close'), true);
    const stopped = { open: listener.open, scratch: fs.readdirSync(fixture.scratch) };
    const launched = { readers: spy.readers().length, exited: spy.readers()[0]?.exitedAt !== null };
    assert.equal(stopped.open, 0, 'the reader tree stopped before close returned');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: stopped.scratch });
    assert.equal((await second).status, 503);
    const replacement = await openInstance('packs-close', () => {}, { complete: true }, { root: fixture.root });
    assert.equal(replacement.catalogRead, null, 'a replacement lifetime inherits no in-flight read or result');
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
    const reading = call(instance.url, { path: DISCOVER, signal: controller.signal }).catch(error => error);
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
      const pending = call(instance.url, { path: DISCOVER });
      await listener.connected();
      tree = await readerTree(spy.readers()[0]?.child.pid);
      const response = await pending;
      const body = await response.json();
      const elapsed = performance.now() - started;
      assert.equal(response.status, 200);
      assert.deepEqual(body.coverage.catalog, deadlineCoverage(kills));
      assert.equal(body.coverage.installed.state, 'current');
      assert.equal(body.catalog, null);
      assert.deepEqual(body.items, [installedRow('alpha', installed.alpha)]);
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
    const pending = call(instance.url, { path: DISCOVER });
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const stalled = await (await pending).json();
    const connections = listener.connections;
    // Compose prefers a local catalog; the configured stalled source stays in place.
    fixture.catalog(['alpha', 'bravo']);
    const started = performance.now();
    const recovered = await (await call(instance.url, { path: DISCOVER })).json();
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
      const pending = call(f.instance.url, { path: DISCOVER });
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
    const first = call(instance.url, { path: DISCOVER, signal: controller.signal }).catch(error => error);
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const abortedAt = performance.now();
    controller.abort();
    assert.ok((await first) instanceof Error, 'the abandoned fetch rejected');
    await firstClosed;
    fixture.catalog(['alpha']);
    const started = performance.now();
    const second = await (await call(instance.url, { path: DISCOVER })).json();
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
    const pending = call(instance.url, { path: DISCOVER });
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
    assert.equal(reopened.catalogRead, null);
    const reopenedAt = performance.now();
    const body = await (await call(reopened.url, { path: DISCOVER })).json();
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

test('T001 stopping the native shallow clone cannot escape through the reader\'s full fallback clone', {
  timeout: 45_000, skip: process.platform !== 'win32' && 'the snapshot-to-kill window uses Windows taskkill',
}, async t => {
  for (const report of ['a failed kill', 'taskkill reaches the reader']) await t.test(report, async t => {
    const listener = await silentGitListener(t);
    const fixture = packFixture();
    fixture.profile({});
    stallCatalog(fixture, listener.url('git'));
    const partial = await partialCloneKill(t);
    const spy = spawnSpy(t);
    /** @type {ProcessRow[]} */
    let tree = [], recorded = [];
    /** @type {any} */
    let window = null;
    /** @type {Promise<void> | undefined} */
    let fault;
    let markerBeforeKill = false, cleaned = false, bodyFailed = false;
    const kills = taskkillSpy(t, (_args, fail, run) => {
      const [reader] = spy.readers();
      const clone = tree.findLast(member => member.name.toLowerCase() === 'git.exe'
        && member.commandLine?.includes('--depth=1') && /\bclone\b/.test(member.commandLine));
      if (!clone) t.diagnostic(JSON.stringify({ missingNativeClone: tree }));
      markerBeforeKill = fs.existsSync(path.join(reader.options.env.TMP, CATALOG_STOP_MARKER));
      fault = partial.kill(/** @type {ProcessRow} */ (clone), tree[0]).then(value => {
        window = value;
        if (report === 'a failed kill') fail();
        else run();
      });
    });
    const controller = new AbortController();
    const started = performance.now();
    const reading = readPacks(fixture.root, controller.signal);
    try {
      await listener.connected();
      tree = await readerTree(spy.readers()[0]?.child.pid);
      assert.ok(tree.length > 1, 'the live reader and native Git were recorded before the deadline');
      const snapshot = await reading;
      const elapsed = performance.now() - started;
      await fault;
      assert.equal(window?.ok, true, JSON.stringify(window));
      assert.equal(window.reader?.created, tree[0].created, 'the reader stayed alive during the full fallback window');
      // The owned checkout path identifies an escaped full clone even after
      // its reader died. Collect exact identities only after the timed stop.
      const temporary = spy.readers()[0].options.env.TMP;
      window.owned = (await processTable()).filter(member => member.commandLine?.replace(/\//g, path.sep).includes(temporary));
      recorded = [...new Map([...tree, ...window.owned].map(member => [`${member.pid}:${member.created}`, member])).values()];
      const survivors = await survivorsAfterBound(recorded, 1_000);
      t.diagnostic(JSON.stringify({ report, markerBeforeKill, tree, window, survivors,
        connections: listener.connections, open: listener.open, kills: kills.calls,
        coverage: snapshot.coverage.catalog, elapsedMs: elapsed }));
      assert.equal(listener.connections, 1, 'stopping the shallow clone made no second source contact');
      assert.deepEqual(survivors, [], 'no identified reader or tree process survived the stop');
      assert.equal(listener.open, 0, 'no Git process still holds the stalled connection, without releasing the peer');
      assert.equal(markerBeforeKill, true, 'the marker was written before invoking the tree kill');
      assert.deepEqual(snapshot.coverage.catalog, report === 'a failed kill'
        ? { state: 'unavailable', reason: 'catalog_cleanup_failed', message: 'The catalog reader could not confirm process cleanup.' }
        : { state: 'unavailable', reason: 'catalog_timeout', message: 'The catalog read timed out. Reload to try a fresh read.' });
      assert.equal(kills.failed.size, report === 'a failed kill' ? 1 : 0, 'the real taskkill result is not masked');
      await assertTreeStops({ t, spy, kills, trees: [recorded], scratch: fs.readdirSync(fixture.scratch) });
      assert.ok(elapsed >= 5_000 && elapsed < 7_500, `within the read deadline and stop window: ${elapsed} ms`);
      fixture.cleanup();
      cleaned = true;
      assert.equal(fs.existsSync(fixture.temporary), false, 'fixture cleanup succeeded while the peer was still listening');
    } catch (error) { bodyFailed = true; throw error; }
    finally {
      controller.abort();
      await reading.catch(() => {});
      if (!cleaned) {
        recorded = [...new Map([...tree, ...(window?.owned ?? [])].map(member => [`${member.pid}:${member.created}`, member])).values()];
        try { await stopRecorded(recorded); fixture.cleanup(); }
        catch (error) {
          if (!bodyFailed) throw error;
          t.diagnostic(`fallback regression cleanup also failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  });
});

test('T001 a failed stop-marker write keeps exactly its reader root unconfirmed despite a successful tree kill', {
  timeout: 20_000,
}, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  // This real reader stalls in a local path call and starts no descendant. A
  // real tree kill can therefore succeed independently of the marker failure.
  stallResolutionOf(t, fixture, fixture.root);
  const spy = spawnSpy(t);
  const spawn = childProcess.spawn;
  t.mock.method(childProcess, 'spawn', /** @this {any} */ function (command, args, options) {
    if (args.includes(READER)) fs.mkdirSync(path.join(options.env.TMP, CATALOG_STOP_MARKER));
    return spawn.apply(this, arguments);
  });
  const kills = taskkillSpy(t);
  const write = fs.writeFileSync;
  /** @type {{path: string, code: string | undefined}[]} */
  const failures = [];
  t.mock.method(fs, 'writeFileSync', /** @this {any} */ function (file, ...args) {
    try { return write.call(this, file, ...args); }
    catch (error) {
      if (typeof file === 'string' && spy.readers().some(reader => file === path.join(reader.options.env.TMP, CATALOG_STOP_MARKER))) {
        failures.push({ path: file, code: /** @type {NodeJS.ErrnoException} */ (error).code });
      }
      throw error;
    }
  });
  try {
    const started = performance.now();
    const snapshot = await readPacks(fixture.root, new AbortController().signal);
    const [reader] = spy.readers();
    assert.equal(spy.readers().length, 1);
    assert.deepEqual(failures.map(failure => failure.path), [path.join(reader.options.env.TMP, CATALOG_STOP_MARKER)],
      'the actual writeFileSync failed on this reader\'s directory-shaped marker');
    assert.ok(failures.every(failure => ['EISDIR', 'EPERM', 'EACCES'].includes(failure.code ?? '')));
    if (process.platform === 'win32') {
      assert.equal(kills.calls.length, 1, 'the marker failure still attempted the real tree kill');
      assert.equal(typeof kills.calls[0].durationMs, 'number', 'the underlying taskkill callback completed within the stop window');
      assert.equal(kills.calls[0].error, null, 'the underlying taskkill succeeded');
    }
    assert.notEqual(reader.exitedAt, null, 'the reader closed after its underlying kill');
    assert.deepEqual(snapshot.coverage.catalog, { state: 'unavailable', reason: 'catalog_cleanup_failed',
      message: 'The catalog reader could not confirm process cleanup.' });
    assert.deepEqual(fs.readdirSync(fixture.scratch), [path.basename(reader.options.env.TMP)],
      'the successful kill cannot remove this one held root after a failed marker write');
    assert.equal(fs.statSync(path.join(reader.options.env.TMP, CATALOG_STOP_MARKER)).isDirectory(), true);
    assert.ok(performance.now() - started < 7_500, 'the marker failure did not extend the stop budget');
    t.diagnostic(JSON.stringify({ failures, kills: kills.calls, root: reader.options.env.TMP, coverage: snapshot.coverage.catalog }));
  } finally { t.mock.restoreAll(); fixture.cleanup(); }
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
  assert.deepEqual(observed.snapshot.items, [{ key: 'pack:alpha', name: 'alpha', installed: true, ...observed.installed.alpha, description: null, use_cases: null }]);
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

test('T008 a host bootstrap starts with the home its host has, and only the reader moves its own Git\'s home', { timeout: 30_000 }, () => {
  const fixture = packFixture();
  fixture.profile({ alpha: fixture.entry('alpha') });
  fixture.catalog(['alpha', 'bravo']);
  try {
    const observed = simulatedCliHost(fixture, { executable: 'git', bootstrap: 'current' });
    assert.deepEqual(observed.coverage.catalog, { state: 'current', reason: null, message: null }, 'the read still succeeds through the bootstrap');
    assert.equal(observed.launches.length, 1);
    const [launch] = observed.launches;
    // The CLI's own loader and bootstrap start from the launch environment, so it keeps the host's home exactly:
    // none is redirected, and a variable that the host leaves unset stays unset.
    for (const key of HOME_VARIABLES) assert.equal(launch.env[key] ?? null, observed.home[key], `the launch leaves ${key} as the host has it`);
    assert.deepEqual(observed.bootstrapHomes, [observed.home], 'the bootstrap started with the host\'s own home, and so did os.homedir()');
    // What the launch does name is the reader's own empty Git home, directly in its own root, in a variable that no loader reads.
    assert.equal(path.dirname(String(launch.env[CATALOG_GIT_HOME_ENV])), launch.env.TMP);
    assert.deepEqual(fs.readdirSync(fixture.scratch), [], 'the root, with its home, was removed');
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
        assert.deepEqual(observed.items, [{ key: 'pack:alpha', name: 'alpha', installed: true, ...installed.alpha, description: null, use_cases: null }]);
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
      toolNames: ['dude_needs_you', 'dude_a2a_propose', 'dude_a2a_ask', 'dude_a2a_receive', 'dude_a2a_reply', 'dude_a2a_verify'],
      operationNames: ['request', 'acknowledge'],
      acknowledgmentKinds: ['canvas_response', 'outside_answer', 'capture', 'pack_result', 'import_result'],
      hasOnEvent: true,
      canvasCount: 1,
    }, 'the existing Canvas, one closed two-operation handoff, and the opt-in A2A ask, receive, reply, and verify tools share the joined session');
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

const ABOUT_REPOSITORY = 'https://github.com/E-G-C/dude';
/**
 * The exact serialized About body. The development base is null unless a case
 * records one, so every 074 case also proves the added field stays null.
 * @param {string | null} installedRef @param {string | null} sourceRef @param {string | null} [baseRelease]
 */
const aboutBody = (installedRef, sourceRef, baseRelease = null) => JSON.stringify({ installedRef, sourceRef, baseRelease });
const ABOUT_NULLS = '{"installedRef":null,"sourceRef":null,"baseRelease":null}';
const ABOUT_ENDED = Object.freeze({ error: 'about_unavailable', message: 'This Canvas has no current workspace.' });

/** A disposable workspace whose About inputs are its two fixed metadata files. */
function aboutFixture() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-about-'));
  const root = path.join(temporary, 'workspace');
  const manifestPath = path.join(root, '.dude', 'metadata', 'bundle-manifest.md');
  const recordPath = path.join(root, '.dude', 'metadata', 'development-base-release.md');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  /** The canonical shape: prose around exactly one fenced JSON payload. @param {unknown} payload */
  const documentFor = payload => [
    '# Bundle Manifest', '', 'Pins the upstream source for this install.', '',
    '```json', JSON.stringify(payload, null, 2), '```', '', '## Notes', '', '- Metadata only.', '',
  ].join('\n');
  /** Any payload in the base record's prose-plus-fence shape. @param {unknown} payload */
  const recordDocumentFor = payload => [
    '# Development Base Release', '', 'Recorded provenance for this development install.', '',
    '```json', JSON.stringify(payload, null, 2), '```', '',
  ].join('\n');
  return {
    temporary, root, manifestPath, recordPath, documentFor, recordDocumentFor,
    /** @param {unknown} payload */
    write(payload) { fs.writeFileSync(manifestPath, documentFor(payload)); },
    /** @param {string | Buffer} bytes */
    writeRaw(bytes) { fs.writeFileSync(manifestPath, bytes); },
    /** The producers' own canonical record. @param {{ source_repo: string, base_release: string }} record */
    writeRecord(record) { fs.writeFileSync(recordPath, renderDevelopmentBaseRelease(record)); },
    /** @param {string | Buffer} bytes */
    writeRecordRaw(bytes) { fs.writeFileSync(recordPath, bytes); },
    cleanup() { fs.rmSync(temporary, { recursive: true, force: true }); },
  };
}

/**
 * A complete projection keeps opening free of Canvas acquisition, so an About
 * fixture observes only its own read.
 * @param {string} instanceId @param {string | null} root @param {any} [needsYou]
 */
function openAbout(instanceId, root, needsYou = null) {
  return openInstance(instanceId, () => {}, Object.freeze({ complete: true }), root === null ? null : { root }, needsYou);
}

/** @param {{url: string}} instance @param {RequestInit} [init] */
async function readAboutRoute(instance, init = {}) {
  const response = await call(instance.url, { path: '/api/about', ...init });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

/**
 * Count the fixture's actual manifest reads. `hold` keeps each one open after
 * its bytes are read until `release`: a barrier, not a timed sleep.
 * @param {import('node:test').TestContext} t @param {string} manifestPath @param {{hold?: boolean}} [options]
 */
function manifestReads(t, manifestPath, { hold = false } = {}) {
  const readFile = fs.promises.readFile;
  let started = () => {}, release = () => {};
  const reading = new Promise(resolve => { started = () => resolve(undefined); });
  const released = new Promise(resolve => { release = () => resolve(undefined); });
  const counter = { count: 0, reading, release };
  t.mock.method(fs.promises, 'readFile', /** @this {any} */ async function (file, ...rest) {
    const bytes = await readFile.call(this, file, ...rest);
    if (path.resolve(String(file)) === manifestPath) {
      counter.count += 1;
      started();
      if (hold) await released;
    }
    return bytes;
  });
  return counter;
}

test('074 About: GET returns exactly the current recorded refs on every read with no-store', async () => {
  const f = aboutFixture();
  f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'main', installed_ref: 'main' });
  const instance = await openAbout('about-current', f.root);
  try {
    const current = await readAboutRoute(instance);
    assert.equal(current.status, 200);
    assert.equal(current.headers.get('cache-control'), 'no-store');
    assert.equal(current.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(current.text, aboutBody('main', 'main'), 'exact recorded strings, not display labels');

    // Each entry reads the record again; nothing earlier is retained.
    f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v1.2.3' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('v1.2.3', 'latest'));
    fs.rmSync(f.manifestPath);
    const missing = await readAboutRoute(instance);
    assert.equal(missing.status, 200, 'unavailable metadata is a readable result');
    assert.equal(missing.text, ABOUT_NULLS);
    fs.rmSync(path.join(f.root, '.dude'), { recursive: true });
    assert.equal((await readAboutRoute(instance)).text, ABOUT_NULLS, 'a missing metadata directory is unavailable');
    assert.equal(fs.existsSync(path.join(f.root, '.dude')), false, 'a missing record is never created');
  } finally {
    await closeInstance('about-current');
    f.cleanup();
  }
});

test('074 About: each ref is validated alone and returned exactly, without trimming, coercion or fallback', async () => {
  const f = aboutFixture();
  // Provenance is required but never returned, even when it looks like a credential.
  const repository = 'https://user:secret-token@example.invalid/private.git';
  const instance = await openAbout('about-refs', f.root);
  const long = `release/${'a'.repeat(300)}/${'b'.repeat(300)}`;
  const usable = ['v1.2.3', 'main', 'latest', 'feature/about-panel', 'v1.3.0-rc.1', 'v1.2.3+build.7',
    '0123456789abcdef0123456789abcdef01234567', 'Topic_2+x-y', long];
  const unusable = ['', ' main', 'main ', 'main\n', 'ma\tin', 'main\u0000', 'main\u007f', 'm\u00e4in',
    'https://github.com/E-G-C/dude', 'https://token@github.com/E-G-C/dude', 'user:secret@host',
    'git@github.com:E-G-C/dude.git', '/etc/passwd', 'C:\\Windows\\System32', '..', 'v1..2', 'a/../b',
    'a//b', 'a/', '.hidden', 'feature/.hidden', 'v1.', 'feature./x', 'release.lock', 'feature/x.lock',
    '-leading', '_leading', '+leading', 'a b', 'a~1', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a@{1}', '@',
    7, 0, true, false, null, [], ['main'], { ref: 'main' }];
  /** @param {Record<string, unknown>} refs @param {string | null} installedRef @param {string | null} sourceRef */
  const expectRefs = async (refs, installedRef, sourceRef) => {
    f.write({ source_repo: repository, ...refs });
    const { status, text } = await readAboutRoute(instance);
    assert.equal(status, 200, JSON.stringify(refs));
    assert.equal(text, aboutBody(installedRef, sourceRef), JSON.stringify(refs));
    assert.equal(text.includes('secret-token') || text.includes('example.invalid') || text.includes(f.root), false);
  };
  try {
    await expectRefs({ installed_ref: 'v1.2.3', source_ref: 'latest' }, 'v1.2.3', 'latest');
    await expectRefs({ installed_ref: 'v1.2.3', source_ref: 'v1.2.3' }, 'v1.2.3', 'v1.2.3');
    for (const value of usable) {
      await expectRefs({ installed_ref: value, source_ref: 'latest' }, value, 'latest');
      await expectRefs({ installed_ref: 'main', source_ref: value }, 'main', value);
    }
    for (const value of unusable) {
      // One unusable ref never borrows the other ref, a channel default or a host version.
      await expectRefs({ installed_ref: value, source_ref: 'latest' }, null, 'latest');
      await expectRefs({ installed_ref: 'v1.2.3', source_ref: value }, 'v1.2.3', null);
    }
    await expectRefs({ source_ref: 'latest' }, null, 'latest');
    await expectRefs({ installed_ref: 'v1.2.3' }, 'v1.2.3', null);
    await expectRefs({}, null, null);
  } finally {
    await closeInstance('about-refs');
    f.cleanup();
  }
});

test('074 About: malformed, multi-payload, unsupported, unprovenanced, non-UTF-8 and non-file records leave both refs null', async () => {
  const f = aboutFixture();
  const valid = { source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v1.2.3' };
  const recorded = aboutBody('v1.2.3', 'latest');
  /** @param {string} body */
  const fenced = body => `\`\`\`json\n${body}\n\`\`\``;
  const payload = JSON.stringify(valid, null, 2);
  // Each record keeps usable refs and differs from a valid record by one defect.
  const cases = [
    ['no JSON fence', `# Bundle Manifest\n\ninstalled_ref: v1.2.3\n`],
    ['a non-JSON fence', `# Bundle Manifest\n\n\`\`\`js\n${payload}\n\`\`\`\n`],
    ['malformed JSON', `# Bundle Manifest\n\n${fenced(`${payload.slice(0, -2)},\n}`)}\n`],
    ['two identical valid JSON fences', `# Bundle Manifest\n\n${fenced(payload)}\n\n${fenced(payload)}\n`],
    ['a JSON array', f.documentFor([valid])],
    ['a JSON string', f.documentFor('v1.2.3')],
    ['JSON null', f.documentFor(null)],
    ['an unsupported field', f.documentFor({ ...valid, files: [] })],
    ['a response-shaped field', f.documentFor({ ...valid, installedRef: 'v1.2.3' })],
    ['an own __proto__ field', `# Bundle Manifest\n\n${fenced(`{"__proto__":{},${payload.slice(1)}`)}\n`],
    ['no source_repo', f.documentFor({ source_ref: 'latest', installed_ref: 'v1.2.3' })],
    ['an empty source_repo', f.documentFor({ ...valid, source_repo: '' })],
    ['a blank source_repo', f.documentFor({ ...valid, source_repo: ' \t\n' })],
    ['a numeric source_repo', f.documentFor({ ...valid, source_repo: 42 })],
    ['a null source_repo', f.documentFor({ ...valid, source_repo: null })],
    ['invalid UTF-8 outside the payload', Buffer.concat([
      Buffer.from('# Bundle Manifest '), Buffer.from([0xff]), Buffer.from(`\n\n${fenced(payload)}\n`)])],
    ['invalid UTF-8 inside the payload', Buffer.concat([
      Buffer.from(`# Bundle Manifest\n\n\`\`\`json\n{"source_repo":"${ABOUT_REPOSITORY}`), Buffer.from([0xc3, 0x28]),
      Buffer.from('","source_ref":"latest","installed_ref":"v1.2.3"}\n```\n')])],
  ];
  const instance = await openAbout('about-invalid', f.root);
  try {
    f.write(valid);
    assert.equal((await readAboutRoute(instance)).text, recorded, 'the valid control is readable');
    for (const [label, document] of cases) {
      f.writeRaw(document);
      const { status, text } = await readAboutRoute(instance);
      assert.equal(status, 200, label);
      assert.equal(text, ABOUT_NULLS, label);
    }
    fs.rmSync(f.manifestPath);
    fs.mkdirSync(f.manifestPath);
    assert.equal((await readAboutRoute(instance)).text, ABOUT_NULLS, 'a directory is not a record');
    fs.rmSync(f.manifestPath, { recursive: true });
    f.write(valid);
    assert.equal((await readAboutRoute(instance)).text, recorded, 'a corrected record reads at once');
  } finally {
    await closeInstance('about-invalid');
    f.cleanup();
  }
});

test('074 About: linked roots, components and records and unreadable records are never followed or disclosed', async t => {
  const f = aboutFixture();
  const outside = path.join(f.temporary, 'outside');
  fs.mkdirSync(outside);
  const record = { source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v9.9.9' };
  const recorded = aboutBody('v9.9.9', 'latest');
  const directoryLink = process.platform === 'win32' ? 'junction' : 'dir';
  f.write(record);
  const linkedRootPath = path.join(f.temporary, 'linked-workspace');
  fs.symlinkSync(f.root, linkedRootPath, directoryLink);
  const instance = await openAbout('about-linked', f.root);
  const linkedRoot = await openAbout('about-linked-root', linkedRootPath);
  try {
    assert.equal((await readAboutRoute(instance)).text, recorded, 'the real record is valid');
    assert.equal(fs.readFileSync(path.join(linkedRootPath, '.dude/metadata/bundle-manifest.md'), 'utf8'),
      f.documentFor(record), 'the linked root resolves to the same valid record');
    assert.equal((await readAboutRoute(linkedRoot)).text, ABOUT_NULLS, 'a linked workspace root');

    const outsideRecord = path.join(outside, 'bundle-manifest.md');
    fs.renameSync(f.manifestPath, outsideRecord);
    fs.symlinkSync(outsideRecord, f.manifestPath, 'file');
    assert.equal(fs.readFileSync(f.manifestPath, 'utf8'), f.documentFor(record));
    assert.equal((await readAboutRoute(instance)).text, ABOUT_NULLS, 'a linked record outside the workspace');
    fs.unlinkSync(f.manifestPath);
    fs.renameSync(outsideRecord, f.manifestPath);

    const metadata = path.dirname(f.manifestPath);
    const movedMetadata = path.join(outside, 'metadata');
    fs.renameSync(metadata, movedMetadata);
    fs.symlinkSync(movedMetadata, metadata, directoryLink);
    assert.equal(fs.readFileSync(f.manifestPath, 'utf8'), f.documentFor(record));
    assert.equal((await readAboutRoute(instance)).text, ABOUT_NULLS, 'a linked parent component');
    fs.unlinkSync(metadata);
    fs.renameSync(movedMetadata, metadata);
    assert.equal((await readAboutRoute(instance)).text, recorded, 'the restored real record is valid');

    const readFile = fs.promises.readFile;
    let denied = 0;
    const unreadable = t.mock.method(fs.promises, 'readFile', /** @this {any} */ async function (file, ...rest) {
      if (path.resolve(String(file)) !== f.manifestPath) return readFile.call(this, file, ...rest);
      denied += 1;
      throw Object.assign(new Error(`EACCES: permission denied, open '${file}'`),
        { code: 'EACCES', errno: -13, syscall: 'open', path: String(file) });
    });
    const refused = await readAboutRoute(instance);
    assert.equal(denied, 1, 'the refusal came from the actual record read');
    assert.equal(refused.status, 200);
    assert.equal(refused.text, ABOUT_NULLS, 'no error code, message or path is returned');
    unreadable.mock.restore();
    assert.equal((await readAboutRoute(instance)).text, recorded);

    // A FIFO, socket or device where the record belongs is refused before any
    // open; a directory alone cannot show this because its read also fails.
    const lstatSync = fs.lstatSync;
    const special = t.mock.method(fs, 'lstatSync', /** @this {any} */ function (file, ...rest) {
      const stat = lstatSync.call(this, file, ...rest);
      if (path.resolve(String(file)) !== f.manifestPath) return stat;
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { isFile: () => false, isFIFO: () => true });
    });
    const opened = manifestReads(t, f.manifestPath);
    assert.equal((await readAboutRoute(instance)).text, ABOUT_NULLS, 'a special non-file record');
    assert.equal(opened.count, 0, 'a non-file record is never read');
    special.mock.restore();
    assert.equal((await readAboutRoute(instance)).text, recorded);
    assert.equal(opened.count, 1);

    fs.rmSync(f.root, { recursive: true });
    assert.equal((await readAboutRoute(instance)).text, ABOUT_NULLS, 'a removed workspace root');
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-linked');
    await closeInstance('about-linked-root');
    f.cleanup();
  }
});

test('074 About: only an exact bodiless GET reaches the record read', async t => {
  const f = aboutFixture();
  f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'main', installed_ref: 'main' });
  const instance = await openAbout('about-gates', f.root);
  const { host, origin } = new URL(instance.url);
  const reads = manifestReads(t, f.manifestPath);
  /** @param {Parameters<typeof rawStatus>[1]} request @param {number} expected */
  const expectStatus = async (request, expected) => {
    const label = `${request?.method ?? 'GET'} ${request?.path} ${JSON.stringify(request?.headers ?? {})}`;
    assert.equal(await rawStatus(instance.server, request), expected, label);
  };
  try {
    for (const suffix of ['?', '?root=elsewhere', '?path=../profile.md', '?source=https://example.invalid/x.git',
      '?ref=v1.2.3', '?installedRef=v1.2.3', '/', '/extra', '.json', '#fragment', '/../about']) {
      await expectStatus({ path: `/api/about${suffix}`, headers: { host } }, 404);
    }
    for (const alias of ['/api/About', '/API/about', '/api//about', '/api/%61bout', '/api/x/../about', '/about']) {
      await expectStatus({ path: alias, headers: { host } }, 404);
    }
    await expectStatus({ path: '/api/about', method: 'POST',
      headers: { host, origin, 'content-type': 'application/json' }, body: '{}' }, 404);
    for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      await expectStatus({ path: '/api/about', method, headers: { host } }, 404);
    }
    await expectStatus({ path: '/api/about', headers: { host, 'content-type': 'application/json', 'content-length': '2' },
      body: '{}' }, 400);
    await expectStatus({ path: '/api/about', headers: { host, 'transfer-encoding': 'chunked' }, body: '{}' }, 400);
    assert.equal(reads.count, 0, 'refused requests never read the record');

    const admitted = await readAboutRoute(instance);
    assert.equal(admitted.status, 200, 'the exact companion request is admitted');
    assert.equal(admitted.text, aboutBody('main', 'main'));
    assert.equal(reads.count, 1);
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-gates');
    f.cleanup();
  }
});

test('074 About: Host, Origin and fetch-metadata guards apply without the opaque Review-origin exception', async t => {
  const f = aboutFixture();
  f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'main', installed_ref: 'main' });
  // A joined provider enables the opaque Review exception on this instance.
  const provider = /** @type {any} */ ({
    matchesRoot: (/** @type {string} */ candidate) => path.resolve(candidate) === path.resolve(f.root),
    subscribe: () => () => {},
  });
  const instance = await openAbout('about-guards', f.root, provider);
  const { host, origin, port } = new URL(instance.url);
  const reads = manifestReads(t, f.manifestPath);
  try {
    assert.equal(await rawStatus(instance.server, { path: '/review/engine.mjs', headers: { host, origin: 'null' } }), 200,
      'the opaque Review exception is live for its own static module');
    for (const headers of [
      { host, origin: 'null' },
      { host, origin: 'https://evil.example' },
      { host, origin: `http://127.0.0.1:${Number(port) + 1}` },
      { host, 'sec-fetch-site': 'cross-site' },
      { host, 'sec-fetch-site': 'same-site' },
      { host: 'evil.example.com' },
      { host: `localhost:${port}` },
      { host: `[::1]:${port}` },
    ]) {
      assert.equal(await rawStatus(instance.server, { path: '/api/about', headers }), 403, JSON.stringify(headers));
    }
    assert.equal(reads.count, 0, 'refused requests never read the record');
    assert.equal(await rawStatus(instance.server, { path: '/api/about', headers: { host, origin } }), 200,
      "the renderer's own origin is served");
    assert.equal(await rawStatus(instance.server, { path: '/api/about', headers: { host, 'sec-fetch-site': 'same-origin' } }),
      200, 'a same-origin read without Origin is served');
    assert.equal(reads.count, 2);
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-guards');
    f.cleanup();
  }
});

test('074 About: an unbound Canvas returns the fixed unavailable error', async () => {
  const instance = await openAbout('about-unbound', null);
  try {
    const unbound = await readAboutRoute(instance);
    assert.equal(unbound.status, 503);
    assert.equal(unbound.headers.get('cache-control'), 'no-store');
    assert.deepEqual(JSON.parse(unbound.text), ABOUT_ENDED);
  } finally {
    await closeInstance('about-unbound');
  }
});

test('074 About: a root replacement before delivery returns 409 and never the old record', async t => {
  const f = aboutFixture(), next = aboutFixture();
  f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v1.0.0' });
  next.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'main', installed_ref: 'main' });
  const instance = await openAbout('about-root-race', f.root);
  const reads = manifestReads(t, f.manifestPath, { hold: true });
  try {
    const pending = readAboutRoute(instance);
    await reads.reading;
    instance.readInput = { root: next.root };
    reads.release();
    const replaced = await pending;
    assert.equal(replaced.status, 409);
    assert.equal(replaced.headers.get('cache-control'), 'no-store');
    assert.deepEqual(JSON.parse(replaced.text),
      { error: 'identity_mismatch', message: 'The workspace changed. Open About again to read it.' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main'),
      'the next read uses only the current workspace');
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-root-race');
    f.cleanup();
    next.cleanup();
  }
});

test('074 About: a Canvas close during the read returns the fixed 503 and never the old record', async t => {
  const f = aboutFixture();
  f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v1.0.0' });
  const instance = await openAbout('about-close-race', f.root);
  const reads = manifestReads(t, f.manifestPath, { hold: true });
  try {
    // A non-pooled request, so close does not also wait on an idle keep-alive socket.
    const pending = new Promise((resolve, reject) => {
      const request = http.request(new URL('/api/about', instance.url), { agent: false }, response => {
        const chunks = /** @type {Buffer[]} */ ([]);
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
          text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', reject);
      request.end();
    });
    await reads.reading;
    const closing = closeInstance('about-close-race');
    reads.release();
    const ended = /** @type {{status: number, headers: import('node:http').IncomingHttpHeaders, text: string}} */ (await pending);
    assert.equal(ended.status, 503);
    assert.equal(ended.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(ended.text), ABOUT_ENDED);
    assert.equal(await closing, true);
    assert.equal(instance.server.listening, false);
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-close-race');
    f.cleanup();
  }
});

test('074 About: a client abort during the read sends nothing and the next read is fresh', async t => {
  const f = aboutFixture();
  f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v1.0.0' });
  const instance = await openAbout('about-client-abort', f.root);
  /** @type {import('node:http').ServerResponse[]} */
  const responses = [];
  instance.server.on('request', (req, res) => { if (req.url === '/api/about') responses.push(res); });
  const reads = manifestReads(t, f.manifestPath, { hold: true });
  try {
    const controller = new AbortController();
    const pending = readAboutRoute(instance, { signal: controller.signal }).then(() => null, error => error);
    await reads.reading;
    const disconnected = new Promise(resolve => responses[0].once('close', () => resolve(undefined)));
    controller.abort();
    assert.equal((await pending)?.cause?.name, 'AbortError');
    await disconnected;
    reads.release();
    // The held read resumes in microtasks; one macrotask later its route has finished.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(responses[0].headersSent, false, 'the discarded read wrote no response');
    f.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'main', installed_ref: 'main' });
    t.mock.restoreAll();
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main'));
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-client-abort');
    f.cleanup();
  }
});

test('074 About: reading it starts no process, opens no outside connection and writes nothing', async t => {
  const f = aboutFixture(), empty = aboutFixture();
  // The recorded source is never contacted.
  f.write({ source_repo: 'https://example.invalid/never-contacted.git', source_ref: 'latest', installed_ref: 'v1.2.3' });
  fs.rmSync(path.join(empty.root, '.dude'), { recursive: true });
  const instance = await openAbout('about-effects', f.root);
  const unavailable = await openAbout('about-effects-empty', empty.root);
  const before = { recorded: snapshotFiles(f.temporary), empty: snapshotFiles(empty.temporary) };
  const spawns = t.mock.method(childProcess.ChildProcess.prototype, 'spawn');
  const syncLaunches = ['spawnSync', 'execSync', 'execFileSync'].map(name => t.mock.method(childProcess, name));
  syncBuiltinESMExports();
  const connects = t.mock.method(net.Socket.prototype, 'connect');
  const launches = () => spawns.mock.callCount() + syncLaunches.reduce((sum, spy) => sum + spy.mock.callCount(), 0);
  try {
    const texts = [];
    for (let entry = 0; entry < 3; entry += 1) {
      texts.push((await readAboutRoute(instance)).text, (await readAboutRoute(unavailable)).text);
    }
    assert.deepEqual(texts, Array.from({ length: 3 }, () => [aboutBody('v1.2.3', 'latest'), ABOUT_NULLS]).flat());
    assert.equal(launches(), 0, 'About starts no command or process');
    const targets = connects.mock.calls.map(({ arguments: args }) => {
      const options = Array.isArray(args[0]) ? args[0][0] : args[0];
      return options && typeof options === 'object' ? `${options.host}:${options.port}` : `${args[1]}:${options}`;
    });
    assert.ok(targets.length > 0, "the socket spy observed this test's own requests");
    assert.deepEqual([...new Set(targets)].sort(),
      [new URL(instance.url).host, new URL(unavailable.url).host].sort(), 'only the Canvas loopback servers were contacted');
    assert.deepEqual(snapshotFiles(f.temporary), before.recorded);
    assert.deepEqual(snapshotFiles(empty.temporary), before.empty, 'a missing record is not created');

    // Sensitivity: the same spies record real launches.
    childProcess.execFileSync(process.execPath, ['-e', '']);
    await new Promise((resolve, reject) => childProcess.execFile(process.execPath, ['-e', ''],
      error => (error ? reject(error) : resolve(undefined))));
    assert.equal(syncLaunches[2].mock.callCount(), 1);
    assert.equal(spawns.mock.callCount(), 1);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await closeInstance('about-effects');
    await closeInstance('about-effects-empty');
    f.cleanup();
    empty.cleanup();
  }
});

test('074 About: an invalid caller argument is surfaced, not reported as an unavailable record', async () => {
  await assert.rejects(readInstallationRecord(/** @type {any} */ (undefined)), TypeError);
});

test('074 About: the record adapter has no process, network, timer, write, catalog, Compose or upgrade dependency', () => {
  const entry = fileURLToPath(new URL('./lib/about.mjs', import.meta.url));
  /** @type {Map<string, {source: string, specifiers: string[]}>} */
  const graph = new Map();
  /** @param {string} file */
  const visit = file => {
    if (graph.has(file)) return;
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/^import\s(?:[^;]*?\sfrom\s)?'([^']+)';/gm)].map(match => match[1]);
    graph.set(file, { source, specifiers });
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) visit(path.resolve(path.dirname(file), specifier));
    }
  };
  visit(entry);
  const modules = [...graph.keys()].map(file => path.relative(path.resolve(EXTENSION_SOURCE_ROOT, '../..'), file)
    .replace(/\\/g, '/'));
  for (const reused of ['skills/dude-engine/lib/profile.mjs', 'skills/dude-engine/lib/workspace-paths.mjs',
    'skills/dude-engine/lib/development-base-release.mjs']) {
    assert.ok(modules.includes(reused), `About reuses ${reused}`);
  }
  assert.deepEqual(modules.filter(file => /dude-compose|dude-bundle-upgrade|release-channel|packs\.mjs|catalog-reader|projection\.mjs|needs-you\.mjs|review\.mjs/.test(file)), []);
  const specifiers = [...graph.values()].flatMap(module => module.specifiers);
  assert.deepEqual(specifiers.filter(specifier => /^(?:node:)?(?:child_process|cluster|dgram|dns|http|http2|https|inspector|net|tls|worker_threads)(?:\/|$)/.test(specifier)), []);
  const own = /** @type {{source: string}} */ (graph.get(entry)).source;
  assert.deepEqual(own.match(/\b(?:import|require|fetch)\s*\(|\bprocess\.|\bset(?:Timeout|Interval|Immediate)\s*\(|\.(?:write|append|mkdir|mkdtemp|rm|rename|unlink|copy|cp|symlink|link|chmod|chown|utimes|truncate|open|watch)\w*\s*\(/g), null);
});

const BASE_RECORD = Object.freeze({ source_repo: ABOUT_REPOSITORY, base_release: 'v1.3.0' });
const DEVELOPMENT_MANIFEST = Object.freeze({ source_repo: ABOUT_REPOSITORY, source_ref: 'main', installed_ref: 'main' });

/**
 * Count the actual reads of the two fixed About files, and of anything else,
 * through the one promise read the adapter uses.
 * @param {import('node:test').TestContext} t @param {{manifestPath: string, recordPath: string}} f
 */
function aboutFileReads(t, f) {
  const readFile = fs.promises.readFile;
  const counts = { manifest: 0, record: 0, other: /** @type {string[]} */ ([]) };
  t.mock.method(fs.promises, 'readFile', /** @this {any} */ async function (file, ...rest) {
    const resolved = path.resolve(String(file));
    if (resolved === f.manifestPath) counts.manifest += 1;
    else if (resolved === f.recordPath) counts.record += 1;
    else counts.other.push(resolved);
    return readFile.call(this, file, ...rest);
  });
  return counts;
}

test('075 About: a development install returns its recorded base only for the exact manifest source', async () => {
  const f = aboutFixture();
  const instance = await openAbout('about-base-source', f.root);
  try {
    f.write(DEVELOPMENT_MANIFEST);
    f.writeRecord(BASE_RECORD);
    const known = await readAboutRoute(instance);
    assert.equal(known.status, 200);
    assert.equal(known.headers.get('cache-control'), 'no-store');
    assert.equal(known.text, aboutBody('main', 'main', 'v1.3.0'), 'exactly three values, the base as recorded');

    // Every read is fresh: a replaced or removed record is reflected at once.
    f.writeRecord({ ...BASE_RECORD, base_release: 'v1.4.12' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main', 'v1.4.12'));
    fs.rmSync(f.recordPath);
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main'),
      'no record is an unknown base, not an unavailable installation');
    assert.equal(fs.existsSync(f.recordPath), false, 'a missing record is never created');

    // Association is the exact recorded string: no normalization or aliasing.
    for (const source of [`${ABOUT_REPOSITORY}/`, ABOUT_REPOSITORY.toLowerCase(), `${ABOUT_REPOSITORY}.git`,
      ` ${ABOUT_REPOSITORY}`, `${ABOUT_REPOSITORY} `, 'https://github.com/E-G-C/other', 'git@github.com:E-G-C/dude.git']) {
      f.writeRecord({ ...BASE_RECORD, source_repo: source });
      const { status, text } = await readAboutRoute(instance);
      assert.equal(status, 200, source);
      assert.equal(text, aboutBody('main', 'main'), `a record for ${JSON.stringify(source)} is not this install's base`);
    }

    // A local-source override associates by the same exact string, and the
    // source itself never leaves the adapter, even when it looks like a secret.
    const privateSource = 'https://secret-token@example.invalid/private.git';
    f.write({ ...DEVELOPMENT_MANIFEST, source_repo: privateSource });
    f.writeRecord({ source_repo: privateSource, base_release: 'v1.3.0' });
    const associated = await readAboutRoute(instance);
    assert.equal(associated.text, aboutBody('main', 'main', 'v1.3.0'));
    assert.equal(/secret-token|example\.invalid|private\.git/.test(associated.text), false);
    assert.equal(associated.text.includes(f.root), false);
    f.write({ ...DEVELOPMENT_MANIFEST, source_repo: '../dude-source' });
    f.writeRecord({ source_repo: '../dude-source', base_release: 'v2.0.1' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main', 'v2.0.1'));
    f.writeRecord(BASE_RECORD);
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main'),
      'the default repository record does not belong to an overridden source');

    // The supplement depends only on the installed development ref; the
    // channel stays its own independently validated value.
    f.write({ source_repo: ABOUT_REPOSITORY, installed_ref: 'main' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', null, 'v1.3.0'));
    f.write({ ...DEVELOPMENT_MANIFEST, source_ref: 'latest' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'latest', 'v1.3.0'));
    f.write({ ...DEVELOPMENT_MANIFEST, source_ref: 'https://evil.example/ref' });
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', null, 'v1.3.0'));
  } finally {
    await closeInstance('about-base-source');
    f.cleanup();
  }
});

test('075 About: only an installed development ref reads the record, and at most two fixed files are read', async t => {
  const f = aboutFixture();
  f.writeRecord(BASE_RECORD);
  const instance = await openAbout('about-base-scope', f.root);
  const reads = aboutFileReads(t, f);
  /** @param {string | Buffer | null} manifest @param {string} expected @param {number} records @param {string} label */
  const expectRead = async (manifest, expected, records, label) => {
    if (manifest === null) fs.rmSync(f.manifestPath, { force: true });
    else f.writeRaw(manifest);
    const before = { manifest: reads.manifest, record: reads.record };
    const { status, text } = await readAboutRoute(instance);
    assert.equal(status, 200, label);
    assert.equal(text, expected, label);
    assert.equal(reads.manifest - before.manifest, manifest === null ? 0 : 1, `${label}: one manifest read`);
    assert.equal(reads.record - before.record, records, `${label}: record reads`);
  };
  try {
    await expectRead(f.documentFor(DEVELOPMENT_MANIFEST), aboutBody('main', 'main', 'v1.3.0'), 1, 'development');
    // A release, another ref, or no usable installed ref never reads or shows a base.
    for (const [installed, source, shown] of [
      ['v1.3.0', 'latest', 'v1.3.0'], ['v1.3.0', 'v1.3.0', 'v1.3.0'], ['latest', 'latest', 'latest'],
      ['feature/about', 'main', 'feature/about'], ['main.lock', 'main', null], ['Main', 'main', 'Main'],
    ]) {
      await expectRead(f.documentFor({ source_repo: ABOUT_REPOSITORY, source_ref: source, installed_ref: installed }),
        aboutBody(shown, source), 0, `installed ${installed}`);
    }
    await expectRead(f.documentFor({ source_repo: ABOUT_REPOSITORY, source_ref: 'main' }), aboutBody(null, 'main'), 0,
      'no installed ref');
    // An unavailable manifest is unavailable as a whole; the record cannot rescue it.
    await expectRead(null, ABOUT_NULLS, 0, 'missing manifest');
    await expectRead('# Bundle Manifest\n\n```json\n{"installed_ref": "main",\n```\n', ABOUT_NULLS, 0, 'malformed manifest');
    await expectRead(f.documentFor({ source_ref: 'main', installed_ref: 'main' }), ABOUT_NULLS, 0, 'unprovenanced manifest');
    await expectRead(f.documentFor({ ...DEVELOPMENT_MANIFEST, base_release: 'v1.3.0' }), ABOUT_NULLS, 0,
      'a manifest cannot carry the base itself');
    await expectRead(f.documentFor(DEVELOPMENT_MANIFEST), aboutBody('main', 'main', 'v1.3.0'), 1, 'restored development');
    assert.deepEqual(reads.other, [], 'About reads no file other than its two fixed records');
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-base-scope');
    f.cleanup();
  }
});

test('075 About: malformed, extra, non-stable, multi-payload, non-UTF-8 and non-file records null only the base', async () => {
  const f = aboutFixture();
  const payload = JSON.stringify(BASE_RECORD, null, 2);
  /** @param {string} body */
  const fenced = body => `# Development Base Release\n\n\`\`\`json\n${body}\n\`\`\`\n`;
  const cases = [
    ['an empty file', ''],
    ['no JSON fence', '# Development Base Release\n\nbase_release: v1.3.0\n'],
    ['a non-JSON fence', `# Development Base Release\n\n\`\`\`js\n${payload}\n\`\`\`\n`],
    ['malformed JSON', fenced(`${payload.slice(0, -2)},\n}`)],
    ['two identical valid JSON fences', `${fenced(payload)}\n${fenced(payload)}`],
    ['a JSON array', f.recordDocumentFor([BASE_RECORD])],
    ['a JSON string', f.recordDocumentFor('v1.3.0')],
    ['JSON null', f.recordDocumentFor(null)],
    ['an extra field', f.recordDocumentFor({ ...BASE_RECORD, recorded_at: '2026-09-26' })],
    ['a response-shaped field', f.recordDocumentFor({ ...BASE_RECORD, baseRelease: 'v1.3.0' })],
    ['an own __proto__ field', fenced(`{"__proto__":{},${payload.slice(1)}`)],
    ['no base_release', f.recordDocumentFor({ source_repo: ABOUT_REPOSITORY })],
    ['no source_repo', f.recordDocumentFor({ base_release: 'v1.3.0' })],
    ['an empty source_repo', f.recordDocumentFor({ ...BASE_RECORD, source_repo: '' })],
    ['a blank source_repo', f.recordDocumentFor({ ...BASE_RECORD, source_repo: ' \t\n' })],
    ['a numeric source_repo', f.recordDocumentFor({ ...BASE_RECORD, source_repo: 42 })],
    ...['v1.3.0-rc.1', 'v1.3.0+build.7', 'latest', 'main', '1.3.0', 'v1.3', 'V1.3.0', ' v1.3.0', 'v1.3.0\n', '',
      'https://github.com/E-G-C/dude/releases/tag/v1.3.0']
      .map(base => [`a non-stable base ${JSON.stringify(base)}`, f.recordDocumentFor({ ...BASE_RECORD, base_release: base })]),
    ['a numeric base', f.recordDocumentFor({ ...BASE_RECORD, base_release: 130 })],
    ['a null base', f.recordDocumentFor({ ...BASE_RECORD, base_release: null })],
    ['invalid UTF-8 outside the payload', Buffer.concat([
      Buffer.from('# Development Base Release '), Buffer.from([0xff]), Buffer.from(`\n\n\`\`\`json\n${payload}\n\`\`\`\n`)])],
    ['invalid UTF-8 inside the payload', Buffer.concat([
      Buffer.from(`# Development Base Release\n\n\`\`\`json\n{"source_repo":"${ABOUT_REPOSITORY}`), Buffer.from([0xc3, 0x28]),
      Buffer.from('","base_release":"v1.3.0"}\n```\n')])],
  ];
  const instance = await openAbout('about-base-invalid', f.root);
  try {
    f.write(DEVELOPMENT_MANIFEST);
    f.writeRecordRaw(fenced(payload));
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main', 'v1.3.0'), 'the valid control is usable');
    for (const [label, document] of cases) {
      f.writeRecordRaw(document);
      const { status, text } = await readAboutRoute(instance);
      assert.equal(status, 200, label);
      assert.equal(text, aboutBody('main', 'main'), `${label} keeps both usable refs and shows no base`);
    }
    fs.rmSync(f.recordPath);
    fs.mkdirSync(f.recordPath);
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main'), 'a directory is not a record');
    fs.rmSync(f.recordPath, { recursive: true });
    f.writeRecord(BASE_RECORD);
    assert.equal((await readAboutRoute(instance)).text, aboutBody('main', 'main', 'v1.3.0'), 'a corrected record reads at once');
  } finally {
    await closeInstance('about-base-invalid');
    f.cleanup();
  }
});

test('075 About: linked, special and unreadable records are never followed or disclosed and keep usable refs', async t => {
  const f = aboutFixture();
  const outside = path.join(f.temporary, 'outside');
  fs.mkdirSync(outside);
  f.write(DEVELOPMENT_MANIFEST);
  f.writeRecord(BASE_RECORD);
  const instance = await openAbout('about-base-linked', f.root);
  const known = aboutBody('main', 'main', 'v1.3.0'), unknown = aboutBody('main', 'main');
  try {
    assert.equal((await readAboutRoute(instance)).text, known, 'the real record is valid');

    const outsideRecord = path.join(outside, 'development-base-release.md');
    fs.renameSync(f.recordPath, outsideRecord);
    fs.symlinkSync(outsideRecord, f.recordPath, 'file');
    assert.equal(fs.readFileSync(f.recordPath, 'utf8'), renderDevelopmentBaseRelease(BASE_RECORD));
    assert.equal((await readAboutRoute(instance)).text, unknown, 'a linked record outside the workspace');
    fs.unlinkSync(f.recordPath);
    fs.renameSync(outsideRecord, f.recordPath);
    assert.equal((await readAboutRoute(instance)).text, known, 'the restored real record is valid');

    const readFile = fs.promises.readFile;
    let denied = 0;
    const unreadable = t.mock.method(fs.promises, 'readFile', /** @this {any} */ async function (file, ...rest) {
      if (path.resolve(String(file)) !== f.recordPath) return readFile.call(this, file, ...rest);
      denied += 1;
      throw Object.assign(new Error(`EACCES: permission denied, open '${file}'`),
        { code: 'EACCES', errno: -13, syscall: 'open', path: String(file) });
    });
    const refused = await readAboutRoute(instance);
    assert.equal(denied, 1, 'the refusal came from the actual record read');
    assert.equal(refused.status, 200);
    assert.equal(refused.text, unknown, 'no error code, message or path is returned, and the refs remain');
    unreadable.mock.restore();
    assert.equal((await readAboutRoute(instance)).text, known);

    // A FIFO, socket or device where the record belongs is refused before any open.
    const lstatSync = fs.lstatSync;
    const special = t.mock.method(fs, 'lstatSync', /** @this {any} */ function (file, ...rest) {
      const stat = lstatSync.call(this, file, ...rest);
      if (path.resolve(String(file)) !== f.recordPath) return stat;
      return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { isFile: () => false, isFIFO: () => true });
    });
    const opened = manifestReads(t, f.recordPath);
    assert.equal((await readAboutRoute(instance)).text, unknown, 'a special non-file record');
    assert.equal(opened.count, 0, 'a non-file record is never read');
    special.mock.restore();
    assert.equal((await readAboutRoute(instance)).text, known);
    assert.equal(opened.count, 1);
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-base-linked');
    f.cleanup();
  }
});

test('075 About: a root replacement or Canvas close during the record read never delivers the old base', async t => {
  const f = aboutFixture(), next = aboutFixture();
  f.write(DEVELOPMENT_MANIFEST);
  f.writeRecord(BASE_RECORD);
  next.write({ source_repo: ABOUT_REPOSITORY, source_ref: 'latest', installed_ref: 'v1.4.0' });
  const instance = await openAbout('about-base-race', f.root);
  const closing = await openAbout('about-base-close-race', f.root);
  try {
    const replacement = manifestReads(t, f.recordPath, { hold: true });
    const pending = readAboutRoute(instance);
    await replacement.reading;
    instance.readInput = { root: next.root };
    replacement.release();
    const replaced = await pending;
    assert.equal(replaced.status, 409);
    assert.equal(replaced.headers.get('cache-control'), 'no-store');
    assert.deepEqual(JSON.parse(replaced.text),
      { error: 'identity_mismatch', message: 'The workspace changed. Open About again to read it.' });
    t.mock.restoreAll();
    assert.equal((await readAboutRoute(instance)).text, aboutBody('v1.4.0', 'latest'),
      'the next read uses only the current workspace');

    const held = manifestReads(t, f.recordPath, { hold: true });
    // A non-pooled request, so close does not also wait on an idle keep-alive socket.
    const ending = new Promise((resolve, reject) => {
      const request = http.request(new URL('/api/about', closing.url), { agent: false }, response => {
        const chunks = /** @type {Buffer[]} */ ([]);
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', reject);
      request.end();
    });
    await held.reading;
    const closed = closeInstance('about-base-close-race');
    held.release();
    const ended = /** @type {{status: number, text: string}} */ (await ending);
    assert.equal(ended.status, 503);
    assert.deepEqual(JSON.parse(ended.text), ABOUT_ENDED);
    assert.equal(await closed, true);
  } finally {
    t.mock.restoreAll();
    await closeInstance('about-base-race');
    await closeInstance('about-base-close-race');
    f.cleanup();
    next.cleanup();
  }
});

test('075 About: reading a recorded base starts no process, opens no outside connection and writes nothing', async t => {
  const f = aboutFixture();
  // Neither recorded source is ever contacted.
  f.write({ ...DEVELOPMENT_MANIFEST, source_repo: 'https://example.invalid/never-contacted.git' });
  f.writeRecord({ source_repo: 'https://example.invalid/never-contacted.git', base_release: 'v1.3.0' });
  const instance = await openAbout('about-base-effects', f.root);
  const before = snapshotFiles(f.temporary);
  const spawns = t.mock.method(childProcess.ChildProcess.prototype, 'spawn');
  const syncLaunches = ['spawnSync', 'execSync', 'execFileSync'].map(name => t.mock.method(childProcess, name));
  syncBuiltinESMExports();
  const connects = t.mock.method(net.Socket.prototype, 'connect');
  try {
    const texts = [];
    for (let entry = 0; entry < 3; entry += 1) texts.push((await readAboutRoute(instance)).text);
    assert.deepEqual(texts, Array.from({ length: 3 }, () => aboutBody('main', 'main', 'v1.3.0')));
    assert.equal(spawns.mock.callCount() + syncLaunches.reduce((sum, spy) => sum + spy.mock.callCount(), 0), 0,
      'About starts no command, Git lookup or process');
    const targets = connects.mock.calls.map(({ arguments: args }) => {
      const options = Array.isArray(args[0]) ? args[0][0] : args[0];
      return options && typeof options === 'object' ? `${options.host}:${options.port}` : `${args[1]}:${options}`;
    });
    assert.ok(targets.length > 0, "the socket spy observed this test's own requests");
    assert.deepEqual([...new Set(targets)], [new URL(instance.url).host], 'only the Canvas loopback server was contacted');
    assert.deepEqual(snapshotFiles(f.temporary), before, 'no record, manifest or other file is written');
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await closeInstance('about-base-effects');
    f.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 073 T003: the project agents and skills read inside the coalesced packs read.
// ---------------------------------------------------------------------------

const DIRECTORY_LINK = process.platform === 'win32' ? 'junction' : 'dir';

/** File symlinks need a privilege on some Windows hosts; junctions and directory links need none. */
const FILE_SYMLINKS = (() => {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-link-probe-'));
  try {
    fs.writeFileSync(path.join(probe, 'target'), 'x');
    fs.symlinkSync(path.join(probe, 'target'), path.join(probe, 'link'), 'file');
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) return false;
    throw error;
  } finally { fs.rmSync(probe, { recursive: true, force: true }); }
})();
const NO_FILE_SYMLINKS = FILE_SYMLINKS ? false : 'file symlinks need a privilege on this host; the case runs where they are allowed';

const EMPTY_PROJECT = Object.freeze({ coverage: { state: 'empty', reason: null, message: null }, items: [] });
const LINKED_NOT_READ = 'Linked; not read';
/** The words an unavailable project description opens with; the specific reason follows. */
const DESCRIPTION_UNAVAILABLE = 'Description unavailable';
/** @param {string} reason @param {string} message */
const descriptionUnavailable = (reason, message) => ({ state: 'unavailable', reason, message: `${DESCRIPTION_UNAVAILABLE}: ${message}` });

/** The frontmatter shape the importers write: JSON-quoted scalars. @param {string} name @param {string} description */
const markdownFor = (name, description) =>
  `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`;

/** One block of frontmatter lines. @param {string[]} lines */
const frontmatterOf = lines => `---\n${lines.join('\n')}\n---\n\nBody.\n`;

/**
 * A pack workspace (empty profile, one catalog pack) whose `put` writes the
 * files the project read lists. Paths stay short for Windows.
 */
function projectFixture() {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  /** @param {string} relative @param {string | Buffer} [content] */
  const put = (relative, content = 'x\n') => {
    const target = path.join(fixture.root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  return { ...fixture, put };
}

/** Everything a packs read says about packs: not its clock, not the project projection. @param {any} body */
const packAuthority = ({ readAt, project, ...authority }) => authority;

/** @param {{url: string}} instance @param {string} [route] the plain automatic read, or the explicit discovery */
async function readPacksRoute(instance, route = '/api/packs') {
  const response = await call(instance.url, { path: route });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}

/** @param {string} value */
const readField = value => ({ state: 'read', value });
/** @param {string[]} paths */
const completeFiles = paths => ({ state: 'complete', count: paths.length, paths, notRead: [], reason: null, message: null });

/**
 * One expected row. `location` follows the type: an agent's entrypoint file,
 * or a skill's folder.
 * @param {'agent' | 'skill'} type @param {string} name
 * @param {{ description: unknown, declaredName: unknown, files: unknown }} parts
 */
function projectRow(type, name, { description, declaredName, files }) {
  return { key: `project:${type}:${name}`, type, name,
    location: type === 'agent' ? `.github/agents/${name}.agent.md` : `.github/skills/${name}`,
    description, declaredName, files };
}

/** A field's stable part: its text, or its reason. @param {any} value */
const summarize = value => (value.state === 'read' ? { value: value.value } : { reason: value.reason });

/**
 * Record every path the scan hands to the filesystem, through the same
 * default-export methods production calls. `realpathSync` keeps its `native`
 * companion so nothing else in the process loses it.
 * @param {import('node:test').TestContext} t
 */
function recordFsPaths(t) {
  /** @type {Record<string, string[]>} */
  const seen = { lstat: [], open: [], opendir: [], readdir: [], lstatSync: [], realpathSync: [] };
  for (const [owner, name] of /** @type {Array<[any, string]>} */ ([
    [fs.promises, 'lstat'], [fs.promises, 'open'], [fs.promises, 'opendir'], [fs.promises, 'readdir'],
    [fs, 'lstatSync'], [fs, 'realpathSync'],
  ])) {
    const original = owner[name];
    t.mock.method(owner, name, /** @this {any} */ function (file, ...rest) {
      seen[name].push(path.resolve(String(file)));
      return original.call(this, file, ...rest);
    });
    if (name === 'realpathSync') owner[name].native = original.native;
  }
  return seen;
}

test('T003 project rows list imported, hand-made and same-name artifacts in exact order beside untouched pack authority', async t => {
  const f = projectFixture();
  const instance = await openInstance('project-rows', () => {}, { complete: true }, { root: f.root });
  try {
    const baseline = await readPacksRoute(instance);
    assert.deepEqual(baseline.project, EMPTY_PROJECT);
    // A focused skill import, a focused agent import with its companion, and a
    // directory import of an agent and a same-named skill with nested files.
    f.put('.github/skills/dude-local-focused/SKILL.md', markdownFor('dude-local-focused', 'Focused skill import.'));
    f.put('.github/skills/dude-local-focused/LICENSE', 'MIT\n');
    f.put('.github/agents/dude-local-helper.agent.md', markdownFor('Helper', 'Focused agent import.'));
    f.put('.github/agents/dude-local-helper.support/NOTICE');
    f.put('.github/agents/dude-local-suite.agent.md', markdownFor('Suite agent', 'Directory import agent.'));
    f.put('.github/agents/dude-local-suite.support/NOTICE');
    f.put('.github/agents/dude-local-suite.support/notes/guide.md');
    f.put('.github/skills/dude-local-suite/SKILL.md', markdownFor('declared-elsewhere', 'Directory import skill.'));
    f.put('.github/skills/dude-local-suite/LICENSE');
    f.put('.github/skills/dude-local-suite/refs/deep/file.md');
    // Hand-made: plain unquoted scalars, and an agent that declares no name.
    f.put('.github/skills/dude-local-hand/SKILL.md', frontmatterOf(['name: hand made', 'description: Hand made, unquoted text']));
    f.put('.github/agents/dude-local-note.agent.md', frontmatterOf(['description: Plain note']));
    // Lookalikes that are pack-owned, core, project-tier, wrongly spelled, or the wrong kind.
    const excluded = ['.github/agents/dude-pack-alpha-worker.agent.md', '.github/agents/dude-core.agent.md',
      '.github/agents/other.agent.md', '.github/agents/dude-localx.agent.md', '.github/agents/Dude-Local-Case.agent.md',
      '.github/agents/dude-local-orphan.support/NOTICE', '.github/agents/dude-local-plain.md',
      '.github/skills/dude-pack-alpha-helper/SKILL.md', '.github/skills/dude-foo/SKILL.md',
      '.github/skills/project/SKILL.md', '.github/skills/dude-localx/SKILL.md'];
    for (const file of excluded) f.put(file);
    f.put('.github/skills/dude-local-file');
    fs.mkdirSync(path.join(f.root, '.github/agents/dude-local-dir.agent.md'));
    const before = snapshotFiles(f.root);

    const seen = recordFsPaths(t);
    const after = await readPacksRoute(instance);
    t.mock.restoreAll();
    const row = (type, name, parts) => projectRow(/** @type {any} */ (type), name, parts);
    assert.deepEqual(after.project, {
      coverage: { state: 'current', reason: null, message: null },
      items: [
        row('skill', 'dude-local-focused', { description: readField('Focused skill import.'),
          declaredName: readField('dude-local-focused'),
          files: completeFiles(['.github/skills/dude-local-focused/LICENSE', '.github/skills/dude-local-focused/SKILL.md']) }),
        row('skill', 'dude-local-hand', { description: readField('Hand made, unquoted text'), declaredName: readField('hand made'),
          files: completeFiles(['.github/skills/dude-local-hand/SKILL.md']) }),
        row('agent', 'dude-local-helper', { description: readField('Focused agent import.'), declaredName: readField('Helper'),
          files: completeFiles(['.github/agents/dude-local-helper.agent.md', '.github/agents/dude-local-helper.support/NOTICE']) }),
        row('agent', 'dude-local-note', { description: readField('Plain note'),
          declaredName: { state: 'unavailable', reason: 'missing', message: 'The frontmatter does not declare a name.' },
          files: completeFiles(['.github/agents/dude-local-note.agent.md']) }),
        row('agent', 'dude-local-suite', { description: readField('Directory import agent.'), declaredName: readField('Suite agent'),
          files: completeFiles(['.github/agents/dude-local-suite.agent.md', '.github/agents/dude-local-suite.support/NOTICE',
            '.github/agents/dude-local-suite.support/notes/guide.md']) }),
        row('skill', 'dude-local-suite', { description: readField('Directory import skill.'), declaredName: readField('declared-elsewhere'),
          files: completeFiles(['.github/skills/dude-local-suite/LICENSE', '.github/skills/dude-local-suite/SKILL.md',
            '.github/skills/dude-local-suite/refs/deep/file.md']) }),
      ],
    }, 'the exact rows, keys, path-identity names, order (name, then agent before skill) and files');
    assert.deepEqual(packAuthority(after), packAuthority(baseline),
      'project artifacts change no pack membership, Available row, revision or coverage');
    assert.deepEqual(snapshotFiles(f.root), before, 'a project read writes nothing');

    // A pack-owned, core or project-tier entry is never inspected, and an orphan
    // companion folder is not an agent. Only local-named entries are examined.
    const skipped = new Set(['dude-pack-alpha-worker.agent.md', 'dude-core.agent.md', 'other.agent.md', 'dude-localx.agent.md',
      'dude-localx', 'Dude-Local-Case.agent.md', 'dude-local-orphan.support', 'dude-local-plain.md', 'dude-pack-alpha-helper',
      'dude-foo', 'project']);
    const github = `${path.sep}.github${path.sep}`;
    const inspected = Object.values(seen).flat().filter(file => file.includes(github));
    assert.ok(inspected.some(file => file.endsWith(`${path.sep}dude-local-suite`)), 'the spy observed the scan itself');
    for (const file of inspected) {
      assert.deepEqual(file.split(path.sep).filter(segment => skipped.has(segment)), [], `${file} is not a local entry`);
    }
  } finally {
    t.mock.restoreAll();
    await closeInstance('project-rows');
    f.cleanup();
  }
});

test('T003 a missing folder, an empty folder and no matching entry are a known-empty project read', async () => {
  const f = projectFixture();
  const instance = await openInstance('project-empty', () => {}, { complete: true }, { root: f.root });
  try {
    assert.deepEqual((await readPacksRoute(instance, DISCOVER)).project, EMPTY_PROJECT, 'no .github folder at all');
    fs.mkdirSync(path.join(f.root, '.github/agents'), { recursive: true });
    assert.deepEqual((await readPacksRoute(instance, DISCOVER)).project, EMPTY_PROJECT, 'an empty agents folder and no skills folder');
    fs.mkdirSync(path.join(f.root, '.github/skills'));
    assert.deepEqual((await readPacksRoute(instance, DISCOVER)).project, EMPTY_PROJECT, 'both folders empty');
    for (const file of ['.github/agents/dude-pack-alpha-worker.agent.md', '.github/agents/dude.agent.md',
      '.github/skills/dude-pack-alpha-helper/SKILL.md', '.github/skills/dude-compose/SKILL.md', '.github/skills/project/SKILL.md']) {
      f.put(file);
    }
    const body = await readPacksRoute(instance, DISCOVER);
    assert.deepEqual(body.project, EMPTY_PROJECT, 'pack-owned, core and project-tier entries are not project rows');
    assert.equal(body.coverage.installed.state, 'empty');
    assert.equal(body.coverage.catalog.state, 'current');
    f.put('.github/agents/dude-local-only.agent.md', markdownFor('Only', 'The only one.'));
    fs.rmSync(path.join(f.root, '.github/skills'), { recursive: true });
    const single = (await readPacksRoute(instance, DISCOVER)).project;
    assert.equal(single.coverage.state, 'current', 'a missing skills folder does not make the read unavailable');
    assert.deepEqual(single.items.map(item => item.key), ['project:agent:dude-local-only']);
  } finally {
    await closeInstance('project-empty');
    f.cleanup();
  }
});

test('T003 each unusable description or declared name is Description unavailable with its own specific reason', async () => {
  const f = projectFixture();
  const instance = await openInstance('project-reasons', () => {}, { complete: true }, { root: f.root });
  /** Each case differs from a usable file by one defect. [label, bytes, description, declaredName] */
  const cases = /** @type {Array<[string, string | Buffer, object, object]>} */ ([
    ['ok', frontmatterOf(['name: "n-ok"', 'description: "Fine text"']), { value: 'Fine text' }, { value: 'n-ok' }],
    ['unquoted', frontmatterOf(['name: plain name', 'description: Plain unquoted text']), { value: 'Plain unquoted text' }, { value: 'plain name' }],
    ['single-quoted', frontmatterOf(["name: 'q'", "description: 'Single quoted'"]), { value: 'Single quoted' }, { value: 'q' }],
    ['crlf', '---\r\nname: x\r\ndescription: crlf text\r\n---\r\nBody', { value: 'crlf text' }, { value: 'x' }],
    ['other-list', frontmatterOf(['name: x', 'description: d', 'tools:', '  - read', '  - search']), { value: 'd' }, { value: 'x' }],
    ['declared-differs', frontmatterOf(['name: "totally-different"', 'description: d']), { value: 'd' }, { value: 'totally-different' }],
    ['bom', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(frontmatterOf(['name: x', 'description: d']))]),
      { reason: 'bom' }, { reason: 'bom' }],
    ['utf8', Buffer.concat([Buffer.from('---\nname: x\ndescription: "'), Buffer.from([0xc3, 0x28]), Buffer.from('"\n---\n')]),
      { reason: 'invalid_utf8' }, { reason: 'invalid_utf8' }],
    ['no-frontmatter', '# Just a heading\n', { reason: 'frontmatter_missing' }, { reason: 'frontmatter_missing' }],
    ['empty-file', '', { reason: 'frontmatter_missing' }, { reason: 'frontmatter_missing' }],
    ['blank-first', '\n---\nname: x\ndescription: d\n---\n', { reason: 'frontmatter_missing' }, { reason: 'frontmatter_missing' }],
    ['unclosed', '---\nname: x\ndescription: d\n', { reason: 'closing_delimiter_missing' }, { reason: 'closing_delimiter_missing' }],
    ['spaced-close', '---\nname: x\ndescription: d\n--- \nBody\n', { reason: 'closing_delimiter_missing' }, { reason: 'closing_delimiter_missing' }],
    ['duplicate', frontmatterOf(['name: x', 'description: a', 'description: b']), { reason: 'duplicate_key' }, { reason: 'duplicate_key' }],
    ['duplicate-other', frontmatterOf(['name: x', 'description: a', 'tools: a', 'tools: b']), { reason: 'duplicate_key' }, { reason: 'duplicate_key' }],
    ['unmatched-quote', frontmatterOf(['name: x', 'description: He said "hi"']), { reason: 'malformed_quote' }, { reason: 'malformed_quote' }],
    ['folded', frontmatterOf(['name: x', 'description: >-', '  folded', '  text']), { reason: 'block_scalar' }, { value: 'x' }],
    ['literal', frontmatterOf(['name: x', 'description: |', '  literal']), { reason: 'block_scalar' }, { value: 'x' }],
    ['continued', frontmatterOf(['name: x', 'description: first', '  second']), { reason: 'multiline' }, { value: 'x' }],
    ['nested', frontmatterOf(['name: x', 'description:', '  nested']), { reason: 'multiline' }, { value: 'x' }],
    ['blank-continued', frontmatterOf(['name: x', 'description: first', '', '  second']), { reason: 'multiline' }, { value: 'x' }],
    ['empty-value', frontmatterOf(['name: x', 'description:']), { reason: 'empty' }, { value: 'x' }],
    ['empty-quoted', frontmatterOf(['name: x', 'description: ""']), { reason: 'empty' }, { value: 'x' }],
    ['spaces-quoted', frontmatterOf(['name: x', 'description: "   "']), { reason: 'empty' }, { value: 'x' }],
    ['null', frontmatterOf(['name: x', 'description: null']), { reason: 'empty' }, { value: 'x' }],
    ['tilde', frontmatterOf(['name: x', 'description: ~']), { reason: 'empty' }, { value: 'x' }],
    ['flow', frontmatterOf(['name: x', 'description: [a, b]']), { reason: 'not_plain_text' }, { value: 'x' }],
    ['alias', frontmatterOf(['name: x', 'description: *alias']), { reason: 'not_plain_text' }, { value: 'x' }],
    ['no-description', frontmatterOf(['name: x']), { reason: 'missing' }, { value: 'x' }],
    ['no-name', frontmatterOf(['description: d']), { value: 'd' }, { reason: 'missing' }],
    ['name-block', frontmatterOf(['name: |', '  x', 'description: d']), { value: 'd' }, { reason: 'block_scalar' }],
    ['name-multiline', frontmatterOf(['name: first', '  second', 'description: d']), { value: 'd' }, { reason: 'multiline' }],
    ['name-empty', frontmatterOf(['name: ""', 'description: d']), { value: 'd' }, { reason: 'empty' }],
  ]);
  try {
    for (const [label, bytes] of cases) f.put(`.github/skills/dude-local-r-${label}/SKILL.md`, bytes);
    // An agent entrypoint is judged by the same rules as a skill's.
    f.put('.github/agents/dude-local-r-agent-ok.agent.md', markdownFor('Agent', 'Agent text.'));
    f.put('.github/agents/dude-local-r-agent-folded.agent.md', frontmatterOf(['name: Agent', 'description: >', '  folded']));
    // The entrypoint itself may be absent or not a file; the folder is still a skill.
    f.put('.github/skills/dude-local-r-no-entrypoint/LICENSE');
    fs.mkdirSync(path.join(f.root, '.github/skills/dude-local-r-entrypoint-dir/SKILL.md'), { recursive: true });
    const { project } = await readPacksRoute(instance);
    assert.equal(project.coverage.state, 'current');
    const byName = new Map(project.items.map(/** @param {any} item */ item => [item.name, item]));
    assert.equal(byName.size, cases.length + 4);
    for (const [label, , description, declaredName] of cases) {
      const item = byName.get(`dude-local-r-${label}`);
      assert.deepEqual({ description: summarize(item.description), declaredName: summarize(item.declaredName) },
        { description, declaredName }, label);
      assert.equal(item.name, `dude-local-r-${label}`, 'the name stays the path identity');
    }
    assert.deepEqual(summarize(byName.get('dude-local-r-agent-ok').description), { value: 'Agent text.' });
    assert.deepEqual(summarize(byName.get('dude-local-r-agent-folded').description), { reason: 'block_scalar' });
    for (const [name, reason, message] of [
      ['dude-local-r-no-entrypoint', 'entrypoint_missing', 'SKILL.md is missing.'],
      ['dude-local-r-entrypoint-dir', 'entrypoint_not_file', 'SKILL.md is not a regular file.'],
    ]) {
      const item = byName.get(name);
      assert.deepEqual(item.description, descriptionUnavailable(reason, message));
      assert.deepEqual(item.declaredName, { state: 'unavailable', reason, message });
    }
    assert.deepEqual(byName.get('dude-local-r-no-entrypoint').files.paths, ['.github/skills/dude-local-r-no-entrypoint/LICENSE'],
      'a skill folder without an entrypoint still lists its files');
    // Exact words for the reasons a user will read; none is the generic "No description".
    assert.deepEqual(byName.get('dude-local-r-folded').description,
      descriptionUnavailable('block_scalar', 'The description is a block value, which is not read.'));
    assert.deepEqual(byName.get('dude-local-r-bom').declaredName, { state: 'unavailable', reason: 'bom',
      message: 'The file starts with a byte order mark, so its frontmatter was not read.' });
    for (const item of project.items) {
      for (const value of [item.description, item.declaredName]) {
        if (value.state === 'read') continue;
        assert.equal(Object.hasOwn(value, 'value'), false, 'an unavailable field carries no text');
        assert.match(value.message, /\S/);
        assert.doesNotMatch(value.message, /no description/i);
      }
      assert.notDeepEqual(item.declaredName, { state: 'read', value: item.name }, 'a path identity is never the declared name');
    }
    assert.doesNotMatch(JSON.stringify(project), /No description/i);

    // Every unavailable description says "Description unavailable" and then its own specific reason,
    // whichever defect made it so. An unknown reason would fail here rather than go unchecked.
    const specific = /** @type {Record<string, string>} */ ({
      bom: 'The file starts with a byte order mark, so its frontmatter was not read.',
      invalid_utf8: 'The start of the file is not valid UTF-8, so its frontmatter was not read.',
      frontmatter_missing: 'The file has no frontmatter block at its start.',
      closing_delimiter_missing: 'The frontmatter block is not closed.',
      duplicate_key: 'The frontmatter repeats a key.',
      malformed_quote: 'The frontmatter has a malformed quoted value.',
      block_scalar: 'The description is a block value, which is not read.',
      multiline: 'The description spans several lines, which is not read.',
      not_plain_text: 'The description is not a plain text value.',
      empty: 'The frontmatter description is empty.',
      missing: 'The frontmatter does not declare a description.',
      entrypoint_missing: 'SKILL.md is missing.',
      entrypoint_not_file: 'SKILL.md is not a regular file.',
    });
    const reasons = new Set();
    for (const item of project.items) {
      if (item.description.state === 'read') continue;
      assert.ok(Object.hasOwn(specific, item.description.reason), `${item.name}: ${item.description.reason} is a known reason`);
      assert.equal(item.description.message, `${DESCRIPTION_UNAVAILABLE}: ${specific[item.description.reason]}`, item.name);
      assert.ok(item.description.message.startsWith('Description unavailable: '));
      assert.doesNotMatch(item.description.message, /no description/i);
      reasons.add(item.description.reason);
    }
    assert.deepEqual([...reasons].sort(), Object.keys(specific).sort(), 'every reason the fixture can produce was seen and checked');
    // An unavailable declared name is its reason alone: no text, and nothing of the artifact's path identity.
    let unnamed = 0;
    for (const item of project.items) {
      if (item.declaredName.state === 'read') continue;
      unnamed += 1;
      assert.deepEqual(Object.keys(item.declaredName).sort(), ['message', 'reason', 'state']);
      const text = JSON.stringify(item.declaredName);
      for (const identity of [item.name, item.key, item.location]) {
        assert.equal(text.includes(identity), false, `${item.name}: an unavailable declared name never echoes ${identity}`);
      }
    }
    assert.ok(unnamed >= 15, 'many unavailable declared names were checked');
  } finally {
    await closeInstance('project-reasons');
    f.cleanup();
  }
});

test('T003 an entrypoint is judged from one positioned read of its first 8 KiB, never the whole file', async t => {
  const f = projectFixture();
  const instance = await openInstance('project-prefix', () => {}, { complete: true }, { root: f.root });
  const prefix = 8192; // the plan's 8 KiB, pinned here as a literal
  const head = '---\nname: x\ndescription: "early"\n';
  // A closing delimiter after the prefix: the description line is early, but the block is not closed in time.
  const late = `${head}pad: ${'a'.repeat(prefix + 904)}\n---\nBody\n`;
  // The prefix ends exactly on `---`, which is the start of `---tail`, not a closing delimiter.
  const split = `${head}pad: ${'a'.repeat(prefix - Buffer.byteLength(head) - 'pad: '.length - 1 - 3)}\n---tail beyond the prefix\n---\n`;
  assert.equal(Buffer.from(split).subarray(prefix - 3, prefix).toString(), '---');
  assert.equal(Buffer.from(split).subarray(prefix, prefix + 1).toString(), 't');
  // A three-byte character straddles byte 8192, but the frontmatter closed well before it.
  const closed = '---\nname: x\ndescription: "caf\u00e9 ok"\n---\n';
  const straddle = closed + 'x'.repeat(prefix - Buffer.byteLength(closed) - 1) + '\u20ac'.repeat(10);
  assert.equal(Buffer.from(straddle)[prefix - 1], 0xe2);
  // Exactly 8 KiB with no trailing newline after the closing delimiter, then far larger files.
  const exactHead = '---\nname: x\ndescription: "exact"\n---';
  const exact = `${exactHead}\n${'e'.repeat(prefix - Buffer.byteLength(exactHead) - 1)}`;
  assert.equal(Buffer.byteLength(exact), prefix);
  const big = `${closed}${'b'.repeat(6 * 1024 * 1024)}`;
  // Invalid UTF-8 after the prefix is never read.
  const lateBad = Buffer.concat([Buffer.from(closed), Buffer.alloc(prefix, 0x61), Buffer.from([0xff, 0xfe])]);
  const files = { late, split, straddle, exact, big, 'late-bad': lateBad };
  try {
    for (const [label, bytes] of Object.entries(files)) f.put(`.github/skills/dude-local-p-${label}/SKILL.md`, bytes);
    f.put('.github/agents/dude-local-p-agent-late.agent.md', late);
    f.put('.github/agents/dude-local-p-agent-big.agent.md', big);

    // Observe every read of an entrypoint through the one FileHandle read it may use.
    const probe = await fs.promises.open(fileURLToPath(import.meta.url));
    const handle = Object.getPrototypeOf(probe);
    await probe.close();
    const owners = new Map();
    const open = fs.promises.open;
    t.mock.method(fs.promises, 'open', /** @this {any} */ async function (file, ...rest) {
      const opened = await open.call(this, file, ...rest);
      owners.set(opened, path.basename(path.dirname(String(file))) + '/' + path.basename(String(file)));
      return opened;
    });
    /** @type {Array<{file: string, length: number, position: unknown, bytesRead: number}>} */
    const reads = [];
    const read = handle.read;
    t.mock.method(handle, 'read', /** @this {any} */ async function (buffer, offset, length, position) {
      const result = await read.call(this, buffer, offset, length, position);
      reads.push({ file: owners.get(this), length, position, bytesRead: result.bytesRead });
      return result;
    });
    const wholeFileHandleReaders = ['readFile', 'createReadStream', 'readLines']
      .map(name => /** @type {[string, any]} */ ([name, t.mock.method(handle, name)]));
    const wholeFilePathReaders = [[fs.promises, 'readFile'], [fs, 'readFileSync'], [fs, 'readFile'], [fs, 'createReadStream']]
      .map(([owner, name]) => /** @type {[string, any]} */ ([name, t.mock.method(/** @type {any} */ (owner), /** @type {string} */ (name))]));

    const { project } = await readPacksRoute(instance);
    t.mock.restoreAll();
    const byName = new Map(project.items.map(/** @param {any} item */ item => [item.name, item]));
    assert.deepEqual(summarize(byName.get('dude-local-p-late').description), { reason: 'closing_delimiter_late' });
    assert.equal(byName.get('dude-local-p-late').description.message,
      'Description unavailable: The closing frontmatter delimiter is not within the first 8 KiB.');
    assert.equal(byName.get('dude-local-p-late').declaredName.message, 'The closing frontmatter delimiter is not within the first 8 KiB.');
    assert.deepEqual(summarize(byName.get('dude-local-p-late').declaredName), { reason: 'closing_delimiter_late' },
      'a late closing delimiter makes the whole metadata unavailable, never a silently cut description');
    assert.deepEqual(summarize(byName.get('dude-local-p-split').description), { reason: 'closing_delimiter_late' },
      'a line the prefix cuts short is not a delimiter');
    assert.deepEqual(summarize(byName.get('dude-local-p-straddle').description), { value: 'caf\u00e9 ok' });
    assert.deepEqual(summarize(byName.get('dude-local-p-exact').description), { value: 'exact' });
    assert.deepEqual(summarize(byName.get('dude-local-p-big').description), { value: 'caf\u00e9 ok' });
    assert.deepEqual(summarize(byName.get('dude-local-p-late-bad').description), { value: 'caf\u00e9 ok' },
      'bytes after the prefix are never decoded');
    assert.deepEqual(summarize(byName.get('dude-local-p-agent-late').description), { reason: 'closing_delimiter_late' });
    assert.deepEqual(summarize(byName.get('dude-local-p-agent-big').description), { value: 'caf\u00e9 ok' });

    const entrypoints = reads.filter(entry => /SKILL\.md$|\.agent\.md$/.test(entry.file ?? ''));
    assert.ok(entrypoints.length >= Object.keys(files).length + 2, 'the spy observed the entrypoint reads');
    for (const entry of entrypoints) {
      assert.ok(entry.length <= prefix, `${entry.file} requested ${entry.length} bytes at once`);
      assert.ok(Number(entry.position) < prefix, `${entry.file} read at position ${entry.position}`);
    }
    const readFor = (/** @type {string} */ file) => entrypoints.filter(entry => entry.file === file)
      .reduce((sum, entry) => sum + entry.bytesRead, 0);
    for (const label of ['late', 'split', 'straddle', 'big', 'late-bad']) {
      assert.equal(readFor(`dude-local-p-${label}/SKILL.md`), prefix, `${label} is read for exactly its first 8 KiB`);
    }
    for (const label of ['agent-late', 'agent-big']) {
      assert.equal(readFor(`agents/dude-local-p-${label}.agent.md`), prefix, `${label} is read for exactly its first 8 KiB`);
    }
    assert.equal(readFor('dude-local-p-exact/SKILL.md'), prefix, 'a file of exactly 8 KiB is read once, whole');
    assert.equal(wholeFileHandleReaders.reduce((sum, [, spy]) => sum + spy.mock.calls.filter(call => owners.has(call.this)).length, 0), 0,
      'no whole-file read through an opened project file');
    assert.equal(wholeFilePathReaders.reduce((sum, [, spy]) => sum + spy.mock.calls
      .filter(call => /[\\/]\.github[\\/]/.test(String(call.arguments[0]))).length, 0), 0, 'no whole-file read of any project file');
    assert.ok(wholeFilePathReaders[1][1].mock.callCount() > 0, 'sensitivity: the readFileSync spy observes this read\'s own reads');
  } finally {
    t.mock.restoreAll();
    await closeInstance('project-prefix');
    f.cleanup();
  }
});

/**
 * One case over a fresh project workspace and its own Canvas.
 * @param {string} id
 * @param {(f: ReturnType<typeof projectFixture>, instance: Awaited<ReturnType<typeof openInstance>>) => Promise<void>} run
 */
async function withProject(id, run) {
  const f = projectFixture();
  const instance = await openInstance(id, () => {}, { complete: true }, { root: f.root });
  try { await run(f, instance); }
  finally {
    await closeInstance(id);
    f.cleanup();
  }
}

/** @param {string} reason @param {string} message */
const withheld = (reason, message) => ({ state: 'withheld', count: null, paths: null, notRead: [], reason, message });
const NOT_COMPLETE = 'Linked or unreadable paths were not read, so this list is not complete.';

test('T003 a linked artifact root is an identity-only row and descendant links keep their reason, never followed or read', async t => {
  await t.test('directory links: a linked skill root, a linked folder inside a skill, a linked companion folder', async t => {
    await withProject('project-links', async (f, instance) => {
      const outside = path.join(f.temporary, 'outside');
      fs.mkdirSync(path.join(outside, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(outside, 'SKILL.md'), markdownFor('outside', 'Outside description that must never appear.'));
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside secret\n');
      fs.writeFileSync(path.join(outside, 'nested', 'deep.md'), 'deep\n');
      fs.mkdirSync(path.join(f.root, '.github/skills'), { recursive: true });
      const linkedRoot = path.join(f.root, '.github/skills/dude-local-linked-root');
      fs.symlinkSync(outside, linkedRoot, DIRECTORY_LINK);
      f.put('.github/skills/dude-local-real/SKILL.md', markdownFor('real', 'A real skill.'));
      f.put('.github/skills/dude-local-real/LICENSE');
      const innerLink = path.join(f.root, '.github/skills/dude-local-real/refs');
      fs.symlinkSync(outside, innerLink, DIRECTORY_LINK);
      f.put('.github/agents/dude-local-compan.agent.md', markdownFor('Compan', 'The companion folder is linked.'));
      const supportLink = path.join(f.root, '.github/agents/dude-local-compan.support');
      fs.symlinkSync(outside, supportLink, DIRECTORY_LINK);
      const outsideBefore = snapshotFiles(outside);

      const seen = recordFsPaths(t);
      const { project, ...packs } = await readPacksRoute(instance);
      t.mock.restoreAll();
      assert.equal(packs.coverage.installed.state, 'empty');
      assert.deepEqual(project, {
        coverage: { state: 'current', reason: null, message: null },
        items: [
          projectRow('agent', 'dude-local-compan', { description: readField('The companion folder is linked.'),
            declaredName: readField('Compan'),
            files: { state: 'partial', count: 1, paths: ['.github/agents/dude-local-compan.agent.md'],
              notRead: [{ path: '.github/agents/dude-local-compan.support', reason: 'linked', message: LINKED_NOT_READ }],
              reason: 'descendants_not_read', message: NOT_COMPLETE } }),
          projectRow('skill', 'dude-local-linked-root', {
            description: descriptionUnavailable('linked', LINKED_NOT_READ),
            declaredName: { state: 'unavailable', reason: 'linked', message: LINKED_NOT_READ },
            files: withheld('linked', LINKED_NOT_READ) }),
          projectRow('skill', 'dude-local-real', { description: readField('A real skill.'), declaredName: readField('real'),
            files: { state: 'partial', count: 2,
              paths: ['.github/skills/dude-local-real/LICENSE', '.github/skills/dude-local-real/SKILL.md'],
              notRead: [{ path: '.github/skills/dude-local-real/refs', reason: 'linked', message: LINKED_NOT_READ }],
              reason: 'descendants_not_read', message: NOT_COMPLETE } }),
        ],
      });
      // A link is judged by lstat only: never opened, listed, resolved, or looked beneath.
      for (const link of [linkedRoot, innerLink, supportLink]) {
        for (const api of ['open', 'opendir', 'readdir', 'lstatSync', 'realpathSync']) {
          assert.deepEqual(seen[api].filter(file => file === link), [], `${api} never touches the link ${path.basename(link)}`);
        }
        assert.ok(seen.lstat.includes(link), `${path.basename(link)} was judged by lstat`);
      }
      const beneath = Object.values(seen).flat().filter(file => [outside, linkedRoot, innerLink, supportLink]
        .some(prefix => file === outside || file.startsWith(`${prefix}${path.sep}`)));
      assert.deepEqual(beneath, [], 'nothing beneath a link, or at its target, is examined');
      assert.deepEqual(snapshotFiles(outside), outsideBefore);
    });
  });

  await t.test('file links: a linked agent entrypoint, a linked SKILL.md and a linked file inside a skill', { skip: NO_FILE_SYMLINKS }, async t => {
    await withProject('project-file-links', async (f, instance) => {
      const outside = path.join(f.temporary, 'outside');
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'entry.md'), markdownFor('outside', 'Outside description that must never appear.'));
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside secret\n');
      fs.mkdirSync(path.join(f.root, '.github/agents'), { recursive: true });
      const agentLink = path.join(f.root, '.github/agents/dude-local-link-agent.agent.md');
      fs.symlinkSync(path.join(outside, 'entry.md'), agentLink, 'file');
      f.put('.github/skills/dude-local-link-entry/LICENSE');
      const entryLink = path.join(f.root, '.github/skills/dude-local-link-entry/SKILL.md');
      fs.symlinkSync(path.join(outside, 'entry.md'), entryLink, 'file');
      f.put('.github/skills/dude-local-link-file/SKILL.md', markdownFor('link-file', 'Has a linked file.'));
      const fileLink = path.join(f.root, '.github/skills/dude-local-link-file/secret.txt');
      fs.symlinkSync(path.join(outside, 'secret.txt'), fileLink, 'file');

      const seen = recordFsPaths(t);
      const { project } = await readPacksRoute(instance);
      t.mock.restoreAll();
      assert.deepEqual(project.items, [
        projectRow('agent', 'dude-local-link-agent', {
          description: descriptionUnavailable('linked', LINKED_NOT_READ),
          declaredName: { state: 'unavailable', reason: 'linked', message: LINKED_NOT_READ },
          files: withheld('linked', LINKED_NOT_READ) }),
        projectRow('skill', 'dude-local-link-entry', {
          description: descriptionUnavailable('linked', LINKED_NOT_READ),
          declaredName: { state: 'unavailable', reason: 'linked', message: LINKED_NOT_READ },
          files: { state: 'partial', count: 1, paths: ['.github/skills/dude-local-link-entry/LICENSE'],
            notRead: [{ path: '.github/skills/dude-local-link-entry/SKILL.md', reason: 'linked', message: LINKED_NOT_READ }],
            reason: 'descendants_not_read', message: NOT_COMPLETE } }),
        projectRow('skill', 'dude-local-link-file', { description: readField('Has a linked file.'), declaredName: readField('link-file'),
          files: { state: 'partial', count: 1, paths: ['.github/skills/dude-local-link-file/SKILL.md'],
            notRead: [{ path: '.github/skills/dude-local-link-file/secret.txt', reason: 'linked', message: LINKED_NOT_READ }],
            reason: 'descendants_not_read', message: NOT_COMPLETE } }),
      ]);
      for (const link of [agentLink, entryLink, fileLink]) {
        assert.deepEqual(seen.open.filter(file => file === link), [], `${path.basename(link)} is never opened`);
      }
      assert.deepEqual(Object.values(seen).flat().filter(file => file.startsWith(outside)), [], 'no link target is examined');
    });
  });
});

test('T003 an unsafe or linked collection path fails the project read closed and leaves the packs readable', async t => {
  const cases = /** @type {Array<[string, (f: ReturnType<typeof projectFixture>, outside: string) => void, string]>} */ ([
    ['a linked agents folder', (f, outside) => {
      fs.mkdirSync(path.join(f.root, '.github'));
      fs.symlinkSync(outside, path.join(f.root, '.github/agents'), DIRECTORY_LINK);
    }, '.github/agents is linked, not a folder, or outside the workspace, so project agents and skills were not read.'],
    ['a linked skills folder', (f, outside) => {
      f.put('.github/agents/dude-local-fine.agent.md', markdownFor('Fine', 'Fine agent.'));
      fs.symlinkSync(outside, path.join(f.root, '.github/skills'), DIRECTORY_LINK);
    }, '.github/skills is linked, not a folder, or outside the workspace, so project agents and skills were not read.'],
    ['a linked .github folder', (f, outside) => {
      fs.symlinkSync(outside, path.join(f.root, '.github'), DIRECTORY_LINK);
    }, '.github/agents is linked, not a folder, or outside the workspace, so project agents and skills were not read.'],
    ['an agents path that is a file', f => { f.put('.github/agents', 'not a folder\n'); },
      '.github/agents is not a folder, so project agents and skills were not read.'],
    ['a skills path that is a file', f => { f.put('.github/skills', 'not a folder\n'); },
      '.github/skills is not a folder, so project agents and skills were not read.'],
  ]);
  for (const [label, arrange, message] of cases) await t.test(label, async () => {
    await withProject('project-unsafe', async (f, instance) => {
      const outside = path.join(f.temporary, 'outside');
      fs.mkdirSync(path.join(outside, 'agents'), { recursive: true });
      fs.mkdirSync(path.join(outside, 'skills/dude-local-elsewhere'), { recursive: true });
      fs.writeFileSync(path.join(outside, 'agents/dude-local-elsewhere.agent.md'), markdownFor('Elsewhere', 'Never listed.'));
      fs.writeFileSync(path.join(outside, 'skills/dude-local-elsewhere/SKILL.md'), markdownFor('elsewhere', 'Never listed.'));
      const baseline = await readPacksRoute(instance, DISCOVER);
      assert.deepEqual(baseline.project, EMPTY_PROJECT);
      arrange(f, label.includes('.github folder') ? outside : path.join(outside, label.includes('agents') ? 'agents' : 'skills'));
      const outsideBefore = snapshotFiles(outside);
      const body = await readPacksRoute(instance, DISCOVER);
      assert.deepEqual(body.project, { coverage: { state: 'unavailable', reason: 'project_unsafe_path', message }, items: null });
      assert.deepEqual(packAuthority(body), packAuthority(baseline), 'readable installed packs and the catalog are intact');
      assert.equal(body.coverage.installed.state, 'empty');
      assert.equal(body.coverage.catalog.state, 'current');
      assert.deepEqual(snapshotFiles(outside), outsideBefore);
    });
  });
});

/** @param {string} root @param {string} relative @param {number} count */
function putMany(root, relative, count) {
  for (let index = 0; index < count; index += 1) {
    const target = path.join(root, ...relative.split('/'), `f${String(index).padStart(3, '0')}.md`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'x\n');
  }
}

test('T003 256 artifacts are all listed and a 257th withholds the whole list, never a partial one', async t => {
  const names = (/** @type {number} */ agents, /** @type {number} */ skills) => [
    ...Array.from({ length: agents }, (_, index) => `project:agent:dude-local-a${String(index).padStart(3, '0')}`),
    ...Array.from({ length: skills }, (_, index) => `project:skill:dude-local-s${String(index).padStart(3, '0')}`),
  ];
  for (const [label, agents, skills] of [['256 skills', 0, 256], ['256 agents and skills together', 100, 156],
    ['257 skills', 0, 257], ['257 agents and skills together', 200, 57]]) await t.test(label, async () => {
    await withProject('project-artifact-limit', async (f, instance) => {
      for (let index = 0; index < agents; index += 1) f.put(`.github/agents/dude-local-a${String(index).padStart(3, '0')}.agent.md`, markdownFor('A', 'Agent.'));
      for (let index = 0; index < skills; index += 1) f.put(`.github/skills/dude-local-s${String(index).padStart(3, '0')}/SKILL.md`, markdownFor('S', 'Skill.'));
      const body = await readPacksRoute(instance, DISCOVER);
      if (agents + skills === 256) {
        assert.deepEqual(body.project.coverage, { state: 'current', reason: null, message: null });
        assert.deepEqual(body.project.items.map(/** @param {any} item */ item => item.key), names(agents, skills),
          'every artifact, in name order');
        assert.ok(body.project.items.every(/** @param {any} item */ item => item.files.state === 'complete'));
      } else {
        assert.deepEqual(body.project, { coverage: { state: 'unavailable', reason: 'project_limit',
          message: 'More than 256 project agents and skills are present, so none are listed rather than a partial list.' },
        items: null });
      }
      assert.equal(body.coverage.catalog.state, 'current', 'the packs stay readable beside a withheld project list');
      assert.deepEqual(packAuthority(body).items, [{ key: `pack:alpha@${body.sources.defaultKey}`, name: 'alpha', installed: false,
        files: null, source: null, description: 'alpha full description <script>inert()</script>', use_cases: ['writing', 'ui'],
        sourceKey: body.sources.defaultKey, provenance: null }]);
    });
  });
});

test('T003 a per-artifact file or depth limit withholds only that row\'s files and count, and says why', async () => {
  await withProject('project-row-limits', async (f, instance) => {
    const ok = markdownFor('x', 'Entrypoint is fine.');
    // 128 files complete, 129 withheld: a skill counts its SKILL.md, an agent its entrypoint plus companions.
    for (const [name, count] of [['dude-local-f128', 128], ['dude-local-f129', 129]]) {
      f.put(`.github/skills/${name}/SKILL.md`, ok);
      putMany(f.root, `.github/skills/${name}/refs`, count - 1);
    }
    for (const [name, companions] of [['dude-local-g128', 127], ['dude-local-g129', 128]]) {
      f.put(`.github/agents/${name}.agent.md`, ok);
      putMany(f.root, `.github/agents/${name}.support/refs`, companions);
    }
    // The same bound holds for 300 files in one folder, for either artifact type.
    f.put('.github/skills/dude-local-h300/SKILL.md', ok);
    putMany(f.root, '.github/skills/dude-local-h300', 299);
    f.put('.github/agents/dude-local-i300.agent.md', ok);
    putMany(f.root, '.github/agents/dude-local-i300.support', 299);
    // A depth is the number of path segments below the artifact folder: 12 is complete, 13 is not.
    const deep = (/** @type {number} */ segments) => Array.from({ length: segments - 1 }, (_, index) => `d${index}`).join('/');
    f.put('.github/skills/dude-local-d12/SKILL.md', ok);
    f.put(`.github/skills/dude-local-d12/${deep(12)}/leaf.md`);
    f.put('.github/skills/dude-local-d13/SKILL.md', ok);
    f.put(`.github/skills/dude-local-d13/${deep(13)}/leaf.md`);
    f.put('.github/agents/dude-local-e12.agent.md', ok);
    f.put(`.github/agents/dude-local-e12.support/${deep(12)}/leaf.md`);
    f.put('.github/agents/dude-local-e13.agent.md', ok);
    f.put(`.github/agents/dude-local-e13.support/${deep(13)}/leaf.md`);
    f.put('.github/skills/dude-local-small/SKILL.md', ok);

    const { project } = await readPacksRoute(instance);
    assert.equal(project.coverage.state, 'current', 'a per-artifact limit never makes the list unavailable');
    const byName = new Map(project.items.map(/** @param {any} item */ item => [item.name, item]));
    assert.equal(byName.size, 11, 'every row remains: six skills and five agents');
    const files = (/** @type {string} */ name) => byName.get(name).files;
    const complete = (/** @type {string} */ name, /** @type {number} */ count) => {
      assert.equal(files(name).state, 'complete', name);
      assert.equal(files(name).count, count, name);
      assert.equal(files(name).paths.length, count, name);
    };
    complete('dude-local-f128', 128);
    complete('dude-local-g128', 128);
    complete('dude-local-d12', 2);
    complete('dude-local-e12', 2);
    complete('dude-local-small', 1);
    const fileLimit = withheld('file_limit', 'More than 128 files were found, so the file list and count are withheld.');
    const depthLimit = withheld('depth_limit', 'Folders go deeper than 12 levels, so the file list and count are withheld.');
    for (const name of ['dude-local-f129', 'dude-local-g129', 'dude-local-h300', 'dude-local-i300']) assert.deepEqual(files(name), fileLimit, name);
    assert.deepEqual(files('dude-local-d13'), depthLimit);
    assert.deepEqual(files('dude-local-e13'), depthLimit);
    // Only the files and count are withheld: the row, its description and its siblings are untouched.
    for (const name of ['dude-local-f129', 'dude-local-g129', 'dude-local-h300', 'dude-local-i300', 'dude-local-d13', 'dude-local-e13']) {
      assert.deepEqual(byName.get(name).description, readField('Entrypoint is fine.'), name);
      assert.equal(byName.get(name).files.count, null, `${name} states no count rather than a partial one`);
      assert.equal(byName.get(name).files.paths, null);
    }
  });
});

test('T003 folders are bounded by depth alone: no number of subfolders withholds or shortens a file list', async () => {
  await withProject('project-folder-flood', async (f, instance) => {
    const ok = markdownFor('x', 'Entrypoint is fine.');
    const folders = (/** @type {string} */ directory, /** @type {number} */ count) => {
      for (let index = 0; index < count; index += 1) fs.mkdirSync(path.join(f.root, ...directory.split('/'), `empty${String(index).padStart(3, '0')}`), { recursive: true });
    };
    // A skill of one file among 256 empty folders is within every limit the plan names.
    f.put('.github/skills/dude-local-q256/SKILL.md', ok);
    folders('.github/skills/dude-local-q256', 256);
    // 100 files among 160 folders, and a flood well past anything an entry count could allow.
    f.put('.github/skills/dude-local-q100/SKILL.md', ok);
    putMany(f.root, '.github/skills/dude-local-q100/docs', 99);
    folders('.github/skills/dude-local-q100', 160);
    f.put('.github/skills/dude-local-q700/SKILL.md', ok);
    folders('.github/skills/dude-local-q700', 700);
    // Folders in a nested folder too, beside files.
    f.put('.github/skills/dude-local-qnest/SKILL.md', ok);
    f.put('.github/skills/dude-local-qnest/a/b/one.md');
    folders('.github/skills/dude-local-qnest/a/b', 300);
    // An agent follows the same rule: its entrypoint, then whatever its companion folder holds.
    f.put('.github/agents/dude-local-r256.agent.md', ok);
    folders('.github/agents/dude-local-r256.support', 256);
    f.put('.github/agents/dude-local-r127.agent.md', ok);
    putMany(f.root, '.github/agents/dude-local-r127.support/refs', 127);
    folders('.github/agents/dude-local-r127.support', 200);

    const { project } = await readPacksRoute(instance);
    assert.equal(project.coverage.state, 'current');
    const byName = new Map(project.items.map(/** @param {any} item */ item => [`${item.type}:${item.name}`, item]));
    assert.equal(byName.size, 6);
    assert.deepEqual(byName.get('skill:dude-local-q256').files, completeFiles(['.github/skills/dude-local-q256/SKILL.md']));
    assert.deepEqual(byName.get('skill:dude-local-q700').files, completeFiles(['.github/skills/dude-local-q700/SKILL.md']));
    assert.deepEqual(byName.get('skill:dude-local-qnest').files, completeFiles([
      '.github/skills/dude-local-qnest/SKILL.md', '.github/skills/dude-local-qnest/a/b/one.md']));
    assert.deepEqual(byName.get('agent:dude-local-r256').files, completeFiles(['.github/agents/dude-local-r256.agent.md']));
    const hundred = byName.get('skill:dude-local-q100').files;
    assert.equal(hundred.state, 'complete');
    assert.equal(hundred.count, 100, 'every one of the 100 files is listed beside 160 folders');
    assert.equal(hundred.paths.length, 100);
    const agent = byName.get('agent:dude-local-r127').files;
    assert.equal(agent.state, 'complete');
    assert.equal(agent.count, 128, 'the entrypoint and 127 companions fill the bound exactly, whatever folders surround them');
  });
});

test('T003 links and unreadable folders, which are named as not read, count toward the 128 bound, so no list or note outgrows it', async t => {
  await withProject('project-not-read-bound', async (f, instance) => {
    const ok = markdownFor('x', 'Entrypoint is fine.');
    const outside = path.join(f.temporary, 'outside');
    fs.mkdirSync(outside);
    /** @param {string} directory @param {number} count */
    const links = (directory, count) => {
      fs.mkdirSync(path.join(f.root, ...directory.split('/')), { recursive: true });
      for (let index = 0; index < count; index += 1) {
        fs.symlinkSync(outside, path.join(f.root, ...directory.split('/'), `l${String(index).padStart(3, '0')}`), DIRECTORY_LINK);
      }
    };
    // SKILL.md and 99 files are 100 listed entries; 28 links make 128, and a 29th is the 129th.
    for (const [name, count] of [['dude-local-k128', 28], ['dude-local-k129', 29]]) {
      f.put(`.github/skills/${name}/SKILL.md`, ok);
      putMany(f.root, `.github/skills/${name}/docs`, 99);
      links(`.github/skills/${name}/links`, count);
    }
    // An agent's entrypoint is its first listed entry: 127 links make 128, 128 links make 129.
    for (const [name, count] of [['dude-local-m128', 127], ['dude-local-m129', 128]]) {
      f.put(`.github/agents/${name}.agent.md`, ok);
      links(`.github/agents/${name}.support/links`, count);
    }
    // Unreadable subfolders are named as not read too, so they count the same way.
    f.put('.github/skills/dude-local-u127/SKILL.md', ok);
    f.put('.github/skills/dude-local-u128/SKILL.md', ok);
    for (let index = 0; index < 128; index += 1) {
      fs.mkdirSync(path.join(f.root, `.github/skills/dude-local-u128/n${String(index).padStart(3, '0')}`));
      if (index < 127) fs.mkdirSync(path.join(f.root, `.github/skills/dude-local-u127/n${String(index).padStart(3, '0')}`));
    }
    const opendir = fs.promises.opendir;
    t.mock.method(fs.promises, 'opendir', /** @this {any} */ async function (file, ...rest) {
      if (/[\\/]dude-local-u12[78][\\/]n\d{3}$/.test(String(file))) {
        throw Object.assign(new Error(`EACCES: permission denied, scandir '${file}'`), { code: 'EACCES' });
      }
      return opendir.call(this, file, ...rest);
    });

    const { project } = await readPacksRoute(instance);
    t.mock.restoreAll();
    assert.equal(project.coverage.state, 'current');
    const byName = new Map(project.items.map(/** @param {any} item */ item => [item.name, item]));
    const fileLimit = withheld('file_limit', 'More than 128 files were found, so the file list and count are withheld.');
    for (const [name, notRead] of [['dude-local-k128', 28], ['dude-local-m128', 127], ['dude-local-u127', 127]]) {
      const files = byName.get(name).files;
      assert.equal(files.state, 'partial', name);
      assert.equal(files.notRead.length, notRead, `${name} names every path it did not read`);
      assert.equal(files.paths.length + files.notRead.length, 128, `${name} lists exactly 128 entries`);
      assert.equal(files.count, files.paths.length);
    }
    assert.deepEqual(byName.get('dude-local-k128').files.notRead.slice(0, 2).map(/** @param {any} entry */ entry => entry.path),
      ['.github/skills/dude-local-k128/links/l000', '.github/skills/dude-local-k128/links/l001']);
    assert.equal(byName.get('dude-local-k128').files.paths.length, 100);
    for (const name of ['dude-local-k129', 'dude-local-m129', 'dude-local-u128']) {
      assert.deepEqual(byName.get(name).files, fileLimit, `${name} withholds at the 129th listed entry`);
      assert.deepEqual(byName.get(name).description, readField('Entrypoint is fine.'), 'only the files are withheld');
    }
  });
});


test('T003 an unreadable entrypoint, artifact folder, subfolder or root keeps its row and its reason', async t => {
  await withProject('project-unreadable', async (f, instance) => {
    const ok = markdownFor('x', 'Readable.');
    f.put('.github/skills/dude-local-u-entry/SKILL.md', ok);
    f.put('.github/skills/dude-local-u-folder/SKILL.md', ok);
    f.put('.github/skills/dude-local-u-sub/SKILL.md', ok);
    f.put('.github/skills/dude-local-u-sub/inner/hidden.md');
    f.put('.github/skills/dude-local-u-root/SKILL.md', ok);
    f.put('.github/skills/dude-local-u-fine/SKILL.md', ok);
    const at = (/** @type {string} */ relative) => path.join(f.root, ...relative.split('/'));
    const denied = (/** @type {string} */ syscall, /** @type {unknown} */ file) => Object.assign(
      new Error(`EACCES: permission denied, ${syscall} '${file}'`), { code: 'EACCES', errno: -13, syscall, path: String(file) });
    const open = fs.promises.open, opendir = fs.promises.opendir, lstat = fs.promises.lstat;
    t.mock.method(fs.promises, 'open', /** @this {any} */ async function (file, ...rest) {
      if (path.resolve(String(file)) === at('.github/skills/dude-local-u-entry/SKILL.md')) throw denied('open', file);
      return open.call(this, file, ...rest);
    });
    t.mock.method(fs.promises, 'opendir', /** @this {any} */ async function (file, ...rest) {
      const resolved = path.resolve(String(file));
      if (resolved === at('.github/skills/dude-local-u-folder') || resolved === at('.github/skills/dude-local-u-sub/inner')) throw denied('opendir', file);
      return opendir.call(this, file, ...rest);
    });
    t.mock.method(fs.promises, 'lstat', /** @this {any} */ async function (file, ...rest) {
      if (path.resolve(String(file)) === at('.github/skills/dude-local-u-root')) throw denied('lstat', file);
      return lstat.call(this, file, ...rest);
    });
    const { project } = await readPacksRoute(instance);
    t.mock.restoreAll();
    assert.equal(project.coverage.state, 'current');
    const byName = new Map(project.items.map(/** @param {any} item */ item => [item.name, item]));
    assert.equal(byName.size, 5);
    const unreadable = { state: 'unavailable', reason: 'read_failed', message: 'The file could not be read (EACCES).' };
    assert.deepEqual(byName.get('dude-local-u-entry').description, descriptionUnavailable('read_failed', 'The file could not be read (EACCES).'),
      'an unreadable entrypoint shows its reason');
    assert.deepEqual(byName.get('dude-local-u-entry').declaredName, unreadable);
    assert.deepEqual(byName.get('dude-local-u-entry').files, completeFiles(['.github/skills/dude-local-u-entry/SKILL.md']));
    assert.deepEqual(byName.get('dude-local-u-folder').description, readField('Readable.'));
    assert.deepEqual(byName.get('dude-local-u-folder').files, withheld('unreadable', 'The folder could not be read (EACCES).'),
      'an unreadable artifact folder withholds only its files and count');
    assert.deepEqual(byName.get('dude-local-u-sub').files, {
      state: 'partial', count: 1, paths: ['.github/skills/dude-local-u-sub/SKILL.md'],
      notRead: [{ path: '.github/skills/dude-local-u-sub/inner', reason: 'read_failed', message: 'The folder could not be read (EACCES).' }],
      reason: 'descendants_not_read', message: NOT_COMPLETE }, 'an unreadable subfolder is named, not counted as empty');
    const identityOnly = { state: 'unavailable', reason: 'read_failed', message: 'Could not be read (EACCES).' };
    assert.deepEqual(byName.get('dude-local-u-root'), projectRow('skill', 'dude-local-u-root', {
      description: descriptionUnavailable('read_failed', 'Could not be read (EACCES).'), declaredName: identityOnly,
      files: withheld('read_failed', 'Could not be read (EACCES).') }));
    assert.deepEqual(byName.get('dude-local-u-fine').description, readField('Readable.'), 'a sibling row is untouched');
    assert.equal(byName.get('dude-local-u-fine').files.state, 'complete');
  });
});

/**
 * Names that are not valid UTF-8 exist only where the filesystem keeps raw
 * bytes: Windows names are text, and some POSIX filesystems refuse them. The
 * reason is the test's skip message, or false where such names can be made.
 */
const RAW_NAMES = (() => {
  if (process.platform === 'win32') return 'Windows cannot create file names that are not valid text; the case runs on POSIX hosts';
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-raw-name-probe-'));
  const file = Buffer.concat([Buffer.from(`${probe}${path.sep}n`), Buffer.from([0xff])]);
  try {
    fs.writeFileSync(file, 'x');
    return false;
  } catch (error) {
    if (['EILSEQ', 'EINVAL', 'ENOENT'].includes(error?.code)) return 'this filesystem refuses file names that are not valid UTF-8; the case runs where they are allowed';
    throw error;
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(probe, { recursive: true, force: true });
  }
})();

/**
 * A path under `directory` whose last segment holds raw bytes between two texts.
 * @param {string | Buffer} directory @param {string} before @param {number[]} bytes @param {string} [after]
 */
const rawPath = (directory, before, bytes, after = '') =>
  Buffer.concat([Buffer.from(directory), Buffer.from(`${path.sep}${before}`), Buffer.from(bytes), Buffer.from(after)]);

const NAME_NOT_UTF8 = 'A file or folder name is not valid UTF-8, so the file list and count are withheld.';

test('T003 a project entry whose name is not valid UTF-8 is never dropped or renamed: the read reports it', { skip: RAW_NAMES }, async t => {
  /** @param {ReturnType<typeof projectFixture>} f @param {Awaited<ReturnType<typeof openInstance>>} instance */
  const readBoth = async (f, instance) => {
    const direct = await readProjectArtifacts(f.root, new AbortController().signal);
    const body = await readPacksRoute(instance);
    assert.deepEqual(body.project, direct, 'the route returns exactly the module read');
    assert.equal(JSON.stringify(body).includes('\uFFFD'), false, 'no lossy name or key is ever returned');
    return { direct, body };
  };

  await t.test('in a collection the whole list is unavailable, never current without the entry', async t => {
    const cases = /** @type {Array<[string, 'agent' | 'skill', (f: ReturnType<typeof projectFixture>) => Buffer]>} */ ([
      ['a skill folder with byte 0xFF', 'skill', f => {
        const target = rawPath(path.join(f.root, '.github/skills'), 'dude-local-bad', [0xff]);
        fs.mkdirSync(target);
        fs.writeFileSync(Buffer.concat([target, Buffer.from(`${path.sep}SKILL.md`)]), markdownFor('bad', 'Present on disk.'));
        return target;
      }],
      ['a skill folder with two bad bytes, one a truncated sequence', 'skill', f => {
        const target = rawPath(path.join(f.root, '.github/skills'), 'dude-local-', [0xfe, 0xc3], '-tail');
        fs.mkdirSync(target);
        return target;
      }],
      ['an agent file with byte 0xFF', 'agent', f => {
        const target = rawPath(path.join(f.root, '.github/agents'), 'dude-local-bad', [0xff], '.agent.md');
        fs.writeFileSync(target, markdownFor('Bad', 'Present on disk.'));
        return target;
      }],
    ]);
    for (const [label, type, arrange] of cases) {
      await t.test(label, async () => {
        await withProject('project-raw-collection', async (f, instance) => {
          f.put('.github/skills/dude-local-fine/SKILL.md', markdownFor('fine', 'A valid sibling.'));
          f.put('.github/agents/dude-local-fine.agent.md', markdownFor('Fine', 'A valid sibling agent.'));
          const baseline = await readPacksRoute(instance);
          assert.equal(baseline.project.items.length, 2);
          const bad = arrange(f);
          const expected = { coverage: { state: 'unavailable', reason: 'project_name_not_utf8',
            message: `A project ${type} in .github/${type}s has a name that is not valid UTF-8, so none are listed rather than a partial list.` },
          items: null };
          const { direct, body } = await readBoth(f, instance);
          assert.deepEqual(direct, expected, 'the present entry makes the project read unavailable, never current without it');
          assert.notEqual(body.project.coverage.state, 'current');
          assert.deepEqual(packAuthority(body), packAuthority(baseline), 'installed packs and the catalog are intact');
          // The failure is not sticky: without the entry the next read is whole again.
          fs.rmSync(bad, { recursive: true, force: true });
          const after = await readBoth(f, instance);
          assert.equal(after.direct.coverage.state, 'current');
          assert.equal(after.direct.items?.length, 2);
        });
      });
    }
  });

  await t.test('names outside the local namespace are not inspected and change nothing', async () => {
    await withProject('project-raw-ignored', async (f, instance) => {
      f.put('.github/skills/dude-local-fine/SKILL.md', markdownFor('fine', 'A valid sibling.'));
      const agents = path.join(f.root, '.github/agents'), skills = path.join(f.root, '.github/skills');
      fs.mkdirSync(agents, { recursive: true });
      // Project-tier, pack-owned and core names, an orphan companion folder, and a stray non-agent file.
      for (const target of [rawPath(agents, 'other-', [0xff], '.agent.md'), rawPath(agents, 'dude-pack-x-', [0xff], '.agent.md'),
        rawPath(agents, 'dude-core', [0xff], '.agent.md'), rawPath(agents, 'dude-local-note', [0xff], '.txt')]) {
        fs.writeFileSync(target, 'x\n');
      }
      for (const target of [rawPath(agents, 'dude-local-orphan', [0xff], '.support'), rawPath(skills, 'dude-pack-x-', [0xff]),
        rawPath(skills, 'other', [0xff])]) fs.mkdirSync(target);
      const { direct } = await readBoth(f, instance);
      assert.equal(direct.coverage.state, 'current');
      assert.deepEqual(direct.items?.map(item => item.key), ['project:skill:dude-local-fine']);
    });
  });

  await t.test('inside an artifact only that row\'s files and count are withheld, with a specific reason', async () => {
    await withProject('project-raw-descendant', async (f, instance) => {
      const ok = markdownFor('x', 'Entrypoint is fine.');
      const skills = path.join(f.root, '.github/skills'), agents = path.join(f.root, '.github/agents');
      f.put('.github/skills/dude-local-clean/SKILL.md', ok);
      f.put('.github/skills/dude-local-clean/docs/a.md');
      // A file, a folder holding a valid file, and a deeply nested file whose name is raw.
      f.put('.github/skills/dude-local-file/SKILL.md', ok);
      fs.writeFileSync(rawPath(path.join(skills, 'dude-local-file'), 'bad', [0xff], '.md'), 'x');
      f.put('.github/skills/dude-local-folder/SKILL.md', ok);
      const folder = rawPath(path.join(skills, 'dude-local-folder'), 'dir', [0xfe, 0xff]);
      fs.mkdirSync(folder);
      fs.writeFileSync(Buffer.concat([folder, Buffer.from(`${path.sep}inner.md`)]), 'x');
      f.put('.github/skills/dude-local-nested/SKILL.md', ok);
      f.put('.github/skills/dude-local-nested/a/b/c.md');
      fs.writeFileSync(rawPath(path.join(skills, 'dude-local-nested/a/b'), 'd', [0x80]), 'x');
      // An agent's companion folder is judged the same way.
      f.put('.github/agents/dude-local-agent.agent.md', ok);
      fs.mkdirSync(rawPath(path.join(agents, 'dude-local-agent.support'), 'notes', [0xff]), { recursive: true });
      f.put('.github/agents/dude-local-fine.agent.md', ok);

      const { direct } = await readBoth(f, instance);
      assert.equal(direct.coverage.state, 'current', 'a descendant name never makes the whole list unavailable');
      const byName = new Map((direct.items ?? []).map(item => [`${item.type}:${item.name}`, item]));
      assert.equal(byName.size, 6);
      for (const key of ['skill:dude-local-file', 'skill:dude-local-folder', 'skill:dude-local-nested', 'agent:dude-local-agent']) {
        const item = /** @type {any} */ (byName.get(key));
        assert.deepEqual(item.files, withheld('name_not_utf8', NAME_NOT_UTF8), `${key} withholds its files and count, never complete`);
        assert.deepEqual(item.description, readField('Entrypoint is fine.'), `${key} keeps its row and description`);
      }
      assert.deepEqual(/** @type {any} */ (byName.get('skill:dude-local-clean')).files,
        completeFiles(['.github/skills/dude-local-clean/SKILL.md', '.github/skills/dude-local-clean/docs/a.md']), 'a sibling row is untouched');
      assert.deepEqual(/** @type {any} */ (byName.get('agent:dude-local-fine')).files, completeFiles(['.github/agents/dude-local-fine.agent.md']));
    });
  });
});

test('T003 valid non-ASCII names, including one holding U+FFFD, are listed exactly under their own names', async () => {
  await withProject('project-unicode-names', async (f, instance) => {
    // Characters with no canonical decomposition, so no filesystem renames them.
    f.put('.github/skills/dude-local-stra\u00dfe/SKILL.md', markdownFor('stra\u00dfe', 'Sharp s.'));
    f.put('.github/skills/dude-local-stra\u00dfe/\u03bb.md');
    f.put('.github/skills/dude-local-stra\u00dfe/\u65e5\u672c\u8a9e/\u30ce\u30fc\u30c8.md');
    f.put('.github/skills/dude-local-stra\u00dfe/emoji-\u{1f600}.md');
    f.put('.github/agents/dude-local-\u03a9mega.agent.md', markdownFor('\u03a9mega', 'Greek capital omega.'));
    f.put('.github/agents/dude-local-\u03a9mega.support/\u30ce\u30fc\u30c8/\u30e1\u30e2.txt');
    // A real U+FFFD in a valid name is its own name, not a stand-in for bad bytes.
    f.put('.github/skills/dude-local-\ufffd/SKILL.md', markdownFor('replacement', 'Holds U+FFFD.'));
    const { project } = await readPacksRoute(instance);
    assert.equal(project.coverage.state, 'current');
    assert.deepEqual(project.items.map(/** @param {any} item */ item => item.key), [
      'project:skill:dude-local-stra\u00dfe', 'project:agent:dude-local-\u03a9mega', 'project:skill:dude-local-\ufffd'],
    'rows in code-unit order of their exact names');
    const byKey = new Map(project.items.map(/** @param {any} item */ item => [item.key, item]));
    assert.deepEqual(byKey.get('project:skill:dude-local-stra\u00dfe').files, completeFiles([
      '.github/skills/dude-local-stra\u00dfe/SKILL.md', '.github/skills/dude-local-stra\u00dfe/emoji-\u{1f600}.md',
      '.github/skills/dude-local-stra\u00dfe/\u03bb.md', '.github/skills/dude-local-stra\u00dfe/\u65e5\u672c\u8a9e/\u30ce\u30fc\u30c8.md']));
    assert.deepEqual(byKey.get('project:agent:dude-local-\u03a9mega').files, completeFiles([
      '.github/agents/dude-local-\u03a9mega.agent.md', '.github/agents/dude-local-\u03a9mega.support/\u30ce\u30fc\u30c8/\u30e1\u30e2.txt']));
    assert.deepEqual(byKey.get('project:skill:dude-local-\ufffd').description, readField('Holds U+FFFD.'));
    assert.equal(byKey.get('project:skill:dude-local-\ufffd').name, 'dude-local-\ufffd');
  });
});

test('T003 an artifact that vanishes after it was listed is gone, but a file list that changed under the read is never complete', async t => {
  await withProject('project-vanished', async (f, instance) => {
    const ok = markdownFor('x', 'Fine.');
    f.put('.github/skills/dude-local-gone/SKILL.md', ok);
    f.put('.github/skills/dude-local-stay/SKILL.md', ok);
    for (const name of ['a.md', 'b.md', 'c.md']) f.put(`.github/skills/dude-local-stay/docs/${name}`);
    f.put('.github/agents/dude-local-ag.agent.md', ok);
    f.put('.github/agents/dude-local-ag.support/n.md');
    const at = (/** @type {string} */ relative) => path.join(f.root, ...relative.split('/'));
    const gone = new Set([at('.github/skills/dude-local-gone'), at('.github/skills/dude-local-stay/docs/b.md'),
      at('.github/agents/dude-local-ag.support/n.md')]);
    const lstat = fs.promises.lstat;
    t.mock.method(fs.promises, 'lstat', /** @this {any} */ async function (file, ...rest) {
      if (gone.has(path.resolve(String(file)))) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, lstat '${file}'`), { code: 'ENOENT', syscall: 'lstat' });
      }
      return lstat.call(this, file, ...rest);
    });
    const { project } = await readPacksRoute(instance);
    t.mock.restoreAll();
    assert.equal(project.coverage.state, 'current');
    assert.deepEqual(project.items.map(/** @param {any} item */ item => item.key), ['project:agent:dude-local-ag', 'project:skill:dude-local-stay'],
      'an artifact that is no longer there is no row');
    const changed = (/** @type {string} */ file) => ({ path: file, reason: 'changed_during_read', message: 'Changed while it was being read.' });
    assert.deepEqual(project.items[1].files, { state: 'partial', count: 3,
      paths: ['.github/skills/dude-local-stay/SKILL.md', '.github/skills/dude-local-stay/docs/a.md', '.github/skills/dude-local-stay/docs/c.md'],
      notRead: [changed('.github/skills/dude-local-stay/docs/b.md')], reason: 'descendants_not_read', message: NOT_COMPLETE },
    'a name that was listed and then vanished makes the list partial, with the path named');
    assert.deepEqual(project.items[0].files, { state: 'partial', count: 1, paths: ['.github/agents/dude-local-ag.agent.md'],
      notRead: [changed('.github/agents/dude-local-ag.support/n.md')], reason: 'descendants_not_read', message: NOT_COMPLETE });
    // Nothing is sticky: unchanged folders read complete again.
    assert.equal((await readPacksRoute(instance)).project.items.every(/** @param {any} item */ item => item.files.state === 'complete'), true);
  });
});

test('T003 a workspace root replaced during the project read is stale, and none of the old rows are returned', async t => {
  const f = projectFixture();
  try {
    f.put('.github/skills/dude-local-old/SKILL.md', markdownFor('old', 'The original workspace.'));
    const first = await readProjectArtifacts(f.root, new AbortController().signal);
    assert.deepEqual(first.items?.map(item => item.key), ['project:skill:dude-local-old']);
    // The identity read before and after the scan names a different folder the second time.
    const lstat = fs.promises.lstat;
    let identityReads = 0;
    t.mock.method(fs.promises, 'lstat', /** @this {any} */ async function (file, ...rest) {
      const stat = await lstat.call(this, file, ...rest);
      if (path.resolve(String(file)) === f.root && rest[0]?.bigint === true && ++identityReads === 2) stat.ino += 1n;
      return stat;
    });
    const replaced = await readProjectArtifacts(f.root, new AbortController().signal);
    t.mock.restoreAll();
    assert.equal(identityReads, 2, 'the root identity brackets the read');
    assert.deepEqual(replaced, { coverage: { state: 'stale', reason: 'workspace_changed',
      message: 'The workspace changed during the read. Reload to read one current snapshot.' }, items: null });
    assert.deepEqual(await readProjectArtifacts(f.root, new AbortController().signal), first, 'an unchanged root reads whole again');
  } finally {
    t.mock.restoreAll();
    f.cleanup();
  }
});

test('T003 containment is validated once per collection and artifact root, never for a descendant or a link', async t => {
  await withProject('project-containment', async (f, instance) => {
    const ok = markdownFor('x', 'Fine.');
    const at = (/** @type {string} */ relative) => path.join(f.root, ...relative.split('/'));
    /** @type {string[]} */ const roots = [];
    for (let index = 0; index < 4; index += 1) {
      const name = `dude-local-s${index}`;
      f.put(`.github/skills/${name}/SKILL.md`, ok);
      for (let branch = 0; branch < 3; branch += 1) putMany(f.root, `.github/skills/${name}/a${branch}/b${branch}`, 4);
      roots.push(at(`.github/skills/${name}`));
    }
    for (const [name, companions] of [['dude-local-ag0', 5], ['dude-local-ag1', 2], ['dude-local-ag2', 0]]) {
      f.put(`.github/agents/${name}.agent.md`, ok);
      roots.push(at(`.github/agents/${name}.agent.md`));
      if (companions) {
        putMany(f.root, `.github/agents/${name}.support/notes/deeper`, companions);
        roots.push(at(`.github/agents/${name}.support`));
      }
    }
    const outside = path.join(f.temporary, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'SKILL.md'), ok);
    const linked = at('.github/skills/dude-local-zlinked');
    fs.symlinkSync(outside, linked, DIRECTORY_LINK);

    const seen = recordFsPaths(t);
    const { project } = await readPacksRoute(instance);
    t.mock.restoreAll();
    assert.equal(project.items.length, 8, 'four skills, three agents and the linked row');
    for (const root of roots) {
      assert.equal(seen.lstatSync.filter(file => file === root).length, 1, `${path.basename(root)} is validated once (lstat)`);
      assert.equal(seen.realpathSync.filter(file => file === root).length, 1, `${path.basename(root)} is validated once (realpath)`);
    }
    // A descendant is judged by async lstat alone: no synchronous resolver call reaches beneath any root.
    const resolver = [...seen.lstatSync, ...seen.realpathSync];
    for (const root of roots) {
      assert.deepEqual(resolver.filter(file => file.startsWith(`${root}${path.sep}`)), [], `no descendant of ${path.basename(root)} is resolved`);
    }
    assert.ok(seen.lstat.some(file => file.startsWith(`${roots[0]}${path.sep}`)), 'the spy observed the descendants being judged by lstat');
    // Each collection is validated once itself, plus once more as a parent of each artifact root beneath it.
    const agentsDir = at('.github/agents'), skillsDir = at('.github/skills');
    const under = (/** @type {string} */ directory) => roots.filter(root => path.dirname(root) === directory).length;
    assert.equal(seen.lstatSync.filter(file => file === agentsDir).length, 1 + under(agentsDir), 'agents collection: once, then once per root');
    assert.equal(seen.lstatSync.filter(file => file === skillsDir).length, 1 + under(skillsDir), 'skills collection: once, then once per root');
    // A linked artifact root is never resolved, opened or listed.
    assert.deepEqual(resolver.filter(file => file === linked || file.startsWith(`${linked}${path.sep}`)), []);
    assert.deepEqual(seen.open.concat(seen.opendir).filter(file => file === linked || file.startsWith(`${linked}${path.sep}`)), []);
  });
});

/**
 * Park the scan at its listing of one collection: a barrier, not a timed
 * sleep. The scan resumes only when `release` runs. Every folder it lists,
 * before or after, is recorded.
 * @param {import('node:test').TestContext} t @param {string} collection
 */
function holdProjectScan(t, collection) {
  const opendir = fs.promises.opendir;
  /** @type {string[]} */
  const opened = [];
  let reached = () => {}, release = () => {};
  const reaching = new Promise(resolve => { reached = () => resolve(undefined); });
  const released = new Promise(resolve => { release = () => resolve(undefined); });
  t.mock.method(fs.promises, 'opendir', /** @this {any} */ async function (file, ...rest) {
    const resolved = path.resolve(String(file));
    opened.push(resolved);
    if (resolved === collection) {
      reached();
      await released;
    }
    return opendir.call(this, file, ...rest);
  });
  return { opened, reaching, release };
}

/** @param {() => boolean} probe @param {string} label */
async function untilTrue(probe, label) {
  const deadline = performance.now() + 5_000;
  while (!probe()) {
    if (performance.now() > deadline) assert.fail(`timed out waiting for ${label}`);
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('T003 cancellation rejects the project scan promptly, before it starts, between artifacts and mid-read', async t => {
  const f = projectFixture();
  try {
    const ok = markdownFor('x', 'Fine.');
    for (let index = 0; index < 40; index += 1) {
      f.put(`.github/skills/dude-local-c${String(index).padStart(2, '0')}/SKILL.md`, ok);
      f.put(`.github/skills/dude-local-c${String(index).padStart(2, '0')}/refs/a.md`);
    }
    const reason = new Error('cancelled by the test');
    const before = new AbortController();
    before.abort(reason);
    const untouched = recordFsPaths(t);
    await assert.rejects(readProjectArtifacts(f.root, before.signal), error => error === reason);
    t.mock.restoreAll();
    assert.deepEqual(Object.values(untouched).flat().filter(file => file.includes(`${path.sep}.github`)), [],
      'an already-cancelled scan touches nothing');

    // Cancel while the 25th lstat is in flight: no later filesystem call may start.
    const mid = new AbortController();
    const lstat = fs.promises.lstat;
    let calls = 0, started = 0;
    t.mock.method(fs.promises, 'lstat', /** @this {any} */ async function (file, ...rest) {
      calls += 1;
      if (mid.signal.aborted) started += 1;
      if (calls === 25) mid.abort(reason);
      return lstat.call(this, file, ...rest);
    });
    await assert.rejects(readProjectArtifacts(f.root, mid.signal), error => error === reason);
    assert.equal(calls, 25);
    assert.equal(started, 0, 'nothing is read after cancellation');
    t.mock.restoreAll();

    // Cancel just after an entrypoint opens: the handle is closed and nothing is read from it.
    const during = new AbortController();
    const probe = await fs.promises.open(fileURLToPath(import.meta.url));
    const handle = Object.getPrototypeOf(probe);
    await probe.close();
    const open = fs.promises.open;
    let opens = 0, closes = 0, reads = 0;
    t.mock.method(fs.promises, 'open', /** @this {any} */ async function (file, ...rest) {
      const opened = await open.call(this, file, ...rest);
      opens += 1;
      opened.once('close', () => { closes += 1; });
      during.abort(reason);
      return opened;
    });
    const read = handle.read;
    t.mock.method(handle, 'read', /** @this {any} */ function (...args) { reads += 1; return read.apply(this, args); });
    await assert.rejects(readProjectArtifacts(f.root, during.signal), error => error === reason);
    assert.deepEqual({ opens, closes, reads }, { opens: 1, closes: 1, reads: 0 }, 'the opened file is closed and never read');
    t.mock.restoreAll();

    // A caller defect is surfaced, not reported as an unavailable read.
    await assert.rejects(readProjectArtifacts(/** @type {any} */ (undefined), new AbortController().signal), TypeError);
    await assert.rejects(readProjectArtifacts(f.root, /** @type {any} */ (undefined)), TypeError);
    assert.equal((await readProjectArtifacts(f.root, new AbortController().signal)).items?.length, 40, 'an uncancelled scan is unaffected');
  } finally {
    t.mock.restoreAll();
    f.cleanup();
  }
});

test('T003 cancellation, a replaced root and Canvas close reach the project scan inside the coalesced read', async t => {
  await t.test('the last disconnected reader cancels the scan before it reads another folder', async t => {
    await withProject('project-cancel', async (f, instance) => {
      f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
      const agentsDir = path.join(f.root, '.github/agents');
      fs.mkdirSync(agentsDir);
      const hold = holdProjectScan(t, agentsDir);
      const controller = new AbortController();
      /** @type {() => void} */ let closed = () => {};
      const disconnected = new Promise(resolve => { closed = () => resolve(undefined); });
      instance.server.once('request', (_, res) => res.once('close', closed));
      const reading = call(instance.url, { path: '/api/packs', signal: controller.signal }).catch(error => error);
      await hold.reaching;
      const inflight = instance.packRead.promise;
      controller.abort();
      assert.ok((await reading) instanceof Error, 'the abandoned fetch rejected');
      await disconnected;
      assert.equal(instance.packRead.controller.signal.aborted, true, 'the last reader cancelled the coalesced read');
      hold.release();
      await assert.rejects(inflight);
      assert.deepEqual(hold.opened, [agentsDir], 'the cancelled scan listed no other folder');
      await untilTrue(() => instance.packRead === null, 'the abandoned read to be forgotten');
      t.mock.restoreAll();
      const fresh = await readPacksRoute(instance);
      assert.deepEqual(fresh.project.items.map(/** @param {any} item */ item => item.key), ['project:skill:dude-local-x'],
        'a later read is fresh, not the abandoned one');
    });
  });

  await t.test('a root replaced before delivery returns 409 and never the old rows, and the next read is the new root\'s', async t => {
    const next = projectFixture();
    try {
      next.put('.github/skills/dude-local-next/SKILL.md', markdownFor('next', 'The replacement workspace.'));
      await withProject('project-root-replaced', async (f, instance) => {
        f.put('.github/skills/dude-local-old/SKILL.md', markdownFor('old', 'The original workspace.'));
        const agentsDir = path.join(f.root, '.github/agents');
        fs.mkdirSync(agentsDir);
        const hold = holdProjectScan(t, agentsDir);
        const pending = call(instance.url, { path: '/api/packs' });
        await hold.reaching;
        instance.readInput = { root: next.root };
        hold.release();
        const replaced = await pending;
        assert.equal(replaced.status, 409);
        assert.deepEqual(await replaced.json(), { error: 'identity_mismatch',
          message: 'The workspace or Canvas lifetime changed. Reload to read current packs.' });
        t.mock.restoreAll();
        const body = await readPacksRoute(instance);
        assert.deepEqual(body.project.items.map(/** @param {any} item */ item => item.key), ['project:skill:dude-local-next']);
        assert.equal(JSON.stringify(body).includes('dude-local-old'), false);
      });
    } finally { next.cleanup(); }
  });

  await t.test('a replaced root cancels the old scan when another reader arrives, and only the new root is read', async t => {
    const next = projectFixture();
    try {
      next.put('.github/skills/dude-local-next/SKILL.md', markdownFor('next', 'The replacement workspace.'));
      await withProject('project-root-cancelled', async (f, instance) => {
        f.put('.github/skills/dude-local-old/SKILL.md', markdownFor('old', 'The original workspace.'));
        const agentsDir = path.join(f.root, '.github/agents');
        fs.mkdirSync(agentsDir);
        const hold = holdProjectScan(t, agentsDir);
        const first = call(instance.url, { path: '/api/packs' });
        await hold.reaching;
        const old = instance.packRead;
        instance.readInput = { root: next.root };
        const second = call(instance.url, { path: '/api/packs' });
        await untilTrue(() => old.controller.signal.aborted, 'the replaced root\'s read to be cancelled');
        hold.release();
        const [abandoned, current] = await Promise.all([first, second]);
        assert.equal(abandoned.status, 503, 'the cancelled read delivers nothing');
        assert.equal((await abandoned.json()).error, 'packs_unavailable');
        assert.equal(current.status, 200);
        const body = await current.json();
        assert.deepEqual(body.project.items.map(/** @param {any} item */ item => item.key), ['project:skill:dude-local-next']);
        assert.deepEqual(hold.opened.filter(file => file.startsWith(f.root) && file !== agentsDir), [],
          'the old workspace\'s scan read nothing after the replacement');
      });
    } finally { next.cleanup(); }
  });

  await t.test('closing the Canvas cancels the scan and the held request gets the fixed lifetime refusal', async t => {
    await withProject('project-close', async (f, instance) => {
      f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
      const agentsDir = path.join(f.root, '.github/agents');
      fs.mkdirSync(agentsDir);
      const hold = holdProjectScan(t, agentsDir);
      // A non-pooled request, so close does not also wait on an idle keep-alive socket.
      const ended = new Promise((resolve, reject) => {
        const request = http.request(new URL('/api/packs', instance.url), { agent: false }, response => {
          const chunks = /** @type {Buffer[]} */ ([]);
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        });
        request.on('error', reject);
        request.end();
      });
      await hold.reaching;
      const closing = closeInstance('project-close');
      hold.release();
      const response = /** @type {{status: number, text: string}} */ (await ended);
      assert.equal(response.status, 503);
      assert.equal(JSON.parse(response.text).error, 'packs_unavailable');
      assert.equal(await closing, true);
      assert.deepEqual(hold.opened, [agentsDir], 'the scan listed no other folder after the close');
      assert.equal(instance.server.listening, false);
    });
  });
});

test('T003 the coalesced read settles only after the pack reader tree has stopped, even when the project scan ends first', { timeout: 30_000 }, async t => {
  // Close and a replacement read both wait on this promise to know the reader's
  // process tree and temporary root are gone. A scan that notices a cancellation
  // within milliseconds must never let it settle before the bounded stop finishes.
  const f = projectFixture();
  const listener = await silentGitListener(t);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  stallCatalog(f, listener.url('git'));
  const instance = await openInstance('project-settles-last', () => {}, { complete: true }, { root: f.root });
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
    const agentsDir = path.join(f.root, '.github/agents');
    fs.mkdirSync(agentsDir);
    const hold = holdProjectScan(t, agentsDir);
    const controller = new AbortController();
    /** @type {() => void} */ let closed = () => {};
    const disconnected = new Promise(resolve => { closed = () => resolve(undefined); });
    instance.server.once('request', (_, res) => res.once('close', closed));
    const reading = call(instance.url, { path: DISCOVER, signal: controller.signal }).catch(error => error);
    await hold.reaching;
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const inflight = instance.catalogRead.promise;
    /** @type {{open: number, readerExited: boolean, scratch: string[]} | null} */
    let atSettle = null;
    const settled = inflight.then(() => 'resolved', () => 'rejected').then(outcome => {
      atSettle = { open: listener.open, readerExited: spy.readers()[0]?.exitedAt !== null, scratch: fs.readdirSync(f.scratch) };
      return outcome;
    });
    controller.abort();
    assert.ok((await reading) instanceof Error);
    await disconnected;
    // The scan resumes into the cancellation and ends at once; the reader's tree stop takes longer.
    hold.release();
    assert.equal(await settled, 'rejected');
    const stopped = /** @type {{open: number, readerExited: boolean, scratch: string[]}} */ (atSettle);
    assert.deepEqual({ open: stopped.open, readerExited: stopped.readerExited }, { open: 0, readerExited: true },
      'the combined read outlived neither the stalled Git connection nor the reader process');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: stopped.scratch });
    assert.equal(spy.readers().length, 1);
  } finally {
    t.mock.restoreAll();
    await closeInstance('project-settles-last');
    await stopRecorded(tree);
    f.cleanup();
  }
});

test('T003 a pack read that fails for any reason but cancellation stops the project scan and is answered once the scan has stopped', async t => {
  // The pack read can reject for a reason that is not a cancellation. Its failure
  // discards the whole result, so the sibling scan has nothing left to produce:
  // it must stop at once, not run to the end while the 503 waits for it.
  const f = projectFixture();
  const instance = await openInstance('project-pack-failure', () => {}, { complete: true }, { root: f.root });
  try {
    // Enough artifacts that a scan which kept going would read on, visibly.
    for (let index = 0; index < 30; index += 1) {
      f.put(`.github/skills/dude-local-w${String(index).padStart(2, '0')}/SKILL.md`, markdownFor('w', 'Fine.'));
      f.put(`.github/skills/dude-local-w${String(index).padStart(2, '0')}/refs/a.md`);
    }
    f.put('.github/agents/dude-local-wa.agent.md', markdownFor('wa', 'Fine.'));
    // The scan parks at its first filesystem call, the workspace root's identity,
    // and only the test opens that gate. Every call under the workspace and every
    // folder it lists is recorded.
    const lstat = fs.promises.lstat, opendir = fs.promises.opendir;
    /** @type {string[]} */
    const listed = [];
    let underRoot = 0;
    /** @type {() => void} */ let reached = () => {};
    /** @type {() => void} */ let release = () => {};
    const reaching = new Promise(resolve => { reached = () => resolve(undefined); });
    const gate = new Promise(resolve => { release = () => resolve(undefined); });
    let parked = false;
    t.mock.method(fs.promises, 'lstat', /** @this {any} */ async function (file, ...rest) {
      if (path.resolve(String(file)).startsWith(f.root)) underRoot += 1;
      if (!parked && path.resolve(String(file)) === f.root && rest[0]?.bigint === true) {
        parked = true;
        reached();
        await gate;
      }
      return lstat.call(this, file, ...rest);
    });
    t.mock.method(fs.promises, 'opendir', /** @this {any} */ async function (file, ...rest) {
      if (path.resolve(String(file)).startsWith(f.root)) underRoot += 1;
      listed.push(path.resolve(String(file)));
      return opendir.call(this, file, ...rest);
    });
    // The pack reader's own hashing fails, which rejects `readPacks` for a
    // defect and not for a cancellation. Nothing else is touched.
    /** @type {Error[]} */
    const injected = [];
    const hash = nodeCrypto.createHash;
    t.mock.method(nodeCrypto, 'createHash', /** @this {any} */ function (...args) {
      if (/[\\/]lib[\\/]packs\.mjs/.test(new Error().stack ?? '')) {
        const failure = new Error('injected pack read defect');
        injected.push(failure);
        throw failure;
      }
      return hash.apply(this, args);
    });
    syncBuiltinESMExports();

    const pending = call(instance.url, { path: '/api/packs' });
    await reaching;
    await untilTrue(() => injected.length === 1, 'the pack read to fail');
    const inflight = instance.packRead.promise;
    assert.equal(instance.signal.aborted, false, 'the Canvas lifetime did not end');
    assert.equal(instance.packRead.controller.signal.aborted, false, 'no reader left: this is not a cancellation');
    // The combined read still waits for the scan itself to stop, so the pack
    // reader's resources are never abandoned; only the scan's remaining work goes.
    let settled = false;
    void inflight.then(() => { settled = true; }, () => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'the combined read settles only once the scan has settled');
    release();
    const response = await pending;
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'packs_unavailable', message: 'The pack read was cancelled or became unavailable.' });
    assert.deepEqual(listed, [], 'the stopped scan listed no folder and read no artifact');
    assert.equal(underRoot, 1, 'after the failure the scan started no filesystem call but the one already in flight');
    assert.equal(injected.length, 1, 'one pack read failed once');
    await untilTrue(() => instance.packRead === null, 'the failed read to be forgotten');

    // Nothing is left behind: the next read is whole and fresh.
    t.mock.restoreAll();
    syncBuiltinESMExports();
    const next = await readPacksRoute(instance);
    assert.equal(next.project.items.length, 31);
    assert.equal(next.project.coverage.state, 'current');
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await closeInstance('project-pack-failure');
    f.cleanup();
  }
});

test('T003 a project read failure is its own coverage and leaves packs readable, and a pack failure hides no project rows', async t => {
  await t.test('an unexpected defect becomes project_unavailable, is logged without detail, and keeps the packs', async t => {
    const { lines, log } = recorder();
    const f = projectFixture();
    const instance = await openInstance('project-defect', log, { complete: true }, { root: f.root });
    try {
      f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
      const before = await readPacksRoute(instance);
      assert.equal(before.project.coverage.state, 'current');
      const skillsDir = path.join(f.root, '.github/skills');
      const opendir = fs.promises.opendir;
      t.mock.method(fs.promises, 'opendir', /** @this {any} */ async function (file, ...rest) {
        if (path.resolve(String(file)) === skillsDir) throw new Error(`defect with private detail ${file}`);
        return opendir.call(this, file, ...rest);
      });
      const failed = await readPacksRoute(instance);
      assert.deepEqual(failed.project, { coverage: { state: 'unavailable', reason: 'project_unavailable',
        message: 'The project agent and skill read failed. Reload to try again.' }, items: null });
      assert.deepEqual(packAuthority(failed), packAuthority(before), 'installed packs and the catalog are intact');
      assert.deepEqual(lines.filter(line => line.includes('project agent and skill read')),
        ['Dude canvas project-defect: the project agent and skill read failed (Error).'], 'logged once, by class only');
      assert.equal(lines.join('\n').includes('private detail'), false);
      t.mock.restoreAll();
      assert.equal((await readPacksRoute(instance)).project.coverage.state, 'current', 'the next read recovers');
    } finally {
      t.mock.restoreAll();
      await closeInstance('project-defect');
      f.cleanup();
    }
  });

  await t.test('a filesystem failure on a collection is project_unreadable and keeps the packs', async t => {
    await withProject('project-eio', async (f, instance) => {
      f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
      const before = await readPacksRoute(instance);
      const agentsDir = path.join(f.root, '.github/agents');
      fs.mkdirSync(agentsDir);
      const opendir = fs.promises.opendir;
      t.mock.method(fs.promises, 'opendir', /** @this {any} */ async function (file, ...rest) {
        if (path.resolve(String(file)) === agentsDir) throw Object.assign(new Error(`EIO: i/o error, scandir '${file}'`), { code: 'EIO' });
        return opendir.call(this, file, ...rest);
      });
      const failed = await readPacksRoute(instance);
      t.mock.restoreAll();
      assert.deepEqual(failed.project, { coverage: { state: 'unavailable', reason: 'project_unreadable',
        message: '.github/agents could not be read (EIO).' }, items: null });
      assert.equal(JSON.stringify(failed).includes(f.root), false, 'no absolute path or system message is returned');
      assert.deepEqual(packAuthority(failed), packAuthority(before));
    });
  });

  await t.test('an unreadable installed profile leaves the project rows, which never depend on it', async () => {
    await withProject('project-no-profile', async (f, instance) => {
      f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
      fs.writeFileSync(f.profilePath, '# Profile\n\n```json\nnot JSON\n```\n');
      const body = await readPacksRoute(instance);
      assert.equal(body.coverage.installed.state, 'unavailable');
      assert.equal(body.installed, null);
      assert.deepEqual(body.project.coverage, { state: 'current', reason: null, message: null });
      assert.deepEqual(body.project.items.map(/** @param {any} item */ item => item.key), ['project:skill:dude-local-x']);
    });
  });
});

test('T003 one pack-plus-project read serves every coalesced subscriber and a finished read is never cached', async t => {
  await withProject('project-coalesce', async (f, instance) => {
    f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
    const agentsDir = path.join(f.root, '.github/agents'), skillsDir = path.join(f.root, '.github/skills');
    fs.mkdirSync(agentsDir);
    const hold = holdProjectScan(t, agentsDir);
    let requests = 0, joined = () => {};
    const everyoneJoined = new Promise(resolve => { joined = () => resolve(undefined); });
    instance.server.on('request', (req) => { if (req.url === '/api/packs' && ++requests === 3) joined(); });
    const leaving = new AbortController();
    const first = call(instance.url, { path: '/api/packs' });
    await hold.reaching;
    const second = call(instance.url, { path: '/api/packs' });
    const third = call(instance.url, { path: '/api/packs', signal: leaving.signal }).catch(error => error);
    await everyoneJoined;
    assert.equal(instance.packRead.readers, 3, 'three subscribers share one in-flight read');
    leaving.abort();
    assert.ok((await third) instanceof Error);
    await untilTrue(() => instance.packRead.readers === 2, 'one reader to disconnect');
    assert.equal(instance.packRead.controller.signal.aborted, false, 'another live reader keeps the scan');
    hold.release();
    const [a, b] = await Promise.all([first, second].map(async pending => (await pending).json()));
    assert.deepEqual(a.project, b.project);
    assert.deepEqual(a.project.items.map(/** @param {any} item */ item => item.key), ['project:skill:dude-local-x']);
    assert.deepEqual([hold.opened.filter(file => file === agentsDir).length, hold.opened.filter(file => file === skillsDir).length], [1, 1],
      'one scan, not one per subscriber');
    // A completed read is not a cache: the next read scans again and sees a change at once.
    f.put('.github/skills/dude-local-y/SKILL.md', markdownFor('y', 'Added after the first read.'));
    const next = await readPacksRoute(instance);
    assert.deepEqual(next.project.items.map(/** @param {any} item */ item => item.key), ['project:skill:dude-local-x', 'project:skill:dude-local-y']);
    assert.deepEqual([hold.opened.filter(file => file === agentsDir).length, hold.opened.filter(file => file === skillsDir).length], [2, 2]);
  });
});

test('T003 the project scan starts no process, makes no network request, opens no watcher and writes nothing', async t => {
  const f = projectFixture();
  // A real loopback listener only so the spies below can be shown to observe real traffic.
  const server = http.createServer((_, response) => response.end('ok'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  try {
    f.put('.github/skills/dude-local-imported/SKILL.md', markdownFor('imported', 'Imported skill.'));
    f.put('.github/skills/dude-local-imported/refs/deep/file.md');
    f.put('.github/agents/dude-local-imported.agent.md', markdownFor('Imported', 'Imported agent.'));
    f.put('.github/agents/dude-local-imported.support/NOTICE');
    f.put('.github/skills/dude-local-bad/SKILL.md', '---\nname: x\ndescription: |\n  block\n---\n');
    const before = snapshotFiles(f.root);
    const mutators = [
      ...['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'rename', 'copyFile', 'cp', 'symlink', 'link', 'unlink',
        'truncate', 'chmod', 'chown', 'utimes', 'lutimes'].map(name => /** @type {[string, any, string]} */ ([`promises.${name}`, fs.promises, name])),
      ...['writeFileSync', 'appendFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'rmdirSync', 'renameSync', 'copyFileSync', 'cpSync',
        'symlinkSync', 'linkSync', 'unlinkSync', 'truncateSync', 'chmodSync', 'chownSync', 'utimesSync', 'writeSync', 'watch', 'watchFile']
        .map(name => /** @type {[string, any, string]} */ ([name, fs, name])),
    ].filter(([, owner, name]) => typeof owner[name] === 'function')
      .map(([label, owner, name]) => /** @type {[string, any]} */ ([label, t.mock.method(owner, name)]));
    const spawns = t.mock.method(childProcess.ChildProcess.prototype, 'spawn');
    const syncLaunches = ['spawnSync', 'execSync', 'execFileSync'].map(name => t.mock.method(childProcess, name));
    syncBuiltinESMExports();
    const connects = t.mock.method(net.Socket.prototype, 'connect');
    const fetches = t.mock.method(globalThis, 'fetch');
    const requests = ['request', 'get'].map(name => t.mock.method(http, name));
    // Every open is read-only: no write, append, truncate, create or exclusive flag.
    const forbidden = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_TRUNC | fs.constants.O_EXCL;
    const openFlags = /** @type {unknown[]} */ ([]);
    const open = fs.promises.open;
    t.mock.method(fs.promises, 'open', /** @this {any} */ function (file, flags, ...rest) {
      openFlags.push(flags);
      return open.call(this, file, flags, ...rest);
    });

    const result = await readProjectArtifacts(f.root, new AbortController().signal);
    assert.deepEqual(result.items?.map(item => item.key),
      ['project:skill:dude-local-bad', 'project:agent:dude-local-imported', 'project:skill:dude-local-imported']);
    assert.equal(openFlags.length, 3, 'one open per entrypoint');
    for (const flags of openFlags) {
      assert.equal(typeof flags, 'number');
      assert.equal(/** @type {number} */ (flags) & forbidden, 0, `open flags ${flags} are read-only`);
    }
    assert.deepEqual(mutators.filter(([, spy]) => spy.mock.callCount() > 0).map(([label]) => label), [], 'nothing is written or watched');
    assert.equal(spawns.mock.callCount() + syncLaunches.reduce((sum, spy) => sum + spy.mock.callCount(), 0), 0, 'no process starts');
    assert.equal(connects.mock.callCount() + fetches.mock.callCount() + requests.reduce((sum, spy) => sum + spy.mock.callCount(), 0), 0,
      'no network request or connection is made');
    assert.deepEqual(snapshotFiles(f.root), before);

    // Sensitivity: the same spies observe a real launch, request, connection and write.
    childProcess.execFileSync(process.execPath, ['-e', '']);
    await new Promise((resolve, reject) => childProcess.execFile(process.execPath, ['-e', ''], error => (error ? reject(error) : resolve(undefined))));
    assert.equal(syncLaunches[2].mock.callCount(), 1);
    assert.equal(spawns.mock.callCount(), 1);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), 'ok');
    await new Promise(resolve => http.get(`http://127.0.0.1:${port}/`, response => { response.resume(); response.on('end', () => resolve(undefined)); }));
    assert.equal(fetches.mock.callCount(), 1);
    assert.equal(requests[1].mock.callCount(), 1);
    assert.ok(connects.mock.callCount() > 0);
    fs.writeFileSync(path.join(f.temporary, 'sensitivity'), 'x');
    assert.equal(mutators.find(([label]) => label === 'writeFileSync')?.[1].mock.callCount(), 1);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    server.closeAllConnections();
    await new Promise(resolve => server.close(() => resolve(undefined)));
    f.cleanup();
  }
});

test('T003 the project reader has no process, network, timer, watcher, write or cache dependency and one read-only open', () => {
  const entry = fileURLToPath(new URL('./lib/project-artifacts.mjs', import.meta.url));
  /** @type {Map<string, {source: string, specifiers: string[]}>} */
  const graph = new Map();
  /** @param {string} file */
  const visit = file => {
    if (graph.has(file)) return;
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/^import\s(?:[^;]*?\sfrom\s)?'([^']+)';/gm)].map(match => match[1]);
    graph.set(file, { source, specifiers });
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) visit(path.resolve(path.dirname(file), specifier));
    }
  };
  visit(entry);
  const modules = [...graph.keys()].map(file => path.relative(path.resolve(EXTENSION_SOURCE_ROOT, '../..'), file).replace(/\\/g, '/'));
  for (const reused of ['skills/dude-engine/lib/feature-identity.mjs', 'skills/dude-engine/lib/ownership.mjs',
    'skills/dude-engine/lib/workspace-paths.mjs']) {
    assert.ok(modules.includes(reused), `the project reader reuses ${reused}`);
  }
  assert.deepEqual(modules.filter(file => /dude-compose|dude-bundle|packs\.mjs|catalog-reader|projection\.mjs|needs-you\.mjs|review\.mjs|canvas-server/.test(file)), [],
    'it neither reads packs nor depends on the provider or the server');
  const specifiers = [...graph.values()].flatMap(module => module.specifiers);
  assert.deepEqual(specifiers.filter(specifier => /^(?:node:)?(?:child_process|cluster|dgram|dns|http|http2|https|inspector|net|tls|worker_threads)(?:\/|$)/.test(specifier)), []);
  const code = /** @type {{source: string}} */ (graph.get(entry)).source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(code.match(/\b(?:import|require|fetch)\s*\(|\bprocess\.|\bset(?:Timeout|Interval|Immediate)\s*\(|\.(?:write|append|mkdir|mkdtemp|rm|rename|unlink|copy|cp|symlink|link|chmod|chown|utimes|truncate|watch)\w*\s*\(/g), null);
  const opens = code.match(/\.open\([^)]*\)/g) ?? [];
  assert.equal(opens.length, 1, 'exactly one open');
  assert.match(opens[0], /O_RDONLY/);
  assert.doesNotMatch(opens[0], /O_(?:WRONLY|RDWR|CREAT|APPEND|TRUNC|EXCL)|'[wa]/);
  assert.equal(code.match(/^(?:let|var)\s|\bnew (?:Map|Set|WeakMap|WeakSet)\b|\bglobalThis\b/gm), null, 'no module state that could become a cache');
  assert.equal(code.includes('readFile'), false, 'no whole-file read');
  assert.equal(code.includes('localeCompare'), false, 'ordering is locale-independent');
});

test('T003 the project projection adds no endpoint and no key-to-path resolution', async () => {
  await withProject('project-routes', async (f, instance) => {
    f.put('.github/skills/dude-local-x/SKILL.md', markdownFor('x', 'Fine.'));
    const host = new URL(instance.url).host;
    const key = 'project:skill:dude-local-x';
    for (const route of ['/api/project', '/api/projects', '/api/project/artifacts', '/api/project-artifacts', '/api/artifacts',
      '/api/packs/project', `/api/packs/${key}`, `/api/packs/project/${key}`, `/api/project-artifacts?key=${key}`,
      `/api/packs?key=${key}`, '/api/packs?path=.github/skills/dude-local-x', '/api/packs?project=1', '/api/imports/project']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        assert.equal(await rawStatus(instance.server, { path: route, method, headers: { host, origin: instance.url.replace(/\/$/, '') } }), 404, `${method} ${route}`);
      }
    }
    const body = await readPacksRoute(instance);
    assert.deepEqual(body.project.items.map(/** @param {any} item */ item => item.key), [key]);
    const text = JSON.stringify(body);
    assert.equal(text.includes(f.root), false, 'no absolute workspace path is disclosed');
    assert.equal(text.includes(f.root.replace(/\\/g, '\\\\')), false);
    assert.equal(text.includes(os.tmpdir().replace(/\\/g, '\\\\')), false);
    assert.equal((await call(instance.url, { path: '/api/packs', method: 'POST', headers: { origin: new URL(instance.url).origin } })).status, 404);
  });
});

test('T003 an upper-range project of 256 artifacts and 128 files each is read complete; its cost and payload are measured', { timeout: 240_000 }, async t => {
  const f = projectFixture();
  const instance = await openInstance('project-upper-range', () => {}, { complete: true }, { root: f.root });
  try {
    const entry = markdownFor('x', 'Upper range artifact.');
    const longName = 'y'.repeat(64);
    const started = performance.now();
    let written = 0;
    for (let index = 0; index < 256; index += 1) {
      const id = String(index).padStart(3, '0');
      const skill = index % 2 === 0;
      const base = skill ? `.github/skills/dude-local-s${id}-${'x'.repeat(12)}` : `.github/agents/dude-local-a${id}-${'x'.repeat(12)}.support`;
      fs.mkdirSync(path.join(f.root, ...`${base}/references`.split('/')), { recursive: true });
      f.put(skill ? `${base}/SKILL.md` : `${base.replace(/\.support$/, '')}.agent.md`, entry);
      written += 1;
      for (let file = 1; file < 128; file += 1) {
        fs.writeFileSync(path.join(f.root, ...`${base}/references`.split('/'), `reference-${String(file).padStart(3, '0')}-${longName}.md`), 'r');
        written += 1;
      }
    }
    assert.equal(written, 256 * 128);
    t.diagnostic(`upper-range fixture: ${written} files in ${(performance.now() - started).toFixed(0)} ms`);

    const timings = [];
    /** @type {any} */ let scan;
    for (let run = 0; run < 3; run += 1) {
      const begun = performance.now();
      scan = await readProjectArtifacts(f.root, new AbortController().signal);
      timings.push(performance.now() - begun);
    }
    const stringified = JSON.stringify(scan);
    const bytes = Buffer.byteLength(stringified);
    t.diagnostic(`upper-range scan: ${timings.map(ms => `${ms.toFixed(0)} ms`).join(', ')} (min ${Math.min(...timings).toFixed(0)}, max ${Math.max(...timings).toFixed(0)}); projection payload ${(bytes / 1e6).toFixed(2)} MB`);
    assert.equal(scan.coverage.state, 'current');
    assert.equal(scan.items.length, 256);
    assert.ok(scan.items.every(/** @param {any} item */ item => item.files.state === 'complete' && item.files.count === 128 && item.files.paths.length === 128),
      'every file of every artifact is listed, none truncated');
    assert.ok(bytes > 4_000_000 && bytes < 6_000_000, `a payload of roughly 5 MB, not a smaller one: ${bytes} bytes`);
    assert.ok(Math.max(...timings) < 30_000, `the scan stayed well bounded: ${Math.max(...timings)} ms`);

    const requested = performance.now();
    // The explicit discovery includes the pack read, so the payload measure covers both.
    const response = await call(instance.url, { path: DISCOVER });
    const text = await response.text();
    const route = performance.now() - requested;
    t.diagnostic(`upper-range ${DISCOVER}: ${route.toFixed(0)} ms end to end for ${(Buffer.byteLength(text) / 1e6).toFixed(2)} MB (pack read included, one scan)`);
    assert.equal(response.status, 200);
    const body = JSON.parse(text);
    assert.deepEqual(body.project, scan, 'the route returns exactly the module read');
    assert.equal(body.coverage.catalog.state, 'current');
    assert.ok(route < 60_000);
  } finally {
    await closeInstance('project-upper-range');
    f.cleanup();
  }
});

/* ----------------------------------------------------------------------------
 * T008: the saved sources route, multi-source discovery and source-bound packs.
 *
 * Every GitHub case uses controlled offline acquisition. Git itself rewrites a
 * public repository URL to a local repository, or to a peer that never answers,
 * through a fixture global config, so the real reader, real Git and the real URL
 * checks run and no test reaches a network. A catch-all rewrite sends every
 * unpublished GitHub URL to a folder that does not exist, so a missed fixture
 * fails offline instead of connecting out.
 * ------------------------------------------------------------------------- */

const SOURCES_ROUTE = '/api/packs/sources';

/**
 * @param {import('node:test').TestContext} t
 * @param {ReturnType<typeof packFixture>} fixture
 */
function offlineGitHub(t, fixture) {
  const base = path.join(fixture.temporary, 'github');
  fs.mkdirSync(base);
  const config = path.join(base, 'gitconfig');
  const nowhere = pathToFileURL(path.join(base, 'unpublished')).href;
  /** @type {Map<string, string>} */
  const rewrites = new Map([['https://github.com/', `${nowhere}/`]]);
  let extra = '';
  const write = () => fs.writeFileSync(config, [...rewrites]
    .map(([from, to]) => `[url ${JSON.stringify(to)}]\n\tinsteadOf = ${from}\n`).join('') + extra);
  write();
  const saved = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let sequence = 0;
  return {
    config,
    /**
     * Publish a repository whose catalog holds `names`; it is what
     * https://github.com/<repository> clones. `files` overrides or adds files
     * before the one commit.
     * @param {string} repository `owner/repo`
     * @param {string[]} names
     * @param {{ branch?: string, files?: Record<string, string> }} [options]
     */
    publish(repository, names, { branch = 'main', files = {} } = {}) {
      const directory = path.join(base, `repository-${++sequence}`);
      fs.mkdirSync(directory);
      const git = (/** @type {string[]} */ ...args) => {
        const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        return result.stdout.trim();
      };
      git('init', '-q', '-b', branch);
      fixture.catalog(names, path.join(directory, 'library/packs'));
      for (const [relative, content] of Object.entries({ 'README.md': 'A pack source fixture.\n', ...files })) {
        const target = path.join(directory, ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
      git('add', '-A');
      git('-c', 'user.email=fixture@example.test', '-c', 'user.name=Canvas Fixture', 'commit', '-qm', 'catalog fixture');
      rewrites.set(`https://github.com/${repository}`, pathToFileURL(directory).href);
      write();
      return { url: `https://github.com/${repository}`, directory, git, commit: () => git('rev-parse', 'HEAD') };
    },
    /** Send a repository somewhere else, such as a Git peer that never answers. @param {string} repository @param {string} target */
    redirect(repository, target) {
      rewrites.set(`https://github.com/${repository}`, target);
      write();
    },
    /** Static config that stays in force across rewrites. @param {string} text */
    append(text) {
      extra += text;
      write();
    },
  };
}

/** @param {ReturnType<typeof packFixture>} fixture */
const sourcesFile = fixture => path.join(fixture.root, PACK_SOURCES_PATH);
/** The raw-bytes revision the sources route compares: `absent`, or the file's hash. @param {ReturnType<typeof packFixture>} fixture */
const savedRevision = fixture => fs.existsSync(sourcesFile(fixture)) ? packRevision(fs.readFileSync(sourcesFile(fixture))) : 'absent';
/** @param {ReturnType<typeof packFixture>} fixture @param {any[]} entries */
function saveSources(fixture, entries) {
  fs.mkdirSync(path.dirname(sourcesFile(fixture)), { recursive: true });
  fs.writeFileSync(sourcesFile(fixture), serializePackSourcesDocument(entries));
  return savedRevision(fixture);
}
/** @param {string} repository `owner/repo` @param {string} [ref] */
const remoteEntry = (repository, ref = 'main') => ({ type: 'remote', repository: `https://github.com/${repository}`, ref });
/** @param {string} location */
const localEntry = location => ({ type: 'local', location });

/**
 * A folder in the supported source layout, outside the workspace.
 * @param {ReturnType<typeof packFixture>} fixture @param {string} name @param {string[]} packs
 */
function localSource(fixture, name, packs) {
  const directory = path.join(fixture.temporary, name);
  fixture.catalog(packs, path.join(directory, 'library/packs'));
  return directory;
}

/** @param {Awaited<ReturnType<typeof packHttpFixture>>} f @param {unknown} body @param {Record<string, unknown>} [init] */
const postSources = (f, body, init = {}) => rawJson(f.instance.server, {
  path: SOURCES_ROUTE, method: 'POST',
  headers: { host: new URL(f.instance.url).host, origin: new URL(f.instance.url).origin, 'content-type': 'application/json' },
  body: JSON.stringify(body), ...init,
});
/** @param {Awaited<ReturnType<typeof packHttpFixture>>} f @param {ReturnType<typeof packFixture>} fixture @param {string} location @param {string} [ref] @param {string} [revision] */
const addSource = (f, fixture, location, ref, revision) => postSources(f,
  { op: 'add', location, ...(ref === undefined ? {} : { ref }), sourcesRevision: revision ?? savedRevision(fixture) });
/** @param {Awaited<ReturnType<typeof packHttpFixture>>} f @param {ReturnType<typeof packFixture>} fixture @param {string} key @param {string} [revision] */
const removeSource = (f, fixture, key, revision) => postSources(f, { op: 'remove', key, sourcesRevision: revision ?? savedRevision(fixture) });
/** @param {Awaited<ReturnType<typeof packHttpFixture>>} f */
const discover = async f => (await call(f.instance.url, { path: DISCOVER })).json();
/** The closed request a reader launch carried; none is the default catalog read. @param {{ options: any }} launch */
const readerRequest = launch => {
  const text = launch.options.env[CATALOG_REQUEST_ENV];
  return text === undefined ? { op: 'default' } : JSON.parse(text);
};

test('T008 the sources route admits only the exact same-origin JSON POST with closed bodies, and saves nothing otherwise', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  offlineGitHub(t, fixture);
  const f = await packHttpFixture(fixture);
  const readOnlyId = `sources-read-only-${randomUUID()}`;
  const readOnly = await openInstance(readOnlyId, () => {}, { complete: true }, { root: fixture.root });
  const host = new URL(f.instance.url).host, origin = new URL(f.instance.url).origin;
  const body = { op: 'add', location: 'https://github.com/acme/never-published', sourcesRevision: 'absent' };
  const valid = { path: SOURCES_ROUTE, method: 'POST', headers: { host, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const expectStatus = async (/** @type {any} */ request, /** @type {number} */ expected, /** @type {string} */ label) => {
    assert.equal(await rawStatus(f.instance.server, request), expected, label);
  };
  const before = snapshotFiles(fixture.root);
  const spy = spawnSpy(t);
  try {
    assert.equal(await rawStatus(readOnly.server, { ...valid, headers: {
      host: new URL(readOnly.url).host, origin: new URL(readOnly.url).origin, 'content-type': 'application/json' } }), 404,
    'a read-only Canvas exposes no sources route');
    for (const suffix of ['/', '?root=elsewhere', '/remove', '#add', '?', '/.', '%2F']) {
      await expectStatus({ ...valid, path: `${SOURCES_ROUTE}${suffix}` }, 404, `route suffix ${suffix}`);
    }
    for (const alias of ['/api/packs/./sources', '/api/packs//sources', '/api/packs/%73ources', '/api/Packs/sources',
      '/api/packs/sources/../sources', '/api/pack/sources', '/api/sources', '/api/packs/source']) {
      await expectStatus({ ...valid, path: alias }, 404, `route alias ${alias}`);
    }
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      await expectStatus({ ...valid, method, body: undefined }, 404, `method ${method}`);
    }
    for (const headers of [
      { ...valid.headers, origin: undefined }, { ...valid.headers, origin: 'null' },
      { ...valid.headers, origin: 'https://foreign.invalid' }, { ...valid.headers, host: 'foreign.invalid' },
      { ...valid.headers, 'sec-fetch-site': 'cross-site' }, { ...valid.headers, 'sec-fetch-site': 'same-site' },
    ]) {
      const supplied = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
      await expectStatus({ ...valid, headers: supplied }, 403, `headers ${JSON.stringify(supplied)}`);
    }
    await expectStatus({ ...valid, headers: { ...valid.headers, 'content-type': 'text/plain' } }, 415, 'non-JSON');
    await expectStatus({ ...valid, headers: { host, origin } }, 415, 'missing content type');
    for (const [label, rejected, status] of /** @type {Array<[string, string | Buffer, number]>} */ ([
      ['malformed JSON', '{invalid', 400], ['invalid UTF-8', Buffer.from([0xc3, 0x28]), 400],
      ['oversized streamed body', 'x'.repeat(NEEDS_YOU_LIMITS.bodyBytes + 1), 413],
    ])) {
      const refused = await rawJson(f.instance.server, { ...valid, body: rejected });
      assert.equal(refused.status, status, label);
      assert.deepEqual(refused.body, { error: 'invalid_input' }, label);
    }
    // Every closed-body refusal is the explicit invalid_input, never a generic failure.
    const key = `src_${'a'.repeat(32)}`;
    const invalid = [
      {}, [], 'x', null, 5,
      { ...body, op: 'save' }, { ...body, op: 'ADD' }, { ...body, op: undefined }, { ...body, op: 5 },
      ...['root', 'path', 'identity', 'command', 'force', 'token', 'key', 'prompt', 'source', 'destination', 'output']
        .map(field => ({ ...body, [field]: 'not allowed' })),
      { ...body, location: undefined }, { ...body, location: 5 }, { ...body, location: null },
      { ...body, location: ['https://github.com/acme/x'] }, { ...body, location: `https://github.com/acme/${'a'.repeat(4_096)}` },
      { ...body, ref: 5 }, { ...body, ref: null }, { ...body, ref: 'a'.repeat(257) },
      { ...body, sourcesRevision: undefined }, { ...body, sourcesRevision: 'ABSENT' }, { ...body, sourcesRevision: 'sha256:abc' },
      { ...body, sourcesRevision: `sha256:${'A'.repeat(64)}` }, { ...body, sourcesRevision: 5 },
      { op: 'remove', key, sourcesRevision: 'absent', location: 'https://github.com/acme/x' },
      { op: 'remove', key, sourcesRevision: 'absent', ref: 'main' },
      { op: 'remove', sourcesRevision: 'absent' }, { op: 'remove', key: 'src_short', sourcesRevision: 'absent' },
      { op: 'remove', key: `SRC_${'a'.repeat(32)}`, sourcesRevision: 'absent' },
      { op: 'remove', key: `src_${'g'.repeat(32)}`, sourcesRevision: 'absent' }, { op: 'remove', key: '../x', sourcesRevision: 'absent' },
      { op: 'remove', key, sourcesRevision: undefined }, { op: 'remove', key: 5, sourcesRevision: 'absent' },
    ];
    for (const rejected of invalid) {
      const refused = await postSources(f, rejected);
      assert.equal(refused.status, 400, JSON.stringify(rejected)?.slice(0, 80));
      assert.deepEqual(refused.body, { error: 'invalid_input' }, JSON.stringify(rejected)?.slice(0, 80));
    }
    assert.equal(spy.readers().length, 0, 'no refusal above read anything');
    const oldInput = f.instance.readInput;
    f.instance.readInput = { root: fixture.temporary };
    const wrongRoot = await postSources(f, body);
    assert.equal(wrongRoot.status, 409);
    assert.deepEqual(wrongRoot.body, { error: 'identity_mismatch' }, 'an otherwise-valid body reaches the root guard');
    f.instance.readInput = oldInput;
    // The valid control reaches validation and one candidate read, which finds nothing to clone.
    const control = await postSources(f, body);
    assert.equal(control.status, 422);
    assert.equal(/** @type {any} */ (control.body).error, 'unreachable');
    assert.equal(spy.readers().length, 1, 'one candidate read, with no separate validation helper');
    assert.equal(fs.existsSync(sourcesFile(fixture)), false, 'nothing was saved');
    assert.equal(f.provider.read().requests.length + f.provider.read().packRequests.length, 0, 'no Needs You record');
    assert.equal(f.sends.length, 0, 'nothing was sent to the session');
    assert.deepEqual(snapshotFiles(fixture.root), before);
    assert.deepEqual(fs.readdirSync(fixture.scratch), [], 'the candidate read left no root behind');
  } finally {
    await f.close();
    await closeInstance(readOnlyId);
    fixture.cleanup();
  }
});

test('T008 only the two exact pack reads are admitted: any longer, repeated, reordered or recased query is a 404 and reads nothing', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const host = new URL(f.instance.url).host;
    for (const route of [`${DISCOVER}&x=1`, `${DISCOVER}&`, '/api/packs?x=1&discover=1', '/api/packs?discover=1&discover=1',
      '/api/packs?discover=0', '/api/packs?discover=2', '/api/packs?discover=', '/api/packs?discover', '/api/packs?Discover=1',
      '/api/packs?discover=%31', '/api/packs?discover=1#fragment', '/api/packs?discover=1&root=elsewhere', '/api/packs?x=1',
      '/api/packs/?discover=1', '/api/Packs?discover=1', '/api/packs?discover=true']) {
      assert.equal(await rawStatus(f.instance.server, { path: route, headers: { host } }), 404, route);
    }
    assert.equal(spy.readers().length, 0, 'none of them started a reader');
    // The two exact reads are the only ones that are admitted.
    assert.equal(await rawStatus(f.instance.server, { path: '/api/packs', headers: { host } }), 200);
    assert.equal(await rawStatus(f.instance.server, { path: DISCOVER, headers: { host } }), 200);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add saves one validated public GitHub source after exactly one candidate read of its prospective document', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('Acme/Dude-Packs', ['rust', 'zeta', 'alpha']);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  const before = snapshotFiles(fixture.root);
  try {
    // A trailing slash and letter case are spelling; the saved entry is the normalized repository at the default ref.
    const response = await addSource(f, fixture, 'https://github.com/Acme/Dude-Packs/');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { key, count, sourcesRevision, ...rest } = /** @type {any} */ (response.body);
    assert.deepEqual(rest, {}, 'only the key, the count and the new revision are returned');
    assert.match(key, /^src_[0-9a-f]{32}$/);
    assert.equal(count, 3, 'the exact validated pack count');
    assert.equal(sourcesRevision, savedRevision(fixture), 'the returned revision is the raw bytes of the saved file');
    const saved = readPackSources(fixture.root);
    assert.deepEqual(saved.ok && saved.sources, [{ type: 'remote', repository: 'https://github.com/Acme/Dude-Packs', ref: 'main' }]);
    // Exactly one reader, over the validated prospective document, which is the document that was saved.
    const [launch] = spy.readers();
    assert.equal(spy.readers().length, 1);
    assert.deepEqual(readerRequest(launch), {
      op: 'source', index: 0, key, revision: sourcesRevision, document: 'candidate', list: true,
    });
    assert.equal(path.basename(String(launch.options.env.TMP)).startsWith('dude-canvas-packs-'), true);
    assert.deepEqual(fs.readdirSync(fixture.scratch), [], 'the reader\'s root, with the prospective document, was removed');
    const changed = [...snapshotFiles(fixture.root).keys()].filter(file => !before.has(file));
    assert.deepEqual(changed, [path.normalize(PACK_SOURCES_PATH)], 'only the sources file was written');
    assert.equal(f.provider.read().requests.length + f.provider.read().packRequests.length, 0, 'no Needs You class or request');
    assert.equal(f.sends.length, 0);
    // The returned key is the source's key in every later read.
    const read = await discover(f);
    const row = read.sources.items.find(/** @param {any} item */ item => item.key === key);
    assert.deepEqual({ status: row.status, count: row.count, repository: row.repository, ref: row.ref, scope: row.scope },
      { status: 'read', count: 3, repository: 'https://github.com/Acme/Dude-Packs', ref: 'main', scope: 'project' });
    assert.equal(read.sources.sourcesRevision, sourcesRevision);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add records a non-default ref, and a valid empty catalog is zero packs, not a refusal', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/branchy', ['alpha'], { branch: 'release/2' });
  github.publish('acme/hollow', [], { files: { 'library/packs/.gitkeep': '' } });
  const f = await packHttpFixture(fixture);
  try {
    const branch = await addSource(f, fixture, 'https://github.com/acme/branchy', 'release/2');
    assert.equal(branch.status, 200, JSON.stringify(branch.body));
    const hollow = await addSource(f, fixture, 'https://github.com/acme/hollow');
    assert.equal(hollow.status, 200, JSON.stringify(hollow.body));
    assert.equal(/** @type {any} */ (hollow.body).count, 0);
    const saved = readPackSources(fixture.root);
    assert.deepEqual(saved.ok && saved.sources, [remoteEntry('acme/branchy', 'release/2'), remoteEntry('acme/hollow')]);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add of a local folder is resolved only by helpers, never on the Canvas thread', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const team = localSource(fixture, 'team-packs', ['rust', 'alpha']);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  /** @type {string[]} */
  const touched = [];
  const fold = (/** @type {unknown} */ value) => typeof value === 'string' ? value.toLowerCase() : '';
  for (const name of /** @type {const} */ (['realpathSync', 'statSync', 'lstatSync', 'readdirSync', 'openSync', 'readFileSync', 'accessSync', 'existsSync'])) {
    const original = /** @type {any} */ (fs)[name];
    t.mock.method(fs, name, (/** @type {any[]} */ ...args) => {
      if (fold(args[0]).startsWith(fold(team))) touched.push(`${name} ${args[0]}`);
      return original(...args);
    });
  }
  try {
    // A relative location is relative to the workspace, kept as typed, and keyed by the folder's real identity.
    const relative = path.relative(fixture.root, team);
    const response = await addSource(f, fixture, relative);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(/** @type {any} */ (response.body).count, 2);
    assert.deepEqual(spy.readers().map(readerRequest).map(request => request.op), ['validate', 'source'],
      'the shared checks run in one helper, then one candidate read in another');
    assert.deepEqual(touched, [], 'the Canvas thread never touched the saved folder');
    const saved = readPackSources(fixture.root);
    assert.deepEqual(saved.ok && saved.sources, [localEntry(relative)]);
    const read = await discover(f);
    const key = /** @type {any} */ (response.body).key;
    const row = read.sources.items.find(/** @param {any} item */ item => item.key === key);
    assert.deepEqual({ type: row.type, location: row.location, status: row.status, count: row.count, name: row.name },
      { type: 'local', location: relative, status: 'read', count: 2, name: 'team-packs' });
    assert.deepEqual(touched, [], 'later reads resolve it in helpers too');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add refuses every unacceptable location, ref and folder before any read, and saves nothing', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  offlineGitHub(t, fixture);
  const team = localSource(fixture, 'team-packs', ['alpha']);
  const empty = path.join(fixture.temporary, 'no-layout');
  fs.mkdirSync(empty);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  const before = snapshotFiles(fixture.root);
  /** @type {Array<[string, string, string | undefined, number, string, boolean]>} [label, location, ref, status, code, needs a helper] */
  const cases = [
    ['credentials', 'https://user:secret@github.com/acme/dude-packs', undefined, 422, 'credentials', false],
    ['explicit default port', 'https://github.com:443/acme/dude-packs', undefined, 422, 'invalid_location', false],
    ['scp-style SSH', 'git@github.com:acme/dude-packs.git', undefined, 422, 'invalid_location', true],
    ['ssh transport', 'ssh://git@github.com/acme/dude-packs', undefined, 422, 'invalid_location', false],
    ['file URL', pathToFileURL(team).href, undefined, 422, 'invalid_location', false],
    ['plain http', 'http://github.com/acme/dude-packs', undefined, 422, 'invalid_location', false],
    ['another host', 'https://gitlab.com/acme/dude-packs', undefined, 422, 'invalid_location', false],
    ['encoded slash', 'https://github.com/acme%2Fdude-packs', undefined, 422, 'invalid_location', false],
    ['backslash', 'https://github.com\\acme\\dude-packs', undefined, 422, 'invalid_location', false],
    ['query', 'https://github.com/acme/dude-packs?tab=readme', undefined, 422, 'invalid_location', false],
    ['fragment', 'https://github.com/acme/dude-packs#readme', undefined, 422, 'invalid_location', false],
    ['a folder inside the repository', 'https://github.com/acme/dude-packs/tree/main/library', undefined, 422, 'invalid_location', false],
    ['two lines', 'https://github.com/acme/dude-packs\nhttps://github.com/acme/other', undefined, 422, 'invalid_location', false],
    ['surrounding space', ' https://github.com/acme/dude-packs', undefined, 422, 'invalid_location', true],
    ['empty', '', undefined, 422, 'invalid_location', true],
    ['over 2,048 bytes', `https://github.com/acme/${'a'.repeat(2_100)}`, undefined, 422, 'invalid_location', false],
    ['ref starting with a dash', 'https://github.com/acme/dude-packs', '-main', 422, 'invalid_ref', false],
    ['ref containing ..', 'https://github.com/acme/dude-packs', 'a..b', 422, 'invalid_ref', false],
    ['ref starting with a slash', 'https://github.com/acme/dude-packs', '/main', 422, 'invalid_ref', false],
    ['ref over 128 characters', 'https://github.com/acme/dude-packs', 'a'.repeat(129), 422, 'invalid_ref', false],
    ['ref with a space', 'https://github.com/acme/dude-packs', 'a b', 422, 'invalid_ref', false],
    ['a ref on a local folder', team, 'main', 422, 'ref_not_applicable', true],
    ['a folder that does not exist', path.join(fixture.temporary, 'missing-folder'), undefined, 422, 'local_missing', true],
    ['the bare packs folder', path.join(team, 'library', 'packs'), undefined, 422, 'bare_packs_folder', true],
    ['a folder without library/packs', empty, undefined, 422, 'local_layout', true],
    ['the workspace\'s own library', fixture.root, undefined, 422, 'own_library', true],
    ['the workspace\'s own library, relative', '.', undefined, 422, 'own_library', true],
  ];
  try {
    let helpers = 0;
    for (const [label, location, ref, status, code, helper] of cases) {
      const launched = spy.readers().length;
      const refused = await addSource(f, fixture, location, ref);
      assert.equal(refused.status, status, `${label}: ${JSON.stringify(refused.body)}`);
      assert.equal(/** @type {any} */ (refused.body).error, code, label);
      // A rejected credential never comes back in a message.
      assert.doesNotMatch(JSON.stringify(refused.body), /secret/, label);
      if (helper) helpers += spy.readers().length - launched;
      else assert.equal(spy.readers().length, launched, `${label}: refused from the text alone, before any helper`);
      assert.equal(fs.existsSync(sourcesFile(fixture)), false, `${label}: nothing saved`);
    }
    assert.ok(helpers > 0, 'folder checks ran in helpers');
    assert.ok(spy.readers().every(reader => readerRequest(reader).op === 'validate'), 'no candidate read followed a refusal');
    assert.deepEqual(snapshotFiles(fixture.root), before);
    assert.deepEqual(fs.readdirSync(fixture.scratch), []);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add reports an unreachable source, a missing catalog, bad metadata and a missing ref as their own refusals', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/no-catalog', [], { files: { 'docs/notes.md': 'No packs here.\n' } });
  github.publish('acme/bad-metadata', ['alpha', 'broken'], { files: {
    'library/packs/broken/pack.md': '---\nname: broken\nuse-cases: ui\n---\n',
  } });
  github.publish('acme/real', ['alpha']);
  const f = await packHttpFixture(fixture);
  try {
    const cases = /** @type {Array<[string, string, string | undefined, number, string, RegExp | null]>} */ ([
      ['unpublished (private or missing) repository', 'https://github.com/acme/ghost', undefined, 422, 'unreachable', /could not be fetched/],
      ['a ref the repository does not have', 'https://github.com/acme/real', 'no-such-ref', 422, 'unreachable', /could not be fetched/],
      ['a repository without library/packs', 'https://github.com/acme/no-catalog', undefined, 422, 'missing_catalog', null],
      ['a pack with invalid metadata', 'https://github.com/acme/bad-metadata', undefined, 422, 'bad_metadata', /invalid metadata.*use-cases/],
    ]);
    for (const [label, location, ref, status, code, message] of cases) {
      const refused = await addSource(f, fixture, location, ref);
      assert.equal(refused.status, status, `${label}: ${JSON.stringify(refused.body)}`);
      assert.equal(/** @type {any} */ (refused.body).error, code, label);
      if (message) assert.match(/** @type {any} */ (refused.body).message, message, label);
      assert.equal(fs.existsSync(sourcesFile(fixture)), false, `${label}: nothing saved`);
      assert.deepEqual(fs.readdirSync(fixture.scratch), [], `${label}: no acquisition root left`);
    }
    // The same fixture still adds a valid source, so each refusal above was the intended guard.
    assert.equal((await addSource(f, fixture, 'https://github.com/acme/real')).status, 200);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add refuses duplicates, the ninth source and a stale or unreadable document without a read or a write', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const upstream = github.publish('acme/upstream', ['alpha']);
  github.publish('acme/dude-packs', ['alpha']);
  fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
    `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: upstream.url, source_ref: 'main' })}\n\`\`\`\n`);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const first = await addSource(f, fixture, 'https://github.com/acme/dude-packs');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const key = /** @type {any} */ (first.body).key;
    const afterFirst = fs.readFileSync(sourcesFile(fixture));
    const readers = spy.readers().length;
    // The same source spelled another way, or at another ref, is a duplicate of the saved one, never an alias.
    for (const [location, ref] of /** @type {Array<[string, string | undefined]>} */ ([
      ['https://github.com/acme/dude-packs', undefined], ['https://github.com/ACME/Dude-Packs', undefined],
      ['https://github.com/acme/dude-packs.git', undefined], ['https://github.com/acme/dude-packs/', undefined],
      ['https://github.com/acme/dude-packs', 'release'],
    ])) {
      const refused = await addSource(f, fixture, location, ref);
      assert.equal(refused.status, 409, location);
      assert.equal(/** @type {any} */ (refused.body).error, 'duplicate', location);
      assert.equal(/** @type {any} */ (refused.body).key, key, 'names the configured source it repeats');
    }
    // The bundle's own upstream is a built-in, so it is a duplicate too.
    const builtin = await addSource(f, fixture, upstream.url);
    assert.equal(builtin.status, 409);
    assert.equal(/** @type {any} */ (builtin.body).error, 'duplicate');
    assert.equal(spy.readers().length, readers, 'duplicates are refused before any read');
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), afterFirst);
    // A revision that is not the current one is refused before any read.
    const stale = await addSource(f, fixture, 'https://github.com/acme/other', undefined, 'absent');
    assert.equal(stale.status, 409);
    assert.equal(/** @type {any} */ (stale.body).error, 'sources_changed');
    assert.equal(spy.readers().length, readers);
    // Eight added sources is the limit; the ninth is refused before any read.
    const seven = Array.from({ length: 7 }, (_, index) => remoteEntry(`acme/extra-${index}`));
    saveSources(fixture, [remoteEntry('acme/dude-packs'), ...seven]);
    const full = fs.readFileSync(sourcesFile(fixture));
    const ninth = await addSource(f, fixture, 'https://github.com/acme/ninth');
    assert.equal(ninth.status, 409);
    assert.equal(/** @type {any} */ (ninth.body).error, 'limit');
    assert.equal(spy.readers().length, readers);
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), full);
    // An unreadable document is reported, never reset to an empty list.
    for (const unreadable of ['not a sources document', '# Sources\n\n```json\n{"sources":[],"extra":1}\n```\n']) {
      fs.writeFileSync(sourcesFile(fixture), unreadable);
      const refused = await addSource(f, fixture, 'https://github.com/acme/dude-packs', undefined, savedRevision(fixture));
      assert.equal(refused.status, 409);
      assert.equal(/** @type {any} */ (refused.body).error, 'sources_unavailable');
      assert.equal(fs.readFileSync(sourcesFile(fixture), 'utf8'), unreadable, 'never reset');
    }
    assert.equal(spy.readers().length, readers);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 add stops a stalled source at the deadline, kills its whole tree, removes its root and saves nothing', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  github.redirect('acme/slow', listener.url('git'));
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  let tree = /** @type {ProcessRow[]} */ ([]);
  try {
    const started = performance.now();
    const pending = addSource(f, fixture, 'https://github.com/acme/slow');
    await listener.connected();
    tree = await readerTree(spy.readers()[0]?.child.pid);
    const response = await pending;
    const elapsed = performance.now() - started;
    assert.equal(response.status, deadlineCoverage(kills).reason === 'catalog_cleanup_failed' ? 503 : 504, JSON.stringify(response.body));
    assert.equal(/** @type {any} */ (response.body).error, deadlineCoverage(kills).reason === 'catalog_cleanup_failed' ? 'cleanup_unconfirmed' : 'timeout');
    assert.ok(elapsed >= 5_000 && elapsed < 7_500, `within the deadline plus stop confirmation: ${elapsed} ms`);
    assert.equal(listener.open, 0, 'no Git process still holds the stalled connection');
    await assertTreeStops({ t, spy, kills, trees: [tree], scratch: fs.readdirSync(fixture.scratch) });
    assert.equal(fs.existsSync(sourcesFile(fixture)), false);
    assert.equal(spy.readers().length, 1);
  } finally { await f.close(); await stopRecorded(tree); fixture.cleanup(); }
});

test('T008 add keeps newer saved bytes when they changed during the read, and an ended Canvas saves nothing', async t => {
  await t.test('the sources file changed during the candidate read', async t => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    const github = offlineGitHub(t, fixture);
    github.publish('acme/dude-packs', ['alpha']);
    const newer = serializePackSourcesDocument([remoteEntry('acme/other-edit')]);
    const spawn = childProcess.spawn;
    t.mock.method(childProcess, 'spawn', /** @this {any} */ function (/** @type {any} */ command, /** @type {any} */ args, /** @type {any} */ options) {
      const child = spawn.call(this, command, args, options);
      if (Array.isArray(args) && args.includes(READER) && readerRequest({ options }).document === 'candidate') {
        // Another editor saves between the read's start and the commit.
        fs.mkdirSync(path.dirname(sourcesFile(fixture)), { recursive: true });
        fs.writeFileSync(sourcesFile(fixture), newer);
      }
      return child;
    });
    const f = await packHttpFixture(fixture);
    try {
      const refused = await addSource(f, fixture, 'https://github.com/acme/dude-packs');
      assert.equal(refused.status, 409, JSON.stringify(refused.body));
      assert.equal(/** @type {any} */ (refused.body).error, 'sources_changed');
      assert.equal(fs.readFileSync(sourcesFile(fixture), 'utf8'), newer, 'the newer bytes are neither merged nor replaced');
    } finally { await f.close(); fixture.cleanup(); }
  });
  await t.test('the Canvas lifetime ended during the candidate read', async t => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    const github = offlineGitHub(t, fixture);
    github.publish('acme/dude-packs', ['alpha']);
    const spy = spawnSpy(t);
    const kills = taskkillSpy(t);
    const f = await packHttpFixture(fixture);
    const spawn = childProcess.spawn;
    /** @type {Promise<boolean> | null} */
    let closing = null;
    t.mock.method(childProcess, 'spawn', /** @this {any} */ function (/** @type {any} */ command, /** @type {any} */ args, /** @type {any} */ options) {
      const child = spawn.call(this, command, args, options);
      if (Array.isArray(args) && args.includes(READER) && readerRequest({ options }).document === 'candidate') {
        closing = closeInstance(f.instanceId);
      }
      return child;
    });
    try {
      const outcome = await addSource(f, fixture, 'https://github.com/acme/dude-packs').catch(() => null);
      if (outcome) assert.ok([409, 503].includes(/** @type {number} */ (outcome.status)), JSON.stringify(outcome));
      assert.equal(await closing, true);
      assert.equal(fs.existsSync(sourcesFile(fixture)), false, 'an ended Canvas saves nothing');
      if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
      else assert.deepEqual(fs.readdirSync(fixture.scratch), []);
    } finally { await f.close(); fixture.cleanup(); }
  });
  await t.test('the workspace was replaced before the commit', async t => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    const github = offlineGitHub(t, fixture);
    github.publish('acme/dude-packs', ['alpha']);
    const moved = path.join(fixture.temporary, 'previous-workspace');
    try {
      const result = /** @type {any} */ (await addPackSource(fixture.root, new AbortController().signal,
        { location: 'https://github.com/acme/dude-packs', sourcesRevision: 'absent' },
        { beforeCommit: () => { fs.renameSync(fixture.root, moved); fs.cpSync(moved, fixture.root, { recursive: true }); } }));
      assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code: 'workspace_changed' });
      assert.equal(fs.existsSync(sourcesFile(fixture)), false, 'the replacement root received nothing');
      assert.equal(fs.existsSync(path.join(moved, PACK_SOURCES_PATH)), false, 'nor did the old one');
    } finally { fixture.cleanup(); }
  });
});

test('T008 a lost add response is unconfirmed until read: a replay never saves twice', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/dude-packs', ['alpha']);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const request = { op: 'add', location: 'https://github.com/acme/dude-packs', sourcesRevision: 'absent' };
    const first = await postSources(f, request);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const saved = fs.readFileSync(sourcesFile(fixture));
    // The same request again, as a client that never saw the response would send it.
    const replay = await postSources(f, request);
    assert.equal(replay.status, 409);
    assert.equal(/** @type {any} */ (replay.body).error, 'sources_changed', 'the old revision is stale, and the refusal does not claim nothing was saved');
    // Reading the current state first shows the entry, and the next add is a duplicate, not a second entry.
    const current = await discover(f);
    assert.equal(current.sources.sourcesRevision, /** @type {any} */ (first.body).sourcesRevision);
    const again = await postSources(f, { ...request, sourcesRevision: current.sources.sourcesRevision });
    assert.equal(again.status, 409);
    assert.equal(/** @type {any} */ (again.body).error, 'duplicate');
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), saved);
    assert.equal(spy.readers().filter(reader => readerRequest(reader).document === 'candidate').length, 1,
      'only the first request ever read a candidate');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 every reader gets reader-local noninteractive Git settings, appended to the user\'s own, and no Git config is changed', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/dude-packs', ['alpha']);
  const configBytes = fs.readFileSync(github.config);
  const keys = ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1',
    'GIT_ASKPASS', 'SSH_ASKPASS', 'GCM_INTERACTIVE', 'GIT_CONFIG_PARAMETERS'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const spy = spawnSpy(t);
  /** @param {Record<string, string | undefined>} launch @param {number} userEntries @param {string} [inherited] the user's own GIT_CONFIG_PARAMETERS */
  const assertReaderGit = (launch, userEntries, inherited = '') => {
    assert.equal(launch.GIT_TERMINAL_PROMPT, '0');
    assert.equal(launch.GIT_ASKPASS, '', 'no askpass program can answer');
    assert.equal(launch.SSH_ASKPASS, '');
    assert.equal(launch.GCM_INTERACTIVE, 'never');
    assert.equal(launch.GIT_CONFIG_COUNT, String(userEntries + 1), 'one entry is appended after the user\'s own');
    assert.equal(launch[`GIT_CONFIG_KEY_${userEntries}`], 'credential.helper');
    assert.equal(launch[`GIT_CONFIG_VALUE_${userEntries}`], '', 'an empty helper resets the list, so no helper answers');
    // Git applies GIT_CONFIG_PARAMETERS after GIT_CONFIG_COUNT, so the reset must be the last thing it carries too.
    assert.equal(launch.GIT_CONFIG_PARAMETERS, `${inherited ? `${inherited} ` : ''}'credential.helper='`,
      'the user\'s own entries are kept, and an empty helper resets the list after them');
  };
  try {
    const signal = new AbortController().signal;
    for (const key of keys) delete process.env[key];
    await readPacks(fixture.root, signal);
    saveSources(fixture, [remoteEntry('acme/dude-packs')]);
    await readPacks(fixture.root, signal, { discover: true });
    assert.ok(spy.readers().length >= 3, 'default, default and the saved source were read');
    for (const launch of spy.readers()) assertReaderGit(launch.options.env, 0);
    // The user's own GIT_CONFIG_COUNT and GIT_CONFIG_PARAMETERS entries are kept, and ours follows them.
    const inherited = "'http.proxy=http://proxy.example.test:3128' 'credential.https://example.test.helper'='store'";
    Object.assign(process.env, { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'Someone',
      GIT_CONFIG_KEY_1: 'core.pager', GIT_CONFIG_VALUE_1: 'cat', GIT_ASKPASS: '/usr/bin/ssh-askpass', SSH_ASKPASS: '/usr/bin/ssh-askpass',
      GIT_CONFIG_PARAMETERS: inherited });
    const launched = spy.readers().length;
    await readPacks(fixture.root, signal, { discover: true });
    const later = spy.readers().slice(launched);
    assert.ok(later.length >= 2);
    for (const launch of later) {
      assertReaderGit(launch.options.env, 2, inherited);
      assert.equal(launch.options.env.GIT_CONFIG_KEY_0, 'user.name');
      assert.equal(launch.options.env.GIT_CONFIG_VALUE_0, 'Someone');
      assert.equal(launch.options.env.GIT_CONFIG_KEY_1, 'core.pager');
      assert.equal(launch.options.env.GIT_CONFIG_VALUE_1, 'cat', 'the user\'s own entries are kept as they are');
    }
    // Nothing writes any Git configuration: the fixture's own config is byte-identical, and the process environment's is unchanged.
    assert.deepEqual(fs.readFileSync(github.config), configBytes);
    assert.equal(process.env.GIT_CONFIG_COUNT, '2');
    assert.equal(process.env.GIT_CONFIG_PARAMETERS, inherited);
  } finally { fixture.cleanup(); }
});

test('T008 a private source fails visibly: an ambient credential helper never reaches it', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  /** @type {Array<string | null>} */
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push(request.headers.authorization ?? null);
    if (request.headers.authorization) { response.writeHead(404); response.end('authorized, but no such repository'); return; }
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="private"' });
    response.end('private');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  t.after(async () => { await new Promise(resolve => server.close(() => resolve(undefined))); });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const slash = (/** @type {string} */ value) => value.replaceAll('\\', '/');
  // The user's machine is signed in: a credential helper that always answers.
  const helper = path.join(fixture.temporary, 'ambient-helper.sh');
  fs.writeFileSync(helper, '#!/bin/sh\nif [ "$1" = get ]; then echo username=ambient; echo password=secret; fi\n');
  github.append(`[credential]\n\thelper = !sh ${slash(helper)}\n`);
  github.redirect('acme/private', `http://127.0.0.1:${port}/acme/private`);
  const f = await packHttpFixture(fixture);
  try {
    // Control: without the reader's settings, the same Git and config do send the ambient credential.
    const control = await new Promise(resolve => {
      const child = childProcess.spawn('git', ['clone', '--quiet', '--depth=1', '--branch', 'main', 'https://github.com/acme/private',
        path.join(fixture.temporary, 'control-clone')], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: 'ignore', windowsHide: true });
      child.once('close', code => resolve(code));
    });
    assert.notEqual(control, 0);
    assert.ok(seen.some(Boolean), 'the fixture\'s ambient helper is real: it supplied a credential');
    seen.length = 0;
    const refused = await addSource(f, fixture, 'https://github.com/acme/private');
    assert.equal(refused.status, 422, JSON.stringify(refused.body));
    assert.equal(/** @type {any} */ (refused.body).error, 'unreachable');
    assert.ok(seen.length > 0, 'the reader did contact the private host');
    assert.deepEqual(seen.filter(Boolean), [], 'and sent no credential to it');
    assert.equal(fs.existsSync(sourcesFile(fixture)), false);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a private source fails visibly: a helper inherited through GIT_CONFIG_PARAMETERS never reaches it either', { timeout: 90_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  /** @type {Array<string | null>} */
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push(request.headers.authorization ?? null);
    if (request.headers.authorization) { response.writeHead(404); response.end('authorized, but no such repository'); return; }
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="private"' });
    response.end('private');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  t.after(async () => { await new Promise(resolve => server.close(() => resolve(undefined))); });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const wall = `http://127.0.0.1:${port}`;
  const slash = (/** @type {string} */ value) => value.replaceAll('\\', '/');
  /** A credential helper that records each call it gets and answers with a login. @param {string} name */
  const helper = name => {
    const script = path.join(fixture.temporary, `${name}-helper.sh`);
    const calls = path.join(fixture.temporary, `${name}-calls.txt`);
    fs.writeFileSync(calls, '');
    fs.writeFileSync(script, `#!/bin/sh\necho "$1" >> "${slash(calls)}"\nif [ "$1" = get ]; then echo username=${name}; echo password=${name}-secret; fi\n`);
    return { command: `!sh ${slash(script)}`, calls, called: () => fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean) };
  };
  const scoped = helper('scoped'), unscoped = helper('unscoped');
  github.redirect('acme/private', `${wall}/acme/private`);
  // The same two helpers as `git -c` or a host exports them: one scoped to the wall's URL and one for every
  // URL, in the format Git writes and in its older format.
  const carriers = /** @type {Array<[string, string, string]>} */ ([
    ['the format Git writes', `'credential.${wall}.helper'='${scoped.command}'`, `'credential.helper'='${unscoped.command}'`],
    ['the older format', `'credential.${wall}.helper=${scoped.command}'`, `'credential.helper=${unscoped.command}'`],
  ]);
  const saved = process.env.GIT_CONFIG_PARAMETERS;
  t.after(() => { if (saved === undefined) delete process.env.GIT_CONFIG_PARAMETERS; else process.env.GIT_CONFIG_PARAMETERS = saved; });
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  /** Plain Git, as it runs for anyone whose environment carries these helpers. @param {string} parameters */
  const control = parameters => new Promise(resolve => {
    const child = childProcess.spawn('git', ['clone', '--quiet', '--depth=1', '--branch', 'main', 'https://github.com/acme/private',
      path.join(fixture.temporary, `control-clone-${randomUUID()}`)],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_PARAMETERS: parameters }, stdio: 'ignore', windowsHide: true });
    child.once('close', code => resolve(code));
  });
  const reset = () => { seen.length = 0; fs.writeFileSync(scoped.calls, ''); fs.writeFileSync(unscoped.calls, ''); };
  try {
    for (const [format, scopedEntry, unscopedEntry] of carriers) {
      // Controls: without the reader's settings each helper does answer, so what follows cannot pass by accident.
      for (const [label, entry, trap] of /** @type {Array<[string, string, typeof scoped]>} */ ([
        ['URL-scoped', scopedEntry, scoped], ['unscoped', unscopedEntry, unscoped]])) {
        reset();
        assert.notEqual(await control(entry), 0, `${format}: the wall never serves the repository`);
        assert.ok(trap.called().includes('get'), `${format}: plain Git asks the ${label} helper`);
        assert.ok(seen.some(Boolean), `${format}: and sends the login that helper answered with`);
      }
      reset();
      process.env.GIT_CONFIG_PARAMETERS = `${scopedEntry} ${unscopedEntry}`;
      const launched = spy.readers().length;
      const refused = await addSource(f, fixture, 'https://github.com/acme/private');
      assert.equal(refused.status, 422, `${format}: ${JSON.stringify(refused.body)}`);
      assert.equal(/** @type {any} */ (refused.body).error, 'unreachable');
      assert.ok(seen.length > 0, `${format}: the reader did contact the private host`);
      assert.deepEqual(seen.filter(Boolean), [], `${format}: and sent no credential to it`);
      assert.deepEqual(scoped.called(), [], `${format}: the URL-scoped helper was never run`);
      assert.deepEqual(unscoped.called(), [], `${format}: neither was the unscoped one`);
      const launches = spy.readers().slice(launched);
      assert.ok(launches.length >= 1);
      for (const launch of launches) {
        assert.equal(launch.options.env.GIT_CONFIG_PARAMETERS, `${scopedEntry} ${unscopedEntry} 'credential.helper='`,
          `${format}: the inherited entries are kept, and the last word is an empty helper`);
      }
      assert.equal(fs.existsSync(sourcesFile(fixture)), false);
    }
  } finally { await f.close(); fixture.cleanup(); }
});

/**
 * A loopback peer that answers 401 to a request without credentials, and records the Authorization and User-Agent
 * headers of every request it gets, `null` when there is none. With credentials it says no such repository, so Git
 * never gets one from it.
 * @param {import('node:test').TestContext} t
 */
async function privateWall(t) {
  /** @type {Array<string | null>} */
  const seen = [];
  /** @type {Array<string | null>} */
  const agents = [];
  const server = http.createServer((request, response) => {
    seen.push(request.headers.authorization ?? null);
    agents.push(request.headers['user-agent'] ?? null);
    if (request.headers.authorization) { response.writeHead(404); response.end('authorized, but no such repository'); return; }
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="private"' });
    response.end('private');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  t.after(async () => { await new Promise(resolve => server.close(() => resolve(undefined))); });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    seen,
    agents,
    url: `http://127.0.0.1:${port}`,
    /** The logins those requests carried, as `user:password`. */
    logins: () => seen.filter(Boolean).map(header => Buffer.from(String(header).replace(/^Basic /, ''), 'base64').toString()),
    reset: () => { seen.length = 0; agents.length = 0; },
  };
}

test('T008 a private source fails visibly: a ~/.netrc login never reaches it, while the user\'s own Git configuration still does', { timeout: 240_000 }, async t => {
  // Everything this test changes in the process environment, taken before the offline fixture changes its own.
  const changed = ['HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL',
    'https_proxy', 'HTTPS_PROXY', 'NO_PROXY', 'no_proxy'];
  const saved = Object.fromEntries(changed.map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const wall = await privateWall(t);
  github.redirect('acme/private', `${wall.url}/acme/private`);
  // The user's own Git configuration: the fixture's rewrites, the only way for https://github.com/acme/private to reach the wall.
  const rewrites = fs.readFileSync(github.config, 'utf8');
  // A missed rewrite goes to a closed proxy, so it fails offline and the wall is never contacted.
  const closedPort = await new Promise(resolve => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address());
      probe.close(() => resolve(port));
    });
  });
  const home = path.join(fixture.temporary, 'netrc-home');
  const login = 'login netrcuser\npassword netrcpass\n';
  // Each shape is kept only because plain Git sends its login: the control below asserts that for every one.
  const netrcs = /** @type {Array<[string, Record<string, string>]>} */ ([
    ['.netrc with a machine entry', { '.netrc': `machine 127.0.0.1\n${login}` }],
    ['.netrc with a default entry', { '.netrc': `default\n${login}` }],
    // libcurl reads _netrc on Windows only, and only when there is no .netrc.
    ...(process.platform === 'win32' ? [['_netrc alone', { _netrc: `machine 127.0.0.1\n${login}` }]] : []),
  ]);
  // The places the user's own Git configuration can be. The reader's Git home is redirected, so in all but the first the
  // wall is reached only if the reader still reads that configuration where the user keeps it. In the last, both
  // files exist and Git reads the XDG file first, so `~/.gitconfig` has the last word on a single-valued setting.
  const xdgConfig = path.join(home, 'xdg', 'git', 'config');
  /** @param {string} text */
  const writeXdg = text => { fs.mkdirSync(path.dirname(xdgConfig), { recursive: true }); fs.writeFileSync(xdgConfig, text); };
  const ways = /** @type {Array<{ name: string, configure: () => void, keepsOwnGlobal?: boolean, userAgent?: string }>} */ ([
    { name: 'GIT_CONFIG_GLOBAL as the offline fixture sets it', keepsOwnGlobal: true,
      configure: () => { process.env.GIT_CONFIG_GLOBAL = github.config; } },
    { name: 'GIT_CONFIG_GLOBAL unset, the rewrites in ~/.gitconfig', configure: () => {
      delete process.env.GIT_CONFIG_GLOBAL;
      fs.writeFileSync(path.join(home, '.gitconfig'), rewrites);
    } },
    { name: 'GIT_CONFIG_GLOBAL unset, the rewrites only in $XDG_CONFIG_HOME/git/config', configure: () => {
      delete process.env.GIT_CONFIG_GLOBAL;
      process.env.XDG_CONFIG_HOME = path.join(home, 'xdg');
      writeXdg(rewrites);
    } },
    { name: 'GIT_CONFIG_GLOBAL unset, the rewrites in $XDG_CONFIG_HOME/git/config and a User-Agent in both files', userAgent: 'from-dotgitconfig',
      configure: () => {
        delete process.env.GIT_CONFIG_GLOBAL;
        process.env.XDG_CONFIG_HOME = path.join(home, 'xdg');
        writeXdg(`${rewrites}[http]\n\tuserAgent = from-xdg\n`);
        fs.writeFileSync(path.join(home, '.gitconfig'), '[http]\n\tuserAgent = from-dotgitconfig\n');
      } },
  ]);
  /** What names a home folder to Git and libcurl: HOME and USERPROFILE, and on Windows its drive and path too. @param {string} directory */
  const homeOf = directory => {
    const { root } = path.parse(directory);
    return { HOME: directory, USERPROFILE: directory,
      ...(process.platform === 'win32' ? { HOMEDRIVE: root.replace(/[\\/]$/, ''), HOMEPATH: directory.slice(root.length - 1) } : {}) };
  };
  /** Plain Git, as it runs for anyone whose home holds one of those files. */
  const control = () => new Promise(resolve => {
    const child = childProcess.spawn('git', ['clone', '--quiet', '--depth=1', '--branch', 'main', 'https://github.com/acme/private',
      path.join(fixture.temporary, `control-clone-${randomUUID()}`)], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: 'ignore', windowsHide: true });
    child.once('close', code => resolve(code));
  });
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    for (const { name: way, configure, keepsOwnGlobal, userAgent } of ways) {
      for (const [shape, files] of netrcs) {
        const label = `${shape}; ${way}`;
        // A scratch home that holds the login, and what that way keeps there.
        fs.rmSync(home, { recursive: true, force: true });
        fs.mkdirSync(home);
        for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(home, name), text);
        delete process.env.XDG_CONFIG_HOME;
        Object.assign(process.env, homeOf(home), { https_proxy: `http://127.0.0.1:${closedPort}`, HTTPS_PROXY: `http://127.0.0.1:${closedPort}`,
          NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' });
        configure();
        // Control, so nothing passes by accident: plain Git, in the same environment, sends the login.
        wall.reset();
        assert.notEqual(await control(), 0, `${label}: the wall never serves the repository`);
        assert.ok(wall.logins().includes('netrcuser:netrcpass'), `${label}: plain Git sends the login in the home's netrc file: ${JSON.stringify(wall.seen)}`);
        if (userAgent) assert.deepEqual([...new Set(wall.agents)], [userAgent], `${label}: plain Git reads the XDG file, then ~/.gitconfig`);
        wall.reset();
        const launched = spy.readers().length;
        const refused = await addSource(f, fixture, 'https://github.com/acme/private');
        assert.equal(refused.status, 422, `${label}: ${JSON.stringify(refused.body)}`);
        assert.equal(/** @type {any} */ (refused.body).error, 'unreachable', label);
        assert.ok(wall.seen.length > 0, `${label}: the reader did contact the private host, so it read the user's own Git configuration`);
        assert.deepEqual(wall.seen.filter(Boolean), [], `${label}: and sent no login to it`);
        if (userAgent) assert.deepEqual([...new Set(wall.agents)], [userAgent], `${label}: and read both files, in Git's order`);
        assert.equal(fs.existsSync(sourcesFile(fixture)), false, label);
        const launches = spy.readers().slice(launched);
        assert.ok(launches.length >= 1, label);
        for (const { options: { env } } of launches) {
          // The launch leaves every spelling of the home as this process has it: the CLI's own loader and bootstrap start
          // from it, and the reader moves only its Git's home, itself, once it runs.
          assert.equal(env.HOME, process.env.HOME, `${label}: the launch leaves HOME as the server has it`);
          assert.equal(env.USERPROFILE, process.env.USERPROFILE, `${label}: and USERPROFILE`);
          if (process.platform === 'win32') {
            assert.equal(`${env.HOMEDRIVE}${env.HOMEPATH}`, `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`, `${label}: and HOMEDRIVE and HOMEPATH`);
          }
          assert.equal(path.dirname(String(env[CATALOG_GIT_HOME_ENV])), env.TMP, `${label}: the reader's own Git home is a folder in its own root`);
          if (keepsOwnGlobal) assert.equal(env.GIT_CONFIG_GLOBAL, github.config, `${label}: the user's own GIT_CONFIG_GLOBAL is kept`);
        }
        assert.deepEqual(fs.readdirSync(fixture.scratch), [], `${label}: the reader's root, with its home, was removed`);
      }
    }
  } finally { await f.close(); fixture.cleanup(); }
});

/**
 * Run the real reader as a process of its own on the default read of `fixture`'s workspace, with this process's
 * environment plus `given` and nothing else: no launch from `packs.mjs`, so nothing but `given` names its Git home. A
 * recording preload, which Node loads before the reader's own module as `stallResolutionOf` loads its stall, notes every
 * home variable, and `os.homedir()`, when the reader starts and again at the moment it sends its answer.
 * @param {ReturnType<typeof packFixture>} fixture
 * @param {Record<string, string>} given
 */
async function runReaderAlone(fixture, given) {
  const records = path.join(fixture.temporary, `homes-${randomUUID()}.jsonl`);
  const preload = path.join(fixture.temporary, 'record-homes.mjs');
  fs.writeFileSync(preload, [
    "import fs from 'node:fs';",
    "import os from 'node:os';",
    `const homes = ${JSON.stringify(HOME_VARIABLES)};`,
    'const note = when => fs.appendFileSync(process.env.DUDE_TEST_HOME_RECORDS, JSON.stringify({',
    "  when, ...Object.fromEntries(homes.map(key => [key, process.env[key] ?? null])), homedir: os.homedir() }) + '\\n');",
    "note('start');",
    'const send = process.send?.bind(process);',
    "if (send) process.send = (...args) => { note('answer'); return send(...args); };",
    '',
  ].join('\n'));
  const environment = { ...process.env, DUDE_TEST_HOME_RECORDS: records,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ''}--import=${pathToFileURL(preload).href}` };
  delete environment[CATALOG_REQUEST_ENV];
  delete environment[CATALOG_GIT_HOME_ENV];
  Object.assign(environment, given);
  const answer = await new Promise((resolve, reject) => {
    const child = fork(READER, [fixture.root], { cwd: fixture.root, env: environment, execArgv: [], silent: true });
    /** @type {any} */
    let message;
    let stderr = '';
    child.stdout?.resume();
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('message', value => { message = value; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 && message !== undefined ? resolve(message) : reject(new Error(`the reader exited with ${code} without an answer: ${stderr}`))));
  });
  /** @type {Array<{ when: string } & Record<string, string | null>>} */
  const noted = fs.readFileSync(records, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const homesAt = (/** @type {string} */ when) => {
    const { when: _, ...homes } = /** @type {NonNullable<typeof noted[number]>} */ (noted.find(entry => entry.when === when));
    return homes;
  };
  return { answer, started: homesAt('start'), answered: homesAt('answer') };
}

test('T008 the reader moves its own Git home only once it runs, to the folder it was given, and reads nothing without one', { timeout: 90_000 }, async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  try {
    // The home this process has, which every reader here is launched with.
    const own = { ...Object.fromEntries(HOME_VARIABLES.map(key => [key, process.env[key] ?? null])), homedir: os.homedir() };
    // As `packs.mjs` makes it: a folder directly in the reader's own temporary root.
    const home = path.join(fixture.scratch, 'home');
    fs.mkdirSync(home);
    const given = await runReaderAlone(fixture, { [CATALOG_GIT_HOME_ENV]: home });
    assert.equal(given.answer.ok, true, JSON.stringify(given.answer));
    assert.deepEqual(given.answer.result.packs.map(/** @param {any} pack */ pack => pack.name), ['alpha']);
    assert.deepEqual(given.started, own, 'the reader starts with the home it was launched with, as any loader that runs first finds it');
    assert.equal(given.answered.HOME, home, 'and by its answer HOME is its own folder');
    assert.equal(given.answered.USERPROFILE, home);
    assert.equal(given.answered.homedir, home, 'os.homedir() follows');
    if (process.platform === 'win32') {
      assert.equal(`${given.answered.HOMEDRIVE}${given.answered.HOMEPATH}`, home, 'every Windows spelling of the home agrees');
    } else {
      for (const key of ['HOMEDRIVE', 'HOMEPATH']) assert.equal(given.answered[key], given.started[key], `${key} is a Windows variable, and stays as it was`);
    }
    // Anything else is no home that this reader owns: it answers unavailable, reads no catalog, and moves nothing.
    const refusals = /** @type {Array<[string, Record<string, string>]>} */ ([
      ['no variable', {}],
      ['an empty value', { [CATALOG_GIT_HOME_ENV]: '' }],
      ['a relative path', { [CATALOG_GIT_HOME_ENV]: 'home' }],
      ['a folder beside the reader\'s root, not in it', { [CATALOG_GIT_HOME_ENV]: path.join(fixture.temporary, 'home') }],
      ['a folder below a folder of the reader\'s root', { [CATALOG_GIT_HOME_ENV]: path.join(fixture.scratch, 'nested', 'home') }],
      ['the reader\'s own root', { [CATALOG_GIT_HOME_ENV]: fixture.scratch }],
      ['a path that climbs out of the root', { [CATALOG_GIT_HOME_ENV]: `${fixture.scratch}${path.sep}..${path.sep}home` }],
    ]);
    for (const [label, variables] of refusals) {
      const refused = await runReaderAlone(fixture, variables);
      assert.deepEqual([refused.answer.ok, refused.answer.reason], [false, 'catalog_unavailable'], `${label}: ${JSON.stringify(refused.answer)}`);
      assert.equal(typeof refused.answer.error, 'string', label);
      assert.equal(refused.answer.result, undefined, `${label}: no catalog was read, though the workspace has one`);
      assert.deepEqual(refused.answered, refused.started, `${label}: no home moved`);
    }
  } finally { fixture.cleanup(); }
});

test('T008 importing the reader moves no home, even with its private Git home set and an IPC channel to answer on', { timeout: 30_000 }, async () => {
  const fixture = packFixture();
  try {
    // As `packs.mjs` launches a reader: the variable names a folder directly in the process's own temporary root.
    const home = path.join(fixture.scratch, 'home');
    fs.mkdirSync(home);
    const importer = path.join(fixture.temporary, 'import-reader.mjs');
    fs.writeFileSync(importer, [
      "import os from 'node:os';",
      `const homes = ${JSON.stringify(HOME_VARIABLES)};`,
      'const snapshot = () => ({ ...Object.fromEntries(homes.map(key => [key, process.env[key] ?? null])), homedir: os.homedir() });',
      'const before = snapshot();',
      `await import(${JSON.stringify(pathToFileURL(READER).href)});`,
      'process.send({ before, after: snapshot() }, () => process.exit(0));',
      '',
    ].join('\n'));
    /** @type {any[]} */
    const messages = await new Promise((resolve, reject) => {
      const child = fork(importer, [], { cwd: fixture.root, env: { ...process.env, [CATALOG_GIT_HOME_ENV]: home }, execArgv: [], silent: true });
      /** @type {any[]} */
      const received = [];
      let stderr = '';
      child.stdout?.resume();
      child.stderr?.on('data', chunk => { stderr += chunk; });
      child.on('message', value => { received.push(value); });
      child.once('error', reject);
      child.once('exit', code => (code === 0 ? resolve(received) : reject(new Error(`the importer exited with ${code}: ${stderr}`))));
    });
    assert.equal(messages.length, 1, 'only the importer answered: importing the module started no read');
    assert.deepEqual(messages[0].after, messages[0].before, 'importing the module moved no home');
  } finally { fixture.cleanup(); }
});

test('T008 a prewritten stop marker holds direct and bootstrap reader process starts until termination', { timeout: 40_000 }, async t => {
  for (const bootstrap of [false, true]) await t.test(bootstrap ? 'bootstrap importer with IPC' : 'direct reader with IPC', async t => {
    const listener = await silentGitListener(t);
    const fixture = packFixture();
    fixture.profile({});
    stallCatalog(fixture, listener.url('git'));
    const home = path.join(fixture.scratch, 'home');
    const marker = path.join(fixture.scratch, CATALOG_STOP_MARKER);
    fs.mkdirSync(home);
    const preload = path.join(fixture.temporary, 'observe-reader-gate.mjs');
    fs.writeFileSync(preload, [
      "import fs from 'node:fs';",
      "import childProcess from 'node:child_process';",
      "import { syncBuiltinESMExports } from 'node:module';",
      `const marker = ${JSON.stringify(marker)};`,
      'const note = (phase, fields = {}) => process.send?.({ phase, ...fields, home: process.env.HOME });',
      'const exists = fs.existsSync;',
      'fs.existsSync = function (file) {',
      '  const present = exists.apply(this, arguments);',
      "  if (file === marker) note('gate', { present });",
      '  return present;',
      '};',
      'const spawn = childProcess.spawnSync;',
      "childProcess.spawnSync = function (...args) { note('spawn', { command: args[0] }); return spawn.apply(this, args); };",
      'syncBuiltinESMExports();',
      '',
    ].join('\n'));
    const importer = path.join(fixture.temporary, 'extension_bootstrap.mjs');
    fs.writeFileSync(importer, [
      "import { pathToFileURL } from 'node:url';",
      'if (process.ppid !== Number(process.env.COPILOT_EXTENSION_PARENT_PID)) process.exit(1);',
      "process.send({ phase: 'bootstrap', home: process.env.HOME });",
      'await import(pathToFileURL(process.env.EXTENSION_PATH).href);',
      '',
    ].join('\n'));
    try {
      for (const held of [true, false]) {
        if (held) fs.writeFileSync(marker, '');
        else fs.unlinkSync(marker);
        const env = { ...process.env, TMP: fixture.scratch, TEMP: fixture.scratch, TMPDIR: fixture.scratch,
          [CATALOG_GIT_HOME_ENV]: home, GIT_TERMINAL_PROMPT: '0',
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ''}--import=${pathToFileURL(preload).href}`,
          ...(bootstrap ? { EXTENSION_PATH: READER, COPILOT_EXTENSION_PARENT_PID: String(process.pid) } : {}) };
        delete env[CATALOG_REQUEST_ENV];
        const child = childProcess.spawn(process.execPath, bootstrap ? [importer, READER, fixture.root] : [READER, fixture.root],
          { cwd: fixture.root, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
        /** @type {any[]} */
        const messages = [];
        let stderr = '';
        child.stderr?.on('data', chunk => { stderr += chunk; });
        child.on('error', error => { stderr += error.message; });
        const ready = new Promise(resolve => child.on('message', message => {
          const value = /** @type {any} */ (message);
          messages.push(value);
          if (value.phase === 'gate' || value.phase === 'spawn') resolve(value);
        }));
        const closed = new Promise(resolve => child.once('close', () => resolve(undefined)));
        const exited = closed.then(() => { throw new Error(`reader exited instead of holding/reaching Git: ${stderr}`); });
        const watchdog = setTimeout(() => child.kill('SIGKILL'), 8_000);
        try {
          const reached = /** @type {any} */ (await Promise.race([ready, exited]));
          assert.equal(reached.phase, 'gate', 'the marked reader reached its gate before starting any process');
          assert.equal(reached.present, held);
          assert.equal(reached.home, home, 'the gate runs only after the private Git-home redirect');
          if (bootstrap) assert.equal(messages.find(message => message.phase === 'bootstrap')?.home, process.env.HOME,
            'the bootstrap retains its launch home before importing the reader');
          if (held) {
            // Readiness is the actual marker check immediately before the
            // process-start primitive, not a startup-delay assumption.
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.equal(messages.some(message => message.phase === 'spawn'), false, 'the marked reader started no process');
            assert.equal(listener.connections, 0, 'the marked reader never contacted its valid source');
            assert.equal(child.exitCode, null, 'the gate holds instead of throwing or exiting');
            assert.equal(child.signalCode, null);
          } else {
            await Promise.race([listener.connected(), exited]);
            assert.equal(listener.connections, 1, 'the otherwise identical unmarked control reached the real Git peer');
            assert.equal(listener.open, 1);
            assert.ok(messages.some(message => message.phase === 'spawn' && message.command === 'git'));
          }
          t.diagnostic(JSON.stringify({ bootstrap, held, messages, connections: listener.connections, open: listener.open }));
        } finally {
          clearTimeout(watchdog);
          const tree = await readerTree(child.pid);
          // End the reader first on Windows, so even a gate-deletion mutant
          // cannot start a fallback while teardown stops its recorded Git.
          if (process.platform === 'win32') child.kill('SIGKILL');
          else {
            try { process.kill(-Number(child.pid), 'SIGKILL'); }
            catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') throw error; }
          }
          await closed;
          assert.deepEqual(await stopRecorded(tree), [], 'the test stopped its exact reader/tree identities');
          const until = performance.now() + 1_000;
          while (listener.open && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
          assert.equal(listener.open, 0, 'teardown stopped Git without releasing the peer');
        }
      }
    } finally { fixture.cleanup(); }
  });
});

test('T008 importing a marked reader patches no spawnSync binding and changes no server environment', { timeout: 15_000 }, async () => {
  assert.equal(CATALOG_STOP_MARKER, 'reader-stop', 'the private stop marker has its fixed filename');
  const fixture = packFixture();
  const home = path.join(fixture.scratch, 'home');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(fixture.scratch, CATALOG_STOP_MARKER), '');
  const importer = path.join(fixture.temporary, 'import-marked-reader.mjs');
  fs.writeFileSync(importer, [
    "import childProcess, { spawnSync } from 'node:child_process';",
    "import fs from 'node:fs';",
    "import os from 'node:os';",
    "import path from 'node:path';",
    'const before = { ...process.env };',
    'const original = childProcess.spawnSync, named = spawnSync;',
    `await import(${JSON.stringify(pathToFileURL(READER).href)});`,
    'const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(process.env)])].filter(key => before[key] !== process.env[key]);',
    'const patched = original !== childProcess.spawnSync || named !== spawnSync;',
    'const result = patched ? null : spawnSync(process.execPath, ["-e", "process.stdout.write(\'still-runs\')"], { encoding: "utf8" });',
    `process.send({ patched, changedKeys, markerPresent: fs.existsSync(path.join(os.tmpdir(), ${JSON.stringify(CATALOG_STOP_MARKER)})),`,
    '  status: result?.status, stdout: result?.stdout }, () => process.exit(0));',
    '',
  ].join('\n'));
  const before = { ...process.env }, original = childProcess.spawnSync, named = spawnSync;
  const child = fork(importer, [], { cwd: fixture.root, env: { ...process.env, [CATALOG_GIT_HOME_ENV]: home }, execArgv: [], silent: true });
  /** @type {any[]} */
  const messages = [];
  let stderr = '';
  child.stdout?.resume();
  child.stderr?.on('data', chunk => { stderr += chunk; });
  child.on('message', message => { messages.push(message); });
  const closed = new Promise(resolve => child.once('close', code => resolve(code)));
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try {
    assert.equal(await closed, 0, `the import-only child answered and exited: ${stderr}`);
    assert.equal(messages.length, 1, 'only the importer answered, not a catalog read');
    assert.equal(messages[0].markerPresent, true, 'the marker and private home belong to the importing process\'s real temp root');
    assert.equal(messages[0].patched, false, 'a mere import changed neither the default nor named spawnSync');
    assert.deepEqual(messages[0].changedKeys, [], 'a mere import changed no environment variable');
    assert.deepEqual([messages[0].status, messages[0].stdout], [0, 'still-runs'], 'spawnSync still returns its real result with the marker present');
    assert.equal(childProcess.spawnSync, original);
    assert.equal(spawnSync, named);
    assert.deepEqual(Object.keys(process.env).filter(key => before[key] !== process.env[key]), [], 'the server environment stayed unchanged');
  } finally { clearTimeout(watchdog); child.kill('SIGKILL'); await closed; fixture.cleanup(); }
});

test('T008 discovery reads the default and every saved source once, with source-qualified rows and server-side provenance', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.catalog(['alpha', 'bravo', 'twin']);
  const github = offlineGitHub(t, fixture);
  const upstream = github.publish('acme/upstream', ['alpha']);
  const packs = github.publish('acme/dude-packs', ['twin', 'rust', 'zeta']);
  const team = localSource(fixture, 'team-packs', ['twin', 'ui']);
  // A development bundle: its library exists, so its upstream is displayed and never acquired.
  const listener = await silentGitListener(t);
  github.redirect('acme/upstream', listener.url('git'));
  fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
    `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: upstream.url, source_ref: 'main' })}\n\`\`\`\n`);
  const commit = 'a'.repeat(40);
  fixture.profile({
    // A pinned install from a saved GitHub source: its ref is ignored, so it still matches that source.
    rust: fixture.entry('rust', { type: 'remote', repository: packs.url, requested_ref: commit, resolved_commit: commit }),
    ui: fixture.entry('ui', { type: 'local', location: fs.realpathSync(team) }),
    bravo: fixture.entry('bravo', { type: 'local', location: fs.realpathSync(fixture.library) }),
    legacy: fixture.entry('legacy'),
    old: fixture.entry('old', { type: 'remote', repository: 'https://example.test/packs', requested_ref: 'v1', resolved_commit: 'b'.repeat(40) }),
  });
  saveSources(fixture, [remoteEntry('acme/dude-packs'), localEntry(team)]);
  // Project agents and skills named like packs are rows of their own and never source matches, counts or rows.
  fs.mkdirSync(path.join(fixture.root, '.github/agents'), { recursive: true });
  fs.mkdirSync(path.join(fixture.root, '.github/skills/dude-local-twin'), { recursive: true });
  fs.writeFileSync(path.join(fixture.root, '.github/agents/dude-local-rust.agent.md'), '---\nname: Rust\ndescription: A project agent.\n---\n');
  fs.writeFileSync(path.join(fixture.root, '.github/skills/dude-local-twin/SKILL.md'), '---\nname: twin\ndescription: A project skill.\n---\n');
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  const before = snapshotFiles(fixture.root);
  try {
    const body = await discover(f);
    assert.equal(body.coverage.installed.state, 'current');
    assert.deepEqual(body.coverage.catalog, { state: 'current', reason: null, message: null });
    const rows = body.sources.items;
    const [library, bundle, remote, folder] = rows;
    assert.deepEqual(rows.map(/** @param {any} row */ row => [row.scope, row.builtin, row.name]), [
      ['builtin', 'local-library', 'Local library'], ['builtin', 'bundle-upstream', 'Bundle upstream'],
      ['project', null, 'acme/dude-packs'], ['project', null, 'team-packs']]);
    for (const row of rows) assert.match(row.key, /^src_[0-9a-f]{32}$/);
    assert.equal(new Set(rows.map(/** @param {any} row */ row => row.key)).size, 4, 'every source, built-ins included, has its own key');
    assert.equal(body.sources.defaultKey, library.key);
    assert.deepEqual(rows.map(/** @param {any} row */ row => row.default), [true, false, false, false]);
    assert.deepEqual({ status: library.status, count: library.count, uninstalled: library.uninstalled, installed: library.installedNames, location: library.location },
      { status: 'read', count: 3, uninstalled: 2, installed: ['bravo'], location: 'library/packs' });
    // The development upstream is read-only, managed by upgrade, and never acquired.
    assert.deepEqual({ status: bundle.status, reason: bundle.reason, message: bundle.message, managedBy: bundle.managedBy,
      count: bundle.count, repositoryName: bundle.repositoryName, ref: bundle.ref },
    { status: 'not_read', reason: 'not_read_by_design', message: 'Not read while library/packs exists.', managedBy: 'bundle-upgrade',
      count: null, repositoryName: 'acme/upstream', ref: 'main' });
    assert.equal(listener.connections, 0, 'the development upstream was never contacted');
    assert.deepEqual({ type: remote.type, repository: remote.repository, ref: remote.ref, status: remote.status, count: remote.count,
      uninstalled: remote.uninstalled, installed: remote.installedNames },
    { type: 'remote', repository: packs.url, ref: 'main', status: 'read', count: 3, uninstalled: 2, installed: ['rust'] });
    assert.deepEqual({ type: folder.type, location: folder.location, status: folder.status, count: folder.count, installed: folder.installedNames },
      { type: 'local', location: team, status: 'read', count: 2, installed: ['ui'] });
    assert.deepEqual(body.sources.unmatched, { unlisted: 2, unknown: 0 }, 'unmatched records are disclosed without inventing a source row');
    assert.equal(body.sources.state, 'current');
    assert.equal(body.sources.savedIn, '.dude/metadata/pack-sources.md');
    assert.equal(body.sources.sourcesRevision, savedRevision(fixture));
    // One reader per source, once; each saved source is read by key and revision, never by a path or ref.
    const requests = spy.readers().map(readerRequest);
    assert.equal(requests.filter(request => request.op === 'default').length, 1);
    assert.deepEqual(requests.filter(request => request.op === 'source').map(request => [request.index, request.document, request.list]).sort(),
      [[0, 'configured', true], [1, 'configured', true]]);
    assert.ok(requests.every(request => request.op !== 'source' || request.revision === body.sources.sourcesRevision));
    // Installed rows, in profile order, carry their server-matched source; the name join never decides it.
    assert.deepEqual(body.items.filter(/** @param {any} item */ item => item.installed).map(/** @param {any} item */ item =>
      [item.key, item.sourceKey, item.provenance, item.description === null]), [
      ['pack:rust', remote.key, 'source', false], ['pack:ui', folder.key, 'source', false], ['pack:bravo', library.key, 'source', false],
      ['pack:legacy', null, 'unlisted', true], ['pack:old', null, 'unlisted', true]]);
    // Same-name Available rows stay separate, one per source, and a name that is installed leaves none.
    const available = body.items.filter(/** @param {any} item */ item => !item.installed);
    assert.deepEqual(available.map(/** @param {any} item */ item => [item.key, item.name, item.sourceKey, item.provenance]), [
      [`pack:alpha@${library.key}`, 'alpha', library.key, null], [`pack:twin@${library.key}`, 'twin', library.key, null],
      [`pack:twin@${remote.key}`, 'twin', remote.key, null], [`pack:zeta@${remote.key}`, 'zeta', remote.key, null],
      [`pack:twin@${folder.key}`, 'twin', folder.key, null]]);
    assert.equal(new Set(body.items.map(/** @param {any} item */ item => item.key)).size, body.items.length, 'row keys are unique');
    assert.deepEqual(body.project.items.map(/** @param {any} item */ item => item.key), ['project:agent:dude-local-rust', 'project:skill:dude-local-twin']);
    assert.equal(JSON.stringify(body.sources).includes('project:'), false, 'no project row is a source match, count or row');
    assert.deepEqual(snapshotFiles(fixture.root), before);
    assert.deepEqual(fs.readdirSync(fixture.scratch), []);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 matched-but-unavailable metadata stays unavailable, and only an unmatched record uses the default catalog by name', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.catalog(['alpha', 'unlisted-pack']);
  const github = offlineGitHub(t, fixture);
  const packs = github.publish('acme/dude-packs', ['rust']);
  const commit = 'c'.repeat(40);
  fixture.profile({
    rust: fixture.entry('rust', { type: 'remote', repository: packs.url, requested_ref: commit, resolved_commit: commit }),
    'unlisted-pack': fixture.entry('unlisted-pack'),
  });
  saveSources(fixture, [remoteEntry('acme/dude-packs')]);
  const f = await packHttpFixture(fixture);
  try {
    const first = await discover(f);
    assert.equal(first.items.find(/** @param {any} item */ item => item.name === 'rust').description, 'rust full description <script>inert()</script>');
    assert.equal(first.items.find(/** @param {any} item */ item => item.name === 'unlisted-pack').description,
      'unlisted-pack full description <script>inert()</script>', 'an unmatched record keeps today\'s by-name default lookup');
    // The matched source stops answering. Its record's metadata is not borrowed from another catalog.
    github.redirect('acme/dude-packs', pathToFileURL(path.join(fixture.temporary, 'gone')).href);
    fixture.catalog(['rust'], fixture.library);
    const second = await discover(f);
    const rust = second.items.find(/** @param {any} item */ item => item.name === 'rust');
    assert.deepEqual({ description: rust.description, use_cases: rust.use_cases, provenance: rust.provenance, sourceKey: rust.sourceKey !== null },
      { description: null, use_cases: null, provenance: 'source', sourceKey: true },
      'the default library now has a rust, but it is not this record\'s source');
    assert.equal(second.items.find(/** @param {any} item */ item => item.name === 'unlisted-pack').description,
      'unlisted-pack full description <script>inert()</script>');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a failing source leaves the others\' results, with known coverage; every unavailable case is explicit', { timeout: 45_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha', 'bravo']);
  const github = offlineGitHub(t, fixture);
  // Each real clone costs a second or more on a slow Windows host, and the 5,000 ms deadline is fixed,
  // so only one source is cloned here and the layout cases use saved folders. The remote layout and
  // metadata refusals are covered, one clone at a time, by the add tests.
  github.publish('acme/good', ['rust']);
  const listener = await silentGitListener(t);
  github.redirect('acme/slow', listener.url('git'));
  const hollow = localSource(fixture, 'hollow-packs', []);
  fs.mkdirSync(path.join(hollow, 'library/packs'), { recursive: true });
  const broken = localSource(fixture, 'broken-packs', []);
  fs.mkdirSync(path.join(broken, 'library/packs/broken'), { recursive: true });
  fs.writeFileSync(path.join(broken, 'library/packs/broken/pack.md'), '---\nname: broken\nuse-cases: ui\n---\n');
  const team = localSource(fixture, 'team-packs', ['ui']);
  const vanished = localSource(fixture, 'vanished', ['gone']);
  const nocat = path.join(fixture.temporary, 'nocat-packs');
  fs.mkdirSync(path.join(nocat, 'docs'), { recursive: true });
  saveSources(fixture, [remoteEntry('acme/good'), localEntry(nocat), localEntry(hollow), localEntry(broken),
    remoteEntry('acme/unpublished'), remoteEntry('acme/slow'), localEntry(team), localEntry(vanished)]);
  fs.rmSync(vanished, { recursive: true });
  const f = await packHttpFixture(fixture);
  try {
    const body = await discover(f);
    const byName = new Map(body.sources.items.map(/** @param {any} row */ row => [row.name, row]));
    const summary = (/** @type {any} */ row) => ({ status: row.status, reason: row.reason, count: row.count, uninstalled: row.uninstalled });
    assert.deepEqual(summary(byName.get('Local library')), { status: 'read', reason: null, count: 2, uninstalled: 2 });
    assert.deepEqual(summary(byName.get('acme/good')), { status: 'read', reason: null, count: 1, uninstalled: 1 });
    assert.deepEqual(summary(byName.get('hollow-packs')), { status: 'read', reason: null, count: 0, uninstalled: 0 }, 'a valid empty catalog is zero, not unavailable');
    assert.deepEqual(summary(byName.get('team-packs')), { status: 'read', reason: null, count: 1, uninstalled: 1 });
    for (const [name, reason] of [['broken-packs', 'catalog_metadata'], ['nocat-packs', 'catalog_missing'],
      ['acme/unpublished', 'catalog_unreachable'], ['acme/slow', 'catalog_timeout'], ['vanished', 'source_unavailable']]) {
      const row = byName.get(name);
      // A stalled read ends at its deadline, or as unconfirmed cleanup if its tree kill reported a failure.
      const expected = name === 'acme/slow' && row.reason === 'catalog_cleanup_failed' ? 'catalog_cleanup_failed' : reason;
      assert.deepEqual({ status: row.status, reason: row.reason, count: row.count, uninstalled: row.uninstalled },
        { status: 'unavailable', reason: expected, count: null, uninstalled: null }, name);
      assert.equal(typeof row.message, 'string', `${name} says why`);
      assert.notEqual(row.key, null, `${name} keeps its saved identity while unavailable`);
    }
    assert.equal(body.coverage.catalog.state, 'partial');
    assert.equal(body.coverage.catalog.reason, 'sources_partial');
    assert.match(body.coverage.catalog.message, /5 could not be read, which is not a confirmed empty list/);
    assert.deepEqual(body.items.filter(/** @param {any} item */ item => !item.installed).map(/** @param {any} item */ item => item.name),
      ['alpha', 'bravo', 'rust', 'ui'], 'the readable sources\' packs stay, in source order');
    // Every saved source, readable or not, is still a row, so none was silently dropped.
    assert.equal(body.sources.items.length, 1 + 8);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 coverage is unavailable when no catalog could be read, and partial when only the saved sources are unreadable', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  const github = offlineGitHub(t, fixture);
  github.publish('acme/good', ['rust']);
  const f = await packHttpFixture(fixture);
  try {
    // No library and no recorded upstream: nothing is the default, and the one saved source is unreachable.
    fs.rmSync(fixture.library, { recursive: true });
    saveSources(fixture, [remoteEntry('acme/unpublished')]);
    const none = await discover(f);
    assert.equal(none.coverage.catalog.state, 'unavailable');
    assert.equal(none.coverage.catalog.reason, 'catalog_unreachable');
    assert.equal(none.catalog.packs.length, 0, 'the default catalog is an empty, readable list');
    // An unreadable sources document is unavailable, never an empty list, and the default read still stands.
    fixture.catalog(['alpha']);
    for (const unreadable of ['not a sources document', '# Sources\n\n```json\n{"sources":[]}\n```\n\n```json\n{"sources":[]}\n```\n']) {
      fs.writeFileSync(sourcesFile(fixture), unreadable);
      const body = await discover(f);
      assert.equal(body.sources.state, 'unavailable');
      assert.equal(body.sources.reason, 'sources_unavailable');
      assert.equal(body.sources.sourcesRevision, null);
      assert.deepEqual(body.sources.items.map(/** @param {any} row */ row => row.builtin), ['local-library'], 'only the derived built-ins');
      assert.equal(body.coverage.catalog.state, 'partial');
      assert.equal(body.coverage.catalog.reason, 'sources_unavailable');
      assert.equal(body.sources.items[0].status, 'read');
      assert.equal(fs.readFileSync(sourcesFile(fixture), 'utf8'), unreadable, 'never reset');
    }
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a recorded source is Unknown, not Unlisted, when the sources it might match cannot be read', async t => {
  const fixture = packFixture();
  fixture.catalog(['alpha']);
  offlineGitHub(t, fixture);
  fixture.profile({
    alpha: fixture.entry('alpha', { type: 'local', location: fs.realpathSync(fixture.library) }),
    other: fixture.entry('other', { type: 'remote', repository: 'https://github.com/acme/elsewhere', requested_ref: 'main', resolved_commit: null }),
  });
  const f = await packHttpFixture(fixture);
  try {
    const items = async () => (await call(f.instance.url, { path: '/api/packs' })).json();
    const readable = await items();
    assert.deepEqual(readable.items.map(/** @param {any} item */ item => [item.name, item.provenance]), [['alpha', 'source'], ['other', 'unlisted']]);
    fs.mkdirSync(path.dirname(sourcesFile(fixture)), { recursive: true });
    fs.writeFileSync(sourcesFile(fixture), 'broken');
    const unreadable = await items();
    assert.deepEqual(unreadable.items.map(/** @param {any} item */ item => [item.name, item.provenance]),
      [['alpha', 'source'], ['other', 'unknown']], 'a built-in match stands; the rest cannot be called unlisted');
    assert.deepEqual(unreadable.sources.unmatched, { unlisted: 0, unknown: 1 });
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 in a released install the recorded upstream is the default and is the one source read', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fs.rmSync(fixture.library, { recursive: true });
  const github = offlineGitHub(t, fixture);
  const upstream = github.publish('acme/upstream', ['alpha', 'bravo']);
  fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
    `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: upstream.url, source_ref: 'main' })}\n\`\`\`\n`);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const before = await (await call(f.instance.url, { path: '/api/packs' })).json();
    assert.equal(before.sources.items.length, 1, 'no local library, so the upstream is the only built-in');
    assert.deepEqual({ builtin: before.sources.items[0].builtin, default: before.sources.items[0].default, status: before.sources.items[0].status,
      reason: before.sources.items[0].reason }, { builtin: 'bundle-upstream', default: true, status: 'not_read', reason: null });
    assert.equal(spy.readers().length, 0, 'browsing reads nothing');
    const body = await discover(f);
    const [row] = body.sources.items;
    assert.deepEqual({ default: row.default, status: row.status, count: row.count, managedBy: row.managedBy },
      { default: true, status: 'read', count: 2, managedBy: 'bundle-upgrade' });
    assert.equal(body.sources.defaultKey, row.key);
    assert.deepEqual(body.items.map(/** @param {any} item */ item => item.key), [`pack:alpha@${row.key}`, `pack:bravo@${row.key}`]);
    assert.equal(spy.readers().length, 1);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 browsing is not discovery: the plain read describes saved sources, reads no catalog and starts no GitHub helper', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  github.redirect('acme/slow', listener.url('git'));
  github.redirect('acme/other', listener.url('git'));
  const team = localSource(fixture, 'team-packs', ['ui']);
  saveSources(fixture, [remoteEntry('acme/slow'), remoteEntry('acme/other')]);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const started = performance.now();
    const body = await (await call(f.instance.url, { path: '/api/packs' })).json();
    assert.ok(performance.now() - started < 2_000, 'no catalog acquisition delays the read');
    assert.deepEqual(body.coverage.catalog, { state: 'not_read', reason: 'catalog_not_read',
      message: 'The catalog is read only when you choose Reload.' });
    assert.equal(body.coverage.installed.state, 'empty', 'installed packs and the profile stay usable');
    assert.equal(body.catalog, null);
    assert.deepEqual(body.items, [], 'Available is unknown, not an empty list');
    for (const row of body.sources.items) {
      assert.deepEqual({ status: row.status, count: row.count, uninstalled: row.uninstalled }, { status: 'not_read', count: null, uninstalled: null });
    }
    assert.deepEqual(body.sources.items.map(/** @param {any} row */ row => row.name), ['Local library', 'acme/slow', 'acme/other']);
    assert.equal(spy.readers().length, 0, 'only GitHub sources are saved, so describing them needs no helper');
    assert.equal(listener.connections, 0);
    // A saved local folder is described, by key, in a helper that reads no catalog.
    saveSources(fixture, [remoteEntry('acme/slow'), localEntry(team)]);
    const withFolder = await (await call(f.instance.url, { path: '/api/packs' })).json();
    assert.deepEqual(spy.readers().map(readerRequest).map(request => [request.op, request.list]), [['source', false]]);
    assert.equal(withFolder.sources.items[2].status, 'not_read');
    assert.match(withFolder.sources.items[2].key, /^src_[0-9a-f]{32}$/);
    assert.equal(listener.connections, 0);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 discovery is single-flight, separate from the automatic read, and never cached', { timeout: 45_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({ legacy: fixture.entry('legacy') });
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  github.redirect('acme/slow', listener.url('git'));
  saveSources(fixture, [remoteEntry('acme/slow')]);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  /** @type {ProcessRow[][]} */
  let trees = [];
  try {
    const first = call(f.instance.url, { path: DISCOVER });
    const second = call(f.instance.url, { path: DISCOVER });
    await listener.connected();
    trees = await Promise.all(spy.readers().map(reader => readerTree(reader.child.pid)));
    // While discovery stalls, the automatic read answers at once with the profile and sources.
    const started = performance.now();
    const automatic = await (await call(f.instance.url, { path: '/api/packs' })).json();
    assert.ok(performance.now() - started < 3_000, 'the automatic read does not wait for discovery');
    assert.equal(automatic.coverage.catalog.state, 'not_read');
    assert.deepEqual(automatic.items.map(/** @param {any} item */ item => item.name), ['legacy']);
    const bodies = await Promise.all([first, second].map(async response => (await response).json()));
    assert.deepEqual(bodies[0].sources.items.map(/** @param {any} row */ row => row.status), ['read', 'unavailable']);
    assert.deepEqual(bodies[1].sources.items, bodies[0].sources.items, 'both tabs received the one read');
    // The default plus the one saved source: one reader each, once, for both requests.
    assert.deepEqual(spy.readers().map(readerRequest).map(request => request.op).sort(), ['default', 'source']);
    assert.equal(listener.open, 0);
    await assertTreeStops({ t, spy, kills, trees: trees.filter(tree => tree.length), scratch: fs.readdirSync(fixture.scratch) });
    // A finished read is not a cache: the next discovery reads again.
    github.redirect('acme/slow', pathToFileURL(path.join(fixture.temporary, 'gone')).href);
    const launched = spy.readers().length;
    const third = await call(f.instance.url, { path: '/api/packs?discover=1' });
    assert.equal(third.status, 200);
    assert.ok(spy.readers().length > launched);
    assert.equal(f.instance.catalogRead, null);
  } finally { await f.close(); for (const tree of trees) await stopRecorded(tree); fixture.cleanup(); }
});

/**
 * Roots left after readers were stopped. A reader keeps its checkout root only when
 * its stop stayed unconfirmed: its tree kill reported a failure (Windows taskkill
 * occasionally does for a process that is already exiting), or it ran out of the
 * stop window. Every other root was removed after its confirmed stop, and every
 * failed kill must have kept its own.
 * @param {import('node:test').TestContext} t
 * @param {ReturnType<typeof spawnSpy>} spy
 * @param {ReturnType<typeof taskkillSpy>} kills
 * @param {string[]} scratch the roots that remain
 */
function assertKeptRoots(t, spy, kills, scratch) {
  for (const { error } of kills.calls) {
    if (error) t.diagnostic(`taskkill failed, so the stop stayed unconfirmed: ${error.message.replace(/\s+/g, ' ').trim()}`);
  }
  const rootOf = (/** @type {{ options: any }} */ reader) => path.basename(reader.options.env.TMP);
  const readers = spy.readers();
  const failed = readers.filter(({ child }) => kills.failed.has(String(child.pid))).map(rootOf);
  const outOfWindow = readers.filter(({ child }) => kills.calls.some(call => call.args[1] === String(child.pid) && !call.error
    && (call.durationMs ?? Infinity) >= 1_500)).map(rootOf);
  for (const root of failed) assert.ok(scratch.includes(root), `a stop that was not confirmed keeps its root: ${root}`);
  for (const root of scratch) {
    assert.ok(failed.includes(root) || outOfWindow.includes(root), `every other root was removed after its confirmed stop: ${root}`);
  }
}
test('T008 at most four readers are ever active, and every source is read exactly once', { timeout: 60_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  const names = ['one', 'two', 'three', 'four', 'five'];
  for (const name of names) github.redirect(`acme/${name}`, listener.url('git'));
  saveSources(fixture, names.map(name => remoteEntry(`acme/${name}`)));
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const body = await discover(f);
    const readers = spy.readers();
    assert.equal(readers.length, 1 + names.length, 'the default and each saved source, once');
    // Process lifetimes never overlap beyond four, however many are queued.
    const events = readers.flatMap(reader => [[reader.spawnedAt, 1], [reader.exitedAt ?? Infinity, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let active = 0, peak = 0;
    for (const [, delta] of events) { active += delta; peak = Math.max(peak, active); }
    assert.ok(peak <= 4, `at most four readers were alive at once: ${peak}`);
    assert.ok(peak >= 3, `the pool really ran readers together: ${peak}`);
    // A source is contacted once, and no more than once, however many were queued. A slow host can end one at its deadline first.
    assert.ok(listener.connections >= 1 && listener.connections <= names.length, 'each stalled source was contacted at most once: ' + listener.connections);
    const stalled = body.sources.items.slice(1);
    assert.deepEqual(stalled.map(/** @param {any} row */ row => row.status), names.map(() => 'unavailable'));
    // Each ended at its own deadline, or as unconfirmed cleanup exactly where its tree kill reported a failure.
    assert.ok(stalled.filter(/** @param {any} row */ row => row.reason === 'catalog_cleanup_failed').length >= kills.failed.size,
      'every failed tree kill is an unconfirmed cleanup, and nothing else is a cleanup failure but a stop that ran out of its window');
    assert.ok(stalled.every(/** @param {any} row */ row => ['catalog_timeout', 'catalog_cleanup_failed'].includes(row.reason)));
    assert.equal(body.coverage.catalog.state, 'partial');
    if (!kills.failed.size) {
      // The same bound holds for the stalled transports Git held open.
      const stamps = listener.records.flatMap(record => [[record.acceptedAt, 1], [record.closedAt ?? Infinity, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let open = 0, peakOpen = 0;
      for (const [, delta] of stamps) { open += delta; peakOpen = Math.max(peakOpen, open); }
      assert.ok(peakOpen <= 4, `at most four stalled connections were open at once: ${peakOpen}`);
      assert.equal(listener.open, 0);
    }
    assertKeptRoots(t, spy, kills, fs.readdirSync(fixture.scratch));
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 cancelling a discovery stops every active reader\'s tree and never starts a queued one', { timeout: 45_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  const names = ['one', 'two', 'three', 'four', 'five', 'six'];
  for (const name of names) github.redirect(`acme/${name}`, listener.url('git'));
  saveSources(fixture, names.map(name => remoteEntry(`acme/${name}`)));
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  const controller = new AbortController();
  /** @type {ProcessRow[][]} */
  let trees = [];
  try {
    const reading = call(f.instance.url, { path: DISCOVER, signal: controller.signal }).catch(error => error);
    // The default read finishes at once; stalled transports fill the pool and the rest of the sources wait.
    const until = Date.now() + 20_000;
    while (listener.connections < 2 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(listener.connections >= 2, `at least two readers reached their stalled transport: ${listener.connections}`);
    trees = await Promise.all(spy.readers().map(reader => readerTree(reader.child.pid)));
    const aborted = performance.now();
    controller.abort();
    assert.ok((await reading) instanceof Error);
    // The instance close waits for the cancelled read's trees to stop, so this returns only once they have.
    assert.equal(await closeInstance(f.instanceId), true);
    assert.ok(performance.now() - aborted < 6_000, 'every tree stopped within its stop window');
    // The pool holds four readers, the default among them while it runs, so the cancelled read started at most
    // the default and four sources. The two that were still waiting never started.
    assert.ok(listener.connections <= 4, 'the queued sources never reached a transport: ' + listener.connections);
    assert.ok(spy.readers().length <= 1 + 4, `the default plus at most the four that were running: ${spy.readers().length}`);
    assert.ok(spy.readers().length >= 3);
    // A killed Git's loopback connection is reaped a moment after its process ends, and four trees end together.
    const reaping = performance.now() + 3_000;
    while (listener.open && performance.now() < reaping) await new Promise(resolve => setTimeout(resolve, 25));
    if (!kills.failed.size) assert.equal(listener.open, 0, 'no Git process still holds a stalled connection');
    assertKeptRoots(t, spy, kills, fs.readdirSync(fixture.scratch));
    for (const tree of trees.filter(members => members.length > 1)) {
      assert.deepEqual(await survivorsAfterBound(tree), [], 'no process recorded from a reader tree survived its stop');
    }
  } finally { await f.close(); for (const tree of trees) await stopRecorded(tree); fixture.cleanup(); }
});

/* -------------------------------------------------------------------------
 * T008: removing a saved source. A source is removable unless an installed
 * pack records it or a live pack request is bound to it, and removing deletes
 * only its entry: no catalog is read and nothing installed is touched.
 * ------------------------------------------------------------------------- */

/** The automatic read: installed, project and source rows, with no catalog. @param {Awaited<ReturnType<typeof packHttpFixture>>} f */
const plainRead = async f => (await call(f.instance.url, { path: '/api/packs' })).json();
/** @param {any} body @returns {Map<string, any>} */
const sourceRows = body => new Map(body.sources.items.map(/** @param {any} row */ row => [row.name, row]));
/** Every file but the saved sources file. @param {ReturnType<typeof packFixture>} fixture */
function filesBesidesSources(fixture) {
  const files = snapshotFiles(fixture.root);
  files.delete(path.normalize(PACK_SOURCES_PATH));
  return files;
}

/**
 * The stop oracle for readers that only describe a folder, as `assertTreeStops` is for readers that run Git. On Windows
 * the cancellation of such a reader, as when a sibling's answer ends a search, goes through taskkill, which can fail for
 * a reader that is already exiting. Production then holds that stop unconfirmed and keeps the reader's root, because an
 * unconfirmed stop may not have stopped everything. So the roots left are exactly those of the readers whose tree kill
 * this test saw fail, and every reader has exited. There is no live tree to look for: such a reader never runs Git.
 * Each seen failure is a test diagnostic. A tree kill or an exit still in flight when the read has reported is awaited,
 * within a bound, so that what is compared is settled.
 * @param {{ t: import('node:test').TestContext, fixture: ReturnType<typeof packFixture>, spy: ReturnType<typeof spawnSpy>, kills: ReturnType<typeof taskkillSpy> }} observed
 */
async function assertRetainedRoots({ t, fixture, spy, kills }) {
  const exited = (/** @type {{ child: import('node:child_process').ChildProcess }} */ { child }) => child.exitCode !== null || child.signalCode !== null;
  const until = performance.now() + 10_000;
  while ((kills.calls.some(call => call.durationMs === undefined) || !spy.readers().every(exited)) && performance.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  for (const { error } of kills.calls) {
    if (error) t.diagnostic(`taskkill failed, so the stop stayed unconfirmed: ${error.message.replace(/\s+/g, ' ').trim()}`);
  }
  // Windows reuses PIDs, so a kill is for the latest reader with its PID that had been spawned when it was made.
  const readerOf = (/** @type {{ args: string[], calledAt: number }} */ call) => spy.readers()
    .filter(({ child, spawnedAt }) => String(child.pid) === call.args[1] && spawnedAt <= call.calledAt)
    .reduce((/** @type {ReturnType<typeof spy.readers>[number] | null} */ latest, reader) => (latest && latest.spawnedAt > reader.spawnedAt ? latest : reader), null);
  const kept = kills.calls.filter(call => call.error)
    .map(call => path.basename(/** @type {NonNullable<ReturnType<typeof readerOf>>} */ (readerOf(call)).options.env.TMP)).sort();
  assert.deepEqual(fs.readdirSync(fixture.scratch).sort(), kept, kept.length
    ? 'an unconfirmed stop keeps only its own reader\'s root' : 'every root was removed after its confirmed stop');
  for (const reader of spy.readers()) assert.ok(exited(reader), `reader ${reader.child.pid} has exited`);
}

test('T008 remove deletes only the one saved entry, whether the source was never read, cannot be read or its folder is gone', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/good', ['rust']);
  const team = localSource(fixture, 'team-packs', ['ui']);
  const gone = localSource(fixture, 'gone-packs', ['old']);
  const entries = [remoteEntry('acme/good'), remoteEntry('acme/unpublished'), localEntry(team), localEntry(gone)];
  saveSources(fixture, entries);
  fs.rmSync(gone, { recursive: true });
  const spy = spawnSpy(t);
  // Before the first reader launches, so that every tree kill that a removal's sibling cancellation makes is seen.
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const plain = await plainRead(f);
    const rows = sourceRows(plain);
    for (const name of ['acme/good', 'acme/unpublished', 'team-packs', 'gone-packs']) {
      assert.deepEqual([rows.get(name).status, rows.get(name).count], ['not_read', null], `${name} was never read`);
      assert.match(rows.get(name).key, /^src_[0-9a-f]{32}$/, `${name} keeps a key even when its folder is gone`);
    }
    const others = filesBesidesSources(fixture);
    const launched = spy.readers().length;
    let revision = plain.sources.sourcesRevision;
    /** @param {string} name @param {any[]} remaining */
    const removeOne = async (name, remaining) => {
      const response = await removeSource(f, fixture, rows.get(name).key, revision);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.deepEqual(Object.keys(/** @type {any} */ (response.body)), ['sourcesRevision'], 'only the new revision is returned');
      assert.equal(/** @type {any} */ (response.body).sourcesRevision, savedRevision(fixture));
      const saved = readPackSources(fixture.root);
      assert.deepEqual(saved.ok && saved.sources, remaining, `${name} alone was removed, and the rest keep their order`);
      revision = /** @type {any} */ (response.body).sourcesRevision;
    };
    // A remote source is found from its text alone, so removing it starts no reader at all.
    await removeOne('acme/unpublished', [entries[0], entries[2], entries[3]]);
    assert.equal(spy.readers().length, launched, 'a remote source is removed without a helper or a catalog read');
    // A saved folder is identified by a helper behind the reader deadlines, never by a read of its packs.
    await removeOne('gone-packs', [entries[0], entries[2]]);
    await removeOne('team-packs', [entries[0]]);
    await removeOne('acme/good', []);
    const requests = spy.readers().slice(launched).map(readerRequest);
    assert.ok(requests.length >= 2 && requests.every(request => request.op === 'source' && request.list === false),
      'removal only describes folders; it never lists a catalog');
    assert.deepEqual(filesBesidesSources(fixture), others, 'nothing but the sources entry changed');
    assert.equal(f.sends.length, 0);
    assert.equal(f.provider.read().packRequests.length, 0, 'removal is not a Needs You class or request');
    // Finding a folder describes every saved folder at once and cancels the others at the first answer, and on Windows a
    // cancelled reader that is already exiting can make its tree kill fail: its stop is then unconfirmed and its root stays.
    if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
    else assert.deepEqual(fs.readdirSync(fixture.scratch), []);
    const after = sourceRows(await plainRead(f));
    assert.deepEqual([...after.keys()], ['Local library'], 'only the built-in remains');
  } finally { await f.close(); fixture.cleanup(); }
});

/**
 * A saved folder that never answers, a healthy folder and a repository, in that order, with taskkill spied (or, with
 * `replace`, replaced) before the first reader launches. Removing the healthy folder describes both folders at once, so
 * the stalled folder's reader is alive when the healthy folder's answer ends the search and cancels it.
 * @param {import('node:test').TestContext} t
 * @param {(args: string[], fail: () => void) => void} [replace]
 */
async function stalledSiblingScenario(t, replace) {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/good', ['rust']);
  const stalled = fs.realpathSync(localSource(fixture, 'stalled-share', ['stuck']));
  const healthy = fs.realpathSync(localSource(fixture, 'healthy-packs', ['ui']));
  const entries = [localEntry(stalled), localEntry(healthy), remoteEntry('acme/good')];
  saveSources(fixture, entries);
  stallResolutionOf(t, fixture, stalled);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t, replace);
  const f = await packHttpFixture(fixture);
  return {
    fixture, f, spy, kills, entries,
    /** The key of the folder that is removed: this process is not stalled, so it is the oracle. */
    healthyKey: sharedKey(fixture, entries[1]),
    /** The reader that describes the stalled folder, found by its entry's position in the saved sources. */
    stalledReader: () => spy.readers().find(reader => readerRequest(reader).index === 0),
    /** A reader that a replaced tree kill left running is stopped through its own handle, never by PID. */
    async close() {
      for (const { child } of spy.readers()) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await f.close();
      fixture.cleanup();
    },
  };
}

test('T008 on Windows a failed tree kill of the stalled sibling that a removal cancels still removes only the healthy folder\'s entry and keeps only that reader\'s root', {
  timeout: 45_000, skip: process.platform !== 'win32' && 'taskkill stops reader trees only on Windows',
}, async t => {
  // The tree kill is replaced and fails, and kills nothing itself: the stop is unconfirmed, as when taskkill is denied.
  const s = await stalledSiblingScenario(t, (_args, fail) => setImmediate(fail));
  try {
    const others = filesBesidesSources(s.fixture);
    const removed = await removeSource(s.f, s.fixture, s.healthyKey);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.deepEqual(readPackSources(s.fixture.root).sources, [s.entries[0], s.entries[2]],
      'the healthy folder\'s entry alone was removed, and the rest keep their order');
    assert.deepEqual(filesBesidesSources(s.fixture), others, 'every other project byte is unchanged');
    assert.equal(s.f.sends.length, 0);
    assert.equal(s.f.provider.read().packRequests.length, 0);
    assert.equal(s.spy.readers().length, 2, 'one describing reader for each saved folder');
    const sibling = s.stalledReader();
    assert.ok(sibling, 'the stalled folder\'s reader was launched');
    assert.deepEqual(s.kills.calls.map(call => call.args), [['/PID', String(sibling.child.pid), '/T', '/F']],
      'the cancellation went through taskkill, for the stalled reader alone');
    assert.ok(s.kills.calls[0].error, 'and its tree kill reported a failure');
    assert.deepEqual(fs.readdirSync(s.fixture.scratch), [path.basename(sibling.options.env.TMP)],
      'exactly the stalled reader\'s root was kept, and the healthy reader\'s was removed');
    await assertRetainedRoots({ t, ...s });
  } finally { await s.close(); }
});

test('T008 on Windows the real taskkill cancels the stalled sibling of a removal, and a root stays only where a tree kill failed', {
  timeout: 45_000, skip: process.platform !== 'win32' && 'taskkill stops reader trees only on Windows',
}, async t => {
  const s = await stalledSiblingScenario(t);
  try {
    const others = filesBesidesSources(s.fixture);
    const removed = await removeSource(s.f, s.fixture, s.healthyKey);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.deepEqual(readPackSources(s.fixture.root).sources, [s.entries[0], s.entries[2]],
      'the healthy folder\'s entry alone was removed, and the rest keep their order');
    assert.deepEqual(filesBesidesSources(s.fixture), others, 'every other project byte is unchanged');
    const sibling = s.stalledReader();
    assert.ok(sibling, 'the stalled folder\'s reader was launched');
    // So that this is not vacuous: the stalled reader was alive when the answer came, and was stopped by taskkill.
    assert.ok(s.kills.calls.some(call => call.args[1] === String(sibling.child.pid)), 'the cancellation went through taskkill');
    await assertRetainedRoots({ t, ...s });
  } finally { await s.close(); }
});

test('T008 remove refuses a built-in, an unknown key, a stale revision and an unreadable document, and keeps the saved bytes', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const upstream = github.publish('acme/upstream', ['alpha']);
  fs.writeFileSync(path.join(fixture.root, '.dude/metadata/bundle-manifest.md'),
    `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: upstream.url, source_ref: 'main' })}\n\`\`\`\n`);
  const team = localSource(fixture, 'team-packs', ['ui']);
  saveSources(fixture, [localEntry(team)]);
  const f = await packHttpFixture(fixture);
  try {
    const rows = sourceRows(await plainRead(f));
    const saved = fs.readFileSync(sourcesFile(fixture));
    const others = filesBesidesSources(fixture);
    const revision = savedRevision(fixture);
    const unchanged = () => {
      assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), saved, 'the saved sources are the same bytes');
      assert.deepEqual(filesBesidesSources(fixture), others);
    };
    for (const [label, key, status, error] of /** @type {Array<[string, string, number, string]>} */ ([
      ['the local library built-in', rows.get('Local library').key, 422, 'builtin_source'],
      ['the bundle upstream built-in', rows.get('Bundle upstream').key, 422, 'builtin_source'],
      ['a key that no saved source has', `src_${'e'.repeat(32)}`, 422, 'unknown_source'],
    ])) {
      const refused = await removeSource(f, fixture, key, revision);
      assert.deepEqual([refused.status, /** @type {any} */ (refused.body).error], [status, error], label);
      assert.equal(typeof (/** @type {any} */ (refused.body).message), 'string', `${label} says why`);
      unchanged();
    }
    const stale = await removeSource(f, fixture, rows.get('team-packs').key, `sha256:${'0'.repeat(64)}`);
    assert.deepEqual([stale.status, /** @type {any} */ (stale.body).error], [409, 'sources_changed']);
    unchanged();
    // An unreadable document is reported, never reset by a removal.
    fs.writeFileSync(sourcesFile(fixture), '# Pack Sources\n\nnot a sources document\n');
    const garbage = fs.readFileSync(sourcesFile(fixture));
    const unreadable = await removeSource(f, fixture, rows.get('team-packs').key, savedRevision(fixture));
    assert.deepEqual([unreadable.status, /** @type {any} */ (unreadable.body).error], [409, 'sources_unavailable']);
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), garbage);
    // The unreadable document is not "no sources": the plain read says so and the browser keeps its rows unread.
    const plain = await plainRead(f);
    assert.equal(plain.sources.state, 'unavailable');
    assert.equal(plain.sources.sourcesRevision, null);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 an installed pack from a source blocks its removal and is named; project rows and unrelated records never block', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.catalog(['alpha', 'bravo']);
  const github = offlineGitHub(t, fixture);
  const packs = github.publish('acme/dude-packs', ['rust']);
  const team = localSource(fixture, 'team-packs', ['ui']);
  const spare = localSource(fixture, 'spare-packs', ['extra']);
  const commit = 'd'.repeat(40);
  fixture.profile({
    // Pinned at a commit and recorded without a ref match: a ref never changes which source it came from.
    rust: fixture.entry('rust', { type: 'remote', repository: packs.url, requested_ref: commit, resolved_commit: commit }),
    ui: fixture.entry('ui', { type: 'local', location: fs.realpathSync(team) }),
    bravo: fixture.entry('bravo', { type: 'local', location: fs.realpathSync(fixture.library) }),
    legacy: fixture.entry('legacy'),
    old: fixture.entry('old', { type: 'remote', repository: 'https://example.test/packs', requested_ref: 'v1', resolved_commit: 'b'.repeat(40) }),
  });
  const entries = [remoteEntry('acme/dude-packs'), localEntry(team), remoteEntry('acme/other'), localEntry(spare)];
  saveSources(fixture, entries);
  // A project agent named like the pack installed from the first source is a row of its own, never a blocker.
  fs.mkdirSync(path.join(fixture.root, '.github/agents'), { recursive: true });
  fs.writeFileSync(path.join(fixture.root, '.github/agents/dude-local-extra.agent.md'), '---\nname: Extra\ndescription: A project agent.\n---\n');
  const f = await packHttpFixture(fixture);
  try {
    const rows = sourceRows(await plainRead(f));
    const saved = fs.readFileSync(sourcesFile(fixture));
    const others = filesBesidesSources(fixture);
    /** @param {string} name @param {any[]} blockers */
    const blocked = async (name, blockers) => {
      const refused = await removeSource(f, fixture, rows.get(name).key);
      assert.deepEqual([refused.status, /** @type {any} */ (refused.body).error], [409, 'source_in_use'], name);
      assert.deepEqual(/** @type {any} */ (refused.body).blockers, blockers, `${name}: every blocking pack is named`);
      for (const blocker of blockers) assert.match(/** @type {any} */ (refused.body).message, new RegExp(`\\b${blocker.name}\\b`));
      assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), saved, `${name}: the configuration is preserved`);
    };
    await blocked('acme/dude-packs', [{ kind: 'installed', name: 'rust' }]);
    await blocked('team-packs', [{ kind: 'installed', name: 'ui' }]);
    // The folder moving away does not release its installed pack: the record still names that location.
    const moved = `${team}-moved`;
    fs.renameSync(team, moved);
    await blocked('team-packs', [{ kind: 'installed', name: 'ui' }]);
    fs.renameSync(moved, team);
    // Unreadable installed authority is neither "unused" nor an empty profile.
    const profile = fs.readFileSync(fixture.profilePath);
    fs.writeFileSync(fixture.profilePath, '# Not a profile\n');
    const unreadable = await removeSource(f, fixture, rows.get('acme/other').key);
    assert.deepEqual([unreadable.status, /** @type {any} */ (unreadable.body).error], [409, 'authority_unavailable']);
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), saved);
    fs.writeFileSync(fixture.profilePath, profile);
    // Records from the default library, the legacy record and one from elsewhere belong to no saved source.
    for (const name of ['acme/other', 'spare-packs']) {
      const removed = await removeSource(f, fixture, rows.get(name).key);
      assert.equal(removed.status, 200, `${name}: ${JSON.stringify(removed.body)}`);
    }
    assert.deepEqual(readPackSources(fixture.root).sources, [entries[0], entries[1]]);
    assert.deepEqual(filesBesidesSources(fixture), others, 'no installed record, file or project artifact changed');
  } finally { await f.close(); fixture.cleanup(); }
});

/**
 * The permission targets of a source-bound request: the source first, then the pack and
 * the profile, as the owner publishes them.
 * @param {ReturnType<typeof packFixture>} fixture
 * @param {{ source: any }} binding the receipt's `catalogSource`
 * @param {string} revision the source's revision: `commit:<hex>` or a file digest
 * @param {string} [pack]
 */
function sourceFirstTargets(fixture, binding, revision, pack = 'alpha') {
  const { source } = binding;
  const label = source.type === 'remote' ? `${source.repository} @ ${source.ref}` : source.location;
  return [
    { target: `Third-party source ${label}`, revision },
    { target: `pack:${pack}`, revision: packRevision(`${pack}:${revision}`) },
    { target: '.dude/metadata/profile.md', revision: packRevision(fs.readFileSync(fixture.profilePath)) },
  ];
}

test('T008 a live request bound to a source blocks its removal until it is reconciled, and each request is named', { timeout: 30_000 }, async () => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const team = localSource(fixture, 'team-packs', ['alpha']);
  saveSources(fixture, [localEntry(team)]);
  const f = await packHttpFixture(fixture);
  try {
    const key = sourceRows(await plainRead(f)).get('team-packs').key;
    /** @param {string} phase */
    const blockedBy = async phase => {
      const refused = await removeSource(f, fixture, key);
      assert.deepEqual([refused.status, /** @type {any} */ (refused.body).error], [409, 'source_in_use'], phase);
      assert.deepEqual(/** @type {any} */ (refused.body).blockers, [{ kind: 'request', name: 'alpha', operation: 'install', phase }]);
      assert.match(/** @type {any} */ (refused.body).message, new RegExp(`install alpha \\(${phase}\\)`));
    };
    const prepared = await f.post({ op: 'prepare', operation: 'install', name: 'alpha', source: key });
    assert.equal(prepared.status, 202);
    const receipt = await prepared.json();
    await blockedBy('prepared');
    const delivered = await f.post({ op: 'submit', operation: 'install', name: 'alpha', source: key, packReceipt: receipt.packReceipt });
    assert.equal(delivered.status, 202);
    await blockedBy('delivered');
    const binding = receipt.receipt.catalogSource;
    const permission = await f.permission(receipt, { source: binding.source }, {
      targets: sourceFirstTargets(fixture, binding, packRevision(fs.readFileSync(path.join(team, 'library/packs/alpha/pack.md')))) });
    await blockedBy('waiting_permission');
    await permission.reply(false);
    await blockedBy('waiting_owner');
    // The owner's acknowledged result reconciles the request, so it no longer holds the source.
    const outcome = await f.tool({ op: 'acknowledge',
      acknowledgment: f.acknowledgment(receipt, null, 'declined', 'none', 'The user declined; nothing was applied.') });
    assert.equal(outcome.resultType, 'success', outcome.textResultForLlm);
    const removed = await removeSource(f, fixture, key);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.deepEqual(readPackSources(fixture.root).sources, []);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a request that is still being prepared holds its source, and a removal that won leaves nothing to prepare against', { timeout: 45_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  github.redirect('acme/slow', listener.url('git'));
  github.publish('acme/spare', ['alpha']);
  saveSources(fixture, [remoteEntry('acme/slow'), remoteEntry('acme/spare')]);
  const f = await packHttpFixture(fixture);
  try {
    const rows = sourceRows(await plainRead(f));
    const slow = rows.get('acme/slow').key, spare = rows.get('acme/spare').key;
    // The preparation is stalled in its source's read, so it is in flight while the removal runs.
    const preparing = f.post({ op: 'prepare', operation: 'install', name: 'alpha', source: slow });
    await listener.connected();
    const refused = await removeSource(f, fixture, slow);
    assert.deepEqual([refused.status, /** @type {any} */ (refused.body).error], [409, 'source_in_use']);
    assert.deepEqual(/** @type {any} */ (refused.body).blockers, [{ kind: 'request', name: 'alpha', operation: 'install', phase: 'preparing' }]);
    assert.equal(readPackSources(fixture.root).sources.length, 2, 'the source stayed while it was being used');
    // The preparation ends at its read deadline without a receipt, and the source is then free.
    const outcome = await preparing;
    assert.notEqual(outcome.status, 202, 'a stalled source never yields a prepared receipt');
    assert.equal(f.provider.read().packRequests.length, 0);
    assert.equal((await removeSource(f, fixture, slow)).status, 200);
    // The other order: the source is already removed, so a preparation for its key is stale and sends nothing.
    assert.equal((await removeSource(f, fixture, spare)).status, 200);
    const late = await f.post({ op: 'prepare', operation: 'install', name: 'alpha', source: spare });
    assert.equal(late.status, 409);
    assert.equal((await late.json()).error, 'source_changed');
    assert.equal(f.sends.length, 0);
    assert.equal(f.provider.read().packRequests.length, 0, 'no receipt exists for a removed source');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a provider that cannot report its requests refuses removal instead of assuming the source is unused', async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/spare', ['alpha']);
  saveSources(fixture, [remoteEntry('acme/spare')]);
  const f = await packHttpFixture(fixture);
  try {
    const key = sourceRows(await plainRead(f)).get('acme/spare').key;
    const saved = fs.readFileSync(sourcesFile(fixture));
    // Disposing the provider ends the lifetime that its live requests are answered from.
    f.provider.dispose();
    const refused = await removeSource(f, fixture, key);
    assert.deepEqual([refused.status, /** @type {any} */ (refused.body).error], [409, 'authority_unavailable']);
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), saved);
  } finally { await f.close(); fixture.cleanup(); }
});

/* -------------------------------------------------------------------------
 * T008: a saved folder that never answers. Resolving a saved folder's real path
 * can block for as long as the OS waits on an unreachable share, so each folder
 * is resolved by a reader of its own. These tests stall that one resolution
 * inside the readers and prove it costs only its own slot.
 * ------------------------------------------------------------------------- */

/** Well under a reader's 5,000 ms deadline: an operation that is not about the stalled folder must not wait for it. */
const ISOLATED_MS = 4_000;

/**
 * Make one folder's real-path resolution never return in every reader that a test
 * starts, as a path on an unreachable share does. Node preloads this module into
 * each reader through NODE_OPTIONS; it blocks `fs.realpathSync` for that one path
 * and nothing else. This process never preloads it, so it resolves the folder
 * normally and stays the oracle for what that folder's key should be.
 * @param {import('node:test').TestContext} t
 * @param {ReturnType<typeof packFixture>} fixture
 * @param {string} folder
 */
function stallResolutionOf(t, fixture, folder) {
  const preload = path.join(fixture.temporary, 'stall-resolution.mjs');
  fs.writeFileSync(preload, [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    'const stalled = process.env.DUDE_TEST_STALLED_FOLDER;',
    "const same = value => process.platform === 'win32' ? value.toLowerCase() : value;",
    'if (stalled) {',
    '  const resolve = fs.realpathSync;',
    '  const stall = target => {',
    "    if (typeof target === 'string' && same(path.resolve(target)) === same(path.resolve(stalled))) {",
    '      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120_000);',
    '    }',
    '  };',
    '  const guarded = (target, ...rest) => { stall(target); return resolve(target, ...rest); };',
    '  guarded.native = (target, ...rest) => { stall(target); return resolve.native(target, ...rest); };',
    '  fs.realpathSync = guarded;',
    '}',
    '',
  ].join('\n'));
  const saved = { NODE_OPTIONS: process.env.NODE_OPTIONS, DUDE_TEST_STALLED_FOLDER: process.env.DUDE_TEST_STALLED_FOLDER };
  process.env.DUDE_TEST_STALLED_FOLDER = folder;
  process.env.NODE_OPTIONS = `${saved.NODE_OPTIONS ? `${saved.NODE_OPTIONS} ` : ''}--import=${pathToFileURL(preload).href}`;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

/** The key the shared module gives one saved entry; this process is not stalled, so it is the oracle. @param {ReturnType<typeof packFixture>} fixture @param {any} entry */
const sharedKey = (fixture, entry) => describePackSources({ root: fixture.root, sources: [entry], builtins: [] }).sources[0].key;

/** @template T @param {() => Promise<T>} work */
async function timed(work) {
  const started = performance.now();
  const value = await work();
  return { value, ms: performance.now() - started };
}

test('T008 a saved folder that never answers delays no other source', { timeout: 120_000 }, async t => {
  /**
   * A project with a stalled folder, two good folders beside it and a repository. Each case below builds its
   * own, so each one passes or fails by itself.
   * @param {import('node:test').TestContext} t
   */
  const scenario = async t => {
    const fixture = packFixture();
    fixture.profile({});
    fixture.catalog(['alpha']);
    const github = offlineGitHub(t, fixture);
    github.publish('acme/elsewhere', ['rust']);
    const stalled = fs.realpathSync(localSource(fixture, 'stalled-share', ['stuck']));
    const first = fs.realpathSync(localSource(fixture, 'first-packs', ['alpha']));
    const second = fs.realpathSync(localSource(fixture, 'second-packs', ['delta']));
    const entries = [localEntry(stalled), localEntry(first), localEntry(second), remoteEntry('acme/unused')];
    saveSources(fixture, entries);
    stallResolutionOf(t, fixture, stalled);
    const spy = spawnSpy(t);
    const f = await packHttpFixture(fixture);
    t.after(async () => { await f.close(); fixture.cleanup(); });
    return { fixture, f, spy, entries, first, key: (/** @type {number} */ index) => sharedKey(fixture, entries[index]) };
  };

  await t.test('an install that names a good sibling is prepared inside the operation bound, with its bound receipt', async t => {
    const { fixture, f, entries, first, key } = await scenario(t);
    const prepare = await timed(() => f.post({ op: 'prepare', operation: 'install', name: 'alpha', source: key(1) }));
    const receipt = await prepare.value.json();
    assert.equal(prepare.value.status, 202, JSON.stringify(receipt));
    assert.deepEqual(receipt.receipt.catalogSource,
      { key: key(1), sourcesRevision: savedRevision(fixture), source: { type: 'local', location: first } });
    assert.ok(prepare.ms < ISOLATED_MS, `prepared in ${prepare.ms.toFixed(0)} ms, not after the stalled folder's deadline`);
    assert.deepEqual(readPackSources(fixture.root).sources, entries, 'preparing saves nothing');
    t.diagnostic(`prepare ${prepare.ms.toFixed(0)} ms (limit ${ISOLATED_MS} ms)`);
  });

  await t.test('removing a good sibling does not wait for it, and deletes only that entry', async t => {
    const { fixture, f, entries, key } = await scenario(t);
    const others = filesBesidesSources(fixture);
    const removal = await timed(() => removeSource(f, fixture, key(2)));
    assert.equal(removal.value.status, 200, JSON.stringify(removal.value.body));
    assert.ok(removal.ms < ISOLATED_MS, `removed in ${removal.ms.toFixed(0)} ms, not after the stalled folder's deadline`);
    assert.deepEqual(readPackSources(fixture.root).sources, [entries[0], entries[1], entries[3]]);
    assert.deepEqual(filesBesidesSources(fixture), others);
    t.diagnostic(`remove ${removal.ms.toFixed(0)} ms (limit ${ISOLATED_MS} ms)`);
  });

  await t.test('adding a repository never looks at a saved folder, and refuses only for its own reasons', async t => {
    const { fixture, f, spy, entries, key } = await scenario(t);
    const addition = await timed(() => addSource(f, fixture, 'https://github.com/acme/elsewhere'));
    // Its own clone takes real time, so this is not bounded by the clock: it must be saved, not a timeout caused by the saved folder.
    assert.equal(addition.value.status, 200, JSON.stringify(addition.value.body));
    assert.equal(/** @type {any} */ (addition.value.body).count, 1);
    assert.deepEqual(spy.readers().map(readerRequest).map(request => [request.op, request.document]), [['source', 'candidate']],
      'the repository is validated from its text and read once; no reader touched a saved folder');
    assert.deepEqual(readPackSources(fixture.root).sources, [...entries, remoteEntry('acme/elsewhere')]);
    // A repeated repository is a duplicate at once, with no reader at all, and so is a ninth entry.
    const repeated = await timed(() => addSource(f, fixture, 'https://github.com/acme/unused'));
    assert.deepEqual([repeated.value.status, /** @type {any} */ (repeated.value.body).error, /** @type {any} */ (repeated.value.body).key],
      [409, 'duplicate', key(3)]);
    assert.ok(repeated.ms < ISOLATED_MS);
    assert.equal(spy.readers().length, 1, 'a refused repository starts no reader');
    t.diagnostic(`add ${addition.ms.toFixed(0)} ms, duplicate ${repeated.ms.toFixed(0)} ms (a stalled folder's deadline would add 5,000 ms)`);
  });
});

test('T008 a saved folder that never answers keeps its key and row, refuses a refresh that might have come from it, and can be removed', { timeout: 150_000 }, async t => {
  const fixture = packFixture();
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/spare', ['rust']);
  const stalled = fs.realpathSync(localSource(fixture, 'stalled-share', ['stuck']));
  const team = fs.realpathSync(localSource(fixture, 'team-packs', ['alpha']));
  const later = fs.realpathSync(localSource(fixture, 'later-packs', ['delta']));
  // Beside the stalled folder: a good folder, a repository that nothing is installed from, and another good folder.
  const entries = [localEntry(team), localEntry(stalled), remoteEntry('acme/spare'), localEntry(later)];
  // alpha was installed from some folder, so a refresh takes its source from the saved folders, and the stalled one might be it.
  const profile = { alpha: fixture.entry('alpha', { type: 'local', location: path.join(fixture.temporary, 'recorded-catalog') }) };
  fixture.profile(profile);
  saveSources(fixture, entries);
  stallResolutionOf(t, fixture, stalled);
  const key = (/** @type {number} */ index) => sharedKey(fixture, entries[index]);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const refresh = await f.post({ op: 'prepare', operation: 'refresh', name: 'alpha' });
    assert.notEqual(refresh.status, 202, 'a refresh is refused, never answered from the default catalog by guessing');
    assert.ok(['source_unavailable', 'operation_unavailable'].includes((await refresh.json()).error));
    assert.equal(f.provider.read().packRequests.length, 0, 'no receipt exists');
    // Its row: unavailable, with the key the shared module gives a folder it cannot resolve, and every saved folder in order.
    // A read that must describe every folder waits for the stalled one for exactly its reader deadline and stop window, once.
    // Each operation's own kills decide its reason; an earlier failed stop does not change a later clean one.
    const plainKillStart = kills.calls.length;
    const waited = await timed(() => plainRead(f));
    const plain = waited.value;
    assert.ok(waited.ms >= 4_900 && waited.ms < 7_500, `a deadline of 5,000 ms plus at most 2,000 ms to confirm the stop: ${waited.ms.toFixed(0)} ms`);
    const row = sourceRows(plain).get('stalled-share');
    const plainReason = kills.calls.slice(plainKillStart).some(call => call.error) ? 'catalog_cleanup_failed' : 'catalog_timeout';
    assert.deepEqual([row.key, row.status, row.reason], [key(1), 'unavailable', plainReason]);
    assert.equal(row.installedCount, null, 'what is installed from a folder that did not answer is unknown, not none');
    assert.deepEqual(plain.sources.items.filter(/** @param {any} item */ item => item.scope === 'project').map(/** @param {any} item */ item => item.key),
      [key(0), key(1), key(2), key(3)]);
    assert.deepEqual(plain.sources.unmatched, { unlisted: 0, unknown: 1 }, 'a record that names no answering folder is Unknown, not Unlisted');
    if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
    // A discovery names it too, and its coverage is partial rather than a confirmed total.
    const discoveryKillStart = kills.calls.length;
    const discovered = await discover(f);
    const read = sourceRows(discovered);
    const discoveryReason = kills.calls.slice(discoveryKillStart).some(call => call.error) ? 'catalog_cleanup_failed' : 'catalog_timeout';
    assert.deepEqual([read.get('stalled-share').key, read.get('stalled-share').status, read.get('stalled-share').reason],
      [key(1), 'unavailable', discoveryReason]);
    assert.deepEqual([read.get('team-packs').status, read.get('acme/spare').status, read.get('later-packs').status], ['read', 'read', 'read']);
    assert.equal(discovered.coverage.catalog.state, 'partial');
    if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
    // A key that no answering folder has might still be the stalled folder's, whose real path is unknown: not "unknown".
    const savedBytes = fs.readFileSync(sourcesFile(fixture));
    const unidentifiedKillStart = kills.calls.length;
    const unidentified = await removeSource(f, fixture, `src_${'e'.repeat(32)}`);
    const unidentifiedCleanupFailed = kills.calls.slice(unidentifiedKillStart).some(call => call.error);
    assert.deepEqual([unidentified.status, /** @type {any} */ (unidentified.body).error],
      unidentifiedCleanupFailed ? [503, 'unavailable'] : [504, 'timeout']);
    if (unidentifiedCleanupFailed) assert.equal(/** @type {any} */ (unidentified.body).message,
      'A saved folder could not be read, so this source could not be identified. Nothing was changed. Try again.');
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), savedBytes);
    if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
    // An installed pack that records the spelled location of that folder still blocks its removal, and is named.
    fixture.profile({ ...profile, stuck: fixture.entry('stuck', { type: 'local', location: stalled }) });
    const saved = fs.readFileSync(sourcesFile(fixture));
    const blocked = await removeSource(f, fixture, key(1));
    assert.deepEqual([blocked.status, /** @type {any} */ (blocked.body).error], [409, 'source_in_use']);
    assert.deepEqual(/** @type {any} */ (blocked.body).blockers, [{ kind: 'installed', name: 'stuck' }]);
    assert.match(/** @type {any} */ (blocked.body).message, /\bstuck\b/);
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), saved);
    // Once nothing records it, removing it deletes only that entry, keeps the order of the rest and changes no other byte.
    fixture.profile(profile);
    const others = filesBesidesSources(fixture);
    const removal = await removeSource(f, fixture, key(1));
    assert.equal(removal.status, 200, JSON.stringify(removal.body));
    assert.deepEqual(readPackSources(fixture.root).sources, [entries[0], entries[2], entries[3]]);
    assert.deepEqual(filesBesidesSources(fixture), others);
    if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a local add beside a saved folder that never answers is a timeout that does not blame the new folder, and saves nothing', { timeout: 60_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const stalled = fs.realpathSync(localSource(fixture, 'stalled-share', ['stuck']));
  const fresh = fs.realpathSync(localSource(fixture, 'fresh-packs', ['alpha']));
  saveSources(fixture, [localEntry(stalled)]);
  stallResolutionOf(t, fixture, stalled);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    // The shared checks of a local add resolve the saved folders too, so the folder that stalls them may not be the new one.
    const savedBytes = fs.readFileSync(sourcesFile(fixture));
    const refused = await addSource(f, fixture, fresh);
    const cleanupFailed = kills.failed.size > 0;
    assert.deepEqual([refused.status, /** @type {any} */ (refused.body).error],
      cleanupFailed ? [503, 'cleanup_unconfirmed'] : [504, 'timeout'], JSON.stringify(refused.body));
    if (cleanupFailed) assert.equal(/** @type {any} */ (refused.body).message,
      'The catalog reader could not confirm process cleanup, so nothing was saved.');
    else assert.match(/** @type {any} */ (refused.body).message, /^A folder, the new one or a saved one, did not answer within 5 seconds\./);
    assert.deepEqual(fs.readFileSync(sourcesFile(fixture)), savedBytes, 'nothing was saved');
    if (process.platform === 'win32') await assertRetainedRoots({ t, fixture, spy, kills });
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 the key of a folder that cannot be resolved is the one the shared module gives it', () => {
  const fixture = packFixture();
  try {
    const real = fs.realpathSync(localSource(fixture, 'team-packs', ['alpha']));
    const gone = path.join(fixture.temporary, 'gone-packs');
    // A folder that resolves to its own spelling has this key whether or not it can be resolved.
    for (const location of [real, path.relative(fixture.root, real), `${real}${path.sep}`]) {
      assert.equal(unresolvedSourceKey(fixture.root, location), sharedKey(fixture, localEntry(location)), location);
    }
    // A folder the shared module cannot resolve is keyed by its spelling, which is what this derives.
    for (const location of [gone, path.relative(fixture.root, gone), `${gone}${path.sep}`, gone.toUpperCase(), gone.toLowerCase()]) {
      const described = describePackSources({ root: fixture.root, sources: [localEntry(location)], builtins: [] }).sources[0];
      assert.equal(described.root, null, location);
      assert.equal(unresolvedSourceKey(fixture.root, location), described.key, location);
    }
    assert.notEqual(unresolvedSourceKey(fixture.root, real), unresolvedSourceKey(fixture.root, gone));
    assert.match(unresolvedSourceKey(fixture.root, gone), /^src_[0-9a-f]{32}$/);
  } finally { fixture.cleanup(); }
});

test('T008 a folder saved through a link is named by its real path, and only one that cannot be resolved is named by its spelling', { timeout: 30_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const real = fs.realpathSync(localSource(fixture, 'real-packs', ['ui']));
  const link = path.join(fixture.temporary, 'linked-packs');
  fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  saveSources(fixture, [localEntry(link)]);
  const f = await packHttpFixture(fixture);
  try {
    const row = sourceRows(await plainRead(f)).get('linked-packs');
    assert.equal(row.key, sharedKey(fixture, localEntry(link)));
    assert.notEqual(row.key, unresolvedSourceKey(fixture.root, link), 'a link resolves to its target, so its spelling is not its key');
    const unknown = await removeSource(f, fixture, unresolvedSourceKey(fixture.root, link));
    assert.deepEqual([unknown.status, /** @type {any} */ (unknown.body).error], [422, 'unknown_source'], 'the spelling names nothing while the folder answers');
    const removed = await removeSource(f, fixture, row.key);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.deepEqual(readPackSources(fixture.root).sources, []);
  } finally { await f.close(); fixture.cleanup(); }
});

/* -------------------------------------------------------------------------
 * T008: requests bound to a saved source. The binding is frozen in the receipt
 * and compared whole at the handoff, the permission and the result; an Applied
 * install is proven by the fresh profile source, never by an echoed key or name.
 * ------------------------------------------------------------------------- */

/**
 * A saved source folder with its own alpha, laid out as Compose installs from it.
 * @param {ReturnType<typeof packEngineFixture>} fixture @param {string} [name] @param {string} [marker]
 */
function artifactSource(fixture, name = 'team-packs', marker = 'Team v1.') {
  const directory = path.join(fixture.temporary, name);
  fs.cpSync(path.join(fixture.library, 'alpha'), path.join(directory, 'library/packs/alpha'), { recursive: true });
  const agent = path.join(directory, 'library/packs/alpha/agents/dude-pack-alpha-worker.agent.md');
  fs.writeFileSync(agent, fs.readFileSync(agent, 'utf8').replace('Fixture v1.', marker));
  return directory;
}

/**
 * Publish a GitHub repository whose catalog holds the engine fixture's alpha.
 * @param {ReturnType<typeof offlineGitHub>} github @param {ReturnType<typeof packEngineFixture>} fixture @param {string} repository
 */
function publishAlpha(github, fixture, repository) {
  /** @type {Record<string, Buffer>} */
  const files = {};
  for (const [relative, content] of snapshotFiles(path.join(fixture.library, 'alpha'))) {
    files[`library/packs/alpha/${relative.split(path.sep).join('/')}`] = content;
  }
  return github.publish(repository, [], { files });
}

/** The revision a local source's first permission target pins: the digest of its pack metadata file. @param {string} folder */
const folderRevision = folder => packRevision(fs.readFileSync(path.join(folder, 'library/packs/alpha/pack.md')));

const LEGACY_HANDOFF_KEYS = ['name', 'operation', 'owner', 'providerGeneration', 'receiptId', 'sessionId', 'workspaceId'];

test('T008 an install bound to a saved folder carries its binding through the handoff and permission, and is Applied only from that folder', { timeout: 60_000 }, async t => {
  const fixture = packEngineFixture();
  const team = artifactSource(fixture);
  saveSources(fixture, [localEntry(team)]);
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const plain = await plainRead(f);
    const key = sourceRows(plain).get('team-packs').key;
    const before = snapshotFiles(fixture.root);
    const receipt = await f.admission('install', key);
    const binding = receipt.receipt.catalogSource;
    assert.deepEqual(binding, { key, sourcesRevision: plain.sources.sourcesRevision, source: { type: 'local', location: fs.realpathSync(team) } });
    assert.deepEqual(Object.keys(binding), ['key', 'sourcesRevision', 'source']);
    assert.deepEqual(snapshotFiles(fixture.root), before, 'admission writes nothing');
    // The handoff keeps its fixed prefix and adds the one sentence and the binding, only for this request.
    assert.equal(f.sends.length, 1);
    const lines = f.sends[0].prompt.split('\n');
    assert.deepEqual(Object.keys(JSON.parse(lines.at(-1))).sort(), [...LEGACY_HANDOFF_KEYS, 'catalogSource'].sort());
    assert.deepEqual(JSON.parse(lines.at(-1)).catalogSource, binding);
    assert.equal(lines.filter(line => /bound to one source the project added/.test(line)).length, 1);
    assert.match(lines.find(line => /bound to one source/.test(line)) ?? '', /exactly that source and its configured ref with Compose --source and --ref/);
    // The permission must name the bound source first, as a third-party source, pinned by its file digest.
    const impact = { source: binding.source, files: ['.github/agents/dude-pack-alpha-worker.agent.md'], tools: [] };
    const good = sourceFirstTargets(fixture, binding, folderRevision(team));
    for (const [label, targets] of /** @type {Array<[string, any[]]>} */ ([
      ['the pack first, with no source', good.slice(1)],
      ['a source without the third-party label', [{ ...good[0], target: binding.source.location }, ...good.slice(1)]],
      ['another folder', [{ ...good[0], target: 'Third-party source C:\\elsewhere\\packs' }, ...good.slice(1)]],
      // A different source whose text merely contains the bound folder is not the bound folder.
      ['a folder that only extends the bound one', [{ ...good[0], target: `Third-party source ${binding.source.location}-EVIL` }, ...good.slice(1)]],
      ['a folder inside the bound one', [{ ...good[0], target: `Third-party source ${binding.source.location}${path.sep}extra` }, ...good.slice(1)]],
      ['a longer path that ends with the bound folder', [{ ...good[0], target: `Third-party source X${binding.source.location}` }, ...good.slice(1)]],
      ['a commit revision for a folder', [{ ...good[0], revision: `commit:${'a'.repeat(40)}` }, ...good.slice(1)]],
      ['a revision that is not a digest', [{ ...good[0], revision: 'latest' }, ...good.slice(1)]],
      ['the source listed second', [good[1], good[0], good[2]]],
    ])) {
      await assert.rejects(() => f.permission(receipt, impact, { targets }), /identity_mismatch/, label);
    }
    const permission = await f.permission(receipt, impact, { targets: good });
    await permission.reply();
    const result = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', source: binding.source.location, fetch: false });
    assert.equal(result.ok, true, result.error);
    assert.match(fs.readFileSync(path.join(fixture.root, '.github/agents/dude-pack-alpha-worker.agent.md'), 'utf8'), /Team v1\./,
      'the installed pack came from the bound folder, not the default library');
    const exact = f.acknowledgment(receipt, result);
    const launchedBeforeResult = spy.readers().length;
    assert.deepEqual(exact.catalogSource, binding);
    assert.deepEqual(exact.source, { type: 'local', location: fs.realpathSync(team) });
    // The exact echo is the only one accepted: absent, null, another value or an extra field never reconciles.
    for (const [label, mutate, reason] of /** @type {Array<[string, (ack: any) => void, string]>} */ ([
      ['a missing echo', ack => { delete ack.catalogSource; }, 'acknowledgment_conflict'],
      ['a null echo', ack => { ack.catalogSource = null; }, 'invalid_input'],
      ['another key', ack => { ack.catalogSource.key = `src_${'f'.repeat(32)}`; }, 'acknowledgment_conflict'],
      ['another configuration revision', ack => { ack.catalogSource.sourcesRevision = `sha256:${'1'.repeat(64)}`; }, 'acknowledgment_conflict'],
      ['another folder', ack => { ack.catalogSource.source.location = path.join(fixture.temporary, 'elsewhere'); }, 'acknowledgment_conflict'],
      ['a remote source', ack => { ack.catalogSource.source = { type: 'remote', repository: 'https://github.com/acme/x', ref: 'main' }; }, 'acknowledgment_conflict'],
      ['an extra field', ack => { ack.catalogSource.extra = true; }, 'invalid_input'],
      ['an extra source field', ack => { ack.catalogSource.source.ref = 'main'; }, 'invalid_input'],
    ])) {
      const variant = structuredClone(exact);
      mutate(variant);
      const refused = await f.tool({ op: 'acknowledge', acknowledgment: variant });
      assert.equal(refused.resultType, 'failure', label);
      assert.equal(JSON.parse(refused.textResultForLlm).reason, reason, label);
    }
    assert.equal((await f.feed()).packRequests[0].phase, 'waiting_owner', 'a refused echo leaves the request unreconciled');
    const accepted = await f.tool({ op: 'acknowledge', acknowledgment: exact });
    assert.equal(accepted.resultType, 'success', accepted.textResultForLlm);
    assert.equal(spy.readers().length, launchedBeforeResult, 'the result reread is installed-only: it launches no catalog reader');
    const view = (await f.feed()).packRequests[0];
    assert.equal(view.phase, 'applied');
    assert.equal(view.applied, true);
    assert.deepEqual(view.receipt.catalogSource, binding);
    assert.deepEqual(view.receipt.reread.entry.source, { type: 'local', location: fs.realpathSync(team) });
    assert.equal(f.sends.length, 1);
    assert.equal(JSON.parse((await f.tool({ op: 'acknowledge', acknowledgment: exact })).textResultForLlm).reason, 'acknowledgment_conflict');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 an echoed key or a pack name never makes a wrong source Applied: the fresh profile source must be the bound one', { timeout: 150_000 }, async t => {
  for (const scenario of ['the default library', 'another saved folder', 'another repository', 'another commit']) {
    await t.test(`installed from ${scenario}`, { timeout: 60_000 }, async t => {
      const fixture = packEngineFixture();
      const remote = ['another repository', 'another commit'].includes(scenario);
      const github = remote ? offlineGitHub(t, fixture) : null;
      const team = remote ? null : artifactSource(fixture);
      const other = scenario === 'another saved folder' ? artifactSource(fixture, 'other-packs', 'Other v1.') : null;
      const repo = github ? publishAlpha(github, fixture, 'acme/dude-packs') : null;
      const reviewed = repo?.commit() ?? null;
      const stranger = scenario === 'another repository' && github ? publishAlpha(github, fixture, 'acme/other-packs') : null;
      saveSources(fixture, [repo ? remoteEntry('acme/dude-packs') : localEntry(/** @type {string} */ (team)), ...(other ? [localEntry(other)] : [])]);
      const f = await packHttpFixture(fixture);
      try {
        const key = sourceRows(await plainRead(f)).get(repo ? 'acme/dude-packs' : 'team-packs').key;
        const receipt = await f.admission('install', key);
        const binding = receipt.receipt.catalogSource;
        const permission = await f.permission(receipt, { source: binding.source }, {
          targets: sourceFirstTargets(fixture, binding, reviewed ? `commit:${reviewed}` : folderRevision(/** @type {string} */ (team))) });
        await permission.reply();
        /** @type {Awaited<ReturnType<typeof cmdAdd>>} */
        let result;
        if (scenario === 'the default library') result = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', fetch: false });
        else if (other) result = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', source: fs.realpathSync(other), fetch: false });
        else if (stranger) result = await cmdAddOffLoop({ root: fixture.root, library: fixture.library, name: 'alpha', source: stranger.url, ref: /** @type {string} */ (stranger.commit()) });
        else {
          const later = /** @type {NonNullable<typeof repo>} */ (repo);
          fs.writeFileSync(path.join(later.directory, 'CHANGELOG.md'), 'A later commit.\n');
          later.git('add', '-A');
          later.git('-c', 'user.email=fixture@example.test', '-c', 'user.name=Canvas Fixture', 'commit', '-qm', 'later');
          assert.notEqual(later.commit(), reviewed);
          result = await cmdAddOffLoop({ root: fixture.root, library: fixture.library, name: 'alpha', source: later.url, ref: later.commit() });
        }
        assert.equal(result.ok, true, result.error);
        const ack = f.acknowledgment(receipt, result);
        assert.deepEqual(ack.catalogSource, binding, 'the echo is exact, so only the profile source can refuse this');
        const refused = await f.tool({ op: 'acknowledge', acknowledgment: ack });
        assert.equal(refused.resultType, 'failure');
        assert.equal(JSON.parse(refused.textResultForLlm).reason, 'pack_state_mismatch');
        const view = (await f.feed()).packRequests[0];
        assert.deepEqual([view.applied, view.phase], [false, 'stale']);
        assert.equal(view.receipt.acknowledgment, null);
      } finally { await f.close(); fixture.cleanup(); }
    });
  }
});

test('T008 an install bound to a saved GitHub source is reviewed at a commit, pinned to it, and Applied only from that repository at that commit', { timeout: 90_000 }, async t => {
  const fixture = packEngineFixture();
  const github = offlineGitHub(t, fixture);
  const repo = publishAlpha(github, fixture, 'acme/dude-packs');
  const commit = repo.commit();
  saveSources(fixture, [remoteEntry('acme/dude-packs')]);
  const f = await packHttpFixture(fixture);
  try {
    const plain = await plainRead(f);
    const key = sourceRows(plain).get('acme/dude-packs').key;
    const receipt = await f.admission('install', key);
    const binding = receipt.receipt.catalogSource;
    assert.deepEqual(binding, { key, sourcesRevision: plain.sources.sourcesRevision,
      source: { type: 'remote', repository: repo.url, ref: 'main' } });
    assert.match(f.sends[0].prompt.split('\n').at(-1), /"catalogSource":\{"key":"src_[0-9a-f]{32}","sourcesRevision":"sha256:[0-9a-f]{64}","source":\{"type":"remote","repository":"https:\/\/github\.com\/acme\/dude-packs","ref":"main"\}\}/);
    const impact = { source: binding.source, reviewedCommit: commit };
    // A remote source is pinned by the commit that was reviewed, never by a folder digest or a moving ref.
    const good = sourceFirstTargets(fixture, binding, `commit:${commit}`);
    for (const [label, targets] of /** @type {Array<[string, any[]]>} */ ([
      ['a digest instead of a commit', [{ ...good[0], revision: packRevision('a folder digest') }, ...good.slice(1)]],
      ['a branch instead of a commit', [{ ...good[0], revision: 'main' }, ...good.slice(1)]],
      ['another repository', [{ ...good[0], target: 'Third-party source https://github.com/acme/other-packs @ main' }, ...good.slice(1)]],
      // A different source whose text merely contains the bound repository is not the bound repository.
      ['a repository whose name extends the bound one', [{ ...good[0], target: `Third-party source ${binding.source.repository}-evil @ main` }, ...good.slice(1)]],
      ['a path below the bound repository', [{ ...good[0], target: `Third-party source ${binding.source.repository}/extra @ main` }, ...good.slice(1)]],
      ['the bound repository with a suffix', [{ ...good[0], target: `Third-party source ${binding.source.repository}.git @ main` }, ...good.slice(1)]],
      ['a longer address that ends with the bound repository', [{ ...good[0], target: `Third-party source x${binding.source.repository} @ main` }, ...good.slice(1)]],
      ['no third-party label', [{ ...good[0], target: `${binding.source.repository} @ main` }, ...good.slice(1)]],
    ])) {
      await assert.rejects(() => f.permission(receipt, impact, { targets }), /identity_mismatch/, label);
    }
    const permission = await f.permission(receipt, impact, { targets: good });
    await permission.reply();
    const result = await cmdAddOffLoop({ root: fixture.root, library: fixture.library, name: 'alpha', source: repo.url, ref: commit });
    assert.equal(result.ok, true, result.error);
    const ack = f.acknowledgment(receipt, result);
    assert.deepEqual(ack.source, { type: 'remote', repository: repo.url, requested_ref: commit, resolved_commit: commit });
    const accepted = await f.tool({ op: 'acknowledge', acknowledgment: ack });
    assert.equal(accepted.resultType, 'success', accepted.textResultForLlm);
    const view = (await f.feed()).packRequests[0];
    assert.deepEqual([view.phase, view.applied], ['applied', true]);
    assert.deepEqual(view.receipt.catalogSource, binding);
    assert.deepEqual(view.receipt.reread.entry.source, ack.source);
    assert.equal(f.sends.length, 1);
    // The configured ref stays the branch to track; the install pinned the reviewed commit.
    assert.equal(readPackSources(fixture.root).sources[0].ref, 'main');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a request for a missing, unavailable or unreadable source is refused at prepare, with no receipt and no fallback to another catalog', { timeout: 60_000 }, async t => {
  const fixture = packEngineFixture();
  const team = artifactSource(fixture);
  const bare = path.join(fixture.temporary, 'bare-packs');
  fs.mkdirSync(path.join(bare, 'library/packs'), { recursive: true });
  const gone = artifactSource(fixture, 'gone-packs');
  saveSources(fixture, [localEntry(team), localEntry(bare), localEntry(gone)]);
  fs.rmSync(gone, { recursive: true });
  const spy = spawnSpy(t);
  const f = await packHttpFixture(fixture);
  try {
    const rows = sourceRows(await plainRead(f));
    const before = snapshotFiles(fixture.root);
    /** @param {unknown} source @param {number} status @param {string} error @param {string} label */
    const refused = async (source, status, error, label) => {
      const response = await f.post({ op: 'prepare', operation: 'install', name: 'alpha', source });
      assert.deepEqual([response.status, (await response.json()).error], [status, error], label);
    };
    // The default library has alpha, so a quiet fallback would have prepared this request.
    await refused(`src_${'e'.repeat(32)}`, 409, 'source_changed', 'a key that no saved source has');
    await refused(rows.get('bare-packs').key, 409, 'pack_ineligible', 'a saved source that lacks the pack');
    await refused(rows.get('gone-packs').key, 409, 'source_unavailable', 'a saved folder that is gone');
    await refused(rows.get('Local library').key, 400, 'invalid_input', 'a built-in key, which names no added source');
    for (const malformed of ['x', 'src_', `src_${'E'.repeat(32)}`, `src_${'e'.repeat(31)}`, `src_${'e'.repeat(33)}`, `${rows.get('team-packs').key} `, null, 5, {}, []]) {
      await refused(malformed, 400, 'invalid_input', `malformed ${JSON.stringify(malformed)}`);
    }
    // An unreadable document leaves no source to select, but the default catalog and profile removal stay usable.
    fs.writeFileSync(sourcesFile(fixture), '# Pack Sources\n\nnot a sources document\n');
    await refused(rows.get('team-packs').key, 409, 'source_unavailable', 'an unreadable sources document');
    assert.equal(f.provider.read().packRequests.length, 0, 'no refusal left a receipt');
    assert.equal(f.sends.length, 0);
    assert.deepEqual(snapshotFiles(fixture.root).get(path.normalize(PACK_SOURCES_PATH)), Buffer.from('# Pack Sources\n\nnot a sources document\n'));
    for (const [path_, value] of before) {
      if (path_ !== path.normalize(PACK_SOURCES_PATH)) assert.deepEqual(snapshotFiles(fixture.root).get(path_), value, `${path_} is unchanged`);
    }
    const defaultReceipt = await f.admission('install');
    assert.equal(Object.hasOwn(defaultReceipt.receipt, 'catalogSource'), false, 'the default install is unaffected by the unreadable document');
    assert.equal(spy.readers().length > 0, true);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a source that changes between prepare and submit is a refusal that sends nothing and never falls back', { timeout: 120_000 }, async t => {
  /** @type {Array<[string, (c: { fixture: ReturnType<typeof packEngineFixture>, team: string, other: string }) => void, number, string]>} */
  const scenarios = [
    ['its entry was removed', ({ fixture }) => { saveSources(fixture, []); }, 409, 'source_changed'],
    ['its entry was replaced by another folder', ({ fixture, other }) => { saveSources(fixture, [localEntry(other)]); }, 409, 'source_changed'],
    ['another source was saved beside it, which changes the configuration revision', ({ fixture, team, other }) => { saveSources(fixture, [localEntry(team), localEntry(other)]); }, 409, 'source_changed'],
    ['its folder is gone', ({ team }) => { fs.rmSync(team, { recursive: true }); }, 409, 'source_unavailable'],
    ['its pack is gone from its catalog', ({ team }) => { fs.rmSync(path.join(team, 'library/packs/alpha'), { recursive: true }); }, 409, 'pack_ineligible'],
    ['its catalog metadata changed', ({ team }) => { fs.appendFileSync(path.join(team, 'library/packs/alpha/pack.md'), '\nA later edit.\n'); }, 409, 'source_changed'],
    ['the saved sources became unreadable', ({ fixture }) => { fs.writeFileSync(sourcesFile(fixture), '# Pack Sources\n\nnot a sources document\n'); }, 409, 'source_unavailable'],
  ];
  for (const [scenario, change, status, error] of scenarios) {
    await t.test(scenario, async () => {
      const fixture = packEngineFixture();
      const team = artifactSource(fixture);
      const other = artifactSource(fixture, 'other-packs', 'Other v1.');
      saveSources(fixture, [localEntry(team)]);
      const f = await packHttpFixture(fixture);
      try {
        const key = sourceRows(await plainRead(f)).get('team-packs').key;
        const prepared = await f.post({ op: 'prepare', operation: 'install', name: 'alpha', source: key });
        assert.equal(prepared.status, 202);
        const receipt = await prepared.json();
        change({ fixture, team, other });
        const before = snapshotFiles(fixture.root);
        const submit = await f.post({ op: 'submit', operation: 'install', name: 'alpha', source: key, packReceipt: receipt.packReceipt });
        assert.deepEqual([submit.status, (await submit.json()).error], [status, error]);
        assert.equal(f.sends.length, 0, 'nothing was sent for a source that is not the one prepared');
        assert.deepEqual(snapshotFiles(fixture.root), before);
        const view = (await f.feed()).packRequests[0];
        assert.equal(view.receipt.current, false);
        assert.equal(view.applied, false);
        // The receipt is used and cannot be resubmitted; the request must be prepared again.
        const again = await f.post({ op: 'submit', operation: 'install', name: 'alpha', source: key, packReceipt: receipt.packReceipt });
        assert.equal(again.status, 409);
        assert.equal(f.sends.length, 0);
      } finally { await f.close(); fixture.cleanup(); }
    });
  }
});

test('T008 a submit must name the same source as its receipt, or none, and a default request never carries a binding', { timeout: 60_000 }, async () => {
  const fixture = packEngineFixture();
  const team = artifactSource(fixture);
  saveSources(fixture, [localEntry(team)]);
  const f = await packHttpFixture(fixture);
  try {
    const key = sourceRows(await plainRead(f)).get('team-packs').key;
    const bound = await (await f.post({ op: 'prepare', operation: 'install', name: 'alpha', source: key })).json();
    for (const submit of [{ }, { source: `src_${'e'.repeat(32)}` }, { source: null }]) {
      const refused = await f.post({ op: 'submit', operation: 'install', name: 'alpha', packReceipt: bound.packReceipt, ...submit });
      assert.equal(refused.status, submit.source === null ? 400 : 409, JSON.stringify(submit));
    }
    assert.equal(f.sends.length, 0);
    // The receipt survived those refusals and is still prepared for exactly its own source.
    const delivered = await f.post({ op: 'submit', operation: 'install', name: 'alpha', source: key, packReceipt: bound.packReceipt });
    assert.equal(delivered.status, 202, JSON.stringify(await delivered.json()));
    assert.equal(f.sends.length, 1);
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a default request keeps the exact handoff text, receipt and acknowledgment, with no binding, however many sources are saved', { timeout: 60_000 }, async () => {
  const fixture = packEngineFixture();
  const team = artifactSource(fixture);
  saveSources(fixture, [localEntry(team)]);
  const f = await packHttpFixture(fixture);
  try {
    const key = sourceRows(await plainRead(f)).get('team-packs').key;
    const prepared = await f.post({ op: 'prepare', operation: 'install', name: 'alpha' });
    assert.equal(prepared.status, 202);
    const receipt = await prepared.json();
    assert.equal(Object.hasOwn(receipt.receipt, 'catalogSource'), false, 'the field is absent, not null');
    // A default receipt cannot be submitted against a saved source.
    const mismatched = await f.post({ op: 'submit', operation: 'install', name: 'alpha', source: key, packReceipt: receipt.packReceipt });
    assert.deepEqual([mismatched.status, (await mismatched.json()).error], [409, 'identity_mismatch']);
    const delivered = await f.post({ op: 'submit', operation: 'install', name: 'alpha', packReceipt: receipt.packReceipt });
    assert.equal(delivered.status, 202);
    const { receiptId, owner, operation, name, workspaceId, sessionId, providerGeneration } = receipt.receipt;
    assert.equal(f.sends[0].prompt, [
      'Dude Canvas explicit pack request in this joined workspace/session.',
      'Use dude-compose for this exact operation and pack only. This request is not application consent.',
      'The coordinator owns the actual impact preview, exact literal permission, source/profile/target freshness, Compose application and verification.',
      'Use the existing Needs You session permission: requestRef=pack:<receiptId>, source.revision=<providerGeneration>, fields.operation=pack:<operation>.',
      'After the owner result, use dude_needs_you acknowledge with recognizes=pack_result, the exact binding below, actual Compose result and current profile source/revision. Delivery never means Applied.',
      JSON.stringify({ receiptId, owner, operation, name, workspaceId, sessionId, providerGeneration }),
    ].join('\n'), 'the default handoff is byte-for-byte the 063 text and final JSON');
    const impact = { files: ['.github/agents/dude-pack-alpha-worker.agent.md'], tools: [] };
    const permission = await f.permission(receipt, impact);
    await permission.reply();
    const result = await cmdAdd({ root: fixture.root, library: fixture.library, name: 'alpha', fetch: false });
    assert.equal(result.ok, true, result.error);
    const exact = f.acknowledgment(receipt, result);
    assert.equal(Object.hasOwn(exact, 'catalogSource'), false);
    // An echo that no binding was prepared for is a conflict, never an extra accepted field.
    const invented = { ...structuredClone(exact), catalogSource: { key, sourcesRevision: savedRevision(fixture), source: { type: 'local', location: fs.realpathSync(team) } } };
    const conflict = await f.tool({ op: 'acknowledge', acknowledgment: invented });
    assert.equal(JSON.parse(conflict.textResultForLlm).reason, 'acknowledgment_conflict');
    const nulled = await f.tool({ op: 'acknowledge', acknowledgment: { ...structuredClone(exact), catalogSource: null } });
    assert.equal(JSON.parse(nulled.textResultForLlm).reason, 'invalid_input', 'the field is absent, never null');
    const accepted = await f.tool({ op: 'acknowledge', acknowledgment: exact });
    assert.equal(accepted.resultType, 'success', accepted.textResultForLlm);
    const feed = await f.feed();
    assert.equal(feed.packRequests[0].applied, true);
    assert.equal(JSON.stringify(feed.packRequests).includes('catalogSource'), false, 'nothing in the default request mentions a binding');
  } finally { await f.close(); fixture.cleanup(); }
});

test('T008 a refresh takes its source from the installed record and accepts no choice; a removal reads no source', { timeout: 90_000 }, async t => {
  /** @param {ReturnType<typeof packEngineFixture>} fixture @param {any} installed */
  const recorded = (fixture, installed) => fixture.profile({ alpha: fixture.entry('alpha', installed) });
  await t.test('an installed record from a saved folder selects that folder', async () => {
    const fixture = packEngineFixture();
    const team = artifactSource(fixture);
    saveSources(fixture, [localEntry(team)]);
    recorded(fixture, { type: 'local', location: fs.realpathSync(team) });
    const f = await packHttpFixture(fixture);
    try {
      const plain = await plainRead(f);
      const key = sourceRows(plain).get('team-packs').key;
      const refused = await f.post({ op: 'prepare', operation: 'refresh', name: 'alpha', source: key });
      assert.deepEqual([refused.status, (await refused.json()).error], [400, 'invalid_input'], 'a refresh takes no browser choice');
      const removing = await f.post({ op: 'prepare', operation: 'remove', name: 'alpha', source: key });
      assert.deepEqual([removing.status, (await removing.json()).error], [400, 'invalid_input'], 'a removal takes no source');
      const receipt = await f.admission('refresh');
      assert.deepEqual(receipt.receipt.catalogSource, { key, sourcesRevision: plain.sources.sourcesRevision,
        source: { type: 'local', location: fs.realpathSync(team) } });
      assert.deepEqual(JSON.parse(f.sends[0].prompt.split('\n').at(-1)).catalogSource, receipt.receipt.catalogSource);
      assert.equal(f.sends.length, 1);
    } finally { await f.close(); fixture.cleanup(); }
  });
  await t.test('an installed record from the default library, or from nowhere listed, selects the default catalog', async () => {
    for (const installed of [{ type: 'local', location: 'LIBRARY' }, { type: 'local', location: '/recorded/catalog' }]) {
      const fixture = packEngineFixture();
      const team = artifactSource(fixture);
      saveSources(fixture, [localEntry(team)]);
      recorded(fixture, installed.location === 'LIBRARY' ? { type: 'local', location: fs.realpathSync(fixture.library) } : installed);
      const f = await packHttpFixture(fixture);
      try {
        const receipt = await f.admission('refresh');
        assert.equal(Object.hasOwn(receipt.receipt, 'catalogSource'), false,
          'the by-name default is explicit policy for an unmatched record, and it never picks the saved folder that also has this name');
        assert.equal(f.sends[0].prompt.includes('bound to one source'), false);
      } finally { await f.close(); fixture.cleanup(); }
    }
  });
  await t.test('a matching saved folder that is gone is a refusal, never the default catalog that also has the pack', async t => {
    const fixture = packEngineFixture();
    const team = artifactSource(fixture);
    saveSources(fixture, [localEntry(team)]);
    recorded(fixture, { type: 'local', location: fs.realpathSync(team) });
    const spy = spawnSpy(t);
    const f = await packHttpFixture(fixture);
    try {
      await plainRead(f);
      fs.rmSync(team, { recursive: true });
      const refused = await f.post({ op: 'prepare', operation: 'refresh', name: 'alpha' });
      assert.deepEqual([refused.status, (await refused.json()).error], [409, 'source_unavailable']);
      assert.equal(f.provider.read().packRequests.length, 0);
      // Removal reads no source, so it stays usable, from the recorded installed authority alone.
      const launched = spy.readers().length;
      const removal = await f.post({ op: 'prepare', operation: 'remove', name: 'alpha' });
      const prepared = await removal.json();
      assert.equal(removal.status, 202, JSON.stringify(prepared));
      assert.equal(spy.readers().length, launched, 'a removal admission reads no catalog and describes no source');
      assert.equal(Object.hasOwn(prepared.receipt, 'catalogSource'), false, 'a removal is bound to no source');
    } finally { await f.close(); fixture.cleanup(); }
  });
  await t.test('unreadable saved sources refuse a refresh and an install of a source, but not a default install or a removal', async () => {
    const fixture = packEngineFixture();
    const team = artifactSource(fixture);
    saveSources(fixture, [localEntry(team)]);
    recorded(fixture, { type: 'local', location: fs.realpathSync(team) });
    const f = await packHttpFixture(fixture);
    try {
      const key = sourceRows(await plainRead(f)).get('team-packs').key;
      fs.writeFileSync(sourcesFile(fixture), '# Pack Sources\n\nnot a sources document\n');
      for (const body of [{ op: 'prepare', operation: 'refresh', name: 'alpha' }, { op: 'prepare', operation: 'install', name: 'alpha', source: key }]) {
        const refused = await f.post(body);
        assert.deepEqual([refused.status, (await refused.json()).error], [409, 'source_unavailable'], JSON.stringify(body));
      }
      assert.equal(f.provider.read().packRequests.length, 0);
      const removal = await f.post({ op: 'prepare', operation: 'remove', name: 'alpha' });
      assert.equal(removal.status, 202, 'profile-authorized removal needs no source');
    } finally { await f.close(); fixture.cleanup(); }
  });
});

test('T008 cancelling a request that is reading its source stops that source\'s reader tree and frees the source', { timeout: 45_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  const listener = await silentGitListener(t);
  github.redirect('acme/slow', listener.url('git'));
  saveSources(fixture, [remoteEntry('acme/slow')]);
  const spy = spawnSpy(t);
  const kills = taskkillSpy(t);
  const f = await packHttpFixture(fixture);
  const controller = new AbortController();
  /** @type {ProcessRow[]} */
  let tree = [];
  try {
    const key = sourceRows(await plainRead(f)).get('acme/slow').key;
    const origin = new URL(f.instance.url).origin;
    const reading = call(f.instance.url, { path: '/api/packs/request', method: 'POST', signal: controller.signal,
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'prepare', operation: 'install', name: 'alpha', source: key }) }).catch(error => error);
    await listener.connected();
    const reader = spy.readers().find(launch => readerRequest(launch).op === 'source' && readerRequest(launch).list === true);
    assert.ok(reader, 'the source\'s own reader is the one that is stalled');
    tree = await readerTree(/** @type {number} */ (reader.child.pid));
    const refused = await removeSource(f, fixture, key);
    assert.equal(/** @type {any} */ (refused.body).error, 'source_in_use', 'a preparation in flight holds its source');
    controller.abort();
    assert.ok((await reading) instanceof Error);
    // The preparation ends with the request: the source is released only after its tree has stopped.
    const until = Date.now() + 8_000;
    while (f.provider.sourceUses(key).length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(f.provider.sourceUses(key), []);
    const reaping = performance.now() + 3_000;
    while (listener.open && performance.now() < reaping) await new Promise(resolve => setTimeout(resolve, 25));
    if (!kills.failed.size) assert.equal(listener.open, 0, 'no Git process still holds the stalled connection');
    await assertTreeStops({ t, spy, kills, trees: [tree].filter(members => members.length > 1), scratch: fs.readdirSync(fixture.scratch) });
    assert.equal(f.provider.read().packRequests.length, 0, 'a cancelled preparation leaves no receipt');
    assert.equal((await removeSource(f, fixture, key)).status, 200, 'the freed source can now be removed');
  } finally { await f.close(); await stopRecorded(tree); fixture.cleanup(); }
});

test('T008 discovery clones a remote source exactly once: it is resolved once and listed from that checkout', { timeout: 45_000 }, async t => {
  const fixture = packFixture();
  fixture.profile({});
  fixture.catalog(['alpha']);
  const github = offlineGitHub(t, fixture);
  github.publish('acme/good', ['rust']);
  const team = localSource(fixture, 'team-packs', ['zeta']);
  saveSources(fixture, [remoteEntry('acme/good'), localEntry(team)]);
  // Git's own trace, inherited by every reader and the Git it runs, records each clone it is asked for.
  const trace = path.join(fixture.temporary, 'git-trace.log');
  const previous = process.env.GIT_TRACE;
  process.env.GIT_TRACE = trace;
  t.after(() => { if (previous === undefined) delete process.env.GIT_TRACE; else process.env.GIT_TRACE = previous; });
  const f = await packHttpFixture(fixture);
  try {
    const body = await discover(f);
    assert.deepEqual(body.sources.items.slice(1).map(/** @param {any} row */ row => [row.name, row.status, row.count]),
      [['acme/good', 'read', 1], ['team-packs', 'read', 1]]);
    const clones = fs.readFileSync(trace, 'utf8').split(/\r?\n/).filter(line => /trace: built-in: git clone /.test(line));
    assert.equal(clones.length, 1, `one clone for the one remote source, none for a folder: ${clones.join(' | ')}`);
    assert.equal(clones[0].includes('https://github.com/acme/good '), true);
  } finally { await f.close(); fixture.cleanup(); }
});
