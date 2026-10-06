// @ts-check
/**
 * Offline fixtures for named verification runs. Command runs spawn small
 * Node scripts written into each test's own scratch directory, and Git
 * probes run the local git executable only inside scratch repositories these
 * tests create; child processes are cleaned up by their own PID. Nothing
 * listens and no project command runs. Real host tool permissions, Windows
 * and macOS descendant-process behavior beyond these fixtures, and live
 * peers are not established here (T019).
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn as nodeSpawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { createA2a } from './lib/a2a.mjs';
import {
  changedDuringRun,
  commandDigest,
  commandEnvironment,
  expandArgv,
  observeRevision,
  revisionRefusal,
  runProcess,
  unobserved,
} from './lib/a2a-verify.mjs';
import { readAnswer } from './lib/a2a-transport.mjs';

const START = Date.parse('2026-09-23T16:00:00Z');
const SECRET = 'fixed-env-secret-value';
const WINDOWS = process.platform === 'win32';
const WAITING = 'Status: waiting; current receive live';
const LOOPBACK = () => ({ lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: /** @type {const} */ ('IPv4'), mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }] });
/** Node on Windows needs SystemRoot; tests declare it as an owner would. */
const BASE_ENV = {
  ...(WINDOWS ? { SystemRoot: String(process.env.SystemRoot) } : {}),
  // The no-listen guard, when this suite runs under it, also loads in fixture children.
  ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}),
};
/** The same names, declared as inherited by fixture command entries. */
const FIXTURE_INHERIT = Object.keys(BASE_ENV);
/** @param {string | Buffer} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** @type {string[]} */
const scratch = [];
/**
 * Test-owned fixture PIDs not yet stopped by their test, stopped after the
 * file only if a test never reached its own cleanup.
 * @type {number[]}
 */
const strayPids = [];
/** Stop one test-owned fixture process by its own PID and forget it; it may already be gone. @param {number} pid */
function killPid(pid) {
  const index = strayPids.indexOf(pid);
  if (index !== -1) strayPids.splice(index, 1);
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
}
after(() => {
  for (const pid of [...strayPids]) killPid(pid);
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

function tempDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-a2a-verify-'));
  scratch.push(directory);
  return directory;
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

/** The absolute git executable on PATH, or null; a test then skips visibly. */
function findGit() {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(directory, WINDOWS ? 'git.exe' : 'git');
    if (directory && fs.existsSync(candidate)) return candidate;
  }
  return null;
}
const GIT = findGit();

/** @param {string} repo @param {string[]} args */
function git(repo, args) {
  return execFileSync(/** @type {string} */ (GIT), ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Dude Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8' }).trim();
}

/** Commit everything in `repo` and return HEAD. @param {string} repo */
function commitAll(repo) {
  if (!fs.existsSync(path.join(repo, '.git'))) git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'fixture']);
  return git(repo, ['rev-parse', 'HEAD']);
}

const CHECK_SCRIPT = `import fs from 'node:fs';
const mode = process.argv[2];
if (mode === 'pass') { process.stdout.write('412 passed, 0 failed\\n'); process.stderr.write('warn: none\\n'); process.exit(0); }
if (mode === 'fail') { process.stdout.write('409 passed, 3 failed\\n'); process.exit(3); }
if (mode === 'env') { process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v.length])))); process.exit(0); }
if (mode === 'sleep') { process.stdout.write('started\\n'); setInterval(() => {}, 1000); }
if (mode === 'touch') { fs.appendFileSync('tracked.txt', 'changed by the run\\n'); process.exit(0); }
if (mode === 'transient') { const kept = fs.readFileSync('tracked.txt'); fs.appendFileSync('tracked.txt', 'x'); fs.writeFileSync('tracked.txt', kept); process.exit(0); }
if (mode === 'big') { process.stdout.write('\\u00e9'.repeat(3000)); process.exit(0); }
`;
const HOLD_SCRIPT = `import { spawn } from 'node:child_process';
import fs from 'node:fs';
// Detached, so it outlives this process on Windows too, still holding the inherited pipes.
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true, windowsHide: true });
fs.writeFileSync(process.argv[2], String(child.pid));
process.stdout.write('parent done\\n');
process.exit(0);
`;

/** @param {string} directory @param {string} name @param {string} text */
function script(directory, name, text) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, text);
  return file;
}

// ---------------------------------------------------------------------------
// Catalog entries, parameters, environment, and digests.

/** @returns {import('./lib/a2a.mjs').Command} */
function entry(overrides = {}) {
  return {
    executable: process.execPath,
    args: ['tools/check.mjs', '{suite}', '--filter', '{filter}'],
    params: [['suite', { kind: 'enum', values: ['unit', 'integration'] }], ['filter', { kind: 'pattern', pattern: '^[a-z]+|x$' }]],
    cwd: path.resolve('workspace'),
    env: { inherit: ['PATH', 'HOME'], set: [['CI_TOKEN', SECRET]] },
    timeoutMs: 1000,
    outputBytes: 64,
    effects: 'Reads the workspace',
    ...overrides,
  };
}

test('parameters fill only whole declared argument elements, and anything undeclared, missing, or not allowed refuses', () => {
  assert.deepEqual(expandArgv(entry(), { suite: 'unit', filter: 'abc' }), ['tools/check.mjs', 'unit', '--filter', 'abc']);
  for (const [label, params] of /** @type {Array<[string, any]>} */ ([
    ['extra parameter', { suite: 'unit', filter: 'abc', executable: '/bin/sh' }],
    ['missing parameter', { suite: 'unit' }],
    ['value outside the enum', { suite: 'all', filter: 'abc' }],
    ['pattern that only matches a prefix', { suite: 'unit', filter: 'abc; rm -rf /' }],
    ['pattern alternation cannot escape the whole-value anchor', { suite: 'unit', filter: 'abcX' }],
    ['control character', { suite: 'unit', filter: 'ab\n' }],
    ['non-string value', { suite: 'unit', filter: 7 }],
  ])) {
    assert.throws(() => expandArgv(entry(), params), (error) => error instanceof Error && 'code' in error && error.code === 'invalid_params', label);
  }
});

test('the run environment is only the declared names, and Windows-supplied names are blank unless declared', () => {
  const source = { PATH: '/usr/bin', HOME: '/home/b', AWS_SECRET_ACCESS_KEY: 'cloud-secret', SystemRoot: 'C:\\Windows' };
  const posix = commandEnvironment(entry(), source, 'linux');
  assert.deepEqual(posix.env, { PATH: '/usr/bin', HOME: '/home/b', CI_TOKEN: SECRET });
  assert.deepEqual(posix.facts.inherited, [{ name: 'PATH', present: true }, { name: 'HOME', present: true }]);
  assert.deepEqual([posix.facts.fixed, posix.facts.blanked, posix.facts.values], [['CI_TOKEN'], [], 'hidden']);
  assert.equal(JSON.stringify(posix.facts).includes(SECRET), false, 'facts carry names, never values');

  const windows = commandEnvironment(entry({ env: { inherit: ['SystemRoot'], set: [] } }), source, 'win32');
  assert.equal(windows.env.SystemRoot, 'C:\\Windows');
  assert.equal(windows.env.PATH, '', 'PATH is not inherited on Windows unless declared');
  assert.equal(windows.env.AWS_SECRET_ACCESS_KEY, undefined, 'nothing else from the adapter environment');
  assert.ok(windows.facts.blanked.includes('USERPROFILE'));
  assert.equal(windows.facts.blanked.includes('SYSTEMROOT'), false, 'a declared name is not blanked');
});

test('the command digest covers the approved entry but not fixed environment values', () => {
  const digest = commandDigest('unit-tests', entry());
  assert.equal(commandDigest('unit-tests', entry({ env: { inherit: ['PATH', 'HOME'], set: [['CI_TOKEN', 'another-secret']] } })), digest);
  for (const changed of [entry({ executable: '/opt/other' }), entry({ args: ['tools/other.mjs'] }), entry({ cwd: path.resolve('elsewhere') }),
    entry({ env: { inherit: ['PATH'], set: [['CI_TOKEN', SECRET]] } }), entry({ effects: 'Deletes the build cache' }), entry({ timeoutMs: 2000 })]) {
    assert.notEqual(commandDigest('unit-tests', changed), digest);
  }
  assert.notEqual(commandDigest('lint', entry()), digest);
});

