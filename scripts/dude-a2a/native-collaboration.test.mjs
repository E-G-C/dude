// @ts-check
/**
 * Controlled checks for the native qualification branch
 * (scripts/dude-a2a/native-collaboration.mjs). Nothing here starts a Copilot
 * runtime, model, observer, ETW session, or listener. Terminals, the public
 * SDK, the observer, the calibration helper, and the clock are labeled test
 * seams; a run that uses any of them reports `controlled_test` and can never
 * qualify. Certificates and tokens are synthetic and test-owned. Fixture
 * preparation renders this repository's source into disposable folders only.
 * A scripted host plays the control runtime (its model-less discovery and its
 * one after-view session's public events, permission request, loaded
 * sources, and observed reads), both mains, B's product records, and its
 * served worker (its readiness record with its session storage, and that
 * storage's observed files), so controlled orchestration slices run from
 * consent through the after-view control, startup, the held call and
 * progress, the answer, capture, cancellation, and the final observer stop.
 * Each fault varies one scripted public observation; none is a production
 * field, flag, or proof input. One check drives the actual T009/T010 worker
 * module with a fake SDK to prove that the releases written here are exactly
 * what it waits for and that its recorded session storage is what this runner
 * validates. The fixed fixture's Git canary is judged from the actual files of
 * the control tree and of that worker's own copy, never from a scripted
 * metadata answer, and no Git runs. These checks are not native evidence.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import crypto, { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import { createA2a, parseA2aConfig, A2A_PROPOSAL_BYTES } from '../../src/extensions/dude/lib/a2a.mjs';
import { WORKER_BOUNDS, WORKER_TOOLS, startEvidenceWorker } from '../../src/extensions/dude/lib/a2a-peer-worker.mjs';
import {
  NATIVE_LIMITS, NativeStop, SDK_EVENT_TYPES, actionBlock, approvalAction, boundReport, canaryReads, canaryRecognition, capturePrompt, checkAfterViewControl, checkAnsweredJournal, checkCancellation,
  checkInstructionOrder, checkNormalPreflight, checkPending, checkPreflight, checkProgress, checkReceipt, checkServedJournal, checkWorkerCleanup, consentLiteral,
  controlPermissionRelay, controlSources, controlTurnOver, conversationCalls, createSessionLog, currentWorkspace, descendantsOf, evidenceReleaseOf, exchangePrompt,
  humanQueue, immediateTimings, journalPathOf, journalTimings, layoutOf, matchControlPermission, matchPermission, nativeResult, normalEnvironment, observationDigest,
  permissionRelay, permissionTarget, prepareFixtures, processTree, proposalOf, readAccount, readLiteralLine, recordedWorkspace, refusedEvents, runNativeQualification,
  runtimeEnvironment, startupReleaseOf, summarizeEvent, terminalLines, terminalSafe, writeRelease,
} from './native-collaboration.mjs';
import {
  AFTER_VIEW_CONTROL, CANARIES, PROGRESS_FIXTURES, afterViewPrompt, fixtureManifest, nativeScope, renderedCore,
} from './qualify-collaboration.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NATIVE = path.join(HERE, 'native-collaboration.mjs');
const REPOSITORY = path.resolve(HERE, '..', '..');
/** @param {Buffer | string} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A short test-owned folder by its real path. @param {string} [prefix] */
function tempDir(prefix = 'dude-nq-') {
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  scratch.push(directory);
  return directory;
}

// ---------------------------------------------------------------------------
// Test-owned certificates: real self-signed X.509 over fresh P-256 keys.
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
/** @param {Buffer} bytes */
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
/** @param {string} commonName */
function certificate(commonName) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const serial = crypto.randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x01;
  const name = sequence(der(0x31, sequence(objectId('2.5.4.3'), der(0x0c, Buffer.from(commonName, 'utf8')))));
  const now = Date.now();
  const tbs = sequence(der(0xa0, integer(Buffer.from([2]))), integer(serial), ECDSA_SHA256, name, sequence(utcTime(now - 86_400_000), utcTime(now + 86_400_000)),
    name, /** @type {Buffer} */ (publicKey.export({ type: 'spki', format: 'der' })));
  const raw = sequence(tbs, ECDSA_SHA256, der(0x03, Buffer.from([0]), crypto.sign('sha256', tbs, privateKey)));
  const lines = /** @type {string[]} */ (raw.toString('base64').match(/.{1,64}/g));
  return {
    certPem: `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`,
    keyPem: String(privateKey.export({ type: 'pkcs8', format: 'pem' })),
    pin: sha256(raw),
  };
}

// ---------------------------------------------------------------------------
// A complete version-2 plan over disposable artifacts and its native scope.
// ---------------------------------------------------------------------------

/**
 * A complete plan: a fake CLI file and runtime payload nothing executes, a
 * fake SDK whose files would leave a marker if anything imported them,
 * test-owned certificates and tokens outside every workspace, and a new
 * fixture parent. A null payload is refused natively, so the plan names one.
 * Its scope stays valid for `expiresInMs`, an hour by default.
 * @param {{expiresInMs?: number}} [options]
 */
function planFixture({ expiresInMs = 3_600_000 } = {}) {
  const base = tempDir('dude-nqp-');
  const tools = path.join(base, 'tools');
  const sdk = path.join(tools, 'copilot-sdk');
  const owners = path.join(base, 'owners');
  const marker = path.join(base, 'sdk-imported.marker');
  fs.mkdirSync(sdk, { recursive: true });
  fs.mkdirSync(owners, { recursive: true });
  const cli = path.join(tools, 'copilot.exe');
  fs.writeFileSync(cli, 'fixture launcher bytes; never executed\n');
  const payload = path.join(tools, 'runtime', 'index.js');
  fs.mkdirSync(path.dirname(payload));
  fs.writeFileSync(payload, 'fixture payload bytes; never loaded\n');
  for (const name of ['index.js', 'extension.js']) {
    fs.writeFileSync(path.join(sdk, name), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(name)});\n`);
  }
  const certs = { a: certificate('Dude native test peer A'), b: certificate('Dude native test peer B') };
  /** @param {string} name @param {string} content */
  const owner = (name, content) => {
    const file = path.join(owners, name);
    fs.writeFileSync(file, content);
    return file;
  };
  const plan = {
    version: 2,
    expiresAt: new Date(Date.now() + expiresInMs).toISOString().slice(0, 19) + 'Z',
    operator: 'Fixture Operator',
    coordinator: 'Fixture Coordinator',
    fixtureParent: path.join(base, 'f'),
    artifacts: { cli, runtimePayload: payload, sdk, sdkAppliedAt: 'createSession' },
    models: { a: 'fixture-model-a', b: 'fixture-model-b', worker: 'fixture-model-worker' },
    credentials: { a: owner('a-token.txt', 'fixture-token-a\n'), b: owner('b-token.txt', 'fixture-token-b\n'), worker: owner('w-token.txt', 'fixture-token-w\n') },
    tls: {
      a: { certFile: owner('a-cert.pem', certs.a.certPem), keyFile: owner('a-key.pem', certs.a.keyPem) },
      b: { certFile: owner('b-cert.pem', certs.b.certPem), keyFile: owner('b-key.pem', certs.b.keyPem) },
    },
    transport: { port: 18_443, projectId: 'dude-number-poc' },
    progress: { a: { ...PROGRESS_FIXTURES.a }, b: { ...PROGRESS_FIXTURES.b } },
    capture: { slug: 'delta' },
    observation: 'windows-etw',
  };
  const planFile = path.join(base, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
  return { base, plan, planFile, cli, payload, sdk, marker, certs, owners };
}

/** The validated scope of a plan fixture, as the runner passes it. @param {ReturnType<typeof planFixture>} f */
function scopeOf(f) {
  const scoped = nativeScope({ file: f.planFile, repoRoot: path.join(f.base, 'not-the-repository') });
  assert.ok(scoped.scope, JSON.stringify(scoped.report.checks.filter((/** @type {any} */ check) => !['ok', 'not_inspected'].includes(check.status))));
  return { scope: /** @type {any} */ (scoped.scope), plan: scoped.plan };
}

// ---------------------------------------------------------------------------
// A scripted terminal: keystrokes arrive one per event, after a human gap.
// ---------------------------------------------------------------------------

/**
 * @param {Array<string | {paste: string} | {eof: true} | {key: string} | {type: string, before: () => void} | {hold: () => void}>} answers One answer
 *   per prompt, typed key by key; `before` runs when that prompt is shown, before the first keystroke; `hold` runs when that prompt is
 *   shown, and nothing is typed for it.
 * @param {{tty?: boolean, onUnscripted?: (prompt: string) => void}} [options] Without `onUnscripted`, a prompt that finds no answer
 *   left waits out its own bound. With it, that prompt is kept in `unscripted`, reported to `onUnscripted` at once, and answered
 *   with EOF, so a run that asks more than its test scripted ends promptly and its test can say so.
 */
function fakeTerminal(answers, { tty = true, onUnscripted } = {}) {
  let now = 1_000_000;
  const input = Object.assign(new EventEmitter(), {
    isTTY: tty, readableEnded: false, destroyed: false, readableLength: 0, raw: false,
    /** @param {boolean} mode */
    setRawMode(mode) { input.raw = mode; },
    resume() {},
    pause() {},
  });
  let output = '';
  const prompts = /** @type {string[]} */ ([]);
  const unscripted = /** @type {string[]} */ ([]);
  const terminal = {
    input,
    output: { isTTY: tty, write: (/** @type {string} */ text) => { output += text; return true; } },
    clock: () => now,
    get text() { return output; },
    prompts,
    unscripted,
  };
  const original = input.on.bind(input);
  input.on = /** @type {any} */ ((/** @type {string} */ event, /** @type {(...args: any[]) => void} */ listener) => {
    original(event, listener);
    if (event !== 'data') return input;
    const prompt = output.slice(output.lastIndexOf('\n') + 1);
    prompts.push(prompt);
    const answer = answers.shift();
    if (answer === undefined && onUnscripted) {
      unscripted.push(prompt);
      onUnscripted(prompt);
      setImmediate(() => input.emit('end'));
      return input;
    }
    setImmediate(() => {
      if (answer === undefined) return;
      if (typeof answer === 'object' && 'eof' in answer) return void input.emit('end');
      if (typeof answer === 'object' && 'hold' in answer) return void answer.hold();
      if (typeof answer === 'object' && 'paste' in answer) {
        now += 5_000;
        return void input.emit('data', Buffer.from(answer.paste));
      }
      if (typeof answer === 'object' && 'key' in answer) {
        now += 5_000;
        return void input.emit('data', Buffer.from(answer.key));
      }
      if (typeof answer === 'object' && 'before' in answer) answer.before();
      const keys = [...(typeof answer === 'string' ? answer : answer.type), '\r'];
      const typeNext = () => {
        const key = keys.shift();
        if (key === undefined) return;
        now += 400;
        input.emit('data', Buffer.from(key));
        setImmediate(typeNext);
      };
      typeNext();
    });
    return input;
  });
  return terminal;
}

/** The rule above and below every action block. */
const RULE = '='.repeat(60);
/**
 * One complete action block as the human sees it right before a prompt, its bare `> ` prompt included, written out here from the
 * operator contract rather than taken from the module under test.
 * @param {string[]} lines Everything between the two rules.
 */
const shownBlock = (lines) => [RULE, ...lines, RULE, '> '].join('\n');
/** How many action blocks in `text` ask for exactly `line`. @param {string} text @param {string} line */
const blocksFor = (text, line) => text.split(`\nType or paste this line, then press Enter:\n\n    ${line}\n\n`).length - 1;

test('importing the native branch starts nothing; it has no route to kill, delete, approve all, or load an SDK except the plan\'s own', () => {
  const source = fs.readFileSync(NATIVE, 'utf8');
  const imports = [...source.matchAll(/^import [^;]*? from '([^']+)';$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(imports, [
    '../../src/extensions/dude/lib/a2a-collaboration.mjs', '../../src/extensions/dude/lib/a2a-peer-worker.mjs',
    '../../src/extensions/dude/lib/a2a-transcript.mjs', '../../src/extensions/dude/lib/a2a.mjs', '../build-release.mjs', './qualify-collaboration.mjs',
    'node:child_process', 'node:crypto', 'node:fs', 'node:path', 'node:url',
  ], 'no static SDK import: the public SDK loads only from the plan\'s hashed folder after consent');
  assert.deepEqual([...source.matchAll(/\bimport\(([^;]*)\);/g)].map((match) => match[1]), ['pathToFileURL(entry.path).href'],
    'the only dynamic import is the plan SDK entry, rechecked against its scope digest');
  assert.doesNotMatch(source, /\bprocess\.kill\b|taskkill|\.kill\(|TerminateProcess/, 'no process is signalled or killed');
  assert.doesNotMatch(source, /\bfs\.(?:rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync)\b|removeTree/, 'nothing is deleted');
  assert.doesNotMatch(source, /approveAll|approve-for-session|approve-permanently|approve-for-location|setApproveAll|modifyRules/,
    'only approve-once exists, and no permission rule is changed: typed by the human, or given by the main relay to a consented step\'s exact Dude tool call');
  const spawned = [...source.matchAll(/\bspawn(?:Process)?\(([^,]+),/g)].map((match) => match[1].trim()).sort();
  assert.deepEqual(spawned, ['executable', 'process.execPath'], 'only the fixed PowerShell observer and this Node as the calibration helper');
  assert.match(source, /path\.join\(systemRoot, 'System32', 'WindowsPowerShell', 'v1\.0', 'powershell\.exe'\)/);
  assert.doesNotMatch(source, /source: ['"]/, 'a relayed approval never carries an invented source attribution');
});

test('a literal line is read only from an interactive terminal, typed key by key or pasted as one line after the prompt', async () => {
  /** @param {Parameters<typeof fakeTerminal>[0]} answers @param {Parameters<typeof fakeTerminal>[1]} [options] */
  const read = async (answers, options) => {
    const terminal = fakeTerminal(answers, options);
    return { result: await readLiteralLine(terminal, 'Type it: ', { timeoutMs: 2_000 }), terminal };
  };
  const literal = 'approve native 0123456789abcdef';
  assert.deepEqual((await read([literal])).result, { ok: true, line: literal });
  assert.deepEqual((await read(['abx\u007fc'])).result, { ok: true, line: 'abc' }, 'backspace edits the typed line');
  assert.deepEqual((await read(['x'], { tty: false })).result, { ok: false, reason: 'not_interactive' }, 'redirected input never answers');
  assert.deepEqual((await read([{ eof: true }])).result, { ok: false, reason: 'input_eof' });
  // A pasted line is the human's own input too: one line, ended by CR, LF, or CRLF (counted once), arrives in one chunk and is
  // accepted exactly as pasted and echoed once. Only its leading and trailing spaces, which a copy often adds, are dropped.
  for (const ending of ['\r', '\n', '\r\n']) {
    const pasted = await read([{ paste: `${literal}${ending}` }]);
    assert.deepEqual(pasted.result, { ok: true, line: literal }, `one pasted line ended by ${JSON.stringify(ending)}`);
    assert.ok(pasted.terminal.text.endsWith(`Type it: ${literal}\n`), `${JSON.stringify(ending)}: the pasted line is echoed once`);
  }
  assert.deepEqual((await read([{ paste: `  ${literal}   \r\n` }])).result, { ok: true, line: literal }, 'surrounding spaces from a copy are dropped');
  assert.deepEqual((await read([{ paste: 'approve  native\r' }])).result, { ok: true, line: 'approve  native' }, 'nothing else is changed');
  assert.deepEqual((await read([{ paste: `${literal}\r\n\r\n` }])).result, { ok: true, line: literal }, 'further line ends add no text');
  assert.deepEqual((await read([{ paste: 'abx\u007fc\r' }])).result, { ok: true, line: 'abc' }, 'a backspace inside a paste edits it');
  // More text after the line's end in the same chunk is a multi-line paste: refused whole, never accepted in part.
  for (const paste of [`${literal}\r\nsecond line\r\n`, `${literal}\nx`, `${literal}\r `, `\r\n${literal}\r\n`]) {
    assert.deepEqual((await read([{ paste }])).result, { ok: false, reason: 'input_multiline' }, JSON.stringify(paste));
  }
  assert.deepEqual((await read([{ paste: `${'z'.repeat(NATIVE_LIMITS.lineChars + 1)}\r` }])).result, { ok: false, reason: 'input_too_long' },
    'a paste is bounded like typing');
  assert.deepEqual((await read([{ key: '\u0003' }])).result, { ok: false, reason: 'input_cancelled' });
  assert.deepEqual((await read([{ key: '\u0004' }])).result, { ok: false, reason: 'input_cancelled' });
  assert.deepEqual((await read([{ paste: 'appro\u0003' }])).result, { ok: false, reason: 'input_cancelled' }, 'Ctrl+C inside a paste cancels');
  assert.deepEqual((await read([{ key: '\u001b' }])).result, { ok: false, reason: 'input_unsupported' });
  for (const paste of ['\u001b[A', 'approve\u001b[D native\r', 'approve\tnative\r', 'approve native \u00e9\r']) {
    assert.deepEqual((await read([{ paste }])).result, { ok: false, reason: 'input_unsupported' },
      `${JSON.stringify(paste)}: an escape sequence, another control character, or a non-ASCII character refuses`);
  }
  assert.deepEqual((await read(['z'.repeat(NATIVE_LIMITS.lineChars + 1)])).result, { ok: false, reason: 'input_too_long' });
  assert.deepEqual((await read([])).result.ok, false, 'no answer within the bound times out');
  // The caller's own deadline ends a shown read at once, whatever the read's own timer, and releases the terminal.
  const reached = new AbortController();
  const waiting = fakeTerminal([]);
  try {
    const reading = readLiteralLine(waiting, 'Type it: ', { timeoutMs: 60_000, signal: reached.signal });
    reached.abort();
    assert.deepEqual(await within(reading, 2_000), { ok: false, reason: 'input_timeout' }, 'the caller\'s deadline ends the read');
    assert.deepEqual(['data', 'end', 'close'].map((name) => waiting.input.listenerCount(name)), [0, 0, 0], 'its listeners are released');
    assert.equal(waiting.input.raw, false, 'and raw mode reset');
  } finally {
    // Ending the input ends any read still outstanding, so a regression fails here by assertion and leaves no 60-second timer behind.
    waiting.input.emit('end');
  }
  const passed = new AbortController();
  passed.abort();
  const unseen = fakeTerminal([]);
  try {
    // Bounded like the in-flight case above: a read that ignored the already-passed deadline would wait out its own 60-second bound,
    // so a miss is an assertion here, never a test timeout.
    assert.deepEqual(await within(readLiteralLine(unseen, 'Type it: ', { timeoutMs: 60_000, signal: passed.signal }), 2_000),
      { ok: false, reason: 'input_timeout' });
    assert.equal(unseen.text, '', 'a deadline already past shows no prompt');
    assert.deepEqual(['data', 'end', 'close'].map((name) => unseen.input.listenerCount(name)), [0, 0, 0], 'and leaves nothing listening');
  } finally {
    unseen.input.emit('end');
  }
  // A read that finished on its own leaves nothing listening on the caller's signal.
  const kept = new AbortController();
  assert.deepEqual(await within(readLiteralLine(fakeTerminal(['x']), 'Type it: ', { timeoutMs: 60_000, signal: kept.signal }), 3_000), { ok: true, line: 'x' });
  assert.equal(getEventListeners(kept.signal, 'abort').length, 0, 'its abort listener is removed');
});

// Input entered before a prompt, or sooner than a person could react to it, never counts and never ends the read: it is dropped with
// one notice while the prompt keeps waiting for a fresh line.

/** The notice, written out here from the operator contract rather than taken from the module under test. */
const EARLY_NOTICE = '(Input received before this prompt was ignored. Enter the line now.)';

/**
 * A terminal on a real Node stream, so text written to `input` before a read waits in the stream's own buffer as console type-ahead
 * does. The test sets the clock the reader sees with `at`.
 */
function streamTerminal() {
  const input = Object.assign(new PassThrough(), { isTTY: true, raw: false, setRawMode(/** @type {boolean} */ mode) { input.raw = mode; } });
  let output = '';
  let now = 0;
  return {
    input,
    output: { isTTY: true, write: (/** @type {string} */ text) => { output += text; return true; } },
    clock: () => now,
    /** @param {number} ms */
    at(ms) { now = ms; },
    get text() { return output; },
  };
}

test('early input: type-ahead waiting before the prompt is dropped with one notice, and a fresh line typed after the gap is taken exactly', async () => {
  const literal = 'approve native 0123456789abcdef';
  const terminal = streamTerminal();
  // Another scope's line, Enter included, entered while the run was still working: it waits in the stream until this prompt's read.
  terminal.input.write('approve native 0000000000000000\r');
  assert.ok(terminal.input.readableLength > 0, 'the type-ahead is waiting');
  const reading = readLiteralLine(terminal, 'Type it: ', { timeoutMs: 2_000 });
  terminal.at(NATIVE_LIMITS.humanGapMs);
  for (const key of [...literal, '\r']) terminal.input.write(key);
  assert.deepEqual(await reading, { ok: true, line: literal }, 'only the line typed after the prompt answers it');
  assert.equal(terminal.input.readableLength, 0, 'nothing is left waiting');
  assert.equal(terminal.text, `${EARLY_NOTICE}\nType it: ${literal}\n`, 'the notice once, then the prompt; the dropped text is never echoed');
});

test('early input: chunks arriving within the human gap after the prompt are dropped the same way and never join the accepted line', async () => {
  const literal = 'approve native 0123456789abcdef';
  const terminal = fakeTerminal([]);
  let now = 0;
  terminal.clock = () => now;
  const reading = readLiteralLine(terminal, 'Type it: ', { timeoutMs: 2_000 });
  /** @param {string} text */
  const arrive = (text) => terminal.input.emit('data', Buffer.from(text));
  // What the console held from before the prompt arrives as soon as the read starts: another scope's whole line, Enter included,
  arrive('approve native 0000000000000000\r');
  // and the start of a line still sooner than a person could react.
  now = NATIVE_LIMITS.humanGapMs - 1;
  arrive('appr');
  now = NATIVE_LIMITS.humanGapMs;
  for (const key of [...literal, '\r']) arrive(key);
  assert.deepEqual(await reading, { ok: true, line: literal }, 'neither early chunk ends the line or becomes part of it');
  assert.equal(terminal.text, `Type it: \n${EARLY_NOTICE}\nType it: ${literal}\n`,
    'one notice for both chunks, the prompt shown again below it, and only the fresh line echoed');
});

test('early input: a line entered only before the prompt is never accepted; with nothing after it, the read ends at its deadline as input_timeout', async () => {
  const timeoutMs = 300;
  const early = 'approve native 0123456789abcdef\r';
  // Waiting in the stream when the prompt is shown.
  const buffered = streamTerminal();
  buffered.input.write(early);
  const fromBuffer = readLiteralLine(buffered, 'Type it: ', { timeoutMs });
  assert.deepEqual(await within(fromBuffer, timeoutMs / 3), { kind: 'no_answer' }, 'buffered type-ahead neither answers nor ends the read');
  assert.deepEqual(await fromBuffer, { ok: false, reason: 'input_timeout' });
  assert.equal(buffered.text, `${EARLY_NOTICE}\nType it: \n`);
  // Held by the console and delivered the moment the read starts.
  const held = fakeTerminal([]);
  held.clock = () => 0;
  const fromConsole = readLiteralLine(held, 'Type it: ', { timeoutMs });
  held.input.emit('data', Buffer.from(early));
  assert.deepEqual(await within(fromConsole, timeoutMs / 3), { kind: 'no_answer' }, 'a console-held line neither answers nor ends the read');
  assert.deepEqual(await fromConsole, { ok: false, reason: 'input_timeout' });
  assert.equal(held.text, `Type it: \n${EARLY_NOTICE}\nType it: \n`);
  assert.deepEqual(['data', 'end', 'close'].map((name) => held.input.listenerCount(name)), [0, 0, 0], 'the terminal is released');
  assert.equal(held.input.raw, false);
});

/**
 * Native runs with labeled seams. Any adapter makes the run a controlled test.
 * @param {ReturnType<typeof planFixture>} f @param {Record<string, any>} adapters
 */
async function controlled(f, adapters) {
  const { scope, plan } = scopeOf(f);
  const calls = { loadSdk: 0, startObserver: 0, runHelper: 0, observerClose: 0 };
  const result = await runNativeQualification({
    scope,
    plan,
    adapters: {
      platform: 'win32',
      rescope: () => nativeScope({ file: f.planFile, repoRoot: path.join(f.base, 'not-the-repository') }),
      loadSdk: async () => { calls.loadSdk += 1; throw new Error('the SDK must not load in this case'); },
      startObserver: () => {
        calls.startObserver += 1;
        return { pid: 4_444, ready: Promise.resolve({ ok: false, reason: 'observer_unavailable' }), snapshot: async () => { throw new Error('not ready'); },
          stop: async () => { throw new Error('not ready'); }, close: async () => { calls.observerClose += 1; return { exited: true, code: 0 }; } };
      },
      runHelper: async () => { calls.runHelper += 1; return { pid: 1 }; },
      ...adapters,
    },
  });
  return { ...result, calls, scope };
}

test('nothing native happens without fresh literal consent for the exact scope, and a controlled run can never qualify', async () => {
  /** @type {Array<[string, () => any, string, string]>} */
  const cases = [
    ['a non-Windows host', () => ({ platform: 'linux', terminal: fakeTerminal([]) }), 'platform_unsupported', 'refused'],
    ['redirected input', () => ({ terminal: fakeTerminal(['x'], { tty: false }) }), 'consent_not_interactive', 'refused'],
    ['EOF', () => ({ terminal: fakeTerminal([{ eof: true }]) }), 'consent_refused', 'refused'],
    ['a pasted line that is not this scope\'s literal', () => ({ terminal: fakeTerminal([{ paste: 'approve native\r' }]) }), 'consent_refused', 'refused'],
    ['another scope\'s literal', () => ({ terminal: fakeTerminal(['approve native 0000000000000000']) }), 'consent_refused', 'refused'],
    ['the whole plan typed instead', () => ({ terminal: fakeTerminal(['{"version":2}']) }), 'consent_refused', 'refused'],
  ];
  for (const [label, adapters, reason, verdict] of cases) {
    const f = planFixture();
    const result = await controlled(f, adapters());
    assert.equal(result.exitCode, 4, label);
    assert.equal(result.report.reason, reason, `${label}: ${result.report.detail}`);
    assert.equal(result.report.verdict, verdict === 'refused' ? 'controlled_only' : verdict, label);
    assert.match(result.report.layer, /^controlled_test/, label);
    assert.deepEqual(result.calls, { loadSdk: 0, startObserver: 0, runHelper: 0, observerClose: 0 }, `${label}: nothing native started`);
    assert.equal(fs.existsSync(f.plan.fixtureParent), false, `${label}: no fixture was prepared`);
    assert.equal(fs.existsSync(f.marker), false, `${label}: the SDK was never imported`);
    assert.equal(result.report.consent.status, 'not_given', label);
  }
  // The exact literal names the scope digest; even then a changed or expired scope stops before any effect.
  for (const [label, change, reason] of /** @type {Array<[string, (f: any) => void, string]>} */ ([
    ['a plan changed after consent', (f) => { fs.appendFileSync(f.planFile, '\n'); }, 'scope_stale'],
    ['an SDK file changed after consent', (f) => { fs.appendFileSync(path.join(f.sdk, 'extension.js'), '\n'); }, 'scope_stale'],
  ])) {
    const f = planFixture();
    const { scope } = scopeOf(f);
    const terminal = fakeTerminal([consentLiteral(scope.scopeSha256)]);
    const result = await controlled(f, {
      terminal,
      rescope: () => {
        change(f);
        return nativeScope({ file: f.planFile, repoRoot: path.join(f.base, 'not-the-repository') });
      },
    });
    assert.equal(result.report.consent.status, 'granted', label);
    assert.equal(result.report.reason, reason, `${label}: ${result.report.detail}`);
    assert.deepEqual(result.calls, { loadSdk: 0, startObserver: 0, runHelper: 0, observerClose: 0 }, label);
    assert.equal(fs.existsSync(f.plan.fixtureParent), false, label);
  }
  const expired = planFixture();
  const { scope } = scopeOf(expired);
  const late = await controlled(expired, {
    terminal: fakeTerminal([consentLiteral(scope.scopeSha256)]),
    rescope: () => ({ scope: null, expired: true }),
  });
  assert.equal(late.report.reason, 'scope_expired');
  assert.equal(fs.existsSync(expired.plan.fixtureParent), false);
});

test('the consent prompt is a bare "> " right under an action block naming this scope\'s exact consent line, and a pasted copy of that line, with its line end and surrounding spaces, consents', async () => {
  const f = planFixture();
  const { scope } = scopeOf(f);
  const literal = consentLiteral(scope.scopeSha256);
  const terminal = fakeTerminal([{ paste: `  ${literal} \r\n` }]);
  // The scope reads as expired right after consent, so the run stops there and prepares nothing: only the consent ask is judged.
  const result = await controlled(f, { terminal, rescope: () => ({ scope: null, expired: true }) });
  assert.deepEqual([result.report.consent.status, result.report.consent.literalSha256, result.report.reason], ['granted', sha256(literal), 'scope_expired'],
    'the pasted line, without its surrounding spaces, is exactly this scope\'s literal');
  assert.deepEqual(result.calls, { loadSdk: 0, startObserver: 0, runHelper: 0, observerClose: 0 }, 'nothing native started');
  assert.deepEqual(terminal.prompts, ['> '], 'the prompt itself is only "> "');
  const footer = 'Nothing has run yet. Entering the line shown under ACTION NEEDED below authorizes exactly this scope; anything else refuses and '
    + 'changes nothing.\n';
  const block = shownBlock(['ACTION NEEDED: Approve this run\'s scope', 'Type or paste this line, then press Enter:', '', `    ${literal}`, '',
    'Anything else refuses; nothing has run yet. Time limit: 10 minutes.']);
  assert.ok(terminal.text.includes(`\nScope digest: ${scope.scopeSha256}\n`), 'the whole scope is shown first');
  assert.ok(terminal.text.includes(`${footer}${block}  ${literal} \n`),
    `the scope's last line points to the block that follows it at once, and the pasted line is echoed as entered:\n${terminal.text.slice(-800)}`);
  assert.equal(blocksFor(terminal.text, literal), 1, 'one block, naming the literal exactly');
});

// ---------------------------------------------------------------------------
// The fixed fixture as files: what the control tree and a worker's own copy hold.
// ---------------------------------------------------------------------------

/** Every file below `root`, as sorted `/`-separated relative paths. @param {string} root @param {string} [prefix] @returns {string[]} */
function filesBelow(root, prefix = '') {
  return fs.readdirSync(path.join(root, ...prefix.split('/')), { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesBelow(root, relative) : [relative];
  }).sort();
}

/**
 * Why the Git canary below `work` is not a minimal valid repository, or []
 * when it is, judged from the actual files; no Git runs. Git recognizes `.git`
 * only with an object store, refs, and a valid HEAD, which here must name a
 * branch. That branch is either unborn, or names a stored root commit of a
 * stored empty tree, so nothing else needs storing. A loose object counts only
 * when it inflates to its own type and length and hashes to its name.
 * @param {string} work
 * @returns {string[]}
 */
function gitCanaryProblems(work) {
  const git = path.join(work, '.git');
  /** @param {string} relative */
  const read = (relative) => {
    try {
      return fs.readFileSync(path.join(git, ...relative.split('/')));
    } catch {
      return null;
    }
  };
  /** @param {string} relative */
  const isFolder = (relative) => fs.lstatSync(path.join(git, relative), { throwIfNoEntry: false })?.isDirectory() === true;
  /** @type {string[]} */
  const problems = [];
  if (!isFolder('objects')) problems.push('no_object_store');
  if (!isFolder('refs')) problems.push('no_refs');
  const branch = /^ref: (refs\/heads\/[A-Za-z0-9._-]+)\n$/.exec(read('HEAD')?.toString('utf8') ?? '')?.[1];
  if (!branch) return [...problems, 'head_not_branch'];
  const tip = read(branch);
  if (!tip) return problems;
  const commit = /^([0-9a-f]{40})\n$/.exec(tip.toString('utf8'))?.[1];
  if (!commit) return [...problems, 'ref_invalid'];
  /** The body of the stored loose object `id` of `type`, or null once its problem is noted. @param {string} id @param {string} type */
  const stored = (id, type) => {
    const bytes = read(`objects/${id.slice(0, 2)}/${id.slice(2)}`);
    if (!bytes) {
      problems.push(`missing_object:${id}`);
      return null;
    }
    let raw = Buffer.alloc(0);
    try {
      raw = zlib.inflateSync(bytes);
    } catch {
      // Not zlib data: the empty buffer fails the header check below.
    }
    const end = raw.indexOf(0);
    const body = raw.subarray(end + 1);
    if (end < 0 || raw.toString('latin1', 0, end) !== `${type} ${body.length}` || createHash('sha1').update(raw).digest('hex') !== id) {
      problems.push(`invalid_object:${id}`);
      return null;
    }
    return body;
  };
  const header = stored(commit, 'commit')?.toString('utf8').split('\n\n', 1)[0];
  if (header === undefined) return problems;
  const tree = /^tree ([0-9a-f]{40})$/m.exec(header)?.[1];
  if (!tree) return [...problems, `invalid_object:${commit}`];
  if (/^parent /m.test(header)) problems.push(`not_root_commit:${commit}`);
  if (stored(tree, 'tree')?.length) problems.push(`tree_not_empty:${tree}`);
  return problems;
}

/**
 * Assert that `folders` hold every canary the fixed manifest copies, byte for
 * byte at its location; that their `.git` holds exactly the manifest's Git
 * files; and that those form a minimal valid repository. Reads actual files.
 * @param {{work: string, config: string, home: string}} folders
 * @param {{bytes: Buffer, sources: Array<{path: string, bytes: Buffer}>}} manifest @param {string} label
 */
function assertCanaryCopy(folders, manifest, label) {
  const sources = new Map(manifest.sources.map((source) => [source.path, source.bytes]));
  const entries = /** @type {Array<{kind: string, location: 'work' | 'config' | 'home', path: string, source: string | null}>} */ (
    JSON.parse(manifest.bytes.toString('utf8')).canaries);
  for (const entry of entries) {
    if (entry.source === null) continue;
    assert.deepEqual(fs.readFileSync(path.join(folders[entry.location], ...entry.path.split('/'))), sources.get(entry.source),
      `${label}: ${entry.location}/${entry.path}`);
  }
  assert.deepEqual(filesBelow(path.join(folders.work, '.git')),
    entries.filter((entry) => entry.kind === 'git').map((entry) => entry.path.slice('.git/'.length)).sort(), `${label}: .git holds exactly the fixture's Git files`);
  assert.deepEqual(gitCanaryProblems(folders.work), [], `${label}: the Git canary is a valid repository`);
}

test('the fixed manifest makes the Git canary a minimal valid repository from files alone, within its bounds; the former layout, a missing object store or refs, a dangling ref, and a corrupt object are each rejected', () => {
  const manifest = fixtureManifest(randomUUID());
  const entries = /** @type {Array<{kind: string, path: string, source: string | null}>} */ (JSON.parse(manifest.bytes.toString('utf8')).canaries);
  assert.ok(manifest.bytes.length <= WORKER_BOUNDS.manifestBytes, `the manifest is ${manifest.bytes.length} bytes`);
  assert.ok(manifest.canaryBytes <= WORKER_BOUNDS.canaryBytes, `the canaries are ${manifest.canaryBytes} bytes`);
  assert.ok(entries.length <= 32, `${entries.length} entries; the worker and the observer accept at most 32`);
  for (const entry of entries) assert.ok(entry.path.split('/').length <= 8, entry.path);

  // The Git canary as the worker copies it: each entry's source bytes at its path, folders only through files.
  const sources = new Map(manifest.sources.map((source) => [source.path, source.bytes]));
  const valid = tempDir('dude-nqg-');
  for (const entry of entries) {
    if (entry.kind !== 'git' || entry.source === null) continue;
    const file = path.join(valid, ...entry.path.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, /** @type {Buffer} */ (sources.get(entry.source)), { flag: 'wx' });
  }
  assert.deepEqual(gitCanaryProblems(valid), [], 'main names a stored root commit of the stored empty tree');

  const git = path.join(valid, '.git');
  const commit = fs.readFileSync(path.join(git, 'refs', 'heads', 'main'), 'utf8').trim();
  const commitObject = `${commit.slice(0, 2)}/${commit.slice(2)}`;
  const otherObject = /** @type {string} */ (filesBelow(path.join(git, 'objects')).find((relative) => relative !== commitObject));
  /** @param {string} copy @param {string} relative */
  const objectFile = (copy, relative) => path.join(copy, 'objects', ...relative.split('/'));
  /** One change on a fresh copy; every other file stays as the fixture has it. @param {(copy: string) => void} change */
  const variant = (change) => {
    const work = tempDir('dude-nqg-');
    fs.cpSync(git, path.join(work, '.git'), { recursive: true });
    change(path.join(work, '.git'));
    return { problems: gitCanaryProblems(work), files: filesBelow(path.join(work, '.git')) };
  };
  const formerTip = '0000000000000000000000000000000000000001';
  const former = variant((copy) => {
    fs.rmSync(path.join(copy, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'refs', 'heads', 'main'), `${formerTip}\n`);
  });
  assert.deepEqual(former.files, ['HEAD', 'config', 'refs/heads/main'], 'the former layout');
  assert.deepEqual(former.problems, ['no_object_store', `missing_object:${formerTip}`], 'no object store, and main names an object nobody stored');
  assert.deepEqual(variant((copy) => fs.rmSync(objectFile(copy, commitObject))).problems, [`missing_object:${commit}`],
    'a dangling ref while the object store still exists');
  assert.deepEqual(variant((copy) => fs.copyFileSync(objectFile(copy, otherObject), objectFile(copy, commitObject))).problems,
    [`invalid_object:${commit}`], 'another object\'s bytes under the commit\'s name');
  const unborn = (/** @type {string} */ copy) => fs.rmSync(path.join(copy, 'refs', 'heads', 'main'));
  assert.deepEqual(variant(unborn).problems, [], 'an unborn main is valid with an object store and refs');
  assert.deepEqual(variant((copy) => { unborn(copy); fs.rmSync(path.join(copy, 'objects'), { recursive: true }); }).problems, ['no_object_store']);
  assert.deepEqual(variant((copy) => { unborn(copy); fs.rmSync(path.join(copy, 'refs'), { recursive: true }); }).problems, ['no_refs']);
});

test('fixture preparation renders the actual core and writes only fresh short roots whose owner configurations the product accepts', async (context) => {
  const f = planFixture();
  const { scope } = scopeOf(f);
  const layout = layoutOf(scope.values.fixtureParent);
  const runId = randomUUID();
  const pins = { a: f.certs.a.pin, b: f.certs.b.pin };
  const prepared = prepareFixtures({ scope, layout, runId, pins });

  // Both workspaces hold exactly the rendered core bundle plus the synthetic records; nothing else from this repository.
  const core = renderedCore(REPOSITORY);
  for (const side of /** @type {const} */ (['a', 'b'])) {
    const ideas = fs.readdirSync(path.join(layout[side].workspace, '.dude', 'ideas')).sort();
    assert.deepEqual(ideas, side === 'a' ? ['100-local-seed.md'] : ['100-peer-seed.md', '101-peer-latest.md'], `${side} seeds`);
    for (const [relPath, bytes, digest] of core.rows) {
      const file = path.join(layout[side].workspace, ...relPath.split('/'));
      assert.equal(sha256(fs.readFileSync(file)), digest, `${side} ${relPath}`);
      assert.equal(fs.statSync(file).size, bytes);
    }
    assert.equal(fs.existsSync(path.join(layout[side].workspace, '.git')), false, 'no Git state is copied');
    assert.equal(fs.existsSync(path.join(layout[side].workspace, '.dude', 'memory')), false, 'no memory is copied');
    for (const preference of [path.join(layout[side].config, 'extensions', 'dude', 'artifacts', 'canvas-preferences.json'),
      path.join(layout[side].home, '.copilot', 'extensions', 'dude', 'artifacts', 'canvas-preferences.json')]) {
      assert.deepEqual(JSON.parse(fs.readFileSync(preference, 'utf8')), { followAppTheme: false, checkForUpdatesOnSessionStart: false });
    }
  }
  assert.equal(fs.existsSync(path.join(layout.a.workspace, PROGRESS_FIXTURES.a.path)), false, 'progress fixtures appear only when the held call is observed');

  // The fixed fixture manifest the worker validates, with sources under the fixture root.
  const manifest = fixtureManifest(runId);
  assert.equal(sha256(fs.readFileSync(path.join(layout.fixture, 'manifest.json'))), manifest.sha256);
  assert.equal(prepared.manifest.sha256, manifest.sha256);
  assert.equal(manifest.canaries, CANARIES.length);
  assertCanaryCopy({ work: layout.control.workspace, config: layout.control.config, home: layout.control.home }, manifest, 'control');

  // The product's own parser accepts both owner configurations; only B has a worker, bound to this run's fixture.
  const configs = { a: parseA2aConfig(JSON.parse(fs.readFileSync(layout.a.a2aConfig, 'utf8'))), b: parseA2aConfig(JSON.parse(fs.readFileSync(layout.b.a2aConfig, 'utf8'))) };
  const ask = /** @type {any} */ (configs.a.profiles.get('a'));
  const serve = /** @type {any} */ (configs.b.profiles.get('b'));
  assert.deepEqual([ask.role, ask.collaboration.worker, ask.contentBytes, ask.repeatUse, ask.peer.certSha256], ['ask', null, 32_768, 2, pins.b]);
  assert.deepEqual([serve.role, serve.contentBytes, serve.repeatUse, serve.peer.certSha256, serve.evidenceRoots], ['serve', 32_768, 2, pins.a, [layout.b.workspace]]);
  assert.deepEqual(serve.collaboration.worker.qualification, { version: 1, runId, fixtureRoot: layout.fixture, fixtureSha256: manifest.sha256 });
  assert.deepEqual([serve.collaboration.worker.path, serve.collaboration.worker.model, serve.collaboration.worker.tokenFile],
    [scope.values.cli, 'fixture-model-worker', f.plan.credentials.worker]);
  assert.deepEqual(prepared.configDigests, { a: sha256(fs.readFileSync(layout.a.a2aConfig)), b: sha256(fs.readFileSync(layout.b.a2aConfig)) });

  // The product renders each complete proposal from these files within the fixed cap (a fake host session; no runtime).
  for (const [side, profileId] of /** @type {Array<['a' | 'b', string]>} */ ([['a', 'a'], ['b', 'b']])) {
    const provider = createA2a({ root: layout[side].workspace });
    const sessionId = `${side}-fixture-session-0123456789abcdef`;
    provider.bindSession(/** @type {any} */ ({
      sessionId, log: async () => undefined, rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [], inFlightSteeringCount: 0 }) } },
    }));
    const tool = /** @type {any} */ (provider.tools.find((entry) => entry.name === 'dude_a2a_propose'));
    const result = await tool.handler({ configPath: layout[side].a2aConfig, profileId }, {
      sessionId, toolName: 'dude_a2a_propose', toolCallId: `call-${side}`, signal: new AbortController().signal,
    });
    assert.equal(result.resultType, 'success', result.textResultForLlm);
    const bytes = Buffer.byteLength(result.textResultForLlm, 'utf8');
    assert.ok(bytes <= A2A_PROPOSAL_BYTES, `${side} proposal ${bytes} bytes`);
    context.diagnostic(`${side} complete proposal at a ${scope.values.fixtureParent.length}-character fixture parent: ${bytes} of ${A2A_PROPOSAL_BYTES} bytes`);
    if (side === 'b') assert.match(result.textResultForLlm, new RegExp(`\\nQUALIFICATION: run ${runId}; fixture ${layout.fixture.replace(/\\/g, '\\\\')} sha256:`));
  }

  // Every file is created exclusively: preparing the same parent again refuses rather than overwrite.
  assert.throws(() => prepareFixtures({ scope, layout, runId: randomUUID(), pins }));

  // The runtime environment names only the side's own folders, this Node, and system folders; nothing is inherited.
  const env = runtimeEnvironment(layout.a, { SystemRoot: 'C:\\Windows', GITHUB_TOKEN: 'never', USERPROFILE: 'C:\\Users\\real', PATH: 'C:\\real' });
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.deepEqual([env.HOME, env.USERPROFILE, env.TEMP, env.TMP], [layout.a.home, layout.a.home, layout.a.temp, layout.a.temp]);
  assert.equal(env.PATH.split(';').at(-1), path.dirname(process.execPath));
  assert.equal(env.PATH.includes('C:\\real'), false);
});

/**
 * The after-view control session as a scripted host plays it. By default its
 * model requests the one fixed view, asks to read the target through the
 * control relay, and, once approved, starts the view, reads the target and
 * AGENTS.md (as the observer would see), emits the discovery notification,
 * completes with the target's text, loads AGENTS.md, and replies. Each option
 * varies one public observation.
 * @typedef {object} ControlOptions
 * @property {(steps: string[]) => string[]} [steps] Reorder or drop named steps: request, permission, start, reads, notification, complete,
 *   loaded, reply.
 * @property {(events: Record<string, any>, ctx: any) => void} [events] Change the scripted events before they are emitted, by step name.
 * @property {(answer: any, session: any) => void} [initialSources] Change the session's loaded sources before its prompt; it may also emit
 *   events through `session` while that query runs.
 * @property {(answer: any, session: any) => void} [loadedSources] Change the session's loaded sources after its view; it may also emit events
 *   through `session` while that query runs.
 * @property {(state: any, ctx: any) => void} [reads] Change what the observer records the control runtime reading.
 * @property {(config: any) => any} [model] The session's current model, from its configuration.
 * @property {(answer: any, session: any) => void} [currentModel] Change the session's current-model answer; it may also emit events through
 *   `session` while the model check is asked.
 * @property {(answer: any) => void} [metadata] Change the session's tool catalog answer.
 * @property {(answer: any, session: any) => void} [descriptors] Change the session's installed built-in tool descriptors; it may also emit
 *   events through `session`, the last call before the working-directory check is asked.
 * @property {(answer: any, session: any) => void} [snapshot] Change the session's metadata snapshot; it may also emit events through `session`
 *   while the working-directory check is asked.
 * @property {(session: any) => void} [baseline] Runs inside the observer's baseline snapshot, before its prompt; it may emit events.
 * @property {(session: any) => void} [afterIdle] Runs right after the turn's idle is emitted, in the same delivery, before the run can look.
 * @property {(session: any) => void} [duringSend] Runs inside the session's `send` before that call returns, as a host could deliver an event
 *   synchronously within it; it may emit events.
 * @property {Partial<Record<string, number>>} [advance] Advance the clock by these milliseconds inside the named calls: createSession, model,
 *   getSources, send, turn (the model's turn), baselineSnapshot (the first observer snapshot once the session exists), and turnSnapshot
 *   (the first observer snapshot once its turn ended).
 * @property {(request: any, ctx: any) => void} [permission] Change the permission request before it reaches the relay.
 * @property {(session: any, ctx: any) => void} [whilePermission] Runs right after the permission request is made, before its answer.
 * @property {(session: any, ctx: any) => unknown} [afterTurn] Runs, and is awaited, inside the first observer snapshot once the session's
 *   turn ended, before that snapshot answers.
 * @property {boolean} [frozen] Real time stops on the run's clock from the start of the session's creation through the control runtime's
 *   owned stop until the next observer snapshot, so the phase's elapsed time is exactly what `advance` adds, and the control's cleanup
 *   window from its stop is exactly what a scripted stop or force-stop advances.
 * @property {boolean} [startupIdle] A root idle arrives when the session is created, before its prompt.
 * @property {Array<Record<string, unknown>>} [startupEvents] Events the session emits when it is created, before its model is checked.
 */

/**
 * What a version-3 scripted host varies; each option varies one public observation.
 * @typedef {object} NormalHostOptions
 * @property {(side: string, source: 'runtime' | 'session', count: number, status: Record<string, unknown>) => unknown} [account] Replace one
 *   account answer: `count` is that side's and source's 1-based call number, `status` the default signed-in answer (the side's
 *   expected login in lower case, with a status message and plan that must never be kept). It may throw, or return a promise the
 *   call answers with once it settles.
 * @property {(data: Record<string, unknown>, ex: any) => void} [cleanup] Change a served worker's recorded cleanup before it is journaled.
 * @property {(side: string) => unknown} [stop] What a main client's own stop returns; a promise answers once it settles.
 */

/**
 * A scripted host for controlled orchestration slices. It plays an observer
 * whose bounded summaries follow the processes it starts, a public-SDK
 * stand-in whose control, B, and A sessions emit the events a real host would,
 * B's product (its journal and its served worker's records, process, and
 * releases), and A's product (its journal and capture). It starts no process
 * and is never native evidence. Each option varies one fault.
 * @typedef {object} HostOptions
 * @property {(answers: Record<string, any>) => void} [discovery] Change the control's discovery answers.
 * @property {(method: string, state: any) => void} [onDiscovery] Runs inside one discovery call, with the observer's state.
 * @property {ControlOptions} [control] Vary one public observation of the after-view control session.
 * @property {(side: string) => Promise<any>} [extensionsList] Replace a main session's extension list.
 * @property {number} [aSendDelayMs] Delay A's admission.
 * @property {number} [workerExitMs] When the answering worker's process exits after its recorded finish.
 * @property {(worker: any, dir: string, state: any) => void} [workerStartup] Runs once a worker's process exists.
 * @property {(worker: any, dir: string, state: any) => void} [whileCancelled] Runs in B once the cancelled exchange's worker is
 *   cancelled, before B's terminal record.
 * @property {'workspace' | 'none'} [sessionStorage] What each served worker's session reports about its own storage; default a workspace.
 * @property {(preflight: any, ex: any) => void} [preflight] Change a served worker's recorded readiness before it is journaled.
 * @property {{finished: Record<string, unknown> | null}} [workerEnds] B's advice worker ends right after its prompt is
 *   admitted, before any evidence call: B records `finished` (with that worker's ID) as its `worker_finished` data, or no such
 *   record when null, then the operation's failed terminal, cleanup, and close.
 * @property {(session: any, side: string) => void} [duringHold] Runs in each main while the evidence call is held.
 * @property {(state: any) => void} [beforeFinal] Runs inside the observer's final stop, before its summary.
 * @property {Record<string, unknown>} [finalDrain] Replaces fields of the observer's final drain record.
 * @property {(state: any) => void} [onSnapshot] Runs at the start of every synchronized observer snapshot.
 * @property {string} [source] An attribution on every relayed root message of a main session.
 * @property {(text: string, side: string) => string} [proposal] Change a main's complete proposal result before its session returns it.
 * @property {(side: string, prompt: string) => Array<[string, Record<string, unknown>]>} [strayTools] Extension tool calls, by name and
 *   arguments, that a main's model makes first in the turn of that prompt, each through its relay, before what the prompt asks for.
 * @property {(side: string, prompt: string) => [string, Record<string, unknown>] | null} [lateTool] One more extension tool call that a
 *   main's model requests in the turn of that prompt, whose permission request reaches its relay only at the start of that main's next
 *   turn, as a host that delivered it late would.
 * @property {(ctx: any) => void} [controlStart] Runs once the control runtime's process exists, with `{runtime, state, time, iso, endTree, spawnFake}`.
 * @property {(ctx: any) => unknown} [controlStop] Replaces the control client's own stop, with the same context; what it returns or throws
 *   is what stop gives. By default the whole runtime tree ends at once and stop reports no errors.
 * @property {(ctx: any) => unknown} [controlForceStop] Replaces the control client's force-stop, with the same context.
 * @property {NormalHostOptions} [normal] Play a version-3 run instead: no control runtime, B and A started in that order, each
 *   main's client and session answering its account status, and B's served worker recording the normal worker's version-2 readiness
 *   and its full bounded cleanup.
 * @param {ReturnType<typeof planFixture>} f @param {{now: () => number, advance: (ms: number) => void, freeze?: () => void, thaw?: () => void}} time
 * @param {HostOptions} [options]
 */
function scriptedHost(f, time, options = {}) {
  const layout = layoutOf(f.plan.fixtureParent);
  const iso = (/** @type {number} */ at) => new Date(at).toISOString();
  const state = {
    marker: 0,
    processes: /** @type {any[]} */ ([{ key: 'root@1', pid: process.pid, parent: null, created: iso(time.now()), image: process.execPath, exited: null, exitCode: null,
      pinned: true }]),
    files: /** @type {any[]} */ ([]),
    canaries: /** @type {any[]} */ ([]),
    workerDirs: /** @type {any[]} */ ([]),
    unclassified: /** @type {any[]} */ ([]),
    health: { eventsLost: 0, buffersLost: 0, realTimeBuffersLost: 0, decodeFailures: 0, identityGaps: 0, unattributed: 0, rootUnattributed: 0, overflow: false,
      markersMissed: 0 },
    stopped: 0,
    closed: 0,
    /** @type {string[]} */ log: [],
    /** @type {Array<{side: string, prompt: string, messageId: string}>} */ prompts: [],
    /** @type {Array<{side: string, decision: string}>} */ permissions: [],
    /** Each answer a main's relay gave one of its extension tool calls, in order (`session.tool`, `session.modelRequest`). @type {Array<{side: string, tool: string, op: string | null, decision: any}>} */
    toolDecisions: [],
    /** Each answer a main's relay gave the read request of one of its model's views, in order (`session.view`). @type {Array<{side: string, path: string, decision: string}>} */
    reads: [],
    /** @type {any[]} */ exchanges: [],
    /** @type {Record<string, string>} */ runtimes: {},
    /** Each client's SDK mode, by side. @type {Record<string, string | null>} */ modes: {},
    /** Each client's construction options, by side. @type {Record<string, any>} */ clientOptions: {},
    /** When the control client's stop was called, on the run's clock. @type {number | null} */ controlStoppedAt: null,
    nextPid: 5_000,
  };
  /** @param {string} parent @param {string} image @param {Record<string, unknown>} [extra] */
  const spawnFake = (parent, image, extra = {}) => {
    state.nextPid += 1;
    const node = { key: `${state.nextPid}@2`, pid: state.nextPid, parent, created: iso(time.now()), image, exited: null, exitCode: null, pinned: true, ...extra };
    state.processes.push(node);
    return node;
  };
  /** Every live process under `key`, itself included, ends at `at`. @param {string} key @param {number} at */
  const endTree = (key, at) => {
    const tree = processTree({ processes: state.processes });
    for (const member of descendantsOf(tree, key)) {
      const node = state.processes.find((entry) => entry.key === member);
      if (node && !node.exited) node.exited = iso(at);
    }
  };
  const summary = (/** @type {any} */ final = null) => ({ version: 1, runId: 'fixture', marker: state.marker, root: 'root@1', health: { ...state.health }, final,
    processes: structuredClone(state.processes), files: structuredClone(state.files), canaries: structuredClone(state.canaries),
    workerDirs: structuredClone(state.workerDirs), unclassified: structuredClone(state.unclassified) });
  const observer = {
    pid: 4_444,
    ready: Promise.resolve({ ok: true }),
    snapshot: async () => {
      state.log.push('observer snapshot');
      options.onSnapshot?.(state);
      // A frozen run clock stays frozen through the control runtime's owned stop and thaws at the next synchronized snapshot, so that
      // control's cleanup window from its stop is exactly what a scripted stop advances.
      if (state.controlStoppedAt !== null) time.thaw?.();
      // The after-view control's own observations: the first snapshot once its session exists is its baseline, and the first once
      // its turn ended is the one that must show its reads.
      const view = sessions.controlView;
      if (view && !view.observed) {
        view.observed = 'baseline';
        tick('baselineSnapshot');
        control.baseline?.(view);
      } else if (view?.idled && view.observed === 'baseline') {
        view.observed = 'turn';
        tick('turnSnapshot');
        await control.afterTurn?.(view, view.viewContext);
      }
      state.marker += 1;
      return summary();
    },
    stop: async () => {
      state.stopped += 1;
      options.beforeFinal?.(state);
      return { summary: summary({ stopStatus: 0, joined: true, consumerStatus: 0, drained: true, ...options.finalDrain }), reason: null, exit: { exited: true, code: 0 } };
    },
    close: async () => { state.closed += 1; return { exited: true, code: 0 }; },
  };

  // The control's discovery answers: every canary form recognized at its exact location.
  const work = layout.control.workspace;
  const config = layout.control.config;
  const content = (/** @type {string} */ relative) => /** @type {string} */ (CANARIES.find((canary) => canary.path === relative)?.content);
  /** @type {Record<string, any>} */
  const discovery = {
    agents: { agents: [
      { id: 'dude-canary', name: 'dude-canary', displayName: 'Canary', description: 'x', source: 'project', path: path.join(work, '.github', 'agents', 'dude-canary.agent.md') },
      { id: 'dude-canary-user', name: 'dude-canary-user', displayName: 'Canary', description: 'x', source: 'user', path: path.join(config, 'agents', 'dude-canary-user.agent.md') },
    ] },
    instructions: { sources: [
      { id: 'i1', label: 'x', sourcePath: '.github/copilot-instructions.md', content: content('.github/copilot-instructions.md'), type: 'repo', location: 'repository',
        projectPath: work },
      { id: 'i2', label: 'x', sourcePath: 'AGENTS.md', content: content('AGENTS.md'), type: 'repo', location: 'repository', projectPath: work },
      { id: 'i3', label: 'x', sourcePath: '.github/instructions/dude-canary.instructions.md', content: content('.github/instructions/dude-canary.instructions.md'),
        type: 'vscode', location: 'repository', applyTo: ['**'], projectPath: work },
    ] },
    hooks: { hooks: [{ id: 'h1', hookType: 'preToolUse', origin: 'repository', source: path.join(work, '.github', 'hooks', 'dude-canary.json'), projectPath: work,
      enabled: true }], warnings: [], errors: [] },
    skills: { skills: [
      { name: 'dude-canary', description: 'x', source: 'project', userInvocable: true, enabled: true, path: path.join(work, '.github', 'skills', 'dude-canary', 'SKILL.md'),
        projectPath: work },
      { name: 'dude-canary-user', description: 'x', source: 'personal-copilot', userInvocable: true, enabled: true,
        path: path.join(config, 'skills', 'dude-canary-user', 'SKILL.md') },
    ], errors: [] },
    mcpWorkspace: { servers: [{ name: 'dude-canary-probe', type: 'stdio', source: 'workspace', enabled: true, effectiveSource: { kind: 'workspace', id: 'opaque-w',
      editability: 'editable', file: { uri: pathToFileURL(path.join(work, '.mcp.json')).href, jsonPointer: '/mcpServers/dude-canary-probe' } } }] },
    mcpUser: { servers: [{ name: 'dude-canary-probe', type: 'stdio', source: 'user', enabled: true, effectiveSource: { kind: 'user', id: 'opaque-u',
      editability: 'editable', file: { uri: pathToFileURL(path.join(config, 'mcp-config.json')).href } } }] },
  };
  options.discovery?.(discovery);
  /** @param {string} name */
  const discover = (name) => async () => { options.onDiscovery?.(name, state); state.log.push(`discover ${name}`); return structuredClone(discovery[name]); };

  /** @type {Record<string, any>} */
  const extensions = {};
  /** @type {Record<string, any>} */
  const sessions = {};
  const control = options.control ?? {};
  /** Advance the clock by the control option's milliseconds for one named call of the after-view session. @param {string} name */
  const tick = (name) => {
    const ms = control.advance?.[name];
    if (ms) time.advance(ms);
  };
  /** How many account answers each side's runtime and session gave, by `<side> <source>`. @type {Record<string, number>} */
  const accountCalls = {};
  /**
   * One version-3 account answer: by default the side's expected login, in lower case, signed in by `user`, with a status
   * message and plan beside it that must never be kept; `options.normal.account` may replace it or throw.
   * @param {string} side @param {'runtime' | 'session'} source
   */
  const normalAccount = (side, source) => {
    const key = `${side} ${source}`;
    accountCalls[key] = (accountCalls[key] ?? 0) + 1;
    state.log.push(source === 'runtime' ? `getAuthStatus ${side}` : `gitHubAuth ${side}`);
    const login = String(/** @type {any} */ (f.plan).auth?.[side]?.expectedAccount?.login ?? '').toLowerCase();
    const status = { isAuthenticated: true, authType: 'user', host: 'https://github.com', login, statusMessage: 'hidden status text',
      copilotPlan: 'hidden plan' };
    return options.normal?.account ? options.normal.account(side, source, accountCalls[key], status) : status;
  };
  let clientCount = 0;
  class CopilotClient {
    /** @param {any} options_ */
    constructor(options_) {
      this.options = options_;
      this.side = (options.normal ? ['b', 'a'] : ['control', 'b', 'a'])[clientCount++];
      state.modes[this.side] = options_.mode ?? null;
      state.clientOptions[this.side] = options_;
      /** @type {any} */ this.runtime = null;
      this.rpc = {
        agents: { discover: discover('agents') }, instructions: { discover: discover('instructions') }, hooks: { discover: discover('hooks') },
        skills: { discover: discover('skills') },
        mcp: { discover: async (/** @type {any} */ params) => discover(params.workingDirectory === layout.control.temp ? 'mcpUser' : 'mcpWorkspace')() },
      };
    }

    async start() {
      state.log.push(`start ${this.side}`);
      this.runtime = spawnFake('root@1', f.cli);
      state.runtimes[this.side] = this.runtime.key;
      state.files.push({ process: this.runtime.key, class: 'payload', op: 'open', count: 1 });
      if (this.side === 'control') options.controlStart?.(controlContext(this.runtime));
    }

    async getStatus() { return { version: '1.0.102-fixture', protocolVersion: 3 }; }

    /** The runtime's own account, as a version-3 run asks it. */
    async getAuthStatus() { return normalAccount(this.side, 'runtime'); }

    /** A scripted stand-in: not derived from the control's Git canary, whose files are judged separately. @param {string} sessionId */
    async getSessionMetadata(sessionId) {
      return { sessionId, startTime: new Date(), modifiedTime: new Date(), isRemote: false,
        context: { workingDirectory: layout.control.workspace, gitRoot: layout.control.workspace, branch: 'main' } };
    }

    /** @param {any} sessionConfig */
    async createSession(sessionConfig) {
      // The control runtime's second session is the after-view control's one fresh session.
      const side = this.side === 'control' && sessions.control ? 'controlView' : this.side;
      state.log.push(`createSession ${side}`);
      if (side === 'controlView') {
        if (control.frozen) time.freeze?.();
        tick('createSession');
      }
      const extension = sessionConfig.requestExtensions ? spawnFake(this.runtime.key, f.cli) : null;
      if (extension) extensions[side] = extension;
      let messages = 0;
      // A main session's tool catalog, as the pinned SDK documents, lists only initialized tools: null until its own initializeAndValidate.
      let toolsInitialized = false;
      /** @type {{promise: Promise<boolean>, resolve: (value: boolean) => void}} */
      const ended = deferred();
      /** @type {any} */
      const session = {
        sessionId: `${side}-session-0123456789`,
        config: sessionConfig,
        ended,
        loaded: false,
        /** @type {string | null} */ current: null,
        /** @param {Record<string, unknown>} event */
        emit(event) { sessionConfig.onEvent({ id: randomUUID(), timestamp: iso(time.now()), parentId: null, ...event }); },
        rpc: side === 'controlView' ? {
          model: { getCurrent: async () => {
            tick('model');
            const answer = { modelId: control.model ? control.model(sessionConfig) : sessionConfig.model };
            control.currentModel?.(answer, session);
            return answer;
          } },
          tools: {
            initializeAndValidate: async () => ({}),
            getCurrentMetadata: async () => {
              const answer = { tools: [{ name: 'view', namespacedName: 'builtin:view', description: 'x', source: 'builtin' }] };
              control.metadata?.(answer);
              return answer;
            },
            getBuiltinDescriptors: async () => {
              const answer = { tools: [{ name: 'view', inputSchema: { type: 'object', properties: { path: { type: 'string' },
                view_range: { type: 'array', items: { type: 'integer' } } }, required: ['path'] } }, structuredClone(DESCRIPTORS[1])] };
              control.descriptors?.(answer, session);
              return answer;
            },
          },
          metadata: {
            snapshot: async () => {
              const answer = { sessionId: session.sessionId, isRemote: false, alreadyInUse: false, workspacePath: null,
                workingDirectory: sessionConfig.workingDirectory, currentMode: 'interactive', sessionLimits: null };
              control.snapshot?.(answer, session);
              return answer;
            },
          },
          instructions: {
            getSources: async () => {
              state.log.push('getSources controlView');
              tick('getSources');
              const answer = session.loaded ? { sources: [{ id: 'i-agents', label: 'AGENTS.md', sourcePath: AFTER_VIEW_CONTROL.source,
                content: content(AFTER_VIEW_CONTROL.source), type: 'repo', location: 'repository' }] } : { sources: [] };
              (session.loaded ? control.loadedSources : control.initialSources)?.(answer, session);
              return answer;
            },
          },
        } : {
          extensions: { list: async () => (options.extensionsList ? options.extensionsList(side)
            : { extensions: extension ? [{ id: 'project:dude', name: 'dude', source: 'project', status: 'running', pid: extension.pid }] : [] }) },
          agent: {
            list: async () => { state.log.push(`agent.list ${side}`); return { agents: [{ id: 'dude', name: 'dude', displayName: 'Dude', description: 'x', source: 'project',
              path: path.join(sessionConfig.workingDirectory, '.github', 'agents', 'dude.agent.md') }] }; },
            select: async (/** @type {any} */ params) => ({ agent: { id: params.name } }),
            getCurrent: async () => ({ agent: { id: 'dude' } }),
          },
          model: { getCurrent: async () => ({ modelId: sessionConfig.model }) },
          tools: {
            initializeAndValidate: async () => {
              state.log.push(`tools.initializeAndValidate ${side}`);
              toolsInitialized = true;
              return {};
            },
            getCurrentMetadata: async () => {
              state.log.push(`tools.getCurrentMetadata ${side}`);
              return { tools: toolsInitialized ? [{ name: 'dude_a2a_propose' }, { name: 'dude_a2a_conversation' }, { name: 'view' }] : null };
            },
          },
          // The actual session's own account, as a version-3 run asks it.
          gitHubAuth: { getStatus: async () => normalAccount(side, 'session') },
        },
        /** @param {{prompt: string}} send */
        async send({ prompt }) {
          if (side === 'a' && options.aSendDelayMs && prompt.startsWith('Feature 089 native qualification. Do every step')) await sleep(options.aSendDelayMs);
          if (options.normal) state.log.push(`send ${side}`);
          if (side === 'controlView') {
            state.log.push('send controlView');
            tick('send');
            control.duringSend?.(session);
          }
          messages += 1;
          const messageId = `${side}-message-${messages}`;
          state.prompts.push({ side, prompt, messageId });
          session.current = messageId;
          setImmediate(() => {
            session.emit({ type: 'user.message', data: { content: prompt, messageId, ...(options.source && side !== 'controlView' ? { source: options.source } : {}) } });
            void Promise.resolve(behave(side, session, prompt)).finally(() => {
              if (ended.settled) return;
              session.idled = true;
              session.emit({ type: 'session.idle', data: {} });
              // Whatever the host sends in the same delivery as the turn's idle, before the run can look.
              if (side === 'controlView') control.afterIdle?.(session);
            });
          });
          return messageId;
        },
        async disconnect() {
          state.log.push(`disconnect ${side}`);
          ended.resolve(false);
        },
        /**
         * A root model call of an extension tool, such as Dude's own, for the current instruction. As the native runtime does in
         * normal mode for an extension tool that does not skip permission (run e3689559-574d-4b1c-a851-7281de20df9a), the model's
         * request is followed by a custom-tool permission request to the session's own relay; only an approve-once runs and completes
         * the call, and any other answer completes it as rejected, never run. Each answer is kept in `state.toolDecisions`.
         * Resolves to the call's ID once it ran, or null when it was refused.
         * @param {string} name @param {Record<string, unknown>} args @param {string} result
         */
        async tool(name, args, result) {
          return session.modelRequest(name, args).permission(result);
        },
        /**
         * The model's request of one extension tool call for the current instruction, as `tool` makes it; its `permission` raises
         * that call's custom-tool permission request whenever the host delivers it, and then runs, or refuses, the call as `tool` does.
         * @param {string} name @param {Record<string, unknown>} args
         */
        modelRequest(name, args) {
          const toolCallId = `${side}-call-${randomUUID()}`;
          session.emit({ type: 'assistant.message', data: { messageId: randomUUID(), originatingMessageId: session.current, content: '',
            toolRequests: [{ toolCallId, name, arguments: args }] } });
          return {
            toolCallId,
            /** @param {string} result */
            async permission(result) {
              const decision = await sessionConfig.onPermissionRequest({ kind: 'custom-tool', toolCallId, toolName: name,
                toolDescription: `${name} (scripted)`, args }, { sessionId: session.sessionId });
              state.toolDecisions.push({ side, tool: name, op: typeof args.op === 'string' ? args.op : null, decision });
              if (decision.kind !== 'approve-once') {
                session.emit({ type: 'tool.execution_complete', data: { toolCallId, success: false, error: { message: 'The user rejected this request.' } } });
                return null;
              }
              session.emit({ type: 'tool.execution_start', data: { toolCallId, toolName: name, arguments: args } });
              session.emit({ type: 'tool.execution_complete', data: { toolCallId, success: true, result: { content: result } } });
              return toolCallId;
            },
          };
        },
        /**
         * A root model view of one path for the current instruction. As the native runtime does in normal mode even for a path inside
         * the session's own working directory (run 15b73114-21ee-4744-bfe3-2993edfeaa88), the model's request is followed by a read
         * permission request to the session's own relay with that call's ID and the path; only an approve-once runs the view, which
         * shows the folder's names or the file's text, or fails when the path does not exist, and any other answer completes it as
         * rejected, never run. Each answer is kept in `state.reads`. Resolves to whether the view ran.
         * @param {string} target
         */
        async view(target) {
          const toolCallId = `${side}-view-${randomUUID()}`;
          session.emit({ type: 'assistant.message', data: { messageId: randomUUID(), originatingMessageId: session.current, content: '',
            toolRequests: [{ toolCallId, name: 'view', arguments: { path: target } }] } });
          const decision = await sessionConfig.onPermissionRequest({ kind: 'read', toolCallId, path: target, intention: 'View the file' },
            { sessionId: session.sessionId });
          state.reads.push({ side, path: target, decision: decision.kind });
          if (decision.kind !== 'approve-once') {
            session.emit({ type: 'tool.execution_complete', data: { toolCallId, success: false, error: { message: 'The user rejected this request.' } } });
            return false;
          }
          session.emit({ type: 'tool.execution_start', data: { toolCallId, toolName: 'view', arguments: { path: target } } });
          const stat = fs.statSync(target, { throwIfNoEntry: false });
          session.emit({ type: 'tool.execution_complete', data: stat
            ? { toolCallId, success: true, result: { content: stat.isDirectory() ? fs.readdirSync(target).join('\n') : fs.readFileSync(target, 'utf8') } }
            : { toolCallId, success: false, error: { message: 'Path does not exist' } } });
          return true;
        },
      };
      sessions[side] = session;
      // The session's own startup idle, before any prompt, as a host may send one.
      if (side === 'controlView' && control.startupIdle) session.emit({ type: 'session.idle', data: {} });
      if (side === 'controlView') for (const startup of control.startupEvents ?? []) session.emit(structuredClone(startup));
      return session;
    }

    async stop() {
      state.log.push(`stop ${this.side}`);
      if (this.side === 'control') {
        state.controlStoppedAt = time.now();
        if (options.controlStop) return options.controlStop(controlContext(this.runtime));
      }
      if (this.runtime) endTree(this.runtime.key, time.now());
      if (options.normal?.stop) return options.normal.stop(this.side);
      return [];
    }

    async forceStop() {
      state.log.push(`forceStop ${this.side}`);
      if (this.side === 'control' && options.controlForceStop) return options.controlForceStop(controlContext(this.runtime));
      return undefined;
    }
  }
  /** What a control start, stop, or force-stop option is given. @param {any} runtime */
  const controlContext = (runtime) => ({ runtime, state, time, iso, endTree, spawnFake });
  const sdk = { CopilotClient, RuntimeConnection: { forStdio: (/** @type {any} */ connection) => ({ kind: 'stdio', ...connection }) } };

  /** Resolves true once `file` exists, false once the session ended first. @param {string} file @param {any} session */
  const appears = async (file, session) => {
    while (!fs.existsSync(file)) {
      if (session.ended.settled) return false;
      await sleep(10);
    }
    return true;
  };
  /** @param {Promise<any>} promise @param {any} session @returns {Promise<any>} */
  const unlessEnded = (promise, session) => Promise.race([promise, session.ended.promise.then(() => false)]);
  /** A journal written the way the product writes it, one record per line. @param {string} workspace @param {string} operationId */
  const journal = (workspace, operationId) => {
    const target = journalPathOf(workspace, operationId);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let sequence = 0;
    return {
      /** @param {string} kind @param {Record<string, unknown>} [data] */
      add(kind, data = {}) {
        sequence += 1;
        const record = { version: 1, sequence, time: iso(time.now()), operationId, conversationId: null, kind, data };
        fs.appendFileSync(target, `${JSON.stringify(record)}\n`);
        return record;
      },
    };
  };
  /** @param {string} name */
  const loader = (name) => {
    const target = path.join(fs.realpathSync.native(f.sdk), name);
    const bytes = fs.readFileSync(target);
    return { source: 'fixed_loader', resolvedUrl: pathToFileURL(target).href, path: target, bytes: bytes.length, sha256: sha256(bytes) };
  };
  /** One exchange shared by both mains' scripted behavior, created by whichever side reaches it first. @param {number} index */
  const exchange = (index) => {
    state.exchanges[index] ??= { index, opA: randomUUID(), opB: randomUUID(), bWaiting: deferred(), aAsked: deferred(), replied: deferred(), cancelled: deferred() };
    return state.exchanges[index];
  };
  const counts = { a: 0, b: 0 };
  /** Each main's model-requested call whose permission request its next turn delivers (`options.lateTool`). @type {Record<string, any>} */
  const lateCalls = { a: null, b: null };

  /**
   * Each main's own model edits its progress file while the evidence call is held, through the real permission relay: its poll's view
   * finds the file holding pending, and then its edit.
   * @param {any} session @param {'a' | 'b'} side
   */
  const progress = async (session, side) => {
    const target = path.join(layout[side].workspace, PROGRESS_FIXTURES[side].path);
    if (!(await appears(target, session))) return;
    await sleep(2);
    if (!(await session.view(target))) return;
    options.duringHold?.(session, side);
    const toolCallId = `${side}-edit-${randomUUID()}`;
    session.emit({ type: 'assistant.message', data: { messageId: randomUUID(), originatingMessageId: session.current, content: '',
      toolRequests: [{ toolCallId, name: 'edit', arguments: { path: target } }] } });
    const decision = await session.config.onPermissionRequest({ kind: 'write', toolCallId, fileName: target, diff: '', intention: 'x', canOfferSessionApproval: false,
      fileEdits: [{ before: { path: target, content: PROGRESS_FIXTURES[side].initial }, after: { path: target, content: PROGRESS_FIXTURES[side].final } }] },
    { sessionId: session.sessionId });
    state.permissions.push({ side, decision: decision.kind });
    if (decision.kind !== 'approve-once') return;
    session.emit({ type: 'tool.execution_start', data: { toolCallId, toolName: 'edit', arguments: { path: target } } });
    fs.writeFileSync(target, PROGRESS_FIXTURES[side].final);
    session.emit({ type: 'tool.execution_complete', data: { toolCallId, success: true, result: { content: 'edited' } } });
  };

  /**
   * What the product's existing-sign-in worker records as its version-2 readiness for one exchange: both of its own accounts
   * (the expected login in lower case), its normal session storage in its own working folder, which it creates as the worker
   * would, with its workspace under the worker's base directory, and the latch-only qualification. No ambient counts or probes.
   * @param {any} ex @param {string} sessionId @param {string} storage @param {any} started @param {any} qualification
   */
  const normalPreflight = (ex, sessionId, storage, started, qualification) => {
    fs.mkdirSync(path.join(storage, 'work'), { recursive: true });
    const plan = /** @type {any} */ (f.plan);
    const account = { isAuthenticated: true, authType: 'user', host: 'https://github.com', login: String(plan.auth.worker.expectedAccount.login).toLowerCase() };
    return {
      version: 2, workerId: ex.workerId,
      binding: { operationId: ex.opB, permitId: `permit-${ex.index}`, mainSessionId: sessions.b.sessionId, providerGeneration: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        configDigest: sha256(fs.readFileSync(layout.b.a2aConfig)), projectId: f.plan.transport.projectId, conversationId: ex.conversationId,
        questionId: ex.questionId, exchangeId: ex.exchangeId },
      sessionId,
      qualification: { version: 2, runId: qualification.runId, fixtureSha256: qualification.fixtureSha256 },
      loaders: { joined: loader('extension.js'), worker: loader('index.js') },
      extensionPid: extensions.b.pid, runtime: { version: '1.0.102-fixture', protocolVersion: 3 }, model: f.plan.models.worker,
      storage,
      auth: { runtime: { ...account }, session: { ...account } },
      sessionStorage: { kind: 'normal', metadataSessionId: sessionId, workingDirectory: path.join(storage, 'work'),
        workspacePath: path.join(plan.auth.worker.baseDirectory, 'session-state', sessionId) },
      catalog: [{ name: WORKER_TOOLS.inventory, schemaSha256: 'a'.repeat(64) }, { name: WORKER_TOOLS.read, schemaSha256: 'b'.repeat(64) }],
      startedAt: started.time, completedAt: started.time,
    };
  };
  /**
   * A served worker's recorded cleanup: the strict host's bare form, or the normal worker's full bounded form, its stop without
   * errors and its storage kept, which `options.normal.cleanup` may change.
   * @param {any} ex @param {string} storage @param {string} abort
   */
  const cleanupRecord = (ex, storage, abort) => {
    if (!options.normal) return { runtime: 'unconfirmed' };
    const data = { workerId: ex.workerId, runtime: 'unconfirmed', abort, stop: 'clean', stopErrors: 0, forceStop: 'not_needed', storage: 'retained',
      retainedPath: storage };
    options.normal.cleanup?.(data, ex);
    return data;
  };

  /** B: begin receiving, then play B's product and its served worker. @param {any} session @param {any} ex */
  const serve = async (session, ex) => {
    await sleep(5);
    ex.b = journal(layout.b.workspace, ex.opB);
    ex.b.add('opened');
    ex.b.add('accepted');
    if (!(await session.tool('dude_a2a_conversation', { op: 'begin_receive' }, JSON.stringify({ outcome: 'accepted', operationId: ex.opB })))) return;
    session.emit({ type: 'session.info', data: { infoType: 'notification', message: `Status: conversation ${ex.opB} waiting for one project question` } });
    ex.bWaiting.resolve(true);
    // B's advice instruction polls its own progress file from its begin on, before that file exists; its cancel instruction only reads.
    if (ex.kind === 'advice' && !(await session.view(path.join(layout.b.workspace, PROGRESS_FIXTURES.b.path)))) return;
    if (!(await unlessEnded(ex.aAsked.promise, session))) return;
    ex.conversationId = randomUUID();
    ex.questionId = `question-${ex.index}`;
    ex.exchangeId = randomUUID();
    ex.b.add('request_admitted', { text: JSON.stringify({ conversationId: ex.conversationId }), messageId: ex.questionId, exchangeId: ex.exchangeId });
    ex.workerId = randomUUID();
    ex.dir = `dude-a2a-w-Fx${ex.index}`;
    ex.worker = spawnFake(extensions.b.key, f.cli);
    const sessionId = `worker-session-${ex.index}`;
    const storage = path.join(layout.b.temp, ex.dir);
    // The worker's session keeps its documented workspace in the worker's own configuration storage, written and read back before
    // any preflight exists; B's extension creates the folder itself, which the worker opens. The temp area keeps no names.
    const workspace = path.join(storage, 'config', 'session-state', sessionId);
    const relative = `config/session-state/${sessionId}`;
    fs.mkdirSync(workspace, { recursive: true });
    const directory = fs.statSync(workspace, { bigint: true });
    state.files.push({ process: ex.worker.key, class: 'payload', op: 'open', count: 1 });
    state.workerDirs.push({ process: extensions.b.key, dir: ex.dir, area: 'root', op: 'create', path: '', count: 1 },
      { process: ex.worker.key, dir: ex.dir, area: 'root', op: 'open', path: '', count: 1 },
      ...['open', 'read', 'write'].map((op) => ({ process: ex.worker.key, dir: ex.dir, area: 'temp', op, path: null, count: 1 })));
    if (options.sessionStorage !== 'none') {
      state.workerDirs.push(...[['create', 'config/session-state'], ['create', relative], ['create', `${relative}/events.jsonl`],
        ['write', `${relative}/events.jsonl`], ['create', `${relative}/workspace.yaml`], ['write', `${relative}/workspace.yaml`],
        ['open', 'config'], ['open', 'config/session-state'], ['open', relative], ['open', `${relative}/events.jsonl`], ['read', `${relative}/events.jsonl`],
        ['open', `${relative}/workspace.yaml`], ['read', `${relative}/workspace.yaml`]]
        .map(([op, file]) => ({ process: ex.worker.key, dir: ex.dir, area: 'config', op, path: file, count: 1 })));
    }
    options.workerStartup?.(ex.worker, ex.dir, { ...state, spawnFake, workspace, relative });
    const started = ex.b.add('worker_started', { workerId: ex.workerId });
    const qualification = JSON.parse(fs.readFileSync(layout.b.a2aConfig, 'utf8')).profiles.b.collaboration.worker.qualification;
    const manifest = fixtureManifest(qualification.runId);
    const preflight = options.normal ? normalPreflight(ex, sessionId, storage, started, qualification) : {
      version: 1, workerId: ex.workerId,
      binding: { operationId: ex.opB, permitId: `permit-${ex.index}`, mainSessionId: sessions.b.sessionId, providerGeneration: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        configDigest: sha256(fs.readFileSync(layout.b.a2aConfig)), projectId: f.plan.transport.projectId, conversationId: ex.conversationId,
        questionId: ex.questionId, exchangeId: ex.exchangeId },
      sessionId,
      qualification: { version: 1, runId: qualification.runId, fixtureSha256: qualification.fixtureSha256, canaries: manifest.canaries, canaryBytes: manifest.canaryBytes },
      loaders: { joined: loader('extension.js'), worker: loader('index.js') },
      extensionPid: extensions.b.pid, runtime: { version: '1.0.102-fixture', protocolVersion: 3 }, model: f.plan.models.worker,
      storage,
      sessionStorage: options.sessionStorage === 'none' ? { kind: 'none', metadataSessionId: sessionId } : { kind: 'workspace', metadataSessionId: sessionId,
        workspacePath: workspace, directory: { dev: directory.dev.toString(), ino: directory.ino.toString() } },
      catalog: [{ name: WORKER_TOOLS.inventory, schemaSha256: 'a'.repeat(64) }, { name: WORKER_TOOLS.read, schemaSha256: 'b'.repeat(64) }],
      ambient: { instructionSources: 0, skills: 0, enabledSkills: 0, mcpServers: 0, extensions: 0, customAgents: 0, selectedAgent: false },
      probes: PROBES, startedAt: started.time, completedAt: started.time,
    };
    options.preflight?.(preflight, ex);
    ex.b.add('worker_preflight', preflight);
    if (!(await appears(path.join(layout.fixture, `${ex.workerId}.startup-release.json`), session))) return;
    ex.b.add('worker_ready', {});
    ex.admission = `worker-admission-${ex.index}`;
    ex.b.add('worker_request_admitted', { admissionId: ex.admission });
    if (options.workerEnds && ex.kind === 'advice') {
      if (options.workerEnds.finished) ex.b.add('worker_finished', { workerId: ex.workerId, ...options.workerEnds.finished });
      const terminal = ex.b.add('terminal', { outcome: 'failed', reason: 'worker_failed', delivery: 'not_sent' });
      ex.worker.exited = iso(Date.parse(terminal.time) + 50);
      ex.b.add('cleanup', cleanupRecord(ex, storage, 'acknowledged'));
      ex.b.add('closed', { gaps: 0 });
      ex.bClosed = true;
      return;
    }
    ex.b.add('worker_evidence_pending', { workerId: ex.workerId, sessionId: preflight.sessionId, admissionId: ex.admission, toolCallId: `worker-call-${ex.index}`,
      tool: WORKER_TOOLS.inventory });
    if (ex.kind === 'cancel') {
      if (!(await unlessEnded(ex.cancelled.promise, session))) return;
      options.whileCancelled?.(ex.worker, ex.dir, { ...state, spawnFake, workspace, relative });
      const terminal = ex.b.add('terminal', { outcome: 'cancelled', reason: 'peer_cancelled', delivery: 'may_have_occurred' });
      ex.worker.exited = iso(Date.parse(terminal.time) + 100);
      ex.b.add('cleanup', cleanupRecord(ex, storage, 'acknowledged'));
      ex.b.add('closed', { gaps: 0 });
      ex.bClosed = true;
      await session.tool('dude_a2a_conversation', { op: 'read', operationId: ex.opB }, JSON.stringify({ outcome: 'cancelled', operationId: ex.opB }));
      return;
    }
    await progress(session, 'b');
    if (!(await appears(path.join(layout.fixture, `${ex.workerId}.evidence-release.json`), session))) return;
    const record101 = `${path.basename(layout.b.workspace)}/.dude/ideas/101-peer-latest.md`;
    ex.b.add('evidence_returned', { tool: 'inventory' });
    ex.b.add('evidence_returned', { tool: 'read', reference: record101 });
    const answer = { observedMaximum: 101, explanation: 'The approved records end at 101.', limitations: 'none', citations: [{ reference: record101 }] };
    const finished = ex.b.add('worker_finished', { workerId: ex.workerId, outcome: 'answered', admissionId: ex.admission, permissionDenials: {},
      observations: [{ tool: 'inventory', outcome: 'returned', reference: null }, { tool: 'read', outcome: 'returned', reference: record101 }],
      answer: { text: JSON.stringify(answer) } });
    ex.worker.exited = iso(Date.parse(finished.time) + (options.workerExitMs ?? 50));
    for (const kind of ['reply_prepared', 'reply_write_started']) ex.b.add(kind);
    ex.b.add('reply_written', { written: 'sent' });
    ex.b.add('terminal', { outcome: 'sent' });
    ex.b.add('cleanup', cleanupRecord(ex, storage, 'not_needed'));
    ex.b.add('closed', { gaps: 0 });
    ex.bClosed = true;
    for (const kind of ['reply_received', 'reply_validated']) ex.a.add(kind);
    ex.a.add('terminal', { outcome: 'answer' });
    ex.a.add('closed', { gaps: 0 });
    ex.replied.resolve(true);
    await session.tool('dude_a2a_conversation', { op: 'read', operationId: ex.opB }, JSON.stringify({ outcome: 'sent', operationId: ex.opB }));
  };

  /**
   * A: view its own ideas folder for its tentative number, begin asking once B waits, then poll its progress file and wait for the
   * answer, or poll the cue and cancel. Its model follows its instruction: the slug and question that instruction names, and its own
   * tentative number, one more than A's highest record.
   * @param {any} session @param {any} ex @param {string} prompt
   */
  const ask = async (session, ex, prompt) => {
    if (!(await session.view(path.join(layout.a.workspace, '.dude', 'ideas')))) return;
    if (!(await unlessEnded(ex.bWaiting.promise, session))) return;
    await sleep(5);
    ex.a = journal(layout.a.workspace, ex.opA);
    ex.a.add('opened');
    ex.a.add('accepted');
    const begin = { op: 'begin_ask', slug: /"slug":"([^"]+)"/.exec(prompt)?.[1], tentativeNumber: 101, question: /"question":"([^"]+)"/.exec(prompt)?.[1] };
    if (!(await session.tool('dude_a2a_conversation', begin, JSON.stringify({ outcome: 'accepted', operationId: ex.opA })))) return;
    ex.a.add('request_prepared');
    ex.a.add('request_write_started');
    ex.aAsked.resolve(true);
    if (ex.kind === 'cancel') {
      // The poll's first view comes before the cue exists, and the one that finds it right before the cancel.
      const cue = path.join(layout.a.workspace, 'cancel-a.txt');
      if (!(await session.view(cue))) return;
      if (!(await appears(cue, session))) return;
      if (!(await session.view(cue))) return;
      if (!(await session.tool('dude_a2a_conversation', { op: 'cancel', operationId: ex.opA },
        JSON.stringify({ outcome: 'cancelled', reason: 'cancelled', delivery: 'may_have_occurred', cancelled: true })))) return;
      ex.a.add('terminal', { outcome: 'cancelled', delivery: 'may_have_occurred' });
      ex.a.add('closed', { gaps: 0 });
      ex.cancelled.resolve(true);
      await session.tool('dude_a2a_conversation', { op: 'read', operationId: ex.opA }, JSON.stringify({ outcome: 'cancelled', operationId: ex.opA }));
      return;
    }
    // The poll's first view comes before the progress file exists.
    if (!(await session.view(path.join(layout.a.workspace, PROGRESS_FIXTURES.a.path)))) return;
    await progress(session, 'a');
    if (!(await unlessEnded(ex.replied.promise, session))) return;
    ex.capture = { version: 1, projectId: f.plan.transport.projectId, operationId: ex.opA, conversationId: ex.conversationId, questionId: ex.questionId,
      exchangeId: ex.exchangeId, peerCertSha256: f.certs.b.pin, reply: { sequence: 1, sha256: 'd'.repeat(64) }, observedMaximum: 101 };
    await session.tool('dude_a2a_conversation', { op: 'read', operationId: ex.opA },
      JSON.stringify({ outcome: 'answer', operationId: ex.opA, advice: { capture: ex.capture } }));
  };

  /**
   * The after-view control session's model and host, step by step: the model requests the one fixed view, the host asks the
   * control relay to read its target, then starts the view, reads the target and AGENTS.md as the observer records, notifies
   * the discovery, completes with the target's one line under a heading and a line number, the form a view tool might show its
   * model (no native evidence fixes that form), loads AGENTS.md, and the model replies.
   * @param {any} session
   */
  const controlView = async (session) => {
    tick('turn');
    const target = path.join(layout.control.workspace, ...AFTER_VIEW_CONTROL.target.split('/'));
    const text = /** @type {string} */ (content(AFTER_VIEW_CONTROL.target));
    const line = text.replace(/\n$/, '');
    const shown = `${target}:\n1. ${line}\n`;
    const toolCallId = `control-view-${randomUUID()}`;
    const ctx = { session, target, toolCallId, state, time, text, line, shown };
    session.viewContext = ctx;
    /** @type {Record<string, any>} */
    const events = {
      request: { type: 'assistant.message', data: { messageId: randomUUID(), originatingMessageId: session.current, content: '',
        toolRequests: [{ toolCallId, name: 'view', arguments: { path: target } }] } },
      start: { type: 'tool.execution_start', data: { toolCallId, toolName: 'view', arguments: { path: target } } },
      notification: { type: 'system.notification', data: { content: '<system_notification>instruction discovered</system_notification>',
        kind: { type: 'instruction_discovered', sourcePath: AFTER_VIEW_CONTROL.source, triggerFile: target, triggerTool: 'view', description: 'AGENTS.md' } } },
      complete: { type: 'tool.execution_complete', data: { toolCallId, success: true, result: { content: shown, detailedContent: shown } } },
      reply: { type: 'assistant.message', data: { messageId: randomUUID(), originatingMessageId: session.current, content: 'I viewed it.' } },
    };
    control.events?.(events, ctx);
    const steps = ['request', 'permission', 'start', 'reads', 'notification', 'complete', 'loaded', 'reply'];
    for (const step of control.steps ? control.steps(steps) : steps) {
      if (step === 'permission') {
        const request = { kind: 'read', toolCallId, path: target, intention: 'View the file', canOfferSessionApproval: false };
        control.permission?.(request, ctx);
        const pending = session.config.onPermissionRequest(request, { sessionId: session.sessionId });
        control.whilePermission?.(session, ctx);
        const decision = await pending;
        state.permissions.push({ side: 'control', decision: decision.kind });
        if (decision.kind !== 'approve-once') {
          session.emit({ type: 'tool.execution_complete', data: { toolCallId, success: false, error: { message: 'The user rejected this request.' } } });
          return;
        }
      } else if (step === 'reads') {
        state.canaries.push({ process: state.runtimes.control, scope: 'control', path: `work/${AFTER_VIEW_CONTROL.target}`, op: 'read', count: 1 },
          { process: state.runtimes.control, scope: 'control', path: `work/${AFTER_VIEW_CONTROL.source}`, op: 'read', count: 1 });
        control.reads?.(state, ctx);
      } else if (step === 'loaded') {
        session.loaded = true;
      } else if (events[step]) {
        session.emit(events[step]);
      }
    }
  };

  /**
   * A's capture: a view of its own ideas folder through the canonical workspace root its instruction names, the publisher command
   * through the real permission relay, then its ledger and causal receipt.
   * @param {any} session
   */
  const captureStep = async (session) => {
    await sleep(2);
    if (!(await session.view(path.join(fs.realpathSync.native(layout.a.workspace), '.dude', 'ideas')))) return;
    const ex = state.exchanges[0];
    const stage = path.join(layout.a.temp, 'stage');
    fs.mkdirSync(stage, { recursive: true });
    const stagedLedger = path.join(stage, 'ledger.md');
    const stagedAdvice = path.join(stage, 'advice.json');
    const command = `node .github/skills/dude-feature-definition/publish-first-capture.mjs --root . --slug ${f.plan.capture.slug} --stage ${stagedLedger} `
      + `--number-advice ${stagedAdvice}`;
    const toolCallId = `a-publish-${randomUUID()}`;
    session.emit({ type: 'assistant.message', data: { messageId: randomUUID(), originatingMessageId: session.current, content: '',
      toolRequests: [{ toolCallId, name: 'powershell', arguments: { command, description: 'publish' } }] } });
    const decision = await session.config.onPermissionRequest({ kind: 'shell', toolCallId, fullCommandText: command, intention: 'x', commands: [], possiblePaths: [],
      possibleUrls: [], hasWriteFileRedirection: false, canOfferSessionApproval: false }, { sessionId: session.sessionId });
    state.permissions.push({ side: 'a', decision: decision.kind });
    if (decision.kind !== 'approve-once') return;
    session.emit({ type: 'tool.execution_start', data: { toolCallId, toolName: 'powershell', arguments: { command } } });
    const ideaPath = `.dude/ideas/102-${f.plan.capture.slug}.md`;
    const ledger = path.join(layout.a.workspace, ...ideaPath.split('/'));
    fs.writeFileSync(ledger, `---\nslug: ${f.plan.capture.slug}\n---\n`);
    const receiptFile = path.join(layout.a.workspace, '.dude', 'state', 'a2a', 'captures', `${ex.opA}.json`);
    fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
    const { observedMaximum, version, ...conversation } = ex.capture;
    fs.writeFileSync(receiptFile, JSON.stringify({ version: 1, kind: 'number_advice_receipt', ideaPath, slug: f.plan.capture.slug,
      ledgerSha256: sha256(fs.readFileSync(ledger)), conversation,
      selection: { freshLocalMaximum: 100, peerObservedMaximum: observedMaximum, localOnlyNumber: 101, chosenNumber: 102, influence: 'raised' } }));
    session.emit({ type: 'tool.execution_complete', data: { toolCallId, success: true, result: { content: `Captured ${ideaPath}\n` } } });
  };

  /**
   * What each main does with one root prompt. `options.strayTools`, when given, names extension tool calls that main's model makes
   * first in that turn, each through its relay, before anything the instruction asks for. A call `options.lateTool` names is requested
   * in that turn, and its permission request reaches the relay first in that main's next turn.
   * @param {string} side @param {any} session @param {string} prompt
   */
  const behave = async (side, session, prompt) => {
    if (side === 'a' || side === 'b') {
      const late = lateCalls[side];
      lateCalls[side] = null;
      if (late) await late.permission('late');
      for (const [name, args] of options.strayTools?.(side, prompt) ?? []) await session.tool(name, args, 'stray');
      const held = options.lateTool?.(side, prompt);
      if (held) lateCalls[side] = session.modelRequest(held[0], held[1]);
    }
    if (side === 'controlView' && prompt.startsWith('Feature 089 native qualification, after-view control.')) {
      await controlView(session);
    } else if (prompt.startsWith('Feature 089 native qualification, proposal step.')) {
      const runId = JSON.parse(fs.readFileSync(layout.b.a2aConfig, 'utf8')).profiles.b.collaboration.worker.qualification.runId;
      const worker = /** @type {any} */ (f.plan).auth?.worker?.expectedAccount;
      const text = ['Proposal only: nothing is activated. Review this entire native tool result before local approval.', `Proposal: ${side}`,
        `Local: ${session.sessionId}; provider 6ba7b810-9dad-11d1-80b4-00c04fd430c8; workspace ${layout[side].workspace}`,
        'SHARING: Lifecycle record numbers; excludes Everything else',
        ...(side === 'b' && options.normal ? ['WORKER: separate from SHARING and COMMANDS',
          `Worker sign-in and model: existing saved sign-in, expected ${worker.login} at ${worker.host} on the runtime and its session, checked, not locked; `
            + `nothing is read, copied, or shown here; no login or fallback; model ${f.plan.models.worker}`,
          `QUALIFICATION: run ${runId}; fixture ${layout.fixture} sha256:${'0'.repeat(64)}; latches only, with no canaries or probes`] : []),
        ...(side === 'b' && !options.normal
          ? ['WORKER: separate from SHARING and COMMANDS', `QUALIFICATION: run ${runId}; fixture ${layout.fixture} sha256:${'0'.repeat(64)}`] : []),
        `Approval: dude a2a approve ${side.repeat(12)}; current matching proposal/context only, consumed once`,
        'Next: after complete review, type or paste the exact current approval as the next eligible local root input. To decline or cancel, use dude a2a stop.',
      ].join('\n');
      await session.tool('dude_a2a_propose', { configPath: layout[side].a2aConfig, profileId: side }, options.proposal ? options.proposal(text, side) : text);
    } else if (prompt.startsWith('dude a2a approve ')) {
      session.emit({ type: 'session.info', data: { infoType: 'notification', message: `Activation: active; ${side === 'b' ? 'serve' : 'ask'} profile ${side}; listening` } });
    } else if (prompt.startsWith('Feature 089 native qualification. Do every step')) {
      const index = side === 'b' ? counts.b++ : counts.a++;
      const ex = exchange(index);
      ex.kind = index === 0 ? 'advice' : 'cancel';
      await (side === 'b' ? serve(session, ex) : ask(session, ex, prompt));
    } else if (prompt.startsWith('Feature 089 native qualification, capture step.')) {
      await captureStep(session);
    }
  };
  return { state, observer, sdk, discovery, sessions, layout, spawnFake };
}

/** A promise with its resolver, and whether it settled. */
function deferred() {
  /** @type {(value: any) => void} */
  let resolve = () => undefined;
  const handle = { promise: /** @type {Promise<any>} */ (new Promise((settle) => { resolve = settle; })), settled: false,
    resolve: (/** @type {any} */ value) => { handle.settled = true; resolve(value); } };
  return handle;
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * What `promise` settles to, or `{kind: 'no_answer'}` once `ms` pass first; the timer never outlives the race.
 * @param {Promise<any>} promise @param {number} ms
 */
async function within(promise, ms) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve({ kind: 'no_answer' }), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The run's clock for a controlled slice: real time plus an offset a test moves forward. While frozen, real time does not pass on it
 * and only `advance` moves it, so a phase's elapsed time is exactly what a test advanced; thawing resumes real time from there.
 */
function testClock() {
  let offset = 0;
  /** @type {number | null} */
  let frozen = null;
  return {
    now: () => (frozen ?? Date.now()) + offset,
    advance: (/** @type {number} */ ms) => { offset += ms; },
    freeze: () => { frozen ??= Date.now(); },
    thaw: () => {
      if (frozen === null) return;
      offset -= Date.now() - frozen;
      frozen = null;
    },
  };
}

/** The worker's fixed preflight probes and their only accepted causes, as its record carries them. */
const PROBES = [['dude-a2a-preflight-inventory', 'invalid_arguments'], ['dude-a2a-preflight-control-before', 'unknown_tool_lookup'],
  ['dude-a2a-preflight-read', 'not_listed'], ['dude-a2a-preflight-view', 'unoffered_tool_lookup'], ['dude-a2a-preflight-create', 'unoffered_tool_lookup'],
  ['dude-a2a-preflight-shell', 'unoffered_tool_lookup'], ['dude-a2a-preflight-mcp', 'unoffered_tool_lookup'],
  ['dude-a2a-preflight-control-after', 'unknown_tool_lookup'], ['dude-a2a-preflight-inventory-after', 'invalid_arguments']]
  .map(([id, cause]) => ({ id, name: id.replace('dude-a2a-preflight-', ''), argumentsSha256: 'c'.repeat(64), shape: cause.endsWith('_lookup') ? 'rpc_error' : 'result',
    code: cause.endsWith('_lookup') ? -32602 : null, templateSha256: null, cause }));

/**
 * One controlled run against the scripted host, from consent on: the consent
 * literal, the after-view control's permission answers (`control`, one
 * typed `approve-once` by default), both approvals, then `answers` are typed.
 * `host`, `control`, and `answers` may be factories of the slice's clock
 * (and, for `answers` and `control`, its plan fixture); `expiresInMs` is the
 * plan's scope lifetime. Every observation comes from the scripted host's
 * public events and records; nothing stands in for one.
 * @param {{host?: HostOptions | ((time: any) => HostOptions), control?: any[] | ((time: any, f: ReturnType<typeof planFixture>, host: any) => any[]),
 *   approvals?: any[], answers?: any[] | ((time: any, f: ReturnType<typeof planFixture>) => any[]), expiresInMs?: number}} [options]
 */
async function slice({ host: hostOptions = {}, control = ['approve-once'], approvals = ['dude a2a approve bbbbbbbbbbbb', 'dude a2a approve aaaaaaaaaaaa'],
  answers = [], expiresInMs } = {}) {
  const f = planFixture({ expiresInMs });
  const time = testClock();
  const host = scriptedHost(f, time, typeof hostOptions === 'function' ? hostOptions(time) : hostOptions);
  const { scope } = scopeOf(f);
  // The scripted human answers exactly what this slice expects to be asked. A further prompt means the run went on past where the
  // test expected it to stop, so a fault it should have stopped at went unnoticed: that prompt gets EOF, the consented scope runs out
  // at once so every later wait ends at its next check, and the slice fails here, saying where the run was.
  const terminal = fakeTerminal([consentLiteral(scope.scopeSha256), ...(typeof control === 'function' ? control(time, f, host) : control), ...approvals,
    ...(typeof answers === 'function' ? answers(time, f) : answers)],
  { onUnscripted: () => time.advance(Math.max(0, Date.parse(f.plan.expiresAt) - time.now()) + 1_000) });
  const result = await controlled(f, {
    terminal,
    clock: time.now,
    loadSdk: async () => host.sdk,
    startObserver: () => host.observer,
    runHelper: async (/** @type {string} */ file) => {
      fs.writeFileSync(file, 'dude-a2a-calibration\n', { flag: 'wx' });
      const helper = host.spawnFake('root@1', process.execPath);
      helper.exited = new Date(time.now()).toISOString();
      host.state.files.push({ process: helper.key, class: 'proof', op: 'create', count: 1 }, { process: helper.key, class: 'proof', op: 'read', count: 1 });
      return { pid: helper.pid };
    },
  });
  assert.deepEqual(terminal.unscripted, [], 'the run asked what this test never scripted, so it went on past where the test expected it to stop '
    + `(${result.report.reason}: ${result.report.detail}; phases ${phaseList(result.report).map(([id, status]) => `${id}:${status}`).join(' ')}; `
    + `failed checks: ${failedChecks(result.report).join(', ') || 'none'})`);
  return { result, host, terminal, f, time, layout: host.layout };
}

/** @param {any} report @param {string} id */
const checkOf = (report, id) => report.checks.find((/** @type {any} */ entry) => entry.id === id);
/** @param {any} report */
const failedChecks = (report) => report.checks.filter((/** @type {any} */ entry) => entry.status !== 'passed').map((/** @type {any} */ entry) => entry.id);
/** Release files the run wrote below its fixture. @param {any} layout */
const releases = (layout) => fs.readdirSync(layout.fixture).filter((name) => name.endsWith('-release.json')).map((name) => name.replace(/^[0-9a-f-]{36}\./, '')).sort();
/** @param {any} report */
const phaseList = (report) => report.phases.map((/** @type {any} */ entry) => [entry.id, entry.status]);

/**
 * A text the run sent, with the identifiers this test run made up replaced by fixed placeholders: the test-owned folder its paths
 * sit under (as written, and as a JSON string escapes it) and every UUID-shaped identifier. A negative check of the fixed wording then
 * depends neither on random digits in those identifiers nor on the machine's temp path, and still sees everything else.
 * @param {string} text @param {string} folder
 */
function withoutRunIdentifiers(text, folder) {
  return text.split(folder).join('<test folder>').split(JSON.stringify(folder).slice(1, -1)).join('<test folder>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
}

test('the observer is owned before it is ready: a refusal closes it with EOF and awaits its exit, and an uncalibrated observer is still stopped, drained, and checked', async () => {
  const f = planFixture();
  const { scope } = scopeOf(f);
  /** @type {string[]} */
  const closes = [];
  const refused = await controlled(f, {
    terminal: fakeTerminal([consentLiteral(scope.scopeSha256)]),
    startObserver: () => ({ pid: 4_444, ready: Promise.resolve({ ok: false, reason: 'observer_privilege_missing' }), snapshot: async () => { throw new Error('no'); },
      stop: async () => { throw new Error('no'); }, close: async (/** @type {number} */ ms) => { closes.push(`close ${ms}`); return { exited: false, code: null }; } }),
  });
  assert.equal(refused.report.reason, 'observer_privilege_missing', refused.report.detail);
  assert.equal(refused.calls.loadSdk, 0, 'no SDK loaded and no runtime started');
  assert.deepEqual(phaseList(refused.report), [['consent', 'passed'], ['revalidate', 'passed'], ['prepare', 'passed'], ['observe', 'failed']]);
  assert.deepEqual(closes, [`close ${NATIVE_LIMITS.observerExitMs}`], 'the helper it started is closed with EOF and its exit awaited, whatever readiness said');
  assert.deepEqual([checkOf(refused.report, 'final_observer_exit')?.status, refused.report.observer.exit], ['failed', { exited: false, code: null }],
    'an exit not seen within the bound is reported unconfirmed; nothing is killed');
  const layout = layoutOf(f.plan.fixtureParent);
  const input = JSON.parse(fs.readFileSync(path.join(layout.proof, 'observer-input.json'), 'utf8'));
  assert.deepEqual(Object.keys(input).sort(), ['canaries', 'classes', 'controlRoots', 'limits', 'output', 'rootPid', 'runId', 'version', 'workerParent']);
  assert.equal(input.rootPid, process.pid, 'the only root is this process');
  assert.deepEqual(input.limits, { processes: 128, summaryBytes: 65_536 });
  assert.equal(input.workerParent, layout.b.temp);
  const kept = JSON.parse(fs.readFileSync(path.join(layout.proof, 'report.json'), 'utf8'));
  assert.equal(kept.reason, 'observer_privilege_missing', 'the bounded report is kept beside the fixture, outside every journal');

  const g = planFixture();
  const time = testClock();
  const host = scriptedHost(g, time);
  const uncalibrated = await controlled(g, {
    terminal: fakeTerminal([consentLiteral(scopeOf(g).scope.scopeSha256)]), clock: time.now,
    startObserver: () => host.observer,
    runHelper: async () => ({ pid: 999_999 }),
  });
  assert.equal(uncalibrated.report.reason, 'observer_calibration_failed', uncalibrated.report.detail);
  assert.equal(uncalibrated.calls.loadSdk, 0);
  assert.equal(host.state.stopped, 1, 'the observer\'s own session is still stopped and drained');
  assert.equal(checkOf(uncalibrated.report, 'final_coverage')?.status, 'passed', 'the final summary is checked on a failure path too');
});

test('the control runtime recognizes every canary form from parsed discovery, then exactly one fresh model-running session must show the after-view activation: a host that sends no discovery notification after the genuine view stops the run there, and no main starts', async () => {
  const { result, host, layout, f } = await slice({ host: { control: { steps: (steps) => steps.filter((step) => step !== 'notification') } } });
  const { report } = result;
  assert.equal(report.reason, 'ambient_state_unobservable', report.detail);
  assert.deepEqual(report.canaries.failed, []);
  assert.deepEqual(report.canaries.rows.filter((/** @type {any} */ row) => row.status === 'recognized').map((/** @type {any} */ row) => row.form), ['agent:project',
    'agent:user', 'instructions:copilot', 'instructions:agents', 'instructions:path_specific', 'hooks:repository', 'skills:project', 'skills:user', 'mcp:workspace',
    'mcp:user', 'git'], 'every model-less form, and no stand-in row for the after-view trigger');
  assert.equal('prerequisites' in report, false, 'no synthetic prerequisite exists to stand in for an observation');
  const discovery = host.sessions.control.config;
  assert.deepEqual([discovery.availableTools, discovery.enableConfigDiscovery, discovery.skipCustomInstructions, discovery.enableOnDemandInstructionDiscovery,
    discovery.enableFileHooks, discovery.enableSkills, discovery.enableHostGitOperations, discovery.requestExtensions, discovery.mcpServers],
  [[], false, true, false, false, false, true, false, {}], 'the discovery-only session offers no tool and activates nothing; host Git context for the Git form');
  assert.deepEqual(host.state.modes, { control: 'empty' }, 'the control runtime uses empty mode, and no main started');
  const view = host.sessions.controlView.config;
  const target = path.join(layout.control.workspace, 'dude-canary-denied-read.txt');
  assert.deepEqual({ model: view.model, workingDirectory: view.workingDirectory, availableTools: view.availableTools,
    skipCustomInstructions: view.skipCustomInstructions, enableOnDemandInstructionDiscovery: view.enableOnDemandInstructionDiscovery,
    enableConfigDiscovery: view.enableConfigDiscovery, additionalDirectories: view.additionalDirectories, enableFileHooks: view.enableFileHooks,
    enableSkills: view.enableSkills, memory: view.memory, enableSessionStore: view.enableSessionStore, enableHostGitOperations: view.enableHostGitOperations,
    requestExtensions: view.requestExtensions, mcpServers: view.mcpServers }, {
    model: f.plan.models.a, workingDirectory: layout.control.temp, availableTools: ['builtin:view'], skipCustomInstructions: false,
    enableOnDemandInstructionDiscovery: true, enableConfigDiscovery: false, additionalDirectories: [], enableFileHooks: false, enableSkills: false,
    memory: { enabled: false }, enableSessionStore: false, enableHostGitOperations: false, requestExtensions: false, mcpServers: {},
  }, 'A\'s model, only the built-in view, custom and on-demand instructions on, everything else off, in the control\'s temp folder');
  for (const absent of ['tools', 'customAgents', 'hooks', 'hookDirectories', 'skillDirectories', 'agent']) assert.equal(absent in view, false, absent);
  assert.equal(typeof view.onEvent, 'function', 'its event callback is registered at creation');
  assert.deepEqual(host.state.log.filter((entry) => /^(?:start|createSession|disconnect|stop|forceStop) /.test(entry)), ['start control', 'createSession control',
    'disconnect control', 'createSession controlView', 'disconnect controlView', 'stop control'],
  'the discovery session is disconnected, one fresh session runs in the same runtime, and only owned lifecycle stops end it');
  assert.deepEqual(host.state.prompts.map((entry) => [entry.side, entry.prompt]), [['controlView', afterViewPrompt(target)]], 'one fixed prompt, sent once');
  assert.deepEqual(host.state.permissions, [{ side: 'control', decision: 'approve-once' }], 'its one read was asked through the control relay');
  assert.deepEqual(failedChecks(report), ['after_view_control']);
  assert.deepEqual(report.control.problems, ['notification']);
  assert.equal(report.control.eventIds, undefined, 'no proof is kept for a control that did not show the activation');
  for (const id of ['canary_recognition', 'control_model', 'control_tools', 'control_session', 'control_initial_sources', 'control_runtime_payload']) {
    assert.equal(checkOf(report, id)?.status, 'passed', id);
  }
  assert.equal(host.state.stopped, 1);
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('literal approvals reach the exchange, both whole instructions go out together, and a served worker whose recorded session workspace no longer has its recorded inode refuses before any release, through teardown', async () => {
  const { result, host, terminal, f, layout } = await slice({ host: { preflight: (preflight) => {
    preflight.sessionStorage.directory.ino = String(BigInt(preflight.sessionStorage.directory.ino) + 1n);
  } } });
  const { report } = result;
  assert.equal(report.reason, 'preflight_mismatch', report.detail);
  assert.deepEqual(phaseList(report), [['consent', 'passed'], ['revalidate', 'passed'], ['prepare', 'passed'], ['observe', 'passed'], ['canary_control', 'passed'],
    ['start_mains', 'passed'], ['approve_b', 'passed'], ['approve_a', 'passed'], ['advice_exchange', 'failed']]);
  const operation = host.state.exchanges[0].opB.slice(0, 8);
  assert.deepEqual(failedChecks(report), [`worker_storage_${operation}`, 'final_storage']);
  assert.equal(checkOf(report, `worker_storage_${operation}`).detail, 'identity_changed');
  assert.equal(checkOf(report, 'final_storage').detail, 'worker:config:create, worker:config:create, worker:config:create, worker:config:write, '
    + 'worker:config:create, worker:config:write, worker:config:open, worker:config:open',
  'an unvalidated workspace grants nothing: the drained final summary shows its session files unclassified, read as well as written');
  for (const id of ['after_view_control', 'advice_instruction_order', 'b_begin', 'a_begin', `preflight_${operation}`, `worker_process_${operation}`,
    `worker_payload_${operation}`, 'b_runtime_payload', 'a_runtime_payload', 'control_runtime_payload', 'final_coverage', 'final_effects',
    'final_owned_tree_cessation', 'final_observer_exit']) {
    assert.equal(checkOf(report, id)?.status, 'passed', id);
  }
  assert.equal(checkOf(report, `startup_${operation}_storage`), undefined, 'nothing is classified for a release that was refused first');
  assert.deepEqual(releases(layout), [], 'no release: the worker never got its prompt');
  assert.equal(fs.existsSync(path.join(layout.a.workspace, PROGRESS_FIXTURES.a.path)), false, 'no progress fixture appeared');
  assert.deepEqual(host.state.prompts.map((entry) => [entry.side, entry.prompt.split('\n')[0]]), [
    ['controlView', 'Feature 089 native qualification, after-view control.'],
    ['b', 'Feature 089 native qualification, proposal step.'],
    ['b', 'dude a2a approve bbbbbbbbbbbb'],
    ['a', 'Feature 089 native qualification, proposal step.'],
    ['a', 'dude a2a approve aaaaaaaaaaaa'],
    ['b', 'Feature 089 native qualification. Do every step below in this one turn, in order, and nothing else. Do not ask questions or wait for new chat input.'],
    ['a', 'Feature 089 native qualification. Do every step below in this one turn, in order, and nothing else. Do not ask questions or wait for new chat input.'],
  ], 'the control ran first, alone; each approval is the typed line, relayed untouched; both whole exchange instructions are sent together, and nothing follows');
  const [receive, askPrompt] = host.state.prompts.slice(5).map((entry) => entry.prompt);
  assert.ok(receive.indexOf('"op":"begin_receive"') < receive.indexOf(PROGRESS_FIXTURES.b.path), 'the progress step is given before the operation begins');
  assert.match(receive, /Never call cancel, begin another operation, or use any other tool\./);
  assert.match(askPrompt, new RegExp(`"op":"begin_ask","slug":"${f.plan.capture.slug}"`));
  for (const entry of host.state.prompts.filter((prompt) => prompt.side === 'a')) {
    // A's prompts name paths below the random test folder; only the wording the run adds is judged for these numbers and names.
    const fixed = withoutRunIdentifiers(entry.prompt, f.base);
    for (const hidden of ['101', '102', 'peer-latest', 'peer-seed', 'observedMaximum', 'after-view', 'dude-canary', 'AGENTS.md']) {
      assert.equal(fixed.includes(hidden), false, `nothing given to A names B's records, the expected number, or the control (${hidden})`);
    }
  }
  for (const side of ['A', 'B']) {
    assert.match(terminal.text, new RegExp(`=== Session ${side}: complete native dude_a2a_propose result \\(\\d+ bytes\\) ===\\nProposal only: nothing is activated\\.`));
    assert.match(terminal.text, new RegExp(`Approval: dude a2a approve ${side.toLowerCase().repeat(12)};[^\\n]*\\nNext:[^\\n]*use dude a2a stop\\.\\n=== end of session ${side} result ===`));
  }
  assert.deepEqual(host.state.log.filter((entry) => /^(?:stop|forceStop|disconnect) /.test(entry)).sort(),
    ['disconnect a', 'disconnect b', 'disconnect control', 'disconnect controlView', 'stop a', 'stop b', 'stop control'],
    'only SDK lifecycle stops; no force-stop after a clean stop');
  assert.equal(host.state.stopped, 1, 'the observer session was stopped and drained once');
  assert.equal(report.verdict, 'controlled_only');
  assert.equal(result.exitCode, 4);
  assert.equal(JSON.stringify(report).includes('fixture-token'), false, 'no credential value reaches the report');
});

test('a complete controlled slice runs every native step on scripted public observations: the after-view control, both workers\' recorded storage classified by purpose, the held call with both mains\' own progress, the answer and its worker\'s own cleanup window, capture, cancellation, and the drained final observer, and still never qualifies', async () => {
  const { result, host, layout, f } = await slice({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'] });
  const { report } = result;
  assert.equal(report.reason, null, report.detail);
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(phaseList(report).map(([id]) => id), ['consent', 'revalidate', 'prepare', 'observe', 'canary_control', 'start_mains', 'approve_b', 'approve_a',
    'advice_exchange', 'capture', 'cancel_exchange', 'teardown', 'retained_reread']);
  assert.ok(report.phases.every((/** @type {any} */ entry) => entry.status === 'passed'));
  const [advice, cancel] = host.state.exchanges.map((/** @type {any} */ ex) => ex.opB.slice(0, 8));
  for (const id of ['canary_recognition', 'control_model', 'control_tools', 'control_session', 'control_initial_sources', 'after_view_control', 'control_cessation',
    'control_cessation_coverage', `worker_storage_${advice}`, `startup_${advice}_storage`, `worker_storage_${cancel}`, `startup_${cancel}_storage`,
    'advice_instruction_order', 'a_progress', 'b_progress', 'advice_bounds', 'advice_worker_cessation', 'advice_worker_cessation_coverage', 'a_answered_journal',
    'b_served_journal', 'capture_receipt', 'capture_publisher', 'a_journal_unchanged', 'cancel_instruction_order', 'cancellation', 'no_late_revival',
    'cancelled_worker_cessation', 'cancelled_worker_cessation_coverage',
    'final_coverage', 'final_identity', 'final_storage', 'final_effects', 'final_control_cessation', 'final_advice_worker_cessation',
    'final_cancelled_worker_cessation', 'final_owned_tree_cessation', 'final_observer_exit', 'retained_matches_live', 'human_reread']) {
    assert.equal(checkOf(report, id)?.status, 'passed', id);
  }
  assert.match(checkOf(report, `worker_storage_${advice}`).detail, /^session workspace config\/session-state\/worker-session-0: the same directory by path, device, and inode$/);
  assert.deepEqual(host.state.permissions.map((entry) => [entry.side, entry.decision]).sort(), [['a', 'approve-once'], ['a', 'approve-once'], ['b', 'approve-once'],
    ['control', 'approve-once']], 'the control\'s read, both progress edits, and the publisher command each went through a relay and a typed approve-once');
  // Each Dude tool call asked permission as a custom tool and was approved once by the main relay itself, never as typed, and only
  // counted: no per-call permission entry, and no prompt the human answered beyond the typed ones above. The two sessions' calls
  // interleave, so they are compared as sorted lists.
  const decided = (/** @type {any[]} */ entries) => entries.map((entry) => `${entry.side} ${entry.tool} ${entry.op} ${JSON.stringify(entry.decision)}`).sort();
  assert.deepEqual(decided(host.state.toolDecisions), decided([['b', 'dude_a2a_propose', null], ['a', 'dude_a2a_propose', null],
    ...[['b', 'begin_receive'], ['a', 'begin_ask'], ['b', 'read'], ['a', 'read'], ['b', 'begin_receive'], ['a', 'begin_ask'], ['b', 'read'], ['a', 'cancel'],
      ['a', 'read']].map(([side, op]) => [side, 'dude_a2a_conversation', op])].map(([side, tool, op]) => ({ side, tool, op, decision: { kind: 'approve-once' } }))));
  // Each view of a main's own workspace asked read permission and was approved once by the relay too, and only counted: A's seven views
  // (its ideas folder and both progress polls, its ideas folder in capture, and its ideas folder and both cue polls) and B's two polls.
  assert.deepEqual(report.toolApprovals, {
    b: { dude_a2a_propose: 1, 'dude_a2a_conversation.begin_receive': 2, 'dude_a2a_conversation.read': 2, 'workspace.read': 2 },
    a: { dude_a2a_propose: 1, 'dude_a2a_conversation.begin_ask': 2, 'dude_a2a_conversation.read': 2, 'dude_a2a_conversation.cancel': 1, 'workspace.read': 7 },
  });
  assert.deepEqual(host.state.reads.map((entry) => entry.decision), Array(9).fill('approve-once'));
  assert.deepEqual(report.permissions.filter((/** @type {any} */ entry) => entry.kind === 'custom-tool'), []);
  assert.deepEqual(releases(layout), ['evidence-release.json', 'startup-release.json', 'startup-release.json'], 'one evidence release; the cancelled worker never got one');
  assert.equal(report.operations.advice.workerCleanup.ok, true);
  assert.equal(report.operations.advice.workerFinishedAt, readJournalTime(layout.b.workspace, host.state.exchanges[0].opB, 'worker_finished'), 'the answering worker\'s recorded finish anchors its window');
  assert.equal(report.cancellation.terminalAt, readJournalTime(layout.b.workspace, host.state.exchanges[1].opB, 'terminal'), 'B\'s terminal anchors the cancelled window');

  // The control's bounded proof: identifiers, digests, sizes, discriminators, and before/after read counts, no content.
  const target = path.join(layout.control.workspace, 'dude-canary-denied-read.txt');
  const targetText = /** @type {string} */ (CANARIES.find((canary) => canary.path === 'dude-canary-denied-read.txt')?.content);
  const agents = /** @type {string} */ (CANARIES.find((canary) => canary.path === 'AGENTS.md')?.content);
  const control = report.control;
  // Replaces the earlier exact key list: the report now also keeps its account of refused events, which a passing control leaves empty.
  assert.deepEqual(Object.keys(control).sort(), ['admissionId', 'arguments', 'cleanup', 'eventIds', 'notification', 'os', 'output', 'problems', 'refusedEvents',
    'refusedEventsOmitted', 'sessionId', 'source', 'toolCallId']);
  assert.deepEqual([control.refusedEvents, control.refusedEventsOmitted], [[], 0], 'no event of a passing control stood outside its activation');
  assert.deepEqual([control.sessionId, control.admissionId, control.problems], ['controlView-session-0123456789', 'controlView-message-1', []]);
  assert.match(control.toolCallId, /^control-view-/);
  assert.ok(Object.values(control.eventIds).every((id) => typeof id === 'string' && UUID_PATTERN.test(id)), 'each event the proof rests on is named by its ID');
  assert.deepEqual(control.arguments, { sha256: sha256(`{"path":${JSON.stringify(target)}}`) });
  const shown = `${target}:\n1. ${targetText.replace(/\n$/, '')}\n`;
  assert.deepEqual(control.output, { bytes: Buffer.byteLength(shown), sha256: sha256(shown) },
    'the complete model-facing result, decorated as a view shows the file, by size and digest');
  assert.deepEqual([control.cleanup.stop, control.cleanup.errors, control.cleanup.forced, control.cleanup.cessation.ok, control.cleanup.cessation.running],
    ['clean', 0, 'not_needed', true, 0], 'the control runtime\'s owned stop is kept, and its whole tree was seen to end before either main started');
  assert.deepEqual(control.notification, { sourcePath: 'AGENTS.md', triggerFile: target, triggerTool: 'view' });
  assert.deepEqual(control.source, { path: 'AGENTS.md', type: 'repo', location: 'repository', bytes: Buffer.byteLength(agents), sha256: sha256(agents) });
  assert.deepEqual([control.os.target, control.os.source], [{ before: 0, after: 1 }, { before: 0, after: 1 }]);
  assert.ok(control.os.marker > control.os.baselineMarker, 'two synchronized snapshots, the baseline after every static discovery read');
  assert.equal(JSON.stringify(control).includes('Synthetic'), false, 'no canary content is kept');
  // Control evidence stays out of both mains and every journal. Everything the native branch itself sends A's and B's sessions, each
  // prompt and each session configuration, carries none of the control's identifiers, files, folders, notification kind, prompt, or
  // digests; and no report field but `control` carries its evidence.
  const source = path.join(layout.control.workspace, 'AGENTS.md');
  const evidence = [control.sessionId, control.admissionId, control.toolCallId, ...Object.values(control.eventIds), control.arguments.sha256,
    control.output.sha256, control.source.sha256, target, source, 'instruction_discovered', 'dude-canary-denied-read.txt'];
  const controlMarks = [...evidence, layout.control.workspace, layout.control.temp, 'AGENTS.md', 'after-view', 'dude-canary',
    ...afterViewPrompt(target).split('\n')];
  /** Each mark as written and as a JSON string escapes it. @param {string[]} marks */
  const spelled = (marks) => [...new Set(marks.flatMap((mark) => [mark, JSON.stringify(mark).slice(1, -1)]))];
  const sent = host.state.prompts.filter((prompt) => prompt.side === 'a' || prompt.side === 'b');
  assert.deepEqual(sent.map((entry) => entry.side).sort(), ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b'], 'every prompt A and B were sent is judged');
  for (const [label, text] of [...sent.map((entry) => [`${entry.side}: ${entry.prompt.split('\n')[0]}`, entry.prompt]),
    ...['a', 'b'].map((side) => [`${side}'s session configuration`, JSON.stringify(host.sessions[side].config)])]) {
    for (const mark of spelled(controlMarks)) assert.equal(text.includes(mark), false, `${label} carries the control's ${mark}`);
  }
  const { control: kept, ...elsewhere } = report;
  assert.equal(kept, control);
  const reportText = JSON.stringify(elsewhere);
  for (const mark of spelled(evidence)) assert.equal(reportText.includes(mark), false, `a report field other than control carries ${mark}`);
  // A is given no B record, peer maximum, or expected number: not B's folder, nor such a number or name in the wording the run adds.
  for (const entry of sent.filter((prompt) => prompt.side === 'a')) {
    for (const mark of spelled([layout.b.workspace])) assert.equal(entry.prompt.includes(mark), false, `a: ${entry.prompt.split('\n')[0]} names B's workspace`);
    const fixed = withoutRunIdentifiers(entry.prompt, f.base);
    for (const hidden of ['101', '102', 'peer-latest', 'peer-seed', 'observedMaximum']) {
      assert.equal(fixed.includes(hidden), false, `a: ${entry.prompt.split('\n')[0]} names ${hidden}`);
    }
  }
  for (const entry of sent) {
    assert.equal(/after-view|AGENTS\.md|dude-canary/.test(entry.prompt), false, `${entry.side}: ${entry.prompt.split('\n')[0]}`);
  }
  // The scripted host writes these journals and the native branch has no journal-write path; this only keeps any future one honest.
  for (const workspace of [layout.a.workspace, layout.b.workspace]) {
    const journals = path.join(workspace, '.dude', 'state', 'a2a');
    for (const name of fs.readdirSync(journals).filter((file) => file.endsWith('.jsonl'))) {
      assert.equal(/after-view|instruction_discovered|controlView/.test(fs.readFileSync(path.join(journals, name), 'utf8')), false, name);
    }
  }
  assert.equal(f.plan.models.a, host.sessions.controlView.config.model, 'the control used A\'s disclosed model');
  assert.equal('prerequisites' in report, false);
  assert.deepEqual([report.verdict, report.layer, result.exitCode], ['controlled_only', 'controlled_test: injected adapters; never native evidence', 4],
    'a controlled slice never qualifies, however far it runs and however completely every scripted observation matches');
});

/**
 * Each permission ask shown in `text`: its side label, its one-line summary, and the block right below that summary up to its bare
 * prompt, with the time left written as N.
 * @param {string} text
 */
const permissionAsks = (text) => [...text.matchAll(/\n\[(A|B|CONTROL) permission\] ([^\n]*)\n/g)].map((match) => {
  const start = /** @type {number} */ (match.index) + match[0].length;
  return [match[1], match[2], text.slice(start, text.indexOf('\n> ', start) + 3).replace(/Time limit: \d+ seconds\./, 'Time limit: N seconds.')];
});
/** The block a permission ask shows below its summary. @param {string} label @param {string} time */
const permissionBlock = (label, time) => shownBlock([`ACTION NEEDED: Approve or reject the ${label} request above`,
  'Type or paste this line, then press Enter:', '', '    approve-once', '', 'To reject it instead, enter: reject', `Any other line also rejects it. Time limit: ${time}.`]);
/** The block below a proposal, naming its approval line or saying how to find it. @param {string} side @param {string[]} enter */
const approvalBlock = (side, enter) => shownBlock([`ACTION NEEDED: Approve session ${side}'s proposal above`, ...enter, '',
  'To decline, enter instead: dude a2a stop', 'Any other line stops the run. Time limit: 5 minutes.']);
/** @param {string} code */
const namedApproval = (code) => ['Type or paste this line, then press Enter:', '', `    dude a2a approve ${code}`];

test('every human prompt of a run is a bare "> " under an action block naming the exact line to enter, its one alternative, and the time left: the consent, the control\'s read, both approvals, each main permission, and the retained reread, with every input valid and each pasted line relayed exactly as entered', async () => {
  /** @param {string} line */
  const pasted = (line) => ({ paste: `${line}\r\n` });
  const { result, host, terminal, layout } = await slice({ control: [pasted('approve-once')],
    approvals: [pasted('dude a2a approve bbbbbbbbbbbb'), { paste: '  dude a2a approve aaaaaaaaaaaa \r' }],
    answers: ['approve-once', pasted('approve-once'), 'approve-once', pasted('reread reviewed')] });
  const { report } = result;
  assert.equal(report.reason, null, report.detail);
  assert.deepEqual(failedChecks(report), [], 'every input is valid, so only what was shown is judged here');
  assert.deepEqual(terminal.prompts, Array(8).fill('> '), 'each of the eight prompts is only "> "');
  const shown = terminal.text;
  assert.equal(blocksFor(shown, consentLiteral(result.scope.scopeSha256)), 1, 'the consent block names this scope\'s literal');

  // The control's read and each main request keep their one-line summary, right above a block naming approve-once and reject.
  const asks = permissionAsks(shown);
  assert.deepEqual(asks.map(([label]) => label).sort(), ['A', 'A', 'B', 'CONTROL'], 'the control\'s read, both progress edits, and the publisher command');
  for (const [label, summary, block] of asks) assert.equal(block, permissionBlock(label, 'N seconds'), `${label}: ${summary}`);
  assert.equal(asks.find(([label]) => label === 'CONTROL')?.[1], `read ${path.join(layout.control.workspace, 'dude-canary-denied-read.txt')}`);

  // Each approval block follows its complete proposal and names that proposal's own approval line; the entered line alone is relayed.
  for (const [side, code] of [['B', 'bbbbbbbbbbbb'], ['A', 'aaaaaaaaaaaa']]) {
    assert.ok(shown.includes(`=== end of session ${side} result ===\n${approvalBlock(side, namedApproval(code))}`),
      `${side}'s block names its own proposal's approval line`);
  }
  assert.deepEqual(host.state.prompts.filter((entry) => entry.prompt.startsWith('dude a2a ')).map((entry) => [entry.side, entry.prompt]),
    [['b', 'dude a2a approve bbbbbbbbbbbb'], ['a', 'dude a2a approve aaaaaaaaaaaa']],
    'each pasted approval is relayed exactly as entered, without its line end or surrounding spaces');

  // The reread block comes after the last retained journal.
  const retained = shown.lastIndexOf('\n=== Retained ');
  const reread = shown.indexOf(RULE, retained);
  assert.ok(retained > 0 && reread > retained, 'the retained journals were shown before the block');
  assert.equal(shown.slice(reread, shown.indexOf('\n> ', reread) + 3), shownBlock(['ACTION NEEDED: Compare the journals above with what you saw live',
    'Type or paste this line, then press Enter:', '', '    reread reviewed', '', 'Any other line fails the run. Time limit: 10 minutes.']));
  assert.equal(checkOf(report, 'human_reread')?.status, 'passed', 'the pasted acknowledgement counts');
});

test('an approval prompt whose proposal does not hold exactly one Approval line names no code: its block says where to find the line, the human still enters it, and only that entered line is relayed', async () => {
  // A worker whose recorded session workspace changed stops the run at the exchange, after both approvals: every input up to there is
  // valid, so only the shown blocks and the relayed lines are judged.
  const preflight = (/** @type {any} */ record) => {
    record.sessionStorage.directory.ino = String(BigInt(record.sessionStorage.directory.ino) + 1n);
  };
  const { result, host, terminal } = await slice({ host: { preflight,
    proposal: (text, side) => (side === 'b' ? text.replace(/^Next: /m, 'Approval: dude a2a approve cccccccccccc; repeated\nNext: ') : text) } });
  assert.equal(result.report.reason, 'preflight_mismatch', result.report.detail);
  assert.deepEqual(phaseList(result.report).slice(-3), [['approve_b', 'passed'], ['approve_a', 'passed'], ['advice_exchange', 'failed']]);
  const shown = terminal.text;
  assert.ok(shown.includes(`=== end of session B result ===\n${approvalBlock('B', [
    'Its approval line could not be picked out exactly once, so it',
    'is not repeated here. To approve, type or paste the proposal\'s',
    'own "dude a2a approve ..." line (from its Approval: line, up to',
    'the ";"), then press Enter.',
  ])}`), `B's block says where to find the line:\n${shown.slice(shown.indexOf('=== end of session B result ==='), shown.indexOf('=== Session A'))}`);
  const blockB = shown.slice(shown.indexOf('=== end of session B result ==='), shown.indexOf('\n> ', shown.indexOf('=== end of session B result ===')));
  assert.doesNotMatch(blockB, /bbbbbbbbbbbb|cccccccccccc/, 'neither code is picked or invented');
  assert.ok(shown.includes(`=== end of session A result ===\n${approvalBlock('A', namedApproval('aaaaaaaaaaaa'))}`), 'A\'s single line is still named');
  assert.deepEqual(host.state.prompts.filter((entry) => entry.prompt.startsWith('dude a2a ')).map((entry) => [entry.side, entry.prompt]),
    [['b', 'dude a2a approve bbbbbbbbbbbb'], ['a', 'dude a2a approve aaaaaaaaaaaa']], 'only the lines the human entered are relayed');
});

test('an approval block names only the code of its proposal\'s one Approval line; a missing, repeated, or unusual Approval line gets directions instead, never a picked or invented code; and the time left reads in whole seconds, then minutes', () => {
  /** @param {string[]} approvals */
  const proposal = (approvals) => ['Proposal only: nothing is activated. Review this entire native tool result before local approval.',
    'SHARING: Lifecycle record numbers; excludes Everything else', ...approvals,
    'Next: after complete review, type or paste the exact current approval as the next eligible local root input. To decline or cancel, use dude a2a stop.',
  ].join('\n');
  const one = 'Approval: dude a2a approve 0123456789ab; current matching proposal/context only, consumed once; grants SHARING and the separate WORKER '
    + 'scope together';
  assert.deepEqual(approvalAction('b', proposal([one])), { title: 'Approve session B\'s proposal above', line: 'dude a2a approve 0123456789ab',
    alternative: 'To decline, enter instead: dude a2a stop', note: 'Any other line stops the run.' });
  assert.equal(`${actionBlock(approvalAction('b', proposal([one])), NATIVE_LIMITS.approvalMs)}> `, approvalBlock('B', namedApproval('0123456789ab')));
  const directions = ['Its approval line could not be picked out exactly once, so it', 'is not repeated here. To approve, type or paste the proposal\'s',
    'own "dude a2a approve ..." line (from its Approval: line, up to', 'the ";"), then press Enter.'];
  for (const [label, approvals] of /** @type {Array<[string, string[]]>} */ ([
    ['no Approval line', []],
    ['two Approval lines', [one, 'Approval: dude a2a approve ba9876543210; repeated']],
    ['another Approval line beside it', [one, 'Approval: none']],
    ['a code that is not one plain token', ['Approval: dude a2a approve 0123\u001b456789ab; current matching proposal/context only, consumed once']],
    ['a code with a space in it', ['Approval: dude a2a approve 0123 456789ab; current matching proposal/context only, consumed once']],
    ['no code before the ";"', ['Approval: dude a2a approve ; current matching proposal/context only, consumed once']],
    ['no ";" after the code', ['Approval: dude a2a approve 0123456789ab']],
  ])) {
    const action = approvalAction('a', proposal(approvals));
    assert.equal(action.line, null, label);
    assert.equal(`${actionBlock(action, NATIVE_LIMITS.approvalMs)}> `, approvalBlock('A', directions), label);
  }
  // The time left until the prompt's deadline, rounded to the second: whole seconds below two minutes, then minutes and seconds.
  const time = (/** @type {number} */ ms) => /Time limit: ([^.]*)\./.exec(actionBlock({ title: 't', line: 'x', note: 'n' }, ms))?.[1];
  assert.deepEqual([600_000, 599_999, 300_000, 287_000, 121_000, 119_400, 60_000, 45_000, 1_000, 200].map(time), ['10 minutes', '10 minutes',
    '5 minutes', '4 minutes 47 seconds', '2 minutes 1 second', '119 seconds', '60 seconds', '45 seconds', '1 second', '1 second']);
  assert.doesNotMatch(actionBlock({ title: 'x\u001b[2Jy', line: 'z', note: 'n' }, 1_000), /\u001b/, 'every line of a block is terminal-safe');
});

/** The time of the first record of one kind in a journal. @param {string} workspace @param {string} operationId @param {string} kind */
function readJournalTime(workspace, operationId, kind) {
  const lines = fs.readFileSync(journalPathOf(workspace, operationId), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return lines.find((record) => record.kind === kind)?.time ?? null;
}

test('the observed instruction order is an acceptance condition: B requesting begin while A\'s whole instruction is still unadmitted fails, though A then receives it', async () => {
  const { result, host, layout } = await slice({ host: { aSendDelayMs: 40 } });
  const { report } = result;
  assert.equal(report.reason, 'instruction_order_unproven', report.detail);
  assert.deepEqual(failedChecks(report), ['advice_instruction_order']);
  assert.match(checkOf(report, 'advice_instruction_order').detail, /admission_after_begin/);
  assert.deepEqual(host.state.prompts.slice(5).map((entry) => entry.side), ['b', 'a'], 'A did receive its whole instruction, only too late');
  assert.deepEqual(releases(layout), [], 'nothing was released after the order failed');
  assert.equal(fs.existsSync(path.join(layout.b.workspace, PROGRESS_FIXTURES.b.path)), false);
});

test('the answering worker\'s own cleanup window is judged before capture: a descendant exiting 10 001 ms after its recorded finish fails, though it ended long before teardown', async () => {
  const { result, host } = await slice({ host: { workerExitMs: 10_001 }, answers: ['approve-once', 'approve-once'] });
  const { report } = result;
  assert.equal(report.reason, 'cessation_unconfirmed', report.detail);
  assert.deepEqual(failedChecks(report), ['advice_worker_cessation', 'final_advice_worker_cessation'],
    'the window fails before capture, and the drained final tree shows the same late exit; nothing else failed');
  assert.match(checkOf(report, 'advice_worker_cessation').detail, /^0 running, 1 late, 0 unpinned, 0 missing; slowest 10001 ms after its recorded finish$/);
  assert.match(checkOf(report, 'final_advice_worker_cessation').detail, /^0 running, 1 late, 0 unpinned, 0 missing; slowest 10001 ms after its own cleanup anchor$/);
  assert.equal(host.state.prompts.some((entry) => entry.prompt.startsWith('Feature 089 native qualification, capture step.')), false, 'no capture followed');
  assert.equal(host.state.exchanges.length, 1, 'no second exchange followed');
  assert.equal(checkOf(report, 'final_owned_tree_cessation')?.status, 'passed', 'it ended long before teardown, so only its own window catches it');
});

test('the drained final summary gets every check on the success path: a forbidden access first seen during the observer\'s stop fails the run', async () => {
  const { result, host } = await slice({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'],
    host: { beforeFinal: (state) => state.files.push({ process: state.runtimes.a, class: 'real_home', op: 'read', count: 1 }) } });
  const { report } = result;
  assert.equal(report.reason, 'unexpected_native_effect', report.detail);
  assert.deepEqual(failedChecks(report), ['final_effects']);
  assert.match(checkOf(report, 'final_effects').detail, /^a:real_home:read$/);
  assert.equal(checkOf(report, 'final_observer_exit')?.status, 'passed', 'the helper\'s actual exit was still awaited after the stop reply');
  assert.deepEqual(report.phases.slice(-1).map((/** @type {any} */ entry) => [entry.id, entry.status]), [['teardown', 'failed']], 'nothing ran after teardown failed');
  assert.equal(host.state.stopped, 1);
});

test('an overflowed session log ends the proof where it is next consulted: no evidence release, capture, or later exchange follows', async () => {
  const flood = Array.from({ length: NATIVE_LIMITS.toolRequests + 1 }, (_, index) => ({ toolCallId: `flood-${index}`, name: 'view', arguments: { path: 'x' } }));
  const { result, host, layout } = await slice({ answers: ['approve-once', 'approve-once'], host: {
    duringHold: (session, side) => {
      if (side === 'b') session.emit({ type: 'assistant.message', data: { messageId: 'flood', originatingMessageId: session.current, content: '', toolRequests: flood } });
    },
  } });
  assert.equal(result.report.reason, 'observation_overflow', result.report.detail);
  assert.match(result.report.detail, /b's session event log overflowed/);
  assert.deepEqual(releases(layout), ['startup-release.json'], 'the evidence release never followed');
  assert.equal(host.state.prompts.some((entry) => entry.prompt.startsWith('Feature 089 native qualification, capture step.')), false);
  assert.equal(result.exitCode, 4);
});

test('the scope expiring while a valid permission request awaits its answer withdraws the approval: the late approve-once is refused, nothing is edited or released, and the run stops as expired', async () => {
  // The scope ends 1 s before the answer, well inside the request's own 60 s bound, so only the scope can withdraw it.
  const { result, host, layout, terminal } = await slice({ expiresInMs: 45_000,
    answers: (time, f) => [{ type: 'approve-once', before: () => time.advance(Date.parse(f.plan.expiresAt) - time.now() + 1_000) }, 'approve-once'] });
  const { report } = result;
  assert.equal(report.reason, 'scope_expired', report.detail);
  const answered = report.permissions.filter((/** @type {any} */ entry) => entry.asked && entry.side !== 'control');
  assert.deepEqual(answered.map((/** @type {any} */ entry) => entry.answer), ['approval_withdrawn', 'request_withdrawn'],
    'the typed approve-once arrived after the scope expired, and the other main\'s queued request was withdrawn before its turn');
  assert.equal(blocksFor(terminal.text, 'approve-once'), 2, 'the control\'s read and one main request were shown; the queued one never');
  assert.deepEqual(host.state.permissions.filter((entry) => entry.side !== 'control').map((entry) => entry.decision),
    host.state.permissions.filter((entry) => entry.side !== 'control').map(() => 'reject'), 'every progress request was rejected');
  for (const side of /** @type {const} */ (['a', 'b'])) {
    assert.equal(fs.readFileSync(path.join(layout[side].workspace, PROGRESS_FIXTURES[side].path), 'utf8'), PROGRESS_FIXTURES[side].initial, `${side} edited nothing`);
  }
  assert.deepEqual(releases(layout), ['startup-release.json'], 'no evidence release');
});

test('the scope expiring during discovery stops the run there: the late answer is discarded, and no main starts', async () => {
  const { result, host } = await slice({ host: (time) => ({ onDiscovery: (name) => { if (name === 'hooks') time.advance(2 * 3_600_000); } }) });
  assert.equal(result.report.reason, 'scope_expired', result.report.detail);
  assert.deepEqual(host.state.log.filter((entry) => entry.startsWith('discover ')), ['discover agents', 'discover instructions', 'discover hooks'],
    'nothing was asked after the expired answer');
  assert.deepEqual(host.state.log.filter((entry) => /^(?:start|stop) /.test(entry)), ['start control', 'stop control'], 'owned shutdown still ran');
  assert.deepEqual(host.state.prompts, []);
  assert.equal(result.report.phases.at(-1).id, 'canary_control');
});

test('a public SDK call that never answers ends at its own bound: the stuck extension list stops the run, nothing later is asked, and owned cleanup still runs', async () => {
  const { result, host } = await slice({ host: (time) => ({
    extensionsList: () => { time.advance(NATIVE_LIMITS.runtimeMs + 1); return new Promise(() => undefined); },
  }) });
  assert.equal(result.report.reason, 'extension_not_running', result.report.detail);
  assert.match(result.report.detail, /did not answer in time/);
  assert.equal(host.state.log.includes('agent.list b'), false, 'no later query ran');
  assert.equal(host.state.log.includes('start a'), false, 'A never started');
  assert.ok(host.state.log.includes('disconnect b') && host.state.log.includes('stop b'), 'the stuck session\'s client was still stopped');
  assert.deepEqual(host.state.prompts.filter((entry) => entry.side !== 'controlView'), [], 'no main was prompted');
});

test('worker startup is judged by purpose and image before any release: an unknown store under the worker\'s own folder, or a shell child with only allowed I/O, refuses', async () => {
  const unknown = await slice({ host: { workerStartup: (worker, dir, state) => {
    state.workerDirs.push({ process: worker.key, dir, area: 'config', op: 'create', count: 1 });
  } } });
  const operation = unknown.host.state.exchanges[0].opB.slice(0, 8);
  assert.equal(unknown.result.report.reason, 'ambient_storage_unclassified', unknown.result.report.detail);
  assert.deepEqual(failedChecks(unknown.result.report), [`startup_${operation}_storage`, 'final_storage'], 'the drained final summary shows the same store');
  assert.match(checkOf(unknown.result.report, `startup_${operation}_storage`).detail, /^worker:config:create$/);
  assert.match(checkOf(unknown.result.report, 'final_storage').detail, /^worker:config:create$/);
  assert.deepEqual(releases(unknown.layout), []);

  const shell = await slice({ host: { workerStartup: (worker, _dir, state) => {
    const child = state.spawnFake(worker.key, 'C:\\Windows\\System32\\cmd.exe');
    state.files.push({ process: child.key, class: 'system', op: 'read', count: 1 }, { process: child.key, class: 'device', op: 'write', count: 1 });
  } } });
  const shellOperation = shell.host.state.exchanges[0].opB.slice(0, 8);
  assert.equal(shell.result.report.reason, 'unexpected_native_effect', shell.result.report.detail);
  assert.deepEqual(failedChecks(shell.result.report), [`startup_${shellOperation}_effects`, 'final_effects'], 'the drained final summary shows the same child');
  assert.match(checkOf(shell.result.report, `startup_${shellOperation}_effects`).detail, /^worker:shell_child:cmd\.exe$/);
  assert.match(checkOf(shell.result.report, 'final_effects').detail, /^worker:shell_child:cmd\.exe$/);
  assert.deepEqual(releases(shell.layout), []);
});

test('every file access a served worker made before its storage was associated is classified by the documented purpose of the session workspace it recorded before any release: a sidecar or staging name refuses, observed absence allows no persistence, and a forged path never associates', async () => {
  // A sidecar beside the event log and an atomic staging name, written before the worker's preflight existed.
  for (const [label, file] of [['a session sidecar', 'session.db'], ['an atomic staging name', 'events.jsonl.tmp']]) {
    const sidecar = await slice({ host: { workerStartup: (worker, dir, state) => {
      state.workerDirs.push({ process: worker.key, dir, area: 'config', op: 'create', path: `${state.relative}/${file}`, count: 1 });
    } } });
    const operation = sidecar.host.state.exchanges[0].opB.slice(0, 8);
    assert.equal(sidecar.result.report.reason, 'ambient_storage_unclassified', `${label}: ${sidecar.result.report.detail}`);
    assert.equal(checkOf(sidecar.result.report, `worker_storage_${operation}`)?.status, 'passed', `${label}: the workspace itself was validated`);
    assert.deepEqual(failedChecks(sidecar.result.report), [`startup_${operation}_storage`, 'final_storage'], label);
    assert.equal(checkOf(sidecar.result.report, `startup_${operation}_storage`).detail, 'worker:config:create', label);
    assert.deepEqual(releases(sidecar.layout), [], `${label}: no release`);
  }

  // Observed absence: the same event log write has no session to serve.
  const absent = await slice({ host: { sessionStorage: 'none', workerStartup: (worker, dir, state) => {
    state.workerDirs.push({ process: worker.key, dir, area: 'config', op: 'write', path: `${state.relative}/events.jsonl`, count: 1 });
  } } });
  const absentOperation = absent.host.state.exchanges[0].opB.slice(0, 8);
  assert.equal(absent.result.report.reason, 'ambient_storage_unclassified', absent.result.report.detail);
  assert.equal(checkOf(absent.result.report, `worker_storage_${absentOperation}`).detail, 'observed absence: no session persistence is allowed');
  assert.equal(checkOf(absent.result.report, `startup_${absentOperation}_storage`).detail, 'worker:config:write');
  assert.deepEqual(releases(absent.layout), []);

  // A path the worker could not have owned never associates: the preflight itself is refused.
  const forged = await slice({ host: { preflight: (preflight) => {
    preflight.sessionStorage.workspacePath = path.join(path.dirname(preflight.storage), 'dude-a2a-w-Other', 'config', 'session-state', preflight.sessionId);
  } } });
  const forgedOperation = forged.host.state.exchanges[0].opB.slice(0, 8);
  assert.equal(forged.result.report.reason, 'preflight_mismatch', forged.result.report.detail);
  assert.equal(checkOf(forged.result.report, `preflight_${forgedOperation}`).detail, 'sessionStorage');
  assert.equal(checkOf(forged.result.report, `worker_storage_${forgedOperation}`), undefined);
  assert.deepEqual(releases(forged.layout), []);

  // Legitimate absence with no session writes passes every storage check, and grants nothing.
  const clean = await slice({ host: { sessionStorage: 'none' }, answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'] });
  assert.equal(clean.result.report.reason, null, clean.result.report.detail);
  assert.deepEqual(failedChecks(clean.result.report), []);
  assert.deepEqual([clean.result.report.verdict, clean.result.exitCode], ['controlled_only', 4]);
});

/** A run that stopped in the control phase: no main prompted or started, the control runtime stopped, and controlled only. @param {any} result @param {any} host */
function noMain(result, host) {
  assert.equal(result.report.phases.at(-1).id, 'canary_control', 'the run stopped in the control phase');
  assert.deepEqual(host.state.prompts.filter((/** @type {any} */ entry) => entry.side !== 'controlView'), [], 'no main was prompted');
  assert.equal(host.state.log.includes('start b'), false, 'no main started');
  assert.ok(host.state.log.includes('stop control'), 'the control runtime was stopped by its owned stops');
  assert.deepEqual([result.report.verdict, result.exitCode], ['controlled_only', 4]);
}

test('the after-view control runs in one fresh session under one 60-second phase deadline that no call resets, and every public fact it needs is observed: each fault fails before either main starts, and an order the plan allows passes', async () => {
  // No call takes 60 seconds, yet together they pass the phase's one deadline: there is no per-call reset. Real time is frozen on the
  // run's clock for the phase, so each case's elapsed phase time is exactly what it advances, whatever the machine's speed.
  const slow = await slice({ host: { control: { frozen: true, advance: { createSession: 20_000, model: 20_000, send: 25_000 } } } });
  assert.equal(slow.result.report.reason, 'ambient_state_unobservable', slow.result.report.detail);
  assert.match(slow.result.report.detail, /after-view control prompt was not admitted \(it answered after its deadline/);
  assert.deepEqual(failedChecks(slow.result.report), [], 'every check that ran passed; the phase deadline ended it');
  noMain(slow.result, slow.host);
  const fast = await slice({ host: { control: { frozen: true, advance: { createSession: 20_000, model: 20_000, send: 15_000 } } }, approvals: ['yes'] });
  assert.equal(checkOf(fast.result.report, 'after_view_control')?.status, 'passed', 'the same calls within the deadline pass');

  // Facts removed or changed one at a time.
  /** @type {Array<[string, ControlOptions, string, string[], string[]]>} */
  const faults = [
    ['the control runtime read nothing the observer saw', { reads: (state) => { state.canaries.splice(-2, 2); } }, 'ambient_state_unobservable',
      ['after_view_control'], ['os_target_read', 'os_source_read']],
    ['only the source was read', { reads: (state) => { state.canaries.splice(-2, 1); } }, 'ambient_state_unobservable', ['after_view_control'],
      ['os_target_read']],
    ['the reads came from outside the control runtime', { reads: (state) => { for (const row of state.canaries.slice(-2)) row.process = 'root@1'; } },
      'ambient_state_unobservable', ['after_view_control'], ['os_target_read', 'os_source_read']],
    ['observation lost events during the view', { reads: (state) => { state.health.eventsLost = 1; } }, 'ambient_state_unobservable',
      ['after_view_control', 'final_coverage'], ['os_coverage']],
    ['the loaded source has another digest', { loadedSources: (answer) => { answer.sources[0].content += 'tampered\n'; } }, 'ambient_state_unobservable',
      ['after_view_control'], ['source_mismatch']],
    ['nothing was loaded after the view', { loadedSources: (answer) => { answer.sources = []; } }, 'ambient_state_unobservable', ['after_view_control'],
      ['source_missing']],
    ['the output is not the target\'s text', { events: (events) => { events.complete.data.result.content = 'something else'; } }, 'ambient_state_unobservable',
      ['after_view_control'], ['output']],
    ['the output shows the target\'s text twice', { events: (events, ctx) => { events.complete.data.result.content = `1. ${ctx.line}\n2. ${ctx.line}\n`; } },
      'ambient_state_unobservable', ['after_view_control'], ['output']],
    ['the output is one byte over its bound', { events: (events) => {
      events.complete.data.result.content = events.complete.data.result.content.padEnd(NATIVE_LIMITS.viewOutputBytes + 1, '.');
    } }, 'ambient_state_unobservable', ['after_view_control'], ['output']],
    ['the loaded source has no type', { loadedSources: (answer) => { delete answer.sources[0].type; } }, 'ambient_state_unobservable', ['after_view_control'],
      ['source_mismatch']],
    ['the loaded source has an empty type', { loadedSources: (answer) => { answer.sources[0].type = ''; } }, 'ambient_state_unobservable', ['after_view_control'],
      ['source_mismatch']],
    ['the loaded source has an undocumented type', { loadedSources: (answer) => { answer.sources[0].type = 'agents'; } }, 'ambient_state_unobservable',
      ['after_view_control'], ['source_mismatch']],
    ['the loaded source has the documented type of another kind of file', { loadedSources: (answer) => { answer.sources[0].type = 'vscode'; } },
      'ambient_state_unobservable', ['after_view_control'], ['source_mismatch']],
    ['the loaded source lives in the working directory, which the control\'s canaries lie outside', { loadedSources: (answer) => {
      answer.sources[0].location = 'working-directory';
    } }, 'ambient_state_unobservable', ['after_view_control'], ['source_mismatch']],
    ['the notification names another trigger', { events: (events, ctx) => { events.notification.data.kind.triggerFile = path.join(path.dirname(ctx.target), 'x.txt'); } },
      'ambient_state_unobservable', ['after_view_control'], ['notification']],
    ['a source was loaded before the prompt', { initialSources: (answer) => { answer.sources.push({ id: 'p', sourcePath: 'AGENTS.md' }); } },
      'ambient_state_unobservable', ['control_initial_sources'], []],
    ['another model', { model: () => 'fixture-model-other' }, 'model_mismatch', ['control_model'], []],
    ['a second tool offered', { metadata: (answer) => { answer.tools.push({ name: 'powershell' }); } }, 'tool_offering_mismatch', ['control_tools'], []],
    ['an installed view descriptor that does not accept the fixed arguments', { descriptors: (answer) => {
      answer.tools.find((/** @type {any} */ tool) => tool.name === 'view').inputSchema.required = ['path', 'view_range'];
    } }, 'tool_offering_mismatch', ['control_tools'], []],
    ['another working directory', { snapshot: (answer) => { answer.workingDirectory = path.dirname(answer.workingDirectory); } }, 'ambient_state_unobservable',
      ['control_session'], []],
    ['a reused session', { snapshot: (answer) => { answer.alreadyInUse = true; } }, 'ambient_state_unobservable', ['control_session'], []],
    ['a remote session', { snapshot: (answer) => { answer.isRemote = true; } }, 'ambient_state_unobservable', ['control_session'], []],
    // The declared session observations the control reads, field by field: its mode, and a second statement of its model.
    ['a session in autopilot mode', { snapshot: (answer) => { answer.currentMode = 'autopilot'; } }, 'ambient_state_unobservable', ['control_session'], []],
    ['a session in plan mode', { snapshot: (answer) => { answer.currentMode = 'plan'; } }, 'ambient_state_unobservable', ['control_session'], []],
    ['a snapshot with no mode', { snapshot: (answer) => { delete answer.currentMode; } }, 'ambient_state_unobservable', ['control_session'], []],
    ['a snapshot naming another selected model', { snapshot: (answer) => { answer.selectedModel = 'fixture-model-other'; } }, 'ambient_state_unobservable',
      ['control_session'], []],
    ['the checked model under plan mode', { currentModel: (answer) => { answer.planBaseModelId = answer.modelId; } }, 'model_mismatch', ['control_model'], []],
  ];
  for (const [label, control, reason, failed, problems] of faults) {
    const { result, host } = await slice({ host: { control } });
    assert.equal(result.report.reason, reason, `${label}: ${result.report.detail}`);
    assert.deepEqual(failedChecks(result.report), failed, label);
    if (problems.length) assert.deepEqual(result.report.control.problems, problems, label);
    if (failed.every((id) => /^control_(?:model|tools|session|initial_sources)$/.test(id))) {
      assert.deepEqual(host.state.prompts, [], `${label}: the session itself failed, so its prompt was never sent`);
    }
    noMain(result, host);
  }

  // Reads that happened only before the baseline, during static discovery, never count as the view's.
  const early = await slice({ host: {
    onDiscovery: (name, state) => {
      if (name !== 'instructions') return;
      state.canaries.push({ process: state.runtimes.control, scope: 'control', path: `work/${AFTER_VIEW_CONTROL.target}`, op: 'read', count: 1 },
        { process: state.runtimes.control, scope: 'control', path: `work/${AFTER_VIEW_CONTROL.source}`, op: 'read', count: 1 });
    },
    control: { steps: (steps) => steps.filter((step) => step !== 'reads') },
  } });
  assert.equal(early.result.report.reason, 'ambient_state_unobservable', early.result.report.detail);
  assert.deepEqual(early.result.report.control.problems, ['os_target_read', 'os_source_read']);
  assert.deepEqual([early.result.report.control.os.target, early.result.report.control.os.source], [{ before: 1, after: 1 }, { before: 1, after: 1 }]);
  noMain(early.result, early.host);

  // The plan allows the discovery notification after the completion: the control passes, and the run goes on to the mains.
  const later = await slice({ host: { control: { steps: (steps) => ['request', 'permission', 'start', 'reads', 'complete', 'notification', 'loaded', 'reply'] } },
    approvals: ['yes'] });
  assert.equal(checkOf(later.result.report, 'after_view_control')?.status, 'passed', later.result.report.detail);
  assert.equal(later.result.report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');

  // The human's own answer is final: a typed reject means the view never ran.
  const rejected = await slice({ control: ['reject'] });
  assert.equal(rejected.result.report.reason, 'ambient_state_unobservable', rejected.result.report.detail);
  assert.deepEqual(rejected.host.state.permissions, [{ side: 'control', decision: 'reject' }]);
  assert.ok(['start', 'completion'].every((problem) => rejected.result.report.control.problems.includes(problem)));
  noMain(rejected.result, rejected.host);

  // A competing view request withdraws the request: before it is shown, or after the human approved it.
  const unshown = await slice({ host: { control: { whilePermission: (session, ctx) => session.emit({ type: 'assistant.message', data: {
    messageId: 'm-x', originatingMessageId: session.current, content: '', toolRequests: [{ toolCallId: 'v-x', name: 'view', arguments: { path: ctx.target } }] } }) } } });
  assert.deepEqual([unshown.result.report.permissions[0].answer, unshown.host.state.permissions], ['request_withdrawn', [{ side: 'control', decision: 'reject' }]]);
  assert.equal(blocksFor(unshown.terminal.text, 'approve-once'), 0, 'it was never shown');
  noMain(unshown.result, unshown.host);
  const typed = await slice({ control: (_time, _f, host) => [{ type: 'approve-once', before: () => {
    const session = host.sessions.controlView;
    session.emit({ type: 'assistant.message', data: { messageId: 'm-x', originatingMessageId: session.current, content: '',
      toolRequests: [{ toolCallId: 'v-x', name: 'view', arguments: { path: 'x' } }] } });
  } }] });
  assert.deepEqual([typed.result.report.permissions[0].answer, typed.host.state.permissions], ['approval_withdrawn', [{ side: 'control', decision: 'reject' }]]);
  assert.equal(typed.result.report.reason, 'ambient_state_unobservable');
  noMain(typed.result, typed.host);
});

test('a baseline read count the observer could not state as a whole number is no count at all, never zero: the view\'s genuine read after it cannot look new, and the control stops before either main starts', async () => {
  const garbled = await slice({ host: {
    onDiscovery: (name, state) => {
      if (name !== 'instructions') return;
      state.canaries.push({ process: state.runtimes.control, scope: 'control', path: `work/${AFTER_VIEW_CONTROL.target}`, op: 'read', count: '1' });
    },
  } });
  assert.equal(garbled.result.report.reason, 'ambient_state_unobservable', garbled.result.report.detail);
  assert.deepEqual(garbled.result.report.control.problems, ['os_target_read']);
  assert.deepEqual([garbled.result.report.control.os.target, garbled.result.report.control.os.source], [{ before: Number.NaN, after: Number.NaN },
    { before: 0, after: 1 }]);
  noMain(garbled.result, garbled.host);
});

test('the after-view control\'s one 60-second deadline binds every later query, observation, and wait too: a later getSources, either OS snapshot, the model\'s turn, or createSession alone running past it ends the phase there, and nothing resets or extends it', async () => {
  // Each case runs past the one deadline set when the session's creation began, at a different call; every earlier call answered in time.
  /** @type {Array<[string, ControlOptions, string, RegExp]>} */
  const cases = [
    ['the post-turn query, after earlier calls left it 17 seconds', { advance: { createSession: 20_000, getSources: 23_000 } }, 'ambient_state_unobservable',
      /^the after-view control's loaded instruction sources after its turn did not answer within its phase \(it answered after its deadline/],
    ['the initial query, after earlier calls left it 5 seconds', { advance: { createSession: 30_000, model: 25_000, getSources: 10_000 } },
      'ambient_state_unobservable', /^the after-view control's loaded instruction sources did not answer within its phase \(it answered after its deadline/],
    ['the baseline snapshot', { advance: { createSession: 20_000, model: 20_000, baselineSnapshot: 25_000 } }, 'ambient_state_unobservable',
      /^the observer did not give the control baseline \(it answered after its deadline/],
    ['the model\'s turn', { advance: { createSession: 20_000, model: 20_000, turn: 25_000 } }, 'ambient_state_unobservable',
      /^the after-view control turn did not end within its phase$/],
    ['the post-turn snapshot', { advance: { createSession: 20_000, model: 20_000, turnSnapshot: 25_000 } }, 'ambient_state_unobservable',
      /^the observer did not give the control reads \(it answered after its deadline/],
    ['createSession alone', { advance: { createSession: 61_000 } }, 'runtime_start_failed',
      /^the after-view control session was not created \(it answered after its deadline/],
  ];
  for (const [label, control, reason, detail] of cases) {
    // Real time is frozen on the run's clock for the phase, so only the advances above decide which call runs past the deadline.
    const { result, host } = await slice({ host: { control: { ...control, frozen: true } } });
    assert.equal(result.report.reason, reason, `${label}: ${result.report.detail}`);
    assert.match(result.report.detail, detail, label);
    assert.deepEqual(failedChecks(result.report), [], `${label}: every check that ran passed; the phase deadline alone ended it`);
    assert.equal(checkOf(result.report, 'after_view_control'), undefined, `${label}: no activation was judged after the deadline`);
    noMain(result, host);
  }
});

test('the after-view control keeps its order: the baseline before its one prompt, its reads before the post-turn query, no permission asked once its turn ended, and its runtime stopped by its owned stops before either main starts', async () => {
  /** @type {any} */
  let late = null;
  // Once the turn ended, the model's own view asks again: the request is the same sole call, but the control is over.
  const { result, host, terminal } = await slice({ approvals: ['yes'], host: { control: { afterTurn: async (session, ctx) => {
    late = await within(session.config.onPermissionRequest({ kind: 'read', toolCallId: ctx.toolCallId, path: ctx.target, intention: 'View the file',
      canOfferSessionApproval: false }, { sessionId: session.sessionId }), 5_000);
  } } } });
  const { report } = result;
  assert.equal(checkOf(report, 'after_view_control')?.status, 'passed', report.detail);
  assert.equal(report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
  const log = host.state.log;
  assert.deepEqual(log.slice(log.indexOf('createSession controlView'), log.indexOf('start b') + 1)
    .filter((entry) => /^(?:observer snapshot|send controlView|getSources controlView|disconnect controlView|stop control|start b)$/.test(entry)), [
    'getSources controlView', 'observer snapshot', 'send controlView', 'observer snapshot', 'getSources controlView', 'disconnect controlView', 'stop control',
    'observer snapshot', 'observer snapshot', 'start b',
  ], 'the empty initial sources, then the baseline, the prompt, the reads, and the loaded sources; the control runtime stopped, and its tree seen to have '
    + 'ended, before B started');
  assert.equal(checkOf(report, 'control_cessation')?.status, 'passed', 'that observation is the control\'s own cessation check');
  assert.equal(late?.kind, 'reject', 'the late request is refused');
  // The control's entries name no target: its paths are control evidence, which no report field but `control` carries.
  assert.deepEqual(report.permissions.filter((/** @type {any} */ entry) => entry.side === 'control'), [
    { side: 'control', kind: 'read', asked: true, reason: null, answer: 'approve-once' },
    { side: 'control', kind: 'read', asked: false, reason: 'not_pending', answer: null },
  ], 'the view was asked about once; the request after its turn was refused without asking anyone');
  assert.equal(blocksFor(terminal.text, 'approve-once'), 1);
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('storage is classified at every observation, not only at startup and the final drain: an undocumented write a worker first makes during the cancellation fails at that observation, before its cleanup window is judged', async () => {
  const { result, host } = await slice({ answers: ['approve-once', 'approve-once', 'approve-once'], host: { whileCancelled: (worker, dir, state) => {
    state.workerDirs.push({ process: worker.key, dir, area: 'config', op: 'create', path: `${state.relative}/stray.bin`, count: 1 });
  } } });
  const { report } = result;
  const cancel = host.state.exchanges[1].opB.slice(0, 8);
  assert.equal(report.reason, 'ambient_storage_unclassified', report.detail);
  assert.equal(checkOf(report, `startup_${cancel}_storage`)?.status, 'passed', 'the cancelled worker started clean');
  assert.deepEqual(failedChecks(report), ['cancel_storage', 'final_storage'], 'it fails where it is first seen, and the drained final summary shows it too');
  assert.equal(checkOf(report, 'cancel_storage').detail, 'worker:config:create');
  assert.deepEqual(phaseList(report).at(-1), ['cancel_exchange', 'failed']);
  assert.equal(checkOf(report, 'cancelled_worker_cessation'), undefined, 'nothing after the failed observation was judged');
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('a served worker\'s reads and opens in its configuration storage are classified exactly as its writes are, before association and at the final drain, with a recorded workspace and with observed absence: another session\'s event log, an undocumented store, and the runtime\'s own settings each refuse alone', async () => {
  const files = ['config/session-state/other-session/events.jsonl', 'config/session.db', 'config/settings.json'];
  /** The worker opening and reading one file in its configuration storage. @param {any} worker @param {string} dir @param {string} file */
  const reads = (worker, dir, file) => ['open', 'read'].map((op) => ({ process: worker.key, dir, area: 'config', op, path: file, count: 1 }));
  const kinds = /** @type {const} */ (['workspace', 'none']);
  // Before association: made before the worker's startup release existed, and judged when that release is decided. The runs are
  // independent, so they run side by side.
  const early = await Promise.all(kinds.flatMap((sessionStorage) => files.map(async (file) => ({ sessionStorage, file,
    ...(await slice({ host: { sessionStorage, workerStartup: (worker, dir, state) => { state.workerDirs.push(...reads(worker, dir, file)); } } })) }))));
  for (const { sessionStorage, file, result, host, layout } of early) {
    const label = `${sessionStorage}, ${file}, before association`;
    const operation = host.state.exchanges[0].opB.slice(0, 8);
    assert.equal(result.report.reason, 'ambient_storage_unclassified', `${label}: ${result.report.detail}`);
    assert.equal(checkOf(result.report, `worker_storage_${operation}`)?.status, 'passed', `${label}: the recorded storage itself checked out`);
    assert.deepEqual(failedChecks(result.report), [`startup_${operation}_storage`, 'final_storage'], label);
    assert.equal(checkOf(result.report, `startup_${operation}_storage`).detail, 'worker:config:open, worker:config:read', label);
    assert.equal(checkOf(result.report, 'final_storage').detail, 'worker:config:open, worker:config:read', `${label}: the drained final summary shows them too`);
    assert.deepEqual(releases(layout), [], `${label}: no release`);
    assert.deepEqual([result.report.verdict, result.exitCode], ['controlled_only', 4], label);
  }
  // At the final drain: first seen in the observer's drained final summary, on runs in which every other check passed.
  const late = await Promise.all(kinds.flatMap((sessionStorage) => files.map(async (file) => ({ sessionStorage, file,
    ...(await slice({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'], host: { sessionStorage, beforeFinal: (state) => {
      const ex = state.exchanges[0];
      state.workerDirs.push(...reads(ex.worker, ex.dir, file));
    } } })) }))));
  for (const { sessionStorage, file, result } of late) {
    const label = `${sessionStorage}, ${file}, at the final drain`;
    assert.equal(result.report.reason, 'ambient_storage_unclassified', `${label}: ${result.report.detail}`);
    assert.deepEqual(failedChecks(result.report), ['final_storage'], label);
    assert.equal(checkOf(result.report, 'final_storage').detail, 'worker:config:open, worker:config:read', label);
    assert.deepEqual([result.report.verdict, result.exitCode], ['controlled_only', 4], label);
  }
});

test('through the host\'s own event path, the after-view control\'s relay is withdrawn by its session\'s public events: an abort while the human types, or an error while the request waits its turn, refuses the read; a startup idle before the admission does not', async () => {
  const aborted = await slice({ control: (_time, _f, host) => [{ type: 'approve-once', before: () => host.sessions.controlView.emit({ type: 'abort',
    data: { reason: 'user_initiated' } }) }] });
  assert.equal(aborted.result.report.reason, 'ambient_state_unobservable', aborted.result.report.detail);
  assert.deepEqual([aborted.result.report.permissions[0].answer, aborted.host.state.permissions], ['approval_withdrawn', [{ side: 'control', decision: 'reject' }]],
    'the typed approve-once came after the abort, so it is withdrawn');
  assert.ok(aborted.result.report.control.problems.includes('competing_event'), aborted.result.report.control.problems.join(', '));
  noMain(aborted.result, aborted.host);

  const errored = await slice({ host: { control: { whilePermission: (session) => session.emit({ type: 'session.error',
    data: { errorType: 'fixture', message: 'x' } }) } } });
  assert.equal(errored.result.report.reason, 'ambient_state_unobservable', errored.result.report.detail);
  assert.deepEqual([errored.result.report.permissions[0].answer, errored.host.state.permissions], ['request_withdrawn', [{ side: 'control', decision: 'reject' }]]);
  assert.equal(blocksFor(errored.terminal.text, 'approve-once'), 0, 'it was never shown');
  noMain(errored.result, errored.host);

  const startup = await slice({ host: { control: { startupIdle: true } }, approvals: ['yes'] });
  assert.equal(checkOf(startup.result.report, 'after_view_control')?.status, 'passed', startup.result.report.detail);
  assert.equal(startup.result.report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
  assert.deepEqual(startup.result.report.permissions.filter((/** @type {any} */ entry) => entry.side === 'control').map((/** @type {any} */ entry) => entry.answer),
    ['approve-once'], 'the read was asked and approved: the startup idle ended nothing');
});

test('through the host\'s own event path, an activation the control turned off refuses it: a connected MCP server while its read waits withdraws the request unasked, and a running extension after the view completed fails the final judgment though the read was approved; their empty and inactive forms refuse the same way, by their types alone', async () => {
  const mcp = await slice({ control: [], host: { control: { whilePermission: (session) => session.emit({ type: 'session.mcp_servers_loaded',
    data: { servers: [{ name: 'dude-canary-probe', status: 'connected', source: 'workspace' }] } }) } } });
  assert.equal(mcp.result.report.reason, 'ambient_state_unobservable', mcp.result.report.detail);
  assert.deepEqual([mcp.result.report.permissions[0].answer, mcp.host.state.permissions], ['request_withdrawn', [{ side: 'control', decision: 'reject' }]],
    'the read was withdrawn while it waited its turn');
  assert.equal(blocksFor(mcp.terminal.text, 'approve-once'), 0, 'it was never shown');
  assert.ok(mcp.result.report.control.problems.includes('competing_event'), mcp.result.report.control.problems.join(', '));
  noMain(mcp.result, mcp.host);

  const extension = await slice({ host: { control: {
    events: (events) => { events.extension = { type: 'session.extensions_loaded', data: { extensions: [{ id: 'project:dude', name: 'dude', source: 'project',
      status: 'running' }] } }; },
    steps: (steps) => [...steps.slice(0, steps.indexOf('complete') + 1), 'extension', ...steps.slice(steps.indexOf('complete') + 1)],
  } } });
  assert.equal(extension.result.report.reason, 'ambient_state_unobservable', extension.result.report.detail);
  assert.deepEqual(extension.result.report.control.problems, ['competing_event'], 'only the activation is wrong; every other fact held');
  assert.deepEqual(extension.host.state.permissions, [{ side: 'control', decision: 'approve-once' }], 'the read itself was asked and approved');
  noMain(extension.result, extension.host);

  const inactive = await slice({ host: { control: {
    events: (events) => {
      events.servers = { type: 'session.mcp_servers_loaded', data: { servers: [{ name: 'dude-canary-probe', status: 'disabled' }] } };
      events.extensions = { type: 'session.extensions_loaded', data: { extensions: [] } };
    },
    steps: (steps) => [...steps.slice(0, steps.indexOf('complete') + 1), 'servers', 'extensions', ...steps.slice(steps.indexOf('complete') + 1)],
  } } });
  // No phase permits those lists, even empty or inactive, so their payloads are never read: both refuse by their types alone.
  assert.equal(inactive.result.report.reason, 'ambient_state_unobservable', inactive.result.report.detail);
  assert.deepEqual(inactive.result.report.control.problems, ['competing_event'], 'only those lists are wrong; every other fact held');
  assert.deepEqual(inactive.result.report.control.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class]),
    [['session.mcp_servers_loaded', 'competing'], ['session.extensions_loaded', 'competing']]);
  assert.deepEqual(inactive.host.state.permissions, [{ side: 'control', decision: 'approve-once' }], 'the read itself was asked and approved');
  noMain(inactive.result, inactive.host);
});

test('a refused control\'s report, as written to report.json, names each event that stood outside its activation by type and class only, on every path that ran its session: an undeclared type, a declared activation, and a malformed event stay distinguishable at the final judgment, a wait that never ended keeps them too, and a check that failed before its prompt names what its session sent at creation', async () => {
  const secret = 'PAYLOAD-NEVER-KEPT';
  const { result, host, layout } = await slice({ control: [], host: { control: { whilePermission: (session) => {
    session.emit({ type: 'session.usage_record', data: { note: secret } });
    session.emit({ type: 'hook.start', data: { hookType: 'preToolUse', input: secret } });
    session.emit({ type: 'session.usage_info', agentId: null, data: { note: secret } });
  } } } });
  assert.equal(result.report.reason, 'ambient_state_unobservable', result.report.detail);
  assert.deepEqual([result.report.permissions[0].answer, host.state.permissions], ['request_withdrawn', [{ side: 'control', decision: 'reject' }]],
    'the read was withdrawn unasked');
  const written = fs.readFileSync(path.join(layout.proof, 'report.json'), 'utf8');
  const kept = JSON.parse(written).control;
  assert.deepEqual(kept.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class, entry.count]), [['session.usage_record', 'undeclared', 1],
    ['hook.start', 'competing', 1], ['session.usage_info', 'malformed', 1]], 'each identifiable by its type, and its class tells them apart');
  assert.ok(kept.refusedEvents?.every((/** @type {any} */ entry) => UUID_PATTERN.test(entry.id)), 'each named by its own event ID');
  assert.equal(kept.refusedEventsOmitted, 0);
  assert.ok(kept.problems.includes('competing_event'), kept.problems.join(', '));
  assert.equal(written.includes(secret), false, 'no event data is written');
  assert.match(checkOf(result.report, 'after_view_control').detail,
    /; refused events: session\.usage_record \(undeclared\), hook\.start \(competing\), session\.usage_info \(malformed\)$/);
  noMain(result, host);

  // A wait that never ended: the model's turn runs past the phase's one deadline after an undeclared event, so no final judgment runs,
  // yet the report names that event.
  const stuck = await slice({ host: { control: { frozen: true, advance: { createSession: 20_000, model: 20_000, turn: 25_000 },
    events: (events) => { events.extra = { type: 'session.usage_record', data: { note: secret } }; }, steps: (steps) => ['extra', ...steps] } } });
  assert.match(stuck.result.report.detail, /^the after-view control turn did not end within its phase$/);
  assert.equal(checkOf(stuck.result.report, 'after_view_control'), undefined, 'no activation was judged');
  assert.deepEqual(stuck.result.report.control?.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class]), [['session.usage_record', 'undeclared']]);
  noMain(stuck.result, stuck.host);

  // A check that failed before the prompt: the session's own creation events are judged and named all the same.
  const early = await slice({ host: { control: { model: () => 'fixture-model-other', startupEvents: [{ type: 'session.journal_link', data: {} },
    { type: 'session.start', data: { sessionId: 'controlView-session-0123456789', version: 1, producer: 'copilot-agent', copilotVersion: '1.0.102',
      startTime: new Date().toISOString(), remoteSteerable: true } }] } } });
  assert.equal(early.result.report.reason, 'model_mismatch', early.result.report.detail);
  assert.deepEqual(early.host.state.prompts, [], 'nothing was sent');
  assert.deepEqual(early.result.report.control?.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class]), [['session.journal_link', 'undeclared'],
    ['session.start', 'competing']]);
  noMain(early.result, early.host);
});

test('the turn\'s proof is read from the turn alone, and after its end only housekeeping and another normal idle may come, through both post-turn observations: anything else refuses as after_turn though every fact the turn showed held, whether it arrives during the post-turn snapshot, during the passive source query, or in the same delivery as the idle itself, and a late notification never supplies a missing one', async () => {
  const turnStart = { type: 'assistant.turn_start', data: { turnId: '2', model: 'fixture-model-a' } };
  /** @type {Array<[string, ControlOptions, string, string]>} */
  const cases = [
    ['a running extension during the post-turn snapshot', { afterTurn: (session) => session.emit({ type: 'session.extensions_loaded', data: { extensions: [
      { id: 'project:dude', name: 'dude', source: 'project', status: 'running' }] } }) }, 'session.extensions_loaded', 'after_turn'],
    ['an undeclared event during the post-turn snapshot', { afterTurn: (session) => session.emit({ type: 'session.usage_record', data: {} }) },
      'session.usage_record', 'undeclared'],
    ['a hook during the passive source query', { loadedSources: (_answer, session) => session.emit({ type: 'hook.start', data: { hookType: 'postToolUse' } }) },
      'hook.start', 'after_turn'],
    ['a malformed event during the passive source query', { loadedSources: (_answer, session) => session.emit({ type: 'session.usage_info', id: '',
      data: { currentTokens: 1, messagesLength: 3, tokenLimit: 128_000 } }) }, 'session.usage_info', 'malformed'],
    ['another view started after the turn ended', { afterTurn: (session, ctx) => session.emit({ type: 'tool.execution_start', data: { toolCallId: 'late-view',
      toolName: 'view', arguments: { path: ctx.target } } }) }, 'tool.execution_start', 'after_turn'],
    ['the model changed during the post-turn snapshot', { afterTurn: (session) => session.emit({ type: 'session.model_change', data: {
      newModel: 'fixture-model-other', previousModel: 'fixture-model-a', source: 'automatic' } }) }, 'session.model_change', 'after_turn'],
    // A new turn starting after the idle, however it is delivered: the post-turn rule begins at the idle's own position in the log.
    ['a new turn starting during the post-turn snapshot', { afterTurn: (session) => session.emit(turnStart) }, 'assistant.turn_start', 'after_turn'],
    ['a new turn starting during the passive source query', { loadedSources: (_answer, session) => session.emit(turnStart) }, 'assistant.turn_start',
      'after_turn'],
    ['a new turn starting in the idle\'s own delivery', { afterIdle: (session) => session.emit(turnStart) }, 'assistant.turn_start', 'after_turn'],
    // Only a normal idle may repeat: an aborted one ends another loop.
    ['an aborted idle after the turn', { afterTurn: (session) => session.emit({ type: 'session.idle', data: { aborted: true } }) }, 'session.idle', 'after_turn'],
  ];
  const runs = await Promise.all(cases.map(async ([label, control, type, kind]) => ({ label, type, kind, ...(await slice({ host: { control } })) })));
  for (const { label, type, kind, result, host } of runs) {
    const { report } = result;
    assert.equal(report.reason, 'ambient_state_unobservable', `${label}: ${report.detail}`);
    assert.deepEqual(failedChecks(report), ['after_view_control'], label);
    assert.deepEqual(report.control.problems, ['competing_event'], `${label}: only the late event is wrong; every fact the turn showed held`);
    assert.ok(report.control.eventIds && report.control.output, `${label}: the turn's own bounded proof stands beside the refusal`);
    assert.deepEqual(report.control.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class, entry.count]), [[type, kind, 1]], label);
    noMain(result, host);
  }
  // Housekeeping and another normal idle, in the idle's own delivery and during both observations, change nothing.
  const quiet = await slice({ approvals: ['yes'], host: { control: {
    afterIdle: (session) => session.emit({ type: 'session.usage_info', data: { currentTokens: 1, messagesLength: 3, tokenLimit: 128_000 } }),
    afterTurn: (session) => {
      session.emit({ type: 'session.idle', data: {} });
      session.emit({ type: 'session.title_changed', data: { title: 'Viewed the canary' } });
    },
    loadedSources: (_answer, session) => {
      session.emit({ type: 'session.idle', data: { aborted: false } });
      session.emit({ type: 'session.usage_checkpoint', data: { totalNanoAiu: 1 } });
    },
  } } });
  assert.equal(checkOf(quiet.result.report, 'after_view_control')?.status, 'passed', quiet.result.report.detail);
  assert.deepEqual([quiet.result.report.control.refusedEvents, quiet.result.report.control.refusedEventsOmitted], [[], 0]);
  assert.equal(quiet.result.report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
  // No notification during the turn: one arriving during the post-turn snapshot neither supplies it nor passes.
  const missing = await slice({ host: { control: { steps: (steps) => steps.filter((step) => step !== 'notification'),
    afterTurn: (session, ctx) => session.emit({ type: 'system.notification', data: { content: 'x', kind: { type: 'instruction_discovered',
      sourcePath: AFTER_VIEW_CONTROL.source, triggerFile: ctx.target, triggerTool: 'view' } } }) } } });
  assert.deepEqual(missing.result.report.control.problems, ['notification', 'competing_event'], missing.result.report.detail);
  assert.equal(missing.result.report.control.eventIds, undefined, 'no proof');
  assert.deepEqual(missing.result.report.control.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class]),
    [['system.notification', 'after_turn']]);
  noMain(missing.result, missing.host);
});

test('an event stating another session, admission, or tool call than the control established, or changing its model or working directory once the run asked for that check, refuses it through the host\'s own event path, even a restatement of the same one: a pending read is withdrawn unasked, or the final judgment fails though the read was approved', async () => {
  /** @type {Array<[string, (session: any, ctx: any) => Record<string, unknown>, string, string]>} */
  const whileWaiting = [
    ['a model change after the model check', () => ({ type: 'session.model_change', data: { newModel: 'fixture-model-other', previousModel: 'fixture-model-a',
      source: 'automatic', cause: 'refusal_fallback' } }), 'session.model_change', 'competing'],
    ['the checked model restated as a change after its check', () => ({ type: 'session.model_change', data: { newModel: 'fixture-model-a',
      previousModel: 'fixture-model-a', source: 'sdk' } }), 'session.model_change', 'competing'],
    ['the selection withdrawn after the model check', () => ({ type: 'session.model_deselected', data: { previousModel: 'fixture-model-a',
      reason: 'provider_withdrawn' } }), 'session.model_deselected', 'competing'],
    ['Auto routing to another model', () => ({ type: 'session.auto_mode_resolved', data: { chosenModel: 'fixture-model-other' } }), 'session.auto_mode_resolved',
      'competing'],
    ['a read requested for another call', (session, ctx) => ({ type: 'permission.requested', data: { requestId: 'r-2', ownerSessionId: session.sessionId,
      permissionRequest: { kind: 'read', path: ctx.target, intention: 'View the file', toolCallId: 'other-call' } } }), 'permission.requested', 'contradicting'],
    ['a read another session owns', (_session, ctx) => ({ type: 'permission.requested', data: { requestId: 'r-2', ownerSessionId: 'other-session',
      permissionRequest: { kind: 'read', path: ctx.target, intention: 'View the file', toolCallId: ctx.toolCallId } } }), 'permission.requested', 'contradicting'],
    ['a text-only reply of another admission', () => ({ type: 'assistant.message', data: { messageId: 'm-other', originatingMessageId: 'other-admission',
      content: 'Done.' } }), 'assistant.message', 'contradicting'],
    ['another prompt', () => ({ type: 'user.message', data: { messageId: 'controlView-message-9', content: 'Read it again.' } }), 'user.message', 'contradicting'],
  ];
  const waiting = await Promise.all(whileWaiting.map(async ([label, make, type, kind]) => ({ label, type, kind,
    ...(await slice({ control: [], host: { control: { whilePermission: (session, ctx) => session.emit(make(session, ctx)) } } })) })));
  for (const { label, type, kind, result, host, terminal } of waiting) {
    assert.equal(result.report.reason, 'ambient_state_unobservable', `${label}: ${result.report.detail}`);
    assert.deepEqual([result.report.permissions[0].answer, host.state.permissions], ['request_withdrawn', [{ side: 'control', decision: 'reject' }]],
      `${label}: the read was withdrawn while it waited its turn`);
    assert.equal(blocksFor(terminal.text, 'approve-once'), 0, `${label}: it was never shown`);
    assert.ok(result.report.control.problems.includes('competing_event'), `${label}: ${result.report.control.problems.join(', ')}`);
    assert.deepEqual(result.report.control.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class]), [[type, kind]], label);
    noMain(result, host);
  }
  /** @type {Array<[string, (ctx: any) => Record<string, unknown>, string, string]>} */
  const afterAnswer = [
    ['a working directory changed after its check', (ctx) => ({ type: 'session.context_changed', data: { cwd: path.dirname(ctx.target), branch: 'main' } }),
      'session.context_changed', 'competing'],
    ['the checked working directory restated after its check', (ctx) => ({ type: 'session.context_changed', data: { cwd: ctx.session.config.workingDirectory } }),
      'session.context_changed', 'competing'],
    ['progress of another call', () => ({ type: 'tool.execution_progress', data: { progressMessage: 'Connecting', toolCallId: 'other-call' } }),
      'tool.execution_progress', 'contradicting'],
    ['the completion of another call\'s permission', () => ({ type: 'permission.completed', data: { requestId: 'r-2', result: { kind: 'approved' },
      toolCallId: 'other-call' } }), 'permission.completed', 'contradicting'],
    ['usage of a compaction call', () => ({ type: 'assistant.usage', data: { model: 'fixture-model-a', inputTokens: 900, initiator: 'agent',
      interactionType: 'conversation-compaction' } }), 'assistant.usage', 'competing'],
  ];
  const answered = await Promise.all(afterAnswer.map(async ([label, make, type, kind]) => ({ label, type, kind, ...(await slice({ host: { control: {
    events: (events, ctx) => { events.extra = make(ctx); },
    steps: (steps) => [...steps.slice(0, steps.indexOf('complete') + 1), 'extra', ...steps.slice(steps.indexOf('complete') + 1)],
  } } })) })));
  for (const { label, type, kind, result, host } of answered) {
    assert.equal(result.report.reason, 'ambient_state_unobservable', `${label}: ${result.report.detail}`);
    assert.deepEqual(host.state.permissions, [{ side: 'control', decision: 'approve-once' }], `${label}: the read itself was asked and approved`);
    assert.deepEqual(result.report.control.problems, ['competing_event'], `${label}: only that event is wrong`);
    assert.deepEqual(result.report.control.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class]), [[type, kind]], label);
    noMain(result, host);
  }
});

test('a valid indexed-search startup during the view refuses the control by its type alone, while every other observation holds: the tool catalog, the output and source digests, both read deltas, and complete coverage', async () => {
  // A declined proposal is scripted, so a control that accepted this event would show it: the run would go on and stop only there.
  const { result, host } = await slice({ approvals: ['yes'], host: { control: {
    events: (events) => { events.indexed = { type: 'session.indexed_search', data: { kind: 'startup', outcome: 'started', forcedByEnv: true,
      startupDurationMs: 1, warmStart: false } }; },
    steps: (steps) => [...steps.slice(0, steps.indexOf('reads')), 'indexed', ...steps.slice(steps.indexOf('reads'))],
  } } });
  const { report } = result;
  assert.equal(report.reason, 'ambient_state_unobservable', `the control must refuse, not go on: ${report.reason}; ${report.detail}`);
  assert.deepEqual(failedChecks(report), ['after_view_control'], 'the catalog, session, and source checks before it all passed');
  assert.deepEqual(report.control.problems, ['competing_event'], 'that event alone is wrong');
  assert.deepEqual(report.control.refusedEvents.map((/** @type {any} */ entry) => [entry.type, entry.class, entry.count]),
    [['session.indexed_search', 'competing', 1]]);
  assert.equal(report.control.refusedEventsOmitted, 0);
  assert.match(checkOf(report, 'after_view_control').detail, /^competing_event; refused events: session\.indexed_search \(competing\)$/);
  assert.ok(report.control.source?.sha256, 'the loaded source matched by digest');
  assert.deepEqual([report.control.os.target, report.control.os.source], [{ before: 0, after: 1 }, { before: 0, after: 1 }], 'both read deltas held');
  assert.deepEqual(host.state.permissions, [{ side: 'control', decision: 'approve-once' }], 'the read was asked and approved before it');
  noMain(result, host);
});

test('what the control session sent before its prompt is judged at the last moment before it is sent: a model change delivered during the initial source query, during the baseline snapshot, or as the model check is asked, a session start once its creation returned, or a working-directory change as its check is asked, stops the run with nothing sent, while the same changes just before those checks pass', async () => {
  const startupChange = { type: 'session.model_change', data: { newModel: 'fixture-model-default', source: 'startup' } };
  /** @type {Array<[string, ControlOptions, string]>} */
  const refused = [
    ['a model change during the initial source query', { initialSources: (_answer, session) => session.emit({ type: 'session.model_change',
      data: { newModel: 'fixture-model-other', previousModel: 'fixture-model-a', source: 'automatic' } }) }, 'session.model_change'],
    ['the checked model restated during the baseline snapshot', { baseline: (session) => session.emit({ type: 'session.model_change',
      data: { newModel: 'fixture-model-a', previousModel: 'fixture-model-a', source: 'sdk' } }) }, 'session.model_change'],
    ['a startup selection as the model check is asked', { currentModel: (_answer, session) => session.emit(startupChange) }, 'session.model_change'],
    ['its one start, once its creation returned', { currentModel: (_answer, session) => session.emit({ type: 'session.start', data: {
      sessionId: session.sessionId, version: 1, producer: 'copilot-agent', copilotVersion: '1.0.102', startTime: new Date().toISOString() } }) }, 'session.start'],
    ['a working-directory report as its check is asked', { snapshot: (_answer, session) => session.emit({ type: 'session.context_changed',
      data: { cwd: path.dirname(session.config.workingDirectory) } }) }, 'session.context_changed'],
    ['a new turn starting during the baseline snapshot', { baseline: (session) => session.emit({ type: 'assistant.turn_start', data: { turnId: '0' } }) },
      'assistant.turn_start'],
  ];
  const runs = await Promise.all(refused.map(async ([label, control, type]) => ({ label, type, ...(await slice({ control: [], host: { control } })) })));
  for (const { label, type, result, host } of runs) {
    assert.equal(result.report.reason, 'ambient_state_unobservable', `${label}: ${result.report.detail}`);
    assert.match(result.report.detail, new RegExp(`may not before its prompt; refused events: ${type.replace('.', '\\.')} \\(competing\\)$`), label);
    assert.deepEqual(host.state.prompts.filter((/** @type {any} */ entry) => entry.side === 'controlView'), [], `${label}: no control prompt was sent`);
    assert.equal(host.state.log.includes('send controlView'), false, `${label}: send was never called`);
    assert.deepEqual(failedChecks(result.report), [], `${label}: every check before it passed`);
    assert.deepEqual(result.report.control.refusedEvents?.map((/** @type {any} */ entry) => [entry.type, entry.class, entry.count]), [[type, 'competing', 1]], label);
    noMain(result, host);
  }
  // The same startup selection and working-directory report, each the last event before the run asked for its check, pass: the check
  // supersedes them.
  const passes = await slice({ approvals: ['yes'], host: { control: {
    startupEvents: [startupChange],
    descriptors: (_answer, session) => session.emit({ type: 'session.context_changed', data: { cwd: path.dirname(session.config.workingDirectory) } }),
  } } });
  assert.equal(checkOf(passes.result.report, 'after_view_control')?.status, 'passed', passes.result.report.detail);
  assert.deepEqual(passes.result.report.control.refusedEvents, []);
  assert.equal(passes.result.report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
});

test('the control records the model its check accepted and judges the tool catalog by it: a catalog update stating another model once that check was asked stops the run before anything is sent, while one stating the checked model passes', async () => {
  const catalog = (/** @type {string} */ id, /** @type {string} */ model) => ({ id, type: 'session.tools_updated', data: { model } });
  // Delivered while the descriptors are read, after the model check answered. A declined proposal is scripted, so a control that let the
  // other model through would go on and stop only there.
  const other = await slice({ approvals: ['yes'], host: { control: { descriptors: (_answer, session) => session.emit(catalog('catalog-other', 'fixture-model-other')) } } });
  assert.deepEqual(other.result.report.control.refusedEvents, [{ type: 'session.tools_updated', class: 'contradicting', count: 1, id: 'catalog-other' }],
    `the catalog's model is judged against the checked one: ${other.result.report.reason}; ${other.result.report.detail}`);
  assert.equal(other.result.report.reason, 'ambient_state_unobservable');
  assert.match(other.result.report.detail, /may not before its prompt; refused events: session\.tools_updated \(contradicting\)$/);
  assert.equal(other.host.state.log.includes('send controlView'), false, 'send was never called');
  assert.deepEqual(failedChecks(other.result.report), [], 'every check before it passed');
  noMain(other.result, other.host);
  const same = await slice({ approvals: ['yes'], host: { control: { descriptors: (_answer, session) => session.emit(catalog('catalog-same', 'fixture-model-a')) } } });
  assert.equal(checkOf(same.result.report, 'after_view_control')?.status, 'passed', same.result.report.detail);
  assert.deepEqual(same.result.report.control.refusedEvents, []);
  assert.equal(same.result.report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
});

test('nothing yields between the control\'s last judgment before its prompt and the send: an event the host delivers one macrotask after the baseline snapshot arrives after the send and refuses in the turn, while the same event during the initial source query is judged before the prompt and passes', async () => {
  const catalog = (/** @type {string} */ id) => ({ id, type: 'session.tools_updated', data: { model: 'fixture-model-a' } });
  // The run judges and sends in the microtasks that follow the baseline snapshot's answer, so an event scheduled from inside that snapshot
  // arrives only once send was invoked. A yield to the event loop in between would let it arrive first, before the prompt, where a tool
  // catalog of the checked model is permitted. A declined proposal is scripted, so such a control would go on and stop only there.
  const late = await slice({ approvals: ['yes'], host: { control: { baseline: (session) => { setImmediate(() => session.emit(catalog('catalog-after-send'))); } } } });
  assert.deepEqual(late.result.report.control.refusedEvents, [{ type: 'session.tools_updated', class: 'competing', count: 1, id: 'catalog-after-send' }],
    `it arrived after the send, in the turn, where no tool catalog is permitted: ${late.result.report.reason}; ${late.result.report.detail}`);
  assert.equal(late.result.report.reason, 'ambient_state_unobservable');
  assert.equal(late.host.state.log.includes('send controlView'), true, 'the prompt was sent: nothing refused before it');
  assert.match(checkOf(late.result.report, 'after_view_control')?.detail, /; refused events: session\.tools_updated \(competing\)$/);
  noMain(late.result, late.host);
  const early = await slice({ approvals: ['yes'], host: { control: { initialSources: (_answer, session) => session.emit(catalog('catalog-before-send')) } } });
  assert.equal(checkOf(early.result.report, 'after_view_control')?.status, 'passed', early.result.report.detail);
  assert.deepEqual(early.result.report.control.refusedEvents, []);
  assert.equal(early.result.report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
});

test('the control\'s turn begins before its send is invoked: an event the host delivers synchronously inside send is judged in the turn, where no tool catalog is permitted, and refuses', async () => {
  // A declined proposal is scripted, so a control that judged this event as sent before its prompt, where a tool catalog of the checked
  // model is permitted, would go on and stop only there.
  const { result, host } = await slice({ approvals: ['yes'], host: { control: { duringSend: (session) => session.emit({ id: 'catalog-during-send',
    type: 'session.tools_updated', data: { model: 'fixture-model-a' } }) } } });
  assert.deepEqual(result.report.control.refusedEvents, [{ type: 'session.tools_updated', class: 'competing', count: 1, id: 'catalog-during-send' }],
    `delivered inside send, it is in the turn: ${result.report.reason}; ${result.report.detail}`);
  assert.equal(result.report.reason, 'ambient_state_unobservable');
  assert.match(checkOf(result.report, 'after_view_control')?.detail, /; refused events: session\.tools_updated \(competing\)$/);
  noMain(result, host);
});

test('the control relay never asks about a view request of other arguments, even when the read it asks for is a file the view may surface: the request is rejected unasked as not model-requested, and the final judgment still fails on those arguments', async () => {
  // The model requests a view of the AGENTS.md canary instead of the target and asks to read it: its own admission, a permitted form, the
  // view tool, and a read the relay could show, with every other fact valid. The scripted approve-once would approve it if it were asked.
  const source = (/** @type {any} */ ctx) => path.join(path.dirname(ctx.target), AFTER_VIEW_CONTROL.source);
  const { result, host, terminal } = await slice({ host: { control: {
    events: (events, ctx) => { events.request.data.toolRequests[0].arguments = { path: source(ctx) }; },
    permission: (request, ctx) => { request.path = source(ctx); },
  } } });
  assert.deepEqual(result.report.permissions, [{ side: 'control', kind: 'read', asked: false, reason: 'not_model_requested', answer: null }],
    'the relay rejected the read without asking');
  assert.equal(blocksFor(terminal.text, 'approve-once'), 0, 'it was never shown');
  assert.deepEqual(host.state.permissions, [{ side: 'control', decision: 'reject' }]);
  assert.equal(result.report.reason, 'ambient_state_unobservable', result.report.detail);
  assert.ok(result.report.control.problems.includes('request_arguments'), result.report.control.problems.join(', '));
  noMain(result, host);
});

test('a normal view turn made only of what each phase permits passes with nothing refused: a session started with a default model and working directory, the SDK\'s own selection before the checks, its tool catalog, system message, and startup idle; then the admission, several model iterations with their turns, intent, reasoning, streaming, usage, and finished dispatches, the view\'s one request, its read\'s permission, start, progress, discovery, and completion, and the reply; then another normal idle and housekeeping', async () => {
  const usage = { model: 'fixture-model-a', inputTokens: 900, outputTokens: 20, initiator: 'agent', interactionType: 'conversation-agent' };
  const finished = { dispatchDurationMs: 900, editClassifierVersion: 1, outcome: 'success', turnId: '1', containsBuiltInFileEditRequest: false };
  const { result, host } = await slice({ approvals: ['yes'], host: { control: {
    snapshot: (answer) => { answer.selectedModel = 'fixture-model-a'; },
    startupEvents: [
      { type: 'session.start', data: { sessionId: 'controlView-session-0123456789', version: 1, producer: 'copilot-agent', copilotVersion: '1.0.102',
        startTime: new Date().toISOString(), selectedModel: 'fixture-model-default', context: { cwd: path.join(os.tmpdir(), 'dude-default-cwd') },
        alreadyInUse: false, remoteSteerable: false } },
      { type: 'session.model_change', data: { newModel: 'fixture-model-default', source: 'startup' } },
      { type: 'session.model_change', data: { newModel: 'fixture-model-a', previousModel: 'fixture-model-default', source: 'sdk' } },
      { type: 'session.tools_updated', data: { model: 'fixture-model-default' } },
      { type: 'system.message', data: { content: 'Repository instructions.', role: 'system' } },
      { type: 'session.usage_info', data: { currentTokens: 900, messagesLength: 1, tokenLimit: 128_000, isInitial: true } },
      { type: 'session.title_changed', data: { title: 'Control' } },
      { type: 'session.idle', data: {} },
    ],
    // The session's own working directory reported before its check, though not the one it was asked to work in.
    descriptors: (_answer, session) => session.emit({ type: 'session.context_changed', data: { cwd: path.dirname(session.config.workingDirectory) } }),
    events: (events, ctx) => {
      Object.assign(events, {
        turn1: { type: 'assistant.turn_start', data: { turnId: '1', model: 'fixture-model-a', interactionId: 'i-1' } },
        intent: { type: 'assistant.intent', data: { intent: 'Viewing the file' } },
        reasoningDelta: { type: 'assistant.reasoning_delta', data: { deltaContent: 'think', reasoningId: 'r-1' } },
        reasoning: { type: 'assistant.reasoning', data: { content: 'thinking', reasoningId: 'r-1' } },
        streaming: { type: 'assistant.streaming_delta', data: { totalResponseSizeBytes: 120 } },
        messageStart: { type: 'assistant.message_start', data: { messageId: 'm-1' } },
        callDelta: { type: 'assistant.tool_call_delta', data: { inputDelta: '{"path":', toolCallId: ctx.toolCallId, toolName: 'view' } },
        usage1: { type: 'assistant.usage', data: usage },
        finished1: { type: 'model.call_finished', data: finished },
        requested: { type: 'permission.requested', data: { requestId: 'r-1', ownerSessionId: ctx.session.sessionId, permissionMode: 'manual', agentMode: 'interactive',
          permissionRequest: { kind: 'read', path: ctx.target, intention: 'View the file', toolCallId: ctx.toolCallId } } },
        completed: { type: 'permission.completed', data: { requestId: 'r-1', result: { kind: 'approved' }, toolCallId: ctx.toolCallId,
          decisionSource: 'human_response' } },
        progress: { type: 'tool.execution_progress', data: { progressMessage: 'Reading', toolCallId: ctx.toolCallId } },
        turnEnd1: { type: 'assistant.turn_end', data: { turnId: '1', model: 'fixture-model-a' } },
        turn2: { type: 'assistant.turn_start', data: { turnId: '2', model: 'fixture-model-a', interactionId: 'i-1' } },
        messageStart2: { type: 'assistant.message_start', data: { messageId: 'm-2' } },
        messageDelta: { type: 'assistant.message_delta', data: { deltaContent: 'I viewed', messageId: 'm-2' } },
        usage2: { type: 'assistant.usage', data: { ...usage, initiator: 'user', interactionType: 'conversation-user' } },
        finished2: { type: 'model.call_finished', data: { ...finished, turnId: '2', containsBuiltInFileEditRequest: undefined } },
        usageInfo: { type: 'session.usage_info', data: { currentTokens: 1_200, messagesLength: 5, tokenLimit: 128_000 } },
        title: { type: 'session.title_changed', data: { title: 'Viewed the canary' } },
        checkpoint: { type: 'session.usage_checkpoint', data: { totalNanoAiu: 1_000 } },
        turnEnd2: { type: 'assistant.turn_end', data: { turnId: '2', model: 'unknown' } },
        assistantIdle: { type: 'assistant.idle', data: {} },
      });
    },
    steps: () => ['turn1', 'intent', 'reasoningDelta', 'reasoning', 'streaming', 'messageStart', 'callDelta', 'request', 'usage1', 'finished1', 'requested',
      'permission', 'completed', 'start', 'progress', 'reads', 'notification', 'complete', 'turnEnd1', 'turn2', 'messageStart2', 'messageDelta', 'reply',
      'usage2', 'finished2', 'usageInfo', 'title', 'checkpoint', 'loaded', 'turnEnd2', 'assistantIdle'],
    afterTurn: (session) => {
      session.emit({ type: 'session.idle', data: {} });
      session.emit({ type: 'session.usage_info', data: { currentTokens: 1_200, messagesLength: 5, tokenLimit: 128_000 } });
    },
  } } });
  const { report } = result;
  assert.equal(checkOf(report, 'after_view_control')?.status, 'passed', report.detail);
  assert.deepEqual([report.control.refusedEvents, report.control.refusedEventsOmitted], [[], 0]);
  assert.equal(report.reason, 'approval_input_refused', 'it stopped only at the declined proposal');
  assert.deepEqual(host.state.permissions.filter((/** @type {any} */ entry) => entry.side === 'control'), [{ side: 'control', decision: 'approve-once' }]);
});

test('the control runtime\'s whole pinned tree must be seen to end within 10 seconds of its owned stop before either main starts, and the drained final summary judges that window again: a child a clean stop leaves running, or a failed stop, refuses there, and the stop\'s outcome is kept', async () => {
  const conhost = 'C:\\Windows\\System32\\conhost.exe';
  // The run's clock is frozen from the after-view session's creation through the control's owned stop until the next synchronized
  // snapshot, so each window below is measured from exactly the stop's anchor, whatever the machine's scheduling.
  // A clean stop that ends the runtime but leaves its child running 15 seconds more: SDK stop is not tree exit.
  /** @type {any} */
  let child = null;
  const survivor = await slice({ approvals: ['yes'], host: {
    control: { frozen: true },
    controlStart: (ctx) => { child = ctx.spawnFake(ctx.runtime.key, conhost); },
    controlStop: (ctx) => {
      ctx.runtime.exited = ctx.iso(ctx.time.now());
      child.exited = ctx.iso(ctx.time.now() + 15_000);
      return [];
    },
  } });
  const { report } = survivor.result;
  assert.equal(report.reason, 'cessation_unconfirmed', report.detail);
  assert.equal(checkOf(report, 'after_view_control')?.status, 'passed', 'the control itself passed');
  assert.equal(checkOf(report, 'control_cessation').detail, '0 running, 1 late, 0 unpinned, 0 missing; slowest 15000 ms after its owned stop');
  assert.equal(checkOf(report, 'control_cessation_coverage')?.status, 'passed', 'the snapshot that judged it had complete coverage');
  assert.deepEqual(failedChecks(report), ['control_cessation', 'final_control_cessation', 'final_owned_tree_cessation'],
    'it fails before either main, and the drained final summary shows the same child');
  assert.equal(checkOf(report, 'final_control_cessation').detail, '0 running, 1 late, 0 unpinned, 0 missing; slowest 15000 ms after its own cleanup anchor',
    'the final summary measures from the same anchor');
  assert.deepEqual([report.control.cleanup.stop, report.control.cleanup.errors, report.control.cleanup.forced, report.control.cleanup.cessation.late],
    ['clean', 0, 'not_needed', 1], 'the SDK stop reported clean; the tree had not ended');
  noMain(survivor.result, survivor.host);

  // A stop that fails outright: the approved bounded force-stop runs, and the tree still ends 15 seconds late.
  /** @type {any} */
  let stuck = null;
  const failed = await slice({ approvals: ['yes'], host: {
    control: { frozen: true },
    controlStart: (ctx) => { stuck = ctx.spawnFake(ctx.runtime.key, conhost); },
    controlStop: () => { throw new Error('fixture stop failure'); },
    controlForceStop: (ctx) => {
      ctx.runtime.exited = ctx.iso(ctx.time.now() + 15_000);
      stuck.exited = ctx.iso(ctx.time.now() + 15_000);
    },
  } });
  assert.equal(failed.result.report.reason, 'cessation_unconfirmed', failed.result.report.detail);
  assert.equal(checkOf(failed.result.report, 'control_cessation').detail, '0 running, 2 late, 0 unpinned, 0 missing; slowest 15000 ms after its owned stop');
  assert.deepEqual(failedChecks(failed.result.report), ['control_cessation', 'final_control_cessation', 'final_owned_tree_cessation']);
  assert.deepEqual([failed.result.report.control.cleanup.stop, failed.result.report.control.cleanup.errors, failed.result.report.control.cleanup.forced],
    ['failed', null, 'completed'], 'the failed stop and the force-stop are kept');
  assert.ok(failed.host.state.log.includes('forceStop control'));
  noMain(failed.result, failed.host);

  // A stop that reports errors, after which the force-stop ends the whole tree at once: the observed cessation decides, and the
  // stop's outcome is kept beside it.
  const forced = await slice({ approvals: ['yes'], host: {
    control: { frozen: true },
    controlStop: () => [{ message: 'fixture stop error' }],
    controlForceStop: (ctx) => { ctx.endTree(ctx.runtime.key, ctx.time.now()); },
  } });
  assert.equal(checkOf(forced.result.report, 'control_cessation')?.status, 'passed', forced.result.report.detail);
  assert.equal(checkOf(forced.result.report, 'control_cessation').detail, '0 running, 0 late, 0 unpinned, 0 missing; slowest 0 ms after its owned stop');
  assert.equal(forced.result.report.reason, 'approval_input_refused', 'it went on to the mains and stopped only at the declined proposal');
  assert.deepEqual([forced.result.report.control.cleanup.stop, forced.result.report.control.cleanup.errors, forced.result.report.control.cleanup.forced,
    forced.result.report.control.cleanup.cessation.ok], ['errors', 1, 'completed', true]);

  // A control descendant no snapshot showed before the mains, its start still buffered, that outlived the control's window: the
  // drained final summary judges the control's own window again and fails it, though the teardown's later window would pass it.
  const buffered = await slice({ approvals: ['yes'], host: { control: { frozen: true }, beforeFinal: (state) => {
    state.processes.push({ key: '9999@2', pid: 9_999, parent: state.runtimes.control, created: new Date(state.controlStoppedAt - 1_000).toISOString(),
      image: conhost, exited: new Date(state.controlStoppedAt + 10_020).toISOString(), exitCode: 0, pinned: true });
  } } });
  assert.equal(checkOf(buffered.result.report, 'control_cessation')?.status, 'passed', 'no snapshot before the mains showed that child');
  assert.equal(buffered.result.report.reason, 'approval_input_refused');
  assert.deepEqual(failedChecks(buffered.result.report), ['final_control_cessation']);
  assert.equal(checkOf(buffered.result.report, 'final_control_cessation').detail,
    '0 running, 1 late, 0 unpinned, 0 missing; slowest 10020 ms after its own cleanup anchor', 'its own anchor is the owned stop itself');
  assert.equal(checkOf(buffered.result.report, 'final_owned_tree_cessation')?.status, 'passed', 'only the control\'s own window catches it');
});

test('the control\'s cleanup window runs from the start of its owned stop, not from the moment that stop returns: a stop that itself takes 6 seconds while a child exits 11 seconds after it began refuses as late, before either main starts', async () => {
  const conhost = 'C:\\Windows\\System32\\conhost.exe';
  /** @type {any} */
  let child = null;
  /** @type {number | null} */
  let begun = null;
  const { result, host } = await slice({ approvals: ['yes'], host: {
    control: { frozen: true },
    controlStart: (ctx) => { child = ctx.spawnFake(ctx.runtime.key, conhost); },
    controlStop: (ctx) => {
      begun = ctx.time.now();
      // The stop takes 6 seconds on the run's own clock; the child it leaves ends 11 seconds after the stop began.
      ctx.time.advance(6_000);
      ctx.runtime.exited = ctx.iso(ctx.time.now());
      child.exited = ctx.iso(/** @type {number} */ (begun) + 11_000);
      return [];
    },
  } });
  const { report } = result;
  assert.equal(report.reason, 'cessation_unconfirmed', report.detail);
  assert.equal(host.state.controlStoppedAt, begun, 'the stop began at the anchor the run took');
  assert.equal(checkOf(report, 'control_cessation').detail, '0 running, 1 late, 0 unpinned, 0 missing; slowest 11000 ms after its owned stop',
    'measured from the start of the stop: 11 seconds, though only 5 seconds passed after the stop returned');
  assert.equal(report.control.cleanup.stop, 'clean', 'the slow stop itself reported no error');
  assert.deepEqual(failedChecks(report), ['control_cessation', 'final_control_cessation'],
    'the drained final summary judges the same window from the same anchor');
  assert.equal(checkOf(report, 'final_owned_tree_cessation')?.status, 'passed',
    'the teardown\'s later window would pass that child; only the window anchored at the start of the stop catches it');
  noMain(result, host);
});

test('observation lost while the control runtime stops confirms no cessation: after healthy after-view snapshots, a cessation snapshot with lost, undecodable, or unattributed events, an identity gap, or an overflow stops the run with that closed coverage reason before either main starts', async () => {
  /** @type {Array<[string, Record<string, unknown>, string, string]>} */
  const losses = [
    ['events lost', { eventsLost: 1 }, 'observer_coverage_lost', 'eventsLost'],
    ['a decode failure', { decodeFailures: 1 }, 'observer_coverage_lost', 'decodeFailures'],
    ['unattributed events', { unattributed: 1 }, 'observer_coverage_lost', 'unattributed'],
    ['an identity gap', { identityGaps: 1 }, 'observer_identity_uncertain', 'identityGaps'],
    ['an overflow', { overflow: true }, 'observer_overflow', 'overflow'],
  ];
  const runs = await Promise.all(losses.map(async ([label, health, reason, problem]) => ({ label, reason, problem,
    ...(await slice({ approvals: [], host: {
      control: { frozen: true },
      // Every process ends cleanly at the stop; only the observation of that stop is incomplete.
      controlStop: (ctx) => {
        Object.assign(ctx.state.health, health);
        ctx.endTree(ctx.runtime.key, ctx.time.now());
        return [];
      },
    } })) })));
  for (const { label, reason, problem, result, host } of runs) {
    const { report } = result;
    assert.equal(report.reason, reason, `${label}: ${report.detail}`);
    assert.equal(checkOf(report, 'after_view_control')?.status, 'passed', `${label}: both after-view snapshots were healthy`);
    assert.deepEqual([checkOf(report, 'control_cessation_coverage')?.status, checkOf(report, 'control_cessation_coverage')?.detail], ['failed', problem], label);
    assert.equal(checkOf(report, 'control_cessation'), undefined, `${label}: the tree's apparent end was never accepted`);
    assert.deepEqual(failedChecks(report), ['control_cessation_coverage', 'final_coverage'], `${label}: the drained final summary shows the same loss`);
    assert.equal(report.control.cleanup.stop, 'clean', `${label}: the stop itself was clean`);
    noMain(result, host);
  }
});

test('the control\'s cleanup window is exactly 10 seconds from its owned stop: a child exiting 9,999 or 10,000 ms after the stop began is within it, and one exiting 10,001 ms after is late, before either main starts', async () => {
  const conhost = 'C:\\Windows\\System32\\conhost.exe';
  /** @param {number} exitMs */
  const run = (exitMs) => {
    /** @type {any} */
    let child = null;
    return slice({ approvals: ['yes'], host: {
      control: { frozen: true },
      controlStart: (ctx) => { child = ctx.spawnFake(ctx.runtime.key, conhost); },
      controlStop: (ctx) => {
        ctx.runtime.exited = ctx.iso(ctx.time.now());
        child.exited = ctx.iso(ctx.time.now() + exitMs);
        return [];
      },
    } });
  };
  const [inside, edge, late] = await Promise.all([run(9_999), run(10_000), run(10_001)]);
  for (const [{ result }, ms] of /** @type {Array<[any, number]>} */ ([[inside, 9_999], [edge, 10_000]])) {
    assert.equal(checkOf(result.report, 'control_cessation')?.detail, `0 running, 0 late, 0 unpinned, 0 missing; slowest ${ms} ms after its owned stop`, `${ms} ms`);
    assert.equal(checkOf(result.report, 'control_cessation')?.status, 'passed', `${ms} ms`);
    assert.equal(checkOf(result.report, 'final_control_cessation')?.status, 'passed', `${ms} ms: the drained final summary agrees`);
    assert.equal(result.report.reason, 'approval_input_refused', `${ms} ms: it went on to the mains and stopped only at the declined proposal`);
  }
  assert.equal(late.result.report.reason, 'cessation_unconfirmed', late.result.report.detail);
  assert.equal(checkOf(late.result.report, 'control_cessation').detail, '0 running, 1 late, 0 unpinned, 0 missing; slowest 10001 ms after its owned stop');
  // The teardown's own later window may or may not still reach that child, by when teardown begins; only the control's own window must fail.
  assert.deepEqual(failedChecks(late.result.report).filter((id) => id !== 'final_owned_tree_cessation'), ['control_cessation', 'final_control_cessation']);
  noMain(late.result, late.host);
});

test('the control\'s owned stop gets half the cleanup window before the approved bounded force-stop runs: a stop still unanswered 5 seconds after it began is timed out and force-stopped, and the tree that force-stop ends is judged inside the window', async () => {
  const { result, host } = await slice({ approvals: ['yes'], host: {
    control: { frozen: true },
    // The stop runs 7 seconds on the run's clock and answers clean only later; the force-stop ends the whole tree when it is called.
    controlStop: (ctx) => {
      ctx.time.advance(7_000);
      return new Promise((resolve) => { setTimeout(() => resolve([]), 300); });
    },
    controlForceStop: (ctx) => { ctx.endTree(ctx.runtime.key, ctx.time.now()); },
  } });
  const { report } = result;
  assert.deepEqual([report.control.cleanup.stop, report.control.cleanup.errors, report.control.cleanup.forced], ['timed_out', null, 'completed'],
    'the stop was timed out at its half of the window and the force-stop ran');
  assert.ok(host.state.log.includes('forceStop control'));
  assert.equal(checkOf(report, 'control_cessation')?.status, 'passed', report.detail);
  assert.equal(checkOf(report, 'control_cessation').detail, '0 running, 0 late, 0 unpinned, 0 missing; slowest 7000 ms after its owned stop');
  assert.equal(report.reason, 'approval_input_refused', 'it went on to the mains and stopped only at the declined proposal');
});

test('observation lost while a served worker\'s tree ends confirms no cessation either: a cessation snapshot of the answering worker, or of the cancelled worker, that lost events stops the run with the closed coverage reason, and that worker\'s window is never judged on it', async () => {
  /**
   * Events are lost from the snapshot that judges one exchange's worker cessation on: the `skip`-th snapshot after B closed that
   * exchange's journal (the answering worker's is the first; the cancelled worker's follows the cancellation's own observation).
   * @param {number} index @param {number} skip
   */
  const lossAt = (index, skip) => (/** @type {any} */ state) => {
    const ex = state.exchanges[index];
    if (!ex?.bClosed) return;
    ex.snapshotsAfterClose = (ex.snapshotsAfterClose ?? 0) + 1;
    if (ex.snapshotsAfterClose > skip) state.health.eventsLost = 1;
  };
  const [advice, cancelled] = await Promise.all([
    slice({ answers: ['approve-once', 'approve-once'], host: { onSnapshot: lossAt(0, 0) } }),
    slice({ answers: ['approve-once', 'approve-once', 'approve-once'], host: { onSnapshot: lossAt(1, 1) } }),
  ]);
  assert.equal(advice.result.report.reason, 'observer_coverage_lost', advice.result.report.detail);
  assert.deepEqual([checkOf(advice.result.report, 'advice_worker_cessation_coverage')?.status, checkOf(advice.result.report, 'advice_worker_cessation_coverage')?.detail],
    ['failed', 'eventsLost']);
  assert.equal(checkOf(advice.result.report, 'advice_worker_cessation'), undefined, 'the answering worker\'s apparent end was never accepted');
  assert.deepEqual(failedChecks(advice.result.report), ['advice_worker_cessation_coverage', 'final_coverage']);
  assert.deepEqual(phaseList(advice.result.report).at(-1), ['advice_exchange', 'failed'], 'before capture');
  assert.equal(cancelled.result.report.reason, 'observer_coverage_lost', cancelled.result.report.detail);
  assert.equal(checkOf(cancelled.result.report, 'cancel_coverage')?.status, 'passed', 'the cancellation\'s own observation was complete');
  assert.deepEqual([checkOf(cancelled.result.report, 'cancelled_worker_cessation_coverage')?.status,
    checkOf(cancelled.result.report, 'cancelled_worker_cessation_coverage')?.detail], ['failed', 'eventsLost']);
  assert.equal(checkOf(cancelled.result.report, 'cancelled_worker_cessation'), undefined, 'the cancelled worker\'s apparent end was never accepted');
  assert.deepEqual(failedChecks(cancelled.result.report), ['cancelled_worker_cessation_coverage', 'final_coverage']);
  for (const { result } of [advice, cancelled]) assert.deepEqual([result.report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('the drained final summary must show its drain complete: a final summary whose consumer did not drain every buffered event fails final coverage with the closed coverage reason, though every other check passed', async () => {
  const { result } = await slice({ answers: ['approve-once', 'approve-once', 'approve-once'], host: { finalDrain: { drained: false } } });
  assert.equal(result.report.reason, 'observer_coverage_lost', result.report.detail);
  assert.deepEqual(failedChecks(result.report), ['final_coverage']);
  assert.equal(checkOf(result.report, 'final_coverage').detail, 'drain_incomplete');
  assert.deepEqual(result.report.observer.final.drain, { stopStatus: 0, joined: true, consumerStatus: 0, drained: false });
  assert.deepEqual([result.report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('an unanswered after-view control prompt is released at the scope\'s expiry when that comes before the phase deadline: its terminal read ends there, and the run stops as expired before either main starts', async () => {
  const { result, host, terminal } = await slice({ expiresInMs: 45_000,
    control: (time, f) => [{ hold: () => time.advance(Date.parse(f.plan.expiresAt) - time.now() + 1_000) }] });
  assert.equal(result.report.reason, 'scope_expired', result.report.detail);
  // The run notices the expiry at its own next check; the prompt, whose deadline is that expiry, is released by its own watch within
  // one poll, not held to the later phase and permission bounds.
  const released = await within(new Promise((resolve) => {
    const poll = () => (terminal.input.listenerCount('data') === 0 ? resolve('released') : setTimeout(poll, 10));
    poll();
  }), 2_000);
  assert.equal(released, 'released', 'the terminal read ended at the scope\'s expiry');
  assert.equal(result.report.permissions[0].answer, 'input_timeout', 'the prompt ended at its own deadline: the scope\'s expiry');
  assert.deepEqual(['data', 'end', 'close'].map((name) => terminal.input.listenerCount(name)), [0, 0, 0], 'its terminal read was released');
  assert.equal(terminal.input.raw, false, 'and raw mode reset');
  assert.deepEqual(host.state.permissions, [{ side: 'control', decision: 'reject' }]);
  noMain(result, host);
});

test('an attributed relay or a non-approval line stops the run; nothing is synthesized or spoofed', async () => {
  const attributed = await slice({ host: { source: 'sdk-relay' } });
  assert.equal(attributed.result.report.reason, 'approval_attribution_refused', attributed.result.report.detail);
  assert.equal(checkOf(attributed.result.report, 'b_approval_event')?.status, 'failed');

  const declined = await slice({ approvals: ['yes'] });
  assert.equal(declined.result.report.reason, 'approval_input_refused');
  assert.deepEqual(declined.host.state.prompts.filter((entry) => entry.side !== 'controlView').map((entry) => entry.prompt.split('\n')[0]),
    ['Feature 089 native qualification, proposal step.'], 'a line that is not an approval or stop is never relayed');

  // A pasted approval line is the human's own line, but a multi-line paste is refused whole: no line of it is relayed.
  const pasted = await slice({ approvals: [{ paste: 'dude a2a approve bbbbbbbbbbbb\r\ndude a2a approve aaaaaaaaaaaa\r\n' }] });
  assert.equal(pasted.result.report.reason, 'approval_input_refused', pasted.result.report.detail);
  assert.deepEqual(pasted.host.state.prompts.filter((entry) => entry.side !== 'controlView').map((entry) => entry.prompt.split('\n')[0]),
    ['Feature 089 native qualification, proposal step.'], 'no line of a multi-line paste is relayed');
});

// ---------------------------------------------------------------------------
// The actual T009 worker module accepts exactly the releases written here.
// ---------------------------------------------------------------------------

const DESCRIPTORS = Object.freeze([
  { name: 'view', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'create', inputSchema: { type: 'object', properties: { path: { type: 'string' }, file_text: { type: 'string' } }, required: ['path', 'file_text'] } },
  { name: 'powershell', inputSchema: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' } }, required: ['command', 'description'] } },
]);
const JOINED_PATH = path.join(os.tmpdir(), 'dude-fixture-sdk', 'extension.js');
const BINDING = Object.freeze({
  operationId: '0f8fad5b-d9cb-469f-a165-70867728950e', permitId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', mainSessionId: 'main-session-b',
  providerGeneration: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', configDigest: 'c'.repeat(64), projectId: 'dude-number-poc',
  conversationId: '9b2e4c1a-3f5d-4e6f-8a7b-1c2d3e4f5a6b', questionId: 'question-message-1', exchangeId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
});

/**
 * A stand-in for the public SDK the worker uses (fake; no runtime): offered
 * tools reach their handlers, other names get the closed lookup rejection,
 * the session reports the workspace folder it creates in its owned
 * configuration storage through its metadata snapshot and public getter, and
 * the scripted model lists, then reads 101, then answers.
 */
function workerSdk() {
  /** @type {any[]} */
  const sessions = [];
  class CopilotClient {
    /** @param {any} options */
    constructor(options) { this.options = options; }

    /** @param {any} config */
    async createSession(config) {
      const offered = () => config.tools.filter((/** @type {any} */ tool) => config.availableTools.includes(`custom:${tool.name}`));
      let calls = 0;
      const workspace = path.join(config.configDirectory, 'session-state', 'child-session-1');
      fs.mkdirSync(workspace, { recursive: true });
      const session = {
        sessionId: 'child-session-1',
        get workspacePath() { return workspace; },
        rpc: {
          metadata: {
            snapshot: async () => ({ sessionId: session.sessionId, isRemote: false, alreadyInUse: false, workspacePath: workspace,
              workingDirectory: config.workingDirectory, currentMode: 'interactive', sessionLimits: null }),
          },
          tools: {
            initializeAndValidate: async () => ({}),
            getCurrentMetadata: async () => ({ tools: offered().map((/** @type {any} */ tool) => ({ name: tool.name, input_schema: tool.parameters })) }),
            getBuiltinDescriptors: async () => ({ tools: structuredClone(DESCRIPTORS) }),
            execute: async (/** @type {any} */ params) => {
              const tool = offered().find((/** @type {any} */ entry) => entry.name === params.name);
              if (!tool) throw Object.assign(new Error(`Tool '${params.name}' is not available in this session.`), { code: -32602 });
              return tool.handler(params.arguments, { sessionId: session.sessionId, toolCallId: params.toolCallId, toolName: params.name,
                arguments: params.arguments, signal: new AbortController().signal });
            },
          },
          instructions: { getSources: async () => ({ sources: [] }) },
          skills: { list: async () => ({ skills: [] }) },
          mcp: { listConfigured: async () => ({ servers: [] }) },
          extensions: { list: async () => ({ extensions: [] }) },
          agent: { list: async () => ({ agents: [] }), getCurrent: async () => ({ agent: null }) },
          model: { getCurrent: async () => ({ modelId: config.model }) },
        },
        async send() {
          setImmediate(async () => {
            /** @param {string} name @param {unknown} args */
            const call = async (name, args) => {
              calls += 1;
              const toolCallId = `model-call-${calls}`;
              config.onEvent({ type: 'assistant.message', data: { messageId: `m-${calls}`, originatingMessageId: 'admission-1', content: '',
                toolRequests: [{ toolCallId, name }] } });
              const tool = config.tools.find((/** @type {any} */ entry) => entry.name === name);
              return tool.handler(args, { sessionId: session.sessionId, toolCallId, toolName: name, arguments: args, signal: new AbortController().signal });
            };
            await call(WORKER_TOOLS.inventory, {});
            await call(WORKER_TOOLS.read, { reference: 'w/.dude/ideas/101-peer-latest.md' });
            config.onEvent({ type: 'assistant.message', data: { messageId: 'final', originatingMessageId: 'admission-1', content: '{"observedMaximum":101}' } });
            config.onEvent({ type: 'session.idle', data: {} });
          });
          return 'admission-1';
        },
        abort: async () => undefined,
      };
      sessions.push(session);
      return session;
    }

    async getStatus() { return { version: '1.0.102-fixture', protocolVersion: 3 }; }

    async stop() { return []; }

    async forceStop() { return undefined; }
  }
  return { sdk: { CopilotClient, RuntimeConnection: { forStdio: (/** @type {any} */ options) => ({ kind: 'stdio', ...options }) },
    defineTool: (/** @type {string} */ name, /** @type {object} */ config) => ({ name, ...config }) }, sessions };
}

/** A qualification worker on this runner's own fixture manifest, recording its checkpoints the way B's journal serializes them. */
function qualifiedWorker() {
  const root = tempDir('dude-nqw-');
  const runId = randomUUID();
  const manifest = fixtureManifest(runId);
  fs.writeFileSync(path.join(root, 'manifest.json'), manifest.bytes);
  for (const source of manifest.sources) {
    fs.mkdirSync(path.dirname(path.join(root, source.path)), { recursive: true });
    fs.writeFileSync(path.join(root, ...source.path.split('/')), source.bytes);
  }
  /** @type {any[]} */
  const journal = [];
  const reads = /** @type {string[]} */ ([]);
  const worker = startEvidenceWorker({
    binding: { ...BINDING },
    qualification: { version: 1, runId, fixtureRoot: root, fixtureSha256: manifest.sha256 },
    extension: { loader: { source: 'fixed_loader', resolvedUrl: pathToFileURL(JOINED_PATH).href, path: JOINED_PATH, bytes: 716_344, sha256: 'e'.repeat(64) }, pid: 4242 },
    runtime: { path: path.join(os.tmpdir(), 'fixture-runtime', 'copilot.exe'), args: [], env: { SystemRoot: 'C:\\Windows' }, gitHubToken: 'fixture-token' },
    model: 'fixture-model-worker',
    prompt: 'Which is the highest lifecycle number?',
    contentBytes: 32_768,
    timeoutMs: 60_000,
    evidence: {
      inventory: () => { reads.push('inventory'); return { ok: true, text: '{"records":[{"reference":"w/.dude/ideas/101-peer-latest.md","number":101}]}' }; },
      read: (/** @type {any} */ request) => {
        if (request.reference !== 'w/.dude/ideas/101-peer-latest.md') return { ok: false, reason: 'not_listed' };
        reads.push('read');
        return { ok: true, text: 'number 101' };
      },
    },
    // Each record goes through JSON exactly as a journal line would, so digests are taken over what the journal holds.
    checkpoint: (/** @type {any} */ entry) => { journal.push(JSON.parse(JSON.stringify({ kind: entry.kind, data: entry.data }))); return { ok: true }; },
  }, { loadSdk: async () => workerSdk().sdk, tempParent: tempDir('dude-nqs-') });
  return { worker, journal, root, runId, manifest, reads };
}

/** @param {any[]} journal @param {string} kind */
async function recorded(journal, kind) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const found = journal.find((entry) => entry.kind === kind);
    if (found) return found.data;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error(`no ${kind} record`);
}

test('the actual worker sends its prompt and reads evidence only after the exact releases written here; an injected SDK never passes the preflight check', async () => {
  const { worker, journal, root, runId, manifest, reads } = qualifiedWorker();
  const startup = await worker.startup;
  assert.equal(startup.ok, true, JSON.stringify(startup));
  const preflight = await recorded(journal, 'worker_preflight');
  assert.equal(observationDigest(preflight), /** @type {any} */ (startup).sha256, 'the digest over the journaled record is the worker\'s own');
  // The actual worker records what its session reported about its own storage, and this runner accepts exactly that record:
  // a workspace in the worker's own configuration storage that is still the same directory by path, device, and inode.
  assert.deepEqual([preflight.sessionStorage.kind, preflight.sessionStorage.metadataSessionId, preflight.sessionStorage.workspacePath],
    ['workspace', 'child-session-1', path.join(preflight.storage, 'config', 'session-state', 'child-session-1')]);
  assert.equal(recordedWorkspace(preflight.sessionStorage, preflight.sessionId, preflight.storage), 'config/session-state/child-session-1');
  assert.deepEqual(currentWorkspace(preflight), { workspace: 'config/session-state/child-session-1', problems: [] });
  const expected = {
    workerId: worker.workerId, binding: Object.fromEntries(Object.entries(BINDING).filter(([key]) => key !== 'permitId')), runId,
    fixtureSha256: manifest.sha256, canaries: manifest.canaries, canaryBytes: manifest.canaryBytes,
    sdk: { extension: { path: JOINED_PATH, bytes: 716_344, sha256: 'e'.repeat(64) }, index: { path: path.join(os.tmpdir(), 'dude-fixture-sdk', 'index.js'), bytes: 1, sha256: 'f'.repeat(64) } },
    extensionPid: 4242, runtime: { version: '1.0.102-fixture', protocolVersion: 3 }, model: 'fixture-model-worker', storageParent: path.dirname(preflight.storage),
  };
  assert.deepEqual(checkPreflight(preflight, expected), ['loaders.worker'], 'a worker SDK handed in by a test adapter is never production provenance');
  assert.ok(checkPreflight(preflight, { ...expected, extensionPid: 4243 }).includes('extensionPid'));
  assert.ok(checkPreflight(preflight, { ...expected, binding: { ...expected.binding, operationId: randomUUID() } }).includes('binding.operationId'));
  assert.ok(checkPreflight({ ...preflight, ambient: { ...preflight.ambient, skills: 1 } }, expected).includes('ambient'));
  assert.ok(checkPreflight({ ...preflight, probes: preflight.probes.slice(1) }, expected).includes('probes'));
  assert.ok(checkPreflight({ ...preflight, completedAt: new Date(Date.parse(preflight.startedAt) + 10_001).toISOString() }, expected).includes('startup_time'),
    'startup beyond its 10-second bound is not readiness');
  assert.equal(journal.some((entry) => entry.kind === 'worker_ready'), false, 'no prompt before the startup release');
  // In that hold, the worker's own folders hold its copy of the fixed fixture: every canary byte for byte, and a valid Git canary.
  const own = /** @type {string} */ (preflight.storage);
  assertCanaryCopy({ work: path.join(own, 'work'), config: path.join(own, 'config'), home: path.join(own, 'home') }, manifest, 'worker copy');

  writeRelease(root, 'startup', startupReleaseOf({ runId, operationId: BINDING.operationId, preflight }));
  const pending = await recorded(journal, 'worker_evidence_pending');
  const admitted = await recorded(journal, 'worker_request_admitted');
  assert.deepEqual(checkPending(pending, { workerId: worker.workerId, sessionId: preflight.sessionId, admissionId: admitted.admissionId }), []);
  assert.deepEqual(reads, [], 'the held call read nothing');
  writeRelease(root, 'evidence', evidenceReleaseOf({ runId, operationId: BINDING.operationId, preflight, pending }));
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason], ['answered', null]);
  assert.deepEqual(reads, ['inventory', 'read']);
  await worker.closed;

  // A release with any other digest is a mismatch, never a release.
  const forged = qualifiedWorker();
  await forged.worker.startup;
  const forgedPreflight = await recorded(forged.journal, 'worker_preflight');
  writeRelease(forged.root, 'startup', { ...startupReleaseOf({ runId: forged.runId, operationId: BINDING.operationId, preflight: forgedPreflight }),
    observationSha256: '0'.repeat(64) });
  const refused = await forged.worker.result;
  assert.deepEqual([refused.outcome, refused.reason, refused.delivery], ['refused', 'qualification_release_mismatch', 'not_sent']);
  await forged.worker.closed;
});

// ---------------------------------------------------------------------------
// Pure checks the native run relies on, each fed the shapes the product records.
// ---------------------------------------------------------------------------

test('progress counts only the main model\'s own completed edit of its own file, requested and run inside the pending interval', () => {
  const file = path.join(os.tmpdir(), 'dude-progress-fixture', 'progress-a.txt');
  const base = Date.parse('2026-11-01T00:00:00.000Z');
  /** @param {number} at */
  const iso = (at) => new Date(base + at).toISOString();
  /** One session's summarized events; each step is [received at, event]. @param {Array<[number, any]>} steps */
  const session = (steps) => {
    let now = base;
    const log = createSessionLog('a', () => now);
    for (const [at, event] of steps) {
      now = base + at;
      log.onEvent(event);
    }
    return log.state.events;
  };
  /** @param {number} at @param {string} id @param {string} [name] @param {object} [extra] @param {string} [admission] @returns {[number, any]} */
  const request = (at, id, name = 'edit', extra = {}, admission = 'adm-2') => [at, { type: 'assistant.message', timestamp: iso(at), ...extra,
    data: { messageId: `m-${id}`, originatingMessageId: admission, content: '', toolRequests: [{ toolCallId: id, name, arguments: { path: file } }] } }];
  /** @param {number} at @param {string} id @param {string} [toolName] @returns {[number, any]} */
  const started = (at, id, toolName = 'edit') => [at, { type: 'tool.execution_start', timestamp: iso(at), data: { toolCallId: id, toolName, arguments: { path: file } } }];
  /** @param {number} at @param {string} id @param {boolean} [success] @returns {[number, any]} */
  const completed = (at, id, success = true) => [at, { type: 'tool.execution_complete', timestamp: iso(at), data: { toolCallId: id, success, result: { content: 'done' } } }];
  const interval = { file, start: base + 1_000, end: base + 9_000, admission: 'adm-2' };
  assert.deepEqual(checkProgress(session([request(2_000, 'e1'), started(2_100, 'e1'), completed(2_300, 'e1')]), interval),
    { ok: true, toolCallId: 'e1', requestedAt: base + 2_000, completedAt: base + 2_300 });
  /** @type {Array<[string, Array<[number, any]>, string]>} */
  const cases = [
    ['no model request: a direct tools.execute or a counter', [started(2_100, 'd1'), completed(2_300, 'd1')], 'not_requested'],
    ['a subagent\'s request', [request(2_000, 's1', 'edit', { agentId: 'sub-1' }), started(2_100, 's1'), completed(2_300, 's1')], 'not_requested'],
    ['a request of an earlier instruction', [request(2_000, 'p1', 'edit', {}, 'adm-1'), started(2_100, 'p1'), completed(2_300, 'p1')], 'not_requested'],
    ['a request with no originating instruction', [request(2_000, 'u1', 'edit', {}, /** @type {any} */ (null)), started(2_100, 'u1'), completed(2_300, 'u1')],
      'not_requested'],
    ['requested but never run', [request(2_000, 'n1')], 'not_executed'],
    ['run but failed', [request(2_000, 'f1'), started(2_100, 'f1'), completed(2_300, 'f1', false)], 'not_successful'],
    ['requested before the hold', [request(500, 'b1'), started(1_100, 'b1'), completed(1_300, 'b1')], 'outside_interval'],
    ['completed after the release', [request(8_000, 'l1'), started(8_500, 'l1'), completed(9_500, 'l1')], 'outside_interval'],
    ['received after the release though stamped inside', [request(2_000, 'r1'), started(2_100, 'r1'), [9_500, completed(2_300, 'r1')[1]]], 'outside_interval'],
    ['started before it was requested', [request(2_200, 'o1'), started(2_100, 'o1'), completed(2_300, 'o1')], 'out_of_order'],
    ['only viewed', [request(2_000, 'v1', 'view'), started(2_100, 'v1', 'view'), completed(2_300, 'v1')], 'not_an_edit'],
  ];
  for (const [label, steps, reason] of cases) assert.deepEqual(checkProgress(session(steps), interval), { ok: false, reason }, label);
  assert.deepEqual(checkProgress(session([request(2_000, 'e2'), started(2_100, 'e2'), completed(2_300, 'e2')]),
    { ...interval, file: path.join(os.tmpdir(), 'dude-progress-fixture', 'progress-b.txt') }), { ok: false, reason: 'not_requested' }, 'the other main\'s file');
});

test('the permission relay asks only about the pending allowlisted action of a call the session\'s own model requested', () => {
  const root = tempDir('dude-nqm-');
  const file = path.join(root, 'w', 'progress-a.txt');
  const tempRoot = path.join(root, 't');
  const stage = path.join(tempRoot, 'capture-1');
  fs.mkdirSync(stage, { recursive: true });
  const invocation = { sessionId: 's-a' };
  const progress = /** @type {const} */ ({ sessionId: 's-a', requested: ['c1'], phase: 'progress', progress: { file, initial: 'pending\n', final: 'complete\n' },
    capture: null });
  /** @param {string} before @param {string} after @param {object} [extra] */
  const edit = (before, after, extra = {}) => ({ kind: 'write', toolCallId: 'c1', fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
    fileEdits: [{ before: { path: file, content: before }, after: { path: file, content: after } }], ...extra });
  /** @param {any} request @param {any} [allow] @param {any} [where] */
  const decide = (request, allow = progress, where = invocation) => {
    const decision = /** @type {any} */ (matchPermission(request, where, allow));
    return decision.ask ? 'ask' : decision.relay ? `relay ${decision.relay}` : decision.reason;
  };
  // The progress file's read is never asked: it is inside the workspace, whose reads only the exchange step's allowance lets the relay
  // approve (see the workspace-read tests); without that allowance it is refused like any other read in this phase.
  assert.equal(decide({ kind: 'read', toolCallId: 'c1', path: file }), 'not_progress');
  assert.equal(decide(edit('pending\n', 'complete\n')), 'ask');
  assert.match(/** @type {any} */ (matchPermission(edit('pending\n', 'complete\n'), invocation, progress)).summary, /"pending\\n" -> "complete\\n"$/);
  for (const [request, where, reason] of /** @type {Array<[any, any, string]>} */ ([
    [{ kind: 'read', toolCallId: 'c1', path: file }, { sessionId: 's-b' }, 'session_mismatch'],
    [{ kind: 'read', path: file }, invocation, 'unidentified'],
    [{ kind: 'read', toolCallId: 'c9', path: file }, invocation, 'not_model_requested'],
    [edit('pending\n', 'complete\n', { requestSandboxBypass: true }), invocation, 'sandbox_bypass'],
    [edit('pending\n', 'complete'), invocation, 'edit_not_exact'],
    [edit('pending\n', 'complete\n', { fileEdits: undefined }), invocation, 'edit_not_exact'],
    [{ ...edit('pending\n', 'complete\n'), fileEdits: [...edit('pending\n', 'complete\n').fileEdits, ...edit('pending\n', 'complete\n').fileEdits] }, invocation,
      'edit_not_exact'],
    [{ kind: 'read', toolCallId: 'c1', path: path.join(root, 'w', 'other.txt') }, invocation, 'not_progress'],
    [{ kind: 'shell', toolCallId: 'c1', fullCommandText: 'Get-Content progress-a.txt' }, invocation, 'not_progress'],
    [{ kind: 'url', toolCallId: 'c1', url: 'https://example.invalid/' }, invocation, 'not_progress'],
  ])) {
    assert.equal(decide(request, progress, where), reason, JSON.stringify(request).slice(0, 120));
  }
  assert.equal(decide({ kind: 'read', toolCallId: 'c1', path: file }, { ...progress, phase: 'closed', progress: null }), 'not_pending', 'an expired phase');

  const advice = { version: 1, operationId: randomUUID(), observedMaximum: 101 };
  const capture = /** @type {const} */ ({ sessionId: 's-a', requested: ['c1'], phase: 'capture', progress: null, capture: { tempRoot, slug: 'delta', advice } });
  /** @param {string} command @param {object} [extra] */
  const shell = (command, extra = {}) => ({ kind: 'shell', toolCallId: 'c1', fullCommandText: command, intention: 'x', commands: [], possiblePaths: [],
    possibleUrls: [], hasWriteFileRedirection: false, canOfferSessionApproval: false, ...extra });
  const ledger = path.join(stage, 'staged-idea.md');
  const adviceFile = path.join(stage, 'advice.json');
  const publish = (/** @type {string} */ stageArg, /** @type {string} */ adviceArg, slug = 'delta') => shell(
    `node .github/skills/dude-feature-definition/publish-first-capture.mjs --root . --slug ${slug} --stage ${stageArg} --number-advice ${adviceArg}`);
  assert.equal(decide(shell('node .github/skills/dude-engine/feature.mjs ideas --root . --json'), capture), 'ask');
  assert.equal(decide(shell(`(Get-FileHash -Algorithm SHA256 -LiteralPath '${ledger}').Hash.ToLowerInvariant()`), capture), 'ask');
  assert.equal(decide(publish(`"${ledger}"`, `'${adviceFile}'`), capture), 'ask');
  assert.equal(decide(publish(ledger, adviceFile, '\'delta\''), capture), 'ask');
  for (const [request, reason] of /** @type {Array<[any, string]>} */ ([
    [publish(ledger, adviceFile, 'other'), 'command_not_allowed'],
    [publish(path.join(root, 'w', 'staged.md'), adviceFile), 'command_not_allowed'],
    [publish(tempRoot, adviceFile), 'command_not_allowed'],
    [publish(`"${stage}\\$(Remove-Item -Recurse ${root})"`, adviceFile), 'command_not_allowed'],
    [shell(`${publish(ledger, adviceFile).fullCommandText}; Remove-Item -Recurse '${stage}'`), 'command_not_allowed'],
    [shell(`Remove-Item -Recurse '${stage}'`), 'command_not_allowed'],
    [shell(`(Get-FileHash -Algorithm SHA256 -LiteralPath '${path.join(root, 'w', 'secret.txt')}').Hash.ToLowerInvariant()`), 'command_not_allowed'],
    [shell(`(Get-FileHash -Algorithm SHA256 -LiteralPath "${ledger}").Hash.ToLowerInvariant()`), 'command_not_allowed'],
    [shell('node .github/skills/dude-engine/feature.mjs ideas --root . --json', { hasWriteFileRedirection: true }), 'command_effects'],
    [shell('node .github/skills/dude-engine/feature.mjs ideas --root . --json', { possibleUrls: ['https://example.invalid/'] }), 'command_effects'],
  ])) {
    assert.equal(decide(request, capture), reason, request.fullCommandText);
  }
  /** @param {string} target @param {string} content */
  const write = (target, content) => ({ kind: 'write', toolCallId: 'c1', fileName: target, newFileContents: content, diff: '', intention: 'x',
    canOfferSessionApproval: false });
  assert.equal(decide(write(ledger, '# delta\n'), capture), 'ask');
  assert.match(/** @type {any} */ (matchPermission(write(ledger, '# delta\n'), invocation, capture)).summary, new RegExp(`sha256 ${sha256('# delta\n')}\\)$`));
  const staged = { ...advice, ledgerSha256: 'a'.repeat(64), workspace: path.join(root, 'w'), reason: 'Peer advice raises the number.' };
  assert.equal(decide(write(adviceFile, JSON.stringify(staged)), capture), 'ask', 'the unchanged advice plus exactly the three added fields');
  assert.equal(decide(write(adviceFile, JSON.stringify({ ...staged, observedMaximum: 100 })), capture), 'advice_changed');
  assert.equal(decide(write(adviceFile, JSON.stringify({ ...staged, reason: undefined })), capture), 'advice_changed');
  assert.equal(decide(write(adviceFile, JSON.stringify({ ...staged, extra: true })), capture), 'advice_changed');
  fs.writeFileSync(path.join(stage, 'existing.md'), 'x');
  for (const [target, content] of [[path.join(root, 'w', 'staged.md'), 'x'], [path.join(stage, 'existing.md'), 'y'], [tempRoot, 'x'],
    [path.join(stage, 'large.md'), 'x'.repeat(NATIVE_LIMITS.stagedBytes + 1)]]) {
    assert.equal(decide(write(target, content), capture), 'staging_not_allowed', target);
  }
  assert.equal(decide({ kind: 'read', toolCallId: 'c1', path: ledger }, capture), 'ask');
  assert.equal(decide({ kind: 'read', toolCallId: 'c1', path: tempRoot }, capture), 'ask', 'a read of A\'s temp folder itself is asked too');
  assert.equal(decide({ kind: 'read', toolCallId: 'c1', path: path.join(root, 'w', 'x.md') }, capture), 'not_capture');
  assert.equal(decide({ kind: 'mcp', toolCallId: 'c1', serverName: 'x', toolName: 'y' }, capture), 'not_capture');
});

test('the capture prompt names the staging folder, workspace, and fixed hash command, never the peer\'s records or a number', () => {
  // The operation ID is random and may hold any digits; the wording around it must name no B record, peer maximum, or expected
  // number, so it is judged without that ID: for a fresh ID, and for one that itself holds both 101 and 102.
  for (const operationId of [randomUUID(), '0a101b2c-1022-4333-8444-555555555555']) {
    const prompt = capturePrompt(operationId, 'delta', { tempRoot: 'C:\\f\\a\\t', workspace: 'C:\\f\\a\\w' });
    assert.ok(prompt.includes(operationId));
    assert.equal(prompt.split(operationId).length - 1, 1, 'the operation is named once');
    assert.match(prompt, /directly under this session's temporary directory C:\\f\\a\\t\./);
    assert.match(prompt, /canonical root is C:\\f\\a\\w\./);
    assert.match(prompt, /\(Get-FileHash -Algorithm SHA256 -LiteralPath '<absolute staged ledger path>'\)\.Hash\.ToLowerInvariant\(\)/);
    assert.match(prompt, /Decide explicitly whether to use that advice/);
    const fixed = prompt.split(operationId).join('<operation>');
    for (const hidden of ['101', '102', 'peer-latest', 'observedMaximum']) assert.equal(fixed.includes(hidden), false, hidden);
  }
  for (const kind of /** @type {const} */ (['receive', 'ask', 'receive-cancel', 'ask-cancel'])) {
    const text = exchangePrompt(kind, { slug: 'delta', progressFile: 'progress-a.txt' });
    assert.equal(/dude a2a (?:approve|stop)|approve-once/i.test(text), false, `${kind} asks for no approval or stop`);
    assert.equal(text.includes('101') || text.includes('102'), false, `${kind} names no number`);
  }
  assert.match(exchangePrompt('ask-cancel', { slug: 'delta-cancel', progressFile: 'progress-a.txt' }), /"op":"cancel","operationId":"<that operationId>"/);
  assert.equal(exchangePrompt('receive-cancel', { slug: 'x', progressFile: 'progress-b.txt' }).includes('"op":"cancel"'), false);
});

test('the capture prompt has the session do every capture action itself, never through a subagent or another agent', () => {
  const prompt = capturePrompt(randomUUID(), 'delta', { tempRoot: 'C:\\f\\a\\t', workspace: 'C:\\f\\a\\w' });
  assert.equal(prompt.split('\n').find((line) => line.startsWith('Do every capture action')),
    'Do every capture action yourself in this turn, including staging, hashing, and running the publisher; do not delegate to another agent '
    + 'or use a subagent or task tool, because the operator rejects any action not requested by this session\'s own model.');
});

test('proposals are taken only from the session\'s own complete root tool result within the fixed cap', () => {
  const runId = randomUUID();
  const lines = (/** @type {string} */ session, /** @type {boolean} */ worker) => ['Proposal only: nothing is activated. Review this entire native tool result before local approval.',
    `Local: ${session}; provider 6ba7b810-9dad-11d1-80b4-00c04fd430c8; workspace C:\\f\\b\\w`, 'SHARING: Lifecycle record numbers',
    ...(worker ? ['WORKER: separate', `QUALIFICATION: run ${runId}; fixture C:\\f\\q sha256:${'0'.repeat(64)}`] : []),
    'Approval: dude a2a approve bbbbbbbbbbbb; current matching proposal/context only, consumed once',
    'Next: after complete review, type or paste the exact current approval. To decline or cancel, use dude a2a stop.'].join('\n');
  /** @param {string} text @param {{agentId?: string, success?: boolean}} [options] */
  const events = (text, options = {}) => {
    const log = createSessionLog('b');
    const extra = options.agentId ? { agentId: options.agentId } : {};
    log.onEvent({ type: 'tool.execution_start', ...extra, data: { toolCallId: 'p1', toolName: 'dude_a2a_propose', arguments: { profileId: 'b' } } });
    log.onEvent({ type: 'tool.execution_complete', ...extra, data: { toolCallId: 'p1', success: options.success ?? true, result: { content: text } } });
    return log.state.events;
  };
  const text = lines('b-session', true);
  assert.deepEqual(proposalOf(events(text), { sessionId: 'b-session', worker: true, runId }),
    { text, providerGeneration: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' });
  /** @param {() => unknown} call @param {string} reason */
  const refuses = (call, reason) => assert.throws(call, (error) => error instanceof NativeStop && error.reason === reason, reason);
  refuses(() => proposalOf(events(text), { sessionId: 'a-session', worker: true, runId }), 'proposal_unavailable');
  refuses(() => proposalOf(events(lines('b-session', false)), { sessionId: 'b-session', worker: true, runId }), 'proposal_unavailable');
  refuses(() => proposalOf(events(text, { agentId: 'sub-1' }), { sessionId: 'b-session', worker: true, runId }), 'proposal_unavailable');
  refuses(() => proposalOf(events(text, { success: false }), { sessionId: 'b-session', worker: true, runId }), 'proposal_unavailable');
  /** The same proposal with its SHARING line padded to exactly `bytes` in total. @param {number} bytes */
  const sized = (bytes) => text.replace('SHARING: Lifecycle record numbers',
    `SHARING: ${'x'.repeat(bytes - Buffer.byteLength(text) + 'Lifecycle record numbers'.length)}`);
  assert.equal(proposalOf(events(sized(A2A_PROPOSAL_BYTES)), { sessionId: 'b-session', worker: true, runId }).text.length, A2A_PROPOSAL_BYTES);
  refuses(() => proposalOf(events(sized(A2A_PROPOSAL_BYTES + 1)), { sessionId: 'b-session', worker: true, runId }), 'proposal_too_large');
  refuses(() => proposalOf(events(sized(16_385)), { sessionId: 'b-session', worker: true, runId }), 'proposal_unavailable');
});

test('session logs keep identifiers and bounded results, never prompts, model text, reasoning, or history, and overflow instead of truncating', () => {
  const log = createSessionLog('a', () => 7);
  const approval = 'dude a2a approve abcdefabcdef';
  log.onEvent({ type: 'user.message', data: { messageId: 'u1', content: approval, transformedContent: 'SYSTEM-WRAPPED-PROMPT' } });
  log.onEvent({ type: 'assistant.message', data: { messageId: 'm1', content: 'MODEL-TEXT', reasoningText: 'HIDDEN-REASONING',
    toolRequests: [{ toolCallId: 't1', name: 'powershell', arguments: { command: 'Get-Date', description: 'MODEL-DESCRIPTION' } }] } });
  log.onEvent({ type: 'assistant.reasoning', data: { reasoningId: 'r1', content: 'HIDDEN-REASONING' } });
  log.onEvent({ type: 'system.message', data: { content: 'SYSTEM-INSTRUCTIONS', role: 'system' } });
  log.onEvent({ type: 'session.info', data: { infoType: 'notification', message: 'PRIVATE-NOTE' } });
  log.onEvent({ type: 'tool.execution_complete', data: { toolCallId: 't1', success: true, result: { content: 'x'.repeat(16_385) } } });
  const kept = JSON.stringify(log.state.events);
  for (const hidden of [approval, 'SYSTEM-WRAPPED-PROMPT', 'MODEL-TEXT', 'HIDDEN-REASONING', 'MODEL-DESCRIPTION', 'SYSTEM-INSTRUCTIONS', 'PRIVATE-NOTE']) {
    assert.equal(kept.includes(hidden), false, hidden);
  }
  const [user, assistant] = log.state.events;
  assert.deepEqual([user.messageId, user.source, user.contentSha256, user.root], ['u1', null, sha256(approval), true]);
  assert.deepEqual(assistant.toolRequests, [{ toolCallId: 't1', name: 'powershell', arguments: { command: 'Get-Date' },
    argumentsSha256: sha256('{"command":"Get-Date","description":"MODEL-DESCRIPTION"}') }], 'the kept part, and only a digest of the exact arguments');
  assert.equal(log.state.events.at(-1).content, null, 'an oversized result is not kept, only its digest');
  assert.equal(log.state.events.at(-1).contentSha256, sha256('x'.repeat(16_385)));
  assert.equal(log.state.events.at(-1).result, null, 'nor is a model-facing result over the after-view bound');
  const bound = NATIVE_LIMITS.viewOutputBytes;
  const view = summarizeEvent({ type: 'tool.execution_complete', data: { toolCallId: 't2', success: true, result: { content: 'y'.repeat(bound) } } }, 0);
  assert.deepEqual([view.result, view.resultBytes, view.resultSha256], ['y'.repeat(bound), bound, sha256('y'.repeat(bound))],
    'a model-facing result within the bound is kept whole beside its size and digest');
  const overBound = summarizeEvent({ type: 'tool.execution_complete', data: { toolCallId: 't3', success: true, result: { content: 'y'.repeat(bound + 1) } } }, 0);
  assert.deepEqual([overBound.result, overBound.resultBytes], [null, bound + 1], 'one byte more keeps only its size and digest');
  // The bound is UTF-8 bytes, not characters: three-byte characters reach it with a third as many characters.
  for (const [content, kept] of /** @type {Array<[string, boolean]>} */ ([['\u20ac'.repeat(1_365), true], [`${'\u20ac'.repeat(1_365)}a`, true],
    [`${'\u20ac'.repeat(1_365)}ab`, false], ['\u20ac'.repeat(1_366), false]])) {
    const bytes = Buffer.byteLength(content, 'utf8');
    const wide = summarizeEvent({ type: 'tool.execution_complete', data: { toolCallId: 't4', success: true, result: { content } } }, 0);
    assert.deepEqual([wide.result, wide.resultBytes, wide.resultSha256], [kept ? content : null, bytes, sha256(content)],
      `${content.length} characters, ${bytes} bytes: ${kept ? 'kept whole' : 'only its size and digest'}`);
  }
  assert.equal(summarizeEvent({ type: 'user.message', agentId: 'sub-1', data: { content: approval } }, 0).root, false);

  const full = createSessionLog('b');
  for (let index = 0; index <= NATIVE_LIMITS.events; index += 1) full.onEvent({ type: 'session.idle', data: {} });
  assert.deepEqual([full.state.events.length, full.state.overflow], [NATIVE_LIMITS.events, true]);

  /** @param {number} count */
  const requests = (count) => ({ type: 'assistant.message', data: { messageId: 'm', content: '',
    toolRequests: Array.from({ length: count }, (_, index) => ({ toolCallId: `t${index}`, name: 'view', arguments: { path: 'x' } })) } });
  const bounded = createSessionLog('a');
  bounded.onEvent(requests(NATIVE_LIMITS.toolRequests));
  assert.deepEqual([bounded.state.events[0].toolRequests.length, bounded.state.overflow], [NATIVE_LIMITS.toolRequests, false], 'the bound itself is kept whole');
  const over = createSessionLog('a');
  over.onEvent({ type: 'session.idle', data: {} });
  over.onEvent(requests(NATIVE_LIMITS.toolRequests + 1));
  over.onEvent({ type: 'session.idle', data: {} });
  assert.deepEqual([over.state.events.length, over.state.overflow], [1, true], 'one request more overflows the log instead of being sliced, and it stays overflowed');
});

/** Journal records the way the product writes them, for one operation. @param {string} operationId @param {Array<[string, any?]>} rows */
function journalOf(operationId, rows) {
  const at = Date.parse('2026-11-01T00:00:00.000Z');
  return rows.map(([kind, data = {}], index) => ({ sequence: index + 1, time: new Date(at + index * 100).toISOString(), kind, operationId, data }));
}

test('journal, receipt, and cancellation checks accept the exact recorded shapes and name each mismatch', () => {
  const op = randomUUID();
  const answered = () => journalOf(op, [['opened'], ['accepted'], ['request_prepared'], ['request_write_started'], ['reply_received'], ['reply_validated'],
    ['terminal', { outcome: 'answer' }], ['closed', { gaps: 0 }]]);
  assert.deepEqual(checkAnsweredJournal(answered(), op), []);
  assert.deepEqual(checkAnsweredJournal([...answered(), ...journalOf(op, [['qualification_note']])], op), ['kinds', 'sequence'],
    'no record may be appended to the answered journal');
  const other = answered();
  other[3].operationId = randomUUID();
  assert.deepEqual(checkAnsweredJournal(other, op), ['sequence']);

  const record101 = 'w/.dude/ideas/101-peer-latest.md';
  const answer = { observedMaximum: 101, explanation: 'The listed records end at 101.', limitations: 'none', citations: [{ reference: record101 }] };
  /** @param {(records: any[]) => void} [mutate] */
  const served = (mutate) => {
    const records = journalOf(op, [['opened'], ['accepted'], ['request_admitted'], ['worker_started'], ['worker_preflight'], ['worker_ready'],
      ['worker_request_admitted', { admissionId: 'adm-1' }], ['worker_evidence_pending'], ['evidence_returned'], ['evidence_returned'],
      ['worker_finished', { workerId: 'wk-1', outcome: 'answered', admissionId: 'adm-1', permissionDenials: {},
        observations: [{ tool: 'inventory', outcome: 'returned', reference: null }, { tool: 'read', outcome: 'returned', reference: record101 }],
        answer: { text: `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`` } }],
      ['reply_prepared'], ['reply_write_started'], ['reply_written', { written: 'sent' }], ['terminal', { outcome: 'sent' }], ['cleanup'], ['closed', { gaps: 0 }]]);
    mutate?.(records);
    return checkServedJournal(records, { operationId: op, workerId: 'wk-1', record101 });
  };
  const finished = (/** @type {any[]} */ records) => records[10].data;
  assert.deepEqual(served(), []);
  assert.deepEqual(served((records) => records.splice(7, 1)), ['kinds'], 'no held call');
  assert.deepEqual(served((records) => { finished(records).permissionDenials = { shell: 1 }; }), ['worker_finished']);
  assert.deepEqual(served((records) => { finished(records).observations[1].reference = 'w/.dude/ideas/100-peer-seed.md'; }), ['evidence_reads']);
  assert.deepEqual(served((records) => { finished(records).answer.text = JSON.stringify({ ...answer, citations: [] }); }), ['answer']);
  assert.deepEqual(served((records) => { finished(records).answer.text = JSON.stringify({ ...answer, observedMaximum: 102 }); }), ['answer']);
  assert.deepEqual(journalTimings(journalOf(op, [['accepted'], ['worker_started'], ['worker_preflight'], ['worker_finished'], ['terminal']])),
    { operationMs: 400, startupMs: 100, workerMs: 200 });

  const capture = { projectId: 'dude-number-poc', operationId: op, conversationId: randomUUID(), questionId: 'q-1', exchangeId: randomUUID(),
    peerCertSha256: 'b'.repeat(64), reply: { sequence: 1, sha256: 'c'.repeat(64) } };
  const receipt = { version: 1, kind: 'number_advice_receipt', ideaPath: '.dude/ideas/102-delta.md', slug: 'delta', ledgerSha256: 'd'.repeat(64),
    conversation: { ...capture }, selection: { freshLocalMaximum: 100, peerObservedMaximum: 101, localOnlyNumber: 101, chosenNumber: 102, influence: 'raised' } };
  const expected = { slug: 'delta', capture, ideaPath: '.dude/ideas/102-delta.md', ledgerSha256: 'd'.repeat(64) };
  assert.deepEqual(checkReceipt(receipt, expected), []);
  assert.deepEqual(checkReceipt({ ...receipt, selection: { ...receipt.selection, chosenNumber: 101, influence: 'none' } }, expected),
    ['selection.chosenNumber', 'selection.influence']);
  assert.deepEqual(checkReceipt({ ...receipt, conversation: { ...capture, operationId: randomUUID() } }, expected), ['conversation.operationId']);
  assert.deepEqual(checkReceipt({ kind: 'other' }, expected), ['shape']);

  const cueAt = Date.parse('2026-11-01T00:01:00.000Z');
  const call = { start: { ts: cueAt + 300 }, complete: { ts: cueAt + 500 },
    result: { outcome: 'cancelled', reason: 'cancelled', delivery: 'may_have_occurred', cancelled: true } };
  const aRecords = journalOf(op, [['opened'], ['accepted'], ['request_prepared'], ['request_write_started'],
    ['terminal', { outcome: 'cancelled', delivery: 'may_have_occurred' }], ['closed', { gaps: 0 }]]);
  const bRecords = journalOf(randomUUID(), [['opened'], ['accepted'], ['request_admitted'], ['worker_started'], ['worker_preflight'], ['worker_ready'],
    ['worker_request_admitted'], ['worker_evidence_pending'], ['worker_finished'], ['terminal', { outcome: 'cancelled' }], ['cleanup'], ['closed']]);
  assert.deepEqual(checkCancellation({ call, cueAt, aRecords, bRecords }), []);
  assert.deepEqual(checkCancellation({ call: null, cueAt, aRecords, bRecords }), ['cancel_not_called']);
  assert.deepEqual(checkCancellation({ call: { ...call, start: { ts: cueAt - 1 } }, cueAt, aRecords, bRecords }), ['cancel_before_cue']);
  assert.deepEqual(checkCancellation({ call: { ...call, complete: { ts: cueAt + 1_301 } }, cueAt, aRecords, bRecords }), ['cancel_slow']);
  assert.deepEqual(checkCancellation({ call: { ...call, result: { ...call.result, delivery: 'not_sent' } }, cueAt, aRecords, bRecords }), ['cancel_result']);
  const revived = [...bRecords.slice(0, 8), ...journalOf(randomUUID(), [['evidence_returned']]), ...bRecords.slice(8)];
  assert.deepEqual(checkCancellation({ call, cueAt, aRecords, bRecords: revived }), ['b_kinds'], 'no evidence after cancellation');
  assert.deepEqual(immediateTimings([call, { start: { ts: 0 }, complete: { ts: 1_001 } }, { start: { ts: null }, complete: { ts: 5 } }]),
    { maxMs: Number.POSITIVE_INFINITY, over: 2 });
});

test('release files are exact, bounded, atomic, and never authority; reports are bounded and escaped for the terminal', () => {
  const root = tempDir('dude-nqr-');
  const preflight = { workerId: randomUUID(), sessionId: 's-1', binding: { permitId: randomUUID() } };
  const release = startupReleaseOf({ runId: randomUUID(), operationId: randomUUID(), preflight });
  assert.deepEqual(Object.keys(release), ['version', 'release', 'runId', 'workerId', 'operationId', 'permitId', 'sessionId', 'observationSha256']);
  assert.equal(release.observationSha256, observationDigest(preflight));
  const written = writeRelease(root, 'startup', release);
  assert.equal(written.path, path.join(root, `${preflight.workerId}.startup-release.json`));
  assert.deepEqual(fs.readdirSync(root), [path.basename(written.path)], 'nothing partial is left beside it');
  assert.deepEqual(JSON.parse(fs.readFileSync(written.path, 'utf8')), release);
  const pending = { workerId: preflight.workerId, sessionId: 's-1', admissionId: 'adm-1', toolCallId: 'call-1', tool: WORKER_TOOLS.inventory };
  const evidence = evidenceReleaseOf({ runId: release.runId, operationId: release.operationId, preflight, pending });
  assert.deepEqual([evidence.release, evidence.admissionId, evidence.toolCallId, evidence.observationSha256], ['evidence', 'adm-1', 'call-1',
    observationDigest(pending)]);
  assert.deepEqual(checkPending({ ...pending, extra: 1 }, { workerId: preflight.workerId, sessionId: 's-1', admissionId: 'adm-1' }), ['shape']);
  assert.deepEqual(checkPending(pending, { workerId: preflight.workerId, sessionId: 's-1', admissionId: 'adm-2' }), ['admissionId']);
  assert.throws(() => writeRelease(root, 'evidence', { ...evidence, padding: 'x'.repeat(1_024) }),
    (error) => error instanceof NativeStop && error.reason === 'qualification_release_mismatch');

  const report = { tool: 'qualify-collaboration', version: 2, mode: 'native', layer: 'native', verdict: 'qualified', runId: 'r', scopeSha256: 's',
    checks: [{ detail: 'x'.repeat(NATIVE_LIMITS.reportBytes) }] };
  const bounded = boundReport(report);
  assert.deepEqual([bounded.verdict, bounded.reason, 'checks' in bounded], ['failed', 'observation_overflow', false], 'overflow is never a pass');
  const small = { ...report, checks: [] };
  assert.equal(boundReport(small), small, 'a report within the bound is returned whole');
  assert.equal(terminalSafe('a\u001b[2Jb\u202ec\nd'), 'a\\u001b[2Jb\\u202ec\\u000ad');
  assert.equal(terminalLines('one\r\ntwo\u0007\nthree'), 'one\\u000d\ntwo\\u0007\nthree', 'line breaks stay readable; every other control is escaped');
});

// ---------------------------------------------------------------------------
// The after-view control's facts and the served worker's recorded storage, each removed or changed alone.
// ---------------------------------------------------------------------------

/** The fixed control layout below a synthetic parent, as the native run resolves it. @param {string} [parent] */
function controlFiles(parent = path.join(os.tmpdir(), 'dude-avc')) {
  const project = path.join(parent, 'k', 'w');
  const cwd = path.join(parent, 'k', 't');
  const target = path.join(project, AFTER_VIEW_CONTROL.target);
  const source = path.join(project, AFTER_VIEW_CONTROL.source);
  const instructions = CANARIES.filter((canary) => canary.location === 'work' && ['instructions', 'on_demand_instructions'].includes(canary.kind))
    .map((canary) => ({ path: canary.path, file: path.join(project, ...canary.path.split('/')), content: /** @type {string} */ (canary.content) }));
  const output = /** @type {string} */ (CANARIES.find((canary) => canary.path === AFTER_VIEW_CONTROL.target)?.content);
  return { project, cwd, target, source, instructions, output, line: output.replace(/\n$/, ''), prompt: afterViewPrompt(target), bases: [project, cwd] };
}

test('the after-view control needs each fact of its one model-driven activation, in its own session\'s events; each removed or changed alone refuses, the notification may come before or after the completion, and static discovery, a direct tool execution, or the model\'s words never stand in', () => {
  const files = controlFiles();
  // Its prompt was sent before the first of these events (`sentAt`), so each is judged as its turn's own.
  const expected = { admission: 'adm-1', prompt: files.prompt, target: files.target, output: files.output, source: files.source,
    instructions: files.instructions.map((entry) => entry.file), bases: files.bases, bound: { sentAt: 0 } };
  /** @param {string} type @param {Record<string, unknown>} data @param {Record<string, unknown>} [extra] */
  const event = (type, data, extra = {}) => ({ type, id: randomUUID(), timestamp: new Date().toISOString(), data, ...extra });
  const raw = () => /** @type {Record<string, any>} */ ({
    admission: event('user.message', { messageId: 'adm-1', content: files.prompt }),
    request: event('assistant.message', { messageId: 'm-1', originatingMessageId: 'adm-1', content: '', toolRequests: [{ toolCallId: 'v1', name: 'view',
      arguments: { path: files.target } }] }),
    start: event('tool.execution_start', { toolCallId: 'v1', toolName: 'view', arguments: { path: files.target } }),
    notification: event('system.notification', { content: 'x', kind: { type: 'instruction_discovered', sourcePath: 'AGENTS.md', triggerFile: files.target,
      triggerTool: 'view' } }),
    complete: event('tool.execution_complete', { toolCallId: 'v1', success: true, result: { content: files.output, detailedContent: `1. ${files.output}` } }),
    reply: event('assistant.message', { messageId: 'm-2', originatingMessageId: 'adm-1', content: 'I viewed it.' }),
    idle: event('session.idle', {}),
  });
  const ORDER = ['admission', 'request', 'start', 'notification', 'complete', 'reply', 'idle'];
  /** @param {(events: Record<string, any>) => void} [change] @param {string[]} [order] */
  const judge = (change, order = ORDER) => {
    const events = raw();
    change?.(events);
    const log = createSessionLog('control');
    for (const name of order) if (events[name]) log.onEvent(events[name]);
    return checkAfterViewControl(log.state.events, expected);
  };
  const valid = judge();
  assert.deepEqual(valid.problems, []);
  assert.deepEqual([valid.proof?.admissionId, valid.proof?.toolCallId, valid.proof?.output, valid.proof?.notification], ['adm-1', 'v1',
    { bytes: Buffer.byteLength(files.output), sha256: sha256(files.output) }, { sourcePath: 'AGENTS.md', triggerFile: files.target, triggerTool: 'view' }]);
  assert.ok(Object.values(valid.proof?.eventIds ?? {}).every((id) => UUID_PATTERN.test(String(id))));
  assert.deepEqual(judge(undefined, ['admission', 'request', 'start', 'complete', 'notification', 'reply', 'idle']).problems, [],
    'the notification may also come after the completion');
  assert.deepEqual(judge((events) => { events.notification.data.kind.sourcePath = path.relative(files.cwd, files.source); }).problems, [],
    'a source path relative to the session\'s working directory names the same file');
  assert.deepEqual(judge((events) => { events.other = event('system.notification', { content: 'x', kind: { type: 'instruction_discovered',
    sourcePath: '.github/copilot-instructions.md', triggerFile: files.target, triggerTool: 'view' } }); }, [...ORDER.slice(0, 5), 'other', ...ORDER.slice(5)]).problems, [],
  'another fixed instruction canary surfaced by the same view');
  // A view may decorate what its model sees. The file's one line, exactly once, within the bound, is what counts, and the proof keeps
  // the byte count and digest of the complete model-facing result, whatever its form.
  const atBound = `1. ${files.line}\n`.padEnd(NATIVE_LIMITS.viewOutputBytes, '.');
  assert.equal(Buffer.byteLength(atBound), NATIVE_LIMITS.viewOutputBytes);
  for (const [label, shown] of [['a heading and a numbered line', `${files.target}:\n1. ${files.line}\n`], ['a numbered line with no final line break',
    `1. ${files.line}`], ['the file\'s text alone', files.output], ['a result of exactly the bound', atBound]]) {
    const decorated = judge((events) => { events.complete.data.result = { content: shown, detailedContent: `timeline: ${shown}` }; });
    assert.deepEqual(decorated.problems, [], label);
    assert.deepEqual(decorated.proof?.output, { bytes: Buffer.byteLength(shown), sha256: sha256(shown) }, `${label}: the complete model-facing result, by size and digest`);
  }

  /** @type {Array<[string, (events: Record<string, any>) => void, string[] | null, string | string[]]>} */
  const cases = [
    ['another prompt than the fixed one', (events) => { events.admission.data.content = 'Read the file.'; }, null, 'admission'],
    ['an attributed admission', (events) => { events.admission.data.source = 'sdk-relay'; }, null, 'admission'],
    ['a second root prompt', (events) => { events.extra = event('user.message', { messageId: 'adm-2', content: 'again' }); },
      [...ORDER.slice(0, 2), 'extra', ...ORDER.slice(2)], ['other_prompt', 'competing_event']],
    ['a subagent\'s message', (events) => { events.extra = event('assistant.message', { messageId: 'm-s', content: 'sub' }, { agentId: 'sub-1' }); },
      [...ORDER.slice(0, 2), 'extra', ...ORDER.slice(2)], 'subagent'],
    ['a hook run', (events) => { events.extra = event('hook.start', { hookType: 'preToolUse' }); }, [...ORDER.slice(0, 2), 'extra', ...ORDER.slice(2)],
      'competing_event'],
    ['a direct tool execution with no model request', (events) => { delete events.request; }, null, 'tool_requests'],
    ['a second view request', (events) => { events.extra = event('assistant.message', { messageId: 'm-x', originatingMessageId: 'adm-1', content: '',
      toolRequests: [{ toolCallId: 'v2', name: 'view', arguments: { path: files.source } }] }); }, [...ORDER.slice(0, 2), 'extra', ...ORDER.slice(2)], 'tool_requests'],
    // A message stating another admission than `send` returned is that admission's, never this one's: it refuses too.
    ['a request of an earlier admission', (events) => { events.request.data.originatingMessageId = 'adm-0'; }, null, ['competing_event', 'request_admission']],
    ['a request with one more argument', (events) => {
      events.request.data.toolRequests[0].arguments = { path: files.target, view_range: [1, 2] };
      events.start.data.arguments = { path: files.target, view_range: [1, 2] };
    }, null, 'request_arguments'],
    ['a request of another tool', (events) => { events.request.data.toolRequests[0].name = 'str_replace_editor'; }, null, 'request_arguments'],
    ['no start', (events) => { delete events.start; }, null, 'start'],
    ['a start with other arguments than requested', (events) => { events.start.data.arguments = { path: files.source }; }, null, 'start'],
    ['a start of another call', (events) => { events.start.data.toolCallId = 'v-other'; }, null, 'start'],
    ['a start before its request', () => undefined, ['admission', 'start', 'request', 'notification', 'complete', 'reply', 'idle'], 'start'],
    ['no completion', (events) => { delete events.complete; }, null, 'completion'],
    ['a completion of another call', (events) => { events.complete.data.toolCallId = 'v-other'; }, null, 'completion'],
    ['a completion before its start', () => undefined, ['admission', 'request', 'complete', 'start', 'notification', 'reply', 'idle'], 'completion'],
    ['a failed completion', (events) => { events.complete.data.success = false; }, null, 'completion'],
    ['another output', (events) => { events.complete.data.result = { content: 'Synthetic other text.\n' }; }, null, 'output'],
    ['another output of exactly the same byte length', (events) => {
      const other = files.output.replace(/[A-Za-z]/, (letter) => (letter === 'x' ? 'y' : 'x'));
      assert.ok(other !== files.output && Buffer.byteLength(other) === Buffer.byteLength(files.output));
      events.complete.data.result = { content: other };
    }, null, 'output'],
    ['the target\'s text shown twice', (events) => { events.complete.data.result = { content: `1. ${files.line}\n2. ${files.line}\n` }; }, null, 'output'],
    ['the target\'s text altered inside a decorated result', (events) => {
      events.complete.data.result = { content: `${files.target}:\n1. ${files.line.replace('never', 'ever')}\n` };
    }, null, 'output'],
    ['the target\'s text only in the timeline copy', (events) => { events.complete.data.result = { content: 'viewed', detailedContent: `1. ${files.line}\n` }; },
      null, 'output'],
    ['an empty result', (events) => { events.complete.data.result = { content: '' }; }, null, 'output'],
    ['a decorated result one byte over the bound', (events) => { events.complete.data.result = { content: `${atBound}.` }; }, null, 'output'],
    ['no notification: static discovery alone', (events) => { delete events.notification; }, null, 'notification'],
    ['a notification for another source', (events) => { events.notification.data.kind.sourcePath = 'README.md'; }, null, 'notification'],
    ['a notification for another trigger file', (events) => { events.notification.data.kind.triggerFile = files.source; }, null, 'notification'],
    ['a notification for another trigger tool', (events) => { events.notification.data.kind.triggerTool = 'grep'; }, null, 'notification'],
    ['a notification before the view started', () => undefined, ['admission', 'request', 'notification', 'start', 'complete', 'reply', 'idle'], 'notification'],
    // After the turn's end only another normal idle may come; a late notification refuses, and it supplies nothing.
    ['a notification after the turn ended', () => undefined, ['admission', 'request', 'start', 'complete', 'reply', 'idle', 'notification'],
      ['notification', 'competing_event']],
    ['a second discovery of a file that is no fixed canary', (events) => { events.extra = event('system.notification', { content: 'x',
      kind: { type: 'instruction_discovered', sourcePath: 'NOTES.md', triggerFile: files.target, triggerTool: 'view' } }); },
    [...ORDER.slice(0, 4), 'extra', ...ORDER.slice(4)], 'notification'],
    ['no turn end', (events) => { delete events.idle; }, null, 'turn_end'],
    // An aborted loop is no normal idle in any phase.
    ['an aborted turn', (events) => { events.idle.data.aborted = true; }, null, ['competing_event', 'turn_end']],
    ['only the model saying it viewed the file', (events) => {
      for (const name of ['request', 'start', 'notification', 'complete']) delete events[name];
      events.reply.data.content = 'I viewed the file, and AGENTS.md was discovered and loaded.';
    }, null, 'tool_requests'],
  ];
  for (const [label, change, order, problem] of cases) {
    const found = judge(change, order ?? ORDER);
    assert.deepEqual(found.problems, Array.isArray(problem) ? problem : [problem], label);
    assert.equal(found.proof, null, `${label}: no proof`);
  }

  // Each fact the proof reads is validated, through the actual summarizer, before its summary is used: a lossy value refuses that
  // fact, and the event also stands outside the activation, instead of passing as a default. Each case changes one field of an
  // otherwise valid session.
  const sub = /** @param {string} name @param {Record<string, unknown>} extra */ (name, extra) => (/** @type {Record<string, any>} */ events) => {
    Object.assign(events[name], extra);
  };
  /** @type {Array<[string, (events: Record<string, any>) => void, string[] | null, string[]]>} */
  const unsound = [
    // An attribution present but not one bounded, documented string is not the absence an unattributed admission needs.
    ['an admission attributed by a source one byte over its bound', (events) => { events.admission.data.source = 's'.repeat(129); }, null,
      ['admission', 'competing_event']],
    ['an admission attributed by an empty source', (events) => { events.admission.data.source = ''; }, null, ['admission', 'competing_event']],
    ['an admission whose source is not text', (events) => { events.admission.data.source = 7; }, null, ['admission', 'competing_event']],
    ['an admission whose source is null', (events) => { events.admission.data.source = null; }, null, ['admission', 'competing_event']],
    ['an admission whose content is not text', (events) => { events.admission.data.content = { text: files.prompt }; }, null, ['admission', 'competing_event']],
    // The documented root event has no agent ID at all (generated/session-events.d.ts:2010-2013); null is not that absence.
    ['an admission whose agent ID is null', sub('admission', { agentId: null }), null, ['admission', 'competing_event']],
    ['a request whose agent ID is null', sub('request', { agentId: null }), null, ['competing_event', 'request_arguments']],
    ['a start whose agent ID is null', sub('start', { agentId: null }), null, ['competing_event', 'start']],
    ['a completion whose agent ID is null', sub('complete', { agentId: null }), null, ['competing_event', 'completion']],
    ['a notification whose agent ID is null', sub('notification', { agentId: null }), null, ['competing_event', 'notification']],
    ['a turn end whose agent ID is null', sub('idle', { agentId: null }), null, ['competing_event', 'turn_end']],
    ['a start whose agent ID is an empty string', sub('start', { agentId: '' }), null, ['competing_event', 'start']],
    ['a start whose agent ID is not text', sub('start', { agentId: 5 }), null, ['competing_event', 'start']],
    // The documented sub-agent marker on the events that carry it (:6200, :7395, :7688).
    ['a request made under a parent tool call', (events) => { events.request.data.parentToolCallId = 'task-1'; }, null, ['subagent', 'request_arguments']],
    ['a start under a parent tool call', (events) => { events.start.data.parentToolCallId = 'task-1'; }, null, ['subagent', 'start']],
    ['a completion under a parent tool call', (events) => { events.complete.data.parentToolCallId = 'task-1'; }, null, ['subagent', 'completion']],
    // Only an absent or boolean abort flag is documented (:2039-2045); anything else is no normal turn end.
    ['a turn end whose abort flag is a string', (events) => { events.idle.data.aborted = 'false'; }, null, ['competing_event', 'turn_end']],
    ['a turn end whose abort flag is null', (events) => { events.idle.data.aborted = null; }, null, ['competing_event', 'turn_end']],
    ['a turn end whose abort flag is zero', (events) => { events.idle.data.aborted = 0; }, null, ['competing_event', 'turn_end']],
    // Every retained event identity is present and bounded (:2019-2022), never null in the proof.
    ['an admission with no event ID', (events) => { delete events.admission.id; }, null, ['admission', 'competing_event']],
    ['a request with an event ID one byte over its bound', sub('request', { id: 'i'.repeat(129) }), null, ['competing_event', 'request_arguments']],
    ['a start with an empty event ID', sub('start', { id: '' }), null, ['competing_event', 'start']],
    ['a completion with no event ID', (events) => { delete events.complete.id; }, null, ['competing_event', 'completion']],
    ['a notification with an event ID that is not text', sub('notification', { id: 42 }), null, ['competing_event', 'notification']],
    ['a turn end with no event ID', (events) => { delete events.idle.id; }, null, ['competing_event', 'turn_end']],
    ['an event with no data', (events) => { delete events.reply.data; }, null, ['competing_event']],
    // Each consumed field of its own event.
    ['a completion whose success is not a boolean', (events) => { events.complete.data.success = 'true'; }, null, ['competing_event', 'completion']],
    ['a completion whose result has no model-facing content: an opaque output', (events) => {
      events.complete.data.result = { detailedContent: files.output };
    }, null, ['competing_event', 'completion']],
    ['a completion whose model-facing content is not text', (events) => { events.complete.data.result = { content: [files.output] }; }, null,
      ['competing_event', 'completion']],
    ['a completion of a call the user requested', (events) => { events.complete.data.isUserRequested = true; }, null, ['competing_event', 'completion']],
    ['a completion whose user-request flag is not a boolean', (events) => { events.complete.data.isUserRequested = 'no'; }, null,
      ['competing_event', 'completion']],
    ['a completion whose call ID is over its bound', (events) => {
      events.complete.data.toolCallId = 'v'.repeat(257);
    }, null, ['competing_event', 'completion']],
    ['a start whose tool name is missing', (events) => { delete events.start.data.toolName; }, null, ['competing_event', 'start']],
    ['a start of a view an MCP server hosts', (events) => { events.start.data.mcpServerName = 'dude-canary-probe'; }, null, ['competing_event', 'start']],
    ['a request of a view an MCP server hosts', (events) => { events.request.data.toolRequests[0].mcpServerName = 'dude-canary-probe'; }, null,
      ['competing_event', 'request_arguments']],
    ['a request a hosted program made', (events) => { events.request.data.toolRequests[0].caller = { callerId: 'p', type: 'program' }; }, null,
      ['competing_event', 'request_arguments']],
    ['a request whose originating message is not text', (events) => { events.request.data.originatingMessageId = ['adm-1']; }, null,
      ['competing_event', 'request_admission']],
    ['a request entry with no call ID', (events) => { delete events.request.data.toolRequests[0].toolCallId; }, null, ['competing_event', 'request_arguments']],
    ['a tool request list that is no list, on the reply', (events) => {
      events.reply.data.toolRequests = { toolCallId: 'v2', name: 'view', arguments: { path: files.source } };
    }, null, ['competing_event']],
    ['a notification kind with no type', (events) => { delete events.notification.data.kind.type; }, null, ['competing_event', 'notification']],
    ['a notification whose trigger tool is over its bound', (events) => { events.notification.data.kind.triggerTool = 'v'.repeat(65); }, null,
      ['competing_event', 'notification']],
    ['a notification with no source path', (events) => { delete events.notification.data.kind.sourcePath; }, null, ['competing_event', 'notification']],
    ['a notification of an undeclared kind', (events) => { events.notification.data.kind.type = 'instruction_loaded'; }, null,
      ['competing_event', 'notification']],
    // A delivered value that is no event at all is kept as one unrecognized entry, never dropped.
    ['a delivered value that is no event', (events) => { events.extra = 'session.idle'; }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)],
      ['competing_event']],
    ['a delivered event whose type is not text', (events) => { events.extra = { type: 7, id: randomUUID(), data: {} }; },
      [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)], ['competing_event']],
    // Activation or another operation shown by an otherwise valid public event of the session itself.
    ['a connected MCP server in the loaded list', (events) => { events.extra = event('session.mcp_servers_loaded', { servers: [
      { name: 'dude-canary-probe', status: 'connected', source: 'workspace' }] }); }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)], ['competing_event']],
    ['a running extension in the loaded list', (events) => { events.extra = event('session.extensions_loaded', { extensions: [
      { id: 'project:dude', name: 'dude', source: 'project', status: 'running' }] }); }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)], ['competing_event']],
    ['an enabled skill in the loaded list', (events) => { events.extra = event('session.skills_loaded', { skills: [
      { name: 'dude-canary', description: 'x', enabled: true, source: 'project', userInvocable: true }] }); }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)],
    ['competing_event']],
    ['an MCP server list that is no list', (events) => { events.extra = event('session.mcp_servers_loaded', { servers: 'none' }); },
      [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)], ['competing_event']],
    ['an extension of an undeclared status', (events) => { events.extra = event('session.extensions_loaded', { extensions: [
      { id: 'project:x', name: 'x', source: 'project', status: 'paused' }] }); }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)], ['competing_event']],
    ['an event of a type the SDK does not declare', (events) => { events.extra = event('session.memory_changed', {}); },
      [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)], ['competing_event']],
  ];
  for (const [label, change, order, problems] of unsound) {
    const found = judge(change, order ?? ORDER);
    assert.deepEqual(found.problems, problems, label);
    assert.equal(found.proof, null, `${label}: no proof`);
  }
  // Those lists refuse even empty or inactive: no phase permits them, so their payload is never read. The view's own read permission
  // is the one permission event its turn permits, and the control still passes with it.
  for (const [label, type, data] of /** @type {Array<[string, string, Record<string, unknown>]>} */ ([
    ['an empty MCP server list', 'session.mcp_servers_loaded', { servers: [] }],
    ['a disabled and a stopped MCP server', 'session.mcp_servers_loaded', { servers: [{ name: 'a', status: 'disabled' }, { name: 'b', status: 'stopped' }] }],
    ['an MCP server that is not configured', 'session.mcp_server_status_changed', { serverName: 'a', status: 'not_configured' }],
    ['an empty extension list', 'session.extensions_loaded', { extensions: [] }],
    ['a disabled extension', 'session.extensions_loaded', { extensions: [{ id: 'project:x', name: 'x', source: 'project', status: 'disabled' }] }],
    ['a disabled skill', 'session.skills_loaded', { skills: [{ name: 'x', description: 'x', enabled: false, source: 'project', userInvocable: true }] }],
    ['no custom agents', 'session.custom_agents_updated', { agents: [], errors: [], warnings: [] }],
    ['no commands', 'commands.changed', { commands: [] }],
  ])) {
    const empty = judge((events) => { events.extra = event(type, data); }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)]);
    assert.deepEqual(empty.problems, ['competing_event'], label);
    assert.equal(empty.proof, null, `${label}: no proof`);
  }
  const permitted = judge((events) => { events.extra = event('permission.requested', { requestId: 'r1', permissionRequest: { kind: 'read', path: files.target,
    intention: 'x', toolCallId: 'v1' } }); }, [...ORDER.slice(0, 3), 'extra', ...ORDER.slice(3)]);
  assert.deepEqual(permitted.problems, [], 'the view\'s own read permission');
  assert.ok(permitted.proof, 'the view\'s own read permission: the proof stands');

  // The 4,096-byte bound on the kept model-facing result counts UTF-8 bytes, not characters: the target's line among three-byte characters
  // fills exactly the bound and passes; one byte more is not kept, so it shows nothing, though it is far fewer characters than bytes.
  const wide = (/** @type {number} */ bytes) => {
    const head = `${files.line}\n`;
    const room = bytes - Buffer.byteLength(head);
    return `${head}${'\u20ac'.repeat(Math.floor(room / 3))}${'.'.repeat(room % 3)}`;
  };
  for (const [bytes, problems] of /** @type {Array<[number, string[]]>} */ ([[NATIVE_LIMITS.viewOutputBytes - 1, []], [NATIVE_LIMITS.viewOutputBytes, []],
    [NATIVE_LIMITS.viewOutputBytes + 1, ['output']], [NATIVE_LIMITS.viewOutputBytes + 2, ['output']]])) {
    const shown = wide(bytes);
    assert.equal(Buffer.byteLength(shown), bytes);
    assert.ok(shown.length < NATIVE_LIMITS.viewOutputBytes / 2, 'far fewer characters than bytes');
    const found = judge((events) => { events.complete.data.result = { content: shown }; });
    assert.deepEqual(found.problems, problems, `${bytes} bytes`);
    if (!problems.length) assert.deepEqual(found.proof?.output, { bytes, sha256: sha256(shown) }, `${bytes} bytes: kept by size and digest`);
  }
});

/**
 * The after-view control's phase contract as its ruling states it, written here from that ruling rather than read from the module: the
 * types each phase permits. Every other event refuses in that phase: a declared one as `competing`, or after the turn as `after_turn`,
 * and an undeclared one as `undeclared`.
 */
const HOUSEKEEPING_TYPES = Object.freeze(['session.title_changed', 'session.usage_info', 'session.usage_checkpoint', 'session.quota_observation']);
const PHASE_CONTRACT = Object.freeze({
  preSend: Object.freeze([...HOUSEKEEPING_TYPES, 'session.start', 'session.idle', 'system.message', 'session.tools_updated', 'session.model_change',
    'session.context_changed']),
  inTurn: Object.freeze([...HOUSEKEEPING_TYPES, 'user.message', 'assistant.message', 'tool.execution_start', 'tool.execution_complete', 'system.notification',
    'session.idle', 'assistant.turn_start', 'assistant.turn_end', 'assistant.intent', 'assistant.reasoning', 'assistant.reasoning_delta',
    'assistant.tool_call_delta', 'assistant.streaming_delta', 'assistant.message_start', 'assistant.message_delta', 'assistant.idle', 'assistant.usage',
    'model.call_finished', 'tool.execution_progress', 'permission.requested', 'permission.completed', 'system.message']),
  postTurn: Object.freeze([...HOUSEKEEPING_TYPES, 'session.idle']),
});
const PHASES = /** @type {const} */ (['preSend', 'inTurn', 'postTurn']);
/** The proof's own events, which its turn holds once each: another instance is another prompt, start, or completion (closed problems). */
const OWN_ONLY = Object.freeze(['user.message', 'tool.execution_start', 'tool.execution_complete']);

/** The fixed control layout the walk's base session uses, and its view arguments' digest. */
const WALK_FILES = controlFiles();
const WALK_ARGUMENTS = sha256(`{"path":${JSON.stringify(WALK_FILES.target)}}`);
const WALK_EXPECTED = Object.freeze({ admission: 'adm-1', prompt: WALK_FILES.prompt, target: WALK_FILES.target, output: WALK_FILES.output,
  source: WALK_FILES.source, instructions: WALK_FILES.instructions.map((entry) => entry.file), bases: WALK_FILES.bases });
/** The view's own read permission request, as a host raises it for the base session's view call `v1`. */
const READ_REQUEST = Object.freeze({ kind: 'read', path: WALK_FILES.target, intention: 'View the file', toolCallId: 'v1' });

/**
 * One instance of each type a phase permits, in its permitted form, stating only what the walk's control established (session
 * `control-session`, model `fixture-model-a`, view call `v1`, admission `adm-1`), or a startup's own default before those checks. The
 * proof's own types are given as a second instance, which only another phase may hold.
 */
const PERMITTED_DATA = /** @type {Record<string, Record<string, unknown>>} */ ({
  'session.title_changed': { title: 'Viewed the canary' },
  'session.usage_info': { currentTokens: 900, messagesLength: 4, tokenLimit: 128_000, isInitial: true },
  'session.usage_checkpoint': { totalNanoAiu: 1_000 },
  'session.quota_observation': { observation: { accessState: 'granted', capacityState: 'available', provider: { id: 'copilot' }, quotaId: 'premium',
    unit: 'requests' } },
  'session.start': { sessionId: 'control-session', version: 1, producer: 'copilot-agent', copilotVersion: '1.0.102', startTime: '2026-11-04T00:00:00.000Z',
    selectedModel: 'fixture-model-default', context: { cwd: WALK_FILES.project }, alreadyInUse: false, remoteSteerable: false,
    githubMcpToolConfig: { additionalTools: [], additionalToolsets: [], enableAllTools: false, enableInsidersMode: false } },
  'session.idle': { aborted: false, mode: 'interactive' },
  'system.message': { content: 'Repository instructions.', role: 'developer' },
  'session.tools_updated': { model: 'fixture-model-default' },
  'session.model_change': { newModel: 'fixture-model-default', source: 'startup' },
  'session.context_changed': { cwd: WALK_FILES.project, branch: 'main' },
  'user.message': { messageId: 'adm-0', content: 'x' },
  'assistant.message': { messageId: 'm-3', originatingMessageId: 'adm-1', content: 'Viewing it now.' },
  'tool.execution_start': { toolCallId: 'v9', toolName: 'view', arguments: { path: WALK_FILES.target } },
  'tool.execution_complete': { toolCallId: 'v9', success: true, result: { content: 'x' } },
  'system.notification': { content: 'x', kind: { type: 'instruction_discovered', sourcePath: '.github/copilot-instructions.md', triggerFile: WALK_FILES.target,
    triggerTool: 'view' } },
  'assistant.turn_start': { turnId: '1', model: 'fixture-model-a', interactionId: 'i-1' },
  'assistant.turn_end': { turnId: '1', model: 'unknown' },
  'assistant.intent': { intent: 'Viewing the file' },
  'assistant.reasoning': { content: 'thinking', reasoningId: 'r-1' },
  'assistant.reasoning_delta': { deltaContent: 'think', reasoningId: 'r-1' },
  'assistant.tool_call_delta': { inputDelta: '{"path":', toolCallId: 'v1', toolName: 'view' },
  'assistant.streaming_delta': { totalResponseSizeBytes: 120 },
  'assistant.message_start': { messageId: 'm-2' },
  'assistant.message_delta': { deltaContent: 'I viewed', messageId: 'm-2' },
  'assistant.idle': { aborted: false },
  'assistant.usage': { model: 'fixture-model-a', inputTokens: 900, outputTokens: 20, initiator: 'agent', interactionType: 'conversation-agent' },
  'model.call_finished': { dispatchDurationMs: 900, editClassifierVersion: 1, outcome: 'success', turnId: '1', containsBuiltInFileEditRequest: false },
  'tool.execution_progress': { progressMessage: 'Reading the file', toolCallId: 'v1' },
  'permission.requested': { requestId: 'r-1', permissionRequest: READ_REQUEST, ownerSessionId: 'control-session', permissionMode: 'manual',
    agentMode: 'interactive', promptRequest: READ_REQUEST },
  'permission.completed': { requestId: 'r-1', result: { kind: 'approved' }, toolCallId: 'v1', decisionSource: 'human_response' },
});

/** @param {unknown} type @param {Record<string, unknown>} [data] @param {Record<string, unknown>} [extra] */
const rawEvent = (type, data = {}, extra = {}) => ({ type, id: randomUUID(), timestamp: new Date().toISOString(), data, ...extra });

/** The base session's one turn, every event of it the proof's own, as the SDK delivers them. */
const walkTurn = () => [
  rawEvent('user.message', { messageId: 'adm-1', content: WALK_FILES.prompt }),
  rawEvent('assistant.message', { messageId: 'm-1', originatingMessageId: 'adm-1', content: '', toolRequests: [{ toolCallId: 'v1', name: 'view',
    arguments: { path: WALK_FILES.target } }] }),
  rawEvent('tool.execution_start', { toolCallId: 'v1', toolName: 'view', arguments: { path: WALK_FILES.target } }),
  rawEvent('system.notification', { content: 'x', kind: { type: 'instruction_discovered', sourcePath: 'AGENTS.md', triggerFile: WALK_FILES.target,
    triggerTool: 'view' } }),
  rawEvent('tool.execution_complete', { toolCallId: 'v1', success: true, result: { content: WALK_FILES.output } }),
  rawEvent('assistant.message', { messageId: 'm-2', originatingMessageId: 'adm-1', content: 'I viewed it.' }),
  rawEvent('session.idle', {}),
];

/**
 * One raw event placed in an otherwise valid control session in one phase: `preSend` (its only event before the prompt), `inTurn` (after
 * the view started; an idle before the admission, where it ends nothing), or `postTurn` (after the turn's end); then judged by everything
 * that judges the control: the check just before its prompt, the relay as it arrives, the final judgment, and the report. `change` alters
 * what the control established: by default its model and working-directory checks were asked right after the probe, before the prompt.
 * @param {'preSend' | 'inTurn' | 'postTurn'} phase @param {any} raw @param {Record<string, unknown>} [change]
 */
function judgeIn(phase, raw, change = {}) {
  const turn = walkTurn();
  const pre = phase === 'preSend' ? [raw] : [];
  if (phase === 'inTurn') turn.splice(raw?.type === 'session.idle' ? 0 : 3, 0, raw);
  const bound = { sessionId: 'control-session', model: 'fixture-model-a', modelFrom: pre.length, cwdFrom: pre.length, sentAt: pre.length,
    admission: 'adm-1', argumentsSha256: WALK_ARGUMENTS, ...change };
  const log = createSessionLog('control');
  for (const entry of pre) log.onEvent(entry);
  // The check just before the prompt is sent: nothing is sent and admitted yet.
  const beforePrompt = refusedEvents(log.state.events, { ...bound, sentAt: null, admission: null });
  /** @type {boolean | null} */
  let relay = null;
  for (const entry of turn) {
    log.onEvent(entry);
    if (entry === raw) relay = controlTurnOver(log.state.events, bound);
  }
  if (phase === 'postTurn') log.onEvent(raw);
  return { beforePrompt, relay, account: refusedEvents(log.state.events, bound), ...checkAfterViewControl(log.state.events, { ...WALK_EXPECTED, bound }) };
}

/** How the report names a type. @param {string} type */
const reportedType = (type) => (/^[A-Za-z0-9_.-]{1,64}$/.test(type) ? type : `(unavailable: ${Buffer.byteLength(type)} bytes)`);

/**
 * Other forms of the types a phase permits, each in a phase that permits its type: `[phase, type, label, change, class]`, each change
 * applied to the type's permitted instance (`PERMITTED_DATA`), and the class null for a form that is also permitted.
 */
const VARIANTS = /** @type {Array<['preSend' | 'inTurn' | 'postTurn', string, string, Record<string, unknown>, string | null]>} */ ([
  // session.start (:1640-1711): a fresh local session of its own, asking for nothing the control turns off.
  ['preSend', 'session.start', 'remote steering on', { remoteSteerable: true }, 'competing'],
  ['preSend', 'session.start', 'a remote steering flag that is no boolean', { remoteSteerable: 'yes' }, 'competing'],
  ['preSend', 'session.start', 'already in use by another client', { alreadyInUse: true }, 'competing'],
  ['preSend', 'session.start', 'an in-use flag that is no boolean', { alreadyInUse: 1 }, 'competing'],
  ['preSend', 'session.start', 'continuing another session', { detachedFromSpawningParentSessionId: 'parent-session' }, 'competing'],
  ['preSend', 'session.start', 'an empty parent session', { detachedFromSpawningParentSessionId: '' }, 'competing'],
  ['preSend', 'session.start', 'the GitHub MCP server asked for all tools', { githubMcpToolConfig: { enableAllTools: true } }, 'competing'],
  ['preSend', 'session.start', 'the GitHub MCP server asked for a tool', { githubMcpToolConfig: { additionalTools: ['get_issue'] } }, 'competing'],
  ['preSend', 'session.start', 'the GitHub MCP server asked for a toolset', { githubMcpToolConfig: { additionalToolsets: ['repos'] } }, 'competing'],
  ['preSend', 'session.start', 'the GitHub MCP insiders build', { githubMcpToolConfig: { enableInsidersMode: true } }, 'competing'],
  ['preSend', 'session.start', 'a GitHub MCP configuration that is no object', { githubMcpToolConfig: 'all' }, 'competing'],
  ['preSend', 'session.start', 'a GitHub MCP tool list that is no list', { githubMcpToolConfig: { additionalTools: 'get_issue' } }, 'competing'],
  ['preSend', 'session.start', 'a GitHub MCP configuration asking for nothing', { githubMcpToolConfig: {} }, null],
  ['preSend', 'session.start', 'a start naming no session', { sessionId: '' }, 'competing'],
  ['preSend', 'session.start', 'a selected model that is no text', { selectedModel: 5 }, 'competing'],
  ['preSend', 'session.start', 'a context with no working directory', { context: {} }, 'competing'],
  ['preSend', 'session.start', 'the start of another session', { sessionId: 'other-session' }, 'contradicting'],
  ['preSend', 'session.start', 'a start with no optional statement', { selectedModel: undefined, context: undefined, githubMcpToolConfig: undefined }, null],
  // session.model_change (:2489-2548) before its check: the startup or the SDK's own selection only (:279-305).
  ...[undefined, 'startup', 'sdk'].map((source) => /** @type {const} */ (['preSend', 'session.model_change', `a selection by ${source ?? 'no named source'}`,
    { source }, null])),
  ...['model_command', 'settings_command', 'config_command', 'model_picker', 'managed_settings', 'repo_settings', 'agent', 'plan_mode', 'automatic',
    'changeboarding_shortcut', 'auto_tier_recommendation', 'telepathy'].map((source) => /** @type {const} */ (['preSend', 'session.model_change',
    `a change by ${source}`, { source }, 'competing'])),
  ['preSend', 'session.model_change', 'a change naming no model', { newModel: '' }, 'competing'],
  ['preSend', 'session.context_changed', 'a context with no working directory', { cwd: undefined }, 'competing'],
  ['preSend', 'session.tools_updated', 'tools resolved for no model', { model: '' }, 'competing'],
  // session.idle (:2039-2045): a normal end in every phase.
  ...PHASES.flatMap((phase) => /** @type {const} */ ([
    [phase, 'session.idle', 'an aborted loop', { aborted: true }, phase === 'postTurn' ? 'after_turn' : 'competing'],
    [phase, 'session.idle', 'an abort flag that is no boolean', { aborted: 'false' }, phase === 'postTurn' ? 'after_turn' : 'competing'],
    [phase, 'session.idle', 'plan mode', { mode: 'plan' }, phase === 'postTurn' ? 'after_turn' : 'competing'],
    [phase, 'session.idle', 'an idle with no flags', { aborted: undefined, mode: undefined }, null]])),
  // assistant.message (:6141-6245) beside the turn's own request and reply: every one stating an admission states this one.
  ['inTurn', 'assistant.message', 'a text-only message naming another admission', { originatingMessageId: 'adm-0' }, 'contradicting'],
  ['inTurn', 'assistant.message', 'a text-only message naming no admission', { originatingMessageId: undefined }, null],
  ['inTurn', 'assistant.message', 'an originating message that is no text', { originatingMessageId: ['adm-1'] }, 'competing'],
  ['inTurn', 'assistant.message', 'HydraFusion attribution', { fusion: { fusionId: 'f-1', pattern: 'route' } }, 'competing'],
  ['inTurn', 'assistant.message', 'a provider-hosted server tool\'s output', { serverTools: { provider: 'openai', items: [{ type: 'web_search_call' }] } },
    'competing'],
  ['inTurn', 'assistant.message', 'a server tool\'s advisor model', { serverTools: { provider: 'anthropic', advisorModel: 'advisor-1' } }, 'competing'],
  ['inTurn', 'assistant.message', 'a server tool\'s function-call namespace', { serverTools: { provider: 'openai', functionCallNamespaces: { c1: 'web' } } },
    'competing'],
  ['inTurn', 'assistant.message', 'an empty server-tool payload', { serverTools: { provider: 'openai', items: [], rawContentBlocks: [],
    functionCallNamespaces: {} } }, null],
  // system.notification (:9148-9155, :1084): an instruction discovery only.
  ...['agent_completed', 'agent_idle', 'new_inbox_message', 'shell_completed', 'shell_detached_completed', 'workflow_completed', 'unclassified',
    'instruction_loaded'].map((type) => /** @type {const} */ (['inTurn', 'system.notification', `a notification of kind ${type}`, { kind: { type } },
    'competing'])),
  // The view's progress and streamed request (:6062, :7619), correlated to its own call.
  ['inTurn', 'tool.execution_progress', 'progress of another call', { toolCallId: 'v-other' }, 'contradicting'],
  ['inTurn', 'tool.execution_progress', 'progress naming no call', { toolCallId: undefined }, 'competing'],
  ['inTurn', 'assistant.tool_call_delta', 'a streamed request of another call', { toolCallId: 'v-other', toolName: 'powershell' }, 'contradicting'],
  ['inTurn', 'assistant.tool_call_delta', 'a streamed request naming no call', { toolCallId: undefined }, 'competing'],
  ['inTurn', 'assistant.idle', 'an aborted loop', { aborted: true }, 'competing'],
  ['inTurn', 'assistant.idle', 'an abort flag that is no boolean', { aborted: 'no' }, 'competing'],
  // assistant.usage (:6729-6907): positive membership of the session's own conversation calls; any other or unknown class refuses.
  ...[[undefined, undefined], ['user', 'conversation-user'], ['agent', 'conversation-agent'], ['user', undefined], [undefined, 'conversation-agent']]
    .map(([initiator, interactionType]) => /** @type {const} */ (['inTurn', 'assistant.usage',
      `usage started by ${initiator ?? 'no initiator'} of class ${interactionType ?? 'none'}`, { initiator, interactionType }, null])),
  ...['sub-agent', 'mcp-sampling', 'background', 'system', 5].map((initiator) => /** @type {const} */ (['inTurn', 'assistant.usage',
    `usage started by ${initiator}`, { initiator }, 'competing'])),
  ...['conversation-compaction', 'conversation-subagent', 'conversation-sampling', 'conversation-background', 'conversation-other']
    .map((interactionType) => /** @type {const} */ (['inTurn', 'assistant.usage', `usage of a ${interactionType} call`, { interactionType }, 'competing'])),
  ['inTurn', 'assistant.usage', 'usage under HydraFusion', { fusion: { fusionId: 'f-1', pattern: 'route' } }, 'competing'],
  ['inTurn', 'assistant.usage', 'usage whose HydraFusion attribution is null', { fusion: null }, 'competing'],
  // model.call_finished (:7221-7243): an accepted dispatch that requested no built-in file edit.
  ['inTurn', 'model.call_finished', 'a dispatch with no edit flag', { containsBuiltInFileEditRequest: undefined }, null],
  ...['error', 'cancelled', 'rejected', undefined].map((outcome) => /** @type {const} */ (['inTurn', 'model.call_finished',
    `a dispatch ending ${outcome ?? 'with no outcome'}`, { outcome }, 'competing'])),
  ['inTurn', 'model.call_finished', 'a dispatch that requested a file edit', { containsBuiltInFileEditRequest: true }, 'competing'],
  ['inTurn', 'model.call_finished', 'an edit flag that is no boolean', { containsBuiltInFileEditRequest: 'no' }, 'competing'],
  // permission.requested (:9392-9427): the view's own read, for the human relay alone.
  ...['shell', 'write', 'mcp', 'url', 'memory', 'custom-tool', 'hook', 'extension-management', 'workflow', 'extension-permission-access',
    'extension-env-access', 'telepathy'].map((kind) => /** @type {const} */ (['inTurn', 'permission.requested', `a request of kind ${kind}`,
    { permissionRequest: { ...READ_REQUEST, kind } }, 'competing'])),
  ['inTurn', 'permission.requested', 'a read a hook already resolved', { resolvedByHook: true }, 'competing'],
  ['inTurn', 'permission.requested', 'a read no hook resolved', { resolvedByHook: false }, null],
  ['inTurn', 'permission.requested', 'a hook flag that is no boolean', { resolvedByHook: 'yes' }, 'competing'],
  ['inTurn', 'permission.requested', 'a request with no permission request record', { permissionRequest: undefined }, 'competing'],
  ['inTurn', 'permission.requested', 'a read whose call is no text', { permissionRequest: { ...READ_REQUEST, toolCallId: 7 } }, 'competing'],
  ['inTurn', 'permission.requested', 'a read a delegated agent owns', { ownerAgentId: 'remote-agent' }, 'competing'],
  ['inTurn', 'permission.requested', 'a read under HydraFusion', { fusion: { fusionId: 'f-1', pattern: 'route' } }, 'competing'],
  ['inTurn', 'permission.requested', 'a read Autopilot permission recovery surfaced', { recoveryEpisodeId: 'ep-1' }, 'competing'],
  ...['assisted', 'allow-all', 'auto'].map((permissionMode) => /** @type {const} */ (['inTurn', 'permission.requested',
    `a read in permission mode ${permissionMode}`, { permissionMode }, 'competing'])),
  ...['plan', 'autopilot', 'shell'].map((agentMode) => /** @type {const} */ (['inTurn', 'permission.requested', `a read in agent mode ${agentMode}`,
    { agentMode }, 'competing'])),
  ['inTurn', 'permission.requested', 'a read the assisted-approval judge evaluated', { promptRequest: { ...READ_REQUEST,
    assistedApproval: { recommendation: 'approve', model: 'judge-model' } } }, 'competing'],
  ['inTurn', 'permission.requested', 'a read whose prompt details are no object', { promptRequest: 'read' }, 'competing'],
  ['inTurn', 'permission.requested', 'a read with no owner, mode, or prompt details, as historical events have', { ownerSessionId: undefined,
    permissionMode: undefined, agentMode: undefined, promptRequest: undefined }, null],
  ['inTurn', 'permission.requested', 'a read another session owns', { ownerSessionId: 'other-session' }, 'contradicting'],
  ['inTurn', 'permission.requested', 'a read for another call', { permissionRequest: { ...READ_REQUEST, toolCallId: 'v-other' } }, 'contradicting'],
  // permission.completed (:10703-10724): a decision on that one request alone.
  ...['cancelled', 'denied-by-rules', 'denied-no-approval-rule-and-could-not-request-from-user', 'denied-interactively-by-user',
    'denied-by-content-exclusion-policy'].map((kind) => /** @type {const} */ (['inTurn', 'permission.completed', `a ${kind} result`, { result: { kind } },
    null])),
  ...['approved-read-only-for-session', 'approved-for-session', 'approved-for-location', 'denied-by-permission-request-hook', 'approved-forever']
    .map((kind) => /** @type {const} */ (['inTurn', 'permission.completed', `a ${kind} result`, { result: { kind } }, 'competing'])),
  ['inTurn', 'permission.completed', 'a result an approval policy already handled', { result: { kind: 'approved', managedApprovalHandled: true } },
    'competing'],
  ...[undefined, 'host_policy', 'unattended_fallback'].map((decisionSource) => /** @type {const} */ (['inTurn', 'permission.completed',
    `a decision by ${decisionSource ?? 'no named source'}`, { decisionSource }, null])),
  ...['assisted_approval', 'authorization_carry_forward', 'oracle'].map((decisionSource) => /** @type {const} */ (['inTurn', 'permission.completed',
    `a decision by ${decisionSource}`, { decisionSource }, 'competing'])),
  ['inTurn', 'permission.completed', 'a decision Autopilot permission recovery settled', { recoveryEpisodeId: 'ep-1' }, 'competing'],
  ['inTurn', 'permission.completed', 'a decision blocking an Autopilot task', { blocker: { kind: 'permission_recovery', resumable: false } }, 'competing'],
  ['inTurn', 'permission.completed', 'a completion with no result', { result: undefined }, 'competing'],
  ['inTurn', 'permission.completed', 'the completion of another call\'s permission', { toolCallId: 'v-other' }, 'contradicting'],
]);

/**
 * Each other form of the proof's own events, applied to the base session's own event of that type (the admission, the view's request,
 * start, or completion, or the turn's end): `[label, type, change, form, problems]`. The form is what the actual summarizer keeps
 * (`permitted` or `refused`); the problems what the otherwise valid control then has, the fact refused as unsound as well.
 */
const OWN_VARIANTS = /** @type {Array<[string, string, (data: Record<string, any>) => void, 'permitted' | 'refused', readonly string[]]>} */ ([
  ['an autopilot continuation', 'user.message', (data) => { data.isAutopilotContinuation = true; }, 'refused', ['admission', 'competing_event']],
  ['a typed message', 'user.message', (data) => { data.isAutopilotContinuation = false; }, 'permitted', []],
  ['a continuation flag that is no boolean', 'user.message', (data) => { data.isAutopilotContinuation = 'no'; }, 'refused', ['admission', 'competing_event']],
  ['a background agent\'s turn', 'user.message', (data) => { data.parentAgentTaskId = 'task-1'; }, 'refused', ['admission', 'competing_event']],
  ['an empty background task', 'user.message', (data) => { data.parentAgentTaskId = ''; }, 'refused', ['admission', 'competing_event']],
  ...['plan', 'autopilot', 'shell'].map((agentMode) => /** @type {const} */ ([`a message in agent mode ${agentMode}`, 'user.message',
    (/** @type {any} */ data) => { data.agentMode = agentMode; }, 'refused', ['admission', 'competing_event']])),
  ['a message in interactive mode', 'user.message', (data) => { data.agentMode = 'interactive'; }, 'permitted', []],
  ['a message in an undeclared mode', 'user.message', (data) => { data.agentMode = 'chat'; }, 'refused', ['admission', 'competing_event']],
  ...['steering', 'queued'].map((delivery) => /** @type {const} */ ([`a message delivered as ${delivery} behind another run`, 'user.message',
    (/** @type {any} */ data) => { data.delivery = delivery; }, 'refused', ['admission', 'competing_event']])),
  ['a message starting its own run', 'user.message', (data) => { data.delivery = 'idle'; }, 'permitted', []],
  ['an undeclared delivery', 'user.message', (data) => { data.delivery = 'later'; }, 'refused', ['admission', 'competing_event']],
  ['an attachment', 'user.message', (data) => { data.attachments = [{ type: 'file', path: WALK_FILES.source, displayName: 'AGENTS.md' }]; }, 'refused',
    ['admission', 'competing_event']],
  ['no attachment', 'user.message', (data) => { data.attachments = []; }, 'permitted', []],
  ['attachments that are no list', 'user.message', (data) => { data.attachments = 'AGENTS.md'; }, 'refused', ['admission', 'competing_event']],
  ['a request under HydraFusion', 'assistant.message', (data) => { data.fusion = { fusionId: 'f-1', pattern: 'route' }; }, 'refused',
    ['competing_event', 'request_arguments']],
  ['a provider-hosted server tool\'s output', 'assistant.message', (data) => { data.serverTools = { provider: 'openai', items: [{ type: 'web_search_call' }] }; },
    'refused', ['competing_event', 'request_arguments']],
  ['a server tool\'s advisor model', 'assistant.message', (data) => { data.serverTools = { provider: 'anthropic', advisorModel: 'advisor-1' }; }, 'refused',
    ['competing_event', 'request_arguments']],
  ['a server tool\'s advisor model that is no name', 'assistant.message', (data) => { data.serverTools = { provider: 'anthropic', advisorModel: null }; },
    'refused', ['competing_event', 'request_arguments']],
  ['a server tool\'s function-call namespace', 'assistant.message', (data) => { data.serverTools = { provider: 'openai', functionCallNamespaces: { c1: 'web' } }; },
    'refused', ['competing_event', 'request_arguments']],
  ['an empty server-tool payload', 'assistant.message', (data) => { data.serverTools = { provider: 'openai', items: [], rawContentBlocks: [] }; }, 'permitted', []],
  ['a server-tool payload that is no object', 'assistant.message', (data) => { data.serverTools = 'web'; }, 'refused', ['competing_event', 'request_arguments']],
  ...['mcpServerName', 'mcpToolName', 'caller'].map((field) => /** @type {const} */ ([`a request with only ${field}`, 'assistant.message', (/** @type {any} */ data) => {
    data.toolRequests[0][field] = field === 'caller' ? { callerId: 'p', type: 'program' } : 'dude-canary-probe';
  }, 'refused', ['competing_event', 'request_arguments']])),
  ...['mcpServerName', 'mcpToolName', 'mcpConfigServerName', 'mcpConfigSource', 'mcpTransport'].map((field) => /** @type {const} */ ([`a start with only ${field}`,
    'tool.execution_start', (/** @type {any} */ data) => { data[field] = field === 'mcpTransport' ? 'stdio' : field === 'mcpConfigSource' ? 'workspace' : 'dude-canary-probe'; },
    'refused', ['competing_event', 'start']])),
  ['a start under HydraFusion', 'tool.execution_start', (data) => { data.fusion = { fusionId: 'f-1', pattern: 'route' }; }, 'refused', ['competing_event', 'start']],
  ['a shell tool\'s start', 'tool.execution_start', (data) => { data.shellToolInfo = { hasWriteFileRedirection: false, possiblePaths: [] }; }, 'refused',
    ['competing_event', 'start']],
  ['shell path hints that are no object', 'tool.execution_start', (data) => { data.shellToolInfo = 'none'; }, 'refused', ['competing_event', 'start']],
  ['a completion under HydraFusion', 'tool.execution_complete', (data) => { data.fusion = { fusionId: 'f-1', pattern: 'route' }; }, 'refused',
    ['competing_event', 'completion']],
  ['a shell\'s completion', 'tool.execution_complete', (data) => { data.shellExecution = { exitCode: 0 }; }, 'refused', ['competing_event', 'completion']],
  ['committed file edits', 'tool.execution_complete', (data) => { data.fileEdits = [{ kind: 'modified', path: WALK_FILES.target }]; }, 'refused',
    ['competing_event', 'completion']],
  ['no file edit', 'tool.execution_complete', (data) => { data.fileEdits = []; }, 'permitted', []],
  ['file edits that are no list', 'tool.execution_complete', (data) => { data.fileEdits = 'none'; }, 'refused', ['competing_event', 'completion']],
  ['an MCP app resource', 'tool.execution_complete', (data) => { data.result.uiResource = { uri: 'ui://canary', mimeType: 'text/html' }; }, 'refused',
    ['competing_event', 'completion']],
  ['an MCP tool\'s structured output', 'tool.execution_complete', (data) => { data.result.structuredContent = { ok: true }; }, 'refused',
    ['competing_event', 'completion']],
  ...['plan', 'autopilot'].map((mode) => /** @type {const} */ ([`a turn end in mode ${mode}`, 'session.idle', (/** @type {any} */ data) => { data.mode = mode; },
    'refused', ['competing_event', 'turn_end']])),
  ['a turn end in interactive mode', 'session.idle', (data) => { data.mode = 'interactive'; }, 'permitted', []],
  ['a turn end in an undeclared mode', 'session.idle', (data) => { data.mode = 'chat'; }, 'refused', ['competing_event', 'turn_end']],
]);

test('the after-view control\'s phases permit only what each lists, in its permitted form, and refuse everything else by default: each declared type outside a phase\'s list refuses there, each listed type passes only in its phase and form, an undeclared name refuses as undeclared, and a sub-agent\'s or malformed event refuses in every phase, before the prompt, at the relay, and in the final judgment', () => {
  // The name-only inventory: it tells undeclared from declared, and never permits anything.
  assert.equal(SDK_EVENT_TYPES.length, 148, 'the 148 members of SessionEvent, by name');
  assert.equal(new Set(SDK_EVENT_TYPES).size, SDK_EVENT_TYPES.length, 'each named once');
  assert.ok(Object.isFrozen(SDK_EVENT_TYPES));
  for (const type of new Set(Object.values(PHASE_CONTRACT).flat())) assert.ok(SDK_EVENT_TYPES.includes(type), `${type} is a declared type`);

  /**
   * One instance judged in one phase: permitted everywhere that judges it, or refused with exactly `refusedAs`.
   * @param {string} label @param {'preSend' | 'inTurn' | 'postTurn'} phase @param {any} raw @param {string | null} refusedAs
   * @param {Record<string, unknown>} [change]
   */
  const walk = (label, phase, raw, refusedAs, change) => {
    const found = judgeIn(phase, raw, change);
    assert.deepEqual(found.account.refusedEvents.map((entry) => [entry.type, entry.class, entry.count]), refusedAs === null ? []
      : [[reportedType(raw.type), refusedAs, 1]], `${label}, ${phase}: the report`);
    if (refusedAs === null) assert.deepEqual(found.problems, [], `${label}, ${phase}: the final judgment`);
    else assert.ok(found.problems.includes(refusedAs === 'subagent' ? 'subagent' : 'competing_event'), `${label}, ${phase}: ${found.problems.join(', ')}`);
    // After the turn's end nothing is its evidence: the turn's own proof is kept beside a refusal there, and only there.
    assert.equal(found.proof === null, refusedAs !== null && phase !== 'postTurn', `${label}, ${phase}: ${found.proof ? 'the proof stands' : 'no proof'}`);
    if (phase === 'preSend') assert.equal(found.beforePrompt.refusedEvents.length > 0, refusedAs !== null, `${label}: judged just before the prompt`);
    if (phase === 'inTurn') assert.equal(found.relay, refusedAs !== null, `${label}: the relay ${refusedAs === null ? 'stays open' : 'is withdrawn'}`);
  };
  walk('the base session with its own idle repeated', 'postTurn', rawEvent('session.idle', {}), null);

  // Every declared type in every phase: permitted only where the contract lists it, refused everywhere else, its payload unread.
  for (const type of SDK_EVENT_TYPES) {
    for (const phase of PHASES) {
      const listed = PHASE_CONTRACT[phase].includes(type);
      // The proof's own events are judged in their turn by the closed problems the first test names; a second one is never permitted.
      if (listed && phase === 'inTurn' && OWN_ONLY.includes(type)) continue;
      walk(type, phase, rawEvent(type, PERMITTED_DATA[type] ?? {}), listed ? null : phase === 'postTurn' ? 'after_turn' : 'competing');
      // Whatever its type, a sub-agent's instance, or one whose envelope is not the documented one, is never permitted.
      walk(`${type}, a sub-agent's`, phase, rawEvent(type, PERMITTED_DATA[type] ?? {}, { agentId: 'sub-1' }), 'subagent');
      walk(`${type}, under a parent tool call`, phase, rawEvent(type, { ...PERMITTED_DATA[type], parentToolCallId: 'task-1' }), 'subagent');
      walk(`${type}, with a null agent ID`, phase, rawEvent(type, PERMITTED_DATA[type] ?? {}, { agentId: null }), 'malformed');
      walk(`${type}, with no event ID`, phase, { type, data: PERMITTED_DATA[type] ?? {} }, 'malformed');
    }
  }
  // Each listed type in its other forms, where its phase permits it.
  for (const [phase, type, label, change, refusedAs] of VARIANTS) walk(`${type}: ${label}`, phase, rawEvent(type, { ...PERMITTED_DATA[type], ...change }), refusedAs);
  // The proof's own events in each of their other forms, on the base session's own event of that type.
  const own = { 'user.message': 0, 'assistant.message': 1, 'tool.execution_start': 2, 'tool.execution_complete': 4, 'session.idle': 6 };
  for (const [label, type, change, form, problems] of OWN_VARIANTS) {
    const events = walkTurn();
    const index = /** @type {Record<string, number>} */ (own)[type];
    change(events[index].data);
    const log = createSessionLog('control');
    for (const entry of events) log.onEvent(entry);
    assert.equal(log.state.events[index].form, form, `${type}: ${label}: its form`);
    const found = checkAfterViewControl(log.state.events, { ...WALK_EXPECTED, bound: { sentAt: 0 } });
    assert.deepEqual(found.problems, problems, `${type}: ${label}: the final judgment`);
    assert.equal(found.proof === null, problems.length > 0, `${type}: ${label}: ${problems.length ? 'no proof' : 'the proof stands'}`);
  }
  // Indexed search, in each documented form (:120-205), refuses by its type alone in every phase.
  for (const data of [{ kind: 'status', state: 'disabled' }, { kind: 'startup', outcome: 'started', forcedByEnv: true, startupDurationMs: 1, warmStart: false },
    { kind: 'incremental', phase: 'updated' }]) {
    for (const phase of PHASES) walk(`indexed search, ${data.kind}`, phase, rawEvent('session.indexed_search', data), phase === 'postTurn' ? 'after_turn' : 'competing');
  }
  // A type the SDK does not declare refuses as undeclared in every phase: the names the installed runtime knows but its SDK does not
  // declare, those newer or older SDKs declare, and names an object has by inheritance.
  for (const type of ['session.memory_changed', 'skill.invoked_ref', 'sandbox.decision', 'session.usage_record', 'model.call_start', 'model.call_final_result',
    'prompt_cache_break', 'assistant.turn_retry', 'session.journal_link', 'instruction.update', 'factory.run_started', 'Session.Info', 'session.info ',
    'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    for (const phase of PHASES) walk(`the undeclared type ${JSON.stringify(type)}`, phase, rawEvent(type, {}), 'undeclared');
  }
  // A delivered value that is no event at all is one malformed entry of no type, never dropped.
  const delivered = judgeIn('inTurn', 'session.idle');
  assert.deepEqual(delivered.account.refusedEvents.map((entry) => [entry.type, entry.class, entry.id]), [['(unavailable: no type)', 'malformed', null]]);
  assert.deepEqual([delivered.problems, delivered.relay], [['competing_event'], true]);

  // The log position of each check decides, both ways: a statement just before the run asked for the check is superseded by it, and a
  // change from that position on refuses, even a restatement of the same model or working directory. The session starts only while it is
  // created: the run asks for its model check the moment that creation returns, so a start from then on refuses, whatever it states.
  const sameModel = { newModel: 'fixture-model-a', previousModel: 'fixture-model-a', source: 'sdk' };
  for (const [label, type, data, change, refusedAs] of /** @type {Array<[string, string, Record<string, unknown>, Record<string, unknown>, string | null]>} */ ([
    ['a startup selection just before the model check', 'session.model_change', PERMITTED_DATA['session.model_change'], { modelFrom: 1 }, null],
    ['the same selection as the model check is asked', 'session.model_change', PERMITTED_DATA['session.model_change'], { modelFrom: 0 }, 'competing'],
    ['the checked model restated as the model check is asked', 'session.model_change', sameModel, { modelFrom: 0 }, 'competing'],
    ['a startup working directory just before its check', 'session.context_changed', PERMITTED_DATA['session.context_changed'], { cwdFrom: 1 }, null],
    ['the same working directory as its check is asked', 'session.context_changed', PERMITTED_DATA['session.context_changed'], { cwdFrom: 0 }, 'competing'],
    ['the checked working directory restated as its check is asked', 'session.context_changed', { cwd: WALK_FILES.cwd }, { cwdFrom: 0 }, 'competing'],
    ['a start while the session is created, stating a default model, just before the model check', 'session.start', PERMITTED_DATA['session.start'],
      { modelFrom: 1 }, null],
    ['a start once its creation returned, as the model check is asked', 'session.start', PERMITTED_DATA['session.start'], { modelFrom: 0 }, 'competing'],
    ['a start once its creation returned, stating another working directory', 'session.start', { ...PERMITTED_DATA['session.start'],
      selectedModel: 'fixture-model-a' }, { modelFrom: 0, cwdFrom: 0 }, 'competing'],
    ['a start once its creation returned, stating a relative working directory', 'session.start', { ...PERMITTED_DATA['session.start'],
      selectedModel: 'fixture-model-a', context: { cwd: 'k/t' } }, { modelFrom: 0, cwdFrom: 0 }, 'competing'],
    ['a start once its creation returned, even stating the checked model and working directory', 'session.start', { ...PERMITTED_DATA['session.start'],
      selectedModel: 'fixture-model-a', context: { cwd: WALK_FILES.cwd } }, { modelFrom: 0, cwdFrom: 0 }, 'competing'],
    ['tools resolved for a default model as the model check is asked', 'session.tools_updated', PERMITTED_DATA['session.tools_updated'], { modelFrom: 0 },
      'contradicting'],
    ['tools resolved for the checked model as the model check is asked', 'session.tools_updated', { model: 'fixture-model-a' }, { modelFrom: 0 }, null],
  ])) walk(label, 'preSend', rawEvent(type, data), refusedAs, change);

  // The session starts once.
  const twice = createSessionLog('control');
  for (const entry of [rawEvent('session.start', PERMITTED_DATA['session.start']), rawEvent('session.start', PERMITTED_DATA['session.start'])]) twice.onEvent(entry);
  assert.deepEqual(refusedEvents(twice.state.events, { sessionId: 'control-session' }).refusedEvents.map((entry) => [entry.type, entry.class, entry.count]),
    [['session.start', 'competing', 1]], 'a second start refuses');
  // What is not yet established judges nothing: before the view's request arrives, progress naming another call cannot be told from the
  // view's own, so the relay stays open; once the request arrives, that same progress withdraws it.
  const early = createSessionLog('control');
  const relayBound = { sessionId: 'control-session', sentAt: 0, admission: 'adm-1', argumentsSha256: WALK_ARGUMENTS };
  early.onEvent(rawEvent('user.message', { messageId: 'adm-1', content: WALK_FILES.prompt }));
  early.onEvent(rawEvent('tool.execution_progress', { progressMessage: 'x', toolCallId: 'v-other' }));
  assert.equal(controlTurnOver(early.state.events, relayBound), false, 'no view call yet to compare with');
  early.onEvent(rawEvent('assistant.message', { messageId: 'm-1', originatingMessageId: 'adm-1', content: '', toolRequests: [{ toolCallId: 'v1', name: 'view',
    arguments: { path: WALK_FILES.target } }] }));
  assert.equal(controlTurnOver(early.state.events, relayBound), true, 'the view call is v1, so that progress belongs to another call');
  // A startup idle before the admission ends nothing; the admission's own idle does.
  const idle = createSessionLog('control');
  idle.onEvent(rawEvent('session.idle', {}));
  idle.onEvent(rawEvent('user.message', { messageId: 'adm-1', content: WALK_FILES.prompt }));
  assert.equal(controlTurnOver(idle.state.events, relayBound), false);
  idle.onEvent(rawEvent('session.idle', {}));
  assert.equal(controlTurnOver(idle.state.events, relayBound), true);
});

test('the control\'s loaded sources must hold the fixed AGENTS.md canary by path, documented type and location, and digest, and nothing but fixed instruction canaries with their own documented kinds; each mismatch fails alone', () => {
  const files = controlFiles();
  const agents = /** @type {string} */ (CANARIES.find((canary) => canary.path === 'AGENTS.md')?.content);
  const copilot = /** @type {string} */ (CANARIES.find((canary) => canary.path === '.github/copilot-instructions.md')?.content);
  const pathSpecific = /** @type {string} */ (CANARIES.find((canary) => canary.path === '.github/instructions/dude-canary.instructions.md')?.content);
  const loaded = () => ({ sources: [{ id: 'i1', label: 'AGENTS.md', sourcePath: 'AGENTS.md', content: agents, type: 'repo', location: 'repository' }] });
  /** @param {(answer: any) => void} [change] */
  const judge = (change) => {
    const answer = /** @type {any} */ (loaded());
    change?.(answer);
    return controlSources(answer, { source: files.source, instructions: files.instructions, bases: files.bases });
  };
  assert.deepEqual(judge(), { problems: [], source: { path: 'AGENTS.md', type: 'repo', location: 'repository', bytes: Buffer.byteLength(agents),
    sha256: sha256(agents) } });
  // The documented combinations (generated/rpc.d.ts InstructionSourceType and InstructionSourceLocation): an agent file is a
  // repository-scoped file or a nested agent file, the repository instructions a repository-scoped file, and the path-specific
  // instructions a VS Code instruction file, each in the repository the control's canaries lie in.
  assert.deepEqual(judge((answer) => { answer.sources[0].sourcePath = files.source; answer.sources[0].type = 'nested-agents'; }).problems, [],
    'an absolute path, and the other documented type of an agent file');
  assert.deepEqual(judge((answer) => answer.sources.push({ id: 'i2', label: 'x', sourcePath: '.github/copilot-instructions.md', content: copilot, type: 'repo',
    location: 'repository' })).problems, [], 'another fixed instruction canary with its own digest may load beside it');
  assert.deepEqual(judge((answer) => answer.sources.push({ id: 'i3', label: 'x', sourcePath: '.github/instructions/dude-canary.instructions.md', content: pathSpecific,
    type: 'vscode', location: 'repository', applyTo: ['**'] })).problems, [], 'and so may the path-specific canary, as a VS Code instruction file');
  /** @type {Array<[string, (answer: any) => void, string]>} */
  const cases = [
    ['other content under its name', (answer) => { answer.sources[0].content = `${agents}tampered\n`; }, 'source_mismatch'],
    ['a home-level type', (answer) => { answer.sources[0].type = 'home'; }, 'source_mismatch'],
    ['a user-level location', (answer) => { answer.sources[0].location = 'user'; }, 'source_mismatch'],
    ['no type', (answer) => { delete answer.sources[0].type; }, 'source_mismatch'],
    ['an empty type', (answer) => { answer.sources[0].type = ''; }, 'source_mismatch'],
    ['an undocumented type', (answer) => { answer.sources[0].type = 'repository'; }, 'source_mismatch'],
    ['a type that is not a string', (answer) => { answer.sources[0].type = ['repo']; }, 'source_mismatch'],
    ['the documented type of a VS Code instruction file', (answer) => { answer.sources[0].type = 'vscode'; }, 'source_mismatch'],
    ['the documented type of inherited child instructions', (answer) => { answer.sources[0].type = 'child-instructions'; }, 'source_mismatch'],
    ['a model-specific type', (answer) => { answer.sources[0].type = 'model'; }, 'source_mismatch'],
    ['a plugin type', (answer) => { answer.sources[0].type = 'plugin'; }, 'source_mismatch'],
    ['no location', (answer) => { delete answer.sources[0].location; }, 'source_mismatch'],
    ['an empty location', (answer) => { answer.sources[0].location = ''; }, 'source_mismatch'],
    ['an undocumented location', (answer) => { answer.sources[0].location = 'repo'; }, 'source_mismatch'],
    ['the working directory, which the control\'s canaries lie outside', (answer) => { answer.sources[0].location = 'working-directory'; }, 'source_mismatch'],
    ['a plugin location', (answer) => { answer.sources[0].location = 'plugin'; }, 'source_mismatch'],
    ['the repository instructions as a nested agent file', (answer) => answer.sources.push({ id: 'i2', label: 'x', sourcePath: '.github/copilot-instructions.md',
      content: copilot, type: 'nested-agents', location: 'repository' }), 'source_mismatch'],
    ['the path-specific canary as a repository-scoped file', (answer) => answer.sources.push({ id: 'i3', label: 'x',
      sourcePath: '.github/instructions/dude-canary.instructions.md', content: pathSpecific, type: 'repo', location: 'repository' }), 'source_mismatch'],
    // After the view, the working directory is the control's temp folder, which none of its canaries lies in: each of the other two fixed
    // instruction canaries is refused there alone too, with its own documented type.
    ['the repository instructions in the working directory', (answer) => answer.sources.push({ id: 'i2', label: 'x', sourcePath: '.github/copilot-instructions.md',
      content: copilot, type: 'repo', location: 'working-directory' }), 'source_mismatch'],
    ['the path-specific canary in the working directory', (answer) => answer.sources.push({ id: 'i3', label: 'x',
      sourcePath: '.github/instructions/dude-canary.instructions.md', content: pathSpecific, type: 'vscode', location: 'working-directory', applyTo: ['**'] }),
    'source_mismatch'],
    ['a source that is no fixed canary', (answer) => answer.sources.push({ id: 'i3', label: 'x', sourcePath: 'NOTES.md', content: 'x', type: 'repo',
      location: 'repository' }), 'unexpected_source'],
    ['a fixed canary with other content', (answer) => answer.sources.push({ id: 'i2', label: 'x', sourcePath: '.github/copilot-instructions.md',
      content: 'other', type: 'repo', location: 'repository' }), 'source_mismatch'],
    ['nothing loaded: static discovery alone', (answer) => { answer.sources = []; }, 'source_missing'],
    ['the source loaded twice', (answer) => answer.sources.push({ ...answer.sources[0], id: 'i9' }), 'source_repeated'],
  ];
  for (const [label, change, problem] of cases) assert.deepEqual(judge(change), { problems: [problem], source: null }, label);
  assert.deepEqual(controlSources(null, { source: files.source, instructions: files.instructions, bases: files.bases }), { problems: ['sources_unreadable'],
    source: null });
});

test('the report\'s account of refused control events is bounded, deduplicated by each event\'s original type and class, and payload-free: only a name of safe characters is rendered, any other is an explicit unavailable marker with its length, types rendered alike stay distinct, one type under two classes is two entries, anything after the turn but its own idle is its own class, and more distinct entries than the bound are counted, never dropped silently', () => {
  const secret = 'PAYLOAD-NEVER-KEPT';
  /** @param {unknown} type @param {Record<string, unknown>} [data] @param {Record<string, unknown>} [extra] */
  const event = (type, data = {}, extra = {}) => ({ type, id: randomUUID(), timestamp: new Date().toISOString(), data, ...extra });
  /** @param {ReturnType<typeof refusedEvents>} account */
  const rows = (account) => account.refusedEvents.map(({ type, class: kind, count }) => [type, kind, count]);
  const overlong = `session.${'x'.repeat(300)}`;
  // Its prompt was sent before the first event, and its admission `adm-1` ends its turn at the first idle after it.
  const bound = { sentAt: 0, admission: 'adm-1' };
  const raws = [
    event('user.message', { messageId: 'adm-1', content: 'x' }),
    event('session.usage_record', { note: secret }), event('hook.start', { hookType: 'preToolUse', input: secret }), event('session.usage_record'),
    event(overlong), event('session.info '), event('Session\u202einfo'), 'not an event', event('session.memory_changed', {}, { id: 'id with\u0007bell' }),
    event('session.usage_info', { note: secret }, { agentId: null }), event('session.idle', {}),
    // After the turn: its own idle repeated changes nothing; another tool start is activity after it.
    event('session.idle', {}), event('tool.execution_start', { toolCallId: 'late', toolName: 'view' }),
  ];
  const log = createSessionLog('control');
  for (const raw of raws) log.onEvent(raw);
  const account = refusedEvents(log.state.events, bound);
  assert.deepEqual(rows(account), [
    ['session.usage_record', 'undeclared', 2], ['hook.start', 'competing', 1], [`(unavailable: ${Buffer.byteLength(overlong)} bytes)`, 'undeclared', 1],
    ['(unavailable: 13 bytes)', 'undeclared', 1], [`(unavailable: ${Buffer.byteLength('Session\u202einfo')} bytes)`, 'undeclared', 1],
    ['(unavailable: no type)', 'malformed', 1], ['session.memory_changed', 'undeclared', 1], ['session.usage_info', 'malformed', 1],
  ], 'one entry per distinct type and class in the order first seen');
  assert.equal(account.refusedEvents[0].id, raws[1].id, 'the first such event\'s own ID');
  assert.equal(account.refusedEvents.find((entry) => entry.type === 'session.memory_changed')?.id, null, 'an ID that is no safe identifier is not kept');
  assert.equal(account.refusedEvents.find((entry) => entry.class === 'malformed' && entry.type === '(unavailable: no type)')?.id, null);
  assert.equal(account.refusedEventsOmitted, 1, 'the ninth distinct entry, the start after the turn, is counted, not dropped silently');
  assert.equal(refusedEvents(log.state.events, { sentAt: 0 }).refusedEventsOmitted, 0, 'with no admission there is no turn end, so the late start ends nothing');
  const afterTurn = createSessionLog('control');
  for (const raw of [event('user.message', { messageId: 'adm-1', content: 'x' }), event('session.idle', {}), event('session.idle', {}),
    event('session.title_changed', { title: 'x' }), event('tool.execution_start', { toolCallId: 'late', toolName: 'view' })]) afterTurn.onEvent(raw);
  assert.deepEqual(rows(refusedEvents(afterTurn.state.events, bound)), [['tool.execution_start', 'after_turn', 1]],
    'after the turn ended, a further start is its own class, and the turn\'s own idle repeated or housekeeping is none');
  const kept = JSON.stringify(account);
  assert.equal(kept.includes(secret), false, 'no event data is kept');
  assert.equal(/[^\x20-\x7e]/.test(kept), false, 'only safe characters are rendered');
  assert.ok(account.refusedEvents.every((entry) => Object.keys(entry).sort().join() === 'class,count,id,type'));

  // Types the report cannot name, though alike in what it shows, are told apart by their own digests: nine distinct names of exactly
  // equal length fill the bound with eight entries and count the ninth, and repeats of one only add to its count.
  const alike = Array.from({ length: 9 }, (_, index) => `session.info ${index}`);
  const same = createSessionLog('control');
  for (const type of [...alike, alike[0], alike[8]]) same.onEvent(event(type));
  const told = refusedEvents(same.state.events, { sentAt: 0 });
  assert.deepEqual(rows(told), alike.slice(0, NATIVE_LIMITS.refusedEvents).map((_, index) => ['(unavailable: 14 bytes)', 'undeclared', index === 0 ? 2 : 1]));
  assert.equal(told.refusedEventsOmitted, 1, 'the ninth distinct name is counted, though it renders as the eight before it');
  // A type over 64 bytes is kept as its length and digest, never as a prefix: two such types of equal length stay two entries.
  const longs = [`a.${'x'.repeat(70)}`, `b.${'x'.repeat(70)}`];
  const summary = summarizeEvent(event(longs[0]), 0);
  assert.deepEqual([summary.type, summary.typeBytes, summary.typeSha256], [null, 72, sha256(longs[0])]);
  assert.deepEqual([summarizeEvent(event(`x.${'y'.repeat(62)}`), 0).type, summarizeEvent(event(`x.${'y'.repeat(63)}`), 0).type], [`x.${'y'.repeat(62)}`, null],
    '64 bytes are kept whole, 65 are not');
  const long = createSessionLog('control');
  for (const type of [longs[0], longs[1], longs[0]]) long.onEvent(event(type));
  assert.deepEqual(rows(refusedEvents(long.state.events, { sentAt: 0 })), [['(unavailable: 72 bytes)', 'undeclared', 2], ['(unavailable: 72 bytes)', 'undeclared', 1]]);
  // One type under two classes is two entries: a turn start before the prompt competes, and one after the turn is activity after it.
  const twice = createSessionLog('control');
  for (const raw of [event('assistant.turn_start', { turnId: '0' }), event('user.message', { messageId: 'adm-1', content: 'x' }), event('session.idle', {}),
    event('assistant.turn_start', { turnId: '2' })]) twice.onEvent(raw);
  assert.deepEqual(rows(refusedEvents(twice.state.events, { sentAt: 1, admission: 'adm-1' })), [['assistant.turn_start', 'competing', 1],
    ['assistant.turn_start', 'after_turn', 1]]);

  // Within the bound, nothing is omitted; past it, every further distinct entry is counted.
  const many = createSessionLog('control');
  for (let index = 0; index < 12; index += 1) many.onEvent(event(`fixture.undeclared_${index}`));
  const bounded = refusedEvents(many.state.events, { sentAt: 0 });
  assert.deepEqual([bounded.refusedEvents.length, bounded.refusedEventsOmitted], [NATIVE_LIMITS.refusedEvents, 12 - NATIVE_LIMITS.refusedEvents]);
  assert.deepEqual(bounded.refusedEvents.map((entry) => entry.type), Array.from({ length: NATIVE_LIMITS.refusedEvents }, (_, index) => `fixture.undeclared_${index}`));
  // A clean session has nothing to account for.
  assert.deepEqual(refusedEvents([], {}), { refusedEvents: [], refusedEventsOmitted: 0 });
});

test('the control\'s observed reads count only its own canary\'s reads in the control scope by the given processes, and a count that is no whole non-negative number is no count at all', () => {
  const members = new Set(['5001@2']);
  /** @param {Record<string, unknown>} [extra] */
  const row = (extra = {}) => ({ process: '5001@2', scope: 'control', path: 'work/AGENTS.md', op: 'read', count: 1, ...extra });
  /** @param {any[]} rows */
  const reads = (rows) => canaryReads({ canaries: rows }, members, 'work/AGENTS.md');
  assert.equal(reads([row(), row({ count: 2 })]), 3);
  assert.equal(reads([row(), row({ scope: 'fixture' }), row({ scope: 'worker' })]), 1, 'a row of another scope is not the control canary\'s');
  assert.equal(reads([row(), row({ op: 'write' }), row({ op: 'open' }), row({ op: 'create' })]), 1, 'a write, open, or create is no read');
  assert.equal(reads([row(), row({ process: 'root@1' })]), 1, 'another process\'s read is not the control runtime\'s');
  assert.equal(reads([row(), row({ path: 'work/dude-canary-denied-read.txt' })]), 1, 'another canary\'s read');
  for (const count of ['1', -1, 1.5, Number.NaN, null]) assert.ok(Number.isNaN(reads([row({ count })])), `a count of ${String(count)} is no count`);
  assert.equal(canaryReads({}, members, 'work/AGENTS.md'), 0, 'no canary rows, no reads');
});

test('the control relay matches only a read its sole pending model-requested view needs, from its own session, under no managed policy or sandbox bypass', () => {
  const files = controlFiles();
  const allow = { sessionId: 's-k', pending: 'v1', files: [files.target, ...files.instructions.map((entry) => entry.file)] };
  /** @param {any} request @param {any} [invocation] @param {any} [scope] */
  const decide = (request, invocation = { sessionId: 's-k' }, scope = allow) => {
    const decision = matchControlPermission(request, invocation, scope);
    return decision.ask ? decision.summary : decision.reason;
  };
  const read = (/** @type {string} */ file, extra = {}) => ({ kind: 'read', toolCallId: 'v1', path: file, intention: 'x', ...extra });
  assert.equal(decide(read(files.target)), `read ${files.target}`);
  assert.equal(decide(read(files.source)), `read ${files.source}`, 'the disclosed instruction-canary read that view may need');
  assert.equal(decide(read(files.target, { managedApprovalRequired: false, requestSandboxBypass: false }), { sessionId: 's-k', managedSettingsEnabled: false }),
    `read ${files.target}`, 'each documented optional marker sent explicitly false is unraised');
  for (const [request, invocation, scope, reason] of /** @type {Array<[any, any, any, string]>} */ ([
    [read(files.target), { sessionId: 's-a' }, allow, 'session_mismatch'],
    [read(files.target), { sessionId: 's-k' }, { ...allow, sessionId: null }, 'session_mismatch'],
    [{ kind: 'read', path: files.target }, { sessionId: 's-k' }, allow, 'unidentified'],
    [read(files.target), { sessionId: 's-k' }, { ...allow, pending: null }, 'not_model_requested'],
    [{ ...read(files.target), toolCallId: 'v2' }, { sessionId: 's-k' }, allow, 'not_model_requested'],
    [read(files.target), { sessionId: 's-k', managedSettingsEnabled: true }, allow, 'managed_policy'],
    [read(files.target, { managedApprovalRequired: true }), { sessionId: 's-k' }, allow, 'managed_policy'],
    [read(files.target, { requestSandboxBypass: true }), { sessionId: 's-k' }, allow, 'sandbox_bypass'],
    // Each marker is a documented optional boolean: any value that is neither absent nor false is unknown and refuses as if raised.
    [read(files.target), { sessionId: 's-k', managedSettingsEnabled: 'true' }, allow, 'managed_policy'],
    [read(files.target), { sessionId: 's-k', managedSettingsEnabled: null }, allow, 'managed_policy'],
    [read(files.target, { managedApprovalRequired: 1 }), { sessionId: 's-k' }, allow, 'managed_policy'],
    [read(files.target, { managedApprovalRequired: null }), { sessionId: 's-k' }, allow, 'managed_policy'],
    [read(files.target, { requestSandboxBypass: 'yes' }), { sessionId: 's-k' }, allow, 'sandbox_bypass'],
    [read(files.target, { requestSandboxBypass: null }), { sessionId: 's-k' }, allow, 'sandbox_bypass'],
    [read(path.join(files.project, 'dude-canary-denied-write.txt')), { sessionId: 's-k' }, allow, 'not_control_read'],
    [read('dude-canary-denied-read.txt'), { sessionId: 's-k' }, allow, 'not_control_read'],
    [{ kind: 'write', toolCallId: 'v1', fileName: files.target }, { sessionId: 's-k' }, allow, 'not_control_read'],
    [{ kind: 'shell', toolCallId: 'v1', fullCommandText: `type ${files.target}` }, { sessionId: 's-k' }, allow, 'not_control_read'],
  ])) {
    assert.equal(decide(request, invocation, scope), reason, `${request.kind} ${reason}`);
  }
});

/**
 * The control relay over a scripted terminal, its session's own event log, and a test clock: the control session `s-k`, its admission
 * `adm-1`, and its 60-second phase (or `phaseMs`), in a run whose scope expires after `expiresInMs`. `requested` logs a root view
 * request of that admission, and `admitted` logs that admission's root user message; each goes through the log's own event entry point,
 * as the SDK delivers it. Nothing here sets the phase flag. With `frozen`, real time never passes on the run's clock, so only the test's
 * own `clock.advance` moves the scope, the phase, or the relay's short wait for a trailing request toward their ends.
 * @param {any[]} answers @param {{expiresInMs?: number, phaseMs?: number, frozen?: boolean}} [options]
 */
function controlRelay(answers, { expiresInMs = 3_600_000, phaseMs = NATIVE_LIMITS.runtimeMs, frozen = false } = {}) {
  const files = controlFiles();
  const clock = testClock();
  if (frozen) clock.freeze();
  const terminal = fakeTerminal(answers);
  const log = createSessionLog('control', clock.now);
  const run = { clock: clock.now, expiresAtMs: clock.now() + expiresInMs, closing: false, report: /** @type {any} */ ({ consent: { status: 'granted' } }),
    human: humanQueue(terminal, clock.now), clients: [{ side: 'control', log }] };
  // Its session `s-k` sent its prompt before any of these events, and `adm-1` is that prompt's admission.
  const control = { open: true, deadlineAt: clock.now() + phaseMs, log, files: [files.target, ...files.instructions.map((entry) => entry.file)],
    bound: { sessionId: 's-k', sentAt: 0, admission: 'adm-1', argumentsSha256: sha256(`{"path":${JSON.stringify(files.target)}}`) } };
  /** @param {string} id @param {string} [file] */
  const requested = (id, file = files.target) => log.onEvent({ type: 'assistant.message', id: randomUUID(), data: { messageId: `m-${id}`,
    originatingMessageId: 'adm-1', content: '', toolRequests: [{ toolCallId: id, name: 'view', arguments: { path: file } }] } });
  const admitted = () => log.onEvent({ type: 'user.message', id: randomUUID(), data: { messageId: 'adm-1', content: files.prompt } });
  return { run, log, clock, terminal, control, requested, admitted, ask: controlPermissionRelay(run, control) };
}

test('the control relay\'s lifetime: the human is asked once for the pending view, and a request that is not that sole call, or whose call, phase, deadline, or scope changes while the human types, is refused or withdrawn', async () => {
  const files = controlFiles();
  const relay = controlRelay;
  const request = { kind: 'read', toolCallId: 'v1', path: files.target, intention: 'x' };

  const approved = relay(['approve-once']);
  approved.requested('v1');
  assert.deepEqual(await approved.ask(request, { sessionId: 's-k' }), { kind: 'approve-once', approvedInteractively: true });
  assert.match(approved.terminal.text, new RegExp(`\\[CONTROL permission\\] read ${files.target.replace(/\\/g, '\\\\')}`));
  assert.deepEqual(approved.run.report.permissions, [{ side: 'control', kind: 'read', asked: true, reason: null, answer: 'approve-once' }]);

  const rejected = relay(['reject']);
  rejected.requested('v1');
  assert.equal((await rejected.ask(request, { sessionId: 's-k' })).kind, 'reject');
  assert.equal(rejected.run.report.permissions[0].reason, 'operator_rejected');

  // A second view request: no sole pending call, so nothing is asked. Bounded: the relay's wait for a trailing request must end on its
  // own, so a wait without its bound is an assertion here, not a test timeout.
  const competing = relay(['approve-once']);
  competing.requested('v1');
  competing.requested('v2', files.source);
  assert.equal((await within(competing.ask(request, { sessionId: 's-k' }), 5_000)).kind, 'reject');
  assert.deepEqual([competing.run.report.permissions[0].reason, competing.terminal.prompts.length], ['not_model_requested', 0]);

  // The phase closes, the call completes, or a competing request appears while the human types: withdrawn after the answer.
  for (const [label, change] of /** @type {Array<[string, (context: any) => void]>} */ ([
    ['the control turn ended', (context) => { context.control.open = false; }],
    ['the view completed', (context) => context.log.onEvent({ type: 'tool.execution_complete', id: randomUUID(), data: { toolCallId: 'v1', success: true,
      result: { content: 'x' } } })],
    ['another view was requested', (context) => context.requested('v3', files.source)],
    ['the run began closing', (context) => { context.run.closing = true; }],
  ])) {
    /** @type {any} */
    let context = null;
    context = relay([{ type: 'approve-once', before: () => change(context) }], { expiresInMs: 3_601_000 });
    context.requested('v1');
    assert.equal((await context.ask(request, { sessionId: 's-k' })).kind, 'reject', label);
    assert.equal(context.run.report.permissions[0].answer, 'approval_withdrawn', label);
  }
  // The scope that expires keeps 30 seconds of real time before its prompt is shown, then ends while the human types, long before the
  // phase. The scope's expiry now bounds the prompt itself, so an answer typed after it is past that prompt's own deadline.
  /** @type {any} */
  let expiring = null;
  expiring = relay([{ type: 'approve-once', before: () => expiring.clock.advance(expiring.run.expiresAtMs - expiring.clock.now() + 1_000) }],
    { expiresInMs: 30_000 });
  expiring.requested('v1');
  assert.equal((await expiring.ask(request, { sessionId: 's-k' })).kind, 'reject', 'the scope expired');
  assert.equal(expiring.run.report.permissions[0].answer, 'input_timeout', 'the scope expired: the answer came after the prompt\'s own deadline, its expiry');

  // The request itself changes while the human types: a read of another disclosed file is not what was shown, so it is withdrawn.
  const moving = { ...request };
  const switched = relay([{ type: 'approve-once', before: () => { moving.path = files.source; } }]);
  switched.requested('v1');
  assert.equal((await switched.ask(moving, { sessionId: 's-k' })).kind, 'reject');
  assert.deepEqual([switched.run.report.permissions[0].answer, switched.terminal.prompts.length], ['approval_withdrawn', 1],
    'shown once for the target, and the changed request is not approved');
  assert.match(switched.terminal.text, new RegExp(`\\[CONTROL permission\\] read ${files.target.replace(/\\/g, '\\\\')}`));

  // The wait is bounded by what is left of the 60-second phase, not by the 60-second permission bound alone.
  const late = relay([{ type: 'approve-once', before: () => late.clock.advance(6_000) }], { phaseMs: 5_000 });
  late.requested('v1');
  assert.equal((await late.ask(request, { sessionId: 's-k' })).kind, 'reject');
  assert.equal(late.run.report.permissions[0].answer, 'input_timeout', 'the answer arrived after the phase deadline');
});

test('the control relay waits a short bound for the model\'s request event that trails its permission callback: a request that arrives within that wait is asked and approved once, and one that never arrives is refused when the wait ends, without asking anyone', async () => {
  const files = controlFiles();
  const request = { kind: 'read', toolCallId: 'v1', path: files.target, intention: 'x' };
  // The callback comes first; the admission's root view request is delivered only once the relay is already waiting for it.
  const trailing = controlRelay(['approve-once'], { frozen: true });
  trailing.admitted();
  const asked = trailing.ask(request, { sessionId: 's-k' });
  assert.equal(trailing.run.report.permissions[0].asked, false, 'nothing is asked before its request event arrived');
  trailing.requested('v1');
  assert.deepEqual(await within(asked, 3_000), { kind: 'approve-once', approvedInteractively: true }, 'the trailing request made it the sole pending call');
  assert.deepEqual(trailing.run.report.permissions, [{ side: 'control', kind: 'read', asked: true, reason: null, answer: 'approve-once' }]);
  assert.equal(trailing.terminal.prompts.length, 1, 'asked once');

  // A request event that never arrives: the wait ends at its own bound on the run's clock, and the read is refused unasked.
  const missing = controlRelay(['approve-once'], { frozen: true });
  missing.admitted();
  const refused = missing.ask(request, { sessionId: 's-k' });
  missing.clock.advance(NATIVE_LIMITS.requestMs);
  assert.equal((await within(refused, 3_000)).kind, 'reject', 'the wait ended at its bound');
  assert.deepEqual([missing.run.report.permissions[0].asked, missing.run.report.permissions[0].reason, missing.terminal.prompts.length],
    [false, 'not_model_requested', 0]);
});

test('the control relay is withdrawn by its own session\'s public events the moment they arrive, never only by the phase flag: an abort, an error, a competing operation, a subagent, another prompt, or the turn\'s end refuses the read before it is asked, while it waits in line, or while the human types; a startup idle before the admission is not that end; and an unanswered prompt is released at the scope\'s expiry', async () => {
  const files = controlFiles();
  const request = { kind: 'read', toolCallId: 'v1', path: files.target, intention: 'x' };
  /** @type {Array<[string, Record<string, any>]>} Public session events, as the SDK delivers them (generated/session-events.d.ts). */
  const terminal = [
    ['an abort', { type: 'abort', data: { reason: 'user_initiated' } }],
    ['a session error', { type: 'session.error', data: { errorType: 'fixture', message: 'x' } }],
    ['the turn\'s own end', { type: 'session.idle', data: {} }],
    ['a competing hook', { type: 'hook.start', data: { hookType: 'preToolUse' } }],
    ['a subagent\'s event', { type: 'assistant.message', agentId: 'sub-1', data: { messageId: 'm-s', content: 'sub' } }],
    ['another root prompt', { type: 'user.message', data: { messageId: 'adm-2', content: 'again' } }],
    ['a connected MCP server', { type: 'session.mcp_servers_loaded', data: { servers: [{ name: 'x', status: 'connected' }] } }],
    ['a running extension', { type: 'session.extensions_loaded', data: { extensions: [{ id: 'project:x', name: 'x', source: 'project', status: 'running' }] } }],
    ['an event of a type the SDK does not declare', { type: 'session.undeclared', data: {} }],
    ['an event whose agent ID is null', { type: 'session.info', agentId: null, data: { infoType: 'notification', message: 'x' } }],
  ];
  for (const [label, event] of terminal) {
    /** @param {any} context */
    const deliver = (context) => context.log.onEvent({ id: randomUUID(), ...structuredClone(event) });

    // Already delivered before the request: refused without asking anyone.
    const before = controlRelay(['approve-once']);
    before.admitted();
    before.requested('v1');
    deliver(before);
    assert.equal((await before.ask(request, { sessionId: 's-k' })).kind, 'reject', `${label} before the request`);
    assert.deepEqual([before.run.report.permissions[0].asked, before.run.report.permissions[0].reason, before.terminal.prompts.length], [false, 'not_pending', 0],
      `${label} before the request`);

    // Delivered while the request waits in line behind another prompt: it is never shown.
    /** @type {any} */
    let queued = null;
    queued = controlRelay([{ type: 'held', before: () => deliver(queued) }, 'approve-once']);
    queued.admitted();
    queued.requested('v1');
    const holding = queued.run.human.ask('Hold: ', { deadlineAt: queued.clock.now() + 5_000 });
    assert.equal((await queued.ask(request, { sessionId: 's-k' })).kind, 'reject', `${label} while queued`);
    assert.deepEqual(await holding, { ok: true, line: 'held' });
    assert.deepEqual([queued.run.report.permissions[0].answer, queued.terminal.prompts.length], ['request_withdrawn', 1], `${label} while queued: never shown`);

    // Delivered while the human types: the typed approve-once is withdrawn.
    /** @type {any} */
    let typed = null;
    typed = controlRelay([{ type: 'approve-once', before: () => deliver(typed) }]);
    typed.admitted();
    typed.requested('v1');
    assert.equal((await typed.ask(request, { sessionId: 's-k' })).kind, 'reject', `${label} while typing`);
    assert.equal(typed.run.report.permissions[0].answer, 'approval_withdrawn', `${label} while typing`);
    for (const context of [before, queued, typed]) assert.equal(context.control.open, true, `${label}: only the event withdrew it; the phase flag never changed`);
  }

  // The session's own startup idle, before its admission, is not that admission's end: the read is asked and approved.
  const startup = controlRelay(['approve-once']);
  startup.log.onEvent({ type: 'session.idle', id: randomUUID(), data: {} });
  startup.admitted();
  startup.requested('v1');
  assert.deepEqual(await startup.ask(request, { sessionId: 's-k' }), { kind: 'approve-once', approvedInteractively: true }, 'a startup idle ends nothing');
  // Without the admission's user message yet, an idle after its request still ends its turn.
  const unadmitted = controlRelay(['approve-once']);
  unadmitted.requested('v1');
  unadmitted.log.onEvent({ type: 'session.idle', id: randomUUID(), data: {} });
  assert.equal((await unadmitted.ask(request, { sessionId: 's-k' })).kind, 'reject');
  assert.equal(unadmitted.run.report.permissions[0].reason, 'not_pending');

  // The prompt's own deadline is the scope's expiry when that comes first: with nobody typing, it ends there by its own timer. The run's
  // clock is frozen, so the scope cannot expire before the prompt is shown; the hold records that it was shown, and only the prompt's own
  // 400-ms timer, never a 60-second bound, can end it within the wait below.
  let shown = false;
  const expiry = controlRelay([{ hold: () => { shown = true; } }], { expiresInMs: 400, frozen: true });
  expiry.requested('v1');
  const timed = await within(expiry.ask(request, { sessionId: 's-k' }), 3_000);
  assert.equal(shown, true, 'the prompt was shown before the scope expired');
  assert.deepEqual([timed.kind, expiry.run.report.permissions[0].asked, expiry.run.report.permissions[0].answer], ['reject', true, 'input_timeout'],
    'released at the scope\'s expiry, not the 60-second bounds');
  // And when the run's clock reaches that expiry first, the shown prompt is released at once, its terminal read and raw mode with it.
  /** @type {any} */
  let held = null;
  held = controlRelay([{ hold: () => held.clock.advance(held.run.expiresAtMs - held.clock.now() + 1) }], { expiresInMs: 30_000 });
  held.requested('v1');
  const released = await within(held.ask(request, { sessionId: 's-k' }), 3_000);
  assert.deepEqual([released.kind, held.run.report.permissions[0].answer], ['reject', 'input_timeout'], 'released at the expiry the run\'s clock reached');
  assert.deepEqual(['data', 'end', 'close'].map((name) => held.terminal.input.listenerCount(name)), [0, 0, 0], 'the terminal read is released');
  assert.equal(held.terminal.input.raw, false, 'raw mode is reset');
  // The phase deadline releases an unanswered prompt the same way.
  /** @type {any} */
  let phase = null;
  phase = controlRelay([{ hold: () => phase.clock.advance(6_000) }], { phaseMs: 5_000 });
  phase.requested('v1');
  const ended = await within(phase.ask(request, { sessionId: 's-k' }), 3_000);
  assert.deepEqual([ended.kind, phase.run.report.permissions[0].answer], ['reject', 'input_timeout']);
  assert.equal(phase.terminal.input.listenerCount('data'), 0);
});

test('a worker\'s recorded session storage is one closed form for its own session and folder: forged, foreign, or malformed records fail, and a recorded workspace must still be that directory, unlinked, with its exact device and inode', () => {
  const root = path.join(tempDir('dude-nqv-'), 'dude-a2a-w-Fx0');
  const workspace = path.join(root, 'config', 'session-state', 's-1');
  fs.mkdirSync(workspace, { recursive: true });
  const stat = fs.statSync(workspace, { bigint: true });
  const directory = { dev: stat.dev.toString(), ino: stat.ino.toString() };
  const record = () => ({ kind: 'workspace', metadataSessionId: 's-1', workspacePath: workspace, directory: { ...directory } });
  assert.equal(recordedWorkspace(record(), 's-1', root), 'config/session-state/s-1');
  assert.equal(recordedWorkspace({ kind: 'none', metadataSessionId: 's-1' }, 's-1', root), null, 'observed absence names no path');
  const home = path.join(root, 'home', '.copilot', 'session-state', 's-1');
  assert.equal(recordedWorkspace({ ...record(), workspacePath: home }, 's-1', root), 'home/.copilot/session-state/s-1');
  /** @type {Array<[string, any]>} */
  const forged = [
    ['another session', { ...record(), metadataSessionId: 's-2' }],
    ['the worker\'s own folder', { ...record(), workspacePath: root }],
    ['its configuration folder itself', { ...record(), workspacePath: path.join(root, 'config') }],
    ['its working folder', { ...record(), workspacePath: path.join(root, 'work', 'session-state', 's-1') }],
    ['its temp folder', { ...record(), workspacePath: path.join(root, 'temp', 's-1') }],
    ['another worker\'s folder', { ...record(), workspacePath: path.join(path.dirname(root), 'dude-a2a-w-Fx1', 'config', 'session-state', 's-1') }],
    ['a relative path', { ...record(), workspacePath: 'config/session-state/s-1' }],
    ['an unnormalized path', { ...record(), workspacePath: `${workspace}${path.sep}` }],
    ['a path through a parent segment', { ...record(), workspacePath: path.join(root, 'config') + `${path.sep}..${path.sep}config${path.sep}x` }],
    ['an oversized path', { ...record(), workspacePath: path.join(root, 'config', 'x'.repeat(1_100)) }],
    ['a control character', { ...record(), workspacePath: path.join(root, 'config', 'a\u0007b') }],
    ['a rounded inode', { ...record(), directory: { ...directory, ino: Number(directory.ino) } }],
    ['a padded inode', { ...record(), directory: { ...directory, ino: `0${directory.ino}` } }],
    ['a negative device', { ...record(), directory: { ...directory, dev: `-${directory.dev}` } }],
    ['an extra field', { ...record(), persistenceProven: true }],
    ['absence naming a path', { kind: 'none', metadataSessionId: 's-1', workspacePath: workspace }],
    ['another kind', { ...record(), kind: 'store' }],
    ['no record', undefined],
  ];
  for (const [label, storage] of forged) assert.equal(recordedWorkspace(storage, 's-1', root), undefined, label);

  /** @param {any} storage */
  const now = (storage) => currentWorkspace({ storage: root, sessionId: 's-1', sessionStorage: storage });
  assert.deepEqual(now(record()), { workspace: 'config/session-state/s-1', problems: [] });
  assert.deepEqual(now({ kind: 'none', metadataSessionId: 's-1' }), { workspace: null, problems: [] }, 'absence: nothing to check, and no persistence allowed');
  assert.deepEqual(now({ ...record(), directory: { ...directory, ino: String(BigInt(directory.ino) + 1n) } }).problems, ['identity_changed'],
    'a stale or forged inode');
  assert.deepEqual(now({ ...record(), directory: { ...directory, dev: String(BigInt(directory.dev) + 1n) } }).problems, ['identity_changed'], 'another device');
  assert.deepEqual(now({ ...record(), workspacePath: path.join(root, 'config', 'session-state', 's-9') }).problems, ['unavailable'], 'a folder that does not exist');
  const file = path.join(root, 'config', 'session-state', 's-file');
  fs.writeFileSync(file, 'x');
  assert.deepEqual(now({ ...record(), workspacePath: file }).problems, ['not_directory']);
  // A link above the workspace moves its real place away from the worker's folder.
  const elsewhere = path.join(root, 'home', 'real-state');
  fs.mkdirSync(path.join(elsewhere, 's-2'), { recursive: true });
  fs.symlinkSync(elsewhere, path.join(root, 'config', 'linked-state'), 'junction');
  const linked = path.join(root, 'config', 'linked-state', 's-2');
  const linkedStat = fs.statSync(linked, { bigint: true });
  assert.deepEqual(now({ kind: 'workspace', metadataSessionId: 's-1', workspacePath: linked,
    directory: { dev: linkedStat.dev.toString(), ino: linkedStat.ino.toString() } }).problems, ['linked']);
  assert.deepEqual(now({ ...record(), workspacePath: path.join(root, 'config', 'linked-state') }).problems.length, 1, 'the link itself is not a directory');
  assert.deepEqual(now({ ...record(), metadataSessionId: 's-2' }), { workspace: null, problems: ['record'] });

  // The preflight check refuses a forged record with everything else valid.
  assert.ok(checkPreflight({ storage: root, sessionId: 's-1', sessionStorage: { ...record(), workspacePath: path.join(root, 'work', 'x') } },
    /** @type {any} */ ({ binding: {}, sdk: { index: {}, extension: {} }, storageParent: path.dirname(root) })).includes('sessionStorage'));
  assert.equal(checkPreflight({ storage: root, sessionId: 's-1', sessionStorage: record() },
    /** @type {any} */ ({ binding: {}, sdk: { index: {}, extension: {} }, storageParent: path.dirname(root) })).includes('sessionStorage'), false);
});

// ---------------------------------------------------------------------------
// Recognition, observed order, the relay's lifetime, and the final result chokepoint.
// ---------------------------------------------------------------------------

test('canary recognition needs each form\'s own parsed public result at its exact location; one changed form fails alone, and access or a same-kind success never stands in', () => {
  const f = planFixture();
  const host = scriptedHost(f, testClock());
  const layout = host.layout;
  const folders = { work: layout.control.workspace, config: layout.control.config, home: layout.control.home, temp: layout.control.temp };
  const metadata = { sessionId: 'control-1', context: { workingDirectory: folders.work, gitRoot: folders.work, branch: 'main' } };
  const answers = () => ({ ...structuredClone(host.discovery), metadata: structuredClone(metadata) });
  /** @param {(results: any) => void} [change] */
  const judge = (change) => {
    const results = answers();
    change?.(results);
    return canaryRecognition(results, folders, { sessionId: 'control-1' });
  };
  assert.deepEqual(judge().failed, [], 'every model-less form is recognized');
  assert.equal(judge().rows.some((/** @type {any} */ row) => row.form === 'on_demand_trigger'), false,
    'the after-view trigger is not a model-less form; only the after-view control can show it, and nothing stands in for it here');
  /** @type {Array<[string, (results: any) => void, string, string]>} */
  const cases = [
    ['the project agent found elsewhere', (results) => { results.agents.agents[0].path = path.join(folders.work, 'agents', 'dude-canary.agent.md'); },
      'agent:project', 'not_found'],
    ['the user agent parsed from another source', (results) => { results.agents.agents[1].source = 'project'; }, 'agent:user', 'mismatch'],
    ['an agent without its stable ID', (results) => { results.agents.agents[0].id = ''; }, 'agent:project', 'mismatch'],
    ['only the project agent: the agents kind has a success, the user form still has none', (results) => { results.agents.agents.splice(1, 1); },
      'agent:user', 'not_found'],
    ['the project skill listed twice', (results) => { results.skills.skills.push(structuredClone(results.skills.skills[0])); }, 'skills:project', 'ambiguous'],
    ['AGENTS.md loaded with other content', (results) => { results.instructions.sources[1].content = 'something else'; }, 'instructions:agents', 'mismatch'],
    ['copilot instructions from the user level', (results) => { results.instructions.sources[0].location = 'user'; }, 'instructions:copilot', 'mismatch'],
    ['path-specific instructions without their applyTo', (results) => { delete results.instructions.sources[2].applyTo; }, 'instructions:path_specific', 'mismatch'],
    ['hooks with a load error', (results) => { results.hooks.errors = ['hook file could not be loaded']; }, 'hooks:repository', 'discovery_errors'],
    ['a hook named by a label that only ends with its path', (results) => { results.hooks.hooks[0].source = 'repository settings: .github/hooks/dude-canary.json'; },
      'hooks:repository', 'not_found'],
    ['a disabled hook', (results) => { results.hooks.hooks[0].enabled = false; }, 'hooks:repository', 'mismatch'],
    ['a skill parsed from another source', (results) => { results.skills.skills[1].source = 'custom'; }, 'skills:user', 'mismatch'],
    ['the workspace MCP declaration resolved to the user file', (results) => {
      results.mcpWorkspace.servers[0].effectiveSource.file.uri = pathToFileURL(path.join(folders.config, 'mcp-config.json')).href;
    }, 'mcp:workspace', 'mismatch'],
    ['an MCP server known by name only', (results) => { delete results.mcpUser.servers[0].effectiveSource; }, 'mcp:user', 'mismatch'],
    ['Git context on another branch', (results) => { results.metadata.context.branch = 'other'; }, 'git', 'mismatch'],
    ['no Git context for this session', (results) => { results.metadata = null; }, 'git', 'query_failed'],
  ];
  for (const [label, change, form, reason] of cases) {
    const found = judge(change);
    assert.deepEqual(found.failed, [form], label);
    assert.equal(found.rows.find((row) => row.form === form)?.reason, reason, label);
  }
  const skillErrors = judge((results) => { results.skills.errors = ['a SKILL.md failed to load']; });
  assert.deepEqual(skillErrors.failed.filter((form) => form.startsWith('skills:')), ['skills:project', 'skills:user'], 'a load error leaves both skill forms unproven');
  const noAgents = judge((results) => { results.agents = null; });
  assert.deepEqual(noAgents.rows.filter((row) => row.form.startsWith('agent:')).map((row) => row.reason), ['query_failed', 'query_failed']);
  assert.equal(JSON.stringify(judge()).includes('Synthetic'), false, 'no canary content is kept, only its digest comparison');
});

test('the model-less scan recognizes each instruction canary only with a type and location documented for that file before any view: its own type, as a repository or working-directory source of the scanned project, and every other documented type or location, a missing, empty, unknown, or non-string one, fails that form alone as a mismatch', () => {
  const f = planFixture();
  const host = scriptedHost(f, testClock());
  const layout = host.layout;
  const folders = { work: layout.control.workspace, config: layout.control.config, home: layout.control.home, temp: layout.control.temp };
  const metadata = { sessionId: 'control-1', context: { workingDirectory: folders.work, gitRoot: folders.work, branch: 'main' } };
  // The SDK's closed enumerations: copilot-sdk generated/rpc.d.ts:2927-2941 (InstructionSourceType) and :2949-2957 (InstructionSourceLocation).
  const types = ['home', 'repo', 'model', 'vscode', 'nested-agents', 'child-instructions', 'plugin'];
  const locations = ['user', 'repository', 'working-directory', 'plugin'];
  // A project scan returns "repository/working-directory instruction sources" (rpc.d.ts:15141-15144), and the scanned project is both the
  // scan's working directory and its own repository root, so either location describes the project's own files; user and plugin never do.
  const scanned = ['repository', 'working-directory'];
  // Before any view, the project's own repository files: the repository instructions and its root AGENTS.md are repository-scoped
  // files, never nested agent files, and the path-specific instructions a VS Code instruction file.
  const documented = [
    { index: 0, form: 'instructions:copilot', where: 'work/.github/copilot-instructions.md', type: 'repo' },
    { index: 1, form: 'instructions:agents', where: 'work/AGENTS.md', type: 'repo' },
    { index: 2, form: 'instructions:path_specific', where: 'work/.github/instructions/dude-canary.instructions.md', type: 'vscode' },
  ];
  /** @param {number} index @param {(entry: any) => void} change */
  const judge = (index, change) => {
    const results = { ...structuredClone(host.discovery), metadata: structuredClone(metadata) };
    change(results.instructions.sources[index]);
    return canaryRecognition(results, folders, { sessionId: 'control-1' });
  };
  for (const { index, form, where, type } of documented) {
    for (const location of scanned) {
      const positive = judge(index, (entry) => Object.assign(entry, { type, location }));
      assert.deepEqual(positive.failed, [], `${form}: its documented type ${type} as a ${location} source of the scanned project`);
      assert.deepEqual(positive.rows.find((row) => row.form === form), { form, path: where, status: 'recognized', reason: null }, `${form}: ${location}`);
    }
    // A working-directory source is still bound to the canary's exact path and digest, like a repository one.
    for (const [label, change] of /** @type {Array<[string, (entry: any) => void]>} */ ([
      ['a working-directory source with other content', (entry) => { Object.assign(entry, { location: 'working-directory', content: `${entry.content}x` }); }],
      ['a working-directory source of another project path', (entry) => { Object.assign(entry, { location: 'working-directory', projectPath: folders.temp }); }],
    ])) {
      const found = judge(index, change);
      assert.deepEqual(found.failed, [form], `${form}: ${label}`);
    }
    /** @type {Array<[string, (entry: any) => void]>} */
    const faults = [
      ...types.filter((other) => other !== type).map((other) => /** @type {[string, (entry: any) => void]} */ ([`the documented type ${other}`,
        (entry) => { entry.type = other; }])),
      ['no type', (entry) => { delete entry.type; }],
      ['an empty type', (entry) => { entry.type = ''; }],
      ['an undocumented type', (entry) => { entry.type = 'agents'; }],
      ['its own type in another case', (entry) => { entry.type = type.toUpperCase(); }],
      ['a type that is not a string', (entry) => { entry.type = [type]; }],
      ['a null type', (entry) => { entry.type = null; }],
      ...locations.filter((other) => !scanned.includes(other)).map((other) => /** @type {[string, (entry: any) => void]} */ ([`the documented location ${other}`,
        (entry) => { entry.location = other; }])),
      ['no location', (entry) => { delete entry.location; }],
      ['an empty location', (entry) => { entry.location = ''; }],
      ['an undocumented location', (entry) => { entry.location = 'repo'; }],
      ['its own location in another case', (entry) => { entry.location = 'Repository'; }],
      ['the working directory in another case', (entry) => { entry.location = 'Working-Directory'; }],
      ['a null location', (entry) => { entry.location = null; }],
    ];
    for (const [label, change] of faults) {
      const found = judge(index, change);
      assert.deepEqual(found.failed, [form], `${form}: ${label}`);
      assert.deepEqual(found.rows.find((row) => row.form === form), { form, path: where, status: 'unrecognized', reason: 'mismatch' }, `${form}: ${label}`);
    }
  }
  // The same AGENTS.md, digest, and repository location reported as a nested agent file: once an on-demand view surfaced it, the
  // after-view check accepts that documented type, but the model-less scan, before any view, does not.
  const files = controlFiles();
  const agents = /** @type {string} */ (CANARIES.find((canary) => canary.path === 'AGENTS.md')?.content);
  assert.deepEqual(controlSources({ sources: [{ id: 'i1', label: 'AGENTS.md', sourcePath: 'AGENTS.md', content: agents, type: 'nested-agents',
    location: 'repository' }] }, { source: files.source, instructions: files.instructions, bases: files.bases }).problems, [], 'after the view');
  assert.deepEqual(judge(1, (entry) => { entry.type = 'nested-agents'; }).failed, ['instructions:agents'], 'before any view');
  // And the reverse for the location: the after-view session works outside the project, so a working-directory AGENTS.md is no source
  // of the project there, though the scan of the project itself accepts it.
  assert.deepEqual(controlSources({ sources: [{ id: 'i1', label: 'AGENTS.md', sourcePath: 'AGENTS.md', content: agents, type: 'repo',
    location: 'working-directory' }] }, { source: files.source, instructions: files.instructions, bases: files.bases }).problems, ['source_mismatch'],
  'after the view');
  assert.deepEqual(judge(1, (entry) => { entry.location = 'working-directory'; }).failed, [], 'in the scan');
});

test('an instruction canary the model-less scan reports with an empty type stops the run at recognition, before the after-view session, any prompt or permission, or either main', async () => {
  const { result, host } = await slice({ host: { discovery: (discovery) => { discovery.instructions.sources[1].type = ''; } }, control: [], approvals: [] });
  const { report } = result;
  assert.equal(report.reason, 'ambient_state_unobservable', report.detail);
  assert.equal(report.detail, 'canary_recognition: not established: instructions:agents');
  assert.deepEqual(failedChecks(report), ['canary_recognition']);
  assert.deepEqual(report.canaries.failed, ['instructions:agents']);
  assert.deepEqual(report.canaries.rows.find((/** @type {any} */ row) => row.form === 'instructions:agents'),
    { form: 'instructions:agents', path: 'work/AGENTS.md', status: 'unrecognized', reason: 'mismatch' });
  assert.deepEqual(host.state.log.filter((entry) => /^(?:start|createSession|stop) /.test(entry)), ['start control', 'createSession control', 'stop control'],
    'no after-view session was created and no main started; the control runtime was still stopped by its owned stop');
  assert.deepEqual([host.state.prompts, host.state.permissions], [[], []]);
  assert.equal(report.phases.at(-1).id, 'canary_control');
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('instruction order is read from the runtimes\' own stamps: both admissions strictly before the earliest correlated begin request, and B waiting strictly before A asks', () => {
  const base = Date.parse('2026-11-01T00:00:00.000Z');
  const prompts = { a: 'whole instruction A', b: 'whole instruction B' };
  const waiting = 'Status: conversation 0f8fad5b-d9cb-469f-a165-70867728950e waiting for one project question';
  /** @param {Partial<Record<string, any>>} [change] */
  const timeline = (change = {}) => {
    const t = { aAdmitted: 1, bAdmitted: 0, bBegin: 5, bWaiting: 6, aBegin: 10, aOrigin: 'a-1', bOrigin: 'b-1', aSource: undefined, aPrompt: prompts.a,
      bBeginTs: true, bStatus: waiting, extraA: /** @type {any[]} */ ([]), ...change };
    /** @param {Array<[number, any]>} steps */
    const log = (steps) => {
      let now = base;
      const session = createSessionLog('a', () => now);
      for (const [at, event] of steps.sort((left, right) => left[0] - right[0])) {
        now = base + at;
        session.onEvent(event);
      }
      return session.state.events;
    };
    const stamp = (/** @type {number} */ at) => new Date(base + at).toISOString();
    /** @param {number} at @param {string} id @param {string} op @param {string} origin @param {boolean} [stamped] @returns {Array<[number, any]>} */
    const begin = (at, id, op, origin, stamped = true) => [
      [at, { type: 'assistant.message', ...(stamped ? { timestamp: stamp(at) } : {}), data: { messageId: `m-${id}`, originatingMessageId: origin, content: '',
        toolRequests: [{ toolCallId: id, name: 'dude_a2a_conversation', arguments: { op } }] } }],
      [at, { type: 'tool.execution_start', timestamp: stamp(at), data: { toolCallId: id, toolName: 'dude_a2a_conversation', arguments: { op } } }],
    ];
    return {
      a: log([[t.aAdmitted, { type: 'user.message', timestamp: stamp(t.aAdmitted), data: { messageId: 'a-1', content: t.aPrompt, ...(t.aSource ? { source: t.aSource } : {}) } }],
        ...begin(t.aBegin, 'ca', 'begin_ask', t.aOrigin), ...t.extraA]),
      b: log([[t.bAdmitted, { type: 'user.message', timestamp: stamp(t.bAdmitted), data: { messageId: 'b-1', content: prompts.b } }],
        ...begin(t.bBegin, 'cb', 'begin_receive', t.bOrigin, t.bBeginTs),
        [t.bWaiting, { type: 'session.info', timestamp: stamp(t.bWaiting), data: { infoType: 'notification', message: t.bStatus } }]]),
    };
  };
  const sent = { a: { id: 'a-1', prompt: prompts.a }, b: { id: 'b-1', prompt: prompts.b } };
  const ops = { a: 'begin_ask', b: 'begin_receive' };
  assert.deepEqual(checkInstructionOrder(timeline(), sent, ops, waiting), []);
  /** @type {Array<[string, Partial<Record<string, any>>, string[]]>} */
  const cases = [
    ['B begins while A\'s instruction is not yet admitted', { aAdmitted: 7, bWaiting: 8 }, ['admission_after_begin']],
    ['a tie between an admission and the earliest begin', { aAdmitted: 5 }, ['admission_after_begin']],
    ['B waits only after A asked', { bWaiting: 11 }, ['b_not_waiting_before_ask']],
    ['B reported waiting in another conversation', { bStatus: 'Status: conversation 00000000-0000-4000-8000-000000000000 waiting for one project question' },
      ['b_not_waiting_before_ask']],
    ['a begin with no runtime stamp', { bBeginTs: false }, ['b_begin_order']],
    ['a begin requested by an earlier instruction', { bOrigin: 'b-0' }, ['b_begin_request']],
    ['an attributed admission', { aSource: 'sdk-relay' }, ['a_admission']],
    ['another prompt than the one sent', { aPrompt: 'something else' }, ['a_admission']],
    ['a later root prompt while pending', { extraA: [[12, { type: 'user.message', timestamp: new Date(base + 12).toISOString(), data: { messageId: 'a-2', content: 'x' } }]] },
      ['a_later_prompt']],
    ['a retried begin', { extraA: [[11, { type: 'assistant.message', timestamp: new Date(base + 11).toISOString(), data: { messageId: 'm-retry', originatingMessageId: 'a-1',
      content: '', toolRequests: [{ toolCallId: 'ca2', name: 'dude_a2a_conversation', arguments: { op: 'begin_ask' } }] } }]] }, ['a_begin_request']],
  ];
  for (const [label, change, problems] of cases) assert.deepEqual(checkInstructionOrder(timeline(change), sent, ops, waiting), problems, label);
});

test('the relay\'s lifetime: a request is withdrawn when its phase, scope, run, call, or exact content changes while it waits or after its answer, and the queue is bounded in length and time', async () => {
  const root = tempDir('dude-nqx-');
  const file = path.join(root, 'w', 'progress-a.txt');
  /** @param {any[]} answers @param {{expiresInMs?: number}} [options] */
  const relay = (answers, { expiresInMs = 3_600_000 } = {}) => {
    const clock = testClock();
    const terminal = fakeTerminal(answers);
    const log = createSessionLog('a', clock.now);
    const run = { clock: clock.now, expiresAtMs: clock.now() + expiresInMs, closing: false, report: /** @type {any} */ ({}),
      allow: /** @type {Record<string, any>} */ ({ a: { sessionId: 's-a', phase: 'progress', admission: 'adm-1', progress: { file, initial: 'pending\n', final: 'complete\n' },
        capture: null } }),
      human: humanQueue(terminal, clock.now), clients: [{ side: 'a', log }] };
    /** @param {string} id @param {string} [origin] */
    const requested = (id, origin = 'adm-1') => log.onEvent({ type: 'assistant.message', timestamp: new Date(clock.now()).toISOString(),
      data: { messageId: `m-${id}`, originatingMessageId: origin, content: '', toolRequests: [{ toolCallId: id, name: 'edit', arguments: { path: file } }] } });
    /** @param {string} id */
    const edit = (id) => ({ kind: 'write', toolCallId: id, fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
      fileEdits: [{ before: { path: file, content: 'pending\n' }, after: { path: file, content: 'complete\n' } }] });
    return { run, log, clock, terminal, requested, edit, ask: permissionRelay(run, 'a', log) };
  };

  const approved = relay(['approve-once']);
  approved.requested('c1');
  assert.deepEqual(await approved.ask(approved.edit('c1'), { sessionId: 's-a' }), { kind: 'approve-once', approvedInteractively: true });

  const earlier = relay(['approve-once']);
  earlier.requested('c1', 'adm-0');
  setTimeout(() => earlier.clock.advance(NATIVE_LIMITS.requestMs + 1), 20);
  assert.equal((await earlier.ask(earlier.edit('c1'), { sessionId: 's-a' })).kind, 'reject');
  assert.deepEqual([earlier.run.report.permissions[0].reason, earlier.terminal.prompts.length], ['not_model_requested', 0],
    'a call requested for an earlier instruction is refused without asking');

  // A queued request whose call completed while it waited is never shown.
  const stale = relay([{ type: 'approve-once', before: () => stale.log.onEvent({ type: 'tool.execution_complete', data: { toolCallId: 'c2', success: true,
    result: { content: 'x' } } }) }]);
  stale.requested('c1');
  stale.requested('c2');
  const [first, second] = await Promise.all([stale.ask(stale.edit('c1'), { sessionId: 's-a' }), stale.ask(stale.edit('c2'), { sessionId: 's-a' })]);
  assert.deepEqual([first.kind, second.kind], ['approve-once', 'reject']);
  assert.deepEqual([stale.run.report.permissions[1].answer, stale.terminal.prompts.length], ['request_withdrawn', 1]);

  // Answered after the consented scope expired: withdrawn, though typed within the request's own bound. The scope keeps 30 seconds of
  // real time before the prompt is shown and ends while the human types.
  const late = relay([{ type: 'approve-once', before: () => late.clock.advance(late.run.expiresAtMs - late.clock.now() + 1_000) }], { expiresInMs: 30_000 });
  late.requested('c1');
  assert.equal((await late.ask(late.edit('c1'), { sessionId: 's-a' })).kind, 'reject');
  assert.equal(late.run.report.permissions[0].answer, 'approval_withdrawn');

  // The phase changed while the human typed: a new allow object is a new phase.
  const moved = relay([{ type: 'approve-once', before: () => { moved.run.allow.a = { ...moved.run.allow.a }; } }]);
  moved.requested('c1');
  assert.equal((await moved.ask(moved.edit('c1'), { sessionId: 's-a' })).kind, 'reject');
  assert.equal(moved.run.report.permissions[0].answer, 'approval_withdrawn');

  // The run began closing while the human typed.
  const closing = relay([{ type: 'approve-once', before: () => { closing.run.closing = true; } }]);
  closing.requested('c1');
  assert.equal((await closing.ask(closing.edit('c1'), { sessionId: 's-a' })).kind, 'reject');
  assert.equal(closing.run.report.permissions[0].answer, 'approval_withdrawn');

  // The exact request no longer matches: a staging target appeared before the answer.
  const tempRoot = path.join(root, 't');
  fs.mkdirSync(path.join(tempRoot, 'stage'), { recursive: true });
  const target = path.join(tempRoot, 'stage', 'ledger.md');
  const changed = relay([{ type: 'approve-once', before: () => fs.writeFileSync(target, 'x') }]);
  changed.run.allow.a = { sessionId: 's-a', phase: 'capture', admission: 'adm-1', progress: null, capture: { tempRoot, slug: 'delta', advice: null } };
  changed.requested('c1');
  assert.equal((await changed.ask({ kind: 'write', toolCallId: 'c1', fileName: target, newFileContents: '# x\n', diff: '', intention: 'x',
    canOfferSessionApproval: false }, { sessionId: 's-a' })).kind, 'reject');
  assert.equal(changed.run.report.permissions[0].answer, 'approval_withdrawn');

  // A slow answer runs past the bound that covers queue time and typing: the answer and everything queued behind it time out.
  const slow = relay([{ type: 'approve-once', before: () => slow.clock.advance(NATIVE_LIMITS.permissionMs + 1) }]);
  slow.requested('c1');
  slow.requested('c2');
  const slowAnswers = await Promise.all([slow.ask(slow.edit('c1'), { sessionId: 's-a' }), slow.ask(slow.edit('c2'), { sessionId: 's-a' })]);
  assert.deepEqual(slowAnswers.map((answer) => answer.kind), ['reject', 'reject']);
  assert.deepEqual(slow.run.report.permissions.map((/** @type {any} */ entry) => entry.answer), ['input_timeout', 'input_timeout']);
  assert.equal(slow.terminal.prompts.length, 1, 'the queued request was never shown');

  // The queue itself is bounded.
  const clock = testClock();
  const queue = humanQueue(fakeTerminal([]), clock.now);
  const waiting = Array.from({ length: NATIVE_LIMITS.humanQueue + 1 }, () => queue.ask('x: ', { deadlineAt: clock.now() + 50 }));
  assert.deepEqual(await waiting[NATIVE_LIMITS.humanQueue], { ok: false, reason: 'queue_full' });
  assert.ok((await Promise.all(waiting.slice(0, NATIVE_LIMITS.humanQueue))).every((answer) => !answer.ok));
});

test('the relay\'s lifetime: the root idle of a phase\'s admission, aborted or not, withdraws its typed request as soon as it is delivered, before the run closes the phase: in the capture and the progress phase the request is then refused before it is asked, its wait for a request event that never arrives ends, it is never shown from the queue, and an approve-once typed after that idle approves nothing; with no idle yet, or only an earlier turn\'s, the same request is approved once', async () => {
  const root = tempDir('dude-nqi-');
  const tempRoot = path.join(root, 't');
  const file = path.join(root, 'w', 'progress-a.txt');
  const command = `node .github/skills/dude-feature-definition/publish-first-capture.mjs --root . --slug delta --stage ${path.join(tempRoot, 'stage', 'ledger.md')} `
    + `--number-advice ${path.join(tempRoot, 'stage', 'advice.json')}`;
  // One valid request in each of A's typed phases, both admitted as adm-1: the capture step's publisher command, and the progress file's
  // exact edit. The phase stays installed throughout, because nothing here closes it as the run does once its turn ended: only that end,
  // as the session's own events show it, can withdraw the request.
  const phases = {
    capture: { allow: { phase: 'capture', progress: null, capture: { tempRoot, slug: 'delta', advice: null } }, tool: ['powershell', { command }],
      request: { kind: 'shell', toolCallId: 'c1', fullCommandText: command, intention: 'x', commands: [], possiblePaths: [], possibleUrls: [],
        hasWriteFileRedirection: false, canOfferSessionApproval: false } },
    progress: { allow: { phase: 'progress', progress: { file, initial: 'pending\n', final: 'complete\n' }, capture: null }, tool: ['edit', { path: file }],
      request: { kind: 'write', toolCallId: 'c1', fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
        fileEdits: [{ before: { path: file, content: 'pending\n' }, after: { path: file, content: 'complete\n' } }] } },
  };
  /**
   * @param {keyof typeof phases} phase @param {any[]} answers One answer per prompt, as `fakeTerminal` types them.
   * @param {{frozen?: boolean}} [options] A frozen clock never reaches the request wait's own bound, so only an event can end that wait.
   */
  const relay = (phase, answers, { frozen = false } = {}) => {
    const clock = testClock();
    if (frozen) clock.freeze();
    const terminal = fakeTerminal(answers);
    const log = createSessionLog('a', clock.now);
    const allow = { sessionId: 's-a', admission: 'adm-1', tools: null, ...phases[phase].allow };
    const run = { clock: clock.now, expiresAtMs: clock.now() + 3_600_000, closing: false, report: /** @type {any} */ ({ consent: { status: 'granted' } }),
      allow: /** @type {Record<string, any>} */ ({ a: allow }), human: humanQueue(terminal, clock.now), clients: [{ side: 'a', log }] };
    /** @param {string} type @param {Record<string, unknown>} data */
    const deliver = (type, data) => log.onEvent({ type, id: randomUUID(), timestamp: new Date(clock.now()).toISOString(), data });
    const [name, args] = phases[phase].tool;
    return {
      run, clock, terminal, allow,
      admitted: () => deliver('user.message', { messageId: 'adm-1', content: 'x' }),
      requested: () => deliver('assistant.message', { messageId: 'm-c1', originatingMessageId: 'adm-1', content: '',
        toolRequests: [{ toolCallId: 'c1', name, arguments: args }] }),
      /** @param {Record<string, unknown>} data */
      idle: (data) => deliver('session.idle', data),
      ask: () => permissionRelay(run, 'a', log)(phases[phase].request, { sessionId: 's-a' }),
    };
  };
  /**
   * The relay's answer, what the report kept then, how often the request was shown, and whether the phase was still installed.
   * @param {ReturnType<typeof relay>} context @param {any} answer
   */
  const outcome = (context, answer) => ({ answer: answer.kind, interactive: answer.approvedInteractively === true,
    permissions: structuredClone(context.run.report.permissions ?? null), shown: context.terminal.text.split('[A permission]').length - 1,
    installed: context.run.allow.a === context.allow });
  /** @type {Record<string, any>} */
  const outcomes = {};

  for (const phase of /** @type {const} */ (['capture', 'progress'])) {
    // Every other input is valid: with no idle yet the request is asked and the typed approve-once approves it once, and so it does after
    // an earlier turn's idle, which comes before the admission's own user message and ends nothing.
    const open = relay(phase, ['approve-once']);
    open.admitted();
    open.requested();
    outcomes[`${phase}: no idle yet`] = outcome(open, await within(open.ask(), 5_000));
    const earlier = relay(phase, ['approve-once']);
    earlier.idle({});
    earlier.admitted();
    earlier.requested();
    outcomes[`${phase}: only an earlier turn's idle`] = outcome(earlier, await within(earlier.ask(), 5_000));

    for (const [label, data] of /** @type {Array<[string, Record<string, unknown>]>} */ ([['its turn ended', {}], ['its turn was aborted', { aborted: true }]])) {
      // The callback comes after the idle, its request already delivered.
      const after = relay(phase, ['approve-once']);
      after.admitted();
      after.requested();
      after.idle(data);
      outcomes[`${phase}: ${label}, then the callback`] = outcome(after, await within(after.ask(), 5_000));

      // The callback waits for a request event that never arrives: the idle ends that wait, which the frozen clock never would.
      const unrequested = relay(phase, [], { frozen: true });
      unrequested.admitted();
      const waiting = unrequested.ask();
      unrequested.idle(data);
      outcomes[`${phase}: ${label} while the callback waited, with no request`] = outcome(unrequested, await within(waiting, 3_000));
      // A wait the idle did not end is released at its own bound, so nothing outlives this test.
      unrequested.clock.advance(NATIVE_LIMITS.requestMs + 1);

      // The request waits in line behind another prompt, and the idle is delivered before its turn comes.
      /** @type {any} */
      let queued = null;
      queued = relay(phase, [{ type: 'held', before: () => queued.idle(data) }, 'approve-once']);
      queued.admitted();
      queued.requested();
      const holding = queued.run.human.ask('Hold: ', { deadlineAt: queued.clock.now() + 5_000 });
      outcomes[`${phase}: ${label} while it waited in line`] = outcome(queued, await within(queued.ask(), 5_000));
      assert.deepEqual(await holding, { ok: true, line: 'held' }, `${phase}: ${label} while it waited in line`);

      // The request is shown, and the idle is delivered while the human types approve-once.
      /** @type {any} */
      let typed = null;
      typed = relay(phase, [{ type: 'approve-once', before: () => typed.idle(data) }]);
      typed.admitted();
      typed.requested();
      outcomes[`${phase}: ${label} while the human typed approve-once`] = outcome(typed, await within(typed.ask(), 5_000));
    }
  }
  /** @param {string} kind @param {string | null} target */
  const approved = (kind, target) => ({ answer: 'approve-once', interactive: true,
    permissions: [{ side: 'a', kind, asked: true, reason: null, answer: 'approve-once', target }], shown: 1, installed: true });
  /** @param {string} kind @param {string | null} target @param {string} reason Refused before it was asked. */
  const unasked = (kind, target, reason) => ({ answer: 'reject', interactive: false, permissions: [{ side: 'a', kind, asked: false, reason, answer: null, target }],
    shown: 0, installed: true });
  /** @param {string} kind @param {string | null} target @param {string} reason Withdrawn once asked. @param {number} shown */
  const withdrawn = (kind, target, reason, shown) => ({ answer: 'reject', interactive: false,
    permissions: [{ side: 'a', kind, asked: true, reason, answer: reason, target }], shown, installed: true });
  /**
   * What each case shows in one phase, whose request is of `kind` and names `target`. Once its turn ended no phase or step is open, so a
   * request whose event never came is refused as not pending, not as one its model did not request.
   * @param {string} phase @param {string} kind @param {string | null} target
   */
  const expected = (phase, kind, target) => ({
    [`${phase}: no idle yet`]: approved(kind, target),
    [`${phase}: only an earlier turn's idle`]: approved(kind, target),
    [`${phase}: its turn ended, then the callback`]: unasked(kind, target, 'not_pending'),
    [`${phase}: its turn ended while the callback waited, with no request`]: unasked(kind, target, 'not_pending'),
    [`${phase}: its turn ended while it waited in line`]: withdrawn(kind, target, 'request_withdrawn', 0),
    [`${phase}: its turn ended while the human typed approve-once`]: withdrawn(kind, target, 'approval_withdrawn', 1),
    [`${phase}: its turn was aborted, then the callback`]: unasked(kind, target, 'not_pending'),
    [`${phase}: its turn was aborted while the callback waited, with no request`]: unasked(kind, target, 'not_pending'),
    [`${phase}: its turn was aborted while it waited in line`]: withdrawn(kind, target, 'request_withdrawn', 0),
    [`${phase}: its turn was aborted while the human typed approve-once`]: withdrawn(kind, target, 'approval_withdrawn', 1),
  });
  // The capture request's shell command parses to no command names here, so it names no target; the edit names its file.
  assert.deepEqual(outcomes, { ...expected('capture', 'shell', null), ...expected('progress', 'write', file) });
});

test('each permission prompt keeps its one-line summary, then an action block naming approve-once, reject as the alternative, and the time actually left, counting any wait in line', async () => {
  // The control relay on a frozen clock: its read is shown with its whole 60 seconds, and a pasted approve-once approves it once.
  const files = controlFiles();
  const control = controlRelay([{ paste: 'approve-once\r' }], { frozen: true });
  control.requested('v1');
  assert.deepEqual(await control.ask({ kind: 'read', toolCallId: 'v1', path: files.target, intention: 'x' }, { sessionId: 's-k' }),
    { kind: 'approve-once', approvedInteractively: true });
  assert.equal(control.terminal.text, `\n[CONTROL permission] read ${files.target}\n${permissionBlock('CONTROL', '60 seconds')}approve-once\n`);
  assert.deepEqual(control.terminal.prompts, ['> ']);

  // Two main requests at once on a frozen clock: the second waits in line while the human takes 15 seconds over the first, so its own
  // 60-second bound, which counts that wait, has 45 seconds left when it is shown.
  const root = tempDir('dude-nqb-');
  const file = path.join(root, 'w', 'progress-a.txt');
  const clock = testClock();
  clock.freeze();
  const terminal = fakeTerminal([{ type: 'approve-once', before: () => clock.advance(15_000) }, { paste: ' approve-once\r\n' }]);
  const log = createSessionLog('a', clock.now);
  const run = { clock: clock.now, expiresAtMs: clock.now() + 3_600_000, closing: false, report: /** @type {any} */ ({}),
    allow: /** @type {Record<string, any>} */ ({ a: { sessionId: 's-a', phase: 'progress', admission: 'adm-1', progress: { file, initial: 'pending\n',
      final: 'complete\n' }, capture: null } }),
    human: humanQueue(terminal, clock.now), clients: [{ side: 'a', log }] };
  for (const id of ['c1', 'c2']) {
    log.onEvent({ type: 'assistant.message', timestamp: new Date(clock.now()).toISOString(), data: { messageId: `m-${id}`, originatingMessageId: 'adm-1',
      content: '', toolRequests: [{ toolCallId: id, name: 'edit', arguments: { path: file } }] } });
  }
  const relay = permissionRelay(run, 'a', log);
  /** @param {string} id */
  const edit = (id) => ({ kind: 'write', toolCallId: id, fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
    fileEdits: [{ before: { path: file, content: 'pending\n' }, after: { path: file, content: 'complete\n' } }] });
  const answers = await Promise.all(['c1', 'c2'].map((id) => relay(edit(id), { sessionId: 's-a' })));
  assert.deepEqual(answers.map((answer) => answer.kind), ['approve-once', 'approve-once'], 'the typed and the pasted approve-once each approve once');
  const summary = `[A permission] edit ${file}: ${JSON.stringify('pending\n')} -> ${JSON.stringify('complete\n')}`;
  assert.equal(terminal.text, `\n${summary}\n${permissionBlock('A', '60 seconds')}approve-once\n\n${summary}\n${permissionBlock('A', '45 seconds')} approve-once\n`);
  assert.deepEqual(terminal.prompts, ['> ', '> ']);
});

test('only the final bounded report decides the exit: a success-shaped native report of exactly 64 KiB exits 0, and one byte more exits 4 as an overflow', () => {
  // A pure result-construction check: this success-shaped object is not native evidence.
  const shaped = (/** @type {number} */ bytes) => {
    const report = { tool: 'qualify-collaboration', version: 2, mode: 'native', layer: 'native', verdict: 'qualified', reason: null, runId: 'r', scopeSha256: 's',
      checks: [{ id: 'all', status: 'passed', detail: '' }] };
    report.checks[0].detail = 'x'.repeat(bytes - Buffer.byteLength(`${JSON.stringify(report, null, 2)}\n`, 'utf8'));
    assert.equal(Buffer.byteLength(`${JSON.stringify(report, null, 2)}\n`, 'utf8'), bytes);
    return report;
  };
  const exact = shaped(NATIVE_LIMITS.reportBytes);
  assert.deepEqual(nativeResult(exact), { report: exact, exitCode: 0 });
  const over = nativeResult(shaped(NATIVE_LIMITS.reportBytes + 1));
  assert.deepEqual([over.exitCode, over.report.verdict, over.report.reason, 'checks' in over.report], [4, 'failed', 'observation_overflow', false]);
  assert.equal(nativeResult({ ...shaped(1_024), verdict: 'controlled_only' }).exitCode, 4, 'a controlled run never exits 0');
});

// ---------------------------------------------------------------------------
// Version 3: normal collaboration through each role's existing saved sign-in.
// Fake SDKs and scripted hosts only: these establish the runner's own calls,
// checks, and refusals, never a native account, entitlement, or isolation.
// ---------------------------------------------------------------------------

/**
 * A complete version-3 plan over the same disposable artifacts: no credential,
 * runtime payload, or observation, and each role's existing sign-in naming an
 * existing empty base directory and an expected account. `environment` stands
 * in for this process's: made-up locations below the test folder, without
 * HOME, beside a credential-shaped and an unselected variable that must never
 * be read or passed on.
 * @param {{expiresInMs?: number}} [options]
 */
function planFixtureV3({ expiresInMs = 3_600_000 } = {}) {
  const f = planFixture({ expiresInMs });
  const bases = { a: path.join(f.base, 'sign-in', 'a'), b: path.join(f.base, 'sign-in', 'b'), worker: path.join(f.base, 'sign-in', 'w') };
  for (const directory of Object.values(bases)) fs.mkdirSync(directory, { recursive: true });
  const profile = path.join(f.base, 'profile');
  /** @type {Record<string, string>} */
  const environment = {
    SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATHEXT: '.COM;.EXE', PATH: 'C:\\Windows\\System32',
    USERPROFILE: profile, HOMEDRIVE: 'C:', HOMEPATH: '\\profile', APPDATA: path.join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(profile, 'AppData', 'Local'), GITHUB_TOKEN: 'fixture-credential-never-read', USERNAME: 'fixture-user-never-read',
  };
  const { credentials: _credentials, observation: _observation, ...common } = f.plan;
  /** @param {string} baseDirectory @param {string} login */
  const signIn = (baseDirectory, login) => ({ baseDirectory, expectedAccount: { host: 'https://github.com', login } });
  const plan = {
    ...common, version: 3, artifacts: { cli: f.cli, sdk: f.sdk, sdkAppliedAt: 'createSession' },
    auth: { kind: 'existing-sign-in', a: signIn(bases.a, 'Fixture-A'), b: signIn(bases.b, 'Fixture-B'), worker: signIn(bases.worker, 'Fixture-W') },
  };
  fs.writeFileSync(f.planFile, JSON.stringify(plan, null, 2));
  return { ...f, plan: /** @type {any} */ (plan), bases, environment };
}

/** The validated version-3 scope of a plan fixture, as the runner passes it. @param {ReturnType<typeof planFixtureV3>} f */
function scopeOfV3(f) {
  const scoped = nativeScope({ file: f.planFile, repoRoot: path.join(f.base, 'not-the-repository'), environment: f.environment, platform: 'win32' });
  assert.ok(scoped.scope, JSON.stringify(scoped.report.checks.filter((/** @type {any} */ check) => !['ok', 'not_inspected'].includes(check.status))));
  return { scope: /** @type {any} */ (scoped.scope), plan: scoped.plan };
}

/**
 * A version-3 native run with labeled seams. The observer and calibration
 * helper seams throw if a normal run ever reaches them; any adapter makes the
 * run a controlled test.
 * @param {ReturnType<typeof planFixtureV3>} f @param {Record<string, any>} adapters
 */
async function controlledV3(f, adapters) {
  const { scope, plan } = scopeOfV3(f);
  const calls = { loadSdk: 0, startObserver: 0, runHelper: 0 };
  const result = await runNativeQualification({
    scope,
    plan,
    adapters: {
      platform: 'win32',
      environment: f.environment,
      rescope: () => nativeScope({ file: f.planFile, repoRoot: path.join(f.base, 'not-the-repository'), environment: f.environment, platform: 'win32' }),
      loadSdk: async () => { calls.loadSdk += 1; throw new Error('the SDK must not load in this case'); },
      startObserver: () => { calls.startObserver += 1; throw new Error('a normal run never starts the observer'); },
      runHelper: async () => { calls.runHelper += 1; throw new Error('a normal run never runs the calibration helper'); },
      ...adapters,
    },
  });
  return { ...result, calls, scope };
}

/**
 * One controlled version-3 run against the scripted host in its normal mode,
 * from consent on: the consent literal, both approvals, then `answers`. No
 * control answer exists, because no control runs. `host` and `adapters` may be
 * factories of the slice's clock and plan fixture.
 * @param {{host?: HostOptions | ((time: any, f: any) => HostOptions), approvals?: any[], answers?: any[], expiresInMs?: number,
 *   adapters?: (f: any) => Record<string, any>}} [options]
 */
async function sliceV3({ host: hostOptions = {}, approvals = ['dude a2a approve bbbbbbbbbbbb', 'dude a2a approve aaaaaaaaaaaa'], answers = [], expiresInMs,
  adapters = () => ({}) } = {}) {
  const f = planFixtureV3({ expiresInMs });
  const time = testClock();
  const options = typeof hostOptions === 'function' ? hostOptions(time, f) : hostOptions;
  const host = scriptedHost(f, time, { ...options, normal: options.normal ?? {} });
  const { scope } = scopeOfV3(f);
  const terminal = fakeTerminal([consentLiteral(scope.scopeSha256), ...approvals, ...answers],
    { onUnscripted: () => time.advance(Math.max(0, Date.parse(f.plan.expiresAt) - time.now()) + 1_000) });
  const result = await controlledV3(f, { terminal, clock: time.now, loadSdk: async () => host.sdk, ...adapters(f) });
  assert.deepEqual(terminal.unscripted, [], 'the run asked what this test never scripted '
    + `(${result.report.reason}: ${result.report.detail}; phases ${phaseList(result.report).map(([id, status]) => `${id}:${status}`).join(' ')}; `
    + `failed checks: ${failedChecks(result.report).join(', ') || 'none'})`);
  return { result, host, terminal, f, time, layout: host.layout };
}

/** Check IDs only the strict branch records; a normal run reports none of them, passed or not. */
const STRICT_ONLY_CHECK = /^(?:observer_calibration|canary_recognition|control_|after_view_control|[ab]_runtime_payload|[ab]_extension_process|worker_process_|worker_payload_|worker_storage_|startup_.*_storage|.*_cessation|final_(?:coverage|identity|storage|effects|owned_tree_cessation|observer_exit))/;
/** The approved selection, written out from the contract rather than taken from the module under test. */
const APPROVED_NAMES = ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA'];

test('version-3 preparation writes only the workspaces, their temp folders, the latch manifest, and the proof folder, and its owner configurations pass the actual product parser, binder, and renderer on the existing-sign-in branch within the fixed cap', async (context) => {
  const f = planFixtureV3();
  const { scope } = scopeOfV3(f);
  const layout = layoutOf(scope.values.fixtureParent);
  const runId = randomUUID();
  const pins = { a: f.certs.a.pin, b: f.certs.b.pin };
  const prepared = prepareFixtures({ scope, layout, runId, pins });

  // Only the normal roots: a normal runtime's home and configuration are real, and no canary or control root exists.
  assert.deepEqual(fs.readdirSync(layout.parent).sort(), ['a', 'b', 'p', 'q']);
  for (const side of /** @type {const} */ (['a', 'b'])) assert.deepEqual(fs.readdirSync(layout[side].root).sort(), ['a2a.json', 't', 'w'], side);
  assert.deepEqual(fs.readdirSync(layout.fixture), ['manifest.json'], 'the latch manifest alone; no canary source');
  const manifestBytes = fs.readFileSync(path.join(layout.fixture, 'manifest.json'));
  assert.deepEqual(JSON.parse(manifestBytes.toString('utf8')), { version: 2, runId });
  assert.deepEqual([prepared.manifest.sha256, fixtureManifest(runId, 2).sha256], [sha256(manifestBytes), sha256(manifestBytes)]);
  const core = renderedCore(REPOSITORY);
  for (const side of /** @type {const} */ (['a', 'b'])) {
    assert.deepEqual(fs.readdirSync(path.join(layout[side].workspace, '.dude', 'ideas')).sort(), side === 'a' ? ['100-local-seed.md']
      : ['100-peer-seed.md', '101-peer-latest.md'], `${side} seeds`);
    for (const [relPath, , digest] of core.rows) assert.equal(sha256(fs.readFileSync(path.join(layout[side].workspace, ...relPath.split('/')))), digest, relPath);
  }
  assert.equal(fs.existsSync(path.join(f.bases.a, 'extensions')) || fs.readdirSync(f.bases.a).length > 0, false, 'nothing is written to a real base directory');

  // The actual product parser: B's worker on exactly the existing-sign-in branch the scope bound, with no token file.
  const parsed = { a: parseA2aConfig(JSON.parse(fs.readFileSync(layout.a.a2aConfig, 'utf8'))), b: parseA2aConfig(JSON.parse(fs.readFileSync(layout.b.a2aConfig, 'utf8'))) };
  const worker = /** @type {any} */ (parsed.b.profiles.get('b')).collaboration.worker;
  assert.equal(/** @type {any} */ (parsed.a.profiles.get('a')).collaboration.worker, null);
  assert.deepEqual({ path: worker.path, args: worker.args, env: worker.env, auth: worker.auth, tokenFile: worker.tokenFile, model: worker.model,
    qualification: worker.qualification }, {
    path: scope.values.cli, args: [], env: { inherit: APPROVED_NAMES, set: [] },
    auth: { kind: 'existing-sign-in', baseDirectory: f.bases.worker, expectedAccount: { host: 'https://github.com', login: 'Fixture-W' } },
    tokenFile: undefined, model: 'fixture-model-worker', qualification: { version: 2, runId, fixtureRoot: layout.fixture, fixtureSha256: prepared.manifest.sha256 },
  });
  assert.deepEqual(prepared.configDigests, { a: sha256(fs.readFileSync(layout.a.a2aConfig)), b: sha256(fs.readFileSync(layout.b.a2aConfig)) });
  const strict = JSON.parse(fs.readFileSync(layout.b.a2aConfig, 'utf8'));
  strict.profiles.b.collaboration.worker.qualification.version = 1;
  assert.throws(() => parseA2aConfig(strict), /qualification\.version/, 'a canary qualification on this worker is another branch\'s');

  // The actual binder and renderer, bound from the selected environment on Windows: complete proposals within the fixed cap,
  // and B's names the existing sign-in, its latch-only qualification, and its normal storage; proposalOf accepts the very text.
  for (const side of /** @type {const} */ (['a', 'b'])) {
    const provider = createA2a({ root: layout[side].workspace, platform: 'win32', environment: f.environment });
    const sessionId = `${side}-fixture-session-0123456789abcdef`;
    provider.bindSession(/** @type {any} */ ({
      sessionId, log: async () => undefined, rpc: { queue: { pendingItems: async () => ({ items: [], steeringMessages: [], inFlightSteeringCount: 0 }) } },
    }));
    const tool = /** @type {any} */ (provider.tools.find((entry) => entry.name === 'dude_a2a_propose'));
    const result = await tool.handler({ configPath: layout[side].a2aConfig, profileId: side }, {
      sessionId, toolName: 'dude_a2a_propose', toolCallId: `call-${side}`, signal: new AbortController().signal,
    });
    assert.equal(result.resultType, 'success', result.textResultForLlm);
    const text = result.textResultForLlm;
    const bytes = Buffer.byteLength(text, 'utf8');
    assert.ok(bytes <= A2A_PROPOSAL_BYTES, `${side} proposal ${bytes} bytes`);
    context.diagnostic(`${side} complete version-3 proposal: ${bytes} of ${A2A_PROPOSAL_BYTES} bytes`);
    assert.equal(text.includes('fixture-credential-never-read') || text.includes('fixture-user-never-read'), false, 'no unselected value is shown');
    const log = createSessionLog(side);
    log.onEvent({ type: 'tool.execution_start', id: randomUUID(), timestamp: new Date().toISOString(), data: { toolCallId: 'p1', toolName: 'dude_a2a_propose',
      arguments: { configPath: layout[side].a2aConfig, profileId: side } } });
    log.onEvent({ type: 'tool.execution_complete', id: randomUUID(), timestamp: new Date().toISOString(), data: { toolCallId: 'p1', success: true,
      result: { content: text } } });
    const expected = { sessionId, worker: side === 'b', runId, ...(side === 'b' ? { signIn: { host: 'https://github.com', login: 'Fixture-W' } } : {}) };
    assert.equal(proposalOf(log.state.events, expected).text, text, `${side}: the actual product text is one complete proposal for this run`);
    if (side === 'b') {
      assert.ok(text.includes('Worker sign-in and model: existing saved sign-in, expected Fixture-W at https://github.com on the runtime and its session'));
      assert.ok(text.includes(`QUALIFICATION: run ${runId}; fixture ${layout.fixture} sha256:${prepared.manifest.sha256}; latches only, with no canaries or probes`));
      assert.ok(text.includes(`Worker storage: real home and app data, and ${f.bases.worker} for normal configuration`));
      assert.throws(() => proposalOf(log.state.events, { ...expected, signIn: { host: 'https://github.com', login: 'someone-else' } }),
        (error) => error instanceof NativeStop && error.reason === 'proposal_unavailable', 'another expected account is another proposal');
    }
  }

  // A generated configuration the product would refuse is never written: here a selection naming a credential variable.
  const g = planFixtureV3();
  const bad = structuredClone(scopeOfV3(g).scope);
  bad.values.environment.names.push('GITHUB_TOKEN');
  const badLayout = layoutOf(bad.values.fixtureParent);
  assert.throws(() => prepareFixtures({ scope: bad, layout: badLayout, runId: randomUUID(), pins }),
    (error) => error instanceof NativeStop && error.reason === 'fixture_unavailable');
  assert.deepEqual([fs.existsSync(badLayout.a.a2aConfig), fs.existsSync(badLayout.b.a2aConfig)], [false, false], 'nothing the product parser refuses is written');
  assert.throws(() => prepareFixtures({ scope, layout, runId: randomUUID(), pins }), 'every file is created exclusively');

  // Each main runtime's environment: only the bound selected values, the unselected Windows names blank, and its own temp folder.
  const env = normalEnvironment(scope.values.environment, layout.a.temp);
  const values = scope.values.environment.values;
  assert.equal(values.HOME, f.environment.USERPROFILE, 'HOME, absent here, is USERPROFILE');
  assert.deepEqual(env, { ...values, LOGONSERVER: '', SYSTEMDRIVE: '', USERDOMAIN: '', USERNAME: '', TEMP: layout.a.temp, TMP: layout.a.temp, TMPDIR: layout.a.temp });
  assert.equal('GITHUB_TOKEN' in env, false, 'no credential variable is inherited');
});

/**
 * A stand-in for the public SDK an existing-sign-in worker uses (fake; no
 * runtime): its client and session answer their account status (the expected
 * login in another letter case, beside a status message and plan that must
 * never be kept), the session reports a workspace under the client's base
 * directory through its metadata snapshot and public getter, and the scripted
 * model lists, then reads 101, then answers.
 */
function normalWorkerSdk() {
  /** @type {any[]} */
  const clients = [];
  const status = { isAuthenticated: true, authType: 'gh-cli', host: 'https://github.com', login: 'fixture-w', statusMessage: 'hidden status text',
    copilotPlan: 'hidden plan' };
  class CopilotClient {
    /** @param {any} options */
    constructor(options) { this.options = options; clients.push(this); }

    /** @param {any} config */
    async createSession(config) {
      const offered = () => config.tools.filter((/** @type {any} */ tool) => config.availableTools.includes(`custom:${tool.name}`));
      const workspace = path.join(this.options.baseDirectory, 'session-state', 'child-session-1');
      fs.mkdirSync(workspace, { recursive: true });
      let calls = 0;
      const session = {
        sessionId: 'child-session-1',
        get workspacePath() { return workspace; },
        rpc: {
          metadata: {
            snapshot: async () => ({ sessionId: session.sessionId, isRemote: false, alreadyInUse: false, workspacePath: workspace,
              workingDirectory: config.workingDirectory, currentMode: 'interactive', sessionLimits: null }),
          },
          tools: {
            initializeAndValidate: async () => ({}),
            getCurrentMetadata: async () => ({ tools: offered().map((/** @type {any} */ tool) => ({ name: tool.name, input_schema: tool.parameters })) }),
          },
          model: { getCurrent: async () => ({ modelId: config.model }) },
          gitHubAuth: { getStatus: async () => ({ ...status }) },
        },
        async send() {
          setImmediate(async () => {
            /** @param {string} name @param {unknown} args */
            const call = async (name, args) => {
              calls += 1;
              const toolCallId = `model-call-${calls}`;
              config.onEvent({ type: 'assistant.message', data: { messageId: `m-${calls}`, originatingMessageId: 'admission-1', content: '',
                toolRequests: [{ toolCallId, name }] } });
              const tool = config.tools.find((/** @type {any} */ entry) => entry.name === name);
              return tool.handler(args, { sessionId: session.sessionId, toolCallId, toolName: name, arguments: args, signal: new AbortController().signal });
            };
            await call(WORKER_TOOLS.inventory, {});
            await call(WORKER_TOOLS.read, { reference: 'w/.dude/ideas/101-peer-latest.md' });
            config.onEvent({ type: 'assistant.message', data: { messageId: 'final', originatingMessageId: 'admission-1', content: '{"observedMaximum":101}' } });
            config.onEvent({ type: 'session.idle', data: {} });
          });
          return 'admission-1';
        },
        abort: async () => undefined,
      };
      return session;
    }

    async getStatus() { return { version: '1.0.102-fixture', protocolVersion: 3 }; }

    async getAuthStatus() { return { ...status }; }

    async stop() { return []; }

    async forceStop() { return undefined; }
  }
  return { sdk: { CopilotClient, RuntimeConnection: { forStdio: (/** @type {any} */ options) => ({ kind: 'stdio', ...options }) },
    defineTool: (/** @type {string} */ name, /** @type {object} */ config) => ({ name, ...config }) }, clients };
}

/**
 * The actual existing-sign-in worker on this runner's latch-only manifest,
 * with test-owned home, app data, and base directory, recording its
 * checkpoints the way B's journal serializes them.
 */
function normalQualifiedWorker() {
  const root = tempDir('dude-nqw-');
  const runId = randomUUID();
  const manifest = fixtureManifest(runId, 2);
  fs.writeFileSync(path.join(root, 'manifest.json'), manifest.bytes);
  const home = path.join(tempDir('dude-nqo-'), 'home');
  const base = path.join(home, '.copilot');
  for (const folder of [path.join(home, 'AppData', 'Roaming'), path.join(home, 'AppData', 'Local'), base]) fs.mkdirSync(folder, { recursive: true });
  /** @type {any[]} */
  const journal = [];
  const reads = /** @type {string[]} */ ([]);
  const fake = normalWorkerSdk();
  const worker = startEvidenceWorker({
    binding: { ...BINDING },
    qualification: { version: 2, runId, fixtureRoot: root, fixtureSha256: manifest.sha256 },
    extension: { loader: { source: 'fixed_loader', resolvedUrl: pathToFileURL(JOINED_PATH).href, path: JOINED_PATH, bytes: 716_344, sha256: 'e'.repeat(64) }, pid: 4242 },
    runtime: {
      path: path.join(os.tmpdir(), 'fixture-runtime', 'copilot.exe'), args: [],
      env: { SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows\\System32', HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(home, 'AppData', 'Local'), TEMP: '' },
      auth: { kind: 'existing-sign-in', baseDirectory: base, expectedAccount: { host: 'https://github.com', login: 'Fixture-W' } },
    },
    model: 'fixture-model-worker',
    prompt: 'Which is the highest lifecycle number?',
    contentBytes: 32_768,
    timeoutMs: 60_000,
    evidence: {
      inventory: () => { reads.push('inventory'); return { ok: true, text: '{"records":[{"reference":"w/.dude/ideas/101-peer-latest.md","number":101}]}' }; },
      read: (/** @type {any} */ request) => {
        if (request.reference !== 'w/.dude/ideas/101-peer-latest.md') return { ok: false, reason: 'not_listed' };
        reads.push('read');
        return { ok: true, text: 'number 101' };
      },
    },
    checkpoint: (/** @type {any} */ entry) => { journal.push(JSON.parse(JSON.stringify({ kind: entry.kind, data: entry.data }))); return { ok: true }; },
  }, { loadSdk: async () => fake.sdk, tempParent: tempDir('dude-nqs-') });
  return { worker, journal, root, runId, manifest, reads, base, fake };
}

test('the actual existing-sign-in worker, on this runner\'s latch manifest, records the version-2 readiness this receiver accepts except its injected loader, and reads evidence only after the exact releases written here; neither branch\'s record passes the other receiver', async () => {
  const { worker, journal, root, runId, manifest, reads, base, fake } = normalQualifiedWorker();
  const startup = await worker.startup;
  assert.equal(startup.ok, true, JSON.stringify(startup));
  const preflight = await recorded(journal, 'worker_preflight');
  assert.equal(observationDigest(preflight), /** @type {any} */ (startup).sha256, 'the digest over the journaled record is the worker\'s own');
  assert.deepEqual(Object.keys(preflight), ['version', 'workerId', 'binding', 'sessionId', 'qualification', 'loaders', 'extensionPid', 'runtime', 'model',
    'storage', 'auth', 'sessionStorage', 'catalog', 'startedAt', 'completedAt'], 'no ambient counts or probes are recorded');
  const kept = { isAuthenticated: true, authType: 'gh-cli', host: 'https://github.com', login: 'fixture-w' };
  assert.deepEqual(preflight.auth, { runtime: kept, session: kept }, 'only the matched host and login are kept, never the status text or plan');
  assert.deepEqual(preflight.sessionStorage, { kind: 'normal', metadataSessionId: 'child-session-1', workingDirectory: path.join(preflight.storage, 'work'),
    workspacePath: path.join(base, 'session-state', 'child-session-1') });
  const client = fake.clients[0].options;
  assert.deepEqual([client.mode, client.useLoggedInUser, client.baseDirectory, 'gitHubToken' in client, 'logLevel' in client],
    ['copilot-cli', true, base, false, false], 'the actual worker\'s own client: normal mode, the logged-in user, the real base directory, no token');

  const index = { path: path.join(os.tmpdir(), 'dude-fixture-sdk', 'index.js'), bytes: 1, sha256: 'f'.repeat(64) };
  const expected = {
    workerId: worker.workerId, binding: Object.fromEntries(Object.entries(BINDING).filter(([key]) => key !== 'permitId')), runId, fixtureSha256: manifest.sha256,
    sdk: { extension: { path: JOINED_PATH, bytes: 716_344, sha256: 'e'.repeat(64) }, index }, extensionPid: 4242,
    runtime: { version: '1.0.102-fixture', protocolVersion: 3 }, model: 'fixture-model-worker', storageParent: path.dirname(preflight.storage),
    account: { host: 'https://github.com', login: 'Fixture-W' },
  };
  assert.deepEqual(checkNormalPreflight(preflight, expected), ['loaders.worker'], 'a worker SDK handed in by a test adapter is never production provenance');
  const fixed = { ...structuredClone(preflight), loaders: { ...preflight.loaders,
    worker: { source: 'fixed_loader', resolvedUrl: pathToFileURL(index.path).href, path: index.path, bytes: index.bytes, sha256: index.sha256 } } };
  assert.deepEqual(checkNormalPreflight(fixed, expected), [], 'with a production loader record, the actual record is exactly the normal readiness');
  const strictProblems = checkPreflight(fixed, { ...expected, canaries: 17, canaryBytes: 1 });
  for (const problem of ['version', 'qualification', 'sessionStorage', 'ambient', 'probes']) {
    assert.ok(strictProblems.includes(problem), `the strict receiver refuses this record: ${problem}`);
  }
  const { auth: _auth, ...withoutAuth } = structuredClone(fixed);
  const strictRecord = { ...withoutAuth, version: 1, qualification: { version: 1, runId, fixtureSha256: manifest.sha256, canaries: 17, canaryBytes: 1 },
    sessionStorage: { kind: 'none', metadataSessionId: fixed.sessionId },
    ambient: { instructionSources: 0, skills: 0, enabledSkills: 0, mcpServers: 0, extensions: 0, customAgents: 0, selectedAgent: false }, probes: PROBES };
  const normalProblems = checkNormalPreflight(strictRecord, expected);
  for (const problem of ['keys', 'version', 'qualification', 'auth', 'sessionStorage']) {
    assert.ok(normalProblems.includes(problem), `a strict record never stands in for normal readiness: ${problem}`);
  }
  /** @type {Array<[string, (copy: any) => void, string[]]>} */
  const changes = [
    ['an ambient count beside it', (copy) => { copy.ambient = strictRecord.ambient; }, ['keys']],
    ['probes beside it', (copy) => { copy.probes = PROBES; }, ['keys']],
    ['another version', (copy) => { copy.version = 1; }, ['version']],
    ['an unauthenticated runtime', (copy) => { copy.auth.runtime.isAuthenticated = false; }, ['auth.runtime']],
    ['another session login', (copy) => { copy.auth.session.login = 'someone-else'; }, ['auth.session']],
    ['an environment-token kind', (copy) => { copy.auth.runtime.authType = 'env'; }, ['auth.runtime']],
    ['a host not in its canonical form', (copy) => { copy.auth.session.host = 'https://github.com/'; }, ['auth.session']],
    ['another host', (copy) => { copy.auth.session.host = 'https://ghe.example'; }, ['auth.session']],
    ['a kept status message', (copy) => { copy.auth.runtime.statusMessage = 'x'; }, ['auth.runtime']],
    ['no session account', (copy) => { delete copy.auth.session; }, ['auth']],
    ['another working directory', (copy) => { copy.sessionStorage.workingDirectory = path.join(copy.storage, 'temp'); }, ['sessionStorage']],
    ['a relative workspace', (copy) => { copy.sessionStorage.workspacePath = 'session-state/child-session-1'; }, ['sessionStorage']],
    ['an oversized workspace path', (copy) => { copy.sessionStorage.workspacePath = path.join(base, 'x'.repeat(1_100)); }, ['sessionStorage']],
    ['another session\'s storage', (copy) => { copy.sessionStorage.metadataSessionId = 'other-session'; }, ['sessionStorage']],
    ['the strict storage form', (copy) => { copy.sessionStorage = { kind: 'none', metadataSessionId: copy.sessionId }; }, ['sessionStorage']],
    ['no qualification', (copy) => { copy.qualification = null; }, ['qualification']],
    ['a canary qualification', (copy) => { copy.qualification = { ...copy.qualification, version: 1, canaries: 17, canaryBytes: 1 }; }, ['qualification']],
    ['another run', (copy) => { copy.qualification.runId = randomUUID(); }, ['qualification']],
    ['another extension', (copy) => { copy.extensionPid = 4243; }, ['extensionPid']],
    ['another operation', (copy) => { copy.binding.operationId = randomUUID(); }, ['binding.operationId']],
    ['storage outside B\'s temp folder', (copy) => { copy.storage = path.join(base, 'dude-a2a-w-elsewhere'); }, ['storage', 'sessionStorage']],
    ['a startup past its bound', (copy) => { copy.completedAt = new Date(Date.parse(copy.startedAt) + 10_001).toISOString(); }, ['startup_time']],
    ['an oversized record', (copy) => { copy.catalog[0].padding = 'x'.repeat(WORKER_BOUNDS.startupBytes); }, ['size']],
    ['the login in other letter cases', (copy) => { copy.auth.runtime.login = 'FIXTURE-W'; copy.auth.session.login = 'Fixture-w'; }, []],
    ['no workspace path, which is observed absence only', (copy) => { copy.sessionStorage.workspacePath = null; }, []],
  ];
  for (const [label, change, problems] of changes) {
    const copy = structuredClone(fixed);
    change(copy);
    assert.deepEqual(checkNormalPreflight(copy, expected), problems, label);
  }

  // The latches: nothing is prompted before the startup release, and nothing is read before the evidence release.
  assert.equal(journal.some((entry) => entry.kind === 'worker_ready'), false, 'no prompt before the startup release');
  writeRelease(root, 'startup', startupReleaseOf({ runId, operationId: BINDING.operationId, preflight }));
  const pending = await recorded(journal, 'worker_evidence_pending');
  const admitted = await recorded(journal, 'worker_request_admitted');
  assert.deepEqual(checkPending(pending, { workerId: worker.workerId, sessionId: preflight.sessionId, admissionId: admitted.admissionId }), []);
  assert.deepEqual(reads, [], 'the held call read nothing');
  writeRelease(root, 'evidence', evidenceReleaseOf({ runId, operationId: BINDING.operationId, preflight, pending }));
  const result = await worker.result;
  assert.deepEqual([result.outcome, result.reason], ['answered', null]);
  assert.deepEqual(reads, ['inventory', 'read']);
  const closed = await worker.closed;
  assert.deepEqual(checkWorkerCleanup(closed, { workerId: worker.workerId, storage: preflight.storage }), [],
    'its actual bounded cleanup: a stop without errors, cessation unconfirmed, storage kept');
  assert.deepEqual([closed.runtime, closed.storage], ['unconfirmed', 'retained']);
  assert.deepEqual(fs.readdirSync(root).map((name) => name.replace(/^[0-9a-f-]{36}\./, '')).sort(), ['evidence-release.json', 'manifest.json',
    'startup-release.json'], 'the latch fixture holds only its manifest and the two releases');
});

test('account answers, worker cleanup records, the normal runtime environment, and the passing verdict each follow one closed rule', () => {
  const expected = { host: 'https://github.com', login: 'Fixture-A' };
  const signedIn = { isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'fixture-a', statusMessage: 'hidden', copilotPlan: 'hidden' };
  assert.deepEqual(readAccount(signedIn, expected), { ok: true, account: { isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'fixture-a' } },
    'the login compares without letter case; the status text and plan are dropped');
  assert.deepEqual(readAccount({ ...signedIn, authType: 'gh-cli', host: 'https://github.com/' }, expected),
    { ok: true, account: { isAuthenticated: true, authType: 'gh-cli', host: 'https://github.com', login: 'fixture-a' } }, 'an observed host is read as its origin');
  /** @type {Array<[string, unknown, string]>} */
  const cases = [
    ['no answer', undefined, 'auth_unavailable'],
    ['a text answer', 'signed in', 'auth_unavailable'],
    ['no authentication flag', { ...signedIn, isAuthenticated: undefined }, 'auth_unavailable'],
    ['a text flag', { ...signedIn, isAuthenticated: 'true' }, 'auth_unavailable'],
    ['unauthenticated, though naming the account', { ...signedIn, isAuthenticated: false }, 'auth_required'],
    ['no kind', { ...signedIn, authType: undefined }, 'auth_unavailable'],
    ['no login', { ...signedIn, login: undefined }, 'auth_unavailable'],
    ['a blank login', { ...signedIn, login: '   ' }, 'auth_unavailable'],
    ['an oversized login', { ...signedIn, login: 'l'.repeat(257) }, 'auth_unavailable'],
    ['no host', { ...signedIn, host: undefined }, 'auth_unavailable'],
    ['a bare host name', { ...signedIn, host: 'github.com' }, 'auth_unavailable'],
    ['a host with a control character', { ...signedIn, host: 'https://github.com\u0007' }, 'auth_unavailable'],
    ['an environment token', { ...signedIn, authType: 'env' }, 'auth_mismatch'],
    ['an explicit token', { ...signedIn, authType: 'token' }, 'auth_mismatch'],
    ['an API key', { ...signedIn, authType: 'api-key' }, 'auth_mismatch'],
    ['plain HTTP', { ...signedIn, host: 'http://github.com' }, 'auth_mismatch'],
    ['another host', { ...signedIn, host: 'https://ghe.example' }, 'auth_mismatch'],
    ['another login', { ...signedIn, login: 'someone-else' }, 'auth_mismatch'],
  ];
  for (const [label, status, reason] of cases) assert.deepEqual(readAccount(status, expected), { ok: false, reason }, label);

  const storage = path.join(os.tmpdir(), 'dude-a2a-w-fixture');
  const clean = { workerId: 'w-1', runtime: 'unconfirmed', abort: 'not_needed', stop: 'clean', stopErrors: 0, forceStop: 'not_needed', storage: 'retained',
    retainedPath: storage };
  assert.deepEqual(checkWorkerCleanup(clean, { workerId: 'w-1', storage }), []);
  /** @type {Array<[string, unknown, string[]]>} */
  const cleanups = [
    ['stop errors', { ...clean, stop: 'errors', stopErrors: 2, forceStop: 'completed' }, ['stop', 'forceStop']],
    ['a stop that timed out', { ...clean, stop: 'timed_out', forceStop: 'timed_out' }, ['stop', 'forceStop']],
    ['a cleanup not observed within its bound', { runtime: 'unconfirmed', observed: false }, ['unobserved']],
    ['a cessation claimed', { ...clean, runtime: 'stopped' }, ['runtime']],
    ['storage deleted', { ...clean, storage: 'deleted', retainedPath: null }, ['storage']],
    ['another worker', { ...clean, workerId: 'w-2' }, ['workerId']],
    ['no record', null, ['record']],
  ];
  for (const [label, record, problems] of cleanups) assert.deepEqual(checkWorkerCleanup(record, { workerId: 'w-1', storage }), problems, label);

  const bound = { names: [...APPROVED_NAMES], values: { SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows\\System32', USERPROFILE: 'C:\\u', HOME: 'C:\\u',
    APPDATA: 'C:\\u\\r', LOCALAPPDATA: 'C:\\u\\l', GITHUB_TOKEN: 'not-selected' } };
  assert.deepEqual(normalEnvironment(bound, 'C:\\f\\a\\t'), { SystemRoot: 'C:\\Windows', PATH: 'C:\\Windows\\System32', USERPROFILE: 'C:\\u', HOME: 'C:\\u',
    APPDATA: 'C:\\u\\r', LOCALAPPDATA: 'C:\\u\\l', LOGONSERVER: '', SYSTEMDRIVE: '', USERDOMAIN: '', USERNAME: '', TEMP: 'C:\\f\\a\\t', TMP: 'C:\\f\\a\\t',
    TMPDIR: 'C:\\f\\a\\t' }, 'only selected names pass, whatever else a value set holds');

  /** @param {string} verdict @param {number} [version] */
  const shaped = (verdict, version = 3) => ({ tool: 'qualify-collaboration', version, mode: 'native', layer: 'native', verdict, reason: null, runId: 'r',
    scopeSha256: 's', checks: [{ id: 'all', status: 'passed', detail: '' }] });
  assert.equal(nativeResult(shaped('collaboration_qualified')).exitCode, 0, 'a normal native pass');
  assert.equal(nativeResult(shaped('qualified')).exitCode, 4, 'a normal report never carries the strict pass');
  assert.equal(nativeResult(shaped('collaboration_qualified', 2)).exitCode, 4, 'a strict report never carries the normal pass');
  assert.equal(nativeResult(shaped('controlled_only')).exitCode, 4);
  const over = nativeResult({ ...shaped('collaboration_qualified'), checks: [{ id: 'all', status: 'passed', detail: 'x'.repeat(NATIVE_LIMITS.reportBytes) }] });
  assert.deepEqual([over.exitCode, over.report.verdict, over.report.reason], [4, 'failed', 'observation_overflow'], 'an overflow is never a pass');
});

test('a complete controlled version-3 slice runs normal collaboration end to end: normal-mode clients on the bound basis, both accounts checked before every prompt, the normal worker\'s readiness, held call, both mains\' progress, the answer, capture, cancellation, and honest bounded stops, with strict isolation deferred, and still never qualifies', async () => {
  const { result, host, layout, f } = await sliceV3({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'] });
  const { report } = result;
  assert.equal(report.reason, null, report.detail);
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(phaseList(report), ['consent', 'revalidate', 'prepare', 'start_mains', 'approve_b', 'approve_a', 'advice_exchange', 'capture', 'cancel_exchange',
    'teardown', 'retained_reread'].map((id) => [id, 'passed']), 'no observer, canary, or control phase');
  assert.deepEqual([report.version, report.verdict, report.layer, result.exitCode], [3, 'controlled_only', 'controlled_test: injected adapters; never native evidence', 4],
    'a controlled run is never collaboration_qualified, however completely it runs');
  assert.deepEqual(result.calls, { loadSdk: 0, startObserver: 0, runHelper: 0 }, 'the scripted SDK loaded; no observer or helper ever started');
  assert.deepEqual(report.strict, structuredClone(result.scope.strict));
  assert.deepEqual([report.strict.status, report.strict.executed, report.strict.passed], ['deferred', false, false]);
  for (const absent of ['observer', 'canaries', 'control']) assert.equal(absent in report, false, absent);
  assert.deepEqual(report.checks.filter((/** @type {any} */ entry) => STRICT_ONLY_CHECK.test(entry.id)).map((/** @type {any} */ entry) => entry.id), [],
    'no strict check is run, so none is reported passed');
  const [advice, cancel] = host.state.exchanges.map((/** @type {any} */ ex) => ex.opB.slice(0, 8));
  for (const id of ['b_account', 'a_account', 'b_agent_source', 'b_agent_selected', 'b_model', 'b_tool_offering', 'b_approval_event', 'a_approval_event',
    'advice_instruction_order', `preflight_${advice}`, `worker_workdir_${advice}`, `held_call_${host.state.exchanges[0].workerId.slice(0, 8)}`, 'a_progress',
    'b_progress', 'a_answered_journal', 'b_served_journal', 'a_answer', 'advice_bounds', 'advice_worker_stop', 'capture_files', 'capture_receipt',
    'capture_publisher', 'a_journal_unchanged', 'cancel_instruction_order', `preflight_${cancel}`, 'cancellation', 'no_late_revival', 'cancelled_worker_stop',
    'cancel_bounds', 'final_b_stop', 'final_a_stop', 'retained_matches_live', 'human_reread']) {
    assert.equal(checkOf(report, id)?.status, 'passed', id);
  }

  // Each main's client: normal mode, the logged-in user, its role's bound base directory, its own workspace, and only the bound environment.
  const values = result.scope.values.environment.values;
  for (const side of /** @type {const} */ (['b', 'a'])) {
    const options = host.state.clientOptions[side];
    assert.deepEqual(Object.keys(options).sort(), ['baseDirectory', 'connection', 'mode', 'useLoggedInUser', 'workingDirectory'], `${side}: no token or logging override`);
    assert.deepEqual([options.mode, options.useLoggedInUser, options.baseDirectory, options.workingDirectory],
      ['copilot-cli', true, f.bases[side], layout[side].workspace], side);
    assert.deepEqual(options.connection, { kind: 'stdio', path: f.cli, args: [], env: { ...values, LOGONSERVER: '', SYSTEMDRIVE: '', USERDOMAIN: '', USERNAME: '',
      TEMP: layout[side].temp, TMP: layout[side].temp, TMPDIR: layout[side].temp } }, `${side}: the bound selection, never the credential stand-in`);
  }
  assert.deepEqual(Object.keys(host.state.modes), ['b', 'a'], 'no control runtime');

  // Both accounts of a main before its first prompt and again before every later one, each pair right before its own prompt.
  const log = host.state.log.filter((entry) => /^(?:getAuthStatus|gitHubAuth|send) [ab]$/.test(entry));
  for (const side of ['a', 'b']) {
    const own = log.filter((entry) => entry.endsWith(` ${side}`));
    const sends = own.filter((entry) => entry.startsWith('send')).length;
    assert.deepEqual(own, [`getAuthStatus ${side}`, `gitHubAuth ${side}`, ...Array.from({ length: sends }, () => [`getAuthStatus ${side}`, `gitHubAuth ${side}`,
      `send ${side}`]).flat()], `${side}: a pair at session creation, then a pair right before each prompt`);
  }
  assert.deepEqual([report.accounts.b.rechecks, report.accounts.a.rechecks], [4, 5], 'B\'s four prompts and A\'s five');
  assert.deepEqual(report.accounts.b.session, { isAuthenticated: true, authType: 'user', host: 'https://github.com', login: 'fixture-b' });
  const text = JSON.stringify(report);
  for (const hidden of ['hidden status text', 'hidden plan', 'fixture-credential-never-read', 'fixture-user-never-read']) {
    assert.equal(text.includes(hidden), false, `the report keeps no ${hidden}`);
  }

  // The worker's bounded stop is read from B's journal; every cessation stays unconfirmed, and everything is kept.
  assert.deepEqual(report.operations.advice.workerCleanup, { stop: 'clean', stopErrors: 0, forceStop: 'not_needed', storage: 'retained',
    retainedPath: path.join(layout.b.temp, 'dude-a2a-w-Fx0'), cessation: 'unconfirmed' });
  assert.equal(report.cancellation.workerCleanup.cessation, 'unconfirmed');
  assert.deepEqual([report.cleanup.cessation, report.cleanup.stops.map((/** @type {any} */ entry) => [entry.side, entry.stop, entry.forced])],
    ['unconfirmed', [['b', 'clean', 'not_needed'], ['a', 'clean', 'not_needed']]]);
  assert.match(checkOf(report, 'final_a_stop').detail, /process-tree cessation unconfirmed$/);
  assert.deepEqual(releases(layout), ['evidence-release.json', 'startup-release.json', 'startup-release.json'], 'one evidence release; the cancelled worker never got one');
  assert.deepEqual(fs.readdirSync(layout.fixture).filter((name) => !name.endsWith('-release.json')), ['manifest.json'], 'no canary source exists');
  assert.equal(fs.existsSync(layout.control.root), false, 'no control root');
  assert.equal(report.capture.ideaPath, `.dude/ideas/102-${f.plan.capture.slug}.md`);
});

test('a version-3 main whose own runtime or actual session cannot show its expected account stops before any prompt, with its closed reason, and is still stopped', async () => {
  /** @type {Array<[string, string, 'runtime' | 'session', (status: any) => unknown, string]>} */
  const cases = [
    ['A\'s session without an account answer', 'a', 'session', () => undefined, 'auth_unavailable'],
    ['B\'s runtime unauthenticated', 'b', 'runtime', (status) => ({ ...status, isAuthenticated: false }), 'auth_required'],
    ['B\'s session signed in as someone else', 'b', 'session', (status) => ({ ...status, login: 'someone-else' }), 'auth_mismatch'],
    ['A\'s runtime on an environment token', 'a', 'runtime', (status) => ({ ...status, authType: 'env' }), 'auth_mismatch'],
    ['A\'s runtime account call throwing', 'a', 'runtime', () => { throw new Error('raw failure text that must never be kept'); }, 'auth_unavailable'],
    ['A\'s session naming a bare host', 'a', 'session', (status) => ({ ...status, host: 'github.com' }), 'auth_unavailable'],
  ];
  for (const [label, side, source, answer, reason] of cases) {
    const { result, host } = await sliceV3({ approvals: [], host: { normal: { account: (who, from, _count, status) => (who === side && from === source
      ? answer(status) : status) } } });
    const { report } = result;
    assert.equal(report.reason, reason, `${label}: ${report.detail}`);
    assert.deepEqual(failedChecks(report), [`${side}_account`], label);
    assert.deepEqual(host.state.prompts, [], `${label}: no prompt reached either main`);
    assert.deepEqual(phaseList(report).at(-1), ['start_mains', 'failed'], label);
    assert.ok(host.state.log.includes(`stop ${side}`), `${label}: the started client was still stopped`);
    assert.equal(JSON.stringify(report).includes('raw failure text'), false, `${label}: no raw error is kept`);
    assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4], label);
  }
});

test('a version-3 main reads its tool offering only once its own session\'s tools are initialized: on a host whose catalog lists nothing until then, as the pinned SDK documents, each main initializes right before its one catalog read, and both dude tools are offered', async () => {
  // Every other input is valid: a main that reads its catalog before initializing it stops in start_mains as tool_offering_mismatch,
  // with 0 tools offered, before any prompt.
  const { result, host } = await sliceV3({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'] });
  const { report } = result;
  assert.equal(report.reason, null, report.detail);
  assert.deepEqual(failedChecks(report), []);
  for (const side of ['b', 'a']) assert.equal(checkOf(report, `${side}_tool_offering`)?.detail, '3 tools offered', side);
  assert.deepEqual(host.state.log.filter((entry) => entry.startsWith('tools.')), ['tools.initializeAndValidate b', 'tools.getCurrentMetadata b',
    'tools.initializeAndValidate a', 'tools.getCurrentMetadata a'], 'each main initializes its own session\'s tools once, right before its one catalog read');
});

test('a version-3 account change before a later prompt stops the run right there: the capture prompt is never sent, though the advice exchange finished', async () => {
  // A's session answers five times: at its creation, before its proposal, its approval, its exchange, and its capture prompt.
  const { result, host } = await sliceV3({ answers: ['approve-once', 'approve-once'],
    host: { normal: { account: (side, source, count, status) => (side === 'a' && source === 'session' && count === 5 ? { ...status, login: 'someone-else' } : status) } } });
  const { report } = result;
  assert.equal(report.reason, 'auth_mismatch', report.detail);
  assert.deepEqual(failedChecks(report), ['a_account_recheck']);
  assert.deepEqual(phaseList(report).slice(-2), [['advice_exchange', 'passed'], ['capture', 'failed']]);
  assert.equal(host.state.prompts.some((entry) => entry.prompt.startsWith('Feature 089 native qualification, capture step.')), false, 'no capture prompt');
  const failedAnswer = host.state.log.lastIndexOf('gitHubAuth a');
  assert.notEqual(host.state.log[failedAnswer + 1], 'send a', 'nothing was sent after the failed answer');
  assert.deepEqual(report.accounts.a.rechecks, 3, 'the passing rechecks before it are counted, never shown as checks');
  assert.equal(checkOf(report, 'final_a_stop')?.status, 'passed', 'owned shutdown still ran');
});

test('a version-3 account answer held past the consented scope\'s expiry, or past its own 60-second bound, is never used: though A\'s session then reports exactly its expected account, the run stops right there, as expired or as auth_unavailable, and the capture prompt is never sent', async () => {
  /**
   * A's session answers its fifth check, the one before its capture prompt, with exactly its expected account, but in a later turn
   * of the event loop and only once the run's clock moved on by `advance(time, f)`, before any poll of that clock.
   * @param {(time: any, f: any) => number} advance
   */
  const heldA = (advance) => (/** @type {any} */ time, /** @type {any} */ f) => ({ normal: { account: (/** @type {string} */ side,
    /** @type {string} */ source, /** @type {number} */ count, /** @type {any} */ status) => (side === 'a' && source === 'session' && count === 5
    ? new Promise((resolve) => { setImmediate(() => { time.advance(advance(time, f)); resolve(status); }); }) : status) } });
  const [expired, overdue] = await Promise.all([
    // A half-minute scope ends during the hold, inside the call's own 60-second bound.
    sliceV3({ expiresInMs: 30_000, answers: ['approve-once', 'approve-once'],
      host: heldA((/** @type {any} */ time, /** @type {any} */ f) => Date.parse(f.plan.expiresAt) - time.now() + 1) }),
    // The call's own bound ends during the hold, well inside the scope's hour.
    sliceV3({ answers: ['approve-once', 'approve-once'], host: heldA(() => NATIVE_LIMITS.runtimeMs + 1) }),
  ]);

  assert.equal(expired.result.report.reason, 'scope_expired', expired.result.report.detail);
  assert.match(expired.result.report.detail, /^the consented scope expired before a's session account status /, 'stopped where the held answer settled');
  assert.deepEqual(failedChecks(expired.result.report), [], 'an expired scope is the run\'s reason, never an account check');

  assert.equal(overdue.result.report.reason, 'auth_unavailable', overdue.result.report.detail);
  assert.equal(overdue.result.report.detail, 'a\'s session account status did not answer (it answered after its deadline; the answer is discarded)');
  assert.deepEqual(failedChecks(overdue.result.report), ['a_account_recheck']);
  assert.equal(checkOf(overdue.result.report, 'a_account_recheck').detail, 'session: no usable account status');

  for (const [label, { result, host }] of /** @type {Array<[string, any]>} */ ([['expired', expired], ['overdue', overdue]])) {
    const { report } = result;
    assert.deepEqual(phaseList(report).slice(-2), [['advice_exchange', 'passed'], ['capture', 'failed']], label);
    const log = /** @type {string[]} */ (host.state.log);
    assert.equal(log.filter((entry) => entry === 'gitHubAuth a').length, 5, `${label}: the held answer was A's fifth`);
    assert.equal(log.slice(log.lastIndexOf('gitHubAuth a')).includes('send a'), false, `${label}: nothing was sent to A after the held answer`);
    assert.equal(host.state.prompts.some((/** @type {any} */ entry) => entry.prompt.startsWith('Feature 089 native qualification, capture step.')), false,
      `${label}: no capture prompt`);
    assert.equal(report.accounts.a.rechecks, 3, `${label}: the held answer was never counted as a passing recheck`);
    assert.equal(checkOf(report, 'final_a_stop')?.status, 'passed', `${label}: owned shutdown still ran`);
    assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4], label);
  }
});

test('a version-3 account answer held while the run is being closed is never used: B\'s own check fails before the advice exchange while A\'s session answer is held, and A\'s answer, exactly its expected account and released only as A is stopped, sends nothing', async () => {
  const aHeld = deferred();
  const aRelease = deferred();
  const { result, host, layout } = await sliceV3({ host: { normal: {
    // Each side's fourth session check guards its advice instruction: A's is held, and B's fails once A's is held.
    account: (side, source, count, status) => {
      if (side === 'a' && source === 'session' && count === 4) {
        aHeld.resolve(true);
        return aRelease.promise.then(() => status);
      }
      return side === 'b' && source === 'session' && count === 4 ? aHeld.promise.then(() => ({ ...status, login: 'someone-else' })) : status;
    },
    stop: (side) => {
      if (side === 'a') aRelease.resolve(true);
      return [];
    },
  } } });
  // Whatever the released answer could still start runs before the log is read.
  await new Promise((resolve) => { setImmediate(resolve); });
  const { report } = result;
  assert.equal(report.reason, 'auth_mismatch', report.detail);
  assert.deepEqual(failedChecks(report), ['b_account_recheck']);
  assert.deepEqual(phaseList(report).at(-1), ['advice_exchange', 'failed']);
  assert.deepEqual([aHeld.settled, aRelease.settled], [true, true], 'A\'s answer was held, then released as A was stopped');
  const log = host.state.log;
  const held = log.lastIndexOf('gitHubAuth a');
  assert.equal(log.filter((entry) => entry === 'gitHubAuth a').length, 4, 'the held answer was A\'s fourth');
  assert.ok(log.indexOf('stop a') > held, 'A was stopped while its answer was held');
  assert.equal(log.slice(held).includes('send a'), false, 'nothing was sent to A after its held answer');
  assert.equal(host.state.prompts.some((entry) => entry.prompt.startsWith('Feature 089 native qualification. Do every step')), false,
    'no exchange instruction reached either main');
  assert.deepEqual([report.accounts.a.rechecks, report.accounts.b.rechecks], [2, 2], 'neither fourth check was counted as passing');
  assert.deepEqual(releases(layout), [], 'no release was written');
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('a version-3 basis that drifts while B\'s first account answer is held still stops the run before A\'s runtime starts: B\'s answer is exactly its expected account, and no prompt reaches either main', async () => {
  const { result, host } = await sliceV3({ approvals: [], host: (/** @type {any} */ _time, /** @type {any} */ f) => ({ normal: {
    account: (/** @type {string} */ side, /** @type {string} */ source, /** @type {number} */ count, /** @type {any} */ status) => (side === 'b'
      && source === 'session' && count === 1
      // While B's first session check is held, a selected value this process holds changes.
      ? new Promise((resolve) => { setImmediate(() => { f.environment.APPDATA = path.join(f.base, 'other-app-data'); resolve(status); }); })
      : status),
  } }) });
  const { report } = result;
  assert.equal(report.reason, 'scope_stale', report.detail);
  assert.equal(checkOf(report, 'b_account')?.status, 'passed', 'B\'s held answer was exactly its expected account');
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(phaseList(report).at(-1), ['start_mains', 'failed']);
  assert.deepEqual(Object.keys(host.state.modes), ['b'], 'A\'s runtime was never constructed');
  assert.deepEqual(host.state.prompts, [], 'no prompt reached either main');
  assert.ok(host.state.log.includes('stop b'), 'B was still stopped');
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('a version-3 served worker must record the normal worker\'s version-2 readiness: a strict record, another account, or another working folder refuses before any release', async () => {
  /** @type {Array<[string, (preflight: any) => void, string[]]>} */
  const cases = [
    ['a strict version-1 record', (preflight) => {
      delete preflight.auth;
      Object.assign(preflight, { version: 1, qualification: { ...preflight.qualification, version: 1, canaries: 17, canaryBytes: 1 },
        sessionStorage: { kind: 'none', metadataSessionId: preflight.sessionId }, probes: PROBES,
        ambient: { instructionSources: 0, skills: 0, enabledSkills: 0, mcpServers: 0, extensions: 0, customAgents: 0, selectedAgent: false } });
    }, ['keys', 'version', 'qualification', 'auth', 'sessionStorage']],
    ['another worker account', (preflight) => { preflight.auth.runtime.login = 'someone-else'; }, ['auth.runtime']],
    ['strict placeholders beside the normal record', (preflight) => { preflight.probes = PROBES; }, ['keys']],
    ['another working folder', (preflight) => { preflight.sessionStorage.workingDirectory = path.join(preflight.storage, 'temp'); }, ['sessionStorage']],
  ];
  for (const [label, change, problems] of cases) {
    const { result, host, layout } = await sliceV3({ host: { preflight: change } });
    const { report } = result;
    assert.equal(report.reason, 'preflight_mismatch', `${label}: ${report.detail}`);
    const operation = host.state.exchanges[0].opB.slice(0, 8);
    assert.deepEqual(failedChecks(report), [`preflight_${operation}`], label);
    assert.deepEqual(checkOf(report, `preflight_${operation}`).detail.split(', '), problems, label);
    assert.deepEqual(releases(layout), [], `${label}: no release; the worker never got its prompt`);
    assert.equal(fs.existsSync(path.join(layout.a.workspace, PROGRESS_FIXTURES.a.path)), false, `${label}: no progress fixture appeared`);
  }
});

test('a version-3 run that stops because B\'s worker ended names the journaled worker outcome, reason, and closed trigger in its stop detail, and nothing that is not closed', async () => {
  /** @param {Record<string, unknown>} fields */
  const finished = (fields) => ({ delivery: 'possibly_sent', answer: null, observations: [], permissionDenials: {}, ...fields });
  /** @type {Array<[string, Record<string, unknown> | null, string]>} */
  const cases = [
    ['an unexpected native effect, recorded as the live run recorded it, with its trigger',
      finished({ outcome: 'failed', reason: 'unexpected_native_effect', detail: 'session.mcp_server_status_changed' }),
      '; its worker ended failed (unexpected_native_effect, session.mcp_server_status_changed)'],
    ['a trigger outside the closed list, which is left out',
      finished({ outcome: 'failed', reason: 'unexpected_native_effect', detail: 'C:\\owner\\leaked-path.txt' }), '; its worker ended failed (unexpected_native_effect)'],
    ['an outcome and reason that are not closed tokens', finished({ outcome: 'Failed Hard', reason: 'raw error text: leaked', detail: null }),
      '; its worker ended unknown (unknown)'],
    ['no worker_finished record at all', null, ''],
  ];
  for (const [label, record, ending] of cases) {
    const { result, layout } = await sliceV3({ host: { workerEnds: { finished: record } } });
    const { report } = result;
    assert.equal(report.reason, 'worker_refused', `${label}: ${report.detail}`);
    assert.equal(report.detail, `the operation ended failed (worker_failed) before worker_evidence_pending${ending}`, label);
    assert.deepEqual(phaseList(report).at(-1), ['advice_exchange', 'failed'], label);
    assert.equal(/leaked/.test(JSON.stringify(report)), false, `${label}: nothing outside the closed values reaches the report`);
    assert.deepEqual(releases(layout), ['startup-release.json'], `${label}: only the startup release; no evidence release`);
    assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4], label);
  }
});

test('version-3 stop errors never turn green: a worker whose recorded stop erred fails before capture, and a main whose own stop erred fails the run after force-stop, with cessation still unconfirmed', async () => {
  const worker = await sliceV3({ answers: ['approve-once', 'approve-once'], host: { normal: { cleanup: (data, ex) => {
    if (ex.kind === 'advice') Object.assign(data, { stop: 'errors', stopErrors: 1, forceStop: 'completed' });
  } } } });
  assert.equal(worker.result.report.reason, 'stop_failed', worker.result.report.detail);
  assert.deepEqual(failedChecks(worker.result.report), ['advice_worker_stop']);
  assert.equal(checkOf(worker.result.report, 'advice_worker_stop').detail, 'stop, forceStop');
  assert.equal(worker.host.state.prompts.some((entry) => entry.prompt.startsWith('Feature 089 native qualification, capture step.')), false, 'no capture followed');
  assert.equal(worker.result.report.operations.advice.workerCleanup.cessation, 'unconfirmed');

  const main = await sliceV3({ answers: ['approve-once', 'approve-once', 'approve-once'],
    host: { normal: { stop: (side) => (side === 'a' ? [new Error('stop failed')] : []) } } });
  const { report } = main.result;
  assert.equal(report.reason, 'stop_failed', report.detail);
  assert.deepEqual(failedChecks(report), ['final_a_stop']);
  assert.match(checkOf(report, 'final_a_stop').detail, /^stop errors, 1 errors, force-stop completed; process-tree cessation unconfirmed$/);
  assert.ok(main.host.state.log.includes('forceStop a'), 'the approved force-stop ran only for the stop that erred');
  assert.equal(main.host.state.log.includes('forceStop b'), false);
  assert.deepEqual(phaseList(report).slice(-1), [['teardown', 'failed']], 'nothing ran after teardown failed');
  assert.deepEqual([report.cleanup.cessation, report.verdict, main.result.exitCode], ['unconfirmed', 'controlled_only', 4]);
});

test('a version-3 main stop passes only when it answered within its own half of the shared cleanup budget: A\'s stop reporting no errors 6 seconds, or 10,001 ms, after teardown began fails the run as stop_failed before the retained reread, with no further cleanup attempt, cessation unconfirmed, and storage kept, while one answering after 4 seconds passes', async (context) => {
  /**
   * A's own stop reports no errors `ms` after it was asked, on the run's clock: its answer comes in a later turn of the event loop
   * than B's, which answers at once, and before any poll of the clock, exactly as a stop whose answer arrives late.
   * @param {number} ms
   */
  const slowA = (ms) => (/** @type {any} */ time) => ({ normal: { stop: (/** @type {string} */ side) => (side === 'a'
    ? new Promise((resolve) => { setImmediate(() => { time.advance(ms); resolve([]); }); }) : []) } });
  // Every companion input is valid, the retained reread's acknowledgement included, so only the stop's timing can fail the run.
  const answers = ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'];
  const [late, beyond, onTime] = await Promise.all([6_000, 10_001, 4_000].map((ms) => sliceV3({ answers, host: slowA(ms) })));
  /** @type {Array<[string, any, number]>} */
  const runs = [['6 seconds', late, 6_000], ['10,001 ms', beyond, 10_001], ['4 seconds', onTime, 4_000]];
  for (const [label, { result }] of runs) {
    const { report } = result;
    context.diagnostic(`${label}: A's stop ended ${report.cleanup?.stops?.find((/** @type {any} */ entry) => entry.side === 'a')?.elapsedMs} ms after teardown `
      + `began; reason ${report.reason}; final_a_stop ${checkOf(report, 'final_a_stop')?.status}; phases ${phaseList(report).slice(-2).map(([id, status]) => `${id}:${status}`).join(' ')}`);
  }

  for (const [label, { result, host, terminal, f }, ms] of runs.slice(0, 2)) {
    const { report } = result;
    assert.equal(report.reason, 'stop_failed', `${label}: ${report.detail}; phases ${phaseList(report).map(([id, status]) => `${id}:${status}`).join(' ')}; `
      + `failed checks: ${failedChecks(report).join(', ') || 'none'}`);
    assert.deepEqual(failedChecks(report), ['final_a_stop'], label);
    const detail = checkOf(report, 'final_a_stop').detail;
    const answered = /^stop clean, 0 errors, force-stop not_needed, answered (\d+) ms after teardown began, past its 5000 ms stop deadline; process-tree cessation unconfirmed$/
      .exec(detail);
    assert.ok(answered && Number(answered[1]) >= ms, `${label}: ${detail}`);
    assert.equal(checkOf(report, 'final_b_stop')?.status, 'passed', `${label}: B's stop answered at once`);
    const stops = Object.fromEntries(report.cleanup.stops.map((/** @type {any} */ entry) => [entry.side, entry]));
    assert.deepEqual([stops.a.stop, stops.a.errors, stops.a.forced, stops.a.elapsedMs], ['clean', 0, 'not_needed', Number(answered?.[1])],
      `${label}: the SDK's own answer is kept as it came, beside when it came`);
    assert.ok(stops.b.elapsedMs <= NATIVE_LIMITS.cleanupMs / 2, `${label}: B's stop ended ${stops.b.elapsedMs} ms after teardown began`);
    assert.deepEqual(['stop a', 'stop b', 'forceStop a', 'forceStop b'].map((entry) => host.state.log.filter((line) => line === entry).length), [1, 1, 0, 0],
      `${label}: each client was stopped once, and no cleanup attempt beyond the approved ones ran`);
    assert.deepEqual(phaseList(report).slice(-2), [['cancel_exchange', 'passed'], ['teardown', 'failed']], `${label}: nothing ran after teardown failed`);
    assert.equal(report.retained, null, `${label}: no retained reread`);
    assert.equal(blocksFor(terminal.text, 'reread reviewed'), 0, `${label}: the human was never asked to compare retained journals`);
    assert.deepEqual([report.cleanup.cessation, report.cleanup.retained], ['unconfirmed', 'all run and normal runtime storage and logs are kept; nothing was killed '
      + 'or deleted'], label);
    for (const role of ['a', 'b', 'worker']) assert.equal(unchanged(f.bases[role]), true, `${label}: ${role}'s base directory is kept`);
    assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4], label);
  }

  const { report } = onTime.result;
  assert.equal(report.reason, null, report.detail);
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(phaseList(report).slice(-2), [['teardown', 'passed'], ['retained_reread', 'passed']]);
  assert.equal(checkOf(report, 'final_a_stop').detail, 'stop clean, 0 errors, force-stop not_needed; process-tree cessation unconfirmed');
  const a = report.cleanup.stops.find((/** @type {any} */ entry) => entry.side === 'a');
  assert.ok(a.elapsedMs >= 4_000 && a.elapsedMs <= NATIVE_LIMITS.cleanupMs / 2, `A's stop ended ${a.elapsedMs} ms after teardown began`);
  assert.deepEqual([report.verdict, onTime.result.exitCode], ['controlled_only', 4], 'a controlled run is never collaboration_qualified');
});

test('the version-3 basis is rechecked before each runtime starts: a selected value or a base directory that changed after consent stops the run before that runtime exists', async () => {
  const drifted = await sliceV3({ approvals: [], adapters: (f) => ({ environment: { ...f.environment, APPDATA: path.join(f.base, 'other-app-data') } }) });
  assert.equal(drifted.result.report.reason, 'scope_stale', drifted.result.report.detail);
  assert.deepEqual(Object.keys(drifted.host.state.modes), [], 'no client was constructed');
  assert.deepEqual(phaseList(drifted.result.report).at(-1), ['start_mains', 'failed']);

  const moved = await sliceV3({ approvals: [], adapters: (f) => ({ rescope: () => {
    const again = nativeScope({ file: f.planFile, repoRoot: path.join(f.base, 'not-the-repository'), environment: f.environment, platform: 'win32' });
    // After the post-consent revalidation and before A's runtime starts, A's base directory is replaced by a link to B's.
    fs.rmSync(f.bases.a, { recursive: true });
    fs.symlinkSync(f.bases.b, f.bases.a, 'junction');
    return again;
  } }) });
  assert.equal(moved.result.report.reason, 'scope_stale', moved.result.report.detail);
  assert.deepEqual(Object.keys(moved.host.state.modes), ['b'], 'B started on its unchanged basis; A never did');
  assert.ok(moved.host.state.log.includes('stop b'), 'B was still stopped');
  assert.equal(unchanged(moved.f.bases.b), true);
});

/** Whether a directory still exists as a plain directory. @param {string} directory */
function unchanged(directory) {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  return Boolean(stat?.isDirectory() && !stat.isSymbolicLink());
}

// ---------------------------------------------------------------------------
// Dude's own tools under the typed consent. In normal mode the native runtime
// asks permission for an extension tool that does not skip it, and neither
// dude_a2a_propose nor dude_a2a_conversation does: native run
// e3689559-574d-4b1c-a851-7281de20df9a refused B's proposal call without a
// rule as not_model_requested and stopped as proposal_unavailable. The main
// relay approves only the current step's exact calls, never asking.
// ---------------------------------------------------------------------------

/** The fixed question an asking main is told to pass, read from its own instruction as its model reads it. */
const ASKED_QUESTION = /** @type {string} */ (/"question":"([^"]+)"/.exec(exchangePrompt('ask', { slug: 'delta', progressFile: 'progress-a.txt' }))?.[1]);

test('custom-tool relay: matchPermission relays only the current step\'s exact calls of Dude\'s own tools, after the session, request, and sandbox checks, and refuses every other tool, operation, or argument, and every other kind keeps its own rule', () => {
  const invocation = { sessionId: 's-a' };
  const configPath = path.join(os.tmpdir(), 'dude-nq-relay', 'a', 'a2a.json');
  const operationId = randomUUID();
  // Each step's allowance as the run sets it right after that step's instruction is admitted, here as adm-1.
  const steps = {
    proposal: { admission: 'adm-1', propose: { configPath, profileId: 'a' }, conversation: null },
    receive: { admission: 'adm-1', propose: null, conversation: { ops: ['begin_receive', 'read'], slug: null } },
    ask: { admission: 'adm-1', propose: null, conversation: { ops: ['begin_ask', 'read'], slug: 'delta' } },
    askCancel: { admission: 'adm-1', propose: null, conversation: { ops: ['begin_ask', 'cancel', 'read'], slug: 'delta-cancel' } },
  };
  /** @param {string} toolName @param {unknown} args @param {Record<string, unknown>} [extra] */
  const call = (toolName, args, extra = {}) => ({ kind: 'custom-tool', toolCallId: 'c1', toolName, toolDescription: 'x', args, ...extra });
  /** @param {Record<string, unknown>} args */
  const conversation = (args) => call('dude_a2a_conversation', args);
  /** @param {unknown} slug @param {unknown} [tentativeNumber] @param {unknown} [question] */
  const begin = (slug, tentativeNumber = 101, question = ASKED_QUESTION) => conversation({ op: 'begin_ask', slug, tentativeNumber, question });
  const propose = call('dude_a2a_propose', { configPath, profileId: 'a' });
  const read = { op: 'read', operationId };
  /** @param {any} request @param {any} tools @param {any} [where] */
  const decide = (request, tools, where = invocation) => {
    const decision = /** @type {any} */ (matchPermission(request, where, { sessionId: 's-a', requested: ['c1'], phase: 'closed', admission: null,
      progress: null, capture: null, tools }));
    return decision.ask ? 'ask' : decision.relay ? `relay ${decision.relay}` : decision.reason;
  };
  assert.equal(ASKED_QUESTION, 'Which is the highest lifecycle number in your approved records?');
  for (const [label, request, tools, expected, where] of /** @type {Array<[string, any, any, string, any?]>} */ ([
    ['the proposal call', propose, steps.proposal, 'relay dude_a2a_propose'],
    ['B begins receiving', conversation({ op: 'begin_receive' }), steps.receive, 'relay dude_a2a_conversation.begin_receive'],
    ['B reads', conversation(read), steps.receive, 'relay dude_a2a_conversation.read'],
    ['A asks for the plan slug', begin('delta'), steps.ask, 'relay dude_a2a_conversation.begin_ask'],
    ['A reads', conversation(read), steps.ask, 'relay dude_a2a_conversation.read'],
    ['A asks for the cancel slug', begin('delta-cancel', 7), steps.askCancel, 'relay dude_a2a_conversation.begin_ask'],
    ['A cancels', conversation({ op: 'cancel', operationId }), steps.askCancel, 'relay dude_a2a_conversation.cancel'],
    ['A reads after cancelling', conversation(read), steps.askCancel, 'relay dude_a2a_conversation.read'],
    // The existing checks come first.
    ['another session', propose, steps.proposal, 'session_mismatch', { sessionId: 's-b' }],
    ['no call ID', call('dude_a2a_propose', { configPath, profileId: 'a' }, { toolCallId: undefined }), steps.proposal, 'unidentified'],
    ['a call the model did not request for this admission', call('dude_a2a_propose', { configPath, profileId: 'a' }, { toolCallId: 'c9' }), steps.proposal,
      'not_model_requested'],
    ['a sandbox bypass', call('dude_a2a_propose', { configPath, profileId: 'a' }, { requestSandboxBypass: true }), steps.proposal, 'sandbox_bypass'],
    // Managed policy that requires a human response forbids a host's own approval, so the relay refuses rather than approves or asks.
    ['a managed-policy marker on the request', call('dude_a2a_propose', { configPath, profileId: 'a' }, { managedApprovalRequired: true }), steps.proposal,
      'managed_approval_required'],
    ['a managed-policy marker on its prompt', propose, steps.proposal, 'managed_approval_required',
      { sessionId: 's-a', promptRequest: { kind: 'custom-tool', toolName: 'dude_a2a_propose', toolDescription: 'x', managedApprovalRequired: true } }],
    // No step, another tool, or the other step's tool.
    ['no step allows a Dude tool call', propose, null, 'tool_not_allowed'],
    ['another Dude tool', call('dude_a2a_reply', { conclusion: 'x' }), steps.receive, 'tool_not_allowed'],
    ['another extension tool', call('other_tool', { configPath, profileId: 'a' }), steps.proposal, 'tool_not_allowed'],
    ['the proposal tool in an exchange', propose, steps.receive, 'tool_not_allowed'],
    ['the conversation tool in the proposal step', conversation(read), steps.proposal, 'tool_not_allowed'],
    // Wrong arguments for the proposal.
    ['another configuration', call('dude_a2a_propose', { configPath: `${configPath}.other`, profileId: 'a' }), steps.proposal, 'tool_args_not_allowed'],
    ['the configuration in another letter case', call('dude_a2a_propose', { configPath: configPath.toUpperCase(), profileId: 'a' }), steps.proposal,
      'tool_args_not_allowed'],
    ['another profile', call('dude_a2a_propose', { configPath, profileId: 'b' }), steps.proposal, 'tool_args_not_allowed'],
    ['an extra argument', call('dude_a2a_propose', { configPath, profileId: 'a', extra: true }), steps.proposal, 'tool_args_not_allowed'],
    ['no arguments', call('dude_a2a_propose', undefined), steps.proposal, 'tool_args_not_allowed'],
    // Another operation than the step allows that side.
    ['A cancelling in the advice exchange', conversation({ op: 'cancel', operationId }), steps.ask, 'tool_op_not_allowed'],
    ['A receiving', conversation({ op: 'begin_receive' }), steps.ask, 'tool_op_not_allowed'],
    ['B asking', begin('delta'), steps.receive, 'tool_op_not_allowed'],
    ['B cancelling', conversation({ op: 'cancel', operationId }), steps.receive, 'tool_op_not_allowed'],
    ['an unknown operation', conversation({ op: 'list' }), steps.receive, 'tool_op_not_allowed'],
    ['an inherited property name as the operation', conversation({ op: 'constructor' }), steps.receive, 'tool_op_not_allowed'],
    ['no operation', conversation({ operationId }), steps.receive, 'tool_op_not_allowed'],
    ['arguments that are not an object', call('dude_a2a_conversation', 'read'), steps.receive, 'tool_op_not_allowed'],
    // Wrong slug, question, or tentative number.
    ['the cancel slug in the advice exchange', begin('delta-cancel'), steps.ask, 'tool_args_not_allowed'],
    ['the plan slug in the cancel exchange', begin('delta'), steps.askCancel, 'tool_args_not_allowed'],
    ['another question', begin('delta', 101, 'What is the highest number you have?'), steps.ask, 'tool_args_not_allowed'],
    ['a fractional tentative number', begin('delta', 101.5), steps.ask, 'tool_args_not_allowed'],
    ['a tentative number as text', begin('delta', '101'), steps.ask, 'tool_args_not_allowed'],
    ['an unsafe tentative number', begin('delta', 2 ** 53), steps.ask, 'tool_args_not_allowed'],
    ['no tentative number', conversation({ op: 'begin_ask', slug: 'delta', question: ASKED_QUESTION }), steps.ask, 'tool_args_not_allowed'],
    // Exactly the operation's own fields, and a well-formed operation ID; the product checks which operation it names.
    ['a begin with an operation ID', conversation({ op: 'begin_receive', operationId }), steps.receive, 'tool_args_not_allowed'],
    ['a read with another field', conversation({ ...read, slug: 'delta' }), steps.ask, 'tool_args_not_allowed'],
    ['a malformed operation ID', conversation({ op: 'read', operationId: 'not-an-operation' }), steps.receive, 'tool_args_not_allowed'],
    ['an operation ID in upper case', conversation({ op: 'read', operationId: operationId.toUpperCase() }), steps.receive, 'tool_args_not_allowed'],
    ['a read without an operation ID', conversation({ op: 'read' }), steps.receive, 'tool_args_not_allowed'],
    ['a numeric operation ID', conversation({ op: 'cancel', operationId: 1 }), steps.askCancel, 'tool_args_not_allowed'],
  ])) {
    assert.equal(decide(request, tools, where), expected, label);
  }
  // An allowance never reaches another kind: a read, or an MCP tool named like Dude's, keeps its own rule (no open phase here).
  assert.equal(decide({ kind: 'read', toolCallId: 'c1', path: configPath }, steps.proposal), 'not_pending');
  assert.equal(decide({ kind: 'mcp', toolCallId: 'c1', serverName: 'dude', toolName: 'dude_a2a_conversation', toolTitle: 'x', args: read }, steps.receive),
    'not_pending');
});

test('custom-tool relay: the main relay approves the current step\'s exact call once, without asking or an interactive claim, and only counts it per side; it refuses a call another admission requested, a call after its step\'s turn ended, a completed call, and any call of a closing, unconsented, or expired run, while every other kind still needs a typed approve-once', async () => {
  const root = tempDir('dude-nqt-');
  const file = path.join(root, 'w', 'progress-b.txt');
  /** @param {{consent?: string, expiresInMs?: number, answers?: any[]}} [options] */
  const relay = ({ consent = 'granted', expiresInMs = 3_600_000, answers = [] } = {}) => {
    const clock = testClock();
    const terminal = fakeTerminal(answers);
    const log = createSessionLog('b', clock.now);
    // B's exchange step, admitted as adm-1: begin receiving and read.
    const tools = { admission: 'adm-1', propose: null, conversation: { ops: ['begin_receive', 'read'], slug: null } };
    const run = { clock: clock.now, expiresAtMs: clock.now() + expiresInMs, closing: false, report: /** @type {any} */ ({ consent: { status: consent } }),
      allow: /** @type {Record<string, any>} */ ({ b: { sessionId: 's-b', phase: 'closed', admission: null, progress: null, capture: null, tools } }),
      human: humanQueue(terminal, clock.now), clients: [{ side: 'b', log }] };
    /** @param {string} id @param {string} name @param {unknown} args @param {string} [origin] */
    const requested = (id, name, args, origin = 'adm-1') => log.onEvent({ type: 'assistant.message', timestamp: new Date(clock.now()).toISOString(),
      data: { messageId: `m-${id}`, originatingMessageId: origin, content: '', toolRequests: [{ toolCallId: id, name, arguments: args }] } });
    /** @param {string} id @param {unknown} args @param {Record<string, unknown>} [extra] */
    const call = (id, args, extra = {}) => ({ kind: 'custom-tool', toolCallId: id, toolName: 'dude_a2a_conversation', toolDescription: 'x', args, ...extra });
    return { run, log, clock, terminal, tools, requested, call, ask: permissionRelay(run, 'b', log) };
  };
  const where = { sessionId: 's-b' };
  const read = { op: 'read', operationId: randomUUID() };
  /** @param {string} reason */
  const refusal = (reason) => [{ side: 'b', kind: 'custom-tool', asked: false, reason, answer: null, target: 'dude_a2a_conversation' }];

  // Each exact call is approved once, as the relay's own answer: never asked, never claimed as interactive, and only counted.
  const approved = relay();
  for (const [id, args] of /** @type {Array<[string, any]>} */ ([['c1', { op: 'begin_receive' }], ['c2', read], ['c3', read]])) {
    approved.requested(id, 'dude_a2a_conversation', args);
    assert.deepEqual(await approved.ask(approved.call(id, args), where), { kind: 'approve-once' }, id);
  }
  assert.deepEqual(approved.run.report.toolApprovals, { b: { 'dude_a2a_conversation.begin_receive': 1, 'dude_a2a_conversation.read': 2 } });
  assert.deepEqual([approved.run.report.permissions, approved.terminal.prompts], [undefined, []], 'no per-call entry, and nothing was asked');

  // A model request event that trails the callback is waited for within the short bound.
  const trailing = relay();
  const pending = trailing.ask(trailing.call('c1', read), where);
  setTimeout(() => trailing.requested('c1', 'dude_a2a_conversation', read), 20);
  assert.deepEqual(await within(pending, 5_000), { kind: 'approve-once' });

  // Requested for another admission: an earlier instruction's call is refused once that short wait ends.
  const earlier = relay();
  earlier.requested('c1', 'dude_a2a_conversation', read, 'adm-0');
  setTimeout(() => earlier.clock.advance(NATIVE_LIMITS.requestMs + 1), 20);
  assert.equal((await within(earlier.ask(earlier.call('c1', read), where), 5_000)).kind, 'reject');
  assert.deepEqual([earlier.run.report.permissions, earlier.run.report.toolApprovals, earlier.terminal.prompts], [refusal('not_model_requested'), undefined, []]);

  // The next step's allowance never covers a call that the previous step's admission requested.
  const next = relay();
  next.requested('c1', 'dude_a2a_conversation', read);
  next.run.allow.b = { ...next.run.allow.b, tools: { ...next.tools, admission: 'adm-2' } };
  setTimeout(() => next.clock.advance(NATIVE_LIMITS.requestMs + 1), 20);
  assert.equal((await within(next.ask(next.call('c1', read), where), 5_000)).kind, 'reject');
  assert.deepEqual(next.run.report.permissions, refusal('not_model_requested'));

  // Once the step's turn ended its allowance is cleared, and its own call is refused at once: as tool_not_allowed where the step's
  // phase still names that admission (after an exchange), and as not_pending where none does (after a proposal step), since then no
  // phase or step allowance is open.
  for (const [label, admission, reason] of /** @type {Array<[string, string | null, string]>} */ ([['an exchange', 'adm-1', 'tool_not_allowed'],
    ['a proposal step', null, 'not_pending']])) {
    const ended = relay();
    ended.requested('c1', 'dude_a2a_conversation', read);
    ended.run.allow.b = { ...ended.run.allow.b, admission, tools: null };
    assert.equal((await within(ended.ask(ended.call('c1', read), where), 5_000)).kind, 'reject', label);
    assert.deepEqual([ended.run.report.permissions, ended.terminal.prompts], [refusal(reason), []], label);
  }

  // Only the step's exact operations and fields, and never a call that managed policy says needs a human.
  for (const [label, request, reason] of /** @type {Array<[string, any, string]>} */ ([
    ['a cancel B was not given', { op: 'cancel', operationId: read.operationId }, 'tool_op_not_allowed'],
    ['a malformed operation ID', { op: 'read', operationId: 'x' }, 'tool_args_not_allowed'],
  ])) {
    const wrong = relay();
    wrong.requested('c1', 'dude_a2a_conversation', request);
    assert.equal((await wrong.ask(wrong.call('c1', request), where)).kind, 'reject', label);
    assert.deepEqual(wrong.run.report.permissions, refusal(reason), label);
  }
  const managed = relay();
  managed.requested('c1', 'dude_a2a_conversation', read);
  assert.equal((await managed.ask(managed.call('c1', read, { managedApprovalRequired: true }), where)).kind, 'reject');
  assert.deepEqual([managed.run.report.permissions, managed.terminal.prompts], [refusal('managed_approval_required'), []]);

  // Rechecked as the answer is given: a completed call, a closing run, consent not granted, or an expired scope approves nothing.
  for (const [label, change, options] of /** @type {Array<[string, (context: any) => void, any]>} */ ([
    ['the call already completed', (context) => context.log.onEvent({ type: 'tool.execution_complete', data: { toolCallId: 'c1', success: true,
      result: { content: 'x' } } }), {}],
    ['the run began closing', (context) => { context.run.closing = true; }, {}],
    ['consent was not granted', () => undefined, { consent: 'not_given' }],
    ['the scope expired', (context) => context.clock.advance(3_600_001), {}],
  ])) {
    const context = relay(options);
    context.requested('c1', 'dude_a2a_conversation', read);
    change(context);
    assert.equal((await within(context.ask(context.call('c1', read), where), 5_000)).kind, 'reject', label);
    assert.deepEqual([context.run.report.permissions, context.run.report.toolApprovals], [refusal('approval_withdrawn'), undefined], label);
  }

  // Every other kind keeps its typed approve-once, even while the step allows Dude tool calls.
  const typed = relay({ answers: ['approve-once'] });
  typed.run.allow.b = { ...typed.run.allow.b, phase: 'progress', admission: 'adm-1', progress: { file, initial: 'pending\n', final: 'complete\n' } };
  typed.requested('e1', 'edit', { path: file });
  const edit = { kind: 'write', toolCallId: 'e1', fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
    fileEdits: [{ before: { path: file, content: 'pending\n' }, after: { path: file, content: 'complete\n' } }] };
  assert.deepEqual(await typed.ask(edit, where), { kind: 'approve-once', approvedInteractively: true });
  assert.deepEqual([typed.terminal.prompts.length, typed.run.report.permissions, typed.run.report.toolApprovals],
    [1, [{ side: 'b', kind: 'write', asked: true, reason: null, answer: 'approve-once', target: file }], undefined]);
});

test('custom-tool relay: the root idle of a step\'s admission, aborted or not, ends that step\'s allowance as soon as it is delivered, before the run clears it: the step\'s exact call is then refused and nothing is counted, whether its callback comes after that idle, waits for a request that arrives with it, or waits for one that never arrives; with no idle yet, or only an earlier turn\'s, the same call is approved once', async () => {
  const read = { op: 'read', operationId: randomUUID() };
  // B's exchange step, admitted as adm-1. Its allowance stays installed throughout, because nothing here clears it as the run does after
  // its turn: only the turn's own end, as the session's events show it, can refuse the call.
  /** @param {{frozen?: boolean}} [options] A frozen clock never reaches the request wait's own bound, so only an event can end that wait. */
  const relay = ({ frozen = false } = {}) => {
    const clock = testClock();
    if (frozen) clock.freeze();
    const terminal = fakeTerminal([]);
    const log = createSessionLog('b', clock.now);
    const tools = { admission: 'adm-1', propose: null, conversation: { ops: ['begin_receive', 'read'], slug: null } };
    const run = { clock: clock.now, expiresAtMs: clock.now() + 3_600_000, closing: false, report: /** @type {any} */ ({ consent: { status: 'granted' } }),
      allow: /** @type {Record<string, any>} */ ({ b: { sessionId: 's-b', phase: 'closed', admission: null, progress: null, capture: null, tools } }),
      human: humanQueue(terminal, clock.now), clients: [{ side: 'b', log }] };
    /** @param {string} type @param {Record<string, unknown>} data */
    const deliver = (type, data) => log.onEvent({ type, id: randomUUID(), timestamp: new Date(clock.now()).toISOString(), data });
    return {
      run, clock, terminal, tools,
      admitted: () => deliver('user.message', { messageId: 'adm-1', content: 'x' }),
      requested: () => deliver('assistant.message', { messageId: 'm-c1', originatingMessageId: 'adm-1', content: '',
        toolRequests: [{ toolCallId: 'c1', name: 'dude_a2a_conversation', arguments: read }] }),
      /** @param {Record<string, unknown>} data */
      idle: (data) => deliver('session.idle', data),
      ask: () => permissionRelay(run, 'b', log)({ kind: 'custom-tool', toolCallId: 'c1', toolName: 'dude_a2a_conversation', toolDescription: 'x', args: read },
        { sessionId: 's-b' }),
    };
  };
  /**
   * The relay's answer, what the report kept, how many prompts anyone was shown, and whether the step's allowance was still installed.
   * @param {ReturnType<typeof relay>} context @param {any} answer
   */
  const outcome = (context, answer) => ({ answer: answer.kind, permissions: context.run.report.permissions ?? null,
    toolApprovals: context.run.report.toolApprovals ?? null, asked: context.terminal.prompts.length, installed: context.run.allow.b.tools === context.tools });
  /** @type {Record<string, any>} */
  const outcomes = {};

  // Every other input is valid: with no idle yet the call is approved once and counted, and so it is after an earlier turn's idle,
  // which comes before the admission's own user message and ends nothing.
  const open = relay();
  open.admitted();
  open.requested();
  outcomes['no idle yet'] = outcome(open, await within(open.ask(), 5_000));
  const earlier = relay();
  earlier.idle({});
  earlier.admitted();
  earlier.requested();
  outcomes['only an earlier turn\'s idle'] = outcome(earlier, await within(earlier.ask(), 5_000));

  for (const [label, data] of /** @type {Array<[string, Record<string, unknown>]>} */ ([['its turn ended', {}], ['its turn was aborted', { aborted: true }]])) {
    // The callback arrives after the idle, its request already delivered.
    const after = relay();
    after.admitted();
    after.requested();
    after.idle(data);
    outcomes[`${label}, then the callback`] = outcome(after, await within(after.ask(), 5_000));
    // The callback came first and waits for its trailing request event, which arrives together with the idle before the relay looks again.
    const trailing = relay({ frozen: true });
    trailing.admitted();
    const pending = trailing.ask();
    trailing.requested();
    trailing.idle(data);
    outcomes[`${label} while the callback waited, with its request`] = outcome(trailing, await within(pending, 5_000));
    // The callback waits for a request event that never arrives: the idle ends that wait, which the frozen clock never would.
    const unrequested = relay({ frozen: true });
    unrequested.admitted();
    const waiting = unrequested.ask();
    unrequested.idle(data);
    outcomes[`${label} while the callback waited, with no request`] = outcome(unrequested, await within(waiting, 3_000));
    // A wait the idle did not end is released at its own bound, so nothing outlives this test.
    unrequested.clock.advance(NATIVE_LIMITS.requestMs + 1);
  }
  /** @param {string} reason */
  const refused = (reason) => ({ answer: 'reject', permissions: [{ side: 'b', kind: 'custom-tool', asked: false, reason, answer: null,
    target: 'dude_a2a_conversation' }], toolApprovals: null, asked: 0, installed: true });
  const approved = { answer: 'approve-once', permissions: null, toolApprovals: { b: { 'dude_a2a_conversation.read': 1 } }, asked: 0, installed: true };
  // Once the turn ended no phase or step allowance is open, so a call whose request event never came is refused as not pending.
  assert.deepEqual(outcomes, {
    'no idle yet': approved,
    'only an earlier turn\'s idle': approved,
    'its turn ended, then the callback': refused('approval_withdrawn'),
    'its turn ended while the callback waited, with its request': refused('approval_withdrawn'),
    'its turn ended while the callback waited, with no request': refused('not_pending'),
    'its turn was aborted, then the callback': refused('approval_withdrawn'),
    'its turn was aborted while the callback waited, with its request': refused('approval_withdrawn'),
    'its turn was aborted while the callback waited, with no request': refused('not_pending'),
  });
});

test('custom-tool relay: as the native run showed, each Dude tool call asks permission in normal mode; under the typed consent the main relay approves only each step\'s exact calls without asking, so a complete version-3 slice runs end to end and its report counts them per side', async () => {
  const { result, host, terminal } = await sliceV3({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'] });
  const { report } = result;
  // Native run e3689559-574d-4b1c-a851-7281de20df9a stopped here: B's dude_a2a_propose call was refused without a rule as
  // not_model_requested, so no complete proposal result was observed (proposal_unavailable).
  assert.deepEqual([report.reason, report.detail, (report.permissions ?? []).filter((/** @type {any} */ entry) => entry.kind === 'custom-tool')],
    [null, null, []]);
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(phaseList(report).map(([id]) => id), ['consent', 'revalidate', 'prepare', 'start_mains', 'approve_b', 'approve_a', 'advice_exchange', 'capture',
    'cancel_exchange', 'teardown', 'retained_reread']);
  assert.deepEqual(report.toolApprovals, {
    b: { dude_a2a_propose: 1, 'dude_a2a_conversation.begin_receive': 2, 'dude_a2a_conversation.read': 2, 'workspace.read': 2 },
    a: { dude_a2a_propose: 1, 'dude_a2a_conversation.begin_ask': 2, 'dude_a2a_conversation.read': 2, 'dude_a2a_conversation.cancel': 1, 'workspace.read': 7 },
  }, 'bounded counts by side, tool, and operation, never one entry per call');
  // B's five calls (one proposal, two begins, two reads) and A's six (one proposal, two begins, two reads, one cancel).
  assert.equal(host.state.toolDecisions.length, 11);
  for (const entry of host.state.toolDecisions) {
    assert.deepEqual(entry.decision, { kind: 'approve-once' }, `${entry.side} ${entry.tool} ${entry.op}: a plain approve-once from the relay, never an interactive one`);
  }
  // A asked for exactly the slug and question each instruction named: the plan's slug, then its cancel slug.
  assert.deepEqual(host.state.exchanges.map((/** @type {any} */ ex) => ex.kind), ['advice', 'cancel']);
  // The human typed only what a run asks without Dude tool calls: consent, two approvals, three approve-once, and the reread.
  assert.equal(terminal.prompts.length, 7);
  assert.deepEqual(permissionAsks(terminal.text).map(([side, summary]) => [side, summary.split(' ')[0]]).sort(), [['A', 'edit'], ['A', 'run'], ['B', 'edit']],
    'the progress edits and the publisher command are shown; no Dude tool call is');
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('custom-tool relay: a Dude tool call in an approval or capture turn, a proposal call whose request arrives after its turn ended, a malformed read, and another Dude tool are refused with their own reasons and only that, and the complete version-3 slice still runs', async () => {
  let exchanges = 0;
  const { result, host } = await sliceV3({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'], host: (_time, f) => ({ strayTools: (side, prompt) => {
    if (side === 'b' && prompt.startsWith('dude a2a approve ')) return [['dude_a2a_conversation', { op: 'begin_receive' }]];
    if (side === 'b' && prompt.startsWith('Feature 089 native qualification. Do every step') && exchanges++ === 0) {
      return [['dude_a2a_conversation', { op: 'read', operationId: 'not-an-operation' }], ['dude_a2a_reply', { conclusion: 'stray' }]];
    }
    if (side === 'a' && prompt.startsWith('Feature 089 native qualification, capture step.')) return [['dude_a2a_conversation', { op: 'read', operationId: randomUUID() }]];
    return [];
  },
  // The exact proposal call, requested in B's proposal turn, whose permission request arrives only in B's approval turn: its step's
  // allowance ended with that turn, so it is refused though nothing about the call itself changed.
  lateTool: (side, prompt) => (side === 'b' && prompt.startsWith('Feature 089 native qualification, proposal step.')
    ? ['dude_a2a_propose', { configPath: layoutOf(f.plan.fixtureParent).b.a2aConfig, profileId: 'b' }] : null) }) });
  const { report } = result;
  assert.equal(report.reason, null, report.detail);
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(report.permissions.filter((/** @type {any} */ entry) => entry.kind === 'custom-tool'), [
    // In B's approval turn no phase or step allowance is open: the late proposal call, then a new stray, are not pending.
    { side: 'b', kind: 'custom-tool', asked: false, reason: 'not_pending', answer: null, target: 'dude_a2a_propose' },
    { side: 'b', kind: 'custom-tool', asked: false, reason: 'not_pending', answer: null, target: 'dude_a2a_conversation' },
    // B's advice exchange allows begin_receive and read with a well-formed operation ID, and only the conversation tool.
    { side: 'b', kind: 'custom-tool', asked: false, reason: 'tool_args_not_allowed', answer: null, target: 'dude_a2a_conversation' },
    { side: 'b', kind: 'custom-tool', asked: false, reason: 'tool_not_allowed', answer: null, target: 'dude_a2a_reply' },
    // A's capture turn allows no Dude tool call, though its phase names that admission and its step allows its workspace's reads.
    { side: 'a', kind: 'custom-tool', asked: false, reason: 'tool_not_allowed', answer: null, target: 'dude_a2a_conversation' },
  ]);
  assert.deepEqual(host.state.toolDecisions.filter((entry) => entry.decision.kind !== 'approve-once').map((entry) => [entry.side, entry.tool, entry.op]),
    [['b', 'dude_a2a_propose', null], ['b', 'dude_a2a_conversation', 'begin_receive'], ['b', 'dude_a2a_conversation', 'read'], ['b', 'dude_a2a_reply', null],
      ['a', 'dude_a2a_conversation', 'read']]);
  assert.deepEqual(report.toolApprovals, {
    b: { dude_a2a_propose: 1, 'dude_a2a_conversation.begin_receive': 2, 'dude_a2a_conversation.read': 2, 'workspace.read': 2 },
    a: { dude_a2a_propose: 1, 'dude_a2a_conversation.begin_ask': 2, 'dude_a2a_conversation.read': 2, 'dude_a2a_conversation.cancel': 1, 'workspace.read': 7 },
  }, 'only the steps\' own calls were approved');
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

// ---------------------------------------------------------------------------
// Reads of a main's own workspace under the typed consent. In normal mode the native runtime asks read permission for a view even inside
// the session's own working directory: native run 15b73114-21ee-4744-bfe3-2993edfeaa88 refused A's view of its own ideas folder and B's
// of its own progress file as not_model_requested, because an exchange step opens no phase before the progress interval, so neither
// model went on and the run stopped as operation_not_started. The main relay approves, once each and without asking, only a read inside
// that session's own workspace that its root model requested for the current step while that step's turn is open.
// ---------------------------------------------------------------------------

test('workspace reads: as the native run showed, each main\'s model views its own workspace from the start of its exchange, and each view asks read permission in normal mode; under the typed consent the relay approves those reads once each without asking, so a complete version-3 slice runs end to end and counts them per side', async () => {
  const { result, host, terminal, layout } = await sliceV3({ answers: ['approve-once', 'approve-once', 'approve-once', 'reread reviewed'] });
  const { report } = result;
  // Native run 15b73114-21ee-4744-bfe3-2993edfeaa88 stopped here: both views were refused as not_model_requested, neither model went on,
  // and the advice exchange never began (operation_not_started).
  assert.deepEqual([report.reason, report.detail, (report.permissions ?? []).filter((/** @type {any} */ entry) => !entry.asked)], [null, null, []],
    'no request was refused');
  assert.deepEqual(failedChecks(report), []);
  assert.deepEqual(phaseList(report).map(([id]) => id), ['consent', 'revalidate', 'prepare', 'start_mains', 'approve_b', 'approve_a', 'advice_exchange', 'capture',
    'cancel_exchange', 'teardown', 'retained_reread']);
  // Each view's read was approved once by the relay itself: A's ideas folder and both polls of its progress file in the advice exchange,
  // its ideas folder through the canonical root in capture, and its ideas folder and both polls of the cue in the cancel exchange; B's
  // two polls of its progress file in the advice exchange. Each session's views are its own, in order.
  const ideas = path.join(layout.a.workspace, '.dude', 'ideas');
  const progressA = path.join(layout.a.workspace, PROGRESS_FIXTURES.a.path);
  const progressB = path.join(layout.b.workspace, PROGRESS_FIXTURES.b.path);
  const cue = path.join(layout.a.workspace, 'cancel-a.txt');
  const viewed = (/** @type {string} */ side) => host.state.reads.filter((entry) => entry.side === side).map((entry) => [entry.path, entry.decision]);
  assert.deepEqual(viewed('a'), [ideas, progressA, progressA, path.join(fs.realpathSync.native(layout.a.workspace), '.dude', 'ideas'), ideas, cue, cue]
    .map((file) => [file, 'approve-once']));
  assert.deepEqual(viewed('b'), [progressB, progressB].map((file) => [file, 'approve-once']));
  assert.deepEqual([report.toolApprovals.a['workspace.read'], report.toolApprovals.b['workspace.read']], [7, 2], 'counted per side under one key');
  // The human typed only consent, both approvals, the three typed approve-once (both progress edits and the publisher command), and the
  // reread; no read was shown.
  assert.equal(terminal.prompts.length, 7);
  assert.deepEqual(permissionAsks(terminal.text).map(([side, summary]) => [side, summary.split(' ')[0]]).sort(), [['A', 'edit'], ['A', 'run'], ['B', 'edit']]);
  assert.deepEqual([report.verdict, result.exitCode], ['controlled_only', 4]);
});

test('workspace reads: matchPermission relays a read of the session\'s own workspace folder or anything below it, by the layout\'s or the canonical spelling, only while the step allows that workspace; it refuses a read outside it, in the other session\'s workspace, by a relative or other spelling, or marked as needing a person, and the progress and capture phases keep their own typed actions', () => {
  const root = tempDir('dude-nqw-');
  const workspace = path.join(root, 'a', 'w');
  // A distinct canonical spelling stands for the real path the capture instruction names when the layout's path is not canonical.
  const canonicalRoot = path.join(root, 'real', 'a-w');
  const other = path.join(root, 'b', 'w');
  const tempRoot = path.join(root, 'a', 't');
  const file = path.join(workspace, PROGRESS_FIXTURES.a.path);
  const ideas = path.join(workspace, '.dude', 'ideas');
  // A's exchange step, admitted as adm-1, as the run sets it: its conversation calls and its own workspace.
  const exchange = { admission: 'adm-1', propose: null, conversation: { ops: ['begin_ask', 'read'], slug: 'delta' },
    workspace: { path: workspace, canonical: canonicalRoot } };
  /** @param {Record<string, unknown>} [extra] */
  const allow = (extra = {}) => ({ sessionId: 's-a', requested: ['c1'], phase: 'closed', admission: null, progress: null, capture: null, tools: exchange, ...extra });
  /** @param {unknown} target @param {Record<string, unknown>} [extra] */
  const read = (target, extra = {}) => ({ kind: 'read', toolCallId: 'c1', path: target, intention: 'View the file', ...extra });
  /** @param {any} request @param {any} [allowed] @param {any} [where] */
  const decide = (request, allowed = allow(), where = { sessionId: 's-a' }) => {
    const decision = /** @type {any} */ (matchPermission(request, where, allowed));
    return decision.ask ? 'ask' : decision.relay ? `relay ${decision.relay}` : decision.reason;
  };
  const windows = process.platform === 'win32';
  for (const [label, target] of /** @type {Array<[string, string]>} */ ([
    ['the workspace folder itself', workspace],
    ['its ideas folder', ideas],
    ['its progress file, before the progress phase opens', file],
    ['a nested file by the canonical spelling the capture instruction names', path.join(canonicalRoot, '.dude', 'ideas', '100-local-seed.md')],
    ['a path that resolves back inside', `${workspace}${path.sep}sub${path.sep}..${path.sep}x.md`],
    ...(windows ? /** @type {Array<[string, string]>} */ ([['another letter case, as Windows compares paths', path.join(workspace.toUpperCase(), 'X.MD')],
      ['forward separators', `${workspace.replace(/\\/g, '/')}/x.md`]]) : []),
  ])) {
    assert.equal(decide(read(target)), 'relay workspace.read', label);
  }
  for (const [label, request, reason] of /** @type {Array<[string, any, string]>} */ ([
    ['its own temp folder', read(path.join(tempRoot, 'stage', 'ledger.md')), 'outside_workspace'],
    ['the other session\'s workspace', read(path.join(other, '.dude', 'ideas')), 'outside_workspace'],
    ['the folder holding the workspace', read(path.dirname(workspace)), 'outside_workspace'],
    ['a path that resolves outside', read(`${workspace}${path.sep}..${path.sep}t${path.sep}x.md`), 'outside_workspace'],
    ['a sibling whose name starts with the workspace\'s', read(`${workspace}2${path.sep}x.md`), 'outside_workspace'],
    ['a relative path', read(path.join('.dude', 'ideas')), 'outside_workspace'],
    ['no path', read(undefined), 'outside_workspace'],
    ...(windows ? /** @type {Array<[string, any, string]>} */ ([['a device-namespace spelling', read(`\\\\?\\${path.join(workspace, 'x.md')}`), 'outside_workspace']]) : []),
    // The existing checks come first, and managed policy that requires a person forbids the relay's own approval.
    ['a read the model did not request', { ...read(ideas), toolCallId: 'c9' }, 'not_model_requested'],
    ['a sandbox bypass', read(ideas, { requestSandboxBypass: true }), 'sandbox_bypass'],
    ['a managed-policy marker on the request', read(ideas, { managedApprovalRequired: true }), 'managed_approval_required'],
  ])) {
    assert.equal(decide(request), reason, label);
  }
  assert.equal(decide(read(ideas), allow(), { sessionId: 's-b' }), 'session_mismatch', 'another session');
  assert.equal(decide(read(ideas), allow(), { sessionId: 's-a', promptRequest: { kind: 'read', path: ideas, intention: 'x', managedApprovalRequired: true } }),
    'managed_approval_required', 'a managed-policy marker on its prompt');
  // A step that does not allow its workspace, or no step and no phase: the read is not pending.
  const proposal = { admission: 'adm-1', propose: { configPath: path.join(root, 'a', 'a2a.json'), profileId: 'a' }, conversation: null, workspace: null };
  assert.equal(decide(read(ideas), allow({ tools: proposal })), 'not_pending', 'the proposal step');
  assert.equal(decide(read(ideas), allow({ tools: null })), 'not_pending', 'no open step or phase');

  // The progress phase inside the exchange step: its file's reads are the workspace's, and only its exact edit is asked.
  const progress = allow({ phase: 'progress', admission: 'adm-1', progress: { file, ...PROGRESS_FIXTURES.a } });
  const edit = { kind: 'write', toolCallId: 'c1', fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
    fileEdits: [{ before: { path: file, content: 'pending\n' }, after: { path: file, content: 'complete\n' } }] };
  assert.equal(decide(read(file), progress), 'relay workspace.read');
  assert.equal(decide(edit, progress), 'ask');
  assert.equal(decide(read(path.join(other, PROGRESS_FIXTURES.b.path)), progress), 'outside_workspace');
  assert.equal(decide({ kind: 'shell', toolCallId: 'c1', fullCommandText: 'Get-Content progress-a.txt' }, progress), 'not_progress');

  // The capture step allows its workspace and no Dude tool call; its phase keeps asking about its temp folder.
  const captureStep = { admission: 'adm-2', propose: null, conversation: null, workspace: { path: workspace, canonical: canonicalRoot } };
  const capture = allow({ tools: captureStep, phase: 'capture', admission: 'adm-2', capture: { tempRoot, slug: 'delta', advice: null } });
  assert.equal(decide(read(path.join(canonicalRoot, '.dude', 'ideas')), capture), 'relay workspace.read');
  assert.equal(decide(read(path.join(tempRoot, 'stage', 'ledger.md')), capture), 'ask', 'a read of A\'s temp folder is still asked');
  assert.equal(decide(read(path.join(other, 'x.md')), capture), 'outside_workspace');
  assert.equal(decide({ kind: 'custom-tool', toolCallId: 'c1', toolName: 'dude_a2a_conversation', toolDescription: 'x', args: { op: 'read', operationId: randomUUID() } },
    capture), 'tool_not_allowed');
});

test('workspace reads: the main relay approves a read inside its own workspace once without asking and only counts it, waiting for a trailing request event while only the step is open; it refuses a read outside it, in the other session\'s workspace, a subagent\'s, one after its step\'s turn ended, and one with no open step, each with its reason and the read\'s path as target, and asks nothing', async () => {
  const root = tempDir('dude-nqr-');
  const workspace = path.join(root, 'a', 'w');
  const ideas = path.join(workspace, '.dude', 'ideas');
  fs.mkdirSync(ideas, { recursive: true });
  const outside = path.join(root, 'a', 't', 'stage', 'ledger.md');
  const other = path.join(root, 'b', 'w', '.dude', 'ideas');
  /** @param {{step?: boolean, frozen?: boolean}} [options] */
  const relay = ({ step = true, frozen = false } = {}) => {
    const clock = testClock();
    if (frozen) clock.freeze();
    const terminal = fakeTerminal([]);
    const log = createSessionLog('a', clock.now);
    // A's exchange step, admitted as adm-1, before the progress phase opens: no phase, and the step's allowance alone.
    const tools = step ? { admission: 'adm-1', propose: null, conversation: { ops: ['begin_ask', 'read'], slug: 'delta' },
      workspace: { path: workspace, canonical: workspace } } : null;
    const run = { clock: clock.now, expiresAtMs: clock.now() + 3_600_000, closing: false, report: /** @type {any} */ ({ consent: { status: 'granted' } }),
      allow: /** @type {Record<string, any>} */ ({ a: { sessionId: 's-a', phase: 'closed', admission: null, progress: null, capture: null, tools } }),
      human: humanQueue(terminal, clock.now), clients: [{ side: 'a', log }] };
    /** @param {string} type @param {Record<string, unknown>} data @param {Record<string, unknown>} [envelope] */
    const deliver = (type, data, envelope = {}) => log.onEvent({ type, id: randomUUID(), timestamp: new Date(clock.now()).toISOString(), ...envelope, data });
    return {
      run, clock, terminal,
      admitted: () => deliver('user.message', { messageId: 'adm-1', content: 'x' }),
      /** @param {string} id @param {string} target @param {Record<string, unknown>} [envelope] */
      requested: (id, target, envelope = {}) => deliver('assistant.message', { messageId: `m-${id}`, originatingMessageId: 'adm-1', content: '',
        toolRequests: [{ toolCallId: id, name: 'view', arguments: { path: target } }] }, envelope),
      idle: () => deliver('session.idle', {}),
      /** @param {string} id @param {string} target */
      ask: (id, target) => permissionRelay(run, 'a', log)({ kind: 'read', toolCallId: id, path: target, intention: 'View the file' }, { sessionId: 's-a' }),
    };
  };
  /** @param {string} reason @param {string} target */
  const refusal = (reason, target) => [{ side: 'a', kind: 'read', asked: false, reason, answer: null, target }];

  // Inside its own workspace: approved once each by the relay itself, never asked or claimed as interactive, and only counted.
  const approved = relay();
  approved.admitted();
  for (const [id, target] of [['v1', ideas], ['v2', workspace]]) {
    approved.requested(id, target);
    assert.deepEqual(await within(approved.ask(id, target), 5_000), { kind: 'approve-once' }, target);
  }
  assert.deepEqual([approved.run.report.toolApprovals, approved.run.report.permissions, approved.terminal.prompts],
    [{ a: { 'workspace.read': 2 } }, undefined, []], 'no per-read entry, and nothing was asked');

  // The model's request event trails the callback: with no phase open, the step's open allowance alone keeps the relay waiting for it.
  const trailing = relay({ frozen: true });
  trailing.admitted();
  const pending = trailing.ask('v1', ideas);
  trailing.requested('v1', ideas);
  assert.deepEqual(await within(pending, 3_000), { kind: 'approve-once' });

  // Outside its own workspace, and in the other session's: refused at once, with the path as the target.
  for (const target of [outside, other]) {
    const context = relay();
    context.admitted();
    context.requested('v1', target);
    assert.equal((await within(context.ask('v1', target), 5_000)).kind, 'reject', target);
    assert.deepEqual([context.run.report.permissions, context.run.report.toolApprovals, context.terminal.prompts], [refusal('outside_workspace', target), undefined, []],
      target);
  }

  // A subagent's view of the same folder is not a request of the session's own root model: refused once the short wait ends.
  const subagent = relay();
  subagent.admitted();
  subagent.requested('v1', ideas, { agentId: 'sub-1' });
  setTimeout(() => subagent.clock.advance(NATIVE_LIMITS.requestMs + 1), 20);
  assert.equal((await within(subagent.ask('v1', ideas), 5_000)).kind, 'reject');
  assert.deepEqual([subagent.run.report.permissions, subagent.run.report.toolApprovals], [refusal('not_model_requested', ideas), undefined]);

  // After the step's turn ended its allowance approves nothing, even before the run clears it: a read whose request came in that turn
  // is withdrawn, and one whose request never came is not pending, since no phase or step is open.
  const ended = relay();
  ended.admitted();
  ended.requested('v1', ideas);
  ended.idle();
  assert.equal((await within(ended.ask('v1', ideas), 5_000)).kind, 'reject');
  assert.deepEqual([ended.run.report.permissions, ended.run.report.toolApprovals], [refusal('approval_withdrawn', ideas), undefined]);
  const unrequested = relay();
  unrequested.admitted();
  unrequested.idle();
  assert.equal((await within(unrequested.ask('v1', ideas), 5_000)).kind, 'reject');
  assert.deepEqual(unrequested.run.report.permissions, refusal('not_pending', ideas));

  // No open step and no open phase, as between steps: not pending, not "not model-requested", though the model asked.
  const closed = relay({ step: false });
  closed.admitted();
  closed.requested('v1', ideas);
  assert.equal((await within(closed.ask('v1', ideas), 5_000)).kind, 'reject');
  assert.deepEqual([closed.run.report.permissions, closed.terminal.prompts], [refusal('not_pending', ideas), []]);
});

test('workspace reads: each main permission entry names a bounded, non-secret target, and the report keeps at most 50 refusals and counts the rest, while every asked request keeps its entry, so the report stays well under its bound', async () => {
  // The target: a read's path, a write's file, a tool's name, a shell request's parsed command names, an extension's name; never a
  // command's text, a tool's arguments, a URL, or a memory's fact.
  assert.equal(permissionTarget({ kind: 'read', path: 'C:\\w\\x.md' }), 'C:\\w\\x.md');
  assert.equal(permissionTarget({ kind: 'write', fileName: 'C:\\w\\x.md', newFileContents: 'secret' }), 'C:\\w\\x.md');
  for (const kind of ['custom-tool', 'mcp', 'hook']) assert.equal(permissionTarget({ kind, toolName: 'dude_a2a_conversation', args: { secret: 1 } }), 'dude_a2a_conversation');
  assert.equal(permissionTarget({ kind: 'shell', fullCommandText: 'node x.mjs --token secret', commands: [{ identifier: 'node', readOnly: false },
    { identifier: 'Get-FileHash', readOnly: true }] }), 'node Get-FileHash');
  assert.equal(permissionTarget({ kind: 'extension-env-access', extensionName: 'dude', environmentVariables: ['SECRET_NAME'] }), 'dude');
  for (const request of [{ kind: 'url', url: 'https://user:pass@example.invalid/x?token=1' }, { kind: 'memory', fact: 'secret' }, { kind: 'read' }, null]) {
    assert.equal(permissionTarget(request), null, JSON.stringify(request));
  }
  // Control and bidirectional characters are escaped as on the terminal, and a long target is cut within 256 UTF-8 bytes with its length.
  assert.equal(permissionTarget({ kind: 'read', path: 'C:\\w\\a\u0007b\u202ec' }), 'C:\\w\\a\\u0007b\\u202ec');
  const long = `C:\\${'é'.repeat(300)}`;
  const cut = /** @type {string} */ (permissionTarget({ kind: 'read', path: long }));
  assert.ok(Buffer.byteLength(cut, 'utf8') <= NATIVE_LIMITS.targetBytes, `${Buffer.byteLength(cut, 'utf8')} bytes`);
  assert.ok(cut.startsWith('C:\\éé') && cut.endsWith(`... (${Buffer.byteLength(long, 'utf8')} bytes)`), cut);

  // 55 reads outside the workspace, each with a maximal path: the first 50 keep their entries, the other 5 are only counted.
  const root = tempDir('dude-nqc-');
  const workspace = path.join(root, 'a', 'w');
  const file = path.join(workspace, PROGRESS_FIXTURES.a.path);
  const clock = testClock();
  const terminal = fakeTerminal(['approve-once']);
  const log = createSessionLog('a', clock.now);
  const tools = { admission: 'adm-1', propose: null, conversation: { ops: ['begin_ask', 'read'], slug: 'delta' }, workspace: { path: workspace, canonical: workspace } };
  const run = { clock: clock.now, expiresAtMs: clock.now() + 3_600_000, closing: false, report: /** @type {any} */ ({ consent: { status: 'granted' } }),
    allow: /** @type {Record<string, any>} */ ({ a: { sessionId: 's-a', phase: 'closed', admission: null, progress: null, capture: null, tools } }),
    human: humanQueue(terminal, clock.now), clients: [{ side: 'a', log }] };
  const ask = permissionRelay(run, 'a', log);
  /** @param {string} id @param {string} name @param {Record<string, unknown>} args */
  const requested = (id, name, args) => log.onEvent({ type: 'assistant.message', timestamp: new Date(clock.now()).toISOString(),
    data: { messageId: `m-${id}`, originatingMessageId: 'adm-1', content: '', toolRequests: [{ toolCallId: id, name, arguments: args }] } });
  for (let index = 0; index < 55; index += 1) {
    const target = path.join(root, 'elsewhere', `${index}`.padStart(2, '0'), 'x'.repeat(400));
    requested(`v${index}`, 'view', { path: target });
    assert.equal((await ask({ kind: 'read', toolCallId: `v${index}`, path: target, intention: 'x' }, { sessionId: 's-a' })).kind, 'reject');
  }
  assert.deepEqual([run.report.permissions.length, run.report.permissionsOmitted], [50, 5]);
  assert.ok(run.report.permissions.every((/** @type {any} */ entry) => entry.reason === 'outside_workspace'
    && Buffer.byteLength(entry.target, 'utf8') <= NATIVE_LIMITS.targetBytes));
  // A request the human is asked about after that still keeps its entry: the progress phase's exact edit, typed approve-once.
  run.allow.a = { ...run.allow.a, phase: 'progress', admission: 'adm-1', progress: { file, ...PROGRESS_FIXTURES.a } };
  requested('e1', 'edit', { path: file });
  assert.deepEqual(await ask({ kind: 'write', toolCallId: 'e1', fileName: file, diff: '', intention: 'x', canOfferSessionApproval: false,
    fileEdits: [{ before: { path: file, content: 'pending\n' }, after: { path: file, content: 'complete\n' } }] }, { sessionId: 's-a' }),
  { kind: 'approve-once', approvedInteractively: true });
  assert.deepEqual(run.report.permissions.at(-1), { side: 'a', kind: 'write', asked: true, reason: null, answer: 'approve-once', target: file });
  assert.deepEqual([run.report.permissions.length, run.report.permissionsOmitted], [51, 5]);
  const bytes = Buffer.byteLength(`${JSON.stringify({ permissions: run.report.permissions, permissionsOmitted: run.report.permissionsOmitted }, null, 2)}\n`, 'utf8');
  assert.ok(bytes < NATIVE_LIMITS.reportBytes / 2, `the kept entries take ${bytes} bytes, well under the ${NATIVE_LIMITS.reportBytes}-byte report`);
});
