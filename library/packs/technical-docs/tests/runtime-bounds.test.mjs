import assert from "node:assert/strict";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import {
  DEFAULT_LIMITS,
  EXIT_CODES,
  LIMIT_DEFINITIONS,
  RuntimeError,
  SCHEMA_VERSION,
  acquireWorkspaceRoot,
  assertClosedRecord,
  assertDenseArray,
  assertNoPathAliases,
  assertUniqueIdentities,
  assertVersion2Record,
  authorizeExistingPath,
  createStagedDirectory,
  decodeUtf8,
  ensureContainedOutputParent,
  errorDiagnostic,
  exitCodeForError,
  fileIdentity,
  hashFile,
  compareEvidenceIds,
  compareUnitIds,
  parseCliOptions,
  parseCanonicalDecimal,
  parseCanonicalInteger,
  parseJsonlBytes,
  persistedDiagnostic,
  publishStagedDirectory,
  pathsAlias,
  readJsonFile,
  readJsonlFile,
  readStableBytes,
  readUtf8File,
  resolveLimits,
  resolveWorkspacePath,
  sha256Bytes,
  toWorkspacePath,
  validateIndexPath,
  validateByteCount,
  validateDigest,
  validateEvidenceId,
  validateLine,
  validateLimits,
  validatePersistedPath,
  validateSourceId,
  validateTokenCount,
  validateUnitId,
  validateWorkspacePath,
  writeAtomicFile,
} from "../skills/dude-pack-technical-docs-runtime/scripts/lib/runtime.mjs";
import {
  CANONICAL_TEMP_ROOT,
  assertFileBytes,
  assertNoAdjacentTemps,
  assertOutputPreserved,
  canCreateHardlink,
  canCreateSymlink,
  canEnforceUnreadableFile,
  captureOutput,
  fixturePath,
  makeTempRoot,
  runNode,
  sha256,
  writeFixture,
  writeJsonFixture,
  writeJsonlFixture,
} from "./helpers/harness.mjs";

function expectRuntimeError(action, code) {
  let caught;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof RuntimeError, "expected RuntimeError");
  assert.equal(caught.code, code);
  return caught;
}

test("schema primitives enforce closed records, dense arrays, version 2, and unique identities", () => {
  assert.deepEqual(assertClosedRecord({ id: "S001" }, { required: ["id"] }), { id: "S001" });
  expectRuntimeError(() => assertClosedRecord({}, { required: ["id"] }), "missing-field");
  expectRuntimeError(() => assertClosedRecord({ id: "S001", extra: true }, { required: ["id"] }), "unknown-field");
  expectRuntimeError(() => assertClosedRecord([]), "invalid-record");

  assert.deepEqual(assertDenseArray([1, 2], { minLength: 1, maxLength: 2 }), [1, 2]);
  const sparse = [];
  sparse.length = 2;
  sparse[1] = "present";
  expectRuntimeError(() => assertDenseArray(sparse), "sparse-array");
  expectRuntimeError(() => assertDenseArray([], { minLength: 1 }), "array-too-short");

  const versioned = { schemaVersion: SCHEMA_VERSION, items: [] };
  assert.equal(assertVersion2Record(versioned, { required: ["items"] }), versioned);
  expectRuntimeError(() => assertVersion2Record({ schemaVersion: 1 }), "unsupported-schema-version");
  expectRuntimeError(
    () => assertUniqueIdentities([{ id: "A" }, { id: "A" }]),
    "duplicate-identity"
  );
});

test("runtime errors expose stable diagnostics and exit status", () => {
  const error = new RuntimeError("sample", "sample message", { path: "input.jsonl", line: 3, exitCode: EXIT_CODES.EMPTY_INPUT });
  assert.deepEqual(errorDiagnostic(error), { code: "sample", message: "sample message", path: "input.jsonl", line: 3 });
  assert.equal(exitCodeForError(error), 3);
  assert.equal(exitCodeForError(new Error("unknown")), 2);
});

test("canonical integer parsing enforces lexical form and inclusive ranges", () => {
  assert.equal(parseCanonicalInteger("0", { min: 0, max: 10 }), 0);
  assert.equal(parseCanonicalInteger("10", { min: 0, max: 10 }), 10);
  for (const raw of ["", "+1", "-1", "01", "1.0", "1e2", " 1", "1 ", "1_000", "9007199254740992"]) {
    expectRuntimeError(() => parseCanonicalInteger(raw, { min: 0, max: 10 }), "invalid-integer");
  }
  expectRuntimeError(() => parseCanonicalInteger("11", { min: 0, max: 10 }), "integer-out-of-range");
});

