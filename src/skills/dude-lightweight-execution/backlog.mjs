#!/usr/bin/env node
// @ts-check
/**
 * Read-only feature focus buckets for in-flight ideas.
 *
 * The sole production caller is `@dude status`. Given a workspace root, this
 * script derives five focus buckets — Active, Next, Later, Blocked, Unordered —
 * from `depends-on:` declarations plus lifecycle and task state that already
 * exists, and prints them as plain text. It reuses the existing frontmatter,
 * identity, ownership, and tasks engines and writes nothing (no receipt, no
 * state, no snapshot). See `.dude/specs/024-feature-focus-order/plan.md`
 * sections 1, 3, and 4.
 *
 * Design for testability: `deriveBuckets` is a pure function over plain parsed
 * inputs, so it can be unit-tested with in-memory fixtures; `collectFocusInputs`
 * is a thin filesystem collector, so a spawn test can exercise the real root.
 * Importing this module runs nothing; the CLI entry is guarded.
 *
 * Two on-demand Mermaid views share this module (plan sections 5 and 6). The
 * `kanban` subcommand renders the five focus buckets as a fenced Mermaid
 * `kanban` board whose lanes equal the text buckets; `flowchart <idea-slug>`
 * renders one feature's existing task `deps:` as a fenced Mermaid `flowchart`.
 * Both are pure string renderers (`renderKanban`, `renderFlowchart`) over
 * already-derived data, wrapped by guarded read-only CLI branches that write
 * nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventoryDefinedFeatures, resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { parseFrontmatterScalars, parseSpecIdentity } from '../dude-engine/lib/feature-identity.mjs';
import { parseTasks } from '../dude-engine/lib/tasks.mjs';
import { WORKSPACE_PATHS, resolveWorkspacePath } from '../dude-engine/lib/workspace-paths.mjs';

/**
 * Canonical scalar keys read from an idea ledger's frontmatter. Mirrors the
 * private `CANONICAL_IDEA_KEYS` in `dude-engine/lib/feature.mjs` (not exported);
 * used only to read `slug`, `status`, and the optional `depends-on` scalar.
 * @type {readonly string[]}
 */
const IDEA_KEYS = Object.freeze(['title', 'slug', 'status', 'spec_path', 'depends-on']);

/** Optional hand-maintained tie-break ordering (section 4). */
const FOCUS_ORDER_PATH = `${WORKSPACE_PATHS.STATE_DIR}/focus-order.md`;

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
 * @property {string[]} unordered
 */

