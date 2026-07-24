// @ts-check
import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyDirectoryPreflight,
  analyzeDirectoryArtifacts as analyzePublicDirectoryArtifacts,
  DirectoryPlanningRefusal,
  deriveDirectoryAnalysisPreview,
  deriveDirectoryAnalysisContext,
  planDirectoryArtifacts,
  preflightDirectoryApply,
  renderDirectoryPlanConfirmation,
  validateDirectoryAnalysis,
  validateDirectoryAnalysisStructure,
  validateDirectoryPlan,
  validateDirectoryPlanStructure,
  validateDirectoryImportResult,
  validateDirectoryReview,
} from './directory-import.mjs';
import {
  analyzeLocalDirectory,
  createCanonicalEntryManifest,
  DIRECTORY_SOURCE_LIMITS,
} from './directory-source.mjs';

const COORDINATOR_PARAGRAPH =
  '**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state ' +
  'glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, ' +
  '`<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report ' +
  'changes back to `@dude` instead.';

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
const GROUP_FIELDS = ['kind', 'entrypoint'];
const OUTPUT_FIELDS = [
  'source_path',
  'destination_path',
  'output_sha256',
  'transform_ids',
  'destination_state',
];
const DIAGNOSTIC_FIELDS = ['code', 'path', 'related_paths', 'message', 'guidance'];
const CLEAN_SOURCE_GUIDANCE =
  /single-file import\/adaptation|clean (?:directory )?source/i;
const ACTIONABLE_GUIDANCE =
  /\b(?:adapt|add|analyze|choose|clean|correct|fix|import|move|narrower|prepare|remove|rename|replace|resolve|restore|select|separate|use)\b/i;
const BOUNDARY_GUIDANCE =
  'Use focused single-file import/adaptation or prepare a clean source with exactly the canonical coordinator-only artifacts paragraph.';
const OPTIONAL_REVIEW_CANONICAL_JSON_MAX_BYTES = 1_048_576;
const REVIEWED_PLAN_CANONICAL_JSON_MAX_BYTES = 16_777_216;

/**
 * Preserve the T003 assertion surface while its internal facts move behind the
 * T005 context builder.
 *
 * @param {any} sourceAnalysis
 * @param {string} workspaceRoot
 */
async function analyzeDirectoryArtifacts(sourceAnalysis, workspaceRoot) {
  const context = await deriveDirectoryAnalysisContext(sourceAnalysis, workspaceRoot);
  return {
    ...context.analysis,
    destination_facts: context.destination_facts,
    getOutputBytes: context.getOutputBytes,
  };
}

/** @param {Buffer|string} bytes */
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** @param {any} value */
function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort(compareRaw).map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

/** @param {any} value */
function canonicalJsonByteLength(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

/**
 * @param {any} value
 * @param {Record<string, any>} owner
 * @param {string} field
 * @param {number} targetBytes
 * @param {string} prefix
 */
function padCanonicalJsonString(value, owner, field, targetBytes, prefix) {
  owner[field] = prefix;
  const remaining = targetBytes - canonicalJsonByteLength(value);
  assert.ok(remaining >= 0);
  owner[field] += 'x'.repeat(remaining);
  assert.equal(canonicalJsonByteLength(value), targetBytes);
  return value;
}

/** @param {any} analysis */
function rehashAnalysis(analysis) {
  const payload = {};
  for (const field of ANALYSIS_FIELDS.slice(0, -1)) payload[field] = analysis[field];
  analysis.analysis_sha256 = sha256(Buffer.from(canonicalJson(payload)));
  return analysis;
}

/** @param {any} plan */
function rehashPlan(plan) {
  const payload = {};
  for (const field of PLAN_FIELDS.slice(0, -1)) payload[field] = plan[field];
  plan.plan_sha256 = sha256(Buffer.from(canonicalJson(payload)));
  return plan;
}

/** @param {any} analysis @param {any[]} [findings] @param {string[]} [reviewedBatchIds] */
function reviewFixture(
  analysis,
  findings = [],
  reviewedBatchIds = analysis.review_batches.map((batch) => batch.batch_id),
) {
  return {
    schema_version: 1,
    kind: 'dude-directory-review',
    analysis_sha256: analysis.analysis_sha256,
    reviewed_batch_ids: [...reviewedBatchIds],
    findings: structuredClone(findings),
  };
}

/** @param {any} analysis @param {Partial<Record<string, unknown>>} [overrides] */
function advisoryFinding(analysis, overrides = {}) {
  const batch = analysis.review_batches[0];
  assert.ok(batch);
  const file = batch.files[0];
  assert.ok(file);
  return {
    batch_id: batch.batch_id,
    path: file.path,
    category: 'prompt-injection-authority-override',
    severity: 'warn',
    evidence: 'review evidence',
    explanation: 'Review explanation.',
    ...overrides,
  };
}

/** @param {number} byteCount @param {boolean} [multibyte] */
function safeTextWithByteCount(byteCount, multibyte = false) {
  /** @param {number} count */
  const safeAscii = (count) => `${'_ '.repeat(Math.floor(count / 2))}${count % 2 ? '_' : ''}`;
  let content = '';
  const line = multibyte ? `${'é_'.repeat(2_666)}\n` : `${safeAscii(8_000)}\n`;
  const lineBytes = Buffer.byteLength(line);
  while (Buffer.byteLength(content) + lineBytes <= byteCount) content += line;
  const remaining = byteCount - Buffer.byteLength(content);
  if (remaining > 0) content += safeAscii(remaining);
  assert.equal(Buffer.byteLength(content), byteCount);
  return content;
}

/** @param {any} value */
function assertContainsNoFunctions(value) {
  if (value === null || typeof value !== 'object') {
    assert.notEqual(typeof value, 'function');
    return;
  }
  for (const nested of Object.values(value)) assertContainsNoFunctions(nested);
}

/** @param {any} value */
function assertContainsNoBuffers(value) {
  assert.equal(Buffer.isBuffer(value), false);
  if (!value || typeof value !== 'object') return;
  for (const nested of Object.values(value)) assertContainsNoBuffers(nested);
}

/** @param {any} value */
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeepFrozen(nested);
}

/**
 * @param {unknown} error
 * @param {string} code
 * @param {string|null} sourcePath
 * @param {string[]} destinationPaths
 */
function assertPlanningRefusal(error, code, sourcePath, destinationPaths) {
  assert.ok(error instanceof DirectoryPlanningRefusal);
  assert.deepEqual(Object.keys(error), ['code', 'source_path', 'destination_paths']);
  assert.equal(error.code, code);
  assert.equal(error.source_path, sourcePath);
  assert.deepEqual(error.destination_paths, [...destinationPaths].sort(compareRaw));
  assert.equal(Object.isFrozen(error), true);
  assert.equal(Object.isFrozen(error.destination_paths), true);
  assert.equal(Object.prototype.propertyIsEnumerable.call(error, 'message'), false);
  return true;
}

/** @param {string} left @param {string} right */
function compareRaw(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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
  const pathOrder = compareRaw(left.path ?? '', right.path ?? '');
  if (pathOrder !== 0) return pathOrder;
  const relatedOrder = compareRawArrays(left.related_paths, right.related_paths);
  if (relatedOrder !== 0) return relatedOrder;
  return compareRaw(left.message, right.message);
}
/** @param {Buffer} bytes */
function classify(bytes) {
  return isUtf8(bytes) && !bytes.includes(0) ? 'text' : 'opaque';
}

/**
 * Build a provider-realistic T001/T002 result without exercising provider I/O.
 * Parent directories are included because both providers expose them.
 *
 * @param {Record<string, Buffer|string>} files
 * @param {{
 *   directories?: string[],
 *   sharedReadBuffers?: boolean,
 *   revalidateError?: Error|null,
 *   revalidateHook?: (() => void|Promise<void>)|null,
 * }} [options]
 */
function sourceFixture(files, options = {}) {
  const bytesByPath = new Map();
  const directories = new Set(options.directories ?? []);
  for (const [relativePath, value] of Object.entries(files)) {
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value);
    bytesByPath.set(relativePath, bytes);
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }
  for (const relativePath of [...directories]) {
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }

  const rawEntries = [
    ...[...directories].map((relativePath) => ({
      path: relativePath,
      entry_type: 'directory',
      byte_count: 0,
      sha256: null,
      content_class: 'none',
    })),
    ...[...bytesByPath].map(([relativePath, bytes]) => ({
      path: relativePath,
      entry_type: 'regular-file',
      byte_count: bytes.length,
      sha256: sha256(bytes),
      content_class: classify(bytes),
    })),
  ];
  const manifest = createCanonicalEntryManifest(rawEntries);
  const state = {
    events: /** @type {string[]} */ ([]),
    revalidateCalls: 0,
    revalidateHook: options.revalidateHook ?? null,
  };
  const sourceAnalysis = {
    source: {
      provider: /** @type {const} */ ('github-tree'),
      input: 'https://github.com/example/project/tree/main/fixture',
      identity: {
        owner: 'example',
        repository: 'project',
        requested_ref: 'main',
        resolved_commit: 'a'.repeat(40),
        subtree: 'fixture',
        tree_sha: 'b'.repeat(40),
      },
    },
    entries: manifest.entries.map((entry) => ({ ...entry })),
    manifest_sha256: manifest.manifest_sha256,
    async getFileBytes(relativePath) {
      state.events.push(`read:${relativePath}`);
      const bytes = bytesByPath.get(relativePath);
      if (bytes === undefined) throw new Error(`unknown fixture file: ${relativePath}`);
      return options.sharedReadBuffers ? bytes : Buffer.from(bytes);
    },
    async revalidate() {
      state.events.push('revalidate');
      state.revalidateCalls += 1;
      await state.revalidateHook?.();
      if (options.revalidateError) throw options.revalidateError;
    },
  };
  return { sourceAnalysis, state, bytesByPath };
}

/** @param {ReturnType<typeof sourceFixture>} fixture @param {string} relativePath @param {Record<string, unknown>} patch */
function replaceCanonicalEntry(fixture, relativePath, patch) {
  fixture.sourceAnalysis.entries = fixture.sourceAnalysis.entries.map((entry) => (
    entry.path === relativePath ? { ...entry, ...patch } : entry
  ));
  fixture.sourceAnalysis.manifest_sha256 = createCanonicalEntryManifest(
    fixture.sourceAnalysis.entries,
  ).manifest_sha256;
}

/**
 * @param {{
 *   name?: string,
 *   nameLine?: string,
 *   descriptionLine?: string,
 *   extra?: string[],
 *   body?: string,
 *   separator?: string,
 * }} [options]
 */
function skillDocument(options = {}) {
  const separator = options.separator ?? '\n';
  const name = options.name ?? 'sample';
  return [
    '---',
    '# preserve this metadata comment',
    options.nameLine ?? `name: ${name}`,
    options.descriptionLine ?? 'description: "A fixture skill"',
    ...(options.extra ?? []),
    '---',
    options.body ?? 'Use the fixture skill.',
    '',
  ].join(separator);
}

/**
 * @param {{
 *   name?: string,
 *   descriptionLine?: string,
 *   extra?: string[],
 *   body?: string,
 *   separator?: string,
 }} [options]
 */
function agentDocument(options = {}) {
  const separator = options.separator ?? '\n';
  return [
    '---',
    `name: "${options.name ?? 'Fixture Reviewer'}"`,
    options.descriptionLine ?? 'description: "Reviews fixture artifacts"',
    ...(options.extra ?? []),
    '---',
    options.body ?? COORDINATOR_PARAGRAPH,
    '',
  ].join(separator);
}

/** @param {(root: string) => Promise<void>} run */
async function withWorkspace(run) {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const workspaceRoot = fs.mkdtempSync(path.join(temporaryRoot, 'dude-directory-import-'));
  try {
    await run(workspaceRoot);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

/** @param {string} root @param {string} relativePath @param {Buffer|string} bytes */
function writeWorkspaceFile(root, relativePath, bytes) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
  return absolutePath;
}

/** @param {any} result */
function assertResultContract(result) {
  assert.ok(Array.isArray(result.groups));
  assert.ok(Array.isArray(result.outputs));
  assert.ok(Array.isArray(result.blocking_diagnostics));
  assert.ok(Array.isArray(result.destination_facts));
  assert.equal(typeof result.getOutputBytes, 'function');
  for (const group of result.groups) assert.deepEqual(Object.keys(group), GROUP_FIELDS);
  for (const output of result.outputs) {
    assert.deepEqual(Object.keys(output), OUTPUT_FIELDS);
    assert.match(output.output_sha256, /^[0-9a-f]{64}$/);
    assert.ok(
      output.destination_state.type === 'missing'
      || output.destination_state.type === 'regular-file',
    );
  }
}

/** @param {any} result @param {string} sourcePath */
function outputForSource(result, sourcePath) {
  const matches = result.outputs.filter((output) => output.source_path === sourcePath);
  assert.equal(matches.length, 1, `expected one public output for ${sourcePath}`);
  return matches[0];
}

test('DirectoryPlanningRefusal defensively owns immutable sorted refusal data', () => {
  const constructorDestinations = ['z/path', 'a/path', 'z/path'];
  const error = new DirectoryPlanningRefusal(
    'immutable-refusal',
    'source/path',
    constructorDestinations,
    'immutable refusal message',
  );

  constructorDestinations[0] = 'changed/input';
  constructorDestinations.push('later/input');
  assert.deepEqual(error.destination_paths, ['a/path', 'z/path']);
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'immutable refusal message');
  assert.deepEqual(Object.keys(error), ['code', 'source_path', 'destination_paths']);
  assert.equal(Object.isFrozen(error), true);
  assert.equal(Object.isFrozen(error.destination_paths), true);
  assert.throws(() => { error.code = 'changed'; }, TypeError);
  assert.throws(() => { delete error.source_path; }, TypeError);
  assert.throws(() => { error.destination_paths.push('changed/array'); }, TypeError);
  assert.throws(() => { error.destination_paths[0] = 'changed/element'; }, TypeError);
});

/** @param {any} result @param {string} sourcePath */
function assertNoOutputForSource(result, sourcePath) {
  assert.equal(
    result.outputs.some((output) => output.source_path === sourcePath),
    false,
    `${sourcePath} must not be exposed as a legal output`,
  );
}

/** @param {any} result @param {string} code @param {string|null|undefined} [diagnosticPath] */
function diagnostic(result, code, diagnosticPath = undefined) {
  const matches = result.blocking_diagnostics.filter((item) => (
    item.code === code && (diagnosticPath === undefined || item.path === diagnosticPath)
  ));
  assert.equal(
    matches.length,
    1,
    `expected one ${code} diagnostic${diagnosticPath === undefined ? '' : ` for ${diagnosticPath}`}`,
  );
  const record = matches[0];
  assert.deepEqual(Object.keys(record), DIAGNOSTIC_FIELDS);
  assert.ok(record.path === null || typeof record.path === 'string');
  assert.deepEqual(record.related_paths, [...record.related_paths].sort(compareRaw));
  assert.equal(new Set(record.related_paths).size, record.related_paths.length);
  assert.equal(record.related_paths.includes(record.path), false);
  assert.equal(typeof record.message, 'string');
  assert.notEqual(record.message, '');
  assert.equal(typeof record.guidance, 'string');
  assert.notEqual(record.guidance, '');
  assert.match(record.guidance, ACTIONABLE_GUIDANCE);
  return record;
}

/** @param {any} result @param {string} code */
function assertNoDiagnostic(result, code) {
  assert.equal(
    result.blocking_diagnostics.some((item) => item.code === code),
    false,
    `did not expect ${code}`,
  );
}

/** @param {any} result @param {string} sourcePath @param {string} destinationPath */
function destinationFact(result, sourcePath, destinationPath) {
  const matches = result.destination_facts.filter((fact) => (
    fact.source_path === sourcePath && fact.destination_path === destinationPath
  ));
  assert.equal(
    matches.length,
    1,
    `expected one retained destination fact for ${sourcePath} -> ${destinationPath}`,
  );
  return matches[0];
}

/** @param {string} root */
function snapshotWorkspace(root) {
  const records = [];
  /** @param {string} absoluteDirectory @param {string} prefix */
  function visit(absoluteDirectory, prefix) {
    const names = fs.readdirSync(absoluteDirectory).sort(compareRaw);
    for (const name of names) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const absolutePath = path.join(absoluteDirectory, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        records.push({ path: relativePath, type: 'symbolic-link', target: fs.readlinkSync(absolutePath) });
      } else if (stat.isDirectory()) {
        records.push({ path: relativePath, type: 'directory' });
        visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        records.push({ path: relativePath, type: 'regular-file', sha256: sha256(fs.readFileSync(absolutePath)) });
      } else {
        records.push({ path: relativePath, type: 'non-regular' });
      }
    }
  }
  visit(root, '');
  return records;
}

/** @param {string} workspaceRoot @param {() => Promise<void>} run */
async function assertNoFilesystemMutation(workspaceRoot, run) {
  const before = snapshotWorkspace(workspaceRoot);
  const mutationCalls = [];
  const mutationNames = [
    'appendFileSync',
    'chmodSync',
    'copyFileSync',
    'linkSync',
    'mkdirSync',
    'renameSync',
    'rmSync',
    'symlinkSync',
    'truncateSync',
    'unlinkSync',
    'writeFileSync',
  ];
  const originals = new Map();
  let failure = null;
  for (const name of mutationNames) {
    originals.set(name, fs[name]);
    fs[name] = (...args) => {
      mutationCalls.push({ name, args });
      throw new Error(`unexpected apply-preflight mutation through fs.${name}`);
    };
  }
  try {
    await run();
  } catch (error) {
    failure = error;
  } finally {
    for (const [name, original] of originals) fs[name] = original;
  }
  assert.deepEqual(mutationCalls, []);
  assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
  if (failure) throw failure;
}

test('public analysis is the exact 12-field persisted artifact and context keeps internal facts', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
      'artifact/empty.txt': '',
    });
    const context = await deriveDirectoryAnalysisContext(fixture.sourceAnalysis, workspaceRoot);
    const publicAnalysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );

    assert.deepEqual(publicAnalysis, context.analysis);
    assert.deepEqual(Object.keys(publicAnalysis), ANALYSIS_FIELDS);
    assert.equal(publicAnalysis.schema_version, 1);
    assert.equal(publicAnalysis.kind, 'dude-directory-import-analysis');
    assert.equal('destination_facts' in publicAnalysis, false);
    assert.equal('getSourceBytes' in publicAnalysis, false);
    assert.equal('getOutputBytes' in publicAnalysis, false);
    assertContainsNoFunctions(publicAnalysis);
    assert.equal(validateDirectoryAnalysisStructure(publicAnalysis), true);
    assert.throws(
      () => validateDirectoryAnalysis(publicAnalysis),
      /freshly derived context/,
    );
    assert.throws(
      () => validateDirectoryAnalysis(publicAnalysis, { analysis: publicAnalysis }),
      /freshly derived context/,
    );
    assert.equal(validateDirectoryAnalysis(context.analysis, context), true);
    assert.equal(
      validateDirectoryAnalysis(structuredClone(context.analysis), context),
      true,
    );

    assert.ok(Array.isArray(context.destination_facts));
    assert.equal(typeof context.getSourceBytes, 'function');
    assert.equal(typeof context.getOutputBytes, 'function');
    const firstSource = await context.getSourceBytes('artifact/SKILL.md');
    const secondSource = await context.getSourceBytes('artifact/SKILL.md');
    assert.notStrictEqual(firstSource, secondSource);
    firstSource.fill(0);
    assert.deepEqual(secondSource, Buffer.from(skillDocument()));
    await assert.rejects(context.getSourceBytes('artifact/missing.txt'), /unknown|missing/);

    assertDeepFrozen(context);
    assertDeepFrozen(publicAnalysis);
    const contextOutput = context.analysis.outputs[0];
    const contextFact = context.destination_facts.find((fact) => (
      fact.source_path === contextOutput.source_path
      && fact.destination_path === contextOutput.destination_path
    ));
    assert.ok(contextFact);
    assert.notStrictEqual(contextFact.state, contextOutput.destination_state);
    assert.throws(() => {
      contextFact.state.type = 'regular-file';
    }, TypeError);
    assert.deepEqual(contextOutput.destination_state, { type: 'missing' });

    assert.equal(
      publicAnalysis.manifest_sha256,
      sha256(Buffer.from(canonicalJson(publicAnalysis.entries))),
    );
    const hashPayload = {};
    for (const field of ANALYSIS_FIELDS.slice(0, -1)) hashPayload[field] = publicAnalysis[field];
    assert.equal(
      publicAnalysis.analysis_sha256,
      sha256(Buffer.from(canonicalJson(hashPayload))),
    );
    assert.equal(
      publicAnalysis.manifest_sha256,
      '93353cce6d51efbd7582884d51066287fe6f62c779b7bec5c046836b0ab62dc3',
    );
    assert.equal(
      publicAnalysis.analysis_sha256,
      '6d79e3e4a3825c4890950637142ed25554b28aba681f6bfb0c9f964ad3251790',
    );
  });
});

test('authoritative validation binds facts and transformed bytes omitted from the compact artifact', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'README.md': 'ordinary unowned text\n',
      'artifact/SKILL.md': skillDocument({ name: 'authoritative-skill' }),
      'artifact/support.txt': 'eval(command)\n',
    });
    const context = await deriveDirectoryAnalysisContext(fixture.sourceAnalysis, workspaceRoot);
    const exact = context.analysis;
    const transformedOutput = exact.outputs.find((output) => output.transform_ids.length === 1);
    const supportFinding = exact.static_findings.find((finding) => (
      finding.path === 'artifact/support.txt'
    ));
    const unownedDiagnostic = exact.blocking_diagnostics.find((item) => (
      item.code === 'ownership-unowned' && item.path === 'README.md'
    ));
    assert.ok(transformedOutput);
    assert.ok(supportFinding);
    assert.ok(unownedDiagnostic);
    assert.equal(validateDirectoryAnalysis(exact, context), true);

    const omittedOutput = structuredClone(exact);
    omittedOutput.outputs = omittedOutput.outputs.filter((output) => (
      output.destination_path !== transformedOutput.destination_path
    ));
    rehashAnalysis(omittedOutput);

    const omittedFinding = structuredClone(exact);
    omittedFinding.static_findings = omittedFinding.static_findings.filter((finding) => (
      finding.path !== supportFinding.path
    ));
    rehashAnalysis(omittedFinding);

    const omittedDiagnostic = structuredClone(exact);
    omittedDiagnostic.blocking_diagnostics = omittedDiagnostic.blocking_diagnostics.filter((item) => (
      item.code !== unownedDiagnostic.code || item.path !== unownedDiagnostic.path
    ));
    omittedDiagnostic.static_decision = 'warned';
    rehashAnalysis(omittedDiagnostic);

    const substitutedTransformHash = structuredClone(exact);
    const substitutedOutput = substitutedTransformHash.outputs.find((output) => (
      output.destination_path === transformedOutput.destination_path
    ));
    assert.ok(substitutedOutput);
    substitutedOutput.output_sha256 = 'f'.repeat(64);
    rehashAnalysis(substitutedTransformHash);

    for (const altered of [
      omittedOutput,
      omittedFinding,
      omittedDiagnostic,
      substitutedTransformHash,
    ]) {
      assert.equal(validateDirectoryAnalysisStructure(altered), true);
      assert.throws(
        () => validateDirectoryAnalysis(altered, context),
        /does not exactly match/,
      );
    }
  });
});

test('static scanner integration derives clean, warned, and blocked decisions only from static facts', async (t) => {
  const cases = [
    {
      name: 'clean',
      support: 'ordinary support text\n',
      decision: 'clean',
      severity: null,
    },
    {
      name: 'warned',
      support: 'eval(command)\n',
      decision: 'warned',
      severity: 'warn',
    },
    {
      name: 'blocked',
      support: 'rm -rf /workspace/cache\n',
      decision: 'blocked',
      severity: 'block',
    },
  ];
  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument(),
          'artifact/support.txt': fixtureCase.support,
        });
        const analysis = await analyzePublicDirectoryArtifacts(
          fixture.sourceAnalysis,
          workspaceRoot,
        );

        assert.equal(analysis.static_decision, fixtureCase.decision);
        if (fixtureCase.severity === null) {
          assert.deepEqual(analysis.static_findings, []);
        } else {
          assert.ok(analysis.static_findings.some((finding) => (
            finding.path === 'artifact/support.txt'
            && finding.severity === fixtureCase.severity
          )));
        }
        assert.equal(validateDirectoryAnalysisStructure(analysis), true);
      });
    });
  }

  await t.test('a non-content diagnostic blocks an otherwise clean scan', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'agents/review.agent.md': agentDocument({ body: 'Ordinary body without the boundary.' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.deepEqual(analysis.static_findings, []);
      assert.equal(analysis.blocking_diagnostics[0].code, 'agent-boundary-missing');
      assert.equal(analysis.static_decision, 'blocked');
    });
  });
});

test('scanner receives every canonical regular source file once, including blocked and opaque files', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'README.md': 'eval(command)\n',
      'bad/SKILL.md': '---\nname: bad\n---\nfetch("https://example.test")\n',
      'owned/SKILL.md': skillDocument(),
      'owned/opaque.bin': Buffer.concat([
        Buffer.from([0xff, 0]),
        Buffer.from('rm -rf /workspace'),
        Buffer.from([0]),
      ]),
      'owned/support.txt': 'systemctl status fixture.service\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const regularPaths = analysis.entries
      .filter((entry) => entry.entry_type === 'regular-file')
      .map((entry) => entry.path);

    assert.deepEqual(
      fixture.state.events.filter((event) => event.startsWith('read:')),
      regularPaths.map((relativePath) => `read:${relativePath}`),
    );
    assert.equal(new Set(regularPaths).size, regularPaths.length);

  test('one-line strict text above the former physical-line cap remains plannable', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument(),
        'artifact/long.txt': '_'.repeat(16_385),
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.equal(analysis.static_decision, 'clean');
      assert.ok(analysis.outputs.some((output) => output.source_path === 'artifact/long.txt'));

      const plan = await planDirectoryArtifacts(
        analysis,
        null,
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      assert.equal(plan.decision, 'warned');
    });
  });
    assert.deepEqual(
      [...new Set(analysis.static_findings.map((finding) => finding.path))],
      [
        'README.md',
        'bad/SKILL.md',
        'owned/opaque.bin',
        'owned/support.txt',
      ],
    );
    assert.ok(analysis.blocking_diagnostics.some((item) => (
      item.code === 'ownership-unowned' && item.path === 'README.md'
    )));
    assert.ok(analysis.blocking_diagnostics.some((item) => (
      item.code === 'entrypoint-required-field-invalid' && item.path === 'bad/SKILL.md'
    )));
    assert.equal(analysis.static_decision, 'blocked');
  });
});

test('canonical acquisition order produces deterministic analysis independent of fixture insertion order', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const files = {
      'artifact/z-last.txt': 'ordinary z\n',
      'artifact/SKILL.md': skillDocument(),
      'artifact/a-first.txt': 'eval(command)\n',
    };
    const reversedFiles = Object.fromEntries(Object.entries(files).reverse());
    const first = sourceFixture(files);
    const second = sourceFixture(reversedFiles);
    const firstAnalysis = await analyzePublicDirectoryArtifacts(first.sourceAnalysis, workspaceRoot);
    const secondAnalysis = await analyzePublicDirectoryArtifacts(second.sourceAnalysis, workspaceRoot);

    assert.deepEqual(secondAnalysis, firstAnalysis);
    assert.deepEqual(
      first.state.events.filter((event) => event.startsWith('read:')),
      second.state.events.filter((event) => event.startsWith('read:')),
    );
  });
});

test('bare CR in any strict-text source file fails analysis before an artifact is returned', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
      'artifact/non-output.txt': 'first\rsecond',
    });
    const before = snapshotWorkspace(workspaceRoot);

    await assert.rejects(
      analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
      /bare CR/,
    );
    assert.equal(fixture.state.revalidateCalls, 0);
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
  });
});

test('review batches use stable greedy complete-file packing at every fixed boundary', async (t) => {
  await t.test('packs 16 files together and starts batch-002 for file 17', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sixteenFiles = {
        'artifact/SKILL.md': skillDocument(),
        ...Object.fromEntries(Array.from(
          { length: 15 },
          (_, index) => [`artifact/empty-${String(index).padStart(2, '0')}.txt`, ''],
        )),
      };
      const sixteen = await analyzePublicDirectoryArtifacts(
        sourceFixture(sixteenFiles).sourceAnalysis,
        workspaceRoot,
      );
      assert.deepEqual(sixteen.review_batches.map((batch) => [batch.batch_id, batch.files.length]), [
        ['batch-001', 16],
      ]);
      assert.ok(sixteen.review_batches[0].files.some((file) => (
        file.path === 'artifact/empty-00.txt' && file.content === ''
      )));

      const seventeen = await analyzePublicDirectoryArtifacts(
        sourceFixture({ ...sixteenFiles, 'artifact/empty-15.txt': '' }).sourceAnalysis,
        workspaceRoot,
      );
      assert.deepEqual(seventeen.review_batches.map((batch) => [batch.batch_id, batch.files.length]), [
        ['batch-001', 16],
        ['batch-002', 1],
      ]);
    });
  });

  await t.test('accepts exactly 262144 UTF-8 bytes and skips byte 262145 without flushing', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const exact = safeTextWithByteCount(262_144);
      const over = safeTextWithByteCount(262_145);
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument(),
        'artifact/a-before.txt': 'before\n',
        'artifact/b-over.txt': over,
        'artifact/c-after.txt': 'after\n',
        'artifact/d-exact.txt': exact,
        'artifact/e-tail.txt': 'tail\n',
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(analysis.review_batches.map((batch) => (
        batch.files.map((file) => file.path)
      )), [
        ['artifact/SKILL.md', 'artifact/a-before.txt', 'artifact/c-after.txt'],
        ['artifact/d-exact.txt'],
        ['artifact/e-tail.txt'],
      ]);
      assert.equal(
        Buffer.byteLength(analysis.review_batches[1].files[0].content),
        262_144,
      );
      assert.equal(validateDirectoryAnalysisStructure(analysis), true);
      assert.equal(analysis.static_decision, 'clean', 'coverage gaps do not change static_decision');
      const preview = deriveDirectoryAnalysisPreview(analysis);
      assert.deepEqual(preview.uncovered_paths, ['artifact/b-over.txt']);
    });
  });

  await t.test('rejects overlength content before paired-Unicode validation', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const path = 'artifact/bounded.txt';
      const analysis = await analyzePublicDirectoryArtifacts(
        sourceFixture({
          'artifact/SKILL.md': skillDocument(),
          [path]: 'bounded\n',
        }).sourceAnalysis,
        workspaceRoot,
      );
      const malformed = structuredClone(analysis);
      const entry = malformed.entries.find((item) => item.path === path);
      const file = malformed.review_batches
        .flatMap((batch) => batch.files)
        .find((item) => item.path === path);
      assert.ok(entry);
      assert.ok(file);
      assert.equal(file.content.length, entry.byte_count);

      file.content = `${file.content}\ud800`;
      assert.equal(file.content.length, entry.byte_count + 1);
      assert.throws(
        () => validateDirectoryAnalysisStructure(malformed),
        /review batch content exceeds entry byte_count/,
      );
    });
  });

  await t.test('counts multibyte UTF-8 bytes rather than JavaScript code units', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const multibyte = safeTextWithByteCount(262_144, true);
      assert.ok(multibyte.length < Buffer.byteLength(multibyte));
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument(),
        'artifact/multibyte.txt': multibyte,
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(analysis.review_batches.map((batch) => batch.files.map((file) => file.path)), [
        ['artifact/SKILL.md'],
        ['artifact/multibyte.txt'],
      ]);
      assert.equal(Buffer.byteLength(analysis.review_batches[1].files[0].content), 262_144);
    });
  });

  await t.test('omits opaque files from batches and round-trips every included file exactly', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ separator: '\r\n' }),
        'artifact/empty.txt': '',
        'artifact/opaque.bin': Buffer.from([0xff, 0, 1]),
        'artifact/unicode.txt': 'Résumé\r\n',
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const entryByPath = new Map(analysis.entries.map((entry) => [entry.path, entry]));

      assert.equal(
        analysis.review_batches.some((batch) => (
          batch.files.some((file) => file.path === 'artifact/opaque.bin')
        )),
        false,
      );
      for (const batch of analysis.review_batches) {
        assert.ok(batch.files.length > 0 && batch.files.length <= 16);
        const batchBytes = batch.files.reduce((total, file) => {
          const bytes = Buffer.from(file.content, 'utf8');
          const entry = entryByPath.get(file.path);
          assert.equal(bytes.length, entry.byte_count);
          assert.equal(sha256(bytes), entry.sha256);
          assert.equal(bytes.toString('utf8'), file.content);
          return total + bytes.length;
        }, 0);
        assert.ok(batchBytes <= 262_144);
      }
      assert.deepEqual(
        deriveDirectoryAnalysisPreview(analysis).uncovered_paths,
        ['artifact/opaque.bin'],
      );
    });
  });
});

