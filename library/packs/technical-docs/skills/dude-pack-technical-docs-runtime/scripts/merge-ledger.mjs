#!/usr/bin/env node
// merge-ledger.mjs — Author the deterministic result index, then merge only that index.
//
// --mode index reads the Source Registry and exactly one complete unit manifest
// for every extraction-bearing Source, derives the exact conventional result path
// <results-dir>/<UnitId>.json for every expected unit, validates each result and
// its result-declared evidence fragment, and atomically authors results.json.
//
// --mode merge reads only that index and the exact files it names. It never
// enumerates a directory, expands a glob, infers a fragment filename, or consumes
// an unindexed file. Missing, unreadable, malformed, stale, aliased, or
// self-ingesting inputs fail closed; nothing is silently skipped.
//
// Usage:
//   node <rt>/merge-ledger.mjs --workspace-root <dir> --mode index \
//     --sources <sources.json> --unit-manifest <manifest> [--unit-manifest ...] \
//     --results-dir <results-dir> --out <results.json>
//
//   node <rt>/merge-ledger.mjs --workspace-root <dir> --mode merge \
//     --index <results.json> --out <ledger.jsonl>
//
// Exits 0 on success, 2 for invalid CLI, schema, alias, containment, or freshness
// input, and 3 for a syntactically valid but empty expected-unit, result, or
// ledger set. Exits 2 and 3 leave prior output byte-for-byte unchanged.

import { readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import {
  DEFAULT_LIMITS,
  EXIT_CODES,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertNoPathAliases,
  assertPlainRecord,
  assertUnicodeScalarString,
  assertUniqueIdentities,
  assertVersion2Record,
  authorizeExistingPath,
  canonicalJson,
  canonicalJsonl,
  compareEvidenceIds,
  compareUnitIds,
  compareUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  parseCanonicalInteger,
  parseCliOptions,
  readJsonFile,
  readJsonlFile,
  resolveWorkspacePath,
  sha256Bytes,
  toWorkspacePath,
  validateByteCount,
  validateDigest,
  validateEvidenceId,
  validateIndexPath,
  validateLimits,
  validateLine,
  validatePersistedPath,
  validateSourceId,
  validateTokenCount,
  validateUnitId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const MODES = Object.freeze(["index", "merge"]);
const SOURCE_KINDS = Object.freeze(["transcript", "notes", "draft", "document", "repo"]);
const SOURCE_ROLES = Object.freeze(["input", "update-target"]);
const OUTPUT_MODES = Object.freeze(["create", "replace", "update"]);
const RESULT_STATUS = Object.freeze(["evidence", "no-documentable-evidence"]);
const EVIDENCE_TYPES = Object.freeze([
  "fact",
  "decision",
  "action",
  "parameter",
  "example",
  "constraint",
  "behavior",
  "interface",
  "schema",
  "open-question",
]);
const IMPORTANCE_VALUES = Object.freeze(["high", "medium", "low"]);
const PREFIX_BY_KIND = Object.freeze({ transcript: "C", notes: "C", draft: "C", document: "E", repo: "R" });

// A locator's line span is anchored at the very end of the string, so a heading
// that legitimately ends in "#" stays unambiguous: the Document locator
// "guide.md:Guide > Setup > C##L13-L19" parses as the reference prefix
// "guide.md:Guide > Setup > C#" and the span 13 through 19.
const LOCATOR_TAIL = /#L([0-9]+)-L([0-9]+)$/;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  mode: { flag: "--mode", required: true },
  sources: { flag: "--sources" },
  unitManifest: { flag: "--unit-manifest", multiple: true },
  resultsDir: { flag: "--results-dir" },
  index: { flag: "--index" },
  out: { flag: "--out", required: true },
});

const INDEX_ONLY_FLAGS = Object.freeze([
  Object.freeze(["sources", "--sources"]),
  Object.freeze(["unitManifest", "--unit-manifest"]),
  Object.freeze(["resultsDir", "--results-dir"]),
]);
const MERGE_ONLY_FLAGS = Object.freeze([Object.freeze(["index", "--index"])]);

/** Require a positive safe integer. */
function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) fail("invalid-integer", `${name} must be a positive safe integer`);
  return value;
}

/** Require a string carrying at least one non-whitespace Unicode scalar. */
function requireNonemptyString(value, name) {
  assertUnicodeScalarString(value, { name });
  if (value.trim().length === 0) fail("invalid-string", `${name} must contain a non-whitespace character`);
  return value;
}

/** Require a member of a closed enumeration. */
function requireEnum(value, allowed, name) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail("invalid-enum", `${name} must be one of ${allowed.join(", ")}`);
  }
  return value;
}

/** Validate an inclusive one-based line range. */
function validateLineRange(range, name) {
  assertClosedRecord(range, { name, required: ["startLine", "endLine"] });
  validateLine(range.startLine, { name: `${name}.startLine` });
  validateLine(range.endLine, { name: `${name}.endLine` });
  if (range.endLine < range.startLine) fail("invalid-line-range", `${name} must not end before it starts`);
  return range;
}