test("canonical decimal parsing rejects aliases and honors inclusive ranges", () => {
  for (const [raw, expected] of [["0", 0], ["1", 1], ["0.5", 0.5], ["0.000001", 0.000001], ["999.999999", 999.999999]]) {
    assert.equal(parseCanonicalDecimal(raw, { min: 0, max: 1000 }), expected);
  }
  for (const raw of ["", ".5", "5.", "5.0", "01", "+1", "-0", "1e0", "NaN", "Infinity", "0.0000001", "1.2345670"]) {
    expectRuntimeError(() => parseCanonicalDecimal(raw, { min: 0, max: 1000 }), "invalid-decimal");
  }
  expectRuntimeError(() => parseCanonicalDecimal("1.1", { min: 0, max: 1 }), "decimal-out-of-range");
});

test("canonical identities, counts, and numeric comparators follow the v2 contracts", () => {
  const digest = "0123456789abcdef".repeat(4);
  assert.equal(validateDigest(digest), digest);
  assert.equal(validateSourceId("S001"), "S001");
  assert.equal(validateUnitId("C1000"), "C1000");
  assert.equal(validateEvidenceId("R1000-F999"), "R1000-F999");
  assert.equal(validateLine(1), 1);
  assert.equal(validateByteCount(0), 0);
  assert.equal(validateTokenCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.ok(compareUnitIds("C999", "C1000") < 0);
  assert.ok(compareUnitIds("C1000", "E001") < 0);
  assert.ok(compareEvidenceIds("C999-F999", "C1000-F001") < 0);
  assert.ok(compareEvidenceIds("R001-F009", "R001-F010") < 0);

  for (const invalid of ["", "A001", "S000", "S0001", "S01", "S9007199254740992"]) {
    expectRuntimeError(() => validateSourceId(invalid), "invalid-identity");
  }
  for (const invalid of ["C000", "C0001", "C01", "X001"]) {
    expectRuntimeError(() => validateUnitId(invalid), "invalid-identity");
  }
  for (const invalid of ["C001-F000", "C001-F01", "C001-F1000", "C000-F001"]) {
    expectRuntimeError(() => validateEvidenceId(invalid), "invalid-identity");
  }
  expectRuntimeError(() => validateDigest(digest.toUpperCase()), "invalid-digest");
  expectRuntimeError(() => validateLine(0), "invalid-line");
  expectRuntimeError(() => validateByteCount(-1), "invalid-byte-count");
  expectRuntimeError(() => validateTokenCount(1.5), "invalid-token-count");
});

test("closed CLI parsing rejects aliases, unknowns, duplicates, and missing values", () => {
  const definitions = {
    workspaceRoot: { flag: "--workspace-root", required: true },
    source: { flag: "--source", multiple: true },
    limit: { flag: "--limit", parse: (raw) => parseCanonicalInteger(raw, { min: 1, max: 10 }) },
    verbose: { flag: "--verbose", takesValue: false },
  };
  assert.deepEqual(
    parseCliOptions(["--workspace-root", ".", "--source", "a", "--source", "b", "--limit", "2", "--verbose"], definitions),
    { workspaceRoot: ".", source: ["a", "b"], limit: 2, verbose: true }
  );
  expectRuntimeError(() => parseCliOptions([], definitions), "missing-option");
  expectRuntimeError(() => parseCliOptions(["--workspace-root=."], definitions), "unknown-option");
  expectRuntimeError(() => parseCliOptions(["--workspace-root", ".", "--unknown", "x"], definitions), "unknown-option");
  expectRuntimeError(() => parseCliOptions(["--workspace-root", ".", "--workspace-root", "."], definitions), "duplicate-option");
  expectRuntimeError(() => parseCliOptions(["--workspace-root", "--verbose"], definitions), "missing-option-value");
  expectRuntimeError(() => parseCliOptions(["positional", "value"], definitions), "unknown-option");
});

test("persisted diagnostics use fixed messages and portable paths only", () => {
  const hostPath = join(CANONICAL_TEMP_ROOT, "private", "input.jsonl");
  const error = new RuntimeError("invalid-source", `cannot read ${hostPath}`, { path: hostPath });
  const diagnostic = persistedDiagnostic(error, {
    messages: { "invalid-source": "The registered source is invalid." },
    path: "sources/input.jsonl",
    line: 2,
    id: "S001",
  });
  assert.deepEqual(diagnostic, {
    code: "invalid-source",
    path: "sources/input.jsonl",
    line: 2,
    id: "S001",
    message: "The registered source is invalid.",
  });
  assert.equal(JSON.stringify(diagnostic).includes(CANONICAL_TEMP_ROOT), false);
  expectRuntimeError(
    () => persistedDiagnostic(error, { messages: { "invalid-source": "fixed" }, path: hostPath }),
    "invalid-path"
  );
});

test("all 17 shared limits expose exact defaults, ranges, and cross-field checks", () => {
  assert.equal(Object.keys(LIMIT_DEFINITIONS).length, 17);
  assert.deepEqual(resolveLimits(), DEFAULT_LIMITS);
  validateLimits({ ...DEFAULT_LIMITS });

  for (const definition of Object.values(LIMIT_DEFINITIONS)) {
    assert.equal(parseCanonicalInteger(String(definition.min), definition), definition.min);
    assert.equal(parseCanonicalInteger(String(definition.max), definition), definition.max);
    expectRuntimeError(() => parseCanonicalInteger(String(definition.max + 1), definition), "integer-out-of-range");
  }

  const invalidRelations = [
    { jsonlBytesPerLine: "11", jsonlBytesPerFile: "10" },
    { repositoryChildrenPerDirectory: "11", repositoryEncounteredEntries: "10" },
    { repositoryChildrenPerDirectory: "1", repositoryAdmittedFiles: "11", repositoryEncounteredEntries: "10" },
    { repositoryBytesPerAdmittedFile: "11", repositoryCandidateBytes: "10" },
    { unitOverlapApproximateTokens: "10", unitApproximateTokens: "10" },
  ];
  for (const overrides of invalidRelations) {
    expectRuntimeError(() => resolveLimits(overrides), "invalid-limit-relation");
  }
  expectRuntimeError(() => resolveLimits({ unknown: "1" }), "unknown-field");
  expectRuntimeError(() => validateLimits({ ...DEFAULT_LIMITS, unknown: 1 }), "unknown-field");
});

test("bounded byte reads accept the exact bound and reject one byte over", (context) => {
  const root = makeTempRoot(context);
  const file = writeFixture(root, "input.bin", Buffer.from([0, 1, 2, 3, 4]));
  assert.deepEqual(readStableBytes(file, { maxBytes: 5 }), Buffer.from([0, 1, 2, 3, 4]));
  assert.deepEqual(readStableBytes(file, { maxBytes: 5, exactBytes: 5 }), Buffer.from([0, 1, 2, 3, 4]));
  assert.equal(expectRuntimeError(() => readStableBytes(file, { maxBytes: 4 }), "file-byte-limit").path, file);
  expectRuntimeError(() => readStableBytes(file, { maxBytes: 5, exactBytes: 4 }), "unexpected-byte-count");
  assert.deepEqual(hashFile(file, { maxBytes: 5 }), { bytes: 5, sha256: sha256(Buffer.from([0, 1, 2, 3, 4])) });
});

test("stable reads deterministically detect a file changed during the read", (context) => {
  const root = makeTempRoot(context);
  const file = writeFixture(root, "changing.txt", "before\n");
  const error = expectRuntimeError(
    () => readStableBytes(file, {
      maxBytes: 100,
      testHooks: { afterRead: ({ path }) => appendFileSync(path, "after\n") },
    }),
    "changed-during-read"
  );
  assert.equal(error.path, file);
});

test("root-aware stable reads reject parent substitution even when file identity is unchanged", (context) => {
  const root = makeTempRoot(context);
  if (!canCreateSymlink(root)) {
    context.skip("symbolic links are unavailable on this host");
    return;
  }
  const file = writeFixture(root, "parent/input.txt", "stable\n");
  const originalIdentity = fileIdentity(file);
  const error = expectRuntimeError(
    () => readStableBytes(file, {
      workspaceRoot: root,
      workspacePath: "parent/input.txt",
      expectedRealPath: file,
      expectedIdentity: originalIdentity,
      testHooks: {
        afterRead: () => {
          renameSync(join(root, "parent"), join(root, "moved-parent"));
          symlinkSync(join(root, "moved-parent"), join(root, "parent"), "dir");
        },
      },
    }),
    "symlink-component"
  );
  assert.equal(error.path, join(root, "parent"));
});

test("UTF-8 and JSON readers reject malformed, scalar, array, and schema-invalid input with locations", (context) => {
  const root = makeTempRoot(context);
  expectRuntimeError(() => decodeUtf8(Buffer.from([0xc3, 0x28])), "invalid-utf8");
  expectRuntimeError(() => decodeUtf8(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), "utf8-bom");

  const invalidUtf8 = writeFixture(root, "invalid-utf8.txt", Buffer.concat([
    Buffer.from("valid first line\n", "utf8"),
    Buffer.from([0xc3, 0x28]),
  ]));
  const utf8Error = expectRuntimeError(() => readUtf8File(invalidUtf8), "invalid-utf8");
  assert.deepEqual({ path: utf8Error.path, line: utf8Error.line }, { path: invalidUtf8, line: 2 });

  const valid = writeJsonFixture(root, "valid.json", { schemaVersion: 2, id: "S001" });
  assert.equal(readJsonFile(valid, {
    validate: (record) => assertVersion2Record(record, { required: ["id"] }),
  }).id, "S001");

  const scalar = writeFixture(root, "scalar.json", "42\n");
  const scalarError = expectRuntimeError(() => readJsonFile(scalar), "invalid-record");
  assert.equal(scalarError.path, scalar);
  assert.equal(scalarError.line, 1);

  const array = writeFixture(root, "array.json", "[]\n");
  expectRuntimeError(() => readJsonFile(array), "invalid-record");

  const malformed = writeFixture(root, "malformed.json", "{\n  \"ok\": true,\n  nope\n}\n");
  const malformedError = expectRuntimeError(() => readJsonFile(malformed), "malformed-json");
  assert.equal(malformedError.path, malformed);
  assert.equal(malformedError.line, 3);

  const unknown = writeJsonFixture(root, "unknown.json", { schemaVersion: 2, id: "S001", extra: true });
  const unknownError = expectRuntimeError(
    () => readJsonFile(unknown, { validate: (record) => assertVersion2Record(record, { required: ["id"] }) }),
    "unknown-field"
  );
  assert.equal(unknownError.path, unknown);
  assert.equal(unknownError.line, 1);
});

test("strict canonical JSON preserves duplicate and lexical evidence", (context) => {
  const root = makeTempRoot(context);
  const validate = (record) => assertVersion2Record(record, { required: ["id"] });
  const canonicalize = (record) => ({ schemaVersion: record.schemaVersion, id: record.id });
  const valid = writeFixture(root, "canonical.json", "{\n  \"schemaVersion\": 2,\n  \"id\": \"S001\"\n}\n");
  assert.equal(readJsonFile(valid, { strictCanonical: true, validate, canonicalize }).id, "S001");

  const cases = [
    ["duplicate-version.json", "{\"schemaVersion\":2,\"schemaVersion\":2,\"id\":\"S001\"}\n", "duplicate-json-key"],
    ["duplicate-id.json", "{\"schemaVersion\":2,\"id\":\"S001\",\"id\":\"S002\"}\n", "duplicate-json-key"],
    ["field-order.json", "{\n  \"id\": \"S001\",\n  \"schemaVersion\": 2\n}\n", "noncanonical-json"],
    ["spacing.json", "{\"schemaVersion\":2,\"id\":\"S001\"}\n", "noncanonical-json"],
    ["crlf.json", "{\r\n  \"schemaVersion\": 2,\r\n  \"id\": \"S001\"\r\n}\r\n", "noncanonical-json"],
    ["unsafe.json", "{\n  \"schemaVersion\": 2,\n  \"id\": 9007199254740992\n}\n", "unsafe-json-integer"],
  ];
  for (const [name, contents, code] of cases) {
    const file = writeFixture(root, name, contents);
    expectRuntimeError(() => readJsonFile(file, { strictCanonical: true, validate, canonicalize }), code);
  }
});

test("JSONL total, line, and record bounds are inclusive and exact", (context) => {
  const root = makeTempRoot(context);
  const records = [{ id: "A", text: "\ud83d\ude00" }, { id: "B" }];
  const file = writeJsonlFixture(root, "records.jsonl", records);
  const text = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  const lines = text.trimEnd().split("\n");
  const maxLineBytes = Math.max(...lines.map((line) => Buffer.byteLength(line)));
  const totalBytes = Buffer.byteLength(text);

  assert.deepEqual(readJsonlFile(file, {
    maxBytes: totalBytes,
    maxLineBytes,
    maxRecords: 2,
    requireTerminalNewline: true,
  }), records);
  expectRuntimeError(() => readJsonlFile(file, { maxBytes: totalBytes - 1 }), "file-byte-limit");
  expectRuntimeError(() => readJsonlFile(file, { maxBytes: totalBytes, maxLineBytes: maxLineBytes - 1 }), "jsonl-line-byte-limit");
  const recordError = expectRuntimeError(
    () => readJsonlFile(file, { maxBytes: totalBytes, maxLineBytes, maxRecords: 1 }),
    "jsonl-record-limit"
  );
  assert.equal(recordError.line, 2);
});

test("strict object-only JSONL reports malformed and schema-invalid 1-based lines", () => {
  const scalarError = expectRuntimeError(
    () => parseJsonlBytes(Buffer.from("\"bare\"\n"), { path: "scalar.jsonl" }),
    "invalid-record"
  );
  assert.deepEqual({ path: scalarError.path, line: scalarError.line }, { path: "scalar.jsonl", line: 1 });
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("[]\n"), { path: "array.jsonl" }), "invalid-record");

  const malformedError = expectRuntimeError(
    () => parseJsonlBytes(Buffer.from("{\"id\":\"A\"}\nnot-json\n"), { path: "bad.jsonl" }),
    "malformed-jsonl"
  );
  assert.equal(malformedError.line, 2);
  const invalidUtf8 = Buffer.concat([
    Buffer.from("{\"id\":\"A\"}\n", "utf8"),
    Buffer.from([0xc3, 0x28, 0x0a]),
  ]);
  const utf8Error = expectRuntimeError(
    () => parseJsonlBytes(invalidUtf8, { path: "utf8.jsonl" }),
    "invalid-utf8"
  );
  assert.deepEqual({ path: utf8Error.path, line: utf8Error.line }, { path: "utf8.jsonl", line: 2 });
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{\"id\":\"A\"}\n\n")), "blank-jsonl-line");
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{\"id\":\"A\"}\r\n")), "noncanonical-jsonl-line-ending");
  expectRuntimeError(() => parseJsonlBytes(Buffer.alloc(0), { requireNonempty: true }), "empty-jsonl");
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{\"id\":\"A\"}"), { requireTerminalNewline: true }), "missing-jsonl-terminal-newline");

  const records = parseJsonlBytes(Buffer.from("{\"id\":\"A\"}\n{\"id\":\"A\"}\n"), {
    path: "duplicate.jsonl",
    validate: (record) => assertClosedRecord(record, { required: ["id"] }),
  });
  expectRuntimeError(() => assertUniqueIdentities(records), "duplicate-identity");

  const schemaError = expectRuntimeError(
    () => parseJsonlBytes(Buffer.from("{\"id\":\"A\"}\n{\"id\":\"B\",\"extra\":1}\n"), {
      path: "schema.jsonl",
      validate: (record) => assertClosedRecord(record, { required: ["id"] }),
    }),
    "unknown-field"
  );
  assert.deepEqual({ path: schemaError.path, line: schemaError.line }, { path: "schema.jsonl", line: 2 });
});