test('preview derives fixed limits, safety claims, replacements, and canonical uncovered paths only', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const overBudget = safeTextWithByteCount(262_145);
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'preview-skill' }),
      'artifact/a-existing.txt': 'existing source\n',
      'artifact/b-over.txt': overBudget,
      'artifact/c-opaque.bin': Buffer.from([0xff, 0, 1]),
      'artifact/d-batched.txt': 'batched\n',
    });
    writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/dude-local-preview-skill/SKILL.md',
      'old skill\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/dude-local-preview-skill/a-existing.txt',
      'old support\n',
    );
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const hashBefore = analysis.analysis_sha256;
    const preview = deriveDirectoryAnalysisPreview(analysis);

    assert.deepEqual(Object.keys(preview), [
      'fixed_limits',
      'safety_claims',
      'replace_paths',
      'uncovered_paths',
    ]);
    assert.deepEqual(preview.fixed_limits, {
      source: { ...DIRECTORY_SOURCE_LIMITS },
      review: { max_files: 16, max_utf8_bytes: 262_144 },
    });
    assert.deepEqual(preview.safety_claims, [
      'Static and language-model review do not prove safety.',
      'Directory import does not execute imported content.',
    ]);
    assert.deepEqual(preview.replace_paths, [
      '.github/skills/dude-local-preview-skill/SKILL.md',
      '.github/skills/dude-local-preview-skill/a-existing.txt',
    ]);
    assert.deepEqual(preview.uncovered_paths, [
      'artifact/b-over.txt',
      'artifact/c-opaque.bin',
    ]);
    assert.equal(analysis.analysis_sha256, hashBefore);
    assert.equal('fixed_limits' in analysis, false);
    assert.equal('safety_claims' in analysis, false);
    assert.equal('replace_paths' in analysis, false);
    assert.equal('uncovered_paths' in analysis, false);
  });
});

test('validateDirectoryAnalysis rejects malformed structure, semantics, ordering, and hashes', async (t) => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'validation-skill' }),
      'artifact/support.txt': 'ordinary support\n',
    });
    const base = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    assert.equal(validateDirectoryAnalysisStructure(base), true);

    const cases = [
      {
        name: 'unknown top-level field',
        expected: /exactly these fields/,
        mutate(analysis) { analysis.extra = true; },
      },
      {
        name: 'missing top-level field',
        expected: /exactly these fields/,
        mutate(analysis) { delete analysis.outputs; },
      },
      {
        name: 'wrong schema version',
        expected: /schema_version/,
        mutate(analysis) { analysis.schema_version = 2; },
      },
      {
        name: 'inconsistent source provenance',
        expected: /GitHub|source|identity|provider/,
        mutate(analysis) { analysis.source.provider = 'local-directory'; },
      },
      {
        name: 'noncanonical entry order',
        expected: /canonical path order|manifest/,
        mutate(analysis) { analysis.entries.reverse(); },
      },
      {
        name: 'manifest hash mismatch',
        expected: /manifest_sha256/,
        mutate(analysis) { analysis.manifest_sha256 = '0'.repeat(64); },
      },
      {
        name: 'duplicate group root and identity',
        expected: /unique entrypoints|repeat artifact root/,
        mutate(analysis) { analysis.groups.push({ ...analysis.groups[0] }); },
      },
      {
        name: 'missing required skill transform',
        expected: /rewrite-skill-name/,
        mutate(analysis) { analysis.outputs.find((output) => output.source_path.endsWith('SKILL.md')).transform_ids = []; },
      },
      {
        name: 'illegal destination state',
        expected: /destination_state|missing or regular-file/,
        mutate(analysis) { analysis.outputs[0].destination_state = { type: 'directory' }; },
      },
      {
        name: 'wrong static decision',
        expected: /static_decision/,
        mutate(analysis) { analysis.static_decision = 'warned'; },
      },
      {
        name: 'nonordinal batch ID',
        expected: /batch ID/,
        mutate(analysis) { analysis.review_batches[0].batch_id = 'batch-002'; },
      },
      {
        name: 'changed batch content',
        expected: /content does not match entry/,
        mutate(analysis) {
          const file = analysis.review_batches[0].files[0];
          file.content = `!${file.content.slice(1)}`;
        },
      },
      {
        name: 'analysis hash mismatch',
        expected: /analysis_sha256/,
        mutate(analysis) { analysis.analysis_sha256 = 'f'.repeat(64); },
      },
      {
        name: 'sparse schema array',
        expected: /dense/,
        mutate(analysis) { analysis.review_batches = new Array(1); },
      },
      {
        name: 'negative zero integer',
        expected: /negative zero|safe integer|canonical JSON number/,
        mutate(analysis) {
          const directory = analysis.entries.find((entry) => entry.entry_type === 'directory');
          directory.byte_count = -0;
        },
      },
      {
        name: 'nonfinite integer',
        expected: /safe integer|byte_count/,
        mutate(analysis) { analysis.entries[0].byte_count = Number.POSITIVE_INFINITY; },
      },
      {
        name: 'unpaired surrogate',
        expected: /unpaired surrogate/,
        mutate(analysis) { analysis.source.input = '\ud800'; },
      },
      {
        name: 'undefined schema value',
        expected: /string|transform ID/,
        mutate(analysis) { analysis.outputs[0].transform_ids[0] = undefined; },
      },
    ];

    for (const fixtureCase of cases) {
      await t.test(fixtureCase.name, () => {
        const malformed = structuredClone(base);
        fixtureCase.mutate(malformed);
        assert.throws(() => validateDirectoryAnalysisStructure(malformed), fixtureCase.expected);
      });
    }

    await t.test('rejects symbol fields without treating them as JSON', () => {
      const malformed = structuredClone(base);
      malformed[Symbol('extra')] = true;
      assert.throws(() => validateDirectoryAnalysisStructure(malformed), /exactly these fields/);
    });

    await t.test('rejects accessors without invoking them', () => {
      const malformed = structuredClone(base);
      let getterCalls = 0;
      Object.defineProperty(malformed, 'kind', {
        enumerable: true,
        configurable: true,
        get() {
          getterCalls += 1;
          return 'dude-directory-import-analysis';
        },
      });
      assert.throws(() => validateDirectoryAnalysisStructure(malformed), /data property/);
      assert.equal(getterCalls, 0);
    });

    await t.test('rejects oversized arrays before own-key or element traversal', () => {
      const malformed = structuredClone(base);
      let ownKeyCalls = 0;
      let elementReads = 0;
      const oversizedEntries = new Proxy(
        Array.from({ length: DIRECTORY_SOURCE_LIMITS.max_entries + 1 }, () => null),
        {
          ownKeys() {
            ownKeyCalls += 1;
            throw new Error('must not enumerate oversized entries');
          },
          get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) elementReads += 1;
            return Reflect.get(target, key, receiver);
          },
        },
      );
      malformed.entries = oversizedEntries;

      assert.throws(
        () => validateDirectoryAnalysisStructure(malformed),
        /maximum length of 256/,
      );
      assert.equal(ownKeyCalls, 0);
      assert.equal(elementReads, 0);
    });

    await t.test('rejects oversized sparse arrays before element getters', () => {
      const malformed = structuredClone(base);
      let getterCalls = 0;
      const oversizedOutputs = new Array(4_161);
      Object.defineProperty(oversizedOutputs, '0', {
        enumerable: true,
        get() {
          getterCalls += 1;
          return null;
        },
      });
      malformed.outputs = oversizedOutputs;

      assert.throws(
        () => validateDirectoryAnalysisStructure(malformed),
        /maximum length of 4160/,
      );
      assert.equal(getterCalls, 0);
    });

    await t.test('accepts raw-string key reordering with the same canonical hash', () => {
      /** @param {any} value */
      function reverseObjectInsertion(value) {
        if (Array.isArray(value)) return value.map(reverseObjectInsertion);
        if (value === null || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).reverse().map(([key, nested]) => (
          [key, reverseObjectInsertion(nested)]
        )));
      }
      const reordered = reverseObjectInsertion(base);
      assert.notDeepEqual(Object.keys(reordered), Object.keys(base));
      assert.equal(reordered.analysis_sha256, base.analysis_sha256);
      assert.equal(validateDirectoryAnalysisStructure(reordered), true);
    });
  });
});

test('diagnostic validation freezes codes and rejects order, identity, and reference drift', async (t) => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'README.md': 'ordinary unowned text\n',
      'bad/SKILL.md': '---\nname: bad\n---\nMissing description\n',
      'missing/review.agent.md': agentDocument({ body: 'No boundary here.' }),
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    assert.ok(analysis.blocking_diagnostics.length >= 3);
    assert.equal(validateDirectoryAnalysisStructure(analysis), true);

    const unknownCode = structuredClone(analysis);
    unknownCode.blocking_diagnostics[0].code = 'future-unapproved-code';
    assert.throws(() => validateDirectoryAnalysisStructure(unknownCode), /unknown.*diagnostic code/);

    const reversed = structuredClone(analysis);
    [reversed.blocking_diagnostics[0], reversed.blocking_diagnostics[1]] = [
      reversed.blocking_diagnostics[1],
      reversed.blocking_diagnostics[0],
    ];
    assert.throws(() => validateDirectoryAnalysisStructure(reversed), /strictly sorted/);

    const duplicate = structuredClone(analysis);
    duplicate.blocking_diagnostics.splice(1, 0, {
      ...duplicate.blocking_diagnostics[0],
      related_paths: [...duplicate.blocking_diagnostics[0].related_paths],
    });
    assert.throws(() => validateDirectoryAnalysisStructure(duplicate), /duplicate.*identity/);

    const conflicting = structuredClone(analysis);
    conflicting.blocking_diagnostics.splice(1, 0, {
      ...conflicting.blocking_diagnostics[0],
      related_paths: [...conflicting.blocking_diagnostics[0].related_paths],
      message: `${conflicting.blocking_diagnostics[0].message} conflict`,
    });
    assert.throws(() => validateDirectoryAnalysisStructure(conflicting), /duplicate.*identity/);

    const unknownReference = structuredClone(analysis);
    const ownership = unknownReference.blocking_diagnostics.find((item) => (
      item.code === 'ownership-unowned'
    ));
    ownership.path = 'missing/source.txt';
    assert.throws(() => validateDirectoryAnalysisStructure(unknownReference), /inconsistent source references/);
  });

  await t.test('accepts source-entry-unsupported only when bound to an unsupported entry', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
      const manifest = createCanonicalEntryManifest([
        ...fixture.sourceAnalysis.entries,
        {
          path: 'artifact/link',
          entry_type: 'symbolic-link',
          byte_count: 0,
          sha256: null,
          content_class: 'none',
        },
      ]);
      fixture.sourceAnalysis.entries = manifest.entries;
      fixture.sourceAnalysis.manifest_sha256 = manifest.manifest_sha256;
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.ok(analysis.blocking_diagnostics.some((item) => (
        item.code === 'source-entry-unsupported' && item.path === 'artifact/link'
      )));
      assert.equal(validateDirectoryAnalysisStructure(analysis), true);
    });
  });

  await t.test('accepts all six planning conflict codes only for omitted destinations', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'one' }),
        'two/SKILL.md': skillDocument({ name: 'two' }),
      });
      const base = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinations = base.outputs.map((output) => output.destination_path);
      assert.equal(destinations.length, 2);
      const cases = [
        { code: 'source-output-overlap', path: destinations[0], related: [], omitted: [destinations[0]] },
        { code: 'source-output-alias', path: destinations[0], related: [], omitted: [destinations[0]] },
        {
          code: 'source-destination-file-identity',
          path: 'one/SKILL.md',
          related: [destinations[0]],
          omitted: [destinations[0]],
        },
        { code: 'output-output-overlap', path: null, related: destinations, omitted: destinations },
        { code: 'output-output-alias', path: null, related: destinations, omitted: destinations },
        {
          code: 'output-output-file-identity',
          path: null,
          related: destinations,
          omitted: destinations,
        },
      ];

      for (const fixtureCase of cases) {
        const analysis = structuredClone(base);
        analysis.outputs = analysis.outputs.filter((output) => (
          !fixtureCase.omitted.includes(output.destination_path)
        ));
        analysis.blocking_diagnostics = [{
          code: fixtureCase.code,
          path: fixtureCase.path,
          related_paths: [...fixtureCase.related],
          message: 'Planning conflict blocks this output.',
          guidance: 'Resolve the conflicting paths and analyze again.',
        }];
        analysis.static_decision = 'blocked';
        rehashAnalysis(analysis);
        assert.equal(validateDirectoryAnalysisStructure(analysis), true, fixtureCase.code);

        const inconsistent = structuredClone(analysis);
        const restored = base.outputs.find((output) => (
          output.destination_path === fixtureCase.omitted[0]
        ));
        assert.ok(restored);
        inconsistent.outputs.push(structuredClone(restored));
        inconsistent.outputs.sort((left, right) => (
          compareRaw(left.destination_path, right.destination_path)
        ));
        rehashAnalysis(inconsistent);
        assert.throws(
          () => validateDirectoryAnalysisStructure(inconsistent),
          /inconsistent output references|inconsistent path references/,
          fixtureCase.code,
        );
      }
    });
  });
});

test('analysis validation binds exact static findings to canonical source files and order', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
      'artifact/support.txt': 'eval(command)\nfetch("https://example.test")\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    assert.ok(analysis.static_findings.length >= 2);

    const unknownField = structuredClone(analysis);
    unknownField.static_findings[0].extra = true;
    assert.throws(() => validateDirectoryAnalysisStructure(unknownField), /exactly these fields/);

    const wrongMetadata = structuredClone(analysis);
    wrongMetadata.static_findings[0].category = 'network-exfiltration';
    assert.throws(() => validateDirectoryAnalysisStructure(wrongMetadata), /published rule/);

    const unknownPath = structuredClone(analysis);
    unknownPath.static_findings[0].path = 'artifact/missing.txt';
    assert.throws(
      () => validateDirectoryAnalysisStructure(unknownPath),
      /strictly sorted|unknown file/,
    );

    const reversed = structuredClone(analysis);
    reversed.static_findings.reverse();
    assert.throws(() => validateDirectoryAnalysisStructure(reversed), /strictly sorted/);
  });
});

test('directory review validation is exact, stale-safe, ordered, and batch-bound', async (t) => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
      ...Object.fromEntries(Array.from(
        { length: 16 },
        (_, index) => [`artifact/file-${String(index).padStart(2, '0')}.txt`, ''],
      )),
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    assert.deepEqual(analysis.review_batches.map((batch) => batch.batch_id), [
      'batch-001',
      'batch-002',
    ]);
    const warnFinding = advisoryFinding(analysis);
    const infoFinding = advisoryFinding(analysis, {
      severity: 'info',
      category: 'dynamic-unsafe-execution',
      evidence: 'informational evidence',
      explanation: 'Informational explanation.',
    });
    const exact = reviewFixture(analysis, [warnFinding, infoFinding]);

    assert.equal(validateDirectoryReview(exact, analysis), true);
    assert.throws(() => validateDirectoryReview(null, analysis), /plain object/);

    const cases = [
      {
        name: 'unknown field',
        expected: /exactly these fields/,
        mutate(review) { review.extra = true; },
      },
      {
        name: 'stale digest',
        expected: /stale|does not match/,
        mutate(review) { review.analysis_sha256 = 'f'.repeat(64); },
      },
      {
        name: 'reversed reviewed IDs',
        expected: /sorted/,
        mutate(review) { review.reviewed_batch_ids.reverse(); },
      },
      {
        name: 'duplicate reviewed ID',
        expected: /unique|sorted/,
        mutate(review) { review.reviewed_batch_ids = ['batch-001', 'batch-001']; },
      },
      {
        name: 'unknown reviewed ID',
        expected: /unknown batch ID/,
        mutate(review) { review.reviewed_batch_ids = ['batch-003']; review.findings = []; },
      },
      {
        name: 'unreviewed finding batch',
        expected: /unreviewed batch/,
        mutate(review) { review.reviewed_batch_ids = ['batch-002']; },
      },
      {
        name: 'path outside exact batch',
        expected: /exact reviewed batch/,
        mutate(review) { review.findings[0].path = analysis.review_batches[1].files[0].path; },
      },
      {
        name: 'invalid category',
        expected: /risk category/,
        mutate(review) { review.findings[0].category = 'future-category'; },
      },
      {
        name: 'blocking severity',
        expected: /info or warn/,
        mutate(review) { review.findings[0].severity = 'block'; },
      },
      {
        name: 'empty evidence',
        expected: /evidence must not be empty/,
        mutate(review) { review.findings[0].evidence = ''; },
      },
      {
        name: 'empty explanation',
        expected: /explanation must not be empty/,
        mutate(review) { review.findings[0].explanation = ''; },
      },
      {
        name: 'unpaired Unicode evidence',
        expected: /unpaired surrogate/,
        mutate(review) { review.findings[0].evidence = '\ud800'; },
      },
      {
        name: 'reversed finding order',
        expected: /canonical order/,
        mutate(review) { review.findings.reverse(); },
      },
      {
        name: 'duplicate complete finding tuple',
        expected: /duplicate complete tuple|canonical order/,
        mutate(review) { review.findings = [review.findings[0], { ...review.findings[0] }]; },
      },
    ];

    for (const fixtureCase of cases) {
      await t.test(fixtureCase.name, () => {
        const malformed = structuredClone(exact);
        fixtureCase.mutate(malformed);
        assert.throws(() => validateDirectoryReview(malformed, analysis), fixtureCase.expected);
      });
    }
  });
});

test('T006 structured review canonical JSON ceiling is exact and precedes source acquisition', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const exact = reviewFixture(analysis, [advisoryFinding(analysis)]);
    padCanonicalJsonString(
      exact,
      exact.findings[0],
      'explanation',
      OPTIONAL_REVIEW_CANONICAL_JSON_MAX_BYTES,
      'é',
    );
    const exactJson = canonicalJson(exact);

    assert.equal(Buffer.byteLength(exactJson, 'utf8'), OPTIONAL_REVIEW_CANONICAL_JSON_MAX_BYTES);
    assert.equal(exactJson.length, OPTIONAL_REVIEW_CANONICAL_JSON_MAX_BYTES - 1);
    assert.equal(validateDirectoryReview(exact, analysis), true);
    const exactPlan = await planDirectoryArtifacts(
      analysis,
      exact,
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    assert.ok(canonicalJsonByteLength(exactPlan) < REVIEWED_PLAN_CANONICAL_JSON_MAX_BYTES);
    assert.equal(validateDirectoryPlanStructure(exactPlan), true);

    const over = structuredClone(exact);
    over.findings[0].explanation += 'x';
    assert.equal(canonicalJsonByteLength(over), OPTIONAL_REVIEW_CANONICAL_JSON_MAX_BYTES + 1);
    assert.throws(
      () => validateDirectoryReview(over, analysis),
      /directory review canonical JSON exceeds 1048576 UTF-8 bytes/,
    );

    fixture.state.events.length = 0;
    fixture.state.revalidateCalls = 0;
    await assertNoFilesystemMutation(workspaceRoot, async () => {
      await assert.rejects(
        planDirectoryArtifacts(
          analysis,
          over,
          fixture.sourceAnalysis,
          workspaceRoot,
        ),
        /directory review canonical JSON exceeds 1048576 UTF-8 bytes/,
      );
    });
    assert.deepEqual(fixture.state.events, []);
    assert.equal(fixture.state.revalidateCalls, 0);
  });
});

test('planning emits one exact frozen plan and treats null like explicit empty review', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'planned-skill' }),
      'artifact/support.txt': 'ordinary support\n',
    });
    const destinations = [
      '.github/skills/dude-local-planned-skill/SKILL.md',
      '.github/skills/dude-local-planned-skill/support.txt',
    ];
    for (const destinationPath of destinations) {
      writeWorkspaceFile(workspaceRoot, destinationPath, `existing ${destinationPath}\n`);
    }
    const before = snapshotWorkspace(workspaceRoot);
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const callsBeforePlanning = fixture.state.revalidateCalls;

    const noReview = await planDirectoryArtifacts(
      analysis,
      null,
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    assert.equal(fixture.state.revalidateCalls, callsBeforePlanning + 1);
    const explicitEmpty = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis, [], []),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    assert.deepEqual(explicitEmpty, noReview);
    assert.equal(noReview.decision, 'warned');
    assert.deepEqual(noReview.reviewed_batch_ids, []);
    assert.deepEqual(noReview.advisory_findings, []);

    const exactReview = reviewFixture(analysis);
    const cleanPlan = await planDirectoryArtifacts(
      analysis,
      exactReview,
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    assert.deepEqual(Object.keys(cleanPlan), PLAN_FIELDS);
    assert.equal(cleanPlan.schema_version, 1);
    assert.equal(cleanPlan.kind, 'dude-directory-import-plan');
    assert.equal(cleanPlan.decision, 'clean');
    assert.deepEqual(cleanPlan.replace_paths, destinations);
    assert.deepEqual(cleanPlan.source, analysis.source);
    assert.deepEqual(cleanPlan.groups, analysis.groups);
    assert.deepEqual(cleanPlan.outputs, analysis.outputs);
    assert.deepEqual(cleanPlan.static_findings, analysis.static_findings);
    assert.notStrictEqual(cleanPlan.source, analysis.source);
    assert.notStrictEqual(cleanPlan.outputs, analysis.outputs);
    assert.notStrictEqual(cleanPlan.reviewed_batch_ids, exactReview.reviewed_batch_ids);
    assertDeepFrozen(cleanPlan);
    assertContainsNoFunctions(cleanPlan);
    assert.equal(validateDirectoryPlanStructure(cleanPlan), true);
    assert.equal(
      cleanPlan.plan_sha256,
      sha256(Buffer.from(canonicalJson(Object.fromEntries(
        PLAN_FIELDS.slice(0, -1).map((field) => [field, cleanPlan[field]]),
      )))),
    );
    assert.equal(
      cleanPlan.plan_sha256,
      'bfb4dbebb96414dc917274e8d5e02ae685896d4a4df3f48b66741c674939375b',
    );
    assert.equal('entries' in cleanPlan, false);
    assert.equal('review_batches' in cleanPlan, false);
    assert.equal('blocking_diagnostics' in cleanPlan, false);
    assert.equal('confirmation' in cleanPlan, false);
    assert.equal('transaction_parent' in cleanPlan, false);
    assert.equal(renderDirectoryPlanConfirmation(cleanPlan), 'confirm-import');
    assert.equal(
      renderDirectoryPlanConfirmation(noReview),
      `confirm-warned-import:${noReview.plan_sha256}`,
    );
    assert.equal(renderDirectoryPlanConfirmation(noReview).includes('\n'), false);

    exactReview.reviewed_batch_ids.length = 0;
    assert.notDeepEqual(cleanPlan.reviewed_batch_ids, exactReview.reviewed_batch_ids);
    const freshContext = await deriveDirectoryAnalysisContext(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const callsBeforeValidation = fixture.state.revalidateCalls;
    assert.equal(validateDirectoryPlan(cleanPlan, freshContext), true);
    assert.equal(
      fixture.state.revalidateCalls,
      callsBeforeValidation,
      'authoritative plan validation reuses one supplied fresh context',
    );
    assert.throws(
      () => validateDirectoryPlan(cleanPlan, { analysis }),
      /freshly derived context/,
    );
    await assert.rejects(
      planDirectoryArtifacts(analysis, undefined, fixture.sourceAnalysis, workspaceRoot),
      /plain object/,
    );
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
    assert.equal(planDirectoryArtifacts.length, 4);
    assert.equal(validateDirectoryReview.length, 2);
    assert.equal(validateDirectoryPlanStructure.length, 1);
    assert.equal(validateDirectoryPlan.length, 2);
    assert.equal(renderDirectoryPlanConfirmation.length, 1);
  });
});

test('planning decisions preserve every static, advisory, coverage, and opaque warning', async (t) => {
  const cases = [
    {
      name: 'static warning cannot be downgraded by advisory info',
      files: {
        'artifact/SKILL.md': skillDocument(),
        'artifact/support.txt': 'eval(command)\n',
      },
      makeReview(analysis) {
        return reviewFixture(analysis, [advisoryFinding(analysis, { severity: 'info' })]);
      },
      decision: 'warned',
    },
    {
      name: 'advisory warning warns an otherwise clean reviewed import',
      files: { 'artifact/SKILL.md': skillDocument() },
      makeReview(analysis) {
        return reviewFixture(analysis, [advisoryFinding(analysis)]);
      },
      decision: 'warned',
    },
    {
      name: 'advisory info does not warn',
      files: { 'artifact/SKILL.md': skillDocument() },
      makeReview(analysis) {
        return reviewFixture(analysis, [advisoryFinding(analysis, { severity: 'info' })]);
      },
      decision: 'clean',
    },
    {
      name: 'an omitted generated batch warns',
      files: { 'artifact/SKILL.md': skillDocument() },
      makeReview(analysis) { return reviewFixture(analysis, [], []); },
      decision: 'warned',
    },
    {
      name: 'over-budget strict text warns despite full generated-batch coverage',
      files: {
        'artifact/SKILL.md': skillDocument(),
        'artifact/over.txt': safeTextWithByteCount(262_145),
      },
      makeReview(analysis) { return reviewFixture(analysis); },
      decision: 'warned',
    },
    {
      name: 'opaque regular content warns',
      files: {
        'artifact/SKILL.md': skillDocument(),
        'artifact/opaque.bin': Buffer.from([0xff, 0, 1]),
      },
      makeReview(analysis) { return reviewFixture(analysis); },
      decision: 'warned',
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture(fixtureCase.files);
        const analysis = await analyzePublicDirectoryArtifacts(
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        const plan = await planDirectoryArtifacts(
          analysis,
          fixtureCase.makeReview(analysis),
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        assert.equal(plan.decision, fixtureCase.decision);
      });
    });
  }
});

test('blocked analysis uses exact typed refusal data and planning never writes', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
      'artifact/danger.txt': 'rm -rf /workspace\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    assert.equal(analysis.static_decision, 'blocked');
    const before = snapshotWorkspace(workspaceRoot);

    await assert.rejects(
      planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
      (error) => {
        assert.ok(error instanceof DirectoryPlanningRefusal);
        assert.deepEqual(Object.keys(error), ['code', 'source_path', 'destination_paths']);
        assert.equal(error.code, 'analysis-blocked');
        assert.equal(error.source_path, null);
        assert.deepEqual(error.destination_paths, []);
        assert.equal(Object.isFrozen(error.destination_paths), true);
        assert.equal(Object.prototype.propertyIsEnumerable.call(error, 'message'), false);
        return true;
      },
    );
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
  });
});

test('planning calls no filesystem mutation API on success or refusal', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const cleanFixture = sourceFixture({ 'clean/SKILL.md': skillDocument({ name: 'clean-plan' }) });
    const blockedFixture = sourceFixture({
      'blocked/SKILL.md': skillDocument({ name: 'blocked-plan' }),
      'blocked/danger.txt': 'rm -rf /workspace\n',
    });
    const cleanAnalysis = await analyzePublicDirectoryArtifacts(
      cleanFixture.sourceAnalysis,
      workspaceRoot,
    );
    const blockedAnalysis = await analyzePublicDirectoryArtifacts(
      blockedFixture.sourceAnalysis,
      workspaceRoot,
    );
    const before = snapshotWorkspace(workspaceRoot);
    const mutationCalls = [];
    const mutationNames = [
      'appendFileSync',
      'chmodSync',
      'copyFileSync',
      'linkSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'symlinkSync',
      'truncateSync',
      'unlinkSync',
      'writeFileSync',
    ];
    const originals = new Map();
    for (const name of mutationNames) {
      originals.set(name, fs[name]);
      fs[name] = (...args) => {
        mutationCalls.push({ name, args });
        throw new Error(`unexpected planning mutation through fs.${name}`);
      };
    }

    let cleanPlan;
    try {
      cleanPlan = await planDirectoryArtifacts(
        cleanAnalysis,
        reviewFixture(cleanAnalysis),
        cleanFixture.sourceAnalysis,
        workspaceRoot,
      );
      await assert.rejects(
        planDirectoryArtifacts(
          blockedAnalysis,
          null,
          blockedFixture.sourceAnalysis,
          workspaceRoot,
        ),
        (error) => assertPlanningRefusal(error, 'analysis-blocked', null, []),
      );
    } finally {
      for (const [name, original] of originals) fs[name] = original;
    }

    assert.equal(cleanPlan.decision, 'clean');
    assert.deepEqual(mutationCalls, []);
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
  });
});

test('planning and authoritative validation reject fresh source and destination drift', async (t) => {
  await t.test('fresh source drift', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const changed = Buffer.from(skillDocument({ body: 'Changed after analysis.' }));
      fixture.bytesByPath.set('artifact/SKILL.md', changed);
      replaceCanonicalEntry(fixture, 'artifact/SKILL.md', {
        byte_count: changed.length,
        sha256: sha256(changed),
        content_class: 'text',
      });

      await assert.rejects(
        planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
        /does not exactly match/,
      );
    });
  });

  await t.test('fresh destination drift', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-sample/SKILL.md',
        'destination appeared\n',
      );

      await assert.rejects(
        planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
        /does not exactly match/,
      );
    });
  });

  await t.test('authoritative validation rejects a stale accepted plan', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-sample/SKILL.md',
        'destination drift\n',
      );
      const freshContext = await deriveDirectoryAnalysisContext(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      assert.throws(
        () => validateDirectoryPlan(plan, freshContext),
        /freshly derived analysis context|exactly match/,
      );
    });
  });
});