/** Split a locator into its reference prefix and trailing inclusive line span. */
function parseLocator(value, name) {
  requireNonemptyString(value, name);
  const match = LOCATOR_TAIL.exec(value);
  if (match === null) fail("invalid-locator", `${name} must end with #L<start>-L<end>`);
  const prefix = value.slice(0, match.index);
  if (prefix.length === 0) fail("invalid-locator", `${name} must carry a source reference before its line span`);
  const startLine = parseCanonicalInteger(match[1], { name: `${name} start line`, min: 1 });
  const endLine = parseCanonicalInteger(match[2], { name: `${name} end line`, min: 1 });
  if (endLine < startLine) fail("invalid-locator", `${name} must not end before it starts`);
  return Object.freeze({ prefix, startLine, endLine });
}

/** Validate the closed schema-version-2 Source Registry this command consumes. */
function validateRegistry(registry) {
  assertVersion2Record(registry, {
    name: "sources.json",
    required: ["workspaceRoot", "workdir", "output", "limits", "sources"],
  });
  if (registry.workspaceRoot !== "@root") fail("invalid-registry", "sources.json must persist workspaceRoot \"@root\"");
  validatePersistedPath(registry.workdir, { name: "sources.json workdir" });
  assertClosedRecord(registry.output, {
    name: "sources.json output",
    required: ["path", "mode", "updateSourceId", "expectedTarget"],
  });
  validatePersistedPath(registry.output.path, { name: "sources.json output.path" });
  requireEnum(registry.output.mode, OUTPUT_MODES, "sources.json output.mode");
  validateLimits(registry.limits);
  assertDenseArray(registry.sources, {
    name: "sources.json sources",
    minLength: 1,
    maxLength: registry.limits.sourcesPerRun,
  });
  for (const source of registry.sources) {
    assertClosedRecord(source, {
      name: "registered source",
      required: ["id", "kind", "role", "ref", "path", "pathType"],
      optional: ["sizeBytes", "sha256"],
    });
    validateSourceId(source.id, { name: "registered source id" });
    requireEnum(source.kind, SOURCE_KINDS, `${source.id} kind`);
    requireEnum(source.role, SOURCE_ROLES, `${source.id} role`);
    validateWorkspacePath(source.path, { name: `${source.id} path`, allowRoot: source.kind === "repo" });
    if (source.ref !== source.path) fail("invalid-source-ref", `${source.id} ref must equal its path`);
    if (source.pathType === "file") {
      validateByteCount(source.sizeBytes, { name: `${source.id} sizeBytes` });
      validateDigest(source.sha256, { name: `${source.id} sha256` });
    } else if (source.pathType !== "directory") {
      fail("invalid-source-path-type", `${source.id} pathType must be file or directory`);
    }
  }
  assertUniqueIdentities(registry.sources, (source) => source.id, { identityName: "source id" });
  return registry;
}

/** Validate one complete C* or E* chunk manifest. */
function validateChunkManifest(manifest) {
  assertVersion2Record(manifest, {
    name: "chunk manifest",
    required: [
      "sourceId",
      "sourceKind",
      "sourceSha256",
      "prefix",
      "startOrdinal",
      "nextOrdinal",
      "budget",
      "complete",
      "units",
    ],
  });
  validateSourceId(manifest.sourceId, { name: "chunk manifest sourceId" });
  requireEnum(manifest.sourceKind, SOURCE_KINDS, "chunk manifest sourceKind");
  if (manifest.sourceKind === "repo") fail("invalid-manifest", "a chunk manifest cannot describe a repository Source");
  validateDigest(manifest.sourceSha256, { name: "chunk manifest sourceSha256" });
  if (manifest.prefix !== PREFIX_BY_KIND[manifest.sourceKind]) {
    fail("invalid-manifest", `a ${manifest.sourceKind} Source requires prefix ${PREFIX_BY_KIND[manifest.sourceKind]}`);
  }
  const startOrdinal = requirePositiveInteger(manifest.startOrdinal, "chunk manifest startOrdinal");
  const nextOrdinal = requirePositiveInteger(manifest.nextOrdinal, "chunk manifest nextOrdinal");
  assertClosedRecord(manifest.budget, {
    name: "chunk manifest budget",
    required: ["approximateTokens", "overlapTokens"],
  });
  requirePositiveInteger(manifest.budget.approximateTokens, "chunk manifest budget.approximateTokens");
  validateTokenCount(manifest.budget.overlapTokens, { name: "chunk manifest budget.overlapTokens" });
  if (manifest.complete !== true) fail("incomplete-manifest", "a unit manifest must be complete before indexing");
  assertDenseArray(manifest.units, { name: "chunk manifest units" });
  if (nextOrdinal - startOrdinal !== manifest.units.length) {
    fail("invalid-manifest", "chunk manifest ordinals do not reconcile with its unit count");
  }

  manifest.units.forEach((unit, index) => {
    assertClosedRecord(unit, {
      name: "chunk unit",
      required: [
        "id",
        "file",
        "sizeBytes",
        "sha256",
        "codePoints",
        "approximateTokens",
        "cleanRange",
        "sourceRange",
        "sourceRef",
      ],
      optional: ["headingPath", "overlapFrom"],
    });
    validateUnitId(unit.id, { name: "chunk unit id" });
    const expectedId = `${manifest.prefix}${String(startOrdinal + index).padStart(3, "0")}`;
    if (unit.id !== expectedId) fail("noncontiguous-unit-id", `chunk unit at index ${index} must be ${expectedId}`);
    validatePersistedPath(unit.file, { name: `${unit.id} file` });
    validateByteCount(unit.sizeBytes, { name: `${unit.id} sizeBytes` });
    validateDigest(unit.sha256, { name: `${unit.id} sha256` });
    validateTokenCount(unit.codePoints, { name: `${unit.id} codePoints` });
    validateTokenCount(unit.approximateTokens, { name: `${unit.id} approximateTokens` });
    validateLineRange(unit.cleanRange, `${unit.id} cleanRange`);
    validateLineRange(unit.sourceRange, `${unit.id} sourceRange`);
    const locator = parseLocator(unit.sourceRef, `${unit.id} sourceRef`);
    if (locator.startLine !== unit.sourceRange.startLine || locator.endLine !== unit.sourceRange.endLine) {
      fail("invalid-unit-locator", `${unit.id} sourceRef does not describe its recorded source range`);
    }
    if (manifest.prefix === "E") {
      requireNonemptyString(unit.headingPath, `${unit.id} headingPath`);
    } else if (Object.hasOwn(unit, "headingPath")) {
      fail("invalid-unit", `${unit.id} must not declare a headingPath`);
    }
    if (Object.hasOwn(unit, "overlapFrom")) validateUnitId(unit.overlapFrom, { name: `${unit.id} overlapFrom` });
  });
  assertUniqueIdentities(manifest.units, (unit) => unit.id, { identityName: "unit id" });
  return manifest;
}

