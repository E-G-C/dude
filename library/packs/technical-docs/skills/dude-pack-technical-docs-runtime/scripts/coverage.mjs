#!/usr/bin/env node
// coverage.mjs — Prove every ledger id reaches exactly one destination.
//
// Outline mode proves the planner assigned every ledger id to exactly one
// Outline section. Document mode proves the drafter consumed every ledger id
// exactly once, into a section that actually exists in the evaluated document.
//
// Both modes bind the report to the exact bytes they evaluated, and the Outline
// additionally carries the ledger digest it was planned against, so neither a
// stale Outline nor a stale report can authorize later work. A pre-review report
// records stage "pre-review" and can never satisfy a final-report requirement.
//
// Usage:
//   node <rt>/coverage.mjs \
//     --workspace-root <dir> --mode outline \
//     --ledger <ledger.jsonl> --outline <outline.md> \
//     --json <outline-coverage.json>
//
//   node <rt>/coverage.mjs \
//     --workspace-root <dir> --mode document --stage <pre-review|final> \
//     --ledger <ledger.jsonl> --consumed <consumed.jsonl> \
//     --document <document.md> --json <coverage.json>
//
// Exits 0 when coverage is exact, 1 after atomically replacing the report with
// ok:false, 2 for invalid CLI, schema, grammar, alias, or stale input, and 3 for
// a syntactically valid but empty ledger or consumed set. Exits 2 and 3 replace
// no declared output.

import { resolve } from "node:path";

import {
  DEFAULT_LIMITS,
  EXIT_CODES,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertNoPathAliases,
  assertUnicodeScalarString,
  assertUniqueIdentities,
  canonicalJson,
  canonicalJsonl,
  compareEvidenceIds,
  compareUtf8,
  createFenceState,
  decodeUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  parseCliOptions,
  readJsonlFile,
  readStableBytes,
  resolveWorkspacePath,
  sha256Bytes,
  toWorkspacePath,
  updateFenceState,
  validateEvidenceId,
  validateSourceId,
  validateUnitId,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const MODES = Object.freeze(["outline", "document"]);
const STAGES = Object.freeze(["pre-review", "final"]);
const SOURCE_KINDS = Object.freeze(["transcript", "notes", "draft", "document", "repo"]);
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
const CONSUMED_RESOLUTIONS = Object.freeze(["superseded"]);

const OUTLINE_TITLE = /^# Outline: (.+)$/;
const OUTLINE_LEDGER_DIGEST = /^ledger-sha256: ([0-9a-f]{64})$/;
const OUTLINE_SECTION = /^## (.+)$/;
const OUTLINE_FIELD = /^(covers|diagram|notes): (.+)$/;
const OUTLINE_ID_SEPARATOR = ", ";

const ATX_HEADING = /^ {0,3}(#{1,6})([ \t].*)?$/;
const ATX_CLOSING_SEQUENCE = /[ \t]+#+[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const BLANK_LINE = /^[ \t]*$/;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  mode: { flag: "--mode", required: true },
  stage: { flag: "--stage" },
  ledger: { flag: "--ledger", required: true },
  outline: { flag: "--outline" },
  consumed: { flag: "--consumed" },
  document: { flag: "--document" },
  json: { flag: "--json", required: true },
});

const OUTLINE_ONLY_FLAGS = Object.freeze([Object.freeze(["outline", "--outline"])]);
const DOCUMENT_ONLY_FLAGS = Object.freeze([
  Object.freeze(["stage", "--stage"]),
  Object.freeze(["consumed", "--consumed"]),
  Object.freeze(["document", "--document"]),
]);

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

/** Serialize one consumed record in exact contract field order. */
function canonicalConsumedRecord(record) {
  const canonical = { id: record.id, section: record.section };
  if (Object.hasOwn(record, "resolution")) canonical.resolution = record.resolution;
  return canonical;
}

/** Validate one strict consumed record's closed grammar. */
function validateConsumedRecord(record) {
  assertClosedRecord(record, { name: "consumed record", required: ["id", "section"], optional: ["resolution"] });
  validateEvidenceId(record.id, { name: "consumed id" });
  requireNonemptyString(record.section, "consumed section");
  if (Object.hasOwn(record, "resolution")) requireEnum(record.resolution, CONSUMED_RESOLUTIONS, "consumed resolution");
  return record;
}

