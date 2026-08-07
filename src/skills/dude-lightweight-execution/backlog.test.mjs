// @ts-check
/**
 * Focus-derivation tests for `focus.mjs` (canonical task T002@6275636b,
 * Feature 024). Covers exactly the plan `## Chosen Design` section 8 list for
 * this task plus the ratified own-package blocking interpretation:
 *
 *   1. exactly-one-bucket assignment (disjoint buckets whose union is the input)
 *   2. the unmet-dependency rule across not-defined / not-done / all-done / dangling
 *   3. a dependency cycle leaving both endpoints Blocked without looping
 *   4. several ideas Active at once, with no cap
 *   5. no-signal ideas landing in Unordered
 *   6. RATIFIED: a done package carrying a `blocked-by:` on its `[x]` task is NOT Blocked
 *   7. tie-break Next/Later from `.dude/state/focus-order.md` (unknown slug ignored; absence -> no Later)
 *   8. `parseFocusOrder` parsing an ordered slug list, ignoring heading/blank/non-slug lines
 *   9. read-only: the FS collectors write nothing and importing the module runs nothing
 *
 * Cases 1-5 drive the PURE `deriveBuckets` with in-memory records. The ratified
 * case 6 and the tie-break/read-only cases 7 and 9 exercise the real filesystem
 * collector against a throwaway temp workspace, which is the only place the
 * `tasks.md` -> `ownBlocked`/`packageComplete` reduction and the optional-file
 * reader actually run. Case 8 is a pure parser test.
 *
 * @see .dude/specs/024-feature-focus-order/plan.md sections 3, 4, and 8.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseTasks } from '../dude-engine/lib/tasks.mjs';
import {
  collectFocusInputs,
  computeFocus,
  deriveBuckets,
  parseFocusOrder,
  renderBuckets,
  renderFlowchart,
  renderKanban,
  safeMermaidId,
} from './focus.mjs';

/** file:// URL to the module under test, for a side-effect-free import probe. */
const FOCUS_URL = new URL('./focus.mjs', import.meta.url).href;

/** Absolute path to the source module under test, for spawn-based CLI checks. */
const FOCUS_PATH = fileURLToPath(new URL('./focus.mjs', import.meta.url));

/**
 * @typedef {{
 *   slug: string,
 *   dependsOn: string[],
 *   defined: boolean,
 *   packageComplete: boolean,
 *   hasInProgress: boolean,
 *   ownBlocked: boolean,
 * }} IdeaRecord
 *
 * @typedef {{
 *   active: string[],
 *   next: string[],
 *   later: string[],
 *   blocked: string[],
 *   unordered: string[],
 * }} FocusBuckets
 */

/**
 * Build an `IdeaRecord` with neutral defaults (no dependency, undefined package,
 * not in progress, not blocked). Overrides set only the signal under test.
 * @param {string} slug
 * @param {Partial<IdeaRecord>} [overrides]
 * @returns {IdeaRecord}
 */
function record(slug, overrides = {}) {
  return {
    slug,
    dependsOn: [],
    defined: false,
    packageComplete: false,
    hasInProgress: false,
    ownBlocked: false,
    ...overrides,
  };
}

/**
 * Assert the five buckets are pairwise disjoint and that their union is exactly
 * the set of input slugs — i.e. every idea lands in exactly one bucket.
 * @param {FocusBuckets} buckets
 * @param {string[]} allSlugs
 */
function assertPartition(buckets, allSlugs) {
  /** @type {[string, string[]][]} */
  const labeled = [
    ['active', buckets.active],
    ['next', buckets.next],
    ['later', buckets.later],
    ['blocked', buckets.blocked],
    ['unordered', buckets.unordered],
  ];
  /** @type {Map<string, string>} slug -> owning bucket */
  const seen = new Map();
  for (const [name, slugs] of labeled) {
    assert.ok(Array.isArray(slugs), `bucket '${name}' must be an array`);
    for (const slug of slugs) {
      assert.equal(seen.has(slug), false, `slug '${slug}' appears in both '${seen.get(slug)}' and '${name}'`);
      seen.set(slug, name);
    }
  }
  assert.deepEqual([...seen.keys()].sort(), [...allSlugs].sort(), 'bucket union must equal the input slugs');
}

// ---------------------------------------------------------------------------
// Temp-workspace helpers for the filesystem-collector cases (6, 7, 9).
// ---------------------------------------------------------------------------

/** @returns {string} absolute path to a fresh throwaway workspace root */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-focus-'));
}

/** @param {string} root @param {string} relative @param {string} body */
function writeFile(root, relative, body) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, body);
}

/**
 * Write a canonical idea ledger with strictly-canonical frontmatter.
 * @param {string} root
 * @param {string} slug
 * @param {{ status?: string, feature?: string | null, dependsOn?: string | null }} [options]
 */
function writeIdea(root, slug, { status = 'defined', feature = null, dependsOn = null } = {}) {
  const lines = ['---', `title: ${slug}`, `slug: ${slug}`, `status: ${status}`];
  lines.push(feature ? `spec_path: .dude/specs/${feature}/spec.md` : 'spec_path:');
  if (dependsOn) lines.push(`depends-on: ${dependsOn}`);
  lines.push('---', '', '# Idea', '', 'Body.', '');
  writeFile(root, `.dude/ideas/${slug}.md`, lines.join('\n'));
}

