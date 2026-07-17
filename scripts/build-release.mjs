// @ts-check
/**
 * build-release.mjs — assemble the deployable Dude core bundle from this repo.
 *
 * The product core lives in `src/`; the release is DISTRIBUTION. This script
 * reads `src/` and stages the consumer-facing engine into `<out>/.github/...`
 * (mapping `src/<x>` -> `.github/<x>`), plus generic seeded metadata under
 * `<out>/.dude/metadata/`, so a consumer unzips the whole artifact at the repo
 * root.
 *
 * Ships: core-tier files only (the `dude` / `dude-<slug>` agents, `dude-<slug>`
 * skill directories, and `dude.instructions.md`) MINUS every test file, plus a
 * generic `project` skill stub and seeded canonical metadata.
 * Excluded: `*.test.mjs`, packs (`dude-pack-*`), project-local customizations
 * (`dude-local-*`), and everything outside the core namespace.
 *
 * Dependency-free ESM. Targets Node >= 20. Run `node build-release.mjs --help`.
 *
 * Exit codes: 0 ok, 1 usage error, 2 build error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isCorePath } from '../src/skills/dude-engine/lib/ownership.mjs';
import { WORKSPACE_PATHS } from '../src/skills/dude-engine/lib/workspace-paths.mjs';

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

/** Generic empty install profile shipped in a core release. */
export const PROFILE_STUB = `# Install Profile

This file records optional packs installed into this bundle's \`.github/\`.
It is maintained by \`dude-compose\`. Do not hand-edit the \`installed\` map.

\`\`\`json
{
  "enabled_packs": [],
  "installed": {}
}
\`\`\`
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
 * Prepare the manifest for a release artifact: force `source_ref` to the
 * release channel (`latest`) so the deployed bundle upgrades between release
 * tags, and stamp `installed_ref` with the release tag so the install
 * self-documents its version.
 * @param {string} manifest source manifest markdown
 * @param {string} [ref] the release tag, e.g. v1.2.0
 * @returns {string}
 */
export function seedManifest(manifest, ref) {
  const parsed = parseManifestDocument(manifest, 'canonical bundle-manifest');
  const data = { ...parsed.data, source_ref: 'latest' };
  if (ref) data.installed_ref = ref;
  const json = JSON.stringify(data, null, 2).replace(/\n/g, parsed.newline);
  const seeded = `${parsed.before}\`\`\`json${parsed.newline}${json}${parsed.newline}\`\`\`${parsed.after}`;
  const validated = parseManifestDocument(seeded, 'seeded bundle-manifest');
  if (validated.data.source_ref !== 'latest'
    || (ref && validated.data.installed_ref !== ref)) {
    throw new Error('seeded bundle-manifest did not preserve the requested release metadata');
  }
  return seeded;
}

/**
 * Parse and validate the one fenced JSON object in bundle-manifest Markdown.
 * @param {string | Buffer} content
 * @param {string} [label]
 * @returns {{ data: Record<string, unknown>, before: string, after: string, newline: string }}
 */
export function parseManifestDocument(content, label = 'bundle-manifest') {
  const text = String(content);
  const blocks = [...text.matchAll(/```json[^\S\r\n]*(\r?\n)([\s\S]*?)\r?\n```/g)];
  if (blocks.length !== 1) {
    throw new Error(`${label} must contain exactly one fenced JSON block (found ${blocks.length})`);
  }
  const block = blocks[0];
  let data;
  try {
    data = JSON.parse(block[2]);
  } catch (error) {
    throw new Error(`${label} JSON is malformed (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} JSON must be an object`);
  }
  for (const key of Object.keys(data)) {
    if (!['source_repo', 'source_ref', 'installed_ref'].includes(key)) {
      throw new Error(`${label} has unsupported field '${key}'`);
    }
  }
  if (typeof data.source_repo !== 'string' || !data.source_repo) {
    throw new Error(`${label} source_repo must be a non-empty string`);
  }
  if (typeof data.source_ref !== 'string' || !data.source_ref) {
    throw new Error(`${label} source_ref must be a non-empty string`);
  }
  if (data.installed_ref !== undefined && typeof data.installed_ref !== 'string') {
    throw new Error(`${label} installed_ref must be a string`);
  }
  const index = block.index ?? 0;
  return {
    data,
    before: text.slice(0, index),
    after: text.slice(index + block[0].length),
    newline: block[1],
  };
}

