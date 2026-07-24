// @ts-check
/**
 * Tests for scripts/build-dev.mjs — the dev-bundle sync (src/ core -> .github/).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDev } from './build-dev.mjs';
import { listCoreSourceFiles } from './build-release.mjs';
import {
  enumerateCorePaths,
  isCorePath,
  isPackPath,
} from '../src/skills/dude-engine/lib/ownership.mjs';

/** @param {string} root @param {string} rel @param {string | Uint8Array} content */
function w(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
/** @param {string} root @param {string} rel */
function has(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

/** @typedef {{ path: string, type: 'directory' } | { path: string, type: 'file', mode: string, content: string }} TreeRow */

/** @param {fs.Stats} stat @returns {string} */
function normalizedFileMode(stat) {
  if (process.platform === 'win32') return 'regular';
  return (stat.mode & 0o111) === 0 ? '100644' : '100755';
}

/** @param {string} root @param {string} rel @param {number} mode */
function setFixtureMode(root, rel, mode) {
  if (process.platform !== 'win32') fs.chmodSync(path.join(root, rel), mode);
}

/** @param {string} root @returns {TreeRow[]} */
function snapshotTree(root) {
  /** @type {TreeRow[]} */
  const rows = [];
  /** @param {string} dir @param {string} base */
  const scan = (dir, base) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(abs);
      if (stat.isDirectory()) {
        rows.push({ path: rel, type: 'directory' });
        scan(abs, rel);
        continue;
      }
      assert.equal(stat.isFile(), true, `unsupported fixture path type: ${rel}`);
      rows.push({
        path: rel,
        type: 'file',
        mode: normalizedFileMode(stat),
        content: fs.readFileSync(abs).toString('base64'),
      });
    }
  };
  if (fs.existsSync(root)) scan(root, '');
  return rows;
}

/** @param {TreeRow[]} rows @returns {TreeRow[]} */
function protectedSnapshot(rows) {
  return rows.filter(({ path: rel }) => (
    isPackPath(rel)
    || rel === '.github/skills/project'
    || rel.startsWith('.github/skills/project/')
    || rel === '.github/workflows'
    || rel.startsWith('.github/workflows/')
    || rel === '.dude'
    || rel.startsWith('.dude/')
  ));
}

/**
 * @param {{ abs: string, deployRel: string }[]} sourceFiles
 * @returns {TreeRow[]}
 */