test("strict canonical JSONL rejects duplicate keys, lexical aliases, and missing LF", () => {
  const options = {
    path: "strict.jsonl",
    strictCanonical: true,
    validate: (record) => assertClosedRecord(record, { required: ["id", "count"] }),
    canonicalize: (record) => ({ id: record.id, count: record.count }),
  };
  assert.deepEqual(parseJsonlBytes(Buffer.from("{\"id\":\"C001-F001\",\"count\":1}\n"), options), [
    { id: "C001-F001", count: 1 },
  ]);
  expectRuntimeError(
    () => parseJsonlBytes(Buffer.from("{\"id\":\"C001-F001\",\"id\":\"C001-F002\",\"count\":1}\n"), options),
    "duplicate-json-key"
  );
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{\"count\":1,\"id\":\"C001-F001\"}\n"), options), "noncanonical-jsonl");
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{ \"id\":\"C001-F001\",\"count\":1}\n"), options), "noncanonical-jsonl");
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{\"id\":\"C001-F001\",\"count\":1}\r\n"), options), "noncanonical-jsonl-line-ending");
  expectRuntimeError(() => parseJsonlBytes(Buffer.from("{\"id\":\"C001-F001\",\"count\":1}"), options), "missing-jsonl-terminal-newline");
  expectRuntimeError(
    () => parseJsonlBytes(Buffer.from("{\"id\":\"C001-F001\",\"count\":9007199254740992}\n"), options),
    "unsafe-json-integer"
  );
});

