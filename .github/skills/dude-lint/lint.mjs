#!/usr/bin/env node
// @ts-check
/**
 * Static linter for the Dude Coder bundle (Node port of lint.sh / lint.ps1).
 *
 * Validates structural conventions across brainstorm/, specs/, and .github/.
 * Read-only. Dependency-free (Node >= 20 stdlib only).
 *
 * Usage:
 *   node .github/skills/dude-lint/lint.mjs
 *   node .github/skills/dude-lint/lint.mjs /path/to/repo
 *
 * Exit code: 0 if no failures, 1 if any [FAIL] was emitted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { classifyPath, TIER } from '../dude-engine/lib/ownership.mjs';

const ROOT = path.resolve(process.argv[2] || '.');

const counts = {
  warn: 0,
  fail: 0,
  brainstorm: 0,
  taskfile: 0,
  memoryfile: 0,
  agent: 0,
};

const useColor = Boolean(process.stdout.isTTY);
const YEL = useColor ? '\u001b[33m' : '';
const RED = useColor ? '\u001b[31m' : '';
const RST = useColor ? '\u001b[0m' : '';

/** @param {string} msg */
const info = (msg) => console.log(`[INFO]  ${msg}`);
/** @param {string} msg */
const warn = (msg) => {
  console.log(`${YEL}[WARN]${RST}  ${msg}`);
  counts.warn += 1;
};
/** @param {string} msg */
const fail = (msg) => {
  console.log(`${RED}[FAIL]${RST}  ${msg}`);
  counts.fail += 1;
};

/** @param {string} abs @returns {string} */
function relpath(abs) {
  if (abs === ROOT) return '.';
  const prefix = ROOT + path.sep;
  if (abs.startsWith(prefix)) return abs.slice(prefix.length).split(path.sep).join('/');
  return abs;
}

/** @param {string} abs @returns {boolean} */
function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
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

/**
 * List direct child files of a directory matching a suffix, sorted.
 * @param {string} dir
 * @param {string} suffix
 * @returns {string[]} absolute paths
 */
function listFiles(dir, suffix) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(suffix))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/**
 * List direct child directories, sorted.
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function listDirs(dir) {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name))
    .sort();
}

/**
 * Recursively list files matching a basename, sorted.
 * @param {string} dir
 * @param {(name: string) => boolean} match
 * @returns {string[]}
 */
function walkMatch(dir, match) {
  /** @type {string[]} */
  const out = [];
  if (!isDir(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMatch(abs, match));
    else if (entry.isFile() && match(entry.name)) out.push(abs);
  }
  return out.sort();
}

/** @param {string} abs @returns {string} */
function read(abs) {
  return fs.readFileSync(abs, 'utf8');
}

/** @param {string} content @returns {boolean} */
function hasFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return false;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return true;
  }
  return false;
}

/**
 * @param {string} content
 * @param {string} key
 * @returns {string}
 */
function readFrontmatter(content, key) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return '';
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') break;
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(lines[i]);
    if (m && m[1] === key) return m[2].replace(/[ \t]+$/, '');
  }
  return '';
}

