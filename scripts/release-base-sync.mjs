// @ts-check
/**
 * Guarded release integration for the generated development-base record.
 *
 * `prepare` refreshes the record in a clean, full-history tag checkout before
 * release validation. `sync` starts from a clean default-branch checkout,
 * fetches the latest branch and tags, regenerates through build-dev, and
 * commits and pushes only the record when its bytes changed.
 *
 * Generation runs the checkout's own `scripts/build-dev.mjs` in a new Node
 * process after any fetch, so the builder and every module it loads are the
 * refreshed checkout's bytes, never modules loaded before the fast-forward.
 * This process keeps the input, drift, commit, and push guards.
 *
 * Dependency-free ESM. Targets Node >= 20.
 * Exit codes: 0 success/no-op, 1 usage, 2 operational refusal/failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pickLatestReleaseTag } from '../src/skills/dude-engine/lib/release-channel.mjs';
import { WORKSPACE_PATHS } from '../src/skills/dude-engine/lib/workspace-paths.mjs';

const BASE_RELEASE_PATH = WORKSPACE_PATHS.DEVELOPMENT_BASE_RELEASE;
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const REMOTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
// Evaluated by a fresh Node process: load the checkout's builder by URL, call
// the existing buildDev API, and print only its structured baseRelease result.
// The repository root is argv[1], so no imported script's main-module check
// can mistake this evaluation for its own command line.
const FRESH_BUILD_DEV = [
  'const [repoRoot, builderUrl] = process.argv.slice(1);',
  'try {',
  'const { buildDev } = await import(builderUrl);',
  'process.stdout.write(JSON.stringify(buildDev({ repoRoot }).baseRelease));',
  '} catch (error) {',
  'process.stderr.write(error instanceof Error ? error.message : String(error));',
  'process.exitCode = 2;',
  '}',
].join(' ');

/** @param {string} value @returns {string} */
function redact(value) {
  let result = String(value);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN']) {
    const secret = process.env[key];
    if (secret && secret.length >= 6) result = result.replaceAll(secret, '[REDACTED]');
  }
  return result.trim().slice(0, 4000);
}

/**
 * @param {string} repoRoot
 * @param {string[]} args
 * @param {string} label
 * @param {{ allowFailure?: boolean, env?: NodeJS.ProcessEnv }} [options]
 */
function runGit(repoRoot, args, label, options = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  if (result.error) {
    throw new Error(`${label} failed: ${redact(result.error.message)}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    const detail = redact(`${result.stdout || ''}\n${result.stderr || ''}`);
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

/** @param {string} candidate @returns {string} */
function realDirectory(candidate) {
  const resolved = path.resolve(candidate);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw new Error(`repository root is not readable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('repository root must be a real directory');
  }
  return fs.realpathSync.native(resolved);
}

/** @param {string} repoRoot @returns {string} */
function validateRepository(repoRoot) {
  const root = realDirectory(repoRoot);
  const topLevel = runGit(root, ['rev-parse', '--show-toplevel'], 'Git root inspection').stdout.trim();
  let gitRoot;
  try {
    gitRoot = fs.realpathSync.native(path.resolve(topLevel));
  } catch {
    throw new Error('Git reported an unreadable repository root');
  }
  if (gitRoot !== root) {
    throw new Error('the requested repository root is not the exact Git root');
  }
  const head = runGit(root, ['rev-parse', '--verify', 'HEAD^{commit}'], 'HEAD inspection').stdout.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(head)) throw new Error('the repository has no current commit');
  return root;
}

/** @param {string} repoRoot */
function requireFullHistory(repoRoot) {
  const state = runGit(
    repoRoot,
    ['rev-parse', '--is-shallow-repository'],
    'Git history inspection',
  ).stdout.trim();
  if (state !== 'false') {
    if (state === 'true') throw new Error('full Git history is required; the repository is shallow');
    throw new Error('Git history completeness could not be confirmed');
  }
}

/** @param {string} output @returns {string[]} */
function nulPaths(output) {
  return String(output).split('\0').filter(Boolean);
}

