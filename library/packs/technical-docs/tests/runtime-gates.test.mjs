import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoAdjacentTemps,
  assertOutputPreserved,
  buildFinalizationFixture,
  canCreateHardlink,
  canCreateSymlink,
  canEnforceUnreadableFile,
  canResolveCaseInsensitivePath,
  captureOutput,
  makeTempRoot,
  readJsonFixture,
  removeFixture,
  runFinalize,
  runNode,
  runtimeScript,
  sha256,
  writeFixture,
  writeJsonFixture,
  writeJsonlFixture,
} from "./helpers/harness.mjs";

const SOURCE_MANIFEST = fileURLToPath(
  new URL("../skills/dude-pack-technical-docs-runtime/scripts/source-manifest.mjs", import.meta.url)
);
const COVERAGE = runtimeScript("coverage.mjs");
const LINT = runtimeScript("lint.mjs");

function registerSources(args) {
  return runNode(SOURCE_MANIFEST, args);
}

function assertRegistrationFailed(result, code, outputPath) {
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, new RegExp(`^${code}: `));
  assert.equal(existsSync(outputPath), false, `a failed registration wrote ${outputPath}`);
}

function readRegistry(registryPath) {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

test("source registration is deterministic and independent of declaration order", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "input.vtt", "WEBVTT\n\nhello\n");
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(root, "draft.md", "draft\n");
  writeFixture(root, "repository/index.mjs", "export default 1;\n");
  const first = join(root, ".td-work/first.json");
  const second = join(root, ".td-work/second.json");
  const base = [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
  ];

  const firstResult = registerSources([
    ...base,
    "--transcript", join(root, "input.vtt"),
    "--notes", join(root, "notes.md"),
    "--draft", join(root, "draft.md"),
    "--repo", join(root, "repository"),
    "--out", first,
  ]);
  const secondResult = registerSources([
    ...base,
    "--repo", join(root, "repository"),
    "--draft", join(root, "draft.md"),
    "--notes", join(root, "notes.md"),
    "--transcript", join(root, "input.vtt"),
    "--out", second,
  ]);

  assert.equal(firstResult.status, 0, firstResult.stderr);
  assert.equal(secondResult.status, 0, secondResult.stderr);
  assert.deepEqual(readFileSync(first), readFileSync(second), "declaration order changed the registry");

  const registry = readRegistry(first);
  assert.equal(registry.schemaVersion, 2);
  assert.equal(registry.workspaceRoot, "@root");
  assert.equal(registry.workdir, ".td-work");
  assert.deepEqual(registry.sources.map((source) => [source.id, source.kind, source.role, source.path, source.ref]), [
    ["S001", "transcript", "input", "input.vtt", "input.vtt"],
    ["S002", "notes", "input", "notes.md", "notes.md"],
    ["S003", "draft", "input", "draft.md", "draft.md"],
    ["S004", "repo", "input", "repository", "repository"],
  ]);
  assert.equal(registry.sources[0].sizeBytes, Buffer.byteLength("WEBVTT\n\nhello\n"));
  assert.equal(registry.sources[0].sha256, sha256("WEBVTT\n\nhello\n"));
  assert.equal(registry.sources[3].pathType, "directory");
  assert.equal(Object.hasOwn(registry.sources[3], "sizeBytes"), false);
  assert.equal(Object.hasOwn(registry.sources[3], "sha256"), false);
});

test("a workspace-root repository registers the reserved @root path and reference", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "index.mjs", "export default 1;\n");
  const registryPath = join(root, ".td-work/sources.json");

  const result = registerSources([
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
    "--repo", root,
    "--out", registryPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const registry = readRegistry(registryPath);
  assert.deepEqual(registry.sources, [
    { id: "S001", kind: "repo", role: "input", ref: "@root", path: "@root", pathType: "directory" },
  ]);
});

test("create mode records an absent expected target and rejects an existing output", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "notes.md", "notes\n");
  const registryPath = join(root, ".td-work/sources.json");
  const args = [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
    "--notes", join(root, "notes.md"),
    "--out", registryPath,
  ];

  const created = registerSources(args);
  assert.equal(created.status, 0, created.stderr);
  const registry = readRegistry(registryPath);
  assert.equal(registry.output.mode, "create");
  assert.equal(registry.output.updateSourceId, null);
  assert.deepEqual(registry.output.expectedTarget, { state: "absent", bytes: null, sha256: null });

  writeFixture(root, "output.md", "already published\n");
  const snapshot = captureOutput(registryPath);
  const blocked = registerSources(args);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stderr, /^output-exists: /);
  assertOutputPreserved(registryPath, snapshot);
  assertNoAdjacentTemps(registryPath);
});

