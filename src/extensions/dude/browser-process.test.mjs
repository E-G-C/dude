// @ts-check
/**
 * Focused process-boundary regressions for Review's owned CDP browser.
 *
 * Every executable, process receipt, and browser profile belongs to one test.
 * These probes use the real child_process pipes and never inspect or signal an
 * installed browser or a parent process.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findBrowser, launchBrowser, preflightCapture } from './lib/review/browser.mjs';
import { ReviewError } from './lib/review/data.mjs';

const POSIX_ONLY = process.platform === 'win32'
  ? 'The test-owned executable uses the POSIX executable contract.'
  : false;

/**
 * @param {string} behavior
 * @param {{ includeOriginalPath?: boolean }} [options]
 */
function installOwnedBrowser(behavior, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-browser-process-test-'));
  const bin = path.join(root, 'bin');
  const receipt = path.join(root, 'child.json');
  const helperReceipt = path.join(root, 'helper.json');
  const control = path.join(root, 'control.ndjson');
  fs.mkdirSync(bin);
  const executable = path.join(bin, 'microsoft-edge');
  const source = [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    `const receipt = ${JSON.stringify(receipt)};`,
    `const helperReceipt = ${JSON.stringify(helperReceipt)};`,
    `const control = ${JSON.stringify(control)};`,
    "const profile = process.argv.find((value) => value.startsWith('--user-data-dir='))?.slice(16) ?? null;",
    'const record = { pid: process.pid, profile, normalClose: false };',
    "const save = () => fs.writeFileSync(receipt, JSON.stringify(record));",
    'const recordProbe = (type, detail = {}) => fs.appendFileSync(control,',
    '  JSON.stringify({ type, at: Date.now(), ...detail }) + "\\n");',
    'save();',
    'let wire = Buffer.alloc(0);',
    'function reply(message) { fs.writeSync(4, Buffer.from(JSON.stringify(message) + "\\0")); }',
    'function readCommands(handler) {',
    '  const bytes = Buffer.alloc(4096);',
    '  const read = () => fs.read(3, bytes, 0, bytes.length, null, (error, count) => {',
    '    if (error || count === 0) return;',
    '    wire = Buffer.concat([wire, bytes.subarray(0, count)]);',
    '    for (let split; (split = wire.indexOf(0)) !== -1;) {',
    '      const packet = wire.subarray(0, split);',
    '      wire = wire.subarray(split + 1);',
    '      handler(JSON.parse(packet.toString("utf8")));',
    '    }',
    '    read();',
    '  });',
    '  read();',
    '}',
    behavior,
    '',
  ].join('\n');
  fs.writeFileSync(executable, source, { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = options.includeOriginalPath && originalPath
    ? `${bin}${path.delimiter}${originalPath}`
    : bin;
  return {
    root,
    receipt,
    helperReceipt,
    control,
    executable,
    restore() {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    },
  };
}

/** @param {ReturnType<typeof installOwnedBrowser>} fixture */
function childReceipt(fixture) {
  return JSON.parse(fs.readFileSync(fixture.receipt, 'utf8'));
}

/** @param {ReturnType<typeof installOwnedBrowser>} fixture */
function ownedHelperReceipt(fixture) {
  return JSON.parse(fs.readFileSync(fixture.helperReceipt, 'utf8'));
}

/** @param {ReturnType<typeof installOwnedBrowser>} fixture */
function controlEvents(fixture) {
  const text = fs.readFileSync(fixture.control, 'utf8').trim();
  return text ? text.split('\n').map(line => JSON.parse(line)) : [];
}

/** @param {number} pid */
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

/**
 * @template T
 * @param {()=>T|null|undefined|false} probe
 * @param {string} label
 * @param {number} [milliseconds]
 * @returns {Promise<T>}
 */
async function until(probe, label, milliseconds = 2_000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/** @param {ReturnType<typeof installOwnedBrowser>} fixture */
async function removeOwnedBrowser(fixture) {
  try {
    const pids = [];
    if (fs.existsSync(fixture.helperReceipt)) pids.push(ownedHelperReceipt(fixture).pid);
    if (fs.existsSync(fixture.receipt)) pids.push(childReceipt(fixture).pid);
    for (const pid of pids) {
      if (Number.isInteger(pid) && processIsAlive(pid)) process.kill(pid, 'SIGKILL');
    }
    const deadline = Date.now() + 2_000;
    while (pids.some(pid => Number.isInteger(pid) && processIsAlive(pid)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    fixture.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

test('initial Browser.getVersion accepts one reply after 4 seconds but before the 10-second startup bound', {
  skip: POSIX_ONLY,
  timeout: 15_000,
  concurrency: false,
}, async (context) => {
  // Arrange
  const replyDelayMs = 4_500;
  const fixture = installOwnedBrowser([
    'readCommands((message) => {',
    '  recordProbe("command", { id: message.id, method: message.method });',
    '  if (message.method === "Browser.getVersion") {',
    '    setTimeout(() => {',
    '      recordProbe("reply", { id: message.id, method: message.method });',
    '      reply({ id: message.id, result: { product: "Edg/133.0.0.0" } });',
    `    }, ${replyDelayMs});`,
    '  } else if (message.method === "Browser.close") {',
    '    record.normalClose = true;',
    '    save();',
    '    reply({ id: message.id, result: {} });',
    '    process.exit(0);',
    '  }',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  let browser;
  const started = performance.now();
  try {
    assert.equal(findBrowser(), fixture.executable);

    // Act
    browser = await launchBrowser(new AbortController().signal);
    const startupMs = performance.now() - started;
    await browser.close();

    // Assert
    const events = controlEvents(fixture);
    assert.equal(browser.version, 'Edg/133.0.0.0');
    assert.ok(startupMs >= 4_100,
      `the startup reply did not cross the old four-second boundary: ${startupMs}ms`);
    assert.ok(startupMs < 9_500,
      `the accepted startup reply did not stay inside the ten-second boundary: ${startupMs}ms`);
    assert.deepEqual(events.map(({ type, id, method }) => ({ type, id, method })), [
      { type: 'command', id: 1, method: 'Browser.getVersion' },
      { type: 'reply', id: 1, method: 'Browser.getVersion' },
      { type: 'command', id: 2, method: 'Browser.close' },
    ], `startup must issue and accept exactly one version command: ${JSON.stringify(events)}`);
    const child = childReceipt(fixture);
    assert.equal(child.normalClose, true);
    assert.equal(processIsAlive(child.pid), false);
    assert.equal(fs.existsSync(child.profile), false);
    context.diagnostic(JSON.stringify({ startupMs, replyDelayMs }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await removeOwnedBrowser(fixture);
  }
});

test('an unanswered initial command refuses at 10 seconds and cleanup remains bounded', {
  skip: POSIX_ONLY,
  timeout: 22_000,
  concurrency: false,
}, async (context) => {
  // Arrange
  const fixture = installOwnedBrowser([
    'process.on("SIGTERM", () => {',
    '  recordProbe("sigterm");',
    '  process.exit(0);',
    '});',
    'readCommands((message) => {',
    '  recordProbe("command", { id: message.id, method: message.method });',
    '  // Deliberately answer neither startup nor Browser.close.',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  let failure;
  const started = performance.now();
  try {
    assert.equal(findBrowser(), fixture.executable);

    // Act
    try {
      await launchBrowser(new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    const completeMs = performance.now() - started;

    // Assert
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_timeout');
    assert.equal(failure.detail?.stage, 'command_timeout');
    const events = controlEvents(fixture);
    const initial = events.find(event => event.type === 'command' && event.id === 1);
    const close = events.find(event => event.type === 'command' && event.id === 2);
    const terminated = events.find(event => event.type === 'sigterm');
    assert.ok(initial && close && terminated,
      `startup, bounded close, and termination must all be observed: ${JSON.stringify(events)}`);
    const startupMs = close.at - initial.at;
    const closeMs = terminated.at - close.at;
    assert.ok(startupMs >= 9_500 && startupMs < 14_000,
      `the unanswered initial command did not use the startup bound: ${startupMs}ms`);
    assert.ok(closeMs >= 3_700 && closeMs < 7_000,
      `Browser.close did not retain the subsequent-command bound: ${closeMs}ms`);
    assert.ok(completeMs >= 13_200 && completeMs < 19_000,
      `startup refusal plus owned cleanup was not bounded: ${completeMs}ms`);
    const child = childReceipt(fixture);
    assert.equal(processIsAlive(child.pid), false);
    assert.equal(fs.existsSync(child.profile), false);
    context.diagnostic(JSON.stringify({ startupMs, closeMs, completeMs }));
  } finally {
    await removeOwnedBrowser(fixture);
  }
});

test('a command sent after startup still refuses at the 4-second responsiveness bound', {
  skip: POSIX_ONLY,
  timeout: 14_000,
  concurrency: false,
}, async (context) => {
  // Arrange
  const fixture = installOwnedBrowser([
    'let versionCommands = 0;',
    'readCommands((message) => {',
    '  recordProbe("command", { id: message.id, method: message.method });',
    '  if (message.method === "Browser.getVersion" && ++versionCommands === 1) {',
    '    reply({ id: message.id, result: { product: "Edg/133.0.0.0" } });',
    '  } else if (message.method === "Browser.close") {',
    '    record.normalClose = true;',
    '    save();',
    '    reply({ id: message.id, result: {} });',
    '    process.exit(0);',
    '  }',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  let browser;
  let failure;
  try {
    assert.equal(findBrowser(), fixture.executable);
    browser = await launchBrowser(new AbortController().signal);
    const started = performance.now();

    // Act
    try {
      await browser.send('Browser.getVersion');
    } catch (error) {
      failure = error;
    }
    const commandMs = performance.now() - started;
    await browser.close();

    // Assert
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_timeout');
    assert.equal(failure.detail?.stage, 'command_timeout');
    assert.ok(commandMs >= 3_700 && commandMs < 7_000,
      `the post-startup command did not use the four-second bound: ${commandMs}ms`);
    const events = controlEvents(fixture);
    assert.deepEqual(events.filter(({ type }) => type === 'command')
      .map(({ id, method }) => ({ id, method })), [
      { id: 1, method: 'Browser.getVersion' },
      { id: 2, method: 'Browser.getVersion' },
      { id: 3, method: 'Browser.close' },
    ], `the unanswered command must really cross the CDP pipe: ${JSON.stringify(events)}`);
    const child = childReceipt(fixture);
    assert.equal(child.normalClose, true);
    assert.equal(processIsAlive(child.pid), false);
    assert.equal(fs.existsSync(child.profile), false);
    context.diagnostic(JSON.stringify({ commandMs }));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await removeOwnedBrowser(fixture);
  }
});

test('abort during the startup allowance rejects promptly and cleans only the owned browser', {
  skip: POSIX_ONLY,
  timeout: 9_000,
  concurrency: false,
}, async (context) => {
  // Arrange
  const fixture = installOwnedBrowser([
    'process.on("SIGTERM", () => {',
    '  recordProbe("sigterm");',
    '  process.exit(0);',
    '});',
    'readCommands((message) => {',
    '  recordProbe("command", { id: message.id, method: message.method });',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  const controller = new AbortController();
  let failure;
  try {
    assert.equal(findBrowser(), fixture.executable);
    const launching = launchBrowser(controller.signal);
    await until(
      () => fs.existsSync(fixture.control)
        && controlEvents(fixture).some(event => event.type === 'command'),
      'the owned startup command to cross the CDP pipe',
    );
    const abortedAt = performance.now();

    // Act
    controller.abort();
    try {
      await launching;
    } catch (error) {
      failure = error;
    }
    const abortCleanupMs = performance.now() - abortedAt;

    // Assert
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_timeout');
    assert.notEqual(failure.detail?.stage, 'command_timeout',
      'caller abort must not wait for the startup command timer');
    assert.ok(abortCleanupMs < 4_000,
      `abort waited for the ten-second startup allowance: ${abortCleanupMs}ms`);
    const events = controlEvents(fixture);
    assert.deepEqual(events.filter(({ type }) => type === 'command')
      .map(({ id, method }) => ({ id, method })), [
      { id: 1, method: 'Browser.getVersion' },
    ], `abort must not send a new command while cleaning up: ${JSON.stringify(events)}`);
    assert.equal(events.filter(({ type }) => type === 'sigterm').length, 1);
    const child = childReceipt(fixture);
    assert.equal(processIsAlive(child.pid), false);
    assert.equal(fs.existsSync(child.profile), false);
    context.diagnostic(JSON.stringify({ abortCleanupMs }));
  } finally {
    controller.abort();
    await removeOwnedBrowser(fixture);
  }
});

test('Review reports an owned browser exit with its bounded exit code and removes its profile', {
  skip: POSIX_ONLY,
  timeout: 10_000,
  concurrency: false,
}, async () => {
  // Arrange: wait until the startup command has crossed the real pipe so the
  // intended child-exit diagnostic cannot race a write into an already-closed
  // pipe. Keep ps reachable so descendant inventory is not part of this case.
  const fixture = installOwnedBrowser([
    'readCommands((message) => {',
    '  recordProbe("command", { id: message.id, method: message.method });',
    '  process.exit(23);',
    '});',
  ].join('\n'), { includeOriginalPath: true });
  let failure;
  try {
    assert.equal(findBrowser(), fixture.executable);

    // Act
    try {
      await launchBrowser(new AbortController().signal);
    } catch (error) {
      failure = error;
    }

    // Assert
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_failed');
    assert.deepEqual(failure.detail, { stage: 'child_exit', exitCode: 23 });
    assert.deepEqual(controlEvents(fixture).map(({ type, id, method }) => ({ type, id, method })), [
      { type: 'command', id: 1, method: 'Browser.getVersion' },
    ], 'the owned child must exit only after receiving the startup command');
    const child = childReceipt(fixture);
    assert.equal(processIsAlive(child.pid), false, 'the test-owned child reached close');
    assert.ok(child.profile?.includes('dude-review-browser-'));
    assert.equal(fs.existsSync(child.profile), false, 'the test-owned browser profile was removed');
  } finally {
    await removeOwnedBrowser(fixture);
  }
});

test('Review retains a protocol failure when bounded cleanup needs SIGTERM but cannot inventory descendants', {
  skip: POSIX_ONLY,
  timeout: 10_000,
  concurrency: false,
}, async () => {
  // Arrange: PATH intentionally contains only the owned executable. The
  // product can terminate that exact PID, but cannot run ps to prove that it
  // inventoried every descendant, so cleanup uncertainty must remain explicit.
  const fixture = installOwnedBrowser([
    'readCommands((message) => {',
    '  if (message.method === "Browser.getVersion") {',
    '    fs.writeSync(4, Buffer.from("not-json\\0"));',
    '  }',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'));
  let failure;
  try {
    assert.equal(findBrowser(), fixture.executable);

    // Act
    try {
      await launchBrowser(new AbortController().signal);
    } catch (error) {
      failure = error;
    }

    // Assert
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_failed');
    assert.deepEqual(failure.detail, {
      stage: 'protocol',
      signal: 'SIGTERM',
      cleanupUncertain: true,
    });
    const child = childReceipt(fixture);
    assert.equal(processIsAlive(child.pid), false, 'the specifically owned child was terminated');
    assert.equal(fs.existsSync(child.profile), false, 'cleanup removed the specifically owned profile');
  } finally {
    await removeOwnedBrowser(fixture);
  }
});

test('a normal Browser.close exit is successful rather than a child_exit diagnostic', {
  skip: POSIX_ONLY,
  timeout: 10_000,
  concurrency: false,
}, async () => {
  // Arrange
  const fixture = installOwnedBrowser([
    'readCommands((message) => {',
    '  if (message.method === "Browser.getVersion") {',
    '    reply({ id: message.id, result: { product: "Edg/133.0.0.0" } });',
    '  } else if (message.method === "Browser.close") {',
    '    record.normalClose = true;',
    '    save();',
    '    process.exit(0);',
    '  }',
    '});',
  ].join('\n'));
  let browser;
  try {
    assert.equal(findBrowser(), fixture.executable);

    // Act
    browser = await launchBrowser(new AbortController().signal);
    await browser.close();

    // Assert
    assert.equal(browser.version, 'Edg/133.0.0.0');
    const child = childReceipt(fixture);
    assert.equal(child.normalClose, true);
    assert.equal(processIsAlive(child.pid), false, 'the normal close reaped the owned child');
    assert.equal(fs.existsSync(child.profile), false, 'the normal close removed the owned profile');
  } finally {
    if (browser) await browser.close().catch(() => {});
    await removeOwnedBrowser(fixture);
  }
});

test('preflight waits for an owned helper after Browser.close replies before cleaning its profile', {
  skip: POSIX_ONLY,
  timeout: 10_000,
  concurrency: false,
}, async () => {
  // Arrange
  const helperShutdownMs = 200;
  const helperProgram = [
    "const fs = require('node:fs');",
    'const [receipt, control, profile, shutdownText] = process.argv.slice(1);',
    'function append(type, detail = {}) {',
    '  fs.appendFileSync(control, JSON.stringify({ type, pid: process.pid, at: Date.now(), ...detail }) + "\\n");',
    '}',
    'let stopping = false;',
    "process.on('SIGTERM', () => {",
    '  if (stopping) return;',
    '  stopping = true;',
    '  const signaled = process.hrtime.bigint();',
    '  append("helper_sigterm", { profileExists: fs.existsSync(profile) });',
    '  setTimeout(() => {',
    '    append("helper_exit", {',
    '      profileExists: fs.existsSync(profile),',
    '      shutdownMs: Number(process.hrtime.bigint() - signaled) / 1e6,',
    '    });',
    '    process.exit(0);',
    '  }, Number(shutdownText));',
    '});',
    'fs.writeFileSync(receipt, JSON.stringify({',
    '  pid: process.pid, parentPid: process.ppid, readyAt: Date.now(),',
    '}));',
    'const fdFact = fd => {',
    '  try {',
    '    const stat = fs.fstatSync(fd);',
    '    return { open: true, fifo: stat.isFIFO(), character: stat.isCharacterDevice() };',
    '  } catch (error) {',
    '    return { open: false, code: error.code };',
    '  }',
    '};',
    'append("helper_ready", {',
    '  parentPid: process.ppid, profileExists: fs.existsSync(profile),',
    '  fd3: fdFact(3), fd4: fdFact(4),',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n');
  const fixture = installOwnedBrowser([
    "const { spawn } = require('node:child_process');",
    `const helperProgram = ${JSON.stringify(helperProgram)};`,
    "const helperNull = fs.openSync('/dev/null', 'r+');",
    `const helper = spawn(process.execPath, ['-e', helperProgram, helperReceipt, control, profile, '${helperShutdownMs}'], {`,
    "  stdio: ['ignore', 'ignore', 'ignore', helperNull, helperNull],",
    '});',
    'fs.closeSync(helperNull);',
    'function appendControl(type, detail = {}) {',
    '  fs.appendFileSync(control, JSON.stringify({ type, pid: process.pid, at: Date.now(), ...detail }) + "\\n");',
    '}',
    'record.helperPid = helper.pid;',
    'save();',
    'appendControl("helper_spawned", { helperPid: helper.pid });',
    'function withReadyHelper(action) {',
    '  if (fs.existsSync(helperReceipt)) { action(); return; }',
    '  setTimeout(() => withReadyHelper(action), 5);',
    '}',
    'let rootStopping = false;',
    "process.on('SIGTERM', () => {",
    '  if (rootStopping) return;',
    '  rootStopping = true;',
    '  appendControl("root_sigterm", { helperPid: helper.pid });',
    '  appendControl("root_exit", { helperPid: helper.pid, profileExists: fs.existsSync(profile) });',
    '  process.exit(0);',
    '});',
    'readCommands((message) => {',
    '  if (message.method === "Browser.getVersion") {',
    '    withReadyHelper(() => {',
    '      reply({ id: message.id, result: { product: "Edg/133.0.0.0" } });',
    '      appendControl("version_replied", { helperPid: helper.pid });',
    '    });',
    '  } else if (message.method === "Browser.close") {',
    '    record.normalClose = true;',
    '    save();',
    '    appendControl("close_received", { helperPid: helper.pid });',
    '    reply({ id: message.id, result: {} });',
    '    appendControl("close_replied", { helperPid: helper.pid });',
    '    fs.closeSync(3);',
    '    fs.closeSync(4);',
    '    appendControl("cdp_pipes_closed", { helperPid: helper.pid });',
    '  }',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  let result;
  let failure;
  try {
    assert.equal(findBrowser(), fixture.executable);

    // Act
    try {
      result = await preflightCapture(new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    const child = childReceipt(fixture);
    const helper = ownedHelperReceipt(fixture);
    // The 500ms slack exceeds the helper's shutdown window while remaining
    // inside close()'s existing one-second graceful-cleanup bound.
    const observationDeadline = Date.now() + helperShutdownMs + 500;
    while ((processIsAlive(child.pid) || processIsAlive(helper.pid))
      && Date.now() < observationDeadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const events = controlEvents(fixture);
    const eventIndex = type => events.findIndex(event => event.type === type);
    const helperReady = events.find(event => event.type === 'helper_ready');
    const rootExit = events.find(event => event.type === 'root_exit');
    const helperExit = events.find(event => event.type === 'helper_exit');
    assert.ok(helperReady, `the helper did not report readiness: ${JSON.stringify(events)}`);
    assert.ok(rootExit, `the root did not report exit: ${JSON.stringify(events)}`);
    assert.ok(helperExit, `the helper did not report exit: ${JSON.stringify(events)}`);
    assert.deepEqual([helperReady.fd3, helperReady.fd4], [
      { open: true, fifo: false, character: true },
      { open: true, fifo: false, character: true },
    ], `the helper inherited a FIFO CDP descriptor: ${JSON.stringify(events)}`);
    assert.ok(eventIndex('close_replied') >= 0
      && eventIndex('close_replied') < eventIndex('cdp_pipes_closed')
      && eventIndex('cdp_pipes_closed') < eventIndex('root_sigterm'),
      `Browser.close did not reply and release its pipes before root SIGTERM: ${JSON.stringify(events)}`);
    assert.ok(eventIndex('root_exit') >= 0 && eventIndex('root_exit') < eventIndex('helper_exit'),
      `the owned root did not exit before its helper: ${JSON.stringify(events)}`);
    assert.ok(helperExit.shutdownMs >= helperShutdownMs - 20,
      `the helper did not use its delayed shutdown window: ${JSON.stringify(events)}`);

    // Assert
    assert.deepEqual({
      failure: failure instanceof ReviewError
        ? { code: failure.code, detail: failure.detail }
        : failure ? { name: failure.name, message: failure.message } : null,
      result,
      rootPid: child.pid,
      helperPid: helper.pid,
      recordedHelperPid: child.helperPid,
      helperParentPid: helper.parentPid,
      rootAlive: processIsAlive(child.pid),
      helperAlive: processIsAlive(helper.pid),
      normalClose: child.normalClose,
      rootSawProfileAtExit: rootExit.profileExists,
      helperSawProfileAtExit: helperExit.profileExists,
      profileExistsAfterClose: fs.existsSync(child.profile),
    }, {
      failure: null,
      result: { available: true, browser: 'Edg/133.0.0.0', mode: 'fresh-viewport' },
      rootPid: child.pid,
      helperPid: helper.pid,
      recordedHelperPid: helper.pid,
      helperParentPid: child.pid,
      rootAlive: false,
      helperAlive: false,
      normalClose: true,
      rootSawProfileAtExit: true,
      helperSawProfileAtExit: true,
      profileExistsAfterClose: false,
    }, `observed owned-process order: ${JSON.stringify(events)}`);
  } finally {
    await removeOwnedBrowser(fixture);
  }
});

test('close SIGKILLs an owned helper that outlives its root and waits to remove the profile', {
  skip: POSIX_ONLY,
  timeout: 10_000,
  concurrency: false,
}, async () => {
  // Arrange
  const helperProgram = [
    "const fs = require('node:fs');",
    'const [receipt, control, profile] = process.argv.slice(1);',
    'function append(type, detail = {}) {',
    '  fs.appendFileSync(control, JSON.stringify({ type, pid: process.pid, at: Date.now(), ...detail }) + "\\n");',
    '}',
    "process.on('SIGTERM', () => {",
    '  append("helper_sigterm", { profileExists: fs.existsSync(profile) });',
    '});',
    'fs.writeFileSync(receipt, JSON.stringify({',
    '  pid: process.pid, parentPid: process.ppid, readyAt: Date.now(),',
    '}));',
    'append("helper_ready", { parentPid: process.ppid, profileExists: fs.existsSync(profile) });',
    'setInterval(() => {}, 1_000);',
  ].join('\n');
  const fixture = installOwnedBrowser([
    "const { spawn } = require('node:child_process');",
    `const helperProgram = ${JSON.stringify(helperProgram)};`,
    "const helperNull = fs.openSync('/dev/null', 'r+');",
    'const helper = spawn(process.execPath, [',
    "  '-e', helperProgram, helperReceipt, control, profile,",
    "], { stdio: ['ignore', 'ignore', 'ignore', helperNull, helperNull] });",
    'fs.closeSync(helperNull);',
    'function appendControl(type, detail = {}) {',
    '  fs.appendFileSync(control, JSON.stringify({ type, pid: process.pid, at: Date.now(), ...detail }) + "\\n");',
    '}',
    'record.helperPid = helper.pid;',
    'save();',
    'appendControl("helper_spawned", { helperPid: helper.pid });',
    'function withReadyHelper(action) {',
    '  if (fs.existsSync(helperReceipt)) { action(); return; }',
    '  setTimeout(() => withReadyHelper(action), 5);',
    '}',
    "process.on('SIGTERM', () => {",
    '  let helperAlive = true;',
    "  try { process.kill(helper.pid, 0); } catch { helperAlive = false; }",
    '  appendControl("root_exit", {',
    '    helperPid: helper.pid, helperAlive, profileExists: fs.existsSync(profile),',
    '  });',
    '  process.exit(0);',
    '});',
    'readCommands((message) => {',
    '  if (message.method === "Browser.getVersion") {',
    '    withReadyHelper(() => {',
    '      reply({ id: message.id, result: { product: "Edg/133.0.0.0" } });',
    '      appendControl("version_replied", { helperPid: helper.pid });',
    '    });',
    '  } else if (message.method === "Browser.close") {',
    '    record.normalClose = true;',
    '    save();',
    '    appendControl("close_received", { helperPid: helper.pid });',
    '    reply({ id: message.id, result: {} });',
    '    appendControl("close_replied", { helperPid: helper.pid });',
    '    fs.closeSync(3);',
    '    fs.closeSync(4);',
    '    appendControl("cdp_pipes_closed", { helperPid: helper.pid });',
    '  }',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  const originalKill = process.kill;
  const originalRmSync = fs.rmSync;
  let killObserverInstalled = false;
  let removeObserverInstalled = false;
  let browser;
  try {
    assert.equal(findBrowser(), fixture.executable);
    browser = await launchBrowser(new AbortController().signal);
    const child = childReceipt(fixture);
    const helper = ownedHelperReceipt(fixture);
    assert.equal(child.helperPid, helper.pid);
    assert.equal(helper.parentPid, child.pid);

    const aliveWithRealKill = (pid) => {
      try {
        originalKill(pid, 0);
        return true;
      } catch (error) {
        if (error.code === 'ESRCH') return false;
        throw error;
      }
    };
    const appendObserved = (type, detail) => {
      fs.appendFileSync(fixture.control, `${JSON.stringify({
        type,
        pid: process.pid,
        at: Date.now(),
        ...detail,
      })}\n`);
    };
    // These observers preserve the real OS signal and filesystem operations;
    // they record only the exact helper escalation and profile-removal seam.
    process.kill = /** @type {typeof process.kill} */ ((pid, signal) => {
      const delivered = originalKill(pid, signal);
      if (pid === helper.pid && signal === 'SIGKILL') {
        appendObserved('helper_sigkill_sent', {
          targetPid: pid,
          signal,
          delivered,
          rootAlive: aliveWithRealKill(child.pid),
          profileExists: fs.existsSync(child.profile),
        });
      }
      return delivered;
    });
    killObserverInstalled = true;
    fs.rmSync = /** @type {typeof fs.rmSync} */ ((target, options) => {
      if (target === child.profile) {
        appendObserved('profile_remove_requested', {
          helperPid: helper.pid,
          helperAlive: aliveWithRealKill(helper.pid),
          profileExists: fs.existsSync(child.profile),
        });
      }
      return originalRmSync(target, options);
    });
    removeObserverInstalled = true;

    // Act
    await browser.close();

    // Assert
    const events = controlEvents(fixture);
    const eventIndex = type => events.findIndex(event => event.type === type);
    const helperSigterms = events.filter(event => event.type === 'helper_sigterm');
    const helperSigkills = events.filter(event => event.type === 'helper_sigkill_sent');
    const rootExit = events.find(event => event.type === 'root_exit');
    const profileRemove = events.find(event => event.type === 'profile_remove_requested');
    assert.equal(helperSigterms.length, 1, `the helper did not receive one real SIGTERM: ${JSON.stringify(events)}`);
    assert.equal(helperSigkills.length, 1, `the helper did not receive one real SIGKILL: ${JSON.stringify(events)}`);
    assert.ok(rootExit, `the root did not report its early exit: ${JSON.stringify(events)}`);
    assert.ok(profileRemove, `profile removal was not observed: ${JSON.stringify(events)}`);
    assert.equal(rootExit.helperAlive, true, `the helper did not outlive its root: ${JSON.stringify(events)}`);
    assert.equal(rootExit.profileExists, true, `the root outlived its profile: ${JSON.stringify(events)}`);
    assert.deepEqual({
      targetPid: helperSigkills[0].targetPid,
      signal: helperSigkills[0].signal,
      delivered: helperSigkills[0].delivered,
      rootAlive: helperSigkills[0].rootAlive,
      profileExists: helperSigkills[0].profileExists,
    }, {
      targetPid: helper.pid,
      signal: 'SIGKILL',
      delivered: true,
      rootAlive: false,
      profileExists: true,
    });
    assert.ok(helperSigkills[0].at - helperSigterms[0].at >= 900,
      `SIGKILL did not follow the one-second graceful bound: ${JSON.stringify(events)}`);
    assert.ok(eventIndex('root_exit') >= 0
      && eventIndex('root_exit') < eventIndex('helper_sigkill_sent')
      && eventIndex('helper_sigkill_sent') < eventIndex('profile_remove_requested'),
      `root exit, helper escalation, and profile removal were out of order: ${JSON.stringify(events)}`);
    assert.ok(profileRemove.at - helperSigkills[0].at < 2_000,
      `the helper exceeded the final cleanup bound: ${JSON.stringify(events)}`);
    assert.equal(profileRemove.helperPid, helper.pid);
    assert.equal(profileRemove.helperAlive, false,
      `profile removal started before the helper was reaped: ${JSON.stringify(events)}`);
    assert.equal(profileRemove.profileExists, true);
    assert.equal(processIsAlive(child.pid), false);
    assert.equal(processIsAlive(helper.pid), false);
    assert.equal(fs.existsSync(child.profile), false);
  } finally {
    if (removeObserverInstalled) fs.rmSync = originalRmSync;
    if (killObserverInstalled) process.kill = originalKill;
    if (browser) await browser.close().catch(() => {});
    await removeOwnedBrowser(fixture);
  }
});

test('cleanup that cannot confirm an owned helper still removes the profile and still reports uncertainty', {
  skip: POSIX_ONLY,
  timeout: 15_000,
  concurrency: false,
}, async (context) => {
  // Arrange: a real owned helper outlives its root and receives real signals.
  // Only the liveness probe for that one pid answers EPERM, which is what POSIX
  // returns when a snapshot pid has been recycled by another user. That is the
  // documented branch where cleanup keeps a pid it cannot clear, so both bounded
  // waits expire and close() reports uncertainty. The profile must go anyway.
  const helperProgram = [
    "const fs = require('node:fs');",
    'const [receipt, control] = process.argv.slice(1);',
    'function append(type, detail = {}) {',
    '  fs.appendFileSync(control, JSON.stringify({ type, pid: process.pid, at: Date.now(), ...detail }) + "\\n");',
    '}',
    "process.on('SIGTERM', () => { append('helper_sigterm'); });",
    'fs.writeFileSync(receipt, JSON.stringify({ pid: process.pid, parentPid: process.ppid }));',
    "append('helper_ready', { parentPid: process.ppid });",
    'setInterval(() => {}, 1_000);',
  ].join('\n');
  const fixture = installOwnedBrowser([
    "const { spawn } = require('node:child_process');",
    `const helperProgram = ${JSON.stringify(helperProgram)};`,
    "const helperNull = fs.openSync('/dev/null', 'r+');",
    "const helper = spawn(process.execPath, ['-e', helperProgram, helperReceipt, control], {",
    "  stdio: ['ignore', 'ignore', 'ignore', helperNull, helperNull] });",
    'fs.closeSync(helperNull);',
    'record.helperPid = helper.pid;',
    'save();',
    'function withReadyHelper(action) {',
    '  if (fs.existsSync(helperReceipt)) { action(); return; }',
    '  setTimeout(() => withReadyHelper(action), 5);',
    '}',
    'readCommands((message) => {',
    '  if (message.method === "Browser.getVersion") {',
    '    withReadyHelper(() => reply({ id: message.id, result: { product: "Edg/133.0.0.0" } }));',
    '  } else if (message.method === "Browser.close") {',
    '    record.normalClose = true;',
    '    save();',
    '    reply({ id: message.id, result: {} });',
    '  }',
    '});',
    'setInterval(() => {}, 1_000);',
  ].join('\n'), { includeOriginalPath: true });
  const originalKill = process.kill;
  const originalRmSync = fs.rmSync;
  let killObserverInstalled = false;
  let removeObserverInstalled = false;
  let browser;
  let failure;
  /** @type {Array<{signal:unknown, at:number}>} */
  const helperSignals = [];
  /** @type {Array<{target:string, options:unknown}>} */
  const removals = [];
  try {
    assert.equal(findBrowser(), fixture.executable);
    browser = await launchBrowser(new AbortController().signal);
    const child = childReceipt(fixture);
    const helper = ownedHelperReceipt(fixture);
    assert.equal(helper.parentPid, child.pid);
    process.kill = /** @type {typeof process.kill} */ ((pid, signal) => {
      if (pid !== helper.pid) return originalKill(pid, signal);
      if (signal === 0) {
        const denied = new Error('kill EPERM');
        /** @type {any} */ (denied).code = 'EPERM';
        throw denied;
      }
      helperSignals.push({ signal, at: Date.now() });
      return originalKill(pid, signal);
    });
    killObserverInstalled = true;
    fs.rmSync = /** @type {typeof fs.rmSync} */ ((target, options) => {
      if (typeof target === 'string' && target === child.profile) removals.push({ target, options });
      return originalRmSync(target, options);
    });
    removeObserverInstalled = true;

    // Act
    const started = performance.now();
    try {
      await browser.close();
    } catch (error) {
      failure = error;
    }
    const closeMs = performance.now() - started;
    process.kill = originalKill;
    killObserverInstalled = false;
    fs.rmSync = originalRmSync;
    removeObserverInstalled = false;

    // Assert
    const events = controlEvents(fixture);
    const helperSigterms = events.filter(event => event.type === 'helper_sigterm');
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_failed');
    assert.deepEqual(failure.detail, {
      stage: 'cleanup',
      signal: 'SIGTERM',
      cleanupUncertain: true,
    }, 'an unconfirmed owned process must still be reported as uncertain cleanup');
    assert.equal(helperSigterms.length, 1,
      `the helper did not receive one real SIGTERM: ${JSON.stringify(events)}`);
    assert.deepEqual(helperSignals.map(({ signal }) => signal), ['SIGTERM', 'SIGKILL'],
      'the SIGTERM then SIGKILL escalation must survive');
    assert.ok(helperSignals[1].at - helperSignals[0].at >= 900,
      `SIGKILL did not follow the one-second graceful bound: ${helperSignals[1].at - helperSignals[0].at}ms`);
    assert.ok(closeMs >= 2_900 && closeMs < 9_000,
      `cleanup did not spend both bounded waits and stay bounded: ${closeMs}ms`);
    assert.deepEqual(removals.map(({ target, options }) => ({ target, options })), [{
      target: child.profile,
      // The retry lives inside this single fs.rmSync call, so the options it is
      // given are the only observable proof that a concurrent write into the
      // tree cannot leak the profile on one ENOTEMPTY.
      options: { recursive: true, force: true, maxRetries: 4, retryDelay: 50 },
    }], 'uncertain cleanup must still attempt exactly one bounded profile removal');
    assert.equal(fs.existsSync(child.profile), false,
      'uncertain cleanup must not leak the owned profile');
    assert.equal(processIsAlive(child.pid), false);
    assert.equal(processIsAlive(helper.pid), false);
    context.diagnostic(JSON.stringify({ closeMs, helperSignals }));
  } finally {
    if (removeObserverInstalled) fs.rmSync = originalRmSync;
    if (killObserverInstalled) process.kill = originalKill;
    if (browser) await browser.close().catch(() => {});
    await removeOwnedBrowser(fixture);
  }
});

test('a browser executable that cannot be executed removes the profile its launch created', {
  skip: POSIX_ONLY,
  timeout: 10_000,
  concurrency: false,
}, async () => {
  // Arrange: the executable is discoverable, but its shebang's interpreter
  // path traverses a regular file. spawn throws ENOTDIR synchronously on both
  // Darwin and Linux, without execvp's ENOEXEC shell fallback. The product
  // creates its owned profile before attempting this spawn.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-browser-process-test-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const executable = path.join(bin, 'microsoft-edge');
  const notDirectory = path.join(root, 'not-a-directory');
  fs.writeFileSync(notDirectory, '');
  fs.writeFileSync(executable, `#!${path.join(notDirectory, 'interpreter')}\n`, { mode: 0o755 });
  const originalPath = process.env.PATH;
  const originalMkdtempSync = fs.mkdtempSync;
  /** @type {string[]} */
  const profiles = [];
  process.env.PATH = bin;
  fs.mkdtempSync = /** @type {typeof fs.mkdtempSync} */ ((prefix, ...rest) => {
    const directory = originalMkdtempSync.call(fs, prefix, ...rest);
    if (typeof prefix === 'string' && path.basename(prefix) === 'dude-review-browser-') {
      profiles.push(String(directory));
    }
    return directory;
  });
  let failure;
  try {
    assert.equal(findBrowser(), executable);

    // Act
    try {
      await launchBrowser(new AbortController().signal);
    } catch (error) {
      failure = error;
    }

    // Assert
    assert.ok(failure instanceof ReviewError);
    assert.equal(failure.code, 'review_capture_failed');
    assert.deepEqual(failure.detail, { stage: 'launch' },
      'a removed profile must not report cleanup uncertainty');
    assert.equal(profiles.length, 1, 'the refused launch created exactly one owned profile');
    assert.equal(fs.existsSync(profiles[0]), false,
      'a launch that never reaches close() must still remove the profile it created');
  } finally {
    fs.mkdtempSync = originalMkdtempSync;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    for (const profile of profiles) fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
