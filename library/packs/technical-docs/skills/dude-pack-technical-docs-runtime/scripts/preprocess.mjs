#!/usr/bin/env node
// preprocess.mjs — Normalize exactly one registered prose Source into cleaned text.
//
// One invocation processes one Source. Transcript, notes, and draft Sources are
// never concatenated, so every cleaned line keeps a mapping back to its own
// Source line and no downstream unit can lose its origin.
//
// Transcripts are parsed as WEBVTT or SRT blocks, so only actual structure is
// removed: the WEBVTT signature block, real NOTE/STYLE/REGION blocks, cue
// identifiers, cue timings, and cue markup. Cue text that merely begins with
// NOTE, STYLE, or REGION is content and is preserved. Notes and drafts retain
// their text apart from newline normalization.
//
// Usage:
//   node <rt>/preprocess.mjs \
//     --workspace-root <dir> --sources <sources.json> --source <S-id> \
//     --out <clean.txt> --json <preprocess.json>
//
// Exits 0 after atomically writing the cleaned text and its manifest. Any
// invalid option, path, identity, digest, or bound exits 2 and replaces no
// declared output.

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
  validateByteCount,
  validateDigest,
  validateLimits,
  validatePersistedPath,
  validateSourceId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const PROSE_KINDS = Object.freeze(["transcript", "notes", "draft"]);

// WEBVTT and SRT structure. Timestamps carry an optional hours field and either
// fractional separator; cue settings may follow a timing line.
const TIMESTAMP = "(?:[0-9]{2,}:)?[0-9]{2}:[0-9]{2}[.,][0-9]{3}";
const TIMING_LINE = new RegExp(`^${TIMESTAMP}[ \\t]*-->[ \\t]*${TIMESTAMP}(?:[ \\t]+[^ \\t]+)*[ \\t]*$`);
const INLINE_TIMESTAMP_TAG = new RegExp(`<${TIMESTAMP}>`, "g");
const MARKUP_TAG = /<\/?(?:v|c|i|b|u|lang|ruby|rt)\b[^<>]*>/gi;
const SIGNATURE_LINE = /^WEBVTT(?:[ \t].*)?$/;
const COMMENT_BLOCK_LINE = /^NOTE(?:[ \t].*)?$/;
const STYLE_BLOCK_LINE = /^STYLE[ \t]*$/;
const REGION_BLOCK_LINE = /^REGION[ \t]*$/;
const CUE_NUMBER_LINE = /^[0-9]+$/;
const BLANK_LINE = /^[ \t]*$/;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  source: { flag: "--source", required: true },
  out: { flag: "--out", required: true },
  json: { flag: "--json", required: true },
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

/** Group nonblank lines into blank-line-delimited blocks. */
function blocksOf(lines) {
  const blocks = [];
  let current = null;
  for (let index = 0; index < lines.length; index++) {
    if (BLANK_LINE.test(lines[index])) {
      current = null;
      continue;
    }
    if (current === null) {
      current = { start: index, lines: [] };
      blocks.push(current);
    }
    current.lines.push(lines[index]);
  }
  return blocks;
}

/** Remove cue markup from one payload line and count what was removed. */
function stripCueMarkup(line) {
  const removedTimestamps = (line.match(INLINE_TIMESTAMP_TAG) ?? []).length;
  const withoutTimestamps = line.replace(INLINE_TIMESTAMP_TAG, "");
  const removedTags = (withoutTimestamps.match(MARKUP_TAG) ?? []).length;
  const text = withoutTimestamps.replace(MARKUP_TAG, "").replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
  return { text, removedTimestamps, removedTags };
}

/**
 * Parse transcript structure block by block.
 * A reserved block is recognized only where a block begins, so valid cue text
 * beginning with NOTE, STYLE, or REGION survives as content.
 */
