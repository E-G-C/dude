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
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalPlanProjection,
  classifyPlan,
  findUpstreamManifestPath,
  persistUniquePlan,
  planDigest,
  pickLatestReleaseTag,
} from './upgrade.mjs';

const SCRIPT = fileURLToPath(new URL('./upgrade.mjs', import.meta.url));
const REPLACE_PATH = '.github/agents/dude.agent.md';
const ADD_PATH = '.github/skills/dude-new/SKILL.md';
const REMOVE_PATH = '.github/skills/dude-old/SKILL.md';
const UP_TO_DATE_PATH = '.github/instructions/dude.instructions.md';
const MANIFEST_PATH = '.dude/metadata/bundle-manifest.md';
const UPGRADE_LOG_PATH = '.dude/metadata/upgrade-log.md';

/** @param {string} root @param {string} rel */
function w(root, rel) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x\n');
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

/** @param {string} root @param {string} rel @param {string} content */
function write(root, rel, content) {
  const absolute = path.join(root, rel);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

/** @param {string} sourceRepo @param {string} installedRef @param {string} [sourceRef] */
function manifest(sourceRepo, installedRef, sourceRef = 'main') {
  return `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({
    source_repo: sourceRepo,
    source_ref: sourceRef,
    installed_ref: installedRef,
  }, null, 2)}\n\`\`\`\n`;
}

/** @param {{ source_repo: string, source_ref: string, installed_ref: string }} data */
function manifestFromData(data) {
  return `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
}

/**
 * @param {{
 *   noOp?: boolean,
 *   sourceRef?: string,
 *   installedRef?: string,
 *   releaseTags?: string[],
 * }} [options]
 */
function makeUpgradeFixture(options = {}) {
  const {
    noOp = false,
    sourceRef = 'main',
    installedRef = noOp ? sourceRef : 'v0.0.0',
    releaseTags = [],
  } = options;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-plan-v1-'));
  const localRoot = path.join(base, 'local');
  const upstreamRoot = path.join(base, 'upstream');
  const tmpRoot = path.join(base, 'tmp');
  const planPath = path.join(base, 'plan.json');
  fs.mkdirSync(localRoot, { recursive: true });
  fs.mkdirSync(upstreamRoot, { recursive: true });
  fs.mkdirSync(tmpRoot, { recursive: true });

  const source = pathToFileURL(upstreamRoot).href;
  write(localRoot, '.dude/metadata/bundle-manifest.md', manifest(source, installedRef, sourceRef));
  write(localRoot, '.dude/metadata/upgrade-log.md', '# Upgrade Log\n');
  write(localRoot, '.github/agents/dude.agent.md', noOp ? 'upstream replace\n' : 'local replace\n');
  if (!noOp) write(localRoot, '.github/skills/dude-old/SKILL.md', 'local remove\n');
  if (noOp) write(localRoot, '.github/skills/dude-new/SKILL.md', 'upstream add\n');
  write(localRoot, '.github/skills/dude-lint/lint.mjs', 'process.exit(0);\n');
  write(localRoot, '.github/instructions/dude.instructions.md', 'unchanged\n');
  write(localRoot, '.github/agents/custom.agent.md', 'advisory\n');
  write(localRoot, 'project-sentinel.txt', 'preserve\n');

  write(upstreamRoot, '.dude/metadata/bundle-manifest.md', manifest(source, sourceRef, sourceRef));
  write(upstreamRoot, '.github/agents/dude.agent.md', 'upstream replace\n');
  write(upstreamRoot, '.github/skills/dude-new/SKILL.md', 'upstream add\n');
  write(upstreamRoot, '.github/skills/dude-lint/lint.mjs', 'process.exit(0);\n');
  write(upstreamRoot, '.github/instructions/dude.instructions.md', 'unchanged\n');

  for (const root of [localRoot, upstreamRoot]) {
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['config', 'user.name', 'Upgrade Test']);
    git(root, ['config', 'user.email', 'upgrade-test@example.invalid']);
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'fixture']);
  }
  for (const tag of releaseTags) git(upstreamRoot, ['tag', tag]);

  const planResult = spawnSync(process.execPath, [
    SCRIPT,
    'plan',
    '--source',
    source,
    '--ref',
    sourceRef,
    '--out',
    planPath,
    '--format',
    'json',
  ], {
    cwd: localRoot,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: tmpRoot },
  });
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const metadataChange = plan.local.manifest.data.source_repo !== plan.source.location
    || plan.local.manifest.data.source_ref !== plan.source.requested_ref
    || plan.local.manifest.data.installed_ref !== plan.to_ref;
  assert.equal(
    planResult.status,
    plan.summary.add + plan.summary.replace + plan.summary.remove === 0 && !metadataChange ? 0 : 10,
    `${planResult.stdout}${planResult.stderr}`,
  );

  return {
    base,
    localRoot,
    upstreamRoot,
    tmpRoot,
    planPath,
    cacheRoot: plan.cache.root_path,
    source,
    plan,
  };
}

/** @param {string} root */
function snapshotTree(root) {
  /** @type {Record<string, { type: string, value?: string }>} */
  const entries = {};
  /** @param {string} relative */
  function visit(relative) {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!relative && entry.name === '.git') continue;
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      const childAbsolute = path.join(root, child);
      const stat = fs.lstatSync(childAbsolute);
      if (stat.isSymbolicLink()) {
        entries[child] = { type: 'symlink', value: fs.readlinkSync(childAbsolute) };
      } else if (stat.isDirectory()) {
        entries[child] = { type: 'directory' };
        visit(child);
      } else if (stat.isFile()) {
        entries[child] = { type: 'file', value: fs.readFileSync(childAbsolute).toString('base64') };
      } else {
        entries[child] = { type: 'other' };
      }
    }
  }
  visit('');
  return entries;
}

/** @param {string} target */
function snapshotPath(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { type: 'missing' };
    }
    throw error;
  }
  if (stat.isSymbolicLink()) return { type: 'symlink', value: fs.readlinkSync(target) };
  if (stat.isDirectory()) return { type: 'directory', entries: snapshotTree(target) };
  if (stat.isFile()) return { type: 'file', value: fs.readFileSync(target).toString('base64') };
  return { type: 'other' };
}

/** @param {string} root */
function snapshotMutationBoundary(root) {
  return {
    head: git(root, ['rev-parse', 'HEAD']),
    symbolicHead: git(root, ['symbolic-ref', 'HEAD']),
    refs: git(root, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags']),
    index: git(root, ['ls-files', '--stage']),
    status: git(root, ['status', '--porcelain=v1', '--untracked-files=all']),
    tree: snapshotTree(root),
  };
}

/** @param {string} root */
function snapshotGitRepository(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  const run = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const head = run(['rev-parse', 'HEAD']);
  const symbolicHead = run(['symbolic-ref', '-q', 'HEAD']);
  const refs = run(['for-each-ref', '--format=%(refname) %(objectname)']);
  const status = run(['status', '--porcelain=v1', '--untracked-files=all']);
  const origin = run(['config', '--get', 'remote.origin.url']);
  return {
    head: `${head.status}:${head.stdout}${head.stderr}`,
    symbolicHead: `${symbolicHead.status}:${symbolicHead.stdout}${symbolicHead.stderr}`,
    refs: `${refs.status}:${refs.stdout}${refs.stderr}`,
    status: `${status.status}:${status.stdout}${status.stderr}`,
    origin: `${origin.status}:${origin.stdout}${origin.stderr}`,
  };
}

/** @param {ReturnType<typeof makeUpgradeFixture>} fixture */
function snapshotFixtureBoundary(fixture) {
  return {
    local: snapshotMutationBoundary(fixture.localRoot),
    plan: snapshotPath(fixture.planPath),
    cache: snapshotPath(fixture.cacheRoot),
    cacheGit: snapshotGitRepository(fixture.cacheRoot),
    source: snapshotPath(fixture.upstreamRoot),
    sourceGit: snapshotGitRepository(fixture.upstreamRoot),
  };
}

/**
 * @param {ReturnType<typeof makeUpgradeFixture>} fixture
 * @param {(plan: Record<string, any>) => void} mutate
 * @param {{ rehash?: boolean }} [options]
 */
function rewritePlan(fixture, mutate, options = {}) {
  const plan = JSON.parse(fs.readFileSync(fixture.planPath, 'utf8'));
  mutate(plan);
  if (options.rehash) plan.digest = planDigest(plan);
  fs.writeFileSync(fixture.planPath, `${JSON.stringify(plan, null, 2)}\n`);
  fixture.plan = plan;
  return plan;
}

/**
 * @param {ReturnType<typeof makeUpgradeFixture>} fixture
 * @param {string[]} [args]
 * @param {string | null} [confirm]
 * @param {Record<string, string>} [extraEnv]
 */
function applyFixture(fixture, args = [], confirm = 'confirm-upgrade', extraEnv = {}) {
  const command = [
    SCRIPT,
    'apply',
    '--plan',
    fixture.planPath,
    '--format',
    'json',
    ...args,
  ];
  if (confirm !== null) command.push('--confirm', confirm);
  return spawnSync(process.execPath, command, {
    cwd: fixture.localRoot,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: fixture.tmpRoot, ...extraEnv },
  });
}

/** @param {ReturnType<typeof makeUpgradeFixture>} fixture @param {string} message */
function commitLocalDrift(fixture, message) {
  git(fixture.localRoot, ['add', '-A']);
  git(fixture.localRoot, ['commit', '-q', '-m', message]);
}

/**
 * @param {ReturnType<typeof makeUpgradeFixture>} fixture
 * @param {ReturnType<typeof snapshotFixtureBoundary>} before
 * @param {ReturnType<typeof spawnSync>} result
 * @param {RegExp} errorPattern
 */
function assertRejectedWithoutMutation(fixture, before, result, errorPattern) {
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.equal(result.status, 40, output);
  assert.match(output, errorPattern);
  assert.deepEqual(snapshotFixtureBoundary(fixture), before, 'apply crossed the preflight mutation boundary');
}

/**
 * @param {string} name
 * @param {(fixture: ReturnType<typeof makeUpgradeFixture>, context: import('node:test').TestContext) => void | boolean} mutate
 * @param {RegExp} errorPattern
 * @param {{ args?: string[], confirm?: string | null, fixture?: { noOp?: boolean } }} [options]
 */
function rejectedApplyCase(name, mutate, errorPattern, options = {}) {
  test(name, (context) => {
    const fixture = makeUpgradeFixture(options.fixture);
    try {
      if (mutate(fixture, context) === false) return;
      const before = snapshotFixtureBoundary(fixture);
      const result = applyFixture(
        fixture,
        options.args || [],
        options.confirm === undefined ? 'confirm-upgrade' : options.confirm,
      );
      assertRejectedWithoutMutation(fixture, before, result, errorPattern);
    } finally {
      fs.rmSync(fixture.base, { recursive: true, force: true });
    }
  });
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

test('findUpstreamManifestPath accepts canonical-only upstream and rejects trees without it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-manifest-'));
  try {
    w(root, '.github/agents/dude.agent.md');
    assert.equal(findUpstreamManifestPath(root), null);

    w(root, '.dude/metadata/bundle-manifest.md');
    assert.equal(
      findUpstreamManifestPath(root),
      path.join(root, '.dude/metadata/bundle-manifest.md'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persistUniquePlan retries an exclusive collision without overwriting reviewed bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-plan-collision-'));
  try {
    const occupiedPath = path.join(root, 'base-collision.json');
    fs.writeFileSync(occupiedPath, 'reviewed sentinel\n');
    const suffixes = ['collision', 'unique'];

    const persisted = persistUniquePlan({
      plansDir: root,
      baseId: 'base',
      suffixFactory: () => suffixes.shift() || 'unexpected',
      maxAttempts: 2,
      buildBytes: (planId) => Buffer.from(`${planId}\n`),
    });

    assert.equal(persisted.planId, 'base-unique');
    assert.equal(fs.readFileSync(occupiedPath, 'utf8'), 'reviewed sentinel\n');
    assert.equal(fs.readFileSync(persisted.planPath, 'utf8'), 'base-unique\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persistUniquePlan fails after bounded exclusive collisions without overwriting bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-plan-collision-'));
  try {
    const occupiedPath = path.join(root, 'base-collision.json');
    fs.writeFileSync(occupiedPath, 'reviewed sentinel\n');

    assert.throws(
      () => persistUniquePlan({
        plansDir: root,
        baseId: 'base',
        suffixFactory: () => 'collision',
        maxAttempts: 2,
        buildBytes: (planId) => Buffer.from(`${planId}\n`),
      }),
      /could not allocate a unique upgrade plan/i,
    );
    assert.equal(fs.readFileSync(occupiedPath, 'utf8'), 'reviewed sentinel\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade plan refuses to overwrite an existing --out file', () => {
  const fixture = makeUpgradeFixture();
  try {
    const sentinel = 'reviewed output sentinel\n';
    fs.writeFileSync(fixture.planPath, sentinel);

    const result = spawnSync(process.execPath, [
      SCRIPT,
      'plan',
      '--source',
      fixture.source,
      '--ref',
      'main',
      '--out',
      fixture.planPath,
      '--format',
      'json',
    ], {
      cwd: fixture.localRoot,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: fixture.tmpRoot },
    });

    assert.equal(result.status, 40, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /--out.*already exists|refusing to overwrite/i);
    assert.equal(fs.readFileSync(fixture.planPath, 'utf8'), sentinel);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade plan emits a strict versioned authorization envelope', () => {
  const fixture = makeUpgradeFixture();
  try {
    assert.equal(fixture.plan.kind, 'dude-upgrade-plan');
    assert.equal(fixture.plan.schema_version, 1);
    assert.match(fixture.plan.plan_id, /-[a-f0-9]{24}$/);
    assert.match(fixture.plan.digest, /^[a-f0-9]{64}$/);
    assert.equal(fixture.plan.source.resolved_commit, git(fixture.upstreamRoot, ['rev-parse', 'HEAD']));
    assert.ok(Array.isArray(fixture.plan.cache.inventory));
    assert.ok(Array.isArray(fixture.plan.local.core_inventory));
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade apply rejects reviewed Replace cache byte drift without mutation', () => {
  const fixture = makeUpgradeFixture();
  try {
    const cacheRoot = fixture.plan.cache.root_path;
    write(cacheRoot, '.github/agents/dude.agent.md', 'unreviewed replacement\n');
    const before = snapshotFixtureBoundary(fixture);
    const result = applyFixture(fixture);

    assertRejectedWithoutMutation(fixture, before, result, /reviewed cache bytes changed.*dude\.agent\.md/i);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade apply executes the exact persisted Add Replace and Remove buckets', () => {
  const fixture = makeUpgradeFixture();
  try {
    const planBytes = fs.readFileSync(fixture.planPath);
    const cacheBefore = snapshotPath(fixture.cacheRoot);
    const sourceBefore = snapshotPath(fixture.upstreamRoot);
    const result = applyFixture(fixture);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.equal(fs.readFileSync(path.join(fixture.localRoot, '.github/agents/dude.agent.md'), 'utf8'), 'upstream replace\n');
    assert.equal(fs.readFileSync(path.join(fixture.localRoot, '.github/skills/dude-new/SKILL.md'), 'utf8'), 'upstream add\n');
    assert.equal(fs.existsSync(path.join(fixture.localRoot, '.github/skills/dude-old/SKILL.md')), false);
    assert.equal(fs.readFileSync(path.join(fixture.localRoot, '.github/agents/custom.agent.md'), 'utf8'), 'advisory\n');
    assert.equal(fs.readFileSync(path.join(fixture.localRoot, 'project-sentinel.txt'), 'utf8'), 'preserve\n');
    assert.equal(fs.readFileSync(fixture.planPath).equals(planBytes), true);
    assert.deepEqual(snapshotPath(fixture.cacheRoot), cacheBefore);
    assert.deepEqual(snapshotPath(fixture.upstreamRoot), sourceBefore);

    const parsed = JSON.parse(result.stdout);
    assert.deepEqual(parsed.counts, {
      replaced: 1,
      added: 1,
      removed: 1,
      removals_deferred: 0,
    });
    assert.match(parsed.safety_tag, /^dude-pre-upgrade-/);
    assert.match(parsed.upgrade_branch, /^chore\/dude-upgrade-main/);
    const log = fs.readFileSync(path.join(fixture.localRoot, '.dude/metadata/upgrade-log.md'), 'utf8');
    assert.match(log, new RegExp(`plan_id=${fixture.plan.plan_id}`));
    assert.match(log, /- replaced: 1\n- added:    1\n- removed:  1\n/);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

// classifyPlan emits a debug-gated marker on every invocation. apply must never
// re-derive a plan via classifyPlan(cacheDir): it consumes the persisted buckets
// directly. A pure black-box test cannot discriminate this — preflight evidence
// validation trips before any reclassification could run, and on a valid plan a
// reclassification would yield identical buckets — so this regression observes
// the marker across the process boundary. If a future change reintroduces
// classifyPlan in apply, the marker appears in apply's stderr and this fails.
const CLASSIFY_MARKER = 'classifyPlan: classifying upstream core tree';

test('upgrade apply executes persisted buckets and never re-runs classifyPlan(cacheDir)', () => {
  const fixture = makeUpgradeFixture();
  try {
    // Positive control: plan invokes classifyPlan, so the seam marker fires when
    // classification actually runs (guards against a stale/typo marker string).
    const planResult = spawnSync(process.execPath, [
      SCRIPT,
      'plan',
      '--source',
      fixture.source,
      '--ref',
      'main',
      '--format',
      'json',
    ], {
      cwd: fixture.localRoot,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: fixture.tmpRoot, UPGRADE_DEBUG: '1' },
    });
    assert.equal(planResult.status, 10, `${planResult.stdout}${planResult.stderr}`);
    assert.ok(
      planResult.stderr.includes(CLASSIFY_MARKER),
      'expected plan to invoke classifyPlan (positive control for the seam marker)',
    );

    // apply the reviewed plan with tracing on: it must execute the persisted
    // buckets without ever classifying the cache tree.
    const applyResult = applyFixture(fixture, [], 'confirm-upgrade', { UPGRADE_DEBUG: '1' });
    assert.equal(applyResult.status, 0, `${applyResult.stdout}${applyResult.stderr}`);
    assert.equal(
      applyResult.stderr.includes(CLASSIFY_MARKER),
      false,
      'apply must consume persisted buckets directly, not re-run classifyPlan(cacheDir)',
    );
    assert.deepEqual(JSON.parse(applyResult.stdout).counts, {
      replaced: 1,
      added: 1,
      removed: 1,
      removals_deferred: 0,
    });
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade apply disables hooks for its checkout and commit operations', () => {
  const fixture = makeUpgradeFixture();
  try {
    const checkoutSentinel = path.join(fixture.base, 'post-checkout-hook-ran');
    const commitSentinel = path.join(fixture.base, 'pre-commit-hook-ran');
    for (const [name, sentinel] of [
      ['post-checkout', checkoutSentinel],
      ['pre-commit', commitSentinel],
    ]) {
      const hookPath = path.join(fixture.localRoot, `.git/hooks/${name}`);
      fs.writeFileSync(
        hookPath,
        `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'hook ran\\n');\n`,
      );
      fs.chmodSync(hookPath, 0o755);
    }

    const result = applyFixture(fixture);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(fs.existsSync(checkoutSentinel), false);
    assert.equal(fs.existsSync(commitSentinel), false);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

for (const [label, relativePath] of [
  ['Replace', REPLACE_PATH],
  ['Add', ADD_PATH],
  ['up-to-date', UP_TO_DATE_PATH],
]) {
  rejectedApplyCase(
    `upgrade apply rejects reviewed ${label} cache byte drift without mutation`,
    (fixture) => write(fixture.cacheRoot, relativePath, `drifted ${label}\n`),
    new RegExp(`reviewed cache bytes changed: ${relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
}

rejectedApplyCase(
  'upgrade apply rejects reviewed upstream manifest byte drift without mutation',
  (fixture) => fs.appendFileSync(path.join(fixture.cacheRoot, MANIFEST_PATH), '\n'),
  /reviewed upstream manifest changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects an added cache core path without mutation',
  (fixture) => write(fixture.cacheRoot, '.github/skills/dude-unreviewed/SKILL.md', 'unreviewed\n'),
  /reviewed cache inventory changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects a removed cache core path without mutation',
  (fixture) => fs.rmSync(path.join(fixture.cacheRoot, ADD_PATH)),
  /reviewed cache inventory changed: missing.*dude-new/i,
);

rejectedApplyCase(
  'upgrade apply rejects a renamed cache core path without mutation',
  (fixture) => fs.renameSync(
    path.join(fixture.cacheRoot, ADD_PATH),
    path.join(fixture.cacheRoot, '.github/skills/dude-new/RENAMED.md'),
  ),
  /reviewed cache inventory changed: missing.*dude-new/i,
);

rejectedApplyCase(
  'upgrade apply rejects a cache file replaced by a directory without mutation',
  (fixture) => {
    fs.rmSync(path.join(fixture.cacheRoot, ADD_PATH));
    fs.mkdirSync(path.join(fixture.cacheRoot, ADD_PATH));
  },
  /reviewed cache type changed.*dude-new/i,
);

rejectedApplyCase(
  'upgrade apply rejects a cache file replaced by a symlink without mutation',
  (fixture, context) => {
    const target = path.join(fixture.cacheRoot, ADD_PATH);
    fs.rmSync(target);
    try {
      fs.symlinkSync(path.join(fixture.cacheRoot, REPLACE_PATH), target);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['EPERM', 'EACCES'].includes(error.code)) {
        context.skip(`symbolic links unavailable: ${error.code}`);
        return false;
      }
      throw error;
    }
    return true;
  },
  /reviewed cache contains symbolic link.*dude-new/i,
);

