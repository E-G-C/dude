#!/usr/bin/env node
// @ts-check
/**
 * import.mjs — mechanical prep for `dude-bundle-import`.
 *
 * The deterministic parts of importing an external agent/skill: resolve the
 * source URL, parse frontmatter, plan which fields to strip, normalize the
 * destination filename to the `dude-local-*` namespace, count line endings, and
 * score token-overlap against existing local artifacts. The coordinator keeps
 * the judgment calls (license preservation, persona drift, opt-in tool remap).
 *
 *   analyze <url|path> [--root <dir>] [--json]      -> adaptation report
 *   apply   <url|path> --plan <plan.json> [--root <dir>]
 *
 * `apply` refuses unless the plan records exact destination and structured
 * `license_disposition` decisions bound to the state observed by `analyze`.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { normalizeString } from '../dude-engine/lib/text.mjs';
import { rankOverlap } from '../dude-engine/lib/text-analysis.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import { parseImportFrontmatter, stripImportFrontmatter } from './lib/import-frontmatter.mjs';

/** Fields always stripped from imported frontmatter (Copilot ignores them). */
export const ALWAYS_STRIP = ['compatibility', 'model'];

/** Maximum accepted size of a remote import source. */
export const MAX_REMOTE_SOURCE_BYTES = 1_048_576;

/** @param {string} reason @returns {Error} */
function invalidRemoteUrl(reason) {
  return new Error('invalid remote import URL', { cause: reason });
}

/**
 * Authorize one canonical GitHub remote-file URL and resolve blob URLs to raw.
 * @param {string} source
 * @returns {string}
 */
export function resolveRawUrl(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw invalidRemoteUrl('expected a non-empty URL string');
  }
  if (source.includes('\\')) {
    throw invalidRemoteUrl('backslashes are not allowed');
  }
  if (source.includes('?') || source.includes('#')) {
    throw invalidRemoteUrl('query strings and fragments are not allowed');
  }
  if (/%(?:2f|5c)/i.test(source)) {
    throw invalidRemoteUrl('encoded path separators are not allowed');
  }

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw invalidRemoteUrl('malformed URL');
  }
  if (parsed.protocol !== 'https:') {
    throw invalidRemoteUrl('HTTPS is required');
  }
  if (parsed.username || parsed.password) {
    throw invalidRemoteUrl('credentials are not allowed');
  }
  if (parsed.search || parsed.hash) {
    throw invalidRemoteUrl('query strings and fragments are not allowed');
  }
  if (parsed.port) {
    throw invalidRemoteUrl('only the default HTTPS port is allowed');
  }

  const schemeEnd = source.indexOf('://');
  const authorityStart = schemeEnd + 3;
  const pathStart = source.indexOf('/', authorityStart);
  const rawAuthority = pathStart === -1
    ? source.slice(authorityStart)
    : source.slice(authorityStart, pathStart);
  const allowedAuthorities = new Set([
    'github.com',
    'github.com:443',
    'raw.githubusercontent.com',
    'raw.githubusercontent.com:443',
  ]);
  if (schemeEnd < 0 || !allowedAuthorities.has(rawAuthority)) {
    throw invalidRemoteUrl('hostname is not allowed');
  }
  if (parsed.hostname !== 'github.com' && parsed.hostname !== 'raw.githubusercontent.com') {
    throw invalidRemoteUrl('hostname is not allowed');
  }

  const rawPath = pathStart === -1 ? '' : source.slice(pathStart);
  const segments = rawPath.startsWith('/') ? rawPath.slice(1).split('/') : [];
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw invalidRemoteUrl('path segments must be non-empty');
  }
  if (segments.some((segment) => {
    const dots = segment.replace(/%2e/gi, '.');
    return dots === '.' || dots === '..';
  })) {
    throw invalidRemoteUrl('dot path segments are not allowed');
  }

  if (parsed.hostname === 'github.com') {
    if (segments.length < 5 || segments[2] !== 'blob') {
      throw invalidRemoteUrl('expected a GitHub blob file URL');
    }
    return `https://raw.githubusercontent.com/${[
      segments[0],
      segments[1],
      ...segments.slice(3),
    ].join('/')}`;
  }
  if (segments.length < 4) {
    throw invalidRemoteUrl('expected a raw GitHub file URL');
  }
  return `https://raw.githubusercontent.com/${segments.join('/')}`;
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
 * Resolve the artifact kind from the source name or path, using whether the
 * parsed frontmatter carries a `name` only as an agent-shaped fallback when the
 * filename is not decisive.
 * @param {string} source path or url
 * @param {boolean} hasName
 * @returns {'agent'|'skill'|'unknown'}
 */
