// @ts-check
/**
 * Checks for optional first-capture number advice (capture-number-advice.mjs).
 *
 * Each journal here is written by the real transcript writer
 * (src/extensions/dude/lib/a2a-transcript.mjs) with the records an answered
 * `dude_a2a_conversation` ask writes. Those records, and the reply digest, are
 * built from this suite's reading of src/extensions/dude/lib/a2a-collaboration.mjs,
 * so they are a shared-shape oracle, not independent proof of the collaboration
 * module: the collaboration suite's real-journal capture test is the anchor that
 * runs an actual peer pair and the actual publisher. Every refusal below starts
 * from advice this suite first accepts and changes exactly one input.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { createTranscriptRecorder, TRANSCRIPT_LIMITS } from '../../extensions/dude/lib/a2a-transcript.mjs';
import {
  NUMBER_ADVICE_LIMITS,
  RECEIPT_DIR,
  captureReceipt,
  chooseAdvisedNumber,
  readNumberAdvice,
  receiptPath,
} from './capture-number-advice.mjs';

const NOW = Date.parse('2026-11-01T08:00:00Z');
const PROJECT = 'dude-number-poc';
const QUESTION = 'Which is the highest lifecycle number in your approved records?';
/** @param {Buffer | string} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const PEER_PIN = sha256('dude-advice-test-peer-certificate');
const CONFIG_DIGEST = sha256('dude-advice-test-configuration');
const REASON = 'Local inventory knows only 100; B reports its approved record 101, which A cannot see.';
const BETA = 'Recorded capture 101 for beta.\n';

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

function tempRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-advice-'));
  scratch.push(directory);
  return directory;
}

/** A draft first-capture ledger. @param {string} slug */
function ledger(slug) {
  return Buffer.from(['---', `title: ${slug}`, `slug: ${slug}`, 'status: draft', 'spec_path:', '---', '', '## Idea', '', 'Test intent.', '',
    '## Open Questions', '', '- None.', '', '## Assumptions', '', '- None.', '', '## Coordinator Log', '', '- 2026-11-01 Captured.', ''].join('\n'));
}

/** File evidence as the serving adapter reads it. @param {string} reference @param {string} text */
function evidence(reference, text) {
  const bytes = Buffer.from(text, 'utf8');
  return {
    kind: 'file', reference, lines: null, text, bytes: bytes.length, sha256: sha256(bytes), fileBytes: bytes.length, fileSha256: sha256(bytes),
    readAt: '2026-11-01T07:59:00.000Z', mtime: '2026-11-01T07:00:00.000Z', claimedProvenance: 'missing',
  };
}

/**
 * One answered asking conversation in `root`'s own journal.
 * @param {string} root
 * @param {{slug?: string, tentativeNumber?: number, maximum?: number, cited?: Array<[string, string]>, role?: 'ask' | 'receive',
 *   edit?: (records: Array<[string, Record<string, any>]>) => void, close?: boolean}} [options]
 *   `maximum` is the reply's and its validation's observed maximum; `edit` changes the records before they are written.
 */
