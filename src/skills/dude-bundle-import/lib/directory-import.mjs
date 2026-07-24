// @ts-check
import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { normalizeAgentDest, normalizeSkillDir } from '../import.mjs';
import { resolveMutationPath } from '../../dude-engine/lib/workspace-paths.mjs';
import {
  createCanonicalEntryManifest,
  DIRECTORY_SOURCE_LIMITS,
} from './directory-source.mjs';
import {
  DIRECTORY_RISK_RULESET,
  scanDirectoryRisks,
  validateDirectoryRiskFindings,
} from './directory-risk.mjs';
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
const ANALYSIS_FIELDS = [
  'schema_version',
  'kind',
  'source',
  'entries',
  'manifest_sha256',
  'groups',
  'outputs',
  'static_findings',
  'blocking_diagnostics',
  'static_decision',
  'review_batches',
  'analysis_sha256',
];
const ENTRY_FIELDS = ['path', 'entry_type', 'byte_count', 'sha256', 'content_class'];
const GROUP_FIELDS = ['kind', 'entrypoint'];
const OUTPUT_FIELDS = [
  'source_path',
  'destination_path',
  'output_sha256',
  'transform_ids',
  'destination_state',
];
const DIAGNOSTIC_FIELDS = ['code', 'path', 'related_paths', 'message', 'guidance'];
const BATCH_FIELDS = ['batch_id', 'files'];
const BATCH_FILE_FIELDS = ['path', 'content'];
const REVIEW_FIELDS = [
  'schema_version',
  'kind',
  'analysis_sha256',
  'reviewed_batch_ids',
  'findings',
];
const REVIEW_FINDING_FIELDS = [
  'batch_id',
  'path',
  'category',
  'severity',
  'evidence',
  'explanation',
];
const PLAN_FIELDS = [
  'schema_version',
  'kind',
  'analysis_sha256',
  'source',
  'manifest_sha256',
  'groups',
  'outputs',
  'static_findings',
  'reviewed_batch_ids',
  'advisory_findings',
  'decision',
  'replace_paths',
  'plan_sha256',
];
const RESULT_FIELDS = [
  'schema_version',
  'kind',
  'status',
  'plan_sha256',
  'written_paths',
  'restored_paths',
  'unchanged_paths',
  'uncertain_paths',
  'recovery_directory',
  'message',
];
const REVIEW_LIMITS = Object.freeze({
  max_files: 16,
  max_utf8_bytes: 262_144,
});
const DIRECTORY_REVIEW_CANONICAL_JSON_MAX_BYTES = 1_048_576;
const DIRECTORY_PLAN_CANONICAL_JSON_MAX_BYTES = 16_777_216;
// At most one artifact group and one review batch can originate per regular file.
const MAX_ANALYSIS_GROUPS = DIRECTORY_SOURCE_LIMITS.max_regular_files;
const MAX_REVIEW_BATCHES = DIRECTORY_SOURCE_LIMITS.max_regular_files;
// With R regular files, R + floor((R - 1)^2 / 4) maximizes ordinary outputs
// plus root notices shared across every remaining group: 128 + 4032 = 4160.
const MAX_ANALYSIS_OUTPUTS = DIRECTORY_SOURCE_LIMITS.max_regular_files
  + Math.floor(((DIRECTORY_SOURCE_LIMITS.max_regular_files - 1) ** 2) / 4);
// The scanner retains at most its published per-file cap for each regular file.
const MAX_STATIC_FINDINGS = DIRECTORY_SOURCE_LIMITS.max_regular_files
  * DIRECTORY_RISK_RULESET.limits.max_findings_per_file;
// Nine output-scale diagnostic families, four entry-scale families, and the
// singleton no-entrypoint diagnostic: (9 * 4160) + (4 * 256) + 1 = 38465.
const MAX_ANALYSIS_DIAGNOSTICS = (9 * MAX_ANALYSIS_OUTPUTS)
  + (4 * DIRECTORY_SOURCE_LIMITS.max_entries)
  + 1;
const SAFETY_CLAIMS = Object.freeze([
  'Static and language-model review do not prove safety.',
  'Directory import does not execute imported content.',
]);
const DIAGNOSTIC_CODES = new Set([
  'source-entry-unsupported',
  'entrypoint-not-found',
  'entrypoint-root-ambiguous',
  'entrypoint-frontmatter-invalid',
  'entrypoint-required-field-invalid',
  'entrypoint-adaptation-required',
  'skill-name-invalid',
  'ownership-unowned',
  'agent-boundary-missing',
  'agent-boundary-malformed',
  'agent-boundary-duplicated',
  'agent-boundary-noncanonical',
  'output-collision',
  'output-case-collision',
  'reference-broken-by-mapping',
  'destination-unsafe-ancestor',
  'destination-case-collision',
  'destination-multilink',
  'destination-unsupported',
  'destination-unplanned-entry',
  'source-output-overlap',
  'source-output-alias',
  'source-destination-file-identity',
  'output-output-overlap',
  'output-output-alias',
  'output-output-file-identity',
]);
const PLANNING_CONFLICT_CODE_ORDER = new Map([
  ['source-output-overlap', 0],
  ['source-output-alias', 1],
  ['source-destination-file-identity', 2],
  ['output-output-overlap', 3],
  ['output-output-alias', 4],
  ['output-output-file-identity', 5],
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40}$/;
const REVIEW_CATEGORIES = new Set([
  'destructive-action',
  'credential-data-access',
  'network-exfiltration',
  'dynamic-unsafe-execution',
  'privilege-boundary-bypass',
  'persistence-automatic-activation',
  'obfuscation-evasion',
  'prompt-injection-authority-override',
]);
const DIRECTORY_ANALYSIS_CONTEXTS = new WeakSet();
const DIRECTORY_ANALYSIS_PRIVATE_FACTS = new WeakMap();
const DIRECTORY_APPLY_PREFLIGHTS = new WeakMap();
const DIRECTORY_TRANSACTION_PARENTS = Object.freeze([
  '.dude/state/import-transactions',
  '.github/.dude-import-transactions',
]);
const DIRECTORY_IMPORT_SUCCESS_MESSAGE = 'Directory import installed successfully.';

export class DirectoryPlanningRefusal extends Error {
  /**
   * @param {string} code
   * @param {string|null} sourcePath
   * @param {readonly string[]} destinationPaths
   * @param {string} message
   */
  constructor(code, sourcePath, destinationPaths, message) {
    super(message);
    Object.defineProperty(this, 'name', { value: 'DirectoryPlanningRefusal' });
    const frozenDestinationPaths = Object.freeze(
      [...new Set(destinationPaths)].sort(compareRaw),
    );
    this.code = code;
    this.source_path = sourcePath;
    this.destination_paths = frozenDestinationPaths;
    Object.freeze(this);
  }
}

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

/** @param {any} value */
function cloneData(value) {
  if (Array.isArray(value)) return value.map(cloneData);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => (
    [key, cloneData(nested)]
  )));
}

/** @param {any} value */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

/** @param {string} value @param {string} label */
function validatePairedUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${label} must not contain an unpaired surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${label} must not contain an unpaired surrogate`);
    }
  }
}

/** @param {unknown} value @param {string} label */
function validateString(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  validatePairedUnicode(value, label);
  return value;
}

/** @param {unknown} value @param {string} label @param {number} [max] */
function validateDenseArray(value, label, max) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an ordinary array`);
  }
  if (max !== undefined && value.length > max) {
    throw new Error(`${label} exceeds the maximum length of ${max}`);
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be an ordinary array`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    throw new TypeError(`${label} must not have symbol properties`);
  }
  if (ownKeys.length !== value.length + 1 || !ownKeys.includes('length')) {
    throw new Error(`${label} must be dense and have no extra properties`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label} must contain only enumerable data elements`);
    }
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {readonly string[]} fields
 * @param {string} label
 */
function readExactRecord(value, fields, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== fields.length
    || ownKeys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    throw new Error(`${label} must have exactly these fields: ${fields.join(', ')}`);
  }
  const result = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label}.${field} must be an enumerable data property`);
    }
    result[field] = descriptor.value;
  }
  return /** @type {Record<string, any>} */ (result);
}

/** @param {unknown} value @param {Set<object>} ancestors */
function serializeCanonicalValue(value, ancestors) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    validatePairedUnicode(value, 'canonical JSON string');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new TypeError('canonical JSON numbers must be safe integers other than negative zero');
    }
    return String(value);
  }
  if (!value || typeof value !== 'object') {
    throw new TypeError(`unsupported canonical JSON value type: ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError('canonical JSON must not contain cycles');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      validateDenseArray(value, 'canonical JSON array');
      return `[${value.map((item) => serializeCanonicalValue(item, ancestors)).join(',')}]`;
    }
    if (!isPlainObject(value)) throw new TypeError('canonical JSON objects must be plain objects');
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) {
      throw new TypeError('canonical JSON objects must not have symbol properties');
    }
    const stringKeys = /** @type {string[]} */ (keys).sort(compareRaw);
    return `{${stringKeys.map((key) => {
      validatePairedUnicode(key, 'canonical JSON object key');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError('canonical JSON objects must contain only enumerable data properties');
      }
      return `${JSON.stringify(key)}:${serializeCanonicalValue(descriptor.value, ancestors)}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** @param {unknown} value */
function canonicalJson(value) {
  return serializeCanonicalValue(value, new Set());
}

/** @param {unknown} value @param {string} label @param {number} maxBytes */
function validateCanonicalJsonByteLength(value, label, maxBytes) {
  const serialized = canonicalJson(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new Error(`${label} canonical JSON exceeds ${maxBytes} UTF-8 bytes`);
  }
  return serialized;
}

/** @param {unknown} value */
function canonicalSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

/** @param {unknown} value @param {string} label */
function validateSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function validateCanonicalPath(value, label) {
  const relativePath = validateString(value, label);
  if (
    relativePath.length === 0
    || path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || relativePath.includes('\\')
  ) {
    throw new Error(`${label} must be a non-empty relative POSIX path`);
  }
  for (const segment of relativePath.split('/')) {
    if (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || /\p{Cc}/u.test(segment)
    ) {
      throw new Error(`${label} is not canonical: ${JSON.stringify(relativePath)}`);
    }
  }
  return relativePath;
}

/** @param {string} value @param {string} label */
function encodeCanonicalUrlSegment(value, label) {
  validateString(value, label);
  if (
    value.length === 0
    || value === '.'
    || value === '..'
    || value.includes('/')
    || value.includes('\\')
    || /\p{Cc}/u.test(value)
  ) {
    throw new Error(`${label} must be one non-empty canonical URL segment`);
  }
  const encoded = encodeURIComponent(value);
  if (decodeURIComponent(encoded) !== value) {
    throw new Error(`${label} must round-trip as one canonical URL segment`);
  }
  return encoded;
}

/** @param {string} ref */
function validateGitRef(ref) {
  const forbidden = '~^:?*[\\';
  const hasForbiddenCharacter = [...ref].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f || forbidden.includes(character);
  });
  if (
    ref === '@'
    || ref.startsWith('.')
    || ref.endsWith('.')
    || ref.includes('..')
    || ref.includes('@{')
    || ref.endsWith('.lock')
    || hasForbiddenCharacter
  ) {
    throw new Error('directory source GitHub requested_ref is invalid');
  }
}

/** @param {unknown} source */
function validateSourceProvenance(source) {
  const sourceValues = readExactRecord(
    source,
    ['provider', 'input', 'identity'],
    'directory source provenance',
  );
  const provider = validateString(sourceValues.provider, 'directory source provider');
  const input = validateString(sourceValues.input, 'directory source input');
  if (input.length === 0) throw new Error('directory source input must not be empty');

  const identityKeys = provider === 'local-directory'
    ? ['root_path']
    : provider === 'github-tree'
      ? ['owner', 'repository', 'requested_ref', 'resolved_commit', 'subtree', 'tree_sha']
      : null;
  if (!identityKeys) {
    throw new Error(`unsupported directory source provider: ${provider}`);
  }
  const identity = readExactRecord(
    sourceValues.identity,
    identityKeys,
    `directory source ${provider} identity`,
  );
  for (const key of identityKeys) {
    if (validateString(identity[key], `directory source identity ${key}`).length === 0) {
      throw new Error(`directory source identity ${key} must not be empty`);
    }
  }
  if (provider === 'local-directory') {
    if (!path.isAbsolute(identity.root_path) || path.normalize(identity.root_path) !== identity.root_path) {
      throw new Error('directory source root_path must be an absolute canonical path');
    }
    return;
  }

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(identity.owner)) {
    throw new Error('directory source GitHub owner is invalid');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(identity.repository) || /\.git$/i.test(identity.repository)) {
    throw new Error('directory source GitHub repository is invalid');
  }
  validateGitRef(identity.requested_ref);
  const subtree = validateCanonicalPath(identity.subtree, 'directory source GitHub subtree');
  const subtreeSegments = subtree.split('/');
  if (subtreeSegments.length + 3 > DIRECTORY_SOURCE_LIMITS.max_metadata_requests) {
    throw new Error(
      `directory source GitHub subtree exceeds the ${DIRECTORY_SOURCE_LIMITS.max_metadata_requests}-request metadata limit`,
    );
  }
  if (!GIT_OBJECT_PATTERN.test(identity.resolved_commit) || !GIT_OBJECT_PATTERN.test(identity.tree_sha)) {
    throw new Error('directory source GitHub identity must use lowercase 40-hex Git object IDs');
  }
  const expectedInput = `https://github.com/${encodeCanonicalUrlSegment(identity.owner, 'directory source GitHub owner')}/${encodeCanonicalUrlSegment(identity.repository, 'directory source GitHub repository')}/tree/${encodeCanonicalUrlSegment(identity.requested_ref, 'directory source GitHub requested_ref')}/${subtreeSegments.map((segment) => encodeCanonicalUrlSegment(segment, 'directory source GitHub subtree segment')).join('/')}`;
  if (input !== expectedInput) {
    throw new Error('directory source GitHub input does not match its canonical identity');
  }
}

/** @param {any} source */
function copySourceProvenance(source) {
  if (source.provider === 'local-directory') {
    return {
      provider: source.provider,
      input: source.input,
      identity: { root_path: source.identity.root_path },
    };
  }
  return {
    provider: source.provider,
    input: source.input,
    identity: {
      owner: source.identity.owner,
      repository: source.identity.repository,
      requested_ref: source.identity.requested_ref,
      resolved_commit: source.identity.resolved_commit,
      subtree: source.identity.subtree,
      tree_sha: source.identity.tree_sha,
    },
  };
}

/** @param {readonly string[]} left @param {readonly string[]} right */
function compareRawArrays(left, right) {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const itemOrder = compareRaw(left[index], right[index]);
    if (itemOrder !== 0) return itemOrder;
  }
  return left.length - right.length;
}

/** @param {any} left @param {any} right */
function compareDiagnostics(left, right) {
  const codeOrder = compareRaw(left.code, right.code);
  if (codeOrder !== 0) return codeOrder;
  if (left.path === null && right.path !== null) return 1;
  if (left.path !== null && right.path === null) return -1;
  return compareRaw(left.path ?? '', right.path ?? '')
    || compareRawArrays(left.related_paths, right.related_paths)
    || compareRaw(left.message, right.message);
}

/** @param {any} left @param {any} right */
function compareReviewFindings(left, right) {
  const severityOrder = new Map([['warn', 0], ['info', 1]]);
  return compareRaw(left.batch_id, right.batch_id)
    || compareRaw(left.path, right.path)
    || /** @type {number} */ (severityOrder.get(left.severity))
      - /** @type {number} */ (severityOrder.get(right.severity))
    || compareRaw(left.category, right.category)
    || compareRaw(left.evidence, right.evidence)
    || compareRaw(left.explanation, right.explanation);
}

/**
 * @param {readonly any[]} entries
 * @param {Map<string, Buffer>} bytesByPath
 */
function createReviewBatches(entries, bytesByPath) {
  const batches = [];
  let files = [];
  let utf8Bytes = 0;

  function flush() {
    if (files.length === 0) return;
    batches.push({
      batch_id: `batch-${String(batches.length + 1).padStart(3, '0')}`,
      files,
    });
    files = [];
    utf8Bytes = 0;
  }

  for (const entry of entries) {
    if (entry.entry_type !== 'regular-file' || entry.content_class !== 'text') continue;
    const bytes = bytesByPath.get(entry.path);
    if (!bytes) throw new Error(`missing validated source bytes for review batch: ${entry.path}`);
    if (bytes.length > REVIEW_LIMITS.max_utf8_bytes) continue;
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) {
      throw new Error(`review batch text does not round-trip as exact UTF-8: ${entry.path}`);
    }
    if (
      files.length >= REVIEW_LIMITS.max_files
      || utf8Bytes + bytes.length > REVIEW_LIMITS.max_utf8_bytes
    ) {
      flush();
    }
    files.push({ path: entry.path, content });
    utf8Bytes += bytes.length;
  }
  flush();
  return batches;
}