/** Stable-read the strictly canonical, nonempty evidence ledger. */
function readLedger(workspaceRoot, workspacePath) {
  const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath, { name: "ledger" });
  const records = readJsonlFile(absolutePath, {
    maxBytes: DEFAULT_LIMITS.jsonlBytesPerFile,
    maxLineBytes: DEFAULT_LIMITS.jsonlBytesPerLine,
    maxRecords: DEFAULT_LIMITS.jsonlRecords,
    workspaceRoot,
    workspacePath,
    requireNonempty: true,
    validate: validateEvidenceRecord,
    strictCanonical: true,
    canonicalize: canonicalEvidenceRecord,
  });
  assertUniqueIdentities(records, (record) => record.id, { identityName: "evidence id" });
  for (let index = 1; index < records.length; index++) {
    if (compareEvidenceIds(records[index - 1].id, records[index].id) >= 0) {
      fail("noncanonical-ledger-order", "the ledger is not in canonical evidence order");
    }
  }
  const text = canonicalJsonl(records.map(canonicalEvidenceRecord), { name: "ledger.jsonl", requireNonempty: true });
  return Object.freeze({ path: absolutePath, workspacePath, records, sha256: sha256Bytes(text) });
}

/** Stable-read the strictly canonical, nonempty consumed manifest. */
function readConsumed(workspaceRoot, workspacePath) {
  const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath, { name: "consumed manifest" });
  const records = readJsonlFile(absolutePath, {
    maxBytes: DEFAULT_LIMITS.jsonlBytesPerFile,
    maxLineBytes: DEFAULT_LIMITS.jsonlBytesPerLine,
    maxRecords: DEFAULT_LIMITS.jsonlRecords,
    workspaceRoot,
    workspacePath,
    requireNonempty: true,
    validate: validateConsumedRecord,
    strictCanonical: true,
    canonicalize: canonicalConsumedRecord,
  });
  const text = canonicalJsonl(records.map(canonicalConsumedRecord), { name: "consumed.jsonl", requireNonempty: true });
  return Object.freeze({ path: absolutePath, workspacePath, records, sha256: sha256Bytes(text) });
}

/** Stable-read one bounded Markdown artifact and derive its exact identity. */
function readMarkdown(workspaceRoot, workspacePath, name) {
  const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath, { name });
  const bytes = readStableBytes(absolutePath, {
    maxBytes: DEFAULT_LIMITS.documentBytes,
    workspaceRoot,
    workspacePath,
  });
  if (bytes.length === 0) {
    fail("empty-markdown", `${name} must not be empty`, { path: workspacePath, exitCode: EXIT_CODES.EMPTY_INPUT });
  }
  const text = decodeUtf8(bytes, { path: workspacePath, allowBom: true });
  return Object.freeze({ path: absolutePath, workspacePath, text, sha256: sha256Bytes(bytes) });
}

