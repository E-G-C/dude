#!/usr/bin/env node
// headings.mjs — Author the Heading Manifest for one registered document Source.
//
// Existing-document evidence must be locatable, so every heading keeps its
// level, parsed text, hierarchical path, and the line span it governs. Repeated
// or nested headings stay distinguishable through that span.
//
// Headings inside matching fenced content are excluded, an unclosed or
// mismatched fence keeps its content fenced, and a closing ATX hash sequence is
// removed only when whitespace-delimited, so a heading such as `C#` survives.
//
// Usage:
//   node <rt>/headings.mjs \
//     --workspace-root <dir> --sources <sources.json> --source <S-id> \
//     --out <headings.json>
//
// Exits 0 after atomically writing the manifest. Any invalid option, path,
// identity, digest, or bound exits 2 and replaces no declared output.

import { resolve } from "node:path";

import {
  DEFAULT_LIMITS,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertUniqueIdentities,
  assertVersion2Record,
  canonicalJson,
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

const DOCUMENT_KINDS = Object.freeze(["document"]);

const FRONT_MATTER_DELIMITER = /^---[ \t]*$/;
const ATX_HEADING = /^ {0,3}(#{1,6})([ \t].*)?$/;
const ATX_CLOSING_SEQUENCE = /[ \t]+#+[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const BLANK_LINE = /^[ \t]*$/;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  source: { flag: "--source", required: true },
  out: { flag: "--out", required: true },
});

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
    validateWorkspacePath(source.path, { name: "registered source path", allowRoot: source.kind === "repo" });
    if (source.ref !== source.path) fail("invalid-source-ref", `${source.id} ref must equal its path`);
    if (source.pathType === "file") {
      validateByteCount(source.sizeBytes, { name: `${source.id} sizeBytes` });
      validateDigest(source.sha256, { name: `${source.id} sha256` });
    }
  }
  assertUniqueIdentities(registry.sources, (source) => source.id, { identityName: "source id" });
  return registry;
}

/** Stable-read the validated Source Registry beneath the invocation root. */
function readRegistry(workspaceRoot, hostPath) {
  const registryPath = toWorkspacePath(workspaceRoot, resolve(hostPath), { name: "source registry" });
  return readJsonFile(resolveWorkspacePath(workspaceRoot, registryPath, { name: "source registry" }), {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    workspaceRoot,
    workspacePath: registryPath,
    validate: validateRegistry,
  });
}

/** Select the one declared Source and require an applicable kind. */
function selectSource(registry, sourceId, kinds) {
  validateSourceId(sourceId, { name: "--source" });
  const source = registry.sources.find((candidate) => candidate.id === sourceId);
  if (source === undefined) fail("unknown-source", `--source ${sourceId} is not registered in sources.json`);
  if (!kinds.includes(source.kind)) {
    fail("unsupported-source-kind", `--source ${sourceId} is a ${source.kind} Source; expected ${kinds.join(", ")}`);
  }
  return source;
}

/** Stable-read one registered file Source and require its registered identity. */
function readSourceText(workspaceRoot, source, maxBytes) {
  const absolutePath = resolveWorkspacePath(workspaceRoot, source.path, { name: `${source.kind} source` });
  const bytes = readStableBytes(absolutePath, {
    maxBytes,
    exactBytes: source.sizeBytes,
    workspaceRoot,
    workspacePath: source.path,
  });
  if (sha256Bytes(bytes) !== source.sha256) {
    fail("source-digest-mismatch", `${source.id} no longer matches its registered digest`, { path: source.path });
  }
  return decodeUtf8(bytes, { path: source.path, allowBom: true });
}

/** Split LF-normalized text into lines without inventing a trailing empty line. */
function splitLines(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Resolve every registered source and the registered output for write protection. */
function protectedRegistryPaths(workspaceRoot, registry) {
  return [
    ...registry.sources.map((source) => resolveWorkspacePath(workspaceRoot, source.path, {
      name: "registered source",
      allowRoot: source.kind === "repo",
    })),
    resolveWorkspacePath(workspaceRoot, registry.output.path, { name: "registered output" }),
  ];
}

/**
 * Return the first line index after a leading YAML front-matter block.
 * Front matter is skipped so its delimiters and `key: value` lines cannot be
 * read as setext headings.
 */
function frontMatterEnd(lines) {
  if (lines.length === 0 || !FRONT_MATTER_DELIMITER.test(lines[0])) return 0;
  for (let index = 1; index < lines.length; index++) {
    if (FRONT_MATTER_DELIMITER.test(lines[index])) return index + 1;
  }
  return 0;
}

/** Remove a whitespace-delimited ATX closing sequence, preserving names like `C#`. */
function atxHeadingText(raw) {
  if (raw === undefined) return "";
  const withoutClosing = raw.replace(ATX_CLOSING_SEQUENCE, "");
  return withoutClosing.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

/** Parse ATX and setext headings that are outside matching fenced content. */
function parseHeadings(lines) {
  const parsed = [];
  const fence = createFenceState();
  const start = frontMatterEnd(lines);

  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (updateFenceState(fence, line, index + 1) !== null || fence.open) continue;

    const atx = line.match(ATX_HEADING);
    if (atx !== null) {
      const text = atxHeadingText(atx[2]);
      if (text.length === 0) {
        fail("empty-heading-text", "a heading must carry nonempty text", { line: index + 1 });
      }
      parsed.push({ level: atx[1].length, text, startLine: index + 1, endLine: index + 1 });
      continue;
    }

    const next = lines[index + 1];
    if (next !== undefined && !BLANK_LINE.test(line) && SETEXT_UNDERLINE.test(next)) {
      const text = line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
      if (text.length === 0) {
        fail("empty-heading-text", "a heading must carry nonempty text", { line: index + 1 });
      }
      parsed.push({
        level: next.trim().startsWith("=") ? 1 : 2,
        text,
        startLine: index + 1,
        endLine: index + 2,
      });
      index++; // the underline belongs to this heading
    }
  }
  return parsed;
}

/** Assign hierarchical paths and the last line each heading governs. */
function resolveHeadings(parsed, lineCount) {
  const headings = [];
  const open = [];
  for (const heading of parsed) {
    while (open.length > 0 && open[open.length - 1].level >= heading.level) {
      const closed = open.pop();
      closed.endLine = Math.max(closed.endLine, heading.startLine - 1);
    }
    const record = {
      level: heading.level,
      text: heading.text,
      path: [...open.map((ancestor) => ancestor.text), heading.text].join(" > "),
      startLine: heading.startLine,
      endLine: heading.endLine,
    };
    headings.push(record);
    open.push(record);
  }
  for (const record of open) record.endLine = Math.max(record.endLine, lineCount);
  return headings;
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);
  const registry = readRegistry(workspaceRoot, options.sources);
  const source = selectSource(registry, options.source, DOCUMENT_KINDS);

  const lines = splitLines(readSourceText(workspaceRoot, source, registry.limits.documentBytes));
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    sourceId: source.id,
    sourceSha256: source.sha256,
    complete: true,
    headings: resolveHeadings(parseHeadings(lines), lines.length),
  };

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "heading manifest" });
  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "heading manifest" });
  writeAtomicFile(target.path, canonicalJson(manifest, { name: "headings.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: protectedRegistryPaths(workspaceRoot, registry),
  });
  process.stderr.write(`extracted ${manifest.headings.length} heading(s) from ${source.id}\n`);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
