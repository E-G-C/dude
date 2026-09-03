// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkProjectionFreshness,
  initialProjectionFreshness,
  readNowProjection,
  refreshNowProjection,
} from './lib/projection.mjs';

/** @returns {string} */
function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-projection-'));
}

/** @param {string} root @param {string} relativePath @param {string | Buffer} content */
function write(root, relativePath, content) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

let bdFixtureSequence = 0;
const BD_LIST_CALL = ['list', '--all', '--limit', '0', '--json'];
const BD_READY_CALL = ['ready', '--json'];

/** @param {{ list?: unknown, ready?: unknown }} responses */
function commandResponses({ list, ready }) {
  return {
    ...(list === undefined ? {} : { [BD_LIST_CALL.join(' ')]: { output: list } }),
    ...(ready === undefined ? {} : { [BD_READY_CALL.join(' ')]: { output: ready } }),
  };
}

/** @template T */
function deferred() {
  /** @type {(value:T) => void} */
  let resolve;
  /** @type {(reason?:unknown) => void} */
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Install a fixture executable at the same command boundary production uses.
 * The callback changes only command lookup; projection still spawns `bd` itself.
 * @param {string} root
 * @param {string | object[]} [output]
 * @param {number} [exitCode]
 * @param {Record<string, {
 *   output?: unknown,
 *   exitCode?: number,
 *   sequence?: Array<{output?: unknown, exitCode?: number}>,
 * }>} [responses]
 */
function installBdCommand(root, output = [], exitCode = 0, responses = {}) {
  bdFixtureSequence += 1;
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `dude-projection-bd-${bdFixtureSequence}-`));
  const executable = path.join(fixtureRoot, process.platform === 'win32' ? 'bd.cmd' : 'bd');
  const callsPath = path.join(fixtureRoot, 'calls.json');
  const fixtureScript = [
    "const fs = require('node:fs');",
    `const callsPath = ${JSON.stringify(callsPath)};`,
    'const args = process.argv.slice(2);',
    'const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, "utf8")) : [];',
    'calls.push(args);',
    'fs.writeFileSync(callsPath, JSON.stringify(calls));',
    `const responses = ${JSON.stringify(responses)};`,
    'const configured = responses[args.join(" ")];',
    'const matchingCalls = calls.filter((call) => JSON.stringify(call) === JSON.stringify(args)).length - 1;',
    'const reply = Array.isArray(configured?.sequence)',
    '  ? configured.sequence[Math.min(matchingCalls, configured.sequence.length - 1)]',
    '  : configured;',
    `const fallback = { output: ${JSON.stringify(output)}, exitCode: ${JSON.stringify(exitCode)} };`,
    'const response = reply ?? fallback;',
    'const stdout = typeof response.output === "string" ? response.output : JSON.stringify(response.output);',
    'process.stdout.write(stdout);',
    'process.exit(response.exitCode ?? 0);',
    '',
  ].join('\n');
  if (process.platform === 'win32') {
    fs.writeFileSync(
      executable,
      `@${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(fixtureRoot, 'bd.cjs'))} %*\r\n`,
    );
    fs.writeFileSync(path.join(fixtureRoot, 'bd.cjs'), fixtureScript);
  } else {
    fs.writeFileSync(executable, `#!/usr/bin/env node\n${fixtureScript}`);
    fs.chmodSync(executable, 0o755);
  }

  /** @type {string[] | null} */
  let calls = null;
  /** @type {string[][] | null} */
  let callSequence = null;
  return {
    get calls() {
      return calls;
    },
    get callSequence() {
      return callSequence;
    },
    /** @template T @param {() => T | Promise<T>} action @returns {Promise<Awaited<T>>} */
    async run(action) {
      const originalPath = process.env.PATH;
      process.env.PATH = `${path.dirname(executable)}${path.delimiter}${originalPath ?? ''}`;
      try {
        return await action();
      } finally {
        if (fs.existsSync(callsPath)) {
          callSequence = JSON.parse(fs.readFileSync(callsPath, 'utf8'));
          calls = callSequence.at(-1) ?? null;
        }
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  };
}

/**
 * @param {string} root
 * @param {string} number
 * @param {string} slug
 * @param {{ tasks?: string, questions?: string }} [options]
 */
function define(root, number, slug, options = {}) {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  const specPath = `.dude/specs/${number}-${slug}/spec.md`;
  write(root, specPath, `# ${slug}\n`);
  write(root, `${path.posix.dirname(specPath)}/tasks.md`, options.tasks ?? '- [ ] T001@aaaaaaaa First task\n');
  write(
    root,
    ideaPath,
    [
      '---',
      `title: ${slug}`,
      `slug: ${slug}`,
      'status: defined',
      `spec_path: ${specPath}`,
      '---',
      '',
      '## Idea',
      '',
      `${slug} body.`,
      '',
      '## Open Questions',
      '',
      options.questions ?? 'None.',
      '',
    ].join('\n'),
  );
  return { ideaPath, specPath, tasksPath: `${path.posix.dirname(specPath)}/tasks.md` };
}

/** @param {string} root @param {string} number @param {string} slug */
function draft(root, number, slug) {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  write(
    root,
    ideaPath,
    `---\ntitle: ${slug}\nslug: ${slug}\nstatus: draft\nspec_path:\n---\n\n## Idea\n\n${slug} body.\n\n## Open Questions\n\nNone.\n`,
  );
  return ideaPath;
}

/** @param {string} root @param {string} number @param {string} slug */
function resolved(root, number, slug) {
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  write(
    root,
    ideaPath,
    `---\ntitle: ${slug}\nslug: ${slug}\nstatus: resolved\nspec_path:\n---\n\n## Idea\n\n${slug} resolved.\n\n## Open Questions\n\nNone.\n`,
  );
  return ideaPath;
}

/** @param {string} root */
function contentSnapshot(root) {
  /** @type {Array<[string, string, string?]>} */
  const result = [];
  /** @param {string} directory @param {string} prefix */
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push([relativePath, 'directory']);
        visit(absolutePath, relativePath);
      } else if (entry.isSymbolicLink()) {
        result.push([relativePath, 'symlink', fs.readlinkSync(absolutePath)]);
      } else {
        result.push([relativePath, 'file', fs.readFileSync(absolutePath, 'utf8')]);
      }
    }
  }
  visit(root, '');
  return result;
}

/** @param {any} projection */
function assertComplete(projection) {
  assert.equal(projection.complete, true);
  assert.match(projection.readAt, /^\d{4}-\d{2}-\d{2}T.+Z$/);
  assert.equal(projection.attemptedAt, null);
  assert.ok(Array.isArray(projection.sources));
  assert.ok(projection.sources.length > 0);
  assert.ok(projection.sources.every((source) => (
    source.kind === 'tracked'
      ? /^sha256:[a-f0-9]{64}$/.test(source.contentIdentity)
      : /^sha256:[a-f0-9]{64}$/.test(source.contentIdentity)
  )));
}

/** @param {any} projection */
function assertSafeReadAction(projection) {
  assert.deepEqual(projection.action, {
    kind: 'refresh',
    label: 'Refresh from repository',
    method: 'POST',
    path: '/api/refresh',
  });
}

/**
 * Mutate fixture state only after selection and the selected-content read, at
 * the first selected-source revalidation read. This deterministically models an
 * external edit during one asynchronous projection without timers or sleeps.
 * @template T
 * @param {string} root
 * @param {string} selectedIdeaPath
 * @param {() => void} mutate
 * @param {() => T | Promise<T>} operation
 * @returns {Promise<Awaited<T>>}
 */
