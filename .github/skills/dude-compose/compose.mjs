#!/usr/bin/env node
// @ts-check
/**
 * dude-compose — install / remove optional capability packs from the local
 * pack catalog (`library/packs/<name>/`) into a bundle's `.github/`.
 *
 * This is core engine plumbing (the "lego baseplate"): it copies a pack's
 * `dude-pack-<name>-*` artifacts into `.github/`, records the install in
 * `.github/dudestuff/profile.md`, and removes exactly what it installed. The
 * `dude-pack-*` namespace is preserved across `@dude upgrade`, so installed
 * packs survive core refreshes.
 *
 * Dependency-free ESM. Targets Node >= 20. Run `node compose.mjs --help`.
 *
 * Commands:
 *   list                 available packs (catalog) + installed flag
 *   status               installed packs (from profile)
 *   add <name>           install pack <name> into .github/ (local catalog, or
 *                        fetched from the bundle's upstream source when absent)
 *   remove <name>        uninstall pack <name> (delete what was installed)
 *   verify               temp-install + lint every catalog pack (source lint)
 *
 * Flags:
 *   --root <dir>      bundle root (default: cwd). `.github` lives at <root>/.github
 *   --library <dir>   pack catalog dir (default: <root>/library/packs)
 *   --source <repo>   upstream source for the add fetch fallback (default: the
 *                     bundle manifest's source_repo)
 *   --ref <ref>       upstream ref for the fetch fallback (default: manifest / main)
 *   --no-fetch        never fetch; require the pack in the local catalog
 *   --json            machine-readable output
 *   --force           overwrite existing destination files on add
 *
 * Exit codes: 0 ok, 1 usage error, 2 operation error.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { belongsToPack } from '../dude-engine/lib/ownership.mjs';

const PACK_NAME_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const COPY_DIRS = ['agents', 'skills', 'instructions', 'prompts'];
const CACHE_ROOT = path.join(os.tmpdir(), 'dude-compose-cache');

/** @typedef {{ enabled_packs: string[], installed: Record<string, { files: string[], installed_at: string }> }} Profile */

/* ------------------------------------------------------------------ utils */

