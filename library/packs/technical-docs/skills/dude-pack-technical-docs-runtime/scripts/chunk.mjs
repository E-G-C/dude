#!/usr/bin/env node
// chunk.mjs — Author deterministic, provenance-rich C* or E* units for one Source.
//
// One invocation processes one registered Source, so units never mix sources.
// The prefix is derived from the Source kind: transcript, notes, and draft
// Sources produce C* units from their cleaned text, and a document Source
// produces E* units that never cross a heading boundary and carry the heading
// path that locates them.
//
// Splitting operates on Unicode code points, so a non-BMP character is never
// divided, and the overlap carried from the preceding unit is counted inside the
// unit budget rather than added on top of it.
//
// Usage:
//   node <rt>/chunk.mjs \
//     --workspace-root <dir> --sources <sources.json> \
//     --source <S-id> --start <positive-int> \
//     [--preprocess <preprocess.json>] [--headings <headings.json>] \
//     --outdir <dir>
//
// Unit files and chunks.json are built in an adjacent staged directory and
// published atomically: the destination must be absent or already byte-identical.

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  DEFAULT_LIMITS,
  RuntimeError,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  approximateTokens,
  assertClosedRecord,
  assertDenseArray,
  assertUniqueIdentities,
  assertVersion2Record,
  authorizeExistingPath,
  canonicalJson,
  compareUtf8,
  countCodePoints,
  createStagedDirectory,
  decodeUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  hashFile,
  parseCanonicalInteger,
  parseCliOptions,
  publishStagedDirectory,
  readJsonFile,
  readStableBytes,
  resolveWorkspacePath,
  sha256Bytes,
  sliceCodePoints,
  toWorkspacePath,
  validateByteCount,
  validateDigest,
  validateLimits,
  validateLine,
  validatePersistedPath,
  validateSourceId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const UNIT_KINDS = Object.freeze(["transcript", "notes", "draft", "document"]);
const CODE_POINTS_PER_TOKEN = 4;
const MANIFEST_FILE = "chunks.json";

const FRONT_MATTER_DELIMITER = /^---[ \t]*$/;
const BLANK_LINE = /^[ \t]*$/;

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  source: { flag: "--source", required: true },
  start: { flag: "--start", required: true },
  preprocess: { flag: "--preprocess" },
  headings: { flag: "--headings" },
  outdir: { flag: "--outdir", required: true },
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

/** Return an authorized existing path, or null when nothing exists there. */
function inspectExisting(workspaceRoot, workspacePath, options) {
  try {
    return authorizeExistingPath(workspaceRoot, workspacePath, options);
  } catch (error) {
    if (error instanceof RuntimeError && error.code === "missing-path") return null;
    throw error;
  }
}

/** Stable-read one upstream intake manifest bound to this exact Source. */
function readUnitInput(workspaceRoot, hostPath, source, limits, options) {
  const path = toWorkspacePath(workspaceRoot, resolve(hostPath), { name: options.name });
  const manifest = readJsonFile(resolveWorkspacePath(workspaceRoot, path, { name: options.name }), {
    name: options.name,
    maxBytes: limits.jsonBytesPerFile,
    workspaceRoot,
    workspacePath: path,
    validate: options.validate,
  });
  if (manifest.sourceId !== source.id) {
    fail("manifest-source-mismatch", `${options.name} declares ${manifest.sourceId}, not ${source.id}`, { path });
  }
  if (manifest.sourceSha256 !== source.sha256) {
    fail("manifest-source-digest-mismatch", `${options.name} was produced from different ${source.id} bytes`, { path });
  }
  if (manifest.complete !== true) fail("incomplete-manifest", `${options.name} is not complete`, { path });
  return manifest;
}

