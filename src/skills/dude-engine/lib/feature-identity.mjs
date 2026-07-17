// @ts-check
/** Strict ledger frontmatter and canonical feature identity helpers. */

import fs from 'node:fs';
import path from 'node:path';

export const SPEC_IDENTITY_KIND = Object.freeze({
  CANONICAL: 'canonical',
});

/**
 * @typedef {{ key: string, value: string, raw: string, quote: string, prefix: string, lineIndex: number }} FrontmatterScalar
 * @typedef {{ newline: string, lines: string[], endIndex: number, scalars: Map<string, FrontmatterScalar> }} ParsedFrontmatter
 */

/**
 * Parse strict top-level scalar metadata while preserving line and quote style.
 * Unrelated nested YAML remains opaque by default. When `options.canonicalKeys`
 * is supplied, the parser enters an opt-in strict canonical-owner mode that
 * throws on any non-scalar line, non-allowlisted key, or unquoted structured
 * flow value; the default (optionless) mode is unchanged.
 * @param {string | Buffer} content
 * @param {{ canonicalKeys?: readonly string[] }} [options]
 * @returns {ParsedFrontmatter}
 */
export function parseFrontmatterScalars(content, options = {}) {
  const canonicalKeys = Array.isArray(options.canonicalKeys) ? options.canonicalKeys : null;
  const text = String(content);
  const newlineMatch = /\r\n|\n|\r/.exec(text);
  const newline = newlineMatch ? newlineMatch[0] : '\n';
  const lines = text.split(/\r\n|\n|\r/);
  if (lines[0] !== '---') throw new Error('frontmatter opening delimiter is missing or malformed');
  const endIndex = lines.indexOf('---', 1);
  if (endIndex < 0) throw new Error('frontmatter closing delimiter is missing or malformed');

  /** @type {Map<string, FrontmatterScalar>} */
  const scalars = new Map();
  for (let lineIndex = 1; lineIndex < endIndex; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = /^([A-Za-z_][A-Za-z0-9_-]*)([ \t]*:[ \t]*)(.*)$/.exec(line);
    if (!match) {
      if (canonicalKeys && line.trim() !== '') {
        throw new Error(`frontmatter line is not a canonical scalar: '${line}'`);
      }
      continue;
    }
    const key = match[1];
    if (canonicalKeys && !canonicalKeys.includes(key)) {
      throw new Error(`frontmatter key '${key}' is not a canonical owner key`);
    }
    if (scalars.has(key)) throw new Error(`duplicate frontmatter key '${key}'`);
    const raw = match[3].replace(/[ \t]+$/, '');
    const trimmed = raw.trim();
    let quote = '';
    let value = trimmed;
    if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.endsWith('"') || trimmed.endsWith("'")) {
      if (trimmed.length < 2
        || !((trimmed.startsWith('"') && trimmed.endsWith('"'))
          || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
        throw new Error(`frontmatter key '${key}' has a malformed quoted scalar`);
      }
      quote = trimmed[0];
      value = trimmed.slice(1, -1);
    } else if (canonicalKeys && (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
      throw new Error(`frontmatter key '${key}' has a structured flow value`);
    }
    scalars.set(key, {
      key,
      value,
      raw,
      quote,
      prefix: `${match[1]}${match[2]}`,
      lineIndex,
    });
  }
  return { newline, lines, endIndex, scalars };
}

/**
 * @typedef {{ kind: string, feature: string, path: string }} SpecIdentity
 */

/**
 * Parse exactly `.dude/specs/<feature>/spec.md`, rejecting alternate
 * separators/traversal.
 * @param {string} value
 * @returns {SpecIdentity | null}
 */
export function parseSpecIdentity(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) return null;
  const match = /^\.dude\/specs\/([^/]+)\/spec\.md$/.exec(value);
  if (!match || match[1] === '.' || match[1] === '..') return null;
  return {
    kind: SPEC_IDENTITY_KIND.CANONICAL,
    feature: match[1],
    path: value,
  };
}

/** @param {SpecIdentity} identity @returns {string} */
export function canonicalSpecIdentity(identity) {
  return `.dude/specs/${identity.feature}/spec.md`;
}

/**
 * Resolve a valid spec identity below the workspace and reject any existing
 * symbolic-link component. Optionally require a regular file target.
 * @param {string} root
 * @param {string} value
 * @param {{ canonicalOnly?: boolean, mustExist?: boolean }} [options]
 * @returns {string}
 */
export function resolveSpecIdentity(root, value, options = {}) {
  const identity = parseSpecIdentity(value);
  if (!identity || (options.canonicalOnly && identity.kind !== SPEC_IDENTITY_KIND.CANONICAL)) {
    throw new Error(`unsafe spec identity '${value}'`);
  }
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ...value.split('/'));
  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error(`spec identity escapes workspace: '${value}'`);

  let cursor = absoluteRoot;
  for (const part of value.split('/')) {
    cursor = path.join(cursor, part);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`spec identity contains symbolic link: '${value}'`);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  if (options.mustExist) {
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`spec identity target does not exist: '${value}'`);
      }
      throw error;
    }
    if (!stat.isFile()) throw new Error(`spec identity target is not a regular file: '${value}'`);
  }
  return absolutePath;
}
