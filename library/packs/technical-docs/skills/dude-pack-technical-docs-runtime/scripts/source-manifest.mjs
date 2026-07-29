#!/usr/bin/env node
// source-manifest.mjs — Author the one authoritative schema-version-2 Source Registry.
//
// A run resolves source identity, work/output boundaries, output mode, expected
// target state, and all 17 effective limits exactly once, here. Every downstream
// CLI then reads one validated registry instead of reinterpreting raw paths.
//
// The registry persists workspaceRoot: "@root" and portable workspace-relative
// POSIX paths only, so an intact workspace can move. The invocation's canonical
// host root is reconstructed from --workspace-root and kept in memory only.
//
// Usage:
//   node <rt>/source-manifest.mjs \
//     --workspace-root <dir> --mode <create|replace|update> \
//     --workdir <dir> --output <file> \
//     [--transcript <file>]... [--notes <file>]... [--draft <file>]... \
//     [--document <file>]... [--update-document <file>] [--repo <dir>]... \
//     [--limit-<name> <value>]... --out <sources.json>
//
// Exits 0 after atomically writing the registry. Any invalid option, path,
// alias, mode, target state, bound, or empty source set exits 2 and replaces no
// declared output.

import { resolve } from "node:path";

import {
  LIMIT_DEFINITIONS,
  RuntimeError,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertDenseArray,
  assertNoPathAliases,
  authorizeExistingPath,
  canonicalJson,
  compareUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fail,
  hashFile,
  parseCliOptions,
  resolveLimits,
  toWorkspacePath,
  writeAtomicFile,
} from "./lib/runtime.mjs";

const MODES = Object.freeze(["create", "replace", "update"]);

// Fixed registry order: kind rank, then role, then the UTF-8 bytes of the path.
const KIND_RANK = Object.freeze({ transcript: 0, notes: 1, draft: 2, document: 3, repo: 4 });
const ROLE_RANK = Object.freeze({ input: 0, "update-target": 1 });

const SOURCE_FLAGS = Object.freeze([
  Object.freeze({ key: "transcript", flag: "--transcript", kind: "transcript", pathType: "file" }),
  Object.freeze({ key: "notes", flag: "--notes", kind: "notes", pathType: "file" }),
  Object.freeze({ key: "draft", flag: "--draft", kind: "draft", pathType: "file" }),
  Object.freeze({ key: "document", flag: "--document", kind: "document", pathType: "file" }),
  Object.freeze({ key: "repo", flag: "--repo", kind: "repo", pathType: "directory" }),
]);

const KIND_BYTE_LIMIT = Object.freeze({
  transcript: "textSourceBytesPerFile",
  notes: "textSourceBytesPerFile",
  draft: "textSourceBytesPerFile",
  document: "documentBytes",
});

const CLI_DEFINITIONS = Object.freeze({
  workspaceRoot: { flag: "--workspace-root", required: true },
  mode: { flag: "--mode", required: true },
  workdir: { flag: "--workdir", required: true },
  output: { flag: "--output", required: true },
  out: { flag: "--out", required: true },
  updateDocument: { flag: "--update-document" },
  ...Object.fromEntries(SOURCE_FLAGS.map((descriptor) => [descriptor.key, { flag: descriptor.flag, multiple: true }])),
  ...Object.fromEntries(Object.entries(LIMIT_DEFINITIONS).map(([name, definition]) => [name, { flag: definition.flag }])),
});

/** Return an authorized existing path, or null when nothing exists there. */
function inspectExisting(workspaceRoot, workspacePath, options) {
  try {
    return authorizeExistingPath(workspaceRoot, workspacePath, options);
  } catch (error) {
    if (error instanceof RuntimeError && error.code === "missing-path") return null;
    throw error;
  }
}

/** Collect every declared source with its kind, role, and host path. */
function declareSources(options) {
  const declared = [];
  for (const descriptor of SOURCE_FLAGS) {
    for (const hostPath of options[descriptor.key] ?? []) {
      declared.push({ kind: descriptor.kind, role: "input", pathType: descriptor.pathType, hostPath });
    }
  }
  if (options.updateDocument !== undefined) {
    declared.push({ kind: "document", role: "update-target", pathType: "file", hostPath: options.updateDocument });
  }
  return declared;
}

/** Resolve one declared source to a contained, canonical, correctly typed path. */
function registerSource(workspaceRoot, declared) {
  const name = `${declared.kind} source`;
  const allowRoot = declared.kind === "repo";
  const path = toWorkspacePath(workspaceRoot, resolve(declared.hostPath), { name, allowRoot });
  const authorized = authorizeExistingPath(workspaceRoot, path, { name, kind: declared.pathType, allowRoot });
  return { ...declared, path, absolutePath: authorized.path };
}

/** Order sources canonically and assign deterministic S* identities. */
function assignSourceIds(sources) {
  const ordered = [...sources].sort((left, right) => (
    KIND_RANK[left.kind] - KIND_RANK[right.kind]
    || ROLE_RANK[left.role] - ROLE_RANK[right.role]
    || compareUtf8(left.path, right.path)
  ));
  return ordered.map((source, index) => ({ ...source, id: `S${String(index + 1).padStart(3, "0")}` }));
}

