import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { approximateTokens, compareUtf8 } from "../skills/dude-pack-technical-docs-runtime/scripts/lib/runtime.mjs";
import {
  assertNoAdjacentTemps,
  canCreateSymlink,
  canEnforceUnreadableFile,
  captureOutput,
  makeTempRoot,
  runNode,
  sha256,
  writeFixture,
} from "./helpers/harness.mjs";

const SCRIPTS = new URL("../skills/dude-pack-technical-docs-runtime/scripts/", import.meta.url);
const SOURCE_MANIFEST = fileURLToPath(new URL("source-manifest.mjs", SCRIPTS));
const REPO_INVENTORY = fileURLToPath(new URL("repo-inventory.mjs", SCRIPTS));

/** Register one repository (plus optional extra sources) and return the registry path. */
function register(root, options = {}) {
  const workdir = options.workdir ?? ".td-work";
  const registryPath = join(root, workdir, "sources.json");
  const result = runNode(SOURCE_MANIFEST, [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, workdir),
    "--output", join(root, options.output ?? "output.md"),
    "--repo", join(root, options.repo ?? "."),
    ...(options.extraSources ?? []),
    ...(options.limits ?? []),
    "--out", registryPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return registryPath;
}

/** Invoke repo-inventory.mjs with the standard argument shape. */
function inventory(root, registryPath, options = {}) {
  return runNode(REPO_INVENTORY, [
    "--workspace-root", options.workspaceRoot ?? root,
    "--sources", registryPath,
    "--source", options.source ?? "S001",
    "--start", options.start ?? "1",
    "--out", join(root, options.out ?? ".td-work/inventory.json"),
  ]);
}

function readInventory(root, relativePath = ".td-work/inventory.json") {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

/** Index accounting entries by path so a test can assert one disposition per path. */
function dispositions(record) {
  return new Map(record.accounting.map((entry) => [entry.path, entry]));
}

function totalsFromAccounting(accounting) {
  const totals = { encountered: accounting.length, admitted: 0, skipped: 0, rejected: 0 };
  for (const entry of accounting) totals[entry.disposition]++;
  return totals;
}

test("creation order changes neither accounting, repository digest, nor work units", (context) => {
  const build = (order) => {
    const root = makeTempRoot(context);
    for (const [path, content] of order) writeFixture(root, path, content);
    const result = inventory(root, register(root));
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(join(root, ".td-work/inventory.json"));
  };

  const files = [
    ["src/index.mjs", "export const answer = 42;\nexport default answer;\n"],
    ["src/lib/util.mjs", "export const identity = (value) => value;\n"],
    ["docs/guide.md", "# Guide\n\nProse.\n"],
    ["README.md", "# Project\n"],
  ];
  const forward = build(files);
  const reverse = build([...files].reverse());
  assert.deepEqual(forward, reverse, "creation order changed the persisted inventory");

  const record = JSON.parse(forward.toString("utf8"));
  assert.equal(record.schemaVersion, 2);
  assert.equal(record.complete, true);
  assert.deepEqual(record.limitHits, []);
  assert.match(record.repositoryDigest, /^[0-9a-f]{64}$/);
});

test("every ordinary implementation file is accounted, hashed, and represented by R* units", (context) => {
  const root = makeTempRoot(context);
  const sources = {
    "src/index.mjs": "export const answer = 42;\nexport default answer;\n",
    "src/lib/util.mjs": "export const identity = (value) => value;\n",
    "docs/guide.md": "# Guide\n\nProse.\n",
    "README.md": "# Project\n",
    "package.json": '{\n  "name": "fixture"\n}\n',
  };
  for (const [path, content] of Object.entries(sources)) writeFixture(root, path, content);
  writeFixture(root, "assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFixture(root, "empty.md", "");
  writeFixture(root, "node_modules/dependency/index.mjs", "export default 1;\n");

  const result = inventory(root, register(root));
  assert.equal(result.status, 0, result.stderr);
  const record = readInventory(root);
  const byPath = dispositions(record);

  assert.equal(record.rootRef, "@root");
  assert.equal(byPath.size, record.accounting.length, "a path was accounted more than once");
  for (const [path, content] of Object.entries(sources)) {
    const entry = byPath.get(path);
    assert.ok(entry !== undefined, `ordinary file disappeared from accounting: ${path}`);
    assert.equal(entry.disposition, "admitted", path);
    assert.equal(entry.pathType, "file");
    assert.equal(entry.sizeBytes, Buffer.byteLength(content));
    assert.equal(entry.sha256, sha256(content));
    assert.ok(Array.isArray(entry.unitIds) && entry.unitIds.length > 0, `admitted file has no work unit: ${path}`);
    assert.equal(Object.hasOwn(entry, "reason"), false, "an admitted entry must not carry a reason");
  }

  assert.equal(byPath.get("assets/logo.png").disposition, "skipped");
  assert.equal(byPath.get("assets/logo.png").reason, "non-text-file");
  assert.equal(byPath.get("empty.md").reason, "empty-file");
  assert.equal(byPath.get("node_modules").reason, "ignored-directory");
  assert.equal(byPath.has("node_modules/dependency/index.mjs"), false, "a skipped directory must not be traversed");
  assert.equal(byPath.get("src").disposition, "admitted");
  assert.equal(byPath.get("src").pathType, "directory");

  const members = record.workUnits.flatMap((unit) => unit.members);
  for (const path of Object.keys(sources)) {
    const owned = members.filter((member) => member.path === path);
    assert.ok(owned.length > 0, `no member slice covers ${path}`);
    assert.equal(owned[0].sha256, byPath.get(path).sha256);
    assert.match(owned[0].sourceRef, new RegExp(`^@root:${path.replace(/[.]/g, "\\.")}#L\\d+-L\\d+$`));
  }
  assert.deepEqual(record.workUnits.map((unit) => unit.id), ["R001"]);
  assert.equal(record.startOrdinal, 1);
  assert.equal(record.nextOrdinal, 2);
  assert.ok(record.workUnits[0].approximateTokens > 0);
  assert.match(record.workUnits[0].digest, /^[0-9a-f]{64}$/);

  assert.equal(record.totals.encountered, record.accounting.length);
  assert.deepEqual(
    { ...totalsFromAccounting(record.accounting) },
    {
      encountered: record.totals.encountered,
      admitted: record.totals.admitted,
      skipped: record.totals.skipped,
      rejected: record.totals.rejected,
    }
  );
  assert.equal(
    record.totals.candidateBytes,
    Object.values(sources).reduce((total, content) => total + Buffer.byteLength(content), 0)
  );
  assert.equal(record.totals.rejected, 0);
});

test("every encountered path carries exactly one disposition and no ordinary file disappears", (context) => {
  const root = makeTempRoot(context);
  const admittedFiles = {
    ".gitignore": "node_modules\n",
    "Makefile": "all:\n\techo build\n",
    "README.md": "# Project\n",
    "docs/guide.md": "# Guide\n\nProse.\n",
    "src/index.mjs": "export const answer = 42;\n",
    "src/lib/util.mjs": "export const identity = (value) => value;\n",
  };
  for (const [path, content] of Object.entries(admittedFiles)) writeFixture(root, path, content);
  writeFixture(root, "assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFixture(root, "assets/.keep", "keep\n");
  writeFixture(root, "empty.md", "");
  writeFixture(root, ".hidden/secret.md", "# Hidden\n");
  writeFixture(root, "node_modules/dependency/index.mjs", "export default 1;\n");
  // One line larger than the default 3000-token unit budget: a whole-file skip that must
  // still take exactly one disposition and must not disturb completeness.
  writeFixture(root, "oversized.md", `${"x".repeat(12001)}\n`);

  const result = inventory(root, register(root));
  assert.equal(result.status, 0, result.stderr);
  const record = readInventory(root);

  // Closed set: accounting is exactly the direct children of the root and of every
  // directory the traversal descended into, in normalized path order.
  const descended = ["", ...record.accounting
    .filter((entry) => entry.pathType === "directory" && entry.disposition === "admitted")
    .map((entry) => entry.path)];
  const encountered = new Set();
  for (const directory of descended) {
    for (const name of readdirSync(join(root, directory))) {
      encountered.add(directory === "" ? name : `${directory}/${name}`);
    }
  }
  assert.deepEqual(
    record.accounting.map((entry) => entry.path),
    [...encountered].sort(compareUtf8),
    "accounting is not exactly the encountered path set in normalized order"
  );

  const byPath = dispositions(record);
  assert.equal(byPath.size, record.accounting.length, "a path was accounted more than once");
  for (const entry of record.accounting) {
    assert.ok(["admitted", "skipped", "rejected"].includes(entry.disposition), entry.path);
    if (entry.disposition !== "admitted") {
      assert.deepEqual(Object.keys(entry), ["path", "pathType", "disposition", "reason"], entry.path);
    } else if (entry.pathType === "file") {
      assert.deepEqual(
        Object.keys(entry),
        ["path", "pathType", "disposition", "sizeBytes", "sha256", "unitIds"],
        entry.path
      );
    } else {
      assert.deepEqual(Object.keys(entry), ["path", "pathType", "disposition"], entry.path);
    }
  }

  for (const [path, content] of Object.entries(admittedFiles)) {
    const entry = byPath.get(path);
    assert.equal(entry?.disposition, "admitted", `an ordinary file was not admitted: ${path}`);
    assert.equal(entry.sha256, sha256(content), path);
  }
  assert.equal(byPath.get("assets/.keep").reason, "non-text-file");
  assert.equal(byPath.get("assets/logo.png").reason, "non-text-file");
  assert.equal(byPath.get("empty.md").reason, "empty-file");
  assert.equal(byPath.get("oversized.md").disposition, "skipped");
  assert.equal(byPath.get("oversized.md").reason, "oversized-line");
  assert.equal(byPath.get(".hidden").reason, "dot-directory");
  assert.equal(byPath.get("node_modules").reason, "ignored-directory");
  assert.equal(byPath.get(".td-work").reason, "work-directory");
  assert.equal(byPath.has(".hidden/secret.md"), false, "a skipped directory must not be traversed");
  assert.equal(byPath.has("node_modules/dependency"), false, "a skipped directory must not be traversed");

  assert.deepEqual(totalsFromAccounting(record.accounting), {
    encountered: record.totals.encountered,
    admitted: record.totals.admitted,
    skipped: record.totals.skipped,
    rejected: record.totals.rejected,
  });
  assert.equal(record.totals.files + record.totals.directories + record.totals.symlinks, record.totals.encountered);
  assert.equal(
    record.totals.candidateBytes,
    Object.values(admittedFiles).reduce((total, content) => total + Buffer.byteLength(content), 0)
  );
  assert.equal(record.complete, true);
});

test("a candidate file that cannot be decoded is rejected, never silently omitted", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  writeFixture(root, "src/broken.md", Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));

  const result = inventory(root, register(root));
  assert.equal(result.status, 1, result.stderr);
  const record = readInventory(root);
  const entry = dispositions(record).get("src/broken.md");
  assert.equal(entry?.pathType, "file", "an undecodable candidate disappeared from accounting");
  assert.equal(entry.disposition, "rejected");
  assert.equal(entry.reason, "invalid-utf8");
  assert.deepEqual(Object.keys(entry), ["path", "pathType", "disposition", "reason"]);
  assert.equal(record.complete, false);
  assert.equal(record.totals.rejected, 1);
  assert.equal(record.totals.candidateBytes, Buffer.byteLength("export default 1;\n"));
  assert.equal(
    record.workUnits.flatMap((unit) => unit.members).some((member) => member.path === "src/broken.md"),
    false,
    "an undecodable file must never become unit content"
  );
});

test("work directory, declared output, and prior inventory output are skipped, never re-ingested", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  const registryPath = register(root, { workdir: "work" });
  writeFixture(root, "output.md", "# Prior output\n");

  const first = inventory(root, registryPath, { out: "inventory.json" });
  assert.equal(first.status, 0, first.stderr);
  const second = inventory(root, registryPath, { out: "inventory.json" });
  assert.equal(second.status, 0, second.stderr);
  const afterSecond = readFileSync(join(root, "inventory.json"));
  const third = inventory(root, registryPath, { out: "inventory.json" });
  assert.equal(third.status, 0, third.stderr);
  assert.deepEqual(
    readFileSync(join(root, "inventory.json")),
    afterSecond,
    "a prior inventory must be accounted identically on every later run"
  );

  const record = readInventory(root, "inventory.json");
  const byPath = dispositions(record);
  assert.equal(byPath.get("work").disposition, "skipped");
  assert.equal(byPath.get("work").reason, "work-directory");
  assert.equal(byPath.has("work/sources.json"), false, "the work directory must not be traversed");
  assert.equal(byPath.get("output.md").disposition, "skipped");
  assert.equal(byPath.get("output.md").reason, "output-path");
  assert.equal(byPath.get("inventory.json").disposition, "skipped");
  assert.equal(byPath.get("inventory.json").reason, "inventory-output");
  assert.equal(record.complete, true);
  assertNoAdjacentTemps(join(root, "inventory.json"));
});

test("a contained descendant symlink is an accounted skip and never contributes content", (context) => {
  const root = makeTempRoot(context);
  if (!canCreateSymlink(root)) return;
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  symlinkSync(join(root, "src/index.mjs"), join(root, "alias.mjs"), "file");

  const result = inventory(root, register(root));
  assert.equal(result.status, 0, result.stderr);
  const record = readInventory(root);
  const entry = dispositions(record).get("alias.mjs");
  assert.equal(entry.pathType, "symlink");
  assert.equal(entry.disposition, "skipped");
  assert.equal(entry.reason, "contained-symlink");
  assert.equal(record.complete, true);
  assert.equal(record.totals.symlinks, 1);
  assert.equal(
    record.workUnits.flatMap((unit) => unit.members).some((member) => member.path === "alias.mjs"),
    false,
    "a symlink must never become unit content"
  );
});

test("an escaping or dangling descendant symlink is rejected and makes the inventory incomplete", (context) => {
  const outside = makeTempRoot(context);
  writeFixture(outside, "secret.mjs", "export default 'secret';\n");
  const root = makeTempRoot(context);
  if (!canCreateSymlink(root)) return;
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  symlinkSync(join(outside, "secret.mjs"), join(root, "escape.mjs"), "file");
  symlinkSync(join(root, "missing.mjs"), join(root, "dangling.mjs"), "file");

  const result = inventory(root, register(root));
  assert.equal(result.status, 1, result.stderr);
  const record = readInventory(root);
  const byPath = dispositions(record);
  assert.equal(byPath.get("escape.mjs").disposition, "rejected");
  assert.equal(byPath.get("escape.mjs").reason, "escaping-symlink");
  assert.equal(byPath.get("dangling.mjs").disposition, "rejected");
  assert.equal(byPath.get("dangling.mjs").reason, "unresolvable-symlink");
  assert.equal(record.complete, false);
  assert.equal(record.totals.rejected, 2);
  assert.equal(
    record.workUnits.flatMap((unit) => unit.members).some((member) => member.path !== "src/index.mjs"),
    false,
    "no escaping path may reach a work unit"
  );
});

test("an unreadable admitted file is rejected instead of silently omitted", (context) => {
  const root = makeTempRoot(context);
  if (!canEnforceUnreadableFile(root)) return;
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  const locked = writeFixture(root, "src/locked.mjs", "export default 2;\n");
  const registryPath = register(root);
  chmodSync(locked, 0o000);

  const result = inventory(root, registryPath);
  chmodSync(locked, 0o600);
  assert.equal(result.status, 1, result.stderr);
  const record = readInventory(root);
  const entry = dispositions(record).get("src/locked.mjs");
  assert.equal(entry.disposition, "rejected");
  assert.equal(entry.reason, "unreadable-file");
  assert.equal(Object.hasOwn(entry, "sha256"), false, "a rejected file must not claim a content hash");
  assert.equal(record.complete, false);
});

test("exhausted traversal and allocation bounds report limit hits and refuse completeness", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "a.mjs", "export default 1;\n");
  writeFixture(root, "b.mjs", "export default 2;\n");
  writeFixture(root, "deep/nested/leaf.mjs", "export default 3;\n");

  const admittedLimit = register(root, {
    workdir: "work-admitted",
    limits: ["--limit-repository-admitted-files", "1"],
  });
  const admittedResult = inventory(root, admittedLimit, { out: "work-admitted/inventory.json" });
  assert.equal(admittedResult.status, 1, admittedResult.stderr);
  const admittedRecord = readInventory(root, "work-admitted/inventory.json");
  assert.deepEqual(admittedRecord.limitHits, ["repositoryAdmittedFiles"]);
  assert.equal(admittedRecord.complete, false);

  const depthLimit = register(root, {
    workdir: "work-depth",
    limits: ["--limit-repository-traversal-depth", "1"],
  });
  const depthResult = inventory(root, depthLimit, { out: "work-depth/inventory.json" });
  assert.equal(depthResult.status, 1, depthResult.stderr);
  const depthRecord = readInventory(root, "work-depth/inventory.json");
  assert.deepEqual(depthRecord.limitHits, ["repositoryTraversalDepth"]);
  assert.equal(dispositions(depthRecord).get("deep").disposition, "admitted");
  assert.equal(dispositions(depthRecord).get("deep/nested").reason, "traversal-depth-limit");
  assert.equal(dispositions(depthRecord).has("deep/nested/leaf.mjs"), false);
  assert.equal(depthRecord.complete, false);

  const unitLimit = register(root, {
    workdir: "work-units",
    limits: [
      "--limit-source-work-units", "1",
      "--limit-unit-approximate-tokens", "5",
      "--limit-unit-overlap-approximate-tokens", "0",
    ],
  });
  const unitResult = inventory(root, unitLimit, { out: "work-units/inventory.json", start: "1" });
  assert.equal(unitResult.status, 1, unitResult.stderr);
  const unitRecord = readInventory(root, "work-units/inventory.json");
  assert.deepEqual(unitRecord.limitHits, ["sourceWorkUnits"]);
  assert.deepEqual(unitRecord.workUnits, []);
  assert.equal(unitRecord.nextOrdinal, unitRecord.startOrdinal);
  assert.equal(unitRecord.complete, false);
  for (const entry of unitRecord.accounting.filter((item) => item.pathType === "file")) {
    assert.notEqual(entry.disposition, "admitted", "no file may be admitted without a work unit");
  }
});

