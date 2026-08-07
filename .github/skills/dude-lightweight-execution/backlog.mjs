#!/usr/bin/env node
// @ts-check
/**
 * Feature backlog buckets for in-flight ideas.
 *
 * A production caller is `@dude status`. Given a workspace root, this script
 * derives six backlog buckets — Active, Next, Blocked, Later, Backlog, Shipped —
 * from `depends-on:` declarations plus lifecycle and task state that already
 * exists, with Shipped (every task done) evaluated first ahead of every ordering
 * bucket. It reuses the existing frontmatter, identity, ownership, and tasks
 * engines. The three status forms (text, kanban, flowchart) write no file; the
 * `generate` form renders both committed artifacts from the one derivation and,
 * with `--write`, writes exactly `.dude/backlog.md` and `.dude/backlog.html` — its
 * only write path. See `.dude/specs/025-backlog-report/plan.md` sections 2-9.
 *
 * Design for testability: `deriveBuckets` is a pure function over plain parsed
 * inputs, so it can be unit-tested with in-memory fixtures; `collectFocusInputs`
 * is a thin filesystem collector, so a spawn test can exercise the real root.
 * Importing this module runs nothing; the CLI entry is guarded.
 *
 * Two on-demand Mermaid views share this module (plan sections 5 and 6). The
 * `kanban` subcommand renders the six backlog buckets as a fenced Mermaid
 * `kanban` board whose lanes equal the text buckets; `flowchart <idea-slug>`
 * renders one feature's existing task `deps:` as a fenced Mermaid `flowchart`.
 * Both are pure string renderers (`renderKanban`, `renderFlowchart`) over
 * already-derived data, wrapped by guarded read-only CLI branches that write
 * nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { inventoryDefinedFeatures, resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseFrontmatterScalars, parseSpecIdentity } from '../dude-engine/lib/feature-identity.mjs';
import { parseTasks } from '../dude-engine/lib/tasks.mjs';
import { WORKSPACE_PATHS, resolveWorkspacePath, resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';

/**
 * Canonical scalar keys read from an idea ledger's frontmatter. Mirrors the
 * private `CANONICAL_IDEA_KEYS` in `dude-engine/lib/feature.mjs` (not exported);
 * used only to read `slug`, `status`, and the optional `depends-on` scalar.
 * @type {readonly string[]}
 */
const IDEA_KEYS = Object.freeze(['title', 'slug', 'status', 'spec_path', 'depends-on']);

/** Optional hand-maintained tie-break ordering (section 4). */
const BACKLOG_ORDER_PATH = `${WORKSPACE_PATHS.STATE_DIR}/backlog-order.md`;

/**
 * The exact — and only — two artifacts `generate --write` may write (plan
 * section 9). No other generated or persistent output exists. Both are derived
 * projections, never authoritative.
 */
const BACKLOG_MD_PATH = '.dude/backlog.md';
const BACKLOG_HTML_PATH = '.dude/backlog.html';

/**
 * @typedef {Object} IdeaRecord
 * @property {string} slug             stable idea identity
 * @property {string[]} dependsOn      declared `depends-on:` slugs
 * @property {boolean} defined         owns a cleanly resolved spec package
 * @property {boolean} packageComplete defined, package parses, >=1 task, all done
 * @property {boolean} hasInProgress   own package carries a `[~]` task
 * @property {boolean} ownBlocked      own package carries current blocking evidence
 * @property {string|null} specPath   resolved `spec_path:` when defined, else null
 *
 * @typedef {Object} FocusInputs
 * @property {IdeaRecord[]} ideas
 * @property {string[]} order          tie-break slug sequence (unknown slugs ignored downstream)
 *
 * @typedef {Object} FocusBuckets
 * @property {string[]} active
 * @property {string[]} next
 * @property {string[]} later
 * @property {string[]} blocked
 * @property {string[]} backlog
 * @property {string[]} shipped
 */

/**
 * The six backlog buckets in canonical lane order, each with its fixed
 * traffic-light tone. In-flight lanes (Active, Next, Blocked) lead the quiet
 * lanes (Later, Backlog, Shipped); Shipped is derived first but rendered last.
 * Tones are role names — Active primary, Next info, Blocked danger, Later
 * warning, Backlog muted, Shipped success — so done (success) and next (info)
 * never share a tone. Reused by every renderer so lane order and membership are
 * identical across the text, Markdown, and report views.
 * @type {ReadonlyArray<{ key: 'active'|'next'|'blocked'|'later'|'backlog'|'shipped', title: string, tone: string }>}
 */
export const BUCKET_LANES = Object.freeze([
  { key: 'active', title: 'Active', tone: 'primary' },
  { key: 'next', title: 'Next', tone: 'info' },
  { key: 'blocked', title: 'Blocked', tone: 'danger' },
  { key: 'later', title: 'Later', tone: 'warning' },
  { key: 'backlog', title: 'Backlog', tone: 'muted' },
  { key: 'shipped', title: 'Shipped', tone: 'success' },
]);