test('planning rejects a relative local source root after cwd changes', { concurrency: false }, async () => {
  const originalCwd = process.cwd();
  const temporaryRoot = fs.mkdtempSync(path.join(
    fs.realpathSync(os.tmpdir()),
    'dude-relative-plan-source-',
  ));
  const sourceParent = path.join(temporaryRoot, 'source-parent');
  const sourceRoot = path.join(sourceParent, 'relative-source');
  const shiftedCwd = path.join(temporaryRoot, 'shifted-cwd');
  const workspaceRoot = path.join(temporaryRoot, 'workspace');
  fs.mkdirSync(shiftedCwd, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument());

  try {
    process.chdir(sourceParent);
    const sourceAnalysis = await analyzeLocalDirectory('relative-source');
    const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
    const before = snapshotWorkspace(workspaceRoot);
    let emittedPlan = null;

    process.chdir(shiftedCwd);
    await assert.rejects(
      planDirectoryArtifacts(analysis, null, sourceAnalysis, workspaceRoot).then((plan) => {
        emittedPlan = plan;
        return plan;
      }),
      /local directory source root changed during planning fact capture/,
    );

    assert.equal(emittedPlan, null);
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('rehashable compact-plan substitutions need authoritative context to reject', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
      'artifact/support.txt': 'ordinary support\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const context = await deriveDirectoryAnalysisContext(fixture.sourceAnalysis, workspaceRoot);

    const omittedOutput = structuredClone(plan);
    omittedOutput.outputs = omittedOutput.outputs.filter((output) => (
      output.source_path !== 'artifact/support.txt'
    ));
    rehashPlan(omittedOutput);
    assert.equal(validateDirectoryPlanStructure(omittedOutput), true);
    assert.throws(() => validateDirectoryPlan(omittedOutput, context), /exactly match/);

    const substitutedHash = structuredClone(plan);
    substitutedHash.outputs.find((output) => output.source_path === 'artifact/support.txt')
      .output_sha256 = 'f'.repeat(64);
    rehashPlan(substitutedHash);
    assert.equal(validateDirectoryPlanStructure(substitutedHash), true);
    assert.throws(() => validateDirectoryPlan(substitutedHash, context), /exactly match/);

    const malformed = structuredClone(plan);
    malformed.extra = true;
    assert.throws(() => validateDirectoryPlanStructure(malformed), /exactly these fields/);
  });
});

test('plan structure rejects an incomplete shared-notice mapping even after rehashing', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      LICENSE: 'shared license\n',
      'one/SKILL.md': skillDocument({ name: 'one' }),
      'two/SKILL.md': skillDocument({ name: 'two' }),
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const omittedNotice = structuredClone(plan);
    const noticeOutputs = omittedNotice.outputs.filter((output) => output.source_path === 'LICENSE');
    assert.equal(noticeOutputs.length, 2);
    omittedNotice.outputs = omittedNotice.outputs.filter((output) => (
      output.destination_path !== noticeOutputs[0].destination_path
    ));
    rehashPlan(omittedNotice);

    assert.throws(
      () => validateDirectoryPlanStructure(omittedNotice),
      /shared notice must map to every artifact group/,
    );
  });
});

test('plan structure uses component prefixes for adversarial order and the full output bound', async (t) => {
  await t.test('rejects a, a-aux, a/file even when the sibling sorts between the overlap', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument(),
        'artifact/a': 'a\n',
        'artifact/a-aux': 'a aux\n',
        'artifact/placeholder': 'placeholder\n',
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const adversarial = structuredClone(plan);
      const nested = adversarial.outputs.find((output) => (
        output.source_path === 'artifact/placeholder'
      ));
      assert.ok(nested);
      nested.source_path = 'artifact/a/file';
      nested.destination_path = nested.destination_path.replace(/\/placeholder$/, '/a/file');
      adversarial.outputs.sort((left, right) => (
        compareRaw(left.destination_path, right.destination_path)
      ));
      rehashPlan(adversarial);

      assert.throws(
        () => validateDirectoryPlanStructure(adversarial),
        /outputs must not overlap lexically or by case/,
      );
    });
  });

  await t.test('accepts one structurally valid plan at the 4160-output maximum', () => {
    const groupCount = 64;
    const noticeCount = 64;
    const groups = Array.from({ length: groupCount }, (_, index) => ({
      kind: 'skill',
      entrypoint: `group-${String(index).padStart(2, '0')}/SKILL.md`,
    }));
    const notices = Array.from({ length: noticeCount }, (_, index) => (
      `LICENSE.${String(index).padStart(2, '0')}`
    ));
    const outputs = groups.flatMap((group, index) => {
      const destinationRoot = `.github/skills/dude-local-group-${String(index).padStart(2, '0')}`;
      return [
        ...notices.map((sourcePath) => ({
          source_path: sourcePath,
          destination_path: `${destinationRoot}/${sourcePath}`,
          output_sha256: '0'.repeat(64),
          transform_ids: [],
          destination_state: { type: 'missing' },
        })),
        {
          source_path: group.entrypoint,
          destination_path: `${destinationRoot}/SKILL.md`,
          output_sha256: '0'.repeat(64),
          transform_ids: ['rewrite-skill-name'],
          destination_state: { type: 'missing' },
        },
      ];
    }).sort((left, right) => compareRaw(left.destination_path, right.destination_path));
    assert.equal(outputs.length, 4_160);
    const plan = rehashPlan({
      schema_version: 1,
      kind: 'dude-directory-import-plan',
      analysis_sha256: '1'.repeat(64),
      source: {
        provider: 'local-directory',
        input: '/fixture/source',
        identity: { root_path: '/fixture/source' },
      },
      manifest_sha256: '2'.repeat(64),
      groups,
      outputs,
      static_findings: [],
      reviewed_batch_ids: [],
      advisory_findings: [],
      decision: 'clean',
      replace_paths: [],
      plan_sha256: '',
    });

    assert.equal(validateDirectoryPlanStructure(plan), true);
  });
});

test('T010 review and plan collection bounds reject before array traversal', async (t) => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument(),
    });
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const review = reviewFixture(analysis);
    const plan = await planDirectoryArtifacts(
      analysis,
      review,
      fixture.sourceAnalysis,
      workspaceRoot,
    );

    /** @param {number} length */
    function traversalGuardedArray(length) {
      const calls = { ownKeys: 0, elementReads: 0 };
      const value = new Proxy(new Array(length), {
        ownKeys() {
          calls.ownKeys += 1;
          throw new Error('must not enumerate an oversized array');
        },
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) calls.elementReads += 1;
          return Reflect.get(target, key, receiver);
        },
      });
      return { calls, value };
    }

    await t.test('review reviewed_batch_ids rejects 129 entries', () => {
      const oversized = traversalGuardedArray(
        DIRECTORY_SOURCE_LIMITS.max_regular_files + 1,
      );
      const malformed = structuredClone(review);
      malformed.reviewed_batch_ids = oversized.value;

      assert.throws(
        () => validateDirectoryReview(malformed, analysis),
        /maximum length of 128/,
      );
      assert.deepEqual(oversized.calls, { ownKeys: 0, elementReads: 0 });
    });

    await t.test('plan reviewed_batch_ids rejects 129 entries', () => {
      const oversized = traversalGuardedArray(
        DIRECTORY_SOURCE_LIMITS.max_regular_files + 1,
      );
      const malformed = structuredClone(plan);
      malformed.reviewed_batch_ids = oversized.value;

      assert.throws(
        () => validateDirectoryPlanStructure(malformed),
        /maximum length of 128/,
      );
      assert.deepEqual(oversized.calls, { ownKeys: 0, elementReads: 0 });
    });

    await t.test('plan replace_paths rejects 4161 entries', () => {
      const maxAnalysisOutputs = DIRECTORY_SOURCE_LIMITS.max_regular_files
        + Math.floor(((DIRECTORY_SOURCE_LIMITS.max_regular_files - 1) ** 2) / 4);
      const oversized = traversalGuardedArray(maxAnalysisOutputs + 1);
      const malformed = structuredClone(plan);
      malformed.replace_paths = oversized.value;

      assert.throws(
        () => validateDirectoryPlanStructure(malformed),
        /maximum length of 4160/,
      );
      assert.deepEqual(oversized.calls, { ownKeys: 0, elementReads: 0 });
    });
  });
});

test('T010 complete plan canonical JSON ceiling is exact before preflight side effects', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'plan-byte-ceiling' }),
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const review = reviewFixture(analysis, [advisoryFinding(analysis, {
      severity: 'info',
      evidence: 'reviewed evidence',
      explanation: 'reviewed explanation',
    })]);
    const planned = await planDirectoryArtifacts(
      analysis,
      review,
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const exact = structuredClone(planned);
    // The planner cannot receive this advisory padding: the same finding must
    // first fit the 1 MiB review ceiling. Its post-digest public structure gate
    // is therefore the direct construction-path check at the 16 MiB boundary.
    padCanonicalJsonString(
      exact,
      exact.advisory_findings[0],
      'explanation',
      REVIEWED_PLAN_CANONICAL_JSON_MAX_BYTES,
      'reviewed ',
    );
    rehashPlan(exact);

    assert.equal(canonicalJsonByteLength(exact), REVIEWED_PLAN_CANONICAL_JSON_MAX_BYTES);
    assert.equal(validateDirectoryPlanStructure(exact), true);

    const over = structuredClone(exact);
    over.advisory_findings[0].explanation += 'x';
    rehashPlan(over);
    assert.equal(canonicalJsonByteLength(over), REVIEWED_PLAN_CANONICAL_JSON_MAX_BYTES + 1);
    assert.throws(
      () => validateDirectoryPlanStructure(over),
      /directory plan canonical JSON exceeds 16777216 UTF-8 bytes/,
    );

    let coercionCalls = 0;
    const hostileConfirmation = {};
    Object.defineProperties(hostileConfirmation, {
      [Symbol.toPrimitive]: {
        get() {
          coercionCalls += 1;
          throw new Error('confirmation must not inspect Symbol.toPrimitive');
        },
      },
      toString: {
        get() {
          coercionCalls += 1;
          throw new Error('confirmation must not inspect toString');
        },
      },
    });
    fixture.state.events.length = 0;
    fixture.state.revalidateCalls = 0;
    await assertNoFilesystemMutation(workspaceRoot, async () => {
      await assert.rejects(
        preflightDirectoryApply(
          over,
          hostileConfirmation,
          fixture.sourceAnalysis,
          workspaceRoot,
        ),
        /directory plan canonical JSON exceeds 16777216 UTF-8 bytes/,
      );
    });
    assert.equal(coercionCalls, 0);
    assert.deepEqual(fixture.state.events, []);
    assert.equal(fixture.state.revalidateCalls, 0);
  });
});

test('planning refuses local source/output lexical, canonical, case, and file-identity conflicts', async (t) => {
  await t.test('source root lexically contains an output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(workspaceRoot, 'artifact/SKILL.md', skillDocument());
      const sourceAnalysis = await analyzeLocalDirectory(workspaceRoot);
      const context = await deriveDirectoryAnalysisContext(sourceAnalysis, workspaceRoot);
      const analysis = context.analysis;
      const destinationPath = '.github/skills/dude-local-sample/SKILL.md';
      const before = snapshotWorkspace(workspaceRoot);

      assert.equal(analysis.static_decision, 'blocked');
      assert.deepEqual(diagnostic(analysis, 'source-output-overlap', destinationPath), {
        code: 'source-output-overlap',
        path: destinationPath,
        related_paths: [],
        message: 'Local source and output paths overlap.',
        guidance: 'Move the source outside the workspace output path and analyze again.',
      });
      assertNoOutputForSource(analysis, 'artifact/SKILL.md');
      assert.deepEqual(
        destinationFact(context, 'artifact/SKILL.md', destinationPath).state,
        { type: 'missing' },
      );

      await assert.rejects(
        planDirectoryArtifacts(analysis, null, sourceAnalysis, workspaceRoot),
        (error) => assertPlanningRefusal(error, 'analysis-blocked', null, []),
      );
      assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
    });
  });

  await t.test('canonical output path resolves beneath the source root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dude-plan-source-'));
      try {
        writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument());
        const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
        const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
        const destinationPath = '.github/skills/dude-local-sample/SKILL.md';
        const originalRealpathSync = fs.realpathSync;
        fs.realpathSync = (candidatePath, options) => {
          if (path.resolve(String(candidatePath)) === path.resolve(workspaceRoot)) {
            return options === 'buffer' || (options && options.encoding === 'buffer')
              ? Buffer.from(sourceRoot)
              : sourceRoot;
          }
          return originalRealpathSync(candidatePath, options);
        };
        try {
          await assert.rejects(
            planDirectoryArtifacts(analysis, null, sourceAnalysis, workspaceRoot),
            (error) => assertPlanningRefusal(
              error,
              'source-output-alias',
              null,
              [destinationPath],
            ),
          );
        } finally {
          fs.realpathSync = originalRealpathSync;
        }
      } finally {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
      }
    });
  });

  await t.test('case-fold-equivalent source root aliases an output', async (subtest) => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = path.join(
        path.dirname(workspaceRoot),
        path.basename(workspaceRoot).toUpperCase(),
      );
      fs.mkdirSync(sourceRoot, { recursive: true });
      if (fs.realpathSync(sourceRoot) === fs.realpathSync(workspaceRoot)) {
        subtest.skip('filesystem cannot represent case-distinct sibling roots');
        return;
      }
      try {
        writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument());
        const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
        const context = await deriveDirectoryAnalysisContext(sourceAnalysis, workspaceRoot);
        const analysis = context.analysis;
        const destinationPath = '.github/skills/dude-local-sample/SKILL.md';

        assert.equal(analysis.static_decision, 'blocked');
        assert.deepEqual(diagnostic(analysis, 'source-output-alias', destinationPath), {
          code: 'source-output-alias',
          path: destinationPath,
          related_paths: [],
          message: 'Local source and output paths alias through canonical, case-folded, or directory identity facts.',
          guidance: 'Use source and output roots with distinct filesystem identities and analyze again.',
        });
        assertNoOutputForSource(analysis, 'SKILL.md');
        assert.deepEqual(
          destinationFact(context, 'SKILL.md', destinationPath).state,
          { type: 'missing' },
        );

        await assert.rejects(
          planDirectoryArtifacts(analysis, null, sourceAnalysis, workspaceRoot),
          (error) => assertPlanningRefusal(error, 'analysis-blocked', null, []),
        );
      } finally {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
      }
    });
  });

  await t.test('source subdirectory identity aliases a non-deepest output ancestor', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dude-plan-source-'));
      try {
        const sourceDirectory = path.join(sourceRoot, 'artifact');
        writeWorkspaceFile(sourceRoot, 'artifact/SKILL.md', skillDocument());
        const destinationPath = '.github/skills/dude-local-sample/SKILL.md';
        fs.mkdirSync(path.join(workspaceRoot, '.github/skills/dude-local-sample'), {
          recursive: true,
        });
        const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
        const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
        const sourceDirectoryStat = fs.lstatSync(sourceDirectory, { bigint: true });
        const shiftedAncestor = path.join(workspaceRoot, '.github/skills');
        const originalLstatSync = fs.lstatSync;
        fs.lstatSync = (candidatePath, options) => {
          const stat = originalLstatSync(candidatePath, options);
          if (path.resolve(String(candidatePath)) !== path.resolve(shiftedAncestor)) return stat;
          return new Proxy(stat, {
            get(target, key) {
              if (key === 'dev') return sourceDirectoryStat.dev;
              if (key === 'ino') return sourceDirectoryStat.ino;
              const value = Reflect.get(target, key, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        };
        try {
          await assert.rejects(
            planDirectoryArtifacts(analysis, null, sourceAnalysis, workspaceRoot),
            (error) => assertPlanningRefusal(
              error,
              'source-output-alias',
              null,
              [destinationPath],
            ),
          );
        } finally {
          fs.lstatSync = originalLstatSync;
        }
      } finally {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
      }
    });
  });

  await t.test('existing destination identity matches one local source file', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dude-plan-source-'));
      try {
        const sourceFile = writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument());
        const destinationPath = '.github/skills/dude-local-sample/SKILL.md';
        const destinationFile = writeWorkspaceFile(workspaceRoot, destinationPath, 'existing\n');
        const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
        const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
        const sourceStat = fs.lstatSync(sourceFile, { bigint: true });
        const originalLstatSync = fs.lstatSync;
        const originalOpenSync = fs.openSync;
        const originalFstatSync = fs.fstatSync;
        const destinationDescriptors = new Set();
        const withSourceIdentity = (stat) => new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return sourceStat.dev;
            if (key === 'ino') return sourceStat.ino;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        fs.lstatSync = (candidatePath, options) => {
          const stat = originalLstatSync(candidatePath, options);
          return path.resolve(String(candidatePath)) === path.resolve(destinationFile)
            ? withSourceIdentity(stat)
            : stat;
        };
        fs.openSync = (candidatePath, flags, mode) => {
          const descriptor = originalOpenSync(candidatePath, flags, mode);
          if (path.resolve(String(candidatePath)) === path.resolve(destinationFile)) {
            destinationDescriptors.add(descriptor);
          }
          return descriptor;
        };
        fs.fstatSync = (descriptor, options) => {
          const stat = originalFstatSync(descriptor, options);
          return destinationDescriptors.has(descriptor) ? withSourceIdentity(stat) : stat;
        };
        try {
          await assert.rejects(
            planDirectoryArtifacts(analysis, null, sourceAnalysis, workspaceRoot),
            (error) => assertPlanningRefusal(
              error,
              'source-destination-file-identity',
              'SKILL.md',
              [destinationPath],
            ),
          );
        } finally {
          fs.lstatSync = originalLstatSync;
          fs.openSync = originalOpenSync;
          fs.fstatSync = originalFstatSync;
        }
      } finally {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
      }
    });
  });
});

test('planning refuses output/output canonical overlap, anchor aliases, and file identity', async (t) => {
  await t.test('canonical prospective output paths overlap', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'one' }),
        'two/SKILL.md': skillDocument({ name: 'two' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinations = analysis.outputs.map((output) => output.destination_path);
      const originalRealpathSync = fs.realpathSync;
      let captureCalls = 0;
      const canonicalBase = path.join(path.dirname(workspaceRoot), 'canonical-output-root');
      fs.realpathSync = (candidatePath, options) => {
        if (
          path.resolve(String(candidatePath)) === path.resolve(workspaceRoot)
          && new Error().stack?.includes('captureOutputPlanningFact')
        ) {
            const outputIndex = captureCalls;
            captureCalls += 1;
            const value = outputIndex === 0
              ? canonicalBase
              : path.resolve(
                canonicalBase,
                ...destinations[0].split('/'),
              );
            return options === 'buffer' || (options && options.encoding === 'buffer')
              ? Buffer.from(value)
              : value;
        }
        return originalRealpathSync(candidatePath, options);
      };
      try {
        await assert.rejects(
          planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
          (error) => assertPlanningRefusal(
            error,
            'output-output-overlap',
            null,
            destinations,
          ),
        );
      } finally {
        fs.realpathSync = originalRealpathSync;
      }
    });
  });

  await t.test('distinct output anchors and equal tails alias by directory identity', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        LICENSE: 'shared license\n',
        'one/SKILL.md': skillDocument({ name: 'one' }),
        'two/SKILL.md': skillDocument({ name: 'two' }),
      });
      const firstRoot = path.join(workspaceRoot, '.github/skills/dude-local-one');
      const secondRoot = path.join(workspaceRoot, '.github/skills/dude-local-two');
      fs.mkdirSync(firstRoot, { recursive: true });
      fs.mkdirSync(secondRoot, { recursive: true });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const licenseDestinations = analysis.outputs
        .filter((output) => output.source_path === 'LICENSE')
        .map((output) => output.destination_path);
      const firstStat = fs.lstatSync(firstRoot, { bigint: true });
      const originalLstatSync = fs.lstatSync;
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        if (path.resolve(String(candidatePath)) !== path.resolve(secondRoot)) return stat;
        return new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return firstStat.dev;
            if (key === 'ino') return firstStat.ino;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
      try {
        await assert.rejects(
          planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
          (error) => assertPlanningRefusal(
            error,
            'output-output-alias',
            null,
            licenseDestinations,
          ),
        );
      } finally {
        fs.lstatSync = originalLstatSync;
      }
    });
  });

  await t.test('shifted ancestor aliases at different depths with overlapping tails', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'one' }),
        'one/nested/file.txt': 'one support\n',
        'two/SKILL.md': skillDocument({ name: 'two' }),
        'two/prefix/nested/file.txt': 'two support\n',
      });
      const firstRoot = path.join(workspaceRoot, '.github/skills/dude-local-one');
      const shiftedAncestor = path.join(
        workspaceRoot,
        '.github/skills/dude-local-two/prefix',
      );
      fs.mkdirSync(firstRoot, { recursive: true });
      fs.mkdirSync(shiftedAncestor, { recursive: true });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinations = [
        outputForSource(analysis, 'one/nested/file.txt').destination_path,
        outputForSource(analysis, 'two/prefix/nested/file.txt').destination_path,
      ];
      const firstStat = fs.lstatSync(firstRoot, { bigint: true });
      const originalLstatSync = fs.lstatSync;
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        if (path.resolve(String(candidatePath)) !== path.resolve(shiftedAncestor)) return stat;
        return new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return firstStat.dev;
            if (key === 'ino') return firstStat.ino;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
      try {
        await assert.rejects(
          planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
          (error) => assertPlanningRefusal(
            error,
            'output-output-alias',
            null,
            destinations,
          ),
        );
      } finally {
        fs.lstatSync = originalLstatSync;
      }
    });
  });

  await t.test('repeated overlapping projections from one output do not self-refuse', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument(),
        'artifact/repeat/repeat': 'repeated support\n',
      });
      const destinationRoot = path.join(workspaceRoot, '.github/skills/dude-local-sample');
      const repeatedAncestor = path.join(destinationRoot, 'repeat');
      fs.mkdirSync(repeatedAncestor, { recursive: true });
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const rootStat = fs.lstatSync(destinationRoot, { bigint: true });
      const originalLstatSync = fs.lstatSync;
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        if (path.resolve(String(candidatePath)) !== path.resolve(repeatedAncestor)) return stat;
        return new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return rootStat.dev;
            if (key === 'ino') return rootStat.ino;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
      let plan;
      try {
        plan = await planDirectoryArtifacts(
          analysis,
          reviewFixture(analysis),
          fixture.sourceAnalysis,
          workspaceRoot,
        );
      } finally {
        fs.lstatSync = originalLstatSync;
      }
      assert.equal(plan.decision, 'clean');
    });
  });

  await t.test('two existing outputs share one observed regular-file identity', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'one' }),
        'two/SKILL.md': skillDocument({ name: 'two' }),
      });
      const destinations = [
        '.github/skills/dude-local-one/SKILL.md',
        '.github/skills/dude-local-two/SKILL.md',
      ];
      const absoluteDestinations = destinations.map((destinationPath) => (
        writeWorkspaceFile(workspaceRoot, destinationPath, 'same existing bytes\n')
      ));
      const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const firstStat = fs.lstatSync(absoluteDestinations[0], { bigint: true });
      const originalLstatSync = fs.lstatSync;
      const originalOpenSync = fs.openSync;
      const originalFstatSync = fs.fstatSync;
      const secondDescriptors = new Set();
      const withFirstIdentity = (stat) => new Proxy(stat, {
        get(target, key) {
          if (key === 'dev') return firstStat.dev;
          if (key === 'ino') return firstStat.ino;
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        return path.resolve(String(candidatePath)) === path.resolve(absoluteDestinations[1])
          ? withFirstIdentity(stat)
          : stat;
      };
      fs.openSync = (candidatePath, flags, mode) => {
        const descriptor = originalOpenSync(candidatePath, flags, mode);
        if (path.resolve(String(candidatePath)) === path.resolve(absoluteDestinations[1])) {
          secondDescriptors.add(descriptor);
        }
        return descriptor;
      };
      fs.fstatSync = (descriptor, options) => {
        const stat = originalFstatSync(descriptor, options);
        return secondDescriptors.has(descriptor) ? withFirstIdentity(stat) : stat;
      };
      try {
        await assert.rejects(
          planDirectoryArtifacts(analysis, null, fixture.sourceAnalysis, workspaceRoot),
          (error) => assertPlanningRefusal(
            error,
            'output-output-file-identity',
            null,
            destinations,
          ),
        );
      } finally {
        fs.lstatSync = originalLstatSync;
        fs.openSync = originalOpenSync;
        fs.fstatSync = originalFstatSync;
      }
    });
  });
});

test('GitHub provenance has no local source filesystem overlap check', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
    fixture.sourceAnalysis.source = {
      provider: 'github-tree',
      input: 'https://github.com/example/project/tree/main/artifact',
      identity: {
        owner: 'example',
        repository: 'project',
        requested_ref: 'main',
        resolved_commit: 'a'.repeat(40),
        subtree: 'artifact',
        tree_sha: 'b'.repeat(40),
      },
    };
    const analysis = await analyzePublicDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );

    assert.equal(plan.decision, 'clean');
    assert.equal(plan.source.provider, 'github-tree');
  });
});

test('analyzeDirectoryArtifacts validates source-analysis integrity and returns defensive exact output bytes', async (t) => {
  await t.test('pins the two-argument API and complete return shape', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = skillDocument({
        nameLine: 'name:   sample   ',
        separator: '\r\n',
      });
      const fixture = sourceFixture(
        { 'artifact/SKILL.md': source },
        { sharedReadBuffers: true },
      );

      assert.deepEqual(fixture.sourceAnalysis.source, {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/fixture',
        identity: {
          owner: 'example',
          repository: 'project',
          requested_ref: 'main',
          resolved_commit: 'a'.repeat(40),
          subtree: 'fixture',
          tree_sha: 'b'.repeat(40),
        },
      });
      assert.equal(analyzeDirectoryArtifacts.length, 2);
      assert.equal(analyzePublicDirectoryArtifacts.length, 2);
      assert.equal(deriveDirectoryAnalysisContext.length, 2);
      assert.equal(validateDirectoryAnalysisStructure.length, 1);
      assert.equal(validateDirectoryAnalysis.length, 2);
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assertResultContract(result);
      assert.deepEqual(result.groups, [{ kind: 'skill', entrypoint: 'artifact/SKILL.md' }]);
      const output = outputForSource(result, 'artifact/SKILL.md');
      assert.deepEqual(output, {
        source_path: 'artifact/SKILL.md',
        destination_path: '.github/skills/dude-local-sample/SKILL.md',
        output_sha256: sha256(source.replace('sample', 'dude-local-sample')),
        transform_ids: ['rewrite-skill-name'],
        destination_state: { type: 'missing' },
      });
      assert.equal(fixture.state.revalidateCalls, 1);
      assert.equal(fixture.state.events.at(-1), 'revalidate', 'revalidation follows all source reads');

      const expectedOutput = Buffer.from(source.replace('sample', 'dude-local-sample'));
      const first = await result.getOutputBytes(output.destination_path);
      const second = await result.getOutputBytes(output.destination_path);
      assert.ok(Buffer.isBuffer(first));
      assert.ok(Buffer.isBuffer(second));
      assert.notStrictEqual(first, second);
      first.fill(0);
      assert.deepEqual(second, expectedOutput);

      fixture.bytesByPath.get('artifact/SKILL.md')?.fill(0);
      assert.deepEqual(
        await result.getOutputBytes(output.destination_path),
        expectedOutput,
        'output bytes do not alias a provider-owned read buffer',
      );
      await assert.rejects(
        result.getOutputBytes('.github/skills/dude-local-sample/missing.txt'),
        /unknown|missing|output/i,
      );
    });
  });

  await t.test('accepts the exact GitHub provenance shape without provider I/O', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
      /** @type {any} */ (fixture.sourceAnalysis).source = {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/artifact',
        identity: {
          owner: 'example',
          repository: 'project',
          requested_ref: 'main',
          resolved_commit: 'a'.repeat(40),
          subtree: 'artifact',
          tree_sha: 'b'.repeat(40),
        },
      };

      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.equal(outputForSource(result, 'artifact/SKILL.md').destination_path,
        '.github/skills/dude-local-sample/SKILL.md');
    });
  });

  const githubIdentity = {
    owner: 'example',
    repository: 'project',
    requested_ref: 'main',
    resolved_commit: 'a'.repeat(40),
    subtree: 'artifact',
    tree_sha: 'b'.repeat(40),
  };
  const provenanceCases = [
    {
      name: 'unknown provider',
      source: {
        provider: 'archive',
        input: '/fixture/source',
        identity: { root_path: '/fixture/source' },
      },
    },
    {
      name: 'local identity missing root_path',
      source: { provider: 'local-directory', input: '/fixture/source', identity: {} },
    },
    {
      name: 'local identity has an extra field',
      source: {
        provider: 'local-directory',
        input: '/fixture/source',
        identity: { root_path: '/fixture/source', owner: 'example' },
      },
    },
    {
      name: 'GitHub identity missing tree_sha',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/artifact',
        identity: (({ tree_sha, ...identity }) => identity)(githubIdentity),
      },
    },
    {
      name: 'GitHub identity has an extra field',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/main/artifact',
        identity: { ...githubIdentity, root_path: '/fixture/source' },
      },
    },
    {
      name: 'GitHub owner impossible for the provider',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/a%20b/project/tree/main/artifact',
        identity: { ...githubIdentity, owner: 'a b' },
      },
    },
    {
      name: 'GitHub ref impossible for the provider',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/project/tree/./artifact',
        identity: { ...githubIdentity, requested_ref: '.' },
      },
    },
    {
      name: 'GitHub .git repository impossible for the provider',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/project.git/tree/main/artifact',
        identity: { ...githubIdentity, repository: 'project.git' },
      },
    },
    {
      name: 'GitHub dot repository segment impossible for the provider',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/example/./tree/main/artifact',
        identity: { ...githubIdentity, repository: '.' },
      },
    },
    {
      name: 'GitHub noncanonical encoded segment',
      source: {
        provider: 'github-tree',
        input: 'https://github.com/%65xample/project/tree/main/artifact',
        identity: githubIdentity,
      },
    },
    {
      name: 'GitHub subtree request-depth overflow',
      source: {
        provider: 'github-tree',
        input: `https://github.com/example/project/tree/main/${Array.from({ length: 14 }, (_, index) => `s${index}`).join('/')}`,
        identity: {
          ...githubIdentity,
          subtree: Array.from({ length: 14 }, (_, index) => `s${index}`).join('/'),
        },
      },
    },
  ];

  for (const fixtureCase of provenanceCases) {
    await t.test(`rejects ${fixtureCase.name}`, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
        /** @type {any} */ (fixture.sourceAnalysis).source = fixtureCase.source;

        await assert.rejects(
          analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
          /source|provider|provenance|identity|shape|field|integrity/i,
        );
      });
    });
  }

  const integrityCases = [
    {
      name: 'canonical manifest mismatch',
      mutate(fixture) {
        fixture.sourceAnalysis.manifest_sha256 = '0'.repeat(64);
      },
      expected: /manifest|canonical|integrity/i,
    },
    {
      name: 'byte length mismatch',
      mutate(fixture) {
        const entry = fixture.sourceAnalysis.entries.find(({ path: entryPath }) => entryPath === 'artifact/SKILL.md');
        assert.ok(entry);
        replaceCanonicalEntry(fixture, entry.path, { byte_count: entry.byte_count + 1 });
      },
      expected: /byte|length|size|integrity/i,
    },
    {
      name: 'byte hash mismatch',
      mutate(fixture) {
        replaceCanonicalEntry(fixture, 'artifact/SKILL.md', { sha256: 'f'.repeat(64) });
      },
      expected: /hash|sha-?256|integrity/i,
    },
    {
      name: 'text classification mismatch',
      mutate(fixture) {
        replaceCanonicalEntry(fixture, 'artifact/SKILL.md', { content_class: 'opaque' });
      },
      expected: /class|text|opaque|integrity/i,
    },
  ];

  for (const fixtureCase of integrityCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ 'artifact/SKILL.md': skillDocument() });
        fixtureCase.mutate(fixture);

        await assert.rejects(
          analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
          fixtureCase.expected,
        );
      });
    });
  }

  await t.test('propagates source revalidation failure instead of returning stale facts', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture(
        { 'artifact/SKILL.md': skillDocument() },
        { revalidateError: new Error('fixture source changed') },
      );

      await assert.rejects(
        analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
        /source changed/i,
      );
      assert.equal(fixture.state.revalidateCalls, 1);
    });
  });
});