test("a fresh contained output parent is created safely for a repository-only run", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  const registryPath = register(root);
  const out = ".td-work/fresh/nested/inventory.json";
  assert.equal(existsSync(join(root, ".td-work/fresh")), false);

  const result = inventory(root, registryPath, { out });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, out)), true);
  assert.equal(readInventory(root, out).complete, true);
  assertNoAdjacentTemps(join(root, out));
});

test("ordinal handoff honors --start and preserves the sequence for an empty repository", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  const started = inventory(root, register(root), { start: "7" });
  assert.equal(started.status, 0, started.stderr);
  const record = readInventory(root);
  assert.equal(record.startOrdinal, 7);
  assert.equal(record.nextOrdinal, 7 + record.workUnits.length);
  assert.deepEqual(record.workUnits.map((unit) => unit.id), ["R007"]);

  const empty = makeTempRoot(context);
  const emptyResult = inventory(empty, register(empty), { start: "12" });
  assert.equal(emptyResult.status, 0, emptyResult.stderr);
  const emptyRecord = readInventory(empty);
  assert.deepEqual(emptyRecord.workUnits, []);
  assert.equal(emptyRecord.startOrdinal, 12);
  assert.equal(emptyRecord.nextOrdinal, 12);
  assert.equal(emptyRecord.complete, true);
});