/** Validate one complete repository inventory. */
function validateRepositoryInventory(inventory) {
  assertVersion2Record(inventory, {
    name: "repository inventory",
    required: [
      "sourceId",
      "rootRef",
      "startOrdinal",
      "nextOrdinal",
      "repositoryDigest",
      "limits",
      "complete",
      "limitHits",
      "totals",
      "accounting",
      "workUnits",
    ],
  });
  validateSourceId(inventory.sourceId, { name: "repository inventory sourceId" });
  validateWorkspacePath(inventory.rootRef, { name: "repository inventory rootRef", allowRoot: true });
  const startOrdinal = requirePositiveInteger(inventory.startOrdinal, "repository inventory startOrdinal");
  const nextOrdinal = requirePositiveInteger(inventory.nextOrdinal, "repository inventory nextOrdinal");
  validateDigest(inventory.repositoryDigest, { name: "repository inventory repositoryDigest" });
  validateLimits(inventory.limits);
  if (inventory.complete !== true) fail("incomplete-manifest", "a repository inventory must be complete before indexing");
  assertDenseArray(inventory.limitHits, { name: "repository inventory limitHits" });
  if (inventory.limitHits.length !== 0) fail("incomplete-manifest", "a complete repository inventory records no limit hit");
  assertDenseArray(inventory.accounting, { name: "repository inventory accounting" });
  assertDenseArray(inventory.workUnits, { name: "repository inventory workUnits" });
  if (nextOrdinal - startOrdinal !== inventory.workUnits.length) {
    fail("invalid-manifest", "repository inventory ordinals do not reconcile with its work-unit count");
  }

  inventory.workUnits.forEach((unit, index) => {
    assertClosedRecord(unit, {
      name: "repository unit",
      required: ["id", "approximateTokens", "digest", "members"],
    });
    validateUnitId(unit.id, { name: "repository unit id" });
    const expectedId = `R${String(startOrdinal + index).padStart(3, "0")}`;
    if (unit.id !== expectedId) fail("noncontiguous-unit-id", `repository unit at index ${index} must be ${expectedId}`);
    requirePositiveInteger(unit.approximateTokens, `${unit.id} approximateTokens`);
    validateDigest(unit.digest, { name: `${unit.id} digest` });
    assertDenseArray(unit.members, { name: `${unit.id} members`, minLength: 1 });
    for (const member of unit.members) {
      assertClosedRecord(member, {
        name: "repository member",
        required: ["path", "startLine", "endLine", "sizeBytes", "sha256", "sourceRef"],
      });
      validatePersistedPath(member.path, { name: `${unit.id} member path` });
      validateLine(member.startLine, { name: `${unit.id} member startLine` });
      validateLine(member.endLine, { name: `${unit.id} member endLine` });
      if (member.endLine < member.startLine) fail("invalid-line-range", `${unit.id} member must not end before it starts`);
      validateByteCount(member.sizeBytes, { name: `${unit.id} member sizeBytes` });
      validateDigest(member.sha256, { name: `${unit.id} member sha256` });
      const locator = parseLocator(member.sourceRef, `${unit.id} member sourceRef`);
      if (locator.startLine !== member.startLine || locator.endLine !== member.endLine) {
        fail("invalid-unit-locator", `${unit.id} member sourceRef does not describe its recorded line slice`);
      }
    }
  });
  assertUniqueIdentities(inventory.workUnits, (unit) => unit.id, { identityName: "unit id" });
  return inventory;
}

