// @ts-check
/**
 * Checks for the bounded A2A conversation transcript (lib/a2a-transcript.mjs):
 * the journal format and its exact bounds, the ten retained conversations,
 * honest write failures, root safety, and the read-only terminal view and its
 * CLI. Journals are written into test-owned temporary workspaces with a fixed
 * clock, and the CLI runs as a child process of this test. These checks
 * establish the module's own contracts; peer exchanges recorded through it
 * are covered in a2a-collaboration.test.mjs.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { TRANSCRIPT_DIR, TRANSCRIPT_LIMITS, TranscriptError, createTranscriptRecorder, readTranscript } from './lib/a2a-transcript.mjs';
import { WORKER_BOUNDS } from './lib/a2a-peer-worker.mjs';

const MODULE = fileURLToPath(new URL('./lib/a2a-transcript.mjs', import.meta.url));
const NOW = Date.parse('2026-11-01T04:00:00.000Z');
const TIME = new Date(NOW).toISOString();
const PEER = Object.freeze({ label: 'B', certSha256: 'ab'.repeat(32) });
const CONFIG_DIGEST = 'cd'.repeat(32);
const ORDINARY_ROOM = TRANSCRIPT_LIMITS.journalBytes - TRANSCRIPT_LIMITS.reserveBytes;
// Raw C0, DEL, C1, separators, and bidirectional overrides; never in output.
const RAW_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

function tempRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-a2a-transcript-'));
  scratch.push(directory);
  return directory;
}

/** @param {string} operationId @param {'ask' | 'receive'} [role] */
function start(operationId, role = 'ask') {
  return {
    operationId, role, profileId: role === 'ask' ? 'a-ask' : 'b-serve', projectId: 'dude-number-poc', peer: { ...PEER },
    configDigest: CONFIG_DIGEST, contentBytes: 32_768,
  };
}

/** @param {string} root @param {{writeSync?: any}} [io] */
const recorderAt = (root, io) => createTranscriptRecorder({ root, now: () => NOW, io });

/** @param {string} root */
const folder = (root) => path.join(root, ...TRANSCRIPT_DIR.split('/'));

/**
 * One record line in the documented format, as the writer serializes it.
 * @param {string} operationId @param {number} sequence @param {string} kind @param {Record<string, unknown>} data
 * @param {string | null} [conversationId]
 */
function recordLine(operationId, sequence, kind, data, conversationId = null) {
  return `${JSON.stringify({ version: 1, sequence, time: TIME, operationId, conversationId, kind, data })}\n`;
}

/**
 * Data whose record line is exactly `bytes` long.
 * @param {string} operationId @param {number} sequence @param {string} kind @param {number} bytes @param {string | null} conversationId
 */
function sizedData(operationId, sequence, kind, bytes, conversationId) {
  const base = Buffer.byteLength(recordLine(operationId, sequence, kind, { text: '' }, conversationId));
  assert.ok(bytes >= base, 'the target fits a record');
  const data = { text: 'x'.repeat(bytes - base) };
  assert.equal(Buffer.byteLength(recordLine(operationId, sequence, kind, data, conversationId)), bytes);
  return data;
}

/** Read a journal in-process. @param {string} root @param {string} operationId */
async function readAll(root, operationId) {
  let text = '';
  const summary = await readTranscript({ root, operationId, write: (chunk) => { text += chunk; } });
  return { summary, text };
}

/** Every file below `root` with its digest; directories as entries too. @param {string} root */
function snapshot(root) {
  /** @type {Record<string, string>} */
  const files = {};
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        files[`${relative}/`] = 'directory';
        visit(full);
      } else files[relative] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  visit(root);
  return files;
}

/** @param {string[]} args */
function cli(args) {
  return spawnSync(process.execPath, [MODULE, ...args], { encoding: 'utf8', timeout: 20_000 });
}

