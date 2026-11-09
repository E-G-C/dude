// @ts-check
/**
 * Command checks for publish-first-capture.mjs: the ordinary capture stays
 * exactly as it was, and `--number-advice` reaches the same publisher,
 * inventory, transaction, postcondition, and lint.
 *
 * Every command runs as its own child process against a disposable
 * workspace. Advised captures read journals written by the real transcript
 * writer with the records an answered `dude_a2a_conversation` ask writes;
 * those records are this suite's reading of
 * src/extensions/dude/lib/a2a-collaboration.mjs (a shared-shape oracle). The
 * collaboration suite's real-journal capture test runs an actual peer pair
 * into this publisher and anchors that shape independently.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTranscriptRecorder } from '../../extensions/dude/lib/a2a-transcript.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CAPTURE = path.join(REPO, 'src/skills/dude-feature-definition/publish-first-capture.mjs');
const CONFIG = fs.readFileSync(path.join(REPO, 'src/config/agent-models.json'));
const NOW = Date.parse('2026-11-01T08:00:00Z');
const PROJECT = 'dude-number-poc';
/** @param {Buffer | string} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const PEER_PIN = sha256('dude-capture-test-peer-certificate');
const REASON = 'A explicitly uses B\'s recorded observation for this capture.';

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-capture-'));
  scratch.push(directory);
  return directory;
}

/** @param {string} root @param {string} relative @param {string | Buffer} content */
function write(root, relative, content) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @param {string} slug @param {string} [status] @param {string} [specPath] */
function ledger(slug, status = 'draft', specPath = '') {
  return Buffer.from(['---', `title: ${slug}`, `slug: ${slug}`, `status: ${status}`, `spec_path: ${specPath}`, '---', '', '## Idea', '',
    'Test intent.', '', '## Open Questions', '', '- None.', '', '## Assumptions', '', '- None.', '', '## Coordinator Log', '',
    '- 2026-11-01 Captured.', ''].join('\n'));
}

/** A lint-clean workspace holding `records`. @param {Array<{number: string, slug: string, status?: string}>} records */
function workspace(records = []) {
  const root = path.join(temporaryDirectory(), 'workspace');
  write(root, '.dude/metadata/bundle-manifest.md', '# Bundle Manifest\n\n```json\n{"source_repo":"x","source_ref":"main"}\n```\n');
  write(root, '.dude/metadata/profile.md', '# Install Profile\n\n```json\n{"installed":{}}\n```\n');
  write(root, '.github/skills/dude-engine/config/agent-models.json', CONFIG);
  write(root, '.github/skills/dude-engine/SKILL.md', '---\nname: dude-engine\ndescription: "fixture"\n---\n');
  for (const { number, slug, status = 'draft' } of records) {
    const specPath = status === 'defined' ? `.dude/specs/${number}-${slug}/spec.md` : '';
    if (specPath) write(root, specPath, '# Spec\n');
    write(root, `.dude/ideas/${number}-${slug}.md`, ledger(slug, status, specPath));
  }
  return root;
}

/** Every directory and file below `root`, with file bytes. @param {string} root */
function snapshot(root) {
  /** @type {string[]} */
  const entries = [];
  /** @param {string} directory @param {string} prefix */
  const visit = (directory, prefix) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      if (fs.lstatSync(absolute).isDirectory()) {
        entries.push(`d ${relative}`);
        visit(absolute, relative);
      } else entries.push(`f ${relative} ${sha256(fs.readFileSync(absolute))}`);
    }
  };
  visit(root, '');
  return entries;
}

/**
 * One answered asking conversation in `root`'s own journal, for slug delta
 * asked at tentative number 101.
 * @param {string} root @param {{maximum?: number, cited?: string[]}} [options] `cited` are B's record references.
 */