test("bounded units split at line boundaries and a file with an oversized line is an accounted skip", (context) => {
  const root = makeTempRoot(context);
  const line = "abcdefghi";
  writeFixture(root, "split.mjs", `${Array.from({ length: 8 }, () => line).join("\n")}\n`);
  const budget = [
    "--limit-unit-approximate-tokens", "5",
    "--limit-unit-overlap-approximate-tokens", "0",
  ];

  const result = inventory(root, register(root, { limits: budget }));
  assert.equal(result.status, 0, result.stderr);
  const record = readInventory(root);
  assert.equal(record.complete, true);
  assert.deepEqual(record.workUnits.map((unit) => unit.id), ["R001", "R002", "R003", "R004"]);
  assert.deepEqual(
    record.workUnits.map((unit) => unit.members.map((member) => [member.startLine, member.endLine])),
    [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]]]
  );
  for (const unit of record.workUnits) assert.ok(unit.approximateTokens <= 5, "a unit exceeded its budget");
  assert.deepEqual(dispositions(record).get("split.mjs").unitIds, ["R001", "R002", "R003", "R004"]);

  const oversized = makeTempRoot(context);
  writeFixture(oversized, "long.mjs", `${"x".repeat(30)}\n`);
  writeFixture(oversized, "short.mjs", "ok\n");
  const oversizedResult = inventory(oversized, register(oversized, { limits: budget }));
  assert.equal(oversizedResult.status, 0, oversizedResult.stderr);
  const oversizedRecord = readInventory(oversized);
  // An oversized line cannot be expressed by line-granular members, so the whole file is
  // an accounted skip that still leaves the inventory complete.
  assert.equal(oversizedRecord.complete, true);
  const oversizedEntry = dispositions(oversizedRecord).get("long.mjs");
  assert.deepEqual(Object.keys(oversizedEntry), ["path", "pathType", "disposition", "reason"]);
  assert.equal(oversizedEntry.disposition, "skipped");
  assert.equal(oversizedEntry.reason, "oversized-line");
  assert.deepEqual(
    oversizedRecord.workUnits.map((unit) => unit.members.map((member) => member.path)),
    [["short.mjs"]],
    "a file skipped for an oversized line must contribute no work unit"
  );
  for (const unit of oversizedRecord.workUnits) assert.ok(unit.approximateTokens <= 5);
});

