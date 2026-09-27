// @ts-check
/**
 * build-dev.mjs — materialize this repo's dev bundle under `.github/`.
 *
 * The product core lives in `src/`. For the maintainer's own `@dude` to work
 * (Copilot discovers agents / skills / instructions under `.github/`), this
 * script syncs the core from `src/` into `.github/` (mapping `src/<x>` ->
 * `.github/<x>`, minus test files). Each `src/agents/*.agent.md` is projected
 * into one Copilot profile under `.github/agents/` instead of being byte-copied.
 * `src/` is edited; `.github/` is the built, committed dev bundle.
 *
 * It manages core-tier files and never changes canonical project data:
 * `.github/skills/project/`, `.github/workflows/`, all other `.dude/` data,
 * installed packs (`dude-pack-*`), or local customizations (`dude-local-*`)
 * persist. Packs are installed separately via `compose add`.
 *
 * The one generated metadata file is `.dude/metadata/development-base-release.md`.
 * For a development manifest (`installed_ref: main`) it records the highest
 * stable release tag merged into the build root's current commit, using only
 * that exact Git checkout's local history. Missing Git, another repository's
 * root, shallow history, or no reachable stable tag leave the base unknown,
 * so the build removes any earlier record instead of guessing. It never
 * fetches, deepens history, or consults a parent or remote repository.
 *
 * Run it after editing `src/` or after the source's reachable release tags
 * change; CI runs it and fails if the output would change (the dev-bundle
 * drift check).
 *
 * Dependency-free ESM. Targets Node >= 20. Exit codes: 0 ok, 1 usage, 2 error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isCorePath } from '../src/skills/dude-engine/lib/ownership.mjs';
import { listCoreOutputs, readCanonicalManifest, writeCoreOutput } from './build-release.mjs';
import { pickLatestReleaseTag } from '../src/skills/dude-engine/lib/release-channel.mjs';
import {
  DEVELOPMENT_INSTALLED_REF,
  renderDevelopmentBaseRelease,
  validateDevelopmentBaseRelease,
} from '../src/skills/dude-engine/lib/development-base-release.mjs';
import { WORKSPACE_PATHS, resolveMutationPath } from '../src/skills/dude-engine/lib/workspace-paths.mjs';

const BASE_RELEASE_RECORD = WORKSPACE_PATHS.DEVELOPMENT_BASE_RELEASE;
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

const BUILD_DESTINATION_DIRS = [
  '.github',
  '.github/agents',
  '.github/skills',
  '.github/instructions',
  '.github/extensions',
  '.github/extensions/dude',
];

/** @param {string} absolutePath @returns {fs.Stats | null} */
function lstatOrNull(absolutePath) {
  try {
    return fs.lstatSync(absolutePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Validate the fixed build boundary before enumerating cleanup candidates.
 * @param {string} repoRoot
 */
function preflightBuildDirectories(repoRoot) {
  for (const relPath of BUILD_DESTINATION_DIRS) {
    let absolutePath;
    try {
      absolutePath = resolveMutationPath(repoRoot, relPath);
    } catch (error) {
      throw new Error(`unsafe build-dev destination '${relPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
    const stat = lstatOrNull(absolutePath);
    if (stat && !stat.isDirectory()) {
      throw new Error(`unsafe build-dev destination '${relPath}' must be a directory`);
    }
  }
}

/**
 * Recheck every fixed and computed mutation destination as one preflight.
 * @param {string} repoRoot
 * @param {string[]} relPaths
 */
function preflightBuildDestinations(repoRoot, relPaths) {
  preflightBuildDirectories(repoRoot);
  for (const relPath of [...new Set(relPaths)].sort()) {
    try {
      resolveMutationPath(repoRoot, relPath);
    } catch (error) {
      throw new Error(`unsafe build-dev destination '${relPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * List every core-tier path that cleanup would remove.
 *
 * The generated agent tree is filtered by the same namespace classification
 * every other bundle path uses, so pack-tier (`dude-pack-*`),
 * local-tier (`dude-local-*`), and project-tier files are left untouched.
 * @param {string} repoRoot
 * @returns {string[]}
 */
function listCoreRemovalPaths(repoRoot) {
  /** @type {string[]} */
  const removals = [];

  const agentsDir = path.join(repoRoot, '.github', 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir)) {
      const relPath = `.github/agents/${entry}`;
      if (isCorePath(relPath)) removals.push(relPath);
    }
  }

  const instructionsDir = path.join(repoRoot, '.github/instructions');
  if (fs.existsSync(instructionsDir)) {
    for (const entry of fs.readdirSync(instructionsDir)) {
      const relPath = `.github/instructions/${entry}`;
      if (isCorePath(relPath)) removals.push(relPath);
    }
  }

  const skillsDir = path.join(repoRoot, '.github/skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      const relPath = `.github/skills/${entry}`;
      if (isCorePath(`${relPath}/`)) removals.push(relPath);
    }
  }

  const dudeExtensionDir = path.join(repoRoot, '.github', 'extensions', 'dude');
  if (fs.existsSync(dudeExtensionDir)) removals.push('.github/extensions/dude');

  return removals.sort();
}

/** @param {string} repoRoot @param {string[]} removals @returns {string[]} */
function applyCoreCleanup(repoRoot, removals) {
  for (const relPath of removals) {
    fs.rmSync(path.join(repoRoot, ...relPath.split('/')), { recursive: true, force: true });
  }
  return [...removals];
}

/**
 * Resolve the fixed record destination through the mutation boundary. It may
 * be absent or a regular file; linked, escaping, and other types are refused.
 * @param {string} repoRoot
 * @returns {string}
 */
function resolveBaseReleaseDestination(repoRoot) {
  let absolutePath;
  try {
    absolutePath = resolveMutationPath(repoRoot, BASE_RELEASE_RECORD);
  } catch (error) {
    throw new Error(`unsafe build-dev destination '${BASE_RELEASE_RECORD}': ${error instanceof Error ? error.message : String(error)}`);
  }
  const stat = lstatOrNull(absolutePath);
  if (stat && !stat.isFile()) {
    throw new Error(`unsafe build-dev destination '${BASE_RELEASE_RECORD}' must be a regular file`);
  }
  return absolutePath;
}

/** @param {string} first @param {string} second @returns {boolean} */
function sameDirectory(first, second) {
  try {
    return fs.realpathSync.native(path.resolve(first)) === fs.realpathSync.native(path.resolve(second));
  } catch {
    return false;
  }
}

/**
 * Read the source checkout's own release evidence: the highest stable tag
 * merged into the exact build root's current commit, by numeric version.
 * Anything short of complete local evidence is unknown provenance.
 * @param {string} repoRoot
 * @returns {{ release: string | null, reason: string | null }}
 */
function readSourceBaseRelease(repoRoot) {
  /** @param {string} reason */
  const unknown = (reason) => ({ release: null, reason });
  /** @param {string[]} args */
  const git = (args) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

  const topLevel = git(['rev-parse', '--show-toplevel']);
  if (topLevel.error) return unknown('Git is unavailable');
  if (topLevel.status !== 0) return unknown('the build root is not a readable Git repository');
  if (!sameDirectory(topLevel.stdout.trim(), repoRoot)) return unknown('the Git root is not the build root');
  const shallow = git(['rev-parse', '--is-shallow-repository']);
  const shallowState = shallow.status === 0 ? shallow.stdout.trim() : '';
  if (shallowState !== 'true' && shallowState !== 'false') {
    return unknown('Git history completeness could not be confirmed');
  }
  if (shallowState === 'true') return unknown('Git history is shallow');
  const head = git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  const commit = head.status === 0 ? head.stdout.trim().toLowerCase() : '';
  if (!COMMIT_PATTERN.test(commit)) return unknown('the build root has no current commit');
  const tags = git(['tag', '--merged', commit, '--list', 'v*']);
  if (tags.status !== 0) return unknown('release tags could not be listed');
  const release = pickLatestReleaseTag(tags.stdout.split('\n'));
  return release ? { release, reason: null } : unknown('no stable release tag is merged into the current commit');
}

/**
 * Decide the record this build leaves, before any cleanup. Only a development
 * manifest carries a base, associated with that manifest's exact source.
 * @param {string} repoRoot
 * @param {Record<string, unknown>} manifest
 * @returns {{ record: Readonly<{ source_repo: string, base_release: string }> | null, release: string | null, reason: string | null }}
 */
function planBaseReleaseRecord(repoRoot, manifest) {
  if (manifest.installed_ref !== DEVELOPMENT_INSTALLED_REF) {
    return { record: null, release: null, reason: `installed_ref is not ${DEVELOPMENT_INSTALLED_REF}` };
  }
  const evidence = readSourceBaseRelease(repoRoot);
  if (!evidence.release) return { record: null, ...evidence };
  try {
    const record = validateDevelopmentBaseRelease({
      source_repo: manifest.source_repo,
      base_release: evidence.release,
    });
    return { record, ...evidence };
  } catch {
    return { record: null, release: null, reason: 'the manifest source_repo cannot identify a base release record' };
  }
}

/**
 * Leave the fixed record matching the computed provenance: write a known base
 * only when its bytes differ, and remove any record when the base is unknown.
 * @param {string} repoRoot
 * @param {Readonly<{ source_repo: string, base_release: string }> | null} record
 * @returns {'written' | 'removed' | null}
 */
function reconcileBaseReleaseRecord(repoRoot, record) {
  const destination = resolveBaseReleaseDestination(repoRoot);
  const current = lstatOrNull(destination);
  if (!record) {
    if (!current) return null;
    fs.rmSync(destination);
    return 'removed';
  }
  const bytes = Buffer.from(renderDevelopmentBaseRelease(record), 'utf8');
  if (current && fs.readFileSync(destination).equals(bytes)) return null;
  fs.writeFileSync(destination, bytes);
  return 'written';
}

/**
 * Sync the core from `src/` into `.github/` and reconcile the development
 * base-release record. `written` and `removed` include that record only when
 * it actually changed; `baseRelease` reports the recorded tag or why none is.
 * @param {{ repoRoot: string }} opts
 * @returns {{ written: string[], removed: string[], baseRelease: { release: string | null, reason: string | null } }}
 */
export function buildDev({ repoRoot }) {
  const srcDir = path.join(repoRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`no src/ under repo root: ${repoRoot}`);
  }
  const outputs = listCoreOutputs(repoRoot);
  preflightBuildDirectories(repoRoot);
  const removals = listCoreRemovalPaths(repoRoot);
  const generatedDestinations = outputs.map(({ relPath }) => relPath);
  preflightBuildDestinations(repoRoot, [...removals, ...generatedDestinations]);

  const manifest = readCanonicalManifest(repoRoot);
  resolveBaseReleaseDestination(repoRoot);
  const baseRelease = planBaseReleaseRecord(repoRoot, manifest.data);
  const removed = applyCoreCleanup(repoRoot, removals);

  /** @type {string[]} */
  const written = [];
  for (const output of outputs) {
    writeCoreOutput(repoRoot, output);
    written.push(output.relPath);
  }

  const recordChange = reconcileBaseReleaseRecord(repoRoot, baseRelease.record);
  if (recordChange === 'written') written.push(BASE_RELEASE_RECORD);
  if (recordChange === 'removed') removed.push(BASE_RELEASE_RECORD);

  return {
    written: written.sort(),
    removed: removed.sort(),
    baseRelease: { release: baseRelease.release, reason: baseRelease.reason },
  };
}

/** @param {string} metaUrl @param {string|undefined} argv1 @returns {boolean} */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('usage: node build-dev.mjs [--repo .]\n');
    process.exit(0);
  }
  const i = args.indexOf('--repo');
  const repoRoot = path.resolve(i >= 0 ? String(args[i + 1] ?? '.') : '.');
  try {
    const r = buildDev({ repoRoot });
    const recordWritten = r.written.includes(BASE_RELEASE_RECORD);
    const recordRemoved = r.removed.includes(BASE_RELEASE_RECORD);
    const baseRelease = r.baseRelease.release
      ? `development base release ${r.baseRelease.release} ${recordWritten ? 'recorded' : 'unchanged'}`
      : `development base release unknown (${r.baseRelease.reason})${recordRemoved ? '; earlier record removed' : ''}`;
    process.stdout.write(
      `[OK] dev bundle: ${r.written.length - (recordWritten ? 1 : 0)} core file(s) synced, `
      + `${r.removed.length - (recordRemoved ? 1 : 0)} removed; ${baseRelease}\n`,
    );
  } catch (e) {
    process.stderr.write(`[ERROR] ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