/** @param {string} root @param {string} feature @param {string[]} taskLines */
function writePackage(root, feature, taskLines) {
  writeFile(root, `.dude/specs/${feature}/spec.md`, `# Feature Specification: ${feature}\n`);
  writeFile(root, `.dude/specs/${feature}/tasks.md`, [`# Tasks: ${feature}`, '', ...taskLines, ''].join('\n'));
}

/** @param {string} root @param {string[]} lines */
function writeFocusOrder(root, lines) {
  writeFile(root, '.dude/state/focus-order.md', `${lines.join('\n')}\n`);
}

/**
 * Run `fn` against a fresh workspace, always removing it afterwards.
 * @template T
 * @param {(root: string) => T} fn
 * @returns {T}
 */
function withWorkspace(fn) {
  const root = makeRoot();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * A content-addressed snapshot of every entry under `root`. Any created,
 * deleted, or modified file/dir/symlink changes the returned list.
 * @param {string} root
 * @returns {string[]}
 */
function snapshotTree(root) {
  /** @type {string[]} */
  const entries = [];
  /** @param {string} directory @param {string} prefix */
  const visit = (directory, prefix) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        entries.push(`symlink ${relative} -> ${fs.readlinkSync(absolute)}`);
      } else if (stat.isDirectory()) {
        entries.push(`dir ${relative}`);
        visit(absolute, relative);
      } else if (stat.isFile()) {
        entries.push(`file ${relative} ${createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`);
      } else {
        entries.push(`other ${relative}`);
      }
    }
  };
  visit(root, '');
  return entries;
}

/**
 * @param {IdeaRecord[]} ideas
 * @param {string} slug
 * @returns {IdeaRecord}
 */
function recordFor(ideas, slug) {
  const found = ideas.find((idea) => idea.slug === slug);
  assert.ok(found, `expected a collected record for '${slug}'`);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Exactly-one-bucket assignment.
// ---------------------------------------------------------------------------

test('exactly one bucket: a mixed input partitions cleanly across all five buckets', () => {
  // Arrange: a representative input that populates every bucket.
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('active-two', { defined: true, hasInProgress: true }),
    record('blocked-dep', { dependsOn: ['missing-idea'] }),   // unmet dependency
    record('blocked-own', { defined: true, ownBlocked: true }), // own-package evidence
    record('next-one'),                                        // tie-break signal, front
    record('later-one'),                                       // tie-break signal, behind
    record('unordered-one'),                                   // no ordering signal
  ];
  const order = ['next-one', 'later-one'];

  // Act
  const buckets = deriveBuckets({ ideas, order });

  // Assert: buckets are disjoint and their union is exactly the input.
  assertPartition(buckets, ideas.map((idea) => idea.slug));
  // And the input genuinely reaches every bucket (a real mixed case).
  for (const [name, slugs] of Object.entries(buckets)) {
    assert.ok(slugs.length >= 1, `bucket '${name}' should be exercised by this input`);
  }
});

// ---------------------------------------------------------------------------
// 2. Unmet-dependency rule across the four conditions.
// ---------------------------------------------------------------------------

test('unmet-dependency rule: Blocked when a dependency is unmet, not so when met', () => {
  /** A fresh depender that declares exactly one dependency named `dep`. */
  const depender = () => record('depender', { defined: true, dependsOn: ['dep'] });

  // (a) dependency names an idea that is not defined -> unmet -> Blocked.
  let buckets = deriveBuckets({ ideas: [depender(), record('dep', { defined: false })], order: [] });
  assert.ok(buckets.blocked.includes('depender'), 'a not-defined dependency is unmet');

  // (b) dependency is defined but not all tasks are done -> unmet -> Blocked.
  buckets = deriveBuckets({ ideas: [depender(), record('dep', { defined: true, packageComplete: false })], order: [] });
  assert.ok(buckets.blocked.includes('depender'), 'a defined-but-incomplete dependency is unmet');

  // (c) dependency is defined and every task is done -> met -> not Blocked for that reason.
  buckets = deriveBuckets({ ideas: [depender(), record('dep', { defined: true, packageComplete: true })], order: [] });
  assert.equal(buckets.blocked.includes('depender'), false, 'a complete dependency is met');
  assert.ok(buckets.next.includes('depender'), 'a met dependency leaves the idea ready (Next)');
  assertPartition(buckets, ['depender', 'dep']);

  // (d) dependency slug names no idea at all -> unmet -> Blocked.
  buckets = deriveBuckets({ ideas: [record('depender', { defined: true, dependsOn: ['ghost'] })], order: [] });
  assert.ok(buckets.blocked.includes('depender'), 'a dependency naming no idea is unmet');
});

// ---------------------------------------------------------------------------
// 3. Dependency cycle terminates with both endpoints Blocked.
// ---------------------------------------------------------------------------