/** @param {() => unknown} probe @param {string} label */
async function waitFor(probe, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (probe()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for ${label}`);
}

/**
 * A writeSync that fails the first write of one record kind, optionally after
 * writing half of that record, then recovers: whatever the journal writes
 * afterwards would reach the file, so only the writer's own rule stops it.
 * @param {string} kind @param {boolean} partial
 */
function failingDisk(kind, partial) {
  let state = 'ok';
  /** @param {number} fd @param {Buffer} buffer @param {number} offset @param {number} length */
  return (fd, buffer, offset, length) => {
    const enospc = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    if (state === 'half') {
      state = 'recovered';
      throw enospc();
    }
    if (state === 'ok' && buffer.subarray(offset, offset + length).toString('utf8').includes(`"kind":"${kind}"`)) {
      if (!partial) {
        state = 'recovered';
        throw enospc();
      }
      state = 'half';
      return fs.writeSync(fd, buffer, offset, Math.floor(length / 2));
    }
    return fs.writeSync(fd, buffer, offset, length);
  };
}

test('each operation gets one journal of sequenced UTC JSON records under .dude/state/a2a, opened with its approved correlation beside an ignore marker', (context) => {
  const root = tempRoot();
  const recorder = recorderAt(root);
  assert.equal(fs.existsSync(path.join(root, '.dude')), false, 'making a recorder touches nothing');
  const operationId = randomUUID();
  const conversationId = randomUUID();
  const recording = recorder.open(start(operationId));
  assert.equal(recording.path, path.join(folder(root), `${operationId}.jsonl`));
  assert.equal(recording.append({ kind: 'accepted', conversationId, data: { role: 'ask', budgetMs: 60_000 } }), true);
  assert.equal(recording.append({ kind: 'terminal', conversationId, data: { outcome: 'answer', reason: null, delivery: 'reached_peer' } }), true);
  recording.close();
  recording.close();

  const text = fs.readFileSync(recording.path, 'utf8');
  assert.equal(text, [
    recordLine(operationId, 1, 'opened', {
      role: 'ask', profileId: 'a-ask', projectId: 'dude-number-poc', peer: PEER, configDigest: CONFIG_DIGEST, contentBytes: 32_768,
      limits: { journalBytes: 1_048_576, reserveBytes: 16_384, conversations: 10, receiptBytes: 4_096 },
      neverRecorded: ['credentials', 'tls_keys', 'http_headers', 'approval_codes', 'worker_prompt', 'model_reasoning', 'sdk_history',
        'refused_request_text'],
    }),
    recordLine(operationId, 2, 'accepted', { role: 'ask', budgetMs: 60_000 }, conversationId),
    recordLine(operationId, 3, 'terminal', { outcome: 'answer', reason: null, delivery: 'reached_peer' }, conversationId),
    recordLine(operationId, 4, 'closed', { gaps: 0 }, conversationId),
  ].join(''), 'version, sequence, UTC time, operation, nullable conversation, kind, and payload; a second close writes nothing');
  assert.equal(recording.append({ kind: 'cleanup', conversationId, data: {} }), false, 'nothing is appended after close');
  assert.equal(fs.readFileSync(recording.path, 'utf8'), text);
  assert.equal(fs.readFileSync(path.join(folder(root), '.gitignore'), 'utf8'),
    '# Dude A2A transcripts and capture receipts: locally sensitive, kept until the owner deletes them.\n*\n');
  assert.equal(recording.append({ kind: 'opened', conversationId, data: {} }), false, 'a caller cannot forge the header');

  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) {
    context.diagnostic('git is unavailable here, so the ignore marker was not checked against a real index');
    return;
  }
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  assert.equal(status.stdout, '', 'Git sees no transcript, receipt folder, or marker');
  assert.equal(spawnSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).stdout, '', 'the index is untouched');
});

test('a journal stops at exactly 1 MiB: ordinary records end 16 KiB earlier, a refused record leaves an explicit gap, and closing records use the reserve', async () => {
  const root = tempRoot();
  const conversationId = randomUUID();
  /** Fill a fresh journal with 32 KiB records until fewer than three more fit its ordinary room. */
  const filled = () => {
    const operationId = randomUUID();
    const recording = recorderAt(root).open(start(operationId));
    let sequence = 1;
    while (ORDINARY_ROOM - fs.statSync(recording.path).size > 3 * 33_000) {
      sequence += 1;
      assert.equal(recording.append({ kind: 'evidence_returned', conversationId, data: { text: 'x'.repeat(32_768) } }), true);
    }
    return { operationId, recording, sequence, size: () => fs.statSync(recording.path).size };
  };

  // Positive: a record that ends exactly at the ordinary room is written.
  const exact = filled();
  const exactRoom = ORDINARY_ROOM - exact.size();
  assert.equal(exact.recording.append({
    kind: 'reply_received', conversationId, data: sizedData(exact.operationId, exact.sequence + 1, 'reply_received', exactRoom, conversationId),
  }), true);
  assert.equal(exact.size(), ORDINARY_ROOM, 'ordinary records fill exactly 1 MiB minus 16 KiB');
  const beforeGap = exact.size();
  assert.equal(exact.recording.append({ kind: 'reply_validated', conversationId, data: {} }), false, 'no ordinary byte enters the reserve');
  const gapLine = recordLine(exact.operationId, exact.sequence + 2, 'gap', {
    omitted: 'reply_validated', bytes: Buffer.byteLength(recordLine(exact.operationId, exact.sequence + 2, 'reply_validated', {}, conversationId)),
    reason: 'capacity',
  }, conversationId);
  assert.equal(fs.readFileSync(exact.recording.path).subarray(beforeGap).toString('utf8'), gapLine, 'the refusal is an explicit gap record');
  assert.equal(exact.recording.append({ kind: 'terminal', conversationId, data: { outcome: 'failed', reason: 'recording_failed', delivery: 'not_sent' } }), true,
    'the terminal record uses the reserve');
  exact.recording.close();
  const read = await readAll(root, exact.operationId);
  assert.deepEqual(read.summary.gaps, [{ sequence: exact.sequence + 2, omitted: 'reply_validated', bytes: JSON.parse(gapLine).data.bytes, reason: 'capacity' }]);
  assert.deepEqual(read.summary.problems, [`gap at #${exact.sequence + 2}: reply_validated left out (capacity)`]);
  assert.equal(read.summary.complete, false, 'a gap leaves the journal incomplete even though it closed');

  // Negative: one byte more than the ordinary room is refused whole, leaving only a gap record.
  const over = filled();
  const overRoom = ORDINARY_ROOM - over.size();
  const overSize = over.size();
  assert.equal(over.recording.append({
    kind: 'reply_received', conversationId, data: sizedData(over.operationId, over.sequence + 1, 'reply_received', overRoom + 1, conversationId),
  }), false);
  assert.equal(fs.readFileSync(over.recording.path).subarray(overSize).toString('utf8'),
    recordLine(over.operationId, over.sequence + 1, 'gap', { omitted: 'reply_received', bytes: overRoom + 1, reason: 'capacity' }, conversationId),
    'nothing of the refused record was written');

  // The reserve itself: a closing record that ends exactly at 1 MiB is written; nothing ever passes it.
  const full = filled();
  assert.equal(full.recording.append({
    kind: 'reply_received', conversationId, data: sizedData(full.operationId, full.sequence + 1, 'reply_received', ORDINARY_ROOM - full.size(), conversationId),
  }), true);
  const toLimit = TRANSCRIPT_LIMITS.journalBytes - full.size();
  assert.equal(full.recording.append({
    kind: 'cleanup', conversationId, data: sizedData(full.operationId, full.sequence + 2, 'cleanup', toLimit + 1, conversationId),
  }), false, 'a closing record one byte over 1 MiB is refused');
  const afterRefusal = full.size();
  const lastRoom = TRANSCRIPT_LIMITS.journalBytes - afterRefusal;
  assert.equal(full.recording.append({
    kind: 'cleanup', conversationId, data: sizedData(full.operationId, full.sequence + 3, 'cleanup', lastRoom, conversationId),
  }), true, 'a closing record that ends exactly at 1 MiB is written');
  assert.equal(full.size(), TRANSCRIPT_LIMITS.journalBytes);
  assert.throws(() => full.recording.close(), (error) => error instanceof TranscriptError && /has no closed record/.test(error.message),
    'a close that cannot record itself says so');
  assert.equal(full.size(), TRANSCRIPT_LIMITS.journalBytes, 'the journal never exceeds 1 MiB');
  const capped = await readAll(root, full.operationId);
  assert.deepEqual(capped.summary.problems.slice(-2), ['no terminal record', 'not closed']);
});

