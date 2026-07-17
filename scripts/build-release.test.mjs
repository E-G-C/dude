// @ts-check
/**
 * Tests for scripts/build-release.mjs — the release bundler that stages the
 * deployable core bundle (core-tier minus tests + seeds) from this repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  isReleaseFile,
  seedManifest,
  parseManifestDocument,
  buildRelease,
  parseArgs,
  PROFILE_STUB,
  PROJECT_STUB,
} from './build-release.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const MANIFEST_DOCUMENT = '# Bundle Manifest\n\n```json\n{\n  "source_repo": "owner/repo",\n  "source_ref": "main",\n  "installed_ref": "main"\n}\n```\n';
const TEXT_EXTENSIONS = new Set(['.md', '.mjs', '.js', '.json', '.yml', '.yaml']);

/** @param {string} root @returns {string[]} */
function listRelativeFiles(root) {
  /** @type {string[]} */
  const files = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(absolutePath);
      else if (entry.isFile()) files.push(path.relative(root, absolutePath).split(path.sep).join('/'));
    }
  };
  scan(root);
  return files.sort();
}

/** @param {string} root @param {string} [manifestContent] */
function writeReleaseFixture(root, manifestContent = MANIFEST_DOCUMENT) {
  const agent = path.join(root, 'src/agents/dude.agent.md');
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.writeFileSync(agent, '# Dude\n');
  const manifest = path.join(root, '.dude/metadata/bundle-manifest.md');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, manifestContent);
}

test('isReleaseFile keeps core files and drops tests / packs / local / project-owned', () => {
  assert.equal(isReleaseFile('.github/agents/dude.agent.md'), true);
  assert.equal(isReleaseFile('.github/agents/dude-lead.agent.md'), true);
  assert.equal(isReleaseFile('.github/skills/dude-lint/lint.mjs'), true);
  assert.equal(isReleaseFile('.github/skills/dude-engine/lib/ownership.mjs'), true);
  assert.equal(isReleaseFile('.github/instructions/dude.instructions.md'), true);
  // test files excluded
  assert.equal(isReleaseFile('.github/skills/dude-lint/lint.test.mjs'), false);
  assert.equal(isReleaseFile('.github/skills/dude-engine/lib/tasks.test.mjs'), false);
  // packs / local / project-owned / workflows excluded
  assert.equal(isReleaseFile('.github/agents/dude-pack-beads-workflow.agent.md'), false);
  assert.equal(isReleaseFile('.github/skills/dude-local-foo/SKILL.md'), false);
  assert.equal(isReleaseFile('.github/skills/project/SKILL.md'), false);
  assert.equal(isReleaseFile('.dude/metadata/bundle-manifest.md'), false);
  assert.equal(isReleaseFile('.github/workflows/ci.yml'), false);
});

test('seedManifest forces the release channel and stamps installed_ref', () => {
  const out = seedManifest(MANIFEST_DOCUMENT, 'v1.2.0');
  assert.match(out, /"source_ref": "latest"/);
  assert.match(out, /"installed_ref": "v1\.2\.0"/);
});

test('seedManifest sets the channel even without a tag', () => {
  const out = seedManifest(MANIFEST_DOCUMENT);
  assert.match(out, /"source_ref": "latest"/);
  assert.match(out, /"installed_ref": "main"/); // left as-is when no tag is given
});

test('seedManifest changes only fenced JSON and safely serializes unusual tags', () => {
  const prose = '# Bundle Manifest\n\nProse source_ref and installed_ref must stay literal.\n\n';
  const tag = 'v1"quoted\\branch\nline';
  const output = seedManifest(`${prose}${MANIFEST_DOCUMENT.replace('# Bundle Manifest\n\n', '')}`, tag);
  assert.ok(output.startsWith(prose));
  const parsed = parseManifestDocument(output, 'test manifest');
  assert.equal(parsed.data.source_repo, 'owner/repo');
  assert.equal(parsed.data.source_ref, 'latest');
  assert.equal(parsed.data.installed_ref, tag);
});

