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
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  isReleaseFile,
  seedManifest,
  parseManifestDocument,
  buildRelease,
  listCoreOutputs,
  parseArgs,
  PROFILE_STUB,
  PROJECT_STUB,
} from './build-release.mjs';
import { loadAgentModelConfig } from '../src/skills/dude-engine/lib/agent-model-map.mjs';
import {
  copilotAgentPath,
  parseAgentSource,
  renderCopilotAgent,
} from '../src/skills/dude-engine/lib/agent-projection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const PRE_FEATURE_UPGRADE_REVISION = '4cd37d635fb6d446cfd1c52dedda47b775607dea';
const MANIFEST_DOCUMENT = '# Bundle Manifest\n\n```json\n{\n  "source_repo": "owner/repo",\n  "source_ref": "main",\n  "installed_ref": "main"\n}\n```\n';
const MODEL_CONFIG = Buffer.from([
  '{',
  '  "provenance": "Fixture model mapping observed on 2026-08-10.",',
  '  "classes": {',
  '    "inherit": {},',
  '    "balanced": { "effort": "medium" }',
  '  },',
  '  "targets": {',
  '    "copilot": {',
  '      "emits": ["model"],',
  '      "models": {',
  '        "inherit": null,',
  '        "balanced": "fixture-balanced"',
  '      }',
  '    }',
  '  }',
  '}',
  '',
].join('\r\n'));
const AGENT_SOURCE = '---\n'
  + 'name: "Dude"\n'
  + 'description: "Fixture coordinator."\n'
  + 'tools: ["read", "edit", "search"]\n'
  + 'agents: ["*"]\n'
  + 'user-invocable: true\n'
  + 'model-class: inherit\n'
  + '---\n'
  + '\nFixture coordinator body.\n';
const TEXT_EXTENSIONS = new Set(['.md', '.mjs', '.js', '.json', '.yml', '.yaml']);
const RECOVERY_SOURCE_REL = 'src/skills/dude-work/recovery.mjs';
const RECOVERY_TEST_SOURCE_REL = 'src/skills/dude-work/recovery.test.mjs';
const RECOVERY_DEPLOY_REL = '.github/skills/dude-work/recovery.mjs';
const RECOVERY_TEST_DEPLOY_REL = '.github/skills/dude-work/recovery.test.mjs';
const T007_PROJECTION_PAIRS = [
  ['src/skills/dude-bundle-import/SKILL.md', '.github/skills/dude-bundle-import/SKILL.md'],
  ['src/skills/dude-bundle-import/import.mjs', '.github/skills/dude-bundle-import/import.mjs'],
  ['src/skills/dude-bundle-import/lib/directory-import.mjs', '.github/skills/dude-bundle-import/lib/directory-import.mjs'],
  ['src/skills/dude-bundle-import/lib/directory-risk.mjs', '.github/skills/dude-bundle-import/lib/directory-risk.mjs'],
  ['src/skills/dude-bundle-import/lib/directory-source.mjs', '.github/skills/dude-bundle-import/lib/directory-source.mjs'],
  ['src/skills/dude-lint/lint.mjs', '.github/skills/dude-lint/lint.mjs'],
];

/** @param {string} root @param {string} rel @param {string | Uint8Array} content */
function w(root, rel, content) {
  const absolute = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

/** @param {string} root @returns {string[]} */
function listRelativeFiles(root) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} directory */
  const scan = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  scan(root);
  return files.sort();
}

/** @param {string} root @returns {Map<string, Buffer>} */
function snapshotFiles(root) {
  return new Map(listRelativeFiles(root).map((rel) => [rel, fs.readFileSync(path.join(root, ...rel.split('/')))]));
}

/** @param {string} root @param {string} [manifestContent] */
function writeReleaseFixture(root, manifestContent = MANIFEST_DOCUMENT) {
  w(root, 'src/config/agent-models.json', MODEL_CONFIG);
  w(root, 'src/agents/dude.agent.md', AGENT_SOURCE);
  w(root, 'src/skills/dude-lint/lint.mjs', 'export const lint = true;\n');
  w(root, '.dude/metadata/bundle-manifest.md', manifestContent);
}

