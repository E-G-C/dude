// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run, parseArgs, applyLightweightWorkRequest } from './board.mjs';
import { renderArtifacts } from './backlog.mjs';
import { parseTasks } from '../dude-engine/lib/tasks.mjs';
import { canonicalJson } from '../dude-work/recovery.mjs';

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

/** Capture stdout and stderr independently for exact CLI contract assertions. */
function captureStreams(fn) {
  const stdout = [];
  const stderr = [];
  const outOrig = process.stdout.write.bind(process.stdout);
  const errOrig = process.stderr.write.bind(process.stderr);
  // @ts-ignore -- test-only stream capture
  process.stdout.write = (value) => {
    stdout.push(String(value));
    return true;
  };
  // @ts-ignore -- test-only stream capture
  process.stderr.write = (value) => {
    stderr.push(String(value));
    return true;
  };
  let code;
  try {
    code = fn();
  } finally {
    process.stdout.write = outOrig;
    process.stderr.write = errOrig;
  }
  return { code, stdout: stdout.join(''), stderr: stderr.join('') };
}

const BACKLOG_HOOK_FEATURE = 'backlog-hook';
const BACKLOG_HOOK_TASK = 'T001@6261636b';

/** Build one defined, single-task feature whose artifacts can be classified by the backlog. */
function scaffoldBacklogHookFeature() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-backlog-hook-')));
  const featureDirectory = path.join(root, '.dude', 'specs', BACKLOG_HOOK_FEATURE);
  const file = path.join(featureDirectory, 'tasks.md');
  fs.mkdirSync(path.join(root, '.dude', 'ideas'), { recursive: true });
  fs.mkdirSync(path.join(root, '.dude', 'state'), { recursive: true });
  fs.mkdirSync(featureDirectory, { recursive: true });
  fs.writeFileSync(path.join(root, '.dude', 'ideas', `${BACKLOG_HOOK_FEATURE}.md`), [
    '---',
    'title: Backlog Hook Fixture',
    `slug: ${BACKLOG_HOOK_FEATURE}`,
    'status: defined',
    `spec_path: .dude/specs/${BACKLOG_HOOK_FEATURE}/spec.md`,
    '---',
    '',
    '# Idea: Backlog Hook Fixture',
    '',
    '## Idea',
    '',
    'Exercise a post-commit backlog projection.',
    '',
    '## Coordinator Log',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(featureDirectory, 'spec.md'), [
    '# Feature Specification: Backlog Hook Fixture',
    '',
    '## User Stories & Testing',
    '',
    '### User Story 1 - Keep projections current (Priority: P1)',
    '',
  ].join('\n'));
  fs.writeFileSync(file, [
    '# Tasks: Backlog Hook Fixture',
    '',
    '## Phase 1: Delivery',
    '',
    `- [ ] ${BACKLOG_HOOK_TASK} Keep the derived pair current`,
    '',
  ].join('\n'));
  return { root, file };
}

function backlogPaths(root) {
  return {
    markdown: path.join(root, '.dude', 'backlog.md'),
    html: path.join(root, '.dude', 'backlog.html'),
  };
}

function writeBacklogPair(root, markdown, html) {
  const artifacts = backlogPaths(root);
  fs.writeFileSync(artifacts.markdown, markdown);
  fs.writeFileSync(artifacts.html, html);
  return artifacts;
}

function readBacklogPair(root) {
  const artifacts = backlogPaths(root);
  return {
    markdown: fs.existsSync(artifacts.markdown) ? fs.readFileSync(artifacts.markdown) : null,
    html: fs.existsSync(artifacts.html) ? fs.readFileSync(artifacts.html) : null,
  };
}

function assertFreshBacklogPair(root, label) {
  const expected = renderArtifacts({ root });
  const actual = readBacklogPair(root);
  assert.deepEqual(actual.markdown, Buffer.from(expected.markdown), `${label}: Markdown equals fresh poststate render`);
  assert.deepEqual(actual.html, Buffer.from(expected.html), `${label}: HTML equals fresh poststate render`);
}

function markdownGroupForIdea(markdown, ideaPath) {
  const groups = new Set(['Blocked', 'Active', 'Next', 'Ideas awaiting definition', 'Defined awaiting work', 'Prioritized for later', 'Completed']);
  let group = null;
  for (const line of markdown.split('\n')) {
    const heading = /^#{2,3} (.+)$/.exec(line);
    if (heading) {
      group = groups.has(heading[1]) ? heading[1] : null;
      continue;
    }
    if (group && line.includes(`(\`${ideaPath}\`)`)) return group;
  }
  return null;
}

function htmlGroupForIdea(html, ideaPath) {
  const pattern = /<details class="feature-detail[^"]*"[^>]*data-idea-path="([^"]+)" data-section="([^"]+)" data-group="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (match[1] === ideaPath) return `${match[2]}/${match[3]}`;
  }
  return null;
}

function assertBacklogClassification(root, expected, label, ideaPath = `.dude/ideas/${BACKLOG_HOOK_FEATURE}.md`) {
  const pair = readBacklogPair(root);
  const markdownGroup = expected === 'active' ? 'Active' : 'Completed';
  const htmlGroup = expected === 'active' ? 'current/active' : 'completed/completed';
  assert.equal(markdownGroupForIdea(pair.markdown.toString('utf8'), ideaPath), markdownGroup, `${label}: Markdown classification`);
  assert.equal(htmlGroupForIdea(pair.html.toString('utf8'), ideaPath), htmlGroup, `${label}: HTML classification`);
}

function assertHookCanonicalPoststate(root, file, taskKey, glyph, ownerBefore, label) {
  assert.match(fs.readFileSync(file, 'utf8'), new RegExp(`- \\[${glyph}\\] ${taskKey}`), `${label}: canonical task committed`);
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, '.dude', 'state', 'task-state.json'), 'utf8'));
  const relativeTasks = path.relative(root, file).split(path.sep).join('/');
  assert.equal(snapshot[relativeTasks].glyphs[taskKey], glyph, `${label}: canonical snapshot committed`);
  if (ownerBefore) {
    assert.deepEqual(
      fs.readFileSync(path.join(root, '.dude', 'ideas', `${BACKLOG_HOOK_FEATURE}.md`)),
      ownerBefore,
      `${label}: owner remains canonical and unchanged`,
    );
  }
}

