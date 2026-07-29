import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoAdjacentTemps,
  assertOutputPreserved,
  canEnforceUnreadableFile,
  canResolveCaseInsensitivePath,
  captureOutput,
  makeTempRoot,
  readBytes,
  removeFixture,
  runNode,
  sha256,
  writeFixture,
} from "./helpers/harness.mjs";

const SCRIPTS = fileURLToPath(new URL("../skills/dude-pack-technical-docs-runtime/scripts/", import.meta.url));
const script = (name) => join(SCRIPTS, name);

const WORKDIR = ".td-work";
const REGISTRY = `${WORKDIR}/sources.json`;
const RESULTS_DIR = `${WORKDIR}/results`;
const FRAGMENTS_DIR = `${WORKDIR}/fragments`;
const INDEX = `${WORKDIR}/results.json`;
const LEDGER = `${WORKDIR}/ledger.jsonl`;

const NOTES = "Team notes\nShip the pipeline in two deterministic modes.\nIndex mode validates every declared fragment.\n";
// The third heading legitimately ends in "#", so its Document locator is
// "guide.md:Guide > Setup > C##L7-L9" and only an end-anchored parse is correct.
const GUIDE = "# Guide\n\n## Setup\n\nInstall the toolchain.\n\n### C#\n\nUse the C# analyzer for parity.\n";
const MODULE = "export const mode = \"index\";\n\nexport function merge(index) {\n  return index.results;\n}\n";

const ENTRY_TYPES = ["fact", "constraint", "parameter", "behavior", "interface"];

/** Serialize a fixture exactly the way the runtime's canonical JSON writer does. */
function canonicalJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Serialize a fixture exactly the way the runtime's canonical JSONL writer does. */
function canonicalJsonlText(records) {
  return records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

/** Split a locator the same way the runtime does: anchored at the end of the string. */
function splitLocator(locator) {
  const match = /#L([0-9]+)-L([0-9]+)$/.exec(locator);
  assert.notEqual(match, null, `locator has no trailing line span: ${locator}`);
  return { prefix: locator.slice(0, match.index), startLine: Number(match[1]), endLine: Number(match[2]) };
}

/** Register sources and run every intake command for the shared fixture workspace. */
function buildWorkspace(context) {
  const root = makeTempRoot(context, "technical-docs-jsonl-");
  writeFixture(root, "notes.md", NOTES);
  writeFixture(root, "guide.md", GUIDE);
  writeFixture(root, "repository/src/module.mjs", MODULE);

  const steps = [
    [script("source-manifest.mjs"), [
      "--workspace-root", root,
      "--mode", "create",
      "--workdir", join(root, WORKDIR),
      "--output", join(root, "output.md"),
      "--notes", join(root, "notes.md"),
      "--document", join(root, "guide.md"),
      "--repo", join(root, "repository"),
      "--out", join(root, REGISTRY),
    ]],
    [script("preprocess.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S001",
      "--out", join(root, `${WORKDIR}/S001/clean.txt`),
      "--json", join(root, `${WORKDIR}/S001/preprocess.json`),
    ]],
    [script("chunk.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S001",
      "--start", "1",
      "--preprocess", join(root, `${WORKDIR}/S001/preprocess.json`),
      "--outdir", join(root, `${WORKDIR}/units/S001`),
    ]],
    [script("headings.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S002",
      "--out", join(root, `${WORKDIR}/S002/headings.json`),
    ]],
    [script("chunk.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S002",
      "--start", "1",
      "--headings", join(root, `${WORKDIR}/S002/headings.json`),
      "--outdir", join(root, `${WORKDIR}/units/S002`),
    ]],
    [script("repo-inventory.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S003",
      "--start", "1",
      "--out", join(root, `${WORKDIR}/units/S003/inventory.json`),
    ]],
  ];
  for (const [command, args] of steps) {
    const result = runNode(command, args);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }

  return {
    root,
    manifests: [
      `${WORKDIR}/units/S001/chunks.json`,
      `${WORKDIR}/units/S002/chunks.json`,
      `${WORKDIR}/units/S003/inventory.json`,
    ],
  };
}

/** Derive every expected unit the intake manifests declare, in canonical order. */
function expectedUnits(workspace) {
  const units = [];
  for (const relativePath of workspace.manifests) {
    const manifest = readJson(workspace.root, relativePath);
    if (Object.hasOwn(manifest, "workUnits")) {
      for (const unit of manifest.workUnits) {
        units.push({
          unitId: unit.id,
          sourceId: manifest.sourceId,
          sourceKind: "repo",
          unitDigest: unit.digest,
          approximateTokens: unit.approximateTokens,
          examined: unit.members.map((member) => ({ sourceRef: member.sourceRef, sha256: member.sha256 })),
          locator: splitLocator(unit.members[0].sourceRef),
        });
      }
      continue;
    }
    for (const unit of manifest.units) {
      units.push({
        unitId: unit.id,
        sourceId: manifest.sourceId,
        sourceKind: manifest.sourceKind,
        unitDigest: unit.sha256,
        approximateTokens: unit.approximateTokens,
        examined: [{ sourceRef: unit.sourceRef, sha256: manifest.sourceSha256 }],
        locator: splitLocator(unit.sourceRef),
      });
    }
  }
  const rank = { C: 0, E: 1, R: 2 };
  units.sort((left, right) => (
    rank[left.unitId[0]] - rank[right.unitId[0]] || Number(left.unitId.slice(1)) - Number(right.unitId.slice(1))
  ));
  return units;
}

/** Build the deterministic evidence records one expected unit contributes. */
function evidenceFor(unit, position, entryCount) {
  const records = [];
  const spans = [
    `${unit.locator.prefix}#L${unit.locator.startLine}-L${unit.locator.startLine}`,
    `${unit.locator.prefix}#L${unit.locator.startLine}-L${unit.locator.endLine}`,
  ];
  const shapes = [
    { type: ENTRY_TYPES[position % ENTRY_TYPES.length], tag: position % 2 === 0 ? "overview" : "details" },
    { type: position % 2 === 0 ? "decision" : "action", tag: "routing" },
  ];
  for (let index = 0; index < entryCount; index++) {
    const shape = shapes[index];
    const record = {
      id: `${unit.unitId}-F${String(index + 1).padStart(3, "0")}`,
      text: `${unit.unitId} statement ${index + 1} for ${shape.tag}.`,
      type: shape.type,
      tag: shape.tag,
      "source-id": unit.sourceId,
      "source-kind": unit.sourceKind,
      "source-chunk": unit.unitId,
      "source-ref": spans[index],
    };
    if (position === 2 && index === 0) record.importance = "high";
    records.push(record);
  }
  return records;
}

/** Write one conventional result and its result-declared fragment. */
function writeUnitResult(workspace, unit, records) {
  const result = {
    schemaVersion: 2,
    unitId: unit.unitId,
    sourceId: unit.sourceId,
    unitDigest: unit.unitDigest,
    status: records.length === 0 ? "no-documentable-evidence" : "evidence",
    examined: unit.examined,
  };
  if (records.length === 0) {
    result.reason = `${unit.unitId} carries no documentable statement.`;
  } else {
    const fragmentPath = `${FRAGMENTS_DIR}/${unit.unitId}.jsonl`;
    const text = canonicalJsonlText(records);
    writeFixture(workspace.root, fragmentPath, text);
    result.fragment = {
      path: fragmentPath,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: sha256(text),
      entryCount: records.length,
    };
  }
  writeFixture(workspace.root, `${RESULTS_DIR}/${unit.unitId}.json`, canonicalJsonText(result));
  return result;
}

/** Write one conventional result per expected unit and return the merged ledger order. */
function writeResults(workspace, options = {}) {
  const units = expectedUnits(workspace);
  const ledger = [];
  units.forEach((unit, position) => {
    const entryCount = options.entryCounts?.[unit.unitId] ?? 2;
    const records = evidenceFor(unit, position, entryCount);
    writeUnitResult(workspace, unit, records);
    for (const record of records) ledger.push(record);
  });
  return { units, ledger };
}

function runIndex(workspace, extraArgs = []) {
  return runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "index",
    "--sources", join(workspace.root, REGISTRY),
    ...workspace.manifests.flatMap((relativePath) => ["--unit-manifest", join(workspace.root, relativePath)]),
    "--results-dir", join(workspace.root, RESULTS_DIR),
    "--out", join(workspace.root, INDEX),
    ...extraArgs,
  ]);
}