/** @param {readonly any[]} findings @param {readonly any[]} diagnostics */
function deriveStaticDecision(findings, diagnostics) {
  if (diagnostics.length > 0 || findings.some((finding) => finding.severity === 'block')) {
    return 'blocked';
  }
  if (findings.some((finding) => finding.severity === 'warn')) return 'warned';
  return 'clean';
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

/** @param {fs.BigIntStats} stat */
function fileIdentity(stat) {
  return { device: stat.dev.toString(), inode: stat.ino.toString() };
}

/** @param {fs.BigIntStats} stat */
function fileIdentityKey(stat) {
  const identity = fileIdentity(stat);
  return `${identity.device}:${identity.inode}`;
}

function createComponentPrefixIndex() {
  return {
    children: new Map(),
    terminal_owners: new Set(),
    subtree_owners: new Set(),
  };
}

/** @param {Set<any>} owners @param {any} owner */
function otherComponentOwner(owners, owner) {
  for (const candidate of owners) {
    if (candidate !== owner) return candidate;
  }
  return null;
}

/** @param {any} index @param {readonly string[]} components @param {any} owner */
function probeComponentPrefix(index, components, owner) {
  let node = index;
  for (const component of components) {
    node = node.children.get(component);
    if (!node) return null;
    const prefixOwner = otherComponentOwner(node.terminal_owners, owner);
    if (prefixOwner !== null) return prefixOwner;
  }
  return otherComponentOwner(node.subtree_owners, owner);
}

/** @param {any} index @param {readonly string[]} components @param {any} owner */
function probeComponentPrefixOwners(index, components, owner) {
  const conflicts = new Set();
  let node = index;
  for (const component of components) {
    node = node.children.get(component);
    if (!node) return conflicts;
    for (const candidate of node.terminal_owners) {
      if (candidate !== owner) conflicts.add(candidate);
    }
  }
  for (const candidate of node.subtree_owners) {
    if (candidate !== owner) conflicts.add(candidate);
  }
  return conflicts;
}

/** @param {any} index @param {readonly string[]} components @param {any} owner */
function addComponentPrefix(index, components, owner) {
  let node = index;
  for (const component of components) {
    let child = node.children.get(component);
    if (!child) {
      child = createComponentPrefixIndex();
      node.children.set(component, child);
    }
    node = child;
    node.subtree_owners.add(owner);
  }
  node.terminal_owners.add(owner);
}

/** @param {any} index @param {readonly string[]} components @param {any} owner */
function indexComponentPrefix(index, components, owner) {
  const conflictingOwner = probeComponentPrefix(index, components, owner);
  if (conflictingOwner === null) addComponentPrefix(index, components, owner);
  return conflictingOwner;
}

/** @param {string} absolutePath @param {boolean} [foldCase] */
function absolutePathComponents(absolutePath, foldCase = false) {
  const resolvedPath = path.resolve(absolutePath);
  const root = path.parse(resolvedPath).root;
  const remainder = resolvedPath.slice(root.length);
  const components = [
    root,
    ...(remainder.length === 0 ? [] : remainder.split(path.sep)),
  ];
  return foldCase ? components.map((component) => component.toLowerCase()) : components;
}

/**
 * @param {string} workspaceRoot
 * @param {string} destinationPath
 */
function captureOutputPlanningFact(workspaceRoot, destinationPath) {
  const lexicalPath = path.resolve(workspaceRoot, ...destinationPath.split('/'));
  const segments = destinationPath.split('/');
  let ancestorPath = path.resolve(workspaceRoot);
  let ancestorStat = lstatOrNull(ancestorPath);
  if (!ancestorStat || !ancestorStat.isDirectory() || ancestorStat.isSymbolicLink()) {
    throw new Error(`directory output anchor changed during planning fact capture: ${destinationPath}`);
  }
  const ancestorProjections = [];
  const projectionKeys = new Set();
  let tail = segments;
  let finalIdentityKey = null;

  for (let index = 0; index < segments.length; index += 1) {
    const projectionTail = segments.slice(index);
    const identityKey = fileIdentityKey(ancestorStat);
    const projectionKey = JSON.stringify([destinationPath, identityKey, projectionTail]);
    if (!projectionKeys.has(projectionKey)) {
      projectionKeys.add(projectionKey);
      ancestorProjections.push({ identity_key: identityKey, tail: projectionTail });
    }

    const childPath = path.join(ancestorPath, segments[index]);
    const childStat = lstatOrNull(childPath);
    if (!childStat) {
      tail = projectionTail;
      break;
    }
    const final = index === segments.length - 1;
    if (final) {
      if (!childStat.isFile() || childStat.isSymbolicLink()) {
        throw new Error(`legal directory output changed during planning fact capture: ${destinationPath}`);
      }
      tail = projectionTail;
      finalIdentityKey = fileIdentityKey(childStat);
      break;
    }
    if (!childStat.isDirectory() || childStat.isSymbolicLink()) {
      throw new Error(`legal directory output ancestor changed during planning fact capture: ${destinationPath}`);
    }
    ancestorPath = childPath;
    ancestorStat = childStat;
  }

  const canonicalAncestor = fs.realpathSync(ancestorPath);
  return {
    destination_path: destinationPath,
    lexical_path: lexicalPath,
    canonical_path: path.resolve(canonicalAncestor, ...tail),
    anchor_device: ancestorStat.dev.toString(),
    ancestor_projections: ancestorProjections,
    final_identity_key: finalIdentityKey,
  };
}

/**
 * @param {string} workspaceRoot
 * @param {string} relativePath
 */
function captureTransactionParentFact(workspaceRoot, relativePath) {
  try {
    const lexicalPath = path.resolve(workspaceRoot, ...relativePath.split('/'));
    const segments = relativePath.split('/');
    let anchorPath = path.resolve(workspaceRoot);
    let anchorStat = lstatOrNull(anchorPath);
    if (!anchorStat || !anchorStat.isDirectory() || anchorStat.isSymbolicLink()) return null;

    const ancestorProjections = [{
      identity_key: fileIdentityKey(anchorStat),
      tail: [...segments],
    }];
    let tail = segments;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      let exact = false;
      let caseAlias = false;
      visitDirectoryNames(anchorPath, (name) => {
        if (name === segment) exact = true;
        else if (name.toLowerCase() === segment.toLowerCase()) caseAlias = true;
      });
      if (caseAlias) return null;
      if (!exact) {
        tail = segments.slice(index);
        break;
      }

      const childPath = path.join(anchorPath, segment);
      const childStat = lstatOrNull(childPath);
      if (!childStat || !childStat.isDirectory() || childStat.isSymbolicLink()) return null;
      anchorPath = childPath;
      anchorStat = childStat;
      tail = segments.slice(index + 1);
      ancestorProjections.push({
        identity_key: fileIdentityKey(anchorStat),
        tail: [...tail],
      });
    }

    const canonicalAnchor = fs.realpathSync(anchorPath);
    return deepFreeze({
      relative_path: relativePath,
      lexical_path: lexicalPath,
      canonical_path: path.resolve(canonicalAnchor, ...tail),
      anchor_device: anchorStat.dev.toString(),
      ancestor_projections: ancestorProjections,
    });
  } catch {
    return null;
  }
}

/** @param {string} left @param {string} right @param {boolean} [foldCase] */
function absolutePathsOverlap(left, right, foldCase = false) {
  const index = createComponentPrefixIndex();
  const owner = Symbol('path');
  addComponentPrefix(index, absolutePathComponents(left, foldCase), owner);
  return probeComponentPrefix(index, absolutePathComponents(right, foldCase), null) !== null;
}

/** @param {any} transaction @param {any} facts */
function transactionParentOverlaps(transaction, facts) {
  const boundaries = [...facts.outputs];
  if (facts.source) {
    boundaries.push({
      lexical_path: facts.source.lexical_root,
      canonical_path: facts.source.canonical_root,
    });
  }
  for (const boundary of boundaries) {
    if (
      absolutePathsOverlap(transaction.lexical_path, boundary.lexical_path)
      || absolutePathsOverlap(transaction.canonical_path, boundary.canonical_path)
      || absolutePathsOverlap(transaction.lexical_path, boundary.lexical_path, true)
      || absolutePathsOverlap(transaction.canonical_path, boundary.canonical_path, true)
    ) {
      return true;
    }
  }

  if (
    facts.source
    && transaction.ancestor_projections.some((projection) => (
      facts.source.directory_identity_keys.has(projection.identity_key)
    ))
  ) {
    return true;
  }

  for (const output of facts.outputs) {
    for (const transactionProjection of transaction.ancestor_projections) {
      for (const outputProjection of output.ancestor_projections) {
        if (transactionProjection.identity_key !== outputProjection.identity_key) continue;
        if (transactionProjection.tail.length === 0 || outputProjection.tail.length === 0) {
          return true;
        }
        const exactIndex = createComponentPrefixIndex();
        const owner = Symbol('transaction-parent');
        addComponentPrefix(exactIndex, transactionProjection.tail, owner);
        if (probeComponentPrefix(exactIndex, outputProjection.tail, null) !== null) return true;
        const foldedIndex = createComponentPrefixIndex();
        addComponentPrefix(
          foldedIndex,
          transactionProjection.tail.map((component) => component.toLowerCase()),
          owner,
        );
        if (
          probeComponentPrefix(
            foldedIndex,
            outputProjection.tail.map((component) => component.toLowerCase()),
            null,
          ) !== null
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/** @param {string} workspaceRoot @param {any} facts */
function selectDirectoryTransactionParent(workspaceRoot, facts) {
  const safeCandidates = DIRECTORY_TRANSACTION_PARENTS
    .map((relativePath) => captureTransactionParentFact(workspaceRoot, relativePath))
    .filter((candidate) => candidate !== null && !transactionParentOverlaps(candidate, facts));
  if (safeCandidates.length === 0) {
    refuseDirectoryPlanning(
      'transaction-parent-unavailable',
      null,
      DIRECTORY_TRANSACTION_PARENTS,
    );
  }

  const outputDevices = new Set(facts.outputs.map((output) => output.anchor_device));
  const sharedOutputDevice = outputDevices.size === 1 ? [...outputDevices][0] : null;
  const sameDeviceCandidate = sharedOutputDevice === null
    ? null
    : safeCandidates.find((candidate) => candidate.anchor_device === sharedOutputDevice) ?? null;
  const selected = sameDeviceCandidate ?? safeCandidates[0];
  return deepFreeze({
    ...selected,
    same_destination_filesystem: sameDeviceCandidate !== null,
  });
}

/** @param {any} source @param {readonly any[]} entries */
function captureSourcePlanningFacts(source, entries) {
  if (source.provider !== 'local-directory') return null;
  const lexicalRoot = path.resolve(source.input);
  const rootStat = lstatOrNull(lexicalRoot);
  if (!rootStat) {
    throw new Error('local directory source root changed during planning fact capture');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('local directory source root changed during planning fact capture');
  }
  const canonicalRoot = fs.realpathSync(lexicalRoot);
  if (canonicalRoot !== source.identity.root_path) {
    throw new Error('local directory source root identity changed during planning fact capture');
  }
  const directoryIdentityKeys = new Set([fileIdentityKey(rootStat)]);
  const filePathsByIdentity = new Map();
  for (const entry of entries) {
    const lexicalPath = path.join(lexicalRoot, ...entry.path.split('/'));
    if (entry.entry_type === 'directory') {
      const stat = lstatOrNull(lexicalPath);
      if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`local directory source directory changed during planning fact capture: ${entry.path}`);
      }
      directoryIdentityKeys.add(fileIdentityKey(stat));
      continue;
    }
    if (entry.entry_type !== 'regular-file') continue;
    const stat = lstatOrNull(lexicalPath);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`local directory source file changed during planning fact capture: ${entry.path}`);
    }
    const identityKey = fileIdentityKey(stat);
    const sourcePaths = filePathsByIdentity.get(identityKey) ?? [];
    sourcePaths.push(entry.path);
    filePathsByIdentity.set(identityKey, sourcePaths);
  }
  return {
    lexical_root: lexicalRoot,
    canonical_root: canonicalRoot,
    directory_identity_keys: directoryIdentityKeys,
    file_paths_by_identity: filePathsByIdentity,
  };
}

/**
 * @param {string} code
 * @param {string|null} sourcePath
 * @param {readonly string[]} destinationPaths
 * @returns {never}
 */
function refuseDirectoryPlanning(code, sourcePath, destinationPaths) {
  throw new DirectoryPlanningRefusal(
    code,
    sourcePath,
    destinationPaths,
    `Directory planning refused: ${code}`,
  );
}

/** @param {any} left @param {any} right */
function comparePlanningConflicts(left, right) {
  return /** @type {number} */ (PLANNING_CONFLICT_CODE_ORDER.get(left.code))
    - /** @type {number} */ (PLANNING_CONFLICT_CODE_ORDER.get(right.code))
    || (left.source_path === null && right.source_path !== null ? 1 : 0)
    || (left.source_path !== null && right.source_path === null ? -1 : 0)
    || compareRaw(left.source_path ?? '', right.source_path ?? '')
    || compareRawArrays(left.destination_paths, right.destination_paths);
}

/**
 * @param {any[]} conflicts
 * @param {string} code
 * @param {string|null} sourcePath
 * @param {readonly string[]} destinationPaths
 */
function addPlanningConflict(conflicts, code, sourcePath, destinationPaths) {
  conflicts.push({
    code,
    source_path: sourcePath,
    destination_paths: [...new Set(destinationPaths)].sort(compareRaw),
  });
}

/** @param {{source: any, outputs: readonly any[]}} facts */
function collectDirectoryPlanningConflicts(facts) {
  const outputs = [...facts.outputs].sort((left, right) => (
    compareRaw(left.destination_path, right.destination_path)
  ));
  const conflicts = [];

  if (facts.source) {
    const sourceOwner = Symbol('source-root');
    const lexicalSourceIndex = createComponentPrefixIndex();
    addComponentPrefix(
      lexicalSourceIndex,
      absolutePathComponents(facts.source.lexical_root),
      sourceOwner,
    );
    for (const output of outputs) {
      const overlapsLexically = (
        probeComponentPrefix(
          lexicalSourceIndex,
          absolutePathComponents(output.lexical_path),
          output.destination_path,
        ) !== null
      );
      if (overlapsLexically) {
        addPlanningConflict(
          conflicts,
          'source-output-overlap',
          null,
          [output.destination_path],
        );
      }

      if (
        !overlapsLexically
        && (
          absolutePathsOverlap(facts.source.canonical_root, output.canonical_path)
          || absolutePathsOverlap(facts.source.lexical_root, output.lexical_path, true)
          || absolutePathsOverlap(facts.source.canonical_root, output.canonical_path, true)
          || output.ancestor_projections.some((projection) => (
            facts.source.directory_identity_keys.has(projection.identity_key)
          ))
        )
      ) {
        addPlanningConflict(
          conflicts,
          'source-output-alias',
          null,
          [output.destination_path],
        );
      }
    }

    const destinationsByFileIdentity = new Map();
    for (const output of outputs) {
      if (output.final_identity_key === null) continue;
      const destinations = destinationsByFileIdentity.get(output.final_identity_key) ?? [];
      destinations.push(output.destination_path);
      destinationsByFileIdentity.set(output.final_identity_key, destinations);
    }
    for (const [identityKey, sourcePaths] of facts.source.file_paths_by_identity) {
      const destinations = destinationsByFileIdentity.get(identityKey) ?? [];
      if (destinations.length === 0) continue;
      for (const sourcePath of [...sourcePaths].sort(compareRaw)) {
        addPlanningConflict(
          conflicts,
          'source-destination-file-identity',
          sourcePath,
          destinations,
        );
      }
    }
  }

  const lexicalOutputIndex = createComponentPrefixIndex();
  const canonicalOutputIndex = createComponentPrefixIndex();
  const foldedLexicalOutputIndex = createComponentPrefixIndex();
  const foldedCanonicalOutputIndex = createComponentPrefixIndex();
  const aliasIndexesByIdentity = new Map();
  const finalOwnersByIdentity = new Map();

  for (const output of outputs) {
    const destinationPath = output.destination_path;
    const overlapOwners = new Set();
    const fullPathChecks = [
      [lexicalOutputIndex, absolutePathComponents(output.lexical_path)],
      [canonicalOutputIndex, absolutePathComponents(output.canonical_path)],
      [foldedLexicalOutputIndex, absolutePathComponents(output.lexical_path, true)],
      [foldedCanonicalOutputIndex, absolutePathComponents(output.canonical_path, true)],
    ];
    for (const [index, components] of fullPathChecks) {
      for (const owner of probeComponentPrefixOwners(index, components, destinationPath)) {
        overlapOwners.add(owner);
      }
      addComponentPrefix(index, components, destinationPath);
    }
    if (overlapOwners.size > 0) {
      addPlanningConflict(
        conflicts,
        'output-output-overlap',
        null,
        [...overlapOwners, destinationPath],
      );
    }

    const aliasOwners = new Set();
    for (const projection of output.ancestor_projections) {
      let indexes = aliasIndexesByIdentity.get(projection.identity_key);
      if (!indexes) {
        indexes = {
          exact: createComponentPrefixIndex(),
          folded: createComponentPrefixIndex(),
        };
        aliasIndexesByIdentity.set(projection.identity_key, indexes);
      }
      for (const owner of probeComponentPrefixOwners(
        indexes.exact,
        projection.tail,
        destinationPath,
      )) {
        if (!overlapOwners.has(owner)) aliasOwners.add(owner);
      }
      addComponentPrefix(indexes.exact, projection.tail, destinationPath);
      const foldedTail = projection.tail.map((component) => component.toLowerCase());
      for (const owner of probeComponentPrefixOwners(
        indexes.folded,
        foldedTail,
        destinationPath,
      )) {
        if (!overlapOwners.has(owner)) aliasOwners.add(owner);
      }
      addComponentPrefix(indexes.folded, foldedTail, destinationPath);
    }
    if (aliasOwners.size > 0) {
      addPlanningConflict(
        conflicts,
        'output-output-alias',
        null,
        [...aliasOwners, destinationPath],
      );
    }

    if (output.final_identity_key !== null) {
      const existingOwners = finalOwnersByIdentity.get(output.final_identity_key) ?? new Set();
      existingOwners.add(destinationPath);
      finalOwnersByIdentity.set(output.final_identity_key, existingOwners);
    }
  }

  for (const owners of finalOwnersByIdentity.values()) {
    if (owners.size < 2) continue;
    addPlanningConflict(
      conflicts,
      'output-output-file-identity',
      null,
      [...owners],
    );
  }

  conflicts.sort(comparePlanningConflicts);
  return conflicts;
}

/** @param {{source: any, outputs: readonly any[]}} facts */
function validateDirectoryPlanningOverlap(facts) {
  const conflict = collectDirectoryPlanningConflicts(facts)[0];
  if (conflict) {
    refuseDirectoryPlanning(
      conflict.code,
      conflict.source_path,
      conflict.destination_paths,
    );
  }
  return true;
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

/**
 * @param {string} absoluteDirectory
 * @param {(name: string) => boolean|void} visit
 */
function visitDirectoryNames(absoluteDirectory, visit) {
  const directory = fs.opendirSync(absoluteDirectory);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null || visit(entry.name) === false) return;
    }
  } finally {
    directory.closeSync();
  }
}