test("replace mode records the exact registered bytes and digest of the existing output", (context) => {
  const root = makeTempRoot(context);
  const outputText = "# Published\n\nPrior body.\n";
  writeFixture(root, "output.md", outputText);
  writeFixture(root, "notes.md", "notes\n");
  const registryPath = join(root, ".td-work/sources.json");

  const result = registerSources([
    "--workspace-root", root,
    "--mode", "replace",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
    "--notes", join(root, "notes.md"),
    "--out", registryPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const registry = readRegistry(registryPath);
  assert.equal(registry.output.mode, "replace");
  assert.equal(registry.output.updateSourceId, null);
  assert.deepEqual(registry.output.expectedTarget, {
    state: "file",
    bytes: Buffer.byteLength(outputText),
    sha256: sha256(outputText),
  });
});

test("update mode binds the declared update target and authorizes only that source/output alias", (context) => {
  const root = makeTempRoot(context);
  const documentText = "# Title\n\nBody\n";
  writeFixture(root, "document.md", documentText);
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(root, "other.md", "other\n");
  const registryPath = join(root, ".td-work/sources.json");
  const base = [
    "--workspace-root", root,
    "--mode", "update",
    "--workdir", join(root, ".td-work"),
  ];

  const result = registerSources([
    ...base,
    "--output", join(root, "document.md"),
    "--update-document", join(root, "document.md"),
    "--notes", join(root, "notes.md"),
    "--out", registryPath,
  ]);
  assert.equal(result.status, 0, result.stderr);

  const registry = readRegistry(registryPath);
  const updateTarget = registry.sources.find((source) => source.role === "update-target");
  assert.equal(registry.output.path, "document.md");
  assert.equal(registry.output.updateSourceId, updateTarget.id);
  assert.equal(updateTarget.kind, "document");
  assert.deepEqual(registry.output.expectedTarget, {
    state: "file",
    bytes: Buffer.byteLength(documentText),
    sha256: sha256(documentText),
  });
  assert.equal(updateTarget.sha256, registry.output.expectedTarget.sha256);
  assert.equal(registry.sources.filter((source) => source.role === "update-target").length, 1);

  assertRegistrationFailed(
    registerSources([
      ...base,
      "--output", join(root, "other.md"),
      "--update-document", join(root, "document.md"),
      "--out", join(root, ".td-work/mismatch.json"),
    ]),
    "update-target-mismatch",
    join(root, ".td-work/mismatch.json")
  );

  assertRegistrationFailed(
    registerSources([
      ...base,
      "--output", join(root, "document.md"),
      "--update-document", join(root, "document.md"),
      "--document", join(root, "document.md"),
      "--out", join(root, ".td-work/duplicate.json"),
    ]),
    "path-alias",
    join(root, ".td-work/duplicate.json")
  );

  assertRegistrationFailed(
    registerSources([
      "--workspace-root", root,
      "--mode", "create",
      "--workdir", join(root, ".td-work"),
      "--output", join(root, "created.md"),
      "--update-document", join(root, "document.md"),
      "--out", join(root, ".td-work/forbidden.json"),
    ]),
    "forbidden-option",
    join(root, ".td-work/forbidden.json")
  );

  assertRegistrationFailed(
    registerSources([
      ...base,
      "--output", join(root, "document.md"),
      "--notes", join(root, "notes.md"),
      "--out", join(root, ".td-work/missing.json"),
    ]),
    "missing-option",
    join(root, ".td-work/missing.json")
  );
});

test("duplicate paths, admitted outputs, work directories, and file identities fail before registration", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(root, "output.md", "prior\n");
  mkdirSync(join(root, ".td-work"));
  const replaceBase = [
    "--workspace-root", root,
    "--mode", "replace",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
  ];

  assertRegistrationFailed(
    registerSources([
      ...replaceBase,
      "--notes", join(root, "notes.md"),
      "--notes", join(root, "notes.md"),
      "--out", join(root, ".td-work/duplicate-path.json"),
    ]),
    "path-alias",
    join(root, ".td-work/duplicate-path.json")
  );

  assertRegistrationFailed(
    registerSources([
      ...replaceBase,
      "--document", join(root, "output.md"),
      "--out", join(root, ".td-work/admitted-output.json"),
    ]),
    "path-alias",
    join(root, ".td-work/admitted-output.json")
  );

  assertRegistrationFailed(
    registerSources([
      ...replaceBase,
      "--repo", join(root, ".td-work"),
      "--out", join(root, ".td-work/admitted-workdir.json"),
    ]),
    "path-alias",
    join(root, ".td-work/admitted-workdir.json")
  );

  if (!canCreateHardlink(root)) {
    context.diagnostic("hard-link identity aliasing is unavailable on this host");
    return;
  }
  linkSync(join(root, "notes.md"), join(root, "linked-notes.md"));
  assertRegistrationFailed(
    registerSources([
      ...replaceBase,
      "--notes", join(root, "notes.md"),
      "--draft", join(root, "linked-notes.md"),
      "--out", join(root, ".td-work/duplicate-identity.json"),
    ]),
    "path-alias",
    join(root, ".td-work/duplicate-identity.json")
  );
});

test("empty, invalid, escaping, missing, and symlinked declarations fail closed", (context) => {
  const root = makeTempRoot(context);
  const outside = makeTempRoot(context, "technical-docs-outside-");
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(outside, "external.md", "external\n");
  const registryPath = join(root, ".td-work/sources.json");
  const base = [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
  ];

  const registered = registerSources([...base, "--notes", join(root, "notes.md"), "--out", registryPath]);
  assert.equal(registered.status, 0, registered.stderr);
  const snapshot = captureOutput(registryPath);

  assertRegistrationFailed(
    registerSources([...base, "--out", join(root, ".td-work/empty.json")]),
    "array-too-short",
    join(root, ".td-work/empty.json")
  );

  assertRegistrationFailed(
    registerSources([
      "--workspace-root", root,
      "--mode", "amend",
      "--workdir", join(root, ".td-work"),
      "--output", join(root, "output.md"),
      "--notes", join(root, "notes.md"),
      "--out", join(root, ".td-work/mode.json"),
    ]),
    "invalid-mode",
    join(root, ".td-work/mode.json")
  );

  assertRegistrationFailed(
    registerSources([...base, "--notes", join(outside, "external.md"), "--out", join(root, ".td-work/escape.json")]),
    "path-outside-root",
    join(root, ".td-work/escape.json")
  );

  assertRegistrationFailed(
    registerSources([...base, "--notes", join(root, "absent.md"), "--out", join(root, ".td-work/absent.json")]),
    "missing-path",
    join(root, ".td-work/absent.json")
  );

  // Every failure above targeted a fresh path; the prior registry is untouched.
  assertOutputPreserved(registryPath, snapshot);
  assertNoAdjacentTemps(registryPath);

  if (!canCreateSymlink(root)) {
    context.diagnostic("symbolic-link fixtures are unavailable on this host");
    return;
  }
  symlinkSync(join(root, "notes.md"), join(root, "linked-notes.md"), "file");
  assertRegistrationFailed(
    registerSources([...base, "--notes", join(root, "linked-notes.md"), "--out", join(root, ".td-work/symlink.json")]),
    "symlink-component",
    join(root, ".td-work/symlink.json")
  );

  symlinkSync(join(outside, "external.md"), join(root, "external-link.md"), "file");
  assertRegistrationFailed(
    registerSources([...base, "--document", join(root, "external-link.md"), "--out", join(root, ".td-work/external.json")]),
    "symlink-component",
    join(root, ".td-work/external.json")
  );
});

test("the registry is canonical, byte-identical across declaration order, and portable across registry locations", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "transcript.vtt", "WEBVTT\n\nhello\n");
  writeFixture(root, "beta.md", "beta\n");
  writeFixture(root, "alpha.md", "alpha\n");
  writeFixture(root, "repository/index.mjs", "export default 1;\n");
  const defaultOut = join(root, ".td-work/sources.json");
  const relocatedOut = join(root, "registries/nested/deep/registry.json");
  const base = [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
  ];

  const first = registerSources([
    ...base,
    "--transcript", join(root, "transcript.vtt"),
    "--notes", join(root, "beta.md"),
    "--notes", join(root, "alpha.md"),
    "--repo", join(root, "repository"),
    "--out", defaultOut,
  ]);
  const second = registerSources([
    ...base,
    "--repo", join(root, "repository"),
    "--notes", join(root, "alpha.md"),
    "--notes", join(root, "beta.md"),
    "--transcript", join(root, "transcript.vtt"),
    "--out", relocatedOut,
  ]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  // Byte comparison, not structural equivalence: reordering declarations and relocating
  // the registry must not change a single serialized byte.
  assert.deepEqual(readFileSync(defaultOut), readFileSync(relocatedOut), "registry bytes are not order- and location-independent");
  assertNoAdjacentTemps(defaultOut);
  assertNoAdjacentTemps(relocatedOut);

  const text = readFileSync(defaultOut, "utf8");
  assert.equal(readFileSync(defaultOut)[0], 0x7b, "registry must start with '{' and carry no BOM");
  assert.equal(text.includes("\r"), false, "registry must use LF endings only");
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`, "registry is not canonical two-space JSON with one terminal newline");
  assert.equal(text.includes(root), false, "registry must not serialize an absolute host path");

  const registry = JSON.parse(text);
  assert.deepEqual(Object.keys(registry), ["schemaVersion", "workspaceRoot", "workdir", "output", "limits", "sources"]);
  assert.deepEqual(Object.keys(registry.output), ["path", "mode", "updateSourceId", "expectedTarget"]);
  assert.deepEqual(Object.keys(registry.output.expectedTarget), ["state", "bytes", "sha256"]);
  assert.deepEqual(Object.keys(registry.sources[0]), ["id", "kind", "role", "ref", "path", "pathType", "sizeBytes", "sha256"]);
  assert.deepEqual(Object.keys(registry.sources.at(-1)), ["id", "kind", "role", "ref", "path", "pathType"]);
  assert.deepEqual(registry.sources.map((source) => [source.id, source.path]), [
    ["S001", "transcript.vtt"],
    ["S002", "alpha.md"],
    ["S003", "beta.md"],
    ["S004", "repository"],
  ]);
  assert.equal(Object.keys(registry.limits).length, 17);
});

test("registry order applies role rank ahead of path bytes within one kind", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "alpha.md", "# Alpha\n");
  writeFixture(root, "zeta.md", "# Zeta\n");
  const registryPath = join(root, ".td-work/sources.json");

  const result = registerSources([
    "--workspace-root", root,
    "--mode", "update",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "alpha.md"),
    "--update-document", join(root, "alpha.md"),
    "--document", join(root, "zeta.md"),
    "--out", registryPath,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const registry = readRegistry(registryPath);
  assert.deepEqual(registry.sources.map((source) => [source.id, source.role, source.path]), [
    ["S001", "input", "zeta.md"],
    ["S002", "update-target", "alpha.md"],
  ]);
  assert.equal(registry.output.updateSourceId, "S002");
});

test("the sources-per-run bound admits the exact count and rejects one more", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "a.md", "a\n");
  writeFixture(root, "b.md", "b\n");
  writeFixture(root, "c.md", "c\n");
  const atBound = join(root, ".td-work/at-bound.json");
  const overBound = join(root, ".td-work/over-bound.json");
  const base = [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
    "--limit-sources-per-run", "2",
    "--notes", join(root, "a.md"),
    "--draft", join(root, "b.md"),
  ];

  const admitted = registerSources([...base, "--out", atBound]);
  assert.equal(admitted.status, 0, admitted.stderr);
  const registry = readRegistry(atBound);
  assert.equal(registry.limits.sourcesPerRun, 2);
  assert.equal(Object.keys(registry.limits).length, 17);
  assert.equal(registry.sources.length, 2);

  assertRegistrationFailed(
    registerSources([...base, "--document", join(root, "c.md"), "--out", overBound]),
    "array-too-long",
    overBound
  );
});

test("a relocated registry rejects an escaping or unusable destination", (context) => {
  const root = makeTempRoot(context);
  const outside = makeTempRoot(context, "technical-docs-outside-");
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(root, "blocked", "not a directory\n");
  mkdirSync(join(root, "registry-directory"));
  const base = [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "output.md"),
    "--notes", join(root, "notes.md"),
  ];

  for (const [code, out] of [
    ["path-outside-root", join(outside, "sources.json")],
    // The alias check inspects the registry path before its parent is validated, so a
    // non-directory parent component is refused as an uninspectable path.
    ["path-inspection-failed", join(root, "blocked/sources.json")],
    ["unsafe-output-target", join(root, "registry-directory")],
  ]) {
    const result = registerSources([...base, "--out", out]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, new RegExp(`^${code}: `));
  }
  assert.equal(existsSync(join(outside, "sources.json")), false);
  assert.equal(readFileSync(join(root, "blocked"), "utf8"), "not a directory\n");
  assert.deepEqual(readdirSync(join(root, "registry-directory")), []);

  if (!canCreateSymlink(root)) {
    context.diagnostic("symbolic-link fixtures are unavailable on this host");
    return;
  }
  symlinkSync(outside, join(root, "linked-registry"), "dir");
  const escaping = registerSources([...base, "--out", join(root, "linked-registry/sources.json")]);
  assert.equal(escaping.status, 2, escaping.stderr);
  assert.match(escaping.stderr, /^unsafe-output-parent: /);
  assert.equal(existsSync(join(outside, "sources.json")), false);
});

test("case-variant spellings are rejected as aliases and never silently normalized", (context) => {
  const root = makeTempRoot(context);
  if (!canResolveCaseInsensitivePath(root)) {
    context.skip("the filesystem preserves case distinctions on this host");
    return;
  }
  writeFixture(root, "output.md", "prior\n");
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(root, "document.md", "# Title\n\nBody\n");

  assertRegistrationFailed(
    registerSources([
      "--workspace-root", root,
      "--mode", "replace",
      "--workdir", join(root, ".td-work"),
      "--output", join(root, "output.md"),
      "--document", join(root, "OUTPUT.MD"),
      "--out", join(root, ".td-work/output-case.json"),
    ]),
    "path-alias",
    join(root, ".td-work/output-case.json")
  );

  assertRegistrationFailed(
    registerSources([
      "--workspace-root", root,
      "--mode", "replace",
      "--workdir", join(root, ".td-work"),
      "--output", join(root, "output.md"),
      "--notes", join(root, "notes.md"),
      "--draft", join(root, "NOTES.MD"),
      "--out", join(root, ".td-work/source-case.json"),
    ]),
    "path-alias",
    join(root, ".td-work/source-case.json")
  );

  const updateBase = [
    "--workspace-root", root,
    "--mode", "update",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "document.md"),
  ];

  // Path normalization is lexical, never case-folding, so a case-variant spelling of the
  // same file is a mismatch rather than a silently accepted update target.
  assertRegistrationFailed(
    registerSources([
      ...updateBase,
      "--update-document", join(root, "DOCUMENT.MD"),
      "--out", join(root, ".td-work/update-case.json"),
    ]),
    "update-target-mismatch",
    join(root, ".td-work/update-case.json")
  );

  // The update target is the sole permitted source/output alias; a second source spelled
  // with different case still aliases it.
  assertRegistrationFailed(
    registerSources([
      ...updateBase,
      "--update-document", join(root, "document.md"),
      "--draft", join(root, "DOCUMENT.MD"),
      "--out", join(root, ".td-work/update-alias-case.json"),
    ]),
    "path-alias",
    join(root, ".td-work/update-alias-case.json")
  );
});

test("an unreadable source fails closed before any registry is written", (context) => {
  const root = makeTempRoot(context);
  if (!canEnforceUnreadableFile(root)) {
    context.skip("read permission removal is not enforceable for this process");
    return;
  }
  const notes = writeFixture(root, "notes.md", "notes\n");
  const registryPath = join(root, ".td-work/sources.json");
  chmodSync(notes, 0o000);
  try {
    assertRegistrationFailed(
      registerSources([
        "--workspace-root", root,
        "--mode", "create",
        "--workdir", join(root, ".td-work"),
        "--output", join(root, "output.md"),
        "--notes", notes,
        "--out", registryPath,
      ]),
      "file-read-failed",
      registryPath
    );
  } finally {
    chmodSync(notes, 0o600);
  }
});

test("every documented failure path fails before writing and preserves a prior registry", (context) => {
  const root = makeTempRoot(context);
  const outside = makeTempRoot(context, "technical-docs-outside-");
  const workdir = join(root, ".td-work");
  const registryPath = join(root, ".td-work/sources.json");
  const notes = writeFixture(root, "notes.md", "notes\n");
  const document = writeFixture(root, "document.md", "# Title\n\nBody\n");
  const other = writeFixture(root, "other.md", "other\n");
  const output = join(root, "output.md");
  writeFixture(root, "repository/index.mjs", "export default 1;\n");
  const repository = join(root, "repository");
  writeFixture(outside, "external.md", "external\n");

  const registered = registerSources([
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", workdir,
    "--output", output,
    "--notes", notes,
    "--out", registryPath,
  ]);
  assert.equal(registered.status, 0, registered.stderr);
  const snapshot = captureOutput(registryPath);
  assert.equal(snapshot.exists, true);

  // The output now exists, so a create-mode case that clears every earlier gate stops at
  // registration; every other case below still fails at its own earlier gate.
  writeFixture(root, "output.md", "published\n");
  const create = ["--workspace-root", root, "--mode", "create", "--workdir", workdir, "--output", output];
  const update = ["--workspace-root", root, "--mode", "update", "--workdir", workdir];

  const cases = [
    ["unknown-option", [...create, "--notes", notes, "--unknown", "value"]],
    ["duplicate-option", [...create, "--output", output, "--notes", notes]],
    ["missing-option", ["--workspace-root", root, "--workdir", workdir, "--output", output, "--notes", notes]],
    ["invalid-mode", ["--workspace-root", root, "--mode", "amend", "--workdir", workdir, "--output", output, "--notes", notes]],
    ["forbidden-option", [...create, "--notes", notes, "--update-document", document]],
    ["missing-option", [...update, "--output", document, "--notes", notes]],
    ["invalid-integer", [...create, "--notes", notes, "--limit-sources-per-run", "01"]],
    ["integer-out-of-range", [...create, "--notes", notes, "--limit-sources-per-run", "0"]],
    ["invalid-limit-relation", [
      ...create, "--notes", notes,
      "--limit-unit-overlap-approximate-tokens", "3000",
      "--limit-unit-approximate-tokens", "3000",
    ]],
    ["missing-path", ["--workspace-root", join(root, "absent-root"), "--mode", "create", "--workdir", workdir, "--output", output, "--notes", notes]],
    ["invalid-workspace-root", ["--workspace-root", notes, "--mode", "create", "--workdir", workdir, "--output", output, "--notes", notes]],
    ["array-too-short", [...create]],
    ["array-too-long", [...create, "--notes", notes, "--draft", other, "--limit-sources-per-run", "1"]],
    ["path-outside-root", [...create, "--notes", join(outside, "external.md")]],
    ["path-outside-root", ["--workspace-root", root, "--mode", "create", "--workdir", join(outside, "work"), "--output", output, "--notes", notes]],
    ["path-outside-root", ["--workspace-root", root, "--mode", "create", "--workdir", workdir, "--output", join(outside, "external.md"), "--notes", notes]],
    ["missing-path", [...create, "--notes", join(root, "absent.md")]],
    ["not-regular-file", [...create, "--notes", repository]],
    ["not-directory", [...create, "--repo", notes]],
    ["path-alias", [...create, "--notes", notes, "--draft", notes]],
    ["path-alias", [...create, "--notes", registryPath]],
    ["file-byte-limit", [...create, "--notes", notes, "--limit-text-source-bytes-per-file", "1"]],
    ["output-exists", [...create, "--notes", notes]],
    ["missing-path", ["--workspace-root", root, "--mode", "replace", "--workdir", workdir, "--output", join(root, "absent-output.md"), "--notes", notes]],
    ["update-target-mismatch", [...update, "--output", other, "--update-document", document]],
  ];

  for (const [code, args] of cases) {
    const result = registerSources([...args, "--out", registryPath]);
    assert.equal(result.status, 2, `${code} case did not exit 2: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `), `expected ${code}, saw: ${result.stderr}`);
    assertOutputPreserved(registryPath, snapshot);
    assertNoAdjacentTemps(registryPath);
  }
});

const LEDGER_FIXTURE = Object.freeze([
  Object.freeze({
    id: "C001-F001",
    text: "The service exposes a health endpoint.",
    type: "fact",
    tag: "overview",
    "source-id": "S001",
    "source-kind": "notes",
    "source-chunk": "C001",
    "source-ref": "notes.md#L1-L1",
  }),
  Object.freeze({
    id: "C001-F002",
    text: "Retries use exponential backoff.",
    type: "behavior",
    tag: "details",
    "source-id": "S001",
    "source-kind": "notes",
    "source-chunk": "C001",
    "source-ref": "notes.md#L2-L2",
  }),
]);

/** Seed a ledger, consumed manifest, and document for one coverage case. */
function seedCoverage(root) {
  writeJsonlFixture(root, "work/ledger.jsonl", LEDGER_FIXTURE);
  writeJsonlFixture(root, "work/consumed.jsonl", [
    { id: "C001-F001", section: "Overview" },
    { id: "C001-F002", section: "C#", resolution: "superseded" },
  ]);
  writeFixture(root, "work/doc.md", "# Guide\n\n## Overview\n\nBody.\n\n## C#\n\nBody.\n");
  return {
    ledger: join(root, "work/ledger.jsonl"),
    consumed: join(root, "work/consumed.jsonl"),
    document: join(root, "work/doc.md"),
    report: join(root, "work/coverage.json"),
    ledgerSha256: sha256(readFileSync(join(root, "work/ledger.jsonl"))),
  };
}

function documentCoverageArgs(root, seed, overrides = {}) {
  return [
    "--workspace-root", root,
    "--mode", "document",
    "--stage", overrides.stage ?? "final",
    "--ledger", overrides.ledger ?? seed.ledger,
    "--consumed", overrides.consumed ?? seed.consumed,
    "--document", overrides.document ?? seed.document,
    "--json", overrides.json ?? seed.report,
  ];
}

function outlineCoverageArgs(root, seed, overrides = {}) {
  return [
    "--workspace-root", root,
    "--mode", "outline",
    "--ledger", overrides.ledger ?? seed.ledger,
    "--outline", overrides.outline ?? join(root, "work/outline.md"),
    "--json", overrides.json ?? seed.report,
  ];
}

test("empty and malformed ledger or consumed input cannot produce a passing coverage result", (context) => {
  const root = makeTempRoot(context);
  const seed = seedCoverage(root);

  const passing = runNode(COVERAGE, documentCoverageArgs(root, seed));
  assert.equal(passing.status, 0, passing.stderr);
  assert.equal(readJsonFixture(seed.report).ok, true);
  const snapshot = captureOutput(seed.report);

  writeFixture(root, "work/empty.jsonl", "");
  writeFixture(root, "work/blank.jsonl", "\n");
  writeFixture(root, "work/idless.jsonl", "{\"text\":\"missing id\"}\n");
  writeFixture(root, "work/bare.jsonl", "C001-F001\n");
  writeFixture(root, "work/array.jsonl", "[{\"id\":\"C001-F001\"}]\n");
  writeJsonlFixture(root, "work/scalar-consumed.jsonl", ["C001-F001"]);
  writeJsonlFixture(root, "work/extra-consumed.jsonl", [{ id: "C001-F001", section: "Overview", note: "x" }]);
  writeJsonlFixture(root, "work/kept-consumed.jsonl", [{ id: "C001-F001", section: "Overview", resolution: "kept" }]);

  const cases = [
    // The accepted defect: an id-less ledger with empty consumed data returned ok:true and exit 0.
    [3, "empty-jsonl", { ledger: join(root, "work/empty.jsonl") }],
    [3, "empty-jsonl", { consumed: join(root, "work/empty.jsonl") }],
    [2, "missing-field", { ledger: join(root, "work/idless.jsonl"), consumed: join(root, "work/empty.jsonl") }],
    [2, "blank-jsonl-line", { ledger: join(root, "work/blank.jsonl") }],
    [2, "malformed-jsonl", { ledger: join(root, "work/bare.jsonl") }],
    [2, "invalid-record", { ledger: join(root, "work/array.jsonl") }],
    [2, "invalid-record", { consumed: join(root, "work/scalar-consumed.jsonl") }],
    [2, "unknown-field", { consumed: join(root, "work/extra-consumed.jsonl") }],
    [2, "invalid-enum", { consumed: join(root, "work/kept-consumed.jsonl") }],
  ];

  for (const [status, code, overrides] of cases) {
    const result = runNode(COVERAGE, documentCoverageArgs(root, seed, overrides));
    assert.equal(result.status, status, `${code} case exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `), `expected ${code}, saw: ${result.stderr}`);
    assertOutputPreserved(seed.report, snapshot);
    assertNoAdjacentTemps(seed.report);
  }
});

test("document coverage is exact-once and verifies the named section exists", (context) => {
  const root = makeTempRoot(context);
  const seed = seedCoverage(root);

  const passing = runNode(COVERAGE, documentCoverageArgs(root, seed));
  assert.equal(passing.status, 0, passing.stderr);
  const report = readJsonFixture(seed.report);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.gate, "document-coverage");
  assert.equal(report.stage, "final");
  assert.deepEqual(report.counts, {
    ledger: 2,
    consumed: 2,
    uncovered: 0,
    dangling: 0,
    duplicate: 0,
    missingSection: 0,
  });
  // The `## C#` heading only matches when a closing-hash sequence is not stripped from it.
  assert.deepEqual(report.inputs.map((input) => input.role), ["consumed", "document", "ledger"]);
  assert.equal(report.inputs.find((input) => input.role === "document").sha256, sha256(readFileSync(seed.document)));
  assert.equal(report.inputs.find((input) => input.role === "ledger").sha256, seed.ledgerSha256);

  writeJsonlFixture(root, "work/short.jsonl", [{ id: "C001-F001", section: "Overview" }]);
  writeJsonlFixture(root, "work/repeat.jsonl", [
    { id: "C001-F001", section: "Overview" },
    { id: "C001-F001", section: "C#" },
    { id: "C001-F002", section: "C#" },
  ]);
  writeJsonlFixture(root, "work/dangling.jsonl", [
    { id: "C001-F001", section: "Overview" },
    { id: "C001-F002", section: "C#" },
    { id: "C009-F001", section: "Overview" },
  ]);
  writeJsonlFixture(root, "work/absent-section.jsonl", [
    { id: "C001-F001", section: "Overview" },
    { id: "C001-F002", section: "Nowhere" },
  ]);

  const failures = [
    ["work/short.jsonl", "uncovered-evidence", { uncovered: 1 }],
    ["work/repeat.jsonl", "duplicate-consumed", { duplicate: 1 }],
    ["work/dangling.jsonl", "dangling-evidence", { dangling: 1 }],
    ["work/absent-section.jsonl", "unknown-section", { missingSection: 1 }],
  ];
  for (const [consumed, code, expected] of failures) {
    const result = runNode(COVERAGE, documentCoverageArgs(root, seed, { consumed: join(root, consumed) }));
    assert.equal(result.status, 1, `${code} case exited ${result.status}: ${result.stderr}`);
    const failed = readJsonFixture(seed.report);
    assert.equal(failed.ok, false, `${code} case reported ok`);
    assert.ok(failed.violations.some((violation) => violation.code === code), `${code} violation missing`);
    for (const [name, value] of Object.entries(expected)) {
      assert.equal(failed.counts[name], value, `${code} case counts.${name}`);
    }
  }
});