/** @param {string} left @param {string} right @returns {number} */
function compareSlug(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Assign every in-flight idea to exactly one of six backlog buckets (plan
 * section 3): Shipped, Blocked, Active, Backlog, Next, Later. Shipped (a defined
 * idea whose package parses, has >=1 task, and has every task done) is evaluated
 * first, ahead of every ordering bucket, so a completed idea named as another
 * idea's dependency reads as Shipped rather than Next. Setting Shipped aside
 * reproduces the prior five-bucket membership exactly, with the former
 * "Unordered" pool now named "Backlog".
 *
 * Pure: operates only on the supplied records and tie-break order, so a cyclic
 * `depends-on:` graph terminates — each dependency is judged solely on its own
 * named idea's package state and is never followed transitively.
 *
 * @param {FocusInputs} inputs
 * @returns {FocusBuckets}
 */
export function deriveBuckets(inputs) {
  const order = Array.isArray(inputs?.order) ? inputs.order : [];

  /** @type {Map<string, IdeaRecord>} */
  const bySlug = new Map();
  for (const idea of inputs?.ideas ?? []) {
    if (idea && typeof idea.slug === 'string' && !bySlug.has(idea.slug)) bySlug.set(idea.slug, idea);
  }

  // A `depends-on:` slug is met only when it names a defined idea whose package
  // resolves, parses, has >=1 task, and has every task done. A slug naming no
  // idea is unmet. Local and non-transitive by construction.
  /** @param {string} slug */
  const isMet = (slug) => {
    const dep = bySlug.get(slug);
    return Boolean(dep && dep.defined && dep.packageComplete);
  };

  // Tie-break positions, restricted to known idea slugs and de-duplicated while
  // preserving first-seen order. An absent file yields an empty map.
  /** @type {Map<string, number>} */
  const orderIndex = new Map();
  for (const slug of order) {
    if (bySlug.has(slug) && !orderIndex.has(slug)) orderIndex.set(slug, orderIndex.size);
  }

  // Slugs named as a dependency by any other idea (an ordering signal).
  /** @type {Set<string>} */
  const namedAsDep = new Set();
  for (const idea of bySlug.values()) {
    for (const dep of idea.dependsOn ?? []) namedAsDep.add(dep);
  }

  // A defined idea whose package parses, has >=1 task, and has every task done
  // is finished. Used both to identify the Shipped bucket and to decide, among
  // ordered items, which prerequisites ahead are already complete.
  /** @param {IdeaRecord} idea */
  const isFinished = (idea) => Boolean(idea.defined && idea.packageComplete);

  /** @type {string[]} */ const shipped = [];
  /** @type {string[]} */ const blocked = [];
  /** @type {string[]} */ const active = [];
  /** @type {IdeaRecord[]} */ const pool = []; // unblocked, non-active, unshipped

  for (const idea of bySlug.values()) {
    if (isFinished(idea)) {
      shipped.push(idea.slug); // (0) Shipped — evaluated first, ahead of every ordering bucket
      continue;
    }
    const hasUnmetDep = (idea.dependsOn ?? []).some((dep) => !isMet(dep));
    if (hasUnmetDep || idea.ownBlocked) {
      blocked.push(idea.slug); // (1) Blocked
      continue;
    }
    if (idea.hasInProgress) {
      active.push(idea.slug); // (2) Active — no cap
      continue;
    }
    pool.push(idea);
  }

  // (3) Backlog — no ordering signal at all (formerly "Unordered").
  /** @param {IdeaRecord} idea */
  const hasSignal = (idea) => (
    (idea.dependsOn?.length ?? 0) > 0
    || orderIndex.has(idea.slug)
    || namedAsDep.has(idea.slug)
  );

  /** @type {string[]} */ const backlog = [];
  /** @type {IdeaRecord[]} */ const ordered = [];
  for (const idea of pool) {
    if (hasSignal(idea)) ordered.push(idea);
    else backlog.push(idea.slug);
  }

  // Effective order over the unblocked, non-active, unshipped ideas. Declared
  // prerequisites among them are already satisfied (unmet ones moved to Blocked)
  // and therefore finished, so only the tie-break order distinguishes Next from
  // Later: an idea is Later when an unfinished ordered idea sits ahead of it in
  // the tie-break, and Next otherwise.
  /** @type {string[]} */ const next = [];
  /** @type {string[]} */ const later = [];
  for (const idea of ordered) {
    const position = orderIndex.get(idea.slug);
    let unfinishedAhead = false;
    if (position !== undefined) {
      for (const other of ordered) {
        if (other.slug === idea.slug) continue;
        const otherPosition = orderIndex.get(other.slug);
        if (otherPosition !== undefined && otherPosition < position && !isFinished(other)) {
          unfinishedAhead = true;
          break;
        }
      }
    }
    if (unfinishedAhead) later.push(idea.slug); // (5) Later
    else next.push(idea.slug); // (4) Next
  }

  // Deterministic ordering within each bucket: slug order everywhere, except
  // Next/Later follow the tie-break sequence (file-listed first) then slug.
  const byOrderThenSlug = (/** @type {string} */ left, /** @type {string} */ right) => {
    const leftPosition = orderIndex.has(left) ? /** @type {number} */ (orderIndex.get(left)) : Number.MAX_SAFE_INTEGER;
    const rightPosition = orderIndex.has(right) ? /** @type {number} */ (orderIndex.get(right)) : Number.MAX_SAFE_INTEGER;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return compareSlug(left, right);
  };

  shipped.sort(compareSlug);
  active.sort(compareSlug);
  blocked.sort(compareSlug);
  backlog.sort(compareSlug);
  next.sort(byOrderThenSlug);
  later.sort(byOrderThenSlug);

  return { active, next, blocked, later, backlog, shipped };
}

/**
 * Parse the optional tie-break file into an ordered slug sequence (section 4).
 * Each line may carry a leading `-`, `*`, or `N.` list marker; the first
 * lowercase slug token on a line is taken. Blank lines, headings, and other
 * non-slug lines are skipped. Pure.
 * @param {string} content
 * @returns {string[]}
 */
export function parseBacklogOrder(content) {
  /** @type {string[]} */
  const slugs = [];
  for (const line of String(content).split(/\r\n|\n|\r/)) {
    const match = /^\s*(?:[-*]\s+|\d+\.\s+)?([a-z0-9][a-z0-9-]*)\b/.exec(line);
    if (match) slugs.push(match[1]);
  }
  return slugs;
}

/**
 * Reduce a defined idea's package to the booleans the derivation needs. Any
 * failure to resolve or parse the package degrades to "no package" so one
 * malformed feature never empties or crashes the whole focus view.
 * @param {string} root
 * @param {string} specPath
 * @returns {{ packageComplete: boolean, hasInProgress: boolean, ownBlocked: boolean }}
 */
function readPackageFacts(root, specPath) {
  const empty = { packageComplete: false, hasInProgress: false, ownBlocked: false };
  try {
    const identity = parseSpecIdentity(specPath);
    if (!identity) return empty;
    const tasksPath = `${WORKSPACE_PATHS.SPECS_DIR}/${identity.feature}/tasks.md`;
    const absolute = resolveWorkspacePath(root, tasksPath);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) return empty;
    const { tasks } = parseTasks(fs.readFileSync(absolute, 'utf8'), { path: tasksPath });
    const packageComplete = tasks.length >= 1 && tasks.every((task) => task.state === 'done');
    const hasInProgress = tasks.some((task) => task.state === 'in-progress');
    // Current blocking evidence: a `[!]` task, or a `blocked-by:` line on a task
    // that is not already done. A `blocked-by:` note left on a `[x]` task is
    // stale history (real packages carry these) and is not a current block.
    const ownBlocked = tasks.some((task) => (
      task.state === 'blocked' || (task.blockedBy != null && task.state !== 'done')
    ));
    return { packageComplete, hasInProgress, ownBlocked };
  } catch {
    return empty;
  }
}

