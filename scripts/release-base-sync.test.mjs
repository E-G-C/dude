// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDevelopmentBaseRelease } from '../src/skills/dude-engine/lib/development-base-release.mjs';
import { parseManifestDocument } from './build-release.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HELPER = path.join(ROOT, 'scripts', 'release-base-sync.mjs');
const BUILD_RELEASE = path.join(ROOT, 'scripts', 'build-release.mjs');
// Fixture repositories commit their own copies of the helper and builder
// scripts; every other module those scripts load comes from the copied src/.
const FIXTURE_SCRIPTS = ['build-dev.mjs', 'build-release.mjs', 'release-base-sync.mjs'];
const BASE_RELEASE_PATH = '.dude/metadata/development-base-release.md';
const RENDERER_PATH = 'src/skills/dude-engine/lib/development-base-release.mjs';
const RENDERER_REVISION = 'Fixture renderer revision: records which renderer produced this file.';
const MANIFEST_PATH = '.dude/metadata/bundle-manifest.md';
const FIXTURE_SOURCE = 'https://example.invalid/dude';

/** @param {string} root @param {string} rel @param {string | Buffer} content */
function write(root, rel, content) {
  const absolute = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

/**
 * Git with deterministic fixture identity and LF checkout conversion.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ expect?: number, input?: string }} [options]
 */
function git(cwd, args, options = {}) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'user.name=Release Fixture',
      '-c',
      'user.email=release-fixture@example.invalid',
      ...args,
    ],
    {
      cwd,
      encoding: 'utf8',
      input: options.input,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Release Fixture',
        GIT_AUTHOR_EMAIL: 'release-fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Release Fixture',
        GIT_COMMITTER_EMAIL: 'release-fixture@example.invalid',
      },
    },
  );
  const expected = options.expect ?? 0;
  assert.equal(
    result.status,
    expected,
    `git ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}`,
  );
  return result.stdout.trim();
}

/** @param {string} root @param {string} message */
function commitAll(root, message) {
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '-m', message]);
}

/** @param {string} script @param {string[]} args @param {string} [cwd] */
function runNode(script, args, cwd = ROOT) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
}

/**
 * Run a checkout's own committed helper the way the release workflow does:
 * `node scripts/release-base-sync.mjs <command> --repo . ...` from its root.
 * @param {string} repoRoot
 * @param {string[]} args
 */
function runHelper(repoRoot, args) {
  return runNode(
    'scripts/release-base-sync.mjs',
    [...args.slice(0, 1), '--repo', '.', ...args.slice(1)],
    repoRoot,
  );
}

/**
 * Run a checkout's own committed builder the way the CI drift gate does.
 * @param {string} repoRoot
 */
function runBuildDev(repoRoot) {
  return runNode('scripts/build-dev.mjs', [], repoRoot);
}

