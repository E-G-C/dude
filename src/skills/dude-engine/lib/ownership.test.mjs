// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TIER,
  classifyPath,
  isCorePath,
  isPackPath,
  isLocalPath,
  belongsToPack,
  enumerateCorePaths,
} from './ownership.mjs';

test('classifyPath: core coordinator + instructions', () => {
  assert.equal(classifyPath('.github/agents/dude.agent.md'), TIER.CORE);
  assert.equal(classifyPath('.github/agents/dude-spec-lead.agent.md'), TIER.CORE);
  assert.equal(classifyPath('.github/instructions/dude.instructions.md'), TIER.CORE);
  assert.equal(classifyPath('.github/skills/dude-lint/SKILL.md'), TIER.CORE);
  assert.equal(classifyPath('.github/skills/dude-engine/lib/ownership.mjs'), TIER.CORE);
});

test('classifyPath: pack tier', () => {
  assert.equal(classifyPath('.github/agents/dude-pack-beads-workflow.agent.md'), TIER.PACK);
  assert.equal(classifyPath('.github/skills/dude-pack-beads-workflow/SKILL.md'), TIER.PACK);
  assert.equal(classifyPath('.github/skills/dude-pack-hugo-docsy-docsy-expert/SKILL.md'), TIER.PACK);
  assert.equal(classifyPath('.github/instructions/dude-pack-hugo-project.instructions.md'), TIER.PACK);
  assert.equal(classifyPath('.github/prompts/dude-pack-hugo-create-site.prompt.md'), TIER.PACK);
});

test('classifyPath: local tier', () => {
  assert.equal(classifyPath('.github/agents/dude-local-x.agent.md'), TIER.LOCAL);
  assert.equal(classifyPath('.github/skills/dude-local-foo/SKILL.md'), TIER.LOCAL);
  assert.equal(classifyPath('.github/instructions/dude-local-foo.instructions.md'), TIER.LOCAL);
  assert.equal(classifyPath('.github/prompts/dude-local-foo.prompt.md'), TIER.LOCAL);
});

test('classifyPath: project-owned and non-bundle', () => {
  // The project skill is project-owned, not core.
  assert.equal(classifyPath('.github/skills/project/SKILL.md'), TIER.PROJECT);
  // Project instruction files (not the bundle instructions) are project-owned.
  assert.equal(classifyPath('.github/instructions/docsy-content.instructions.md'), TIER.PROJECT);
  // Unreserved agent/skill names are project-owned.
  assert.equal(classifyPath('.github/agents/custom.agent.md'), TIER.PROJECT);
  assert.equal(classifyPath('.github/skills/custom/SKILL.md'), TIER.PROJECT);
  // Anything outside the bundle namespaces.
  assert.equal(classifyPath('README.md'), TIER.PROJECT);
  assert.equal(classifyPath('docs/upgrading.md'), TIER.PROJECT);
});

test('classifyPath: normalizes separators and prefixes', () => {
  assert.equal(classifyPath('.github\\agents\\dude.agent.md'), TIER.CORE);
  assert.equal(classifyPath('./.github/skills/dude-lint/SKILL.md'), TIER.CORE);
  assert.equal(classifyPath('.github/skills/dude-engine/'), TIER.CORE);
});

test('predicates align with classifyPath', () => {
  assert.equal(isCorePath('.github/agents/dude-spec-lead.agent.md'), true);
  assert.equal(isCorePath('.github/agents/dude-pack-beads-workflow.agent.md'), false);
  assert.equal(isPackPath('.github/agents/dude-pack-beads-workflow.agent.md'), true);
  assert.equal(isLocalPath('.github/skills/dude-local-foo/SKILL.md'), true);
});

test('belongsToPack matches the literal pack prefix', () => {
  assert.equal(belongsToPack('.github/agents/dude-pack-beads-workflow.agent.md', 'beads'), true);
  assert.equal(belongsToPack('.github/skills/dude-pack-beads-spec-import/SKILL.md', 'beads'), true);
  assert.equal(belongsToPack('.github/skills/dude-pack-hugo-docsy-docsy-expert/SKILL.md', 'hugo-docsy'), true);
  assert.equal(belongsToPack('.github/instructions/dude-pack-hugo-project.instructions.md', 'hugo'), true);
  assert.equal(belongsToPack('.github/prompts/dude-pack-hugo-create-site.prompt.md', 'hugo'), true);
  assert.equal(belongsToPack('.github/prompts/create-site.prompt.md', 'hugo'), false);
  assert.equal(belongsToPack('.github/agents/dude-pack-beads-workflow.agent.md', 'release'), false);
  assert.equal(belongsToPack('.github/skills/dude-lint/SKILL.md', 'beads'), false);
});