/** @param {string} absoluteDirectory @param {string} expectedName */
function directoryContainsExactName(absoluteDirectory, expectedName) {
  let found = false;
  visitDirectoryNames(absoluteDirectory, (name) => {
    if (name !== expectedName) return true;
    found = true;
    return false;
  });
  return found;
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

    let hasExactChild = false;
    const aliases = [];
    visitDirectoryNames(cursor, (name) => {
      if (name === segment) {
        hasExactChild = true;
      } else if (name.toLowerCase() === segment.toLowerCase()) {
        if (aliases.length === DIRECTORY_SOURCE_LIMITS.max_entries) {
          throw new Error(
            `destination case aliases exceed the retained-path limit of ${DIRECTORY_SOURCE_LIMITS.max_entries}`,
          );
        }
        aliases.push(name);
      }
    });
    if (aliases.length > 0) {
      aliases.sort(compareRaw);
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
    let destinationSha256;
    let finalOpenedSnapshot;
    try {
      const openedStat = fs.fstatSync(descriptor, { bigint: true });
      const openedSnapshot = destinationStatSnapshot(openedStat);
      if (!openedStat.isFile() || !isDeepStrictEqual(openedSnapshot, initialSnapshot)) {
        throw new Error(`destination identity changed before reading: ${destinationPath}`);
      }
      const digest = crypto.createHash('sha256');
      const chunk = Buffer.allocUnsafe(64 * 1024);
      while (true) {
        const bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        digest.update(chunk.subarray(0, bytesRead));
      }
      destinationSha256 = digest.digest('hex');
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
      state: { type: 'regular-file', sha256: destinationSha256 },
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
    if (!directoryContainsExactName(absoluteRoot, segment)) return [];
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
    visitDirectoryNames(absoluteDirectory, (name) => {
      const relativePath = `${relativeDirectory}/${name}`;
      const absolutePath = path.join(absoluteDirectory, name);
      const stat = lstatOrNull(absolutePath);
      if (!stat) return;
      if (plannedFiles.has(relativePath)) return;
      if (plannedFoldedPaths.has(relativePath.toLowerCase())) return;
      if (!plannedDirectories.has(relativePath)) {
        if (unplanned.length === DIRECTORY_SOURCE_LIMITS.max_entries) {
          throw new Error(
            `destination unplanned entries exceed the retained-path limit of ${DIRECTORY_SOURCE_LIMITS.max_entries}`,
          );
        }
        unplanned.push(relativePath);
        return;
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolutePath, relativePath);
    });
  }
  visit(absoluteRoot, plannedRoot);
  return unplanned.sort(compareRaw);
}

/** @param {unknown} entriesValue @param {unknown} manifestSha256 */
function validateAnalysisEntries(entriesValue, manifestSha256) {
  const entries = validateDenseArray(
    entriesValue,
    'directory analysis entries',
    DIRECTORY_SOURCE_LIMITS.max_entries,
  );
  for (let index = 0; index < entries.length; index += 1) {
    readExactRecord(entries[index], ENTRY_FIELDS, `directory analysis entry ${index}`);
  }
  const manifest = createCanonicalEntryManifest(entries);
  if (!isDeepStrictEqual(entries, manifest.entries)) {
    throw new Error('directory analysis entries must be in canonical path order');
  }
  validateSha256(manifestSha256, 'directory analysis manifest_sha256');
  if (manifestSha256 !== manifest.manifest_sha256) {
    throw new Error('directory analysis manifest_sha256 does not match entries');
  }
  if (canonicalSha256(entries) !== manifest.manifest_sha256) {
    throw new Error('directory analysis entries disagree with canonical manifest hashing');
  }
  let regularFiles = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.path.split('/').length > DIRECTORY_SOURCE_LIMITS.max_depth) {
      throw new Error(`directory analysis entry exceeds the fixed depth limit: ${entry.path}`);
    }
    if (entry.entry_type !== 'regular-file') continue;
    regularFiles += 1;
    totalBytes += entry.byte_count;
    if (entry.byte_count > DIRECTORY_SOURCE_LIMITS.max_file_bytes) {
      throw new Error(`directory analysis entry exceeds the fixed file-byte limit: ${entry.path}`);
    }
  }
  if (regularFiles > DIRECTORY_SOURCE_LIMITS.max_regular_files) {
    throw new Error('directory analysis entries exceed the fixed regular-file limit');
  }
  if (totalBytes > DIRECTORY_SOURCE_LIMITS.max_total_bytes) {
    throw new Error('directory analysis entries exceed the fixed aggregate-byte limit');
  }
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    let ancestor = parentPath(entry.path);
    while (ancestor) {
      const ancestorEntry = entryByPath.get(ancestor);
      if (!ancestorEntry || ancestorEntry.entry_type !== 'directory') {
        throw new Error(`directory analysis entry lacks a directory ancestor: ${entry.path}`);
      }
      ancestor = parentPath(ancestor);
    }
  }
  return {
    entries,
    entryByPath,
  };
}

/** @param {unknown} groupsValue @param {Map<string, any>} entryByPath */
function validateAnalysisGroups(groupsValue, entryByPath) {
  const groups = validateDenseArray(
    groupsValue,
    'directory analysis groups',
    MAX_ANALYSIS_GROUPS,
  );
  const validated = [];
  const roots = new Set();
  let previousEntrypoint = null;
  for (let index = 0; index < groups.length; index += 1) {
    const group = readExactRecord(groups[index], GROUP_FIELDS, `directory analysis group ${index}`);
    if (group.kind !== 'agent' && group.kind !== 'skill') {
      throw new Error(`directory analysis group ${index} has an invalid kind`);
    }
    validateCanonicalPath(group.entrypoint, `directory analysis group ${index} entrypoint`);
    if (previousEntrypoint !== null && compareRaw(previousEntrypoint, group.entrypoint) >= 0) {
      throw new Error('directory analysis groups must have unique entrypoints in canonical order');
    }
    previousEntrypoint = group.entrypoint;
    const entry = entryByPath.get(group.entrypoint);
    if (!entry || entry.entry_type !== 'regular-file' || entry.content_class !== 'text') {
      throw new Error(`directory analysis group entrypoint is not a strict-text entry: ${group.entrypoint}`);
    }
    const basename = path.posix.basename(group.entrypoint);
    if (
      (group.kind === 'skill' && basename !== 'SKILL.md')
      || (group.kind === 'agent' && !basename.endsWith('.agent.md'))
    ) {
      throw new Error(`directory analysis group kind does not match entrypoint: ${group.entrypoint}`);
    }
    if (group.kind === 'agent') normalizeAgentDest(basename);
    const root = parentPath(group.entrypoint);
    if (roots.has(root)) throw new Error(`directory analysis groups repeat artifact root: ${root || '.'}`);
    roots.add(root);
    validated.push({ kind: group.kind, entrypoint: group.entrypoint, root });
  }
  return validated;
}

/** @param {string} sourcePath @param {readonly any[]} groups */
function owningAnalysisGroup(sourcePath, groups) {
  const matches = groups
    .filter((group) => isWithinSourceRoot(sourcePath, group.root))
    .sort((left, right) => right.root.length - left.root.length || compareRaw(left.root, right.root));
  return matches[0] ?? null;
}

/** @param {unknown} stateValue @param {string} label */
function validateDestinationState(stateValue, label) {
  if (!isPlainObject(stateValue)) throw new TypeError(`${label} must be a plain object`);
  const typeDescriptor = Object.getOwnPropertyDescriptor(stateValue, 'type');
  if (!typeDescriptor || !('value' in typeDescriptor) || !typeDescriptor.enumerable) {
    throw new TypeError(`${label}.type must be an enumerable data property`);
  }
  if (typeDescriptor.value === 'missing') {
    readExactRecord(stateValue, ['type'], label);
    return;
  }
  if (typeDescriptor.value === 'regular-file') {
    const state = readExactRecord(stateValue, ['type', 'sha256'], label);
    validateSha256(state.sha256, `${label}.sha256`);
    return;
  }
  throw new Error(`${label}.type must be missing or regular-file`);
}

/**
 * @param {unknown} outputsValue
 * @param {Map<string, any>} entryByPath
 * @param {readonly any[]} groups
 */
function validateAnalysisOutputs(outputsValue, entryByPath, groups) {
  const outputs = validateDenseArray(
    outputsValue,
    'directory analysis outputs',
    MAX_ANALYSIS_OUTPUTS,
  );
  const destinations = new Set();
  const foldedDestinations = new Set();
  const sourceCounts = new Map();
  const skillDestinationRoots = new Map();
  let previousDestination = null;

  for (let index = 0; index < outputs.length; index += 1) {
    const output = readExactRecord(outputs[index], OUTPUT_FIELDS, `directory analysis output ${index}`);
    const sourcePath = validateCanonicalPath(
      output.source_path,
      `directory analysis output ${index} source_path`,
    );
    const destinationPath = validateCanonicalPath(
      output.destination_path,
      `directory analysis output ${index} destination_path`,
    );
    if (previousDestination !== null && compareRaw(previousDestination, destinationPath) >= 0) {
      throw new Error('directory analysis outputs must have unique destinations in canonical order');
    }
    previousDestination = destinationPath;
    if (destinations.has(destinationPath)) throw new Error('duplicate directory analysis output destination');
    destinations.add(destinationPath);
    const foldedDestination = destinationPath.toLowerCase();
    if (foldedDestinations.has(foldedDestination)) {
      throw new Error('directory analysis legal outputs must not have a case collision');
    }
    foldedDestinations.add(foldedDestination);

    const sourceEntry = entryByPath.get(sourcePath);
    if (!sourceEntry || sourceEntry.entry_type !== 'regular-file') {
      throw new Error(`directory analysis output source is not a regular entry: ${sourcePath}`);
    }
    sourceCounts.set(sourcePath, (sourceCounts.get(sourcePath) ?? 0) + 1);
    validateSha256(output.output_sha256, `directory analysis output ${index} output_sha256`);
    const transformIds = validateDenseArray(
      output.transform_ids,
      `directory analysis output ${index} transform_ids`,
      1,
    );
    for (const transformId of transformIds) {
      if (typeof transformId !== 'string') {
        throw new TypeError(`directory analysis output ${index} transform ID must be a string`);
      }
    }
    validateDestinationState(
      output.destination_state,
      `directory analysis output ${index} destination_state`,
    );

    const selectedRootNotice = isSelectedRootNotice(sourcePath);
    const group = selectedRootNotice ? null : owningAnalysisGroup(sourcePath, groups);
    const isSkillEntrypoint = group?.kind === 'skill' && sourcePath === group.entrypoint;
    if (isSkillEntrypoint) {
      if (!isDeepStrictEqual(transformIds, ['rewrite-skill-name'])) {
        throw new Error('skill entrypoint output must use only rewrite-skill-name');
      }
    } else if (transformIds.length !== 0) {
      throw new Error('only a skill entrypoint may carry rewrite-skill-name');
    }
    if (transformIds.length === 0 && output.output_sha256 !== sourceEntry.sha256) {
      throw new Error(`byte-preserving output hash does not match source entry: ${sourcePath}`);
    }

    if (selectedRootNotice) {
      if (path.posix.basename(destinationPath) !== path.posix.basename(sourcePath)) {
        throw new Error(`shared notice output does not preserve its basename: ${sourcePath}`);
      }
      const destinationRoot = parentPath(destinationPath);
      const matchesGroup = groups.some((candidate) => {
        if (candidate.kind === 'agent') {
          const agentFile = normalizeAgentDest(path.posix.basename(candidate.entrypoint));
          return destinationRoot === `.github/agents/${agentFile.replace(/\.agent\.md$/, '.support')}`;
        }
        return /^\.github\/skills\/dude-local-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationRoot);
      });
      if (!matchesGroup) throw new Error(`shared notice output has no artifact destination: ${destinationPath}`);
      continue;
    }

    if (!group) throw new Error(`directory analysis output source has no group owner: ${sourcePath}`);
    const relativePath = path.posix.relative(group.root || '.', sourcePath);
    if (group.kind === 'agent') {
      const agentFile = normalizeAgentDest(path.posix.basename(group.entrypoint));
      const expectedDestination = sourcePath === group.entrypoint
        ? `.github/agents/${agentFile}`
        : `.github/agents/${agentFile.replace(/\.agent\.md$/, '.support')}/${relativePath}`;
      if (destinationPath !== expectedDestination) {
        throw new Error(`agent output does not match fixed mapping: ${destinationPath}`);
      }
      continue;
    }

    const suffix = `/${relativePath}`;
    if (!destinationPath.endsWith(suffix)) {
      throw new Error(`skill output does not preserve its root-relative path: ${destinationPath}`);
    }
    const destinationRoot = destinationPath.slice(0, -suffix.length);
    if (!/^\.github\/skills\/dude-local-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationRoot)) {
      throw new Error(`skill output has an invalid project-local destination: ${destinationPath}`);
    }
    const existingRoot = skillDestinationRoots.get(group.entrypoint);
    if (existingRoot !== undefined && existingRoot !== destinationRoot) {
      throw new Error(`skill outputs disagree on destination root: ${group.entrypoint}`);
    }
    skillDestinationRoots.set(group.entrypoint, destinationRoot);
  }

  for (const [sourcePath, count] of sourceCounts) {
    if (count > 1 && !isSelectedRootNotice(sourcePath)) {
      throw new Error(`directory analysis output source is repeated: ${sourcePath}`);
    }
    if (count > groups.length) {
      throw new Error(`directory analysis shared notice has too many outputs: ${sourcePath}`);
    }
  }
  return outputs;
}

/**
 * @param {unknown} diagnosticsValue
 * @param {Map<string, any>} entryByPath
 * @param {readonly any[]} groups
 * @param {readonly any[]} outputs
 */
function validateAnalysisDiagnostics(diagnosticsValue, entryByPath, groups, outputs) {
  const diagnostics = validateDenseArray(
    diagnosticsValue,
    'directory analysis blocking_diagnostics',
    MAX_ANALYSIS_DIAGNOSTICS,
  );
  const identities = new Set();
  let previous = null;
  const entrypointCodes = new Set([
    'entrypoint-frontmatter-invalid',
    'entrypoint-required-field-invalid',
    'entrypoint-adaptation-required',
    'skill-name-invalid',
    'agent-boundary-missing',
    'agent-boundary-malformed',
    'agent-boundary-duplicated',
    'agent-boundary-noncanonical',
  ]);
  const destinationCodes = new Set([
    'destination-unsafe-ancestor',
    'destination-case-collision',
    'destination-multilink',
    'destination-unsupported',
    'destination-unplanned-entry',
  ]);
  const sourceOutputCodes = new Set([
    'source-output-overlap',
    'source-output-alias',
  ]);
  const outputConflictCodes = new Set([
    'output-output-overlap',
    'output-output-alias',
    'output-output-file-identity',
  ]);
  const outputSources = new Set(outputs.map((output) => output.source_path));
  const outputDestinations = new Set(outputs.map((output) => output.destination_path));

  for (let index = 0; index < diagnostics.length; index += 1) {
    const diagnostic = readExactRecord(
      diagnostics[index],
      DIAGNOSTIC_FIELDS,
      `directory analysis blocking diagnostic ${index}`,
    );
    if (typeof diagnostic.code !== 'string' || !DIAGNOSTIC_CODES.has(diagnostic.code)) {
      throw new Error(`unknown directory analysis blocking diagnostic code: ${String(diagnostic.code)}`);
    }
    if (diagnostic.path !== null) {
      validateCanonicalPath(diagnostic.path, `directory analysis blocking diagnostic ${index} path`);
    }
    const relatedPaths = validateDenseArray(
      diagnostic.related_paths,
      `directory analysis blocking diagnostic ${index} related_paths`,
      MAX_ANALYSIS_OUTPUTS,
    );
    let previousRelated = null;
    for (const relatedPath of relatedPaths) {
      validateCanonicalPath(relatedPath, `directory analysis blocking diagnostic ${index} related path`);
      if (relatedPath === diagnostic.path) {
        throw new Error('directory analysis blocking diagnostic repeats its principal path');
      }
      if (previousRelated !== null && compareRaw(previousRelated, relatedPath) >= 0) {
        throw new Error('directory analysis blocking diagnostic related paths must be unique and sorted');
      }
      previousRelated = relatedPath;
    }
    for (const field of ['message', 'guidance']) {
      const text = validateString(
        diagnostic[field],
        `directory analysis blocking diagnostic ${index} ${field}`,
      );
      if (text.trim().length === 0) {
        throw new Error(`directory analysis blocking diagnostic ${field} must not be empty`);
      }
    }

    const identity = canonicalJson([diagnostic.code, diagnostic.path, relatedPaths]);
    if (identities.has(identity)) throw new Error('duplicate directory analysis blocking diagnostic identity');
    identities.add(identity);
    if (previous && compareDiagnostics(previous, diagnostic) >= 0) {
      throw new Error('directory analysis blocking diagnostics must be strictly sorted');
    }
    previous = diagnostic;

    if (diagnostic.code === 'source-entry-unsupported') {
      const entry = entryByPath.get(diagnostic.path);
      if (
        !entry
        || !['symbolic-link', 'non-regular'].includes(entry.entry_type)
        || relatedPaths.length !== 0
        || outputSources.has(diagnostic.path)
      ) {
        throw new Error('source-entry-unsupported diagnostic has inconsistent source references');
      }
    } else if (diagnostic.code === 'entrypoint-not-found') {
      if (diagnostic.path !== null || relatedPaths.length !== 0 || groups.length !== 0) {
        throw new Error('entrypoint-not-found diagnostic must not reference paths');
      }
    } else if (diagnostic.code === 'entrypoint-root-ambiguous') {
      const root = diagnostic.path ?? '';
      if (
        relatedPaths.length < 2
        || relatedPaths.some((relatedPath) => {
          const entry = entryByPath.get(relatedPath);
          const basename = path.posix.basename(relatedPath);
          return !entry
            || entry.entry_type !== 'regular-file'
            || parentPath(relatedPath) !== root
            || groups.some((group) => group.root === root)
            || (basename !== 'SKILL.md' && !basename.endsWith('.agent.md'));
        })
      ) {
        throw new Error('entrypoint-root-ambiguous diagnostic has inconsistent entrypoint references');
      }
    } else if (entrypointCodes.has(diagnostic.code)) {
      const entry = entryByPath.get(diagnostic.path);
      const basename = typeof diagnostic.path === 'string' ? path.posix.basename(diagnostic.path) : '';
      const expectsSkill = diagnostic.code === 'skill-name-invalid';
      const expectsAgent = diagnostic.code.startsWith('agent-boundary-');
      if (
        !entry
        || entry.entry_type !== 'regular-file'
        || relatedPaths.length !== 0
        || groups.some((group) => group.entrypoint === diagnostic.path)
        || outputSources.has(diagnostic.path)
        || (expectsSkill && basename !== 'SKILL.md')
        || (expectsAgent && !basename.endsWith('.agent.md'))
      ) {
        throw new Error(`${diagnostic.code} diagnostic has inconsistent entrypoint references`);
      }
    } else if (diagnostic.code === 'ownership-unowned') {
      const entry = entryByPath.get(diagnostic.path);
      if (
        !entry
        || entry.entry_type !== 'regular-file'
        || relatedPaths.length !== 0
        || outputSources.has(diagnostic.path)
      ) {
        throw new Error('ownership-unowned diagnostic has inconsistent source references');
      }
    } else if (diagnostic.code === 'reference-broken-by-mapping') {
      const entry = entryByPath.get(diagnostic.path);
      if (
        !entry
        || entry.entry_type !== 'regular-file'
        || relatedPaths.length === 0
        || relatedPaths.some((relatedPath) => !entryByPath.has(relatedPath))
      ) {
        throw new Error('reference-broken-by-mapping diagnostic has inconsistent source references');
      }
    } else if (diagnostic.code === 'output-collision') {
      if (
        (diagnostic.path !== null && !String(diagnostic.path).startsWith('.github/'))
        || relatedPaths.length === 0
        || relatedPaths.some((relatedPath) => !entryByPath.has(relatedPath))
      ) {
        throw new Error('output-collision diagnostic has inconsistent path references');
      }
    } else if (diagnostic.code === 'output-case-collision') {
      if (
        diagnostic.path !== null
        || relatedPaths.length < 2
        || relatedPaths.some((relatedPath) => !relatedPath.startsWith('.github/'))
      ) {
        throw new Error('output-case-collision diagnostic has inconsistent destination references');
      }
    } else if (sourceOutputCodes.has(diagnostic.code)) {
      if (
        typeof diagnostic.path !== 'string'
        || !diagnostic.path.startsWith('.github/')
        || relatedPaths.length !== 0
        || outputDestinations.has(diagnostic.path)
      ) {
        throw new Error(`${diagnostic.code} diagnostic has inconsistent output references`);
      }
    } else if (diagnostic.code === 'source-destination-file-identity') {
      const entry = entryByPath.get(diagnostic.path);
      if (
        !entry
        || entry.entry_type !== 'regular-file'
        || relatedPaths.length === 0
        || relatedPaths.some((relatedPath) => (
          !relatedPath.startsWith('.github/') || outputDestinations.has(relatedPath)
        ))
      ) {
        throw new Error('source-destination-file-identity diagnostic has inconsistent path references');
      }
    } else if (outputConflictCodes.has(diagnostic.code)) {
      if (
        diagnostic.path !== null
        || relatedPaths.length < 2
        || relatedPaths.some((relatedPath) => (
          !relatedPath.startsWith('.github/') || outputDestinations.has(relatedPath)
        ))
      ) {
        throw new Error(`${diagnostic.code} diagnostic has inconsistent output references`);
      }
    } else if (destinationCodes.has(diagnostic.code)) {
      if (typeof diagnostic.path !== 'string' || !diagnostic.path.startsWith('.github/')) {
        throw new Error(`${diagnostic.code} diagnostic requires a workspace-relative destination path`);
      }
      if (relatedPaths.some((relatedPath) => !relatedPath.startsWith('.github/'))) {
        throw new Error(`${diagnostic.code} diagnostic has a non-workspace related path`);
      }
      if (outputDestinations.has(diagnostic.path)) {
        throw new Error(`${diagnostic.code} diagnostic contradicts a legal output destination`);
      }
      if (
        diagnostic.code === 'destination-unplanned-entry'
        && outputs.some((output) => output.destination_path.startsWith(`${diagnostic.path}/`))
      ) {
        throw new Error('destination-unplanned-entry diagnostic contradicts legal outputs under its root');
      }
    }
  }
  return diagnostics;
}