rejectedApplyCase(
  'upgrade apply rejects a missing reviewed cache root without mutation',
  (fixture) => fs.renameSync(fixture.cacheRoot, `${fixture.cacheRoot}-moved`),
  /reviewed cache root is missing/i,
);

rejectedApplyCase(
  'upgrade apply rejects reviewed source identity drift without mutation',
  (fixture) => git(fixture.cacheRoot, ['config', 'remote.origin.url', 'file:///different/source']),
  /reviewed source identity changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects reviewed concrete commit drift without mutation',
  (fixture) => {
    git(fixture.cacheRoot, ['config', 'user.name', 'Upgrade Test']);
    git(fixture.cacheRoot, ['config', 'user.email', 'upgrade-test@example.invalid']);
    git(fixture.cacheRoot, ['commit', '--allow-empty', '-q', '-m', 'unreviewed commit']);
  },
  /reviewed resolved commit changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects reviewed resolved ref drift without mutation',
  (fixture) => {
    const reviewedCommit = fixture.plan.source.resolved_commit;
    git(fixture.cacheRoot, ['config', 'user.name', 'Upgrade Test']);
    git(fixture.cacheRoot, ['config', 'user.email', 'upgrade-test@example.invalid']);
    git(fixture.cacheRoot, ['commit', '--allow-empty', '-q', '-m', 'different ref target']);
    const differentCommit = git(fixture.cacheRoot, ['rev-parse', 'HEAD']);
    git(fixture.cacheRoot, ['checkout', '--detach', '-q', reviewedCommit]);
    git(fixture.cacheRoot, ['branch', '-f', 'main', differentCommit]);
  },
  /reviewed resolved ref changed/i,
);

