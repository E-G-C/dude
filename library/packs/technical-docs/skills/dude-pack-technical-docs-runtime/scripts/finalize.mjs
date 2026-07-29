#!/usr/bin/env node
// finalize.mjs — Publish the reviewed document only from current passing evidence.
//
// Every earlier gate is a claim about exact bytes. This command is the one place
// those claims are reconciled with what is on disk right now: the Source Registry,
// every registered Source, the reviewed draft, the consumed manifest, and the six
// gate reports plus the semantic review that binds them together.
//
// The chain is closed end to end. Extraction binds the registry and the ledger;
// outline and both coverage reports bind the same ledger; the review binds the
// pre-review report bytes, the draft it was given, the document it produced, and
// the consumed manifest for that document; both final reports bind that same
// document. A pre-review report is stage-tagged and cannot stand in for a final
// report, and any mutation of a Source, the document, the consumed manifest, the
// review, or a report breaks a binding before anything is written.
//
// Publication itself is contained, safe-parent, and atomic: create publishes with
// no-replace semantics, while replace and update revalidate the registered
// expectedTarget immediately before an adjacent atomic rename.
//
// Usage:
//   node <rt>/finalize.mjs \
//     --workspace-root <dir> --sources <sources.json> \
//     --draft <reviewed.md> --consumed <consumed.jsonl> \
//     --extraction <extraction.json> \
//     --outline-coverage <outline-coverage.json> \
//     --pre-coverage <pre-review-coverage.json> \
//     --pre-lint <pre-review-lint.json> --review <review.json> \
//     --final-coverage <final-coverage.json> \
//     --final-lint <final-lint.json>
//
// The final destination and output mode come from sources.json; neither can be
// overridden. Exits 0 after publication, 2 for invalid CLI, schema, path, alias,
// stale, or drifted input, and 3 for an empty draft or consumed set. Exits 2 and
// 3 leave the registered output byte-for-byte unchanged.

import { resolve } from "node:path";

