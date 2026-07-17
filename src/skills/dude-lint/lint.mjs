#!/usr/bin/env node
// @ts-check
/**
 * Static linter for the Dude bundle (Node port of lint.sh / lint.ps1).
 *
 * Validates structural conventions across `.dude/` and `.github/`.
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
import { inventoryDefinedFeatures } from '../dude-engine/lib/feature.mjs';
import {
  BOARD_END as TASK_BOARD_END,
  BOARD_NOTICE as TASK_BOARD_NOTICE,
  BOARD_START as TASK_BOARD_START,
  CANONICAL_NOTICE as TASK_CANONICAL_NOTICE,
} from '../dude-engine/lib/tasks.mjs';
import { parseProfileDocument } from '../dude-engine/lib/profile.mjs';
import { WORKSPACE_PATHS } from '../dude-engine/lib/workspace-paths.mjs';
import { parseTaskState } from '../dude-engine/lib/task-state.mjs';

const ROOT = path.resolve(process.argv[2] || '.');

const counts = {
  warn: 0,
  fail: 0,
  idea: 0,
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

/** @param {string} abs @returns {fs.Stats | null} */
function lstatOrNull(abs) {
  try {
    return fs.lstatSync(abs);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Check a workspace-relative path without following symbolic links.
 * @param {string} rel
 * @returns {string | null}
 */
function unsafeRegularFileDetail(rel) {
  let cursor = ROOT;
  const parts = rel.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const stat = lstatOrNull(cursor);
    const currentRel = parts.slice(0, index + 1).join('/');
    if (!stat) return `is missing or does not exist at '${currentRel}'`;
    if (stat.isSymbolicLink()) return `is not a regular file/unsafe because '${currentRel}' is a symbolic link`;
    if (index < parts.length - 1 && !stat.isDirectory()) {
      return `is not a regular file/unsafe because ancestor '${currentRel}' is not a directory`;
    }
    if (index === parts.length - 1 && !stat.isFile()) return 'is not a regular file/unsafe';
  }
  return null;
}

/** @param {string} content @returns {string[]} */
function splitLines(content) {
  return content.split(/\r\n|\n|\r/);
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
    // From inline `code` spans, keep only real Dude references (handles and
    // skill paths) and drop the rest. This stops code-syntax tokens such as
    // SCSS `@import` / `@use`, JSDoc `@param`, or shell flags from registering
    // as Dude handles, while still validating backticked references like
    // `@dude-pack-hugo-site-architect` — even when a span mixes both, e.g.
    // `@use ".github/skills/dude-pack-ms-brand-visual/..." as ms`.
    .replace(/`[^`\n]*`/g, (span) => {
      const refs = span.match(/@dude\b[\w-]*|\.github\/skills\/dude-[\w-]*/g);
      return refs ? refs.join(' ') : '';
    })
    .replace(/-<[A-Za-z][A-Za-z0-9_-]*>/g, '')
    .replace(/<[A-Za-z][A-Za-z0-9_-]*>/g, '');
}

const MANAGED_START = /<!--\s*dude:managed:start\s*-->/;
const MANAGED_END = /<!--\s*dude:managed:end\s*-->/;
const BOARD_START = /<!--\s*dude:board:start\s*-->/;
const BOARD_END = /<!--\s*dude:board:end\s*-->/;
const BOARD_START_ANCHORED = /^\s*<!--\s*dude:board:start\s*-->\s*$/;
const BOARD_END_ANCHORED = /^\s*<!--\s*dude:board:end\s*-->\s*$/;

/** @typedef {{ ideaPath: string, specPath: string }} FeatureRecord */

/**
 * Return safe direct Markdown ledgers for body-only structural checks. Feature
 * inventory already reports every unsafe or unsupported path, so this pass is
 * deliberately silent when a path cannot be read safely.
 * @returns {string[]}
 */
function structuralIdeaFiles() {
  let ideasRoot = ROOT;
  for (const part of WORKSPACE_PATHS.IDEAS_DIR.split('/')) {
    ideasRoot = path.join(ideasRoot, part);
    let stat;
    try {
      stat = fs.lstatSync(ideasRoot);
    } catch {
      return [];
    }
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return [];
  }

  let entries;
  try {
    entries = fs.readdirSync(ideasRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(ideasRoot, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink() && stat.isFile() && entry.name.endsWith('.md')) files.push(absolutePath);
  }
  return files;
}

/**
 * Count exact ledger headings outside CommonMark backtick and tilde fences.
 * @param {string} content
 * @returns {{ idea: number, userDraft: number, coordinatorLog: number }}
 */
function realLedgerHeadings(content) {
  const headings = { idea: 0, userDraft: 0, coordinatorLog: 0 };
  /** @type {{ marker: string, length: number } | null} */
  let fence = null;
  for (const line of splitLines(content)) {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { marker: open[1][0], length: open[1].length };
      continue;
    }
    const heading = /^ {0,3}##[ \t]+(Idea|User Draft|Coordinator Log)((?:[ \t]+#+)?[ \t]*)$/.exec(line);
    if (heading?.[1] === 'Idea') headings.idea += 1;
    else if (heading?.[1] === 'User Draft') headings.userDraft += 1;
    else if (heading?.[1] === 'Coordinator Log') headings.coordinatorLog += 1;
  }
  return headings;
}

/**
 * Validate body-only structure in one canonical idea ledger.
 * @param {string} file
 * @param {(message: string) => void} report
 */
function validateLedgerStructure(file, report) {
  const rel = relpath(file);
  let content;
  try {
    content = read(file);
  } catch {
    return;
  }

  const lines = splitLines(content);
  const managedStarts = countLines(lines, MANAGED_START);
  const managedEnds = countLines(lines, MANAGED_END);
  if (managedStarts !== managedEnds) {
    report(`${rel}  unbalanced managed fences (${managedStarts} start / ${managedEnds} end)`);
  } else {
    for (const error of fenceOrderErrors(lines, MANAGED_START, MANAGED_END)) {
      report(`${rel}  managed fence: ${error}`);
    }
  }

  const headings = realLedgerHeadings(content);
  if (headings.idea === 0) report(`${rel}  missing real '## Idea' heading outside fenced blocks`);
  else if (headings.idea > 1) report(`${rel}  duplicate real '## Idea' headings outside fenced blocks`);
  if (headings.userDraft > 0) {
    report(`${rel}  canonical ideas must not contain the noncanonical '## User Draft' heading outside fenced blocks`);
  }
  if (headings.coordinatorLog === 0) {
    report(`${rel}  missing real '## Coordinator Log' heading outside fenced blocks`);
  } else if (headings.coordinatorLog > 1) {
    report(`${rel}  duplicate real '## Coordinator Log' headings outside fenced blocks`);
  }
}

/**
 * Print the run summary and exit with the conventional status code (1 when any
 * failure was recorded, else 0). Centralized so an unsafe workspace root can
 * terminate deterministically without leaving a half-printed report.
 */
function finishAndExit() {
  info(
    `Scanned: ${counts.idea} idea(s), ${counts.taskfile} task file(s), ${counts.memoryfile} memory file(s), ${counts.agent} agent(s)`,
  );
  info(`Findings: ${counts.warn} warning(s), ${counts.fail} failure(s)`);
  process.exit(counts.fail > 0 ? 1 : 0);
}

const rootStat = lstatOrNull(ROOT);
const workspaceRootSafe = Boolean(rootStat?.isDirectory() && !rootStat.isSymbolicLink());
if (!rootStat) fail(`workspace root does not exist: ${ROOT}`);
else if (rootStat.isSymbolicLink()) fail(`workspace root is unsafe because it is a symbolic link: ${ROOT}`);
else if (!rootStat.isDirectory()) fail(`workspace root is not a directory: ${ROOT}`);
// A missing, symlinked, or non-directory workspace root is unsafe to traverse:
// halt immediately so no .dude or .github file is read, scanned, or parsed.
if (!workspaceRootSafe) finishAndExit();

const featureInventory = inventoryDefinedFeatures({ root: ROOT });
for (const diagnostic of featureInventory.diagnostics) {
  const report = diagnostic.severity === 'error' ? fail : warn;
  report(`${diagnostic.path}  ${diagnostic.message} [${diagnostic.code}]`);
}

/** @type {Map<string, FeatureRecord>} */
const featuresByIdeaPath = new Map();
/** @type {Map<string, FeatureRecord[]>} */
const ideaOwners = new Map();
for (const feature of featureInventory.features) {
  featuresByIdeaPath.set(feature.ideaPath, feature);
  if (!ideaOwners.has(feature.specPath)) ideaOwners.set(feature.specPath, []);
  ideaOwners.get(feature.specPath)?.push(feature);
}

for (const file of structuralIdeaFiles()) {
  counts.idea += 1;
  validateLedgerStructure(file, fail);
}

info(`Scanning .github + .dude under ${ROOT}`);

// --- Check 2: tasks files ---------------------------------------------------
const TASK_HEADER =
  /^- \[( |~|!|x)\] T[0-9][0-9][0-9]+@[a-z0-9]{8} (\[P\] )?\[(US[0-9]+|Shared)\] .+$/;
const TASK_LINE = /^\s*-\s*\[.\]\s+/;
const TASK_ID = /T[0-9][0-9][0-9]+@[a-z0-9]{8}/;
const BEADS_TAG = /\(Beads:\s*[A-Za-z0-9_-]+(\s*;[^)]*)?\)/;
const IDEA_AUDIT = /^<!-- audit log: (\.dude\/ideas\/([^/\\#\s]+\.md))#coordinator-log -->$/;

/**
 * Locate the only machine-owned audit line. A rendered board and its canonical
 * notice are a generated preamble; otherwise the literal first line owns it.
 * @param {string[]} lines
 * @param {boolean} boardValid
 * @returns {{ line: string, lineNo: number, error: string | null }}
 */
function firstCanonicalTaskLine(lines, boardValid) {
  if (lines[0] !== TASK_BOARD_START) {
    return { line: lines[0] || '', lineNo: 1, error: null };
  }
  if (!boardValid || lines[1] !== TASK_BOARD_NOTICE) {
    return { line: '', lineNo: 1, error: 'rendered board preamble is malformed or missing its generated notice' };
  }
  const boardEnd = lines.indexOf(TASK_BOARD_END, 2);
  if (boardEnd < 0) {
    return { line: '', lineNo: 1, error: 'rendered board preamble has no closing board fence' };
  }
  let index = boardEnd + 1;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  if (lines[index] !== TASK_CANONICAL_NOTICE) {
    return {
      line: '',
      lineNo: index + 1,
      error: `rendered board preamble must be followed by '${TASK_CANONICAL_NOTICE}'`,
    };
  }
  index += 1;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  return { line: lines[index] || '', lineNo: index + 1, error: null };
}

/**
 * Require the breadcrumb target to be the unique defined ledger owner.
 * @param {string} taskRel
 * @param {string} packageSpec
 * @param {string} targetPath
 * @param {Map<string, FeatureRecord>} featuresByIdea
 * @param {Map<string, FeatureRecord[]>} owners
 */
function validateTaskOwner(taskRel, packageSpec, targetPath, featuresByIdea, owners) {
  const packageOwners = owners.get(packageSpec) || [];
  const candidates = packageOwners.length > 0
    ? packageOwners.map((feature) => feature.ideaPath).join(', ')
    : '(none)';
  const target = featuresByIdea.get(targetPath);
  if (packageOwners.length === 0) {
    fail(
      `${taskRel}  package ${packageSpec} has no defined idea owner; breadcrumb target ${targetPath}; `
      + `candidate owners: ${candidates}`,
    );
  } else if (!target) {
    fail(
      `${taskRel}  audit breadcrumb target ${targetPath} is not a valid defined feature owner for package `
      + `${packageSpec}; candidate owners: ${candidates}`,
    );
  } else if (packageOwners.length !== 1) {
    fail(
      `${taskRel}  package ${packageSpec} does not have exactly one valid defined feature owner; `
      + `breadcrumb target ${targetPath}; `
      + `candidate owners: ${candidates}`,
    );
  } else if (packageOwners[0].ideaPath !== targetPath) {
    fail(
      `${taskRel}  audit breadcrumb target mismatch for package ${packageSpec}: ${targetPath} points to `
      + `${target.specPath}, but the unique owner is ${packageOwners[0].ideaPath}; candidate owners: ${candidates}`,
    );
  }
}

for (const file of walkMatch(path.join(ROOT, ...WORKSPACE_PATHS.SPECS_DIR.split('/')), (n) => n === 'tasks.md')) {
  counts.taskfile += 1;
  const rel = relpath(file);
  const content = read(file);
  const lines = splitLines(content);
  const packageSpec = `${path.posix.dirname(rel)}/spec.md`;
  const packageSpecIssue = unsafeRegularFileDetail(packageSpec);
  if (packageSpecIssue) fail(`${rel}  task package ${packageSpec} ${packageSpecIssue}`);

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

  const audit = firstCanonicalTaskLine(lines, skipBoard && bStart === 1 && bEnd === 1);
  if (audit.error) {
    fail(`${rel}:${audit.lineNo}  ${audit.error}; the first canonical line must be the exact audit breadcrumb`);
  } else {
    const ideaAudit = IDEA_AUDIT.exec(audit.line);
    if (ideaAudit) {
      validateTaskOwner(rel, packageSpec, ideaAudit[1], featuresByIdeaPath, ideaOwners);
    } else {
      fail(
        `${rel}:${audit.lineNo}  first canonical line must be exactly `
        + `'<!-- audit log: .dude/ideas/<slug>.md#coordinator-log -->'`,
      );
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

// --- Check 2a: current install profile --------------------------------------
const profilePath = path.join(ROOT, ...WORKSPACE_PATHS.PROFILE.split('/'));
const profileIssue = unsafeRegularFileDetail(WORKSPACE_PATHS.PROFILE);
if (profileIssue) {
  if (profileIssue.startsWith('is missing')) {
    fail(`${WORKSPACE_PATHS.PROFILE}  missing current canonical profile`);
  } else {
    fail(`${WORKSPACE_PATHS.PROFILE}  ${profileIssue}`);
  }
} else {
  try {
    const profile = parseProfileDocument(read(profilePath), { root: ROOT });
    for (const [name, entry] of Object.entries(profile.installed)) {
      if (!entry.inventory) {
        fail(`${WORKSPACE_PATHS.PROFILE}  installed.${name} must include a complete current inventory`);
      }
    }
    // enabled_packs must equal the installed key set. parseProfileDocument
    // already rejects any installed pack missing from enabled_packs (installed
    // ⊆ enabled); this closes the other direction so the two sets stay exactly
    // equal (compared as sorted sets).
    const installedKeys = new Set(Object.keys(profile.installed));
    const enabledNotInstalled = [...profile.enabled_packs]
      .filter((name) => !installedKeys.has(name))
      .sort();
    if (enabledNotInstalled.length > 0) {
      fail(
        `${WORKSPACE_PATHS.PROFILE}  enabled pack(s) not installed: ${enabledNotInstalled.join(', ')}`,
      );
    }
  } catch (error) {
    fail(
      `${WORKSPACE_PATHS.PROFILE}  invalid current profile `
      + `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

// --- Check 2b: task-state snapshot identity --------------------------------
const taskStatePath = path.join(ROOT, ...WORKSPACE_PATHS.TASK_STATE.split('/'));
const taskStateIssue = unsafeRegularFileDetail(WORKSPACE_PATHS.TASK_STATE);
if (taskStateIssue && !taskStateIssue.startsWith('is missing')) {
  fail(`${WORKSPACE_PATHS.TASK_STATE}  ${taskStateIssue}`);
} else if (!taskStateIssue) {
  const r = parseTaskState(read(taskStatePath));
  if (r.status === 'corrupt') fail(`${WORKSPACE_PATHS.TASK_STATE}  ${r.reason}`);
}

// --- Check 3: memory files --------------------------------------------------
for (const file of listFiles(path.join(ROOT, ...WORKSPACE_PATHS.MEMORY_DIR.split('/')), '.md')) {
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
const canonicalManifest = path.join(ROOT, ...WORKSPACE_PATHS.BUNDLE_MANIFEST.split('/'));
const MANIFEST = canonicalManifest;
const ALLOWED_MANIFEST_KEYS = new Set(['source_repo', 'source_ref', 'installed_ref']);
const manifestIssue = unsafeRegularFileDetail(WORKSPACE_PATHS.BUNDLE_MANIFEST);
if (manifestIssue?.startsWith('is missing')) {
  fail(`${WORKSPACE_PATHS.BUNDLE_MANIFEST}  missing seeded bundle manifest`);
} else if (manifestIssue) {
  fail(`${WORKSPACE_PATHS.BUNDLE_MANIFEST}  ${manifestIssue}`);
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
      if (parsed.installed_ref !== undefined && typeof parsed.installed_ref !== 'string') {
        fail(`${manifestRel}  installed_ref must be a string`);
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
finishAndExit();