/** @param {string} value @returns {string} */
function unquoteScalar(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

/**
 * Walk a file's lines in order; report fence-ordering defects.
 * @param {string[]} lines
 * @param {RegExp} startRe
 * @param {RegExp} endRe
 * @returns {string[]}
 */
function fenceOrderErrors(lines, startRe, endRe) {
  /** @type {string[]} */
  const errs = [];
  let depth = 0;
  let openLine = 0;
  lines.forEach((line, idx) => {
    const n = idx + 1;
    const isStart = startRe.test(line);
    const isEnd = endRe.test(line);
    if (isStart && isEnd) return;
    if (isStart) {
      if (depth > 0) {
        errs.push(
          `duplicate start fence at line ${n} while previous region (opened at line ${openLine}) is still open`,
        );
      } else {
        depth = 1;
        openLine = n;
      }
    } else if (isEnd) {
      if (depth === 0) errs.push(`end fence at line ${n} with no matching start`);
      else depth = 0;
    }
  });
  if (depth > 0) errs.push(`unclosed start fence opened at line ${openLine}`);
  return errs;
}

/** @param {string[]} lines @param {RegExp} re @returns {number} */
function countLines(lines, re) {
  return lines.reduce((acc, l) => (re.test(l) ? acc + 1 : acc), 0);
}

/**
 * Strip fenced code blocks, then collapse `<...>` / `-<...>` placeholders, so
 * documentation examples do not register as real handle/skill references.
 * @param {string} content
 * @returns {string}
 */
function stripFencesAndPlaceholders(content) {
  const out = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out
    .join('\n')
    // Strip inline `code` spans so code-syntax tokens (e.g. SCSS `@import`,
    // shell `@-d`, paths inside backticks) don't get mistaken for Dude
    // handles or skill references.
    .replace(/`[^`\n]*`/g, '')
    .replace(/-<[A-Za-z][A-Za-z0-9_-]*>/g, '')
    .replace(/<[A-Za-z][A-Za-z0-9_-]*>/g, '');
}

const MANAGED_START = /<!--\s*dude:managed:start\s*-->/;
const MANAGED_END = /<!--\s*dude:managed:end\s*-->/;
const BOARD_START = /<!--\s*dude:board:start\s*-->/;
const BOARD_END = /<!--\s*dude:board:end\s*-->/;
const BOARD_START_ANCHORED = /^\s*<!--\s*dude:board:start\s*-->\s*$/;
const BOARD_END_ANCHORED = /^\s*<!--\s*dude:board:end\s*-->\s*$/;

info(`Scanning .github + brainstorm + specs under ${ROOT}`);

// --- Check 1: brainstorm files ----------------------------------------------
for (const file of listFiles(path.join(ROOT, 'brainstorm'), '.md')) {
  counts.brainstorm += 1;
  const rel = relpath(file);
  const content = read(file);

  if (!hasFrontmatter(content)) {
    fail(`${rel}  missing or malformed YAML frontmatter`);
    continue;
  }

  const status = readFrontmatter(content, 'status');
  const specPath = readFrontmatter(content, 'spec_path');

  if (!status) {
    fail(`${rel}  frontmatter is missing 'status:'`);
  } else if (status !== 'draft' && status !== 'defined') {
    warn(`${rel}  unexpected status '${status}' (valid: draft, defined)`);
  } else if (status === 'defined') {
    if (!specPath) {
      fail(`${rel}  status: defined but spec_path is missing`);
    } else if (specPath.includes('\\') || !/^specs\/[^/]+\/spec\.md$/.test(specPath)) {
      fail(`${rel}  spec_path '${specPath}' must point at 'specs/<feature>/spec.md'`);
    } else if (!exists(path.join(ROOT, specPath))) {
      fail(`${rel}  spec_path '${specPath}' does not resolve to an existing file`);
    } else if (isDir(path.join(ROOT, specPath))) {
      fail(`${rel}  spec_path '${specPath}' resolves to a directory, not a file`);
    }
  }

  const lines = content.split('\n');
  const mStart = countLines(lines, MANAGED_START);
  const mEnd = countLines(lines, MANAGED_END);
  if (mStart !== mEnd) {
    fail(`${rel}  unbalanced managed fences (${mStart} start / ${mEnd} end)`);
  } else {
    for (const err of fenceOrderErrors(lines, MANAGED_START, MANAGED_END)) {
      fail(`${rel}  managed fence: ${err}`);
    }
  }

  if (!/^##[ \t]+Coordinator[ \t]+Log\b/m.test(content)) {
    warn(`${rel}  missing '## Coordinator Log' section`);
  }
}

// --- Check 2: tasks files ---------------------------------------------------
const TASK_HEADER =
  /^- \[( |~|!|x)\] T[0-9][0-9][0-9]+@[a-z0-9]{8} (\[P\] )?\[(US[0-9]+|Shared)\] .+$/;
const TASK_LINE = /^\s*-\s*\[.\]\s+/;
const TASK_ID = /T[0-9][0-9][0-9]+@[a-z0-9]{8}/;
const BEADS_TAG = /\(Beads:\s*[A-Za-z0-9_-]+(\s*;[^)]*)?\)/;

for (const file of walkMatch(path.join(ROOT, 'specs'), (n) => n === 'tasks.md')) {
  counts.taskfile += 1;
  const rel = relpath(file);
  const content = read(file);
  const lines = content.split('\n');

  const bStart = countLines(lines, BOARD_START);
  const bEnd = countLines(lines, BOARD_END);
  let skipBoard = true;
  if (bStart !== bEnd) {
    fail(`${rel}  unbalanced board fences (${bStart} start / ${bEnd} end)`);
    skipBoard = false;
  } else if (bStart > 1) {
    fail(`${rel}  multiple board fence pairs found (${bStart}); expected 0 or 1`);
    skipBoard = false;
  } else {
    const errs = fenceOrderErrors(lines, BOARD_START, BOARD_END);
    if (errs.length) {
      for (const err of errs) fail(`${rel}  board fence: ${err}`);
      skipBoard = false;
    }
  }

  let inBoard = false;
  let inHistory = false;
  let historySeen = false;
  let inDiscovered = false;
  /** @type {Map<string, number>} */
  const seen = new Map();

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    if (skipBoard && BOARD_START_ANCHORED.test(line)) {
      inBoard = true;
      return;
    }
    if (inBoard) {
      if (BOARD_END_ANCHORED.test(line)) inBoard = false;
      return;
    }
    if (inHistory) {
      if (/^##[ \t]+/.test(line)) inHistory = false;
      else return;
    }
    if (/^##[ \t]+Lightweight[ \t]+Execution[ \t]+History([ \t]|$)/.test(line)) {
      if (historySeen) {
        fail(
          `${rel}:${lineNo}  duplicate ## Lightweight Execution History section (only one history block is allowed)`,
        );
      }
      inHistory = true;
      historySeen = true;
      inDiscovered = false;
      return;
    }
    if (/^##[ \t]+Discovered[ \t]+During[ \t]+Execution([ \t]|$)/.test(line)) {
      inDiscovered = true;
      return;
    }
    if (inDiscovered && /^##[ \t]/.test(line)) inDiscovered = false;

    if (TASK_LINE.test(line)) {
      const left = line.indexOf('[');
      const glyph = line.charAt(left + 1);
      if (glyph !== ' ' && glyph !== '~' && glyph !== '!' && glyph !== 'x') {
        fail(`${rel}:${lineNo}  invalid task glyph [${glyph}] (valid: space, ~, !, x)`);
        return;
      }
      if (!TASK_HEADER.test(line)) {
        fail(
          `${rel}:${lineNo}  malformed task header (expected: - [ ] T001@a1b2c3d4 [P] [US1|Shared] Description)`,
        );
        return;
      }
      const idMatch = TASK_ID.exec(line);
      const id = idMatch ? idMatch[0] : '';
      if (seen.has(id)) {
        fail(`${rel}:${lineNo}  duplicate task ID ${id} (first seen line ${seen.get(id)})`);
      } else {
        seen.set(id, lineNo);
      }

      const numMatch = /T([0-9]+)/.exec(id);
      const num = numMatch ? parseInt(numMatch[1], 10) : 0;
      const inReserved = num >= 9001 && num <= 9999;

      if (historySeen && !inHistory) {
        fail(
          `${rel}:${lineNo}  canonical task row ${id} appears below ## Lightweight Execution History; history must remain the final task section (move new tasks above it)`,
        );
      }

      if (inDiscovered) {
        if (!inReserved) {
          fail(
            `${rel}:${lineNo}  task ${id} under ## Discovered During Execution must be in reserved range T9001-T9999`,
          );
        }
        if (!BEADS_TAG.test(line)) {
          warn(
            `${rel}:${lineNo}  task ${id} under ## Discovered During Execution is missing its (Beads: <id>) tag (re-import would create a duplicate)`,
          );
        }
      } else if (num >= 9000) {
        fail(
          `${rel}:${lineNo}  task ${id} uses reserved discovered boundary T9000-T9999 outside ## Discovered During Execution`,
        );
      }
    }
  });
}