/** Validate the preprocessing manifest fields this command consumes. */
function validatePreprocessManifest(manifest) {
  assertVersion2Record(manifest, {
    name: "preprocess.json",
    required: ["sourceId", "sourceSha256", "complete", "output", "lineMap", "counts"],
  });
  validateSourceId(manifest.sourceId, { name: "preprocess.json sourceId" });
  validateDigest(manifest.sourceSha256, { name: "preprocess.json sourceSha256" });
  assertClosedRecord(manifest.output, { name: "preprocess.json output", required: ["path", "sizeBytes", "sha256"] });
  validatePersistedPath(manifest.output.path, { name: "preprocess.json output.path" });
  validateByteCount(manifest.output.sizeBytes, { name: "preprocess.json output.sizeBytes" });
  validateDigest(manifest.output.sha256, { name: "preprocess.json output.sha256" });
  assertDenseArray(manifest.lineMap, { name: "preprocess.json lineMap" });

  let expectedOutputLine = 1;
  for (const entry of manifest.lineMap) {
    assertClosedRecord(entry, {
      name: "preprocess.json lineMap entry",
      required: ["outputStartLine", "outputEndLine", "sourceStartLine", "sourceEndLine"],
    });
    for (const field of ["outputStartLine", "outputEndLine", "sourceStartLine", "sourceEndLine"]) {
      validateLine(entry[field], { name: `preprocess.json lineMap ${field}` });
    }
    if (entry.outputStartLine !== expectedOutputLine || entry.outputEndLine < entry.outputStartLine) {
      fail("invalid-line-map", "preprocess.json lineMap must be ordered and non-overlapping");
    }
    if (entry.sourceEndLine - entry.sourceStartLine !== entry.outputEndLine - entry.outputStartLine) {
      fail("invalid-line-map", "preprocess.json lineMap runs must map one output line to one source line");
    }
    expectedOutputLine = entry.outputEndLine + 1;
  }
  return manifest;
}

/** Validate the heading manifest fields this command consumes. */
function validateHeadingManifest(manifest) {
  assertVersion2Record(manifest, {
    name: "headings.json",
    required: ["sourceId", "sourceSha256", "complete", "headings"],
  });
  validateSourceId(manifest.sourceId, { name: "headings.json sourceId" });
  validateDigest(manifest.sourceSha256, { name: "headings.json sourceSha256" });
  assertDenseArray(manifest.headings, { name: "headings.json headings" });

  let previousStartLine = 0;
  for (const heading of manifest.headings) {
    assertClosedRecord(heading, {
      name: "headings.json heading",
      required: ["level", "text", "path", "startLine", "endLine"],
    });
    if (!Number.isSafeInteger(heading.level) || heading.level < 1 || heading.level > 6) {
      fail("invalid-heading-level", "headings.json level must be 1 through 6");
    }
    for (const field of ["text", "path"]) {
      if (typeof heading[field] !== "string" || heading[field].trim().length === 0) {
        fail("invalid-heading-text", `headings.json ${field} must be a nonempty string`);
      }
    }
    validateLine(heading.startLine, { name: "headings.json startLine" });
    validateLine(heading.endLine, { name: "headings.json endLine" });
    if (heading.endLine < heading.startLine || heading.startLine <= previousStartLine) {
      fail("invalid-heading-span", "headings.json headings must be ordered by increasing start line");
    }
    previousStartLine = heading.startLine;
  }
  return manifest;
}

/** Map one cleaned-text line back to its original Source line. */
function mapCleanLine(lineMap, cleanLine) {
  for (const entry of lineMap) {
    if (cleanLine >= entry.outputStartLine && cleanLine <= entry.outputEndLine) {
      return entry.sourceStartLine + (cleanLine - entry.outputStartLine);
    }
  }
  return fail("unmapped-clean-line", `cleaned line ${cleanLine} has no recorded source provenance`);
}

/** Return the first line index after a leading YAML front-matter block. */
function frontMatterEnd(lines) {
  if (lines.length === 0 || !FRONT_MATTER_DELIMITER.test(lines[0])) return 0;
  for (let index = 1; index < lines.length; index++) {
    if (FRONT_MATTER_DELIMITER.test(lines[index])) return index + 1;
  }
  return 0;
}

