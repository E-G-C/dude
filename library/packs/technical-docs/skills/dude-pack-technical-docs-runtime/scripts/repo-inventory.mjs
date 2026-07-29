#!/usr/bin/env node
// repo-inventory.mjs — Complete, bounded, read-only accounting of one repository Source.
//
// A repository is a first-class source kind, but the extractor cannot read a whole tree
// into one prompt. This command walks one registered repository exactly once and authors
// a schema-version-2 Repository Inventory: one accounting entry for every encountered
// descendant path, admitted-file hashes, and deterministic R* work units whose members
// are non-overlapping file slices in normalized path and line order.
//
// It never follows a symlink for traversal or content reads, never re-ingests the work
// directory or declared output, never derives an entry point from manifest content, and
// never omits an encountered path. A rejected path, unreadable entry, changed-during-read
// file, or exhausted bound produces complete:false and exit 1 instead of a quietly
// partial inventory.
//
// Usage:
//   node <rt>/repo-inventory.mjs \
//     --workspace-root <dir> --sources <sources.json> \
//     --source <S-id> --start <positive-int> --out <inventory.json>
//
// Exits 0 for a complete inventory, 1 for a persisted incomplete inventory, and 2 for an
// invalid invocation, registry, source, root, or path detected before traversal.

import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  DEFAULT_LIMITS,
  EXIT_CODES,
  LIMIT_DEFINITIONS,
  RuntimeError,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertVersion2Record,
  authorizeExistingPath,
  canonicalJson,
  compareUtf8,
  countCodePoints,
  decodeUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  parseCanonicalInteger,
  parseCliOptions,
  readJsonFile,
  readStableBytes,
  resolveWorkspacePath,
  sha256Bytes,
  toWorkspacePath,
  validateDigest,
  validateLimits,
  validateSourceId,
  validateUnitId,
  validateWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

// Directories that never carry primary source. Dot-directories are skipped separately,
// which already covers .git, .next, .venv, and a conventional dot work directory.
const SKIP_DIRECTORY_NAMES = new Set([
  "node_modules", "dist", "build", "out", "coverage",
  "__pycache__", "target", "vendor",
]);

// Ordinary text/source extensions. Anything else becomes an explicit accounted skip
// rather than a silent omission, so no encountered file can disappear.
const TEXT_EXTENSIONS = new Set([
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "mts", "cts", "py", "rb", "go", "rs", "php",
  "pl", "pm", "java", "kt", "kts", "scala", "clj", "cs", "fs", "vb", "c", "h", "cc",
  "cpp", "cxx", "hpp", "hh", "m", "mm", "swift", "dart", "lua", "r", "jl", "ex", "exs",
  "erl", "hs", "sh", "bash", "zsh", "ps1", "bat", "cmd", "html", "htm", "css", "scss",
  "sass", "less", "vue", "svelte", "astro", "sql", "prisma", "graphql", "gql", "proto",
  "md", "mdx", "rst", "txt", "adoc", "json", "jsonc", "yaml", "yml", "toml", "ini",
  "cfg", "conf", "properties", "xml", "csproj", "fsproj", "vbproj", "gradle", "tf",
  "tfvars", "env", "example", "mk", "cmake",
]);

// Extensionless or dot-prefixed files that are ordinary text by convention.
const TEXT_FILENAMES = new Set([
  "makefile", "dockerfile", "gemfile", "rakefile", "procfile", "codeowners", "justfile",
  "notice", "authors", "contributing", "changelog",
  ".gitignore", ".gitattributes", ".editorconfig", ".npmrc", ".nvmrc", ".node-version",
  ".prettierrc", ".prettierignore", ".eslintrc", ".eslintignore", ".babelrc",
  ".dockerignore", ".env.example", ".tool-versions", ".python-version", ".ruby-version",
]);

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  sources: { flag: "--sources", required: true },
  source: { flag: "--source", required: true },
  start: {
    flag: "--start",
    required: true,
    parse: (raw) => parseCanonicalInteger(raw, {
      name: "--start",
      min: 1,
      max: LIMIT_DEFINITIONS.sourceWorkUnits.max,
    }),
  },
  out: { flag: "--out", required: true },
});