function runMerge(workspace, outRelativePath = LEDGER) {
  return runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "merge",
    "--index", join(workspace.root, INDEX),
    "--out", join(workspace.root, outRelativePath),
  ]);
}

function runAudit(workspace, thresholds = ["--min-entries", "2", "--floor-per-1k", "0", "--ratio", "0"]) {
  return runNode(script("extraction-audit.mjs"), [
    "--workspace-root", workspace.root,
    "--sources", join(workspace.root, REGISTRY),
    "--ledger", join(workspace.root, LEDGER),
    "--result-index", join(workspace.root, INDEX),
    ...thresholds,
    "--json", join(workspace.root, `${WORKDIR}/extraction.json`),
  ]);
}

function runDigest(workspace) {
  return runNode(script("ledger-digest.mjs"), [
    "--workspace-root", workspace.root,
    "--sources", join(workspace.root, REGISTRY),
    "--ledger", join(workspace.root, LEDGER),
    "--out", join(workspace.root, `${WORKDIR}/digest.md`),
    "--json", join(workspace.root, `${WORKDIR}/digest.json`),
  ]);
}

/** Build the workspace, write valid results, and produce a validated index and ledger. */
function preparedPipeline(context) {
  const workspace = buildWorkspace(context);
  const written = writeResults(workspace);
  const indexed = runIndex(workspace);
  assert.equal(indexed.status, 0, indexed.stderr);
  const merged = runMerge(workspace);
  assert.equal(merged.status, 0, merged.stderr);
  return { workspace, ...written };
}

test("complete manifests and exact conventional results produce a deterministic index and ledger", (context) => {
  const { workspace, units, ledger } = preparedPipeline(context);

  const index = readJson(workspace.root, INDEX);
  assert.equal(index.schemaVersion, 2);
  assert.deepEqual(Object.keys(index), ["schemaVersion", "sourceRegistry", "unitManifests", "results"]);
  assert.equal(index.sourceRegistry.path, "sources.json");
  assert.equal(index.sourceRegistry.sha256, sha256(readFileSync(join(workspace.root, REGISTRY))));
  assert.deepEqual(index.unitManifests.map((manifest) => manifest.sourceId), ["S001", "S002", "S003"]);
  assert.deepEqual(index.unitManifests.map((manifest) => manifest.path), [
    "units/S001/chunks.json",
    "units/S002/chunks.json",
    "units/S003/inventory.json",
  ]);
  assert.deepEqual(index.results.map((result) => result.unitId), units.map((unit) => unit.unitId));
  assert.deepEqual(index.results.map((result) => result.path), units.map((unit) => `results/${unit.unitId}.json`));
  for (const result of index.results) {
    assert.equal(result.sha256, sha256(readFileSync(join(workspace.root, `${RESULTS_DIR}/${result.unitId}.json`))));
  }

  const ledgerText = readFileSync(join(workspace.root, LEDGER), "utf8");
  assert.equal(ledgerText, canonicalJsonlText(ledger));

  const indexBytes = readFileSync(join(workspace.root, INDEX));
  const ledgerBytes = readFileSync(join(workspace.root, LEDGER));
  assert.equal(runIndex(workspace).status, 0);
  assert.equal(runMerge(workspace).status, 0);
  assert.deepEqual(readFileSync(join(workspace.root, INDEX)), indexBytes, "index bytes are not deterministic");
  assert.deepEqual(readFileSync(join(workspace.root, LEDGER)), ledgerBytes, "ledger bytes are not deterministic");
});

test("a heading ending in # keeps an unambiguous end-anchored document locator", (context) => {
  const { workspace, units } = preparedPipeline(context);

  const sharp = units.find((unit) => unit.locator.prefix.endsWith("C#"));
  assert.ok(sharp !== undefined, "no document unit carried a C# heading path");
  assert.equal(sharp.locator.prefix, "guide.md:Guide > Setup > C#");
  const manifest = readJson(workspace.root, `${WORKDIR}/units/S002/chunks.json`);
  const unit = manifest.units.find((candidate) => candidate.id === sharp.unitId);
  assert.equal(unit.headingPath, "Guide > Setup > C#");
  assert.equal(unit.sourceRef, `guide.md:Guide > Setup > C##L${sharp.locator.startLine}-L${sharp.locator.endLine}`);

  const ledgerText = readFileSync(join(workspace.root, LEDGER), "utf8");
  assert.ok(
    ledgerText.includes(`"source-ref":"guide.md:Guide > Setup > C##L${sharp.locator.startLine}-L${sharp.locator.startLine}"`),
    "the C# locator did not survive the merge"
  );
});