// ---------------------------------------------------------------------------
// The process runner, with real fixture processes.

/**
 * @param {string[]} argv @param {{outputBytes?: number, signal?: AbortSignal, cause?: () => string, settleMs?: number, executable?: string}} [options]
 */
function run(argv, options = {}) {
  return runProcess({
    executable: options.executable ?? process.execPath,
    argv,
    cwd: os.tmpdir(),
    env: { ...BASE_ENV },
    outputBytes: options.outputBytes ?? 4096,
    signal: options.signal ?? new AbortController().signal,
    cause: options.cause ?? (() => 'invocation_cancelled'),
    now: Date.now,
    settleMs: options.settleMs,
  });
}

test('a run drains both streams, digests complete output, and reports the observed exit', async () => {
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  const passed = await run([check, 'pass']);
  assert.deepEqual([passed.outcome, passed.exit, passed.termination, passed.spawnError], ['exited', { code: 0, signal: null }, null, null]);
  assert.ok(passed.startedAt !== null && passed.endedAt >= passed.startedAt);
  assert.deepEqual(passed.stdout, { bytes: 21, complete: true, sha256: sha256('412 passed, 0 failed\n'), retained: 21, text: '412 passed, 0 failed\n', lossy: false });
  assert.equal(passed.stderr.text, 'warn: none\n');
  const failed = await run([check, 'fail']);
  assert.deepEqual([failed.outcome, failed.exit], ['exited', { code: 3, signal: null }], 'a failing command is an observed exit, not a success');
});

test('output beyond the approved bound is truncated at a UTF-8 boundary while the complete stream is still counted and digested', async () => {
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  const result = await run([check, 'big'], { outputBytes: 1001 });
  const full = '\u00e9'.repeat(3000);
  assert.equal(result.stdout.bytes, 6000);
  assert.equal(result.stdout.complete, true);
  assert.equal(result.stdout.sha256, sha256(full), 'the digest covers every byte, not only the kept prefix');
  assert.equal(result.stdout.retained, 1000, 'the 1001-byte bound would split a two-byte character, so 1000 bytes are kept');
  assert.equal(result.stdout.text, '\u00e9'.repeat(500));
  assert.equal(result.stdout.lossy, false);

  const bytes = script(dir, 'bytes.mjs', "process.stdout.write(Buffer.from([0x6f, 0x6b, 0xff, 0x0a]));\n");
  const lossy = await run([bytes]);
  assert.deepEqual([lossy.stdout.lossy, lossy.stdout.retained, lossy.stdout.text], [true, 4, 'ok\ufffd\n'], 'invalid UTF-8 is flagged, not presented as exact');

  const exact = await run([check, 'pass'], { outputBytes: 21 });
  assert.deepEqual([exact.stdout.bytes, exact.stdout.retained, exact.stdout.text], [21, 21, '412 passed, 0 failed\n'], 'output exactly at the bound is kept whole');
  const over = await run([check, 'pass'], { outputBytes: 20 });
  assert.deepEqual([over.stdout.bytes, over.stdout.retained, over.stdout.text, over.stdout.sha256],
    [21, 20, '412 passed, 0 failed', sha256('412 passed, 0 failed\n')], 'one byte over the bound is truncated, and the digest still covers every byte');
});

test('a missing executable is a spawn failure with no start, no exit, and no termination', async () => {
  const result = await run([], { executable: path.join(tempDir(), 'missing-program.exe') });
  assert.deepEqual([result.outcome, result.startedAt, result.exit, result.termination], ['spawn_failed', null, null, null]);
  assert.equal(result.spawnError, 'ENOENT');
  assert.deepEqual([result.stdout.complete, result.stdout.sha256], [false, null], 'nothing was observed, so no digest is claimed');
});

test('a timeout requests termination of this run only and records the observed exit separately', async () => {
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  const deadline = AbortSignal.timeout(400);
  const result = await run([check, 'sleep'], { signal: deadline, cause: () => (deadline.aborted ? 'timeout' : 'invocation_cancelled') });
  assert.equal(result.outcome, 'timed_out');
  assert.equal(result.termination?.reason, 'timeout');
  assert.equal(result.termination?.method, WINDOWS ? 'windows-taskkill-tree' : 'posix-process-group-sigkill');
  assert.equal(result.termination?.result, 'requested');
  assert.ok(result.exit, 'the direct exit after the request was observed');
  assert.equal(result.stdout.text, 'started\n');
});

test('termination targets only the started process, a child without a PID gets none, and a process that outlives its request still ends observation', async () => {
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  /** @type {number[]} */
  const started = [];
  /** @type {number[]} */
  const targeted = [];
  let running = false;
  const controller = new AbortController();
  const began = Date.now();
  const pending = runProcess({
    executable: process.execPath, argv: [check, 'sleep'], cwd: os.tmpdir(), env: { ...BASE_ENV }, outputBytes: 64,
    signal: controller.signal, cause: () => 'invocation_cancelled', now: Date.now, settleMs: 300,
    spawn: /** @type {any} */ ((/** @type {string} */ file, /** @type {string[]} */ args, /** @type {any} */ options) => {
      const child = nodeSpawn(file, args, options);
      if (child.pid !== undefined) {
        started.push(child.pid);
        strayPids.push(child.pid);
      }
      return child;
    }),
    // A request that the process survives, as a descendant or an unkillable process might.
    terminate: (pid) => {
      targeted.push(pid);
      return { method: 'test-request-ignored', result: 'requested', error: null, helper: null };
    },
    onStart: () => { running = true; },
  });
  await until(() => running, 'fixture started');
  controller.abort();
  const result = await pending;
  try {
    assert.equal(started.length, 1);
    assert.deepEqual(targeted, started, 'termination was requested for the started PID only');
    assert.deepEqual([result.outcome, result.exit, result.termination],
      ['cancelled', null, { reason: 'invocation_cancelled', method: 'test-request-ignored', result: 'requested', error: null, helper: null }],
      'no exit is claimed for a process that is still running');
    assert.deepEqual([result.stdout.complete, result.stdout.sha256], [false, null]);
    assert.ok(Date.now() - began < 5_000, 'observation ended after the settle window');
    assert.doesNotThrow(() => process.kill(started[0], 0), 'the fixture really outlived the request');
  } finally {
    killPid(started[0]);
  }

  const fake = heldChild();
  let requests = 0;
  const noPid = new AbortController();
  const withoutPid = runProcess({
    executable: process.execPath, argv: [], cwd: os.tmpdir(), env: {}, outputBytes: 64,
    signal: noPid.signal, cause: () => 'timeout', now: Date.now, settleMs: 50,
    spawn: /** @type {any} */ (() => fake.child),
    terminate: () => {
      requests += 1;
      return { method: 'unexpected', result: 'requested' };
    },
  });
  noPid.abort();
  const noIdentity = await withoutPid;
  assert.equal(requests, 0, 'no identity, so no termination is attempted against anything');
  assert.deepEqual([noIdentity.outcome, noIdentity.exit, noIdentity.termination],
    ['timed_out', null, { reason: 'timeout', method: 'none', result: 'unavailable', error: null, helper: null }]);
});

/**
 * A stand-in for the Windows taskkill helper: `script` decides which events it
 * emits after spawn returns. It signals nothing itself; a test that simulates
 * the helper's effect stops only its own fixture child by PID.
 * @param {(helper: any) => void} script
 */
function fakeHelper(script) {
  const helper = /** @type {any} */ (new EventEmitter());
  helper.pid = undefined;
  process.nextTick(() => script(helper));
  return helper;
}

/**
 * Cancel a real sleeping fixture run whose termination helper is `script`.
 * @param {string} check @param {(helper: any, pid: number) => void} script @param {{settleMs?: number, throws?: Error}} [options]
 */
async function cancelWithHelper(check, script, options = {}) {
  /** @type {number[]} */
  const started = [];
  /** @type {string[][]} */
  const helperArgs = [];
  let running = false;
  const controller = new AbortController();
  const pending = runProcess({
    executable: process.execPath, argv: [check, 'sleep'], cwd: os.tmpdir(), env: { ...BASE_ENV }, outputBytes: 64,
    signal: controller.signal, cause: () => 'invocation_cancelled', now: Date.now, settleMs: options.settleMs ?? 300,
    spawn: /** @type {any} */ ((/** @type {string} */ file, /** @type {string[]} */ args, /** @type {any} */ spawnOptions) => {
      if (path.basename(file).toLowerCase() === 'taskkill.exe') {
        helperArgs.push(args);
        if (options.throws) throw options.throws;
        return fakeHelper((helper) => script(helper, started[0]));
      }
      const child = nodeSpawn(file, args, spawnOptions);
      if (child.pid !== undefined) {
        started.push(child.pid);
        strayPids.push(child.pid);
      }
      return child;
    }),
    onStart: () => { running = true; },
  });
  await until(() => running, 'fixture started');
  const began = Date.now();
  controller.abort();
  const result = await pending;
  return { result, pid: started[0], helperArgs, elapsed: Date.now() - began };
}