test("workspace path grammar and root conversion are portable and contained", (context) => {
  const root = makeTempRoot(context);
  const childDirectory = join(root, "child");
  mkdirSync(childDirectory);
  assert.ok(root.startsWith(CANONICAL_TEMP_ROOT));
  assert.equal(acquireWorkspaceRoot(root), root);
  assert.equal(acquireWorkspaceRoot(basename(root), { cwd: dirname(root) }), root);
  assert.equal(acquireWorkspaceRoot("..", { cwd: childDirectory }), root);
  assert.equal(validateWorkspacePath("work/results.json"), "work/results.json");
  assert.equal(validatePersistedPath("work/results.json"), "work/results.json");
  assert.equal(validateWorkspacePath("@root", { allowRoot: true }), "@root");
  assert.equal(validateIndexPath("results/C001.json"), "results/C001.json");

  for (const invalid of ["", "@root", "/absolute", "../escape", "a/../b", "a//b", "a/", "./a", "a\\b", "C:/absolute", "a\0b"]) {
    expectRuntimeError(() => validateWorkspacePath(invalid), invalid === "@root" ? "reserved-root-path" : "invalid-path");
  }

  const file = writeFixture(root, "nested/input.txt", "input\n");
  mkdirSync(join(root, "directory"));
  assert.equal(resolveWorkspacePath(root, "nested/input.txt"), file);
  assert.equal(toWorkspacePath(root, file), "nested/input.txt");
  assert.equal(toWorkspacePath(root, root, { allowRoot: true }), "@root");
  assert.equal(authorizeExistingPath(root, "nested/input.txt", { kind: "file" }).realPath, file);
  assert.equal(authorizeExistingPath(root, "directory", { kind: "directory" }).realPath, join(root, "directory"));
  assert.equal(authorizeExistingPath(root, "@root", { allowRoot: true, kind: "directory" }).realPath, root);
  expectRuntimeError(() => authorizeExistingPath(root, "directory", { kind: "file" }), "not-regular-file");
  expectRuntimeError(() => toWorkspacePath(root, join(dirname(root), "outside.txt")), "path-outside-root");
});

