// @ts-check
import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { normalizeAgentDest, normalizeSkillDir } from '../import.mjs';
import { resolveMutationPath } from '../../dude-engine/lib/workspace-paths.mjs';
import { createCanonicalEntryManifest } from './directory-source.mjs';
import { parseImportFrontmatter } from './import-frontmatter.mjs';

const ADAPTATION_KEYS = new Set(['compatibility', 'model', 'tools', 'license']);
const COORDINATOR_PARAGRAPH =
  '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state ' +
  'glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, ' +
  '`<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report ' +
  'changes back to `@dude` instead.';
const COORDINATOR_HEADING = '**Coordinator-only artifacts:**';
const BOUNDARY_GUIDANCE =
  'Use focused single-file import/adaptation or prepare a clean source with exactly the canonical coordinator-only artifacts paragraph.';
const CLEAN_SOURCE_GUIDANCE =
  'Use focused single-file import/adaptation or prepare a clean directory source.';

/** @param {string} left @param {string} right */
function compareRaw(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** @param {Buffer|string} bytes */
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** @param {Buffer} bytes */
function classifyBytes(bytes) {
  return isUtf8(bytes) && !bytes.includes(0) ? 'text' : 'opaque';
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null),
  );
}

/** @param {unknown} source */
function validateSourceProvenance(source) {
  if (!isPlainObject(source)) {
    throw new TypeError('directory source provenance must be a plain object');
  }
  const sourceKeys = ['provider', 'input', 'identity'];
  const actualSourceKeys = Reflect.ownKeys(source);
  if (
    actualSourceKeys.length !== sourceKeys.length
    || !sourceKeys.every((key) => Object.hasOwn(source, key))
    || typeof source.provider !== 'string'
    || source.provider.length === 0
    || typeof source.input !== 'string'
    || source.input.length === 0
  ) {
    throw new Error('directory source provenance must have exact provider, input, and identity fields');
  }

  const identityKeys = source.provider === 'local-directory'
    ? ['root_path']
    : source.provider === 'github-tree'
      ? ['owner', 'repository', 'requested_ref', 'resolved_commit', 'subtree', 'tree_sha']
      : null;
  if (!identityKeys) {
    throw new Error(`unsupported directory source provider: ${source.provider}`);
  }
  if (!isPlainObject(source.identity)) {
    throw new TypeError('directory source provenance identity must be a plain object');
  }
  const actualIdentityKeys = Reflect.ownKeys(source.identity);
  if (
    actualIdentityKeys.length !== identityKeys.length
    || !identityKeys.every((key) => (
      Object.hasOwn(source.identity, key)
      && typeof source.identity[key] === 'string'
      && source.identity[key].length > 0
    ))
  ) {
    throw new Error(`directory source ${source.provider} identity has an invalid exact field shape`);
  }
  if (
    source.provider === 'github-tree'
    && (!/^[0-9a-f]{40}$/.test(source.identity.resolved_commit)
      || !/^[0-9a-f]{40}$/.test(source.identity.tree_sha))
  ) {
    throw new Error('directory source GitHub identity must use lowercase 40-hex Git object IDs');
  }
}

/**
 * @param {string} code
 * @param {string|null} diagnosticPath
 * @param {readonly string[]} relatedPaths
 * @param {string} message
 * @param {string} guidance
 */
function makeDiagnostic(code, diagnosticPath, relatedPaths, message, guidance) {
  return {
    code,
    path: diagnosticPath,
    related_paths: [...new Set(relatedPaths)]
      .filter((relatedPath) => relatedPath !== diagnosticPath)
      .sort(compareRaw),
    message,
    guidance,
  };
}

/** @param {string} relativePath */
function parentPath(relativePath) {
  const parent = path.posix.dirname(relativePath);
  return parent === '.' ? '' : parent;
}

/** @param {string} relativePath @param {string} root */
function isWithinSourceRoot(relativePath, root) {
  return root === '' || relativePath.startsWith(`${root}/`);
}

/** @param {string} relativePath */
function isSelectedRootNotice(relativePath) {
  return !relativePath.includes('/')
    && /^(?:LICENSE|NOTICE)(?:\..*)?$/i.test(relativePath);
}

/** @param {string} content @param {number|undefined} line */
function errorTargetsRequiredField(content, line) {
  if (!Number.isSafeInteger(line) || /** @type {number} */ (line) < 1) return false;
  const physicalLine = content.split(/\r\n|\n/)[/** @type {number} */ (line) - 1] ?? '';
  return /^(?:name|description):/.test(physicalLine);
}

/** @param {string} content @param {any} error */
function frontmatterFailureCode(content, error) {
  if (
    error?.code === 'ERR_IMPORT_FRONTMATTER_DUPLICATE_KEY'
    && /duplicate top-level key '(?:name|description)'/.test(String(error.message))
  ) {
    return 'entrypoint-required-field-invalid';
  }
  if (
    error?.code === 'ERR_IMPORT_FRONTMATTER_VALUE'
    && errorTargetsRequiredField(content, error?.line)
  ) {
    return 'entrypoint-required-field-invalid';
  }
  return 'entrypoint-frontmatter-invalid';
}

