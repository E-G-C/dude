#!/usr/bin/env node
// extraction-audit.mjs — Reconcile the extraction gate against the result index.
//
// The coverage gate proves every ledger id reached the document. It cannot prove
// the extractor processed every expected unit. This gate independently revalidates
// the result index, every indexed manifest, result, and result-declared fragment,
// and the merged ledger, then reconciles Sources, expected units, examined members,
// evidence provenance, repository members, and recall density.
//
// SCOPE AND LIMITS: the density comparison is a gross-failure backstop. It catches
// a unit that yielded zero, near-zero, or far fewer entries than its peers. It does
// not prove every topic inside an otherwise healthy unit was captured.
//
// Usage:
//   node <rt>/extraction-audit.mjs \
//     --workspace-root <dir> --sources <sources.json> \
//     --ledger <ledger.jsonl> --result-index <results.json> \
//     [--min-entries <int>] [--floor-per-1k <decimal>] [--ratio <decimal>] \
//     --json <extraction.json>
//
// Exits 0 when no unit is flagged, 1 after atomically replacing the report with
// ok:false, 2 for invalid CLI, threshold, schema, alias, or freshness input, and
// 3 for an empty expected-unit, result, or ledger set. Exits 2 and 3 replace no
// declared output.

import { dirname, resolve } from "node:path";

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
  canonicalJson,
  canonicalJsonl,
  compareEvidenceIds,
  compareUnitIds,
  compareUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  parseCanonicalDecimal,
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

// The line span is anchored at the end so a heading ending in "#" stays unambiguous.
const LOCATOR_TAIL = /#L([0-9]+)-L([0-9]+)$/;

const THRESHOLDS = Object.freeze({
  minEntries: Object.freeze({ flag: "--min-entries", kind: "integer", default: "2", min: 0, max: 1000 }),
  floorPer1k: Object.freeze({ flag: "--floor-per-1k", kind: "decimal", default: "5", min: 0, max: 1000 }),
  ratio: Object.freeze({ flag: "--ratio", kind: "decimal", default: "0.5", min: 0, max: 1 }),
});

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  ledger: { flag: "--ledger", required: true },
  resultIndex: { flag: "--result-index", required: true },
  json: { flag: "--json", required: true },
  minEntries: { flag: "--min-entries" },
  floorPer1k: { flag: "--floor-per-1k" },
  ratio: { flag: "--ratio" },
});

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

/** Resolve and range-check the three supported threshold flags. */
function resolveThresholds(options) {
  const thresholds = {};
  for (const [name, definition] of Object.entries(THRESHOLDS)) {
    const raw = options[name] ?? definition.default;
    thresholds[name] = definition.kind === "integer"
      ? parseCanonicalInteger(raw, { name: definition.flag, min: definition.min, max: definition.max })
      : parseCanonicalDecimal(raw, { name: definition.flag, min: definition.min, max: definition.max });
  }
  if (Object.values(thresholds).every((value) => value === 0)) {
    fail("inactive-thresholds", "at least one extraction-audit threshold must be greater than zero");
  }
  return Object.freeze(thresholds);
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
  if (manifest.complete !== true) fail("incomplete-manifest", "a unit manifest must be complete before auditing");
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
  if (inventory.complete !== true) fail("incomplete-manifest", "a repository inventory must be complete before auditing");
  assertDenseArray(inventory.limitHits, { name: "repository inventory limitHits" });
  if (inventory.limitHits.length !== 0) fail("incomplete-manifest", "a complete repository inventory records no limit hit");
  assertDenseArray(inventory.accounting, { name: "repository inventory accounting" });
  assertDenseArray(inventory.workUnits, { name: "repository inventory workUnits" });
  if (nextOrdinal - startOrdinal !== inventory.workUnits.length) {
    fail("invalid-manifest", "repository inventory ordinals do not reconcile with its work-unit count");
  }

  const admitted = new Map();
  for (const entry of inventory.accounting) {
    assertClosedRecord(entry, {
      name: "accounting entry",
      required: ["path", "pathType", "disposition"],
      optional: ["reason", "sizeBytes", "sha256", "unitIds"],
    });
    validatePersistedPath(entry.path, { name: "accounting entry path" });
    requireEnum(entry.disposition, ["admitted", "skipped", "rejected"], "accounting entry disposition");
    if (entry.disposition === "rejected") fail("incomplete-manifest", `a complete inventory has no rejected path: ${entry.path}`);
    if (entry.disposition === "admitted" && entry.pathType === "file") {
      validateDigest(entry.sha256, { name: "admitted file sha256" });
      assertDenseArray(entry.unitIds, { name: "admitted file unitIds", minLength: 1 });
      admitted.set(entry.path, entry);
    }
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
      const accounted = admitted.get(member.path);
      if (accounted === undefined) {
        fail("unaccounted-repository-member", `${unit.id} slices unaccounted path ${member.path}`, { path: member.path });
      }
      if (accounted.sha256 !== member.sha256) {
        fail("repository-member-digest-mismatch", `${unit.id} slices ${member.path} with a different digest`, {
          path: member.path,
        });
      }
      if (!accounted.unitIds.includes(unit.id)) {
        fail("unreconciled-repository-member", `${member.path} accounting does not credit ${unit.id}`, { path: member.path });
      }
    }
  });
  assertUniqueIdentities(inventory.workUnits, (unit) => unit.id, { identityName: "unit id" });

  const covered = new Set(inventory.workUnits.flatMap((unit) => unit.members.map((member) => member.path)));
  for (const path of admitted.keys()) {
    if (!covered.has(path)) {
      fail("unreconciled-repository-member", `admitted file ${path} is not represented by any work unit`, { path });
    }
  }
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

