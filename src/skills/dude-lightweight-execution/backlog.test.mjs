// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as backlog from "./backlog.mjs";
import {
  collectLifecycleItems,
  collectLifecycleModel,
  deriveLifecycleModel,
  parseBacklogOrder,
  parseProvisionalRelationships,
  renderCurrentMermaid,
  renderFlowchart,
  renderText,
} from "./backlog.mjs";

const BACKLOG_PATH = fileURLToPath(new URL("./backlog.mjs", import.meta.url));
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ORDER_SOURCE = ".dude/state/backlog-order.md";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeRoot(prefix = "dude-lifecycle-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relativePath, content) {
  const absolute = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function writeIdea(root, slug, options = {}) {
  const status = options.status ?? (options.feature ? "defined" : "draft");
  const feature = options.feature ?? null;
  const number = options.number ?? /^([0-9]{3})-/.exec(feature ?? "")?.[1] ?? "001";
  const lines = [
    "---",
    `title: ${options.title ?? slug}`,
    `slug: ${slug}`,
    `status: ${status}`,
    feature ? `spec_path: .dude/specs/${feature}/spec.md` : "spec_path:",
  ];
  if (options.dependsOn) lines.push(`depends-on: ${options.dependsOn}`);
  lines.push(
    "---",
    "",
    `# Idea: ${options.title ?? slug}`,
    "",
    "## Idea",
    "",
    options.body ?? `Real source excerpt for ${slug}.`,
    "",
    "## Coordinator Log",
    "",
    ...(options.log ?? []).map((entry) => `- ${entry}`),
    "",
  );
  writeFile(root, `.dude/ideas/${number}-${slug}.md`, lines.join("\n"));
}

function writePackage(root, feature, options = {}) {
  const stories = options.stories ?? ["User Story 1 - Trace real evidence (Priority: P1)"];
  writeFile(root, `.dude/specs/${feature}/spec.md`, [
    `# Feature Specification: ${feature}`,
    "",
    "## User Stories & Testing",
    "",
    ...stories.flatMap((story) => [`### ${story}`, "", "Story body.", ""]),
  ].join("\n"));
  writeFile(root, `.dude/specs/${feature}/tasks.md`, options.tasks ?? [
    `# Tasks: ${feature}`,
    "",
    "## Phase 1: Delivery",
    "",
    "- [ ] T001@aaaaaaaa Implement the feature",
    "",
  ].join("\n"));
}

/** Stand-ins for report copies an earlier Dude version left in a project. */
function writeEarlierReportCopies(root) {
  writeFile(root, ".dude/backlog.md", "# Backlog\n\nEarlier-version Markdown copy.\n");
  writeFile(root, ".dude/backlog.html", "<!doctype html>\n<p>Earlier-version HTML copy.</p>\n");
}

function fixtureItem(slug, overrides = {}) {
  const tasks = overrides.tasks ?? [];
  const counts = {
    open: tasks.filter((task) => task.state === "todo").length,
    active: tasks.filter((task) => task.state === "in-progress").length,
    blocked: tasks.filter((task) => task.state === "blocked").length,
    done: tasks.filter((task) => task.state === "done").length,
    total: tasks.length,
  };
  return {
    identity: `.dude/ideas/${slug}.md`,
    ideaPath: `.dude/ideas/${slug}.md`,
    slug,
    status: overrides.defined ? "defined" : "draft",
    defined: false,
    specPath: null,
    dependsOn: [],
    provisionalRelationships: [],
    tasks,
    taskCounts: counts,
    tasksAvailable: overrides.tasksAvailable ?? tasks.length > 0,
    packageComplete: false,
    hasInProgress: false,
    ownBlocked: false,
    unavailableDetail: null,
    ...overrides,
    taskCounts: overrides.taskCounts ?? counts,
  };
}

function partitionRows(model) {
  return [
    ...model.current.blocked,
    ...model.current.active,
    ...model.current.next,
    ...model.planned.awaitingDefinition,
    ...model.planned.definedAwaitingWork,
    ...model.planned.prioritizedLater,
    ...model.completed,
  ];
}

function assertPartition(model, expectedItems) {
  const rows = partitionRows(model);
  assert.equal(rows.length, expectedItems.length, "partition row count");
  assert.equal(new Set(rows.map((item) => item.identity)).size, expectedItems.length, "partition identities are unique");
  assert.deepEqual(
    rows.map((item) => item.identity).sort(),
    expectedItems.map((item) => item.identity).sort(),
    "partition union equals the inventory",
  );
}

function snapshotTree(root) {
  const rows = [];
  const visit = (directory, prefix) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) rows.push(`link ${relative} ${fs.readlinkSync(absolute)}`);
      else if (stat.isDirectory()) {
        rows.push(`dir ${relative}`);
        visit(absolute, relative);
      } else if (stat.isFile()) rows.push(`file ${relative} ${sha256(fs.readFileSync(absolute))}`);
    }
  };
  visit(root, "");
  return rows;
}

function runCli(root, args) {
  return spawnSync(process.execPath, [BACKLOG_PATH, ...args, "--root", root], { encoding: "utf8" });
}

/** Remove only the new record suffix when asserting the pre-existing text. */
function withoutStages(text) {
  return text.replace(/ · (?:Captured|Defined|In progress|Blocked|Completed|Closed|stage unavailable)$/gm, "");
}

/** Read the printed group lists as title -> entries. */
function printedGroups(text) {
  const groups = new Map();
  let rows = null;
  for (const line of withoutStages(text).split("\n")) {
    const heading = /^(.+) \(\d+\):$/.exec(line);
    if (heading) {
      rows = [];
      groups.set(heading[1], rows);
    } else if (line === "") rows = null;
    else if (rows && line !== "  (none)") rows.push(line.slice(2));
  }
  return groups;
}

/** Read the printed Dependency and order notes without their indentation. */
function printedNotes(text) {
  const lines = text.split("\n");
  const start = lines.indexOf("Dependency and order notes:");
  assert.ok(start > 0, "the notes section is printed after the groups");
  const notes = [];
  for (const line of lines.slice(start + 1)) {
    if (line === "") break;
    assert.match(line, /^ {2}\S/, "each note is one indented line");
    notes.push(line.slice(2));
  }
  return notes;
}

