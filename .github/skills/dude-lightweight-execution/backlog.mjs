#!/usr/bin/env node
// @ts-check
/** Deterministic lifecycle backlog collector, model, and renderers. */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { inventoryLifecycleIdentities } from "../dude-engine/lib/feature.mjs";
import { parseFrontmatterScalars, parseIdeaIdentity, parseSpecIdentity } from "../dude-engine/lib/feature-identity.mjs";
import { parseTasks } from "../dude-engine/lib/tasks.mjs";
import { WORKSPACE_PATHS, resolveWorkspacePath, resolveMutationPath } from "../dude-engine/lib/workspace-paths.mjs";

const IDEA_KEYS = Object.freeze(["title", "slug", "status", "spec_path", "depends-on"]);
const BACKLOG_ORDER_PATH = `${WORKSPACE_PATHS.STATE_DIR}/backlog-order.md`;
const BACKLOG_MD_PATH = ".dude/backlog.md";
const BACKLOG_HTML_PATH = ".dude/backlog.html";
const CANONICAL_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const CURRENT_GROUPS = Object.freeze([
  { key: "blocked", title: "Blocked" },
  { key: "active", title: "Active" },
  { key: "next", title: "Next" },
]);
const PLANNED_GROUPS = Object.freeze([
  { key: "awaitingDefinition", title: "Ideas awaiting definition" },
  { key: "definedAwaitingWork", title: "Defined awaiting work" },
  { key: "prioritizedLater", title: "Prioritized for later" },
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

/** @param {unknown} value */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\x27/g, "&#39;");
}

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

/** Make a deterministic plain-text excerpt from the user-controlled Idea section. */
function ideaExcerpt(ideaBody) {
  const selected = [];
  for (const rawLine of visibleProseLines(ideaBody)) {
    const line = rawLine.replace(/^\s*(?:>\s*)+/, "");
    if (/^###\s+/.test(line) && selected.some((entry) => entry.trim() !== "")) break;
    if (/^#{1,6}\s+/.test(line)) continue;
    selected.push(line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, ""));
  }
  let text = selected.join(" ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const limit = 360;
  if ([...text].length <= limit) return text;
  text = [...text].slice(0, limit + 1).join("");
  const boundary = text.lastIndexOf(" ");
  return `${(boundary > 240 ? text.slice(0, boundary) : text.slice(0, limit)).trimEnd()}…`;
}

function conciseEvidence(value, limit = 420) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if ([...text].length <= limit) return text;
  const prefix = [...text].slice(0, limit + 1).join("");
  const boundary = prefix.lastIndexOf(" ");
  return `${(boundary > Math.floor(limit * .65) ? prefix.slice(0, boundary) : prefix.slice(0, limit)).trimEnd()}…`;
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
      relationships.push({ targetSlug: match[1], evidence: line.trim() });
    }
  }
  return relationships;
}

function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

/** Parse Coordinator Log bullets and their optional leading calendar date. */
export function parseCoordinatorLog(content) {
  const section = extractSection(content, 2, "Coordinator Log");
  const entries = [];
  let appendIndex = 0;
  for (const line of section.split(/\r\n|\n|\r/)) {
    const match = /^-\s+(.+?\S)\s*$/.exec(line);
    if (!match) continue;
    const text = match[1];
    const dateMatch = /^(\d{4}-\d{2}-\d{2})(?=\s|T|$)/.exec(text);
    const date = dateMatch && isCalendarDate(dateMatch[1]) ? dateMatch[1] : null;
    entries.push({ text, date, appendIndex });
    appendIndex += 1;
  }
  return entries;
}

function milestoneLabel(text) {
  if (/\bbrainstorm\s+(?:captured|created)\b/i.test(text)) return "Captured";
  if (/\b(?:first definition|defined as feature)\b|\bdefined\b\s*(?:-|=)?>/i.test(text)) return "Defined";
  if (/\bfeature(?:\s+\S+){0,3}\s+complete\b|\bfeature complete\b|\ball\s+\d+\s+tasks?\s+\[x\]/i.test(text)) return "Completed";
  return null;
}

function selectMilestones(entries) {
  const candidates = entries
    .map((entry) => ({ ...entry, label: milestoneLabel(entry.text) }))
    .filter((entry) => entry.label !== null);
  const selected = [];
  const captured = candidates.find((entry) => entry.label === "Captured");
  const defined = candidates.find((entry) => entry.label === "Defined");
  const completed = candidates.filter((entry) => entry.label === "Completed").at(-1);
  if (captured) selected.push(captured);
  if (defined) selected.push(defined);
  if (completed) selected.push(completed);
  return selected.sort((left, right) => left.appendIndex - right.appendIndex);
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
    glyph: task.glyph,
    state: task.state,
    description: task.description,
    deps: [...task.deps],
    blockedBy: task.blockedBy,
  };
}

function phaseDetails(tasksContent, tasks) {
  const { headings } = visibleHeadings(tasksContent);
  const definitions = headings
    .filter((heading) => heading.level === 2 && /^Phase\b/i.test(heading.title))
    .map((heading) => ({ title: heading.title, line: heading.line, tasks: [] }));
  const unphasedTasks = [];
  for (const task of tasks) {
    let owning = null;
    for (const phase of definitions) {
      if (phase.line < task.headerLine) owning = phase;
      else break;
    }
    const detail = taskDetail(task);
    if (owning) owning.tasks.push(detail);
    else unphasedTasks.push(detail);
  }
  return {
    phases: definitions.map(({ title, tasks: phaseTasks }) => ({ title, tasks: phaseTasks })),
    unphasedTasks,
  };
}

function userStoryHeadings(specContent) {
  return visibleHeadings(specContent).headings
    .filter((heading) => heading.level === 3 && /^User Story\b/i.test(heading.title))
    .map((heading) => heading.title);
}

