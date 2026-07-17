// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run, parseArgs } from './board.mjs';

/** Absolute path to the board CLI, spawned as a child process end-to-end. */
const BOARD_CLI = fileURLToPath(new URL('./board.mjs', import.meta.url));

/**
 * Spawn the current board CLI as a child process. This runs against whatever
 * board.mjs currently is (no in-test import of the shared task-state lib), so
 * the fail-closed regressions below are BEHAVIORAL — red against the current
 * board, green once the corruption guard lands.
 * @param {string[]} argv
 */
function boardCli(argv) {
  return spawnSync(process.execPath, [BOARD_CLI, ...argv], { encoding: 'utf8' });
}

/**
 * Load the shared task-state lib. Production (the T037 Coder step) adds
 * ../dude-engine/lib/task-state.mjs and removes board's readSnapshot export;
 * until then this rejects with ERR_MODULE_NOT_FOUND, keeping the migrated
 * snapshot assertions RED (TDD) while the rest of this file still runs against
 * the current board.
 * @returns {Promise<any>}
 */
function loadTaskStateLib() {
  // @ts-ignore -- ../dude-engine/lib/task-state.mjs is created by the T037 Coder step
  return import('../dude-engine/lib/task-state.mjs');
}

const FIXTURE = `# Feature X — tasks

## Setup
- [x] T001@aaaaaaaa Setup repo

## Foundational
- [ ] T002@bbbbbbbb Foundational schema
   deps: T001@aaaaaaaa

## Polish
- [ ] T003@cccccccc Final polish
`;

/** Build a throwaway root with a canonical tasks.md and state directory. */
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-board-'));
  fs.mkdirSync(path.join(root, '.dude', 'state'), { recursive: true });
  fs.mkdirSync(path.join(root, '.dude', 'specs', 'x'), { recursive: true });
  const file = path.join(root, '.dude', 'specs', 'x', 'tasks.md');
  fs.writeFileSync(file, FIXTURE);
  return { root, file };
}

/** @param {string|Buffer} content */
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** Capture stdout + stderr produced by run(). */
function capture(fn) {
  const chunks = [];
  const outOrig = process.stdout.write.bind(process.stdout);
  const errOrig = process.stderr.write.bind(process.stderr);
  // @ts-ignore
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  // @ts-ignore
  process.stderr.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  let code;
  try {
    code = fn();
  } finally {
    process.stdout.write = outOrig;
    process.stderr.write = errOrig;
  }
  return { code, out: chunks.join('') };
}

test('parseArgs reads command, file, flags, and root', () => {
  const a = parseArgs(['render', 'tasks.md', '--write', '--root', '/tmp/x']);
  assert.equal(a.cmd, 'render');
  assert.equal(a.file, 'tasks.md');
  assert.equal(a.write, true);
  assert.equal(a.root, '/tmp/x');
});