test("no work unit repeats a digest or locator and every token count resolves to member bytes", (context) => {
  const root = makeTempRoot(context);
  // `oversized.mjs` holds one line larger than a whole unit budget: the exact input a hard
  // split would have represented by several byte-identical members. Its neighbours still
  // fill four units, including one that carries repeated line text and one that spans two
  // files, so no uniqueness assertion below can pass vacuously.
  writeFixture(root, "a.mjs", `${Array.from({ length: 13 }, (_, index) => `x${index % 10};`).join("\n")}\n`);
  writeFixture(root, "oversized.mjs", `${"y".repeat(25)}\n`);
  writeFixture(root, "z.mjs", "c1;\nc\u{1f600};\nc3;\n");

  const result = inventory(root, register(root, {
    limits: ["--limit-unit-approximate-tokens", "5", "--limit-unit-overlap-approximate-tokens", "0"],
  }));
  assert.equal(result.status, 0, result.stderr);
  const record = readInventory(root);

  const skipped = dispositions(record).get("oversized.mjs");
  assert.deepEqual(Object.keys(skipped), ["path", "pathType", "disposition", "reason"]);
  assert.equal(skipped.disposition, "skipped");
  assert.equal(skipped.reason, "oversized-line");
  assert.equal(record.complete, true);
  assert.deepEqual(record.workUnits.map((unit) => unit.id), ["R001", "R002", "R003", "R004"]);

  const digests = record.workUnits.map((unit) => unit.digest);
  assert.equal(new Set(digests).size, digests.length, "two work units share an identical digest");

  const members = record.workUnits.flatMap((unit) => unit.members);
  const locators = members.map((member) => member.sourceRef);
  assert.equal(new Set(locators).size, locators.length, "two work-unit members share an identical sourceRef");
  assert.equal(
    members.some((member) => member.path === "oversized.mjs"),
    false,
    "a file skipped for an oversized line must contribute no member"
  );

  const fileLines = (path) => {
    const lines = readFileSync(join(root, path), "utf8").split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  };

  for (const unit of record.workUnits) {
    const resolved = unit.members.map((member) => {
      const lines = fileLines(member.path);
      assert.ok(
        member.startLine >= 1 && member.startLine <= member.endLine && member.endLine <= lines.length,
        `${member.sourceRef} declares lines the file does not contain`
      );
      return lines.slice(member.startLine - 1, member.endLine).map((line) => `${line}\n`).join("");
    }).join("");
    assert.equal(unit.approximateTokens, approximateTokens(resolved), `${unit.id} misreports its token count`);
    assert.ok(unit.approximateTokens > 0 && unit.approximateTokens <= 5, `${unit.id} is outside the unit budget`);
  }

  for (const member of members) {
    const bytes = readFileSync(join(root, member.path));
    assert.equal(member.sizeBytes, bytes.length, member.sourceRef);
    assert.equal(member.sha256, sha256(bytes), member.sourceRef);
    assert.equal(member.sourceRef, `@root:${member.path}#L${member.startLine}-L${member.endLine}`);
  }

  // Represented once: member slices tile each admitted file's lines with no gap or repeat.
  for (const path of ["a.mjs", "z.mjs"]) {
    const owned = members.filter((member) => member.path === path);
    assert.deepEqual(
      owned.flatMap((member) =>
        Array.from({ length: member.endLine - member.startLine + 1 }, (_, offset) => member.startLine + offset)),
      Array.from({ length: fileLines(path).length }, (_, index) => index + 1),
      `member slices do not represent ${path} exactly once`
    );
  }
});