test("067 Work type: classified ledgers leave backlog collection and all views unchanged", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "draft", { number: "001" });
    writeIdea(root, "defined", { feature: "002-defined", dependsOn: "resolved" });
    writePackage(root, "002-defined", { tasks: "- [~] T001@aaaaaaaa Keep recorded work.\n" });
    writeIdea(root, "resolved", { number: "003", status: "resolved" });
    writeIdea(root, "unclassified", { number: "004" });
    const originals = new Map(["001-draft", "002-defined", "003-resolved"].map((stem) => {
      const relative = `.dude/ideas/${stem}.md`;
      return [relative, fs.readFileSync(path.join(root, relative), "utf8")];
    }));
    const unclassified = fs.readFileSync(path.join(root, ".dude/ideas/004-unclassified.md"));
    const items = collectLifecycleItems({ root });
    const model = collectLifecycleModel({ root });
    const views = [[], ["kanban"], ["flowchart", "defined"]].map((args) => runCli(root, args));
    for (const lines of [
      "work_intent: fix\nwork_domain: code\n",
      "work_intent:\nwork_domain: unknown\n",
    ]) {
      for (const [relative, original] of originals) {
        writeFile(root, relative, original.replace("---\n\n# Idea", `${lines}---\n\n# Idea`));
      }
      const before = snapshotTree(root);

      assert.deepEqual(collectLifecycleItems({ root }), items);
      assert.deepEqual(collectLifecycleModel({ root }), model);
      for (const [index, args] of [[], ["kanban"], ["flowchart", "defined"]].entries()) {
        const result = runCli(root, args);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, views[index].stdout);
        assert.equal(result.stderr, views[index].stderr);
      }
      assert.deepEqual(snapshotTree(root), before);
      assert.deepEqual(fs.readFileSync(path.join(root, ".dude/ideas/004-unclassified.md")), unclassified);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("067 Work type: progress prints the recorded report and every form writes nothing", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "login-timeout-fix", { feature: "901-login-timeout-fix" });
    const ideaPath = ".dude/ideas/901-login-timeout-fix.md";
    writeFile(root, ideaPath, fs.readFileSync(path.join(root, ideaPath), "utf8")
      .replace("status: defined\n", "status: defined\nwork_domain: code\nwork_intent: fix\n"));
    writePackage(root, "901-login-timeout-fix", { tasks: [
      "# Tasks", "", "## Phase 2: User Story 1 - Keep the session", "",
      "- [~] T001@aaaaaaaa Keep the session", "",
    ].join("\n") });
    const before = snapshotTree(root);
    const report = runCli(root, ["progress", "login-timeout-fix"]);
    assert.equal(report.status, 0, report.stderr);
    assert.equal(report.stderr, "");
    assert.equal(report.stdout, [
      "901 login-timeout-fix · Fix · Code",
      "Stage: In progress (.dude/specs/901-login-timeout-fix/tasks.md)",
      "Current phase: Phase 2: User Story 1 - Keep the session (.dude/specs/901-login-timeout-fix/tasks.md)",
      "Requests for you: unavailable. This view cannot read current requests.",
      "No design status or required gate is recorded.",
      "",
    ].join("\n"));
    for (const args of [[], ["kanban"], ["flowchart", "login-timeout-fix"], ["--tracked"],
      ["progress", "login-timeout-fix", "--tracked"], ["--help"]]) {
      const result = runCli(root, args);
      assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    }
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("067 Work type: progress refuses unknown, duplicate, and unreadable selectors without fallback", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "draft", { number: "001", title: "Not A Selector" });
    writeIdea(root, "duplicate", { number: "002" });
    writeIdea(root, "duplicate", { number: "003" });
    writeFile(root, ".dude/ideas/004-unreadable.md",
      "---\ntitle: Unreadable\nslug: unreadable\nslug: unreadable\nstatus: draft\nspec_path:\n---\n");
    writeFile(root, ".dude/ideas/005-filename-only.md",
      "---\ntitle: Missing slug\nstatus: draft\nspec_path:\n---\n");
    const before = snapshotTree(root);
    for (const slug of ["missing", "duplicate", "unreadable", "001", "001-draft", "Not A Selector", "filename-only"]) {
      const result = runCli(root, ["progress", slug]);
      assert.equal(result.status, 1, slug);
      assert.equal(result.stdout, "", slug);
      assert.equal(result.stderr, `[FAIL] no single work item has slug ${slug}\n`, slug);
    }
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("067 Work type: diagrams refuse --tracked as an unknown option without writing", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "defined", { feature: "001-defined" });
    writePackage(root, "001-defined");
    const before = snapshotTree(root);
    for (const args of [["kanban", "--tracked"], ["flowchart", "defined", "--tracked"]]) {
      const result = runCli(root, args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "[FAIL] unknown option: --tracked\n");
    }
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("067 Work type: every overview stage equals its report, preserving groups, order, summary, notes, and diagrams", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "captured", { number: "001" });
    writeIdea(root, "defined", { feature: "002-defined" });
    writePackage(root, "002-defined", { tasks: "- [ ] T001@aaaaaaaa Ready work\n" });
    writeIdea(root, "active", { feature: "003-active", body: "Records `depends-on: captured` provisionally." });
    writePackage(root, "003-active", { tasks: [
      "## Build", "- [~] T001@aaaaaaaa Work", "### Review", "- [~] T002@bbbbbbbb Review",
      "   deps: T001@aaaaaaaa", "",
    ].join("\n") });
    writeIdea(root, "blocked", { feature: "004-blocked" });
    writePackage(root, "004-blocked", { tasks: "- [!] T001@aaaaaaaa Wait\n" });
    writeIdea(root, "completed", { feature: "005-completed" });
    writePackage(root, "005-completed", { tasks: "- [x] T001@aaaaaaaa Done\n" });
    writeIdea(root, "closed", { number: "006", status: "resolved" });
    writeIdea(root, "unavailable", { feature: "007-unavailable" });
    writePackage(root, "007-unavailable");
    fs.rmSync(path.join(root, ".dude/specs/007-unavailable/tasks.md"));
    writeIdea(root, "dependency", { feature: "008-dependency", dependsOn: "captured" });
    writePackage(root, "008-dependency", { tasks: "- [ ] T001@aaaaaaaa Not started\n" });
    writeFile(root, ORDER_SOURCE, "- defined\n- captured\n");
    const before = snapshotTree(root);
    const overview = runCli(root, []);
    assert.equal(overview.status, 0, overview.stderr);
    const oldText = [
      "Where are we: current 3; ready/next 1; awaiting definition 1; defined awaiting work 1; completed 2",
      "",
      "Blocked (2):", "  004 blocked", "  008 dependency", "",
      "Active (1):", "  003 active", "",
      "Next (1):", "  002 defined", "",
      "Ideas awaiting definition (0):", "  (none)", "",
      "Defined awaiting work (1):", "  007 unavailable", "",
      "Prioritized for later (1):", "  001 captured", "",
      "Completed (2):", "  005 completed", "  006 closed", "",
      "Dependency and order notes:",
      "  Explicit feature order is declared in .dude/state/backlog-order.md.",
      "  Declared: dependency depends on captured.",
      "  Provisional, non-authoritative: active states a relationship to captured. This does not affect lifecycle classification.",
      "",
    ].join("\n");
    assert.equal(withoutStages(overview.stdout), oldText);
    const expected = new Map([
      ["captured", "Captured"], ["defined", "Defined"], ["active", "In progress"], ["blocked", "Blocked"],
      ["completed", "Completed"], ["closed", "Closed"], ["unavailable", null], ["dependency", "Defined"],
    ]);
    for (const tracked of [false, true]) {
      const result = runCli(root, tracked ? ["--tracked"] : []);
      assert.equal(result.status, 0, result.stderr);
      const trackedLine = "Defined work shows stage unavailable because tracked work is authoritative and this view does not read it.";
      if (tracked) {
        assert.equal(result.stdout.split("\n")[1], trackedLine);
        assert.equal(withoutStages(result.stdout).replace(`\n${trackedLine}`, ""), oldText);
      }
      for (const [slug, stage] of expected) {
        const value = tracked && !["captured", "closed"].includes(slug) ? null : stage;
        const report = runCli(root, ["progress", slug, ...(tracked ? ["--tracked"] : [])]);
        assert.equal(report.status, 0, `${slug}: ${report.stderr}`);
        const line = result.stdout.split("\n").find((row) => row.includes(` ${slug} · `));
        assert.ok(line?.endsWith(` · ${value ?? "stage unavailable"}`), line);
        const stageLine = report.stdout.split("\n").find((row) => row.startsWith("Stage: "));
        assert.ok(stageLine?.startsWith(value === null ? "Stage: unavailable. " : `Stage: ${value} (`), report.stdout);
        assert.match(report.stdout, /Requests for you: unavailable\. This view cannot read current requests\./);
        assert.doesNotMatch(report.stdout, /Requests for you: (?:None|\[\])/);
        if (slug === "closed") assert.match(report.stdout, /Closing does not mean the work was implemented\./);
        if (slug === "active" && !tracked) {
          assert.match(report.stdout, /Current phase: Build \(/);
          assert.match(report.stdout, /Current phase: Review \(/);
        }
      }
    }
    const kanban = runCli(root, ["kanban"]);
    assert.equal(kanban.status, 0, kanban.stderr);
    assert.equal(kanban.stdout, [
      "```mermaid", "kanban", "  blocked[Blocked]", "    work_1[004 blocked]", "    work_2[008 dependency]",
      "  active[Active]", "    work_3[003 active]", "  next[Next]", "    work_4[002 defined]", "```", "",
    ].join("\n"));
    const flowchart = runCli(root, ["flowchart", "active"]);
    assert.equal(flowchart.status, 0, flowchart.stderr);
    assert.equal(flowchart.stdout, [
      "```mermaid", "flowchart TD", "  %% active",
      '  T001_aaaaaaaa["T001@aaaaaaaa Work"]', '  T002_bbbbbbbb["T002@bbbbbbbb Review"]',
      "  T001_aaaaaaaa --> T002_bbbbbbbb", "```", "",
    ].join("\n"));
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("067 Work type: reports keep proposed design through unreadable or ambiguous tasks and disclose unreadable specifications", () => {
  const root = makeRoot();
  try {
    for (const [number, slug] of [["001", "unreadable-tasks"], ["002", "ambiguous-tasks"], ["003", "unreadable-spec"]]) {
      const feature = `${number}-${slug}`;
      writeIdea(root, slug, { feature });
      writePackage(root, feature);
      writeFile(root, `.dude/specs/${feature}/spec.md`, "---\nwork_type: design\ndesign_status: proposed\n---\n");
    }
    fs.rmSync(path.join(root, ".dude/specs/001-unreadable-tasks/tasks.md"));
    writeFile(root, ".dude/specs/002-ambiguous-tasks/tasks.md",
      "- [x] T001@aaaaaaaa First\n- [x] T001@aaaaaaaa Duplicate\n");
    fs.rmSync(path.join(root, ".dude/specs/003-unreadable-spec/spec.md"));
    const before = snapshotTree(root);
    for (const slug of ["unreadable-tasks", "ambiguous-tasks", "unreadable-spec"]) {
      const result = runCli(root, ["progress", slug]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Stage: unavailable\./);
      assert.match(result.stdout, /Current phases: unavailable\./);
      if (slug === "unreadable-spec") {
        assert.match(result.stdout, /Design status and required gates: unavailable\. The linked feature definition is unavailable or ambiguous\./);
        assert.doesNotMatch(result.stdout, /No .*recorded|Checkpoint:|Required gate:/);
      } else {
        const source = `.dude/specs/${slug === "unreadable-tasks" ? "001" : "002"}-${slug}/spec.md`;
        assert.ok(result.stdout.includes(`Design status: Proposed (${source})`));
        assert.ok(result.stdout.includes(`Checkpoint: Design proposed (${source})`));
        assert.ok(result.stdout.includes(`Required gate: Design approval (${source})`));
        assert.doesNotMatch(result.stdout, /No .*recorded/);
      }
      assert.match(result.stdout, /Requests for you: unavailable\. This view cannot read current requests\./);
    }
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T001 lifecycle model partitions zero, one, and arbitrary inventories exactly once", () => {
  const empty = deriveLifecycleModel({ items: [], order: [] });
  assertPartition(empty, []);
  assert.deepEqual(empty.summary, {
    currentWork: 0,
    readyNext: 0,
    ideasAwaitingDefinition: 0,
    definedAwaitingWork: 0,
    completed: 0,
  });

  const solo = fixtureItem("solo");
  const one = deriveLifecycleModel({ items: [solo], order: [] });
  assertPartition(one, [solo]);
  assert.deepEqual(one.planned.awaitingDefinition.map((item) => item.slug), ["solo"]);

  const many = Array.from({ length: 47 }, (_, index) => fixtureItem(`idea-${String(index).padStart(2, "0")}`));
  const arbitrary = deriveLifecycleModel({ items: many, order: [] });
  assertPartition(arbitrary, many);
  assert.equal(arbitrary.summary.ideasAwaitingDefinition, 47);
});

test("T001 lifecycle model classifies Current, Planned, conditional Later, and Completed with derived counts", () => {
  const completed = fixtureItem("completed", { defined: true, packageComplete: true });
  const blocked = fixtureItem("blocked", { defined: true, ownBlocked: true });
  const active = fixtureItem("active", { defined: true, hasInProgress: true });
  const next = fixtureItem("next", { defined: true });
  const later = fixtureItem("later", { defined: true });
  const draft = fixtureItem("draft");
  const defined = fixtureItem("defined", { defined: true });
  const items = [completed, blocked, active, next, later, draft, defined];
  const model = deriveLifecycleModel({ items, order: ["next", "later"] });

  assertPartition(model, items);
  assert.deepEqual(model.current.blocked.map((item) => item.slug), ["blocked"]);
  assert.deepEqual(model.current.active.map((item) => item.slug), ["active"]);
  assert.deepEqual(model.current.next.map((item) => item.slug), ["next"]);
  assert.deepEqual(model.planned.awaitingDefinition.map((item) => item.slug), ["draft"]);
  assert.deepEqual(model.planned.definedAwaitingWork.map((item) => item.slug), ["defined"]);
  assert.deepEqual(model.planned.prioritizedLater.map((item) => item.slug), ["later"]);
  assert.deepEqual(model.completed.map((item) => item.slug), ["completed"]);
  assert.deepEqual(model.summary, {
    currentWork: 2,
    readyNext: 1,
    ideasAwaitingDefinition: 1,
    definedAwaitingWork: 2,
    completed: 1,
  });

  const withoutOrder = deriveLifecycleModel({ items: [next, later], order: [] });
  assert.equal(withoutOrder.planned.prioritizedLater.length, 0);
  assert.equal(withoutOrder.current.next.length, 0);
});

test("T001 printed view keeps its summary and lifecycle groups, then prints dependency and order notes", () => {
  // Arrange
  const model = deriveLifecycleModel({
    items: [
      fixtureItem("completed", { defined: true, packageComplete: true }),
      fixtureItem("blocked", { defined: true, ownBlocked: true }),
      fixtureItem("active", { defined: true, hasInProgress: true }),
      fixtureItem("next", { defined: true }),
      fixtureItem("later", { defined: true }),
      fixtureItem("draft"),
      fixtureItem("defined", { defined: true }),
    ],
    order: ["next", "later"],
  });
  const emptyCurrent = deriveLifecycleModel({ items: [fixtureItem("draft")], order: [] });

  // Act
  const text = renderText(model);
  const emptyText = renderText(emptyCurrent);

  // Assert
  assert.equal(withoutStages(text), [
    "Where are we: current 2; ready/next 1; awaiting definition 1; defined awaiting work 2; completed 1",
    "",
    "Blocked (1):", "  blocked", "",
    "Active (1):", "  active", "",
    "Next (1):", "  next", "",
    "Ideas awaiting definition (1):", "  draft", "",
    "Defined awaiting work (1):", "  defined", "",
    "Prioritized for later (1):", "  later", "",
    "Completed (1):", "  completed", "",
    "Dependency and order notes:",
    "  Explicit feature order is declared in .dude/state/backlog-order.md.",
    "  No declared feature dependencies are present.",
    "  No provisional body-stated dependency evidence was recognized.",
    "",
  ].join("\n"));
  assert.equal(withoutStages(emptyText), [
    "Where are we: current 0; ready/next 0; awaiting definition 1; defined awaiting work 0; completed 0",
    "",
    "Blocked (0):", "  (none)", "",
    "Active (0):", "  (none)", "",
    "Next (0):", "  (none)", "",
    "Ideas awaiting definition (1):", "  draft", "",
    "Defined awaiting work (0):", "  (none)", "",
    "Completed (0):", "  (none)", "",
    "Dependency and order notes:",
    "  No explicit feature order declared.",
    "  No declared feature dependencies are present.",
    "  No provisional body-stated dependency evidence was recognized.",
    "",
  ].join("\n"));
});

test("T001 printed views are read-only and byte-identical across repeated reads and differently named roots", () => {
  // Arrange
  const left = makeRoot("lifecycle-alpha-");
  const right = makeRoot("lifecycle-very-different-root-name-");
  const forms = [[], ["kanban"], ["flowchart", "active-one"]];
  try {
    for (const root of [left, right]) {
      writeIdea(root, "draft-one", { title: "Draft One", log: ["2026-08-01 UTC - brainstorm captured"] });
      writeIdea(root, "active-one", { feature: "101-active-one", title: "Active One", dependsOn: "done-one" });
      writePackage(root, "101-active-one", { tasks: [
        "# Tasks: active-one", "", "## Phase 1: Work", "",
        "- [~] T001@aaaaaaaa Active task",
        "- [ ] T002@cccccccc Follow-up task", "   deps: T001@aaaaaaaa", "",
      ].join("\n") });
      writeIdea(root, "done-one", { feature: "102-done-one", title: "Done One" });
      writePackage(root, "102-done-one", { tasks: [
        "# Tasks: done-one", "", "## Phase 1: Work", "", "- [x] T001@bbbbbbbb Completed task", "",
      ].join("\n") });
      writeFile(root, ORDER_SOURCE, "- active-one\n");
      writeEarlierReportCopies(root);
    }
    const before = { left: snapshotTree(left), right: snapshotTree(right) };

    // Act
    const read = (root) => forms.map((args) => runCli(root, args));
    const first = read(left);
    const repeat = read(left);
    const other = read(right);

    // Assert
    for (const [index, args] of forms.entries()) {
      const label = args.join(" ") || "default";
      assert.equal(first[index].status, 0, `${label}: ${first[index].stderr}`);
      assert.equal(first[index].stderr, "", label);
      assert.equal(repeat[index].stdout, first[index].stdout, `${label}: repeated read`);
      assert.equal(other[index].stdout, first[index].stdout, `${label}: differently named root`);
    }
    assert.deepEqual(printedNotes(first[0].stdout), [
      "Explicit feature order is declared in .dude/state/backlog-order.md.",
      "Declared: active-one depends on done-one.",
      "No provisional body-stated dependency evidence was recognized.",
    ]);
    assert.match(first[1].stdout, /^```mermaid\nkanban\n {2}active\[Active\]\n {4}work_1\[101 active-one\]\n```\n$/);
    assert.match(first[2].stdout, /T001_aaaaaaaa --> T002_cccccccc/);
    assert.deepEqual(snapshotTree(left), before.left, "left root, including earlier report copies, is unchanged");
    assert.deepEqual(snapshotTree(right), before.right, "right root, including earlier report copies, is unchanged");
  } finally {
    fs.rmSync(left, { recursive: true, force: true });
    fs.rmSync(right, { recursive: true, force: true });
  }
});

test("T001 live inventory remains count-agnostic and one-to-one", () => {
  const model = collectLifecycleModel({ root: REPO_ROOT });
  const ideasDirectory = path.join(REPO_ROOT, ".dude", "ideas");
  const safeDirectIdeas = fs.readdirSync(ideasDirectory, { withFileTypes: true }).filter((entry) => {
    if (!entry.name.endsWith(".md")) return false;
    const stat = fs.lstatSync(path.join(ideasDirectory, entry.name));
    return stat.isFile() && !stat.isSymbolicLink();
  });
  assert.equal(model.items.length, safeDirectIdeas.length);
  assertPartition(model, model.items);
});

test("T001 output source omits wall-clock, Git revision, checkout title, and fingerprint slots", () => {
  const source = fs.readFileSync(BACKLOG_PATH, "utf8");
  for (const banned of ["new Date", "child_process", "execSync", "rev-parse", "path.basename", "GENERATED_AT", "SOURCE_REV"]) {
    assert.equal(source.includes(banned), false, banned);
  }
});

test("T030 only an exact package-less resolved shape reaches Completed", () => {
  const root = makeRoot();
  try {
    // Arrange
    const writeLifecycleIdea = (number, slug, frontmatter) => writeFile(root, `.dude/ideas/${number}-${slug}.md`, [
      "---",
      `title: ${slug}`,
      `slug: ${slug}`,
      ...frontmatter,
      "---",
      "",
      `# Idea: ${slug}`,
      "",
      "## Idea",
      "",
      `Lifecycle fixture for ${slug}.`,
      "",
      "## Coordinator Log",
      "",
    ].join("\n"));
    writeFile(root, ".dude/specs/401-canonical/spec.md", "# Canonical raw-path fixture\n");
    writeLifecycleIdea("001", "resolved", ["status: resolved", "spec_path:"]);
    writeLifecycleIdea("002", "nonempty-canonical", [
      "status: resolved",
      "spec_path: .dude/specs/401-canonical/spec.md",
    ]);
    writeLifecycleIdea("003", "malformed-path", ["status: resolved", "spec_path: not-a-canonical-spec-path"]);
    writeLifecycleIdea("004", "diagnostic-bearing", ["status: resolved", "spec_path:", "depends-on: invalid!"]);
    writeLifecycleIdea("005", "malformed-frontmatter", ["status: resolved", "status: resolved", "spec_path:"]);
    writeLifecycleIdea("006", "nonexact-status", ['status: "resolved"', "spec_path:"]);
    const ownerClaim = fixtureItem("owner-claim", {
      status: "resolved",
      rawStatus: "resolved",
      rawSpecPath: "",
      ownerSpecPath: ".dude/specs/499-owner-claim/spec.md",
      defined: true,
      packageComplete: true,
      tasksAvailable: true,
    });

    // Act
    const collected = collectLifecycleItems({ root });
    const model = deriveLifecycleModel({ items: [...collected, ownerClaim], order: [] });
    const printed = printedGroups(renderText(model));
    const bySlug = new Map(model.items.map((item) => [item.slug, item]));

    // Assert
    const resolved = bySlug.get("resolved");
    assert.ok(resolved);
    assert.deepEqual(
      {
        status: resolved.status,
        rawStatus: resolved.rawStatus,
        rawSpecPath: resolved.rawSpecPath,
        ownerSpecPath: resolved.ownerSpecPath,
        resolvedCandidate: resolved.resolvedCandidate,
        resolved: resolved.resolved,
        defined: resolved.defined,
        specPath: resolved.specPath,
        tasksAvailable: resolved.tasksAvailable,
        packageComplete: resolved.packageComplete,
        taskCounts: resolved.taskCounts,
      },
      {
        status: "resolved",
        rawStatus: "resolved",
        rawSpecPath: "",
        ownerSpecPath: null,
        resolvedCandidate: true,
        resolved: true,
        defined: false,
        specPath: null,
        tasksAvailable: false,
        packageComplete: false,
        taskCounts: { open: 0, active: 0, blocked: 0, done: 0, total: 0 },
      },
    );

    const invalidSlugs = [
      "nonempty-canonical",
      "malformed-path",
      "diagnostic-bearing",
      "malformed-frontmatter",
      "nonexact-status",
      "owner-claim",
    ];
    for (const slug of invalidSlugs) {
      const item = bySlug.get(slug);
      assert.ok(item, slug);
      assert.equal(item.resolved, false, slug);
      assert.notEqual(item.group, "completed", slug);
    }
    assert.equal(bySlug.get("nonempty-canonical").ownerSpecPath, null);
    assert.equal(bySlug.get("nonempty-canonical").resolvedCandidate, true);
    assert.equal(bySlug.get("owner-claim").resolvedCandidate, true);
    assert.equal(bySlug.get("owner-claim").defined, false);
    assert.equal(bySlug.get("owner-claim").packageComplete, false);
    assert.deepEqual(model.completed.map((item) => item.slug), ["resolved"]);
    assert.equal(model.summary.completed, 1);
    assertPartition(model, [...collected, ownerClaim]);
    assert.deepEqual(printed.get("Completed"), ["001 resolved"], "the printed view lists only the resolved ledger as Completed");
    for (const [title, rows] of printed) {
      if (title !== "Completed") assert.equal(rows.includes("001 resolved"), false, title);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 collector exposes the exact owner and the task graph the flowchart reads", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "evidence", {
      feature: "201-evidence",
      title: "Evidence < Feature",
      body: "A real idea excerpt with https://example.test/path and source detail.",
      log: [
        "2026-08-03 UTC - brainstorm captured",
        "2026-08-04 UTC - defined -> .dude/specs/201-evidence/spec.md",
      ],
    });
    writePackage(root, "201-evidence", {
      stories: ["User Story 1 - Inspect exact evidence (Priority: P1)", "User Story 2 - Keep literal tasks (Priority: P2)"],
      tasks: [
        "# Tasks: evidence", "", "## Phase 1: Evidence", "",
        "- [~] T001@aaaaaaaa Collect real evidence", "",
        "## Phase 2: Delivery", "",
        "- [x] T002@bbbbbbbb Preserve historical blocker", "   deps: T001@aaaaaaaa", "   blocked-by: historical only", "",
      ].join("\n"),
    });
    const item = collectLifecycleItems({ root })[0];
    assert.equal(item.ideaPath, ".dude/ideas/201-evidence.md");
    assert.equal(item.specPath, ".dude/specs/201-evidence/spec.md");
    assert.deepEqual(item.tasks, [
      { id: "T001@aaaaaaaa", description: "Collect real evidence", deps: [] },
      { id: "T002@bbbbbbbb", description: "Preserve historical blocker", deps: ["T001@aaaaaaaa"] },
    ]);
    assert.deepEqual(item.taskCounts, { open: 0, active: 1, blocked: 0, done: 1, total: 2 });
    assert.equal(item.ownBlocked, false, "a completed task's blocker stays historical");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 collector blocker regression: blank metadata and live blockers", async (t) => {
  const cases = [
    { name: "active task with empty blocker", glyph: "~", reason: "",
      count: "active", group: "active", ownBlocked: false },
    { name: "active task with whitespace-only blocker", glyph: "~", reason: " \t ",
      count: "active", group: "active", ownBlocked: false },
    { name: "open task with empty blocker", glyph: " ", reason: "",
      count: "open", group: "defined-awaiting-work", ownBlocked: false },
    { name: "open task with whitespace-only blocker", glyph: " ", reason: " \t ",
      count: "open", group: "defined-awaiting-work", ownBlocked: false },
    { name: "active task with genuine blocker", glyph: "~", reason: "external-dependency: waiting on service",
      count: "active", group: "blocked", ownBlocked: true },
    { name: "open task with genuine blocker", glyph: " ", reason: "external-dependency: waiting on service",
      count: "open", group: "blocked", ownBlocked: true },
    { name: "explicit blocked glyph without a reason", glyph: "!", reason: null,
      count: "blocked", group: "blocked", ownBlocked: true },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      // Arrange
      const root = makeRoot();
      try {
        const feature = "202-blocker-regression";
        const tasksPath = `.dude/specs/${feature}/tasks.md`;
        const tasks = [
          "# Tasks: blocker-regression", "", "## Phase 1: Work", "",
          `- [${scenario.glyph}] T001@aaaaaaaa Live work`,
          // The separator space makes an empty emitted reason parse as "", not absent metadata.
          ...(scenario.reason === null ? [] : [`   blocked-by: ${scenario.reason}`]),
          "",
        ].join("\n");
        writeIdea(root, "blocker-regression", { feature });
        writePackage(root, feature, { tasks });

        // Act
        const model = collectLifecycleModel({ root });
        const item = model.items[0];

        // Assert
        assert.equal(model.items.length, 1);
        assert.equal(item.ownerSpecPath, `.dude/specs/${feature}/spec.md`);
        assert.equal(item.authoritySlug, "blocker-regression");
        assert.deepEqual(item.authorityIssues, []);
        assert.equal(item.tasksAvailable, true);
        assert.deepEqual(item.taskWarnings, []);
        assert.deepEqual(item.tasks, [{ id: "T001@aaaaaaaa", description: "Live work", deps: [] }]);
        assert.deepEqual(item.taskCounts, {
          open: 0, active: 0, blocked: 0, done: 0, total: 1, [scenario.count]: 1,
        });
        assert.equal(item.ownBlocked, scenario.ownBlocked);
        assert.equal(item.group, scenario.group);
        assert.deepEqual(partitionRows(model), [item]);
        assert.equal(fs.readFileSync(path.join(root, tasksPath), "utf8"), tasks);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("T002 collector blocker regression: completed blockers stay historical", () => {
  // Arrange
  const root = makeRoot();
  try {
    const feature = "203-historical-blocker";
    const tasksPath = `.dude/specs/${feature}/tasks.md`;
    const tasks = [
      "# Tasks: historical-blocker", "", "## Phase 1: Work", "",
      "- [~] T001@aaaaaaaa Live work",
      "- [x] T002@bbbbbbbb Previously blocked work",
      "   blocked-by: historical only",
      "",
    ].join("\n");
    writeIdea(root, "historical-blocker", { feature });
    writePackage(root, feature, { tasks });

    // Act
    const model = collectLifecycleModel({ root });
    const item = model.items[0];

    // Assert
    assert.equal(model.items.length, 1);
    assert.equal(item.ownerSpecPath, `.dude/specs/${feature}/spec.md`);
    assert.equal(item.authoritySlug, "historical-blocker");
    assert.deepEqual(item.authorityIssues, []);
    assert.equal(item.tasksAvailable, true);
    assert.deepEqual(item.taskWarnings, []);
    assert.deepEqual(item.taskCounts, { open: 0, active: 1, blocked: 0, done: 1, total: 2 });
    assert.equal(item.packageComplete, false);
    assert.equal(item.ownBlocked, false);
    assert.equal(item.group, "active");
    assert.deepEqual(model.current.active, [item]);
    assert.deepEqual(model.current.blocked, []);
    assert.equal(fs.readFileSync(path.join(root, tasksPath), "utf8"), tasks);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 malformed idea metadata stays unavailable without a negative dependency claim", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeFile(root, ".dude/ideas/001-broken.md", [
      "---",
      "title: Broken metadata",
      "slug: broken",
      "status: draft",
      "status: defined",
      "depends-on: foundation",
      "---",
      "",
      "# Idea: Broken metadata",
      "",
      "## Idea",
      "",
      "Visible source body.",
      "",
    ].join("\n"));

    // Act
    const model = collectLifecycleModel({ root });
    const item = model.items[0];
    const notes = printedNotes(renderText(model));

    // Assert
    assert.equal(item.frontmatterAvailable, false);
    assert.equal(item.lifecycleAvailable, false);
    assert.equal(item.dependencyAvailable, false);
    assert.deepEqual(item.dependsOn, []);
    assert.equal(item.packageComplete, false);
    assert.match(item.unavailableDetail, /Lifecycle details are unavailable/);
    assert.match(item.authorityIssues.join("\n"), /Idea metadata is unavailable/);
    assert.deepEqual(model.relationships.unavailable, [item]);
    assert.deepEqual(notes, [
      "No explicit feature order declared.",
      "Dependency data is unavailable for broken; no negative dependency fact is inferred.",
      "No provisional body-stated dependency evidence was recognized.",
    ], "unavailable data suppresses the no-dependencies statement");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T001 duplicate exact spec-path claimants suppress authority before diagnostic filtering", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeIdea(root, "unrelated-safe", { number: "001", feature: "001-unrelated-safe" });
    writePackage(root, "001-unrelated-safe");
    writeIdea(root, "shared-claim", { number: "002", feature: "002-shared-claim" });
    writePackage(root, "002-shared-claim");
    writeFile(root, ".dude/ideas/003-malformed-claimant.md", [
      "---",
      "title: Malformed claimant",
      "slug: malformed-claimant",
      "status: defined",
      "spec_path: .dude/specs/002-shared-claim/spec.md",
      "unknown-owner-field: must-not-hide-the-claim",
      "---",
      "",
      "# Idea: Malformed claimant",
      "",
      "## Idea",
      "",
      "This malformed ledger remains visible but cannot carry authority.",
      "",
    ].join("\n"));

    // Act
    const items = collectLifecycleItems({ root });
    const byPath = new Map(items.map((item) => [item.ideaPath, item]));
    const unrelated = byPath.get(".dude/ideas/001-unrelated-safe.md");
    const safeClaimant = byPath.get(".dude/ideas/002-shared-claim.md");
    const malformedClaimant = byPath.get(".dude/ideas/003-malformed-claimant.md");

    // Assert
    assert.ok(unrelated);
    assert.ok(safeClaimant);
    assert.ok(malformedClaimant);
    assert.equal(unrelated.authoritySlug, "unrelated-safe");
    assert.equal(unrelated.ownerSpecPath, ".dude/specs/001-unrelated-safe/spec.md");
    assert.equal(safeClaimant.authoritySlug, null);
    assert.equal(safeClaimant.ownerSpecPath, null);
    assert.match(safeClaimant.authorityIssues.join("\n"), /multiple ideas claim the same spec_path/);
    assert.equal(malformedClaimant.frontmatterAvailable, false);
    assert.equal(malformedClaimant.authoritySlug, null);
    assert.match(malformedClaimant.authorityIssues.join("\n"), /Idea metadata is unavailable/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T001 same-prefix peers keep distinct authority, counts, dependencies, and path tie order", () => {
  // Arrange
  const root = makeRoot();
  const tasks = (feature, row) => [`# Tasks: ${feature}`, "", "## Phase 1: Delivery", "", row, ""].join("\n");
  try {
    // Create in reverse path order so numeric ties cannot follow creation order.
    writeIdea(root, "zeta-draft", { number: "074" });
    writeIdea(root, "gamma", { feature: "074-gamma", dependsOn: "beta" });
    writePackage(root, "074-gamma", { tasks: tasks("074-gamma", "- [ ] T001@aaaaaaaa Wait for beta") });
    writeIdea(root, "eta-draft", { number: "074" });
    writeIdea(root, "beta", { feature: "074-beta", dependsOn: "alpha" });
    writePackage(root, "074-beta", { tasks: tasks("074-beta", "- [ ] T001@aaaaaaaa Build beta") });
    writeIdea(root, "alpha", { feature: "074-alpha" });
    writePackage(root, "074-alpha", { tasks: tasks("074-alpha", "- [x] T001@aaaaaaaa Ship alpha") });
    writeIdea(root, "earlier", { number: "073" });

    // Act
    const model = collectLifecycleModel({ root });
    const bySlug = new Map(model.items.map((item) => [item.slug, item]));
    const slugs = (items) => items.map((item) => item.slug);
    const notes = printedNotes(renderText(model));

    // Assert
    assert.deepEqual(model.items.map((item) => item.ideaPath), [
      ".dude/ideas/073-earlier.md",
      ".dude/ideas/074-alpha.md",
      ".dude/ideas/074-beta.md",
      ".dude/ideas/074-eta-draft.md",
      ".dude/ideas/074-gamma.md",
      ".dude/ideas/074-zeta-draft.md",
    ]);
    for (const item of model.items) {
      assert.equal(item.authoritySlug, item.slug, item.ideaPath);
      assert.deepEqual(item.authorityIssues, [], item.ideaPath);
    }
    for (const slug of ["alpha", "beta", "gamma"]) {
      assert.equal(bySlug.get(slug).ownerSpecPath, `.dude/specs/074-${slug}/spec.md`, slug);
    }
    assert.deepEqual(bySlug.get("alpha").taskCounts, { open: 0, active: 0, blocked: 0, done: 1, total: 1 });
    assert.deepEqual(bySlug.get("beta").taskCounts, { open: 1, active: 0, blocked: 0, done: 0, total: 1 });
    assert.deepEqual(bySlug.get("gamma").taskCounts, { open: 1, active: 0, blocked: 0, done: 0, total: 1 });
    assert.deepEqual(slugs(model.completed), ["alpha"]);
    assert.deepEqual(slugs(model.current.next), ["beta"]);
    assert.deepEqual(slugs(model.current.blocked), ["gamma"]);
    assert.deepEqual(slugs(model.planned.awaitingDefinition), ["earlier", "eta-draft", "zeta-draft"]);
    assert.deepEqual(slugs(model.planned.definedAwaitingWork), []);
    // Only declared depends-on edges exist; a shared number adds none. Nodes are the model items themselves.
    assert.deepEqual(model.relationships.declared.map((relation) => [relation.from, relation.to, relation.type]), [
      [bySlug.get("alpha"), bySlug.get("beta"), "dependency"],
      [bySlug.get("beta"), bySlug.get("gamma"), "dependency"],
    ]);
    assert.equal(model.relationships.declared[0].to, bySlug.get("beta"), "relationship nodes keep model item identity");
    assert.deepEqual(model.relationships.provisional, []);
    assert.deepEqual(notes, [
      "No explicit feature order declared.",
      "Declared: beta depends on alpha.",
      "Declared: gamma depends on beta.",
      "No provisional body-stated dependency evidence was recognized.",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 malformed and duplicate task rows cannot produce package completion or Done", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeIdea(root, "malformed-tasks", { feature: "211-malformed-tasks" });
    writePackage(root, "211-malformed-tasks", { tasks: [
      "# Tasks: malformed", "", "## Phase 1: Work", "",
      "- [x] T001@aaaaaaaa Valid completed row",
      "- [x] not-a-durable-id Malformed completed row", "",
    ].join("\n") });
    writeIdea(root, "duplicate-tasks", { feature: "212-duplicate-tasks" });
    writePackage(root, "212-duplicate-tasks", { tasks: [
      "# Tasks: duplicate", "", "## Phase 1: Work", "",
      "- [x] T001@bbbbbbbb First completed row",
      "- [x] T001@bbbbbbbb Duplicate completed row", "",
    ].join("\n") });

    // Act
    const model = collectLifecycleModel({ root });

    // Assert
    assert.equal(model.completed.length, 0);
    for (const item of model.items) {
      assert.equal(item.tasksAvailable, false, item.slug);
      assert.equal(item.packageComplete, false, item.slug);
      assert.equal(item.taskCounts.done, 0, item.slug);
      assert.match(item.unavailableDetail, /Task state is unavailable/);
    }
    assert.match(model.items.find((item) => item.slug === "malformed-tasks").taskWarnings.join("\n"), /malformed task line/);
    assert.match(model.items.find((item) => item.slug === "duplicate-tasks").taskWarnings.join("\n"), /duplicate task id/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 only a literal depends-on marker is provisional evidence, and it stays classification-neutral", () => {
  // Arrange
  const marker = "The canvas records `depends-on: backlog-report` after it is first defined.";
  // The marker is the whole contract: surrounding prose is never interpreted, which is why the
  // live `.dude/ideas/backlog-canvas.md` marker sits inside explanatory prose and still counts.
  const inExample = "e.g. use `depends-on: backlog-report` once the ledger is defined.";

  // Act
  const admitted = [marker, inExample].map((body) => parseProvisionalRelationships(body));
  const target = fixtureItem("report", { defined: true, packageComplete: true });
  const withEvidence = deriveLifecycleModel({
    items: [fixtureItem("canvas", { provisionalRelationships: [{ targetSlug: "report" }] }), target],
    order: [],
  });
  const withoutEvidence = deriveLifecycleModel({ items: [fixtureItem("canvas"), target], order: [] });

  // Assert
  assert.deepEqual(admitted, [
    [{ targetSlug: "backlog-report" }],
    [{ targetSlug: "backlog-report" }],
  ]);
  assert.deepEqual(withEvidence.relationships.provisional, [{ fromSlug: "report", toSlug: "canvas" }]);
  assert.equal(withEvidence.items.find((item) => item.slug === "canvas").group, "awaiting-definition");
  assert.equal(withoutEvidence.items.find((item) => item.slug === "canvas").group, "awaiting-definition");
  assert.deepEqual(printedNotes(renderText(withEvidence)).slice(-1), [
    "Provisional, non-authoritative: canvas states a relationship to report. This does not affect lifecycle classification.",
  ]);
  assert.deepEqual(printedNotes(renderText(withoutEvidence)).slice(-1), [
    "No provisional body-stated dependency evidence was recognized.",
  ]);
});

test("T002 provisional parsing rejects natural prose, bare markers, hidden text, and blockquotes", () => {
  // Arrange
  const rejected = [
    "This depends on `backlog-report`.",
    "The canvas uses the renderer, so `backlog-report` has to ship first.",
    "e.g. this depends on `backlog-report`.",
    "This does not depend on `backlog-report`.",
    "Dependency on backlog-report is not backticked.",
    "Do not add `depends-on:` to this ledger's frontmatter.",
    "```md\nUse `depends-on: backlog-report` here.\n```",
    "<!-- Use `depends-on: backlog-report` here. -->",
    "> Use `depends-on: backlog-report` here.",
  ];

  // Act
  const parsed = rejected.map((body) => parseProvisionalRelationships(body));

  // Assert
  assert.deepEqual(parsed, rejected.map(() => []));
});

test("T002 declared dependency completion, blockage, cycles, and order parsing remain authoritative", () => {
  // Arrange
  const complete = fixtureItem("foundation", { defined: true, packageComplete: true });
  const met = fixtureItem("met", { defined: true, dependsOn: ["foundation"] });
  const unfinished = fixtureItem("unfinished", { defined: true });
  const unmet = fixtureItem("unmet", { defined: true, dependsOn: ["unfinished"] });
  const missing = fixtureItem("missing", { defined: true, dependsOn: ["absent"] });
  const cycleA = fixtureItem("cycle-a", { defined: true, dependsOn: ["cycle-b"] });
  const cycleB = fixtureItem("cycle-b", { defined: true, dependsOn: ["cycle-a"] });
  const parsedOrder = parseBacklogOrder([
    "# Explicit order",
    "- alpha",
    "2. beta",
    "* alpha",
    "plain-text",
    "3. INVALID",
    "",
  ].join("\n"));

  // Act
  const dependencyModel = deriveLifecycleModel({ items: [complete, met, unfinished, unmet, missing, cycleA, cycleB], order: [] });
  const orderModel = deriveLifecycleModel({
    items: [fixtureItem("alpha", { defined: true }), fixtureItem("beta", { defined: true }), fixtureItem("gamma", { defined: true })],
    order: ["unknown", ...parsedOrder],
  });

  // Assert
  assert.deepEqual(parsedOrder, ["alpha", "beta", "alpha"]);
  assert.deepEqual(dependencyModel.completed.map((item) => item.slug), ["foundation"]);
  assert.ok(dependencyModel.current.next.some((item) => item.slug === "met"));
  assert.ok(dependencyModel.current.blocked.some((item) => item.slug === "unmet"));
  assert.ok(dependencyModel.current.blocked.some((item) => item.slug === "missing"));
  assert.deepEqual(
    dependencyModel.current.blocked.filter((item) => item.slug.startsWith("cycle-")).map((item) => item.slug),
    ["cycle-a", "cycle-b"],
  );
  assert.equal(orderModel.relationships.hasExplicitOrder, true);
  assert.deepEqual(orderModel.current.next.map((item) => item.slug), ["alpha"]);
  assert.deepEqual(orderModel.planned.prioritizedLater.map((item) => item.slug), ["beta"]);
  assert.deepEqual(orderModel.planned.definedAwaitingWork.map((item) => item.slug), ["gamma"]);
});

test("T002 task flowchart and dependency notes read from prerequisite to dependent", () => {
  // Arrange
  const prerequisiteTask = { id: "T001@aaaaaaaa", description: "Foundation", deps: [] };
  const dependentTask = { id: "T002@bbbbbbbb", description: "Delivery", deps: ["T001@aaaaaaaa"] };
  const prerequisite = fixtureItem("foundation", { defined: true, packageComplete: true });
  const dependent = fixtureItem("delivery", { defined: true, dependsOn: ["foundation"] });

  // Act
  const flowchart = renderFlowchart([prerequisiteTask, dependentTask], { slug: "delivery" });
  const model = deriveLifecycleModel({ items: [dependent, prerequisite], order: [] });
  const notes = printedNotes(renderText(model));

  // Assert
  assert.match(flowchart, /T001_aaaaaaaa --> T002_bbbbbbbb/);
  assert.doesNotMatch(flowchart, /T002_bbbbbbbb --> T001_aaaaaaaa/);
  assert.deepEqual(notes, [
    "No explicit feature order declared.",
    "Declared: delivery depends on foundation.",
    "No provisional body-stated dependency evidence was recognized.",
  ]);
});

test("T002 explicit order notes name their source only for a valid order and never claim a dependency", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeIdea(root, "alpha", { number: "001", feature: "001-alpha" });
    writePackage(root, "001-alpha");
    writeIdea(root, "beta", { number: "002", feature: "002-beta" });
    writePackage(root, "002-beta");
    writeFile(root, ORDER_SOURCE, ["- unknown-feature", "- also-unknown", ""].join("\n"));

    // Act
    const unknownOnly = collectLifecycleModel({ root });
    const unknownNotes = printedNotes(renderText(unknownOnly));
    writeFile(root, ORDER_SOURCE, ["- alpha", "- beta", ""].join("\n"));
    const valid = collectLifecycleModel({ root });
    const validNotes = printedNotes(renderText(valid));

    // Assert
    assert.equal(unknownOnly.relationships.hasExplicitOrder, false, "an order file without a known feature is no order");
    assert.equal(unknownNotes[0], "No explicit feature order declared.");
    assert.equal(valid.relationships.hasExplicitOrder, true);
    assert.deepEqual(valid.relationships.declared, [], "explicit order adds no dependency relationship");
    assert.deepEqual(validNotes, [
      "Explicit feature order is declared in .dude/state/backlog-order.md.",
      "No declared feature dependencies are present.",
      "No provisional body-stated dependency evidence was recognized.",
    ]);
    assert.deepEqual(valid.current.next.map((item) => item.slug), ["alpha"]);
    assert.deepEqual(valid.planned.prioritizedLater.map((item) => item.slug), ["beta"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 planned backlog-canvas relation is exact, provisional, and non-authoritative", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "backlog-report", { number: "001", status: "draft" });
    writeIdea(root, "backlog-canvas", {
      number: "002",
      status: "draft",
      body: "The canvas records `depends-on: backlog-report` after it is first defined.",
    });

    const model = collectLifecycleModel({ root });
    const canvas = model.items.find((item) => item.slug === "backlog-canvas");
    assert.ok(canvas);
    assert.deepEqual(canvas.provisionalRelationships, [{ targetSlug: "backlog-report" }]);
    assert.deepEqual(model.relationships.provisional, [{ fromSlug: "backlog-report", toSlug: "backlog-canvas" }]);
    assert.deepEqual(model.relationships.declared, []);
    assert.equal(canvas.group, "awaiting-definition");
    assert.deepEqual(printedNotes(renderText(model)), [
      "No explicit feature order declared.",
      "No declared feature dependencies are present.",
      "Provisional, non-authoritative: backlog-canvas states a relationship to backlog-report. This does not affect lifecycle classification.",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 duplicate and malformed slugs keep display-only identity without dependency or order authority", () => {
  // Arrange
  const root = makeRoot();
  try {
    for (const fileSlug of ["duplicate-a", "duplicate-b"]) {
      writeFile(root, `.dude/ideas/${fileSlug === "duplicate-a" ? "001" : "002"}-${fileSlug}.md`, [
        "---", `title: ${fileSlug}`, "slug: duplicate", "status: draft", "spec_path:", "---", "",
        `# Idea: ${fileSlug}`, "", "## Idea", "", "Duplicate identity fixture.", "",
      ].join("\n"));
    }
    writeFile(root, ".dude/ideas/301-safe-id.md", [
      "---",
      "title: <img src=x onerror=alert(1)> & dangerous title",
      "slug: bad<slug>",
      "status: defined",
      "spec_path: .dude/specs/301-special/spec.md",
      "---",
      "",
      "# Idea: special",
      "",
      "## Idea",
      "",
      "**Bold** [linked <idea>](https://attacker.example/x) & `code` ~~strike~~ ![image alt](https://attacker.example/image.png)",
      "",
    ].join("\n"));
    writeFile(root, ".dude/specs/301-special/spec.md", [
      "# Feature Specification: special", "", "## User Stories & Testing", "",
      "### User Story <svg onload=alert(2)> & safe text", "",
    ].join("\n"));
    writeFile(root, ".dude/specs/301-special/tasks.md", [
      "# Tasks: special", "", "## Phase 1: <em>phase</em>", "",
      "- [~] T001@aaaaaaaa Render <script>alert(3)</script> as text",
      "   blocked-by: <iframe src=https://attacker.example></iframe>", "",
    ].join("\n"));
    writeIdea(root, "wants-safe-id", { number: "302", dependsOn: "safe-id" });
    writeFile(root, ORDER_SOURCE, ["- safe-id", "- wants-safe-id", ""].join("\n"));

    // Act
    const model = collectLifecycleModel({ root });
    const special = model.items.find((item) => item.ideaPath.endsWith("safe-id.md"));
    const wants = model.items.find((item) => item.slug === "wants-safe-id");
    const duplicates = model.items.filter((item) => item.slug === "duplicate");
    const text = renderText(model);

    // Assert
    assert.equal(duplicates.length, 2);
    assert.deepEqual(duplicates.map((item) => item.authoritySlug), [null, null]);
    assert.equal(special.slug, "safe-id");
    // The file-name slug is display identity only; it carries no dependency or order authority.
    assert.equal(special.authoritySlug, null);
    assert.match(special.authorityIssues.join("\n"), /The idea slug is malformed; the file name is used only as a stable display identity/);
    assert.equal(wants.group, "blocked");
    assert.equal(model.relationships.hasExplicitOrder, true, "only the authoritative wants-safe-id entry is a valid order");
    assert.equal(model.relationships.declared.some((relation) => relation.from === special || relation.to === special), false);
    assert.deepEqual(model.relationships.provisional, []);
    assert.deepEqual(printedNotes(text), [
      "Explicit feature order is declared in .dude/state/backlog-order.md.",
      "Declared: wants-safe-id depends on safe-id.",
      "No provisional body-stated dependency evidence was recognized.",
    ]);
    assert.doesNotMatch(text, /<(?:img|svg|script|iframe|em)\b/i, "no idea, spec, or task markup reaches the printed view");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 a malformed-slug source declares no authoritative dependency in the outgoing direction", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeIdea(root, "valid-target");
    writeFile(root, ".dude/ideas/002-malformed-source.md", [
      "---", "title: malformed source", "slug: bad<slug>", "status: draft", "spec_path:",
      "depends-on: valid-target", "---", "",
      "# Idea: malformed source", "", "## Idea", "", "Malformed dependency source fixture.", "",
    ].join("\n"));

    // Act
    const model = collectLifecycleModel({ root });
    const source = model.items.find((item) => item.ideaPath.endsWith("malformed-source.md"));
    const target = model.items.find((item) => item.slug === "valid-target");

    // Assert
    assert.equal(source.authoritySlug, null);
    assert.deepEqual(source.dependsOn, ["valid-target"]);
    // The declared dependency is evidence only; it carries no blocking, ordering, or authority weight.
    assert.notEqual(source.group, "blocked");
    assert.equal(source.group, "awaiting-definition");
    assert.equal(target.group, "awaiting-definition");
    assert.deepEqual(model.current.next, []);
    assert.deepEqual(model.relationships.declared, []);
    assert.deepEqual(model.relationships.provisional, []);
    assert.match(source.authorityIssues.join("\n"), /The idea slug is malformed; the file name is used only as a stable display identity/);
    assert.deepEqual(printedNotes(renderText(model)), [
      "No explicit feature order declared.",
      "No declared feature dependencies are present.",
      "No provisional body-stated dependency evidence was recognized.",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dependency and order notes keep order, declared, unavailable, and provisional facts in enumeration order", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeIdea(root, "foundation", { number: "001" });
    writeIdea(root, "delivery", { number: "002", dependsOn: "foundation" });
    writeIdea(root, "broken", { number: "003", dependsOn: "invalid!" });
    writeIdea(root, "report", { number: "004" });
    writeIdea(root, "canvas", { number: "005", body: "The canvas records `depends-on: report` after it is first defined." });
    writeFile(root, ORDER_SOURCE, ["- foundation", "- delivery", ""].join("\n"));

    // Act
    const model = collectLifecycleModel({ root });
    const notes = printedNotes(renderText(model));

    // Assert
    assert.deepEqual(notes, [
      "Explicit feature order is declared in .dude/state/backlog-order.md.",
      "Declared: delivery depends on foundation.",
      "Dependency data is unavailable for broken; no negative dependency fact is inferred.",
      "Provisional, non-authoritative: canvas states a relationship to report. This does not affect lifecycle classification.",
    ]);
    assert.equal(model.items.find((item) => item.slug === "canvas").group, "awaiting-definition");
    assert.equal(model.items.find((item) => item.slug === "report").group, "awaiting-definition");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dependency and order notes keep the repository's provisional backlog-canvas relationship", () => {
  // Act
  const result = runCli(REPO_ROOT, []);

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    printedNotes(result.stdout).includes(
      "Provisional, non-authoritative: backlog-canvas states a relationship to backlog-report. This does not affect lifecycle classification.",
    ),
    result.stdout,
  );
});

test("retired report: check, generate, and --write exit 1 without writing", () => {
  // Arrange
  const root = makeRoot();
  const forms = [["check"], ["generate"], ["--write"], ["generate", "--write"], ["check", "--write"]];
  try {
    writeIdea(root, "draft");
    for (const earlierCopies of [false, true]) {
      if (earlierCopies) writeEarlierReportCopies(root);
      for (const args of forms) {
        const label = `${args.join(" ")} with ${earlierCopies ? "earlier-version copies" : "no report files"}`;
        const before = snapshotTree(root);

        // Act
        const result = runCli(root, args);

        // Assert
        assert.equal(result.status, 1, label);
        assert.equal(result.stdout, "", label);
        assert.match(
          result.stderr,
          args.includes("--write") ? /^\[FAIL\] unknown option: --write\n$/ : /^\[FAIL\] unknown command: (?:check|generate)\n$/,
          label,
        );
        assert.deepEqual(snapshotTree(root), before, `${label}: no workspace write`);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("067 Work type: help lists only the four read-only forms", () => {
  // Act
  const result = spawnSync(process.execPath, [BACKLOG_PATH, "--help"], { encoding: "utf8" });

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split("\n").filter((line) => line.startsWith("  node backlog.mjs")), [
    "  node backlog.mjs [--tracked] [--root <dir>]",
    "  node backlog.mjs kanban [--root <dir>]",
    "  node backlog.mjs flowchart <idea-slug> [--root <dir>]",
    "  node backlog.mjs progress <idea-slug> [--tracked] [--root <dir>]",
    "  node backlog.mjs ship-plan <idea-slug | .dude/ideas/<NNN>-<slug>.md> [--root <dir>]",
  ]);
  assert.match(result.stdout, /dependency and order notes/);
  assert.doesNotMatch(result.stdout, /\bcheck\b|\bgenerate\b|--write|\.dude\/backlog\./);
});

test("T004 Mermaid contains current work only", () => {
  const task = { id: "T001@aaaaaaaa", state: "in-progress", description: "Deep task detail", deps: [] };
  const active = fixtureItem("active", {
    defined: true,
    hasInProgress: true,
    tasksAvailable: true,
    tasks: [task],
    taskCounts: { open: 0, active: 1, blocked: 0, done: 0, total: 1 },
  });
  const planned = fixtureItem("planned");
  const completed = fixtureItem("completed", { defined: true, packageComplete: true });
  const model = deriveLifecycleModel({ items: [active, planned, completed], order: [] });
  const mermaid = renderCurrentMermaid(model);
  assert.match(mermaid, /active/);
  assert.doesNotMatch(mermaid, /planned|completed|T001@aaaaaaaa|Deep task detail/);

  const emptyCurrent = deriveLifecycleModel({ items: [planned, completed], order: [] });
  assert.equal(renderCurrentMermaid(emptyCurrent), "");
});

test("T005 runtime reads neither approved preview nor optional visual pack and names no report artifact", () => {
  const source = fs.readFileSync(BACKLOG_PATH, "utf8");
  for (const absent of [
    "design/preview.html",
    "dude-pack-strata-visual",
    "node:child_process",
    ".dude/backlog.md",
    ".dude/backlog.html",
    "backlog-template",
  ]) {
    assert.equal(source.includes(absent), false, absent);
  }
  assert.equal(fs.existsSync(new URL("./backlog-template.html", import.meta.url)), false, "the report template is retired");
});

test("T005 Feature 025 historical artifacts retain exact bytes except its active owner breadcrumb", () => {
  // Arrange
  const expected = new Map([
    [".dude/ideas/025-backlog-report.md", "97bea6893c4f38280397571e3e61c26b1e7c875d632d5ca306b957d6e78d18e2"],
    [".dude/specs/025-backlog-report/plan.md", "8826c08aacc27ab05207e93d8babcf202980bf3ea251651fd9d50781faf5b39c"],
    [".dude/specs/025-backlog-report/spec.md", "14002da82cf134194aa48037db63b6097e63cb4a1301822cc1150c162707f7e8"],
  ]);
  const taskPath = path.join(REPO_ROOT, ".dude/specs/025-backlog-report/tasks.md");
  const oldBreadcrumb = "<!-- audit log: .dude/ideas/backlog-report.md#coordinator-log -->";
  const newBreadcrumb = "<!-- audit log: .dude/ideas/025-backlog-report.md#coordinator-log -->";

  // Act
  const actual = new Map([...expected.keys()].map((relativePath) => [
    relativePath,
    sha256(fs.readFileSync(path.join(REPO_ROOT, ...relativePath.split("/")))),
  ]));
  const tasks = fs.readFileSync(taskPath, "utf8");

  // Assert
  for (const [relativePath, hash] of expected) {
    assert.equal(actual.get(relativePath), hash, relativePath);
  }
  assert.ok(tasks.startsWith(newBreadcrumb), "the numbered owner is the active breadcrumb");
  assert.equal(tasks.split(newBreadcrumb).length - 1, 1, "only the active breadcrumb uses the new owner path");
  assert.equal(tasks.split(oldBreadcrumb).length - 1, 0, "the old owner path is absent from the active task file");
  assert.equal(
    sha256(Buffer.from(tasks.replace(newBreadcrumb, oldBreadcrumb))),
    "498a957464be36793df326697f5ba6e913e7a9642f92b578866b2f0f473c9173",
    "reversing the sole authorized breadcrumb change restores the exact historical tasks bytes",
  );
});

function shipEntry(feature, { stage = "Captured", requested = false, prerequisites = [] } = {}) {
  return {
    ideaPath: `.dude/ideas/${feature}.md`,
    specPath: stage === "Captured" ? null : `.dude/specs/${feature}/spec.md`,
    slug: feature.slice(4),
    stage,
    requested,
    prerequisites: prerequisites.map((prerequisite) => `.dude/ideas/${prerequisite}.md`),
  };
}

function shipSkipped(feature) {
  return {
    ideaPath: `.dude/ideas/${feature}.md`,
    specPath: `.dude/specs/${feature}/spec.md`,
    slug: feature.slice(4),
  };
}

function shipPlan(feature, order, skipped = []) {
  return { target: `.dude/ideas/${feature}.md`, runnable: true, order, skipped, diagnostics: [] };
}

function shipRefused(target, diagnostics) {
  return { target, runnable: false, order: [], skipped: [], diagnostics };
}

/** Exercise the public function and the CLI twice, snapshotting all fixture bytes. */
function assertShipPlan(root, target, expected) {
  const before = snapshotTree(root);
  try {
    const first = runCli(root, ["ship-plan", target]);
    const repeat = runCli(root, ["ship-plan", target]);
    for (const result of [first, repeat]) {
      assert.equal(result.error, undefined);
      assert.equal(result.status, expected.runnable ? 0 : 1, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
    }
    assert.equal(repeat.stdout, first.stdout, "repeated reads print identical plans");
    assert.deepEqual(backlog.planShipRun({ root, target }), expected, "the export and CLI share the contract");
    return JSON.parse(first.stdout);
  } finally {
    assert.deepEqual(snapshotTree(root), before, "planning changes zero fixture files or directories");
  }
}

/** Short, differently named Windows-safe roots; never place fixtures in the checkout. */
function withShipRoots(setup, check) {
  const roots = [];
  try {
    for (const prefix of ["s88-a-", "s88-other-"]) {
      const root = makeRoot(prefix);
      roots.push(root);
      writeEarlierReportCopies(root);
      setup(root);
      check(root);
    }
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
}

test("088 Ship plan: the export surface adds only planShipRun", () => {
  assert.deepEqual(Object.keys(backlog).sort(), [
    "collectLifecycleItems", "collectLifecycleModel", "deriveLifecycleModel", "parseArgs",
    "parseBacklogOrder", "parseProvisionalRelationships", "planShipRun", "renderCurrentMermaid",
    "renderFlowchart", "renderText", "run", "safeMermaidId",
  ].sort());
});

test("088 Ship plan: a chain follows declared prerequisites, not chronology, titles, body markers, or backlog order", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", title: "First by title", dependsOn: "middle",
      body: "Related work: `depends-on: unrelated`." });
    writeIdea(root, "middle", { number: "900", dependsOn: "foundation" });
    writeIdea(root, "foundation", { number: "050" });
    writeIdea(root, "unrelated", { number: "002", dependsOn: "absent" });
    writeFile(root, ORDER_SOURCE, "- target\n- unrelated\n- middle\n- foundation\n");
  }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
    shipEntry("050-foundation"),
    shipEntry("900-middle", { prerequisites: ["050-foundation"] }),
    shipEntry("001-target", { requested: true, prerequisites: ["900-middle"] }),
  ])));
});

test("088 Ship plan: a diamond lists its shared prerequisite once and breaks ties by declaration order", () => {
  withShipRoots((root) => {
    writeIdea(root, "gamma", { number: "002", dependsOn: "shared" });
    writeIdea(root, "beta", { number: "900", dependsOn: "shared" });
    writeIdea(root, "shared", { number: "800" });
    writeIdea(root, "target", { number: "001", dependsOn: "beta, gamma beta" });
  }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
    shipEntry("800-shared"),
    shipEntry("900-beta", { prerequisites: ["800-shared"] }),
    shipEntry("002-gamma", { prerequisites: ["800-shared"] }),
    shipEntry("001-target", { requested: true, prerequisites: ["900-beta", "002-gamma"] }),
  ])));
});

test("088 Ship plan: a complete prerequisite is skipped without traversing its unfinished, missing, resolved, or self prerequisites", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "completed" });
    writeIdea(root, "completed", { feature: "900-completed", dependsOn: "unfinished absent closed completed" });
    writePackage(root, "900-completed", { tasks: "- [x] T001@aaaaaaaa Done\n" });
    writeIdea(root, "unfinished", { number: "002" });
    writeIdea(root, "closed", { number: "003", status: "resolved" });
  }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
    shipEntry("001-target", { requested: true, prerequisites: ["900-completed"] }),
  ], [shipSkipped("900-completed")])));
});

test("088 Ship plan: a shared complete prerequisite is listed as skipped once in first-reached order", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "beta gamma shared" });
    writeIdea(root, "beta", { number: "900", dependsOn: "shared" });
    writeIdea(root, "gamma", { number: "002", dependsOn: "shared" });
    writeIdea(root, "shared", { feature: "800-shared" });
    writePackage(root, "800-shared", { tasks: "- [x] T001@aaaaaaaa Done\n" });
  }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
    shipEntry("900-beta", { prerequisites: ["800-shared"] }),
    shipEntry("002-gamma", { prerequisites: ["800-shared"] }),
    shipEntry("001-target", { requested: true, prerequisites: ["900-beta", "002-gamma", "800-shared"] }),
  ], [shipSkipped("800-shared")])));
});