test("symlink components and symlink aliases are rejected where supported", (context) => {
  const root = makeTempRoot(context);
  if (!canCreateSymlink(root)) {
    context.skip("symbolic links are unavailable on this host");
    return;
  }

  const targetDirectory = join(root, "target");
  mkdirSync(targetDirectory);
  const targetFile = writeFixture(root, "target/input.txt", "input\n");
  const linkedDirectory = join(root, "linked-directory");
  const linkedFile = join(root, "linked-file");
  symlinkSync(targetDirectory, linkedDirectory, "dir");
  symlinkSync(targetFile, linkedFile, "file");

  expectRuntimeError(() => acquireWorkspaceRoot(linkedDirectory), "symlink-component");
  expectRuntimeError(() => authorizeExistingPath(root, "linked-directory/input.txt"), "symlink-component");
  expectRuntimeError(() => readStableBytes(linkedFile), "symlink-component");
  assert.equal(pathsAlias(targetFile, linkedFile), true);
  expectRuntimeError(() => ensureContainedOutputParent(root, "linked-directory/output.txt"), "unsafe-output-parent");
});

test("fixture writes reject escapes, host-absolute forms, and existing symlink parents", (context) => {
  const root = makeTempRoot(context);
  for (const unsafePath of ["../escape.txt", root, "C:\\escape.txt", "C:drive-relative.txt", "\\\\server\\share\\escape.txt"]) {
    assert.throws(() => fixturePath(root, unsafePath));
  }

  if (!canCreateSymlink(root)) return;
  const outside = makeTempRoot(context, "technical-docs-outside-");
  symlinkSync(outside, join(root, "linked-parent"), "dir");
  assert.throws(() => writeFixture(root, "linked-parent/escaped.txt", "escaped\n"), /non-symlink directory/);
  assert.equal(existsSync(join(outside, "escaped.txt")), false);

  const outsideFile = writeFixture(outside, "outside.txt", "outside\n");
  symlinkSync(outsideFile, join(root, "linked-file"), "file");
  assert.throws(() => writeFixture(root, "linked-file", "escaped\n"), /must not be a symlink/);
  assertFileBytes(outsideFile, Buffer.from("outside\n"));

  if (canCreateHardlink(root)) {
    linkSync(outsideFile, join(root, "hard-linked-file"));
    assert.throws(() => writeFixture(root, "hard-linked-file", "escaped\n"), /multiply linked/);
    assertFileBytes(outsideFile, Buffer.from("outside\n"));
  }
});