/** Validate either supported unit-manifest shape. */
function validateUnitManifest(manifest) {
  assertPlainRecord(manifest, { name: "unit manifest" });
  if (Object.hasOwn(manifest, "workUnits")) return validateRepositoryInventory(manifest);
  if (Object.hasOwn(manifest, "units")) return validateChunkManifest(manifest);
  return fail("invalid-manifest", "a unit manifest must declare either units or workUnits");
}

/** Validate one strict per-unit extraction result. */
function validateExtractionResult(result) {
  assertVersion2Record(result, {
    name: "extraction result",
    required: ["unitId", "sourceId", "unitDigest", "status", "examined"],
    optional: ["fragment", "reason"],
  });
  validateUnitId(result.unitId, { name: "extraction result unitId" });
  validateSourceId(result.sourceId, { name: "extraction result sourceId" });
  validateDigest(result.unitDigest, { name: "extraction result unitDigest" });
  requireEnum(result.status, RESULT_STATUS, "extraction result status");
  assertDenseArray(result.examined, { name: "extraction result examined", minLength: 1 });
  for (const member of result.examined) {
    assertClosedRecord(member, { name: "examined member", required: ["sourceRef", "sha256"] });
    requireNonemptyString(member.sourceRef, "examined member sourceRef");
    validateDigest(member.sha256, { name: "examined member sha256" });
  }

  if (result.status === "evidence") {
    if (Object.hasOwn(result, "reason")) fail("invalid-result", "an evidence result must not declare a reason");
    if (!Object.hasOwn(result, "fragment")) fail("invalid-result", "an evidence result must declare its fragment");
    assertClosedRecord(result.fragment, {
      name: "result fragment",
      required: ["path", "bytes", "sha256", "entryCount"],
    });
    validatePersistedPath(result.fragment.path, { name: "result fragment path" });
    validateByteCount(result.fragment.bytes, { name: "result fragment bytes" });
    validateDigest(result.fragment.sha256, { name: "result fragment sha256" });
    requirePositiveInteger(result.fragment.entryCount, "result fragment entryCount");
    return result;
  }

  if (Object.hasOwn(result, "fragment")) fail("invalid-result", "a no-evidence result must not declare a fragment");
  requireNonemptyString(result.reason, "result reason");
  return result;
}

/** Serialize one evidence record in exact contract field order. */
function canonicalEvidenceRecord(record) {
  const canonical = {
    id: record.id,
    text: record.text,
    type: record.type,
    tag: record.tag,
    "source-id": record["source-id"],
    "source-kind": record["source-kind"],
    "source-chunk": record["source-chunk"],
    "source-ref": record["source-ref"],
  };
  if (Object.hasOwn(record, "importance")) canonical.importance = record.importance;
  if (Object.hasOwn(record, "refs")) canonical.refs = [...record.refs];
  return canonical;
}

/** Validate one strict evidence record's closed grammar. */
function validateEvidenceRecord(record) {
  assertClosedRecord(record, {
    name: "evidence record",
    required: ["id", "text", "type", "tag", "source-id", "source-kind", "source-chunk", "source-ref"],
    optional: ["importance", "refs"],
  });
  validateEvidenceId(record.id, { name: "evidence id" });
  requireNonemptyString(record.text, "evidence text");
  requireEnum(record.type, EVIDENCE_TYPES, "evidence type");
  requireNonemptyString(record.tag, "evidence tag");
  validateSourceId(record["source-id"], { name: "evidence source-id" });
  requireEnum(record["source-kind"], SOURCE_KINDS, "evidence source-kind");
  validateUnitId(record["source-chunk"], { name: "evidence source-chunk" });
  requireNonemptyString(record["source-ref"], "evidence source-ref");
  if (Object.hasOwn(record, "importance")) requireEnum(record.importance, IMPORTANCE_VALUES, "evidence importance");
  if (Object.hasOwn(record, "refs")) {
    assertDenseArray(record.refs, { name: "evidence refs" });
    const seen = new Set();
    for (const reference of record.refs) {
      validateEvidenceId(reference, { name: "evidence ref" });
      if (reference === record.id) fail("self-referential-evidence", `${record.id} must not reference itself`);
      if (seen.has(reference)) fail("duplicate-evidence-ref", `${record.id} repeats reference ${reference}`);
      seen.add(reference);
    }
  }
  if (record.id.slice(0, record.id.lastIndexOf("-F")) !== record["source-chunk"]) {
    fail("evidence-unit-mismatch", `${record.id} does not belong to ${record["source-chunk"]}`);
  }
  return record;
}

/** Stable-read one strictly canonical JSON artifact and derive its exact identity. */
function readCanonicalJson(workspaceRoot, workspacePath, options) {
  const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath, { name: options.name });
  const value = readJsonFile(absolutePath, {
    name: options.name,
    maxBytes: options.maxBytes,
    exactBytes: options.exactBytes,
    workspaceRoot,
    workspacePath,
    validate: options.validate,
    strictCanonical: true,
    canonicalize: (parsed) => parsed,
  });
  const text = canonicalJson(value, { name: options.name });
  return Object.freeze({
    path: absolutePath,
    workspacePath,
    value,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256Bytes(text),
  });
}

