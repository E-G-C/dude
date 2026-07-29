import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RuntimeError,
  approximateTokens,
  assertUnicodeScalarString,
  canonicalJson,
  canonicalJsonLine,
  canonicalJsonl,
  compareUtf8,
  countCodePoints,
  createFenceState,
  sha256Bytes,
  sliceCodePoints,
  updateFenceState,
} from "../skills/dude-pack-technical-docs-runtime/scripts/lib/runtime.mjs";
import {
  assertNoAdjacentStages,
  assertNoAdjacentTemps,
  makeTempRoot,
  runNode,
  writeFixture,
} from "./helpers/harness.mjs";

const SOURCE_MANIFEST = fileURLToPath(
  new URL("../skills/dude-pack-technical-docs-runtime/scripts/source-manifest.mjs", import.meta.url)
);
const PREPROCESS = fileURLToPath(
  new URL("../skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs", import.meta.url)
);
const HEADINGS = fileURLToPath(
  new URL("../skills/dude-pack-technical-docs-runtime/scripts/headings.mjs", import.meta.url)
);
const CHUNK = fileURLToPath(
  new URL("../skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs", import.meta.url)
);

const TRANSCRIPT = [
  "WEBVTT",
  "Kind: captions",
  "",
  "NOTE this comment block is real structure",
  "and it continues here",
  "",
  "STYLE",
  "::cue { color: red }",
  "",
  "REGION",
  "id:speaker width:40%",
  "",
  "1",
  "00:00:01.000 --> 00:00:04.000",
  "<v Ann>NOTE taking is the transcript sentinel.</v>",
  "",
  "ba59-3f/51-0",
  "00:00:04.000 --> 00:00:07.500 align:start position:0%",
  "REGION coverage was the second topic.",
  "STYLE guidance <00:00:05.000>arrives last.",
  "",
].join("\n");

const DOCUMENT = [
  "---",
  "title: Guide",
  "---",
  "",
  "# Guide",
  "",
  "Guide intro carries the document sentinel.",
  "",
  "## Setup",
  "",
  "First setup body.",
  "",
  "### C#",
  "",
  "Language notes stay under the C# heading.",
  "",
  "```md",
  "# fenced heading text is not a heading",
  "```",
  "",
  "## Setup",
  "",
  "Second setup body.",
  "",
  "Legacy Title",
  "============",
  "",
  "~~~text",
  "## unclosed fence keeps this fenced",
  "",
].join("\n");

function registryPath(root) {
  return join(root, ".td-work/sources.json");
}

function register(root, args) {
  const result = runNode(SOURCE_MANIFEST, [
    "--workspace-root", root,
    "--workdir", join(root, ".td-work"),
    ...args,
    "--out", registryPath(root),
  ]);
  assert.equal(result.status, 0, result.stderr);
  return registryPath(root);
}

function preprocess(root, sourceId, base, extra = []) {
  return runNode(PREPROCESS, [
    "--workspace-root", root,
    "--sources", registryPath(root),
    "--source", sourceId,
    "--out", join(root, `.td-work/${base}.txt`),
    "--json", join(root, `.td-work/${base}.json`),
    ...extra,
  ]);
}

function extractHeadings(root, sourceId, base) {
  return runNode(HEADINGS, [
    "--workspace-root", root,
    "--sources", registryPath(root),
    "--source", sourceId,
    "--out", join(root, `.td-work/${base}.json`),
  ]);
}

function chunk(root, sourceId, start, inputFlag, inputBase, outdir) {
  return runNode(CHUNK, [
    "--workspace-root", root,
    "--sources", registryPath(root),
    "--source", sourceId,
    "--start", String(start),
    inputFlag, join(root, `.td-work/${inputBase}.json`),
    "--outdir", join(root, `.td-work/${outdir}`),
  ]);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

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

function expectFailure(result, code) {
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, new RegExp(`^${code}: `));
}

test("Unicode scalar validation rejects lone surrogates", () => {
  assert.equal(assertUnicodeScalarString("A\ud83d\ude00B"), "A\ud83d\ude00B");
  expectRuntimeError(() => assertUnicodeScalarString("\ud83d"), "invalid-unicode-scalar");
  expectRuntimeError(() => assertUnicodeScalarString("\ude00"), "invalid-unicode-scalar");
  expectRuntimeError(() => assertUnicodeScalarString(1), "invalid-string");
});

