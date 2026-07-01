// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseTasks,
  readyTasks,
  nextTask,
  renderBoard,
  boardIsStale,
  setTaskState,
  toGlyph,
  glyphsOf,
  diffAgainstSnapshot,
  BOARD_START,
  BOARD_END,
  BOARD_NOTICE,
  CANONICAL_NOTICE,
} from './tasks.mjs';

const FIXTURE = `# Feature X — tasks

## Setup
- [x] T001@aaaaaaaa Setup repo

## Foundational
- [ ] T002@bbbbbbbb [P] Foundational schema
   deps: T001@aaaaaaaa

## User Story 1
- [ ] T003@cccccccc [US1|Shared] Do the thing
   deps: T002@bbbbbbbb
   blocked-by: waiting on API
- [~] T004@dddddddd In progress task

## Polish
- [ ] T005@eeeeeeee Final polish
`;

test('parseTasks extracts headers, flags, labels, deps, and metadata', () => {
  const p = parseTasks(FIXTURE, { path: 'tasks.md' });
  assert.equal(p.tasks.length, 5);
  const t2 = p.byId.get('T002@bbbbbbbb');
  assert.equal(t2.parallel, true);
  assert.equal(t2.state, 'todo');
  assert.deepEqual(t2.deps, ['T001@aaaaaaaa']);
  const t3 = p.byId.get('T003@cccccccc');
  assert.equal(t3.label, 'US1|Shared');
  assert.equal(t3.blockedBy, 'waiting on API');
  assert.equal(p.byId.get('T001@aaaaaaaa').state, 'done');
  assert.equal(p.byId.get('T004@dddddddd').state, 'in-progress');
});

test('parseTasks records warnings for duplicate, malformed, and dangling deps', () => {
  const bad = `## Setup
- [ ] T001@aaaaaaaa first
- [ ] T001@aaaaaaaa dup id
- [ ] T009@ffffffff needs missing
   deps: T404@00000000
- [z] T010@11111111 bad glyph
`;
  const p = parseTasks(bad);
  assert.ok(p.warnings.some((w) => /duplicate task id T001/.test(w)));
  assert.ok(p.warnings.some((w) => /unknown id T404@00000000/.test(w)));
  assert.ok(p.warnings.some((w) => /malformed task line/.test(w)));
});

test('readyTasks = todo with deps satisfied, ordered by phase then num', () => {
  const p = parseTasks(FIXTURE);
  const ready = readyTasks(p).map((t) => t.id);
  // T002 ready (dep T001 done); T003 not (dep T002 todo); T004 in-progress; T005 ready.
  assert.deepEqual(ready, ['T002@bbbbbbbb', 'T005@eeeeeeee']);
  assert.equal(nextTask(p).id, 'T002@bbbbbbbb');
});

test('renderBoard inserts a fresh board with both notices and is idempotent', () => {
  const p = parseTasks(FIXTURE);
  const once = renderBoard(p);
  assert.ok(once.includes(BOARD_START) && once.includes(BOARD_END));
  assert.ok(once.includes(BOARD_NOTICE));
  assert.ok(once.includes(CANONICAL_NOTICE));
  assert.ok(once.includes('### Ready Now'));
  // canonical tasks survive
  assert.ok(once.includes('- [x] T001@aaaaaaaa Setup repo'));
  // idempotent: rendering the rendered output reproduces it byte-for-byte
  const twice = renderBoard(parseTasks(once));
  assert.equal(twice, once, 'render is a fixed point');
  const thrice = renderBoard(parseTasks(twice));
  assert.equal(thrice, twice);
});