test("outline coverage is exact-once, fence-aware, and refuses a stale Outline", (context) => {
  const root = makeTempRoot(context);
  const seed = seedCoverage(root);
  const outline = (body) => writeFixture(root, "work/outline.md", body);
  const header = `# Outline: Guide\nledger-sha256: ${seed.ledgerSha256}\n`;

  // The ``` line cannot close a ~~~ block, so the fenced covers line stays inert.
  outline([
    header,
    "## Overview",
    "covers: C001-F001",
    "",
    "~~~text",
    "```",
    "covers: C001-F009",
    "~~~",
    "",
    "## Details",
    "covers: C001-F002",
    "notes: keeps the backoff ceiling",
    "",
  ].join("\n"));
  const passing = runNode(COVERAGE, outlineCoverageArgs(root, seed));
  assert.equal(passing.status, 0, passing.stderr);
  const report = readJsonFixture(seed.report);
  assert.equal(report.gate, "outline-coverage");
  assert.equal(report.stage, "outline");
  assert.deepEqual(report.counts, { ledger: 2, assigned: 2, missing: 0, unknown: 0, duplicate: 0 });
  const snapshot = captureOutput(seed.report);

  const failures = [
    [["## Overview", "covers: C001-F001", ""], "missing-evidence", { missing: 1, assigned: 1 }],
    [
      ["## Overview", "covers: C001-F001, C001-F002", "", "## Details", "covers: C001-F002", ""],
      "duplicate-evidence",
      { duplicate: 1, assigned: 2 },
    ],
    [
      ["## Overview", "covers: C001-F001, C001-F002", "", "## Extra", "covers: C009-F001", ""],
      "unknown-evidence",
      { unknown: 1, assigned: 2 },
    ],
  ];
  for (const [body, code, expected] of failures) {
    outline([header, ...body].join("\n"));
    const result = runNode(COVERAGE, outlineCoverageArgs(root, seed));
    assert.equal(result.status, 1, `${code} case exited ${result.status}: ${result.stderr}`);
    const failed = readJsonFixture(seed.report);
    assert.equal(failed.ok, false);
    assert.ok(failed.violations.some((violation) => violation.code === code), `${code} violation missing`);
    for (const [name, value] of Object.entries(expected)) assert.equal(failed.counts[name], value, `counts.${name}`);
  }

  // A regenerated ledger invalidates the Outline that was planned against the old one.
  outline([header, "## Overview", "covers: C001-F001, C001-F002", ""].join("\n"));
  assert.equal(runNode(COVERAGE, outlineCoverageArgs(root, seed)).status, 0);
  const fresh = captureOutput(seed.report);
  writeJsonlFixture(root, "work/ledger.jsonl", [
    ...LEDGER_FIXTURE,
    {
      id: "C001-F003",
      text: "A later fact.",
      type: "fact",
      tag: "overview",
      "source-id": "S001",
      "source-kind": "notes",
      "source-chunk": "C001",
      "source-ref": "notes.md#L3-L3",
    },
  ]);
  const stale = runNode(COVERAGE, outlineCoverageArgs(root, seed));
  assert.equal(stale.status, 2, stale.stderr);
  assert.match(stale.stderr, /^stale-outline: /);
  assertOutputPreserved(seed.report, fresh);
  assertNoAdjacentTemps(seed.report);
});

