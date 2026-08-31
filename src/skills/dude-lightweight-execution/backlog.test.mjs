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
  parseCoordinatorLog,
  parseProvisionalRelationships,
  refreshCommittedBacklog,
  renderArtifacts,
  renderCurrentMermaid,
  renderFlowchart,
  renderMarkdown,
  renderReport,
} from "./backlog.mjs";

const BACKLOG_PATH = fileURLToPath(new URL("./backlog.mjs", import.meta.url));
const TEMPLATE_URL = new URL("./backlog-template.html", import.meta.url);
const TEMPLATE_PATH = fileURLToPath(TEMPLATE_URL);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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
    title: overrides.title ?? slug,
    status: overrides.defined ? "defined" : "draft",
    defined: false,
    declaredDefined: false,
    specPath: null,
    declaredSpecPath: null,
    tasksPath: null,
    excerpt: `Excerpt for ${slug}.`,
    dependsOn: [],
    provisionalRelationships: [],
    coordinatorLog: [],
    milestones: [],
    userStories: [],
    tasks,
    phases: [],
    unphasedTasks: tasks,
    taskCounts: counts,
    tasksAvailable: overrides.tasksAvailable ?? tasks.length > 0,
    packageComplete: false,
    hasInProgress: false,
    ownBlocked: false,
    unavailableDetail: null,
    anchor: `feature-${slug}`,
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

function backlogArtifactPaths(root) {
  return {
    markdown: path.join(root, ".dude", "backlog.md"),
    html: path.join(root, ".dude", "backlog.html"),
  };
}

function readIfPresent(absolutePath) {
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath) : null;
}

function assertCommittedPair(root, expected, label) {
  const artifacts = backlogArtifactPaths(root);
  assert.deepEqual(fs.readFileSync(artifacts.markdown), Buffer.from(expected.markdown), `${label}: Markdown`);
  assert.deepEqual(fs.readFileSync(artifacts.html), Buffer.from(expected.html), `${label}: HTML`);
}

function htmlClassification(html) {
  const rows = new Map();
  const pattern = /<details class="feature-detail[^"]*"[^>]*data-idea-path="([^"]+)" data-section="([^"]+)" data-group="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) rows.set(match[1], `${match[2]}/${match[3]}`);
  return rows;
}

function markdownClassification(markdown) {
  const groups = new Map([
    ["Blocked", "current/blocked"],
    ["Active", "current/active"],
    ["Next", "current/next"],
    ["Ideas awaiting definition", "planned/awaiting-definition"],
    ["Defined awaiting work", "planned/defined-awaiting-work"],
    ["Prioritized for later", "planned/prioritized-later"],
    ["Completed", "completed/completed"],
  ]);
  const rows = new Map();
  let group = null;
  for (const line of markdown.split("\n")) {
    const heading = /^#{2,3} (.+)$/.exec(line);
    if (heading) {
      group = groups.get(heading[1]) ?? null;
      continue;
    }
    if (!group) continue;
    const item = /^- `[^`]+` .+ \(`([^`]+)`\)$/.exec(line);
    if (item) rows.set(item[1], group);
  }
  return rows;
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
    active: 0,
    blocked: 0,
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
    active: 1,
    blocked: 1,
  });

  const withoutOrder = deriveLifecycleModel({ items: [next, later], order: [] });
  assert.equal(withoutOrder.planned.prioritizedLater.length, 0);
  assert.equal(withoutOrder.current.next.length, 0);
});

test("T001 HTML suppresses empty Current subsection bodies while retaining zero summary counts", () => {
  const model = deriveLifecycleModel({ items: [fixtureItem("draft")], order: [] });
  const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);
  assert.match(html, /Current work<\/span><small>0 active · 0 blocked/);
  assert.match(html, /Ready \/ Next<\/span><small>ready from declared dependency or order/);
  assert.doesNotMatch(html, /authoritatively ready work/i);
  assert.doesNotMatch(html, /class="work-subsection current-(?:blocked|active|next)"/);
  assert.match(html, /No current execution/);
});

