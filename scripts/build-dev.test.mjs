// @ts-check
/**
 * Tests for scripts/build-dev.mjs — the dev-bundle sync (src/ core -> .github/).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDev } from './build-dev.mjs';
import { listCoreOutputs, listCoreSourceFiles } from './build-release.mjs';
import {
  enumerateCorePaths,
  isCorePath,
  isLocalPath,
  isPackPath,
} from '../src/skills/dude-engine/lib/ownership.mjs';
import { loadAgentModelConfig } from '../src/skills/dude-engine/lib/agent-model-map.mjs';
import {
  copilotAgentPath,
  parseAgentSource,
  renderCopilotAgent,
} from '../src/skills/dude-engine/lib/agent-projection.mjs';
import { renderDevelopmentBaseRelease } from '../src/skills/dude-engine/lib/development-base-release.mjs';

/** @param {string} root @param {string} rel @param {string | Uint8Array} content */
function w(root, rel, content) {
  const absolute = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

/** @param {string} root @param {string} rel */
function has(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')));
}

/** @param {string | Uint8Array} content @returns {string} */
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** @param {Buffer} actual @param {Buffer} expected @param {string} label */
function assertExactBytes(actual, expected, label) {
  if (actual.equals(expected)) return;
  assert.fail(
    `${label} bytes differ (`
    + `actual: length=${actual.length}, sha256=${sha256(actual)}; `
    + `expected: length=${expected.length}, sha256=${sha256(expected)})`,
  );
}

/**
 * Snapshot files, directories, and links without following links.
 * @param {string} root
 * @returns {Array<{ path: string, type: string, bytes?: Buffer, target?: string }>}
 */
function snapshotTree(root) {
  /** @type {Array<{ path: string, type: string, bytes?: Buffer, target?: string }>} */
  const rows = [];
  /** @param {string} directory @param {string} prefix */
  const scan = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        rows.push({ path: relative, type: 'symlink', target: fs.readlinkSync(absolute) });
      } else if (stat.isDirectory()) {
        rows.push({ path: relative, type: 'directory' });
        scan(absolute, relative);
      } else {
        assert.equal(stat.isFile(), true, `unsupported fixture path type: ${relative}`);
        rows.push({ path: relative, type: 'file', bytes: fs.readFileSync(absolute) });
      }
    }
  };
  if (fs.existsSync(root)) scan(root, '');
  return rows;
}

/** @param {string} root @param {string} stem */
function assertCopilotProjection(root, stem) {
  const configPath = path.join(root, 'src', 'config', 'agent-models.json');
  const config = loadAgentModelConfig(configPath);
  const source = fs.readFileSync(path.join(root, 'src', 'agents', `${stem}.agent.md`));
  const expected = renderCopilotAgent(parseAgentSource(source, { stem, config }), config);
  const relPath = copilotAgentPath(stem);
  assertExactBytes(fs.readFileSync(path.join(root, ...relPath.split('/'))), expected, relPath);
}

const MANIFEST = '# Bundle Manifest\n\n```json\n{"source_repo":"https://example.invalid/dude","source_ref":"main","installed_ref":"main"}\n```\n';
const REVIEW_UI_FILES = Object.freeze([
  'NOTICE.txt',
  'bridge.mjs',
  'capture.mjs',
  'engine.mjs',
  'geometry.mjs',
  'inspector.mjs',
  'panel.mjs',
  'shapes.mjs',
  'styles.css',
]);
const REVIEW_LIB_FILES = Object.freeze([
  'lib/review.mjs',
  'lib/review/browser.mjs',
  'lib/review/data.mjs',
  'lib/review/png.mjs',
]);
/** The delivered A2A surface: wiring, modules, the fixed SDK loader, the lazily imported runtime, and its notice. */
const A2A_RUNTIME_FILES = Object.freeze([
  'extension.mjs',
  'lib/a2a.mjs',
  'lib/a2a-transport.mjs',
  'lib/a2a-verify.mjs',
  'lib/a2a-peer-worker.mjs',
  'lib/a2a-sdk-loader.mjs',
  'lib/a2a-collaboration.mjs',
  'lib/a2a-transcript.mjs',
  'lib/a2a-pairing.mjs',
  'lib/a2a-runtime.mjs',
  'lib/a2a-runtime.mjs.LEGAL.txt',
]);
const A2A_TEST_FILES = Object.freeze([
  'a2a.test.mjs', 'a2a-transport.test.mjs', 'a2a-verify.test.mjs', 'a2a-peer-worker.test.mjs', 'a2a-sdk-loader.test.mjs', 'a2a-collaboration.test.mjs',
  'a2a-transcript.test.mjs', 'a2a-collaboration-tls.test.mjs', 'a2a-pairing.test.mjs',
]);
/** Repository-only A2A inputs: the runtime build and the maintainer qualification preview, native branch, and observer. None may reach generated output. */
const A2A_BUILD_INPUTS = Object.freeze(['.gitignore', 'build.mjs', 'build.test.mjs', 'entry.mjs', 'package-lock.json', 'package.json',
  'qualify-collaboration.mjs', 'qualify-collaboration.test.mjs', 'native-collaboration.mjs', 'native-collaboration.test.mjs', 'native-observer.ps1',
  'native-observer.test.mjs']);
const MODEL_CONFIG = Buffer.from([
  '{',
  '  "provenance": "Fixture model mapping observed on 2026-08-10.",',
  '  "classes": {',
  '    "inherit": {},',
  '    "balanced": { "effort": "medium" },',
  '    "reasoning": { "effort": "high" }',
  '  },',
  '  "targets": {',
  '    "copilot": {',
  '      "emits": ["model"],',
  '      "models": {',
  '        "inherit": null,',
  '        "balanced": "fixture-balanced",',
  '        "reasoning": "fixture-reasoning"',
  '      }',
  '    }',
  '  }',
  '}',
  '',
].join('\r\n'));

/**
 * Minimal well-formed agent source. Every fixture has valid parser input so a
 * failure identifies the build boundary rather than an unrelated fixture gap.
 * @param {{ stem: string, name: string, modelClass?: string, tools?: string, extra?: string, body?: string }} options
 * @returns {string}
 */
function agentSource({ stem, name, modelClass = 'balanced', tools = '["read", "search"]', extra = '', body }) {
  return '---\n'
    + `name: "${name}"\n`
    + `description: "Fixture agent ${stem}."\n`
    + `tools: ${tools}\n`
    + 'user-invocable: false\n'
    + `model-class: ${modelClass}\n`
    + `${extra}---\n`
    + (body ?? `\nFixture body for ${stem}.\n`);
}

/** @param {string} root @param {Buffer} [bytes] */
function writeCanonicalConfig(root, bytes = MODEL_CONFIG) {
  w(root, 'src/config/agent-models.json', bytes);
}

/** @param {string} root */
function writeBuildMetadata(root) {
  w(root, '.dude/metadata/bundle-manifest.md', MANIFEST);
}

const BASE_RELEASE_PATH = '.dude/metadata/development-base-release.md';
const FIXTURE_SOURCE = 'https://example.invalid/dude';

/** @param {string} baseRelease */
function baseReleaseBytes(baseRelease) {
  return Buffer.from(renderDevelopmentBaseRelease({ source_repo: FIXTURE_SOURCE, base_release: baseRelease }));
}

/**
 * Git with checkout conversion pinned off, so fixture bytes stay LF even on a
 * host whose Git configuration sets `core.autocrlf=true`.
 * @param {string} cwd @param {string[]} args @returns {string}
 */
