// @ts-check
/**
 * build-release.mjs — assemble the deployable Dude core bundle from this repo.
 *
 * The product core lives in `src/`; the release is DISTRIBUTION. This script
 * reads `src/` and stages the consumer-facing bundle into `<out>/.github/...`
 * (mapping `src/<x>` -> `.github/<x>`), so a consumer unzips it at their repo
 * root and the files land in `.github/`.
 *
 * Ships: core-tier files only (the `dude` / `dude-<slug>` agents, `dude-<slug>`
 * skill directories, and `dude.instructions.md`) MINUS every test file, plus a
 * generic `project` skill stub and a seeded bundle manifest.
 * Excluded: `*.test.mjs`, packs (`dude-pack-*`), project-local customizations
 * (`dude-local-*`), and everything outside the core namespace.
 *
 * Dependency-free ESM. Targets Node >= 20. Run `node build-release.mjs --help`.
 *
 * Exit codes: 0 ok, 1 usage error, 2 build error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCorePath } from '../src/skills/dude-engine/lib/ownership.mjs';

/** Generic project-knowledge stub shipped in a fresh bundle. */
export const PROJECT_STUB = `---
name: "project"
description: "Project-specific domain knowledge, conventions, and patterns. Update this skill as the project evolves so Dude and specialists can use it as shared context."
---

# Project Knowledge

Fill this in as your project takes shape so Dude and its specialists share the
same context. Suggested sections:

## Project Shape

- Domain / purpose:
- Primary artifacts and where they live:
- Key technologies:

## Working Conventions

- Coding standards, naming, and structure:
- Build / test / run commands:
- Review and merge expectations:

## Glossary

- Domain terms and their meaning:
`;

/**
 * True if a repo-relative path belongs in the released core bundle: core-tier
 * (`dude` / `dude-<slug>`) and not a test file.
 * @param {string} relPath
 * @returns {boolean}
 */
export function isReleaseFile(relPath) {
  const p = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');
  if (/\.test\.(mjs|cjs|js)$/.test(p)) return false;
  return isCorePath(p);
}

/**
 * Rewrite the manifest's `installed_sha` / `installed_at` when a release commit
 * is known, so a freshly-deployed bundle records the commit it was cut from.
 * @param {string} manifest source manifest markdown
 * @param {string} [sha]
 * @param {string} [at] ISO timestamp
 * @returns {string}
 */
export function seedManifest(manifest, sha, at) {
  let out = manifest;
  if (sha) out = out.replace(/("installed_sha":\s*)"[^"]*"/, `$1"${sha}"`);
  if (at) out = out.replace(/("installed_at":\s*)"[^"]*"/, `$1"${at}"`);
  return out;
}

/**
 * Recursively list files under a directory (absolute paths).
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

/**
 * Map a `src/`-relative path to its deployed `.github/` path.
 * @param {string} srcRel
 * @returns {string}
 */
export function srcToDeploy(srcRel) {
  return String(srcRel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^src\//, '.github/');
}

/**
 * List core-tier source files under `src/`, paired with their deployed
 * `.github/` paths. Shared by the release build and the dev-bundle build.
 * @param {string} repoRoot
 * @returns {{ abs: string, deployRel: string }[]}
 */
export function listCoreSourceFiles(repoRoot) {
  const srcDir = path.join(repoRoot, 'src');
  /** @type {{ abs: string, deployRel: string }[]} */
  const out = [];
  for (const abs of walk(srcDir)) {
    const srcRel = path.relative(repoRoot, abs).replace(/\\/g, '/');
    const deployRel = srcToDeploy(srcRel);
    if (isReleaseFile(deployRel)) out.push({ abs, deployRel });
  }
  return out;
}

/**
 * Stage the release bundle into `<outDir>/.github/...` from `src/`.
 * @param {{ repoRoot: string, outDir: string, sha?: string, at?: string }} opts
 * @returns {{ files: string[], out: string }}
 */
export function buildRelease({ repoRoot, outDir, sha, at }) {
  const srcDir = path.join(repoRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`no src/ under repo root: ${repoRoot}`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });

  /** @type {string[]} */
  const written = [];
  for (const { abs, deployRel } of listCoreSourceFiles(repoRoot)) {
    const dest = path.join(outDir, deployRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    written.push(deployRel);
  }

  // Seed: generic project skill stub (replaces this repo's own project knowledge).
  const projRel = '.github/skills/project/SKILL.md';
  const projDest = path.join(outDir, projRel);
  fs.mkdirSync(path.dirname(projDest), { recursive: true });
  fs.writeFileSync(projDest, PROJECT_STUB);
  written.push(projRel);

  // Seed: bundle manifest (required by lint; carries the upstream source pin).
  // The template still lives in .github/dudestuff (dev state), not src/.
  const manRel = '.github/dudestuff/bundle-manifest.md';
  const manSrc = path.join(repoRoot, '.github', 'dudestuff', 'bundle-manifest.md');
  if (fs.existsSync(manSrc)) {
    const seeded = seedManifest(fs.readFileSync(manSrc, 'utf8'), sha, at);
    const manDest = path.join(outDir, manRel);
    fs.mkdirSync(path.dirname(manDest), { recursive: true });
    fs.writeFileSync(manDest, seeded);
    written.push(manRel);
  }

  written.sort();
  return { files: written, out: path.join(outDir, '.github') };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = { repo: '.', out: 'dist', sha: '', at: '', help: false, error: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--repo') out.repo = String(argv[++i] ?? '');
    else if (a === '--out') out.out = String(argv[++i] ?? '');
    else if (a === '--sha') out.sha = String(argv[++i] ?? '');
    else if (a === '--at') out.at = String(argv[++i] ?? '');
    else out.error = true;
  }
  return out;
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
  const a = parseArgs(process.argv.slice(2));
  if (a.help || a.error) {
    process.stdout.write(
      'usage: node build-release.mjs [--repo .] [--out dist] [--sha <commit>] [--at <iso>]\n'
    );
    process.exit(a.error ? 1 : 0);
  }
  try {
    const repoRoot = path.resolve(a.repo);
    const outDir = path.resolve(a.out);
    const at = a.at || new Date().toISOString();
    const r = buildRelease({ repoRoot, outDir, sha: a.sha, at });
    process.stdout.write(`[OK] staged ${r.files.length} file(s) -> ${r.out}\n`);
  } catch (e) {
    process.stderr.write(`[ERROR] ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