for (const [bucket, relativePath] of [
  ['replace', REPLACE_PATH],
  ['remove', REMOVE_PATH],
]) {
  rejectedApplyCase(
    `upgrade apply rejects cleanly committed ${bucket} target byte drift`,
    (fixture) => {
      write(fixture.localRoot, relativePath, `${bucket} drift\n`);
      commitLocalDrift(fixture, `${bucket} drift`);
    },
    new RegExp(`reviewed local state changed: ${bucket}.*${path.basename(relativePath).replace('.', '\\.')}`, 'i'),
  );
  rejectedApplyCase(
    `upgrade apply rejects a cleanly committed missing ${bucket} target`,
    (fixture) => {
      fs.rmSync(path.join(fixture.localRoot, relativePath));
      commitLocalDrift(fixture, `remove ${bucket} target`);
    },
    new RegExp(`reviewed local state changed: ${bucket}.*${path.basename(relativePath).replace('.', '\\.')}`, 'i'),
  );
}

for (const type of ['file', 'directory', 'symlink']) {
  rejectedApplyCase(
    `upgrade apply rejects a cleanly committed occupied Add target ${type}`,
    (fixture, context) => {
      const target = path.join(fixture.localRoot, ADD_PATH);
      if (type === 'file') write(fixture.localRoot, ADD_PATH, 'occupied\n');
      else if (type === 'directory') write(fixture.localRoot, `${ADD_PATH}/sentinel`, 'occupied\n');
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        try {
          fs.symlinkSync(path.join(fixture.localRoot, 'project-sentinel.txt'), target);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && ['EPERM', 'EACCES'].includes(error.code)) {
            context.skip(`symbolic links unavailable: ${error.code}`);
            return false;
          }
          throw error;
        }
      }
      commitLocalDrift(fixture, `occupy Add target with ${type}`);
      return true;
    },
    /reviewed local state changed: add.*dude-new/i,
  );
}

