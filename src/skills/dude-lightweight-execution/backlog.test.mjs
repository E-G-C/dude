// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

/** Read the printed group lists as title -> entries. */
function printedGroups(text) {
  const groups = new Map();
  let rows = null;
  for (const line of text.split("\n")) {
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
  assert.equal(text, [
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
  assert.equal(emptyText, [
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

test("retired report: help lists only the three read-only forms", () => {
  // Act
  const result = spawnSync(process.execPath, [BACKLOG_PATH, "--help"], { encoding: "utf8" });

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split("\n").filter((line) => line.startsWith("  node backlog.mjs")), [
    "  node backlog.mjs [--root <dir>]",
    "  node backlog.mjs kanban [--root <dir>]",
    "  node backlog.mjs flowchart <idea-slug> [--root <dir>]",
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
