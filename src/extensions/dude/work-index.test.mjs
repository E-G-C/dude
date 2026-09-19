// @ts-check
/**
 * T011 regressions for Overview's independent work index.
 *
 * Every filesystem fixture is disposable. These tests call the production
 * reader and its real child-process boundary; they do not duplicate lifecycle
 * parsing or write any repository board.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readNowProjection, readWorkIndex } from './lib/projection.mjs';

const BD_LIST = ['list', '--all', '--limit', '0', '--json'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @returns {string} */
function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-work-index-'));
}

/** @param {string} root @param {string} relative @param {string|Buffer} value */
function write(root, relative, value) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

/** @param {string} root @param {string} number @param {string} slug @param {'draft'|'resolved'} [status] */
function idea(root, number, slug, status = 'draft') {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  write(root, ideaPath, [
    '---',
    `title: ${slug.replaceAll('-', ' ')}`,
    `slug: ${slug}`,
    `status: ${status}`,
    'spec_path:',
    '---',
    '',
    '## Idea',
    '',
    `Intent for ${slug}.`,
    '',
  ].join('\n'));
  return { ideaPath, specPath: null };
}

/**
 * @param {string} root
 * @param {string} number
 * @param {string} slug
 * @param {string} [tasks]
 */
function feature(root, number, slug, tasks = '- [ ] T001@aaaaaaaa Open work.\n') {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  const directory = `.dude/specs/${number}-${slug}`;
  const specPath = `${directory}/spec.md`;
  const tasksPath = `${directory}/tasks.md`;
  write(root, specPath, `# ${slug}\n\nCanonical definition.\n`);
  write(root, tasksPath, `# Tasks\n\n## Phase 1 — Work\n\n${tasks}`);
  write(root, ideaPath, [
    '---',
    `title: ${slug.replaceAll('-', ' ')}`,
    `slug: ${slug}`,
    'status: defined',
    `spec_path: ${specPath}`,
    '---',
    '',
    '## Idea',
    '',
    `Intent for ${slug}.`,
    '',
  ].join('\n'));
  return { ideaPath, specPath, tasksPath };
}

function emptyBoard() {
  return { status: 0, stdout: '[]', stderr: '' };
}

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

let reviewEvidenceDirectory = null;

/**
 * Keep the first-round review reproductions inspectable without writing into
 * the workspace under test. CI supplies the parent; local focused runs use the
 * operating-system temporary directory.
 * @param {string} name
 * @param {string} testName
 * @param {Record<string, unknown>} proof
 */
