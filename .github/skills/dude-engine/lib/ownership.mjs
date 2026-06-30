// @ts-check
/**
 * Shared ownership / namespace classifier for the Dude bundle engine.
 *
 * Used by `dude-lint` and `dude-bundle-upgrade` to decide which engine tier a
 * file belongs to. This is the single source of truth for the namespace
 * convention; it replaces the per-script `is_base_path` / `enumerate_base_paths`
 * shell logic and adds the `dude-pack-*` tier.
 *
 * Tiers (paths are repo-relative, forward-slash):
 *
 *   core    upstream-owned base files; overwritten by `@dude upgrade`
 *           .github/agents/dude.agent.md
 *           .github/agents/dude-<slug>.agent.md     (NOT dude-local-*, NOT dude-pack-*)
 *           .github/skills/dude-<slug>/**           (NOT dude-local-*, NOT dude-pack-*)
 *           .github/instructions/dude.instructions.md
 *
 *   pack    installed capability packs; owned per-pack, preserved by core upgrade
 *           .github/agents/dude-pack-<pack>-<slug>.agent.md
 *           .github/skills/dude-pack-<pack>-<slug>/**
 *
 *   local   project-owned customizations; never touched by upgrade
 *           .github/agents/dude-local-<slug>.agent.md
 *           .github/skills/dude-local-<slug>/**
 *
 *   project anything else under the repo (incl. the `project` skill, project
 *           instruction files, docs, product source); never touched by upgrade
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Engine ownership tiers.
 * @readonly
 * @enum {string}
 */
export const TIER = Object.freeze({
  CORE: 'core',
  PACK: 'pack',
  LOCAL: 'local',
  PROJECT: 'project',
});

/**
 * Normalize a path for classification: forward slashes, no leading `./`,
 * no trailing slash.
 * @param {string} relPath
 * @returns {string}
 */
function normalize(relPath) {
  return String(relPath)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

/**
 * Classify a repo-relative path into an engine ownership tier.
 * @param {string} relPath
 * @returns {TIER}
 */
export function classifyPath(relPath) {
  const p = normalize(relPath);

  // The always-on bundle instructions file is the only core instruction file.
  if (p === '.github/instructions/dude.instructions.md') return TIER.CORE;

  // Agents are flat `*.agent.md` files directly under .github/agents/.
  const agent = /^\.github\/agents\/([^/]+)\.agent\.md$/.exec(p);
  if (agent) return classifyName(agent[1]);

  // Skills are directories under .github/skills/ (classify by the directory).
  const skill = /^\.github\/skills\/([^/]+)(?:\/.*)?$/.exec(p);
  if (skill) {
    // The `project` skill is project-owned, not core.
    if (skill[1] === 'project') return TIER.PROJECT;
    return classifyName(skill[1]);
  }

  return TIER.PROJECT;
}

/**
 * Classify a bare artifact name (agent basename without extension, or skill
 * directory name) into a tier by namespace prefix.
 * @param {string} name
 * @returns {TIER}
 */
function classifyName(name) {
  if (name === 'dude') return TIER.CORE;
  if (name.startsWith('dude-local-')) return TIER.LOCAL;
  if (name.startsWith('dude-pack-')) return TIER.PACK;
  if (name.startsWith('dude-')) return TIER.CORE;
  return TIER.PROJECT;
}

/**
 * @param {string} relPath
 * @returns {boolean} true if the path is core (upstream-owned) — the successor
 *   to the old `is_base_path` predicate.
 */
export function isCorePath(relPath) {
  return classifyPath(relPath) === TIER.CORE;
}

/**
 * @param {string} relPath
 * @returns {boolean} true if the path belongs to any installed pack.
 */
export function isPackPath(relPath) {
  return classifyPath(relPath) === TIER.PACK;
}

/**
 * @param {string} relPath
 * @returns {boolean} true if the path is a project-local (`dude-local-*`) artifact.
 */
export function isLocalPath(relPath) {
  return classifyPath(relPath) === TIER.LOCAL;
}

/**
 * Does a path belong to a specific named pack?
 *
 * Matches the literal artifact prefix `dude-pack-<packName>-`. Note: pack names
 * must not be hyphen-prefixes of one another (e.g. `hugo` and `hugo-docsy`)
 * because removal matches on this prefix; the add-pack flow should reject such a
 * collision.
 * @param {string} relPath
 * @param {string} packName
 * @returns {boolean}
 */
export function belongsToPack(relPath, packName) {
  const p = normalize(relPath);
  const prefix = `dude-pack-${packName}-`;
  const agent = /^\.github\/agents\/([^/]+)\.agent\.md$/.exec(p);
  if (agent) return agent[1].startsWith(prefix);
  const skill = /^\.github\/skills\/([^/]+)(?:\/.*)?$/.exec(p);
  if (skill) return skill[1].startsWith(prefix);
  return false;
}

/**
 * @param {string} abs
 * @returns {boolean}
 */
function isDir(abs) {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} abs
 * @returns {boolean}
 */
function isFile(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Recursively yield every file path (absolute) under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Enumerate every core (upstream-owned) file path under a repo root, relative
 * to that root, sorted. Successor to the old `enumerate_base_paths`.
 *
 * Ownership is derived purely from the namespace convention; `dude-local-*` and
 * `dude-pack-*` are excluded, as is the project skill.
 * @param {string} root
 * @returns {string[]}
 */
export function enumerateCorePaths(root) {
  /** @type {string[]} */
  const results = [];

  // Agents: dude*.agent.md that classify as core.
  const agentsDir = path.join(root, '.github/agents');
  if (isDir(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.startsWith('dude') || !entry.name.endsWith('.agent.md')) continue;
      const rel = `.github/agents/${entry.name}`;
      if (isCorePath(rel)) results.push(rel);
    }
  }

  // The always-on bundle instructions file.
  const instructions = '.github/instructions/dude.instructions.md';
  if (isFile(path.join(root, instructions))) results.push(instructions);

  // Skills: every file inside a core skill directory.
  const skillsDir = path.join(root, '.github/skills');
  if (isDir(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (classifyPath(`.github/skills/${entry.name}/`) !== TIER.CORE) continue;
      for (const abs of walkFiles(path.join(skillsDir, entry.name))) {
        // path.relative is robust whether `root` is absolute or relative;
        // a naive `abs.slice(root.length + 1)` corrupts paths when `root`
        // is relative (e.g. `.`), because path.join collapses the `./`.
        results.push(path.relative(root, abs).split(path.sep).join('/'));
      }
    }
  }

  return results.sort();
}