function kindFromSource(source, hasName) {
  const base = source.split(/[/\\]/).pop() || '';
  if (base === 'SKILL.md') return 'skill';
  if (base.endsWith('.agent.md') || /\/agents\//.test(source)) return 'agent';
  // body heuristic: frontmatter name + directive prose -> agent
  return hasName ? 'agent' : 'unknown';
}

/**
 * Compute the artifact kind and normalized `dude-local-*` destination from a
 * source path and its already-known frontmatter name, avoiding a second parse
 * of the source under import.
 * @param {string} source path or url
 * @param {string|null} name frontmatter `name`, or null when absent
 * @returns {{ kind: 'agent'|'skill'|'unknown', destRel: string|null }}
 */
function importTargetFromName(source, name) {
  const kind = kindFromSource(source, name !== null);
  const base = source.split(/[/\\]/).pop() || '';
  if (kind === 'agent') {
    return { kind, destRel: `.github/agents/${normalizeAgentDest(base)}` };
  }
  if (kind === 'skill') {
    return { kind, destRel: `.github/skills/${normalizeSkillDir(name)}/SKILL.md` };
  }
  return { kind, destRel: null };
}

/**
 * @param {string} source path or url
 * @param {string} content
 * @returns {'agent'|'skill'|'unknown'}
 */
export function detectKind(source, content) {
  return kindFromSource(source, readFrontmatterKey(content, 'name') !== null);
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
 * @param {unknown} name skill frontmatter `name`
 * @returns {string} destination directory, e.g. `dude-local-my-skill`
 */
export function normalizeSkillDir(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('invalid skill name: expected a non-empty scalar');
  }
  const stem = name.replace(/^dude-(?:local|pack)-/, '');
  if (stem.length === 0) {
    throw new Error('invalid skill name: prefix must be followed by a name');
  }
  if (stem.includes('/') || stem.includes('\\')) {
    throw new Error('invalid skill name: path separators are not allowed');
  }
  if (/[\x00-\x1f\x7f]/.test(stem)) {
    throw new Error('invalid skill name: control characters are not allowed');
  }
  if (stem === '.' || stem === '..') {
    throw new Error('invalid skill name: dot path segments are not allowed');
  }
  if (/%(?:2f|5c)/i.test(stem)) {
    throw new Error('invalid skill name: encoded path separators are not allowed');
  }
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(stem)) {
    throw new Error('invalid skill name: expected one canonical lowercase skill stem');
  }
  return `dude-local-${stem}`;
}

/**
 * @param {string} source path or url
 * @param {string} content
 * @returns {{ kind: 'agent'|'skill'|'unknown', destRel: string|null }}
 */