/** Build the section each heading owns directly, refusing unheaded content. */
function documentSections(headings, lines) {
  const preambleEnd = headings.length === 0 ? lines.length : headings[0].startLine - 1;
  for (let index = frontMatterEnd(lines); index < preambleEnd; index++) {
    if (!BLANK_LINE.test(lines[index])) {
      fail("unheaded-document-content", "document content before the first heading has no heading provenance", {
        line: index + 1,
      });
    }
  }

  const sections = [];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const endLine = index + 1 < headings.length ? headings[index + 1].startLine - 1 : lines.length;
    if (heading.startLine > lines.length || endLine > lines.length) {
      fail("heading-span-outside-document", "headings.json describes lines outside the registered document");
    }
    const segments = [];
    for (let line = heading.startLine; line <= endLine; line++) segments.push({ line, text: lines[line - 1] });
    while (segments.length > 0 && BLANK_LINE.test(segments[segments.length - 1].text)) segments.pop();
    sections.push({ headingPath: heading.path, segments });
  }
  return sections;
}

/** Split one line into fragments that never divide a Unicode scalar. */
function splitSegment(segment, maxCodePoints) {
  const length = countCodePoints(segment.text, { name: "unit line" });
  if (length <= maxCodePoints) return [segment];
  const fragments = [];
  for (let offset = 0; offset < length; offset += maxCodePoints) {
    fragments.push({ line: segment.line, text: sliceCodePoints(segment.text, offset, Math.min(offset + maxCodePoints, length)) });
  }
  return fragments;
}

/** Code points of joined segments, including one separator between each pair. */
function joinedCodePoints(segments) {
  let total = 0;
  for (const segment of segments) total += countCodePoints(segment.text, { name: "unit line" });
  return segments.length === 0 ? 0 : total + segments.length - 1;
}

/** Take the longest whole-segment suffix that fits inside the overlap budget. */
function overlapSuffix(segments, overlapCodePoints) {
  const suffix = [];
  let used = 0;
  for (let index = segments.length - 1; index >= 0; index--) {
    const length = countCodePoints(segments[index].text, { name: "unit line" });
    const separator = suffix.length === 0 ? 0 : 1;
    if (used + separator + length > overlapCodePoints) break;
    used += separator + length;
    suffix.unshift(segments[index]);
  }
  if (suffix.length > 0 || segments.length === 0) return suffix;
  // No whole line fits, so carry a code-point-safe tail of the last line.
  const last = segments[segments.length - 1];
  const length = countCodePoints(last.text, { name: "unit line" });
  return [{ line: last.line, text: sliceCodePoints(last.text, length - overlapCodePoints, length) }];
}

/**
 * Pack one section into budgeted units.
 * Overlap is carried only from the immediately preceding unit of the same
 * section, so an E* unit never borrows text across a heading boundary.
 */
function packSection(section, budget, allocate) {
  const fragments = [];
  for (const segment of section.segments) {
    for (const fragment of splitSegment(segment, budget.maxSegmentCodePoints)) fragments.push(fragment);
  }

  const units = [];
  let current = null;
  const startUnit = () => {
    const previous = units.length === 0 ? null : units[units.length - 1];
    const overlap = previous === null || budget.overlapCodePoints === 0
      ? []
      : overlapSuffix(previous.segments, budget.overlapCodePoints);
    current = {
      segments: [...overlap],
      contentSegments: 0,
      codePoints: joinedCodePoints(overlap),
      overlapFrom: overlap.length === 0 ? null : previous.id,
    };
  };
  const flushUnit = () => {
    if (current === null) return;
    units.push(allocate(section, current));
    current = null;
  };

  for (const fragment of fragments) {
    if (current === null) startUnit();
    const length = countCodePoints(fragment.text, { name: "unit line" });
    if (current.contentSegments > 0 && current.codePoints + 1 + length > budget.unitCodePoints) {
      flushUnit();
      startUnit();
    }
    const separator = current.segments.length === 0 ? 0 : 1;
    if (current.codePoints + separator + length > budget.unitCodePoints) {
      fail("unit-budget-exceeded", "a unit line does not fit inside the configured unit budget");
    }
    current.segments.push(fragment);
    current.contentSegments++;
    current.codePoints += separator + length;
  }
  flushUnit();
  return units;
}