function recordReviewEvidence(name, testName, proof) {
  if (!reviewEvidenceDirectory) {
    const parent = path.resolve(process.env.DUDE_CANVAS_ARTIFACTS_DIR ?? os.tmpdir());
    fs.mkdirSync(parent, { recursive: true });
    reviewEvidenceDirectory = fs.mkdtempSync(path.join(parent, 'dude-work-index-review-'));
  }
  const sourcePaths = [
    'src/extensions/dude/lib/projection.mjs',
    'src/skills/dude-lightweight-execution/backlog.mjs',
  ];
  const sources = Object.fromEntries(sourcePaths.map((relative) => {
    const absolute = path.join(ROOT, ...relative.split('/'));
    return [relative, sha256(fs.readFileSync(absolute))];
  }));
  const file = path.join(reviewEvidenceDirectory, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify({
    test: testName,
    generatedAt: new Date().toISOString(),
    sources,
    proof,
  }, null, 2)}\n`);
  return file;
}

/** @param {string} file @param {string} label @param {number} [timeout] */
async function waitForFile(file, label, timeout = 5_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Put a real `bd` child behind the production execFile boundary. Its second
 * list call publishes a marker and remains alive until this test releases it.
 */
function installSecondBoardBarrier() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-work-index-review-bd-'));
  const executable = path.join(directory, 'bd');
  const count = path.join(directory, 'count');
  const waiting = path.join(directory, 'second-waiting');
  const release = path.join(directory, 'release-second');
  fs.writeFileSync(executable, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    `const countPath = ${JSON.stringify(count)};`,
    `const waitingPath = ${JSON.stringify(waiting)};`,
    `const releasePath = ${JSON.stringify(release)};`,
    "const call = (fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0) + 1;",
    'fs.writeFileSync(countPath, String(call));',
    'if (call !== 2) {',
    '  process.stdout.write("[]");',
    '} else {',
    '  fs.writeFileSync(waitingPath, String(process.pid));',
    '  const deadline = Date.now() + 15000;',
    '  const timer = setInterval(() => {',
    '    if (fs.existsSync(releasePath)) {',
    '      clearInterval(timer);',
    '      process.stdout.write("[]");',
    '    } else if (Date.now() > deadline) {',
    '      clearInterval(timer);',
    '      process.stderr.write("barrier deadline");',
    '      process.exitCode = 2;',
    '    }',
    '  }, 10);',
    '}',
    '',
  ].join('\n'), { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ''}`;
  return {
    directory,
    waiting,
    async wait() { await waitForFile(waiting, 'second real bd list'); },
    release() { if (!fs.existsSync(release)) fs.writeFileSync(release, 'release'); },
    close() {
      if (!fs.existsSync(release)) fs.writeFileSync(release, 'release');
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** @param {string} root @param {{ideaPath:string}} record @param {string} prerequisite */
function declareDependency(root, record, prerequisite) {
  const absolute = path.join(root, ...record.ideaPath.split('/'));
  const content = fs.readFileSync(absolute, 'utf8');
  fs.writeFileSync(absolute, content.replace(
    '\n---\n\n## Idea',
    `\ndepends-on: ${prerequisite}\n---\n\n## Idea`,
  ));
}

/** @param {unknown} value */
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

/** @param {string} root */
function fileInventory(root) {
  /** @type {Array<{path:string,size:number}>} */
  const result = [];
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push({
        path: path.relative(root, absolute).split(path.sep).join('/'),
        size: fs.statSync(absolute).size,
      });
      else result.push({
        path: path.relative(root, absolute).split(path.sep).join('/'),
        size: -1,
      });
    }
  };
  visit(root);
  return result;
}

test('T011 work index publishes the exact flat DTO with complete 50-draft and 41-package discovery and dynamic canonical counts', {
  timeout: 30_000,
}, async () => {
  // Arrange
  const root = temporaryRoot();
  const calls = [];
  try {
    const drafts = Array.from({ length: 50 }, (_unused, index) => {
      const number = String(index + 1).padStart(3, '0');
      return idea(root, number, `draft-${number}`);
    });
    const features = Array.from({ length: 41 }, (_unused, index) => {
      const number = String(index + 51).padStart(3, '0');
      const tasks = index === 0
        ? [
          '- [ ] T001@aaaaaaaa Open.',
          '- [~] T002@bbbbbbbb In progress.',
          '- [!] T003@cccccccc Blocked.',
          '- [x] T004@dddddddd Done.',
          '',
        ].join('\n')
        : '- [ ] T001@aaaaaaaa Open work.\n';
      return feature(root, number, `feature-${number}`, tasks);
    });
    const resolved = idea(root, '092', 'resolved-record', 'resolved');
    const before = fileInventory(root);
    const runBd = (args) => {
      calls.push(args);
      return emptyBoard();
    };

    // Act
    const first = await readWorkIndex({ root }, { runBd });
    write(root, features[0].tasksPath, [
      '# Tasks',
      '',
      '- [x] T001@aaaaaaaa Done.',
      '- [x] T002@bbbbbbbb Done.',
      '- [x] T003@cccccccc Done.',
      '- [x] T004@dddddddd Done.',
      '- [ ] T005@eeeeeeee Newly recorded.',
      '',
    ].join('\n'));
    const second = await readWorkIndex({ root }, { runBd });

    // Assert
    assert.deepEqual(Object.keys(first).sort(), [
      'contexts', 'coverage', 'inventoryIdentity', 'items', 'readAt',
      'rootIdentity', 'sourceIdentity', 'sources', 'workspace', 'workspaceId',
    ]);
    assert.deepEqual(Object.keys(first.coverage).sort(), ['inventory', 'work']);
    assert.equal(first.workspace, 'populated');
    assert.equal(first.contexts.length, 92);
    assert.equal(first.items.length, 92);
    assert.deepEqual(first.contexts.map(({ ideaPath }) => ideaPath), [
      ...drafts.map(({ ideaPath }) => ideaPath),
      ...features.map(({ ideaPath }) => ideaPath),
      resolved.ideaPath,
    ]);
    assert.match(first.workspaceId, /^sha256:[a-f0-9]{64}$/);
    assert.match(first.rootIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.match(first.inventoryIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.match(first.sourceIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.match(first.readAt, /^\d{4}-\d\d-\d\dT/);
    assert.equal(first.coverage.inventory.state, 'current');
    assert.equal(first.coverage.work.state, 'current');

    const counted = first.items.find(({ ideaPath }) => ideaPath === features[0].ideaPath);
    assert.deepEqual(Object.keys(counted).sort(), [
      'availability', 'basis', 'group', 'ideaPath', 'lane',
      'sources', 'specPath', 'taskCounts',
    ]);
    assert.deepEqual(Object.keys(counted.availability).sort(), ['reason', 'state']);
    assert.deepEqual(Object.keys(counted.taskCounts).sort(), [
      'blocked', 'done', 'inProgress', 'open', 'total',
    ]);
    assert.deepEqual(counted.taskCounts, {
      total: 4, open: 1, inProgress: 1, blocked: 1, done: 1,
    });
    assert.equal(counted.lane, 'lightweight');
    assert.equal(counted.basis, 'canonical-lifecycle');
    assert.equal(counted.group, 'blocked');
    assert.equal(counted.availability.state, 'current');
    assert.deepEqual(
      counted.sources.map(({ path: sourcePath }) => sourcePath),
      [features[0].specPath, features[0].tasksPath],
    );

    const changed = second.items.find(({ ideaPath }) => ideaPath === features[0].ideaPath);
    assert.deepEqual(changed.taskCounts, {
      total: 5, open: 1, inProgress: 0, blocked: 0, done: 4,
    }, 'counts come from the current canonical parser output, not a frozen fixture total');
    assert.equal(changed.group, 'defined-awaiting-work');
    assert.equal(first.items.find(({ ideaPath }) => ideaPath === drafts[0].ideaPath).taskCounts, null);
    assert.equal(first.items.find(({ ideaPath }) => ideaPath === resolved.ideaPath).taskCounts, null);
    assert.equal(first.items.find(({ ideaPath }) => ideaPath === resolved.ideaPath).group, 'completed');
    assert.deepEqual(calls, [BD_LIST, BD_LIST, BD_LIST, BD_LIST]);
    assertDeepFrozen(first);
    assert.deepEqual(fileInventory(root), before.map((entry) => (
      entry.path === features[0].tasksPath
        ? { ...entry, size: fs.statSync(path.join(root, ...entry.path.split('/'))).size }
        : entry
    )), 'the reader creates no board, package, cache, or duplicate parser output');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 work index and selected detail reduce canonical visibility from the same captured task bytes', async () => {
  // Arrange
  const root = temporaryRoot();
  const calls = [];
  try {
    const planned = feature(root, '061', 'visibility-planned');
    const plannedSource = [
      '# Tasks',
      '',
      '## Phase 1: Source owned',
      '',
      '- [ ] T001@aaaaaaaa Real planned task',
      '',
      'SOURCE-OWNED-BODY-ONLY-IN-SELECTED-DETAIL',
      '',
      '```md',
      '- [~] T900@fenced01 Fenced in-progress lookalike',
      '```',
      '',
      '<!--',
      '- [!] T901@hidden00 Comment-hidden blocked lookalike',
      '-->',
      '',
    ].join('\n');
    write(root, planned.tasksPath, plannedSource);
    const completed = feature(root, '062', 'visibility-completed', [
      '- [x] T001@bbbbbbbb Real completed task',
      '```md',
      '- [ ] T900@fenced02 Hidden pending lookalike',
      '```',
      '',
    ].join('\n'));
    const active = feature(root, '063', 'visibility-active', [
      '- [~] T001@cccccccc Real in-progress task',
      '<!-- - [!] T900@hidden01 Hidden blocked lookalike -->',
      '',
    ].join('\n'));
    const blocked = feature(root, '064', 'visibility-blocked', [
      '- [ ] T001@dddddddd Real task with an explicit blocker',
      '    blocked-by: external-dependency: waiting for source fixture',
      '',
    ].join('\n'));
    const before = fileInventory(root);
    const runBd = (args) => {
      calls.push(args);
      return emptyBoard();
    };
    const naiveRawHeaders = [...plannedSource.matchAll(
      /^- \[(?: |~|!|x)\] T\d{3,}@[a-z0-9]{8} /gm,
    )].map(([line]) => line);

    // Act
    const index = await readWorkIndex({ root }, { runBd });
    const selected = await readNowProjection({ root, target: planned.ideaPath }, { runBd });

    // Assert
    assert.equal(naiveRawHeaders.length, 3,
      'negative control would reproduce the former raw-parser overcount on this exact fixture');
    const plannedRow = index.items.find(({ ideaPath }) => ideaPath === planned.ideaPath);
    assert.deepEqual(plannedRow.taskCounts, {
      total: 1,
      open: 1,
      inProgress: 0,
      blocked: 0,
      done: 0,
    });
    assert.equal(plannedRow.lane, 'definition');
    assert.equal(plannedRow.group, 'defined-awaiting-work');
    assert.equal(plannedRow.availability.state, 'current');
    assert.deepEqual(selected.tasks, plannedRow.taskCounts);
    assert.equal(selected.authority, 'definition');
    assert.equal(selected.stage, 'Defined');
    assert.equal(selected.next, null);
    assert.deepEqual(selected.taskDetails.items.map(({ taskKey }) => taskKey), ['T001@aaaaaaaa']);
    assert.equal(selected.taskDetails.items[0].instruction.text,
      plannedSource.slice(plannedSource.indexOf('- [ ] T001@aaaaaaaa')));
    assert.match(selected.taskDetails.items[0].instruction.text, /T900@fenced01/);
    assert.match(selected.taskDetails.items[0].instruction.text, /T901@hidden00/);
    const indexedTaskSource = plannedRow.sources.find(({ path: sourcePath }) => sourcePath === planned.tasksPath);
    assert.equal(indexedTaskSource.contentIdentity, selected.taskDetails.items[0].source.contentIdentity,
      'the index count and selected unit identify the same task-file bytes');
    assert.equal(JSON.stringify(index).includes('SOURCE-OWNED-BODY-ONLY-IN-SELECTED-DETAIL'), false,
      'the work index and inventory do not retain selected task bodies');
    assert.equal(Object.hasOwn(plannedRow, 'taskDetails'), false);
    assert.equal(index.contexts.some((context) => Object.hasOwn(context, 'taskDetails')), false);

    const completedRow = index.items.find(({ ideaPath }) => ideaPath === completed.ideaPath);
    assert.deepEqual(completedRow.taskCounts, {
      total: 1, open: 0, inProgress: 0, blocked: 0, done: 1,
    });
    assert.equal(completedRow.group, 'completed',
      'a hidden pending mark cannot defeat canonical package completion');
    const activeRow = index.items.find(({ ideaPath }) => ideaPath === active.ideaPath);
    assert.deepEqual(activeRow.taskCounts, {
      total: 1, open: 0, inProgress: 1, blocked: 0, done: 0,
    });
    assert.equal(activeRow.group, 'active',
      'canonical visible in-progress state determines active grouping');
    const blockedRow = index.items.find(({ ideaPath }) => ideaPath === blocked.ideaPath);
    assert.deepEqual(blockedRow.taskCounts, {
      total: 1, open: 1, inProgress: 0, blocked: 0, done: 0,
    });
    assert.equal(blockedRow.group, 'blocked',
      'a visible explicit blocked-by declaration supplies own-blocked classification');
    assert.deepEqual(calls, [BD_LIST, BD_LIST, BD_LIST, BD_LIST]);
    assert.deepEqual(fileInventory(root), before, 'both production readers remain read-only');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 populated Beads authority wins globally while failed or malformed authority never falls back to Markdown counts', async (t) => {
  // Arrange
  const root = temporaryRoot();
  try {
    const alpha = feature(root, '101', 'alpha', '- [x] T001@aaaaaaaa Markdown says done.\n');
    const beta = feature(root, '102', 'beta', '- [x] T001@bbbbbbbb Markdown also says done.\n');
    const draft = idea(root, '103', 'draft');
    const board = [
      {
        id: 'alpha-open',
        title: 'Alpha task',
        description: `spec: ${alpha.specPath}\nThe second line is not identity.`,
        status: 'open',
        issue_type: 'task',
      },
      {
        id: 'alpha-done',
        title: 'Alpha closed task',
        description: `spec: ${alpha.specPath}`,
        status: 'closed',
        issue_type: 'task',
      },
      {
        id: 'alpha-epic',
        title: 'Owning epic',
        description: `spec: ${alpha.specPath}`,
        status: 'in_progress',
        issue_type: 'epic',
      },
      {
        id: 'misleading',
        title: 'Second-line mention',
        description: `Not an exact mapping\nspec: ${beta.specPath}`,
        status: 'closed',
        issue_type: 'task',
      },
    ];
    const calls = [];

    // Act
    const tracked = await readWorkIndex({ root }, {
      runBd(args) {
        calls.push(args);
        return { status: 0, stdout: JSON.stringify(board), stderr: '' };
      },
    });

    // Assert
    const trackedAlpha = tracked.items.find(({ ideaPath }) => ideaPath === alpha.ideaPath);
    assert.equal(trackedAlpha.lane, 'tracked');
    assert.equal(trackedAlpha.basis, 'tracked-board');
    assert.deepEqual(trackedAlpha.taskCounts, {
      total: 2, open: 1, inProgress: 0, blocked: 0, done: 1,
    }, 'epics do not become executable counts');
    assert.equal(trackedAlpha.group, 'defined-awaiting-work');
    const absent = tracked.items.find(({ ideaPath }) => ideaPath === beta.ideaPath);
    assert.equal(absent.lane, 'tracked');
    assert.equal(absent.basis, 'not-established');
    assert.equal(absent.taskCounts, null, 'a populated board never authorizes Markdown fallback');
    assert.equal(absent.availability.state, 'unavailable');
    assert.match(absent.availability.reason, /No exact executable work/);
    assert.equal(tracked.items.find(({ ideaPath }) => ideaPath === draft.ideaPath).basis, 'idea-ledger');
    assert.deepEqual(calls, [BD_LIST, BD_LIST], 'the work index never invents a readiness query');

    for (const fixture of [
      {
        name: 'malformed JSON',
        result: { status: 0, stdout: '{not-json', stderr: '' },
      },
      {
        name: 'failed board command',
        result: { status: 2, stdout: '', stderr: 'fixture failure' },
      },
    ]) {
      await t.test(fixture.name, async () => {
        // Arrange
        const before = fileInventory(root);

        // Act
        const unavailable = await readWorkIndex({ root }, { runBd: () => fixture.result });

        // Assert
        for (const item of unavailable.items.filter(({ specPath }) => specPath)) {
          assert.equal(item.taskCounts, null);
          assert.equal(item.basis, 'not-established');
          assert.equal(item.availability.state, 'unavailable');
        }
        assert.equal(unavailable.workspace, 'populated');
        assert.equal(unavailable.rootIdentity, tracked.rootIdentity,
          'an internal authority failure retains the independently captured root identity');
        assert.equal(unavailable.inventoryIdentity, tracked.inventoryIdentity);
        assert.deepEqual(
          unavailable.contexts.map(({ ideaPath }) => ideaPath),
          tracked.contexts.map(({ ideaPath }) => ideaPath),
          'an internal authority failure retains the readable base inventory',
        );
        assert.equal(
          unavailable.items.find(({ ideaPath }) => ideaPath === draft.ideaPath).availability.state,
          'current',
          'a draft does not depend on Beads enrichment',
        );
        assert.equal(unavailable.coverage.inventory.state, 'current');
        assert.equal(unavailable.coverage.work.state, 'partial');
        assert.deepEqual(fileInventory(root), before);
      });
    }

    await t.test('internal Beads deadline qualifies work without invalidating a healthy base', async () => {
      // Arrange
      let calls = 0;
      let observedInternalAbort = false;

      // Act
      const timedOut = await readWorkIndex({ root }, {
        timeoutMs: 20,
        async runBd(_args, options) {
          calls += 1;
          const signal = /** @type {AbortSignal} */ (options.signal);
          await new Promise((resolve) => {
            if (signal.aborted) resolve(undefined);
            else signal.addEventListener('abort', () => resolve(undefined), { once: true });
          });
          observedInternalAbort = signal.aborted;
          return emptyBoard();
        },
      });

      // Assert
      assert.equal(calls, 1);
      assert.equal(observedInternalAbort, true,
        'the authority acquisition ended through the reader-owned deadline');
      assert.equal(timedOut.workspace, 'populated');
      assert.equal(timedOut.rootIdentity, tracked.rootIdentity);
      assert.equal(timedOut.inventoryIdentity, tracked.inventoryIdentity);
      assert.deepEqual(
        timedOut.contexts.map(({ ideaPath }) => ideaPath),
        tracked.contexts.map(({ ideaPath }) => ideaPath),
      );
      assert.equal(timedOut.coverage.inventory.state, 'current',
        'an internal Beads timeout alone does not stale a separately confirmed base');
      assert.equal(timedOut.coverage.work.state, 'partial');
      assert.ok(timedOut.coverage.work.diagnostics.some(
        ({ code }) => code === 'TRACKED_AUTHORITY_UNAVAILABLE',
      ));
      assert.ok(timedOut.items.filter(({ specPath }) => specPath).every(
        ({ taskCounts, availability }) => taskCounts === null && availability.state === 'unavailable',
      ));
      assert.equal(
        timedOut.items.find(({ ideaPath }) => ideaPath === draft.ideaPath).availability.state,
        'current',
      );
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 malformed package metadata and authority/source races withhold only unproved enrichment', async (t) => {
  await t.test('one malformed tasks file leaves the base and healthy package counts available', async () => {
    // Arrange
    const root = temporaryRoot();
    try {
      const healthy = feature(root, '201', 'healthy', '- [~] T001@aaaaaaaa Current.\n- [ ] T002@bbbbbbbb Later.\n');
      const malformed = feature(root, '202', 'malformed', '- [?] T001@cccccccc Invalid state.\n');
      const draft = idea(root, '203', 'still-findable');

      // Act
      const result = await readWorkIndex({ root }, { runBd: emptyBoard });

      // Assert
      assert.equal(result.contexts.length, 3);
      assert.deepEqual(result.items.find(({ ideaPath }) => ideaPath === healthy.ideaPath).taskCounts, {
        total: 2, open: 1, inProgress: 1, blocked: 0, done: 0,
      });
      const affected = result.items.find(({ ideaPath }) => ideaPath === malformed.ideaPath);
      assert.equal(affected.taskCounts, null);
      assert.equal(affected.availability.state, 'unavailable');
      assert.equal(result.items.find(({ ideaPath }) => ideaPath === draft.ideaPath).availability.state, 'current');
      assert.equal(result.coverage.inventory.state, 'current');
      assert.equal(result.coverage.work.state, 'partial');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('execution lane drift discards feature enrichment but retains idea inventory', async () => {
    // Arrange
    const root = temporaryRoot();
    try {
      const owned = feature(root, '211', 'lane-race');
      const draft = idea(root, '212', 'base-record');
      let call = 0;
      const board = [{
        id: 'late',
        title: 'Late tracked task',
        description: `spec: ${owned.specPath}`,
        status: 'open',
        issue_type: 'task',
      }];

      // Act
      const result = await readWorkIndex({ root }, {
        runBd: () => (++call === 1 ? emptyBoard() : {
          status: 0, stdout: JSON.stringify(board), stderr: '',
        }),
      });

      // Assert
      const featureItem = result.items.find(({ ideaPath }) => ideaPath === owned.ideaPath);
      assert.equal(featureItem.taskCounts, null);
      assert.equal(featureItem.availability.state, 'stale');
      assert.match(featureItem.availability.reason, /execution authority changed/);
      assert.equal(result.items.find(({ ideaPath }) => ideaPath === draft.ideaPath).availability.state, 'current');
      assert.equal(result.coverage.inventory.state, 'current');
      assert.ok(result.coverage.work.diagnostics.some(({ code }) => code === 'WORK_INDEX_AUTHORITY_CHANGED'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('a counted tasks race is scoped to that item and never publishes stale totals', async () => {
    // Arrange
    const root = temporaryRoot();
    try {
      const racing = feature(root, '221', 'source-race', '- [ ] T001@aaaaaaaa Before.\n');
      const stable = feature(root, '222', 'stable', '- [x] T001@bbbbbbbb Done.\n');
      let call = 0;

      // Act
      const result = await readWorkIndex({ root }, {
        runBd() {
          call += 1;
          if (call === 2) write(root, racing.tasksPath, '- [x] T001@aaaaaaaa After.\n');
          return emptyBoard();
        },
      });

      // Assert
      const affected = result.items.find(({ ideaPath }) => ideaPath === racing.ideaPath);
      assert.equal(affected.taskCounts, null);
      assert.equal(affected.availability.state, 'stale');
      assert.match(affected.availability.reason, /counted source changed/);
      assert.deepEqual(result.items.find(({ ideaPath }) => ideaPath === stable.ideaPath).taskCounts, {
        total: 1, open: 0, inProgress: 0, blocked: 0, done: 1,
      });
      assert.equal(result.coverage.inventory.state, 'current');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('an inventory race makes every old row stale instead of publishing a mixed base', async () => {
    // Arrange
    const root = temporaryRoot();
    try {
      feature(root, '231', 'inventory-race');
      let call = 0;

      // Act
      const result = await readWorkIndex({ root }, {
        runBd() {
          call += 1;
          if (call === 2) idea(root, '232', 'arrived-during-read');
          return emptyBoard();
        },
      });

      // Assert
      assert.equal(result.contexts.length, 1, 'the captured base is not silently mixed with the late ledger');
      assert.equal(result.coverage.inventory.state, 'stale');
      assert.ok(result.items.every(({ availability }) => availability.state === 'stale'));
      assert.ok(result.items.every(({ taskCounts }) => taskCounts === null));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('T011 work-index cancellation shares a decreasing deadline and resolves only after its exact child is reaped', {
  timeout: 15_000,
  skip: process.platform === 'win32',
}, async () => {
  // Arrange: first prove both acquisitions consume one operation deadline.
  const root = temporaryRoot();
  const timeouts = [];
  try {
    feature(root, '301', 'deadline');
    await readWorkIndex({ root }, {
      timeoutMs: 1_000,
      async runBd(_args, options) {
        timeouts.push(options.timeout);
        if (timeouts.length === 1) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return emptyBoard();
      },
    });
    assert.equal(timeouts.length, 2);
    assert.ok(timeouts[0] <= 1_000 && timeouts[0] > 0);
    assert.ok(timeouts[1] < timeouts[0] - 10,
      `second acquisition must receive the remaining deadline: ${JSON.stringify(timeouts)}`);

    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-work-index-bd-'));
    const executable = path.join(fixture, 'bd');
    const pidPath = path.join(fixture, 'pid');
    fs.writeFileSync(executable, [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
      'setInterval(() => {}, 1000);',
      '',
    ].join('\n'), { mode: 0o755 });
    const originalPath = process.env.PATH;
    process.env.PATH = `${fixture}${path.delimiter}${originalPath ?? ''}`;
    try {
      const controller = new AbortController();
      const pending = readWorkIndex({ root }, { signal: controller.signal, timeoutMs: 5_000 });
      await new Promise((resolve, reject) => {
        if (fs.existsSync(pidPath)) { resolve(undefined); return; }
        const watcher = fs.watch(fixture, () => {
          if (!fs.existsSync(pidPath)) return;
          watcher.close();
          resolve(undefined);
        });
        const timer = setTimeout(() => {
          watcher.close();
          reject(new Error('production bd child did not publish its PID'));
        }, 2_000);
        timer.unref();
      });
      const pid = Number(fs.readFileSync(pidPath, 'utf8'));

      // Act
      controller.abort();
      const cancelled = await pending;

      // Assert
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' },
        'the reader settles only after the exact production child closes');
      assert.equal(cancelled.coverage.inventory.state, 'stale',
        'an aborted read does not claim its captured inventory is a current publication');
      assert.equal(cancelled.coverage.work.state, 'partial');
      assert.equal(cancelled.workspace, 'populated');
      assert.match(cancelled.rootIdentity, /^sha256:[a-f0-9]{64}$/,
        'caller cancellation retains the identity of the root that was captured');
      assert.deepEqual(cancelled.contexts.map(({ ideaPath }) => ideaPath), [
        '.dude/ideas/301-deadline.md',
      ], 'caller cancellation qualifies publication without erasing captured context');
      assert.equal(cancelled.items[0].taskCounts, null);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 oversized package metadata is bounded before a harmful read and leaves manageable base discovery intact', async () => {
  // Arrange
  const root = temporaryRoot();
  const record = feature(root, '401', 'oversized');
  const absoluteSpec = path.join(root, ...record.specPath.split('/'));
  fs.truncateSync(absoluteSpec, (8 * 1024 * 1024) + 1);
  const before = fileInventory(root);
  const originalRead = fs.readFileSync;
  let oversizedReads = 0;
  fs.readFileSync = function observedRead(file, ...args) {
    if (path.resolve(String(file)) === path.resolve(absoluteSpec)) {
      oversizedReads += 1;
      assert.fail('oversized package source reached an unbounded read');
    }
    return originalRead.call(fs, file, ...args);
  };
  try {
    // Act
    const result = await readWorkIndex({ root }, { runBd: emptyBoard });

    // Assert
    assert.equal(oversizedReads, 0);
    assert.equal(result.contexts.length, 1);
    assert.equal(result.contexts[0].ideaPath, record.ideaPath);
    assert.equal(result.items[0].taskCounts, null);
    assert.equal(result.items[0].availability.state, 'unavailable');
    assert.equal(result.coverage.inventory.state, 'current');
    assert.equal(result.coverage.work.state, 'partial');
    assert.ok(result.coverage.work.diagnostics.some(({ code }) => code === 'WORK_INDEX_METADATA_UNAVAILABLE'));
    assert.deepEqual(fileInventory(root), before);
  } finally {
    fs.readFileSync = originalRead;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 work-index qualification: canonical precedence and direct-only dependency invalidation remain scoped', {
  timeout: 30_000,
  skip: process.platform === 'win32',
  concurrency: false,
}, async (context) => {
  // Arrange
  const testName = 'T011 work-index qualification: canonical precedence and direct-only dependency invalidation remain scoped';
  const root = temporaryRoot();
  const barrier = installSecondBoardBarrier();
  let pending;
  try {
    const foundation = feature(root, '451', 'foundation', '- [x] T001@a4514514 Foundation complete.\n');
    const middle = feature(root, '452', 'middle');
    const downstream = feature(root, '453', 'downstream');
    const completed = feature(root, '454', 'completed-dependent', '- [x] T001@a4544544 Dependent complete.\n');
    const ownBlocked = feature(root, '455', 'own-blocked-dependent', '- [!] T001@a4554554 Explicitly blocked here.\n');
    const resolved = idea(root, '456', 'resolved-dependent', 'resolved');
    const unrelated = feature(root, '457', 'unrelated', '- [~] T001@a4574574 Independent current work.\n');
    declareDependency(root, middle, 'foundation');
    declareDependency(root, downstream, 'middle');
    declareDependency(root, completed, 'foundation');
    declareDependency(root, ownBlocked, 'foundation');
    declareDependency(root, resolved, 'foundation');
    const records = { foundation, middle, downstream, completed, ownBlocked, resolved, unrelated };
    const baseline = await readWorkIndex({ root }, { runBd: emptyBoard });
    const baselineItems = Object.fromEntries(Object.entries(records).map(([name, record]) => [
      name,
      baseline.items.find(({ ideaPath }) => ideaPath === record.ideaPath),
    ]));
    assert.deepEqual(
      Object.fromEntries(Object.entries(baselineItems).map(([name, item]) => [name, item.group])),
      {
        foundation: 'completed',
        middle: 'next',
        downstream: 'blocked',
        completed: 'completed',
        ownBlocked: 'blocked',
        resolved: 'completed',
        unrelated: 'active',
      },
      'the fixture first exercises the canonical completed, own-blocked, direct dependency, and active precedence',
    );
    for (const [name, record] of Object.entries(records)) {
      const expected = record.specPath
        ? [record.specPath, `${path.posix.dirname(record.specPath)}/tasks.md`]
        : [];
      assert.deepEqual(
        baselineItems[name].sources.map(({ path: sourcePath }) => sourcePath),
        expected,
        `${name} publicly exposes only its own selected-package sources`,
      );
    }

    // Act
    pending = readWorkIndex({ root });
    await barrier.wait();
    write(root, foundation.tasksPath, [
      '# Tasks',
      '',
      '## Phase 1 — Work',
      '',
      '- [ ] T001@a4514514 Foundation reopened before publication.',
      '',
    ].join('\n'));
    barrier.release();
    const result = await pending;
    pending = null;
    const finalItems = Object.fromEntries(Object.entries(records).map(([name, record]) => [
      name,
      result.items.find(({ ideaPath }) => ideaPath === record.ideaPath),
    ]));
    const metrics = Object.fromEntries(Object.entries(finalItems).map(([name, item]) => [name, {
      group: item.group,
      availability: item.availability,
      taskCounts: item.taskCounts,
      sources: item.sources.map(({ path: sourcePath, contentIdentity }) => ({
        path: sourcePath, contentIdentity,
      })),
    }]));
    const proof = recordReviewEvidence('dependency-precedence-direct-only', testName, {
      race: 'foundation tasks changed from done to open after canonical grouping and before final publication',
      baseline: Object.fromEntries(Object.entries(baselineItems).map(([name, item]) => [name, {
        group: item.group,
        availability: item.availability,
        sources: item.sources,
      }])),
      final: { coverage: result.coverage, items: metrics },
    });
    context.diagnostic(`T011 qualification evidence: ${proof}`);

    // Assert
    assert.equal(finalItems.foundation.availability.state, 'stale');
    assert.equal(finalItems.middle.availability.state, 'stale',
      'the direct unfinished consumer withdraws its dependency-derived Next classification');
    assert.equal(finalItems.middle.group, null);
    assert.deepEqual(
      { group: finalItems.downstream.group, state: finalItems.downstream.availability.state },
      { group: 'blocked', state: 'current' },
      'a stale dependency-derived label on the middle row is not propagated as a false transitive source change',
    );
    assert.deepEqual(
      { group: finalItems.completed.group, state: finalItems.completed.availability.state },
      { group: 'completed', state: 'current' },
      'completed dependent work is not reopened solely by prerequisite drift',
    );
    assert.deepEqual(
      { group: finalItems.ownBlocked.group, state: finalItems.ownBlocked.availability.state },
      { group: 'blocked', state: 'current' },
      'a row with its own canonical blocker keeps that stronger classification',
    );
    assert.deepEqual(
      { group: finalItems.resolved.group, state: finalItems.resolved.availability.state },
      { group: 'completed', state: 'current' },
      'a resolved ledger keeps canonical completed precedence',
    );
    assert.deepEqual(
      { group: finalItems.unrelated.group, state: finalItems.unrelated.availability.state },
      { group: 'active', state: 'current' },
      'an unrelated healthy row keeps independently confirmed active work',
    );
    for (const name of Object.keys(records)) {
      assert.deepEqual(finalItems[name].sources, baselineItems[name].sources,
        `${name} item.sources stays read-only and does not expand to prerequisite package sources`);
    }
  } finally {
    barrier.release();
    if (pending) await pending.catch(() => {});
    barrier.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 N1 regression: removing an incoming dependency stales the captured Next prerequisite', {
  timeout: 30_000,
  skip: process.platform === 'win32',
  concurrency: false,
}, async (context) => {
  // Arrange
  const testName = 'T011 N1 regression: removing an incoming dependency stales the captured Next prerequisite';
  const root = temporaryRoot();
  const barrier = installSecondBoardBarrier();
  let pending;
  try {
    const a = feature(root, '511', 'n1-removal-a');
    const b = feature(root, '512', 'n1-removal-b');
    declareDependency(root, a, 'n1-removal-b');
    const aIdea = path.join(root, ...a.ideaPath.split('/'));
    const declaration = 'depends-on: n1-removal-b\n';
    const declaredIdea = fs.readFileSync(aIdea, 'utf8');
    assert.notEqual(declaredIdea.indexOf(declaration), -1);
    assert.equal(declaredIdea.indexOf(declaration), declaredIdea.lastIndexOf(declaration),
      'the authoritative fixture has exactly one declaration to remove');
    const removedIdea = declaredIdea.replace(declaration, '');
    const stableBytes = new Map([
      a.specPath, a.tasksPath, b.ideaPath, b.specPath, b.tasksPath,
    ].map((relative) => [
      relative,
      fs.readFileSync(path.join(root, ...relative.split('/'))),
    ]));
    const pathsBefore = fileInventory(root).map(({ path: relative }) => relative);
    const baseline = await readWorkIndex({ root }, { runBd: emptyBoard });
    const baselineA = baseline.items.find(({ ideaPath }) => ideaPath === a.ideaPath);
    const baselineB = baseline.items.find(({ ideaPath }) => ideaPath === b.ideaPath);
    assert.equal(baselineA.group, 'blocked');
    assert.equal(baselineB.group, 'next',
      'the real canonical model first proves B is Next because the open A declares it');
    assert.equal(baselineB.availability.state, 'current');
    assert.deepEqual(baselineB.taskCounts, {
      total: 1, open: 1, inProgress: 0, blocked: 0, done: 0,
    });
    assert.deepEqual(
      baselineB.sources.map(({ path: sourcePath }) => sourcePath),
      [b.specPath, b.tasksPath],
      'B exposes only its own selected-package sources',
    );
    const lifecycleIdentity = baseline.contexts.map(({
      ideaPath, title, slug, status, specPath,
    }) => ({ ideaPath, title, slug, status, specPath }));

    // Act
    pending = readWorkIndex({ root });
    await barrier.wait();
    write(root, a.ideaPath, removedIdea);
    barrier.release();
    const raced = await pending;
    pending = null;
    const fresh = await readWorkIndex({ root }, { runBd: emptyBoard });

    // Assert
    const racedB = raced.items.find(({ ideaPath }) => ideaPath === b.ideaPath);
    assert.deepEqual(
      {
        lane: racedB.lane,
        basis: racedB.basis,
        group: racedB.group,
        taskCounts: racedB.taskCounts,
        state: racedB.availability.state,
      },
      {
        lane: baselineB.lane,
        basis: baselineB.basis,
        group: null,
        taskCounts: null,
        state: 'stale',
      },
      'the captured Next row withholds its classification and counts',
    );
    assert.match(racedB.availability.reason, /counted source changed/);
    assert.deepEqual(racedB.sources, baselineB.sources,
      'qualification retains B own-package source identities');

    const freshA = fresh.items.find(({ ideaPath }) => ideaPath === a.ideaPath);
    const freshB = fresh.items.find(({ ideaPath }) => ideaPath === b.ideaPath);
    assert.equal(freshA.group, 'defined-awaiting-work');
    assert.deepEqual(
      {
        group: freshB.group,
        taskCounts: freshB.taskCounts,
        state: freshB.availability.state,
      },
      {
        group: 'defined-awaiting-work',
        taskCounts: baselineB.taskCounts,
        state: 'current',
      },
      'a fresh production read proves B left Next after the declaration was removed',
    );
    assert.deepEqual(freshB.sources, baselineB.sources);

    assert.equal(fs.readFileSync(aIdea, 'utf8'), removedIdea,
      'the mutation removes only A authoritative dependency declaration');
    for (const [relative, bytes] of stableBytes) {
      assert.deepEqual(fs.readFileSync(path.join(root, ...relative.split('/'))), bytes,
        `${relative} bytes remain unchanged`);
    }
    assert.deepEqual(fileInventory(root).map(({ path: relative }) => relative), pathsBefore);
    assert.deepEqual(
      [baseline, raced, fresh].map(({ inventoryIdentity }) => inventoryIdentity),
      [baseline.inventoryIdentity, baseline.inventoryIdentity, baseline.inventoryIdentity],
      'dependency metadata does not alter lifecycle inventory identity',
    );
    assert.deepEqual(
      [baseline, raced, fresh].map(({ coverage }) => coverage.inventory.packages),
      [2, 2, 2],
    );
    for (const result of [raced, fresh]) {
      assert.deepEqual(result.contexts.map(({
        ideaPath, title, slug, status, specPath,
      }) => ({ ideaPath, title, slug, status, specPath })), lifecycleIdentity,
      'paths, titles, slugs, statuses, and exact owners stay unchanged');
    }

    const proof = recordReviewEvidence('n1-incoming-dependency-removal', testName, {
      mutation: {
        path: a.ideaPath,
        before: sha256(declaredIdea),
        after: sha256(removedIdea),
      },
      inventoryIdentity: baseline.inventoryIdentity,
      prerequisite: {
        baseline: { group: baselineB.group, state: baselineB.availability.state },
        raced: {
          group: racedB.group,
          taskCounts: racedB.taskCounts,
          state: racedB.availability.state,
          sources: racedB.sources.map(({ path: sourcePath }) => sourcePath),
        },
        fresh: { group: freshB.group, state: freshB.availability.state },
      },
    });
    context.diagnostic(`T011 N1 evidence: ${proof}`);
  } finally {
    barrier.release();
    if (pending) await pending.catch(() => {});
    barrier.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 N1 regression: adding an incoming dependency stales the captured defined-awaiting-work prerequisite', {
  timeout: 30_000,
  skip: process.platform === 'win32',
  concurrency: false,
}, async (context) => {
  // Arrange
  const testName = 'T011 N1 regression: adding an incoming dependency stales the captured defined-awaiting-work prerequisite';
  const root = temporaryRoot();
  const barrier = installSecondBoardBarrier();
  let pending;
  try {
    const a = feature(root, '521', 'n1-addition-a');
    const b = feature(root, '522', 'n1-addition-b');
    const aIdea = path.join(root, ...a.ideaPath.split('/'));
    const originalIdea = fs.readFileSync(aIdea, 'utf8');
    const declaredIdea = originalIdea.replace(
      '\n---\n\n## Idea',
      '\ndepends-on: n1-addition-b\n---\n\n## Idea',
    );
    assert.notEqual(declaredIdea, originalIdea);
    const stableBytes = new Map([
      a.specPath, a.tasksPath, b.ideaPath, b.specPath, b.tasksPath,
    ].map((relative) => [
      relative,
      fs.readFileSync(path.join(root, ...relative.split('/'))),
    ]));
    const pathsBefore = fileInventory(root).map(({ path: relative }) => relative);
    const baseline = await readWorkIndex({ root }, { runBd: emptyBoard });
    const baselineA = baseline.items.find(({ ideaPath }) => ideaPath === a.ideaPath);
    const baselineB = baseline.items.find(({ ideaPath }) => ideaPath === b.ideaPath);
    assert.equal(baselineA.group, 'defined-awaiting-work');
    assert.equal(baselineB.group, 'defined-awaiting-work',
      'the real canonical model first proves B is in the unprioritized open pool');
    assert.equal(baselineB.availability.state, 'current');
    assert.deepEqual(baselineB.taskCounts, {
      total: 1, open: 1, inProgress: 0, blocked: 0, done: 0,
    });
    assert.deepEqual(
      baselineB.sources.map(({ path: sourcePath }) => sourcePath),
      [b.specPath, b.tasksPath],
      'B exposes only its own selected-package sources',
    );
    const lifecycleIdentity = baseline.contexts.map(({
      ideaPath, title, slug, status, specPath,
    }) => ({ ideaPath, title, slug, status, specPath }));

    // Act
    pending = readWorkIndex({ root });
    await barrier.wait();
    declareDependency(root, a, 'n1-addition-b');
    barrier.release();
    const raced = await pending;
    pending = null;
    const fresh = await readWorkIndex({ root }, { runBd: emptyBoard });

    // Assert
    const racedB = raced.items.find(({ ideaPath }) => ideaPath === b.ideaPath);
    assert.deepEqual(
      {
        lane: racedB.lane,
        basis: racedB.basis,
        group: racedB.group,
        taskCounts: racedB.taskCounts,
        state: racedB.availability.state,
      },
      {
        lane: baselineB.lane,
        basis: baselineB.basis,
        group: null,
        taskCounts: null,
        state: 'stale',
      },
      'the captured defined-awaiting-work row withholds its classification and counts',
    );
    assert.match(racedB.availability.reason, /counted source changed/);
    assert.deepEqual(racedB.sources, baselineB.sources,
      'qualification retains B own-package source identities');

    const freshA = fresh.items.find(({ ideaPath }) => ideaPath === a.ideaPath);
    const freshB = fresh.items.find(({ ideaPath }) => ideaPath === b.ideaPath);
    assert.equal(freshA.group, 'blocked');
    assert.deepEqual(
      {
        group: freshB.group,
        taskCounts: freshB.taskCounts,
        state: freshB.availability.state,
      },
      {
        group: 'next',
        taskCounts: baselineB.taskCounts,
        state: 'current',
      },
      'a fresh production read proves B became Next after the declaration was added',
    );
    assert.deepEqual(freshB.sources, baselineB.sources);

    assert.equal(fs.readFileSync(aIdea, 'utf8'), declaredIdea,
      'the mutation adds only A authoritative dependency declaration');
    for (const [relative, bytes] of stableBytes) {
      assert.deepEqual(fs.readFileSync(path.join(root, ...relative.split('/'))), bytes,
        `${relative} bytes remain unchanged`);
    }
    assert.deepEqual(fileInventory(root).map(({ path: relative }) => relative), pathsBefore);
    assert.deepEqual(
      [baseline, raced, fresh].map(({ inventoryIdentity }) => inventoryIdentity),
      [baseline.inventoryIdentity, baseline.inventoryIdentity, baseline.inventoryIdentity],
      'dependency metadata does not alter lifecycle inventory identity',
    );
    assert.deepEqual(
      [baseline, raced, fresh].map(({ coverage }) => coverage.inventory.packages),
      [2, 2, 2],
    );
    for (const result of [raced, fresh]) {
      assert.deepEqual(result.contexts.map(({
        ideaPath, title, slug, status, specPath,
      }) => ({ ideaPath, title, slug, status, specPath })), lifecycleIdentity,
      'paths, titles, slugs, statuses, and exact owners stay unchanged');
    }

    const proof = recordReviewEvidence('n1-incoming-dependency-addition', testName, {
      mutation: {
        path: a.ideaPath,
        before: sha256(originalIdea),
        after: sha256(declaredIdea),
      },
      inventoryIdentity: baseline.inventoryIdentity,
      prerequisite: {
        baseline: { group: baselineB.group, state: baselineB.availability.state },
        raced: {
          group: racedB.group,
          taskCounts: racedB.taskCounts,
          state: racedB.availability.state,
          sources: racedB.sources.map(({ path: sourcePath }) => sourcePath),
        },
        fresh: { group: freshB.group, state: freshB.availability.state },
      },
    });
    context.diagnostic(`T011 N1 evidence: ${proof}`);
  } finally {
    barrier.release();
    if (pending) await pending.catch(() => {});
    barrier.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 review regression: dependency-derived groups become stale when a prerequisite source changes', {
  timeout: 30_000,
  skip: process.platform === 'win32',
  concurrency: false,
}, async (context) => {
  // Arrange
  const testName = 'T011 review regression: dependency-derived groups become stale when a prerequisite source changes';
  const root = temporaryRoot();
  const barrier = installSecondBoardBarrier();
  let pending;
  try {
    const alpha = feature(root, '501', 'alpha');
    const beta = feature(root, '502', 'beta', '- [x] T001@bbbbbbbb Prerequisite complete.\n');
    const independent = feature(root, '503', 'independent', '- [~] T001@cccccccc Independent current work.\n');
    declareDependency(root, alpha, 'beta');
    const baseline = await readWorkIndex({ root }, { runBd: emptyBoard });
    const baselineAlpha = baseline.items.find(({ ideaPath }) => ideaPath === alpha.ideaPath);
    assert.equal(baselineAlpha.group, 'next',
      'the real canonical lifecycle model must first prove this fixture is dependency-derived Next');
    assert.equal(baselineAlpha.availability.state, 'current');

    // Act
    pending = readWorkIndex({ root });
    await barrier.wait();
    write(root, beta.tasksPath, [
      '# Tasks',
      '',
      '## Phase 1 — Work',
      '',
      '- [ ] T001@bbbbbbbb Prerequisite reopened before publication.',
      '',
    ].join('\n'));
    barrier.release();
    const result = await pending;
    pending = null;

    const actual = Object.fromEntries([alpha, beta, independent].map((record) => {
      const item = result.items.find(({ ideaPath }) => ideaPath === record.ideaPath);
      return [record.ideaPath, {
        group: item.group,
        availability: item.availability,
        taskCounts: item.taskCounts,
        sources: item.sources.map((source) => ({
          path: source.path,
          contentIdentity: source.contentIdentity,
        })),
      }];
    }));
    const proof = recordReviewEvidence('dependency-group-freshness', testName, {
      race: 'beta tasks changed from done to open while the second real bd list child was waiting',
      baseline: {
        alpha: {
          group: baselineAlpha.group,
          availability: baselineAlpha.availability,
          taskCounts: baselineAlpha.taskCounts,
        },
      },
      final: {
        coverage: result.coverage,
        items: actual,
      },
    });
    context.diagnostic(`T011 review evidence: ${proof}`);

    // Assert
    const finalBeta = result.items.find(({ ideaPath }) => ideaPath === beta.ideaPath);
    assert.equal(finalBeta.availability.state, 'stale',
      'the directly changed prerequisite is correctly detected as stale');
    const finalIndependent = result.items.find(({ ideaPath }) => ideaPath === independent.ideaPath);
    assert.deepEqual(finalIndependent.taskCounts, {
      total: 1, open: 0, inProgress: 1, blocked: 0, done: 0,
    });
    assert.equal(finalIndependent.group, 'active');
    assert.equal(finalIndependent.availability.state, 'current',
      'an unrelated package keeps independently verified counts and status');

    const finalAlpha = result.items.find(({ ideaPath }) => ideaPath === alpha.ideaPath);
    const dependencyClassificationIsQualified = finalAlpha.availability.state !== 'current'
      || finalAlpha.group !== 'next';
    assert.equal(dependencyClassificationIsQualified, true,
      'alpha cannot remain current Next after the prerequisite bytes that derived Next changed');
  } finally {
    barrier.release();
    if (pending) await pending.catch(() => {});
    barrier.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 review regression: missing final root cannot remain a confirmed blank inventory', {
  timeout: 30_000,
  skip: process.platform === 'win32',
  concurrency: false,
}, async (context) => {
  // Arrange
  const testName = 'T011 review regression: missing final root cannot remain a confirmed blank inventory';
  const root = temporaryRoot();
  const moved = `${root}-captured`;
  const barrier = installSecondBoardBarrier();
  let pending;
  try {
    const baseline = await readWorkIndex({ root }, { runBd: emptyBoard });
    assert.equal(baseline.workspace, 'blank');
    assert.equal(baseline.contexts.length, 0);
    assert.equal(baseline.coverage.inventory.state, 'current',
      'the unchanged control establishes a genuinely blank readable root');

    // Act
    pending = readWorkIndex({ root });
    await barrier.wait();
    fs.renameSync(root, moved);
    barrier.release();
    const result = await pending;
    pending = null;

    const proof = recordReviewEvidence('final-root-inventory', testName, {
      race: 'the owned blank root was renamed only after the second real bd list child began waiting',
      baseline: {
        workspace: baseline.workspace,
        rootIdentity: baseline.rootIdentity,
        inventoryIdentity: baseline.inventoryIdentity,
        contexts: baseline.contexts,
        coverage: baseline.coverage,
      },
      final: result,
      finalPathExists: fs.existsSync(root),
      capturedRootExists: fs.existsSync(moved),
    });
    context.diagnostic(`T011 review evidence: ${proof}`);

    // Assert
    assert.equal(result.rootIdentity, baseline.rootIdentity,
      'loss of final coverage retains the identity of the root actually captured');
    assert.equal(result.workspace, 'blank',
      'the captured workspace classification may remain inspectable when its coverage is qualified');
    assert.deepEqual(result.contexts, []);
    assert.equal(result.coverage.work.state, 'partial');
    assert.ok(['stale', 'unavailable'].includes(result.coverage.inventory.state),
      'a missing final root is lost inventory coverage, not proof of a currently blank workspace');
  } finally {
    barrier.release();
    if (pending) await pending.catch(() => {});
    barrier.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(moved, { recursive: true, force: true });
  }
});

test('T011 review regression: aggregate package budget blocks every preliminary package content read', {
  timeout: 30_000,
  concurrency: false,
}, async (context) => {
  // Arrange
  const testName = 'T011 review regression: aggregate package budget blocks every preliminary package content read';
  const root = temporaryRoot();
  const records = Array.from({ length: 5 }, (_unused, index) => (
    feature(root, String(601 + index), `aggregate-${index + 1}`)
  ));
  const packagePaths = new Map();
  for (const record of records) {
    const taskPath = path.join(root, ...record.tasksPath.split('/'));
    fs.truncateSync(taskPath, 7 * 1024 * 1024);
    for (const relative of [record.specPath, record.tasksPath]) {
      const absolute = path.resolve(path.join(root, ...relative.split('/')));
      packagePaths.set(absolute, {
        path: relative,
        size: fs.lstatSync(absolute).size,
      });
    }
  }
  const aggregateBytes = [...packagePaths.values()].reduce((sum, entry) => sum + entry.size, 0);
  assert.ok(aggregateBytes > 32 * 1024 * 1024);
  assert.ok([...packagePaths.values()].every(({ size }) => size <= 8 * 1024 * 1024),
    'every sparse fixture file remains beneath the existing individual cap');

  const originalRead = fs.readFileSync;
  const preliminaryReads = [];
  let result;
  fs.readFileSync = function observedRead(file, ...args) {
    const observed = packagePaths.get(path.resolve(String(file)));
    if (observed) preliminaryReads.push(observed);
    return originalRead.call(fs, file, ...args);
  };
  try {
    // Act
    result = await readWorkIndex({ root }, { runBd: emptyBoard });
  } finally {
    fs.readFileSync = originalRead;
  }

  try {
    const proof = recordReviewEvidence('aggregate-preliminary-reads', testName, {
      aggregateBytes,
      aggregateLimitBytes: 32 * 1024 * 1024,
      individualLimitBytes: 8 * 1024 * 1024,
      sparsePackages: [...packagePaths.values()],
      preliminaryReads,
      result: {
        workspace: result.workspace,
        contexts: result.contexts.map(({ ideaPath, specPath, coverage }) => ({
          ideaPath, specPath, coverage,
        })),
        items: result.items.map(({ ideaPath, group, taskCounts, availability }) => ({
          ideaPath, group, taskCounts, availability,
        })),
        coverage: result.coverage,
      },
    });
    context.diagnostic(`T011 review evidence: ${proof}`);

    // Assert
    assert.equal(result.contexts.length, records.length,
      'bounded aggregate failure preserves manageable idea discovery');
    assert.equal(result.coverage.inventory.state, 'current');
    assert.equal(result.coverage.work.state, 'partial');
    assert.ok(result.coverage.work.diagnostics.some(({ code }) => code === 'WORK_INDEX_METADATA_UNAVAILABLE'));
    assert.ok(result.items.every(({ taskCounts, availability }) => (
      taskCounts === null && availability.state === 'unavailable'
    )), 'unread aggregate progress stays scoped unknown instead of false zero');
    assert.deepEqual(preliminaryReads, [],
      'once stat preflight proves the 32 MiB aggregate is exceeded, no package content may enter a preliminary read');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