export function deriveImportTarget(source, content) {
  return importTargetFromName(source, readFrontmatterKey(content, 'name'));
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
 * @param {string} source
 * @returns {boolean}
 */
function isUrlShapedSource(source) {
  // Preserve Windows drive paths (C:\ or C:/) as local before any scheme test.
  if (/^[A-Za-z]:[\\/]/.test(source)) return false;
  // Any leading URI scheme or a protocol-relative `//` authority is URL-shaped
  // and routed through strict resolveRawUrl, which rejects non-HTTPS/non-GitHub
  // forms. A relative path whose first segment contains a colon (e.g.
  // `foo:bar/x.md`) is also treated as URL-shaped and rejected; disambiguate a
  // genuine local file with a `./` prefix.
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(source) || source.startsWith('//');
}

/**
 * Read one remote response under the import size limit.
 * @param {Response} response
 * @param {string} identity
 * @param {AbortController} controller
 * @returns {Promise<Buffer>}
 */
async function readRemoteBytes(response, identity, controller) {
  if (!response.ok) throw new Error(`fetch failed (${response.status}) for ${identity}`);

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength)
      && BigInt(contentLength) > BigInt(MAX_REMOTE_SOURCE_BYTES)) {
    controller.abort();
    try {
      await response.body?.cancel();
    } catch {}
    throw new Error(
      `remote import source exceeds the ${MAX_REMOTE_SOURCE_BYTES}-byte limit: ${identity}`
    );
  }
  if (!response.body) throw new Error(`fetch failed (missing response body) for ${identity}`);

  const reader = response.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_REMOTE_SOURCE_BYTES) {
        controller.abort();
        try {
          await reader.cancel();
        } catch {}
        chunks.length = 0;
        throw new Error(
          `remote import source exceeds the ${MAX_REMOTE_SOURCE_BYTES}-byte limit: ${identity}`
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, byteCount);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Read a source that is either a local path or a URL-shaped remote source once, retaining
 * the exact bytes used for integrity checks.
 * @param {string} source
 * @returns {Promise<{ identity: string, bytes: Buffer, content: string }>}
 */
async function readSource(source) {
  if (isUrlShapedSource(source)) {
    const identity = resolveRawUrl(source);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      try {
        const response = await fetch(identity, {
          signal: controller.signal,
          redirect: 'error',
        });
        const bytes = await readRemoteBytes(response, identity, controller);
        return { identity, bytes, content: bytes.toString('utf8') };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('fetch failed') || message.startsWith('remote import source exceeds')) {
          throw error;
        }
        throw new Error(`fetch failed for ${identity}: ${message}`, { cause: error });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const identity = path.resolve(source);
  const bytes = fs.readFileSync(identity);
  return { identity, bytes, content: bytes.toString('utf8') };
}

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** @param {fs.Stats | fs.BigIntStats} stat @returns {string} */
function statType(stat) {
  if (stat.isFile()) return 'file';
  if (stat.isDirectory()) return 'directory';
  if (stat.isSymbolicLink()) return 'symbolic-link';
  if (stat.isBlockDevice()) return 'block-device';
  if (stat.isCharacterDevice()) return 'character-device';
  if (stat.isFIFO()) return 'fifo';
  if (stat.isSocket()) return 'socket';
  return 'other';
}

/**
 * Snapshot one destination after applying the shared containment and symlink
 * checks. File identity and content are separate so apply can report the kind
 * of drift that invalidated a review.
 * @param {string} root
 * @param {string} relPath
 * @returns {{ absolutePath: string, state: any }}
 */
function snapshotDestination(root, relPath) {
  const absolutePath = resolveMutationPath(root, relPath);
  let stat;
  try {
    stat = fs.lstatSync(absolutePath, { bigint: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { absolutePath, state: { type: 'missing' } };
    }
    throw error;
  }

  if (!stat.isFile()) {
    return { absolutePath, state: { type: statType(stat) } };
  }

  const flags = fs.constants.O_RDONLY
    | (fs.constants.O_NOFOLLOW ?? 0)
    | (fs.constants.O_NONBLOCK ?? 0);
  const descriptor = fs.openSync(absolutePath, flags);
  try {
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStat.isFile()) {
      return { absolutePath, state: { type: statType(openedStat) } };
    }
    const bytes = fs.readFileSync(descriptor);
    return {
      absolutePath,
      state: {
        type: 'file',
        identity: {
          device: openedStat.dev.toString(),
          inode: openedStat.ino.toString(),
        },
        nlink: openedStat.nlink.toString(),
        sha256: sha256(bytes),
      },
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

/** @param {any} state @returns {'create'|'replace'|null} */
function requiredDestinationAction(state) {
  if (state?.type === 'missing') return 'create';
  if (state?.type === 'file') return 'replace';
  return null;
}

/**
 * @param {string} label
 * @param {any} state
 * @param {any} decision
 * @returns {'create'|'replace'}
 */
function requireReviewedDestination(label, state, decision) {
  const action = requiredDestinationAction(state);
  if (!action) {
    throw new Error(`cannot apply: analyzed ${label} must be missing or a regular file`);
  }
  if (!isDeepStrictEqual(decision, { action, state })) {
    throw new Error(
      `cannot apply: ${label} requires an exact reviewed ${action} decision bound to its analyzed state`
    );
  }
  return action;
}

/**
 * @param {string} root
 * @param {string} relPath
 * @param {any} expected
 * @param {string} label
 * @returns {{ absolutePath: string, state: any }}
 */
function preflightDestination(root, relPath, expected, label) {
  const current = snapshotDestination(root, relPath);
  if (expected?.type === 'missing') {
    if (current.state.type === 'missing') return current;
    if (current.state.type === 'file') {
      throw new Error(`cannot apply: ${label} appeared after analysis`);
    }
    throw new Error(`cannot apply: ${label} type drifted from missing to ${current.state.type}`);
  }
  if (expected?.type !== 'file') {
    throw new Error(`cannot apply: analyzed ${label} state is invalid`);
  }
  if (current.state.type === 'missing') {
    throw new Error(`cannot apply: ${label} disappeared after analysis`);
  }
  if (current.state.type !== 'file') {
    throw new Error(`cannot apply: ${label} type drifted from file to ${current.state.type}`);
  }
  if (!isDeepStrictEqual(current.state.identity, expected.identity)) {
    throw new Error(`cannot apply: ${label} identity drifted after analysis`);
  }
  if (current.state.nlink !== expected.nlink) {
    throw new Error(`cannot apply: ${label} link count drifted after analysis`);
  }
  if (current.state.sha256 !== expected.sha256) {
    throw new Error(`cannot apply: ${label} content drifted after analysis`);
  }
  return current;
}

/** @param {Array<{ relPath: string, label: string, state: any }>} destinations */
function requireDistinctWriteTargets(destinations) {
  for (let index = 0; index < destinations.length; index++) {
    const destination = destinations[index];
    if (destination.state.type !== 'file') continue;
    for (let previousIndex = 0; previousIndex < index; previousIndex++) {
      const previous = destinations[previousIndex];
      if (
        previous.state.type === 'file'
        && isDeepStrictEqual(previous.state.identity, destination.state.identity)
      ) {
        throw new Error(
          `cannot apply: selected write targets ${JSON.stringify(previous.relPath)} (${previous.label}) and ${JSON.stringify(destination.relPath)} (${destination.label}) resolve to the same file identity; replace the hard link with distinct files and re-analyze`
        );
      }
    }
  }
}

/** @param {string} destRel @param {'LICENSE'|'NOTICE'} filename @returns {string} */
function licenseSiblingPath(destRel, filename) {
  return path.posix.join(path.posix.dirname(destRel), filename);
}

/**
 * Extract a single scalar string from a parsed frontmatter entry, or null when
 * the entry is absent or carries a sequence value.
 * @param {import('./lib/import-frontmatter.mjs').ImportFrontmatterEntry | undefined} entry
 * @returns {string|null}
 */
function frontmatterScalar(entry) {
  if (!entry) return null;
  return typeof entry.value === 'string' ? entry.value : null;
}

/**
 * Derive every mechanical fact from a single strict parse of the source under
 * import. Malformed, ambiguous, or license-hiding frontmatter throws
 * `ImportFrontmatterError` here, so analyze and apply fail closed before any
 * snapshot or write.
 * @param {string} sourceIdentity
 * @param {string} content
 * @returns {{
 *   kind: 'agent'|'skill'|'unknown',
 *   destRel: string|null,
 *   name: string|null,
 *   description: string,
 *   frontmatter: { strip: string[], toolsPresent: boolean, hasLicense: boolean, license: string|null },
 *   requiresLicenseDecision: boolean,
 * }}
 */
function mechanicalFacts(sourceIdentity, content) {
  const parsed = parseImportFrontmatter(content);
  const entriesByKey = new Map(parsed.entries.map((entry) => [entry.key, entry]));
  const name = frontmatterScalar(entriesByKey.get('name'));
  const { kind, destRel } = importTargetFromName(sourceIdentity, name);
  const hasLicense = parsed.license.status === 'present';
  return {
    kind,
    destRel,
    name,
    description: frontmatterScalar(entriesByKey.get('description')) ?? '',
    frontmatter: {
      strip: ALWAYS_STRIP.filter((key) => entriesByKey.has(key)),
      toolsPresent: entriesByKey.has('tools'),
      hasLicense,
      license: hasLicense ? parsed.license.value : null,
    },
    requiresLicenseDecision: hasLicense,
  };
}

/**
 * @param {any} plan
 * @returns {{
 *   frontmatter: { strip: unknown, toolsPresent: unknown, hasLicense: unknown, license: unknown },
 *   requiresLicenseDecision: unknown,
 * }}
 */
function mechanicalPlanDetails(plan) {
  return {
    frontmatter: {
      strip: plan?.frontmatter?.strip,
      toolsPresent: plan?.frontmatter?.toolsPresent,
      hasLicense: plan?.frontmatter?.hasLicense,
      license: plan?.frontmatter?.license,
    },
    requiresLicenseDecision: plan?.requiresLicenseDecision,
  };
}

/**
 * Produce an adaptation report for an import source.
 * @param {{ source: string, root?: string }} opts
 * @returns {Promise<any>}
 */
export async function analyze({ source, root = process.cwd() }) {
  const currentSource = await readSource(source);
  const { content } = currentSource;
  const facts = mechanicalFacts(currentSource.identity, content);
  const description = facts.description || '';
  let destinationState = null;
  /** @type {Record<string, any> | null} */
  let licenseSiblingStates = null;
  if (facts.destRel) {
    destinationState = snapshotDestination(root, facts.destRel).state;
    if (!requiredDestinationAction(destinationState)) {
      throw new Error(`cannot analyze: destination ${facts.destRel} must be missing or a regular file`);
    }
    if (facts.kind === 'skill' && facts.frontmatter.hasLicense) {
      licenseSiblingStates = {};
      for (const filename of /** @type {const} */ (['LICENSE', 'NOTICE'])) {
        licenseSiblingStates[filename] = snapshotDestination(
          root,
          licenseSiblingPath(facts.destRel, filename)
        ).state;
      }
    }
  }

  return {
    source,
    sourceIdentity: currentSource.identity,
    sourceSha256: sha256(currentSource.bytes),
    resolvedUrl: isUrlShapedSource(source) ? currentSource.identity : null,
    kind: facts.kind,
    destRel: facts.destRel,
    destinationState,
    licenseSiblingStates,
    frontmatter: {
      name: facts.name,
      description,
      ...facts.frontmatter,
    },
    requiresLicenseDecision: facts.requiresLicenseDecision,
    strip_tools: facts.frontmatter.toolsPresent,
    lineEndings: content.includes('\r\n') ? 'crlf' : 'lf',
    overlaps: rankOverlap(description, existingDescriptions(root), 0.6),
    warnings: facts.kind === 'unknown' ? ['does not parse as a Dude agent or skill'] : [],
  };
}

/**
 * Raised when `applyPlan` fails partway through writing its destinations. The
 * apply is deliberately not transactional and performs no rollback; this error
 * carries the destinations already written so the caller can still report them.
 */
class PartialApplyError extends Error {
  /**
   * @param {unknown} cause
   * @param {{ written: string | null, writtenSiblings: string[] }} progress
   */
  constructor(cause, progress) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'PartialApplyError';
    this.written = progress.written;
    this.writtenSiblings = progress.writtenSiblings;
  }
}

/**
 * Execute an import plan. Writes the adapted artifact to its destination.
 * @param {{ source: string, root?: string, plan: any }} opts
 * @returns {Promise<{ written: string, writtenSiblings: string[] }>}
 */
export async function applyPlan({ source, root = process.cwd(), plan }) {
  const currentSource = await readSource(source);
  if (plan?.sourceIdentity !== currentSource.identity) {
    throw new Error(
      `cannot apply: destination/source mismatch: source identity plan ${JSON.stringify(plan?.sourceIdentity)} does not match current ${JSON.stringify(currentSource.identity)}`
    );
  }

  const currentSha256 = sha256(currentSource.bytes);
  if (plan?.sourceSha256 !== currentSha256) {
    throw new Error(
      `cannot apply: destination/source mismatch: source SHA-256 plan ${JSON.stringify(plan?.sourceSha256)} does not match current ${JSON.stringify(currentSha256)}`
    );
  }

  const facts = mechanicalFacts(currentSource.identity, currentSource.content);
  if (facts.kind === 'unknown' || !facts.destRel) {
    throw new Error(`cannot apply: destination/source mismatch: ${source} is not a Dude agent or skill`);
  }
  if (plan.kind !== facts.kind) {
    throw new Error(
      `cannot apply: mechanical plan snapshot destination/source mismatch for ${source}: plan kind ${JSON.stringify(plan.kind)} does not match detected kind ${JSON.stringify(facts.kind)}`
    );
  }
  if (plan.destRel !== facts.destRel) {
    throw new Error(
      `cannot apply: mechanical plan snapshot destination/source mismatch for ${source}: plan destination ${JSON.stringify(plan.destRel)} does not match canonical destination ${JSON.stringify(facts.destRel)}`
    );
  }

  const expectedDetails = {
    frontmatter: facts.frontmatter,
    requiresLicenseDecision: facts.requiresLicenseDecision,
  };
  if (!isDeepStrictEqual(mechanicalPlanDetails(plan), expectedDetails)) {
    throw new Error('cannot apply: mechanical plan snapshot does not exactly match current source facts');
  }

  if (typeof plan.strip_tools !== 'boolean') {
    throw new Error('cannot apply: strip_tools must be an explicit boolean');
  }
  if (!facts.frontmatter.toolsPresent && plan.strip_tools) {
    throw new Error('cannot apply: strip_tools cannot be true when the current source has no tools');
  }

  const hasLicenseDisposition = Object.prototype.hasOwnProperty.call(plan, 'license_disposition');
  let licenseSibling = null;
  if (facts.frontmatter.hasLicense) {
    if (!hasLicenseDisposition) {
      throw new Error('cannot apply: a structured license_disposition is required when the current source has a license');
    }
    if (facts.kind === 'agent') {
      const expectedDecision = {
        license: facts.frontmatter.license,
        materialization: 'agent-source-license-section',
      };
      if (!isDeepStrictEqual(plan.license_disposition, expectedDecision)) {
        throw new Error('cannot apply: license_disposition must exactly bind the observed license to an agent Source License section');
      }
    } else {
      const filename = plan.license_disposition?.sibling?.filename;
      if (filename !== 'LICENSE' && filename !== 'NOTICE') {
        throw new Error('cannot apply: skill license_disposition must select a LICENSE or NOTICE sibling');
      }
      const state = plan.licenseSiblingStates?.[filename];
      const action = requiredDestinationAction(state);
      const expectedDecision = {
        license: facts.frontmatter.license,
        materialization: 'skill-license-sibling',
        sibling: {
          filename,
          decision: { action, state },
        },
      };
      if (!action || !isDeepStrictEqual(plan.license_disposition, expectedDecision)) {
        throw new Error('cannot apply: license_disposition must exactly bind the observed license and reviewed sibling state');
      }
      licenseSibling = {
        relPath: licenseSiblingPath(facts.destRel, filename),
        state,
        decision: plan.license_disposition.sibling.decision,
        content: normalizeString(`${facts.frontmatter.license}\n`),
      };
    }
  } else if (hasLicenseDisposition) {
    throw new Error('cannot apply: license_disposition is not allowed when the current source has no license');
  }

  const selectedStates = [
    {
      relPath: facts.destRel,
      state: plan.destinationState,
      label: 'primary destination',
    },
  ];
  if (licenseSibling) {
    selectedStates.push({ ...licenseSibling, label: 'license sibling destination' });
  }
  requireDistinctWriteTargets(selectedStates);
  requireReviewedDestination('primary destination', plan.destinationState, plan.destinationDecision);
  if (licenseSibling) {
    requireReviewedDestination('license sibling destination', licenseSibling.state, licenseSibling.decision);
  }
  for (const destination of selectedStates) {
    if (requiredDestinationAction(destination.state) === 'replace' && destination.state.nlink !== '1') {
      throw new Error(
        `cannot apply: ${destination.label} replacement requires hard-link count 1; analyzed state has ${JSON.stringify(destination.state.nlink)}`
      );
    }
  }

  const stripKeys = [...facts.frontmatter.strip];
  if (facts.frontmatter.toolsPresent && plan.strip_tools) stripKeys.push('tools');
  if (facts.frontmatter.hasLicense) stripKeys.push('license');
  let adapted = normalizeString(stripImportFrontmatter(currentSource.content, stripKeys));
  if (facts.kind === 'agent' && facts.frontmatter.hasLicense) {
    adapted = `${adapted.trimEnd()}\n\n## Source License\n\n${facts.frontmatter.license}\n`;
  }

  const destinations = [
    {
      relPath: facts.destRel,
      state: plan.destinationState,
      content: adapted,
      label: 'primary destination',
    },
  ];
  if (licenseSibling) {
    destinations.push({ ...licenseSibling, label: 'license sibling destination' });
  }
  const preflighted = destinations.map((destination) => {
    const current = preflightDestination(
      root,
      destination.relPath,
      destination.state,
      destination.label
    );
    return { ...destination, ...current };
  });
  requireDistinctWriteTargets(preflighted);

  let writtenPrimaryPath = /** @type {string | null} */ (null);
  const writtenSiblingPaths = /** @type {string[]} */ ([]);
  try {
    for (const destination of preflighted) {
      fs.mkdirSync(path.dirname(destination.absolutePath), { recursive: true });
      fs.writeFileSync(destination.absolutePath, destination.content, {
        flag: requiredDestinationAction(destination.state) === 'create' ? 'wx' : 'w',
      });
      if (destination.label === 'primary destination') writtenPrimaryPath = destination.relPath;
      else writtenSiblingPaths.push(destination.relPath);
    }
  } catch (error) {
    throw new PartialApplyError(error, {
      written: writtenPrimaryPath,
      writtenSiblings: writtenSiblingPaths,
    });
  }
  return {
    written: facts.destRel,
    writtenSiblings: licenseSibling ? [licenseSibling.relPath] : [],
  };
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
      for (const writtenPath of [r.written, ...r.writtenSiblings]) {
        process.stdout.write(`[OK] wrote ${writtenPath}\n`);
      }
    } else {
      throw new Error(`unknown command: ${args.cmd}`);
    }
  } catch (err) {
    if (err instanceof PartialApplyError) {
      for (const writtenPath of [err.written, ...err.writtenSiblings]) {
        if (writtenPath) process.stdout.write(`[OK] wrote ${writtenPath}\n`);
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    const reason = err instanceof Error && typeof err.cause === 'string' ? `: ${err.cause}` : '';
    process.stderr.write(`[FAIL] ${message}${reason}\n`);
    process.exitCode = 2;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}