for (const scenario of [
  { name: "draft prerequisite", stage: "Captured", tasks: null },
  { name: "defined prerequisite", stage: "Defined", tasks: "- [ ] T001@aaaaaaaa Ready\n" },
  { name: "empty task package is not complete", stage: "Defined", tasks: "# No tasks yet\n" },
  { name: "in-progress prerequisite", stage: "In progress", tasks: "- [~] T001@aaaaaaaa Working\n" },
  { name: "partly completed prerequisite", stage: "In progress",
    tasks: "- [x] T001@aaaaaaaa Done\n- [ ] T002@bbbbbbbb Still open\n" },
  { name: "blocked prerequisite", stage: "Blocked",
    tasks: "- [x] T001@aaaaaaaa Done\n- [!] T002@bbbbbbbb Blocked\n" },
]) {
  test(`088 Ship plan: ${scenario.name} runs before its dependent with the shared work stage`, () => {
    withShipRoots((root) => {
      writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
      if (scenario.tasks === null) writeIdea(root, "foundation", { number: "900" });
      else {
        writeIdea(root, "foundation", { feature: "900-foundation" });
        writePackage(root, "900-foundation", { tasks: scenario.tasks });
      }
    }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("900-foundation", { stage: scenario.stage }),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ])));
  });
}