/**
 * @param {unknown} batchesValue
 * @param {readonly any[]} entries
 * @param {Map<string, any>} entryByPath
 */
function validateAnalysisBatches(batchesValue, entries, entryByPath) {
  const batches = validateDenseArray(
    batchesValue,
    'directory analysis review_batches',
    MAX_REVIEW_BATCHES,
  );
  const expected = [];
  let expectedBatch = [];
  let expectedBytes = 0;
  for (const entry of entries) {
    if (
      entry.entry_type !== 'regular-file'
      || entry.content_class !== 'text'
      || entry.byte_count > REVIEW_LIMITS.max_utf8_bytes
    ) continue;
    if (
      expectedBatch.length >= REVIEW_LIMITS.max_files
      || expectedBytes + entry.byte_count > REVIEW_LIMITS.max_utf8_bytes
    ) {
      expected.push(expectedBatch);
      expectedBatch = [];
      expectedBytes = 0;
    }
    expectedBatch.push(entry.path);
    expectedBytes += entry.byte_count;
  }
  if (expectedBatch.length > 0) expected.push(expectedBatch);
  if (batches.length !== expected.length) {
    throw new Error('directory analysis review batches do not cover every eligible text file');
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = readExactRecord(
      batches[batchIndex],
      BATCH_FIELDS,
      `directory analysis review batch ${batchIndex}`,
    );
    const expectedId = `batch-${String(batchIndex + 1).padStart(3, '0')}`;
    if (batch.batch_id !== expectedId) {
      throw new Error(`directory analysis review batch ID must be ${expectedId}`);
    }
    const files = validateDenseArray(
      batch.files,
      `directory analysis review batch ${batchIndex} files`,
      REVIEW_LIMITS.max_files,
    );
    if (
      files.length === 0
      || files.length > REVIEW_LIMITS.max_files
      || files.length !== expected[batchIndex].length
    ) {
      throw new Error('directory analysis review batch has an invalid complete-file count');
    }
    let batchBytes = 0;
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = readExactRecord(
        files[fileIndex],
        BATCH_FILE_FIELDS,
        `directory analysis review batch ${batchIndex} file ${fileIndex}`,
      );
      if (file.path !== expected[batchIndex][fileIndex]) {
        throw new Error('directory analysis review batch files do not follow canonical greedy packing');
      }
      const entry = entryByPath.get(file.path);
      if (!entry || entry.entry_type !== 'regular-file' || entry.content_class !== 'text') {
        throw new Error(`directory analysis review batch path is not strict text: ${String(file.path)}`);
      }
      if (typeof file.content !== 'string') {
        throw new Error(`directory analysis review batch content must be a string: ${file.path}`);
      }
      if (file.content.length > entry.byte_count) {
        throw new Error(`directory analysis review batch content exceeds entry byte_count: ${file.path}`);
      }
      const content = validateString(
        file.content,
        `directory analysis review batch ${batchIndex} file ${fileIndex} content`,
      );
      const bytes = Buffer.from(content, 'utf8');
      if (bytes.includes(0)) {
        throw new Error(`directory analysis review batch contains NUL in strict text: ${file.path}`);
      }
      for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
        if (bytes[byteIndex] === 0x0d && bytes[byteIndex + 1] !== 0x0a) {
          throw new Error(`directory analysis review batch contains a bare CR: ${file.path}`);
        }
      }
      if (
        bytes.length !== entry.byte_count
        || sha256(bytes) !== entry.sha256
        || bytes.toString('utf8') !== content
      ) {
        throw new Error(`directory analysis review batch content does not match entry: ${file.path}`);
      }
      batchBytes += bytes.length;
    }
    if (batchBytes > REVIEW_LIMITS.max_utf8_bytes) {
      throw new Error('directory analysis review batch exceeds the fixed UTF-8 byte limit');
    }
  }
  return batches;
}

/**
 * Validate the shape, semantics, ordering, and hashes of one compact persisted
 * directory analysis. This does not authenticate facts whose source or output
 * bytes are intentionally omitted from the compact artifact.
 *
 * @param {unknown} value
 * @returns {true}
 */
export function validateDirectoryAnalysisStructure(value) {
  const analysis = readExactRecord(value, ANALYSIS_FIELDS, 'directory analysis');
  if (analysis.schema_version !== 1) throw new Error('directory analysis schema_version must be 1');
  if (analysis.kind !== 'dude-directory-import-analysis') {
    throw new Error('directory analysis kind is invalid');
  }
  validateSourceProvenance(analysis.source);
  const { entries, entryByPath } = validateAnalysisEntries(
    analysis.entries,
    analysis.manifest_sha256,
  );
  const groups = validateAnalysisGroups(analysis.groups, entryByPath);
  const outputs = validateAnalysisOutputs(analysis.outputs, entryByPath, groups);

  validateDenseArray(
    analysis.static_findings,
    'directory analysis static_findings',
    MAX_STATIC_FINDINGS,
  );
  validateDirectoryRiskFindings(analysis.static_findings);
  for (const finding of analysis.static_findings) {
    const entry = entryByPath.get(finding.path);
    if (!entry || entry.entry_type !== 'regular-file') {
      throw new Error(`directory analysis static finding references an unknown file: ${finding.path}`);
    }
    if (
      (entry.content_class === 'opaque' && finding.line_start !== null)
      || (entry.content_class === 'text' && finding.line_start === null)
    ) {
      throw new Error(`directory analysis static finding line data disagrees with content class: ${finding.path}`);
    }
  }
  for (const entry of entries) {
    if (
      entry.entry_type === 'regular-file'
      && entry.content_class === 'opaque'
      && !analysis.static_findings.some((finding) => finding.path === entry.path)
    ) {
      throw new Error(`directory analysis opaque file lacks static evidence: ${entry.path}`);
    }
  }

  const diagnostics = validateAnalysisDiagnostics(
    analysis.blocking_diagnostics,
    entryByPath,
    groups,
    outputs,
  );
  const expectedDecision = deriveStaticDecision(analysis.static_findings, diagnostics);
  if (analysis.static_decision !== expectedDecision) {
    throw new Error(`directory analysis static_decision must be ${expectedDecision}`);
  }
  validateAnalysisBatches(analysis.review_batches, entries, entryByPath);
  validateSha256(analysis.analysis_sha256, 'directory analysis analysis_sha256');
  const hashPayload = {};
  for (const field of ANALYSIS_FIELDS.slice(0, -1)) hashPayload[field] = analysis[field];
  if (canonicalSha256(hashPayload) !== analysis.analysis_sha256) {
    throw new Error('directory analysis analysis_sha256 does not match canonical content');
  }
  return true;
}

/**
 * Authoritatively validate a compact analysis against a freshly derived,
 * module-branded context that still binds the omitted bytes and destination
 * inspection facts.
 *
 * @param {unknown} value
 * @param {unknown} context
 * @returns {true}
 */
export function validateDirectoryAnalysis(value, context) {
  validateDirectoryAnalysisStructure(value);
  if (!context || typeof context !== 'object' || !DIRECTORY_ANALYSIS_CONTEXTS.has(context)) {
    throw new Error('authoritative directory analysis validation requires a freshly derived context');
  }
  if (!isDeepStrictEqual(value, context.analysis)) {
    throw new Error('directory analysis does not exactly match its freshly derived context');
  }
  return true;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {Set<string>|null} allowedIds
 */
function validateReviewedBatchIds(value, label, allowedIds) {
  const reviewedBatchIds = validateDenseArray(value, label, MAX_REVIEW_BATCHES);
  let previous = null;
  for (let index = 0; index < reviewedBatchIds.length; index += 1) {
    const batchId = validateString(reviewedBatchIds[index], `${label} ${index}`);
    const match = /^batch-([0-9]{3})$/.exec(batchId);
    const ordinal = match ? Number(match[1]) : 0;
    if (
      !match
      || ordinal < 1
      || ordinal > MAX_REVIEW_BATCHES
      || (allowedIds && !allowedIds.has(batchId))
    ) {
      throw new Error(`${label} contains an unknown batch ID: ${batchId}`);
    }
    if (previous !== null && compareRaw(previous, batchId) >= 0) {
      throw new Error(`${label} must be unique and raw-lexically sorted`);
    }
    previous = batchId;
  }
  return reviewedBatchIds;
}

/**
 * @param {unknown} value
 * @param {readonly string[]} reviewedBatchIds
 * @param {(batchId: string, sourcePath: string) => boolean} pathIsAllowed
 * @param {string} label
 */
function validateAdvisoryFindings(value, reviewedBatchIds, pathIsAllowed, label) {
  const findings = validateDenseArray(value, label);
  const reviewedIds = new Set(reviewedBatchIds);
  const identities = new Set();
  let previous = null;
  for (let index = 0; index < findings.length; index += 1) {
    const finding = readExactRecord(
      findings[index],
      REVIEW_FINDING_FIELDS,
      `${label} ${index}`,
    );
    const batchId = validateString(finding.batch_id, `${label} ${index} batch_id`);
    const sourcePath = validateCanonicalPath(finding.path, `${label} ${index} path`);
    const category = validateString(finding.category, `${label} ${index} category`);
    const severity = validateString(finding.severity, `${label} ${index} severity`);
    if (!reviewedIds.has(batchId)) {
      throw new Error(`${label} ${index} references an unreviewed batch`);
    }
    if (!pathIsAllowed(batchId, sourcePath)) {
      throw new Error(`${label} ${index} path is not in its exact reviewed batch`);
    }
    if (!REVIEW_CATEGORIES.has(category)) {
      throw new Error(`${label} ${index} has an invalid risk category`);
    }
    if (severity !== 'info' && severity !== 'warn') {
      throw new Error(`${label} ${index} severity must be info or warn`);
    }
    for (const field of ['evidence', 'explanation']) {
      const text = validateString(finding[field], `${label} ${index} ${field}`);
      if (text.length === 0) throw new Error(`${label} ${index} ${field} must not be empty`);
    }
    const identity = canonicalJson(REVIEW_FINDING_FIELDS.map((field) => finding[field]));
    if (identities.has(identity)) throw new Error(`${label} contains a duplicate complete tuple`);
    identities.add(identity);
    if (previous && compareReviewFindings(previous, finding) >= 0) {
      throw new Error(`${label} must be in strict canonical order`);
    }
    previous = finding;
  }
  return findings;
}

/**
 * Validate one exact optional review record against its bound analysis.
 * Literal null is handled only by the planner and is not a review record.
 *
 * @param {unknown} review
 * @param {unknown} analysisValue
 * @returns {true}
 */
export function validateDirectoryReview(review, analysisValue) {
  validateDirectoryAnalysisStructure(analysisValue);
  const analysis = /** @type {any} */ (analysisValue);
  const values = readExactRecord(review, REVIEW_FIELDS, 'directory review');
  validateDenseArray(
    values.reviewed_batch_ids,
    'directory review reviewed_batch_ids',
    MAX_REVIEW_BATCHES,
  );
  validateCanonicalJsonByteLength(
    values,
    'directory review',
    DIRECTORY_REVIEW_CANONICAL_JSON_MAX_BYTES,
  );
  if (values.schema_version !== 1) throw new Error('directory review schema_version must be 1');
  if (values.kind !== 'dude-directory-review') throw new Error('directory review kind is invalid');
  validateSha256(values.analysis_sha256, 'directory review analysis_sha256');
  if (values.analysis_sha256 !== analysis.analysis_sha256) {
    throw new Error('directory review analysis_sha256 is stale or does not match the analysis');
  }

  const batchById = new Map(analysis.review_batches.map((batch) => [batch.batch_id, batch]));
  const reviewedBatchIds = validateReviewedBatchIds(
    values.reviewed_batch_ids,
    'directory review reviewed_batch_ids',
    new Set(batchById.keys()),
  );
  validateAdvisoryFindings(
    values.findings,
    reviewedBatchIds,
    (batchId, sourcePath) => batchById.get(batchId)?.files.some((file) => (
      file.path === sourcePath
    )) === true,
    'directory review findings',
  );
  return true;
}

/** @param {unknown} value */
function validatePlanGroups(value) {
  const groups = validateDenseArray(value, 'directory plan groups', MAX_ANALYSIS_GROUPS);
  if (groups.length === 0) throw new Error('directory plan groups must not be empty');
  const roots = new Set();
  const validated = [];
  let previousEntrypoint = null;
  for (let index = 0; index < groups.length; index += 1) {
    const group = readExactRecord(groups[index], GROUP_FIELDS, `directory plan group ${index}`);
    if (group.kind !== 'agent' && group.kind !== 'skill') {
      throw new Error(`directory plan group ${index} has an invalid kind`);
    }
    const entrypoint = validateCanonicalPath(
      group.entrypoint,
      `directory plan group ${index} entrypoint`,
    );
    if (previousEntrypoint !== null && compareRaw(previousEntrypoint, entrypoint) >= 0) {
      throw new Error('directory plan groups must have unique entrypoints in canonical order');
    }
    previousEntrypoint = entrypoint;
    const basename = path.posix.basename(entrypoint);
    if (
      (group.kind === 'skill' && basename !== 'SKILL.md')
      || (group.kind === 'agent' && !basename.endsWith('.agent.md'))
    ) {
      throw new Error(`directory plan group kind does not match entrypoint: ${entrypoint}`);
    }
    if (group.kind === 'agent') normalizeAgentDest(basename);
    const root = parentPath(entrypoint);
    if (roots.has(root)) throw new Error(`directory plan groups repeat artifact root: ${root || '.'}`);
    roots.add(root);
    validated.push({ kind: group.kind, entrypoint, root });
  }
  return validated;
}

/** @param {unknown} value @param {readonly any[]} groups */
function validatePlanOutputs(value, groups) {
  const outputs = validateDenseArray(value, 'directory plan outputs', MAX_ANALYSIS_OUTPUTS);
  const destinationIndex = createComponentPrefixIndex();
  const foldedDestinationIndex = createComponentPrefixIndex();
  const sourceCounts = new Map();
  const skillDestinationRoots = new Map();
  const noticeDestinations = new Map();
  let previousDestination = null;

  for (let index = 0; index < outputs.length; index += 1) {
    const output = readExactRecord(outputs[index], OUTPUT_FIELDS, `directory plan output ${index}`);
    const sourcePath = validateCanonicalPath(
      output.source_path,
      `directory plan output ${index} source_path`,
    );
    const destinationPath = validateCanonicalPath(
      output.destination_path,
      `directory plan output ${index} destination_path`,
    );
    if (previousDestination !== null && compareRaw(previousDestination, destinationPath) >= 0) {
      throw new Error('directory plan outputs must have unique destinations in canonical order');
    }
    previousDestination = destinationPath;
    const destinationComponents = destinationPath.split('/');
    if (indexComponentPrefix(destinationIndex, destinationComponents, destinationPath) !== null) {
      throw new Error('directory plan outputs must not overlap lexically or by case');
    }
    const foldedDestination = destinationPath.toLowerCase();
    const foldedOwner = indexComponentPrefix(
      foldedDestinationIndex,
      destinationComponents.map((component) => component.toLowerCase()),
      destinationPath,
    );
    if (foldedOwner !== null) {
      if (foldedOwner.toLowerCase() === foldedDestination) {
        throw new Error('directory plan outputs must not have a case collision');
      }
      throw new Error('directory plan outputs must not overlap lexically or by case');
    }
    sourceCounts.set(sourcePath, (sourceCounts.get(sourcePath) ?? 0) + 1);

    validateSha256(output.output_sha256, `directory plan output ${index} output_sha256`);
    const transformIds = validateDenseArray(
      output.transform_ids,
      `directory plan output ${index} transform_ids`,
      1,
    );
    for (const transformId of transformIds) {
      if (typeof transformId !== 'string') {
        throw new TypeError(`directory plan output ${index} transform ID must be a string`);
      }
    }
    validateDestinationState(output.destination_state, `directory plan output ${index} destination_state`);

    const selectedRootNotice = isSelectedRootNotice(sourcePath);
    const group = selectedRootNotice ? null : owningAnalysisGroup(sourcePath, groups);
    const isSkillEntrypoint = group?.kind === 'skill' && sourcePath === group.entrypoint;
    if (isSkillEntrypoint) {
      if (!isDeepStrictEqual(transformIds, ['rewrite-skill-name'])) {
        throw new Error('directory plan skill entrypoint output must use only rewrite-skill-name');
      }
    } else if (transformIds.length !== 0) {
      throw new Error('only a directory plan skill entrypoint may carry rewrite-skill-name');
    }

    if (selectedRootNotice) {
      if (path.posix.basename(destinationPath) !== path.posix.basename(sourcePath)) {
        throw new Error(`directory plan shared notice does not preserve its basename: ${sourcePath}`);
      }
      const destinationsForNotice = noticeDestinations.get(sourcePath) ?? [];
      destinationsForNotice.push(destinationPath);
      noticeDestinations.set(sourcePath, destinationsForNotice);
      continue;
    }

    if (!group) throw new Error(`directory plan output source has no group owner: ${sourcePath}`);
    const relativePath = path.posix.relative(group.root || '.', sourcePath);
    if (group.kind === 'agent') {
      const agentFile = normalizeAgentDest(path.posix.basename(group.entrypoint));
      const expectedDestination = sourcePath === group.entrypoint
        ? `.github/agents/${agentFile}`
        : `.github/agents/${agentFile.replace(/\.agent\.md$/, '.support')}/${relativePath}`;
      if (destinationPath !== expectedDestination) {
        throw new Error(`directory plan agent output does not match fixed mapping: ${destinationPath}`);
      }
      continue;
    }

    const suffix = `/${relativePath}`;
    if (!destinationPath.endsWith(suffix)) {
      throw new Error(`directory plan skill output does not preserve its root-relative path: ${destinationPath}`);
    }
    const destinationRoot = destinationPath.slice(0, -suffix.length);
    if (!/^\.github\/skills\/dude-local-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationRoot)) {
      throw new Error(`directory plan skill output has an invalid destination: ${destinationPath}`);
    }
    const existingRoot = skillDestinationRoots.get(group.entrypoint);
    if (existingRoot !== undefined && existingRoot !== destinationRoot) {
      throw new Error(`directory plan skill outputs disagree on destination root: ${group.entrypoint}`);
    }
    skillDestinationRoots.set(group.entrypoint, destinationRoot);
  }

  for (const group of groups) {
    if (sourceCounts.get(group.entrypoint) !== 1) {
      throw new Error(`directory plan group entrypoint must have exactly one output: ${group.entrypoint}`);
    }
  }
  for (const [sourcePath, destinationsForNotice] of noticeDestinations) {
    const basename = path.posix.basename(sourcePath);
    const expectedDestinations = groups.map((group) => {
      if (group.kind === 'agent') {
        const agentFile = normalizeAgentDest(path.posix.basename(group.entrypoint));
        return `.github/agents/${agentFile.replace(/\.agent\.md$/, '.support')}/${basename}`;
      }
      const destinationRoot = skillDestinationRoots.get(group.entrypoint);
      if (destinationRoot === undefined) {
        throw new Error(`directory plan skill group lacks a destination root: ${group.entrypoint}`);
      }
      return `${destinationRoot}/${basename}`;
    }).sort(compareRaw);
    if (!isDeepStrictEqual(destinationsForNotice, expectedDestinations)) {
      throw new Error(`directory plan shared notice must map to every artifact group: ${sourcePath}`);
    }
  }
  for (const [sourcePath, count] of sourceCounts) {
    if (count > 1 && !isSelectedRootNotice(sourcePath)) {
      throw new Error(`directory plan output source is repeated: ${sourcePath}`);
    }
    if (count > groups.length) {
      throw new Error(`directory plan shared notice has too many outputs: ${sourcePath}`);
    }
  }
  return outputs;
}