test('reserved room is no proof of disk: a write error ends the journal where it is, refuses every later record even once the disk recovers, and reads as incomplete', async () => {
  for (const partial of [false, true]) {
    const root = tempRoot();
    const operationId = randomUUID();
    const conversationId = randomUUID();
    const recording = recorderAt(root, { writeSync: failingDisk('reply_received', partial) }).open(start(operationId));
    assert.equal(recording.append({ kind: 'accepted', conversationId, data: {} }), true);
    const before = fs.statSync(recording.path).size;
    assert.equal(recording.append({ kind: 'reply_received', conversationId, data: { reply: 'the peer answer' } }), false);
    const failedAt = fs.statSync(recording.path).size;
    assert.equal(failedAt > before, partial, partial ? 'the half that reached the disk stays' : 'nothing was written');
    assert.equal(recording.append({ kind: 'terminal', conversationId, data: { outcome: 'failed', reason: 'recording_failed', delivery: 'reached_peer' } }), false,
      'the reserve does not cure a failed disk');
    assert.throws(() => recording.close(), (error) => error instanceof TranscriptError && /after a write error \(ENOSPC\)/.test(error.message));
    assert.equal(fs.statSync(recording.path).size, failedAt, 'nothing was written after the error');
    const { summary, text } = await readAll(root, operationId);
    assert.deepEqual(summary.problems, [
      'no terminal record', ...(partial ? [`an incomplete final record (${failedAt - before} bytes)`] : []), 'not closed',
    ], partial ? 'a torn record is reported, never shown as a record' : 'a missing terminal record is incomplete');
    assert.equal(text.includes('the peer answer'), false);
  }
});