async function mutateBeforeFinalVerification(root, selectedIdeaPath, mutate, operation) {
  const originalReadFileSync = fs.readFileSync;
  const selectedAbsolute = path.resolve(root, selectedIdeaPath);
  let selectedReads = 0;
  let mutated = false;
  fs.readFileSync = function observedRead(file, ...args) {
    if (path.resolve(String(file)) === selectedAbsolute) {
      selectedReads += 1;
      if (selectedReads === 3) {
        mutate();
        mutated = true;
      }
    }
    return originalReadFileSync.call(fs, file, ...args);
  };
  try {
    const result = await operation();
    assert.equal(mutated, true, 'fixture mutation must occur at selected-source final verification');
    return result;
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
}

test('exact target wins while omitted target makes no mtime, chronology, file, task, or log-recency inference', async () => {
  const root = temporaryRoot();
  const singleRoot = temporaryRoot();
  const emptyRoot = temporaryRoot();
  try {
    // Arrange
    const alpha = define(root, '999', 'alpha', { tasks: '- [ ] T900@aaaaaaaa Later-looking task\n' });
    const beta = define(root, '001', 'beta', { tasks: '- [ ] T001@bbbbbbbb Earlier-looking task\n' });
    const old = new Date('2001-01-01T00:00:00Z');
    const recent = new Date('2030-01-01T00:00:00Z');
    fs.utimesSync(path.join(root, alpha.ideaPath), recent, recent);
    fs.utimesSync(path.join(root, beta.ideaPath), old, old);
    write(
      root,
      alpha.ideaPath,
      `${fs.readFileSync(path.join(root, alpha.ideaPath), 'utf8')}\n## Coordinator Log\n\n- 2030-01-01 - Most recent-looking event\n`,
    );
    fs.utimesSync(path.join(root, alpha.ideaPath), recent, recent);
    const lone = draft(singleRoot, '009', 'lone');
    const bd = installBdCommand(root);

    // Act
    const [exactSlug, exactPath, ambiguous, single, empty] = await bd.run(async () => [
      await readNowProjection({ root, target: 'beta' }),
      await readNowProjection({ root, target: alpha.ideaPath }),
      await readNowProjection({ root }),
      await readNowProjection({ root: singleRoot }),
      await readNowProjection({ root: emptyRoot }),
    ]);

    // Assert
    assert.equal(exactSlug.selected?.ideaPath, beta.ideaPath);
    assert.equal(exactPath.selected?.ideaPath, alpha.ideaPath);
    assert.equal(ambiguous.status, 'choose');
    assert.deepEqual(new Set(ambiguous.choices?.map((choice) => choice.ideaPath)), new Set([
      alpha.ideaPath,
      beta.ideaPath,
    ]), 'multiple candidates remain choices regardless of mtime, lifecycle number, filename, task, or log order');
    assertComplete(ambiguous);
    assert.equal(single.status, 'ok');
    assert.equal(single.selected?.ideaPath, lone);
    assert.equal(single.selected?.explicit, false);
    assert.equal(single.authority, 'definition');
    assert.equal(single.stage, 'Idea');
    assert.equal(single.nextReason, 'This feature is still an idea.');
    assert.equal(single.tasks, null);
    assert.equal(empty.status, 'choose');
    assert.deepEqual(empty.choices, []);
    assertSafeReadAction(empty);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(singleRoot, { recursive: true, force: true });
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test('an explicit resolved idea exposes only supported definition facts', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const ideaPath = resolved(root, '001', 'finished');
    const bd = installBdCommand(root, [{
      id: 'unreachable-tracked-task',
      status: 'in_progress',
      description: 'spec: .dude/specs/001-finished/spec.md\nTask: T001@aaaaaaaa',
    }]);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: ideaPath }));

    // Assert
    assertComplete(result);
    assert.deepEqual(result.selected, {
      title: 'finished',
      ideaPath,
      slug: 'finished',
      specPath: null,
      explicit: true,
    });
    assert.equal(result.authority, 'definition');
    assert.equal(result.stage, 'Completed without a package');
    assert.equal(result.next, null);
    assert.equal(result.nextReason, 'This idea is resolved.');
    assert.deepEqual(result.blockers, []);
    assert.equal(result.tasks, null);
    assert.deepEqual(result.phases, []);
    assert.equal(result.unansweredQuestions, 0);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(bd.calls, null, 'resolved lifecycle must finish before a tracked query');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a warning-only missing ideas root returns an empty chooser instead of refusing', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const bd = installBdCommand(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root }));

    // Assert
    assertComplete(result);
    assert.equal(result.status, 'choose');
    assert.equal(result.selected, null);
    assert.equal(result.authority, null);
    assert.equal(result.stage, null);
    assert.equal(result.next, null);
    assert.equal(result.nextReason, null);
    assert.deepEqual(result.blockers, []);
    assert.equal(result.unansweredQuestions, null);
    assert.deepEqual(result.diagnostics, [{
      code: 'FEATURE_IDEAS_ROOT_MISSING',
      severity: 'warning',
      path: '.dude/ideas',
      message: 'canonical ideas root is missing',
    }]);
    assert.deepEqual(result.choices, []);
    assertSafeReadAction(result);
    assert.equal(bd.calls, null, 'chooser inventory must not query tracked authority');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fatal lifecycle diagnostics refuse projection and withhold every authority field', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    define(root, '001', 'valid');
    write(root, '.dude/ideas/002-malformed.md', 'not frontmatter\n');
    const bd = installBdCommand(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'valid' }));

    // Assert
    assert.equal(result.status, 'unavailable');
    assert.equal(result.selected, null);
    assert.equal(result.authority, null);
    assert.equal(result.stage, null);
    assert.equal(result.next, null);
    assert.match(result.nextReason, /malformed frontmatter/i);
    assert.deepEqual(result.blockers, []);
    assert.equal(result.unansweredQuestions, null);
    assert.equal(result.complete, false);
    assert.equal(result.readAt, null);
    assertSafeReadAction(result);
    assert.deepEqual(
      result.diagnostics.map(({ code, severity, path: diagnosticPath }) => ({
        code,
        severity,
        path: diagnosticPath,
      })),
      [{
        code: 'FEATURE_FRONTMATTER_MALFORMED',
        severity: 'error',
        path: '.dude/ideas/002-malformed.md',
      }],
    );
    assert.equal(bd.calls, null, 'fatal lifecycle state must refuse before a tracked query');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('all-open owned package is Definition Only, counts safe questions, ignores task-state, and writes nothing', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'definition', {
      questions: '1. Still unanswered?\n\n2. Answered?\n   Answer: Yes.',
    });
    write(
      root,
      '.dude/state/task-state.json',
      JSON.stringify({ [feature.tasksPath]: { 'T001@aaaaaaaa': '~' } }),
    );
    const bd = installBdCommand(root);
    const before = contentSnapshot(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'definition' }));

    // Assert
    assertComplete(result);
    assert.equal(result.authority, 'definition');
    assert.equal(result.stage, 'Defined');
    assert.equal(result.next, null);
    assert.equal(result.nextReason, 'No canonical task execution evidence exists yet.');
    assert.deepEqual(result.blockers, []);
    assert.equal(result.unansweredQuestions, 1);
    assert.equal(result.tasks, null);
    assert.deepEqual(result.phases, []);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.sources.map(({ label, role, path: sourcePath }) => ({ label, role, path: sourcePath })),
      [
        { label: 'Feature inventory', role: 'selection', path: undefined },
        { label: 'Idea', role: 'identity', path: feature.ideaPath },
        { label: 'Specification', role: 'definition', path: feature.specPath },
        { label: 'Tracked board', role: 'authority', path: undefined },
        { label: 'Tasks', role: 'authority-check', path: feature.tasksPath },
      ],
    );
    assert.deepEqual(contentSnapshot(root), before, 'projection must not mutate any repository byte');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Lightweight projection reuses canonical task readiness and blocker metadata', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'lightweight', {
      tasks: [
        '## Work',
        '- [x] T001@aaaaaaaa Completed prerequisite',
        '- [!] T002@bbbbbbbb Blocked task',
        '    blocked-by: external-dependency: Waiting for the service',
        '- [ ] T003@cccccccc Ready canonical task',
        '    deps: T001@aaaaaaaa',
        '',
      ].join('\n'),
    });
    const bd = installBdCommand(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'lightweight' }));

    // Assert
    assert.equal(result.authority, 'lightweight');
    assert.equal(result.stage, 'Blocked');
    assert.deepEqual(result.next, {
      description: 'Ready canonical task',
      source: {
        kind: 'file',
        path: feature.tasksPath,
        taskKey: 'T003@cccccccc',
        description: 'Ready canonical task',
      },
    });
    assert.deepEqual(result.blockers, [{
      classification: 'external-dependency',
      reason: 'Waiting for the service',
      source: {
        kind: 'file',
        path: feature.tasksPath,
        taskKey: 'T002@bbbbbbbb',
        reason: 'Waiting for the service',
      },
    }]);
    assert.deepEqual(result.tasks, { total: 3, open: 1, inProgress: 0, blocked: 1, done: 1 });
    assert.deepEqual(result.phases, [{
      name: 'Work',
      total: 3,
      open: 1,
      inProgress: 0,
      blocked: 1,
      done: 1,
      state: 'current',
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('populated tracked authority never falls back to selected feature markdown, including when no tracked task is ready', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const alpha = define(root, '001', 'alpha');
    const beta = define(root, '002', 'beta', {
      tasks: '- [~] T001@aaaaaaaa Markdown task that must not leak\n',
    });
    const onlyAlpha = [{
      id: 'alpha-task',
      issue_type: 'task',
      status: 'open',
      title: 'Alpha tracked task',
      description: `spec: ${alpha.specPath}\nTask: T001@aaaaaaaa`,
    }];
    const blockedBeta = [{
      id: 'beta-open',
      issue_type: 'task',
      status: 'open',
      title: 'Tracked open task',
      description: `spec: ${beta.specPath}\nTask: T002@bbbbbbbb`,
    }, {
      id: 'beta-task',
      issue_type: 'task',
      status: 'blocked',
      title: 'Tracked blocker',
      description: `spec: ${beta.specPath}\nTask: T001@aaaaaaaa\nBlocked-by: tracked board work blocker`,
    }];
    const alphaBd = installBdCommand(root, onlyAlpha);
    const betaBd = installBdCommand(root, blockedBeta);

    // Act
    const absent = await alphaBd.run(() => readNowProjection({ root, target: 'beta' }));
    const noneReady = await betaBd.run(() => readNowProjection({ root, target: 'beta' }));

    // Assert
    assert.equal(absent.selected?.ideaPath, beta.ideaPath);
    assert.equal(absent.authority, 'tracked');
    assert.equal(absent.next, null);
    assert.equal(absent.stage, 'Defined');
    assert.equal(absent.tasks, null);
    assert.deepEqual(absent.phases, []);
    assert.deepEqual(absent.blockers, []);
    assert.match(absent.nextReason, /no exact issue/i);
    assert.deepEqual(absent.diagnostics.map((item) => item.code), ['TRACKED_FEATURE_NOT_FOUND']);
    assert.deepEqual(absent.attention.map((item) => item.code), ['TRACKED_FEATURE_NOT_FOUND']);
    assert.deepEqual(
      alphaBd.callSequence,
      [BD_LIST_CALL, BD_LIST_CALL],
      'selected B must not query ready work for tracked-only feature A',
    );
    assert.doesNotMatch(JSON.stringify(absent), /Alpha tracked task|Markdown task that must not leak/);

    assert.equal(noneReady.authority, 'tracked');
    assert.equal(noneReady.stage, 'Blocked');
    assert.deepEqual(noneReady.next, {
      description: 'tracked board work open task',
      source: {
        kind: 'tracked',
        issueId: 'beta-open',
        title: 'Tracked open task',
      },
    });
    assert.equal(noneReady.nextReason, null);
    assert.deepEqual(noneReady.blockers, [{
      classification: null,
      reason: 'tracked board work blocker',
      source: {
        kind: 'tracked',
        issueId: 'beta-task',
        title: 'Tracked blocker',
      },
    }]);
    assert.deepEqual(noneReady.tasks, { total: 2, open: 1, inProgress: 0, blocked: 1, done: 0 });
    assert.doesNotMatch(JSON.stringify(noneReady), /Markdown task that must not leak/);
    assert.deepEqual(betaBd.callSequence, [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
      BD_READY_CALL,
    ], 'a ready projection captures and verifies both canonical tracked queries');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked binding uses exact first-line specification identity and rejects malformed authority', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'exact', {
      tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
    });
    const prefixCollision = [{
      id: 'collision',
      issue_type: 'task',
      status: 'in_progress',
      title: 'Wrong tracked fact',
      description: `spec: ${feature.specPath}-collision\nTask: T001@aaaaaaaa`,
    }];
    const collisionBd = installBdCommand(root, prefixCollision);
    const malformedBd = installBdCommand(root, '{"issues":"not-an-array"}');
    const unavailableBd = installBdCommand(root, [], 1);

    // Act
    const collision = await collisionBd.run(() => readNowProjection({ root, target: 'exact' }));
    const malformed = await malformedBd.run(() => readNowProjection({ root, target: 'exact' }));
    const unavailable = await unavailableBd.run(() => readNowProjection({ root, target: 'exact' }));

    // Assert
    assert.equal(collision.authority, 'tracked');
    assert.deepEqual(collision.diagnostics.map((item) => item.code), ['TRACKED_FEATURE_NOT_FOUND']);
    assert.doesNotMatch(JSON.stringify(collision), /Wrong tracked fact|Markdown fallback forbidden/);
    assert.equal(malformed.status, 'unavailable');
    assert.equal(malformed.authority, null);
    assert.deepEqual(malformed.diagnostics.map((item) => item.code), ['TRACKED_AUTHORITY_UNAVAILABLE']);
    assert.doesNotMatch(JSON.stringify(malformed), /Markdown fallback forbidden/);
    assertSafeReadAction(malformed);
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.authority, null);
    assert.equal(unavailable.next, null);
    assert.deepEqual(unavailable.blockers, []);
    assert.deepEqual(unavailable.diagnostics.map((item) => item.code), ['TRACKED_AUTHORITY_UNAVAILABLE']);
    assertSafeReadAction(unavailable);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked projection uses canonical issue type and status aliases with status-state precedence', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'tracked-aliases', {
      tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
    });
    const issues = [
      {
        id: 'epic-from-type',
        type: 'ePiC',
        issue_type: 'task',
        status: 'in_progress',
        title: 'Type epic must not execute',
        description: `spec: ${feature.specPath}\nTask: T010@aaaaaaa1`,
      },
      {
        id: 'epic-from-issue-type',
        type: 'task',
        issue_type: 'EPIC',
        status: 'blocked',
        title: 'Issue-type epic must not block',
        description: `spec: ${feature.specPath}\nTask: T011@aaaaaaa2`,
      },
      {
        issue_id: 'active-alias',
        type: 'custom-work-item',
        issue_type: 'task',
        status: 'IN \t PROGRESS',
        state: 'closed',
        title: 'Canonical active task',
        description: `spec: ${feature.specPath}\nTask: T012@aaaaaaa3`,
      },
      {
        id: 'blocked-fallback',
        type: 'task',
        status: '',
        state: 'BLOCKED',
        title: 'Canonical blocker',
        description: `spec: ${feature.specPath}\nTask: T013@aaaaaaa4\nBlocked-by: Canonical blocker`,
      },
      {
        id: 'done-alias',
        type: 'task',
        status: 'DONE',
        title: 'Canonical completed task',
        description: `spec: ${feature.specPath}\nTask: T014@aaaaaaa5`,
      },
    ];
    const bd = installBdCommand(root, issues);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'tracked-aliases' }));

    // Assert
    assert.equal(result.authority, 'tracked');
    assert.equal(result.stage, 'Blocked');
    assert.deepEqual(result.next, {
      description: 'Canonical active task',
      source: {
        kind: 'tracked',
        issueId: 'active-alias',
        title: 'Canonical active task',
      },
    });
    assert.deepEqual(result.blockers, [{
      classification: null,
      reason: 'Canonical blocker',
      source: {
        kind: 'tracked',
        issueId: 'blocked-fallback',
        title: 'Canonical blocker',
      },
    }]);
    assert.deepEqual(result.diagnostics, []);
    assert.doesNotMatch(
      JSON.stringify(result),
      /Type epic must not execute|Issue-type epic must not block|Markdown fallback forbidden/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked projection rejects every JSON-representable non-string authority field', async () => {
  // Arrange
  const invalidValues = [
    ['null', null],
    ['number', 0],
    ['array', ['closed']],
    ['object', { value: 'closed' }],
    ['boolean', false],
  ];
  const scenarios = ['type', 'issue_type', 'status', 'state'].flatMap((field) => (
    invalidValues.map(([kind, value]) => ({ field, kind, value }))
  ));
  scenarios.push(
    { field: 'issue_type', kind: 'invalid beside valid type epic', value: null, type: 'epic' },
    { field: 'type', kind: 'invalid beside valid issue_type epic', value: ['epic'], issue_type: 'epic' },
  );

  // Act
  const observations = [];
  for (const scenario of scenarios) {
    const root = temporaryRoot();
    try {
      const feature = define(root, '001', 'malformed-authority');
      const issue = {
        id: 'tracked-task',
        title: 'Tracked task',
        description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
        type: scenario.type ?? 'task',
        status: 'open',
        ...(scenario.issue_type === undefined ? {} : { issue_type: scenario.issue_type }),
        [scenario.field]: scenario.value,
      };
      const bd = installBdCommand(root, [issue]);
      const result = await bd.run(() => readNowProjection({ root, target: 'malformed-authority' }));
      observations.push({
        label: `${scenario.field}: ${scenario.kind}`,
        status: result.status,
        authority: result.authority,
        next: result.next,
        blockers: result.blockers,
        diagnostics: result.diagnostics.map((item) => item.code),
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // Assert
  for (const observation of observations) {
    assert.deepEqual(observation, {
      label: observation.label,
      status: 'unavailable',
      authority: null,
      next: null,
      blockers: [],
      diagnostics: ['TRACKED_AUTHORITY_UNAVAILABLE'],
    }, observation.label);
  }
});

test('tracked projection rejects active issues without nonblank string identity and title', async () => {
  // Arrange
  const scenarios = [
    ['missing id', {}],
    ['empty id', { id: '' }],
    ['blank id', { id: ' \t ' }],
    ['non-string id', { id: 17 }],
    ['missing title', { id: 'active-task' }],
    ['empty title', { id: 'active-task', title: '' }],
    ['blank title', { id: 'active-task', title: ' \t ' }],
    ['non-string title', { id: 'active-task', title: ['Active task'] }],
  ];

  // Act
  const observations = [];
  for (const [label, identity] of scenarios) {
    const root = temporaryRoot();
    try {
      const feature = define(root, '001', 'active-identity');
      const bd = installBdCommand(root, [{
        ...identity,
        type: 'task',
        status: 'in_progress',
        description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
      }]);
      const result = await bd.run(() => readNowProjection({ root, target: 'active-identity' }));
      observations.push({
        label,
        status: result.status,
        authority: result.authority,
        next: result.next,
        diagnostics: result.diagnostics.map((item) => item.code),
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // Assert
  for (const observation of observations) {
    assert.deepEqual(observation, {
      label: observation.label,
      status: 'unavailable',
      authority: null,
      next: null,
      diagnostics: ['TRACKED_AUTHORITY_UNAVAILABLE'],
    }, observation.label);
  }
});

test('tracked projection does not fall back to state for an unsupported nonempty status', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'unsupported-status');
    const bd = installBdCommand(root, [{
      id: 'unsupported-task',
      title: 'Unsupported task',
      type: 'task',
      status: 'future',
      state: 'closed',
      description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
    }]);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'unsupported-status' }));

    // Assert
    assert.equal(result.status, 'unavailable');
    assert.equal(result.authority, 'tracked');
    assert.equal(result.next, null);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.diagnostics.map((item) => item.code), ['TRACKED_STATUS_UNSUPPORTED']);
    assert.match(result.diagnostics[0].message, /unsupported-task.*future/);
    assertSafeReadAction(result);
    assert.doesNotMatch(result.diagnostics[0].message, /(?:^|[\s'"])(?:\/[^/\s'"]|[A-Za-z]:[\\/])/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production tracked query uses the complete canonical Beads inventory command', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'tracked-command');
    const issue = [{
      id: 'tracked-active',
      issue_type: 'task',
      status: 'in_progress',
      title: 'Active tracked task',
      description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
    }];
    const bd = installBdCommand(root, issue);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'tracked-command' }));

    // Assert
    assert.deepEqual(bd.calls, ['list', '--all', '--limit', '0', '--json']);
    assert.equal(result.authority, 'tracked');
    assert.deepEqual(result.next, {
      description: 'Active tracked task',
      source: {
        kind: 'tracked',
        issueId: 'tracked-active',
        title: 'Active tracked task',
      },
    });
    assert.deepEqual(result.diagnostics, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an exact in-progress tracked issue wins without querying readiness and is completely verified', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'tracked-active');
    const active = {
      id: 'active-task',
      type: 'task',
      status: 'in_progress',
      title: 'Active tracked task',
      description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
    };
    const bd = installBdCommand(root, [active], 0, commandResponses({
      ready: 'this readiness response must remain unread',
    }));
    const before = contentSnapshot(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'tracked-active' }));

    // Assert
    assertComplete(result);
    assert.deepEqual(result.next, {
      description: 'Active tracked task',
      source: {
        kind: 'tracked',
        issueId: 'active-task',
        title: 'Active tracked task',
      },
    });
    assert.deepEqual(
      result.sources.filter((source) => source.kind === 'tracked').map((source) => source.command),
      ['bd list --all --limit 0 --json'],
    );
    assert.deepEqual(bd.callSequence, [BD_LIST_CALL, BD_LIST_CALL]);
    assert.deepEqual(contentSnapshot(root), before, 'active projection is read-only');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked readiness selects the first exact normalized open non-epic issue in ready output order', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'tracked-ready', {
      tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
    });
    const exactDescription = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const list = [{
      id: 'list-open',
      type: 'task',
      status: 'open',
      title: 'Open issue in complete inventory',
      description: exactDescription,
    }, {
      id: 'first-ready',
      type: 'custom-work-item',
      status: 'OPEN',
      title: 'First ready alias',
      description: exactDescription,
    }, {
      id: 'second-ready',
      type: 'task',
      status: '',
      state: 'OPEN',
      title: 'Second ready state fallback',
      description: exactDescription,
    }];
    const ready = [
      {
        id: 'other-feature',
        type: 'task',
        status: 'open',
        title: 'Other feature must not leak',
        description: 'spec: .dude/specs/999-other/spec.md\nTask: T999@aaaaaaaa',
      },
      {
        id: 'feature-epic',
        type: 'EPIC',
        status: 'open',
        title: 'Feature epic must not execute',
        description: exactDescription,
      },
      {
        id: 'closed',
        type: 'task',
        status: 'done',
        title: 'Closed task must not execute',
        description: exactDescription,
      },
      {
        id: 'blocked',
        type: 'task',
        status: 'blocked',
        title: 'Blocked task must not execute',
        description: exactDescription,
      },
      {
        id: 'in-progress',
        type: 'task',
        status: 'IN \t PROGRESS',
        title: 'In-progress task must not replace active selection',
        description: exactDescription,
      },
      {
        id: 'unsupported-over-state',
        type: 'task',
        status: 'future',
        state: 'open',
        title: 'Unsupported status must not fall back to state',
        description: exactDescription,
      },
      {
        id: 'first-ready',
        type: 'custom-work-item',
        status: 'OPEN',
        title: 'First ready alias',
        description: exactDescription,
      },
      {
        id: 'second-ready',
        type: 'task',
        status: '',
        state: 'OPEN',
        title: 'Second ready state fallback',
        description: exactDescription,
      },
    ];
    const bd = installBdCommand(root, list, 0, commandResponses({ ready }));
    const before = contentSnapshot(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'tracked-ready' }));

    // Assert
    assertComplete(result);
    assert.equal(result.authority, 'tracked');
    assert.equal(result.stage, 'In progress');
    assert.deepEqual(result.next, {
      description: 'First ready alias',
      source: {
        kind: 'tracked',
        issueId: 'first-ready',
        title: 'First ready alias',
      },
    });
    assert.deepEqual(
      result.sources.filter((source) => source.kind === 'tracked').map((source) => ({
        command: source.command,
        role: source.role,
      })),
      [
        { command: 'bd list --all --limit 0 --json', role: 'authority' },
        { command: 'bd ready --json', role: 'readiness' },
      ],
    );
    assert.deepEqual(bd.callSequence, [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
      BD_READY_CALL,
    ]);
    assert.doesNotMatch(
      JSON.stringify(result),
      /Other feature must not leak|Feature epic must not execute|Closed task must not execute|Blocked task must not execute|In-progress task must not replace active selection|Unsupported status must not fall back to state|Markdown fallback forbidden/,
    );
    assert.deepEqual(contentSnapshot(root), before, 'ready projection is read-only');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked readiness failures and malformed relevant ready facts fail closed without markdown fallback', async () => {
  const scenarios = [
    ['malformed JSON', '{', 0],
    ['non-array envelope', '{"issues":{}}', 0],
    ['unavailable command', '[]', 1],
    ['blank relevant id', [{
      id: ' \t ',
      type: 'task',
      status: 'open',
      title: 'Ready title',
    }], 0],
    ['non-string relevant title', [{
      id: 'ready-title',
      type: 'task',
      status: 'open',
      title: ['Ready title'],
    }], 0],
    ['non-string relevant status', [{
      id: 'ready-status',
      type: 'task',
      status: ['open'],
      title: 'Ready status',
    }], 0],
  ];

  // Act
  const results = [];
  for (const [label, readyOutput, readyExitCode] of scenarios) {
    const root = temporaryRoot();
    try {
      // Arrange
      const feature = define(root, '001', 'ready-failure', {
        tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
      });
      const exactDescription = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
      const ready = Array.isArray(readyOutput)
        ? readyOutput.map((issue) => ({ ...issue, description: exactDescription }))
        : readyOutput;
      const bd = installBdCommand(root, [{
        id: 'list-open',
        type: 'task',
        status: 'open',
        title: 'Complete inventory task',
        description: exactDescription,
      }], 0, commandResponses({
        ready: { output: ready, exitCode: readyExitCode },
      }));

      const result = await bd.run(() => readNowProjection({ root, target: 'ready-failure' }));
      results.push({ label, root, result, callSequence: bd.callSequence });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // Assert
  for (const { label, root, result, callSequence } of results) {
    assert.equal(result.status, 'unavailable', label);
    assert.equal(result.complete, false, label);
    assert.equal(result.authority, 'tracked', label);
    assert.equal(result.next, null, label);
    assert.deepEqual(result.blockers, [], label);
    assert.deepEqual(result.diagnostics.map((item) => item.code), [
      'TRACKED_READINESS_UNAVAILABLE',
    ], label);
    assert.deepEqual(callSequence, [BD_LIST_CALL, BD_READY_CALL], label);
    assertSafeReadAction(result);
    assert.equal(result.diagnostics[0].path, '.', label);
    assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden|malformed issue|unrecognized JSON|Error:/i, label);
    assert.ok(!JSON.stringify(result).includes(root), `${label}: no absolute fixture path may leak`);
  }
});