rejectedApplyCase(
  'upgrade apply rejects bundle manifest byte drift with unchanged values',
  (fixture) => {
    fs.appendFileSync(path.join(fixture.localRoot, MANIFEST_PATH), '\n');
    commitLocalDrift(fixture, 'manifest byte drift');
  },
  /reviewed bundle manifest bytes changed/i,
);

for (const [key, value] of [
  ['source_repo', 'file:///different/source'],
  ['source_ref', 'different-ref'],
  ['installed_ref', 'different-installed-ref'],
]) {
  rejectedApplyCase(
    `upgrade apply rejects bundle manifest ${key} value drift`,
    (fixture) => {
      write(fixture.localRoot, MANIFEST_PATH, manifestFromData({
        ...fixture.plan.local.manifest.data,
        [key]: value,
      }));
      commitLocalDrift(fixture, `manifest ${key} drift`);
    },
    /reviewed bundle manifest values changed/i,
  );
}

rejectedApplyCase(
  'upgrade apply rejects cleanly committed upgrade-log drift',
  (fixture) => {
    fs.appendFileSync(path.join(fixture.localRoot, UPGRADE_LOG_PATH), 'drift\n');
    commitLocalDrift(fixture, 'upgrade log drift');
  },
  /reviewed upgrade log state changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects any dirty working tree',
  (fixture) => fs.appendFileSync(path.join(fixture.localRoot, 'project-sentinel.txt'), 'dirty\n'),
  /working tree is dirty; commit or stash changes before applying/i,
);