test("index mode rejects a missing conventional result and preserves the prior index", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, INDEX));

  removeFixture(join(workspace.root, `${RESULTS_DIR}/${units[0].unitId}.json`));
  const result = runIndex(workspace);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^missing-result: /);
  assertOutputPreserved(join(workspace.root, INDEX), snapshot);
  assertNoAdjacentTemps(join(workspace.root, INDEX));
});

test("index mode rejects an unexpected stale result file", (context) => {
  const { workspace } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, INDEX));

  writeFixture(workspace.root, `${RESULTS_DIR}/C999.json`, canonicalJsonText({ schemaVersion: 2 }));
  const result = runIndex(workspace);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^unexpected-result: /);
  assertOutputPreserved(join(workspace.root, INDEX), snapshot);
});

test("index mode requires exactly one unit manifest for every registered source", (context) => {
  const workspace = buildWorkspace(context);
  writeResults(workspace);
  const all = workspace.manifests;

  const missing = runIndex({ ...workspace, manifests: all.slice(0, 2) });
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /^missing-unit-manifest: /);

  const duplicated = runIndex({ ...workspace, manifests: [...all, all[0]] });
  assert.equal(duplicated.status, 2, duplicated.stderr);
  assert.match(duplicated.stderr, /^duplicate-unit-manifest: /);
  assert.equal(existsSync(join(workspace.root, INDEX)), false, "a rejected index run wrote results.json");
});

test("index mode rejects an output that aliases one of its own inputs", (context) => {
  const { workspace } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, REGISTRY));

  const result = runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "index",
    "--sources", join(workspace.root, REGISTRY),
    ...workspace.manifests.flatMap((relativePath) => ["--unit-manifest", join(workspace.root, relativePath)]),
    "--results-dir", join(workspace.root, RESULTS_DIR),
    "--out", join(workspace.root, REGISTRY),
  ]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^path-alias: /);
  assertOutputPreserved(join(workspace.root, REGISTRY), snapshot);
});

test("index mode rejects a stale unit digest and a drifted fragment declaration", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, INDEX));
  const unit = units[0];
  const resultPath = `${RESULTS_DIR}/${unit.unitId}.json`;
  const original = readJson(workspace.root, resultPath);

  writeFixture(workspace.root, resultPath, canonicalJsonText({ ...original, unitDigest: "0".repeat(64) }));
  const staleDigest = runIndex(workspace);
  assert.equal(staleDigest.status, 2, staleDigest.stderr);
  assert.match(staleDigest.stderr, /^result-unit-digest-mismatch: /);

  writeFixture(workspace.root, resultPath, canonicalJsonText({
    ...original,
    fragment: { ...original.fragment, entryCount: original.fragment.entryCount + 1 },
  }));
  const staleCount = runIndex(workspace);
  assert.equal(staleCount.status, 2, staleCount.stderr);
  assert.match(staleCount.stderr, /^fragment-entry-count-mismatch: /);

  writeFixture(workspace.root, `${FRAGMENTS_DIR}/${unit.unitId}.jsonl`, canonicalJsonlText([]));
  const emptyFragment = runIndex(workspace);
  assert.equal(emptyFragment.status, 2, emptyFragment.stderr);
  assertOutputPreserved(join(workspace.root, INDEX), snapshot);
});

test("index mode rejects a malformed evidence record instead of skipping it", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, INDEX));
  const unit = units[0];

  // The declaration is rebuilt around the malformed bytes so the record grammar,
  // not the byte-count guard, is the check under test.
  const text = canonicalJsonlText([{ text: "missing id" }]);
  writeFixture(workspace.root, `${FRAGMENTS_DIR}/${unit.unitId}.jsonl`, text);
  const original = readJson(workspace.root, `${RESULTS_DIR}/${unit.unitId}.json`);
  writeFixture(workspace.root, `${RESULTS_DIR}/${unit.unitId}.json`, canonicalJsonText({
    ...original,
    fragment: { ...original.fragment, bytes: Buffer.byteLength(text, "utf8"), sha256: sha256(text), entryCount: 1 },
  }));

  const result = runIndex(workspace);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^missing-field: /);
  assertOutputPreserved(join(workspace.root, INDEX), snapshot);
});

test("index mode rejects an evidence locator that does not agree with its unit", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const unit = units[0];
  const records = evidenceFor(unit, 0, 2);
  records[0]["source-ref"] = `${unit.locator.prefix}#L${unit.locator.endLine + 900}-L${unit.locator.endLine + 901}`;
  writeUnitResult({ root: workspace.root }, unit, records);

  const result = runIndex(workspace);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^invalid-evidence-locator: /);
});

test("an expected unit set with no evidence at all cannot authorize an index", (context) => {
  const workspace = buildWorkspace(context);
  const units = expectedUnits(workspace);
  for (const unit of units) writeUnitResult(workspace, unit, []);

  const result = runIndex(workspace);
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, /^empty-result-set: /);
  assert.equal(existsSync(join(workspace.root, INDEX)), false, "an empty result set wrote results.json");
});

test("merge mode consumes only the index and never rediscovers files", (context) => {
  const { workspace } = preparedPipeline(context);
  const ledgerBytes = readFileSync(join(workspace.root, LEDGER));

  writeFixture(workspace.root, `${RESULTS_DIR}/stray.json`, canonicalJsonText({ schemaVersion: 2 }));
  writeFixture(workspace.root, `${FRAGMENTS_DIR}/stray.jsonl`, canonicalJsonlText([{ id: "C001-F900" }]));
  const merged = runMerge(workspace);
  assert.equal(merged.status, 0, merged.stderr);
  assert.deepEqual(readFileSync(join(workspace.root, LEDGER)), ledgerBytes, "merge consumed an unindexed file");

  const reindexed = runIndex(workspace);
  assert.equal(reindexed.status, 2, reindexed.stderr);
  assert.match(reindexed.stderr, /^unexpected-result: /);
});

test("merge mode refuses index-mode options, a missing indexed file, and output aliasing", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, LEDGER));

  const wrongOptions = runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "merge",
    "--index", join(workspace.root, INDEX),
    "--results-dir", join(workspace.root, RESULTS_DIR),
    "--out", join(workspace.root, LEDGER),
  ]);
  assert.equal(wrongOptions.status, 2, wrongOptions.stderr);
  assert.match(wrongOptions.stderr, /^forbidden-option: /);

  const selfIngesting = runMerge(workspace, INDEX);
  assert.equal(selfIngesting.status, 2, selfIngesting.stderr);
  assert.match(selfIngesting.stderr, /^path-alias: /);

  removeFixture(join(workspace.root, `${RESULTS_DIR}/${units[0].unitId}.json`));
  const missing = runMerge(workspace);
  assert.equal(missing.status, 2, missing.stderr);
  assert.match(missing.stderr, /^(missing-file|missing-path): /);
  assertOutputPreserved(join(workspace.root, LEDGER), snapshot);
  assertNoAdjacentTemps(join(workspace.root, LEDGER));
});