/** @param {ReturnType<typeof spawnSync>} result @param {string} label */
function assertSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label}\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`,
  );
}

/** @param {string} repoRoot */
function readBase(repoRoot) {
  return parseDevelopmentBaseRelease(
    fs.readFileSync(path.join(repoRoot, ...BASE_RELEASE_PATH.split('/'))),
  );
}

/** @param {string} repoRoot */
function readManifest(repoRoot) {
  return parseManifestDocument(
    fs.readFileSync(path.join(repoRoot, ...MANIFEST_PATH.split('/'))),
    'fixture manifest',
  ).data;
}

/** @param {string} bareRoot @param {string} relPath */
function readBareFile(bareRoot, relPath) {
  const result = spawnSync('git', ['--git-dir', bareRoot, 'show', `refs/heads/main:${relPath}`], {
    encoding: null,
  });
  assert.equal(result.status, 0, `read ${relPath} from bare main\n${String(result.stderr || '')}`);
  return /** @type {Buffer} */ (result.stdout);
}

/**
 * Build a source repository whose v2 tag makes the committed v1 base record
 * stale, then push it to a local bare origin.
 * @param {{ tags?: boolean }} [options]
 */
function makeFixture(options = {}) {
  const tags = options.tags ?? true;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'd-rbs-'));
  const source = path.join(sandbox, 'src-repo');
  const bare = path.join(sandbox, 'remote.git');
  fs.mkdirSync(source, { recursive: true });
  fs.cpSync(path.join(ROOT, 'src'), path.join(source, 'src'), { recursive: true });
  for (const script of FIXTURE_SCRIPTS) {
    write(source, `scripts/${script}`, fs.readFileSync(path.join(ROOT, 'scripts', script)));
  }
  write(
    source,
    MANIFEST_PATH,
    '# Bundle Manifest\n\n'
      + '```json\n'
      + '{\n'
      + `  "source_repo": "${FIXTURE_SOURCE}",\n`
      + '  "source_ref": "main",\n'
      + '  "installed_ref": "main"\n'
      + '}\n'
      + '```\n',
  );
  write(source, '.gitattributes', '* text=auto eol=lf\n');

  git(source, ['init', '--quiet', '-b', 'main']);
  commitAll(source, 'fixture source');
  if (tags) git(source, ['tag', 'v1.0.0']);
  const build = runBuildDev(source);
  assertSuccess(build, 'seed fixture development bundle');
  commitAll(source, 'seed development bundle');
  if (tags) git(source, ['tag', 'v2.0.0']);

  git(sandbox, ['init', '--bare', '--quiet', '-b', 'main', bare]);
  git(source, ['remote', 'add', 'origin', bare]);
  git(source, ['push', '--quiet', '--set-upstream', 'origin', 'main']);
  if (tags) git(source, ['push', '--quiet', 'origin', '--tags']);
  return { sandbox, source, bare };
}

/** @param {string} bare @param {string} destination */
function cloneMain(bare, destination) {
  git(path.dirname(destination), ['clone', '--quiet', '--branch', 'main', bare, destination]);
}

/**
 * Clone a write-back checkout, then advance the remote default branch with a
 * record-renderer change plus the output that branch's own builder generates.
 * The checkout's committed helper and builder now predate the branch it will
 * fetch, as when main moves between the workflow checkout and the helper's
 * fetch. The ordering is fixed; nothing races.
 * @param {{ sandbox: string, bare: string }} fixture
 */
function checkoutBeforeRendererRevision(fixture) {
  const stale = path.join(fixture.sandbox, 'stale');
  cloneMain(fixture.bare, stale);

  const advance = path.join(fixture.sandbox, 'advance');
  cloneMain(fixture.bare, advance);
  const renderer = path.join(advance, ...RENDERER_PATH.split('/'));
  const rendererSource = fs.readFileSync(renderer, 'utf8');
  const anchor = /^( {2}'check for newer releases\. An absent file means the base release is unknown\.',)(\r?\n)/m;
  assert.equal(rendererSource.split(anchor).length, 4, 'the renderer prose anchor is unique');
  fs.writeFileSync(
    renderer,
    rendererSource.replace(anchor, `$1$2  '${RENDERER_REVISION}',$2`),
  );
  assertSuccess(runBuildDev(advance), 'regenerate the advanced default branch with its own builder');
  assert.deepEqual(changedPaths(advance), [
    BASE_RELEASE_PATH,
    '.github/skills/dude-engine/lib/development-base-release.mjs',
    RENDERER_PATH,
  ]);
  const record = fs.readFileSync(path.join(advance, ...BASE_RELEASE_PATH.split('/')), 'utf8');
  assert.ok(record.includes(RENDERER_REVISION), 'the advanced record carries the revised renderer output');
  assert.equal(readBase(advance).base_release, 'v2.0.0');
  commitAll(advance, 'revise the development base release renderer');
  git(advance, ['push', '--quiet', 'origin', 'main']);
  return { stale, advance, head: git(advance, ['rev-parse', 'HEAD']), record };
}

