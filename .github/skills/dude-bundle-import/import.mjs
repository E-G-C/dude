#!/usr/bin/env node
// @ts-check
/**
 * import.mjs — mechanical prep for `dude-bundle-import`.
 *
 * The deterministic parts of importing an external agent/skill: resolve the
 * source URL, parse frontmatter, plan which fields to strip, normalize the
 * destination filename to the `dude-local-*` namespace, count line endings, and
 * score token-overlap against existing local artifacts. The coordinator keeps
 * the judgment calls (license disposition, persona drift, opt-in tool remap).
 *
 *   analyze <url|path> [--root <dir>] [--json]      -> adaptation report
 *   apply   <url|path> --plan <plan.json> [--root <dir>]
 *
 * `apply` refuses unless the plan records a `license_disposition` when the
 * source carries license metadata.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeString } from '../dude-engine/lib/text.mjs';
import { rankOverlap } from '../dude-engine/lib/text-analysis.mjs';

/** Fields always stripped from imported frontmatter (Copilot ignores them). */
export const ALWAYS_STRIP = ['compatibility', 'model'];

/**
 * Rewrite a GitHub `blob` URL to its `raw.githubusercontent.com` equivalent.
 * Other URLs (including already-raw) pass through unchanged.
 * @param {string} url
 * @returns {string}
 */
export function resolveRawUrl(url) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(String(url));
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : String(url);
}

/**
 * @param {string} content
 * @returns {{ hasFm: boolean, lines: string[], start: number, end: number }}
 */
export function splitFrontmatter(content) {
  const lines = String(content).split(/\r?\n/);
  if ((lines[0] || '').trim() !== '---') return { hasFm: false, lines, start: -1, end: -1 };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return { hasFm: true, lines, start: 0, end: i };
  }
  return { hasFm: false, lines, start: -1, end: -1 };
}

/**
 * @param {string} content
 * @param {string} key
 * @returns {string | null} unquoted scalar value of a top-level frontmatter key
 */
export function readFrontmatterKey(content, key) {
  const sf = splitFrontmatter(content);
  if (!sf.hasFm) return null;
  for (let i = sf.start + 1; i < sf.end; i++) {
    const m = new RegExp(`^${key}:\\s*(.*)$`).exec(sf.lines[i]);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

/**
 * Remove top-level frontmatter keys (and their indented continuations).
 * @param {string} content
 * @param {string[]} keys
 * @returns {string}
 */
export function stripFrontmatterKeys(content, keys) {
  const sf = splitFrontmatter(content);
  if (!sf.hasFm) return content;
  const out = [sf.lines[sf.start]];
  for (let i = sf.start + 1; i < sf.end; i++) {
    const m = /^([A-Za-z0-9_-]+):/.exec(sf.lines[i]);
    if (m && keys.includes(m[1])) {
      let j = i + 1;
      while (j < sf.end && /^\s+\S/.test(sf.lines[j])) j++;
      i = j - 1;
      continue;
    }
    out.push(sf.lines[i]);
  }
  out.push(sf.lines[sf.end], ...sf.lines.slice(sf.end + 1));
  return out.join('\n');
}

/**
 * @param {string} source path or url
 * @param {string} content
 * @returns {'agent'|'skill'|'unknown'}
 */
export function detectKind(source, content) {
  const base = source.split(/[/\\]/).pop() || '';
  if (base === 'SKILL.md') return 'skill';
  if (base.endsWith('.agent.md') || /\/agents\//.test(source)) return 'agent';
  // body heuristic: frontmatter name + directive prose -> agent
  if (splitFrontmatter(content).hasFm && readFrontmatterKey(content, 'name')) return 'agent';
  return 'unknown';
}

/**
 * Normalize an imported agent basename to the `dude-local-*` namespace. Strips
 * only the literal `dude-local-` / `dude-pack-` prefix (not a pack segment), so
 * multi-token pack names survive: `dude-pack-ms-brand-stylist` -> `ms-brand-stylist`.
 * @param {string} basename e.g. `security.agent.md` or `dude-pack-ms-brand-stylist.agent.md`
 * @returns {string} destination filename, e.g. `dude-local-security.agent.md`
 */
export function normalizeAgentDest(basename) {
  const stem = basename
    .replace(/\.agent\.md$/, '')
    .replace(/\.md$/, '')
    .replace(/^dude-(?:local|pack)-/, '');
  return `dude-local-${stem}.agent.md`;
}

/**
 * Normalize an imported skill name to a `dude-local-*` destination directory.
 * Strips only the literal `dude-local-` / `dude-pack-` prefix (lossless).
 * @param {string} name skill frontmatter `name` (or a fallback)
 * @returns {string} destination directory, e.g. `dude-local-my-skill`
 */
export function normalizeSkillDir(name) {
  const stem = String(name || 'imported').replace(/^dude-(?:local|pack)-/, '');
  return `dude-local-${stem}`;
}

/**
 * @param {string} root
 * @returns {{ id: string, text: string }[]} existing local artifact descriptions
 */
function existingDescriptions(root) {
  /** @type {{ id: string, text: string }[]} */
  const out = [];
  const agentsDir = path.join(root, '.github', 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir)) {
      if (!f.endsWith('.agent.md')) continue;
      const d = readFrontmatterKey(fs.readFileSync(path.join(agentsDir, f), 'utf8'), 'description');
      if (d) out.push({ id: f, text: d });
    }
  }
  const skillsDir = path.join(root, '.github', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const dir of fs.readdirSync(skillsDir)) {
      const sf = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(sf)) continue;
      const d = readFrontmatterKey(fs.readFileSync(sf, 'utf8'), 'description');
      if (d) out.push({ id: dir, text: d });
    }
  }
  return out;
}