/**
 * Re-read and validate the metadata actually emitted into the staging tree.
 * @param {string} stagingDir
 * @param {string} [ref]
 */
function validateStagedMetadata(stagingDir, ref) {
  const manifestPath = path.join(stagingDir, ...WORKSPACE_PATHS.BUNDLE_MANIFEST.split('/'));
  const manifest = parseManifestDocument(fs.readFileSync(manifestPath, 'utf8'), 'staged bundle-manifest');
  if (manifest.data.source_ref !== 'latest'
    || (ref && manifest.data.installed_ref !== ref)) {
    throw new Error('staged release metadata does not match the requested release metadata');
  }
}

/**
 * Read and validate the canonical manifest used to seed dev/release output.
 * @param {string} repoRoot
 * @returns {{ path: string, content: string, data: Record<string, unknown> }}
 */
export function readCanonicalManifest(repoRoot) {
  const metadataDir = path.join(repoRoot, ...WORKSPACE_PATHS.METADATA_DIR.split('/'));
  const manifestPath = path.join(repoRoot, ...WORKSPACE_PATHS.BUNDLE_MANIFEST.split('/'));
  for (const [label, absolutePath, kind] of [
    [WORKSPACE_PATHS.ROOT, path.join(repoRoot, WORKSPACE_PATHS.ROOT), 'directory'],
    [WORKSPACE_PATHS.METADATA_DIR, metadataDir, 'directory'],
    [WORKSPACE_PATHS.BUNDLE_MANIFEST, manifestPath, 'file'],
  ]) {
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`canonical bundle-manifest metadata is required at ${WORKSPACE_PATHS.BUNDLE_MANIFEST}`);
      }
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`canonical metadata path must not be a symbolic link: ${label}`);
    if ((kind === 'directory' && !stat.isDirectory()) || (kind === 'file' && !stat.isFile())) {
      throw new Error(`canonical metadata ${label} must be a regular ${kind}`);
    }
  }

  const content = fs.readFileSync(manifestPath, 'utf8');
  const parsed = parseManifestDocument(content, 'canonical bundle-manifest');
  return { path: manifestPath, content, data: parsed.data };
}

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
 * Resolve symlinked existing ancestors while preserving any missing suffix.
 * @param {string} absolutePath
 * @returns {string}
 */