test("T001 generation is exact-byte and SHA deterministic across differently named roots", () => {
  const left = makeRoot("lifecycle-alpha-");
  const right = makeRoot("lifecycle-very-different-root-name-");
  try {
    for (const root of [left, right]) {
      writeIdea(root, "draft-one", { title: "Draft One", log: ["2026-08-01 UTC - brainstorm captured"] });
      writeIdea(root, "active-one", { feature: "101-active-one", title: "Active One" });
      writePackage(root, "101-active-one", { tasks: [
        "# Tasks: active-one", "", "## Phase 1: Work", "", "- [~] T001@aaaaaaaa Active task", "",
      ].join("\n") });
      writeIdea(root, "done-one", { feature: "102-done-one", title: "Done One" });
      writePackage(root, "102-done-one", { tasks: [
        "# Tasks: done-one", "", "## Phase 1: Work", "", "- [x] T001@bbbbbbbb Completed task", "",
      ].join("\n") });
    }
    const first = renderArtifacts({ root: left });
    const repeat = renderArtifacts({ root: left });
    const other = renderArtifacts({ root: right });
    assert.equal(first.markdown, repeat.markdown);
    assert.equal(first.html, repeat.html);
    assert.equal(first.markdown, other.markdown);
    assert.equal(first.html, other.html);
    assert.equal(sha256(first.markdown), sha256(other.markdown));
    assert.equal(sha256(first.html), sha256(other.html));
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
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  for (const banned of ["new Date", "child_process", "execSync", "rev-parse", "path.basename", "GENERATED_AT", "SOURCE_REV"]) {
    assert.equal(source.includes(banned), false, banned);
    assert.equal(template.includes(banned), false, banned);
  }
  assert.doesNotMatch(template, /generated\s+\d{4}|source revision|fingerprint/i);
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
    const markdown = renderMarkdown(model);
    const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);
    const bySlug = new Map(model.items.map((item) => [item.slug, item]));
    const markdownGroups = markdownClassification(markdown);
    const htmlGroups = htmlClassification(html);

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
        tasksPath: resolved.tasksPath,
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
        tasksPath: null,
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
      assert.notEqual(item.section, "completed", slug);
      assert.notEqual(markdownGroups.get(item.ideaPath), "completed/completed", slug);
      assert.notEqual(htmlGroups.get(item.ideaPath), "completed/completed", slug);
    }
    assert.equal(bySlug.get("nonempty-canonical").ownerSpecPath, null);
    assert.equal(bySlug.get("nonempty-canonical").resolvedCandidate, true);
    assert.equal(bySlug.get("owner-claim").resolvedCandidate, true);
    assert.equal(bySlug.get("owner-claim").defined, false);
    assert.equal(bySlug.get("owner-claim").packageComplete, false);
    assert.deepEqual(model.completed.map((item) => item.slug), ["resolved"]);
    assert.equal(model.summary.completed, 1);
    assertPartition(model, [...collected, ownerClaim]);
    assert.equal(markdownGroups.get(resolved.ideaPath), "completed/completed");
    assert.equal(htmlGroups.get(resolved.ideaPath), "completed/completed");

    const marker = `data-idea-path="${resolved.ideaPath}"`;
    const markerIndex = html.indexOf(marker);
    const detailStart = html.lastIndexOf("<details", markerIndex);
    const detailEnd = html.indexOf("</details>", markerIndex);
    assert.ok(markerIndex >= 0 && detailStart >= 0 && detailEnd > markerIndex);
    const resolvedDetail = html.slice(detailStart, detailEnd + "</details>".length);
    assert.match(resolvedDetail, /Outcome resolved without a package; definition is not applicable\./);
    assert.match(resolvedDetail, /Outcome resolved without a package; tasks are not applicable\./);
    assert.match(
      resolvedDetail,
      /Lifecycle: Idea reached, Defined not applicable, Tasks not applicable, Done reached/,
    );
    assert.doesNotMatch(resolvedDetail, /class="counts|aria-label="Task states"|No task package/);
    assert.doesNotMatch(resolvedDetail, /Awaiting definition - no tasks exist yet/);
    assert.doesNotMatch(resolvedDetail, /T\d{3}@/);
    const plannedMarkdown = markdown.slice(markdown.indexOf("## Planned"), markdown.indexOf("## Completed"));
    assert.doesNotMatch(plannedMarkdown, /`resolved`/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 collector exposes real idea, exact owner, stories, phases, tasks, deps, blockers, and milestones", () => {
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
    assert.match(item.excerpt, /real idea excerpt/);
    assert.equal(item.specPath, ".dude/specs/201-evidence/spec.md");
    assert.equal(item.tasksPath, ".dude/specs/201-evidence/tasks.md");
    assert.deepEqual(item.userStories, [
      "User Story 1 - Inspect exact evidence (Priority: P1)",
      "User Story 2 - Keep literal tasks (Priority: P2)",
    ]);
    assert.deepEqual(item.phases.map((phase) => phase.title), ["Phase 1: Evidence", "Phase 2: Delivery"]);
    assert.deepEqual(item.tasks.map((task) => ({ id: task.id, glyph: task.glyph, deps: task.deps, blockedBy: task.blockedBy })), [
      { id: "T001@aaaaaaaa", glyph: "~", deps: [], blockedBy: null },
      { id: "T002@bbbbbbbb", glyph: "x", deps: ["T001@aaaaaaaa"], blockedBy: "historical only" },
    ]);
    assert.deepEqual(item.milestones.map((entry) => entry.label), ["Captured", "Defined"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 malformed idea metadata stays visibly unavailable without negative dependency or draft claims", () => {
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
    const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);
    const markdown = renderMarkdown(model);

    // Assert
    assert.equal(item.frontmatterAvailable, false);
    assert.equal(item.lifecycleAvailable, false);
    assert.equal(item.dependencyAvailable, false);
    assert.deepEqual(item.dependsOn, []);
    assert.equal(item.packageComplete, false);
    assert.match(html, /Some source data is unavailable or ambiguous/);
    assert.match(html, /Defined unavailable, Tasks unavailable, Done unavailable/);
    assert.match(html, /Task state unavailable/);
    assert.match(html, /Dependency data unavailable/);
    assert.doesNotMatch(html, /No dependency signal/);
    assert.doesNotMatch(html, /Declared dependencies:<\/strong> none in idea frontmatter/);
    assert.doesNotMatch(html, /Awaiting definition - no tasks exist yet/);
    assert.match(markdown, /source data unavailable or ambiguous/);
    assert.match(markdown, /Dependency data is unavailable for `broken`; no negative dependency fact is inferred/);
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
    const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);

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
    assert.match(html, /Task state unavailable/);
    assert.match(html, /Done unavailable/);
    assert.doesNotMatch(html, /Done reached/);
    assert.doesNotMatch(html, /class="task task-done"/);
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
    items: [fixtureItem("canvas", { provisionalRelationships: [{ targetSlug: "report", evidence: marker }] }), target],
    order: [],
  });
  const withoutEvidence = deriveLifecycleModel({ items: [fixtureItem("canvas"), target], order: [] });

  // Assert
  assert.deepEqual(admitted, [
    [{ targetSlug: "backlog-report", evidence: marker }],
    [{ targetSlug: "backlog-report", evidence: inExample }],
  ]);
  assert.equal(withEvidence.relationships.provisional.length, 1);
  assert.equal(withEvidence.items.find((item) => item.slug === "canvas").group, "awaiting-definition");
  assert.equal(withoutEvidence.items.find((item) => item.slug === "canvas").group, "awaiting-definition");
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
  assert.deepEqual(orderModel.order, ["alpha", "beta"]);
  assert.deepEqual(orderModel.current.next.map((item) => item.slug), ["alpha"]);
  assert.deepEqual(orderModel.planned.prioritizedLater.map((item) => item.slug), ["beta"]);
  assert.deepEqual(orderModel.planned.definedAwaitingWork.map((item) => item.slug), ["gamma"]);
});