test("merge mode rejects a result whose bytes drifted after indexing", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const snapshot = captureOutput(join(workspace.root, LEDGER));
  const unit = units[0];
  const original = readJson(workspace.root, `${RESULTS_DIR}/${unit.unitId}.json`);

  writeFixture(workspace.root, `${RESULTS_DIR}/${unit.unitId}.json`, canonicalJsonText({
    ...original,
    reason: undefined,
    status: "evidence",
    fragment: { ...original.fragment, bytes: original.fragment.bytes + 1 },
  }));
  const result = runMerge(workspace);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^(unexpected-byte-count|result-digest-mismatch): /);
  assertOutputPreserved(join(workspace.root, LEDGER), snapshot);
});

test("extraction audit reconciles the index, ledger, and every fragment", (context) => {
  const { workspace, units, ledger } = preparedPipeline(context);

  const result = runAudit(workspace);
  assert.equal(result.status, 0, result.stderr);
  const report = readJson(workspace.root, `${WORKDIR}/extraction.json`);
  assert.deepEqual(Object.keys(report), [
    "schemaVersion",
    "gate",
    "stage",
    "ok",
    "inputs",
    "configuration",
    "counts",
    "violations",
  ]);
  assert.equal(report.gate, "extraction-audit");
  assert.equal(report.stage, "extraction");
  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, {
    expected: units.length,
    results: units.length,
    evidence: units.length,
    noEvidence: 0,
    flagged: 0,
  });
  assert.deepEqual(report.inputs.map((input) => input.role), ["ledger", "result-index", "source-registry"]);
  assert.equal(report.inputs[0].sha256, sha256(canonicalJsonlText(ledger)));
  assert.deepEqual(report.violations, []);

  const reportBytes = readFileSync(join(workspace.root, `${WORKDIR}/extraction.json`));
  assert.equal(runAudit(workspace).status, 0);
  assert.deepEqual(readFileSync(join(workspace.root, `${WORKDIR}/extraction.json`)), reportBytes);
});

test("extraction audit flags an under-extracted unit and reports ok:false", (context) => {
  const { workspace, units } = preparedPipeline(context);

  const result = runAudit(workspace, ["--min-entries", "3", "--floor-per-1k", "0", "--ratio", "0"]);
  assert.equal(result.status, 1, result.stderr);
  const report = readJson(workspace.root, `${WORKDIR}/extraction.json`);
  assert.equal(report.ok, false);
  assert.equal(report.counts.flagged, units.length);
  assert.deepEqual(report.violations.map((violation) => violation.id), units.map((unit) => unit.unitId));
  assert.deepEqual([...new Set(report.violations.map((violation) => violation.code))], ["under-extracted-unit"]);
});

test("extraction audit rejects every noncanonical or inactive threshold", (context) => {
  const { workspace } = preparedPipeline(context);
  assert.equal(runAudit(workspace).status, 0);
  const snapshot = captureOutput(join(workspace.root, `${WORKDIR}/extraction.json`));

  const invalid = [
    ["--min-entries", "-1"],
    ["--min-entries", "01"],
    ["--min-entries", "1001"],
    ["--floor-per-1k", "5.0"],
    ["--floor-per-1k", ".5"],
    ["--ratio", "1e0"],
    ["--ratio", "2"],
  ];
  for (const [flag, value] of invalid) {
    const result = runAudit(workspace, [flag, value]);
    assert.equal(result.status, 2, `${flag} ${value}: ${result.stderr}`);
    assert.match(result.stderr, /^(invalid-integer|integer-out-of-range|invalid-decimal|decimal-out-of-range|missing-option-value): /);
  }

  const inactive = runAudit(workspace, ["--min-entries", "0", "--floor-per-1k", "0", "--ratio", "0"]);
  assert.equal(inactive.status, 2, inactive.stderr);
  assert.match(inactive.stderr, /^inactive-thresholds: /);
  assertOutputPreserved(join(workspace.root, `${WORKDIR}/extraction.json`), snapshot);
});

test("extraction audit refuses a ledger that does not equal the merged result set", (context) => {
  const { workspace, ledger } = preparedPipeline(context);
  assert.equal(runAudit(workspace).status, 0);
  const snapshot = captureOutput(join(workspace.root, `${WORKDIR}/extraction.json`));

  writeFixture(workspace.root, LEDGER, canonicalJsonlText(ledger.slice(0, ledger.length - 1)));
  const result = runAudit(workspace);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /^ledger-reconciliation-mismatch: /);
  assertOutputPreserved(join(workspace.root, `${WORKDIR}/extraction.json`), snapshot);
});

test("the planning digest routes every decision and action id exactly once", (context) => {
  const { workspace, ledger } = preparedPipeline(context);

  const result = runDigest(workspace);
  assert.equal(result.status, 0, result.stderr);
  const digest = readJson(workspace.root, `${WORKDIR}/digest.json`);
  assert.deepEqual(Object.keys(digest), [
    "schemaVersion",
    "sourceRegistry",
    "ledger",
    "configuration",
    "routing",
    "tags",
    "markdown",
  ]);
  assert.equal(digest.schemaVersion, 2);
  assert.equal(digest.sourceRegistry.path, REGISTRY);
  assert.equal(digest.ledger.path, LEDGER);
  assert.equal(digest.ledger.entryCount, ledger.length);
  assert.equal(digest.ledger.sha256, sha256(canonicalJsonlText(ledger)));
  assert.equal(digest.configuration.snippetCodePoints, 90);
  assert.equal(digest.routing.decisionActionSection, "Decisions and action items");

  const routed = ledger.filter((record) => record.type === "decision" || record.type === "action").map((record) => record.id);
  assert.deepEqual(digest.routing.decisionActionIds, routed);
  const tagged = digest.tags.flatMap((tag) => tag.ids);
  assert.deepEqual([...routed, ...tagged].sort(), ledger.map((record) => record.id).sort());
  assert.equal(new Set([...routed, ...tagged]).size, ledger.length, "an id routed to more than one destination");
  for (const tag of digest.tags) assert.notEqual(tag.tag, "routing", "a routed tag group leaked into the digest tags");
  assert.deepEqual(digest.tags.map((tag) => tag.tag), ["overview", "details"]);

  const markdownBytes = readFileSync(join(workspace.root, `${WORKDIR}/digest.md`));
  assert.equal(digest.markdown.path, `${WORKDIR}/digest.md`);
  assert.equal(digest.markdown.sizeBytes, markdownBytes.length);
  assert.equal(digest.markdown.sha256, sha256(markdownBytes));
});