import {
  DEFAULT_LIMITS,
  EXIT_CODES,
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
  compareUtf8,
  decodeUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  parseCliOptions,
  readJsonFile,
  readJsonlFile,
  readStableBytes,
  resolveWorkspacePath,
  sha256Bytes,
  toWorkspacePath,
  validateByteCount,
  validateDigest,
  validateEvidenceId,
  validateLimits,
  validateLine,
  validatePersistedPath,
  validateSourceId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const SOURCE_KINDS = Object.freeze(["transcript", "notes", "draft", "document", "repo"]);
const SOURCE_ROLES = Object.freeze(["input", "update-target"]);
const OUTPUT_MODES = Object.freeze(["create", "replace", "update"]);
const GATE_STAGES = Object.freeze(["intake", "extraction", "outline", "pre-review", "final"]);
const CONSUMED_RESOLUTIONS = Object.freeze(["superseded"]);
const REVIEWER = "dude-pack-technical-docs-reviewer";

// Every required report, in the order the canonical gate sequence produces it.
const REQUIRED_REPORTS = Object.freeze([
  Object.freeze({
    key: "extraction",
    flag: "--extraction",
    gate: "extraction-audit",
    stage: "extraction",
    zeroCounts: Object.freeze(["flagged"]),
    roles: Object.freeze(["ledger", "source-registry"]),
  }),
  Object.freeze({
    key: "outlineCoverage",
    flag: "--outline-coverage",
    gate: "outline-coverage",
    stage: "outline",
    zeroCounts: Object.freeze(["missing", "unknown", "duplicate"]),
    roles: Object.freeze(["ledger", "outline"]),
  }),
  Object.freeze({
    key: "preCoverage",
    flag: "--pre-coverage",
    gate: "document-coverage",
    stage: "pre-review",
    zeroCounts: Object.freeze(["uncovered", "dangling", "duplicate", "missingSection"]),
    roles: Object.freeze(["consumed", "document", "ledger"]),
  }),
  Object.freeze({
    key: "preLint",
    flag: "--pre-lint",
    gate: "lint",
    stage: "pre-review",
    zeroCounts: Object.freeze(["violations"]),
    roles: Object.freeze(["document", "source-registry"]),
  }),
  Object.freeze({
    key: "finalCoverage",
    flag: "--final-coverage",
    gate: "document-coverage",
    stage: "final",
    zeroCounts: Object.freeze(["uncovered", "dangling", "duplicate", "missingSection"]),
    roles: Object.freeze(["consumed", "document", "ledger"]),
  }),
  Object.freeze({
    key: "finalLint",
    flag: "--final-lint",
    gate: "lint",
    stage: "final",
    zeroCounts: Object.freeze(["violations"]),
    roles: Object.freeze(["document", "source-registry"]),
  }),
]);

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  draft: { flag: "--draft", required: true },
  consumed: { flag: "--consumed", required: true },
  review: { flag: "--review", required: true },
  ...Object.fromEntries(REQUIRED_REPORTS.map((report) => [report.key, { flag: report.flag, required: true }])),
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

/** Require two bound digests to describe the same bytes. */
function requireSameDigest(left, right, code, message) {
  if (left !== right) fail(code, message);
  return left;
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
  assertClosedRecord(registry.output.expectedTarget, {
    name: "sources.json output.expectedTarget",
    required: ["state", "bytes", "sha256"],
  });
  const expected = registry.output.expectedTarget;
  if (expected.state === "absent") {
    if (expected.bytes !== null || expected.sha256 !== null) {
      fail("invalid-expected-target", "an absent expected target requires null bytes and sha256");
    }
  } else if (expected.state === "file") {
    validateByteCount(expected.bytes, { name: "expectedTarget.bytes" });
    validateDigest(expected.sha256, { name: "expectedTarget.sha256" });
  } else {
    fail("invalid-expected-target", "expected target state must be absent or file");
  }
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
  if (registry.sources.filter((source) => source.role === "update-target").length > 1) {
    fail("invalid-registry", "sources.json declares more than one update-target Source");
  }
  return registry;
}

/** Validate one closed schema-version-2 gate report envelope. */
function validateGateReport(report) {
  assertVersion2Record(report, {
    name: "gate report",
    required: ["gate", "stage", "ok", "inputs", "configuration", "counts", "violations"],
  });
  requireNonemptyString(report.gate, "gate report gate");
  requireEnum(report.stage, GATE_STAGES, "gate report stage");
  if (typeof report.ok !== "boolean") fail("invalid-gate-report", "gate report ok must be boolean");
  assertDenseArray(report.inputs, { name: "gate report inputs", minLength: 1 });
  for (const input of report.inputs) {
    assertClosedRecord(input, { name: "gate report input", required: ["role", "path", "sha256"] });
    requireNonemptyString(input.role, "gate report input role");
    validatePersistedPath(input.path, { name: "gate report input path" });
    validateDigest(input.sha256, { name: "gate report input sha256" });
  }
  assertUniqueIdentities(report.inputs, (input) => input.role, { identityName: "gate report input role" });
  assertPlainRecord(report.configuration, { name: "gate report configuration" });
  assertPlainRecord(report.counts, { name: "gate report counts" });
  for (const [name, value] of Object.entries(report.counts)) {
    validateByteCount(value, { name: `gate report counts.${name}` });
  }
  assertDenseArray(report.violations, { name: "gate report violations" });
  for (const violation of report.violations) {
    assertClosedRecord(violation, {
      name: "gate report violation",
      required: ["code", "message"],
      optional: ["path", "line", "id"],
    });
    requireNonemptyString(violation.code, "gate report violation code");
    requireNonemptyString(violation.message, "gate report violation message");
    if (Object.hasOwn(violation, "path")) validatePersistedPath(violation.path, { name: "violation path" });
    if (Object.hasOwn(violation, "line")) validateLine(violation.line, { name: "violation line" });
    if (Object.hasOwn(violation, "id")) requireNonemptyString(violation.id, "violation id");
  }
  return report;
}

/**
 * Validate the semantic review handoff.
 * `touchedSections` is bound to the digest pair so an emptied or invented
 * section list cannot survive: a reviewer who changed the document must name at
 * least one section, and a reviewer who changed nothing must name none.
 */
function validateReviewReport(review) {
  assertVersion2Record(review, {
    name: "review report",
    required: [
      "gate",
      "ok",
      "reviewer",
      "inputDocumentSha256",
      "outputDocumentSha256",
      "consumedSha256",
      "preReviewCoverageSha256",
      "preReviewLintSha256",
      "touchedSections",
      "findings",
    ],
  });
  if (review.gate !== "semantic-review") fail("invalid-review", "the review report gate must be semantic-review");
  if (review.ok !== true) fail("failed-review", "the semantic review did not pass");
  if (review.reviewer !== REVIEWER) fail("unauthorized-reviewer", `the semantic review must be produced by ${REVIEWER}`);
  for (const field of [
    "inputDocumentSha256",
    "outputDocumentSha256",
    "consumedSha256",
    "preReviewCoverageSha256",
    "preReviewLintSha256",
  ]) {
    validateDigest(review[field], { name: `review ${field}` });
  }

  assertDenseArray(review.touchedSections, { name: "review touchedSections" });
  for (const section of review.touchedSections) requireNonemptyString(section, "review touched section");
  for (let index = 1; index < review.touchedSections.length; index++) {
    if (compareUtf8(review.touchedSections[index - 1], review.touchedSections[index]) >= 0) {
      fail("invalid-review", "review touchedSections must be unique and sorted");
    }
  }
  const changed = review.inputDocumentSha256 !== review.outputDocumentSha256;
  if (changed && review.touchedSections.length === 0) {
    fail("invalid-review", "a review that changed the document must name every touched section");
  }
  if (!changed && review.touchedSections.length !== 0) {
    fail("invalid-review", "a review that changed nothing must not name a touched section");
  }

  assertDenseArray(review.findings, { name: "review findings" });
  for (const finding of review.findings) {
    assertClosedRecord(finding, {
      name: "review finding",
      required: ["code", "severity", "section", "resolution"],
    });
    for (const field of ["code", "severity", "section", "resolution"]) {
      requireNonemptyString(finding[field], `review finding ${field}`);
    }
  }
  assertUniqueIdentities(review.findings, (finding) => `${finding.code}\u0000${finding.section}`, {
    identityName: "review finding identity",
  });
  for (let index = 1; index < review.findings.length; index++) {
    const previous = review.findings[index - 1];
    const finding = review.findings[index];
    if ((compareUtf8(previous.code, finding.code) || compareUtf8(previous.section, finding.section)) > 0) {
      fail("invalid-review", "review findings must be deterministically ordered by code then section");
    }
  }
  return review;
}

/** Validate one strict consumed record's closed grammar. */
function validateConsumedRecord(record) {
  assertClosedRecord(record, { name: "consumed record", required: ["id", "section"], optional: ["resolution"] });
  validateEvidenceId(record.id, { name: "consumed id" });
  requireNonemptyString(record.section, "consumed section");
  if (Object.hasOwn(record, "resolution")) requireEnum(record.resolution, CONSUMED_RESOLUTIONS, "consumed resolution");
  return record;
}

/** Serialize one consumed record in exact contract field order. */
function canonicalConsumedRecord(record) {
  const canonical = { id: record.id, section: record.section };
  if (Object.hasOwn(record, "resolution")) canonical.resolution = record.resolution;
  return canonical;
}

/** Stable-read one strictly canonical JSON artifact and derive its exact identity. */
function readCanonicalJson(workspaceRoot, hostPath, options) {
  const workspacePath = toWorkspacePath(workspaceRoot, resolve(hostPath), { name: options.name });
  const absolutePath = resolveWorkspacePath(workspaceRoot, workspacePath, { name: options.name });
  const value = readJsonFile(absolutePath, {
    name: options.name,
    maxBytes: options.maxBytes,
    workspaceRoot,
    workspacePath,
    validate: options.validate,
    strictCanonical: true,
    canonicalize: (parsed) => parsed,
  });
  const text = canonicalJson(value, { name: options.name });
  return Object.freeze({ path: absolutePath, workspacePath, value, sha256: sha256Bytes(text) });
}

/** Return the one input a report bound to the named role. */
function boundInput(report, role) {
  const matches = report.value.inputs.filter((input) => input.role === role);
  if (matches.length !== 1) {
    fail("missing-gate-input", `the ${report.value.gate} ${report.value.stage} report declares no ${role} input`);
  }
  return matches[0];
}

/** Require one report to be the current, passing, correctly staged artifact. */
function requirePassingReport(report, descriptor) {
  if (report.value.gate !== descriptor.gate) {
    fail("unexpected-gate-report", `${descriptor.flag} must supply a ${descriptor.gate} report`);
  }
  if (report.value.stage !== descriptor.stage) {
    fail("stale-gate-stage", `${descriptor.flag} must supply a ${descriptor.stage}-stage report`);
  }
  if (report.value.ok !== true) fail("failed-gate", `${descriptor.flag} reports a failed gate`);
  if (report.value.violations.length !== 0) {
    fail("inconsistent-gate-report", `${descriptor.flag} reports ok with unresolved violations`);
  }
  for (const name of descriptor.zeroCounts) {
    if (report.value.counts[name] !== 0) {
      fail("inconsistent-gate-report", `${descriptor.flag} reports ok with a nonzero ${name} count`);
    }
  }
  for (const role of descriptor.roles) boundInput(report, role);
  return report;
}

/** Require a bound report input to name the exact artifact supplied now. */
function requireBoundArtifact(input, artifact, descriptor, role) {
  if (input.path !== artifact.workspacePath) {
    fail("gate-input-path-mismatch", `${descriptor.flag} evaluated a different ${role}`, { path: input.path });
  }
  requireSameDigest(
    input.sha256,
    artifact.sha256,
    "stale-gate-report",
    `${descriptor.flag} evaluated a different ${role} revision`
  );
  return input;
}

/** Re-verify that every registered Source still holds its registered bytes. */
function assertSourcesUnchanged(workspaceRoot, registry, limits) {
  const resolved = [];
  for (const source of registry.sources) {
    const authorized = authorizeExistingPath(workspaceRoot, source.path, {
      name: `${source.id} source`,
      kind: source.pathType,
      allowRoot: source.kind === "repo",
    });
    resolved.push({ source, path: authorized.path });
    if (source.pathType !== "file") continue;
    const bytes = readStableBytes(authorized.path, {
      maxBytes: source.sizeBytes,
      exactBytes: source.sizeBytes,
      workspaceRoot,
      workspacePath: source.path,
    });
    if (sha256Bytes(bytes) !== source.sha256) {
      fail("source-digest-mismatch", `${source.id} no longer matches its registered digest`, { path: source.path });
    }
  }
  if (limits.sourcesPerRun < resolved.length) fail("invalid-registry", "sources.json exceeds its own per-run bound");
  return resolved;
}

/** Authorize the declared output mode against the registered target state. */
function authorizeOutput(registry) {
  const output = registry.output;
  const updateTargets = registry.sources.filter((source) => source.role === "update-target");
  if (output.mode === "update") {
    if (output.updateSourceId === null) fail("unauthorized-update-target", "update mode requires an updateSourceId");
    validateSourceId(output.updateSourceId, { name: "sources.json output.updateSourceId" });
    if (updateTargets.length !== 1 || updateTargets[0].id !== output.updateSourceId) {
      fail("unauthorized-update-target", "output.updateSourceId does not name the one update-target Source");
    }
    const target = updateTargets[0];
    if (target.kind !== "document" || target.pathType !== "file" || target.path !== output.path) {
      fail("unauthorized-update-target", "the update target must be the registered document Source at output.path");
    }
    if (
      output.expectedTarget.state !== "file"
      || output.expectedTarget.bytes !== target.sizeBytes
      || output.expectedTarget.sha256 !== target.sha256
    ) {
      fail("unauthorized-update-target", "expectedTarget does not match the registered update-target Source");
    }
    return target;
  }

  if (output.updateSourceId !== null) {
    fail("unauthorized-update-target", `${output.mode} mode must not declare an updateSourceId`);
  }
  if (updateTargets.length !== 0) {
    fail("unauthorized-update-target", `${output.mode} mode must not register an update-target Source`);
  }
  if (registry.sources.some((source) => source.path === output.path)) {
    fail("unauthorized-update-target", `${output.mode} mode must not register the output as a Source`);
  }
  const requiredState = output.mode === "create" ? "absent" : "file";
  if (output.expectedTarget.state !== requiredState) {
    fail("invalid-expected-target", `${output.mode} mode requires expectedTarget.state ${requiredState}`);
  }
  return null;
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);

  const registry = readCanonicalJson(workspaceRoot, options.sources, {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    validate: validateRegistry,
  });
  const limits = registry.value.limits;

  // The reviewed draft is the exact byte sequence that will be published.
  const draftPath = toWorkspacePath(workspaceRoot, resolve(options.draft), { name: "reviewed draft" });
  const draftAbsolute = resolveWorkspacePath(workspaceRoot, draftPath, { name: "reviewed draft" });
  const draftBytes = readStableBytes(draftAbsolute, {
    maxBytes: limits.documentBytes,
    workspaceRoot,
    workspacePath: draftPath,
  });
  if (draftBytes.length === 0) {
    fail("empty-document", "the reviewed draft must not be empty", {
      path: draftPath,
      exitCode: EXIT_CODES.EMPTY_INPUT,
    });
  }
  decodeUtf8(draftBytes, { path: draftPath, allowBom: true });
  const draft = Object.freeze({ path: draftAbsolute, workspacePath: draftPath, sha256: sha256Bytes(draftBytes) });

  const consumedPath = toWorkspacePath(workspaceRoot, resolve(options.consumed), { name: "consumed manifest" });
  const consumedAbsolute = resolveWorkspacePath(workspaceRoot, consumedPath, { name: "consumed manifest" });
  const consumedRecords = readJsonlFile(consumedAbsolute, {
    maxBytes: limits.jsonlBytesPerFile,
    maxLineBytes: limits.jsonlBytesPerLine,
    maxRecords: limits.jsonlRecords,
    workspaceRoot,
    workspacePath: consumedPath,
    requireNonempty: true,
    validate: validateConsumedRecord,
    strictCanonical: true,
    canonicalize: canonicalConsumedRecord,
  });
  const consumed = Object.freeze({
    path: consumedAbsolute,
    workspacePath: consumedPath,
    sha256: sha256Bytes(canonicalJsonl(consumedRecords.map(canonicalConsumedRecord), {
      name: "consumed.jsonl",
      requireNonempty: true,
    })),
  });

  const reports = Object.fromEntries(REQUIRED_REPORTS.map((descriptor) => [
    descriptor.key,
    requirePassingReport(
      readCanonicalJson(workspaceRoot, options[descriptor.key], {
        name: `${descriptor.gate} ${descriptor.stage} report`,
        maxBytes: limits.jsonBytesPerFile,
        validate: validateGateReport,
      }),
      descriptor
    ),
  ]));
  const review = readCanonicalJson(workspaceRoot, options.review, {
    name: "review.json",
    maxBytes: limits.jsonBytesPerFile,
    validate: validateReviewReport,
  });
  const descriptors = Object.fromEntries(REQUIRED_REPORTS.map((descriptor) => [descriptor.key, descriptor]));

  // Registry binding: every registry-aware gate must have read these exact bytes.
  for (const key of ["extraction", "preLint", "finalLint"]) {
    requireBoundArtifact(boundInput(reports[key], "source-registry"), registry, descriptors[key], "Source Registry");
  }

  // Ledger binding: extraction, outline, and both coverage gates share one ledger.
  const ledger = boundInput(reports.extraction, "ledger");
  for (const key of ["outlineCoverage", "preCoverage", "finalCoverage"]) {
    const bound = boundInput(reports[key], "ledger");
    if (bound.path !== ledger.path) {
      fail("gate-input-path-mismatch", `${descriptors[key].flag} evaluated a different ledger`, { path: bound.path });
    }
    requireSameDigest(bound.sha256, ledger.sha256, "stale-gate-report", `${descriptors[key].flag} evaluated a stale ledger`);
  }

  // Review handoff: the review must bind the exact pre-review report bytes.
  requireSameDigest(
    review.value.preReviewCoverageSha256,
    reports.preCoverage.sha256,
    "stale-review-handoff",
    "the review does not bind the supplied pre-review coverage report"
  );
  requireSameDigest(
    review.value.preReviewLintSha256,
    reports.preLint.sha256,
    "stale-review-handoff",
    "the review does not bind the supplied pre-review lint report"
  );
  for (const key of ["preCoverage", "preLint"]) {
    requireSameDigest(
      boundInput(reports[key], "document").sha256,
      review.value.inputDocumentSha256,
      "stale-review-handoff",
      `${descriptors[key].flag} did not evaluate the document the review received`
    );
  }

  // Final evidence: both final gates and the review must describe this draft.
  requireSameDigest(
    review.value.outputDocumentSha256,
    draft.sha256,
    "stale-review-handoff",
    "the review describes a different document than the supplied draft"
  );
  for (const key of ["finalCoverage", "finalLint"]) {
    requireBoundArtifact(boundInput(reports[key], "document"), draft, descriptors[key], "document");
  }
  requireSameDigest(
    review.value.consumedSha256,
    consumed.sha256,
    "stale-review-handoff",
    "the review describes a different consumed manifest"
  );
  requireBoundArtifact(
    boundInput(reports.finalCoverage, "consumed"),
    consumed,
    descriptors.finalCoverage,
    "consumed manifest"
  );

  // Cross-report reconciliation: independently recomputable report facts must
  // still agree, so a report edited after its gate ran no longer reconciles.
  for (const key of ["preCoverage", "finalCoverage"]) {
    if (reports[key].value.counts.ledger !== reports.outlineCoverage.value.counts.ledger) {
      fail("inconsistent-gate-report", `${descriptors[key].flag} counted a different ledger than the Outline gate`);
    }
  }
  if (reports.outlineCoverage.value.counts.assigned !== reports.outlineCoverage.value.counts.ledger) {
    fail("inconsistent-gate-report", "--outline-coverage reports ok without assigning every ledger id");
  }
  if (reports.finalCoverage.value.counts.consumed !== consumedRecords.length) {
    fail("inconsistent-gate-report", "--final-coverage counted a different consumed manifest");
  }
  for (const key of ["preLint", "finalLint"]) {
    if (reports[key].value.configuration.documentBytes !== limits.documentBytes) {
      fail("inconsistent-gate-report", `${descriptors[key].flag} applied a different document bound`);
    }
  }
  const extractionCounts = reports.extraction.value.counts;
  if (
    extractionCounts.expected !== extractionCounts.results
    || extractionCounts.results !== extractionCounts.evidence + extractionCounts.noEvidence
  ) {
    fail("inconsistent-gate-report", "--extraction counts do not reconcile");
  }

  // Current state: no registered Source may have changed since registration.
  const sources = assertSourcesUnchanged(workspaceRoot, registry.value, limits);
  const updateTarget = authorizeOutput(registry.value);

  const outputPath = registry.value.output.path;
  const outputAbsolute = resolveWorkspacePath(workspaceRoot, outputPath, { name: "final document" });
  const inputPaths = [
    registry.path,
    draft.path,
    consumed.path,
    review.path,
    ...REQUIRED_REPORTS.map((descriptor) => reports[descriptor.key].path),
  ];
  const sourcePaths = sources.map((entry) => entry.path);
  // Update mode authorizes exactly one Source/output alias: the update target,
  // which is already represented by its own Source entry.
  assertNoPathAliases(
    updateTarget === null ? [...inputPaths, ...sourcePaths, outputAbsolute] : [...inputPaths, ...sourcePaths],
    { name: "finalize inputs and output" }
  );

  const target = ensureContainedOutputParent(workspaceRoot, outputPath, { name: "final document" });
  const published = writeAtomicFile(target.path, draftBytes, {
    workspaceRoot,
    mode: registry.value.output.mode === "create" ? "create" : "replace",
    expectedTarget: registry.value.output.expectedTarget,
    protectedPaths: [
      ...inputPaths,
      ...sources.filter((entry) => entry.source !== updateTarget).map((entry) => entry.path),
    ],
  });
  process.stderr.write(
    `finalize: published ${published.bytes} byte(s) to ${outputPath} in ${registry.value.output.mode} mode`
    + ` (sha256 ${published.sha256})\n`
  );
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