/** Split LF-normalized text into lines without inventing a trailing empty line. */
function splitLines(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Remove a whitespace-delimited ATX closing sequence, preserving names like `C#`. */
function atxHeadingText(raw) {
  if (raw === undefined) return "";
  return raw.replace(ATX_CLOSING_SEQUENCE, "").replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

/** Collect every ATX and setext heading text outside matching fenced content. */
function documentHeadings(lines) {
  const headings = new Set();
  const fence = createFenceState();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (updateFenceState(fence, line, index + 1) !== null || fence.open) continue;

    const atx = line.match(ATX_HEADING);
    if (atx !== null) {
      const text = atxHeadingText(atx[2]);
      if (text.length > 0) headings.add(text);
      continue;
    }

    const next = lines[index + 1];
    if (next !== undefined && !BLANK_LINE.test(line) && SETEXT_UNDERLINE.test(next)) {
      const text = line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
      if (text.length > 0) headings.add(text);
      index++; // the underline belongs to this heading
    }
  }
  return headings;
}

/**
 * Parse the exact Outline grammar into section assignments.
 * The header binds the Outline to the ledger it was planned against, so a
 * ledger regenerated after planning cannot be covered by a stale Outline.
 */
function parseOutline(text, ledgerSha256) {
  const lines = splitLines(text);
  const title = lines.length > 0 ? lines[0].match(OUTLINE_TITLE) : null;
  if (title === null) fail("invalid-outline", "the Outline must begin with \"# Outline: <title>\"", { line: 1 });
  requireNonemptyString(title[1], "Outline title");

  const digest = lines.length > 1 ? lines[1].match(OUTLINE_LEDGER_DIGEST) : null;
  if (digest === null) {
    fail("invalid-outline", "the Outline must declare \"ledger-sha256: <digest>\" on line 2", { line: 2 });
  }
  if (digest[1] !== ledgerSha256) {
    fail("stale-outline", "the Outline was planned against a different ledger", { line: 2 });
  }

  const sections = [];
  const assignments = [];
  const fence = createFenceState();
  let current = null;

  for (let index = 2; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (updateFenceState(fence, line, lineNumber) !== null || fence.open) continue;
    if (BLANK_LINE.test(line)) continue;

    const section = line.match(OUTLINE_SECTION);
    if (section !== null) {
      current = {
        section: requireNonemptyString(section[1].trim(), "Outline section"),
        covers: false,
        line: lineNumber,
      };
      sections.push(current);
      continue;
    }

    const field = line.match(OUTLINE_FIELD);
    if (field === null) fail("invalid-outline", "the Outline contains an unsupported line", { line: lineNumber });
    if (current === null) fail("invalid-outline", `an Outline ${field[1]} line requires a section`, { line: lineNumber });
    if (current[field[1]] === true) {
      fail("invalid-outline", `an Outline section declares ${field[1]} more than once`, { line: lineNumber });
    }
    current[field[1]] = true;
    if (field[1] !== "covers") continue;

    for (const id of field[2].split(OUTLINE_ID_SEPARATOR)) {
      validateEvidenceId(id, { name: `Outline covers id on line ${lineNumber}` });
      assignments.push({ id, section: current.section, line: lineNumber });
    }
  }

  if (sections.length === 0) fail("invalid-outline", "the Outline declares no section");
  for (const section of sections) {
    if (section.covers !== true) {
      fail("invalid-outline", "every Outline section requires one covers line", { line: section.line });
    }
  }
  return assignments;
}

/** Order violations deterministically for a reproducible report. */
function sortViolations(violations) {
  return violations.sort((left, right) => (
    compareUtf8(left.code, right.code)
    || compareUtf8(left.id ?? "", right.id ?? "")
    || (left.line ?? 0) - (right.line ?? 0)
  ));
}

/** Order report inputs deterministically for a reproducible report. */
function sortInputs(inputs) {
  return inputs.sort((left, right) => compareUtf8(left.role, right.role) || compareUtf8(left.path, right.path));
}

/** Count the violations carrying one code. */
function countCode(violations, code) {
  return violations.filter((violation) => violation.code === code).length;
}

/** Prove the Outline assigns every ledger id to exactly one section. */
function evaluateOutline(workspaceRoot, options) {
  const ledger = readLedger(workspaceRoot, toWorkspacePath(workspaceRoot, resolve(options.ledger), { name: "ledger" }));
  const outline = readMarkdown(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(options.outline), { name: "outline" }),
    "outline"
  );

  const assignments = parseOutline(outline.text, ledger.sha256);
  const ledgerIds = new Set(ledger.records.map((record) => record.id));
  const violations = [];
  const assigned = new Set();

  for (const assignment of assignments) {
    if (!ledgerIds.has(assignment.id)) {
      violations.push({
        code: "unknown-evidence",
        id: assignment.id,
        line: assignment.line,
        message: `the Outline assigns ${assignment.id}, which is not in the ledger`,
      });
      continue;
    }
    if (assigned.has(assignment.id)) {
      violations.push({
        code: "duplicate-evidence",
        id: assignment.id,
        line: assignment.line,
        message: `${assignment.id} is assigned to more than one Outline section`,
      });
      continue;
    }
    assigned.add(assignment.id);
  }
  for (const record of ledger.records) {
    if (assigned.has(record.id)) continue;
    violations.push({
      code: "missing-evidence",
      id: record.id,
      message: `${record.id} is not assigned to any Outline section`,
    });
  }

  return {
    gate: "outline-coverage",
    stage: "outline",
    configuration: { mode: "outline" },
    inputs: [
      { role: "ledger", path: ledger.workspacePath, sha256: ledger.sha256 },
      { role: "outline", path: outline.workspacePath, sha256: outline.sha256 },
    ],
    counts: {
      ledger: ledgerIds.size,
      assigned: assigned.size,
      missing: countCode(violations, "missing-evidence"),
      unknown: countCode(violations, "unknown-evidence"),
      duplicate: countCode(violations, "duplicate-evidence"),
    },
    violations,
    readPaths: [ledger.path, outline.path],
  };
}

