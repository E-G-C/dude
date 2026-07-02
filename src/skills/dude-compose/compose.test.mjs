// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { cmdAdd, cmdRemove, cmdList, cmdStatus, cmdVerify, readProfile, isMainModule } from './compose.mjs';

/**
 * Build a throwaway bundle root with a minimal `.github/` and a small pack
 * catalog. Returns the root dir (caller removes it).
 * @returns {string}
 */
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-'));
  // minimal .github
  for (const d of ['agents', 'skills', 'instructions', 'prompts', 'dudestuff']) {
    fs.mkdirSync(path.join(root, '.github', d), { recursive: true });
  }
  // catalog: pack "demo" with one agent + one skill
  const demo = path.join(root, 'library', 'packs', 'demo');
  fs.mkdirSync(path.join(demo, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(demo, 'skills', 'dude-pack-demo-helper'), { recursive: true });
  fs.writeFileSync(path.join(demo, 'pack.md'), '---\nname: demo\ndescription: "demo pack"\n---\n# Demo\n');
  fs.writeFileSync(
    path.join(demo, 'agents', 'dude-pack-demo-worker.agent.md'),
    '---\nname: demo-worker\n---\n# Worker\n'
  );
  fs.writeFileSync(
    path.join(demo, 'skills', 'dude-pack-demo-helper', 'SKILL.md'),
    '---\nname: dude-pack-demo-helper\ndescription: "helper"\n---\n# Helper\n'
  );
  return root;
}

/** @param {string} root */
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/**
 * A bundle root with an empty `.github/` and an empty local catalog (no packs).
 * @returns {string}
 */
function bareRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-root-'));
  for (const d of ['agents', 'skills', 'instructions', 'prompts', 'dudestuff']) {
    fs.mkdirSync(path.join(root, '.github', d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, 'library', 'packs'), { recursive: true });
  return root;
}

/**
 * A throwaway "upstream" tree containing a single skill-only pack at
 * `library/packs/<name>/`. Returns the tree root (caller removes it).
 * @param {string} name
 * @returns {string}
 */
function upstreamWith(name) {
  const up = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-upstream-'));
  const pk = path.join(up, 'library', 'packs', name);
  fs.mkdirSync(path.join(pk, 'skills', `dude-pack-${name}-s`), { recursive: true });
  fs.writeFileSync(path.join(pk, 'pack.md'), `---\nname: ${name}\ndescription: "x"\n---\n# ${name}\n`);
  fs.writeFileSync(
    path.join(pk, 'skills', `dude-pack-${name}-s`, 'SKILL.md'),
    `---\nname: dude-pack-${name}-s\ndescription: "s"\n---\n# S\n`
  );
  return up;
}