test("hard-link file identity aliases are rejected where supported", (context) => {
  const root = makeTempRoot(context);
  if (!canCreateHardlink(root)) {
    context.skip("hard links are unavailable on this host");
    return;
  }

  const original = writeFixture(root, "original.txt", "same bytes\n");
  const alias = join(root, "alias.txt");
  linkSync(original, alias);
  assert.deepEqual(fileIdentity(original), fileIdentity(alias));
  assert.equal(pathsAlias(original, alias), true);
  expectRuntimeError(() => assertNoPathAliases([original, alias]), "path-alias");
});

test("unreadable direct files fail closed where permissions are enforceable", (context) => {
  const root = makeTempRoot(context);
  if (!canEnforceUnreadableFile(root)) {
    context.skip("read permission removal is not enforceable for this process");
    return;
  }
  const file = writeFixture(root, "unreadable.txt", "secret\n");
  chmodSync(file, 0o000);
  try {
    expectRuntimeError(() => readStableBytes(file), "file-read-failed");
  } finally {
    chmodSync(file, 0o600);
  }
});

test("safe output parents are created one contained segment at a time", (context) => {
  const root = makeTempRoot(context);
  const result = ensureContainedOutputParent(root, "new/deep/output.json");
  assert.equal(result.path, join(root, "new", "deep", "output.json"));
  assert.equal(lstatSync(join(root, "new")).isDirectory(), true);
  assert.equal(lstatSync(join(root, "new", "deep")).isDirectory(), true);
  assert.equal(existsSync(result.path), false);

  writeFixture(root, "blocked", "not a directory\n");
  expectRuntimeError(() => ensureContainedOutputParent(root, "blocked/output.json"), "unsafe-output-parent");
  mkdirSync(join(root, "directory-output"));
  expectRuntimeError(() => ensureContainedOutputParent(root, "directory-output"), "unsafe-output-target");
  expectRuntimeError(() => ensureContainedOutputParent(root, "../escape/output.json"), "invalid-path");
});