/** Capture the portable expected output state for the declared source mode. */
function resolveOutputAuthorization(workspaceRoot, mode, outputPath, sources, limits) {
  if (mode === "create") {
    const existing = inspectExisting(workspaceRoot, outputPath, { name: "output", kind: "file" });
    if (existing !== null) {
      fail("output-exists", "create mode requires the output to be absent at registration", { path: existing.path });
    }
    return { updateSourceId: null, expectedTarget: { state: "absent", bytes: null, sha256: null } };
  }

  if (mode === "replace") {
    const authorized = authorizeExistingPath(workspaceRoot, outputPath, { name: "output", kind: "file" });
    const { bytes, sha256 } = hashFile(authorized.path, {
      maxBytes: limits.documentBytes,
      name: "output",
      workspaceRoot,
      workspacePath: outputPath,
    });
    return { updateSourceId: null, expectedTarget: { state: "file", bytes, sha256 } };
  }

  const updateTarget = sources.find((source) => source.role === "update-target");
  if (updateTarget.path !== outputPath) {
    fail("update-target-mismatch", "--output and --update-document must normalize to the same workspace path", {
      path: outputPath,
    });
  }
  return {
    updateSourceId: updateTarget.id,
    expectedTarget: { state: "file", bytes: updateTarget.sizeBytes, sha256: updateTarget.sha256 },
  };
}

function run(argv) {
  const options = parseCliOptions(argv, CLI_DEFINITIONS);
  const mode = options.mode;
  if (!MODES.includes(mode)) fail("invalid-mode", `--mode must be one of ${MODES.join(", ")}`);
  if (mode !== "update" && options.updateDocument !== undefined) {
    fail("forbidden-option", `--update-document is forbidden for source mode ${mode}`);
  }
  if (mode === "update" && options.updateDocument === undefined) {
    fail("missing-option", "required option --update-document was not supplied for source mode update");
  }

  const limits = resolveLimits(Object.fromEntries(
    Object.keys(LIMIT_DEFINITIONS)
      .filter((name) => options[name] !== undefined)
      .map((name) => [name, options[name]])
  ));
  const workspaceRoot = acquireWorkspaceRoot(options.workspaceRoot);

  const declared = declareSources(options);
  assertDenseArray(declared, { name: "declared sources", minLength: 1, maxLength: limits.sourcesPerRun });

  const workdirPath = toWorkspacePath(workspaceRoot, resolve(options.workdir), { name: "work directory" });
  const outputPath = toWorkspacePath(workspaceRoot, resolve(options.output), { name: "output" });
  const registryPath = toWorkspacePath(workspaceRoot, resolve(options.out), { name: "registry output" });
  const workdirAbsolute = inspectExisting(workspaceRoot, workdirPath, { name: "work directory", kind: "directory" })?.path
    ?? resolve(workspaceRoot, ...workdirPath.split("/"));

  const registered = declared.map((source) => registerSource(workspaceRoot, source));
  const aliasCandidates = [
    ...registered.map((source) => source.absolutePath),
    workdirAbsolute,
    resolve(workspaceRoot, ...registryPath.split("/")),
  ];
  // Update mode authorizes exactly one source/output alias: the update target,
  // which is already covered by its own source entry.
  if (mode !== "update") aliasCandidates.push(resolve(workspaceRoot, ...outputPath.split("/")));
  assertNoPathAliases(aliasCandidates, { name: "registered paths" });

  const hashed = registered.map((source) => {
    if (source.pathType !== "file") return source;
    const { bytes, sha256 } = hashFile(source.absolutePath, {
      maxBytes: limits[KIND_BYTE_LIMIT[source.kind]],
      name: `${source.kind} source`,
      workspaceRoot,
      workspacePath: source.path,
    });
    return { ...source, sizeBytes: bytes, sha256 };
  });

  const sources = assignSourceIds(hashed);
  const authorization = resolveOutputAuthorization(workspaceRoot, mode, outputPath, sources, limits);

  const registry = {
    schemaVersion: SCHEMA_VERSION,
    workspaceRoot: "@root",
    workdir: workdirPath,
    output: {
      path: outputPath,
      mode,
      updateSourceId: authorization.updateSourceId,
      expectedTarget: authorization.expectedTarget,
    },
    limits,
    sources: sources.map((source) => (source.pathType === "file"
      ? {
        id: source.id,
        kind: source.kind,
        role: source.role,
        ref: source.path,
        path: source.path,
        pathType: source.pathType,
        sizeBytes: source.sizeBytes,
        sha256: source.sha256,
      }
      : {
        id: source.id,
        kind: source.kind,
        role: source.role,
        ref: source.path,
        path: source.path,
        pathType: source.pathType,
      })),
  };

  const target = ensureContainedOutputParent(workspaceRoot, registryPath, { name: "registry output" });
  writeAtomicFile(target.path, canonicalJson(registry, { name: "sources.json" }), {
    workspaceRoot,
    mode: "replace",
    protectedPaths: [...registered.map((source) => source.absolutePath), resolve(workspaceRoot, ...outputPath.split("/"))],
  });
  process.stderr.write(`registered ${registry.sources.length} source(s) in ${registryPath}\n`);
}

try {
  run(process.argv.slice(2));
} catch (error) {
  const diagnostic = errorDiagnostic(error);
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  process.exitCode = exitCodeForError(error);
}