/** Stable-read one strictly canonical evidence JSONL artifact. */
function readCanonicalEvidence(workspaceRoot, workspacePath, options) {
  const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath, { name: options.name });
  const records = readJsonlFile(absolutePath, {
    maxBytes: options.limits.jsonlBytesPerFile,
    maxLineBytes: options.limits.jsonlBytesPerLine,
    maxRecords: options.limits.jsonlRecords,
    exactBytes: options.exactBytes,
    workspaceRoot,
    workspacePath,
    requireNonempty: true,
    validate: validateEvidenceRecord,
    strictCanonical: true,
    canonicalize: canonicalEvidenceRecord,
  });
  const text = canonicalJsonl(records.map(canonicalEvidenceRecord), { name: options.name, requireNonempty: true });
  return Object.freeze({
    path: absolutePath,
    workspacePath,
    records,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256Bytes(text),
  });
}

/** Derive the expected units one validated manifest contributes. */
function expectedUnitsFor(source, manifest) {
  if (Object.hasOwn(manifest, "units")) {
    if (manifest.sourceKind !== source.kind) {
      fail("manifest-source-mismatch", `${source.id} manifest declares kind ${manifest.sourceKind}`);
    }
    if (manifest.sourceSha256 !== source.sha256) {
      fail("manifest-source-digest-mismatch", `${source.id} manifest was produced from different source bytes`);
    }
    return manifest.units.map((unit) => Object.freeze({
      unitId: unit.id,
      sourceId: source.id,
      sourceKind: source.kind,
      unitDigest: unit.sha256,
      approximateTokens: unit.approximateTokens,
      examined: Object.freeze([Object.freeze({ sourceRef: unit.sourceRef, sha256: manifest.sourceSha256 })]),
      locators: Object.freeze([parseLocator(unit.sourceRef, `${unit.id} sourceRef`)]),
    }));
  }

  if (source.kind !== "repo") fail("manifest-source-mismatch", `${source.id} is not a repository Source`);
  if (manifest.rootRef !== source.ref) fail("manifest-source-mismatch", `${source.id} inventory declares a different rootRef`);
  return manifest.workUnits.map((unit) => Object.freeze({
    unitId: unit.id,
    sourceId: source.id,
    sourceKind: source.kind,
    unitDigest: unit.digest,
    approximateTokens: unit.approximateTokens,
    examined: Object.freeze(unit.members.map((member) => Object.freeze({
      sourceRef: member.sourceRef,
      sha256: member.sha256,
    }))),
    locators: Object.freeze(unit.members.map((member) => parseLocator(member.sourceRef, `${unit.id} member sourceRef`))),
  }));
}

/** Bind validated manifests to the registry and return deterministic expected units. */
function deriveExpectedUnits(registry, manifests) {
  const bySource = new Map();
  for (const manifest of manifests) {
    const sourceId = manifest.value.sourceId;
    const source = registry.sources.find((candidate) => candidate.id === sourceId);
    if (source === undefined) fail("unexpected-unit-manifest", `a unit manifest declares unregistered Source ${sourceId}`);
    if (bySource.has(sourceId)) fail("duplicate-unit-manifest", `Source ${sourceId} has more than one unit manifest`);
    bySource.set(sourceId, manifest);
  }
  for (const source of registry.sources) {
    if (!bySource.has(source.id)) fail("missing-unit-manifest", `Source ${source.id} has no unit manifest`);
  }

  const units = [];
  for (const source of registry.sources) {
    for (const unit of expectedUnitsFor(source, bySource.get(source.id).value)) units.push(unit);
  }
  assertUniqueIdentities(units, (unit) => unit.unitId, { identityName: "expected unit id" });
  units.sort((left, right) => compareUnitIds(left.unitId, right.unitId));
  return units;
}

/** Require the declared and expected examined-member sets to agree exactly. */
function assertExaminedMembers(result, expected) {
  const key = (member) => `${member.sourceRef}\u0000${member.sha256}`;
  const declared = result.examined.map(key).sort(compareUtf8);
  const required = expected.examined.map(key).sort(compareUtf8);
  if (new Set(declared).size !== declared.length) {
    fail("duplicate-examined-member", `${expected.unitId} repeats an examined member`);
  }
  if (declared.length !== required.length || declared.some((value, index) => value !== required[index])) {
    fail("incomplete-examined-members", `${expected.unitId} examined members do not cover its unit members exactly`);
  }
}

/** Require every fragment record to agree with its expected unit's provenance. */
function assertFragmentProvenance(records, expected) {
  for (const record of records) {
    if (record["source-chunk"] !== expected.unitId) {
      fail("evidence-unit-mismatch", `${record.id} does not belong to ${expected.unitId}`);
    }
    if (record["source-id"] !== expected.sourceId) {
      fail("evidence-source-mismatch", `${record.id} declares ${record["source-id"]}, not ${expected.sourceId}`);
    }
    if (record["source-kind"] !== expected.sourceKind) {
      fail("evidence-source-kind-mismatch", `${record.id} declares source-kind ${record["source-kind"]}`);
    }
    const locator = parseLocator(record["source-ref"], `${record.id} source-ref`);
    const covered = expected.locators.some((candidate) => (
      candidate.prefix === locator.prefix
      && locator.startLine >= candidate.startLine
      && locator.endLine <= candidate.endLine
    ));
    if (!covered) fail("invalid-evidence-locator", `${record.id} source-ref does not agree with ${expected.unitId}`);
  }
  for (let index = 1; index < records.length; index++) {
    if (compareEvidenceIds(records[index - 1].id, records[index].id) >= 0) {
      fail("noncanonical-evidence-order", `${expected.unitId} fragment records are not in canonical evidence order`);
    }
  }
}