test("a nested repository keeps workspace-relative accounting and repository-relative references", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "repository/src/index.mjs", "export default 1;\n");
  writeFixture(root, "outside.mjs", "export default 2;\n");

  const result = inventory(root, register(root, { repo: "repository" }));
  assert.equal(result.status, 0, result.stderr);
  const record = readInventory(root);
  assert.equal(record.rootRef, "repository");
  const byPath = dispositions(record);
  assert.equal(byPath.get("repository/src/index.mjs").disposition, "admitted");
  assert.equal(byPath.has("outside.mjs"), false, "a path outside the repository must not be accounted");
  assert.equal(
    record.workUnits[0].members[0].sourceRef,
    "repository:src/index.mjs#L1-L1"
  );
});

test("invalid invocations fail closed before any inventory is written", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "notes.md", "notes\n");
  writeFixture(root, "repository/src/index.mjs", "export default 1;\n");
  const registryPath = register(root, {
    repo: "repository",
    extraSources: ["--notes", join(root, "notes.md")],
  });
  const outPath = join(root, ".td-work/inventory.json");
  const snapshot = captureOutput(outPath);

  const cases = [
    [["--source", "S001"], "invalid-source-kind"],
    [["--source", "S404"], "unknown-source"],
    [["--start", "01"], "invalid-integer"],
    [["--start", "0"], "integer-out-of-range"],
  ];
  for (const [override, code] of cases) {
    const args = [
      "--workspace-root", root,
      "--sources", registryPath,
      "--source", "S002",
      "--start", "1",
      "--out", outPath,
    ];
    for (let index = 0; index < args.length; index += 2) {
      if (args[index] === override[0]) args[index + 1] = override[1];
    }
    const result = runNode(REPO_INVENTORY, args);
    assert.equal(result.status, 2, `${override.join(" ")} did not fail closed: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`^${code}: `));
    assert.equal(existsSync(outPath), snapshot.exists, `${override.join(" ")} wrote an inventory`);
  }

  const unknownFlag = runNode(REPO_INVENTORY, [
    "--workspace-root", root,
    "--sources", registryPath,
    "--source", "S002",
    "--start", "1",
    "--max-files", "5000",
    "--out", outPath,
  ]);
  assert.equal(unknownFlag.status, 2, unknownFlag.stderr);
  assert.match(unknownFlag.stderr, /^unknown-option: /);
  assert.equal(existsSync(outPath), snapshot.exists);
});

test("a symlinked workspace root is refused before traversal", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "repository/src/index.mjs", "export default 1;\n");
  const registryPath = register(root, { repo: "repository" });
  if (!canCreateSymlink(root)) return;
  const linkParent = makeTempRoot(context);
  const link = join(linkParent, "root-alias");
  symlinkSync(root, link, "dir");

  const result = runNode(REPO_INVENTORY, [
    "--workspace-root", link,
    "--sources", registryPath,
    "--source", "S001",
    "--start", "1",
    "--out", join(root, ".td-work/inventory.json"),
  ]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^symlink-component: /);
  assert.equal(existsSync(join(root, ".td-work/inventory.json")), false);
});

test("a tampered registry cannot authorize repository traversal", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "src/index.mjs", "export default 1;\n");
  const registryPath = register(root);
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  registry.workspaceRoot = "..";
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const result = inventory(root, registryPath);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^invalid-registry-root: /);
  assert.equal(existsSync(join(root, ".td-work/inventory.json")), false);
});

test("an unreadable repository root fails before writing an inventory", (context) => {
  const root = makeTempRoot(context);
  writeFixture(root, "repository/src/index.mjs", "export default 1;\n");
  if (!canEnforceUnreadableFile(root)) return;
  const registryPath = register(root, { repo: "repository" });
  const repository = join(root, "repository");
  mkdirSync(join(root, ".td-work"), { recursive: true });
  chmodSync(repository, 0o000);

  const result = inventory(root, registryPath);
  chmodSync(repository, 0o700);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^unreadable-repository-root: /);
  assert.equal(existsSync(join(root, ".td-work/inventory.json")), false);
});