function recordAnswer(root, options = {}) {
  const operationId = randomUUID();
  const conversationId = randomUUID();
  const questionId = randomUUID();
  const exchangeId = randomUUID();
  const maximum = options.maximum ?? 101;
  const cited = options.cited ?? [`b-workspace/.dude/ideas/${String(maximum).padStart(3, '0')}-beta.md`];
  const text = JSON.stringify({ version: 1, kind: 'number_advice', projectId: PROJECT, conversationId, slug: 'delta', tentativeNumber: 101,
    question: 'Which is the highest lifecycle number in your approved records?' });
  const reply = {
    outcome: 'answer',
    exchangeId,
    conclusion: JSON.stringify({ version: 1, kind: 'number_advice', projectId: PROJECT, conversationId, slug: 'delta', observedMaximum: maximum,
      explanation: 'B read its highest approved record.' }),
    limitations: 'Only B approved lifecycle records were inspected.',
    evidence: cited.map((reference) => {
      const bytes = Buffer.from(`Recorded capture for ${reference}.\n`);
      return { kind: 'file', reference, lines: null, text: bytes.toString('utf8'), bytes: bytes.length, sha256: sha256(bytes),
        fileBytes: bytes.length, fileSha256: sha256(bytes), readAt: '2026-11-01T07:59:00.000Z', mtime: '2026-11-01T07:00:00.000Z',
        claimedProvenance: 'missing' };
    }),
    questionId,
  };
  const replyRecord = { sequence: 5, sha256: sha256(JSON.stringify(reply)) };
  const recording = createTranscriptRecorder({ root, now: () => NOW }).open({
    operationId, role: 'ask', profileId: 'a-ask', projectId: PROJECT, peer: { label: 'B', certSha256: PEER_PIN },
    configDigest: sha256('configuration'), contentBytes: 32_768,
  });
  for (const [kind, data] of /** @type {Array<[string, Record<string, unknown>]>} */ ([
    ['accepted', { role: 'ask', budgetMs: 60_000, slug: 'delta', tentativeNumber: 101 }],
    ['request_prepared', { text }],
    ['request_write_started', { body: JSON.stringify({ jsonrpc: '2.0', method: 'SendMessage', id: 1,
      params: { message: { messageId: questionId, parts: [{ text, mediaType: 'text/plain' }] } } }) }],
    ['reply_received', { reply }],
    ['reply_validated', { observedMaximum: maximum, reply: replyRecord }],
    ['terminal', { outcome: 'answer', reason: null, delivery: 'reached_peer' }],
  ])) assert.equal(recording.append({ kind, conversationId, data }), true, kind);
  recording.close();
  return {
    journal: recording.path,
    capture: { version: 1, slug: 'delta', projectId: PROJECT, conversationId, operationId, questionId, exchangeId, peerCertSha256: PEER_PIN,
      reply: replyRecord, observedMaximum: maximum },
  };
}

/**
 * The delta ledger and, when a conversation is given, advice for it, staged
 * outside the workspace as the capture delegation stages them.
 * @param {string} root @param {ReturnType<typeof recordAnswer>} [conversation] @param {Record<string, unknown>} [overrides]
 */
function stage(root, conversation, overrides = {}) {
  const directory = temporaryDirectory();
  const ledgerFile = path.join(directory, 'idea.md');
  fs.writeFileSync(ledgerFile, ledger('delta'));
  if (!conversation) return { ledgerFile, adviceFile: '' };
  const adviceFile = path.join(directory, 'advice.json');
  fs.writeFileSync(adviceFile, JSON.stringify({ ...conversation.capture, ledgerSha256: sha256(fs.readFileSync(ledgerFile)),
    workspace: fs.realpathSync.native(root), reason: REASON, ...overrides }, null, 2));
  return { ledgerFile, adviceFile };
}

/**
 * Run the publisher as the coordinator does.
 * @param {string} root @param {{ledgerFile: string, adviceFile: string}} staged
 * @param {{script?: string, preload?: string, advice?: boolean}} [options] `advice: false` runs the ordinary command.
 */
function publish(root, staged, options = {}) {
  const args = ['--root', root, '--slug', 'delta', '--stage', staged.ledgerFile];
  if (options.advice !== false && staged.adviceFile) args.push('--number-advice', staged.adviceFile);
  const preload = options.preload ? ['--import', pathToFileURL(options.preload).href] : [];
  return spawnSync(process.execPath, [...preload, options.script ?? CAPTURE, ...args], { encoding: 'utf8' });
}

/** @param {string} root @param {string} operationId */
function receiptOf(root, operationId) {
  return JSON.parse(fs.readFileSync(path.join(root, '.dude', 'state', 'a2a', 'captures', `${operationId}.json`), 'utf8'));
}