function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}`);
  return result.stdout.trim();
}

/** @param {string} root @param {string} message */
function commitAll(root, message) {
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '--allow-empty', '-m', message]);
}

/** Make `root` a source checkout with one commit. @param {string} root */
function initSourceRepository(root) {
  git(root, ['init', '--quiet', '-b', 'main']);
  git(root, ['config', 'user.name', 'Build Fixture']);
  git(root, ['config', 'user.email', 'build-fixture@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  commitAll(root, 'source');
}

/**
 * A minimal development source plus project metadata the build must keep.
 * @param {string} root
 * @param {string} [manifestText]
 * @returns {Map<string, Buffer>}
 */
function writeProvenanceFixture(root, manifestText = MANIFEST) {
  writeCanonicalConfig(root);
  w(root, 'src/skills/dude-lint/lint.mjs', 'export const lint = true;\n');
  const preserved = new Map([
    ['.dude/metadata/bundle-manifest.md', Buffer.from(manifestText)],
    ['.dude/metadata/profile.md', Buffer.from('# Install Profile\n\n```json\n{\n  "installed": {}\n}\n```\n')],
    ['.dude/metadata/upgrade-log.md', Buffer.from('# Upgrade Log\n')],
    ['.dude/memory/context.md', Buffer.from('project memory\n')],
  ]);
  for (const [rel, bytes] of preserved) w(root, rel, bytes);
  return preserved;
}

/** @param {string} root @param {Map<string, Buffer>} preserved */
function assertPreserved(root, preserved) {
  for (const [rel, bytes] of preserved) {
    assertExactBytes(fs.readFileSync(path.join(root, ...rel.split('/'))), bytes, rel);
  }
}

/**
 * Run a synchronous build with temporary process environment overrides.
 * @template T
 * @param {Record<string, string>} overrides
 * @param {() => T} action
 * @returns {T}
 */
function withEnvironment(overrides, action) {
  const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, overrides);
    return action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** @param {string} root @param {{ includeExcluded?: boolean }} [options] */
function writeDudeExtensionFixture(root, { includeExcluded = false } = {}) {
  const runtime = {
    'src/extensions/dude/extension.mjs': 'extension runtime\n',
    'src/extensions/dude/lib/canvas-server.mjs': 'server runtime\n',
    'src/extensions/dude/lib/nested/projection.json': '{"runtime":true}\n',
    'src/extensions/dude/ui/index.html': '<!doctype html>\n',
    'src/extensions/dude/ui/assets/app.js': 'browser runtime\n',
    'src/extensions/dude/ui/assets/licenses/NOTICE.txt': 'notice runtime\n',
    ...Object.fromEntries(REVIEW_LIB_FILES.map((relative) => [
      `src/extensions/dude/${relative}`,
      `${relative} review runtime\n`,
    ])),
    ...Object.fromEntries(REVIEW_UI_FILES.map((filename) => [
      `src/extensions/dude/ui/review/${filename}`,
      `${filename} review static\n`,
    ])),
  };
  for (const [relPath, bytes] of Object.entries(runtime)) w(root, relPath, bytes);
  if (includeExcluded) {
    for (const [relPath, bytes] of Object.entries({
      'src/extensions/dude/canvas-server.test.mjs': 'root test\n',
      'src/extensions/dude/lib/nested/projection.test.mjs': 'nested test\n',
      'src/extensions/dude/lib/source.mjs.map': 'source map\n',
      'src/extensions/dude/lib/node_modules/dependency/index.mjs': 'dependency\n',
      'src/extensions/dude/lib/review/unlisted.mjs': 'unlisted review helper\n',
      'src/extensions/dude/lib/review/nested/extra.mjs': 'nested unlisted review helper\n',
      'src/extensions/dude/frontend/app.jsx': 'frontend source\n',
      'src/extensions/dude/ui/preview.html': 'other UI\n',
      'src/extensions/dude/ui/review/unlisted.mjs': 'unlisted review static\n',
      'src/extensions/dude/ui/review/nested/extra.mjs': 'nested review static\n',
      'src/extensions/dude/ui/review/engine.test.mjs': 'review test\n',
      'src/extensions/dude/ui/review/package.json': '{}\n',
      'src/extensions/dude/ui/review/node_modules/dependency/index.mjs': 'dependency\n',
      'src/extensions/dude/ui/assets/app.js.map': 'asset map\n',
      'src/extensions/dude/ui/assets/node_modules/dependency/index.js': 'dependency\n',
      'src/extensions/other/extension.mjs': 'other extension\n',
      'scripts/dude-canvas-ui/package.json': '{}\n',
      'scripts/dude-canvas-ui/package-lock.json': '{}\n',
      'scripts/dude-canvas-ui/build.mjs': 'build input\n',
    })) w(root, relPath, bytes);
  }
  return runtime;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

test('buildDev renders Copilot profiles, packages exact config bytes, and preserves foreign tiers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-single-tree-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    w(root, 'src/agents/dude.agent.md', agentSource({
      stem: 'dude',
      name: 'Dude',
      modelClass: 'inherit',
      extra: 'agents: ["*"]\n',
    }));
    w(root, 'src/agents/dude-lead.agent.md', agentSource({ stem: 'dude-lead', name: 'Lead' }));
    w(root, 'src/instructions/dude.instructions.md', 'I');
    w(root, 'src/skills/dude-lint/lint.mjs', 'L');
    w(root, 'src/skills/dude-lint/lint.test.mjs', 'T');
    w(root, '.github/agents/dude-obsolete.agent.md', 'stale core profile\n');
    w(root, '.github/skills/dude-stale/SKILL.md', 'stale core skill\n');
    w(root, '.github/skills/dude-lint/old.mjs', 'stale core file\n');

    const protectedBytes = new Map([
      ['.github/agents/dude-pack-fixture.agent.md', Buffer.from('pack profile\n')],
      ['.github/agents/dude-local-fixture.agent.md', Buffer.from('local profile\n')],
      ['.github/agents/project-fixture.agent.md', Buffer.from('project profile\n')],
      ['.github/skills/project/SKILL.md', Buffer.from('project skill\n')],
      ['.github/workflows/ci.yml', Buffer.from('name: fixture\n')],
      ['.dude/memory/context.md', Buffer.from('project memory\n')],
      ['.claude/agents/dude-obsolete.md', Buffer.from('unmanaged retired target\n')],
      ['.github/agents-sdk/dude-obsolete.agent.json', Buffer.from('{"unmanaged":true}\n')],
    ]);
    for (const [rel, bytes] of protectedBytes) w(root, rel, bytes);

    const result = buildDev({ repoRoot: root });

    for (const stem of ['dude', 'dude-lead']) assertCopilotProjection(root, stem);
    assertExactBytes(
      fs.readFileSync(path.join(root, '.github/skills/dude-engine/config/agent-models.json')),
      MODEL_CONFIG,
      'packaged model config',
    );
    assert.equal(has(root, '.github/config/agent-models.json'), false);
    assert.equal(has(root, '.github/skills/dude-lint/lint.test.mjs'), false);
    assert.equal(has(root, '.github/agents/dude-obsolete.agent.md'), false);
    assert.equal(has(root, '.github/skills/dude-stale/SKILL.md'), false);
    assert.equal(has(root, '.github/skills/dude-lint/old.mjs'), false);
    assert.ok(result.written.includes('.github/skills/dude-engine/config/agent-models.json'));
    assert.ok(result.written.includes('.github/agents/dude.agent.md'));
    assert.ok(!result.written.some((rel) => (
      rel.startsWith('.claude/')
      || rel.startsWith('.github/agents-sdk/')
      || rel.startsWith('.github/config/')
    )));

    for (const [rel, bytes] of protectedBytes) {
      assertExactBytes(fs.readFileSync(path.join(root, ...rel.split('/'))), bytes, rel);
    }
    assert.equal(isPackPath('.github/agents/dude-pack-fixture.agent.md'), true);
    assert.equal(isLocalPath('.github/agents/dude-local-fixture.agent.md'), true);
    assert.equal(isCorePath('.github/agents/project-fixture.agent.md'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checked-in dev core is a byte-identical non-mutating projection of authoritative source', async () => {
  const checkedInBefore = snapshotTree(path.join(repoRoot, '.github'));
  const checkedInOutputs = listCoreOutputs(repoRoot);
  const checkedInPaths = checkedInOutputs.map(({ relPath }) => relPath);

  assert.ok(checkedInOutputs.length > 20, `expected authoritative core outputs, got ${checkedInOutputs.length}`);
  assert.deepEqual(
    checkedInPaths.filter((rel) => /\.test\./.test(rel)),
    [],
    'source test files must not have deploy destinations',
  );
  for (const output of checkedInOutputs) {
    const expected = output.abs ? fs.readFileSync(output.abs) : /** @type {Buffer} */ (output.bytes);
    assertExactBytes(
      fs.readFileSync(path.join(repoRoot, ...output.relPath.split('/'))),
      expected,
      output.relPath,
    );
  }
  assert.deepEqual(enumerateCorePaths(repoRoot), checkedInPaths);
  assert.deepEqual(snapshotTree(path.join(repoRoot, '.github')), checkedInBefore);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-complete-'));
  try {
    fs.cpSync(path.join(repoRoot, 'src'), path.join(root, 'src'), { recursive: true });
    const fixtureDirectory = 'scripts/fixtures/064-work-receipt-overflow-handling';
    const fixturePaths = [
      ...['README.md', 'reference.json', 'retention-episode.json', 'model-view-test-helpers.mjs']
        .map(filename => `${fixtureDirectory}/${filename}`),
      'scripts/fixtures/065-work-history-event-compaction/retained-incident.json',
    ];
    const fixtureHashes = new Set(fixturePaths
      .map(relative => {
        const bytes = fs.readFileSync(path.join(repoRoot, relative));
        w(root, relative, bytes);
        return sha256(bytes);
      }));
    w(
      root,
      '.dude/metadata/bundle-manifest.md',
      fs.readFileSync(path.join(repoRoot, '.dude/metadata/bundle-manifest.md')),
    );

    const result = buildDev({ repoRoot: root });
    const outputs = listCoreOutputs(root);
    const expectedPaths = outputs.map(({ relPath }) => relPath);

    assert.ok(outputs.length > 20, `expected authoritative core outputs, got ${outputs.length}`);
    assert.deepEqual(result.written, expectedPaths);
    assert.deepEqual(
      expectedPaths.filter((rel) => (
        rel.startsWith('.claude/')
        || rel.startsWith('.github/agents-sdk/')
        || rel.startsWith('.github/config/')
      )),
      [],
    );
    for (const retiredRoot of ['.claude', '.github/agents-sdk', '.github/config']) {
      assert.equal(has(root, retiredRoot), false, `${retiredRoot} was created`);
    }
    for (const output of outputs) {
      const expected = output.abs ? fs.readFileSync(output.abs) : /** @type {Buffer} */ (output.bytes);
      assertExactBytes(
        fs.readFileSync(path.join(root, ...output.relPath.split('/'))),
        expected,
        output.relPath,
      );
    }
    for (const { deployRel } of listCoreSourceFiles(root)) {
      const stem = /^\.github\/agents\/([^/]+)\.agent\.md$/.exec(deployRel)?.[1];
      if (stem) assertCopilotProjection(root, stem);
    }
    assert.deepEqual(enumerateCorePaths(root), expectedPaths);
    const postimageFiles = [
      'skills/dude-engine/lib/lightweight-work-postimage.mjs',
      'skills/dude-lightweight-execution/board.mjs',
      'skills/dude-work/recovery.mjs',
    ];
    /** @type {Set<string>} */
    const visited = new Set();
    /** @type {Set<string>} */
    const visiting = new Set();
    /** @param {string} absolute */
    const checkImports = absolute => {
      assert.equal(visiting.has(absolute), false, `cyclic generated import: ${absolute}`);
      if (visited.has(absolute)) return;
      visiting.add(absolute);
      const text = fs.readFileSync(absolute, 'utf8');
      for (const [, specifier] of text.matchAll(/(?:\bfrom\s+|\bimport\s*)['"](\.[^'"]+)['"]/g)) {
        checkImports(path.resolve(path.dirname(absolute), specifier));
      }
      visiting.delete(absolute);
      visited.add(absolute);
    };
    for (const relative of postimageFiles) {
      const deployed = `.github/${relative}`;
      assert.ok(result.written.includes(deployed), deployed);
      const absolute = path.join(root, deployed);
      assertExactBytes(fs.readFileSync(absolute), fs.readFileSync(path.join(repoRoot, 'src', relative)), deployed);
      checkImports(absolute);
      const loaded = await import(pathToFileURL(absolute).href);
      assert.equal(typeof loaded[relative.includes('postimage') ? 'buildLightweightWorkPostimages'
        : relative.endsWith('board.mjs') ? 'applyLightweightWorkRequest' : 'modelPacket'], 'function');
    }
    for (const relative of postimageFiles.slice(1)) {
      assert.match(fs.readFileSync(path.join(root, '.github', relative), 'utf8'),
        /import \{ buildLightweightWorkPostimages \} from '\.\.\/dude-engine\/lib\/lightweight-work-postimage\.mjs'/);
    }
    // Feature 094: the delivered terminal-work outputs are named exact projections in both the
    // fresh build and the checked-in core, and the generated driver loads only generated modules.
    for (const relative of [
      'skills/dude-lightweight-execution/SKILL.md',
      'skills/dude-work-intake/SKILL.md',
      'skills/dude-work/COOKBOOK.md',
      'skills/dude-work/SKILL.md',
      'skills/dude-work/driver.mjs',
      'skills/dude-work/host-adapter-runner.mjs',
      'skills/dude-work/host-adapter.mjs',
    ]) {
      const deployed = `.github/${relative}`;
      assert.ok(result.written.includes(deployed), deployed);
      const source = fs.readFileSync(path.join(repoRoot, 'src', relative));
      assertExactBytes(fs.readFileSync(path.join(root, deployed)), source, deployed);
      assertExactBytes(fs.readFileSync(path.join(repoRoot, deployed)), source, `checked-in ${deployed}`);
    }
    const generatedDriver = path.join(root, '.github/skills/dude-work/driver.mjs');
    checkImports(generatedDriver);
    for (const module of ['host-adapter-runner.mjs', 'host-adapter.mjs', 'recovery.mjs', 'specialist-attestation.mjs']) {
      assert.ok(visited.has(path.join(root, '.github/skills/dude-work', module)), `the generated driver imports the generated ${module}`);
    }
    assert.equal(has(root, '.github/skills/dude-work/driver.test.mjs'), false, 'driver.test.mjs stays build-time only');
    // T007: the generated advice checks reuse the generated A2A modules across the skill/extension boundary,
    // and only an advised capture loads them.
    const adviceModule = path.join(root, '.github/skills/dude-feature-definition/capture-number-advice.mjs');
    assertExactBytes(fs.readFileSync(adviceModule), fs.readFileSync(path.join(repoRoot, 'src/skills/dude-feature-definition/capture-number-advice.mjs')),
      'generated capture-number-advice.mjs');
    checkImports(adviceModule);
    for (const reused of ['a2a-collaboration.mjs', 'a2a-transcript.mjs', 'a2a-transport.mjs']) {
      assert.ok(visited.has(path.join(root, '.github/extensions/dude/lib', reused)), `the generated advice checks import ${reused}`);
    }
    const loadedAdvice = await import(pathToFileURL(adviceModule).href);
    for (const name of ['readNumberAdvice', 'chooseAdvisedNumber', 'captureReceipt']) assert.equal(typeof loadedAdvice[name], 'function', name);
    const generatedPublisher = fs.readFileSync(path.join(root, '.github/skills/dude-feature-definition/publish-first-capture.mjs'), 'utf8');
    assert.match(generatedPublisher, /await import\('\.\/capture-number-advice\.mjs'\)/);
    assert.doesNotMatch(generatedPublisher, /from '\.\/capture-number-advice\.mjs'/, 'the ordinary capture never loads the advice module');
    for (const name of ['capture-number-advice.test.mjs', 'publish-first-capture.test.mjs']) {
      assert.equal(has(root, `.github/skills/dude-feature-definition/${name}`), false, `${name} stays build-time only`);
    }
    for (const entry of snapshotTree(path.join(root, '.github')).filter(row => row.type === 'file')) {
      assert.doesNotMatch(entry.path, /(?:^|\/)fixtures(?:\/|$)|\.test\.|model-view-test-helpers|064-work-receipt-overflow-handling|065-work-history-event-compaction/);
      assert.equal(fixtureHashes.has(sha256(/** @type {Buffer} */ (entry.bytes))), false, `${entry.path} ships fixture bytes`);
    }
    assertExactBytes(
      fs.readFileSync(path.join(root, '.github/skills/dude-engine/config/agent-models.json')),
      fs.readFileSync(path.join(root, 'src/config/agent-models.json')),
      'complete fixture packaged config',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 published Canvas runtime is byte-identical to source while frontend and tests remain build-time only', () => {
  // Arrange
  const runtime = [
    'extension.mjs',
    'lib/canvas-server.mjs',
    'lib/projection.mjs',
    'lib/needs-you.mjs',
    'lib/review.mjs',
    'ui/index.html',
    'ui/assets/app.js',
    'ui/assets/app.js.LEGAL.txt',
    ...REVIEW_UI_FILES.map((filename) => `ui/review/${filename}`),
  ];

  // Act + Assert
  for (const relative of runtime) {
    assertExactBytes(
      fs.readFileSync(path.join(repoRoot, 'src/extensions/dude', ...relative.split('/'))),
      fs.readFileSync(path.join(repoRoot, '.github/extensions/dude', ...relative.split('/'))),
      `.github/extensions/dude/${relative}`,
    );
  }
  assert.equal(
    sha256(fs.readFileSync(path.join(repoRoot, 'src/extensions/dude/ui/assets/app.js'))),
    '31ea3e3fe766c70536e296e04532095726ab507a35fc3e83d2bd1000284cc923',
  );
  assert.equal(has(repoRoot, '.github/extensions/dude/frontend'), false);
  assert.equal(has(repoRoot, '.github/extensions/dude/needs-you.test.mjs'), false);
  assert.equal(has(repoRoot, '.github/extensions/dude/work-index.test.mjs'), false);
});

test('T018 dev bundle carries the lazy A2A runtime, notice, and modules byte-for-byte without tests, dependencies, or build tooling', () => {
  // The checked-in dogfood copy is compared read-only; nothing builds into this workspace.
  for (const relative of A2A_RUNTIME_FILES) {
    assertExactBytes(
      fs.readFileSync(path.join(repoRoot, '.github/extensions/dude', ...relative.split('/'))),
      fs.readFileSync(path.join(repoRoot, 'src/extensions/dude', ...relative.split('/'))),
      `.github/extensions/dude/${relative}`,
    );
  }
  for (const name of A2A_TEST_FILES) assert.equal(has(repoRoot, `.github/extensions/dude/${name}`), false, name);
  assert.equal(has(repoRoot, '.github/extensions/dude/node_modules'), false);

  // The actual generator, in a disposable root holding the actual source bytes,
  // the A2A tests, an installed dependency beside the runtime, and the runtime's
  // real build inputs.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-t018-a2a-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    for (const relative of [...A2A_RUNTIME_FILES, ...A2A_TEST_FILES]) {
      w(root, `src/extensions/dude/${relative}`, fs.readFileSync(path.join(repoRoot, 'src/extensions/dude', ...relative.split('/'))));
    }
    w(root, 'src/extensions/dude/lib/node_modules/@a2a-js/sdk/package.json', '{"name":"@a2a-js/sdk","version":"1.2.0"}\n');
    const buildOnly = [
      ...A2A_TEST_FILES.map((name) => `src/extensions/dude/${name}`),
      ...A2A_BUILD_INPUTS.map((name) => `scripts/dude-a2a/${name}`),
    ];
    for (const relative of buildOnly.filter((rel) => rel.startsWith('scripts/'))) {
      w(root, relative, fs.readFileSync(path.join(repoRoot, ...relative.split('/'))));
    }

    const result = buildDev({ repoRoot: root });
    const generated = snapshotTree(path.join(root, '.github/extensions/dude'))
      .filter((entry) => entry.type === 'file')
      .map((entry) => entry.path)
      .sort();

    assert.deepEqual(generated, [...A2A_RUNTIME_FILES].sort(), 'exactly the runtime surface is generated');
    for (const relative of A2A_RUNTIME_FILES) {
      assert.ok(result.written.includes(`.github/extensions/dude/${relative}`), relative);
      assertExactBytes(
        fs.readFileSync(path.join(root, '.github/extensions/dude', ...relative.split('/'))),
        fs.readFileSync(path.join(repoRoot, 'src/extensions/dude', ...relative.split('/'))),
        `generated ${relative}`,
      );
    }
    const buildOnlyHashes = new Set(buildOnly.map((relative) => sha256(fs.readFileSync(path.join(repoRoot, ...relative.split('/'))))));
    for (const entry of snapshotTree(path.join(root, '.github')).filter((row) => row.type === 'file')) {
      assert.doesNotMatch(entry.path, /(?:^|\/)node_modules(?:\/|$)|\.test\.|dude-a2a/, entry.path);
      assert.equal(buildOnlyHashes.has(sha256(/** @type {Buffer} */ (entry.bytes))), false, `${entry.path} carries build-only bytes`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T024 native proposal delivery matches every validated core output without rewriting dogfood', (context) => {
  const before = snapshotTree(path.join(repoRoot, '.github'));
  const outputs = listCoreOutputs(repoRoot);
  const paths = outputs.map((output) => output.relPath);
  assert.deepEqual(enumerateCorePaths(repoRoot), paths, 'the generated core has exactly the planned destinations');
  for (const relative of A2A_RUNTIME_FILES) assert.ok(paths.includes(`.github/extensions/dude/${relative}`), relative);
  const map = outputs.map((output) => {
    const expected = output.abs ? fs.readFileSync(output.abs) : /** @type {Buffer} */ (output.bytes);
    const actual = fs.readFileSync(path.join(repoRoot, output.relPath));
    assertExactBytes(actual, expected, output.relPath);
    return { path: output.relPath, bytes: actual.length, sha256: sha256(actual) };
  });
  assert.deepEqual(snapshotTree(path.join(repoRoot, '.github')), before, 'the planner and parity check write nothing');
  context.diagnostic(`T024 source/dogfood core map: ${map.length} outputs; ${map.reduce((sum, row) => sum + row.bytes, 0)} bytes; SHA-256 ${sha256(JSON.stringify(map))}.`);
});

test('T024 operator entrypoints require complete native proposal review and leave live support unqualified', () => {
  const guide = fs.readFileSync(path.join(repoRoot, 'docs/agent-to-agent-communication.md'), 'utf8');
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const section = /### Propose\r?\n([\s\S]*?)\r?\n### Approve/.exec(guide)?.[1];
  assert.ok(section, 'the guide has a proposal preparation section');
  const example = /```json\s*([\s\S]*?)```/.exec(section)?.[1];
  assert.ok(example);
  const args = JSON.parse(example);
  assert.deepEqual(Object.keys(args), ['configPath', 'profileId'], 'the tool example has no consent or override argument');
  for (const value of Object.values(args)) assert.match(String(value), /^<[^>]+>$/, 'examples remain inert placeholders');
  assert.match(section, /`dude_a2a_propose`/);
  const oldRouteLines = guide.split(/\r?\n/).filter((line) => line.includes('dude a2a propose'));
  assert.equal(oldRouteLines.length, 1, 'only the explicit retirement notice retains old chat syntax');
  assert.match(oldRouteLines[0], /retired/);
  assert.doesNotMatch(guide, /dude a2a approve [0-9a-f]{12}(?:\s|$)/, 'no usable approval code belongs in the guide');
  const prose = guide.replace(/\s+/g, ' ');
  assert.match(prose, /no host or peer combination is qualified/i);
  assert.match(prose, /does not prove that the host displayed it or that the owner read it/);
  assert.match(prose, /omission does not redact secrets placed in argv or prose/);
  assert.match(prose, /SDK aborting the finished invocation's signal, keeps an otherwise valid proposal pending/);
  assert.match(prose, /next eligible local root input in the same session/);
  assert.match(prose, /Historical result text may remain visible/);
  assert.match(readme, /`dude_a2a_propose`/);
  assert.match(readme.replace(/\s+/g, ' '), /complete native tool result before the exact next eligible local approval/);
});

test('T028 operator guide documents the frozen byte bound without upgrading native qualification', () => {
  const guide = fs.readFileSync(path.join(repoRoot, 'docs/agent-to-agent-communication.md'), 'utf8');
  const prose = guide.replace(/\s+/g, ' ');
  const proposal = /### Propose (.*?) ### Approve/.exec(prose)?.[1];
  assert.ok(proposal);
  assert.match(prose, /fixed 4,490-byte guard are delivered/);
  assert.match(prose, /Independent offline acceptance covers complete content, the UTF-8 byte bound/);
  assert.match(proposal, /fixed cap of 4,490 UTF-8 bytes to the \*\*complete rendered proposal\*\*/);
  assert.match(proposal, /Exactly 4,490 bytes is size-eligible; 4,491 bytes is refused/);
  assert.match(proposal, /not characters or commands, and is not user-configurable/);
  assert.match(proposal, /independent 1 MiB input limit for configuration and TLS files still applies/);
  assert.match(proposal, /short `proposal_too_large` refusal, with no proposal body, code, approval line, or partial approvable result/);
  assert.match(proposal, /withdraws the previous pending proposal even when the replacement is oversized/);
  assert.match(proposal, /Neither a refused nor a replaced code can activate anything/);
  assert.match(proposal, /explicitly smaller profile, request a fresh proposal, review its complete native result, and give fresh local approval/);
  assert.match(proposal, /no summary, file, log, or paging fallback, and no automatic splitting or retry/);
  assert.match(proposal, /does not change the 2026-09-30 App failure's verdict/);
  assert.match(prose, /2026-09-30 UTC supported-bound App case failed/);
  assert.match(prose, /1,048,356-byte configuration with 2,328 selected commands had an expected 1,145,494-byte proposal/);
  assert.match(prose, /six model-less native CLI direct-RPC results retained their complete expected text/);
  assert.match(prose, /does not prove App visual or accessibility behavior, model-delivery equivalence, human review, or peer\/LAN support, and it did not exercise the new guard/);
  assert.match(prose, /T019 remains incomplete and blocked pending fresh native\/live qualification/);
  assert.doesNotMatch(prose, /T019 remains in progress|current runtime has no new output-size limit|T028 delivery remain pending/);
});

test('T008 operator guide documents two-Dude collaboration without upgrading its native qualification', async () => {
  const guide = fs.readFileSync(path.join(repoRoot, 'docs/agent-to-agent-communication.md'), 'utf8');
  const prose = guide.replace(/\s+/g, ' ');
  const section = /## Collaboration between two Dudes (.*?) ## Interruptions, cancellation, and uncertain outcomes/.exec(prose)?.[1];
  assert.ok(section, 'the guide has a collaboration section');
  assert.match(prose, /Its native qualification has not passed: no actual independent AI exchange, unrelated main-agent progress, causal capture, live or retained inspection, or confirmed cleanup has been observed\./);
  assert.match(section, /not a shared allocator, lock, or reservation/);
  assert.match(section, /`accepted` means local admission only, not readiness or delivery/);
  assert.match(section, /An answered asking journal is exactly eight records: `opened`, `accepted`, `request_prepared`, `request_write_started`, `reply_received`, `reply_validated`, `terminal`, and `closed`\./);
  assert.match(section, /Reading an answer captures and stages nothing/);
  assert.match(section, /Without `--number-advice`, capture is unchanged/);
  assert.match(section, /These are configured settings, not proven enforcement/);
  assert.match(section, /Delivered; component evidence only\./);
  assert.match(section, /\| Native independent AI \| Two actual selected Dudes and B's actually served worker on the public host\. \| Attempted natively; not passed\. \|/);
  assert.equal(section.split('Not run; blocked.').length - 1, 1, 'native progress, capture, and inspection stay unrun and blocked');
  assert.match(section, /Native qualification of Feature 089 is incomplete\./);
  assert.match(section, /It never exits 0\./);
  assert.match(section, /nothing here authorizes any step/);
  assert.match(section, /For Feature 089, this guide summarizes the outcomes of native attempts but records no native input, run ID, timestamp, or raw result\./);
  assert.doesNotMatch(prose, /No native [^.]*result for Feature 089 is recorded/i,
    'no blanket claim that the guide records no native result for Feature 089');
  assert.doesNotMatch(section, /Feature 089 (?:is|was) (?:natively )?qualified|native qualification (?:passed|is complete)/i);

  // The native branch and observer are implemented, documented with their operator flow and bounds, and stay unverified: native
  // attempts of the branch have passed nothing, only controlled checks have run the observer, and the strict run never ran natively.
  assert.match(prose, /The maintainer runner's native branch and its fixed Windows observer are implemented but unverified: no native attempt of the branch has passed, only controlled checks have exercised the observer, and the qualification preview still reports every native stage blocked\./);
  assert.match(section, /Delivered; controlled only, never native evidence\./);
  assert.match(section, /is implemented, but it has never run this strict qualification natively, so nothing about that run's native behavior is known\./);
  assert.doesNotMatch(prose, /native qualification has not run|exercised them, and the qualification preview|has never run natively, so nothing about native behavior/,
    'no stale claim that the native branch never ran natively');
  // The collaboration introduction separates delivered component tests from native attempts, which passed nothing, and the
  // qualifier's and native branch's own descriptions say never run natively only of the strict qualification.
  assert.match(section, /Only loopback runs on one computer have been exercised, in delivered component tests and in native attempts\. Native attempts of the normal collaboration route \(plan version 3\) reached both mains' saved-sign-in account checks, both proposals and the human activation approvals, both conversation starts, and B's worker readiness\. In the latest attempt, B's worker then ended with `unexpected_native_effect` after its prompt was admitted, before it read any evidence\. No attempt has passed\. The strict qualification \(plan version 2\) has never run natively, and strict isolation remains deferred\. Private-LAN and other-platform use remain unqualified\./);
  assert.doesNotMatch(prose, /only as component tests|have been exercised, and only as component/,
    'no claim that loopback collaboration ran only in component tests');
  const sourceComment = (/** @type {string} */ file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')
    .replace(/\r?\n[ \t]*\*[ \t]?/g, ' ').replace(/\s+/g, ' ');
  const qualifierSource = sourceComment('scripts/dude-a2a/qualify-collaboration.mjs');
  assert.match(qualifierSource, /That branch is implemented\. Native version-3 attempts have reached both mains' saved-sign-in account checks, both proposals and the human activation approvals, both conversation starts, and B's worker readiness; the latest attempt's worker ended with unexpected_native_effect after its prompt was admitted, before it read any evidence\. No attempt has passed, the strict version-2 qualification has never run natively, and strict isolation stays deferred\./);
  assert.match(qualifierSource, /The native branch implements how each would be observed; none has been observed in a native strict run, so none is available here\./);
  assert.doesNotMatch(qualifierSource, /That branch is implemented but has never run natively|none has been observed natively, so none is available here/,
    'no claim in the qualifier that its native branch or proof sources never ran natively');
  const nativeSource = sourceComment('scripts/dude-a2a/native-collaboration.mjs');
  assert.match(nativeSource, /The real branch has never run this strict qualification natively; version-3 attempts have run natively, and none has passed\./);
  assert.doesNotMatch(nativeSource, /The real branch has never run natively\./, 'no claim that the native branch never ran natively');
  assert.match(section, /Membership in Administrators or Performance Log Users, in a terminal you opened that way/);
  assert.match(section, /Nothing elevates, installs, or registers a service\./);
  assert.match(section, /Under ACTION NEEDED it shows the exact consent line, `approve native <first 16 characters of the scope digest>`; type or paste that one line and press Enter\. Redirected, ended, or multi-line input refuses; anything entered before a prompt appears is ignored, and the prompt asks again\./);
  assert.match(section, /The ACTION NEEDED block shows that approval line; if it cannot pick out exactly one `Approval` line in the result, it explains where to find that line instead\. Only your entered line, without surrounding spaces, is sent, and the unchanged classifier must accept it as an unattributed root message, or the run stops\./);
  assert.match(section, /no root prompt follows while an operation is pending/);
  // Only the after-view control's read is typed approve-once; no main-session request is.
  assert.match(section, /type `approve-once` or `reject` for its read\./);
  assert.doesNotMatch(section, /Type `approve-once` or `reject` for each|need your typed `approve-once`|requests presented for typed approval|before it shows the request/,
    'no main-session request is shown for a typed approve-once');
  // Everything the main relay approves itself under the consent, each step's calls and reads and each phase's exact actions, and the
  // qualified claim that nothing else is computed.
  assert.match(section, /Each main's model calls `dude_a2a_propose`; under your consent the relay approves that exact call without asking, as described below\./);
  assert.match(section, /Both whole exchange instructions are sent together, and the relay approves each main's own conversation calls for that exchange, and its reads of its own workspace, under your consent, as described below\./);
  assert.match(section, /before the evidence release is written\. Under your consent the relay approves that exact edit without asking you\./);
  assert.match(section, /A decides whether to use the advice\. Its normal capture has the installed Spec Lead stage the ledger and then the advice, each in its own synchronous task, while A's root model runs the inventory, hash, and actual publisher commands, the publisher with `--number-advice`; the receipt must show local 100, peer 101, chosen 102, and `raised`\. Under your consent the relay approves, without asking you, reads of A's own workspace in this step, by A's model or that Spec Lead, and also the exact inventory, hash, and publisher commands, each new staging file, and any read of A's temp folder, as described below\. Nothing in this step waits for your input\./);
  assert.match(section, /A's model cancels through the conversation tool, a call the relay approves under your consent like the rest of that exchange's conversation calls\./);
  assert.match(section, /Each main's permission requests go to a fixed relay, and only for a tool call that the session's own model requested for its current instruction, with one exception in A's capture step, described below\./);
  assert.match(section, /Dude's own tools ask for permission in the runtime's normal mode, and your consent covers the current step's exact calls of them: the relay approves each such call once without asking you, from the moment the step's instruction is admitted until its turn ends\./);
  assert.match(section, /In each proposal step that is `dude_a2a_propose` with that session's `a2a\.json` and profile\. In the advice exchange it is B's `dude_a2a_conversation` `begin_receive` and `read`, and A's `begin_ask` for the plan's slug with the fixed question and an integer tentative number, and `read`; in the cancellation exchange it is the same for B, and A's `begin_ask` for `<slug>-cancel`, `cancel`, and `read`\./);
  assert.match(section, /A view can ask for permission to read too, even inside the session's own working directory, so your consent also covers reads of each session's own workspace, `a\/w` for A and `b\/w` for B: in both exchanges and the capture step, the relay approves once, the same way, each read that the session's own model requests of that folder or of anything in it while the step's turn is open, and in the capture step the Spec Lead's reads of `a\/w` too\. It never approves a read of the other session's workspace or anywhere else, any other subagent's read, or a read after the turn ended\./);
  assert.match(section, /A call or read that managed policy marks as needing a person is rejected instead\. The approval steps allow neither, and the capture step allows no Dude tool call\. The report counts these approvals for each session in `toolApprovals`, by tool and operation and, for those reads, as `workspace\.read`, or `spec_lead\.workspace\.read` for the Spec Lead's\. A request rejected as `not_pending` is one that no open step or phase allows\. One rejected as `approval_withdrawn` exactly matched what its step or phase allows, but that turn or interval ended, or the request otherwise stopped being allowed, before the relay answered\./);
  // The capture step's one exception: the installed Spec Lead's staging, attributed only through A's own session events, with the root
  // model's commands unchanged and nothing typed for either.
  assert.match(section, /In A's capture step alone, the relay can also attribute a request to the installed Spec Lead: the rendered `\.github\/agents\/dude-spec-lead\.agent\.md`, which A's session must list at that path with exactly its rendered bytes before any prompt\./);
  assert.match(section, /A permission callback names the session but not the agent that asked, so the relay waits briefly for A's own session events and requires all of them: A's model requested a task call for the current instruction that selects the Spec Lead in `sync` mode, and that call started; the runtime started exactly one sub-agent for it, with no spawning sub-agent; that sub-agent itself requested the call; and the request's permission event is still pending\./);
  assert.match(section, /A background task, a sub-agent started by another sub-agent, any other agent, an earlier instruction, or a task, sub-agent, or call that already ended does not count, and the relay checks all of this again right before it answers\./);
  assert.match(section, /The Spec Lead may only read and stage: A's model runs every command and stages nothing itself, and the Spec Lead runs no command and calls no Dude or other tool\./);
  // Each phase's exact actions, a read of A's temp folder itself or of anything in it among them, are the consent's too, approved once
  // without asking and checked again right before the answer; the progress file's reads are the workspace's, so only its exact edit is
  // listed.
  assert.match(section, /Your consent also covers these exact actions, each a call that the session's own model, or in the capture step that Spec Lead, requested for its current instruction: inside the progress interval, the progress file's exact `pending`-to-`complete` edit; and while the capture step's turn is open, from A's model only, the exact inventory command, one fixed `Get-FileHash` of a staged ledger, and the publisher command for the plan's slug with staged files under A's temp folder; from the Spec Lead only, each new staging file there, as its own complete creation; and from either, a read of that folder itself or of anything in it\. The relay approves each of these once without asking you\./);
  assert.match(section, /Right before it answers, it checks again that the interval or turn is still open with your consent granted, the run not closing, and the scope current; that the call is still requested for that instruction, or is still the same live Spec Lead's, and has not completed; and that the request is still the exact action it matched\. Otherwise it rejects the request as `approval_withdrawn`\. A request that managed policy marks as needing a person is rejected instead\./);
  assert.match(section, /The report counts these approvals in `toolApprovals` as `progress\.edit` for the edits, `capture\.command` for the commands, `capture\.read` for A's model's reads of its temp folder or `spec_lead\.capture\.read` for the Spec Lead's, and `spec_lead\.capture\.staging` for the staging files\./);
  assert.match(section, /The report lists each rejected request in `permissions` with a `target` of at most 256 bytes, the requested path or the tool, command, or extension name, never a command's text, arguments, or contents\. Each approval of the exact actions just described is listed there too, with the answer `consented`\. It keeps the first 50 such entries, rejected or consented, and counts any further rejected request in `permissionsOmitted`; a further approval is still counted in `toolApprovals`\. A request shown to you for a typed answer, which only the after-view control's relay makes, is always kept\./);
  assert.doesNotMatch(section, /progress file's exact read|The approval and capture steps allow no Dude tool call/, 'no stale typed progress read, and no claim that capture allows nothing');
  assert.doesNotMatch(section, /anywhere else, a subagent's read/, 'no blanket rule against the capture\'s Spec Lead staging');
  assert.match(section, /Apart from the exact requests above that your consent covers, there is no approve-all mode, saved consent, computed approval, or permission file\. Both `dude a2a approve` lines and `reread reviewed` are still yours to type\./);
  assert.doesNotMatch(section, /\. There is no approve-all mode/, 'no unqualified claim that nothing is ever approved without a typed line');
  assert.match(section, /Exit status: 0 only when a native run passed every check; 4 for every refusal or failure; 1 for a plan that cannot run natively\./);
  assert.match(section, /These native properties are unverified, and each one fails the run rather than passing it/);
  assert.doesNotMatch(section, /native (?:branch|run|observer) (?:is|was|has been) (?:verified|qualified|proven)/i);
  // Today's honest native status, the observed-order acceptance condition, and the refused null payload.
  assert.match(prose, /The native branch now observes the two prerequisites it once could not: one model-driven after-view control, and the session storage B's worker records, whose files it classifies by documented purpose\. Only controlled checks have exercised them; whether a native host passes either is unknown\./);
  assert.match(section, /Its own model's view must surface and load `k\/w\/AGENTS\.md`/);
  assert.match(section, /all within one 60-second phase that ends before either main starts\. Anything less, including a host that sends no such notification, stops the run as `ambient_state_unobservable`\./);
  assert.match(section, /Its recorded session workspace must still be the same directory by path, device, and inode; recorded absence allows no session persistence\. Every file the worker touched since the observer started, before that check as well as after it, is then classified/);
  assert.match(section, /The after-view control's session has its own fixed relay, the only relay that asks you, for a typed `approve-once` or `reject`: it shows only a read that its sole pending model-requested view needs/);
  assert.match(section, /a row that would not fit, or a path over 1,024 characters, is a sticky overflow that fails the run, never a dropped row/);
  assert.match(section, /and nothing stands in for an observation the run needs\. \| Delivered; controlled only, never native evidence\. \|/);
  assert.doesNotMatch(prose, /does not classify (?:that|it) yet|stand in for the two unobservable prerequisites|so today every native run stops here|a native run cannot pass: it stops/,
    'no stale claim about the two observations, and no claim that a native run would pass either');
  assert.match(section, /Sending them does not order them, so the run then requires the order in the runtimes' own event stamps/);
  assert.match(section, /A plan whose `runtimePayload` is `null` previews, but a native run refuses it before consent as `runtime_identity_unobserved`/);
  assert.match(section, /A short fixture parent\. B's complete proposal names the fixture paths and must fit the 4,490-byte cap\. A longer path can exceed the cap, which is refused, never raised\./,
    'a longer fixture parent can push a complete product proposal past the fixed 4,490-byte cap, which refuses it and is never raised');
  assert.doesNotMatch(section, /Each main gets its whole exchange instruction before its operation begins/, 'sending is not an ordering guarantee');
  // T008 revision: the control side is no longer called model-less, and each corrected rule is documented without upgrading native status.
  assert.match(section, /creates only the short folders below the fixture parent: `a`, `b`, and a control side `k`, each with `w`, `h`, `c`, and `t`/);
  assert.doesNotMatch(section, /model-less control side/, 'the control side also runs the model-driven after-view session');
  assert.match(section, /its successful model-facing output, at most 4,096 bytes, holding the synthetic file's text exactly once \(a heading or line number around it is fine\)/);
  assert.doesNotMatch(prose, /output equal to the synthetic file/, 'the output is no longer promised to equal the file');
  assert.match(section, /`AGENTS\.md` among the session's loaded sources by digest with a documented repository type and location \(type `repo` or `nested-agents`, location `repository`\)/);
  assert.match(section, /The control runtime is then stopped, and its whole process tree must be seen to end within 10 seconds of that stop before either main starts, or the run stops as `cessation_unconfirmed`; the final summary judges that window again\./);
  assert.match(section, /in its configuration and home storage every access, a read or open as well as a write, must be the creation, opening, reading, or writing of that workspace's `events\.jsonl`, `workspace\.yaml`, or `plan\.md`/);
  assert.match(section, /the runtime's own settings or any other configuration or home file, a path in its own folder that the observer could not read as one plain spelling, or any session access after recorded absence, fails as `ambient_storage_unclassified`\./);
  assert.match(section, /A genuine run may stop here on a read it cannot explain, such as the runtime opening its own settings file\. Nothing is learned from such traffic: any allowance for it needs a planning decision backed by evidence, and the worker-relative paths the observer keeps show what was touched\./);
  assert.match(section, /A path there that is not one plain spelling \(a `\.` or `\.\.` segment, an empty or forward separator, a trailing dot or space, a stream name, or an 8\.3 short name\) keeps no name, gets no area, and fails the run\./);
  assert.match(section, /its prompt ends with the control's 60-second phase or the scope's expiry, whichever comes first, when the prompt itself is released\. Its request is also withdrawn, before its turn or after your answer, as soon as that session reports the view's turn ended, aborted, or failed, or any other operation in it\./);
  // T008 round 4: the scan's documented locations, a covered cessation snapshot, and the worker folder compared as Windows compares
  // it, without upgrading native status.
  assert.match(section, /Each instruction canary must come back with its own documented type, as a `repository` or `working-directory` source of the scanned project, the two locations the SDK documents for a project scan, still bound to its exact path and digest\./);
  assert.match(section, /A snapshot that lost, could not decode, or could not attribute events while the runtime stopped confirms nothing, and the run stops with that observer coverage reason\./);
  assert.match(section, /it may open its own folder, whose name is compared without case, as Windows compares it\./);
  assert.match(section, /Any other event that would fail the control, as in step 4, withdraws it the same way\./);
  // T008 round 6: the control's events judged by phase, each phase permitting only what it lists in its permitted form, the identities
  // it established, the post-turn rule as implemented, what is judged before the prompt, the retained refusal account, and the first-run
  // fail-closed caution for the phase lists and source labels, documented without upgrading native status.
  assert.match(section, /Every public event of that session must be one its phase permits, in the form that phase permits; any other stops the run the same way, including an event of a type the SDK does not declare, a subagent's, one without the documented envelope, and a list of skills, commands, custom agents, MCP servers, or extensions even when it is empty or disabled\./);
  assert.match(section, /Before the prompt, the session may only start once as itself while it is created, report idle, its system message, and its tool catalog, and, only until the run asks for each check, select its model at startup or through the SDK and report its working directory\./);
  assert.match(section, /From the prompt to its turn's end it may only admit that one prompt and show the system message, that turn's model messages, the view's one request, its read's permission, start, progress, output, and discovery notification, and the model's own processing: its turns, intent, reasoning, streaming, usage of its own conversation's calls \(never a sub-agent's, sampling, background, or compaction call\), successful model dispatches that requested no file edit, and an assistant idle that was not aborted\./);
  assert.match(section, /Its permission events must be that one read, for the relay to answer once, with no hook, delegated owner, assisted approval, recovery, or kept grant\./);
  assert.match(section, /After the turn's end, through the post-turn snapshot and source query, only housekeeping and another normal idle may come; every other event, including any further prompt, tool call, notification, or reply, stops the run, and none of them can supply a fact the turn did not show\./);
  assert.match(section, /Housekeeping, the session's title and its token or quota accounting, may come at any time\./);
  // Which stated identities are compared: the tool catalog's model from the model check on, and any change of the model or working
  // directory after its check; other model names are telemetry labels that are not compared.
  assert.match(section, /An event that states the session, an admission, or a tool call must state the ones the run established, so another session, a reply or prompt of another admission, or a tool call other than the view stops the run\. Once the run asked for the model check, a tool catalog update must name the checked model\. A change of the model or of the working directory after the run asked for its check stops the run, even the same one restated; a model selection or working directory reported before its check is superseded by that check\. The model named on the turn's own events, such as its turns and usage, is a telemetry label, not proof of which model ran; the run does not compare it, and it may read `unknown`\./);
  assert.doesNotMatch(section, /another model or working directory stated from its check on/, 'no claim that every stated model or working directory is compared');
  assert.match(section, /Everything the session sent before the prompt is judged just before the prompt is sent, so after such an event nothing is sent\./);
  assert.match(section, /The control's event judgment ends with its post-turn source query: what the session delivers during that stop is neither judged nor listed in `refusedEvents`, though the stop is still checked as above and the session's event log still fails the run if it overflows\./);
  assert.doesNotMatch(section, /their empty or inactive forms do not|or the same model restated after it, does not|walked through its class/,
    'no stale exemption for empty lists or restated models, and no stale per-type class');
  assert.match(section, /every session event type the SDK declares walked through each phase of that control and refused unless the phase permits it in its permitted form, each permitted type's other forms and identity statements walked where it is permitted/);
  assert.match(section, /Whenever the after-view control's session ran, however its phase ended, the report's `control` record keeps `refusedEvents`: one entry per distinct event type and class that it refused, in the order first seen, at most 8, each `\{ "type", "class", "count", "id" \}`\. Types are told apart by their own values, never by how they are shown below, so two types shown alike stay two entries\./);
  assert.match(section, /otherwise it is `\(unavailable: N bytes\)` with its UTF-8 length, or `\(unavailable: no type\)` for a delivery that was no event\./);
  assert.match(section, /`class` is `undeclared` \(a type the SDK does not declare\), `malformed` \(an undocumented envelope\), `competing` \(a type its phase does not permit, or a form that phase does not permit\), `subagent`, `contradicting` \(another session, model, admission, or tool call than the control established\), or `after_turn` \(anything after its turn ended other than housekeeping or another normal idle\)\./);
  assert.match(section, /`id` is the first such event's ID when that is a safe identifier, otherwise `null`\./);
  assert.match(section, /`refusedEventsOmitted` counts any further distinct entries\. A second view request, view start, or view completion before the turn ends is named by the closed problems `tool_requests`, `start`, and `completion` and need not appear in `refusedEvents`; a second prompt is named `other_prompt` and, as another admission, a `contradicting` entry\. No event data, prompt, model text, or reasoning is kept/);
  assert.match(section, /The control's phase lists are derived from the SDK 1\.0\.102 declarations its source cites, and any event outside them stops the control\./);
  assert.match(section, /A genuine host may also stop the control by sending any list of skills, commands, custom agents, MCP servers, or extensions, or a capability or indexed-search update, even an empty or disabled one; by updating its tool catalog during the turn, or its model or working directory after the run asked for that check, even unchanged; by delivering its own start only after its creation returned, or any turn event after the turn's idle;/);
  assert.match(section, /by reporting a permission or mode change, such as `session\.permissions_changed`, a task-completion notice, or a compaction or truncation of its conversation history;/);
  assert.match(section, /Newer installed SDKs \(1\.0\.106\) also declare `session\.journal_link` and `instruction\.update`/);
  assert.match(section, /Use the CLI and SDK pair of the plan's source basis \(1\.0\.102\)\./);
  assert.match(section, /The notification's `sourcePath` is documented only as a relative path, with no base, so only `k\/w` and `k\/t` are tried\. A first genuine run may stop on any of these\. The refused event's type and class in the report are where a planning decision starts; nothing is learned or allowed from such a refusal by itself\./);

  // T009: the fixed loaders, B's readiness records, the lowered serving capacity, and their native status: a native attempt produced
  // B's readiness, admission, and loader records, but none of these evidence sources is established.
  assert.match(section, /two fixed loaders in `lib\/a2a-sdk-loader\.mjs`/);
  assert.match(section, /There is no other path, default location, or fallback\. If the extension's loader refuses, the extension does not join\./);
  assert.match(section, /Before its first prompt, within 10 seconds of starting, the worker checks its own session through the public SDK\./);
  assert.match(section, /B's journal then records `worker_preflight`, an observation of at most 8 KiB/);
  assert.match(section, /records the admission ID that `send` returns as `worker_request_admitted`/);
  assert.match(section, /On the token branch, only fake SDKs have run these checks; native attempts have run the existing-sign-in branch's readiness checks, as \[Existing sign-in\]\(#existing-sign-in\) describes\. No native run has shown that a host reports its status, catalog, model, or ambient state truthfully\./);
  // T010: B's actual-session storage observation and the discovery refusal, documented without upgrading native status.
  assert.match(section, /Right after the session is created, and again at the end of these checks, it reads the session's own metadata snapshot and its public `workspacePath`\./);
  assert.match(section, /is recorded only as observed absence: it does not show that the session keeps nothing on disk, and it turns nothing on\./);
  assert.match(section, /or a notification that an instruction file was discovered, at any time until the worker's result is decided/);
  assert.match(section, /No native run has shown what a host reports about a token-branch session's storage either, or whether it sends the discovery notification\./);
  assert.doesNotMatch(section, /Only fake SDKs have run these checks\.|reports about a session's storage either/,
    'no claim that only fake SDKs ran the worker\'s readiness checks or that no native run showed a session\'s storage');
  assert.match(section, /and it validates the session storage B's worker records and classifies the worker's file accesses, reads and opens as well as writes, by that workspace's documented purpose; observed absence allows none\. Only controlled checks have exercised these, and no native strict run has\./);
  assert.doesNotMatch(section, /Only controlled checks have exercised these, and no native run has\./,
    'the ambient observations no native run has made are the strict qualification\'s');
  assert.doesNotMatch(prose, /classifies the worker's file writes by/, 'no stale writes-only classification');
  assert.doesNotMatch(prose, /session persistence location is not recorded|but not its session persistence location/, 'no stale claim that the storage is unrecorded');
  assert.match(section, /A release is an observation, not permission\./);
  assert.match(section, /currently above 45,148 bytes when serving or 146,578 bytes when asking\. B's readiness records lowered the serving limit from 46,452 bytes/);
  assert.match(section, /handed in through a test adapter so its readiness records carry no production SDK provenance/);
  assert.match(section, /Native qualification of Feature 089 is incomplete\. None of these evidence sources has been established natively:/);
  assert.match(section, /A native attempt's worker produced both, but no held evidence call\./);
  assert.match(section, /In a native attempt, B's records matched the plan's SDK files, but that attempt did not pass\./);
  assert.doesNotMatch(section, /None of these evidence sources has been produced natively|but only fake SDKs have produced those records|but no native run has produced those records/,
    'no stale claim that only fake SDKs produced the served worker\'s or the loaders\' records');
  assert.doesNotMatch(section, /readiness (?:is|was|has been) (?:natively )?(?:proven|qualified|confirmed)|native readiness (?:passed|is complete)/i);
  const reference = fs.readFileSync(path.join(repoRoot, 'docs/reference.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(reference, /The serving peer's evidence worker records its readiness before its first prompt, and native qualification of this collaboration is incomplete\./);
  assert.doesNotMatch(reference, /only fake SDKs have exercised that|no native run has observed its account/, 'no stale fake-only or unobserved-account claim');

  // T012: the direct existing-sign-in branch is documented as implemented, with controlled and component evidence on fake SDKs and
  // native attempts that reached B's worker readiness but passed nothing, with strict isolation deferred, no sign-in of Dude's own,
  // and the Canvas GitHub sign-in kept a separate feature.
  assert.match(prose, /B's evidence worker can instead reuse the Copilot runtime's own saved sign-in, on Windows only, without a token file\./);
  assert.match(prose, /Native qualification attempts, with both mains also on their saved sign-in, reached both mains' account checks, both proposals and their human activation approvals, and the readiness of B's worker, including its own account checks\. In the latest attempt, the worker then ended with `unexpected_native_effect` after its prompt was admitted, before it read any evidence\. No attempt has passed\. Strict isolated-worker qualification is deferred and not passed for this branch\./);
  assert.doesNotMatch(prose, /no native run has observed an actual account|native sign-in behavior is unproven|both with fake SDKs, have exercised it/,
    'no stale fake-only status for the branch');
  assert.match(prose, /The Canvas GitHub sign-in in Settings > Accounts, which reads pack sources, is a separate feature that collaboration never uses\./);
  assert.match(section, /Dude implements no sign-in for it: it never requests, reads, copies, or shows a credential, and it never logs in, switches accounts, or falls back to the token branch\./);
  assert.match(section, /These effects are not isolated, and the proposal says so\./);
  assert.match(section, /These checks hold at points in time; they are not an account lock, an entitlement check, or a revocation check\./);
  assert.match(section, /B's receiver records only the approved branch's version and refuses the other as `readiness_mismatch`\./);
  // The live run's correction: a normal runtime's MCP server notices end no existing-sign-in worker, every action still does, and an
  // unexpected native effect names only its closed trigger, in both branches.
  assert.match(section, /A notification that an instruction file was discovered is not an error on this branch, and neither are the runtime's MCP server notices, `session\.mcp_servers_loaded` and `session\.mcp_server_status_changed`, whatever they list: a normal runtime may start the owner's configured MCP servers and plugins even though the session itself names none, while the session's tool filters still offer the worker model only the two evidence tools\./);
  assert.match(section, /A hook, skill, or subagent event, an evidence call outside the run, or a permission request or model output before the prompt still ends the worker, with its trigger in `detail`\./);
  assert.match(section, /The result's `detail`, which B's `worker_finished` record and its read view keep, then names the trigger from one closed list: the event's type, such as `hook\.start` or `session\.mcp_server_status_changed`, or `tool_call`, `permission_request`, or `model_output_before_prompt` for an evidence call outside the run, or a permission request or model output before the prompt\. Nothing the trigger carried is kept, and any detail outside that list is recorded as `null`\./);
  assert.doesNotMatch(prose, /every other unexpected event, tool call, or permission request still ends the worker/,
    'no stale claim that every other notice ends an existing-sign-in worker');
  // The existing-sign-in proposal discloses that the worker's normal startup may start the owner's MCP servers and plugins, apart from
  // the two evidence tools its model is offered.
  assert.match(section, /Its `Worker startup` line says that the runtime may start the owner's configured MCP servers and plugins, while the worker's model is offered only the two evidence tools\./);
  assert.match(section, /In the latest native attempt, the worker's runtime and session reported the expected account, and the worker recorded its version 2 readiness; it then ended with `unexpected_native_effect` after its prompt was admitted, before it read any evidence\. No attempt has passed, and strict isolated-worker qualification is deferred, not passed\./);
  assert.doesNotMatch(section, /Only fake SDKs have run this branch|Whether a native runtime reports these accounts and this storage as the SDK declares is unknown/,
    'no stale fake-only status for the branch');
  assert.match(section, /strict isolated-worker qualification is deferred, not passed\./);
  assert.doesNotMatch(prose, /(?:existing|saved) sign-in (?:is|was|has been) (?:natively )?(?:proven|qualified|verified)|isolated-worker qualification (?:passed|is complete)/i,
    'no claim that the sign-in branch or strict isolation is natively established');
  assert.match(reference, /Native attempts with that sign-in reached the worker's readiness, including its expected account, but no attempt has passed, and strict isolated-worker qualification is deferred, not passed\./);

  // The preview names both plan versions that run natively, each only through --native with a complete, current plan.
  assert.match(section, /The plan is one closed JSON object\. Version 2 runs the strict qualification and version 3 the normal collaboration route, each natively only through `--native` with a complete, current plan\./);
  assert.doesNotMatch(prose, /Only version 2 can run natively/, 'no stale claim that only version 2 runs natively');
  // Only a strict version-2 run starts the fixed observer, and the README separates the normal route's native attempts, none
  // passed, from the strict qualification, which never ran natively.
  assert.match(prose, /With `--native`, it runs the implemented but unverified native branch in `native-collaboration\.mjs`, which starts the fixed Windows observer `native-observer\.ps1` for a strict version-2 run but not for a version-3 run; see \[Qualification preview for maintainers\]\(#qualification-preview-for-maintainers\)\./);
  assert.doesNotMatch(prose, /`native-collaboration\.mjs` with the fixed Windows observer/, 'no claim that every native run starts the observer');
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(readme, /Native qualification of that collaboration remains incomplete: native attempts of its normal route have not passed, and its strict qualification has never run natively\./);
  assert.doesNotMatch(readme, /maintainer runner is implemented but has not run natively/, 'no stale README claim that the runner never ran natively');

  // The documented version-2 plan template has exactly the preview's closed keys and stays inert.
  const raw = /### Qualification preview for maintainers\r?\n([\s\S]*?)\r?\n## Interruptions/.exec(guide)?.[1] ?? '';
  const template = JSON.parse(/```json\s*([\s\S]*?)```/.exec(raw)?.[1] ?? 'null');
  const { previewQualification } = await import(pathToFileURL(path.join(repoRoot, 'scripts/dude-a2a/qualify-collaboration.mjs')).href);
  const { report, exitCode } = previewQualification(template);
  assert.equal(template.version, 2, 'the template is the plan a native run takes');
  assert.equal(exitCode, 1, 'the template is refused, never previewed as complete');
  assert.equal(report.checks.some((/** @type {any} */ check) => check.id === 'plan.unknown' || check.status === 'missing'), false,
    'every documented key is a plan key, and every plan key is documented');
  assert.deepEqual([...new Set(report.stages.map((/** @type {any} */ stage) => stage.status))], ['blocked']);
  for (const value of Object.values(/** @type {Record<string, unknown>} */ (template))) {
    if (typeof value === 'string') assert.match(value, /^<[^>]+>$|^createSession$|^windows-etw$/, 'examples remain inert placeholders or fixed values');
  }
});

test('Feature 095 T005 operator guide documents standing pairing without upgrading its native qualification', () => {
  const guide = fs.readFileSync(path.join(repoRoot, 'docs/agent-to-agent-communication.md'), 'utf8');
  const prose = guide.replace(/\s+/g, ' ');
  /** @param {RegExp} pattern @returns {string} */
  const section = (pattern) => {
    const match = pattern.exec(prose)?.[1];
    assert.ok(match, `the guide has the section ${pattern}`);
    return match;
  };
  const configuration = section(/## Configuration file (.*?) ## Turning it on and off /);
  const pairing = section(/### Standing pairing (.*?) ## Turning it on and off /);
  const propose = section(/### Propose (.*?) ### Approve /);
  const reuse = section(/#### Reusing a standing pairing (.*?) ### Approve /);
  const approve = section(/### Approve (.*?) ### Which messages can approve /);
  const status = section(/### Status (.*?) ### Stop /);
  const stop = section(/### Stop (.*?) ## Asking a question /);
  const collaboration = section(/### Collaboration profiles (.*?) ### Begin, read, and cancel /);
  const security = section(/## Security and disclosure limits (.*?) ## Before any live use /);
  const liveUse = section(/## Before any live use (.*?) ## For maintainers /);

  // The optional profile boolean is a request, never consent; ordinary profiles keep one-use approval, and a worker
  // qualification block refuses it.
  assert.match(configuration, /\| `pairing` \| both \| no \| `true` asks for a standing pairing, so one approval also covers later matching activations; absent or `false` keeps one-use approval\. It is a request, never consent\. See \[Standing pairing\]\(#standing-pairing\)\. \|/);
  assert.match(pairing, /A profile that sets `"pairing": true` asks for a standing pairing: one approval that also covers later matching activations\. The setting is a request, never consent\. Without it, or with `false`, every activation still needs its own proposal and approval, exactly as before\./);
  assert.match(pairing, /A serving profile whose worker has a `qualification` block refuses `"pairing": true`, so a native qualification run keeps its own typed approvals and consent\./);
  // First enrollment through the complete proposal and the exact typed approval, then zero-prompt reuse with its notice.
  assert.match(pairing, /\*\*Enrollment, once\.\*\* Request the profile with `dude_a2a_propose`\. The result is the complete proposal with its PAIRING lines\. Review all of it, then type or paste the exact `dude a2a approve <code>` from its `Approval` line\. That one approval also saves the pairing\./);
  assert.match(pairing, /\*\*Later use, with no prompt\.\*\* A later `dude_a2a_propose` request for the same profile, in this or a later session on this computer, starts a fresh activation at once when the pairing still matches exactly\. There is no new proposal, code, or approval\. Before the activation goes live, Dude logs the required `A2A standing pairing in use` notice, and the tool result then begins `Activation: active`\./);
  assert.match(pairing, /Each owner pairs only their own side\. One owner's pairing never enrolls or wakes the other side/);
  // The external record: its exact location, never in a repository, and its closed digest-only content.
  assert.match(guide, /```text\r?\n<config>\.pairings\/<sha256\(profile ID\)>\.json\r?\n```/);
  assert.match(pairing, /`<config>` is the configuration file's full real path, and `<sha256\(profile ID\)>` is the SHA-256 of the exact, case-sensitive profile ID as 64 lowercase hex digits\. The record is never kept in a repository: its folder must be outside the session's workspace and outside every Git checkout or worktree/);
  assert.match(pairing, /If your configuration is inside a repository, a paired profile is refused until you move the configuration to a local folder outside every repository; ordinary profiles are unaffected\./);
  assert.match(pairing, /A record holds only `\{"version":1,"bindingSha256":"<64 hex digits>"\}`, at most 1 KiB: a digest of what was approved, never the values themselves, the proposal, a code, a session, a key, a credential, or a time\./);
  // Exact identity and scope drift needs a new enrollment; allowances are per activation and expiries never extend.
  assert.match(pairing, /so another folder later created at the same path does not match/);
  assert.match(pairing, /including the peer's address and certificate pin/);
  assert.match(pairing, /Any difference means no match, even a whitespace edit or a change to another profile in the same file\. The next request then gets the complete enrollment proposal again, and only its approval replaces the record\./);
  assert.match(pairing, /Numeric `repeatUse` limits, for exchanges and for command runs, count within one activation and restart with the next; there is no standing total\. An `expiresAt` time is absolute and never extended/);
  assert.match(pairing, /Restoring the exact approved configuration can match an old record again, so editing the configuration does not revoke a pairing\. Only deleting the record revokes it/);
  assert.match(pairing, /Native qualification of pairing is deferred and not passed: actual host display of the PAIRING lines and the notice, human review and input delivery, native model behavior, saved sign-in, physical LAN, and other platforms remain unqualified\. No new host support is claimed\./);

  // Propose: preparation-only and fresh approval per activation are scoped to unpaired profiles; the PAIRING lines are
  // documented exactly; a matching record activates only after every check, never past the size cap.
  assert.match(propose, /For an unpaired profile, and for a paired profile without a matching standing record, preparation validates the configuration, TLS files, and current local binding\. It does not approve, load the A2A runtime, open a listener or socket, connect to the peer, send a question, run verification or Git probes, save a pairing, or change workflow state\./);
  assert.match(propose, /its `Approval` line ends with `; also saves the PAIRING grant`/);
  const lines = guide.split(/\r?\n/);
  for (const line of [
    'PAIRING: this approval persists for later matching sessions on this machine; any binding change needs new full approval; numeric repeat use resets per activation; absolute expiries do not extend',
    'Pairing record: <record path>; holds a digest only; revoke: dude a2a stop, then delete that file; stop or a config edit alone does not revoke',
    'Pairing trust: ordinary root input does not prove human authorship; an unrestricted local file writer can forge or remove this grant',
  ]) assert.ok(lines.includes(line), `documented PAIRING line: ${line}`);
  assert.match(propose, /This holds for a paired profile too: a matching standing record never bypasses the cap\./);
  assert.match(propose, /give fresh local approval for each activation of an unpaired profile\. A smaller paired profile skips that only through its own exact, matching standing pairing; no larger or refused profile lends it approval\./);
  assert.match(reuse, /For a profile with `"pairing": true`, the same request first runs every check above, including the 4,490-byte cap on the complete proposal it would show\./);
  assert.match(reuse, /\*\*No record, or one that does not match:\*\* the result is the complete enrollment proposal with its PAIRING lines\. It activates nothing; only its approval saves or replaces the record\./);
  assert.match(reuse, /\*\*A damaged, unreadable, or linked record, or a disallowed location:\*\* a short refusal with no proposal body, code, or activation\. The record's content is never shown\./);
  assert.match(reuse, /\*\*A matching record:\*\* no proposal, code, or approval input\. The request starts a fresh activation for this session, with the same queued-input, binding, and startup checks as a typed approval\. Before it can go live, Dude logs the required notice that begins `A2A standing pairing in use:`\./);
  assert.match(reuse, /It asks for nothing\. If it cannot be logged, nothing goes live\./);
  assert.match(reuse, /A successful automatic result begins `Activation: active`, and its `Authority:` line names the standing pairing and how to revoke it\. If startup fails, the result begins `A2A automatic activation is not active:` and states `Activation: inactive`: a saved pairing alone is never reported as a connection, and nothing retries\./);

  // Approve saves the grant only after every check, with no one-use fallback; Status names each pairing notice.
  assert.match(approve, /For a proposal with PAIRING lines, the same approval also saves the standing record, once every check above passes and before anything starts\. The log then shows `A2A pairing saved: <record path>\. \.\.\.`\. If the record cannot be saved, nothing activates, and there is no fallback to one-use approval\. If startup fails after the save, the record stays, the log says `A2A paired, inactive: <reason>\. \.\.\.`, and nothing retries/);
  assert.match(status, /\| `Activation: active; \.\.\.` \| A typed approval took effect\. An automatic activation returns this text as its `dude_a2a_propose` result instead of logging it\. \|/);
  assert.match(status, /\| `A2A pairing saved: <record path>\. \.\.\.` \|/);
  assert.match(status, /\| `A2A paired, inactive: <reason>\. \.\.\.` \|/);
  assert.match(status, /\| `A2A standing pairing in use: \.\.\.` \| Required before an automatic activation goes live\. It names the profile, peer, workspace, scopes, limits, record, and how to revoke, and needs no response\. \|/);

  // Stop ends the current activation and keeps the grant; only deleting the record revokes.
  assert.match(stop, /For a paired profile, stop ends only the current activation\. It keeps the standing record and never starts a replacement on its own\./);
  assert.match(stop, /Only deleting the record revokes a pairing\. Use `dude a2a stop`, then delete the record file named in the proposal, the approval notices, and the automatic notice\. Deletion works while Dude is not running and needs no acknowledgment from the peer\./);
  assert.match(stop, /Editing the configuration, removing the profile, or setting `pairing` to `false` does not revoke: restoring the exact approved configuration can match the record again\./);
  assert.match(stop, /for a paired activation, its standing record is deleted, changed, or can no longer be read safely, checked during startup and before each admission, run, reply, and send;/);
  assert.match(stop, /Nothing is restored from history\. For an unpaired profile, propose and approve again\. For a paired profile whose record still matches, a new request starts a fresh activation, never the old one\./);

  // Collaboration scope: a fresh worker permit per activation only from a shown WORKER grant; qualification stays unpaired.
  assert.match(collaboration, /Only an approval of such a proposal, or a standing pairing saved from one, creates a worker permit, new for each activation; the transport grant alone never starts a worker, and no permit outlives its activation\./);
  assert.match(collaboration, /A worker with a `qualification` block cannot be paired: its profile refuses `"pairing": true`, so a standing pairing never replaces a native qualification run's typed approvals or consent\./);

  // The ordinary local trust limit, and live use still needing exact authorization.
  assert.match(security, /The configuration, key files, and pairing records are protected only by their file permissions\./);
  assert.match(security, /Its one enrollment approval is root input, not proof of human authorship\. Anything that can write the `\.pairings` folder without restriction can forge or remove a grant; the record has no signature or seal\. After enrollment, anything that can call `dude_a2a_propose` in that session, including its model, can start a paired activation within the stored scope without asking you\./);
  assert.match(liveUse, /for a standing pairing, each paired profile and its record location;/);
  assert.match(liveUse, /Standing pairing has automated evidence only, and its native qualification is deferred and not passed/);

  // The unscoped statements are gone, and the guide carries no concrete grant or claim of native qualification.
  assert.doesNotMatch(prose, /Preparation validates the configuration/, 'preparation-only wording is scoped to unpaired profiles');
  assert.doesNotMatch(prose, /give fresh local approval for each activation\. There is no summary/, 'fresh approval per activation is scoped to unpaired profiles');
  assert.doesNotMatch(prose, /Nothing is restored from history; propose and approve again\./, 'propose-and-approve-again is scoped to unpaired profiles');
  assert.doesNotMatch(prose, /Only an approval of such a proposal creates the activation's worker permit/, 'a standing pairing saved from a WORKER grant also creates permits');
  assert.doesNotMatch(prose, /\bstop (?:also )?revokes\b/i, 'stop never revokes a pairing');
  assert.doesNotMatch(guide, /\.pairings[\\/][0-9a-f]{64}\.json|"bindingSha256":"[0-9a-f]{64}"/, 'no concrete pairing record belongs in the guide');
  assert.doesNotMatch(guide, /dude a2a approve [0-9a-f]{12}(?:\s|$)/, 'no usable approval code belongs in the guide');
  assert.doesNotMatch(prose, /pairing (?:is|was|has been) (?:natively )?(?:qualified|verified|proven)|native qualification of pairing (?:passed|is complete)/i,
    'no claim that pairing is natively qualified');
});

test('buildDev rejects malformed canonical config before cleanup and leaves prior output byte-identical', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-invalid-config-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    w(root, 'src/agents/dude.agent.md', agentSource({ stem: 'dude', name: 'Dude', modelClass: 'inherit' }));
    w(root, 'src/skills/dude-lint/lint.mjs', 'export const lint = true;\n');
    buildDev({ repoRoot: root });
    w(root, '.github/agents/dude-stale.agent.md', 'must survive invalid config\n');
    const before = snapshotTree(path.join(root, '.github'));

    writeCanonicalConfig(root, Buffer.from('{ malformed JSON\n'));
    assert.throws(
      () => buildDev({ repoRoot: root }),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /agent model configuration .*malformed JSON/i);
        assert.ok(
          message.includes(path.join(root, 'src', 'config', 'agent-models.json')),
          'the planner must give the loader the absolute canonical config path',
        );
        return true;
      },
    );

    assert.deepEqual(snapshotTree(path.join(root, '.github')), before);
    assert.equal(
      fs.readFileSync(path.join(root, '.github/agents/dude-stale.agent.md'), 'utf8'),
      'must survive invalid config\n',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev validates the complete core agent set before cleanup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-agent-set-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    w(root, 'src/agents/dude.agent.md', agentSource({ stem: 'dude', name: 'Dude', modelClass: 'inherit' }));
    w(root, 'src/agents/dude-twin.agent.md', agentSource({ stem: 'dude-twin', name: 'Dude' }));
    w(root, '.github/agents/dude.agent.md', 'prior profile\n');
    w(root, '.github/agents/dude-stale.agent.md', 'prior stale profile\n');
    const before = snapshotTree(path.join(root, '.github'));

    assert.throws(() => buildDev({ repoRoot: root }), /duplicates display name 'Dude'/);

    assert.deepEqual(snapshotTree(path.join(root, '.github')), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev removes stale Copilot profiles without touching pack, local, project, or retired roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-stale-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    w(root, 'src/agents/dude-old.agent.md', agentSource({ stem: 'dude-old', name: 'Old' }));
    w(root, 'src/agents/dude-gone.agent.md', agentSource({ stem: 'dude-gone', name: 'Gone' }));
    buildDev({ repoRoot: root });

    const untouched = new Map([
      ['.github/agents/dude-pack-fixture.agent.md', Buffer.from('pack\n')],
      ['.github/agents/dude-local-fixture.agent.md', Buffer.from('local\n')],
      ['.github/agents/project-fixture.agent.md', Buffer.from('project\n')],
      ['.claude/agents/dude-old.md', Buffer.from('retired target\n')],
      ['.github/agents-sdk/dude-old.agent.json', Buffer.from('retired target\n')],
    ]);
    for (const [rel, bytes] of untouched) w(root, rel, bytes);

    fs.renameSync(
      path.join(root, 'src/agents/dude-old.agent.md'),
      path.join(root, 'src/agents/dude-new.agent.md'),
    );
    w(root, 'src/agents/dude-new.agent.md', agentSource({ stem: 'dude-new', name: 'Old' }));
    fs.rmSync(path.join(root, 'src/agents/dude-gone.agent.md'));

    const second = buildDev({ repoRoot: root });

    for (const stem of ['dude-old', 'dude-gone']) {
      const rel = copilotAgentPath(stem);
      assert.equal(has(root, rel), false, `${rel} lingered after its source disappeared`);
      assert.ok(second.removed.includes(rel), `${rel} was not reported as removed`);
    }
    assertCopilotProjection(root, 'dude-new');
    for (const [rel, bytes] of untouched) {
      assertExactBytes(fs.readFileSync(path.join(root, ...rel.split('/'))), bytes, rel);
      assert.equal(second.removed.includes(rel), false, `${rel} was removed`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev replaces only the Dude extension runtime tree with the exact source allowlist', () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-extension-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    const runtime = writeDudeExtensionFixture(root, { includeExcluded: true });
    for (const [relPath, bytes] of Object.entries({
      '.github/extensions/other/deep/sentinel.txt': 'other extension\n',
      '.github/extensions/dude-preview/extension.mjs': 'preview extension\n',
      '.github/extensions/project-owned.txt': 'project extension root file\n',
      '.github/agents/dude-pack-fixture.agent.md': 'pack profile\n',
      '.github/agents/dude-local-fixture.agent.md': 'local profile\n',
      '.github/agents/project-fixture.agent.md': 'project profile\n',
      '.github/skills/project/SKILL.md': 'project skill\n',
      '.github/extensions/dude/extension.mjs': 'stale extension\n',
      '.github/extensions/dude/lib/removed.mjs': 'stale lib runtime\n',
      '.github/extensions/dude/ui/assets/former-app.js': 'stale asset\n',
      '.github/extensions/dude/frontend/escaped.jsx': 'stale frontend\n',
    })) w(root, relPath, bytes);
    const protectedExtensions = snapshotTree(path.join(root, '.github/extensions'))
      .filter((entry) => entry.path !== 'dude' && !entry.path.startsWith('dude/'));
    const protectedPaths = new Map([
      ['.github/agents/dude-pack-fixture.agent.md', Buffer.from('pack profile\n')],
      ['.github/agents/dude-local-fixture.agent.md', Buffer.from('local profile\n')],
      ['.github/agents/project-fixture.agent.md', Buffer.from('project profile\n')],
      ['.github/skills/project/SKILL.md', Buffer.from('project skill\n')],
    ]);

    // Act
    const result = buildDev({ repoRoot: root });
    const projected = snapshotTree(path.join(root, '.github/extensions/dude'))
      .filter((entry) => entry.type === 'file')
      .map((entry) => entry.path)
      .sort();

    // Assert
    const expected = Object.keys(runtime)
      .map((relPath) => relPath.replace(/^src\/extensions\/dude\//, ''))
      .sort();
    assert.deepEqual(projected, expected);
    for (const relativePath of expected) {
      assertExactBytes(
        fs.readFileSync(path.join(root, '.github/extensions/dude', ...relativePath.split('/'))),
        Buffer.from(runtime[`src/extensions/dude/${relativePath}`]),
        relativePath,
      );
    }
    assert.ok(result.removed.includes('.github/extensions/dude'));
    assert.deepEqual(
      snapshotTree(path.join(root, '.github/extensions'))
        .filter((entry) => entry.path !== 'dude' && !entry.path.startsWith('dude/')),
      protectedExtensions,
      'every unrelated extension path retains its pre-build bytes and type',
    );
    for (const [relPath, bytes] of protectedPaths) {
      assertExactBytes(fs.readFileSync(path.join(root, ...relPath.split('/'))), bytes, relPath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev rejects unsafe extension roots and computed extension outputs before cleanup', () => {
  const cases = [
    {
      label: 'wrong-type extensions root',
      setup: (root) => w(root, '.github/extensions', 'not a directory\n'),
    },
    {
      label: 'wrong-type exact Dude root',
      setup: (root) => w(root, '.github/extensions/dude', 'not a directory\n'),
    },
    {
      label: 'symlinked extensions root',
      setup: (root, outside) => {
        fs.mkdirSync(path.join(root, '.github'), { recursive: true });
        fs.symlinkSync(path.join(outside, 'extension-root'), path.join(root, '.github/extensions'), 'dir');
      },
    },
    {
      label: 'symlinked exact Dude root',
      setup: (root, outside) => {
        fs.mkdirSync(path.join(root, '.github/extensions'), { recursive: true });
        fs.symlinkSync(path.join(outside, 'dude-root'), path.join(root, '.github/extensions/dude'), 'dir');
      },
    },
    {
      label: 'symlinked computed runtime output parent',
      setup: (root, outside) => {
        fs.mkdirSync(path.join(root, '.github/extensions/dude'), { recursive: true });
        fs.symlinkSync(path.join(outside, 'lib'), path.join(root, '.github/extensions/dude/lib'), 'dir');
      },
    },
  ];

  for (const { label, setup } of cases) {
    // Arrange
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-extension-preflight-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-extension-outside-'));
    try {
      writeCanonicalConfig(root);
      writeBuildMetadata(root);
      writeDudeExtensionFixture(root);
      w(root, '.github/agents/dude-stale.agent.md', 'must survive preflight\n');
      w(outside, 'sentinel.txt', 'outside bytes\n');
      setup(root, outside);
      const beforeRoot = snapshotTree(root);
      const beforeOutside = snapshotTree(outside);

      // Act + Assert
      assert.throws(() => buildDev({ repoRoot: root }), /unsafe|symbolic link|non-directory/i, label);
      assert.deepEqual(snapshotTree(root), beforeRoot, `${label}: repository preimage changed`);
      assert.deepEqual(snapshotTree(outside), beforeOutside, `${label}: outside preimage changed`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }
});

test('buildDev keeps every current mutation destination behind symlink preflight', async (context) => {
  if (process.platform === 'win32') return context.skip('symlink semantics differ on Windows');

  for (const relPath of ['.github', '.github/agents', '.github/skills', '.github/instructions']) {
    await context.test(relPath, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-link-'));
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-link-target-'));
      try {
        writeCanonicalConfig(root);
        writeBuildMetadata(root);
        w(root, 'src/agents/dude.agent.md', agentSource({ stem: 'dude', name: 'Dude', modelClass: 'inherit' }));
        w(root, 'src/instructions/dude.instructions.md', 'new instructions\n');
        w(root, 'src/skills/dude-lint/lint.mjs', 'new skill\n');
        w(outside, 'sentinel.txt', 'outside sentinel\n');
        const link = path.join(root, ...relPath.split('/'));
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(path.join(outside, 'destination'), link, 'dir');

        const beforeRoot = snapshotTree(root);
        const beforeOutside = snapshotTree(outside);
        assert.throws(
          () => buildDev({ repoRoot: root }),
          /symbolic link|containment|escape|unsafe/i,
        );
        assert.deepEqual(snapshotTree(root), beforeRoot);
        assert.deepEqual(snapshotTree(outside), beforeOutside);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  }
});

test('buildDev produces byte-stable outputs on repeated valid runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-determinism-'));
  try {
    writeCanonicalConfig(root);
    writeBuildMetadata(root);
    w(root, 'src/agents/dude.agent.md', agentSource({
      stem: 'dude',
      name: 'Dude',
      modelClass: 'inherit',
      extra: 'agents: ["*"]\n',
    }));
    w(root, 'src/agents/dude-spec-lead.agent.md', agentSource({
      stem: 'dude-spec-lead',
      name: 'Spec Lead',
      modelClass: 'reasoning',
    }));
    w(root, 'src/instructions/dude.instructions.md', '# Instructions\n');
    w(root, 'src/skills/dude-lint/lint.mjs', 'export const lint = true;\n');

    const first = buildDev({ repoRoot: root });
    const firstTree = snapshotTree(path.join(root, '.github'));
    const second = buildDev({ repoRoot: root });
    const secondTree = snapshotTree(path.join(root, '.github'));
    const third = buildDev({ repoRoot: root });
    const thirdTree = snapshotTree(path.join(root, '.github'));

    assert.deepEqual(second.written, first.written);
    assert.deepEqual(third.written, second.written);
    assert.deepEqual(secondTree, firstTree);
    assert.deepEqual(thirdTree, firstTree);
    assert.deepEqual(third.removed, second.removed);
    assertExactBytes(
      fs.readFileSync(path.join(root, '.github/skills/dude-engine/config/agent-models.json')),
      MODEL_CONFIG,
      'repeated packaged config',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev records the highest stable release tag merged into the exact source root', () => {
  // Arrange: v1.10.0 is the numerically highest merged stable tag, on an older
  // commit than the nearest tag. A prerelease, a non-release tag, and a higher
  // tag on an unmerged branch must not qualify.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-base-release-'));
  const recordPath = path.join(root, ...BASE_RELEASE_PATH.split('/'));
  const originalWriteFileSync = fs.writeFileSync;
  try {
    const preserved = writeProvenanceFixture(root);
    initSourceRepository(root);
    git(root, ['tag', 'v1.10.0']);
    commitAll(root, 'second');
    git(root, ['tag', '-a', '-m', 'annotated release', 'v1.2.0', 'HEAD~1']);
    git(root, ['tag', 'v1.9.0']);
    git(root, ['tag', 'v2.0.0-rc1']);
    git(root, ['tag', 'nightly']);
    git(root, ['checkout', '--quiet', '-b', 'unmerged']);
    commitAll(root, 'unmerged release');
    git(root, ['tag', 'v9.0.0']);
    git(root, ['checkout', '--quiet', 'main']);

    // Act: first build, an unchanged rebuild, then a newly merged release.
    const first = buildDev({ repoRoot: root });
    const firstRecord = fs.readFileSync(recordPath);
    /** @type {string[]} */
    const recordWrites = [];
    fs.writeFileSync = /** @type {typeof fs.writeFileSync} */ ((file, ...rest) => {
      if (path.resolve(String(file)) === recordPath) recordWrites.push(String(file));
      return originalWriteFileSync(file, ...rest);
    });
    const second = buildDev({ repoRoot: root });
    fs.writeFileSync = originalWriteFileSync;
    commitAll(root, 'third');
    git(root, ['tag', 'v1.11.0']);
    const third = buildDev({ repoRoot: root });

    // Assert
    assert.deepEqual(first.baseRelease, { release: 'v1.10.0', reason: null });
    assert.ok(first.written.includes(BASE_RELEASE_PATH), 'a new record is reported as written');
    assertExactBytes(firstRecord, baseReleaseBytes('v1.10.0'), BASE_RELEASE_PATH);
    assert.deepEqual(second.baseRelease, first.baseRelease);
    assert.equal(second.written.includes(BASE_RELEASE_PATH), false, 'unchanged record reported as written');
    assert.deepEqual(recordWrites, [], 'identical record bytes were rewritten');
    assert.deepEqual(third.baseRelease, { release: 'v1.11.0', reason: null });
    assert.ok(third.written.includes(BASE_RELEASE_PATH), 'a changed record is reported as written');
    assertExactBytes(fs.readFileSync(recordPath), baseReleaseBytes('v1.11.0'), BASE_RELEASE_PATH);
    for (const result of [first, second, third]) {
      assert.equal(result.removed.includes(BASE_RELEASE_PATH), false);
    }
    assertPreserved(root, preserved);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev removes an earlier record when base release evidence is unknown', async (context) => {
  const releaseManifest = MANIFEST.replace(
    '"source_ref":"main","installed_ref":"main"',
    '"source_ref":"latest","installed_ref":"v1.3.0"',
  );
  /**
   * Each case leaves a taggable fixture whose evidence stays incomplete. The
   * stale record is present before the build.
   * @type {Array<{
   *   label: string,
   *   reason: RegExp,
   *   prepare: (sandbox: string) => { root: string, preserved: Map<string, Buffer>, env?: Record<string, string> },
   * }>}
   */
  const cases = [
    {
      label: 'no Git repository',
      reason: /not a readable Git repository/,
      prepare: (sandbox) => {
        const root = path.join(sandbox, 'root');
        const preserved = writeProvenanceFixture(root);
        w(root, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        return { root, preserved, env: { GIT_CEILING_DIRECTORIES: sandbox } };
      },
    },
    {
      label: 'Git unavailable',
      reason: /Git is unavailable/,
      prepare: (sandbox) => {
        const root = path.join(sandbox, 'root');
        const preserved = writeProvenanceFixture(root);
        w(root, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        initSourceRepository(root);
        git(root, ['tag', 'v1.3.0']);
        return { root, preserved, env: { PATH: '' } };
      },
    },
    {
      label: 'a parent repository root',
      reason: /Git root is not the build root/,
      prepare: (sandbox) => {
        const parent = path.join(sandbox, 'parent');
        const root = path.join(parent, 'child');
        const preserved = writeProvenanceFixture(root);
        w(root, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        initSourceRepository(parent);
        git(parent, ['tag', 'v5.0.0']);
        return { root, preserved };
      },
    },
    {
      label: 'shallow history',
      reason: /Git history is shallow/,
      prepare: (sandbox) => {
        const source = path.join(sandbox, 'source');
        const root = path.join(sandbox, 'root');
        const preserved = writeProvenanceFixture(source);
        w(source, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        initSourceRepository(source);
        git(source, ['tag', 'v1.3.0']);
        git(sandbox, ['clone', '--quiet', '--depth=1', '--branch', 'main', pathToFileURL(source).href, root]);
        assert.match(git(root, ['tag', '--list']), /v1\.3\.0/, 'the shallow clone still carries the tip tag');
        return { root, preserved };
      },
    },
    {
      label: 'no reachable stable tag',
      reason: /no stable release tag is merged into the current commit/,
      prepare: (sandbox) => {
        const root = path.join(sandbox, 'root');
        const preserved = writeProvenanceFixture(root);
        w(root, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        initSourceRepository(root);
        git(root, ['tag', 'v2.0.0-rc1']);
        git(root, ['tag', 'nightly']);
        git(root, ['checkout', '--quiet', '-b', 'unmerged']);
        commitAll(root, 'unmerged release');
        git(root, ['tag', 'v3.0.0']);
        git(root, ['checkout', '--quiet', 'main']);
        return { root, preserved };
      },
    },
    {
      label: 'no current commit',
      reason: /no current commit/,
      prepare: (sandbox) => {
        const root = path.join(sandbox, 'root');
        const preserved = writeProvenanceFixture(root);
        w(root, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        git(root, ['init', '--quiet', '-b', 'main']);
        return { root, preserved };
      },
    },
    {
      label: 'a release manifest',
      reason: /installed_ref is not main/,
      prepare: (sandbox) => {
        const root = path.join(sandbox, 'root');
        const preserved = writeProvenanceFixture(root, releaseManifest);
        w(root, BASE_RELEASE_PATH, baseReleaseBytes('v0.9.0'));
        initSourceRepository(root);
        git(root, ['tag', 'v1.3.0']);
        return { root, preserved };
      },
    },
  ];

  for (const { label, reason, prepare } of cases) {
    await context.test(label, () => {
      // Arrange
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-unknown-base-'));
      try {
        const { root, preserved, env = {} } = prepare(sandbox);
        const recordPath = path.join(root, ...BASE_RELEASE_PATH.split('/'));
        assert.equal(fs.existsSync(recordPath), true, 'the fixture starts with an earlier record');

        // Act
        const first = withEnvironment(env, () => buildDev({ repoRoot: root }));
        const second = withEnvironment(env, () => buildDev({ repoRoot: root }));

        // Assert
        assert.equal(first.baseRelease.release, null);
        assert.match(String(first.baseRelease.reason), reason);
        assert.equal(fs.existsSync(recordPath), false, 'the earlier base was not cleared');
        assert.ok(first.removed.includes(BASE_RELEASE_PATH), 'the removal is reported');
        assert.equal(first.written.includes(BASE_RELEASE_PATH), false);
        assert.deepEqual(second.baseRelease, first.baseRelease);
        assert.equal(second.removed.includes(BASE_RELEASE_PATH), false, 'an absent record is not removed again');
        assert.equal(second.written.includes(BASE_RELEASE_PATH), false);
        assertPreserved(root, preserved);
      } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
      }
    });
  }
});

test('buildDev rejects an unsafe base release destination before cleanup', async (context) => {
  for (const label of ['directory', 'symbolic link']) {
    await context.test(label, (subtest) => {
      // Arrange
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-record-preflight-'));
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-record-outside-'));
      try {
        writeProvenanceFixture(root);
        w(root, '.github/agents/dude-stale.agent.md', 'must survive preflight\n');
        w(outside, 'record.md', 'outside bytes\n');
        if (label === 'directory') {
          w(root, `${BASE_RELEASE_PATH}/nested.md`, 'occupied\n');
        } else {
          try {
            fs.symlinkSync(path.join(outside, 'record.md'), path.join(root, ...BASE_RELEASE_PATH.split('/')), 'file');
          } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && ['EPERM', 'EACCES'].includes(String(error.code))) {
              subtest.skip(`symbolic links unavailable: ${error.code}`);
              return;
            }
            throw error;
          }
        }
        const beforeRoot = snapshotTree(root);
        const beforeOutside = snapshotTree(outside);

        // Act + Assert
        assert.throws(
          () => buildDev({ repoRoot: root }),
          /unsafe build-dev destination '\.dude\/metadata\/development-base-release\.md'/,
        );
        assert.deepEqual(snapshotTree(root), beforeRoot, 'the build changed the repository before refusing');
        assert.deepEqual(snapshotTree(outside), beforeOutside);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  }
});