/** @param {string} left @param {string} right @returns {number} */
function compareSlug(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Assign every in-flight idea to exactly one focus bucket (plan section 3).
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

  /** @type {string[]} */ const blocked = [];
  /** @type {string[]} */ const active = [];
  /** @type {IdeaRecord[]} */ const pool = []; // unblocked, non-active

  for (const idea of bySlug.values()) {
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

  // (3) Unordered — no ordering signal at all.
  /** @param {IdeaRecord} idea */
  const hasSignal = (idea) => (
    (idea.dependsOn?.length ?? 0) > 0
    || orderIndex.has(idea.slug)
    || namedAsDep.has(idea.slug)
  );

  /** @type {string[]} */ const unordered = [];
  /** @type {IdeaRecord[]} */ const ordered = [];
  for (const idea of pool) {
    if (hasSignal(idea)) ordered.push(idea);
    else unordered.push(idea.slug);
  }

  // Effective order over the unblocked, non-active ideas. Declared prerequisites
  // among them are already satisfied (unmet ones moved to Blocked) and therefore
  // finished, so only the tie-break order distinguishes Next from Later: an idea
  // is Later when an unfinished ordered idea sits ahead of it in the tie-break,
  // and Next otherwise.
  /** @param {IdeaRecord} idea */
  const isFinished = (idea) => Boolean(idea.defined && idea.packageComplete);

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

  active.sort(compareSlug);
  blocked.sort(compareSlug);
  unordered.sort(compareSlug);
  next.sort(byOrderThenSlug);
  later.sort(byOrderThenSlug);

  return { active, next, later, blocked, unordered };
}

/**
 * Parse the optional tie-break file into an ordered slug sequence (section 4).
 * Each line may carry a leading `-`, `*`, or `N.` list marker; the first
 * lowercase slug token on a line is taken. Blank lines, headings, and other
 * non-slug lines are skipped. Pure.
 * @param {string} content
 * @returns {string[]}
 */
export function parseFocusOrder(content) {
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
function readFocusOrder(root) {
  try {
    const absolute = resolveWorkspacePath(root, FOCUS_ORDER_PATH);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) return [];
    return parseFocusOrder(fs.readFileSync(absolute, 'utf8'));
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

  return { ideas, order: readFocusOrder(root) };
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
 * Render focus buckets as deterministic plain text.
 * @param {FocusBuckets} buckets
 * @returns {string}
 */
export function renderBuckets(buckets) {
  /** @type {[string, string[]][]} */
  const sections = [
    ['Active', buckets.active],
    ['Next', buckets.next],
    ['Later', buckets.later],
    ['Blocked', buckets.blocked],
    ['Unordered', buckets.unordered],
  ];
  const blocks = sections.map(([label, slugs]) => {
    const body = slugs.length ? slugs.map((slug) => `  ${slug}`).join('\n') : '  (none)';
    return `${label}:\n${body}`;
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
 * Render the five focus buckets as a fenced Mermaid `kanban` board (plan
 * section 5). The lanes are exactly the section-3 buckets in order — Active,
 * Next, Later, Blocked, Unordered — even when empty. Each idea is one card keyed
 * by its slug; when `meta` carries an annotation for that slug (the spec number
 * for a defined idea) it is appended to the card text. Lane membership equals
 * whatever buckets are passed, so callers derive them once and share them with
 * the text view. Pure; writes nothing.
 * @param {FocusBuckets} buckets
 * @param {Map<string, string> | Record<string, string>} [meta]
 * @returns {string}
 */
export function renderKanban(buckets, meta) {
  /** @type {[string, string, string[]][]} laneId, laneTitle, slugs */
  const lanes = [
    ['active', 'Active', buckets?.active ?? []],
    ['next', 'Next', buckets?.next ?? []],
    ['later', 'Later', buckets?.later ?? []],
    ['blocked', 'Blocked', buckets?.blocked ?? []],
    ['unordered', 'Unordered', buckets?.unordered ?? []],
  ];
  /** @type {string[]} */
  const body = [];
  for (const [laneId, laneTitle, slugs] of lanes) {
    body.push(`  ${laneId}[${laneTitle}]`);
    for (const slug of slugs) {
      const annotation = annotationFor(meta, slug);
      const cardText = sanitizeCard(annotation ? `${slug} ${annotation}` : slug);
      body.push(`    ${slug}[${cardText}]`);
    }
  }
  return ['```mermaid', 'kanban', ...body, '```', ''].join('\n');
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

const HELP = `focus — read-only feature focus buckets and Mermaid views

Usage:
  node focus.mjs [--root <dir>]
  node focus.mjs kanban [--root <dir>]
  node focus.mjs flowchart <idea-slug> [--root <dir>]

The default form prints the text focus buckets (Active, Next, Later, Blocked,
Unordered) for the in-flight ideas under <dir> (default: current directory).
'kanban' prints a fenced Mermaid kanban of the same buckets; 'flowchart' prints
a fenced Mermaid flowchart of one feature's existing task deps. Reads only;
writes nothing.
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
  /** @type {Map<string, string>} slug -> spec-number annotation */
  const meta = new Map();
  for (const idea of inputs.ideas) {
    if (!idea.defined || !idea.specPath) continue;
    const identity = parseSpecIdentity(idea.specPath);
    if (!identity) continue;
    const number = /^(\d+)/.exec(identity.feature)?.[1] ?? identity.feature;
    meta.set(idea.slug, `spec-${number}`);
  }
  return renderKanban(buckets, meta);
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
    process.stderr.write('[FAIL] flowchart requires an idea slug: focus.mjs flowchart <idea-slug>\n');
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
 * @param {string[]} argv
 * @returns {{ root: string | undefined, command: string | undefined, slug: string | undefined, help: boolean }}
 */
export function parseArgs(argv) {
  /** @type {{ root: string | undefined, command: string | undefined, slug: string | undefined, help: boolean }} */
  const out = { root: process.cwd(), command: undefined, slug: undefined, help: false };
  /** @type {string[]} */
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') out.help = true;
    else if (token === '--root') { out.root = argv[index + 1]; index += 1; }
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