test('dependency cycle: mutual dependents are both Blocked and derivation terminates', () => {
  // Arrange: A <-> B, neither package complete. Reaching this assertion at all
  // proves termination (no transitive following, so no hang or stack overflow).
  const twoCycle = deriveBuckets({
    ideas: [
      record('a', { defined: true, dependsOn: ['b'] }),
      record('b', { defined: true, dependsOn: ['a'] }),
    ],
    order: [],
  });

  // Assert
  assert.deepEqual(twoCycle.blocked, ['a', 'b']);
  assert.deepEqual(twoCycle.active, []);
  assert.deepEqual(twoCycle.next, []);
  assert.deepEqual(twoCycle.later, []);
  assert.deepEqual(twoCycle.unordered, []);

  // A longer cycle A -> B -> C -> A also terminates with all three Blocked.
  const threeCycle = deriveBuckets({
    ideas: [
      record('a', { defined: true, dependsOn: ['b'] }),
      record('b', { defined: true, dependsOn: ['c'] }),
      record('c', { defined: true, dependsOn: ['a'] }),
    ],
    order: [],
  });
  assert.deepEqual(threeCycle.blocked, ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// 4. Several ideas Active at once, no cap.
// ---------------------------------------------------------------------------

test('several ideas may be Active at once with no cap', () => {
  // Arrange: four in-progress, unblocked ideas — more than the "two or three".
  const ideas = ['w', 'x', 'y', 'z'].map((slug) => record(slug, { defined: true, hasInProgress: true }));

  // Act
  const buckets = deriveBuckets({ ideas, order: [] });

  // Assert
  assert.deepEqual(buckets.active, ['w', 'x', 'y', 'z']);
  assert.deepEqual(buckets.blocked, []);
  assertPartition(buckets, ['w', 'x', 'y', 'z']);
});

// ---------------------------------------------------------------------------
// 5. No-signal ideas land in Unordered.
// ---------------------------------------------------------------------------

test('no-signal ideas land in Unordered; any ordering signal moves an idea out', () => {
  // Arrange:
  //   lonely      -> no dependency, no tie-break position, named by nobody
  //   ordered-one -> gains a signal from the tie-break order
  //   named       -> gains a signal only by being someone else's dependency
  //   namer       -> depends on `named` (which is met, so `namer` is not Blocked)
  const ideas = [
    record('lonely'),
    record('ordered-one'),
    record('named', { defined: true, packageComplete: true }),
    record('namer', { defined: true, dependsOn: ['named'] }),
  ];

  // Act
  const buckets = deriveBuckets({ ideas, order: ['ordered-one'] });

  // Assert
  assert.ok(buckets.unordered.includes('lonely'), 'a no-signal idea is Unordered');
  assert.equal(buckets.unordered.includes('ordered-one'), false, 'a tie-break position is an ordering signal');
  assert.equal(buckets.unordered.includes('named'), false, 'being named as a dependency is an ordering signal');
  assertPartition(buckets, ['lonely', 'ordered-one', 'named', 'namer']);
});

// ---------------------------------------------------------------------------
// 6. RATIFIED: a done package with a stale `blocked-by:` on its `[x]` task
//    is NOT Blocked; a `blocked-by:` on a non-done task and a `[!]` task ARE.
// ---------------------------------------------------------------------------

test('ratified: a done package with a blocked-by on its [x] task is not Blocked', () => {
  withWorkspace((root) => {
    // Arrange: three defined packages straddling the blocking boundary.
    writeIdea(root, 'done-stale', { feature: '900-done-stale' });
    writePackage(root, '900-done-stale', [
      '- [x] T001@aaaaaaaa Groundwork complete',
      '- [x] T002@bbbbbbbb Final step complete',
      '   blocked-by: historical reason recorded while it was once blocked',
    ]);
    writeIdea(root, 'live-block', { feature: '901-live-block' });
    writePackage(root, '901-live-block', [
      '- [ ] T001@cccccccc Still pending',
      '   blocked-by: waiting on an external approval',
    ]);
    writeIdea(root, 'bang-block', { feature: '902-bang-block' });
    writePackage(root, '902-bang-block', [
      '- [!] T001@dddddddd Halted work',
    ]);

    // Act: read the real packages through the FS collector, then derive buckets.
    const { ideas } = collectFocusInputs({ root });
    const buckets = computeFocus({ root });

    // Assert: the stale blocked-by on an already-done task is historical, not a block.
    const doneStale = recordFor(ideas, 'done-stale');
    assert.equal(doneStale.ownBlocked, false, 'a blocked-by on a [x] task must not block');
    assert.equal(doneStale.packageComplete, true, 'an all-[x] package is complete');
    assert.equal(buckets.blocked.includes('done-stale'), false, 'done-stale must not be Blocked');

    // Assert boundary: current blocking evidence still blocks.
    assert.equal(recordFor(ideas, 'live-block').ownBlocked, true, 'a blocked-by on a non-done task blocks');
    assert.equal(recordFor(ideas, 'bang-block').ownBlocked, true, 'a [!] task blocks');
    assert.ok(buckets.blocked.includes('live-block'), 'live-block is Blocked');
    assert.ok(buckets.blocked.includes('bang-block'), 'bang-block is Blocked');
  });
});

// ---------------------------------------------------------------------------
// 7. Tie-break Next/Later from the optional focus-order.md.
// ---------------------------------------------------------------------------

test('tie-break: order front is Next and the rest Later; unknown slug ignored; absence yields no Later', () => {
  withWorkspace((root) => {
    // Arrange: three signal-free drafts whose only ordering signal is the file,
    // plus a `ghost` slug in the file that names no idea.
    writeIdea(root, 'alpha', { status: 'draft' });
    writeIdea(root, 'bravo', { status: 'draft' });
    writeIdea(root, 'charlie', { status: 'draft' });
    writeFocusOrder(root, ['# Focus order', '', '- alpha', '- bravo', '- charlie', '- ghost']);

    // Act
    const withOrder = computeFocus({ root });
    const collected = collectFocusInputs({ root });

    // Assert: the front of the order is Next and the remainder is Later.
    assert.deepEqual(withOrder.next, ['alpha']);
    assert.deepEqual(withOrder.later, ['bravo', 'charlie']);

    // Assert: the unknown slug is read from the file but ignored by the derivation.
    assert.ok(collected.order.includes('ghost'), 'parseFocusOrder keeps the raw slug token');
    const placed = [
      ...withOrder.active, ...withOrder.next, ...withOrder.later, ...withOrder.blocked, ...withOrder.unordered,
    ];
    assert.equal(placed.includes('ghost'), false, 'a slug naming no idea is ignored');

    // Act: remove the optional tie-break file.
    fs.rmSync(path.join(root, '.dude', 'state', 'focus-order.md'));
    const noOrder = computeFocus({ root });

    // Assert: with no tie-break signal, nothing is Later; the ideas fall to Unordered.
    assert.deepEqual(noOrder.later, []);
    assert.deepEqual(noOrder.unordered, ['alpha', 'bravo', 'charlie']);
  });
});

// ---------------------------------------------------------------------------
// 8. parseFocusOrder grammar.
// ---------------------------------------------------------------------------

test('parseFocusOrder reads an ordered slug list, ignoring heading, blank, and non-slug lines', () => {
  // Arrange
  const content = [
    '# Focus Order',   // heading -> ignored
    '',                // blank -> ignored
    '- first-idea',    // dash list item
    '* second-idea',   // star list item
    '1. third-idea',   // ordered list item
    'fourth-idea',     // bare slug
    '## Divider',      // heading -> ignored
    '   ',             // whitespace only -> ignored
    'UPPERCASE NOISE', // starts uppercase -> ignored
    '> blockquote',    // starts with punctuation -> ignored
    'fifth-idea',      // bare slug
  ].join('\n');

  // Act
  const slugs = parseFocusOrder(content);

  // Assert
  assert.deepEqual(slugs, ['first-idea', 'second-idea', 'third-idea', 'fourth-idea', 'fifth-idea']);
});

// ---------------------------------------------------------------------------
// 9. Read-only: collectors write nothing and importing the module runs nothing.
// ---------------------------------------------------------------------------

test('read-only: computeFocus/collectFocusInputs write nothing and import runs nothing', () => {
  withWorkspace((root) => {
    // Arrange: a representative workspace (a defined in-progress package, two
    // drafts, and an optional order file) so every read path is exercised.
    writeIdea(root, 'anchor', { feature: '910-anchor' });
    writePackage(root, '910-anchor', ['- [~] T001@a1b2c3d4 In progress']);
    writeIdea(root, 'follower', { status: 'draft', dependsOn: 'anchor' });
    writeIdea(root, 'lonely', { status: 'draft' });
    writeFocusOrder(root, ['- follower', '- lonely']);
    const before = snapshotTree(root);

    // Act: exercise both filesystem entry points repeatedly.
    collectFocusInputs({ root });
    computeFocus({ root });
    computeFocus({ root });

    // Assert: the workspace tree is byte-for-byte unchanged (no writes).
    assert.deepEqual(snapshotTree(root), before);
  });

  // Act: import the module in a child process where argv has no script path,
  // so the guarded CLI entry must not run.
  const probe = 'const m = await import(process.env.FOCUS_URL);'
    + ' process.stdout.write("EXPORTS:" + Object.keys(m).sort().join(","));';
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
    encoding: 'utf8',
    env: { ...process.env, FOCUS_URL: FOCUS_URL },
  });

  // Assert: clean import, no CLI side effects, and the full export surface present.
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '', 'importing must not write to stderr');
  assert.match(result.stdout, /^EXPORTS:/, 'only the probe output should appear');
  assert.doesNotMatch(result.stdout, /Active:|Usage:/, 'the guarded CLI entry must not run on import');
  for (const name of [
    'collectFocusInputs', 'computeFocus', 'deriveBuckets', 'parseArgs', 'parseFocusOrder', 'renderBuckets', 'run',
  ]) {
    assert.ok(result.stdout.includes(name), `export '${name}' should be present`);
  }
});