test('the ordinary command is unchanged: max-plus-one beside same-prefix peers, exact ledger bytes, one stdout line, and no A2A state', () => {
  const root = workspace([
    { number: '074', slug: 'one' }, { number: '074', slug: 'two', status: 'defined' }, { number: '075', slug: 'three', status: 'resolved' },
  ]);
  const staged = stage(root);
  const before = snapshot(root);

  const result = publish(root, staged);

  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '.dude/ideas/076-delta.md\n', '']);
  const after = snapshot(root);
  assert.deepEqual(before.filter((entry) => !after.includes(entry)), [], 'no existing identity or byte changed');
  assert.deepEqual(after.filter((entry) => !before.includes(entry)), [`f .dude/ideas/076-delta.md ${sha256(ledger('delta'))}`]);
  assert.equal(fs.existsSync(path.join(root, '.dude', 'state')), false, 'an ordinary capture records nothing under .dude/state');
});

test('the ordinary command needs no A2A module; an advised one without them refuses before any write', () => {
  // A copy of every non-test skill module, without the extension the advice reuses.
  const copy = path.join(temporaryDirectory(), 'skills');
  fs.cpSync(path.join(REPO, 'src', 'skills'), copy, { recursive: true, filter: (source) => !source.endsWith('.test.mjs') });
  const script = path.join(copy, 'dude-feature-definition', 'publish-first-capture.mjs');
  const root = workspace([{ number: '100', slug: 'gamma' }]);
  const conversation = recordAnswer(root);
  const staged = stage(root, conversation);
  const before = snapshot(root);

  const advised = publish(root, staged, { script });

  assert.equal(advised.status, 1);
  assert.equal(advised.stdout, '');
  assert.match(advised.stderr, /^\[FAIL\] .*a2a-collaboration\.mjs/);
  assert.deepEqual(snapshot(root), before, 'nothing was written');

  const ordinary = publish(root, staged, { script, advice: false });

  assert.deepEqual([ordinary.status, ordinary.stdout, ordinary.stderr], [0, '.dude/ideas/101-delta.md\n', '']);
});

test('accepted advice raises the capture past local knowledge: one ledger and one causal receipt in the same transaction', () => {
  const root = workspace([{ number: '100', slug: 'gamma' }]);
  const conversation = recordAnswer(root);
  const staged = stage(root, conversation);
  const journal = fs.readFileSync(conversation.journal);
  const before = snapshot(root);

  const result = publish(root, staged);

  assert.deepEqual([result.status, result.stdout, result.stderr], [0, '.dude/ideas/102-delta.md\n', '']);
  const receiptFile = `.dude/state/a2a/captures/${conversation.capture.operationId}.json`;
  const after = snapshot(root);
  assert.deepEqual(before.filter((entry) => !after.includes(entry)), []);
  assert.deepEqual(after.filter((entry) => !before.includes(entry)), [
    `f .dude/ideas/102-delta.md ${sha256(ledger('delta'))}`,
    'd .dude/state/a2a/captures',
    `f ${receiptFile} ${sha256(fs.readFileSync(path.join(root, ...receiptFile.split('/'))))}`,
  ]);
  assert.ok(fs.readFileSync(conversation.journal).equals(journal), 'the journal is evidence, never rewritten');
  const receipt = receiptOf(root, conversation.capture.operationId);
  assert.deepEqual([receipt.ideaPath, receipt.ledgerSha256, receipt.advice.sha256, receipt.advice.reason],
    ['.dude/ideas/102-delta.md', sha256(ledger('delta')), sha256(fs.readFileSync(staged.adviceFile)), REASON]);
  assert.deepEqual(receipt.conversation.reply, conversation.capture.reply);
  assert.deepEqual(receipt.selection, {
    tentativeNumber: 101, freshLocalMaximum: 100, peerObservedMaximum: 101, peerCitedFiles: 1, localOnlyNumber: 101, chosenNumber: 102,
    influence: 'raised',
  });
});

