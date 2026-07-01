#!/usr/bin/env node
// @ts-check
/**
 * Shared text-normalization helpers for the Dude bundle engine.
 *
 * Pure string transforms plus a small file/CLI wrapper. Used by `dude-compose`
 * (normalize fetched-from-source packs on install) and the scaffolding /
 * import tooling. Dependency-free ESM, Node >= 20.
 *
 * The transforms are deliberately conservative so they are safe to run on any
 * text artifact the bundle ships:
 *   - line endings: CRLF / lone CR  -> LF
 *   - trailing whitespace stripped per line
 *   - exactly one final newline on non-empty content
 *
 * All transforms are idempotent: `normalizeString(normalizeString(s)) === normalizeString(s)`.
 *
 * CLI: `node text.mjs <path...>` normalizes each file (or every text file under
 * a directory) in place, printing the ones it changed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * File extensions treated as text for in-place normalization. Anything else is
 * left byte-for-byte (binary siblings, images, fonts, etc.).
 * @type {ReadonlySet<string>}
 */
export const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.yml',
  '.yaml',
  '.json',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.xml',
  '.svg',
  '.sh',
  '.ps1',
  '.toml',
]);

/**
 * @param {string} filePath
 * @returns {boolean} true when the path's extension is a known text type.
 */
export function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(String(filePath)).toLowerCase());
}

/**
 * Normalize CRLF and lone CR to LF.
 * @param {string} s
 * @returns {string}
 */
export function normalizeLineEndings(s) {
  return String(s).replace(/\r\n?/g, '\n');
}

/**
 * Strip trailing spaces and tabs from the end of every line.
 * @param {string} s
 * @returns {string}
 */
export function stripTrailingWs(s) {
  return String(s).replace(/[ \t]+(?=\n)/g, '').replace(/[ \t]+$/, '');
}

/**
 * Ensure the content ends with exactly one newline (empty content stays empty).
 * @param {string} s
 * @returns {string}
 */
export function ensureFinalNewline(s) {
  const str = String(s);
  if (str.length === 0) return str;
  return str.replace(/\n*$/, '\n');
}

/**
 * Apply all normalization transforms. Idempotent.
 * @param {string} s
 * @returns {string}
 */
export function normalizeString(s) {
  return ensureFinalNewline(stripTrailingWs(normalizeLineEndings(s)));
}

/**
 * Normalize a single file in place. Only rewrites when the content changes, so
 * it is safe to run repeatedly and does not churn mtimes needlessly.
 * @param {string} filePath
 * @returns {boolean} true when the file was rewritten.
 */
export function normalizeFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const normalized = normalizeString(original);
  if (normalized === original) return false;
  fs.writeFileSync(filePath, normalized);
  return true;
}

/**
 * Recursively yield every file path under a directory (absolute).
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/**
 * Normalize a file, or every text file under a directory, in place.
 * @param {string} target file or directory path
 * @returns {string[]} the paths that were changed
 */
export function normalizePath(target) {
  /** @type {string[]} */
  const changed = [];
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const f of walkFiles(target)) {
      if (isTextFile(f) && normalizeFile(f)) changed.push(f);
    }
  } else if (isTextFile(target) && normalizeFile(target)) {
    changed.push(target);
  }
  return changed;
}

/**
 * Is this module being executed directly (vs. imported)? Robust to spaces in
 * the path and to symlinked temp dirs.
 * @param {string} metaUrl `import.meta.url`
 * @param {string | undefined} argv1 `process.argv[1]`
 * @returns {boolean}
 */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

function main() {
  const targets = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (targets.length === 0) {
    process.stdout.write('usage: node text.mjs <path...>\n');
    process.exit(1);
  }
  /** @type {string[]} */
  let changed = [];
  for (const t of targets) {
    try {
      changed = changed.concat(normalizePath(path.resolve(t)));
    } catch (err) {
      process.stderr.write(`[FAIL] ${t}: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(2);
    }
  }
  if (changed.length === 0) process.stdout.write('[OK] nothing to normalize\n');
  else for (const c of changed) process.stdout.write(`[normalized] ${c}\n`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}