// ===========================================================================
// Renderer tests for `focus.mjs` (canonical task T003@64726177, Feature 024).
// Appended to the T002 suite above; those cases are unchanged. Covers exactly
// the plan `## Chosen Design` section 8 renderer items (FR-008 through FR-011):
//
//   1. kanban lanes equal the text buckets for the same input (five lanes in a
//      fixed order, empty lanes kept, one card per slug, defined ideas carry a
//      spec-number annotation while drafts do not)
//   2. flowchart nodes and edges equal the feature's literal `deps:` (one node
//      per task via `safeMermaidId`, one edge per dep-to-known-target, direction
//      `from-->to` meaning from-depends-on-to), over `parseTasks` output
//   3. a dangling `deps:` target is noted as a `%%` comment and never drawn as
//      an edge; `renderFlowchart` does not throw
//   4. a draft-without-package / unknown slug / missing slug via the CLI fails
//      cleanly (non-zero exit, clear message, no stack, no writes)
//   5. both renderers are pure string functions that write nothing; the CLI
//      kanban and flowchart paths leave the workspace byte-for-byte unchanged
//   6. `safeMermaidId` maps `@` and other non-alphanumerics to `_` and leaves
//      alphanumerics intact
//
// Items 1-3 and 6 drive the PURE exports directly (item 2/3 feed them real
// `parseTasks` output so the shape matches production exactly). Items 4-5 spawn
// the source `focus.mjs` against a throwaway workspace and reuse the existing
// snapshot helper to prove zero writes. Mermaid validity was confirmed by the
// coder out-of-band, so these assert block STRUCTURE and the ```mermaid fence
// only — no mermaid dependency is installed.
//
// @see .dude/specs/024-feature-focus-order/plan.md sections 5, 6, and 8.
// ===========================================================================