// --- Check 3: memory files --------------------------------------------------
for (const file of listFiles(path.join(ROOT, '.github/dudestuff'), '.md')) {
  counts.memoryfile += 1;
  const rel = relpath(file);
  const bullets = read(file)
    .split('\n')
    .filter((l) => /^- /.test(l)).length;
  if (bullets > 20) {
    warn(`${rel}  ${bullets} entries (consider consolidation; memory-ledger threshold is 20)`);
  }
}

// --- Check 3a: skill frontmatter names --------------------------------------
for (const dir of listDirs(path.join(ROOT, '.github/skills'))) {
  const base = path.basename(dir);
  const skillFile = path.join(dir, 'SKILL.md');
  if (!exists(skillFile)) {
    fail(`${relpath(dir)}  missing SKILL.md`);
    continue;
  }
  const rel = relpath(skillFile);
  const content = read(skillFile);
  if (!hasFrontmatter(content)) {
    fail(`${rel}  missing or malformed YAML frontmatter`);
    continue;
  }
  const name = unquoteScalar(readFrontmatter(content, 'name'));
  if (!name) fail(`${rel}  frontmatter is missing 'name:'`);
  else if (name !== base) fail(`${rel}  frontmatter name '${name}' must match directory '${base}'`);
}

// --- Check 3b: bundle manifest ----------------------------------------------
const MANIFEST = path.join(ROOT, '.github/dudestuff/bundle-manifest.md');
const ALLOWED_MANIFEST_KEYS = new Set(['source_repo', 'source_ref', 'installed_sha', 'installed_at']);
if (!exists(MANIFEST)) {
  fail('.github/dudestuff/bundle-manifest.md  missing seeded bundle manifest');
} else {
  const manifestRel = relpath(MANIFEST);
  const manifestContent = read(MANIFEST);
  const jsonMatch = /```json\s*\n([\s\S]*?)\n```/.exec(manifestContent);
  if (!jsonMatch) {
    fail(`${manifestRel}  missing fenced JSON manifest block`);
  } else {
    /** @type {Record<string, unknown> | null} */
    let parsed = null;
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      fail(`${manifestRel}  manifest JSON is malformed`);
    } else {
      for (const key of Object.keys(parsed)) {
        if (!ALLOWED_MANIFEST_KEYS.has(key)) {
          fail(`${manifestRel}  manifest has unsupported field '${key}'`);
        }
      }
      if (!parsed.source_repo) fail(`${manifestRel}  manifest is missing source_repo`);
      if (!parsed.source_ref) fail(`${manifestRel}  manifest is missing source_ref`);
      if (!parsed.installed_at) fail(`${manifestRel}  manifest is missing installed_at`);
      if (!/^[0-9a-f]{40}$/.test(String(parsed.installed_sha || ''))) {
        fail(`${manifestRel}  installed_sha must be a 40-character lowercase git sha`);
      }
    }
  }
}