test("088 Ship plan: no prerequisites leaves only the target despite unrelated resolved or unreadable work", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", title: "A target title",
      body: "This mentions `depends-on: unrelated` without declaring it." });
    writeIdea(root, "closed", { number: "002", status: "resolved" });
    writeIdea(root, "unrelated", { feature: "003-unrelated", dependsOn: "absent" });
    writePackage(root, "003-unrelated");
    fs.rmSync(path.join(root, ".dude/specs/003-unrelated/tasks.md"));
    writeFile(root, ORDER_SOURCE, "- unrelated\n- target\n");
  }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
    shipEntry("001-target", { requested: true }),
  ])));
});

test("088 Ship plan: only complete prerequisites leaves the target and preserves exact same-prefix package paths", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { feature: "001-target", dependsOn: "zeta alpha" });
    writePackage(root, "001-target");
    for (const slug of ["alpha", "zeta"]) {
      writeIdea(root, slug, { feature: `074-${slug}` });
      writePackage(root, `074-${slug}`, { tasks: "- [x] T001@aaaaaaaa Done\n   blocked-by: historical only\n" });
    }
  }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
    shipEntry("001-target", { stage: "Defined", requested: true, prerequisites: ["074-zeta", "074-alpha"] }),
  ], [shipSkipped("074-zeta"), shipSkipped("074-alpha")])));
});

