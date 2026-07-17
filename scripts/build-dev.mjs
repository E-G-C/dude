// @ts-check
/**
 * build-dev.mjs — materialize this repo's dev bundle under `.github/`.
 *
 * The product core lives in `src/`. For the maintainer's own `@dude` to work
 * (Copilot discovers agents / skills / instructions under `.github/`), this
 * script syncs the core from `src/` into `.github/` (mapping `src/<x>` ->
 * `.github/<x>`, minus test files). `src/` is edited; `.github/` is the built,
 * committed dev bundle.
 *
 * It manages core-tier files and never changes canonical project data:
 * `.github/skills/project/`, `.github/workflows/`, all `.dude/` data, installed
 * packs (`dude-pack-*`), or local customizations (`dude-local-*`) persist. Packs
 * are installed separately via `compose add`.
 *
 * Run it after editing `src/`; CI runs it and fails if `.github/` would change
 * (the dev-bundle drift check).
 *
 * Dependency-free ESM. Targets Node >= 20. Exit codes: 0 ok, 1 usage, 2 error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCorePath } from '../src/skills/dude-engine/lib/ownership.mjs';
import { listCoreSourceFiles, readCanonicalManifest } from './build-release.mjs';
import { resolveMutationPath } from '../src/skills/dude-engine/lib/workspace-paths.mjs';

const BUILD_DESTINATION_DIRS = [
  '.github',
  '.github/agents',
  '.github/skills',
  '.github/instructions',
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
 * @param {string} repoRoot
 * @returns {string[]}
 */
function listCoreRemovalPaths(repoRoot) {
  /** @type {string[]} */
  const removals = [];
  const gh = path.join(repoRoot, '.github');

  for (const sub of ['agents', 'instructions']) {
    const dir = path.join(gh, sub);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const relPath = `.github/${sub}/${entry}`;
      if (isCorePath(relPath)) removals.push(relPath);
    }
  }

  const skillsDir = path.join(gh, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      const relPath = `.github/skills/${entry}`;
      if (isCorePath(`${relPath}/`)) removals.push(relPath);
    }
  }

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
 * Remove every core-tier file currently under `.github/` so a file removed from
 * `src/` does not linger in the built bundle. Leaves packs, local, project,
 * workflows, and all project workspace data under `.dude/` untouched.
 * @param {string} repoRoot
 * @returns {string[]} removed repo-relative paths
 */
export function cleanCore(repoRoot) {
  preflightBuildDirectories(repoRoot);
  const removals = listCoreRemovalPaths(repoRoot);
  preflightBuildDestinations(repoRoot, removals);
  return applyCoreCleanup(repoRoot, removals);
}

/**
 * Sync the core from `src/` into `.github/`.
 * @param {{ repoRoot: string }} opts
 * @returns {{ written: string[], removed: string[] }}
 */
export function buildDev({ repoRoot }) {
  const srcDir = path.join(repoRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`no src/ under repo root: ${repoRoot}`);
  }
  const sourceFiles = listCoreSourceFiles(repoRoot);
  preflightBuildDirectories(repoRoot);
  const removals = listCoreRemovalPaths(repoRoot);
  const generatedDestinations = sourceFiles.map(({ deployRel }) => deployRel);
  preflightBuildDestinations(repoRoot, [...removals, ...generatedDestinations]);

  readCanonicalManifest(repoRoot);
  const removed = applyCoreCleanup(repoRoot, removals);

  /** @type {string[]} */
  const written = [];
  for (const { abs, deployRel } of sourceFiles) {
    const dest = path.join(repoRoot, deployRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    written.push(deployRel);
  }

  return { written: written.sort(), removed };
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
    process.stdout.write(
      `[OK] dev bundle: ${r.written.length} core file(s) synced, ${r.removed.length} removed\n`
    );
  } catch (e) {
    process.stderr.write(`[ERROR] ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
