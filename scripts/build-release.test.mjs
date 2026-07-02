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

test('seedManifest forces the release channel and stamps installed_ref', () => {
  const src = '```json\n{\n  "source_ref": "main",\n  "installed_ref": "main"\n}\n```';
  const out = seedManifest(src, 'v1.2.0');
  assert.match(out, /"source_ref": "latest"/);
  assert.match(out, /"installed_ref": "v1\.2\.0"/);
});

test('seedManifest sets the channel even without a tag', () => {
  const src = '```json\n{\n  "source_ref": "main",\n  "installed_ref": "main"\n}\n```';
  const out = seedManifest(src);
  assert.match(out, /"source_ref": "latest"/);
  assert.match(out, /"installed_ref": "main"/); // left as-is when no tag is given
});

test('parseArgs flags unknown args and parses options', () => {
  assert.equal(parseArgs(['--bogus']).error, true);
  assert.equal(parseArgs(['--help']).help, true);
  const a = parseArgs(['--out', 'x', '--tag', 'v1.2.0', '--repo', 'r']);
  assert.equal(a.out, 'x');
  assert.equal(a.tag, 'v1.2.0');
  assert.equal(a.repo, 'r');
});

test('buildRelease stages a lint-clean core bundle with no test files', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-rel-'));
  try {
    const r = buildRelease({ repoRoot, outDir, ref: 'v9.9.9' });
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

    // manifest seeded with the release version + release channel
    const man = fs.readFileSync(path.join(outDir, '.github/dudestuff/bundle-manifest.md'), 'utf8');
    assert.match(man, /"installed_ref": "v9\.9\.9"/);
    assert.match(man, /"source_ref": "latest"/);

    // the staged bundle itself passes lint
    const lint = spawnSync(process.execPath, [lintScript, outDir], { encoding: 'utf8' });
    assert.equal(lint.status, 0, (lint.stdout || '') + (lint.stderr || ''));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
