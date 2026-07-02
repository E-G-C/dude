// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pickLatestReleaseTag, listReleaseTags, resolveReleaseRef, RELEASE_CHANNEL } from './release-channel.mjs';

/** @param {string} dir @param {...string} a */
function git(dir, ...a) {
  return spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
}
/** @param {string} dir @param {string[]} tags */
function seedRepo(dir, tags) {
  fs.writeFileSync(path.join(dir, 'f'), 'x\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.email=x@x', '-c', 'user.name=x', 'commit', '-qm', 'init');
  for (const t of tags) git(dir, 'tag', t);
}

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

test('listReleaseTags returns only v* tags from a local git repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-relchan-'));
  try {
    seedRepo(dir, ['v1.0.0', 'v1.2.0', 'notarelease']);
    const tags = listReleaseTags(dir);
    assert.ok(tags.includes('v1.0.0') && tags.includes('v1.2.0'), `got ${tags.join(',')}`);
    assert.ok(!tags.includes('notarelease'), 'lists only v* tags');
    assert.equal(pickLatestReleaseTag(tags), 'v1.2.0');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveReleaseRef keeps a concrete tag/branch ref literal', () => {
  assert.deepEqual(resolveReleaseRef('https://example.invalid/x', 'v1.2.0'), {
    ref: 'v1.2.0',
    channel: false,
    resolvedRef: 'v1.2.0',
  });
  assert.deepEqual(resolveReleaseRef('https://example.invalid/x', 'main'), {
    ref: 'main',
    channel: false,
    resolvedRef: 'main',
  });
});

test('resolveReleaseRef does not resolve the channel for a local-path source (used in place)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-relchan-local-'));
  try {
    // a local dir, even with release tags, is used in place: the ref stays
    // literal so callers never claim a false resolved tag for a working tree.
    seedRepo(dir, ['v9.9.9']);
    assert.deepEqual(resolveReleaseRef(dir, RELEASE_CHANNEL), {
      ref: RELEASE_CHANNEL,
      channel: false,
      resolvedRef: RELEASE_CHANNEL,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