/** @param {string} p @returns {string} */
function rel(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** @param {string} abs @returns {boolean} */
function exists(abs) {
  try {
    fs.statSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} abs @returns {boolean} */
function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Recursively copy a file or directory.
 * @param {string} src
 * @param {string} dest
 */
function copyRecursive(src, dest) {
  if (isDir(src)) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

/** @param {string} abs */
function removePath(abs) {
  fs.rmSync(abs, { recursive: true, force: true });
}

/**
 * Parse the leading `--- ... ---` YAML-ish frontmatter for a top-level
 * `name:` scalar. Intentionally minimal (no YAML dependency).
 * @param {string} text
 * @returns {string | null}
 */
function frontmatterName(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^name\s*:/.test(l));
  if (!line) return null;
  return line
    .replace(/^name\s*:/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/* ---------------------------------------------------------------- profile */

/**
 * @param {string} root
 * @returns {string}
 */
function profilePath(root) {
  return path.join(root, '.github', 'dudestuff', 'profile.md');
}

/**
 * Read and parse the install profile. Missing/unparseable -> empty profile.
 * @param {string} root
 * @returns {Profile}
 */
function readProfile(root) {
  const p = profilePath(root);
  /** @type {Profile} */
  const empty = { enabled_packs: [], installed: {} };
  if (!exists(p)) return empty;
  const text = fs.readFileSync(p, 'utf8');
  const block = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(text);
  if (!block) return empty;
  try {
    const parsed = JSON.parse(block[1]);
    return {
      enabled_packs: Array.isArray(parsed.enabled_packs) ? parsed.enabled_packs : [],
      installed: parsed.installed && typeof parsed.installed === 'object' ? parsed.installed : {},
    };
  } catch {
    return empty;
  }
}

/**
 * Serialize and write the profile as a stable, human-readable markdown file.
 * @param {string} root
 * @param {Profile} profile
 */
function writeProfile(root, profile) {
  const enabled = [...new Set(profile.enabled_packs)].sort();
  /** @type {Record<string, { files: string[], installed_at: string }>} */
  const installed = {};
  for (const name of Object.keys(profile.installed).sort()) {
    const e = profile.installed[name];
    installed[name] = { files: [...e.files].sort(), installed_at: e.installed_at };
  }
  const json = JSON.stringify({ enabled_packs: enabled, installed }, null, 2);
  const body = `# Install Profile

This file records which optional **packs** from \`library/packs/\` are installed
into this bundle's \`.github/\`. It is maintained by \`dude-compose\`
(\`@dude add pack <name>\` / \`@dude remove pack <name>\`). Do not hand-edit the
\`installed\` map — it is the removal manifest.

\`\`\`json
${json}
\`\`\`

## Notes

- \`enabled_packs\` — names of installed packs (sorted).
- \`installed.<name>.files\` — the exact top-level destination paths written for
  that pack; \`remove\` deletes precisely these.
- Installed pack artifacts use the \`dude-pack-<name>-*\` namespace, which
  \`@dude upgrade\` preserves across core refreshes.
`;
  ensureDir(path.dirname(profilePath(root)));
  fs.writeFileSync(profilePath(root), body);
}

/* ------------------------------------------------------------------ catalog */

/**
 * List available pack names in the catalog (dirs containing pack.md).
 * @param {string} libraryDir
 * @returns {string[]}
 */
function availablePacks(libraryDir) {
  if (!isDir(libraryDir)) return [];
  return fs
    .readdirSync(libraryDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists(path.join(libraryDir, e.name, 'pack.md')))
    .map((e) => e.name)
    .sort();
}

/**
 * Enumerate the top-level source entries a pack ships, mapped to their
 * `.github/` destinations.
 * @param {string} packDir
 * @returns {{ kind: string, srcAbs: string, destRel: string, name: string }[]}
 */
function packArtifacts(packDir) {
  /** @type {{ kind: string, srcAbs: string, destRel: string, name: string }[]} */
  const out = [];
  for (const sub of COPY_DIRS) {
    const subAbs = path.join(packDir, sub);
    if (!isDir(subAbs)) continue;
    for (const entry of fs.readdirSync(subAbs, { withFileTypes: true })) {
      // skills/ entries are directories; everything else is a flat file.
      if (sub === 'skills') {
        if (!entry.isDirectory()) continue;
      } else if (!entry.isFile()) {
        continue;
      }
      out.push({
        kind: sub,
        srcAbs: path.join(subAbs, entry.name),
        destRel: rel(path.join('.github', sub, entry.name)),
        name: entry.name,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------ source fetch */

/**
 * Read the bundle manifest's upstream source pin, if present and usable.
 * @param {string} root
 * @returns {{ source_repo: string, source_ref: string } | null}
 */
function readManifestSource(root) {
  const p = path.join(root, '.github', 'dudestuff', 'bundle-manifest.md');
  if (!exists(p)) return null;
  const m = /```json\s*\r?\n([\s\S]*?)\r?\n```/.exec(fs.readFileSync(p, 'utf8'));
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    const source_repo = typeof o.source_repo === 'string' ? o.source_repo : '';
    if (!source_repo) return null;
    const source_ref = typeof o.source_ref === 'string' && o.source_ref ? o.source_ref : 'main';
    return { source_repo, source_ref };
  } catch {
    return null;
  }
}

/** @param {string[]} args @param {string} [cwd] @returns {number} exit status */
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status == null ? 1 : r.status;
}
/** @returns {boolean} */
function hasGit() {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

/**
 * Resolve a source tree for an upstream source + ref. Local-dir sources are
 * used in place; remote sources are shallow-cloned into a per-source cache and
 * reused across calls.
 * @param {string} source repo URL or local path
 * @param {string} ref
 * @returns {{ tree: string } | { error: string }}
 */
function resolveSourceTree(source, ref) {
  if (isDir(source)) return { tree: source };
  if (!hasGit()) return { error: 'git is required to fetch a pack from a remote source' };
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const key = crypto.createHash('sha256').update(`${source}|${ref}`).digest('hex').slice(0, 12);
  const dest = path.join(CACHE_ROOT, `src-${key}`);
  if (isDir(path.join(dest, '.git'))) return { tree: dest };
  removePath(dest);
  if (git(['clone', '--quiet', '--depth=1', '--branch', ref, source, dest]) === 0) {
    return { tree: dest };
  }
  if (git(['clone', '--quiet', source, dest]) === 0 && git(['checkout', '--quiet', ref], dest) === 0) {
    return { tree: dest };
  }
  removePath(dest);
  return { error: `failed to fetch source ${source} @ ${ref}` };
}

/**
 * Resolve a pack's source directory. Prefers the local catalog, then falls back
 * to the bundle's configured upstream source (or an explicit override), so a
 * pack can be installed even when `library/packs/` is not vendored locally.
 * @param {{ root: string, library: string, name: string, fetch: boolean, source?: string, ref?: string }} a
 * @returns {{ packDir: string, origin: string } | { error: string }}
 */
function resolvePackDir({ root, library, name, fetch, source, ref }) {
  const localDir = path.join(library, name);
  if (isDir(localDir) && exists(path.join(localDir, 'pack.md'))) {
    return { packDir: localDir, origin: 'local' };
  }
  if (fetch === false) {
    return { error: `pack not found in catalog: ${rel(localDir)}` };
  }
  let src = source || '';
  let sref = ref || '';
  if (!src) {
    const man = readManifestSource(root);
    if (man) {
      src = man.source_repo;
      if (!sref) sref = man.source_ref;
    }
  }
  if (!src) {
    return {
      error: `pack "${name}" is not in the local catalog and no upstream source is configured (seed .github/dudestuff/bundle-manifest.md or pass --source)`,
    };
  }
  if (!sref) sref = 'main';
  const tree = resolveSourceTree(src, sref);
  if ('error' in tree) return { error: tree.error };
  const fetchedDir = path.join(tree.tree, 'library', 'packs', name);
  if (isDir(fetchedDir) && exists(path.join(fetchedDir, 'pack.md'))) {
    return { packDir: fetchedDir, origin: isDir(src) ? `source ${src}` : `${src} @ ${sref}` };
  }
  return { error: `pack "${name}" not found in source ${src}${isDir(src) ? '' : ` @ ${sref}`}` };
}

/* ----------------------------------------------------------------- commands */

/**
 * @param {string} relPath
 * @param {string} packName
 * @returns {boolean} true when a copied artifact carries the pack namespace.
 */
function artifactInNamespace(relPath, packName) {
  // agents + skills must classify to this pack; instructions/prompts are
  // namespace-loose (pack-scoped applyTo) and validated only by source dir.
  if (/^\.github\/(agents|skills)\//.test(relPath)) {
    return belongsToPack(relPath, packName);
  }
  return true;
}

/**
 * @param {{ root: string, library: string, name: string, force: boolean }} args
 * @returns {{ ok: boolean, code: number, result?: any, error?: string }}
 */
function cmdAdd({ root, library, name, force, fetch = true, source, ref }) {
  if (!PACK_NAME_RE.test(name)) {
    return { ok: false, code: 1, error: `invalid pack name: ${name}` };
  }

  const profile = readProfile(root);
  if (profile.enabled_packs.includes(name)) {
    return { ok: true, code: 0, result: { added: name, files: [], alreadyInstalled: true } };
  }

  const resolved = resolvePackDir({ root, library, name, fetch, source, ref });
  if ('error' in resolved) {
    return { ok: false, code: 2, error: resolved.error };
  }
  const { packDir, origin } = resolved;
  const manifestName = frontmatterName(fs.readFileSync(path.join(packDir, 'pack.md'), 'utf8'));
  if (manifestName && manifestName !== name) {
    return { ok: false, code: 2, error: `pack.md name "${manifestName}" does not match directory "${name}"` };
  }

  // Prefix-collision guard: pack names must not be hyphen-prefixes of one
  // another, because `remove` matches on the `dude-pack-<name>-` prefix.
  for (const other of profile.enabled_packs) {
    if (name.startsWith(`${other}-`) || other.startsWith(`${name}-`)) {
      return { ok: false, code: 2, error: `pack name "${name}" collides with installed pack "${other}" (hyphen-prefix)` };
    }
  }

  const artifacts = packArtifacts(packDir);
  if (artifacts.length === 0) {
    return { ok: false, code: 2, error: `pack "${name}" ships no installable artifacts` };
  }

  /** @type {string[]} */
  const conflicts = [];
  for (const a of artifacts) {
    if (!artifactInNamespace(a.destRel, name)) {
      return { ok: false, code: 2, error: `artifact "${a.destRel}" is outside the dude-pack-${name}-* namespace` };
    }
    if (!force && exists(path.join(root, a.destRel))) conflicts.push(a.destRel);
  }
  if (conflicts.length > 0) {
    return { ok: false, code: 2, error: `destination already exists (use --force):\n  ${conflicts.join('\n  ')}` };
  }

  /** @type {string[]} */
  const written = [];
  for (const a of artifacts) {
    copyRecursive(a.srcAbs, path.join(root, a.destRel));
    written.push(a.destRel);
  }

  profile.enabled_packs.push(name);
  profile.installed[name] = { files: written, installed_at: new Date().toISOString() };
  writeProfile(root, profile);

  return { ok: true, code: 0, result: { added: name, files: written.sort(), origin } };
}

/**
 * @param {{ root: string, name: string }} args
 * @returns {{ ok: boolean, code: number, result?: any, error?: string }}
 */
function cmdRemove({ root, name }) {
  if (!PACK_NAME_RE.test(name)) {
    return { ok: false, code: 1, error: `invalid pack name: ${name}` };
  }
  const profile = readProfile(root);
  const entry = profile.installed[name];

  /** @type {string[]} */
  let targets = [];
  if (entry && Array.isArray(entry.files) && entry.files.length > 0) {
    targets = entry.files.slice();
  } else {
    // Fallback: enumerate on-disk dude-pack-<name>-* agents and skills.
    const githubDir = path.join(root, '.github');
    for (const sub of ['agents', 'skills']) {
      const subAbs = path.join(githubDir, sub);
      if (!isDir(subAbs)) continue;
      for (const e of fs.readdirSync(subAbs)) {
        const r = rel(path.join('.github', sub, e));
        if (belongsToPack(r, name)) targets.push(r);
      }
    }
  }

  if (targets.length === 0 && !profile.enabled_packs.includes(name)) {
    return { ok: false, code: 2, error: `pack "${name}" is not installed` };
  }

  /** @type {string[]} */
  const removed = [];
  for (const t of targets) {
    const abs = path.join(root, t);
    if (exists(abs)) {
      removePath(abs);
      removed.push(t);
    }
  }

  profile.enabled_packs = profile.enabled_packs.filter((p) => p !== name);
  delete profile.installed[name];
  writeProfile(root, profile);

  return { ok: true, code: 0, result: { removed: name, files: removed.sort() } };
}

/**
 * @param {{ root: string, library: string }} args
 * @returns {{ ok: boolean, code: number, result: any }}
 */
function cmdList({ root, library }) {
  const profile = readProfile(root);
  const installedSet = new Set(profile.enabled_packs);
  const packs = availablePacks(library).map((name) => {
    let description = '';
    try {
      const text = fs.readFileSync(path.join(library, name, 'pack.md'), 'utf8');
      const m = /^description\s*:\s*(.+)$/m.exec(text);
      if (m) description = m[1].trim().replace(/^["']|["']$/g, '');
    } catch {
      /* ignore */
    }
    return { name, installed: installedSet.has(name), description };
  });
  return { ok: true, code: 0, result: { packs, enabled_packs: [...installedSet].sort() } };
}

/**
 * @param {{ root: string }} args
 * @returns {{ ok: boolean, code: number, result: any }}
 */
function cmdStatus({ root }) {
  const profile = readProfile(root);
  return {
    ok: true,
    code: 0,
    result: { enabled_packs: [...profile.enabled_packs].sort(), installed: profile.installed },
  };
}

/**
 * Verify catalog packs by temp-installing each into a throwaway copy of the
 * current bundle and running dude-lint against it. Reports per-pack warning /
 * failure / leftover counts. This is the pack-source lint integration: it
 * surfaces issues (stale handles, malformed frontmatter, removal leftovers)
 * that the core linter cannot see while a pack still lives under library/packs/.
 * @param {{ root: string, library: string }} a
 * @returns {{ ok: boolean, code: number, result: any }}
 */
function cmdVerify({ root, library }) {
  const lintPath = fileURLToPath(new URL('../dude-lint/lint.mjs', import.meta.url));
  const coreDirs = ['agents', 'skills', 'instructions', 'prompts', 'dudestuff'];
  const names = availablePacks(library);
  /** @type {{ name: string, warnings: number, failures: number, leftovers: number, error?: string }[]} */
  const verified = [];

  for (const name of names) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dude-verify-${name}-`));
    try {
      for (const d of coreDirs) {
        const srcAbs = path.join(root, '.github', d);
        if (isDir(srcAbs)) copyRecursive(srcAbs, path.join(tmp, '.github', d));
      }
      const libSrc = path.join(root, 'library');
      if (isDir(libSrc)) copyRecursive(libSrc, path.join(tmp, 'library'));

      const add = cmdAdd({ root: tmp, library: path.join(tmp, 'library', 'packs'), name, force: false, fetch: false });
      if (!add.ok) {
        verified.push({ name, warnings: 0, failures: 1, leftovers: 0, error: add.error });
        continue;
      }
      const lint = spawnSync(process.execPath, [lintPath, tmp], { encoding: 'utf8' });
      const out = `${lint.stdout || ''}${lint.stderr || ''}`;
      const m = /Findings:\s*(\d+)\s*warning\(s\),\s*(\d+)\s*failure\(s\)/.exec(out);
      const warnings = m ? Number(m[1]) : 0;
      const failures = m ? Number(m[2]) : lint.status ? 1 : 0;

      cmdRemove({ root: tmp, name });
      let leftovers = 0;
      for (const sub of ['agents', 'skills']) {
        const subAbs = path.join(tmp, '.github', sub);
        if (!isDir(subAbs)) continue;
        for (const e of fs.readdirSync(subAbs)) {
          if (belongsToPack(rel(path.join('.github', sub, e)), name)) leftovers += 1;
        }
      }
      verified.push({ name, warnings, failures, leftovers });
    } finally {
      removePath(tmp);
    }
  }

  const anyFail = verified.some((v) => v.failures > 0 || v.leftovers > 0 || v.error);
  return { ok: !anyFail, code: anyFail ? 2 : 0, result: { verified } };
}

/* --------------------------------------------------------------------- cli */

const HELP = `dude-compose — install / remove optional packs

Usage:
  node compose.mjs list                 list catalog packs + installed flag
  node compose.mjs status               list installed packs
  node compose.mjs add <name>           install a pack into .github/
  node compose.mjs remove <name>        uninstall a pack
  node compose.mjs verify               temp-install + lint every catalog pack

Flags:
  --root <dir>      bundle root (default: cwd)
  --library <dir>   pack catalog (default: <root>/library/packs)
  --source <repo>   upstream source for the add fetch fallback (default: manifest)
  --ref <ref>       upstream ref for the fetch fallback (default: manifest / main)
  --no-fetch        never fetch; require the pack in the local catalog
  --json            machine-readable output
  --force           overwrite existing files on add
`;

/**
 * @param {string[]} argv
 * @returns {{ cmd?: string, name?: string, root: string, library?: string, json: boolean, force: boolean, help: boolean }}
 */
function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), json: false, force: false, fetch: true, help: false };
  /** @type {string[]} */
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--force') out.force = true;
    else if (a === '--no-fetch') out.fetch = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--library') out.library = argv[++i];
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--ref') out.ref = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else positionals.push(a);
  }
  out.cmd = positionals[0];
  out.name = positionals[1];
  return out;
}

/** @param {any} r @param {boolean} json */
function report(r, json) {
  if (json) {
    process.stdout.write(JSON.stringify(r.ok ? { ok: true, ...r.result } : { ok: false, error: r.error }, null, 2) + '\n');
    return;
  }
  if (!r.ok) {
    process.stderr.write(`[FAIL] ${r.error}\n`);
    return;
  }
  const res = r.result || {};
  if (res.packs) {
    for (const p of res.packs) {
      process.stdout.write(`${p.installed ? '[x]' : '[ ]'} ${p.name}${p.description ? ' — ' + p.description : ''}\n`);
    }
  } else if (res.added) {
    const from = res.origin && res.origin !== 'local' ? ` from ${res.origin}` : '';
    process.stdout.write(
      res.alreadyInstalled
        ? `[INFO] pack "${res.added}" already installed\n`
        : `[OK] installed pack "${res.added}" (${res.files.length} item(s))${from}\n`
    );
  } else if (res.removed) {
    process.stdout.write(`[OK] removed pack "${res.removed}" (${res.files.length} item(s))\n`);
  } else if (res.enabled_packs) {
    process.stdout.write(res.enabled_packs.length ? `Installed: ${res.enabled_packs.join(', ')}\n` : 'No packs installed.\n');
  } else if (res.verified) {
    for (const v of res.verified) {
      const bad = v.failures > 0 || v.leftovers > 0 || v.error;
      const detail = v.error
        ? `error: ${v.error}`
        : `${v.warnings} warning(s), ${v.failures} failure(s), ${v.leftovers} leftover(s)`;
      process.stdout.write(`${bad ? '[FAIL]' : '[OK]  '} ${v.name} — ${detail}\n`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.cmd) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }
  const root = path.resolve(args.root);
  const library = args.library ? path.resolve(args.library) : path.join(root, 'library', 'packs');

  /** @type {{ ok: boolean, code: number, result?: any, error?: string }} */
  let r;
  switch (args.cmd) {
    case 'list':
      r = cmdList({ root, library });
      break;
    case 'status':
      r = cmdStatus({ root });
      break;
    case 'add':
      if (!args.name) {
        r = { ok: false, code: 1, error: 'add requires a pack name' };
      } else {
        r = cmdAdd({ root, library, name: args.name, force: args.force, fetch: args.fetch, source: args.source, ref: args.ref });
      }
      break;
    case 'remove':
      if (!args.name) {
        r = { ok: false, code: 1, error: 'remove requires a pack name' };
      } else {
        r = cmdRemove({ root, name: args.name });
      }
      break;
    case 'verify':
      r = cmdVerify({ root, library });
      break;
    default:
      r = { ok: false, code: 1, error: `unknown command: ${args.cmd}` };
  }

  report(r, args.json);
  process.exit(r.code);
}

/**
 * Is this module being executed directly (vs. imported)? Robust to script
 * paths that contain spaces (percent-encoded in a `file://` URL) and to symlinks
 * (e.g. macOS `/tmp` -> `/private/tmp`), where `import.meta.url` is realpath-
 * resolved but `process.argv[1]` is not.
 * @param {string} metaUrl `import.meta.url`
 * @param {string | undefined} argv1 `process.argv[1]`
 * @returns {boolean}
 */
function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

// Run only when invoked directly (allows importing for tests).
if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}

export {
  cmdAdd,
  cmdRemove,
  cmdList,
  cmdStatus,
  cmdVerify,
  readProfile,
  availablePacks,
  packArtifacts,
  resolvePackDir,
  readManifestSource,
  isMainModule,
};