test("code-point counting and slicing preserve non-BMP boundaries", () => {
  const text = "A\ud83d\ude00B\ud801\udc37C";
  assert.equal(text.length, 7);
  assert.equal(countCodePoints(text), 5);
  assert.equal(sliceCodePoints(text, 0, 5), text);
  assert.equal(sliceCodePoints(text, 1, 2), "\ud83d\ude00");
  assert.equal(sliceCodePoints(text, 2, 4), "B\ud801\udc37");
  assert.equal(sliceCodePoints(text, 4), "C");
  expectRuntimeError(() => sliceCodePoints(text, -1, 1), "invalid-code-point-offset");
  expectRuntimeError(() => sliceCodePoints(text, 3, 2), "invalid-code-point-offset");
});

test("approximate tokens use ceil(code points divided by four)", () => {
  assert.equal(approximateTokens(""), 0);
  assert.equal(approximateTokens("abcd"), 1);
  assert.equal(approximateTokens("abcde"), 2);
  assert.equal(approximateTokens("\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00"), 1);
  assert.equal(approximateTokens("\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00"), 2);
});

test("UTF-8 byte ordering is deterministic and locale independent", () => {
  const values = ["\u00e9", "\ud83d\ude00", "z", "a"];
  values.sort(compareUtf8);
  assert.deepEqual(values, ["a", "z", "\u00e9", "\ud83d\ude00"]);
  assert.ok(compareUtf8("a", "a") === 0);
  assert.ok(compareUtf8("a", "aa") < 0);
});

test("canonical JSON preserves declared field order and exact framing", () => {
  const value = { schemaVersion: 2, id: "S001", nested: { second: 2, first: 1 } };
  assert.equal(
    canonicalJson(value),
    "{\n  \"schemaVersion\": 2,\n  \"id\": \"S001\",\n  \"nested\": {\n    \"second\": 2,\n    \"first\": 1\n  }\n}\n"
  );
  assert.equal(canonicalJsonLine({ id: "C001-F001", text: "fact" }), "{\"id\":\"C001-F001\",\"text\":\"fact\"}");
});

test("canonical sorted serialization is independent of insertion order", () => {
  const left = { z: 3, a: { y: 2, x: 1 } };
  const right = { a: { x: 1, y: 2 }, z: 3 };
  assert.equal(canonicalJson(left, { sortKeys: true }), canonicalJson(right, { sortKeys: true }));
  assert.equal(
    canonicalJson(left, { sortKeys: true }),
    "{\n  \"a\": {\n    \"x\": 1,\n    \"y\": 2\n  },\n  \"z\": 3\n}\n"
  );
});

test("canonical JSONL is compact, object-only, dense, and newline terminated", () => {
  const records = [{ id: "C001-F001" }, { id: "C001-F002", text: "\ud83d\ude00" }];
  const text = canonicalJsonl(records, { requireNonempty: true });
  assert.equal(text, "{\"id\":\"C001-F001\"}\n{\"id\":\"C001-F002\",\"text\":\"\ud83d\ude00\"}\n");
  assert.equal(sha256Bytes(text), sha256Bytes(Buffer.from(text, "utf8")));
  expectRuntimeError(() => canonicalJsonl([], { requireNonempty: true }), "empty-jsonl");
  expectRuntimeError(() => canonicalJsonLine(["not", "an", "object"]), "invalid-record");
  const sparse = [];
  sparse.length = 1;
  expectRuntimeError(() => canonicalJsonl(sparse), "sparse-array");
  expectRuntimeError(() => canonicalJson({ value: Number.NaN }), "invalid-json-number");
  expectRuntimeError(() => canonicalJson({ value: "\ud83d" }), "invalid-unicode-scalar");
});

test("matching backtick fences close at equal or greater marker length", () => {
  const equalState = createFenceState();
  assert.deepEqual(updateFenceState(equalState, "```js", 1), {
    type: "open", marker: "`", length: 3, line: 1, info: "js",
  });
  assert.deepEqual(updateFenceState(equalState, "```", 2), {
    type: "close", marker: "`", length: 3, line: 2, openLine: 1,
  });
  assert.equal(equalState.open, false);

  const longerState = createFenceState();
  updateFenceState(longerState, "```", 4);
  assert.equal(updateFenceState(longerState, "````", 5)?.type, "close");
});

