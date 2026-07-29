#!/usr/bin/env node
// ledger-digest.mjs — Author the exact planning digest pair bound to the ledger.
//
// The planner is a single reduce call: it must group every ledger entry into
// sections and emit a coverage outline. This script does the grouping
// deterministically so the planner only arranges tag groups into sections.
//
// digest.json is the canonical machine representation and digest.md is its exact
// rendering. Every decision and action id routes once to "Decisions and action
// items" and never appears in a tag group, so no id is omitted or duplicated.
// Every other ledger id appears once in exactly one tag group.
//
// Usage:
//   node <rt>/ledger-digest.mjs \
//     --workspace-root <dir> --sources <sources.json> \
//     --ledger <ledger.jsonl> --out <digest.md> --json <digest.json>
//
// Exits 0 after atomically writing both outputs, 2 for invalid CLI, schema,
// alias, or provenance input, and 3 for an empty ledger. Exits 2 and 3 leave
// both prior outputs byte-for-byte unchanged.

import { resolve } from "node:path";

import {
  DEFAULT_LIMITS,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertNoPathAliases,
  assertUnicodeScalarString,
  assertUniqueIdentities,
  assertVersion2Record,
  canonicalJson,
  canonicalJsonl,
  compareEvidenceIds,
  countCodePoints,
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
  sliceCodePoints,
  toWorkspacePath,
  validateByteCount,
  validateDigest,
  validateEvidenceId,
  validateLimits,
  validatePersistedPath,
  validateSourceId,
  validateUnitId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const SOURCE_KINDS = Object.freeze(["transcript", "notes", "draft", "document", "repo"]);
const SOURCE_ROLES = Object.freeze(["input", "update-target"]);
const OUTPUT_MODES = Object.freeze(["create", "replace", "update"]);
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
const IMPORTANCE_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const PREFIX_BY_KIND = Object.freeze({ transcript: "C", notes: "C", draft: "C", document: "E", repo: "R" });
const ROUTED_TYPES = Object.freeze(["decision", "action"]);
const DECISION_ACTION_SECTION = "Decisions and action items";
const SNIPPET_ELLIPSIS = "...";

// The line span is anchored at the end so a heading ending in "#" stays unambiguous.
const LOCATOR_TAIL = /#L([0-9]+)-L([0-9]+)$/;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  ledger: { flag: "--ledger", required: true },
  out: { flag: "--out", required: true },
  json: { flag: "--json", required: true },
});

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

/** Require every ledger record's provenance to agree with the Source Registry. */
function assertLedgerProvenance(records, registry) {
  const sources = new Map(registry.sources.map((source) => [source.id, source]));
  const identities = new Set(records.map((record) => record.id));
  for (const record of records) {
    const source = sources.get(record["source-id"]);
    if (source === undefined) fail("unknown-evidence-source", `${record.id} references unregistered ${record["source-id"]}`);
    if (source.kind !== record["source-kind"]) {
      fail("evidence-source-kind-mismatch", `${record.id} declares source-kind ${record["source-kind"]}`);
    }
    if (!record["source-chunk"].startsWith(PREFIX_BY_KIND[source.kind])) {
      fail("evidence-unit-prefix-mismatch", `${record.id} unit prefix does not match its ${source.kind} Source`);
    }
    const locator = parseLocator(record["source-ref"], `${record.id} source-ref`);
    if (locator.prefix !== source.ref && !locator.prefix.startsWith(`${source.ref}:`)) {
      fail("invalid-evidence-locator", `${record.id} source-ref is not rooted in ${source.ref}`);
    }
    for (const reference of record.refs ?? []) {
      if (!identities.has(reference)) fail("dangling-evidence-ref", `${record.id} references unknown evidence ${reference}`);
    }
  }
  for (let index = 1; index < records.length; index++) {
    if (compareEvidenceIds(records[index - 1].id, records[index].id) >= 0) {
      fail("noncanonical-ledger-order", "the ledger is not in canonical evidence order");
    }
  }
  return records;
}