/**
 * Parse a rendered Mermaid `kanban` into its ordered lanes and their cards.
 * Lane headers carry a 2-space indent (`  laneId[Title]`); cards a 4-space
 * indent (`    slug[cardText]`).
 * @param {string} diagram
 * @returns {{ fenced: boolean, lanes: { id: string, title: string, cards: { slug: string, text: string }[] }[] }}
 */
function parseKanban(diagram) {
  const lines = diagram.split('\n');
  const fenced = lines[0] === '```mermaid' && lines[1] === 'kanban' && lines.includes('```');
  /** @type {{ id: string, title: string, cards: { slug: string, text: string }[] }[]} */
  const lanes = [];
  /** @type {{ id: string, title: string, cards: { slug: string, text: string }[] } | null} */
  let current = null;
  const laneRe = /^ {2}([a-z]+)\[([^\]]*)\]$/;
  const cardRe = /^ {4}([^[\]]+)\[([^\]]*)\]$/;
  for (const line of lines) {
    const lane = laneRe.exec(line);
    if (lane) {
      current = { id: lane[1], title: lane[2], cards: [] };
      lanes.push(current);
      continue;
    }
    const card = cardRe.exec(line);
    if (card && current) current.cards.push({ slug: card[1], text: card[2] });
  }
  return { fenced, lanes };
}

/**
 * Parse a rendered Mermaid `flowchart` into node ids/labels, edges, and `%%`
 * comment lines. Nodes are `  <id>["<label>"]`, edges `  <from> --> <to>`, and
 * comments (the optional title plus dangling-dep notes) start with `%%`.
 * @param {string} diagram
 * @returns {{ fenced: boolean, header: boolean, nodes: { id: string, label: string }[], edges: { from: string, to: string }[], notes: string[] }}
 */
function parseFlowchart(diagram) {
  const lines = diagram.split('\n');
  const fenced = lines[0] === '```mermaid' && lines.includes('```');
  const header = lines[1] === 'flowchart TD';
  /** @type {{ id: string, label: string }[]} */
  const nodes = [];
  /** @type {{ from: string, to: string }[]} */
  const edges = [];
  /** @type {string[]} */
  const notes = [];
  const nodeRe = /^ {2}([A-Za-z0-9_]+)\["([^"]*)"\]$/;
  const edgeRe = /^ {2}([A-Za-z0-9_]+) --> ([A-Za-z0-9_]+)$/;
  for (const line of lines) {
    const edge = edgeRe.exec(line);
    if (edge) {
      edges.push({ from: edge[1], to: edge[2] });
      continue;
    }
    const node = nodeRe.exec(line);
    if (node) {
      nodes.push({ id: node[1], label: node[2] });
      continue;
    }
    if (/^ {2}%%/.test(line)) notes.push(line.trim());
  }
  return { fenced, header, nodes, edges, notes };
}

/**
 * Assert stderr is a clean, handled message rather than an uncaught exception:
 * no Node stack frame and no thrown-`Error` banner leaked to the user.
 * @param {string} stderr
 */
function assertNoStack(stderr) {
  assert.doesNotMatch(stderr, /^\s+at /m, 'stderr must not contain a stack frame');
  assert.doesNotMatch(stderr, /\b\w*Error\b/, 'stderr must not surface a thrown Error');
}

// ---------------------------------------------------------------------------
// 1. Kanban lanes equal the text buckets for the SAME input.
// ---------------------------------------------------------------------------