test("the digest markdown follows the exact version-2 grammar", (context) => {
  const { workspace } = preparedPipeline(context);
  assert.equal(runDigest(workspace).status, 0);

  const markdown = readFileSync(join(workspace.root, `${WORKDIR}/digest.md`), "utf8");
  const digest = readJson(workspace.root, `${WORKDIR}/digest.json`);
  const lines = markdown.split("\n");
  assert.equal(lines[lines.length - 1], "", "digest.md must end with exactly one terminal newline");
  assert.equal(markdown.endsWith("\n\n"), false, "digest.md must not end with a blank line");
  assert.equal(/[ \t]\n/.test(markdown), false, "digest.md must not contain a trailing space");
  assert.equal(markdown.includes("\r"), false, "digest.md must use LF endings");

  assert.deepEqual(lines.slice(0, 7), [
    "# Planning Digest v2",
    `source-registry: ${REGISTRY}`,
    `source-registry-sha256: ${digest.sourceRegistry.sha256}`,
    `ledger: ${LEDGER}`,
    `ledger-sha256: ${digest.ledger.sha256}`,
    `ledger-entries: ${digest.ledger.entryCount}`,
    "snippet-code-points: 90",
  ]);
  assert.deepEqual(lines.slice(7, 11), [
    "",
    "## Decision/action routing",
    "destination: Decisions and action items",
    `ids: ${digest.routing.decisionActionIds.join(", ")}`,
  ]);
  for (const tag of digest.tags) {
    assert.ok(markdown.includes([
      "## Tag",
      `tag: ${JSON.stringify(tag.tag)}`,
      `entries: ${tag.entryCount}`,
      `types: ${tag.typeCounts.map((entry) => `${entry.type}=${entry.count}`).join(", ")}`,
      `example-id: ${tag.example.id}`,
      `example: ${JSON.stringify(tag.example.snippet)}`,
      `ids: ${tag.ids.join(", ")}`,
    ].join("\n")), `digest.md is missing the block for tag ${tag.tag}`);
  }

  const markdownBytes = readFileSync(join(workspace.root, `${WORKDIR}/digest.md`));
  const jsonBytes = readFileSync(join(workspace.root, `${WORKDIR}/digest.json`));
  assert.equal(runDigest(workspace).status, 0);
  assert.deepEqual(readFileSync(join(workspace.root, `${WORKDIR}/digest.md`)), markdownBytes);
  assert.deepEqual(readFileSync(join(workspace.root, `${WORKDIR}/digest.json`)), jsonBytes);
});

test("a digest snippet collapses Unicode whitespace and preserves a non-whitespace format control", (context) => {
  const { workspace, ledger } = preparedPipeline(context);
  // U+0085 NEL is White_Space=Yes and must collapse; U+FEFF ZWNBSP is
  // White_Space=No and must survive, so neither /\s/ nor String.trim is correct.
  const text = "\uFEFFalpha\u0085beta\uFEFF";
  const target = ledger.find((record) => record.type !== "decision" && record.type !== "action");
  assert.ok(target !== undefined, "the fixture carried no ordinary evidence entry");
  writeFixture(workspace.root, LEDGER, canonicalJsonlText(
    ledger.map((record) => (record.id === target.id ? { ...record, text, tag: "whitespace" } : record))
  ));

  const result = runDigest(workspace);
  assert.equal(result.status, 0, result.stderr);
  const digest = readJson(workspace.root, `${WORKDIR}/digest.json`);
  const group = digest.tags.find((tag) => tag.tag === "whitespace");
  assert.ok(group !== undefined, "the whitespace tag group is missing");
  assert.deepEqual(group.ids, [target.id]);
  assert.equal(group.example.id, target.id);
  assert.deepEqual(
    [...group.example.snippet].map((character) => character.codePointAt(0)),
    [0xfeff, 0x61, 0x6c, 0x70, 0x68, 0x61, 0x20, 0x62, 0x65, 0x74, 0x61, 0xfeff],
    "the snippet did not collapse U+0085 to one ASCII space while preserving both U+FEFF"
  );

  const markdown = readFileSync(join(workspace.root, `${WORKDIR}/digest.md`), "utf8");
  assert.ok(
    markdown.includes(`example: ${JSON.stringify(group.example.snippet)}`),
    "digest.md does not render the exact snippet digest.json records"
  );
});

test("the planning digest refuses an empty or unprovenanced ledger and preserves both outputs", (context) => {
  const { workspace, ledger } = preparedPipeline(context);
  assert.equal(runDigest(workspace).status, 0);
  const markdownSnapshot = captureOutput(join(workspace.root, `${WORKDIR}/digest.md`));
  const jsonSnapshot = captureOutput(join(workspace.root, `${WORKDIR}/digest.json`));

  writeFixture(workspace.root, LEDGER, "");
  const empty = runDigest(workspace);
  assert.equal(empty.status, 3, empty.stderr);
  assert.match(empty.stderr, /^empty-jsonl: /);

  writeFixture(workspace.root, LEDGER, canonicalJsonlText([{ ...ledger[0], "source-id": "S099" }, ...ledger.slice(1)]));
  const unknownSource = runDigest(workspace);
  assert.equal(unknownSource.status, 2, unknownSource.stderr);
  assert.match(unknownSource.stderr, /^unknown-evidence-source: /);

  writeFixture(workspace.root, LEDGER, canonicalJsonlText([{ ...ledger[0], "source-ref": "elsewhere.md#L1-L2" }, ...ledger.slice(1)]));
  const badLocator = runDigest(workspace);
  assert.equal(badLocator.status, 2, badLocator.stderr);
  assert.match(badLocator.stderr, /^invalid-evidence-locator: /);

  assertOutputPreserved(join(workspace.root, `${WORKDIR}/digest.md`), markdownSnapshot);
  assertOutputPreserved(join(workspace.root, `${WORKDIR}/digest.json`), jsonSnapshot);
  assertNoAdjacentTemps(join(workspace.root, `${WORKDIR}/digest.json`));
});

test("a duplicate or cross-unit evidence identity cannot reach the ledger", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const first = units[0];
  const second = units[1];

  const repeated = evidenceFor(first, 0, 2);
  repeated[1].id = repeated[0].id;
  writeUnitResult({ root: workspace.root }, first, repeated);
  const duplicate = runIndex(workspace);
  assert.equal(duplicate.status, 2, duplicate.stderr);
  assert.match(duplicate.stderr, /^noncanonical-evidence-order: /);

  writeUnitResult({ root: workspace.root }, first, evidenceFor(first, 0, 2));
  const borrowed = evidenceFor(second, 1, 2).map((record) => ({ ...record, id: record.id.replace(second.unitId, first.unitId) }));
  writeUnitResult({ root: workspace.root }, second, borrowed);
  const collided = runIndex(workspace);
  assert.equal(collided.status, 2, collided.stderr);
  assert.match(collided.stderr, /^evidence-unit-mismatch: /);
});