test('strict entrypoints require exact filenames, scalar identity fields, and no adaptation keys', async (t) => {
  const nonEntrypoints = [
    'artifact/skill.md',
    'artifact/SKILL.MD',
    'artifact/reviewer.agent.mdx',
    'artifact/reviewer.AGENT.md',
  ];
  for (const relativePath of nonEntrypoints) {
    await t.test(`does not broaden entrypoint matching for ${relativePath}`, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ [relativePath]: skillDocument() });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assert.deepEqual(result.groups, []);
        assert.deepEqual(result.outputs, []);
        diagnostic(result, 'ownership-unowned', relativePath);
      });
    });
  }

  const rejectedEntrypoints = [
    {
      name: 'missing frontmatter',
      bytes: '# Body only\n',
      code: 'entrypoint-frontmatter-invalid',
    },
    {
      name: 'malformed frontmatter',
      bytes: '--- \nname: sample\ndescription: malformed\n---\n',
      code: 'entrypoint-frontmatter-invalid',
    },
    {
      name: 'missing name',
      bytes: '---\ndescription: present\n---\nBody\n',
      code: 'entrypoint-required-field-invalid',
    },
    {
      name: 'sequence name',
      bytes: '---\nname: [sample]\ndescription: present\n---\nBody\n',
      code: 'entrypoint-required-field-invalid',
    },
    {
      name: 'missing description',
      bytes: '---\nname: sample\n---\nBody\n',
      code: 'entrypoint-required-field-invalid',
    },
    {
      name: 'invalid skill name',
      bytes: skillDocument({ name: 'Not-Canonical' }),
      code: 'skill-name-invalid',
    },
    {
      name: 'opaque entrypoint',
      bytes: Buffer.from([0xff, 0x00, 0x2d, 0x2d, 0x2d]),
      code: 'entrypoint-frontmatter-invalid',
    },
  ];
  for (const fixtureCase of rejectedEntrypoints) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({ 'artifact/SKILL.md': fixtureCase.bytes });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assert.deepEqual(result.groups, []);
        assertNoOutputForSource(result, 'artifact/SKILL.md');
        const record = diagnostic(result, fixtureCase.code, 'artifact/SKILL.md');
        assert.deepEqual(record.related_paths, []);
        assert.match(record.guidance, CLEAN_SOURCE_GUIDANCE);
      });
    });
  }

  const adaptationEntries = [
    ['compatibility', 'compatibility: ">=1"'],
    ['model', 'model: gpt-4'],
    ['tools', 'tools: [Read]'],
    ['license', 'license: MIT'],
  ];
  for (const [key, entry] of adaptationEntries) {
    await t.test(`blocks exact adaptation key ${key}`, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument({ extra: [entry] }),
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        const record = diagnostic(result, 'entrypoint-adaptation-required', 'artifact/SKILL.md');
        assert.deepEqual(record.related_paths, []);
        assert.match(record.guidance, CLEAN_SOURCE_GUIDANCE);
        assertNoOutputForSource(result, 'artifact/SKILL.md');
      });
    });
  }

  await t.test('does not invent a frontmatter allowlist', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ extra: ['owner: platform-team'] }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      assert.equal(outputForSource(result, 'artifact/SKILL.md').transform_ids[0], 'rewrite-skill-name');
    });
  });
});

test('skill rewriting replaces only the scalar token and agent identity remains filename-driven', async (t) => {
  const scalarCases = [
    {
      name: 'plain LF',
      separator: '\n',
      sourceLine: 'name:   sample   ',
      expectedLine: 'name:   dude-local-sample   ',
    },
    {
      name: 'single-quoted CRLF',
      separator: '\r\n',
      sourceLine: "name:   'sample'   ",
      expectedLine: "name:   'dude-local-sample'   ",
    },
    {
      name: 'double-quoted LF',
      separator: '\n',
      sourceLine: 'name:   "sample"   ',
      expectedLine: 'name:   "dude-local-sample"   ',
    },
  ];
  for (const fixtureCase of scalarCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const source = skillDocument({
          nameLine: fixtureCase.sourceLine,
          separator: fixtureCase.separator,
          body: 'Body bytes and `name: sample` text stay untouched.',
        });
        const expected = source.replace(fixtureCase.sourceLine, fixtureCase.expectedLine);
        const fixture = sourceFixture({
          'artifact/SKILL.md': source,
          'artifact/support.txt': 'support bytes\r\n',
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        const entrypoint = outputForSource(result, 'artifact/SKILL.md');
        const support = outputForSource(result, 'artifact/support.txt');
        assert.deepEqual(entrypoint.transform_ids, ['rewrite-skill-name']);
        assert.deepEqual(support.transform_ids, []);
        assert.deepEqual(await result.getOutputBytes(entrypoint.destination_path), Buffer.from(expected));
        assert.deepEqual(
          await result.getOutputBytes(support.destination_path),
          Buffer.from('support bytes\r\n'),
        );
        assert.equal(expected.split(fixtureCase.separator).length, source.split(fixtureCase.separator).length);
      });
    });
  }

  await t.test('agent display name is byte-preserved while its filename drives the flat destination', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({ name: 'Display Name Has No Path Authority' });
      const fixture = sourceFixture({ 'agents/review.agent.md': source });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const output = outputForSource(result, 'agents/review.agent.md');

      assert.equal(output.destination_path, '.github/agents/dude-local-review.agent.md');
      assert.deepEqual(output.transform_ids, []);
      assert.deepEqual(await result.getOutputBytes(output.destination_path), Buffer.from(source));
    });
  });
});

test('agent coordinator paragraph is accepted only as one exact standalone unfenced body line', async (t) => {
  await t.test('accepts the canonical paragraph unchanged', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({ body: `Purpose paragraph.\n\n${COORDINATOR_PARAGRAPH}\n\n## Scope` });
      const fixture = sourceFixture({ 'agents/review.agent.md': source });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      const output = outputForSource(result, 'agents/review.agent.md');
      assert.deepEqual(output.transform_ids, []);
      assert.deepEqual(await result.getOutputBytes(output.destination_path), Buffer.from(source));
    });
  });

  /** @type {{name: string, code: string, body: string, message: string, descriptionLine?: string}[]} */
  const boundaryCases = [
    {
      name: 'missing',
      code: 'agent-boundary-missing',
      body: 'No coordinator boundary is present.',
      message: 'Agent entrypoint is missing the canonical coordinator-only artifacts paragraph.',
    },
    {
      name: 'malformed',
      code: 'agent-boundary-malformed',
      body: '**Coordinator-only artifacts:** do not edit coordinator state.\nThe required sentence is incomplete.',
      message: 'Agent entrypoint has a malformed coordinator-only artifacts paragraph.',
    },
    {
      name: 'duplicated by a fenced spoof heading',
      code: 'agent-boundary-duplicated',
      body: `${COORDINATOR_PARAGRAPH}\n\n\`\`\`text\n**Coordinator-only artifacts:** spoofed example\n\`\`\``,
      message: 'Agent entrypoint contains more than one coordinator-only artifacts heading occurrence.',
    },
    {
      name: 'duplicated by a frontmatter heading',
      code: 'agent-boundary-duplicated',
      descriptionLine: 'description: "**Coordinator-only artifacts:** frontmatter occurrence"',
      body: COORDINATOR_PARAGRAPH,
      message: 'Agent entrypoint contains more than one coordinator-only artifacts heading occurrence.',
    },
    {
      name: 'quoted full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `> ${COORDINATOR_PARAGRAPH}`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
    {
      name: 'prose-wrapped full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `Prefix ${COORDINATOR_PARAGRAPH} suffix`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
    {
      name: 'fenced full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `~~~text\n${COORDINATOR_PARAGRAPH}\n~~~`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
    {
      name: 'unbounded full paragraph',
      code: 'agent-boundary-noncanonical',
      body: `Previous body line.\n${COORDINATOR_PARAGRAPH}\nFollowing body line.`,
      message: 'Agent entrypoint coordinator-only artifacts paragraph is not one standalone unprefixed unfenced body line.',
    },
  ];

  for (const fixtureCase of boundaryCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'agents/review.agent.md': agentDocument({
            body: fixtureCase.body,
            descriptionLine: fixtureCase.descriptionLine,
          }),
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assertNoOutputForSource(result, 'agents/review.agent.md');
        assert.deepEqual(
          diagnostic(result, fixtureCase.code, 'agents/review.agent.md'),
          {
            code: fixtureCase.code,
            path: 'agents/review.agent.md',
            related_paths: [],
            message: fixtureCase.message,
            guidance: BOUNDARY_GUIDANCE,
          },
        );
      });
    });
  }
});

test('nearest valid roots own descendants, invalid candidates are barriers, and root notices alone are shared', async (t) => {
  await t.test('chooses the nearest nested root rather than the first root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'outer/SKILL.md': skillDocument({ name: 'outer' }),
        'outer/outer.txt': 'outer owner\n',
        'outer/nested/SKILL.md': skillDocument({ name: 'inner' }),
        'outer/nested/owned.txt': 'nearest owner\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.groups, [
        { kind: 'skill', entrypoint: 'outer/SKILL.md' },
        { kind: 'skill', entrypoint: 'outer/nested/SKILL.md' },
      ]);
      assert.equal(
        outputForSource(result, 'outer/outer.txt').destination_path,
        '.github/skills/dude-local-outer/outer.txt',
      );
      assert.equal(
        outputForSource(result, 'outer/nested/owned.txt').destination_path,
        '.github/skills/dude-local-inner/owned.txt',
      );
      assert.equal(
        result.outputs.some(({ destination_path: destinationPath }) => (
          destinationPath === '.github/skills/dude-local-outer/nested/owned.txt'
        )),
        false,
        'a first-root implementation would incorrectly claim the nested file',
      );
    });
  });

  await t.test('does not fall through an invalid nearest candidate to an outer root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'outer/SKILL.md': skillDocument({ name: 'outer' }),
        'outer/bad/SKILL.md': '---\nname: bad\n---\nMissing description\n',
        'outer/bad/private.txt': 'must not belong to outer\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.groups, [{ kind: 'skill', entrypoint: 'outer/SKILL.md' }]);
      diagnostic(result, 'entrypoint-required-field-invalid', 'outer/bad/SKILL.md');
      const privateRecord = diagnostic(result, 'ownership-unowned', 'outer/bad/private.txt');
      assert.match(privateRecord.guidance, /narrower.*root|root.*narrower/i);
      assertNoOutputForSource(result, 'outer/bad/SKILL.md');
      assertNoOutputForSource(result, 'outer/bad/private.txt');
      assert.equal(
        result.destination_facts.some(({ source_path: sourcePath }) => sourcePath === 'outer/bad/private.txt'),
        false,
        'an invalid root is an ownership barrier, not a transparent directory',
      );
    });
  });

  await t.test('blocks multiple same-directory roots as ambiguous', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'bundle/SKILL.md': skillDocument({ name: 'bundle-skill' }),
        'bundle/review.agent.md': agentDocument(),
        'bundle/support.txt': 'equally near\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'entrypoint-root-ambiguous');

      assert.deepEqual(record.related_paths, [
        'bundle/SKILL.md',
        'bundle/review.agent.md',
      ]);
      assertNoOutputForSource(result, 'bundle/support.txt');
    });
  });

  await t.test('blocks an ordinary unowned root file with narrower-root guidance', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'README.md': 'unowned\n',
        'skill/SKILL.md': skillDocument({ name: 'owned' }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'ownership-unowned', 'README.md');

      assert.match(record.guidance, /narrower.*root|root.*narrower/i);
      assertNoOutputForSource(result, 'README.md');
    });
  });

  await t.test('shares selected-root LICENSE and NOTICE variants but treats nested notices normally', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'LICENSE': 'shared license\n',
        'NOTICE.txt': 'shared notice\n',
        'one/SKILL.md': skillDocument({ name: 'one-skill' }),
        'one/NOTICE': 'one only\n',
        'two/SKILL.md': skillDocument({ name: 'two-skill' }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => sourcePath === 'LICENSE')
          .map(({ destination_path: destinationPath }) => destinationPath),
        [
          '.github/skills/dude-local-one-skill/LICENSE',
          '.github/skills/dude-local-two-skill/LICENSE',
        ],
      );
      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => sourcePath === 'NOTICE.txt')
          .map(({ destination_path: destinationPath }) => destinationPath),
        [
          '.github/skills/dude-local-one-skill/NOTICE.txt',
          '.github/skills/dude-local-two-skill/NOTICE.txt',
        ],
      );
      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => sourcePath === 'one/NOTICE')
          .map(({ destination_path: destinationPath }) => destinationPath),
        ['.github/skills/dude-local-one-skill/NOTICE'],
      );
    });
  });
});

test('fixed mappings preserve skill trees, flatten agents into entrypoint plus support, and omit collisions', async (t) => {
  await t.test('maps complete owned trees with empty transforms outside the skill entrypoint', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const agent = agentDocument({ name: 'Filename Still Wins' });
      const fixture = sourceFixture({
        'skills/check/SKILL.md': skillDocument({ name: 'tree-check' }),
        'skills/check/scripts/run.mjs': 'export default true;\n',
        'agents/review.agent.md': agent,
        'agents/examples/sample.txt': 'sample\n',
        'agents/scripts/check.mjs': 'export default true;\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinations = Object.fromEntries(result.outputs.map((output) => [output.source_path, output.destination_path]));

      assert.deepEqual(destinations, {
        'agents/review.agent.md': '.github/agents/dude-local-review.agent.md',
        'agents/examples/sample.txt': '.github/agents/dude-local-review.support/examples/sample.txt',
        'agents/scripts/check.mjs': '.github/agents/dude-local-review.support/scripts/check.mjs',
        'skills/check/SKILL.md': '.github/skills/dude-local-tree-check/SKILL.md',
        'skills/check/scripts/run.mjs': '.github/skills/dude-local-tree-check/scripts/run.mjs',
      });
      assert.deepEqual(
        result.outputs.map(({ destination_path: destinationPath }) => destinationPath),
        result.outputs.map(({ destination_path: destinationPath }) => destinationPath).sort(compareRaw),
      );
      assert.deepEqual(
        result.outputs.filter(({ source_path: sourcePath }) => !sourcePath.endsWith('/SKILL.md'))
          .map(({ transform_ids: transformIds }) => transformIds),
        [[], [], [], []],
      );
      assert.deepEqual(
        await result.getOutputBytes('.github/agents/dude-local-review.agent.md'),
        Buffer.from(agent),
      );
    });
  });

  await t.test('retains exact-collision candidate facts while exposing neither candidate as an output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'same-skill', body: 'first divergent body' }),
        'two/SKILL.md': skillDocument({ name: 'dude-pack-same-skill', body: 'second divergent body' }),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const destinationPath = '.github/skills/dude-local-same-skill/SKILL.md';
      const record = diagnostic(result, 'output-collision');

      assert.deepEqual(record.related_paths, ['one/SKILL.md', 'two/SKILL.md']);
      assertNoOutputForSource(result, 'one/SKILL.md');
      assertNoOutputForSource(result, 'two/SKILL.md');
      destinationFact(result, 'one/SKILL.md', destinationPath);
      destinationFact(result, 'two/SKILL.md', destinationPath);
      assert.ok(fixture.sourceAnalysis.entries.some(({ path: entryPath }) => entryPath === 'one/SKILL.md'));
      assert.ok(fixture.sourceAnalysis.entries.some(({ path: entryPath }) => entryPath === 'two/SKILL.md'));
      await assert.rejects(
        result.getOutputBytes(destinationPath),
        /ambiguous|collision|illegal|unknown|missing/i,
      );
    });
  });

  await t.test('retains case-collision candidate facts while exposing neither candidate as an output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'one/Review.agent.md': agentDocument(),
        'two/review.agent.md': agentDocument(),
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'output-case-collision');

      assert.equal(record.path, null);
      assert.deepEqual(record.related_paths, [
        '.github/agents/dude-local-Review.agent.md',
        '.github/agents/dude-local-review.agent.md',
      ]);
      assertNoOutputForSource(result, 'one/Review.agent.md');
      assertNoOutputForSource(result, 'two/review.agent.md');
      destinationFact(
        result,
        'one/Review.agent.md',
        '.github/agents/dude-local-Review.agent.md',
      );
      destinationFact(
        result,
        'two/review.agent.md',
        '.github/agents/dude-local-review.agent.md',
      );
    });
  });
});