/**
 * Validate the exact compact reviewed-plan structure and canonical digest.
 * Facts omitted from the plan remain subject to authoritative context validation.
 *
 * @param {unknown} value
 * @returns {true}
 */
export function validateDirectoryPlanStructure(value) {
  const plan = readExactRecord(value, PLAN_FIELDS, 'directory plan');
  validateDenseArray(plan.groups, 'directory plan groups', MAX_ANALYSIS_GROUPS);
  validateDenseArray(plan.outputs, 'directory plan outputs', MAX_ANALYSIS_OUTPUTS);
  validateDenseArray(
    plan.static_findings,
    'directory plan static_findings',
    MAX_STATIC_FINDINGS,
  );
  validateDenseArray(
    plan.reviewed_batch_ids,
    'directory plan reviewed_batch_ids',
    MAX_REVIEW_BATCHES,
  );
  validateDenseArray(
    plan.replace_paths,
    'directory plan replace_paths',
    MAX_ANALYSIS_OUTPUTS,
  );
  validateCanonicalJsonByteLength(
    plan,
    'directory plan',
    DIRECTORY_PLAN_CANONICAL_JSON_MAX_BYTES,
  );
  if (plan.schema_version !== 1) throw new Error('directory plan schema_version must be 1');
  if (plan.kind !== 'dude-directory-import-plan') throw new Error('directory plan kind is invalid');
  validateSha256(plan.analysis_sha256, 'directory plan analysis_sha256');
  validateSourceProvenance(plan.source);
  validateSha256(plan.manifest_sha256, 'directory plan manifest_sha256');
  const groups = validatePlanGroups(plan.groups);
  const outputs = validatePlanOutputs(plan.outputs, groups);
  const outputSources = new Set(outputs.map((output) => output.source_path));

  validateDenseArray(
    plan.static_findings,
    'directory plan static_findings',
    MAX_STATIC_FINDINGS,
  );
  validateDirectoryRiskFindings(plan.static_findings);
  for (const finding of plan.static_findings) {
    if (!outputSources.has(finding.path)) {
      throw new Error(`directory plan static finding references an unknown output source: ${finding.path}`);
    }
    if (finding.severity === 'block') {
      throw new Error('directory plan static_findings must not contain a blocking finding');
    }
  }

  const reviewedBatchIds = validateReviewedBatchIds(
    plan.reviewed_batch_ids,
    'directory plan reviewed_batch_ids',
    null,
  );
  const advisoryFindings = validateAdvisoryFindings(
    plan.advisory_findings,
    reviewedBatchIds,
    (_batchId, sourcePath) => outputSources.has(sourcePath),
    'directory plan advisory_findings',
  );
  if (plan.decision !== 'clean' && plan.decision !== 'warned') {
    throw new Error('directory plan decision must be clean or warned');
  }
  if (
    plan.decision === 'clean'
    && (
      plan.static_findings.some((finding) => finding.severity === 'warn')
      || advisoryFindings.some((finding) => finding.severity === 'warn')
    )
  ) {
    throw new Error('directory plan warnings cannot be downgraded to a clean decision');
  }

  const replacePaths = validateDenseArray(
    plan.replace_paths,
    'directory plan replace_paths',
    MAX_ANALYSIS_OUTPUTS,
  );
  let previousReplacePath = null;
  for (let index = 0; index < replacePaths.length; index += 1) {
    const replacePath = validateCanonicalPath(
      replacePaths[index],
      `directory plan replace_paths ${index}`,
    );
    if (previousReplacePath !== null && compareRaw(previousReplacePath, replacePath) >= 0) {
      throw new Error('directory plan replace_paths must be unique and sorted');
    }
    previousReplacePath = replacePath;
  }
  const expectedReplacePaths = outputs
    .filter((output) => output.destination_state.type === 'regular-file')
    .map((output) => output.destination_path);
  if (!isDeepStrictEqual(replacePaths, expectedReplacePaths)) {
    throw new Error('directory plan replace_paths must exactly match regular-file outputs');
  }

  validateSha256(plan.plan_sha256, 'directory plan plan_sha256');
  const hashPayload = {};
  for (const field of PLAN_FIELDS.slice(0, -1)) hashPayload[field] = plan[field];
  if (canonicalSha256(hashPayload) !== plan.plan_sha256) {
    throw new Error('directory plan plan_sha256 does not match canonical content');
  }
  return true;
}

/**
 * @param {any} analysis
 * @param {any|null} review
 * @param {any} context
 * @param {boolean} [reviewIsValidated]
 */
function planDirectoryArtifactsFromContext(analysis, review, context, reviewIsValidated = false) {
  validateDirectoryAnalysisStructure(analysis);
  const privateFacts = DIRECTORY_ANALYSIS_PRIVATE_FACTS.get(context);
  if (!privateFacts) {
    throw new Error('directory planning requires private facts from a freshly derived context');
  }
  if (analysis.static_decision !== 'blocked' && analysis.blocking_diagnostics.length === 0) {
    validateDirectoryPlanningOverlap(privateFacts);
  }
  validateDirectoryAnalysis(analysis, context);
  if (analysis.static_decision === 'blocked' || analysis.blocking_diagnostics.length > 0) {
    refuseDirectoryPlanning('analysis-blocked', null, []);
  }

  let reviewedBatchIds = [];
  let advisoryFindings = [];
  if (review !== null) {
    if (!reviewIsValidated) validateDirectoryReview(review, analysis);
    reviewedBatchIds = cloneData(review.reviewed_batch_ids);
    advisoryFindings = cloneData(review.findings);
  }

  const reviewedIds = new Set(reviewedBatchIds);
  const batchedPaths = new Set(analysis.review_batches.flatMap((batch) => (
    batch.files.map((file) => file.path)
  )));
  const warned = analysis.static_decision === 'warned'
    || advisoryFindings.some((finding) => finding.severity === 'warn')
    || analysis.review_batches.some((batch) => !reviewedIds.has(batch.batch_id))
    || analysis.entries.some((entry) => (
      entry.entry_type === 'regular-file' && !batchedPaths.has(entry.path)
    ));
  const planWithoutHash = {
    schema_version: 1,
    kind: 'dude-directory-import-plan',
    analysis_sha256: analysis.analysis_sha256,
    source: cloneData(analysis.source),
    manifest_sha256: analysis.manifest_sha256,
    groups: cloneData(analysis.groups),
    outputs: cloneData(analysis.outputs),
    static_findings: cloneData(analysis.static_findings),
    reviewed_batch_ids: reviewedBatchIds,
    advisory_findings: advisoryFindings,
    decision: warned ? 'warned' : 'clean',
    replace_paths: analysis.outputs
      .filter((output) => output.destination_state.type === 'regular-file')
      .map((output) => output.destination_path),
  };
  const plan = {
    ...planWithoutHash,
    plan_sha256: canonicalSha256(planWithoutHash),
  };
  validateDirectoryPlanStructure(plan);
  return deepFreeze(plan);
}

/**
 * Reacquire one source exactly once and build its read-only reviewed plan.
 * Review must be one exact record or literal null; undefined is not no-review.
 *
 * @param {unknown} analysis
 * @param {unknown} review
 * @param {any} sourceAnalysis
 * @param {string} workspaceRoot
 */
export async function planDirectoryArtifacts(analysis, review, sourceAnalysis, workspaceRoot) {
  const reviewIsValidated = review !== null;
  let reviewSnapshot = null;
  if (reviewIsValidated) {
    validateDirectoryReview(review, analysis);
    reviewSnapshot = deepFreeze(cloneData(review));
  }
  const context = await deriveDirectoryAnalysisContext(sourceAnalysis, workspaceRoot);
  return planDirectoryArtifactsFromContext(
    analysis,
    reviewSnapshot,
    context,
    reviewIsValidated,
  );
}

/**
 * Authoritatively validate a plan against one genuine freshly derived T005 context.
 *
 * @param {unknown} value
 * @param {unknown} freshContext
 * @returns {true}
 */
export function validateDirectoryPlan(value, freshContext) {
  validateDirectoryPlanStructure(value);
  validateDirectoryPlanAgainstContext(value, freshContext);
  return true;
}

/** @param {unknown} value @param {unknown} freshContext */
function validateDirectoryPlanAgainstContext(value, freshContext) {
  if (
    !freshContext
    || typeof freshContext !== 'object'
    || !DIRECTORY_ANALYSIS_CONTEXTS.has(freshContext)
  ) {
    throw new Error('authoritative directory plan validation requires a freshly derived context');
  }
  const plan = /** @type {any} */ (value);
  const context = /** @type {any} */ (freshContext);
  const privateFacts = DIRECTORY_ANALYSIS_PRIVATE_FACTS.get(context);
  if (!privateFacts) {
    throw new Error('authoritative directory plan validation requires private planning facts');
  }
  validateDirectoryPlanningOverlap(privateFacts);
  if (plan.analysis_sha256 !== context.analysis.analysis_sha256) {
    throw new Error('directory plan does not match its freshly derived analysis context');
  }
  const reconstructedReview = {
    schema_version: 1,
    kind: 'dude-directory-review',
    analysis_sha256: context.analysis.analysis_sha256,
    reviewed_batch_ids: cloneData(plan.reviewed_batch_ids),
    findings: cloneData(plan.advisory_findings),
  };
  const expected = planDirectoryArtifactsFromContext(
    context.analysis,
    reconstructedReview,
    context,
  );
  if (!isDeepStrictEqual(value, expected)) {
    throw new Error('directory plan does not exactly match its freshly derived context');
  }
  return true;
}

/** @param {any} plan */
function directoryPlanConfirmation(plan) {
  return plan.decision === 'clean'
    ? 'confirm-import'
    : `confirm-warned-import:${plan.plan_sha256}`;
}

/** @param {unknown} planValue */
export function renderDirectoryPlanConfirmation(planValue) {
  validateDirectoryPlanStructure(planValue);
  return directoryPlanConfirmation(/** @type {any} */ (planValue));
}

/**
 * Validate one reviewed plan and confirmation, then reacquire all deterministic
 * facts and select a read-only transaction boundary for T011.
 *
 * @param {unknown} planValue
 * @param {unknown} confirmation
 * @param {any} sourceAnalysis
 * @param {string} workspaceRoot
 */
export async function preflightDirectoryApply(
  planValue,
  confirmation,
  sourceAnalysis,
  workspaceRoot,
) {
  validateDirectoryPlanStructure(planValue);
  const plan = deepFreeze(cloneData(planValue));
  if (typeof confirmation !== 'string') {
    throw new TypeError('directory apply confirmation must be a primitive string');
  }
  const expectedConfirmation = directoryPlanConfirmation(plan);
  if (confirmation !== expectedConfirmation) {
    refuseDirectoryPlanning('confirmation-mismatch', null, plan.replace_paths);
  }

  if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
    throw new TypeError('workspace root must be a non-empty path string');
  }
  if (!sourceAnalysis || typeof sourceAnalysis.revalidate !== 'function') {
    throw new TypeError('directory source analysis must provide a revalidate function');
  }
  const revalidateSource = sourceAnalysis.revalidate.bind(sourceAnalysis);
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);
  const context = await deriveDirectoryAnalysisContext(sourceAnalysis, absoluteWorkspaceRoot);
  validateDirectoryPlanAgainstContext(plan, context);
  const privateFacts = DIRECTORY_ANALYSIS_PRIVATE_FACTS.get(context);
  if (!privateFacts) {
    throw new Error('directory apply preflight requires private facts from a freshly derived context');
  }
  const transaction = selectDirectoryTransactionParent(absoluteWorkspaceRoot, privateFacts);
  const token = deepFreeze({
    plan,
    transaction_parent: transaction.lexical_path,
  });
  DIRECTORY_APPLY_PREFLIGHTS.set(token, Object.freeze({
    context,
    plan,
    planning_facts: privateFacts,
    revalidate_source: revalidateSource,
    workspace_root: absoluteWorkspaceRoot,
    transaction,
  }));
  return token;
}

/** @param {fs.BigIntStats} stat @param {string} label */
function requireCurrentUid(stat, label) {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') return;
  if (stat.uid !== BigInt(process.getuid())) {
    throw new Error(`${label} is not owned by the current user`);
  }
}

/** @param {fs.BigIntStats} stat @param {number} mode @param {string} label */
function requirePermissionMode(stat, mode, label) {
  if (process.platform === 'win32') return;
  if ((stat.mode & 0o7777n) !== BigInt(mode)) {
    throw new Error(`${label} does not have mode ${mode.toString(8).padStart(4, '0')}`);
  }
}

/** @param {string} absoluteDirectory @param {string} expectedName */
function inspectExactChildName(absoluteDirectory, expectedName) {
  let exact = false;
  let caseAlias = false;
  visitDirectoryNames(absoluteDirectory, (name) => {
    if (name === expectedName) exact = true;
    else if (name.toLowerCase() === expectedName.toLowerCase()) caseAlias = true;
  });
  if (caseAlias) throw new Error(`directory path has a case-only alias for ${expectedName}`);
  return exact;
}

