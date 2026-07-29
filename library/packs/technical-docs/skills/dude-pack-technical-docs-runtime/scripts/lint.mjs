#!/usr/bin/env node
// lint.mjs — Deterministic structural checks for a Technical Document revision.
//
// Catches the mechanical defects a semantic review pass tends to miss, so the
// reviewer only acts on real violations instead of re-reading the whole document.
//
// Checks: leftover <!-- DIAGRAM --> and <!-- SECTION --> markers, any HTML
// comment or tag, unclosed CommonMark fences, a missing top-level title, heading
// level jumps, and purely linear Mermaid blocks. Clarification markers are
// counted. Fence tracking is the shared CommonMark implementation, so a ``` line
// inside a ~~~ block does not close it and a closer shorter than its opener does
// not close it either.
//
// The report records its stage and binds the exact document and Source Registry
// bytes it evaluated, so a pre-review report can never satisfy a final-report
// requirement and no report survives a change to what it examined.
//
// Usage:
//   node <rt>/lint.mjs \
//     --workspace-root <dir> --sources <sources.json> \
//     --stage <pre-review|final> <document.md> --json <lint.json>
//
// Exits 0 when the document is clean, 1 after atomically replacing the report
// with ok:false, 2 for invalid CLI, schema, path, alias, or bound input, and 3
// for an empty document. Exits 2 and 3 replace no declared output.

import { resolve } from "node:path";

import {
  DEFAULT_LIMITS,
  EXIT_CODES,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertNoPathAliases,
  assertUniqueIdentities,
  assertVersion2Record,
  canonicalJson,
  compareUtf8,
  createFenceState,
  decodeUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  parseCliOptions,
  readJsonFile,
  readStableBytes,
  resolveWorkspacePath,
  sha256Bytes,
  toWorkspacePath,
  updateFenceState,
  validateByteCount,
  validateDigest,
  validateLimits,
  validatePersistedPath,
  validateSourceId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const STAGES = Object.freeze(["pre-review", "final"]);
const SOURCE_KINDS = Object.freeze(["transcript", "notes", "draft", "document", "repo"]);
const SOURCE_ROLES = Object.freeze(["input", "update-target"]);
const OUTPUT_MODES = Object.freeze(["create", "replace", "update"]);

const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/?>/;
const ATX_HEADING = /^ {0,3}(#{1,6})([ \t].*)?$/;
const ATX_CLOSING_SEQUENCE = /[ \t]+#+[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const BLANK_LINE = /^[ \t]*$/;
const CLARIFICATION_MARKER = /\[NEEDS CLARIFICATION/g;
const DIAGRAM_CAPTION = /^Diagram\b/i;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  stage: { flag: "--stage", required: true },
  json: { flag: "--json", required: true },
});

/** Require a member of a closed enumeration. */
function requireEnum(value, allowed, name) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail("invalid-enum", `${name} must be one of ${allowed.join(", ")}`);
  }
  return value;
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

/**
 * Split argv into option tokens and the one positional document path.
 * Every token beginning with `--` is forwarded to the shared closed parser with
 * its value, so unknown, duplicate, and value-less options still fail there.
 */
function partitionArgv(argv) {
  assertDenseArray(argv, { name: "argv" });
  const optionTokens = [];
  const positionals = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (typeof token !== "string") fail("invalid-cli-argument", `argv[${index}] must be a string`);
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    optionTokens.push(token);
    const value = argv[index + 1];
    if (typeof value === "string" && !value.startsWith("--")) optionTokens.push(argv[++index]);
  }
  return Object.freeze({ optionTokens, positionals });
}

/** Require exactly one positional document path. */
function requireDocumentArgument(positionals) {
  if (positionals.length === 0) fail("missing-document", "one <document.md> path is required");
  if (positionals.length > 1) fail("unexpected-argument", "exactly one <document.md> path is supported");
  return positionals[0];
}