test('seedManifest rejects missing and malformed fenced manifest JSON', () => {
  assert.throws(() => seedManifest('# Bundle Manifest\n'), /exactly one fenced JSON block/);
  assert.throws(
    () => seedManifest('# Bundle Manifest\n\n```json\n{"source_repo":\n```\n'),
    /JSON is malformed/,
  );
});

test('parseArgs flags unknown args and parses options', () => {
  assert.equal(parseArgs(['--bogus']).error, true);
  assert.equal(parseArgs(['--help']).help, true);
  const a = parseArgs(['--out', 'x', '--tag', 'v1.2.0', '--repo', 'r']);
  assert.equal(a.out, 'x');
  assert.equal(a.tag, 'v1.2.0');
  assert.equal(a.repo, 'r');
});

test('buildRelease stages a lint-clean core bundle with no test files', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-'));
  try {
    const r = buildRelease({ repoRoot, outDir, ref: 'v9.9.9' });
    assert.ok(r.files.length > 20, `expected many files, got ${r.files.length}`);
    const stagedFiles = listRelativeFiles(outDir);

    // no test files anywhere in the staged bundle
    const leaked = stagedFiles.filter((rel) => /\.test\./.test(rel));
    assert.deepEqual(leaked, [], `test files leaked: ${leaked.join(', ')}`);

    // key core artifacts present
    const has = (rel) => fs.existsSync(path.join(outDir, rel));
    assert.ok(has('.github/agents/dude.agent.md'));
    assert.ok(has('.github/instructions/dude.instructions.md'));
    assert.ok(has('.github/skills/dude-lint/lint.mjs'));
    assert.ok(has('.github/skills/dude-engine/lib/ownership.mjs'));
    assert.ok(has('.github/skills/dude-engine/lib/workspace-paths.mjs'));
    assert.ok(has('.github/skills/dude-engine/lib/feature-identity.mjs'));
    assert.ok(has('.github/skills/dude-engine/lib/feature.mjs'));
    assert.ok(has('.github/skills/dude-engine/feature.mjs'));

    const canonicalArtifacts = {
      coordinator: '.github/agents/dude.agent.md',
      instructions: '.github/instructions/dude.instructions.md',
      'feature definition': '.github/skills/dude-feature-definition/SKILL.md',
      'work intake': '.github/skills/dude-work-intake/SKILL.md',
    };
    for (const [label, rel] of Object.entries(canonicalArtifacts)) {
      const text = fs.readFileSync(path.join(outDir, rel), 'utf8');
      assert.match(text, /(?:@dude brainstorm <idea>|`brainstorm`)/, `${label} must expose brainstorm`);
      assert.match(text, /\.dude\/ideas\/<slug>\.md/, `${label} must use the canonical idea ledger`);
      assert.match(text, /## Idea/, `${label} must preserve the user-controlled idea section`);
      assert.doesNotMatch(text, /@dude draft\b/, `${label} must not expose the retired draft alias`);
      assert.doesNotMatch(text, /\.dude\/brief\b/, `${label} must not expose the retired idea root`);
      assert.doesNotMatch(text, /(?:^|\n)## Draft(?:\r?\n|$)/, `${label} must not define a draft workflow`);
    }

    const workspacePaths = fs.readFileSync(
      path.join(outDir, '.github/skills/dude-engine/lib/workspace-paths.mjs'),
      'utf8',
    );
    assert.match(workspacePaths, /const IDEAS_DIR = '\.dude\/ideas';/);
    assert.match(workspacePaths, /BUNDLE_MANIFEST: '\.dude\/metadata\/bundle-manifest\.md'/);

    // project skill is the generic stub, not this repo's own knowledge
    const proj = fs.readFileSync(path.join(outDir, '.github/skills/project/SKILL.md'), 'utf8');
    assert.equal(proj, PROJECT_STUB);
    assert.doesNotMatch(proj, /dude-spec-lead|reusable Dude Coder bundle/);
    assert.deepEqual(
      stagedFiles.filter((rel) => rel.startsWith('.github/skills/project/')),
      ['.github/skills/project/SKILL.md'],
    );
    assert.deepEqual(
      stagedFiles.filter((rel) => rel.startsWith('.github/skills/dude-local-')),
      [],
      'project-local skills must not ship',
    );

    // manifest seeded with the release version + release channel
    const man = fs.readFileSync(path.join(outDir, '.dude/metadata/bundle-manifest.md'), 'utf8');
    assert.match(man, /"installed_ref": "v9\.9\.9"/);
    assert.match(man, /"source_ref": "latest"/);
    assert.ok(fs.existsSync(path.join(outDir, '.dude/metadata/profile.md')));
    assert.equal(
      fs.readFileSync(path.join(outDir, '.dude/metadata/profile.md'), 'utf8'),
      PROFILE_STUB,
    );
    assert.deepEqual(
      fs.readdirSync(path.join(outDir, '.dude/metadata')).sort(),
      ['bundle-manifest.md', 'profile.md'],
    );
    assert.deepEqual(
      stagedFiles.filter((rel) => rel.startsWith('.dude/')),
      ['.dude/metadata/bundle-manifest.md', '.dude/metadata/profile.md'],
    );
    assert.deepEqual(
      stagedFiles.filter((rel) => path.posix.basename(rel) === 'bundle-manifest.md'),
      ['.dude/metadata/bundle-manifest.md'],
      'the staged bundle must contain exactly one canonical manifest',
    );
    for (const rel of [
      '.dude/ideas',
      '.dude/specs',
      '.dude/memory',
      '.dude/state',
      'library',
      'docs',
    ]) {
      assert.equal(fs.existsSync(path.join(outDir, rel)), false, `${rel} must not ship`);
    }

    const stagedTextFiles = stagedFiles.filter((rel) => TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase()));
    const stagedText = stagedTextFiles
      .map((rel) => fs.readFileSync(path.join(outDir, rel), 'utf8'))
      .join('\n');
    assert.match(stagedText, /dude-engine\/lib\/feature\.mjs/);
    for (const projectLeak of [
      'Brainstorm ideas intake',
      'T008@d4a7c930',
      'this repo uses the `authoring` pack',
    ]) {
      assert.equal(stagedText.includes(projectLeak), false, `project content leaked into release: ${projectLeak}`);
    }

    // the staged bundle itself passes lint
    const stagedLint = path.join(outDir, '.github/skills/dude-lint/lint.mjs');
    const lint = spawnSync(process.execPath, [stagedLint, outDir], { encoding: 'utf8' });
    assert.equal(lint.status, 0, (lint.stdout || '') + (lint.stderr || ''));

    const missingTerminalNewline = stagedTextFiles.filter((rel) => {
      const content = fs.readFileSync(path.join(outDir, rel));
      return content.length === 0 || content.at(-1) !== 0x0a;
    });
    assert.deepEqual(
      missingTerminalNewline,
      [],
      `staged text files missing terminal newline:\n${missingTerminalNewline.join('\n')}`,
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('buildRelease requires canonical manifest metadata before altering output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-source-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-output-'));
  try {
    const agent = path.join(root, 'src/agents/dude.agent.md');
    fs.mkdirSync(path.dirname(agent), { recursive: true });
    fs.writeFileSync(agent, '# Dude\n');
    const sentinel = path.join(outDir, 'keep.txt');
    fs.writeFileSync(sentinel, 'existing output\n');

    assert.throws(
      () => buildRelease({ repoRoot: root, outDir, ref: 'v1.0.0' }),
      /canonical.*bundle-manifest|bundle-manifest.*required/i,
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'existing output\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('CLI rejects --out . without altering an isolated repository fixture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-overlap-'));
  try {
    writeReleaseFixture(root);
    const sentinel = path.join(root, 'keep.txt');
    fs.writeFileSync(sentinel, 'do not delete\n');

    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts/build-release.mjs'), '--repo', '.', '--out', '.'],
      { cwd: root, encoding: 'utf8' },
    );

    assert.equal(result.status, 2, (result.stdout || '') + (result.stderr || ''));
    assert.match(result.stderr, /output.*overlap|overlap.*output|unsafe.*output/i);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'do not delete\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI rejects --out .. without altering an isolated repository or its parent', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-parent-'));
  const root = path.join(sandbox, 'repo');
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    const parentSentinel = path.join(sandbox, 'keep-parent.txt');
    const repoSentinel = path.join(root, 'keep-repo.txt');
    fs.writeFileSync(parentSentinel, 'parent\n');
    fs.writeFileSync(repoSentinel, 'repo\n');

    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts/build-release.mjs'), '--repo', '.', '--out', '..'],
      { cwd: root, encoding: 'utf8' },
    );

    assert.equal(result.status, 2, (result.stdout || '') + (result.stderr || ''));
    assert.match(result.stderr, /output.*overlap|overlap.*output|unsafe.*output/i);
    assert.equal(fs.readFileSync(parentSentinel, 'utf8'), 'parent\n');
    assert.equal(fs.readFileSync(repoSentinel, 'utf8'), 'repo\n');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('buildRelease rejects canonical state and source/config output directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-inputs-'));
  try {
    writeReleaseFixture(root);
    for (const name of ['.github', 'library', 'scripts', 'docs']) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, 'keep.txt'), `${name}\n`);
    }
    for (const name of ['.dude', 'src', '.github', 'library', 'scripts', 'docs']) {
      assert.throws(
        () => buildRelease({ repoRoot: root, outDir: path.join(root, name) }),
        /unsafe release output/i,
        name,
      );
    }
    assert.equal(fs.readFileSync(path.join(root, 'src/agents/dude.agent.md'), 'utf8'), '# Dude\n');
    assert.equal(fs.readFileSync(path.join(root, '.dude/metadata/bundle-manifest.md'), 'utf8'), MANIFEST_DOCUMENT);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildRelease rejects output whose symlinked ancestor resolves into repository inputs', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-symlink-'));
  const root = path.join(sandbox, 'repo');
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    fs.symlinkSync(path.join(root, 'src'), path.join(sandbox, 'source-link'), 'dir');
    const sourceSentinel = path.join(root, 'src/keep.txt');
    fs.writeFileSync(sourceSentinel, 'source\n');

    assert.throws(
      () => buildRelease({ repoRoot: root, outDir: path.join(sandbox, 'source-link/output') }),
      /unsafe release output/i,
    );
    assert.equal(fs.readFileSync(sourceSentinel, 'utf8'), 'source\n');
    assert.equal(fs.existsSync(path.join(root, 'src/output')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('buildRelease permits the in-repository dist directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-dist-'));
  try {
    writeReleaseFixture(root);
    const output = path.join(root, 'dist');
    const result = buildRelease({ repoRoot: root, outDir: output, ref: 'v2.0.0' });
    assert.equal(result.out, output);
    assert.ok(fs.existsSync(path.join(output, '.github/agents/dude.agent.md')));
    assert.equal(parseManifestDocument(fs.readFileSync(path.join(output, '.dude/metadata/bundle-manifest.md'))).data.installed_ref, 'v2.0.0');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildRelease permits and replaces a safe external output', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-external-'));
  const root = path.join(sandbox, 'repo');
  const output = path.join(sandbox, 'release');
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, 'old.txt'), 'old\n');

    buildRelease({ repoRoot: root, outDir: output });

    assert.equal(fs.existsSync(path.join(output, 'old.txt')), false);
    assert.ok(fs.existsSync(path.join(output, '.github/agents/dude.agent.md')));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('staging failure preserves prior output and removes the temporary stage', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-failure-'));
  const root = path.join(sandbox, 'repo');
  const output = path.join(sandbox, 'release');
  const originalCopyFileSync = fs.copyFileSync;
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    fs.mkdirSync(output);
    const sentinel = path.join(output, 'keep.txt');
    fs.writeFileSync(sentinel, 'prior output\n');
    fs.copyFileSync = () => { throw new Error('injected staging failure'); };

    assert.throws(
      () => buildRelease({ repoRoot: root, outDir: output }),
      /injected staging failure/,
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'prior output\n');
    assert.deepEqual(
      fs.readdirSync(sandbox).filter((name) => name.startsWith('.release.staging-')),
      [],
    );
  } finally {
    fs.copyFileSync = originalCopyFileSync;
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