/**
 * List direct regular `.dude/ideas/*.md` files (no symbolic links), matching
 * the safety used by the feature inventory. Missing or unsafe roots yield an
 * empty list rather than throwing.
 * @param {string} root
 * @returns {{ name: string, absPath: string, ideaPath: string }[]}
 */
function listIdeaFiles(root) {
  let ideasRoot;
  try {
    ideasRoot = resolveWorkspacePath(root, WORKSPACE_PATHS.IDEAS_DIR);
  } catch {
    return [];
  }
  let rootStat;
  try {
    rootStat = fs.lstatSync(ideasRoot);
  } catch {
    return [];
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return [];

  let entries;
  try {
    entries = fs.readdirSync(ideasRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  /** @type {{ name: string, absPath: string, ideaPath: string }[]} */
  const files = [];
  for (const entry of entries) {
    if (!entry.name.endsWith('.md')) continue;
    const absPath = path.join(ideasRoot, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(absPath);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) continue;
    files.push({ name: entry.name, absPath, ideaPath: `${WORKSPACE_PATHS.IDEAS_DIR}/${entry.name}` });
  }
  files.sort((left, right) => compareSlug(left.name, right.name));
  return files;
}

/**
 * Read the optional tie-break file into an ordered slug sequence. Absent or
 * unsafe files yield an empty sequence.
 * @param {string} root
 * @returns {string[]}
 */
function readBacklogOrder(root) {
  try {
    const absolute = resolveWorkspacePath(root, BACKLOG_ORDER_PATH);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) return [];
    return parseBacklogOrder(fs.readFileSync(absolute, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Collect the plain inputs the derivation needs by reading the workspace once.
 * Inventories defined owners a single time (degrading gracefully around any one
 * malformed idea) and reads each defined idea's package tasks.
 * @param {{ root: string }} options
 * @returns {FocusInputs}
 */
export function collectFocusInputs({ root }) {
  const inventory = inventoryDefinedFeatures({ root });
  /** @type {Map<string, string>} idea path -> resolved spec path */
  const specByIdeaPath = new Map();
  for (const feature of inventory.features) specByIdeaPath.set(feature.ideaPath, feature.specPath);

  /** @type {IdeaRecord[]} */
  const ideas = [];
  for (const file of listIdeaFiles(root)) {
    let slug = file.name.replace(/\.md$/, '');
    /** @type {string[]} */
    let dependsOn = [];
    try {
      const content = fs.readFileSync(file.absPath, 'utf8');
      const frontmatter = parseFrontmatterScalars(content, { canonicalKeys: IDEA_KEYS });
      slug = frontmatter.scalars.get('slug')?.value || slug;
      const declared = frontmatter.scalars.get('depends-on')?.value || '';
      dependsOn = declared.split(/[\s,]+/).filter(Boolean);
    } catch {
      // Malformed frontmatter: fall back to the filename slug and no declared
      // dependencies. Such an idea is also absent from the inventory, so it is
      // treated as not-defined below and still appears in the buckets.
    }

    const specPath = specByIdeaPath.get(file.ideaPath);
    const defined = Boolean(specPath);
    const facts = defined
      ? readPackageFacts(root, /** @type {string} */ (specPath))
      : { packageComplete: false, hasInProgress: false, ownBlocked: false };
    ideas.push({ slug, dependsOn, defined, specPath: specPath ?? null, ...facts });
  }

  return { ideas, order: readBacklogOrder(root) };
}

/**
 * Collect inputs from the workspace and derive the focus buckets.
 * @param {{ root: string }} options
 * @returns {FocusBuckets}
 */
export function computeFocus({ root }) {
  return deriveBuckets(collectFocusInputs({ root }));
}

/**
 * Render backlog buckets as deterministic plain text.
 * @param {FocusBuckets} buckets
 * @returns {string}
 */
export function renderBuckets(buckets) {
  const blocks = BUCKET_LANES.map(({ key, title }) => {
    const slugs = buckets?.[key] ?? [];
    const body = slugs.length ? slugs.map((slug) => `  ${slug}`).join('\n') : '  (none)';
    return `${title}:\n${body}`;
  });
  return `${blocks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// Mermaid views (plan sections 5 and 6). Both are pure string renderers over
// already-derived data, so the CLI shims below stay thin filesystem readers and
// the renderers unit-test without spawning. Neither writes anything. Output
// characters are validated against the current Mermaid `kanban` and `flowchart`
// grammars: a quoted flowchart label rejects only `"`/`[`/`]`, and a kanban card
// rejects `[`/`]`/parentheses — everything else in this module's inputs is safe.
// ---------------------------------------------------------------------------

/**
 * Derive a Mermaid-safe node identifier from a durable task key by replacing
 * every non-alphanumeric character (notably `@`) with `_`. Distinct valid task
 * ids (`T\d+@[a-z0-9]{8}`) map to distinct ids because `@` is their only
 * non-alphanumeric character. Exported so tests can predict node ids.
 * @param {string} id
 * @returns {string}
 */
export function safeMermaidId(id) {
  return String(id).replace(/[^A-Za-z0-9]/g, '_');
}

/**
 * Make text safe inside a Mermaid *quoted* node label (`["..."]`) by dropping
 * the only characters that break it — `"`, `[`, `]` — and control characters,
 * then collapsing whitespace.
 * @param {string} text
 * @returns {string}
 */
function sanitizeLabel(text) {
  return String(text)
    .replace(/["[\]]/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Make text safe inside a Mermaid `kanban` card (`slug[text]`) by dropping the
 * characters that break it — `[`, `]`, and parentheses — plus control
 * characters, then collapsing whitespace. Slugs and the spec-number annotation
 * are already `[a-z0-9-]`; this is defensive.
 * @param {string} text
 * @returns {string}
 */
function sanitizeCard(text) {
  return String(text)
    .replace(/[[\]()]/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Look up a slug's optional annotation from a Map or plain-object `meta`.
 * @param {Map<string, string> | Record<string, string> | null | undefined} meta
 * @param {string} slug
 * @returns {string}
 */
function annotationFor(meta, slug) {
  if (!meta) return '';
  const value = meta instanceof Map ? meta.get(slug) : meta[slug];
  return typeof value === 'string' ? value : '';
}

/**
 * Render the six backlog buckets as a fenced Mermaid `kanban` board (plan
 * section 5). The lanes are exactly the six buckets in `BUCKET_LANES` order —
 * Active, Next, Blocked, Later, Backlog, Shipped — even when empty. Each idea is
 * one card keyed by its slug; when `meta` carries an annotation for that slug
 * (the spec number for a defined idea) it is appended to the card text. Lane
 * membership equals whatever buckets are passed, so callers derive them once and
 * share them with the text view. Pure; writes nothing.
 * @param {FocusBuckets} buckets
 * @param {Map<string, string> | Record<string, string>} [meta]
 * @returns {string}
 */
export function renderKanban(buckets, meta) {
  /** @type {string[]} */
  const body = [];
  for (const { key, title } of BUCKET_LANES) {
    body.push(`  ${key}[${title}]`);
    for (const slug of buckets?.[key] ?? []) {
      const annotation = annotationFor(meta, slug);
      const cardText = sanitizeCard(annotation ? `${slug} ${annotation}` : slug);
      body.push(`    ${slug}[${cardText}]`);
    }
  }
  return ['```mermaid', 'kanban', ...body, '```', ''].join('\n');
}

/**
 * Render the `.dude/backlog.md` content over the single derivation (plan
 * section 4): the six buckets as headed lists, then a fenced Mermaid `kanban`
 * board the repository host renders inline. Per-idea membership equals the
 * `buckets` argument exactly — the same object also feeds the board — so the
 * Markdown never disagrees with the derivation (FR-009). Each defined idea's
 * card and list item carry the `meta` annotation (its spec number) when present.
 * When a `stamp` is supplied, a single italic staleness line records the
 * generation time and short source revision so the committed Markdown carries
 * the same provenance as the report (FR-014, FR-015); without it the output is
 * unchanged. The diagram is kept in Markdown only. Pure and deterministic: a
 * function of the derived result, the optional annotations, and the optional
 * stamp that writes nothing.
 * @param {FocusBuckets} buckets
 * @param {Map<string, string> | Record<string, string>} [meta]
 * @param {{ generatedAt?: string, sourceRev?: string }} [stamp]
 * @returns {string}
 */
export function renderMarkdown(buckets, meta, stamp) {
  /** @type {string[]} */
  const lines = ['# Backlog', ''];
  if (stamp && (stamp.generatedAt || stamp.sourceRev)) {
    lines.push(
      `_Generated ${stamp.generatedAt ?? 'unknown'}, source ${stamp.sourceRev ?? 'unknown'}. A derived projection, never authoritative._`,
      '',
    );
  }
  for (const { key, title } of BUCKET_LANES) {
    const slugs = buckets?.[key] ?? [];
    lines.push(`## ${title}`, '');
    if (slugs.length === 0) {
      lines.push('_(none)_', '');
      continue;
    }
    for (const slug of slugs) {
      const annotation = annotationFor(meta, slug);
      lines.push(annotation ? `- ${slug} (${annotation})` : `- ${slug}`);
    }
    lines.push('');
  }
  lines.push('## Board', '');
  return `${lines.join('\n')}\n${renderKanban(buckets, meta)}`;
}

// ---------------------------------------------------------------------------
// Report view (plan sections 4, 5, 7, 8). The report renderer fills the
// committed, self-contained template with four views over the single
// derivation — summary counts, the traffic-light lane board with per-feature
// task progress, the per-feature task-order chains, and recent activity from
// idea coordinator logs — plus the portfolio rollup and work-item cards. Lane
// membership is driven by the derived `buckets` object (the same object the
// text and Markdown views use), so per-idea membership is identical across all
// three surfaces (FR-009). Every renderer here is a pure string function; only
// the guarded `generate` CLI branch reads the template and writes the two
// artifacts, and only when `--write` is present.
// ---------------------------------------------------------------------------

/**
 * Escape the five characters that are unsafe in HTML text or double-quoted
 * attribute values, so injected idea text can never introduce markup, an
 * attribute, or an external reference. Pure.
 * @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Map each defined idea's slug to its `spec-<number>` annotation, exactly as the
 * kanban and Markdown card annotations expect. Drafts (no cleanly resolved
 * package) get no entry. Shared by every renderer so the annotation is built
 * once per generation. Pure over the collected records.
 * @param {IdeaRecord[]} ideas
 * @returns {Map<string, string>} slug -> `spec-<number>`
 */
export function buildAnnotations(ideas) {
  /** @type {Map<string, string>} */
  const meta = new Map();
  for (const idea of ideas ?? []) {
    if (!idea.defined || !idea.specPath) continue;
    const identity = parseSpecIdentity(idea.specPath);
    if (!identity) continue;
    const number = /^(\d+)/.exec(identity.feature)?.[1] ?? identity.feature;
    meta.set(idea.slug, `spec-${number}`);
  }
  return meta;
}

/**
 * Extract the date-prefixed bullet entries under an idea ledger's
 * `## Coordinator Log` heading, newest-relevant text only (the leading `- ` and
 * trailing whitespace removed). Entries outside that section are ignored. Pure.
 * @param {string} content
 * @returns {string[]}
 */
function parseCoordinatorLog(content) {
  /** @type {string[]} */
  const out = [];
  let inLog = false;
  for (const line of String(content).split('\n')) {
    if (/^##\s+/.test(line)) {
      inLog = /^##\s+Coordinator Log\s*$/.test(line);
      continue;
    }
    if (!inLog) continue;
    const match = /^-\s+(\d{4}-\d{2}-\d{2}\b.*\S)\s*$/.exec(line);
    if (match) out.push(match[1]);
  }
  return out;
}

/**
 * Read one defined idea's package tasks with the same no-symlink safety the
 * derivation uses. Any failure degrades to an empty task list so one malformed
 * feature never empties the report. Pure of writes.
 * @param {string} root
 * @param {string} specPath
 * @returns {import('../dude-engine/lib/tasks.mjs').Task[]}
 */
function readPackageTasks(root, specPath) {
  try {
    const identity = parseSpecIdentity(specPath);
    if (!identity) return [];
    const tasksPath = `${WORKSPACE_PATHS.SPECS_DIR}/${identity.feature}/tasks.md`;
    const absolute = resolveWorkspacePath(root, tasksPath);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) return [];
    return parseTasks(fs.readFileSync(absolute, 'utf8'), { path: tasksPath }).tasks;
  } catch {
    return [];
  }
}

/**
 * @typedef {Object} WorkItem
 * @property {string} slug
 * @property {string} title              display title (falls back to the slug)
 * @property {boolean} defined           owns a cleanly resolved package
 * @property {string} kind               `F-<number>` for a defined feature, else `IDEA`
 * @property {string[]} dependsOn        declared `depends-on:` slugs
 * @property {number} done               tasks in the `done` state
 * @property {number} total              total tasks in the package
 * @property {import('../dude-engine/lib/tasks.mjs').Task[]} tasks
 * @property {string[]} log              coordinator-log entries
 */

/**
 * Collect per-idea presentation detail (title, coordinator log, package tasks)
 * keyed by slug, joining package tasks by the owner-resolved spec path. Purely
 * additive to the derivation: membership always comes from the buckets, so a
 * missing detail degrades a card gracefully and never moves an idea between
 * lanes. Reads only.
 * @param {string} root
 * @param {Map<string, string>} specBySlug  slug -> owner-resolved spec path
 * @returns {Map<string, WorkItem>}
 */
function collectPresentation(root, specBySlug) {
  /** @type {Map<string, WorkItem>} */
  const map = new Map();
  for (const file of listIdeaFiles(root)) {
    let slug = file.name.replace(/\.md$/, '');
    let title = '';
    /** @type {string[]} */
    let log = [];
    try {
      const content = fs.readFileSync(file.absPath, 'utf8');
      const frontmatter = parseFrontmatterScalars(content, { canonicalKeys: IDEA_KEYS });
      slug = frontmatter.scalars.get('slug')?.value || slug;
      title = frontmatter.scalars.get('title')?.value || '';
      log = parseCoordinatorLog(content);
    } catch {
      // Malformed ledger: fall back to the filename slug, no title, no log.
    }
    const specPath = specBySlug.get(slug) ?? null;
    const tasks = specPath ? readPackageTasks(root, specPath) : [];
    const done = tasks.filter((task) => task.state === 'done').length;
    map.set(slug, {
      slug,
      title,
      defined: Boolean(specPath),
      kind: 'IDEA',
      dependsOn: [],
      done,
      total: tasks.length,
      tasks,
      log,
    });
  }
  return map;
}

/**
 * Read the workspace once and assemble the full report model: the derived
 * buckets (the single source of membership), the shared spec-number
 * annotations, and a per-slug map of work-item detail. The buckets come from
 * the same `deriveBuckets(collectFocusInputs(...))` pipeline as every other
 * view, so the report can never disagree with the text or Markdown buckets.
 * Reads only.
 * @param {{ root: string }} options
 * @returns {{ buckets: FocusBuckets, meta: Map<string, string>, items: Map<string, WorkItem> }}
 */
function collectReportModel({ root }) {
  const inputs = collectFocusInputs({ root });
  const buckets = deriveBuckets(inputs);
  const meta = buildAnnotations(inputs.ideas);

  /** @type {Map<string, string>} slug -> owner-resolved spec path */
  const specBySlug = new Map();
  for (const idea of inputs.ideas) if (idea.specPath) specBySlug.set(idea.slug, idea.specPath);
  const presentation = collectPresentation(root, specBySlug);

  /** @type {Map<string, WorkItem>} */
  const items = new Map();
  for (const idea of inputs.ideas) {
    const detail = presentation.get(idea.slug);
    const annotation = meta.get(idea.slug);
    items.set(idea.slug, {
      slug: idea.slug,
      title: detail?.title || idea.slug,
      defined: idea.defined,
      kind: annotation ? `F-${annotation.replace(/^spec-/, '')}` : 'IDEA',
      dependsOn: idea.dependsOn,
      done: detail?.done ?? 0,
      total: detail?.total ?? 0,
      tasks: detail?.tasks ?? [],
      log: detail?.log ?? [],
    });
  }
  return { buckets, meta, items };
}

/** @param {number} done @param {number} total @returns {number} whole-percent complete */
function pct(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** A safe placeholder work item for a slug that has no collected detail. */
function fallbackItem(slug) {
  return { slug, title: slug, defined: false, kind: 'IDEA', dependsOn: [], done: 0, total: 0, tasks: [], log: [] };
}

/**
 * Render one work-item card. Carries `data-bucket` and `data-slug` so the lane
 * membership is machine-readable, and `data-tone` for the traffic-light stripe.
 * All idea text is escaped. Pure.
 * @param {{ key: string, title: string, tone: string }} lane
 * @param {WorkItem} item
 * @returns {string}
 */
function renderCard(lane, item) {
  const chip = `<span class="idchip idchip-${item.defined ? 'feature' : 'idea'}">${esc(item.kind)}</span>`;
  const pill = `<span class="pill" data-tone="${lane.tone}">${esc(lane.title)}</span>`;
  const head = `<div class="cardtop">${chip}${pill}</div><div class="cardtitle">${esc(item.title)}</div>`;
  let body;
  if (item.total > 0) {
    const percent = pct(item.done, item.total);
    body = `<div class="bar"><span style="width:${percent}%"></span></div>`
      + `<div class="cardmeta"><span>${item.done}/${item.total} tasks</span><span>${percent}%</span></div>`;
  } else {
    body = `<div class="cardmeta"><span>${item.defined ? 'no tasks yet' : 'draft'}</span><span>no package</span></div>`;
  }
  /** @type {string[]} */
  const tags = [];
  if (item.total > 0) tags.push(`<span class="tag">${item.total} tasks</span>`);
  for (const dep of item.dependsOn) tags.push(`<span class="tag tag-dep">&#8627; ${esc(dep)}</span>`);
  const tagRow = tags.length ? `<div class="tags">${tags.join('')}</div>` : '';
  return `<article class="card" data-bucket="${lane.key}" data-slug="${esc(item.slug)}" data-tone="${lane.tone}">`
    + `${head}${body}${tagRow}</article>`;
}

/**
 * Render the six traffic-light lanes in `BUCKET_LANES` order. Each lane lists a
 * card for every slug in `buckets[key]` — so lane membership equals the
 * derivation exactly — and an empty lane renders a compact placeholder. Pure.
 * @param {FocusBuckets} buckets
 * @param {Map<string, WorkItem>} items
 * @returns {string}
 */
function renderBoard(buckets, items) {
  return BUCKET_LANES.map((lane) => {
    const slugs = buckets?.[lane.key] ?? [];
    const body = slugs.length
      ? slugs.map((slug) => renderCard(lane, items.get(slug) ?? fallbackItem(slug))).join('')
      : '<p class="lane-empty">No items</p>';
    return `<section class="lane" data-bucket="${lane.key}" data-tone="${lane.tone}">`
      + '<header class="lanehead"><div class="lanetitle"><span class="lanedot"></span>'
      + `<h3>${esc(lane.title)}</h3><span class="lanecount">${slugs.length}</span></div></header>`
      + `<div class="lanebody">${body}</div></section>`;
  }).join('');
}

/**
 * Render the summary stat tiles: in-flight count, idea totals, task completion,
 * and the shipped / blocked counts. Counts are read from the derived buckets and
 * the collected items. Pure.
 * @param {FocusBuckets} buckets
 * @param {Map<string, WorkItem>} items
 * @returns {string}
 */
function renderStats(buckets, items) {
  const all = [...items.values()];
  const total = all.length;
  const defined = all.filter((item) => item.defined).length;
  const tasksTotal = all.reduce((sum, item) => sum + item.total, 0);
  const tasksDone = all.reduce((sum, item) => sum + item.done, 0);
  const inFlight = (buckets.active?.length ?? 0) + (buckets.next?.length ?? 0) + (buckets.blocked?.length ?? 0);
  const stat = (label, value, sub) =>
    `<div class="stat"><span class="statval">${value}</span>`
    + `<span class="statlabel">${esc(label)}</span>`
    + `<span class="statsub">${esc(sub)}</span></div>`;
  return [
    stat('In flight', inFlight, 'active, next or blocked'),
    stat('Ideas', total, `${defined} defined, ${total - defined} draft`),
    stat('Tasks done', `${tasksDone}/${tasksTotal}`, `${pct(tasksDone, tasksTotal)}% of all tasks`),
    stat('Shipped', buckets.shipped?.length ?? 0, 'every task complete'),
    stat('Blocked', buckets.blocked?.length ?? 0, 'waiting on something'),
  ].join('');
}

/**
 * Render the portfolio rollup: a single stacked track of every idea by bucket
 * with a counted legend. Segment widths are a deterministic function of the
 * bucket counts. Pure.
 * @param {FocusBuckets} buckets
 * @param {Map<string, WorkItem>} items
 * @returns {string}
 */
function renderRollup(buckets, items) {
  const total = items.size || 1;
  const segments = BUCKET_LANES
    .filter((lane) => (buckets[lane.key]?.length ?? 0) > 0)
    .map((lane) => {
      const count = buckets[lane.key].length;
      const width = ((count / total) * 100).toFixed(3);
      return `<span class="seg" data-tone="${lane.tone}" style="width:${width}%" title="${esc(lane.title)}: ${count}"></span>`;
    })
    .join('');
  const legend = BUCKET_LANES
    .map((lane) => `<span class="lg"><span class="sw" data-tone="${lane.tone}"></span>${esc(lane.title)}<b>${buckets[lane.key]?.length ?? 0}</b></span>`)
    .join('');
  return `<p class="sectionlabel" style="margin-top:0">Portfolio &middot; ${items.size} items</p>`
    + `<div class="track">${segments}</div><div class="legend">${legend}</div>`;
}

/**
 * Render a per-feature task-order chain for every defined package that carries
 * tasks, ordered by slug for determinism. Each task is a list item coded by its
 * state (done / in-progress / blocked / other) via the `-deep`/`-text` code
 * colours. Pure.
 * @param {Map<string, WorkItem>} items
 * @returns {string}
 */
function renderChains(items) {
  const withTasks = [...items.values()]
    .filter((item) => item.tasks.length > 0)
    .sort((left, right) => compareSlug(left.slug, right.slug));
  if (!withTasks.length) return '<p class="lane-empty">No task packages yet</p>';
  return withTasks.map((item) => {
    const nodes = item.tasks.map((task) => {
      const cls = task.state === 'done' ? 'ok'
        : task.state === 'in-progress' ? 'wip'
          : task.state === 'blocked' ? 'bad' : 'todo';
      const id = String(task.id).split('@')[0];
      const description = String(task.description ?? '');
      const short = description.length > 76 ? `${description.slice(0, 76)}\u2026` : description;
      return `<li class="chain-${cls}"><code>${esc(id)}</code> ${esc(short)}</li>`;
    }).join('');
    return `<section class="chain"><h4>${esc(item.title)}</h4><ol>${nodes}</ol></section>`;
  }).join('');
}

/**
 * Render recent activity: the newest coordinator-log entries across every idea,
 * sorted by their date prefix (descending), tie-broken by slug for
 * determinism, capped to the twelve most recent. Pure.
 * @param {Map<string, WorkItem>} items
 * @returns {string}
 */
function renderActivity(items) {
  /** @type {{ slug: string, line: string }[]} */
  const rows = [];
  for (const item of items.values()) for (const line of item.log) rows.push({ slug: item.slug, line });
  rows.sort((left, right) => {
    if (left.line !== right.line) return left.line < right.line ? 1 : -1;
    return compareSlug(left.slug, right.slug);
  });
  const recent = rows.slice(0, 12);
  if (!recent.length) return '<p class="lane-empty">No recent activity</p>';
  const list = recent.map((row) => {
    const cut = row.line.indexOf(' - ');
    const date = cut >= 0 ? row.line.slice(0, cut) : row.line;
    const rest = cut >= 0 ? row.line.slice(cut + 3) : '';
    return `<li><time>${esc(date.replace(' UTC', ''))}</time>`
      + `<span class="chip">${esc(row.slug)}</span><span class="act">${esc(rest)}</span></li>`;
  }).join('');
  return `<ul class="activity">${list}</ul>`;
}

/**
 * Fill the committed self-contained template with the four views over the single
 * derivation, plus the rollup and the snapshot stamp. A pure, deterministic
 * function of the template string and the model: it substitutes only the
 * `{{SLOT}}` placeholders and adds no network, service, script, or external
 * reference of its own. Lane membership equals `model.buckets` exactly.
 * @param {string} template
 * @param {{ buckets: FocusBuckets, items: Map<string, WorkItem>, title?: string, generatedAt?: string, sourceRev?: string }} model
 * @returns {string}
 */
export function renderReport(template, model) {
  const { buckets, items, title = '', generatedAt = 'unknown', sourceRev = 'unknown' } = model;
  /** @type {Record<string, string>} */
  const slots = {
    TITLE: esc(title),
    GENERATED_AT: esc(generatedAt),
    SOURCE_REV: esc(sourceRev),
    ROLLUP: renderRollup(buckets, items),
    STATS: renderStats(buckets, items),
    BOARD: renderBoard(buckets, items),
    CHAINS: renderChains(items),
    ACTIVITY: renderActivity(items),
  };
  return String(template).replace(/\{\{([A-Z_]+)\}\}/g, (whole, key) =>
    (Object.prototype.hasOwnProperty.call(slots, key) ? slots[key] : whole));
}

/** Read the committed template as a core sibling of this module (never from an installed pack). */
function readTemplate() {
  return fs.readFileSync(new URL('./backlog-template.html', import.meta.url), 'utf8');
}

/**
 * Resolve a short source revision for the staleness stamp, degrading to a plain
 * `unknown` outside a checkout. Read-only.
 * @param {string} root
 * @returns {string}
 */
function readSourceRev(root) {
  try {
    const rev = execSync('git rev-parse --short HEAD', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    return rev || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build a node's readable quoted-label text for a task: the durable id (the
 * FR-011 identity, always kept whole) followed by a short, sanitized slice of
 * its description so a wide feature stays legible. Pure.
 * @param {import('../dude-engine/lib/tasks.mjs').Task} task
 * @returns {string}
 */
function nodeLabel(task) {
  const MAX_DESC = 60;
  const description = sanitizeLabel(task.description ?? '');
  const short = description.length > MAX_DESC
    ? `${description.slice(0, MAX_DESC).trimEnd()}...`
    : description;
  // `task.id` is already Mermaid-safe inside a quoted label (`@` and hex are
  // fine); only the free-text description needs sanitizing, done above.
  return short ? `${task.id} ${short}` : String(task.id);
}

/**
 * Render one feature's existing task order as a fenced Mermaid `flowchart` (plan
 * section 6). One node per task (id sanitized to a Mermaid-safe id, readable
 * quoted label) and one edge per literal `deps:` entry whose target is a known
 * task in the same set. An edge `from --> to` means `from` depends on `to` (to
 * must finish first), matching the codebase's dependency-edge convention
 * (`tasks.mjs` `deriveDependencies`). A `deps:` target that is not a known task
 * is noted as a `%%` comment rather than drawn, mirroring `parseTasks`, which
 * records a dangling target as a warning and never throws. Pure; operates on
 * already-parsed tasks; writes nothing.
 * @param {import('../dude-engine/lib/tasks.mjs').Task[]} tasks
 * @param {{ slug?: string, feature?: string }} [meta]
 * @returns {string}
 */
export function renderFlowchart(tasks, meta) {
  const list = Array.isArray(tasks) ? tasks : [];
  const known = new Set(list.map((task) => task.id));

  /** @type {string[]} */ const nodes = [];
  /** @type {string[]} */ const edges = [];
  /** @type {string[]} */ const notes = [];

  for (const task of list) {
    nodes.push(`  ${safeMermaidId(task.id)}["${nodeLabel(task)}"]`);
  }
  for (const task of list) {
    for (const dep of task.deps ?? []) {
      if (known.has(dep)) {
        edges.push(`  ${safeMermaidId(task.id)} --> ${safeMermaidId(dep)}`);
      } else {
        notes.push(`  %% note: task ${task.id} depends on unknown id ${dep} (noted, not drawn)`);
      }
    }
  }

  /** @type {string[]} */
  const body = ['```mermaid', 'flowchart TD'];
  const titleParts = [meta?.slug, meta?.feature].filter((part) => typeof part === 'string' && part !== '');
  if (titleParts.length) body.push(`  %% ${titleParts.join(' :: ')}`);
  body.push(...nodes, ...edges, ...notes, '```', '');
  return body.join('\n');
}

const HELP = `backlog — feature backlog buckets, Mermaid views, and the report

Usage:
  node backlog.mjs [--root <dir>]
  node backlog.mjs kanban [--root <dir>]
  node backlog.mjs flowchart <idea-slug> [--root <dir>]
  node backlog.mjs generate [--root <dir>] [--write]

The default form prints the text backlog buckets (Active, Next, Blocked, Later,
Backlog, Shipped) for the in-flight ideas under <dir> (default: current directory).
'kanban' prints a fenced Mermaid kanban of the same buckets; 'flowchart' prints
a fenced Mermaid flowchart of one feature's existing task deps. Those three forms
read only and write nothing. 'generate' renders both artifacts from one
derivation and prints them; with --write it writes exactly .dude/backlog.md and
.dude/backlog.html (its only write path) through the symlink-refusing helper.
`;

/**
 * CLI shim for the `kanban` subcommand. Reads the workspace once and derives the
 * buckets with the same pipeline as `computeFocus` (`deriveBuckets` over
 * `collectFocusInputs`), so the board's lane membership is identical to the text
 * view. Maps each defined idea's slug to its spec number for the card
 * annotation. Read-only.
 * @param {string} root
 * @returns {string}
 */
function runKanban(root) {
  const inputs = collectFocusInputs({ root });
  const buckets = deriveBuckets(inputs); // identical to computeFocus({ root })
  return renderKanban(buckets, buildAnnotations(inputs.ideas));
}

/**
 * CLI shim for the `flowchart <idea-slug>` subcommand. Resolves the slug to its
 * defined package's exact owner (`resolveFeatureOwner`), reads that one
 * feature's `tasks.md` (`parseTasks`), and renders the task-order flowchart. A
 * draft or unknown slug (no defined package) is reported plainly and returns
 * non-zero without throwing and without writing. Scope is exactly one feature.
 * @param {string} root
 * @param {string | undefined} slug
 * @returns {number} process exit code
 */
function runFlowchart(root, slug) {
  if (typeof slug !== 'string' || slug === '') {
    process.stderr.write('[FAIL] flowchart requires an idea slug: backlog.mjs flowchart <idea-slug>\n');
    return 1;
  }
  const idea = collectFocusInputs({ root }).ideas.find((candidate) => candidate.slug === slug);
  if (!idea || !idea.defined || !idea.specPath) {
    process.stderr.write(`[FAIL] idea '${slug}' has no defined package to chart\n`);
    return 1;
  }
  const { owner } = resolveFeatureOwner({ root, specPath: idea.specPath });
  const identity = owner ? parseSpecIdentity(owner.specPath) : null;
  if (!owner || !identity) {
    process.stderr.write(`[FAIL] could not resolve a unique owner for idea '${slug}'\n`);
    return 1;
  }
  const tasksPath = `${WORKSPACE_PATHS.SPECS_DIR}/${identity.feature}/tasks.md`;
  let content;
  try {
    const absolute = resolveWorkspacePath(root, tasksPath);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('not a regular file');
    content = fs.readFileSync(absolute, 'utf8');
  } catch {
    process.stderr.write(`[FAIL] no readable tasks file for idea '${slug}'\n`);
    return 1;
  }
  const { tasks } = parseTasks(content, { path: tasksPath });
  process.stdout.write(renderFlowchart(tasks, { slug, feature: identity.feature }));
  return 0;
}

/**
 * CLI shim for the `generate` subcommand. Reads the workspace once, derives the
 * buckets, and renders BOTH artifacts from that single derivation — the
 * `.dude/backlog.md` Markdown and the `.dude/backlog.html` report — stamped with
 * the generation time and a short source revision (`unknown` outside a
 * checkout). Without `--write` it prints both artifacts and writes nothing. With
 * `--write` it writes exactly the two artifacts through the symlink-refusing
 * mutation-path helper and writes nothing else. This is the module's only write
 * path (plan section 9).
 * @param {string} root
 * @param {{ write: boolean }} options
 * @returns {number} process exit code
 */
function runGenerate(root, { write }) {
  const model = collectReportModel({ root });
  const generatedAt = `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  const sourceRev = readSourceRev(root);

  const markdown = renderMarkdown(model.buckets, model.meta, { generatedAt, sourceRev });
  const html = renderReport(readTemplate(), {
    buckets: model.buckets,
    items: model.items,
    title: path.basename(path.resolve(root)),
    generatedAt,
    sourceRev,
  });

  if (!write) {
    process.stdout.write(`==> ${BACKLOG_MD_PATH}\n${markdown}\n==> ${BACKLOG_HTML_PATH}\n${html}\n`);
    return 0;
  }

  fs.writeFileSync(resolveMutationPath(root, BACKLOG_MD_PATH), markdown);
  fs.writeFileSync(resolveMutationPath(root, BACKLOG_HTML_PATH), html);
  process.stdout.write(`[OK] wrote ${BACKLOG_MD_PATH} and ${BACKLOG_HTML_PATH}\n`);
  return 0;
}

/**
 * @param {string[]} argv
 * @returns {{ root: string | undefined, command: string | undefined, slug: string | undefined, write: boolean, help: boolean }}
 */
export function parseArgs(argv) {
  /** @type {{ root: string | undefined, command: string | undefined, slug: string | undefined, write: boolean, help: boolean }} */
  const out = { root: process.cwd(), command: undefined, slug: undefined, write: false, help: false };
  /** @type {string[]} */
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') out.help = true;
    else if (token === '--root') { out.root = argv[index + 1]; index += 1; }
    else if (token === '--write') out.write = true;
    else if (token.startsWith('--')) out.help = true;
    else positionals.push(token);
  }
  out.command = positionals[0];
  out.slug = positionals[1];
  return out;
}

/**
 * @param {ReturnType<typeof parseArgs>} args
 * @returns {number} process exit code
 */
export function run(args) {
  if (args.help || typeof args.root !== 'string') {
    process.stdout.write(HELP);
    return args.help ? 0 : 1;
  }
  try {
    if (args.command === undefined) {
      process.stdout.write(renderBuckets(computeFocus({ root: args.root })));
      return 0;
    }
    if (args.command === 'kanban') {
      process.stdout.write(runKanban(args.root));
      return 0;
    }
    if (args.command === 'flowchart') {
      return runFlowchart(args.root, args.slug);
    }
    if (args.command === 'generate') {
      return runGenerate(args.root, { write: args.write });
    }
    process.stderr.write(`[FAIL] unknown command: ${args.command}\n`);
    return 1;
  } catch (error) {
    process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/** @returns {boolean} */
function isMainModule() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}