/** Collapse whitespace and truncate on Unicode code points. */
function snippetOf(text, limit) {
  const collapsed = text.replace(/\p{White_Space}+/gu, " ").replace(/^ | $/gu, "");
  if (countCodePoints(collapsed, { name: "snippet" }) <= limit) return collapsed;
  return `${sliceCodePoints(collapsed, 0, limit - SNIPPET_ELLIPSIS.length, { name: "snippet" })}${SNIPPET_ELLIPSIS}`;
}

/** Group ordinary entries by tag in first-appearance order after routing. */
function buildTagGroups(records, snippetCodePoints) {
  const order = [];
  const groups = new Map();
  for (const record of records) {
    if (ROUTED_TYPES.includes(record.type)) continue;
    if (!groups.has(record.tag)) {
      groups.set(record.tag, { tag: record.tag, entries: [] });
      order.push(record.tag);
    }
    groups.get(record.tag).entries.push(record);
  }

  return order.map((tag) => {
    const group = groups.get(tag);
    const typeCounts = new Map();
    for (const entry of group.entries) typeCounts.set(entry.type, (typeCounts.get(entry.type) ?? 0) + 1);
    const rank = (entry) => IMPORTANCE_RANK[entry.importance ?? "medium"];
    const example = group.entries.reduce((best, entry) => {
      if (best === null) return entry;
      if (rank(entry) < rank(best)) return entry;
      if (rank(entry) > rank(best)) return best;
      return compareEvidenceIds(entry.id, best.id) < 0 ? entry : best;
    }, null);
    return {
      tag: group.tag,
      entryCount: group.entries.length,
      typeCounts: EVIDENCE_TYPES
        .filter((type) => typeCounts.has(type))
        .map((type) => ({ type, count: typeCounts.get(type) })),
      example: { id: example.id, snippet: snippetOf(example.text, snippetCodePoints) },
      ids: group.entries.map((entry) => entry.id),
    };
  });
}

/** Prove every ledger id routes to exactly one destination. */
function assertExactOnceRouting(records, routedIds, tags) {
  const seen = new Map();
  const register = (id, destination) => {
    if (seen.has(id)) {
      fail("duplicate-digest-routing", `${id} routes to both ${seen.get(id)} and ${destination}`, { id });
    }
    seen.set(id, destination);
  };
  for (const id of routedIds) register(id, DECISION_ACTION_SECTION);
  for (const tag of tags) {
    for (const id of tag.ids) register(id, `tag ${JSON.stringify(tag.tag)}`);
  }
  for (const record of records) {
    if (!seen.has(record.id)) fail("missing-digest-routing", `${record.id} has no digest destination`, { id: record.id });
  }
  if (seen.size !== records.length) fail("invalid-digest-routing", "the digest routes an id that is not in the ledger");
  return seen;
}

/** Render one id list using the exact digest Markdown grammar. */
function renderIdList(ids) {
  return ids.length === 0 ? "(none)" : ids.join(", ");
}

/** Render the type-count list in Evidence Ledger type-enum order. */
function renderTypeCounts(typeCounts) {
  return typeCounts.map((entry) => `${entry.type}=${entry.count}`).join(", ");
}