/** @param {string} repoRoot @returns {string[]} */
function visibleChangedPaths(repoRoot) {
  const tracked = nulPaths(runGit(
    repoRoot,
    ['diff', '--name-only', '-z', 'HEAD', '--'],
    'tracked change inspection',
  ).stdout);
  const untracked = nulPaths(runGit(
    repoRoot,
    ['ls-files', '--others', '--exclude-standard', '-z', '--'],
    'untracked file inspection',
  ).stdout);
  return [...new Set([...tracked, ...untracked])].sort();
}

/** @param {string} repoRoot @returns {string[]} */
function ignoredOwnedPaths(repoRoot) {
  const output = runGit(
    repoRoot,
    ['status', '--porcelain=v1', '-z', '--ignored', '--untracked-files=all', '--', 'src', '.github', '.dude'],
    'ignored path inspection',
  ).stdout;
  return output
    .split('\0')
    .filter((entry) => entry.startsWith('!! '))
    .map((entry) => entry.slice(3))
    .sort();
}

/** @param {string[]} paths @returns {string} */
function describePaths(paths) {
  return paths.map((entry) => JSON.stringify(entry)).join(', ');
}

/** @param {string} repoRoot @param {string} phase */
function requireCleanInput(repoRoot, phase) {
  const visible = visibleChangedPaths(repoRoot);
  if (visible.length > 0) {
    throw new Error(`${phase} requires a clean checkout; unexpected paths: ${describePaths(visible)}`);
  }
  const ignored = ignoredOwnedPaths(repoRoot);
  if (ignored.length > 0) {
    throw new Error(`${phase} refuses ignored entries under src, .github, or .dude: ${describePaths(ignored)}`);
  }
}

/** @param {string} tag @returns {boolean} */
export function isStableReleaseTag(tag) {
  return typeof tag === 'string' && pickLatestReleaseTag([tag]) === tag;
}

/** @param {string} repoRoot @param {string} eventTag */
function requireTagCheckout(repoRoot, eventTag) {
  const tagCommit = runGit(
    repoRoot,
    ['rev-parse', '--verify', `refs/tags/${eventTag}^{commit}`],
    'release tag inspection',
  ).stdout.trim().toLowerCase();
  const head = runGit(repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}'], 'HEAD inspection')
    .stdout.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(tagCommit) || tagCommit !== head) {
    throw new Error('the stable release tag does not identify the checked-out commit');
  }
}

/**
 * Run the checkout's own build-dev, as it is on disk now, in a fresh Node
 * process and return that builder's structured base-release result.
 * @param {string} repoRoot
 * @returns {{ release: string | null, reason: string | null }}
 */
function runCheckoutBuildDev(repoRoot) {
  const builderUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'build-dev.mjs')).href;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', FRESH_BUILD_DEV, '--', repoRoot, builderUrl],
    { cwd: repoRoot, encoding: 'utf8', env: process.env },
  );
  if (result.error) {
    throw new Error(`build-dev could not start: ${redact(result.error.message)}`);
  }
  if (result.status !== 0) {
    const detail = redact(result.stderr || '');
    throw new Error(`build-dev failed${detail ? `: ${detail}` : ''}`);
  }
  let baseRelease;
  try {
    baseRelease = JSON.parse(result.stdout);
  } catch {
    baseRelease = null;
  }
  if (
    !baseRelease
    || typeof baseRelease !== 'object'
    || Array.isArray(baseRelease)
    || !(baseRelease.release === null || isStableReleaseTag(baseRelease.release))
    || !(baseRelease.reason === null || typeof baseRelease.reason === 'string')
  ) {
    throw new Error('build-dev returned no readable base release result');
  }
  return baseRelease;
}

/**
 * Run the checkout's current builder and allow it to change only the
 * generated record.
 * @param {string} repoRoot
 * @returns {{ changed: boolean, release: string }}
 */