/**
 * Read a source that is either a local path or an http(s) URL.
 * @param {string} source
 * @returns {Promise<string>}
 */
async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    const url = resolveRawUrl(source);
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${url}`);
    return res.text();
  }
  return fs.readFileSync(source, 'utf8');
}

/**
 * Produce an adaptation report for an import source.
 * @param {{ source: string, root?: string }} opts
 * @returns {Promise<any>}
 */
export async function analyze({ source, root = process.cwd() }) {
  const resolvedUrl = /^https?:\/\//.test(source) ? resolveRawUrl(source) : null;
  const content = await readSource(source);
  const kind = detectKind(source, content);
  const base = source.split(/[/\\]/).pop() || '';

  const strip = ALWAYS_STRIP.filter((k) => readFrontmatterKey(content, k) !== null);
  const toolsPresent = readFrontmatterKey(content, 'tools') !== null;
  const hasLicense = readFrontmatterKey(content, 'license') !== null;
  const description = readFrontmatterKey(content, 'description') || '';

  let destRel = null;
  if (kind === 'agent') destRel = `.github/agents/${normalizeAgentDest(base)}`;
  else if (kind === 'skill') {
    destRel = `.github/skills/${normalizeSkillDir(readFrontmatterKey(content, 'name') || 'imported')}/SKILL.md`;
  }

  return {
    source,
    resolvedUrl,
    kind,
    destRel,
    frontmatter: {
      name: readFrontmatterKey(content, 'name'),
      description,
      strip, // compatibility / model
      toolsPresent, // Claude-style tools: strip by default, remap only on opt-in
      hasLicense,
    },
    requiresLicenseDecision: hasLicense,
    lineEndings: content.includes('\r\n') ? 'crlf' : 'lf',
    overlaps: rankOverlap(description, existingDescriptions(root), 0.6),
    warnings: kind === 'unknown' ? ['does not parse as a Dude agent or skill'] : [],
  };
}

/**
 * Execute an import plan. Writes the adapted artifact to its destination.
 * @param {{ source: string, root?: string, plan: any }} opts
 * @returns {Promise<{ written: string }>}
 */
export async function applyPlan({ source, root = process.cwd(), plan }) {
  if (plan.kind === 'unknown' || !plan.destRel) throw new Error('cannot apply: source is not a Dude agent or skill');
  if (plan.requiresLicenseDecision && !plan.license_disposition) {
    throw new Error('cannot apply: source carries license metadata but plan has no license_disposition');
  }
  const content = await readSource(source);
  const stripKeys = [...(plan.frontmatter?.strip || [])];
  if (plan.frontmatter?.toolsPresent && plan.strip_tools !== false) stripKeys.push('tools');
  const adapted = normalizeString(stripFrontmatterKeys(content, stripKeys));

  const destAbs = path.join(root, plan.destRel);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, adapted);
  return { written: plan.destRel };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), json: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--plan') out.planPath = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else pos.push(a);
  }
  out.cmd = pos[0];
  out.source = pos[1];
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.cmd || !args.source) {
    process.stdout.write('usage: node import.mjs analyze <url|path> [--json] | apply <url|path> --plan <plan.json>\n');
    process.exit(args.help ? 0 : 1);
  }
  try {
    if (args.cmd === 'analyze') {
      const report = await analyze({ source: args.source, root: args.root });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (args.cmd === 'apply') {
      if (!args.planPath) throw new Error('apply requires --plan <plan.json>');
      const plan = JSON.parse(fs.readFileSync(args.planPath, 'utf8'));
      const r = await applyPlan({ source: args.source, root: args.root, plan });
      process.stdout.write(`[OK] wrote ${r.written}\n`);
    } else {
      throw new Error(`unknown command: ${args.cmd}`);
    }
  } catch (err) {
    process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}