function recordConversation(root, options = {}) {
  const operationId = randomUUID();
  const conversationId = randomUUID();
  const questionId = randomUUID();
  const exchangeId = randomUUID();
  const slug = options.slug ?? 'delta';
  const tentativeNumber = options.tentativeNumber ?? 101;
  const maximum = options.maximum ?? 101;
  const cited = options.cited ?? [['b-workspace/.dude/ideas/101-beta.md', BETA]];
  const text = JSON.stringify({ version: 1, kind: 'number_advice', projectId: PROJECT, conversationId, slug, tentativeNumber, question: QUESTION });
  const body = JSON.stringify({
    jsonrpc: '2.0', method: 'SendMessage', id: 1,
    params: { message: { messageId: questionId, role: 'ROLE_USER', parts: [{ text, mediaType: 'text/plain' }] } },
  });
  const reply = {
    outcome: 'answer',
    exchangeId,
    conclusion: JSON.stringify({
      version: 1, kind: 'number_advice', projectId: PROJECT, conversationId, slug, observedMaximum: maximum, explanation: 'B read its highest approved record.',
    }),
    limitations: 'Only B approved lifecycle records were inspected.',
    evidence: cited.map(([reference, content]) => evidence(reference, content)),
    questionId,
  };
  const replyRecord = { sequence: 5, sha256: sha256(JSON.stringify(reply)) };
  /** @type {Array<[string, Record<string, any>]>} */
  const records = [
    ['accepted', { role: 'ask', budgetMs: 60_000, slug, tentativeNumber }],
    ['request_prepared', { text }],
    ['request_write_started', { body }],
    ['reply_received', { reply }],
    ['reply_validated', { observedMaximum: maximum, reply: replyRecord }],
    ['terminal', { outcome: 'answer', reason: null, delivery: 'reached_peer' }],
  ];
  options.edit?.(records);
  const recording = createTranscriptRecorder({ root, now: () => NOW }).open({
    operationId, role: options.role ?? 'ask', profileId: 'a-ask', projectId: PROJECT, peer: { label: 'B', certSha256: PEER_PIN },
    configDigest: CONFIG_DIGEST, contentBytes: 32_768,
  });
  for (const [kind, data] of records) assert.equal(recording.append({ kind, conversationId, data }), true, `${kind} recorded`);
  if (options.close !== false) recording.close();
  return {
    journal: recording.path,
    capture: {
      version: 1, slug, projectId: PROJECT, conversationId, operationId, questionId, exchangeId, peerCertSha256: PEER_PIN, reply: replyRecord,
      observedMaximum: maximum,
    },
  };
}

/**
 * A workspace with one recorded answer, its staged `delta` draft ledger, and
 * advice that matches both; `advice` overrides advice fields.
 * @param {Parameters<typeof recordConversation>[1] & {advice?: Record<string, unknown>}} [options]
 */
function fixture(options = {}) {
  const root = path.join(tempRoot(), 'workspace');
  fs.mkdirSync(root);
  const stage = path.join(path.dirname(root), 'stage');
  fs.mkdirSync(stage);
  const conversation = recordConversation(root, options);
  const staged = ledger('delta');
  const ledgerFile = path.join(stage, 'idea.md');
  fs.writeFileSync(ledgerFile, staged);
  const advice = {
    ...conversation.capture, ledgerSha256: sha256(staged), workspace: fs.realpathSync.native(root), reason: REASON, ...options.advice,
  };
  const file = path.join(stage, 'advice.json');
  fs.writeFileSync(file, `${JSON.stringify(advice, null, 2)}\n`);
  return { root, stage, ledgerFile, staged, file, advice, ...conversation };
}

/** @param {ReturnType<typeof fixture>} context @param {Buffer} [ledgerBytes] */
function check(context, ledgerBytes = context.staged) {
  return readNumberAdvice({ root: context.root, slug: 'delta', ledger: ledgerBytes, file: context.file });
}

/** The action refuses with a message matching `expected`. @param {() => unknown} action @param {RegExp} expected */
function refusedWith(action, expected) {
  assert.throws(action, (/** @type {unknown} */ error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, expected);
    return true;
  });
}

/** Rewrite one journal's records, as JSON lines exactly like the writer's. @param {string} file @param {(records: any[]) => any[]} change */
function editJournal(file, change) {
  const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  fs.writeFileSync(file, change(records).map((record) => `${typeof record === 'string' ? record : JSON.stringify(record)}\n`).join(''));
}

/** @param {any[]} records @param {string} kind */
const recordOf = (records, kind) => records.find((record) => record.kind === kind);

