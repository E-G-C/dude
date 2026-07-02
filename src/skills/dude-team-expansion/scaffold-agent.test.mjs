// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scaffoldAgent, parseArgs } from './scaffold-agent.mjs';
import { listProvide } from '../dude-engine/lib/pack-manifest.mjs';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-scaffold-agent-'));
}

/** @param {string} root @param {string} pack */
function seedPack(root, pack) {
  const dir = path.join(root, 'library', 'packs', pack);
  fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'pack.md'),
    `---\nname: ${pack}\ndescription: "x"\nprovides:\n  agents:\n    - dude-pack-${pack}-existing\n---\n\n# ${pack}\n`
  );
  fs.writeFileSync(path.join(dir, 'agents', `dude-pack-${pack}-existing.agent.md`), '---\nname: E\n---\n');
  return dir;
}

test('parseArgs reads slug + flags', () => {
  const a = parseArgs(['sec', '--pack', 'web', '--role', 'Security', '--force']);
  assert.equal(a.slug, 'sec');
  assert.equal(a.pack, 'web');
  assert.equal(a.role, 'Security');
  assert.equal(a.force, true);
});

test('local agent has the coordinator block, tools frontmatter, and LF endings', () => {
  const root = tmpRoot();
  try {
    const { path: p, packUpdated } = scaffoldAgent({ slug: 'chef', root });
    assert.equal(packUpdated, false);
    assert.ok(p.endsWith('.github/agents/dude-local-chef.agent.md'));
    const body = fs.readFileSync(p, 'utf8');
    assert.ok(body.includes('**Coordinator-only artifacts:**'));
    assert.ok(/^tools: \[/m.test(body));
    assert.ok(!body.includes('\r'));
    assert.ok(body.endsWith('\n'));
    assert.ok(body.includes('name: "Chef"'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack agent lands under the pack and updates pack.md provides.agents (sorted)', () => {
  const root = tmpRoot();
  try {
    seedPack(root, 'web');
    const { path: p, packUpdated } = scaffoldAgent({ slug: 'auditor', pack: 'web', root });
    assert.equal(packUpdated, true);
    assert.ok(p.endsWith('library/packs/web/agents/dude-pack-web-auditor.agent.md'));
    const pack = fs.readFileSync(path.join(root, 'library/packs/web/pack.md'), 'utf8');
    assert.deepEqual(listProvide(pack, 'agents'), ['dude-pack-web-auditor', 'dude-pack-web-existing']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refuses an existing destination without --force, and a missing pack', () => {
  const root = tmpRoot();
  try {
    scaffoldAgent({ slug: 'chef', root });
    assert.throws(() => scaffoldAgent({ slug: 'chef', root }), /destination exists/);
    assert.throws(() => scaffoldAgent({ slug: 'inspector', pack: 'ghost', root }), /pack not found/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