function expectedCoreSnapshot(sourceFiles) {
  /** @type {Map<string, TreeRow>} */
  const rows = new Map();
  for (const { abs, deployRel } of sourceFiles) {
    let parent = path.posix.dirname(deployRel);
    while (parent.startsWith('.github/') && parent !== '.github') {
      if (isCorePath(parent)) rows.set(parent, { path: parent, type: 'directory' });
      parent = path.posix.dirname(parent);
    }
    const stat = fs.lstatSync(abs);
    rows.set(deployRel, {
      path: deployRel,
      type: 'file',
      mode: normalizedFileMode(stat),
      content: fs.readFileSync(abs).toString('base64'),
    });
  }
  return [...rows.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const MANIFEST = '# Bundle Manifest\n\n```json\n{"source_repo":"https://example.invalid/dude","source_ref":"main","installed_ref":"main"}\n```\n';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

test('buildDev syncs core from src, strips tests, and preserves project, pack, and .dude data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-'));
  try {
    w(root, 'src/agents/dude.agent.md', 'A');
    w(root, 'src/agents/dude-lead.agent.md', 'B');
    w(root, 'src/instructions/dude.instructions.md', 'I');
    w(root, 'src/skills/dude-lint/lint.mjs', 'L');
    w(root, 'src/skills/dude-lint/lint.test.mjs', 'T'); // excluded from the dev bundle
    // pre-existing .github: stale core + dev-owned + pack
    w(root, '.github/skills/dude-stale/SKILL.md', 'STALE'); // stale core -> removed
    w(root, '.github/skills/dude-lint/old.mjs', 'OLD'); // stale core file -> gone (dir cleaned)
    w(root, '.github/skills/project/SKILL.md', 'P'); // preserved
    w(root, '.dude/metadata/bundle-manifest.md', MANIFEST); // preserved
    w(root, '.dude/memory/context.md', 'C'); // preserved
    w(root, '.github/agents/dude-pack-authoring-agent-smith.agent.md', 'PACK'); // preserved

    const r = buildDev({ repoRoot: root });

    // core synced
    assert.ok(has(root, '.github/agents/dude.agent.md'));
    assert.ok(has(root, '.github/agents/dude-lead.agent.md'));
    assert.ok(has(root, '.github/instructions/dude.instructions.md'));
    assert.ok(has(root, '.github/skills/dude-lint/lint.mjs'));
    // tests excluded
    assert.ok(!has(root, '.github/skills/dude-lint/lint.test.mjs'));
    // stale core removed
    assert.ok(!has(root, '.github/skills/dude-stale/SKILL.md'));
    assert.ok(!has(root, '.github/skills/dude-lint/old.mjs'));
    // dev-owned + pack preserved
    assert.ok(has(root, '.github/skills/project/SKILL.md'));
    assert.ok(has(root, '.dude/metadata/bundle-manifest.md'));
    assert.ok(has(root, '.dude/memory/context.md'));
    assert.ok(has(root, '.github/agents/dude-pack-authoring-agent-smith.agent.md'));

    assert.ok(r.written.includes('.github/skills/dude-lint/lint.mjs'));
    assert.ok(r.removed.includes('.github/skills/dude-stale'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev preserves every canonical project-owned byte while syncing core only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-canonical-'));
  try {
    w(root, 'src/agents/dude.agent.md', '# Synced agent\n');
    w(root, 'src/instructions/dude.instructions.md', '# Synced instructions\n');
    w(root, 'src/skills/dude-lint/lint.mjs', 'export const synced = true;\n');
    w(root, 'src/skills/dude-lint/lint.test.mjs', 'throw new Error("must not deploy");\n');

    const projectFiles = {
      '.dude/ideas/x.md': '---\r\nstatus: draft\r\nspec_path: ""\r\n---\r\n\r\n## Idea\r\nPreserve this idea exactly.\r\n',
      '.dude/specs/x/spec.md': '# Spec\n\nProject-owned spec bytes.\n',
      '.dude/specs/x/tasks.md': '<!-- audit log: .dude/ideas/x.md#coordinator-log -->\n\n# Tasks\n',
      '.dude/memory/decisions.md': '# Decisions\n\nKeep.\n',
      '.dude/memory/context.md': '# Context\r\n\r\nKeep CRLF too.\r\n',
      '.dude/state/task-state.json': '{"features":{"x":{"T001@fixture":"~"}}}',
      '.dude/metadata/bundle-manifest.md': MANIFEST,
      '.dude/metadata/profile.md': '# Install Profile\n\n```json\n{"enabled_packs":[],"installed":{}}\n```\n',
      '.github/skills/project/SKILL.md': '---\nname: project\n---\n\n# Local knowledge\n',
    };
    for (const [rel, content] of Object.entries(projectFiles)) w(root, rel, content);
    const before = new Map(
      Object.keys(projectFiles).map((rel) => [rel, fs.readFileSync(path.join(root, rel))]),
    );

    buildDev({ repoRoot: root });

    for (const [rel, expected] of before) {
      assert.deepEqual(fs.readFileSync(path.join(root, rel)), expected, `${rel} changed`);
    }
    assert.deepEqual(
      fs.readFileSync(path.join(root, '.github/agents/dude.agent.md')),
      fs.readFileSync(path.join(root, 'src/agents/dude.agent.md')),
    );
    assert.deepEqual(
      fs.readFileSync(path.join(root, '.github/skills/dude-lint/lint.mjs')),
      fs.readFileSync(path.join(root, 'src/skills/dude-lint/lint.mjs')),
    );
    assert.equal(has(root, '.github/skills/dude-lint/lint.test.mjs'), false);
    assert.equal(has(root, '.dude/brief'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checked-in dev core is a byte-identical non-mutating projection of authoritative source', () => {
  const sourceFiles = listCoreSourceFiles(repoRoot);
  const expectedPaths = sourceFiles.map(({ deployRel }) => deployRel).sort();
  const expectedSet = new Set(expectedPaths);
  const generatedPaths = enumerateCorePaths(repoRoot);

  assert.ok(sourceFiles.length > 20, `expected authoritative core files, got ${sourceFiles.length}`);
  assert.deepEqual(
    expectedPaths.filter((rel) => /\.test\./.test(rel)),
    [],
    'source test files must not have deploy destinations',
  );
  for (const { abs, deployRel } of sourceFiles) {
    assert.equal(fs.existsSync(path.join(repoRoot, deployRel)), true, `missing generated core file: ${deployRel}`);
    assert.deepEqual(
      fs.readFileSync(path.join(repoRoot, deployRel)),
      fs.readFileSync(abs),
      `generated core differs byte-for-byte: ${deployRel}`,
    );
  }
  assert.deepEqual(
    generatedPaths.filter((rel) => !expectedSet.has(rel)),
    [],
    'unexpected generated base-owned files remain',
  );
  assert.deepEqual(generatedPaths, expectedPaths, 'generated base-owned inventory differs from source');
});

test('recovery runtime is an explicit byte-identical dev projection while its test stays source-only', () => {
  const sourceRel = 'src/skills/dude-work/recovery.mjs';
  const generatedRel = '.github/skills/dude-work/recovery.mjs';
  const sourceTestRel = 'src/skills/dude-work/recovery.test.mjs';
  const generatedTestRel = '.github/skills/dude-work/recovery.test.mjs';
  const sourceFiles = listCoreSourceFiles(repoRoot);

  assert.equal(fs.statSync(path.join(repoRoot, sourceRel)).isFile(), true, sourceRel);
  assert.equal(fs.statSync(path.join(repoRoot, sourceTestRel)).isFile(), true, sourceTestRel);
  assert.equal(
    sourceFiles.some(({ abs, deployRel }) => (
      abs === path.join(repoRoot, sourceRel) && deployRel === generatedRel
    )),
    true,
    'recovery runtime has the canonical development destination',
  );
  assert.equal(
    sourceFiles.some(({ abs }) => abs === path.join(repoRoot, sourceTestRel)),
    false,
    'recovery.test.mjs is excluded from development source projection',
  );
  assert.equal(fs.existsSync(path.join(repoRoot, generatedRel)), true, generatedRel);
  assert.deepEqual(
    fs.readFileSync(path.join(repoRoot, generatedRel)),
    fs.readFileSync(path.join(repoRoot, sourceRel)),
    `${generatedRel} must be byte-identical to ${sourceRel}`,
  );
  assert.equal(fs.existsSync(path.join(repoRoot, generatedTestRel)), false, generatedTestRel);
});

test('final feature hygiene files have terminal newlines and normalized source pairs stay identical', () => {
  const sourceGeneratedPairs = [
    [
      'src/skills/dude-engine/lib/workspace-paths.mjs',
      '.github/skills/dude-engine/lib/workspace-paths.mjs',
    ],
    [
      'src/skills/dude-engine/lib/feature-identity.mjs',
      '.github/skills/dude-engine/lib/feature-identity.mjs',
    ],
    [
      'src/skills/dude-work/recovery.mjs',
      '.github/skills/dude-work/recovery.mjs',
    ],
  ];
  const finalFeatureHygieneFiles = [
    ...(fs.existsSync(path.join(repoRoot, '.dude/memory/decisions.md'))
      ? ['.dude/memory/decisions.md']
      : []),
    'scripts/current-format-contract.test.mjs',
    ...sourceGeneratedPairs.flat(),
    'library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs',
    'src/skills/dude-engine/lib/feature-identity.test.mjs',
    'src/skills/dude-engine/lib/workspace-paths.test.mjs',
    'src/skills/dude-lint/lint.test.mjs',
    'src/skills/dude-work/recovery.test.mjs',
  ];
  const normalizeTerminalNewline = (content) => {
    let bodyEnd = content.length;
    if (content.at(-1) === 0x0a) {
      bodyEnd -= 1;
      if (content.at(bodyEnd - 1) === 0x0d) bodyEnd -= 1;
    } else if (content.at(-1) === 0x0d) {
      bodyEnd -= 1;
    }
    return Buffer.concat([content.subarray(0, bodyEnd), Buffer.from('\n')]);
  };

  for (const [sourceRel, generatedRel] of sourceGeneratedPairs) {
    assert.equal(fs.existsSync(path.join(repoRoot, sourceRel)), true, `missing source file: ${sourceRel}`);
    assert.equal(fs.existsSync(path.join(repoRoot, generatedRel)), true, `missing generated file: ${generatedRel}`);
    assert.deepEqual(
      normalizeTerminalNewline(fs.readFileSync(path.join(repoRoot, sourceRel))),
      normalizeTerminalNewline(fs.readFileSync(path.join(repoRoot, generatedRel))),
      `${sourceRel} and ${generatedRel} differ after terminal-newline normalization`,
    );
  }

  const missingTerminalNewline = finalFeatureHygieneFiles.filter((rel) => {
    const content = fs.readFileSync(path.join(repoRoot, rel));
    return content.length === 0 || content.at(-1) !== 0x0a;
  });
  assert.deepEqual(
    missingTerminalNewline,
    [],
    `files missing terminal newline:\n${missingTerminalNewline.join('\n')}`,
  );
});

test('buildDev preserves protected trees and materializes one exact idempotent core projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-complete-'));
  try {
    // Arrange
    const sourceFixtures = [
      ['src/agents/dude.agent.md', Buffer.from('# Agent\r\n', 'utf8'), 0o644],
      ['src/agents/dude-reviewer.agent.md', Buffer.from('# Reviewer\n', 'utf8'), 0o644],
      ['src/instructions/dude.instructions.md', Buffer.from('# Instructions\n', 'utf8'), 0o644],
      ['src/skills/dude-engine/SKILL.md', Buffer.from('# Engine\n', 'utf8'), 0o644],
      ['src/skills/dude-engine/lib/data.bin', Buffer.from([0x00, 0xff, 0x0d, 0x0a]), 0o644],
      ['src/skills/dude-engine/lib/runtime.mjs', Buffer.from('#!/usr/bin/env node\nexport const ready = true;\n', 'utf8'), 0o755],
      ['src/skills/dude-engine/lib/runtime.test.mjs', Buffer.from('throw new Error("source only");\n', 'utf8'), 0o755],
      ['src/skills/dude-work/recovery.test.mjs', Buffer.from('throw new Error("source only too");\n', 'utf8'), 0o644],
    ];
    for (const [rel, content, mode] of sourceFixtures) {
      w(root, String(rel), /** @type {Uint8Array} */ (content));
      setFixtureMode(root, String(rel), Number(mode));
    }

    const protectedFixtures = [
      ['.github/agents/dude-pack-coding-tester.agent.md', Buffer.from('# Pack agent\n', 'utf8'), 0o644],
      ['.github/skills/dude-pack-coding-fixtures/SKILL.md', Buffer.from('# Pack skill\r\n', 'utf8'), 0o644],
      ['.github/skills/dude-pack-coding-fixtures/bin/check.mjs', Buffer.from('#!/usr/bin/env node\n', 'utf8'), 0o755],
      ['.github/skills/dude-pack-coding-fixtures/data/nested/raw.bin', Buffer.from([0x00, 0x80, 0xff, 0x0a]), 0o644],
      ['.github/instructions/dude-pack-coding-tests.instructions.md', Buffer.from('# Pack instructions\n', 'utf8'), 0o644],
      ['.github/prompts/dude-pack-coding-run.prompt.md', Buffer.from('# Pack prompt\r\n', 'utf8'), 0o644],
      ['.github/skills/project/SKILL.md', Buffer.from('# Project skill\n', 'utf8'), 0o644],
      ['.github/skills/project/references/nested/context.bin', Buffer.from([0x01, 0x02, 0xfe]), 0o644],
      ['.github/workflows/ci.yml', Buffer.from('name: fixture\n', 'utf8'), 0o644],
      ['.github/workflows/reusable/nested/check.yml', Buffer.from('on: workflow_call\r\n', 'utf8'), 0o644],
      ['.dude/metadata/bundle-manifest.md', Buffer.from(MANIFEST, 'utf8'), 0o644],
      ['.dude/metadata/history/install.json', Buffer.from('{"installed":true}\n', 'utf8'), 0o644],
      ['.dude/memory/context.md', Buffer.from('# Context\r\n', 'utf8'), 0o644],
      ['.dude/memory/archive/nested/lesson.bin', Buffer.from([0x00, 0x0d, 0xff]), 0o644],
      ['.dude/ideas/archive/fixture.md', Buffer.from('# Idea\n', 'utf8'), 0o644],
      ['.dude/specs/008-fixture/contracts/nested/schema.json', Buffer.from('{"type":"object"}\n', 'utf8'), 0o644],
      ['.dude/state/runs/nested/current.json', Buffer.from('{"state":"open"}\n', 'utf8'), 0o644],
    ];
    for (const [rel, content, mode] of protectedFixtures) {
      w(root, String(rel), /** @type {Uint8Array} */ (content));
      setFixtureMode(root, String(rel), Number(mode));
    }
    for (const rel of [
      '.github/skills/dude-pack-coding-fixtures/data/empty',
      '.github/skills/project/references/empty',
      '.github/workflows/archive/empty',
      '.dude/state/runs/empty',
    ]) {
      fs.mkdirSync(path.join(root, rel), { recursive: true });
    }

    w(root, '.github/agents/dude.agent.md', 'stale agent bytes\n');
    w(root, '.github/agents/dude-obsolete.agent.md', 'remove stale agent\n');
    w(root, '.github/instructions/dude.instructions.md', 'stale instruction bytes\n');
    w(root, '.github/skills/dude-engine/old/deleted.mjs', 'remove stale nested file\n');
    w(root, '.github/skills/dude-obsolete/nested/stale.mjs', 'remove stale skill\n');

    const expectedDestinations = [
      '.github/agents/dude-reviewer.agent.md',
      '.github/agents/dude.agent.md',
      '.github/instructions/dude.instructions.md',
      '.github/skills/dude-engine/SKILL.md',
      '.github/skills/dude-engine/lib/data.bin',
      '.github/skills/dude-engine/lib/runtime.mjs',
    ].sort();
    const sourceTestPaths = [
      'src/skills/dude-engine/lib/runtime.test.mjs',
      'src/skills/dude-work/recovery.test.mjs',
    ];
    const sourceTestDestinations = sourceTestPaths.map((rel) => rel.replace(/^src\//, '.github/'));
    const staleDestinations = [
      '.github/agents/dude-obsolete.agent.md',
      '.github/skills/dude-engine/old/deleted.mjs',
      '.github/skills/dude-obsolete/nested/stale.mjs',
    ];
    const projectableSources = listCoreSourceFiles(root);
    const protectedBefore = protectedSnapshot(snapshotTree(root));

    assert.deepEqual(projectableSources.map(({ deployRel }) => deployRel).sort(), expectedDestinations);
    assert.deepEqual(
      projectableSources.filter(({ abs }) => sourceTestPaths.some((rel) => abs === path.join(root, rel))),
      [],
    );
    assert.equal(
      protectedBefore.find((row) => row.path === '.github/skills/dude-pack-coding-fixtures/bin/check.mjs')?.type === 'file'
        ? protectedBefore.find((row) => row.path === '.github/skills/dude-pack-coding-fixtures/bin/check.mjs')?.mode
        : undefined,
      process.platform === 'win32' ? 'regular' : '100755',
    );
    assert.equal(
      protectedBefore.find((row) => row.path === '.github/skills/dude-pack-coding-fixtures/data/nested/raw.bin')?.type === 'file'
        ? protectedBefore.find((row) => row.path === '.github/skills/dude-pack-coding-fixtures/data/nested/raw.bin')?.mode
        : undefined,
      process.platform === 'win32' ? 'regular' : '100644',
    );
    assert.equal(
      protectedBefore.find((row) => row.path === '.dude/state/runs/empty')?.type,
      'directory',
    );

    // Act
    const firstResult = buildDev({ repoRoot: root });
    const firstTree = snapshotTree(root);
    const protectedAfterFirst = protectedSnapshot(firstTree);
    const firstCoreSnapshot = firstTree.filter(({ path: rel }) => isCorePath(rel));
    const secondResult = buildDev({ repoRoot: root });
    const secondTree = snapshotTree(root);

    // Assert
    assert.deepEqual(firstResult.written, expectedDestinations);
    assert.ok(firstResult.removed.includes('.github/agents/dude-obsolete.agent.md'));
    assert.ok(firstResult.removed.includes('.github/skills/dude-obsolete'));
    assert.deepEqual(protectedAfterFirst, protectedBefore);
    assert.deepEqual(protectedSnapshot(secondTree), protectedBefore);

    for (const { abs, deployRel } of projectableSources) {
      const destination = path.join(root, deployRel);
      assert.equal(fs.lstatSync(destination).isFile(), true, `${deployRel} is not a regular file`);
      assert.deepEqual(fs.readFileSync(destination), fs.readFileSync(abs), `${deployRel} bytes differ`);
      assert.equal(
        normalizedFileMode(fs.lstatSync(destination)),
        normalizedFileMode(fs.lstatSync(abs)),
        `${deployRel} mode differs`,
      );
    }
    for (const rel of sourceTestDestinations) assert.equal(has(root, rel), false, `${rel} was generated`);
    for (const rel of staleDestinations) assert.equal(has(root, rel), false, `${rel} was not removed`);

    assert.deepEqual(firstCoreSnapshot, expectedCoreSnapshot(projectableSources));
    assert.deepEqual(enumerateCorePaths(root), expectedDestinations);
    assert.deepEqual(secondResult.written, expectedDestinations);
    assert.deepEqual(secondTree, firstTree);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev rejects symlinked mutation destinations before changing any files', async (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');

  const cases = [
    {
      name: '.github',
      linkRel: '.github',
      targetType: 'dir',
      targetRel: 'linked-github',
      outsideArtifactRel: 'linked-github/agents/dude.agent.md',
      linkedArtifactRel: '.github/agents/dude.agent.md',
    },
    {
      name: 'agents',
      linkRel: '.github/agents',
      targetType: 'dir',
      targetRel: 'linked-agents',
      outsideArtifactRel: 'linked-agents/dude.agent.md',
      linkedArtifactRel: '.github/agents/dude.agent.md',
      stableArtifactRel: '.github/skills/dude-stale/SKILL.md',
    },
    {
      name: 'skills',
      linkRel: '.github/skills',
      targetType: 'dir',
      targetRel: 'linked-skills',
      outsideArtifactRel: 'linked-skills/dude-stale/SKILL.md',
      linkedArtifactRel: '.github/skills/dude-stale/SKILL.md',
      stableArtifactRel: '.github/agents/dude.agent.md',
    },
    {
      name: 'instructions',
      linkRel: '.github/instructions',
      targetType: 'dir',
      targetRel: 'linked-instructions',
      outsideArtifactRel: 'linked-instructions/dude.instructions.md',
      linkedArtifactRel: '.github/instructions/dude.instructions.md',
      stableArtifactRel: '.github/agents/dude.agent.md',
    },
  ];

  for (const testCase of cases) {
    await context.test(testCase.name, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-'));
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-outside-'));
      try {
        w(root, 'src/agents/dude.agent.md', 'new agent\n');
        w(root, 'src/instructions/dude.instructions.md', 'new instructions\n');
        w(root, 'src/skills/dude-lint/lint.mjs', 'new skill\n');
        w(root, '.dude/metadata/bundle-manifest.md', MANIFEST);
        w(outside, 'sentinel.txt', 'outside sentinel\n');
        w(outside, testCase.outsideArtifactRel, testCase.artifactContent ?? 'outside generated artifact\n');
        if (testCase.stableArtifactRel) {
          w(root, testCase.stableArtifactRel, 'preexisting generated artifact\n');
        }

        const link = path.join(root, testCase.linkRel);
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(
          path.join(outside, testCase.targetRel),
          link,
          /** @type {'file'|'dir'} */ (testCase.targetType),
        );

        const before = new Map([
          ['outside sentinel', fs.readFileSync(path.join(outside, 'sentinel.txt'))],
          ['linked artifact', fs.readFileSync(path.join(root, testCase.linkedArtifactRel))],
          ...(testCase.stableArtifactRel
            ? [['stable artifact', fs.readFileSync(path.join(root, testCase.stableArtifactRel))]]
            : []),
        ]);

        assert.throws(
          () => buildDev({ repoRoot: root }),
          /symbolic link|containment|escape|unsafe/i,
        );
        assert.deepEqual(fs.readFileSync(path.join(outside, 'sentinel.txt')), before.get('outside sentinel'));
        assert.deepEqual(fs.readFileSync(path.join(root, testCase.linkedArtifactRel)), before.get('linked artifact'));
        if (testCase.stableArtifactRel) {
          assert.deepEqual(
            fs.readFileSync(path.join(root, testCase.stableArtifactRel)),
            before.get('stable artifact'),
          );
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  }
});