test("088 Ship plan: a drafts-only project without a specs folder plans by slug and exact numbered idea path", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { number: "900" });
  }, (root) => {
    assert.equal(fs.existsSync(path.join(root, ".dude/specs")), false);
    const expected = shipPlan("001-target", [
      shipEntry("900-foundation"),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ]);
    assertShipPlan(root, "target", expected);
    assertShipPlan(root, ".dude/ideas/001-target.md", expected);
    assert.equal(fs.existsSync(path.join(root, ".dude/specs")), false);
  });
});

for (const [stage, tasks] of [
  ["Defined", "- [ ] T001@aaaaaaaa Ready\n"],
  ["In progress", "- [~] T001@aaaaaaaa Working\n"],
  ["Blocked", "- [!] T001@aaaaaaaa Blocked\n"],
  ["Completed", "- [x] T001@aaaaaaaa Done\n"],
]) {
  test(`088 Ship plan: the target's own ${stage} stage neither refuses nor skips it`, () => {
    withShipRoots((root) => {
      writeIdea(root, "target", { feature: "001-target" });
      writePackage(root, "001-target", { tasks });
    }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("001-target", { stage, requested: true }),
    ])));
  });
}

for (const unreadable of ["missing", "a directory"]) {
  test(`088 Ship plan: the target's own task file being ${unreadable} still plans with a null stage`, () => {
    withShipRoots((root) => {
      writeIdea(root, "target", { feature: "001-target", dependsOn: "foundation" });
      writePackage(root, "001-target");
      writeIdea(root, "foundation", { number: "900" });
      const tasksPath = path.join(root, ".dude/specs/001-target/tasks.md");
      fs.rmSync(tasksPath);
      if (unreadable === "a directory") fs.mkdirSync(tasksPath);
    }, (root) => assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("900-foundation"),
      shipEntry("001-target", { stage: null, requested: true, prerequisites: ["900-foundation"] }),
    ])));
  });
}