test('a Windows termination helper that fails to launch, synchronously or asynchronously, is recorded as a failed request, never as requested', async (context) => {
  if (!WINDOWS) {
    context.skip('the taskkill helper is the Windows termination path, so this case did not run here');
    return;
  }
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  const launchError = Object.assign(new Error(`spawn ${path.join(String(process.env.SystemRoot), 'System32', 'taskkill.exe')} ENOENT`), { code: 'ENOENT' });
  const asynchronous = await cancelWithHelper(check, (helper) => helper.emit('error', launchError));
  try {
    assert.deepEqual(asynchronous.helperArgs, [['/PID', String(asynchronous.pid), '/T', '/F']], 'the request named only this run\'s PID');
    assert.deepEqual([asynchronous.result.outcome, asynchronous.result.exit, asynchronous.result.termination], ['cancelled', null, {
      reason: 'invocation_cancelled', method: 'windows-taskkill-tree', result: 'failed', error: 'ENOENT', helper: { started: false, exit: null },
    }], 'the asynchronous launch error replaced the request before the record was handed off');
    assert.equal(JSON.stringify(asynchronous.result).includes('System32'), false, 'only the error code is kept, not the message or path');
    assert.doesNotThrow(() => process.kill(asynchronous.pid, 0), 'nothing stopped the fixture, and nothing claims it did');
  } finally {
    killPid(asynchronous.pid);
  }

  const synchronous = await cancelWithHelper(check, () => undefined, { throws: Object.assign(new Error('spawn EMFILE'), { code: 'EMFILE' }) });
  try {
    assert.deepEqual(synchronous.result.termination,
      { reason: 'invocation_cancelled', method: 'windows-taskkill-tree', result: 'failed', error: 'EMFILE', helper: null });
    assert.equal(synchronous.result.exit, null);
  } finally {
    killPid(synchronous.pid);
  }
});

test('a Windows termination helper is observed within the settle bound: its start and exit code are recorded apart from the direct exit, and none proves the tree stopped', async (context) => {
  if (!WINDOWS) {
    context.skip('the taskkill helper is the Windows termination path, so this case did not run here');
    return;
  }
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  // The helper starts, the fixture it targets is stopped by its own PID, and the helper exits after the direct exit.
  const normal = await cancelWithHelper(check, (helper, pid) => {
    helper.emit('spawn');
    killPid(pid);
    setTimeout(() => helper.emit('exit', 0, null), 100);
  }, { settleMs: 2_000 });
  assert.ok(normal.result.exit, 'the direct exit was observed');
  assert.deepEqual(normal.result.termination,
    { reason: 'invocation_cancelled', method: 'windows-taskkill-tree', result: 'requested', error: null, helper: { started: true, exit: { code: 0, signal: null } } },
    'the helper exit that followed the direct exit was still recorded');
  assert.ok(normal.elapsed < 2_000, 'observation ended once the helper exited, before the settle bound');

  const nonzero = await cancelWithHelper(check, (helper) => {
    helper.emit('spawn');
    helper.emit('exit', 128, null);
  });
  try {
    assert.deepEqual([nonzero.result.exit, nonzero.result.termination], [null,
      { reason: 'invocation_cancelled', method: 'windows-taskkill-tree', result: 'requested', error: null, helper: { started: true, exit: { code: 128, signal: null } } }],
    'a nonzero helper exit is recorded as observed; the direct process was not seen to exit');
    assert.doesNotThrow(() => process.kill(nonzero.pid, 0));
  } finally {
    killPid(nonzero.pid);
  }

  let late = false;
  const silent = await cancelWithHelper(check, (helper) => {
    helper.emit('spawn');
    setTimeout(() => {
      helper.emit('exit', 0, null);
      late = true;
    }, 600);
  });
  try {
    assert.deepEqual([silent.result.exit, silent.result.termination?.helper], [null, { started: true, exit: null }],
      'a helper that did not exit within the settle bound leaves its exit unobserved');
    assert.ok(silent.elapsed < 3_000, 'the settle bound still ended observation');
    await until(() => late, 'late helper exit emitted');
    assert.deepEqual(silent.result.termination?.helper, { started: true, exit: null }, 'a helper exit after the handoff does not change the record');
  } finally {
    killPid(silent.pid);
  }
});

test('cancellation also requests termination, and a descendant holding the pipes after a direct exit cannot hang the run', async () => {
  const dir = tempDir();
  const check = script(dir, 'check.mjs', CHECK_SCRIPT);
  const controller = new AbortController();
  const pending = run([check, 'sleep'], { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 300));
  controller.abort();
  const cancelled = await pending;
  assert.deepEqual([cancelled.outcome, cancelled.termination?.reason, cancelled.termination?.result], ['cancelled', 'invocation_cancelled', 'requested']);

  const hold = script(dir, 'hold.mjs', HOLD_SCRIPT);
  const pidFile = path.join(dir, 'grandchild.pid');
  const began = Date.now();
  const held = await run([hold, pidFile], { settleMs: 300 });
  const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
  strayPids.push(grandchild);
  try {
    assert.ok(Date.now() - began < 5_000, 'the run returned after its settle window');
    assert.deepEqual([held.outcome, held.exit, held.termination], ['exited', { code: 0, signal: null }, null]);
    assert.deepEqual([held.stdout.complete, held.stdout.sha256], [false, null], 'the pipe stayed open, so the stream is incomplete and undigested');
    assert.equal(held.stdout.text, 'parent done\n');
    assert.doesNotThrow(() => process.kill(grandchild, 0), 'no termination was requested after the direct exit, so the descendant was not touched');
  } finally {
    killPid(grandchild);
  }
});

test('cancelling after the direct exit requests no termination, because the process identity may already be reused', async () => {
  const dir = tempDir();
  const hold = script(dir, 'hold.mjs', HOLD_SCRIPT);
  const pidFile = path.join(dir, 'grandchild.pid');
  const controller = new AbortController();
  const pending = run([hold, pidFile], { signal: controller.signal, settleMs: 5_000 });
  await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8'), 'grandchild started');
  const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
  strayPids.push(grandchild);
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    controller.abort();
    const result = await pending;
    assert.deepEqual([result.outcome, result.termination], ['exited', null]);
    assert.equal(result.stdout.complete, false);
  } finally {
    killPid(grandchild);
  }
});

// ---------------------------------------------------------------------------
// Revision probes against scratch repositories.

/** @param {string} workspace */
function probe(workspace, gitPath = GIT) {
  return observeRevision({ git: gitPath, workspace, signal: new AbortController().signal, cause: () => 'invocation_cancelled', now: Date.now });
}

test('revision probes report HEAD and porcelain status, count untracked files, and do not check ignored files', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so the revision probes did not run');
    return;
  }
  const repo = tempDir();
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'one\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'ignored.log\n');
  const head = commitAll(repo);
  const clean = await probe(repo);
  assert.deepEqual(clean, { head, statusBytes: 0, statusSha256: sha256(''), clean: true, unknown: null });
  fs.writeFileSync(path.join(repo, 'ignored.log'), 'build noise\n');
  assert.equal((await probe(repo)).clean, true, 'an ignored file is not observed: a stated limit');
  fs.writeFileSync(path.join(repo, 'untracked.txt'), 'new\n');
  const untracked = await probe(repo);
  assert.deepEqual([untracked.clean, untracked.head], [false, head]);
  fs.rmSync(path.join(repo, 'untracked.txt'));
  fs.appendFileSync(path.join(repo, 'tracked.txt'), 'two\n');
  const dirty = await probe(repo);
  assert.equal(dirty.clean, false);
  assert.notEqual(dirty.statusSha256, untracked.statusSha256);
  assert.equal(changedDuringRun(clean, dirty), true);
  assert.equal(changedDuringRun(clean, clean), false);
  assert.equal(changedDuringRun(clean, unobserved('probe_timeout')), 'unknown');

  const unborn = tempDir();
  git(unborn, ['init', '-q']);
  assert.equal((await probe(unborn)).unknown, 'probe_failed', 'an unborn HEAD is a failed probe, not a revision');
  assert.equal((await probe(tempDir())).unknown, 'probe_failed', 'a directory outside any repository');
  assert.equal((await probe(repo, path.join(tempDir(), 'no-git.exe'))).unknown, 'git_unavailable', 'no fallback to another git');
  assert.equal((await probe(repo, null)).unknown, 'git_not_configured');
});

