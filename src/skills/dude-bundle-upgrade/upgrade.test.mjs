// @ts-check
/**
 * F1 regression: an upgrade must REMOVE a base-owned file that exists in the
 * installed (local) bundle but is gone upstream — e.g. the core dude-lead /
 * dude-tester agents deleted when the core went generic. Without this, a
 * downstream consumer's stale core agents would linger after `@dude upgrade`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyPlan, pickLatestReleaseTag } from './upgrade.mjs';

/** @param {string} root @param {string} rel */
function w(root, rel) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x\n');
}

test('classifyPlan removes a core agent present locally but absent upstream', () => {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-local-'));
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-upstream-'));
  try {
    // installed (local) core still carries a since-removed agent
    w(local, '.github/agents/dude.agent.md');
    w(local, '.github/agents/dude-lead.agent.md');
    w(local, '.github/instructions/dude.instructions.md');
    // upstream core dropped dude-lead
    w(upstream, '.github/agents/dude.agent.md');
    w(upstream, '.github/instructions/dude.instructions.md');

    const plan = classifyPlan(upstream, local);
    const removed = plan.remove.map((r) => r.path);

    assert.deepEqual(removed, ['.github/agents/dude-lead.agent.md']);
    // unchanged core files are up-to-date, not removed
    assert.ok(!removed.includes('.github/agents/dude.agent.md'));
    assert.equal(plan.add.length, 0);
  } finally {
    fs.rmSync(local, { recursive: true, force: true });
    fs.rmSync(upstream, { recursive: true, force: true });
  }
});

test('pickLatestReleaseTag selects the highest stable semver tag (numeric, not lexical)', () => {
  assert.equal(pickLatestReleaseTag(['v1.0.0', 'v1.2.0', 'v1.10.0', 'v2.0.0']), 'v2.0.0');
  assert.equal(pickLatestReleaseTag(['v1.9.0', 'v1.10.0']), 'v1.10.0');
  assert.equal(pickLatestReleaseTag(['v0.0.1']), 'v0.0.1');
});

test('pickLatestReleaseTag ignores pre-releases and non-release tags', () => {
  assert.equal(pickLatestReleaseTag(['v1.0.0', 'v2.0.0-rc1', 'nightly', 'release-3']), 'v1.0.0');
  assert.equal(pickLatestReleaseTag(['v1.2', 'v1', '1.2.3', 'foo', '']), null);
  assert.equal(pickLatestReleaseTag([]), null);
});