test("T002 task flowchart and delivery map point from prerequisite to dependent", () => {
  // Arrange
  const prerequisiteTask = { id: "T001@aaaaaaaa", description: "Foundation", deps: [] };
  const dependentTask = { id: "T002@bbbbbbbb", description: "Delivery", deps: ["T001@aaaaaaaa"] };
  const prerequisite = fixtureItem("foundation", { defined: true, packageComplete: true, title: "Foundation" });
  const dependent = fixtureItem("delivery", { defined: true, title: "Delivery", dependsOn: ["foundation"] });

  // Act
  const flowchart = renderFlowchart([prerequisiteTask, dependentTask], { slug: "delivery" });
  const html = renderReport(
    fs.readFileSync(TEMPLATE_PATH, "utf8"),
    deriveLifecycleModel({ items: [dependent, prerequisite], order: [] }),
  );

  // Assert
  assert.match(flowchart, /T001_aaaaaaaa --> T002_bbbbbbbb/);
  assert.doesNotMatch(flowchart, /T002_bbbbbbbb --> T001_aaaaaaaa/);
  assert.match(html, /aria-label="foundation prerequisite to delivery dependent: declared dependency"/);
  assert.match(html, /declared dependency · prerequisite <span aria-hidden="true">→<\/span> dependent/);
  assert.ok(html.indexOf("Foundation</strong>") < html.indexOf("Delivery</strong>"));
});

test("T002 explicit order edges read earlier to later and never claim a dependency", () => {
  // Arrange
  const first = fixtureItem("alpha", { defined: true, title: "Alpha" });
  const second = fixtureItem("beta", { defined: true, title: "Beta" });

  // Act
  const html = renderReport(
    fs.readFileSync(TEMPLATE_PATH, "utf8"),
    deriveLifecycleModel({ items: [first, second], order: ["alpha", "beta"] }),
  );
  const edge = /<div class="map-edge"[^>]*>.*?<\/div>/s.exec(html)[0];

  // Assert
  assert.match(edge, /aria-label="alpha is listed earlier than beta; no dependency is implied: explicit order"/);
  assert.match(edge, /explicit order · earlier <span aria-hidden="true">→<\/span> later/);
  assert.match(edge, /class="map-connector solid"/);
  assert.doesNotMatch(edge, /prerequisite|dependent/);
});

test("T002 live backlog-canvas relation is exact, provisional, non-authoritative, and default-open", () => {
  const artifacts = renderArtifacts({ root: REPO_ROOT });
  const canvas = artifacts.model.items.find((item) => item.slug === "backlog-canvas");
  assert.ok(canvas);
  assert.deepEqual(canvas.provisionalRelationships.map((entry) => entry.targetSlug), ["backlog-report"]);
  assert.deepEqual(
    artifacts.model.relationships.provisional.map((relation) => `${relation.fromSlug}->${relation.toSlug}`),
    ["backlog-report->backlog-canvas"],
  );
  assert.equal(canvas.section, "planned");
  assert.match(artifacts.html, /data-authority="provisional"/);
  assert.match(artifacts.html, /class="map-connector dashed"/);
  assert.match(artifacts.html, /stated in idea, not authoritative/);
  assert.match(artifacts.html, /id="feature-backlog-canvas"[^>]* open>/);
});