test('upgrade apply rejects the removed dirty-tree override as an unknown flag', () => {
  const fixture = makeUpgradeFixture();
  try {
    const removedFlag = `--${['allow', 'dirty'].join('-')}`;
    const result = applyFixture(fixture, [removedFlag]);
    assert.equal(result.status, 40, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, new RegExp(`unknown flag: ${removedFlag}`));
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade apply skip-removals validates and defers only the persisted Remove bucket', () => {
  const fixture = makeUpgradeFixture();
  try {
    const result = applyFixture(fixture, ['--skip-removals']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(fixture.localRoot, REMOVE_PATH), 'utf8'), 'local remove\n');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.counts.removed, 0);
    assert.equal(parsed.counts.removals_deferred, 1);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

for (const [label, mutate] of [
  ['source identity', (plan) => { plan.source.identity = 'file:///tampered/source'; }],
  ['requested ref', (plan) => { plan.source.requested_ref = 'tampered-ref'; }],
  ['resolved ref', (plan) => { plan.source.resolved_ref = 'tampered-ref'; }],
  ['resolved commit', (plan) => { plan.source.resolved_commit = '0'.repeat(40); }],
  ['from ref', (plan) => { plan.from_ref = 'tampered-from'; }],
  ['to ref', (plan) => { plan.to_ref = 'tampered-to'; }],
  ['cache root path', (plan) => { plan.cache.root_path = path.dirname(plan.cache.root_path); }],
  ['Add bucket path', (plan) => { plan.buckets.add[0].path = '.github/skills/dude-tampered/SKILL.md'; }],
  ['bucket membership', (plan) => { plan.buckets.add.pop(); }],
  ['summary count', (plan) => { plan.summary.replace += 1; }],
]) {
  rejectedApplyCase(
    `upgrade apply rejects ${label} tampering without a matching digest`,
    (fixture) => rewritePlan(fixture, mutate),
    /plan digest mismatch/i,
  );
}

rejectedApplyCase(
  'upgrade apply rejects a rehashed literal requested ref that differs from resolved ref',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.source.requested_ref = 'arbitrary-ref';
  }, { rehash: true }),
  /literal requested ref must equal.*resolved ref/i,
);