test("fence closers require the opener marker and sufficient length", () => {
  const state = createFenceState();
  updateFenceState(state, "~~~~ text", 1);
  assert.equal(updateFenceState(state, "~~~", 2), null);
  assert.equal(updateFenceState(state, "````", 3), null);
  assert.equal(updateFenceState(state, "~~~~ trailing", 4), null);
  assert.equal(state.open, true);
  assert.equal(updateFenceState(state, "~~~~~", 5)?.type, "close");
  assert.equal(state.open, false);
});

test("fences accept zero through three spaces of indentation only", () => {
  for (let indentation = 0; indentation <= 3; indentation++) {
    const state = createFenceState();
    assert.equal(updateFenceState(state, `${" ".repeat(indentation)}~~~`, 1)?.type, "open");
    assert.equal(updateFenceState(state, `${" ".repeat(indentation)}~~~`, 2)?.type, "close");
  }
  const state = createFenceState();
  assert.equal(updateFenceState(state, "    ```", 1), null);
  assert.equal(state.open, false);
});

test("unclosed and invalid backtick fences retain correct state", () => {
  const state = createFenceState();
  assert.equal(updateFenceState(state, "```lang`invalid", 1), null);
  assert.equal(state.open, false);
  updateFenceState(state, "```text", 2);
  assert.equal(updateFenceState(state, "content", 3), null);
  assert.deepEqual(state, { open: true, marker: "`", length: 3, line: 2, info: "text" });
});

test("each registered prose Source is processed independently with its own provenance", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "input.vtt", TRANSCRIPT);
  writeFixture(root, "notes.md", "Notes carry the notes sentinel.\n");
  writeFixture(root, "draft.md", "Draft carries the draft sentinel.\n");
  writeFixture(root, "document.md", DOCUMENT);
  register(root, [
    "--mode", "create",
    "--output", join(root, "output.md"),
    "--transcript", join(root, "input.vtt"),
    "--notes", join(root, "notes.md"),
    "--draft", join(root, "draft.md"),
    "--document", join(root, "document.md"),
  ]);

  const registry = readJson(registryPath(root));
  assert.deepEqual(registry.sources.map((source) => [source.id, source.kind, source.role, source.ref]), [
    ["S001", "transcript", "input", "input.vtt"],
    ["S002", "notes", "input", "notes.md"],
    ["S003", "draft", "input", "draft.md"],
    ["S004", "document", "input", "document.md"],
  ]);

  const sentinels = { S001: "transcript sentinel", S002: "notes sentinel", S003: "draft sentinel" };
  const allocated = [];
  let start = 1;
  for (const [id, kind] of [["S001", "transcript"], ["S002", "notes"], ["S003", "draft"]]) {
    const cleaned = preprocess(root, id, `${id}-clean`);
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(readJson(join(root, `.td-work/${id}-clean.json`)).sourceId, id);

    const chunked = chunk(root, id, start, "--preprocess", `${id}-clean`, `units-${id}`);
    assert.equal(chunked.status, 0, chunked.stderr);
    const manifest = readJson(join(root, `.td-work/units-${id}/chunks.json`));
    assert.equal(manifest.sourceId, id);
    assert.equal(manifest.sourceKind, kind);
    assert.equal(manifest.sourceSha256, registry.sources.find((source) => source.id === id).sha256);
    assert.equal(manifest.prefix, "C");
    assert.equal(manifest.startOrdinal, start);
    assert.equal(manifest.nextOrdinal, start + manifest.units.length);
    assert.ok(manifest.units.length > 0, `${id} produced no units`);

    for (const unit of manifest.units) {
      allocated.push(unit.id);
      assert.match(unit.sourceRef, new RegExp(`^${registry.sources.find((source) => source.id === id).ref}#L\\d+-L\\d+$`));
      assert.equal(Object.hasOwn(unit, "headingPath"), false, "C* units must not carry a heading path");
      const text = readFileSync(join(root, unit.file), "utf8");
      assert.ok(text.includes(sentinels[id]), `${unit.id} lost its own source content`);
      for (const [otherId, sentinel] of Object.entries(sentinels)) {
        if (otherId !== id) assert.equal(text.includes(sentinel), false, `${unit.id} absorbed ${otherId} content`);
      }
    }
    start = manifest.nextOrdinal;
  }
  assert.deepEqual(allocated, Array.from({ length: start - 1 }, (unused, index) => `C${String(index + 1).padStart(3, "0")}`));

  // The E* sequence is independent of the C* sequence and restarts at 1.
  assert.equal(extractHeadings(root, "S004", "S004-headings").status, 0);
  const documentUnits = chunk(root, "S004", 1, "--headings", "S004-headings", "units-S004");
  assert.equal(documentUnits.status, 0, documentUnits.stderr);
  const documentManifest = readJson(join(root, ".td-work/units-S004/chunks.json"));
  assert.equal(documentManifest.prefix, "E");
  assert.equal(documentManifest.sourceId, "S004");
  assert.equal(documentManifest.startOrdinal, 1);
  assert.equal(documentManifest.units[0].id, "E001");
  for (const unit of documentManifest.units) {
    assert.match(unit.sourceRef, /^document\.md:.+#L\d+-L\d+$/);
  }
});