test('a commit pin needs the observed matching, clean revision; the worktree policy accepts what is current', () => {
  const pin = 'a'.repeat(40);
  const seen = { head: pin, statusBytes: 0, statusSha256: sha256(''), clean: true, unknown: null };
  assert.equal(revisionRefusal({ commit: pin }, seen), null);
  assert.equal(revisionRefusal({ commit: 'b'.repeat(40) }, seen), 'revision_mismatch');
  assert.equal(revisionRefusal({ commit: pin }, { ...seen, statusBytes: 20, statusSha256: sha256('x'), clean: false }), 'worktree_dirty');
  assert.equal(revisionRefusal({ commit: pin }, unobserved('git_unavailable')), 'git_unavailable');
  assert.equal(revisionRefusal({ commit: pin }, unobserved('git_not_configured')), 'git_unavailable');
  assert.equal(revisionRefusal({ commit: pin }, unobserved('probe_failed')), 'revision_unobservable', 'unknown never satisfies a pin');
  assert.equal(revisionRefusal('worktree', unobserved('git_not_configured')), null);
  assert.equal(revisionRefusal('worktree', { ...seen, clean: false }), null);
});

// ---------------------------------------------------------------------------
// The registered verify tool, through a real provider with a fake transport.

/** A stand-in child process that stays pending until the test releases it. */
function heldChild() {
  const child = /** @type {any} */ (new EventEmitter());
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = undefined;
  child.kill = () => false;
  return {
    child,
    /** @param {string} stdout @param {number} [code] */
    release(stdout, code = 0) {
      child.emit('spawn');
      child.stdout.end(stdout);
      child.stderr.end();
      setImmediate(() => child.emit('exit', code, null));
    },
  };
}

/**
 * A serving provider approved through its chat commands, with a scratch
 * workspace, fixture commands, and a fake transport. `spawned` records every
 * process the runner starts.
 * @param {{
 *   revision?: 'worktree' | 'pin', useGit?: boolean, verification?: Record<string, unknown> | null,
 *   commands?: (workspace: string) => Record<string, unknown>, holdGit?: boolean, profile?: Record<string, unknown>,
 * }} [options]
 */
async function servingFixture(options = {}) {
  const base = tempDir();
  const workspace = path.join(base, 'workspace');
  const owner = path.join(base, 'owner');
  const evidence = path.join(workspace, 'evidence');
  for (const directory of [evidence, path.join(workspace, 'tools'), owner]) fs.mkdirSync(directory, { recursive: true });
  script(path.join(workspace, 'tools'), 'check.mjs', CHECK_SCRIPT);
  fs.writeFileSync(path.join(workspace, 'tracked.txt'), 'tracked\n');
  fs.writeFileSync(path.join(owner, 'cert.pem'), 'fixture certificate text, not a real certificate\n');
  fs.writeFileSync(path.join(owner, 'key.pem'), 'fixture key text, not a real key\n');
  const head = options.useGit ? commitAll(workspace) : null;
  const configPath = path.join(owner, 'a2a.json');
  const verification = options.verification === null ? undefined : {
    commands: ['check'],
    revision: options.revision === 'pin' ? { commit: head ?? 'c'.repeat(40) } : 'worktree',
    ...(options.useGit ? { git: GIT } : {}),
    repeatUse: 'activation',
    ...options.verification,
  };
  const document = {
    profiles: { 'b-serve': {
      role: 'serve',
      label: 'B (Mac)',
      workspace,
      peer: { label: 'A (Windows)', address: '127.0.0.1', certSha256: 'ab'.repeat(32) },
      tls: { certFile: path.join(owner, 'cert.pem'), keyFile: path.join(owner, 'key.pem') },
      sharing: { allowed: 'Test results and their output', excluded: 'Credentials', purpose: 'Confirm test results' },
      contentBytes: 65_536,
      repeatUse: 'activation',
      listen: { address: '127.0.0.1', port: 18_443 },
      evidenceRoots: [evidence],
      ...(verification ? { verification } : {}),
      ...options.profile,
    } },
    commands: options.commands ? options.commands(workspace) : {
      check: {
        executable: process.execPath,
        args: [path.join(workspace, 'tools', 'check.mjs'), '{mode}'],
        params: { mode: { enum: ['pass', 'fail', 'env', 'sleep', 'touch', 'transient', 'big'] } },
        cwd: workspace,
        env: { inherit: FIXTURE_INHERIT, set: { CI_TOKEN: SECRET } },
        timeoutMs: 10_000,
        outputBytes: 4096,
        effects: 'Reads the workspace; the touch mode appends to tracked.txt',
      },
      other: {
        executable: process.execPath,
        args: [path.join(workspace, 'tools', 'check.mjs'), 'pass'],
        params: {},
        cwd: workspace,
        env: { inherit: [], set: {} },
        timeoutMs: 1000,
        outputBytes: 64,
        effects: 'Not selected by the profile',
      },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(document));
  const clock = { now: START };
  /** @type {string[]} */
  const logs = [];
  /** @type {Array<{file: string, args: string[], pid?: number}>} */
  const spawned = [];
  /** @type {Array<ReturnType<typeof heldChild>>} */
  const heldGit = [];
  // `failKill` makes the taskkill helper fail to launch, reported asynchronously as Node does.
  const control = { holdGit: Boolean(options.holdGit), failKill: false };
  /** @type {any} */
  let serve = null;
  const provider = createA2a({
    root: workspace,
    now: () => clock.now,
    interfaces: /** @type {any} */ (LOOPBACK),
    timers: { set: () => () => undefined },
    transport: {
      startServer: /** @type {any} */ (async (/** @type {any} */ serveOptions) => {
        serve = serveOptions;
        return { url: 'https://127.0.0.1:18443/', close: async () => undefined };
      }),
      prepareClient: /** @type {any} */ (() => assert.fail('serving does not ask')),
    },
    runner: {
      spawn: /** @type {any} */ ((/** @type {string} */ file, /** @type {string[]} */ args, /** @type {any} */ spawnOptions) => {
        /** @type {{file: string, args: string[], pid?: number}} */
        const entry = { file, args };
        spawned.push(entry);
        if (control.holdGit && file === GIT && args.includes('rev-parse')) {
          const held = heldChild();
          heldGit.push(held);
          return held.child;
        }
        if (control.failKill && path.basename(file).toLowerCase() === 'taskkill.exe') {
          return fakeHelper((helper) => helper.emit('error', Object.assign(new Error(`spawn ${file} ENOENT`), { code: 'ENOENT' })));
        }
        const child = nodeSpawn(file, args, spawnOptions);
        entry.pid = child.pid;
        return child;
      }),
    },
  });
  const queue = { items: /** @type {unknown[]} */ ([]) };
  provider.bindSession(/** @type {any} */ ({
    sessionId: 'session-B',
    log: async (/** @type {string} */ message) => { logs.push(message); },
    rpc: { queue: { pendingItems: async () => ({ items: queue.items, steeringMessages: [], inFlightSteeringCount: 0 }) } },
  }));
  let calls = 0;
  /** @param {string} name @param {unknown} args @param {AbortSignal} [signal] @returns {Promise<any>} */
  const call = async (name, args, signal) => {
    const tool = provider.tools.find((candidate) => candidate.name === name);
    assert.ok(tool?.handler, name);
    const result = /** @type {any} */ (await tool.handler(args, {
      sessionId: 'session-B', toolName: name, toolCallId: `${name}-${++calls}`, arguments: args, signal: signal ?? new AbortController().signal,
    }));
    if (name === 'dude_a2a_propose') return result;
    return { resultType: result.resultType, ...JSON.parse(result.textResultForLlm) };
  };
  /** Prepare the native proposal, then submit its exact local root approval. */
  const approve = async () => {
    const proposals = logs.length;
    const proposal = await call('dude_a2a_propose', { configPath, profileId: 'b-serve' });
    assert.equal(proposal.resultType, 'success', proposal.textResultForLlm);
    const code = /approve ([0-9a-f]{12});/.exec(proposal.textResultForLlm)?.[1];
    assert.ok(code, proposal.textResultForLlm);
    provider.onEvent(/** @type {any} */ ({ type: 'user.message', data: { content: `dude a2a approve ${code}` } }));
    assert.match(await until(() => logs.slice(proposals).find((line) => /^(?:Activation: active|A2A approval refused)/.test(line)), 'approval'), /^Activation: active/);
  };
  await approve();
  const commandSpawns = () => spawned.filter((entry) => entry.file === process.execPath);
  return {
    provider, logs, clock, configPath, owner, workspace, head, queue, spawned, heldGit, control, call, commandSpawns, approve,
    get serve() { return serve; },
    /**
     * Open one exchange: a receive waits, and a question is admitted through the transport callback.
     * @param {Array<{commandId: string, params: Record<string, string>}>} [requested]
     */
    async admit(requested = []) {
      const waiting = logs.filter((line) => line === WAITING).length;
      const receiving = call('dude_a2a_receive', {});
      await until(() => logs.filter((line) => line === WAITING).length > waiting, 'receive waiting');
      const lost = new AbortController();
      /** @type {(outcome: string) => void} */
      let finish = () => undefined;
      const written = new Promise((resolve) => { finish = resolve; });
      const delivery = { signal: lost.signal, measure: (/** @type {unknown} */ reply) => Buffer.byteLength(JSON.stringify(reply)), written };
      const handedOver = serve.onQuestion({ messageId: randomUUID(), text: 'Does the suite pass at this revision?', requested }, delivery);
      const received = await receiving;
      assert.equal(received.outcome, 'question', JSON.stringify(received));
      return { exchangeId: received.exchangeId, received, handedOver, lose: () => lost.abort(), finish };
    },
    /** @param {string} exchangeId @param {Record<string, string>} [params] @param {AbortSignal} [signal] */
    verify: (exchangeId, params = { mode: 'pass' }, signal) => call('dude_a2a_verify', { exchangeId, commandId: 'check', params }, signal),
  };
}

test('a registered verify runs the approved command for the current exchange, and the reply carries its adapter-created record to the asker', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so this case did not run');
    return;
  }
  const fixture = await servingFixture({ useGit: true, revision: 'pin' });
  const { exchangeId, received, handedOver, finish } = await fixture.admit();
  assert.deepEqual(received.approvedCommands.commands.map((/** @type {any} */ command) => [command.id, command.params]),
    [['check', { mode: { oneOf: ['pass', 'fail', 'env', 'sleep', 'touch', 'transient', 'big'] } }]]);
  assert.equal(received.approvedCommands.revision, `commit ${fixture.head}, clean`);

  const ran = await fixture.verify(exchangeId);
  assert.equal(ran.resultType, 'success', JSON.stringify(ran));
  assert.deepEqual([ran.outcome, ran.attachable], ['ran', true]);
  const record = ran.record;
  assert.deepEqual([record.kind, record.exchangeId, record.commandId, record.params, record.executable, record.argv, record.cwd, record.workspace],
    ['run', exchangeId, 'check', { mode: 'pass' }, process.execPath, [path.join(fixture.workspace, 'tools', 'check.mjs'), 'pass'], fixture.workspace, fixture.workspace]);
  assert.match(record.commandDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual([record.revision.policy, record.revision.pin, record.revision.before.head, record.revision.before.clean, record.revision.changedDuringRun],
    ['commit', fixture.head, fixture.head, true, false]);
  assert.deepEqual([record.outcome, record.exit, record.termination], ['exited', { code: 0, signal: null }, null]);
  assert.deepEqual(record.stdout, { bytes: 21, complete: true, sha256: sha256('412 passed, 0 failed\n'), retained: 21, text: '412 passed, 0 failed\n', lossy: false });
  assert.deepEqual([record.environment.fixed, record.environment.values], [['CI_TOKEN'], 'hidden']);
  assert.ok(fixture.logs.includes(`Run start: ${record.runId}`));
  assert.ok(fixture.logs.includes(`Run end: ${record.runId}; direct exit code 0`));
  assert.equal(JSON.stringify([ran, fixture.logs]).includes(SECRET), false, 'no fixed environment value is shown or logged');
  assert.equal(fixture.logs.some((line) => line.includes('412 passed')), false, 'logs carry no command output');

  const replying = fixture.call('dude_a2a_reply', {
    exchangeId, conclusion: 'A fresh run at the pinned commit passed.', limitations: 'One suite only.', evidence: [{ run: record.runId }],
  });
  const answer = await handedOver;
  assert.deepEqual(answer.evidence, [record], 'the reply carries the adapter record exactly');
  assert.ok(readAnswer(answer), "the asker's validator accepts the record");
  finish('sent');
  assert.equal((await replying).outcome, 'sent');
});