/** @param {string} workspaceRoot @param {string} absolutePath @param {string} label */
function workspaceRelativePath(workspaceRoot, absolutePath, label) {
  const relativePath = path.relative(path.resolve(workspaceRoot), path.resolve(absolutePath));
  if (
    relativePath.length === 0
    || path.isAbsolute(relativePath)
    || relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${label} must remain inside the workspace`);
  }
  return validateCanonicalPath(
    relativePath.split(path.sep).join('/'),
    `${label} workspace-relative path`,
  );
}

/**
 * @param {string} anchorPath
 * @param {readonly string[]} segments
 * @param {{mode: number, created: any[], workspace_root: string, label: string}} options
 */
function ensureDirectoryComponents(anchorPath, segments, options) {
  let cursor = anchorPath;
  const anchorStat = lstatOrNull(cursor);
  if (!anchorStat || !anchorStat.isDirectory() || anchorStat.isSymbolicLink()) {
    throw new Error(`${options.label} anchor is not a safe directory`);
  }
  for (const segment of segments) {
    const parentStat = lstatOrNull(cursor);
    if (!parentStat || !parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      throw new Error(`${options.label} parent changed before ${segment}`);
    }
    const exists = inspectExactChildName(cursor, segment);
    const childPath = path.join(cursor, segment);
    if (!exists) {
      const created = {
        absolute_path: childPath,
        identity_key: null,
        relative_path: workspaceRelativePath(options.workspace_root, childPath, options.label),
      };
      options.created.push(created);
      fs.mkdirSync(childPath, { mode: options.mode });
      if (!inspectExactChildName(cursor, segment)) {
        throw new Error(`${options.label} was not created with its exact name`);
      }
      let createdStat = lstatOrNull(childPath);
      if (!createdStat || !createdStat.isDirectory() || createdStat.isSymbolicLink()) {
        throw new Error(`${options.label} was not created as a safe directory`);
      }
      created.identity_key = fileIdentityKey(createdStat);
      requireCurrentUid(createdStat, options.label);
      if (process.platform !== 'win32') fs.chmodSync(childPath, options.mode);
      createdStat = lstatOrNull(childPath);
      if (
        !createdStat
        || !createdStat.isDirectory()
        || createdStat.isSymbolicLink()
        || fileIdentityKey(createdStat) !== created.identity_key
      ) {
        throw new Error(`${options.label} changed while setting permissions`);
      }
      requireCurrentUid(createdStat, options.label);
      requirePermissionMode(createdStat, options.mode, options.label);
    }
    const childStat = lstatOrNull(childPath);
    if (!childStat || !childStat.isDirectory() || childStat.isSymbolicLink()) {
      throw new Error(`${options.label} component is not a safe directory`);
    }
    cursor = childPath;
  }
  return cursor;
}

/** @param {string} absolutePath @param {string} label */
function securePrivateDirectory(absolutePath, label) {
  let stat = lstatOrNull(absolutePath);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} is not a safe directory`);
  }
  const identityKey = fileIdentityKey(stat);
  requireCurrentUid(stat, label);
  if (process.platform !== 'win32') fs.chmodSync(absolutePath, 0o700);
  stat = lstatOrNull(absolutePath);
  if (
    !stat
    || !stat.isDirectory()
    || stat.isSymbolicLink()
    || fileIdentityKey(stat) !== identityKey
  ) {
    throw new Error(`${label} changed while setting permissions`);
  }
  requireCurrentUid(stat, label);
  requirePermissionMode(stat, 0o700, label);
}

/**
 * @param {string} absolutePath
 * @param {string} label
 * @param {{owned?: boolean, mode?: number|null, identity_key?: string|null}} [requirements]
 * @param {(chunk: Buffer) => void} [onChunk]
 */
function streamStableRegularFile(absolutePath, label, requirements = {}, onChunk) {
  const initialStat = lstatOrNull(absolutePath);
  if (
    !initialStat
    || !initialStat.isFile()
    || initialStat.isSymbolicLink()
    || initialStat.nlink !== 1n
  ) {
    throw new Error(`${label} is not a safe single-link regular file`);
  }
  if (
    requirements.identity_key !== undefined
    && requirements.identity_key !== null
    && fileIdentityKey(initialStat) !== requirements.identity_key
  ) {
    throw new Error(`${label} identity changed before reading`);
  }
  const initialSnapshot = destinationStatSnapshot(initialStat);
  const flags = fs.constants.O_RDONLY
    | (fs.constants.O_NOFOLLOW ?? 0)
    | (fs.constants.O_NONBLOCK ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(absolutePath, flags);
  } catch (error) {
    throw new Error(`${label} could not be opened without following links`, { cause: error });
  }

  const hash = crypto.createHash('sha256');
  let openedStat;
  try {
    openedStat = fs.fstatSync(descriptor, { bigint: true });
    if (
      !openedStat.isFile()
      || openedStat.nlink !== 1n
      || !isDeepStrictEqual(destinationStatSnapshot(openedStat), initialSnapshot)
    ) {
      throw new Error(`${label} changed before reading`);
    }
    const chunk = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      const readChunk = chunk.subarray(0, bytesRead);
      hash.update(readChunk);
      onChunk?.(readChunk);
    }
    const finalOpenedStat = fs.fstatSync(descriptor, { bigint: true });
    if (
      !finalOpenedStat.isFile()
      || finalOpenedStat.nlink !== 1n
      || !isDeepStrictEqual(
        destinationStatSnapshot(finalOpenedStat),
        destinationStatSnapshot(openedStat),
      )
    ) {
      throw new Error(`${label} changed while reading`);
    }
  } finally {
    fs.closeSync(descriptor);
  }

  const finalPathStat = lstatOrNull(absolutePath);
  if (
    !finalPathStat
    || !finalPathStat.isFile()
    || finalPathStat.isSymbolicLink()
    || finalPathStat.nlink !== 1n
    || !isDeepStrictEqual(
      destinationStatSnapshot(finalPathStat),
      destinationStatSnapshot(openedStat),
    )
  ) {
    throw new Error(`${label} changed after reading`);
  }
  if (requirements.owned) requireCurrentUid(finalPathStat, label);
  if (requirements.mode !== undefined && requirements.mode !== null) {
    requirePermissionMode(finalPathStat, requirements.mode, label);
  }
  return {
    sha256: hash.digest('hex'),
    mode: Number(finalPathStat.mode & 0o7777n),
    identity_key: fileIdentityKey(finalPathStat),
  };
}

/**
 * @param {string} absolutePath
 * @param {string} label
 * @param {{owned?: boolean, mode?: number|null, identity_key?: string|null}} [requirements]
 */
function hashStableRegularFile(absolutePath, label, requirements = {}) {
  return streamStableRegularFile(absolutePath, label, requirements);
}

/**
 * @param {string} absolutePath
 * @param {string} label
 * @param {{owned?: boolean, mode?: number|null, identity_key?: string|null}} [requirements]
 */
function readStableRegularFile(absolutePath, label, requirements = {}) {
  const chunks = [];
  const observed = streamStableRegularFile(
    absolutePath,
    label,
    requirements,
    (chunk) => chunks.push(Buffer.from(chunk)),
  );
  return { bytes: Buffer.concat(chunks), ...observed };
}

/** @param {number} descriptor @param {Buffer} chunk @param {string} label */
function writeFileChunk(descriptor, chunk, label) {
  let offset = 0;
  while (offset < chunk.length) {
    const written = fs.writeSync(descriptor, chunk, offset, chunk.length - offset, null);
    if (written === 0) throw new Error(`${label} stopped before all bytes were written`);
    offset += written;
  }
}

/**
 * @param {string} sourcePath
 * @param {string} destinationPath
 * @param {{
 *   source_label: string,
 *   destination_label: string,
 *   source_owned?: boolean,
 *   source_mode?: number|null,
 *   source_identity_key: string,
 *   expected_sha256: string,
 *   destination_mode: number,
 *   tracked: {created: boolean, identity_key: string|null},
 * }} options
 */
function copyStableRegularFileToExclusive(sourcePath, destinationPath, options) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(destinationPath, flags, options.destination_mode);
  } catch (error) {
    throw new Error(`${options.destination_label} could not be created exclusively`, {
      cause: error,
    });
  }
  options.tracked.created = true;
  try {
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStat.isFile() || openedStat.nlink !== 1n) {
      throw new Error(`${options.destination_label} was not created as a safe regular file`);
    }
    options.tracked.identity_key = fileIdentityKey(openedStat);
    requireCurrentUid(openedStat, options.destination_label);
    const source = streamStableRegularFile(
      sourcePath,
      options.source_label,
      {
        owned: options.source_owned,
        mode: options.source_mode,
        identity_key: options.source_identity_key,
      },
      (chunk) => writeFileChunk(descriptor, chunk, options.destination_label),
    );
    if (source.sha256 !== options.expected_sha256) {
      throw new Error(`${options.source_label} hash changed while copying`);
    }
    if (process.platform !== 'win32') {
      fs.fchmodSync(descriptor, options.destination_mode);
    }
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const verified = hashStableRegularFile(
    destinationPath,
    options.destination_label,
    {
      owned: true,
      mode: options.destination_mode,
      identity_key: options.tracked.identity_key,
    },
  );
  if (verified.sha256 !== options.expected_sha256) {
    throw new Error(`${options.destination_label} does not match its expected hash`);
  }
  return verified;
}

/**
 * @param {string} absolutePath
 * @param {Buffer} bytes
 * @param {string} expectedSha256
 * @param {number} mode
 * @param {string} label
 * @param {{created: boolean, identity_key: string|null, on_created?: () => void}} tracked
 */
function writeExclusiveVerifiedFile(
  absolutePath,
  bytes,
  expectedSha256,
  mode,
  label,
  tracked,
) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(absolutePath, flags, mode);
    tracked.created = true;
    tracked.on_created?.();
  } catch (error) {
    throw new Error(`${label} could not be created exclusively`, { cause: error });
  }
  try {
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStat.isFile() || openedStat.nlink !== 1n) {
      throw new Error(`${label} was not created as a safe regular file`);
    }
    tracked.identity_key = fileIdentityKey(openedStat);
    requireCurrentUid(openedStat, label);
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (written === 0) throw new Error(`${label} stopped before all bytes were written`);
      offset += written;
    }
    if (process.platform !== 'win32') fs.fchmodSync(descriptor, mode);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const verified = readStableRegularFile(absolutePath, label, { owned: true, mode });
  if (
    tracked.identity_key !== verified.identity_key
    || verified.sha256 !== expectedSha256
    || !verified.bytes.equals(bytes)
  ) {
    throw new Error(`${label} does not match its expected bytes`);
  }
  return verified;
}