test("an update-target document keeps its own identity beside independent notes", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "document.md", DOCUMENT);
  writeFixture(root, "notes.md", "Notes sentinel for the update flow.\n");
  register(root, [
    "--mode", "update",
    "--output", join(root, "document.md"),
    "--update-document", join(root, "document.md"),
    "--notes", join(root, "notes.md"),
  ]);

  const registry = readJson(registryPath(root));
  assert.deepEqual(registry.sources.map((source) => [source.id, source.kind, source.role, source.ref]), [
    ["S001", "notes", "input", "notes.md"],
    ["S002", "document", "update-target", "document.md"],
  ]);
  assert.equal(registry.output.updateSourceId, "S002");

  assert.equal(preprocess(root, "S001", "notes-clean").status, 0);
  assert.equal(chunk(root, "S001", 1, "--preprocess", "notes-clean", "units-notes").status, 0);
  assert.equal(extractHeadings(root, "S002", "document-headings").status, 0);
  assert.equal(chunk(root, "S002", 1, "--headings", "document-headings", "units-document").status, 0);

  const notes = readJson(join(root, ".td-work/units-notes/chunks.json"));
  const document = readJson(join(root, ".td-work/units-document/chunks.json"));
  assert.equal(notes.sourceId, "S001");
  assert.equal(document.sourceId, "S002");
  assert.notEqual(notes.sourceSha256, document.sourceSha256);
  assert.equal(notes.units[0].sourceRef.startsWith("notes.md#"), true);
  assert.equal(document.units[0].sourceRef.startsWith("document.md:"), true);
  // The update target is registered as a document Source and never as prose.
  expectFailure(preprocess(root, "S002", "invalid"), "unsupported-source-kind");
});

test("WEBVTT intake removes real reserved blocks and keeps reserved-word cue text", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "input.vtt", TRANSCRIPT);
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--transcript", join(root, "input.vtt")]);

  const result = preprocess(root, "S001", "clean");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, ".td-work/clean.txt"), "utf8"), [
    "NOTE taking is the transcript sentinel.",
    "",
    "REGION coverage was the second topic.",
    "STYLE guidance arrives last.",
    "",
  ].join("\n"));

  const manifest = readJson(join(root, ".td-work/clean.json"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.counts, {
    inputLines: 20,
    outputLines: 4,
    removedTimestamps: 3,
    removedCueIds: 2,
    removedTags: 2,
    removedReservedBlocks: 3,
  });
  assert.deepEqual(manifest.lineMap, [
    { outputStartLine: 1, outputEndLine: 2, sourceStartLine: 15, sourceEndLine: 16 },
    { outputStartLine: 3, outputEndLine: 4, sourceStartLine: 19, sourceEndLine: 20 },
  ]);
});