test("lint applies shared CommonMark fence rules and binds its stage and inputs", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "notes.md", "notes\n");
  const registryPath = join(root, ".td-work/sources.json");
  const registered = registerSources([
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "out/document.md"),
    "--notes", join(root, "notes.md"),
    "--out", registryPath,
  ]);
  assert.equal(registered.status, 0, registered.stderr);

  // The ``` line cannot close the ~~~ block, so the tag and heading inside stay fenced.
  const document = writeFixture(root, "doc.md", [
    "# Guide",
    "",
    "## Fences",
    "",
    "~~~text",
    "```",
    "## Not A Heading",
    "<span>",
    "~~~",
    "",
    "## C#",
    "",
    "Body [NEEDS CLARIFICATION: which version].",
    "",
  ].join("\n"));
  const reportPath = join(root, ".td-work/lint.json");
  const lintArgs = (stage, file, out) => [
    "--workspace-root", root,
    "--sources", registryPath,
    "--stage", stage,
    file,
    "--json", out,
  ];

  const clean = runNode(LINT, lintArgs("pre-review", document, reportPath));
  assert.equal(clean.status, 0, clean.stderr);
  const report = readJsonFixture(reportPath);
  assert.equal(report.gate, "lint");
  assert.equal(report.stage, "pre-review");
  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, { headings: 3, fences: 1, clarificationMarkers: 1, violations: 0 });
  assert.equal(report.inputs.find((input) => input.role === "document").sha256, sha256(readFileSync(document)));
  assert.equal(
    report.inputs.find((input) => input.role === "source-registry").sha256,
    sha256(readFileSync(registryPath))
  );
  assert.equal(report.configuration.documentBytes, readJsonFixture(registryPath).limits.documentBytes);

  const finalPath = join(root, ".td-work/final-lint.json");
  assert.equal(runNode(LINT, lintArgs("final", document, finalPath)).status, 0);
  assert.equal(readJsonFixture(finalPath).stage, "final");
  assert.deepEqual(
    { ...readJsonFixture(finalPath), stage: "pre-review" },
    readJsonFixture(reportPath),
    "only the stage may differ between two runs over identical bytes"
  );

  const diagramPlaceholder = writeFixture(root, "diagram-placeholder.md", [
    "# Guide",
    "",
    "## Flow",
    "",
    "<!-- DIAGRAM: flow -->",
    "",
  ].join("\n"));
  const diagramPlaceholderBytes = readFileSync(diagramPlaceholder);
  const preReviewDiagramPath = join(root, ".td-work/pre-review-diagram.json");
  const preReviewDiagram = runNode(LINT, lintArgs("pre-review", diagramPlaceholder, preReviewDiagramPath));
  assert.equal(preReviewDiagram.status, 0, preReviewDiagram.stderr);
  const preReviewDiagramReport = readJsonFixture(preReviewDiagramPath);
  assert.equal(preReviewDiagramReport.stage, "pre-review");
  assert.equal(preReviewDiagramReport.ok, true);
  assert.equal(preReviewDiagramReport.counts.violations, 0);
  assert.deepEqual(preReviewDiagramReport.violations, []);

  const invalidDiagramLines = [
    ["embedded-before", "Before <!-- DIAGRAM: flow -->"],
    ["embedded-after", "<!-- DIAGRAM: flow --> after"],
    ["empty-flow-name", "<!-- DIAGRAM:  -->"],
    ["missing-closer", "<!-- DIAGRAM: flow"],
    ["second-html-comment", "<!-- DIAGRAM: flow --> <!-- note -->"],
    ["multiple-diagram-comments", "<!-- DIAGRAM: first --> <!-- DIAGRAM: second -->"],
  ];
  for (const [name, line] of invalidDiagramLines) {
    const invalidDocument = writeFixture(root, `${name}.md`, `# Guide\n\n${line}\n`);
    const invalidReportPath = join(root, `.td-work/pre-review-${name}.json`);

    const invalidResult = runNode(LINT, lintArgs("pre-review", invalidDocument, invalidReportPath));

    assert.equal(invalidResult.status, 1, `${name}: ${invalidResult.stderr}`);
    const invalidReport = readJsonFixture(invalidReportPath);
    assert.equal(invalidReport.stage, "pre-review", name);
    assert.equal(invalidReport.ok, false, name);
    assert.equal(invalidReport.counts.violations, 1, `${name} produced duplicate diagnostics`);
    assert.deepEqual(
      invalidReport.violations.map(({ code, line: lineNumber }) => ({ code, line: lineNumber })),
      [{ code: "html-comment", line: 3 }],
      name
    );
  }

  const finalDiagramPath = join(root, ".td-work/final-diagram.json");
  const finalDiagram = runNode(LINT, lintArgs("final", diagramPlaceholder, finalDiagramPath));
  assert.equal(finalDiagram.status, 1, finalDiagram.stderr);
  const finalDiagramReport = readJsonFixture(finalDiagramPath);
  assert.equal(finalDiagramReport.stage, "final");
  assert.equal(finalDiagramReport.ok, false);
  assert.equal(finalDiagramReport.counts.violations, 1);
  assert.deepEqual(finalDiagramReport.violations.map((violation) => violation.code), ["leftover-placeholder"]);
  assert.deepEqual(finalDiagramReport.inputs, preReviewDiagramReport.inputs);
  assert.equal(
    preReviewDiagramReport.inputs.find((input) => input.role === "document").sha256,
    sha256(diagramPlaceholderBytes)
  );
  assert.equal(
    preReviewDiagramReport.inputs.find((input) => input.role === "source-registry").sha256,
    sha256(readFileSync(registryPath))
  );
  assert.deepEqual(readFileSync(diagramPlaceholder), diagramPlaceholderBytes, "lint mutated the document fixture");
  assert.deepEqual(
    {
      ...finalDiagramReport,
      stage: "pre-review",
      ok: true,
      counts: { ...finalDiagramReport.counts, violations: 0 },
      violations: [],
    },
    preReviewDiagramReport,
    "only the stage and stage-dependent result may differ for the DIAGRAM placeholder"
  );

  const sectionPlaceholder = writeFixture(
    root,
    "section-placeholder.md",
    "# Guide\n\n<!-- SECTION: overview -->\n"
  );
  const preReviewSection = runNode(
    LINT,
    lintArgs("pre-review", sectionPlaceholder, join(root, ".td-work/pre-review-section.json"))
  );
  assert.equal(preReviewSection.status, 1, preReviewSection.stderr);
  const preReviewSectionReport = readJsonFixture(join(root, ".td-work/pre-review-section.json"));
  assert.equal(preReviewSectionReport.stage, "pre-review");
  assert.equal(preReviewSectionReport.ok, false);
  assert.equal(preReviewSectionReport.counts.violations, 1);
  assert.deepEqual(preReviewSectionReport.violations.map((violation) => violation.code), ["leftover-section"]);

  // A three-backtick closer cannot close a four-backtick opener.
  const unclosed = writeFixture(root, "unclosed.md", "# Guide\n\n````text\n```\nBody\n");
  const unclosedResult = runNode(LINT, lintArgs("final", unclosed, join(root, ".td-work/unclosed.json")));
  assert.equal(unclosedResult.status, 1, unclosedResult.stderr);
  const unclosedReport = readJsonFixture(join(root, ".td-work/unclosed.json"));
  assert.equal(unclosedReport.ok, false);
  assert.deepEqual(unclosedReport.violations.map((violation) => violation.code), ["unbalanced-fence"]);

  const dirty = writeFixture(root, "dirty.md", [
    "Prose before any heading.",
    "",
    "<!-- DIAGRAM: flow -->",
    "",
    "#### Deep",
    "",
    "<em>emphasis</em>",
    "",
  ].join("\n"));
  const dirtyResult = runNode(LINT, lintArgs("final", dirty, join(root, ".td-work/dirty.json")));
  assert.equal(dirtyResult.status, 1, dirtyResult.stderr);
  const dirtyReport = readJsonFixture(join(root, ".td-work/dirty.json"));
  assert.deepEqual(
    [...new Set(dirtyReport.violations.map((violation) => violation.code))].sort(),
    ["html-tag", "leftover-placeholder", "title"]
  );
});