/** Read and fully validate one expected unit's result and result-declared fragment. */
function readValidatedResult(workspaceRoot, resultPath, expected, limits, options = {}) {
  const result = readCanonicalJson(workspaceRoot, resultPath, {
    name: `extraction result ${expected.unitId}`,
    maxBytes: limits.jsonBytesPerFile,
    exactBytes: options.exactBytes,
    validate: validateExtractionResult,
  });
  if (options.expectedSha256 !== undefined && result.sha256 !== options.expectedSha256) {
    fail("result-digest-mismatch", `${expected.unitId} result no longer matches its indexed digest`, { path: resultPath });
  }
  const value = result.value;
  if (value.unitId !== expected.unitId) fail("result-unit-mismatch", `the result at ${resultPath} declares ${value.unitId}`);
  if (value.sourceId !== expected.sourceId) fail("result-source-mismatch", `${expected.unitId} result declares ${value.sourceId}`);
  if (value.unitDigest !== expected.unitDigest) {
    fail("result-unit-digest-mismatch", `${expected.unitId} result was produced from different unit bytes`);
  }
  assertExaminedMembers(value, expected);
  if (value.status !== "evidence") return Object.freeze({ ...result, expected, fragment: null });

  const fragment = readCanonicalEvidence(workspaceRoot, value.fragment.path, {
    name: `evidence fragment ${expected.unitId}`,
    limits,
    exactBytes: value.fragment.bytes,
  });
  if (fragment.sha256 !== value.fragment.sha256) {
    fail("fragment-digest-mismatch", `${expected.unitId} fragment no longer matches its declared digest`, {
      path: value.fragment.path,
    });
  }
  if (fragment.records.length !== value.fragment.entryCount) {
    fail("fragment-entry-count-mismatch", `${expected.unitId} fragment holds ${fragment.records.length} record(s)`, {
      path: value.fragment.path,
    });
  }
  assertFragmentProvenance(fragment.records, expected);
  return Object.freeze({ ...result, expected, fragment });
}

/** Convert a contained absolute path to its normalized index-relative form. */
function toIndexPath(indexDirectory, absolutePath, name) {
  const difference = relative(indexDirectory, absolutePath);
  if (difference === "") fail("invalid-index-path", `${name} must not be the index directory itself`);
  return validateIndexPath(difference.split(sep).join("/"), { name });
}

/** Resolve one index-relative path to its contained workspace path. */
function fromIndexPath(workspaceRoot, indexDirectory, indexPath, name) {
  validateIndexPath(indexPath, { name });
  return toWorkspacePath(workspaceRoot, resolve(indexDirectory, ...indexPath.split("/")), { name });
}

/** Require the results directory to hold exactly the derived result files. */
function assertExactResultMembership(resultsDirectory, expectedNames) {
  let entries;
  try {
    entries = readdirSync(resultsDirectory, { withFileTypes: true });
  } catch (error) {
    fail("results-directory-unreadable", `cannot read the results directory: ${error.message}`, { cause: error });
  }
  const present = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      fail("unexpected-result-entry", `the results directory holds a non-regular entry ${JSON.stringify(entry.name)}`);
    }
    present.push(entry.name);
  }
  const expected = new Set(expectedNames);
  for (const name of expectedNames) {
    if (!present.includes(name)) fail("missing-result", `the results directory is missing ${JSON.stringify(name)}`);
  }
  for (const name of present.sort(compareUtf8)) {
    if (!expected.has(name)) fail("unexpected-result", `the results directory holds unexpected file ${JSON.stringify(name)}`);
  }
}