// --- Check 3c: namespace advisories (core / pack / local tiers) -------------
// Ownership is derived from the namespace convention via the shared classifier.
// Unreserved project-owned agents/skills are warned so they can be renamed
// before colliding with future upstream. dude-pack-* and dude-local-* are
// reserved tiers and are not warned.
for (const file of listFiles(path.join(ROOT, '.github/agents'), '.agent.md')) {
  const bn = path.basename(file);
  if (bn === 'dude.agent.md') continue;
  const rel = `.github/agents/${bn}`;
  if (classifyPath(rel) === TIER.PROJECT) {
    warn(
      `${rel}  unreserved project-owned agent (rename to .github/agents/dude-local-<slug>.agent.md to avoid future upstream collisions)`,
    );
  }
}
for (const dir of listDirs(path.join(ROOT, '.github/skills'))) {
  const bn = path.basename(dir);
  if (bn === 'project') continue;
  if (classifyPath(`.github/skills/${bn}/`) === TIER.PROJECT) {
    warn(
      `.github/skills/${bn}/  unreserved project-owned skill (rename to .github/skills/dude-local-<slug>/ to avoid future upstream collisions)`,
    );
  }
}

// --- Check 4: roster orphans ------------------------------------------------
// Reserved placeholder roots that collapse from documentation placeholders and
// must not be treated as concrete handles.
const RESERVED_HANDLE_ROOTS = new Set(['dude-local', 'dude-pack']);
/** @type {Set<string>} */
const validRoles = new Set(['dude', 'dude-lint']);
for (const file of listFiles(path.join(ROOT, '.github/agents'), '.agent.md')) {
  counts.agent += 1;
  validRoles.add(path.basename(file, '.agent.md').toLowerCase());
}