function resolveThroughExistingAncestor(absolutePath) {
  let cursor = path.resolve(absolutePath);
  /** @type {string[]} */
  const missing = [];
  while (!lstatOrNull(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`cannot resolve an existing ancestor for output: ${absolutePath}`);
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(fs.realpathSync(cursor), ...missing);
}

/** @param {string} parent @param {string} candidate @returns {boolean} */
function containsPath(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** @param {string} first @param {string} second @returns {boolean} */
function pathsOverlap(first, second) {
  return containsPath(first, second) || containsPath(second, first);
}

/**
 * Reject any output that could replace repository inputs or project state.
 * The historical in-repository `dist/` directory remains the sole exception.
 * @param {{ repoRoot: string, outDir: string }} opts
 * @returns {{ repoRoot: string, outDir: string }}
 */
export function validateReleaseOutput({ repoRoot, outDir }) {
  const lexicalRepo = path.resolve(repoRoot);
  const lexicalOut = path.resolve(outDir);
  const repoStat = lstatOrNull(lexicalRepo);
  if (!repoStat) throw new Error(`repository root does not exist: ${lexicalRepo}`);
  const realRepo = fs.realpathSync(lexicalRepo);
  const realOut = resolveThroughExistingAncestor(lexicalOut);
  if (lstatOrNull(lexicalOut)?.isSymbolicLink()) {
    throw new Error(`unsafe release output is a symbolic link: ${lexicalOut}`);
  }
  if (containsPath(lexicalOut, lexicalRepo) || containsPath(realOut, realRepo)) {
    throw new Error(`unsafe release output overlaps repository root: ${lexicalOut}`);
  }

  const lexicalDist = path.join(lexicalRepo, 'dist');
  const realDist = path.join(realRepo, 'dist');
  const insideRepo = containsPath(lexicalRepo, lexicalOut) || containsPath(realRepo, realOut);
  if (insideRepo && (lexicalOut !== lexicalDist || realOut !== realDist)) {
    throw new Error(`unsafe release output overlaps repository inputs; only ${lexicalDist} is allowed inside the repository`);
  }

  for (const entry of fs.readdirSync(lexicalRepo, { withFileTypes: true })) {
    if (entry.name === 'dist') continue;
    const lexicalInput = path.join(lexicalRepo, entry.name);
    const realInput = fs.realpathSync(lexicalInput);
    if (pathsOverlap(lexicalOut, lexicalInput) || pathsOverlap(realOut, realInput)) {
      throw new Error(`unsafe release output overlaps repository input '${entry.name}': ${lexicalOut}`);
    }
  }
  return { repoRoot: lexicalRepo, outDir: lexicalOut };
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
 * @param {{ repoRoot: string, outDir: string, ref?: string }} opts
 * @returns {{ files: string[], out: string }}
 */
export function buildRelease({ repoRoot, outDir, ref }) {
  const approved = validateReleaseOutput({ repoRoot, outDir });
  repoRoot = approved.repoRoot;
  outDir = approved.outDir;
  const srcDir = path.join(repoRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`no src/ under repo root: ${repoRoot}`);
  }
  const canonicalManifest = readCanonicalManifest(repoRoot);
  const seeded = seedManifest(canonicalManifest.content, ref);
  parseManifestDocument(seeded, 'seeded bundle-manifest');

  const outputParent = path.dirname(outDir);
  fs.mkdirSync(outputParent, { recursive: true });
  validateReleaseOutput({ repoRoot, outDir });
  const stagingDir = fs.mkdtempSync(path.join(outputParent, `.${path.basename(outDir)}.staging-`));

  /** @type {string[]} */
  const written = [];
  try {
    for (const { abs, deployRel } of listCoreSourceFiles(repoRoot)) {
      const dest = path.join(stagingDir, deployRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
      written.push(deployRel);
    }

    const projRel = '.github/skills/project/SKILL.md';
    const projDest = path.join(stagingDir, projRel);
    fs.mkdirSync(path.dirname(projDest), { recursive: true });
    fs.writeFileSync(projDest, PROJECT_STUB);
    written.push(projRel);

    const manRel = WORKSPACE_PATHS.BUNDLE_MANIFEST;
    const manDest = path.join(stagingDir, manRel);
    fs.mkdirSync(path.dirname(manDest), { recursive: true });
    fs.writeFileSync(manDest, seeded);
    written.push(manRel);

    const profileRel = WORKSPACE_PATHS.PROFILE;
    const profileDest = path.join(stagingDir, ...WORKSPACE_PATHS.PROFILE.split('/'));
    fs.mkdirSync(path.dirname(profileDest), { recursive: true });
    fs.writeFileSync(profileDest, PROFILE_STUB);
    written.push(profileRel);

    validateStagedMetadata(stagingDir, ref);

    const backup = path.join(outputParent, `.${path.basename(outDir)}.backup-${randomUUID()}`);
    const previous = lstatOrNull(outDir);
    if (previous) fs.renameSync(outDir, backup);
    try {
      fs.renameSync(stagingDir, outDir);
    } catch (error) {
      if (previous) {
        try {
          fs.renameSync(backup, outDir);
        } catch (rollbackError) {
          throw new Error(
            `release output replacement failed and rollback failed; previous output remains at ${backup} (${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)})`,
            { cause: error },
          );
        }
      }
      throw error;
    }
    if (previous) fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  written.sort();
  return { files: written, out: outDir };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = { repo: '.', out: 'dist', tag: '', help: false, error: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--repo') out.repo = String(argv[++i] ?? '');
    else if (a === '--out') out.out = String(argv[++i] ?? '');
    else if (a === '--tag') out.tag = String(argv[++i] ?? '');
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
      'usage: node build-release.mjs [--repo .] [--out dist] [--tag <release-tag>]\n'
    );
    process.exit(a.error ? 1 : 0);
  }
  try {
    const repoRoot = path.resolve(a.repo);
    const outDir = path.resolve(a.out);
    const r = buildRelease({ repoRoot, outDir, ref: a.tag });
    process.stdout.write(`[OK] staged ${r.files.length} file(s) -> ${r.out}\n`);
  } catch (e) {
    process.stderr.write(`[ERROR] ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();