test("coverage and lint reject unknown, duplicated, and mode-inappropriate invocations", (context) => {
  const root = makeTempRoot(context);
  const seed = seedCoverage(root);
  writeFixture(root, "work/outline.md", `# Outline: Guide\nledger-sha256: ${seed.ledgerSha256}\n\n## Overview\ncovers: C001-F001, C001-F002\n`);
  writeFixture(root, "notes.md", "notes\n");
  const registryPath = join(root, ".td-work/sources.json");
  assert.equal(registerSources([
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, ".td-work"),
    "--output", join(root, "out/document.md"),
    "--notes", join(root, "notes.md"),
    "--out", registryPath,
  ]).status, 0);

  const coverageCases = [
    ["unknown-option", [...outlineCoverageArgs(root, seed), "--sources", registryPath]],
    ["forbidden-option", [...outlineCoverageArgs(root, seed), "--consumed", seed.consumed]],
    ["invalid-enum", ["--workspace-root", root, "--mode", "sections", "--ledger", seed.ledger, "--json", seed.report]],
    ["missing-option", [
      "--workspace-root", root, "--mode", "document", "--stage", "final",
      "--ledger", seed.ledger, "--document", seed.document, "--json", seed.report,
    ]],
    ["invalid-enum", documentCoverageArgs(root, seed, { stage: "post-review" })],
    ["forbidden-option", [...documentCoverageArgs(root, seed), "--outline", join(root, "work/outline.md")]],
  ];
  for (const [code, args] of coverageCases) {
    const result = runNode(COVERAGE, args);
    assert.equal(result.status, 2, `${code} case exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `), `expected ${code}, saw: ${result.stderr}`);
  }

  const lintBase = ["--workspace-root", root, "--sources", registryPath, "--stage", "final"];
  const lintCases = [
    ["missing-document", [...lintBase, "--json", join(root, "work/lint.json")]],
    ["unexpected-argument", [...lintBase, seed.document, seed.document, "--json", join(root, "work/lint.json")]],
    ["unknown-option", [...lintBase, seed.document, "--json", join(root, "work/lint.json"), "--mode", "document"]],
    ["missing-option-value", ["--workspace-root", root, "--sources", registryPath, "--stage", "--json", seed.document]],
    ["invalid-enum", [
      "--workspace-root", root, "--sources", registryPath, "--stage", "reviewed",
      seed.document, "--json", join(root, "work/lint.json"),
    ]],
  ];
  for (const [code, args] of lintCases) {
    const result = runNode(LINT, args);
    assert.equal(result.status, 2, `${code} case exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `), `expected ${code}, saw: ${result.stderr}`);
  }
});

