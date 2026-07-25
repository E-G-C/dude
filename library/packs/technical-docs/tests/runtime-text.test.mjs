import assert from "node:assert/strict";
import test from "node:test";

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