test('permission-negative verify calls start no command', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so this case did not run');
    return;
  }
  const refused = async (/** @type {Awaited<ReturnType<typeof servingFixture>>} */ fixture, /** @type {any} */ args, /** @type {string} */ reason, /** @type {string} */ label) => {
    const result = await fixture.call('dude_a2a_verify', args);
    assert.deepEqual([result.resultType, result.outcome, result.reason], ['failure', 'refused', reason], `${label}: ${JSON.stringify(result)}`);
    assert.equal(fixture.commandSpawns().length, 0, `${label}: no command started`);
  };
  const plain = await servingFixture({ profile: { expiresAt: '2026-10-01T00:00:00Z' } });
  await refused(plain, { exchangeId: randomUUID(), commandId: 'check', params: { mode: 'pass' } }, 'exchange_not_current', 'no exchange yet');
  const { exchangeId } = await plain.admit();
  for (const [label, args, reason] of /** @type {Array<[string, any, string]>} */ ([
    ['wrong exchange', { exchangeId: randomUUID(), commandId: 'check', params: { mode: 'pass' } }, 'exchange_not_current'],
    ['unknown command ID', { exchangeId, commandId: 'deploy', params: {} }, 'command_not_approved'],
    ['catalog entry the profile did not select', { exchangeId, commandId: 'other', params: {} }, 'command_not_approved'],
    ['extra parameter', { exchangeId, commandId: 'check', params: { mode: 'pass', path: '/' } }, 'invalid_params'],
    ['missing parameter', { exchangeId, commandId: 'check', params: {} }, 'invalid_params'],
    ['value outside the enum', { exchangeId, commandId: 'check', params: { mode: 'all' } }, 'invalid_params'],
    ['raw executable field', { exchangeId, commandId: 'check', params: { mode: 'pass' }, executable: '/bin/sh' }, 'invalid_arguments'],
    ['approval boolean', { exchangeId, commandId: 'check', params: { mode: 'pass' }, approved: true }, 'invalid_arguments'],
  ])) await refused(plain, args, reason, label);
  plain.clock.now = Date.parse('2026-10-02T00:00:00Z');
  await refused(plain, { exchangeId, commandId: 'check', params: { mode: 'pass' } }, 'activation_ended', 'sharing validity ended');

  const none = await servingFixture({ verification: null });
  const noneExchange = await none.admit();
  await refused(none, { exchangeId: noneExchange.exchangeId, commandId: 'check', params: { mode: 'pass' } }, 'no_commands_approved', 'no command approved');

  const expiring = await servingFixture({ verification: { expiresAt: '2026-09-24T00:00:00Z' } });
  const expiringExchange = await expiring.admit();
  expiring.clock.now = Date.parse('2026-09-24T00:00:01Z');
  await refused(expiring, { exchangeId: expiringExchange.exchangeId, commandId: 'check', params: { mode: 'pass' } }, 'command_validity_ended', 'command validity ended');
  const stillSharing = expiring.call('dude_a2a_reply', { exchangeId: expiringExchange.exchangeId, conclusion: 'No fresh run was possible.', limitations: 'Command validity ended.', evidence: [] });
  assert.equal((await expiringExchange.handedOver).outcome, 'answer', 'command validity ending does not stop sharing: the reply still goes out');
  expiringExchange.finish('sent');
  assert.equal((await stillSharing).outcome, 'sent');
  assert.equal(expiring.logs.some((line) => line.startsWith('A2A activation ended')), false, 'command validity ending did not end the activation');

  for (const [label, arrange, reason] of /** @type {Array<[string, (fixture: Awaited<ReturnType<typeof servingFixture>>) => void, string]>} */ ([
    ['pinned commit moved', (f) => { fs.writeFileSync(path.join(f.workspace, 'extra.txt'), 'x'); commitAll(f.workspace); }, 'revision_mismatch'],
    ['tracked file changed', (f) => fs.appendFileSync(path.join(f.workspace, 'tracked.txt'), 'dirty\n'), 'worktree_dirty'],
    ['untracked file added', (f) => fs.writeFileSync(path.join(f.workspace, 'new.txt'), 'x'), 'worktree_dirty'],
  ])) {
    const pinned = await servingFixture({ useGit: true, revision: 'pin' });
    const opened = await pinned.admit();
    arrange(pinned);
    await refused(pinned, { exchangeId: opened.exchangeId, commandId: 'check', params: { mode: 'pass' } }, reason, label);
  }
  const noGit = await servingFixture({ revision: 'pin' });
  const noGitExchange = await noGit.admit();
  await refused(noGit, { exchangeId: noGitExchange.exchangeId, commandId: 'check', params: { mode: 'pass' } }, 'git_unavailable', 'commit pin without Git');
  const notRepo = await servingFixture({ revision: 'pin', verification: { git: GIT } });
  const notRepoExchange = await notRepo.admit();
  await refused(notRepo, { exchangeId: notRepoExchange.exchangeId, commandId: 'check', params: { mode: 'pass' } }, 'revision_unobservable', 'probe failure');

  const once = await servingFixture({ verification: { repeatUse: 1 } });
  const onceExchange = await once.admit();
  assert.equal((await once.verify(onceExchange.exchangeId)).outcome, 'ran');
  const second = await once.call('dude_a2a_verify', { exchangeId: onceExchange.exchangeId, commandId: 'check', params: { mode: 'pass' } });
  assert.equal(second.reason, 'run_repeat_exhausted');
  assert.equal(once.commandSpawns().length, 1, 'the repeat-use limit stopped the second run before it started');
});

