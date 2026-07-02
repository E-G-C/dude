// @ts-check
/**
 * Tests for scripts/build-release.mjs — the release bundler that stages the
 * deployable core bundle (core-tier minus tests + seeds) from this repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  isReleaseFile,
  seedManifest,
  buildRelease,
  parseArgs,
  PROJECT_STUB,
} from './build-release.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const lintScript = path.join(repoRoot, 'src/skills/dude-lint/lint.mjs');

test('isReleaseFile keeps core files and drops tests / packs / local / project-owned', () => {
  assert.equal(isReleaseFile('.github/agents/dude.agent.md'), true);
  assert.equal(isReleaseFile('.github/agents/dude-lead.agent.md'), true);
  assert.equal(isReleaseFile('.github/skills/dude-lint/lint.mjs'), true);
  assert.equal(isReleaseFile('.github/skills/dude-engine/lib/ownership.mjs'), true);
  assert.equal(isReleaseFile('.github/instructions/dude.instructions.md'), true);
  // test files excluded
  assert.equal(isReleaseFile('.github/skills/dude-lint/lint.test.mjs'), false);
  assert.equal(isReleaseFile('.github/skills/dude-engine/lib/tasks.test.mjs'), false);
  // packs / local / project-owned / workflows excluded
  assert.equal(isReleaseFile('.github/agents/dude-pack-beads-workflow.agent.md'), false);
  assert.equal(isReleaseFile('.github/skills/dude-local-foo/SKILL.md'), false);
  assert.equal(isReleaseFile('.github/skills/project/SKILL.md'), false);
  assert.equal(isReleaseFile('.github/dudestuff/bundle-manifest.md'), false);
  assert.equal(isReleaseFile('.github/workflows/ci.yml'), false);
});

test('seedManifest rewrites installed_sha / installed_at only when provided', () => {
  const src = '```json\n{\n  "installed_sha": "OLD",\n  "installed_at": "OLDAT"\n}\n```';
  const out = seedManifest(src, 'b'.repeat(40), '2026-07-01T00:00:00Z');
  assert.match(out, /"installed_sha": "b{40}"/);
  assert.match(out, /"installed_at": "2026-07-01T00:00:00Z"/);
  assert.equal(seedManifest(src), src); // no-op without args
});

test('parseArgs flags unknown args and parses options', () => {
  assert.equal(parseArgs(['--bogus']).error, true);
  assert.equal(parseArgs(['--help']).help, true);
  const a = parseArgs(['--out', 'x', '--sha', 'y', '--repo', 'r']);
  assert.equal(a.out, 'x');
  assert.equal(a.sha, 'y');
  assert.equal(a.repo, 'r');
});

test('buildRelease stages a lint-clean core bundle with no test files', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-'));
  try {
    const sha = 'a'.repeat(40);
    const r = buildRelease({ repoRoot, outDir, sha, at: '2026-07-01T00:00:00Z' });
    assert.ok(r.files.length > 20, `expected many files, got ${r.files.length}`);

    // no test files anywhere in the staged bundle
    /** @type {string[]} */
    const leaked = [];
    const scan = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) scan(p);
        else if (/\.test\./.test(e.name)) leaked.push(p);
      }
    };
    scan(outDir);
    assert.deepEqual(leaked, [], `test files leaked: ${leaked.join(', ')}`);

    // key core artifacts present
    const has = (rel) => fs.existsSync(path.join(outDir, rel));
    assert.ok(has('.github/agents/dude.agent.md'));
    assert.ok(has('.github/instructions/dude.instructions.md'));
    assert.ok(has('.github/skills/dude-lint/lint.mjs'));
    assert.ok(has('.github/skills/dude-engine/lib/ownership.mjs'));

    // project skill is the generic stub, not this repo's own knowledge
    const proj = fs.readFileSync(path.join(outDir, '.github/skills/project/SKILL.md'), 'utf8');
    assert.equal(proj, PROJECT_STUB);
    assert.doesNotMatch(proj, /dude-spec-lead|reusable Dude Coder bundle/);

    // manifest seeded with the release sha
    const man = fs.readFileSync(path.join(outDir, '.github/dudestuff/bundle-manifest.md'), 'utf8');
    assert.match(man, /"installed_sha": "a{40}"/);

    // the staged bundle itself passes lint
    const lint = spawnSync(process.execPath, [lintScript, outDir], { encoding: 'utf8' });
    assert.equal(lint.status, 0, (lint.stdout || '') + (lint.stderr || ''));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
