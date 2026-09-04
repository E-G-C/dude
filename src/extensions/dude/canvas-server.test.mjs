// @ts-check
/**
 * Tests for the Dude canvas Now cockpit server — loopback binding, the closed
 * route allowlist, cross-origin refusal, idempotent open by `instanceId`, and
 * cleanup on close. The SDK canvas plumbing itself is not retested here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSET_ROUTES,
  closeInstance,
  isTrustedRequest,
  openInstance,
} from './lib/canvas-server.mjs';
import { readNowProjection } from './lib/projection.mjs';

const REMOVED_PROOF_ROUTES = Object.freeze([
  '/__dude_i0/proof',
  '/__dude_i0/proof/abort',
]);
const BD_LIST_CALL = ['list', '--all', '--limit', '0', '--json'];
const EXTENSION_SOURCE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SOURCE_ROOT = path.resolve(EXTENSION_SOURCE_ROOT, '../../skills/dude-engine');

/**
 * Runs a deterministic executable at production's `bd` boundary. `hold` keeps
 * a child alive until the test releases that exact PID with SIGUSR1.
 * @param {Array<{output?:unknown,exitCode?:number,hold?:boolean}>} [steps]
 */
function installBdFixture(steps = []) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-bd-'));
  const executable = path.join(fixtureRoot, process.platform === 'win32' ? 'bd.cmd' : 'bd');
  const callsPath = path.join(fixtureRoot, 'calls.json');
  fs.writeFileSync(callsPath, '[]');
  const fixtureScript = [
    "const fs = require('node:fs');",
    `const callsPath = ${JSON.stringify(callsPath)};`,
    `const steps = ${JSON.stringify(steps)};`,
    'const calls = JSON.parse(fs.readFileSync(callsPath, "utf8"));',
    'calls.push({ args: process.argv.slice(2), pid: process.pid });',
    'const temporaryCallsPath = `${callsPath}.${process.pid}.tmp`;',
    'fs.writeFileSync(temporaryCallsPath, JSON.stringify(calls));',
    'fs.renameSync(temporaryCallsPath, callsPath);',
    'const step = steps[Math.min(calls.length - 1, Math.max(steps.length - 1, 0))] || {};',
    'let finished = false;',
    'let holdTimer = null;',
    'const finish = () => {',
    '  if (finished) return;',
    '  finished = true;',
    '  if (holdTimer) clearInterval(holdTimer);',
    '  const output = typeof step.output === "string" ? step.output : JSON.stringify(step.output ?? []);',
    '  process.stdout.write(output);',
    '  process.exit(step.exitCode ?? 0);',
    '};',
    'if (step.hold) {',
    '  holdTimer = setInterval(() => {}, 1_000);',
    '  process.once("SIGUSR1", finish);',
    '}',
    'else finish();',
    '',
  ].join('\n');
  if (process.platform === 'win32') {
    fs.writeFileSync(
      executable,
      `@${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(fixtureRoot, 'bd.cjs'))} %*\r\n`,
    );
    fs.writeFileSync(path.join(fixtureRoot, 'bd.cjs'), fixtureScript);
  } else {
    fs.writeFileSync(executable, `#!/usr/bin/env node\n${fixtureScript}`);
    fs.chmodSync(executable, 0o755);
  }

  return {
    get calls() {
      return JSON.parse(fs.readFileSync(callsPath, 'utf8'));
    },
    waitForCalls(count) {
      if (this.calls.length >= count) return Promise.resolve();
      return new Promise((resolve) => {
        const watcher = fs.watch(callsPath, () => {
          if (this.calls.length >= count) {
            watcher.close();
            resolve(undefined);
          }
        });
        if (this.calls.length >= count) {
          watcher.close();
          resolve(undefined);
        }
      });
    },
    /** @template T @param {() => Promise<T>} action */
    async run(action) {
      const originalPath = process.env.PATH;
      process.env.PATH = `${fixtureRoot}${path.delimiter}${originalPath ?? ''}`;
      try {
        return await action();
      } finally {
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
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

/**
 * @param {string} url
 * @param {RequestInit & { path?: string }} [init]
 */
function call(url, { path = '/', ...init } = {}) {
  return fetch(new URL(path, url), init);
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
  fs.mkdirSync(sdkRoot, { recursive: true });
  fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify({
    name: '@github/copilot-sdk',
    type: 'module',
    exports: { './extension': './extension.mjs' },
  }));
  fs.writeFileSync(path.join(sdkRoot, 'extension.mjs'), [
    'let canvas;',
    'let logCalls = 0;',
    'export function createCanvas(value) { canvas = value; return value; }',
    'export async function joinSession() {',
    '  return { log: async () => { logCalls += 1; throw new Error("rejected session log"); } };',
    '}',
    'export function registeredCanvas() { return canvas; }',
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

test('open binds an OS-assigned loopback port and serves the shipped Now shell', async () => {
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
    assert.match(body, /<title>Dude — Now<\/title>/);
    assert.match(body, /<script type="module" src="\/assets\/app\.js"><\/script>/);
    assert.match(body, /new EventSource\("\/events"\)/);
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

test('only exact Now shell assets are served with fixed MIME and cache headers', async () => {
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

test('read-only API route matrix permits only projection GETs and refresh POST', async () => {
  // Arrange
  const { log } = recorder();
  const projection = Object.freeze({
    complete: true,
    status: 'ok',
    selected: Object.freeze({ slug: 'fixture' }),
  });
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
    assert.match(body, /<title>Dude — Now<\/title>/);
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
        process.kill(heldPid, 'SIGUSR1');
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
        process.kill(oldPid, 'SIGUSR1');
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
    assert.equal(result.first.status, 'Read-only Now cockpit');
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