test('configuration, TLS, workspace, validity, or revision drift during a held revision probe refuses before any command starts', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so this case did not run');
    return;
  }
  /** @param {string} file @param {(document: any) => void} mutate */
  const editConfig = (file, mutate) => {
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    mutate(document);
    fs.writeFileSync(file, JSON.stringify(document));
  };
  for (const [label, drift, expected] of /** @type {Array<[string, (f: Awaited<ReturnType<typeof servingFixture>>) => void, string[]]>} */ ([
    ['configuration edited', (f) => fs.appendFileSync(f.configPath, ' '), ['refused', 'activation_ended']],
    ['catalog environment declaration changed', (f) => editConfig(f.configPath, (d) => { d.commands.check.env.inherit.push('PATH'); }), ['refused', 'activation_ended']],
    ['catalog effects declaration changed', (f) => editConfig(f.configPath, (d) => { d.commands.check.effects = 'Deletes build outputs'; }), ['refused', 'activation_ended']],
    ['profile sharing changed', (f) => editConfig(f.configPath, (d) => { d.profiles['b-serve'].sharing.allowed = 'Everything in the workspace'; }), ['refused', 'activation_ended']],
    ['TLS key rotated', (f) => fs.writeFileSync(path.join(f.owner, 'key.pem'), 'rotated fixture key\n'), ['refused', 'activation_ended']],
    ['command validity ended', (f) => { f.clock.now = Date.parse('2026-09-24T00:00:01Z'); }, ['refused', 'command_validity_ended']],
    ['workspace changed', (f) => f.provider.onEvent(/** @type {any} */ ({ type: 'session.context_changed', data: { cwd: f.owner } })), ['cancelled', 'activation_ended']],
    ['tree became dirty', (f) => fs.appendFileSync(path.join(f.workspace, 'tracked.txt'), 'dirty\n'), ['refused', 'worktree_dirty']],
  ])) {
    const fixture = await servingFixture({ useGit: true, revision: 'pin', holdGit: true, verification: { expiresAt: '2026-09-24T00:00:00Z' } });
    const { exchangeId } = await fixture.admit();
    const pending = fixture.verify(exchangeId);
    await until(() => fixture.heldGit.length === 1, `${label}: HEAD probe held`);
    drift(fixture);
    fixture.heldGit[0].release(`${fixture.head}\n`);
    const result = await pending;
    assert.deepEqual([result.outcome, result.reason], expected, `${label}: ${JSON.stringify(result)}`);
    assert.equal(fixture.commandSpawns().length, 0, `${label}: no command started`);
  }
});

test('a valid command cwd moved to another valid workspace folder during a held revision probe starts no command; without drift the same path starts it, and the edited entry is itself approvable', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so this case did not run');
    return;
  }
  /** @param {(f: Awaited<ReturnType<typeof servingFixture>>) => void} drift */
  const heldRun = async (drift) => {
    const fixture = await servingFixture({ useGit: true, revision: 'pin', holdGit: true });
    const { exchangeId } = await fixture.admit();
    const pending = fixture.verify(exchangeId);
    await until(() => fixture.heldGit.length === 1, 'HEAD probe held');
    // Only this first probe is held; later probes run normally.
    fixture.control.holdGit = false;
    drift(fixture);
    fixture.heldGit[0].release(`${fixture.head}\n`);
    return { fixture, result: await pending };
  };
  const tools = (/** @type {Awaited<ReturnType<typeof servingFixture>>} */ f) => path.join(f.workspace, 'tools');

  const control = await heldRun(() => undefined);
  assert.deepEqual([control.result.outcome, control.result.record?.cwd, control.fixture.commandSpawns().length], ['ran', control.fixture.workspace, 1],
    'without drift, the same held probe leads to the approved command');

  const moved = await heldRun((f) => {
    assert.ok(fs.statSync(tools(f)).isDirectory(), 'the new cwd is an existing folder inside the workspace');
    const document = JSON.parse(fs.readFileSync(f.configPath, 'utf8'));
    assert.equal(document.commands.check.cwd, f.workspace);
    document.commands.check.cwd = tools(f);
    fs.writeFileSync(f.configPath, JSON.stringify(document));
  });
  assert.deepEqual([moved.result.outcome, moved.result.reason], ['refused', 'activation_ended'], JSON.stringify(moved.result));
  assert.equal(moved.fixture.commandSpawns().length, 0, 'no catalog command started, from either cwd');
  assert.ok(moved.fixture.logs.some((line) => line.startsWith('A2A activation ended: the configuration, TLS files, session, or workspace no longer match')),
    'the final binding check saw the changed entry');

  // The edited entry is valid on its own: a fresh proposal and approval run it from the new cwd.
  await moved.fixture.approve();
  const again = await moved.fixture.admit();
  const ran = await moved.fixture.verify(again.exchangeId);
  assert.deepEqual([ran.outcome, ran.record.cwd, moved.fixture.commandSpawns().length], ['ran', tools(moved.fixture), 1]);
});

test('one run at a time: a second verify or a reply waits for nothing and is refused, and stop requests termination of the running command', async () => {
  const fixture = await servingFixture();
  const { exchangeId } = await fixture.admit();
  const running = fixture.verify(exchangeId, { mode: 'sleep' });
  await until(() => fixture.logs.some((line) => line.startsWith('Run start:')), 'run started');
  const second = await fixture.call('dude_a2a_verify', { exchangeId, commandId: 'check', params: { mode: 'pass' } });
  assert.deepEqual([second.outcome, second.reason], ['refused', 'run_in_progress']);
  const reply = await fixture.call('dude_a2a_reply', { exchangeId, conclusion: 'Too early.', limitations: 'Run still going.', evidence: [] });
  assert.deepEqual([reply.outcome, reply.reason, reply.exchangeOpen], ['refused', 'run_in_progress', true]);
  assert.equal(fixture.commandSpawns().length, 1);
  fixture.provider.onEvent(/** @type {any} */ ({ type: 'user.message', data: { content: 'dude a2a stop' } }));
  const stopped = await running;
  assert.deepEqual([stopped.outcome, stopped.attachable, stopped.record.outcome, stopped.record.termination?.reason, stopped.record.termination?.result],
    ['ran', false, 'cancelled', 'activation_ended', 'requested']);
  assert.match(String(fixture.logs.find((line) => line.startsWith('Run end:'))), /cancelled; termination requested via .+; direct exit .+; descendants and ordinary tools unknown$/);
});

