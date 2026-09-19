// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
 *   stderr?: string,
 *   exitCode?: number,
 *   sequence?: Array<{output?: unknown, stderr?: string, exitCode?: number}>,
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
    'process.stderr.write(response.stderr ?? "");',
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

/** @param {unknown} value */
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), 'every published discovery object must be immutable');
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

/** @template T @param {() => Promise<T>} operation */
async function observeReadPaths(operation) {
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
}

// The existing injectable command boundary keeps discovery-only fixtures away
// from the host's actual Beads database.
const emptyTrackedBoard = {
  runBd: async () => ({ status: 0, stdout: '[]', stderr: '' }),
};

/** @param {string} body */
function managed(body) {
  return `<!-- dude:managed:start -->\n${body}\n<!-- dude:managed:end -->\n`;
}

/** @param {any} projection */
function assertComplete(projection) {
  assert.equal(projection.complete, true);
  assert.match(projection.readAt, /^\d{4}-\d{2}-\d{2}T.+Z$/);
  assert.equal(projection.attemptedAt, null);
  assert.ok(Array.isArray(projection.choices), 'every complete projection supplies a navigation inventory');
  for (const choice of projection.choices) {
    assert.deepEqual(
      Object.keys(choice).sort(),
      ['ideaPath', 'slug', 'specPath'],
      'navigation choices expose only the public identity triple',
    );
    assert.equal(typeof choice.ideaPath, 'string');
    assert.equal(typeof choice.slug, 'string');
    assert.ok(choice.specPath === null || typeof choice.specPath === 'string');
  }
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
    assertComplete(exactSlug);
    assertComplete(exactPath);
    assert.equal(exactSlug.selected?.ideaPath, beta.ideaPath);
    assert.equal(exactPath.selected?.ideaPath, alpha.ideaPath);
    assert.deepEqual(
      exactSlug.choices,
      exactPath.choices,
      'exact selections expose the same source-ordered navigation inventory',
    );
    assert.equal(ambiguous.status, 'choose');
    assert.deepEqual(ambiguous.choices?.map((choice) => choice.ideaPath), [
      beta.ideaPath,
      alpha.ideaPath,
    ], 'multiple candidates retain source order rather than mtime, lifecycle number, filename, task, or log order');
    assertComplete(ambiguous);
    assertComplete(single);
    assert.equal(single.status, 'ok');
    assert.equal(single.selected?.ideaPath, lone);
    assert.equal(single.selected?.explicit, false);
    assert.equal(single.authority, 'definition');
    assert.equal(single.stage, 'Idea');
    assert.equal(single.nextReason, 'This feature is still an idea.');
    assert.equal(single.tasks, null);
    assert.deepEqual(single.taskDetails, {
      coverage: { state: 'not-applicable', reason: 'This idea has no task definitions.' },
      items: null,
      resultCoverage: 'not-exposed',
    });
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
    assert.deepEqual(result.taskDetails, {
      coverage: { state: 'not-applicable', reason: 'This idea has no task definitions.' },
      items: null,
      resultCoverage: 'not-exposed',
    });
    assert.equal(result.unansweredQuestions, 0);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.choices, [], 'resolved ideas are not navigation choices');
    assert.equal(bd.calls, null, 'resolved lifecycle must finish before a tracked query');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 blank non-Git and Git workspaces with missing or empty discovery directories create no artifacts', async (t) => {
  for (const layout of ['non-git', 'git', 'empty-ideas', 'empty-specs', 'both-empty']) {
    await t.test(layout, async () => {
      // Arrange
      const root = temporaryRoot();
      try {
        if (layout === 'git') execFileSync('git', ['init', '--quiet', root], { stdio: 'pipe' });
        if (['empty-ideas', 'both-empty'].includes(layout)) {
          fs.mkdirSync(path.join(root, '.dude/ideas'), { recursive: true });
        }
        if (['empty-specs', 'both-empty'].includes(layout)) {
          fs.mkdirSync(path.join(root, '.dude/specs'), { recursive: true });
        }
        const before = contentSnapshot(root);
        let trackedCalls = 0;
        const options = { runBd: async () => {
          trackedCalls += 1;
          throw new Error('blank discovery must not query tracked authority');
        } };

        // Act
        const result = await readNowProjection({ root }, options);
        const freshness = await checkProjectionFreshness({ root, projection: result }, options);
        const refreshed = await refreshNowProjection({ root, previous: result }, options);

        // Assert
        assertComplete(result);
        assert.equal(result.workspace, 'blank');
        assert.equal(result.status, 'choose');
        assert.deepEqual(result.choices, []);
        assert.deepEqual(result.contexts, []);
        assert.deepEqual(result.diagnostics, []);
        assert.deepEqual(result.attention, []);
        for (const field of ['selected', 'authority', 'stage', 'next', 'nextReason', 'tasks', 'unansweredQuestions']) {
          assert.equal(result[field], null, field);
        }
        assert.deepEqual(result.blockers, []);
        assert.deepEqual(result.coverage.inventory, {
          state: 'current', ideas: 0, readable: 0, packages: 0, diagnostics: [],
        });
        assert.equal(result.coverage.selected.state, 'not-selected');
        assert.equal(result.coverage.live.state, 'unavailable', 'blank disk inventory is not a live all-clear');
        assert.ok(result.coverage.live.reason);
        assert.equal(freshness.state, 'current');
        assert.equal(refreshed.replaced, true);
        assert.equal(refreshed.projection.workspace, 'blank');
        assert.equal(refreshed.freshness.state, 'current');
        assertSafeReadAction(result);
        assertDeepFrozen(result);
        assert.equal(trackedCalls, 0);
        assert.deepEqual(contentSnapshot(root), before, 'reads must not create Git, .dude, ideas, packages, or state');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('T003 malformed unrelated ledger preserves healthy explicit selection and qualifies inventory coverage', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    define(root, '001', 'valid');
    write(root, '.dude/ideas/002-malformed.md', 'not frontmatter\n');
    const bd = installBdCommand(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'valid' }));

    // Assert
    assertComplete(result);
    assert.equal(result.status, 'ok');
    assert.equal(result.selected?.slug, 'valid');
    assert.equal(result.authority, 'definition');
    assert.equal(result.stage, 'Defined');
    assert.equal(result.next, null);
    assert.equal(result.nextReason, 'No canonical task execution evidence exists yet.');
    assert.deepEqual(result.blockers, []);
    assert.equal(result.unansweredQuestions, 0);
    assert.equal(result.coverage.inventory.state, 'partial');
    assert.equal(result.coverage.selected.state, 'current');
    assert.equal(result.contexts[0].coverage.state, 'current');
    assert.equal(result.coverage.live.state, 'unavailable');
    assert.equal(initialProjectionFreshness(result).state, 'stale');
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
    assert.deepEqual(bd.callSequence, [BD_LIST_CALL, BD_LIST_CALL], 'healthy selected authority is still read and verified');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 discovers all 50 drafts alongside defined and resolved contexts without package reads or inferred priority', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    const drafts = Array.from({ length: 50 }, (_, index) => {
      const number = String(index + 1).padStart(3, '0');
      return draft(root, number, `draft-${number}`);
    });
    const feature = define(root, '051', 'active', { tasks: '- [~] T001@aaaaaaaa Active task\n' });
    const finished = resolved(root, '052', 'finished');
    const deferredPath = drafts[22];
    const disposition = 'Owner deferred this intent until an explicit revisit. It is not resolved.';
    write(root, deferredPath, fs.readFileSync(path.join(root, deferredPath), 'utf8')
      + managed(`## Definition Disposition\n\n${disposition}`));
    const recent = new Date('2030-01-01T00:00:00Z');
    fs.utimesSync(path.join(root, drafts[0]), recent, recent);
    const before = contentSnapshot(root);

    // Act
    const chooser = await observeReadPaths(() => readNowProjection({ root }, emptyTrackedBoard));
    const first = await readNowProjection({ root, target: 'draft-001' }, emptyTrackedBoard);
    const last = await readNowProjection({ root, target: drafts[49] }, emptyTrackedBoard);
    const selectedFeature = await readNowProjection({ root, target: 'active' }, emptyTrackedBoard);
    const queryOnly = await readNowProjection({ root, target: 'draft-0' }, emptyTrackedBoard);

    // Assert
    const result = chooser.result;
    assertComplete(result);
    assert.equal(result.workspace, 'populated');
    assert.equal(result.selected, null, 'neither recent mtime nor lifecycle number selects a context');
    assert.deepEqual(result.contexts.map((context) => context.ideaPath), [...drafts, feature.ideaPath, finished]);
    assert.deepEqual(result.choices.map((choice) => choice.ideaPath), [...drafts, feature.ideaPath]);
    assert.deepEqual(result.coverage.inventory, {
      state: 'current', ideas: 52, readable: 52, packages: 1, diagnostics: [],
    });
    for (const [index, context] of result.contexts.entries()) {
      assert.equal(context.kind, index === 50 ? 'feature' : 'idea');
      assert.equal(context.status, index === 50 ? 'defined' : index === 51 ? 'resolved' : 'draft');
      assert.equal(context.specPath, index === 50 ? feature.specPath : null);
      assert.equal(context.coverage.scope, 'idea-ledger', 'unselected package state is not claimed to be read');
      assert.equal(context.coverage.state, 'current');
      assert.equal(context.intent.source.path, context.ideaPath);
      assert.equal(context.intent.source.section, 'Idea');
      assert.equal(context.intent.truncated, false);
      assert.equal(context.intent.text, index === 51 ? 'finished resolved.' : `${context.slug} body.`);
      assert.equal(context.title, context.slug);
    }
    assert.equal(result.contexts[22].dispositions[0].text, disposition);
    assert.equal(result.contexts[22].dispositions[0].attribution, 'managed-source');
    assert.deepEqual(chooser.readPaths.filter((file) => file.startsWith(path.join(root, '.dude/specs/'))), []);
    assert.equal(first.selected?.ideaPath, drafts[0]);
    assert.equal(last.selected?.ideaPath, drafts[49]);
    assert.equal(selectedFeature.selected?.ideaPath, feature.ideaPath);
    assert.equal(selectedFeature.next?.description, 'Active task');
    for (const projection of [first, last, selectedFeature, queryOnly]) {
      assert.deepEqual(projection.contexts, result.contexts, 'selection and a partial query never filter the authoritative inventory');
      assert.deepEqual(projection.choices, result.choices);
    }
    assert.equal(queryOnly.selected, null, 'a query prefix is not an exact selector');
    assert.equal(queryOnly.complete, false);
    assert.ok(queryOnly.diagnostics.some((diagnostic) => diagnostic.code === 'FEATURE_IDEA_NOT_FOUND'));
    assert.deepEqual(result.attention, []);
    assert.equal(result.coverage.live.state, 'unavailable');
    assertDeepFrozen(result);
    assert.throws(() => result.contexts.push({}), TypeError);
    assert.throws(() => { result.contexts[22].dispositions[0].text = 'reactivated'; }, TypeError);
    assert.throws(() => { result.coverage.inventory.readable = 0; }, TypeError);
    assert.deepEqual(contentSnapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 saved intent and source-backed deferral survive reread and a new process without request resurrection', async () => {
  // Arrange: canonical files represent already acknowledged owner capture.
  // The capture/acknowledgment transport itself belongs to T009.
  const root = temporaryRoot();
  try {
    const saved = draft(root, '001', 'saved-intent');
    const literalIntent = 'Keep my <layout> & spacing.\n\nA second paragraph.';
    const blankQuestion = '1. Which layout?\n   Answer:';
    const disposition = 'Q1: owner defers this choice until the user explicitly revisits it; not fulfilled.';
    const original = fs.readFileSync(path.join(root, saved), 'utf8')
      .replace('saved-intent body.', literalIntent).replace('None.', blankQuestion)
      + managed(`## Definition Disposition\n\n${disposition}`)
      + '\n## Coordinator Log\n\n- 2026-09-01 - Owner acknowledged brainstorm capture and deferral.\n'
      + '- 2026-09-02 - Historical approval: yes. Reviewer failed; ordinary debugging continues.\n';
    write(root, saved, original);
    const before = contentSnapshot(root);

    // Act
    const first = await readNowProjection({ root, target: 'saved-intent' }, emptyTrackedBoard);
    const refreshed = await refreshNowProjection({ root, target: 'saved-intent', previous: first }, emptyTrackedBoard);
    const moduleUrl = new URL('./lib/projection.mjs', import.meta.url).href;
    const restarted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { readNowProjection } = await import(${JSON.stringify(moduleUrl)});
      const projection = await readNowProjection(
        { root: ${JSON.stringify(root)}, target: 'saved-intent' },
        { runBd: async () => ({ status: 0, stdout: '[]', stderr: '' }) },
      );
      process.stdout.write(JSON.stringify(projection));
    `], { encoding: 'utf8' }));

    // Assert
    for (const projection of [first, refreshed.projection, restarted]) {
      assertComplete(projection);
      assert.equal(projection.contexts.length, 1, 'deferral reuses its owner, not a duplicate ledger');
      const [context] = projection.contexts;
      assert.equal(context.ideaPath, saved);
      assert.equal(context.status, 'draft', 'no invented deferred lifecycle or automatic definition');
      assert.equal(context.specPath, null);
      assert.equal(context.intent.text, literalIntent);
      assert.deepEqual(context.dispositions, [{
        text: disposition, truncated: false, attribution: 'managed-source',
        source: { path: saved, section: 'Definition Disposition' },
      }]);
      assert.equal(projection.unansweredQuestions, 1, 'the preserved legacy orientation count is not a request');
      assert.deepEqual(projection.attention, [], 'blank answers, history, approval and reviewer failure do not create attention requests');
      assert.equal(projection.next, null);
      assert.equal(projection.coverage.live.state, 'unavailable', 'disk cannot restore a pending invocation');
    }
    assert.equal(refreshed.replaced, true);
    assert.deepEqual(contentSnapshot(root), before);

    // Act: an outside answer is observed, not written or accepted by Canvas.
    write(root, saved, original.replace('   Answer:', '   Answer: Keep the two-column layout.'));
    const outsideBytes = contentSnapshot(root);
    const changed = await checkProjectionFreshness({ root, projection: first }, emptyTrackedBoard);
    const reread = await refreshNowProjection({ root, target: 'saved-intent', previous: first }, emptyTrackedBoard);

    // Assert
    assert.equal(changed.state, 'changed');
    assert.equal(reread.replaced, true);
    assert.equal(reread.projection.unansweredQuestions, 0);
    assert.deepEqual(reread.projection.contexts, first.contexts, 'an answer edit alone neither reactivates nor settles attributed deferral');
    assert.deepEqual(reread.projection.attention, []);
    assert.equal(reread.projection.coverage.live.state, 'unavailable');
    assert.deepEqual(contentSnapshot(root), outsideBytes, 'external answer bytes remain untouched');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 disposition discovery distinguishes absent, hidden, ambiguous and malformed source sections', async (t) => {
  const fixtures = [
    { name: 'absent', suffix: '', state: 'current' },
    { name: 'outside managed region', suffix: '## Definition Disposition\n\nDeferred.', state: 'partial', code: 'PROJECTION_DISPOSITION_UNVERIFIED' },
    {
      name: 'duplicate section',
      suffix: managed('## Definition Disposition\n\nDeferred.\n\n## Definition Disposition\n\nResolved.'),
      state: 'partial', code: 'PROJECTION_DISPOSITION_UNVERIFIED',
    },
    {
      name: 'code-hidden section and markers',
      suffix: `\`\`\`md\n${managed('## Definition Disposition\n\nHidden approval.')}\`\`\`\n`,
      state: 'current',
    },
    {
      name: 'comment-hidden section and markers',
      suffix: `<!--\n${managed('## Definition Disposition\n\nHidden approval.')}-->\n`,
      state: 'current',
    },
    {
      name: 'unclosed managed region',
      suffix: '<!-- dude:managed:start -->\n## Definition Disposition\n\nDeferred.',
      state: 'partial', code: 'PROJECTION_MANAGED_REGION_MALFORMED',
    },
    {
      name: 'misordered managed markers',
      suffix: '<!-- dude:managed:end -->\n## Definition Disposition\n\nDeferred.\n<!-- dude:managed:start -->',
      state: 'partial', code: 'PROJECTION_MANAGED_REGION_MALFORMED',
    },
    {
      name: 'nested managed regions',
      suffix: managed(managed('## Definition Disposition\n\nDeferred.')),
      state: 'partial', code: 'PROJECTION_MANAGED_REGION_MALFORMED',
    },
    {
      name: 'unbalanced Markdown fence',
      suffix: '```md\n## Definition Disposition\n\nUnclosed example.',
      state: 'partial', code: 'PROJECTION_IDEA_SECTIONS_MALFORMED',
    },
    {
      name: 'empty declared disposition',
      suffix: managed('## Definition Disposition\n\n'),
      state: 'partial',
    },
  ];
  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      // Arrange
      const root = temporaryRoot();
      try {
        const ideaPath = draft(root, '001', 'source');
        write(root, ideaPath, fs.readFileSync(path.join(root, ideaPath), 'utf8') + fixture.suffix);
        const before = contentSnapshot(root);

        // Act
        const result = await readNowProjection({ root, target: 'source' }, emptyTrackedBoard);

        // Assert
        assertComplete(result);
        const [context] = result.contexts;
        assert.equal(context.coverage.state, fixture.state);
        assert.equal(result.coverage.inventory.state, fixture.state);
        assert.deepEqual(context.dispositions.filter((entry) => entry.text.trim()), [], 'no unverifiable disposition becomes owner evidence');
        if (fixture.code) {
          assert.ok(context.coverage.diagnostics.some((diagnostic) => (
            diagnostic.code === fixture.code && diagnostic.path === ideaPath
          )));
        }
        if (fixture.state === 'partial') {
          assert.ok(context.coverage.diagnostics.length > 0, 'uncertainty needs a source-backed explanation');
          assert.equal(initialProjectionFreshness(result).state, 'stale');
        } else {
          assert.deepEqual(context.coverage.diagnostics, []);
          assert.equal(initialProjectionFreshness(result).state, 'current');
        }
        assert.equal(result.coverage.live.state, 'unavailable');
        assert.equal(result.next, null);
        assertDeepFrozen(result);
        assert.deepEqual(contentSnapshot(root), before);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('T003 multiple ordered managed regions follow canonical grammar and retain both attributed dispositions', async () => {
  // Arrange: dude-lint permits start/end/start/end; the single-active-region
  // constraint on automatic definition repair is not the discovery grammar.
  const root = temporaryRoot();
  try {
    const ideaPath = draft(root, '001', 'multi-region');
    write(root, ideaPath, fs.readFileSync(path.join(root, ideaPath), 'utf8')
      + managed('## Definition Disposition\n\nQ1 is deferred by the owner.')
      + '\nUser-authored text between regions.\n\n'
      + managed('## Re-definition Disposition\n\nQ2 uses the stated assumption, not a user answer.'));

    // Act
    const result = await readNowProjection({ root, target: 'multi-region' }, emptyTrackedBoard);

    // Assert
    assertComplete(result);
    assert.deepEqual(result.contexts[0].coverage.diagnostics, [], 'ordered balanced regions are valid canonical ledgers');
    assert.equal(result.contexts[0].coverage.state, 'current');
    assert.deepEqual(result.contexts[0].dispositions, [
      {
        text: 'Q1 is deferred by the owner.', truncated: false, attribution: 'managed-source',
        source: { path: ideaPath, section: 'Definition Disposition' },
      },
      {
        text: 'Q2 uses the stated assumption, not a user answer.', truncated: false, attribution: 'managed-source',
        source: { path: ideaPath, section: 'Re-definition Disposition' },
      },
    ]);
    assert.equal(result.coverage.inventory.state, 'current');
    assert.deepEqual(result.attention, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 bounded excerpts disclose truncation and preserve the full source identity', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    const ideaPath = draft(root, '001', 'long-source');
    const intent = 'Keep α & <literal> formatting.\n\n'.repeat(60);
    const disposition = 'Owner deferred this question; this is source prose, not a request.\n'.repeat(90);
    write(root, ideaPath, fs.readFileSync(path.join(root, ideaPath), 'utf8')
      .replace('long-source body.', intent.trim())
      + managed(`## Definition Disposition\n\n${disposition.trim()}`));
    const before = contentSnapshot(root);

    // Act
    const result = await readNowProjection({ root, target: 'long-source' }, emptyTrackedBoard);

    // Assert
    assertComplete(result);
    const [context] = result.contexts;
    assert.deepEqual(context.intent, {
      text: intent.trim().slice(0, 1200), truncated: true, source: { path: ideaPath, section: 'Idea' },
    });
    assert.deepEqual(context.dispositions, [{
      text: disposition.trim().slice(0, 4000), truncated: true, attribution: 'managed-source',
      source: { path: ideaPath, section: 'Definition Disposition' },
    }]);
    assert.equal(context.coverage.state, 'current', 'an explicitly bounded excerpt is not a failed source read');
    assert.equal(result.sources.filter((source) => source.path === ideaPath).length, 1);
    assert.deepEqual(contentSnapshot(root), before);

    // Act: change content beyond the displayed excerpt, preserving the excerpt.
    write(root, ideaPath, fs.readFileSync(path.join(root, ideaPath), 'utf8').replace(
      '<!-- dude:managed:end -->', 'Owner retained an additional source detail.\n<!-- dude:managed:end -->',
    ));
    const freshness = await checkProjectionFreshness({ root, projection: result }, emptyTrackedBoard);

    // Assert
    assert.equal(freshness.state, 'changed', 'freshness hashes full source bytes, not just displayed excerpts');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 incomplete inventory never auto-selects a sole healthy candidate or claims a live all-clear', async () => {
  // Arrange
  const root = temporaryRoot();
  const unreadableRoot = temporaryRoot();
  try {
    const healthy = draft(root, '001', 'healthy');
    const malformedPath = '.dude/ideas/002-malformed.md';
    write(root, malformedPath, 'not frontmatter\n');
    write(unreadableRoot, malformedPath, 'not frontmatter\n');
    const before = contentSnapshot(root);

    // Act
    const chooser = await readNowProjection({ root }, emptyTrackedBoard);
    const selected = await readNowProjection({ root, target: healthy }, emptyTrackedBoard);
    const checked = await checkProjectionFreshness({ root, projection: selected }, emptyTrackedBoard);
    const refreshed = await refreshNowProjection({ root, target: healthy, previous: selected }, emptyTrackedBoard);
    const unknown = await readNowProjection({ root: unreadableRoot }, emptyTrackedBoard);

    // Assert
    assertComplete(chooser);
    assert.equal(chooser.status, 'choose');
    assert.equal(chooser.selected, null);
    assert.deepEqual(chooser.choices.map((choice) => choice.ideaPath), [healthy]);
    assert.equal(chooser.coverage.selected.state, 'not-selected');
    assert.equal(chooser.coverage.inventory.state, 'partial');
    assert.equal(chooser.coverage.inventory.ideas, 1, 'malformed ledgers are diagnosed, not counted as authoritative identities');
    assert.equal(chooser.coverage.inventory.readable, 1);
    assert.ok(chooser.coverage.inventory.diagnostics.some((diagnostic) => diagnostic.path === malformedPath));
    assert.equal(chooser.contexts[0].coverage.state, 'current');
    assertComplete(selected);
    assert.equal(selected.selected?.ideaPath, healthy);
    assert.equal(selected.coverage.selected.state, 'current');
    assert.equal(checked.state, 'stale', 'unchanged incomplete coverage cannot become current merely by checking hashes');
    assert.equal(refreshed.replaced, true, 'a usable partial inventory may refresh');
    assert.equal(refreshed.freshness.state, 'stale', 'adopting that snapshot must preserve the coverage qualification');
    assert.equal(unknown.workspace, 'unknown', 'a malformed-only workspace is not blank');
    assert.equal(unknown.complete, false);
    assert.equal(unknown.coverage.inventory.state, 'unavailable');
    assert.equal(unknown.coverage.inventory.readable, 0);
    assertSafeReadAction(unknown);
    for (const result of [chooser, selected, refreshed.projection, unknown]) {
      assert.equal(result.coverage.live.state, 'unavailable');
      assert.ok(result.coverage.live.reason);
      assertDeepFrozen(result);
    }
    assert.deepEqual(contentSnapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(unreadableRoot, { recursive: true, force: true });
  }
});

test('T003 selected task failures stay scoped and leave other contexts discoverable and selectable', async (t) => {
  for (const failure of ['malformed', 'missing']) {
    await t.test(failure, async () => {
      // Arrange
      const root = temporaryRoot();
      try {
        const broken = define(root, '001', 'broken', { tasks: '- [z] T001@aaaaaaaa Invalid task\n' });
        if (failure === 'missing') fs.rmSync(path.join(root, broken.tasksPath));
        const healthy = define(root, '002', 'healthy', { tasks: '- [~] T002@bbbbbbbb Continue healthy work\n' });
        const ideaPath = draft(root, '003', 'draft');
        const before = contentSnapshot(root);

        // Act
        const failed = await readNowProjection({ root, target: 'broken' }, emptyTrackedBoard);
        const selected = await observeReadPaths(() => readNowProjection({ root, target: 'healthy' }, emptyTrackedBoard));

        // Assert
        assert.equal(failed.complete, false);
        assert.equal(failed.authority, null);
        assert.equal(failed.next, null);
        assert.equal(failed.coverage.selected.state, 'unavailable');
        assert.equal(failed.coverage.selected.ideaPath, broken.ideaPath, 'failed selected state must retain its exact scope');
        assert.ok(failed.coverage.selected.diagnostics.some((diagnostic) => (
          diagnostic.path === broken.tasksPath
          && diagnostic.code === (failure === 'missing' ? 'PROJECTION_INPUT_MISSING' : 'TASKS_MALFORMED')
        )));
        assert.deepEqual(failed.contexts.map((context) => context.ideaPath), [broken.ideaPath, healthy.ideaPath, ideaPath]);
        assert.equal(failed.contexts.find((context) => context.ideaPath === healthy.ideaPath).coverage.state, 'current');
        assert.equal(failed.contexts.find((context) => context.ideaPath === ideaPath).coverage.state, 'current');
        assert.equal(failed.coverage.inventory.state, 'current', 'task failure does not make the ledger inventory unreadable');
        assert.equal(failed.coverage.live.state, 'unavailable');
        assertDeepFrozen(failed);
        assertComplete(selected.result);
        assert.equal(selected.result.coverage.selected.ideaPath, healthy.ideaPath);
        assert.equal(selected.result.next?.description, 'Continue healthy work');
        assert.deepEqual(selected.result.blockers, []);
        assert.deepEqual(selected.result.attention, []);
        assert.deepEqual(selected.readPaths.filter((file) => [broken.tasksPath, broken.specPath]
          .some((relative) => path.resolve(root, relative) === file)), [], 'selection must not read the failed bystander package');
        assert.deepEqual(contentSnapshot(root), before);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('T003 unselected ledger drift is scoped even during final asynchronous authority verification', async (t) => {
  for (const mutationCall of [1, 2]) {
    await t.test(`drift on tracked capture ${mutationCall}`, async () => {
      // Arrange
      const root = temporaryRoot();
      try {
        const selected = define(root, '001', 'selected', { tasks: '- [~] T001@aaaaaaaa Keep working\n' });
        const other = draft(root, '002', 'other');
        const original = fs.readFileSync(path.join(root, other), 'utf8')
          + managed('## Definition Disposition\n\nOwner deferred this intent.');
        write(root, other, original);
        const fixedTime = new Date('2000-01-01T00:00:00Z');
        fs.utimesSync(path.join(root, other), fixedTime, fixedTime);
        let calls = 0;
        const runBd = async () => {
          calls += 1;
          if (calls === mutationCall) {
            write(root, other, original.replace('deferred', 'retained'));
            fs.utimesSync(path.join(root, other), fixedTime, fixedTime);
          }
          return { status: 0, stdout: '[]', stderr: '' };
        };

        // Act
        const result = await readNowProjection({ root, target: 'selected' }, { runBd });
        const freshness = await checkProjectionFreshness({ root, projection: result }, emptyTrackedBoard);
        const refreshed = await refreshNowProjection({ root, target: 'selected', previous: result }, emptyTrackedBoard);

        // Assert
        assert.equal(calls, 2, 'mutation occurs at a real awaited L1 or L2 command boundary');
        assert.equal(fs.statSync(path.join(root, other)).mtime.getTime(), fixedTime.getTime());
        assertComplete(result);
        assert.equal(result.selected?.ideaPath, selected.ideaPath);
        assert.equal(result.next?.description, 'Keep working');
        assert.equal(result.coverage.selected.state, 'current');
        assert.equal(result.contexts.find((context) => context.ideaPath === selected.ideaPath).coverage.state, 'current');
        assert.equal(result.contexts.find((context) => context.ideaPath === other).coverage.state, 'stale');
        assert.equal(result.coverage.inventory.state, 'partial', 'a changed unselected excerpt cannot be published as current');
        assert.ok(result.coverage.inventory.diagnostics.some((diagnostic) => (
          diagnostic.code === 'PROJECTION_READ_CONFLICT' && diagnostic.path === other
        )));
        assert.equal(initialProjectionFreshness(result).state, 'stale');
        assert.equal(freshness.state, 'changed');
        assert.equal(refreshed.replaced, true);
        assert.equal(refreshed.freshness.state, 'current');
        assert.equal(refreshed.projection.contexts.find((context) => context.ideaPath === other)
          .dispositions[0].text, 'Owner retained this intent.');
        assert.equal(result.coverage.live.state, 'unavailable');
        assertDeepFrozen(result);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('T003 unselected source-only edits invalidate chooser freshness without loading package documents', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    draft(root, '001', 'first');
    const other = define(root, '002', 'other');
    const previous = await readNowProjection({ root }, emptyTrackedBoard);
    const fixedTime = new Date('2000-01-01T00:00:00Z');
    fs.utimesSync(path.join(root, other.ideaPath), fixedTime, fixedTime);
    write(root, other.ideaPath, fs.readFileSync(path.join(root, other.ideaPath), 'utf8').replace('other body.', 'Edited intent.'));
    fs.utimesSync(path.join(root, other.ideaPath), fixedTime, fixedTime);

    // Act
    const checked = await observeReadPaths(() => checkProjectionFreshness({ root, projection: previous }, emptyTrackedBoard));
    const refreshed = await refreshNowProjection({ root, previous }, emptyTrackedBoard);

    // Assert
    assertComplete(previous);
    assert.equal(previous.selected, null);
    assert.equal(checked.result.state, 'changed');
    assert.deepEqual(checked.readPaths.filter((file) => file.startsWith(path.join(root, '.dude/specs/'))), []);
    assert.equal(refreshed.replaced, true);
    assert.equal(refreshed.projection.selected, null);
    assert.deepEqual(refreshed.projection.choices, previous.choices);
    assert.equal(refreshed.projection.contexts[1].intent.text, 'Edited intent.');
    assert.equal(previous.contexts[1].intent.text, 'other body.', 'the prior immutable snapshot is not patched in place');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 a new draft published during final authority read rejects mixed inventory and preserves the prior snapshot', async () => {
  // Arrange
  const root = temporaryRoot();
  try {
    define(root, '001', 'selected', { tasks: '- [~] T001@aaaaaaaa Existing work\n' });
    const retained = draft(root, '002', 'retained');
    const previous = await readNowProjection({ root, target: 'selected' }, emptyTrackedBoard);
    let calls = 0;
    const runBd = async () => {
      calls += 1;
      if (calls === 2) draft(root, '003', 'newly-published');
      return { status: 0, stdout: '[]', stderr: '' };
    };

    // Act
    const refreshed = await refreshNowProjection({ root, target: 'selected', previous }, { runBd });
    const reread = await readNowProjection({ root, target: 'selected' }, emptyTrackedBoard);

    // Assert
    assert.equal(calls, 2);
    assert.equal(refreshed.replaced, false);
    assert.equal(refreshed.projection, previous);
    assert.equal(refreshed.freshness.state, 'conflict');
    assert.ok(refreshed.freshness.diagnostics.some((diagnostic) => diagnostic.code === 'PROJECTION_READ_CONFLICT'));
    assert.equal(previous.contexts.length, 2);
    assert.equal(previous.contexts[1].ideaPath, retained);
    assertComplete(reread);
    assert.equal(reread.contexts.length, 3);
    assert.equal(reread.selected?.slug, 'selected', 'publication does not retarget an explicit selection');
    assert.equal(reread.coverage.inventory.state, 'current');
    assert.equal(reread.coverage.live.state, 'unavailable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('all-open owned package exposes planned rows under Definition authority and writes nothing', async () => {
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
    assert.deepEqual(result.tasks, {
      total: 1,
      open: 1,
      inProgress: 0,
      blocked: 0,
      done: 0,
    });
    assert.deepEqual(result.phases, [{
      name: 'Work',
      total: 1,
      open: 1,
      inProgress: 0,
      blocked: 0,
      done: 0,
      state: 'upcoming',
    }]);
    assert.deepEqual(result.taskDetails, {
      coverage: { state: 'available', reason: null },
      items: [{
        taskKey: 'T001@aaaaaaaa',
        title: 'First task',
        state: 'todo',
        phase: null,
        source: {
          kind: 'file',
          path: feature.tasksPath,
          contentIdentity: result.sources.find(({ path: sourcePath }) => sourcePath === feature.tasksPath)?.contentIdentity,
        },
        instruction: {
          coverage: 'full-unit',
          text: '- [ ] T001@aaaaaaaa First task\n',
        },
        deps: null,
        blockedBy: null,
        readiness: { state: 'ready', basis: 'recorded-deps' },
      }],
      resultCoverage: 'not-exposed',
    });
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

test('T003 selected task descriptors retain exact visible units and exclude derived or terminal task lookalikes', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '062', 'task-detail-boundary');
    const firstUnit = [
      '- [x] T001@aaaaaaaa Completed prerequisite',
      '',
      'First paragraph keeps Unicode café — 東京.',
      '',
      'Acceptance:',
      '  - preserve blank paragraphs and source punctuation',
      '',
      '<!--',
      '## Comment-hidden heading must stay inert',
      '- [!] T900@hidden00 Comment-hidden task lookalike',
      '-->',
      '',
      '```html',
      '<script>globalThis.__t003SourceExecuted = true</script>',
      '- [ ] T901@fenced01 Fenced task lookalike',
      '```',
      '',
    ].join('\r\n');
    const secondUnit = [
      '- [~] T002@bbbbbbbb Current task with complete source',
      '    deps: T001@aaaaaaaa',
      '',
      'Second body paragraph after metadata and a blank line.',
      '',
    ].join('\r\n');
    const thirdUnit = [
      '- [ ] T003@cccccccc Ready delivery task',
      '    deps: T001@aaaaaaaa',
      '',
      'Delivery detail does not absorb discovered or archived material.',
      '',
    ].join('\r\n');
    const source = [
      '# Tasks',
      '',
      '<!-- dude:board:start -->',
      '### Blocked',
      '- T999@board999 Derived board row',
      '<!-- dude:board:end -->',
      '',
      '## Phase 1: Foundation',
      firstUnit.slice(0, -2),
      '## Phase 2: Delivery',
      secondUnit.slice(0, -2),
      thirdUnit.slice(0, -2),
      '## Discovered During Execution',
      '',
      'A discovered note mentions T004@052t004x but is not a canonical task.',
      '',
      '## Lightweight Execution History',
      '- [x] T004@052t004x Archived 052 task must not become current detail',
      '',
    ].join('\r\n');
    write(root, feature.tasksPath, Buffer.from(source));
    const bd = installBdCommand(root);
    const before = contentSnapshot(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: 'task-detail-boundary' }));

    // Assert
    assertComplete(result);
    assert.equal(result.authority, 'lightweight');
    assert.equal(result.stage, 'In progress');
    assert.deepEqual(result.tasks, {
      total: 3,
      open: 1,
      inProgress: 1,
      blocked: 0,
      done: 1,
    });
    assert.deepEqual(result.phases, [{
      name: 'Foundation',
      total: 1,
      open: 0,
      inProgress: 0,
      blocked: 0,
      done: 1,
      state: 'done',
    }, {
      name: 'Delivery',
      total: 2,
      open: 1,
      inProgress: 1,
      blocked: 0,
      done: 0,
      state: 'current',
    }]);
    assert.deepEqual(result.next, {
      description: 'Current task with complete source',
      source: {
        kind: 'file',
        path: feature.tasksPath,
        taskKey: 'T002@bbbbbbbb',
        description: 'Current task with complete source',
      },
    });
    assert.deepEqual(
      result.taskDetails.items.map(({ taskKey, title, state, phase, deps, readiness }) => (
        { taskKey, title, state, phase, deps, readiness }
      )),
      [{
        taskKey: 'T001@aaaaaaaa',
        title: 'Completed prerequisite',
        state: 'done',
        phase: { heading: 'Phase 1: Foundation', order: 0 },
        deps: null,
        readiness: { state: 'not-applicable', basis: null },
      }, {
        taskKey: 'T002@bbbbbbbb',
        title: 'Current task with complete source',
        state: 'in-progress',
        phase: { heading: 'Phase 2: Delivery', order: 1 },
        deps: ['T001@aaaaaaaa'],
        readiness: { state: 'not-applicable', basis: null },
      }, {
        taskKey: 'T003@cccccccc',
        title: 'Ready delivery task',
        state: 'todo',
        phase: { heading: 'Phase 2: Delivery', order: 1 },
        deps: ['T001@aaaaaaaa'],
        readiness: { state: 'ready', basis: 'recorded-deps' },
      }],
    );
    assert.deepEqual(result.taskDetails.coverage, { state: 'available', reason: null });
    assert.equal(result.taskDetails.resultCoverage, 'not-exposed');
    assert.equal(result.taskDetails.items[0].instruction.coverage, 'full-unit');
    assert.equal(result.taskDetails.items[0].instruction.text, firstUnit);
    assert.equal(result.taskDetails.items[1].instruction.text, secondUnit);
    assert.equal(result.taskDetails.items[2].instruction.text, thirdUnit);
    assert.match(result.taskDetails.items[0].instruction.text, /<script>globalThis\.__t003SourceExecuted/);
    assert.match(result.taskDetails.items[0].instruction.text, /T901@fenced01/);
    assert.match(result.taskDetails.items[0].instruction.text, /T900@hidden00/);
    assert.doesNotMatch(JSON.stringify(result.taskDetails), /T999@board999|Archived 052 task|Discovered During Execution/);
    assert.deepEqual(
      result.sources.at(-1)?.details?.phases,
      [
        { heading: 'Phase 1: Foundation', taskKeys: ['T001@aaaaaaaa'] },
        { heading: 'Phase 2: Delivery', taskKeys: ['T002@bbbbbbbb', 'T003@cccccccc'] },
      ],
      'phase membership and task rows are reduced from the same captured task bytes',
    );
    assert.deepEqual(contentSnapshot(root), before, 'selected detail is a read-only projection');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 discovered canonical-looking rows make detail unavailable instead of mixing a mirror with definitions', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '062', 'discovered-ambiguity', {
      tasks: [
        '## Phase 1: Canonical',
        '- [~] T001@aaaaaaaa Current canonical task',
        '',
        '## Discovered During Execution',
        '- [ ] T004@dddddddd Mirror-shaped discovered task',
        '',
      ].join('\n'),
    });
    const bd = installBdCommand(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: feature.ideaPath }));

    // Assert
    assertComplete(result);
    assert.deepEqual(result.tasks, {
      total: 2,
      open: 1,
      inProgress: 1,
      blocked: 0,
      done: 0,
    }, 'independently published totals are not silently rewritten');
    assert.equal(result.taskDetails.coverage.state, 'unavailable');
    assert.match(result.taskDetails.coverage.reason, /discovered mirror rows/i);
    assert.equal(result.taskDetails.items, null);
    assert.equal(result.taskDetails.resultCoverage, 'not-exposed');
    assert.doesNotMatch(JSON.stringify(result.taskDetails), /Mirror-shaped discovered task/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('canonical no-database output is equivalent to empty tracked authority across freshness and refresh', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '001', 'no-database', {
      tasks: '- [~] T001@aaaaaaaa Current lightweight task\n',
    });
    const successfulEmptyBd = installBdCommand(root);
    const successfulEmpty = await successfulEmptyBd.run(() => (
      readNowProjection({ root, target: 'no-database' })
    ));
    const successfulEmptyIdentity = successfulEmpty.sources.find((source) => (
      source.kind === 'tracked' && source.command === 'bd list --all --limit 0 --json'
    ))?.contentIdentity;
    const stderrVariants = [
      [
        'LF',
        "Error: no beads database found\nHint: Run 'bd init' to initialize a database here.\n",
      ],
      [
        'CRLF with leading blank lines',
        "\r\n \t\r\nError: no beads database found\r\nHint: Run 'bd init' to initialize a database here.\r\n",
      ],
    ];

    // Act / Assert
    assertComplete(successfulEmpty);
    assert.equal(successfulEmpty.status, 'ok');
    assert.equal(successfulEmpty.selected?.ideaPath, feature.ideaPath);
    assert.equal(successfulEmpty.authority, 'lightweight');
    assert.equal(successfulEmpty.next?.description, 'Current lightweight task');
    assert.deepEqual(successfulEmpty.diagnostics, []);
    assert.match(successfulEmptyIdentity ?? '', /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(successfulEmptyBd.callSequence, [BD_LIST_CALL, BD_LIST_CALL]);

    for (const [label, stderr] of stderrVariants) {
      const noDatabaseBd = installBdCommand(root, [], 0, {
        [BD_LIST_CALL.join(' ')]: { output: '', stderr, exitCode: 1 },
      });
      const { freshness, refreshed } = await noDatabaseBd.run(async () => ({
        freshness: await checkProjectionFreshness({ root, projection: successfulEmpty }),
        refreshed: await refreshNowProjection({
          root,
          target: 'no-database',
          previous: successfulEmpty,
        }),
      }));
      const projection = refreshed.projection;
      const trackedIdentity = projection.sources.find((source) => (
        source.kind === 'tracked' && source.command === 'bd list --all --limit 0 --json'
      ))?.contentIdentity;

      assert.equal(freshness.state, 'current', label);
      assert.equal(refreshed.replaced, true, label);
      assert.equal(refreshed.freshness.state, 'current', label);
      assertComplete(projection);
      assert.equal(projection.status, 'ok', label);
      assert.equal(projection.selected?.ideaPath, feature.ideaPath, label);
      assert.equal(projection.authority, successfulEmpty.authority, label);
      assert.equal(projection.next?.description, successfulEmpty.next?.description, label);
      assert.deepEqual(projection.tasks, successfulEmpty.tasks, label);
      assert.equal(trackedIdentity, successfulEmptyIdentity, label);
      assert.deepEqual(projection.diagnostics, [], label);
      assert.doesNotMatch(JSON.stringify(projection), /no beads database found|Hint:/i, label);
      assert.deepEqual(
        noDatabaseBd.callSequence,
        [BD_LIST_CALL, BD_LIST_CALL, BD_LIST_CALL],
        `${label}: freshness and refresh must never probe bd ready`,
      );
    }
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
    assertComplete(absent);
    assertComplete(noneReady);
    assert.equal(absent.selected?.ideaPath, beta.ideaPath);
    assert.equal(absent.authority, 'tracked');
    assert.equal(absent.next, null);
    assert.equal(absent.stage, 'Defined');
    assert.equal(absent.tasks, null);
    assert.deepEqual(absent.phases, []);
    assert.equal(absent.taskDetails.coverage.state, 'unavailable');
    assert.match(absent.taskDetails.coverage.reason, /no exact issue/i);
    assert.equal(absent.taskDetails.items, null);
    assert.equal(absent.taskDetails.resultCoverage, 'not-exposed');
    assert.deepEqual(absent.blockers, []);
    assert.match(absent.nextReason, /no exact issue/i);
    assert.deepEqual(
      absent.choices.map((choice) => ({ ...choice })),
      [
        { ideaPath: alpha.ideaPath, slug: 'alpha', specPath: alpha.specPath },
        { ideaPath: beta.ideaPath, slug: 'beta', specPath: beta.specPath },
      ],
      'selected B exposes navigation identity only, without tracked A execution facts',
    );
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
    assert.deepEqual(
      noneReady.taskDetails.items.map(({ taskKey, issueId, state, readiness }) => (
        { taskKey, issueId, state, readiness }
      )),
      [{
        taskKey: 'T002@bbbbbbbb',
        issueId: 'beta-open',
        state: 'todo',
        readiness: { state: 'ready', basis: 'beads-ready' },
      }, {
        taskKey: 'T001@aaaaaaaa',
        issueId: 'beta-task',
        state: 'blocked',
        readiness: { state: 'not-applicable', basis: null },
      }],
    );
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
    const open = {
      id: 'open-task',
      type: 'task',
      status: 'open',
      title: 'Open task without an acquired ready result',
      description: `spec: ${feature.specPath}\nTask: T002@bbbbbbbb`,
    };
    const bd = installBdCommand(root, [active, open], 0, commandResponses({
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
    assert.deepEqual(result.taskDetails.items.map(({ taskKey, issueId, readiness }) => ({
      taskKey, issueId, readiness,
    })), [{
      taskKey: 'T001@aaaaaaaa',
      issueId: 'active-task',
      readiness: { state: 'not-applicable', basis: null },
    }, {
      taskKey: 'T002@bbbbbbbb',
      issueId: 'open-task',
      readiness: { state: 'not-exposed', basis: null },
    }], 'an active branch does not manufacture readiness for another open issue');
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

test('T003 tracked task detail uses only visible explicit carriers and already captured board facts', async () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const feature = define(root, '061', 'tracked-task-detail', {
      tasks: '- [~] T001@aaaaaaaa Markdown body backfill is forbidden.\n',
    });
    const readyDescription = [
      `spec: ${feature.specPath}`,
      'Task: T001@aaaaaaaa Imported ready task',
      'Deps: T099@zzzzzzzz',
      '',
      'Literal imported body.',
      '```text',
      'Task: T900@fenced01 hidden fenced carrier',
      '```',
      '<!-- Task: T901@comment1 hidden comment carrier -->',
    ].join('\n');
    const blockedDescription = [
      `spec: ${feature.specPath}`,
      'Task: T002@bbbbbbbb',
      'Blocked-by: external-dependency: waiting for fixture service',
    ].join('\n');
    const issues = [{
      id: '01-ready',
      type: 'task',
      status: 'open',
      title: 'Imported ready task',
      description: readyDescription,
      acceptance_criteria: 'Retain imported acceptance literally.',
      design: 'No phase is exposed by this issue.',
      notes: 'No task result is inferred.',
    }, {
      id: '02-blocked',
      type: 'task',
      status: 'blocked',
      title: 'Imported blocked task',
      description: blockedDescription,
    }, {
      id: '03-done',
      type: 'task',
      status: 'closed',
      title: 'Imported completed task',
      description: `spec: ${feature.specPath}\nTask: T003@cccccccc`,
    }, {
      id: '00-epic',
      type: 'epic',
      status: 'in_progress',
      title: 'Feature carrier is not a task row',
      description: `spec: ${feature.specPath}\nTask: T999@epic0000`,
    }, {
      id: 'second-line',
      type: 'task',
      status: 'in_progress',
      title: 'Second-line specification is not selected work',
      description: `not an exact first line\nspec: ${feature.specPath}\nTask: T998@second00`,
    }];
    const ready = [{
      ...issues[0],
    }, {
      id: 'foreign-ready',
      type: 'task',
      status: 'open',
      title: 'Foreign readiness must not leak',
      description: 'spec: .dude/specs/999-foreign/spec.md\nTask: T999@foreign0',
    }];
    const bd = installBdCommand(root, issues, 0, commandResponses({ ready }));
    const before = contentSnapshot(root);

    // Act
    const result = await bd.run(() => readNowProjection({ root, target: feature.ideaPath }));

    // Assert
    assertComplete(result);
    assert.equal(result.authority, 'tracked');
    assert.deepEqual(result.tasks, {
      total: 3,
      open: 1,
      inProgress: 0,
      blocked: 1,
      done: 1,
    });
    assert.deepEqual(result.taskDetails.coverage, { state: 'available', reason: null });
    assert.equal(result.taskDetails.resultCoverage, 'not-exposed');
    assert.deepEqual(result.taskDetails.items.map((task) => ({
      taskKey: task.taskKey,
      issueId: task.issueId,
      title: task.title,
      state: task.state,
      phase: task.phase,
      deps: task.deps,
      blockedBy: task.blockedBy,
      readiness: task.readiness,
      coverage: task.instruction.coverage,
    })), [{
      taskKey: 'T001@aaaaaaaa',
      issueId: '01-ready',
      title: 'Imported ready task',
      state: 'todo',
      phase: null,
      deps: ['T099@zzzzzzzz'],
      blockedBy: null,
      readiness: { state: 'ready', basis: 'beads-ready' },
      coverage: 'imported-description',
    }, {
      taskKey: 'T002@bbbbbbbb',
      issueId: '02-blocked',
      title: 'Imported blocked task',
      state: 'blocked',
      phase: null,
      deps: null,
      blockedBy: 'external-dependency: waiting for fixture service',
      readiness: { state: 'not-applicable', basis: null },
      coverage: 'imported-description',
    }, {
      taskKey: 'T003@cccccccc',
      issueId: '03-done',
      title: 'Imported completed task',
      state: 'done',
      phase: null,
      deps: null,
      blockedBy: null,
      readiness: { state: 'not-applicable', basis: null },
      coverage: 'imported-description',
    }]);
    assert.equal(result.taskDetails.items[0].instruction.text, readyDescription,
      'hidden carrier text stays literal in the imported description without supplying identity');
    assert.deepEqual(result.taskDetails.items[0].instruction.extraText, {
      acceptance_criteria: 'Retain imported acceptance literally.',
      design: 'No phase is exposed by this issue.',
      notes: 'No task result is inferred.',
    });
    assert.deepEqual(result.next?.source, {
      kind: 'tracked',
      issueId: '01-ready',
      title: 'Imported ready task',
    });
    assert.deepEqual(bd.callSequence, [
      BD_LIST_CALL,
      BD_READY_CALL,
      BD_LIST_CALL,
      BD_READY_CALL,
    ], 'task detail adds no bd show, history, or per-row query');
    assert.doesNotMatch(JSON.stringify(result), /Markdown body backfill is forbidden|Feature carrier is not a task row|Second-line specification is not selected work|Foreign readiness must not leak/);
    assert.deepEqual(contentSnapshot(root), before, 'tracked inspection does not backfill or mutate markdown');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 tracked task detail rejects missing, duplicate, hidden-only, and ambiguous carrier identity', async (t) => {
  const scenarios = [{
    name: 'missing explicit carrier',
    issues: (specPath) => [{
      id: 'active',
      type: 'task',
      status: 'in_progress',
      title: 'Dependency mention is not identity',
      description: `spec: ${specPath}\nDepends on T001@aaaaaaaa`,
    }],
  }, {
    name: 'hidden-only carrier',
    issues: (specPath) => [{
      id: 'active',
      type: 'task',
      status: 'in_progress',
      title: 'Hidden carrier is not identity',
      description: `spec: ${specPath}\n\`\`\`text\nTask: T001@aaaaaaaa\n\`\`\``,
    }],
  }, {
    name: 'two visible carriers on one issue',
    issues: (specPath) => [{
      id: 'active',
      type: 'task',
      status: 'in_progress',
      title: 'Duplicate carrier lines',
      description: `spec: ${specPath}\nTask: T001@aaaaaaaa\nTask: T002@bbbbbbbb`,
    }],
  }, {
    name: 'duplicate task key across issues',
    issues: (specPath) => [{
      id: 'active',
      type: 'task',
      status: 'in_progress',
      title: 'First key owner',
      description: `spec: ${specPath}\nTask: T001@aaaaaaaa`,
    }, {
      id: 'done',
      type: 'task',
      status: 'closed',
      title: 'Second key owner',
      description: `spec: ${specPath}\nTask: T001@aaaaaaaa`,
    }],
  }, {
    name: 'duplicate issue identity',
    issues: (specPath) => [{
      id: 'same-id',
      type: 'task',
      status: 'in_progress',
      title: 'First issue',
      description: `spec: ${specPath}\nTask: T001@aaaaaaaa`,
    }, {
      id: 'same-id',
      type: 'task',
      status: 'closed',
      title: 'Second issue',
      description: `spec: ${specPath}\nTask: T002@bbbbbbbb`,
    }],
  }, {
    name: 'conflicting id aliases',
    issues: (specPath) => [{
      id: 'id-a',
      issue_id: 'id-b',
      type: 'task',
      status: 'in_progress',
      title: 'Conflicting identity aliases',
      description: `spec: ${specPath}\nTask: T001@aaaaaaaa`,
    }],
  }];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const root = temporaryRoot();
      try {
        // Arrange
        const feature = define(root, '061', `tracked-${scenario.name.replaceAll(' ', '-')}`, {
          tasks: '- [~] T001@aaaaaaaa Markdown backfill forbidden.\n',
        });
        const issues = scenario.issues(feature.specPath);
        const bd = installBdCommand(root, issues);

        // Act
        const result = await bd.run(() => readNowProjection({ root, target: feature.ideaPath }));

        // Assert
        assertComplete(result);
        assert.equal(result.authority, 'tracked');
        assert.equal(result.taskDetails.coverage.state, 'unavailable');
        assert.match(result.taskDetails.coverage.reason, /explicit Task: key|visible imported task metadata/i);
        assert.equal(result.taskDetails.items, null);
        assert.equal(result.taskDetails.resultCoverage, 'not-exposed');
        assert.deepEqual(bd.callSequence, [BD_LIST_CALL, BD_LIST_CALL],
          'an active tracked branch performs only its existing complete-list capture and verification');
        assert.doesNotMatch(JSON.stringify(result), /Markdown backfill forbidden/);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
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

test('affected ownership fails closed for duplicate owners and identity mismatch while an unrelated orphan permits draft discovery', async () => {
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
    assertComplete(noOwner);
    assert.equal(noOwner.status, 'ok', 'an unrelated orphan package does not disable explicit draft discovery');
    assert.equal(noOwner.selected?.slug, 'draft');
    assert.equal(noOwner.authority, 'definition');
    assert.equal(noOwner.coverage.inventory.state, 'partial');
    assert.equal(noOwner.coverage.selected.state, 'current');
    assert.ok(noOwner.diagnostics.some((item) => item.code === 'FEATURE_OWNER_NOT_FOUND'));
    assert.equal(duplicate.status, 'unavailable');
    assert.ok(duplicate.diagnostics.some((item) => item.code === 'FEATURE_OWNER_DUPLICATE'));
    assert.equal(mismatch.status, 'unavailable');
    assert.ok(mismatch.diagnostics.some((item) => item.code === 'FEATURE_OWNER_IDENTITY_MISMATCH'));
    for (const result of [duplicate, mismatch]) {
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
      assert.equal(result.taskDetails.coverage.state, 'unavailable');
      assert.equal(result.taskDetails.items, null);
      assert.equal(result.taskDetails.resultCoverage, 'not-exposed');
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
    assert.deepEqual(mixedRead.choices, [], 'a failed final inventory identity check withholds navigation choices');
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
    assert.deepEqual(mixedRead.choices, [], 'a failed final omitted-selection identity check withholds navigation choices');

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
    assert.equal(exact.result.choices.length, 41, 'complete exact selections retain the bounded navigation inventory');
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
        4,
        'chooser captures and verifies ledger content as well as both lifecycle summaries',
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
    ['./lib/needs-you.mjs', '../../../.github/extensions/dude/lib/needs-you.mjs'],
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
  const noDatabaseStderr = "Error: no beads database found\nHint: Run 'bd init' to initialize a database here.\n";
  const scenarios = [
    ['list nonzero', 'list', { status: 1, stdout: '[]', stderr: '/private/list-error' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database with stdout', 'list', { status: 1, stdout: '[]', stderr: noDatabaseStderr }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database altered case', 'list', { status: 1, stdout: '', stderr: noDatabaseStderr.replace('Error:', 'error:') }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database altered message', 'list', { status: 1, stdout: '', stderr: noDatabaseStderr.replace('database found', 'database is available') }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database prefixed', 'list', { status: 1, stdout: '', stderr: `bd: ${noDatabaseStderr}` }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database suffixed', 'list', { status: 1, stdout: '', stderr: noDatabaseStderr.replace('found\n', 'found here\n') }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database with error', 'list', { error: new Error('acquisition failed'), status: null, stdout: '', stderr: noDatabaseStderr }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database with signal', 'list', { status: 1, stdout: '', stderr: noDatabaseStderr, signal: 'SIGTERM' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list no-database with timeout', 'list', { status: 1, stdout: '', stderr: noDatabaseStderr, timeout: true }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list malformed', 'list', { status: 0, stdout: '{', stderr: '' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['list overflow', 'list', { status: 0, stdout: overflow, stderr: '' }, 'TRACKED_AUTHORITY_UNAVAILABLE', null],
    ['ready nonzero', 'ready', { status: 1, stdout: '[]', stderr: '/private/ready-error' }, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
    ['ready no-database', 'ready', { status: 1, stdout: '', stderr: noDatabaseStderr }, 'TRACKED_READINESS_UNAVAILABLE', 'tracked'],
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

test('T003 reviewer regression: freshness detects unselected ledger drift during awaited Beads acquisition', async () => {
  // Arrange: /api/freshness calls this same exported reader. No projection
  // construction or refresh occurs after the baseline snapshot.
  const root = temporaryRoot();
  try {
    define(root, '001', 'selected', { tasks: '- [~] T001@aaaaaaaa Continue selected work\n' });
    const other = define(root, '002', 'other');
    const original = fs.readFileSync(path.join(root, other.ideaPath), 'utf8')
      + managed('## Definition Disposition\n\nOwner deferred this intent.');
    write(root, other.ideaPath, original);
    const fixedTime = new Date('2000-01-01T00:00:00Z');
    fs.utimesSync(path.join(root, other.ideaPath), fixedTime, fixedTime);
    const projection = await readNowProjection({ root, target: 'selected' }, emptyTrackedBoard);
    assertComplete(projection);
    assert.equal(initialProjectionFreshness(projection).state, 'current');
    const before = contentSnapshot(root);
    const acquisition = deferred();
    const entered = deferred();
    const calls = [];

    // Act: edit only unselected source prose while the unchanged tracked
    // authority acquisition is pending, keeping metadata and mtime unchanged.
    const pending = observeReadPaths(() => checkProjectionFreshness({ root, projection }, {
      runBd: async (args) => {
        calls.push(args);
        entered.resolve();
        return acquisition.promise;
      },
    }));
    await entered.promise;
    const edited = original.replace('other body.', 'Updated unselected intent.')
      .replace('Owner deferred this intent.', 'Owner retained this intent for a later explicit revisit.');
    write(root, other.ideaPath, edited);
    fs.utimesSync(path.join(root, other.ideaPath), fixedTime, fixedTime);
    acquisition.resolve({ status: 0, stdout: '[]', stderr: '' });
    const checked = await pending;

    // Assert
    assert.deepEqual(calls, [BD_LIST_CALL], 'the race occurs in the freshness acquisition, not a new projection read');
    assert.equal(fs.statSync(path.join(root, other.ideaPath)).mtime.getTime(), fixedTime.getTime());
    assert.deepEqual(checked.readPaths.filter((file) => [other.specPath, other.tasksPath]
      .some((relative) => path.resolve(root, relative) === file)), [], 'freshness must not load unselected package documents');
    assert.equal(projection.contexts.find((context) => context.ideaPath === other.ideaPath).intent.text, 'other body.');
    assertDeepFrozen(projection);
    assert.deepEqual(contentSnapshot(root), before.map((entry) => (
      entry[0] === other.ideaPath ? [entry[0], entry[1], edited] : entry
    )), 'freshness must leave all source bytes untouched');
    assert.equal(checked.result.state, 'changed', 'a source changed during the awaited check; current is a false freshness claim');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T003 reviewer regression: visible disposition headings use established whitespace and boundary grammar', async (t) => {
  // Canonical headings allow 0–3 leading spaces and one or more spaces/tabs
  // after ##: dude-lint realLedgerHeadings and publish-first-definition's
  // LEVEL_TWO_HEADING/extractProtectedSections. These are visible headings,
  // not new Markdown constructs or headings hidden inside examples.
  const fixtures = [
    {
      name: 'double-spaced disposition heading',
      body: '##  Definition Disposition\n\nOwner deferred this choice.',
      expected: ['Owner deferred this choice.'],
      state: 'current',
    },
    {
      name: 'normal and double-spaced conflicting duplicate',
      body: '## Definition Disposition\n\nOwner deferred this choice.\n\n##  Definition Disposition\n\nOwner resolved this choice.',
      expected: [],
      state: 'partial',
    },
    {
      name: 'indented level-two boundary excludes following context',
      body: '## Definition Disposition\n\nOwner deferred this choice.\n\n  ## Review Notes\n\nThis later text is not a disposition.',
      expected: ['Owner deferred this choice.'],
      state: 'current',
    },
  ];
  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      // Arrange
      const root = temporaryRoot();
      try {
        const ideaPath = draft(root, '001', 'whitespace');
        write(root, ideaPath, fs.readFileSync(path.join(root, ideaPath), 'utf8') + managed(fixture.body));
        const before = contentSnapshot(root);

        // Act
        const result = await readNowProjection({ root, target: 'whitespace' }, emptyTrackedBoard);

        // Assert
        assertComplete(result);
        const [context] = result.contexts;
        assert.equal(result.coverage.live.state, 'unavailable');
        assert.deepEqual(contentSnapshot(root), before);
        assert.deepEqual(context.dispositions.map((entry) => entry.text), fixture.expected,
          'canonical heading whitespace must not hide a disposition, hide a duplicate, or extend its attribution');
        assert.equal(context.coverage.state, fixture.state);
        assert.equal(result.coverage.inventory.state, fixture.state);
        if (fixture.state === 'partial') {
          assert.ok(context.coverage.diagnostics.some((diagnostic) => (
            diagnostic.code === 'PROJECTION_DISPOSITION_UNVERIFIED' && diagnostic.path === ideaPath
          )), 'conflicting canonical headings require scoped uncertainty');
        } else {
          assert.deepEqual(context.coverage.diagnostics, []);
          assert.deepEqual(context.dispositions[0].source, { path: ideaPath, section: 'Definition Disposition' });
          assert.equal(context.dispositions[0].attribution, 'managed-source');
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
