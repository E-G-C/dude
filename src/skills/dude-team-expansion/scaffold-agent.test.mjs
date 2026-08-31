// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffoldAgent, parseArgs } from './scaffold-agent.mjs';
import { listProvide } from '../dude-engine/lib/pack-manifest.mjs';

const PACKAGED_CONFIG_REL = '.github/skills/dude-engine/config/agent-models.json';
const PACKAGED_CONFIG_BYTES = fs.readFileSync(
  fileURLToPath(new URL('../../config/agent-models.json', import.meta.url)),
);
const MODEL_CLASS_NAMES = Object.keys(JSON.parse(PACKAGED_CONFIG_BYTES.toString('utf8')).classes);

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-scaffold-agent-'));
}

/** @param {string} root @param {string} relPath @param {string | Buffer} content */
function writeFile(root, relPath, content) {
  const abs = path.join(root, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** @param {string} root @param {string} pack @param {{ config?: boolean }} [options] */
function seedPack(root, pack, options = {}) {
  if (options.config !== false) writeFile(root, PACKAGED_CONFIG_REL, PACKAGED_CONFIG_BYTES);
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

test('scaffolds beside retired-root content without changing it', () => {
  const root = tmpRoot();
  try {
    const retiredFiles = [
      ['brief/notes.md', '# Notes\n'],
      ['.dude/brief/archive.md', '# Archive\n'],
      ['specs/example/spec.md', '# Example\n'],
      ['.github/dudestuff/context.md', '# Context\n'],
    ];
    for (const [relative, content] of retiredFiles) {
      const retiredPath = path.join(root, relative);
      fs.mkdirSync(path.dirname(retiredPath), { recursive: true });
      fs.writeFileSync(retiredPath, content);
    }

    const result = scaffoldAgent({ slug: 'current-write', root });

    assert.equal(fs.existsSync(result.path), true);
    for (const [relative, content] of retiredFiles) {
      assert.equal(fs.readFileSync(path.join(root, relative), 'utf8'), content);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
    writeFile(root, PACKAGED_CONFIG_REL, PACKAGED_CONFIG_BYTES);
    assert.throws(() => scaffoldAgent({ slug: 'inspector', pack: 'ghost', root }), /pack not found/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scaffolds the intended agent with canonical ideas present', () => {
  const root = tmpRoot();
  try {
    const ideaPath = path.join(root, '.dude/ideas/001-team-expansion.md');
    fs.mkdirSync(path.dirname(ideaPath), { recursive: true });
    fs.writeFileSync(ideaPath, '# Canonical idea\n');

    const result = scaffoldAgent({ slug: 'canonical-idea', root });

    assert.equal(result.path, path.join(root, '.github/agents/dude-local-canonical-idea.agent.md'));
    assert.equal(fs.existsSync(result.path), true);
    assert.equal(fs.readFileSync(ideaPath, 'utf8'), '# Canonical idea\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parseArgs reads --model-class', () => {
  const a = parseArgs(['sec', '--pack', 'web', '--model-class', 'fast']);
  assert.equal(a.modelClass, 'fast');
});

test('pack agent declares the default class and specialist visibility metadata', () => {
  const root = tmpRoot();
  try {
    seedPack(root, 'web');
    const { path: p } = scaffoldAgent({ slug: 'auditor', pack: 'web', root });
    const body = fs.readFileSync(p, 'utf8');
    assert.match(body, /^model-class: balanced$/m);
    assert.match(body, /^user-invocable: false$/m);
    assert.ok(body.includes('**Coordinator-only artifacts:**'));
    assert.ok(!body.includes('\r'));
    assert.doesNotMatch(body, /^model:/m);
    assert.doesNotMatch(body, /^effort:/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack agent honors an explicit --model-class from packaged configuration', () => {
  const root = tmpRoot();
  try {
    seedPack(root, 'web');
    for (const modelClass of MODEL_CLASS_NAMES) {
      const { path: p } = scaffoldAgent({ slug: 'auditor', pack: 'web', root, modelClass, force: true });
      assert.match(fs.readFileSync(p, 'utf8'), new RegExp(`^model-class: ${modelClass}$`, 'm'));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unknown model class and a model class on a local scaffold', () => {
  const root = tmpRoot();
  try {
    seedPack(root, 'web');
    assert.throws(
      () => scaffoldAgent({ slug: 'auditor', pack: 'web', root, modelClass: 'turbo' }),
      /invalid model class: turbo/,
    );
    assert.throws(
      () => scaffoldAgent({ slug: 'chef', root, modelClass: 'fast' }),
      /--model-class applies to --pack scaffolds only/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('local agent declares no projection metadata, because local agents are not projected', () => {
  const root = tmpRoot();
  try {
    const { path: p } = scaffoldAgent({ slug: 'chef', root });
    const body = fs.readFileSync(p, 'utf8');
    assert.ok(!body.includes('model-class'));
    assert.ok(!body.includes('user-invocable'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unknown model class by naming the value and the accepted set', () => {
  const root = tmpRoot();
  try {
    writeFile(root, PACKAGED_CONFIG_REL, PACKAGED_CONFIG_BYTES);
    assert.throws(
      () => scaffoldAgent({ slug: 'auditor', pack: 'web', root, modelClass: 'turbo' }),
      new RegExp(`invalid model class: turbo \\(expected one of ${MODEL_CLASS_NAMES.join(', ')}\\)`),
    );
    // Fails closed before the pack is touched: nothing is written or seeded.
    assert.equal(fs.existsSync(path.join(root, 'library')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack scaffolding fails closed before any scaffold write for invalid packaged configuration', () => {
  const cases = [
    {
      name: 'missing',
      prepare: () => {},
      expected: /cannot read agent model configuration/,
    },
    {
      name: 'malformed',
      prepare: (root) => writeFile(root, PACKAGED_CONFIG_REL, '{"classes":'),
      expected: /has malformed JSON/,
    },
    {
      name: 'invalid',
      prepare: (root) => writeFile(root, PACKAGED_CONFIG_REL, '{"provenance":"2026-08-09"}\n'),
      expected: /is invalid: agent model configuration document is missing required field 'classes'/,
    },
  ];

  for (const fixture of cases) {
    const root = tmpRoot();
    try {
      seedPack(root, 'web', { config: false });
      const packMd = path.join(root, 'library', 'packs', 'web', 'pack.md');
      const beforePack = fs.readFileSync(packMd);
      const destination = path.join(
        root,
        'library',
        'packs',
        'web',
        'agents',
        'dude-pack-web-auditor.agent.md',
      );
      fixture.prepare(root);

      assert.throws(
        () => scaffoldAgent({ slug: 'auditor', pack: 'web', root }),
        fixture.expected,
        fixture.name,
      );
      assert.equal(fs.existsSync(destination), false, `${fixture.name} creates no scaffold file`);
      assert.deepEqual(fs.readFileSync(packMd), beforePack, `${fixture.name} leaves pack.md unchanged`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