test('enumerateCorePaths returns only core files, sorted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-ownership-'));
  try {
    /** @param {string} rel */
    const touch = (rel) => {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '');
    };

    touch('.github/agents/dude.agent.md');
    touch('.github/agents/dude-spec-lead.agent.md');
    touch('.github/agents/dude-local-x.agent.md');
    touch('.github/agents/dude-pack-beads-workflow.agent.md');
    touch('.github/agents/custom.agent.md');
    touch('.github/instructions/dude.instructions.md');
    touch('.github/instructions/docsy-content.instructions.md');
    touch('.github/skills/dude-lint/SKILL.md');
    touch('.github/skills/dude-lint/lint.mjs');
    touch('.github/skills/dude-local-foo/SKILL.md');
    touch('.github/skills/dude-pack-beads-workflow/SKILL.md');
    touch('.github/skills/project/SKILL.md');
    touch('README.md');

    const core = enumerateCorePaths(root);

    assert.deepEqual(core, [
      '.github/agents/dude-spec-lead.agent.md',
      '.github/agents/dude.agent.md',
      '.github/instructions/dude.instructions.md',
      '.github/skills/dude-lint/SKILL.md',
      '.github/skills/dude-lint/lint.mjs',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('enumerateCorePaths does not corrupt paths when root is relative', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-ownership-rel-'));
  try {
    /** @param {string} rel */
    const touch = (rel) => {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '');
    };
    touch('.github/agents/dude.agent.md');
    touch('.github/instructions/dude.instructions.md');
    touch('.github/skills/dude-lint/lint.mjs');

    const expected = [
      '.github/agents/dude.agent.md',
      '.github/instructions/dude.instructions.md',
      '.github/skills/dude-lint/lint.mjs',
    ];

    // Absolute root and an equivalent relative root must yield identical,
    // uncorrupted results (regression for `.`-style local upgrade sources).
    const relRoot = path.relative(process.cwd(), root) || '.';
    assert.deepEqual(enumerateCorePaths(root), expected);
    assert.deepEqual(enumerateCorePaths(relRoot), expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('direct Copilot agent paths keep core, pack, local, and project stem ownership', () => {
  // Arrange
  const direct = [
    ['.github/agents/dude-spec-lead.agent.md', TIER.CORE],
    ['.github/agents/dude-pack-demo-worker.agent.md', TIER.PACK],
    ['.github/agents/dude-local-worker.agent.md', TIER.LOCAL],
    ['.github/agents/project-worker.agent.md', TIER.PROJECT],
  ];
  const retiredRoots = [
    '.claude/agents/dude-spec-lead.md',
    '.claude/agents/dude-pack-demo-worker.md',
    '.claude/agents/dude-local-worker.md',
    '.github/agents-sdk/dude-spec-lead.agent.json',
    '.github/agents-sdk/dude-pack-demo-worker.agent.json',
    '.github/agents-sdk/dude-local-worker.agent.json',
  ];

  // Act + Assert
  for (const [relativePath, expectedTier] of direct) {
    assert.equal(classifyPath(relativePath), expectedTier, relativePath);
  }
  for (const relativePath of retiredRoots) {
    assert.equal(classifyPath(relativePath), TIER.PROJECT, relativePath);
  }
});

test('belongsToPack recognizes only the direct Copilot agent tree', () => {
  // Arrange
  const direct = '.github/agents/dude-pack-demo-worker.agent.md';
  const retiredRoots = [
    '.claude/agents/dude-pack-demo-worker.md',
    '.github/agents-sdk/dude-pack-demo-worker.agent.json',
  ];

  // Act + Assert
  assert.equal(belongsToPack(direct, 'demo'), true);
  for (const relativePath of retiredRoots) {
    assert.equal(belongsToPack(relativePath, 'demo'), false, relativePath);
  }
});

test('enumerateCorePaths includes engine configuration as ordinary core-skill content', () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-ownership-direct-'));
  const touch = (relativePath) => {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, '');
  };
  try {
    touch('.github/agents/dude.agent.md');
    touch('.github/agents/dude-spec-lead.agent.md');
    touch('.github/agents/dude-pack-demo-worker.agent.md');
    touch('.github/agents/dude-local-worker.agent.md');
    touch('.github/agents/project-worker.agent.md');
    touch('.github/instructions/dude.instructions.md');
    touch('.github/skills/dude-engine/SKILL.md');
    touch('.github/skills/dude-engine/config/agent-models.json');
    touch('.claude/agents/dude-spec-lead.md');
    touch('.github/agents-sdk/dude-spec-lead.agent.json');

    // Act
    const enumerated = enumerateCorePaths(root);
    const implementation = fs.readFileSync(new URL('./ownership.mjs', import.meta.url), 'utf8');

    // Assert
    assert.deepEqual(enumerated, [
      '.github/agents/dude-spec-lead.agent.md',
      '.github/agents/dude.agent.md',
      '.github/instructions/dude.instructions.md',
      '.github/skills/dude-engine/SKILL.md',
      '.github/skills/dude-engine/config/agent-models.json',
    ]);
    assert.doesNotMatch(
      implementation,
      /\b(?:CORE_TREES|matchCoreTree|agent-models\.json)\b|\.github\/skills\/dude-engine\/config/,
      'ordinary skill traversal must not gain a topology or configuration-specific rule',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