test('an exchange that ends during a run cancels it, and its record can no longer be cited', async () => {
  const fixture = await servingFixture();
  const { exchangeId } = await fixture.admit();
  const running = fixture.verify(exchangeId, { mode: 'sleep' });
  await until(() => fixture.logs.some((line) => line.startsWith('Run start:')), 'run started');
  fixture.provider.onEvent(/** @type {any} */ ({ type: 'abort', data: { reason: 'user initiated' } }));
  const ended = await running;
  assert.deepEqual([ended.attachable, ended.record.outcome, ended.record.termination?.reason], [false, 'cancelled', 'exchange_ended']);
  const late = await fixture.call('dude_a2a_reply', { exchangeId, conclusion: 'Late.', limitations: 'Late.', evidence: [{ run: ended.record.runId }] });
  assert.deepEqual([late.outcome, late.reason], ['refused', 'exchange_not_current']);
});

test('no revision probe starts after a cancellation: the post-run observation is recorded as cancelled, not unchanged', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so this case did not run');
    return;
  }
  const fixture = await servingFixture({ useGit: true });
  const { exchangeId } = await fixture.admit();
  const running = fixture.verify(exchangeId, { mode: 'sleep' });
  await until(() => fixture.logs.some((line) => line.startsWith('Run start:')), 'run started');
  fixture.provider.onEvent(/** @type {any} */ ({ type: 'abort', data: { reason: 'user initiated' } }));
  const ended = await running;
  const command = fixture.spawned.findIndex((entry) => entry.file === process.execPath);
  assert.deepEqual(fixture.spawned.slice(0, command).map((entry) => entry.args.includes('rev-parse') ? 'rev-parse' : entry.args.includes('status') ? 'status' : entry.file),
    ['rev-parse', 'status'], 'both probes ran before the command');
  assert.deepEqual(fixture.spawned.slice(command + 1).filter((entry) => entry.file === GIT), [], 'no probe started after the cancellation');
  assert.deepEqual([ended.record.outcome, ended.record.revision.before.unknown, ended.record.revision.after.unknown, ended.record.revision.changedDuringRun],
    ['cancelled', null, 'probe_cancelled', 'unknown']);
});

test('a timed-out run, a failing run, and a spawn failure are all recorded as observed and can be cited without a false success', async () => {
  const fixture = await servingFixture({
    commands: (workspace) => ({
      check: {
        executable: process.execPath,
        args: [path.join(workspace, 'tools', 'check.mjs'), '{mode}'],
        params: { mode: { enum: ['sleep', 'fail'] } },
        cwd: workspace,
        env: { inherit: FIXTURE_INHERIT, set: {} },
        timeoutMs: 500,
        outputBytes: 64,
        effects: 'Reads the workspace',
      },
      missing: {
        executable: path.join(workspace, 'tools', 'missing-program.exe'),
        args: [],
        params: {},
        cwd: workspace,
        env: { inherit: [], set: {} },
        timeoutMs: 500,
        outputBytes: 64,
        effects: 'None',
      },
    }),
    verification: { commands: ['check', 'missing'] },
  });
  const { exchangeId, handedOver, finish } = await fixture.admit();
  const timedOut = await fixture.verify(exchangeId, { mode: 'sleep' });
  assert.deepEqual([timedOut.resultType, timedOut.record.outcome, timedOut.record.termination?.reason, timedOut.attachable], ['failure', 'timed_out', 'timeout', true]);
  assert.equal(timedOut.record.revision.changedDuringRun, 'unknown', 'no Git policy observation, so no change claim');
  const failed = await fixture.verify(exchangeId, { mode: 'fail' });
  assert.deepEqual([failed.resultType, failed.record.outcome, failed.record.exit], ['success', 'exited', { code: 3, signal: null }],
    'a failing command is an observed exit; the tool call itself succeeded');
  const spawnFailed = await fixture.call('dude_a2a_verify', { exchangeId, commandId: 'missing', params: {} });
  assert.deepEqual([spawnFailed.record.outcome, spawnFailed.record.startedAt, spawnFailed.record.revision.after.unknown], ['spawn_failed', null, 'command_not_started']);
  assert.equal(fixture.logs.filter((line) => line === `Run start: ${spawnFailed.record.runId}`).length, 0, 'no start line without a start');
  const replying = fixture.call('dude_a2a_reply', {
    exchangeId, conclusion: 'The suite fails; the long run timed out; one tool is missing.', limitations: 'Nothing passed.',
    evidence: [{ run: timedOut.record.runId }, { run: failed.record.runId }, { run: spawnFailed.record.runId }],
  });
  const answer = await handedOver;
  assert.deepEqual(answer.evidence.map((/** @type {any} */ item) => item.outcome), ['timed_out', 'exited', 'spawn_failed']);
  assert.ok(readAnswer(answer));
  finish('sent');
  assert.equal((await replying).outcome, 'sent');
});

test('a registered run whose termination helper fails to launch hands off a record, log, and citation that say the request failed', async (context) => {
  if (!WINDOWS) {
    context.skip('the taskkill helper is the Windows termination path, so this case did not run here');
    return;
  }
  const fixture = await servingFixture({
    commands: (workspace) => ({
      check: {
        executable: process.execPath,
        args: [path.join(workspace, 'tools', 'check.mjs'), '{mode}'],
        params: { mode: { enum: ['sleep'] } },
        cwd: workspace,
        env: { inherit: FIXTURE_INHERIT, set: {} },
        timeoutMs: 300,
        outputBytes: 64,
        effects: 'Reads the workspace',
      },
    }),
  });
  fixture.control.failKill = true;
  const { exchangeId, handedOver, finish } = await fixture.admit();
  const timedOut = await fixture.verify(exchangeId, { mode: 'sleep' });
  const command = fixture.spawned.find((entry) => entry.file === process.execPath);
  try {
    assert.deepEqual(fixture.spawned.filter((entry) => path.basename(entry.file).toLowerCase() === 'taskkill.exe').map((entry) => entry.args),
      [['/PID', String(command?.pid), '/T', '/F']], 'the one request named this run\'s PID');
    assert.deepEqual([timedOut.attachable, timedOut.record.outcome, timedOut.record.exit, timedOut.record.termination], [true, 'timed_out', null, {
      reason: 'timeout', method: 'windows-taskkill-tree', result: 'failed', error: 'ENOENT', helper: { started: false, exit: null },
    }]);
    assert.ok(fixture.logs.includes(`Run end: ${timedOut.record.runId}; timed out; termination failed via windows-taskkill-tree (ENOENT); `
      + 'direct exit unknown; descendants and ordinary tools unknown'));
    assert.equal(JSON.stringify([timedOut, fixture.logs]).includes('System32'), false, 'no helper path or error message is kept');
    const replying = fixture.call('dude_a2a_reply', {
      exchangeId, conclusion: 'The run timed out and could not be stopped.', limitations: 'It may still be running.', evidence: [{ run: timedOut.record.runId }],
    });
    const answer = await handedOver;
    assert.deepEqual(answer.evidence[0].termination, timedOut.record.termination, 'the handed-off citation carries the failed request');
    assert.ok(readAnswer(answer), "the asker's validator accepts the failed request as observed");
    finish('sent');
    assert.equal((await replying).outcome, 'sent');
  } finally {
    if (command?.pid !== undefined) killPid(command.pid);
  }
});