const HANDLE_RE = /(?<![A-Za-z0-9_])@[a-z](?:[a-z0-9-]*[a-z0-9])?/g;
/** @type {Map<string, { first: string, count: number }>} */
const orphanHandles = new Map();
for (const file of walkMatch(path.join(ROOT, '.github'), (n) => n.endsWith('.md'))) {
  const rel = relpath(file);
  const cleaned = stripFencesAndPlaceholders(read(file));
  const tokens = new Set(cleaned.match(HANDLE_RE) || []);
  for (const token of tokens) {
    const role = token.slice(1);
    if (RESERVED_HANDLE_ROOTS.has(role)) continue;
    if (validRoles.has(role)) continue;
    const entry = orphanHandles.get(role);
    if (entry) entry.count += 1;
    else orphanHandles.set(role, { first: rel, count: 1 });
  }
}
for (const role of [...orphanHandles.keys()].sort()) {
  const { first, count } = /** @type {{first: string, count: number}} */ (orphanHandles.get(role));
  // Refs to other pack agents (`@dude-pack-<pack>-<slug>`) downgrade to a
  // warning: a sibling pack may not be installed in this bundle, and pack
  // routing legitimately mentions specialists from related packs.
  const report = role.startsWith('dude-pack-') ? warn : fail;
  if (count > 1) report(`orphan @${role} reference in ${first} (+${count - 1} more)`);
  else report(`orphan @${role} reference in ${first}`);
}

// --- Check 5: coordinator-only block in non-dude / non-spec-lead agents ------
for (const file of listFiles(path.join(ROOT, '.github/agents'), '.agent.md')) {
  const base = path.basename(file);
  if (base === 'dude.agent.md' || base === 'dude-spec-lead.agent.md') continue;
  if (!read(file).includes('**Coordinator-only artifacts:**')) {
    fail(
      `${relpath(file)}  missing '**Coordinator-only artifacts:**' boundary block (see team-expansion template)`,
    );
  }
}

// --- Check 6: orphan skill references ---------------------------------------
/** @type {Set<string>} */
const validSkills = new Set();
for (const dir of listDirs(path.join(ROOT, '.github/skills'))) {
  validSkills.add(path.basename(dir).toLowerCase());
}
const SKILL_REF_RE = /\.github\/skills\/([a-z](?:[a-z0-9-]*[a-z0-9])?)/g;
/** @type {Map<string, { first: string, count: number }>} */
const orphanSkills = new Map();
for (const file of walkMatch(path.join(ROOT, '.github'), (n) => n.endsWith('.md'))) {
  const rel = relpath(file);
  const cleaned = stripFencesAndPlaceholders(read(file));
  /** @type {Set<string>} */
  const names = new Set();
  for (const m of cleaned.matchAll(SKILL_REF_RE)) names.add(m[1]);
  for (const name of names) {
    if (RESERVED_HANDLE_ROOTS.has(name)) continue;
    if (validSkills.has(name)) continue;
    const entry = orphanSkills.get(name);
    if (entry) entry.count += 1;
    else orphanSkills.set(name, { first: rel, count: 1 });
  }
}
for (const name of [...orphanSkills.keys()].sort()) {
  const { first, count } = /** @type {{first: string, count: number}} */ (orphanSkills.get(name));
  // Refs to other pack skills (`.github/skills/dude-pack-<pack>-<slug>/`)
  // downgrade to a warning for the same reason as @-handle refs above: a
  // sibling pack may not be installed in this bundle.
  const report = name.startsWith('dude-pack-') ? warn : fail;
  if (count > 1) report(`orphan skill reference .github/skills/${name}/ in ${first} (+${count - 1} more)`);
  else report(`orphan skill reference .github/skills/${name}/ in ${first}`);
}

// --- Summary -----------------------------------------------------------------
info(
  `Scanned: ${counts.brainstorm} brainstorm, ${counts.taskfile} task file(s), ${counts.memoryfile} memory file(s), ${counts.agent} agent(s)`,
);
info(`Findings: ${counts.warn} warning(s), ${counts.fail} failure(s)`);

process.exit(counts.fail > 0 ? 1 : 0);