test('upgrade plan and apply bind latest to the highest stable release tag', () => {
  const fixture = makeUpgradeFixture({
    sourceRef: 'latest',
    releaseTags: ['v1.0.0', 'v1.2.0', 'v2.0.0-rc1'],
  });
  try {
    assert.equal(fixture.plan.source.requested_ref, 'latest');
    assert.equal(fixture.plan.source.resolved_ref, 'v1.2.0');
    assert.equal(fixture.plan.to_ref, 'v1.2.0');

    const result = applyFixture(fixture);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const installedManifest = fs.readFileSync(path.join(fixture.localRoot, MANIFEST_PATH), 'utf8');
    assert.match(installedManifest, /"source_ref": "latest"/);
    assert.match(installedManifest, /"installed_ref": "v1\.2\.0"/);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade rejects latest for a local path and accepts explicit local branch or tag refs', async (context) => {
  for (const ref of ['latest', 'main', 'v1.2.3']) {
    await context.test(ref, () => {
      const fixture = makeUpgradeFixture({ releaseTags: ['v1.2.3'] });
      const explicitPlanPath = path.join(fixture.base, `local-${ref}.json`);
      try {
        const result = spawnSync(process.execPath, [
          SCRIPT,
          'plan',
          '--source',
          fixture.upstreamRoot,
          '--ref',
          ref,
          '--out',
          explicitPlanPath,
          '--format',
          'json',
        ], {
          cwd: fixture.localRoot,
          encoding: 'utf8',
          env: { ...process.env, TMPDIR: fixture.tmpRoot },
        });

        if (ref === 'latest') {
          assert.equal(result.status, 40, `${result.stdout}${result.stderr}`);
          assert.match(`${result.stdout}${result.stderr}`, /local-path source.*latest.*explicit local branch or tag/i);
          assert.equal(fs.existsSync(explicitPlanPath), false);
          return;
        }

        assert.equal(result.status, 10, `${result.stdout}${result.stderr}`);
        const plan = JSON.parse(fs.readFileSync(explicitPlanPath, 'utf8'));
        assert.equal(plan.source.type, 'local-path');
        assert.equal(plan.source.requested_ref, ref);
        assert.equal(plan.source.resolved_ref, ref);
        assert.equal(plan.source.resolved_commit, git(fixture.upstreamRoot, ['rev-parse', 'HEAD']));
      } finally {
        fs.rmSync(fixture.base, { recursive: true, force: true });
      }
    });
  }
});

test('upgrade status rejects latest for a local-path source with explicit-ref guidance', () => {
  const fixture = makeUpgradeFixture();
  try {
    const result = spawnSync(process.execPath, [
      SCRIPT,
      'status',
      '--source',
      fixture.upstreamRoot,
      '--ref',
      'latest',
    ], {
      cwd: fixture.localRoot,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: fixture.tmpRoot },
    });

    assert.equal(result.status, 40, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /local-path source.*latest.*explicit local branch or tag/i);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

/**
 * Plan against the fixture's upstream working tree as an explicit LOCAL-PATH
 * source (bare path, not the baked file:// remote) at `ref`, then apply it end
 * to end. Asserts the exact persisted buckets land, the manifest/log commit
 * records the explicit local source + ref, and the local-path source/cache and
 * unrelated project paths are left untouched.
 * @param {ReturnType<typeof makeUpgradeFixture>} fixture
 * @param {string} ref explicit local branch or tag
 */
function applyFromLocalSource(fixture, ref) {
  const localPlanPath = path.join(fixture.base, `local-src-${ref}.json`);
  const planResult = spawnSync(process.execPath, [
    SCRIPT,
    'plan',
    '--source',
    fixture.upstreamRoot,
    '--ref',
    ref,
    '--out',
    localPlanPath,
    '--format',
    'json',
  ], {
    cwd: fixture.localRoot,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: fixture.tmpRoot },
  });
  assert.equal(planResult.status, 10, `${planResult.stdout}${planResult.stderr}`);
  const plan = JSON.parse(fs.readFileSync(localPlanPath, 'utf8'));
  assert.equal(plan.source.type, 'local-path');
  assert.equal(plan.source.requested_ref, ref);
  assert.equal(plan.source.resolved_ref, ref);

  // For a local-path source the cache IS the upstream working tree; apply must
  // read but never mutate it, nor any unrelated project path.
  const planBytes = fs.readFileSync(localPlanPath);
  const upstreamBefore = snapshotPath(fixture.upstreamRoot);
  const sentinelBefore = fs.readFileSync(path.join(fixture.localRoot, 'project-sentinel.txt'), 'utf8');
  const advisoryBefore = fs.readFileSync(path.join(fixture.localRoot, '.github/agents/custom.agent.md'), 'utf8');

  const result = applyFixture({ ...fixture, planPath: localPlanPath });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

  // Exact persisted buckets executed.
  assert.equal(fs.readFileSync(path.join(fixture.localRoot, REPLACE_PATH), 'utf8'), 'upstream replace\n');
  assert.equal(fs.readFileSync(path.join(fixture.localRoot, ADD_PATH), 'utf8'), 'upstream add\n');
  assert.equal(fs.existsSync(path.join(fixture.localRoot, REMOVE_PATH)), false);
  assert.deepEqual(JSON.parse(result.stdout).counts, {
    replaced: 1,
    added: 1,
    removed: 1,
    removals_deferred: 0,
  });

  // The upgrade commit touches exactly the reviewed buckets plus manifest + log.
  assert.deepEqual(
    git(fixture.localRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).split('\n').sort(),
    [REPLACE_PATH, ADD_PATH, REMOVE_PATH, MANIFEST_PATH, UPGRADE_LOG_PATH].sort(),
  );

  // Manifest records the explicit local source + ref end to end.
  const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const installedManifest = fs.readFileSync(path.join(fixture.localRoot, MANIFEST_PATH), 'utf8');
  assert.ok(installedManifest.includes(`"source_repo": ${JSON.stringify(fixture.upstreamRoot)}`));
  assert.match(installedManifest, new RegExp(`"source_ref": "${escapedRef}"`));
  assert.match(installedManifest, new RegExp(`"installed_ref": "${escapedRef}"`));
  const log = fs.readFileSync(path.join(fixture.localRoot, UPGRADE_LOG_PATH), 'utf8');
  assert.match(log, new RegExp(`plan_id=${plan.plan_id}`));

  // Zero mutation on the local-path source/cache and unrelated project paths.
  assert.deepEqual(snapshotPath(fixture.upstreamRoot), upstreamBefore);
  assert.equal(fs.readFileSync(path.join(fixture.localRoot, 'project-sentinel.txt'), 'utf8'), sentinelBefore);
  assert.equal(fs.readFileSync(path.join(fixture.localRoot, '.github/agents/custom.agent.md'), 'utf8'), advisoryBefore);
  assert.ok(fs.readFileSync(localPlanPath).equals(planBytes));
}

test('upgrade applies end to end from an explicit local branch ref', () => {
  const fixture = makeUpgradeFixture();
  try {
    applyFromLocalSource(fixture, 'main');
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade applies end to end from an explicit local tag ref', () => {
  const fixture = makeUpgradeFixture({ releaseTags: ['v1.2.3'] });
  try {
    applyFromLocalSource(fixture, 'v1.2.3');
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade apply rejects a rehashed local-path latest plan before mutation', () => {
  const fixture = makeUpgradeFixture();
  const localPlanPath = path.join(fixture.base, 'local-main.json');
  try {
    const planResult = spawnSync(process.execPath, [
      SCRIPT,
      'plan',
      '--source',
      fixture.upstreamRoot,
      '--ref',
      'main',
      '--out',
      localPlanPath,
      '--format',
      'json',
    ], {
      cwd: fixture.localRoot,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: fixture.tmpRoot },
    });
    assert.equal(planResult.status, 10, `${planResult.stdout}${planResult.stderr}`);

    const plan = JSON.parse(fs.readFileSync(localPlanPath, 'utf8'));
    plan.source.requested_ref = 'latest';
    plan.source.resolved_ref = 'latest';
    plan.to_ref = 'latest';
    plan.digest = planDigest(plan);
    fs.writeFileSync(
      localPlanPath,
      `${JSON.stringify({ ...canonicalPlanProjection(plan), digest: plan.digest }, null, 2)}\n`,
    );
    const before = snapshotMutationBoundary(fixture.localRoot);

    const result = applyFixture({ ...fixture, planPath: localPlanPath });

    assert.equal(result.status, 40, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /local-path source.*latest.*explicit local branch or tag/i);
    assert.deepEqual(snapshotMutationBoundary(fixture.localRoot), before);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

rejectedApplyCase(
  'upgrade apply rejects a rehashed latest plan with an arbitrary resolved ref',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.source.resolved_ref = 'main';
    plan.to_ref = 'main';
  }, { rehash: true }),
  /latest.*highest stable release tag|resolved ref.*stable release/i,
  { fixture: { sourceRef: 'latest', releaseTags: ['v1.0.0', 'v1.2.0', 'v2.0.0-rc1'] } },
);

rejectedApplyCase(
  'upgrade apply rejects a rehashed latest plan whose requested ref becomes literal',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.source.requested_ref = 'main';
  }, { rehash: true }),
  /literal requested ref must equal.*resolved ref/i,
  { fixture: { sourceRef: 'latest', releaseTags: ['v1.0.0', 'v1.2.0'] } },
);

rejectedApplyCase(
  'upgrade apply rejects digest tampering',
  (fixture) => rewritePlan(fixture, (plan) => { plan.digest = '0'.repeat(64); }),
  /plan digest mismatch.*consistency check, not authentication/i,
);

rejectedApplyCase(
  'upgrade apply rejects a rehashed unsafe operation path',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.buckets.add[0].path = '../outside';
  }, { rehash: true }),
  /plan contains unsafe path/i,
);