export function refreshDevelopmentBase(repoRoot) {
  const baseRelease = runCheckoutBuildDev(repoRoot);
  if (!baseRelease.release) {
    throw new Error(
      `development base release evidence is unavailable: ${baseRelease.reason ?? 'unknown reason'}`,
    );
  }

  const changed = visibleChangedPaths(repoRoot);
  const unexpected = changed.filter((entry) => entry !== BASE_RELEASE_PATH);
  if (unexpected.length > 0) {
    throw new Error(
      `build-dev produced non-record drift; refusing release integration: ${describePaths(unexpected)}`,
    );
  }
  const ignored = ignoredOwnedPaths(repoRoot);
  if (ignored.length > 0) {
    throw new Error(
      `build-dev left ignored entries under src, .github, or .dude: ${describePaths(ignored)}`,
    );
  }

  const record = path.join(repoRoot, ...BASE_RELEASE_PATH.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(record);
  } catch (error) {
    throw new Error(
      `generated development base release record is missing: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('generated development base release record is not a safe regular file');
  }

  return { changed: changed.length === 1, release: baseRelease.release };
}

/**
 * Refresh metadata in the stable tag checkout used for release validation.
 * @param {{ repoRoot: string, eventTag: string }} options
 */
export function prepareReleaseCheckout({ repoRoot, eventTag }) {
  if (!isStableReleaseTag(eventTag)) return { skipped: true, changed: false, release: null };
  const root = validateRepository(repoRoot);
  requireFullHistory(root);
  requireTagCheckout(root, eventTag);
  requireCleanInput(root, 'release preparation');
  const refreshed = refreshDevelopmentBase(root);
  return { skipped: false, ...refreshed };
}

/** @param {string} repoRoot @param {string} branch */
function validateBranch(repoRoot, branch) {
  if (!branch) throw new Error('default branch must be provided');
  const result = runGit(
    repoRoot,
    ['check-ref-format', '--branch', branch],
    'default branch validation',
    { allowFailure: true },
  );
  if (result.status !== 0 || result.stdout.trim() !== branch) {
    throw new Error('default branch is not a safe Git branch name');
  }
}

/** @param {string} remote */
function validateRemote(remote) {
  if (!REMOTE_PATTERN.test(remote)) throw new Error('remote name is not safe');
}

/** @param {string} repoRoot @param {string} branch @param {string} remote */
function refreshDefaultBranch(repoRoot, branch, remote) {
  const currentBranch = runGit(
    repoRoot,
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    'current branch inspection',
  ).stdout.trim();
  if (currentBranch !== branch) {
    throw new Error('write-back checkout is not on the requested default branch');
  }
  runGit(repoRoot, ['remote', 'get-url', remote], 'write-back remote inspection');
  runGit(
    repoRoot,
    [
      'fetch',
      '--no-recurse-submodules',
      '--prune',
      '--tags',
      remote,
      `refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
    ],
    'fresh default-branch and tag fetch',
  );
  requireFullHistory(repoRoot);
  runGit(
    repoRoot,
    ['merge', '--ff-only', '--no-edit', `refs/remotes/${remote}/${branch}`],
    'fresh default-branch fast-forward',
  );
  requireCleanInput(repoRoot, 'post-fetch write-back');
}

/** @param {string} repoRoot */
function stageAndCommitRecord(repoRoot, release) {
  runGit(repoRoot, ['add', '--', BASE_RELEASE_PATH], 'development base release staging');
  const staged = nulPaths(runGit(
    repoRoot,
    ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACDMRTUXB', '--'],
    'staged path inspection',
  ).stdout);
  if (staged.length !== 1 || staged[0] !== BASE_RELEASE_PATH) {
    throw new Error(`refusing commit with unexpected staged paths: ${describePaths(staged)}`);
  }
  const allChanges = visibleChangedPaths(repoRoot);
  if (allChanges.length !== 1 || allChanges[0] !== BASE_RELEASE_PATH) {
    throw new Error(`refusing commit with unexpected checkout changes: ${describePaths(allChanges)}`);
  }

  runGit(
    repoRoot,
    [
      '-c',
      `user.name=${BOT_NAME}`,
      '-c',
      `user.email=${BOT_EMAIL}`,
      'commit',
      '-m',
      `chore: refresh development base release to ${release}`,
      '--',
      BASE_RELEASE_PATH,
    ],
    'development base release commit',
  );
  const committed = nulPaths(runGit(
    repoRoot,
    ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD^', 'HEAD'],
    'automation commit inspection',
  ).stdout);
  if (committed.length !== 1 || committed[0] !== BASE_RELEASE_PATH) {
    throw new Error(`automation commit contains unexpected paths: ${describePaths(committed)}`);
  }
  requireCleanInput(repoRoot, 'post-commit write-back');
  const commit = runGit(repoRoot, ['rev-parse', 'HEAD'], 'automation commit resolution')
    .stdout.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(commit)) throw new Error('automation commit could not be resolved');
  return commit;
}