/** Prove the consumed manifest covers every ledger id exactly once into a real section. */
function evaluateDocument(workspaceRoot, options) {
  const ledger = readLedger(workspaceRoot, toWorkspacePath(workspaceRoot, resolve(options.ledger), { name: "ledger" }));
  const consumed = readConsumed(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(options.consumed), { name: "consumed manifest" })
  );
  const document = readMarkdown(
    workspaceRoot,
    toWorkspacePath(workspaceRoot, resolve(options.document), { name: "document" }),
    "document"
  );

  const headings = documentHeadings(splitLines(document.text));
  const ledgerIds = new Set(ledger.records.map((record) => record.id));
  const violations = [];
  const covered = new Set();

  consumed.records.forEach((record, index) => {
    const line = index + 1;
    if (!headings.has(record.section)) {
      violations.push({
        code: "unknown-section",
        id: record.id,
        line,
        message: `${record.id} names section ${JSON.stringify(record.section)}, which the document does not contain`,
      });
    }
    if (!ledgerIds.has(record.id)) {
      violations.push({
        code: "dangling-evidence",
        id: record.id,
        line,
        message: `the consumed manifest records ${record.id}, which is not in the ledger`,
      });
      return;
    }
    if (covered.has(record.id)) {
      violations.push({
        code: "duplicate-consumed",
        id: record.id,
        line,
        message: `${record.id} is consumed more than once`,
      });
      return;
    }
    covered.add(record.id);
  });
  for (const record of ledger.records) {
    if (covered.has(record.id)) continue;
    violations.push({
      code: "uncovered-evidence",
      id: record.id,
      message: `${record.id} never reached the document`,
    });
  }

  return {
    gate: "document-coverage",
    stage: options.stage,
    configuration: { mode: "document" },
    inputs: [
      { role: "consumed", path: consumed.workspacePath, sha256: consumed.sha256 },
      { role: "document", path: document.workspacePath, sha256: document.sha256 },
      { role: "ledger", path: ledger.workspacePath, sha256: ledger.sha256 },
    ],
    counts: {
      ledger: ledgerIds.size,
      consumed: consumed.records.length,
      uncovered: countCode(violations, "uncovered-evidence"),
      dangling: countCode(violations, "dangling-evidence"),
      duplicate: countCode(violations, "duplicate-consumed"),
      missingSection: countCode(violations, "unknown-section"),
    },
    violations,
    readPaths: [ledger.path, consumed.path, document.path],
  };
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  requireEnum(options.mode, MODES, "--mode");
  const forbidden = options.mode === "outline" ? DOCUMENT_ONLY_FLAGS : OUTLINE_ONLY_FLAGS;
  const required = options.mode === "outline" ? OUTLINE_ONLY_FLAGS : DOCUMENT_ONLY_FLAGS;
  for (const [key, flag] of forbidden) {
    if (options[key] !== undefined) fail("forbidden-option", `${flag} is forbidden for --mode ${options.mode}`);
  }
  for (const [key, flag] of required) {
    if (options[key] === undefined) {
      fail("missing-option", `required option ${flag} was not supplied for --mode ${options.mode}`);
    }
  }
  if (options.mode === "document") requireEnum(options.stage, STAGES, "--stage");

  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);
  const evaluation = options.mode === "outline"
    ? evaluateOutline(workspaceRoot, options)
    : evaluateDocument(workspaceRoot, options);

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.json), { name: "report output" });
  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "report output" });
  assertNoPathAliases([...evaluation.readPaths, target.path], { name: "coverage inputs and output" });

  const report = {
    schemaVersion: SCHEMA_VERSION,
    gate: evaluation.gate,
    stage: evaluation.stage,
    ok: evaluation.violations.length === 0,
    inputs: sortInputs(evaluation.inputs),
    configuration: evaluation.configuration,
    counts: evaluation.counts,
    violations: sortViolations(evaluation.violations),
  };

  writeAtomicFile(target.path, canonicalJson(report, { name: "coverage report" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: evaluation.readPaths,
  });
  process.stderr.write(
    `coverage(${report.gate}/${report.stage}): ${report.ok ? "ok" : "failed"};`
    + ` ${report.counts.ledger} ledger id(s), ${report.violations.length} violation(s) -> ${outPath}\n`
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