/** Return the exact median of a nonempty numeric sample. */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Apply the three enabled recall comparisons to every validated evidence unit. */
function flagUnits(units, thresholds) {
  const positive = units.filter((unit) => unit.approximateTokens > 0);
  const medianDensity = positive.length >= 3 ? median(positive.map((unit) => unit.density)) : 0;
  const relativeFloor = medianDensity > 0 ? thresholds.ratio * medianDensity : 0;

  const flagged = [];
  for (const unit of units) {
    const reasons = [];
    if (unit.entryCount < thresholds.minEntries) {
      reasons.push(`entry count ${unit.entryCount} is below the ${thresholds.minEntries}-entry floor`);
    }
    if (unit.approximateTokens > 0 && unit.density < thresholds.floorPer1k) {
      reasons.push(`density is below the ${thresholds.floorPer1k}-per-1k floor`);
    }
    if (relativeFloor > 0 && unit.approximateTokens > 0 && unit.density < relativeFloor) {
      reasons.push(`density is below ${thresholds.ratio} times the median unit density`);
    }
    if (reasons.length > 0) flagged.push({ unitId: unit.unitId, reasons });
  }
  return flagged;
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const thresholds = resolveThresholds(options);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);

  const index = readCanonicalJson(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(options.resultIndex), { name: "result index" }),
    { name: "results.json", maxBytes: DEFAULT_LIMITS.jsonBytesPerFile, validate: validateResultIndex }
  );
  const indexDirectory = dirname(index.path);

  const registryPath = toWorkspacePath(workspaceRoot, resolve(options.sources), { name: "source registry" });
  const registry = readCanonicalJson(workspaceRoot, registryPath, {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    exactBytes: index.value.sourceRegistry.bytes,
    validate: validateRegistry,
  });
  if (registry.sha256 !== index.value.sourceRegistry.sha256) {
    fail("registry-digest-mismatch", "the supplied Source Registry does not match the indexed registry", {
      path: registryPath,
    });
  }
  const indexedRegistryPath = toWorkspacePath(
    workspaceRoot,
    resolve(indexDirectory, ...validateIndexPath(index.value.sourceRegistry.path, { name: "indexed source registry" }).split("/")),
    { name: "indexed source registry" }
  );
  if (indexedRegistryPath !== registryPath) {
    fail("registry-path-mismatch", "the supplied Source Registry is not the indexed registry", { path: registryPath });
  }
  const limits = registry.value.limits;

  const manifests = index.value.unitManifests.map((reference) => {
    const manifestPath = toWorkspacePath(
      workspaceRoot,
      resolve(indexDirectory, ...validateIndexPath(reference.path, { name: "indexed unit manifest" }).split("/")),
      { name: "indexed unit manifest" }
    );
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

  const results = index.value.results.map((reference, position) => {
    const expected = expectedUnits[position];
    if (reference.unitId !== expected.unitId) {
      fail("incomplete-result-set", `the index references ${reference.unitId} where ${expected.unitId} is expected`);
    }
    if (reference.sourceId !== expected.sourceId || reference.sourceKind !== expected.sourceKind) {
      fail("indexed-result-mismatch", `${reference.unitId} does not agree with its expected Source`);
    }
    const resultPath = toWorkspacePath(
      workspaceRoot,
      resolve(indexDirectory, ...validateIndexPath(reference.path, { name: "indexed result" }).split("/")),
      { name: `indexed result ${reference.unitId}` }
    );
    const result = readCanonicalJson(workspaceRoot, resultPath, {
      name: `extraction result ${expected.unitId}`,
      maxBytes: limits.jsonBytesPerFile,
      exactBytes: reference.bytes,
      validate: validateExtractionResult,
    });
    if (result.sha256 !== reference.sha256) {
      fail("result-digest-mismatch", `${expected.unitId} result no longer matches its indexed digest`, { path: resultPath });
    }
    if (result.value.unitId !== expected.unitId || result.value.sourceId !== expected.sourceId) {
      fail("result-unit-mismatch", `${expected.unitId} result does not identify its expected unit`);
    }
    if (result.value.unitDigest !== expected.unitDigest) {
      fail("result-unit-digest-mismatch", `${expected.unitId} result was produced from different unit bytes`);
    }
    assertExaminedMembers(result.value, expected);
    if (result.value.status !== "evidence") return Object.freeze({ expected, value: result.value, path: result.path, fragment: null });

    const fragment = readCanonicalEvidence(workspaceRoot, result.value.fragment.path, {
      name: `evidence fragment ${expected.unitId}`,
      limits,
      exactBytes: result.value.fragment.bytes,
    });
    if (fragment.sha256 !== result.value.fragment.sha256) {
      fail("fragment-digest-mismatch", `${expected.unitId} fragment no longer matches its declared digest`, {
        path: result.value.fragment.path,
      });
    }
    if (fragment.records.length !== result.value.fragment.entryCount) {
      fail("fragment-entry-count-mismatch", `${expected.unitId} fragment holds ${fragment.records.length} record(s)`, {
        path: result.value.fragment.path,
      });
    }
    assertFragmentProvenance(fragment.records, expected);
    return Object.freeze({ expected, value: result.value, path: result.path, fragment });
  });

  const ledgerPath = toWorkspacePath(workspaceRoot, resolve(options.ledger), { name: "ledger" });
  const ledger = readCanonicalEvidence(workspaceRoot, ledgerPath, { name: "ledger.jsonl", limits });
  assertUniqueIdentities(ledger.records, (record) => record.id, { identityName: "evidence id" });

  const merged = results.flatMap((result) => (result.fragment === null ? [] : result.fragment.records));
  if (merged.length === 0) {
    fail("empty-ledger", "the validated result set contributed no evidence", { exitCode: EXIT_CODES.EMPTY_INPUT });
  }
  const expectedLedger = canonicalJsonl(merged.map(canonicalEvidenceRecord), { name: "ledger.jsonl", requireNonempty: true });
  if (ledger.sha256 !== sha256Bytes(expectedLedger)) {
    fail("ledger-reconciliation-mismatch", "the supplied ledger does not equal the merged validated result set", {
      path: ledgerPath,
    });
  }

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.json), { name: "report output" });
  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "report output" });
  assertNoPathAliases(
    [
      index.path,
      registry.path,
      ledger.path,
      ...manifests.map((manifest) => manifest.path),
      ...results.filter((result) => result.fragment !== null).map((result) => result.fragment.path),
      target.path,
    ],
    { name: "extraction-audit inputs and output" }
  );

  const evidenceUnits = results
    .filter((result) => result.fragment !== null)
    .map((result) => ({
      unitId: result.expected.unitId,
      approximateTokens: result.expected.approximateTokens,
      entryCount: result.fragment.records.length,
      density: result.expected.approximateTokens > 0
        ? (result.fragment.records.length * 1000) / result.expected.approximateTokens
        : 0,
    }));
  const flagged = flagUnits(evidenceUnits, thresholds);

  const report = {
    schemaVersion: SCHEMA_VERSION,
    gate: "extraction-audit",
    stage: "extraction",
    ok: flagged.length === 0,
    inputs: [
      { role: "ledger", path: ledgerPath, sha256: ledger.sha256 },
      { role: "result-index", path: index.workspacePath, sha256: index.sha256 },
      { role: "source-registry", path: registryPath, sha256: registry.sha256 },
    ].sort((left, right) => compareUtf8(left.role, right.role) || compareUtf8(left.path, right.path)),
    configuration: {
      minEntries: thresholds.minEntries,
      floorPer1k: thresholds.floorPer1k,
      ratio: thresholds.ratio,
    },
    counts: {
      expected: expectedUnits.length,
      results: results.length,
      evidence: evidenceUnits.length,
      noEvidence: results.length - evidenceUnits.length,
      flagged: flagged.length,
    },
    violations: flagged
      .map((unit) => ({
        code: "under-extracted-unit",
        id: unit.unitId,
        message: unit.reasons.join("; "),
      }))
      .sort((left, right) => compareUtf8(left.code, right.code) || compareUtf8(left.id, right.id)),
  };

  writeAtomicFile(target.path, canonicalJson(report, { name: "extraction.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [
      index.path,
      registry.path,
      ledger.path,
      ...manifests.map((manifest) => manifest.path),
      ...results.map((result) => result.path),
      ...results.filter((result) => result.fragment !== null).map((result) => result.fragment.path),
      resolveWorkspacePath(workspaceRoot, registry.value.output.path, { name: "registered output" }),
    ],
  });
  process.stderr.write(
    `extraction-audit: ${report.ok ? "ok" : "flagged"}; ${report.counts.expected} expected unit(s), `
    + `${report.counts.evidence} evidence, ${report.counts.noEvidence} no-evidence, ${report.counts.flagged} flagged\n`
  );
  if (!report.ok) process.exitCode = EXIT_CODES.FAILED_GATE;
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