/** @param {string} sourceRoot @param {string} destinationRoot @param {string} stem */
function assertCopilotProjection(sourceRoot, destinationRoot, stem) {
  const configPath = path.join(sourceRoot, 'src', 'config', 'agent-models.json');
  const config = loadAgentModelConfig(configPath);
  const source = fs.readFileSync(path.join(sourceRoot, 'src', 'agents', `${stem}.agent.md`));
  const expected = renderCopilotAgent(parseAgentSource(source, { stem, config }), config);
  const relPath = copilotAgentPath(stem);
  assert.deepEqual(fs.readFileSync(path.join(destinationRoot, ...relPath.split('/'))), expected, relPath);
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}:\n${result.stdout || ''}${result.stderr || ''}`);
  return result;
}

/** @param {string} root @param {string} branch */
function initializeRepository(root, branch) {
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'Bootstrap Fixture']);
  git(root, ['config', 'user.email', 'bootstrap@example.invalid']);
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '-m', 'fixture baseline']);
  git(root, ['branch', '-M', branch]);
}

/**
 * Read exact repository-local historical bytes. The fixture executes these
 * bytes; it does not recreate the historic ownership outcome in test code.
 * @param {string} sourcePath
 * @returns {Buffer}
 */
function historicalSource(sourcePath) {
  const result = spawnSync(
    'git',
    ['show', `${PRE_FEATURE_UPGRADE_REVISION}:${sourcePath}`],
    { cwd: repoRoot, encoding: null },
  );
  assert.equal(result.status, 0, `cannot read historical ${sourcePath}: ${String(result.stderr)}`);
  return /** @type {Buffer} */ (result.stdout);
}

/** @param {string} root */
function writeHistoricalUpgradeInstall(root) {
  const historicalFiles = [
    'src/skills/dude-bundle-upgrade/upgrade.mjs',
    'src/skills/dude-engine/lib/ownership.mjs',
    'src/skills/dude-engine/lib/release-channel.mjs',
    'src/skills/dude-engine/lib/workspace-paths.mjs',
  ];
  const upgrade = historicalSource(historicalFiles[0]);
  assert.match(upgrade.toString('utf8'), /enumerateCorePaths/);
  for (const sourcePath of historicalFiles) {
    w(root, sourcePath.replace(/^src\/skills\//, '.github/skills/'), historicalSource(sourcePath));
  }
}

/** @param {string} root */
function writeBootstrapPack(root) {
  w(root, 'library/packs/bootstrap/pack.md', '---\nname: bootstrap\ndescription: "bootstrap fixture"\n---\n# Bootstrap\n');
  w(
    root,
    'library/packs/bootstrap/agents/dude-pack-bootstrap-worker.agent.md',
    '---\n'
      + 'name: "Bootstrap Worker"\n'
      + 'description: "Fixture pack worker."\n'
      + 'tools: ["read", "search"]\n'
      + 'user-invocable: false\n'
      + 'model-class: balanced\n'
      + '---\n'
      + '\nBootstrap fixture body.\n',
  );
}

test('isReleaseFile keeps current core files and excludes dropped, pack, local, and project paths', () => {
  assert.equal(isReleaseFile('.github/agents/dude.agent.md'), true);
  assert.equal(isReleaseFile('.github/skills/dude-engine/config/agent-models.json'), true);
  assert.equal(isReleaseFile('.github/skills/dude-lint/lint.mjs'), true);
  assert.equal(isReleaseFile('.github/instructions/dude.instructions.md'), true);
  assert.equal(isReleaseFile('.github/skills/dude-lint/lint.test.mjs'), false);
  assert.equal(isReleaseFile('.claude/agents/dude.md'), false);
  assert.equal(isReleaseFile('.github/agents-sdk/dude.agent.json'), false);
  assert.equal(isReleaseFile('.github/config/agent-models.json'), false);
  assert.equal(isReleaseFile('.github/agents/dude-pack-beads-workflow.agent.md'), false);
  assert.equal(isReleaseFile('.github/agents/dude-local-foo.agent.md'), false);
  assert.equal(isReleaseFile('.github/skills/project/SKILL.md'), false);
  assert.equal(isReleaseFile('.dude/metadata/bundle-manifest.md'), false);
  assert.equal(isReleaseFile('.github/workflows/ci.yml'), false);
});

test('seedManifest forces the release channel and safely preserves the manifest envelope', () => {
  const tagged = seedManifest(MANIFEST_DOCUMENT, 'v1.2.0');
  assert.match(tagged, /"source_ref": "latest"/);
  assert.match(tagged, /"installed_ref": "v1\.2\.0"/);
  assert.match(seedManifest(MANIFEST_DOCUMENT), /"installed_ref": "main"/);

  const prose = '# Bundle Manifest\n\nProse source_ref and installed_ref stay literal.\n\n';
  const unusual = seedManifest(`${prose}${MANIFEST_DOCUMENT.replace('# Bundle Manifest\n\n', '')}`, 'v1"quoted\\branch\nline');
  assert.ok(unusual.startsWith(prose));
  assert.equal(parseManifestDocument(unusual, 'test manifest').data.source_ref, 'latest');
  assert.throws(() => seedManifest('# Bundle Manifest\n'), /exactly one fenced JSON block/);
  assert.throws(
    () => seedManifest('# Bundle Manifest\n\n```json\n{"source_repo":\n```\n'),
    /JSON is malformed/,
  );
});

test('parseArgs flags unknown arguments and parses release options', () => {
  assert.equal(parseArgs(['--bogus']).error, true);
  assert.equal(parseArgs(['--help']).help, true);
  const args = parseArgs(['--out', 'x', '--tag', 'v1.2.0', '--repo', 'r']);
  assert.equal(args.out, 'x');
  assert.equal(args.tag, 'v1.2.0');
  assert.equal(args.repo, 'r');
});

test('buildRelease preserves unrelated source bytes and excludes source tests', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-source-parity-'));
  try {
    const result = buildRelease({ repoRoot, outDir, ref: 'v0.0.0' });
    assert.ok(result.files.includes(RECOVERY_DEPLOY_REL));
    assert.equal(result.files.includes(RECOVERY_TEST_DEPLOY_REL), false);
    assert.equal(fs.statSync(path.join(repoRoot, RECOVERY_TEST_SOURCE_REL)).isFile(), true);
    for (const [sourceRel, deployRel] of [
      [RECOVERY_SOURCE_REL, RECOVERY_DEPLOY_REL],
      ...T007_PROJECTION_PAIRS,
    ]) {
      assert.deepEqual(
        fs.readFileSync(path.join(outDir, ...deployRel.split('/'))),
        fs.readFileSync(path.join(repoRoot, ...sourceRel.split('/'))),
        `${deployRel} must be byte-identical to ${sourceRel}`,
      );
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('buildRelease stages a lint-clean core bundle with one profile per source and exact packaged config', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-core-'));
  try {
    const result = buildRelease({ repoRoot, outDir, ref: 'v9.9.9' });
    const stagedFiles = listRelativeFiles(outDir);
    const canonicalConfig = fs.readFileSync(path.join(repoRoot, 'src/config/agent-models.json'));

    assert.ok(result.files.length > 20, `expected many files, got ${result.files.length}`);
    assert.deepEqual(stagedFiles.filter((rel) => /\.test\./.test(rel)), []);
    assert.deepEqual(
      stagedFiles.filter((rel) => (
        rel.startsWith('.claude/')
        || rel.startsWith('.github/agents-sdk/')
        || rel.startsWith('.github/config/')
      )),
      [],
    );
    for (const retiredRoot of ['.claude', '.github/agents-sdk', '.github/config']) {
      assert.equal(fs.existsSync(path.join(outDir, ...retiredRoot.split('/'))), false, `${retiredRoot} was created`);
    }
    assert.deepEqual(
      fs.readFileSync(path.join(outDir, '.github/skills/dude-engine/config/agent-models.json')),
      canonicalConfig,
    );
    assert.equal(fs.existsSync(path.join(outDir, '.github/config/agent-models.json')), false);

    const stems = fs.readdirSync(path.join(repoRoot, 'src/agents'))
      .filter((name) => name.endsWith('.agent.md'))
      .map((name) => name.slice(0, -'.agent.md'.length))
      .sort();
    assert.deepEqual(stems, ['dude', 'dude-reviewer', 'dude-spec-lead']);
    for (const stem of stems) assertCopilotProjection(repoRoot, outDir, stem);
    assert.deepEqual(
      stagedFiles.filter((rel) => rel.startsWith('.github/agents/')).sort(),
      stems.map(copilotAgentPath).sort(),
    );

    assert.equal(
      fs.readFileSync(path.join(outDir, '.github/skills/project/SKILL.md'), 'utf8'),
      PROJECT_STUB,
    );
    assert.equal(
      fs.readFileSync(path.join(outDir, '.dude/metadata/profile.md'), 'utf8'),
      PROFILE_STUB,
    );
    assert.match(PROFILE_STUB, /"installed": \{\}/);
    assert.doesNotMatch(PROFILE_STUB, /enabled_packs|inventory|digest|sha256/);
    const manifest = parseManifestDocument(
      fs.readFileSync(path.join(outDir, '.dude/metadata/bundle-manifest.md')),
      'staged manifest',
    );
    assert.equal(manifest.data.source_ref, 'latest');
    assert.equal(manifest.data.installed_ref, 'v9.9.9');
    assert.deepEqual(
      stagedFiles.filter((rel) => path.posix.basename(rel) === 'bundle-manifest.md'),
      ['.dude/metadata/bundle-manifest.md'],
      'must contain exactly one canonical manifest',
    );

    const canonicalArtifacts = {
      coordinator: '.github/agents/dude.agent.md',
      instructions: '.github/instructions/dude.instructions.md',
      'feature definition': '.github/skills/dude-feature-definition/SKILL.md',
      'work intake': '.github/skills/dude-work-intake/SKILL.md',
    };
    for (const [label, rel] of Object.entries(canonicalArtifacts)) {
      const text = fs.readFileSync(path.join(outDir, ...rel.split('/')), 'utf8');
      assert.match(text, /(?:@dude brainstorm <idea>|`brainstorm`)/, `${label} must expose brainstorm`);
      assert.match(text, /\.dude\/ideas\/<slug>\.md/, `${label} must use the canonical idea ledger`);
      assert.doesNotMatch(text, /@dude draft/);
      assert.doesNotMatch(text, /\.dude\/brief/);
      assert.doesNotMatch(text, /(?:^|\n)## Draft/);
    }

    const stagedLint = path.join(outDir, '.github/skills/dude-lint/lint.mjs');
    const lint = spawnSync(process.execPath, [stagedLint, outDir], { encoding: 'utf8' });
    assert.equal(lint.status, 0, (lint.stdout || '') + (lint.stderr || ''));

    const stagedTextFiles = stagedFiles.filter((rel) => TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase()));
    const missingTerminalNewline = stagedTextFiles.filter((rel) => {
      const bytes = fs.readFileSync(path.join(outDir, ...rel.split('/')));
      return bytes.length === 0 || bytes.at(-1) !== 0x0a;
    });
    assert.deepEqual(missingTerminalNewline, []);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('buildRelease requires canonical manifest metadata before altering output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-source-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-output-'));
  try {
    w(root, 'src/agents/dude.agent.md', '# invalid only after manifest check\n');
    w(outDir, 'keep.txt', 'existing output\n');

    assert.throws(
      () => buildRelease({ repoRoot: root, outDir, ref: 'v1.0.0' }),
      /canonical.*bundle-manifest|bundle-manifest.*required/i,
    );
    assert.equal(fs.readFileSync(path.join(outDir, 'keep.txt'), 'utf8'), 'existing output\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('release CLI refuses output overlap with a disposable repository or its parent', () => {
  for (const output of ['.', '..']) {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-overlap-'));
    const root = path.join(sandbox, 'repo');
    try {
      fs.mkdirSync(root);
      writeReleaseFixture(root);
      w(root, 'keep-repo.txt', 'repo\n');
      w(sandbox, 'keep-parent.txt', 'parent\n');

      const result = spawnSync(
        process.execPath,
        [path.join(repoRoot, 'scripts/build-release.mjs'), '--repo', '.', '--out', output],
        { cwd: root, encoding: 'utf8' },
      );
      assert.equal(result.status, 2, (result.stdout || '') + (result.stderr || ''));
      assert.match(result.stderr, /output.*overlap|overlap.*output|unsafe.*output/i);
      assert.equal(fs.readFileSync(path.join(root, 'keep-repo.txt'), 'utf8'), 'repo\n');
      assert.equal(fs.readFileSync(path.join(sandbox, 'keep-parent.txt'), 'utf8'), 'parent\n');
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  }
});

test('buildRelease rejects repository inputs and symlinked ancestors but permits dist', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-boundaries-'));
  const root = path.join(sandbox, 'repo');
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    for (const name of ['.github', 'library', 'scripts', 'docs']) {
      w(root, `${name}/keep.txt`, `${name}\n`);
    }
    for (const name of ['.dude', 'src', '.github', 'library', 'scripts', 'docs']) {
      assert.throws(
        () => buildRelease({ repoRoot: root, outDir: path.join(root, name) }),
        /unsafe release output/i,
        name,
      );
    }

    fs.symlinkSync(path.join(root, 'src'), path.join(sandbox, 'source-link'), 'dir');
    assert.throws(
      () => buildRelease({ repoRoot: root, outDir: path.join(sandbox, 'source-link/output') }),
      /unsafe release output/i,
    );
    assert.equal(fs.existsSync(path.join(root, 'src/output')), false);

    const dist = path.join(root, 'dist');
    const result = buildRelease({ repoRoot: root, outDir: dist, ref: 'v2.0.0' });
    assert.equal(result.out, dist);
    assert.ok(fs.existsSync(path.join(dist, '.github/agents/dude.agent.md')));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('buildRelease atomically replaces an external output and preserves it on staging failure', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-atomic-'));
  const root = path.join(sandbox, 'repo');
  const output = path.join(sandbox, 'release');
  const originalCopyFileSync = fs.copyFileSync;
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    w(output, 'old.txt', 'old\n');
    buildRelease({ repoRoot: root, outDir: output });
    assert.equal(fs.existsSync(path.join(output, 'old.txt')), false);
    assert.ok(fs.existsSync(path.join(output, '.github/agents/dude.agent.md')));

    w(output, 'keep.txt', 'prior output\n');
    fs.copyFileSync = () => { throw new Error('injected staging failure'); };
    assert.throws(
      () => buildRelease({ repoRoot: root, outDir: output }),
      /injected staging failure/,
    );
    assert.equal(fs.readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'prior output\n');
    assert.deepEqual(
      fs.readdirSync(sandbox).filter((name) => name.startsWith('.release.staging-')),
      [],
    );
  } finally {
    fs.copyFileSync = originalCopyFileSync;
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('listCoreOutputs plans one rendered profile per source, exact config bytes, and no dropped roots', () => {
  const outputs = listCoreOutputs(repoRoot);
  const byPath = new Map(outputs.map((output) => [output.relPath, output]));
  const configPath = '.github/skills/dude-engine/config/agent-models.json';
  const configOutput = byPath.get(configPath);

  assert.equal(Buffer.isBuffer(configOutput?.bytes), true);
  assert.equal(configOutput?.abs, undefined);
  assert.deepEqual(
    configOutput?.bytes,
    fs.readFileSync(path.join(repoRoot, 'src/config/agent-models.json')),
  );
  assert.equal(Boolean(byPath.get('.github/skills/dude-lint/lint.mjs')?.abs), true);
  assert.equal(byPath.get('.github/skills/dude-lint/lint.mjs')?.bytes, undefined);

  const stems = fs.readdirSync(path.join(repoRoot, 'src/agents'))
    .filter((name) => name.endsWith('.agent.md'))
    .map((name) => name.slice(0, -'.agent.md'.length));
  for (const stem of stems) {
    const profile = byPath.get(copilotAgentPath(stem));
    assert.equal(Buffer.isBuffer(profile?.bytes), true, `${stem} is rendered`);
    assert.equal(profile?.abs, undefined, `${stem} is not copied`);
  }
  assert.deepEqual(
    outputs.map(({ relPath }) => relPath),
    [...outputs.map(({ relPath }) => relPath)].sort(),
    'planned outputs are deterministically ordered',
  );
  assert.equal(new Set(outputs.map(({ relPath }) => relPath)).size, outputs.length);
  assert.deepEqual(
    outputs.map(({ relPath }) => relPath).filter((relPath) => (
      relPath.startsWith('.claude/')
      || relPath.startsWith('.github/agents-sdk/')
      || relPath.startsWith('.github/config/')
    )),
    [],
  );
});

test('buildRelease rejects malformed canonical config before staging and leaves prior output byte-identical', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-invalid-config-'));
  const root = path.join(sandbox, 'repo');
  const output = path.join(sandbox, 'release');
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    buildRelease({ repoRoot: root, outDir: output });
    const before = snapshotFiles(output);

    w(root, 'src/config/agent-models.json', '{ malformed JSON\n');
    assert.throws(
      () => buildRelease({ repoRoot: root, outDir: output }),
      /agent model configuration .*malformed JSON/i,
    );

    assert.deepEqual(snapshotFiles(output), before);
    assert.deepEqual(
      fs.readdirSync(sandbox).filter((name) => name.startsWith('.release.staging-')),
      [],
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('buildRelease validates the complete core agent set before staging', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-agent-set-'));
  const root = path.join(sandbox, 'repo');
  const output = path.join(sandbox, 'release');
  try {
    fs.mkdirSync(root);
    writeReleaseFixture(root);
    w(
      root,
      'src/agents/dude-twin.agent.md',
      AGENT_SOURCE.replace('agents: ["*"]\n', '').replace('model-class: inherit', 'model-class: balanced'),
    );
    w(output, 'keep.txt', 'prior output\n');
    const before = snapshotFiles(output);

    assert.throws(() => buildRelease({ repoRoot: root, outDir: output }), /duplicates display name 'Dude'/);

    assert.deepEqual(snapshotFiles(output), before);
    assert.deepEqual(
      fs.readdirSync(sandbox).filter((name) => name.startsWith('.release.staging-')),
      [],
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('buildRelease is byte-stable across repeated valid disposable outputs', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-determinism-'));
  const first = path.join(sandbox, 'first');
  const second = path.join(sandbox, 'second');
  try {
    const firstResult = buildRelease({ repoRoot, outDir: first, ref: 'v3.3.3' });
    const secondResult = buildRelease({ repoRoot, outDir: second, ref: 'v3.3.3' });

    assert.deepEqual(secondResult.files, firstResult.files);
    assert.deepEqual(snapshotFiles(second), snapshotFiles(first));
    assert.deepEqual(
      fs.readFileSync(path.join(second, '.github/skills/dude-engine/config/agent-models.json')),
      fs.readFileSync(path.join(repoRoot, 'src/config/agent-models.json')),
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the last pre-feature installed upgrader installs candidate engine config and reaches upgraded compose add', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-historical-bootstrap-'));
  const candidate = path.join(sandbox, 'candidate');
  const workspace = path.join(sandbox, 'workspace');
  const cache = path.join(sandbox, 'cache');
  const planPath = path.join(sandbox, 'historical-plan.json');
  try {
    buildRelease({ repoRoot, outDir: candidate, ref: 'v9.9.9' });
    initializeRepository(candidate, 'bootstrap');

    fs.mkdirSync(workspace);
    writeHistoricalUpgradeInstall(workspace);
    w(workspace, '.github/agents/dude.agent.md', 'historical core profile\n');
    w(
      workspace,
      '.github/skills/project/SKILL.md',
      fs.readFileSync(path.join(candidate, '.github/skills/project/SKILL.md')),
    );
    w(
      workspace,
      '.dude/metadata/profile.md',
      fs.readFileSync(path.join(candidate, '.dude/metadata/profile.md')),
    );
    w(
      workspace,
      '.dude/metadata/bundle-manifest.md',
      '# Bundle Manifest\n\n```json\n{\n  "source_repo": "fixture/candidate",\n  "source_ref": "bootstrap",\n  "installed_ref": "v0.0.0"\n}\n```\n',
    );
    initializeRepository(workspace, 'main');
    fs.mkdirSync(cache);

    const historicalUpgrade = path.join(
      workspace,
      '.github/skills/dude-bundle-upgrade/upgrade.mjs',
    );
    const common = {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: cache },
    };
    const planned = spawnSync(process.execPath, [
      historicalUpgrade,
      'plan',
      '--source',
      candidate,
      '--ref',
      'bootstrap',
      '--format',
      'json',
      '--out',
      planPath,
    ], common);
    assert.equal(planned.status, 10, (planned.stdout || '') + (planned.stderr || ''));
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const expectedHistoricalAdds = [
      '.github/skills/dude-engine/lib/agent-model-map.mjs',
      '.github/skills/dude-engine/lib/agent-projection.mjs',
      '.github/skills/dude-engine/config/agent-models.json',
    ];
    for (const relPath of expectedHistoricalAdds) {
      assert.ok(
        plan.buckets.add.some((entry) => entry.path === relPath),
        `historical core enumerator did not plan ${relPath}`,
      );
    }

    const applied = spawnSync(process.execPath, [
      historicalUpgrade,
      'apply',
      '--plan',
      planPath,
      '--confirm',
      'confirm-upgrade',
      '--format',
      'json',
    ], common);
    assert.equal(applied.status, 0, (applied.stdout || '') + (applied.stderr || ''));
    for (const relPath of expectedHistoricalAdds) {
      assert.deepEqual(
        fs.readFileSync(path.join(workspace, ...relPath.split('/'))),
        fs.readFileSync(path.join(candidate, ...relPath.split('/'))),
        `historical upgrader did not install candidate bytes for ${relPath}`,
      );
    }

    writeBootstrapPack(workspace);
    const composePath = path.join(workspace, '.github/skills/dude-compose/compose.mjs');
    const compose = await import(`${pathToFileURL(composePath).href}?historical-bootstrap`);
    const added = await compose.cmdAdd({
      root: workspace,
      library: path.join(workspace, 'library', 'packs'),
      name: 'bootstrap',
      force: false,
      fetch: false,
    });
    assert.equal(added.ok, true, added.error);

    const packSource = fs.readFileSync(
      path.join(workspace, 'library/packs/bootstrap/agents/dude-pack-bootstrap-worker.agent.md'),
    );
    const modelLoader = await import(
      `${pathToFileURL(path.join(workspace, '.github/skills/dude-engine/lib/agent-model-map.mjs')).href}?historical-bootstrap`,
    );
    const renderer = await import(
      `${pathToFileURL(path.join(workspace, '.github/skills/dude-engine/lib/agent-projection.mjs')).href}?historical-bootstrap`,
    );
    const config = modelLoader.loadAgentModelConfig(
      path.join(workspace, '.github/skills/dude-engine/config/agent-models.json'),
    );
    const expectedProfile = renderer.renderCopilotAgent(
      renderer.parseAgentSource(packSource, {
        stem: 'dude-pack-bootstrap-worker',
        config,
      }),
      config,
    );
    const packProfile = path.join(
      workspace,
      '.github/agents/dude-pack-bootstrap-worker.agent.md',
    );
    assert.deepEqual(fs.readFileSync(packProfile), expectedProfile);
    assert.equal(fs.readFileSync(packProfile, 'utf8').includes('model-class'), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