/** @param {string} source @param {any} parsed @param {string} finalName */
function rewriteSkillName(source, parsed, finalName) {
  const nameEntry = parsed.entries.find((entry) => entry.key === 'name');
  if (!nameEntry || typeof nameEntry.value !== 'string') {
    throw new Error('cannot rewrite skill name without one validated scalar entry');
  }
  const rawLine = nameEntry.raw.replace(/(?:\r\n|\n)$/, '');
  const colonOffset = rawLine.indexOf(':');
  const remainder = rawLine.slice(colonOffset + 1);
  const leadingLength = /^ */.exec(remainder)?.[0].length ?? 0;
  const scalar = remainder.slice(leadingLength).trim();
  const scalarStart = nameEntry.startOffset + colonOffset + 1 + leadingLength;
  const scalarEnd = scalarStart + scalar.length;
  let replacement = finalName;
  if (
    scalar.length >= 2
    && ((scalar.startsWith("'") && scalar.endsWith("'"))
      || (scalar.startsWith('"') && scalar.endsWith('"')))
  ) {
    replacement = `${scalar[0]}${finalName}${scalar.at(-1)}`;
  }
  return `${source.slice(0, scalarStart)}${replacement}${source.slice(scalarEnd)}`;
}

/** @param {string} source @param {string} needle */
function countOccurrences(source, needle) {
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

/** @param {string} body */
function hasCanonicalBoundaryLine(body) {
  const lines = body.split(/\r\n|\n/);
  /** @type {{character: '`'|'~', length: number}|null} */
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = /^ {0,3}(`+|~+)(.*)$/.exec(line);
    if (fence) {
      if (
        marker
        && marker[1][0] === fence.character
        && marker[1].length >= fence.length
        && /^\s*$/.test(marker[2])
      ) {
        fence = null;
      }
      continue;
    }
    if (marker && marker[1].length >= 3) {
      fence = {
        character: /** @type {'`'|'~'} */ (marker[1][0]),
        length: marker[1].length,
      };
      continue;
    }
    if (line !== COORDINATOR_PARAGRAPH) continue;
    const boundedBefore = index === 0 || /^\s*$/.test(lines[index - 1]);
    const boundedAfter = index === lines.length - 1 || /^\s*$/.test(lines[index + 1]);
    if (boundedBefore && boundedAfter) return true;
  }
  return false;
}

/** @param {string} content @param {any} parsed */
function agentBoundaryFailure(content, parsed) {
  const headingCount = countOccurrences(content, COORDINATOR_HEADING);
  if (headingCount === 0) {
    return {
      code: 'agent-boundary-missing',
      message: 'Agent entrypoint is missing the canonical coordinator-only artifacts paragraph.',
    };
  }
  if (headingCount > 1) {
    return {
      code: 'agent-boundary-duplicated',
      message: 'Agent entrypoint contains more than one coordinator-only artifacts heading occurrence.',
    };
  }
  if (!content.includes(COORDINATOR_PARAGRAPH)) {
    return {
      code: 'agent-boundary-malformed',
      message: 'Agent entrypoint has a malformed coordinator-only artifacts paragraph.',
    };
  }
  const body = content.slice(parsed.frontmatter.endOffset);
  if (!hasCanonicalBoundaryLine(body)) {
    return {
      code: 'agent-boundary-noncanonical',
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    };
  }
  return null;
}

/** @param {string} token */
function isRecognizedRelativeToken(token) {
  const prefixLength = token.startsWith('../') ? 3 : token.startsWith('./') ? 2 : 0;
  return prefixLength > 0
    && token.length > prefixLength
    && !/[\s\\?#%()[\]'"`]/u.test(token);
}

/** @param {string} content @param {number} start @param {number} end */
function isWithinSameLineAngleSpan(content, start, end) {
  const lineStart = content.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = content.indexOf('\n', end);
  const lineEnd = lineEndIndex < 0 ? content.length : lineEndIndex;
  const opening = content.lastIndexOf('<', start);
  if (opening < lineStart) return false;
  if (!/^\/?[A-Za-z][A-Za-z0-9-]*(?=\s|\/|>)/u.test(content.slice(opening + 1, lineEnd))) {
    return false;
  }
  if (content.lastIndexOf('>', start) > opening) return false;
  const closing = content.indexOf('>', end);
  return closing >= end && closing < lineEnd;
}

/** @param {string} content */
function findRelativeTokens(content) {
  const tokens = [];
  const patterns = [
    { expression: /]\((\.{1,2}\/[^)]*)\)/g, delimiter: 'markdown' },
    { expression: /'(\.{1,2}\/[^']*)'/g, delimiter: "'" },
    { expression: /"(\.{1,2}\/[^\"]*)"/g, delimiter: '"' },
    { expression: /`(\.{1,2}\/[^`]*)`/g, delimiter: '`' },
  ];
  for (const { expression, delimiter } of patterns) {
    for (let match = expression.exec(content); match; match = expression.exec(content)) {
      const before = content[match.index - 1] ?? '';
      const after = content[match.index + match[0].length] ?? '';
      if (before === '\\') continue;
      if (delimiter === 'markdown') {
        if (before === '\\') continue;
      } else if (before === delimiter || after === delimiter) {
        continue;
      }
      if (
        delimiter !== 'markdown'
        && isWithinSameLineAngleSpan(content, match.index, match.index + match[0].length)
      ) {
        continue;
      }
      if (isRecognizedRelativeToken(match[1])) tokens.push(match[1]);
    }
  }
  return tokens;
}