test('renderer: kanban lanes equal the text buckets for the same input; one card per slug; defined ideas annotated, drafts not', () => {
  // Arrange: a mixed input that reaches all five buckets, with a deliberate mix
  // of defined and draft ideas. The annotation is supplied through `meta`,
  // exactly as the CLI builds it for defined ideas (a `spec-<number>` string).
  const ideas = [
    record('active-one', { defined: true, hasInProgress: true }),
    record('active-two', { defined: true, hasInProgress: true }),
    record('blocked-dep', { dependsOn: ['missing-idea'] }),      // draft, unmet dependency
    record('blocked-own', { defined: true, ownBlocked: true }),  // defined, own-package block
    record('next-one'),                                          // draft, tie-break front
    record('later-one'),                                         // draft, tie-break behind
    record('unordered-one'),                                     // draft, no ordering signal
  ];
  const order = ['next-one', 'later-one'];
  // The SAME buckets object drives both the text and kanban views.
  const buckets = deriveBuckets({ ideas, order });
  // meta mirrors the CLI: only the DEFINED ideas carry a spec-number annotation.
  const meta = new Map([
    ['active-one', 'spec-100'],
    ['active-two', 'spec-101'],
    ['blocked-own', 'spec-102'],
  ]);

  // Act
  const text = renderBuckets(buckets);
  const kanban = renderKanban(buckets, meta);
  const parsed = parseKanban(kanban);

  // Assert: a fenced ```mermaid kanban block (structural fence only; no dep).
  assert.ok(parsed.fenced, 'kanban must be a fenced ```mermaid kanban block');

  // Assert: exactly five lanes, in the fixed section-3 order, kept even so.
  assert.deepEqual(
    parsed.lanes.map((lane) => lane.id),
    ['active', 'next', 'later', 'blocked', 'unordered'],
    'five lanes in the fixed focus-bucket order',
  );
  assert.deepEqual(
    parsed.lanes.map((lane) => lane.title),
    ['Active', 'Next', 'Later', 'Blocked', 'Unordered'],
    'lane titles match the bucket names',
  );

  // Assert: each lane's card slug set equals the matching bucket's slug set.
  const laneById = new Map(parsed.lanes.map((lane) => [lane.id, lane]));
  /** @type {[string, string[]][]} */
  const laneBuckets = [
    ['active', buckets.active],
    ['next', buckets.next],
    ['later', buckets.later],
    ['blocked', buckets.blocked],
    ['unordered', buckets.unordered],
  ];
  for (const [id, slugs] of laneBuckets) {
    const cardSlugs = (laneById.get(id)?.cards ?? []).map((card) => card.slug);
    assert.deepEqual([...cardSlugs].sort(), [...slugs].sort(), `lane '${id}' cards must equal bucket '${id}'`);
  }

  // Assert: exactly one card per slug across the board, equal to the input set.
  const allCardSlugs = parsed.lanes.flatMap((lane) => lane.cards.map((card) => card.slug));
  assert.equal(allCardSlugs.length, ideas.length, 'exactly one card per idea (no duplicates, none dropped)');
  assert.deepEqual(
    [...new Set(allCardSlugs)].sort(),
    ideas.map((idea) => idea.slug).sort(),
    'the union of cards equals the input slugs',
  );

  // Assert: a defined idea's card carries its spec-number annotation; a draft's
  // card is the bare slug with no annotation.
  /** @param {string} slug */
  const cardText = (slug) => {
    const found = parsed.lanes.flatMap((lane) => lane.cards).find((card) => card.slug === slug);
    assert.ok(found, `expected a card for '${slug}'`);
    return found.text;
  };
  assert.equal(cardText('active-one'), 'active-one spec-100', 'a defined idea card carries its spec number');
  assert.equal(cardText('blocked-own'), 'blocked-own spec-102', 'a defined idea card carries its spec number');
  assert.equal(cardText('next-one'), 'next-one', 'a draft card has no annotation');
  assert.equal(cardText('unordered-one'), 'unordered-one', 'a draft card has no annotation');

  // Assert: the text view over the SAME buckets names the same slugs.
  for (const slug of allCardSlugs) assert.ok(text.includes(slug), `the text view must also list '${slug}'`);

  // Assert: empty lanes are still emitted, in the same fixed order.
  const sparse = parseKanban(renderKanban(
    { active: ['solo'], next: [], later: [], blocked: [], unordered: [] },
    new Map(),
  ));
  assert.deepEqual(
    sparse.lanes.map((lane) => lane.id),
    ['active', 'next', 'later', 'blocked', 'unordered'],
    'all five lanes are kept even when empty',
  );
  assert.deepEqual(sparse.lanes.find((lane) => lane.id === 'next')?.cards, [], 'an empty lane has no cards');
});

// ---------------------------------------------------------------------------
// 2. Flowchart nodes and edges equal the feature's literal deps.
// ---------------------------------------------------------------------------

test('renderer: flowchart has one node per task and one edge per literal dep-to-known-target, direction from-->to', () => {
  // Arrange: a real tasks.md with a linear chain (T001 <- T002, T003 <- T004)
  // and a comma-separated multi-dep (T003 deps: T001, T002). parseTasks shapes
  // the list exactly as production feeds renderFlowchart.
  const md = [
    '# Tasks: chain',
    '',
    '- [ ] T001@6b656570 Keep the base',
    '- [~] T002@6c6f6f6b Look around',
    '   deps: T001@6b656570',
    '- [ ] T003@64726177 Draw the thing',
    '   deps: T001@6b656570, T002@6c6f6f6b',
    '- [ ] T004@636c6f73 Close it out',
    '   deps: T003@64726177',
    '',
  ].join('\n');
  const { tasks, warnings } = parseTasks(md, { path: '.dude/specs/900-chain/tasks.md' });
  assert.deepEqual(warnings, [], 'the fixture has no dangling deps or malformed lines');

  // Act
  const chart = renderFlowchart(tasks, { slug: 'chain', feature: '900-chain' });
  const parsed = parseFlowchart(chart);

  // Assert: a fenced ```mermaid flowchart TD block.
  assert.ok(parsed.fenced && parsed.header, 'flowchart must be a fenced ```mermaid flowchart TD block');

  // Assert: exactly one node per task, ids via safeMermaidId, full durable id
  // preserved in the label (FR-011 identity, never a package number).
  const expectedNodeIds = tasks.map((task) => safeMermaidId(task.id));
  assert.equal(parsed.nodes.length, tasks.length, 'exactly one node per task');
  assert.deepEqual(
    parsed.nodes.map((node) => node.id).sort(),
    [...expectedNodeIds].sort(),
    'node ids are safeMermaidId(task.id)',
  );
  for (const task of tasks) {
    const node = parsed.nodes.find((candidate) => candidate.id === safeMermaidId(task.id));
    assert.ok(node, `a node exists for ${task.id}`);
    assert.ok(node.label.includes(task.id), 'the node label keeps the full durable id (FR-011)');
  }

  // Assert: exactly one edge per literal dep-to-known-target, direction from-->to.
  const expectedEdges = [
    { from: 'T002@6c6f6f6b', to: 'T001@6b656570' },  // chain link
    { from: 'T003@64726177', to: 'T001@6b656570' },  // multi-dep, first target
    { from: 'T003@64726177', to: 'T002@6c6f6f6b' },  // multi-dep, second target
    { from: 'T004@636c6f73', to: 'T003@64726177' },  // chain link
  ].map((edge) => `${safeMermaidId(edge.from)} --> ${safeMermaidId(edge.to)}`).sort();
  const actualEdges = parsed.edges.map((edge) => `${edge.from} --> ${edge.to}`).sort();
  assert.deepEqual(actualEdges, expectedEdges, 'edges equal the literal deps: one per dep, from depends on to');
  assert.equal(parsed.edges.length, 4, 'no extra edges beyond the literal deps');

  // Assert: direction is from-depends-on-to, not reversed.
  const dependerFirst = `${safeMermaidId('T002@6c6f6f6b')} --> ${safeMermaidId('T001@6b656570')}`;
  const reversed = `${safeMermaidId('T001@6b656570')} --> ${safeMermaidId('T002@6c6f6f6b')}`;
  assert.ok(actualEdges.includes(dependerFirst), 'T002 (depends-on) --> T001 (dependency)');
  assert.equal(actualEdges.includes(reversed), false, 'the edge is not reversed');

  // Assert: an all-known-deps chart carries no dangling-dep notes.
  assert.deepEqual(
    parsed.notes.filter((note) => note.startsWith('%% note:')),
    [],
    'no dangling-dep notes for a clean chart',
  );
});