/** @param {string} sourceRepo @returns {string} a seeded bundle-manifest.md body */
function manifestBody(sourceRepo) {
  const json = JSON.stringify(
    { source_repo: sourceRepo, source_ref: 'main', installed_sha: '0'.repeat(40), installed_at: '2026-01-01T00:00:00Z' },
    null,
    2
  );
  return `# Bundle Manifest\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

test('add installs artifacts and records the profile', () => {
  const root = scaffold();
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(r.ok, true, r.error);
    assert.ok(fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')));
    assert.ok(fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper/SKILL.md')));

    const profile = readProfile(root);
    assert.deepEqual(profile.enabled_packs, ['demo']);
    assert.ok(profile.installed.demo);
    assert.equal(profile.installed.demo.files.length, 2);
  } finally {
    cleanup(root);
  }
});

test('add is idempotent when already installed', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const r = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(r.ok, true);
    assert.equal(r.result.alreadyInstalled, true);
  } finally {
    cleanup(root);
  }
});

test('list reports installed flag', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    let r = cmdList({ root, library: lib });
    assert.equal(r.result.packs.find((/** @type {any} */ p) => p.name === 'demo').installed, false);
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    r = cmdList({ root, library: lib });
    assert.equal(r.result.packs.find((/** @type {any} */ p) => p.name === 'demo').installed, true);
  } finally {
    cleanup(root);
  }
});

test('remove deletes exactly what was installed and clears the profile', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const r = cmdRemove({ root, name: 'demo' });
    assert.equal(r.ok, true, r.error);
    assert.ok(!fs.existsSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md')));
    assert.ok(!fs.existsSync(path.join(root, '.github/skills/dude-pack-demo-helper')));

    const profile = readProfile(root);
    assert.deepEqual(profile.enabled_packs, []);
    assert.equal(profile.installed.demo, undefined);
  } finally {
    cleanup(root);
  }
});

test('add rejects a missing catalog pack', () => {
  const root = scaffold();
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'nope', force: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
  } finally {
    cleanup(root);
  }
});

test('add rejects an artifact outside the pack namespace', () => {
  const root = scaffold();
  try {
    // Add a stray agent that does not carry the dude-pack-demo- prefix.
    fs.writeFileSync(
      path.join(root, 'library/packs/demo/agents/dude-pack-other-x.agent.md'),
      '---\nname: x\n---\n# X\n'
    );
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /namespace/);
  } finally {
    cleanup(root);
  }
});

test('add rejects a hyphen-prefix pack-name collision', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    // Install "demo", then create catalog pack "demo-extra" and try to add it.
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const extra = path.join(lib, 'demo-extra');
    fs.mkdirSync(path.join(extra, 'skills', 'dude-pack-demo-extra-s'), { recursive: true });
    fs.writeFileSync(path.join(extra, 'pack.md'), '---\nname: demo-extra\n---\n# E\n');
    fs.writeFileSync(
      path.join(extra, 'skills', 'dude-pack-demo-extra-s', 'SKILL.md'),
      '---\nname: dude-pack-demo-extra-s\ndescription: "x"\n---\n# S\n'
    );
    const r = cmdAdd({ root, library: lib, name: 'demo-extra', force: false });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /collide/);
  } finally {
    cleanup(root);
  }
});

test('add refuses to overwrite an existing destination without --force', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    fs.writeFileSync(path.join(root, '.github/agents/dude-pack-demo-worker.agent.md'), 'pre-existing\n');
    const r = cmdAdd({ root, library: lib, name: 'demo', force: false });
    assert.equal(r.ok, false);
    assert.match(r.error || '', /already exists/);
  } finally {
    cleanup(root);
  }
});

test('status reflects installed packs', () => {
  const root = scaffold();
  try {
    const lib = path.join(root, 'library', 'packs');
    cmdAdd({ root, library: lib, name: 'demo', force: false });
    const r = cmdStatus({ root });
    assert.deepEqual(r.result.enabled_packs, ['demo']);
  } finally {
    cleanup(root);
  }
});

test('add fetches from an explicit --source when absent locally', () => {
  const root = bareRoot();
  const up = upstreamWith('remote');
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'remote', force: false, source: up });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.origin, `source ${up}`);
    assert.ok(fs.existsSync(path.join(root, '.github/skills/dude-pack-remote-s/SKILL.md')));
    assert.deepEqual(readProfile(root).enabled_packs, ['remote']);
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('add fetches via the bundle manifest source when absent locally', () => {
  const root = bareRoot();
  const up = upstreamWith('fromman');
  try {
    fs.writeFileSync(path.join(root, '.github/dudestuff/bundle-manifest.md'), manifestBody(up));
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'fromman', force: false });
    assert.equal(r.ok, true, r.error);
    assert.ok(fs.existsSync(path.join(root, '.github/skills/dude-pack-fromman-s/SKILL.md')));
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('list falls back to the manifest upstream source when no local catalog', () => {
  const root = bareRoot();
  const up = upstreamWith('remotelist');
  try {
    // a released core ships no local library/ at all
    fs.rmSync(path.join(root, 'library'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, '.github/dudestuff/bundle-manifest.md'), manifestBody(up));
    const r = cmdList({ root, library: path.join(root, 'library', 'packs') });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.origin, `source ${up}`);
    const found = r.result.packs.find((/** @type {any} */ p) => p.name === 'remotelist');
    assert.ok(found, 'remote pack listed via upstream fallback');
    assert.equal(found.installed, false);
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('list does not fetch under --no-fetch when no local catalog', () => {
  const root = bareRoot();
  const up = upstreamWith('nope');
  try {
    fs.rmSync(path.join(root, 'library'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, '.github/dudestuff/bundle-manifest.md'), manifestBody(up));
    const r = cmdList({ root, library: path.join(root, 'library', 'packs'), fetch: false });
    assert.equal(r.ok, true);
    assert.equal(r.result.origin, 'local');
    assert.equal(r.result.packs.length, 0);
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('add normalizes CRLF/trailing-ws in a fetched pack (not the local catalog)', () => {
  const root = bareRoot();
  const up = upstreamWith('crlfy');
  try {
    // give the upstream skill CRLF + trailing whitespace + no final newline
    const upSkill = path.join(up, 'library/packs/crlfy/skills/dude-pack-crlfy-s/SKILL.md');
    fs.writeFileSync(upSkill, '---\r\nname: dude-pack-crlfy-s\r\ndescription: "s"  \r\n---\r\n# S');
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'crlfy', force: false, source: up });
    assert.equal(r.ok, true, r.error);
    const installed = fs.readFileSync(path.join(root, '.github/skills/dude-pack-crlfy-s/SKILL.md'), 'utf8');
    assert.ok(!installed.includes('\r'), 'installed copy has no CR');
    assert.ok(!/[ \t]\n/.test(installed), 'installed copy has no trailing ws');
    assert.ok(installed.endsWith('\n'), 'installed copy has a final newline');
    // the upstream source must be left untouched
    assert.ok(fs.readFileSync(upSkill, 'utf8').includes('\r'), 'source keeps its CRLF');
  } finally {
    cleanup(root);
    cleanup(up);
  }
});

test('add --no-fetch refuses to fetch a pack absent from the local catalog', () => {
  const root = bareRoot();
  try {
    const r = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'ghost', force: false, fetch: false });
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.match(r.error || '', /not found in catalog/);
  } finally {
    cleanup(root);
  }
});

test('verify reports OK for a clean pack and FAIL for a broken one', () => {
  const root = bareRoot();
  try {
    fs.writeFileSync(path.join(root, '.github/dudestuff/bundle-manifest.md'), manifestBody('https://github.com/x/y'));
    const lib = path.join(root, 'library', 'packs');
    // clean skill-only pack
    const good = path.join(lib, 'good');
    fs.mkdirSync(path.join(good, 'skills', 'dude-pack-good-s'), { recursive: true });
    fs.writeFileSync(path.join(good, 'pack.md'), '---\nname: good\ndescription: "g"\n---\n# good\n');
    fs.writeFileSync(
      path.join(good, 'skills', 'dude-pack-good-s', 'SKILL.md'),
      '---\nname: dude-pack-good-s\ndescription: "s"\n---\n# S\n'
    );
    // broken pack: unbackticked reference to a nonexistent agent handle
    const bad = path.join(lib, 'bad');
    fs.mkdirSync(path.join(bad, 'skills', 'dude-pack-bad-s'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'pack.md'), '---\nname: bad\ndescription: "b"\n---\n# bad\n');
    fs.writeFileSync(
      path.join(bad, 'skills', 'dude-pack-bad-s', 'SKILL.md'),
      '---\nname: dude-pack-bad-s\ndescription: "s"\n---\n# S\n\nRoute to @dude-nonexistent-agent for help.\n'
    );

    const r = cmdVerify({ root, library: lib });
    assert.equal(r.result.verified.length, 2);
    const goodRes = r.result.verified.find((/** @type {any} */ v) => v.name === 'good');
    const badRes = r.result.verified.find((/** @type {any} */ v) => v.name === 'bad');
    assert.equal(goodRes.failures, 0, JSON.stringify(goodRes));
    assert.ok(badRes.failures > 0, JSON.stringify(badRes));
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
  } finally {
    cleanup(root);
  }
});

test('isMainModule matches a direct run whose path contains spaces', () => {
  // Real files in a spaced temp dir, so realpath resolution succeeds and the
  // macOS `/tmp` -> `/private/tmp` symlink is normalized on both sides.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude main mod '));
  try {
    const scriptPath = path.join(dir, 'compose.mjs');
    const otherPath = path.join(dir, 'other.mjs');
    fs.writeFileSync(scriptPath, '');
    fs.writeFileSync(otherPath, '');
    const url = pathToFileURL(scriptPath).href; // file://... with %20 for spaces
    assert.equal(isMainModule(url, scriptPath), true);
    assert.equal(isMainModule(url, otherPath), false);
    assert.equal(isMainModule(url, undefined), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