/** @param {fs.BigIntStats} stat */
function destinationStatSnapshot(stat) {
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mode: stat.mode.toString(),
    link_count: stat.nlink.toString(),
    byte_count: stat.size.toString(),
    modified_ns: stat.mtimeNs.toString(),
    changed_ns: stat.ctimeNs.toString(),
  };
}

/** @param {string} absolutePath */
function lstatOrNull(absolutePath) {
  try {
    return fs.lstatSync(absolutePath, { bigint: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** @param {string} workspaceRoot @param {string} destinationPath */
function inspectDestination(workspaceRoot, destinationPath) {
  let resolvedPath;
  let resolutionError = null;
  try {
    resolvedPath = resolveMutationPath(workspaceRoot, destinationPath);
  } catch (error) {
    resolutionError = error;
    resolvedPath = path.resolve(workspaceRoot, ...destinationPath.split('/'));
  }

  const root = path.resolve(workspaceRoot);
  const segments = destinationPath.split('/');
  let cursor = root;
  const observedSegments = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const parentStat = lstatOrNull(cursor);
    if (!parentStat || !parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      return {
        state: null,
        issue: {
          code: 'destination-unsafe-ancestor',
          path: observedSegments.join('/') || destinationPath,
        },
      };
    }

    const childNames = fs.readdirSync(cursor).sort(compareRaw);
    const hasExactChild = childNames.includes(segment);
    const aliases = childNames.filter((name) => (
      name !== segment && name.toLowerCase() === segment.toLowerCase()
    ));
    if (aliases.length > 0) {
      return {
        state: null,
        issue: {
          code: 'destination-case-collision',
          paths: aliases.map((alias) => [...observedSegments, alias].join('/')),
        },
      };
    }
    if (!hasExactChild) {
      if (resolutionError) throw resolutionError;
      return { state: { type: 'missing' }, issue: null };
    }

    const exactPath = path.join(cursor, segment);
    const exactStat = lstatOrNull(exactPath);
    if (!exactStat) {
      throw new Error(`destination changed during lexical inspection: ${destinationPath}`);
    }

    observedSegments.push(segment);
    const observedPath = observedSegments.join('/');
    const isFinal = index === segments.length - 1;
    if (!isFinal) {
      if (exactStat.isSymbolicLink() || !exactStat.isDirectory()) {
        return {
          state: null,
          issue: { code: 'destination-unsafe-ancestor', path: observedPath },
        };
      }
      cursor = exactPath;
      continue;
    }

    if (exactStat.isSymbolicLink() || !exactStat.isFile()) {
      return {
        state: null,
        issue: { code: 'destination-unsupported', path: observedPath },
      };
    }
    if (resolutionError) throw resolutionError;

    const initialSnapshot = destinationStatSnapshot(exactStat);
    const flags = fs.constants.O_RDONLY
      | (fs.constants.O_NOFOLLOW ?? 0)
      | (fs.constants.O_NONBLOCK ?? 0);
    let descriptor;
    try {
      descriptor = fs.openSync(resolvedPath, flags);
    } catch (error) {
      throw new Error(`destination changed or could not be opened without following links: ${destinationPath}`, { cause: error });
    }
    let bytes;
    let finalOpenedSnapshot;
    try {
      const openedStat = fs.fstatSync(descriptor, { bigint: true });
      const openedSnapshot = destinationStatSnapshot(openedStat);
      if (!openedStat.isFile() || !isDeepStrictEqual(openedSnapshot, initialSnapshot)) {
        throw new Error(`destination identity changed before reading: ${destinationPath}`);
      }
      bytes = fs.readFileSync(descriptor);
      const finalOpenedStat = fs.fstatSync(descriptor, { bigint: true });
      finalOpenedSnapshot = destinationStatSnapshot(finalOpenedStat);
      if (!finalOpenedStat.isFile() || !isDeepStrictEqual(finalOpenedSnapshot, openedSnapshot)) {
        throw new Error(`destination identity changed while reading: ${destinationPath}`);
      }
    } finally {
      fs.closeSync(descriptor);
    }
    const finalPathStat = lstatOrNull(resolvedPath);
    if (
      !finalPathStat
      || !finalPathStat.isFile()
      || !isDeepStrictEqual(destinationStatSnapshot(finalPathStat), finalOpenedSnapshot)
    ) {
      throw new Error(`destination identity changed after reading: ${destinationPath}`);
    }
    if (exactStat.nlink !== 1n) {
      return {
        state: null,
        issue: { code: 'destination-multilink', path: observedPath },
      };
    }
    return {
      state: { type: 'regular-file', sha256: sha256(bytes) },
      issue: null,
    };
  }
  throw new Error(`invalid empty destination path: ${destinationPath}`);
}

/**
 * @param {string} workspaceRoot
 * @param {string} plannedRoot
 * @param {Set<string>} plannedFiles
 */
function findUnplannedEntries(workspaceRoot, plannedRoot, plannedFiles) {
  let absoluteRoot = path.resolve(workspaceRoot);
  for (const segment of plannedRoot.split('/')) {
    const parentStat = lstatOrNull(absoluteRoot);
    if (!parentStat || !parentStat.isDirectory() || parentStat.isSymbolicLink()) return [];
    const childNames = fs.readdirSync(absoluteRoot).sort(compareRaw);
    if (!childNames.includes(segment)) return [];
    const childPath = path.join(absoluteRoot, segment);
    const childStat = lstatOrNull(childPath);
    if (!childStat || !childStat.isDirectory() || childStat.isSymbolicLink()) return [];
    absoluteRoot = childPath;
  }

  const plannedDirectories = new Set([plannedRoot]);
  for (const plannedFile of plannedFiles) {
    let current = parentPath(plannedFile);
    while (current && current !== parentPath(plannedRoot)) {
      plannedDirectories.add(current);
      if (current === plannedRoot) break;
      current = parentPath(current);
    }
  }
  const plannedFoldedPaths = new Set(
    [...plannedFiles, ...plannedDirectories].map((plannedPath) => plannedPath.toLowerCase()),
  );

  const unplanned = [];
  /** @param {string} absoluteDirectory @param {string} relativeDirectory */
  function visit(absoluteDirectory, relativeDirectory) {
    const directoryStat = lstatOrNull(absoluteDirectory);
    if (!directoryStat || !directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return;
    for (const name of fs.readdirSync(absoluteDirectory).sort(compareRaw)) {
      const relativePath = `${relativeDirectory}/${name}`;
      const absolutePath = path.join(absoluteDirectory, name);
      const stat = lstatOrNull(absolutePath);
      if (!stat) continue;
      if (plannedFiles.has(relativePath)) continue;
      if (plannedFoldedPaths.has(relativePath.toLowerCase())) continue;
      if (!plannedDirectories.has(relativePath)) {
        unplanned.push(relativePath);
        continue;
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolutePath, relativePath);
    }
  }
  visit(absoluteRoot, plannedRoot);
  return unplanned;
}

/**
 * Derive deterministic artifact, output, reference, and destination facts from
 * one canonical directory-source analysis without mutating the workspace.
 *
 * @param {any} sourceAnalysis
 * @param {string} workspaceRoot
 */
export async function analyzeDirectoryArtifacts(sourceAnalysis, workspaceRoot) {
  if (!isPlainObject(sourceAnalysis)) {
    throw new TypeError('directory source analysis must be a plain object');
  }
  const requiredSourceFields = [
    'source',
    'entries',
    'manifest_sha256',
    'getFileBytes',
    'revalidate',
  ];
  const sourceFields = Reflect.ownKeys(sourceAnalysis);
  if (
    sourceFields.length !== requiredSourceFields.length
    || !requiredSourceFields.every((field) => Object.hasOwn(sourceAnalysis, field))
  ) {
    throw new Error(`directory source analysis must have exactly these fields: ${requiredSourceFields.join(', ')}`);
  }
  validateSourceProvenance(sourceAnalysis.source);
  if (typeof sourceAnalysis.getFileBytes !== 'function' || typeof sourceAnalysis.revalidate !== 'function') {
    throw new TypeError('directory source analysis must provide getFileBytes and revalidate functions');
  }
  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
    throw new TypeError('workspace root must be a non-empty path string');
  }

  const manifest = createCanonicalEntryManifest(sourceAnalysis.entries);
  if (!isDeepStrictEqual(sourceAnalysis.entries, manifest.entries)) {
    throw new Error('directory source entries do not equal their canonical entry manifest');
  }
  if (sourceAnalysis.manifest_sha256 !== manifest.manifest_sha256) {
    throw new Error('directory source manifest SHA-256 does not match its canonical entries');
  }

  const entries = manifest.entries;
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const bytesByPath = new Map();
  for (const entry of entries) {
    if (entry.entry_type !== 'regular-file') continue;
    const provided = await sourceAnalysis.getFileBytes(entry.path);
    if (!Buffer.isBuffer(provided)) {
      throw new TypeError(`directory source getFileBytes must return a Buffer for ${entry.path}`);
    }
    const bytes = Buffer.from(provided);
    if (bytes.length !== entry.byte_count) {
      throw new Error(`directory source byte length integrity mismatch for ${entry.path}`);
    }
    if (sha256(bytes) !== entry.sha256) {
      throw new Error(`directory source SHA-256 integrity mismatch for ${entry.path}`);
    }
    if (classifyBytes(bytes) !== entry.content_class) {
      throw new Error(`directory source content class integrity mismatch for ${entry.path}`);
    }
    bytesByPath.set(entry.path, bytes);
  }

  const diagnostics = [];
  for (const entry of entries) {
    if (entry.entry_type === 'symbolic-link' || entry.entry_type === 'non-regular') {
      diagnostics.push(makeDiagnostic(
        'source-entry-unsupported',
        entry.path,
        [],
        'Source entry is not a supported directory or regular file.',
        'Remove the unsupported entry or select a clean narrower source root.',
      ));
    }
  }

  const candidates = [];
  for (const entry of entries) {
    if (entry.entry_type !== 'regular-file') continue;
    const basename = path.posix.basename(entry.path);
    const kind = basename === 'SKILL.md'
      ? 'skill'
      : basename.endsWith('.agent.md') ? 'agent' : null;
    if (!kind) continue;

    const candidate = {
      path: entry.path,
      root: parentPath(entry.path),
      kind,
      valid: false,
      parsed: null,
      content: null,
      normalizedName: null,
    };
    candidates.push(candidate);
    const bytes = bytesByPath.get(entry.path);
    if (entry.content_class !== 'text' || !bytes) {
      diagnostics.push(makeDiagnostic(
        'entrypoint-frontmatter-invalid',
        entry.path,
        [],
        'Entrypoint does not have strict text frontmatter.',
        CLEAN_SOURCE_GUIDANCE,
      ));
      continue;
    }

    const content = bytes.toString('utf8');
    candidate.content = content;
    let parsed;
    try {
      parsed = parseImportFrontmatter(content);
    } catch (error) {
      const code = frontmatterFailureCode(content, error);
      diagnostics.push(makeDiagnostic(
        code,
        entry.path,
        [],
        code === 'entrypoint-required-field-invalid'
          ? 'Entrypoint has an invalid required name or description field.'
          : 'Entrypoint frontmatter is missing or malformed.',
        CLEAN_SOURCE_GUIDANCE,
      ));
      continue;
    }
    if (!parsed.present || !parsed.frontmatter) {
      diagnostics.push(makeDiagnostic(
        'entrypoint-frontmatter-invalid',
        entry.path,
        [],
        'Entrypoint frontmatter is missing or malformed.',
        CLEAN_SOURCE_GUIDANCE,
      ));
      continue;
    }

    const nameEntries = parsed.entries.filter(({ key }) => key === 'name');
    const descriptionEntries = parsed.entries.filter(({ key }) => key === 'description');
    const name = nameEntries[0]?.value;
    const description = descriptionEntries[0]?.value;
    if (
      nameEntries.length !== 1
      || descriptionEntries.length !== 1
      || typeof name !== 'string'
      || name.length === 0
      || typeof description !== 'string'
      || description.length === 0
    ) {
      diagnostics.push(makeDiagnostic(
        'entrypoint-required-field-invalid',
        entry.path,
        [],
        'Entrypoint requires one scalar name and one scalar description.',
        CLEAN_SOURCE_GUIDANCE,
      ));
      continue;
    }
    if (parsed.entries.some(({ key }) => ADAPTATION_KEYS.has(key))) {
      diagnostics.push(makeDiagnostic(
        'entrypoint-adaptation-required',
        entry.path,
        [],
        'Entrypoint contains metadata that requires focused adaptation.',
        CLEAN_SOURCE_GUIDANCE,
      ));
      continue;
    }

    let normalizedName = null;
    if (kind === 'skill') {
      try {
        normalizedName = normalizeSkillDir(name);
      } catch {
        diagnostics.push(makeDiagnostic(
          'skill-name-invalid',
          entry.path,
          [],
          'Skill entrypoint name is not a canonical skill name.',
          'Correct the skill name or use focused single-file import/adaptation.',
        ));
        continue;
      }
    } else {
      const boundaryFailure = agentBoundaryFailure(content, parsed);
      if (boundaryFailure) {
        diagnostics.push(makeDiagnostic(
          boundaryFailure.code,
          entry.path,
          [],
          boundaryFailure.message,
          BOUNDARY_GUIDANCE,
        ));
        continue;
      }
    }

    candidate.valid = true;
    candidate.parsed = parsed;
    candidate.normalizedName = normalizedName;
  }

  if (candidates.length === 0) {
    diagnostics.push(makeDiagnostic(
      'entrypoint-not-found',
      null,
      [],
      'No exact SKILL.md or lowercase .agent.md entrypoint was found.',
      'Select a narrower root containing one supported entrypoint.',
    ));
  }

  const candidatesByRoot = new Map();
  for (const candidate of candidates) {
    const rootCandidates = candidatesByRoot.get(candidate.root) ?? [];
    rootCandidates.push(candidate);
    candidatesByRoot.set(candidate.root, rootCandidates);
  }
  for (const [root, rootCandidates] of candidatesByRoot) {
    if (rootCandidates.length < 2) continue;
    diagnostics.push(makeDiagnostic(
      'entrypoint-root-ambiguous',
      root || null,
      rootCandidates.map((candidate) => candidate.path),
      'Artifact root contains more than one candidate entrypoint.',
      'Select and analyze one narrower artifact root.',
    ));
  }

  const internalGroups = candidates
    .filter((candidate) => candidate.valid && candidatesByRoot.get(candidate.root)?.length === 1)
    .map((candidate) => {
      if (candidate.kind === 'skill') {
        const destinationRoot = `.github/skills/${candidate.normalizedName}`;
        return {
          kind: candidate.kind,
          entrypoint: candidate.path,
          root: candidate.root,
          destinationRoot,
          agentFile: null,
          supportRoot: null,
          candidate,
        };
      }
      const agentFilename = normalizeAgentDest(path.posix.basename(candidate.path));
      return {
        kind: candidate.kind,
        entrypoint: candidate.path,
        root: candidate.root,
        destinationRoot: null,
        agentFile: `.github/agents/${agentFilename}`,
        supportRoot: `.github/agents/${agentFilename.replace(/\.agent\.md$/, '.support')}`,
        candidate,
      };
    })
    .sort((left, right) => compareRaw(left.entrypoint, right.entrypoint));
  const groups = internalGroups.map(({ kind, entrypoint }) => ({ kind, entrypoint }));
  const groupByEntrypoint = new Map(internalGroups.map((group) => [group.entrypoint, group]));
  const candidatePathSet = new Set(candidates.map((candidate) => candidate.path));

  const ownership = [];
  for (const entry of entries) {
    if (entry.entry_type !== 'regular-file') continue;
    if (isSelectedRootNotice(entry.path) && internalGroups.length > 0) {
      for (const group of internalGroups) ownership.push({ entry, group, shared: true });
      continue;
    }

    const matchingRoots = [...candidatesByRoot.keys()]
      .filter((root) => isWithinSourceRoot(entry.path, root))
      .sort((left, right) => right.length - left.length || compareRaw(left, right));
    if (matchingRoots.length === 0) {
      diagnostics.push(makeDiagnostic(
        'ownership-unowned',
        entry.path,
        [],
        'Regular file has no artifact root owner.',
        'Select and analyze a narrower source root containing the file and one entrypoint.',
      ));
      continue;
    }
    const nearestCandidates = candidatesByRoot.get(matchingRoots[0]) ?? [];
    if (nearestCandidates.length !== 1 || !nearestCandidates[0].valid) {
      if (!candidatePathSet.has(entry.path)) {
        diagnostics.push(makeDiagnostic(
          'ownership-unowned',
          entry.path,
          [],
          'Regular file has no valid artifact root owner.',
          'Select and analyze a narrower source root containing the file and one valid entrypoint.',
        ));
      }
      continue;
    }
    const group = groupByEntrypoint.get(nearestCandidates[0]?.path);
    if (group) ownership.push({ entry, group, shared: false });
  }

  const outputCandidates = ownership.map(({ entry, group, shared }) => {
    let destinationPath;
    if (group.kind === 'skill') {
      const relativePath = shared
        ? path.posix.basename(entry.path)
        : path.posix.relative(group.root || '.', entry.path);
      destinationPath = `${group.destinationRoot}/${relativePath}`;
    } else if (entry.path === group.entrypoint) {
      destinationPath = group.agentFile;
    } else {
      const relativePath = shared
        ? path.posix.basename(entry.path)
        : path.posix.relative(group.root || '.', entry.path);
      destinationPath = `${group.supportRoot}/${relativePath}`;
    }

    const sourceBytes = bytesByPath.get(entry.path);
    if (!sourceBytes) throw new Error(`missing validated source bytes for ${entry.path}`);
    let outputBytes = Buffer.from(sourceBytes);
    let transformIds = [];
    if (group.kind === 'skill' && entry.path === group.entrypoint) {
      const rewritten = rewriteSkillName(
        /** @type {string} */ (group.candidate.content),
        group.candidate.parsed,
        /** @type {string} */ (group.candidate.normalizedName),
      );
      outputBytes = Buffer.from(rewritten);
      transformIds = ['rewrite-skill-name'];
    }
    return {
      sourcePath: entry.path,
      destinationPath,
      outputBytes,
      outputSha256: sha256(outputBytes),
      transformIds,
      group,
      legal: true,
      destinationState: null,
    };
  }).sort((left, right) => (
    compareRaw(left.destinationPath, right.destinationPath)
    || compareRaw(left.sourcePath, right.sourcePath)
    || compareRaw(left.group.entrypoint, right.group.entrypoint)
  ));

  const exactDestinations = new Map();
  const foldedDestinations = new Map();
  for (const candidate of outputCandidates) {
    const exact = exactDestinations.get(candidate.destinationPath) ?? [];
    exact.push(candidate);
    exactDestinations.set(candidate.destinationPath, exact);
    const foldedPath = candidate.destinationPath.toLowerCase();
    const folded = foldedDestinations.get(foldedPath) ?? [];
    folded.push(candidate);
    foldedDestinations.set(foldedPath, folded);
  }
  for (const [destinationPath, collisions] of exactDestinations) {
    if (collisions.length < 2) continue;
    for (const candidate of collisions) candidate.legal = false;
    const collisionSourcePaths = collisions.map((candidate) => candidate.sourcePath);
    diagnostics.push(makeDiagnostic(
      'output-collision',
      new Set(collisionSourcePaths).size < collisions.length ? destinationPath : null,
      collisionSourcePaths,
      'More than one source file maps to the same output path.',
      'Rename or separate the colliding artifacts and analyze the clean source again.',
    ));
  }
  for (const collisions of foldedDestinations.values()) {
    if (new Set(collisions.map((candidate) => candidate.destinationPath)).size < 2) continue;
    for (const candidate of collisions) candidate.legal = false;
    diagnostics.push(makeDiagnostic(
      'output-case-collision',
      null,
      collisions.map((candidate) => candidate.destinationPath),
      'Output paths collide under case-insensitive comparison.',
      'Rename or separate the case-colliding artifacts and analyze the clean source again.',
    ));
  }

  const outputByGroupAndSource = new Map();
  for (const candidate of outputCandidates) {
    outputByGroupAndSource.set(`${candidate.group.entrypoint}\0${candidate.sourcePath}`, candidate);
  }
  const brokenReferences = new Map();
  for (const candidate of outputCandidates) {
    const sourceEntry = entryByPath.get(candidate.sourcePath);
    if (sourceEntry?.content_class !== 'text') continue;
    const sourceContent = bytesByPath.get(candidate.sourcePath)?.toString('utf8');
    if (sourceContent === undefined) continue;
    for (const token of findRelativeTokens(sourceContent)) {
      const sourceTarget = path.posix.normalize(
        path.posix.join(parentPath(candidate.sourcePath) || '.', token),
      );
      const targetEntry = entryByPath.get(sourceTarget);
      if (!targetEntry || !['regular-file', 'directory'].includes(targetEntry.entry_type)) continue;

      let expectedDestination = null;
      let targetPresent = false;
      if (targetEntry.entry_type === 'regular-file') {
        const targetCandidate = outputByGroupAndSource.get(
          `${candidate.group.entrypoint}\0${sourceTarget}`,
        );
        if (targetCandidate) {
          expectedDestination = targetCandidate.destinationPath;
          targetPresent = true;
        }
      } else if (isWithinSourceRoot(sourceTarget, candidate.group.root)) {
        const relativeTarget = path.posix.relative(candidate.group.root || '.', sourceTarget);
        expectedDestination = candidate.group.kind === 'skill'
          ? `${candidate.group.destinationRoot}/${relativeTarget}`
          : `${candidate.group.supportRoot}/${relativeTarget}`;
        targetPresent = outputCandidates.some((possibleTarget) => (
          possibleTarget.group === candidate.group
          && possibleTarget.sourcePath.startsWith(`${sourceTarget}/`)
        ));
      }

      const outputTarget = path.posix.normalize(
        path.posix.join(parentPath(candidate.destinationPath) || '.', token),
      );
      const withinArtifact = candidate.group.kind === 'skill'
        ? outputTarget === candidate.group.destinationRoot
          || outputTarget.startsWith(`${candidate.group.destinationRoot}/`)
        : outputTarget === candidate.group.agentFile
          || outputTarget === candidate.group.supportRoot
          || outputTarget.startsWith(`${candidate.group.supportRoot}/`);
      if (!targetPresent || outputTarget !== expectedDestination || !withinArtifact) {
        candidate.legal = false;
        const targets = brokenReferences.get(candidate.sourcePath) ?? new Set();
        targets.add(sourceTarget);
        brokenReferences.set(candidate.sourcePath, targets);
      }
    }
  }
  for (const [sourcePath, targets] of brokenReferences) {
    diagnostics.push(makeDiagnostic(
      'reference-broken-by-mapping',
      sourcePath,
      [...targets],
      'Relative reference is broken by fixed output mapping.',
      'Prepare a clean source with mapping-safe references or select a narrower artifact root.',
    ));
  }

  const destinationFacts = [];
  for (const candidate of outputCandidates) {
    const inspected = inspectDestination(workspaceRoot, candidate.destinationPath);
    candidate.destinationState = inspected.state;
    destinationFacts.push({
      source_path: candidate.sourcePath,
      destination_path: candidate.destinationPath,
      state: inspected.state,
    });
    if (!inspected.issue) continue;
    candidate.legal = false;
    if (inspected.issue.code === 'destination-unsafe-ancestor') {
      diagnostics.push(makeDiagnostic(
        inspected.issue.code,
        candidate.destinationPath,
        [inspected.issue.path],
        'Output path has a symbolic-link or non-directory ancestor.',
        'Replace the unsafe ancestor with a real directory and analyze again.',
      ));
    } else if (inspected.issue.code === 'destination-case-collision') {
      diagnostics.push(makeDiagnostic(
        inspected.issue.code,
        candidate.destinationPath,
        inspected.issue.paths,
        'Output path has an existing case-only alias.',
        'Rename or remove the case-only alias and analyze again.',
      ));
    } else if (inspected.issue.code === 'destination-multilink') {
      diagnostics.push(makeDiagnostic(
        inspected.issue.code,
        candidate.destinationPath,
        [],
        'Existing output regular file has more than one hard link.',
        'Replace the hard-linked destination with a distinct regular file and analyze again.',
      ));
    } else {
      diagnostics.push(makeDiagnostic(
        'destination-unsupported',
        candidate.destinationPath,
        [],
        'Existing output is not a supported regular file.',
        'Remove or replace the destination with a regular file and analyze again.',
      ));
    }
  }

  const plannedRoots = new Map();
  for (const group of internalGroups) {
    const plannedRoot = group.kind === 'skill' ? group.destinationRoot : group.supportRoot;
    const rootRecord = plannedRoots.get(plannedRoot) ?? {
      groups: new Set(),
      files: new Set(),
    };
    rootRecord.groups.add(group);
    for (const candidate of outputCandidates) {
      if (
        candidate.group === group
        && candidate.destinationPath.startsWith(`${plannedRoot}/`)
      ) {
        rootRecord.files.add(candidate.destinationPath);
      }
    }
    plannedRoots.set(plannedRoot, rootRecord);
  }
  for (const [plannedRoot, record] of plannedRoots) {
    const unplanned = findUnplannedEntries(workspaceRoot, plannedRoot, record.files);
    if (unplanned.length === 0) continue;
    diagnostics.push(makeDiagnostic(
      'destination-unplanned-entry',
      plannedRoot,
      unplanned,
      'Planned artifact root contains entries not present in the source mapping.',
      'Remove or move the unplanned entries and analyze again.',
    ));
    for (const candidate of outputCandidates) {
      if (record.groups.has(candidate.group)) candidate.legal = false;
    }
  }

  const legalOutputCandidates = outputCandidates.filter((candidate) => (
    candidate.legal
    && (candidate.destinationState?.type === 'missing'
      || candidate.destinationState?.type === 'regular-file')
  ));
  const outputBytesByDestination = new Map(legalOutputCandidates.map((candidate) => (
    [candidate.destinationPath, Buffer.from(candidate.outputBytes)]
  )));
  const outputs = legalOutputCandidates
    .map((candidate) => ({
      source_path: candidate.sourcePath,
      destination_path: candidate.destinationPath,
      output_sha256: candidate.outputSha256,
      transform_ids: [...candidate.transformIds],
      destination_state: candidate.destinationState,
    }))
    .sort((left, right) => compareRaw(left.destination_path, right.destination_path));

  destinationFacts.sort((left, right) => (
    compareRaw(left.destination_path, right.destination_path)
    || compareRaw(left.source_path, right.source_path)
  ));
  diagnostics.sort((left, right) => {
    const codeOrder = compareRaw(left.code, right.code);
    if (codeOrder !== 0) return codeOrder;
    if (left.path === null && right.path !== null) return 1;
    if (left.path !== null && right.path === null) return -1;
    const pathOrder = compareRaw(left.path ?? '', right.path ?? '');
    if (pathOrder !== 0) return pathOrder;
    const sharedLength = Math.min(left.related_paths.length, right.related_paths.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const relatedOrder = compareRaw(left.related_paths[index], right.related_paths[index]);
      if (relatedOrder !== 0) return relatedOrder;
    }
    if (left.related_paths.length !== right.related_paths.length) {
      return left.related_paths.length - right.related_paths.length;
    }
    return compareRaw(left.message, right.message);
  });
  const uniqueDiagnostics = [];
  const diagnosticIdentities = new Set();
  for (const item of diagnostics) {
    const identity = JSON.stringify([item.code, item.path, item.related_paths]);
    if (diagnosticIdentities.has(identity)) continue;
    diagnosticIdentities.add(identity);
    uniqueDiagnostics.push(item);
  }

  await sourceAnalysis.revalidate();

  async function getOutputBytes(destinationPath) {
    if (typeof destinationPath !== 'string' || !outputBytesByDestination.has(destinationPath)) {
      throw new Error(`unknown or missing computed output: ${String(destinationPath)}`);
    }
    return Buffer.from(outputBytesByDestination.get(destinationPath));
  }

  return {
    groups,
    outputs,
    blocking_diagnostics: uniqueDiagnostics,
    destination_facts: destinationFacts,
    getOutputBytes,
  };
}