test('ten conversations are retained, counting capture receipts; another is refused and nothing is rotated or deleted', () => {
  const root = tempRoot();
  const recorder = recorderAt(root);
  /** @type {string[]} */
  const kept = [];
  for (let index = 0; index < 9; index += 1) {
    const operationId = randomUUID();
    recorder.open(start(operationId)).close();
    kept.push(operationId);
  }
  const captures = path.join(folder(root), 'captures');
  fs.mkdirSync(captures);
  // A receipt beside its own journal is one conversation; a receipt alone is another.
  fs.writeFileSync(path.join(captures, `${kept[0]}.json`), '{}\n');
  const receiptOnly = path.join(captures, `${randomUUID()}.json`);
  fs.writeFileSync(receiptOnly, 'r'.repeat(TRANSCRIPT_LIMITS.receiptBytes));
  fs.writeFileSync(path.join(folder(root), 'owner-notes.txt'), 'not a transcript\n');
  const before = snapshot(root);
  assert.throws(() => recorder.open(start(randomUUID())),
    (error) => error instanceof TranscriptError && error.code === 'recording_full' && /^10 conversations are retained in /.test(error.message));
  assert.deepEqual(snapshot(root), before, 'a refusal creates, rotates, and deletes nothing');

  fs.rmSync(receiptOnly);
  const tenth = randomUUID();
  recorder.open(start(tenth)).close();
  assert.throws(() => recorder.open(start(randomUUID())), (error) => error instanceof TranscriptError && error.code === 'recording_full');
  for (const operationId of [...kept, tenth]) assert.ok(fs.existsSync(path.join(folder(root), `${operationId}.jsonl`)), 'every journal is kept');

  // Retained entries outside their bounds make the capacity unknowable, so recording refuses.
  const unsafe = tempRoot();
  const fresh = recorderAt(unsafe);
  fresh.open(start(randomUUID())).close();
  const oversizeReceipt = path.join(folder(unsafe), 'captures', `${randomUUID()}.json`);
  fs.mkdirSync(path.dirname(oversizeReceipt));
  fs.writeFileSync(oversizeReceipt, 'r'.repeat(TRANSCRIPT_LIMITS.receiptBytes + 1));
  assert.throws(() => fresh.open(start(randomUUID())),
    (error) => error instanceof TranscriptError && error.code === 'recording_unavailable' && /exceeds 4096 bytes/.test(error.message));
  fs.rmSync(oversizeReceipt);
  const oversizeJournal = path.join(folder(unsafe), `${randomUUID()}.jsonl`);
  fs.writeFileSync(oversizeJournal, Buffer.alloc(TRANSCRIPT_LIMITS.journalBytes + 1, 0x78));
  assert.throws(() => fresh.open(start(randomUUID())), (error) => error instanceof TranscriptError && /exceeds 1048576 bytes/.test(error.message));
  fs.rmSync(oversizeJournal);
  fs.mkdirSync(path.join(folder(unsafe), `${randomUUID()}.jsonl`));
  assert.throws(() => fresh.open(start(randomUUID())), (error) => error instanceof TranscriptError && /is not a regular file/.test(error.message));
});