test("valid current evidence publishes only the authorized contained output atomically", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root);
  assert.equal(existsSync(join(root, "out")), false, "the output parent must not exist before finalization");

  const published = runFinalize(fixture);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(readFileSync(fixture.paths.output, "utf8"), fixture.reviewedDocument);
  assert.equal(sha256(readFileSync(fixture.paths.output)), fixture.documentSha256);
  assertNoAdjacentTemps(fixture.paths.output);
  assert.deepEqual(readdirSync(join(root, "out")), ["document.md"], "publication created only the authorized output");
  assert.equal(lstatSync(join(root, "out")).isSymbolicLink(), false);

  // The destination is read from sources.json and cannot be redirected.
  const redirected = runNode(runtimeScript("finalize.mjs"), [...fixture.args, "--output", join(root, "elsewhere.md")]);
  assert.equal(redirected.status, 2, redirected.stderr);
  assert.match(redirected.stderr, /^unknown-option: /);
  assert.equal(existsSync(join(root, "elsewhere.md")), false);

  // create mode is no-replace: an output that appeared after registration blocks publication.
  const repeated = runFinalize(fixture);
  assert.equal(repeated.status, 2, repeated.stderr);
  assert.match(repeated.stderr, /^output-exists: /);
  assert.equal(readFileSync(fixture.paths.output, "utf8"), fixture.reviewedDocument);
  assertNoAdjacentTemps(fixture.paths.output);
});