/** @param {unknown} cause */
function directoryFailureMessage(cause) {
  const messages = [];
  const seen = new Set();
  let current = cause;
  while (current !== undefined && current !== null && !seen.has(current)) {
    if ((typeof current === 'object' || typeof current === 'function')) seen.add(current);
    try {
      const message = current instanceof Error ? current.message : String(current);
      validatePairedUnicode(message, 'directory import failure message');
      if (message.trim().length > 0) messages.push(message);
    } catch {
      break;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.length === 0 ? 'unknown directory import failure' : messages.join(': ');
}

/** @param {readonly string[]} values */
function sortedUniquePaths(values) {
  return [...new Set(values)].sort(compareRaw);
}

/** @param {any} values */
function makeDirectoryImportResult(values) {
  const result = {
    schema_version: 1,
    kind: 'dude-directory-import-result',
    status: values.status,
    plan_sha256: values.plan_sha256,
    written_paths: sortedUniquePaths(values.written_paths),
    restored_paths: sortedUniquePaths(values.restored_paths),
    unchanged_paths: sortedUniquePaths(values.unchanged_paths),
    uncertain_paths: sortedUniquePaths(values.uncertain_paths),
    recovery_directory: values.recovery_directory,
    message: values.message,
  };
  validateDirectoryImportResult(result);
  return deepFreeze(result);
}

/**
 * Validate one exact directory-import apply result.
 *
 * @param {unknown} value
 * @returns {true}
 */
export function validateDirectoryImportResult(value) {
  const result = readExactRecord(value, RESULT_FIELDS, 'directory import result');
  if (result.schema_version !== 1) {
    throw new Error('directory import result schema_version must be 1');
  }
  if (result.kind !== 'dude-directory-import-result') {
    throw new Error('directory import result kind is invalid');
  }
  if (!['installed', 'rolled-back', 'recovery-failed'].includes(result.status)) {
    throw new Error('directory import result status is invalid');
  }
  validateSha256(result.plan_sha256, 'directory import result plan_sha256');

  const pathArrays = {};
  for (const field of [
    'written_paths',
    'restored_paths',
    'unchanged_paths',
    'uncertain_paths',
  ]) {
    const paths = validateDenseArray(result[field], `directory import result ${field}`);
    let previous = null;
    for (let index = 0; index < paths.length; index += 1) {
      const resultPath = validateCanonicalPath(
        paths[index],
        `directory import result ${field} ${index}`,
      );
      if (previous !== null && compareRaw(previous, resultPath) >= 0) {
        throw new Error(`directory import result ${field} must be unique and sorted`);
      }
      previous = resultPath;
    }
    pathArrays[field] = paths;
  }
  const classified = [
    ...pathArrays.written_paths,
    ...pathArrays.restored_paths,
    ...pathArrays.unchanged_paths,
    ...pathArrays.uncertain_paths,
  ];
  if (new Set(classified).size !== classified.length) {
    throw new Error('directory import result path classifications must not overlap');
  }

  if (result.recovery_directory !== null) {
    validateCanonicalPath(
      result.recovery_directory,
      'directory import result recovery_directory',
    );
  }
  const message = validateString(result.message, 'directory import result message');
  if (message.trim().length === 0) {
    throw new Error('directory import result message must not be empty');
  }

  if (result.status === 'installed') {
    if (
      pathArrays.written_paths.length === 0
      || pathArrays.restored_paths.length !== 0
      || pathArrays.unchanged_paths.length !== 0
      || pathArrays.uncertain_paths.length !== 0
      || result.recovery_directory !== null
      || message !== DIRECTORY_IMPORT_SUCCESS_MESSAGE
    ) {
      throw new Error('installed directory import result invariants are invalid');
    }
  } else if (result.status === 'rolled-back') {
    if (
      pathArrays.written_paths.length !== 0
      || pathArrays.uncertain_paths.length !== 0
      || pathArrays.restored_paths.length + pathArrays.unchanged_paths.length === 0
      || result.recovery_directory !== null
    ) {
      throw new Error('rolled-back directory import result invariants are invalid');
    }
  } else if (
    pathArrays.written_paths.length !== 0
    || pathArrays.uncertain_paths.length === 0
    || typeof result.recovery_directory !== 'string'
    || !pathArrays.uncertain_paths.includes(result.recovery_directory)
  ) {
    throw new Error('recovery-failed directory import result invariants are invalid');
  }
  return true;
}

/** @param {any} expected @param {any} observed */
function planningFactsMatch(expected, observed) {
  return isDeepStrictEqual(expected.source, observed.source)
    && isDeepStrictEqual(expected.outputs, observed.outputs);
}

/** @param {any} expected @param {any} observed */
function transactionFactsMatch(expected, observed) {
  return expected.relative_path === observed.relative_path
    && expected.lexical_path === observed.lexical_path
    && expected.canonical_path === observed.canonical_path
    && expected.anchor_device === observed.anchor_device
    && isDeepStrictEqual(expected.ancestor_projections, observed.ancestor_projections);
}

/**
 * @param {any} privatePreflight
 * @param {{require_original_transaction: boolean, expected_transaction?: any}} options
 */
function recaptureApplyPlanningFacts(privatePreflight, options) {
  const { context, plan, transaction, workspace_root: workspaceRoot } = privatePreflight;
  const planningFacts = {
    source: captureSourcePlanningFacts(context.analysis.source, context.analysis.entries),
    outputs: plan.outputs.map((output) => {
      const inspected = inspectDestination(workspaceRoot, output.destination_path);
      if (inspected.issue || !isDeepStrictEqual(inspected.state, output.destination_state)) {
        throw new Error(`directory destination changed before apply: ${output.destination_path}`);
      }
      return captureOutputPlanningFact(workspaceRoot, output.destination_path);
    }),
  };
  validateDirectoryPlanningOverlap(planningFacts);
  if (!planningFactsMatch(privatePreflight.planning_facts, planningFacts)) {
    throw new Error('directory source or output planning facts changed before apply');
  }

  const freshTransaction = captureTransactionParentFact(
    workspaceRoot,
    transaction.relative_path,
  );
  if (!freshTransaction) throw new Error('directory transaction parent is no longer safe');
  if (transactionParentOverlaps(freshTransaction, planningFacts)) {
    throw new Error('directory transaction parent overlaps the source or outputs');
  }
  const expectedTransaction = options.expected_transaction
    ?? (options.require_original_transaction ? transaction : null);
  if (expectedTransaction && !transactionFactsMatch(expectedTransaction, freshTransaction)) {
    throw new Error('directory transaction parent changed after apply preflight');
  }
  workspaceRelativePath(workspaceRoot, freshTransaction.lexical_path, 'transaction parent');
  return freshTransaction;
}

/** @param {string} workspaceRoot @param {any} output */
function captureDestinationPrestate(workspaceRoot, output) {
  const inspected = inspectDestination(workspaceRoot, output.destination_path);
  if (inspected.issue || !inspected.state) {
    throw new Error(`destination is unsafe before apply: ${output.destination_path}`);
  }
  if (!isDeepStrictEqual(inspected.state, output.destination_state)) {
    throw new Error(`destination changed before apply: ${output.destination_path}`);
  }
  if (inspected.state.type === 'missing') return { type: 'missing' };
  const absolutePath = resolveMutationPath(workspaceRoot, output.destination_path);
  const file = hashStableRegularFile(absolutePath, `destination ${output.destination_path}`);
  if (file.sha256 !== output.destination_state.sha256) {
    throw new Error(`destination hash changed before apply: ${output.destination_path}`);
  }
  return {
    type: 'regular-file',
    sha256: file.sha256,
    mode: file.mode,
    identity_key: file.identity_key,
  };
}

/**
 * @param {string} workspaceRoot
 * @param {any} record
 * @param {{compare_mode?: boolean, compare_identity?: boolean}} [options]
 */
function verifyDestinationPrestate(workspaceRoot, record, options = {}) {
  try {
    const expectedState = record.prestate.type === 'missing'
      ? { type: 'missing' }
      : { type: 'regular-file', sha256: record.prestate.sha256 };
    const observed = captureDestinationPrestate(workspaceRoot, {
      destination_path: record.output.destination_path,
      destination_state: expectedState,
    });
    if (record.prestate.type !== observed.type) return false;
    if (record.prestate.type === 'missing') return true;
    if (observed.sha256 !== record.prestate.sha256) {
      return false;
    }
    if (
      options.compare_identity !== false
      && observed.identity_key !== record.prestate.identity_key
    ) {
      return false;
    }
    return options.compare_mode === false
      || process.platform === 'win32'
      || record.prestate.mode === null
      || observed.mode === record.prestate.mode;
  } catch {
    return false;
  }
}

/**
 * @param {any} transactionState
 * @param {'staged'|'backups'} tree
 * @param {string} destinationPath
 * @param {Buffer} bytes
 * @param {string} expectedSha256
 */
function writePrivateMirroredFile(
  transactionState,
  tree,
  destinationPath,
  bytes,
  expectedSha256,
) {
  const rootPath = transactionState[`${tree}_root`];
  const segments = destinationPath.split('/');
  const parent = ensureDirectoryComponents(rootPath, segments.slice(0, -1), {
    mode: 0o700,
    created: transactionState.transaction_directories,
    workspace_root: transactionState.workspace_root,
    label: `${tree} directory`,
  });
  const basename = segments.at(-1);
  if (inspectExactChildName(parent, basename)) {
    throw new Error(`${tree} path already exists: ${destinationPath}`);
  }
  const absolutePath = path.join(parent, basename);
  const file = {
    absolute_path: absolutePath,
    destination_path: destinationPath,
    identity_key: null,
    sha256: expectedSha256,
    created: false,
  };
  transactionState.transaction_files.push(file);
  const verified = writeExclusiveVerifiedFile(
    absolutePath,
    bytes,
    expectedSha256,
    0o600,
    `${tree} file ${destinationPath}`,
    file,
  );
  file.identity_key ??= verified.identity_key;
  return file;
}

/** @param {any} transactionState @param {any} record */
function streamPrivateMirroredBackup(transactionState, record) {
  const destinationPath = record.output.destination_path;
  const segments = destinationPath.split('/');
  const parent = ensureDirectoryComponents(
    transactionState.backups_root,
    segments.slice(0, -1),
    {
      mode: 0o700,
      created: transactionState.transaction_directories,
      workspace_root: transactionState.workspace_root,
      label: 'backups directory',
    },
  );
  const basename = segments.at(-1);
  if (inspectExactChildName(parent, basename)) {
    throw new Error(`backups path already exists: ${destinationPath}`);
  }
  const absolutePath = path.join(parent, basename);
  const backup = {
    absolute_path: absolutePath,
    destination_path: destinationPath,
    identity_key: null,
    sha256: record.prestate.sha256,
    created: false,
  };
  transactionState.transaction_files.push(backup);
  const sourcePath = resolveMutationPath(transactionState.workspace_root, destinationPath);
  const verified = copyStableRegularFileToExclusive(sourcePath, absolutePath, {
    source_label: `backup source ${destinationPath}`,
    destination_label: `backups file ${destinationPath}`,
    source_mode: process.platform === 'win32' ? null : record.prestate.mode,
    source_identity_key: record.prestate.identity_key,
    expected_sha256: record.prestate.sha256,
    destination_mode: 0o600,
    tracked: backup,
  });
  backup.identity_key ??= verified.identity_key;
  return backup;
}

/** @param {any} transactionState */
function verifyTransactionPrivacy(transactionState) {
  const nonceStat = lstatOrNull(transactionState.nonce_path);
  if (
    !nonceStat
    || !nonceStat.isDirectory()
    || nonceStat.isSymbolicLink()
    || fileIdentityKey(nonceStat) !== transactionState.nonce_identity_key
  ) {
    throw new Error('directory transaction nonce changed');
  }
  requireCurrentUid(nonceStat, 'directory transaction nonce');
  requirePermissionMode(nonceStat, 0o700, 'directory transaction nonce');
  const canonicalNonce = fs.realpathSync(transactionState.nonce_path);
  const canonicalParent = fs.realpathSync(transactionState.parent_path);
  const relativeNonce = path.relative(canonicalParent, canonicalNonce);
  if (
    relativeNonce.length === 0
    || path.isAbsolute(relativeNonce)
    || relativeNonce === '..'
    || relativeNonce.startsWith(`..${path.sep}`)
  ) {
    throw new Error('directory transaction nonce escaped its selected parent');
  }

  for (const directory of transactionState.transaction_directories) {
    const stat = lstatOrNull(directory.absolute_path);
    if (
      !stat
      || !stat.isDirectory()
      || stat.isSymbolicLink()
      || directory.identity_key === null
      || fileIdentityKey(stat) !== directory.identity_key
    ) {
      throw new Error(`directory transaction directory changed: ${directory.relative_path}`);
    }
    requireCurrentUid(stat, `directory transaction directory ${directory.relative_path}`);
    requirePermissionMode(stat, 0o700, `directory transaction directory ${directory.relative_path}`);
  }
  for (const file of transactionState.transaction_files) {
    if (!file.created || file.identity_key === null) {
      throw new Error(`directory transaction file was not safely created: ${file.destination_path}`);
    }
    const verified = hashStableRegularFile(
      file.absolute_path,
      `directory transaction file ${file.destination_path}`,
      { owned: true, mode: 0o600 },
    );
    if (verified.identity_key !== file.identity_key || verified.sha256 !== file.sha256) {
      throw new Error(`directory transaction file changed: ${file.destination_path}`);
    }
  }
}

/** @param {any} transactionState @param {any} output */
function readStagedOutput(transactionState, output) {
  const staged = transactionState.staged_by_destination.get(output.destination_path);
  if (!staged) throw new Error(`missing staged output: ${output.destination_path}`);
  const verified = readStableRegularFile(
    staged.absolute_path,
    `staged output ${output.destination_path}`,
    { owned: true, mode: 0o600 },
  );
  if (verified.identity_key !== staged.identity_key || verified.sha256 !== output.output_sha256) {
    throw new Error(`staged output changed: ${output.destination_path}`);
  }
  return verified.bytes;
}

/** @param {string} absoluteParent @param {string} basename */
function siblingTemporaryPath(absoluteParent, basename) {
  return path.join(
    absoluteParent,
    `.${basename}.dude-import-${crypto.randomBytes(12).toString('hex')}.tmp`,
  );
}

/**
 * @param {any} transactionState
 * @param {any} record
 * @param {Buffer} bytes
 * @param {string} expectedSha256
 * @param {number} mode
 * @param {string} purpose
 */
function writeSiblingTemporary(
  transactionState,
  record,
  bytes,
  expectedSha256,
  mode,
  purpose,
) {
  const absoluteDestination = resolveMutationPath(
    transactionState.workspace_root,
    record.output.destination_path,
  );
  const absoluteParent = path.dirname(absoluteDestination);
  const temporaryPath = siblingTemporaryPath(
    absoluteParent,
    path.basename(absoluteDestination),
  );
  const temporary = {
    absolute_path: temporaryPath,
    relative_path: workspaceRelativePath(
      transactionState.workspace_root,
      temporaryPath,
      `${purpose} temporary`,
    ),
    identity_key: null,
    created: false,
    renamed: false,
  };
  transactionState.sibling_temporaries.push(temporary);
  const verified = writeExclusiveVerifiedFile(
    temporaryPath,
    bytes,
    expectedSha256,
    mode,
    `${purpose} temporary ${record.output.destination_path}`,
    temporary,
  );
  temporary.identity_key ??= verified.identity_key;
  return temporary;
}

/** @param {any} transactionState @param {any} record @param {any} backup */
function streamRollbackSiblingTemporary(transactionState, record, backup) {
  const absoluteDestination = resolveMutationPath(
    transactionState.workspace_root,
    record.output.destination_path,
  );
  const absoluteParent = path.dirname(absoluteDestination);
  const temporaryPath = siblingTemporaryPath(
    absoluteParent,
    path.basename(absoluteDestination),
  );
  const temporary = {
    absolute_path: temporaryPath,
    relative_path: workspaceRelativePath(
      transactionState.workspace_root,
      temporaryPath,
      'rollback temporary',
    ),
    identity_key: null,
    created: false,
    renamed: false,
    mode: process.platform === 'win32' ? 0o600 : record.prestate.mode,
  };
  transactionState.sibling_temporaries.push(temporary);
  const verified = copyStableRegularFileToExclusive(
    backup.absolute_path,
    temporaryPath,
    {
      source_label: `rollback backup ${record.output.destination_path}`,
      destination_label: `rollback temporary ${record.output.destination_path}`,
      source_owned: true,
      source_mode: 0o600,
      source_identity_key: backup.identity_key,
      expected_sha256: record.prestate.sha256,
      destination_mode: temporary.mode,
      tracked: temporary,
    },
  );
  temporary.identity_key ??= verified.identity_key;
  return temporary;
}

/** @param {any} temporary */
function removeSiblingTemporary(temporary) {
  if (temporary.renamed) return true;
  const stat = lstatOrNull(temporary.absolute_path);
  if (!stat) return true;
  if (
    !temporary.created
    || temporary.identity_key === null
    || !stat.isFile()
    || stat.isSymbolicLink()
    || stat.nlink !== 1n
    || fileIdentityKey(stat) !== temporary.identity_key
  ) {
    return false;
  }
  try {
    fs.unlinkSync(temporary.absolute_path);
  } catch {
    return lstatOrNull(temporary.absolute_path) === null;
  }
  return lstatOrNull(temporary.absolute_path) === null;
}

/** @param {any} transactionState @param {any} record @param {Buffer} bytes */
function installDirectoryOutput(transactionState, record, bytes) {
  const segments = record.output.destination_path.split('/');
  const parent = ensureDirectoryComponents(
    transactionState.workspace_root,
    segments.slice(0, -1),
    {
      mode: 0o755,
      created: transactionState.destination_directories,
      workspace_root: transactionState.workspace_root,
      label: `destination parent for ${record.output.destination_path}`,
    },
  );
  const basename = segments.at(-1);
  const absoluteDestination = path.join(parent, basename);
  if (record.prestate.type === 'missing') {
    if (inspectExactChildName(parent, basename)) {
      throw new Error(`missing destination appeared before create: ${record.output.destination_path}`);
    }
    const tracked = {
      created: false,
      identity_key: null,
      mode: 0o600,
      on_created: () => {
        record.destination_mutated = true;
      },
    };
    record.installed_file = tracked;
    writeExclusiveVerifiedFile(
      absoluteDestination,
      bytes,
      record.output.output_sha256,
      tracked.mode,
      `new destination ${record.output.destination_path}`,
      tracked,
    );
    return;
  }

  const mode = process.platform === 'win32' ? 0o600 : record.prestate.mode;
  const temporary = writeSiblingTemporary(
    transactionState,
    record,
    bytes,
    record.output.output_sha256,
    mode,
    'replacement',
  );
  temporary.mode = mode;
  record.installed_file = temporary;
  if (!verifyDestinationPrestate(transactionState.workspace_root, record)) {
    throw new Error(`replacement destination changed before rename: ${record.output.destination_path}`);
  }
  fs.renameSync(temporary.absolute_path, absoluteDestination);
  temporary.renamed = true;
  record.destination_mutated = true;
}

/** @param {string} workspaceRoot @param {any} record */
function verifyInstalledDirectoryOutput(workspaceRoot, record) {
  try {
    const inspected = inspectDestination(workspaceRoot, record.output.destination_path);
    if (
      inspected.issue
      || inspected.state?.type !== 'regular-file'
      || inspected.state.sha256 !== record.output.output_sha256
    ) {
      return false;
    }
    const absolutePath = resolveMutationPath(workspaceRoot, record.output.destination_path);
    const verified = readStableRegularFile(
      absolutePath,
      `installed output ${record.output.destination_path}`,
    );
    if (verified.sha256 !== record.output.output_sha256) return false;
    if (
      record.prestate.type === 'regular-file'
      && process.platform !== 'win32'
      && verified.mode !== record.prestate.mode
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** @param {any} transactionState @param {any} record */
function rollbackCreatedDestination(transactionState, record) {
  const absolutePath = resolveMutationPath(
    transactionState.workspace_root,
    record.output.destination_path,
  );
  if (!lstatOrNull(absolutePath)) return true;
  if (!record.installed_file?.created || record.installed_file.identity_key === null) {
    return false;
  }
  let current;
  try {
    current = readStableRegularFile(
      absolutePath,
      `rollback created output ${record.output.destination_path}`,
      {
        mode: process.platform === 'win32' ? null : record.installed_file.mode,
        identity_key: record.installed_file.identity_key,
      },
    );
  } catch {
    return false;
  }
  if (
    current.identity_key !== record.installed_file.identity_key
    || current.sha256 !== record.output.output_sha256
    || (
      process.platform !== 'win32'
      && current.mode !== record.installed_file.mode
    )
  ) return false;
  try {
    fs.unlinkSync(absolutePath);
  } catch {
    return lstatOrNull(absolutePath) === null;
  }
  return lstatOrNull(absolutePath) === null;
}

/** @param {any} transactionState @param {any} record */
function rollbackReplacedDestination(transactionState, record) {
  const destinationPath = record.output.destination_path;
  if (verifyDestinationPrestate(transactionState.workspace_root, record)) return true;
  const backup = transactionState.backup_by_destination.get(destinationPath);
  if (!backup || record.prestate.type !== 'regular-file') return false;
  try {
    const verifiedBackup = hashStableRegularFile(
      backup.absolute_path,
      `rollback backup ${destinationPath}`,
      { owned: true, mode: 0o600, identity_key: backup.identity_key },
    );
    if (
      verifiedBackup.identity_key !== backup.identity_key
      || verifiedBackup.sha256 !== record.prestate.sha256
    ) {
      return false;
    }
  } catch {
    return false;
  }

  const absoluteDestination = resolveMutationPath(
    transactionState.workspace_root,
    destinationPath,
  );
  let current;
  try {
    current = readStableRegularFile(absoluteDestination, `rollback target ${destinationPath}`);
  } catch {
    return false;
  }
  if (
    !record.installed_file?.created
    || record.installed_file.identity_key === null
    || current.identity_key !== record.installed_file.identity_key
    || current.sha256 !== record.output.output_sha256
    || (
      process.platform !== 'win32'
      && current.mode !== record.installed_file.mode
    )
  ) {
    return false;
  }

  const temporary = streamRollbackSiblingTemporary(transactionState, record, backup);
  try {
    const rechecked = readStableRegularFile(
      absoluteDestination,
      `rollback target ${destinationPath}`,
    );
    if (
      rechecked.identity_key !== record.installed_file.identity_key
      || rechecked.sha256 !== record.output.output_sha256
      || (
        process.platform !== 'win32'
        && rechecked.mode !== record.installed_file.mode
      )
    ) {
      return false;
    }
    fs.renameSync(temporary.absolute_path, absoluteDestination);
    temporary.renamed = true;
  } catch {
    return verifyDestinationPrestate(
      transactionState.workspace_root,
      record,
      { compare_identity: false },
    );
  }
  return verifyDestinationPrestate(
    transactionState.workspace_root,
    record,
    { compare_identity: false },
  );
}

/** @param {any} directory */
function removeCreatedDestinationDirectory(directory) {
  const stat = lstatOrNull(directory.absolute_path);
  if (!stat) return true;
  if (
    directory.identity_key === null
    || !stat.isDirectory()
    || stat.isSymbolicLink()
    || fileIdentityKey(stat) !== directory.identity_key
  ) {
    return false;
  }
  try {
    fs.rmdirSync(directory.absolute_path);
  } catch {
    return lstatOrNull(directory.absolute_path) === null;
  }
  return lstatOrNull(directory.absolute_path) === null;
}

/** @param {string} absolutePath */
function pathPresence(absolutePath) {
  try {
    return lstatOrNull(absolutePath) === null ? 'missing' : 'present';
  } catch {
    return 'uncertain';
  }
}

/** @param {any} transactionState */
function removeDirectoryTransaction(transactionState) {
  for (const file of [...transactionState.transaction_files].reverse()) {
    const stat = lstatOrNull(file.absolute_path);
    if (!stat) continue;
    if (
      !file.created
      || file.identity_key === null
      || !stat.isFile()
      || stat.isSymbolicLink()
      || stat.nlink !== 1n
      || fileIdentityKey(stat) !== file.identity_key
    ) {
      throw new Error(`transaction file cannot be safely removed: ${file.destination_path}`);
    }
    fs.unlinkSync(file.absolute_path);
    if (lstatOrNull(file.absolute_path)) {
      throw new Error(`transaction file remains after removal: ${file.destination_path}`);
    }
  }
  const directories = [...transactionState.transaction_directories].sort((left, right) => (
    right.absolute_path.split(path.sep).length - left.absolute_path.split(path.sep).length
      || compareRaw(right.absolute_path, left.absolute_path)
  ));
  for (const directory of directories) {
    const stat = lstatOrNull(directory.absolute_path);
    if (!stat) continue;
    if (
      directory.identity_key === null
      || !stat.isDirectory()
      || stat.isSymbolicLink()
      || fileIdentityKey(stat) !== directory.identity_key
    ) {
      throw new Error(`transaction directory cannot be safely removed: ${directory.relative_path}`);
    }
    fs.rmdirSync(directory.absolute_path);
    if (lstatOrNull(directory.absolute_path)) {
      throw new Error(`transaction directory remains after removal: ${directory.relative_path}`);
    }
  }
  const nonceStat = lstatOrNull(transactionState.nonce_path);
  if (nonceStat) {
    if (
      !nonceStat.isDirectory()
      || nonceStat.isSymbolicLink()
      || fileIdentityKey(nonceStat) !== transactionState.nonce_identity_key
    ) {
      throw new Error('transaction nonce cannot be safely removed');
    }
    fs.rmdirSync(transactionState.nonce_path);
  }
  if (lstatOrNull(transactionState.nonce_path)) {
    throw new Error('transaction nonce remains after removal');
  }
}

/** @param {any} privatePreflight @param {any} transactionState @param {unknown} cause */
function rollbackDirectoryImport(privatePreflight, transactionState, cause) {
  for (const record of [...transactionState.records].reverse()) {
    if (!record.destination_mutated) continue;
    try {
      if (record.prestate.type === 'missing') {
        rollbackCreatedDestination(transactionState, record);
      } else {
        rollbackReplacedDestination(transactionState, record);
      }
    } catch {
      // Exact post-rollback inspection below owns the result classification.
    }
  }

  for (const temporary of transactionState.sibling_temporaries) {
    try {
      removeSiblingTemporary(temporary);
    } catch {
      // Final presence inspection below owns the result classification.
    }
  }
  const destinationDirectories = [...transactionState.destination_directories].sort(
    (left, right) => (
      right.absolute_path.split(path.sep).length - left.absolute_path.split(path.sep).length
        || compareRaw(right.absolute_path, left.absolute_path)
    ),
  );
  for (const directory of destinationDirectories) {
    try {
      removeCreatedDestinationDirectory(directory);
    } catch {
      // Final presence inspection below owns the result classification.
    }
  }

  const restoredPaths = [];
  const unchangedPaths = [];
  const uncertainPaths = [];
  for (const record of transactionState.records) {
    const restored = verifyDestinationPrestate(
      transactionState.workspace_root,
      record,
      { compare_identity: !record.destination_mutated },
    );
    if (!restored) {
      uncertainPaths.push(record.output.destination_path);
    } else if (record.destination_mutated) {
      restoredPaths.push(record.output.destination_path);
    } else {
      unchangedPaths.push(record.output.destination_path);
    }
  }
  for (const temporary of transactionState.sibling_temporaries) {
    if (!temporary.renamed && pathPresence(temporary.absolute_path) !== 'missing') {
      uncertainPaths.push(temporary.relative_path);
    }
  }
  for (const directory of transactionState.destination_directories) {
    if (pathPresence(directory.absolute_path) !== 'missing') {
      uncertainPaths.push(directory.relative_path);
    }
  }

  let transactionRemoved = false;
  if (uncertainPaths.length === 0) {
    try {
      removeDirectoryTransaction(transactionState);
      transactionRemoved = true;
    } catch {
      transactionRemoved = pathPresence(transactionState.nonce_path) === 'missing';
    }
  }
  if (uncertainPaths.length === 0 && transactionRemoved) {
    return makeDirectoryImportResult({
      status: 'rolled-back',
      plan_sha256: privatePreflight.plan.plan_sha256,
      written_paths: [],
      restored_paths: restoredPaths,
      unchanged_paths: unchangedPaths,
      uncertain_paths: [],
      recovery_directory: null,
      message: `Directory import failed and was rolled back: ${directoryFailureMessage(cause)}`,
    });
  }

  uncertainPaths.push(transactionState.nonce_relative_path);
  return makeDirectoryImportResult({
    status: 'recovery-failed',
    plan_sha256: privatePreflight.plan.plan_sha256,
    written_paths: [],
    restored_paths: restoredPaths,
    unchanged_paths: unchangedPaths,
    uncertain_paths: uncertainPaths,
    recovery_directory: transactionState.nonce_relative_path,
    message: `Directory import failed and recovery is incomplete: ${directoryFailureMessage(cause)}`,
  });
}

/** @param {any[]} directories */
function removePreNonceDirectories(directories) {
  for (const directory of [...directories].reverse()) {
    removeCreatedDestinationDirectory(directory);
  }
}

/**
 * Consume one genuine preflight token and apply its exact reviewed outputs.
 *
 * @param {unknown} preflight
 */
export async function applyDirectoryPreflight(preflight) {
  const privatePreflight = preflight && typeof preflight === 'object'
    ? DIRECTORY_APPLY_PREFLIGHTS.get(preflight)
    : undefined;
  if (preflight && typeof preflight === 'object') {
    DIRECTORY_APPLY_PREFLIGHTS.delete(preflight);
  }
  if (!privatePreflight) {
    throw new Error('directory apply requires one genuine unconsumed preflight token');
  }

  recaptureApplyPlanningFacts(privatePreflight, { require_original_transaction: true });
  const workspaceRoot = privatePreflight.workspace_root;
  const parentDirectories = [];
  let transactionParent;
  let createdTransactionFact;
  try {
    transactionParent = ensureDirectoryComponents(
      workspaceRoot,
      privatePreflight.transaction.relative_path.split('/'),
      {
        mode: 0o700,
        created: parentDirectories,
        workspace_root: workspaceRoot,
        label: 'transaction parent',
      },
    );
    securePrivateDirectory(transactionParent, 'transaction parent');
    createdTransactionFact = recaptureApplyPlanningFacts(
      privatePreflight,
      { require_original_transaction: false },
    );
    if (createdTransactionFact.lexical_path !== transactionParent) {
      throw new Error('created transaction parent does not match apply preflight');
    }
  } catch (error) {
    removePreNonceDirectories(parentDirectories);
    throw error;
  }

  let noncePath;
  try {
    noncePath = fs.mkdtempSync(path.join(transactionParent, 'directory-import-'));
  } catch (error) {
    removePreNonceDirectories(parentDirectories);
    throw error;
  }
  const transactionState = {
    workspace_root: workspaceRoot,
    parent_path: transactionParent,
    nonce_path: noncePath,
    nonce_identity_key: null,
    nonce_relative_path: workspaceRelativePath(workspaceRoot, noncePath, 'transaction nonce'),
    staged_root: '',
    backups_root: '',
    transaction_directories: [],
    transaction_files: [],
    staged_by_destination: new Map(),
    backup_by_destination: new Map(),
    sibling_temporaries: [],
    destination_directories: [],
    records: privatePreflight.plan.outputs.map((output) => ({
      output,
      prestate: output.destination_state.type === 'missing'
        ? { type: 'missing' }
        : {
          type: 'regular-file',
          sha256: output.destination_state.sha256,
          mode: null,
          identity_key: null,
        },
      destination_mutated: false,
      installed_file: null,
    })),
  };

  try {
    let nonceStat = lstatOrNull(noncePath);
    if (
      !inspectExactChildName(transactionParent, path.basename(noncePath))
      || !nonceStat
      || !nonceStat.isDirectory()
      || nonceStat.isSymbolicLink()
    ) {
      throw new Error('directory transaction nonce was not created as a safe directory');
    }
    transactionState.nonce_identity_key = fileIdentityKey(nonceStat);
    requireCurrentUid(nonceStat, 'directory transaction nonce');
    if (process.platform !== 'win32') fs.chmodSync(noncePath, 0o700);
    nonceStat = lstatOrNull(noncePath);
    if (
      !nonceStat
      || !nonceStat.isDirectory()
      || nonceStat.isSymbolicLink()
      || fileIdentityKey(nonceStat) !== transactionState.nonce_identity_key
    ) {
      throw new Error('directory transaction nonce changed while setting permissions');
    }
    requireCurrentUid(nonceStat, 'directory transaction nonce');
    requirePermissionMode(nonceStat, 0o700, 'directory transaction nonce');
    const postNonceTransactionFact = captureTransactionParentFact(
      workspaceRoot,
      privatePreflight.transaction.relative_path,
    );
    if (
      !postNonceTransactionFact
      || !transactionFactsMatch(createdTransactionFact, postNonceTransactionFact)
    ) {
      throw new Error('directory transaction parent changed during nonce creation');
    }
    verifyTransactionPrivacy(transactionState);

    transactionState.staged_root = ensureDirectoryComponents(noncePath, ['staged'], {
      mode: 0o700,
      created: transactionState.transaction_directories,
      workspace_root: workspaceRoot,
      label: 'staged root',
    });
    transactionState.backups_root = ensureDirectoryComponents(noncePath, ['backups'], {
      mode: 0o700,
      created: transactionState.transaction_directories,
      workspace_root: workspaceRoot,
      label: 'backups root',
    });

    for (const record of transactionState.records) {
      record.prestate = captureDestinationPrestate(workspaceRoot, record.output);
    }
    for (const record of transactionState.records) {
      const outputBytes = await privatePreflight.context.getOutputBytes(
        record.output.destination_path,
      );
      if (!Buffer.isBuffer(outputBytes) || sha256(outputBytes) !== record.output.output_sha256) {
        throw new Error(`computed output hash changed before staging: ${record.output.destination_path}`);
      }
      const staged = writePrivateMirroredFile(
        transactionState,
        'staged',
        record.output.destination_path,
        outputBytes,
        record.output.output_sha256,
      );
      transactionState.staged_by_destination.set(record.output.destination_path, staged);
    }

    for (const record of transactionState.records) {
      if (record.prestate.type !== 'regular-file') continue;
      const backup = streamPrivateMirroredBackup(transactionState, record);
      transactionState.backup_by_destination.set(record.output.destination_path, backup);
    }

    await privatePreflight.revalidate_source();
    for (const record of transactionState.records) {
      if (!verifyDestinationPrestate(workspaceRoot, record)) {
        throw new Error(`destination changed during final apply preflight: ${record.output.destination_path}`);
      }
    }
    recaptureApplyPlanningFacts(privatePreflight, {
      require_original_transaction: true,
      expected_transaction: createdTransactionFact,
    });
    verifyTransactionPrivacy(transactionState);

    for (const record of transactionState.records) {
      const outputBytes = readStagedOutput(transactionState, record.output);
      installDirectoryOutput(transactionState, record, outputBytes);
      if (!verifyInstalledDirectoryOutput(workspaceRoot, record)) {
        throw new Error(`installed output verification failed: ${record.output.destination_path}`);
      }
    }
    for (const record of transactionState.records) {
      if (!verifyInstalledDirectoryOutput(workspaceRoot, record)) {
        throw new Error(`final output verification failed: ${record.output.destination_path}`);
      }
    }

    try {
      removeDirectoryTransaction(transactionState);
    } catch (error) {
      if (pathPresence(transactionState.nonce_path) !== 'missing') {
        return makeDirectoryImportResult({
          status: 'recovery-failed',
          plan_sha256: privatePreflight.plan.plan_sha256,
          written_paths: [],
          restored_paths: [],
          unchanged_paths: [],
          uncertain_paths: [transactionState.nonce_relative_path],
          recovery_directory: transactionState.nonce_relative_path,
          message: `Directory import installed outputs but recovery cleanup failed: ${directoryFailureMessage(error)}`,
        });
      }
    }
    return makeDirectoryImportResult({
      status: 'installed',
      plan_sha256: privatePreflight.plan.plan_sha256,
      written_paths: privatePreflight.plan.outputs.map((output) => output.destination_path),
      restored_paths: [],
      unchanged_paths: [],
      uncertain_paths: [],
      recovery_directory: null,
      message: DIRECTORY_IMPORT_SUCCESS_MESSAGE,
    });
  } catch (cause) {
    return rollbackDirectoryImport(privatePreflight, transactionState, cause);
  }
}

/**
 * Derive nonpersisted renderer data from one validated directory analysis.
 *
 * @param {unknown} analysis
 */
export function deriveDirectoryAnalysisPreview(analysis) {
  validateDirectoryAnalysisStructure(analysis);
  const coveredPaths = new Set(
    analysis.review_batches.flatMap((batch) => batch.files.map((file) => file.path)),
  );
  return {
    fixed_limits: {
      source: { ...DIRECTORY_SOURCE_LIMITS },
      review: { ...REVIEW_LIMITS },
    },
    safety_claims: [...SAFETY_CLAIMS],
    replace_paths: analysis.outputs
      .filter((output) => output.destination_state.type === 'regular-file')
      .map((output) => output.destination_path),
    uncovered_paths: analysis.entries
      .filter((entry) => entry.entry_type === 'regular-file' && !coveredPaths.has(entry.path))
      .map((entry) => entry.path),
  };
}

/**
 * Derive deterministic artifact, output, reference, and destination facts from
 * one canonical directory-source analysis without mutating the workspace.
 *
 * @param {any} sourceAnalysis
 * @param {string} workspaceRoot
 */
export async function deriveDirectoryAnalysisContext(sourceAnalysis, workspaceRoot) {
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

  validateDenseArray(
    sourceAnalysis.entries,
    'directory source analysis entries',
    DIRECTORY_SOURCE_LIMITS.max_entries,
  );
  const manifest = createCanonicalEntryManifest(sourceAnalysis.entries);
  if (!isDeepStrictEqual(sourceAnalysis.entries, manifest.entries)) {
    throw new Error('directory source entries do not equal their canonical entry manifest');
  }
  if (sourceAnalysis.manifest_sha256 !== manifest.manifest_sha256) {
    throw new Error('directory source manifest SHA-256 does not match its canonical entries');
  }
  if (canonicalSha256(manifest.entries) !== manifest.manifest_sha256) {
    throw new Error('directory source manifest SHA-256 disagrees with canonical JSON hashing');
  }

  const entries = manifest.entries;
  const source = copySourceProvenance(sourceAnalysis.source);
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const bytesByPath = new Map();
  const riskEntries = [];
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
    riskEntries.push({
      path: entry.path,
      content_class: entry.content_class,
      bytes: Buffer.from(bytes),
    });
  }
  const staticFindings = scanDirectoryRisks(riskEntries).map((finding) => ({ ...finding }));

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
    candidate.destinationState = cloneData(inspected.state);
    destinationFacts.push({
      source_path: candidate.sourcePath,
      destination_path: candidate.destinationPath,
      state: cloneData(inspected.state),
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

  const overlapCandidates = outputCandidates.filter((candidate) => (
    candidate.legal
    && (candidate.destinationState?.type === 'missing'
      || candidate.destinationState?.type === 'regular-file')
  ));
  await sourceAnalysis.revalidate();
  const planningFacts = deepFreeze({
    source: captureSourcePlanningFacts(source, entries),
    outputs: overlapCandidates.map((candidate) => {
      const inspected = inspectDestination(workspaceRoot, candidate.destinationPath);
      if (inspected.issue || !isDeepStrictEqual(inspected.state, candidate.destinationState)) {
        throw new Error(`directory destination changed during fresh context derivation: ${candidate.destinationPath}`);
      }
      return captureOutputPlanningFact(workspaceRoot, candidate.destinationPath);
    }),
  });
  const planningConflicts = collectDirectoryPlanningConflicts(planningFacts);
  const conflictedDestinations = new Set(planningConflicts.flatMap((conflict) => (
    conflict.destination_paths
  )));
  for (const candidate of outputCandidates) {
    if (conflictedDestinations.has(candidate.destinationPath)) candidate.legal = false;
  }
  for (const conflict of planningConflicts) {
    if (conflict.code === 'source-output-overlap') {
      diagnostics.push(makeDiagnostic(
        conflict.code,
        conflict.destination_paths[0],
        [],
        'Local source and output paths overlap.',
        'Move the source outside the workspace output path and analyze again.',
      ));
    } else if (conflict.code === 'source-output-alias') {
      diagnostics.push(makeDiagnostic(
        conflict.code,
        conflict.destination_paths[0],
        [],
        'Local source and output paths alias through canonical, case-folded, or directory identity facts.',
        'Use source and output roots with distinct filesystem identities and analyze again.',
      ));
    } else if (conflict.code === 'source-destination-file-identity') {
      diagnostics.push(makeDiagnostic(
        conflict.code,
        conflict.source_path,
        conflict.destination_paths,
        'Existing output file shares filesystem identity with a local source file.',
        'Replace the aliased destination with a distinct file and analyze again.',
      ));
    } else if (conflict.code === 'output-output-overlap') {
      diagnostics.push(makeDiagnostic(
        conflict.code,
        null,
        conflict.destination_paths,
        'Output paths overlap through lexical, canonical, or case-folded paths.',
        'Rename or separate the overlapping artifact outputs and analyze again.',
      ));
    } else if (conflict.code === 'output-output-alias') {
      diagnostics.push(makeDiagnostic(
        conflict.code,
        null,
        conflict.destination_paths,
        'Output paths alias through shared directory identity.',
        'Use distinct artifact output roots and analyze again.',
      ));
    } else {
      diagnostics.push(makeDiagnostic(
        conflict.code,
        null,
        conflict.destination_paths,
        'Existing output files share one filesystem identity.',
        'Replace the aliased destinations with distinct files and analyze again.',
      ));
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
      destination_state: cloneData(candidate.destinationState),
    }))
    .sort((left, right) => compareRaw(left.destination_path, right.destination_path));

  destinationFacts.sort((left, right) => (
    compareRaw(left.destination_path, right.destination_path)
    || compareRaw(left.source_path, right.source_path)
  ));
  validateDenseArray(
    destinationFacts,
    'directory analysis destination_facts',
    MAX_ANALYSIS_OUTPUTS,
  );
  diagnostics.sort(compareDiagnostics);
  const uniqueDiagnostics = [];
  const diagnosticIdentities = new Map();
  for (const item of diagnostics) {
    const identity = canonicalJson([item.code, item.path, item.related_paths]);
    const existing = diagnosticIdentities.get(identity);
    if (existing) {
      if (!isDeepStrictEqual(existing, item)) {
        throw new Error(`conflicting blocking diagnostics share one identity: ${identity}`);
      }
      continue;
    }
    diagnosticIdentities.set(identity, item);
    uniqueDiagnostics.push(item);
  }

  const reviewBatches = createReviewBatches(entries, bytesByPath);
  const analysisWithoutHash = {
    schema_version: 1,
    kind: 'dude-directory-import-analysis',
    source,
    entries: entries.map((entry) => ({ ...entry })),
    manifest_sha256: manifest.manifest_sha256,
    groups,
    outputs,
    static_findings: staticFindings,
    blocking_diagnostics: uniqueDiagnostics,
    static_decision: deriveStaticDecision(staticFindings, uniqueDiagnostics),
    review_batches: reviewBatches,
  };
  const analysis = {
    ...analysisWithoutHash,
    analysis_sha256: canonicalSha256(analysisWithoutHash),
  };
  validateDirectoryAnalysisStructure(analysis);

  async function getSourceBytes(sourcePath) {
    if (typeof sourcePath !== 'string' || !bytesByPath.has(sourcePath)) {
      throw new Error(`unknown or missing validated source file: ${String(sourcePath)}`);
    }
    return Buffer.from(bytesByPath.get(sourcePath));
  }

  async function getOutputBytes(destinationPath) {
    if (typeof destinationPath !== 'string' || !outputBytesByDestination.has(destinationPath)) {
      throw new Error(`unknown or missing computed output: ${String(destinationPath)}`);
    }
    return Buffer.from(outputBytesByDestination.get(destinationPath));
  }

  deepFreeze(analysis);
  deepFreeze(destinationFacts);
  const context = deepFreeze({
    analysis,
    destination_facts: destinationFacts,
    getSourceBytes,
    getOutputBytes,
  });
  DIRECTORY_ANALYSIS_CONTEXTS.add(context);
  DIRECTORY_ANALYSIS_PRIVATE_FACTS.set(context, planningFacts);
  return context;
}

/**
 * Build the persisted directory analysis without exposing internal byte access
 * or destination inspection facts.
 *
 * @param {any} sourceAnalysis
 * @param {string} workspaceRoot
 */
export async function analyzeDirectoryArtifacts(sourceAnalysis, workspaceRoot) {
  const context = await deriveDirectoryAnalysisContext(sourceAnalysis, workspaceRoot);
  return context.analysis;
}