test('tracked blockers fail closed without identity and preserve valid exact source facts', async () => {
  const invalid = [
    ['blank id', { id: ' \t ', title: 'Blocked title' }],
    ['non-string id', { id: 17, title: 'Blocked title' }],
    ['blank title', { id: 'blocked-task', title: ' ' }],
    ['non-string title', { id: 'blocked-task', title: ['Blocked title'] }],
  ];

  // Act
  const invalidResults = [];
  for (const [label, identity] of invalid) {
    const root = temporaryRoot();
    try {
      // Arrange
      const feature = define(root, '001', 'blocked-identity', {
        tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
      });
      const bd = installBdCommand(root, [{
        ...identity,
        type: 'task',
        status: 'blocked',
        description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
      }]);
      const result = await bd.run(() => readNowProjection({ root, target: 'blocked-identity' }));
      invalidResults.push({ label, result, callSequence: bd.callSequence });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // Assert
  for (const { label, result, callSequence } of invalidResults) {
    assert.equal(result.status, 'unavailable', label);
    assert.equal(result.authority, null, label);
    assert.equal(result.next, null, label);
    assert.deepEqual(result.blockers, [], label);
    assert.deepEqual(result.diagnostics.map((item) => item.code), [
      'TRACKED_AUTHORITY_UNAVAILABLE',
    ], label);
    assert.deepEqual(callSequence, [BD_LIST_CALL], label);
    assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden/, label);
    assertSafeReadAction(result);
  }

  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'valid-blocker');
    const exactDescription = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const bd = installBdCommand(root, [
      {
        id: 'blocker-id',
        type: 'task',
        status: 'blocked',
        title: 'Exact blocker title',
        description: `${exactDescription}\nBlocked-by: Exact blocker title`,
      },
      {
        id: 'ready-id',
        type: 'task',
        status: 'open',
        title: 'Exact ready title',
        description: exactDescription,
      },
    ], 0, commandResponses({
      ready: [{
        id: 'ready-id',
        type: 'task',
        status: 'open',
        title: 'Exact ready title',
        description: exactDescription,
      }],
    }));

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'valid-blocker' }));

    // Assert
    assertComplete(result);
    assert.deepEqual(result.blockers, [{
      classification: null,
      reason: 'Exact blocker title',
      source: {
        kind: 'tracked',
        issueId: 'blocker-id',
        title: 'Exact blocker title',
      },
    }]);
    assert.deepEqual(result.next?.source, {
      kind: 'tracked',
      issueId: 'ready-id',
      title: 'Exact ready title',
    });
    assert.deepEqual(bd.callSequence, [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
      BD_READY_CALL,
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ownership resolution fails closed for no owner, duplicate owner, and identity mismatch', async () => {
  const noOwnerRoot = temporaryRoot();
  const duplicateRoot = temporaryRoot();
  const mismatchRoot = temporaryRoot();
  try {
    // Arrange
    write(noOwnerRoot, '.dude/specs/001-orphan/spec.md', '# orphan\n');
    write(noOwnerRoot, '.dude/specs/001-orphan/tasks.md', '- [ ] T001@aaaaaaaa Task\n');
    draft(noOwnerRoot, '002', 'draft');

    const owned = define(duplicateRoot, '001', 'owned');
    write(
      duplicateRoot,
      '.dude/ideas/002-other.md',
      `---\ntitle: other\nslug: other\nstatus: defined\nspec_path: ${owned.specPath}\n---\n\n## Idea\n\nOther.\n`,
    );

    write(mismatchRoot, '.dude/specs/002-package/spec.md', '# package\n');
    write(mismatchRoot, '.dude/specs/002-package/tasks.md', '- [ ] T001@aaaaaaaa Task\n');
    write(
      mismatchRoot,
      '.dude/ideas/001-owner.md',
      '---\ntitle: owner\nslug: owner\nstatus: defined\nspec_path: .dude/specs/002-package/spec.md\n---\n\n## Idea\n\nOwner.\n',
    );
    const bd = installBdCommand(noOwnerRoot);

    // Act
    const [noOwner, duplicate, mismatch] = await bd.run(async () => [
      await readNowProjection({ root: noOwnerRoot, target: 'draft' }),
      await readNowProjection({ root: duplicateRoot, target: 'owned' }),
      await readNowProjection({ root: mismatchRoot, target: 'owner' }),
    ]);

    // Assert
    assert.equal(noOwner.status, 'unavailable');
    assert.ok(noOwner.diagnostics.some((item) => item.code === 'FEATURE_OWNER_NOT_FOUND'));
    assert.equal(duplicate.status, 'unavailable');
    assert.ok(duplicate.diagnostics.some((item) => item.code === 'FEATURE_OWNER_DUPLICATE'));
    assert.equal(mismatch.status, 'unavailable');
    assert.ok(mismatch.diagnostics.some((item) => item.code === 'FEATURE_OWNER_IDENTITY_MISMATCH'));
    for (const result of [noOwner, duplicate, mismatch]) {
      assert.equal(result.authority, null);
      assert.equal(result.next, null);
      assert.equal(result.complete, false);
      assertSafeReadAction(result);
      for (const diagnostic of result.diagnostics) {
        assert.doesNotMatch(diagnostic.message, /(?:^|[\s'"])(?:\/[^/\s'"]|[A-Za-z]:[\\/])/);
      }
    }
  } finally {
    fs.rmSync(noOwnerRoot, { recursive: true, force: true });
    fs.rmSync(duplicateRoot, { recursive: true, force: true });
    fs.rmSync(mismatchRoot, { recursive: true, force: true });
  }
});

test('safe reads refuse symlinks, missing and wrong-type tasks, malformed tasks, and path escape selectors without leaking contents', {
  skip: process.platform === 'win32',
}, async () => {
  const roots = Array.from({ length: 5 }, temporaryRoot);
  const outside = temporaryRoot();
  try {
    // Arrange
    const [symlinkRoot, missingRoot, wrongTypeRoot, malformedRoot, selectorRoot] = roots;
    const symlinked = define(symlinkRoot, '001', 'symlink');
    const missing = define(missingRoot, '001', 'missing');
    const wrongType = define(wrongTypeRoot, '001', 'wrong-type');
    const malformed = define(malformedRoot, '001', 'malformed');
    define(selectorRoot, '001', 'selector');
    const secret = 'OUTSIDE-CONTENTS-MUST-NOT-LEAK';
    write(outside, 'secret.md', secret);
    fs.rmSync(path.join(symlinkRoot, symlinked.tasksPath));
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(symlinkRoot, symlinked.tasksPath));
    fs.rmSync(path.join(missingRoot, missing.tasksPath));
    fs.rmSync(path.join(wrongTypeRoot, wrongType.tasksPath));
    fs.mkdirSync(path.join(wrongTypeRoot, wrongType.tasksPath));
    write(malformedRoot, malformed.tasksPath, '- [z] T001@aaaaaaaa Invalid glyph\n');
    const bd = installBdCommand(symlinkRoot);

    // Act
    const results = await bd.run(async () => [
      await readNowProjection({ root: symlinkRoot, target: 'symlink' }),
      await readNowProjection({ root: missingRoot, target: 'missing' }),
      await readNowProjection({ root: wrongTypeRoot, target: 'wrong-type' }),
      await readNowProjection({ root: malformedRoot, target: 'malformed' }),
      await readNowProjection({ root: selectorRoot, target: '.dude/ideas/../../secret.md' }),
    ]);

    // Assert
    const expectedDiagnostics = [
      { code: 'PROJECTION_INPUT_UNSAFE', severity: 'error', path: symlinked.tasksPath },
      { code: 'PROJECTION_INPUT_MISSING', severity: 'error', path: missing.tasksPath },
      { code: 'PROJECTION_INPUT_NOT_FILE', severity: 'error', path: wrongType.tasksPath },
      { code: 'TASKS_MALFORMED', severity: 'error', path: malformed.tasksPath },
      { code: 'FEATURE_IDEA_QUERY_INVALID', severity: 'error', path: '.' },
    ];
    for (const [index, result] of results.entries()) {
      assert.equal(result.status, 'unavailable');
      assert.equal(result.authority, null);
      assert.equal(result.stage, null);
      assert.equal(result.next, null);
      assert.deepEqual(result.blockers, []);
      assert.equal(result.diagnostics.length, 1);
      const [diagnostic] = result.diagnostics;
      assert.deepEqual(
        {
          code: diagnostic.code,
          severity: diagnostic.severity,
          path: diagnostic.path,
        },
        expectedDiagnostics[index],
      );
      assert.ok(
        diagnostic.path === '.'
          || (!path.posix.isAbsolute(diagnostic.path)
            && !path.win32.isAbsolute(diagnostic.path)
            && !diagnostic.path.split('/').includes('..')),
        `diagnostic path must be repository-relative: ${diagnostic.path}`,
      );
      assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
      for (const hostPath of [...roots, outside]) {
        assert.doesNotMatch(
          JSON.stringify(result),
          new RegExp(hostPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        );
      }
      assert.doesNotMatch(
        diagnostic.message,
        /(?:^|[\s'"])(?:\/[^/\s'"]|[A-Za-z]:[\\/])/,
        `diagnostic message must not expose an absolute path: ${diagnostic.message}`,
      );
    }
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('source disclosures trace oriented facts while primary orientation hides internal notation', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'source-trace', {
      questions: '1. Still unanswered?\n\n2. Already decided?\n   Answer: Yes.',
      tasks: [
        '## Phase 1: Foundation',
        '- [~] T001@aaaaaaaa Active T001@aaaaaaaa work',
        '- [!] T002@bbbbbbbb Blocked work',
        '    blocked-by: external-dependency: Waiting for the service',
        '',
      ].join('\n'),
    });
    write(
      root,
      feature.ideaPath,
      `${fs.readFileSync(path.join(root, feature.ideaPath), 'utf8')}\n## Coordinator Log\n\n- 2026-09-03 UTC - T001@aaaaaaaa started active work\n`,
    );
    write(
      root,
      feature.specPath,
      '# Source trace\n\n## Revision Log\n\n- 2026-09-03 UTC - T002@bbbbbbbb recorded an external dependency\n',
    );
    const bd = installBdCommand(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'source-trace' }));

    // Assert
    assertComplete(result);
    assert.equal(result.stage, 'Blocked');
    assert.equal(result.unansweredQuestions, 1);
    assert.deepEqual(result.next, {
      description: 'Active task work',
      source: {
        kind: 'file',
        path: feature.tasksPath,
        taskKey: 'T001@aaaaaaaa',
        description: 'Active T001@aaaaaaaa work',
      },
    });
    assert.deepEqual(result.blockers, [{
      classification: 'external-dependency',
      reason: 'Waiting for the service',
      source: {
        kind: 'file',
        path: feature.tasksPath,
        taskKey: 'T002@bbbbbbbb',
        reason: 'Waiting for the service',
      },
    }]);
    assert.deepEqual(result.tasks, { total: 2, open: 0, inProgress: 1, blocked: 1, done: 0 });
    assert.deepEqual(result.phases, [{
      name: 'Foundation',
      total: 2,
      open: 0,
      inProgress: 1,
      blocked: 1,
      done: 0,
      state: 'current',
    }]);
    assert.deepEqual(result.activity, {
      total: 1,
      recent: [{ date: '2026-09-03 UTC', text: 'task started active work' }],
    });
    assert.deepEqual(result.latestEvent, {
      date: '2026-09-03 UTC',
      text: 'task recorded an external dependency',
      source: { path: feature.specPath, section: 'Revision Log' },
    });
    assert.deepEqual(
      result.sources.map(({ label, role, path: sourcePath }) => ({ label, role, path: sourcePath })),
      [
        { label: 'Feature inventory', role: 'selection', path: undefined },
        { label: 'Idea', role: 'identity', path: feature.ideaPath },
        { label: 'Specification', role: 'definition', path: feature.specPath },
        { label: 'Tracked board', role: 'authority', path: undefined },
        { label: 'Tasks', role: 'authority', path: feature.tasksPath },
      ],
    );
    assert.deepEqual(result.sources.at(-1)?.details, {
      phases: [{ heading: 'Phase 1: Foundation', taskKeys: ['T001@aaaaaaaa', 'T002@bbbbbbbb'] }],
    });
    const primary = {
      selected: result.selected,
      authority: result.authority,
      stage: result.stage,
      next: result.next && { description: result.next.description },
      blockers: result.blockers.map(({ classification, reason }) => ({ classification, reason })),
      unansweredQuestions: result.unansweredQuestions,
      tasks: result.tasks,
      phases: result.phases,
      activity: result.activity,
      latestEvent: result.latestEvent && { date: result.latestEvent.date, text: result.latestEvent.text },
    };
    assert.doesNotMatch(JSON.stringify(primary), /\bT\d{3,}@[a-z0-9]{8}\b|\[[~!x]\]|sha256:/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('freshness uses content identities, preserves failed reads, and atomically adopts complete successors', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const originalTasks = [
      '## Phase 1: Work',
      '- [~] T001@aaaaaaaa Baseline task',
      '',
    ].join('\n');
    const feature = define(root, '001', 'freshness', { tasks: originalTasks });
    const tasksAbsolute = path.join(root, feature.tasksPath);
    const fixedTime = new Date('2000-01-01T00:00:00.000Z');
    fs.utimesSync(tasksAbsolute, fixedTime, fixedTime);
    const bd = installBdCommand(root);
    const previous = await bd.run(() => readNowProjection({ root, target: 'freshness' }));
    const previousIdentity = previous.sources.find((source) => source.path === feature.tasksPath)?.contentIdentity;

    // Act
    assertComplete(previous);
    assert.deepEqual(initialProjectionFreshness(previous).state, 'current');
    assert.equal((await installBdCommand(root).run(() => (
      checkProjectionFreshness({ root, projection: previous })
    ))).state, 'current');
    assert.throws(() => {
      previous.selected.title = 'mutated';
    }, TypeError);
    assert.throws(() => {
      previous.sources[0].contentIdentity = 'mutated';
    }, TypeError);

    const externallyEditedTasks = originalTasks.replace('Baseline', 'Changed!');
    write(root, feature.tasksPath, externallyEditedTasks);
    fs.utimesSync(tasksAbsolute, fixedTime, fixedTime);
    assert.equal(fs.statSync(tasksAbsolute).mtime.getTime(), fixedTime.getTime(), 'fixture preserves mtime');
    const changed = await installBdCommand(root).run(() => (
      checkProjectionFreshness({ root, projection: previous })
    ));

    // Assert
    assert.equal(changed.state, 'changed', 'same-mtime byte changes are content-identity changes');
    assert.equal(changed.readAt, previous.readAt);
    assert.deepEqual(changed.nextAction, {
      kind: 'refresh',
      label: 'Refresh from repository',
      method: 'POST',
      path: '/api/refresh',
    });
    assert.equal(previous.next?.description, 'Baseline task', 'freshness checking cannot replace the view');
    assert.equal(fs.readFileSync(tasksAbsolute, 'utf8'), externallyEditedTasks, 'external edits are never overwritten');

    fs.rmSync(tasksAbsolute);
    assert.equal((await installBdCommand(root).run(() => (
      checkProjectionFreshness({ root, projection: previous })
    ))).state, 'unavailable');
    const stale = await installBdCommand(root).run(() => (
      refreshNowProjection({ root, target: 'freshness', previous })
    ));
    assert.equal(stale.replaced, false);
    assert.equal(stale.projection, previous);
    assert.equal(stale.projection.readAt, previous.readAt);
    assert.equal(stale.freshness.state, 'stale');
    assert.deepEqual(stale.freshness.nextAction, previous.action ?? {
      kind: 'refresh',
      label: 'Refresh from repository',
      method: 'POST',
      path: '/api/refresh',
    });

    const refreshedTasks = originalTasks.replace('Baseline task', 'Refreshed external task');
    write(root, feature.tasksPath, refreshedTasks);
    const refreshed = await installBdCommand(root).run(() => (
      refreshNowProjection({ root, target: 'freshness', previous })
    ));
    assert.equal(refreshed.replaced, true);
    assert.notEqual(refreshed.projection, previous);
    assertComplete(refreshed.projection);
    assert.equal(refreshed.projection.next?.description, 'Refreshed external task');
    assert.notEqual(
      refreshed.projection.sources.find((source) => source.path === feature.tasksPath)?.contentIdentity,
      previousIdentity,
    );
    assert.equal(refreshed.freshness.state, 'current');
    assert.equal(fs.readFileSync(tasksAbsolute, 'utf8'), refreshedTasks, 'refresh never writes an external edit');

    write(
      root,
      '.dude/ideas/002-conflicting-owner.md',
      `---\ntitle: conflicting owner\nslug: conflicting-owner\nstatus: defined\nspec_path: ${feature.specPath}\n---\n\n## Idea\n\nConflicting owner.\n`,
    );
    const conflict = await installBdCommand(root).run(() => refreshNowProjection({
      root,
      target: 'freshness',
      previous: refreshed.projection,
    }));
    assert.equal(conflict.replaced, false);
    assert.equal(conflict.projection, refreshed.projection);
    assert.equal(conflict.projection.readAt, refreshed.projection.readAt);
    assert.equal(conflict.freshness.state, 'conflict');
    assert.deepEqual(conflict.freshness.nextAction, stale.freshness.nextAction);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked list and readiness captures use semantic identities and reject either mid-read drift', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'tracked-freshness', {
      tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
    });
    const exactDescription = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const list = [{
      id: 'ready-first',
      type: 'task',
      status: 'open',
      title: 'Initial ready task',
      description: exactDescription,
    }];
    const ready = [{
      id: 'ready-first',
      type: 'task',
      status: 'open',
      title: 'Initial ready task',
      description: exactDescription,
    }];
    const changedList = [...list, {
      id: 'list-closed',
      type: 'task',
      status: 'closed',
      title: 'Changed complete inventory',
      description: exactDescription,
    }];
    const changedReady = [{
      ...ready[0],
      title: 'Changed ready task',
    }];
    const before = contentSnapshot(root);
    const previous = await installBdCommand(root, list, 0, commandResponses({ ready })).run(() => (
      readNowProjection({ root, target: 'tracked-freshness' })
    ));

    // Act
    const equivalent = await installBdCommand(
      root,
      `${JSON.stringify(list, null, 2)}\n`,
      0,
      commandResponses({ ready: { issues: ready } }),
    ).run(() => checkProjectionFreshness({ root, projection: previous }));
    const changed = await installBdCommand(root, list, 0, commandResponses({ ready: changedReady })).run(() => (
      checkProjectionFreshness({ root, projection: previous })
    ));
    const failedRefresh = await installBdCommand(root, list, 0, commandResponses({ ready: '{' })).run(() => (
      refreshNowProjection({ root, target: 'tracked-freshness', previous })
    ));
    const listDriftBd = installBdCommand(root, list, 0, {
      [BD_LIST_CALL.join(' ')]: {
        sequence: [{ output: list }, { output: changedList }],
      },
      ...commandResponses({ ready }),
    });
    const listDrift = await listDriftBd.run(() => (
      readNowProjection({ root, target: 'tracked-freshness' })
    ));
    const readyDriftBd = installBdCommand(root, list, 0, {
      [BD_READY_CALL.join(' ')]: {
        sequence: [{ output: ready }, { output: changedReady }],
      },
    });
    const readyDrift = await readyDriftBd.run(() => (
      readNowProjection({ root, target: 'tracked-freshness' })
    ));

    // Assert
    assertComplete(previous);
    assert.deepEqual(
      previous.sources.filter((source) => source.kind === 'tracked').map((source) => source.command),
      ['bd list --all --limit 0 --json', 'bd ready --json'],
    );
    assert.equal(equivalent.state, 'current', 'whitespace and array-envelope equivalents retain query identity');
    assert.equal(changed.state, 'changed', 'a readiness content change is externally visible');
    assert.equal(failedRefresh.replaced, false);
    assert.equal(failedRefresh.projection, previous, 'a failed tracked refresh preserves the exact prior object');
    assert.equal(failedRefresh.projection.readAt, previous.readAt);
    assert.equal(failedRefresh.freshness.state, 'unavailable');
    for (const [label, result, calls] of [
      ['list drift', listDrift, listDriftBd.callSequence],
      ['readiness drift', readyDrift, readyDriftBd.callSequence],
    ]) {
      assert.equal(result.complete, false, label);
      assert.equal(result.status, 'unavailable', label);
      assert.equal(result.next, null, label);
      assert.equal(result.sources.length, 0, label);
      assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
        'PROJECTION_READ_CONFLICT',
      ], label);
      assertSafeReadAction(result);
      assert.ok(!JSON.stringify(result).includes(root), `${label}: no absolute fixture path may leak`);
      assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden|sha256:/, label);
      assert.ok(Array.isArray(calls), `${label}: fixture must record every query`);
    }
    assert.deepEqual(listDriftBd.callSequence, [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
    ]);
    assert.deepEqual(readyDriftBd.callSequence, [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
      BD_READY_CALL,
    ]);
    assert.deepEqual(contentSnapshot(root), before, 'tracked freshness checks and refreshes do not write');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('final lifecycle verification rejects an exact-target mixed read and refresh preserves the prior projection', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'atomic-exact', {
      tasks: '- [~] T001@aaaaaaaa Baseline task\n',
    });
    const duplicateOwnerPath = '.dude/ideas/002-duplicate-owner.md';
    const addDuplicateOwner = () => write(
      root,
      duplicateOwnerPath,
      [
        '---',
        'title: duplicate owner',
        'slug: duplicate-owner',
        'status: defined',
        `spec_path: ${feature.specPath}`,
        '---',
        '',
        '## Idea',
        '',
        'Duplicate owner.',
        '',
        '## Open Questions',
        '',
        'None.',
        '',
      ].join('\n'),
    );
    const previous = await installBdCommand(root).run(() => (
      readNowProjection({ root, target: 'atomic-exact' })
    ));

    // Act
    assertComplete(previous);
    const mixedRead = await mutateBeforeFinalVerification(
      root,
      feature.ideaPath,
      addDuplicateOwner,
      () => installBdCommand(root).run(() => readNowProjection({ root, target: 'atomic-exact' })),
    );
    fs.rmSync(path.join(root, duplicateOwnerPath));
    const refreshed = await mutateBeforeFinalVerification(
      root,
      feature.ideaPath,
      addDuplicateOwner,
      () => installBdCommand(root).run(() => (
        refreshNowProjection({ root, target: 'atomic-exact', previous })
      )),
    );

    // Assert
    assert.equal(mixedRead.complete, false);
    assert.equal(mixedRead.status, 'unavailable');
    assert.equal(mixedRead.authority, null);
    assert.equal(mixedRead.stage, null);
    assert.equal(mixedRead.readAt, null);
    assert.deepEqual(mixedRead.diagnostics.map(({ code, severity, path: diagnosticPath }) => ({
      code,
      severity,
      path: diagnosticPath,
    })), [{
      code: 'PROJECTION_READ_CONFLICT',
      severity: 'error',
      path: '.',
    }]);
    assertSafeReadAction(mixedRead);
    assert.equal(mixedRead.sources.length, 0, 'a rejected mixed read exposes no stale source identities');
    assert.ok(!JSON.stringify(mixedRead).includes(root), 'conflict facts must retain repository-relative paths');
    assert.doesNotMatch(JSON.stringify(mixedRead), /\bsha256:/, 'a primary failure view must not expose raw hashes');

    assert.equal(refreshed.replaced, false);
    assert.equal(refreshed.projection, previous);
    assert.equal(refreshed.projection.readAt, previous.readAt);
    assert.equal(refreshed.projection.next?.description, 'Baseline task');
    assert.equal(refreshed.freshness.state, 'conflict');
    assert.deepEqual(refreshed.freshness.diagnostics.map((diagnostic) => diagnostic.code), [
      'PROJECTION_READ_CONFLICT',
    ]);
    assert.deepEqual(refreshed.freshness.nextAction, mixedRead.action);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('final lifecycle verification rejects stale omitted auto-selection and refresh retains the prior view', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'only-candidate');
    const competingIdeaPath = '.dude/ideas/002-second-candidate.md';
    const addCompetingCandidate = () => {
      draft(root, '002', 'second-candidate');
    };
    const previous = await installBdCommand(root).run(() => readNowProjection({ root }));

    // Act
    assertComplete(previous);
    assert.equal(previous.selected?.ideaPath, feature.ideaPath);
    const mixedRead = await mutateBeforeFinalVerification(
      root,
      feature.ideaPath,
      addCompetingCandidate,
      () => installBdCommand(root).run(() => readNowProjection({ root })),
    );
    fs.rmSync(path.join(root, competingIdeaPath));
    const refreshed = await mutateBeforeFinalVerification(
      root,
      feature.ideaPath,
      addCompetingCandidate,
      () => installBdCommand(root).run(() => refreshNowProjection({ root, previous })),
    );

    // Assert
    assert.equal(mixedRead.complete, false, 'a stale single-candidate choice cannot become a complete projection');
    assert.equal(mixedRead.status, 'unavailable');
    assert.equal(mixedRead.selected?.ideaPath, feature.ideaPath, 'safe selected identity remains visible');
    assert.equal(mixedRead.selected?.explicit, false);
    assert.equal(mixedRead.authority, null);
    assert.equal(mixedRead.stage, null);
    assert.equal(mixedRead.readAt, null);
    assert.deepEqual(mixedRead.diagnostics.map((diagnostic) => diagnostic.code), [
      'PROJECTION_READ_CONFLICT',
    ]);
    assertSafeReadAction(mixedRead);

    assert.equal(refreshed.replaced, false);
    assert.equal(refreshed.projection, previous);
    assert.equal(refreshed.projection.readAt, previous.readAt);
    assert.equal(refreshed.projection.selected?.ideaPath, feature.ideaPath);
    assert.equal(refreshed.freshness.state, 'conflict');
    assert.deepEqual(refreshed.freshness.diagnostics.map((diagnostic) => diagnostic.code), [
      'PROJECTION_READ_CONFLICT',
    ]);
    assert.deepEqual(refreshed.freshness.nextAction, {
      kind: 'refresh',
      label: 'Refresh from repository',
      method: 'POST',
      path: '/api/refresh',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('final source verification detects same-mtime content changes without leaking hashes or host paths', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const originalTasks = '- [~] T001@aaaaaaaa Baseline task\n';
    const feature = define(root, '001', 'same-mtime-source', { tasks: originalTasks });
    const tasksAbsolute = path.join(root, feature.tasksPath);
    const fixedTime = new Date('2000-01-01T00:00:00.000Z');
    fs.utimesSync(tasksAbsolute, fixedTime, fixedTime);

    // Act
    const result = await mutateBeforeFinalVerification(
      root,
      feature.ideaPath,
      () => {
        write(root, feature.tasksPath, originalTasks.replace('Baseline', 'Changed'));
        fs.utimesSync(tasksAbsolute, fixedTime, fixedTime);
      },
      () => installBdCommand(root).run(() => (
        readNowProjection({ root, target: 'same-mtime-source' })
      )),
    );

    // Assert
    assert.equal(fs.statSync(tasksAbsolute).mtime.getTime(), fixedTime.getTime(), 'fixture preserves mtime');
    assert.equal(result.complete, false);
    assert.deepEqual(result.diagnostics.map(({ code, severity, path: diagnosticPath }) => ({
      code,
      severity,
      path: diagnosticPath,
    })), [{
      code: 'PROJECTION_READ_CONFLICT',
      severity: 'error',
      path: feature.tasksPath,
    }]);
    assertSafeReadAction(result);
    assert.equal(result.sources.length, 0);
    assert.ok(!JSON.stringify(result).includes(root), 'failure output must not expose an absolute fixture root');
    assert.doesNotMatch(JSON.stringify(result), /\bsha256:/, 'primary failure output must not expose a raw hash');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('41-package exact and omitted first-use selection paths leave unselected package documents unread', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const features = Array.from({ length: 41 }, (_, index) => (
      define(root, String(index + 1).padStart(3, '0'), `feature-${String(index + 1).padStart(3, '0')}`)
    ));
    const chooserBd = installBdCommand(root);
    const selectedBd = installBdCommand(root);
    const documents = features.flatMap((feature) => [
      path.resolve(root, feature.specPath),
      path.resolve(root, feature.tasksPath),
    ]);
    const observe = async (operation) => {
      const originalReadFileSync = fs.readFileSync;
      /** @type {string[]} */
      const readPaths = [];
      fs.readFileSync = function observedRead(file, ...args) {
        readPaths.push(path.resolve(String(file)));
        return originalReadFileSync.call(fs, file, ...args);
      };
      try {
        return { result: await operation(), readPaths };
      } finally {
        fs.readFileSync = originalReadFileSync;
      }
    };

    // Act: reads are instrumented before either first-use operation begins.
    const exact = await observe(() => selectedBd.run(() => (
      readNowProjection({ root, target: 'feature-001' })
    )));
    const chooser = await observe(() => chooserBd.run(() => readNowProjection({ root })));

    // Assert
    assertComplete(exact.result);
    assert.equal(exact.result.selected?.ideaPath, features[0].ideaPath);
    assert.ok(exact.readPaths.includes(path.resolve(root, features[0].specPath)));
    assert.ok(exact.readPaths.includes(path.resolve(root, features[0].tasksPath)));
    assert.equal(
      exact.readPaths.filter((candidate) => candidate === path.resolve(root, features[0].ideaPath)).length,
      4,
      'exact completion must re-read the selected idea and bounded lifecycle summary',
    );
    assert.equal(
      exact.readPaths.filter((candidate) => candidate === path.resolve(root, features[0].specPath)).length,
      2,
      'exact completion must re-read the selected specification identity',
    );
    assert.equal(
      exact.readPaths.filter((candidate) => candidate === path.resolve(root, features[0].tasksPath)).length,
      2,
      'exact completion must re-read the selected task authority',
    );
    assert.deepEqual(
      exact.readPaths.filter((candidate) => documents.slice(2).includes(candidate)),
      [],
      'exact selection must not load any unselected spec.md or tasks.md',
    );
    assertComplete(chooser.result);
    assert.equal(chooser.result.status, 'choose');
    assert.equal(chooser.result.choices?.length, 41);
    for (const feature of features) {
      assert.equal(
        chooser.readPaths.filter((candidate) => candidate === path.resolve(root, feature.ideaPath)).length,
        2,
        'chooser completion must re-run bounded lifecycle summary selection',
      );
    }
    assert.deepEqual(
      chooser.readPaths.filter((candidate) => documents.includes(candidate)),
      [],
      'chooser selection must not load any package spec.md or tasks.md',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('selected specification is read after exact selection and invalid selected specs fail closed', {
  skip: process.platform === 'win32',
}, async () => {
  const roots = Array.from({ length: 4 }, temporaryRoot);
  const outside = temporaryRoot();
  try {
    // Arrange
    const [validRoot, missingRoot, directoryRoot, symlinkRoot] = roots;
    const valid = define(validRoot, '001', 'valid');
    const missing = define(missingRoot, '001', 'missing');
    const directory = define(directoryRoot, '001', 'directory');
    const symlink = define(symlinkRoot, '001', 'symlink');
    fs.rmSync(path.join(missingRoot, missing.specPath));
    fs.rmSync(path.join(directoryRoot, directory.specPath));
    fs.mkdirSync(path.join(directoryRoot, directory.specPath));
    write(outside, 'spec.md', '# outside\n');
    fs.rmSync(path.join(symlinkRoot, symlink.specPath));
    fs.symlinkSync(path.join(outside, 'spec.md'), path.join(symlinkRoot, symlink.specPath));
    const bd = installBdCommand(validRoot);
    const originalReadFileSync = fs.readFileSync;
    /** @type {string[]} */
    const validReadPaths = [];
    fs.readFileSync = function observedRead(file, ...args) {
      validReadPaths.push(path.resolve(String(file)));
      return originalReadFileSync.call(fs, file, ...args);
    };
    let results;
    try {
      results = await bd.run(async () => [
        await readNowProjection({ root: validRoot, target: 'valid' }),
        await readNowProjection({ root: missingRoot, target: 'missing' }),
        await readNowProjection({ root: directoryRoot, target: 'directory' }),
        await readNowProjection({ root: symlinkRoot, target: 'symlink' }),
      ]);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    // Act
    const [validResult, ...invalidResults] = results;

    // Assert
    assertComplete(validResult);
    assert.ok(
      validReadPaths.includes(path.resolve(validRoot, valid.specPath)),
      'the exact selected specification must be read after summary selection',
    );
    const expected = [
      ['PROJECTION_INPUT_MISSING', missing.specPath],
      ['PROJECTION_INPUT_NOT_FILE', directory.specPath],
      ['PROJECTION_INPUT_UNSAFE', symlink.specPath],
    ];
    for (const [result, [code, expectedPath]] of invalidResults.map((result, index) => [
      result,
      expected[index],
    ])) {
      assert.equal(result.status, 'unavailable');
      assert.equal(result.complete, false);
      assert.deepEqual(result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path,
      })), [{ code, severity: 'error', path: expectedPath }]);
      assert.ok(
        result.diagnostics.every((diagnostic) => (
          !path.posix.isAbsolute(diagnostic.path)
          && !path.win32.isAbsolute(diagnostic.path)
          && !diagnostic.path.split('/').includes('..')
        )),
        'selected-spec diagnostics must retain repository-relative paths',
      );
    }
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('runtime projection boundary has no mutation, session-control, watcher, or proof seam', () => {
  // Arrange
  const source = fs.readFileSync(new URL('./lib/projection.mjs', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('./lib/canvas-server.mjs', import.meta.url), 'utf8');
  const extension = fs.readFileSync(new URL('./extension.mjs', import.meta.url), 'utf8');
  const runtime = [source, server, extension].join('\n');

  // Act
  const forbidden = /\b(?:task-state\.json|writeFileSync|writeFile|appendFile|mkdirSync|rmSync|renameSync|copyFileSync|watchFile|sendAndWait)\b/g;

  // Assert
  assert.deepEqual(runtime.match(forbidden), null);
  assert.doesNotMatch(runtime, /\b(?:process\.stdout|console\.(?:log|info|warn|error)|session\.(?:send|sendAndWait|abort))\b/);
  assert.doesNotMatch(runtime, /\/(?:__dude_i0|api\/(?:proof|send|sendAndWait|abort|message|mutation|command|retry|answer|approval|stop))\b/);
  assert.match(
    source,
    /const BD_LIST_ARGS = Object\.freeze\(\['list', '--all', '--limit', '0', '--json'\]\)/,
  );
  assert.match(source, /import \{ execFile \} from 'node:child_process';/);
  assert.match(source, /execFile\('bd', args, options,/);
  assert.match(source, /detached: false,/);
  assert.match(source, /killSignal: 'SIGKILL',/);
  assert.match(source, /shell: false,/);
  assert.match(source, /timeout: Math\.max\(1, Math\.ceil\(remaining\)\),/);
  assert.match(source, /if \(callbackResult && closed\) resolve\(callbackResult\);/);
  assert.match(source, /child\.once\('close', \(\) => \{/);
  assert.doesNotMatch(source, /\bspawnSync\b/);
  assert.doesNotMatch(source, /\btrackedIssues\b/);
  for (const [authored, generated] of [
    ['./extension.mjs', '../../../.github/extensions/dude/extension.mjs'],
    ['./lib/projection.mjs', '../../../.github/extensions/dude/lib/projection.mjs'],
    ['./lib/canvas-server.mjs', '../../../.github/extensions/dude/lib/canvas-server.mjs'],
  ]) {
    assert.equal(
      fs.readFileSync(new URL(authored, import.meta.url), 'utf8'),
      fs.readFileSync(new URL(generated, import.meta.url), 'utf8'),
      `${authored} must match its generated runtime projection`,
    );
  }
});

test('one injected operation shares one decreasing deadline across list and readiness captures', async () => {
  // Arrange
  const root = temporaryRoot();
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now++ * 10 },
  });
  try {
    const feature = define(root, '001', 'deadline');
    const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const list = [{
      id: 'ready-task',
      type: 'task',
      status: 'open',
      title: 'List authority title',
      description,
    }];
    /** @type {Array<{args:string[],options:Record<string, unknown>}>} */
    const calls = [];
    const runBd = async (args, options) => {
      calls.push({ args, options });
      return {
        status: 0,
        stdout: JSON.stringify(args[0] === 'list' ? list : list),
        stderr: '',
      };
    };

    // Act
    const result = await readNowProjection(
      { root, target: 'deadline' },
      { runBd, timeoutMs: 100 },
    );

    // Assert
    assertComplete(result);
    assert.deepEqual(calls.map(({ args }) => args), [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
      BD_READY_CALL,
    ]);
    assert.deepEqual(calls.map(({ options }) => options.timeout), [90, 70, 50, 30]);
    assert.ok(
      calls.slice(1).every(({ options }, index) => Number(options.timeout) < Number(calls[index].options.timeout)),
      'later L1/R1/L2/R2 commands must receive only the remaining shared budget',
    );
    for (const { options } of calls) {
      assert.equal(options.cwd, root);
      assert.equal(options.detached, false);
      assert.equal(options.shell, false);
      assert.equal(options.killSignal, 'SIGKILL');
      assert.ok(options.signal instanceof AbortSignal);
    }
  } finally {
    if (performanceDescriptor) Object.defineProperty(globalThis, 'performance', performanceDescriptor);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('injected tracked command failures are typed, private, and never fall back to markdown', async () => {
  // Arrange
  const overflow = Buffer.alloc((8 * 1024 * 1024) + 1, 'x');
  const scenarios = [
    ['list nonzero', 'list', { status: 1, stdout: '[]', stderr: '/private/list-error' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list malformed', 'list', { status: 0, stdout: '{', stderr: '' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list overflow', 'list', { status: 0, stdout: overflow, stderr: '' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['ready nonzero', 'ready', { status: 1, stdout: '[]', stderr: '/private/ready-error' }, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
    ['ready malformed', 'ready', { status: 0, stdout: '{', stderr: '' }, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
    ['ready overflow', 'ready', { status: 0, stdout: overflow, stderr: '' }, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
  ];
  for (const [label, failingCommand, failure, code, authority] of scenarios) {
    const root = temporaryRoot();
    try {
      const feature = define(root, '001', 'runner-failure', {
        tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
      });
      const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
      const valid = [{
        id: 'ready-task',
        type: 'task',
        status: 'open',
        title: 'Complete authority task',
        description,
      }];
      const result = await readNowProjection({ root, target: 'runner-failure' }, {
        timeoutMs: 100,
        runBd: async (args) => (
          args[0] === failingCommand
            ? failure
            : { status: 0, stdout: JSON.stringify(valid), stderr: '' }
        ),
      });

      // Assert
      assert.equal(result.status, 'unavailable', label);
      assert.equal(result.complete, false, label);
      assert.equal(result.authority, authority, label);
      assert.equal(result.next, null, label);
      assert.deepEqual(result.blockers, [], label);
      assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [code], label);
      assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden|private\/|Error:|malformed JSON/i, label);
      assert.ok(!JSON.stringify(result).includes(root), `${label}: must not expose a root path`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('deadline and cancellation return unavailable typed results without invoking untrusted fallback', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    const feature = define(root, '001', 'cancelled', {
      tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
    });
    const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const valid = [{
      id: 'ready-task',
      type: 'task',
      status: 'open',
      title: 'Complete authority task',
      description,
    }];
    let timedOutCalls = 0;
    const timedOut = await readNowProjection({ root, target: 'cancelled' }, {
      timeoutMs: 0,
      runBd: async () => {
        timedOutCalls += 1;
        return { status: 0, stdout: JSON.stringify(valid), stderr: '' };
      },
    });
    const cancelledController = new AbortController();
    cancelledController.abort();
    const cancelled = await readNowProjection({ root, target: 'cancelled' }, {
      signal: cancelledController.signal,
      runBd: async () => ({ status: 0, stdout: JSON.stringify(valid), stderr: '' }),
    });
    const readyController = new AbortController();
    const readyCancelled = await readNowProjection({ root, target: 'cancelled' }, {
      signal: readyController.signal,
      runBd: async (args) => {
        if (args[0] === 'ready') readyController.abort();
        return { status: 0, stdout: JSON.stringify(valid), stderr: '' };
      },
    });
    const afterAbort = (options) => new Promise((resolve) => {
      options.signal.addEventListener('abort', () => {
        resolve({ status: 0, stdout: JSON.stringify(valid), stderr: '' });
      }, { once: true });
    });
    let listTimeoutOptions;
    const timedOutList = await readNowProjection({ root, target: 'cancelled' }, {
      timeoutMs: 20,
      runBd: async (_args, options) => {
        listTimeoutOptions = options;
        return afterAbort(options);
      },
    });
    let readyTimeoutOptions;
    const timedOutReady = await readNowProjection({ root, target: 'cancelled' }, {
      timeoutMs: 20,
      runBd: async (args, options) => {
        if (args[0] === 'list') return { status: 0, stdout: JSON.stringify(valid), stderr: '' };
        readyTimeoutOptions = options;
        return afterAbort(options);
      },
    });
    const previous = await readNowProjection({ root, target: 'cancelled' }, {
      runBd: async () => ({ status: 0, stdout: JSON.stringify(valid), stderr: '' }),
    });
    const timedOutRefresh = await refreshNowProjection({
      root,
      target: 'cancelled',
      previous,
    }, {
      timeoutMs: 20,
      runBd: async (_args, options) => afterAbort(options),
    });

    // Assert
    assert.equal(timedOutCalls, 0, 'an exhausted budget must prevent even the first list command');
    assert.ok(Number(listTimeoutOptions.timeout) > 0);
    assert.ok(Number(readyTimeoutOptions.timeout) > 0);
    assert.equal(listTimeoutOptions.signal.aborted, true);
    assert.equal(readyTimeoutOptions.signal.aborted, true);
    assert.equal(timedOutRefresh.replaced, false);
    assert.equal(timedOutRefresh.projection, previous);
    assert.equal(timedOutRefresh.projection.readAt, previous.readAt);
    assert.equal(timedOutRefresh.freshness.state, 'unavailable');
    for (const [label, result, code, authority] of [
      ['timeout', timedOut, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
      ['cancelled list', cancelled, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
      ['cancelled ready', readyCancelled, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
      ['timed list', timedOutList, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
      ['timed ready', timedOutReady, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
    ]) {
      assert.equal(result.complete, false, label);
      assert.equal(result.authority, authority, label);
      assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [code], label);
      assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden|AbortError|Error:/i, label);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('injected acquisition stays pending until its runner settles', async () => {
  // Arrange
  const root = temporaryRoot();
  const firstList = deferred();
  try {
    const feature = define(root, '001', 'awaited-runner');
    const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const valid = [{
      id: 'ready-task',
      type: 'task',
      status: 'open',
      title: 'Complete authority task',
      description,
    }];
    let calls = 0;
    const pending = readNowProjection({ root, target: 'awaited-runner' }, {
      runBd: async (args) => {
        calls += 1;
        if (calls === 1) return firstList.promise;
        return { status: 0, stdout: JSON.stringify(args[0] === 'ready' ? valid : valid), stderr: '' };
      },
    });
    let settled = false;
    void pending.then(() => { settled = true; });

    // Act
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(settled, false, 'projection must wait for the in-flight acquisition seam');
    firstList.resolve({ status: 0, stdout: JSON.stringify(valid), stderr: '' });
    const result = await pending;

    // Assert
    assertComplete(result);
    assert.equal(calls, 4, 'completion includes L1/R1/L2/R2 and settles only after each result');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ready candidates must agree with one unique list record and list retains all projected facts', async () => {
  // Arrange
  const scenarios = [
    ['absent list record', (list) => [{
      ...list,
      id: 'different-list-record',
      title: 'Different list record',
    }], (ready) => ready],
    ['duplicate list record', (list) => [list, { ...list }], (ready) => ready],
    ['title disagreement', (list) => [list], (ready) => ({ ...ready, title: 'Different ready title' })],
    ['description disagreement', (list) => [list], (ready) => ({ ...ready, description: `${ready.description}\nDifferent body` })],
    ['status disagreement', (list) => [{ ...list, status: 'blocked' }], (ready) => ready],
    ['epic disagreement', (list) => [{ ...list, type: 'epic' }], (ready) => ready],
  ];
  for (const [label, listFor, readyFor] of scenarios) {
    const root = temporaryRoot();
    try {
      const feature = define(root, '001', 'ready-conflict', {
        tasks: '- [~] T001@aaaaaaaa Markdown fallback forbidden\n',
      });
      const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
      const record = {
        id: 'candidate',
        type: 'task',
        status: 'open',
        title: 'List authority title',
        description,
      };
      const list = listFor(record);
      const ready = readyFor(record);

      // Act
      const result = await readNowProjection({ root, target: 'ready-conflict' }, {
        runBd: async (args) => ({
          status: 0,
          stdout: JSON.stringify(args[0] === 'list' ? list : [ready]),
          stderr: '',
        }),
      });

      // Assert
      assert.equal(result.complete, false, label);
      assert.equal(result.status, 'unavailable', label);
      assert.equal(result.authority, 'tracked', label);
      assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
        'TRACKED_READINESS_CONFLICT',
      ], label);
      assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden|Different ready title|999-other/i, label);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const root = temporaryRoot();
  try {
    const feature = define(root, '001', 'list-facts');
    const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const candidate = {
      id: 'candidate',
      type: 'task',
      status: 'open',
      title: 'List authority title',
      description,
    };
    const result = await readNowProjection({ root, target: 'list-facts' }, {
      runBd: async (args) => ({
        status: 0,
        stdout: JSON.stringify(args[0] === 'list'
          ? [candidate, {
              id: 'completed-outside-ready',
              type: 'task',
              status: 'closed',
              title: 'Completed list-only task',
              description: `${description}\nTask: T002@bbbbbbbb`,
            }]
          : [candidate]),
        stderr: '',
      }),
    });

    // Assert
    assertComplete(result);
    assert.deepEqual(result.next?.source, {
      kind: 'tracked',
      issueId: 'candidate',
      title: 'List authority title',
    });
    assert.deepEqual(result.tasks, { total: 2, open: 1, inProgress: 0, blocked: 0, done: 1 });
    assert.deepEqual(
      result.sources.filter((source) => source.kind === 'tracked').map((source) => source.command),
      ['bd list --all --limit 0 --json', 'bd ready --json'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a ready record whose exact identity disagrees with the list fails closed', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    const feature = define(root, '001', 'ready-spec-conflict');
    const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`;
    const list = [{
      id: 'candidate',
      type: 'task',
      status: 'open',
      title: 'List authority title',
      description,
    }];
    const ready = [{
      ...list[0],
      description: description.replace('spec: ', 'spec: .dude/specs/999-other/'),
    }];

    // Act
    const result = await readNowProjection({ root, target: 'ready-spec-conflict' }, {
      runBd: async (args) => ({
        status: 0,
        stdout: JSON.stringify(args[0] === 'list' ? list : ready),
        stderr: '',
      }),
    });

    // Assert
    assert.equal(result.complete, false);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.authority, 'tracked');
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      'TRACKED_READINESS_CONFLICT',
    ]);
    assert.doesNotMatch(JSON.stringify(result), /999-other|Markdown fallback forbidden/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('tracked blocker metadata is exact, source-backed, and fails closed on duplicates', async () => {
  // Arrange
  const cases = [
    ['typed', 'Blocked-by: contract-mismatch: authority records disagree', [{
      classification: 'contract-mismatch',
      reason: 'authority records disagree',
    }], null],
    ['plain', 'Blocked-by: Waiting for upstream confirmation', [{
      classification: null,
      reason: 'Waiting for upstream confirmation',
    }], null],
    ['missing', '', [], null],
    ['duplicate', 'Blocked-by: first reason\nBlocked-by: second reason', [], 'TRACKED_BLOCKER_CONFLICT'],
  ];
  for (const [label, metadata, blockers, conflictCode] of cases) {
    const root = temporaryRoot();
    try {
      const feature = define(root, '001', 'blocker-metadata');
      const description = `spec: ${feature.specPath}\nTask: T001@aaaaaaaa${metadata ? `\n${metadata}` : ''}`;
      const list = [{
        id: 'active',
        type: 'task',
        status: 'in_progress',
        title: 'Active task',
        description: `spec: ${feature.specPath}\nTask: T002@bbbbbbbb`,
      }, {
        id: 'blocked',
        type: 'task',
        status: 'blocked',
        title: 'Title must not become the blocker reason',
        description,
      }];

      // Act
      const result = await readNowProjection({ root, target: 'blocker-metadata' }, {
        runBd: async () => ({ status: 0, stdout: JSON.stringify(list), stderr: '' }),
      });

      // Assert
      if (conflictCode) {
        assert.equal(result.complete, false, label);
        assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [conflictCode], label);
        assert.deepEqual(result.blockers, [], label);
      } else {
        assertComplete(result);
        assert.deepEqual(
          result.blockers.map(({ classification, reason, source }) => ({ classification, reason, source })),
          blockers.map(({ classification, reason }) => ({
            classification,
            reason,
            source: {
              kind: 'tracked',
              issueId: 'blocked',
              title: 'Title must not become the blocker reason',
            },
          })),
          label,
        );
      }
      assert.doesNotMatch(JSON.stringify(result), /Markdown fallback forbidden/i, label);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('tracked blocker orientation sanitizes internal notation while source disclosures stay exact', async () => {
  // Arrange
  const root = temporaryRoot();
  const hash = 'a'.repeat(64);
  const rawDisclosure = `Blocked issue T003@cccccccc [!] sha256:${hash} Definition Only Lightweight Execution Tracked Execution`;
  const cases = [
    {
      id: 'blocked-typed',
      metadata: `Blocked-by: contract-mismatch: Wait for the authority to settle T001@aaaaaaaa [!] sha256:${hash} Definition Only Lightweight Execution Tracked Execution.`,
      classification: 'contract-mismatch',
      reason: 'Wait for the authority to settle task content identity definition canonical task work tracked board work.',
    },
    {
      id: 'blocked-plain',
      metadata: `Blocked-by: Wait for upstream confirmation T002@bbbbbbbb [x] sha256:${hash} Definition Only Lightweight Execution Tracked Execution.`,
      classification: null,
      reason: 'Wait for upstream confirmation task content identity definition canonical task work tracked board work.',
    },
  ];
  try {
    const feature = define(root, '001', 'blocker-orientation');
    const list = [
      {
        id: 'active',
        type: 'task',
        status: 'in_progress',
        title: 'Active task',
        description: `spec: ${feature.specPath}\nTask: T004@dddddddd`,
      },
      ...cases.map(({ id, metadata }) => ({
        id,
        type: 'task',
        status: 'blocked',
        title: rawDisclosure,
        description: `spec: ${feature.specPath}\nTask: T005@eeeeeeee\n${metadata}`,
      })),
    ];

    // Act
    const result = await readNowProjection({ root, target: 'blocker-orientation' }, {
      runBd: async () => ({ status: 0, stdout: JSON.stringify(list), stderr: '' }),
    });

    // Assert
    assertComplete(result);
    assert.deepEqual(
      result.blockers.map(({ classification, reason, source }) => ({ classification, reason, source })),
      cases.toSorted((left, right) => left.id.localeCompare(right.id)).map(({ id, classification, reason }) => ({
        classification,
        reason,
        source: { kind: 'tracked', issueId: id, title: rawDisclosure },
      })),
    );
    for (const blocker of result.blockers) {
      assert.doesNotMatch(
        blocker.reason,
        /\bT\d{3,}@[a-z0-9]{8}\b|\[(?: |~|!|x)\]|\bsha256:[a-f0-9]{64}\b/i,
        'primary orientation must not expose raw workflow notation',
      );
      assert.doesNotMatch(
        blocker.reason,
        /\bDefinition\s+Only\b|\bLightweight(?:\s+Execution)?\b|\bTracked(?:\s+Execution)?\b/,
        'primary orientation must not expose raw internal lane names',
      );
      assert.doesNotMatch(
        blocker.reason,
        /\b(?:task task|content identity content identity|canonical task work Execution|tracked board work Execution)\b/,
        'orientation must not contain replacement artifacts',
      );
    }
    assert.ok(
      result.blockers.every((blocker) => blocker.source.title === rawDisclosure),
      'the exact tracker title remains available only in source disclosure',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a final tracked query failure is unavailable rather than a read conflict', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    const feature = define(root, '001', 'final-query');
    const list = [{
      id: 'active',
      type: 'task',
      status: 'in_progress',
      title: 'Active task',
      description: `spec: ${feature.specPath}\nTask: T001@aaaaaaaa`,
    }];
    let listCalls = 0;

    // Act
    const result = await readNowProjection({ root, target: 'final-query' }, {
      runBd: async (args) => {
        if (args[0] === 'list') {
          listCalls += 1;
          if (listCalls === 2) return { status: 1, stdout: '', stderr: '/private/final-list' };
        }
        return { status: 0, stdout: JSON.stringify(list), stderr: '' };
      },
    });

    // Assert
    assert.equal(result.complete, false);
    assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
      'TRACKED_AUTHORITY_UNAVAILABLE',
    ]);
    assert.doesNotMatch(JSON.stringify(result), /PROJECTION_READ_CONFLICT|private\/final-list|Error:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('event projection accepts only canonical UTC dates, retains Coordinator activity, and orders latest events', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'event-order');
    const originalIdea = fs.readFileSync(path.join(root, feature.ideaPath), 'utf8');
    const writeCoordinatorLog = (entries) => write(
      root,
      feature.ideaPath,
      `${originalIdea}\n## Coordinator Log\n\n${entries.map((entry) => `- ${entry}`).join('\n')}\n`,
    );
    const coordinatorEntries = [
      '2026-02-28 - Coordinator date-only',
      '2024-02-29 UTC - Coordinator leap-day UTC',
      '2026-03-01T12:00:00Z - Coordinator ISO first at noon',
      '2026-03-01T12:00:00Z - Coordinator ISO later document entry',
      '2026-00-01 - ignored invalid month',
      '2026-04-31 UTC - ignored invalid calendar day',
      '2025-02-29 - ignored invalid leap day',
      '2026-03-01T12:00:00+00:00 - ignored offset timestamp',
      '2026-03-01T12:00:00 - ignored local timestamp',
      '2026-03-01T12:00:00z - ignored lowercase UTC designator',
      '2026-03-01t12:00:00Z - ignored lowercase timestamp separator',
      '2026-03-01 utc - ignored lowercase UTC suffix',
      'this prose mentions 2026-03-01 UTC - ignored date-like prose',
    ];
    writeCoordinatorLog(coordinatorEntries);
    write(
      root,
      feature.specPath,
      [
        '# Event order',
        '',
        '## Revision Log',
        '',
        '- 2026-03-01 - Revision date-only at midnight',
        '- 2026-02-30 - ignored Revision invalid calendar day',
        '',
      ].join('\n'),
    );
    const bd = installBdCommand(root);

    // Act
    const {
      coordinatorWins,
      revisionWins,
      isoCoordinatorTie,
      dateOnlyCoordinatorTie,
    } = await bd.run(async () => {
      const initial = await readNowProjection({ root, target: 'event-order' });

      write(
        root,
        feature.specPath,
        '# Event order\n\n## Revision Log\n\n- 2026-03-01T12:00:01Z - Revision genuinely later\n',
      );
      const laterRevision = await readNowProjection({ root, target: 'event-order' });

      writeCoordinatorLog(['2026-03-02T00:00:00Z - Coordinator ISO midnight tie']);
      write(
        root,
        feature.specPath,
        '# Event order\n\n## Revision Log\n\n- 2026-03-02 - Revision date-only midnight tie\n',
      );
      const revisionTieAgainstIso = await readNowProjection({ root, target: 'event-order' });

      writeCoordinatorLog(['2026-03-03 - Coordinator date-only midnight tie']);
      write(
        root,
        feature.specPath,
        '# Event order\n\n## Revision Log\n\n- 2026-03-03T00:00:00Z - Revision ISO midnight tie\n',
      );
      const revisionTieAgainstDateOnly = await readNowProjection({ root, target: 'event-order' });

      return {
        coordinatorWins: initial,
        revisionWins: laterRevision,
        isoCoordinatorTie: revisionTieAgainstIso,
        dateOnlyCoordinatorTie: revisionTieAgainstDateOnly,
      };
    });

    // Assert
    assertComplete(coordinatorWins);
    assert.deepEqual(coordinatorWins.activity, {
      total: 4,
      recent: [
        { date: '2026-03-01T12:00:00Z', text: 'Coordinator ISO later document entry' },
        { date: '2026-03-01T12:00:00Z', text: 'Coordinator ISO first at noon' },
        { date: '2024-02-29 UTC', text: 'Coordinator leap-day UTC' },
        { date: '2026-02-28', text: 'Coordinator date-only' },
      ],
    });
    assert.deepEqual(coordinatorWins.latestEvent, {
      date: '2026-03-01T12:00:00Z',
      text: 'Coordinator ISO later document entry',
      source: { path: feature.ideaPath, section: 'Coordinator Log' },
    });
    assert.deepEqual(
      coordinatorWins.sources
        .filter((source) => source.details?.section)
        .map((source) => ({ path: source.path, details: source.details })),
      [
        {
          path: feature.ideaPath,
          details: {
            section: 'Coordinator Log',
            eventCount: 4,
            recentEvents: coordinatorWins.activity.recent,
          },
        },
        {
          path: feature.specPath,
          details: {
            section: 'Revision Log',
            eventCount: 1,
            recentEvents: [{ date: '2026-03-01', text: 'Revision date-only at midnight' }],
          },
        },
      ],
    );
    assert.doesNotMatch(
      JSON.stringify(coordinatorWins),
      /ignored invalid|ignored offset|ignored local|ignored lowercase|ignored date-like/,
    );
    assert.deepEqual(Object.keys(coordinatorWins.latestEvent).sort(), ['date', 'source', 'text']);
    assert.doesNotMatch(JSON.stringify(coordinatorWins), /"(?:instant|order)"/);

    assert.deepEqual(revisionWins.latestEvent, {
      date: '2026-03-01T12:00:01Z',
      text: 'Revision genuinely later',
      source: { path: feature.specPath, section: 'Revision Log' },
    });
    assert.deepEqual(isoCoordinatorTie.latestEvent, {
      date: '2026-03-02',
      text: 'Revision date-only midnight tie',
      source: { path: feature.specPath, section: 'Revision Log' },
    });
    assert.deepEqual(dateOnlyCoordinatorTie.latestEvent, {
      date: '2026-03-03T00:00:00Z',
      text: 'Revision ISO midnight tie',
      source: { path: feature.specPath, section: 'Revision Log' },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('current repository projection makes the newest Coordinator execution entry the latest event without writing .dude', async () => {
  // Arrange
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const before = contentSnapshot(path.join(root, '.dude'));
  const bd = installBdCommand(root);

  // Act
  const result = await bd.run(() => readNowProjection({ root, target: 'dude-canvas-ui' }));

  // Assert
  assertComplete(result);
  assert.deepEqual(result.latestEvent?.source, {
    path: '.dude/ideas/052-dude-canvas-ui.md',
    section: 'Coordinator Log',
  });
  assert.match(result.latestEvent?.date ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(result.latestEvent?.date, result.activity?.recent[0]?.date);
  assert.equal(result.latestEvent?.text, result.activity?.recent[0]?.text);
  assert.deepEqual(contentSnapshot(path.join(root, '.dude')), before, 'current repository projection must not write .dude');
});
