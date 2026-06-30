// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { cmdAdd, cmdRemove, cmdList, cmdStatus, readProfile, isMainModule } from './compose.mjs';

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