test('next prints the top ready task', () => {
  const { root, file } = scaffold();
  try {
    const { code, out } = capture(() => run({ cmd: 'next', file, root }));
    assert.equal(code, 0);
    assert.equal(out.trim(), 'T002@bbbbbbbb');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('render --check reports stale (exit 3) then clean (exit 0) after --write', async () => {
  const { root, file } = scaffold();
  try {
    assert.equal(capture(() => run({ cmd: 'render', file, root, check: true })).code, 3);
    const w = capture(() => run({ cmd: 'render', file, root, write: true }));
    assert.equal(w.code, 0);
    assert.ok(fs.readFileSync(file, 'utf8').includes('<!-- dude:board:start -->'));
    assert.equal(capture(() => run({ cmd: 'render', file, root, check: true })).code, 0);
    // snapshot recorded (read via the shared task-state lib the Coder introduces)
    const { readTaskState } = await loadTaskStateLib();
    const snap = readTaskState(root);
    assert.equal(snap.status, 'ok');
    assert.equal(snap.state['.dude/specs/x/tasks.md'].glyphs['T001@aaaaaaaa'], 'x');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('set --write flips the glyph and updates the snapshot', async () => {
  const { root, file } = scaffold();
  try {
    // establish a baseline snapshot first
    run({ cmd: 'render', file, root, write: true });
    const r = capture(() => run({ cmd: 'set', file, id: 'T002@bbbbbbbb', state: 'done', root, write: true }));
    assert.equal(r.code, 0);
    assert.ok(fs.readFileSync(file, 'utf8').includes('- [x] T002@bbbbbbbb Foundational schema'));
    const { readTaskState } = await loadTaskStateLib();
    const snap = readTaskState(root);
    assert.equal(snap.status, 'ok');
    assert.equal(snap.state['.dude/specs/x/tasks.md'].glyphs['T002@bbbbbbbb'], 'x');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('set without --write is a dry run and does not touch the file', () => {
  const { root, file } = scaffold();
  try {
    const before = fs.readFileSync(file, 'utf8');
    const r = capture(() => run({ cmd: 'set', file, id: 'T002@bbbbbbbb', state: 'x', root }));
    assert.equal(r.code, 0);
    assert.match(r.out, /dry run/);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'file unchanged');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('set dry-run: LF, CRLF, and bare CR show exact logical task-unit changes', () => {
  const logicalLines = [
    '# Dry-run tasks',
    '',
    '## User Story 1',
    '- [ ] T019@cccccccc Glyph-only task',
    '- [ ] T020@dddddddd Blocker insertion task',
    '- [!] T021@eeeeeeee Blocker update task',
    '   blocked-by: old reason',
    '',
  ];
  const scenarios = [
    {
      name: 'glyph-only change',
      id: 'T019@cccccccc',
      state: 'done',
      oldLines: ['- [ ] T019@cccccccc Glyph-only task'],
      newLines: ['- [x] T019@cccccccc Glyph-only task'],
    },
    {
      name: 'blocked-by insertion',
      id: 'T020@dddddddd',
      state: 'blocked',
      blockedBy: 'awaiting approval',
      oldLines: ['- [ ] T020@dddddddd Blocker insertion task'],
      newLines: [
        '- [!] T020@dddddddd Blocker insertion task',
        '   blocked-by: awaiting approval',
      ],
    },
    {
      name: 'blocked-by update',
      id: 'T021@eeeeeeee',
      state: 'blocked',
      blockedBy: 'new reason',
      oldLines: ['   blocked-by: old reason'],
      newLines: ['   blocked-by: new reason'],
    },
  ];

  for (const separator of ['\n', '\r\n', '\r']) {
    for (const scenario of scenarios) {
      const { root, file } = scaffold();
      try {
        const content = logicalLines.join(separator);
        fs.writeFileSync(file, content);
        const result = capture(() => run({
          cmd: 'set',
          file,
          id: scenario.id,
          state: scenario.state,
          blockedBy: scenario.blockedBy,
          root,
        }));
        const expected = [
          ...scenario.oldLines.map((line) => `- ${line}`),
          ...scenario.newLines.map((line) => `+ ${line}`),
          '(dry run; pass --write to apply)',
          '',
        ].join('\n');

        assert.equal(result.code, 0, `${JSON.stringify(separator)}: ${scenario.name}`);
        assert.equal(result.out, expected, `${JSON.stringify(separator)}: ${scenario.name}`);
        assert.doesNotMatch(result.out, /\r|undefined/, `${JSON.stringify(separator)}: ${scenario.name}`);
        assert.equal(fs.readFileSync(file, 'utf8'), content, `${JSON.stringify(separator)}: ${scenario.name}`);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test('set on an unknown id exits 2', () => {
  const { root, file } = scaffold();
  try {
    assert.equal(capture(() => run({ cmd: 'set', file, id: 'T404@00000000', state: 'x', root, write: true })).code, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff flags a human-applied [x] after a baseline is recorded', () => {
  const { root, file } = scaffold();
  try {
    run({ cmd: 'render', file, root, write: true }); // baseline snapshot
    // simulate a user hand-checking T003
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- [ ] T003@cccccccc', '- [x] T003@cccccccc'));
    const r = capture(() => run({ cmd: 'diff', file, root }));
    assert.match(r.out, /UNVERIFIED-DONE\] T003@cccccccc/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff without a snapshot reports no baseline', () => {
  const { root, file } = scaffold();
  try {
    const r = capture(() => run({ cmd: 'diff', file, root }));
    assert.match(r.out, /no snapshot baseline/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('apply-states --write batch-updates glyphs, warns unknown, refreshes snapshot', async () => {
  const { root, file } = scaffold();
  try {
    const mapFile = path.join(root, 'map.json');
    fs.writeFileSync(mapFile, JSON.stringify({ 'T002@bbbbbbbb': 'done', 'T404@00000000': 'x' }));
    const r = capture(() => run({ cmd: 'apply-states', file, root, fromPath: mapFile, write: true }));
    assert.equal(r.code, 0);
    assert.match(r.out, /unknown task id in map: T404@00000000/);
    assert.ok(fs.readFileSync(file, 'utf8').includes('- [x] T002@bbbbbbbb Foundational schema'));
    const { readTaskState } = await loadTaskStateLib();
    const snap = readTaskState(root);
    assert.equal(snap.status, 'ok');
    assert.equal(snap.state['.dude/specs/x/tasks.md'].glyphs['T002@bbbbbbbb'], 'x');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing file exits 2; usage without args exits 1', () => {
  assert.equal(capture(() => run({ cmd: 'next', file: '/nope/tasks.md', root: '/tmp' })).code, 2);
  assert.equal(capture(() => run({ help: false })).code, 1);
});

test('board structure: every malformed CLI path exits 2 without writes or snapshots', () => {
  const { root, file } = scaffold();
  try {
    const malformed = `# Malformed board

## User Story 1
- [ ] T019@cccccccc Active task
<!-- dude:board:start -->
- [ ] T020@dddddddd Inside-fence task
<!-- dude:board:start -->
<!-- dude:board:end -->

## Lightweight Execution History
- [x] T012@bbbbbbbb Would-be archive task
`;
    const mapFile = path.join(root, 'map.json');
    fs.writeFileSync(file, malformed);
    fs.writeFileSync(mapFile, JSON.stringify({ 'T019@cccccccc': 'done' }));
    const fileSha = sha256(fs.readFileSync(file));

    const parsedJson = capture(() => run({ cmd: 'parse', file, root, json: true }));
    assert.equal(parsedJson.code, 2);
    const payload = JSON.parse(parsedJson.out);
    assert.deepEqual(payload.tasks, []);
    assert.match(payload.boardIssue, /malformed active board structure/);
    assert.ok(payload.warnings.includes(payload.boardIssue));
    assert.deepEqual(payload.diagnosticTaskLines.map(({ text }) => text), [
      '- [ ] T019@cccccccc Active task',
      '- [ ] T020@dddddddd Inside-fence task',
      '- [x] T012@bbbbbbbb Would-be archive task',
    ]);

    const operations = [
      ['parse plain', { cmd: 'parse', file, root }],
      ['ready', { cmd: 'ready', file, root, json: true }],
      ['next', { cmd: 'next', file, root }],
      ['diff', { cmd: 'diff', file, root }],
      ['render stdout', { cmd: 'render', file, root, stdout: true }],
      ['render check', { cmd: 'render', file, root, check: true }],
      ['render write', { cmd: 'render', file, root, write: true }],
      ['set dry-run', { cmd: 'set', file, root, id: 'T019@cccccccc', state: 'done' }],
      ['set write', { cmd: 'set', file, root, id: 'T019@cccccccc', state: 'done', write: true }],
      ['apply dry-run', { cmd: 'apply-states', file, root, fromPath: mapFile }],
      ['apply write', { cmd: 'apply-states', file, root, fromPath: mapFile, write: true }],
    ];
    for (const [name, operation] of operations) {
      const result = capture(() => run(operation));
      assert.equal(result.code, 2, name);
      assert.match(result.out, /malformed active board structure/, name);
      assert.doesNotMatch(result.out, /\(no ready tasks\)|no snapshot baseline|\[STALE\]|\[OK\]|dry run|would change/, name);
      assert.equal(sha256(fs.readFileSync(file)), fileSha, name);
      assert.equal(fs.existsSync(path.join(root, '.dude/state/task-state.json')), false, name);
    }
    assert.match(capture(() => run({ cmd: 'parse', file, root })).out, /\[DIAG\] line \d+:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('write commands refuse a noncanonical tasks path before creating state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-board-legacy-'));
  try {
    const file = path.join(root, 'specs', 'x', 'tasks.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, FIXTURE);
    const result = capture(() => run({ cmd: 'render', file, root, write: true }));
    assert.equal(result.code, 2);
    assert.match(result.out, /writes require \.dude\/specs\/<feature>\/tasks\.md/);
    assert.equal(fs.existsSync(path.join(root, '.dude/state/task-state.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('write commands allow retired-root sibling content without changing it', () => {
  const { root, file } = scaffold();
  try {
    fs.mkdirSync(path.join(root, 'brief'), { recursive: true });
    fs.writeFileSync(path.join(root, 'brief/legacy.md'), '# Legacy\n');
    const retiredContent = fs.readFileSync(path.join(root, 'brief/legacy.md'));

    const result = capture(() => run({ cmd: 'render', file, root, write: true }));

    assert.equal(result.code, 0);
    assert.match(result.out, /\[OK\] rendered board/);
    assert.deepEqual(fs.readFileSync(path.join(root, 'brief/legacy.md')), retiredContent);
    assert.equal(fs.existsSync(path.join(root, '.dude/state/task-state.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('write commands reject a symlinked feature directory without changing external tasks', (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-board-link-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-board-outside-'));
  try {
    fs.mkdirSync(path.join(root, '.dude/specs'), { recursive: true });
    fs.mkdirSync(path.join(root, '.dude/state'), { recursive: true });
    const outsideTasks = path.join(outside, 'tasks.md');
    fs.writeFileSync(outsideTasks, FIXTURE);
    fs.symlinkSync(outside, path.join(root, '.dude/specs/x'));
    const linkedTasks = path.join(root, '.dude/specs/x/tasks.md');

    const result = capture(() => run({ cmd: 'render', file: linkedTasks, root, write: true }));

    assert.equal(result.code, 2);
    assert.match(result.out, /symbolic link/);
    assert.equal(fs.readFileSync(outsideTasks, 'utf8'), FIXTURE);
    assert.equal(fs.existsSync(path.join(root, '.dude/state/task-state.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('write commands reject a symlinked snapshot before changing the board', (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');
  const { root, file } = scaffold();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-board-state-outside-'));
  try {
    const externalState = path.join(outside, 'task-state.json');
    fs.writeFileSync(externalState, '{"keep":true}\n');
    fs.symlinkSync(externalState, path.join(root, '.dude/state/task-state.json'));
    const before = fs.readFileSync(file);

    const result = capture(() => run({ cmd: 'render', file, root, write: true }));

    assert.equal(result.code, 2);
    assert.match(result.out, /symbolic link/);
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.readFileSync(externalState, 'utf8'), '{"keep":true}\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// --- T037: task-state corruption fails closed before any mutation ----------
// BEHAVIORAL regressions (RED against the current board, which swallows a
// corrupt snapshot and proceeds to write). The coming board reads the snapshot
// through the shared task-state lib, fails closed (nonzero exit) on corruption,
// and leaves BOTH tasks.md and the snapshot byte-for-byte unchanged. The
// current board instead returns 0 and mutates both files, so every matrix cell
// is red now.
test('board fails closed on a corrupt snapshot and mutates neither tasks.md nor the snapshot', () => {
  const corruptions = [
    { name: 'malformed JSON', body: '{ this is not valid json\n' },
    {
      name: 'wrong-schema object',
      body: `${JSON.stringify(
        { '.dude/specs/x/tasks.md': { glyphs: { 'T001@aaaaaaaa': 'z' }, updated_at: '2026-01-01T00:00:00.000Z' } },
        null,
        2,
      )}\n`,
    },
  ];
  const commands = [
    { name: 'render --write', argv: (file, root) => ['render', file, '--write', '--root', root] },
    { name: 'set --write', argv: (file, root) => ['set', file, 'T002@bbbbbbbb', 'done', '--write', '--root', root] },
    {
      name: 'apply-states --write',
      argv: (file, root, mapFile) => ['apply-states', file, '--from', mapFile, '--write', '--root', root],
    },
  ];

  for (const corruption of corruptions) {
    for (const command of commands) {
      const { root, file } = scaffold();
      try {
        const label = `${command.name} / ${corruption.name}`;
        const mapFile = path.join(root, 'map.json');
        fs.writeFileSync(mapFile, JSON.stringify({ 'T002@bbbbbbbb': 'done' }));
        const snapshotFile = path.join(root, '.dude', 'state', 'task-state.json');
        fs.writeFileSync(snapshotFile, corruption.body);
        const tasksBefore = fs.readFileSync(file);
        const snapshotBefore = fs.readFileSync(snapshotFile);

        const result = boardCli(command.argv(file, root, mapFile));

        assert.notEqual(result.status, 0, `${label}: expected a nonzero (fail-closed) exit`);
        assert.deepEqual(fs.readFileSync(file), tasksBefore, `${label}: tasks.md must be byte-unchanged`);
        assert.deepEqual(
          fs.readFileSync(snapshotFile),
          snapshotBefore,
          `${label}: snapshot must be byte-unchanged`,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

// Cross-feature preservation LOCK: a successful --write keeps every unrelated
// feature's entry intact. Green against the current board (it already merges
// valid entries) and must stay green after the fail-closed rewrite.
test('board preserves an unrelated feature entry across a successful --write', () => {
  const unrelatedKey = '.dude/specs/other/tasks.md';
  const unrelatedEntry = { glyphs: { 'T900@0a1b2c3d': 'x' }, updated_at: '2026-01-01T00:00:00.000Z' };
  const commands = [
    { name: 'render --write', argv: (file, root) => ['render', file, '--write', '--root', root] },
    { name: 'set --write', argv: (file, root) => ['set', file, 'T002@bbbbbbbb', 'done', '--write', '--root', root] },
  ];

  for (const command of commands) {
    const { root, file } = scaffold();
    try {
      const snapshotFile = path.join(root, '.dude', 'state', 'task-state.json');
      fs.writeFileSync(snapshotFile, `${JSON.stringify({ [unrelatedKey]: unrelatedEntry }, null, 2)}\n`);

      const result = boardCli(command.argv(file, root));

      assert.equal(result.status, 0, `${command.name}: ${result.stdout || ''}${result.stderr || ''}`);
      const after = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
      assert.deepEqual(after[unrelatedKey], unrelatedEntry, `${command.name}: unrelated entry preserved exactly`);
      assert.ok(
        after['.dude/specs/x/tasks.md'] && 'T002@bbbbbbbb' in after['.dude/specs/x/tasks.md'].glyphs,
        `${command.name}: own feature upserted alongside the unrelated entry`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
