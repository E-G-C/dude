import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as FS_CONSTANTS,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_SCRIPTS = new URL("../../skills/dude-pack-technical-docs-runtime/scripts/", import.meta.url);

export const CANONICAL_TEMP_ROOT = realpathSync.native(tmpdir());

/** Resolve one runtime CLI inside the pack's runtime skill. */
export function runtimeScript(name) {
  return fileURLToPath(new URL(name, RUNTIME_SCRIPTS));
}

/** Create and automatically clean a temporary workspace under the canonical OS temp root. */
export function makeTempRoot(test, prefix = "technical-docs-") {
  const root = realpathSync.native(mkdtempSync(join(CANONICAL_TEMP_ROOT, prefix)));
  test?.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** Resolve a fixture path while refusing a lexical escape from its root. */
export function fixturePath(root, relativePath) {
  assert.equal(typeof relativePath, "string", "fixture path must be a string");
  assert.ok(relativePath.length > 0, "fixture path must not be empty");
  assert.ok(!relativePath.includes("\0"), "fixture path must not contain NUL");
  assert.ok(
    !isAbsolute(relativePath) && !win32.isAbsolute(relativePath) && !/^[A-Za-z]:/.test(relativePath),
    `fixture path must be relative on every supported host: ${relativePath}`
  );
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, relativePath);
  const difference = relative(absoluteRoot, absolutePath);
  assert.ok(
    difference === "" || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference)),
    `fixture path escapes root: ${relativePath}`
  );
  return absolutePath;
}

function tryFixtureLstat(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function ensureSafeFixtureParent(root, absolutePath) {
  const absoluteRoot = resolve(root);
  const rootStat = tryFixtureLstat(absoluteRoot);
  assert.ok(rootStat?.isDirectory() && !rootStat.isSymbolicLink(), `fixture root must be a non-symlink directory: ${absoluteRoot}`);

  const parent = dirname(absolutePath);
  const difference = relative(absoluteRoot, parent);
  const segments = difference === "" ? [] : difference.split(sep);
  let current = absoluteRoot;
  for (const segment of segments) {
    current = join(current, segment);
    let stat = tryFixtureLstat(current);
    if (stat === null) {
      try {
        mkdirSync(current);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      stat = tryFixtureLstat(current);
    }
    assert.ok(stat?.isDirectory() && !stat.isSymbolicLink(), `fixture parent must be a non-symlink directory: ${current}`);
  }

  const targetStat = tryFixtureLstat(absolutePath);
  assert.ok(
    !targetStat?.isSymbolicLink() && !(targetStat?.isFile() && targetStat.nlink > 1),
    `fixture target must not be a symlink or multiply linked file: ${absolutePath}`
  );
}

/** Write a fixture without following existing symlink components. */
export function writeFixture(root, relativePath, value, options = {}) {
  const absolutePath = fixturePath(root, relativePath);
  ensureSafeFixtureParent(root, absolutePath);
  writeFileSync(absolutePath, value, options);
  return absolutePath;
}

/** Write deterministic pretty JSON fixture bytes. */
export function writeJsonFixture(root, relativePath, value) {
  return writeFixture(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Write compact JSONL fixture bytes. */
export function writeJsonlFixture(root, relativePath, records) {
  const text = records.map((record) => JSON.stringify(record)).join("\n") + (records.length === 0 ? "" : "\n");
  return writeFixture(root, relativePath, text);
}

/** Invoke a Node script without a shell. */
export function runNode(script, args = [], options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    input: options.input,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    shell: false,
  });
}

function withProbeDirectory(root, callback) {
  const probeRoot = mkdtempSync(join(root, ".capability-"));
  try {
    return callback(probeRoot);
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

/** Report whether the filesystem permits symbolic-link fixtures. */
export function canCreateSymlink(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "target");
    const link = join(probeRoot, "link");
    writeFileSync(target, "target\n");
    try {
      symlinkSync(target, link, "file");
      return lstatSync(link).isSymbolicLink();
    } catch {
      return false;
    }
  });
}

/** Report whether the filesystem permits hard-link fixtures. */
export function canCreateHardlink(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "target");
    const link = join(probeRoot, "link");
    writeFileSync(target, "target\n");
    try {
      linkSync(target, link);
      return lstatSync(target).ino === lstatSync(link).ino;
    } catch {
      return false;
    }
  });
}

/** Report whether differently cased path spellings resolve to one directory. */
export function canResolveCaseInsensitivePath(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "CaseProbe");
    const alias = join(probeRoot, "caseprobe");
    mkdirSync(target);
    if (!existsSync(alias)) return false;
    const targetStat = lstatSync(target);
    const aliasStat = lstatSync(alias);
    return targetStat.dev === aliasStat.dev && targetStat.ino === aliasStat.ino;
  });
}

