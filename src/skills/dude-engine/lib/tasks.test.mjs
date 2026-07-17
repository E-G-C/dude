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
  deriveDependencies,
  renderBoard,
  boardIsStale,
  setTaskState,
  applyStates,
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

const ARCHIVED_ROWS = `- [!] T001@aaaaaaaa Archived blocker
  blocked-by: superseded during reconciliation
- [x] T012@bbbbbbbb Archived completion`;

const HISTORY_FIXTURE = `# Reconciled feature tasks

## User Story 1
- [ ] T019@cccccccc Active task

## Lightweight Execution History
${ARCHIVED_ROWS}
`;

const NOISY_ARCHIVED_ROWS = `${ARCHIVED_ROWS}
- [ ] T012@bbbbbbbb Archived duplicate
- [ ] T013@dddddddd Archived dangling dependency
   deps: T404@00000000
- [z] T014@eeeeeeee Archived malformed row`;

function historySuffixOf(content) {
  const history = parseTasks(content).history;
  assert.ok(history, 'history boundary is recognized');
  return history.suffix;
}

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

test('history: boardIsStale compares exact LF, CRLF, and bare-CR source bytes', () => {
  for (const separator of ['\n', '\r\n', '\r']) {
    const source = FIXTURE.replaceAll('\n', separator);
    const fresh = renderBoard(parseTasks(source));
    const mixedSeparator = separator === '\n' ? '\r\n' : '\n';
    const setupBoundary = `${separator}## Setup`;
    const variants = [
      fresh.slice(0, -separator.length),
      `${fresh}${separator.repeat(2)}`,
      fresh.replace(setupBoundary, `${mixedSeparator}## Setup`),
    ];

    assert.equal(parseTasks(fresh).source, fresh);
    assert.equal(boardIsStale(parseTasks(fresh)), false);
    assert.notEqual(variants[2], fresh);
    for (const variant of variants) {
      assert.equal(boardIsStale(parseTasks(variant)), true);
      const rerendered = renderBoard(parseTasks(variant));
      assert.equal(boardIsStale(parseTasks(rerendered)), false);
    }

    const active = [
      '# Reconciled feature tasks',
      '',
      '## User Story 1',
      '- [ ] T019@cccccccc Active task',
      '',
    ].join(separator);
    const historySuffix = [
      '## Lightweight Execution History',
      '- [x] T012@bbbbbbbb Archived completion',
      'arbitrary archive bytes',
      '',
      '',
    ].join(mixedSeparator);
    const withHistory = renderBoard(parseTasks(`${active}${historySuffix}`));
    const historyParsed = parseTasks(withHistory);
    assert.equal(historyParsed.history?.suffix, historySuffix);
    assert.equal(boardIsStale(historyParsed), false);
    assert.equal(renderBoard(historyParsed), withHistory);
  }
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

test('deriveDependencies: explicit deps + phase gating + intra-phase order', () => {
  const edges = deriveDependencies(parseTasks(FIXTURE));
  const has = (from, to) => edges.some((e) => e.from === from && e.to === to);
  // explicit
  assert.ok(has('T002@bbbbbbbb', 'T001@aaaaaaaa'));
  assert.ok(has('T003@cccccccc', 'T002@bbbbbbbb'));
  // phase gating: US1 depends on Foundational; Polish on US1
  assert.ok(has('T004@dddddddd', 'T002@bbbbbbbb'));
  assert.ok(has('T005@eeeeeeee', 'T003@cccccccc'));
  assert.ok(has('T005@eeeeeeee', 'T004@dddddddd'));
  // intra-phase: T004 (non-[P]) depends on earlier T003 in US1
  assert.ok(has('T004@dddddddd', 'T003@cccccccc'));
  // [P] task T002 has no forced sibling edge beyond explicit; no self edges
  assert.ok(!edges.some((e) => e.from === e.to));
});

test('applyStates batch-updates matching glyphs and reports unknown ids', () => {
  const p = parseTasks(FIXTURE);
  const r = applyStates(p, { 'T002@bbbbbbbb': 'done', 'T004@dddddddd': '!', 'T999@zzzzzzzz': 'x' });
  assert.deepEqual(r.applied.sort(), ['T002@bbbbbbbb', 'T004@dddddddd']);
  assert.deepEqual(r.unknown, ['T999@zzzzzzzz']);
  assert.ok(r.content.includes('- [x] T002@bbbbbbbb [P] Foundational schema'));
  assert.ok(r.content.includes('- [!] T004@dddddddd In progress task'));
  // unrelated tasks untouched
  assert.ok(r.content.includes('- [ ] T005@eeeeeeee Final polish'));
});

test('board fence content is ignored when parsing canonical state', () => {
  const withBoard = renderBoard(parseTasks(FIXTURE));
  const p = parseTasks(withBoard);
  // still exactly 5 canonical tasks despite board entries referencing them
  assert.equal(p.tasks.length, 5);
});

test('history: LF no-history output preserves the established exact byte shape', () => {
  const content = `# Feature tasks

## Setup
- [x] T001@aaaaaaaa Completed task

## User Story 1
- [ ] T019@cccccccc Active task

`;
  const expectedRender = [
    '# Feature tasks',
    '',
    BOARD_START,
    BOARD_NOTICE,
    '',
    '### Ready Now',
    '- T019@cccccccc Active task',
    '',
    '### In Progress',
    '- (none)',
    '',
    '### Blocked',
    '- (none)',
    '',
    '### Done',
    '- T001@aaaaaaaa Completed task',
    '',
    BOARD_END,
    '',
    CANONICAL_NOTICE,
    '',
    '## Setup',
    '- [x] T001@aaaaaaaa Completed task',
    '',
    '## User Story 1',
    '- [ ] T019@cccccccc Active task',
    '',
  ].join('\n');
  const expectedMutation = content.replace('- [ ] T019@cccccccc', '- [x] T019@cccccccc').replace(/\n+$/, '\n');

  assert.equal(renderBoard(parseTasks(content)), expectedRender);
  assert.equal(setTaskState(parseTasks(content), 'T019@cccccccc', 'done').content, expectedMutation);
  assert.equal(applyStates(parseTasks(content), { 'T019@cccccccc': 'done' }).content, expectedMutation);
});

test('history: a board-internal heading is inert and later external history wins', () => {
  const falseHeadingBoard = `${BOARD_START}
stale board bytes
## Lightweight Execution History
${BOARD_END}`;
  const suffix = `## Lightweight Execution History\n${ARCHIVED_ROWS}\n`;
  const content = `# Reconciled feature tasks

${falseHeadingBoard}

## User Story 1
- [ ] T019@cccccccc Active task

${suffix}`;
  const parsed = parseTasks(content);

  assert.deepEqual(parsed.tasks.map((task) => task.id), ['T019@cccccccc']);
  assert.equal(parsed.history?.suffix, suffix);
  assert.deepEqual(parsed.board, { startLine: 2, endLine: 5 });

  const rendered = renderBoard(parsed);
  const renderedPrefix = rendered.slice(0, rendered.indexOf(suffix));
  assert.equal(historySuffixOf(rendered), suffix);
  assert.doesNotMatch(renderedPrefix, /stale board bytes|## Lightweight Execution History/);
  assert.match(renderedPrefix, /### Ready Now\n- T019@cccccccc Active task/);
  assert.equal(renderedPrefix.split(BOARD_START).length - 1, 1);
});

test('history: LF, CRLF, and bare CR produce logical lines with raw offsets', () => {
  const logicalLines = [
    '# Reconciled feature tasks',
    '',
    '## User Story 1',
    '- [ ] T019@cccccccc Active task',
    '',
    '## Lightweight Execution History',
    '- [x] T012@bbbbbbbb Archived completion',
    '',
  ];
  for (const separator of ['\n', '\r\n', '\r']) {
    const content = logicalLines.join(separator);
    const parsed = parseTasks(content);
    const historyStart = content.indexOf('## Lightweight Execution History');

    assert.deepEqual(parsed.lines, logicalLines);
    assert.ok(parsed.lines.every((line) => !/[\r\n]/.test(line)));
    assert.equal(parsed.preferredSeparator, separator);
    assert.equal(parsed.history?.startLine, 5);
    assert.equal(parsed.history?.startOffset, historyStart);
    assert.equal(parsed.history?.suffix, logicalLines.slice(5).join(separator));
    assert.deepEqual(parsed.lineMeta[5], {
      startOffset: historyStart,
      contentEndOffset: historyStart + logicalLines[5].length,
      endOffset: historyStart + logicalLines[5].length + separator.length,
      separator,
    });
    assert.equal(parsed.byId.get('T019@cccccccc')?.headerLine, 3);
    assert.deepEqual(parsed.tasks.map((task) => task.id), ['T019@cccccccc']);
  }
});

test('history: lint-compatible headings exclude malformed archived state and warnings', () => {
  const headings = [
    '## Lightweight Execution History',
    '##\tLightweight\tExecution\tHistory\t  ',
    '## Lightweight Execution History archived reconciliation',
  ];

  for (const heading of headings) {
    const suffix = `${heading}\n${NOISY_ARCHIVED_ROWS}\n`;
    const content = `# Reconciled feature tasks

## User Story 1
- [ ] T019@cccccccc Active task

${suffix}`;
    const parsed = parseTasks(content);
    const physicalHeaderLine = content.split('\n').indexOf('- [ ] T019@cccccccc Active task');

    assert.equal(parsed.history?.startLine, physicalHeaderLine + 2);
    assert.equal(parsed.history?.suffix, suffix);
    assert.equal(parsed.byId.get('T019@cccccccc')?.headerLine, physicalHeaderLine);
    assert.deepEqual(parsed.tasks.map((task) => task.id), ['T019@cccccccc']);
    assert.deepEqual(readyTasks(parsed).map((task) => task.id), ['T019@cccccccc']);
    assert.equal(nextTask(parsed)?.id, 'T019@cccccccc');
    assert.equal(parsed.byId.has('T001@aaaaaaaa'), false);
    assert.equal(parsed.byId.has('T012@bbbbbbbb'), false);
    assert.equal(parsed.byId.has('T013@dddddddd'), false);
    assert.deepEqual(glyphsOf(parsed), { 'T019@cccccccc': ' ' });
    assert.deepEqual(parsed.warnings, []);

    const rendered = renderBoard(parsed);
    const board = rendered.slice(rendered.indexOf(BOARD_START), rendered.indexOf(BOARD_END));
    assert.match(board, /### Ready Now\n- T019@cccccccc Active task/);
    assert.match(board, /### Blocked\n- \(none\)/);
    assert.match(board, /### Done\n- \(none\)/);
    assert.doesNotMatch(board, /Archived|T001@aaaaaaaa|T012@bbbbbbbb|T013@dddddddd/);
    assert.equal(historySuffixOf(rendered), suffix);
  }
});

test('history: archived fence bytes cannot become the active board', () => {
  const archivedFence = `${BOARD_START}
archived fence-shaped bytes
${BOARD_END}`;
  const suffix = `## Lightweight Execution History\n${archivedFence}\n${ARCHIVED_ROWS}\n`;
  const canonical = `## User Story 1
- [ ] T019@cccccccc Active task

`;
  const staleActiveBoard = `${BOARD_START}
stale active board
${BOARD_END}

${CANONICAL_NOTICE}`;
  const withActiveBoard = `# Reconciled feature tasks

${staleActiveBoard}

${canonical}${suffix}`;
  const parsedWithBoard = parseTasks(withActiveBoard);
  const activeStartLine = withActiveBoard.split('\n').indexOf(BOARD_START);

  assert.deepEqual(parsedWithBoard.board, { startLine: activeStartLine, endLine: activeStartLine + 2 });
  assert.equal(parsedWithBoard.byId.get('T019@cccccccc')?.headerLine,
    withActiveBoard.split('\n').indexOf('- [ ] T019@cccccccc Active task'));
  const replaced = renderBoard(parsedWithBoard);
  assert.equal(historySuffixOf(replaced), suffix);
  assert.equal(replaced.split(BOARD_START).length - 1, 2, 'one active and one archived start fence survive');
  assert.doesNotMatch(replaced.slice(0, replaced.indexOf(suffix)), /stale active board/);

  const archivedOnly = `# Reconciled feature tasks\n\n${canonical}${suffix}`;
  const parsedArchivedOnly = parseTasks(archivedOnly);
  assert.equal(parsedArchivedOnly.board, null);
  const inserted = renderBoard(parsedArchivedOnly);
  assert.equal(historySuffixOf(inserted), suffix);
  assert.equal(inserted.split(BOARD_START).length - 1, 2, 'archive fence is not replaced during insertion');
  assert.ok(parseTasks(inserted).board, 'new active board is discoverable');
});

test('history: every separator ending round-trips through render, set, and apply', () => {
  for (const separator of ['\n', '\r\n', '\r']) {
    for (const ending of ['', separator, separator.repeat(3)]) {
      const suffix = [
        '## Lightweight Execution History',
        ...ARCHIVED_ROWS.split('\n'),
      ].join(separator) + ending;
      const activePrefix = [
        '# Reconciled feature tasks',
        '',
        '## User Story 1',
        '- [ ] T019@cccccccc Active task',
        '',
      ].join(separator);
      const content = `${activePrefix}${separator}${suffix}`;
      const parsed = parseTasks(content);
      assert.equal(parsed.history?.suffix, suffix);

      const rendered = renderBoard(parsed);
      assert.equal(historySuffixOf(rendered), suffix);
      assert.equal(boardIsStale(parseTasks(rendered)), false);
      assert.equal(renderBoard(parseTasks(rendered)), rendered);

      const set = setTaskState(parsed, 'T019@cccccccc', 'done').content;
      assert.ok(set.includes(`- [x] T019@cccccccc Active task${separator}`));
      assert.equal(historySuffixOf(set), suffix);
      assert.throws(() => setTaskState(parsed, 'T012@bbbbbbbb', 'todo'), /unknown task id/);

      const applied = applyStates(parsed, {
        'T019@cccccccc': 'done',
        'T012@bbbbbbbb': 'todo',
      });
      assert.deepEqual(applied.applied, ['T019@cccccccc']);
      assert.deepEqual(applied.unknown, ['T012@bbbbbbbb']);
      assert.equal(historySuffixOf(applied.content), suffix);
    }
  }

  assert.equal(parseTasks(HISTORY_FIXTURE).lines.join('\n'), HISTORY_FIXTURE);
});

test('history: an offset-zero archive gets an empty active board without becoming active', () => {
  const suffix = `## Lightweight Execution History\n${NOISY_ARCHIVED_ROWS}\n`;
  const parsed = parseTasks(suffix);

  assert.equal(parsed.history?.startOffset, 0);
  assert.equal(parsed.history?.suffix, suffix);
  assert.deepEqual(parsed.tasks, []);
  assert.deepEqual(readyTasks(parsed), []);
  assert.equal(nextTask(parsed), null);
  assert.deepEqual(parsed.warnings, []);

  const rendered = renderBoard(parsed);
  assert.ok(rendered.startsWith(BOARD_START));
  assert.equal(historySuffixOf(rendered), suffix);
  assert.deepEqual(parseTasks(rendered).tasks, []);
  assert.equal(boardIsStale(parseTasks(rendered)), false);

  const applied = applyStates(parsed, { 'T012@bbbbbbbb': 'todo' });
  assert.equal(applied.content, suffix);
  assert.deepEqual(applied.applied, []);
  assert.deepEqual(applied.unknown, ['T012@bbbbbbbb']);
});

test('history: glyph snapshots and diffs include only active tasks', () => {
  const parsed = parseTasks(HISTORY_FIXTURE);
  assert.deepEqual(glyphsOf(parsed), { 'T019@cccccccc': ' ' });
  assert.deepEqual(diffAgainstSnapshot(parsed, {
    'T019@cccccccc': ' ',
    'T012@bbbbbbbb': ' ',
  }).unexpectedDone, []);

  const changed = setTaskState(parsed, 'T019@cccccccc', 'done').content;
  const diff = diffAgainstSnapshot(parseTasks(changed), {
    'T019@cccccccc': ' ',
    'T012@bbbbbbbb': ' ',
  });
  assert.deepEqual(glyphsOf(parseTasks(changed)), { 'T019@cccccccc': 'x' });
  assert.deepEqual(diff.unexpectedDone, ['T019@cccccccc']);
});

test('board structure: malformed active fences quarantine semantics and guard every API', () => {
  const cases = [
    {
      name: 'unmatched end',
      lines: [BOARD_START, '- [ ] T020@dddddddd Inside-fence row', BOARD_END, BOARD_END],
      issue: /unmatched/,
    },
    {
      name: 'nested start',
      lines: [BOARD_START, '- [ ] T020@dddddddd Inside-fence row', BOARD_START, BOARD_END],
      issue: /nested/,
    },
    {
      name: 'duplicate active pair',
      lines: [
        BOARD_START,
        '- [ ] T020@dddddddd Inside-fence row',
        BOARD_END,
        BOARD_START,
        '- [ ] T021@eeeeeeee Second inside-fence row',
        BOARD_END,
      ],
      issue: /second active board pair/,
    },
    {
      name: 'unclosed start',
      lines: [BOARD_START, '- [ ] T020@dddddddd Inside-fence row'],
      issue: /unclosed/,
    },
  ];

  for (const fixture of cases) {
    const content = [
      '# Malformed board',
      '## User Story 1',
      '- [ ] T019@cccccccc Active row',
      ...fixture.lines,
      '## Lightweight Execution History',
      '- [x] T012@bbbbbbbb Archived row',
      '',
    ].join('\n');
    const parsed = parseTasks(content);

    assert.equal(parsed.board, null, fixture.name);
    assert.equal(parsed.history, null, fixture.name);
    assert.match(parsed.boardIssue || '', fixture.issue, fixture.name);
    assert.ok(parsed.warnings.includes(parsed.boardIssue || ''), fixture.name);
    assert.deepEqual(parsed.tasks, [], fixture.name);
    assert.equal(parsed.byId.size, 0, fixture.name);
    const expectedDiagnosticLines = parsed.lines.flatMap((text, index) => (
      /^- \[[^\]]*\]/.test(text) ? [{ line: index + 1, text }] : []
    ));
    assert.deepEqual(parsed.diagnosticTaskLines, expectedDiagnosticLines, fixture.name);
    assert.ok(parsed.diagnosticTaskLines.some(({ text }) => /Active row/.test(text)), fixture.name);
    assert.ok(parsed.diagnosticTaskLines.some(({ text }) => /Inside-fence row/.test(text)), fixture.name);
    assert.ok(parsed.diagnosticTaskLines.some(({ text }) => /Archived row/.test(text)), fixture.name);
    assert.equal(boardIsStale(parsed), true, fixture.name);
    const operations = [
      ['readyTasks', () => readyTasks(parsed)],
      ['nextTask', () => nextTask(parsed)],
      ['deriveDependencies', () => deriveDependencies(parsed)],
      ['glyphsOf', () => glyphsOf(parsed)],
      ['diffAgainstSnapshot', () => diffAgainstSnapshot(parsed, { 'T019@cccccccc': ' ' })],
      ['renderBoard', () => renderBoard(parsed)],
      ['setTaskState', () => setTaskState(parsed, 'T019@cccccccc', 'done')],
      ['applyStates', () => applyStates(parsed, { 'T019@cccccccc': 'done' })],
    ];
    for (const [name, operation] of operations) {
      assert.throws(
        operation,
        (error) => error instanceof Error && error.message === parsed.boardIssue,
        `${fixture.name}: ${name}`,
      );
    }
  }
});

test('snapshot round-trips through the filesystem shape', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-tasks-'));
  try {
    const snapFile = path.join(dir, 'task-state.json');
    const snap = { '.dude/specs/x/tasks.md': { glyphs: glyphsOf(parseTasks(FIXTURE)), updated_at: 'now' } };
    fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2));
    const read = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
    assert.equal(read['.dude/specs/x/tasks.md'].glyphs['T001@aaaaaaaa'], 'x');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