test("every runtime command in this slice requires an explicit workspace root", (context) => {
  const { workspace } = preparedPipeline(context);
  const invocations = [
    ["merge-ledger.mjs", ["--mode", "merge", "--index", join(workspace.root, INDEX), "--out", join(workspace.root, LEDGER)]],
    ["extraction-audit.mjs", [
      "--sources", join(workspace.root, REGISTRY),
      "--ledger", join(workspace.root, LEDGER),
      "--result-index", join(workspace.root, INDEX),
      "--json", join(workspace.root, `${WORKDIR}/extraction.json`),
    ]],
    ["ledger-digest.mjs", [
      "--sources", join(workspace.root, REGISTRY),
      "--ledger", join(workspace.root, LEDGER),
      "--out", join(workspace.root, `${WORKDIR}/digest.md`),
      "--json", join(workspace.root, `${WORKDIR}/digest.json`),
    ]],
  ];
  for (const [name, args] of invocations) {
    const result = runNode(script(name), args);
    assert.equal(result.status, 2, `${name}: ${result.stderr}`);
    assert.match(result.stderr, /^missing-option: /);
  }
});

test("a complete run declaring no expected unit exits 3 without writing an index", (context) => {
  const root = makeTempRoot(context, "technical-docs-jsonl-empty-");
  writeFixture(root, "repository/logo.png", "not text\n");
  mkdirSync(join(root, RESULTS_DIR), { recursive: true });

  const registered = runNode(script("source-manifest.mjs"), [
    "--workspace-root", root,
    "--mode", "create",
    "--workdir", join(root, WORKDIR),
    "--output", join(root, "output.md"),
    "--repo", join(root, "repository"),
    "--out", join(root, REGISTRY),
  ]);
  assert.equal(registered.status, 0, registered.stderr);
  const inventoried = runNode(script("repo-inventory.mjs"), [
    "--workspace-root", root,
    "--sources", join(root, REGISTRY),
    "--source", "S001",
    "--start", "1",
    "--out", join(root, `${WORKDIR}/units/S001/inventory.json`),
  ]);
  assert.equal(inventoried.status, 0, inventoried.stderr);
  assert.deepEqual(readJson(root, `${WORKDIR}/units/S001/inventory.json`).workUnits, []);

  const result = runIndex({ root, manifests: [`${WORKDIR}/units/S001/inventory.json`] });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, /^empty-expected-units: /);
  assert.equal(existsSync(join(root, INDEX)), false, "an empty expected-unit set wrote results.json");
});

test("merge-ledger rejects an unsupported mode and an unknown option", (context) => {
  const { workspace } = preparedPipeline(context);

  const unsupportedMode = runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "concat",
    "--out", join(workspace.root, LEDGER),
  ]);
  assert.equal(unsupportedMode.status, 2, unsupportedMode.stderr);
  assert.match(unsupportedMode.stderr, /^invalid-enum: /);

  const unknownOption = runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "merge",
    "--index", join(workspace.root, INDEX),
    "--out", join(workspace.root, LEDGER),
    "--snippet", "90",
  ]);
  assert.equal(unknownOption.status, 2, unknownOption.stderr);
  assert.match(unknownOption.stderr, /^unknown-option: /);
});

test("declaration and creation order change no output byte", (context) => {
  const first = preparedPipeline(context);
  assert.equal(runDigest(first.workspace).status, 0);
  const baseline = {
    index: readBytes(join(first.workspace.root, INDEX)),
    ledger: readBytes(join(first.workspace.root, LEDGER)),
    digestJson: readBytes(join(first.workspace.root, `${WORKDIR}/digest.json`)),
    digestMarkdown: readBytes(join(first.workspace.root, `${WORKDIR}/digest.md`)),
  };

  // The second workspace holds the same content, but every result and fragment is
  // created in reverse unit order and every manifest is declared in reverse order.
  const second = buildWorkspace(context);
  const units = expectedUnits(second);
  for (let position = units.length - 1; position >= 0; position--) {
    writeUnitResult(second, units[position], evidenceFor(units[position], position, 2));
  }
  const reversed = { ...second, manifests: [...second.manifests].reverse() };
  const indexed = runIndex(reversed);
  assert.equal(indexed.status, 0, indexed.stderr);
  const merged = runMerge(second);
  assert.equal(merged.status, 0, merged.stderr);
  assert.equal(runDigest(second).status, 0);

  assert.deepEqual(readBytes(join(second.root, INDEX)), baseline.index, "results.json bytes depend on input order");
  assert.deepEqual(readBytes(join(second.root, LEDGER)), baseline.ledger, "ledger.jsonl bytes depend on input order");
  assert.deepEqual(
    readBytes(join(second.root, `${WORKDIR}/digest.json`)),
    baseline.digestJson,
    "digest.json bytes depend on input order"
  );
  assert.deepEqual(
    readBytes(join(second.root, `${WORKDIR}/digest.md`)),
    baseline.digestMarkdown,
    "digest.md bytes depend on input order"
  );
});

test("a malformed or empty ledger cannot pass the extraction gate or the digest", (context) => {
  const { workspace } = preparedPipeline(context);
  assert.equal(runAudit(workspace).status, 0);
  assert.equal(runDigest(workspace).status, 0);
  const reportPath = join(workspace.root, `${WORKDIR}/extraction.json`);
  const jsonPath = join(workspace.root, `${WORKDIR}/digest.json`);
  const markdownPath = join(workspace.root, `${WORKDIR}/digest.md`);
  const reportSnapshot = captureOutput(reportPath);
  const jsonSnapshot = captureOutput(jsonPath);
  const markdownSnapshot = captureOutput(markdownPath);

  writeFixture(workspace.root, LEDGER, canonicalJsonlText([{ text: "missing id" }]));
  const auditMalformed = runAudit(workspace);
  assert.equal(auditMalformed.status, 2, auditMalformed.stderr);
  assert.match(auditMalformed.stderr, /^missing-field: /);
  const digestMalformed = runDigest(workspace);
  assert.equal(digestMalformed.status, 2, digestMalformed.stderr);
  assert.match(digestMalformed.stderr, /^missing-field: /);

  writeFixture(workspace.root, LEDGER, "");
  const auditEmpty = runAudit(workspace);
  assert.equal(auditEmpty.status, 3, auditEmpty.stderr);
  assert.match(auditEmpty.stderr, /^empty-jsonl: /);

  assertOutputPreserved(reportPath, reportSnapshot);
  assertOutputPreserved(jsonPath, jsonSnapshot);
  assertOutputPreserved(markdownPath, markdownSnapshot);
  assertNoAdjacentTemps(reportPath);
  assertNoAdjacentTemps(jsonPath);
  assertNoAdjacentTemps(markdownPath);
});