function failOnceOnBacklogHtmlWrite(root, callback) {
  const htmlPath = backlogPaths(root).html;
  const realWriteFileSync = fs.writeFileSync;
  let injected = 0;
  try {
    // @ts-ignore -- deliberate O_TRUNC-style writer failure injection
    fs.writeFileSync = (file, data, ...rest) => {
      if (injected === 0 && path.resolve(String(file)) === htmlPath) {
        injected += 1;
        realWriteFileSync(file, Buffer.from('truncated before injected HTML failure\n'), ...rest);
        throw new Error('injected backlog HTML write failure');
      }
      return realWriteFileSync(file, data, ...rest);
    };
    return { value: callback(), injected };
  } finally {
    fs.writeFileSync = realWriteFileSync;
  }
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

test('T030 guarded set --write refreshes both artifacts for claim and final close', () => {
  // Arrange
  const { root, file } = scaffoldBacklogHookFeature();
  try {
    // Act
    const claimed = captureStreams(() => run({
      cmd: 'set',
      file,
      id: BACKLOG_HOOK_TASK,
      state: 'in-progress',
      root,
      write: true,
    }));

    // Assert
    assert.equal(claimed.code, 0, claimed.stderr);
    assertFreshBacklogPair(root, 'guarded claim');
    assertBacklogClassification(root, 'active', 'guarded claim');
    assertHookCanonicalPoststate(root, file, BACKLOG_HOOK_TASK, '~', null, 'guarded claim');

    // Act
    const closed = captureStreams(() => run({
      cmd: 'set',
      file,
      id: BACKLOG_HOOK_TASK,
      state: 'done',
      root,
      write: true,
    }));

    // Assert
    assert.equal(closed.code, 0, closed.stderr);
    assertFreshBacklogPair(root, 'guarded close');
    assertBacklogClassification(root, 'completed', 'guarded close');
    assertHookCanonicalPoststate(root, file, BACKLOG_HOOK_TASK, 'x', null, 'guarded close');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T030 guarded apply-states --write refreshes both artifacts for claim, no-op, and final close', () => {
  // Arrange
  const { root, file } = scaffoldBacklogHookFeature();
  const mapFile = path.join(root, 'state-map.json');
  try {
    fs.writeFileSync(mapFile, JSON.stringify({ [BACKLOG_HOOK_TASK]: 'in-progress' }));

    // Act
    const claimed = captureStreams(() => run({
      cmd: 'apply-states',
      file,
      root,
      fromPath: mapFile,
      write: true,
    }));

    // Assert
    assert.equal(claimed.code, 0, claimed.stderr);
    assertFreshBacklogPair(root, 'batch claim');
    assertBacklogClassification(root, 'active', 'batch claim');
    assertHookCanonicalPoststate(root, file, BACKLOG_HOOK_TASK, '~', null, 'batch claim');

    // Arrange a stale pair while the canonical state remains in progress.
    writeBacklogPair(root, 'stale batch Markdown\n', 'stale batch HTML\n');
    fs.writeFileSync(mapFile, JSON.stringify({}));

    // Act: a successful zero-change batch is still a covered refresh boundary.
    const noOp = captureStreams(() => run({
      cmd: 'apply-states',
      file,
      root,
      fromPath: mapFile,
      write: true,
    }));

    // Assert
    assert.equal(noOp.code, 0, noOp.stderr);
    assert.match(noOp.stdout, /\[OK\] applied 0 state\(s\)/);
    assertFreshBacklogPair(root, 'batch no-op refresh');
    assertBacklogClassification(root, 'active', 'batch no-op refresh');

    // Arrange
    fs.writeFileSync(mapFile, JSON.stringify({ [BACKLOG_HOOK_TASK]: 'done' }));

    // Act
    const closed = captureStreams(() => run({
      cmd: 'apply-states',
      file,
      root,
      fromPath: mapFile,
      write: true,
    }));

    // Assert
    assert.equal(closed.code, 0, closed.stderr);
    assertFreshBacklogPair(root, 'batch close');
    assertBacklogClassification(root, 'completed', 'batch close');
    assertHookCanonicalPoststate(root, file, BACKLOG_HOOK_TASK, 'x', null, 'batch close');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T030 excluded board and refused autonomous paths leave committed backlog bytes untouched', () => {
  // Arrange
  const { root, file } = scaffoldBacklogHookFeature();
  const sentinels = {
    markdown: Buffer.from('excluded-path Markdown sentinel\n'),
    html: Buffer.from('excluded-path HTML sentinel\n'),
  };
  try {
    writeBacklogPair(root, sentinels.markdown, sentinels.html);
    const assertSentinels = (label) => {
      assert.deepEqual(readBacklogPair(root), sentinels, `${label}: no backlog refresh write`);
    };

    // Act / Assert: board-only write, reads, dry run, and failed guarded mutation are excluded.
    assert.equal(captureStreams(() => run({ cmd: 'render', file, root, write: true })).code, 0);
    assertSentinels('render --write');
    assert.equal(captureStreams(() => run({ cmd: 'next', file, root })).code, 0);
    assertSentinels('read');
    assert.equal(captureStreams(() => run({
      cmd: 'set',
      file,
      id: BACKLOG_HOOK_TASK,
      state: 'in-progress',
      root,
    })).code, 0);
    assertSentinels('dry run');
    assert.equal(captureStreams(() => run({
      cmd: 'set',
      file,
      id: 'T404@6d697373',
      state: 'done',
      root,
      write: true,
    })).code, 2);
    assertSentinels('failed guarded mutation');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  // Arrange
  const laneRoot = scaffoldLane();
  const laneSentinels = {
    markdown: Buffer.from('refused autonomous Markdown sentinel\n'),
    html: Buffer.from('refused autonomous HTML sentinel\n'),
  };
  try {
    writeBacklogPair(laneRoot, laneSentinels.markdown, laneSentinels.html);
    const refused = laneRequest(laneRoot);
    refused.expected = { ...refused.expected, tasks: laneCapture('stale expected tasks\n') };

    // Act
    const result = applyLightweightWorkRequest(refused);

    // Assert
    assert.equal(result.ok, false);
    assert.equal(result.phase, 'refused');
    assert.equal(result.reason, 'expected-capture-mismatch');
    assert.deepEqual(readBacklogPair(laneRoot), laneSentinels, 'refused autonomous request does not refresh');
  } finally {
    fs.rmSync(laneRoot, { recursive: true, force: true });
  }
});

test('T030 guarded refresh failures restore both preimages and retain canonical commits', () => {
  const commands = [
    {
      label: 'set',
      run(root, file) {
        return captureStreams(() => run({
          cmd: 'set',
          file,
          id: BACKLOG_HOOK_TASK,
          state: 'in-progress',
          root,
          write: true,
        }));
      },
    },
    {
      label: 'apply-states',
      run(root, file) {
        const mapFile = path.join(root, 'failing-state-map.json');
        fs.writeFileSync(mapFile, JSON.stringify({ [BACKLOG_HOOK_TASK]: 'in-progress' }));
        return captureStreams(() => run({
          cmd: 'apply-states',
          file,
          root,
          fromPath: mapFile,
          write: true,
        }));
      },
    },
  ];

  for (const command of commands) {
    for (const preimage of ['present', 'missing']) {
      // Arrange
      const { root, file } = scaffoldBacklogHookFeature();
      const before = {
        markdown: Buffer.from(`${command.label} ${preimage} Markdown preimage\n`),
        html: Buffer.from(`${command.label} ${preimage} HTML preimage\n`),
      };
      const ownerBefore = fs.readFileSync(path.join(root, '.dude', 'ideas', `${BACKLOG_HOOK_FEATURE}.md`));
      if (preimage === 'present') writeBacklogPair(root, before.markdown, before.html);

      try {
        // Act
        const failed = failOnceOnBacklogHtmlWrite(root, () => command.run(root, file));

        // Assert
        assert.equal(failed.injected, 1, `${command.label}/${preimage}: second write was reached`);
        assert.equal(failed.value.code, 2, `${command.label}/${preimage}: operation-error exit`);
        assert.equal(failed.value.stderr, '[FAIL] canonical state committed; backlog refresh failed\n');
        assert.equal(failed.value.stdout, '', `${command.label}/${preimage}: ordinary success is suppressed`);
        assertHookCanonicalPoststate(
          root,
          file,
          BACKLOG_HOOK_TASK,
          '~',
          ownerBefore,
          `${command.label}/${preimage}`,
        );
        if (preimage === 'present') {
          assert.deepEqual(readBacklogPair(root), before, `${command.label}/${preimage}: both preimages restored`);
        } else {
          assert.deepEqual(
            readBacklogPair(root),
            { markdown: null, html: null },
            `${command.label}/${preimage}: both absent preimages restored`,
          );
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
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

// --- T006 Lightweight lane trust boundary ------------------------------------
//
// The closed `work-project` / `work-set` integration matrix. Every refusal case
// asserts byte-for-byte unchanged authoritative surfaces AND that the returned
// `unchangedPrestateHash` equals an independently recomputed fresh observation.

const LANE_SPEC = '.dude/specs/009-lane/spec.md';
const LANE_TASKS = '.dude/specs/009-lane/tasks.md';
const LANE_IDEA = '.dude/ideas/lane.md';
const LANE_SNAPSHOT = '.dude/state/task-state.json';
const LANE_TASK_KEY = 'T001@6c616e65';
const LANE_OTHER_KEY = 'T002@6f746865';
const LANE_STAMP = '2026-07-25T12:00:00Z';
const LANE_EMPTY_SNAPSHOT = Buffer.from('{}\n');
const LANE_TARGET = { specPath: LANE_SPEC, lane: 'lightweight', taskKey: LANE_TASK_KEY };
const LANE_RUN_STATE = {
  policy: { overall: 3, recovery: 1, recover: false, untilBlocked: false, mode: 'autonomous' },
  overallUsed: 0,
  recoveryUsed: [],
  pending: [],
  completed: [],
};
const LANE_TASKS_FIXTURE = `# Tasks: Lane

## Phase 1

- [ ] ${LANE_TASK_KEY} [US3] Implement the lane boundary
- [ ] ${LANE_OTHER_KEY} [US3] Another canonical unit

## Lightweight Execution History

- 2026-07-24T00:00:00Z - baseline
`;
const LANE_TASKS_WITHOUT_HISTORY_FIXTURE = `# Tasks: Lane

## Phase 1

- [ ] ${LANE_TASK_KEY} [US3] Implement the lane boundary
- [ ] ${LANE_OTHER_KEY} [US3] Another canonical unit
`;

function laneIdeaLedger(specPath = LANE_SPEC) {
  return `---\nstatus: defined\nspec_path: ${specPath}\n---\n\n## Idea\n\nLane boundary.\n\n## Coordinator Log\n\n- Existing entry.\n`;
}

/** @param {string} root @param {string} rel @param {string} content */
function writeLaneFile(root, rel, content) {
  const absolute = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  return absolute;
}

/** @param {string} root @param {string} rel */
function laneBytes(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')));
}

/** @param {string} root */
function laneSnapshotPath(root) {
  return path.join(root, ...LANE_SNAPSHOT.split('/'));
}

/**
 * Capture the physical form of the optional snapshot without following links.
 * `unreadableBytes` is the known preimage for a deliberately unreadable regular
 * file, which this test process must not try to read after permissions change.
 * @param {string} root
 * @param {Buffer} [unreadableBytes]
 */
function laneSnapshotShape(root, unreadableBytes) {
  const absolute = laneSnapshotPath(root);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
  const mode = stat.mode & 0o777;
  if (stat.isSymbolicLink()) return { kind: 'symlink', mode, target: fs.readlinkSync(absolute) };
  if (stat.isDirectory()) return { kind: 'directory', mode, entries: fs.readdirSync(absolute).sort() };
  if (stat.isFile()) {
    return {
      kind: 'file',
      mode,
      bytes: unreadableBytes === undefined ? fs.readFileSync(absolute) : Buffer.from(unreadableBytes),
    };
  }
  return { kind: 'nonregular', mode };
}

/** @param {Buffer|string} value */
function laneCapture(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return { base64: bytes.toString('base64'), sha256: sha256(bytes), byteLength: bytes.byteLength };
}

/** @param {Buffer|string} value */
function laneDescriptor(value) {
  const capture = laneCapture(value);
  return { sha256: capture.sha256, byteLength: capture.byteLength };
}

/** @param {string} [tasks] */
function scaffoldLane(tasks = LANE_TASKS_FIXTURE) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-lane-')));
  writeLaneFile(root, LANE_SPEC, '# Spec Lane\n');
  writeLaneFile(root, LANE_TASKS, tasks);
  writeLaneFile(root, LANE_IDEA, laneIdeaLedger());
  writeLaneFile(root, LANE_SNAPSHOT, `${JSON.stringify({
    [LANE_TASKS]: { glyphs: { [LANE_TASK_KEY]: ' ', [LANE_OTHER_KEY]: ' ' }, updated_at: '2026-07-24T00:00:00.000Z' },
  }, null, 2)}\n`);
  return root;
}

/** A one-task lane is necessary to exercise the Completed classification after close. */
function scaffoldSingleTaskLane() {
  const root = scaffoldLane(LANE_TASKS_FIXTURE.replace(`- [ ] ${LANE_OTHER_KEY} [US3] Another canonical unit\n`, ''));
  const snapshotPath = path.join(root, ...LANE_SNAPSHOT.split('/'));
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  delete snapshot[LANE_TASKS].glyphs[LANE_OTHER_KEY];
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return root;
}

/** @param {string} root */
function laneSurfaces(root) {
  return {
    tasks: laneBytes(root, LANE_TASKS),
    taskState: laneBytes(root, LANE_SNAPSHOT),
    owner: laneBytes(root, LANE_IDEA),
  };
}

function assertAutonomousCommittedResult(result, root, label) {
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'phase', 'receipt'], `${label}: exact result keys`);
  assert.equal(result.ok, true, `${label}: canonical commit remains successful`);
  assert.equal(result.phase, 'committed', `${label}: committed phase`);
  assert.equal(Object.hasOwn(result, 'reason'), false, `${label}: no refusal reason`);
  assert.equal(Object.hasOwn(result, 'unchangedPrestateHash'), false, `${label}: no unchanged-prestate claim`);
  const after = laneSurfaces(root);
  const { receiptHash, ...receiptBody } = result.receipt;
  assert.equal(receiptHash, sha256(canonicalJson(receiptBody)), `${label}: receipt remains complete and valid`);
  assert.equal(result.receipt.tasksPoststateHash, sha256(after.tasks), `${label}: receipt keeps canonical tasks poststate`);
  assert.equal(result.receipt.taskStatePoststateHash, sha256(after.taskState), `${label}: receipt keeps canonical snapshot poststate`);
  assert.equal(result.receipt.ownerPoststateHash, sha256(after.owner), `${label}: receipt keeps canonical owner poststate`);
}

/** Recompute the boundary's fresh-observation hash independently. @param {string} root @param {string} [ideaPath] */
function laneObservationHash(root, ideaPath = LANE_IDEA) {
  /** @param {string} rel */
  const seen = (rel) => {
    const absolute = path.join(root, ...rel.split('/'));
    return fs.existsSync(absolute) ? laneDescriptor(fs.readFileSync(absolute)) : null;
  };
  return sha256(canonicalJson({
    owner: seen(ideaPath),
    taskState: seen(LANE_SNAPSHOT),
    tasks: seen(LANE_TASKS),
  }));
}

/** The sentinel the boundary reports when no surface path is resolvable. */
const LANE_UNOBSERVED_HASH = sha256(canonicalJson({ owner: null, taskState: null, tasks: null }));

/** @param {string} seed */
function laneEvent(seed) {
  const body = { type: 'lane-boundary-probe', version: 1, seed };
  return { ...body, eventHash: sha256(canonicalJson(body)) };
}

/** @param {Record<string, unknown>} event */
function laneEventLine(event) {
  return { eventHash: event.eventHash, exactLine: `- dude-run-event: ${canonicalJson(event)}`, terminator: 'LF' };
}

/** @param {Record<string, unknown>[]} events */
function laneEventEffect(events) {
  return { kind: 'append-exact', lines: events.map(laneEventLine), appendIfAbsent: true };
}

/** @param {string} root @param {string[]} lines */
function laneOwnerAppend(root, lines) {
  return {
    kind: 'append-exact',
    ownerPath: LANE_IDEA,
    expectedOwnerHash: sha256(laneBytes(root, LANE_IDEA)),
    exactLines: lines,
    terminator: 'LF',
    appendIfAbsent: true,
  };
}

/** @param {Record<string, unknown>} overrides */
function laneMutation(overrides = {}) {
  return {
    version: 1,
    lane: 'lightweight',
    kind: 'claim',
    reason: 'initial-claim',
    target: LANE_TARGET,
    fromGlyph: ' ',
    toGlyph: '~',
    blocker: { kind: 'unchanged', before: null, after: null },
    eventLines: laneEventEffect([laneEvent('claim')]),
    ownerLog: { kind: 'none' },
    snapshotUpdatedAt: LANE_STAMP,
    ...overrides,
  };
}

/** @param {Record<string, unknown>} overrides */
function laneCompletionMutation(overrides = {}) {
  return laneMutation({
    kind: 'task-completed',
    reason: 'task-completed',
    fromGlyph: '~',
    toGlyph: 'x',
    eventLines: laneEventEffect([laneEvent('complete')]),
    ...overrides,
  });
}

/** @param {Record<string, unknown>} overrides */
function laneProjectionMutation(overrides = {}) {
  return laneMutation({
    kind: 'append-event',
    reason: 'event-projection',
    fromGlyph: ' ',
    toGlyph: ' ',
    eventLines: laneEventEffect([laneEvent('projection')]),
    ...overrides,
  });
}

/**
 * Build one complete valid wrapper request against the CURRENT fresh bytes.
 * @param {string} root
 * @param {{operation?:'work-project'|'work-set',mutation?:any,state?:any,glyph?:string,blockedBy?:string|null,taskKey?:string,mappingOverrides?:Record<string,unknown>,taskStateCapture?:Buffer|string}} [options]
 */
function laneRequest(root, options = {}) {
  const operation = options.operation ?? 'work-set';
  const mutation = options.mutation ?? laneMutation();
  const state = options.state ?? LANE_RUN_STATE;
  const taskKey = options.taskKey ?? LANE_TASK_KEY;
  const target = { specPath: LANE_SPEC, lane: 'lightweight', taskKey };
  const surfaces = {
    tasks: laneBytes(root, LANE_TASKS),
    // An absent optional snapshot has a semantic canonical baseline even though
    // no physical file can be read. Callers otherwise bind the actual bytes.
    taskState: options.taskStateCapture === undefined
      ? laneBytes(root, LANE_SNAPSHOT)
      : Buffer.from(options.taskStateCapture),
    owner: laneBytes(root, LANE_IDEA),
  };
  const ownerCapture = laneCapture(surfaces.owner);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: LANE_IDEA,
    specPath: LANE_SPEC,
    ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  }));
  const mapping = {
    version: 1,
    lane: 'lightweight',
    target,
    ownerBindingHash,
    tasksPath: LANE_TASKS,
    tasksDescriptor: laneDescriptor(surfaces.tasks),
    taskStatePath: LANE_SNAPSHOT,
    taskStateDescriptor: laneDescriptor(surfaces.taskState),
    taskKey,
    ...(options.mappingOverrides ?? {}),
  };
  const prestate = {
    version: 1,
    lane: 'lightweight',
    target,
    glyph: options.glyph ?? ' ',
    blockedBy: options.blockedBy ?? null,
    tasksDescriptor: laneDescriptor(surfaces.tasks),
    taskStateDescriptor: laneDescriptor(surfaces.taskState),
    ownerDescriptor: laneDescriptor(surfaces.owner),
  };
  const bound = {
    target,
    subjectRunStateHash: sha256(canonicalJson(state)),
    targetMappingHash: sha256(canonicalJson(mapping)),
    lanePrestateHash: sha256(canonicalJson(prestate)),
    mutationIdentity: sha256(canonicalJson(mutation)),
  };
  const permitBody = operation === 'work-project'
    ? {
      version: 1,
      kind: 'lane-projection',
      origin: 'dude-work',
      lane: 'lightweight',
      ...bound,
      batchIdentity: sha256('lane-batch'),
      eventHash: mutation.eventLines.lines[0].eventHash,
    }
    : {
      version: 1,
      kind: 'lane-mutation',
      origin: 'dude-work',
      lane: 'lightweight',
      operation: 'work-set',
      ...bound,
      governanceIdentity: null,
      governancePhase: null,
      attemptIdentity: null,
    };
  return {
    version: 1,
    operation,
    root,
    owner: { ideaPath: LANE_IDEA, specPath: LANE_SPEC, ownerCapture, ownerBindingHash },
    target,
    state,
    permit: { ...permitBody, permitHash: sha256(canonicalJson(permitBody)) },
    mapping,
    expected: {
      tasksPath: LANE_TASKS,
      tasks: laneCapture(surfaces.tasks),
      taskStatePath: LANE_SNAPSHOT,
      taskState: laneCapture(surfaces.taskState),
    },
    mutation,
  };
}

/**
 * Assert a closed refusal that mutated nothing.
 * @param {string} root @param {unknown} request @param {string} reason @param {string} label
 * @param {{observable?:boolean,ideaPath?:string}} [options]
 */
function assertLaneRefusal(root, request, reason, label, options = {}) {
  const before = laneSurfaces(root);
  const result = applyLightweightWorkRequest(request);
  const after = laneSurfaces(root);
  assert.equal(result.ok, false, `${label}: must refuse`);
  assert.equal(result.phase, 'refused', `${label}: phase`);
  assert.equal(result.reason, reason, `${label}: reason`);
  assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, `${label}: prestate hash shape`);
  assert.equal(
    result.unchangedPrestateHash,
    options.observable === false ? LANE_UNOBSERVED_HASH : laneObservationHash(root, options.ideaPath),
    `${label}: fresh unchanged evidence`,
  );
  assert.deepEqual(Object.keys(result).sort(), ['ok', 'phase', 'reason', 'unchangedPrestateHash'], `${label}: closed shape`);
  for (const surface of /** @type {const} */ (['tasks', 'taskState', 'owner'])) {
    assert.ok(before[surface].equals(after[surface]), `${label}: ${surface} must stay byte-identical`);
  }
  return result;
}

/**
 * Fault the persistence primitive used by the real lane boundary. The legacy
 * writer truncates its direct target before failing; the atomic batch writer
 * stages by descriptor and fails before the target replacement. Supporting
 * both keeps this test at the public boundary while migration changes it.
 * @param {(absolutePath:string, operation:'write'|'rename')=>boolean} shouldFail
 * @param {()=>unknown} apply
 */
function applyWithInjectedLanePersistenceFailure(shouldFail, apply) {
  const realWriteFileSync = fs.writeFileSync;
  const realRenameSync = fs.renameSync;
  let injected = 0;
  const failIfSelected = (file, operation) => {
    const absolutePath = typeof file === 'string' ? path.resolve(file) : '';
    if (injected === 0 && shouldFail(absolutePath, operation)) {
      injected += 1;
      if (operation === 'write') realWriteFileSync(file, Buffer.alloc(0));
      throw new Error(`injected lane ${operation} failure`);
    }
  };
  // @ts-ignore -- deliberate test-only persistence failure injection
  fs.writeFileSync = (file, data, ...rest) => {
    failIfSelected(file, 'write');
    return realWriteFileSync(file, data, ...rest);
  };
  // @ts-ignore -- deliberate test-only persistence failure injection
  fs.renameSync = (from, to, ...rest) => {
    failIfSelected(to, 'rename');
    return realRenameSync(from, to, ...rest);
  };
  try {
    return { result: apply(), injected };
  } finally {
    fs.writeFileSync = realWriteFileSync;
    fs.renameSync = realRenameSync;
  }
}

test('T006 lane mutation reads only visible task syntax, never fenced lookalikes', () => {
  const root = scaffoldLane();
  try {
    const fenced = LANE_TASKS_FIXTURE.replace(
      `- [ ] ${LANE_OTHER_KEY} [US3] Another canonical unit\n`,
      `- [ ] ${LANE_OTHER_KEY} [US3] Another canonical unit\n\n\`\`\`md\n- [x] ${LANE_TASK_KEY} [US3] Fenced lookalike\n\`\`\`\n`,
    );
    writeLaneFile(root, LANE_TASKS, fenced);
    // Raw parsing cannot separate the fenced lookalike from real task syntax.
    assert.equal(parseTasks(fenced).tasks.filter((row) => row.id === LANE_TASK_KEY).length, 2);

    const result = applyLightweightWorkRequest(laneRequest(root));
    assert.equal(result.ok, true, JSON.stringify(result));
    const after = fs.readFileSync(path.join(root, ...LANE_TASKS.split('/')), 'utf8');
    assert.match(after, new RegExp(`- \\[~\\] ${LANE_TASK_KEY} \\[US3\\] Implement the lane boundary`));
    assert.match(after, new RegExp(`- \\[x\\] ${LANE_TASK_KEY} \\[US3\\] Fenced lookalike`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight work-set commits an exact claim only after fresh poststate capture', () => {
  const root = scaffoldLane();
  try {
    const mutation = laneMutation({ ownerLog: laneOwnerAppend(root, ['- 2026-07-25T12:00:00Z - lane claim']) });
    const request = laneRequest(root, { mutation });
    const result = applyLightweightWorkRequest(request);

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.phase, 'committed');
    const receipt = result.receipt;
    const after = laneSurfaces(root);
    assert.equal(receipt.tasksPoststateHash, sha256(after.tasks), 'tasks poststate is the real byte hash');
    assert.equal(receipt.taskStatePoststateHash, sha256(after.taskState), 'snapshot poststate is the real byte hash');
    assert.equal(receipt.ownerPoststateHash, sha256(after.owner), 'owner poststate is the real byte hash');
    assert.equal(receipt.permitHash, request.permit.permitHash);
    assert.equal(receipt.mutationIdentity, request.permit.mutationIdentity);
    assert.equal(receipt.targetStateChanged, true);
    const { receiptHash, ...body } = receipt;
    assert.equal(receiptHash, sha256(canonicalJson(body)), 'receipt hash binds its complete body');

    const tasksText = after.tasks.toString('utf8');
    assert.match(tasksText, new RegExp(`- \\[~\\] ${LANE_TASK_KEY}`), 'glyph applied');
    assert.ok(tasksText.includes(`${request.mutation.eventLines.lines[0].exactLine}\n`), 'exact LF event record appended');
    assert.ok(after.owner.toString('utf8').endsWith('- 2026-07-25T12:00:00Z - lane claim\n'), 'owner line appended');
    const snapshot = JSON.parse(after.taskState.toString('utf8'));
    assert.equal(snapshot[LANE_TASKS].glyphs[LANE_TASK_KEY], '~');
    assert.equal(snapshot[LANE_TASKS].glyphs[LANE_OTHER_KEY], ' ', 'unrelated task glyph preserved');
    assert.equal(snapshot[LANE_TASKS].updated_at, '2026-07-25T12:00:00.000Z', 'snapshot stamp derives from the mutation');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T030 autonomous claim and final close refresh both artifacts without changing the result contract', () => {
  // Arrange
  const root = scaffoldSingleTaskLane();
  try {
    // Act
    const claimed = applyLightweightWorkRequest(laneRequest(root));

    // Assert
    assertAutonomousCommittedResult(claimed, root, 'autonomous claim');
    assertFreshBacklogPair(root, 'autonomous claim');
    assertBacklogClassification(root, 'active', 'autonomous claim', LANE_IDEA);
    assert.match(
      laneBytes(root, LANE_TASKS).toString('utf8'),
      new RegExp(`- \\[~\\] ${LANE_TASK_KEY}`),
      'autonomous claim commits the canonical task',
    );

    // Arrange
    const completion = laneCompletionMutation();
    const closeRequest = laneRequest(root, { mutation: completion, glyph: '~' });

    // Act
    const closed = applyLightweightWorkRequest(closeRequest);

    // Assert
    assertAutonomousCommittedResult(closed, root, 'autonomous close');
    assertFreshBacklogPair(root, 'autonomous close');
    assertBacklogClassification(root, 'completed', 'autonomous close', LANE_IDEA);
    assert.match(
      laneBytes(root, LANE_TASKS).toString('utf8'),
      new RegExp(`- \\[x\\] ${LANE_TASK_KEY}`),
      'autonomous close commits the final canonical task',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T030 autonomous refresh failure restores the pair but returns the original committed receipt', () => {
  for (const preimage of ['present', 'missing']) {
    // Arrange
    const root = scaffoldSingleTaskLane();
    const before = {
      markdown: Buffer.from(`autonomous ${preimage} Markdown preimage\n`),
      html: Buffer.from(`autonomous ${preimage} HTML preimage\n`),
    };
    const canonicalBefore = laneSurfaces(root);
    if (preimage === 'present') writeBacklogPair(root, before.markdown, before.html);

    try {
      // Act
      const failed = failOnceOnBacklogHtmlWrite(root, () => applyLightweightWorkRequest(laneRequest(root)));

      // Assert
      assert.equal(failed.injected, 1, `${preimage}: second backlog write was reached`);
      assertAutonomousCommittedResult(failed.value, root, `${preimage}: autonomous failure`);
      const after = laneSurfaces(root);
      assert.match(after.tasks.toString('utf8'), new RegExp(`- \\[~\\] ${LANE_TASK_KEY}`), `${preimage}: task stayed committed`);
      assert.equal(
        JSON.parse(after.taskState.toString('utf8'))[LANE_TASKS].glyphs[LANE_TASK_KEY],
        '~',
        `${preimage}: snapshot stayed committed`,
      );
      assert.deepEqual(after.owner, canonicalBefore.owner, `${preimage}: owner was not rolled back or rewritten`);
      if (preimage === 'present') {
        assert.deepEqual(readBacklogPair(root), before, `${preimage}: both prior artifact bytes restored`);
      } else {
        assert.deepEqual(
          readBacklogPair(root),
          { markdown: null, html: null },
          `${preimage}: both prior absent artifacts restored`,
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('T006 lightweight work-project appends the exact event and reports an unchanged target state', () => {
  const root = scaffoldLane();
  try {
    const mutation = laneProjectionMutation();
    const request = laneRequest(root, { operation: 'work-project', mutation });
    const before = laneSurfaces(root);
    const result = applyLightweightWorkRequest(request);

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.receipt.targetStateChanged, false, 'projection never changes target state');
    const after = laneSurfaces(root);
    assert.equal(
      after.tasks.toString('utf8'),
      `${before.tasks.toString('utf8')}${mutation.eventLines.lines[0].exactLine}\n`,
      'tasks.md changes by exactly one appended LF record',
    );
    assert.ok(before.owner.equals(after.owner), 'owner bytes unchanged under ownerLog none');
    assert.equal(result.receipt.ownerPoststateHash, sha256(after.owner));

    // Replaying the identical projection changes nothing and must not succeed.
    const replay = laneRequest(root, { operation: 'work-project', mutation });
    assertLaneRefusal(root, replay, 'permit-replayed', 'replayed projection');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight work-project bootstraps canonical history without changing the target task', () => {
  const refusalFixtures = [
    {
      label: 'malformed canonical task',
      tasks: LANE_TASKS_WITHOUT_HISTORY_FIXTURE.replace(
        `- [ ] ${LANE_TASK_KEY} [US3] Implement the lane boundary`,
        `- [?] ${LANE_TASK_KEY} [US3] Implement the lane boundary`,
      ),
      reason: 'mapping-missing',
    },
    {
      label: 'missing terminal LF',
      tasks: LANE_TASKS_WITHOUT_HISTORY_FIXTURE.slice(0, -1),
      reason: 'lane-prestate-mismatch',
    },
    {
      label: 'noncanonical history lookalike',
      tasks: `${LANE_TASKS_WITHOUT_HISTORY_FIXTURE}\n## Lightweight Execution History:\n`,
      reason: 'lane-prestate-mismatch',
    },
  ];
  for (const fixture of refusalFixtures) {
    const refusalRoot = scaffoldLane(fixture.tasks);
    try {
      const mutation = laneProjectionMutation();
      assertLaneRefusal(
        refusalRoot,
        laneRequest(refusalRoot, { operation: 'work-project', mutation }),
        fixture.reason,
        fixture.label,
      );
    } finally {
      fs.rmSync(refusalRoot, { recursive: true, force: true });
    }
  }

  const root = scaffoldLane(LANE_TASKS_WITHOUT_HISTORY_FIXTURE);
  try {
    const mutation = laneProjectionMutation();
    const request = laneRequest(root, { operation: 'work-project', mutation });
    const before = laneSurfaces(root);
    const result = applyLightweightWorkRequest(request);

    assert.equal(result.ok, true, `history bootstrap must commit: ${JSON.stringify(result)}`);
    assert.equal(result.phase, 'committed');
    assert.equal(result.receipt.targetStateChanged, false, 'projection keeps the target state unchanged');
    const after = laneSurfaces(root);
    const eventLine = mutation.eventLines.lines[0].exactLine;
    assert.equal(
      after.tasks.toString('utf8'),
      `${before.tasks.toString('utf8')}\n## Lightweight Execution History\n\n${eventLine}\n`,
      'bootstrap adds one blank-line-separated canonical heading and exact LF event',
    );
    const parsed = parseTasks(after.tasks.toString('utf8'));
    assert.equal(parsed.byId.get(LANE_TASK_KEY)?.glyph, ' ', 'target glyph stays unchanged');
    assert.equal(parsed.byId.get(LANE_TASK_KEY)?.blockedBy, null, 'target blocker stays unchanged');
    const snapshot = JSON.parse(after.taskState.toString('utf8'));
    assert.deepEqual(snapshot[LANE_TASKS].glyphs, {
      [LANE_TASK_KEY]: ' ',
      [LANE_OTHER_KEY]: ' ',
    }, 'snapshot retains both canonical glyphs');
    assert.equal(snapshot[LANE_TASKS].updated_at, '2026-07-25T12:00:00.000Z');
    assert.ok(before.owner.equals(after.owner), 'ownerLog none leaves owner bytes unchanged');
    assert.equal(result.receipt.tasksPoststateHash, sha256(after.tasks));
    assert.equal(result.receipt.taskStatePoststateHash, sha256(after.taskState));
    assert.equal(result.receipt.ownerPoststateHash, sha256(after.owner));
    assert.equal(result.receipt.permitHash, request.permit.permitHash);
    assert.equal(result.receipt.mutationIdentity, request.permit.mutationIdentity);
    const { receiptHash, ...receiptBody } = result.receipt;
    assert.equal(receiptHash, sha256(canonicalJson(receiptBody)), 'receipt hash binds the actual poststate receipt');

    const replay = laneRequest(root, { operation: 'work-project', mutation });
    assertLaneRefusal(root, replay, 'permit-replayed', 'replayed bootstrapped projection');
    const replayedTasks = laneBytes(root, LANE_TASKS).toString('utf8');
    assert.equal(replayedTasks.split('## Lightweight Execution History').length - 1, 1, 'history heading is not duplicated');
    assert.equal(replayedTasks.split(eventLine).length - 1, 1, 'exact event is not duplicated');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const failureRoot = scaffoldLane(LANE_TASKS_WITHOUT_HISTORY_FIXTURE);
  const realWriteFileSync = fs.writeFileSync;
  const tasksAbsolute = path.join(failureRoot, ...LANE_TASKS.split('/'));
  try {
    const mutation = laneProjectionMutation();
    const request = laneRequest(failureRoot, { operation: 'work-project', mutation });
    const before = laneSurfaces(failureRoot);
    let injected = 0;
    // @ts-ignore -- deliberate mid-write failure injection
    fs.writeFileSync = (file, data, ...rest) => {
      if (injected === 0 && file === tasksAbsolute) {
        injected += 1;
        realWriteFileSync(file, '');
        const error = new Error('ENOSPC: no space left on device, write');
        // @ts-ignore -- errno codes are not on the Error type
        error.code = 'ENOSPC';
        throw error;
      }
      return realWriteFileSync(file, data, ...rest);
    };
    const result = applyLightweightWorkRequest(request);
    fs.writeFileSync = realWriteFileSync;
    const after = laneSurfaces(failureRoot);

    assert.equal(injected, 1, 'bootstrap reached the injected tasks write');
    assert.equal(result.ok, false);
    assert.equal(result.phase, 'refused');
    assert.equal(result.reason, 'atomic-apply-failed');
    assert.equal(result.receipt, undefined);
    for (const surface of /** @type {const} */ (['tasks', 'taskState', 'owner'])) {
      assert.ok(before[surface].equals(after[surface]), `${surface} must be restored byte-for-byte`);
    }
    assert.equal(result.unchangedPrestateHash, laneObservationHash(failureRoot));
  } finally {
    fs.writeFileSync = realWriteFileSync;
    fs.rmSync(failureRoot, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary rejects every omitted, unexpected, or caller-authored field', () => {
  const root = scaffoldLane();
  try {
    const base = () => laneRequest(root);
    assertLaneRefusal(root, { ...base(), command: 'bd update --status closed' }, 'unknown-field', 'caller command string');
    assertLaneRefusal(root, { ...base(), force: true }, 'unknown-field', 'free-form governance flag');
    const missing = base();
    delete missing.mapping;
    assertLaneRefusal(root, missing, 'invalid-request-shape', 'omitted mapping');
    assertLaneRefusal(root, { ...base(), version: 2 }, 'invalid-request-shape', 'wrong version');
    assertLaneRefusal(root, { ...base(), operation: 'work-transition' }, 'invalid-request-shape', 'wrong lane operation');
    const extraMutationField = base();
    extraMutationField.mutation = { ...extraMutationField.mutation, note: 'why' };
    assertLaneRefusal(root, extraMutationField, 'unknown-field', 'unknown mutation field');
    for (const garbage of [null, 'work-set', 42, [], { operation: 'work-set' }]) {
      const result = applyLightweightWorkRequest(garbage);
      assert.equal(result.ok, false);
      assert.equal(result.phase, 'refused');
      assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, 'closed fail response for garbage input');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary rejects stale expected captures and forged descriptors', () => {
  const root = scaffoldLane();
  try {
    const stale = laneRequest(root);
    stale.expected = { ...stale.expected, tasks: laneCapture('# stale tasks\n') };
    assertLaneRefusal(root, stale, 'expected-capture-mismatch', 'stale expected tasks');

    const staleState = laneRequest(root);
    staleState.expected = { ...staleState.expected, taskState: laneCapture('{}\n') };
    assertLaneRefusal(root, staleState, 'expected-capture-mismatch', 'stale expected snapshot');

    const staleOwner = laneRequest(root);
    const forgedOwnerCapture = laneCapture('---\nstatus: defined\n---\n');
    staleOwner.owner = {
      ...staleOwner.owner,
      ownerCapture: forgedOwnerCapture,
      ownerBindingHash: sha256(canonicalJson({
        ideaPath: LANE_IDEA,
        specPath: LANE_SPEC,
        ownerCapture: { sha256: forgedOwnerCapture.sha256, byteLength: forgedOwnerCapture.byteLength },
      })),
    };
    assertLaneRefusal(root, staleOwner, 'owner-prestate-mismatch', 'owner capture that is not the real bytes');

    // D-4: a self-consistent mapping descriptor that does not describe the real
    // workspace bytes can no longer choose `targetMappingHash`.
    const forgedMapping = laneRequest(root);
    forgedMapping.mapping = { ...forgedMapping.mapping, tasksDescriptor: laneDescriptor('# other tasks\n') };
    assertLaneRefusal(root, forgedMapping, 'mapping-mismatch', 'mapping descriptor detached from real bytes');

    const forgedSnapshotDescriptor = laneRequest(root);
    forgedSnapshotDescriptor.mapping = {
      ...forgedSnapshotDescriptor.mapping,
      taskStateDescriptor: laneDescriptor('{}\n'),
    };
    assertLaneRefusal(root, forgedSnapshotDescriptor, 'mapping-mismatch', 'snapshot descriptor detached from real bytes');

    // The whole point of D-4: a mapping whose permit was rebuilt over the
    // forged descriptor is internally consistent, so only the comparison
    // against real workspace bytes can reject it.
    assertLaneRefusal(
      root,
      laneRequest(root, { mappingOverrides: { tasksDescriptor: laneDescriptor('# other tasks\n') } }),
      'mapping-mismatch',
      'self-consistent mapping and permit over a caller-chosen targetMappingHash',
    );
    assertLaneRefusal(
      root,
      laneRequest(root, { mappingOverrides: { taskStateDescriptor: laneDescriptor('{}\n') } }),
      'mapping-mismatch',
      'self-consistent snapshot descriptor over a caller-chosen targetMappingHash',
    );
    assertLaneRefusal(
      root,
      laneRequest(root, { mappingOverrides: { taskKey: LANE_OTHER_KEY } }),
      'mapping-mismatch',
      'self-consistent mapping and permit over a caller-chosen durable task key',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary rejects hand-built, transferred, and mismapped permits', () => {
  const root = scaffoldLane();
  try {
    const forgedPrestate = laneRequest(root, { glyph: '~' });
    assertLaneRefusal(root, forgedPrestate, 'lane-prestate-mismatch', 'caller-chosen prestate glyph');

    const forgedOwnerDescriptor = laneRequest(root);
    const body = { ...forgedOwnerDescriptor.permit };
    delete body.permitHash;
    body.lanePrestateHash = sha256('not the derived prestate');
    forgedOwnerDescriptor.permit = { ...body, permitHash: sha256(canonicalJson(body)) };
    assertLaneRefusal(root, forgedOwnerDescriptor, 'lane-prestate-mismatch', 'hand-built permit over a chosen prestate');

    const tampered = laneRequest(root);
    tampered.permit = { ...tampered.permit, permitHash: sha256('nope') };
    assertLaneRefusal(root, tampered, 'permit-hash-mismatch', 'permit hash that does not bind its body');

    const transferred = laneRequest(root);
    const transferredBody = { ...transferred.permit };
    delete transferredBody.permitHash;
    transferredBody.target = { specPath: LANE_SPEC, lane: 'lightweight', taskKey: LANE_OTHER_KEY };
    transferred.permit = { ...transferredBody, permitHash: sha256(canonicalJson(transferredBody)) };
    assertLaneRefusal(root, transferred, 'target-mismatch', 'permit transferred from another target');

    // A complete, well-formed permit for the OTHER lane is still transferred:
    // the lane binding is checked before the target is even shaped.
    const crossLane = laneRequest(root, { operation: 'work-project', mutation: laneProjectionMutation() });
    const crossLaneBody = { ...crossLane.permit };
    delete crossLaneBody.permitHash;
    crossLaneBody.lane = 'tracked';
    crossLaneBody.target = { specPath: LANE_SPEC, lane: 'tracked', issueId: 'bd-101' };
    crossLane.permit = { ...crossLaneBody, permitHash: sha256(canonicalJson(crossLaneBody)) };
    assertLaneRefusal(root, crossLane, 'permit-operation-mismatch', 'permit transferred from the tracked lane');

    const wrongOperation = laneRequest(root, { operation: 'work-project', mutation: laneProjectionMutation() });
    const setRequest = laneRequest(root);
    wrongOperation.permit = setRequest.permit;
    assertLaneRefusal(root, wrongOperation, 'permit-hash-mismatch', 'work-project carrying a lane-mutation permit');

    const staleRunState = laneRequest(root);
    staleRunState.state = { ...LANE_RUN_STATE, policy: { ...LANE_RUN_STATE.policy, overall: 4 } };
    assertLaneRefusal(root, staleRunState, 'run-state-mismatch', 'run state that is not the permit subject');

    const wrongIdentity = laneRequest(root);
    wrongIdentity.mutation = { ...wrongIdentity.mutation, snapshotUpdatedAt: '2026-07-25T13:00:00Z' };
    assertLaneRefusal(root, wrongIdentity, 'mutation-identity-mismatch', 'mutation that is not the permitted object');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary rejects disallowed transitions and prestate drift', () => {
  const root = scaffoldLane();
  try {
    const illegal = laneRequest(root, { mutation: laneMutation({ toGlyph: 'x' }) });
    assertLaneRefusal(root, illegal, 'transition-not-allowed', 'claim to done');

    const badBlocker = laneRequest(root, {
      mutation: laneMutation({ kind: 'task-blocked', reason: 'task-blocked', toGlyph: '!', blocker: { kind: 'unchanged', before: null, after: null } }),
    });
    assertLaneRefusal(root, badBlocker, 'transition-not-allowed', 'block without an add blocker effect');

    const mismatchedReason = laneRequest(root, { mutation: laneMutation({ reason: 'task-completed' }) });
    assertLaneRefusal(root, mismatchedReason, 'mutation-schema-mismatch', 'reason that does not match its kind');

    const wrongFrom = laneRequest(root, { mutation: laneMutation({ fromGlyph: '!', toGlyph: '~', blocker: { kind: 'remove', before: 'waiting', after: null } }) });
    assertLaneRefusal(root, wrongFrom, 'lane-prestate-mismatch', 'fromGlyph that contradicts the fresh board');

    const unknownTask = laneRequest(root, { taskKey: 'T404@6d697373' });
    assertLaneRefusal(root, unknownTask, 'mapping-missing', 'task key with no canonical unit');

    // Transferred effects: the permit is rebuilt over each mutation, so only
    // the boundary's own target and owner comparisons can reject them.
    const transferredMutationTarget = laneRequest(root, {
      mutation: laneMutation({ target: { specPath: LANE_SPEC, lane: 'lightweight', taskKey: LANE_OTHER_KEY } }),
    });
    assertLaneRefusal(root, transferredMutationTarget, 'target-mismatch', 'mutation carrying another task target');

    const transferredOwnerLog = laneRequest(root, {
      mutation: laneMutation({
        ownerLog: {
          ...laneOwnerAppend(root, ['- 2026-07-25T12:00:00Z - lane claim']),
          ownerPath: '.dude/ideas/other.md',
        },
      }),
    });
    assertLaneRefusal(root, transferredOwnerLog, 'owner-log-conflict', 'owner log naming another owner');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary rejects malformed, conflicting, and unhashed event lines', () => {
  const root = scaffoldLane();
  try {
    const event = laneEvent('claim');
    const crLine = laneRequest(root, {
      mutation: laneMutation({
        eventLines: {
          kind: 'append-exact',
          lines: [{ eventHash: event.eventHash, exactLine: `- dude-run-event: ${canonicalJson(event)}`, terminator: 'CRLF' }],
          appendIfAbsent: true,
        },
      }),
    });
    assertLaneRefusal(root, crLine, 'event-line-mismatch', 'non-LF terminator');

    const wrapped = laneRequest(root, {
      mutation: laneMutation({
        eventLines: {
          kind: 'append-exact',
          lines: [{ eventHash: event.eventHash, exactLine: `- dude-run-event: ${canonicalJson({ event })}`, terminator: 'LF' }],
          appendIfAbsent: true,
        },
      }),
    });
    assertLaneRefusal(root, wrapped, 'event-line-mismatch', 'legacy CJ({event}) wrapper');

    const forgedHash = { ...event, eventHash: sha256('forged') };
    const unbound = laneRequest(root, { mutation: laneMutation({ eventLines: laneEventEffect([forgedHash]) }) });
    assertLaneRefusal(root, unbound, 'event-line-mismatch', 'event body that does not recompute its hash');

    // A different body already carrying the same hash on the lane conflicts.
    const conflictEvent = laneEvent('claim');
    const conflictLine = `- dude-run-event: ${canonicalJson({ ...conflictEvent, seed: 'other' })}`;
    fs.appendFileSync(path.join(root, ...LANE_TASKS.split('/')), `${conflictLine}\n`);
    const conflict = laneRequest(root, { mutation: laneMutation({ eventLines: laneEventEffect([conflictEvent]) }) });
    assertLaneRefusal(root, conflict, 'event-conflict', 'same-hash conflicting lane body');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary rejects owner, snapshot, and root failures before any write', () => {
  const root = scaffoldLane();
  try {
    const staleOwnerHash = laneRequest(root, {
      mutation: laneMutation({
        ownerLog: {
          kind: 'append-exact',
          ownerPath: LANE_IDEA,
          expectedOwnerHash: sha256('stale owner bytes'),
          exactLines: ['- 2026-07-25T12:00:00Z - lane claim'],
          terminator: 'LF',
          appendIfAbsent: true,
        },
      }),
    });
    assertLaneRefusal(root, staleOwnerHash, 'owner-prestate-mismatch', 'stale expected owner hash');

    const otherOwner = laneRequest(root);
    otherOwner.owner = { ...otherOwner.owner, ideaPath: '.dude/ideas/absent.md' };
    assertLaneRefusal(root, otherOwner, 'owner-resolution-failed', 'owner binding hash over another idea path', { ideaPath: '.dude/ideas/absent.md' });

    assertLaneRefusal(root, { ...laneRequest(root), root: path.join(root, 'missing') }, 'unsafe-root-or-path', 'missing root', { observable: false });
    assertLaneRefusal(root, { ...laneRequest(root), root: `${root}/` }, 'unsafe-root-or-path', 'noncanonical root', { observable: false });

    const snapshotFile = path.join(root, ...LANE_SNAPSHOT.split('/'));
    const goodSnapshot = fs.readFileSync(snapshotFile);
    fs.writeFileSync(snapshotFile, '{ not json\n');
    const corrupt = laneRequest(root);
    assertLaneRefusal(root, corrupt, 'snapshot-corrupt', 'corrupt coordinator snapshot');
    fs.writeFileSync(snapshotFile, goodSnapshot);

    // A second defined owner for the same spec is ambiguous ownership.
    writeLaneFile(root, '.dude/ideas/lane-duplicate.md', laneIdeaLedger());
    assertLaneRefusal(root, laneRequest(root), 'owner-resolution-failed', 'ambiguous defined owners');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('issue #21: an absent optional snapshot uses the canonical empty baseline and is created by the first mutation', () => {
  // Arrange: the semantic capture is canonical `{}` while the physical preimage
  // is absent. This is the only valid missing-snapshot representation.
  const root = scaffoldLane();
  try {
    const snapshotPath = laneSnapshotPath(root);
    fs.rmSync(snapshotPath);
    const beforeTasks = laneBytes(root, LANE_TASKS);
    const beforeOwner = laneBytes(root, LANE_IDEA);
    assert.deepEqual(laneSnapshotShape(root), { kind: 'missing' });
    const request = laneRequest(root, { taskStateCapture: LANE_EMPTY_SNAPSHOT });

    // Act.
    const result = applyLightweightWorkRequest(request);

    // Assert: the authorized claim atomically establishes the real snapshot
    // rather than treating absence as an expected-capture mismatch.
    assert.equal(result.ok, true, `absent optional snapshot result: ${canonicalJson(result)}`);
    assertAutonomousCommittedResult(result, root, 'absent optional snapshot');
    assert.ok(fs.existsSync(snapshotPath), 'the first committed mutation creates the snapshot');
    assert.equal(result.receipt.tasksPoststateHash, sha256(laneBytes(root, LANE_TASKS)));
    assert.equal(result.receipt.ownerPoststateHash, sha256(laneBytes(root, LANE_IDEA)));
    assert.equal(beforeTasks.equals(laneBytes(root, LANE_TASKS)), false, 'the claim changes tasks');
    assert.ok(beforeOwner.equals(laneBytes(root, LANE_IDEA)), 'claim leaves its no-op owner log exact');
    assert.deepEqual(JSON.parse(laneBytes(root, LANE_SNAPSHOT).toString('utf8'))[LANE_TASKS], {
      glyphs: { [LANE_TASK_KEY]: '~', [LANE_OTHER_KEY]: ' ' },
      updated_at: '2026-07-25T12:00:00.000Z',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('issue #21: unsafe physical snapshots never borrow the absent-snapshot baseline', () => {
  /** @type {Array<{
   *   label:string,
   *   arrange:(root:string)=>{unreadableBytes?:Buffer, assertExtra?:()=>void, cleanup?:()=>void}
   * }>} */
  const cases = [
    {
      label: 'zero-byte snapshot',
      arrange(root) {
        fs.writeFileSync(laneSnapshotPath(root), Buffer.alloc(0));
        return {};
      },
    },
    {
      label: 'malformed snapshot',
      arrange(root) {
        const malformed = Buffer.from('{ not json\n');
        fs.writeFileSync(laneSnapshotPath(root), malformed);
        return {};
      },
    },
    {
      label: 'nonregular snapshot directory',
      arrange(root) {
        const snapshotPath = laneSnapshotPath(root);
        fs.rmSync(snapshotPath);
        fs.mkdirSync(snapshotPath);
        return {};
      },
    },
    {
      label: 'symlinked snapshot',
      arrange(root) {
        const snapshotPath = laneSnapshotPath(root);
        const outside = path.join(root, 'outside-task-state.json');
        // A valid empty target proves the boundary rejects the link itself,
        // rather than merely refusing because a followed target is malformed.
        const outsideBytes = Buffer.from(LANE_EMPTY_SNAPSHOT);
        fs.writeFileSync(outside, outsideBytes);
        fs.rmSync(snapshotPath);
        fs.symlinkSync(outside, snapshotPath);
        return {
          assertExtra() {
            assert.deepEqual(fs.readFileSync(outside), outsideBytes, 'symlink target stays untouched');
          },
        };
      },
    },
  ];
  if (process.getuid?.() !== 0) {
    cases.push({
      label: 'unreadable snapshot',
      arrange(root) {
        const snapshotPath = laneSnapshotPath(root);
        const original = fs.readFileSync(snapshotPath);
        fs.chmodSync(snapshotPath, 0o000);
        return {
          unreadableBytes: original,
          cleanup() {
            fs.chmodSync(snapshotPath, 0o644);
          },
        };
      },
    });
  }

  for (const scenario of cases) {
    const root = scaffoldLane();
    let cleanup = () => {};
    try {
      const arranged = scenario.arrange(root);
      cleanup = arranged.cleanup ?? cleanup;
      const before = {
        tasks: laneBytes(root, LANE_TASKS),
        owner: laneBytes(root, LANE_IDEA),
        snapshot: laneSnapshotShape(root, arranged.unreadableBytes),
      };
      // Bind the only semantic value allowed for a truly absent snapshot. A
      // faulty null/nonregular fallback would accept this against an unsafe node.
      const request = laneRequest(root, {
        taskStateCapture: LANE_EMPTY_SNAPSHOT,
        mutation: laneMutation({
          ownerLog: laneOwnerAppend(root, ['- 2026-07-25T12:00:00Z - unsafe snapshot must refuse']),
        }),
      });

      // Act.
      const result = applyLightweightWorkRequest(request);

      // Assert: only physical absence is an empty baseline. Every unsafe
      // present form refuses and preserves its exact node/bytes.
      assert.equal(result.ok, false, scenario.label);
      assert.equal(result.phase, 'refused', scenario.label);
      assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, scenario.label);
      assert.ok(before.tasks.equals(laneBytes(root, LANE_TASKS)), `${scenario.label}: tasks stay exact`);
      assert.ok(before.owner.equals(laneBytes(root, LANE_IDEA)), `${scenario.label}: owner stays exact`);
      assert.deepEqual(
        laneSnapshotShape(root, arranged.unreadableBytes),
        before.snapshot,
        `${scenario.label}: snapshot node and bytes stay exact`,
      );
      if (arranged.unreadableBytes) {
        const snapshotPath = laneSnapshotPath(root);
        fs.chmodSync(snapshotPath, 0o644);
        assert.deepEqual(
          fs.readFileSync(snapshotPath),
          arranged.unreadableBytes,
          `${scenario.label}: unreadable snapshot bytes stay exact`,
        );
        fs.chmodSync(snapshotPath, 0o000);
      }
      arranged.assertExtra?.();
    } finally {
      cleanup();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('T006 lightweight boundary rejects an ambiguous canonical task mapping', () => {
  const root = scaffoldLane();
  try {
    const tasksFile = path.join(root, ...LANE_TASKS.split('/'));
    fs.writeFileSync(tasksFile, LANE_TASKS_FIXTURE.replace(
      `- [ ] ${LANE_OTHER_KEY} [US3] Another canonical unit`,
      `- [ ] ${LANE_TASK_KEY} [US3] Duplicate canonical unit`,
    ));
    assertLaneRefusal(root, laneRequest(root), 'mapping-ambiguous', 'duplicate canonical task units');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Atomicity is safety-critical: a partially applied board would corrupt live
// workflow state. Inject at each real destination rather than using file mode
// bits, because atomic replacement rightly does not inherit a target file's
// read-only bit.
test('T006 lightweight application restores every existing surface after a persistence failure', () => {
  for (const blocked of [LANE_TASKS, LANE_SNAPSHOT, LANE_IDEA]) {
    const root = scaffoldLane();
    const absolute = path.join(root, ...blocked.split('/'));
    try {
      // An owner-log append makes all three surfaces genuinely change.
      const mutation = laneMutation({ ownerLog: laneOwnerAppend(root, ['- 2026-07-25T12:00:00Z - lane claim']) });
      const request = laneRequest(root, { mutation });
      const before = laneSurfaces(root);

      // Act: fail the direct writer or the staged replacement at this surface.
      const { result, injected } = applyWithInjectedLanePersistenceFailure(
        (candidate) => candidate === absolute,
        () => applyLightweightWorkRequest(request),
      );
      const after = laneSurfaces(root);

      assert.equal(injected, 1, `${blocked}: deterministic persistence failure fired`);
      assert.equal(result.ok, false, `${blocked}: must not report success`);
      assert.equal(result.phase, 'refused', `${blocked}: phase`);
      assert.equal(result.reason, 'atomic-apply-failed', `${blocked}: reason`);
      assert.equal(result.receipt, undefined, `${blocked}: a failed application carries no receipt`);
      for (const surface of /** @type {const} */ (['tasks', 'taskState', 'owner'])) {
        assert.ok(before[surface].equals(after[surface]), `${blocked}: ${surface} must stay byte-identical`);
      }
      assert.equal(result.unchangedPrestateHash, laneObservationHash(root), `${blocked}: fresh unchanged evidence`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('issue #21: a later persistence failure restores task and owner bytes and snapshot absence', () => {
  const root = scaffoldLane();
  try {
    // Arrange: this request has the valid semantic empty baseline but no
    // snapshot preimage on disk. A failure only after creation must delete it.
    const snapshotAbsolute = laneSnapshotPath(root);
    fs.rmSync(snapshotAbsolute);
    const mutation = laneMutation({ ownerLog: laneOwnerAppend(root, ['- 2026-07-25T12:00:00Z - lane claim']) });
    const request = laneRequest(root, { mutation, taskStateCapture: LANE_EMPTY_SNAPSHOT });
    const before = {
      tasks: laneBytes(root, LANE_TASKS),
      owner: laneBytes(root, LANE_IDEA),
      snapshot: laneSnapshotShape(root),
    };
    const mutablePaths = new Set([
      path.join(root, ...LANE_TASKS.split('/')),
      path.join(root, ...LANE_IDEA.split('/')),
    ]);

    // Act: wait until the snapshot exists, then fail a later task/owner
    // persistence operation. This works for both direct write ordering and
    // byte-sorted staged replacement without exposing a production test hook.
    const { result, injected } = applyWithInjectedLanePersistenceFailure(
      (candidate) => candidate !== snapshotAbsolute
        && mutablePaths.has(candidate)
        && fs.existsSync(snapshotAbsolute),
      () => applyLightweightWorkRequest(request),
    );

    // Assert.
    assert.equal(
      injected,
      1,
      `the failure occurred after snapshot creation: ${canonicalJson(result)}`,
    );
    assert.equal(result.ok, false, 'must not report success');
    assert.equal(result.phase, 'refused');
    assert.equal(result.reason, 'atomic-apply-failed');
    assert.equal(result.receipt, undefined, 'a failed application carries no receipt');
    assert.ok(before.tasks.equals(laneBytes(root, LANE_TASKS)), 'tasks must stay byte-identical');
    assert.ok(before.owner.equals(laneBytes(root, LANE_IDEA)), 'owner must stay byte-identical');
    assert.deepEqual(laneSnapshotShape(root), before.snapshot, 'snapshot absence must be restored');
    assert.match(result.unchangedPrestateHash, /^[0-9a-f]{64}$/, 'refusal retains a fresh observation');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// `controlled-end` is a contract-named kind: the target state is deliberately
// unchanged, so only history (and any owner log) may move and the receipt must
// report `targetStateChanged: false`.
test('T006 lightweight controlled-end records the end without changing target state', () => {
  const root = scaffoldLane();
  try {
    const mutation = laneMutation({
      kind: 'controlled-end',
      reason: 'controlled-unresolved-end',
      fromGlyph: ' ',
      toGlyph: ' ',
      eventLines: laneEventEffect([laneEvent('controlled-end')]),
      ownerLog: laneOwnerAppend(root, ['- 2026-07-25T12:00:00Z - controlled unresolved end']),
    });
    const before = laneSurfaces(root);
    const result = applyLightweightWorkRequest(laneRequest(root, { mutation }));

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.receipt.targetStateChanged, false, 'a controlled end never changes target state');
    const after = laneSurfaces(root);
    assert.equal(
      after.tasks.toString('utf8'),
      `${before.tasks.toString('utf8')}${mutation.eventLines.lines[0].exactLine}\n`,
      'tasks.md changes by exactly one appended LF record',
    );
    assert.match(after.tasks.toString('utf8'), new RegExp(`- \\[ \\] ${LANE_TASK_KEY}`), 'glyph unchanged');
    assert.ok(
      after.owner.toString('utf8').endsWith('- 2026-07-25T12:00:00Z - controlled unresolved end\n'),
      'the owner log still records the end',
    );
    assert.equal(result.receipt.ownerPoststateHash, sha256(after.owner));
    assert.equal(JSON.parse(after.taskState.toString('utf8'))[LANE_TASKS].glyphs[LANE_TASK_KEY], ' ');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight controlled-end refuses a completed target and a state change', () => {
  const root = scaffoldLane();
  try {
    const controlledEnd = (overrides) => laneMutation({
      kind: 'controlled-end',
      reason: 'controlled-unresolved-end',
      fromGlyph: ' ',
      toGlyph: ' ',
      eventLines: laneEventEffect([laneEvent('controlled-end')]),
      ...overrides,
    });
    assertLaneRefusal(
      root,
      laneRequest(root, { mutation: controlledEnd({ fromGlyph: 'x', toGlyph: 'x' }) }),
      'transition-not-allowed',
      'controlled end over a completed unit',
    );
    assertLaneRefusal(
      root,
      laneRequest(root, { mutation: controlledEnd({ toGlyph: '~' }) }),
      'transition-not-allowed',
      'controlled end that moves the glyph',
    );
    assertLaneRefusal(
      root,
      laneRequest(root, { mutation: controlledEnd({ reason: 'task-blocked' }) }),
      'mutation-schema-mismatch',
      'controlled end with a reason from another kind',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Incident supersession is the one Lightweight kind bound to a fixed Feature
// 007 target and the only one carrying `intentIdentity` / `previewIdentity`, so
// it needs its own fixture at that exact spec path and task key.
const INCIDENT_SPEC = '.dude/specs/007-technical-docs-pack-remediation/spec.md';
const INCIDENT_TASKS = '.dude/specs/007-technical-docs-pack-remediation/tasks.md';
const INCIDENT_IDEA = '.dude/ideas/incident.md';
const INCIDENT_TASK_KEY = 'T001@00709e37';
const INCIDENT_TARGET = { specPath: INCIDENT_SPEC, lane: 'lightweight', taskKey: INCIDENT_TASK_KEY };
const INCIDENT_BLOCKER = 'superseded by the corrected intent';
const INCIDENT_TASKS_FIXTURE = `# Tasks: Incident

## Phase 1

- [!] ${INCIDENT_TASK_KEY} [US1] Remediation unit
   blocked-by: ${INCIDENT_BLOCKER}

## Lightweight Execution History

- 2026-07-24T00:00:00Z - baseline
`;

function scaffoldIncident() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-incident-')));
  writeLaneFile(root, INCIDENT_SPEC, '# Spec 007\n');
  writeLaneFile(root, INCIDENT_TASKS, INCIDENT_TASKS_FIXTURE);
  writeLaneFile(
    root,
    INCIDENT_IDEA,
    `---\nstatus: defined\nspec_path: ${INCIDENT_SPEC}\n---\n\n## Idea\n\nIncident.\n\n## Coordinator Log\n\n- Existing entry.\n`,
  );
  writeLaneFile(root, LANE_SNAPSHOT, `${JSON.stringify({
    [INCIDENT_TASKS]: { glyphs: { [INCIDENT_TASK_KEY]: '!' }, updated_at: '2026-07-24T00:00:00.000Z' },
  }, null, 2)}\n`);
  return root;
}

/** @param {string} root */
function incidentSurfaces(root) {
  return {
    tasks: laneBytes(root, INCIDENT_TASKS),
    taskState: laneBytes(root, LANE_SNAPSHOT),
    owner: laneBytes(root, INCIDENT_IDEA),
  };
}

/** @param {Record<string, unknown>} overrides */
function incidentMutation(overrides = {}) {
  return {
    version: 1,
    lane: 'lightweight',
    kind: 'incident-supersession',
    reason: 'incident-supersession',
    intentIdentity: sha256('corrected intent'),
    previewIdentity: sha256('applied preview'),
    target: INCIDENT_TARGET,
    fromGlyph: '!',
    toGlyph: '~',
    blocker: { kind: 'remove', before: INCIDENT_BLOCKER, after: null },
    eventLines: laneEventEffect([laneEvent('incident')]),
    ownerLog: { kind: 'none' },
    snapshotUpdatedAt: LANE_STAMP,
    ...overrides,
  };
}

/** Build one complete valid incident request against the CURRENT fresh bytes. */
function incidentRequest(root, mutation) {
  const surfaces = incidentSurfaces(root);
  const ownerCapture = laneCapture(surfaces.owner);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: INCIDENT_IDEA,
    specPath: INCIDENT_SPEC,
    ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  }));
  const mapping = {
    version: 1,
    lane: 'lightweight',
    target: INCIDENT_TARGET,
    ownerBindingHash,
    tasksPath: INCIDENT_TASKS,
    tasksDescriptor: laneDescriptor(surfaces.tasks),
    taskStatePath: LANE_SNAPSHOT,
    taskStateDescriptor: laneDescriptor(surfaces.taskState),
    taskKey: INCIDENT_TASK_KEY,
  };
  const prestate = {
    version: 1,
    lane: 'lightweight',
    target: INCIDENT_TARGET,
    glyph: '!',
    blockedBy: INCIDENT_BLOCKER,
    tasksDescriptor: laneDescriptor(surfaces.tasks),
    taskStateDescriptor: laneDescriptor(surfaces.taskState),
    ownerDescriptor: laneDescriptor(surfaces.owner),
  };
  const permitBody = {
    version: 1,
    kind: 'lane-mutation',
    origin: 'dude-work',
    lane: 'lightweight',
    operation: 'work-set',
    target: INCIDENT_TARGET,
    subjectRunStateHash: sha256(canonicalJson(LANE_RUN_STATE)),
    governanceIdentity: null,
    governancePhase: null,
    attemptIdentity: null,
    targetMappingHash: sha256(canonicalJson(mapping)),
    lanePrestateHash: sha256(canonicalJson(prestate)),
    mutationIdentity: sha256(canonicalJson(mutation)),
  };
  return {
    version: 1,
    operation: 'work-set',
    root,
    owner: { ideaPath: INCIDENT_IDEA, specPath: INCIDENT_SPEC, ownerCapture, ownerBindingHash },
    target: INCIDENT_TARGET,
    state: LANE_RUN_STATE,
    permit: { ...permitBody, permitHash: sha256(canonicalJson(permitBody)) },
    mapping,
    expected: {
      tasksPath: INCIDENT_TASKS,
      tasks: laneCapture(surfaces.tasks),
      taskStatePath: LANE_SNAPSHOT,
      taskState: laneCapture(surfaces.taskState),
    },
    mutation,
  };
}

test('T006 lightweight incident supersession commits both permitted blocked transitions', () => {
  for (const scenario of [
    {
      label: '! to ~',
      mutation: incidentMutation(),
      glyph: '~',
      blockedBy: null,
    },
    {
      label: '! to !',
      mutation: incidentMutation({
        toGlyph: '!',
        blocker: { kind: 'replace', before: INCIDENT_BLOCKER, after: 'corrected supersession blocker' },
      }),
      glyph: '!',
      blockedBy: 'corrected supersession blocker',
    },
  ]) {
    const root = scaffoldIncident();
    try {
      const result = applyLightweightWorkRequest(incidentRequest(root, scenario.mutation));

      assert.equal(result.ok, true, `${scenario.label}: ${JSON.stringify(result)}`);
      assert.equal(result.receipt.targetStateChanged, true, `${scenario.label}: supersession changes target state`);
      assert.equal(
        result.receipt.mutationIdentity,
        sha256(canonicalJson(scenario.mutation)),
        `${scenario.label}: identity binds intentIdentity and previewIdentity`,
      );
      const after = incidentSurfaces(root);
      const tasksText = after.tasks.toString('utf8');
      assert.match(tasksText, new RegExp(`- \\[${scenario.glyph}\\] ${INCIDENT_TASK_KEY}`), `${scenario.label}: glyph`);
      assert.equal(
        (/^\s*blocked-by:\s*(.+)$/m.exec(tasksText) || [null, null])[1],
        scenario.blockedBy,
        `${scenario.label}: blocked-by metadata`,
      );
      assert.ok(tasksText.includes(`${scenario.mutation.eventLines.lines[0].exactLine}\n`), `${scenario.label}: exact event record`);
      assert.equal(result.receipt.tasksPoststateHash, sha256(after.tasks), `${scenario.label}: real poststate hash`);
      assert.equal(
        JSON.parse(after.taskState.toString('utf8'))[INCIDENT_TASKS].glyphs[INCIDENT_TASK_KEY],
        scenario.glyph,
        `${scenario.label}: snapshot glyph`,
      );
      assert.ok(after.owner.equals(incidentSurfaces(root).owner), `${scenario.label}: owner stable`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('T006 lightweight incident supersession is bound to the exact Feature 007 target and its identities', () => {
  const root = scaffoldIncident();
  try {
    const assertIncidentRefusal = (mutation, reason, label) => {
      const before = incidentSurfaces(root);
      const result = applyLightweightWorkRequest(incidentRequest(root, mutation));
      const after = incidentSurfaces(root);
      assert.equal(result.ok, false, `${label}: must refuse`);
      assert.equal(result.phase, 'refused', `${label}: phase`);
      assert.equal(result.reason, reason, `${label}: reason`);
      for (const surface of /** @type {const} */ (['tasks', 'taskState', 'owner'])) {
        assert.ok(before[surface].equals(after[surface]), `${label}: ${surface} must stay byte-identical`);
      }
    };

    const noIntent = incidentMutation();
    delete noIntent.intentIdentity;
    assertIncidentRefusal(noIntent, 'invalid-request-shape', 'supersession without an intent identity');
    const noPreview = incidentMutation();
    delete noPreview.previewIdentity;
    assertIncidentRefusal(noPreview, 'invalid-request-shape', 'supersession without a preview identity');
    assertIncidentRefusal(
      incidentMutation({ intentIdentity: 'corrected-intent' }),
      'invalid-canonical-value',
      'intent identity that is not a hash',
    );
    assertIncidentRefusal(
      incidentMutation({ previewIdentity: sha256('preview').slice(0, 63) }),
      'invalid-canonical-value',
      'preview identity of the wrong length',
    );
    assertIncidentRefusal(
      incidentMutation({ kind: 'claim', reason: 'initial-claim', toGlyph: '~' }),
      'unknown-field',
      'incident identities on an ordinary claim',
    );
    assertIncidentRefusal(
      incidentMutation({ toGlyph: 'x', blocker: { kind: 'remove', before: INCIDENT_BLOCKER, after: null } }),
      'transition-not-allowed',
      'supersession to a completed glyph',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight incident supersession refuses any target other than the Feature 007 unit', () => {
  const root = scaffoldLane();
  try {
    // The mutation target matches the request target, so only the fixed
    // Feature 007 binding can reject it.
    const transplanted = laneRequest(root, {
      glyph: ' ',
      mutation: laneMutation({
        kind: 'incident-supersession',
        reason: 'incident-supersession',
        intentIdentity: sha256('corrected intent'),
        previewIdentity: sha256('applied preview'),
        fromGlyph: '!',
        toGlyph: '~',
        blocker: { kind: 'remove', before: 'some blocker', after: null },
      }),
    });
    assertLaneRefusal(root, transplanted, 'target-mismatch', 'supersession transplanted onto another feature');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary refuses a repeated event hash inside one mutation', () => {
  const root = scaffoldLane();
  try {
    const event = laneEvent('duplicate');
    assertLaneRefusal(
      root,
      laneRequest(root, { mutation: laneMutation({ eventLines: laneEventEffect([event, event]) }) }),
      'event-conflict',
      'same event hash twice in one effect',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T006 lightweight boundary refuses noncanonical values before any write', () => {
  const root = scaffoldLane();
  try {
    assertLaneRefusal(
      root,
      laneRequest(root, { mutation: laneMutation({ snapshotUpdatedAt: '2026-07-25T12:00:00.000Z' }) }),
      'invalid-canonical-value',
      'snapshot stamp that is not canonical UTC',
    );
    const badOwnerPath = laneRequest(root);
    badOwnerPath.owner = { ...badOwnerPath.owner, ideaPath: 'ideas/lane.md' };
    assertLaneRefusal(root, badOwnerPath, 'invalid-canonical-value', 'owner path outside .dude/ideas', { observable: false });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