test('advice that matches its staged draft, this workspace, and its own complete answered conversation is accepted with what was recorded', () => {
  const context = fixture();
  const before = fs.readFileSync(context.journal);

  const accepted = check(context);

  assert.deepEqual(accepted, {
    ...context.advice,
    adviceSha256: sha256(fs.readFileSync(context.file)),
    configDigest: CONFIG_DIGEST,
    tentativeNumber: 101,
    citedFiles: 1,
  });
  assert.ok(fs.readFileSync(context.journal).equals(before), 'checking reads the journal and writes nothing');
  assert.equal(fs.existsSync(path.join(context.root, ...RECEIPT_DIR.split('/'))), false, 'checking creates no receipt');
  assert.deepEqual(fs.readdirSync(path.join(context.root, '.dude')), ['state'], 'checking captures nothing');
});

test('a valid empty peer observation is zero without citations, and its partial knowledge is accepted as only an observation', () => {
  const context = fixture({ maximum: 0, cited: [] });
  const accepted = check(context);
  assert.deepEqual([accepted.observedMaximum, accepted.citedFiles], [0, 0]);
});

test('each refusal names the one input that does not match, while every other input stays valid', async (t) => {
  /** @type {Array<[string, (context: ReturnType<typeof fixture>) => Buffer | void, RegExp, Parameters<typeof fixture>[0]?]>} */
  const cases = [
    // The advice file itself.
    ['advice that is a directory', (c) => { fs.rmSync(c.file); fs.mkdirSync(c.file); }, /^number advice refused: the advice file must be a regular file$/],
    ['missing advice', (c) => { fs.rmSync(c.file); }, /^number advice refused: the advice file cannot be read$/],
    ['advice over 4096 bytes', (c) => { fs.writeFileSync(c.file, `${JSON.stringify(c.advice)}${' '.repeat(NUMBER_ADVICE_LIMITS.fileBytes)}`); },
      /^number advice refused: the advice file exceeds 4096 bytes$/],
    ['advice that is not JSON', (c) => { fs.writeFileSync(c.file, 'observedMaximum: 101\n'); }, /^number advice refused: the advice file is not UTF-8 JSON$/],
    ['advice that is not an object', (c) => { fs.writeFileSync(c.file, '[]\n'); }, /^number advice refused: the advice file is not a JSON object$/],
    ['an unknown field', () => undefined, /^number advice refused: unknown field "reservation"$/, { advice: { reservation: 'held' } }],
    ['a missing reason', (c) => { const { reason, ...rest } = c.advice; fs.writeFileSync(c.file, JSON.stringify(rest)); },
      /^number advice refused: missing field reason$/],
    ['another version', () => undefined, /^number advice refused: invalid field version$/, { advice: { version: 2 } }],
    ['a reason over 512 bytes', () => undefined, /^number advice refused: invalid field reason$/, { advice: { reason: 'é'.repeat(257) } }],
    ['a reason with a control character', () => undefined, /^number advice refused: invalid field reason$/, { advice: { reason: 'use\u0007it' } }],
    ['an out-of-range maximum', () => undefined, /^number advice refused: invalid field observedMaximum$/, { advice: { observedMaximum: 1000 } }],
    ['a reply without its digest', () => undefined, /^number advice refused: invalid field reply$/, { advice: { reply: { sequence: 5 } } }],
    ['a journal path instead of an operation ID', () => undefined, /^number advice refused: invalid field operationId$/,
      { advice: { operationId: '../../outside' } }],
    // The staged draft and this workspace.
    ['advice for another slug', () => undefined, /^number advice refused: it is for slug other, not delta$/, { advice: { slug: 'other' } }],
    ['a ledger edited after the decision', (c) => Buffer.concat([c.staged, Buffer.from('Edited later.\n')]),
      /^number advice refused: its ledgerSha256 is not the SHA-256 of the staged ledger bytes$/],
    ['another workspace', (c) => { rewrite(c, { workspace: path.join(path.dirname(c.root), 'other-workspace') }); },
      /^number advice refused: its workspace is not this workspace's canonical root /],
    // One conversation advises one capture.
    ['an existing receipt', (c) => { putFile(c.root, receiptPath(c.capture.operationId), '{}\n'); },
      /^number advice refused: its conversation already advised a capture: \.dude\/state\/a2a\/captures\/[0-9a-f-]{36}\.json exists$/],
    ['a captures entry that is a file', (c) => { putFile(c.root, RECEIPT_DIR, 'not a directory\n'); },
      /^number advice refused: its receipt \.dude\/state\/a2a\/captures\/[0-9a-f-]{36}\.json cannot be created \(.*non-directory parent/],
    // The journal derived from the operation ID.
    ['no journal for the operation', (c) => { rewrite(c, { operationId: randomUUID() }); },
      /^number advice refused: the journal \.dude\/state\/a2a\/[0-9a-f-]{36}\.jsonl cannot be read$/],
    ['a journal that is a directory', (c) => { fs.rmSync(c.journal); fs.mkdirSync(c.journal); },
      /^number advice refused: the journal \.dude\/state\/a2a\/[0-9a-f-]{36}\.jsonl must be a regular file$/],
    ['a journal over 1 MiB', (c) => { fs.appendFileSync(c.journal, Buffer.alloc(TRANSCRIPT_LIMITS.journalBytes, 0x20)); },
      /^number advice refused: the journal \.dude\/state\/a2a\/[0-9a-f-]{36}\.jsonl exceeds 1048576 bytes$/],
    ['a serving journal', () => undefined, /^number advice refused: its journal is not an asking conversation$/, { role: 'receive' }],
    ['another project', () => undefined, /^number advice refused: its projectId is not the project its conversation was approved for$/,
      { advice: { projectId: 'other-project' } }],
    ['another peer pin', () => undefined, /^number advice refused: its peerCertSha256 is not the peer pin its conversation was approved with$/,
      { advice: { peerCertSha256: sha256('another peer') } }],
    ['another conversation', () => undefined, /^number advice refused: the journal \S+ record 2 belongs to another conversation$/,
      { advice: { conversationId: randomUUID() } }],
    ['a conversation that asked about another slug', () => undefined, /^number advice refused: its conversation asked about slug other, not delta$/,
      { slug: 'other', advice: { slug: 'delta' } }],
    ['a request for another project', () => undefined,
      /^number advice refused: its recorded request is not this project's number_advice question \(project_mismatch\)$/,
      { edit: (records) => { records[1][1].text = records[1][1].text.replace(`"projectId":"${PROJECT}"`, '"projectId":"other-project"'); } }],
    ['another question', () => undefined, /^number advice refused: its questionId is not the recorded request's message ID$/,
      { advice: { questionId: randomUUID() } }],
    ['a request body that carries another request', () => undefined,
      /^number advice refused: its recorded request body does not carry the recorded request$/,
      { edit: (records) => { records[2][1].body = records[2][1].body.replace('tentativeNumber', 'tentative'); } }],
    ['another exchange', () => undefined, /^number advice refused: its exchangeId is not the recorded reply's exchange$/,
      { advice: { exchangeId: randomUUID() } }],
    ['a tampered excerpt', (c) => {
      editJournal(c.journal, (records) => { recordOf(records, 'reply_received').data.reply.evidence[0].text = 'Recorded capture 150.\n'; return records; });
    }, /^number advice refused: its recorded reply is not a valid answer envelope with matching excerpt hashes$/],
    ['a worker maximum its citations do not support', () => undefined,
      /^number advice refused: its recorded reply is not valid number advice \(maximum_not_cited\)$/, { maximum: 150 }],
    ['zero with citations', () => undefined, /^number advice refused: its recorded reply is not valid number advice \(maximum_not_cited\)$/,
      { maximum: 0 }],
    ['another observed maximum', () => undefined, /^number advice refused: its observedMaximum 150 is not the recorded reply's 101$/,
      { advice: { observedMaximum: 150 } }],
    ['another reply digest', () => undefined, /^number advice refused: its reply is not the recorded reply: record 5 has SHA-256 [0-9a-f]{64}$/,
      { advice: { reply: { sequence: 5, sha256: sha256('another reply') } } }],
    ['another reply sequence', (c) => { rewrite(c, { reply: { ...c.capture.reply, sequence: 6 } }); },
      /^number advice refused: its reply is not the recorded reply: record 5 has SHA-256 [0-9a-f]{64}$/],
    ['a validation of another maximum', (c) => {
      editJournal(c.journal, (records) => { recordOf(records, 'reply_validated').data.observedMaximum = 100; return records; });
    }, /^number advice refused: its asker did not validate this reply and maximum at receipt$/],
    ['a validation of another reply', (c) => {
      editJournal(c.journal, (records) => { recordOf(records, 'reply_validated').data.reply.sha256 = '0'.repeat(64); return records; });
    }, /^number advice refused: its asker did not validate this reply and maximum at receipt$/],
    ['a rejected reply', () => undefined, /^number advice refused: the journal \S+ record 6 is reply_rejected, not reply_validated: it is not one complete answered conversation$/,
      { edit: (records) => { records[4] = ['reply_rejected', { reason: 'maximum_not_cited' }]; } }],
    ['a recording gap', (c) => {
      editJournal(c.journal, (records) => {
        records[5] = { ...records[5], kind: 'gap', data: { omitted: 'reply_validated', bytes: 512, reason: 'capacity' } };
        return records;
      });
    }, /^number advice refused: the journal \S+ record 6 is gap, not reply_validated: it is not one complete answered conversation$/],
    ['another terminal outcome', () => undefined, /^number advice refused: its conversation did not end in this answer$/,
      { edit: (records) => { records[5] = ['terminal', { outcome: 'cancelled', reason: 'cancelled', delivery: 'reached_peer' }]; } }],
    ['a journal that never closed', () => undefined,
      /^number advice refused: the journal \S+ has no closed record: it is not one complete answered conversation$/, { close: false }],
    ['a closed record that counts gaps', (c) => {
      editJournal(c.journal, (records) => { recordOf(records, 'closed').data.gaps = 1; return records; });
    }, /^number advice refused: its journal recorded gaps$/],
    ['a torn final record', (c) => { fs.appendFileSync(c.journal, '{"version":1,"sequence":9'); },
      /^number advice refused: the journal \S+ ends with an incomplete record$/],
    ['a record after the closed record', (c) => {
      editJournal(c.journal, (records) => [...records, { ...records[7], sequence: 9, kind: 'terminal' }]);
    }, /^number advice refused: the journal \S+ has records after its closed record$/],
    ['records out of sequence', (c) => {
      editJournal(c.journal, (records) => { records[3].sequence = 7; return records; });
    }, /^number advice refused: the journal \S+ record 4 is out of sequence$/],
    ['an unreadable record', (c) => {
      editJournal(c.journal, (records) => { records[2] = 'not a record'; return records; });
    }, /^number advice refused: the journal \S+ record 3 is unreadable$/],
  ];
  for (const [label, mutate, expected, options] of cases) {
    await t.test(label, () => {
      const context = fixture(options);
      // Without fixture options the unchanged companion is accepted, so the one mutation below is what refuses.
      if (!options) assert.equal(check(context).operationId, context.capture.operationId);
      const ledgerBytes = mutate(context) ?? context.staged;
      refusedWith(() => check(context, ledgerBytes), expected);
    });
  }

  /** @param {ReturnType<typeof fixture>} context @param {Record<string, unknown>} fields */
  function rewrite(context, fields) {
    fs.writeFileSync(context.file, JSON.stringify({ ...context.advice, ...fields }));
  }
  /** @param {string} root @param {string} relative @param {string} content */
  function putFile(root, relative, content) {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
});

test('an advice link is refused rather than followed', (t) => {
  const context = fixture();
  const link = path.join(context.stage, 'advice-link.json');
  try {
    fs.symlinkSync(context.file, link, 'file');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM') return void t.skip('this host cannot create file links');
    throw error;
  }
  assert.equal(check(context).operationId, context.capture.operationId);
  refusedWith(() => readNumberAdvice({ root: context.root, slug: 'delta', ledger: context.staged, file: link }),
    /^number advice refused: the advice file must be a regular file$/);
});

test('the advised number is one above the larger of the fresh local maximum and the peer observation, never filling a gap or passing 999', () => {
  for (const [label, localNext, peer, expected] of /** @type {Array<[string, number, number, [string, string, number, number]]>} */ ([
    ['peer knows a higher record', 101, 101, ['102', 'raised', 100, 101]],
    ['peer knows less than this workspace', 101, 99, ['101', 'none', 100, 101]],
    ['local drift dominates the advice', 106, 101, ['106', 'none', 105, 106]],
    ['a valid empty peer observation', 101, 0, ['101', 'none', 100, 101]],
    ['the same maximum on both sides', 101, 100, ['101', 'none', 100, 101]],
    ['998 seen by the peer', 998, 998, ['999', 'raised', 997, 998]],
    ['998 known locally', 999, 998, ['999', 'none', 998, 999]],
    ['an empty workspace', 1, 0, ['001', 'none', 0, 1]],
  ])) {
    const selection = chooseAdvisedNumber({ observedMaximum: peer }, localNext);
    assert.deepEqual([selection.number, selection.influence, selection.freshLocalMaximum, selection.localOnlyNumber], expected, label);
    assert.equal(selection.numberValue, Number(expected[0]), label);
  }
  refusedWith(() => chooseAdvisedNumber({ observedMaximum: 999 }, 101),
    /^lifecycle identity range 001-999 is exhausted by the accepted peer observation 999$/);
  for (const localNext of [0, 1000, Number.NaN]) {
    refusedWith(() => chooseAdvisedNumber({ observedMaximum: 1 }, localNext), /^the fresh local inventory has no next lifecycle number$/);
  }
});

test('the receipt records correlation, digests, baseline, observation, choice, exact path, and influence within 4 KiB', () => {
  const context = fixture();
  const accepted = check(context);
  for (const [localNext, number, influence] of /** @type {Array<[number, string, string]>} */ ([[101, '102', 'raised'], [106, '106', 'none']])) {
    const selection = chooseAdvisedNumber(accepted, localNext);
    const ideaPath = `.dude/ideas/${number}-delta.md`;

    const receipt = captureReceipt(accepted, selection, ideaPath);

    assert.equal(receipt.path, `.dude/state/a2a/captures/${context.capture.operationId}.json`);
    assert.ok(receipt.bytes.length <= TRANSCRIPT_LIMITS.receiptBytes);
    assert.equal(receipt.bytes.toString('utf8').includes('\r'), false, 'LF only');
    assert.equal(receipt.bytes.at(-1), 0x0a);
    assert.deepEqual(JSON.parse(receipt.bytes.toString('utf8')), {
      version: 1,
      kind: 'number_advice_receipt',
      ideaPath,
      slug: 'delta',
      ledgerSha256: sha256(context.staged),
      advice: { sha256: sha256(fs.readFileSync(context.file)), reason: REASON },
      conversation: {
        projectId: PROJECT,
        operationId: context.capture.operationId,
        conversationId: context.capture.conversationId,
        questionId: context.capture.questionId,
        exchangeId: context.capture.exchangeId,
        peerCertSha256: PEER_PIN,
        configDigest: CONFIG_DIGEST,
        reply: context.capture.reply,
      },
      selection: {
        tentativeNumber: 101,
        freshLocalMaximum: localNext - 1,
        peerObservedMaximum: 101,
        peerCitedFiles: 1,
        localOnlyNumber: localNext,
        chosenNumber: Number(number),
        influence,
      },
    });
  }
  // No real slug is this long; the bound is still enforced rather than assumed.
  const long = { ...accepted, slug: 'a'.repeat(2_000) };
  refusedWith(() => captureReceipt(long, chooseAdvisedNumber(long, 101), `.dude/ideas/102-${long.slug}.md`),
    /^number advice refused: its receipt would exceed 4096 bytes$/);
});