/** Report whether a published directory already holds exactly the staged bytes. */
function directoriesMatch(staged, target, maxBytes) {
  try {
    const stagedNames = readdirSync(staged).sort(compareUtf8);
    const targetNames = readdirSync(target).sort(compareUtf8);
    if (stagedNames.length !== targetNames.length) return false;
    for (let index = 0; index < stagedNames.length; index++) {
      if (stagedNames[index] !== targetNames[index]) return false;
    }
    for (const name of stagedNames) {
      const left = hashFile(join(staged, name), { maxBytes });
      const right = hashFile(join(target, name), { maxBytes });
      if (left.bytes !== right.bytes || left.sha256 !== right.sha256) return false;
    }
    return true;
  } catch (error) {
    if (error instanceof RuntimeError) return false;
    throw error;
  }
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);
  const registry = readRegistry(workspaceRoot, options.sources);
  const source = selectSource(registry, options.source, UNIT_KINDS);
  const startOrdinal = parseCanonicalInteger(options.start, { name: "--start", min: 1 });
  const limits = registry.limits;
  const prefix = source.kind === "document" ? "E" : "C";

  if (prefix === "C" && (options.preprocess === undefined || options.headings !== undefined)) {
    fail("invalid-unit-input", `${source.kind} Source ${source.id} requires --preprocess and forbids --headings`);
  }
  if (prefix === "E" && (options.headings === undefined || options.preprocess !== undefined)) {
    fail("invalid-unit-input", `document Source ${source.id} requires --headings and forbids --preprocess`);
  }

  let sections;
  let lineMap = null;
  if (prefix === "C") {
    const manifest = readUnitInput(workspaceRoot, options.preprocess, source, limits, {
      name: "preprocess.json",
      validate: validatePreprocessManifest,
    });
    const cleanPath = manifest.output.path;
    const cleanBytes = readStableBytes(resolveWorkspacePath(workspaceRoot, cleanPath, { name: "cleaned text" }), {
      maxBytes: limits.textSourceBytesPerFile,
      exactBytes: manifest.output.sizeBytes,
      workspaceRoot,
      workspacePath: cleanPath,
    });
    if (sha256Bytes(cleanBytes) !== manifest.output.sha256) {
      fail("clean-text-digest-mismatch", "cleaned text no longer matches its preprocessing manifest", { path: cleanPath });
    }
    const cleanLines = splitLines(decodeUtf8(cleanBytes, { path: cleanPath }));
    const mapped = manifest.lineMap.length === 0 ? 0 : manifest.lineMap[manifest.lineMap.length - 1].outputEndLine;
    if (mapped !== cleanLines.length) {
      fail("invalid-line-map", "preprocess.json lineMap does not cover the cleaned text", { path: cleanPath });
    }
    lineMap = manifest.lineMap;
    sections = [{
      headingPath: null,
      segments: cleanLines.map((text, index) => ({ line: index + 1, text })),
    }];
  } else {
    const manifest = readUnitInput(workspaceRoot, options.headings, source, limits, {
      name: "headings.json",
      validate: validateHeadingManifest,
    });
    sections = documentSections(manifest.headings, splitLines(readSourceText(workspaceRoot, source, limits.documentBytes)));
  }

  const outdirPath = toWorkspacePath(workspaceRoot, resolve(options.outdir), { name: "unit output directory" });
  // The unit file carries one terminal newline, so reserve it inside the budget.
  const budget = {
    unitCodePoints: limits.unitApproximateTokens * CODE_POINTS_PER_TOKEN - 1,
    overlapCodePoints: limits.unitOverlapApproximateTokens * CODE_POINTS_PER_TOKEN,
  };
  budget.maxSegmentCodePoints = budget.unitCodePoints - budget.overlapCodePoints - 1;

  let ordinal = startOrdinal;
  const units = [];
  const allocate = (section, unit) => {
    const id = `${prefix}${String(ordinal).padStart(3, "0")}`;
    ordinal++;
    const text = `${unit.segments.map((segment) => segment.text).join("\n")}\n`;
    const bytes = Buffer.from(text, "utf8");
    const cleanRange = {
      startLine: unit.segments[0].line,
      endLine: unit.segments[unit.segments.length - 1].line,
    };
    const sourceRange = lineMap === null
      ? { startLine: cleanRange.startLine, endLine: cleanRange.endLine }
      : { startLine: mapCleanLine(lineMap, cleanRange.startLine), endLine: mapCleanLine(lineMap, cleanRange.endLine) };
    const locator = `#L${sourceRange.startLine}-L${sourceRange.endLine}`;
    const record = {
      id,
      file: validatePersistedPath(`${outdirPath}/${id}.txt`, { name: "unit file" }),
      sizeBytes: bytes.length,
      sha256: sha256Bytes(bytes),
      codePoints: countCodePoints(text, { name: "unit text" }),
      approximateTokens: approximateTokens(text),
      cleanRange,
      sourceRange,
      sourceRef: section.headingPath === null
        ? `${source.ref}${locator}`
        : `${source.ref}:${section.headingPath}${locator}`,
      ...(section.headingPath === null ? {} : { headingPath: section.headingPath }),
      ...(unit.overlapFrom === null ? {} : { overlapFrom: unit.overlapFrom }),
    };
    if (record.approximateTokens > limits.unitApproximateTokens) {
      fail("unit-budget-exceeded", `${id} exceeds the configured unit budget including overlap`);
    }
    units.push({ record, bytes, segments: unit.segments });
    return { id, segments: unit.segments };
  };

  for (const section of sections) packSection(section, budget, allocate);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    sourceId: source.id,
    sourceKind: source.kind,
    sourceSha256: source.sha256,
    prefix,
    startOrdinal,
    nextOrdinal: startOrdinal + units.length,
    budget: {
      approximateTokens: limits.unitApproximateTokens,
      overlapTokens: limits.unitOverlapApproximateTokens,
    },
    complete: true,
    units: units.map((unit) => unit.record),
  };
  assertUniqueIdentities(manifest.units, (unit) => unit.id, { identityName: "unit id" });

  const existingOutdir = inspectExisting(workspaceRoot, outdirPath, { name: "unit output directory", kind: "directory" });
  const outdirAbsolute = existingOutdir === null
    ? ensureContainedOutputParent(workspaceRoot, outdirPath, { name: "unit output directory" }).path
    : existingOutdir.path;
  const protectedPaths = protectedRegistryPaths(workspaceRoot, registry);
  const staged = createStagedDirectory(outdirAbsolute, { workspaceRoot });
  for (const unit of units) {
    writeAtomicFile(join(staged, `${unit.record.id}.txt`), unit.bytes, { workspaceRoot, mode: "create", protectedPaths });
  }
  writeAtomicFile(join(staged, MANIFEST_FILE), canonicalJson(manifest, { name: MANIFEST_FILE }), {
    workspaceRoot,
    mode: "create",
    protectedPaths,
  });
  publishStagedDirectory(staged, outdirAbsolute, {
    workspaceRoot,
    verifyExisting: ({ staged: stagedPath, target }) => directoriesMatch(stagedPath, target, limits.jsonBytesPerFile),
  });
  process.stderr.write(`chunked ${source.id} (${source.kind}) into ${units.length} ${prefix}* unit(s)\n`);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