/** Validate the closed schema-version-2 result index. */
function validateResultIndex(index) {
  assertVersion2Record(index, { name: "results.json", required: ["sourceRegistry", "unitManifests", "results"] });
  assertClosedRecord(index.sourceRegistry, {
    name: "results.json sourceRegistry",
    required: ["path", "bytes", "sha256"],
  });
  validateIndexPath(index.sourceRegistry.path, { name: "results.json sourceRegistry.path" });
  validateByteCount(index.sourceRegistry.bytes, { name: "results.json sourceRegistry.bytes" });
  validateDigest(index.sourceRegistry.sha256, { name: "results.json sourceRegistry.sha256" });

  assertDenseArray(index.unitManifests, { name: "results.json unitManifests" });
  for (const manifest of index.unitManifests) {
    assertClosedRecord(manifest, { name: "indexed unit manifest", required: ["sourceId", "path", "bytes", "sha256"] });
    validateSourceId(manifest.sourceId, { name: "indexed unit manifest sourceId" });
    validateIndexPath(manifest.path, { name: "indexed unit manifest path" });
    validateByteCount(manifest.bytes, { name: "indexed unit manifest bytes" });
    validateDigest(manifest.sha256, { name: "indexed unit manifest sha256" });
  }
  assertUniqueIdentities(index.unitManifests, (manifest) => manifest.sourceId, {
    identityName: "indexed manifest source id",
  });

  assertDenseArray(index.results, { name: "results.json results" });
  for (const result of index.results) {
    assertClosedRecord(result, {
      name: "indexed result",
      required: ["unitId", "sourceId", "sourceKind", "path", "bytes", "sha256"],
    });
    validateUnitId(result.unitId, { name: "indexed result unitId" });
    validateSourceId(result.sourceId, { name: "indexed result sourceId" });
    requireEnum(result.sourceKind, SOURCE_KINDS, "indexed result sourceKind");
    validateIndexPath(result.path, { name: "indexed result path" });
    validateByteCount(result.bytes, { name: "indexed result bytes" });
    validateDigest(result.sha256, { name: "indexed result sha256" });
  }
  assertUniqueIdentities(index.results, (result) => result.unitId, { identityName: "indexed result unit id" });
  for (let position = 1; position < index.results.length; position++) {
    if (compareUnitIds(index.results[position - 1].unitId, index.results[position].unitId) >= 0) {
      fail("noncanonical-index-order", "results.json results are not in canonical unit order");
    }
  }
  return index;
}

function runIndex(workspaceRoot, options) {
  for (const [key, flag] of MERGE_ONLY_FLAGS) {
    if (options[key] !== undefined) fail("forbidden-option", `${flag} is forbidden for --mode index`);
  }
  for (const [key, flag] of INDEX_ONLY_FLAGS) {
    if (options[key] === undefined) fail("missing-option", `required option ${flag} was not supplied for --mode index`);
  }
  assertDenseArray(options.unitManifest, { name: "--unit-manifest", minLength: 1 });

  const registryPath = toWorkspacePath(workspaceRoot, resolve(options.sources), { name: "source registry" });
  const registry = readCanonicalJson(workspaceRoot, registryPath, {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    validate: validateRegistry,
  });
  const limits = registry.value.limits;

  const manifests = options.unitManifest.map((hostPath) => readCanonicalJson(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(hostPath), { name: "unit manifest" }),
    { name: "unit manifest", maxBytes: limits.jsonBytesPerFile, validate: validateUnitManifest }
  ));

  const expectedUnits = deriveExpectedUnits(registry.value, manifests);
  if (expectedUnits.length === 0) {
    fail("empty-expected-units", "the supplied manifests declare no expected unit", { exitCode: EXIT_CODES.EMPTY_INPUT });
  }

  const resultsDirectory = authorizeExistingPath(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(options.resultsDir), { name: "results directory" }),
    { name: "results directory", kind: "directory" }
  );
  assertExactResultMembership(resultsDirectory.path, expectedUnits.map((unit) => `${unit.unitId}.json`));

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "index output" });
  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "index output" });
  const indexDirectory = dirname(target.path);

  const results = expectedUnits.map((unit) => readValidatedResult(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(resultsDirectory.path, `${unit.unitId}.json`), { name: `result ${unit.unitId}` }),
    unit,
    limits
  ));
  if (results.every((result) => result.fragment === null)) {
    fail("empty-result-set", "no validated result contributed any evidence", { exitCode: EXIT_CODES.EMPTY_INPUT });
  }

  const readPaths = [
    registry.path,
    ...manifests.map((manifest) => manifest.path),
    ...results.map((result) => result.path),
    ...results.filter((result) => result.fragment !== null).map((result) => result.fragment.path),
  ];
  assertNoPathAliases([...readPaths, target.path], { name: "index inputs and output" });

  const index = {
    schemaVersion: SCHEMA_VERSION,
    sourceRegistry: {
      path: toIndexPath(indexDirectory, registry.path, "indexed source registry path"),
      bytes: registry.bytes,
      sha256: registry.sha256,
    },
    unitManifests: manifests
      .map((manifest) => ({
        sourceId: manifest.value.sourceId,
        rank: registry.value.sources.findIndex((source) => source.id === manifest.value.sourceId),
        path: toIndexPath(indexDirectory, manifest.path, "indexed unit manifest path"),
        bytes: manifest.bytes,
        sha256: manifest.sha256,
      }))
      .sort((left, right) => left.rank - right.rank || compareUtf8(left.path, right.path))
      .map(({ sourceId, path, bytes, sha256 }) => ({ sourceId, path, bytes, sha256 })),
    results: results.map((result) => ({
      unitId: result.expected.unitId,
      sourceId: result.expected.sourceId,
      sourceKind: result.expected.sourceKind,
      path: toIndexPath(indexDirectory, result.path, "indexed result path"),
      bytes: result.bytes,
      sha256: result.sha256,
    })),
  };
  validateResultIndex(index);

  writeAtomicFile(target.path, canonicalJson(index, { name: "results.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [
      ...readPaths,
      resolveWorkspacePath(workspaceRoot, registry.value.output.path, { name: "registered output" }),
    ],
  });
  process.stderr.write(
    `merge-ledger: indexed ${index.results.length} result(s) from ${index.unitManifests.length} manifest(s) into ${outPath}\n`
  );
}