/**
 * Refresh and persist the record from a fresh default-branch base.
 * @param {{ repoRoot: string, eventTag: string, branch: string, remote?: string }} options
 */
export function syncDevelopmentBase({
  repoRoot,
  eventTag,
  branch,
  remote = 'origin',
}) {
  if (!isStableReleaseTag(eventTag)) {
    return { skipped: true, changed: false, pushed: false, release: null, commit: null };
  }
  const root = validateRepository(repoRoot);
  validateBranch(root, branch);
  validateRemote(remote);
  requireFullHistory(root);
  requireCleanInput(root, 'development base release write-back');
  refreshDefaultBranch(root, branch, remote);

  const refreshed = refreshDevelopmentBase(root);
  if (!refreshed.changed) {
    return {
      skipped: false,
      changed: false,
      pushed: false,
      release: refreshed.release,
      commit: null,
    };
  }

  const commit = stageAndCommitRecord(root, refreshed.release);
  runGit(
    root,
    ['push', '--porcelain', remote, `HEAD:refs/heads/${branch}`],
    'non-force development base release push',
  );
  return {
    skipped: false,
    changed: true,
    pushed: true,
    release: refreshed.release,
    commit,
  };
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const command = argv[0] ?? '';
  /** @type {Record<string, string>} */
  const options = {};
  let help = command === '--help' || command === '-h';
  let error = !help && !['classify', 'prepare', 'sync'].includes(command);
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help' || key === '-h') {
      help = true;
      continue;
    }
    if (!['--tag', '--event-tag', '--repo', '--branch', '--remote', '--github-output'].includes(key)) {
      error = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--') || Object.hasOwn(options, key)) {
      error = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return { command, options, help, error };
}

/** @param {string} metaUrl @param {string | undefined} argv1 */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

function usage() {
  return [
    'usage:',
    '  node scripts/release-base-sync.mjs classify --tag <tag> [--github-output <path>]',
    '  node scripts/release-base-sync.mjs prepare --repo <path> --event-tag <tag>',
    '  node scripts/release-base-sync.mjs sync --repo <path> --event-tag <tag> --branch <branch> [--remote origin]',
    '',
  ].join('\n');
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help || parsed.error) {
    process.stdout.write(usage());
    process.exit(parsed.error ? 1 : 0);
  }
  try {
    if (parsed.command === 'classify') {
      const tag = parsed.options['--tag'];
      if (tag === undefined) throw new Error('classify requires --tag');
      const line = `stable=${isStableReleaseTag(tag) ? 'true' : 'false'}\n`;
      const output = parsed.options['--github-output'];
      if (output) fs.appendFileSync(output, line, 'utf8');
      else process.stdout.write(line);
      return;
    }

    const repoRoot = parsed.options['--repo'];
    const eventTag = parsed.options['--event-tag'];
    if (!repoRoot || eventTag === undefined) {
      throw new Error(`${parsed.command} requires --repo and --event-tag`);
    }
    if (parsed.command === 'prepare') {
      const result = prepareReleaseCheckout({ repoRoot, eventTag });
      if (result.skipped) {
        process.stdout.write('[OK] development base release refresh skipped for a nonstable tag\n');
      } else {
        process.stdout.write(
          `[OK] development base release ${result.release} ${result.changed ? 'refreshed' : 'unchanged'} for validation\n`,
        );
      }
      return;
    }

    const branch = parsed.options['--branch'];
    if (!branch) throw new Error('sync requires --branch');
    const result = syncDevelopmentBase({
      repoRoot,
      eventTag,
      branch,
      remote: parsed.options['--remote'] ?? 'origin',
    });
    if (result.skipped) {
      process.stdout.write('[OK] development base release write-back skipped for a nonstable tag\n');
    } else if (!result.changed) {
      process.stdout.write(`[OK] development base release ${result.release} already current; no commit or push\n`);
    } else {
      process.stdout.write(
        `[OK] development base release ${result.release} committed and pushed (${result.commit})\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`[ERROR] ${redact(error instanceof Error ? error.message : String(error))}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