test("the extraction gate and the digest refuse an output that aliases one of their inputs", (context) => {
  const { workspace } = preparedPipeline(context);
  const indexSnapshot = captureOutput(join(workspace.root, INDEX));
  const ledgerSnapshot = captureOutput(join(workspace.root, LEDGER));

  const auditOntoIndex = runNode(script("extraction-audit.mjs"), [
    "--workspace-root", workspace.root,
    "--sources", join(workspace.root, REGISTRY),
    "--ledger", join(workspace.root, LEDGER),
    "--result-index", join(workspace.root, INDEX),
    "--json", join(workspace.root, INDEX),
  ]);
  assert.equal(auditOntoIndex.status, 2, auditOntoIndex.stderr);
  assert.match(auditOntoIndex.stderr, /^path-alias: /);

  const digestOntoLedger = runNode(script("ledger-digest.mjs"), [
    "--workspace-root", workspace.root,
    "--sources", join(workspace.root, REGISTRY),
    "--ledger", join(workspace.root, LEDGER),
    "--out", join(workspace.root, `${WORKDIR}/digest.md`),
    "--json", join(workspace.root, LEDGER),
  ]);
  assert.equal(digestOntoLedger.status, 2, digestOntoLedger.stderr);
  assert.match(digestOntoLedger.stderr, /^path-alias: /);

  const digestOntoItself = runNode(script("ledger-digest.mjs"), [
    "--workspace-root", workspace.root,
    "--sources", join(workspace.root, REGISTRY),
    "--ledger", join(workspace.root, LEDGER),
    "--out", join(workspace.root, `${WORKDIR}/digest.md`),
    "--json", join(workspace.root, `${WORKDIR}/digest.md`),
  ]);
  assert.equal(digestOntoItself.status, 2, digestOntoItself.stderr);
  assert.match(digestOntoItself.stderr, /^path-alias: /);

  assertOutputPreserved(join(workspace.root, INDEX), indexSnapshot);
  assertOutputPreserved(join(workspace.root, LEDGER), ledgerSnapshot);
  assert.equal(existsSync(join(workspace.root, `${WORKDIR}/digest.md`)), false, "a rejected digest run wrote digest.md");
  assertNoAdjacentTemps(join(workspace.root, INDEX));
  assertNoAdjacentTemps(join(workspace.root, LEDGER));
});

test("the extraction gate refuses a report output that aliases a validated fragment or result", (context) => {
  const { workspace, units } = preparedPipeline(context);
  const reportPath = join(workspace.root, `${WORKDIR}/extraction.json`);
  assert.equal(runAudit(workspace).status, 0, "the fixture does not clear the gate before the alias cases");
  removeFixture(reportPath);

  const auditOnto = (target) => runNode(script("extraction-audit.mjs"), [
    "--workspace-root", workspace.root,
    "--sources", join(workspace.root, REGISTRY),
    "--ledger", join(workspace.root, LEDGER),
    "--result-index", join(workspace.root, INDEX),
    "--min-entries", "2",
    "--floor-per-1k", "0",
    "--ratio", "0",
    "--json", target,
  ]);

  const fragmentPath = join(workspace.root, `${FRAGMENTS_DIR}/${units[0].unitId}.jsonl`);
  const fragmentSnapshot = captureOutput(fragmentPath);
  assert.equal(fragmentSnapshot.exists, true, "the fixture declared no evidence fragment");
  const ontoFragment = auditOnto(fragmentPath);
  assert.equal(ontoFragment.status, 2, ontoFragment.stderr);
  assert.match(ontoFragment.stderr, /^path-alias: /);
  assertOutputPreserved(fragmentPath, fragmentSnapshot);
  assertNoAdjacentTemps(fragmentPath);

  const resultPath = join(workspace.root, `${RESULTS_DIR}/${units[0].unitId}.json`);
  const resultSnapshot = captureOutput(resultPath);
  const ontoResult = auditOnto(resultPath);
  assert.equal(ontoResult.status, 2, ontoResult.stderr);
  assert.match(ontoResult.stderr, /^(path-alias|protected-path-alias): /);
  assertOutputPreserved(resultPath, resultSnapshot);
  assertNoAdjacentTemps(resultPath);

  assert.equal(existsSync(reportPath), false, "a refused extraction-audit run wrote its report");
});

test("index and merge refuse a case-variant spelling of one of their own inputs", (context) => {
  const { workspace } = preparedPipeline(context);
  if (!canResolveCaseInsensitivePath(workspace.root)) {
    context.diagnostic("case-insensitive path aliasing is unavailable on this host");
    return;
  }
  const registrySnapshot = captureOutput(join(workspace.root, REGISTRY));
  const indexSnapshot = captureOutput(join(workspace.root, INDEX));

  const indexedOntoRegistry = runIndex(workspace, []);
  assert.equal(indexedOntoRegistry.status, 0, indexedOntoRegistry.stderr);
  const aliasedIndex = runNode(script("merge-ledger.mjs"), [
    "--workspace-root", workspace.root,
    "--mode", "index",
    "--sources", join(workspace.root, REGISTRY),
    ...workspace.manifests.flatMap((relativePath) => ["--unit-manifest", join(workspace.root, relativePath)]),
    "--results-dir", join(workspace.root, RESULTS_DIR),
    "--out", join(workspace.root, `${WORKDIR}/SOURCES.json`),
  ]);
  assert.equal(aliasedIndex.status, 2, aliasedIndex.stderr);
  assert.match(aliasedIndex.stderr, /^path-alias: /);

  const aliasedMerge = runMerge(workspace, `${WORKDIR}/RESULTS.json`);
  assert.equal(aliasedMerge.status, 2, aliasedMerge.stderr);
  assert.match(aliasedMerge.stderr, /^path-alias: /);

  assertOutputPreserved(join(workspace.root, REGISTRY), registrySnapshot);
  assertOutputPreserved(join(workspace.root, INDEX), indexSnapshot);
  assertNoAdjacentTemps(join(workspace.root, REGISTRY));
  assertNoAdjacentTemps(join(workspace.root, INDEX));
});