/** @param {string} repoRoot */
function changedPaths(repoRoot) {
  return git(repoRoot, ['diff', '--name-only', 'HEAD', '--'])
    .split(/\r?\n/)
    .filter(Boolean);
}

/** @param {string} source @param {string} heading */
function markdownSection(source, heading) {
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `missing ${heading}`);
  const level = /^#+/.exec(heading)?.[0].length ?? 1;
  const rest = source.slice(start + heading.length + 1);
  const next = new RegExp(`^#{1,${level}}\\s`, 'm').exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

/** @param {string} source @param {string} jobName */
function workflowJob(source, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job ${jobName}`);
  const rest = source.slice(start + marker.length);
  const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

test('release helper classifies exact stable tags through its executable CLI', () => {
  for (const [tag, stable] of [
    ['v1.2.3', true],
    ['v10.20.30', true],
    ['v1.2.3-rc.1', false],
    ['v1.2', false],
    ['vnext', false],
  ]) {
    const result = runNode(HELPER, ['classify', '--tag', tag]);
    assertSuccess(result, `classify ${tag}`);
    assert.equal(result.stdout, `stable=${stable}\n`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd-rbo-'));
  try {
    const output = path.join(root, 'github-output');
    fs.writeFileSync(output, 'prior=value\n');
    const result = runNode(
      HELPER,
      ['classify', '--tag', 'v3.4.5', '--github-output', output],
    );
    assertSuccess(result, 'write GitHub output');
    assert.equal(result.stdout, '');
    assert.equal(fs.readFileSync(output, 'utf8'), 'prior=value\nstable=true\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stable release refresh persists only the reachable base and replay variants are no-ops', () => {
  const fixture = makeFixture();
  try {
    const tagCheckout = path.join(fixture.sandbox, 'tag');
    cloneMain(fixture.bare, tagCheckout);
    git(tagCheckout, ['checkout', '--quiet', '--detach', 'v2.0.0']);
    assert.equal(readBase(tagCheckout).base_release, 'v1.0.0');
    const prepared = runHelper(tagCheckout, ['prepare', '--event-tag', 'v2.0.0']);
    assertSuccess(prepared, 'prepare stable tag checkout');
    assert.match(prepared.stdout, /v2\.0\.0 refreshed for validation/);
    assert.deepEqual(changedPaths(tagCheckout), [BASE_RELEASE_PATH]);
    assert.equal(readBase(tagCheckout).base_release, 'v2.0.0');
    assert.deepEqual(readManifest(tagCheckout), {
      source_repo: FIXTURE_SOURCE,
      source_ref: 'main',
      installed_ref: 'main',
    });

    const sync = path.join(fixture.sandbox, 'sync');
    cloneMain(fixture.bare, sync);
    const staleCheckoutHead = git(sync, ['rev-parse', 'HEAD']);
    const advance = path.join(fixture.sandbox, 'advance');
    cloneMain(fixture.bare, advance);
    write(advance, 'default-branch.txt', 'arrived after the write-back checkout\n');
    commitAll(advance, 'advance default branch');
    git(advance, ['push', '--quiet', 'origin', 'main']);
    const freshBase = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
    assert.notEqual(freshBase, staleCheckoutHead, 'the write-back checkout starts behind the remote');

    const persisted = runHelper(
      sync,
      ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
    );
    assertSuccess(persisted, 'persist stable base');
    assert.match(persisted.stdout, /v2\.0\.0 committed and pushed/);
    const newRemoteHead = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
    assert.notEqual(newRemoteHead, freshBase);
    assert.equal(git(sync, ['rev-parse', 'HEAD']), newRemoteHead);
    assert.equal(git(sync, ['rev-parse', 'HEAD^']), freshBase, 'automation commit uses the freshly fetched base');
    assert.deepEqual(
      git(sync, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD^', 'HEAD'])
        .split(/\r?\n/)
        .filter(Boolean),
      [BASE_RELEASE_PATH],
    );
    assert.equal(readBase(sync).base_release, 'v2.0.0');
    assert.deepEqual(readManifest(sync), {
      source_repo: FIXTURE_SOURCE,
      source_ref: 'main',
      installed_ref: 'main',
    });

    const replay = path.join(fixture.sandbox, 'replay');
    cloneMain(fixture.bare, replay);
    const replayHead = git(replay, ['rev-parse', 'HEAD']);
    const repeated = runHelper(
      replay,
      ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
    );
    assertSuccess(repeated, 'replay stable write-back');
    assert.match(repeated.stdout, /already current; no commit or push/);
    assert.equal(git(replay, ['rev-parse', 'HEAD']), replayHead);
    assert.equal(git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']), replayHead);

    git(fixture.source, ['tag', 'v1.5.0', 'v1.0.0']);
    git(fixture.source, ['push', '--quiet', 'origin', 'refs/tags/v1.5.0']);
    const older = path.join(fixture.sandbox, 'older');
    cloneMain(fixture.bare, older);
    const olderRun = runHelper(
      older,
      ['sync', '--event-tag', 'v1.5.0', '--branch', 'main', '--remote', 'origin'],
    );
    assertSuccess(olderRun, 'backfilled older stable tag');
    assert.match(olderRun.stdout, /v2\.0\.0 already current; no commit or push/);
    assert.equal(readBase(older).base_release, 'v2.0.0');

    git(replay, ['tag', 'v3.0.0-rc.1']);
    git(replay, ['push', '--quiet', 'origin', 'refs/tags/v3.0.0-rc.1']);
    const prereleaseHead = git(replay, ['rev-parse', 'HEAD']);
    const prerelease = runHelper(
      replay,
      ['sync', '--event-tag', 'v3.0.0-rc.1', '--branch', 'main', '--remote', 'origin'],
    );
    assertSuccess(prerelease, 'prerelease skip');
    assert.match(prerelease.stdout, /write-back skipped for a nonstable tag/);
    assert.equal(git(replay, ['rev-parse', 'HEAD']), prereleaseHead);

    const side = path.join(fixture.sandbox, 'side');
    cloneMain(fixture.bare, side);
    git(side, ['checkout', '--quiet', '-b', 'side-release', 'v1.0.0']);
    write(side, 'side.txt', 'not on main\n');
    commitAll(side, 'side-only release');
    git(side, ['tag', 'v9.0.0']);
    git(side, ['push', '--quiet', 'origin', 'refs/tags/v9.0.0']);

    const offAncestry = path.join(fixture.sandbox, 'off');
    cloneMain(fixture.bare, offAncestry);
    git(offAncestry, ['merge-base', '--is-ancestor', 'v9.0.0', 'HEAD'], { expect: 1 });
    const offHead = git(offAncestry, ['rev-parse', 'HEAD']);
    const excluded = runHelper(
      offAncestry,
      ['sync', '--event-tag', 'v9.0.0', '--branch', 'main', '--remote', 'origin'],
    );
    assertSuccess(excluded, 'stable tag outside default-branch ancestry');
    assert.match(excluded.stdout, /v2\.0\.0 already current; no commit or push/);
    assert.equal(readBase(offAncestry).base_release, 'v2.0.0');
    assert.equal(git(offAncestry, ['rev-parse', 'HEAD']), offHead);

    const out = path.join(fixture.sandbox, 'release-out');
    const releaseBuild = runNode(
      BUILD_RELEASE,
      ['--repo', offAncestry, '--out', out, '--tag', 'v2.0.0'],
    );
    assertSuccess(releaseBuild, 'build tagged release artifact');
    assert.deepEqual(readManifest(out), {
      source_repo: FIXTURE_SOURCE,
      source_ref: 'latest',
      installed_ref: 'v2.0.0',
    });
    assert.equal(
      fs.existsSync(path.join(out, ...BASE_RELEASE_PATH.split('/'))),
      false,
      'stable release artifact omits the development record',
    );
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test('write-back regenerates with the fetched default branch builder and its current modules', async (context) => {
  await context.test('a replayed release keeps the current renderer output', () => {
    const fixture = makeFixture();
    try {
      const { stale, head, record } = checkoutBeforeRendererRevision(fixture);
      const result = runHelper(
        stale,
        ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
      );
      assertSuccess(result, 'replay after the renderer revision');
      assert.equal(
        readBareFile(fixture.bare, BASE_RELEASE_PATH).toString('utf8'),
        record,
        'modules loaded before the fetch must not replace current record bytes',
      );
      assert.match(result.stdout, /v2\.0\.0 already current; no commit or push/);
      assert.equal(git(stale, ['rev-parse', 'HEAD']), head);
      assert.equal(git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']), head);
    } finally {
      fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  });

  await context.test('a new stable tag is written in the current renderer format', () => {
    const fixture = makeFixture();
    try {
      const { stale, advance, head } = checkoutBeforeRendererRevision(fixture);
      git(advance, ['tag', 'v3.0.0']);
      git(advance, ['push', '--quiet', 'origin', 'refs/tags/v3.0.0']);
      const result = runHelper(
        stale,
        ['sync', '--event-tag', 'v3.0.0', '--branch', 'main', '--remote', 'origin'],
      );
      assertSuccess(result, 'write back a new stable tag after the renderer revision');
      assert.match(result.stdout, /v3\.0\.0 committed and pushed/);
      assert.equal(git(stale, ['rev-parse', 'HEAD^']), head, 'automation commit uses the fetched base');
      assert.deepEqual(
        git(stale, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD^', 'HEAD'])
          .split(/\r?\n/)
          .filter(Boolean),
        [BASE_RELEASE_PATH],
      );
      const pushed = readBareFile(fixture.bare, BASE_RELEASE_PATH);
      assert.equal(parseDevelopmentBaseRelease(pushed).base_release, 'v3.0.0');

      // The pushed branch's own builder, run as the CI drift gate runs it,
      // must reproduce the pushed record byte for byte.
      const verify = path.join(fixture.sandbox, 'verify');
      cloneMain(fixture.bare, verify);
      assertSuccess(runBuildDev(verify), 'rebuild the pushed default branch');
      assert.equal(
        git(verify, ['status', '--porcelain', '--untracked-files=all']),
        '',
        'a real build of the pushed default branch leaves no drift',
      );
      assert.ok(pushed.includes(RENDERER_REVISION), 'the pushed record uses the revised renderer');
    } finally {
      fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  });
});

test('write-back refuses a failing or unreadable fresh builder result without writes', () => {
  // Stub builders exercise only the helper's refusal at its process boundary;
  // real rendering is covered by the fixture tests above.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'd-rbf-'));
  try {
    for (const [label, builder, expected] of [
      [
        'failing-builder',
        "export function buildDev() { throw new Error('fixture builder refusal'); }\n",
        /build-dev failed: fixture builder refusal/,
      ],
      [
        'unreadable-result',
        "export function buildDev() { process.stdout.write('not json'); return { baseRelease: { release: 'v1.0.0', reason: null } }; }\n",
        /build-dev returned no readable base release result/,
      ],
    ]) {
      const repo = path.join(sandbox, label);
      write(repo, 'scripts/release-base-sync.mjs', fs.readFileSync(HELPER));
      for (const lib of ['release-channel.mjs', 'workspace-paths.mjs']) {
        write(
          repo,
          `src/skills/dude-engine/lib/${lib}`,
          fs.readFileSync(path.join(ROOT, 'src', 'skills', 'dude-engine', 'lib', lib)),
        );
      }
      write(repo, 'scripts/build-dev.mjs', builder);
      git(repo, ['init', '--quiet', '-b', 'main']);
      commitAll(repo, `fixture ${label}`);
      git(repo, ['tag', 'v1.0.0']);

      const result = runHelper(repo, ['prepare', '--event-tag', 'v1.0.0']);
      assert.equal(result.status, 2, `${label}\n${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, expected);
      assert.equal(result.stdout, '');
      assert.equal(git(repo, ['status', '--porcelain', '--untracked-files=all']), '');
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('write-back refuses dirty input and non-record builder drift without pushing', async (context) => {
  await context.test('dirty input', () => {
    const fixture = makeFixture();
    try {
      const worker = path.join(fixture.sandbox, 'dirty');
      cloneMain(fixture.bare, worker);
      write(worker, 'unexpected.txt', 'dirty\n');
      const remoteHead = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
      const result = runHelper(
        worker,
        ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /requires a clean checkout/);
      assert.match(result.stderr, /unexpected\.txt/);
      assert.equal(git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']), remoteHead);
    } finally {
      fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  });

  await context.test('non-record build drift', () => {
    const fixture = makeFixture();
    try {
      fs.appendFileSync(
        path.join(fixture.source, 'src', 'instructions', 'dude.instructions.md'),
        '\nFixture source drift.\n',
      );
      commitAll(fixture.source, 'unbuilt source drift');
      git(fixture.source, ['push', '--quiet', 'origin', 'main']);
      const remoteHead = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);

      const worker = path.join(fixture.sandbox, 'drift');
      cloneMain(fixture.bare, worker);
      const result = runHelper(
        worker,
        ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /build-dev produced non-record drift/);
      assert.match(result.stderr, /\.github\/instructions\/dude\.instructions\.md/);
      assert.equal(git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']), remoteHead);
      assert.equal(git(worker, ['rev-list', '--count', 'HEAD']), git(fixture.source, ['rev-list', '--count', 'HEAD']));
    } finally {
      fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  });
});

test('a concurrent default-branch advance makes the ordinary push fail without overwriting remote', () => {
  const fixture = makeFixture();
  try {
    const worker = path.join(fixture.sandbox, 'race');
    cloneMain(fixture.bare, worker);
    const oldRemote = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
    const advanceScript = path.join(fixture.sandbox, 'advance-remote.mjs');
    fs.writeFileSync(
      advanceScript,
      [
        "import { spawnSync } from 'node:child_process';",
        `const bare = ${JSON.stringify(fixture.bare)};`,
        "const env = { ...process.env, GIT_AUTHOR_NAME: 'Race Fixture', GIT_AUTHOR_EMAIL: 'race@example.invalid', GIT_COMMITTER_NAME: 'Race Fixture', GIT_COMMITTER_EMAIL: 'race@example.invalid' };",
        "const run = (args, input) => {",
        "  const result = spawnSync('git', ['--git-dir', bare, ...args], { encoding: 'utf8', input, env });",
        "  if (result.status !== 0) { process.stderr.write(result.stderr || 'git failure'); process.exit(1); }",
        "  return result.stdout.trim();",
        "};",
        "const old = run(['rev-parse', 'refs/heads/main']);",
        "const tree = run(['rev-parse', 'refs/heads/main^{tree}']);",
        "const next = run(['commit-tree', tree, '-p', old], 'concurrent main advance\\n');",
        "run(['update-ref', 'refs/heads/main', next, old]);",
        '',
      ].join('\n'),
      'utf8',
    );
    const hook = path.join(worker, '.git', 'hooks', 'pre-commit');
    const node = process.execPath.replaceAll('\\', '/');
    const script = advanceScript.replaceAll('\\', '/');
    fs.writeFileSync(hook, `#!/bin/sh\n"${node}" "${script}"\n`, 'utf8');
    fs.chmodSync(hook, 0o755);

    const result = runHelper(
      worker,
      ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
    );
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /non-force development base release push failed/);
    const remoteAfter = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
    const localAfter = git(worker, ['rev-parse', 'HEAD']);
    assert.notEqual(remoteAfter, oldRemote, 'the controlled concurrent commit reached remote');
    assert.notEqual(localAfter, remoteAfter, 'the automation commit did not overwrite the concurrent commit');
    assert.equal(parseDevelopmentBaseRelease(readBareFile(fixture.bare, BASE_RELEASE_PATH)).base_release, 'v1.0.0');
    assert.deepEqual(
      git(worker, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD^', 'HEAD'])
        .split(/\r?\n/)
        .filter(Boolean),
      [BASE_RELEASE_PATH],
    );
    assert.doesNotMatch(fs.readFileSync(HELPER, 'utf8'), /['"]--force['"]/);
    assert.doesNotMatch(fs.readFileSync(HELPER, 'utf8'), /\+refs\/heads/);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test('write-back refuses shallow and tagless release evidence', async (context) => {
  await context.test('shallow checkout', () => {
    const fixture = makeFixture();
    try {
      const shallow = path.join(fixture.sandbox, 'shallow');
      git(
        fixture.sandbox,
        [
          'clone',
          '--quiet',
          '--depth=1',
          '--branch',
          'main',
          pathToFileURL(fixture.bare).href,
          shallow,
        ],
      );
      assert.equal(git(shallow, ['rev-parse', '--is-shallow-repository']), 'true');
      const remoteHead = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
      const result = runHelper(
        shallow,
        ['sync', '--event-tag', 'v2.0.0', '--branch', 'main', '--remote', 'origin'],
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /full Git history is required; the repository is shallow/);
      assert.equal(git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']), remoteHead);
    } finally {
      fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  });

  await context.test('no reachable stable tag', () => {
    const fixture = makeFixture({ tags: false });
    try {
      const worker = path.join(fixture.sandbox, 'tagless');
      cloneMain(fixture.bare, worker);
      const remoteHead = git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']);
      const result = runHelper(
        worker,
        ['sync', '--event-tag', 'v1.0.0', '--branch', 'main', '--remote', 'origin'],
      );
      assert.equal(result.status, 2);
      assert.match(result.stderr, /development base release evidence is unavailable/);
      assert.match(result.stderr, /no stable release tag is merged/);
      assert.equal(git(fixture.sandbox, ['--git-dir', fixture.bare, 'rev-parse', 'refs/heads/main']), remoteHead);
    } finally {
      fs.rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  });
});

test('release workflow orders stable metadata sync after successful publication', () => {
  const source = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  const release = workflowJob(source, 'release');
  const sync = workflowJob(source, 'sync-development-base-release');

  // Each tag publishes independently. Only the shared default-branch
  // write-back is serialized; a waiting sync may yield to a newer one.
  assert.doesNotMatch(source, /^concurrency:/m, 'no workflow-level group can replace a waiting tag run');
  assert.doesNotMatch(release, /concurrency:/, 'the publishing job joins no shared group');
  assert.match(
    sync,
    /\n    concurrency:\n      group: development-base-release-\$\{\{ github\.repository \}\}\n      cancel-in-progress: false\n/,
  );
  assert.equal(source.match(/concurrency:/g)?.length, 1, 'the sync job holds the only concurrency group');
  assert.match(source, /permissions:\n  contents: read/);
  assert.match(release, /permissions:\n      contents: write/);
  assert.match(release, /actions\/checkout@v7[\s\S]*?fetch-depth: 0[\s\S]*?persist-credentials: false/);
  assert.match(release, /actions\/setup-node@v7[\s\S]*?node-version: '22'/);
  assert.match(
    release,
    /id: release-channel[\s\S]*?release-base-sync\.mjs classify --tag "\$RELEASE_TAG" --github-output "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    release,
    /name: Refresh development base release for validation\n        if: steps\.release-channel\.outputs\.stable == 'true'[\s\S]*?release-base-sync\.mjs prepare --repo \. --event-tag "\$RELEASE_TAG"/,
  );
  const refreshIndex = release.indexOf('name: Refresh development base release for validation');
  const testsIndex = release.indexOf('name: Unit tests');
  const publishIndex = release.indexOf('name: Create GitHub Release');
  assert.ok(refreshIndex < testsIndex && testsIndex < publishIndex);

  assert.match(sync, /needs: release/);
  assert.match(
    sync,
    /if: \$\{\{ needs\.release\.result == 'success' && needs\.release\.outputs\.stable == 'true' \}\}/,
  );
  assert.match(sync, /permissions:\n      contents: write/);
  assert.match(
    sync,
    /actions\/checkout@v7[\s\S]*?ref: \$\{\{ github\.event\.repository\.default_branch \}\}[\s\S]*?fetch-depth: 0[\s\S]*?fetch-tags: true[\s\S]*?persist-credentials: true/,
  );
  assert.match(
    sync,
    /release-base-sync\.mjs sync --repo \. --event-tag "\$RELEASE_TAG" --branch "\$DEFAULT_BRANCH" --remote origin/,
  );
  assert.doesNotMatch(source, /npm version/);
});

test('release and upgrade docs describe automated ownership and optional record lifecycle', () => {
  const commands = fs.readFileSync(path.join(ROOT, 'docs', 'commands.md'), 'utf8');
  const releases = markdownSection(commands, '### Releases and CI');
  for (const pattern of [
    /Release Manager uses PR-first delivery for source changes/,
    /After successful publication of a stable release/,
    /highest stable tag reachable from that default-branch commit/,
    /tag outside default-branch ancestry\s+cannot label that branch/,
    /commits only\s+`\.dude\/metadata\/development-base-release\.md`/,
    /normal, non-force\s+push/,
    /Maintainers do not need a\s+post-tag rebuild or metadata commit/,
    /Ordinary CI remains read-only and retains its dev-bundle drift gate/,
    /sync job fails visibly after\s+publication/,
    /do not publish a live GitHub Release\s+or perform a live GitHub push/,
  ]) assert.match(releases, pattern);
  const releaseText = releases.replace(/\s+/g, ' ');
  for (const statement of [
    'The helper starts that builder in a new Node process, so the builder and every module it loads come from the fetched commit.',
    "Only the sync job is serialized; each tag's release job still publishes on its own.",
    'A waiting sync can be replaced by a later-queued sync, regardless of tag version or publication order.',
    'Each replacement recomputes the record from the latest default branch and tags.',
    'A sync that has started is never canceled.',
    "unless GitHub canceled that sync while it was still waiting; in that case, verify a successful replacement sync and the resulting default-branch record against that branch's highest reachable stable tag.",
  ]) assert.ok(releaseText.includes(statement), statement);
  assert.doesNotMatch(releaseText, /requiring both jobs in the tag workflow run to succeed/);
  assert.doesNotMatch(releaseText, /latest stable tag run's sync job|newer stable tag's sync/);

  const upgrading = fs.readFileSync(path.join(ROOT, 'docs', 'upgrading.md'), 'utf8');
  for (const pattern of [
    /Upgrade-owned metadata[\s\S]*development-base-release\.md/,
    /source repository, `build-dev` owns the generated base-record copy/,
    /Stable release bundles omit that record/,
    /matching development-base record or matching\s+absence/,
    /Missing, invalid, or differently sourced\s+provenance plans removal or omission/,
    /same preview and `confirm upgrade` gate/,
    /rollback restores its earlier bytes or absence/,
    /old engine cannot plan the optional development-base record[\s\S]*separate, explicit upgrade/,
    /everything under `\.dude\/` except[\s\S]*development-base-release\.md/,
    /including the record's prior absence/,
  ]) assert.match(upgrading, pattern);
  assert.doesNotMatch(upgrading, /development-base[^.\n]*verif(?:y|ies|ied) installed bytes/i);
});
