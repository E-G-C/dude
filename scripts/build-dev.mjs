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
 * It ONLY manages core-tier files. It never touches project-owned or dev-owned
 * content: `.github/skills/project/`, `.github/dudestuff/`, `.github/workflows/`,
 * installed packs (`dude-pack-*`), or local customizations (`dude-local-*`) —
 * those persist. The authoring pack is installed separately via `compose add`.
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
import { listCoreSourceFiles } from './build-release.mjs';

/**
 * Remove every core-tier file currently under `.github/` so a file removed from
 * `src/` does not linger in the built bundle. Leaves packs, local, project,
 * dudestuff, and workflows untouched.
 * @param {string} repoRoot
 * @returns {string[]} removed repo-relative paths
 */
export function cleanCore(repoRoot) {
  /** @type {string[]} */
  const removed = [];
  const gh = path.join(repoRoot, '.github');

  // agents + instructions: flat files
  for (const [sub, isDirEntry] of [
    ['agents', false],
    ['instructions', false],
  ]) {
    const dir = path.join(gh, String(sub));
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir)) {
      const relp = `.github/${sub}/${e}`;
      if (isCorePath(relp)) {
        fs.rmSync(path.join(dir, e), { force: true });
        removed.push(relp);
      }
    }
  }

  // skills: directories (classify by the directory)
  const skillsDir = path.join(gh, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const e of fs.readdirSync(skillsDir)) {
      if (isCorePath(`.github/skills/${e}/`)) {
        fs.rmSync(path.join(skillsDir, e), { recursive: true, force: true });
        removed.push(`.github/skills/${e}`);
      }
    }
  }

  return removed.sort();
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
  const removed = cleanCore(repoRoot);

  /** @type {string[]} */
  const written = [];
  for (const { abs, deployRel } of listCoreSourceFiles(repoRoot)) {
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
