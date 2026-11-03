#!/usr/bin/env node
// @ts-check
/** Deterministic lifecycle backlog collector, model, and renderers. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CANONICAL_IDEA_KEYS, inventoryLifecycleIdentities, resolveIdeaSelector } from "../dude-engine/lib/feature.mjs";
import { parseFrontmatterScalars, parseIdeaIdentity, parseSpecIdentity } from "../dude-engine/lib/feature-identity.mjs";
import { parseTasks } from "../dude-engine/lib/tasks.mjs";
import { workProgress, workStage } from "../dude-engine/lib/work-progress.mjs";
import { WORKSPACE_PATHS, resolveWorkspacePath } from "../dude-engine/lib/workspace-paths.mjs";

const BACKLOG_ORDER_PATH = `${WORKSPACE_PATHS.STATE_DIR}/backlog-order.md`;
const CANONICAL_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const CURRENT_GROUPS = Object.freeze([
  { key: "blocked", title: "Blocked" },
  { key: "active", title: "Active" },
  { key: "next", title: "Next" },
]);

/** @param {string} left @param {string} right */
function compareIdentity(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareLifecycle(left, right) {
  const leftNumber = Number.isSafeInteger(left.numberValue) ? left.numberValue : Number.MAX_SAFE_INTEGER;
  const rightNumber = Number.isSafeInteger(right.numberValue) ? right.numberValue : Number.MAX_SAFE_INTEGER;
  return leftNumber - rightNumber || compareIdentity(left.identity, right.identity);
}

/** @param {string} value */
function safeMermaidLabel(value) {
  return String(value)
    .replace(/[\[\](){}\"#;]/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} id */
export function safeMermaidId(id) {
  return String(id).replace(/[^A-Za-z0-9]/g, "_");
}

/** Parse the optional explicit order list. */
export function parseBacklogOrder(content) {
  const slugs = [];
  for (const line of String(content).split(/\r\n|\n|\r/)) {
    const match = /^\s*(?:[-*]\s+|\d+\.\s+)([a-z0-9][a-z0-9-]*)\s*$/.exec(line);
    if (match) slugs.push(match[1]);
  }
  return slugs;
}

/** Return visible ATX headings while ignoring fenced code blocks. */
function visibleHeadings(content) {
  const lines = String(content).split(/\r\n|\n|\r/);
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (heading) headings.push({ level: heading[1].length, title: heading[2].trim(), line: index });
  }
  return { lines, headings };
}

/** Extract one visible heading section without interpreting its prose. */
function extractSection(content, level, title) {
  const { lines, headings } = visibleHeadings(content);
  const headingIndex = headings.findIndex((heading) => heading.level === level && heading.title === title);
  if (headingIndex < 0) return "";
  const start = headings[headingIndex].line + 1;
  const next = headings.slice(headingIndex + 1).find((heading) => heading.level <= level);
  return lines.slice(start, next ? next.line : lines.length).join("\n").trim();
}

/** Return visible prose lines, excluding fenced examples and HTML comments. */
function visibleProseLines(content) {
  const lines = String(content).split(/\r\n|\n|\r/);
  const visible = [];
  let fence = null;
  let inComment = false;
  for (const rawLine of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(rawLine)?.[1] ?? null;
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    let output = "";
    let cursor = 0;
    while (cursor < rawLine.length) {
      if (inComment) {
        const close = rawLine.indexOf("-->", cursor);
        if (close < 0) {
          cursor = rawLine.length;
          break;
        }
        cursor = close + 3;
        inComment = false;
        continue;
      }
      const open = rawLine.indexOf("<!--", cursor);
      if (open < 0) {
        output += rawLine.slice(cursor);
        break;
      }
      output += rawLine.slice(cursor, open);
      cursor = open + 4;
      inComment = true;
    }
    visible.push(output);
  }
  return visible;
}

/** Admit only an explicit literal `depends-on: <slug>` marker in visible prose. */
export function parseProvisionalRelationships(ideaBody) {
  const relationships = [];
  const seen = new Set();
  for (const line of visibleProseLines(ideaBody)) {
    if (/^\s*>/.test(line)) continue;
    // The capture is already the canonical slug shape, so no further slug check can fail.
    for (const match of line.matchAll(/`depends-on:\s*([a-z0-9][a-z0-9-]*)`/g)) {
      if (seen.has(match[1])) continue;
      seen.add(match[1]);
      relationships.push({ targetSlug: match[1] });
    }
  }
  return relationships;
}

function readSafeFile(root, relativePath) {
  try {
    const absolute = resolveWorkspacePath(root, relativePath);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    return fs.readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

function listIdeaFiles(root) {
  let directory;
  try {
    directory = resolveWorkspacePath(root, WORKSPACE_PATHS.IDEAS_DIR);
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return [];
  } catch {
    return [];
  }
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    const absolutePath = path.join(directory, entry.name);
    try {
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
    } catch {
      continue;
    }
    const ideaPath = `${WORKSPACE_PATHS.IDEAS_DIR}/${entry.name}`;
    const identity = parseIdeaIdentity(ideaPath);
    files.push({
      name: entry.name,
      ideaPath,
      absolutePath,
      number: identity?.number ?? null,
      numberValue: identity?.numberValue ?? null,
      identitySlug: identity?.slug ?? entry.name.slice(0, -3),
    });
  }
  return files.sort((left, right) => {
    const leftNumber = left.numberValue ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = right.numberValue ?? Number.MAX_SAFE_INTEGER;
    return leftNumber - rightNumber || compareIdentity(left.ideaPath, right.ideaPath);
  });
}

function collectExactSpecPathClaims(content) {
  const lines = String(content).split(/\r\n|\n|\r/);
  if (lines[0] !== "---") return [];
  const endIndex = lines.indexOf("---", 1);
  if (endIndex < 0) return [];
  const declarations = lines.slice(1, endIndex).filter((line) => /^spec_path[ \t]*:/.test(line));
  const claims = [];
  for (const declaration of declarations) {
    try {
      const frontmatter = parseFrontmatterScalars(
        `---\n${declaration}\n---`,
        { canonicalKeys: ["spec_path"] },
      );
      const claim = parseSpecIdentity(frontmatter.scalars.get("spec_path")?.value ?? "")?.path;
      if (claim) claims.push(claim);
    } catch {
      // Malformed declarations are not ownership evidence.
    }
  }
  return claims;
}

function readOrder(root) {
  const content = readSafeFile(root, BACKLOG_ORDER_PATH);
  return content === null ? [] : parseBacklogOrder(content);
}

function taskCounts(tasks) {
  const counts = { open: 0, active: 0, blocked: 0, done: 0, total: tasks.length };
  for (const task of tasks) {
    if (task.state === "done") counts.done += 1;
    else if (task.state === "in-progress") counts.active += 1;
    else if (task.state === "blocked") counts.blocked += 1;
    else counts.open += 1;
  }
  return counts;
}

function taskDetail(task) {
  return {
    id: task.id,
    description: task.description,
    deps: [...task.deps],
  };
}

/** Collect every safe direct idea and its exact-owner evidence. */
export function collectLifecycleItems({ root }) {
  const inventory = inventoryLifecycleIdentities({ root });
  const files = listIdeaFiles(root).map((file) => ({
    ...file,
    content: fs.readFileSync(file.absolutePath, "utf8"),
  }));
  const diagnosticsByIdea = new Map();
  for (const diagnostic of inventory.diagnostics) {
    const list = diagnosticsByIdea.get(diagnostic.path) ?? [];
    list.push(diagnostic.message);
    diagnosticsByIdea.set(diagnostic.path, list);
  }
  const claimantsBySpec = new Map();
  for (const file of files) {
    for (const specPath of collectExactSpecPathClaims(file.content)) {
      const claimants = claimantsBySpec.get(specPath) ?? new Set();
      claimants.add(file.ideaPath);
      claimantsBySpec.set(specPath, claimants);
    }
  }
  const ownersBySpec = new Map();
  for (const feature of inventory.features) {
    const list = ownersBySpec.get(feature.specPath) ?? [];
    list.push(feature);
    ownersBySpec.set(feature.specPath, list);
  }
  const ownerByIdea = new Map();
  const ambiguousOwnerIdeas = new Set();
  for (const claimants of claimantsBySpec.values()) {
    if (claimants.size > 1) {
      for (const ideaPath of claimants) ambiguousOwnerIdeas.add(ideaPath);
    }
  }
  for (const candidates of ownersBySpec.values()) {
    if (candidates.length === 1) {
      const candidate = candidates[0];
      if (!ambiguousOwnerIdeas.has(candidate.ideaPath)
        && (diagnosticsByIdea.get(candidate.ideaPath) ?? []).length === 0) {
        ownerByIdea.set(candidate.ideaPath, candidate.specPath);
      }
    } else {
      for (const candidate of candidates) ambiguousOwnerIdeas.add(candidate.ideaPath);
    }
  }
  const items = [];
  for (const file of files) {
    const { content } = file;
    let slug = file.identitySlug;
    let authoritySlug = null;
    let status = "unknown";
    let rawStatus = null;
    let rawSpecPath = null;
    let declaredSpecPath = null;
    let dependsOn = [];
    let frontmatterAvailable = true;
    let dependencyAvailable = false;
    const localAuthorityIssues = [];
    try {
      const frontmatter = parseFrontmatterScalars(content, { canonicalKeys: CANONICAL_IDEA_KEYS });
      const parsedSlug = frontmatter.scalars.get("slug")?.value || file.identitySlug;
      slug = CANONICAL_SLUG_RE.test(parsedSlug) ? parsedSlug : file.identitySlug;
      // Display identity always resolves; only a canonical frontmatter slug carries authority.
      authoritySlug = CANONICAL_SLUG_RE.test(parsedSlug) ? parsedSlug : null;
      if (slug !== parsedSlug) localAuthorityIssues.push("The idea slug is malformed; the file name is used only as a stable display identity.");
      const statusScalar = frontmatter.scalars.get("status");
      rawStatus = statusScalar?.raw ?? null;
      status = statusScalar?.value || "unknown";
      rawSpecPath = frontmatter.scalars.get("spec_path")?.value ?? null;
      const declared = rawSpecPath ?? "";
      declaredSpecPath = status === "resolved" ? null : parseSpecIdentity(declared)?.path ?? null;
      const dependencyText = frontmatter.scalars.get("depends-on")?.value || "";
      const dependencyTokens = dependencyText.split(/[\s,]+/).filter(Boolean);
      dependencyAvailable = dependencyTokens.every((value) => CANONICAL_SLUG_RE.test(value));
      if (dependencyAvailable) dependsOn = [...new Set(dependencyTokens)];
      else localAuthorityIssues.push("Dependency data is unavailable because depends-on metadata is malformed.");
    } catch (error) {
      frontmatterAvailable = false;
      localAuthorityIssues.push(`Idea metadata is unavailable (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (ambiguousOwnerIdeas.has(file.ideaPath)) {
      authoritySlug = null;
      localAuthorityIssues.push("Feature ownership is unavailable because multiple ideas claim the same spec_path.");
    } else if ((diagnosticsByIdea.get(file.ideaPath) ?? []).length > 0) {
      authoritySlug = null;
    }

    const ownerSpecPath = ownerByIdea.get(file.ideaPath) ?? null;
    const resolvedCandidate = status === "resolved";
    const itemDiagnostics = [
      ...(diagnosticsByIdea.get(file.ideaPath) ?? []),
      ...localAuthorityIssues,
    ];
    const resolved = resolvedCandidate
      && rawStatus === "resolved"
      && rawSpecPath === ""
      && ownerSpecPath === null
      && frontmatterAvailable
      && itemDiagnostics.length === 0;
    const lifecycleAvailable = status === "draft" || status === "defined" || resolved;
    if (!lifecycleAvailable) {
      localAuthorityIssues.push("Lifecycle status is unavailable because idea metadata has no valid draft, defined, or resolved status.");
    }
    if (resolvedCandidate && ownerSpecPath !== null) {
      localAuthorityIssues.push("A resolved idea must not claim a feature definition.");
    }
    const declaredDefined = lifecycleAvailable && status === "defined";
    const defined = !resolvedCandidate && (Boolean(ownerSpecPath) || declaredDefined);
    const specPath = resolvedCandidate ? null : ownerSpecPath;
    const displaySpecPath = ownerSpecPath ?? declaredSpecPath;
    const displayTasksPath = displaySpecPath
      ? `${displaySpecPath.slice(0, -"spec.md".length)}tasks.md`
      : null;
    const specContent = ownerSpecPath ? readSafeFile(root, ownerSpecPath) : null;
    const tasksContent = displayTasksPath ? readSafeFile(root, displayTasksPath) : null;
    let parsedTasks = [];
    let taskWarnings = [];
    let tasksAvailable = false;
    if (tasksContent !== null) {
      try {
        const parsed = parseTasks(tasksContent, { path: displayTasksPath ?? undefined });
        taskWarnings = [...parsed.warnings];
        const ambiguous = Boolean(parsed.boardIssue) || taskWarnings.some((warning) => (
          warning.startsWith("duplicate task id ") || warning.startsWith("malformed task line ")
        ));
        if (!ambiguous) {
          parsedTasks = parsed.tasks;
          tasksAvailable = true;
        }
      } catch (error) {
        taskWarnings = [error instanceof Error ? error.message : String(error)];
      }
    }
    const counts = taskCounts(parsedTasks);
    const body = extractSection(content, 2, "Idea");
    const packageComplete = !resolvedCandidate && Boolean(
      ownerSpecPath && tasksAvailable && parsedTasks.length > 0 && parsedTasks.every((task) => task.state === "done"),
    );
    const ownBlocked = Boolean(ownerSpecPath) && tasksAvailable && parsedTasks.some((task) => (
      task.state === "blocked" || (Boolean(task.blockedBy) && task.state !== "done")
    ));
    const hasInProgress = Boolean(ownerSpecPath)
      && tasksAvailable
      && parsedTasks.some((task) => task.state === "in-progress");
    const authorityIssues = [...new Set([...(diagnosticsByIdea.get(file.ideaPath) ?? []), ...localAuthorityIssues])];
    let unavailableDetail = null;
    if (!frontmatterAvailable || !lifecycleAvailable) unavailableDetail = "Lifecycle details are unavailable because idea metadata is ambiguous.";
    else if (declaredDefined && !ownerSpecPath) unavailableDetail = "The linked feature definition is unavailable or ambiguous.";
    else if (ownerSpecPath && specContent === null) unavailableDetail = "The linked feature specification is unavailable.";
    else if (ownerSpecPath && tasksContent === null) unavailableDetail = "The task file is unavailable.";
    else if (ownerSpecPath && !tasksAvailable) unavailableDetail = "Task state is unavailable because the tasks file is incomplete or ambiguous.";

    items.push({
      identity: file.ideaPath,
      ideaPath: file.ideaPath,
      number: file.number,
      numberValue: file.numberValue,
      slug,
      authoritySlug,
      status,
      rawStatus,
      rawSpecPath,
      frontmatterAvailable,
      lifecycleAvailable,
      dependencyAvailable,
      authorityIssues,
      ownerSpecPath,
      resolvedCandidate,
      resolved,
      defined,
      specPath,
      dependsOn,
      provisionalRelationships: parseProvisionalRelationships(body),
      tasks: parsedTasks.map(taskDetail),
      taskCounts: counts,
      taskWarnings,
      tasksAvailable,
      packageComplete,
      hasInProgress,
      ownBlocked,
      unavailableDetail,
    });
  }

  const slugCounts = new Map();
  for (const item of items) slugCounts.set(item.slug, (slugCounts.get(item.slug) ?? 0) + 1);
  for (const item of items) {
    if ((slugCounts.get(item.slug) ?? 0) > 1) item.authoritySlug = null;
  }
  return items;
}

function withItemDefaults(item, index) {
  const identity = typeof item.identity === "string"
    ? item.identity
    : typeof item.ideaPath === "string"
      ? item.ideaPath
      : `item-${index}`;
  const slug = typeof item.slug === "string" ? item.slug : identity;
  const parsedIdentity = parseIdeaIdentity(item.ideaPath ?? identity);
  const number = typeof item.number === "string" ? item.number : parsedIdentity?.number ?? null;
  const numberValue = Number.isSafeInteger(item.numberValue)
    ? item.numberValue
    : parsedIdentity?.numberValue ?? null;
  const counts = item.taskCounts ?? taskCounts(Array.isArray(item.tasks) ? item.tasks : []);
  const status = item.status ?? (item.defined ? "defined" : "draft");
  const rawStatus = item.rawStatus ?? status;
  const rawSpecPath = item.rawSpecPath ?? null;
  const frontmatterAvailable = item.frontmatterAvailable ?? true;
  const authorityIssues = Array.isArray(item.authorityIssues) ? [...item.authorityIssues] : [];
  const ownerSpecPath = item.ownerSpecPath ?? item.specPath ?? null;
  const resolvedCandidate = status === "resolved";
  const resolved = resolvedCandidate
    && rawStatus === "resolved"
    && rawSpecPath === ""
    && ownerSpecPath === null
    && frontmatterAvailable
    && authorityIssues.length === 0;
  const lifecycleAvailable = resolvedCandidate
    ? resolved
    : frontmatterAvailable
      && (status === "draft" || status === "defined")
      && (item.lifecycleAvailable ?? true);
  const defined = resolvedCandidate ? false : Boolean(item.defined);
  const specPath = resolvedCandidate ? null : item.specPath ?? null;
  return {
    identity,
    ideaPath: item.ideaPath ?? identity,
    number,
    numberValue,
    slug,
    authoritySlug: item.authoritySlug === undefined ? (CANONICAL_SLUG_RE.test(slug) ? slug : null) : item.authoritySlug,
    status,
    rawStatus,
    rawSpecPath,
    frontmatterAvailable,
    lifecycleAvailable,
    dependencyAvailable: item.dependencyAvailable ?? true,
    authorityIssues,
    taskWarnings: Array.isArray(item.taskWarnings) ? [...item.taskWarnings] : [],
    ownerSpecPath,
    resolvedCandidate,
    resolved,
    defined,
    specPath,
    dependsOn: Array.isArray(item.dependsOn) ? [...item.dependsOn] : [],
    provisionalRelationships: Array.isArray(item.provisionalRelationships) ? [...item.provisionalRelationships] : [],
    tasks: Array.isArray(item.tasks) ? [...item.tasks] : [],
    taskCounts: { ...counts },
    tasksAvailable: resolvedCandidate ? false : Boolean(item.tasksAvailable),
    packageComplete: resolvedCandidate ? false : Boolean(item.packageComplete),
    hasInProgress: Boolean(item.hasInProgress),
    ownBlocked: Boolean(item.ownBlocked),
    unavailableDetail: item.unavailableDetail ?? null,
  };
}

/** Index items by the slug that carries authority; a malformed slug indexes nothing. */
function uniqueItemsBySlug(items) {
  const candidates = new Map();
  for (const item of items) {
    if (item.authoritySlug === null) continue;
    const list = candidates.get(item.authoritySlug) ?? [];
    list.push(item);
    candidates.set(item.authoritySlug, list);
  }
  const unique = new Map();
  for (const [slug, list] of candidates) if (list.length === 1) unique.set(slug, list[0]);
  return unique;
}

/**
 * Plan only the target's declared prerequisites, using existing lifecycle authority.
 * @param {{ root: string, target: string }} options
 */
export function planShipRun({ root, target }) {
  const selection = resolveIdeaSelector({
    root,
    ...(typeof target === "string" && target.startsWith(".dude/")
      ? { ideaPath: target }
      : { slug: target }),
  });
  const plan = {
    target: selection.idea?.ideaPath ?? null,
    runnable: false,
    order: [],
    skipped: [],
    diagnostics: [],
  };
  const diagnosed = new Set();
  const diagnose = (code, diagnosticPath, message) => {
    const key = `${code}\0${diagnosticPath}`;
    if (diagnosed.has(key)) return;
    diagnosed.add(key);
    plan.diagnostics.push({ code, path: diagnosticPath, message });
  };
  for (const diagnostic of selection.diagnostics) {
    if (diagnostic.severity === "error") diagnose(diagnostic.code, diagnostic.path, diagnostic.message);
  }
  if (!selection.idea || plan.diagnostics.length > 0) return plan;

  const items = collectLifecycleItems({ root });
  const unique = uniqueItemsBySlug(items);
  const targetItem = items.find((item) => item.ideaPath === selection.idea.ideaPath);
  if (targetItem?.status === "resolved") {
    diagnose("SHIP_PLAN_MEMBER_RESOLVED", targetItem.ideaPath,
      `Target '${targetItem.slug}' is resolved; reopen it through an explicit brainstorm before shipping.`);
    return plan;
  }
  if (!targetItem || !targetItem.dependencyAvailable) {
    diagnose("SHIP_PLAN_MEMBER_UNAVAILABLE", selection.idea.ideaPath,
      `Cannot read declared prerequisites for '${selection.idea.slug}'; repair its depends-on metadata before shipping.`);
    return plan;
  }

  const ordered = [];
  const skipped = [];
  const visited = new Set();
  const stack = [];
  const stackIndex = new Map();
  const walk = (item) => {
    stackIndex.set(item.ideaPath, stack.length);
    stack.push(item);
    for (const slug of item.dependsOn) {
      const member = unique.get(slug);
      if (!member) {
        diagnose("SHIP_PLAN_PREREQUISITE_MISSING", item.ideaPath,
          `Declared prerequisite '${slug}' has no unique authoritative idea; capture it through brainstorm or change the declared prerequisites.`);
        continue;
      }
      if (member.status === "resolved") {
        diagnose("SHIP_PLAN_MEMBER_RESOLVED", member.ideaPath,
          `Prerequisite '${member.slug}' is resolved, not complete; reopen it through an explicit brainstorm or change the declared prerequisites.`);
        continue;
      }
      if (stackIndex.has(member.ideaPath)) {
        const cycle = [...stack.slice(stackIndex.get(member.ideaPath)).map((entry) => entry.slug), member.slug];
        diagnose("SHIP_PLAN_DEPENDENCY_CYCLE", member.ideaPath,
          `Declared prerequisite cycle: ${cycle.join(" -> ")}. Change the declared prerequisites before shipping.`);
        continue;
      }
      if (visited.has(member.ideaPath)) continue;
      const stage = workStage(member);
      if (stage === null || !member.dependencyAvailable) {
        const reason = !member.dependencyAvailable
          ? "Declared prerequisite data is unavailable."
          : member.unavailableDetail ?? "Lifecycle or task data is unavailable.";
        diagnose("SHIP_PLAN_MEMBER_UNAVAILABLE", member.ideaPath,
          `Cannot plan prerequisite '${member.slug}': ${reason} Repair its records before shipping.`);
        continue;
      }
      visited.add(member.ideaPath);
      if (stage === "Completed") {
        skipped.push(member);
        continue;
      }
      walk(member);
      ordered.push(member);
    }
    stack.pop();
    stackIndex.delete(item.ideaPath);
  };
  walk(targetItem);
  if (plan.diagnostics.length > 0) return plan;

  ordered.push(targetItem);
  plan.runnable = true;
  plan.order = ordered.map((item) => ({
    ideaPath: item.ideaPath,
    specPath: item.specPath,
    slug: item.slug,
    stage: workStage(item),
    requested: item.ideaPath === plan.target,
    prerequisites: item.dependsOn.map((slug) => unique.get(slug).ideaPath),
  }));
  plan.skipped = skipped.map((item) => ({
    ideaPath: item.ideaPath,
    specPath: item.specPath,
    slug: item.slug,
  }));
  return plan;
}

/** An item without a valid canonical slug carries no dependency authority in either direction. */
function authoritativeDependsOn(item) {
  return item.authoritySlug ? item.dependsOn : [];
}

function buildRelationships(items, validOrder) {
  const unique = uniqueItemsBySlug(items);
  const declared = [];
  const provisional = [];
  for (const item of items) {
    if (item.authoritySlug === null) continue;
    for (const targetSlug of item.dependsOn) {
      declared.push({
        type: "dependency",
        from: unique.get(targetSlug) ?? null,
        fromSlug: targetSlug,
        to: item,
        toSlug: item.slug,
      });
    }
    for (const relation of item.provisionalRelationships) {
      provisional.push({ fromSlug: relation.targetSlug, toSlug: item.slug });
    }
  }
  return {
    declared,
    provisional,
    unavailable: items.filter((item) => !item.dependencyAvailable),
    hasExplicitOrder: validOrder.length > 0,
  };
}

/** Derive the single Current, Planned, and Completed lifecycle model. */
export function deriveLifecycleModel({ items: sourceItems = [], order = [] }) {
  const items = sourceItems
    .map(withItemDefaults)
    .sort(compareLifecycle);
  const unique = uniqueItemsBySlug(items);
  const orderIndex = new Map();
  const validOrder = [];
  for (const slug of Array.isArray(order) ? order : []) {
    if (!unique.has(slug) || orderIndex.has(slug)) continue;
    orderIndex.set(slug, validOrder.length);
    validOrder.push(slug);
  }
  const namedAsDependency = new Set(items.flatMap((item) => authoritativeDependsOn(item)));
  const dependencyMet = (slug) => {
    const target = unique.get(slug);
    return Boolean(target && target.defined && target.packageComplete);
  };

  const completed = [];
  const blocked = [];
  const active = [];
  const pool = [];
  for (const item of items) {
    if (item.resolved) completed.push(item);
    else if (!item.resolvedCandidate && item.lifecycleAvailable && item.defined && item.packageComplete) completed.push(item);
    else if (item.ownBlocked || authoritativeDependsOn(item).some((slug) => !dependencyMet(slug))) blocked.push(item);
    else if (item.hasInProgress) active.push(item);
    else pool.push(item);
  }

  const awaitingDefinition = [];
  const definedAwaitingWork = [];
  const ordered = [];
  for (const item of pool) {
    const hasSignal = authoritativeDependsOn(item).length > 0 || namedAsDependency.has(item.authoritySlug) || orderIndex.has(item.authoritySlug);
    if (hasSignal) ordered.push(item);
    else if (item.defined) definedAwaitingWork.push(item);
    else awaitingDefinition.push(item);
  }

  const next = [];
  const prioritizedLater = [];
  for (const item of ordered) {
    const position = orderIndex.get(item.authoritySlug);
    const unfinishedAhead = position !== undefined && ordered.some((candidate) => {
      if (candidate.identity === item.identity) return false;
      const candidatePosition = orderIndex.get(candidate.authoritySlug);
      return candidatePosition !== undefined && candidatePosition < position;
    });
    if (unfinishedAhead) prioritizedLater.push(item);
    else next.push(item);
  }

  const byIdentity = compareLifecycle;
  const byOrder = (left, right) => (
    (orderIndex.get(left.authoritySlug) ?? Number.MAX_SAFE_INTEGER)
    - (orderIndex.get(right.authoritySlug) ?? Number.MAX_SAFE_INTEGER)
    || byIdentity(left, right)
  );
  completed.sort(byIdentity);
  blocked.sort(byIdentity);
  active.sort(byIdentity);
  awaitingDefinition.sort(byIdentity);
  definedAwaitingWork.sort(byIdentity);
  next.sort(byOrder);
  prioritizedLater.sort(byOrder);

  const assign = (rows, group) => {
    for (const item of rows) item.group = group;
  };
  assign(blocked, "blocked");
  assign(active, "active");
  assign(next, "next");
  assign(awaitingDefinition, "awaiting-definition");
  assign(definedAwaitingWork, "defined-awaiting-work");
  assign(prioritizedLater, "prioritized-later");
  assign(completed, "completed");

  return {
    summary: {
      currentWork: blocked.length + active.length,
      readyNext: next.length,
      ideasAwaitingDefinition: awaitingDefinition.length + prioritizedLater.filter((item) => !item.defined).length,
      definedAwaitingWork: definedAwaitingWork.length + prioritizedLater.filter((item) => item.defined).length,
      completed: completed.length,
    },
    current: { blocked, active, next },
    planned: { awaitingDefinition, definedAwaitingWork, prioritizedLater },
    completed,
    items,
    relationships: buildRelationships(items, validOrder),
  };
}

/** Collect and derive the lifecycle model from one workspace root. */
export function collectLifecycleModel({ root }) {
  return deriveLifecycleModel({ items: collectLifecycleItems({ root }), order: readOrder(root) });
}

/** Render a current-work-only Mermaid diagram. */
export function renderCurrentMermaid(model) {
  const lines = ["```mermaid", "kanban"];
  let count = 0;
  for (const group of CURRENT_GROUPS) {
    const rows = model.current[group.key];
    if (rows.length === 0) continue;
    lines.push(`  ${group.key}[${group.title}]`);
    for (const item of rows) {
      count += 1;
      lines.push(`    work_${count}[${safeMermaidLabel(`${item.number ?? ""} ${item.slug}`.trim())}]`);
    }
  }
  if (count === 0) return "";
  lines.push("```", "");
  return lines.join("\n");
}

/** Render a compact plain-text status view. */
export function renderText(model, { tracked = false } = {}) {
  const s = model.summary;
  const lines = [
    `Where are we: current ${s.currentWork}; ready/next ${s.readyNext}; awaiting definition ${s.ideasAwaitingDefinition}; defined awaiting work ${s.definedAwaitingWork}; completed ${s.completed}`,
  ];
  if (tracked) lines.push("Defined work shows stage unavailable because tracked work is authoritative and this view does not read it.");
  lines.push("");
  const add = (title, rows) => {
    lines.push(`${title} (${rows.length}):`);
    if (rows.length === 0) lines.push("  (none)");
    else for (const item of rows) lines.push(
      `  ${item.number ? `${item.number} ` : ""}${item.slug} · ${workStage(item, { tracked }) ?? "stage unavailable"}`,
    );
    lines.push("");
  };
  add("Blocked", model.current.blocked);
  add("Active", model.current.active);
  add("Next", model.current.next);
  add("Ideas awaiting definition", model.planned.awaitingDefinition);
  add("Defined awaiting work", model.planned.definedAwaitingWork);
  if (model.planned.prioritizedLater.length > 0) add("Prioritized for later", model.planned.prioritizedLater);
  add("Completed", model.completed);

  const { declared, provisional, unavailable, hasExplicitOrder } = model.relationships;
  lines.push("Dependency and order notes:");
  lines.push(hasExplicitOrder
    ? `  Explicit feature order is declared in ${BACKLOG_ORDER_PATH}.`
    : "  No explicit feature order declared.");
  // Unavailable dependency data is not evidence that a feature has no dependencies.
  if (declared.length === 0 && unavailable.length === 0) lines.push("  No declared feature dependencies are present.");
  for (const relation of declared) lines.push(`  Declared: ${relation.toSlug} depends on ${relation.fromSlug}.`);
  for (const item of unavailable) lines.push(`  Dependency data is unavailable for ${item.slug}; no negative dependency fact is inferred.`);
  if (provisional.length === 0) lines.push("  No provisional body-stated dependency evidence was recognized.");
  for (const relation of provisional) lines.push(
    `  Provisional, non-authoritative: ${relation.toSlug} states a relationship to ${relation.fromSlug}. This does not affect lifecycle classification.`,
  );
  lines.push("");
  return lines.join("\n");
}

/** Render one package task dependency flowchart. */
export function renderFlowchart(tasks, meta = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const known = new Set(list.map((task) => task.id));
  const lines = ["```mermaid", "flowchart TD"];
  if (meta.slug) lines.push(`  %% ${safeMermaidLabel(meta.slug)}`);
  for (const task of list) lines.push(`  ${safeMermaidId(task.id)}[\"${safeMermaidLabel(`${task.id} ${task.description ?? ""}`)}\"]`);
  for (const task of list) {
    for (const dependency of task.deps ?? []) {
      if (known.has(dependency)) lines.push(`  ${safeMermaidId(dependency)} --> ${safeMermaidId(task.id)}`);
      else lines.push(`  %% task ${task.id} depends on unknown id ${dependency}`);
    }
  }
  lines.push("```", "");
  return lines.join("\n");
}

/** Render the shared report without deriving any new progress facts. */
function renderProgress(report) {
  const { subject, words, stage, phases, design, checkpoints, gates, requests, unknown } = report;
  const name = `${subject.number ? `${subject.number} ` : ""}${subject.slug}`;
  const lines = [[name, ...words].join(" · ")];
  lines.push(stage.value === null
    ? `Stage: unavailable. ${stage.reason}`
    : `Stage: ${stage.value} (${stage.source})`);
  if (stage.value === "Closed") lines.push("Closing does not mean the work was implemented.");
  if (phases.state === "current") {
    for (const phase of phases.items) lines.push(`Current phase: ${phase} (${phases.source})`);
  } else if (phases.state === "unavailable") lines.push(`Current phases: unavailable. ${phases.reason}`);
  else if (phases.state === "not-exposed") lines.push(`Current phases: not exposed. ${phases.reason}`);
  const label = (value) => value[0].toUpperCase() + value.slice(1).replaceAll("-", " ");
  if (design?.status === "unavailable") {
    lines.push(`Design status and required gates: unavailable. ${design.reason}`);
  } else if (design) lines.push(`Design status: ${label(design.status)} (${design.source})`);
  for (const checkpoint of checkpoints) lines.push(`Checkpoint: ${label(checkpoint.kind)} (${checkpoint.source})`);
  for (const gate of gates) lines.push(`Required gate: ${label(gate.kind)} (${gate.source})`);
  lines.push(`Requests for you: unavailable. ${requests.reason}`);
  if (stage.value === "Captured") lines.push("No definition, phase, or gate is recorded yet.");
  else if (unknown.length) {
    const names = { phases: "current phase", design: "design status", gates: "required gate" };
    const parts = unknown.map((part) => names[part]);
    const joined = parts.length === 1 ? parts[0]
      : parts.length === 2 ? parts.join(" or ")
        : `${parts.slice(0, -1).join(", ")}, or ${parts.at(-1)}`;
    lines.push(`No ${joined} is recorded.`);
  }
  return `${lines.join("\n")}\n`;
}

/** Select by frontmatter only, then reread only that item's report evidence. */
function readProgress(root, slug, tracked) {
  if (!CANONICAL_SLUG_RE.test(slug)) return null;
  const model = collectLifecycleModel({ root });
  const matches = model.items.filter((item) => item.frontmatterAvailable && item.slug === slug);
  if (matches.length !== 1) return null;
  const item = matches[0];
  const ideaBytes = readSafeFile(root, item.ideaPath);
  if (ideaBytes === null) return null;
  const { scalars } = parseFrontmatterScalars(ideaBytes, { canonicalKeys: CANONICAL_IDEA_KEYS });
  if (scalars.get("slug")?.value !== slug) return null;
  const specBytes = item.ownerSpecPath ? readSafeFile(root, item.ownerSpecPath) : null;
  const tasksBytes = item.ownerSpecPath
    ? readSafeFile(root, `${item.ownerSpecPath.slice(0, -"spec.md".length)}tasks.md`)
    : null;
  return workProgress({ item, ideaBytes, specBytes, tasksBytes, tracked });
}

const HELP = `backlog — deterministic lifecycle orientation\n\nUsage:\n  node backlog.mjs [--tracked] [--root <dir>]\n  node backlog.mjs kanban [--root <dir>]\n  node backlog.mjs flowchart <idea-slug> [--root <dir>]\n  node backlog.mjs progress <idea-slug> [--tracked] [--root <dir>]\n  node backlog.mjs ship-plan <idea-slug | .dude/ideas/<NNN>-<slug>.md> [--root <dir>]\n\nThe default form prints Current, Planned, and Completed lifecycle groups with\neach record's stage, then dependency and order notes. kanban prints current work\nonly. flowchart prints one defined package task graph. progress prints one item's\nreport. ship-plan prints a target's declared prerequisite plan as JSON.\n--tracked leaves defined stages unavailable and phases not exposed because\nthis view does not read tracked work. Every form is read-only.\n`;

export function parseArgs(argv) {
  const output = { root: process.cwd(), command: undefined, slug: undefined, tracked: false, help: false, invalid: null };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") output.help = true;
    else if (token === "--tracked") output.tracked = true;
    else if (token === "--root") {
      const root = argv[index + 1];
      if (!root || root.startsWith("--")) output.invalid = "--root requires a directory";
      else {
        output.root = root;
        index += 1;
      }
    } else if (token.startsWith("--") || (positionals[0] === "ship-plan" && token.startsWith("-"))) {
      output.invalid = `unknown option: ${token}`;
    } else positionals.push(token);
  }
  output.command = positionals[0];
  output.slug = positionals[1];
  if (positionals.length > 2) output.invalid = "too many positional arguments";
  if (output.tracked && output.command !== undefined && output.command !== "progress") {
    output.invalid = "unknown option: --tracked";
  }
  return output;
}

export function run(args) {
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.invalid || typeof args.root !== "string") {
    process.stderr.write(`[FAIL] ${args.invalid ?? "workspace root is required"}\n`);
    return 1;
  }
  try {
    if (args.command === undefined) {
      process.stdout.write(renderText(collectLifecycleModel({ root: args.root }), { tracked: args.tracked }));
      return 0;
    }
    if (args.command === "kanban") {
      const output = renderCurrentMermaid(collectLifecycleModel({ root: args.root }));
      process.stdout.write(output || "No current work to diagram.\n");
      return 0;
    }
    if (args.command === "flowchart") {
      if (!args.slug) {
        process.stderr.write("[FAIL] flowchart requires an idea slug\n");
        return 1;
      }
      const model = collectLifecycleModel({ root: args.root });
      const matches = model.items.filter((item) => item.slug === args.slug);
      if (matches.length !== 1 || !matches[0].defined || !matches[0].tasksAvailable) {
        process.stderr.write(`[FAIL] idea ${args.slug} has no single readable task package\n`);
        return 1;
      }
      process.stdout.write(renderFlowchart(matches[0].tasks, { slug: args.slug }));
      return 0;
    }
    if (args.command === "ship-plan") {
      if (!args.slug) {
        process.stderr.write("[FAIL] ship-plan requires a target\n");
        return 1;
      }
      const plan = planShipRun({ root: args.root, target: args.slug });
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return plan.runnable ? 0 : 1;
    }
    if (args.command === "progress") {
      if (!args.slug) {
        process.stderr.write("[FAIL] progress requires an idea slug\n");
        return 1;
      }
      let report = null;
      try {
        report = readProgress(args.root, args.slug, args.tracked);
      } catch {
        // An unreadable selector cannot fall back to a display identity.
      }
      if (!report) {
        process.stderr.write(`[FAIL] no single work item has slug ${args.slug}\n`);
        return 1;
      }
      process.stdout.write(renderProgress(report));
      return 0;
    }
    process.stderr.write(`[FAIL] unknown command: ${args.command}\n`);
    return 1;
  } catch (error) {
    process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMainModule()) process.exit(run(parseArgs(process.argv.slice(2))));