/** Report whether a candidate path stays beneath a canonical root. */
function isContained(root, candidate) {
  const difference = relative(root, candidate);
  return difference === "" || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

/** Report whether a filename is an ordinary text/source candidate. */
function isTextCandidate(name) {
  const lower = name.toLowerCase();
  if (TEXT_FILENAMES.has(lower)) return true;
  if (/^(?:readme|license|licence)/.test(lower)) return true;
  const extension = extname(lower).replace(/^\./, "");
  return extension !== "" && TEXT_EXTENSIONS.has(extension);
}

/** Validate the persisted Source Registry shape this command depends on. */
function validateRegistry(value) {
  const registry = assertVersion2Record(value, {
    name: "sources.json",
    required: ["workspaceRoot", "workdir", "output", "limits", "sources"],
  });
  if (registry.workspaceRoot !== "@root") {
    fail("invalid-registry-root", 'sources.json must persist workspaceRoot "@root"');
  }
  validateWorkspacePath(registry.workdir, { name: "sources.json workdir" });
  assertClosedRecord(registry.output, {
    name: "sources.json output",
    required: ["path", "mode", "updateSourceId", "expectedTarget"],
  });
  validateWorkspacePath(registry.output.path, { name: "sources.json output path" });
  validateLimits(registry.limits);
  assertDenseArray(registry.sources, { name: "sources.json sources", minLength: 1 });
  for (const source of registry.sources) {
    assertClosedRecord(source, {
      name: "sources.json source",
      required: ["id", "kind", "role", "ref", "path", "pathType"],
      optional: ["sizeBytes", "sha256"],
    });
    validateSourceId(source.id, { name: "sources.json source id" });
    validateWorkspacePath(source.path, { name: "sources.json source path", allowRoot: true });
    if (source.ref !== source.path) fail("invalid-source-ref", "every source ref must equal its path");
  }
  return registry;
}

/** Map a bounded-read failure to a deterministic accounting reason. */
function reasonForReadError(error) {
  if (!(error instanceof RuntimeError)) return "unreadable-file";
  switch (error.code) {
    case "file-byte-limit": return "admitted-file-byte-limit";
    case "changed-before-read":
    case "changed-during-read":
    case "unexpected-byte-count": return "changed-during-read";
    case "invalid-utf8":
    case "utf8-bom": return "invalid-utf8";
    case "missing-file":
    case "missing-path": return "missing-file";
    case "not-regular-file":
    case "symlink-path":
    case "symlink-component": return "not-regular-file";
    default: return "unreadable-file";
  }
}

/**
 * Walk one repository once, recording exactly one disposition for every encountered
 * descendant path. Symlinks are never followed: a proven contained target is an
 * accounted skip and every other target is a rejection.
 */
function traverseRepository(context) {
  const { workspaceRoot, rootAbsolute, rootReal, limits, exclusions } = context;
  const accounting = [];
  const candidates = [];
  const limitHits = new Set();
  let admittedFileCount = 0;
  let candidateBytes = 0;
  let aborted = false;

  const record = (entry) => {
    accounting.push(entry);
    return entry;
  };

  const stack = [{ absolutePath: rootAbsolute, depth: 0, entry: null }];
  while (stack.length > 0 && !aborted) {
    const frame = stack.pop();
    let dirents;
    try {
      dirents = readdirSync(frame.absolutePath, { withFileTypes: true });
    } catch (error) {
      if (frame.entry === null) {
        fail("unreadable-repository-root", `cannot read repository root: ${error.message}`, {
          path: context.rootPath,
          cause: error,
        });
      }
      frame.entry.disposition = "rejected";
      frame.entry.reason = "unreadable-directory";
      continue;
    }
    if (dirents.length > limits.repositoryChildrenPerDirectory) {
      limitHits.add("repositoryChildrenPerDirectory");
      if (frame.entry === null) break;
      frame.entry.disposition = "rejected";
      frame.entry.reason = "children-per-directory-limit";
      continue;
    }

    const children = [];
    for (const name of dirents.map((dirent) => dirent.name).sort(compareUtf8)) {
      if (accounting.length >= limits.repositoryEncounteredEntries) {
        limitHits.add("repositoryEncounteredEntries");
        aborted = true;
        break;
      }
      const absolutePath = join(frame.absolutePath, name);
      const path = toWorkspacePath(workspaceRoot, absolutePath, { name: "repository entry" });
      let stat;
      try {
        stat = lstatSync(absolutePath);
      } catch {
        record({ path, pathType: "other", disposition: "rejected", reason: "unreadable-path" });
        continue;
      }
      const pathType = stat.isSymbolicLink()
        ? "symlink"
        : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
      const excluded = exclusions.get(path);
      if (excluded !== undefined) {
        record({ path, pathType, disposition: "skipped", reason: excluded });
        continue;
      }

      if (pathType === "symlink") {
        let target;
        try {
          target = realpathSync.native(absolutePath);
        } catch {
          record({ path, pathType, disposition: "rejected", reason: "unresolvable-symlink" });
          continue;
        }
        const contained = isContained(rootReal, target) && isContained(workspaceRoot, target);
        record({
          path,
          pathType,
          disposition: contained ? "skipped" : "rejected",
          reason: contained ? "contained-symlink" : "escaping-symlink",
        });
        continue;
      }

      if (pathType === "directory") {
        if (name.startsWith(".")) {
          record({ path, pathType, disposition: "skipped", reason: "dot-directory" });
          continue;
        }
        if (SKIP_DIRECTORY_NAMES.has(name)) {
          record({ path, pathType, disposition: "skipped", reason: "ignored-directory" });
          continue;
        }
        if (frame.depth + 1 > limits.repositoryTraversalDepth) {
          limitHits.add("repositoryTraversalDepth");
          record({ path, pathType, disposition: "rejected", reason: "traversal-depth-limit" });
          continue;
        }
        children.push({ absolutePath, depth: frame.depth + 1, entry: record({ path, pathType, disposition: "admitted" }) });
        continue;
      }

      if (pathType !== "file") {
        record({ path, pathType, disposition: "skipped", reason: "unsupported-path-type" });
        continue;
      }
      if (!isTextCandidate(name)) {
        record({ path, pathType, disposition: "skipped", reason: "non-text-file" });
        continue;
      }
      const sizeBytes = Number(stat.size);
      if (sizeBytes === 0) {
        record({ path, pathType, disposition: "skipped", reason: "empty-file" });
        continue;
      }
      if (sizeBytes > limits.repositoryBytesPerAdmittedFile) {
        limitHits.add("repositoryBytesPerAdmittedFile");
        record({ path, pathType, disposition: "rejected", reason: "admitted-file-byte-limit" });
        continue;
      }
      if (admittedFileCount + 1 > limits.repositoryAdmittedFiles) {
        limitHits.add("repositoryAdmittedFiles");
        record({ path, pathType, disposition: "rejected", reason: "admitted-file-limit" });
        aborted = true;
        break;
      }
      if (candidateBytes + sizeBytes > limits.repositoryCandidateBytes) {
        limitHits.add("repositoryCandidateBytes");
        record({ path, pathType, disposition: "rejected", reason: "candidate-byte-limit" });
        aborted = true;
        break;
      }
      admittedFileCount++;
      candidateBytes += sizeBytes;
      candidates.push(record({ path, pathType, disposition: "admitted", sizeBytes, absolutePath }));
    }

    for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
  }

  accounting.sort((left, right) => compareUtf8(left.path, right.path));
  candidates.sort((left, right) => compareUtf8(left.path, right.path));
  return { accounting, candidates, limitHits };
}

/**
 * Hash every admitted candidate and record its per-line code-point profile. A file with a
 * line larger than one whole unit becomes an accounted `oversized-line` skip.
 */
function readCandidates(candidates, context) {
  const maxCodePoints = context.limits.unitApproximateTokens * 4;
  for (const entry of candidates) {
    try {
      const bytes = readStableBytes(entry.absolutePath, {
        maxBytes: context.limits.repositoryBytesPerAdmittedFile,
        exactBytes: entry.sizeBytes,
        workspaceRoot: context.workspaceRoot,
        workspacePath: entry.path,
        name: "repository file",
      });
      const text = decodeUtf8(bytes, { path: entry.path });
      const lines = text.split("\n");
      if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
      // Every line contributes its own code points plus one separator, so unit budgets
      // stay additive and independent of a file's terminal newline.
      entry.lineCodePoints = lines.map((line) => countCodePoints(line, { name: "repository line" }) + 1);
      if (entry.lineCodePoints.some((codePoints) => codePoints > maxCodePoints)) {
        // A line-granular member cannot express a sub-line slice, so splitting such a line
        // would emit duplicate member slices, unit digests, and locators.
        entry.disposition = "skipped";
        entry.reason = "oversized-line";
        delete entry.sizeBytes;
        continue;
      }
      entry.sha256 = sha256Bytes(bytes);
    } catch (error) {
      entry.disposition = "rejected";
      entry.reason = reasonForReadError(error);
      delete entry.sizeBytes;
    }
  }
  return candidates.filter((entry) => entry.disposition === "admitted");
}

/**
 * Pack admitted files into deterministic R* units. Files are consumed in normalized path
 * order and line order; adjacent slices share a unit while the budget allows and a large
 * file splits at line boundaries. Every admitted line fits one unit because a file with an
 * oversized line is skipped while reading candidates.
 */
function allocateWorkUnits(admitted, limits, startOrdinal, rootRef) {
  const maxCodePoints = limits.unitApproximateTokens * 4;
  const units = [];
  let current = null;

  const flush = () => {
    if (current !== null) units.push(current);
    current = null;
  };
  const reference = (entry, startLine, endLine) => `${rootRef}:${entry.repoPath}#L${startLine}-L${endLine}`;
  const member = (entry, line) => ({
    path: entry.path,
    startLine: line,
    endLine: line,
    sizeBytes: entry.sizeBytes,
    sha256: entry.sha256,
    sourceRef: reference(entry, line, line),
  });

  for (const entry of admitted) {
    for (let line = 1; line <= entry.lineCodePoints.length; line++) {
      const lineCodePoints = entry.lineCodePoints[line - 1];
      if (current !== null && current.codePoints + lineCodePoints > maxCodePoints) flush();
      if (current === null) current = { codePoints: 0, members: [] };
      const last = current.members[current.members.length - 1];
      if (last !== undefined && last.path === entry.path && last.endLine === line - 1) {
        last.endLine = line;
        last.sourceRef = reference(entry, last.startLine, line);
      } else {
        current.members.push(member(entry, line));
      }
      current.codePoints += lineCodePoints;
    }
  }
  flush();

  return units.map((unit, index) => {
    const id = `R${String(startOrdinal + index).padStart(3, "0")}`;
    validateUnitId(id, { name: "repository unit id" });
    const members = unit.members.map((slice) => ({
      path: slice.path,
      startLine: slice.startLine,
      endLine: slice.endLine,
      sizeBytes: slice.sizeBytes,
      sha256: slice.sha256,
      sourceRef: slice.sourceRef,
    }));
    return {
      id,
      approximateTokens: Math.ceil(unit.codePoints / 4),
      digest: sha256Bytes(canonicalJson(members, { name: "repository unit members" })),
      members,
      codePoints: unit.codePoints,
    };
  });
}

/** Prove that every admitted file is represented exactly once by the allocated units. */
function reconcileAllocation(admitted, units) {
  const unitIdsByPath = new Map();
  for (const unit of units) {
    for (const slice of unit.members) {
      const unitIds = unitIdsByPath.get(slice.path) ?? [];
      if (unitIds[unitIds.length - 1] !== unit.id) unitIds.push(unit.id);
      unitIdsByPath.set(slice.path, unitIds);
    }
  }
  for (const entry of admitted) {
    const unitIds = unitIdsByPath.get(entry.path);
    if (unitIds === undefined || unitIds.length === 0) {
      fail("allocation-mismatch", `admitted file is not represented by any work unit: ${entry.path}`, { path: entry.path });
    }
    entry.unitIds = unitIds;
  }
  const admittedCodePoints = admitted.reduce(
    (total, entry) => total + entry.lineCodePoints.reduce((sum, value) => sum + value, 0),
    0
  );
  const allocatedCodePoints = units.reduce((total, unit) => total + unit.codePoints, 0);
  if (admittedCodePoints !== allocatedCodePoints) {
    fail("allocation-mismatch", "allocated work-unit content does not reconcile with admitted file content");
  }
}

/** Derive reconciled traversal totals from the final accounting entries. */
function deriveTotals(accounting) {
  const totals = {
    encountered: accounting.length,
    admitted: 0,
    skipped: 0,
    rejected: 0,
    files: 0,
    directories: 0,
    symlinks: 0,
    candidateBytes: 0,
  };
  for (const entry of accounting) {
    totals[entry.disposition]++;
    if (entry.pathType === "file") totals.files++;
    else if (entry.pathType === "directory") totals.directories++;
    else if (entry.pathType === "symlink") totals.symlinks++;
    if (entry.disposition === "admitted" && entry.pathType === "file") totals.candidateBytes += entry.sizeBytes;
  }
  if (totals.admitted + totals.skipped + totals.rejected !== totals.encountered) {
    fail("accounting-mismatch", "every encountered path must carry exactly one disposition");
  }
  return totals;
}

/** Serialize one accounting entry in exact contract field order. */
function serializeAccountingEntry(entry) {
  const serialized = { path: entry.path, pathType: entry.pathType, disposition: entry.disposition };
  if (entry.disposition !== "admitted") serialized.reason = entry.reason;
  if (entry.disposition === "admitted" && entry.pathType === "file") {
    serialized.sizeBytes = entry.sizeBytes;
    serialized.sha256 = validateDigest(entry.sha256, { name: "admitted file digest" });
    serialized.unitIds = entry.unitIds;
  }
  return serialized;
}

/** Serialize one work unit in exact contract field order. */
function serializeWorkUnit(unit) {
  return { id: unit.id, approximateTokens: unit.approximateTokens, digest: unit.digest, members: unit.members };
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);

  const registryPath = toWorkspacePath(workspaceRoot, resolve(options.sources), { name: "source registry" });
  const registry = readJsonFile(resolveWorkspacePath(workspaceRoot, registryPath, { name: "source registry" }), {
    name: "sources.json",
    maxBytes: DEFAULT_LIMITS.jsonBytesPerFile,
    workspaceRoot,
    workspacePath: registryPath,
    validate: validateRegistry,
  });
  const limits = registry.limits;

  validateSourceId(options.source, { name: "--source" });
  const source = registry.sources.find((candidate) => candidate.id === options.source);
  if (source === undefined) fail("unknown-source", `--source ${options.source} is not registered in sources.json`);
  if (source.kind !== "repo") fail("invalid-source-kind", `--source ${options.source} is not a repository source`);

  const outPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "inventory output" });
  const rootAuthorized = authorizeExistingPath(workspaceRoot, source.path, {
    name: "repository source",
    kind: "directory",
    allowRoot: true,
  });
  // Registered work, output, registry, and inventory paths are explicitly skipped so
  // generated or prior output can never be re-ingested as repository input.
  const exclusions = new Map([
    [registry.workdir, "work-directory"],
    [registry.output.path, "output-path"],
    [registryPath, "source-registry"],
    [outPath, "inventory-output"],
  ]);
  const context = {
    workspaceRoot,
    rootAbsolute: rootAuthorized.path,
    rootReal: rootAuthorized.realPath,
    rootPath: source.path,
    limits,
    exclusions,
  };

  const { accounting, candidates, limitHits } = traverseRepository(context);
  const admitted = readCandidates(candidates, context);
  const rootPrefix = source.path === "@root" ? "" : `${source.path}/`;
  for (const entry of admitted) entry.repoPath = entry.path.slice(rootPrefix.length);

  const startOrdinal = options.start;
  let workUnits = allocateWorkUnits(admitted, limits, startOrdinal, source.ref);
  if (startOrdinal - 1 + workUnits.length > limits.sourceWorkUnits) {
    // The run-wide R* ceiling is exhausted, so no handoff may be authorized. No partial
    // allocation is persisted and every candidate becomes an accounted rejection.
    limitHits.add("sourceWorkUnits");
    workUnits = [];
    for (const entry of admitted) {
      entry.disposition = "rejected";
      entry.reason = "source-work-unit-limit";
      delete entry.sizeBytes;
    }
  } else {
    reconcileAllocation(admitted, workUnits);
  }

  const totals = deriveTotals(accounting);
  const complete = limitHits.size === 0 && totals.rejected === 0;
  const nextOrdinal = startOrdinal + workUnits.length;
  const serializedAccounting = accounting.map(serializeAccountingEntry);
  const serializedUnits = workUnits.map(serializeWorkUnit);

  const inventory = {
    schemaVersion: SCHEMA_VERSION,
    sourceId: source.id,
    rootRef: source.ref,
    startOrdinal,
    nextOrdinal,
    repositoryDigest: sha256Bytes(canonicalJson({
      rootRef: source.ref,
      startOrdinal,
      nextOrdinal,
      limits,
      accounting: serializedAccounting,
      workUnits: serializedUnits,
    }, { name: "repository digest input" })),
    limits,
    complete,
    limitHits: [...limitHits].sort(compareUtf8),
    totals,
    accounting: serializedAccounting,
    workUnits: serializedUnits,
  };

  const target = ensureContainedOutputParent(workspaceRoot, outPath, { name: "inventory output" });
  writeAtomicFile(target.path, canonicalJson(inventory, { name: "inventory.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [
      resolveWorkspacePath(workspaceRoot, registryPath, { name: "source registry" }),
      resolveWorkspacePath(workspaceRoot, registry.output.path, { name: "output" }),
    ],
  });

  process.stderr.write(
    `repo-inventory: ${outPath} ${complete ? "complete" : "incomplete"}; `
    + `${totals.encountered} encountered, ${totals.admitted} admitted, `
    + `${totals.skipped} skipped, ${totals.rejected} rejected; `
    + `${serializedUnits.length} work unit(s) in [${startOrdinal}, ${nextOrdinal})`
    + `${inventory.limitHits.length === 0 ? "" : `; limits ${inventory.limitHits.join(",")}`}\n`
  );
  if (!complete) process.exitCode = EXIT_CODES.FAILED_GATE;
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
