// @ts-check
/**
 * Tests for scripts/canonicalize-installed-agents.mjs — the in-place stripper
 * for the host editor's injected `model:` frontmatter on installed agents.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalizeInstalledAgents } from './canonicalize-installed-agents.mjs';

/** @returns {string} */
function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canon-'));
  fs.mkdirSync(path.join(root, '.github', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, '.dude', 'metadata'), { recursive: true });
  return root;
}
/** @param {string} root @param {string} rel @param {string} content */
function w(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
/** @param {string} root @param {string} rel @returns {string} */
function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('strips injected model: from core and pack agents in both blank orientations', () => {
  const root = tmpRoot();
  try {
    const coreClean = '---\nname: dude\ndescription: "coordinator"\n---\n# Dude\n';
    const coreInjected =
      '---\nname: dude\nmodel: Claude Sonnet 4.5\n\ndescription: "coordinator"\n---\n# Dude\n';
    const packClean = '---\nname: dude-pack-coding-architect\ndescription: "arch"\ntools: [\'read\']\n---\n# Architect\n';
    const packInjected =
      '---\nname: dude-pack-coding-architect\ndescription: "arch"\ntools: [\'read\']\nmodel: Claude Opus 4.1\n---\n# Architect\n';
    w(root, '.github/agents/dude.agent.md', coreInjected);
    w(root, '.github/agents/dude-pack-coding-architect.agent.md', packInjected);

    const { changed } = canonicalizeInstalledAgents({ root });

    assert.deepEqual(
      [...changed].sort(),
      ['.github/agents/dude-pack-coding-architect.agent.md', '.github/agents/dude.agent.md'],
    );
    assert.equal(read(root, '.github/agents/dude.agent.md'), coreClean);
    assert.equal(read(root, '.github/agents/dude-pack-coding-architect.agent.md'), packClean);

    // idempotent: a second pass over the now-clean tree writes nothing
    const again = canonicalizeInstalledAgents({ root });
    assert.deepEqual(again.changed, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('makes no writes on an already-clean tree', () => {
  const root = tmpRoot();
  try {
    const clean = '---\nname: dude-pack-coding-tester\ndescription: "tester"\n---\n# Tester\n';
    w(root, '.github/agents/dude-pack-coding-tester.agent.md', clean);

    const { changed } = canonicalizeInstalledAgents({ root });

    assert.deepEqual(changed, []);
    assert.equal(read(root, '.github/agents/dude-pack-coding-tester.agent.md'), clean);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ignores non-agent files, never touches profile.md, and preserves genuine drift', () => {
  const root = tmpRoot();
  try {
    const profile = '# Install Profile\n\n```json\n{\n  "enabled_packs": [],\n  "installed": {}\n}\n```\n';
    w(root, '.dude/metadata/profile.md', profile);
    // a non-.agent.md file inside .github/agents with a model:-looking line
    const readme = '# Notes\nmodel: Claude Sonnet 4.5\n';
    w(root, '.github/agents/README.md', readme);
    // a genuinely hand-edited agent (model-less) must survive untouched
    const drifted = '---\nname: dude-pack-coding-architect\ndescription: "hand-edited"\n---\n# Architect\n';
    w(root, '.github/agents/dude-pack-coding-architect.agent.md', drifted);
    // one injected agent so the run still performs a real strip
    const injected = '---\nname: dude\nmodel: Claude Sonnet 4.5\n---\n# Dude\n';
    const injectedClean = '---\nname: dude\n---\n# Dude\n';
    w(root, '.github/agents/dude.agent.md', injected);

    const { changed } = canonicalizeInstalledAgents({ root });

    assert.deepEqual(changed, ['.github/agents/dude.agent.md']);
    assert.equal(read(root, '.github/agents/dude.agent.md'), injectedClean);
    assert.equal(read(root, '.github/agents/README.md'), readme, 'non-agent file untouched');
    assert.equal(
      read(root, '.github/agents/dude-pack-coding-architect.agent.md'),
      drifted,
      'genuine drift preserved',
    );
    assert.equal(read(root, '.dude/metadata/profile.md'), profile, 'profile.md never touched');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// T033 / FR-028 (plan §15 ¶2): symbolic-link containment + all-or-nothing.
//
// The canonicalizer MUST reject a symbolic-link workspace root, `.github`,
// `.github/agents` category, or `*.agent.md` target; inventory only contained
// direct regular targets; compute the complete write set; revalidate every
// target before the FIRST replacement; and leave EVERY target unchanged on any
// preflight failure. Current code has no symlink checks: it follows symlinked
// directories (rewriting external files through them) and silently skips
// symlinked targets (`entry.isFile()` is false), so every case below is RED
// until the fix reuses `resolveMutationPath` from workspace-paths.mjs
// (messages: "workspace root must not be a symbolic link" /
// "unsafe mutation target '<rel>' contains symbolic link '<component>'" /
// "... escapes the workspace ..."). Locally-controlled-workspace threat model:
// these assert refusal + preservation only — no race, inode, or hard-link
// claims.
// ---------------------------------------------------------------------------

const REFUSAL_RE = /symbolic link|symlink|escapes the workspace/i;
/** @param {string} root @returns {{ threw: boolean, message: string }} */
function runCanon(root) {
  try {
    canonicalizeInstalledAgents({ root });
    return { threw: false, message: '' };
  } catch (e) {
    return { threw: true, message: e instanceof Error ? e.message : String(e) };
  }
}

test('refuses a symbolic-link workspace root and writes nothing through it (FR-028/T033)', () => {
  const injected = '---\nname: dude\nmodel: Claude Sonnet 4.5\n---\n# Dude\n';
  const host = tmpRoot();
  const linkParent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canon-linkroot-'));
  try {
    // real workspace content lives in `host`; the caller passes a symlink to it
    w(host, '.github/agents/dude.agent.md', injected);
    const link = path.join(linkParent, 'workspace');
    fs.symlinkSync(host, link);

    const { threw, message } = runCanon(link);

    // RED on current code: it follows the symlinked root and rewrites the
    // external agent through it (sentinel becomes clean). The fix must refuse
    // before touching anything.
    assert.equal(
      read(host, '.github/agents/dude.agent.md'),
      injected,
      'external agent must be byte-identical (no write through a symlinked root)',
    );
    assert.ok(threw, 'canonicalizer must throw on a symbolic-link workspace root');
    assert.match(message, REFUSAL_RE);
  } finally {
    fs.rmSync(host, { recursive: true, force: true });
    fs.rmSync(linkParent, { recursive: true, force: true });
  }
});

test('refuses a symbolic-link .github and leaves the external agent unchanged (FR-028/T033)', () => {
  const injected = '---\nname: dude\nmodel: Claude Sonnet 4.5\n---\n# Dude\n';
  const host = tmpRoot();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canon-root-'));
  try {
    w(host, '.github/agents/dude.agent.md', injected);
    // `root/.github` is a symlink to the real `.github` under `host`
    fs.symlinkSync(path.join(host, '.github'), path.join(root, '.github'));

    const { threw, message } = runCanon(root);

    // RED on current code: it follows `.github` and rewrites through it.
    assert.equal(
      read(host, '.github/agents/dude.agent.md'),
      injected,
      'external agent must be byte-identical (no write through a symlinked .github)',
    );
    assert.ok(threw, 'canonicalizer must throw on a symbolic-link .github');
    assert.match(message, REFUSAL_RE);
  } finally {
    fs.rmSync(host, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a symbolic-link .github/agents category and writes nothing through it (FR-028/T033)', () => {
  const injected = '---\nname: dude\nmodel: Claude Sonnet 4.5\n---\n# Dude\n';
  const host = tmpRoot();
  const root = tmpRoot();
  try {
    w(host, '.github/agents/dude.agent.md', injected);
    // replace the real `root/.github/agents` dir with a symlink to host's
    fs.rmSync(path.join(root, '.github', 'agents'), { recursive: true, force: true });
    fs.symlinkSync(
      path.join(host, '.github', 'agents'),
      path.join(root, '.github', 'agents'),
    );

    const { threw, message } = runCanon(root);

    // RED on current code: it follows the symlinked category and rewrites through it.
    assert.equal(
      read(host, '.github/agents/dude.agent.md'),
      injected,
      'external agent must be byte-identical (no write through a symlinked agents category)',
    );
    assert.ok(threw, 'canonicalizer must throw on a symbolic-link .github/agents category');
    assert.match(message, REFUSAL_RE);
  } finally {
    fs.rmSync(host, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a symbolic-link *.agent.md target instead of following it (FR-028/T033)', () => {
  const injected = '---\nname: dude\nmodel: Claude Sonnet 4.5\n---\n# Dude\n';
  const root = tmpRoot();
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canon-ext-'));
  const sentinel = path.join(ext, 'external.agent.md');
  try {
    fs.writeFileSync(sentinel, injected);
    // the target entry is a symlink to an EXTERNAL agent file carrying model:
    fs.symlinkSync(sentinel, path.join(root, '.github', 'agents', 'dude.agent.md'));

    const { threw, message } = runCanon(root);

    // RED on current code: it silently skips the symlink target (isFile()===false)
    // — no throw. The fix must reject the symlink-backed target.
    assert.ok(threw, 'canonicalizer must refuse a symbolic-link target, not skip it silently');
    assert.match(message, REFUSAL_RE);
    // and it must never rewrite the external sentinel through the link
    assert.equal(
      fs.readFileSync(sentinel, 'utf8'),
      injected,
      'external target must be byte-identical (never rewritten through the link)',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(ext, { recursive: true, force: true });
  }
});

test('all-or-nothing: refuses the run and leaves an earlier regular target unrewritten (FR-028/T033)', () => {
  const injectedA = '---\nname: dude\nmodel: Claude Sonnet 4.5\n---\n# Dude\n';
  const injectedB = '---\nname: dude-pack-coding-tester\nmodel: Claude Sonnet 4.5\n---\n# Tester\n';
  const root = tmpRoot();
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canon-ext-'));
  const sentinelB = path.join(ext, 'external-b.agent.md');
  try {
    // A sorts first and is a REGULAR injected agent that alone would be
    // canonicalized; B sorts later and is a symlink to an EXTERNAL agent.
    fs.writeFileSync(sentinelB, injectedB);
    w(root, '.github/agents/aaa-regular.agent.md', injectedA);
    fs.symlinkSync(sentinelB, path.join(root, '.github', 'agents', 'zzz-symlink.agent.md'));

    const { threw, message } = runCanon(root);

    // RED on current code: it writes A inside the loop (partial write) before
    // ever seeing B. The fix must validate the COMPLETE write set first and
    // leave A byte-identical when B fails preflight.
    assert.equal(
      read(root, '.github/agents/aaa-regular.agent.md'),
      injectedA,
      'earlier regular target must be byte-identical (all-or-nothing; no write before the set is validated)',
    );
    assert.equal(
      fs.readFileSync(sentinelB, 'utf8'),
      injectedB,
      'external symlink-target sentinel must be untouched',
    );
    assert.ok(threw, 'the whole run must refuse when any target is a symbolic link');
    assert.match(message, REFUSAL_RE);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(ext, { recursive: true, force: true });
  }
});