test("replace mode refuses output drift and preserves the prior document", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root, { mode: "replace" });
  const prior = "# Prior\n\nPrior body.\n";

  // A same-length rewrite proves the digest, not just the byte count, is revalidated.
  writeFixture(root, "out/document.md", "# Prior\n\nOther body.\n");
  const drifted = captureOutput(fixture.paths.output);
  const sameLength = runFinalize(fixture);
  assert.equal(sameLength.status, 2, sameLength.stderr);
  assert.match(sameLength.stderr, /^target-state-changed: /);
  assertOutputPreserved(fixture.paths.output, drifted);
  assertNoAdjacentTemps(fixture.paths.output);

  writeFixture(root, "out/document.md", `${prior}Appended after registration.\n`);
  const longer = captureOutput(fixture.paths.output);
  const grown = runFinalize(fixture);
  assert.equal(grown.status, 2, grown.stderr);
  assert.match(grown.stderr, /^file-byte-limit: /);
  assertOutputPreserved(fixture.paths.output, longer);

  writeFixture(root, "out/document.md", prior);
  const published = runFinalize(fixture);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(readFileSync(fixture.paths.output, "utf8"), fixture.reviewedDocument);
});

test("update mode publishes only the registered and authorized update target", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root, { mode: "update" });
  const registry = readJsonFixture(fixture.paths.sources);
  const updateTarget = registry.sources.find((source) => source.role === "update-target");
  assert.equal(registry.output.updateSourceId, updateTarget.id);
  assert.equal(registry.output.path, updateTarget.path);

  // An update-target claim that does not name the registered update-target Source is refused,
  // even when the whole report chain is rebound to the tampered registry.
  const tampered = { ...registry, output: { ...registry.output, updateSourceId: "S001" } };
  writeJsonFixture(root, fixture.rel.sources, tampered);
  rebindRegistry(fixture);
  const unauthorized = runFinalize(fixture);
  assert.equal(unauthorized.status, 2, unauthorized.stderr);
  assert.match(unauthorized.stderr, /^unauthorized-update-target: /);
  assert.equal(readFileSync(fixture.paths.output, "utf8"), "# Guide\n\nPrior body.\n");

  writeJsonFixture(root, fixture.rel.sources, registry);
  rebindRegistry(fixture);
  const published = runFinalize(fixture);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(readFileSync(fixture.paths.output, "utf8"), fixture.reviewedDocument);
  assertNoAdjacentTemps(fixture.paths.output);
});

/** Rebind every registry-bound report, and the review that binds them, to the current registry. */
function rebindRegistry(fixture) {
  const registrySha256 = sha256(readFileSync(fixture.paths.sources));
  for (const key of ["extraction", "preLint", "finalLint"]) {
    const report = readJsonFixture(fixture.paths[key]);
    for (const input of report.inputs) {
      if (input.role === "source-registry") input.sha256 = registrySha256;
    }
    writeJsonFixture(fixture.root, fixture.rel[key], report);
  }
  const review = readJsonFixture(fixture.paths.review);
  review.preReviewLintSha256 = sha256(readFileSync(fixture.paths.preLint));
  writeJsonFixture(fixture.root, fixture.rel.review, review);
}