rejectedApplyCase(
  'upgrade apply rejects a rehashed duplicate path across operation buckets',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.buckets.add[0].path = plan.buckets.replace[0].path;
  }, { rehash: true }),
  /plan buckets are invalid: duplicate path/i,
);

rejectedApplyCase(
  'upgrade apply rejects a rehashed noncanonical bucket order',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.buckets.up_to_date.reverse();
  }, { rehash: true }),
  /canonical code-unit ordering/i,
);

rejectedApplyCase(
  'upgrade apply rejects rehashed Replace line-count tampering',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.buckets.replace[0].added_lines += 1;
  }, { rehash: true }),
  /reviewed Replace line metadata changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects a rehashed inconsistent summary',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.summary.add += 1;
  }, { rehash: true }),
  /plan\.summary\.add does not match its bucket/i,
);

rejectedApplyCase(
  'upgrade apply rejects malformed plan JSON',
  (fixture) => fs.writeFileSync(fixture.planPath, '{not json\n'),
  /plan file malformed/i,
);

rejectedApplyCase(
  'upgrade apply rejects old pre-v1 plans with re-plan guidance',
  (fixture) => fs.writeFileSync(fixture.planPath, `${JSON.stringify({
    plan_id: 'old-plan',
    to_ref: 'main',
    cache_dir: fixture.cacheRoot,
    buckets: fixture.plan.buckets,
  }, null, 2)}\n`),
  /unsupported upgrade plan schema.*re-run 'plan' with the current engine/i,
);

for (const [label, mutate] of [
  ['a missing required field', (plan) => { delete plan.local; }],
  ['an unknown field', (plan) => { plan.unknown = true; }],
  ['an incorrectly typed field', (plan) => { plan.summary.add = '1'; }],
]) {
  rejectedApplyCase(
    `upgrade apply rejects ${label} in the strict plan schema`,
    (fixture) => rewritePlan(fixture, mutate),
    /plan schema is invalid/i,
  );
}

rejectedApplyCase(
  'upgrade apply rejects an impossible calendar timestamp in the strict plan schema',
  (fixture) => rewritePlan(fixture, (plan) => {
    plan.created_at = '2099-02-30T00:00:00Z';
    plan.ttl_warn_at = '2099-02-30T01:00:00Z';
    plan.ttl_expire_at = '2099-03-03T00:00:00Z';
  }, { rehash: true }),
  /plan timestamps must be canonical UTC ISO-8601 values/i,
);

rejectedApplyCase(
  'upgrade apply rejects unsupported plan schema versions',
  (fixture) => rewritePlan(fixture, (plan) => { plan.schema_version = 0; }),
  /unsupported upgrade plan schema.*re-run 'plan'/i,
);

rejectedApplyCase(
  'upgrade apply rejects noncanonical plan formatting',
  (fixture) => {
    const plan = JSON.parse(fs.readFileSync(fixture.planPath, 'utf8'));
    fs.writeFileSync(fixture.planPath, JSON.stringify(plan));
  },
  /plan is not canonical/i,
);

rejectedApplyCase(
  'upgrade apply rejects duplicate JSON plan keys',
  (fixture) => {
    const bytes = fs.readFileSync(fixture.planPath, 'utf8');
    fs.writeFileSync(fixture.planPath, bytes.replace('{\n', '{\n  "kind": "dude-upgrade-plan",\n'));
  },
  /plan is not canonical/i,
);

/** @param {Record<string, any>} plan */
function expirePlan(plan) {
  plan.created_at = '2000-01-01T00:00:00Z';
  plan.ttl_warn_at = '2000-01-01T01:00:00Z';
  plan.ttl_expire_at = '2000-01-02T00:00:00Z';
}

rejectedApplyCase(
  'upgrade apply rejects an expired mutation plan',
  (fixture) => rewritePlan(fixture, expirePlan, { rehash: true }),
  /plan expired.*re-run 'plan'/i,
);

for (const [label, confirm, pattern] of [
  ['missing', null, /--confirm is required.*confirm-upgrade/i],
  ['yes', 'yes', /invalid --confirm token/i],
  ['user-facing phrase', 'confirm upgrade', /invalid --confirm token/i],
  ['arbitrary token', 'go', /invalid --confirm token/i],
]) {
  rejectedApplyCase(
    `upgrade apply rejects ${label} confirmation without mutation`,
    () => {},
    pattern,
    { confirm },
  );
}

rejectedApplyCase(
  'upgrade apply rejects a replaced cache root identity',
  (fixture) => {
    const held = `${fixture.cacheRoot}-original`;
    fs.renameSync(fixture.cacheRoot, held);
    fs.cpSync(held, fixture.cacheRoot, { recursive: true, preserveTimestamps: true });
  },
  /reviewed cache root identity changed/i,
);

rejectedApplyCase(
  'upgrade apply rejects a replaced workspace identity',
  (fixture) => {
    const held = `${fixture.localRoot}-original`;
    fs.renameSync(fixture.localRoot, held);
    fs.cpSync(held, fixture.localRoot, { recursive: true, preserveTimestamps: true });
  },
  /reviewed workspace identity changed/i,
);