test("088 Ship plan: a missing prerequisite refuses with the declaring idea and next action", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "absent" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_PREREQUISITE_MISSING",
    path: ".dude/ideas/001-target.md",
    message: "Declared prerequisite 'absent' has no unique authoritative idea; capture it through brainstorm or change the declared prerequisites.",
  }])));
});

test("088 Ship plan: a two-feature cycle names the repeated idea and the whole cycle in walk order", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { number: "900", dependsOn: "target" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_DEPENDENCY_CYCLE",
    path: ".dude/ideas/001-target.md",
    message: "Declared prerequisite cycle: target -> foundation -> target. Change the declared prerequisites before shipping.",
  }])));
});

test("088 Ship plan: a self-declared prerequisite refuses even when the target is Completed", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { feature: "001-target", dependsOn: "target" });
    writePackage(root, "001-target", { tasks: "- [x] T001@aaaaaaaa Done\n" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_DEPENDENCY_CYCLE",
    path: ".dude/ideas/001-target.md",
    message: "Declared prerequisite cycle: target -> target. Change the declared prerequisites before shipping.",
  }])));
});

test("088 Ship plan: a nested cycle's path is its first repeated prerequisite, not the target", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "beta" });
    writeIdea(root, "beta", { number: "900", dependsOn: "gamma" });
    writeIdea(root, "gamma", { number: "002", dependsOn: "beta" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_DEPENDENCY_CYCLE",
    path: ".dude/ideas/900-beta.md",
    message: "Declared prerequisite cycle: beta -> gamma -> beta. Change the declared prerequisites before shipping.",
  }])));
});

test("088 Ship plan: a resolved prerequisite is not complete and requires explicit brainstorm or changed declarations", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "closed" });
    writeIdea(root, "closed", { number: "900", status: "resolved", dependsOn: "invalid!" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_MEMBER_RESOLVED",
    path: ".dude/ideas/900-closed.md",
    message: "Prerequisite 'closed' is resolved, not complete; reopen it through an explicit brainstorm or change the declared prerequisites.",
  }])));
});

test("088 Ship plan: a resolved target refuses before traversing any of its prerequisites", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", status: "resolved", dependsOn: "absent" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_MEMBER_RESOLVED",
    path: ".dude/ideas/001-target.md",
    message: "Target 'target' is resolved; reopen it through an explicit brainstorm before shipping.",
  }])));
});