test('closed reference grammar detects only exact lexical forms and never rewrites reference bytes', async (t) => {
  const detectedCases = [
    {
      name: 'inline Markdown arbitrary extension',
      line: '[tool](./support/tool.mjs)',
      files: { 'pkg/support/tool.mjs': 'tool\n' },
      target: 'pkg/support/tool.mjs',
    },
    {
      name: 'inline image extensionless target',
      line: '![tool](./support/tool)',
      files: { 'pkg/support/tool': 'tool\n' },
      target: 'pkg/support/tool',
    },
    {
      name: 'single-quoted arbitrary extension',
      line: "'./support/config.data'",
      files: { 'pkg/support/config.data': 'config\n' },
      target: 'pkg/support/config.data',
    },
    {
      name: 'double-quoted extensionless target',
      line: '"./support/config"',
      files: { 'pkg/support/config': 'config\n' },
      target: 'pkg/support/config',
    },
    {
      name: 'single-backtick directory target',
      line: '`./support/docs`',
      files: { 'pkg/support/docs/readme.txt': 'docs\n' },
      target: 'pkg/support/docs',
    },
    {
      name: 'parent inline Markdown target',
      line: '[license](../LICENSE)',
      files: { LICENSE: 'shared\n' },
      target: 'LICENSE',
    },
  ];

  for (const fixtureCase of detectedCases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const source = agentDocument({
          body: `${COORDINATOR_PARAGRAPH}\n\n${fixtureCase.line}`,
        });
        const fixture = sourceFixture({
          'pkg/review.agent.md': source,
          ...fixtureCase.files,
        });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
        const record = diagnostic(result, 'reference-broken-by-mapping', 'pkg/review.agent.md');

        assert.deepEqual(record.related_paths, [fixtureCase.target]);
        assert.match(record.guidance, /clean.*source|narrower.*root/i);
        assert.deepEqual(
          fixture.bytesByPath.get('pkg/review.agent.md'),
          Buffer.from(source),
          'reference analysis does not mutate provider bytes',
        );
        assertNoOutputForSource(result, 'pkg/review.agent.md');
        await assert.rejects(
          result.getOutputBytes('.github/agents/dude-local-review.agent.md'),
          /blocked|illegal|unknown|missing|output/i,
        );
      });
    });
  }

  await t.test('omits a broken referencing output while retaining evidence and a safe target', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\n[tool](./support/tool)`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const referencingDestination = '.github/agents/dude-local-review.agent.md';

      diagnostic(result, 'reference-broken-by-mapping', 'pkg/review.agent.md');
      destinationFact(result, 'pkg/review.agent.md', referencingDestination);
      const targetOutput = outputForSource(result, 'pkg/support/tool');
      assert.equal(
        targetOutput.destination_path,
        '.github/agents/dude-local-review.support/support/tool',
      );
      assert.deepEqual(await result.getOutputBytes(targetOutput.destination_path), Buffer.from('tool\n'));

      const byteAccess = await result.getOutputBytes(referencingDestination).then(
        () => ({ rejected: false, message: '' }),
        (error) => ({ rejected: true, message: String(error?.message ?? error) }),
      );
      assert.deepEqual(
        {
          publicOutput: result.outputs.some(({ destination_path: destinationPath }) => (
            destinationPath === referencingDestination
          )),
          byteAccessRejected: byteAccess.rejected,
        },
        { publicOutput: false, byteAccessRejected: true },
      );
      if (byteAccess.rejected) {
        assert.match(byteAccess.message, /blocked|illegal|unknown|missing|output/i);
      }
    });
  });

  await t.test('exact quoted tokens remain lexical matches in code-like surrounding text', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\nconst selected = './support/tool';`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      const record = diagnostic(
        result,
        'reference-broken-by-mapping',
        'pkg/review.agent.md',
      );
      assert.deepEqual(record.related_paths, ['pkg/support/tool']);
      assert.match(record.guidance, /clean.*source|narrower.*root/i);
    });
  });

  await t.test('exact single-quoted tokens remain lexical matches between comparison operators', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\nif (left < './support/tool' && right > 0) use(left);`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      const record = diagnostic(
        result,
        'reference-broken-by-mapping',
        'pkg/review.agent.md',
      );
      assert.deepEqual(record.related_paths, ['pkg/support/tool']);
      assertNoOutputForSource(result, 'pkg/review.agent.md');
      await assert.rejects(
        result.getOutputBytes('.github/agents/dude-local-review.agent.md'),
        /blocked|illegal|unknown|missing|output/i,
      );
    });
  });

  await t.test('excludes the complete negative grammar and ignores absent source targets', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const negativeLines = [
        '[tool]: ./support/tool',
        '<./support/tool>',
        '<img src="./support/tool">',
        "<img src='./support/tool'>",
        'See ./support/tool in prose.',
        '[leading space]( ./support/tool)',
        '[trailing space](./support/tool )',
        String.raw`[backslash](.\support\tool)`,
        String.raw`[escape](.\/support/tool)`,
        '[query](./support/tool?raw=1)',
        '[fragment](./support/tool#section)',
        '[delimiter](./support/(tool))',
        '[percent](./support%2Ftool)',
        "''./support/tool''",
        '""./support/tool""',
        '``./support/tool``',
        '[missing](./support/not-present)',
      ];
      const source = agentDocument({
        body: `${COORDINATOR_PARAGRAPH}\n\n${negativeLines.join('\n')}`,
      });
      const fixture = sourceFixture({
        'pkg/review.agent.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assertNoDiagnostic(result, 'reference-broken-by-mapping');
      const output = outputForSource(result, 'pkg/review.agent.md');
      assert.deepEqual(await result.getOutputBytes(output.destination_path), Buffer.from(source));
    });
  });

  await t.test('allows every exact form when skill-tree mapping preserves its target', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const referenceBody = [
        '[markdown](./support/tool)',
        '![image](./support/tool)',
        "'./support/tool'",
        '"./support/tool"',
        '`./support/tool`',
      ].join('\n');
      const source = skillDocument({ name: 'linked-skill', body: referenceBody });
      const fixture = sourceFixture({
        'pkg/SKILL.md': source,
        'pkg/support/tool': 'tool\n',
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assertNoDiagnostic(result, 'reference-broken-by-mapping');
      const output = outputForSource(result, 'pkg/SKILL.md');
      assert.deepEqual(
        await result.getOutputBytes(output.destination_path),
        Buffer.from(source.replace('name: linked-skill', 'name: dude-local-linked-skill')),
      );
    });
  });

  await t.test('blocks an existing target whose fixed mapping escapes the artifact output', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const source = skillDocument({ name: 'escape-check', body: '[license](../LICENSE)' });
      const fixture = sourceFixture({
        LICENSE: 'shared license\n',
        'pkg/SKILL.md': source,
      });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'reference-broken-by-mapping', 'pkg/SKILL.md');

      assert.deepEqual(record.related_paths, ['LICENSE']);
      assert.match(record.guidance, /clean.*source|narrower.*root/i);
    });
  });

  await t.test('blocks an existing empty directory target absent from destination outputs', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture(
        { 'pkg/SKILL.md': skillDocument({ name: 'empty-dir', body: '[empty](./empty)' }) },
        { directories: ['pkg/empty'] },
      );
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'reference-broken-by-mapping', 'pkg/SKILL.md');

      assert.deepEqual(record.related_paths, ['pkg/empty']);
      assert.match(record.guidance, /clean.*source|narrower.*root/i);
    });
  });
});

test('destination facts use no-follow states and public outputs contain legal candidates only', async (t) => {
  const sourcePath = 'artifact/SKILL.md';
  const destinationPath = '.github/skills/dude-local-safe-skill/SKILL.md';

  await t.test('accepts a missing destination and one safe regular replacement', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const missing = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.deepEqual(outputForSource(missing, sourcePath).destination_state, { type: 'missing' });

      const existing = Buffer.from('existing destination\n');
      writeWorkspaceFile(workspaceRoot, destinationPath, existing);
      const replacement = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      assert.deepEqual(outputForSource(replacement, sourcePath).destination_state, {
        type: 'regular-file',
        sha256: sha256(existing),
      });
    });
  });

  await t.test('streams a large destination digest without readFileSync', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const existing = Buffer.alloc((2 * 1024 * 1024) + 17, 0xa5);
      writeWorkspaceFile(workspaceRoot, destinationPath, existing);
      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = () => {
        throw new Error('destination hashing must not call readFileSync');
      };
      try {
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
        assert.deepEqual(outputForSource(result, sourcePath).destination_state, {
          type: 'regular-file',
          sha256: sha256(existing),
        });
      } finally {
        fs.readFileSync = originalReadFileSync;
      }
    });
  });

  await t.test('uses directory handles instead of readdirSync', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-safe-skill/stale.txt',
        'unplanned\n',
      );
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const originalReaddirSync = fs.readdirSync;
      fs.readdirSync = () => {
        throw new Error('destination inspection must not call readdirSync');
      };
      try {
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
        diagnostic(result, 'destination-unplanned-entry');
      } finally {
        fs.readdirSync = originalReaddirSync;
      }
    });
  });

  await t.test('rejects the 257th retained unplanned destination path', async () => {
    await withWorkspace(async (workspaceRoot) => {
      for (let index = 0; index <= DIRECTORY_SOURCE_LIMITS.max_entries; index += 1) {
        writeWorkspaceFile(
          workspaceRoot,
          `.github/skills/dude-local-safe-skill/stale-${String(index).padStart(3, '0')}.txt`,
          'unplanned\n',
        );
      }
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });

      await assert.rejects(
        analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot),
        /unplanned entries exceed the retained-path limit of 256/,
      );
    });
  });

  await t.test('scans more than 256 unrelated names without retaining them', async () => {
    await withWorkspace(async (workspaceRoot) => {
      for (let index = 0; index < 300; index += 1) {
        writeWorkspaceFile(
          workspaceRoot,
          `.github/skills/unrelated-${String(index).padStart(3, '0')}.txt`,
          'unrelated\n',
        );
      }
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      assert.deepEqual(outputForSource(result, sourcePath).destination_state, { type: 'missing' });
    });
  });

  const unsafeCases = [
    {
      name: 'symbolic-link ancestor',
      code: 'destination-unsafe-ancestor',
      arrange(root) {
        fs.mkdirSync(path.join(root, '.github'), { recursive: true });
        writeWorkspaceFile(
          root,
          'outside-skills/dude-local-safe-skill/external.txt',
          'must not be inventoried\n',
        );
        writeWorkspaceFile(root, 'outside-skills/unrelated.txt', 'unrelated\n');
        fs.symlinkSync('../outside-skills', path.join(root, '.github', 'skills'), 'dir');
      },
      noUnplanned: true,
    },
    {
      name: 'regular-file ancestor',
      code: 'destination-unsafe-ancestor',
      arrange(root) {
        writeWorkspaceFile(root, '.github/skills', 'not a directory\n');
      },
      noUnplanned: true,
    },
    {
      name: 'symbolic-link destination',
      code: 'destination-unsupported',
      arrange(root) {
        const target = writeWorkspaceFile(root, 'elsewhere.txt', 'elsewhere\n');
        const absoluteDestination = path.join(root, ...destinationPath.split('/'));
        fs.mkdirSync(path.dirname(absoluteDestination), { recursive: true });
        fs.symlinkSync(target, absoluteDestination);
      },
    },
    {
      name: 'unsupported destination type',
      code: 'destination-unsupported',
      arrange(root) {
        fs.mkdirSync(path.join(root, ...destinationPath.split('/')), { recursive: true });
      },
    },
    {
      name: 'multi-link regular destination',
      code: 'destination-multilink',
      arrange(root) {
        const destination = writeWorkspaceFile(root, destinationPath, 'linked\n');
        fs.linkSync(destination, path.join(root, 'destination-alias'));
      },
      maySkip: true,
    },
    {
      name: 'case alias at the exact destination',
      code: 'destination-case-collision',
      arrange(root) {
        writeWorkspaceFile(
          root,
          '.github/skills/dude-local-safe-skill/skill.md',
          'case alias\n',
        );
      },
    },
  ];

  for (const fixtureCase of unsafeCases) {
    await t.test(fixtureCase.name, async (subtest) => {
      await withWorkspace(async (workspaceRoot) => {
        try {
          fixtureCase.arrange(workspaceRoot);
        } catch (error) {
          if (
            fixtureCase.maySkip
            && error
            && typeof error === 'object'
            && 'code' in error
            && ['EPERM', 'EACCES', 'ENOTSUP'].includes(String(error.code))
          ) {
            subtest.skip(`filesystem does not support the hard-link fixture: ${String(error.code)}`);
            return;
          }
          throw error;
        }
        const before = snapshotWorkspace(workspaceRoot);
        const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
        const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

        assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
        diagnostic(result, fixtureCase.code);
        assertNoOutputForSource(result, sourcePath);
        destinationFact(result, sourcePath, destinationPath);
        assert.ok(fixture.sourceAnalysis.entries.some(({ path: entryPath }) => entryPath === sourcePath));
        if (fixtureCase.noUnplanned) assertNoDiagnostic(result, 'destination-unplanned-entry');
      });
    });
  }

  await t.test('reports every observable case alias in raw order', async (subtest) => {
    await withWorkspace(async (workspaceRoot) => {
      const aliasDirectory = path.join(
        workspaceRoot,
        '.github',
        'skills',
        'dude-local-safe-skill',
      );
      fs.mkdirSync(aliasDirectory, { recursive: true });
      fs.writeFileSync(path.join(aliasDirectory, 'Skill.md'), 'first alias\n');
      fs.writeFileSync(path.join(aliasDirectory, 'skill.md'), 'second alias\n');
      const aliasNames = fs.readdirSync(aliasDirectory)
        .filter((name) => name !== 'SKILL.md' && name.toLowerCase() === 'skill.md')
        .sort(compareRaw);
      if (aliasNames.length !== 2) {
        subtest.skip('filesystem cannot represent multiple case-only aliases');
        return;
      }

      const before = snapshotWorkspace(workspaceRoot);
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
      const record = diagnostic(result, 'destination-case-collision', destinationPath);

      assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
      assert.deepEqual(
        record.related_paths,
        aliasNames.map((name) => (
          `.github/skills/dude-local-safe-skill/${name}`
        )).sort(compareRaw),
      );
    });
  });

  await t.test('inventories unplanned descendants only beneath the relevant planned root', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-safe-skill/stale.txt',
        'unplanned\n',
      );
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-unrelated/deep/keep.txt',
        'unrelated\n',
      );
      fs.symlinkSync(
        '../keep.txt',
        path.join(workspaceRoot, '.github/skills/dude-local-unrelated/deep/ignored-link'),
      );
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      const record = diagnostic(result, 'destination-unplanned-entry');
      assert.deepEqual(record.related_paths, [
        '.github/skills/dude-local-safe-skill/stale.txt',
      ]);
      assert.equal(
        result.blocking_diagnostics.some(({ related_paths: relatedPaths }) => (
          relatedPaths.some((relatedPath) => relatedPath.includes('dude-local-unrelated'))
        )),
        false,
        'analysis must not recursively inventory unrelated .github artifact roots',
      );
      assertNoOutputForSource(result, sourcePath);
      destinationFact(result, sourcePath, destinationPath);
    });
  });

  await t.test('ignores an unsafe-looking unrelated artifact tree when the planned root is missing', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(
        workspaceRoot,
        '.github/skills/dude-local-unrelated/keep.txt',
        'keep\n',
      );
      fs.symlinkSync(
        'keep.txt',
        path.join(workspaceRoot, '.github/skills/dude-local-unrelated/link'),
      );
      const fixture = sourceFixture({ [sourcePath]: skillDocument({ name: 'safe-skill' }) });
      const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

      assert.deepEqual(result.blocking_diagnostics, []);
      assert.deepEqual(outputForSource(result, sourcePath).destination_state, { type: 'missing' });
    });
  });
});

test('blocking diagnostics have exact fields, canonical related paths, stable identities, and stable sorting', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'README.md': 'unowned\n',
      'adapt/SKILL.md': skillDocument({ name: 'adapted', extra: ['model: gpt-4'] }),
      'bad/SKILL.md': '--- \nname: bad\ndescription: malformed\n---\n',
      'missing/review.agent.md': agentDocument({ body: 'No boundary here.' }),
    });

    const first = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const second = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);

    assert.deepEqual(second.blocking_diagnostics, first.blocking_diagnostics);
    assert.ok(first.blocking_diagnostics.length >= 4);
    const expectedOrder = [...first.blocking_diagnostics].sort(compareDiagnostics);
    assert.deepEqual(first.blocking_diagnostics, expectedOrder);

    for (const record of first.blocking_diagnostics) {
      assert.deepEqual(Object.keys(record), DIAGNOSTIC_FIELDS);
      assert.deepEqual(record.related_paths, [...record.related_paths].sort(compareRaw));
      assert.equal(new Set(record.related_paths).size, record.related_paths.length);
      assert.equal(record.related_paths.includes(record.path), false);
    }
    const identities = first.blocking_diagnostics.map((record) => JSON.stringify([
      record.code,
      record.path,
      record.related_paths,
    ]));
    assert.equal(new Set(identities).size, identities.length);
  });
});

test('diagnostic sorting compares related paths as raw arrays rather than JSON text', async () => {
  assert.equal(compareRawArrays(['a'], ['a', 'a/b']), -1, 'a proper array prefix sorts first');

  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'a"/one/SKILL.md': skillDocument({ name: 'quote-collision', body: 'quote one' }),
      'a"/two/SKILL.md': skillDocument({ name: 'dude-pack-quote-collision', body: 'quote two' }),
      'a#/one/SKILL.md': skillDocument({ name: 'hash-collision', body: 'hash one' }),
      'a#/two/SKILL.md': skillDocument({ name: 'dude-pack-hash-collision', body: 'hash two' }),
    });
    const result = await analyzeDirectoryArtifacts(fixture.sourceAnalysis, workspaceRoot);
    const collisions = result.blocking_diagnostics.filter(({ code }) => code === 'output-collision');

    assert.deepEqual(collisions.map(({ related_paths: relatedPaths }) => relatedPaths), [
      ['a"/one/SKILL.md', 'a"/two/SKILL.md'],
      ['a#/one/SKILL.md', 'a#/two/SKILL.md'],
    ]);
    assert.deepEqual(result.blocking_diagnostics, [...result.blocking_diagnostics].sort(compareDiagnostics));
    for (const record of collisions) {
      assert.deepEqual(record.related_paths, [...record.related_paths].sort(compareRaw));
      assert.equal(new Set(record.related_paths).size, record.related_paths.length);
    }
  });
});

test('artifact analysis performs no destination writes', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const source = sourceFixture({
      'skills/check/SKILL.md': skillDocument({ name: 'write-check' }),
      'skills/check/support.txt': 'support\n',
      'agents/review.agent.md': agentDocument(),
      'agents/support.txt': 'agent support\n',
    });
    writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/dude-local-write-check/SKILL.md',
      'reviewed existing skill\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/dude-local-write-check/support.txt',
      'reviewed existing support\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/agents/dude-local-review.agent.md',
      'reviewed existing agent\n',
    );
    writeWorkspaceFile(
      workspaceRoot,
      '.github/agents/dude-local-review.support/support.txt',
      'reviewed existing support\n',
    );
    const before = snapshotWorkspace(workspaceRoot);
    const mutationCalls = [];
    const syncMutationNames = [
      'appendFileSync',
      'chmodSync',
      'copyFileSync',
      'linkSync',
      'mkdirSync',
      'renameSync',
      'rmSync',
      'symlinkSync',
      'truncateSync',
      'unlinkSync',
      'writeFileSync',
    ];
    const originals = new Map();
    for (const name of syncMutationNames) {
      originals.set(name, fs[name]);
      fs[name] = (...args) => {
        mutationCalls.push({ name, args });
        throw new Error(`unexpected destination mutation through fs.${name}`);
      };
    }

    let result;
    try {
      result = await analyzeDirectoryArtifacts(source.sourceAnalysis, workspaceRoot);
    } finally {
      for (const [name, original] of originals) fs[name] = original;
    }

    assertResultContract(result);
    assert.equal(mutationCalls.length, 0);
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
    assert.equal(source.state.revalidateCalls, 1);
  });
});

test('T010 preflightDirectoryApply returns one exact defensively owned nonpersisted token', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'preflight-contract' }),
      'artifact/support.txt': 'support bytes\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const planned = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const callerPlan = structuredClone(planned);
    const before = snapshotWorkspace(workspaceRoot);
    fixture.state.events.length = 0;
    fixture.state.revalidateCalls = 0;

    assert.equal(preflightDirectoryApply.length, 4);
    assert.equal('transaction_parent' in callerPlan, false);
    let token;
    await assertNoFilesystemMutation(workspaceRoot, async () => {
      token = await preflightDirectoryApply(
        callerPlan,
        'confirm-import',
        fixture.sourceAnalysis,
        workspaceRoot,
      );
    });

    const primaryParent = path.join(workspaceRoot, '.dude/state/import-transactions');
    assert.deepEqual(Object.keys(token), ['plan', 'transaction_parent']);
    assert.equal(token.transaction_parent, primaryParent);
    assert.notStrictEqual(token.plan, callerPlan);
    assert.deepEqual(token.plan, callerPlan);
    assert.equal('transaction_parent' in token.plan, false);
    assertDeepFrozen(token);
    assertContainsNoFunctions(token);
    assertContainsNoBuffers(token);
    assert.equal(
      new Set(token.plan.outputs.map((output) => output.destination_path)).size,
      token.plan.outputs.length,
    );
    assert.deepEqual(fixture.state.events, [
      'read:artifact/SKILL.md',
      'read:artifact/support.txt',
      'revalidate',
    ]);
    assert.equal(fixture.state.revalidateCalls, 1);
    assert.equal(fs.existsSync(primaryParent), false);
    assert.deepEqual(snapshotWorkspace(workspaceRoot), before);

    callerPlan.outputs[0].destination_path = '.github/changed-after-return';
    assert.deepEqual(token.plan, planned);
  });
});

test('T010 preflightDirectoryApply validates plan shape and digest before confirmation without coercion', { concurrency: false }, async (t) => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'validation-order' }),
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const cases = [
      {
        name: 'shape',
        expected: /exactly these fields/,
        makePlan() {
          const malformed = structuredClone(plan);
          malformed.extra = true;
          return malformed;
        },
      },
      {
        name: 'digest',
        expected: /plan_sha256 does not match canonical content/,
        makePlan() {
          const malformed = structuredClone(plan);
          malformed.plan_sha256 = 'f'.repeat(64);
          return malformed;
        },
      },
    ];

    for (const fixtureCase of cases) {
      await t.test(fixtureCase.name, async () => {
        let coercionCalls = 0;
        const hostileConfirmation = {};
        Object.defineProperties(hostileConfirmation, {
          [Symbol.toPrimitive]: {
            get() {
              coercionCalls += 1;
              throw new Error('confirmation must not inspect Symbol.toPrimitive');
            },
          },
          toString: {
            get() {
              coercionCalls += 1;
              throw new Error('confirmation must not inspect toString');
            },
          },
        });
        fixture.state.events.length = 0;
        fixture.state.revalidateCalls = 0;

        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              fixtureCase.makePlan(),
              hostileConfirmation,
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            fixtureCase.expected,
          );
        });
        assert.equal(coercionCalls, 0);
        assert.deepEqual(fixture.state.events, []);
        assert.equal(fixture.state.revalidateCalls, 0);
      });
    }
  });
});

test('T010 preflightDirectoryApply accepts only the exact clean or warned primitive literal', { concurrency: false }, async (t) => {
  await t.test('accepts the exact warned literal', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'warned-confirmation' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        null,
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const confirmation = `confirm-warned-import:${plan.plan_sha256}`;
      fixture.state.events.length = 0;
      fixture.state.revalidateCalls = 0;
      let token;

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        token = await preflightDirectoryApply(
          plan,
          confirmation,
          fixture.sourceAnalysis,
          workspaceRoot,
        );
      });

      assert.equal(token.plan.decision, 'warned');
      assert.equal(token.plan.plan_sha256, plan.plan_sha256);
      assert.equal(fixture.state.revalidateCalls, 1);
      assert.deepEqual(fixture.state.events, [
        'read:artifact/SKILL.md',
        'revalidate',
      ]);
    });
  });

  await t.test('rejects every near miss before source access', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const destinationPath = '.github/skills/dude-local-confirmation-mismatch/SKILL.md';
      writeWorkspaceFile(workspaceRoot, destinationPath, 'reviewed replacement\n');
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'confirmation-mismatch' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        null,
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const exact = `confirm-warned-import:${plan.plan_sha256}`;
      const cases = [
        { name: 'leading whitespace', value: ` ${exact}` },
        { name: 'trailing whitespace', value: `${exact} ` },
        { name: 'newline', value: `${exact}\n` },
        { name: 'case', value: exact.toUpperCase() },
        { name: 'wrong prefix', value: `confirm-warning-import:${plan.plan_sha256}` },
        { name: 'wrong digest', value: `confirm-warned-import:${'f'.repeat(64)}` },
      ];

      for (const fixtureCase of cases) {
        fixture.state.events.length = 0;
        fixture.state.revalidateCalls = 0;
        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              plan,
              fixtureCase.value,
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            (error) => assertPlanningRefusal(
              error,
              'confirmation-mismatch',
              null,
              [destinationPath],
            ),
            fixtureCase.name,
          );
        });
        assert.deepEqual(fixture.state.events, [], fixtureCase.name);
        assert.equal(fixture.state.revalidateCalls, 0, fixtureCase.name);
      }

      fixture.state.events.length = 0;
      fixture.state.revalidateCalls = 0;
      await assertNoFilesystemMutation(workspaceRoot, async () => {
        await assert.rejects(
          preflightDirectoryApply(
            plan,
            new String(exact),
            fixture.sourceAnalysis,
            workspaceRoot,
          ),
          /confirmation must be a primitive string/,
        );
      });
      assert.deepEqual(fixture.state.events, []);
      assert.equal(fixture.state.revalidateCalls, 0);
    });
  });

  await t.test('defensively owns exact immutable confirmation-mismatch fields', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const destinationPath = '.github/skills/dude-local-owned-refusal/SKILL.md';
      writeWorkspaceFile(workspaceRoot, destinationPath, 'reviewed replacement\n');
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'owned-refusal' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const planned = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const callerPlan = structuredClone(planned);
      fixture.state.events.length = 0;
      fixture.state.revalidateCalls = 0;

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        const refusal = preflightDirectoryApply(
          callerPlan,
          'confirm-import-wrong',
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        callerPlan.replace_paths.length = 0;
        callerPlan.outputs.length = 0;
        await assert.rejects(
          refusal,
          (error) => assertPlanningRefusal(
            error,
            'confirmation-mismatch',
            null,
            [destinationPath],
          ),
        );
      });
      assert.deepEqual(fixture.state.events, []);
      assert.equal(fixture.state.revalidateCalls, 0);
    });
  });
});

test('T010 preflightDirectoryApply snapshots the caller plan before awaited source work', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'gated-plan' }),
      'artifact/support.txt': 'support bytes\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const planned = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const acceptedPlan = structuredClone(planned);
    const callerPlan = structuredClone(planned);
    const originalGetFileBytes = fixture.sourceAnalysis.getFileBytes;
    let releaseSource;
    let markSourceEntered;
    const sourceEntered = new Promise((resolve) => { markSourceEntered = resolve; });
    const sourceGate = new Promise((resolve) => { releaseSource = resolve; });
    let gated = false;
    fixture.sourceAnalysis.getFileBytes = async (relativePath) => {
      if (!gated) {
        gated = true;
        markSourceEntered();
        await sourceGate;
      }
      return originalGetFileBytes(relativePath);
    };
    fixture.state.events.length = 0;
    fixture.state.revalidateCalls = 0;
    let token;

    await assertNoFilesystemMutation(workspaceRoot, async () => {
      const pending = preflightDirectoryApply(
        callerPlan,
        'confirm-import',
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      await sourceEntered;
      callerPlan.source.identity.tree_sha = 'c'.repeat(40);
      callerPlan.outputs[0].destination_path = '.github/changed-while-gated';
      callerPlan.reviewed_batch_ids.length = 0;
      releaseSource();
      token = await pending;
    });

    assert.deepEqual(token.plan, acceptedPlan);
    assert.notDeepEqual(token.plan, callerPlan);
    assert.equal(fixture.state.revalidateCalls, 1);
    assert.deepEqual(fixture.state.events, [
      'read:artifact/SKILL.md',
      'read:artifact/support.txt',
      'revalidate',
    ]);
  });
});

test('T010 preflightDirectoryApply retains a mismatched plan snapshot despite an in-flight caller repair', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'gated-mismatch' }),
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const planned = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const callerPlan = structuredClone(planned);
    callerPlan.outputs[0].output_sha256 = 'f'.repeat(64);
    rehashPlan(callerPlan);
    const originalGetFileBytes = fixture.sourceAnalysis.getFileBytes;
    let releaseSource;
    let markSourceEntered;
    const sourceEntered = new Promise((resolve) => { markSourceEntered = resolve; });
    const sourceGate = new Promise((resolve) => { releaseSource = resolve; });
    let gated = false;
    fixture.sourceAnalysis.getFileBytes = async (relativePath) => {
      if (!gated) {
        gated = true;
        markSourceEntered();
        await sourceGate;
      }
      return originalGetFileBytes(relativePath);
    };
    fixture.state.events.length = 0;
    fixture.state.revalidateCalls = 0;

    await assertNoFilesystemMutation(workspaceRoot, async () => {
      const pending = preflightDirectoryApply(
        callerPlan,
        'confirm-import',
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      await sourceEntered;
      callerPlan.outputs[0].output_sha256 = planned.outputs[0].output_sha256;
      rehashPlan(callerPlan);
      assert.deepEqual(callerPlan, planned);
      releaseSource();
      await assert.rejects(pending, /does not exactly match/);
    });

    assert.equal(fixture.state.revalidateCalls, 1);
    assert.deepEqual(fixture.state.events, [
      'read:artifact/SKILL.md',
      'revalidate',
    ]);
  });
});

test('T010 preflightDirectoryApply rejects authoritative source drift without mutation', { concurrency: false }, async (t) => {
  const cases = [
    {
      name: 'source bytes',
      expected: /SHA-256 integrity mismatch/,
      mutate(fixture) {
        const changed = Buffer.from(fixture.bytesByPath.get('artifact/SKILL.md'));
        changed[changed.length - 1] ^= 1;
        fixture.bytesByPath.set('artifact/SKILL.md', changed);
      },
    },
    {
      name: 'source membership',
      expected: /does not match its freshly derived analysis context/,
      mutate(fixture) {
        const relativePath = 'artifact/new-member.txt';
        const bytes = Buffer.from('new member\n');
        fixture.bytesByPath.set(relativePath, bytes);
        const manifest = createCanonicalEntryManifest([
          ...fixture.sourceAnalysis.entries,
          {
            path: relativePath,
            entry_type: 'regular-file',
            byte_count: bytes.length,
            sha256: sha256(bytes),
            content_class: 'text',
          },
        ]);
        fixture.sourceAnalysis.entries = manifest.entries.map((entry) => ({ ...entry }));
        fixture.sourceAnalysis.manifest_sha256 = manifest.manifest_sha256;
      },
    },
    {
      name: 'source provenance',
      expected: /does not match its freshly derived analysis context/,
      mutate(fixture) {
        fixture.sourceAnalysis.source.identity.tree_sha = 'c'.repeat(40);
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument({ name: 'source-drift' }),
        });
        const analysis = await analyzePublicDirectoryArtifacts(
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        const plan = await planDirectoryArtifacts(
          analysis,
          reviewFixture(analysis),
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        fixtureCase.mutate(fixture);
        fixture.state.events.length = 0;
        fixture.state.revalidateCalls = 0;

        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              plan,
              'confirm-import',
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            fixtureCase.expected,
          );
        });
        assert.equal(
          fs.existsSync(path.join(workspaceRoot, '.dude/state/import-transactions')),
          false,
        );
      });
    });
  }
});

test('T010 preflightDirectoryApply rejects destination appearance, disappearance, hash, type, and link drift', { concurrency: false }, async (t) => {
  const destinationPath = '.github/skills/dude-local-destination-drift/SKILL.md';
  const cases = [
    {
      name: 'appearance',
      initial: null,
      arrange(root) {
        writeWorkspaceFile(root, destinationPath, 'appeared after planning\n');
      },
    },
    {
      name: 'disappearance',
      initial: 'reviewed destination\n',
      arrange(root) {
        fs.unlinkSync(path.join(root, ...destinationPath.split('/')));
      },
    },
    {
      name: 'hash',
      initial: 'reviewed destination\n',
      arrange(root) {
        fs.writeFileSync(
          path.join(root, ...destinationPath.split('/')),
          'changed destination hash\n',
        );
      },
    },
    {
      name: 'type',
      initial: 'reviewed destination\n',
      arrange(root) {
        const absoluteDestination = path.join(root, ...destinationPath.split('/'));
        fs.unlinkSync(absoluteDestination);
        fs.mkdirSync(absoluteDestination);
      },
    },
    {
      name: 'link',
      initial: 'reviewed destination\n',
      maySkip: true,
      arrange(root) {
        const absoluteDestination = path.join(root, ...destinationPath.split('/'));
        const target = writeWorkspaceFile(root, 'link-target.txt', 'link target\n');
        fs.unlinkSync(absoluteDestination);
        fs.symlinkSync(target, absoluteDestination);
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async (subtest) => {
      await withWorkspace(async (workspaceRoot) => {
        if (fixtureCase.initial !== null) {
          writeWorkspaceFile(workspaceRoot, destinationPath, fixtureCase.initial);
        }
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument({ name: 'destination-drift' }),
        });
        const analysis = await analyzePublicDirectoryArtifacts(
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        const plan = await planDirectoryArtifacts(
          analysis,
          reviewFixture(analysis),
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        try {
          fixtureCase.arrange(workspaceRoot);
        } catch (error) {
          if (
            fixtureCase.maySkip
            && error
            && typeof error === 'object'
            && 'code' in error
            && ['EPERM', 'EACCES', 'ENOTSUP'].includes(String(error.code))
          ) {
            subtest.skip(`filesystem does not support the link fixture: ${String(error.code)}`);
            return;
          }
          throw error;
        }
        fixture.state.events.length = 0;
        fixture.state.revalidateCalls = 0;

        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              plan,
              'confirm-import',
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            /does not match its freshly derived analysis context/,
          );
        });
        assert.equal(
          fs.existsSync(path.join(workspaceRoot, '.dude/state/import-transactions')),
          false,
        );
      });
    });
  }
});

test('T010 preflightDirectoryApply authoritatively rejects replacement, output, and advisory drift', { concurrency: false }, async (t) => {
  const cases = [
    {
      name: 'replacement inventory',
      existingDestination: true,
      makeReview(analysis) { return reviewFixture(analysis); },
      mutate(plan) {
        plan.outputs[0].destination_state = { type: 'missing' };
        plan.replace_paths = [];
      },
    },
    {
      name: 'output hash',
      existingDestination: false,
      makeReview(analysis) { return reviewFixture(analysis); },
      mutate(plan) {
        plan.outputs[0].output_sha256 = 'f'.repeat(64);
      },
    },
    {
      name: 'advisory decision',
      existingDestination: false,
      makeReview(analysis) {
        return reviewFixture(analysis, [advisoryFinding(analysis)]);
      },
      mutate(plan) {
        plan.advisory_findings[0].severity = 'info';
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const destinationPath = '.github/skills/dude-local-plan-drift/SKILL.md';
        if (fixtureCase.existingDestination) {
          writeWorkspaceFile(workspaceRoot, destinationPath, 'reviewed destination\n');
        }
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument({ name: 'plan-drift' }),
        });
        const analysis = await analyzePublicDirectoryArtifacts(
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        const planned = await planDirectoryArtifacts(
          analysis,
          fixtureCase.makeReview(analysis),
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        const drifted = structuredClone(planned);
        fixtureCase.mutate(drifted);
        rehashPlan(drifted);
        assert.equal(validateDirectoryPlanStructure(drifted), true);
        fixture.state.events.length = 0;
        fixture.state.revalidateCalls = 0;

        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              drifted,
              renderDirectoryPlanConfirmation(drifted),
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            /does not exactly match/,
          );
        });
        assert.equal(fixture.state.revalidateCalls, 1);
        assert.equal(
          fs.existsSync(path.join(workspaceRoot, '.dude/state/import-transactions')),
          false,
        );
      });
    });
  }
});

test('T010 preflightDirectoryApply read failures remain nonmutating', { concurrency: false }, async (t) => {
  const cases = [
    {
      name: 'source read',
      expected: /fixture source read failed/,
      arrange(fixture) {
        fixture.sourceAnalysis.getFileBytes = async () => {
          throw new Error('fixture source read failed');
        };
      },
    },
    {
      name: 'source revalidate',
      expected: /fixture source revalidate failed/,
      arrange(fixture) {
        fixture.sourceAnalysis.revalidate = async () => {
          throw new Error('fixture source revalidate failed');
        };
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const fixture = sourceFixture({
          'artifact/SKILL.md': skillDocument({ name: 'read-failure' }),
        });
        const analysis = await analyzePublicDirectoryArtifacts(
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        const plan = await planDirectoryArtifacts(
          analysis,
          reviewFixture(analysis),
          fixture.sourceAnalysis,
          workspaceRoot,
        );
        fixtureCase.arrange(fixture);

        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              plan,
              'confirm-import',
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            fixtureCase.expected,
          );
        });
        assert.equal(
          fs.existsSync(path.join(workspaceRoot, '.dude/state/import-transactions')),
          false,
        );
      });
    });
  }
});

test('T010 preflightDirectoryApply selects a deterministic safe transaction parent', { concurrency: false }, async (t) => {
  await t.test('an unsafe primary selects the absolute fallback without creating it', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(workspaceRoot, '.dude', 'unsafe primary anchor\n');
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'unsafe-primary' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const fallback = path.join(workspaceRoot, '.github/.dude-import-transactions');
      let token;

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        token = await preflightDirectoryApply(
          plan,
          'confirm-import',
          fixture.sourceAnalysis,
          workspaceRoot,
        );
      });

      assert.equal(token.transaction_parent, fallback);
      assert.equal(path.isAbsolute(token.transaction_parent), true);
      assert.equal(fs.existsSync(fallback), false);
    });
  });

  await t.test('an overlapping primary selects the absolute fallback', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = path.join(workspaceRoot, '.dude/state/import-transactions');
      writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument({ name: 'primary-overlap' }));
      const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
      const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        sourceAnalysis,
        workspaceRoot,
      );
      const fallback = path.join(workspaceRoot, '.github/.dude-import-transactions');
      let token;

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        token = await preflightDirectoryApply(
          plan,
          'confirm-import',
          sourceAnalysis,
          workspaceRoot,
        );
      });

      assert.equal(token.transaction_parent, fallback);
      assert.equal(path.isAbsolute(token.transaction_parent), true);
      assert.equal(fs.existsSync(fallback), false);
    });
  });

  await t.test('a common output anchor device prefers the matching safe candidate', async () => {
    await withWorkspace(async (workspaceRoot) => {
      fs.mkdirSync(path.join(workspaceRoot, '.dude/state'), { recursive: true });
      fs.mkdirSync(path.join(workspaceRoot, '.github'), { recursive: true });
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'device-match' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const primaryAnchor = path.join(workspaceRoot, '.dude/state');
      const outputAnchor = path.join(workspaceRoot, '.github');
      const outputDevice = fs.lstatSync(outputAnchor, { bigint: true }).dev;
      const originalLstatSync = fs.lstatSync;
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        if (path.resolve(String(candidatePath)) !== path.resolve(primaryAnchor)) return stat;
        return new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return outputDevice + 1n;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
      let token;
      try {
        await assertNoFilesystemMutation(workspaceRoot, async () => {
          token = await preflightDirectoryApply(
            plan,
            'confirm-import',
            fixture.sourceAnalysis,
            workspaceRoot,
          );
        });
      } finally {
        fs.lstatSync = originalLstatSync;
      }

      assert.equal(
        token.transaction_parent,
        path.join(workspaceRoot, '.github/.dude-import-transactions'),
      );
    });
  });

  await t.test('multi-device outputs use the first safe candidate in fixed order', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const firstOutputAnchor = path.join(workspaceRoot, '.github/skills/dude-local-one');
      const secondOutputAnchor = path.join(workspaceRoot, '.github/skills/dude-local-two');
      fs.mkdirSync(firstOutputAnchor, { recursive: true });
      fs.mkdirSync(secondOutputAnchor, { recursive: true });
      const fixture = sourceFixture({
        'one/SKILL.md': skillDocument({ name: 'one' }),
        'two/SKILL.md': skillDocument({ name: 'two' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const originalLstatSync = fs.lstatSync;
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        const resolved = path.resolve(String(candidatePath));
        const device = resolved === path.resolve(firstOutputAnchor)
          ? 101n
          : resolved === path.resolve(secondOutputAnchor) ? 202n : null;
        if (device === null) return stat;
        return new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return device;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
      let token;
      try {
        await assertNoFilesystemMutation(workspaceRoot, async () => {
          token = await preflightDirectoryApply(
            plan,
            'confirm-import',
            fixture.sourceAnalysis,
            workspaceRoot,
          );
        });
      } finally {
        fs.lstatSync = originalLstatSync;
      }

      assert.equal(
        token.transaction_parent,
        path.join(workspaceRoot, '.dude/state/import-transactions'),
      );
    });
  });

  await t.test('both unsafe candidates refuse with exact deterministic paths', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(workspaceRoot, '.dude', 'unsafe primary\n');
      writeWorkspaceFile(
        workspaceRoot,
        '.github/.dude-import-transactions',
        'unsafe fallback\n',
      );
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'no-parent' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      fixture.state.events.length = 0;
      fixture.state.revalidateCalls = 0;

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        await assert.rejects(
          preflightDirectoryApply(
            plan,
            'confirm-import',
            fixture.sourceAnalysis,
            workspaceRoot,
          ),
          (error) => assertPlanningRefusal(
            error,
            'transaction-parent-unavailable',
            null,
            [
              '.dude/state/import-transactions',
              '.github/.dude-import-transactions',
            ],
          ),
        );
      });
      assert.equal(fixture.state.revalidateCalls, 1);
      assert.deepEqual(fixture.state.events, [
        'read:artifact/SKILL.md',
        'revalidate',
      ]);
    });
  });
});

test('T010 preflightDirectoryApply refuses every transaction-parent conflict family', { concurrency: false }, async (t) => {
  const candidatePaths = [
    '.dude/state/import-transactions',
    '.github/.dude-import-transactions',
  ];

  await t.test('lexical source ancestor conflict', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = path.join(
        workspaceRoot,
        '.dude/state/import-transactions/source',
      );
      writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument({ name: 'lexical-parent' }));
      writeWorkspaceFile(
        workspaceRoot,
        '.github/.dude-import-transactions',
        'unsafe fallback\n',
      );
      const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
      const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        sourceAnalysis,
        workspaceRoot,
      );

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        await assert.rejects(
          preflightDirectoryApply(
            plan,
            'confirm-import',
            sourceAnalysis,
            workspaceRoot,
          ),
          (error) => assertPlanningRefusal(
            error,
            'transaction-parent-unavailable',
            null,
            candidatePaths,
          ),
        );
      });
    });
  });

  await t.test('canonical output conflict', async () => {
    await withWorkspace(async (workspaceRoot) => {
      writeWorkspaceFile(
        workspaceRoot,
        '.github/.dude-import-transactions',
        'unsafe fallback\n',
      );
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'canonical-parent' }),
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const outputPath = path.join(
        workspaceRoot,
        ...plan.outputs[0].destination_path.split('/'),
      );
      const originalRealpathSync = fs.realpathSync;
      let transactionCanonicalizations = 0;
      fs.realpathSync = (candidatePath, options) => {
        if (new Error().stack?.includes('captureTransactionParentFact')) {
          transactionCanonicalizations += 1;
          return options === 'buffer' || (options && options.encoding === 'buffer')
            ? Buffer.from(outputPath)
            : outputPath;
        }
        return originalRealpathSync(candidatePath, options);
      };
      try {
        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              plan,
              'confirm-import',
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            (error) => assertPlanningRefusal(
              error,
              'transaction-parent-unavailable',
              null,
              candidatePaths,
            ),
          );
        });
      } finally {
        fs.realpathSync = originalRealpathSync;
      }
      assert.equal(transactionCanonicalizations, 1);
    });
  });

  await t.test('case-folded source conflict', async (subtest) => {
    await withWorkspace(async (workspaceRoot) => {
      const foldedRoot = path.join(workspaceRoot, '.DUDE');
      const sourceRoot = path.join(foldedRoot, 'state/import-transactions/source');
      writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument({ name: 'folded-parent' }));
      if (
        fs.existsSync(path.join(workspaceRoot, '.dude'))
        && fs.realpathSync(path.join(workspaceRoot, '.dude')) === fs.realpathSync(foldedRoot)
      ) {
        subtest.skip('filesystem cannot represent case-distinct transaction roots');
        return;
      }
      writeWorkspaceFile(
        workspaceRoot,
        '.github/.dude-import-transactions',
        'unsafe fallback\n',
      );
      const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
      const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        sourceAnalysis,
        workspaceRoot,
      );

      await assertNoFilesystemMutation(workspaceRoot, async () => {
        await assert.rejects(
          preflightDirectoryApply(
            plan,
            'confirm-import',
            sourceAnalysis,
            workspaceRoot,
          ),
          (error) => assertPlanningRefusal(
            error,
            'transaction-parent-unavailable',
            null,
            candidatePaths,
          ),
        );
      });
    });
  });

  await t.test('shared ancestor identity with overlapping tails', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const primaryAnchor = path.join(workspaceRoot, '.dude/state');
      const outputAnchor = path.join(
        workspaceRoot,
        '.github/skills/dude-local-ancestor-parent',
      );
      fs.mkdirSync(primaryAnchor, { recursive: true });
      fs.mkdirSync(outputAnchor, { recursive: true });
      writeWorkspaceFile(
        workspaceRoot,
        '.github/.dude-import-transactions',
        'unsafe fallback\n',
      );
      const fixture = sourceFixture({
        'artifact/SKILL.md': skillDocument({ name: 'ancestor-parent' }),
        'artifact/import-transactions/file.txt': 'overlapping tail\n',
      });
      const analysis = await analyzePublicDirectoryArtifacts(
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const plan = await planDirectoryArtifacts(
        analysis,
        reviewFixture(analysis),
        fixture.sourceAnalysis,
        workspaceRoot,
      );
      const outputAnchorStat = fs.lstatSync(outputAnchor, { bigint: true });
      const originalLstatSync = fs.lstatSync;
      fs.lstatSync = (candidatePath, options) => {
        const stat = originalLstatSync(candidatePath, options);
        if (path.resolve(String(candidatePath)) !== path.resolve(primaryAnchor)) return stat;
        return new Proxy(stat, {
          get(target, key) {
            if (key === 'dev') return outputAnchorStat.dev;
            if (key === 'ino') return outputAnchorStat.ino;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
      try {
        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            preflightDirectoryApply(
              plan,
              'confirm-import',
              fixture.sourceAnalysis,
              workspaceRoot,
            ),
            (error) => assertPlanningRefusal(
              error,
              'transaction-parent-unavailable',
              null,
              candidatePaths,
            ),
          );
        });
      } finally {
        fs.lstatSync = originalLstatSync;
      }
    });
  });

  await t.test('local source directory identity conflict', async () => {
    await withWorkspace(async (workspaceRoot) => {
      const sourceRoot = fs.mkdtempSync(path.join(
        fs.realpathSync(os.tmpdir()),
        'dude-parent-identity-source-',
      ));
      try {
        writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument({ name: 'identity-parent' }));
        const primaryAnchor = path.join(workspaceRoot, '.dude/state');
        fs.mkdirSync(primaryAnchor, { recursive: true });
        writeWorkspaceFile(
          workspaceRoot,
          '.github/.dude-import-transactions',
          'unsafe fallback\n',
        );
        const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
        const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
        const plan = await planDirectoryArtifacts(
          analysis,
          reviewFixture(analysis),
          sourceAnalysis,
          workspaceRoot,
        );
        const sourceStat = fs.lstatSync(sourceRoot, { bigint: true });
        const originalLstatSync = fs.lstatSync;
        fs.lstatSync = (candidatePath, options) => {
          const stat = originalLstatSync(candidatePath, options);
          if (path.resolve(String(candidatePath)) !== path.resolve(primaryAnchor)) return stat;
          return new Proxy(stat, {
            get(target, key) {
              if (key === 'dev') return sourceStat.dev;
              if (key === 'ino') return sourceStat.ino;
              const value = Reflect.get(target, key, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        };
        try {
          await assertNoFilesystemMutation(workspaceRoot, async () => {
            await assert.rejects(
              preflightDirectoryApply(
                plan,
                'confirm-import',
                sourceAnalysis,
                workspaceRoot,
              ),
              (error) => assertPlanningRefusal(
                error,
                'transaction-parent-unavailable',
                null,
                candidatePaths,
              ),
            );
          });
        } finally {
          fs.lstatSync = originalLstatSync;
        }
      } finally {
        fs.rmSync(sourceRoot, { recursive: true, force: true });
      }
    });
  });
});

/**
 * @param {string} workspaceRoot
 * @param {{
 *   name: string,
 *   support?: Record<string, Buffer|string>,
 *   replacements?: Record<string, Buffer|string>,
 *   sourceOptions?: Parameters<typeof sourceFixture>[1],
 * }} options
 */
async function t011ApplyFixture(workspaceRoot, options) {
  const destinationRoot = `.github/skills/dude-local-${options.name}`;
  for (const [relativePath, bytes] of Object.entries(options.replacements ?? {})) {
    writeWorkspaceFile(workspaceRoot, `${destinationRoot}/${relativePath}`, bytes);
  }
  const fixture = sourceFixture({
    'artifact/SKILL.md': skillDocument({ name: options.name }),
    ...Object.fromEntries(Object.entries(options.support ?? {}).map(([relativePath, bytes]) => (
      [`artifact/${relativePath}`, bytes]
    ))),
  }, options.sourceOptions);
  const analysis = await analyzePublicDirectoryArtifacts(
    fixture.sourceAnalysis,
    workspaceRoot,
  );
  const plan = await planDirectoryArtifacts(
    analysis,
    reviewFixture(analysis),
    fixture.sourceAnalysis,
    workspaceRoot,
  );
  const token = await preflightDirectoryApply(
    plan,
    renderDirectoryPlanConfirmation(plan),
    fixture.sourceAnalysis,
    workspaceRoot,
  );
  const absolute = (relativePath) => path.join(
    workspaceRoot,
    ...`${destinationRoot}/${relativePath}`.split('/'),
  );
  return { absolute, analysis, destinationRoot, fixture, plan, token };
}

test('planning conflicts outrank generic drift at fresh preflight and post-token recapture', { concurrency: false }, async (t) => {
  /** @param {fs.BigIntStats} stat @param {fs.BigIntStats} identity */
  const withIdentity = (stat, identity) => new Proxy(stat, {
    get(target, key) {
      if (key === 'dev') return identity.dev;
      if (key === 'ino') return identity.ino;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  /** @param {string} value @param {unknown} options */
  const pathResult = (value, options) => (
    options === 'buffer'
      || (options && typeof options === 'object' && options.encoding === 'buffer')
      ? Buffer.from(value)
      : value
  );
  /** @param {string} workspaceRoot @param {any} sourceAnalysis */
  const reviewedPlan = async (workspaceRoot, sourceAnalysis) => {
    const analysis = await analyzePublicDirectoryArtifacts(sourceAnalysis, workspaceRoot);
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      sourceAnalysis,
      workspaceRoot,
    );
    return { analysis, plan, sourceAnalysis, workspaceRoot };
  };

  const cases = [
    {
      code: 'source-output-overlap',
      async prepare(workspaceRoot) {
        const originalCwd = process.cwd();
        const sourceRoot = fs.mkdtempSync(path.join(
          fs.realpathSync(os.tmpdir()),
          'dude-boundary-overlap-source-',
        ));
        const destinationPath = '.github/skills/dude-local-boundary-overlap/SKILL.md';
        const destinationRoot = path.dirname(path.join(
          workspaceRoot,
          ...destinationPath.split('/'),
        ));
        writeWorkspaceFile(sourceRoot, 'SKILL.md', skillDocument({ name: 'boundary-overlap' }));
        fs.mkdirSync(destinationRoot, { recursive: true });
        process.chdir(sourceRoot);
        try {
          const sourceAnalysis = await analyzeLocalDirectory('.');
          const prepared = await reviewedPlan(workspaceRoot, sourceAnalysis);
          const sourceFile = path.join(sourceRoot, 'SKILL.md');
          return {
            ...prepared,
            expected: { sourcePath: null, destinationPaths: [destinationPath] },
            inject() {
              const originalLstatSync = fs.lstatSync;
              const originalRealpathSync = fs.realpathSync;
              const injectionCwd = process.cwd();
              process.chdir(destinationRoot);
              fs.lstatSync = (candidatePath, options) => {
                if (new Error().stack?.includes('captureSourcePlanningFacts')) {
                  const resolved = path.resolve(String(candidatePath));
                  if (resolved === path.resolve(destinationRoot)) {
                    return originalLstatSync(sourceRoot, options);
                  }
                  if (resolved === path.resolve(destinationRoot, 'SKILL.md')) {
                    return originalLstatSync(sourceFile, options);
                  }
                }
                return originalLstatSync(candidatePath, options);
              };
              fs.realpathSync = (candidatePath, options) => {
                if (
                  new Error().stack?.includes('captureSourcePlanningFacts')
                  && path.resolve(String(candidatePath)) === path.resolve(destinationRoot)
                ) {
                  return pathResult(sourceRoot, options);
                }
                return originalRealpathSync(candidatePath, options);
              };
              return () => {
                fs.lstatSync = originalLstatSync;
                fs.realpathSync = originalRealpathSync;
                process.chdir(injectionCwd);
              };
            },
            cleanup() {
              process.chdir(originalCwd);
              fs.rmSync(sourceRoot, { recursive: true, force: true });
            },
          };
        } catch (error) {
          process.chdir(originalCwd);
          fs.rmSync(sourceRoot, { recursive: true, force: true });
          throw error;
        }
      },
    },
    {
      code: 'source-output-alias',
      async prepare(workspaceRoot) {
        const sourceRoot = fs.mkdtempSync(path.join(
          fs.realpathSync(os.tmpdir()),
          'dude-boundary-alias-source-',
        ));
        const destinationPath = '.github/skills/dude-local-boundary-source-alias/SKILL.md';
        writeWorkspaceFile(
          sourceRoot,
          'SKILL.md',
          skillDocument({ name: 'boundary-source-alias' }),
        );
        try {
          const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
          const prepared = await reviewedPlan(workspaceRoot, sourceAnalysis);
          return {
            ...prepared,
            expected: { sourcePath: null, destinationPaths: [destinationPath] },
            inject() {
              const originalRealpathSync = fs.realpathSync;
              fs.realpathSync = (candidatePath, options) => {
                if (
                  new Error().stack?.includes('captureOutputPlanningFact')
                  && path.resolve(String(candidatePath)) === path.resolve(workspaceRoot)
                ) {
                  return pathResult(sourceRoot, options);
                }
                return originalRealpathSync(candidatePath, options);
              };
              return () => { fs.realpathSync = originalRealpathSync; };
            },
            cleanup() {
              fs.rmSync(sourceRoot, { recursive: true, force: true });
            },
          };
        } catch (error) {
          fs.rmSync(sourceRoot, { recursive: true, force: true });
          throw error;
        }
      },
    },
    {
      code: 'source-destination-file-identity',
      async prepare(workspaceRoot) {
        const sourceRoot = fs.mkdtempSync(path.join(
          fs.realpathSync(os.tmpdir()),
          'dude-boundary-file-source-',
        ));
        const destinationPath = '.github/skills/dude-local-boundary-source-file/SKILL.md';
        const sourceFile = writeWorkspaceFile(
          sourceRoot,
          'SKILL.md',
          skillDocument({ name: 'boundary-source-file' }),
        );
        const destinationFile = writeWorkspaceFile(
          workspaceRoot,
          destinationPath,
          'reviewed destination\n',
        );
        try {
          const sourceAnalysis = await analyzeLocalDirectory(sourceRoot);
          const prepared = await reviewedPlan(workspaceRoot, sourceAnalysis);
          return {
            ...prepared,
            expected: { sourcePath: 'SKILL.md', destinationPaths: [destinationPath] },
            inject() {
              const sourceIdentity = fs.lstatSync(sourceFile, { bigint: true });
              const originalLstatSync = fs.lstatSync;
              const originalOpenSync = fs.openSync;
              const originalFstatSync = fs.fstatSync;
              const destinationDescriptors = new Set();
              fs.lstatSync = (candidatePath, options) => {
                const stat = originalLstatSync(candidatePath, options);
                return path.resolve(String(candidatePath)) === path.resolve(destinationFile)
                  ? withIdentity(stat, sourceIdentity)
                  : stat;
              };
              fs.openSync = (candidatePath, flags, mode) => {
                const descriptor = originalOpenSync(candidatePath, flags, mode);
                if (path.resolve(String(candidatePath)) === path.resolve(destinationFile)) {
                  destinationDescriptors.add(descriptor);
                }
                return descriptor;
              };
              fs.fstatSync = (descriptor, options) => {
                const stat = originalFstatSync(descriptor, options);
                return destinationDescriptors.has(descriptor)
                  ? withIdentity(stat, sourceIdentity)
                  : stat;
              };
              return () => {
                fs.lstatSync = originalLstatSync;
                fs.openSync = originalOpenSync;
                fs.fstatSync = originalFstatSync;
              };
            },
            cleanup() {
              fs.rmSync(sourceRoot, { recursive: true, force: true });
            },
          };
        } catch (error) {
          fs.rmSync(sourceRoot, { recursive: true, force: true });
          throw error;
        }
      },
    },
    {
      code: 'output-output-overlap',
      async prepare(workspaceRoot) {
        const fixture = sourceFixture({
          'one/SKILL.md': skillDocument({ name: 'boundary-overlap-one' }),
          'two/SKILL.md': skillDocument({ name: 'boundary-overlap-two' }),
        });
        const prepared = await reviewedPlan(workspaceRoot, fixture.sourceAnalysis);
        const destinations = prepared.plan.outputs.map((output) => output.destination_path);
        return {
          ...prepared,
          expected: { sourcePath: null, destinationPaths: destinations },
          inject() {
            const originalRealpathSync = fs.realpathSync;
            const canonicalBase = path.join(path.dirname(workspaceRoot), 'boundary-canonical-root');
            let captureCalls = 0;
            fs.realpathSync = (candidatePath, options) => {
              if (
                new Error().stack?.includes('captureOutputPlanningFact')
                && path.resolve(String(candidatePath)) === path.resolve(workspaceRoot)
              ) {
                const value = captureCalls === 0
                  ? canonicalBase
                  : path.resolve(canonicalBase, ...destinations[0].split('/'));
                captureCalls += 1;
                return pathResult(value, options);
              }
              return originalRealpathSync(candidatePath, options);
            };
            return () => { fs.realpathSync = originalRealpathSync; };
          },
          cleanup() {},
        };
      },
    },
    {
      code: 'output-output-alias',
      async prepare(workspaceRoot) {
        const firstRoot = path.join(workspaceRoot, '.github/skills/dude-local-boundary-alias-one');
        const secondRoot = path.join(workspaceRoot, '.github/skills/dude-local-boundary-alias-two');
        fs.mkdirSync(firstRoot, { recursive: true });
        fs.mkdirSync(secondRoot, { recursive: true });
        const fixture = sourceFixture({
          LICENSE: 'shared license\n',
          'one/SKILL.md': skillDocument({ name: 'boundary-alias-one' }),
          'two/SKILL.md': skillDocument({ name: 'boundary-alias-two' }),
        });
        const prepared = await reviewedPlan(workspaceRoot, fixture.sourceAnalysis);
        const destinations = prepared.plan.outputs
          .filter((output) => output.source_path === 'LICENSE')
          .map((output) => output.destination_path);
        return {
          ...prepared,
          expected: { sourcePath: null, destinationPaths: destinations },
          inject() {
            const firstIdentity = fs.lstatSync(firstRoot, { bigint: true });
            const originalLstatSync = fs.lstatSync;
            fs.lstatSync = (candidatePath, options) => {
              const stat = originalLstatSync(candidatePath, options);
              return path.resolve(String(candidatePath)) === path.resolve(secondRoot)
                ? withIdentity(stat, firstIdentity)
                : stat;
            };
            return () => { fs.lstatSync = originalLstatSync; };
          },
          cleanup() {},
        };
      },
    },
    {
      code: 'output-output-file-identity',
      async prepare(workspaceRoot) {
        const destinations = [
          '.github/skills/dude-local-boundary-file-one/SKILL.md',
          '.github/skills/dude-local-boundary-file-two/SKILL.md',
        ];
        const absoluteDestinations = destinations.map((destinationPath) => (
          writeWorkspaceFile(workspaceRoot, destinationPath, 'same reviewed bytes\n')
        ));
        const fixture = sourceFixture({
          'one/SKILL.md': skillDocument({ name: 'boundary-file-one' }),
          'two/SKILL.md': skillDocument({ name: 'boundary-file-two' }),
        });
        const prepared = await reviewedPlan(workspaceRoot, fixture.sourceAnalysis);
        return {
          ...prepared,
          expected: { sourcePath: null, destinationPaths: destinations },
          inject() {
            const firstIdentity = fs.lstatSync(absoluteDestinations[0], { bigint: true });
            const originalLstatSync = fs.lstatSync;
            const originalOpenSync = fs.openSync;
            const originalFstatSync = fs.fstatSync;
            const secondDescriptors = new Set();
            fs.lstatSync = (candidatePath, options) => {
              const stat = originalLstatSync(candidatePath, options);
              return path.resolve(String(candidatePath)) === path.resolve(absoluteDestinations[1])
                ? withIdentity(stat, firstIdentity)
                : stat;
            };
            fs.openSync = (candidatePath, flags, mode) => {
              const descriptor = originalOpenSync(candidatePath, flags, mode);
              if (path.resolve(String(candidatePath)) === path.resolve(absoluteDestinations[1])) {
                secondDescriptors.add(descriptor);
              }
              return descriptor;
            };
            fs.fstatSync = (descriptor, options) => {
              const stat = originalFstatSync(descriptor, options);
              return secondDescriptors.has(descriptor)
                ? withIdentity(stat, firstIdentity)
                : stat;
            };
            return () => {
              fs.lstatSync = originalLstatSync;
              fs.openSync = originalOpenSync;
              fs.fstatSync = originalFstatSync;
            };
          },
          cleanup() {},
        };
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(`fresh preflight ${fixtureCase.code}`, { concurrency: false }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const prepared = await fixtureCase.prepare(workspaceRoot);
        let restore = () => {};
        try {
          restore = prepared.inject();
          await assertNoFilesystemMutation(workspaceRoot, async () => {
            await assert.rejects(
              preflightDirectoryApply(
                prepared.plan,
                renderDirectoryPlanConfirmation(prepared.plan),
                prepared.sourceAnalysis,
                workspaceRoot,
              ),
              (error) => {
                assertPlanningRefusal(
                  error,
                  fixtureCase.code,
                  prepared.expected.sourcePath,
                  prepared.expected.destinationPaths,
                );
                assert.doesNotMatch(
                  error.message,
                  /directory plan does not match its freshly derived analysis context/,
                );
                return true;
              },
            );
          });
        } finally {
          restore();
          prepared.cleanup();
        }
      });
    });
  }

  await t.test('post-token output-output-alias', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const fixtureCase = cases.find(({ code }) => code === 'output-output-alias');
      assert.ok(fixtureCase);
      const prepared = await fixtureCase.prepare(workspaceRoot);
      const token = await preflightDirectoryApply(
        prepared.plan,
        renderDirectoryPlanConfirmation(prepared.plan),
        prepared.sourceAnalysis,
        workspaceRoot,
      );
      let restore = () => {};
      try {
        restore = prepared.inject();
        await assertNoFilesystemMutation(workspaceRoot, async () => {
          await assert.rejects(
            applyDirectoryPreflight(token),
            (error) => {
              assertPlanningRefusal(
                error,
                fixtureCase.code,
                prepared.expected.sourcePath,
                prepared.expected.destinationPaths,
              );
              assert.doesNotMatch(error.message, /planning facts changed/);
              return true;
            },
          );
        });
      } finally {
        restore();
        prepared.cleanup();
      }
    });
  });
});

/** @param {string} workspaceRoot @param {string} transactionParent */
function assertNoT011TransactionMaterial(workspaceRoot, transactionParent) {
  const relativeParent = path.relative(workspaceRoot, transactionParent);
  const topLevel = relativeParent.split(path.sep)[0];
  const topLevelPath = path.join(workspaceRoot, topLevel);
  if (!fs.existsSync(topLevelPath)) return;
  assert.equal(
    snapshotWorkspace(workspaceRoot).some((entry) => (
      entry.path.includes('directory-import-')
      || entry.path.includes('.dude-import-')
    )),
    false,
  );
}

test('T011 apply authority rejects forged, cloned, reused, and concurrently reused tokens before mutation', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'apply-authority',
    });
    const before = snapshotWorkspace(workspaceRoot);
    for (const token of [
      null,
      {},
      { plan: prepared.plan, transaction_parent: prepared.token.transaction_parent },
      structuredClone(prepared.token),
    ]) {
      await assert.rejects(
        applyDirectoryPreflight(token),
        /genuine unconsumed preflight token/,
      );
      assert.deepEqual(snapshotWorkspace(workspaceRoot), before);
    }

    const first = applyDirectoryPreflight(prepared.token);
    await assert.rejects(
      applyDirectoryPreflight(prepared.token),
      /genuine unconsumed preflight token/,
    );
    const result = await first;
    assert.equal(result.status, 'installed');
    const installed = snapshotWorkspace(workspaceRoot);
    await assert.rejects(
      applyDirectoryPreflight(prepared.token),
      /genuine unconsumed preflight token/,
    );
    assert.deepEqual(snapshotWorkspace(workspaceRoot), installed);
  });
});

test('T011 apply result has exact arity, fields, deep freeze, and defensive ownership', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'apply-result-ownership',
    });
    const result = await applyDirectoryPreflight(prepared.token);

    assert.equal(applyDirectoryPreflight.length, 1);
    assert.equal(validateDirectoryImportResult.length, 1);
    assert.deepEqual(Object.keys(result), [
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
    ]);
    assert.equal(validateDirectoryImportResult(result), true);
    assertDeepFrozen(result);
    assert.throws(() => result.written_paths.push('changed/path'), TypeError);
    assert.throws(() => { result.message = 'changed'; }, TypeError);
    assert.deepEqual(result.written_paths, prepared.plan.outputs.map(
      (output) => output.destination_path,
    ));
  });
});

test('T011 transaction parent recheck refuses drift, links, case aliases, and non-directories before nonce creation', { concurrency: false }, async (t) => {
  const cases = [
    {
      name: 'identity drift',
      setup(transactionParent) {
        fs.mkdirSync(transactionParent, { recursive: true });
      },
      expected: /transaction parent changed after apply preflight/,
    },
    {
      name: 'symbolic link',
      setup(transactionParent, workspaceRoot) {
        const target = path.join(workspaceRoot, 'transaction-link-target');
        fs.mkdirSync(target);
        fs.symlinkSync(target, path.dirname(path.dirname(transactionParent)));
      },
      expected: /transaction parent is no longer safe/,
    },
    {
      name: 'case alias',
      setup(transactionParent, workspaceRoot, subtest) {
        const alias = path.join(workspaceRoot, '.DUDE');
        fs.mkdirSync(alias);
        if (
          fs.existsSync(path.join(workspaceRoot, '.dude'))
          && fs.realpathSync(path.join(workspaceRoot, '.dude')) === fs.realpathSync(alias)
        ) {
          subtest.skip('filesystem cannot represent a case-distinct transaction alias');
          return false;
        }
        return true;
      },
      expected: /transaction parent is no longer safe/,
    },
    {
      name: 'non-directory component',
      setup(transactionParent, workspaceRoot) {
        writeWorkspaceFile(workspaceRoot, '.dude', 'not a directory\n');
      },
      expected: /transaction parent is no longer safe/,
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, { concurrency: false }, async (subtest) => {
      await withWorkspace(async (workspaceRoot) => {
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `parent-${fixtureCase.name.replaceAll(' ', '-')}`,
        });
        if (fixtureCase.setup(
          prepared.token.transaction_parent,
          workspaceRoot,
          subtest,
        ) === false) return;
        const beforeApply = snapshotWorkspace(workspaceRoot);

        await assert.rejects(
          applyDirectoryPreflight(prepared.token),
          fixtureCase.expected,
        );
        assert.deepEqual(snapshotWorkspace(workspaceRoot), beforeApply);
        assertNoT011TransactionMaterial(
          workspaceRoot,
          prepared.token.transaction_parent,
        );
        assert.equal(fs.existsSync(prepared.absolute('SKILL.md')), false);
      });
    });
  }
});

test('T011 transaction overlap recheck removes created parents and refuses before nonce creation', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'parent-overlap-recheck',
    });
    const outputPath = prepared.absolute('SKILL.md');
    const transactionParent = path.resolve(prepared.token.transaction_parent);
    const beforeApply = snapshotWorkspace(workspaceRoot);
    const originalRealpathSync = fs.realpathSync;
    fs.realpathSync = (candidatePath, options) => {
      const resolved = originalRealpathSync(candidatePath, options);
      if (path.resolve(String(candidatePath)) !== transactionParent) return resolved;
      return options === 'buffer' || (options && options.encoding === 'buffer')
        ? Buffer.from(outputPath)
        : outputPath;
    };
    try {
      await assert.rejects(
        applyDirectoryPreflight(prepared.token),
        /transaction parent overlaps the source or outputs/,
      );
    } finally {
      fs.realpathSync = originalRealpathSync;
    }

    assert.deepEqual(snapshotWorkspace(workspaceRoot), beforeApply);
    assertNoT011TransactionMaterial(workspaceRoot, transactionParent);
    assert.equal(fs.existsSync(outputPath), false);
  });
});

test('T011 failures before nonce creation throw while staging failures return a rollback result', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const beforeNonce = await t011ApplyFixture(workspaceRoot, {
      name: 'pre-nonce-failure',
    });
    const beforeApply = snapshotWorkspace(workspaceRoot);
    const originalMkdtempSync = fs.mkdtempSync;
    fs.mkdtempSync = (prefix, options) => {
      if (path.resolve(String(prefix)).startsWith(
        `${path.resolve(beforeNonce.token.transaction_parent)}${path.sep}`,
      )) {
        throw new Error('injected pre-nonce creation failure');
      }
      return originalMkdtempSync(prefix, options);
    };
    try {
      await assert.rejects(
        applyDirectoryPreflight(beforeNonce.token),
        /injected pre-nonce creation failure/,
      );
    } finally {
      fs.mkdtempSync = originalMkdtempSync;
    }
    assert.deepEqual(snapshotWorkspace(workspaceRoot), beforeApply);

    const afterNonce = await t011ApplyFixture(workspaceRoot, {
      name: 'post-nonce-failure',
    });
    const stagedSuffix = path.join(
      'staged',
      ...afterNonce.plan.outputs[0].destination_path.split('/'),
    );
    const originalOpenSync = fs.openSync;
    fs.openSync = (candidatePath, flags, mode) => {
      if (
        String(candidatePath).endsWith(stagedSuffix)
        && (Number(flags) & fs.constants.O_CREAT) !== 0
      ) {
        throw new Error('injected post-nonce staging failure');
      }
      return originalOpenSync(candidatePath, flags, mode);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(afterNonce.token);
    } finally {
      fs.openSync = originalOpenSync;
    }
    assert.equal(result.status, 'rolled-back');
    assert.deepEqual(result.restored_paths, []);
    assert.deepEqual(
      result.unchanged_paths,
      afterNonce.plan.outputs.map((output) => output.destination_path),
    );
    assert.equal(fs.existsSync(afterNonce.absolute('SKILL.md')), false);
  });
});

test('T011 nonce, staged outputs, and backups remain private, owned, unlinked, and contained', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'transaction-privacy',
      replacements: { 'SKILL.md': 'private original bytes\n' },
      support: { 'support.txt': 'private staged bytes\n' },
    });
    const originalRenameSync = fs.renameSync;
    let inspected = false;
    fs.renameSync = (sourcePath, destinationPath) => {
      if (!inspected && path.resolve(String(destinationPath)) === path.resolve(prepared.absolute('SKILL.md'))) {
        inspected = true;
        const nonceNames = fs.readdirSync(prepared.token.transaction_parent)
          .filter((name) => name.startsWith('directory-import-'));
        assert.equal(nonceNames.length, 1);
        const noncePath = path.join(prepared.token.transaction_parent, nonceNames[0]);
        const canonicalNonce = fs.realpathSync(noncePath);
        const canonicalParent = fs.realpathSync(prepared.token.transaction_parent);
        const relativeNonce = path.relative(canonicalParent, canonicalNonce);
        assert.notEqual(relativeNonce, '');
        assert.equal(path.isAbsolute(relativeNonce), false);
        assert.equal(relativeNonce.startsWith(`..${path.sep}`), false);

        const expectedPrivateFiles = new Set([
          ...prepared.plan.outputs.map((output) => path.join(
            noncePath,
            'staged',
            ...output.destination_path.split('/'),
          )),
          path.join(
            noncePath,
            'backups',
            ...prepared.plan.outputs[0].destination_path.split('/'),
          ),
        ].map((filePath) => path.resolve(filePath)));
        const observedPrivateFiles = new Set();
        const pendingDirectories = [noncePath];
        while (pendingDirectories.length > 0) {
          const directory = pendingDirectories.pop();
          const directoryStat = fs.lstatSync(directory);
          assert.equal(directoryStat.isDirectory(), true);
          assert.equal(directoryStat.isSymbolicLink(), false);
          if (process.platform !== 'win32') {
            assert.equal(directoryStat.mode & 0o7777, 0o700);
            if (typeof process.getuid === 'function') {
              assert.equal(directoryStat.uid, process.getuid());
            }
          }
          for (const name of fs.readdirSync(directory)) {
            const child = path.join(directory, name);
            const childStat = fs.lstatSync(child);
            assert.equal(childStat.isSymbolicLink(), false);
            const relativeChild = path.relative(canonicalNonce, fs.realpathSync(child));
            assert.equal(path.isAbsolute(relativeChild), false);
            assert.equal(relativeChild.startsWith(`..${path.sep}`), false);
            if (childStat.isDirectory()) {
              pendingDirectories.push(child);
            } else {
              assert.equal(childStat.isFile(), true);
              assert.equal(childStat.nlink, 1);
              if (process.platform !== 'win32') {
                assert.equal(childStat.mode & 0o7777, 0o600);
                if (typeof process.getuid === 'function') {
                  assert.equal(childStat.uid, process.getuid());
                }
              }
              observedPrivateFiles.add(path.resolve(child));
            }
          }
        }
        assert.deepEqual(observedPrivateFiles, expectedPrivateFiles);
      }
      return originalRenameSync(sourcePath, destinationPath);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.renameSync = originalRenameSync;
    }

    assert.equal(inspected, true);
    assert.equal(result.status, 'installed');
    assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
  });
});

test('T011 staging failure and corruption at every output leave every destination unchanged', { concurrency: false }, async (t) => {
  for (const fault of ['create failure', 'corruption']) {
    for (const targetIndex of [0, 1, 2]) {
      await t.test(`${fault} at output ${targetIndex + 1}`, { concurrency: false }, async () => {
        await withWorkspace(async (workspaceRoot) => {
          const originalSkill = Buffer.from(`original skill ${targetIndex}\n`);
          const originalLast = Buffer.from(`original last ${targetIndex}\n`);
          const prepared = await t011ApplyFixture(workspaceRoot, {
            name: `stage-${fault.replace(' ', '-')}-${targetIndex}`,
            support: {
              'middle.txt': `middle output ${targetIndex}\n`,
              'z-last.txt': `last output ${targetIndex}\n`,
            },
            replacements: {
              'SKILL.md': originalSkill,
              'z-last.txt': originalLast,
            },
          });
          const target = prepared.plan.outputs[targetIndex];
          const targetSuffix = path.join(
            'staged',
            ...target.destination_path.split('/'),
          );
          const beforeDestinations = new Map(prepared.plan.outputs.map((output) => [
            output.destination_path,
            fs.existsSync(path.join(workspaceRoot, ...output.destination_path.split('/')))
              ? fs.readFileSync(path.join(workspaceRoot, ...output.destination_path.split('/')))
              : null,
          ]));
          const destinationPaths = new Set(prepared.plan.outputs.map((output) => (
            path.resolve(workspaceRoot, ...output.destination_path.split('/'))
          )));
          const originalOpenSync = fs.openSync;
          const originalRenameSync = fs.renameSync;
          let injected = false;
          let destinationMutations = 0;
          fs.openSync = (candidatePath, flags, mode) => {
            const isTarget = String(candidatePath).endsWith(targetSuffix);
            const creates = (Number(flags) & fs.constants.O_CREAT) !== 0;
            if (creates && destinationPaths.has(path.resolve(String(candidatePath)))) {
              destinationMutations += 1;
            }
            if (!injected && isTarget && fault === 'create failure' && creates) {
              injected = true;
              throw new Error(`injected staging creation failure ${targetIndex}`);
            }
            if (!injected && isTarget && fault === 'corruption' && !creates) {
              injected = true;
              fs.appendFileSync(candidatePath, 'injected staging corruption');
            }
            return originalOpenSync(candidatePath, flags, mode);
          };
          fs.renameSync = (sourcePath, destinationPath) => {
            if (destinationPaths.has(path.resolve(String(destinationPath)))) {
              destinationMutations += 1;
            }
            return originalRenameSync(sourcePath, destinationPath);
          };
          let result;
          try {
            result = await applyDirectoryPreflight(prepared.token);
          } finally {
            fs.openSync = originalOpenSync;
            fs.renameSync = originalRenameSync;
          }

          assert.equal(injected, true);
          assert.equal(destinationMutations, 0);
          assert.equal(result.status, 'rolled-back');
          assert.deepEqual(result.restored_paths, []);
          assert.deepEqual(
            result.unchanged_paths,
            prepared.plan.outputs.map((output) => output.destination_path),
          );
          assert.deepEqual(result.uncertain_paths, []);
          assert.equal(result.recovery_directory, null);
          for (const [destinationPath, originalBytes] of beforeDestinations) {
            const absolutePath = path.join(workspaceRoot, ...destinationPath.split('/'));
            if (originalBytes === null) {
              assert.equal(fs.existsSync(absolutePath), false);
            } else {
              assert.deepEqual(fs.readFileSync(absolutePath), originalBytes);
            }
          }
          assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
        });
      });
    }
  }
});

test('T011 backup failure and corruption at every replacement leave all outputs unchanged', { concurrency: false }, async (t) => {
  for (const fault of ['create failure', 'corruption']) {
    for (const targetIndex of [0, 1, 2]) {
      await t.test(`${fault} at replacement ${targetIndex + 1}`, { concurrency: false }, async () => {
        await withWorkspace(async (workspaceRoot) => {
          const prepared = await t011ApplyFixture(workspaceRoot, {
            name: `backup-${fault.replace(' ', '-')}-${targetIndex}`,
            support: {
              'middle.txt': `new middle ${targetIndex}\n`,
              'z-last.txt': `new last ${targetIndex}\n`,
            },
            replacements: {
              'SKILL.md': `old skill ${targetIndex}\n`,
              'middle.txt': `old middle ${targetIndex}\n`,
              'z-last.txt': `old last ${targetIndex}\n`,
            },
          });
          const target = prepared.plan.outputs[targetIndex];
          const targetSuffix = path.join(
            'backups',
            ...target.destination_path.split('/'),
          );
          const beforeDestinations = new Map(prepared.plan.outputs.map((output) => [
            output.destination_path,
            fs.readFileSync(path.join(workspaceRoot, ...output.destination_path.split('/'))),
          ]));
          const destinationPaths = new Set(prepared.plan.outputs.map((output) => (
            path.resolve(workspaceRoot, ...output.destination_path.split('/'))
          )));
          const originalOpenSync = fs.openSync;
          const originalRenameSync = fs.renameSync;
          let injected = false;
          let destinationMutations = 0;
          fs.openSync = (candidatePath, flags, mode) => {
            const resolved = path.resolve(String(candidatePath));
            const creates = (Number(flags) & fs.constants.O_CREAT) !== 0;
            if (creates && destinationPaths.has(resolved)) destinationMutations += 1;
            const isTarget = String(candidatePath).endsWith(targetSuffix);
            if (!injected && isTarget && fault === 'create failure' && creates) {
              injected = true;
              throw new Error(`injected backup creation failure ${targetIndex}`);
            }
            if (!injected && isTarget && fault === 'corruption' && !creates) {
              injected = true;
              fs.appendFileSync(candidatePath, 'injected backup corruption');
            }
            return originalOpenSync(candidatePath, flags, mode);
          };
          fs.renameSync = (sourcePath, destinationPath) => {
            if (destinationPaths.has(path.resolve(String(destinationPath)))) {
              destinationMutations += 1;
            }
            return originalRenameSync(sourcePath, destinationPath);
          };
          let result;
          try {
            result = await applyDirectoryPreflight(prepared.token);
          } finally {
            fs.openSync = originalOpenSync;
            fs.renameSync = originalRenameSync;
          }

          assert.equal(injected, true);
          assert.equal(destinationMutations, 0);
          assert.equal(result.status, 'rolled-back');
          assert.deepEqual(result.restored_paths, []);
          assert.deepEqual(
            result.unchanged_paths,
            prepared.plan.outputs.map((output) => output.destination_path),
          );
          assert.deepEqual(result.uncertain_paths, []);
          assert.equal(result.recovery_directory, null);
          for (const [destinationPath, originalBytes] of beforeDestinations) {
            assert.deepEqual(
              fs.readFileSync(path.join(workspaceRoot, ...destinationPath.split('/'))),
              originalBytes,
            );
          }
          assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
        });
      });
    }
  }
});

test('T011 stages every output and backs up every replacement before the first sorted destination commit', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'stage-backup-barrier',
      support: {
        'a-created.txt': 'new a\n',
        'middle-replaced.txt': 'new middle\n',
        'z-created.txt': 'new z\n',
      },
      replacements: {
        'SKILL.md': 'old skill\n',
        'middle-replaced.txt': 'old middle\n',
      },
    });
    const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
    const replacementPaths = prepared.plan.outputs
      .filter((output) => output.destination_state.type === 'regular-file')
      .map((output) => output.destination_path);
    const absoluteToDestination = new Map(outputPaths.map((destinationPath) => [
      path.resolve(workspaceRoot, ...destinationPath.split('/')),
      destinationPath,
    ]));
    const staged = new Set();
    const backedUp = new Set();
    const commits = [];
    let barrierChecked = false;
    const classifyPrivatePath = (candidatePath, tree) => outputPaths.find((destinationPath) => (
      String(candidatePath).endsWith(path.join(tree, ...destinationPath.split('/')))
    ));
    const checkBarrier = () => {
      if (barrierChecked) return;
      barrierChecked = true;
      assert.deepEqual([...staged].sort(compareRaw), outputPaths);
      assert.deepEqual([...backedUp].sort(compareRaw), replacementPaths);
    };
    const originalOpenSync = fs.openSync;
    const originalRenameSync = fs.renameSync;
    fs.openSync = (candidatePath, flags, mode) => {
      const creates = (Number(flags) & fs.constants.O_CREAT) !== 0;
      if (creates) {
        const stagedPath = classifyPrivatePath(candidatePath, 'staged');
        if (stagedPath) staged.add(stagedPath);
        const backupPath = classifyPrivatePath(candidatePath, 'backups');
        if (backupPath) backedUp.add(backupPath);
        const destinationPath = absoluteToDestination.get(path.resolve(String(candidatePath)));
        if (destinationPath) {
          checkBarrier();
          commits.push(destinationPath);
        }
      }
      return originalOpenSync(candidatePath, flags, mode);
    };
    fs.renameSync = (sourcePath, destinationPath) => {
      const destination = absoluteToDestination.get(path.resolve(String(destinationPath)));
      if (destination) {
        checkBarrier();
        commits.push(destination);
      }
      return originalRenameSync(sourcePath, destinationPath);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.openSync = originalOpenSync;
      fs.renameSync = originalRenameSync;
    }

    assert.equal(result.status, 'installed');
    assert.equal(barrierChecked, true);
    assert.deepEqual(commits, outputPaths);
    assert.deepEqual(result.written_paths, outputPaths);
    assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
  });
});

test('T011 simultaneous staged and backup corruption is detected before destination writes', { concurrency: false }, async (t) => {
  for (const tree of ['staged', 'backups']) {
    await t.test(tree, { concurrency: false }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `multiple-${tree}-corruption`,
          support: {
            'middle.txt': 'new middle\n',
            'z-last.txt': 'new last\n',
          },
          replacements: tree === 'backups' ? {
            'SKILL.md': 'old skill\n',
            'middle.txt': 'old middle\n',
            'z-last.txt': 'old last\n',
          } : {},
        });
        const pathsToCorrupt = prepared.plan.outputs.slice(0, 2).map((output) => (
          output.destination_path
        ));
        let corruptions = 0;
        prepared.fixture.state.revalidateHook = () => {
          const nonce = fs.readdirSync(prepared.token.transaction_parent)
            .find((name) => name.startsWith('directory-import-'));
          assert.ok(nonce);
          for (const destinationPath of pathsToCorrupt) {
            fs.appendFileSync(
              path.join(
                prepared.token.transaction_parent,
                nonce,
                tree,
                ...destinationPath.split('/'),
              ),
              `corrupt ${tree}\n`,
            );
            corruptions += 1;
          }
        };
        const destinationPaths = new Set(prepared.plan.outputs.map((output) => (
          path.resolve(workspaceRoot, ...output.destination_path.split('/'))
        )));
        let destinationMutations = 0;
        const originalOpenSync = fs.openSync;
        const originalRenameSync = fs.renameSync;
        fs.openSync = (candidatePath, flags, mode) => {
          if (
            destinationPaths.has(path.resolve(String(candidatePath)))
            && (Number(flags) & fs.constants.O_CREAT) !== 0
          ) {
            destinationMutations += 1;
          }
          return originalOpenSync(candidatePath, flags, mode);
        };
        fs.renameSync = (sourcePath, destinationPath) => {
          if (destinationPaths.has(path.resolve(String(destinationPath)))) {
            destinationMutations += 1;
          }
          return originalRenameSync(sourcePath, destinationPath);
        };
        let result;
        try {
          result = await applyDirectoryPreflight(prepared.token);
        } finally {
          fs.openSync = originalOpenSync;
          fs.renameSync = originalRenameSync;
        }

        assert.equal(corruptions, 2);
        assert.equal(destinationMutations, 0);
        assert.equal(result.status, 'rolled-back');
        assert.deepEqual(result.restored_paths, []);
        assert.deepEqual(
          result.unchanged_paths,
          prepared.plan.outputs.map((output) => output.destination_path),
        );
        assert.deepEqual(result.uncertain_paths, []);
        assert.equal(result.recovery_directory, null);
        assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
      });
    });
  }
});

test('T011 final pre-write source, destination, overlap, and transaction drift cause zero destination writes', { concurrency: false }, async (t) => {
  const cases = [
    {
      name: 'source drift',
      replacements: {},
      install(prepared) {
        prepared.fixture.state.revalidateHook = () => {
          throw new Error('injected final source drift');
        };
        return () => {};
      },
      expected: /injected final source drift/,
    },
    {
      name: 'destination drift',
      replacements: { 'SKILL.md': 'destination prestate\n' },
      install(prepared) {
        let finalPhase = false;
        let injected = false;
        prepared.fixture.state.revalidateHook = () => { finalPhase = true; };
        const target = path.resolve(prepared.absolute('SKILL.md'));
        const originalLstatSync = fs.lstatSync;
        fs.lstatSync = (candidatePath, options) => {
          const stat = originalLstatSync(candidatePath, options);
          if (!finalPhase || injected || path.resolve(String(candidatePath)) !== target) {
            return stat;
          }
          return new Proxy(stat, {
            get(value, key) {
              if (key === 'isFile') {
                injected = true;
                return () => false;
              }
              const property = Reflect.get(value, key, value);
              return typeof property === 'function' ? property.bind(value) : property;
            },
          });
        };
        return () => {
          fs.lstatSync = originalLstatSync;
          assert.equal(injected, true);
        };
      },
      expected: /destination changed during final apply preflight/,
    },
    {
      name: 'overlap drift',
      replacements: {},
      install(prepared) {
        let finalPhase = false;
        let injected = false;
        prepared.fixture.state.revalidateHook = () => { finalPhase = true; };
        const transactionParent = path.resolve(prepared.token.transaction_parent);
        const outputPath = path.resolve(prepared.absolute('SKILL.md'));
        const originalRealpathSync = fs.realpathSync;
        fs.realpathSync = (candidatePath, options) => {
          if (
            finalPhase
            && !injected
            && path.resolve(String(candidatePath)) === transactionParent
          ) {
            injected = true;
            return options === 'buffer' || (options && options.encoding === 'buffer')
              ? Buffer.from(outputPath)
              : outputPath;
          }
          return originalRealpathSync(candidatePath, options);
        };
        return () => {
          fs.realpathSync = originalRealpathSync;
          assert.equal(injected, true);
        };
      },
      expected: /transaction parent overlaps the source or outputs/,
    },
    {
      name: 'transaction drift',
      replacements: {},
      install(prepared) {
        let finalPhase = false;
        let injected = false;
        prepared.fixture.state.revalidateHook = () => { finalPhase = true; };
        const transactionParent = path.resolve(prepared.token.transaction_parent);
        const originalLstatSync = fs.lstatSync;
        fs.lstatSync = (candidatePath, options) => {
          const stat = originalLstatSync(candidatePath, options);
          if (
            !finalPhase
            || injected
            || path.resolve(String(candidatePath)) !== transactionParent
          ) {
            return stat;
          }
          injected = true;
          return new Proxy(stat, {
            get(value, key) {
              if (key === 'isDirectory') return () => false;
              const property = Reflect.get(value, key, value);
              return typeof property === 'function' ? property.bind(value) : property;
            },
          });
        };
        return () => {
          fs.lstatSync = originalLstatSync;
          assert.equal(injected, true);
        };
      },
      expected: /transaction parent is no longer safe/,
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, { concurrency: false }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `final-${fixtureCase.name.replace(' ', '-')}`,
          support: { 'support.txt': 'support output\n' },
          replacements: fixtureCase.replacements,
        });
        const destinationPaths = new Set(prepared.plan.outputs.map((output) => (
          path.resolve(workspaceRoot, ...output.destination_path.split('/'))
        )));
        let destinationMutations = 0;
        const originalOpenSync = fs.openSync;
        const originalRenameSync = fs.renameSync;
        fs.openSync = (candidatePath, flags, mode) => {
          if (
            destinationPaths.has(path.resolve(String(candidatePath)))
            && (Number(flags) & fs.constants.O_CREAT) !== 0
          ) {
            destinationMutations += 1;
          }
          return originalOpenSync(candidatePath, flags, mode);
        };
        fs.renameSync = (sourcePath, destinationPath) => {
          if (destinationPaths.has(path.resolve(String(destinationPath)))) {
            destinationMutations += 1;
          }
          return originalRenameSync(sourcePath, destinationPath);
        };
        const restoreFault = fixtureCase.install(prepared);
        let result;
        try {
          result = await applyDirectoryPreflight(prepared.token);
        } finally {
          restoreFault();
          fs.openSync = originalOpenSync;
          fs.renameSync = originalRenameSync;
        }

        assert.equal(destinationMutations, 0);
        assert.equal(result.status, 'rolled-back');
        assert.deepEqual(result.written_paths, []);
        assert.deepEqual(result.restored_paths, []);
        assert.deepEqual(
          result.unchanged_paths,
          prepared.plan.outputs.map((output) => output.destination_path),
        );
        assert.deepEqual(result.uncertain_paths, []);
        assert.equal(result.recovery_directory, null);
        assert.match(result.message, fixtureCase.expected);
        assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
      });
    });
  }
});

test('T011 same-hash inode replacement after staging is uncertain with zero importer destination writes', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const originalBytes = Buffer.from('same hash different inode\n');
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'final-same-hash-inode',
      replacements: { 'SKILL.md': originalBytes },
    });
    const destinationPath = prepared.plan.outputs[0].destination_path;
    const target = path.resolve(prepared.absolute('SKILL.md'));
    const replacement = `${target}.external-replacement`;
    fs.writeFileSync(replacement, originalBytes);
    if (process.platform !== 'win32') {
      fs.chmodSync(replacement, fs.statSync(target).mode & 0o7777);
    }
    const originalIdentity = fs.lstatSync(target, { bigint: true }).ino;
    const originalOpenSync = fs.openSync;
    const originalRenameSync = fs.renameSync;
    let importerDestinationWrites = 0;
    let replacementIdentity;
    prepared.fixture.state.revalidateHook = () => {
      originalRenameSync(replacement, target);
      replacementIdentity = fs.lstatSync(target, { bigint: true }).ino;
      assert.notEqual(replacementIdentity, originalIdentity);
    };
    fs.openSync = (candidatePath, flags, mode) => {
      if (
        path.resolve(String(candidatePath)) === target
        && (Number(flags) & fs.constants.O_CREAT) !== 0
      ) {
        importerDestinationWrites += 1;
      }
      return originalOpenSync(candidatePath, flags, mode);
    };
    fs.renameSync = (sourcePath, destinationPathValue) => {
      if (path.resolve(String(destinationPathValue)) === target) {
        importerDestinationWrites += 1;
      }
      return originalRenameSync(sourcePath, destinationPathValue);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.openSync = originalOpenSync;
      fs.renameSync = originalRenameSync;
    }

    assert.equal(importerDestinationWrites, 0);
    assert.equal(result.status, 'recovery-failed');
    assert.deepEqual(result.restored_paths, []);
    assert.deepEqual(result.unchanged_paths, []);
    assert.ok(result.uncertain_paths.includes(destinationPath));
    assert.ok(result.uncertain_paths.includes(result.recovery_directory));
    assert.match(result.message, /destination changed during final apply preflight/);
    assert.deepEqual(fs.readFileSync(target), originalBytes);
    assert.equal(fs.lstatSync(target, { bigint: true }).ino, replacementIdentity);
  });
});

test('T011 ancestor identity swap after staging refuses with zero destination writes', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const originalBytes = Buffer.from('ancestor swap prestate\n');
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'final-ancestor-identity',
      replacements: { 'SKILL.md': originalBytes },
    });
    const destinationPath = prepared.plan.outputs[0].destination_path;
    const target = path.resolve(prepared.absolute('SKILL.md'));
    const destinationRoot = path.dirname(target);
    const displacedRoot = `${destinationRoot}.displaced`;
    const originalAncestorIdentity = fs.lstatSync(destinationRoot, { bigint: true }).ino;
    const originalFileIdentity = fs.lstatSync(target, { bigint: true }).ino;
    const originalOpenSync = fs.openSync;
    const originalRenameSync = fs.renameSync;
    let importerDestinationWrites = 0;
    prepared.fixture.state.revalidateHook = () => {
      originalRenameSync(destinationRoot, displacedRoot);
      fs.mkdirSync(destinationRoot);
      originalRenameSync(path.join(displacedRoot, 'SKILL.md'), target);
      fs.rmdirSync(displacedRoot);
      assert.notEqual(
        fs.lstatSync(destinationRoot, { bigint: true }).ino,
        originalAncestorIdentity,
      );
      assert.equal(fs.lstatSync(target, { bigint: true }).ino, originalFileIdentity);
    };
    fs.openSync = (candidatePath, flags, mode) => {
      if (
        path.resolve(String(candidatePath)) === target
        && (Number(flags) & fs.constants.O_CREAT) !== 0
      ) {
        importerDestinationWrites += 1;
      }
      return originalOpenSync(candidatePath, flags, mode);
    };
    fs.renameSync = (sourcePath, destinationPathValue) => {
      if (path.resolve(String(destinationPathValue)) === target) {
        importerDestinationWrites += 1;
      }
      return originalRenameSync(sourcePath, destinationPathValue);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.openSync = originalOpenSync;
      fs.renameSync = originalRenameSync;
    }

    assert.equal(importerDestinationWrites, 0);
    assert.equal(result.status, 'rolled-back');
    assert.deepEqual(result.restored_paths, []);
    assert.deepEqual(result.unchanged_paths, [destinationPath]);
    assert.deepEqual(result.uncertain_paths, []);
    assert.equal(result.recovery_directory, null);
    assert.match(result.message, /source or output planning facts changed/);
    assert.deepEqual(fs.readFileSync(target), originalBytes);
  });
});

test('T011 sorted pre-create failures at first, middle, and last output restore only prior mutations', { concurrency: false }, async (t) => {
  for (const targetIndex of [0, 1, 2]) {
    await t.test(`create ${targetIndex + 1}`, { concurrency: false }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `sorted-create-${targetIndex}`,
          support: {
            'middle.txt': `middle ${targetIndex}\n`,
            'z-last.txt': `last ${targetIndex}\n`,
          },
        });
        const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
        const absoluteToDestination = new Map(outputPaths.map((destinationPath) => [
          path.resolve(workspaceRoot, ...destinationPath.split('/')),
          destinationPath,
        ]));
        const attempts = [];
        const rollbacks = [];
        let failed = false;
        const originalOpenSync = fs.openSync;
        const originalUnlinkSync = fs.unlinkSync;
        fs.openSync = (candidatePath, flags, mode) => {
          const destinationPath = absoluteToDestination.get(path.resolve(String(candidatePath)));
          if (destinationPath && (Number(flags) & fs.constants.O_CREAT) !== 0) {
            attempts.push(destinationPath);
            if (destinationPath === outputPaths[targetIndex]) {
              failed = true;
              throw new Error(`injected sorted create failure ${targetIndex}`);
            }
          }
          return originalOpenSync(candidatePath, flags, mode);
        };
        fs.unlinkSync = (candidatePath) => {
          const destinationPath = absoluteToDestination.get(path.resolve(String(candidatePath)));
          if (failed && destinationPath) rollbacks.push(destinationPath);
          return originalUnlinkSync(candidatePath);
        };
        let result;
        try {
          result = await applyDirectoryPreflight(prepared.token);
        } finally {
          fs.openSync = originalOpenSync;
          fs.unlinkSync = originalUnlinkSync;
        }

        assert.deepEqual(attempts, outputPaths.slice(0, targetIndex + 1));
        assert.deepEqual(rollbacks, outputPaths.slice(0, targetIndex).reverse());
        assert.equal(result.status, 'rolled-back');
        assert.deepEqual(result.written_paths, []);
        assert.deepEqual(result.restored_paths, outputPaths.slice(0, targetIndex));
        assert.deepEqual(result.unchanged_paths, outputPaths.slice(targetIndex));
        assert.deepEqual(result.uncertain_paths, []);
        assert.equal(result.recovery_directory, null);
        assert.deepEqual(
          [...result.restored_paths, ...result.unchanged_paths].sort(compareRaw),
          outputPaths,
        );
        for (const destinationPath of outputPaths) {
          assert.equal(
            fs.existsSync(path.join(workspaceRoot, ...destinationPath.split('/'))),
            false,
          );
        }
      });
    });
  }
});

test('T011 sorted pre-rename failures at first, middle, and last output restore only prior mutations', { concurrency: false }, async (t) => {
  for (const targetIndex of [0, 1, 2]) {
    await t.test(`replacement ${targetIndex + 1}`, { concurrency: false }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const originals = {
          'SKILL.md': Buffer.from(`original skill ${targetIndex}\n`),
          'middle.txt': Buffer.from(`original middle ${targetIndex}\n`),
          'z-last.txt': Buffer.from(`original last ${targetIndex}\n`),
        };
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `sorted-replacement-${targetIndex}`,
          support: {
            'middle.txt': `new middle ${targetIndex}\n`,
            'z-last.txt': `new last ${targetIndex}\n`,
          },
          replacements: originals,
        });
        const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
        const absoluteToDestination = new Map(outputPaths.map((destinationPath) => [
          path.resolve(workspaceRoot, ...destinationPath.split('/')),
          destinationPath,
        ]));
        const attempts = [];
        const rollbacks = [];
        let failed = false;
        const originalRenameSync = fs.renameSync;
        fs.renameSync = (sourcePath, destinationPath) => {
          const destination = absoluteToDestination.get(path.resolve(String(destinationPath)));
          if (!destination) return originalRenameSync(sourcePath, destinationPath);
          if (failed) {
            rollbacks.push(destination);
          } else {
            attempts.push(destination);
            if (destination === outputPaths[targetIndex]) {
              failed = true;
              throw new Error(`injected sorted replacement failure ${targetIndex}`);
            }
          }
          return originalRenameSync(sourcePath, destinationPath);
        };
        let result;
        try {
          result = await applyDirectoryPreflight(prepared.token);
        } finally {
          fs.renameSync = originalRenameSync;
        }

        assert.deepEqual(attempts, outputPaths.slice(0, targetIndex + 1));
        assert.deepEqual(rollbacks, outputPaths.slice(0, targetIndex).reverse());
        assert.equal(result.status, 'rolled-back');
        assert.deepEqual(result.written_paths, []);
        assert.deepEqual(result.restored_paths, outputPaths.slice(0, targetIndex));
        assert.deepEqual(result.unchanged_paths, outputPaths.slice(targetIndex));
        assert.deepEqual(result.uncertain_paths, []);
        assert.equal(result.recovery_directory, null);
        assert.deepEqual(
          [...result.restored_paths, ...result.unchanged_paths].sort(compareRaw),
          outputPaths,
        );
        for (const [relativePath, originalBytes] of Object.entries(originals)) {
          assert.deepEqual(fs.readFileSync(prepared.absolute(relativePath)), originalBytes);
        }
      });
    });
  }
});

test('T011 partial create is an uncertain mutation and preserves the partial file', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'partial-create-mutation',
      support: { 'support.txt': 'later output\n' },
    });
    const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
    const firstPath = path.resolve(workspaceRoot, ...outputPaths[0].split('/'));
    const descriptors = new Set();
    const originalOpenSync = fs.openSync;
    const originalWriteSync = fs.writeSync;
    let partialBytes;
    fs.openSync = (candidatePath, flags, mode) => {
      const descriptor = originalOpenSync(candidatePath, flags, mode);
      if (
        path.resolve(String(candidatePath)) === firstPath
        && (Number(flags) & fs.constants.O_CREAT) !== 0
      ) {
        descriptors.add(descriptor);
      }
      return descriptor;
    };
    fs.writeSync = (descriptor, buffer, offset, length, position) => {
      if (descriptors.has(descriptor)) {
        descriptors.delete(descriptor);
        const partialLength = Math.min(7, Number(length));
        const written = originalWriteSync(
          descriptor,
          buffer,
          offset,
          partialLength,
          position,
        );
        partialBytes = Buffer.from(buffer.subarray(offset, offset + written));
        throw new Error('injected failure after partial destination write');
      }
      return originalWriteSync(descriptor, buffer, offset, length, position);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.openSync = originalOpenSync;
      fs.writeSync = originalWriteSync;
    }

    assert.ok(partialBytes);
    assert.equal(result.status, 'recovery-failed');
    assert.deepEqual(result.restored_paths, []);
    assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
    assert.ok(result.uncertain_paths.includes(outputPaths[0]));
    assert.ok(result.uncertain_paths.includes(result.recovery_directory));
    assert.deepEqual(fs.readFileSync(firstPath), partialBytes);
  });
});

test('T011 changed created output is preserved and uncertain during rollback', { concurrency: false }, async (t) => {
  const cases = [
    {
      name: 'content mutation',
      skip: false,
      mutate(target, originalOpenSync, originalWriteSync) {
        const descriptor = originalOpenSync(target, fs.constants.O_WRONLY | fs.constants.O_TRUNC);
        try {
          originalWriteSync(descriptor, Buffer.from('external in-place mutation\n'));
        } finally {
          fs.closeSync(descriptor);
        }
      },
      verify(target) {
        assert.equal(fs.readFileSync(target, 'utf8'), 'external in-place mutation\n');
      },
    },
    {
      name: 'POSIX mode mutation',
      skip: process.platform === 'win32',
      mutate(target) {
        fs.chmodSync(target, 0o644);
      },
      verify(target) {
        assert.equal(fs.statSync(target).mode & 0o7777, 0o644);
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, {
      concurrency: false,
      skip: fixtureCase.skip,
    }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `created-${fixtureCase.name.toLowerCase().replaceAll(' ', '-')}`,
          support: {
            'middle.txt': 'middle output\n',
            'z-last.txt': 'last output\n',
          },
        });
        const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
        const firstPath = path.resolve(workspaceRoot, ...outputPaths[0].split('/'));
        const secondPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
        const originalOpenSync = fs.openSync;
        const originalWriteSync = fs.writeSync;
        let mutated = false;
        fs.openSync = (candidatePath, flags, mode) => {
          if (
            !mutated
            && path.resolve(String(candidatePath)) === secondPath
            && (Number(flags) & fs.constants.O_CREAT) !== 0
          ) {
            mutated = true;
            fixtureCase.mutate(firstPath, originalOpenSync, originalWriteSync);
            throw new Error(`injected later failure after ${fixtureCase.name}`);
          }
          return originalOpenSync(candidatePath, flags, mode);
        };
        let result;
        try {
          result = await applyDirectoryPreflight(prepared.token);
        } finally {
          fs.openSync = originalOpenSync;
        }

        assert.equal(mutated, true);
        assert.equal(result.status, 'recovery-failed');
        assert.deepEqual(result.restored_paths, []);
        assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
        assert.ok(result.uncertain_paths.includes(outputPaths[0]));
        assert.ok(result.uncertain_paths.includes(result.recovery_directory));
        fixtureCase.verify(firstPath);
      });
    });
  }
});

test('T011 final output corruption and verification-read failure trigger recovery without false success', { concurrency: false }, async (t) => {
  for (const fault of ['output corruption', 'verification read failure']) {
    await t.test(fault, { concurrency: false }, async () => {
      await withWorkspace(async (workspaceRoot) => {
        const originalBytes = Buffer.from(`original ${fault}\n`);
        const prepared = await t011ApplyFixture(workspaceRoot, {
          name: `final-${fault.replaceAll(' ', '-')}`,
          replacements: { 'SKILL.md': originalBytes },
        });
        const target = path.resolve(prepared.absolute('SKILL.md'));
        let committed = false;
        let postCommitReads = 0;
        let rollbackRenames = 0;
        let injected = false;
        const originalOpenSync = fs.openSync;
        const originalRenameSync = fs.renameSync;
        const originalWriteSync = fs.writeSync;
        fs.renameSync = (sourcePath, destinationPath) => {
          const isTarget = path.resolve(String(destinationPath)) === target;
          const result = originalRenameSync(sourcePath, destinationPath);
          if (isTarget) {
            if (committed) rollbackRenames += 1;
            committed = true;
          }
          return result;
        };
        fs.openSync = (candidatePath, flags, mode) => {
          if (
            committed
            && path.resolve(String(candidatePath)) === target
            && (Number(flags) & fs.constants.O_ACCMODE) === fs.constants.O_RDONLY
          ) {
            postCommitReads += 1;
            if (!injected && postCommitReads === 3) {
              injected = true;
              if (fault === 'verification read failure') {
                throw new Error('injected final verification read failure');
              }
              const descriptor = originalOpenSync(
                target,
                fs.constants.O_WRONLY | fs.constants.O_APPEND,
              );
              try {
                originalWriteSync(descriptor, Buffer.from('corrupt'));
              } finally {
                fs.closeSync(descriptor);
              }
            }
          }
          return originalOpenSync(candidatePath, flags, mode);
        };
        let result;
        try {
          result = await applyDirectoryPreflight(prepared.token);
        } finally {
          fs.openSync = originalOpenSync;
          fs.renameSync = originalRenameSync;
        }

        assert.equal(injected, true);
        assert.notEqual(result.status, 'installed');
        assert.deepEqual(result.written_paths, []);
        assert.match(result.message, /final output verification failed/);
        if (fault === 'verification read failure') {
          assert.equal(result.status, 'rolled-back');
          assert.equal(rollbackRenames, 1);
          assert.deepEqual(result.restored_paths, [prepared.plan.outputs[0].destination_path]);
          assert.deepEqual(result.uncertain_paths, []);
          assert.equal(result.recovery_directory, null);
          assert.deepEqual(fs.readFileSync(target), originalBytes);
        } else {
          assert.equal(result.status, 'recovery-failed');
          assert.equal(rollbackRenames, 0);
          assert.deepEqual(result.restored_paths, []);
          assert.deepEqual(result.unchanged_paths, []);
          assert.ok(result.uncertain_paths.includes(prepared.plan.outputs[0].destination_path));
          assert.ok(result.uncertain_paths.includes(result.recovery_directory));
          assert.equal(
            fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
              .isDirectory(),
            true,
          );
        }
      });
    });
  }
});

test('T011 rollback and cleanup failures retain recovery material and classify every uncertain path', { concurrency: false }, async (t) => {
  await t.test('cannot remove a created destination file', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const prepared = await t011ApplyFixture(workspaceRoot, {
        name: 'rollback-created-file-removal',
        support: {
          'middle.txt': 'middle output\n',
          'z-last.txt': 'last output\n',
        },
      });
      const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
      const firstPath = path.resolve(workspaceRoot, ...outputPaths[0].split('/'));
      const secondPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
      const originalOpenSync = fs.openSync;
      const originalUnlinkSync = fs.unlinkSync;
      fs.openSync = (candidatePath, flags, mode) => {
        if (
          path.resolve(String(candidatePath)) === secondPath
          && (Number(flags) & fs.constants.O_CREAT) !== 0
        ) {
          throw new Error('injected write failure before created-file rollback');
        }
        return originalOpenSync(candidatePath, flags, mode);
      };
      fs.unlinkSync = (candidatePath) => {
        if (path.resolve(String(candidatePath)) === firstPath) {
          throw new Error('injected created-file removal failure');
        }
        return originalUnlinkSync(candidatePath);
      };
      let result;
      try {
        result = await applyDirectoryPreflight(prepared.token);
      } finally {
        fs.openSync = originalOpenSync;
        fs.unlinkSync = originalUnlinkSync;
      }

      assert.equal(result.status, 'recovery-failed');
      assert.deepEqual(result.written_paths, []);
      assert.deepEqual(result.restored_paths, []);
      assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
      assert.deepEqual(result.uncertain_paths, [
        result.recovery_directory,
        '.github',
        '.github/skills',
        prepared.destinationRoot,
        outputPaths[0],
      ]);
      assert.ok(result.recovery_directory);
      assert.equal(fs.existsSync(firstPath), true);
      assert.equal(
        fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
          .isDirectory(),
        true,
      );
      assertDeepFrozen(result);
      assert.equal(validateDirectoryImportResult(result), true);
    });
  });

  await t.test('cannot restore a replaced destination file', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const originalSkill = Buffer.from('replacement rollback prestate\n');
      const prepared = await t011ApplyFixture(workspaceRoot, {
        name: 'rollback-replacement-restore',
        support: {
          'middle.txt': 'middle output\n',
          'z-last.txt': 'last output\n',
        },
        replacements: { 'SKILL.md': originalSkill },
      });
      const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
      const firstPath = path.resolve(workspaceRoot, ...outputPaths[0].split('/'));
      const secondPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
      let firstCommitComplete = false;
      const originalOpenSync = fs.openSync;
      const originalRenameSync = fs.renameSync;
      fs.openSync = (candidatePath, flags, mode) => {
        if (
          path.resolve(String(candidatePath)) === secondPath
          && (Number(flags) & fs.constants.O_CREAT) !== 0
        ) {
          throw new Error('injected write failure before replacement rollback');
        }
        return originalOpenSync(candidatePath, flags, mode);
      };
      fs.renameSync = (sourcePath, destinationPath) => {
        if (path.resolve(String(destinationPath)) === firstPath) {
          if (firstCommitComplete) {
            throw new Error('injected replacement restore failure');
          }
          const renamed = originalRenameSync(sourcePath, destinationPath);
          firstCommitComplete = true;
          return renamed;
        }
        return originalRenameSync(sourcePath, destinationPath);
      };
      let result;
      try {
        result = await applyDirectoryPreflight(prepared.token);
      } finally {
        fs.openSync = originalOpenSync;
        fs.renameSync = originalRenameSync;
      }

      assert.equal(firstCommitComplete, true);
      assert.equal(result.status, 'recovery-failed');
      assert.deepEqual(result.written_paths, []);
      assert.deepEqual(result.restored_paths, []);
      assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
      assert.deepEqual(result.uncertain_paths, [result.recovery_directory, outputPaths[0]]);
      assert.notDeepEqual(fs.readFileSync(firstPath), originalSkill);
      assert.equal(
        fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
          .isDirectory(),
        true,
      );
    });
  });

  await t.test('cannot remove a transaction-created destination directory', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      fs.mkdirSync(path.join(workspaceRoot, '.github/skills'), { recursive: true });
      const prepared = await t011ApplyFixture(workspaceRoot, {
        name: 'rollback-created-directory',
        support: {
          'middle.txt': 'middle output\n',
          'z-last.txt': 'last output\n',
        },
      });
      const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
      const destinationRoot = path.resolve(workspaceRoot, prepared.destinationRoot);
      const secondPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
      const originalOpenSync = fs.openSync;
      const originalRmdirSync = fs.rmdirSync;
      fs.openSync = (candidatePath, flags, mode) => {
        if (
          path.resolve(String(candidatePath)) === secondPath
          && (Number(flags) & fs.constants.O_CREAT) !== 0
        ) {
          throw new Error('injected write failure before directory rollback');
        }
        return originalOpenSync(candidatePath, flags, mode);
      };
      fs.rmdirSync = (candidatePath, options) => {
        if (path.resolve(String(candidatePath)) === destinationRoot) {
          throw new Error('injected created-directory cleanup failure');
        }
        return originalRmdirSync(candidatePath, options);
      };
      let result;
      try {
        result = await applyDirectoryPreflight(prepared.token);
      } finally {
        fs.openSync = originalOpenSync;
        fs.rmdirSync = originalRmdirSync;
      }

      assert.equal(result.status, 'recovery-failed');
      assert.deepEqual(result.written_paths, []);
      assert.deepEqual(result.restored_paths, outputPaths.slice(0, 1));
      assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
      assert.deepEqual(result.uncertain_paths, [
        result.recovery_directory,
        prepared.destinationRoot,
      ]);
      assert.equal(fs.lstatSync(destinationRoot).isDirectory(), true);
      assert.deepEqual(fs.readdirSync(destinationRoot), []);
      assert.equal(
        fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
          .isDirectory(),
        true,
      );
    });
  });

  await t.test('exact prestate verification failure remains uncertain', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const name = 'rollback-prestate-verification';
      const destinationRoot = `.github/skills/dude-local-${name}`;
      fs.mkdirSync(path.join(workspaceRoot, destinationRoot), { recursive: true });
      const prepared = await t011ApplyFixture(workspaceRoot, {
        name,
        support: {
          'middle.txt': 'middle output\n',
          'z-last.txt': 'last output\n',
        },
      });
      const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
      const firstPath = path.resolve(workspaceRoot, ...outputPaths[0].split('/'));
      const secondPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
      const destinationParent = path.dirname(firstPath);
      let firstRemoved = false;
      let verificationFailed = false;
      const originalOpenSync = fs.openSync;
      const originalUnlinkSync = fs.unlinkSync;
      const originalOpendirSync = fs.opendirSync;
      fs.openSync = (candidatePath, flags, mode) => {
        if (
          path.resolve(String(candidatePath)) === secondPath
          && (Number(flags) & fs.constants.O_CREAT) !== 0
        ) {
          throw new Error('injected write failure before prestate verification');
        }
        return originalOpenSync(candidatePath, flags, mode);
      };
      fs.unlinkSync = (candidatePath) => {
        const unlinked = originalUnlinkSync(candidatePath);
        if (path.resolve(String(candidatePath)) === firstPath) firstRemoved = true;
        return unlinked;
      };
      fs.opendirSync = (candidatePath, options) => {
        if (
          firstRemoved
          && !verificationFailed
          && path.resolve(String(candidatePath)) === destinationParent
        ) {
          verificationFailed = true;
          const error = new Error('injected exact prestate verification failure');
          error.code = 'EIO';
          throw error;
        }
        return originalOpendirSync(candidatePath, options);
      };
      let result;
      try {
        result = await applyDirectoryPreflight(prepared.token);
      } finally {
        fs.openSync = originalOpenSync;
        fs.unlinkSync = originalUnlinkSync;
        fs.opendirSync = originalOpendirSync;
      }

      assert.equal(firstRemoved, true);
      assert.equal(verificationFailed, true);
      assert.equal(result.status, 'recovery-failed');
      assert.deepEqual(result.written_paths, []);
      assert.deepEqual(result.restored_paths, []);
      assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
      assert.deepEqual(result.uncertain_paths, [result.recovery_directory, outputPaths[0]]);
      assert.equal(fs.existsSync(firstPath), false);
      assert.equal(
        fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
          .isDirectory(),
        true,
      );
    });
  });

  await t.test('nonce cleanup failure after verified rollback is cleanup-only uncertainty', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const prepared = await t011ApplyFixture(workspaceRoot, {
        name: 'rollback-nonce-cleanup',
        support: { 'support.txt': 'support output\n' },
      });
      const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
      const firstPath = path.resolve(workspaceRoot, ...outputPaths[0].split('/'));
      const originalOpenSync = fs.openSync;
      const originalRmdirSync = fs.rmdirSync;
      fs.openSync = (candidatePath, flags, mode) => {
        if (
          path.resolve(String(candidatePath)) === firstPath
          && (Number(flags) & fs.constants.O_CREAT) !== 0
        ) {
          throw new Error('injected write failure before nonce cleanup');
        }
        return originalOpenSync(candidatePath, flags, mode);
      };
      fs.rmdirSync = (candidatePath, options) => {
        if (path.basename(String(candidatePath)).startsWith('directory-import-')) {
          throw new Error('injected rollback nonce cleanup failure');
        }
        return originalRmdirSync(candidatePath, options);
      };
      let result;
      try {
        result = await applyDirectoryPreflight(prepared.token);
      } finally {
        fs.openSync = originalOpenSync;
        fs.rmdirSync = originalRmdirSync;
      }

      assert.equal(result.status, 'recovery-failed');
      assert.deepEqual(result.written_paths, []);
      assert.deepEqual(result.restored_paths, []);
      assert.deepEqual(result.unchanged_paths, outputPaths);
      assert.deepEqual(result.uncertain_paths, [result.recovery_directory]);
      assert.equal(
        fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
          .isDirectory(),
        true,
      );
    });
  });

  await t.test('nonce cleanup failure after installation names only the retained recovery directory', { concurrency: false }, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const prepared = await t011ApplyFixture(workspaceRoot, {
        name: 'installed-nonce-cleanup',
        support: { 'support.txt': 'support output\n' },
      });
      const originalRmdirSync = fs.rmdirSync;
      fs.rmdirSync = (candidatePath, options) => {
        if (path.basename(String(candidatePath)).startsWith('directory-import-')) {
          throw new Error('injected installed nonce cleanup failure');
        }
        return originalRmdirSync(candidatePath, options);
      };
      let result;
      try {
        result = await applyDirectoryPreflight(prepared.token);
      } finally {
        fs.rmdirSync = originalRmdirSync;
      }

      assert.equal(result.status, 'recovery-failed');
      assert.deepEqual(result.written_paths, []);
      assert.deepEqual(result.restored_paths, []);
      assert.deepEqual(result.unchanged_paths, []);
      assert.deepEqual(result.uncertain_paths, [result.recovery_directory]);
      assert.match(result.message, /installed outputs but recovery cleanup failed/);
      assert.equal(
        fs.lstatSync(path.join(workspaceRoot, ...result.recovery_directory.split('/')))
          .isDirectory(),
        true,
      );
      for (const output of prepared.plan.outputs) {
        assert.equal(
          fs.lstatSync(path.join(workspaceRoot, ...output.destination_path.split('/')))
            .isFile(),
          true,
        );
      }
    });
  });
});

test('T011 validateDirectoryImportResult rejects malformed installed, rolled-back, and recovery-failed records', { concurrency: false }, () => {
  const digest = 'a'.repeat(64);
  const installed = {
    schema_version: 1,
    kind: 'dude-directory-import-result',
    status: 'installed',
    plan_sha256: digest,
    written_paths: ['a/output', 'z/output'],
    restored_paths: [],
    unchanged_paths: [],
    uncertain_paths: [],
    recovery_directory: null,
    message: 'Directory import installed successfully.',
  };
  const rolledBack = {
    ...structuredClone(installed),
    status: 'rolled-back',
    written_paths: [],
    restored_paths: ['a/output'],
    unchanged_paths: ['z/output'],
    message: 'Directory import failed and was rolled back: injected failure',
  };
  const recoveryFailed = {
    ...structuredClone(installed),
    status: 'recovery-failed',
    written_paths: [],
    restored_paths: ['a/output'],
    unchanged_paths: [],
    uncertain_paths: ['recovery/nonce', 'z/output'],
    recovery_directory: 'recovery/nonce',
    message: 'Directory import failed and recovery is incomplete: injected failure',
  };
  for (const valid of [installed, rolledBack, recoveryFailed]) {
    assert.equal(validateDirectoryImportResult(valid), true);
  }

  const cases = [
    { name: 'null record', make: () => null, expected: /plain object/ },
    {
      name: 'missing field',
      make() { const value = structuredClone(installed); delete value.message; return value; },
      expected: /exactly these fields/,
    },
    {
      name: 'extra field',
      make: () => ({ ...structuredClone(installed), extra: true }),
      expected: /exactly these fields/,
    },
    { name: 'schema version', make: () => ({ ...installed, schema_version: 2 }), expected: /schema_version/ },
    { name: 'kind', make: () => ({ ...installed, kind: 'other' }), expected: /kind/ },
    { name: 'status', make: () => ({ ...installed, status: 'other' }), expected: /status/ },
    { name: 'digest type', make: () => ({ ...installed, plan_sha256: null }), expected: /plan_sha256/ },
    { name: 'digest case', make: () => ({ ...installed, plan_sha256: 'A'.repeat(64) }), expected: /plan_sha256/ },
    { name: 'digest length', make: () => ({ ...installed, plan_sha256: 'a'.repeat(63) }), expected: /plan_sha256/ },
    { name: 'non-array paths', make: () => ({ ...installed, written_paths: {} }), expected: /array/ },
    {
      name: 'sparse paths',
      make() { const value = structuredClone(installed); value.written_paths = new Array(1); return value; },
      expected: /dense/,
    },
    { name: 'noncanonical path', make: () => ({ ...installed, written_paths: ['../escape'] }), expected: /canonical|relative POSIX/ },
    { name: 'absolute path', make: () => ({ ...installed, written_paths: ['/escape'] }), expected: /canonical|relative POSIX/ },
    { name: 'backslash path', make: () => ({ ...installed, written_paths: ['a\\path'] }), expected: /canonical|relative POSIX/ },
    { name: 'unsorted paths', make: () => ({ ...installed, written_paths: ['z/output', 'a/output'] }), expected: /unique and sorted/ },
    { name: 'duplicate paths', make: () => ({ ...installed, written_paths: ['a/output', 'a/output'] }), expected: /unique and sorted/ },
    {
      name: 'overlapping classifications',
      make: () => ({ ...rolledBack, unchanged_paths: ['a/output', 'z/output'] }),
      expected: /must not overlap/,
    },
    { name: 'message type', make: () => ({ ...installed, message: null }), expected: /message/ },
    { name: 'empty message', make: () => ({ ...installed, message: '  ' }), expected: /must not be empty/ },
    { name: 'installed message', make: () => ({ ...installed, message: 'success' }), expected: /installed.*invariants/ },
    { name: 'installed no writes', make: () => ({ ...installed, written_paths: [] }), expected: /installed.*invariants/ },
    { name: 'installed restored path', make: () => ({ ...installed, restored_paths: ['b/output'] }), expected: /installed.*invariants/ },
    { name: 'installed unchanged path', make: () => ({ ...installed, unchanged_paths: ['b/output'] }), expected: /installed.*invariants/ },
    { name: 'installed uncertain path', make: () => ({ ...installed, uncertain_paths: ['b/output'] }), expected: /installed.*invariants/ },
    { name: 'installed recovery directory', make: () => ({ ...installed, recovery_directory: 'recovery/nonce' }), expected: /installed.*invariants/ },
    { name: 'rolled-back written path', make: () => ({ ...rolledBack, written_paths: ['b/output'] }), expected: /rolled-back.*invariants/ },
    { name: 'rolled-back uncertain path', make: () => ({ ...rolledBack, uncertain_paths: ['b/output'] }), expected: /rolled-back.*invariants/ },
    { name: 'rolled-back empty partition', make: () => ({ ...rolledBack, restored_paths: [], unchanged_paths: [] }), expected: /rolled-back.*invariants/ },
    { name: 'rolled-back recovery directory', make: () => ({ ...rolledBack, recovery_directory: 'recovery/nonce' }), expected: /rolled-back.*invariants/ },
    { name: 'recovery-failed written path', make: () => ({ ...recoveryFailed, written_paths: ['b/output'] }), expected: /recovery-failed.*invariants/ },
    { name: 'recovery-failed empty uncertainty', make: () => ({ ...recoveryFailed, uncertain_paths: [] }), expected: /recovery-failed.*invariants/ },
    { name: 'recovery-failed null directory', make: () => ({ ...recoveryFailed, recovery_directory: null }), expected: /recovery-failed.*invariants/ },
    { name: 'recovery-failed directory not uncertain', make: () => ({ ...recoveryFailed, recovery_directory: 'other/nonce' }), expected: /recovery-failed.*invariants/ },
    { name: 'recovery directory path', make: () => ({ ...recoveryFailed, recovery_directory: '../nonce' }), expected: /canonical/ },
  ];
  for (const fixtureCase of cases) {
    assert.throws(
      () => validateDirectoryImportResult(fixtureCase.make()),
      fixtureCase.expected,
      fixtureCase.name,
    );
  }
});

test('T011 rollback restores exact binary bytes, hash, and mode without touching or executing unrelated content', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const originalSkill = Buffer.from([
      0x00, 0xff, 0x10, 0x0a, 0x2d, 0x2d, 0x2d, 0x0a,
      ...Buffer.from('binary prestate\n'),
    ]);
    const unrelatedBytes = Buffer.from([0xde, 0xad, 0x00, 0xbe, 0xef]);
    const unrelatedPath = writeWorkspaceFile(
      workspaceRoot,
      '.github/skills/unrelated.bin',
      unrelatedBytes,
    );
    const executionMarker = path.join(workspaceRoot, 'imported-content-ran');
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'exact-restore-boundary',
      support: {
        'execute.mjs': [
          "import fs from 'node:fs';",
          `fs.writeFileSync(${JSON.stringify(executionMarker)}, 'executed');`,
          '',
        ].join('\n'),
        'z-last.txt': 'last output\n',
      },
      replacements: { 'SKILL.md': originalSkill },
    });
    const replacementPath = prepared.absolute('SKILL.md');
    if (process.platform !== 'win32') fs.chmodSync(replacementPath, 0o751);
    const originalMode = process.platform === 'win32'
      ? null
      : fs.statSync(replacementPath).mode & 0o7777;
    const originalHash = sha256(fs.readFileSync(replacementPath));
    const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
    const failingPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
    const originalOpenSync = fs.openSync;
    fs.openSync = (candidatePath, flags, mode) => {
      if (
        path.resolve(String(candidatePath)) === failingPath
        && (Number(flags) & fs.constants.O_CREAT) !== 0
      ) {
        throw new Error('injected exact restoration boundary failure');
      }
      return originalOpenSync(candidatePath, flags, mode);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.openSync = originalOpenSync;
    }

    assert.equal(result.status, 'rolled-back');
    assert.deepEqual(result.written_paths, []);
    assert.deepEqual(result.restored_paths, outputPaths.slice(0, 1));
    assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
    assert.deepEqual(result.uncertain_paths, []);
    assert.equal(result.recovery_directory, null);
    assert.deepEqual(fs.readFileSync(replacementPath), originalSkill);
    assert.equal(sha256(fs.readFileSync(replacementPath)), originalHash);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(replacementPath).mode & 0o7777, originalMode);
    }
    assert.deepEqual(fs.readFileSync(unrelatedPath), unrelatedBytes);
    assert.equal(fs.existsSync(executionMarker), false);
    assert.equal(fs.existsSync(prepared.absolute('execute.mjs')), false);
    assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
  });
});

test('T011 replacement backup and rollback stream large binary prestates in fixed chunks', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const originalSkill = Buffer.alloc((2 * 1024 * 1024) + 137);
    for (let index = 0; index < originalSkill.length; index += 4093) {
      originalSkill[index] = (index / 4093) % 256;
    }
    const prepared = await t011ApplyFixture(workspaceRoot, {
      name: 'streamed-large-restore',
      support: { 'support.txt': 'later create fails\n' },
      replacements: { 'SKILL.md': originalSkill },
    });
    const outputPaths = prepared.plan.outputs.map((output) => output.destination_path);
    const replacementPath = path.resolve(prepared.absolute('SKILL.md'));
    const failingPath = path.resolve(workspaceRoot, ...outputPaths[1].split('/'));
    if (process.platform !== 'win32') fs.chmodSync(replacementPath, 0o751);
    const originalMode = process.platform === 'win32'
      ? null
      : fs.statSync(replacementPath).mode & 0o7777;
    const descriptorPaths = new Map();
    const originalOpenSync = fs.openSync;
    const originalReadSync = fs.readSync;
    const originalWriteSync = fs.writeSync;
    const originalBufferConcat = Buffer.concat;
    let maximumConcatBytes = 0;
    let backupChunkWrites = 0;
    let backupChunkReads = 0;
    let rollbackChunkWrites = 0;
    fs.openSync = (candidatePath, flags, mode) => {
      if (
        path.resolve(String(candidatePath)) === failingPath
        && (Number(flags) & fs.constants.O_CREAT) !== 0
      ) {
        throw new Error('injected failure after streamed replacement commit');
      }
      const descriptor = originalOpenSync(candidatePath, flags, mode);
      descriptorPaths.set(descriptor, path.resolve(String(candidatePath)));
      return descriptor;
    };
    fs.readSync = (descriptor, buffer, offset, length, position) => {
      const bytesRead = originalReadSync(descriptor, buffer, offset, length, position);
      const descriptorPath = descriptorPaths.get(descriptor) ?? '';
      if (
        bytesRead > 0
        && descriptorPath.includes(`${path.sep}backups${path.sep}`)
        && descriptorPath.endsWith(path.join(...outputPaths[0].split('/')))
      ) {
        backupChunkReads += 1;
      }
      return bytesRead;
    };
    fs.writeSync = (descriptor, buffer, offset, length, position) => {
      const descriptorPath = descriptorPaths.get(descriptor) ?? '';
      if (Buffer.isBuffer(buffer) && Number(length) <= 64 * 1024) {
        if (descriptorPath.includes(`${path.sep}backups${path.sep}`)) {
          backupChunkWrites += 1;
        } else if (
          path.dirname(descriptorPath) === path.dirname(replacementPath)
          && path.basename(descriptorPath).startsWith('.SKILL.md.dude-import-')
          && Number(length) === 64 * 1024
        ) {
          rollbackChunkWrites += 1;
        }
      }
      return originalWriteSync(descriptor, buffer, offset, length, position);
    };
    Buffer.concat = (list, totalLength) => {
      const observedLength = totalLength ?? list.reduce((sum, chunk) => sum + chunk.length, 0);
      maximumConcatBytes = Math.max(maximumConcatBytes, observedLength);
      return originalBufferConcat(list, totalLength);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(prepared.token);
    } finally {
      fs.openSync = originalOpenSync;
      fs.readSync = originalReadSync;
      fs.writeSync = originalWriteSync;
      Buffer.concat = originalBufferConcat;
    }

    assert.equal(result.status, 'rolled-back');
    assert.deepEqual(result.restored_paths, [outputPaths[0]]);
    assert.deepEqual(result.unchanged_paths, outputPaths.slice(1));
    assert.ok(backupChunkWrites > 2);
    assert.ok(backupChunkReads > 2);
    assert.ok(rollbackChunkWrites > 2);
    assert.ok(maximumConcatBytes < originalSkill.length);
    assert.deepEqual(fs.readFileSync(replacementPath), originalSkill);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(replacementPath).mode & 0o7777, originalMode);
    }
    assert.equal(fs.readdirSync(prepared.token.transaction_parent).length, 0);
  });
});

test('T011 applyDirectoryPreflight installs mixed outputs once with the bound source revalidator', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const destinationRoot = '.github/skills/dude-local-apply-mixed';
    const replacementPath = `${destinationRoot}/SKILL.md`;
    const createdPath = `${destinationRoot}/support.txt`;
    const replacement = writeWorkspaceFile(
      workspaceRoot,
      replacementPath,
      'reviewed replacement bytes\n',
    );
    if (process.platform !== 'win32') fs.chmodSync(replacement, 0o640);
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'apply-mixed' }),
      'artifact/support.txt': 'installed support bytes\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const token = await preflightDirectoryApply(
      plan,
      'confirm-import',
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const revalidationsBeforeApply = fixture.state.revalidateCalls;
    fixture.sourceAnalysis.revalidate = async () => {
      throw new Error('caller-owned replacement revalidator must not run');
    };

    assert.equal(applyDirectoryPreflight.length, 1);
    assert.equal(validateDirectoryImportResult.length, 1);
    const pending = applyDirectoryPreflight(token);
    await assert.rejects(
      applyDirectoryPreflight(token),
      /genuine unconsumed preflight token/,
    );
    const result = await pending;

    assert.deepEqual(Object.keys(result), [
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
    ]);
    assert.equal(result.status, 'installed');
    assert.equal(result.plan_sha256, plan.plan_sha256);
    assert.deepEqual(result.written_paths, [replacementPath, createdPath]);
    assert.deepEqual(result.restored_paths, []);
    assert.deepEqual(result.unchanged_paths, []);
    assert.deepEqual(result.uncertain_paths, []);
    assert.equal(result.recovery_directory, null);
    assert.equal(result.message, 'Directory import installed successfully.');
    assert.equal(validateDirectoryImportResult(result), true);
    assertDeepFrozen(result);
    assert.equal(fixture.state.revalidateCalls, revalidationsBeforeApply + 1);
    assert.equal(
      fs.readFileSync(replacement, 'utf8'),
      skillDocument({ name: 'dude-local-apply-mixed' }),
    );
    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, ...createdPath.split('/')), 'utf8'),
      'installed support bytes\n',
    );
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(replacement).mode & 0o7777, 0o640);
    }
    assert.equal(fs.readdirSync(token.transaction_parent).length, 0);
    await assert.rejects(
      applyDirectoryPreflight(structuredClone(token)),
      /genuine unconsumed preflight token/,
    );
  });
});

test('T011 applyDirectoryPreflight rolls back a mixed write failure and validates result invariants', { concurrency: false }, async () => {
  await withWorkspace(async (workspaceRoot) => {
    const destinationRoot = '.github/skills/dude-local-apply-rollback';
    const replacementPath = `${destinationRoot}/SKILL.md`;
    const createdPath = `${destinationRoot}/support.txt`;
    const originalReplacement = Buffer.from('reviewed rollback bytes\n');
    const replacement = writeWorkspaceFile(
      workspaceRoot,
      replacementPath,
      originalReplacement,
    );
    const fixture = sourceFixture({
      'artifact/SKILL.md': skillDocument({ name: 'apply-rollback' }),
      'artifact/support.txt': 'must not remain\n',
    });
    const analysis = await analyzePublicDirectoryArtifacts(
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const plan = await planDirectoryArtifacts(
      analysis,
      reviewFixture(analysis),
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const token = await preflightDirectoryApply(
      plan,
      'confirm-import',
      fixture.sourceAnalysis,
      workspaceRoot,
    );
    const originalOpenSync = fs.openSync;
    fs.openSync = (candidatePath, flags, mode) => {
      if (
        path.resolve(String(candidatePath))
          === path.resolve(workspaceRoot, ...createdPath.split('/'))
        && (Number(flags) & fs.constants.O_EXCL) !== 0
      ) {
        throw new Error('injected second destination write failure');
      }
      return originalOpenSync(candidatePath, flags, mode);
    };
    let result;
    try {
      result = await applyDirectoryPreflight(token);
    } finally {
      fs.openSync = originalOpenSync;
    }

    assert.equal(result.status, 'rolled-back');
    assert.deepEqual(result.written_paths, []);
    assert.deepEqual(result.restored_paths, [replacementPath]);
    assert.deepEqual(result.unchanged_paths, [createdPath]);
    assert.deepEqual(result.uncertain_paths, []);
    assert.equal(result.recovery_directory, null);
    assert.match(result.message, /injected second destination write failure/);
    assert.equal(validateDirectoryImportResult(result), true);
    assert.deepEqual(fs.readFileSync(replacement), originalReplacement);
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, ...createdPath.split('/'))),
      false,
    );
    assert.equal(fs.readdirSync(token.transaction_parent).length, 0);

    const malformed = structuredClone(result);
    malformed.uncertain_paths = [replacementPath];
    assert.throws(
      () => validateDirectoryImportResult(malformed),
      /rolled-back directory import result invariants|classifications must not overlap/,
    );
  });
});