test("T002 duplicate and malformed slugs keep display-only identity while all source fields render as escaped text", () => {
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
    writeFile(root, ".dude/state/backlog-order.md", ["- safe-id", "- wants-safe-id", ""].join("\n"));

    // Act
    const model = collectLifecycleModel({ root });
    const special = model.items.find((item) => item.ideaPath.endsWith("safe-id.md"));
    const wants = model.items.find((item) => item.slug === "wants-safe-id");
    const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);
    const anchors = model.items.map((item) => item.anchor);
    const renderedAnchors = [...html.matchAll(/ id="(feature-[^"]+)"/g)].map((match) => match[1]);

    // Assert
    assert.equal(new Set(anchors).size, model.items.length);
    assert.equal(new Set(renderedAnchors).size, model.items.length);
    assert.equal(anchors.filter((anchor) => anchor.startsWith("feature-path-")).length, 2);
    assert.equal(special.slug, "safe-id");
    assert.equal(special.anchor, "feature-safe-id");
    // The file-name slug is display identity only; it carries no dependency or order authority.
    assert.equal(special.authoritySlug, null);
    assert.equal(special.orderPosition, null);
    assert.deepEqual(model.order, ["wants-safe-id"]);
    assert.equal(wants.group, "blocked");
    assert.equal(model.relationships.declared.some((relation) => relation.from === special || relation.to === special), false);
    assert.equal(model.relationships.provisional.some((relation) => relation.from === special || relation.to === special), false);
    assert.match(html, /The idea slug is malformed; the file name is used only as a stable display identity/);
    assert.equal(special.excerpt, "Bold linked <idea> & code strike image alt");
    assert.doesNotMatch(html, /<(?:script|img|svg|iframe)\b/i);
    assert.doesNotMatch(html, /href="https?:/i);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; dangerous title/);
    assert.match(html, /Bold linked &lt;idea&gt; &amp; code strike image alt/);
    assert.match(html, /User Story &lt;svg onload=alert\(2\)&gt; &amp; safe text/);
    assert.match(html, /Phase 1: &lt;em&gt;phase&lt;\/em&gt;/);
    assert.match(html, /Render &lt;script&gt;alert\(3\)&lt;\/script&gt; as text/);
    assert.match(html, /&lt;iframe src=https:\/\/attacker\.example&gt;&lt;\/iframe&gt;/);
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
    const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);

    // Assert
    assert.equal(source.authoritySlug, null);
    assert.deepEqual(source.dependsOn, ["valid-target"]);
    // The declared dependency is evidence only; it carries no blocking, ordering, or authority weight.
    assert.notEqual(source.group, "blocked");
    assert.equal(source.group, "awaiting-definition");
    assert.equal(target.group, "awaiting-definition");
    assert.deepEqual(model.current.next, []);
    assert.equal(source.orderPosition, null);
    assert.deepEqual(model.relationships.declared, []);
    assert.deepEqual(model.relationships.provisional, []);
    assert.deepEqual(
      model.relationships.missing.map((item) => item.identity).sort(),
      [source.identity, target.identity].sort(),
    );
    assert.doesNotMatch(html, /\(authoritative\)/);
    assert.doesNotMatch(html, /Declared signal/);
    assert.equal([...html.matchAll(/ id="feature-malformed-source"/g)].length, 1);
    assert.match(html, /The idea slug is malformed; the file name is used only as a stable display identity/);
    // The malformed entry must not claim the frontmatter declares nothing; it declares data that is ignored.
    const malformedEntry = html.slice(html.indexOf(` id="feature-malformed-source"`));
    const malformedDetail = malformedEntry.slice(0, malformedEntry.indexOf("</details>"));
    assert.doesNotMatch(malformedDetail, /none in idea frontmatter/);
    assert.match(malformedDetail, /dependency metadata is present but ignored because the idea slug is malformed/);
    assert.doesNotMatch(malformedDetail, /\(authoritative\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 draft summaries retain stable IDEA slug identity and plain-language labels", () => {
  // Arrange
  const root = makeRoot();
  try {
    writeIdea(root, "readable-draft", {
      title: "Readable Draft",
      body: "**Readable** [label](https://example.test) with `code` and ~~markup~~.",
    });

    // Act
    const model = collectLifecycleModel({ root });
    const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);

    // Assert
    assert.equal(model.items[0].excerpt, "Readable label with code and markup.");
    assert.match(html, /<span class="identity">I-001 · readable-draft<\/span>/);
    assert.match(html, /Awaiting definition - no tasks exist yet/);
    assert.match(html, /No dependency signal/);
    assert.match(html, /ready from declared dependency or order/);
    assert.doesNotMatch(html, /authoritatively ready work/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T002 Coordinator activity parses valid dates, groups descending, and uses stable same-date ordering", () => {
  const log = [
    "## Coordinator Log", "",
    "- 2026-08-04 12:30 UTC - second append", "- 2026-02-30 UTC - invalid date", "- no date", "",
  ].join("\n");
  assert.deepEqual(parseCoordinatorLog(log).map((entry) => entry.date), ["2026-08-04", null, null]);

  const alpha = fixtureItem("alpha", { coordinatorLog: [
    { text: "2026-08-04 UTC - alpha first", date: "2026-08-04", appendIndex: 0 },
    { text: "2026-08-04 UTC - alpha second", date: "2026-08-04", appendIndex: 1 },
  ] });
  const bravo = fixtureItem("bravo", { coordinatorLog: [
    { text: "2026-08-05 UTC - bravo newest", date: "2026-08-05", appendIndex: 0 },
    { text: "2026-08-04 UTC - bravo same date", date: "2026-08-04", appendIndex: 1 },
  ] });
  const model = deriveLifecycleModel({ items: [bravo, alpha], order: [] });
  assert.deepEqual(model.activityByDate.map((group) => group.date), ["2026-08-05", "2026-08-04"]);
  assert.deepEqual(model.activityByDate[1].events.map((event) => event.text), [
    "2026-08-04 UTC - alpha first",
    "2026-08-04 UTC - alpha second",
    "2026-08-04 UTC - bravo same date",
  ]);
  const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);
  assert.match(html, /Coordinator activity/);
  assert.match(html, /<details class="activity-library"><summary>/);
  assert.doesNotMatch(html, /<details class="activity-library" open/);
  assert.match(html, /Git history, ad-hoc work outside Coordinator Logs, and other execution history sources are excluded/);
});

test("T002 check reports missing, stale, and fresh artifacts separately and never writes", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "draft", { title: "Original title" });
    const missingBefore = snapshotTree(root);
    const missing = runCli(root, ["check"]);
    assert.equal(missing.status, 3);
    assert.match(missing.stderr, /\[MISSING\] \.dude\/backlog\.md/);
    assert.match(missing.stderr, /\[MISSING\] \.dude\/backlog\.html/);
    assert.deepEqual(snapshotTree(root), missingBefore);

    const generated = runCli(root, ["generate", "--write"]);
    assert.equal(generated.status, 0, generated.stderr);
    const freshBefore = snapshotTree(root);
    const fresh = runCli(root, ["check"]);
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.match(fresh.stdout, /backlog\.md is current/);
    assert.match(fresh.stdout, /backlog\.html is current/);
    assert.deepEqual(snapshotTree(root), freshBefore);

    const ideaPath = path.join(root, ".dude", "ideas", "001-draft.md");
    fs.writeFileSync(ideaPath, fs.readFileSync(ideaPath, "utf8").replace("title: Original title", "title: Changed title"));
    const staleBefore = snapshotTree(root);
    const stale = runCli(root, ["check"]);
    assert.equal(stale.status, 3);
    assert.match(stale.stderr, /\[STALE\] \.dude\/backlog\.md/);
    assert.match(stale.stderr, /\[STALE\] \.dude\/backlog\.html/);
    assert.deepEqual(snapshotTree(root), staleBefore);

    const rejectBefore = snapshotTree(root);
    const reject = runCli(root, ["check", "--write"]);
    assert.notEqual(reject.status, 0);
    assert.match(reject.stderr, /read-only and rejects --write/);
    assert.deepEqual(snapshotTree(root), rejectBefore);

    fs.rmSync(path.join(root, ".dude", "backlog.html"));
    const oneMissingBefore = snapshotTree(root);
    const oneMissing = runCli(root, ["check"]);
    assert.equal(oneMissing.status, 3);
    assert.match(oneMissing.stderr, /\[MISSING\] \.dude\/backlog\.html/);
    assert.deepEqual(snapshotTree(root), oneMissingBefore);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T003 approved HTML is one drill-down per item with compact collapsed completion and real native interaction", () => {
  const canvas = fixtureItem("backlog-canvas", {
    title: "Backlog Canvas",
    excerpt: "Actual URL prose https://example.test/reference remains text.",
    provisionalRelationships: [{ targetSlug: "done", evidence: "`done` has to ship first." }],
  });
  const activeTask = { id: "T001@aaaaaaaa", glyph: "~", state: "in-progress", description: "Current task", deps: [], blockedBy: null };
  const active = fixtureItem("active", {
    defined: true,
    hasInProgress: true,
    tasksAvailable: true,
    tasks: [activeTask],
    unphasedTasks: [activeTask],
    taskCounts: { open: 0, active: 1, blocked: 0, done: 0, total: 1 },
  });
  const done = fixtureItem("done", { defined: true, packageComplete: true });
  const model = deriveLifecycleModel({ items: [canvas, active, done], order: [] });
  const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);

  assert.equal((html.match(/class="feature-detail/g) ?? []).length, model.items.length);
  assert.equal((html.match(/class="completed-library"/g) ?? []).length, 1);
  assert.match(html, /<details class="completed-library"><summary>/);
  assert.doesNotMatch(html, /<details class="completed-library" open/);
  assert.match(html, /id="feature-backlog-canvas"[^>]* open>/);
  assert.match(html, /Idea reached, Defined pending, Tasks pending, Done pending/);
  assert.match(html, /Awaiting definition - no tasks exist yet/);
  assert.doesNotMatch(html, /class="(?:bar|pill)"/);
  assert.doesNotMatch(html, /% of all tasks|portfolio percentage|completion percentage/i);
  assert.match(html, /https:\/\/example\.test\/reference/);
  assert.doesNotMatch(html, /href="https?:/);
});

test("T003 approved HTML is self-contained, semantic, focus-visible, responsive, and print-safe", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const model = deriveLifecycleModel({ items: [fixtureItem("draft")], order: [] });
  const html = renderReport(template, model);

  for (const banned of [/<script\b/i, /\son[a-z]+\s*=/i, /javascript:/i, /<link\b/i, /\bsrc\s*=/i, /@import/i, /@font-face/i, /url\(/i, /box-shadow/i]) {
    assert.equal(banned.test(html), false, String(banned));
  }
  assert.doesNotMatch(template, /max-height\s*:/i);
  assert.doesNotMatch(template, /overflow(?:-[xy])?\s*:\s*(?:auto|scroll|hidden)/i);
  assert.match(template, /a:focus-visible, summary:focus-visible/);
  assert.match(template, /--strata-focus: var\(--strata-series-6\)/);
  assert.match(template, /outline: 2px solid var\(--strata-focus\)/);
  assert.match(template, /outline-offset: 2px/);
  assert.match(html, /<header class="hero">/);
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /<footer class="site-footer">/);
  assert.match(html, /aria-labelledby="delivery-title" aria-describedby="delivery-desc"/);
  assert.match(template, /width: min\(1180px/);
  assert.match(template, /@media \(max-width: 800px\)/);
  assert.match(template, /@media \(max-width: 520px\)/);
  assert.match(template, /@media \(max-width: 320px\)/);
  assert.match(template, /width: calc\(100% - 16px\)/);
  assert.match(template, /@media print/);
  assert.match(template, /\.current-work details:not\(\[open\]\) > \.feature-body/);
  assert.match(template, /\.planned-work details:not\(\[open\]\) > \.feature-body/);
  assert.match(template, /\.skip-link, \.completed-library, \.activity-library \{ display: none; \}/);
  assert.match(template, /\.print-completed-index, \.print-activity-summary \{ display: block; \}/);
  assert.match(template, /border: 1px solid var\(--strata-rule\)/);
  assert.equal(template.includes("dude-pack-strata-visual"), false);
});

test("T003 rendered HTML has no fake controls, scripts, or external loads and keeps a meaningful hierarchy", () => {
  // Arrange
  const activeTask = { id: "T001@aaaaaaaa", glyph: "~", state: "in-progress", description: "Active work", deps: [], blockedBy: null };
  const model = deriveLifecycleModel({ items: [
    fixtureItem("active", {
      defined: true,
      hasInProgress: true,
      tasksAvailable: true,
      tasks: [activeTask],
      unphasedTasks: [activeTask],
      taskCounts: { open: 0, active: 1, blocked: 0, done: 0, total: 1 },
    }),
    fixtureItem("planned"),
    fixtureItem("completed", { defined: true, packageComplete: true }),
  ], order: [] });

  // Act
  const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);
  const markup = html.replace(/<style>[\s\S]*?<\/style>/, "");
  const headingLevels = [...markup.matchAll(/<h([1-6])(?:\s[^>]*)?>/g)].map((match) => Number(match[1]));
  const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const labelledBy = [...markup.matchAll(/\saria-labelledby="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));

  // Assert
  assert.doesNotMatch(markup, /<(?:button|input|select|textarea|form|script|iframe|object|embed|canvas)\b/i);
  assert.doesNotMatch(markup, /\s(?:href|src)="(?:https?:|\/\/|data:)/i);
  assert.doesNotMatch(markup, /\son[a-z]+\s*=/i);
  assert.equal((markup.match(/<header\b/g) ?? []).length, 1);
  assert.equal((markup.match(/<main\b/g) ?? []).length, 1);
  assert.equal((markup.match(/<footer\b/g) ?? []).length, 1);
  assert.equal(headingLevels.filter((level) => level === 1).length, 1);
  for (let index = 1; index < headingLevels.length; index += 1) {
    assert.ok(headingLevels[index] <= headingLevels[index - 1] + 1, `heading jump ${headingLevels[index - 1]} to ${headingLevels[index]}`);
  }
  for (const reference of labelledBy) assert.ok(ids.has(reference), `missing aria-labelledby target ${reference}`);
  assert.match(markup, /<a class="skip-link" href="#main-content">Skip to lifecycle content<\/a>/);
});

test("T003 print keeps Current and Planned detail but substitutes compact Completed and activity summaries", () => {
  // Arrange
  const activeTask = { id: "T900@aaaaaaaa", glyph: "~", state: "in-progress", description: "Useful current print detail", deps: [], blockedBy: null };
  const active = fixtureItem("active-print", {
    defined: true,
    hasInProgress: true,
    tasksAvailable: true,
    tasks: [activeTask],
    unphasedTasks: [activeTask],
    taskCounts: { open: 0, active: 1, blocked: 0, done: 0, total: 1 },
  });
  const activity = Array.from({ length: 1146 }, (_, appendIndex) => ({
    text: `2026-08-04 UTC - activity ${appendIndex}`,
    date: "2026-08-04",
    appendIndex,
  }));
  const planned = fixtureItem("planned-print", { excerpt: "Useful planned print detail", coordinatorLog: activity });
  const completed = Array.from({ length: 26 }, (_, index) => {
    const id = `T${String(index + 100).padStart(3, "0")}@${String(index).padStart(8, "0")}`;
    const task = { id, glyph: "x", state: "done", description: `Completed corpus ${index}`, deps: [], blockedBy: null };
    return fixtureItem(`completed-${index}`, {
      defined: true,
      packageComplete: true,
      tasksAvailable: true,
      tasks: [task],
      unphasedTasks: [task],
      taskCounts: { open: 0, active: 0, blocked: 0, done: 1, total: 1 },
    });
  });

  // Act
  const model = deriveLifecycleModel({ items: [active, planned, ...completed], order: [] });
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const html = renderReport(template, model);
  const printIndex = /<ol class="print-completed-index"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? "";

  // Assert
  assert.equal((printIndex.match(/<li>/g) ?? []).length, 26);
  assert.doesNotMatch(printIndex, /T\d{3}@|Completed corpus/);
  assert.match(html, /1146 dated Coordinator Log entries are available in the HTML report; the full activity list is omitted from print/);
  assert.match(template, /\.skip-link, \.completed-library, \.activity-library \{ display: none; \}/);
  assert.match(template, /\.print-completed-index, \.print-activity-summary \{ display: block; \}/);
  assert.match(template, /\.current-work details:not\(\[open\]\) > \.feature-body,[\s\S]*\.planned-work details:not\(\[open\]\) > \.feature-body \{ display: block !important; \}/);
  assert.match(html, /Useful current print detail/);
  assert.match(html, /Useful planned print detail/);
});

test("T004 Markdown and HTML share exact one-to-one lifecycle classification", () => {
  const blocked = fixtureItem("blocked", { defined: true, ownBlocked: true });
  const active = fixtureItem("active", { defined: true, hasInProgress: true });
  const next = fixtureItem("next", { defined: true });
  const later = fixtureItem("later", { defined: true });
  const draft = fixtureItem("draft");
  const waiting = fixtureItem("waiting", { defined: true });
  const done = fixtureItem("done", { defined: true, packageComplete: true });
  const model = deriveLifecycleModel({ items: [blocked, active, next, later, draft, waiting, done], order: ["next", "later"] });
  const markdown = renderMarkdown(model);
  const html = renderReport(fs.readFileSync(TEMPLATE_PATH, "utf8"), model);

  assert.deepEqual(markdownClassification(markdown), htmlClassification(html));
  assert.equal(markdownClassification(markdown).size, model.items.length);
  assert.match(markdown, /## Where are we\?/);
  assert.match(markdown, /## Current/);
  assert.match(markdown, /## Planned/);
  assert.match(markdown, /## Completed/);
  assert.match(markdown, /### Prioritized for later/);
  assert.match(markdown, /No explicit feature order declared|Explicit feature order is declared/);
  assert.match(markdown, /Coordinator activity is sourced only/);
});

test("T004 Mermaid contains current work only and Markdown does not duplicate HTML task detail", () => {
  const task = { id: "T001@aaaaaaaa", glyph: "~", state: "in-progress", description: "Deep task detail", deps: [], blockedBy: null };
  const active = fixtureItem("active", {
    defined: true,
    hasInProgress: true,
    tasksAvailable: true,
    tasks: [task],
    unphasedTasks: [task],
    taskCounts: { open: 0, active: 1, blocked: 0, done: 0, total: 1 },
  });
  const planned = fixtureItem("planned");
  const completed = fixtureItem("completed", { defined: true, packageComplete: true });
  const model = deriveLifecycleModel({ items: [active, planned, completed], order: [] });
  const markdown = renderMarkdown(model);
  const mermaid = renderCurrentMermaid(model);
  assert.match(mermaid, /active/);
  assert.doesNotMatch(mermaid, /planned|completed/);
  assert.equal((markdown.match(/```mermaid/g) ?? []).length, 1);
  assert.doesNotMatch(markdown, /T001@aaaaaaaa|Deep task detail|Original idea|Phases and tasks/);

  const emptyCurrent = deriveLifecycleModel({ items: [planned, completed], order: [] });
  const concise = renderMarkdown(emptyCurrent);
  assert.equal(renderCurrentMermaid(emptyCurrent), "");
  assert.doesNotMatch(concise, /```mermaid/);
  assert.doesNotMatch(concise, /### (Blocked|Active|Next)/);
  assert.doesNotMatch(concise, /Prioritized for later/);
});

test("T005 generate writes exactly the two fixed artifacts and dry generation writes nothing", () => {
  const root = makeRoot();
  try {
    writeIdea(root, "draft");
    const before = snapshotTree(root);
    const dry = runCli(root, ["generate"]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /==> \.dude\/backlog\.md/);
    assert.match(dry.stdout, /==> \.dude\/backlog\.html/);
    assert.deepEqual(snapshotTree(root), before);

    const wrote = runCli(root, ["generate", "--write"]);
    assert.equal(wrote.status, 0, wrote.stderr);
    const newFiles = snapshotTree(root)
      .filter((entry) => !before.includes(entry))
      .filter((entry) => entry.startsWith("file "))
      .map((entry) => entry.split(" ")[1]);
    assert.deepEqual(newFiles.sort(), [".dude/backlog.html", ".dude/backlog.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T030 refresh renders both postimages before either committed artifact advances", () => {
  // Arrange
  const root = makeRoot("dude-backlog-render-before-write-");
  const artifacts = backlogArtifactPaths(root);
  const before = {
    markdown: Buffer.from("legacy markdown preimage\n"),
    html: Buffer.from("legacy html preimage\n"),
  };
  writeIdea(root, "render-before-write");
  fs.writeFileSync(artifacts.markdown, before.markdown);
  fs.writeFileSync(artifacts.html, before.html);
  const realReadFileSync = fs.readFileSync;
  let templateRead = false;

  try {
    // Act
    // @ts-ignore -- deliberate render-stage failure injection
    fs.readFileSync = (file, ...rest) => {
      if (file instanceof URL && file.href === TEMPLATE_URL.href) {
        templateRead = true;
        throw new Error("injected HTML render failure");
      }
      return realReadFileSync(file, ...rest);
    };
    assert.throws(
      () => refreshCommittedBacklog({ root }),
      /injected HTML render failure/,
      "a failed second postimage render must stop before any artifact write",
    );

    // Assert
    assert.equal(templateRead, true, "the complete HTML render path was reached");
    assert.deepEqual(fs.readFileSync(artifacts.markdown), before.markdown, "Markdown preimage remains exact");
    assert.deepEqual(fs.readFileSync(artifacts.html), before.html, "HTML preimage remains exact");
  } finally {
    fs.readFileSync = realReadFileSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T030 refresh restores pair preimages after first or truncated second write failures", () => {
  const scenarios = [
    { label: "present pair / first Markdown write", target: "markdown", present: true },
    { label: "present pair / truncated second HTML write", target: "html", present: true },
    { label: "missing pair / truncated second HTML write", target: "html", present: false },
  ];

  for (const scenario of scenarios) {
    // Arrange
    const root = makeRoot(`dude-backlog-restore-${scenario.target}-`);
    const artifacts = backlogArtifactPaths(root);
    const before = {
      markdown: Buffer.from(`legacy Markdown ${scenario.label}\n`),
      html: Buffer.from(`legacy HTML ${scenario.label}\n`),
    };
    writeIdea(root, `restore-${scenario.target}-${scenario.present ? "present" : "missing"}`);
    if (scenario.present) {
      fs.writeFileSync(artifacts.markdown, before.markdown);
      fs.writeFileSync(artifacts.html, before.html);
    }
    const realWriteFileSync = fs.writeFileSync;
    const target = artifacts[scenario.target];
    let injected = 0;

    try {
      // Act
      // @ts-ignore -- deliberate O_TRUNC-style writer failure injection
      fs.writeFileSync = (file, data, ...rest) => {
        if (injected === 0 && path.resolve(String(file)) === target) {
          injected += 1;
          realWriteFileSync(file, Buffer.from("truncated before write failure\n"), ...rest);
          throw new Error(`injected ${scenario.target} write failure`);
        }
        return realWriteFileSync(file, data, ...rest);
      };
      assert.throws(
        () => refreshCommittedBacklog({ root }),
        new RegExp(`injected ${scenario.target} write failure`),
        scenario.label,
      );
      fs.writeFileSync = realWriteFileSync;

      // Assert
      assert.equal(injected, 1, `${scenario.label}: the intended write failed`);
      if (scenario.present) {
        assert.deepEqual(fs.readFileSync(artifacts.markdown), before.markdown, `${scenario.label}: Markdown restored`);
        assert.deepEqual(fs.readFileSync(artifacts.html), before.html, `${scenario.label}: HTML restored`);
      } else {
        assert.equal(readIfPresent(artifacts.markdown), null, `${scenario.label}: missing Markdown stays missing`);
        assert.equal(readIfPresent(artifacts.html), null, `${scenario.label}: missing HTML stays missing`);
      }

      if (scenario.label === "present pair / truncated second HTML write") {
        const stale = runCli(root, ["check"]);
        assert.equal(stale.status, 3, stale.stderr);
        assert.match(stale.stderr, /\[STALE\] \.dude\/backlog\.md/);
        assert.match(stale.stderr, /\[STALE\] \.dude\/backlog\.html/);
      }
    } finally {
      fs.writeFileSync = realWriteFileSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("T030 direct refresh and generate --write commit the exact fresh pair", () => {
  // Arrange
  const root = makeRoot("dude-backlog-refresh-success-");
  const artifacts = backlogArtifactPaths(root);
  try {
    writeIdea(root, "refresh-success");
    const expected = renderArtifacts({ root });

    // Act
    refreshCommittedBacklog({ root });

    // Assert
    assertCommittedPair(root, expected, "direct refresh");

    // Arrange a distinct stale pair to exercise the explicit generate write path.
    fs.writeFileSync(artifacts.markdown, "stale Markdown\n");
    fs.writeFileSync(artifacts.html, "stale HTML\n");

    // Act
    const generated = runCli(root, ["generate", "--write"]);

    // Assert
    assert.equal(generated.status, 0, generated.stderr);
    assert.match(generated.stdout, /\[OK\] wrote \.dude\/backlog\.md and \.dude\/backlog\.html/);
    assertCommittedPair(root, expected, "generate --write");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("T005 runtime reads neither approved preview nor optional visual pack and keeps fixed paths", () => {
  const source = fs.readFileSync(BACKLOG_PATH, "utf8");
  assert.equal(source.includes("design/preview.html"), false);
  assert.equal(source.includes("dude-pack-strata-visual"), false);
  assert.equal(source.includes("node:child_process"), false);
  assert.match(source, /const BACKLOG_MD_PATH = "\.dude\/backlog\.md"/);
  assert.match(source, /const BACKLOG_HTML_PATH = "\.dude\/backlog\.html"/);
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

test("T005 committed backlog artifacts are mechanically fresh in the existing test path", () => {
  const result = runCli(REPO_ROOT, ["check"]);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /\.dude\/backlog\.md is current/);
  assert.match(result.stdout, /\.dude\/backlog\.html is current/);
});
