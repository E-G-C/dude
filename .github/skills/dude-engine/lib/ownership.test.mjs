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
  assert.equal(classifyPath('.github/agents/dude-lead.agent.md'), TIER.CORE);
  assert.equal(classifyPath('.github/instructions/dude.instructions.md'), TIER.CORE);
  assert.equal(classifyPath('.github/skills/dude-lint/SKILL.md'), TIER.CORE);
  assert.equal(classifyPath('.github/skills/dude-engine/lib/ownership.mjs'), TIER.CORE);
});

test('classifyPath: pack tier', () => {
  assert.equal(classifyPath('.github/agents/dude-pack-beads-workflow.agent.md'), TIER.PACK);
  assert.equal(classifyPath('.github/skills/dude-pack-beads-workflow/SKILL.md'), TIER.PACK);
  assert.equal(classifyPath('.github/skills/dude-pack-hugo-docsy-docsy-expert/SKILL.md'), TIER.PACK);
});

test('classifyPath: local tier', () => {
  assert.equal(classifyPath('.github/agents/dude-local-x.agent.md'), TIER.LOCAL);
  assert.equal(classifyPath('.github/skills/dude-local-foo/SKILL.md'), TIER.LOCAL);
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
  assert.equal(isCorePath('.github/agents/dude-lead.agent.md'), true);
  assert.equal(isCorePath('.github/agents/dude-pack-beads-workflow.agent.md'), false);
  assert.equal(isPackPath('.github/agents/dude-pack-beads-workflow.agent.md'), true);
  assert.equal(isLocalPath('.github/skills/dude-local-foo/SKILL.md'), true);
});

test('belongsToPack matches the literal pack prefix', () => {
  assert.equal(belongsToPack('.github/agents/dude-pack-beads-workflow.agent.md', 'beads'), true);
  assert.equal(belongsToPack('.github/skills/dude-pack-beads-spec-import/SKILL.md', 'beads'), true);
  assert.equal(belongsToPack('.github/skills/dude-pack-hugo-docsy-docsy-expert/SKILL.md', 'hugo-docsy'), true);
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
    touch('.github/agents/dude-lead.agent.md');
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
      '.github/agents/dude-lead.agent.md',
      '.github/agents/dude.agent.md',
      '.github/instructions/dude.instructions.md',
      '.github/skills/dude-lint/SKILL.md',
      '.github/skills/dude-lint/lint.mjs',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