/** Render the exact digest Markdown for one digest model. */
function renderMarkdown(digest) {
  const blocks = [
    [
      "# Planning Digest v2",
      `source-registry: ${digest.sourceRegistry.path}`,
      `source-registry-sha256: ${digest.sourceRegistry.sha256}`,
      `ledger: ${digest.ledger.path}`,
      `ledger-sha256: ${digest.ledger.sha256}`,
      `ledger-entries: ${digest.ledger.entryCount}`,
      `snippet-code-points: ${digest.configuration.snippetCodePoints}`,
    ].join("\n"),
    [
      "## Decision/action routing",
      `destination: ${digest.routing.decisionActionSection}`,
      `ids: ${renderIdList(digest.routing.decisionActionIds)}`,
    ].join("\n"),
    ...digest.tags.map((tag) => [
      "## Tag",
      `tag: ${JSON.stringify(tag.tag)}`,
      `entries: ${tag.entryCount}`,
      `types: ${renderTypeCounts(tag.typeCounts)}`,
      `example-id: ${tag.example.id}`,
      `example: ${JSON.stringify(tag.example.snippet)}`,
      `ids: ${renderIdList(tag.ids)}`,
    ].join("\n")),
  ];
  return `${blocks.join("\n\n")}\n`;
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);

  const registryPath = toWorkspacePath(workspaceRoot, resolve(options.sources), { name: "source registry" });
  const registryAbsolute = resolveWorkspacePath(workspaceRoot, registryPath, { name: "source registry" });
  const registry = readJsonFile(registryAbsolute, {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    workspaceRoot,
    workspacePath: registryPath,
    validate: validateRegistry,
    strictCanonical: true,
    canonicalize: (parsed) => parsed,
  });
  const limits = registry.limits;
  const registrySha256 = sha256Bytes(canonicalJson(registry, { name: "sources.json" }));

  const ledgerPath = toWorkspacePath(workspaceRoot, resolve(options.ledger), { name: "ledger" });
  const ledgerAbsolute = resolveWorkspacePath(workspaceRoot, ledgerPath, { name: "ledger" });
  const records = readJsonlFile(ledgerAbsolute, {
    maxBytes: limits.jsonlBytesPerFile,
    maxLineBytes: limits.jsonlBytesPerLine,
    maxRecords: limits.jsonlRecords,
    workspaceRoot,
    workspacePath: ledgerPath,
    requireNonempty: true,
    validate: validateEvidenceRecord,
    strictCanonical: true,
    canonicalize: canonicalEvidenceRecord,
  });
  assertUniqueIdentities(records, (record) => record.id, { identityName: "evidence id" });
  assertLedgerProvenance(records, registry);
  const ledgerSha256 = sha256Bytes(canonicalJsonl(records.map(canonicalEvidenceRecord), {
    name: "ledger.jsonl",
    requireNonempty: true,
  }));

  const markdownPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "digest markdown output" });
  const jsonPath = toWorkspacePath(workspaceRoot, resolve(options.json), { name: "digest json output" });
  const markdownTarget = ensureContainedOutputParent(workspaceRoot, markdownPath, { name: "digest markdown output" });
  const jsonTarget = ensureContainedOutputParent(workspaceRoot, jsonPath, { name: "digest json output" });
  const registeredOutput = resolveWorkspacePath(workspaceRoot, registry.output.path, { name: "registered output" });
  assertNoPathAliases([registryAbsolute, ledgerAbsolute, markdownTarget.path, jsonTarget.path], {
    name: "digest inputs and outputs",
  });

  const routedIds = records.filter((record) => ROUTED_TYPES.includes(record.type)).map((record) => record.id);
  const tags = buildTagGroups(records, limits.digestSnippetCodePoints);
  assertExactOnceRouting(records, routedIds, tags);

  const markdownModel = {
    sourceRegistry: { path: registryPath, sha256: registrySha256 },
    ledger: { path: ledgerPath, sha256: ledgerSha256, entryCount: records.length },
    configuration: { snippetCodePoints: limits.digestSnippetCodePoints },
    routing: { decisionActionSection: DECISION_ACTION_SECTION, decisionActionIds: routedIds },
    tags,
  };
  const markdown = renderMarkdown(markdownModel);
  const markdownBytes = Buffer.from(markdown, "utf8");

  const digest = {
    schemaVersion: SCHEMA_VERSION,
    sourceRegistry: markdownModel.sourceRegistry,
    ledger: markdownModel.ledger,
    configuration: markdownModel.configuration,
    routing: markdownModel.routing,
    tags: markdownModel.tags,
    markdown: { path: markdownPath, sizeBytes: markdownBytes.length, sha256: sha256Bytes(markdownBytes) },
  };

  const protectedPaths = [registryAbsolute, ledgerAbsolute, registeredOutput];
  writeAtomicFile(markdownTarget.path, markdownBytes, { workspaceRoot, mode: "replace", protectedPaths });
  writeAtomicFile(jsonTarget.path, canonicalJson(digest, { name: "digest.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [...protectedPaths, markdownTarget.path],
  });
  process.stderr.write(
    `ledger-digest: ${records.length} entries, ${routedIds.length} routed id(s), ${tags.length} tag group(s)`
    + ` -> ${markdownPath} and ${jsonPath}\n`
  );
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
