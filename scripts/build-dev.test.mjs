// @ts-check
/**
 * Tests for scripts/build-dev.mjs — the dev-bundle sync (src/ core -> .github/).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** @param {string} root @param {{ includeExcluded?: boolean }} [options] */
function writeDudeExtensionFixture(root, { includeExcluded = false } = {}) {
  const runtime = {
    'src/extensions/dude/extension.mjs': 'extension runtime\n',
    'src/extensions/dude/lib/canvas-server.mjs': 'server runtime\n',
    'src/extensions/dude/lib/nested/projection.json': '{"runtime":true}\n',
    'src/extensions/dude/ui/index.html': '<!doctype html>\n',
    'src/extensions/dude/ui/assets/app.js': 'browser runtime\n',
    'src/extensions/dude/ui/assets/licenses/NOTICE.txt': 'notice runtime\n',
  };
  for (const [relPath, bytes] of Object.entries(runtime)) w(root, relPath, bytes);
  if (includeExcluded) {
    for (const [relPath, bytes] of Object.entries({
      'src/extensions/dude/canvas-server.test.mjs': 'root test\n',
      'src/extensions/dude/lib/nested/projection.test.mjs': 'nested test\n',
      'src/extensions/dude/lib/source.mjs.map': 'source map\n',
      'src/extensions/dude/lib/node_modules/dependency/index.mjs': 'dependency\n',
      'src/extensions/dude/frontend/app.jsx': 'frontend source\n',
      'src/extensions/dude/ui/preview.html': 'other UI\n',
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

test('checked-in dev core is a byte-identical non-mutating projection of authoritative source', () => {
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
    assertExactBytes(
      fs.readFileSync(path.join(root, '.github/skills/dude-engine/config/agent-models.json')),
      fs.readFileSync(path.join(root, 'src/config/agent-models.json')),
      'complete fixture packaged config',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