for (const scenario of [
  { name: "missing prerequisite task file", tasks: null, directory: false, reason: "The task file is unavailable." },
  { name: "unreadable prerequisite task file", tasks: null, directory: true, reason: "The task file is unavailable." },
  { name: "duplicate prerequisite tasks", tasks: "- [x] T001@aaaaaaaa Done\n- [x] T001@aaaaaaaa Duplicate\n",
    reason: "Task state is unavailable because the tasks file is incomplete or ambiguous." },
  { name: "malformed prerequisite tasks", tasks: "- [x] T001@aaaaaaaa Done\n- [x] invalid-id Malformed\n",
    reason: "Task state is unavailable because the tasks file is incomplete or ambiguous." },
]) {
  test(`088 Ship plan: ${scenario.name} refuses with unavailable member evidence`, () => {
    withShipRoots((root) => {
      writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
      writeIdea(root, "foundation", { feature: "900-foundation" });
      writePackage(root, "900-foundation", { tasks: scenario.tasks ?? "" });
      if (scenario.tasks === null) {
        const tasksPath = path.join(root, ".dude/specs/900-foundation/tasks.md");
        fs.rmSync(tasksPath);
        if (scenario.directory) fs.mkdirSync(tasksPath);
      }
    }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
      code: "SHIP_PLAN_MEMBER_UNAVAILABLE",
      path: ".dude/ideas/900-foundation.md",
      message: `Cannot plan prerequisite 'foundation': ${scenario.reason} Repair its records before shipping.`,
    }])));
  });
}

test("088 Ship plan: malformed declared prerequisites on the target refuse without a stage-based refusal", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "invalid!" });
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
    code: "SHIP_PLAN_MEMBER_UNAVAILABLE",
    path: ".dude/ideas/001-target.md",
    message: "Cannot read declared prerequisites for 'target'; repair its depends-on metadata before shipping.",
  }])));
});

for (const complete of [false, true]) {
  test(`088 Ship plan: malformed declared prerequisites on a ${complete ? "complete" : "draft"} prerequisite refuse before skipping`, () => {
    withShipRoots((root) => {
      writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
      writeIdea(root, "foundation", complete
        ? { feature: "900-foundation", dependsOn: "invalid!" }
        : { number: "900", dependsOn: "invalid!" });
      if (complete) writePackage(root, "900-foundation", { tasks: "- [x] T001@aaaaaaaa Done\n" });
    }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [{
      code: "SHIP_PLAN_MEMBER_UNAVAILABLE",
      path: ".dude/ideas/900-foundation.md",
      message: "Cannot plan prerequisite 'foundation': Declared prerequisite data is unavailable. Repair its records before shipping.",
    }])));
  });
}

for (const member of ["target", "foundation"]) {
  test(`088 Ship plan: structured declared prerequisites on ${member} pass through the frontmatter error unchanged`, () => {
    withShipRoots((root) => {
      writeIdea(root, "target", { number: "001", dependsOn: member === "target" ? "[foundation]" : "foundation" });
      writeIdea(root, "foundation", { number: "900", dependsOn: member === "foundation" ? "[target]" : undefined });
    }, (root) => assertShipPlan(root, "target", shipRefused(null, [{
      code: "FEATURE_FRONTMATTER_MALFORMED",
      path: `.dude/ideas/${member === "target" ? "001-target" : "900-foundation"}.md`,
      message: "malformed frontmatter (frontmatter key 'depends-on' has a structured flow value)",
    }])));
  });
}

test("088 Ship plan: a duplicate idea slug passes through the lifecycle identity diagnostic unchanged", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { number: "002" });
    writeIdea(root, "foundation", { number: "003" });
  }, (root) => assertShipPlan(root, "target", shipRefused(null, [{
    code: "FEATURE_IDEA_SLUG_DUPLICATE",
    path: ".dude/ideas/002-foundation.md",
    message: "duplicate idea slug 'foundation': .dude/ideas/002-foundation.md, .dude/ideas/003-foundation.md",
  }])));
});

test("088 Ship plan: conflicting ownership passes through every inventory error unchanged", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "003", dependsOn: "foundation" });
    writeIdea(root, "foundation", { feature: "001-foundation" });
    writePackage(root, "001-foundation");
    writeIdea(root, "peer", { number: "002", feature: "001-foundation" });
  }, (root) => assertShipPlan(root, "target", shipRefused(null, [
    {
      code: "FEATURE_OWNER_IDENTITY_MISMATCH",
      path: ".dude/ideas/002-peer.md",
      message: "defined owner .dude/ideas/002-peer.md identity 002-peer does not match package .dude/specs/001-foundation/spec.md",
    },
    {
      code: "FEATURE_OWNER_DUPLICATE",
      path: ".dude/specs/001-foundation/spec.md",
      message: "duplicate defined idea owners: .dude/ideas/001-foundation.md, .dude/ideas/002-peer.md",
    },
  ])));
});

test("088 Ship plan: unreadable prerequisite specification evidence keeps the existing unsafe-path diagnostic", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { feature: "900-foundation" });
    writePackage(root, "900-foundation");
    const specPath = path.join(root, ".dude/specs/900-foundation/spec.md");
    fs.rmSync(specPath);
    fs.mkdirSync(specPath);
  }, (root) => assertShipPlan(root, "target", shipRefused(null, [{
    code: "FEATURE_SPEC_PATH_UNSAFE",
    path: ".dude/ideas/900-foundation.md",
    message: "spec_path '.dude/specs/900-foundation/spec.md' is unsafe or unresolved (spec identity target is not a regular file: '.dude/specs/900-foundation/spec.md')",
  }])));
});

test("088 Ship plan: unreadable prerequisite lifecycle evidence keeps the existing inventory diagnostic", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    fs.mkdirSync(path.join(root, ".dude/ideas/900-foundation.md"));
  }, (root) => assertShipPlan(root, "target", shipRefused(null, [{
    code: "FEATURE_IDEA_ENTRY_UNSUPPORTED",
    path: ".dude/ideas/900-foundation.md",
    message: "unsupported nested directory in canonical ideas; only direct regular .md files are allowed",
  }])));
});

test("088 Ship plan: invalid or inexact selectors refuse with JSON and never fall back to a title, filename, or package", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", title: "Target title" });
  }, (root) => {
    for (const target of ["Target title", ".dude/ideas/target.md", ".dude/specs/001-target/spec.md",
      "./.dude/ideas/001-target.md", ".dude/ideas/001-target.md/", "target.md"]) {
      assertShipPlan(root, target, shipRefused(null, [{
        code: "FEATURE_IDEA_QUERY_INVALID",
        path: target,
        message: "idea query must supply exactly one canonical frontmatter slug or exact numbered direct idea path",
      }]));
    }
    for (const target of ["missing", "tar", "001-target", ".dude/ideas/002-target.md"]) {
      assertShipPlan(root, target, shipRefused(null, [{
        code: "FEATURE_IDEA_NOT_FOUND", path: target, message: `no exact idea found for '${target}'`,
      }]));
    }
  });
});

test("088 Ship plan: refusals clear partial order and skipped entries and deduplicate diagnostics by code and path", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "completed beta gamma absent-one absent-two" });
    writeIdea(root, "completed", { feature: "800-completed" });
    writePackage(root, "800-completed", { tasks: "- [x] T001@aaaaaaaa Done\n" });
    writeIdea(root, "beta", { number: "900", dependsOn: "absent-one closed unavailable" });
    writeIdea(root, "gamma", { number: "002", dependsOn: "absent-one closed unavailable" });
    writeIdea(root, "closed", { number: "003", status: "resolved" });
    writeIdea(root, "unavailable", { feature: "004-unavailable" });
    writePackage(root, "004-unavailable");
    fs.rmSync(path.join(root, ".dude/specs/004-unavailable/tasks.md"));
  }, (root) => assertShipPlan(root, "target", shipRefused(".dude/ideas/001-target.md", [
    {
      code: "SHIP_PLAN_PREREQUISITE_MISSING", path: ".dude/ideas/900-beta.md",
      message: "Declared prerequisite 'absent-one' has no unique authoritative idea; capture it through brainstorm or change the declared prerequisites.",
    },
    {
      code: "SHIP_PLAN_MEMBER_RESOLVED", path: ".dude/ideas/003-closed.md",
      message: "Prerequisite 'closed' is resolved, not complete; reopen it through an explicit brainstorm or change the declared prerequisites.",
    },
    {
      code: "SHIP_PLAN_MEMBER_UNAVAILABLE", path: ".dude/ideas/004-unavailable.md",
      message: "Cannot plan prerequisite 'unavailable': The task file is unavailable. Repair its records before shipping.",
    },
    {
      code: "SHIP_PLAN_PREREQUISITE_MISSING", path: ".dude/ideas/002-gamma.md",
      message: "Declared prerequisite 'absent-one' has no unique authoritative idea; capture it through brainstorm or change the declared prerequisites.",
    },
    {
      code: "SHIP_PLAN_PREREQUISITE_MISSING", path: ".dude/ideas/001-target.md",
      message: "Declared prerequisite 'absent-one' has no unique authoritative idea; capture it through brainstorm or change the declared prerequisites.",
    },
  ])));
});

test("088 Ship plan: a recheck moves a fully completed first feature to skipped and retains the remaining approved order", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { feature: "900-foundation" });
    writePackage(root, "900-foundation", { tasks: "- [~] T001@aaaaaaaa Working\n- [ ] T002@bbbbbbbb Next\n" });
  }, (root) => {
    const approved = assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("900-foundation", { stage: "In progress" }),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ]));
    writeFile(root, ".dude/specs/900-foundation/tasks.md", "- [x] T001@aaaaaaaa Done\n- [x] T002@bbbbbbbb Done\n");
    const rebuilt = assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ], [shipSkipped("900-foundation")]));
    assert.deepEqual(rebuilt.order.map((entry) => entry.ideaPath), approved.order.slice(1).map((entry) => entry.ideaPath));
    assert.equal(rebuilt.skipped[0].ideaPath, approved.order[0].ideaPath);
  });
});

test("088 Ship plan: a recheck with one blocked task keeps the first feature in the plan", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { feature: "900-foundation" });
    writePackage(root, "900-foundation", { tasks: "- [~] T001@aaaaaaaa Working\n- [ ] T002@bbbbbbbb Next\n" });
  }, (root) => {
    const approved = assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("900-foundation", { stage: "In progress" }),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ]));
    writeFile(root, ".dude/specs/900-foundation/tasks.md", "- [x] T001@aaaaaaaa Done\n- [!] T002@bbbbbbbb Blocked\n");
    const rebuilt = assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("900-foundation", { stage: "Blocked" }),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ]));
    assert.deepEqual(rebuilt.order.map((entry) => entry.ideaPath), approved.order.map((entry) => entry.ideaPath));
  });
});

test("088 Ship plan: a recheck exposes a newly declared prerequisite outside the earlier plan", () => {
  withShipRoots((root) => {
    writeIdea(root, "target", { number: "001", dependsOn: "foundation" });
    writeIdea(root, "foundation", { number: "900" });
  }, (root) => {
    const approved = assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("900-foundation"),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ]));
    writeIdea(root, "upstream", { number: "002" });
    writeIdea(root, "foundation", { number: "900", dependsOn: "upstream" });
    const rebuilt = assertShipPlan(root, "target", shipPlan("001-target", [
      shipEntry("002-upstream"),
      shipEntry("900-foundation", { prerequisites: ["002-upstream"] }),
      shipEntry("001-target", { requested: true, prerequisites: ["900-foundation"] }),
    ]));
    assert.equal(approved.order.some((entry) => entry.ideaPath === rebuilt.order[0].ideaPath), false);
    assert.notDeepEqual(rebuilt.order.map((entry) => entry.ideaPath), approved.order.map((entry) => entry.ideaPath));
  });
});

test("088 Ship plan: usage errors and --tracked print only FAIL to stderr and exit 1 without writes", () => {
  withShipRoots((root) => writeIdea(root, "target", { number: "001" }), (root) => {
    const before = snapshotTree(root);
    try {
      for (const [args, reason] of [
        [["ship-plan"], "ship-plan requires a target"],
        [["ship-plan", "target", "extra"], "too many positional arguments"],
        [["ship-plan", "target", "--unknown"], "unknown option: --unknown"],
        [["ship-plan", "target", "-x"], "unknown option: -x"],
        [["ship-plan", "--root"], "--root requires a directory"],
        [["ship-plan", "target", "--tracked"], "unknown option: --tracked"],
        [["--tracked", "ship-plan", "target"], "unknown option: --tracked"],
        [["ship-plan", "--tracked"], "unknown option: --tracked"],
      ]) {
        const result = spawnSync(process.execPath, [BACKLOG_PATH, "--root", root, ...args], { encoding: "utf8" });
        assert.equal(result.status, 1, args.join(" "));
        assert.equal(result.stdout, "", args.join(" "));
        assert.equal(result.stderr, `[FAIL] ${reason}\n`, args.join(" "));
      }
    } finally {
      assert.deepEqual(snapshotTree(root), before, "usage errors change zero fixture files or directories");
    }
  });
});