function stripMermaidLabel(node) {
  return node
    .trim()
    .replace(/^\|[^|]*\|\s*/, "")
    .replace(/[\[{(].*$/, "")
    .replace(/[^A-Za-z0-9_.$:-].*$/, "")
    .trim();
}

function addEdge(adjacency, reverseAdjacency, from, to) {
  if (!from || !to || from === "[" || to === "]") return;
  if (!adjacency.has(from)) adjacency.set(from, new Set());
  if (!reverseAdjacency.has(to)) reverseAdjacency.set(to, new Set());
  adjacency.get(from).add(to);
  reverseAdjacency.get(to).add(from);
}

function hasCycle(adjacency) {
  const visiting = new Set();
  const visited = new Set();

  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) || []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of adjacency.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

function inspectMermaidBlock(blockLines) {
  const content = blockLines.join("\n");
  const bodyLines = blockLines.map((line) => line.trim()).filter(Boolean);
  const first = bodyLines.find((line) => !line.startsWith("%%")) || "";
  const lowerFirst = first.toLowerCase();

  if (lowerFirst.startsWith("sequencediagram")) {
    const hasControl = /^\s*(alt|else|opt|par|and|loop|critical|break)\b/im.test(content);
    return hasControl ? null : "Mermaid sequence diagram is purely linear; replace it with prose, numbered steps, or add only source-supported branches/alternates.";
  }

  if (!/^(graph|flowchart|statediagram-v2|statediagram)\b/i.test(first)) return null;

  const adjacency = new Map();
  const reverseAdjacency = new Map();
  let edgeCount = 0;
  let hasDecisionShape = false;
  let hasParallelSyntax = false;
  let hasChoiceState = false;

  for (const rawLine of bodyLines) {
    const line = rawLine.replace(/%%.*$/, "").trim();
    if (!line || /^(graph|flowchart|stateDiagram-v2|stateDiagram|direction|subgraph|end)\b/i.test(line)) continue;
    if (/<<\s*(choice|fork|join)\s*>>/i.test(line)) hasChoiceState = true;
    if (/\b[A-Za-z0-9_.$:-]+\s*\{/.test(line)) hasDecisionShape = true;
    if (/\s&\s/.test(line)) hasParallelSyntax = true;

    const edgeMatch = line.match(/^\s*([^\-~=]+?)\s*(?:-->|---|-.->|==>|--|~~>|--x|--o)\s*(.+?)\s*;?$/);
    if (!edgeMatch) continue;

    const from = stripMermaidLabel(edgeMatch[1]);
    const to = stripMermaidLabel(edgeMatch[2]);
    addEdge(adjacency, reverseAdjacency, from, to);
    edgeCount++;
  }

  if (edgeCount === 0) return null;

  const hasSplit = [...adjacency.values()].some((targets) => targets.size > 1);
  const hasMerge = [...reverseAdjacency.values()].some((sources) => sources.size > 1);
  const hasNonLinearStructure = hasDecisionShape || hasParallelSyntax || hasChoiceState || hasSplit || hasMerge || hasCycle(adjacency);

  return hasNonLinearStructure ? null : "Mermaid diagram is purely linear; replace it with prose, numbered steps, or a table unless the source supports a real branch, loop, merge, exception, or parallel path.";
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

/** Inspect one document revision with shared CommonMark fence tracking. */
function lint(text) {
  const lines = splitLines(text);
  const violations = [];
  const add = (code, line, message) => violations.push({ code, line, message });

  const fence = createFenceState();
  const headings = [];
  let fences = 0;
  let clarificationMarkers = 0;
  let mermaid = null;
  let firstNonBlankLine = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;
    clarificationMarkers += (line.match(CLARIFICATION_MARKER) ?? []).length;

    const event = updateFenceState(fence, line, lineNumber);
    if (event?.type === "open") {
      fences++;
      if (event.info.toLowerCase().startsWith("mermaid")) mermaid = { line: lineNumber, lines: [] };
      continue;
    }
    if (event?.type === "close") {
      if (mermaid !== null) {
        const message = inspectMermaidBlock(mermaid.lines);
        if (message) add("linear-mermaid", mermaid.line, message);
        mermaid = null;
      }
      continue;
    }
    if (fence.open) {
      if (mermaid !== null) mermaid.lines.push(line);
      continue;
    }

    if (firstNonBlankLine === null && !BLANK_LINE.test(line)) firstNonBlankLine = lineNumber;

    if (/<!--\s*DIAGRAM\b/i.test(line)) {
      add("leftover-placeholder", lineNumber, "Unresolved <!-- DIAGRAM ... --> placeholder remains.");
    } else if (/<!--\s*SECTION\b/i.test(line)) {
      add("leftover-section", lineNumber, "Unfilled <!-- SECTION ... --> marker remains (a section was never drafted).");
    } else if (/<!--/.test(line)) {
      add("html-comment", lineNumber, "HTML comment present in output.");
    }

    const tag = line.match(HTML_TAG);
    if (tag) add("html-tag", lineNumber, `HTML tag present in output: ${tag[0]}`);

    const atx = line.match(ATX_HEADING);
    if (atx !== null) {
      const headingText = atxHeadingText(atx[2]);
      if (headingText.length === 0) add("empty-heading", lineNumber, "A heading must carry nonempty text.");
      else headings.push({ level: atx[1].length, text: headingText, line: lineNumber });
      continue;
    }

    const next = lines[index + 1];
    if (next !== undefined && !BLANK_LINE.test(line) && SETEXT_UNDERLINE.test(next)) {
      headings.push({
        level: next.trim().startsWith("=") ? 1 : 2,
        text: line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, ""),
        line: lineNumber,
      });
      index++; // the underline belongs to this heading
    }
  }

  if (fence.open) add("unbalanced-fence", fence.line, "Unclosed code fence (opened here, never closed).");

  // Diagram captions such as "#### Diagram 1 - Flow" are a deliberate convention
  // and stay transparent to the structural heading sequence.
  const structural = headings.filter((heading) => !DIAGRAM_CAPTION.test(heading.text));
  if (structural.length === 0 || structural[0].level !== 1 || structural[0].line !== firstNonBlankLine) {
    add("title", firstNonBlankLine ?? 1, 'Document does not start with a top-level "# " title heading.');
  }
  for (let index = 1; index < structural.length; index++) {
    const previous = structural[index - 1];
    const heading = structural[index];
    if (heading.level > previous.level + 1) {
      add("heading-jump", heading.line, `Heading level jumps from ${previous.level} to ${heading.level}.`);
    }
  }

  violations.sort((left, right) => (left.line - right.line) || compareUtf8(left.code, right.code));
  return { headings: headings.length, fences, clarificationMarkers, violations };
}

function run(argv) {
  const partitioned = partitionArgv(argv);
  const options = parseCliOptions(partitioned.optionTokens, CLI_DEFINITIONS);
  const documentArgument = requireDocumentArgument(partitioned.positionals);
  requireEnum(options.stage, STAGES, "--stage");
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
  const registrySha256 = sha256Bytes(canonicalJson(registry, { name: "sources.json" }));

  const documentPath = toWorkspacePath(workspaceRoot, resolve(documentArgument), { name: "document" });
  const documentAbsolute = resolveWorkspacePath(workspaceRoot, documentPath, { name: "document" });
  const documentBytes = readStableBytes(documentAbsolute, {
    maxBytes: registry.limits.documentBytes,
    workspaceRoot,
    workspacePath: documentPath,
  });
  if (documentBytes.length === 0) {
    fail("empty-document", "the document must not be empty", {
      path: documentPath,
      exitCode: EXIT_CODES.EMPTY_INPUT,
    });
  }

  const result = lint(decodeUtf8(documentBytes, { path: documentPath, allowBom: true }));
  const outPath = toWorkspacePath(workspaceRoot, resolve(options.json), { name: "report output" });
  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "report output" });
  const readPaths = [documentAbsolute, registryAbsolute];
  assertNoPathAliases([...readPaths, target.path], { name: "lint inputs and output" });

  const report = {
    schemaVersion: SCHEMA_VERSION,
    gate: "lint",
    stage: options.stage,
    ok: result.violations.length === 0,
    inputs: [
      { role: "document", path: documentPath, sha256: sha256Bytes(documentBytes) },
      { role: "source-registry", path: registryPath, sha256: registrySha256 },
    ].sort((left, right) => compareUtf8(left.role, right.role) || compareUtf8(left.path, right.path)),
    configuration: { documentBytes: registry.limits.documentBytes },
    counts: {
      headings: result.headings,
      fences: result.fences,
      clarificationMarkers: result.clarificationMarkers,
      violations: result.violations.length,
    },
    violations: result.violations,
  };

  writeAtomicFile(target.path, canonicalJson(report, { name: "lint report" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [
      ...readPaths,
      ...registry.sources.map((source) => resolveWorkspacePath(workspaceRoot, source.path, {
        name: "registered source",
        allowRoot: source.kind === "repo",
      })),
      resolveWorkspacePath(workspaceRoot, registry.output.path, { name: "registered output" }),
    ],
  });
  process.stderr.write(
    `lint(${report.stage}): ${report.ok ? "ok" : "failed"}; ${report.counts.headings} heading(s),`
    + ` ${report.counts.violations} violation(s) -> ${outPath}\n`
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
