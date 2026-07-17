#!/usr/bin/env node
// @ts-check
/**
 * scaffold-agent.mjs — emit a lint-clean `.agent.md` skeleton.
 *
 * Local (default): `.github/agents/dude-local-<slug>.agent.md`.
 * Pack:            `library/packs/<pack>/agents/dude-pack-<pack>-<slug>.agent.md`
 *                  and the id is added to that pack's `pack.md` provides.agents.
 *
 * The skeleton is guaranteed to satisfy dude-lint on first write: it carries the
 * mandatory `**Coordinator-only artifacts:**` boundary block and LF endings.
 * The author fills in scope/boundaries/rules content afterward.
 *
 * Usage:
 *   node scaffold-agent.mjs <slug> [--pack <name>] [--role "..."] [--desc "..."]
 *                                  [--name "Display Name"] [--tools "read, edit"]
 *                                  [--root <dir>] [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeString } from '../dude-engine/lib/text.mjs';
import { addProvide } from '../dude-engine/lib/pack-manifest.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';

const SLUG_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

/** @param {string} slug @returns {string} Title Case display name */
function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const COORD_BLOCK =
  '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state ' +
  'glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, ' +
  '`<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report ' +
  'changes back to `@dude` instead.';

/**
 * @param {{ role: string, name: string, desc: string, tools: string }} a
 * @returns {string}
 */
function agentSkeleton({ role, name, desc, tools }) {
  return normalizeString(`---
name: "${name}"
description: "${desc}"
tools: [${tools}]
---

You are the ${role} specialist.

${COORD_BLOCK}

## Scope

- <domain responsibility 1>
- <domain responsibility 2>

## Boundaries

- Do NOT <work outside this agent's lane>
- Do NOT <overlap with an existing specialist>

## Rules

- Check \`.dude/memory/\` for relevant decisions, guardrails, context, and lessons before working.
- Check \`.github/skills/project/SKILL.md\` if it exists for project conventions.
- Check \`.github/skills/\` for any other skills whose description matches the current task.

## Return format

- Summarize what changed, why, and any follow-ups for \`@dude\`.
`);
}

/**
 * @param {{ slug: string, pack?: string, role?: string, desc?: string, name?: string, tools?: string, root?: string, force?: boolean }} opts
 * @returns {{ path: string, packUpdated: boolean }}
 */
export function scaffoldAgent(opts) {
  const { slug } = opts;
  if (!SLUG_RE.test(slug)) throw new Error(`invalid slug: ${slug}`);
  const root = opts.root || process.cwd();
  const role = opts.role || titleCase(slug);
  const name = opts.name || role;
  const desc = opts.desc || `${role} specialist. Use for <one-line scope>.`;
  const tools = opts.tools || 'read, search, edit';

  let destAbs;
  let packMd;
  let provideId;
  if (opts.pack) {
    if (!SLUG_RE.test(opts.pack)) throw new Error(`invalid pack name: ${opts.pack}`);
    const packDir = path.join(root, 'library', 'packs', opts.pack);
    packMd = path.join(packDir, 'pack.md');
    if (!fs.existsSync(packMd)) throw new Error(`pack not found: ${path.relative(root, packMd)}`);
    provideId = `dude-pack-${opts.pack}-${slug}`;
    destAbs = path.join(packDir, 'agents', `${provideId}.agent.md`);
  } else {
    destAbs = path.join(root, '.github', 'agents', `dude-local-${slug}.agent.md`);
  }

  if (fs.existsSync(destAbs) && !opts.force) {
    throw new Error(`destination exists (use --force): ${path.relative(root, destAbs)}`);
  }

  destAbs = resolveMutationPath(root, path.relative(path.resolve(root), destAbs).split(path.sep).join('/'));
  if (packMd) {
    packMd = resolveMutationPath(root, path.relative(path.resolve(root), packMd).split(path.sep).join('/'));
  }

  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, agentSkeleton({ role, name, desc, tools }));

  let packUpdated = false;
  if (packMd && provideId) {
    fs.writeFileSync(packMd, normalizeString(addProvide(fs.readFileSync(packMd, 'utf8'), 'agents', provideId)));
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
    else if (a === '--role') out.role = argv[++i];
    else if (a === '--desc') out.desc = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--tools') out.tools = argv[++i];
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
    process.stdout.write('usage: node scaffold-agent.mjs <slug> [--pack <name>] [--role "..."] [--desc "..."] [--name "..."] [--tools "..."] [--force]\n');
    process.exit(args.help ? 0 : 1);
  }
  try {
    const r = scaffoldAgent(args);
    process.stdout.write(`[OK] created ${path.relative(args.root, r.path)}${r.packUpdated ? ' (+ pack.md provides.agents)' : ''}\n`);
  } catch (err) {
    process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}