test("088 Ship plan: help lists all five read-only forms without requiring a target or writing files", () => {
  withShipRoots((root) => writeIdea(root, "target", { number: "001" }), (root) => {
    const before = snapshotTree(root);
    try {
      let help = null;
      for (const args of [["--help"], ["-h"], ["ship-plan", "--help"], ["ship-plan", "-h"]]) {
        const result = runCli(root, args);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.deepEqual(result.stdout.split("\n").filter((line) => line.startsWith("  node backlog.mjs")), [
          "  node backlog.mjs [--tracked] [--root <dir>]",
          "  node backlog.mjs kanban [--root <dir>]",
          "  node backlog.mjs flowchart <idea-slug> [--root <dir>]",
          "  node backlog.mjs progress <idea-slug> [--tracked] [--root <dir>]",
          "  node backlog.mjs ship-plan <idea-slug | .dude/ideas/<NNN>-<slug>.md> [--root <dir>]",
        ]);
        assert.match(result.stdout, /ship-plan.*declared prerequisite plan/);
        assert.match(result.stdout, /Every form is read-only\./);
        if (help !== null) assert.equal(result.stdout, help);
        help = result.stdout;
      }
    } finally {
      assert.deepEqual(snapshotTree(root), before, "help changes zero fixture files or directories");
    }
  });
});

// 094 Epic continuity: an ordinary target feature holds a shared outcome over its
// declared prerequisites. Rewriting a fixture task glyph only simulates recorded
// state; no case runs Work, checks a real invoice, or changes the runtime it reads.
const INVOICE_IMPORT = "011-invoice-import";
const INVOICE_EXPORT = "012-invoice-export";
const INVOICE_EXPORT_LEGACY = "013-invoice-export-legacy";
const INVOICE_ROUNDTRIP = "014-invoice-roundtrip";
const INVOICE_TARGET = `.dude/ideas/${INVOICE_ROUNDTRIP}.md`;
const INVOICE_PREREQUISITES = [INVOICE_EXPORT, INVOICE_IMPORT];
const INVOICE_GOAL = "Exporting an invoice and then importing that file preserves its number, currency, and total.";
const INVOICE_SCENARIO = "Given an invoice file written by invoice-export, when invoice-import reads that file, "
  + "then the imported invoice has the same number, currency, and total.";
const INVOICE_CHECK = "Verify that an invoice exported and then imported keeps its number, currency, and total";
const INVOICE_TASKS = new Map([
  [INVOICE_EXPORT, "Write an invoice export file"],
  [INVOICE_IMPORT, "Read an invoice import file"],
  [INVOICE_EXPORT_LEGACY, "Keep the retired invoice export format"],
]);

/** One simulated task line for an ordinary feature that is not the target. */
function invoiceTask(feature, glyph) {
  return `- [${glyph}] T001@aaaaaaaa ${INVOICE_TASKS.get(feature)}\n`;
}

/** A glyph defines the feature with one task; null leaves it a captured draft. */
function writeInvoiceFeature(root, feature, glyph) {
  if (glyph === null) writeIdea(root, feature.slice(4), { number: feature.slice(0, 3) });
  else {
    writeIdea(root, feature.slice(4), { feature });
    writePackage(root, feature, { tasks: invoiceTask(feature, glyph) });
  }
}

/** Simulate the target's own recorded task glyphs: its feature task, then its combined check. */
function writeInvoiceTargetTasks(root, [build, check]) {
  writeFile(root, `.dude/specs/${INVOICE_ROUNDTRIP}/tasks.md`, [
    "# Tasks: invoice-roundtrip", "", "## Phase 1: Round trip", "",
    `- [${build}] T001@aaaaaaaa Pass the invoice-export file to invoice-import`,
    `- [${check}] T002@bbbbbbbb ${INVOICE_CHECK}`,
    "   deps: T001@aaaaaaaa",
    "",
  ].join("\n"));
}

/** The target declares only export and import and names a similar feature in prose; null glyphs leave a draft. */
function writeInvoiceTarget(root, glyphs) {
  const idea = {
    dependsOn: "invoice-export invoice-import",
    body: "Round-trip invoices through the current export and import. Related by name only: invoice-export-legacy.",
  };
  if (glyphs === null) {
    writeIdea(root, "invoice-roundtrip", { number: "014", ...idea });
    return;
  }
  writeIdea(root, "invoice-roundtrip", { feature: INVOICE_ROUNDTRIP, ...idea });
  writeFile(root, `.dude/specs/${INVOICE_ROUNDTRIP}/spec.md`, [
    "# Feature Specification: Invoice round trip", "",
    "## Goal", "", INVOICE_GOAL, "",
    "## User Stories & Testing", "",
    "### User Story 1 - Round-trip an invoice (Priority: P1)", "",
    "Combined acceptance scenario:", "", `1. ${INVOICE_SCENARIO}`, "",
  ].join("\n"));
  writeInvoiceTargetTasks(root, glyphs);
}

/** Write all four ordinary features; by default every non-target feature is complete. */
function writeInvoiceFeatures(root, { exported = "x", imported = "x", legacy = "x", target = null } = {}) {
  writeInvoiceFeature(root, INVOICE_EXPORT, exported);
  writeInvoiceFeature(root, INVOICE_IMPORT, imported);
  writeInvoiceFeature(root, INVOICE_EXPORT_LEGACY, legacy);
  writeInvoiceTarget(root, target);
}

/** Return one read's result after proving that it changed zero fixture bytes. */
function readUnchanged(root, label, read) {
  const before = snapshotTree(root);
  const result = read();
  assert.deepEqual(snapshotTree(root), before, `${label} changes zero fixture files or directories`);
  return result;
}

test("094 Epic continuity: unfinished prerequisites run before the target and complete ones hand off exact spec paths", () => {
  withShipRoots((root) => writeInvoiceFeatures(root, { exported: "~", imported: " " }), (root) => {
    const target = shipEntry(INVOICE_ROUNDTRIP, { requested: true, prerequisites: INVOICE_PREREQUISITES });
    assertShipPlan(root, INVOICE_TARGET, shipPlan(INVOICE_ROUNDTRIP, [
      shipEntry(INVOICE_EXPORT, { stage: "In progress" }),
      shipEntry(INVOICE_IMPORT, { stage: "Defined" }),
      target,
    ]));

    writeFile(root, `.dude/specs/${INVOICE_EXPORT}/tasks.md`, invoiceTask(INVOICE_EXPORT, "x"));
    assertShipPlan(root, INVOICE_TARGET, shipPlan(INVOICE_ROUNDTRIP, [
      shipEntry(INVOICE_IMPORT, { stage: "Defined" }),
      target,
    ], [shipSkipped(INVOICE_EXPORT)]));

    writeFile(root, `.dude/specs/${INVOICE_IMPORT}/tasks.md`, invoiceTask(INVOICE_IMPORT, "x"));
    const plan = assertShipPlan(root, INVOICE_TARGET, shipPlan(INVOICE_ROUNDTRIP, [target],
      [shipSkipped(INVOICE_EXPORT), shipSkipped(INVOICE_IMPORT)]));

    // Definition receives the exact skipped specPath for each declared prerequisite.
    const context = plan.order[0].prerequisites
      .map((ideaPath) => plan.skipped.find((entry) => entry.ideaPath === ideaPath)?.specPath);
    assert.deepEqual(context, INVOICE_PREREQUISITES.map((feature) => `.dude/specs/${feature}/spec.md`));
    for (const specPath of context) {
      assert.ok(fs.lstatSync(path.join(root, ...String(specPath).split("/"))).isFile(), `${specPath} is a regular package file`);
    }
  });
});

test("094 Epic continuity: a similarly named unrelated feature never joins the plan or the target's dependencies", () => {
  for (const [legacy, stage] of [[null, "Captured"], ["~", "In progress"], ["x", "Completed"]]) {
    withShipRoots((root) => writeInvoiceFeatures(root, { imported: " ", legacy }), (root) => {
      const items = readUnchanged(root, `${stage} collector`, () => collectLifecycleItems({ root }));
      const unrelated = items.find((item) => item.ideaPath === `.dude/ideas/${INVOICE_EXPORT_LEGACY}.md`);
      assert.equal(unrelated?.authoritySlug, "invoice-export-legacy", `${stage}: the unrelated feature is a valid inventory item`);
      assert.equal(unrelated?.packageComplete, stage === "Completed", `${stage}: the unrelated feature's own completion`);
      const { relationships } = deriveLifecycleModel({ items, order: [] });
      assert.deepEqual(
        relationships.declared.map((relation) => `${relation.toSlug} <- ${relation.fromSlug}`),
        ["invoice-roundtrip <- invoice-export", "invoice-roundtrip <- invoice-import"],
        `${stage}: only declared prerequisites relate to the target`,
      );
      assert.deepEqual(relationships.provisional, [], `${stage}: naming a feature in prose relates nothing`);
      assertShipPlan(root, INVOICE_TARGET, shipPlan(INVOICE_ROUNDTRIP, [
        shipEntry(INVOICE_IMPORT, { stage: "Defined" }),
        shipEntry(INVOICE_ROUNDTRIP, { requested: true, prerequisites: INVOICE_PREREQUISITES }),
      ], [shipSkipped(INVOICE_EXPORT)]));
    });
  }
});

test("094 Epic continuity: with prerequisites complete, the target's own tasks give its open, blocked, and completed stages", () => {
  withShipRoots((root) => writeInvoiceFeatures(root, { target: [" ", " "] }), (root) => {
    for (const state of [
      { name: "open target", glyphs: [" ", " "], stage: "Defined", group: "next", heading: "Next" },
      { name: "open combined check", glyphs: ["x", " "], stage: "In progress", group: "next", heading: "Next" },
      { name: "blocked combined check", glyphs: ["x", "!"], stage: "Blocked", group: "blocked", heading: "Blocked" },
      { name: "completed own tasks", glyphs: ["x", "x"], stage: "Completed", group: "completed", heading: "Completed" },
    ]) {
      writeInvoiceTargetTasks(root, state.glyphs);
      assertShipPlan(root, INVOICE_TARGET, shipPlan(INVOICE_ROUNDTRIP, [
        shipEntry(INVOICE_ROUNDTRIP, { stage: state.stage, requested: true, prerequisites: INVOICE_PREREQUISITES }),
      ], [shipSkipped(INVOICE_EXPORT), shipSkipped(INVOICE_IMPORT)]));

      const items = readUnchanged(root, `${state.name} collector`, () => collectLifecycleItems({ root }));
      const groups = new Map(deriveLifecycleModel({ items, order: [] }).items.map((item) => [item.slug, item.group]));
      assert.deepEqual(
        ["invoice-export", "invoice-import", "invoice-roundtrip"].map((slug) => groups.get(slug)),
        ["completed", "completed", state.group],
        `${state.name}: complete prerequisites leave the target to its own tasks`,
      );

      const view = readUnchanged(root, `${state.name} printed view`, () => runCli(root, []));
      assert.equal(view.status, 0, view.stderr);
      assert.ok(view.stdout.split("\n").includes(`  014 invoice-roundtrip · ${state.stage}`), `${state.name}: printed stage`);
      assert.ok(printedGroups(view.stdout).get(state.heading)?.includes("014 invoice-roundtrip"), `${state.name}: printed group`);
    }
  });
});

test("094 Epic continuity: the ordinary target states its goal, combined scenario, and canonical verification task", () => {
  withShipRoots((root) => writeInvoiceFeatures(root, { target: [" ", " "] }), (root) => {
    const spec = fs.readFileSync(path.join(root, ".dude", "specs", INVOICE_ROUNDTRIP, "spec.md"), "utf8");
    assert.ok(spec.includes(`\n## Goal\n\n${INVOICE_GOAL}\n`), "the target spec states its shared goal");
    assert.ok(spec.includes(`\n1. ${INVOICE_SCENARIO}\n`), "a user story holds the combined acceptance scenario");

    const target = readUnchanged(root, "collector", () => collectLifecycleItems({ root }))
      .find((item) => item.ideaPath === INVOICE_TARGET);
    for (const slug of target?.dependsOn ?? []) {
      assert.ok(INVOICE_SCENARIO.includes(slug), `the combined scenario exercises declared prerequisite ${slug}`);
    }
    assert.deepEqual({
      specPath: target?.specPath,
      dependsOn: target?.dependsOn,
      tasksAvailable: target?.tasksAvailable,
      taskWarnings: target?.taskWarnings,
      tasks: target?.tasks,
    }, {
      specPath: `.dude/specs/${INVOICE_ROUNDTRIP}/spec.md`,
      dependsOn: ["invoice-export", "invoice-import"],
      tasksAvailable: true,
      taskWarnings: [],
      tasks: [
        { id: "T001@aaaaaaaa", description: "Pass the invoice-export file to invoice-import", deps: [] },
        { id: "T002@bbbbbbbb", description: INVOICE_CHECK, deps: ["T001@aaaaaaaa"] },
      ],
    }, "the real task parser reads the combined check as a canonical task after the feature task");
  });
});