test("an unreadable input fails closed instead of being silently skipped", (context) => {
  const { workspace, units } = preparedPipeline(context);
  if (!canEnforceUnreadableFile(workspace.root)) {
    context.diagnostic("unreadable-file enforcement is unavailable on this host");
    return;
  }
  const indexSnapshot = captureOutput(join(workspace.root, INDEX));
  const ledgerSnapshot = captureOutput(join(workspace.root, LEDGER));

  const fragmentPath = join(workspace.root, `${FRAGMENTS_DIR}/${units[0].unitId}.jsonl`);
  chmodSync(fragmentPath, 0o000);
  try {
    const indexed = runIndex(workspace);
    assert.equal(indexed.status, 2, indexed.stderr);
    assert.match(indexed.stderr, /^file-read-failed: /);
  } finally {
    chmodSync(fragmentPath, 0o600);
  }
  assertOutputPreserved(join(workspace.root, INDEX), indexSnapshot);
  assertNoAdjacentTemps(join(workspace.root, INDEX));

  const resultPath = join(workspace.root, `${RESULTS_DIR}/${units[0].unitId}.json`);
  chmodSync(resultPath, 0o000);
  try {
    const merged = runMerge(workspace);
    assert.equal(merged.status, 2, merged.stderr);
    assert.match(merged.stderr, /^file-read-failed: /);
  } finally {
    chmodSync(resultPath, 0o600);
  }
  assertOutputPreserved(join(workspace.root, LEDGER), ledgerSnapshot);
  assertNoAdjacentTemps(join(workspace.root, LEDGER));
});

test("a heading whose text embeds a line span keeps its exact end-anchored locator", (context) => {
  const root = makeTempRoot(context, "technical-docs-jsonl-anchor-");
  // The heading text itself ends in "#L1-L2", so a locator parse that is not
  // anchored at the end of the string recovers the wrong reference and span.
  writeFixture(root, "guide.md", "# Guide\n\n## C# #L1-L2\n\nUse the C# analyzer for parity.\n");

  const steps = [
    [script("source-manifest.mjs"), [
      "--workspace-root", root,
      "--mode", "create",
      "--workdir", join(root, WORKDIR),
      "--output", join(root, "output.md"),
      "--document", join(root, "guide.md"),
      "--out", join(root, REGISTRY),
    ]],
    [script("headings.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S001",
      "--out", join(root, `${WORKDIR}/S001/headings.json`),
    ]],
    [script("chunk.mjs"), [
      "--workspace-root", root,
      "--sources", join(root, REGISTRY),
      "--source", "S001",
      "--start", "1",
      "--headings", join(root, `${WORKDIR}/S001/headings.json`),
      "--outdir", join(root, `${WORKDIR}/units/S001`),
    ]],
  ];
  for (const [command, args] of steps) {
    const result = runNode(command, args);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
  }

  const workspace = { root, manifests: [`${WORKDIR}/units/S001/chunks.json`] };
  const units = expectedUnits(workspace);
  const embedded = units.find((unit) => unit.locator.prefix.endsWith("C# #L1-L2"));
  assert.ok(embedded !== undefined, "no unit carried the embedded-span heading path");
  assert.equal(embedded.locator.prefix, "guide.md:Guide > C# #L1-L2");
  units.forEach((unit, position) => writeUnitResult(workspace, unit, evidenceFor(unit, position, 2)));

  const indexed = runIndex(workspace);
  assert.equal(indexed.status, 0, indexed.stderr);
  const merged = runMerge(workspace);
  assert.equal(merged.status, 0, merged.stderr);
  const ledgerText = readFileSync(join(root, LEDGER), "utf8");
  assert.ok(
    ledgerText.includes(`"source-ref":"guide.md:Guide > C# #L1-L2#L${embedded.locator.startLine}-L${embedded.locator.endLine}"`),
    "the embedded-span locator did not survive the merge"
  );
});

test("a decision sharing an ordinary tag still routes exactly once", (context) => {
  const { workspace, ledger } = preparedPipeline(context);
  const routedTypes = new Set(["decision", "action"]);
  const retagged = ledger.map((record) => (routedTypes.has(record.type) ? { ...record, tag: "overview" } : record));
  writeFixture(workspace.root, LEDGER, canonicalJsonlText(retagged));

  const result = runDigest(workspace);
  assert.equal(result.status, 0, result.stderr);
  const digest = readJson(workspace.root, `${WORKDIR}/digest.json`);
  const routed = retagged.filter((record) => routedTypes.has(record.type)).map((record) => record.id);
  assert.ok(routed.length > 0, "the fixture carried no decision or action entry");
  assert.deepEqual(digest.routing.decisionActionIds, routed);

  const overview = digest.tags.find((tag) => tag.tag === "overview");
  assert.ok(overview !== undefined, "the shared tag group is missing");
  for (const id of routed) assert.equal(overview.ids.includes(id), false, `${id} also joined its tag group`);
  assert.equal(overview.entryCount, overview.ids.length);
  assert.deepEqual(overview.typeCounts.filter((entry) => routedTypes.has(entry.type)), []);

  const tagged = digest.tags.flatMap((tag) => tag.ids);
  assert.equal(new Set([...routed, ...tagged]).size, retagged.length, "an id routed to more than one destination");
  assert.deepEqual([...routed, ...tagged].sort(), retagged.map((record) => record.id).sort());

  const markdown = readFileSync(join(workspace.root, `${WORKDIR}/digest.md`), "utf8");
  for (const id of routed) {
    assert.equal(markdown.split(id).length - 1, 1, `${id} appears more than once in digest.md`);
  }
});

test("a repeated evidence identity cannot reach the digest and preserves both outputs", (context) => {
  const { workspace, ledger } = preparedPipeline(context);
  assert.equal(runDigest(workspace).status, 0);
  const jsonPath = join(workspace.root, `${WORKDIR}/digest.json`);
  const markdownPath = join(workspace.root, `${WORKDIR}/digest.md`);
  const jsonSnapshot = captureOutput(jsonPath);
  const markdownSnapshot = captureOutput(markdownPath);

  writeFixture(workspace.root, LEDGER, canonicalJsonlText([ledger[0], ...ledger]));
  const duplicated = runDigest(workspace);
  assert.equal(duplicated.status, 2, duplicated.stderr);
  assert.match(duplicated.stderr, /^duplicate-identity: /);

  assertOutputPreserved(jsonPath, jsonSnapshot);
  assertOutputPreserved(markdownPath, markdownSnapshot);
  assertNoAdjacentTemps(jsonPath);
  assertNoAdjacentTemps(markdownPath);
});