test('renderBoard replaces an existing board region in place', () => {
  const withBoard = renderBoard(parseTasks(FIXTURE));
  // flip a task, re-render; board Ready Now should change but structure stays single
  const flipped = setTaskState(parseTasks(withBoard), 'T002@bbbbbbbb', 'done').content;
  const rerendered = renderBoard(parseTasks(flipped));
  assert.equal((rerendered.match(new RegExp(BOARD_START, 'g')) || []).length, 1, 'exactly one board');
  assert.equal((rerendered.match(new RegExp(CANONICAL_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);
  // T003 now ready (its dep T002 is done)
  assert.ok(readyTasks(parseTasks(rerendered)).some((t) => t.id === 'T003@cccccccc'));
});

test('boardIsStale detects a missing/outdated board', () => {
  assert.equal(boardIsStale(parseTasks(FIXTURE)), true); // no board yet
  const fresh = renderBoard(parseTasks(FIXTURE));
  assert.equal(boardIsStale(parseTasks(fresh)), false); // freshly rendered
});

test('setTaskState flips exactly one glyph and manages blocked-by', () => {
  const p = parseTasks(FIXTURE);
  const done = setTaskState(p, 'T002@bbbbbbbb', 'x').content;
  assert.ok(done.includes('- [x] T002@bbbbbbbb [P] Foundational schema'));
  // other tasks untouched
  assert.ok(done.includes('- [ ] T005@eeeeeeee Final polish'));
  // blocked-by insert
  const blocked = setTaskState(parseTasks(FIXTURE), 'T005@eeeeeeee', '!', { blockedBy: 'needs sign-off' }).content;
  assert.ok(/- \[!\] T005@eeeeeeee Final polish\n\s+blocked-by: needs sign-off/.test(blocked));
  // blocked-by update (existing)
  const updated = setTaskState(parseTasks(blocked), 'T003@cccccccc', '!', { blockedBy: 'new reason' }).content;
  assert.ok(updated.includes('blocked-by: new reason'));
  assert.ok(!updated.includes('waiting on API'));
});

test('setTaskState throws on unknown id; toGlyph validates', () => {
  assert.throws(() => setTaskState(parseTasks(FIXTURE), 'T999@zzzzzzzz', 'x'), /unknown task id/);
  assert.equal(toGlyph('done'), 'x');
  assert.equal(toGlyph('~'), '~');
  assert.throws(() => toGlyph('bogus'), /invalid state/);
});

test('diffAgainstSnapshot flags human-applied [x] without a baseline record', () => {
  const p = parseTasks(FIXTURE);
  const snap = glyphsOf(p); // baseline: T001 done, rest not
  assert.deepEqual(diffAgainstSnapshot(p, snap).unexpectedDone, []);
  // user hand-checks T005 -> [x]
  const hand = setTaskState(parseTasks(FIXTURE), 'T005@eeeeeeee', 'x').content;
  const d = diffAgainstSnapshot(parseTasks(hand), snap);
  assert.deepEqual(d.unexpectedDone, ['T005@eeeeeeee']);
  assert.equal(diffAgainstSnapshot(parseTasks(hand), undefined).baseline, false);
});

test('parseTasks accepts the canonical alnum (non-hex) durable suffix', () => {
  // durable suffixes are [a-z0-9]{8}, not hex — e.g. e4f5g6h7, g7h8i9j0
  const c = `## Setup
- [x] T001@e4f5g6h7 Setup
## Foundational
- [ ] T002@g7h8i9j0 Real work
   deps: T001@e4f5g6h7
`;
  const p = parseTasks(c);
  assert.equal(p.tasks.length, 2, JSON.stringify(p.warnings));
  assert.equal(p.warnings.length, 0, `no malformed warnings: ${p.warnings.join('; ')}`);
  assert.equal(nextTask(p).id, 'T002@g7h8i9j0');
});

test('board fence content is ignored when parsing canonical state', () => {
  const withBoard = renderBoard(parseTasks(FIXTURE));
  const p = parseTasks(withBoard);
  // still exactly 5 canonical tasks despite board entries referencing them
  assert.equal(p.tasks.length, 5);
});

test('snapshot round-trips through the filesystem shape', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-tasks-'));
  try {
    const snapFile = path.join(dir, 'task-state.json');
    const snap = { 'specs/x/tasks.md': { glyphs: glyphsOf(parseTasks(FIXTURE)), updated_at: 'now' } };
    fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2));
    const read = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
    assert.equal(read['specs/x/tasks.md'].glyphs['T001@aaaaaaaa'], 'x');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