test('unchanged no-op plan validates evidence and returns without mutation', () => {
  const fixture = makeUpgradeFixture({ noOp: true });
  try {
    const before = snapshotFixtureBoundary(fixture);
    const result = applyFixture(fixture);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /nothing to apply/i);
    assert.deepEqual(snapshotFixtureBoundary(fixture), before);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('metadata-only upgrade applies reviewed manifest log and commit transition', () => {
  const fixture = makeUpgradeFixture({ noOp: true, installedRef: 'v0.0.0' });
  try {
    assert.equal(fixture.plan.summary.add, 0);
    assert.equal(fixture.plan.summary.replace, 0);
    assert.equal(fixture.plan.summary.remove, 0);
    const originalHead = git(fixture.localRoot, ['rev-parse', 'HEAD']);

    const result = applyFixture(fixture);
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 0, output);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, 'applied');
    assert.deepEqual(parsed.counts, {
      replaced: 0,
      added: 0,
      removed: 0,
      removals_deferred: 0,
    });
    assert.notEqual(git(fixture.localRoot, ['rev-parse', 'HEAD']), originalHead);
    assert.match(git(fixture.localRoot, ['symbolic-ref', 'HEAD']), /^refs\/heads\/chore\/dude-upgrade-main/);
    const installedManifest = fs.readFileSync(path.join(fixture.localRoot, MANIFEST_PATH), 'utf8');
    assert.match(installedManifest, /"installed_ref": "main"/);
    const log = fs.readFileSync(path.join(fixture.localRoot, UPGRADE_LOG_PATH), 'utf8');
    assert.match(log, /- replaced: 0\n- added:    0\n- removed:  0\n/);
    assert.match(log, new RegExp(`plan_id=${fixture.plan.plan_id}`));
    assert.deepEqual(
      git(fixture.localRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).split('\n').sort(),
      [MANIFEST_PATH, UPGRADE_LOG_PATH].sort(),
    );
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

rejectedApplyCase(
  'no-op upgrade apply rejects stale cache evidence',
  (fixture) => write(fixture.cacheRoot, UP_TO_DATE_PATH, 'stale no-op cache\n'),
  /reviewed cache bytes changed/i,
  { fixture: { noOp: true } },
);

rejectedApplyCase(
  'no-op upgrade apply rejects stale local manifest evidence',
  (fixture) => {
    fs.appendFileSync(path.join(fixture.localRoot, MANIFEST_PATH), '\n');
    commitLocalDrift(fixture, 'no-op manifest drift');
  },
  /reviewed bundle manifest bytes changed/i,
  { fixture: { noOp: true } },
);

rejectedApplyCase(
  'no-op upgrade apply rejects an expired plan',
  (fixture) => rewritePlan(fixture, expirePlan, { rehash: true }),
  /plan expired/i,
  { fixture: { noOp: true } },
);

rejectedApplyCase(
  'no-op upgrade apply still requires confirmation',
  () => {},
  /--confirm is required/i,
  { fixture: { noOp: true }, confirm: null },
);

test('upgrade plan serialization and evidence are canonical and internally derived', () => {
  const fixture = makeUpgradeFixture();
  try {
    const plan = fixture.plan;
    const bytes = fs.readFileSync(fixture.planPath, 'utf8');
    assert.equal(bytes, `${JSON.stringify({ ...canonicalPlanProjection(plan), digest: plan.digest }, null, 2)}\n`);
    assert.equal(plan.digest, planDigest(plan));
    assert.equal(bytes.endsWith('\n'), true);
    assert.equal(bytes.endsWith('\n\n'), false);
    assert.deepEqual(plan.summary, {
      replace: plan.buckets.replace.length,
      add: plan.buckets.add.length,
      remove: plan.buckets.remove.length,
      advisory: plan.buckets.advisory.length,
      up_to_date: plan.buckets.up_to_date.length,
    });
    for (const bucket of Object.values(plan.buckets)) {
      const paths = bucket.map((entry) => entry.path);
      assert.deepEqual(paths, [...paths].sort());
      assert.equal(new Set(paths).size, paths.length);
    }
    for (const entry of plan.cache.inventory) assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    for (const entry of plan.local.core_inventory.filter((item) => item.state.type === 'file')) {
      assert.match(entry.state.sha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(Object.keys(entry.state).sort(), ['sha256', 'type']);
    }
    const operationPaths = Object.values(plan.buckets)
      .filter((bucket) => bucket !== plan.buckets.advisory)
      .flatMap((bucket) => bucket.map((entry) => entry.path));
    assert.equal(new Set(operationPaths).size, operationPaths.length);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('equivalent plan object key orders have one canonical projection and digest', () => {
  const fixture = makeUpgradeFixture();
  try {
    /** @param {unknown} value @returns {unknown} */
    const reverseKeys = (value) => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
    };
    const reordered = /** @type {Record<string, any>} */ (reverseKeys(fixture.plan));
    assert.deepEqual(canonicalPlanProjection(reordered), canonicalPlanProjection(fixture.plan));
    assert.equal(planDigest(reordered), planDigest(fixture.plan));
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('upgrade apply accepts and preserves a canonical idea without reporting legacy state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-canonical-idea-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: root });
    const manifest = `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({
      source_repo: root,
      source_ref: 'main',
      installed_ref: 'main',
    }, null, 2)}\n\`\`\`\n`;
    const manifestPath = path.join(root, '.dude/metadata/bundle-manifest.md');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, manifest);
    const ideaPath = path.join(root, '.dude/ideas/x.md');
    fs.mkdirSync(path.dirname(ideaPath), { recursive: true });
    fs.writeFileSync(ideaPath, 'canonical idea sentinel\n');

    const result = spawnSync(process.execPath, [
      SCRIPT,
      'apply',
      '--plan',
      'missing-plan',
      '--confirm',
      'confirm-upgrade',
    ], { cwd: root, encoding: 'utf8' });
    const output = `${result.stdout}${result.stderr}`;

    assert.equal(result.status, 40, output);
    assert.match(output, /plan not found/);
    assert.doesNotMatch(output, /legacy Dude workspace state/);
    assert.equal(output.includes(['@dude migrate', 'layout'].join(' ')), false);
    assert.equal(fs.readFileSync(ideaPath, 'utf8'), 'canonical idea sentinel\n');
    assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade status, plan, and apply reject missing canonical metadata with current-engine recovery guidance', async (context) => {
  const commands = [
    ['status'],
    ['plan'],
    ['apply', '--plan', 'missing-plan', '--confirm', 'confirm-upgrade'],
  ];

  for (const args of commands) {
    await context.test(args[0], () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-no-manifest-'));
      try {
        spawnSync('git', ['init', '-q'], { cwd: root });
        const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
        const output = `${result.stdout}${result.stderr}`;

        assert.equal(result.status, 40, output);
        assert.match(output, /canonical bundle manifest missing or malformed.*\.dude\/metadata\/bundle-manifest\.md/i);
        assert.match(output, /install or copy a current bundle engine|reinstall the current bundle/i);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