test("atomic create is no-replace and atomic replace publishes exact bytes", (context) => {
  const root = makeTempRoot(context);
  const target = join(root, "output.json");
  const created = writeAtomicFile(target, "created\n", { mode: "create", workspaceRoot: root });
  assert.deepEqual(created, {
    path: target,
    bytes: 8,
    sha256: sha256Bytes("created\n"),
    mode: "create",
  });
  assertFileBytes(target, Buffer.from("created\n"));
  assertNoAdjacentTemps(target);

  const snapshot = captureOutput(target);
  expectRuntimeError(() => writeAtomicFile(target, "must not replace\n", { mode: "create", workspaceRoot: root }), "output-exists");
  assertOutputPreserved(target, snapshot);

  const replaced = writeAtomicFile(target, "replacement\n", { mode: "replace", workspaceRoot: root });
  assert.equal(replaced.sha256, sha256("replacement\n"));
  assertFileBytes(target, Buffer.from("replacement\n"));
  assertNoAdjacentTemps(target);
  expectRuntimeError(() => writeAtomicFile(target, { invalid: true }, { mode: "replace" }), "invalid-byte-input");
  expectRuntimeError(
    () => writeAtomicFile(target, "ignored\n", { mode: "replace", testOnlyInjectFailure: "unsupported" }),
    "invalid-test-injection"
  );
});

test("injected atomic failures preserve prior output and remove adjacent temps", (context) => {
  const root = makeTempRoot(context);
  const existing = writeFixture(root, "existing.txt", "prior\n");
  const snapshot = captureOutput(existing);
  expectRuntimeError(
    () => writeAtomicFile(existing, "new\n", {
      mode: "replace",
      workspaceRoot: root,
      testOnlyInjectFailure: "before-publish",
    }),
    "injected-write-failure"
  );
  assertOutputPreserved(existing, snapshot);
  assertNoAdjacentTemps(existing);

  const absent = join(root, "absent.txt");
  expectRuntimeError(
    () => writeAtomicFile(absent, "new\n", {
      mode: "create",
      workspaceRoot: root,
      testOnlyInjectFailure: "before-publish",
    }),
    "injected-write-failure"
  );
  assert.equal(existsSync(absent), false);
  assertNoAdjacentTemps(absent);
});

