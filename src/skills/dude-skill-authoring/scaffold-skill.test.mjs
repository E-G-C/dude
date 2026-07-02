// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scaffoldSkill, parseArgs } from './scaffold-skill.mjs';
import { listProvide } from '../dude-engine/lib/pack-manifest.mjs';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-scaffold-skill-'));
}

/** @param {string} root @param {string} pack */
function seedPack(root, pack) {
  const dir = path.join(root, 'library', 'packs', pack);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'pack.md'),
    `---\nname: ${pack}\ndescription: "x"\nprovides:\n  agents: []\n---\n\n# ${pack}\n`
  );
}

test('parseArgs reads slug + flags', () => {
  const a = parseArgs(['thing', '--pack', 'hugo', '--desc', 'd', '--force']);
  assert.equal(a.slug, 'thing');
  assert.equal(a.pack, 'hugo');
  assert.equal(a.desc, 'd');
  assert.equal(a.force, true);
});

test('local skill name matches its directory (the lint rule) with LF endings', () => {
  const root = tmpRoot();
  try {
    const { path: p, packUpdated } = scaffoldSkill({ slug: 'time-parsing', root });
    assert.equal(packUpdated, false);
    assert.ok(p.endsWith('.github/skills/dude-local-time-parsing/SKILL.md'));
    const body = fs.readFileSync(p, 'utf8');
    assert.ok(/^name: dude-local-time-parsing$/m.test(body), 'name matches dir');
    assert.ok(!body.includes('\r'));
    assert.ok(body.endsWith('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack skill lands under the pack, name matches dir, provides.skills updated', () => {
  const root = tmpRoot();
  try {
    seedPack(root, 'hugo');
    const { path: p, packUpdated } = scaffoldSkill({ slug: 'linting', pack: 'hugo', root });
    assert.equal(packUpdated, true);
    assert.ok(p.endsWith('library/packs/hugo/skills/dude-pack-hugo-linting/SKILL.md'));
    assert.ok(/^name: dude-pack-hugo-linting$/m.test(fs.readFileSync(p, 'utf8')));
    const pack = fs.readFileSync(path.join(root, 'library/packs/hugo/pack.md'), 'utf8');
    assert.deepEqual(listProvide(pack, 'skills'), ['dude-pack-hugo-linting']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refuses existing without --force and a missing pack', () => {
  const root = tmpRoot();
  try {
    scaffoldSkill({ slug: 'alpha', root });
    assert.throws(() => scaffoldSkill({ slug: 'alpha', root }), /destination exists/);
    assert.throws(() => scaffoldSkill({ slug: 'beta', pack: 'ghost', root }), /pack not found/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