test("notes and drafts retain their text apart from newline normalization", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "notes.md", "alpha\r\n\r\n  indented  \r\nNOTE: keep this line.\r\n");
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--notes", join(root, "notes.md")]);

  assert.equal(preprocess(root, "S001", "clean").status, 0);
  assert.equal(
    readFileSync(join(root, ".td-work/clean.txt"), "utf8"),
    "alpha\n\n  indented  \nNOTE: keep this line.\n"
  );
  const manifest = readJson(join(root, ".td-work/clean.json"));
  assert.deepEqual(manifest.counts, {
    inputLines: 4,
    outputLines: 4,
    removedTimestamps: 0,
    removedCueIds: 0,
    removedTags: 0,
    removedReservedBlocks: 0,
  });
  assert.deepEqual(manifest.lineMap, [
    { outputStartLine: 1, outputEndLine: 4, sourceStartLine: 1, sourceEndLine: 4 },
  ]);
});

test("heading paths stay hierarchical, keep C#, and exclude fenced heading text", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "document.md", DOCUMENT);
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--document", join(root, "document.md")]);

  const result = extractHeadings(root, "S001", "headings");
  assert.equal(result.status, 0, result.stderr);
  const manifest = readJson(join(root, ".td-work/headings.json"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.sourceId, "S001");
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.headings, [
    { level: 1, text: "Guide", path: "Guide", startLine: 5, endLine: 24 },
    { level: 2, text: "Setup", path: "Guide > Setup", startLine: 9, endLine: 20 },
    { level: 3, text: "C#", path: "Guide > Setup > C#", startLine: 13, endLine: 20 },
    { level: 2, text: "Setup", path: "Guide > Setup", startLine: 21, endLine: 24 },
    { level: 1, text: "Legacy Title", path: "Legacy Title", startLine: 25, endLine: 29 },
  ]);
});

test("E* units stay inside one heading and carry that heading path", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "document.md", DOCUMENT);
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--document", join(root, "document.md")]);
  assert.equal(extractHeadings(root, "S001", "headings").status, 0);
  assert.equal(chunk(root, "S001", 1, "--headings", "headings", "units").status, 0);

  const headingManifest = readJson(join(root, ".td-work/headings.json"));
  const manifest = readJson(join(root, ".td-work/units/chunks.json"));
  const regions = headingManifest.headings.map((heading, index) => ({
    path: heading.path,
    startLine: heading.startLine,
    endLine: index + 1 < headingManifest.headings.length
      ? headingManifest.headings[index + 1].startLine - 1
      : Number.MAX_SAFE_INTEGER,
  }));

  assert.equal(manifest.units.length, headingManifest.headings.length);
  for (const unit of manifest.units) {
    const region = regions.find((candidate) => (
      candidate.path === unit.headingPath
      && unit.cleanRange.startLine >= candidate.startLine
      && unit.cleanRange.endLine <= candidate.endLine
    ));
    assert.ok(region !== undefined, `${unit.id} crossed a heading boundary`);
    assert.deepEqual(unit.sourceRange, unit.cleanRange);
    assert.equal(unit.sourceRef, `document.md:${unit.headingPath}#L${unit.sourceRange.startLine}-L${unit.sourceRange.endLine}`);
  }
  // Fenced heading-like text stays with its own section instead of opening one.
  const fenced = manifest.units.find((unit) => unit.headingPath === "Guide > Setup > C#");
  assert.match(readFileSync(join(root, fenced.file), "utf8"), /# fenced heading text is not a heading/);
});