test("atomic replace revalidates expected target state after staging", (context) => {
  const root = makeTempRoot(context);
  const target = writeFixture(root, "expected.txt", "registered\n");
  const expectedTarget = {
    state: "file",
    bytes: Buffer.byteLength("registered\n"),
    sha256: sha256("registered\n"),
  };
  expectRuntimeError(
    () => writeAtomicFile(target, "candidate\n", {
      mode: "replace",
      workspaceRoot: root,
      expectedTarget,
      testHooks: { afterTempFlush: () => writeFileSync(target, "concurrent\n") },
    }),
    "target-state-changed"
  );
  assertFileBytes(target, Buffer.from("concurrent\n"));
  assertNoAdjacentTemps(target);
});

test("atomic replace rechecks protected aliases after staging", (context) => {
  const root = makeTempRoot(context);
  if (!canCreateHardlink(root)) {
    context.skip("hard links are unavailable on this host");
    return;
  }
  const target = writeFixture(root, "target.txt", "registered\n");
  const protectedFile = writeFixture(root, "protected.txt", "protected\n");
  expectRuntimeError(
    () => writeAtomicFile(target, "candidate\n", {
      mode: "replace",
      workspaceRoot: root,
      protectedPaths: [protectedFile],
      testHooks: {
        afterTempFlush: () => {
          unlinkSync(target);
          linkSync(protectedFile, target);
        },
      },
    }),
    "protected-path-alias"
  );
  assert.equal(pathsAlias(target, protectedFile), true);
  assertFileBytes(protectedFile, Buffer.from("protected\n"));
  assertNoAdjacentTemps(target);
});

test("adjacent staged directories publish only to an absent destination", (context) => {
  const root = makeTempRoot(context);
  const target = join(root, "published");
  const staged = createStagedDirectory(target, { workspaceRoot: root });
  writeFixture(staged, "result.json", "result\n");
  assert.deepEqual(publishStagedDirectory(staged, target, { workspaceRoot: root }), { path: target, reused: false });
  assertFileBytes(join(target, "result.json"), Buffer.from("result\n"));

  const blockedTarget = join(root, "blocked-publish");
  const blockedStage = createStagedDirectory(blockedTarget, { workspaceRoot: root });
  writeFixture(blockedStage, "result.json", "staged\n");
  expectRuntimeError(
    () => publishStagedDirectory(blockedStage, blockedTarget, {
      workspaceRoot: root,
      testHooks: { beforeDirectoryPublish: () => mkdirSync(blockedTarget) },
    }),
    "output-exists"
  );
  assert.equal(lstatSync(blockedStage).isDirectory(), true);
  assert.equal(lstatSync(blockedTarget).isDirectory(), true);

  const reusableTarget = join(root, "reusable");
  mkdirSync(reusableTarget);
  writeFixture(reusableTarget, "result.json", "same\n");
  const reusableStage = createStagedDirectory(reusableTarget, { workspaceRoot: root });
  writeFixture(reusableStage, "result.json", "same\n");
  assert.deepEqual(publishStagedDirectory(reusableStage, reusableTarget, {
    workspaceRoot: root,
    verifyExisting: ({ staged: currentStage, target: currentTarget }) => (
      hashFile(join(currentStage, "result.json")).sha256 === hashFile(join(currentTarget, "result.json")).sha256
    ),
  }), { path: reusableTarget, reused: true });
  assert.equal(existsSync(reusableStage), false);
  assertFileBytes(join(reusableTarget, "result.json"), Buffer.from("same\n"));

  const mismatchStage = createStagedDirectory(reusableTarget, { workspaceRoot: root });
  writeFixture(mismatchStage, "result.json", "different\n");
  expectRuntimeError(
    () => publishStagedDirectory(mismatchStage, reusableTarget, {
      workspaceRoot: root,
      verifyExisting: () => false,
    }),
    "staged-directory-mismatch"
  );
  assert.equal(lstatSync(mismatchStage).isDirectory(), true);
  assertFileBytes(join(reusableTarget, "result.json"), Buffer.from("same\n"));
});

test("the harness invokes Node directly without a shell", () => {
  const result = runNode("-e", ["process.stdout.write('direct-node')"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "direct-node");
  assert.equal(result.stderr, "");
});