test('fresh local drift that dominates the advice is chosen and the receipt records no influence', () => {
  const root = workspace([{ number: '100', slug: 'gamma' }]);
  const conversation = recordAnswer(root);
  const staged = stage(root, conversation);
  // Captured locally after the question was asked.
  write(root, '.dude/ideas/105-epsilon.md', ledger('epsilon'));

  const result = publish(root, staged);

  assert.deepEqual([result.status, result.stdout], [0, '.dude/ideas/106-delta.md\n']);
  assert.deepEqual(receiptOf(root, conversation.capture.operationId).selection, {
    tentativeNumber: 101, freshLocalMaximum: 105, peerObservedMaximum: 101, peerCitedFiles: 1, localOnlyNumber: 106, chosenNumber: 106,
    influence: 'none',
  });
});

test('076 same-prefix identities stay valid and unchanged; advice never fills a gap', () => {
  for (const [label, maximum, expected, influence] of /** @type {Array<[string, number, string, string]>} */ ([
    ['the peer knows a higher record', 101, '102', 'raised'],
    ['the peer knows a lower shared prefix', 74, '076', 'none'],
    ['the peer saw an empty scope', 0, '076', 'none'],
  ])) {
    const root = workspace([
      { number: '074', slug: 'canvas-about' }, { number: '074', slug: 'evidence-handoff', status: 'defined' },
      { number: '075', slug: 'manual-resolution', status: 'defined' }, { number: '075', slug: 'base-release' },
    ]);
    const conversation = recordAnswer(root, { maximum, cited: maximum ? undefined : [] });
    const staged = stage(root, conversation);
    const peers = snapshot(root).filter((entry) => /\.dude\/(?:ideas|specs)\//.test(entry));

    const result = publish(root, staged);

    assert.deepEqual([result.status, result.stdout, result.stderr], [0, `.dude/ideas/${expected}-delta.md\n`, ''], label);
    const after = snapshot(root);
    assert.deepEqual(peers.filter((entry) => !after.includes(entry)), [], `${label}: every same-prefix peer is unchanged`);
    const selection = receiptOf(root, conversation.capture.operationId).selection;
    assert.deepEqual([selection.freshLocalMaximum, selection.chosenNumber, selection.influence], [75, Number(expected), influence], label);
  }
});

test('the 998 and 999 edges: advice may reach 999, never past it, and a refusal writes nothing', () => {
  for (const [label, local, maximum, expected] of /** @type {Array<[string, string, number, string | RegExp]>} */ ([
    ['a peer 998 above local 997', '997', 998, '.dude/ideas/999-delta.md\n'],
    ['local 998 with an empty peer scope', '998', 0, '.dude/ideas/999-delta.md\n'],
    ['a peer observation of 999', '100', 999, /^\[FAIL\] lifecycle identity range 001-999 is exhausted by the accepted peer observation 999\n$/],
    ['local 999', '999', 101, /^\[FAIL\] lifecycle identity range 001-999 is exhausted\n$/],
  ])) {
    const root = workspace([{ number: local, slug: 'last' }]);
    const conversation = recordAnswer(root, { maximum, cited: maximum ? undefined : [] });
    const staged = stage(root, conversation);
    const before = snapshot(root);

    const result = publish(root, staged);

    if (typeof expected === 'string') {
      assert.deepEqual([result.status, result.stdout, result.stderr], [0, expected, ''], label);
    } else {
      assert.deepEqual([result.status, result.stdout], [1, ''], label);
      assert.match(result.stderr, expected, label);
      assert.deepEqual(snapshot(root), before, `${label}: nothing was written`);
    }
  }
});

test('invalid advice fails before any write and never falls back to an ordinary capture', () => {
  for (const [label, prepare, expected] of /** @type {Array<[string, (root: string, staged: ReturnType<typeof stage>) => void, RegExp]>} */ ([
    ['a reply digest that is not the recorded reply', (root, staged) => {
      const advice = JSON.parse(fs.readFileSync(staged.adviceFile, 'utf8'));
      fs.writeFileSync(staged.adviceFile, JSON.stringify({ ...advice, reply: { ...advice.reply, sha256: sha256('another reply') } }));
    }, /^\[FAIL\] number advice refused: its reply is not the recorded reply: record 5 has SHA-256 [0-9a-f]{64}\n$/],
    ['a ledger changed after the decision', (root, staged) => { fs.appendFileSync(staged.ledgerFile, 'Edited later.\n'); },
      /^\[FAIL\] number advice refused: its ledgerSha256 is not the SHA-256 of the staged ledger bytes\n$/],
    ['a relative advice path', (root, staged) => { staged.adviceFile = 'advice.json'; },
      /^\[FAIL\] --number-advice must be an absolute file path\n$/],
  ])) {
    const root = workspace([{ number: '100', slug: 'gamma' }]);
    const staged = stage(root, recordAnswer(root));
    prepare(root, staged);
    const before = snapshot(root);

    const result = publish(root, staged);

    assert.deepEqual([result.status, result.stdout], [1, ''], label);
    assert.match(result.stderr, expected, label);
    assert.deepEqual(snapshot(root), before, `${label}: no ledger, receipt, or folder was written`);
  }
});

test('one conversation advises one capture: rerunning or replaying its advice refuses without writing', () => {
  const root = workspace([{ number: '100', slug: 'gamma' }]);
  const conversation = recordAnswer(root);
  const staged = stage(root, conversation);
  assert.equal(publish(root, staged).stdout, '.dude/ideas/102-delta.md\n');
  const receipt = `.dude/state/a2a/captures/${conversation.capture.operationId}.json`;
  for (const label of ['a rerun', 'a replay after the captured ledger was deleted']) {
    if (label !== 'a rerun') fs.rmSync(path.join(root, '.dude', 'ideas', '102-delta.md'));
    const before = snapshot(root);

    const result = publish(root, staged);

    assert.deepEqual([result.status, result.stdout], [1, ''], label);
    assert.equal(result.stderr, `[FAIL] number advice refused: its conversation already advised a capture: ${receipt} exists\n`, label);
    assert.deepEqual(snapshot(root), before, `${label}: nothing was written or overwritten`);
  }
});

test('a lint failure or inventory drift after both files landed removes the ledger, the receipt, and the new captures folder', () => {
  // Lint fails on a workspace without its bundle manifest.
  const unlinted = workspace([{ number: '100', slug: 'gamma' }]);
  fs.rmSync(path.join(unlinted, '.dude', 'metadata', 'bundle-manifest.md'));
  const lintStage = stage(unlinted, recordAnswer(unlinted));
  const lintBefore = snapshot(unlinted);

  const lint = publish(unlinted, lintStage);

  assert.deepEqual([lint.status, lint.stdout, lint.stderr], [1, '', '[FAIL] dude-lint failed\n']);
  assert.deepEqual(snapshot(unlinted), lintBefore, 'both files and the captures folder were removed');

  // A concurrent capture lands just after the receipt, the second rename; the
  // postcondition sees the drift. The hook observes the runtime's filesystem
  // calls from outside; the publisher has no test switch.
  const drifted = workspace([{ number: '100', slug: 'gamma' }]);
  const conversation = recordAnswer(drifted);
  const driftStage = stage(drifted, conversation);
  const concurrent = path.join(drifted, '.dude', 'ideas', '103-concurrent.md');
  const hook = path.join(temporaryDirectory(), 'concurrent-capture.mjs');
  fs.writeFileSync(hook, [
    "import fs from 'node:fs';",
    `const receipt = ${JSON.stringify(path.join(drifted, '.dude', 'state', 'a2a', 'captures', `${conversation.capture.operationId}.json`))};`,
    'const rename = fs.renameSync;',
    'fs.renameSync = function renameThenCapture(from, to) {',
    '  rename(from, to);',
    `  if (String(to) === receipt) fs.writeFileSync(${JSON.stringify(concurrent)}, ${JSON.stringify(ledger('concurrent').toString('utf8'))});`,
    '};',
    '',
  ].join('\n'));
  const driftBefore = snapshot(drifted);

  const drift = publish(drifted, driftStage, { preload: hook });

  assert.deepEqual([drift.status, drift.stdout, drift.stderr], [1, '', '[FAIL] lifecycle inventory drifted during first capture\n']);
  const after = snapshot(drifted);
  assert.deepEqual(after.filter((entry) => !driftBefore.includes(entry)), [`f .dude/ideas/103-concurrent.md ${sha256(ledger('concurrent'))}`],
    "only the concurrent writer's file remains: the ledger, the receipt, and the captures folder were removed");
  assert.deepEqual(driftBefore.filter((entry) => !after.includes(entry)), []);
});