test("repeated and nested heading sections stay distinguishable in E* provenance", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "document.md", DOCUMENT);
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--document", join(root, "document.md")]);
  assert.equal(extractHeadings(root, "S001", "headings").status, 0);
  assert.equal(chunk(root, "S001", 1, "--headings", "headings", "units").status, 0);
  const manifest = readJson(join(root, ".td-work/units/chunks.json"));

  // Both `## Setup` sections share one heading path, so identity and line span must separate them.
  const repeated = manifest.units.filter((unit) => unit.headingPath === "Guide > Setup");
  assert.deepEqual(repeated.map((unit) => unit.id), ["E002", "E004"]);
  assert.deepEqual(repeated.map((unit) => unit.sourceRange), [
    { startLine: 9, endLine: 11 },
    { startLine: 21, endLine: 23 },
  ]);
  assert.deepEqual(repeated.map((unit) => unit.sourceRef), [
    "document.md:Guide > Setup#L9-L11",
    "document.md:Guide > Setup#L21-L23",
  ]);
  assert.notEqual(repeated[0].sha256, repeated[1].sha256);
  const [firstBody, secondBody] = repeated.map((unit) => readFileSync(join(root, unit.file), "utf8"));
  assert.match(firstBody, /First setup body\./);
  assert.equal(firstBody.includes("Second setup body."), false, "E002 absorbed the repeated section");
  assert.match(secondBody, /Second setup body\./);
  assert.equal(secondBody.includes("First setup body."), false, "E004 absorbed the repeated section");

  // The nested section keeps its own path, and `C#` survives into the locator.
  const nested = manifest.units.filter((unit) => unit.headingPath === "Guide > Setup > C#");
  assert.deepEqual(nested.map((unit) => unit.id), ["E003"]);
  assert.equal(nested[0].sourceRef, "document.md:Guide > Setup > C##L13-L19");
  const nestedBody = readFileSync(join(root, nested[0].file), "utf8");
  assert.match(nestedBody, /Language notes stay under the C# heading\./);
  for (const sibling of ["First setup body.", "Second setup body."]) {
    assert.equal(nestedBody.includes(sibling), false, "a nested section absorbed sibling content");
  }

  // Overlap is never carried across a heading boundary.
  for (const unit of manifest.units) {
    assert.equal(Object.hasOwn(unit, "overlapFrom"), false, `${unit.id} borrowed text across a heading boundary`);
  }
});

test("a mismatched fence closer keeps document headings fenced", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "document.md", [
    "# Top",
    "",
    "```text",
    "~~~",
    "## a mismatched closer does not reopen the document",
    "```",
    "",
    "## Real Heading",
    "",
    "Body.",
    "",
  ].join("\n"));
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--document", join(root, "document.md")]);

  const result = extractHeadings(root, "S001", "headings");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readJson(join(root, ".td-work/headings.json")).headings, [
    { level: 1, text: "Top", path: "Top", startLine: 1, endLine: 10 },
    { level: 2, text: "Real Heading", path: "Top > Real Heading", startLine: 8, endLine: 10 },
  ]);
});