// ---------------------------------------------------------------------------
// 3. A dangling deps target is noted, not drawn, and does not throw.
// ---------------------------------------------------------------------------

test('renderer: a dangling deps target is noted as a %% comment and never drawn as an edge; renderFlowchart does not throw', () => {
  // Arrange: T002 declares one KNOWN dep (T001) and one dangling dep (T999,
  // which names no task in the file), mirroring parseTasks' own warning path.
  const md = [
    '# Tasks: dangling',
    '',
    '- [ ] T001@6b656570 Root',
    '- [ ] T002@6c6f6f6b Depends on root and a ghost',
    '   deps: T001@6b656570, T999@6d697373',
    '',
  ].join('\n');
  const { tasks, warnings } = parseTasks(md, { path: '.dude/specs/901-dangling/tasks.md' });
  assert.ok(warnings.some((warning) => warning.includes('T999@6d697373')), 'parseTasks warns on the dangling target');

  // Act: rendering must not throw on a dangling target.
  /** @type {string} */
  let chart = '';
  assert.doesNotThrow(() => {
    chart = renderFlowchart(tasks, { slug: 'dangling', feature: '901-dangling' });
  }, 'renderFlowchart must not throw on a dangling deps target');
  const parsed = parseFlowchart(chart);

  // Assert: two nodes (the unknown target adds none) and exactly one edge, to
  // the KNOWN target only.
  assert.equal(parsed.nodes.length, 2, 'one node per task; the unknown target adds no node');
  assert.deepEqual(
    parsed.edges.map((edge) => `${edge.from} --> ${edge.to}`),
    [`${safeMermaidId('T002@6c6f6f6b')} --> ${safeMermaidId('T001@6b656570')}`],
    'only the known-target edge is drawn',
  );

  // Assert: the dangling target is NOTED (a %% comment mentioning it) and never
  // appears as an edge endpoint.
  const ghost = safeMermaidId('T999@6d697373');
  assert.ok(
    parsed.notes.some((note) => note.startsWith('%% note:') && note.includes('T999@6d697373')),
    'the dangling target is noted as a %% comment',
  );
  assert.equal(chart.includes(`--> ${ghost}`), false, 'no edge points at the unknown target');
  assert.equal(chart.includes(`${ghost} -->`), false, 'the unknown target originates no edge');
});

// ---------------------------------------------------------------------------
// 4. CLI: unknown slug / draft-without-package / missing slug fail cleanly.
// ---------------------------------------------------------------------------

test('renderer CLI: unknown slug, draft-without-package, and missing slug fail cleanly with no throw and no writes', () => {
  withWorkspace((root) => {
    // Arrange: one real defined package plus a draft-only idea (no package).
    writeIdea(root, 'charter', { feature: '920-charter' });
    writePackage(root, '920-charter', [
      '- [ ] T001@6b656570 Keep the base',
      '- [~] T002@6c6f6f6b Look around',
      '   deps: T001@6b656570',
    ]);
    writeIdea(root, 'draft-only', { status: 'draft' });
    const before = snapshotTree(root);

    /** @param {string[]} args @returns {import('node:child_process').SpawnSyncReturns<string>} */
    const runCli = (args) => spawnSync(process.execPath, [FOCUS_PATH, ...args, '--root', root], { encoding: 'utf8' });

    // (a) unknown slug -> non-zero, clear [FAIL], empty stdout, no stack.
    const unknown = runCli(['flowchart', 'no-such-idea']);
    assert.notEqual(unknown.status, 0, 'an unknown slug exits non-zero');
    assert.equal(unknown.stdout, '', 'an unknown slug emits nothing to stdout');
    assert.match(unknown.stderr, /\[FAIL\] idea 'no-such-idea' has no defined package to chart/);
    assertNoStack(unknown.stderr);

    // (b) draft-without-package -> the same clean, handled failure.
    const draft = runCli(['flowchart', 'draft-only']);
    assert.notEqual(draft.status, 0, 'a draft-without-package exits non-zero');
    assert.equal(draft.stdout, '', 'a draft-without-package emits nothing to stdout');
    assert.match(draft.stderr, /\[FAIL\] idea 'draft-only' has no defined package to chart/);
    assertNoStack(draft.stderr);

    // (c) flowchart with no slug -> a clean usage failure.
    const noSlug = runCli(['flowchart']);
    assert.notEqual(noSlug.status, 0, 'a missing slug exits non-zero');
    assert.equal(noSlug.stdout, '', 'a missing slug emits nothing to stdout');
    assert.match(noSlug.stderr, /\[FAIL\] flowchart requires an idea slug/);
    assertNoStack(noSlug.stderr);

    // Assert: none of the failed CLI runs wrote anything to the workspace.
    assert.deepEqual(snapshotTree(root), before, 'a failed flowchart run must not write');
  });
});