test("pre-review evidence cannot substitute for final evidence", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root);

  for (const [flag, substitute] of [
    ["--final-coverage", fixture.paths.preCoverage],
    ["--final-lint", fixture.paths.preLint],
  ]) {
    const result = runFinalize(fixture, { [flag]: substitute });
    assert.equal(result.status, 2, `${flag} substitution exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, /^stale-gate-stage: /);
    assert.equal(existsSync(fixture.paths.output), false, `${flag} substitution published output`);
  }

  // The reverse substitution is refused too, so a final report cannot backfill the handoff.
  const swapped = runFinalize(fixture, { "--pre-coverage": fixture.paths.finalCoverage });
  assert.equal(swapped.status, 2, swapped.stderr);
  assert.match(swapped.stderr, /^stale-gate-stage: /);

  // A gate report supplied where a different gate is required is refused.
  const crossed = runFinalize(fixture, { "--final-lint": fixture.paths.finalCoverage });
  assert.equal(crossed.status, 2, crossed.stderr);
  assert.match(crossed.stderr, /^unexpected-gate-report: /);
  assert.equal(existsSync(fixture.paths.output), false);
});

test("source, document, consumed, and review mutation each block finalization", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root);
  const original = Object.fromEntries(
    ["sources", "document", "consumed", "review"].map((key) => [key, readFileSync(fixture.paths[key])])
  );
  const restore = () => {
    for (const [key, bytes] of Object.entries(original)) writeFixture(root, fixture.rel[key], bytes);
  };

  const registeredNotes = "The service exposes a health endpoint.\nRetries use exponential backoff.\n";
  const mutations = [
    // A same-length rewrite proves the registered digest, not just the size, is revalidated.
    ["source bytes", "source-digest-mismatch", () => writeFixture(root, "notes.md", "The service exposes a health endpoint.\nRetries use exponential backofs.\n")],
    ["source length", "file-byte-limit", () => writeFixture(root, "notes.md", `${registeredNotes}Appended after the gates.\n`)],
    ["document", "stale-review-handoff", () => writeFixture(root, fixture.rel.document, `${fixture.reviewedDocument}Appended after the final gates.\n`)],
    ["consumed", "stale-review-handoff", () => writeJsonlFixture(root, fixture.rel.consumed, [
      { id: "C001-F001", section: "Overview" },
      { id: "C001-F002", section: "Details", resolution: "superseded" },
    ])],
    ["review ok", "failed-review", () => writeJsonFixture(root, fixture.rel.review, { ...fixture.review, ok: false })],
    ["review reviewer", "unauthorized-reviewer", () => writeJsonFixture(root, fixture.rel.review, { ...fixture.review, reviewer: "someone-else" })],
    ["review touchedSections", "invalid-review", () => writeJsonFixture(root, fixture.rel.review, { ...fixture.review, touchedSections: [] })],
    ["review handoff digest", "stale-review-handoff", () => writeJsonFixture(root, fixture.rel.review, {
      ...fixture.review,
      preReviewCoverageSha256: sha256("a different pre-review coverage report"),
    })],
    ["review output digest", "stale-review-handoff", () => writeJsonFixture(root, fixture.rel.review, {
      ...fixture.review,
      outputDocumentSha256: sha256("a different reviewed document"),
    })],
  ];

  for (const [label, code, mutate] of mutations) {
    restore();
    writeFixture(root, "notes.md", registeredNotes);
    mutate();
    const result = runFinalize(fixture);
    assert.equal(result.status, 2, `${label} mutation exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `), `expected ${code} for ${label}, saw: ${result.stderr}`);
    assert.equal(existsSync(fixture.paths.output), false, `${label} mutation published output`);
  }
});

test("gate report mutation after review blocks finalization", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root);
  const original = Object.fromEntries(
    ["preCoverage", "preLint", "outlineCoverage", "finalCoverage", "finalLint", "extraction"]
      .map((key) => [key, readJsonFixture(fixture.paths[key])])
  );
  const restore = () => {
    for (const [key, value] of Object.entries(original)) writeJsonFixture(root, fixture.rel[key], value);
  };

  const patch = (key, mutate) => () => {
    const report = readJsonFixture(fixture.paths[key]);
    mutate(report);
    writeJsonFixture(root, fixture.rel[key], report);
  };

  const mutations = [
    // The review binds the exact pre-review report bytes, so any edit is caught.
    ["pre-review coverage bytes", "stale-review-handoff", patch("preCoverage", (report) => {
      report.counts.ledger = 99;
    })],
    ["pre-review lint bytes", "stale-review-handoff", patch("preLint", (report) => {
      report.counts.headings = 99;
    })],
    ["final coverage document binding", "stale-gate-report", patch("finalCoverage", (report) => {
      report.inputs.find((input) => input.role === "document").sha256 = sha256("another document");
    })],
    ["final coverage consumed count", "inconsistent-gate-report", patch("finalCoverage", (report) => {
      report.counts.consumed = 5;
    })],
    ["final coverage ledger count", "inconsistent-gate-report", patch("finalCoverage", (report) => {
      report.counts.ledger = 5;
    })],
    ["outline coverage assignment count", "inconsistent-gate-report", patch("outlineCoverage", (report) => {
      report.counts.assigned = 1;
    })],
    ["final lint verdict", "failed-gate", patch("finalLint", (report) => {
      report.ok = false;
    })],
    ["final lint hidden violation", "inconsistent-gate-report", patch("finalLint", (report) => {
      report.violations.push({ code: "html-tag", line: 3, message: "HTML tag present in output: <span>" });
    })],
    ["final lint bound document", "gate-input-path-mismatch", patch("finalLint", (report) => {
      report.inputs.find((input) => input.role === "document").path = ".td-work/other.md";
    })],
    ["final lint document bound", "inconsistent-gate-report", patch("finalLint", (report) => {
      report.configuration.documentBytes = 1024;
    })],
    ["extraction ledger binding", "stale-gate-report", patch("extraction", (report) => {
      report.inputs.find((input) => input.role === "ledger").sha256 = sha256("another ledger");
    })],
    ["extraction counts", "inconsistent-gate-report", patch("extraction", (report) => {
      report.counts.results = 2;
    })],
    ["extraction verdict", "failed-gate", patch("extraction", (report) => {
      report.ok = false;
    })],
  ];

  for (const [label, code, mutate] of mutations) {
    restore();
    mutate();
    const result = runFinalize(fixture);
    assert.equal(result.status, 2, `${label} mutation exited ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `), `expected ${code} for ${label}, saw: ${result.stderr}`);
    assert.equal(existsSync(fixture.paths.output), false, `${label} mutation published output`);
  }

  restore();
  const published = runFinalize(fixture);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(readFileSync(fixture.paths.output, "utf8"), fixture.reviewedDocument);
});

test("finalization refuses a ledger, registry, or symlink substitution across the chain", (context) => {
  const root = makeTempRoot(context);
  const fixture = buildFinalizationFixture(root);

  // Outline and both coverage gates must have measured one ledger.
  const outlineCoverage = readJsonFixture(fixture.paths.outlineCoverage);
  outlineCoverage.inputs.find((input) => input.role === "ledger").sha256 = sha256("a regenerated ledger");
  writeJsonFixture(root, fixture.rel.outlineCoverage, outlineCoverage);
  const staleLedger = runFinalize(fixture);
  assert.equal(staleLedger.status, 2, staleLedger.stderr);
  assert.match(staleLedger.stderr, /^stale-gate-report: /);
  assert.equal(existsSync(fixture.paths.output), false);

  const rebuilt = buildFinalizationFixture(makeTempRoot(context), {});
  const registry = readJsonFixture(rebuilt.paths.sources);
  registry.limits.documentBytes = registry.limits.documentBytes - 1;
  writeJsonFixture(rebuilt.root, rebuilt.rel.sources, registry);
  const staleRegistry = runFinalize(rebuilt);
  assert.equal(staleRegistry.status, 2, staleRegistry.stderr);
  assert.match(staleRegistry.stderr, /^stale-gate-report: /);
  assert.equal(existsSync(rebuilt.paths.output), false);

  if (!canCreateSymlink(root)) return;
  const symlinked = buildFinalizationFixture(makeTempRoot(context), {});
  writeFixture(symlinked.root, "real.md", symlinked.reviewedDocument);
  removeFixture(symlinked.paths.document);
  symlinkSync(join(symlinked.root, "real.md"), symlinked.paths.document, "file");
  const refused = runFinalize(symlinked);
  assert.equal(refused.status, 2, refused.stderr);
  assert.match(refused.stderr, /^(symlink-path|not-regular-file|symlink-component): /);
  assert.equal(existsSync(symlinked.paths.output), false);
});

