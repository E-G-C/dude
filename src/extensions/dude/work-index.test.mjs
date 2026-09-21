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
import { execFileSync } from 'node:child_process';
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

function optionalBeadsRoot() {
  // A real .beads in the Windows user profile also covers its usual temp
  // directory. Keep absence fixtures outside that inherited authority without
  // deleting it, changing permissions, or weakening ancestor discovery.
  const parent = process.platform === 'win32' && process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'Temp') : fs.realpathSync(os.tmpdir());
  return fs.mkdtempSync(path.join(parent, 'dude-work-index-066-'));
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

/**
 * Exercise the default execFile runner in a child with no command search path
 * or inherited tracking overrides. Never change the test host's environment,
 * and never substitute a .cmd shim for a real missing executable on Windows.
 * @param {string} root
 * @param {string} body
 * @param {{generated?:boolean, env?:Record<string,string>}} [options]
 */
function optionalBeadsChild(root, body, { generated = false, env = {} } = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(?:PATH$|BEADS_|GIT_)/i.test(key)));
  const moduleUrl = new URL(generated
    ? '../../../.github/extensions/dude/lib/projection.mjs'
    : './lib/projection.mjs', import.meta.url).href;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import path from 'node:path';
    import { execFile } from 'node:child_process';
    const root = ${JSON.stringify(root)};
    const reader = await import(${JSON.stringify(moduleUrl)});
    const missing = await new Promise(resolve => execFile('bd', ${JSON.stringify(BD_LIST)},
      { cwd: root, shell: false, timeout: 5000 }, error => resolve(error)));
    assert.equal(missing?.code, 'ENOENT', 'the real default executable must be missing');
    assert.equal(fs.lstatSync(root).isDirectory(), true, 'cwd must remain valid');
    ${body}
  `], {
    cwd: root,
    env: { ...inherited, PATH: root, ...env },
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  }));
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

/** Include empty directories and link targets as well as every file's bytes. */
function optionalBeadsSnapshot(root) {
  return {
    entries: fs.readdirSync(root, { recursive: true }).sort(),
    files: fileInventory(root).map(entry => ({
      ...entry,
      identity: entry.size < 0 ? fs.readlinkSync(path.join(root, entry.path))
        : sha256(fs.readFileSync(path.join(root, entry.path))),
    })),
  };
}

/** Standard linked-worktree metadata, without invoking or mutating Git. */
function optionalBeadsWorktree(parent, root) {
  const main = path.join(parent, 'main-parent', 'main');
  const gitDirectory = path.join(main, '.git', 'worktrees', 'linked');
  write(root, '.git', `gitdir: ${path.relative(root, gitDirectory)}\n`);
  write(gitDirectory, 'commondir', '../..\n');
  write(gitDirectory, 'gitdir', `${path.join(root, '.git')}\n`);
  return { main, gitDirectory };
}

/** @param {any} pair @param {{ideaPath:string}} owned */
function assertOptionalUnavailable(pair, owned) {
  assert.equal(pair.index.coverage.inventory.state, 'current');
  assert.equal(pair.index.coverage.work.state, 'partial');
  const row = pair.index.items.find(item => item.ideaPath === owned.ideaPath);
  assert.equal(row.lane, null);
  assert.equal(row.taskCounts, null);
  assert.equal(row.basis, 'not-established');
  assert.equal(row.availability.state, 'unavailable');
  assert.equal(pair.selected.complete, false);
  assert.equal(pair.selected.tasks, null);
  assert.equal(pair.selected.next, null);
  assert.equal(pair.selected.taskDetails.items, null);
  assert.deepEqual(pair.selected.diagnostics.map(({ code }) => code), ['TRACKED_AUTHORITY_UNAVAILABLE']);
}

test('066 optional-Beads real missing executable restores source and generated four-state reads without writes', async (t) => {
  const root = optionalBeadsRoot();
  try {
    const activeUnit = '- [~] T002@bbbbbbbb Continue recorded work.\n\nFull current instruction.\n\n';
    const owned = feature(root, '066', 'optional-beads', [
      '<!-- dude:board:start -->',
      '- [!] T900@board000 Derived task lookalike.',
      '<!-- dude:board:end -->',
      '',
      '## Phase 1: Work',
      '- [ ] T001@aaaaaaaa Start recorded work.',
      '',
      activeUnit.trimEnd(),
      '',
      '- [!] T003@cccccccc Waiting on a recorded blocker.',
      '    blocked-by: external-dependency: Waiting for fixture input.',
      '',
      '- [x] T004@dddddddd Completed recorded work.',
      '```md',
      '- [~] T901@fenced00 Hidden task lookalike.',
      '```',
      '<!-- - [!] T902@hidden00 Hidden task lookalike. -->',
      '',
      '## Lightweight Execution History',
      '- [x] T903@archive0 Archived task lookalike.',
      '',
    ].join('\n'));
    const expected = { total: 4, open: 1, inProgress: 1, blocked: 1, done: 1 };
    const before = optionalBeadsSnapshot(root);
    for (const generated of [false, true]) {
      await t.test(generated ? 'generated default runner' : 'source default runner', () => {
        const result = optionalBeadsChild(root, `
          const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
          const index = await reader.readWorkIndex({ root });
          const selected = await reader.readNowProjection(input);
          const freshness = await reader.checkProjectionFreshness({ root, projection: selected });
          const refreshed = await reader.refreshNowProjection({ ...input, previous: selected });
          // A distinctly injected control disproves invalid canonical input as
          // the reason for the missing-executable regression.
          const injectedEmptyControl = await reader.readNowProjection(input, {
            runBd: () => ({ status: 0, stdout: '[]', stderr: '' }),
          });
          console.log(JSON.stringify({ index, selected, freshness, refreshed, injectedEmptyControl }));
        `, { generated });
        t.diagnostic(`${generated ? 'generated' : 'source'}: real bd probe ENOENT in valid cwd; injected empty-list control complete=${result.injectedEmptyControl.complete}`);
        assert.equal(result.injectedEmptyControl.complete, true);
        assert.deepEqual(result.injectedEmptyControl.tasks, expected);
        const row = result.index.items.find(item => item.ideaPath === owned.ideaPath);
        assert.equal(result.index.coverage.inventory.state, 'current');
        assert.equal(result.index.coverage.work.state, 'current');
        assert.equal(row.specPath, owned.specPath);
        assert.equal(row.lane, 'lightweight');
        assert.equal(row.basis, 'canonical-lifecycle');
        assert.equal(row.group, 'blocked');
        assert.deepEqual(row.taskCounts, expected);
        assert.deepEqual(row.availability, { state: 'current', reason: null });
        const selected = result.selected;
        assert.equal(selected.complete, true);
        assert.equal(selected.status, 'ok');
        assert.equal(selected.authority, 'lightweight');
        assert.equal(selected.stage, 'Blocked');
        assert.deepEqual(selected.tasks, row.taskCounts);
        assert.equal(selected.taskDetails.coverage.state, 'available');
        assert.deepEqual(selected.taskDetails.items.map(task => task.taskKey),
          ['T001@aaaaaaaa', 'T002@bbbbbbbb', 'T003@cccccccc', 'T004@dddddddd']);
        assert.equal(selected.taskDetails.items[1].instruction.text, activeUnit);
        assert.equal(selected.next.source.taskKey, 'T002@bbbbbbbb');
        assert.equal(selected.next.description, 'Continue recorded work.');
        assert.equal(selected.blockers[0].classification, 'external-dependency');
        assert.equal(selected.blockers[0].reason, 'Waiting for fixture input.');
        assert.deepEqual(selected.diagnostics, []);
        assert.deepEqual(selected.attention, []);
        assert.deepEqual(result.index.coverage.work.diagnostics, []);
        assert.equal(result.freshness.state, 'current');
        assert.equal(result.refreshed.replaced, true);
        assert.equal(result.refreshed.freshness.state, 'current');
        assert.deepEqual(result.refreshed.projection.tasks, expected);
        const source = selected.sources.find(source => source.command === 'bd list --all --limit 0 --json');
        assert.equal(source.label, 'Optional tracker absence');
        assert.equal(source.role, 'authority-check');
        assert.notEqual(source.contentIdentity, result.injectedEmptyControl.sources
          .find(source => source.command === 'bd list --all --limit 0 --json').contentIdentity,
        'absence evidence must not claim a successful empty-board capture');
        assert.deepEqual(result.index.sources.find(candidate => candidate.command === source.command), source);
        assert.equal(row.sources.find(source => source.path === owned.tasksPath).contentIdentity,
          selected.taskDetails.items[0].source.contentIdentity);
        assert.deepEqual(optionalBeadsSnapshot(root), before, 'opening, selecting, freshness and refresh change no bytes or inventory');
      });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads injected empty and exact no-database controls preserve canonical lifecycle and source identity', async (t) => {
  const root = optionalBeadsRoot();
  try {
    const active = feature(root, '061', 'four-states', [
      '- [ ] T001@aaaaaaaa Open.',
      '- [~] T002@bbbbbbbb Active.',
      '- [!] T003@cccccccc Blocked.',
      '    blocked-by: external-dependency: Recorded wait.',
      '- [x] T004@dddddddd Done.',
      '',
    ].join('\n'));
    const planned = feature(root, '062', 'planned');
    const draft = idea(root, '063', 'draft');
    const resolved = idea(root, '064', 'resolved', 'resolved');
    const before = optionalBeadsSnapshot(root);
    for (const [label, reply] of [
      ['successful []', emptyBoard()],
      ['exact no database LF', { status: 1, stdout: '', stderr: "Error: no beads database found\nHint: Run 'bd init'.\n" }],
      ['exact no database CRLF', { status: 1, stdout: ' \r\n', stderr: '\r\n \t\r\nError: no beads database found\r\nHint: unused optional tool\r\n' }],
    ]) {
      await t.test(label, () => {
        const result = optionalBeadsChild(root, `
          const calls = [];
          const options = { runBd(args) { calls.push(args); return ${JSON.stringify(reply)}; } };
          const index = await reader.readWorkIndex({ root }, options);
          const selected = [];
          for (const target of ${JSON.stringify([active, planned, draft, resolved].map(item => item.ideaPath))}) {
            selected.push(await reader.readNowProjection({ root, target }, options));
          }
          const emptyControl = await reader.readNowProjection({ root, target: selected[0].selected.ideaPath },
            { runBd: () => ({ status: 0, stdout: '[]', stderr: '' }) });
          const freshness = await reader.checkProjectionFreshness({ root, projection: emptyControl }, options);
          const refreshed = await reader.refreshNowProjection({
            root, target: emptyControl.selected.ideaPath, previous: emptyControl,
          }, options);
          console.log(JSON.stringify({ index, selected, emptyControl, freshness, refreshed, calls }));
        `);
        assert.equal(result.index.coverage.work.state, 'current');
        for (let index = 0; index < result.selected.length; index += 1) {
          const selected = result.selected[index];
          const row = result.index.items.find(item => item.ideaPath === selected.selected.ideaPath);
          assert.equal(selected.complete, true);
          assert.equal(row.availability.state, 'current');
          assert.deepEqual(selected.tasks, row.taskCounts);
          assert.deepEqual(selected.diagnostics, []);
        }
        assert.deepEqual(result.selected[0].tasks, {
          total: 4, open: 1, inProgress: 1, blocked: 1, done: 1,
        });
        assert.equal(result.selected[0].authority, 'lightweight');
        assert.equal(result.selected[1].authority, 'definition');
        assert.equal(result.selected[1].stage, 'Defined');
        assert.equal(result.selected[1].next, null);
        assert.equal(result.index.items.find(item => item.ideaPath === planned.ideaPath).group, 'defined-awaiting-work');
        assert.equal(result.index.items.find(item => item.ideaPath === draft.ideaPath).group, 'awaiting-definition');
        assert.equal(result.index.items.find(item => item.ideaPath === resolved.ideaPath).group, 'completed');
        assert.equal(result.freshness.state, 'current');
        assert.equal(result.refreshed.replaced, true);
        assert.equal(result.refreshed.freshness.state, 'current');
        const authority = projection => projection.sources.find(source => source.command === 'bd list --all --limit 0 --json');
        assert.deepEqual(authority(result.selected[0]), authority(result.emptyControl));
        assert.ok(result.calls.every(args => JSON.stringify(args) === JSON.stringify(BD_LIST)));
        assert.deepEqual(optionalBeadsSnapshot(root), before);
      });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads local and linked absence must be safe while footprints and uncertainty forbid fallback', async (t) => {
  const layouts = [
    { name: 'non-Git root', available: true },
    { name: 'ordinary Git root', available: true, setup: (_parent, root) => write(root, '.git/HEAD', 'ref: refs/heads/main\n') },
    { name: 'nested ordinary Git root', available: true, setup: parent => write(parent, '.git/HEAD', 'ref: refs/heads/main\n') },
    { name: 'linked worktree', available: true, setup: optionalBeadsWorktree },
    { name: 'absolute linked pointer and CRLF metadata with native path equivalence', available: true, setup(parent, root) {
      const { gitDirectory } = optionalBeadsWorktree(parent, root);
      write(root, '.git', `gitdir: ${gitDirectory}\r\n`);
      write(gitDirectory, 'commondir', '../..\r\n');
      const backlink = path.join(root, '.git');
      write(gitDirectory, 'gitdir', `${process.platform === 'win32' ? backlink.toLowerCase() : backlink}\r\n`);
    } },
    { name: 'local .beads directory', setup: (_parent, root) => write(root, '.beads/config.yaml', 'fixture: true\n') },
    { name: 'local .beads file', setup: (_parent, root) => write(root, '.beads', 'footprint\n') },
    { name: 'ancestor .beads despite a local Git root', setup(parent, root) {
      write(parent, '.beads/config.yaml', 'fixture: true\n');
      write(root, '.git/HEAD', 'ref: refs/heads/main\n');
    } },
    { name: 'main worktree .beads', setup(parent, root) {
      const { main } = optionalBeadsWorktree(parent, root);
      write(main, '.beads/config.yaml', 'fixture: true\n');
    } },
    { name: 'main worktree ancestor .beads', setup(parent, root) {
      const { main } = optionalBeadsWorktree(parent, root);
      write(path.dirname(main), '.beads/config.yaml', 'fixture: true\n');
    } },
    { name: 'dangling .beads link', setup: (parent, root) => fs.symlinkSync(
      path.join(parent, 'missing-tracker'), path.join(root, '.beads'), process.platform === 'win32' ? 'junction' : 'dir',
    ) },
    { name: 'linked .git directory', setup(parent, root) {
      const external = path.join(parent, 'external-git');
      fs.mkdirSync(external);
      fs.symlinkSync(external, path.join(root, '.git'), process.platform === 'win32' ? 'junction' : 'dir');
    } },
    { name: 'malformed .git pointer', setup: (_parent, root) => write(root, '.git', 'not a gitdir pointer\n') },
    { name: 'unresolved .git pointer', setup: (_parent, root) => write(root, '.git', 'gitdir: ../missing/.git/worktrees/linked\n') },
    { name: 'network Git indirection', setup: (_parent, root) => write(root, '.git', 'gitdir: //fixture.invalid/share/main/.git/worktrees/linked\n') },
    { name: 'drive-relative Git indirection', setup: (_parent, root) => write(root, '.git', 'gitdir: C:main/.git/worktrees/linked\n') },
    { name: 'nonstandard Git common location', setup: (_parent, root) => write(root, '.git/commondir', '../external\n') },
    { name: 'conflicting linked commondir', setup(parent, root) {
      const { gitDirectory } = optionalBeadsWorktree(parent, root);
      write(gitDirectory, 'commondir', '../wrong-common-dir\n');
    } },
    { name: 'conflicting linked backlink', setup(parent, root) {
      const { gitDirectory } = optionalBeadsWorktree(parent, root);
      write(gitDirectory, 'gitdir', `${path.join(parent, 'another-worktree', '.git')}\n`);
    } },
    { name: 'wrong-type linked metadata', setup(parent, root) {
      const { gitDirectory } = optionalBeadsWorktree(parent, root);
      fs.rmSync(path.join(gitDirectory, 'commondir'));
      fs.mkdirSync(path.join(gitDirectory, 'commondir'));
    } },
    { name: 'oversized Git metadata', setup: (_parent, root) => write(root, '.git', Buffer.alloc(8 * 1024 * 1024 + 1, 'x')) },
    { name: 'injected unreadable footprint stat', fault: `
      const lstat = fs.lstatSync;
      fs.lstatSync = function(file, ...args) {
        if (path.resolve(String(file)) === path.join(root, '.beads')) throw Object.assign(new Error('private stat'), { code: 'EACCES' });
        return lstat.call(fs, file, ...args);
      };
    ` },
    { name: 'injected unreadable linked metadata', setup: optionalBeadsWorktree, fault: `
      const open = fs.openSync;
      fs.openSync = function(file, ...args) {
        if (String(file).endsWith('commondir')) throw Object.assign(new Error('private metadata'), { code: 'EACCES' });
        return open.call(fs, file, ...args);
      };
    ` },
  ];
  for (const layout of layouts) {
    await t.test(layout.name, () => {
      const parent = optionalBeadsRoot();
      const root = path.join(parent, 'workspace');
      try {
        fs.mkdirSync(root);
        const owned = feature(root, '066', 'authority-basis', '- [~] T001@aaaaaaaa Canonical instruction.\n');
        const draft = idea(root, '067', 'independent-draft');
        const resolved = idea(root, '068', 'independent-resolved', 'resolved');
        layout.setup?.(parent, root);
        const before = optionalBeadsSnapshot(parent);
        const result = optionalBeadsChild(root, `
          ${layout.fault ?? ''}
          const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
          const pair = async options => ({
            index: await reader.readWorkIndex({ root }, options),
            selected: await reader.readNowProjection(input, options),
          });
          const absent = await pair();
          const injectedNoDatabase = await pair({ runBd: () => ({
            status: 1, stdout: '', stderr: 'Error: no beads database found\\n',
          }) });
          const injectedEmpty = await pair({ runBd: () => ({ status: 0, stdout: '[]', stderr: '' }) });
          console.log(JSON.stringify({ absent, injectedNoDatabase, injectedEmpty }));
        `);
        for (const pair of [result.absent, result.injectedNoDatabase]) {
          if (layout.available) {
            assert.equal(pair.index.coverage.work.state, 'current');
            assert.equal(pair.selected.complete, true);
            assert.equal(pair.selected.authority, 'lightweight');
            assert.deepEqual(pair.selected.tasks, pair.index.items.find(item => item.ideaPath === owned.ideaPath).taskCounts);
            assert.equal(pair.selected.tasks.inProgress, 1);
            assert.deepEqual(pair.selected.diagnostics, []);
          } else {
            assertOptionalUnavailable(pair, owned);
            assert.doesNotMatch(JSON.stringify(pair), /Canonical instruction|private stat|private metadata|EACCES/);
          }
          assert.equal(pair.index.items.find(item => item.ideaPath === draft.ideaPath).availability.state, 'current');
          assert.equal(pair.index.items.find(item => item.ideaPath === resolved.ideaPath).group, 'completed');
          assert.equal(JSON.stringify(pair).includes(parent), false, 'no host locations escape in diagnostics');
        }
        assert.equal(result.injectedEmpty.selected.complete, true, 'a successful parsed [] still establishes an empty board');
        assert.equal(result.injectedEmpty.index.coverage.work.state, 'current');
        assert.equal(result.injectedEmpty.selected.authority, 'lightweight', 'a marker alone does not select the tracked lane');
        assert.deepEqual(optionalBeadsSnapshot(parent), before);
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    });
  }
});

test('066 optional-Beads inherited configuration disqualifies absence but not a successful empty board', async (t) => {
  const root = optionalBeadsRoot();
  try {
    const owned = feature(root, '066', 'configuration', '- [~] T001@aaaaaaaa Canonical instruction.\n');
    const before = optionalBeadsSnapshot(root);
    for (const [key, value] of [
      ['BEADS_DIR', ''], ['BEADS_DIR', '../external'], ['BEADS_DB', '../external.db'],
      ['BEADS_DOLT_SERVER_HOST', 'fixture.invalid'], ['BEADS_FUTURE_SETTING', ' '],
      ['GIT_DIR', '../external.git'], ['GIT_COMMON_DIR', '../external-common'],
      ['GIT_WORK_TREE', '../external-worktree'],
      ['GIT_CONFIG', '../external-config'], ['GIT_CONFIG_COUNT', '1'],
      ['GIT_CONFIG_PARAMETERS', "'core.worktree=../external-worktree'"],
    ]) {
      await t.test(`${key} ${value === '' ? 'empty control' : 'configured'}`, () => {
        const result = optionalBeadsChild(root, `
          const pair = async options => ({
            index: await reader.readWorkIndex({ root }, options),
            selected: await reader.readNowProjection({ root, target: ${JSON.stringify(owned.ideaPath)} }, options),
          });
          console.log(JSON.stringify({
            absent: await pair(),
            injectedNoDatabase: await pair({ runBd: () => ({ status: 1, stdout: '', stderr: 'Error: no beads database found' }) }),
            injectedEmpty: await pair({ runBd: () => ({ status: 0, stdout: '[]', stderr: '' }) }),
          }));
        `, { env: { [key]: value } });
        for (const pair of [result.absent, result.injectedNoDatabase]) {
          if (value === '') {
            assert.equal(pair.selected.complete, true);
            assert.equal(pair.index.coverage.work.state, 'current');
          } else {
            assertOptionalUnavailable(pair, owned);
          }
        }
        assert.equal(result.injectedEmpty.selected.complete, true);
        assert.equal(result.injectedEmpty.index.coverage.work.state, 'current');
        assert.deepEqual(optionalBeadsSnapshot(root), before);
      });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads injected final-capture races recheck absence and counted bytes in both readers', async (t) => {
  for (const change of ['local footprint', 'main-worktree footprint', 'Git location evidence', 'same-mtime task bytes']) {
    for (const method of ['readWorkIndex', 'readNowProjection']) {
      await t.test(`${change}: ${method}`, () => {
        const parent = optionalBeadsRoot();
        const root = path.join(parent, 'workspace');
        try {
          fs.mkdirSync(root);
          const owned = feature(root, '066', 'absence-race', '- [~] T001@aaaaaaaa Before.\n');
          const draft = idea(root, '067', 'independent-draft');
          const linked = change === 'main-worktree footprint' ? optionalBeadsWorktree(parent, root) : null;
          const mutation = change === 'local footprint'
            ? "fs.mkdirSync(path.join(root, '.beads'));"
            : change === 'main-worktree footprint'
              ? `fs.mkdirSync(${JSON.stringify(path.join(linked.main, '.beads'))});`
              : change === 'Git location evidence'
                ? "fs.mkdirSync(path.join(root, '.git'));"
                : `const file = path.join(root, ${JSON.stringify(owned.tasksPath)});
                  const stat = fs.statSync(file);
                  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('[~]', '[x]'));
                  fs.utimesSync(file, stat.atime, stat.mtime);`;
          const result = optionalBeadsChild(root, `
            const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
            const control = await reader.readNowProjection(input);
            const calls = [];
            const options = { runBd(args) {
              calls.push(args);
              if (calls.length === 2) { ${mutation} }
              return { status: null, error: Object.assign(new Error('injected missing executable'), { code: 'ENOENT' }) };
            } };
            const result = await reader.${method}(input, options);
            console.log(JSON.stringify({ control, result, calls }));
          `);
          assert.equal(result.control.complete, true, 'default absent-tool control reaches a healthy canonical read');
          assert.deepEqual(result.calls, [BD_LIST, BD_LIST]);
          if (method === 'readWorkIndex') {
            const row = result.result.items.find(item => item.ideaPath === owned.ideaPath);
            assert.equal(row.taskCounts, null);
            assert.equal(row.availability.state, 'stale');
            assert.equal(result.result.items.find(item => item.ideaPath === draft.ideaPath).availability.state, 'current');
            assert.equal(result.result.coverage.inventory.state, 'current');
          } else {
            assert.equal(result.result.complete, false);
            assert.equal(result.result.tasks, null);
            assert.equal(result.result.next, null);
            assert.deepEqual(result.result.diagnostics.map(({ code }) => code),
              [change.includes('footprint') ? 'TRACKED_AUTHORITY_UNAVAILABLE' : 'PROJECTION_READ_CONFLICT']);
          }
          assert.equal(JSON.stringify(result.result).includes(parent), false);
          if (change === 'same-mtime task bytes') {
            assert.match(fs.readFileSync(path.join(root, owned.tasksPath), 'utf8'), /\[x\]/,
              'readers do not overwrite the fixture-authored concurrent edit');
          }
        } finally {
          fs.rmSync(parent, { recursive: true, force: true });
        }
      });
    }
  }
});

test('066 optional-Beads default freshness and failed refresh recheck the absence basis and preserve the complete view', async (t) => {
  for (const change of ['new footprint', 'new inherited override', 'changed Git metadata']) {
    await t.test(change, () => {
      const root = optionalBeadsRoot();
      try {
        const owned = feature(root, '066', 'absence-freshness', '- [~] T001@aaaaaaaa Current instruction.\n');
        const result = optionalBeadsChild(root, `
          const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
          const previous = await reader.readNowProjection(input);
          assert.equal(previous.complete, true);
          ${change === 'new footprint' ? "fs.mkdirSync(path.join(root, '.beads'));"
            : change === 'new inherited override' ? "process.env.BEADS_DIR = '../unavailable';"
              : "fs.mkdirSync(path.join(root, '.git'));"}
          const freshness = await reader.checkProjectionFreshness({ root, projection: previous });
          const refreshed = await reader.refreshNowProjection({ ...input, previous });
          console.log(JSON.stringify({
            previous, freshness, refreshed, sameObject: previous === refreshed.projection,
          }));
        `);
        if (change === 'changed Git metadata') {
          assert.equal(result.freshness.state, 'changed');
          assert.equal(result.refreshed.replaced, true, 'a fresh, fully checked absence basis can replace the old one');
          assert.equal(result.refreshed.freshness.state, 'current');
        } else {
          assert.equal(result.freshness.state, 'unavailable');
          assert.equal(result.refreshed.replaced, false);
          assert.equal(result.refreshed.freshness.state, 'unavailable');
          assert.equal(result.sameObject, true);
          assert.equal(result.refreshed.projection.readAt, result.previous.readAt);
        }
        assert.equal(result.refreshed.projection.next.description, 'Current instruction.');
        assert.equal(JSON.stringify(result).includes(root), false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('066 optional-Beads previously populated authority forbids missing-tool and no-database refresh fallback globally', async (t) => {
  const root = optionalBeadsRoot();
  try {
    const owned = feature(root, '066', 'required-authority', '- [~] T001@aaaaaaaa Mirror must not become live.\n');
    const before = optionalBeadsSnapshot(root);
    for (const [label, issue] of [
      ['in-progress exact task', { status: 'in_progress', issue_type: 'task' }],
      ['all-done exact task', { status: 'closed', issue_type: 'task' }],
      ['grouping-only board', { status: 'open', issue_type: 'epic' }],
      ['selected-feature mismatch', { status: 'closed', issue_type: 'task', description: 'spec: .dude/specs/999-other/spec.md' }],
    ]) {
      await t.test(label, () => {
        const board = [{
          id: 'required', title: 'Authoritative work',
          description: `spec: ${owned.specPath}\nTask: T001@aaaaaaaa`,
          ...issue,
        }];
        const result = optionalBeadsChild(root, `
          const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
          const reply = { status: 0, stdout: ${JSON.stringify(JSON.stringify(board))}, stderr: '' };
          const empty = { status: 0, stdout: '[]', stderr: '' };
          const noDatabase = { status: 1, stdout: '', stderr: 'Error: no beads database found' };
          const optionalControl = await reader.readNowProjection(input);
          const noDatabaseControl = await reader.readNowProjection(input, { runBd: () => noDatabase });
          const previous = await reader.readNowProjection(input, { runBd: args => args[0] === 'list' ? reply : empty });
          const failures = [];
          for (const options of [undefined, { runBd: () => noDatabase }]) {
            const freshness = await reader.checkProjectionFreshness({ root, projection: previous }, options);
            const refreshed = await reader.refreshNowProjection({ ...input, previous }, options);
            failures.push({ freshness, refreshed, sameObject: previous === refreshed.projection });
          }
          // A successful empty list remains an actual new board capture, not an
          // acquisition failure inferred away from a prior tracked view.
          const emptied = await reader.refreshNowProjection({ ...input, previous }, { runBd: () => empty });
          const finalFailures = [];
          for (const failure of [
            { status: null, error: Object.assign(new Error('injected disappearance'), { code: 'ENOENT' }) },
            noDatabase,
          ]) {
            for (const method of ['readWorkIndex', 'readNowProjection']) {
              let lists = 0;
              finalFailures.push({ method, result: await reader[method](input, { runBd(args) {
                if (args[0] !== 'list') return empty;
                return ++lists === 1 ? reply : failure;
              } }) });
            }
          }
          console.log(JSON.stringify({ optionalControl, noDatabaseControl, previous, failures, emptied, finalFailures }));
        `);
        assert.equal(result.optionalControl.complete, true);
        assert.equal(result.noDatabaseControl.complete, true,
          'without earlier positive facts, exact no-database is otherwise admissible on this same root');
        assert.equal(result.previous.complete, true);
        assert.equal(result.previous.authority, 'tracked');
        for (const failure of result.failures) {
          assert.equal(failure.freshness.state, 'unavailable');
          assert.equal(failure.refreshed.replaced, false);
          assert.equal(failure.sameObject, true);
          assert.equal(failure.refreshed.freshness.state, 'unavailable');
          assert.equal(failure.refreshed.projection.readAt, result.previous.readAt);
          assert.doesNotMatch(JSON.stringify(failure), /Mirror must not become live/);
        }
        assert.equal(result.emptied.replaced, true);
        assert.equal(result.emptied.projection.authority, 'lightweight');
        for (const { method, result: failure } of result.finalFailures) {
          if (method === 'readNowProjection') {
            assert.equal(failure.complete, false);
            assert.equal(failure.tasks, null);
            assert.deepEqual(failure.diagnostics.map(({ code }) => code), ['TRACKED_AUTHORITY_UNAVAILABLE']);
          } else {
            assert.equal(failure.items[0].taskCounts, null);
            assert.equal(failure.items[0].availability.state, 'stale');
            assert.equal(failure.items[0].lane, 'tracked');
          }
          assert.doesNotMatch(JSON.stringify(failure), /Mirror must not become live/);
        }
        assert.deepEqual(optionalBeadsSnapshot(root), before);
      });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads incomplete tracked predecessor refuses absence refresh but allows a successful empty board', async (t) => {
  const root = optionalBeadsRoot();
  try {
    const owned = feature(root, '066', 'incomplete-authority', '- [~] T001@aaaaaaaa Mirror must not become live after readiness fails.\n');
    const board = [{
      id: 'required', title: 'Authoritative work', status: 'open', issue_type: 'task',
      description: `spec: ${owned.specPath}\nTask: T001@aaaaaaaa`,
    }];
    const before = optionalBeadsSnapshot(root);
    for (const generated of [false, true]) {
      for (const label of ['missing executable', 'exact no-database', 'successful []']) {
        await t.test(`${generated ? 'generated' : 'source'}: ${label}`, () => {
          const result = optionalBeadsChild(root, `
            const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
            const list = ${JSON.stringify(BD_LIST)};
            const empty = { status: 0, stdout: '[]', stderr: '' };
            const noDatabase = { status: 1, stdout: '', stderr: 'Error: no beads database found' };
            // These controls must admit absence on this exact root. A stray
            // ancestor footprint must not make the negative pass accidentally.
            const optionalControl = await reader.readNowProjection(input);
            const noDatabaseCalls = [];
            const noDatabaseControl = await reader.readNowProjection(input, { runBd(args) {
              noDatabaseCalls.push(args);
              return noDatabase;
            } });
            for (const control of [optionalControl, noDatabaseControl]) {
              assert.equal(control.complete, true, 'absence is otherwise admissible on this root');
              assert.equal(control.authority, 'lightweight');
              assert.equal(control.tasks.inProgress, 1);
            }
            assert.deepEqual(noDatabaseCalls, [list, list]);

            const predecessorCalls = [];
            const previous = await reader.readNowProjection(input, { runBd(args) {
              predecessorCalls.push(args);
              if (args[0] === 'list') return {
                status: 0, stdout: ${JSON.stringify(JSON.stringify(board))}, stderr: '',
              };
              assert.deepEqual(args, ['ready', '--json']);
              return { status: 1, stdout: '', stderr: 'injected readiness failure' };
            } });
            assert.deepEqual(predecessorCalls, [list, ['ready', '--json']]);
            assert.equal(previous.selected.specPath, ${JSON.stringify(owned.specPath)});
            assert.equal(previous.complete, false);
            assert.equal(previous.status, 'unavailable');
            assert.equal(previous.authority, 'tracked');
            assert.equal(previous.readAt, null);
            assert.deepEqual(previous.sources, []);
            assert.equal(previous.tasks, null);
            assert.equal(previous.next, null);
            assert.equal(previous.taskDetails.items, null);
            assert.deepEqual(previous.diagnostics.map(({ code }) => code), ['TRACKED_READINESS_UNAVAILABLE']);

            const scenario = ${JSON.stringify(label)};
            const reply = scenario === 'missing executable'
              ? { status: null, error: Object.assign(new Error('injected missing executable'), { code: 'ENOENT' }) }
              : scenario === 'exact no-database' ? noDatabase : empty;
            const refreshCalls = [];
            const refreshed = await reader.refreshNowProjection({ ...input, previous }, { runBd(args) {
              refreshCalls.push(args);
              return reply;
            } });
            assert.deepEqual(refreshCalls[0], list, 'refresh reaches the authoritative list query');
            console.log(JSON.stringify({
              previous, predecessorCalls, refreshCalls, refreshed,
              optionalControl, noDatabaseControl, sameObject: previous === refreshed.projection,
            }));
          `, { generated });
          t.diagnostic([
            `${generated ? 'generated' : 'source'} ${label}: controls complete=${result.optionalControl.complete}/${result.noDatabaseControl.complete}`,
            `predecessor complete=${result.previous.complete}, authority=${result.previous.authority}, sources=${result.previous.sources.length}, calls=${result.predecessorCalls.map(args => args[0]).join('/')}`,
            `refresh calls=${result.refreshCalls.map(args => args[0]).join('/')}, replaced=${result.refreshed.replaced}`,
            `authority=${result.refreshed.projection.authority}, complete=${result.refreshed.projection.complete}, freshness=${result.refreshed.freshness.state}`,
          ].join('; '));
          assert.deepEqual(optionalBeadsSnapshot(root), before, 'the chained reads change no bytes or inventory');
          if (label === 'successful []') {
            assert.equal(result.refreshed.replaced, true, 'a newly captured empty board still permits canonical work');
            assert.equal(result.sameObject, false);
            assert.equal(result.refreshed.projection.complete, true);
            assert.equal(result.refreshed.projection.authority, 'lightweight');
            assert.equal(result.refreshed.freshness.state, 'current');
            assert.deepEqual(result.refreshed.projection.tasks, result.optionalControl.tasks);
            assert.equal(result.refreshed.projection.next.description, 'Mirror must not become live after readiness fails.');
            assert.deepEqual(result.refreshed.projection.diagnostics, []);
            assert.deepEqual(result.refreshCalls, [BD_LIST, BD_LIST]);
          } else {
            assert.equal(result.refreshed.replaced, false, 'failed tracked acquisition must not promote the markdown mirror');
            assert.equal(result.sameObject, true);
            assert.deepEqual(result.refreshed.projection, result.previous);
            assert.equal(result.refreshed.freshness.state, 'unavailable');
            assert.deepEqual(result.refreshed.freshness.diagnostics.map(({ code }) => code), ['TRACKED_AUTHORITY_UNAVAILABLE']);
            assert.doesNotMatch(JSON.stringify(result.refreshed), /Mirror must not become live/);
            assert.deepEqual(result.refreshCalls, [BD_LIST]);
          }
        });
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads injected nonmissing acquisition failures and no-database near-misses stay unavailable', async (t) => {
  const root = optionalBeadsRoot();
  try {
    const owned = feature(root, '066', 'failure-classification', '- [~] T001@aaaaaaaa Canonical instruction must not leak.\n');
    const before = optionalBeadsSnapshot(root);
    const result = optionalBeadsChild(root, `
      const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
      const failure = code => Object.assign(new Error('private command ENOENT /host/detail'), { code });
      const missingReply = { status: null, error: failure('ENOENT') };
      const noDatabase = { status: 1, stdout: '', stderr: 'Error: no beads database found' };
      const pair = async options => ({
        index: await reader.readWorkIndex({ root }, options),
        selected: await reader.readNowProjection(input, options),
      });
      const optionalControl = await pair();
      const exactControl = await pair({ runBd: () => noDatabase });
      const thrownMissingControl = await pair({ runBd() { throw failure('ENOENT'); } });
      const overflow = Buffer.alloc(8 * 1024 * 1024 + 1, 'x');
      const fixtures = [
        ['permission denied', { status: null, error: failure('EACCES') }],
        ['operation not permitted', { status: null, error: failure('EPERM') }],
        ['not a directory', { status: null, error: failure('ENOTDIR') }],
        ['ordinary nonzero exit', { status: 2, stdout: '', stderr: 'private command error' }],
        ['missing plus successful status', { ...missingReply, status: 0 }],
        ['missing plus output', { ...missingReply, stdout: '[]' }],
        ['missing plus signal', { ...missingReply, signal: 'SIGTERM' }],
        ['missing plus timeout', { ...missingReply, timeout: true }],
        ['missing plus oversized output', { ...missingReply, stdout: overflow }],
        ['oversized stderr', { ...noDatabase, stderr: overflow }],
        ['malformed JSON', { status: 0, stdout: '{', stderr: '' }],
        ['unrecognized payload', { status: 0, stdout: '{}', stderr: '' }],
        ['malformed issue', { status: 0, stdout: '[{"description":1}]', stderr: '' }],
        ['no database with output', { ...noDatabase, stdout: '[]' }],
        ['no database with zero exit and no JSON', { ...noDatabase, status: 0 }],
        ['no database altered case', { ...noDatabase, stderr: 'error: no beads database found' }],
        ['no database altered wording', { ...noDatabase, stderr: 'Error: no beads database is available' }],
        ['no database prefix', { ...noDatabase, stderr: 'bd: Error: no beads database found' }],
        ['no database suffix', { ...noDatabase, stderr: 'Error: no beads database found here' }],
        ['no database indentation', { ...noDatabase, stderr: ' Error: no beads database found' }],
        ['no database after other output', { ...noDatabase, stderr: 'other error\\nError: no beads database found' }],
      ];
      const failures = [];
      for (const [name, reply] of fixtures) {
        failures.push({ name, pair: await pair({ runBd: () => reply }) });
      }
      failures.push({ name: 'thrown nonmissing error mentioning ENOENT', pair: await pair({ runBd() { throw failure('EIO'); } }) });
      console.log(JSON.stringify({ optionalControl, exactControl, thrownMissingControl, failures }));
    `);
    for (const pair of [result.optionalControl, result.exactControl, result.thrownMissingControl]) {
      assert.equal(pair.selected.complete, true);
      assert.equal(pair.index.coverage.work.state, 'current',
        'all failure cases use the same otherwise-admissible absence root');
    }
    for (const { name, pair } of result.failures) {
      await t.test(name, () => {
        assertOptionalUnavailable(pair, owned);
        assert.doesNotMatch(JSON.stringify(pair), /Canonical instruction must not leak|private command|\/host\/detail|ENOENT|EACCES|EPERM|ENOTDIR/);
        assert.equal(JSON.stringify(pair).includes(root), false);
      });
    }
    assert.deepEqual(optionalBeadsSnapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads absence inspection shares the acquisition deadline and rejects cancelled missing results', () => {
  const root = optionalBeadsRoot();
  try {
    const owned = feature(root, '066', 'absence-budget', '- [~] T001@aaaaaaaa Private canonical instruction.\n');
    const before = optionalBeadsSnapshot(root);
    const result = optionalBeadsChild(root, `
      const input = { root, target: ${JSON.stringify(owned.ideaPath)} };
      const control = await reader.readNowProjection(input);
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
      const attempts = [];
      for (const method of ['readWorkIndex', 'readNowProjection']) {
        for (const mode of ['deadline', 'cancellation']) {
          let now = 0;
          const controller = new AbortController();
          const calls = [];
          if (mode === 'deadline') Object.defineProperty(globalThis, 'performance', {
            configurable: true, value: { now: () => now++ },
          });
          try {
            const projection = await reader[method](input, {
              timeoutMs: mode === 'deadline' ? 5 : 5000,
              signal: controller.signal,
              runBd(args, options) {
                calls.push({ args, timeout: options.timeout });
                if (mode === 'cancellation') controller.abort();
                return { status: null, error: Object.assign(new Error('injected missing executable'), { code: 'ENOENT' }) };
              },
            });
            attempts.push({ method, mode, projection, calls });
          } finally {
            Object.defineProperty(globalThis, 'performance', descriptor);
          }
        }
      }
      console.log(JSON.stringify({ control, attempts }));
    `);
    assert.equal(result.control.complete, true);
    for (const { method, mode, projection, calls } of result.attempts) {
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].args, BD_LIST);
      assert.ok(calls[0].timeout <= (mode === 'deadline' ? 5 : 5000));
      if (method === 'readNowProjection') {
        assert.equal(projection.complete, false);
        assert.deepEqual(projection.diagnostics.map(({ code }) => code), ['TRACKED_AUTHORITY_UNAVAILABLE']);
        assert.equal(projection.tasks, null);
      } else {
        assert.equal(projection.items[0].taskCounts, null);
        assert.equal(projection.coverage.work.state, 'partial');
      }
      assert.doesNotMatch(JSON.stringify(projection), /Private canonical instruction|injected missing executable/);
    }
    assert.deepEqual(optionalBeadsSnapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('066 optional-Beads Git metadata growth is bounded and every opened descriptor is closed', () => {
  const root = optionalBeadsRoot();
  try {
    const owned = feature(root, '066', 'metadata-growth', '- [~] T001@aaaaaaaa Private canonical instruction.\n');
    write(root, '.git', Buffer.alloc(8 * 1024 * 1024 + 1, 'x'));
    const before = optionalBeadsSnapshot(root);
    const result = optionalBeadsChild(root, `
      const git = path.join(root, '.git');
      const original = { stat: fs.lstatSync, open: fs.openSync, read: fs.readSync, whole: fs.readFileSync, close: fs.closeSync };
      const descriptors = new Set();
      let opened = 0, closed = 0, largestRead = 0, wholeReads = 0;
      fs.lstatSync = function(file, ...args) {
        const stat = original.stat.call(fs, file, ...args);
        if (path.resolve(String(file)) === git) stat.size = 8; // injected pre-growth observation
        return stat;
      };
      fs.openSync = function(file, ...args) {
        const descriptor = original.open.call(fs, file, ...args);
        if (path.resolve(String(file)) === git) { descriptors.add(descriptor); opened += 1; }
        return descriptor;
      };
      fs.readFileSync = function(file, ...args) {
        if (path.resolve(String(file)) === git) {
          wholeReads += 1;
          throw new Error('an unbounded metadata read was attempted');
        }
        return original.whole.call(fs, file, ...args);
      };
      fs.readSync = function(descriptor, buffer, offset, length, position) {
        if (descriptors.has(descriptor)) largestRead = Math.max(largestRead, length);
        return original.read.call(fs, descriptor, buffer, offset, length, position);
      };
      fs.closeSync = function(descriptor) {
        if (descriptors.delete(descriptor)) closed += 1;
        return original.close.call(fs, descriptor);
      };
      const index = await reader.readWorkIndex({ root });
      const selected = await reader.readNowProjection({ root, target: ${JSON.stringify(owned.ideaPath)} });
      console.log(JSON.stringify({ index, selected, opened, closed, outstanding: descriptors.size, largestRead, wholeReads }));
    `);
    assertOptionalUnavailable(result, owned);
    assert.equal(result.opened, 2);
    assert.equal(result.closed, result.opened);
    assert.equal(result.outstanding, 0);
    assert.equal(result.wholeReads, 0);
    assert.equal(result.largestRead, 9, 'only the captured size plus a growth-detection byte is read');
    assert.deepEqual(optionalBeadsSnapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