// ---------------------------------------------------------------------------
// 5. Both renderers write nothing; the CLI kanban/flowchart paths are byte-safe.
// ---------------------------------------------------------------------------

test('renderer: pure renderers return strings and write nothing; CLI kanban and flowchart leave the workspace byte-identical', () => {
  // Part 1 (pure): both renderers are pure string functions and touch no FS.
  withWorkspace((root) => {
    const before = snapshotTree(root);
    const kanban = renderKanban(
      { active: ['a'], next: [], later: [], blocked: [], unordered: ['b'] },
      new Map([['a', 'spec-1']]),
    );
    const { tasks } = parseTasks('# Tasks: t\n\n- [ ] T001@6b656570 Root\n', { path: '.dude/specs/902-t/tasks.md' });
    const flowchart = renderFlowchart(tasks, { slug: 't', feature: '902-t' });

    assert.equal(typeof kanban, 'string', 'renderKanban returns a string');
    assert.equal(typeof flowchart, 'string', 'renderFlowchart returns a string');
    assert.ok(kanban.length > 0 && flowchart.length > 0, 'both renderers produce output');
    assert.deepEqual(snapshotTree(root), before, 'pure renderers write nothing');
  });

  // Part 2 (CLI): the read-only kanban and flowchart subcommands emit fenced
  // mermaid and leave the workspace byte-for-byte unchanged (FR-010).
  withWorkspace((root) => {
    writeIdea(root, 'charter', { feature: '920-charter' });
    writePackage(root, '920-charter', [
      '- [ ] T001@6b656570 Keep the base',
      '- [~] T002@6c6f6f6b Look around',
      '   deps: T001@6b656570',
      '- [ ] T003@64726177 Draw the thing',
      '   deps: T001@6b656570, T002@6c6f6f6b',
    ]);
    writeIdea(root, 'draft-only', { status: 'draft' });
    const before = snapshotTree(root);

    // kanban path.
    const kanban = spawnSync(process.execPath, [FOCUS_PATH, 'kanban', '--root', root], { encoding: 'utf8' });
    assert.equal(kanban.status, 0, kanban.stderr);
    assert.equal(kanban.stderr, '', 'kanban writes nothing to stderr');
    const parsedKanban = parseKanban(kanban.stdout);
    assert.equal(parsedKanban.fenced, true, 'kanban emits a fenced ```mermaid block');

    // End-to-end card annotation (guards runKanban's `spec-${number}` derivation
    // through a real spawn, not a hand-built meta): the CLI reads each DEFINED
    // idea's real `spec_path` and appends its derived `spec-<number>` to that
    // idea's card, while a DRAFT idea (no `spec_path`) carries the bare slug with
    // no annotation. `charter`'s spec_path is `.dude/specs/920-charter/spec.md`,
    // so its card must read `charter spec-920`; `draft-only` must read `draft-only`.
    const cliCardText = (slug) => {
      const found = parsedKanban.lanes.flatMap((lane) => lane.cards).find((card) => card.slug === slug);
      assert.ok(found, `expected a kanban card for '${slug}'`);
      return found.text;
    };
    assert.equal(cliCardText('charter'), 'charter spec-920', "the defined idea's card carries its real spec-920 annotation");
    assert.equal(cliCardText('draft-only'), 'draft-only', 'a draft idea card carries no annotation');

    // flowchart path.
    const flow = spawnSync(process.execPath, [FOCUS_PATH, 'flowchart', 'charter', '--root', root], { encoding: 'utf8' });
    assert.equal(flow.status, 0, flow.stderr);
    assert.equal(flow.stderr, '', 'flowchart writes nothing to stderr');
    const flowParsed = parseFlowchart(flow.stdout);
    assert.ok(flowParsed.fenced && flowParsed.header, 'flowchart emits a fenced ```mermaid flowchart TD block');
    assert.equal(flowParsed.nodes.length, 3, 'one node per task in the charted feature');

    // FR-010: the entire workspace tree is byte-for-byte unchanged.
    assert.deepEqual(snapshotTree(root), before, 'kanban and flowchart must not write');
  });
});

// ---------------------------------------------------------------------------
// 6. safeMermaidId maps non-alphanumerics to `_` and keeps alphanumerics.
// ---------------------------------------------------------------------------

test('renderer: safeMermaidId maps @ and other non-alphanumerics to _ and leaves alphanumerics intact', () => {
  // Arrange / Act / Assert: the documented durable-id -> node-id mapping.
  assert.equal(safeMermaidId('T001@6b656570'), 'T001_6b656570', '@ becomes _');
  assert.equal(safeMermaidId('abcXYZ0189'), 'abcXYZ0189', 'alphanumerics are untouched');
  assert.equal(safeMermaidId('a b.c-d@e/f'), 'a_b_c_d_e_f', 'every non-alphanumeric becomes _');
  assert.equal(safeMermaidId('@@@'), '___', 'each non-alphanumeric maps to its own _');
  assert.equal(safeMermaidId(''), '', 'an empty id stays empty');
  // Distinct valid task ids stay distinct (their only non-alphanumeric is `@`).
  assert.notEqual(
    safeMermaidId('T001@6b656570'),
    safeMermaidId('T002@6b656570'),
    'distinct task ids map to distinct node ids',
  );
});