/** Report whether removing read permissions is enforced for the current process. */
export function canEnforceUnreadableFile(root) {
  return withProbeDirectory(root, (probeRoot) => {
    const target = join(probeRoot, "target");
    writeFileSync(target, "target\n");
    chmodSync(target, 0o000);
    let descriptor;
    try {
      descriptor = openSync(target, FS_CONSTANTS.O_RDONLY);
      return false;
    } catch (error) {
      return error?.code === "EACCES" || error?.code === "EPERM";
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      chmodSync(target, 0o600);
    }
  });
}

/** Return exact fixture bytes. */
export function readBytes(filePath) {
  return readFileSync(filePath);
}

/** Compute lowercase SHA-256 over exact bytes. */
export function sha256(value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Assert a file's exact bytes and return them. */
export function assertFileBytes(filePath, expected) {
  const actual = readFileSync(filePath);
  assert.deepEqual(actual, Buffer.from(expected));
  return actual;
}

/** Assert a file's exact SHA-256 digest. */
export function assertFileHash(filePath, expected) {
  assert.equal(sha256(readFileSync(filePath)), expected);
}

/** Capture an output's existence and exact bytes before a failure case. */
export function captureOutput(filePath) {
  return existsSync(filePath)
    ? Object.freeze({ exists: true, bytes: readFileSync(filePath) })
    : Object.freeze({ exists: false, bytes: null });
}

/** Assert that a prior output snapshot is unchanged. */
export function assertOutputPreserved(filePath, snapshot) {
  assert.equal(existsSync(filePath), snapshot.exists, `output existence changed: ${filePath}`);
  if (snapshot.exists) assert.deepEqual(readFileSync(filePath), snapshot.bytes, `output bytes changed: ${filePath}`);
}

/** Assert that an atomic writer left no adjacent temporary artifact. */
export function assertNoAdjacentTemps(targetPath) {
  const prefix = `.${basename(targetPath)}.tmp-`;
  const names = readdirSync(dirname(targetPath)).filter((name) => name.startsWith(prefix));
  assert.deepEqual(names, [], `temporary artifacts remain beside ${targetPath}`);
}

/** Assert that a directory publisher left no adjacent staged artifact. */
export function assertNoAdjacentStages(targetPath) {
  const prefix = `.${basename(targetPath)}.stage-`;
  const names = readdirSync(dirname(targetPath)).filter((name) => name.startsWith(prefix));
  assert.deepEqual(names, [], `staged artifacts remain beside ${targetPath}`);
}

/** Remove a fixture path when a test needs explicit lifecycle control. */
export function removeFixture(filePath) {
  if (existsSync(filePath)) unlinkSync(filePath);
}

/** Read a JSON fixture or generated artifact. */
export function readJsonFixture(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const LEDGER_RECORDS = Object.freeze([
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

const CONSUMED_RECORDS = Object.freeze([
  Object.freeze({ id: "C001-F001", section: "Overview" }),
  Object.freeze({ id: "C001-F002", section: "Details" }),
]);

const DRAFT_DOCUMENT = [
  "# Guide",
  "",
  "## Overview",
  "",
  "The service exposes a health endpoint.",
  "",
  "## Details",
  "",
  "Retries use exponential backoff.",
  "",
].join("\n");

const REVIEWED_DOCUMENT = `${DRAFT_DOCUMENT}\nThe backoff ceiling is thirty seconds.\n`;

function requireSuccess(result, label) {
  assert.equal(result.status, 0, `${label} failed (${result.status}): ${result.stderr}`);
  return result;
}

/**
 * Build one complete, internally consistent finalization evidence chain.
 *
 * Every gate report is produced by the real CLI against real fixtures, so a test
 * can mutate exactly one artifact and prove that finalization refuses. `mode`
 * selects the registered output mode; `reviewerEdits` controls whether the
 * semantic reviewer changed the drafted document.
 */
export function buildFinalizationFixture(root, options = {}) {
  const mode = options.mode ?? "create";
  const reviewerEdits = options.reviewerEdits !== false;
  const work = ".td-work";
  const rel = Object.freeze({
    sources: `${work}/sources.json`,
    ledger: `${work}/ledger.jsonl`,
    outline: `${work}/outline.md`,
    outlineCoverage: `${work}/outline-coverage.json`,
    document: `${work}/doc.md`,
    consumed: `${work}/consumed.jsonl`,
    preCoverage: `${work}/pre-coverage.json`,
    preLint: `${work}/pre-lint.json`,
    review: `${work}/review.json`,
    finalCoverage: `${work}/final-coverage.json`,
    finalLint: `${work}/final-lint.json`,
    extraction: `${work}/extraction.json`,
    output: options.output ?? (mode === "update" ? "guide.md" : "out/document.md"),
  });
  const paths = Object.freeze(Object.fromEntries(
    Object.entries(rel).map(([key, value]) => [key, fixturePath(root, value)])
  ));

  writeFixture(root, "notes.md", "The service exposes a health endpoint.\nRetries use exponential backoff.\n");
  const registration = [
    "--workspace-root", root,
    "--mode", mode,
    "--workdir", join(root, work),
    "--output", paths.output,
    "--notes", join(root, "notes.md"),
  ];
  if (mode === "replace") {
    writeFixture(root, rel.output, "# Prior\n\nPrior body.\n");
  }
  if (mode === "update") {
    writeFixture(root, rel.output, "# Guide\n\nPrior body.\n");
    registration.push("--update-document", paths.output);
  }
  requireSuccess(runNode(runtimeScript("source-manifest.mjs"), [...registration, "--out", paths.sources]), "register");

  writeJsonlFixture(root, `${work}/ledger.jsonl`, LEDGER_RECORDS);
  writeJsonlFixture(root, `${work}/consumed.jsonl`, CONSUMED_RECORDS);
  const ledgerSha256 = sha256(readFileSync(paths.ledger));
  writeFixture(root, `${work}/outline.md`, [
    "# Outline: Guide",
    `ledger-sha256: ${ledgerSha256}`,
    "",
    "## Overview",
    "covers: C001-F001",
    "",
    "## Details",
    "covers: C001-F002",
    "",
  ].join("\n"));
  writeFixture(root, `${work}/doc.md`, DRAFT_DOCUMENT);

  const coverage = runtimeScript("coverage.mjs");
  const lint = runtimeScript("lint.mjs");
  requireSuccess(runNode(coverage, [
    "--workspace-root", root,
    "--mode", "outline",
    "--ledger", paths.ledger,
    "--outline", paths.outline,
    "--json", paths.outlineCoverage,
  ]), "outline coverage");
  const documentCoverage = (stage, out) => runNode(coverage, [
    "--workspace-root", root,
    "--mode", "document",
    "--stage", stage,
    "--ledger", paths.ledger,
    "--consumed", paths.consumed,
    "--document", paths.document,
    "--json", out,
  ]);
  const documentLint = (stage, out) => runNode(lint, [
    "--workspace-root", root,
    "--sources", paths.sources,
    "--stage", stage,
    paths.document,
    "--json", out,
  ]);

  requireSuccess(documentCoverage("pre-review", paths.preCoverage), "pre-review coverage");
  requireSuccess(documentLint("pre-review", paths.preLint), "pre-review lint");
  const inputDocumentSha256 = sha256(readFileSync(paths.document));

  if (reviewerEdits) writeFixture(root, `${work}/doc.md`, REVIEWED_DOCUMENT);
  const outputDocumentSha256 = sha256(readFileSync(paths.document));
  requireSuccess(documentCoverage("final", paths.finalCoverage), "final coverage");
  requireSuccess(documentLint("final", paths.finalLint), "final lint");

  const review = {
    schemaVersion: 2,
    gate: "semantic-review",
    ok: true,
    reviewer: "dude-pack-technical-docs-reviewer",
    inputDocumentSha256,
    outputDocumentSha256,
    consumedSha256: sha256(readFileSync(paths.consumed)),
    preReviewCoverageSha256: sha256(readFileSync(paths.preCoverage)),
    preReviewLintSha256: sha256(readFileSync(paths.preLint)),
    touchedSections: reviewerEdits ? ["Details"] : [],
    findings: [],
  };
  writeJsonFixture(root, `${work}/review.json`, review);
  writeJsonFixture(root, `${work}/extraction.json`, {
    schemaVersion: 2,
    gate: "extraction-audit",
    stage: "extraction",
    ok: true,
    inputs: [
      { role: "ledger", path: `${work}/ledger.jsonl`, sha256: ledgerSha256 },
      { role: "result-index", path: `${work}/results.json`, sha256: sha256("result-index") },
      { role: "source-registry", path: `${work}/sources.json`, sha256: sha256(readFileSync(paths.sources)) },
    ],
    configuration: { minEntries: 2, floorPer1k: 5, ratio: 0.5 },
    counts: { expected: 1, results: 1, evidence: 1, noEvidence: 0, flagged: 0 },
    violations: [],
  });

  return Object.freeze({
    root,
    mode,
    work,
    rel,
    paths,
    review,
    ledgerSha256,
    documentSha256: outputDocumentSha256,
    reviewedDocument: reviewerEdits ? REVIEWED_DOCUMENT : DRAFT_DOCUMENT,
    args: Object.freeze([
      "--workspace-root", root,
      "--sources", paths.sources,
      "--draft", paths.document,
      "--consumed", paths.consumed,
      "--extraction", paths.extraction,
      "--outline-coverage", paths.outlineCoverage,
      "--pre-coverage", paths.preCoverage,
      "--pre-lint", paths.preLint,
      "--review", paths.review,
      "--final-coverage", paths.finalCoverage,
      "--final-lint", paths.finalLint,
    ]),
  });
}

/** Run finalize.mjs against a built evidence chain, with optional argument overrides. */
export function runFinalize(fixture, overrides = {}) {
  const args = [...fixture.args];
  for (const [flag, value] of Object.entries(overrides)) {
    const position = args.indexOf(flag);
    assert.notEqual(position, -1, `unknown finalize flag ${flag}`);
    args[position + 1] = value;
  }
  return runNode(runtimeScript("finalize.mjs"), args);
}