test('post-run probes flag a persistent change but not one undone during the run, and the worktree policy records unknown without Git', async (context) => {
  if (!GIT) {
    context.skip('git is not on PATH, so this case did not run');
    return;
  }
  const pinned = await servingFixture({ useGit: true, revision: 'pin' });
  const { exchangeId } = await pinned.admit();
  const transient = await pinned.verify(exchangeId, { mode: 'transient' });
  assert.equal(transient.record.revision.changedDuringRun, false, 'a change undone during the run is not observed: a stated limit');
  const touched = await pinned.verify(exchangeId, { mode: 'touch' });
  assert.equal(touched.record.revision.changedDuringRun, true);
  assert.deepEqual([touched.record.revision.after.head, touched.record.revision.after.clean], [pinned.head, false]);

  const dirtyWorktree = await servingFixture({ useGit: true });
  fs.appendFileSync(path.join(dirtyWorktree.workspace, 'tracked.txt'), 'dirty but approved\n');
  const worktreeExchange = await dirtyWorktree.admit();
  const accepted = await dirtyWorktree.verify(worktreeExchange.exchangeId);
  assert.deepEqual([accepted.record.revision.policy, accepted.record.revision.before.clean, accepted.record.outcome], ['worktree', false, 'exited'],
    'the worktree policy explicitly accepts dirty files and records the status digest');

  const withoutGit = await servingFixture();
  const plainExchange = await withoutGit.admit();
  const unknown = await withoutGit.verify(plainExchange.exchangeId);
  assert.deepEqual([unknown.record.revision.before.unknown, unknown.record.revision.after.unknown, unknown.record.revision.changedDuringRun],
    ['git_not_configured', 'git_not_configured', 'unknown']);

  const notRepo = await servingFixture({ verification: { git: GIT } });
  const notRepoExchange = await notRepo.admit();
  const unobservable = await notRepo.verify(notRepoExchange.exchangeId);
  assert.deepEqual([unobservable.record.outcome, unobservable.record.revision.before.unknown, unobservable.record.revision.after.unknown,
    unobservable.record.revision.changedDuringRun], ['exited', 'probe_failed', 'probe_failed', 'unknown'],
  'the worktree policy runs when Git cannot observe the workspace, and records the revision as unknown');
});

test('the command sees only declared environment names, and fixed values never appear in records or logs', async () => {
  const fixture = await servingFixture();
  const { exchangeId } = await fixture.admit();
  const result = await fixture.verify(exchangeId, { mode: 'env' });
  /** @type {Record<string, number>} */
  const seen = JSON.parse(result.record.stdout.text);
  assert.equal(seen.CI_TOKEN, SECRET.length, 'the fixed value reached the command');
  const unexpected = Object.entries(seen).filter(([name, length]) => length > 0 && !['CI_TOKEN', 'SystemRoot', 'SYSTEMROOT', 'NODE_OPTIONS'].includes(name));
  assert.deepEqual(unexpected, [], 'no other variable carries a value into the command');
  assert.equal(seen.NODE_OPTIONS ?? 0, (process.env.NODE_OPTIONS ?? '').length, 'the declared NODE_OPTIONS, and so the no-listen guard, reached the command');
  assert.equal(JSON.stringify([result.record.environment, fixture.logs]).includes(SECRET), false);
});

test('only completed records of the current exchange can be cited; stale, forged, and oversized citations are refused before anything is sent', async () => {
  const fixture = await servingFixture({ profile: { contentBytes: 4096 } });
  const first = await fixture.admit();
  const earlier = await fixture.verify(first.exchangeId);
  const firstReply = fixture.call('dude_a2a_reply', { exchangeId: first.exchangeId, conclusion: 'Passed.', limitations: 'One run.', evidence: [{ run: earlier.record.runId }] });
  await first.handedOver;
  first.finish('sent');
  await firstReply;

  const second = await fixture.admit();
  for (const [label, runId] of [['a record from an earlier exchange', earlier.record.runId], ['an ID the adapter never made', randomUUID()]]) {
    const refused = await fixture.call('dude_a2a_reply', { exchangeId: second.exchangeId, conclusion: 'See run.', limitations: 'None.', evidence: [{ run: runId }] });
    assert.deepEqual([refused.outcome, refused.reason, refused.exchangeOpen, refused.evidence], ['refused', 'run_not_found', true, 'evidence[0]'], label);
  }
  const forged = await fixture.call('dude_a2a_reply', { exchangeId: second.exchangeId, conclusion: 'See run.', limitations: 'None.', evidence: [{ run: earlier.record.runId, outcome: 'exited' }] });
  assert.deepEqual([forged.reason, forged.field], ['invalid_arguments', 'evidence[0]'], 'a model cannot add or relabel record fields');
  const big = await fixture.verify(second.exchangeId, { mode: 'big' });
  const tooLarge = await fixture.call('dude_a2a_reply', { exchangeId: second.exchangeId, conclusion: 'Output attached.', limitations: 'None.', evidence: [{ run: big.record.runId }] });
  assert.deepEqual([tooLarge.reason, tooLarge.exchangeOpen], ['reply_too_large', true], 'run output counts toward the encoded reply, and nothing is truncated');
});

test("the asker's validator refuses forged or inconsistent run records", async () => {
  const exchangeId = randomUUID();
  const text = 'ok\n';
  const pin = 'a'.repeat(40);
  const observed = { head: pin, statusBytes: 0, statusSha256: sha256(''), clean: true, unknown: null };
  const valid = () => ({
    outcome: 'answer', exchangeId, conclusion: 'Passed.', limitations: 'One run.',
    evidence: [{
      kind: 'run', runId: randomUUID(), exchangeId, commandId: 'check', commandDigest: 'b'.repeat(64), params: { mode: 'pass' },
      executable: '/usr/bin/node', argv: ['tools/check.mjs', 'pass'], cwd: '/work', workspace: '/work',
      revision: { policy: 'commit', pin, before: { ...observed }, after: { ...observed }, changedDuringRun: false },
      environment: { platform: 'linux', arch: 'x64', inherited: [{ name: 'PATH', present: true }], fixed: ['CI_TOKEN'], blanked: [], values: 'hidden' },
      startedAt: '2026-09-23T16:00:00.000Z', endedAt: '2026-09-23T16:00:01.000Z', outcome: 'exited', exit: { code: 0, signal: null }, termination: null,
      stdout: { bytes: 3, complete: true, sha256: sha256(text), retained: 3, text, lossy: false },
      stderr: { bytes: 0, complete: true, sha256: sha256(''), retained: 0, text: '', lossy: false },
    }],
  });
  assert.ok(readAnswer(valid()));
  const failedLaunch = valid();
  Object.assign(failedLaunch.evidence[0], { outcome: 'timed_out', exit: null, termination: {
    reason: 'timeout', method: 'windows-taskkill-tree', result: 'failed', error: 'ENOENT', helper: { started: false, exit: null },
  } });
  assert.ok(readAnswer(failedLaunch), 'a failed termination request is a valid observation');
  /** @param {Record<string, unknown>} termination @returns {(value: any) => void} */
  const timedOutWith = (termination) => (value) => {
    Object.assign(value.evidence[0], { outcome: 'timed_out', exit: null, termination: { reason: 'timeout', method: 'windows-taskkill-tree', ...termination } });
  };
  for (const [label, mutate] of /** @type {Array<[string, (value: any) => void]>} */ ([
    ['tampered complete-output digest', (value) => { value.evidence[0].stdout.sha256 = 'c'.repeat(64); }],
    ['digest claimed for an incomplete stream', (value) => { value.evidence[0].stdout.complete = false; }],
    ['record of another exchange', (value) => { value.evidence[0].exchangeId = randomUUID(); }],
    ['pinned run on another revision', (value) => { value.evidence[0].revision.before.head = 'd'.repeat(40); }],
    ['pinned run on a dirty tree', (value) => { value.evidence[0].revision.before = { ...observed, statusBytes: 3, statusSha256: sha256('x'), clean: false }; }],
    ['change flag that contradicts the observations', (value) => { value.evidence[0].revision.changedDuringRun = true; }],
    ['exit without a start', (value) => { value.evidence[0].startedAt = null; }],
    ['exited run with a termination request', (value) => { value.evidence[0].termination = { reason: 'timeout', method: 'x', result: 'requested', error: null, helper: null }; }],
    ['spawn failure with an exit', (value) => { value.evidence[0].outcome = 'spawn_failed'; }],
    ['failed termination request without its error code', timedOutWith({ result: 'failed', error: null, helper: { started: false, exit: null } })],
    ['error code on an issued termination request', timedOutWith({ result: 'requested', error: 'ENOENT', helper: null })],
    ['helper exit without an observed helper start', timedOutWith({ result: 'requested', error: null, helper: { started: false, exit: { code: 0, signal: null } } })],
    ['termination record missing its observation fields', timedOutWith({ result: 'requested' })],
    ['environment value disclosed', (value) => { value.evidence[0].environment.values = { CI_TOKEN: SECRET }; }],
    ['extra record field', (value) => { value.evidence[0].verifiedBy = 'peer'; }],
  ])) {
    const value = valid();
    mutate(value);
    assert.equal(readAnswer(value), null, label);
  }
});