function runMerge(workspaceRoot, options) {
  for (const [key, flag] of INDEX_ONLY_FLAGS) {
    if (options[key] !== undefined) fail("forbidden-option", `${flag} is forbidden for --mode merge`);
  }
  for (const [key, flag] of MERGE_ONLY_FLAGS) {
    if (options[key] === undefined) fail("missing-option", `required option ${flag} was not supplied for --mode merge`);
  }

  const index = readCanonicalJson(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(options.index), { name: "result index" }),
    { name: "results.json", maxBytes: DEFAULT_LIMITS.jsonBytesPerFile, validate: validateResultIndex }
  );
  const indexDirectory = dirname(index.path);

  const registryPath = fromIndexPath(workspaceRoot, indexDirectory, index.value.sourceRegistry.path, "indexed source registry");
  const registry = readCanonicalJson(workspaceRoot, registryPath, {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    exactBytes: index.value.sourceRegistry.bytes,
    validate: validateRegistry,
  });
  if (registry.sha256 !== index.value.sourceRegistry.sha256) {
    fail("registry-digest-mismatch", "the indexed Source Registry no longer matches its indexed digest", {
      path: registryPath,
    });
  }
  const limits = registry.value.limits;

  const manifests = index.value.unitManifests.map((reference) => {
    const manifestPath = fromIndexPath(workspaceRoot, indexDirectory, reference.path, "indexed unit manifest");
    const manifest = readCanonicalJson(workspaceRoot, manifestPath, {
      name: "unit manifest",
      maxBytes: limits.jsonBytesPerFile,
      exactBytes: reference.bytes,
      validate: validateUnitManifest,
    });
    if (manifest.sha256 !== reference.sha256) {
      fail("manifest-digest-mismatch", `${reference.sourceId} manifest no longer matches its indexed digest`, {
        path: manifestPath,
      });
    }
    if (manifest.value.sourceId !== reference.sourceId) {
      fail("manifest-source-mismatch", `the indexed manifest for ${reference.sourceId} declares ${manifest.value.sourceId}`);
    }
    return manifest;
  });

  const expectedUnits = deriveExpectedUnits(registry.value, manifests);
  if (expectedUnits.length === 0) {
    fail("empty-expected-units", "the indexed manifests declare no expected unit", { exitCode: EXIT_CODES.EMPTY_INPUT });
  }
  if (index.value.results.length === 0) {
    fail("empty-result-set", "the index references no result", { exitCode: EXIT_CODES.EMPTY_INPUT });
  }
  if (index.value.results.length !== expectedUnits.length) {
    fail("incomplete-result-set", "the index does not reference exactly one result per expected unit");
  }

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "ledger output" });
  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "ledger output" });

  const results = index.value.results.map((reference, position) => {
    const expected = expectedUnits[position];
    if (reference.unitId !== expected.unitId) {
      fail("incomplete-result-set", `the index references ${reference.unitId} where ${expected.unitId} is expected`);
    }
    if (reference.sourceId !== expected.sourceId || reference.sourceKind !== expected.sourceKind) {
      fail("indexed-result-mismatch", `${reference.unitId} does not agree with its expected Source`);
    }
    return readValidatedResult(
      workspaceRoot,
      fromIndexPath(workspaceRoot, indexDirectory, reference.path, `indexed result ${reference.unitId}`),
      expected,
      limits,
      { exactBytes: reference.bytes, expectedSha256: reference.sha256 }
    );
  });

  const readPaths = [
    index.path,
    registry.path,
    ...manifests.map((manifest) => manifest.path),
    ...results.map((result) => result.path),
    ...results.filter((result) => result.fragment !== null).map((result) => result.fragment.path),
  ];
  assertNoPathAliases([...readPaths, target.path], { name: "merge inputs and output" });

  const ledger = [];
  for (const result of results) {
    if (result.fragment === null) continue;
    for (const record of result.fragment.records) ledger.push(canonicalEvidenceRecord(record));
  }
  if (ledger.length === 0) {
    fail("empty-ledger", "the validated result set produced no evidence", { exitCode: EXIT_CODES.EMPTY_INPUT });
  }
  assertUniqueIdentities(ledger, (record) => record.id, { identityName: "evidence id" });

  const identities = new Set(ledger.map((record) => record.id));
  for (const record of ledger) {
    for (const reference of record.refs ?? []) {
      if (!identities.has(reference)) fail("dangling-evidence-ref", `${record.id} references unknown evidence ${reference}`);
    }
  }

  writeAtomicFile(target.path, canonicalJsonl(ledger, { name: "ledger.jsonl", requireNonempty: true }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [
      ...readPaths,
      resolveWorkspacePath(workspaceRoot, registry.value.output.path, { name: "registered output" }),
    ],
  });
  process.stderr.write(
    `merge-ledger: merged ${ledger.length} evidence record(s) from ${results.length} indexed result(s) into ${outPath}\n`
  );
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  requireEnum(options.mode, MODES, "--mode");
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);
  if (options.mode === "index") runIndex(workspaceRoot, options);
  else runMerge(workspaceRoot, options);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
