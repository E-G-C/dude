// @ts-check
/**
 * Canonical Dude workspace paths and mutation-safe path resolution.
 *
 * Engine files remain under `.github/` because VS Code discovers them there.
 * Dude-created project state belongs under `.dude/`.
 */

import fs from 'node:fs';
import path from 'node:path';

const IDEAS_DIR = '.dude/ideas';

export const WORKSPACE_PATHS = Object.freeze({
  ROOT: '.dude',
  IDEAS_DIR,
  SPECS_DIR: '.dude/specs',
  MEMORY_DIR: '.dude/memory',
  STATE_DIR: '.dude/state',
  METADATA_DIR: '.dude/metadata',
  TASK_STATE: '.dude/state/task-state.json',
  BUNDLE_MANIFEST: '.dude/metadata/bundle-manifest.md',
  PROFILE: '.dude/metadata/profile.md',
  UPGRADE_LOG: '.dude/metadata/upgrade-log.md',
});

export const ENGINE_PATHS = Object.freeze({
  ROOT: '.github',
  AGENTS_DIR: '.github/agents',
  SKILLS_DIR: '.github/skills',
  INSTRUCTIONS_DIR: '.github/instructions',
  WORKFLOWS_DIR: '.github/workflows',
});

/**
 * Normalize a path for comparison without accepting it for filesystem access.
 * @param {string} relPath
 * @returns {string}
 */
export function normalizeWorkspacePath(relPath) {
  return String(relPath)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
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
 * Resolve a validated workspace-relative path below a root.
 * @param {string} root
 * @param {string} relPath
 * @returns {string}
 */
export function resolveWorkspacePath(root, relPath) {
  const normalized = normalizeWorkspacePath(relPath);
  if (!normalized
    || path.posix.isAbsolute(normalized)
    || path.win32.isAbsolute(normalized)
    || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`unsafe workspace-relative path: ${relPath}`);
  }

  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ...normalized.split('/'));
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`path escapes workspace root: ${relPath}`);
  }
  return absolutePath;
}

/**
 * Resolve one mutation target while refusing symbolic links or non-directory
 * parent components. Existing components are also realpath-checked against the
 * real workspace root. Missing suffixes are allowed for new files/directories.
 * @param {string} root
 * @param {string} relPath
 * @returns {string}
 */
export function resolveMutationPath(root, relPath) {
  const absoluteRoot = path.resolve(root);
  const rootStat = lstatOrNull(absoluteRoot);
  if (!rootStat) throw new Error(`workspace root does not exist: ${absoluteRoot}`);
  if (rootStat.isSymbolicLink()) throw new Error('workspace root must not be a symbolic link');
  if (!rootStat.isDirectory()) throw new Error(`workspace root must be a directory: ${absoluteRoot}`);
  const realRoot = fs.realpathSync(absoluteRoot);
  const absolutePath = resolveWorkspacePath(absoluteRoot, relPath);
  const parts = path.relative(absoluteRoot, absolutePath).split(path.sep).filter(Boolean);
  let cursor = absoluteRoot;
  let missingParent = false;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const stat = lstatOrNull(cursor);
    if (!stat) {
      missingParent = true;
      continue;
    }
    const relative = normalizeWorkspacePath(path.relative(absoluteRoot, cursor));
    if (missingParent) throw new Error(`unsafe mutation target changed during validation: ${relPath}`);
    if (stat.isSymbolicLink()) {
      throw new Error(`unsafe mutation target '${relPath}' contains symbolic link '${relative}'`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`unsafe mutation target '${relPath}' has non-directory parent '${relative}'`);
    }
    const realComponent = fs.realpathSync(cursor);
    if (realComponent !== realRoot && !realComponent.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`unsafe mutation target '${relPath}' escapes the workspace through '${relative}'`);
    }
  }
  return absolutePath;
}