test('the transcript folder must be plain directories inside the workspace: a link, a file in its place, or an unusable marker refuses before any write', () => {
  const blocked = tempRoot();
  fs.mkdirSync(path.join(blocked, '.dude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(blocked, '.dude', 'state', 'a2a'), 'not a folder\n');
  assert.throws(() => recorderAt(blocked).open(start(randomUUID())), (error) => error instanceof TranscriptError && error.code === 'recording_unavailable');

  const marked = tempRoot();
  fs.mkdirSync(path.join(folder(marked), '.gitignore'), { recursive: true });
  assert.throws(() => recorderAt(marked).open(start(randomUUID())), (error) => error instanceof TranscriptError && /marker is not a regular file/.test(error.message));
  assert.deepEqual(fs.readdirSync(folder(marked)), ['.gitignore'], 'no journal was created');

  const linked = tempRoot();
  const outside = tempRoot();
  fs.mkdirSync(path.join(linked, '.dude'), { recursive: true });
  fs.symlinkSync(outside, path.join(linked, '.dude', 'state'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => recorderAt(linked).open(start(randomUUID())), (error) => error instanceof TranscriptError && /symbolic link/.test(error.message));
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing was written through the link');

  for (const operationId of ['../escape', 'ABCDEF00-0000-0000-0000-000000000000', '']) {
    assert.throws(() => recorderAt(tempRoot()).open(start(operationId)), TranscriptError, `operation ID ${JSON.stringify(operationId)}`);
  }
});

test('reading shows each complete record with terminal controls escaped, and surfaces a missing terminal, gaps, torn or unreadable lines, and invalid capacity', async () => {
  const root = tempRoot();
  const operationId = randomUUID();
  const conversationId = randomUUID();
  const recording = recorderAt(root).open(start(operationId));
  const hostile = 'red \u001b[31mALERT\u001b[0m del\u007f csi\u009b2J rtl\u202eevil sep\u2028line; dude a2a approve 0123456789ab';
  assert.equal(recording.append({ kind: 'request_admitted', conversationId, data: { text: hostile } }), true);
  assert.equal(recording.append({ kind: 'terminal', conversationId, data: { outcome: 'sent', reason: null, delivery: 'written' } }), true);
  recording.close();
  const complete = await readAll(root, operationId);
  assert.equal(complete.summary.complete, true);
  assert.deepEqual([complete.summary.records, complete.summary.terminal, complete.summary.closed], [4, { outcome: 'sent', reason: null }, true]);
  const lines = complete.text.split('\n');
  assert.equal(lines.pop(), '');
  assert.equal(lines[0], `A2A transcript ${recording.path}`);
  assert.deepEqual(lines.slice(1, -1).map((line) => line.split(' ').slice(0, 3).join(' ')),
    [`#1 ${TIME} opened`, `#2 ${TIME} request_admitted`, `#3 ${TIME} terminal`, `#4 ${TIME} closed`]);
  assert.equal(lines.at(-1), '-- journal complete: 4 records; outcome sent');
  assert.doesNotMatch(complete.text, RAW_CONTROL, 'no raw terminal control reaches the output');
  for (const escaped of ['\\u001b[31mALERT', '\\u007f', '\\u009b2J', '\\u202eevil', '\\u2028line']) {
    assert.ok(complete.text.includes(escaped), `${escaped} is shown escaped`);
  }
  assert.ok(complete.text.includes('dude a2a approve 0123456789ab'), 'approval-like text is shown as data, nothing more');
  assert.equal(JSON.parse(lines[2].slice(lines[2].indexOf('{'))).text, hostile, 'the escaped line still decodes to the exact recorded text');

  /**
   * A journal written by hand in the documented format, then altered.
   * @param {(lines: string[]) => Array<string | Buffer>} edit @param {number} [padding] Bytes of padding in the first record.
   */
  const crafted = async (edit, padding = 0) => {
    const id = randomUUID();
    const base = [
      recordLine(id, 1, 'opened', { role: 'receive', pad: 'p'.repeat(padding) }),
      recordLine(id, 2, 'accepted', { role: 'receive' }),
      recordLine(id, 3, 'terminal', { outcome: 'cancelled', reason: 'cancelled', delivery: 'not_sent' }),
      recordLine(id, 4, 'closed', { gaps: 0 }),
    ];
    fs.writeFileSync(path.join(folder(root), `${id}.jsonl`), Buffer.concat(edit(base).map((part) => Buffer.from(part))));
    return (await readAll(root, id)).summary.problems;
  };
  assert.deepEqual(await crafted((lines) => lines), []);
  assert.deepEqual(await crafted((lines) => lines.slice(0, 2)), ['no terminal record', 'not closed'], 'a missing terminal record is incomplete');
  assert.deepEqual(await crafted((lines) => [...lines.slice(0, 3), lines[3].slice(0, 20)]), ['an incomplete final record (20 bytes)', 'not closed']);
  assert.deepEqual(await crafted((lines) => [lines[0], '{"version":1,"sequence":2,\n', ...lines.slice(2)]), ['1 unreadable line', 'records out of sequence']);
  assert.deepEqual(await crafted((lines) => [lines[0], lines[2], lines[1], lines[3]]), ['records out of sequence']);
  assert.deepEqual(await crafted((lines) => [lines[0], recordLine(randomUUID(), 2, 'accepted', {}), ...lines.slice(2)]),
    ['1 unreadable line', 'records out of sequence'], "another operation's record is not this journal's");
  assert.deepEqual(await crafted((lines) => [...lines, recordLine('00000000-0000-4000-8000-000000000000', 5, 'reply_received', {})]),
    ['1 unreadable line']);
  assert.deepEqual(await crafted((lines) => lines.slice(1)), ['no opened header', 'records out of sequence']);
  // An ordinary record that ends inside the closing reserve, and a journal larger than 1 MiB.
  const header = Buffer.byteLength(recordLine(randomUUID(), 1, 'opened', { role: 'receive', pad: '' }));
  const reserveEntry = await crafted((lines) => lines, ORDINARY_ROOM - 10 - header);
  assert.deepEqual(reserveEntry, ['records #2 entered the closing reserve'], 'the header ends 10 bytes before the reserve; the next record crosses it');
  const oversize = await crafted((lines) => [lines[0], recordLine('x', 2, 'pad', { pad: 'x'.repeat(TRANSCRIPT_LIMITS.journalBytes) }), ...lines.slice(1)]);
  assert.equal(oversize[0], 'the journal exceeds 1048576 bytes');
  assert.ok(oversize.includes('no terminal record') && oversize.includes('not closed'), 'nothing past the bound is read');
});

test('B readiness records fit the room receiving charges even at their widest, stay ordinary records outside the reserve, and read back escaped in the unchanged record format', async () => {
  const root = tempRoot();
  const conversationId = randomUUID();
  const workerId = randomUUID();
  const limit = WORKER_BOUNDS.identifierLength;
  // The rooms receiving charges for them (RECORDING_NEEDS in a2a-collaboration.mjs): 1 KiB per record, the readiness
  // observation's bound, and per runtime- or peer-supplied identifier its serialized worst case, a lone surrogate per unit.
  const RECORD_ROOM = 1_024;
  const IDENTIFIER_ROOM = 6 * limit + 2;
  /** @param {number} code */
  const widest = (code) => String.fromCharCode(code).repeat(limit);
  const sessionId = widest(0xdc00);
  const admissionId = widest(0xdc01);
  // Terminal controls the worker's identifier rule admits, to show the tail escapes them; still `limit` units long.
  const toolCallId = `\u202e\u009b\u2028${widest(0xdfff).slice(3)}`;
  const binding = {
    operationId: 'o'.repeat(64), permitId: 'p'.repeat(64), mainSessionId: widest(0xd800), providerGeneration: randomUUID(), configDigest: CONFIG_DIGEST,
    projectId: 'j'.repeat(64), conversationId, questionId: widest(0xd801), exchangeId: randomUUID(),
  };
  const sdkPath = path.join(os.tmpdir(), 'sdk', 'index.js');
  const loader = { source: 'fixed_loader', resolvedUrl: new URL(`file:///${sdkPath.replaceAll('\\', '/')}`).href, path: sdkPath, bytes: 123_456, sha256: 'ef'.repeat(32) };
  const observation = {
    version: 1, workerId, binding, sessionId, qualification: null, loaders: { joined: loader, worker: loader }, extensionPid: 4242,
    runtime: { version: '1.0.102-0.unstable', protocolVersion: 3 }, model: 'fixture-model', storage: path.join(os.tmpdir(), 'dude-a2a-w-'),
    catalog: [{ name: 'dude_a2a_evidence_inventory', schemaSha256: '01'.repeat(32) }, { name: 'dude_a2a_evidence_read', schemaSha256: '02'.repeat(32) }],
    ambient: { instructionSources: 0, skills: 0, enabledSkills: 0, mcpServers: 0, extensions: 0, customAgents: 0, selectedAgent: false },
    probes: [{
      id: 'dude-a2a-preflight-inventory', name: 'dude_a2a_evidence_inventory', argumentsSha256: '03'.repeat(32), shape: 'result', code: 'failure',
      templateSha256: '04'.repeat(32), cause: 'invalid_arguments',
    }],
    startedAt: TIME, completedAt: TIME,
  };
  // Pad the owned storage path until the observation is exactly the readiness bound.
  observation.storage += 'x'.repeat(WORKER_BOUNDS.startupBytes - Buffer.byteLength(JSON.stringify(observation)));
  assert.equal(Buffer.byteLength(JSON.stringify(observation)), WORKER_BOUNDS.startupBytes);
  const ready = { workerId, sessionId, observationSha256: '05'.repeat(32), startupRelease: '06'.repeat(32) };
  /** @type {Array<[string, Record<string, unknown>, number]>} Each readiness record and the room charged for it beyond one record's. */
  const readiness = [
    ['worker_preflight', observation, WORKER_BOUNDS.startupBytes],
    ['worker_ready', ready, IDENTIFIER_ROOM],
    ['worker_request_admitted', { workerId, sessionId, admissionId }, 2 * IDENTIFIER_ROOM],
    ['worker_evidence_pending', { workerId, sessionId, admissionId, toolCallId, tool: 'dude_a2a_evidence_inventory' }, 3 * IDENTIFIER_ROOM],
  ];
  assert.ok(Buffer.byteLength(JSON.stringify({ binding, sessionId, admissionId })) <= RECORD_ROOM + 4 * IDENTIFIER_ROOM,
    'the binding, session, and admission the worker record repeats fit its one more room and four identifiers');

  const operationId = randomUUID();
  const recording = recorderAt(root).open(start(operationId, 'receive'));
  for (const [kind, data] of readiness) assert.equal(recording.append({ kind, conversationId, data }), true, kind);
  assert.equal(recording.append({ kind: 'terminal', conversationId, data: { outcome: 'failed', reason: 'cancelled', delivery: 'not_sent' } }), true);
  recording.close();
  const lines = fs.readFileSync(recording.path, 'utf8').split(/(?<=\n)/);
  assert.deepEqual(JSON.parse(lines[0]).data.neverRecorded, ['credentials', 'tls_keys', 'http_headers', 'approval_codes', 'worker_prompt',
    'model_reasoning', 'sdk_history', 'refused_request_text'], 'the header still states every exclusion');
  for (const [index, [kind, data, charged]] of readiness.entries()) {
    const line = lines[index + 1];
    assert.equal(line, recordLine(operationId, index + 2, kind, data, conversationId), `${kind} uses the unchanged seven-key record format`);
    assert.ok(Buffer.byteLength(line) <= RECORD_ROOM + charged, `${kind}: ${Buffer.byteLength(line)} bytes fit ${RECORD_ROOM + charged}`);
  }

  const read = await readAll(root, operationId);
  assert.deepEqual([read.summary.complete, read.summary.records, read.summary.problems], [true, 7, []]);
  assert.doesNotMatch(read.text, RAW_CONTROL, 'no raw terminal control reaches the output');
  for (const escaped of ['\\u202e', '\\u009b', '\\u2028', '\\udc00', '\\udfff']) assert.ok(read.text.includes(escaped), `${escaped} is shown escaped`);
  const shown = read.text.split('\n').filter((line) => / worker_evidence_pending /.test(line));
  assert.equal(shown.length, 1);
  assert.deepEqual(JSON.parse(shown[0].slice(shown[0].indexOf('{'))), readiness[3][1], 'the escaped line still decodes to the exact record');

  /**
   * A receive journal left with exactly the ordinary room `room(operationId, sequence)` names for its next record.
   * @param {(operationId: string, sequence: number) => number} room
   */
  const leaving = (room) => {
    const id = randomUUID();
    const journal = recorderAt(root).open(start(id, 'receive'));
    const size = () => fs.statSync(journal.path).size;
    let sequence = 1;
    while (ORDINARY_ROOM - size() - room(id, sequence + 2) > 2 * 33_000) {
      sequence += 1;
      assert.equal(journal.append({ kind: 'evidence_returned', conversationId, data: { text: 'x'.repeat(32_768) } }), true);
    }
    sequence += 1;
    const filler = sizedData(id, sequence, 'evidence_returned', ORDINARY_ROOM - size() - room(id, sequence + 1), conversationId);
    assert.equal(journal.append({ kind: 'evidence_returned', conversationId, data: filler }), true);
    assert.equal(ORDINARY_ROOM - size(), room(id, sequence + 1));
    return { id, journal, sequence, size };
  };
  /** @param {string} id @param {number} sequence */
  const readyLine = (id, sequence) => Buffer.byteLength(recordLine(id, sequence, 'worker_ready', ready, conversationId));
  const exact = leaving(readyLine);
  assert.equal(exact.journal.append({ kind: 'worker_ready', conversationId, data: ready }), true, 'a readiness record that ends exactly at the ordinary room is written');
  assert.equal(exact.size(), ORDINARY_ROOM);
  exact.journal.append({ kind: 'terminal', conversationId, data: { outcome: 'failed', reason: 'cancelled', delivery: 'not_sent' } });
  exact.journal.close();

  const short = leaving((id, sequence) => readyLine(id, sequence) - 1);
  const before = short.size();
  assert.equal(short.journal.append({ kind: 'worker_ready', conversationId, data: ready }), false, 'one byte short, it never enters the closing reserve');
  assert.equal(fs.readFileSync(short.journal.path).subarray(before).toString('utf8'),
    recordLine(short.id, short.sequence + 1, 'gap', { omitted: 'worker_ready', bytes: readyLine(short.id, short.sequence + 1), reason: 'capacity' }, conversationId),
    'the refusal leaves only an explicit gap');
  assert.equal(short.journal.append({ kind: 'terminal', conversationId, data: { outcome: 'failed', reason: 'recording_failed', delivery: 'not_sent' } }), true,
    'the terminal record still uses the reserve');
  short.journal.close();
  const gapped = await readAll(root, short.id);
  assert.deepEqual(gapped.summary.problems, [`gap at #${short.sequence + 1}: worker_ready left out (capacity)`]);
  assert.equal(gapped.summary.complete, false);
});

test('the CLI is a read-only tail: usage is exact, a retained read writes nothing, and a live follow streams records as they are written and matches the reread', async () => {
  const root = tempRoot();
  for (const args of [[], ['--root', root], ['--operation', randomUUID()], ['--root', root, '--operation', '../outside'],
    ['--root', root, '--operation', randomUUID(), '--follow', '--follow'], ['--root', root, '--root', root, '--operation', randomUUID()],
    ['--root', root, '--operation', randomUUID(), '--approve']]) {
    const result = cli(args);
    assert.deepEqual([result.status, result.stdout], [2, ''], JSON.stringify(args));
    assert.match(result.stderr, /^usage: node a2a-transcript\.mjs --root <workspace> --operation <operationId> \[--follow\]/);
  }
  const missing = cli(['--root', root, '--operation', randomUUID()]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^\[FAIL\] no journal is a regular file at /);
  assert.equal(fs.existsSync(path.join(root, '.dude')), false, 'a failed read creates nothing');

  const operationId = randomUUID();
  const conversationId = randomUUID();
  const recording = recorderAt(root).open(start(operationId, 'receive'));
  recording.append({ kind: 'accepted', conversationId: null, data: { role: 'receive' } });
  const before = snapshot(root);
  const child = spawn(process.execPath, [MODULE, '--root', root, '--operation', operationId, '--follow'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let live = '';
  let errors = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { live += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { errors += chunk; });
  const exited = new Promise((resolve) => { child.on('close', (code) => resolve(code)); });
  try {
    await waitFor(() => live.includes(' accepted '), 'the follower showed the existing records');
    assert.deepEqual(snapshot(root), before, 'following wrote nothing');
    let started = performance.now();
    recording.append({ kind: 'request_admitted', conversationId, data: { text: 'Which number?' } });
    await waitFor(() => live.includes(' request_admitted '), 'the admitted request appeared live');
    const seenMs = performance.now() - started;
    assert.ok(seenMs < 1_000, `a new record appeared in ${seenMs.toFixed(0)} ms`);
    assert.equal(live.includes(' terminal '), false, 'the follower has not invented an ending');
    started = performance.now();
    recording.append({ kind: 'terminal', conversationId, data: { outcome: 'sent', reason: null, delivery: 'written' } });
    recording.close();
    assert.equal(await exited, 0, errors);
    assert.ok(performance.now() - started < 2_000, 'the follower ends after the closed record');
  } finally {
    child.kill();
  }
  assert.ok(live.endsWith('-- journal complete: 5 records; outcome sent\n'), live);
  const settled = snapshot(root);
  const retained = cli(['--root', root, '--operation', operationId]);
  assert.deepEqual([retained.status, retained.stderr], [0, '']);
  assert.equal(retained.stdout, live, 'the retained reread matches the live view exactly');
  assert.equal(retained.stdout, (await readAll(root, operationId)).text, 'the CLI prints what the module reads');
  assert.deepEqual(snapshot(root), settled, 'a retained read writes nothing');

  // An unclosed journal read without following reports it incomplete and exits 1.
  const open = randomUUID();
  const pending = recorderAt(root).open(start(open));
  pending.append({ kind: 'accepted', conversationId, data: {} });
  const unfinished = cli(['--root', root, '--operation', open]);
  assert.equal(unfinished.status, 1);
  assert.ok(unfinished.stdout.endsWith('-- journal INCOMPLETE: no terminal record; not closed\n'));
  pending.close();
});

test('following a pending journal leaves the event loop free, shows new records within the poll, and an abort ends it with an incomplete summary', async () => {
  const root = tempRoot();
  const operationId = randomUUID();
  const recording = recorderAt(root).open(start(operationId));
  const controller = new AbortController();
  let text = '';
  const following = readTranscript({ root, operationId, follow: true, signal: controller.signal, pollMs: 20, write: (chunk) => { text += chunk; } });
  let ticks = 0;
  const started = performance.now();
  while (performance.now() - started < 150) {
    await new Promise((resolve) => setImmediate(resolve));
    ticks += 1;
  }
  assert.ok(ticks > 50, `unrelated work kept running while the journal was followed (${ticks} turns)`);
  recording.append({ kind: 'accepted', conversationId: null, data: { role: 'ask' } });
  await waitFor(() => text.includes(' accepted '), 'the new record');
  controller.abort();
  const summary = await following;
  assert.deepEqual([summary.complete, summary.problems], [false, ['no terminal record', 'not closed']]);
  assert.ok(text.endsWith('-- journal INCOMPLETE: no terminal record; not closed\n'));
  recording.close();
});

test('the transcript module imports nothing that can reach a peer, a session, a child process, or the network', () => {
  const source = fs.readFileSync(MODULE, 'utf8');
  const imports = [...source.matchAll(/^import [^;]* from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['node:fs', 'node:path', 'node:timers/promises', '../../../skills/dude-engine/lib/text.mjs',
    '../../../skills/dude-engine/lib/workspace-paths.mjs']);
  assert.doesNotMatch(source, /\bimport\(|\brequire\(|node:(?:net|http|https|tls|child_process|dgram|worker_threads)/);
});