function anchorFor(item, duplicated) {
  if (!duplicated && CANONICAL_SLUG_RE.test(item.slug)) return `feature-${item.slug}`;
  return `feature-path-${Buffer.from(item.ideaPath, "utf8").toString("hex")}`;
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
    let title = file.identitySlug;
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
      const frontmatter = parseFrontmatterScalars(content, { canonicalKeys: IDEA_KEYS });
      title = frontmatter.scalars.get("title")?.value || file.identitySlug;
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
    const tasksPath = specPath
      ? `${specPath.slice(0, -"spec.md".length)}tasks.md`
      : null;
    const displaySpecPath = ownerSpecPath ?? declaredSpecPath;
    const displayTasksPath = displaySpecPath
      ? `${displaySpecPath.slice(0, -"spec.md".length)}tasks.md`
      : null;
    const specContent = displaySpecPath ? readSafeFile(root, displaySpecPath) : null;
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
    const coordinatorLog = parseCoordinatorLog(content);
    const phaseModel = tasksAvailable && tasksContent !== null
      ? phaseDetails(tasksContent, parsedTasks)
      : { phases: [], unphasedTasks: [] };
    const packageComplete = !resolvedCandidate && Boolean(
      ownerSpecPath && tasksAvailable && parsedTasks.length > 0 && parsedTasks.every((task) => task.state === "done"),
    );
    const ownBlocked = Boolean(ownerSpecPath) && tasksAvailable && parsedTasks.some((task) => (
      task.state === "blocked" || (task.blockedBy !== null && task.state !== "done")
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
      title,
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
      declaredDefined,
      defined,
      declaredSpecPath,
      specPath,
      tasksPath,
      excerpt: ideaExcerpt(body),
      dependsOn,
      provisionalRelationships: parseProvisionalRelationships(body),
      coordinatorLog,
      milestones: selectMilestones(coordinatorLog),
      userStories: specContent === null ? [] : userStoryHeadings(specContent),
      tasks: parsedTasks.map(taskDetail),
      phases: phaseModel.phases,
      unphasedTasks: phaseModel.unphasedTasks,
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
  const numberCounts = new Map();
  for (const item of items) slugCounts.set(item.slug, (slugCounts.get(item.slug) ?? 0) + 1);
  for (const item of items) {
    if (item.number) numberCounts.set(item.number, (numberCounts.get(item.number) ?? 0) + 1);
  }
  for (const item of items) {
    const duplicateSlug = (slugCounts.get(item.slug) ?? 0) > 1;
    const duplicateNumber = item.number !== null && (numberCounts.get(item.number) ?? 0) > 1;
    if (duplicateSlug || duplicateNumber) item.authoritySlug = null;
    item.anchor = anchorFor(item, duplicateSlug);
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
  const tasksPath = resolvedCandidate ? null : item.tasksPath ?? null;
  return {
    identity,
    ideaPath: item.ideaPath ?? identity,
    number,
    numberValue,
    slug,
    authoritySlug: item.authoritySlug === undefined ? (CANONICAL_SLUG_RE.test(slug) ? slug : null) : item.authoritySlug,
    title: item.title ?? slug,
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
    declaredDefined: resolvedCandidate ? false : item.declaredDefined ?? Boolean(item.defined),
    defined,
    declaredSpecPath: resolvedCandidate ? null : item.declaredSpecPath ?? specPath,
    specPath,
    tasksPath,
    excerpt: item.excerpt ?? "",
    dependsOn: Array.isArray(item.dependsOn) ? [...item.dependsOn] : [],
    provisionalRelationships: Array.isArray(item.provisionalRelationships) ? [...item.provisionalRelationships] : [],
    coordinatorLog: Array.isArray(item.coordinatorLog) ? [...item.coordinatorLog] : [],
    milestones: Array.isArray(item.milestones) ? [...item.milestones] : [],
    userStories: Array.isArray(item.userStories) ? [...item.userStories] : [],
    tasks: Array.isArray(item.tasks) ? [...item.tasks] : [],
    phases: Array.isArray(item.phases) ? [...item.phases] : [],
    unphasedTasks: Array.isArray(item.unphasedTasks) ? [...item.unphasedTasks] : [],
    taskCounts: { ...counts },
    tasksAvailable: resolvedCandidate ? false : Boolean(item.tasksAvailable),
    packageComplete: resolvedCandidate ? false : Boolean(item.packageComplete),
    hasInProgress: Boolean(item.hasInProgress),
    ownBlocked: Boolean(item.ownBlocked),
    unavailableDetail: item.unavailableDetail ?? null,
    anchor: item.anchor ?? anchorFor({ slug, ideaPath: identity }, false),
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

/** An item without a valid canonical slug carries no dependency authority in either direction. */
function authoritativeDependsOn(item) {
  return item.authoritySlug ? item.dependsOn : [];
}

function groupActivity(items) {
  const dated = [];
  for (const item of items) {
    for (const entry of item.coordinatorLog) {
      if (!entry.date) continue;
      dated.push({ ...entry, ideaPath: item.ideaPath, slug: item.slug, anchor: item.anchor });
    }
  }
  dated.sort((left, right) => (
    compareIdentity(right.date, left.date)
    || compareIdentity(left.ideaPath, right.ideaPath)
    || left.appendIndex - right.appendIndex
  ));
  const groups = [];
  for (const event of dated) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== event.date) {
      group = { date: event.date, events: [] };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

function buildRelationships(items, validOrder, orderIndex) {
  const unique = uniqueItemsBySlug(items);
  const declared = [];
  const provisional = [];
  for (const item of items) {
    if (item.authoritySlug === null) continue;
    for (const targetSlug of item.dependsOn) {
      declared.push({
        authority: "declared",
        type: "dependency",
        from: unique.get(targetSlug) ?? null,
        fromSlug: targetSlug,
        to: item,
        toSlug: item.slug,
      });
    }
    for (const relation of item.provisionalRelationships) {
      provisional.push({
        authority: "provisional",
        type: "body-stated dependency",
        from: unique.get(relation.targetSlug) ?? null,
        fromSlug: relation.targetSlug,
        to: item,
        toSlug: item.slug,
        evidence: relation.evidence,
      });
    }
  }
  for (let index = 1; index < validOrder.length; index += 1) {
    const from = unique.get(validOrder[index - 1]);
    const to = unique.get(validOrder[index]);
    if (!from || !to) continue;
    declared.push({
      authority: "declared",
      type: "explicit order",
      from,
      fromSlug: from.slug,
      to,
      toSlug: to.slug,
    });
  }
  const involved = new Set();
  for (const relation of [...declared, ...provisional]) {
    if (relation.from) involved.add(relation.from.identity);
    involved.add(relation.to.identity);
  }
  const unavailable = items.filter((item) => !item.dependencyAvailable);
  const missing = items.filter((item) => (
    item.dependencyAvailable
    && item.section !== "completed"
    && !involved.has(item.identity)
    && authoritativeDependsOn(item).length === 0
    && !orderIndex.has(item.authoritySlug)
    && item.provisionalRelationships.length === 0
  ));
  return {
    declared,
    provisional,
    missing,
    unavailable,
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

  const assign = (rows, section, group) => {
    for (const item of rows) {
      item.section = section;
      item.group = group;
      item.orderPosition = orderIndex.has(item.authoritySlug) ? orderIndex.get(item.authoritySlug) + 1 : null;
    }
  };
  assign(blocked, "current", "blocked");
  assign(active, "current", "active");
  assign(next, "current", "next");
  assign(awaitingDefinition, "planned", "awaiting-definition");
  assign(definedAwaitingWork, "planned", "defined-awaiting-work");
  assign(prioritizedLater, "planned", "prioritized-later");
  assign(completed, "completed", "completed");

  const model = {
    summary: {
      currentWork: blocked.length + active.length,
      readyNext: next.length,
      ideasAwaitingDefinition: awaitingDefinition.length + prioritizedLater.filter((item) => !item.defined).length,
      definedAwaitingWork: definedAwaitingWork.length + prioritizedLater.filter((item) => item.defined).length,
      completed: completed.length,
      active: active.length,
      blocked: blocked.length,
    },
    current: { blocked, active, next },
    planned: { awaitingDefinition, definedAwaitingWork, prioritizedLater },
    completed,
    items,
    order: validOrder,
    activityByDate: groupActivity(items),
    relationships: null,
  };
  model.relationships = buildRelationships(items, validOrder, orderIndex);
  return model;
}

/** Collect and derive the lifecycle model from one workspace root. */
export function collectLifecycleModel({ root }) {
  return deriveLifecycleModel({ items: collectLifecycleItems({ root }), order: readOrder(root) });
}

function featureKind(item) {
  if (!item.number) return "IDEA";
  return item.defined ? `F-${item.number}` : `I-${item.number}`;
}

function lifecycleRibbon(item) {
  const unknown = !item.lifecycleAvailable;
  const stages = [
    { key: "idea", label: "Idea", state: "reached" },
    { key: "defined", label: "Defined", state: item.resolved ? "not-applicable" : unknown ? "unknown" : item.defined ? "reached" : "pending" },
    { key: "tasks", label: "Tasks", state: item.resolved ? "not-applicable" : unknown || (item.defined && !item.tasksAvailable) ? "unknown" : item.taskCounts.total > 0 ? "reached" : "pending" },
    { key: "done", label: "Done", state: item.resolved ? "reached" : unknown || (item.defined && !item.tasksAvailable) ? "unknown" : item.section === "completed" ? "reached" : "pending" },
  ];
  const description = stages.map((stage) => `${stage.label} ${stage.state === "unknown" ? "unavailable" : stage.state === "not-applicable" ? "not applicable" : stage.state}`).join(", ");
  return `<span class="ribbon" role="img" aria-label="Lifecycle: ${esc(description)}">${stages.map((stage) => (
    `<span class="stage stage-${stage.key} ${stage.state}">${stage.label}</span>`
  )).join("")}</span>`;
}

function countsMarkup(item) {
  if (item.resolved) return "";
  if (!item.lifecycleAvailable || (item.defined && !item.tasksAvailable)) return `<span class="counts unavailable">Task state unavailable</span>`;
  if (item.taskCounts.total === 0) return `<span class="counts none">No task package</span>`;
  const counts = item.taskCounts;
  return `<span class="counts" role="group" aria-label="Task states">`
    + `<span><strong>${counts.open}</strong> open</span>`
    + `<span><strong>${counts.active}</strong> active</span>`
    + `<span><strong>${counts.blocked}</strong> blocked</span>`
    + `<span><strong>${counts.done}</strong> done</span></span>`;
}

function dependencySignal(item) {
  if (!item.dependencyAvailable) return `<span class="dep-signal unavailable"><span aria-hidden="true">?</span> Dependency data unavailable</span>`;
  if (authoritativeDependsOn(item).length > 0 || item.orderPosition !== null) {
    return `<span class="dep-signal declared"><span aria-hidden="true">━</span> Declared signal</span>`;
  }
  if (item.provisionalRelationships.length > 0) {
    return `<span class="dep-signal provisional"><span aria-hidden="true">┄</span> Provisional signal</span>`;
  }
  return `<span class="dep-signal none"><span aria-hidden="true">—</span> No dependency signal</span>`;
}

function renderMilestones(item) {
  if (item.milestones.length === 0) return `<p class="quiet">No Coordinator Log milestones are recorded.</p>`;
  return `<ol class="milestones">${item.milestones.map((milestone) => (
    `<li><span class="milestone-label">${esc(milestone.label)}</span><span>${esc(conciseEvidence(milestone.text))}</span></li>`
  )).join("")}</ol>`;
}

function internalTargetLink(model, slug) {
  const matches = model.items.filter((item) => item.authoritySlug === slug);
  if (matches.length !== 1) return `<code>${esc(slug)}</code>`;
  return `<a href="#${esc(matches[0].anchor)}"><code>${esc(slug)}</code></a>`;
}

function renderDependencyFacts(model, item) {
  const rows = [];
  if (!item.dependencyAvailable) rows.push(`<li><strong>Declared dependencies:</strong> unavailable because idea metadata could not be read reliably.</li>`);
  else if (item.authoritySlug === null && item.dependsOn.length > 0) rows.push(`<li><strong>Declared dependencies:</strong> dependency metadata is present but ignored because the idea slug is malformed.</li>`);
  else if (authoritativeDependsOn(item).length === 0) rows.push(`<li><strong>Declared dependencies:</strong> none in idea frontmatter.</li>`);
  else for (const slug of authoritativeDependsOn(item)) rows.push(
    `<li><strong>Declared dependency:</strong> ${internalTargetLink(model, slug)} (authoritative).</li>`,
  );
  for (const relation of item.provisionalRelationships) rows.push(
    `<li><strong>Provisional, non-authoritative:</strong> ${internalTargetLink(model, relation.targetSlug)} — ${esc(relation.evidence)}</li>`,
  );
  if (item.orderPosition !== null) rows.push(
    `<li><strong>Explicit order:</strong> position ${item.orderPosition} in <code>${BACKLOG_ORDER_PATH}</code>.</li>`,
  );
  else if (!model.relationships.hasExplicitOrder) rows.push(`<li><strong>Explicit order:</strong> no explicit feature order declared.</li>`);
  else rows.push(`<li><strong>Explicit order:</strong> this item has no listed position.</li>`);
  return `<ul class="facts">${rows.join("")}</ul>`;
}

function taskStateLabel(task) {
  if (task.state === "done") return "Done";
  if (task.state === "in-progress") return "Active";
  if (task.state === "blocked") return "Blocked";
  return "Open";
}

function renderTask(task) {
  const dependencies = task.deps.length > 0
    ? `<div class="task-meta"><span>deps:</span> ${task.deps.map((dep) => `<code>${esc(dep)}</code>`).join(", ")}</div>`
    : "";
  const blocker = task.blockedBy
    ? `<div class="task-meta blocked-by"><span>blocked-by:</span> ${esc(task.blockedBy)}</div>`
    : "";
  return `<li class="task task-${esc(task.state)}"><div class="task-main">`
    + `<span class="task-status"><span aria-hidden="true">[${esc(task.glyph)}]</span> ${taskStateLabel(task)}</span>`
    + `<code>${esc(task.id)}</code><span>${esc(task.description)}</span></div>${dependencies}${blocker}</li>`;
}

function renderTasks(item) {
  if (item.resolved) return `<p class="quiet">Outcome resolved without a package; tasks are not applicable.</p>`;
  if (!item.lifecycleAvailable) return `<p class="awaiting">Task state is unavailable because lifecycle metadata is ambiguous.</p>`;
  if (!item.defined) return `<p class="awaiting">Awaiting definition - no tasks exist yet.</p>`;
  if (!item.tasksAvailable) return `<p class="awaiting">${esc(item.unavailableDetail ?? "Task details are unavailable.")}</p>`;
  if (item.taskCounts.total === 0) return `<p class="quiet">No tasks are recorded${item.tasksPath ? ` in <code>${esc(item.tasksPath)}</code>` : ""}.</p>`;
  const sections = [];
  if (item.unphasedTasks.length > 0) sections.push(`<ol class="task-list unphased">${item.unphasedTasks.map(renderTask).join("")}</ol>`);
  for (const phase of item.phases) {
    const body = phase.tasks.length > 0
      ? `<ol class="task-list">${phase.tasks.map(renderTask).join("")}</ol>`
      : `<p class="quiet phase-empty">No tasks are recorded in this phase.</p>`;
    sections.push(`<section class="phase"><h4>${esc(phase.title)}</h4>${body}</section>`);
  }
  return sections.join("");
}

function renderFeatureDefinition(item) {
  if (item.resolved) return `<p class="quiet">Outcome resolved without a package; definition is not applicable.</p>`;
  if (!item.lifecycleAvailable) return `<p class="awaiting">Definition status is unavailable because idea metadata is ambiguous.</p>`;
  if (!item.defined) return `<p class="awaiting">Awaiting definition - no tasks exist yet.</p>`;
  const stories = item.userStories.length > 0
    ? `<ul class="story-list">${item.userStories.map((story) => `<li>${esc(story)}</li>`).join("")}</ul>`
    : `<p class="quiet">No user-story headings are present in the linked feature specification.</p>`;
  if (!item.specPath) {
    const declaredSource = item.declaredSpecPath && item.userStories.length > 0
      ? `<p class="source-path"><span>Declared spec (display only)</span> <code>${esc(item.declaredSpecPath)}</code></p>${stories}`
      : "";
    return `<p class="awaiting">${esc(item.unavailableDetail ?? "The linked feature definition is unavailable or ambiguous.")}</p>${declaredSource}`;
  }
  return `<p class="source-path"><span>Spec</span> <code>${esc(item.specPath)}</code></p>${stories}`;
}

function renderFeatureDetail(model, item) {
  const compact = item.section === "completed" ? " compact" : "";
  const open = item.slug === "backlog-canvas" ? " open" : "";
  const excerpt = item.excerpt
    ? `<p>${esc(item.excerpt)}</p>`
    : `<p class="quiet">No readable excerpt is available from the <code>## Idea</code> section.</p>`;
  const taskPath = item.tasksPath ? `<code>${esc(item.tasksPath)}</code>` : "";
  const warnings = [...item.authorityIssues, ...item.taskWarnings];
  const warningMarkup = warnings.length > 0 ? `<aside class="data-warning" aria-label="Unavailable or ambiguous source data"><strong>Some source data is unavailable or ambiguous.</strong><ul>${warnings.map((warning) => `<li>${esc(warning)}</li>`).join("")}</ul></aside>` : "";
  const kind = featureKind(item);
  const visibleIdentity = kind === "IDEA" || kind.startsWith("I-") ? `${kind} · ${item.slug}` : kind;
  return `<details class="feature-detail${compact}" id="${esc(item.anchor)}" data-feature-entry="${esc(item.slug)}" data-idea-path="${esc(item.ideaPath)}" data-section="${esc(item.section)}" data-group="${esc(item.group)}"${open}>`
    + `<summary><span class="summary-grid"><span class="identity">${esc(visibleIdentity)}</span>`
    + `<span class="feature-title">${esc(item.title)}</span>${lifecycleRibbon(item)}${countsMarkup(item)}${dependencySignal(item)}</span></summary>`
    + `<div class="feature-body">${warningMarkup}<div class="detail-grid">`
    + `<section><h3>Original idea</h3>${excerpt}<p class="source-path"><span>Source</span> <code>${esc(item.ideaPath)}</code></p></section>`
    + `<section><h3>Coordinator milestones</h3>${renderMilestones(item)}</section>`
    + `<section><h3>Dependencies and order</h3>${renderDependencyFacts(model, item)}</section>`
    + `<section><h3>Feature definition</h3>${renderFeatureDefinition(item)}</section></div>`
    + `<section class="tasks-section"><div class="section-heading"><h3>Phases and tasks</h3>${taskPath}</div>${renderTasks(item)}</section>`
    + `</div></details>`;
}

function renderSummary(model) {
  const summary = model.summary;
  return `<div class="metric-strip" role="group" aria-label="Where are we summary">`
    + `<div class="metric current"><strong>${summary.currentWork}</strong><span>Current work</span><small>${summary.active} active · ${summary.blocked} blocked</small></div>`
    + `<div class="metric next"><strong>${summary.readyNext}</strong><span>Ready / Next</span><small>ready from declared dependency or order</small></div>`
    + `<div class="metric ideas"><strong>${summary.ideasAwaitingDefinition}</strong><span>Ideas awaiting definition</span><small>no task package yet</small></div>`
    + `<div class="metric defined"><strong>${summary.definedAwaitingWork}</strong><span>Defined awaiting work</span><small>not active or ordered next</small></div>`
    + `<div class="metric completed"><strong>${summary.completed}</strong><span>Completed features</span><small>compact library below</small></div></div>`
    + `<p class="at-glance"><strong>Current:</strong> ${summary.currentWork}. <strong>Ready:</strong> ${summary.readyNext}. <strong>Planned:</strong> ${summary.ideasAwaitingDefinition} awaiting definition and ${summary.definedAwaitingWork} defined awaiting work. <strong>Completed:</strong> ${summary.completed}.</p>`;
}

function mapNode(item, fallbackSlug) {
  if (!item) return `<span class="map-node unresolved"><span class="map-id">Unresolved</span><strong>${esc(fallbackSlug)}</strong></span>`;
  return `<a class="map-node" href="#${esc(item.anchor)}"><span class="map-id">${esc(featureKind(item))}</span><strong>${esc(item.title)}</strong><small>${esc(item.slug)}</small></a>`;
}

function renderRelation(relation) {
  const provisional = relation.authority === "provisional";
  const order = relation.type === "explicit order";
  const label = provisional
    ? "stated in idea, not authoritative"
    : order ? "explicit order" : "declared dependency";
  const direction = order
    ? `${relation.fromSlug} is listed earlier than ${relation.toSlug}; no dependency is implied`
    : `${relation.fromSlug} prerequisite to ${relation.toSlug} dependent`;
  const ends = order ? ["earlier", "later"] : ["prerequisite", "dependent"];
  return `<div class="map-edge" role="listitem" data-authority="${relation.authority}" aria-label="${esc(direction)}: ${label}">`
    + `${mapNode(relation.from, relation.fromSlug)}<span class="map-connector ${provisional ? "dashed" : "solid"}"><span class="map-label">${esc(label)} · ${ends[0]} <span aria-hidden="true">→</span> ${ends[1]}</span></span>${mapNode(relation.to, relation.toSlug)}</div>`;
}

function renderDeliveryMap(model) {
  const { declared, provisional, missing, unavailable, hasExplicitOrder } = model.relationships;
  const relationships = [...declared, ...provisional];
  const rows = relationships.length > 0
    ? `<div class="map-edges" role="list">${relationships.map(renderRelation).join("")}</div>`
    : unavailable.length > 0
      ? `<p class="empty-state"><strong>Relationship lines require readable source data.</strong></p>`
      : `<p class="empty-state"><strong>No dependency relationships are declared or provisionally evidenced.</strong></p>`;
  const isolated = missing.length > 0
    ? `<div class="map-isolated"><strong>No dependency signal:</strong> ${missing.map((item) => `<a href="#${esc(item.anchor)}">${esc(item.slug)}</a>`).join(" · ")}</div>`
    : "";
  const unavailableRows = unavailable.length > 0
    ? `<div class="map-isolated data-unavailable"><strong>Dependency data unavailable:</strong> ${unavailable.map((item) => `<a href="#${esc(item.anchor)}">${esc(item.slug)}</a>`).join(" · ")}</div>`
    : "";
  return `<section class="delivery-map" aria-labelledby="delivery-title" aria-describedby="delivery-desc">`
    + `<div class="section-heading"><h2 id="delivery-title">Delivery map</h2><p id="delivery-desc">Only declared order and dependency evidence, plus separately marked provisional idea statements. Layout position never creates authority.</p></div>`
    + `<div class="order-banner${hasExplicitOrder ? " order-present" : ""}">${hasExplicitOrder ? "Explicit feature order is declared in the backlog order input." : "No explicit feature order declared"}</div>`
    + `${rows}${isolated}${unavailableRows}<div class="map-legend" role="group" aria-label="Delivery map legend"><span><i class="legend-line solid" aria-hidden="true"></i> solid = declared</span><span><i class="legend-line dashed" aria-hidden="true"></i> dashed = stated in idea, not authoritative</span><span><i class="legend-none" aria-hidden="true">—</i> no line = no order signal</span></div></section>`;
}

function renderCurrent(model) {
  const subsections = [];
  for (const group of CURRENT_GROUPS) {
    const rows = model.current[group.key];
    if (rows.length === 0) continue;
    subsections.push(`<section class="work-subsection current-${group.key}"><div class="subsection-heading"><h3>${group.title}</h3><span>${rows.length}</span></div>${rows.map((item) => renderFeatureDetail(model, item)).join("")}</section>`);
  }
  const body = subsections.length > 0
    ? subsections.join("")
    : `<p class="empty-state"><strong>No current execution.</strong> There are no blocked, active, or ready items.</p>`;
  return `<section class="work-section current-work" aria-labelledby="current-title"><div class="section-heading"><h2 id="current-title">Current work</h2><p>Blocked first, then active work, then ready work. Empty subsections stay out of the way.</p></div>${body}</section>`;
}

function renderPlanned(model) {
  const subsections = [];
  for (const group of PLANNED_GROUPS) {
    const rows = model.planned[group.key];
    if (rows.length === 0) continue;
    subsections.push(`<section class="work-subsection planned-${group.key}"><div class="subsection-heading"><h3>${group.title}</h3><span>${rows.length}</span></div>${rows.map((item) => renderFeatureDetail(model, item)).join("")}</section>`);
  }
  const body = subsections.length > 0 ? subsections.join("") : `<p class="empty-state"><strong>No planned work.</strong></p>`;
  return `<section class="work-section planned-work" aria-labelledby="planned-title"><div class="section-heading"><h2 id="planned-title">Planned work</h2><p>Undefined and defined-but-unstarted work remains compact until authoritative state moves it into Current.</p></div>${body}</section>`;
}

function renderCompleted(model) {
  const body = model.completed.length > 0
    ? model.completed.map((item) => renderFeatureDetail(model, item)).join("")
    : `<p class="quiet">No completed features are recorded.</p>`;
  const printIndex = model.completed.length > 0
    ? `<ol class="print-completed-index" aria-label="Completed feature print index">${model.completed.map((item) => `<li><span class="identity">${esc(featureKind(item))}</span> ${esc(item.title)}</li>`).join("")}</ol>`
    : `<p class="print-completed-index quiet">No completed features are recorded.</p>`;
  return `<section class="work-section completed-work" aria-labelledby="completed-title"><div class="section-heading"><h2 id="completed-title">Completed library</h2><p>One collapsed library keeps completed history available without making it a peer lane.</p></div>`
    + `<details class="completed-library"><summary>${model.completed.length} completed feature${model.completed.length === 1 ? "" : "s"} — open compact library</summary><div class="details-body">${body}</div></details>${printIndex}</section>`;
}

function renderActivity(model) {
  const total = model.activityByDate.reduce((count, group) => count + group.events.length, 0);
  const groups = model.activityByDate.length > 0
    ? model.activityByDate.map((group) => `<section class="activity-day"><h3><time datetime="${group.date}">${group.date}</time></h3><ol>${group.events.map((event) => `<li><a href="#${esc(event.anchor)}"><code>${esc(event.slug)}</code></a><span>${esc(conciseEvidence(event.text, 240))}</span></li>`).join("")}</ol></section>`).join("")
    : `<p class="empty-state"><strong>No dated Coordinator Log entries are available.</strong></p>`;
  return `<section class="work-section coordinator-activity" aria-labelledby="activity-title"><div class="section-heading"><h2 id="activity-title">Coordinator activity</h2><p>Grouped by calendar date, newest first; same-date entries use stable idea identity and append order, not invented intra-day chronology.</p></div>`
    + `<p class="scope-note">Only dated entries from idea Coordinator Logs are shown. Git history, ad-hoc work outside Coordinator Logs, and other execution history sources are excluded.</p>`
    + `<details class="activity-library"><summary>${total} dated Coordinator Log entr${total === 1 ? "y" : "ies"} — open activity</summary><div class="activity-body">${groups}</div></details><p class="print-activity-summary">${total} dated Coordinator Log entr${total === 1 ? "y is" : "ies are"} available in the HTML report; the full activity list is omitted from print.</p></section>`;
}

/** Fill the committed HTML template from one lifecycle model. */
export function renderReport(template, model) {
  const slots = {
    SUMMARY: renderSummary(model),
    DELIVERY_MAP: renderDeliveryMap(model),
    CURRENT: renderCurrent(model),
    PLANNED: renderPlanned(model),
    COMPLETED: renderCompleted(model),
    ACTIVITY: renderActivity(model),
  };
  const rendered = String(template).replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) => (
    Object.hasOwn(slots, key) ? slots[key] : whole
  ));
  if (/\{\{[A-Z_]+\}\}/.test(rendered)) throw new Error("unfilled backlog template slot");
  return rendered;
}

function markdownInline(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/([\[\]()*_<>])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownItem(item) {
  const unavailable = item.authorityIssues.length > 0 || item.taskWarnings.some((warning) => warning.startsWith("duplicate task id ") || warning.startsWith("malformed task line "));
  const number = item.number ? `\`${item.number}\` · ` : "";
  return `- ${number}\`${String(item.slug).replace(/`/g, "")}\` — ${markdownInline(item.title)} (\`${String(item.ideaPath).replace(/`/g, "")}\`)${unavailable ? " — source data unavailable or ambiguous" : ""}`;
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

/** Render concise Markdown over the shared lifecycle model. */
export function renderMarkdown(model) {
  const s = model.summary;
  const lines = [
    "# Backlog",
    "",
    "A read-only view built from idea files, linked feature files, task records, and declared order.",
    "",
    "## Where are we?",
    "",
    `- Current work: **${s.currentWork}** (${s.active} active, ${s.blocked} blocked)`,
    `- Ready / Next: **${s.readyNext}**`,
    `- Ideas awaiting definition: **${s.ideasAwaitingDefinition}**`,
    `- Defined awaiting work: **${s.definedAwaitingWork}**`,
    `- Completed: **${s.completed}**`,
    "",
    "## Current",
    "",
    `Blocked ${model.current.blocked.length} · Active ${model.current.active.length} · Next ${model.current.next.length}`,
    "",
  ];
  for (const group of CURRENT_GROUPS) {
    const rows = model.current[group.key];
    if (rows.length === 0) continue;
    lines.push(`### ${group.title}`, "", ...rows.map(markdownItem), "");
  }
  const mermaid = renderCurrentMermaid(model);
  if (mermaid) lines.push("### Current work map", "", mermaid);
  else lines.push("No current work to diagram.", "");

  lines.push("## Planned", "");
  for (const group of PLANNED_GROUPS) {
    const rows = model.planned[group.key];
    if (rows.length === 0) continue;
    lines.push(`### ${group.title}`, "", ...rows.map(markdownItem), "");
  }
  if (PLANNED_GROUPS.every((group) => model.planned[group.key].length === 0)) lines.push("_(none)_", "");

  lines.push("## Completed", "");
  if (model.completed.length > 0) lines.push(...model.completed.map(markdownItem), "");
  else lines.push("_(none)_", "");

  lines.push("## Dependency and order notes", "");
  lines.push(model.relationships.hasExplicitOrder
    ? `- Explicit feature order is declared in \`${BACKLOG_ORDER_PATH}\`.`
    : "- No explicit feature order declared.");
  if (model.relationships.declared.filter((relation) => relation.type === "dependency").length === 0 && model.relationships.unavailable.length === 0) {
    lines.push("- No declared feature dependencies are present.");
  } else {
    for (const relation of model.relationships.declared.filter((entry) => entry.type === "dependency")) {
      lines.push(`- Declared: \`${relation.toSlug}\` depends on \`${relation.fromSlug}\`.`);
    }
  }
  for (const item of model.relationships.unavailable) lines.push(`- Dependency data is unavailable for \`${item.slug}\`; no negative dependency fact is inferred.`);
  if (model.relationships.provisional.length === 0) lines.push("- No provisional body-stated dependency evidence was recognized.");
  else for (const relation of model.relationships.provisional) lines.push(
    `- Provisional, non-authoritative: \`${relation.toSlug}\` states a relationship to \`${relation.fromSlug}\`. This does not affect lifecycle classification.`,
  );
  lines.push(
    "",
    "## Coordinator activity",
    "",
    "Coordinator activity is sourced only from dated idea Coordinator Log entries. Git history, ad-hoc work outside Coordinator Logs, and other execution history sources are excluded.",
    "",
  );
  return lines.join("\n");
}

/** Render a compact plain-text status view. */
export function renderText(model) {
  const s = model.summary;
  const lines = [
    `Where are we: current ${s.currentWork}; ready/next ${s.readyNext}; awaiting definition ${s.ideasAwaitingDefinition}; defined awaiting work ${s.definedAwaitingWork}; completed ${s.completed}`,
    "",
  ];
  const add = (title, rows) => {
    lines.push(`${title} (${rows.length}):`);
    if (rows.length === 0) lines.push("  (none)");
    else for (const item of rows) lines.push(`  ${item.number ? `${item.number} ` : ""}${item.slug}`);
    lines.push("");
  };
  add("Blocked", model.current.blocked);
  add("Active", model.current.active);
  add("Next", model.current.next);
  add("Ideas awaiting definition", model.planned.awaitingDefinition);
  add("Defined awaiting work", model.planned.definedAwaitingWork);
  if (model.planned.prioritizedLater.length > 0) add("Prioritized for later", model.planned.prioritizedLater);
  add("Completed", model.completed);
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

function readTemplate() {
  return fs.readFileSync(new URL("./backlog-template.html", import.meta.url), "utf8");
}

/** Render both fixed artifacts in memory through the shared model. */
export function renderArtifacts({ root }) {
  const model = collectLifecycleModel({ root });
  return {
    model,
    markdown: renderMarkdown(model),
    html: renderReport(readTemplate(), model),
  };
}

/** @param {unknown} error */
function isMissingPath(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

/** Capture exact existing bytes, or the prior absence of one fixed artifact. */
function captureBacklogPreimage(absolutePath) {
  try {
    return { missing: false, bytes: fs.readFileSync(absolutePath) };
  } catch (error) {
    if (isMissingPath(error)) return { missing: true, bytes: null };
    throw error;
  }
}

/** Restore one fixed artifact to its exact prior bytes or prior absence. */
function restoreBacklogPreimage(artifact) {
  if (artifact.preimage.missing) {
    try {
      fs.unlinkSync(artifact.absolutePath);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
    return;
  }
  fs.writeFileSync(artifact.absolutePath, artifact.preimage.bytes);
  const restored = fs.readFileSync(artifact.absolutePath);
  if (!restored.equals(artifact.preimage.bytes)) {
    throw new Error(`backlog artifact restore did not complete: ${artifact.relativePath}`);
  }
}

/**
 * Render and replace the two committed backlog artifacts as one recoverable pair.
 * @param {{root:string}} options
 */
export function refreshCommittedBacklog({ root }) {
  // Rendering completes before either target is resolved or written, so both
  // postimages necessarily come from the same authoritative poststate.
  const rendered = renderArtifacts({ root });
  const artifacts = [
    { relativePath: BACKLOG_MD_PATH, content: Buffer.from(rendered.markdown) },
    { relativePath: BACKLOG_HTML_PATH, content: Buffer.from(rendered.html) },
  ].map((artifact) => ({
    ...artifact,
    absolutePath: resolveMutationPath(root, artifact.relativePath),
  }));
  for (const artifact of artifacts) artifact.preimage = captureBacklogPreimage(artifact.absolutePath);

  try {
    for (const artifact of artifacts) {
      fs.writeFileSync(artifact.absolutePath, artifact.content);
      const actual = fs.readFileSync(artifact.absolutePath);
      if (!actual.equals(artifact.content)) {
        throw new Error(`backlog artifact write did not complete: ${artifact.relativePath}`);
      }
    }
  } catch (error) {
    let restoreError = null;
    for (const artifact of artifacts) {
      try {
        restoreBacklogPreimage(artifact);
      } catch (failure) {
        restoreError ??= failure;
      }
    }
    if (restoreError) throw restoreError;
    throw error;
  }
}

function readCommittedArtifact(root, relativePath) {
  try {
    const absolute = resolveWorkspacePath(root, relativePath);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) return { status: "missing", bytes: null };
    return { status: "present", bytes: fs.readFileSync(absolute) };
  } catch {
    return { status: "missing", bytes: null };
  }
}

function runCheck(root, { write }) {
  if (write) {
    process.stderr.write("[FAIL] check is read-only and rejects --write\n");
    return 1;
  }
  const rendered = renderArtifacts({ root });
  const expected = [
    { relativePath: BACKLOG_MD_PATH, content: rendered.markdown },
    { relativePath: BACKLOG_HTML_PATH, content: rendered.html },
  ];
  let failed = false;
  for (const artifact of expected) {
    const actual = readCommittedArtifact(root, artifact.relativePath);
    const bytes = Buffer.from(artifact.content);
    if (actual.status === "missing") {
      process.stderr.write(`[MISSING] ${artifact.relativePath}\n`);
      failed = true;
      continue;
    }
    if (!actual.bytes.equals(bytes)) {
      process.stderr.write(`[STALE] ${artifact.relativePath}: expected ${bytes.byteLength} bytes (${sha256(bytes)}), found ${actual.bytes.byteLength} bytes (${sha256(actual.bytes)})\n`);
      failed = true;
      continue;
    }
    process.stdout.write(`[OK] ${artifact.relativePath} is current\n`);
  }
  if (failed) process.stderr.write("Run backlog.mjs generate --root . --write to refresh both fixed artifacts.\n");
  return failed ? 3 : 0;
}

function runGenerate(root, { write }) {
  if (!write) {
    const rendered = renderArtifacts({ root });
    process.stdout.write(`==> ${BACKLOG_MD_PATH}\n${rendered.markdown}\n==> ${BACKLOG_HTML_PATH}\n${rendered.html}\n`);
    return 0;
  }
  refreshCommittedBacklog({ root });
  process.stdout.write(`[OK] wrote ${BACKLOG_MD_PATH} and ${BACKLOG_HTML_PATH}\n`);
  return 0;
}

const HELP = `backlog — deterministic lifecycle orientation\n\nUsage:\n  node backlog.mjs [--root <dir>]\n  node backlog.mjs kanban [--root <dir>]\n  node backlog.mjs flowchart <idea-slug> [--root <dir>]\n  node backlog.mjs check [--root <dir>]\n  node backlog.mjs generate [--root <dir>] [--write]\n\nThe default form prints Current, Planned, and Completed lifecycle groups. kanban\nprints current work only. flowchart prints one defined package task graph. check\nbyte-compares both committed artifacts and writes nothing. Only generate --write\nwrites, and it writes exactly .dude/backlog.md and .dude/backlog.html.\n`;

export function parseArgs(argv) {
  const output = { root: process.cwd(), command: undefined, slug: undefined, write: false, help: false, invalid: null };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") output.help = true;
    else if (token === "--write") output.write = true;
    else if (token === "--root") {
      const root = argv[index + 1];
      if (!root || root.startsWith("--")) output.invalid = "--root requires a directory";
      else {
        output.root = root;
        index += 1;
      }
    } else if (token.startsWith("--")) output.invalid = `unknown option: ${token}`;
    else positionals.push(token);
  }
  output.command = positionals[0];
  output.slug = positionals[1];
  if (positionals.length > 2) output.invalid = "too many positional arguments";
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
  if (args.write && args.command !== "generate" && args.command !== "check") {
    process.stderr.write("[FAIL] --write is accepted only by generate; check rejects it explicitly\n");
    return 1;
  }
  try {
    if (args.command === undefined) {
      process.stdout.write(renderText(collectLifecycleModel({ root: args.root })));
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
    if (args.command === "check") return runCheck(args.root, { write: args.write });
    if (args.command === "generate") return runGenerate(args.root, { write: args.write });
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
