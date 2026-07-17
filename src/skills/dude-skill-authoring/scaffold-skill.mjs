#!/usr/bin/env node
// @ts-check
/**
 * scaffold-skill.mjs — emit a lint-clean `SKILL.md` skeleton in its own dir.
 *
 * Local (default): `.github/skills/dude-local-<slug>/SKILL.md`.
 * Pack:            `library/packs/<pack>/skills/dude-pack-<pack>-<slug>/SKILL.md`
 *                  and the id is added to that pack's `pack.md` provides.skills.
 *
 * The skeleton satisfies dude-lint's rule that the frontmatter `name:` matches
 * the skill directory, with LF endings.
 *
 * Usage:
 *   node scaffold-skill.mjs <slug> [--pack <name>] [--desc "..."] [--arg-hint "..."]
 *                                  [--root <dir>] [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeString } from '../dude-engine/lib/text.mjs';
import { addProvide } from '../dude-engine/lib/pack-manifest.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';

const SLUG_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/**
 * @param {{ dirName: string, desc: string, argHint: string, title: string }} a
 * @returns {string}
 */
function skillSkeleton({ dirName, desc, argHint, title }) {
  return normalizeString(`---
name: ${dirName}
description: "${desc}"
argument-hint: "${argHint}"
---

# ${title}

## Purpose

<one or two sentences on what this skill does and when to use it>

## Procedure

1. <first step>
2. <second step>
3. <verification / return>
`);
}

/**
 * @param {{ slug: string, pack?: string, desc?: string, argHint?: string, root?: string, force?: boolean }} opts
 * @returns {{ path: string, packUpdated: boolean }}
 */
export function scaffoldSkill(opts) {
  const { slug } = opts;
  if (!SLUG_RE.test(slug)) throw new Error(`invalid slug: ${slug}`);
  const root = opts.root || process.cwd();

  let dirName;
  let skillDirAbs;
  let packMd;
  if (opts.pack) {
    if (!SLUG_RE.test(opts.pack)) throw new Error(`invalid pack name: ${opts.pack}`);
    const packDir = path.join(root, 'library', 'packs', opts.pack);
    packMd = path.join(packDir, 'pack.md');
    if (!fs.existsSync(packMd)) throw new Error(`pack not found: ${path.relative(root, packMd)}`);
    dirName = `dude-pack-${opts.pack}-${slug}`;
    skillDirAbs = path.join(packDir, 'skills', dirName);
  } else {
    dirName = `dude-local-${slug}`;
    skillDirAbs = path.join(root, '.github', 'skills', dirName);
  }

  const destRel = path.relative(path.resolve(root), path.join(skillDirAbs, 'SKILL.md')).split(path.sep).join('/');
  const destAbs = resolveMutationPath(root, destRel);
  if (packMd) {
    packMd = resolveMutationPath(root, path.relative(path.resolve(root), packMd).split(path.sep).join('/'));
  }
  if (fs.existsSync(destAbs) && !opts.force) {
    throw new Error(`destination exists (use --force): ${path.relative(root, destAbs)}`);
  }

  const title = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const desc = opts.desc || `Use when <trigger>. ${title} workflow.`;
  const argHint = opts.argHint || '<what the user should provide>';

  fs.mkdirSync(skillDirAbs, { recursive: true });
  fs.writeFileSync(destAbs, skillSkeleton({ dirName, desc, argHint, title }));

  let packUpdated = false;
  if (packMd) {
    fs.writeFileSync(packMd, normalizeString(addProvide(fs.readFileSync(packMd, 'utf8'), 'skills', dirName)));
    packUpdated = true;
  }
  return { path: destAbs, packUpdated };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), force: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--pack') out.pack = argv[++i];
    else if (a === '--desc') out.desc = argv[++i];
    else if (a === '--arg-hint') out.argHint = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else pos.push(a);
  }
  out.slug = pos[0];
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

if (isMainModule(import.meta.url, process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.slug) {
    process.stdout.write('usage: node scaffold-skill.mjs <slug> [--pack <name>] [--desc "..."] [--arg-hint "..."] [--force]\n');
    process.exit(args.help ? 0 : 1);
  }
  try {
    const r = scaffoldSkill(args);
    process.stdout.write(`[OK] created ${path.relative(args.root, r.path)}${r.packUpdated ? ' (+ pack.md provides.skills)' : ''}\n`);
  } catch (err) {
    process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}
