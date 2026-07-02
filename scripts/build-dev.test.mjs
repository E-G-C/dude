// @ts-check
/**
 * Tests for scripts/build-dev.mjs — the dev-bundle sync (src/ core -> .github/).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDev } from './build-dev.mjs';

/** @param {string} root @param {string} rel @param {string} content */
function w(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
/** @param {string} root @param {string} rel */
function has(root, rel) {
  return fs.existsSync(path.join(root, rel));
}
/** @param {string} dir @returns {Record<string,string>} */
function snapshot(dir) {
  /** @type {Record<string,string>} */
  const out = {};
  const scan = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(d, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) scan(abs, rel);
      else out[rel] = fs.readFileSync(abs, 'utf8');
    }
  };
  if (fs.existsSync(dir)) scan(dir, '');
  return out;
}

test('buildDev syncs core from src, strips tests, preserves project / pack / dudestuff', () => {
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
    w(root, '.github/dudestuff/bundle-manifest.md', 'M'); // preserved
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
    assert.ok(has(root, '.github/dudestuff/bundle-manifest.md'));
    assert.ok(has(root, '.github/agents/dude-pack-authoring-agent-smith.agent.md'));

    assert.ok(r.written.includes('.github/skills/dude-lint/lint.mjs'));
    assert.ok(r.removed.includes('.github/skills/dude-stale'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDev is idempotent so the drift check stays clean', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-dev-'));
  try {
    w(root, 'src/agents/dude.agent.md', 'A');
    w(root, 'src/skills/dude-lint/lint.mjs', 'L');
    w(root, 'src/skills/dude-engine/lib/ownership.mjs', 'O');
    w(root, '.github/skills/project/SKILL.md', 'P');

    buildDev({ repoRoot: root });
    const first = snapshot(path.join(root, '.github'));
    buildDev({ repoRoot: root });
    const second = snapshot(path.join(root, '.github'));
    assert.deepEqual(second, first);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