test("chunk budgets include overlap and never split a non-BMP character", (context) => {
  const root = makeTempRoot(context);
  const emoji = "\u{1F600}".repeat(40);
  writeFixture(root, "notes.md", `alpha line\n${emoji}\nbeta line\ngamma line\n`);
  register(root, [
    "--mode", "create",
    "--output", join(root, "output.md"),
    "--notes", join(root, "notes.md"),
    "--limit-unit-approximate-tokens", "6",
    "--limit-unit-overlap-approximate-tokens", "2",
  ]);
  assert.equal(preprocess(root, "S001", "clean").status, 0);
  assert.equal(chunk(root, "S001", 1, "--preprocess", "clean", "units").status, 0);

  const manifest = readJson(join(root, ".td-work/units/chunks.json"));
  assert.deepEqual(manifest.budget, { approximateTokens: 6, overlapTokens: 2 });
  assert.ok(manifest.units.length > 1, "the fixture must exercise splitting");
  let overlapping = 0;
  for (const [index, unit] of manifest.units.entries()) {
    const text = readFileSync(join(root, unit.file), "utf8");
    assertUnicodeScalarString(text, { name: unit.id });
    assert.equal(countCodePoints(text), unit.codePoints);
    assert.equal(approximateTokens(text), unit.approximateTokens);
    assert.ok(unit.approximateTokens <= 6, `${unit.id} exceeded the unit budget including overlap`);
    assert.equal(sha256Bytes(text), unit.sha256);
    assert.equal(Buffer.byteLength(text, "utf8"), unit.sizeBytes);
    if (unit.overlapFrom !== undefined) {
      overlapping++;
      assert.equal(unit.overlapFrom, manifest.units[index - 1].id);
    }
  }
  assert.ok(overlapping > 0, "overlap ancestry was never recorded");
  // Every emoji survives intact across the split boundaries.
  const joined = manifest.units.map((unit) => readFileSync(join(root, unit.file), "utf8")).join("");
  assert.ok((joined.match(/\u{1F600}/gu) ?? []).length >= 40);
  assert.equal(/[\uD800-\uDFFF]/.test(joined.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")), false);
});

test("identical inputs produce identical relocatable intake artifacts", (context) => {
  const first = makeTempRoot(context);
  const second = makeTempRoot(context);
  const outputs = [];
  for (const root of [first, second]) {
    writeFixture(root, "input.vtt", TRANSCRIPT);
    writeFixture(root, "document.md", DOCUMENT);
    register(root, [
      "--mode", "create",
      "--output", join(root, "output.md"),
      "--transcript", join(root, "input.vtt"),
      "--document", join(root, "document.md"),
    ]);
    assert.equal(preprocess(root, "S001", "clean").status, 0);
    assert.equal(chunk(root, "S001", 1, "--preprocess", "clean", "units").status, 0);
    assert.equal(extractHeadings(root, "S002", "headings").status, 0);
    assert.equal(chunk(root, "S002", 1, "--headings", "headings", "existing").status, 0);
    outputs.push([
      readFileSync(join(root, ".td-work/clean.txt")),
      readFileSync(join(root, ".td-work/clean.json")),
      readFileSync(join(root, ".td-work/headings.json")),
      readFileSync(join(root, ".td-work/units/chunks.json")),
      readFileSync(join(root, ".td-work/existing/chunks.json")),
    ]);
  }
  assert.deepEqual(outputs[0], outputs[1], "identical inputs produced different artifacts");

  // Republishing the same units into the same directory is idempotent.
  const republished = chunk(first, "S001", 1, "--preprocess", "clean", "units");
  assert.equal(republished.status, 0, republished.stderr);
  assert.deepEqual(readFileSync(join(first, ".td-work/units/chunks.json")), outputs[0][3]);
  assertNoAdjacentStages(join(first, ".td-work/units"));
  assertNoAdjacentTemps(join(first, ".td-work/clean.txt"));
});

test("intake fails closed on unknown, mismatched, or drifting inputs", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "input.vtt", TRANSCRIPT);
  writeFixture(root, "notes.md", "Notes sentinel.\n");
  writeFixture(root, "document.md", DOCUMENT);
  register(root, [
    "--mode", "create",
    "--output", join(root, "output.md"),
    "--transcript", join(root, "input.vtt"),
    "--notes", join(root, "notes.md"),
    "--document", join(root, "document.md"),
  ]);
  assert.equal(preprocess(root, "S001", "clean").status, 0);
  assert.equal(preprocess(root, "S002", "notes-clean").status, 0);
  assert.equal(extractHeadings(root, "S003", "headings").status, 0);

  expectFailure(preprocess(root, "S009", "missing"), "unknown-source");
  expectFailure(preprocess(root, "S003", "wrong-kind"), "unsupported-source-kind");
  expectFailure(extractHeadings(root, "S001", "wrong-kind"), "unsupported-source-kind");
  assert.equal(existsSync(join(root, ".td-work/missing.txt")), false);
  assert.equal(existsSync(join(root, ".td-work/wrong-kind.json")), false);

  // A chunk command must receive the input that matches its Source kind.
  expectFailure(chunk(root, "S001", 1, "--headings", "headings", "invalid"), "invalid-unit-input");
  expectFailure(chunk(root, "S003", 1, "--preprocess", "clean", "invalid"), "invalid-unit-input");
  // A preprocessing manifest from another Source cannot authorize these units.
  expectFailure(chunk(root, "S001", 1, "--preprocess", "notes-clean", "invalid"), "manifest-source-mismatch");
  assert.equal(existsSync(join(root, ".td-work/invalid")), false);

  // Source drift after registration invalidates every intake command.
  writeFixture(root, "input.vtt", `${TRANSCRIPT}\nNew unregistered line.\n`);
  expectFailure(preprocess(root, "S001", "drifted"), "unexpected-byte-count");
  assert.equal(existsSync(join(root, ".td-work/drifted.txt")), false);
});

test("document content without heading provenance fails closed", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "document.md", "Unheaded preamble.\n\n# Later Heading\n\nBody.\n");
  register(root, ["--mode", "create", "--output", join(root, "output.md"), "--document", join(root, "document.md")]);
  assert.equal(extractHeadings(root, "S001", "headings").status, 0);

  expectFailure(chunk(root, "S001", 1, "--headings", "headings", "units"), "unheaded-document-content");
  assert.equal(existsSync(join(root, ".td-work/units")), false);
});