function cleanTranscript(lines) {
  const counts = { removedTimestamps: 0, removedCueIds: 0, removedTags: 0, removedReservedBlocks: 0 };
  const webVtt = lines.length > 0 && SIGNATURE_LINE.test(lines[0]);
  const kept = [];

  const blocks = blocksOf(lines);
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    if (webVtt && blockIndex === 0) continue; // signature block
    if (
      webVtt
      && (COMMENT_BLOCK_LINE.test(block.lines[0]) || STYLE_BLOCK_LINE.test(block.lines[0]) || REGION_BLOCK_LINE.test(block.lines[0]))
    ) {
      counts.removedReservedBlocks++;
      continue;
    }

    let payloadStart = 0;
    if (TIMING_LINE.test(block.lines[0])) {
      payloadStart = 1;
      counts.removedTimestamps++;
    } else if (
      block.lines.length > 1
      && TIMING_LINE.test(block.lines[1])
      && (webVtt || CUE_NUMBER_LINE.test(block.lines[0]))
    ) {
      payloadStart = 2;
      counts.removedCueIds++;
      counts.removedTimestamps++;
    }

    const payload = [];
    for (let index = payloadStart; index < block.lines.length; index++) {
      const cleaned = stripCueMarkup(block.lines[index]);
      counts.removedTimestamps += cleaned.removedTimestamps;
      counts.removedTags += cleaned.removedTags;
      if (BLANK_LINE.test(cleaned.text)) continue;
      payload.push({ sourceLine: block.start + index + 1, text: cleaned.text });
    }
    if (payload.length === 0) continue;
    // Separate retained blocks with the blank source line that delimited them.
    if (kept.length > 0 && block.start > 0) kept.push({ sourceLine: block.start, text: "" });
    kept.push(...payload);
  }
  return { kept, counts };
}

/** Retain notes and draft text unchanged apart from newline normalization. */
function cleanProse(lines) {
  return {
    kept: lines.map((text, index) => ({ sourceLine: index + 1, text })),
    counts: { removedTimestamps: 0, removedCueIds: 0, removedTags: 0, removedReservedBlocks: 0 },
  };
}

/** Collapse retained lines into maximal contiguous output-to-source runs. */
function buildLineMap(kept) {
  const lineMap = [];
  for (let index = 0; index < kept.length; index++) {
    const outputLine = index + 1;
    const sourceLine = kept[index].sourceLine;
    const previous = lineMap[lineMap.length - 1];
    if (previous !== undefined && previous.outputEndLine === outputLine - 1 && previous.sourceEndLine === sourceLine - 1) {
      previous.outputEndLine = outputLine;
      previous.sourceEndLine = sourceLine;
      continue;
    }
    lineMap.push({
      outputStartLine: outputLine,
      outputEndLine: outputLine,
      sourceStartLine: sourceLine,
      sourceEndLine: sourceLine,
    });
  }
  return lineMap;
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);
  const registry = readRegistry(workspaceRoot, options.sources);
  const source = selectSource(registry, options.source, PROSE_KINDS);

  const text = readSourceText(workspaceRoot, source, registry.limits.textSourceBytesPerFile);
  const lines = splitLines(text);
  const { kept, counts } = source.kind === "transcript" ? cleanTranscript(lines) : cleanProse(lines);
  const cleaned = kept.length === 0 ? "" : `${kept.map((entry) => entry.text).join("\n")}\n`;
  const cleanedBytes = Buffer.from(cleaned, "utf8");

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "cleaned output" });
  const manifestPath = toWorkspacePath(workspaceRoot, resolve(options.json), { name: "preprocess manifest" });
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    sourceId: source.id,
    sourceSha256: source.sha256,
    complete: true,
    output: {
      path: outPath,
      sizeBytes: cleanedBytes.length,
      sha256: sha256Bytes(cleanedBytes),
    },
    lineMap: buildLineMap(kept),
    counts: {
      inputLines: lines.length,
      outputLines: kept.length,
      removedTimestamps: counts.removedTimestamps,
      removedCueIds: counts.removedCueIds,
      removedTags: counts.removedTags,
      removedReservedBlocks: counts.removedReservedBlocks,
    },
  };

  const protectedPaths = protectedRegistryPaths(workspaceRoot, registry);
  const cleanedTarget = ensureContainedOutputParent(workspaceRoot, outPath, { name: "cleaned output" });
  const manifestTarget = ensureContainedOutputParent(workspaceRoot, manifestPath, { name: "preprocess manifest" });

  writeAtomicFile(cleanedTarget.path, cleanedBytes, {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [...protectedPaths, manifestTarget.path],
  });
  writeAtomicFile(manifestTarget.path, canonicalJson(manifest, { name: "preprocess.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [...protectedPaths, cleanedTarget.path],
  });
  process.stderr.write(`preprocessed ${source.id} (${source.kind}) into ${manifest.counts.outputLines} line(s)\n`);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
